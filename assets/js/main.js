/* ============================================================
   天择网 · 公共交互层 v3
   导航、滚动揭示、可访问性与轻量动效
   ============================================================ */
(function () {
  "use strict";

  /* ============================================================
     TZAI · 全站统一 AI 配置助手
     天择网内任何需要 AI 的页面一律通过 TZAI.config() 取配置：
     天择OS 内（同源 iframe）自动使用 OS 通用配置，OS 未配置时返回 null；
     独立访问（不在 OS 内）返回 null，由页面自身决定是否提供本地配置入口。
     ============================================================ */
  window.TZAI = {
    // 是否在天择OS内运行（被 iframe 嵌入且能读到 OS 状态）
    inOS: function () {
      try { return window.parent !== window && !!localStorage.getItem("tzos_state_v1"); }
      catch (e) { return false; }
    },
    // 读取天择OS通用 AI 配置（localStorage 同源共享）；未配置或不完整返回 null
    osConfig: function () {
      try {
        var s = JSON.parse(localStorage.getItem("tzos_state_v1") || "{}");
        var c = s.aiConfig;
        if (c && c.url && c.key && c.model) return { url: c.url, key: c.key, model: c.model, maxTokens: c.maxTokens || 0 };
      } catch (e) {}
      return null;
    },
    // 统一入口：OS 内 → OS 配置；OS 外 → null（页面可用自有配置兜底）
    config: function () {
      if (this.inOS()) return this.osConfig();
      return null;
    }
  };

  /* ============================================================
     配色皮肤（v3.5）
     天择网：冷 / 中 / 暖三色【全部免费】，左下角 🎨 随时切换，
       选择存于本站专用键 tz_site_palette，全站页面加载时自动应用。
     天择OS：配色独立（tzos_state_v1.palette），冷色默认解锁，
       中/暖色用 OS 积分兑换——两边互不干扰。
     ============================================================ */
  var TZPAL = {
    KEY: "tz_site_palette",
    SKINS: {
      cold: { name: "冷色", css: ["#7c3aed", "#3b82f6", "#10b981"] },
      mid: { name: "标准", css: ["#3b82f6", "#10b981", "#eab308"] },
      warm: { name: "暖色", css: ["#10b981", "#eab308", "#f97316"] }
    },
    current: function () {
      try {
        var p = localStorage.getItem(this.KEY);
        return (p === "mid" || p === "warm") ? p : "cold";
      } catch (e) { return "cold"; }
    },
    apply: function () {
      var p = this.current();
      if (p === "cold") document.documentElement.removeAttribute("data-palette");
      else document.documentElement.setAttribute("data-palette", p);
      return p;
    },
    select: function (p) {
      if (!this.SKINS[p]) return false;
      try { localStorage.setItem(this.KEY, p); } catch (e) { return false; }
      this.apply();
      return true;
    }
  };
  TZPAL.apply();
  // 左下角配色切换浮钮（全站注入，无需改动各页面；三色全部免费）
  (function initPaletteSwitcher() {
    function build() {
      if (document.querySelector(".tzpal-btn")) return;
      var btn = document.createElement("button");
      btn.className = "tzpal-btn";
      btn.type = "button";
      btn.title = "界面配色（冷 / 中 / 暖，全部免费）";
      btn.textContent = "🎨";
      var panel = document.createElement("div");
      panel.className = "tzpal-panel";
      function renderPanel() {
        var cur = TZPAL.apply();
        panel.innerHTML = "";
        Object.keys(TZPAL.SKINS).forEach(function (id) {
          var s = TZPAL.SKINS[id];
          var o = document.createElement("button");
          o.type = "button";
          o.className = "tzpal-opt" + (cur === id ? " active" : "");
          o.innerHTML = '<span class="tzpal-dots">' + s.css.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join("") + "</span>" +
            "<span>" + s.name + "</span>" +
            '<span class="tzpal-cost">' + (cur === id ? "使用中" : "") + "</span>";
          o.onclick = function () {
            TZPAL.select(id);
            renderPanel();
          };
          panel.appendChild(o);
        });
      }
      btn.onclick = function (e) {
        e.stopPropagation();
        renderPanel();
        panel.classList.toggle("open");
      };
      document.addEventListener("click", function (e) {
        if (!panel.contains(e.target) && e.target !== btn) panel.classList.remove("open");
      });
      document.body.appendChild(btn);
      document.body.appendChild(panel);
    }
    if (document.body) build();
    else document.addEventListener("DOMContentLoaded", build);
  })();

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var mobileNav = window.matchMedia("(max-width: 680px)");
  var topbar = document.querySelector(".topbar");
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".nav");

  document.documentElement.classList.add("js");

  var bgMesh = document.querySelector(".bg-mesh");
  var scrollTicking = false;
  function updateScrollEffects() {
    var scrollY = window.scrollY;
    if (topbar) topbar.classList.toggle("scrolled", scrollY > 8);
    if (bgMesh && !reduceMotion.matches) {
      bgMesh.style.setProperty("--mesh-offset", scrollY * 0.035 + "px");
    }
    scrollTicking = false;
  }
  function onScroll() {
    if (!scrollTicking) {
      window.requestAnimationFrame(updateScrollEffects);
      scrollTicking = true;
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  updateScrollEffects();

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

    nav.addEventListener("click", function (event) {
      if (event.target.closest && event.target.closest("a")) setNavState(false);
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

    var bannerTimer = null;
    function stopBannerRotation() {
      if (bannerTimer !== null) {
        window.clearTimeout(bannerTimer);
        bannerTimer = null;
      }
    }
    function scheduleBannerRotation() {
      stopBannerRotation();
      if (document.hidden || reduceMotion.matches) return;
      bannerTimer = window.setTimeout(function rotateBanner() {
        banners[bannerIndex].hidden = true;
        bannerIndex = (bannerIndex + 1) % banners.length;
        banners[bannerIndex].hidden = false;
        scheduleBannerRotation();
      }, 6000);
    }
    document.addEventListener("visibilitychange", scheduleBannerRotation);
    if (reduceMotion.addEventListener) reduceMotion.addEventListener("change", scheduleBannerRotation);
    else reduceMotion.addListener(scheduleBannerRotation);
    scheduleBannerRotation();
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
      // <base target="_blank"> 场景：a.target 为空但实际按 _blank 打开
      if (!tgt) { try { var b = document.querySelector("base[target]"); if (b) tgt = b.getAttribute("target"); } catch (e) {} }
      var isExternal = false;
      try { isExternal = new URL(a.href, location.href).origin !== location.origin; } catch (e) {}
      if (tgt === "_blank" || tgt === "_new" || tgt === "_top" || tgt === "_parent" || isExternal) {
        event.preventDefault();
        try { window.parent.postMessage({ type: TZ_OPEN, url: a.href }, "*"); } catch (e) {}
      }
    }, true);
    // window.open 在 OS 沙箱 iframe 内会被静默拦截（无 allow-popups）→ 改为桥接到 OS 新标签页，
    // 修复"点按钮啥都不干"的问题
    var _origOpen = window.open;
    window.open = function (url, target, features) {
      if (url && target !== "_self") {
        try { window.parent.postMessage({ type: TZ_OPEN, url: new URL(url, location.href).href }, "*"); } catch (e) {}
        return null;
      }
      if (url) { try { location.href = new URL(url, location.href).href; } catch (e) {} }
      return null;
    };
    // 点击 iframe 内容也算点击了系统/应用：转发给 OS 用于聚焦所属窗口
    document.addEventListener("pointerdown", function () {
      try { window.parent.postMessage({ type: "tz_iframe_focus" }, "*"); } catch (e) {}
    }, true);
    // Ctrl+Q 全屏快捷键：iframe 内按键到不了 OS 顶层，桥接转发
    document.addEventListener("keydown", function (e) {
      if (e.ctrlKey && (e.key === "q" || e.key === "Q")) {
        e.preventDefault();
        try { window.parent.postMessage({ type: "tz_hotkey", key: "ctrl+q" }, "*"); } catch (e) {}
      }
      // v3.0 Ctrl+1 悬浮窗快捷键
      if (e.ctrlKey && (e.key === "1" || e.key === "!")) {
        e.preventDefault();
        try { window.parent.postMessage({ type: "tz_hotkey", key: "ctrl+1" }, "*"); } catch (e) {}
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
