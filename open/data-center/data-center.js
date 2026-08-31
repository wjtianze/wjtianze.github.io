(function () {
  "use strict";
  var Core = window.TianzeDataCore;
  var MAX_ARCHIVE_BYTES = 96 * 1024 * 1024;
  var SETTINGS_KEYS = ["tz_site_palette", "tz_site_theme", "tz_palette", "tianze_site_palette"];
  var COC_KEYS = ["tz_coc_village", "tz_coc_dmgcalc_v1", "tz_coc_planner_v1"];
  var MODULE_NAMES = { settings: "网站设置", coc: "COC 工作区", english: "英语学习", learning: "学习助手进度" };
  var pendingArchive = null;

  function $(id) { return document.getElementById(id); }
  function status(id, message, tone) {
    var el = $(id); if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("is-error", tone === "error");
    el.classList.toggle("is-ok", tone === "ok");
  }
  function formatBytes(bytes) {
    bytes = Math.max(0, Number(bytes) || 0);
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + " KiB";
    return (bytes / 1024 / 1024).toFixed(2) + " MiB";
  }
  function selectedModuleIds(selector) {
    return Array.prototype.map.call(document.querySelectorAll(selector || '#moduleList input[type="checkbox"]:checked'), function (input) { return input.value; });
  }
  function localMap(keys) {
    var result = {};
    keys.forEach(function (key) { var value = localStorage.getItem(key); if (value !== null) result[key] = value; });
    return result;
  }
  function learningKeys(includeSecrets) {
    var keys = [];
    for (var i = 0; i < localStorage.length; i += 1) {
      var key = localStorage.key(i);
      if (key && (key.indexOf("tlh_") === 0 || key.indexOf("tlhL") === 0)) keys.push(key);
    }
    if (includeSecrets && localStorage.getItem("tz_site_tlh_apikey") !== null) keys.push("tz_site_tlh_apikey");
    return Array.from(new Set(keys)).sort();
  }

  function openWordsDb() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open("tzwords", 1);
      request.onupgradeneeded = function () { var db = request.result; if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv", { keyPath: "k" }); };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("无法打开英语学习数据库")); };
    });
  }
  async function readWordsDb() {
    var db = await openWordsDb();
    try {
      return await new Promise(function (resolve, reject) {
        var tx = db.transaction("kv", "readonly"), store = tx.objectStore("kv"), result = { vocab: [], records: {} };
        var vocab = store.get("vocab"), records = store.get("records");
        vocab.onsuccess = function () { result.vocab = vocab.result && Array.isArray(vocab.result.v) ? vocab.result.v : []; };
        records.onsuccess = function () { var value = records.result && records.result.v; result.records = value && typeof value === "object" && !Array.isArray(value) ? value : {}; };
        tx.oncomplete = function () { resolve(result); };
        tx.onerror = function () { reject(tx.error || new Error("读取英语学习数据库失败")); };
        tx.onabort = tx.onerror;
      });
    } finally { db.close(); }
  }
  async function writeWordsDb(data) {
    var db = await openWordsDb();
    try {
      await new Promise(function (resolve, reject) {
        var tx = db.transaction("kv", "readwrite"), store = tx.objectStore("kv");
        store.put({ k: "vocab", v: Array.isArray(data && data.vocab) ? data.vocab : [] });
        store.put({ k: "records", v: data && data.records && typeof data.records === "object" && !Array.isArray(data.records) ? data.records : {} });
        tx.oncomplete = resolve; tx.onerror = function () { reject(tx.error || new Error("写入英语学习数据库失败")); }; tx.onabort = tx.onerror;
      });
    } finally { db.close(); }
  }

  async function collectModule(id, includeSecrets) {
    if (id === "settings") return { localStorage: localMap(SETTINGS_KEYS) };
    if (id === "coc") return { localStorage: localMap(COC_KEYS) };
    if (id === "learning") return { localStorage: localMap(learningKeys(includeSecrets)) };
    if (id === "english") {
      var rawMeta = localStorage.getItem("tzwords_meta_v1"), meta = {};
      if (rawMeta) { try { meta = JSON.parse(rawMeta); } catch (_) { meta = {}; } }
      return { meta: includeSecrets ? meta : Core.stripSecrets(meta), indexedDB: await readWordsDb() };
    }
    throw new Error("未知数据模块：" + id);
  }
  async function collectModules(ids, includeSecrets) {
    var modules = {};
    for (var i = 0; i < ids.length; i += 1) modules[ids[i]] = await collectModule(ids[i], includeSecrets);
    return modules;
  }
  function moduleCounts(id, data) {
    if (id === "english") return (Array.isArray(data.indexedDB && data.indexedDB.vocab) ? data.indexedDB.vocab.length : 0) + Object.keys(data.indexedDB && data.indexedDB.records || {}).length;
    return Object.keys(data.localStorage || {}).length;
  }
  async function refreshInventory() {
    status("exportStatus", "正在读取本地模块…");
    try {
      var modules = await collectModules(Core.MODULE_IDS, false);
      Core.MODULE_IDS.forEach(function (id) {
        var card = document.querySelector('[data-module="' + id + '"]'), bytes = Core.byteLength(modules[id]), count = moduleCounts(id, modules[id]);
        if (card) card.querySelector("[data-module-size]").textContent = formatBytes(bytes) + " · " + count + " 项";
      });
      status("exportStatus", "模块容量已更新。", "ok");
      return modules;
    } catch (error) {
      status("exportStatus", "统计失败：" + error.message, "error");
      throw error;
    }
  }
  function downloadArchive(wrapper) {
    var blob = new Blob([JSON.stringify(wrapper, null, 2) + "\n"], { type: "application/json" });
    var url = URL.createObjectURL(blob), link = document.createElement("a"), day = new Date().toISOString().slice(0, 10);
    link.href = url; link.download = "天择网本地数据-" + day + ".tzwebarchive"; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  async function exportSelected() {
    var ids = selectedModuleIds(), password = $("exportPassword").value, password2 = $("exportPassword2").value, includeSecrets = $("includeSecrets").checked;
    if (!ids.length) return status("exportStatus", "请至少选择一个数据模块。", "error");
    if (password.length < 6) return status("exportStatus", "归档密码至少需要 6 个字符。", "error");
    if (password !== password2) return status("exportStatus", "两次输入的密码不一致。", "error");
    if (includeSecrets && !window.confirm("你选择了包含 API Key。密钥会进入加密归档；请确认密码足够安全并妥善保管文件。是否继续？")) return;
    $("exportArchive").disabled = true; status("exportStatus", "正在收集并加密所选模块…");
    try {
      var modules = await collectModules(ids, includeSecrets), archive = Core.makeArchive(modules, { includeSecrets: includeSecrets });
      if (Core.byteLength(archive) > MAX_ARCHIVE_BYTES) throw new Error("归档内容超过 96 MiB 安全上限");
      var wrapper = await Core.encryptArchive(archive, password);
      downloadArchive(wrapper);
      status("exportStatus", "加密归档已导出；请牢记密码。" + (includeSecrets ? "本次归档包含 API Key。" : "API Key 已排除。"), "ok");
    } catch (error) { status("exportStatus", "导出失败：" + error.message, "error"); }
    finally { $("exportArchive").disabled = false; }
  }

  async function parseSelectedArchive() {
    var file = $("archiveFile").files[0], password = $("importPassword").value;
    if (!file) throw new Error("请选择 .tzwebarchive 文件");
    if (file.size > MAX_ARCHIVE_BYTES * 1.5) throw new Error("归档文件过大");
    if (!password) throw new Error("请输入归档密码");
    var wrapper;
    try { wrapper = JSON.parse(await file.text()); } catch (_) { throw new Error("归档不是有效 JSON"); }
    return Core.decryptArchive(wrapper, password);
  }
  function renderPreview(archive) {
    var root = $("restorePreview"); root.replaceChildren();
    Object.keys(archive.modules).forEach(function (id) {
      var label = document.createElement("label"), input = document.createElement("input"), name = document.createElement("span"), size = document.createElement("strong");
      input.type = "checkbox"; input.value = id; input.checked = true;
      name.textContent = MODULE_NAMES[id] || id; size.textContent = formatBytes(Core.byteLength(archive.modules[id])) + " · " + moduleCounts(id, archive.modules[id]);
      label.appendChild(input); label.appendChild(name); label.appendChild(size); root.appendChild(label);
    });
    var note = document.createElement("p"); note.className = "dc-help"; note.textContent = "归档时间：" + archive.createdAt + (archive.includeSecrets ? " · 归档声明包含 API Key" : " · 不含 API Key"); root.appendChild(note);
    root.hidden = false; $("restoreArchive").disabled = false;
    $("restoreSecrets").checked = false;
    $("restoreSecrets").disabled = archive.includeSecrets !== true;
  }
  async function previewArchive() {
    $("previewArchive").disabled = true; pendingArchive = null; $("restoreArchive").disabled = true; $("restoreSecrets").checked = false; $("restoreSecrets").disabled = true; $("restorePreview").hidden = true;
    status("restoreStatus", "正在解密并校验归档…");
    try { pendingArchive = await parseSelectedArchive(); renderPreview(pendingArchive); status("restoreStatus", "预览完成。确认勾选模块后再恢复，当前数据尚未改变。", "ok"); }
    catch (error) { status("restoreStatus", "预览失败：" + error.message, "error"); }
    finally { $("previewArchive").disabled = false; }
  }
  function prepareLocalReplacement(knownKeys, incoming, allowKey) {
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) throw new Error("本地存储模块结构无效");
    var entries = Object.keys(incoming).map(function (key) {
      var allowed = knownKeys.indexOf(key) >= 0 || Boolean(allowKey && allowKey(key));
      if (!allowed || typeof incoming[key] !== "string") throw new Error("本地存储项越界或不是字符串：" + key);
      return [key, incoming[key]];
    });
    return { remove: knownKeys.slice(), entries: entries };
  }
  function replaceLocalKeys(knownKeys, incoming, allowKey) {
    var plan = prepareLocalReplacement(knownKeys, incoming, allowKey);
    plan.remove.forEach(function (key) { localStorage.removeItem(key); });
    plan.entries.forEach(function (entry) { localStorage.setItem(entry[0], entry[1]); });
  }
  async function restoreModule(id, data, restoreSecrets) {
    if (id === "settings") return replaceLocalKeys(SETTINGS_KEYS, data.localStorage);
    if (id === "coc") return replaceLocalKeys(COC_KEYS, data.localStorage);
    if (id === "learning") {
      var learningMap=Object.assign({},data.localStorage||{});
      if(!restoreSecrets)delete learningMap.tz_site_tlh_apikey;
      return replaceLocalKeys(learningKeys(Boolean(restoreSecrets)), learningMap, function (key) {
      return key.indexOf("tlh_") === 0 || key.indexOf("tlhL") === 0 || (restoreSecrets && key === "tz_site_tlh_apikey");
      });
    }
    if (id === "english") {
      var nextMeta = data.meta && typeof data.meta === "object" ? data.meta : {};
      if (!restoreSecrets) {
        var currentMeta = {};
        try { currentMeta = JSON.parse(localStorage.getItem("tzwords_meta_v1") || "{}"); } catch (_) {}
        nextMeta = Core.preserveSecrets(nextMeta, currentMeta);
      }
      localStorage.removeItem("tzwords_meta_v1");
      localStorage.setItem("tzwords_meta_v1", JSON.stringify(nextMeta));
      await writeWordsDb(data.indexedDB || {}); return;
    }
    throw new Error("未知数据模块：" + id);
  }
  function validateRestoreSelection(ids, archive) {
    Core.validateArchive(archive);
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error("请选择有效且不重复的数据模块");
    ids.forEach(function (id) {
      if (Core.MODULE_IDS.indexOf(id) < 0 || !Object.prototype.hasOwnProperty.call(archive.modules, id)) throw new Error("归档缺少所选模块：" + id);
      var data = archive.modules[id];
      if (id === "settings") prepareLocalReplacement(SETTINGS_KEYS, data.localStorage);
      else if (id === "coc") prepareLocalReplacement(COC_KEYS, data.localStorage);
      else if (id === "learning") prepareLocalReplacement([], data.localStorage, function (key) {
        return key.indexOf("tlh_") === 0 || key.indexOf("tlhL") === 0 || (archive.includeSecrets === true && key === "tz_site_tlh_apikey");
      });
      else JSON.stringify(data.indexedDB);
    });
    return ids;
  }
  async function restoreSelected() {
    if (!pendingArchive) return status("restoreStatus", "请先解密并预览归档。", "error");
    var ids = selectedModuleIds('#restorePreview input[type="checkbox"]:checked');
    if (!ids.length) return status("restoreStatus", "请至少选择一个要恢复的模块。", "error");
    if (!window.confirm("恢复会替换所选模块的当前数据，其它模块不受影响。是否继续？")) return;
    var restoreSecrets=pendingArchive.includeSecrets===true&&$("restoreSecrets").checked;
    if(restoreSecrets&&!window.confirm("你选择了恢复归档中的 API Key、令牌或其它密钥。这会用归档值替换当前设备的对应密钥。确认继续吗？"))return;
    $("restoreArchive").disabled = true; status("restoreStatus", "正在校验并恢复所选模块…");
    try {
      validateRestoreSelection(ids, pendingArchive);
      await Core.runTransactional(ids,
        function (id) { return collectModule(id, true); },
        function (id, snapshot) { return restoreModule(id, Core.prepareRestoreModule(pendingArchive.modules[id], snapshot, restoreSecrets), restoreSecrets); },
        function (id, snapshot) { return restoreModule(id, snapshot, true); });
      status("restoreStatus", "已恢复：" + ids.map(function (id) { return MODULE_NAMES[id]; }).join("、") + "。重新打开相关工具即可读取新数据。", "ok");
      await refreshInventory();
    } catch (error) { status("restoreStatus", error && error.message ? error.message : "恢复失败", "error"); }
    finally { $("restoreArchive").disabled = false; }
  }
  async function clearModule(id) {
    if (id === "settings") return replaceLocalKeys(SETTINGS_KEYS, {});
    if (id === "coc") return replaceLocalKeys(COC_KEYS, {});
    if (id === "learning") return replaceLocalKeys(learningKeys(true), {});
    if (id === "english") { localStorage.removeItem("tzwords_meta_v1"); await writeWordsDb({ vocab: [], records: {} }); return; }
  }
  async function clearSelected() {
    var ids = selectedModuleIds(); if (!ids.length) return status("exportStatus", "请先选择要清除的模块。", "error");
    if (!window.confirm("将永久清除“" + ids.map(function (id) { return MODULE_NAMES[id]; }).join("、") + "”。此操作不可撤销，是否继续？")) return;
    $("clearSelected").disabled = true;
    try { for (var i = 0; i < ids.length; i += 1) await clearModule(ids[i]); status("exportStatus", "所选模块已清除。", "ok"); await refreshInventory(); }
    catch (error) { status("exportStatus", "清除失败：" + error.message, "error"); }
    finally { $("clearSelected").disabled = false; }
  }

  async function waitForPwa() {
    for (var i = 0; i < 80; i += 1) { if (window.TZPWA) return window.TZPWA; await new Promise(function (resolve) { setTimeout(resolve, 50); }); }
    return null;
  }
  async function refreshPacks() {
    var api = await waitForPwa(), support = $("offlineSupport");
    if (!api || !api.supported) { support.textContent = "当前环境不支持离线内容包；请通过 HTTPS 或本机 HTTP 顶层页面访问。"; document.querySelectorAll("[data-pack-action]").forEach(function (b) { b.disabled = true; }); return; }
    support.textContent = "离线核心已启用。内容包只缓存在当前浏览器。";
    try {
      var state = await api.getStatus();
      document.querySelectorAll("[data-pack]").forEach(function (card) {
        var id = card.getAttribute("data-pack"), pack = state.packs && state.packs[id], installed = Boolean(pack);
        card.querySelector("[data-pack-state]").textContent = installed ? (pack.stale ? "旧版 " + pack.revision + " · " : "") + pack.count + " 个资源" : "未下载";
        var button = card.querySelector("[data-pack-action]");
        button.textContent = pack && pack.stale ? "重试更新" : installed ? "移除" : "下载";
        button.dataset.action = pack && pack.stale ? "update" : installed ? "remove" : "install";
      });
      $("installSite").hidden = !api.canInstall();
    } catch (error) { status("offlineStatus", "读取离线状态失败：" + error.message, "error"); }
  }
  async function togglePack(button) {
    var card = button.closest("[data-pack]"), id = card.getAttribute("data-pack"), api = await waitForPwa(); if (!api) return;
    var removing=button.dataset.action==="remove";
    button.disabled = true; status("offlineStatus", (removing ? "正在移除" : "正在下载或更新") + "内容包…");
    try { if (removing) await api.removePack(id); else await api.installPack(id); status("offlineStatus", removing ? "内容包已移除。" : "内容包已完整下载，可断网使用。", "ok"); await refreshPacks(); }
    catch (error) { status("offlineStatus", "离线内容包操作失败：" + error.message, "error"); }
    finally { button.disabled = false; }
  }
  async function initOffline() {
    document.querySelectorAll("[data-pack-action]").forEach(function (button) { button.addEventListener("click", function () { togglePack(button); }); });
    $("checkUpdate").addEventListener("click", async function () { var api = await waitForPwa(); if (!api) return; status("offlineStatus", "正在检查更新…"); try { var updated = await api.checkForUpdate(); status("offlineStatus", updated ? "发现更新，请按页面提示刷新。" : "当前已是最新缓存版本。", "ok"); } catch (e) { status("offlineStatus", "检查更新失败：" + e.message, "error"); } });
    $("installSite").addEventListener("click", async function () { var api = await waitForPwa(); if (api) await api.promptInstall(); });
    await refreshPacks();
  }

  function init() {
    if (!Core) return status("exportStatus", "数据中心核心模块加载失败。", "error");
    $("refreshModules").addEventListener("click", refreshInventory);
    $("exportArchive").addEventListener("click", exportSelected);
    $("previewArchive").addEventListener("click", previewArchive);
    $("restoreArchive").addEventListener("click", restoreSelected);
    $("clearSelected").addEventListener("click", clearSelected);
    $("archiveFile").addEventListener("change", function () { pendingArchive = null; $("restorePreview").hidden = true; $("restoreArchive").disabled = true; $("restoreSecrets").checked = false; $("restoreSecrets").disabled = true; status("restoreStatus", ""); });
    window.__tzDataCenterTest = { collectModules: collectModules, refreshInventory: refreshInventory, restoreModule: restoreModule, prepareLocalReplacement: prepareLocalReplacement, validateRestoreSelection: validateRestoreSelection, moduleIds: Core.MODULE_IDS.slice() };
    refreshInventory().catch(function () {}); initOffline();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
