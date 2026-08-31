(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
    return;
  }
  root.TZCocTutorialMeta = api;
  if (root.document) api.init(root.document, typeof root.fetch === "function" ? root.fetch.bind(root) : null);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function asDate(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    var time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time) : null;
  }

  function newestArticleDate(payload) {
    var articles = payload && Array.isArray(payload.articles) ? payload.articles : [];
    var newest = null;
    articles.forEach(function (article) {
      if (!article || typeof article !== "object") return;
      [article.publishedAt, article.updatedAt].forEach(function (value) {
        var candidate = asDate(value);
        if (candidate && (!newest || candidate.getTime() > newest.getTime())) newest = candidate;
      });
    });
    return newest;
  }

  function formatDate(date) {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
    var parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date).reduce(function (result, part) {
      if (part.type !== "literal") result[part.type] = part.value;
      return result;
    }, {});
    return {
      primary: parts.month + "-" + parts.day,
      secondary: parts.year,
      iso: date.toISOString()
    };
  }

  function renderDate(node, date) {
    if (!node) return;
    var primary = node.querySelector("b");
    var secondary = node.querySelector("small");
    var formatted = formatDate(date);
    if (!formatted) {
      if (primary) primary.textContent = "待发布";
      if (secondary) secondary.textContent = "COC 教程";
      node.removeAttribute("datetime");
      node.setAttribute("aria-label", "COC 教程尚无文章");
      node.setAttribute("data-date-state", "pending");
      return;
    }
    if (primary) primary.textContent = formatted.primary;
    if (secondary) secondary.textContent = formatted.secondary;
    node.setAttribute("datetime", formatted.iso);
    node.setAttribute("aria-label", "COC 教程最新文章日期 " + formatted.secondary + "年" + formatted.primary.replace("-", "月") + "日");
    node.setAttribute("data-date-state", "ready");
  }

  function loadCard(documentRef, fetchImpl) {
    var node = documentRef && documentRef.querySelector("[data-coc-tutorial-date]");
    if (!node) return Promise.resolve(null);
    renderDate(node, null);
    if (typeof fetchImpl !== "function") return Promise.resolve(null);
    var source = node.getAttribute("data-metadata-src") || "../coc/tutorial/articles.json";
    var url;
    try { url = new URL(source, documentRef.baseURI).href; }
    catch (error) { return Promise.resolve(null); }
    return fetchImpl(url, { credentials: "same-origin", cache: "no-cache" })
      .then(function (response) {
        if (!response || !response.ok) throw new Error("HTTP " + (response && response.status));
        return response.json();
      })
      .then(function (payload) {
        var newest = newestArticleDate(payload);
        renderDate(node, newest);
        return newest;
      })
      .catch(function () {
        renderDate(node, null);
        return null;
      });
  }

  function init(documentRef, fetchImpl) {
    if (!documentRef) return;
    var run = function () { loadCard(documentRef, fetchImpl); };
    if (documentRef.readyState === "loading") documentRef.addEventListener("DOMContentLoaded", run, { once: true });
    else run();
  }

  return Object.freeze({
    newestArticleDate: newestArticleDate,
    formatDate: formatDate,
    renderDate: renderDate,
    loadCard: loadCard,
    init: init
  });
});
