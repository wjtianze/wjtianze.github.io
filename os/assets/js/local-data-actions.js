/* ============================================================
 * 天择网站内助手：本地数据确认与写入核心
 *
 * 约束：
 * 1. 模型只能生成方案，不能调用本模块确认或执行；
 * 2. 可执行的原始方案只保存在当前页面的私有 Map 中；
 * 3. 执行前必须在原存储中重新读取并与方案生成时的完整状态比较；
 * 4. 只执行数据中心登记过的白名单操作；永不读取天择OS 状态，
 *    英语接口配置只作原样保留，不进入模型、预览或回执。
 * ============================================================ */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TZLocalDataActions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const PLAN_TTL_MS = 10 * 60 * 1000;
  const MAX_PENDING_PLANS = 8;
  const MAX_SPENT_RECEIPTS = 64;
  const COC_KEY = 'tz_coc_village';
  const COC_KEYS = Object.freeze({
    village: COC_KEY,
    snapshot: 'tz_coc_snapshot_v2',
    damage: 'tz_coc_dmgcalc_v1',
    planner: 'tz_coc_planner_v1',
    army_priority: 'tz_coc_army_priority_v1'
  });
  const APPEARANCE_KEYS = Object.freeze(['tz_site_palette', 'tz_site_theme', 'tz_palette', 'tianze_site_palette']);
  const PALETTES = Object.freeze(['cold', 'mid', 'warm', 'porcelain', 'ink']);
  const VISIT_HISTORY_KEY = 'tz_site_visit_history_v1';
  const ENGLISH_META_KEY = 'tzwords_meta_v1';
  const LEARNING_PREFIXES = Object.freeze(['tlh_', 'tlhL']);
  const WORDS_DB = 'tzwords';
  const WORDS_STORE = 'kv';
  const WORDS_KEY = 'vocab';
  const RECORDS_KEY = 'records';
  const REVISION_KEY = 'tz_local_data_revision_v1';
  const REVISION_CHANNEL = 'tz-local-data-revision';
  const WORD_FIELDS = Object.freeze(['word', 'phonetic', 'pos', 'meaning', 'examples', 'tags']);
  const ALLOWED = Object.freeze({
    settings: Object.freeze({
      set_appearance: 'appearance-update',
      clear_appearance: 'appearance-update',
      update_visit_history_entry: 'update-visit-history-entry',
      remove_visit_history_entry: 'remove-visit-history-entry',
      clear_visit_history: 'clear-visit-history'
    }),
    coc: Object.freeze({
      replace_village: 'replace', update_village: 'json-patch', clear_village: 'remove',
      replace_snapshot: 'replace', update_snapshot: 'json-patch', clear_snapshot: 'remove',
      replace_damage: 'replace', update_damage: 'json-patch', clear_damage: 'remove',
      replace_planner: 'replace', update_planner: 'json-patch', clear_planner: 'remove',
      replace_army_priority: 'replace', update_army_priority: 'json-patch', clear_army_priority: 'remove'
    }),
    english: Object.freeze({
      add_word: 'add-word', update_word: 'update-word', remove_word: 'remove-word', clear_wordbook: 'clear-wordbook',
      update_word_record: 'update-word-record', clear_word_record: 'clear-word-record',
      update_english_meta: 'english-meta-patch', clear_english_progress: 'clear-english-progress'
    }),
    learning: Object.freeze({
      replace_learning_progress: 'replace', update_learning_progress: 'json-patch', clear_learning_progress: 'remove'
    })
  });

  function own(value, key) {
    return !!value && Object.prototype.hasOwnProperty.call(value, key);
  }

  function cloneJson(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function stableStringify(value, seen) {
    const visited = seen || new WeakSet();
    if (value === undefined) return '"[undefined]"';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (visited.has(value)) throw new Error('本地数据包含循环引用，不能安全修改');
    visited.add(value);
    let text;
    if (Array.isArray(value)) {
      text = '[' + value.map(item => stableStringify(item, visited)).join(',') + ']';
    } else {
      text = '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableStringify(value[key], visited)).join(',') + '}';
    }
    visited.delete(value);
    return text;
  }

  function quickDigestFromStable(text) {
    let left = 2166136261;
    let right = 5381;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      left ^= code;
      left = Math.imul(left, 16777619);
      right = Math.imul(right, 33) ^ code;
    }
    return 'state-' + (left >>> 0).toString(16).padStart(8, '0') + (right >>> 0).toString(16).padStart(8, '0') + '-' + text.length;
  }

  function digest(value) {
    return quickDigestFromStable(stableStringify(value));
  }

  function localFingerprint(value) {
    const text = stableStringify(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return 'fnv1a-' + (hash >>> 0).toString(16).padStart(8, '0') + '-' + text.length;
  }

  function forbiddenField(key) {
    const compact = String(key == null ? '' : key).replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (!compact) return false;
    if (['key', 'apikey', 'token', 'accesstoken', 'refreshtoken', 'authtoken', 'authorization',
      'credential', 'credentials', 'secret', 'password', 'cookie', 'cookies', 'sessioncookie',
      'sessionid', 'jwt', 'bearer'].includes(compact)) return true;
    return /(?:api|openai|deepseek|anthropic|qwen|glm|kimi|mimo)key$/.test(compact) ||
      /(?:access|refresh|auth|bearer)token$/.test(compact) || /(?:client)?secret$/.test(compact) ||
      /password$/.test(compact) || /cookie$/.test(compact) || /sessionid$/.test(compact) || /jwt$/.test(compact);
  }

  function assertSafeValue(value, depth, seen) {
    const level = Number(depth) || 0;
    const visited = seen || new WeakSet();
    if (level > 16) throw new Error('修改内容嵌套过深');
    if (value === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value)) return;
    if (!value || typeof value !== 'object') throw new Error('修改内容必须是普通 JSON 数据');
    if (visited.has(value)) throw new Error('修改内容含循环引用');
    visited.add(value);
    if (Array.isArray(value)) value.forEach(item => assertSafeValue(item, level + 1, visited));
    else Object.keys(value).forEach(key => {
      if (['__proto__', 'prototype', 'constructor'].includes(key) || forbiddenField(key)) {
        throw new Error('修改内容包含禁止字段：' + key);
      }
      assertSafeValue(value[key], level + 1, visited);
    });
    visited.delete(value);
  }

  function displayText(value, max) {
    let text;
    if (typeof value === 'string') text = value;
    else {
      try { text = JSON.stringify(value, null, 2); }
      catch (_) { text = String(value); }
    }
    const limit = Math.max(40, Number(max) || 12000);
    return text.length > limit ? text.slice(0, limit) + '\n…（内容过长，显示已截断；执行仍使用内存中的完整方案）' : text;
  }

  function planError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function rejectExecutionControls(value, depth) {
    const level = Number(depth) || 0;
    if (level > 16 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(item => rejectExecutionControls(item, level + 1));
      return;
    }
    Object.keys(value).forEach(key => {
      const compact = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (['confirmed', 'confirm', 'approved', 'approval', 'apply', 'execute', 'executed', 'write', 'written'].includes(compact)) {
        throw planError('model-confirmation-rejected', '模型参数不能代替用户确认');
      }
      rejectExecutionControls(value[key], level + 1);
    });
  }

  function ensurePlanShape(plan, args) {
    if (!plan || typeof plan !== 'object' || plan.kind !== 'tianze-local-data-change-plan' ||
        plan.status !== 'pending-confirmation' || plan.confirmationRequired !== true) {
      throw planError('invalid-plan', '本地数据修改方案无效');
    }
    const moduleId = String(plan.module || '');
    const operation = String(plan.operation || '');
    const expectedKind = ALLOWED[moduleId] && ALLOWED[moduleId][operation];
    if (!expectedKind || !plan.mutation || plan.mutation.kind !== expectedKind) {
      throw planError('operation-not-allowed', '本地数据操作不在允许清单中');
    }
    if (!args || typeof args !== 'object' || String(args.module || '') !== moduleId || String(args.operation || '') !== operation) {
      throw planError('plan-mismatch', '修改方案与原始工具参数不一致');
    }
    rejectExecutionControls(args, 0);
    const planId = String(plan.planId || '');
    if (!/^local-plan-[A-Za-z0-9._:-]{1,160}$/.test(planId)) throw planError('invalid-plan-id', '修改方案编号无效');
    return { planId, moduleId, operation };
  }

  function normalizedRaw(raw) {
    return raw === null || raw === undefined || raw === '' ? null : String(raw);
  }

  function parseJsonRaw(raw, label, options) {
    const text = normalizedRaw(raw);
    if (text === null) return { exists: false, raw: null, value: null, valid: true };
    try {
      const value = JSON.parse(text);
      const opts = options || {};
      if (opts.objectOnly && (!value || typeof value !== 'object' || Array.isArray(value))) {
        throw new Error('顶层不是对象');
      }
      if (opts.containerOnly && (!value || typeof value !== 'object')) throw new Error('顶层不是对象或数组');
      return { exists: true, raw: text, value, valid: true };
    } catch (error) {
      if (options && options.allowInvalid) return { exists: true, raw: text, value: null, valid: false };
      throw planError('invalid-current-data', '当前' + label + '不是有效 JSON：' + error.message);
    }
  }

  function assertExactKey(value, expected, label) {
    if (String(value == null ? '' : value) !== expected) {
      throw planError('key-not-allowed', (label || '存储项') + '不在允许清单中');
    }
  }

  function assertPreconditionKey(plan, expected) {
    const precondition = plan && plan.precondition;
    if (!precondition || typeof precondition !== 'object' || Array.isArray(precondition)) {
      throw planError('invalid-precondition', '修改方案缺少完整状态前置条件');
    }
    assertExactKey(precondition.key, expected, '前置条件存储项');
    return precondition;
  }

  function assertFingerprint(precondition, currentValue) {
    if (precondition.fingerprint === null && precondition.exists === false && currentValue === null) return;
    if (typeof precondition.fingerprint !== 'string' || precondition.fingerprint !== localFingerprint(currentValue)) {
      throw planError('stale', '方案前置状态与当前数据不一致，请重新生成修改方案');
    }
  }

  function parseCocRaw(raw) {
    if (raw === null || raw === undefined || raw === '') return { exists: false, raw: null, value: null };
    try {
      const value = JSON.parse(String(raw));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('存档顶层不是对象');
      return { exists: true, raw: String(raw), value };
    } catch (error) {
      throw planError('invalid-current-data', '当前 COC 村庄存档不是有效 JSON：' + error.message);
    }
  }

  function villagePayload(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    let value = own(record, 'village') ? record.village : record;
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch (_) { return null; }
    }
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  }

  function villageSummary(record) {
    const village = villagePayload(record);
    if (!village) return '无有效村庄数据';
    const count = name => Array.isArray(village[name]) ? village[name].length : 0;
    let townHall = Number(record && record.th) || 0;
    if (!townHall && Array.isArray(village.buildings)) {
      const hall = village.buildings.find(item => item && Number(item.data) === 1000001);
      townHall = Number(hall && (hall.lvl !== undefined ? hall.lvl : hall.level)) || 0;
    }
    return [
      townHall ? '家乡村庄大本营 ' + townHall + ' 级' : '家乡村庄大本营等级未知',
      '建筑 ' + count('buildings'),
      '兵种 ' + (Array.isArray(village.units) ? village.units.length : count('troops')),
      '英雄 ' + count('heroes'),
      '法术 ' + count('spells')
    ].join(' · ');
  }

  function normalizePath(value) {
    if (!Array.isArray(value) || !value.length || value.length > 12) throw planError('invalid-path', '村庄修改路径无效');
    return value.map(segment => {
      if (Number.isInteger(segment) && segment >= 0 && segment <= 100000) return segment;
      const text = String(segment == null ? '' : segment).trim();
      if (!text || text.length > 80 || ['__proto__', 'prototype', 'constructor'].includes(text) || forbiddenField(text)) {
        throw planError('invalid-path', '村庄修改路径包含禁止字段');
      }
      return text;
    });
  }

  function valueAtPath(rootValue, path) {
    let owner = rootValue;
    for (let index = 0; index < path.length - 1; index += 1) {
      if (!owner || typeof owner !== 'object' || !own(owner, path[index])) throw planError('missing-path', '村庄修改路径不存在：' + path.join('.'));
      owner = owner[path[index]];
    }
    const leaf = path[path.length - 1];
    if (!owner || typeof owner !== 'object' || !own(owner, leaf)) throw planError('missing-path', '村庄修改路径不存在：' + path.join('.'));
    return { owner, leaf, value: owner[leaf] };
  }

  function applyPlannedChanges(current, changes, requiredRoot, label) {
    if (!current || typeof current !== 'object') throw planError('invalid-current-data', '当前' + label + '不能局部修改');
    if (!Array.isArray(changes) || !changes.length || changes.length > 20) {
      throw planError('invalid-mutation', label + '局部修改必须包含 1 至 20 项');
    }
    const working = cloneJson(current);
    const rows = [];
    changes.forEach((change, index) => {
      if (!change || typeof change !== 'object' || !own(change, 'path')) {
        throw planError('invalid-mutation', '第 ' + (index + 1) + ' 项' + label + '修改无效');
      }
      const path = normalizePath(change.path);
      if (requiredRoot && path[0] !== requiredRoot) throw planError('invalid-path', label + '修改路径必须从 ' + requiredRoot + ' 开始');
      const target = valueAtPath(working, path);
      const expectedBefore = own(change, 'rawBefore') ? change.rawBefore : change.before;
      const proposed = own(change, 'rawValue') ? change.rawValue : change.after;
      if (!own(change, 'rawValue') && !own(change, 'after')) throw planError('invalid-mutation', label + '修改缺少新值');
      if (own(change, 'rawBefore') || own(change, 'before')) {
        if (stableStringify(target.value) !== stableStringify(expectedBefore)) {
          throw planError('stale', label + '修改路径的原值已变化，请重新生成方案');
        }
      }
      assertSafeValue(proposed, 0);
      const before = cloneJson(target.value);
      const after = cloneJson(proposed);
      target.owner[target.leaf] = after;
      rows.push({ label: path.join('.'), before: displayText(before, 3000), after: displayText(after, 3000) });
    });
    return { value: working, rows };
  }

  function normalizeWordFields(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw planError('invalid-word', '单词条目无效');
    const result = {};
    WORD_FIELDS.forEach(field => {
      if (own(value, field)) result[field] = cloneJson(value[field]);
    });
    result.word = String(result.word || '').trim();
    if (!result.word || result.word.length > 120) throw planError('invalid-word', '单词不能为空或过长');
    result.phonetic = String(result.phonetic || '').trim().slice(0, 120);
    result.pos = String(result.pos || '').trim().slice(0, 80);
    const meanings = Array.isArray(result.meaning) ? result.meaning : (result.meaning ? [result.meaning] : []);
    result.meaning = meanings.map(item => String(item || '').trim()).filter(Boolean).slice(0, 20);
    if (!result.meaning.length) throw planError('invalid-word', '单词至少需要一条释义');
    result.examples = Array.isArray(result.examples) ? result.examples.slice(0, 20) : [];
    result.tags = Array.isArray(result.tags) ? result.tags.map(item => String(item || '').trim()).filter(Boolean).slice(0, 30) : [];
    assertSafeValue(result, 0);
    return result;
  }

  function wordTarget(items, target) {
    const wanted = target && typeof target === 'object' ? target : {};
    const id = wanted.id === undefined ? '' : String(wanted.id);
    const word = wanted.word === undefined ? '' : String(wanted.word).trim().toLowerCase();
    const index = items.findIndex(item => (id && String(item && item.id) === id) ||
      (word && String(item && item.word || '').trim().toLowerCase() === word));
    return { index, item: index >= 0 ? items[index] : null };
  }

  function makeVocabRecord(items) {
    return { k: WORDS_KEY, v: Array.isArray(items) ? items : [] };
  }

  function makeRecordsRecord(records) {
    return {
      k: RECORDS_KEY,
      v: records && typeof records === 'object' && !Array.isArray(records) ? records : {}
    };
  }

  function normalizeEnglishState(value) {
    const source = value && typeof value === 'object' ? value : {};
    if (!Array.isArray(source.vocab)) throw planError('invalid-current-data', '网页版单词本词库记录格式无效');
    if (!source.records || typeof source.records !== 'object' || Array.isArray(source.records)) {
      throw planError('invalid-current-data', '网页版单词本学习记录格式无效');
    }
    return { vocab: source.vocab, records: source.records };
  }

  function createIndexedDbEnglishStore(indexedDbApi) {
    function open(create) {
      return new Promise((resolve, reject) => {
        if (!indexedDbApi || typeof indexedDbApi.open !== 'function') {
          reject(planError('indexeddb-unavailable', '当前环境不支持网页版单词本'));
          return;
        }
        let request;
        let newDatabase = false;
        try { request = indexedDbApi.open(WORDS_DB, 1); }
        catch (_) { reject(planError('indexeddb-unavailable', '无法打开网页版单词本')); return; }
        request.onupgradeneeded = event => {
          const db = request.result;
          newDatabase = Number(event && event.oldVersion || 0) === 0;
          if (!create && newDatabase) {
            try { request.transaction.abort(); } catch (_) {}
            return;
          }
          if (!db.objectStoreNames.contains(WORDS_STORE)) db.createObjectStore(WORDS_STORE, { keyPath: 'k' });
        };
        request.onerror = () => {
          if (!create && newDatabase) resolve(null);
          else reject(planError('indexeddb-open-failed', '无法打开网页版单词本'));
        };
        request.onblocked = () => reject(planError('indexeddb-blocked', '网页版单词本正被其它页面占用'));
        request.onsuccess = () => resolve(request.result);
      });
    }

    async function read() {
      const db = await open(false);
      if (!db) return {
        databaseExists: false, vocabExists: false, recordsExist: false, items: [], records: {},
        vocab: []
      };
      try {
        if (!db.objectStoreNames.contains(WORDS_STORE)) return {
          databaseExists: true, vocabExists: false, recordsExist: false, items: [], records: {}, vocab: []
        };
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(WORDS_STORE, 'readonly');
          const store = tx.objectStore(WORDS_STORE);
          const vocabRequest = store.get(WORDS_KEY);
          const recordsRequest = store.get(RECORDS_KEY);
          let vocabRecord;
          let recordsRecord;
          vocabRequest.onsuccess = () => { vocabRecord = vocabRequest.result; };
          recordsRequest.onsuccess = () => { recordsRecord = recordsRequest.result; };
          vocabRequest.onerror = recordsRequest.onerror = () => reject(planError('indexeddb-read-failed', '读取网页版单词本失败'));
          tx.oncomplete = () => {
            try {
              const state = normalizeEnglishState({
                vocab: vocabRecord ? vocabRecord.v : [],
                records: recordsRecord ? recordsRecord.v : {}
              });
              resolve({
                databaseExists: true,
                vocabExists: !!vocabRecord,
                recordsExist: !!recordsRecord,
                recordExists: !!vocabRecord,
                items: state.vocab,
                vocab: state.vocab,
                records: state.records
              });
            } catch (error) { reject(error); }
          };
          tx.onerror = () => reject(tx.error || planError('indexeddb-read-failed', '读取网页版单词本失败'));
          tx.onabort = tx.onerror;
        });
      } finally {
        try { db.close(); } catch (_) {}
      }
    }

    async function update(expectedStable, buildNext, signal) {
      if (signal && signal.aborted) throw planError('cancelled', '本地数据修改已停止');
      const db = await open(true);
      try {
        if (signal && signal.aborted) throw planError('cancelled', '本地数据修改已停止');
        return await new Promise((resolve, reject) => {
          let settled = false;
          let result = null;
          let signalAbortError = null;
          let onSignalAbort = null;
          const detachSignal = () => {
            if (signal && onSignalAbort) signal.removeEventListener('abort', onSignalAbort);
          };
          const fail = error => {
            if (settled) return;
            settled = true;
            detachSignal();
            reject(error instanceof Error ? error : planError('indexeddb-write-failed', '写入网页版单词本失败'));
          };
          let tx;
          try { tx = db.transaction(WORDS_STORE, 'readwrite'); }
          catch (_) { fail(planError('indexeddb-write-failed', '无法启动网页版单词本写入事务')); return; }
          if (signal) {
            onSignalAbort = () => {
              signalAbortError = planError('cancelled', '本地数据修改已停止');
              try { tx.abort(); } catch (_) { fail(signalAbortError); }
            };
            signal.addEventListener('abort', onSignalAbort, { once: true });
            if (signal.aborted) { onSignalAbort(); return; }
          }
          const store = tx.objectStore(WORDS_STORE);
          const vocabRequest = store.get(WORDS_KEY);
          const recordsRequest = store.get(RECORDS_KEY);
          let vocabRecord;
          let recordsRecord;
          let reads = 0;
          const onRead = () => {
            reads += 1;
            if (reads < 2) return;
            try {
              const current = normalizeEnglishState({
                vocab: vocabRecord ? vocabRecord.v : [],
                records: recordsRecord ? recordsRecord.v : {}
              });
              const comparable = {
                vocab: current.vocab, records: current.records,
                vocabExists: !!vocabRecord, recordsExist: !!recordsRecord
              };
              if (stableStringify(comparable) !== expectedStable) throw planError('stale', '英语学习数据已发生变化，请重新生成修改方案');
              const next = normalizeEnglishState(buildNext(cloneJson(current)));
              result = {
                before: cloneJson(current), after: cloneJson(next),
                afterStable: stableStringify({ vocab: next.vocab, records: next.records, vocabExists: true, recordsExist: true })
              };
              store.put(makeVocabRecord(next.vocab));
              store.put(makeRecordsRecord(next.records));
            } catch (error) {
              try { tx.abort(); } catch (_) {}
              fail(error);
            }
          };
          vocabRequest.onerror = recordsRequest.onerror = () => {
            try { tx.abort(); } catch (_) {}
            fail(planError('indexeddb-read-failed', '确认前重新读取英语学习数据失败'));
          };
          vocabRequest.onsuccess = () => { vocabRecord = vocabRequest.result; onRead(); };
          recordsRequest.onsuccess = () => { recordsRecord = recordsRequest.result; onRead(); };
          tx.oncomplete = () => {
            if (settled) return;
            settled = true;
            detachSignal();
            resolve(result);
          };
          tx.onerror = () => fail(signalAbortError || tx.error || planError('indexeddb-write-failed', '写入网页版单词本失败'));
          tx.onabort = () => {
            if (!settled) fail(signalAbortError || tx.error || planError('indexeddb-write-aborted', '网页版单词本写入已中止'));
          };
        });
      } finally {
        try { db.close(); } catch (_) {}
      }
    }

    return Object.freeze({ read, update });
  }

  function createIndexedDbVocabStore(indexedDbApi) {
    return createIndexedDbEnglishStore(indexedDbApi);
  }

  function normalizeVisitHistory(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const path = String(item.path || '').trim().replace(/\/index\.html$/i, '/');
      const visitedAt = Number(item.visitedAt);
      if (!path.startsWith('/') || /[?#]/.test(path) || path.length > 500 || !Number.isFinite(visitedAt) || visitedAt <= 0 || seen.has(path)) return null;
      seen.add(path);
      return {
        path,
        title: String(item.title || path).replace(/\s+/g, ' ').trim().slice(0, 160),
        visitedAt: Math.floor(visitedAt)
      };
    }).filter(Boolean).sort((left, right) => right.visitedAt - left.visitedAt).slice(0, 24);
  }

  function validateSnapshot(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Number(value.schemaVersion) !== 2 ||
        value.kind !== 'tianze-coc-snapshot' || !value.profile || typeof value.profile !== 'object' ||
        !value.coverage || typeof value.coverage !== 'object' || !value.village || typeof value.village !== 'object' ||
        Array.isArray(value.profile) || Array.isArray(value.coverage) || Array.isArray(value.village)) {
      throw planError('invalid-snapshot', 'COC 快照必须是有效的 v2 完整快照');
    }
    return value;
  }

  function legacyVillageFromSnapshot(snapshot, timestamp) {
    validateSnapshot(snapshot);
    const village = cloneJson(snapshot.village);
    const partial = !(snapshot.coverage && snapshot.coverage.buildings);
    const hall = Array.isArray(village.buildings)
      ? village.buildings.find(item => item && Number(item.data) === 1000001)
      : null;
    const townHall = Number(snapshot.profile.townHallLevel) || Number(village.townHallLevel) ||
      Number(hall && (hall.lvl !== undefined ? hall.lvl : hall.level)) || 0;
    const builderHall = Number(snapshot.profile.builderHallLevel) || Number(village.builderHallLevel) || 0;
    return {
      schemaVersion: 2,
      snapshotSource: cloneJson(snapshot.source || null),
      coverage: cloneJson(snapshot.coverage || {}),
      missingFields: cloneJson(snapshot.missingFields || []),
      village,
      th: townHall,
      bh: builderHall,
      baseWC: partial ? { home_builder: 0, home_lab: 1, home_pet: 0, bb_builder: 0, bb_lab: 1 } : {},
      gobWorker: 0,
      gobLab: 0,
      tasks: [],
      ts: Number(timestamp) || Date.now()
    };
  }

  function normalizeArmyPriorityValue(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw planError('invalid-mutation', 'COC 配兵优先级必须是 JSON 对象');
    const source = value.source === 'link' ? 'link' : 'custom';
    const raw = Array.isArray(value.selectedGids) ? value.selectedGids : [];
    if (raw.length > 10000 || raw.some(id => !/^\d+$/.test(String(id == null ? '' : id).trim()))) {
      throw planError('invalid-mutation', 'COC 配兵优先级包含无效单位编号');
    }
    return {
      schemaVersion: 1,
      selectedGids: Array.from(new Set(raw.map(id => String(id).trim()))).sort((left, right) => Number(left) - Number(right)),
      source,
      updatedAt: Math.max(0, Number(value.updatedAt) || 0)
    };
  }

  function learningKeyAllowed(storage, key) {
    if (!LEARNING_PREFIXES.some(prefix => key.startsWith(prefix)) || forbiddenField(key)) return false;
    if (!storage || typeof storage.key !== 'function') return false;
    const count = Math.max(0, Math.min(10000, Number(storage.length) || 0));
    for (let index = 0; index < count; index += 1) {
      if (String(storage.key(index) || '') === key) return true;
    }
    return false;
  }

  function parseMetaRaw(raw, required) {
    const parsed = parseJsonRaw(raw, '英语学习元数据', { allowInvalid: !required, objectOnly: true });
    if (parsed.exists && !parsed.valid && required) throw planError('invalid-current-data', '英语学习元数据不是有效 JSON');
    return parsed;
  }

  function cleanupEnglishMetaForWord(meta, id) {
    const next = cloneJson(meta || {});
    if (Array.isArray(next.wrongBook)) next.wrongBook = next.wrongBook.filter(item => String(item && item.wordId || '') !== id);
    if (next.examples && typeof next.examples === 'object' && !Array.isArray(next.examples)) delete next.examples[id];
    if (next.stats && typeof next.stats === 'object' && !Array.isArray(next.stats) && Array.isArray(next.stats.learnedWordIds)) {
      next.stats.learnedWordIds = next.stats.learnedWordIds.filter(value => String(value) !== id);
    }
    return next;
  }

  function resetEnglishMeta(meta, fields) {
    const next = cloneJson(meta || {});
    const allowed = new Set([
      'wrongBook', 'examples', 'stats.learnedWordIds', 'stats.totalAnswered', 'stats.totalCorrect',
      'stats.studyLog', 'stats.streakDays', 'stats.lastStudyDate'
    ]);
    const requested = Array.isArray(fields) ? fields : [];
    requested.forEach(path => {
      if (!allowed.has(path)) throw planError('mutation-not-allowed', '英语学习清理方案包含未允许字段');
      if (path === 'wrongBook') next.wrongBook = [];
      else if (path === 'examples') next.examples = {};
      else {
        if (!next.stats || typeof next.stats !== 'object' || Array.isArray(next.stats)) next.stats = {};
        const field = path.slice('stats.'.length);
        if (field === 'learnedWordIds') next.stats[field] = [];
        else if (field === 'studyLog') next.stats[field] = {};
        else if (field === 'lastStudyDate') next.stats[field] = '';
        else next.stats[field] = 0;
      }
    });
    return next;
  }

  function assertMetaPath(path) {
    const normalized = normalizePath(path);
    const rootField = String(normalized[0]);
    if (!['stats', 'wrongBook', 'examples', 'settings', 'version'].includes(rootField)) {
      throw planError('mutation-not-allowed', '英语元数据不允许修改该字段');
    }
    return normalized;
  }

  function restoreStorageRaw(storage, snapshots) {
    let firstError = null;
    Object.keys(snapshots).forEach(key => {
      try {
        const raw = snapshots[key];
        if (raw === null) storage.removeItem(key);
        else storage.setItem(key, raw);
      } catch (error) { if (!firstError) firstError = error; }
    });
    if (firstError) throw firstError;
  }

  function applyStorageChanges(storage, baseRawByKey, nextRawByKey) {
    const keys = Object.keys(baseRawByKey);
    keys.forEach(key => {
      if (normalizedRaw(storage.getItem(key)) !== baseRawByKey[key]) throw planError('stale', '本地数据已发生变化，请重新生成修改方案');
    });
    try {
      keys.forEach(key => {
        const next = own(nextRawByKey, key) ? nextRawByKey[key] : baseRawByKey[key];
        if (next === baseRawByKey[key]) return;
        if (next === null) storage.removeItem(key);
        else storage.setItem(key, next);
      });
      keys.forEach(key => {
        const expected = own(nextRawByKey, key) ? nextRawByKey[key] : baseRawByKey[key];
        if (normalizedRaw(storage.getItem(key)) !== expected) throw planError('write-verification-failed', '本地数据写入后校验失败');
      });
    } catch (error) {
      try { restoreStorageRaw(storage, baseRawByKey); }
      catch (_) { throw planError('rollback-failed', '本地数据写入失败，且回滚未能完成'); }
      throw error;
    }
  }

  function defaultRevisionEmitter(storage, now, random) {
    return detailValue => {
      const detail = Object.freeze({
        schemaVersion: 1,
        module: String(detailValue.module || ''),
        resource: String(detailValue.resource || ''),
        revision: String(now()) + '-' + Math.floor(random() * 0x1000000).toString(36),
        changedAt: now()
      });
      try {
        if (root && typeof root.CustomEvent === 'function' && typeof root.dispatchEvent === 'function') {
          root.dispatchEvent(new root.CustomEvent(REVISION_CHANNEL, { detail }));
        }
      } catch (_) {}
      try {
        if (storage && typeof storage.setItem === 'function') storage.setItem(REVISION_KEY, JSON.stringify(detail));
      } catch (_) {}
      try {
        if (root && typeof root.BroadcastChannel === 'function') {
          const channel = new root.BroadcastChannel(REVISION_CHANNEL);
          channel.postMessage(detail);
          channel.close();
        }
      } catch (_) {}
      return detail;
    };
  }

  function createController(options) {
    const opts = options || {};
    const storage = opts.storage;
    const now = typeof opts.now === 'function' ? opts.now : Date.now;
    const random = typeof opts.random === 'function' ? opts.random : Math.random;
    const englishStore = opts.englishStore || opts.vocabStore || createIndexedDbEnglishStore(opts.indexedDB || (root && root.indexedDB));
    const emitRevision = typeof opts.emitRevision === 'function' ? opts.emitRevision : defaultRevisionEmitter(storage, now, random);
    const pending = new Map();
    const spent = new Map();

    function requireStorage() {
      if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
        throw planError('storage-unavailable', '当前环境无法访问天择网本地数据');
      }
    }

    function rememberSpent(id, receipt) {
      spent.set(id, Object.freeze({ ...receipt }));
      while (spent.size > MAX_SPENT_RECEIPTS) spent.delete(spent.keys().next().value);
    }

    function cleanup() {
      const time = now();
      for (const [id, entry] of pending) {
        if (entry.expiresAt <= time && entry.state === 'pending') {
          pending.delete(id);
          rememberSpent(id, { status: 'expired', applied: false, planId: id });
        }
      }
      while (pending.size >= MAX_PENDING_PLANS) {
        const id = pending.keys().next().value;
        pending.delete(id);
        rememberSpent(id, { status: 'cancelled', applied: false, planId: id, reason: '方案数量达到上限' });
      }
    }

    function appearanceEntry(plan, common) {
      requireStorage();
      const precondition = plan.precondition;
      if (!precondition || !Array.isArray(precondition.keys) || precondition.keys.length !== APPEARANCE_KEYS.length ||
          precondition.keys.some((key, index) => key !== APPEARANCE_KEYS[index])) {
        throw planError('invalid-precondition', '网站外观方案的前置存储项不完整');
      }
      const entries = {};
      const baseRawByKey = {};
      APPEARANCE_KEYS.forEach(key => {
        const raw = normalizedRaw(storage.getItem(key));
        baseRawByKey[key] = raw;
        if (raw !== null) entries[key] = raw;
      });
      if (!Array.isArray(precondition.existingKeys) || stableStringify(precondition.existingKeys) !== stableStringify(Object.keys(entries))) {
        throw planError('stale', '网站外观存储项的存在状态已变化');
      }
      assertFingerprint(precondition, entries);
      const mutation = plan.mutation;
      if (!Array.isArray(mutation.set) || !Array.isArray(mutation.remove)) throw planError('invalid-mutation', '网站外观修改结构无效');
      if (mutation.set.length !== 1 || mutation.set[0].key !== APPEARANCE_KEYS[0] ||
          mutation.remove.length !== APPEARANCE_KEYS.length - 1 ||
          mutation.remove.some((key, index) => key !== APPEARANCE_KEYS[index + 1])) {
        throw planError('mutation-not-allowed', '网站外观方案尝试修改未登记存储项');
      }
      const palette = String(mutation.set[0].value || '');
      if (!PALETTES.includes(palette) || (common.operation === 'clear_appearance' && palette !== 'cold')) {
        throw planError('invalid-mutation', '网站外观配色无效');
      }
      const nextRawByKey = { [APPEARANCE_KEYS[0]]: palette };
      APPEARANCE_KEYS.slice(1).forEach(key => { nextRawByKey[key] = null; });
      return {
        ...common, resource: 'appearance', baseRawByKey, nextRawByKey,
        rows: [{ label: '网站配色', before: entries[APPEARANCE_KEYS[0]] || '冷色', after: palette }]
      };
    }

    function visitHistoryEntry(plan, common) {
      requireStorage();
      const precondition = assertPreconditionKey(plan, VISIT_HISTORY_KEY);
      const current = parseJsonRaw(storage.getItem(VISIT_HISTORY_KEY), '网站访问记录', { allowInvalid: true });
      const list = current.valid ? normalizeVisitHistory(current.value) : [];
      if (Boolean(precondition.exists) !== current.exists || Boolean(precondition.valid) !== current.valid) {
        throw planError('stale', '网站访问记录的存在或有效状态已变化');
      }
      assertFingerprint(precondition, current.valid ? current.value : String(current.raw || ''));
      const mutation = plan.mutation;
      assertExactKey(mutation.key, VISIT_HISTORY_KEY, '网站访问记录存储项');
      let next = null;
      const rows = [];
      if (common.operation === 'clear_visit_history') {
        rows.push({ label: '网站访问记录', before: list.length + ' 项', after: '0 项' });
      } else {
        if (!current.valid) throw planError('invalid-current-data', '当前网站访问记录损坏，只能清空');
        const path = String(mutation.target && mutation.target.path || '');
        const index = list.findIndex(item => item.path === path);
        if (index < 0) throw planError('stale', '要修改的网站访问记录已不存在');
        next = list.slice();
        if (common.operation === 'remove_visit_history_entry') {
          rows.push({ label: list[index].title, before: list[index].path, after: '无' });
          next.splice(index, 1);
        } else {
          const after = mutation.rawValue || mutation.after;
          if (!after || typeof after !== 'object' || after.path !== list[index].path || Number(after.visitedAt) !== list[index].visitedAt) {
            throw planError('invalid-mutation', '访问记录更新只允许修改标题');
          }
          const title = String(after.title || '').replace(/\s+/g, ' ').trim();
          if (!title || title.length > 160) throw planError('invalid-mutation', '访问记录标题无效');
          assertSafeValue(title, 0);
          rows.push({ label: list[index].path, before: list[index].title, after: title });
          next[index] = { path: list[index].path, title, visitedAt: list[index].visitedAt };
        }
      }
      return {
        ...common, resource: 'visit_history', baseRawByKey: { [VISIT_HISTORY_KEY]: current.raw },
        nextRawByKey: { [VISIT_HISTORY_KEY]: next === null ? null : JSON.stringify(next) }, rows
      };
    }

    function settingsEntry(plan, common) {
      return common.operation.endsWith('appearance') ? appearanceEntry(plan, common) : visitHistoryEntry(plan, common);
    }

    function snapshotEntry(plan, common) {
      requireStorage();
      const pre = plan.precondition;
      if (!pre || !Array.isArray(pre.keys) || pre.keys.length !== 2 || pre.keys[0] !== COC_KEYS.snapshot || pre.keys[1] !== COC_KEY) {
        throw planError('invalid-precondition', 'COC 快照方案必须同时声明快照与兼容村庄存档');
      }
      const snapshotRaw = parseJsonRaw(storage.getItem(COC_KEYS.snapshot), 'COC v2 快照', { allowInvalid: true });
      const legacyRaw = parseJsonRaw(storage.getItem(COC_KEY), 'COC 村庄存档', { allowInvalid: true });
      if (Boolean(pre.snapshotExists) !== snapshotRaw.exists || Boolean(pre.legacyExists) !== legacyRaw.exists) {
        throw planError('stale', 'COC 快照与兼容存档的存在状态已变化');
      }
      assertFingerprint(pre, {
        snapshot: snapshotRaw.exists && snapshotRaw.valid ? snapshotRaw.value : null,
        legacy: legacyRaw.exists && legacyRaw.valid ? legacyRaw.value : null
      });
      const baseRawByKey = { [COC_KEYS.snapshot]: snapshotRaw.raw, [COC_KEY]: legacyRaw.raw };
      const mutation = plan.mutation;
      const rows = [];
      if (common.operation === 'clear_snapshot') {
        if (!Array.isArray(mutation.keys) || mutation.keys.length !== 2 || mutation.keys[0] !== COC_KEYS.snapshot || mutation.keys[1] !== COC_KEY) {
          throw planError('mutation-not-allowed', 'COC 快照清除方案必须同时覆盖两份存档');
        }
        rows.push({ label: 'COC v2 快照', before: snapshotRaw.exists ? '已保存' : '无', after: '无' });
        rows.push({ label: 'COC 村庄分析兼容存档', before: legacyRaw.exists ? '已保存' : '无', after: '无' });
        return {
          ...common, resource: 'snapshot', baseRawByKey,
          nextRawByKey: { [COC_KEYS.snapshot]: null, [COC_KEY]: null }, rows
        };
      }
      if (!mutation.snapshot || mutation.snapshot.key !== COC_KEYS.snapshot || !mutation.legacy || mutation.legacy.key !== COC_KEY) {
        throw planError('mutation-not-allowed', 'COC 快照方案必须包含成对的快照与兼容村庄存档');
      }
      const snapshot = cloneJson(mutation.snapshot.value);
      const legacy = cloneJson(mutation.legacy.value);
      validateSnapshot(snapshot);
      assertSafeValue(snapshot, 0);
      const expectedLegacy = legacyVillageFromSnapshot(snapshot, legacy && legacy.ts);
      if (stableStringify(expectedLegacy) !== stableStringify(legacy)) {
        throw planError('invalid-mutation', 'COC 快照与兼容村庄存档不符合同源转换规则');
      }
      rows.push({
        label: 'COC v2 快照', before: snapshotRaw.exists ? '已保存' : '无', after: '新快照',
        detail: displayText(snapshot, 16000)
      });
      rows.push({ label: 'COC 村庄分析兼容存档', before: legacyRaw.exists ? '已保存' : '无', after: '由同一快照同步重建' });
      return {
        ...common, resource: 'snapshot', baseRawByKey,
        nextRawByKey: { [COC_KEYS.snapshot]: JSON.stringify(snapshot), [COC_KEY]: JSON.stringify(legacy) }, rows
      };
    }

    function cocEntry(plan, common) {
      requireStorage();
      const match = /^(replace|update|clear)_(village|snapshot|damage|planner|army_priority)$/.exec(common.operation);
      if (!match) throw planError('operation-not-allowed', 'COC 操作不在允许清单中');
      const action = match[1];
      const resource = match[2];
      if (resource === 'snapshot') return snapshotEntry(plan, common);
      const key = COC_KEYS[resource];
      const precondition = assertPreconditionKey(plan, key);
      const current = parseJsonRaw(storage.getItem(key), 'COC ' + resource, {
        objectOnly: resource === 'village' || resource === 'snapshot' || resource === 'army_priority',
        containerOnly: true
      });
      if (Boolean(precondition.exists) !== current.exists) throw planError('stale', 'COC 数据的存在状态已变化');
      let villageSnapshotRaw = null;
      if (resource === 'village') {
        assertExactKey(precondition.snapshotKey, COC_KEYS.snapshot, 'COC 村庄方案快照前置存储项');
        villageSnapshotRaw = parseJsonRaw(storage.getItem(COC_KEYS.snapshot), 'COC v2 快照', { allowInvalid: true });
        if (Boolean(precondition.snapshotExists) !== villageSnapshotRaw.exists) {
          throw planError('stale', 'COC v2 快照的存在状态已变化');
        }
        assertFingerprint(precondition, {
          village: current.exists ? current.value : null,
          snapshot: villageSnapshotRaw.exists && villageSnapshotRaw.valid ? villageSnapshotRaw.value : null
        });
      } else assertFingerprint(precondition, current.exists ? current.value : null);
      assertExactKey(plan.mutation.key, key, 'COC 存储项');
      let nextValue = null;
      let rows = [];
      if (action === 'clear') {
        rows.push({ label: 'COC ' + resource, before: current.exists ? '已保存' : '无', after: '无' });
      } else if (action === 'replace') {
        if (!own(plan.mutation, 'value')) throw planError('invalid-mutation', 'COC 替换方案缺少新值');
        nextValue = cloneJson(plan.mutation.value);
        assertSafeValue(nextValue, 0);
        if (!nextValue || typeof nextValue !== 'object' || (resource !== 'damage' && resource !== 'planner' && Array.isArray(nextValue))) {
          throw planError('invalid-mutation', 'COC 替换数据格式无效');
        }
        if (resource === 'village' && !villagePayload(nextValue)) throw planError('invalid-mutation', 'COC 村庄存档缺少有效 village 数据');
        if (resource === 'snapshot') validateSnapshot(nextValue);
        if (resource === 'army_priority' && stableStringify(normalizeArmyPriorityValue(nextValue)) !== stableStringify(nextValue)) {
          throw planError('invalid-mutation', 'COC 配兵优先级方案未按登记格式规范化');
        }
        rows.push({
          label: 'COC ' + resource,
          before: current.exists ? (resource === 'village' ? villageSummary(current.value) : '已保存') : '无',
          after: resource === 'village' ? villageSummary(nextValue) : '新数据',
          detail: displayText(nextValue, 16000)
        });
      } else {
        if (!current.exists) throw planError('missing-current-data', '当前没有可修改的 COC ' + resource + ' 数据');
        const patched = applyPlannedChanges(current.value, plan.mutation.changes, resource === 'village' ? 'village' : '', 'COC ' + resource);
        if (resource === 'army_priority') {
          if (!own(plan.mutation, 'value')) throw planError('invalid-mutation', 'COC 配兵优先级更新方案缺少规范化结果');
          nextValue = cloneJson(plan.mutation.value);
          if (stableStringify(normalizeArmyPriorityValue(nextValue)) !== stableStringify(nextValue)) {
            throw planError('invalid-mutation', 'COC 配兵优先级方案未按登记格式规范化');
          }
        } else nextValue = patched.value;
        rows = patched.rows;
        if (resource === 'snapshot') validateSnapshot(nextValue);
      }
      const baseRawByKey = { [key]: current.raw };
      const nextRawByKey = { [key]: action === 'clear' ? null : JSON.stringify(nextValue) };
      if (resource === 'village') {
        baseRawByKey[COC_KEYS.snapshot] = villageSnapshotRaw.raw;
        nextRawByKey[COC_KEYS.snapshot] = villageSnapshotRaw.raw;
      }
      const linked = plan.mutation.linkedMutation || plan.mutation.linkedVillage || null;
      if (resource === 'snapshot' && linked) {
        if (!linked || typeof linked !== 'object' || !['replace', 'remove'].includes(linked.kind) || linked.key !== COC_KEY) {
          throw planError('mutation-not-allowed', 'COC 快照联动存档方案无效');
        }
        baseRawByKey[COC_KEY] = normalizedRaw(storage.getItem(COC_KEY));
        if (linked.kind === 'remove') nextRawByKey[COC_KEY] = null;
        else {
          const expectedLegacy = legacyVillageFromSnapshot(nextValue, linked.value && linked.value.ts);
          if (stableStringify(expectedLegacy) !== stableStringify(linked.value)) throw planError('invalid-mutation', 'COC 快照与村庄存档联动内容不一致');
          nextRawByKey[COC_KEY] = JSON.stringify(linked.value);
        }
        rows.push({ label: 'COC 村庄分析兼容存档', before: baseRawByKey[COC_KEY] === null ? '无' : '已保存', after: nextRawByKey[COC_KEY] === null ? '无' : '同步更新' });
      }
      return { ...common, resource, baseRawByKey, nextRawByKey, rows };
    }

    function validateEnglishPrecondition(plan, operation) {
      const pre = plan.precondition;
      if (!pre || typeof pre !== 'object' || Array.isArray(pre)) throw planError('invalid-precondition', '英语学习方案缺少前置条件');
      if (pre.database && pre.database !== WORDS_DB) throw planError('invalid-precondition', '英语学习数据库不在允许清单中');
      if (pre.store && pre.store !== WORDS_STORE) throw planError('invalid-precondition', '英语学习数据表不在允许清单中');
      if (operation === 'clear_english_progress') {
        if (pre.recordsKey !== RECORDS_KEY || pre.metaKey !== ENGLISH_META_KEY) {
          throw planError('invalid-precondition', '清除英语学习进度的前置存储项不完整');
        }
        return pre;
      }
      const expected = operation.includes('record') || operation === 'clear_english_progress' ? RECORDS_KEY :
        (operation === 'update_english_meta' ? ENGLISH_META_KEY : WORDS_KEY);
      if (own(pre, 'key')) assertExactKey(pre.key, expected, '英语学习前置存储项');
      else if (Array.isArray(pre.keys)) {
        const known = new Set([WORDS_KEY, RECORDS_KEY, ENGLISH_META_KEY]);
        if (!pre.keys.length || pre.keys.some(key => !known.has(key)) || !pre.keys.includes(expected)) {
          throw planError('invalid-precondition', '英语学习前置存储项不完整');
        }
      } else throw planError('invalid-precondition', '英语学习方案未声明前置存储项');
      return pre;
    }

    async function englishEntry(plan, common) {
      requireStorage();
      validateEnglishPrecondition(plan, common.operation);
      const snapshot = await englishStore.read();
      const state = normalizeEnglishState({ vocab: snapshot.vocab || snapshot.items || [], records: snapshot.records || {} });
      const mutation = plan.mutation;
      const baseMetaRaw = normalizedRaw(storage.getItem(ENGLISH_META_KEY));
      const needsMeta = ['remove_word', 'clear_wordbook', 'clear_word_record', 'update_english_meta', 'clear_english_progress'].includes(common.operation);
      const metaParsed = parseMetaRaw(baseMetaRaw, needsMeta && baseMetaRaw !== null);
      const meta = metaParsed.valid && metaParsed.value ? metaParsed.value : {};
      const precondition = plan.precondition;
      if (common.operation === 'update_english_meta') {
        if (Boolean(precondition.exists) !== metaParsed.exists) throw planError('stale', '英语学习元数据的存在状态已变化');
        assertFingerprint(precondition, meta);
      } else if (common.operation === 'clear_english_progress') {
        if (Number(precondition.recordCount) !== Object.keys(state.records).length) throw planError('stale', '英语学习记录数量已变化');
        assertFingerprint(precondition, { records: state.records, meta });
      }
      else if (common.operation === 'update_word_record' || common.operation === 'clear_word_record') {
        if (Number(precondition.itemCount) !== Object.keys(state.records).length) throw planError('stale', '英语学习记录数量已变化');
        assertFingerprint(precondition, state.records);
        const targetId = String(precondition.targetId || '');
        if (!targetId || !own(state.records, targetId) || precondition.targetFingerprint !== localFingerprint(state.records[targetId])) {
          throw planError('stale', '单词学习记录前置状态已变化');
        }
      } else if (common.operation === 'remove_word' || common.operation === 'clear_wordbook') {
        if (Number(precondition.itemCount) !== state.vocab.length || Number(precondition.recordCount) !== Object.keys(state.records).length ||
            Boolean(precondition.metaExists) !== metaParsed.exists) throw planError('stale', '英学习完整状态已变化');
        assertFingerprint(precondition, { vocab: state.vocab, records: state.records, meta });
      } else {
        if (Number(precondition.itemCount) !== state.vocab.length) throw planError('stale', '网页版单词本词条数量已变化');
        assertFingerprint(precondition, state.vocab);
      }
      const entry = {
        ...common,
        resource: common.operation.includes('record') || common.operation === 'clear_english_progress' ? 'records' :
          (common.operation === 'update_english_meta' ? 'meta' : 'vocab'),
        baseEnglishStable: stableStringify({
          vocab: state.vocab, records: state.records,
          vocabExists: snapshot.vocabExists !== false,
          recordsExist: snapshot.recordsExist !== false
        }),
        baseMetaRaw,
        writeMeta: metaParsed.exists || common.operation === 'update_english_meta',
        rows: []
      };
      if (common.operation === 'add_word') {
        if (mutation.database !== WORDS_DB || mutation.store !== WORDS_STORE || mutation.key !== WORDS_KEY) throw planError('mutation-not-allowed', '添加单词方案的存储位置无效');
        entry.item = normalizeWordFields(mutation.item);
        if (state.vocab.some(item => String(item && item.word || '').trim().toLowerCase() === entry.item.word.toLowerCase())) throw planError('stale', '该单词已经存在');
        WORD_FIELDS.forEach(field => {
          if (own(entry.item, field) && (field === 'word' || (Array.isArray(entry.item[field]) ? entry.item[field].length : entry.item[field]))) {
            entry.rows.push({ label: field, before: '无', after: displayText(entry.item[field], 3000) });
          }
        });
      } else if (common.operation === 'update_word' || common.operation === 'remove_word') {
        if (mutation.database !== WORDS_DB || mutation.store !== WORDS_STORE || mutation.key !== WORDS_KEY) throw planError('mutation-not-allowed', '单词方案的存储位置无效');
        const found = wordTarget(state.vocab, mutation.target);
        if (!found.item) throw planError('stale', '要修改的单词已不存在');
        entry.target = { id: String(found.item.id), word: String(found.item.word || '') };
        if (common.operation === 'remove_word') {
          const cleanup = mutation.relatedCleanup;
          if (!cleanup || cleanup.recordsKey !== RECORDS_KEY || cleanup.metaKey !== ENGLISH_META_KEY ||
              stableStringify(cleanup.fields) !== stableStringify(['wrongBook', 'examples', 'stats.learnedWordIds'])) {
            throw planError('mutation-not-allowed', '移除单词方案的关联清理范围无效');
          }
          entry.nextMeta = cleanupEnglishMetaForWord(meta, entry.target.id);
          entry.rows.push({ label: '删除单词', before: displayText(found.item, 6000), after: '无' });
          entry.rows.push({ label: '关联学习记录', before: own(state.records, entry.target.id) ? '已保存' : '无', after: '无' });
        } else {
          entry.afterFields = normalizeWordFields(mutation.after);
          WORD_FIELDS.forEach(field => {
            if (stableStringify(found.item[field]) !== stableStringify(entry.afterFields[field])) {
              entry.rows.push({ label: field, before: displayText(found.item[field], 3000), after: displayText(entry.afterFields[field], 3000) });
            }
          });
        }
      } else if (common.operation === 'clear_wordbook') {
        if (mutation.database !== WORDS_DB || mutation.store !== WORDS_STORE ||
            !Array.isArray(mutation.keys) || mutation.keys.length !== 2 || mutation.keys[0] !== WORDS_KEY || mutation.keys[1] !== RECORDS_KEY ||
            mutation.metaKey !== ENGLISH_META_KEY) throw planError('mutation-not-allowed', '清空单词本方案的存储位置无效');
        entry.resetMetaFields = mutation.resetMetaFields;
        if (stableStringify(mutation.preserveMetaFields) !== stableStringify(['aiConfig', 'settings', 'version'])) {
          throw planError('mutation-not-allowed', '清空单词本方案未完整保留接口配置和学习设置');
        }
        entry.nextMeta = resetEnglishMeta(meta, entry.resetMetaFields);
        entry.rows.push({ label: '单词词库', before: state.vocab.length + ' 个单词', after: '0 个单词' });
        entry.rows.push({ label: '学习记录', before: Object.keys(state.records).length + ' 项', after: '0 项' });
      } else if (common.operation === 'update_word_record' || common.operation === 'clear_word_record') {
        if (mutation.database !== WORDS_DB || mutation.store !== WORDS_STORE || (mutation.key && mutation.key !== RECORDS_KEY)) throw planError('mutation-not-allowed', '学习记录方案的存储位置无效');
        const id = String(mutation.target && (mutation.target.id || mutation.target.wordId) || '');
        if (!id || forbiddenField(id) || !own(state.records, id)) throw planError('stale', '要修改的学习记录已不存在');
        entry.target = { id };
        if (common.operation === 'clear_word_record') {
          if (mutation.metaKey !== ENGLISH_META_KEY || stableStringify(mutation.relatedCleanup) !== stableStringify(['wrongBook', 'examples', 'stats.learnedWordIds'])) {
            throw planError('mutation-not-allowed', '清除单词学习记录的关联清理范围无效');
          }
          entry.nextMeta = cleanupEnglishMetaForWord(meta, id);
          entry.rows.push({ label: '单词 ' + id + ' 的学习记录', before: displayText(state.records[id], 5000), after: '无' });
        } else if (Array.isArray(mutation.changes)) {
          const patched = applyPlannedChanges(state.records[id], mutation.changes.map(change => ({ ...change, path: change.path && change.path[0] === id ? change.path.slice(1) : change.path })), '', '单词学习记录');
          entry.afterRecord = patched.value;
          entry.rows.push(...patched.rows);
        } else {
          const after = mutation.rawValue || mutation.after;
          if (!after || typeof after !== 'object' || Array.isArray(after)) throw planError('invalid-mutation', '学习记录新值无效');
          assertSafeValue(after, 0);
          entry.afterRecord = { ...cloneJson(state.records[id]), ...cloneJson(after), wordId: state.records[id].wordId === undefined ? id : state.records[id].wordId };
          entry.rows.push({ label: '单词 ' + id + ' 的学习记录', before: displayText(state.records[id], 5000), after: displayText(entry.afterRecord, 5000) });
        }
      } else if (common.operation === 'update_english_meta') {
        if ((mutation.key || mutation.metaKey) !== ENGLISH_META_KEY || !Array.isArray(mutation.changes) ||
            stableStringify(mutation.preserveFields) !== stableStringify(['aiConfig'])) throw planError('mutation-not-allowed', '英语元数据方案的存储位置或保留范围无效');
        const changes = mutation.changes.map(change => ({ ...change, path: assertMetaPath(change.path) }));
        const patched = applyPlannedChanges(meta, changes, '', '英语学习元数据');
        entry.nextMeta = patched.value;
        entry.rows.push(...patched.rows);
      } else if (common.operation === 'clear_english_progress') {
        if (mutation.database !== WORDS_DB || mutation.store !== WORDS_STORE || mutation.recordsKey !== RECORDS_KEY || mutation.metaKey !== ENGLISH_META_KEY) {
          throw planError('mutation-not-allowed', '清除英语学习进度方案的存储位置无效');
        }
        entry.resetMetaFields = mutation.resetMetaFields;
        if (stableStringify(mutation.preserveFields) !== stableStringify(['vocab', 'aiConfig', 'settings', 'version'])) {
          throw planError('mutation-not-allowed', '清除英语学习进度方案未完整保留词库、接口配置与学习设置');
        }
        entry.nextMeta = resetEnglishMeta(meta, entry.resetMetaFields);
        entry.rows.push({ label: '英语学习记录', before: Object.keys(state.records).length + ' 项', after: '0 项' });
      } else throw planError('operation-not-allowed', '英语学习操作不在允许清单中');
      if (entry.nextMeta && stableStringify(entry.nextMeta.aiConfig) !== stableStringify(meta.aiConfig)) {
        throw planError('secret-preservation-failed', '英语接口配置必须原样保留');
      }
      if (!entry.rows.length) entry.rows.push({ label: '英语学习数据', before: '当前内容', after: '内容不变' });
      return entry;
    }

    function learningEntry(plan, common) {
      requireStorage();
      const precondition = plan.precondition;
      const key = String(precondition && precondition.key || '');
      if (!key || !learningKeyAllowed(storage, key)) throw planError('key-not-allowed', '只能修改当前已登记的学习进度存储项');
      assertExactKey(plan.mutation.key, key, '学习进度存储项');
      const current = parseJsonRaw(storage.getItem(key), '学习进度', { containerOnly: true });
      if (!current.exists) throw planError('stale', '学习进度已不存在');
      assertFingerprint(precondition, current.value);
      let next = null;
      let rows = [];
      if (common.operation === 'clear_learning_progress') {
        rows.push({ label: key, before: '已保存', after: '无' });
      } else if (common.operation === 'replace_learning_progress') {
        if (!own(plan.mutation, 'value')) throw planError('invalid-mutation', '学习进度替换方案缺少新值');
        next = cloneJson(plan.mutation.value);
        assertSafeValue(next, 0);
        rows.push({ label: key, before: '已保存', after: '新进度', detail: displayText(next, 12000) });
      } else {
        const patched = applyPlannedChanges(current.value, plan.mutation.changes, '', '学习进度');
        next = patched.value;
        rows = patched.rows;
      }
      return {
        ...common, resource: 'progress', baseRawByKey: { [key]: current.raw },
        nextRawByKey: { [key]: next === null ? null : JSON.stringify(next) }, rows
      };
    }

    async function capture(plan, args) {
      cleanup();
      const shape = ensurePlanShape(plan, args);
      if (pending.has(shape.planId) || spent.has(shape.planId)) throw planError('duplicate-plan', '这个修改方案已经登记过');
      const capturedAt = now();
      const expiresAt = Math.min(Number(plan.expiresAt) || (capturedAt + PLAN_TTL_MS), capturedAt + PLAN_TTL_MS);
      const common = {
        planId: shape.planId,
        module: shape.moduleId,
        operation: shape.operation,
        summary: String(plan.summary || '修改本地数据').slice(0, 500),
        warnings: Array.isArray(plan.warnings) ? plan.warnings.map(value => String(value || '').slice(0, 500)).slice(0, 20) : [],
        capturedAt,
        expiresAt,
        state: 'pending'
      };
      let entry;
      if (shape.moduleId === 'settings') entry = settingsEntry(plan, common);
      else if (shape.moduleId === 'coc') entry = cocEntry(plan, common);
      else if (shape.moduleId === 'english') entry = await englishEntry(plan, common);
      else entry = learningEntry(plan, common);
      pending.set(shape.planId, entry);
      return preview(shape.planId);
    }

    function preview(planId) {
      cleanup();
      const entry = pending.get(String(planId || ''));
      if (!entry || entry.state !== 'pending') return null;
      return cloneJson({
        planId: entry.planId,
        module: entry.module,
        resource: entry.resource,
        operation: entry.operation,
        summary: entry.summary,
        warnings: entry.warnings,
        rows: entry.rows,
        expiresAt: entry.expiresAt,
        destructive: /^(?:clear_|remove_)/.test(entry.operation)
      });
    }

    function cancel(planId, reason) {
      const id = String(planId || '');
      const entry = pending.get(id);
      if (entry && entry.state === 'applying') {
        if (entry.abortController) entry.abortController.abort();
        return { status: 'cancelling', applied: false, planId: id, reason: String(reason || '用户取消').slice(0, 120) };
      }
      if (!entry || entry.state !== 'pending') return spent.get(id) || { status: 'unknown', applied: false, planId: id };
      entry.state = 'cancelled';
      pending.delete(id);
      const receipt = { status: 'cancelled', applied: false, planId: id, reason: String(reason || '用户取消').slice(0, 120) };
      rememberSpent(id, receipt);
      return { ...receipt };
    }

    function cancelAll(reason) {
      const ids = Array.from(pending.keys());
      ids.forEach(id => cancel(id, reason || '页面已离开'));
      return ids.length;
    }

    function nextWordId(items) {
      const used = new Set(items.map(item => String(item && item.id || '')));
      let id = '';
      for (let attempt = 0; attempt < 20 && (!id || used.has(id)); attempt += 1) {
        id = 'w_' + now().toString(36) + Math.floor(random() * 0x100000000).toString(36).padStart(7, '0').slice(0, 7);
      }
      if (!id || used.has(id)) throw planError('id-generation-failed', '无法为新单词生成唯一编号');
      return id;
    }

    function buildNextEnglish(entry, current) {
      const next = { vocab: current.vocab.slice(), records: { ...current.records } };
      if (entry.operation === 'clear_wordbook') return { vocab: [], records: {} };
      if (entry.operation === 'clear_english_progress') return { vocab: next.vocab, records: {} };
      if (entry.operation === 'add_word') {
        if (next.vocab.some(value => String(value && value.word || '').trim().toLowerCase() === entry.item.word.toLowerCase())) throw planError('stale', '该单词已经存在');
        const id = nextWordId(next.vocab);
        entry.generatedWordId = id;
        next.vocab.push({ id, addedAt: now(), ...cloneJson(entry.item) });
        return next;
      }
      if (entry.operation === 'update_word' || entry.operation === 'remove_word') {
        const found = wordTarget(next.vocab, entry.target);
        if (!found.item) throw planError('stale', '目标单词已经不存在');
        if (entry.operation === 'remove_word') {
          next.vocab.splice(found.index, 1);
          delete next.records[entry.target.id];
        } else {
          const preserved = { ...found.item };
          WORD_FIELDS.forEach(field => { preserved[field] = cloneJson(entry.afterFields[field]); });
          if (found.item.id !== undefined) preserved.id = found.item.id;
          if (found.item.addedAt !== undefined) preserved.addedAt = found.item.addedAt;
          next.vocab[found.index] = preserved;
        }
        return next;
      }
      if (entry.operation === 'clear_word_record') delete next.records[entry.target.id];
      else if (entry.operation === 'update_word_record') next.records[entry.target.id] = cloneJson(entry.afterRecord);
      return next;
    }

    async function applyEnglish(entry, signal) {
      if (signal && signal.aborted) throw planError('cancelled', '本地数据修改已停止');
      if (normalizedRaw(storage.getItem(ENGLISH_META_KEY)) !== entry.baseMetaRaw) throw planError('stale', '英语学习元数据已发生变化');
      const updated = await englishStore.update(entry.baseEnglishStable, current => buildNextEnglish(entry, current), signal);
      if (signal && signal.aborted) {
        try { await englishStore.update(updated.afterStable, () => cloneJson(updated.before)); }
        catch (_) { throw planError('rollback-failed', '修改已停止，但 IndexedDB 回滚未能完成'); }
        throw planError('cancelled', '本地数据修改已停止');
      }
      let nextMetaRaw;
      if (entry.writeMeta && entry.nextMeta !== undefined) nextMetaRaw = JSON.stringify(entry.nextMeta);
      if (nextMetaRaw !== undefined) {
        try {
          if (normalizedRaw(storage.getItem(ENGLISH_META_KEY)) !== entry.baseMetaRaw) throw planError('stale', '英语学习元数据已发生变化');
          storage.setItem(ENGLISH_META_KEY, nextMetaRaw);
          if (normalizedRaw(storage.getItem(ENGLISH_META_KEY)) !== nextMetaRaw) throw planError('write-verification-failed', '英语学习元数据写入后校验失败');
        } catch (error) {
          let metaRollbackFailed = false;
          try {
            if (entry.baseMetaRaw === null) storage.removeItem(ENGLISH_META_KEY);
            else storage.setItem(ENGLISH_META_KEY, entry.baseMetaRaw);
          } catch (_) { metaRollbackFailed = true; }
          try {
            await englishStore.update(updated.afterStable, () => cloneJson(updated.before));
          } catch (_) {
            throw planError('rollback-failed', '英语学习数据写入失败，且跨存储回滚未能完成');
          }
          if (metaRollbackFailed) throw planError('rollback-failed', '英语学习元数据写入失败，且 localStorage 回滚未能完成');
          throw error;
        }
      }
      return {
        beforeDigest: digest(updated.before), afterDigest: digest(updated.after),
        changedCount: entry.rows.length, wordId: entry.generatedWordId
      };
    }

    async function apply(planId, signal) {
      cleanup();
      const id = String(planId || '');
      const previous = spent.get(id);
      if (previous) {
        if (previous.status === 'applied') {
          return { status: 'already-consumed', applied: false, planId: id, previousStatus: 'applied', repeated: true };
        }
        return { ...previous, repeated: true };
      }
      const entry = pending.get(id);
      if (!entry || entry.state !== 'pending') return { status: 'unknown', applied: false, planId: id };
      entry.state = 'applying';
      const AbortControllerType = root && root.AbortController || (typeof AbortController !== 'undefined' ? AbortController : null);
      entry.abortController = AbortControllerType ? new AbortControllerType() : null;
      let onExternalAbort = null;
      if (signal && entry.abortController) {
        onExternalAbort = () => entry.abortController.abort();
        signal.addEventListener('abort', onExternalAbort, { once: true });
        if (signal.aborted) onExternalAbort();
      }
      const applySignal = entry.abortController ? entry.abortController.signal : signal;
      if (entry.expiresAt <= now()) {
        pending.delete(id);
        const expired = { status: 'expired', applied: false, planId: id };
        rememberSpent(id, expired);
        if (signal && onExternalAbort) signal.removeEventListener('abort', onExternalAbort);
        return { ...expired };
      }
      let result;
      try {
        if (applySignal && applySignal.aborted) throw planError('cancelled', '本地数据修改已停止');
        if (entry.module === 'english') result = await applyEnglish(entry, applySignal);
        else {
          applyStorageChanges(storage, entry.baseRawByKey, entry.nextRawByKey);
          result = {
            beforeDigest: digest(entry.baseRawByKey), afterDigest: digest(entry.nextRawByKey),
            changedCount: entry.rows.length
          };
        }
        const revision = emitRevision({ module: entry.module, resource: entry.resource });
        const receipt = {
          status: 'applied', applied: true, planId: id, module: entry.module,
          resource: entry.resource, operation: entry.operation, appliedAt: now(),
          changedCount: result.changedCount, beforeDigest: result.beforeDigest,
          afterDigest: result.afterDigest, ...(result.wordId ? { wordId: result.wordId } : {}),
          revision: revision && revision.revision ? revision.revision : undefined
        };
        pending.delete(id);
        rememberSpent(id, receipt);
        return { ...receipt };
      } catch (error) {
        pending.delete(id);
        const status = error && error.code === 'stale' ? 'stale' : (error && error.code === 'cancelled' ? 'cancelled' : 'failed');
        const receipt = {
          status, applied: false, planId: id,
          error: String(error && error.message || '本地数据修改失败').slice(0, 500)
        };
        rememberSpent(id, receipt);
        return { ...receipt };
      } finally {
        if (signal && onExternalAbort) signal.removeEventListener('abort', onExternalAbort);
      }
    }

    function stats() {
      cleanup();
      return { pending: pending.size, spent: spent.size };
    }

    return Object.freeze({ capture, preview, cancel, cancelAll, apply, stats });
  }

  return Object.freeze({
    PLAN_TTL_MS,
    COC_KEY,
    COC_KEYS,
    APPEARANCE_KEYS,
    VISIT_HISTORY_KEY,
    ENGLISH_META_KEY,
    WORDS_DB,
    WORDS_STORE,
    WORDS_KEY,
    RECORDS_KEY,
    REVISION_KEY,
    REVISION_CHANNEL,
    makeVocabRecord,
    makeRecordsRecord,
    stableStringify,
    digest,
    localFingerprint,
    createIndexedDbEnglishStore,
    createIndexedDbVocabStore,
    createController
  });
});
