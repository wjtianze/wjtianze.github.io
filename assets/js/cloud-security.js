/* 天择网 AI 与 COC 云端请求的 Cloudflare Turnstile 单次令牌契约。 */
(function (root) {
  "use strict";
  if (!root || (root.TZCloudSecurity && typeof root.TZCloudSecurity.getToken === "function" &&
      !root.TZCloudSecurity.__tzLoaderProxy)) return;

  var PUBLIC_TURNSTILE_SITE_KEY = "0x4AAAAAAEZRrp9Fo0m930vp";
  if (root.__TZ_TURNSTILE_SITE_KEY__ === undefined) root.__TZ_TURNSTILE_SITE_KEY__ = PUBLIC_TURNSTILE_SITE_KEY;
  var loader = null;
  function failure(message, code) {
    var error = new Error(message);
    error.code = code || "TURNSTILE_ERROR";
    return error;
  }
  function siteKey() {
    var value = root.__TZ_TURNSTILE_SITE_KEY__;
    if (typeof value !== "string") return "";
    value = value.trim();
    return /^[a-zA-Z0-9_-]{3,256}$/.test(value) && !/^REPLACE_/i.test(value) ? value : "";
  }
  function desktopBridge() {
    try {
      if (root.tzDesktop && typeof root.tzDesktop.getTurnstileToken === "function") return root.tzDesktop;
      if (root.top && root.top !== root && root.top.tzDesktop && typeof root.top.tzDesktop.getTurnstileToken === "function") return root.top.tzDesktop;
    } catch (_error) {}
    return null;
  }
  function normalizeToken(value) {
    var token = String(value || "").trim();
    if (!token || token.length > 2048 || /\s/.test(token)) {
      throw failure("云端安全验证返回了无效令牌，请重试", "TURNSTILE_TOKEN_INVALID");
    }
    return token;
  }
  function loadWidget() {
    if (root.turnstile && typeof root.turnstile.render === "function") return Promise.resolve(root.turnstile);
    if (loader) return loader;
    loader = new Promise(function (resolve, reject) {
      var script = document.querySelector('script[data-tz-turnstile="1"]');
      if (!script) {
        script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.dataset.tzTurnstile = "1";
        (document.head || document.documentElement).appendChild(script);
      }
      var timer = setTimeout(function () {
        loader = null;
        reject(failure("Turnstile 组件加载超时，请检查网络后重试", "TURNSTILE_LOAD_TIMEOUT"));
      }, 15000);
      function ready() {
        if (!root.turnstile || typeof root.turnstile.render !== "function") return false;
        clearTimeout(timer);
        resolve(root.turnstile);
        return true;
      }
      if (ready()) return;
      script.addEventListener("load", function () {
        if (!ready()) {
          clearTimeout(timer);
          loader = null;
          reject(failure("Turnstile 组件不可用，请刷新页面后重试", "TURNSTILE_UNAVAILABLE"));
        }
      }, { once: true });
      script.addEventListener("error", function () {
        clearTimeout(timer);
        loader = null;
        reject(failure("Turnstile 组件加载失败，请检查网络后重试", "TURNSTILE_LOAD_FAILED"));
      }, { once: true });
    });
    return loader;
  }
  function getToken(action) {
    var safeAction = String(action || "").trim();
    if (["tianze_ai", "coc_query"].indexOf(safeAction) < 0) {
      return Promise.reject(failure("云端安全验证用途无效", "TURNSTILE_ACTION_INVALID"));
    }
    var configuredSiteKey = siteKey();
    if (!configuredSiteKey) {
      return Promise.reject(failure(
        "云端安全验证尚未配置：请先显式设置公开 Turnstile Sitekey",
        "TURNSTILE_SITEKEY_MISSING"
      ));
    }
    var bridge = desktopBridge();
    if (bridge) {
      return Promise.resolve(bridge.getTurnstileToken(safeAction)).then(normalizeToken);
    }
    return loadWidget().then(function (turnstile) {
      return new Promise(function (resolve, reject) {
        var host = document.createElement("div");
        host.className = "tz-turnstile-runtime";
        host.setAttribute("aria-label", "云端安全验证");
        host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;min-width:1px;min-height:1px";
        (document.body || document.documentElement).appendChild(host);
        var widgetId = null;
        var settled = false;
        var timer = setTimeout(function () {
          finish(null, failure("云端安全验证超时，请重试", "TURNSTILE_TIMEOUT"));
        }, 30000);
        function finish(token, error) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          setTimeout(function () {
            try { if (widgetId !== null && typeof turnstile.remove === "function") turnstile.remove(widgetId); } catch (_error) {}
            try { host.remove(); } catch (_error) {}
          }, 0);
          if (error) reject(error);
          else resolve(String(token || ""));
        }
        try {
          widgetId = turnstile.render(host, {
            sitekey: configuredSiteKey,
            action: safeAction,
            execution: "execute",
            appearance: "interaction-only",
            callback: function (token) {
              try { finish(normalizeToken(token), null); }
              catch (error) { finish(null, error); }
            },
            "error-callback": function () { finish(null, failure("云端安全验证失败，请重试", "TURNSTILE_REJECTED")); },
            "expired-callback": function () { finish(null, failure("云端安全验证已过期，请重试", "TURNSTILE_EXPIRED")); }
          });
          turnstile.execute(widgetId);
        } catch (error) {
          finish(null, failure("无法启动云端安全验证：" + String(error && error.message || error), "TURNSTILE_RENDER_FAILED"));
        }
      });
    });
  }

  root.TZCloudSecurity = Object.freeze({ getToken: getToken });
})(typeof window !== "undefined" ? window : null);
