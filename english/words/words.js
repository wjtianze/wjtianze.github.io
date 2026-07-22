/* ============================================================
   天择背单词 · words.js
   IIFE 模块化：Store / Vocab / Records / Quiz / Spell / WrongBook
                / Stats / AI / TTS / UI / App
   ============================================================ */
(function () {
'use strict';

/* ============================================================
   工具函数
   ============================================================ */
const $  = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

const escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const uid = () => 'w_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const daysBetween = (t1, t2) => Math.floor((t2 - t1) / 86400000);

const yieldToMain = () => new Promise(resolve => {
  // 用 MessageChannel 让出主线程：零延迟 macrotask，不受窗口隐藏/后台 rAF 节流影响。
  // 原先用 requestAnimationFrame，但窗口最小化或标签页切到后台时 rAF 会被节流到约
  // 1 次/秒，导致批量导入每批 yield 等待约 1 秒，7000 词要 20+ 秒甚至卡死。
  if (typeof MessageChannel !== 'undefined') {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => { ch.port1.close(); ch.port2.close(); resolve(); };
    ch.port2.postMessage(null);
  } else if (typeof setTimeout === 'function') {
    setTimeout(resolve, 0);
  } else {
    resolve();
  }
});

const parseJsonAsync = (text) => new Promise((resolve, reject) => {
  if (typeof Worker !== 'function' || typeof Blob !== 'function' || typeof URL === 'undefined') {
    try { resolve(JSON.parse(text)); } catch (e) { reject(e); }
    return;
  }
  const source = 'self.onmessage=function(e){try{self.postMessage({ok:true,data:JSON.parse(e.data)})}catch(err){self.postMessage({ok:false,error:err.message})}}';
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  const worker = new Worker(url);
  const finish = () => { worker.terminate(); URL.revokeObjectURL(url); };
  worker.onmessage = e => {
    finish();
    if (e.data && e.data.ok) resolve(e.data.data);
    else reject(new Error((e.data && e.data.error) || 'JSON 解析失败'));
  };
  worker.onerror = e => { finish(); reject(new Error(e.message || 'JSON 解析失败')); };
  worker.postMessage(text);
});

const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.random() * (i + 1) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

const normalizeExamples = (value) => {
  const result = [];
  const add = (item) => {
    if (item == null) return;
    if (Array.isArray(item)) { item.forEach(add); return; }
    if (typeof item === 'string' || typeof item === 'number') {
      const en = String(item).trim();
      if (en) result.push({ en, zh: '' });
      return;
    }
    if (typeof item !== 'object') return;
    const en = item.en != null ? item.en
      : (item.english != null ? item.english
      : (item.sentence != null ? item.sentence
      : (item.example != null ? item.example : item.text)));
    const zh = item.zh != null ? item.zh
      : (item.cn != null ? item.cn
      : (item.chinese != null ? item.chinese : item.translation));
    if (en != null || zh != null) {
      const cleanEn = en == null ? '' : String(en).trim();
      const cleanZh = zh == null ? '' : String(zh).trim();
      if (cleanEn || cleanZh) result.push({ en: cleanEn, zh: cleanZh });
      return;
    }
    Object.values(item).forEach(add);
  };
  add(value);
  const seen = new Set();
  return result.filter(item => {
    const key = item.en + '\u0000' + item.zh;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// 简易 Markdown → HTML（标题/列表/粗体/代码/段落）
const renderMd = (md) => {
  if (!md) return '';
  const lines = escapeHtml(md).split('\n');
  let html = '', inUl = false, inOl = false;
  const closeList = () => {
    if (inUl) { html += '</ul>'; inUl = false; }
    if (inOl) { html += '</ol>'; inOl = false; }
  };
  for (const line of lines) {
    const t = line.trim();
    if (!t) { closeList(); continue; }
    let m;
    if (m = t.match(/^(#{1,6})\s+(.*)$/)) {
      closeList();
      const lvl = m[1].length;
      html += `<h${lvl}>${m[2]}</h${lvl}>`;
    } else if (m = t.match(/^[-*]\s+(.*)$/)) {
      if (!inUl) { closeList(); html += '<ul>'; inUl = true; }
      html += `<li>${m[1]}</li>`;
    } else if (m = t.match(/^\d+\.\s+(.*)$/)) {
      if (!inOl) { closeList(); html += '<ol>'; inOl = true; }
      html += `<li>${m[1]}</li>`;
    } else {
      closeList();
      html += `<p>${t}</p>`;
    }
  }
  closeList();
  // 行内：粗体、代码
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
             .replace(/`([^`]+)`/g, '<code>$1</code>');
  return html;
};

const formatTime = (ts) => {
  if (!ts) return '从未';
  const diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
  return Math.floor(diff / 86400000) + ' 天前';
};

/* ============================================================
   DB 子模块（IndexedDB 持久化大块数据：vocab / records）
   ------------------------------------------------------------
   localStorage 单 key 受 ~5MB 限制，且 setItem 是同步阻塞主线程
   的操作。导入 7000+ 词时，JSON.stringify(整个state) + setItem
   会卡死 UI 数百毫秒到数秒，甚至因超配额直接抛错失败。
   把最大的两块（vocab 词库数组、records 学习记录对象）迁到
   IndexedDB：异步读写、无容量限制、不阻塞 UI。内存缓存保证
   同步读接口（DB.vocab()/DB.records()），写入防抖异步落盘。
   meta（stats/wrongBook/examples/aiConfig/settings）仍走
   localStorage，体积小、结构简单。
   ============================================================ */
const DB = {
  DB_NAME: 'tzwords',
  DB_VERSION: 1,
  STORE: 'kv',
  LEGACY_KEY: 'tzwords_state_v1',   // 旧版统一 state（含 vocab/records）
  META_KEY: 'tzwords_meta_v1',      // 新版 meta（stats/wrongBook/examples/aiConfig/settings/version）
  _db: null,
  _cache: { vocab: null, records: null },
  _recTimer: null,

  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(this.STORE)) d.createObjectStore(this.STORE, { keyPath: 'k' });
      };
      req.onsuccess = (e) => { this._db = e.target.result; resolve(this._db); };
      req.onerror = () => reject(req.error);
    });
  },
  _get(k) {
    return this.open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, 'readonly');
      const rq = tx.objectStore(this.STORE).get(k);
      rq.onsuccess = () => resolve(rq.result ? rq.result.v : undefined);
      rq.onerror = () => reject(rq.error);
    }));
  },
  _set(k, v) {
    return this.open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, 'readwrite');
      tx.objectStore(this.STORE).put({ k, v });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  },

  // 启动加载 + 旧数据迁移（旧 localStorage state → IndexedDB + meta key）
  async loadAll() {
    try {
      let vocab = await this._get('vocab');
      let records = await this._get('records');
      const needMigrate = (!vocab || !vocab.length) && (!records || !Object.keys(records).length);
      if (needMigrate) {
        const legacy = localStorage.getItem(this.LEGACY_KEY);
        if (legacy) {
          try {
            const s = JSON.parse(legacy);
            if (Array.isArray(s.vocab) && s.vocab.length) { vocab = s.vocab; await this._set('vocab', vocab); }
            if (s.records && typeof s.records === 'object' && !Array.isArray(s.records)) { records = s.records; await this._set('records', records); }
            const meta = {
              stats: s.stats, wrongBook: s.wrongBook, examples: s.examples,
              aiConfig: s.aiConfig, settings: s.settings, version: s.version
            };
            localStorage.setItem(this.META_KEY, JSON.stringify(meta));
            localStorage.removeItem(this.LEGACY_KEY);
            console.log('[DB] 已从旧版 localStorage 迁移词库到 IndexedDB');
          } catch (e) { console.warn('[DB] 迁移失败', e); }
        }
      }
      this._cache.vocab = Array.isArray(vocab) ? vocab : [];
      this._cache.records = (records && typeof records === 'object' && !Array.isArray(records)) ? records : {};
    } catch (e) {
      console.warn('[DB] loadAll 失败，回退空缓存', e);
      this._cache.vocab = [];
      this._cache.records = {};
    }
    return this._cache;
  },

  vocab() { return this._cache.vocab || []; },
  records() { return this._cache.records || {}; },

  // 立即写 vocab（导入/清空用，低频）
  async saveVocab(v) {
    this._cache.vocab = Array.isArray(v) ? v : [];
    await this._set('vocab', this._cache.vocab);
  },
  // 立即写 records（清空用）
  async saveRecords(r) {
    this._cache.records = r || {};
    try { await this._set('records', this._cache.records); }
    catch (e) { console.warn('[DB] saveRecords 失败', e); }
  },
  // 防抖写 records（答题高频，不阻塞 UI）
  commitRecords(delay) {
    if (this._recTimer) clearTimeout(this._recTimer);
    this._recTimer = setTimeout(() => {
      this._recTimer = null;
      this._set('records', this._cache.records).catch(e => console.warn('[DB] records 持久化失败', e));
    }, delay == null ? 1200 : delay);
  },
  // 立即冲刷待写的 records（页面隐藏/卸载时调用，防丢）
  flushRecords() {
    if (this._recTimer) { clearTimeout(this._recTimer); this._recTimer = null; }
    try { this._set('records', this._cache.records).catch(() => {}); } catch (e) {}
  }
};

/* ============================================================
   Store 子模块（localStorage 持久化 meta：stats/wrongBook/
   examples/aiConfig/settings；vocab/records 由 DB 托管）
   ============================================================ */
const Store = {
  KEY: 'tzwords_meta_v1',
  _cache: null,
  _saveTimer: null,
  SAVE_DELAY: 1000,

  _defaultState() {
    return {
      vocab: [],
      records: {},
      stats: {
        totalAnswered: 0,
        totalCorrect: 0,
        learnedWordIds: [],
        streakDays: 0,
        lastStudyDate: '',
        studyLog: {}
      },
      wrongBook: [],
      examples: {},
      aiConfig: {
        url: 'https://api.deepseek.com/v1/chat/completions',
        key: '',
        model: 'deepseek-chat',
        temperature: 0.6
      },
      settings: {
        quizMode: 'both',
        quizCount: 10,
        ttsEnabled: true,
        ttsRate: 0.95,
        ttsVoiceURI: null
      },
      version: 1
    };
  },

  _newRecord(id) {
    return {
      wordId: id,
      seen: 0, correct: 0, wrong: 0,
      streak: 0, mastery: 0,
      lastReview: 0, lastMode: null,
      wrongDetail: []
    };
  },

  load() {
    if (this._cache) return this._cache;
    try {
      const raw = localStorage.getItem(this.KEY);
      const def = this._defaultState();
      if (!raw) { this._cache = def; return this._cache; }
      const s = JSON.parse(raw);
      // meta 不含 vocab/records（由 DB/IndexedDB 托管）
      this._cache = Object.assign(def, s, {
        stats: Object.assign(def.stats, s.stats || {}),
        aiConfig: Object.assign(def.aiConfig, s.aiConfig || {}),
        settings: Object.assign(def.settings, s.settings || {}),
        wrongBook: s.wrongBook || [],
        examples: s.examples || {}
      });
      return this._cache;
    } catch (e) {
      console.warn('Store.load 失败，回退默认状态', e);
      this._cache = this._defaultState();
      return this._cache;
    }
  },

  save(state) {
    this._cache = state;
    try {
      // 只持久化 meta 字段，vocab/records 由 DB 托管，避免大对象阻塞 localStorage
      const meta = {
        stats: state.stats,
        wrongBook: state.wrongBook,
        examples: state.examples,
        aiConfig: state.aiConfig,
        settings: state.settings,
        version: state.version
      };
      localStorage.setItem(this.KEY, JSON.stringify(meta));
      return true;
    } catch (e) {
      console.error('Store.save 失败', e);
      UI && UI.toast('存储失败：可能 localStorage 空间不足或处于隐私模式', 'error');
      return false;
    }
  },

  get() {
    if (!this._cache) this._cache = this.load();
    return this._cache;
  },

  commit(immediate) {
    if (immediate) {
      if (this._saveTimer) clearTimeout(this._saveTimer);
      this._saveTimer = null;
      return this.save(this._cache);
    }
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.save(this._cache);
    }, this.SAVE_DELAY);
    return true;
  },

  flush() { return this.commit(true); },

  vocab() { return DB.vocab(); },
  records() { return DB.records(); },
  record(id) {
    const records = DB.records();
    const r = records[id];
    if (r) return r;
    const nr = this._newRecord(id);
    records[id] = nr;
    return nr;
  },
  aiConfig() { return this.get().aiConfig; },
  setAIConfig(c) { this.get().aiConfig = c; this.commit(); },
  settings() { return this.get().settings; },
  stats() { return this.get().stats; },

  touchStreak() {
    const s = this.stats();
    const today = todayStr();
    if (s.lastStudyDate === today) return;
    if (s.lastStudyDate) {
      const diff = daysBetween(new Date(s.lastStudyDate + 'T00:00:00').getTime(), Date.now());
      if (diff === 1) s.streakDays = (s.streakDays || 0) + 1;
      else if (diff > 1) s.streakDays = 1;
    } else {
      s.streakDays = 1;
    }
    s.lastStudyDate = today;
  },

  addStudyLog(correct) {
    const s = this.stats();
    const today = todayStr();
    if (!s.studyLog[today]) s.studyLog[today] = { answered: 0, correct: 0 };
    s.studyLog[today].answered++;
    if (correct) s.studyLog[today].correct++;
  }
};

/* ============================================================
   Vocab 子模块（词库导入/校验/查询）
   ============================================================ */
const Vocab = {
  _idIndex: null,
  _idIndexVocab: null,

  _ensureIdIndex() {
    const vocab = Store.vocab();
    if (this._idIndexVocab !== vocab || !this._idIndex) {
      this._idIndex = new Map(vocab.map(v => [v.id, v]));
      this._idIndexVocab = vocab;
    }
    return this._idIndex;
  },

  _invalidateIndex() {
    this._idIndex = null;
    this._idIndexVocab = null;
  },

  normalize(parsed) {
    let arr;
    if (Array.isArray(parsed)) arr = parsed;
    else if (parsed && Array.isArray(parsed.words)) arr = parsed.words;
    else if (parsed && typeof parsed === 'object') {
      // 单条对象
      arr = [parsed];
    } else throw new Error('JSON 应为数组、对象或 {words:[...]} 结构');
    return arr;
  },

  validate(item) {
    if (!item || typeof item !== 'object') return { ok: false, error: '条目非对象' };
    if (typeof item.word !== 'string' || !item.word.trim()) return { ok: false, error: '缺少 word 字段' };
    let meaning = item.meaning;
    if (typeof meaning === 'string') meaning = [meaning];
    if (!Array.isArray(meaning) || meaning.length === 0) return { ok: false, error: '缺少 meaning 数组' };
    meaning = meaning.map(m => String(m).trim()).filter(Boolean);
    if (meaning.length === 0) return { ok: false, error: 'meaning 为空' };
    // 去重保序
    const seen = new Set();
    meaning = meaning.filter(m => {
      const k = m.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
    return {
      ok: true,
      item: {
        word: item.word.trim(),
        phonetic: typeof item.phonetic === 'string' ? item.phonetic.trim() : '',
        pos: typeof item.pos === 'string' ? item.pos.trim() : '',
        meaning,
        examples: normalizeExamples(item.examples != null ? item.examples : item.example),
        tags: Array.isArray(item.tags) ? item.tags.map(String) : []
      }
    };
  },

  async import(parsed, onProgress) {
    const arr = this.normalize(parsed);
    const nextVocab = DB.vocab().slice();
    const existing = new Map(); // lowercase word → 索引
    nextVocab.forEach((v, i) => { existing.set(v.word.toLowerCase(), i); });
    let count = 0, skipped = 0;
    const skipReasons = [];
    const importedAt = Date.now();
    const batchSize = 300;
    for (let start = 0; start < arr.length; start += batchSize) {
      const end = Math.min(start + batchSize, arr.length);
      for (let i = start; i < end; i++) {
        const v = this.validate(arr[i]);
        if (!v.ok) { skipped++; if (skipReasons.length < 20) skipReasons.push(v.error); continue; }
        const lw = v.item.word.toLowerCase();
        if (existing.has(lw)) {
          const idx = existing.get(lw);
          const old = nextVocab[idx];
          const mset = new Set((old.meaning || []).map(m => String(m).toLowerCase()));
          v.item.meaning.forEach(m => {
            if (!mset.has(m.toLowerCase())) { old.meaning.push(m); mset.add(m.toLowerCase()); }
          });
          if (v.item.phonetic && !old.phonetic) old.phonetic = v.item.phonetic;
          if (v.item.pos && !old.pos) old.pos = v.item.pos;
          if (v.item.examples.length) old.examples = normalizeExamples(normalizeExamples(old.examples).concat(v.item.examples));
          if (v.item.tags.length) old.tags = Array.from(new Set([...(old.tags || []), ...v.item.tags]));
        } else {
          const id = uid();
          nextVocab.push(Object.assign({ id, addedAt: importedAt }, v.item));
          existing.set(lw, nextVocab.length - 1);
        }
        count++;
      }
      if (onProgress) onProgress(end, arr.length);
      if (end < arr.length) await yieldToMain();
    }
    await DB.saveVocab(nextVocab);
    this._invalidateIndex();
    return { count, skipped, skipReasons };
  },

  export() {
    return JSON.stringify(Store.vocab().map(v => ({
      word: v.word, phonetic: v.phonetic, pos: v.pos,
      meaning: v.meaning, examples: v.examples, tags: v.tags
    })), null, 2);
  },

  clear() {
    const s = Store.get();
    s.wrongBook = []; s.examples = {};
    s.stats.learnedWordIds = [];
    s.stats.totalAnswered = 0; s.stats.totalCorrect = 0;
    s.stats.studyLog = {};
    // vocab/records 由 IndexedDB 托管：同步清内存缓存，异步落盘
    DB.saveVocab([]).catch(e => console.warn('clear saveVocab 失败', e));
    DB.saveRecords({}).catch(e => console.warn('clear saveRecords 失败', e));
    this._invalidateIndex();
    Store.commit(true);
  },

  byId(id) {
    const index = this._ensureIdIndex();
    const cached = index.get(id);
    if (cached || index.size === Store.vocab().length) return cached;
    this._invalidateIndex();
    return this._ensureIdIndex().get(id);
  },

  search(q) {
    q = (q || '').trim().toLowerCase();
    if (!q) return Store.vocab();
    return Store.vocab().filter(v =>
      v.word.toLowerCase().includes(q) ||
      v.meaning.some(m => m.toLowerCase().includes(q)) ||
      (v.pos || '').toLowerCase().includes(q)
    );
  }
};

/* ============================================================
   Records 子模块（学习记录与掌握度）
   ============================================================ */
const Records = {
  masteryFromStreak(streak) {
    if (streak <= 0) return 0;
    if (streak <= 2) return 1;
    if (streak <= 4) return 2;
    if (streak <= 7) return 3;
    if (streak <= 11) return 4;
    return 5;
  },

  weight(wordId) {
    const r = Store.records()[wordId];
    if (!r) return 45 + Math.random();
    const days = r.lastReview ? daysBetween(r.lastReview, Date.now()) : 30;
    return (5 - (r.mastery || 0)) * 3 + days + Math.random();
  },

  mark(wordId, { mode, correct, your, right }) {
    const state = Store.get();
    const r = Store.record(wordId);
    r.seen++;
    r.lastReview = Date.now();
    r.lastMode = mode;

    if (correct) {
      r.correct++;
      r.streak = (r.streak || 0) + 1;
      r.mastery = this.masteryFromStreak(r.streak);
    } else {
      r.wrong++;
      r.streak = 0;
      r.mastery = Math.max(0, (r.mastery || 0) - 1);
      r.wrongDetail.push({ mode, time: Date.now(), your, right });
      if (r.wrongDetail.length > 20) r.wrongDetail = r.wrongDetail.slice(-20);
    }

    // learnedWordIds
    if (!state.stats.learnedWordIds.includes(wordId)) {
      state.stats.learnedWordIds.push(wordId);
    }

    // wrongBook
    const wb = state.wrongBook;
    const widx = wb.findIndex(x => x.wordId === wordId);
    if (correct) {
      // 连续答对 3 次出册
      if (widx >= 0 && r.streak >= 3) {
        wb.splice(widx, 1);
        UI && UI.toast(`「${(Vocab.byId(wordId) || {}).word || ''}」连续答对 3 次，已移出错词本`, 'success');
      }
    } else {
      if (widx >= 0) {
        wb[widx].wrong = r.wrong;
        wb[widx].lastWrong = Date.now();
      } else {
        wb.push({ wordId, wrong: r.wrong, lastWrong: Date.now() });
      }
    }

    // stats
    state.stats.totalAnswered++;
    if (correct) state.stats.totalCorrect++;
    Store.touchStreak();
    Store.addStudyLog(correct);
    Store.commit();        // meta（stats/wrongBook）落 localStorage
    DB.commitRecords();    // records 防抖异步落 IndexedDB
  },

  masteredCount() {
    let n = 0;
    const records = Store.records();
    for (const id in records) if ((records[id].mastery || 0) >= 3) n++;
    return n;
  }
};

/* ============================================================
   WrongBook 子模块（错词本排序与重练）
   ============================================================ */
const WrongBook = {
  list() {
    const wb = Store.get().wrongBook.slice();
    return wb.sort((a, b) => {
      if (b.wrong !== a.wrong) return b.wrong - a.wrong;
      if (b.lastWrong !== a.lastWrong) return b.lastWrong - a.lastWrong;
      const wa = (Vocab.byId(a.wordId) || {}).word || '';
      const wb_ = (Vocab.byId(b.wordId) || {}).word || '';
      return wa.localeCompare(wb_);
    });
  },

  count() { return Store.get().wrongBook.length; }
};

/* ============================================================
   Quiz 子模块（释义四选一）
   ============================================================ */
const Quiz = {
  session: null,

  async start(opts) {
    const vocab = Store.vocab();
    if (!vocab.length) {
      UI.toast('词库为空，请先导入词库', 'warn');
      UI.switchView('vocab');
      return;
    }
    let pool;
    if (opts.wrongOnly) {
      const wb = WrongBook.list();
      pool = wb.map(x => Vocab.byId(x.wordId)).filter(Boolean);
      if (!pool.length) {
        UI.toast('错词本为空', 'warn');
        return;
      }
    } else {
      pool = vocab.slice();
    }
    const need = Math.min(opts.count, pool.length);
    if (need < opts.count) {
      UI.toast(`词库仅 ${pool.length} 个，本轮 ${need} 题`, 'warn');
    }
    // 加权抽题
    const weighted = pool.map(w => ({ w, weight: Records.weight(w.id) }))
                         .sort((a, b) => b.weight - a.weight);
    const words = weighted.slice(0, need).map(x => x.w);
    this.session = {
      words, idx: 0, mode: opts.mode, results: [], startTime: Date.now(),
      distractors: null
    };

    // AI 干扰项
    if (opts.aiDistractor) {
      if (!AI.isReady()) {
        UI.toast('开启 AI 干扰项需先配置 AI，将使用本地干扰项', 'warn');
      } else {
        UI.showQuizLoading();
        try {
          const res = await AI.generateDistractors(words, (delta, full) => {
            UI.updateQuizLoading(full);
          });
          const distractors = AI.parseDistractorsJson(res.content, words);
          if (distractors && Object.keys(distractors).length) {
            this.session.distractors = distractors;
            UI.toast('✅ AI 干扰项已生成', 'success');
          } else {
            UI.toast('AI 干扰项格式异常，使用本地干扰项', 'warn');
          }
        } catch (e) {
          UI.toast('AI 干扰项失败：' + e.message + '，使用本地', 'warn');
        }
      }
    }

    UI.showQuizPlay();
    this.render();
  },

  buildQuestion(word, mode) {
    mode = mode === 'both' ? (Math.random() < 0.5 ? 'cn2en' : 'en2cn') : mode;
    const all = Store.vocab();
    const aiD = this.session && this.session.distractors ? this.session.distractors[word.word] : null;

    if (mode === 'cn2en') {
      // 中译英：题干只展示一个释义（随机选一条），四选一选英文
      const answer = word.word;
      const promptMeaning = word.meaning[Math.floor(Math.random() * word.meaning.length)];
      // 干扰项：优先 AI 生成，不足用本地补充
      let distractorWords = [];
      if (aiD && aiD.en && aiD.en.length) {
        distractorWords = aiD.en.slice();
      }
      // 本地补充
      if (distractorWords.length < 3) {
        let localPool = shuffle(all.filter(v => v.id !== word.id && v.pos === word.pos));
        if (localPool.length < 3 - distractorWords.length) {
          localPool = localPool.concat(shuffle(all.filter(v => v.id !== word.id && v.pos !== word.pos)));
        }
        for (const v of localPool) {
          if (distractorWords.length >= 3) break;
          if (!distractorWords.includes(v.word) && v.word !== answer) distractorWords.push(v.word);
        }
      }
      const optsSet = new Set([answer.toLowerCase()]);
      const opts = [{ text: answer, value: word.id, correct: true }];
      for (const d of distractorWords) {
        if (opts.length >= 4) break;
        if (!optsSet.has(d.toLowerCase())) { optsSet.add(d.toLowerCase()); opts.push({ text: d, value: null, correct: false }); }
      }
      while (opts.length < 4) opts.push({ text: '—', value: null, correct: false });
      const shuffled = shuffle(opts);
      return {
        word, mode, prompt: promptMeaning, promptMulti: false,
        sub: `${word.pos || ''} ${word.phonetic || ''}`.trim(),
        options: shuffled, multi: false, tts: word.word
      };
    } else {
      // 英译中：不定项选择，一个释义一个选项，选出所有符合该单词的释义
      const correctMeanings = word.meaning.slice(0, 4);
      const distractorCount = Math.max(2, 6 - correctMeanings.length);
      const usedText = new Set(correctMeanings.map(m => m.toLowerCase()));
      const distractors = [];
      // 优先 AI 干扰项
      if (aiD && aiD.cn && aiD.cn.length) {
        for (const d of aiD.cn) {
          if (distractors.length >= distractorCount) break;
          if (!usedText.has(d.toLowerCase())) { usedText.add(d.toLowerCase()); distractors.push(d); }
        }
      }
      // 本地补充
      if (distractors.length < distractorCount) {
        const pool = shuffle(all.filter(v => v.id !== word.id));
        for (const v of pool) {
          if (distractors.length >= distractorCount) break;
          for (const m of v.meaning) {
            if (distractors.length >= distractorCount) break;
            if (!usedText.has(m.toLowerCase())) { usedText.add(m.toLowerCase()); distractors.push(m); }
          }
        }
      }
      while (distractors.length < distractorCount) distractors.push('—');
      const opts = shuffle(
        correctMeanings.map(m => ({ text: m, correct: true }))
          .concat(distractors.map(m => ({ text: m, correct: false })))
      );
      return {
        word, mode, prompt: word.word, promptMulti: false,
        sub: word.phonetic || '',
        options: opts, multi: true, tts: word.word,
        correctCount: correctMeanings.length
      };
    }
  },

  render() {
    const s = this.session;
    if (!s) return;
    const w = s.words[s.idx];
    const mode = s.mode === 'both' ? (s._mode || (s._mode = Math.random() < 0.5 ? 'cn2en' : 'en2cn'))
                                   : s.mode;
    const q = this.buildQuestion(w, mode);
    s.current = q;
    UI.renderQuizQuestion(q, s.idx + 1, s.words.length);
  },

  answer(value) {
    const s = this.session;
    if (!s || !s.current) return;
    const q = s.current;
    let correct = false;
    let yourAns = '', rightAns = '';
    if (q.mode === 'cn2en') {
      // 四选一：value 是 word.id
      correct = (value === q.word.id);
      yourAns = (Vocab.byId(value) || {}).word || '（未选）';
      rightAns = q.word.word;
    } else {
      // 不定项：value 是选中的释义文本数组
      const selectedTexts = Array.isArray(value) ? value : [];
      const correctTexts = q.options.filter(o => o.correct).map(o => o.text);
      const selectedSet = new Set(selectedTexts);
      const correctSet = new Set(correctTexts);
      correct = selectedSet.size === correctSet.size &&
                [...selectedSet].every(t => correctSet.has(t));
      yourAns = selectedTexts.join('；') || '（未选）';
      rightAns = correctTexts.join('；');
    }
    Records.mark(q.word.id, { mode: 'quiz', correct, your: yourAns, right: rightAns });
    s.results.push({ word: q.word, correct, mode: q.mode });
    UI.showQuizFeedback(correct, q, value);
    UI.renderTopStats();
  },

  next() {
    const s = this.session;
    if (!s) return;
    s.idx++;
    if (s.idx >= s.words.length) {
      this.finish();
    } else {
      this.render();
    }
  },

  skip() {
    const s = this.session;
    if (!s || !s.current) return;
    Records.mark(s.current.word.id, {
      mode: 'quiz', correct: false, your: '（跳过）', right: s.current.word.word
    });
    s.results.push({ word: s.current.word, correct: false, mode: s.current.mode, skipped: true });
    this.next();
  },

  finish() {
    const s = this.session;
    if (!s) return;
    const correct = s.results.filter(r => r.correct).length;
    const total = s.results.length;
    const dur = Math.round((Date.now() - s.startTime) / 1000);
    const wrongList = s.results.filter(r => !r.correct);
    UI.showQuizResult({
      correct, total, dur, wrongList,
      onRestart: () => { this.session = null; UI.showQuizStart(); },
      onWrongPractice: () => {
        this.session = null;
        UI.showQuizStart();
        $('#qWrongOnly').checked = true;
        setTimeout(() => this.start({
          count: parseInt($('#qCount').value) || 10,
          mode: $('#qMode').value,
          wrongOnly: true
        }), 50);
      }
    });
    this.session = null;
  }
};

/* ============================================================
   Spell 子模块（拼写考察）
   ============================================================ */
/* ===== Study 子模块（四阶段学习：英译中预习→中译英→英译中→拼写） ===== */
const Study = {
  session: null,
  STAGES: [
    { name: '英译中（预习）', mode: 'en2cn', type: 'quiz', isPreview: true, desc: '答完一个单词就展示完整释义' },
    { name: '中译英', mode: 'cn2en', type: 'quiz', isPreview: false, desc: '看中文释义选英文单词' },
    { name: '英译中', mode: 'en2cn', type: 'quiz', isPreview: false, desc: '巩固练习，检验记忆' },
    { name: '拼写', mode: 'spell', type: 'spell', isPreview: false, desc: '根据一个释义拼写单词' }
  ],

  async start(opts) {
    const vocab = Store.vocab();
    if (!vocab.length) { UI.toast('词库为空，请先导入词库', 'warn'); UI.switchView('vocab'); return; }
    let pool;
    if (opts.wrongOnly) {
      const wb = WrongBook.list();
      pool = wb.map(x => Vocab.byId(x.wordId)).filter(Boolean);
      if (!pool.length) { UI.toast('错词本为空', 'warn'); return; }
    } else {
      pool = vocab.slice();
    }
    const need = Math.min(opts.count, pool.length);
    if (need < opts.count) UI.toast('词库仅 ' + pool.length + ' 个，本轮 ' + need + ' 个', 'warn');
    const weighted = pool.map(w => ({ w, weight: Records.weight(w.id) })).sort((a, b) => b.weight - a.weight);
    const words = weighted.slice(0, need).map(x => x.w);
    this.session = { words, stageIdx: 0, idx: 0, stageResults: [[],[],[],[]], startTime: Date.now(), distractors: null, opts };

    if (opts.aiDistractor) {
      if (!AI.isReady()) {
        UI.toast('开启 AI 干扰项需先配置 AI，将使用本地干扰项', 'warn');
      } else {
        UI.showStudyLoading();
        try {
          const res = await AI.generateDistractors(words, (delta, full) => UI.updateStudyLoading(full));
          const distractors = AI.parseDistractorsJson(res.content, words);
          if (distractors && Object.keys(distractors).length) { this.session.distractors = distractors; UI.toast('✅ AI 干扰项已生成', 'success'); }
          else UI.toast('AI 干扰项格式异常，使用本地干扰项', 'warn');
        } catch (e) { UI.toast('AI 干扰项失败：' + e.message + '，使用本地', 'warn'); }
      }
    }
    UI.showStudyStage(0, null);
  },

  startStage() { this.session.idx = 0; UI.showStudyPlay(); this.render(); },

  buildQuestion(word) {
    const stage = this.STAGES[this.session.stageIdx];
    if (stage.type === 'spell') {
      const meaning = word.meaning[Math.floor(Math.random() * word.meaning.length)];
      return { type: 'spell', word, promptMeaning: meaning };
    }
    const mode = stage.mode;
    const all = Store.vocab();
    const aiD = this.session.distractors ? this.session.distractors[word.word] : null;
    if (mode === 'cn2en') {
      const answer = word.word;
      let dw = [];
      if (aiD && aiD.en && aiD.en.length) dw = aiD.en.slice();
      if (dw.length < 3) {
        let lp = shuffle(all.filter(v => v.id !== word.id && v.pos === word.pos));
        if (lp.length < 3 - dw.length) lp = lp.concat(shuffle(all.filter(v => v.id !== word.id && v.pos !== word.pos)));
        for (const v of lp) { if (dw.length >= 3) break; if (!dw.includes(v.word) && v.word !== answer) dw.push(v.word); }
      }
      const os = new Set([answer.toLowerCase()]);
      const opts = [{ text: answer, value: word.id, correct: true }];
      for (const d of dw) { if (opts.length >= 4) break; if (!os.has(d.toLowerCase())) { os.add(d.toLowerCase()); opts.push({ text: d, value: null, correct: false }); } }
      while (opts.length < 4) opts.push({ text: '—', value: null, correct: false });
      return { type: 'quiz', word, mode, prompt: word.meaning[Math.floor(Math.random() * word.meaning.length)], sub: (word.pos || '') + ' ' + (word.phonetic || ''), subTrim: (word.pos || '' + ' ' + (word.phonetic || '')).trim(), options: shuffle(opts), multi: false };
    } else {
      const cm = word.meaning.slice(0, 4);
      const dc = Math.max(2, 6 - cm.length);
      const ut = new Set(cm.map(m => m.toLowerCase()));
      const ds = [];
      if (aiD && aiD.cn && aiD.cn.length) { for (const d of aiD.cn) { if (ds.length >= dc) break; if (!ut.has(d.toLowerCase())) { ut.add(d.toLowerCase()); ds.push(d); } } }
      if (ds.length < dc) { const p = shuffle(all.filter(v => v.id !== word.id)); for (const v of p) { if (ds.length >= dc) break; for (const m of v.meaning) { if (ds.length >= dc) break; if (!ut.has(m.toLowerCase())) { ut.add(m.toLowerCase()); ds.push(m); } } } }
      while (ds.length < dc) ds.push('—');
      const opts = shuffle(cm.map(m => ({ text: m, correct: true })).concat(ds.map(m => ({ text: m, correct: false }))));
      return { type: 'quiz', word, mode, prompt: word.word, sub: word.phonetic || '', options: opts, multi: true, correctCount: cm.length };
    }
  },

  render() {
    const s = this.session; if (!s) return;
    const w = s.words[s.idx];
    const q = this.buildQuestion(w);
    s.current = q;
    UI.renderStudyQuestion(q, s.stageIdx, s.idx + 1, s.words.length);
  },

  answer(value) {
    const s = this.session; if (!s || !s.current) return;
    const q = s.current;
    const stage = this.STAGES[s.stageIdx];
    let correct = false, yourAns = '', rightAns = '';
    if (q.type === 'spell') {
      const user = (typeof value === 'string') ? value.trim() : '';
      const right = q.word.word;
      correct = user.toLowerCase() === right.toLowerCase();
      yourAns = user || '（未输入）'; rightAns = right;
    } else if (q.mode === 'cn2en') {
      correct = (value === q.word.id);
      yourAns = (Vocab.byId(value) || {}).word || '（未选）'; rightAns = q.word.word;
    } else {
      const st = Array.isArray(value) ? value : [];
      const ct = q.options.filter(o => o.correct).map(o => o.text);
      const ss = new Set(st), cs = new Set(ct);
      correct = ss.size === cs.size && [...ss].every(t => cs.has(t));
      yourAns = st.join('；') || '（未选）'; rightAns = ct.join('；');
    }
    Records.mark(q.word.id, { mode: stage.type === 'spell' ? 'spell' : 'quiz', correct, your: yourAns, right: rightAns });
    s.stageResults[s.stageIdx].push({ word: q.word, correct, mode: q.mode, type: q.type, your: yourAns });
    UI.showStudyFeedback(correct, q, value, stage.isPreview);
    UI.renderTopStats();
  },

  next() {
    const s = this.session; if (!s) return;
    s.idx++;
    if (s.idx >= s.words.length) this.finishStage(); else this.render();
  },

  skip() {
    const s = this.session; if (!s || !s.current) return;
    const stage = this.STAGES[s.stageIdx];
    let rightAns = '';
    if (s.current.type === 'spell') rightAns = s.current.word.word;
    else if (s.current.mode === 'cn2en') rightAns = s.current.word.word;
    else rightAns = s.current.options.filter(o => o.correct).map(o => o.text).join('；');
    Records.mark(s.current.word.id, { mode: stage.type === 'spell' ? 'spell' : 'quiz', correct: false, your: '（跳过）', right: rightAns });
    s.stageResults[s.stageIdx].push({ word: s.current.word, correct: false, skipped: true });
    this.next();
  },

  finishStage() {
    const s = this.session;
    const results = s.stageResults[s.stageIdx];
    const correct = results.filter(r => r.correct).length;
    const total = results.length;
    s.stageIdx++;
    if (s.stageIdx >= this.STAGES.length) this.finish();
    else UI.showStudyStage(s.stageIdx, { correct, total });
  },

  finish() {
    const s = this.session;
    const allResults = s.stageResults.flat();
    const correct = allResults.filter(r => r.correct).length;
    const total = allResults.length;
    const dur = Math.round((Date.now() - s.startTime) / 1000);
    UI.showStudyResult({
      stages: this.STAGES.map((st, i) => ({ name: st.name, correct: s.stageResults[i].filter(r => r.correct).length, total: s.stageResults[i].length })),
      correct, total, dur,
      onRestart: () => { this.session = null; UI.showStudyStart(); }
    });
    this.session = null;
  }
};

const Spell = {
  session: null,

  start(opts) {
    const vocab = Store.vocab();
    if (!vocab.length) {
      UI.toast('词库为空，请先导入词库', 'warn');
      UI.switchView('vocab');
      return;
    }
    let pool;
    if (opts.wrongOnly) {
      const wb = WrongBook.list();
      pool = wb.map(x => Vocab.byId(x.wordId)).filter(Boolean);
      if (!pool.length) { UI.toast('错词本为空', 'warn'); return; }
    } else {
      pool = vocab.slice();
    }
    const need = Math.min(opts.count, pool.length);
    if (need < opts.count) UI.toast(`词库仅 ${pool.length} 个，本轮 ${need} 题`, 'warn');
    const weighted = pool.map(w => ({ w, weight: Records.weight(w.id) }))
                         .sort((a, b) => b.weight - a.weight);
    const words = weighted.slice(0, need).map(x => x.w);
    this.session = { words, idx: 0, results: [], startTime: Date.now(), hinted: false };
    UI.showSpellPlay();
    this.render();
  },

  render() {
    const s = this.session;
    if (!s) return;
    const w = s.words[s.idx];
    s.current = w;
    s.hinted = false;
    UI.renderSpellQuestion(w, s.idx + 1, s.words.length);
  },

  submit() {
    const s = this.session;
    if (!s || !s.current) return;
    const input = $('#spInput');
    const user = input.value.trim();
    if (!user) { UI.toast('请输入拼写', 'warn'); return; }
    const right = s.current.word;
    const correct = user.toLowerCase() === right.toLowerCase();
    Records.mark(s.current.id, {
      mode: 'spell', correct,
      your: user, right
    });
    s.results.push({ word: s.current, correct, your: user });
    UI.showSpellFeedback(correct, user, right, s.current);
    UI.renderTopStats();
  },

  hint() {
    const s = this.session;
    if (!s || !s.current) return;
    s.hinted = true;
    const right = s.current.word;
    const placeholder = right[0] + '·'.repeat(Math.max(0, right.length - 1));
    $('#spInput').setAttribute('placeholder', `提示：${placeholder}（共 ${right.length} 字母）`);
    UI.toast('已显示首字母提示', 'info');
  },

  next() {
    const s = this.session;
    if (!s) return;
    s.idx++;
    if (s.idx >= s.words.length) this.finish();
    else this.render();
  },

  finish() {
    const s = this.session;
    if (!s) return;
    const correct = s.results.filter(r => r.correct).length;
    const total = s.results.length;
    const dur = Math.round((Date.now() - s.startTime) / 1000);
    const wrongList = s.results.filter(r => !r.correct).map(r => ({
      word: r.word, correct: false, your: r.your
    }));
    UI.showSpellResult({
      correct, total, dur, wrongList,
      onRestart: () => { this.session = null; UI.showSpellStart(); }
    });
    this.session = null;
  }
};

/* ============================================================
   Stats 子模块（统计渲染）
   ============================================================ */
const Stats = {
  accuracy() {
    const s = Store.stats();
    return s.totalAnswered ? s.totalCorrect / s.totalAnswered : 0;
  },

  learnedCount() { return Store.stats().learnedWordIds.length; },
  masteredCount() { return Records.masteredCount(); },
  streakDays() { return Store.stats().streakDays || 0; },

  render() {
    $('#sLearned').textContent = this.learnedCount();
    $('#sAccuracy').textContent = Math.round(this.accuracy() * 100) + '%';
    $('#sStreak').textContent = this.streakDays();
    $('#sMastered').textContent = this.masteredCount();

    this.renderChart();
    this.renderMastery();
    this.renderWrongList('wrongList');
    this.renderWrongList('wrongListFull');
  },

  renderChart() {
    const log = Store.stats().studyLog || {};
    const today = new Date();
    const bars = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const item = log[key] || { answered: 0 };
      bars.push({ key, answered: item.answered, label: `${d.getMonth() + 1}/${d.getDate()}` });
    }
    const max = Math.max(1, ...bars.map(b => b.answered));
    const html = bars.map(b => {
      const h = b.answered ? Math.max(4, (b.answered / max) * 100) : 0;
      const cls = b.answered ? '' : 'empty';
      const tip = b.answered ? `${b.label}：${b.answered} 题` : `${b.label}：无记录`;
      return `<div class="cb ${cls}" style="height:${h}%;" data-tip="${tip}" title="${tip}"></div>`;
    }).join('');
    $('#chartBars').innerHTML = html;
  },

  renderMastery() {
    const records = Store.records();
    const dist = [0, 0, 0, 0, 0, 0];
    for (const id in records) {
      const m = records[id].mastery || 0;
      if (m >= 0 && m <= 5) dist[m]++;
    }
    const max = Math.max(1, ...dist);
    const labels = ['未掌握', '生疏', '熟悉', '较熟', '熟练', '精通'];
    const html = labels.map((label, i) => {
      const w = (dist[i] / max) * 100;
      return `<div class="md-row">
        <span class="md-label">${label} (${i})</span>
        <div class="md-bar"><i style="width:${w}%;"></i></div>
        <span class="md-count">${dist[i]}</span>
      </div>`;
    }).join('');
    $('#masteryDist').innerHTML = html;
  },

  renderWrongList(elId) {
    const el = $('#' + elId);
    if (!el) return;
    const list = WrongBook.list();
    if (!list.length) {
      el.innerHTML = '<div class="empty-state"><div class="es-icon">✨</div><div>暂无错词，继续保持！</div></div>';
      return;
    }
    el.innerHTML = list.map(item => {
      const w = Vocab.byId(item.wordId);
      if (!w) return '';
      return `<div class="wrong-item">
        <div class="wi-word">${escapeHtml(w.word)}</div>
        <div class="wi-meaning">${escapeHtml((w.meaning || []).slice(0, 2).join('；'))}</div>
        <span class="wi-count">×${item.wrong}</span>
        <div class="wi-actions">
          <button data-act="analyze" data-id="${w.id}">🔍</button>
          <button data-act="practice" data-id="${w.id}">▶</button>
        </div>
      </div>`;
    }).join('');
  }
};

/* ============================================================
   AI 子模块（OpenAI 兼容流式调用）
   ============================================================ */
const AI = {
  // 检测是否在天择OS内运行（被 iframe 嵌入且同源）
  _inOS() {
    try { return window.parent !== window && !!localStorage.getItem('tzos_state_v1'); }
    catch (e) { return false; }
  },

  // 读取天择OS的AI配置（统一走全站 TZAI 助手，见 assets/js/main.js）
  _osAIConfig() {
    if (window.TZAI && window.TZAI.osConfig) return window.TZAI.osConfig();
    return null;
  },

  config() {
    // 在OS内运行时必须使用OS的通用AI配置（不再使用应用内单独配置）
    if (this._inOS()) {
      const osCfg = this._osAIConfig();
      if (osCfg) { if (typeof osCfg.temperature !== 'number') osCfg.temperature = 0.6; return osCfg; }
      // OS 未配置：返回空配置（isReady=false），引导用户去 OS 的「AI 配置」设置
      return { url: '', key: '', model: '', temperature: 0.6 };
    }
    const c = Object.assign({}, Store.aiConfig());
    if (typeof c.temperature !== 'number') c.temperature = 0.6;
    return c;
  },

  isReady() {
    const c = this.config();
    return !!(c.url && c.key && c.model);
  },

  async chatStream(messages, onChunk, opts) {
    opts = opts || {};
    const c = this.config();
    if (!this.isReady()) {
      throw new Error(this._inOS()
        ? 'AI 未配置：天择OS 通用配置中尚未设置 API Key，请在天择OS 的「🔑 AI 配置」中设置'
        : 'AI 未配置，请先在「🔑 AI 配置」中设置 URL、Key 和模型');
    }
    const reqBody = {
      model: c.model,
      messages,
      temperature: opts.temperature != null ? opts.temperature : c.temperature,
      max_tokens: opts.max_tokens || 4000,
      stream: true
    };
    // SSE 解析：把到达的原始文本喂进来，逐行解析 data: 块
    let buf = '', full = '', reasoning = '';
    const onReasoning = opts.onReasoning;
    let sawDone = false;
    const consume = (text) => {
      buf += text;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t || !t.startsWith('data:')) continue;
        const data = t.slice(5).trim();
        if (data === '[DONE]') { sawDone = true; continue; }
        try {
          const j = JSON.parse(data);
          const delta = (j.choices && j.choices[0] && j.choices[0].delta) || {};
          if (delta.reasoning_content) {
            reasoning += delta.reasoning_content;
            if (onReasoning) onReasoning(delta.reasoning_content, reasoning);
          }
          if (delta.content) {
            full += delta.content;
            if (onChunk) onChunk(delta.content, full);
          }
        } catch (_) { /* 忽略解析失败的中间行 */ }
      }
    };

    // 天择OS 桌面版：经父窗口 tzDesktop 桥由主进程 net.fetch 发请求（绕开渲染层 CORS 限制）
    let tzBridge = null;
    try { if (window.parent && window.parent.tzDesktop && window.parent.tzDesktop.requestAI) tzBridge = window.parent.tzDesktop; } catch (e) {}
    if (tzBridge) {
      const reqId = 'words-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      const timer = setTimeout(() => { try { tzBridge.abortAI(reqId); } catch (e) {} }, 90000);
      try {
        const resp = await tzBridge.requestAI({ id: reqId, url: c.url, key: c.key, body: reqBody }, consume);
        clearTimeout(timer);
        if (resp && resp.status && (resp.status < 200 || resp.status >= 300)) throw new Error('AI 接口错误 ' + resp.status);
        if (buf.trim()) consume('\n');
        return { content: full, reasoning };
      } catch (e) {
        clearTimeout(timer);
        if (e && e.name === 'AbortError') throw new Error('请求超时（90 秒），请检查网络或重试');
        throw e;
      }
    }

    // 网页版：直接 fetch（服务商需允许跨域；DeepSeek/GLM/硅基等均可）
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90000);
    let res;
    try {
      res = await fetch(c.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + c.key
        },
        body: JSON.stringify(reqBody),
        signal: ctrl.signal
      });
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw new Error('请求超时（90 秒），请检查网络或重试');
      throw new Error('网络错误：' + (e.message || e) + '（请检查 API 地址与网络连接）');
    }
    if (!res.ok) {
      clearTimeout(timer);
      const t = await res.text().catch(() => '');
      let msg = `AI 接口错误 ${res.status}`;
      try { const j = JSON.parse(t); msg += '：' + ((j.error && j.error.message) || t.slice(0, 200)); }
      catch (_) { if (t) msg += '：' + t.slice(0, 200); }
      throw new Error(msg);
    }
    if (!res.body) {
      // 非流式兜底
      const data = await res.json().catch(() => ({}));
      const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      if (onChunk) onChunk(content, content);
      clearTimeout(timer);
      return { content, reasoning: '' };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        consume(dec.decode(value, { stream: true }));
        if (sawDone) break;
      }
    } catch (e) {
      clearTimeout(timer);
      if (full) return { content: full, reasoning, interrupted: true };
      throw new Error('流式读取异常：' + (e.message || e));
    }
    if (buf.trim()) consume(dec.decode());
    clearTimeout(timer);
    return { content: full, reasoning };
  },

  async chat(messages, opts) {
    opts = opts || {};
    const r = await this.chatStream(messages, null, Object.assign({}, opts, { stream: false }));
    return r.content;
  },

  async test() {
    return this.chat([
      { role: 'system', content: 'Reply with the single word: OK' },
      { role: 'user', content: 'ping' }
    ], { max_tokens: 16, temperature: 0 });
  },

  async generateQuiz(words, onChunk, onReasoning) {
    const sys = `你是英语词汇教学专家。根据给出的单词列表，为每个单词生成一道四选一释义题，重点考察一词多义的辨析。

严格按 JSON 数组输出，不要任何额外文字、说明或代码块标记。每个题目对象格式：
{
  "word": "原单词",
  "stem": "题干（中文，描述选择要求，如：下列哪个选项是 XXX 的正确释义）",
  "options": ["选项A","选项B","选项C","选项D"],
  "answer": 0,
  "explain": "1-2 句解析，说明正确项为何对、干扰项错在哪"
}

要求：
- options 必须是 4 个字符串，answer 是正确选项的索引（0-3）
- 一词多义时，正确选项应覆盖主要义项，干扰项来自其他单词的常见释义
- 题干和解析使用中文，选项内容根据题干决定（中→英则选项为英文单词，英→中则选项为中文释义）

单词列表（JSON）：`;
    const user = JSON.stringify(words.map(w => ({
      word: w.word, meaning: w.meaning, pos: w.pos, phonetic: w.phonetic
    })));
    return this.chatStream(
      [{ role: 'system', content: sys }, { role: 'user', content: user }],
      onChunk,
      { temperature: 0.5, max_tokens: 4000, onReasoning }
    );
  },

  async analyzeWord(word, onChunk, onReasoning) {
    const sys = `你是英语词源与记忆法专家。对用户给出的单词进行深度解析，严格按以下结构输出 Markdown：

## 词根词缀
拆分词根、前缀、后缀，说明各自含义与来源。若单词无明显词根结构，简要说明。

## 助记
提供 2-3 种记忆方法（联想/谐音/词根组合/语境记忆），生动易记。

## 一词多义
列出主要义项，按使用频率排序，简要说明语义演变脉络。若只有一义可省略此节。

## 例句
3 个地道例句（英文+中文翻译），覆盖不同义项与语境。

## 易混淆
列出 2-3 个形态或语义易混词并简要辨析。

输出要求：使用规范的 Markdown，标题用 ##，列表用 - ，例句独立成段。不要输出额外说明。`;
    const user = `单词：${word.word}\n词性：${word.pos || '未知'}\n音标：${word.phonetic || '未知'}\n已知释义：${(word.meaning || []).join('；')}`;
    return this.chatStream(
      [{ role: 'system', content: sys }, { role: 'user', content: user }],
      onChunk,
      { temperature: 0.6, max_tokens: 2500, onReasoning }
    );
  },

  // 生成例句（单个单词）
  async generateExamples(word, onChunk) {
    const sys = `你是英语词汇教学专家。为给定单词生成 3 个地道例句，要求：
- 覆盖该单词的不同义项和常见用法
- 英文例句自然地道，难度适中（适合大学生水平）
- 附带准确的中文翻译
- 严格按 JSON 数组输出，不要任何额外文字或代码块标记：
[{"en":"英文例句","zh":"中文翻译"}, {"en":"...","zh":"..."}, {"en":"...","zh":"..."}]`;
    const user = `单词：${word.word}\n词性：${word.pos || '未知'}\n音标：${word.phonetic || '未知'}\n释义：${(word.meaning || []).join('；')}`;
    return this.chatStream(
      [{ role: 'system', content: sys }, { role: 'user', content: user }],
      onChunk,
      { temperature: 0.7, max_tokens: 1200 }
    );
  },

  // 批量生成干扰项（整轮题目，同时生成中英两种）
  async generateDistractors(words, onChunk) {
    const sys = `你是英语词汇教学专家，擅长设计高质量选择题干扰项。为以下每个单词同时生成英文干扰项和中文释义干扰项各 3 个。

干扰项要求（极其重要）：
- 必须具有强干扰性：与正确答案语义相近、词性相同、形态相似，能真正难住学生
- 英文干扰项(en)：形近词（如 accommodate/accomplish/accumulate）、义近词、同词族词，词性尽量相同
- 中文干扰项(cn)：语义相近、容易混淆的中文释义，来自义近词或同领域词
- 绝对不能是正确答案本身或其释义
- 要让不懂这个词的学生真的会选错

严格按 JSON 对象输出，不要任何额外文字或代码块标记：
{"单词1": {"en": ["英文干扰1","英文干扰2","英文干扰3"], "cn": ["中文干扰1","中文干扰2","中文干扰3"]}, "单词2": {...}}

单词列表（JSON）：`;
    const user = JSON.stringify(words.map(w => ({
      word: w.word, meaning: w.meaning, pos: w.pos
    })));
    return this.chatStream(
      [{ role: 'system', content: sys }, { role: 'user', content: user }],
      onChunk,
      { temperature: 0.85, max_tokens: 4000 }
    );
  },

  parseDistractorsJson(text, words) {
    if (!text) return null;
    let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    let obj;
    try { obj = JSON.parse(t); } catch (_) {
      const m = t.match(/\{[\s\S]*\}/);
      if (m) { try { obj = JSON.parse(m[0]); } catch (e) { return null; } }
      else return null;
    }
    if (!obj || typeof obj !== 'object') return null;
    const result = {};
    words.forEach(w => {
      const v = obj[w.word];
      if (v && typeof v === 'object') {
        const en = Array.isArray(v.en) ? v.en.map(s => String(s).trim()).filter(Boolean) : [];
        const cn = Array.isArray(v.cn) ? v.cn.map(s => String(s).trim()).filter(Boolean) : [];
        if (en.length || cn.length) result[w.word] = { en, cn };
      } else if (Array.isArray(v)) {
        // 兼容旧格式（纯数组）
        result[w.word] = { en: v.map(s => String(s).trim()).filter(Boolean), cn: [] };
      }
    });
    return result;
  },

  // 解析 AI 出题返回的 JSON（容错）
  parseQuizJson(text) {
    if (!text) return null;
    let t = text.trim();
    // 去除代码块标记
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    try { return JSON.parse(t); } catch (_) {}
    // 提取最外层 [...]
    const m = t.match(/\[[\s\S]*\]/);
    if (m) {
      try { return JSON.parse(m[0]); } catch (_) {}
    }
    return null;
  }
};

/* ============================================================
   TTS 子模块（SpeechSynthesis）
   ============================================================ */
const TTS = {
  supported: 'speechSynthesis' in window,
  voices: [],
  _ready: false,

  init() {
    if (!this.supported) return;
    const load = () => {
      this.voices = speechSynthesis.getVoices();
      this._ready = true;
    };
    load();
    speechSynthesis.onvoiceschanged = load;
    setTimeout(load, 200);
  },

  speak(text, opts) {
    if (!this.supported) {
      UI.toast('当前浏览器不支持语音合成', 'warn');
      return;
    }
    if (!text) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      const settings = Store.settings();
      u.rate = (opts && opts.rate != null) ? opts.rate : (settings.ttsRate != null ? settings.ttsRate : 0.95);
      // 优先选 en-US 女声
      let v = this.voices.find(x => /en[-_]US/i.test(x.lang) && /female|samantha|zira|google|susan|tessa/i.test(x.name));
      if (!v) v = this.voices.find(x => /en[-_]US/i.test(x.lang));
      if (!v) v = this.voices.find(x => /^en/i.test(x.lang));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (e) {
      console.warn('TTS 错误', e);
    }
  },

  disableBtn(btn) {
    if (!btn) return;
    if (!this.supported) {
      btn.disabled = true;
      btn.title = '当前浏览器不支持语音合成';
    }
  }
};

/* ============================================================
   UI 子模块（DOM 渲染与视图切换）
   ============================================================ */
const UI = {
  currentView: 'vocab',
  VOCAB_PAGE_SIZE: 120,
  _vocabList: [],
  _vocabRendered: 0,
  _vocabObserver: null,

  switchView(name) {
    this.currentView = name;
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    $$('.panel').forEach(p => {
      const active = p.id === 'view-' + name;
      p.classList.toggle('active', active);
      if (active) p.removeAttribute('hidden');
      else p.setAttribute('hidden', '');
    });
    if (name === 'stats') Stats.render();
    if (name === 'wrong') Stats.renderWrongList('wrongListFull');
  },

  toast(msg, type) {
    type = type || 'info';
    const wrap = $('#toastWrap');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 320);
    }, 3200);
  },

  openModal(id) {
    const m = $('#' + id);
    if (m) m.removeAttribute('hidden');
  },
  closeModal(id) {
    const m = $('#' + id);
    if (m) m.setAttribute('hidden', '');
  },

  renderTopStats() {
    const learned = Stats.learnedCount();
    const acc = Math.round(Stats.accuracy() * 100);
    const streak = Stats.streakDays();
    const tsL = $('#tsLearned'), tsA = $('#tsAcc'), tsS = $('#tsStreak');
    if (tsL) tsL.textContent = learned;
    if (tsA) tsA.textContent = acc + '%';
    if (tsS) tsS.textContent = streak;

    // 词库面板统计
    const vocab = Store.vocab();
    const total = vocab.length;
    const wrong = WrongBook.count();
    const mastered = Stats.masteredCount();
    const vsTotal = $('#vsTotal'), vsLearned = $('#vsLearned'), vsWrong = $('#vsWrong'), vsMastered = $('#vsMastered');
    if (vsTotal) vsTotal.textContent = total;
    if (vsLearned) vsLearned.textContent = learned;
    if (vsWrong) vsWrong.textContent = wrong;
    if (vsMastered) vsMastered.textContent = mastered;
  },

  renderVocabList(filter) {
    const el = $('#vocabList');
    this._vocabList = Vocab.search(filter);
    this._vocabRendered = 0;
    if (this._vocabObserver) this._vocabObserver.disconnect();
    if (!this._vocabList.length) {
      el.innerHTML = `<div class="empty-state">
        <div class="es-icon">${filter ? '🔍' : '📚'}</div>
        <div>${filter ? '未找到匹配的单词' : '词库为空，点击「导入 JSON」开始'}</div>
      </div>`;
      return;
    }
    el.innerHTML = '';
    this._appendVocabPage();
  },

  _appendVocabPage() {
    const el = $('#vocabList');
    if (!el || this._vocabRendered >= this._vocabList.length) return;
    const records = Store.records();
    const start = this._vocabRendered;
    const end = Math.min(start + this.VOCAB_PAGE_SIZE, this._vocabList.length);
    const html = this._vocabList.slice(start, end).map(w => {
      const r = records[w.id];
      const mastery = (r && r.mastery) || 0;
      const dots = Array.from({ length: 5 }, (_, i) =>
        `<i class="${i < mastery ? 'on' : ''}"></i>`
      ).join('');
      return `<div class="vocab-item" data-id="${w.id}">
        <div class="vi-word">${escapeHtml(w.word)}</div>
        ${w.pos ? `<span class="vi-pos">${escapeHtml(w.pos)}</span>` : ''}
        ${w.phonetic ? `<span class="vi-phon">${escapeHtml(w.phonetic)}</span>` : ''}
        <div class="vi-meaning">${escapeHtml((w.meaning || []).join('；'))}</div>
        <div class="vi-mastery" title="掌握度 ${mastery}/5">${dots}</div>
        <div class="vi-actions">
          <button class="vi-btn" data-act="examples" data-id="${w.id}" title="AI 例句">📖</button>
          <button class="vi-btn" data-act="analyze" data-id="${w.id}" title="AI 解析">🤖</button>
        </div>
      </div>`;
    }).join('');
    el.insertAdjacentHTML('beforeend', html);
    this._vocabRendered = end;
    this._observeVocabTail();
  },

  _observeVocabTail() {
    if (this._vocabObserver) this._vocabObserver.disconnect();
    if (this._vocabRendered >= this._vocabList.length) return;
    const el = $('#vocabList');
    const tail = el && el.lastElementChild;
    if (!tail) return;
    if ('IntersectionObserver' in window) {
      this._vocabObserver = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) this._appendVocabPage();
      }, { root: el, rootMargin: '240px 0px' });
      this._vocabObserver.observe(tail);
    } else {
      const more = document.createElement('button');
      more.className = 'btn btn--ghost vocab-more';
      more.textContent = `加载更多（${this._vocabList.length - this._vocabRendered}）`;
      more.addEventListener('click', () => { more.remove(); this._appendVocabPage(); });
      el.appendChild(more);
    }
  },

  // ===== 释义考察 =====
  showQuizStart() {
    $('#quizStart').removeAttribute('hidden');
    $('#quizPlay').setAttribute('hidden', '');
    $('#quizResult').setAttribute('hidden', '');
  },
  showQuizPlay() {
    $('#quizStart').setAttribute('hidden', '');
    $('#quizResult').setAttribute('hidden', '');
    $('#quizPlay').removeAttribute('hidden');
  },

  showStudyStart() {
    this._showStudyState("studyStart");
  },
  showStudyStage(stageIdx, prevResult) {
    this._showStudyState("studyStage");
    var stages = Study.STAGES;
    var html = stages.map(function(st, i) {
      var cls = "si-step";
      if (i < stageIdx) cls += " done";
      else if (i === stageIdx) cls += " active";
      var icon = i < stageIdx ? "\u2713" : (i + 1);
      return "<span class=\"" + cls + "\">" + icon + " " + escapeHtml(st.name) + "</span>" + (i < stages.length - 1 ? "<span class=\"si-arrow\">\u2192</span>" : "");
    }).join("");
    $("#stIndicator").innerHTML = html;
    $("#stStageTitle").textContent = "\u9636\u6bb5 " + (stageIdx + 1) + "/" + stages.length + "\uff1a" + stages[stageIdx].name;
    $("#stStageDesc").textContent = stages[stageIdx].desc;
    var sr = $("#stStageResult");
    if (prevResult) {
      var pct = prevResult.total ? Math.round(prevResult.correct / prevResult.total * 100) : 0;
      sr.innerHTML = "<div class=\"sr-row\"><span>\u4e0a\u4e00\u9636\u6bb5\u6210\u7ee9</span><b>" + prevResult.correct + " / " + prevResult.total + "\uff08" + pct + "%\uff09</b></div>";
      sr.classList.add("show");
      $("#btnStageStart").textContent = "\u8fdb\u5165\u4e0b\u4e00\u9636\u6bb5 \u2192";
    } else {
      sr.classList.remove("show");
      sr.innerHTML = "";
      $("#btnStageStart").textContent = "\u5f00\u59cb\u672c\u9636\u6bb5 \u2192";
    }
  },
  showStudyLoading() {
    this._showStudyState("studyLoading");
    $("#stLoadingText").textContent = "\ud83e\udd16 AI \u6b63\u5728\u751f\u6210\u5e72\u6270\u9879\u2026";
  },
  updateStudyLoading(full) {
    var el = $("#stLoadingText");
    if (el && full) el.textContent = "\ud83e\udd16 AI \u6b63\u5728\u751f\u6210\u5e72\u6270\u9879\u2026\uff08\u5df2\u751f\u6210 " + full.length + " \u5b57\u7b26\uff09";
  },
  showStudyPlay() { this._showStudyState("studyPlay"); },
  _showStudyState(state) {
    ["studyStart","studyStage","studyLoading","studyPlay","studyResult"].forEach(function(id) {
      var el = $("#" + id);
      if (el) { if (id === state) el.removeAttribute("hidden"); else el.setAttribute("hidden", ""); }
    });
  },
  renderStudyQuestion(q, stageIdx, idx, total) {
    var stages = Study.STAGES;
    var html = stages.map(function(st, i) {
      var cls = "si-step";
      if (i < stageIdx) cls += " done"; else if (i === stageIdx) cls += " active";
      return "<span class=\"" + cls + "\">" + (i < stageIdx ? "\u2713" : (i + 1)) + "</span>" + (i < stages.length - 1 ? "<span class=\"si-arrow\">\u2192</span>" : "");
    }).join("");
    $("#stIndicator2").innerHTML = html;
    $("#stProg").textContent = idx + " / " + total;
    $("#stBar").style.width = (idx / total * 100) + "%";
    var promptEl = $("#stPrompt"), subEl = $("#stSub");
    var inputEl = $("#stInput"), spellExtra = $("#stSpellExtra");
    var optsEl = $("#stOptions");
    if (q.type === "spell") {
      promptEl.className = "q-prompt";
      promptEl.innerHTML = "<div class=\"sp-pos\">" + escapeHtml(q.word.pos || "") + "</div>" +
        (q.word.phonetic ? "<div class=\"sp-phon\">" + escapeHtml(q.word.phonetic) + "</div>" : "") +
        "<ul class=\"sp-meaning\"><li data-i=\"\u2460\">" + escapeHtml(q.promptMeaning) + "</li></ul>";
      subEl.textContent = "";
      optsEl.innerHTML = ""; optsEl.style.display = "none";
      inputEl.removeAttribute("hidden"); inputEl.value = "";
      inputEl.setAttribute("placeholder", "\u8f93\u5165\u62fc\u5199\u2026");
      inputEl.removeAttribute("disabled");
      spellExtra.removeAttribute("hidden");
      TTS.disableBtn($("#stTts"));
      inputEl.focus();
      $("#stSubmit").setAttribute("hidden", ""); $("#stSubmit").textContent = "\u63d0\u4ea4";
    } else {
      optsEl.style.display = ""; inputEl.setAttribute("hidden", ""); spellExtra.setAttribute("hidden", "");
      promptEl.className = "q-prompt";
      // 英译中预习：题干下追加已缓存例句的英文作为语境（不显示中文，防泄题）
      var _stageInfo = Study.STAGES[stageIdx];
      if (_stageInfo && _stageInfo.isPreview && q.mode === 'en2cn') {
        var _exsEn = normalizeExamples(q.word.examples).concat(normalizeExamples(Store.get().examples[q.word.id]));
        var _exEn = _exsEn[0];
        if (_exEn && _exEn.en) {
          var _re = new RegExp('(' + q.word.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
          var _exHtml = escapeHtml(_exEn.en).replace(_re, '<span class="ex-hl">$1</span>');
          promptEl.innerHTML = '<div class="q-word">' + escapeHtml(q.prompt) + '</div><div class="q-example-en" title="例句语境">💬 ' + _exHtml + '</div>';
        } else {
          promptEl.textContent = q.prompt;
        }
      } else {
        promptEl.textContent = q.prompt;
      }
      subEl.textContent = q.sub || "";
      var isMulti = !!q.multi;
      optsEl.className = "quiz-options" + (isMulti ? " multi" : "");
      if (isMulti) {
        optsEl.innerHTML = q.options.map(function(o, i) {
          var letter = String.fromCharCode(65 + i);
          return "<button class=\"opt checkable\" data-idx=\"" + i + "\" data-correct=\"" + o.correct + "\" data-text=\"" + escapeHtml(o.text) + "\"><span style=\"color:var(--ink-faint);margin-right:8px;font-weight:600;\">" + letter + ".</span>" + escapeHtml(o.text) + "</button>";
        }).join("");
        subEl.innerHTML = (q.sub || "") + (q.sub ? " \u00b7 " : "") + "<span class=\"quiz-hint\">\ud83d\udccc \u4e0d\u5b9a\u9879\u9009\u62e9\uff0c\u9009\u51fa\u6240\u6709\u7b26\u5408\u7684\u91ca\u4e49</span>";
        $("#stSubmit").removeAttribute("hidden"); $("#stSubmit").textContent = "\u2713 \u63d0\u4ea4\u7b54\u6848";
      } else {
        optsEl.innerHTML = q.options.map(function(o, i) {
          var letter = String.fromCharCode(65 + i);
          return "<button class=\"opt\" data-idx=\"" + i + "\" data-correct=\"" + o.correct + "\"><span style=\"color:var(--ink-faint);margin-right:8px;font-weight:600;\">" + letter + ".</span>" + escapeHtml(o.text) + "</button>";
        }).join("");
        $("#stSubmit").setAttribute("hidden", "");
      }
    }
    $("#stFeedback").setAttribute("hidden", "");
    $("#stFeedback").className = "quiz-feedback";
    $("#stNext").setAttribute("hidden", "");
  },
  showStudyFeedback(correct, q, userSelection, isPreview) {
    var fb = $("#stFeedback");
    var isSpell = q.type === "spell";
    fb.className = (isSpell ? "spell-feedback " : "quiz-feedback ") + (correct ? "ok" : "bad");
    var html = correct ? "<div>\u2705 \u7b54\u5bf9\u4e86\uff01</div>" : "<div>\u274c \u7b54\u9519\u4e86</div>";
    if (isSpell) {
      var diffHtml = UI._diffHtml(typeof userSelection === "string" ? userSelection : "", q.word.word);
      html += "<div class=\"diff\">" + diffHtml + "</div>";
      if (!correct) html += "<div class=\"ans\" style=\"margin-top:6px;\">\u6b63\u786e\u62fc\u5199\uff1a<b>" + escapeHtml(q.word.word) + "</b></div>";
    } else if (q.mode === "cn2en") {
      if (!correct) html += "<div class=\"ans\">\u6b63\u786e\u7b54\u6848\uff1a" + escapeHtml(q.word.word) + "</div>";
    } else {
      var ct = q.options.filter(function(o){return o.correct;}).map(function(o){return o.text;});
      var sSet = new Set(Array.isArray(userSelection) ? userSelection : []);
      if (!correct) {
        html += "<div class=\"ans\">\u6b63\u786e\u91ca\u4e49\uff1a" + escapeHtml(ct.join("\uff1b")) + "</div>";
        var wp = [].concat(Array.from(sSet)).filter(function(t){return !ct.includes(t);});
        var ms = ct.filter(function(t){return !sSet.has(t);});
        if (wp.length) html += "<div class=\"ans\" style=\"color:#fca5a5;\">\u9519\u9009\uff1a" + escapeHtml(wp.join("\uff1b")) + "</div>";
        if (ms.length) html += "<div class=\"ans\" style=\"color:#fbbf24;\">\u6f0f\u9009\uff1a" + escapeHtml(ms.join("\uff1b")) + "</div>";
      }
    }
    if (isPreview) {
      html += "<div class=\"preview-card\"><div class=\"pv-head\">";
      html += "<span class=\"pv-word\">" + escapeHtml(q.word.word) + "</span>";
      if (q.word.pos) html += "<span class=\"pv-pos\">" + escapeHtml(q.word.pos) + "</span>";
      if (q.word.phonetic) html += "<span class=\"pv-phon\">" + escapeHtml(q.word.phonetic) + "</span>";
      html += "</div><ul class=\"pv-meaning\">";
      q.word.meaning.forEach(function(m, i) {
        html += "<li data-i=\"" + (CIRCLED[i] || (i + 1) + ".") + "\">" + escapeHtml(m) + "</li>";
      });
      html += "</ul>";
      var exs = normalizeExamples(q.word.examples);
      var cachedEx = Store.get().examples[q.word.id];
      if (cachedEx && cachedEx.length) exs = exs.concat(cachedEx);
      exs = exs.slice(0, 3);
      html += "<div class=\"pv-examples\" id=\"stPvExamples\"><div class=\"pv-examples-title\">📖 例句</div>";
      if (exs.length) {
        exs.forEach(function(example) {
          html += "<div class=\"pv-example\">";
          if (example.en) html += "<div class=\"pv-example-en\">" + escapeHtml(example.en) + "</div>";
          if (example.zh) html += "<div class=\"pv-example-zh\">" + escapeHtml(example.zh) + "</div>";
          html += "</div>";
        });
      } else {
        html += "<div class=\"pv-example-empty\" id=\"stPvExEmpty\">暂无例句</div>";
      }
      html += "</div></div>";
    } else {
      html += "<div class=\"ans\" style=\"color:var(--ink-dim);margin-top:4px;\">" + escapeHtml(q.word.word) + " \u2014 " + escapeHtml((q.word.meaning || []).join("\uff1b")) + "</div>";
    }
    html += "<div class=\"feedback-actions\"><button class=\"btn btn--ghost btn--sm\" id=\"stExamples\" data-wid=\"" + q.word.id + "\">\ud83d\udcd6 AI \u4f8b\u53e5</button><button class=\"btn btn--ghost btn--sm\" id=\"stAiAnalyze\" data-wid=\"" + q.word.id + "\">\ud83e\udd16 AI \u89e3\u6790</button></div>";
    fb.innerHTML = html;
    fb.removeAttribute("hidden");
    if (!isSpell) {
      $$("#stOptions .opt").forEach(function(btn) {
        btn.classList.add("locked");
        var isCorrect = btn.dataset.correct === "true";
        if (q.mode === "cn2en") {
          if (isCorrect) btn.classList.add("correct");
          else if (parseInt(btn.dataset.idx) === (UI._lastAnsweredIdx || -1)) btn.classList.add("wrong");
        } else {
          var text = btn.dataset.text;
          if (isCorrect) { btn.classList.add("correct"); if (!sSet.has(text)) btn.classList.add("missed"); }
          else if (sSet.has(text)) btn.classList.add("wrong");
        }
      });
    }
    if (isSpell) { $("#stInput").setAttribute("disabled", ""); $("#stSubmit").setAttribute("hidden", ""); }
    else if (q.multi) { $("#stSubmit").setAttribute("hidden", ""); }
    $("#stNext").removeAttribute("hidden");
    // 预习阶段无例句时，自动 AI 生成并缓存（确保每个单词都能看到例句）
    if (isPreview && !isSpell) {
      var _exs0 = normalizeExamples(q.word.examples);
      var _cached0 = Store.get().examples[q.word.id];
      if (_cached0 && _cached0.length) _exs0 = _exs0.concat(_cached0);
      if (!_exs0.length) {
        if (AI.isReady()) { UI._autoGenStudyExample(q.word); }
        else { var _e0 = document.getElementById('stPvExEmpty'); if (_e0) _e0.textContent = '暂无例句（配置 AI 后自动生成，或点下方「AI 例句」）'; }
      }
    }
  },
  // 预习反馈区：自动 AI 生成例句（异步，不阻塞答题；生成后缓存供下次使用）
  async _autoGenStudyExample(word) {
    var box = document.getElementById('stPvExamples');
    if (!box) return;
    box.innerHTML = '<div class="pv-examples-title">📖 例句</div><div class="pv-example-empty">🤖 AI 正在生成例句…</div>';
    try {
      var res = await AI.generateExamples(word, function(){});
      var items = null;
      try { items = JSON.parse(res.content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')); }
      catch (_) { var m = res.content.match(/\[[\s\S]*\]/); if (m) try { items = JSON.parse(m[0]); } catch (e) {} }
      var fb = document.getElementById('stFeedback');
      if (fb && fb.hasAttribute('hidden')) return; // 已进入下一题，放弃更新
      if (items && Array.isArray(items) && items.length) {
        var clean = items.filter(function(i){return i && i.en;}).slice(0, 3).map(function(i){return {en:String(i.en),zh:String(i.zh||'')};});
        Store.get().examples[word.id] = clean;
        Store.commit();
        var html2 = '<div class="pv-examples-title">📖 例句</div>';
        clean.forEach(function(ex){ html2 += '<div class="pv-example"><div class="pv-example-en">' + escapeHtml(ex.en) + '</div>' + (ex.zh ? '<div class="pv-example-zh">' + escapeHtml(ex.zh) + '</div>' : '') + '</div>'; });
        box.innerHTML = html2;
      } else {
        box.innerHTML = '<div class="pv-examples-title">📖 例句</div><div class="pv-example-empty">生成失败，可点下方「AI 例句」重试</div>';
      }
    } catch (e) {
      box.innerHTML = '<div class="pv-examples-title">📖 例句</div><div class="pv-example-empty">生成失败：' + escapeHtml(e.message) + '</div>';
    }
  },
  showStudyResult(data) {
    this._showStudyState("studyResult");
    var r = $("#studyResult");
    var acc = data.total ? Math.round(data.correct / data.total * 100) : 0;
    var mins = Math.floor(data.dur / 60), secs = data.dur % 60;
    var html = "<div class=\"qr-score\">" + data.correct + " / " + data.total + "</div>";
    html += "<div class=\"qr-meta\">\u603b\u6b63\u786e\u7387 " + acc + "% \u00b7 \u7528\u65f6 " + mins + "\u5206" + secs + "\u79d2</div>";
    html += "<div style=\"text-align:left;margin:16px 0;\">";
    data.stages.forEach(function(st, i) {
      var pct = st.total ? Math.round(st.correct / st.total * 100) : 0;
      html += "<div class=\"sr-row\"><span>\u9636\u6bb5" + (i + 1) + " " + escapeHtml(st.name) + "</span><b>" + st.correct + "/" + st.total + "\uff08" + pct + "%\uff09</b></div>";
    });
    html += "</div>";
    html += "<div class=\"actions\" style=\"justify-content:center;margin-top:20px;\"><button class=\"btn btn--ghost\" id=\"stRestart\">\u518d\u5b66\u4e00\u8f6e</button></div>";
    r.innerHTML = html;
    var btn = $("#stRestart"); if (btn) btn.onclick = data.onRestart;
  },

  showQuizLoading() {
    $('#quizStart').setAttribute('hidden', '');
    $('#quizResult').setAttribute('hidden', '');
    $('#quizPlay').removeAttribute('hidden');
    $('#qProg').textContent = '准备中…';
    $('#qBar').style.width = '0%';
    $('#qPrompt').className = 'q-prompt';
    $('#qPrompt').innerHTML = '<div class="ai-loading"><div class="spinner"></div><span>🤖 AI 正在生成高质量干扰项，请稍候…</span></div>';
    $('#qSub').textContent = '';
    $('#qOptions').innerHTML = '';
    $('#qFeedback').setAttribute('hidden', '');
    $('#qSubmit').setAttribute('hidden', '');
    $('#qNext').setAttribute('hidden', '');
  },

  updateQuizLoading(full) {
    // 流式输出预览（可选）
    const el = $('#qPrompt .ai-loading span');
    if (el && full) el.textContent = '🤖 AI 正在生成干扰项…' + (full.length > 50 ? '（已生成 ' + full.length + ' 字符）' : '');
  },

  renderQuizQuestion(q, idx, total) {
    $('#qProg').textContent = `${idx} / ${total}`;
    $('#qBar').style.width = (idx / total * 100) + '%';
    const promptEl = $('#qPrompt');
    const subEl = $('#qSub');
    promptEl.className = 'q-prompt';
    promptEl.textContent = q.prompt;
    TTS.disableBtn($('#qTts'));

    const optsEl = $('#qOptions');
    const isMulti = !!q.multi;
    optsEl.className = 'quiz-options' + (isMulti ? ' multi' : '');

    if (isMulti) {
      // 不定项选择
      optsEl.innerHTML = q.options.map((o, i) => {
        const letter = String.fromCharCode(65 + i);
        return `<button class="opt checkable" data-idx="${i}" data-correct="${o.correct}" data-text="${escapeHtml(o.text)}">
          <span style="color:var(--ink-faint);margin-right:8px;font-weight:600;">${letter}.</span>
          ${escapeHtml(o.text)}
        </button>`;
      }).join('');
      subEl.innerHTML = (q.sub || '') + (q.sub ? ' · ' : '') +
        `<span class="quiz-hint">📌 不定项选择，选出所有符合的释义</span>`;
      $('#qSubmit').removeAttribute('hidden');
    } else {
      // 四选一
      optsEl.innerHTML = q.options.map((o, i) => {
        const letter = String.fromCharCode(65 + i);
        return `<button class="opt" data-idx="${i}" data-correct="${o.correct}">
          <span style="color:var(--ink-faint);margin-right:8px;font-weight:600;">${letter}.</span>
          ${escapeHtml(o.text)}
        </button>`;
      }).join('');
      subEl.textContent = q.sub || '';
      $('#qSubmit').setAttribute('hidden', '');
    }

    $('#qFeedback').setAttribute('hidden', '');
    $('#qFeedback').className = 'quiz-feedback';
    $('#qNext').setAttribute('hidden', '');
  },

  showQuizFeedback(correct, q, userSelection) {
    const fb = $('#qFeedback');
    fb.className = 'quiz-feedback ' + (correct ? 'ok' : 'bad');
    let html = correct ? `<div>✅ 答对了！</div>` : `<div>❌ 答错了</div>`;

    if (q.mode === 'cn2en') {
      if (!correct) {
        html += `<div class="ans">正确答案：${escapeHtml(q.word.word)}</div>`;
      }
    } else {
      // 不定项
      const correctTexts = q.options.filter(o => o.correct).map(o => o.text);
      const selectedSet = new Set(Array.isArray(userSelection) ? userSelection : []);
      if (!correct) {
        html += `<div class="ans">正确释义：${escapeHtml(correctTexts.join('；'))}</div>`;
        const wrongPicks = [...selectedSet].filter(t => !correctTexts.includes(t));
        const missed = correctTexts.filter(t => !selectedSet.has(t));
        if (wrongPicks.length) html += `<div class="ans" style="color:#fca5a5;">错选：${escapeHtml(wrongPicks.join('；'))}</div>`;
        if (missed.length) html += `<div class="ans" style="color:#fbbf24;">漏选：${escapeHtml(missed.join('；'))}</div>`;
      }
    }
    html += `<div class="ans" style="color:var(--ink-dim);margin-top:4px;">${escapeHtml(q.word.word)} — ${escapeHtml((q.word.meaning || []).join('；'))}</div>`;
    html += `<div class="feedback-actions">
      <button class="btn btn--ghost btn--sm" id="fbExamples" data-wid="${q.word.id}">📖 AI 例句</button>
      <button class="btn btn--ghost btn--sm" id="fbAiAnalyze" data-wid="${q.word.id}">🤖 AI 解析</button>
    </div>`;
    fb.innerHTML = html;
    fb.removeAttribute('hidden');

    // 锁定选项，高亮对错
    $$('#qOptions .opt').forEach(btn => {
      btn.classList.add('locked');
      const isCorrect = btn.dataset.correct === 'true';
      if (q.mode === 'cn2en') {
        if (isCorrect) btn.classList.add('correct');
        else if (parseInt(btn.dataset.idx) === (this._lastAnsweredIdx || -1)) btn.classList.add('wrong');
      } else {
        // 不定项：正确项标绿，用户错选的标红，漏选的正确项标 missed
        const text = btn.dataset.text;
        if (isCorrect) {
          btn.classList.add('correct');
          if (!selectedSet.has(text)) btn.classList.add('missed');
        } else if (selectedSet.has(text)) {
          btn.classList.add('wrong');
        }
      }
    });

    $('#qSubmit').setAttribute('hidden', '');
    $('#qNext').removeAttribute('hidden');
  },

  showQuizResult({ correct, total, dur, wrongList, onRestart, onWrongPractice }) {
    $('#quizPlay').setAttribute('hidden', '');
    const r = $('#quizResult');
    r.removeAttribute('hidden');
    const acc = total ? Math.round(correct / total * 100) : 0;
    const mins = Math.floor(dur / 60);
    const secs = dur % 60;
    let html = `<div class="qr-score">${correct} / ${total}</div>`;
    html += `<div class="qr-meta">正确率 ${acc}% · 用时 ${mins}分${secs}秒</div>`;
    if (wrongList && wrongList.length) {
      html += `<div class="qr-wrong-list">`;
      wrongList.forEach(item => {
        html += `<div class="qr-wrong-item">
          <b>${escapeHtml(item.word.word)}</b>
          <span style="color:var(--ink-faint);"> — ${escapeHtml((item.word.meaning || []).join('；'))}</span>
        </div>`;
      });
      html += `</div>`;
    } else {
      html += `<div style="color:var(--c-emerald);margin:14px 0;">🎉 全部答对！</div>`;
    }
    html += `<div class="actions" style="justify-content:center;margin-top:20px;">`;
    if (wrongList && wrongList.length) {
      html += `<button class="btn" id="qrWrongPractice">重练错题</button>`;
    }
    html += `<button class="btn btn--ghost" id="qrRestart">再来一轮</button>`;
    html += `</div>`;
    r.innerHTML = html;
    const qrR = $('#qrRestart');
    if (qrR) qrR.onclick = onRestart;
    const qrW = $('#qrWrongPractice');
    if (qrW) qrW.onclick = onWrongPractice;
  },

  // ===== 拼写考察 =====
  showSpellStart() {
    $('#spellStart').removeAttribute('hidden');
    $('#spellPlay').setAttribute('hidden', '');
    $('#spellResult').setAttribute('hidden', '');
  },
  showSpellPlay() {
    $('#spellStart').setAttribute('hidden', '');
    $('#spellResult').setAttribute('hidden', '');
    $('#spellPlay').removeAttribute('hidden');
  },

  renderSpellQuestion(w, idx, total) {
    $('#spProg').textContent = `${idx} / ${total}`;
    $('#spBar').style.width = (idx / total * 100) + '%';
    $('#spPos').textContent = w.pos || '';
    $('#spPhon').textContent = w.phonetic || '';
    $('#spMeaning').innerHTML = w.meaning.map((m, i) =>
      `<li data-i="${CIRCLED[i] || (i + 1) + '.'}">${escapeHtml(m)}</li>`
    ).join('');
    const input = $('#spInput');
    input.value = '';
    input.setAttribute('placeholder', '输入拼写…');
    input.removeAttribute('disabled');
    input.focus();
    $('#spFeedback').setAttribute('hidden', '');
    $('#spFeedback').className = 'spell-feedback';
    $('#spSubmit').removeAttribute('hidden');
    $('#spNext').setAttribute('hidden', '');
    TTS.disableBtn($('#spTts'));
  },

  showSpellFeedback(correct, user, right, word) {
    const fb = $('#spFeedback');
    fb.className = 'spell-feedback ' + (correct ? 'ok' : 'bad');
    let html = correct
      ? `<div>✅ 拼写正确！</div>`
      : `<div>❌ 拼写错误</div>`;
    // diff 高亮
    const diffHtml = this._diffHtml(user, right);
    html += `<div class="diff">${diffHtml}</div>`;
    if (!correct) {
      html += `<div class="ans" style="margin-top:6px;">正确拼写：<b>${escapeHtml(right)}</b></div>`;
    }
    if (word) {
      html += `<div class="feedback-actions">
        <button class="btn btn--ghost btn--sm" id="spExamples" data-wid="${word.id}">📖 AI 例句</button>
        <button class="btn btn--ghost btn--sm" id="spAiAnalyze" data-wid="${word.id}">🤖 AI 解析</button>
      </div>`;
    }
    fb.innerHTML = html;
    fb.removeAttribute('hidden');
    $('#spInput').setAttribute('disabled', '');
    $('#spSubmit').setAttribute('hidden', '');
    $('#spNext').removeAttribute('hidden');
  },

  _diffHtml(user, right) {
    const u = user.toLowerCase();
    const r = right.toLowerCase();
    let html = '';
    const max = Math.max(u.length, r.length);
    let i = 0, j = 0;
    // 简化：逐位比较
    for (let k = 0; k < max; k++) {
      if (k < u.length && k < r.length) {
        if (u[k] === r[k]) {
          html += `<span class="char ok">${escapeHtml(right[k])}</span>`;
        } else {
          html += `<span class="char bad">${escapeHtml(u[k])}</span>`;
        }
      } else if (k < r.length) {
        html += `<span class="char miss">${escapeHtml(right[k])}</span>`;
      } else {
        html += `<span class="char bad">${escapeHtml(u[k])}</span>`;
      }
    }
    return html;
  },

  showSpellResult({ correct, total, dur, wrongList, onRestart }) {
    $('#spellPlay').setAttribute('hidden', '');
    const r = $('#spellResult');
    r.removeAttribute('hidden');
    const acc = total ? Math.round(correct / total * 100) : 0;
    const mins = Math.floor(dur / 60);
    const secs = dur % 60;
    let html = `<div class="qr-score">${correct} / ${total}</div>`;
    html += `<div class="qr-meta">正确率 ${acc}% · 用时 ${mins}分${secs}秒</div>`;
    if (wrongList && wrongList.length) {
      html += `<div class="qr-wrong-list">`;
      wrongList.forEach(item => {
        html += `<div class="qr-wrong-item">
          <b>${escapeHtml(item.word.word)}</b>
          <span style="color:var(--ink-faint);"> — 你拼成「${escapeHtml(item.your)}」</span>
        </div>`;
      });
      html += `</div>`;
    } else {
      html += `<div style="color:var(--c-emerald);margin:14px 0;">🎉 全部拼写正确！</div>`;
    }
    html += `<div class="actions" style="justify-content:center;margin-top:20px;">
      <button class="btn btn--ghost" id="spRestart">再来一轮</button>
    </div>`;
    r.innerHTML = html;
    const spR = $('#spRestart');
    if (spR) spR.onclick = onRestart;
  },

  // ===== AI =====
  renderAiWordPicks() {
    const vocab = Store.vocab();
    const el = $('#aiWordPicks');
    if (!el) return;
    if (!vocab.length) { el.innerHTML = ''; return; }
    const picks = shuffle(vocab).slice(0, 6);
    el.innerHTML = `<span class="muted small" style="margin-right:4px;">快速选词：</span>` +
      picks.map(w => `<button class="chip" data-word="${escapeHtml(w.word)}">${escapeHtml(w.word)}</button>`).join('');
  },

  setAiStatus(elId, type, msg) {
    const el = $('#' + elId);
    if (!el) return;
    el.className = 'ai-status ' + type + ' show';
    el.innerHTML = msg;
    if (!msg) el.className = 'ai-status';
  },

  showAiError(elId, e) {
    const msg = escapeHtml(e.message || String(e));
    this.setAiStatus(elId, 'error', '⚠️ ' + msg);
  },

  // 通用 AI 解析弹层（词库/答题反馈/错词本共用）
  showAiAnalyze(word) {
    if (!AI.isReady()) {
      UI.toast('请先配置 AI（点右上角 🔑）', 'warn');
      App._loadAIConfigToForm();
      UI.openModal('aiConfigModal');
      return;
    }
    const title = $('#aiAnTitle');
    const stream = $('#aiAnStream');
    const status = $('#aiAnStatus');
    title.textContent = '🤖 ' + word.word + ' · AI 深度解析';
    status.className = 'ai-status';
    stream.removeAttribute('hidden');
    stream.innerHTML = '<div class="muted small">⏳ AI 正在解析「' + escapeHtml(word.word) + '」…</div>';
    UI.openModal('aiAnalyzeModal');

    let reasoningEl = null;
    let bodyEl = null;
    AI.analyzeWord(word, (delta, full) => {
      if (!bodyEl) {
        stream.innerHTML = '';
        const det = document.createElement('details');
        det.innerHTML = '<summary>🧠 AI 思考过程（点击展开）</summary>';
        reasoningEl = document.createElement('div');
        reasoningEl.style.cssText = 'margin-top:8px;font-size:12px;color:var(--ink-faint);white-space:pre-wrap;';
        det.appendChild(reasoningEl);
        stream.appendChild(det);
        bodyEl = document.createElement('div');
        bodyEl.className = 'md-body';
        stream.appendChild(bodyEl);
      }
      if (bodyEl) bodyEl.innerHTML = renderMd(full);
      stream.scrollTop = stream.scrollHeight;
    }, (d, r) => {
      if (!reasoningEl) {
        stream.innerHTML = '';
        const det = document.createElement('details');
        det.innerHTML = '<summary>🧠 AI 思考过程（点击展开）</summary>';
        reasoningEl = document.createElement('div');
        reasoningEl.style.cssText = 'margin-top:8px;font-size:12px;color:var(--ink-faint);white-space:pre-wrap;';
        det.appendChild(reasoningEl);
        stream.appendChild(det);
        bodyEl = document.createElement('div');
        bodyEl.className = 'md-body';
        stream.appendChild(bodyEl);
      }
      if (reasoningEl) reasoningEl.textContent = r;
    }).then(res => {
      if (bodyEl) bodyEl.innerHTML = renderMd(res.content);
      UI.setAiStatus('aiAnStatus', 'ok', '✅ 解析完成');
    }).catch(e => {
      UI.showAiError('aiAnStatus', e);
      stream.innerHTML = '<div class="muted small">⚠️ 解析失败：' + escapeHtml(e.message) + '</div>';
    });
  },

  // 通用例句弹层（词库/答题反馈共用）
  async showExamples(word) {
    if (!AI.isReady()) {
      UI.toast('请先配置 AI（点右上角 🔑）', 'warn');
      App._loadAIConfigToForm();
      UI.openModal('aiConfigModal');
      return;
    }
    const title = $('#exTitle');
    const content = $('#exContent');
    const status = $('#exStatus');
    title.textContent = '📖 ' + word.word + ' · 例句';
    status.className = 'ai-status';

    // 检查已有例句
    const stored = Store.get().examples[word.id];
    if (stored && stored.length) {
      content.innerHTML = this._renderExamplesHtml(stored, word.word);
      $('#exRegen').onclick = () => this._genExamples(word);
      UI.openModal('examplesModal');
      return;
    }
    // 无缓存，生成
    UI.openModal('examplesModal');
    await this._genExamples(word);
  },

  async _genExamples(word) {
    const content = $('#exContent');
    const status = $('#exStatus');
    status.className = 'ai-status';
    content.innerHTML = '<div class="ai-loading"><div class="spinner"></div>🤖 AI 正在为例句「' + escapeHtml(word.word) + '」生成…</div>';
    $('#exRegen').setAttribute('disabled', '');
    try {
      const res = await AI.generateExamples(word, (delta, full) => {
        content.innerHTML = '<div class="ai-loading"><div class="spinner"></div>🤖 生成中…</div><pre style="white-space:pre-wrap;font-size:12px;color:var(--ink-faint);margin-top:8px;">' + escapeHtml(full) + '</pre>';
      });
      let items = null;
      try { items = JSON.parse(res.content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')); }
      catch (_) { const m = res.content.match(/\[[\s\S]*\]/); if (m) try { items = JSON.parse(m[0]); } catch (e) {} }
      if (items && Array.isArray(items) && items.length) {
        const clean = items.filter(i => i && i.en).slice(0, 5).map(i => ({ en: String(i.en), zh: String(i.zh || '') }));
        Store.get().examples[word.id] = clean;
        Store.commit();
        content.innerHTML = this._renderExamplesHtml(clean, word.word);
        UI.setAiStatus('exStatus', 'ok', '✅ 已生成 ' + clean.length + ' 个例句');
      } else {
        content.innerHTML = '<div class="muted small">⚠️ AI 返回格式异常，原始内容：</div><pre style="white-space:pre-wrap;font-size:12px;color:var(--ink-faint);margin-top:8px;">' + escapeHtml(res.content) + '</pre>';
        UI.setAiStatus('exStatus', 'error', '⚠️ 例句格式异常，可点「重新生成」重试');
      }
    } catch (e) {
      content.innerHTML = '<div class="muted small">⚠️ 生成失败：' + escapeHtml(e.message) + '</div>';
      UI.setAiStatus('exStatus', 'error', '⚠️ ' + escapeHtml(e.message));
    }
    $('#exRegen').removeAttribute('disabled');
  },

  _renderExamplesHtml(items, word) {
    const re = new RegExp('(' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return items.map(i => {
      const en = escapeHtml(i.en).replace(re, '<span class="highlight">$1</span>');
      return `<div class="example-item">
        <div class="ex-en">${en}</div>
        <div class="ex-zh">${escapeHtml(i.zh)}</div>
      </div>`;
    }).join('');
  },

  renderAiQuizItems(items, container) {
    if (!items || !items.length) {
      container.innerHTML = '<div class="muted small">未生成有效题目，请重试</div>';
      return;
    }
    container.innerHTML = items.map((q, i) => {
      const opts = (q.options || []).map((opt, idx) => {
        const isCorrect = idx === q.answer;
        return `<button class="qi-opt" data-qi="${i}" data-idx="${idx}" data-correct="${isCorrect}">
          <b style="color:var(--ink-faint);margin-right:6px;">${String.fromCharCode(65 + idx)}.</b>${escapeHtml(opt)}
        </button>`;
      }).join('');
      return `<div class="ai-quiz-item">
        <div class="qi-word">单词：${escapeHtml(q.word || '')}</div>
        <div class="qi-stem">${escapeHtml(q.stem || '')}</div>
        <div class="qi-opts">${opts}</div>
        <div class="qi-explain" hidden>💡 ${escapeHtml(q.explain || '')}</div>
      </div>`;
    }).join('');
    // 绑定点击
    $$('.ai-quiz-item .qi-opt', container).forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.ai-quiz-item');
        if (item.classList.contains('locked')) return;
        item.classList.add('locked');
        $$('.qi-opt', item).forEach(b => b.classList.add('locked'));
        const isCorrect = btn.dataset.correct === 'true';
        btn.classList.add(isCorrect ? 'correct' : 'wrong');
        if (!isCorrect) {
          $$('.qi-opt', item).forEach(b => {
            if (b.dataset.correct === 'true') b.classList.add('correct');
          });
        }
        const explain = $('.qi-explain', item);
        if (explain) explain.removeAttribute('hidden');
      });
    });
  }
};

// 修复：UI.showQuizFeedback 中 _lastAnsweredIdx 的设置（在 answer 调用时记录）
// 我们直接在事件绑定中处理

/* ============================================================
   App 子模块（事件绑定 + 初始化）
   ============================================================ */
const App = {
  async init() {
    TTS.init();
    // 先异步加载 IndexedDB 中的词库与学习记录（不阻塞主线程）
    await DB.loadAll();
    this._loadAIConfigToForm();
    // 在天择OS内运行时隐藏应用内AI配置按钮（复用OS配置）
    if (AI._inOS()) {
      const btn = $('#btnAiConfig');
      if (btn) btn.style.display = 'none';
    }
    UI.renderTopStats();
    UI.renderVocabList();
    this.bindNav();
    this.bindTopbar();
    this.bindVocab();
    this.bindStudy();
    this.bindStats();
    this.bindAI();
    this.bindModal();
    this.bindSample();
    // 全局键盘：Enter 提交
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        $$('.modal').forEach(m => m.setAttribute('hidden', ''));
      }
    });
  },

  _loadAIConfigToForm() {
    const c = Store.aiConfig();
    const u = $('#cfgUrl'), k = $('#cfgKey'), m = $('#cfgModel'), t = $('#cfgTemp');
    if (u) u.value = c.url || '';
    if (k) k.value = c.key || '';
    if (m) m.value = c.model || '';
    if (t) t.value = c.temperature != null ? c.temperature : 0.6;
  },

  bindNav() {
    $$('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => UI.switchView(btn.dataset.view));
    });
  },

  bindTopbar() {
    $('#btnAiConfig').addEventListener('click', () => {
      this._loadAIConfigToForm();
      UI.openModal('aiConfigModal');
    });
  },

  bindVocab() {
    const setImportBusy = (busy, text) => {
      const status = $('#importStatus');
      const statusText = $('#importStatusText');
      const importBtn = $('#btnImport');
      const pasteBtn = $('#pasteImport');
      if (status) busy ? status.removeAttribute('hidden') : status.setAttribute('hidden', '');
      if (statusText && text) statusText.textContent = text;
      if (importBtn) busy ? importBtn.setAttribute('disabled', '') : importBtn.removeAttribute('disabled');
      if (pasteBtn) busy ? pasteBtn.setAttribute('disabled', '') : pasteBtn.removeAttribute('disabled');
    };
    const importText = async (text, closePaste) => {
      setImportBusy(true, '正在解析 JSON…');
      try {
        const parsed = await parseJsonAsync(text);
        const r = await Vocab.import(parsed, (done, total) => {
          setImportBusy(true, `正在导入 ${done.toLocaleString()} / ${total.toLocaleString()}…`);
        });
        UI.toast(`成功导入 ${r.count} 个单词${r.skipped ? `，跳过 ${r.skipped} 个` : ''}`, 'success');
        UI.renderVocabList();
        UI.renderTopStats();
        if (closePaste) UI.closeModal('pasteModal');
      } catch (err) {
        UI.toast('导入失败：' + err.message, 'error');
      } finally {
        setImportBusy(false);
      }
    };

    $('#btnImport').addEventListener('click', () => $('#fileVocab').click());
    $('#fileVocab').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = ''; // 允许重复导入同一文件
      if (!file) return;
      setImportBusy(true, '正在读取文件…');
      try {
        await importText(await file.text(), false);
      } catch (err) {
        UI.toast('文件读取失败：' + err.message, 'error');
        setImportBusy(false);
      }
    });

    $('#btnPaste').addEventListener('click', () => {
      $('#pasteArea').value = '';
      UI.openModal('pasteModal');
    });
    $('#pasteImport').addEventListener('click', async () => {
      const text = $('#pasteArea').value.trim();
      if (!text) { UI.toast('请粘贴 JSON 内容', 'warn'); return; }
      await importText(text, true);
    });
    $('#pasteCancel').addEventListener('click', () => UI.closeModal('pasteModal'));
    $('#pasteClose').addEventListener('click', () => UI.closeModal('pasteModal'));
    $('#pasteMask').addEventListener('click', () => UI.closeModal('pasteModal'));

    $('#btnExport').addEventListener('click', () => {
      const vocab = Store.vocab();
      if (!vocab.length) { UI.toast('词库为空，无可导出', 'warn'); return; }
      const blob = new Blob([Vocab.export()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vocab-${todayStr()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      UI.toast('已导出词库 JSON', 'success');
    });

    let clearConfirmTimer = null;
    $('#btnClearVocab').addEventListener('click', () => {
      if (!Store.vocab().length) { UI.toast('词库已为空', 'info'); return; }
      if (clearConfirmTimer) {
        clearTimeout(clearConfirmTimer);
        clearConfirmTimer = null;
        Vocab.clear();
        UI.renderVocabList();
        UI.renderTopStats();
        UI.toast('已清空词库与记录', 'success');
      } else {
        clearConfirmTimer = setTimeout(() => { clearConfirmTimer = null; }, 3000);
        UI.toast('⚠️ 再次点击确认清空（3秒内有效）', 'warn');
      }
    });

    let searchTimer = null;
    $('#vocabSearch').addEventListener('input', (e) => {
      const value = e.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => UI.renderVocabList(value), 120);
    });

    // 点击单词项跳到 AI 解析
    $('#vocabList').addEventListener('click', (e) => {
      const btn = e.target.closest('.vi-btn');
      if (btn) {
        e.stopPropagation();
        const w = Vocab.byId(btn.dataset.id);
        if (!w) return;
        if (btn.dataset.act === 'examples') UI.showExamples(w);
        else if (btn.dataset.act === 'analyze') UI.showAiAnalyze(w);
        return;
      }
      const item = e.target.closest('.vocab-item');
      if (!item) return;
      const w = Vocab.byId(item.dataset.id);
      if (!w) return;
      // 点击单词直接弹 AI 深度解析
      UI.showAiAnalyze(w);
    });
  },

  bindStudy() {
    $('#btnStudyStart').addEventListener('click', () => {
      Study.start({
        count: parseInt($('#stCount').value) || 10,
        wrongOnly: $('#stWrongOnly').checked,
        aiDistractor: $('#stAiDistractor').checked
      });
    });

    $('#btnStageStart').addEventListener('click', () => Study.startStage());

    // 选项点击
    $('#stOptions').addEventListener('click', (e) => {
      const btn = e.target.closest('.opt');
      if (!btn || btn.classList.contains('locked')) return;
      const q = Study.session && Study.session.current;
      if (!q) return;
      if (q.multi) {
        btn.classList.toggle('selected');
      } else {
        UI._lastAnsweredIdx = parseInt(btn.dataset.idx);
        const userOpt = q.options[parseInt(btn.dataset.idx)];
        if (!userOpt) return;
        Study.answer(userOpt.value);
      }
    });

    // 提交（不定项选择）
    $('#stSubmit').addEventListener('click', () => {
      const q = Study.session && Study.session.current;
      if (!q) return;
      if (q.type === 'spell') {
        Study.answer($('#stInput').value);
      } else if (q.multi) {
        const selectedTexts = $$('#stOptions .opt.selected').map(b => b.dataset.text);
        if (!selectedTexts.length) { UI.toast('请至少选择一个释义', 'warn'); return; }
        Study.answer(selectedTexts);
      }
    });

    $('#stNext').addEventListener('click', () => Study.next());
    $('#stSkip').addEventListener('click', () => Study.skip());

    // 拼写输入
    $('#stInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (!$('#stNext').hasAttribute('hidden')) Study.next();
        else if (!$('#stSubmit').hasAttribute('hidden') && !$('#stInput').hasAttribute('hidden')) {
          Study.answer($('#stInput').value);
        }
      }
    });

    $('#stTts').addEventListener('click', () => {
      const s = Study.session;
      if (s && s.current && s.current.word) TTS.speak(s.current.word.word);
    });

    $('#stHint').addEventListener('click', () => {
      const s = Study.session;
      if (!s || !s.current || s.current.type !== 'spell') return;
      const right = s.current.word.word;
      const placeholder = right[0] + '\u00b7'.repeat(Math.max(0, right.length - 1));
      $('#stInput').setAttribute('placeholder', '\u63d0\u793a\uff1a' + placeholder + '\uff08\u5171 ' + right.length + ' \u5b57\u6bcd\uff09');
      UI.toast('\u5df2\u663e\u793a\u9996\u5b57\u6bcd\u63d0\u793a', 'info');
    });

    // 反馈区按钮（例句 + AI 解析）
    $('#stFeedback').addEventListener('click', (e) => {
      const exBtn = e.target.closest('#stExamples');
      if (exBtn) {
        const w = Vocab.byId(exBtn.dataset.wid);
        if (w) UI.showExamples(w);
        return;
      }
      const aiBtn = e.target.closest('#stAiAnalyze');
      if (aiBtn) {
        const w = Vocab.byId(aiBtn.dataset.wid);
        if (w) UI.showAiAnalyze(w);
      }
    });
  },

  bindStats() {
    const practiceWrong = () => {
      UI.switchView('study');
      $('#stWrongOnly').checked = true;
      setTimeout(() => Study.start({
        count: parseInt($('#stCount').value) || 10,
        wrongOnly: true,
        aiDistractor: $('#stAiDistractor').checked
      }), 50);
    };
    const btn1 = $('#btnPracticeWrong');
    if (btn1) btn1.addEventListener('click', practiceWrong);
    const btn2 = $('#btnPracticeWrong2');
    if (btn2) btn2.addEventListener('click', practiceWrong);

    // 错词本操作
    const bindWrongActions = (containerId) => {
      const c = $('#' + containerId);
      if (!c) return;
      c.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const id = btn.dataset.id;
        const w = Vocab.byId(id);
        if (!w) return;
        if (btn.dataset.act === 'analyze') {
          UI.showAiAnalyze(w);
        } else if (btn.dataset.act === 'practice') {
          UI.switchView('study');
          $('#stWrongOnly').checked = true;
          $('#stCount').value = 1;
          setTimeout(() => Study.start({ count: 1, wrongOnly: true, aiDistractor: false }), 50);
        }
      });
    };
    bindWrongActions('wrongList');
    bindWrongActions('wrongListFull');
  },

  bindAI() {
    // AI 解析弹层关闭（通用弹层，词库/答题/错词本共用）
    const closeAn = () => UI.closeModal("aiAnalyzeModal");
    const anClose = $("#aiAnClose");
    if (anClose) anClose.addEventListener("click", closeAn);
    const anClose2 = $("#aiAnClose2");
    if (anClose2) anClose2.addEventListener("click", closeAn);
    const anMask = $("#aiAnMask");
    if (anMask) anMask.addEventListener("click", closeAn);

    // 例句弹层关闭
    const closeEx = () => UI.closeModal('examplesModal');
    const exClose = $('#exClose');
    if (exClose) exClose.addEventListener('click', closeEx);
    const exClose2 = $('#exClose2');
    if (exClose2) exClose2.addEventListener('click', closeEx);
    const exMask = $('#exMask');
    if (exMask) exMask.addEventListener('click', closeEx);
  },

  bindModal() {
    // AI 配置弹层
    const close = () => UI.closeModal('aiConfigModal');
    $('#aiCfgClose').addEventListener('click', close);
    $('#aiCfgMask').addEventListener('click', close);

    $$('#presetChips .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        $('#cfgUrl').value = chip.dataset.url;
        $('#cfgModel').value = chip.dataset.model;
      });
    });

    $('#cfgSave').addEventListener('click', () => {
      const c = {
        url: $('#cfgUrl').value.trim(),
        key: $('#cfgKey').value.trim(),
        model: $('#cfgModel').value.trim(),
        temperature: parseFloat($('#cfgTemp').value) || 0.6
      };
      Store.setAIConfig(c);
      UI.toast('AI 配置已保存', 'success');
      close();
    });

    $('#cfgTest').addEventListener('click', async () => {
      const c = {
        url: $('#cfgUrl').value.trim(),
        key: $('#cfgKey').value.trim(),
        model: $('#cfgModel').value.trim(),
        temperature: 0
      };
      if (!c.url || !c.key || !c.model) {
        UI.toast('请填写完整的 URL、Key 和模型名', 'warn');
        return;
      }
      const btn = $('#cfgTest');
      btn.setAttribute('disabled', '');
      btn.textContent = '🧪 测试中…';
      // 临时保存测试配置
      const old = Store.aiConfig();
      Store.setAIConfig(c);
      try {
        await AI.test();
        UI.toast('✅ 连接成功', 'success');
      } catch (e) {
        UI.toast('❌ ' + e.message, 'error');
        // 恢复旧配置
        Store.setAIConfig(old);
      } finally {
        btn.removeAttribute('disabled');
        btn.textContent = '🧪 测试连接';
      }
    });
  },

  bindSample() {
    const sampleJson = `[
  {
    "word": "accommodate",
    "phonetic": "/əˈkɒmədeɪt/",
    "pos": "v.",
    "meaning": ["容纳；提供空间", "迁就；照顾", "适应"],
    "examples": [
      { "en": "The hotel can accommodate 500 guests.", "zh": "这家酒店能容纳500位客人。" }
    ],
    "tags": ["CET-6", "核心"]
  },
  {
    "word": "abandon",
    "phonetic": "/əˈbændən/",
    "pos": "v.",
    "meaning": ["放弃；遗弃", "放纵"]
  }
]`;
    $('#btnSample').addEventListener('click', () => {
      $('#sampleCode').textContent = sampleJson;
      UI.openModal('sampleModal');
    });
    $('#sampleClose').addEventListener('click', () => UI.closeModal('sampleModal'));
    $('#sampleClose2').addEventListener('click', () => UI.closeModal('sampleModal'));
    $('#sampleMask').addEventListener('click', () => UI.closeModal('sampleModal'));
    $('#sampleCopy').addEventListener('click', () => {
      navigator.clipboard.writeText(sampleJson).then(() => {
        UI.toast('示例已复制到剪贴板', 'success');
      }).catch(() => {
        UI.toast('复制失败，请手动选择复制', 'warn');
      });
    });
  }
};

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { Store.flush(); DB.flushRecords(); }
});
window.addEventListener('pagehide', () => { Store.flush(); DB.flushRecords(); });
document.addEventListener('DOMContentLoaded', () => App.init());

})();
