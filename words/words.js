/*
 * 旧版 /words/ 静态资源兼容入口。
 * 唯一维护源：/english/words/words.js
 */
(function loadCanonicalWordsApp() {
  'use strict';

  const entry = document.currentScript;
  if (!entry || !entry.src) {
    console.error('[天择背单词] 无法确定兼容脚本地址，规范脚本未装载');
    return;
  }

  const legacyUrl = new URL(entry.src, document.baseURI);
  const canonicalUrl = new URL('../english/words/words.js', legacyUrl);
  // 沿用旧入口的版本参数，让既有缓存失效策略继续生效。
  canonicalUrl.search = legacyUrl.search;

  const alreadyPresent = Array.from(document.scripts).some((script) => {
    if (script === entry || !script.src) return false;
    try {
      return new URL(script.src, document.baseURI).href === canonicalUrl.href;
    } catch (_) {
      return false;
    }
  });
  if (alreadyPresent) return;

  const script = document.createElement('script');
  script.src = canonicalUrl.href;
  script.async = false;
  script.dataset.tzWordsCanonical = 'true';
  script.addEventListener('error', () => {
    console.error('[天择背单词] 规范脚本装载失败：' + canonicalUrl.href);
  }, { once: true });
  entry.insertAdjacentElement('afterend', script);
})();
