/* ============================================================
 * 天择OS 命令引擎
 * 纯基础设施：分词、命令注册、自动帮助、补全、结构化结果与可取消任务。
 * 业务命令仍由 os.js 注册，网页版和 Electron 共用这一实现。
 * ============================================================ */
(function (global) {
  'use strict';

  function tokenize(input) {
    const source = String(input == null ? '' : input);
    const tokens = [];
    let value = '', start = -1, quote = '', escaped = false;
    const push = (end) => {
      if (start < 0) return;
      tokens.push({ value, start, end, quoted: !!quote });
      value = ''; start = -1; quote = '';
    };
    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      if (escaped) { value += ch; escaped = false; continue; }
      if (ch === '\\' && quote !== "'") { if (start < 0) start = i; escaped = true; continue; }
      if (quote) {
        if (ch === quote) { quote = ''; continue; }
        value += ch;
        continue;
      }
      if (ch === '"' || ch === "'") { if (start < 0) start = i; quote = ch; continue; }
      if (/\s/.test(ch)) { push(i); continue; }
      if (start < 0) start = i;
      value += ch;
    }
    if (escaped) value += '\\';
    if (quote) {
      const error = new Error('引号未闭合：' + quote);
      error.code = 'TZCLI_PARSE_QUOTE';
      throw error;
    }
    push(source.length);
    return tokens;
  }

  function parseOptions(tokens) {
    const options = {};
    const args = [];
    const booleanNames = new Set(['json', 'quiet', 'help', 'all', 'archived', 'permanent', 'force']);
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const value = token.value;
      if (value === '--') { args.push(...tokens.slice(i + 1).map(item => item.value)); break; }
      if (!/^--[a-zA-Z][\w-]*(?:=.*)?$/.test(value)) { args.push(value); continue; }
      const body = value.slice(2);
      const eq = body.indexOf('=');
      if (eq >= 0) {
        options[body.slice(0, eq)] = body.slice(eq + 1);
      } else if (!booleanNames.has(body) && tokens[i + 1] && !tokens[i + 1].value.startsWith('--')) {
        options[body] = tokens[++i].value;
      } else {
        options[body] = true;
      }
    }
    return { options, args };
  }

  function normalizeResult(value) {
    if (value && typeof value === 'object' && ('ok' in value || 'out' in value || 'data' in value)) {
      const ok = value.ok !== false;
      const out = value.out != null ? String(value.out) : value.message != null ? String(value.message) : '';
      return {
        ok,
        code: Number.isInteger(value.code) ? value.code : (ok ? 0 : 1),
        out,
        data: value.data,
        display: value.display || 'text',
        meta: value.meta,
        warnings: Array.isArray(value.warnings) ? value.warnings : []
      };
    }
    return { ok: true, code: 0, out: String(value == null ? '' : value), data: undefined, display: 'text', meta: undefined, warnings: [] };
  }

  function errorResult(error) {
    return {
      ok: false,
      code: Number.isInteger(error && error.code) ? error.code : 1,
      out: '执行出错：' + String(error && error.message ? error.message : error),
      data: undefined,
      display: 'text',
      meta: error && error.meta,
      warnings: []
    };
  }

  function commandPath(value) {
    return (Array.isArray(value) ? value : String(value || '').trim().split(/\s+/))
      .map(item => String(item || '').trim().toLowerCase()).filter(Boolean);
  }

  function distance(a, b) {
    const x = String(a), y = String(b), row = Array.from({ length: y.length + 1 }, (_, i) => i);
    for (let i = 1; i <= x.length; i++) {
      let prev = row[0]; row[0] = i;
      for (let j = 1; j <= y.length; j++) {
        const old = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (x[i - 1] === y[j - 1] ? 0 : 1));
        prev = old;
      }
    }
    return row[y.length];
  }

  /* Agent 熔断器不设“最多 N 次”或固定总时长。它只在出现可复现的无进展证据时
   * 停止：精确重复、稳定周期、长时间仅有时间戳/计数器等表面变化，或重复输出造成
   * 资源异常。独一无二的长链路和单次大输出都不会仅因次数、时长或大小被拦截。 */
  function createLoopDetector(options) {
    const config = Object.assign({
      historyLimit: 64,
      maxCycle: 6,
      varyingCycleMs: 15000,
      prolongedStallMs: 30000,
      largeResultBytes: 8 * 1024 * 1024,
      resourceWindowBytes: 24 * 1024 * 1024
    }, options || {});
    const now = typeof config.now === 'function' ? config.now : () => Date.now();
    const observations = [];
    const knownExactCommands = new Set();
    const knownExactResults = new Set();
    const knownTokens = new Set();
    const progressByShape = new Map();
    let startedAt = null;
    let lastSemanticProgressAt = null;
    let shapeRunStartedAt = null;

    const sampleText = value => {
      const text = String(value == null ? '' : value);
      if (text.length <= 24576) return text;
      const span = 8192;
      const middle = Math.max(span, Math.floor(text.length / 2) - Math.floor(span / 2));
      return text.slice(0, span) + '\n…<sample>…\n' + text.slice(middle, middle + span) + '\n…<sample>…\n' + text.slice(-span);
    };
    const compact = value => sampleText(value).replace(/\s+/g, ' ').trim();
    const rawStats = value => {
      const text = String(value == null ? '' : value);
      let bytes = 0;
      let hash = 2166136261;
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        hash ^= code;
        hash = Math.imul(hash, 16777619);
        if (code < 0x80) bytes++;
        else if (code < 0x800) bytes += 2;
        else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) {
          const low = text.charCodeAt(++i);
          hash ^= low;
          hash = Math.imul(hash, 16777619);
          bytes += 4;
        }
        else bytes += 3;
      }
      return { bytes, fingerprint: (hash >>> 0).toString(36) + ':' + text.length };
    };
    const remember = (set, value, limit) => {
      if (set.has(value)) return;
      while (set.size >= limit) set.delete(set.values().next().value);
      set.add(value);
    };
    const hashText = value => {
      const text = compact(value);
      let hash = 2166136261;
      for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(36) + ':' + String(value == null ? '' : value).length;
    };
    const shapeText = value => compact(value).toLowerCase()
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '<uuid>')
      .replace(/\b(?:0x)?[0-9a-f]{12,}\b/gi, '<id>')
      .replace(/\b(?=[a-z0-9_-]{16,}\b)(?=[a-z0-9_-]*\d)(?=[a-z0-9_-]*[a-z])[a-z0-9_-]+\b/gi, '<id>')
      .replace(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[t\s]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:z|[+-]\d{2}:?\d{2})?)?\b/gi, '<date>')
      .replace(/\b\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\b/g, '<time>')
      .replace(/\b\d+(?:\.\d+)?%/g, '<percent>')
      .replace(/\b\d+(?:\.\d+)?\b/g, '<number>');
    const stableTokens = value => {
      const normalized = shapeText(value)
        .replace(/<(?:uuid|id|date|time|percent|number)>/g, ' ')
        .replace(/[^a-z0-9\u3400-\u9fff]+/g, ' ');
      const tokens = new Set();
      (normalized.match(/[a-z][a-z0-9_-]{2,}/g) || []).forEach(token => tokens.add(token));
      (normalized.match(/[\u3400-\u9fff]{2,}/g) || []).forEach(segment => {
        if (segment.length <= 8) tokens.add(segment);
        for (let i = 0; i < segment.length - 1 && tokens.size < 160; i++) tokens.add(segment.slice(i, i + 2));
      });
      return tokens;
    };
    const progressValue = value => {
      const text = sampleText(value);
      const percentages = [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map(match => Number(match[1])).filter(Number.isFinite);
      if (percentages.length) return Math.max(...percentages) / 100;
      const keyed = [...text.matchAll(/(?:progress|processed|completed|finished|进度|已处理|已完成|已下载|已扫描)[^\d]{0,16}(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?/gi)];
      if (!keyed.length) return null;
      return Math.max(...keyed.map(match => {
        const current = Number(match[1]);
        const total = Number(match[2]);
        return Number.isFinite(total) && total > 0 ? current / total : current;
      }).filter(Number.isFinite));
    };
    const dataSample = value => {
      if (value === undefined) return '';
      const seen = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
      let nodes = 0;
      const walk = (item, depth) => {
        if (nodes++ > 128) return '<budget>';
        if (item == null || typeof item === 'boolean' || typeof item === 'number') return item;
        if (typeof item === 'string') return item.length > 1024 ? item.slice(0, 512) + '…' + item.slice(-512) : item;
        if (typeof item === 'bigint') return String(item) + 'n';
        if (typeof item !== 'object') return '<' + typeof item + '>';
        if (seen) {
          if (seen.has(item)) return '<cycle>';
          seen.add(item);
        }
        if (depth >= 3) return Array.isArray(item) ? '<array:' + item.length + '>' : '<object>';
        if (Array.isArray(item)) {
          const values = item.length <= 8 ? item : [...item.slice(0, 5), '<omitted:' + (item.length - 8) + '>', ...item.slice(-3)];
          return values.map(child => walk(child, depth + 1));
        }
        const out = {};
        Object.keys(item).sort().slice(0, 32).forEach(key => { out[key] = walk(item[key], depth + 1); });
        return out;
      };
      try { return JSON.stringify(walk(value, 0)); }
      catch (_) { return '<unserializable>'; }
    };
    const cycleLength = (records, key, minimumRepeats) => {
      const max = Math.min(config.maxCycle, Math.floor(records.length / minimumRepeats));
      for (let size = 1; size <= max; size++) {
        let equal = true;
        const start = records.length - size;
        for (let repeat = 1; repeat < minimumRepeats && equal; repeat++) {
          const previousStart = start - repeat * size;
          for (let i = 0; i < size; i++) {
            if (records[start + i][key] !== records[previousStart + i][key]) { equal = false; break; }
          }
        }
        if (equal) return size;
      }
      return 0;
    };
    const resultDescriptor = item => {
      const result = item || {};
      const out = String(result.out == null ? '' : result.out);
      const structured = dataSample(result.data);
      const stats = rawStats(out);
      return {
        exact: [result.ok === false ? 'fail' : 'ok', Number.isInteger(result.code) ? result.code : '', stats.fingerprint, rawStats(structured).fingerprint].join(':'),
        shape: [result.ok === false ? 'fail' : 'ok', Number.isInteger(result.code) ? result.code : '', hashText(shapeText(out + '\n' + structured))].join(':'),
        out,
        structured,
        bytes: stats.bytes
      };
    };

    return {
      observe(commands, results) {
        const at = now();
        if (startedAt == null) startedAt = lastSemanticProgressAt = shapeRunStartedAt = at;
        const commandText = (commands || []).map(value => String(value == null ? '' : value).trim()).join('\n');
        const descriptors = (results || []).map(resultDescriptor);
        const resultText = descriptors.map(item => sampleText(item.out) + (item.structured ? '\n' + item.structured : '')).join('\n------\n');
        const commandSig = rawStats(commandText).fingerprint;
        const resultSig = descriptors.map(item => item.exact).join('|');
        const signature = commandSig + '>' + resultSig;
        const commandShape = hashText(shapeText(commandText));
        const resultShape = descriptors.map(item => item.shape).join('|');
        const shapeSignature = commandShape + '>' + resultShape;
        const outputBytes = descriptors.reduce((sum, item) => sum + item.bytes, 0);
        const previous = observations[observations.length - 1] || null;
        const tokens = stableTokens(commandText + '\n' + resultText);
        let novelTokens = 0;
        tokens.forEach(token => {
          if (!knownTokens.has(token)) novelTokens++;
          remember(knownTokens, token, 2048);
        });
        const explicitProgress = progressValue(resultText);
        const previousProgress = progressByShape.get(commandShape);
        const progressAdvanced = explicitProgress != null && (
          previousProgress == null || explicitProgress > previousProgress + 1e-9 ||
          (previousProgress >= 0.95 && explicitProgress <= 0.1)
        );
        if (explicitProgress != null) {
          while (!progressByShape.has(commandShape) && progressByShape.size >= 128) progressByShape.delete(progressByShape.keys().next().value);
          progressByShape.set(commandShape, explicitProgress);
        }
        const exactCommandIsNew = !knownExactCommands.has(commandSig);
        const exactResultIsNew = !knownExactResults.has(resultSig);
        remember(knownExactCommands, commandSig, 512);
        remember(knownExactResults, resultSig, 512);

        // 新的语义词、明确增长的进度，或命令与结果同时产生新内容，均视为实质进展。
        // 单纯变化的时间戳、随机 ID 与计数器已在 shapeText 中归一化，不会伪装成进展。
        const semanticProgress = progressAdvanced || novelTokens > Math.max(1, Math.floor(tokens.size * 0.08)) ||
          (exactCommandIsNew && exactResultIsNew && (!previous || previous.shapeSignature !== shapeSignature));
        if (semanticProgress) lastSemanticProgressAt = at;
        if (!previous || previous.shapeSignature !== shapeSignature || semanticProgress) shapeRunStartedAt = at;

        observations.push({
          at, signature, shapeSignature, commandSig, resultSig, commandShape, resultShape,
          outputBytes, semanticProgress, explicitProgress
        });
        if (observations.length > config.historyLimit) observations.shift();

        const exactCycle = cycleLength(observations, 'signature', 3);
        const shapeCycle = cycleLength(observations, 'shapeSignature', 3);
        const consecutiveExact = observations.slice(-3).length === 3 && observations.slice(-3).every(item => item.signature === signature);
        const recent = observations.slice(-Math.max(6, config.maxCycle * 3));
        const recentBytes = recent.reduce((sum, item) => sum + item.outputBytes, 0);
        const resourceAnomaly = outputBytes >= config.largeResultBytes || recentBytes >= config.resourceWindowBytes;
        const noSemanticProgressMs = Math.max(0, at - lastSemanticProgressAt);
        const sameShapeMs = Math.max(0, at - shapeRunStartedAt);
        const repeatedShape = recent.filter(item => item.shapeSignature === shapeSignature).length >= 3;
        const repeatedCommandShape = recent.filter(item => item.commandShape === commandShape).length >= 3;
        const lengths = observations.slice(-4).map(item => item.outputBytes);
        const runawayGrowth = lengths.length === 4 && lengths[0] > 0 && lengths.slice(1).every((value, index) => value > lengths[index] * 1.45) && lengths[3] >= config.largeResultBytes;

        let reason = '';
        let evidence = '';
        if (consecutiveExact) {
          reason = '检测到相同命令持续得到相同结果，且没有产生新进展';
          evidence = 'exact-repeat';
        } else if (exactCycle && !observations.slice(-exactCycle * 2).some(item => item.semanticProgress)) {
          reason = '检测到命令与结果按 ' + exactCycle + ' 步周期重复，且没有产生新进展';
          evidence = 'exact-cycle';
        } else if (shapeCycle && !progressAdvanced &&
          (sameShapeMs >= config.varyingCycleMs || noSemanticProgressMs >= config.prolongedStallMs || resourceAnomaly)) {
          reason = '检测到命令与结果仅有时间戳、编号或计数等表面变化，实际工作按 ' + shapeCycle + ' 步周期停滞';
          evidence = resourceAnomaly ? 'shape-cycle-resource' : 'shape-cycle-time';
        } else if (runawayGrowth && repeatedCommandShape && !progressAdvanced) {
          reason = '检测到无进展的重复输出正在异常增长，为避免资源耗尽已自动熔断';
          evidence = 'runaway-output';
        } else if (repeatedShape && noSemanticProgressMs >= config.prolongedStallMs && !progressAdvanced) {
          reason = '检测到命令链长时间没有实质进展，仅在重复同类操作';
          evidence = 'prolonged-stall';
        }

        return {
          loop: !!reason,
          reason,
          confidence: reason ? (evidence === 'exact-repeat' || evidence === 'exact-cycle' ? 'high' : 'adaptive') : 'none',
          evidence,
          metrics: {
            elapsedMs: Math.max(0, at - startedAt),
            noProgressMs: noSemanticProgressMs,
            outputBytes,
            recentOutputBytes: recentBytes,
            exactCycle,
            shapeCycle
          }
        };
      },
      reset() {
        observations.length = 0;
        knownExactCommands.clear();
        knownExactResults.clear();
        knownTokens.clear();
        progressByShape.clear();
        startedAt = lastSemanticProgressAt = shapeRunStartedAt = null;
      }
    };
  }

  class Registry {
    constructor(options) {
      this.options = options || {};
      this.specs = [];
      this.byPath = new Map();
    }
    register(spec) {
      const normalized = { ...spec, path: commandPath(spec.path), aliases: (spec.aliases || []).map(commandPath) };
      if (!normalized.path.length || typeof normalized.handler !== 'function') throw new Error('命令注册缺少 path 或 handler');
      normalized.key = normalized.path.join(' ');
      const previous = this.byPath.get(normalized.key);
      if (previous) this.specs = this.specs.filter(item => item !== previous);
      this.specs.push(normalized);
      this.byPath.set(normalized.key, normalized);
      normalized.aliases.forEach(alias => this.byPath.set(alias.join(' '), { ...normalized, aliasPath: alias }));
      return normalized;
    }
    unregister(predicate) {
      if (typeof predicate !== 'function') return 0;
      const removed = this.specs.filter(predicate);
      if (!removed.length) return 0;
      this.specs = this.specs.filter(spec => !predicate(spec));
      for (const [key, spec] of this.byPath.entries()) {
        if (predicate(spec)) this.byPath.delete(key);
      }
      return removed.length;
    }
    visible() { return this.specs.filter(spec => !spec.hidden).sort((a, b) => a.key.localeCompare(b.key, 'zh-CN')); }
    resolve(tokens) {
      const values = tokens.map(token => token.value.toLowerCase());
      for (let count = values.length; count > 0; count--) {
        const spec = this.byPath.get(values.slice(0, count).join(' '));
        if (spec) return { spec, count };
      }
      return null;
    }
    suggest(value) {
      const first = String(value || '').toLowerCase();
      return [...new Set(this.visible().map(spec => spec.path[0]))]
        .map(name => ({ name, score: distance(first, name) }))
        .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
        .slice(0, 3).filter(item => item.score <= Math.max(2, Math.ceil(first.length / 2))).map(item => item.name);
    }
    execute(input, baseContext) {
      let tokens;
      try { tokens = tokenize(input); }
      catch (error) { return errorResult(error); }
      if (!tokens.length) return normalizeResult('');
      const match = this.resolve(tokens);
      if (!match) {
        const suggestions = this.suggest(tokens[0].value);
        return { ok: false, code: 127, out: '未知命令：' + tokens[0].value + (suggestions.length ? '（你是否想输入：' + suggestions.join('、') + '）' : '（输入 help 查看全部命令）'), display: 'text', warnings: [] };
      }
      const { spec, count } = match;
      const restTokens = tokens.slice(count);
      const parsed = parseOptions(restTokens);
      const rawStart = tokens[count - 1] ? tokens[count - 1].end : 0;
      const ctx = {
        ...(baseContext || {}),
        input: String(input || ''),
        command: spec.key,
        spec,
        args: parsed.args,
        options: parsed.options,
        raw: String(input || '').slice(rawStart).trim(),
        registry: this,
        emit: typeof baseContext?.emit === 'function' ? baseContext.emit : () => {},
        signal: baseContext?.signal || null
      };
      if (parsed.options.help) return normalizeResult(this.help(spec.key));
      const finish = value => {
        const result = normalizeResult(value);
        if (parsed.options.json) {
          const payload = result.data !== undefined ? result.data : { ok: result.ok, code: result.code, message: result.out, warnings: result.warnings };
          result.out = JSON.stringify(payload, null, 2);
          result.display = 'json';
        } else if (parsed.options.quiet && result.ok) result.out = '';
        return result;
      };
      try {
        const value = spec.handler(ctx);
        if (value && typeof value.then === 'function') return value.then(finish).catch(errorResult);
        return finish(value);
      } catch (error) { return errorResult(error); }
    }
    help(query) {
      const q = String(query || '').trim().toLowerCase();
      if (q) {
        const exact = this.byPath.get(q);
        const matches = exact ? [exact] : this.visible().filter(spec => spec.key.includes(q) || String(spec.description || '').toLowerCase().includes(q));
        if (!matches.length) return '没有找到与「' + query + '」匹配的命令。';
        return matches.map(spec => {
          const lines = [spec.usage || spec.key, '  ' + (spec.description || '暂无说明')];
          if (spec.examples && spec.examples.length) lines.push('  示例：' + spec.examples.join('；'));
          if (spec.aliases && spec.aliases.length) lines.push('  别名：' + spec.aliases.map(item => item.join(' ')).join('、'));
          return lines.join('\n');
        }).join('\n\n');
      }
      const groups = new Map();
      this.visible().forEach(spec => {
        const group = spec.group || '其他';
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(spec);
      });
      const body = [];
      groups.forEach((specs, group) => {
        body.push('── ' + group + ' ──');
        specs.forEach(spec => body.push('  ' + (spec.usage || spec.key).padEnd(34, ' ') + ' ' + (spec.description || '')));
      });
      return '天择OS 命令行 · 统一命令中心\n' + body.join('\n') + '\n\n通用选项：--help 查看命令帮助；--json 输出结构化 JSON；--quiet 隐藏成功提示。\n快捷键：Tab 补全，↑/↓ 历史，Ctrl+L 清屏，Ctrl+C 中止当前任务。旧版命令仍可使用，但建议采用上面的命名空间。';
    }
    complete(input) {
      let tokens;
      try { tokens = tokenize(input); } catch (_) { return []; }
      const source = String(input || '');
      const endsSpace = /\s$/.test(source);
      const values = tokens.map(token => token.value.toLowerCase());
      const prefix = endsSpace ? '' : (values.pop() || '');
      const base = values.join(' ');
      return this.visible().map(spec => spec.key).filter(key => {
        if (!base) return key.startsWith(prefix);
        return key.startsWith(base + ' ' + prefix);
      }).slice(0, 30);
    }
    agentPrompt() {
      const groups = new Map();
      this.visible().filter(spec => spec.agent !== false).forEach(spec => {
        const group = spec.group || '其他';
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(spec.usage || spec.key);
      });
      return [...groups.entries()].map(([group, specs]) => '· ' + group + '：' + specs.join(' | ')).join('\n');
    }
  }

  class TaskManager {
    constructor(registry) { this.registry = registry; this.seq = 0; this.tasks = new Map(); }
    start(input, context) {
      const id = 'cli-' + Date.now().toString(36) + '-' + (++this.seq);
      const controller = new AbortController();
      const task = { id, input: String(input || ''), status: 'running', startedAt: Date.now(), controller, result: null };
      this.tasks.set(id, task);
      const promise = Promise.resolve(this.registry.execute(input, { ...(context || {}), taskId: id, signal: controller.signal }))
        .then(result => { task.status = controller.signal.aborted ? 'cancelled' : result && result.ok === false ? 'failed' : 'completed'; task.result = result; return result; })
        .catch(error => { task.status = controller.signal.aborted ? 'cancelled' : 'failed'; task.result = errorResult(error); return task.result; })
        .finally(() => { task.endedAt = Date.now(); });
      task.promise = promise;
      task.cancel = () => { if (task.status === 'running') { task.status = 'cancelling'; controller.abort(); } };
      return task;
    }
    list() { return [...this.tasks.values()].sort((a, b) => b.startedAt - a.startedAt); }
    get(id) { return this.tasks.get(id) || null; }
    prune(max) { const done = this.list().filter(task => task.status !== 'running' && task.status !== 'cancelling').slice(max || 30); done.forEach(task => this.tasks.delete(task.id)); }
  }

  global.TZCLIEngine = { tokenize, parseOptions, normalizeResult, createLoopDetector, Registry, TaskManager };
})(window);
