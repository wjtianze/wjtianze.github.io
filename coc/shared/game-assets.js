/* 天择网 COC 游戏素材清单：把单位编号和当前等级映射到本地 WebP。 */
(function (window, document) {
  "use strict";

  var script = document.currentScript;
  var scriptUrl = script && script.src ? script.src : document.baseURI;
  var assetBase = new URL("../assets/game/", scriptUrl);
  var manifestUrl = new URL("manifest.json?v=20260830a", assetBase);
  var manifest = { entries: {} };

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>\"]/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[character];
    });
  }

  function entry(id) {
    return manifest.entries[String(id == null ? "" : id)] || null;
  }

  function relativePath(id, level) {
    var item = entry(id);
    if (!item) return "";
    var levelKey = level == null || level === "" ? "" : String(parseInt(level, 10));
    if (levelKey && item.levels && item.levels[levelKey]) return item.levels[levelKey];
    return item.icon || item.preview || "";
  }

  function url(id, level) {
    var path = relativePath(id, level);
    return path ? new URL(path, assetBase).href : "";
  }

  function image(id, level, options) {
    options = options || {};
    var source = url(id, level);
    if (!source) return "";
    var size = Math.max(24, Math.min(160, Number(options.size) || 52));
    var className = options.className ? " " + escapeHtml(options.className) : "";
    var loading = options.eager ? "eager" : "lazy";
    var priority = options.eager ? ' fetchpriority="high"' : "";
    return '<img class="coc-game-image' + className + '" data-coc-game-asset="' +
      escapeHtml(String(id)) + '" src="' + escapeHtml(source) + '" alt="' +
      escapeHtml(options.alt || "") + '" width="' + size + '" height="' + size +
      '" loading="' + loading + '" decoding="async"' + priority + '>';
  }

  var ready = fetch(manifestUrl.href, { cache: "default" })
    .then(function (response) {
      if (!response.ok) throw new Error("游戏素材清单请求失败：" + response.status);
      return response.json();
    })
    .then(function (value) {
      if (!value || !value.entries) throw new Error("游戏素材清单格式无效");
      manifest = value;
      return value;
    })
    .catch(function () {
      manifest = { entries: {} };
      return manifest;
    });

  document.addEventListener("error", function (event) {
    var target = event.target;
    if (target && target.matches && target.matches("img[data-coc-game-asset]")) target.hidden = true;
  }, true);

  window.CocGameAssets = {
    ready: function () { return ready; },
    entry: entry,
    url: url,
    image: image
  };
})(window, document);
