/* 天择OS COC 实时查询统一客户端：网页与桌面默认走 Cloudflare，本机 coc.py 仅在用户显式选择时启用。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TZCocLiveService = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CLOUD_ROOT = 'https://tianze-coc-query.xia-xilin-sgy.workers.dev';
  const TURNSTILE_ACTION = 'coc_query';
  const TURNSTILE_HEADER = 'X-Turnstile-Token';
  const MAX_RESPONSE_CHARS = 3 * 1024 * 1024;
  const MAX_ATTEMPTS = 3;
  const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
  const NON_RETRYABLE_CODES = new Set([
    'coc_key_limit', 'coc_ip_rejected', 'coc_credentials_rejected', 'coc_not_configured',
    'turnstile_rejected', 'turnstile_unavailable', 'turnstile_required'
  ]);
  const FORBIDDEN_ACTIONS = new Set([
    'verify_player_token', 'parse_army_link', 'parse_account_data', 'get_troop', 'get_spell',
    'get_hero', 'get_pet', 'get_equipment', 'get_translation', 'get_extended_cwl_group_data'
  ]);

  function serviceError(message, details) {
    const error = new Error(String(message || 'COC 实时查询失败'));
    Object.assign(error, details || {});
    return error;
  }

  function localResult(response, fallback) {
    if (!response || typeof response !== 'object') throw serviceError(fallback || 'COC 本机服务返回了无效响应');
    if (response.ok === false) {
      throw serviceError(response.error && (response.error.message || response.error.code) || fallback, {
        code: response.error && response.error.code
      });
    }
    return Object.prototype.hasOwnProperty.call(response, 'result') ? response.result : response;
  }

  function retryable(error) {
    if (!error || error.name === 'AbortError') return false;
    const code = String(error.code || '').toLowerCase();
    // 任何已经由 Worker 分类的 COC/Turnstile 错误都不得重放，否则会重复
    // 登录开发者门户或初始化 API Key；仅网络故障和未分类网关错误可重试。
    if (NON_RETRYABLE_CODES.has(code) || code.startsWith('coc_') || code.startsWith('turnstile_')) return false;
    if (RETRYABLE_STATUS.has(Number(error.status) || 0)) return true;
    return !error.status && (error instanceof TypeError || ['network', 'timeout'].includes(String(error.kind || '').toLowerCase()));
  }

  function delay(ms, sleeper) {
    if (typeof sleeper === 'function') return Promise.resolve(sleeper(ms));
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function strictJson(response) {
    const contentType = String(response && response.headers && response.headers.get && response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      throw serviceError('COC 查询服务返回的内容类型无效', { status: Number(response && response.status) || 502 });
    }
    const text = await response.text();
    if (!text || text.length > MAX_RESPONSE_CHARS) {
      throw serviceError(text ? 'COC 查询结果过大' : 'COC 查询服务返回了空响应', { status: 502 });
    }
    try { return JSON.parse(text); }
    catch (_) { throw serviceError('COC 查询服务返回的 JSON 无效', { status: 502 }); }
  }

  async function parseCloudResponse(response) {
    const status = Number(response && response.status) || 0;
    const body = await strictJson(response);
    if (!response.ok || (body && typeof body === 'object' && body.ok === false)) {
      const remote = body && typeof body === 'object' && body.error && typeof body.error === 'object' ? body.error : {};
      throw serviceError(remote.message || ('COC 云端查询失败（HTTP ' + (status || '?') + '）'), {
        code: String(remote.code || 'cloud_error').slice(0, 80),
        status: status || 502
      });
    }
    return body;
  }

  function normalizeToken(value) {
    const token = String(value || '').trim();
    if (!token || token.length > 2048 || /\s/.test(token)) throw serviceError('云端安全验证返回了无效令牌');
    return token;
  }

  function createClient(options) {
    const opts = options || {};
    const fetchImpl = opts.fetch;
    const cloudRequest = typeof opts.cloudRequest === 'function' ? opts.cloudRequest : null;
    const getToken = opts.getToken;
    const localRequest = typeof opts.localRequest === 'function' ? opts.localRequest : null;
    if (typeof fetchImpl !== 'function' && !cloudRequest && !localRequest) throw serviceError('当前环境没有可用的 COC 查询通道');

    function transport() { return localRequest ? 'local' : 'cloud'; }

    async function cloudFetch(path, request, needsToken) {
      if (typeof fetchImpl !== 'function' && !cloudRequest) throw serviceError('当前环境无法访问 COC 云端查询');
      let lastError = null;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          const headers = Object.assign({ Accept: 'application/json' }, request && request.headers || {});
          if (needsToken) {
            if (typeof getToken !== 'function') throw serviceError('云端安全验证尚未配置，请刷新页面后重试');
            // Turnstile 令牌只能使用一次，因此每次重试都必须重新获取。
            headers[TURNSTILE_HEADER] = normalizeToken(await getToken(TURNSTILE_ACTION));
          }
          let response;
          const controller = !cloudRequest && typeof AbortController === 'function' ? new AbortController() : null;
          const timeout = controller ? setTimeout(() => controller.abort(), 20000) : null;
          try {
            if (cloudRequest) {
              const bridged = await cloudRequest({
                path,
                method: request && request.method || 'GET',
                token: headers[TURNSTILE_HEADER] || '',
                body: request && request.body
              });
              if (!bridged || typeof bridged !== 'object' || typeof bridged.status !== 'number') {
                throw serviceError('COC 桌面云端代理返回了无效响应');
              }
              const bridgedText = JSON.stringify(bridged.body == null ? null : bridged.body);
              response = {
                ok: bridged.ok === true,
                status: bridged.status,
                headers: { get: name => String(name).toLowerCase() === 'content-type' ? String(bridged.contentType || 'application/json') : '' },
                text: async () => bridgedText
              };
            } else {
              response = await fetchImpl(CLOUD_ROOT + path, Object.assign({}, request || {}, {
                method: request && request.method || 'GET',
                mode: 'cors',
                cache: 'no-store',
                credentials: 'omit',
                redirect: 'error',
                referrerPolicy: 'no-referrer',
                signal: controller ? controller.signal : undefined,
                headers
              }));
            }
          } catch (error) {
            if (controller && controller.signal.aborted) throw serviceError('COC 云端查询超时，请重试', { kind: 'timeout' });
            throw serviceError(error && error.message || 'COC 云端网络连接失败', { kind: 'network' });
          } finally {
            if (timeout) clearTimeout(timeout);
          }
          return await parseCloudResponse(response);
        } catch (error) {
          lastError = error;
          if (attempt + 1 >= MAX_ATTEMPTS || !retryable(error)) throw error;
          await delay(Math.min(1600, 350 * Math.pow(2, attempt)), opts.sleep);
        }
      }
      throw lastError || serviceError('COC 云端查询重试异常结束');
    }

    async function status() {
      if (localRequest) {
        const result = localResult(await localRequest({ operation: 'session.status' }), 'COC 本机服务状态读取失败');
        return Object.assign({}, result, { transport: 'local' });
      }
      const result = await cloudFetch('/api/health', { method: 'GET' }, false);
      if (!result || result.ok !== true || result.service !== 'tianze-coc-query') {
        throw serviceError('COC 云端健康检查响应无效');
      }
      return {
        transport: 'cloud',
        connected: true,
        available: true,
        remembered: false,
        rememberSupported: false,
        service: result.service,
        cocPy: result.coc_py === true,
        usesCocPyStaticData: result.coc_static_data === true
      };
    }

    async function capabilities() {
      const result = localRequest
        ? localResult(await localRequest({ operation: 'capabilities.get' }), 'COC 能力表读取失败')
        : await cloudFetch('/api/coc/capabilities', { method: 'GET' }, true);
      if (!result || typeof result !== 'object' || !Array.isArray(result.readOnlyActions)) {
        throw serviceError('COC 能力表格式无效');
      }
      return result;
    }

    async function query(action, params) {
      const safeAction = String(action || '').trim();
      if (!/^[a-z][a-z0-9_]{1,80}$/.test(safeAction)) throw serviceError('COC 实时动作名称格式无效');
      if (FORBIDDEN_ACTIONS.has(safeAction)) throw serviceError('该动作不允许通过 COC 实时查询服务调用');
      if (!params || typeof params !== 'object' || Array.isArray(params)) throw serviceError('COC 查询参数必须是 JSON 对象');
      if (localRequest) {
        return localResult(await localRequest({ operation: 'query.invoke', action: safeAction, params }), 'COC 本机查询失败');
      }
      const body = JSON.stringify({ action: safeAction, params });
      if (body.length > 128 * 1024) throw serviceError('COC 查询参数过大');
      return cloudFetch('/api/coc/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      }, true);
    }

    async function localSession(operation, fallback) {
      if (!localRequest) throw serviceError('该命令只适用于天择OS桌面版的本机 COC 会话；云端没有访客登录可退出或删除');
      return localResult(await localRequest({ operation }), fallback);
    }

    return Object.freeze({
      transport,
      status,
      capabilities,
      query,
      logout: () => localSession('session.logout', 'COC 本机退出失败'),
      forget: () => localSession('session.forget', 'COC 本机登录删除失败')
    });
  }

  function browserOwners(rootValue) {
    const owner = rootValue || (typeof window !== 'undefined' ? window : null);
    const values = [];
    function add(value) { if (value && !values.includes(value)) values.push(value); }
    add(owner);
    try { if (owner && owner.parent && owner.parent !== owner) add(owner.parent); } catch (_) {}
    try { if (owner && owner.top && owner.top !== owner) add(owner.top); } catch (_) {}
    try { if (owner && owner.opener && !owner.opener.closed) add(owner.opener); } catch (_) {}
    return values;
  }

  function createBrowserClient(rootValue, options) {
    const owner = rootValue || (typeof window !== 'undefined' ? window : null);
    if (!owner) throw serviceError('当前环境无法创建 COC 查询客户端');
    const settings = options || {};
    let localRequest = null;
    let cloudRequest = null;
    for (const candidate of browserOwners(owner)) {
      try {
        if (!cloudRequest && candidate.tzDesktop && typeof candidate.tzDesktop.cocCloudRequest === 'function') {
          cloudRequest = request => candidate.tzDesktop.cocCloudRequest(request);
        }
        if (!localRequest && candidate.tzDesktop && typeof candidate.tzDesktop.cocQuery === 'function') {
          localRequest = request => candidate.tzDesktop.cocQuery(request);
        }
        if (!localRequest && candidate.nativeWorkspace && typeof candidate.nativeWorkspace.cocQuery === 'function') {
          localRequest = request => candidate.nativeWorkspace.cocQuery(request);
        }
      } catch (_) {}
    }
    const getToken = async action => {
      for (const candidate of browserOwners(owner)) {
        try {
          if (candidate.TZCloudSecurity && typeof candidate.TZCloudSecurity.getToken === 'function') {
            return await candidate.TZCloudSecurity.getToken(action);
          }
        } catch (error) { throw error; }
      }
      throw serviceError('云端安全验证尚未配置，请刷新页面后重试');
    };
    return createClient({
      fetch: typeof owner.fetch === 'function' ? owner.fetch.bind(owner) : null,
      cloudRequest,
      getToken,
      localRequest: settings.preferLocal === true ? localRequest : null
    });
  }

  return Object.freeze({
    CLOUD_ROOT,
    TURNSTILE_ACTION,
    TURNSTILE_HEADER,
    MAX_ATTEMPTS,
    NON_RETRYABLE_CODES,
    createClient,
    createBrowserClient,
    retryable
  });
});
