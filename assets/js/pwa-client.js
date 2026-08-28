/* 天择网 PWA 客户端：仅在顶层 HTTP(S) 页面注册，tzos:// 与 iframe 永不注册。 */
(function () {
  "use strict";
  var supported = (location.protocol === "https:" || location.protocol === "http:") && window === window.top && "serviceWorker" in navigator;
  var registration = null, installPrompt = null, updateVisible = false;
  function rootUrl() {
    var script = document.currentScript || Array.prototype.slice.call(document.scripts).filter(function (item) { return /assets\/js\/pwa-client\.js/.test(item.src); }).pop();
    try { return new URL("../../", script && script.src || location.href); } catch (_) { return new URL("./", location.href); }
  }
  var root = rootUrl();
  function ensureManifest() {
    if (document.querySelector('link[rel="manifest"]')) return;
    var link = document.createElement("link"); link.rel = "manifest"; link.href = new URL("manifest.webmanifest?v=20260828i", root).href; document.head.appendChild(link);
  }
  function workerTarget() { return registration && (registration.waiting || registration.active) || navigator.serviceWorker.controller; }
  async function request(message) {
    await ready;
    var target = workerTarget(); if (!target) throw new Error("离线服务尚未就绪");
    return new Promise(function (resolve, reject) {
      var channel = new MessageChannel(), timer = setTimeout(function () { reject(new Error("离线服务响应超时")); }, 45000);
      channel.port1.onmessage = function (event) { clearTimeout(timer); var data = event.data || {}; if (data.ok) resolve(data.value); else reject(new Error(data.error || "离线服务操作失败")); };
      target.postMessage(message, [channel.port2]);
    });
  }
  function showUpdate() {
    if (updateVisible || !registration || !registration.waiting) return; updateVisible = true;
    var bar = document.createElement("aside"); bar.className = "tz-pwa-update"; bar.setAttribute("role", "status");
    var copy = document.createElement("span"); copy.textContent = "天择网已有新版本，可刷新资源缓存。";
    var apply = document.createElement("button"); apply.type = "button"; apply.textContent = "立即更新";
    var later = document.createElement("button"); later.type = "button"; later.textContent = "稍后";
    bar.appendChild(copy); bar.appendChild(apply); bar.appendChild(later); document.body.appendChild(bar);
    apply.addEventListener("click", function () { registration.waiting.postMessage({ type: "SKIP_WAITING" }); });
    later.addEventListener("click", function () { bar.remove(); updateVisible = false; });
  }
  function watchRegistration(reg) {
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate();
    reg.addEventListener("updatefound", function () { var worker = reg.installing; if (!worker) return; worker.addEventListener("statechange", function () { if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdate(); }); });
  }
  var ready = (async function () {
    if (!supported) return null;
    ensureManifest();
    registration = await navigator.serviceWorker.register(new URL("sw.js", root).href, { scope: root.pathname, updateViaCache: "none" });
    watchRegistration(registration);
    await navigator.serviceWorker.ready;
    window.dispatchEvent(new CustomEvent("tzpwaready"));
    return registration;
  })().catch(function (error) { console.warn("[TZPWA] 注册失败", error); return null; });
  navigator.serviceWorker && navigator.serviceWorker.addEventListener("controllerchange", function () { if (updateVisible) location.reload(); });
  window.addEventListener("beforeinstallprompt", function (event) { event.preventDefault(); installPrompt = event; window.dispatchEvent(new CustomEvent("tzpwainstallable")); });
  window.addEventListener("appinstalled", function () { installPrompt = null; });
  window.TZPWA = {
    supported: supported,
    ready: ready,
    getStatus: function () { return request({ type: "PACK_STATUS" }); },
    installPack: function (pack) { return request({ type: "PACK_INSTALL", pack: pack }); },
    removePack: function (pack) { return request({ type: "PACK_REMOVE", pack: pack }); },
    canInstall: function () { return Boolean(installPrompt); },
    promptInstall: async function () { if (!installPrompt) return false; await installPrompt.prompt(); var choice = await installPrompt.userChoice; if (choice.outcome === "accepted") installPrompt = null; return choice.outcome === "accepted"; },
    checkForUpdate: async function () { await ready; if (!registration) throw new Error("离线服务不可用"); await registration.update(); if (registration.waiting) showUpdate(); return Boolean(registration.waiting); }
  };
})();
