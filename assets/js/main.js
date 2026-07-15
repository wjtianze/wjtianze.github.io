/* ============================================================
   天择网 · 公共交互层 v3
   导航、滚动揭示、可访问性与轻量动效
   ============================================================ */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var mobileNav = window.matchMedia("(max-width: 680px)");
  var topbar = document.querySelector(".topbar");
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".nav");

  document.documentElement.classList.add("js");

  function onScroll() {
    if (topbar) topbar.classList.toggle("scrolled", window.scrollY > 8);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* 移动端导航：同步视觉状态、ARIA 与键盘焦点。 */
  if (toggle && nav) {
    if (!nav.id) nav.id = "site-navigation";
    toggle.type = "button";
    toggle.setAttribute("aria-controls", nav.id);

    function setNavState(open, options) {
      var isOpen = Boolean(open && mobileNav.matches);
      nav.classList.toggle("open", isOpen);
      toggle.setAttribute("aria-expanded", String(isOpen));
      toggle.setAttribute("aria-label", isOpen ? "关闭主导航" : "打开主导航");
      nav.setAttribute("aria-hidden", String(mobileNav.matches && !isOpen));
      document.body.classList.toggle("nav-open", isOpen);
      if (isOpen && options && options.focusFirst) {
        var firstLink = nav.querySelector("a");
        if (firstLink) firstLink.focus();
      }
    }

    toggle.addEventListener("click", function () {
      setNavState(!nav.classList.contains("open"), { focusFirst: true });
    });

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () { setNavState(false); });
    });

    document.addEventListener("click", function (event) {
      if (nav.classList.contains("open") && !nav.contains(event.target) && !toggle.contains(event.target)) {
        setNavState(false);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && nav.classList.contains("open")) {
        setNavState(false);
        toggle.focus();
      }
    });

    function syncNavMode() { setNavState(nav.classList.contains("open")); }
    if (mobileNav.addEventListener) mobileNav.addEventListener("change", syncNavMode);
    else mobileNav.addListener(syncNavMode);
    setNavState(false);
  }

  /* 滚动揭示：减少动态效果时直接呈现内容。 */
  var reveals = document.querySelectorAll(".reveal");
  if (reduceMotion.matches) {
    reveals.forEach(function (element) { element.classList.add("in"); });
  } else if ("IntersectionObserver" in window && reveals.length) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -5% 0px" });

    reveals.forEach(function (element) { revealObserver.observe(element); });
  } else {
    reveals.forEach(function (element) { element.classList.add("in"); });
  }

  if (!reduceMotion.matches) {
    document.querySelectorAll(".grid, .feature-grid, .subzones, .scenario-list, .news-list").forEach(function (container) {
      container.querySelectorAll(".reveal").forEach(function (child, index) {
        child.style.setProperty("--reveal-delay", Math.min(index, 5) * 70 + "ms");
      });
    });
  }

  /* 背景视差只写入自定义属性，不覆盖组件自身 transform。 */
  var bgMesh = document.querySelector(".bg-mesh");
  if (bgMesh && !reduceMotion.matches) {
    var ticking = false;
    function updateParallax() {
      bgMesh.style.setProperty("--mesh-offset", window.scrollY * 0.035 + "px");
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) {
        window.requestAnimationFrame(updateParallax);
        ticking = true;
      }
    }, { passive: true });
  }

  document.querySelectorAll("[data-back]").forEach(function (button) {
    button.addEventListener("click", function (event) {
      event.preventDefault();
      if (history.length > 1) history.back();
      else window.location.href = button.getAttribute("data-home") || "../index.html";
    });
  });

  var pathElement = document.getElementById("err-path");
  if (pathElement) {
    var attemptedPath = new URLSearchParams(window.location.search).get("path") ||
      window.location.hash.replace(/^#/, "") ||
      document.referrer ||
      window.location.pathname;
    pathElement.textContent = attemptedPath || window.location.href;
  }

  /* 多条横幅才启用轮播；后台标签与减少动态效果时不自动切换。 */
  var banners = document.querySelectorAll(".banner-track .banner");
  if (banners.length > 1) {
    var bannerIndex = 0;
    banners.forEach(function (banner, index) {
      banner.hidden = index !== 0;
    });

    window.setInterval(function () {
      if (document.hidden || reduceMotion.matches) return;
      banners[bannerIndex].hidden = true;
      bannerIndex = (bannerIndex + 1) % banners.length;
      banners[bannerIndex].hidden = false;
    }, 6000);
  }

  /* 被 iframe 嵌入（如天择OS 浏览器）时：把"新窗口/外站链接"交给父窗口在系统内打开，
     并主动上报当前网址供地址栏同步。直接访问天择网时（parent===window）不生效。 */
  if (window.parent !== window) {
    /* nochrome=1 时隐藏页眉页脚，让天择网应用在 OS 内呈现为原生应用观感（首页除外） */
    if (new URLSearchParams(location.search).get('nochrome') === '1') {
      var hideChrome = function () {
        var topbar = document.querySelector('.topbar');
        var footer = document.querySelector('.footer');
        if (topbar) topbar.style.display = 'none';
        if (footer) footer.style.display = 'none';
        document.body.classList.add('nochrome');
        var main = document.querySelector('main');
        if (main) main.style.paddingTop = '0';
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hideChrome);
      else hideChrome();
    }
    var TZ_OPEN = "tz_browser_open";
    var TZ_URL = "tz_browser_url";
    function tzPostUrl() {
      try { window.parent.postMessage({ type: TZ_URL, url: location.href, title: document.title }, "*"); } catch (e) {}
    }
    // 捕获阶段拦截，确保先于默认跳转
    document.addEventListener("click", function (event) {
      var a = event.target.closest && event.target.closest("a");
      if (!a || !a.href || a.hasAttribute("download")) return;
      var tgt = a.target;
      var isExternal = false;
      try { isExternal = new URL(a.href, location.href).origin !== location.origin; } catch (e) {}
      if (tgt === "_blank" || tgt === "_new" || tgt === "_top" || tgt === "_parent" || isExternal) {
        event.preventDefault();
        try { window.parent.postMessage({ type: TZ_OPEN, url: a.href }, "*"); } catch (e) {}
      }
    }, true);
    // 上报当前网址：覆盖多页跳转与单页路由（pushState/replaceState/popstate/hashchange）
    tzPostUrl();
    window.addEventListener("load", tzPostUrl);
    window.addEventListener("popstate", tzPostUrl);
    window.addEventListener("hashchange", tzPostUrl);
    ["pushState", "replaceState"].forEach(function (m) {
      var orig = history[m];
      history[m] = function () {
        var ret = orig.apply(this, arguments);
        setTimeout(tzPostUrl, 0);
        return ret;
      };
    });
  }
})();
