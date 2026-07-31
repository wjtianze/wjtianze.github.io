/* ============================================================
   天择网 · 公共交互层 v4
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
     TZUI v4 generated icon atlas
     Only explicit interface containers are upgraded. Body copy,
     user data and embedded lesson payloads are never scanned.
     ============================================================ */
  var TZ_ICON_COORDS = {
    home: [0, 0], newspaper: [1, 0], pen: [2, 0], unlock: [3, 0],
    ai: [4, 0], shield: [5, 0], gamepad: [6, 0], book: [7, 0],
    monitor: [0, 1], user: [1, 1], palette: [2, 1], menu: [3, 1],
    key: [4, 1], chat: [5, 1], cart: [6, 1], trophy: [7, 1],
    settings: [0, 2], info: [1, 2], folder: [2, 2], globe: [3, 2],
    bulb: [4, 2], tree: [5, 2], terminal: [6, 2], clock: [7, 2],
    document: [0, 3], notes: [1, 3], calendar: [2, 3], burst: [3, 3],
    swords: [4, 3], windows: [5, 3], laptop: [6, 3], android: [7, 3],
    search: [0, 4], close: [1, 4], power: [2, 4], network: [3, 4],
    volume: [4, 4], battery: [5, 4], moon: [6, 4], pin: [7, 4],
    refresh: [0, 5], left: [1, 5], right: [2, 5], download: [3, 5],
    upload: [4, 5], camera: [5, 5], paperclip: [6, 5], stop: [7, 5],
    play: [0, 6], pause: [1, 6], trash: [2, 6], save: [3, 6],
    edit: [4, 6], copy: [5, 6], check: [6, 6], warning: [7, 6],
    rocket: [0, 7], star: [1, 7], heart: [2, 7], lightning: [3, 7],
    sparkle: [4, 7], file: [5, 7], cursor: [6, 7], crystal: [7, 7]
  };

  var TZ_EMOJI_ICONS = {};
  [
    ["\u2302", "home"], ["\uD83C\uDFE0", "home"], ["\uD83C\uDFE1", "home"],
    ["\uD83D\uDCF0", "newspaper"], ["\uD83D\uDCF1", "newspaper"],
    ["\u270D", "pen"], ["\uD83D\uDD8A", "pen"],
    ["\uD83D\uDD13", "unlock"], ["\uD83D\uDD12", "key"],
    ["\uD83E\uDD16", "ai"], ["\uD83E\uDDE0", "ai"],
    ["\uD83D\uDEE1", "shield"], ["\uD83C\uDFF0", "shield"],
    ["\uD83C\uDFAE", "gamepad"], ["\uD83E\uDDE9", "gamepad"],
    ["\uD83D\uDCD6", "book"], ["\uD83D\uDCDA", "book"], ["\uD83C\uDF93", "book"],
    ["\uD83D\uDC51", "trophy"], ["\uD83D\uDC3E", "heart"],
    ["\uD83D\uDDA5", "monitor"], ["\uD83D\uDCBB", "laptop"],
    ["\uD83D\uDC64", "user"], ["\uD83C\uDFA8", "palette"],
    ["\u2630", "menu"], ["\uD83D\uDD11", "key"],
    ["\uD83D\uDCAC", "chat"], ["\uD83D\uDED2", "cart"], ["\uD83C\uDFC6", "trophy"],
    ["\u2699", "settings"], ["\uD83D\uDEE0", "settings"],
    ["\u2139", "info"], ["\uD83D\uDCCA", "info"], ["\uD83D\uDD22", "info"],
    ["\uD83D\uDCC1", "folder"], ["\uD83D\uDCC2", "folder"], ["\uD83D\uDDC2", "folder"],
    ["\uD83C\uDF10", "globe"], ["\uD83C\uDF0D", "globe"], ["\uD83C\uDDE8\uD83C\uDDF3", "globe"],
    ["\uD83D\uDCA1", "bulb"], ["\uD83E\uDDEA", "bulb"],
    ["\uD83C\uDF33", "tree"], ["\uD83C\uDF32", "tree"],
    ["\uD83E\uDEA4", "warning"], ["\uD83E\uDDF1", "shield"], ["\uD83E\uDDF0", "settings"],
    ["\u2328", "terminal"], ["\uD83D\uDC0D", "terminal"],
    ["\u23F0", "clock"], ["\uD83D\uDD52", "clock"],
    ["\uD83D\uDCC4", "document"], ["\uD83D\uDCC3", "document"],
    ["\uD83D\uDCDD", "notes"], ["\uD83D\uDCD3", "notes"],
    ["\uD83D\uDCC5", "calendar"], ["\uD83D\uDDD3", "calendar"],
    ["\uD83D\uDCA5", "burst"], ["\uD83D\uDCA3", "burst"],
    ["\u2694", "swords"], ["\uD83E\uDE9F", "windows"],
    ["\uD83D\uDD0D", "search"], ["\uD83D\uDD0E", "search"],
    ["\u274C", "close"], ["\u2715", "close"], ["\u00D7", "close"],
    ["\u23FB", "power"], ["\uD83D\uDCF6", "network"],
    ["\uD83D\uDD0A", "volume"], ["\uD83D\uDD07", "volume"],
    ["\uD83D\uDD0B", "battery"], ["\uD83C\uDF19", "moon"], ["\uD83D\uDCCC", "pin"],
    ["\uD83D\uDD04", "refresh"], ["\u21BB", "refresh"],
    ["\u2190", "left"], ["\u2192", "right"],
    ["\u2B07", "download"], ["\uD83D\uDCE5", "download"],
    ["\u2B06", "upload"], ["\uD83D\uDCE4", "upload"],
    ["\uD83D\uDCF7", "camera"], ["\uD83D\uDCCE", "paperclip"],
    ["\u23F9", "stop"], ["\u25B6", "play"], ["\u23F8", "pause"],
    ["\uD83D\uDDD1", "trash"], ["\uD83D\uDCBE", "save"],
    ["\u270F", "edit"], ["\uD83D\uDCCB", "copy"],
    ["\u2713", "check"], ["\u2705", "check"], ["\u26A0", "warning"],
    ["\uD83D\uDE80", "rocket"], ["\u2B50", "star"],
    ["\u2764", "heart"], ["\u26A1", "lightning"],
    ["\uD83D\uDC80", "warning"],
    ["\u2728", "sparkle"], ["\uD83D\uDCE6", "file"],
    ["\uD83D\uDDB1", "cursor"], ["\uD83D\uDC8E", "crystal"]
  ].forEach(function (entry) {
    TZ_EMOJI_ICONS[entry[0].replace(/\uFE0F/g, "")] = entry[1];
  });
  var TZ_EMOJI_TOKENS = Object.keys(TZ_EMOJI_ICONS).sort(function (a, b) {
    return b.length - a.length;
  });
  var TZ_FALLBACK_EMOJI = null;
  try {
    TZ_FALLBACK_EMOJI = new RegExp("\\p{Extended_Pictographic}(?:\\uFE0F|\\u200D\\p{Extended_Pictographic})*", "u");
  } catch (e) {}

  var TZ_UI_ICON_SELECTOR = [
    "[data-ui-icon]",
    ".nav-toggle", ".tzpal-btn",
    ".z-icon", ".f-icon", ".sz-icon",
    ".dc-emoji", ".vc-emoji", ".dm-emoji", ".de-icon", ".dl-icon", ".oc-icon",
    ".e-icon", ".es-icon", ".ph-icon", ".orbit-core",
    ".gpa-dialog-icon", ".gpa-avatar",
    ".btn", ".btn > span", ".tts-btn", ".modal-close", ".nav-item",
    ".vi-btn", ".wi-actions button", ".gpa-btn",
    ".dq-cat", ".dq-close", ".dq-back",
    ".vp-tab", ".vp-pending-head > span",
    ".v-world-title", ".banner .tag", ".sk-badge", ".ai-badge", ".coc-badge",
    ".article-meta > span", ".z-go", ".game-play-cta", ".orbit-card span",
    ".coc-nav a > span:first-child",
    ".coc-tool [style*=\"font-size:30px\"]", ".coc-tool [style*=\"font-size:40px\"]"
  ].join(",");

  function makeTzIcon(key) {
    var safeKey = TZ_ICON_COORDS[key] ? key : "sparkle";
    var icon = document.createElement("span");
    icon.className = "tz-icon";
    icon.setAttribute("data-icon", safeKey);
    icon.setAttribute("aria-hidden", "true");
    return icon;
  }

  function setTzIcon(element, key) {
    if (!element) return null;
    var oldIcon = element.querySelector(":scope > .tz-icon");
    if (oldIcon) {
      oldIcon.setAttribute("data-icon", TZ_ICON_COORDS[key] ? key : "sparkle");
      return oldIcon;
    }
    var icon = makeTzIcon(key);
    element.insertBefore(icon, element.firstChild);
    element.classList.add("tz-iconized");
    return icon;
  }

  function findIconInText(value) {
    var source = String(value || "");
    var best = null;
    for (var i = 0; i < TZ_EMOJI_TOKENS.length; i += 1) {
      var token = TZ_EMOJI_TOKENS[i];
      var index = source.indexOf(token);
      if (index !== -1 && (!best || index < best.index || (index === best.index && token.length > best.token.length))) {
        best = { index: index, token: token, key: TZ_EMOJI_ICONS[token] };
      }
    }
    var fallback = TZ_FALLBACK_EMOJI ? TZ_FALLBACK_EMOJI.exec(source) : null;
    if (fallback && (!best || fallback.index < best.index)) {
      best = { index: fallback.index, token: fallback[0], key: "sparkle" };
    }
    if (!best) return null;
    var consumed = best.token.length;
    if (source.charAt(best.index + consumed) === "\uFE0F") consumed += 1;
    return {
      key: best.key,
      before: source.slice(0, best.index),
      rest: source.slice(best.index + consumed)
    };
  }

  function upgradeTzIconElement(element) {
    if (!element || element.closest(".article-body, .tutorial-body")) return;
    var requested = element.getAttribute("data-ui-icon");
    if (requested) {
      setTzIcon(element, requested);
      return;
    }
    if (element.querySelector(":scope > .tz-icon")) return;
    var nodes = Array.prototype.slice.call(element.childNodes);
    for (var i = 0; i < nodes.length; i += 1) {
      if (nodes[i].nodeType !== 3) continue;
      var match = findIconInText(nodes[i].nodeValue);
      if (!match) continue;
      var fragment = document.createDocumentFragment();
      var pending = nodes[i].nodeValue;
      while (match) {
        if (match.before) fragment.appendChild(document.createTextNode(match.before));
        fragment.appendChild(makeTzIcon(match.key));
        pending = match.rest;
        match = findIconInText(pending);
      }
      if (pending) fragment.appendChild(document.createTextNode(pending));
      element.replaceChild(fragment, nodes[i]);
      element.classList.add("tz-iconized");
    }
  }

  function upgradeTzUiIcons(root) {
    if (!root || /\/ai\/skill\/tlh\/relativity-demo\.html$/i.test(location.pathname)) return;
    if (root.nodeType === 1 && root.matches && root.matches(TZ_UI_ICON_SELECTOR)) {
      upgradeTzIconElement(root);
    }
    if (!root.querySelectorAll) return;
    root.querySelectorAll(TZ_UI_ICON_SELECTOR).forEach(upgradeTzIconElement);
  }

  window.TZUI = {
    icons: TZ_ICON_COORDS,
    createIcon: makeTzIcon,
    setIcon: setTzIcon,
    upgradeIcons: upgradeTzUiIcons
  };

  /* ============================================================
     Tianze Web 4.0 · Evolution Shell
     The shared rail, status line and command palette are generated
     once here so all existing static pages inherit the same shell.
     ============================================================ */
  var TZ_SITE_VERSION = "4.0";

  function getTzSiteRoot() {
    var scripts = document.querySelectorAll('script[src*="assets/js/main.js"]');
    var source = scripts.length ? scripts[scripts.length - 1].src : "";
    try { return new URL("../../", source || location.href); }
    catch (e) { return new URL("./", location.href); }
  }

  function getTzZone(rootUrl, items) {
    var rootPath = rootUrl.pathname.replace(/\/?$/, "/");
    var currentPath = location.pathname;
    var relative = currentPath.indexOf(rootPath) === 0 ? currentPath.slice(rootPath.length) : currentPath.replace(/^\/+/, "");
    var first = relative.split("/")[0].toLowerCase();
    if (!first || first === "index.html" || first === "404.html") return items[0];
    for (var i = 1; i < items.length; i += 1) {
      if (items[i].id === first) return items[i];
    }
    return items[0];
  }

  function appendTzIcon(parent, key) {
    var icon = makeTzIcon(key);
    parent.appendChild(icon);
    return icon;
  }

  function initTzEvolutionShell() {
    if (!document.body || /\/ai\/skill\/tlh\/relativity-demo\.html$/i.test(location.pathname)) return;
    try {
      if (window.parent !== window && new URLSearchParams(location.search).get("nochrome") === "1") {
        document.body.classList.add("nochrome");
        return;
      }
    } catch (e) {}

    var rootUrl = getTzSiteRoot();
    var items = [
      { id: "home", label: "首页", icon: "home", href: "index.html" },
      { id: "news", label: "新闻", icon: "newspaper", href: "news/index.html" },
      { id: "blog", label: "博客", icon: "pen", href: "blog/index.html" },
      { id: "open", label: "开源", icon: "unlock", href: "open/index.html" },
      { id: "ai", label: "AI", icon: "ai", href: "ai/index.html" },
      { id: "coc", label: "COC", icon: "shield", href: "coc/index.html" },
      { id: "game", label: "游戏", icon: "gamepad", href: "game/index.html" },
      { id: "english", label: "英语", icon: "book", href: "english/index.html" },
      { id: "os", label: "天择OS", icon: "monitor", href: "os/index.html" },
      { id: "contact", label: "联系", icon: "user", href: "contact/index.html" }
    ];
    var active = getTzZone(rootUrl, items);

    document.body.classList.add("tz-site-shell");
    document.body.setAttribute("data-tz-zone", active.id);

    if (!document.querySelector(".tz-site-top-guard")) {
      var topGuard = document.createElement("div");
      topGuard.className = "tz-site-top-guard";
      topGuard.setAttribute("aria-hidden", "true");
      document.body.insertBefore(topGuard, document.body.firstChild);
    }

    if (!document.querySelector(".tz-site-rail")) {
      var rail = document.createElement("aside");
      rail.className = "tz-site-rail";
      rail.setAttribute("aria-label", "天择网板块导航");

      var railHead = document.createElement("a");
      railHead.className = "tz-site-rail__head";
      railHead.href = new URL("index.html", rootUrl).href;
      railHead.setAttribute("aria-label", "天择网 " + TZ_SITE_VERSION + " 首页");
      appendTzIcon(railHead, "crystal");
      var railVersion = document.createElement("span");
      railVersion.textContent = TZ_SITE_VERSION;
      railHead.appendChild(railVersion);
      rail.appendChild(railHead);

      var railNav = document.createElement("nav");
      items.forEach(function (item) {
        var link = document.createElement("a");
        link.className = "tz-site-rail__item" + (item.id === active.id ? " active" : "");
        link.href = new URL(item.href, rootUrl).href;
        link.title = item.label;
        link.setAttribute("aria-label", item.label);
        if (item.id === active.id) link.setAttribute("aria-current", "page");
        appendTzIcon(link, item.icon);
        var label = document.createElement("span");
        label.textContent = item.label;
        link.appendChild(label);
        railNav.appendChild(link);
      });
      rail.appendChild(railNav);
      document.body.insertBefore(rail, document.body.firstChild);
    }

    var shellRail = document.querySelector(".tz-site-rail");
    var railMode = window.matchMedia("(max-width: 1100px)");
    var railScrollFrame = 0;
    function revealActiveRailItem() {
      if (!shellRail || !railMode.matches) return;
      var shellRailNav = shellRail.querySelector("nav");
      var activeRailItem = shellRail.querySelector(".tz-site-rail__item.active");
      if (!shellRailNav || !activeRailItem) return;
      var navRect = shellRailNav.getBoundingClientRect();
      var itemRect = activeRailItem.getBoundingClientRect();
      if (itemRect.left >= navRect.left + 4 && itemRect.right <= navRect.right - 4) return;
      var nextLeft = shellRailNav.scrollLeft + itemRect.left - navRect.left -
        (navRect.width - itemRect.width) / 2;
      shellRailNav.scrollTo({ left: Math.max(0, nextLeft), behavior: "auto" });
    }
    function syncRailAccess() {
      if (!shellRail) return;
      shellRail.querySelectorAll("a").forEach(function (link) {
        if (railMode.matches) link.removeAttribute("tabindex");
        else link.tabIndex = -1;
      });
      window.requestAnimationFrame(revealActiveRailItem);
    }
    function scheduleRailReveal() {
      if (railScrollFrame) return;
      railScrollFrame = window.requestAnimationFrame(function () {
        railScrollFrame = 0;
        revealActiveRailItem();
      });
    }
    if (railMode.addEventListener) railMode.addEventListener("change", syncRailAccess);
    else railMode.addListener(syncRailAccess);
    window.addEventListener("resize", scheduleRailReveal, { passive: true });
    syncRailAccess();

    var mainContent = document.querySelector("main, [role='main']");
    if (mainContent && !document.querySelector(".tz-skip-link, .wp-skip")) {
      if (!mainContent.id) mainContent.id = "tz-main-content";
      mainContent.setAttribute("tabindex", "-1");
      var skipLink = document.createElement("a");
      skipLink.className = "tz-skip-link";
      skipLink.href = "#" + mainContent.id;
      skipLink.textContent = "跳到主要内容";
      skipLink.addEventListener("click", function (event) {
        event.preventDefault();
        mainContent.focus({ preventScroll: true });
        mainContent.scrollIntoView({ block: "start", behavior: "auto" });
      });
      document.body.insertBefore(skipLink, document.body.firstChild);
    }

    var topbar = document.querySelector(".topbar");
    if (topbar) {
      topbar.classList.add("tz-evolution-bar");
      var topbarInner = topbar.querySelector(".topbar-inner") || topbar;
      var sharedNav = topbar.querySelector(".nav");
      if (sharedNav) {
        sharedNav.textContent = "";
        sharedNav.setAttribute("aria-label", "主导航");
        items.forEach(function (item) {
          var navLink = document.createElement("a");
          navLink.href = new URL(item.href, rootUrl).href;
          if (item.id === active.id) {
            navLink.className = "active";
            navLink.setAttribute("aria-current", "page");
          }
          var navLabel = document.createElement("span");
          navLabel.textContent = item.label;
          navLink.appendChild(navLabel);
          sharedNav.appendChild(navLink);
        });
      }
      var topbarStatus = topbar.querySelector(".tz-topbar-status");
      if (!topbarStatus) {
        topbarStatus = document.createElement("div");
        topbarStatus.className = "tz-topbar-status";
        topbarStatus.setAttribute("aria-label", "当前板块");
        var live = document.createElement("span");
        live.className = "tz-live-dot";
        live.setAttribute("aria-hidden", "true");
        topbarStatus.appendChild(live);
        var statusText = document.createElement("span");
        statusText.textContent = active.label + " · 在线";
        topbarStatus.appendChild(statusText);
        var statusVersion = document.createElement("span");
        statusVersion.textContent = TZ_SITE_VERSION;
        topbarStatus.appendChild(statusVersion);
        var toggle = topbar.querySelector(".nav-toggle");
        topbarInner.insertBefore(topbarStatus, toggle || topbar.querySelector(".nav"));
      }

      if (!topbar.querySelector(".tz-command-trigger")) {
        var commandTrigger = document.createElement("button");
        commandTrigger.className = "tz-command-trigger";
        commandTrigger.type = "button";
        commandTrigger.setAttribute("aria-label", "搜索站点板块");
        commandTrigger.setAttribute("aria-haspopup", "dialog");
        appendTzIcon(commandTrigger, "search");
        var triggerText = document.createElement("span");
        triggerText.textContent = "搜索";
        commandTrigger.appendChild(triggerText);
        var shortcut = document.createElement("kbd");
        shortcut.textContent = "Ctrl K";
        commandTrigger.appendChild(shortcut);
        var navToggle = topbar.querySelector(".nav-toggle");
        topbarInner.insertBefore(commandTrigger, navToggle || topbar.querySelector(".nav"));
      }

      topbar.querySelectorAll(".nav a").forEach(function (link) {
        var linkZone = getTzZone(rootUrl, items);
        try {
          var linkUrl = new URL(link.href, location.href);
          var rootPath = rootUrl.pathname.replace(/\/?$/, "/");
          var relative = linkUrl.pathname.indexOf(rootPath) === 0 ? linkUrl.pathname.slice(rootPath.length) : "";
          var first = relative.split("/")[0].toLowerCase();
          linkZone = (!first || first === "index.html") ? items[0] : items.filter(function (item) { return item.id === first; })[0];
        } catch (e) {}
        var isActive = linkZone && linkZone.id === active.id;
        link.classList.toggle("active", Boolean(isActive));
        if (isActive) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
    }

    if (!document.querySelector(".tz-site-statusbar")) {
      var statusbar = document.createElement("div");
      statusbar.className = "tz-site-statusbar";
      statusbar.setAttribute("role", "region");
      statusbar.setAttribute("aria-label", "站点运行状态");
      statusbar.setAttribute("aria-live", "off");

      var statusLeft = document.createElement("span");
      statusLeft.className = "tz-site-statusbar__left";
      var statusDot = document.createElement("i");
      statusLeft.appendChild(statusDot);
      var statusLabel = document.createElement("b");
      statusLabel.textContent = "EVOLUTION NETWORK";
      statusLeft.appendChild(statusLabel);
      var zoneLabel = document.createElement("span");
      zoneLabel.textContent = active.label;
      statusLeft.appendChild(zoneLabel);

      var statusCenter = document.createElement("button");
      statusCenter.className = "tz-status-command";
      statusCenter.type = "button";
      appendTzIcon(statusCenter, "search");
      var centerText = document.createElement("span");
      centerText.textContent = "快速导航";
      statusCenter.appendChild(centerText);
      var centerKey = document.createElement("kbd");
      centerKey.textContent = "Ctrl K";
      statusCenter.appendChild(centerKey);

      var statusRight = document.createElement("span");
      statusRight.className = "tz-site-statusbar__right";
      var clockIcon = appendTzIcon(statusRight, "clock");
      clockIcon.setAttribute("aria-hidden", "true");
      var clock = document.createElement("time");
      clock.className = "tz-site-clock";
      statusRight.appendChild(clock);

      statusbar.appendChild(statusLeft);
      statusbar.appendChild(statusCenter);
      statusbar.appendChild(statusRight);
      document.body.appendChild(statusbar);

      function updateClock() {
        var now = new Date();
        clock.dateTime = now.toISOString();
        try {
          clock.textContent = new Intl.DateTimeFormat("zh-CN", {
            month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
          }).format(now);
        } catch (e) {
          clock.textContent = now.toLocaleString();
        }
      }
      updateClock();
      window.setInterval(updateClock, 30000);
    }

    if (!document.querySelector(".tz-command-palette")) {
      var overlay = document.createElement("div");
      overlay.className = "tz-command-palette";
      overlay.hidden = true;

      var dialog = document.createElement("section");
      dialog.className = "tz-command-dialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-label", "快速导航");

      var commandHead = document.createElement("div");
      commandHead.className = "tz-command-head";
      appendTzIcon(commandHead, "search");
      var input = document.createElement("input");
      input.type = "search";
      input.placeholder = "搜索板块或输入入口名称…";
      input.setAttribute("aria-label", "搜索站点板块");
      commandHead.appendChild(input);
      var close = document.createElement("button");
      close.type = "button";
      close.setAttribute("aria-label", "关闭快速导航");
      appendTzIcon(close, "close");
      commandHead.appendChild(close);

      var commandList = document.createElement("div");
      commandList.className = "tz-command-list";
      items.forEach(function (item, index) {
        var command = document.createElement("a");
        command.href = new URL(item.href, rootUrl).href;
        command.setAttribute("data-command-label", item.label.toLowerCase());
        appendTzIcon(command, item.icon);
        var commandName = document.createElement("span");
        commandName.textContent = item.label;
        command.appendChild(commandName);
        var commandIndex = document.createElement("kbd");
        commandIndex.textContent = String(index + 1).padStart(2, "0");
        command.appendChild(commandIndex);
        commandList.appendChild(command);
      });

      var commandFoot = document.createElement("div");
      commandFoot.className = "tz-command-foot";
      commandFoot.textContent = "Enter 打开 · Esc 关闭 · 天择网 " + TZ_SITE_VERSION;

      dialog.appendChild(commandHead);
      dialog.appendChild(commandList);
      dialog.appendChild(commandFoot);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      var lastFocus = null;
      function setCommandOpen(open) {
        if (open) {
          lastFocus = document.activeElement;
          overlay.hidden = false;
          document.body.classList.add("tz-command-open");
          input.value = "";
          commandList.querySelectorAll("a").forEach(function (link) { link.hidden = false; });
          window.requestAnimationFrame(function () { input.focus(); });
        } else {
          overlay.hidden = true;
          document.body.classList.remove("tz-command-open");
          if (lastFocus && lastFocus.focus) lastFocus.focus();
        }
      }

      document.querySelectorAll(".tz-command-trigger, .tz-status-command").forEach(function (button) {
        button.addEventListener("click", function () { setCommandOpen(true); });
      });
      close.addEventListener("click", function () { setCommandOpen(false); });
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) setCommandOpen(false);
      });
      input.addEventListener("input", function () {
        var query = input.value.trim().toLowerCase();
        commandList.querySelectorAll("a").forEach(function (link) {
          link.hidden = Boolean(query && link.getAttribute("data-command-label").indexOf(query) === -1);
        });
      });
      input.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        var firstVisible = Array.prototype.filter.call(commandList.querySelectorAll("a"), function (link) { return !link.hidden; })[0];
        if (firstVisible) location.href = firstVisible.href;
      });
      document.addEventListener("keydown", function (event) {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          setCommandOpen(overlay.hidden);
        } else if (event.key === "Escape" && !overlay.hidden) {
          event.preventDefault();
          setCommandOpen(false);
        } else if (event.key === "Tab" && !overlay.hidden) {
          var focusable = Array.prototype.filter.call(
            dialog.querySelectorAll('input, button, a[href]'),
            function (element) { return !element.hidden && element.offsetParent !== null; }
          );
          if (!focusable.length) return;
          var first = focusable[0];
          var last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      });
    }
  }

  /* ============================================================
     Tianze Web 4.0 · shared internal-page primitives
     Existing static pages keep their content and URLs. This pass
     promotes their internal hierarchy into four shared structures:
     page hero, workspace cards, workspace lists and readers.
     ============================================================ */
  var TZ_PAGE_ZONE_META = {
    home: { label: "天择网", code: "HOME", icon: "home" },
    news: { label: "新闻中心", code: "NEWS", icon: "newspaper" },
    blog: { label: "博客档案", code: "BLOG", icon: "pen" },
    open: { label: "开放资源", code: "OPEN", icon: "unlock" },
    ai: { label: "AI 工作区", code: "AI", icon: "ai" },
    contact: { label: "联络节点", code: "CONTACT", icon: "user" },
    english: { label: "英语工作区", code: "ENGLISH", icon: "book" },
    game: { label: "游戏实验室", code: "GAME", icon: "gamepad" },
    os: { label: "天择OS", code: "OS", icon: "monitor" }
  };

  function getTzPageZone(rootUrl) {
    var id = document.body && document.body.getAttribute("data-tz-zone");
    if (id && TZ_PAGE_ZONE_META[id]) return { id: id, meta: TZ_PAGE_ZONE_META[id] };
    var rootPath = (rootUrl || getTzSiteRoot()).pathname.replace(/\/?$/, "/");
    var relative = location.pathname.indexOf(rootPath) === 0 ?
      location.pathname.slice(rootPath.length) :
      location.pathname.replace(/^\/+/, "");
    var first = relative.split("/")[0].toLowerCase();
    if (!TZ_PAGE_ZONE_META[first]) first = "home";
    return { id: first, meta: TZ_PAGE_ZONE_META[first] };
  }

  function makeTzText(tagName, className, value) {
    var element = document.createElement(tagName);
    if (className) element.className = className;
    if (value !== undefined) element.textContent = value;
    return element;
  }

  function ensureTzPageHero(hero, zone) {
    if (!hero) return;
    hero.classList.add("tz-page-hero");
    hero.setAttribute("data-tz-primitive", "page-hero");
    hero.setAttribute("data-tz-zone-code", zone.meta.code);

    var title = hero.querySelector("h1");
    if (title) {
      if (!title.id) title.id = "tz-page-title";
      hero.setAttribute("aria-labelledby", title.id);
    }

    if (hero.querySelector(":scope > .tz-page-hero__signal")) return;
    var nativeSignal = hero.querySelector(
      ".ai-badge, .sk-badge, .coc-kicker, .game-zone-kicker, " +
      ".english-kicker, .hero-eyebrow, .crumb"
    );
    if (nativeSignal) {
      hero.classList.add("tz-page-hero--native-signal");
      nativeSignal.classList.add("tz-page-hero__native-signal");
      return;
    }
    var signal = makeTzText("div", "tz-page-hero__signal");
    signal.setAttribute("aria-hidden", "true");
    appendTzIcon(signal, zone.meta.icon);
    var copy = makeTzText("span", "tz-page-hero__signal-copy");
    copy.appendChild(makeTzText("b", "", zone.meta.label));
    copy.appendChild(makeTzText("small", "", "EVOLUTION / " + zone.meta.code));
    signal.appendChild(copy);
    signal.appendChild(makeTzText("i", "", TZ_SITE_VERSION));
    hero.insertBefore(signal, hero.firstChild);
  }

  function upgradeTzWorkspaceList(list, zone) {
    if (!list || list.getAttribute("data-tz-list-ready") === "true") return;
    var items = Array.prototype.slice.call(list.querySelectorAll(":scope > .news-row"));
    list.classList.add("tz-workspace-list");
    list.setAttribute("data-tz-list-ready", "true");
    list.setAttribute("data-tz-primitive", "workspace-list");
    list.setAttribute("aria-label", zone.meta.label + "条目");

    var head = makeTzText("div", "tz-workspace-list__head");
    var headLead = makeTzText("span", "tz-workspace-list__lead");
    appendTzIcon(headLead, zone.meta.icon);
    var headCopy = makeTzText("span", "tz-workspace-list__copy");
    headCopy.appendChild(makeTzText("small", "", "INDEX STREAM / " + zone.meta.code));
    headCopy.appendChild(makeTzText("b", "", zone.meta.label + "索引"));
    headLead.appendChild(headCopy);
    head.appendChild(headLead);
    head.appendChild(makeTzText("span", "tz-workspace-list__count", String(items.length).padStart(2, "0") + " ENTRIES"));
    list.insertBefore(head, list.firstChild);

    items.forEach(function (item, index) {
      item.classList.add("tz-workspace-list__item", "tz-workspace-card");
      item.setAttribute("data-tz-entry", String(index + 1).padStart(2, "0"));
      if (!item.querySelector(":scope > .tz-workspace-list__marker")) {
        var marker = makeTzText("span", "tz-workspace-list__marker");
        marker.setAttribute("aria-hidden", "true");
        var body = item.querySelector(":scope > .n-body");
        item.insertBefore(marker, body || item.firstChild);
      }
      var arrow = item.querySelector(".n-arrow");
      if (arrow) {
        arrow.textContent = "";
        appendTzIcon(arrow, "right");
        arrow.setAttribute("aria-hidden", "true");
      }
    });
  }

  function upgradeTzReader(reader, zone, rootUrl) {
    if (!reader || reader.classList.contains("tz-reader")) return;
    var isTutorial = reader.classList.contains("tutorial");
    var body = reader.querySelector(isTutorial ? ".tutorial-body" : ".article-body");
    if (!body) return;

    reader.classList.add("tz-reader");
    reader.setAttribute("data-tz-primitive", "reader");
    body.classList.add("tz-reader__body");
    var readerTitle = reader.querySelector("h1");
    if (readerTitle) {
      if (!readerTitle.id) readerTitle.id = "tz-reader-title";
      reader.setAttribute("aria-labelledby", readerTitle.id);
    }

    var consoleBar = makeTzText("div", "tz-reader__console");
    var consoleLead = makeTzText("span", "tz-reader__console-lead");
    appendTzIcon(consoleLead, isTutorial ? "book" : "document");
    var consoleCopy = makeTzText("span", "tz-reader__console-copy");
    consoleCopy.appendChild(makeTzText("small", "", isTutorial ? "GUIDE READER" : "DOCUMENT READER"));
    consoleCopy.appendChild(makeTzText("b", "", zone.meta.label));
    consoleLead.appendChild(consoleCopy);
    consoleBar.appendChild(consoleLead);

    var textLength = (body.textContent || "").replace(/\s+/g, "").length;
    var minutes = Math.max(2, Math.ceil(textLength / 420));
    var consoleMeta = makeTzText("span", "tz-reader__console-meta");
    consoleMeta.appendChild(makeTzText("span", "", "约 " + minutes + " 分钟"));
    consoleMeta.appendChild(makeTzText("span", "", TZ_SITE_VERSION + " READER"));
    consoleBar.appendChild(consoleMeta);
    var progress = makeTzText("span", "tz-reader__progress");
    progress.setAttribute("aria-hidden", "true");
    consoleBar.appendChild(progress);
    reader.insertBefore(consoleBar, reader.firstChild);

    if (isTutorial) {
      var tutorialPageHead = reader.querySelector(":scope > .page-head");
      var tutorialArticleHead = reader.querySelector(":scope > .article-head");
      if (tutorialPageHead || tutorialArticleHead) {
        var masthead = makeTzText("div", "tz-reader__masthead");
        reader.insertBefore(masthead, body);
        if (tutorialPageHead) masthead.appendChild(tutorialPageHead);
        if (tutorialArticleHead) masthead.appendChild(tutorialArticleHead);
      }
    } else {
      var articleHead = reader.querySelector(":scope > .article-head");
      if (articleHead) articleHead.classList.add("tz-reader__masthead");
    }

    var articleFoot = reader.querySelector(":scope > .article-foot");
    if (!articleFoot) {
      articleFoot = makeTzText("div", "article-foot");
      var back = document.createElement("a");
      back.className = "btn btn--ghost";
      back.href = new URL(zone.id === "blog" ? "blog/index.html" : "news/index.html", rootUrl).href;
      appendTzIcon(back, "left");
      back.appendChild(document.createTextNode(zone.id === "blog" ? "返回博客索引" : "返回新闻索引"));
      articleFoot.appendChild(back);
      reader.appendChild(articleFoot);
    }
    articleFoot.classList.add("tz-reader__footer");

    var end = makeTzText("div", "tz-reader__end");
    end.setAttribute("aria-hidden", "true");
    appendTzIcon(end, "check");
    end.appendChild(makeTzText("span", "", "END OF DOCUMENT"));
    reader.insertBefore(end, articleFoot);

    var progressScheduled = false;
    function updateReaderProgress() {
      progressScheduled = false;
      var start = reader.offsetTop;
      var total = Math.max(1, reader.offsetHeight - window.innerHeight);
      var current = Math.min(total, Math.max(0, window.scrollY - start + 120));
      progress.style.setProperty("--tz-reader-progress", (current / total * 100).toFixed(2) + "%");
    }
    window.addEventListener("scroll", function () {
      if (progressScheduled) return;
      progressScheduled = true;
      window.requestAnimationFrame(updateReaderProgress);
    }, { passive: true });
    updateReaderProgress();
  }

  function upgradeTzWorkspaceSections(main, zone) {
    var sections = Array.prototype.slice.call(main.querySelectorAll(":scope > .section"));
    sections.forEach(function (section, sectionIndex) {
      if (section.closest(".words-app, .gpa-game") || section.querySelector(":scope > .news-list")) return;
      section.classList.add("tz-workspace-section");
      section.setAttribute("data-tz-primitive", "workspace-section");
      section.setAttribute("data-tz-section", String(sectionIndex + 1).padStart(2, "0"));

      var heading = section.querySelector(":scope > .section-head, :scope > .tz-prose-card > .section-head");
      if (heading) {
        heading.classList.add("tz-workspace-heading");
        if (!heading.querySelector(".tz-workspace-heading__code")) {
          heading.appendChild(makeTzText("span", "tz-workspace-heading__code", "MODULE " + String(sectionIndex + 1).padStart(2, "0")));
        }
      } else if (!section.querySelector(":scope > .tz-workspace-section__head")) {
        var compactHead = makeTzText("div", "tz-workspace-section__head");
        var compactLead = makeTzText("span", "");
        appendTzIcon(compactLead, zone.meta.icon);
        compactLead.appendChild(document.createTextNode(zone.meta.label));
        compactHead.appendChild(compactLead);
        compactHead.appendChild(makeTzText("small", "", "MODULE " + String(sectionIndex + 1).padStart(2, "0")));
        section.insertBefore(compactHead, section.firstChild);
      }
    });
  }

  function upgradeTzWorkspaceCards(main) {
    var selector = [
      ".card", ".game-feature", ".english-word-stage", ".english-tool-card",
      ".english-step", ".contact-card", ".contact-mini .mini-card", ".os-card",
      ".vocab-code-card", ".vocab-import-card"
    ].join(",");
    var cards = Array.prototype.slice.call(main.querySelectorAll(selector)).filter(function (card) {
      return !card.closest(".tz-reader, .tz-workspace-list, .words-app, .gpa-game");
    });
    cards.forEach(function (card, index) {
      card.classList.add("tz-workspace-card");
      card.setAttribute("data-tz-primitive", "workspace-card");
      card.setAttribute("data-tz-card-index", String(index + 1).padStart(2, "0"));
    });
  }

  function initTzInternalPagePrimitives() {
    if (!document.body || /\/ai\/skill\/tlh\/relativity-demo\.html$/i.test(location.pathname)) return;
    if (document.body.classList.contains("tz-homepage") ||
        document.body.classList.contains("coc-tool") ||
        document.body.classList.contains("gpa-page") ||
        document.body.classList.contains("tzw")) return;
    var main = document.querySelector("main");
    if (!main) return;

    document.body.classList.add("tz-internal-v41");
    var rootUrl = getTzSiteRoot();
    var zone = getTzPageZone(rootUrl);

    main.querySelectorAll("article.article, article.tutorial").forEach(function (reader) {
      upgradeTzReader(reader, zone, rootUrl);
    });

    main.querySelectorAll(".news-list").forEach(function (list) {
      upgradeTzWorkspaceList(list, zone);
    });

    var hero = main.querySelector([
      ":scope > .tz-page-hero", ":scope > .page-head", ":scope > .ai-hero",
      ":scope > .skill-hero", ":scope > .english-hero",
      ":scope > .game-zone-hero", ":scope > .hero"
    ].join(","));
    if (hero) ensureTzPageHero(hero, zone);

    upgradeTzWorkspaceSections(main, zone);
    upgradeTzWorkspaceCards(main);
  }

  function initTzUiV4() {
    upgradeTzUiIcons(document);
    if (!window.MutationObserver || !document.body) return;
    var pendingTargets = new Set();
    var pendingRoots = new Set();
    var flushScheduled = false;

    function flushIconUpgrades() {
      flushScheduled = false;
      pendingTargets.forEach(function (target) {
        if (target.isConnected && target.matches && target.matches(TZ_UI_ICON_SELECTOR)) {
          upgradeTzIconElement(target);
        }
      });
      pendingTargets.clear();
      pendingRoots.forEach(function (root) {
        if (root.isConnected) upgradeTzUiIcons(root);
      });
      pendingRoots.clear();
    }

    function scheduleIconFlush() {
      if (flushScheduled) return;
      flushScheduled = true;
      if (window.requestAnimationFrame) window.requestAnimationFrame(flushIconUpgrades);
      else window.setTimeout(flushIconUpgrades, 0);
    }

    var iconObserver = new MutationObserver(function (records) {
      records.forEach(function (record) {
        if (record.target && record.target.nodeType === 1 && record.target.matches(TZ_UI_ICON_SELECTOR)) {
          pendingTargets.add(record.target);
        }
        record.addedNodes.forEach(function (node) {
          if (node.nodeType === 1) pendingRoots.add(node);
        });
      });
      if (pendingTargets.size || pendingRoots.size) scheduleIconFlush();
    });
    iconObserver.observe(document.body, { childList: true, subtree: true });
  }

  /* ============================================================
     Tianze Web 4.0 / one-third narrative workspace
     Every regular site page presents its title and introduction in
     a stable left rail, with actionable or editorial content on the
     right. Complex applications opt into their own equivalent grid.
     ============================================================ */
  function ensureTzSplitMotionStyles() {
    if (document.querySelector('link[data-tz-split-motion]')) return;
    var scripts = document.querySelectorAll('script[src*="assets/js/main.js"]');
    var source = scripts.length ? scripts[scripts.length - 1].src : "";
    if (!source) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("../css/split-motion.css?v=20260731-v4.13", source).href;
    link.setAttribute("data-tz-split-motion", "true");
    document.head.appendChild(link);
  }

  function setupTzReaderSplit(reader) {
    if (!reader || reader.getAttribute("data-tz-split-ready") === "true") return;
    var body = reader.querySelector(":scope > .tz-reader__body");
    if (!body) return;

    var lead = document.createElement("aside");
    lead.className = "tz-reader-split__lead";
    lead.setAttribute("aria-label", "文章标题与摘要");
    var content = document.createElement("div");
    content.className = "tz-reader-split__content";

    var consoleBar = reader.querySelector(":scope > .tz-reader__console");
    var masthead = reader.querySelector(":scope > .tz-reader__masthead");
    if (consoleBar) lead.appendChild(consoleBar);
    if (masthead) lead.appendChild(masthead);

    reader.insertBefore(lead, reader.firstChild);
    reader.insertBefore(content, lead.nextSibling);
    [
      body,
      reader.querySelector(":scope > .tz-reader__end"),
      reader.querySelector(":scope > .tz-reader__footer")
    ].forEach(function (element) {
      if (element) content.appendChild(element);
    });

    reader.classList.add("tz-reader-split");
    reader.setAttribute("data-tz-split-ready", "true");
  }

  function initTzSplitArchitecture() {
    if (!document.body || /\/ai\/skill\/tlh\/relativity-demo\.html$/i.test(location.pathname)) return;
    var main = document.querySelector("main");
    if (!main) return;

    document.body.classList.add("tz-split-interface");
    main.querySelectorAll(":scope > .tz-reader").forEach(setupTzReaderSplit);

    if (document.body.classList.contains("coc-tool") ||
        document.body.classList.contains("gpa-page") ||
        document.body.classList.contains("tzw")) {
      document.body.classList.add("tz-split-specialized");
      return;
    }

    var children = Array.prototype.slice.call(main.children).filter(function (element) {
      return !/^(SCRIPT|STYLE|TEMPLATE)$/i.test(element.tagName) && !element.hidden;
    });
    var introSelector = [
      ".tz-home-hero", ".tz-page-hero", ".page-head", ".wp-hero",
      ".ai-hero", ".skill-hero", ".english-hero", ".game-zone-hero",
      ".tz-os-landing-hero", ".hero"
    ].join(",");
    var intro = children.filter(function (element) { return element.matches(introSelector); })[0];

    if (intro && intro.classList.contains("tz-home-hero")) {
      var networkPanel = intro.querySelector(":scope > .tz-network-panel");
      if (networkPanel) {
        var networkWorkspace = document.createElement("section");
        networkWorkspace.className = "tz-home-network-workspace wrap";
        networkWorkspace.setAttribute("aria-label", "天择网络态势");
        networkWorkspace.appendChild(networkPanel);
        main.insertBefore(networkWorkspace, intro.nextSibling);
        children = Array.prototype.slice.call(main.children).filter(function (element) {
          return !/^(SCRIPT|STYLE|TEMPLATE)$/i.test(element.tagName) && !element.hidden;
        });
      }
    }
    if (intro && intro.classList.contains("english-hero")) {
      var wordStage = intro.querySelector(":scope > .english-word-stage");
      if (wordStage) {
        var wordWorkspace = document.createElement("section");
        wordWorkspace.className = "tz-hero-content-workspace tz-english-preview-workspace wrap";
        wordWorkspace.setAttribute("aria-label", "词汇训练预览");
        wordWorkspace.appendChild(wordStage);
        main.insertBefore(wordWorkspace, intro.nextSibling);
        children = Array.prototype.slice.call(main.children).filter(function (element) {
          return !/^(SCRIPT|STYLE|TEMPLATE)$/i.test(element.tagName) && !element.hidden;
        });
      }
    }

    if (intro && children.length > 1) {
      main.classList.add("tz-split-main");
      intro.classList.add("tz-split-intro");
      var introIndex = children.indexOf(intro);
      var contentStack = document.createElement("div");
      contentStack.className = "tz-split-stack";
      contentStack.setAttribute("aria-label", "页面内容");
      main.insertBefore(contentStack, intro.nextSibling);
      children.forEach(function (element, index) {
        if (element === intro) return;
        if (index < introIndex && element.matches(".crumb, .breadcrumbs, nav[aria-label*='面包屑']")) {
          element.classList.add("tz-split-context");
        } else {
          element.classList.add("tz-split-content");
          contentStack.appendChild(element);
        }
      });
    } else if (main.classList.contains("err-wrap")) {
      main.classList.add("tz-split-single");
    }
  }

  function initTzHomeSiteTree() {
    var map = document.querySelector(".tz-homepage .tz-network-map");
    if (!map || map.getAttribute("data-site-tree-ready") === "true") return;

    var rootUrl = getTzSiteRoot();
    var indexUrl = new URL("assets/data/site-ai-index.json", rootUrl);
    var topOrder = {
      "/news/": 10,
      "/blog/": 20,
      "/open/": 30,
      "/ai/": 40,
      "/coc/": 50,
      "/game/": 60,
      "/english/": 70,
      "/os/": 80,
      "/contact/": 90
    };
    var fixedLabels = {
      "/": "天择网",
      "/news/": "新闻",
      "/blog/": "博客",
      "/open/": "数据开源",
      "/ai/": "AI 专区",
      "/ai/skill/": "AI 技能",
      "/ai/skill/coc-units-data-exporter/": "COC 数据导出器",
      "/ai/skill/tlh/": "课本学习助手",
      "/ai/skill/tlh/about/": "TLH 使用教程",
      "/ai/skill/tlh/relativity-demo.html": "相对论学习演示",
      "/ai/skill/vocab-to-json/": "词库转 JSON",
      "/coc/": "COC 专区",
      "/coc/data/": "游戏数据查询",
      "/coc/dmg-calc/": "伤害计算器",
      "/coc/planner/": "升级规划器",
      "/coc/village/": "村庄分析旧入口",
      "/game/": "游戏专区",
      "/game/gpa-card/": "绩点战争",
      "/english/": "英语专区",
      "/english/words/": "英语学习控制台",
      "/words/": "背单词兼容入口",
      "/os/": "天择OS",
      "/os/webos.html": "天择OS 4.0",
      "/contact/": "联系开发者"
    };
    var iconByRoot = {
      news: "newspaper",
      blog: "pen",
      open: "unlock",
      ai: "ai",
      coc: "shield",
      game: "gamepad",
      english: "book",
      words: "book",
      os: "monitor",
      contact: "user"
    };
    var newsIcons = {
      1: "rocket", 2: "ai", 3: "shield", 4: "file", 5: "unlock",
      6: "globe", 7: "palette", 8: "pen", 9: "gamepad", 10: "calendar",
      11: "palette", 12: "monitor", 13: "book", 14: "lightning",
      15: "burst", 16: "ai", 17: "terminal", 18: "settings",
      19: "globe", 20: "pin", 21: "chat", 22: "terminal",
      23: "notes", 24: "camera", 25: "copy", 26: "sparkle"
    };

    function normalizePath(path) {
      var clean = String(path || "/").replace(/[?#].*$/, "");
      if (clean.charAt(0) !== "/") clean = "/" + clean;
      return clean || "/";
    }

    function parentPath(path, known) {
      if (path === "/words/" && known["/english/"]) return "/english/";
      var cursor = path;
      if (cursor !== "/" && cursor.endsWith("/")) cursor = cursor.slice(0, -1);
      cursor = cursor.slice(0, cursor.lastIndexOf("/") + 1) || "/";
      while (cursor !== "/" && !known[cursor]) {
        var trimmed = cursor.endsWith("/") ? cursor.slice(0, -1) : cursor;
        cursor = trimmed.slice(0, trimmed.lastIndexOf("/") + 1) || "/";
      }
      return known[cursor] ? cursor : "/";
    }

    function displayTitle(node) {
      if (fixedLabels[node.path]) return fixedLabels[node.path];
      var title = String(node.title || node.path)
        .replace(/\s*[·—]\s*天择网.*$/u, "")
        .replace(/\s*—\s*天择网.*$/u, "")
        .trim();
      if (/\/news\/\d+\/$/i.test(node.path)) {
        var lead = title.split(/[：:]/u)[0].trim();
        if (/^天择OS\s+\d+(?:\.\d+)*$/u.test(lead)) lead += " 发布";
        return lead;
      }
      if (node.path === "/blog/1/") return "混合矿工攻略";
      return title;
    }

    function iconFor(path) {
      var newsMatch = path.match(/\/news\/(\d+)\/$/i);
      if (newsMatch) return newsIcons[Number(newsMatch[1])] || "document";
      if (/\/blog\/\d+\/$/i.test(path)) return "notes";
      if (/relativity-demo\.html$/i.test(path)) return "bulb";
      if (/\/tlh\/about\/$/i.test(path)) return "document";
      if (/\/tlh\/$/i.test(path)) return "book";
      if (/vocab-to-json/i.test(path)) return "file";
      if (/coc-units-data-exporter/i.test(path)) return "download";
      if (/\/coc\/data\/$/i.test(path)) return "search";
      if (/\/coc\/planner\/$/i.test(path)) return "calendar";
      if (/\/coc\/dmg-calc\/$/i.test(path)) return "burst";
      if (/\/coc\/village\/$/i.test(path)) return "home";
      if (/\/game\/gpa-card\/$/i.test(path)) return "trophy";
      if (/\/os\/webos\.html$/i.test(path)) return "rocket";
      if (/\/(?:english\/words|words)\/$/i.test(path)) return "book";
      if (/\/ai\/skill\/$/i.test(path)) return "folder";
      var segment = path.split("/").filter(Boolean)[0] || "home";
      return iconByRoot[segment] || "file";
    }

    function sortNodes(a, b) {
      var ao = topOrder[a.path] || 999;
      var bo = topOrder[b.path] || 999;
      if (ao !== bo) return ao - bo;
      var an = a.path.match(/\/news\/(\d+)\/$/);
      var bn = b.path.match(/\/news\/(\d+)\/$/);
      if (an && bn) return Number(an[1]) - Number(bn[1]);
      return a.path.localeCompare(b.path, "zh-CN", { numeric: true });
    }

    function buildOrbitNode(node, depth, point) {
      var link = document.createElement("a");
      link.className = "tz-orbit-node tz-orbit-node--depth-" + depth;
      link.href = node.href;
      link.title = node.label;
      link.setAttribute("aria-label", node.label);
      link.style.left = point.x + "px";
      link.style.top = point.y + "px";
      link.dataset.orbitX = String(point.x);
      link.dataset.orbitY = String(point.y);

      var iconWell = document.createElement("span");
      iconWell.className = "tz-orbit-node__icon";
      iconWell.setAttribute("aria-hidden", "true");
      var icon = document.createElement("span");
      icon.className = "tz-icon";
      icon.dataset.icon = node.icon;
      iconWell.appendChild(icon);

      var label = document.createElement("small");
      label.className = "tz-orbit-node__label";
      label.textContent = node.label;
      link.appendChild(iconWell);
      link.appendChild(label);

      if (node.children.length) {
        var count = document.createElement("span");
        count.className = "tz-orbit-node__count";
        count.textContent = String(node.children.length);
        link.appendChild(count);
      }
      return link;
    }

    function buildOrbitMap(rootNode) {
      var width = 1500;
      var height = 1080;
      var center = { x: width / 2, y: height / 2 };
      var orbit = document.createElement("div");
      orbit.className = "tz-site-orbit";
      orbit.style.width = width + "px";
      orbit.style.height = height + "px";
      orbit.setAttribute("role", "group");
      orbit.setAttribute("aria-label", "天择网站点放射拓扑");

      var lines = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      lines.setAttribute("class", "tz-site-orbit__lines");
      lines.setAttribute("viewBox", "0 0 " + width + " " + height);
      lines.setAttribute("width", String(width));
      lines.setAttribute("height", String(height));
      lines.setAttribute("aria-hidden", "true");
      orbit.appendChild(lines);

      function pointAt(angle, radiusX, radiusY) {
        var rad = angle * Math.PI / 180;
        return {
          x: Math.round(center.x + Math.cos(rad) * radiusX),
          y: Math.round(center.y + Math.sin(rad) * radiusY)
        };
      }

      function connect(from, to, depth) {
        var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        var midX = Math.round((from.x + to.x) / 2);
        var midY = Math.round((from.y + to.y) / 2);
        var bendX = Math.round(midX + (center.x - midX) * .12);
        var bendY = Math.round(midY + (center.y - midY) * .12);
        path.setAttribute("d", "M " + from.x + " " + from.y +
          " Q " + bendX + " " + bendY + " " + to.x + " " + to.y);
        path.setAttribute("class", "tz-orbit-edge tz-orbit-edge--depth-" + depth);
        path.setAttribute("vector-effect", "non-scaling-stroke");
        lines.appendChild(path);
      }

      var core = document.createElement("a");
      core.className = "tz-network-core tz-orbit-core";
      core.href = rootNode.href;
      core.title = "天择网首页";
      core.setAttribute("aria-label", "天择网首页");
      core.style.left = center.x + "px";
      core.style.top = center.y + "px";
      core.dataset.orbitX = String(center.x);
      core.dataset.orbitY = String(center.y);
      core.innerHTML = '<span class="tz-icon" data-icon="crystal" aria-hidden="true"></span>' +
        '<b>天择网</b><small>CORE</small>';
      orbit.appendChild(core);

      function placeStandardDescendants(parent, parentPoint, parentAngle, depth, halfSector) {
        var children = parent.children.slice().sort(sortNodes);
        if (!children.length) return;
        var count = children.length;
        var radiusByDepth = {
          2: { x: 470, y: 330 },
          3: { x: 600, y: 420 },
          4: { x: 690, y: 480 }
        };
        var radius = radiusByDepth[depth] || radiusByDepth[4];
        var spread = count === 1 ? 0 : Math.min(halfSector, Math.max(11, (count - 1) * 8.5));
        children.forEach(function (child, index) {
          var ratio = count === 1 ? 0 : index / (count - 1);
          var angle = parentAngle + (count === 1 ? 0 : -spread + ratio * spread * 2);
          var point = pointAt(angle, radius.x, radius.y);
          connect(parentPoint, point, depth);
          orbit.appendChild(buildOrbitNode(child, depth, point));
          placeStandardDescendants(child, point, angle, depth + 1, Math.max(10, halfSector * .62));
        });
      }

      function placeNewsChildren(parent, parentPoint, parentAngle) {
        var children = parent.children.slice().sort(sortNodes);
        var spread = children.length > 1 ? Math.min(46, 13 + children.length * 7) : 0;
        children.forEach(function (child, index) {
          var ratio = children.length === 1 ? .5 : index / (children.length - 1);
          var angle = parentAngle + (children.length === 1 ? 0 : -spread + ratio * spread * 2);
          var point = pointAt(angle, 470, 330);
          connect(parentPoint, point, 2);
          orbit.appendChild(buildOrbitNode(child, 2, point));
        });
      }

      var topNodes = rootNode.children.slice().sort(sortNodes);
      topNodes.forEach(function (node, index) {
        var angle = -90 + index * (360 / topNodes.length);
        var point = pointAt(angle, 290, 200);
        connect(center, point, 1);
        orbit.appendChild(buildOrbitNode(node, 1, point));
        if (node.path === "/news/") placeNewsChildren(node, point, angle);
        else placeStandardDescendants(node, point, angle, 2, 16);
      });

      var orbitNodes = Array.prototype.slice.call(
        orbit.querySelectorAll(".tz-orbit-node, .tz-orbit-core")
      );
      function clearMagnify() {
        orbitNodes.forEach(function (node) {
          node.style.removeProperty("--tz-orbit-scale");
          node.style.removeProperty("z-index");
          node.classList.remove("is-orbit-focus", "is-orbit-near");
        });
      }
      function magnifyAround(target) {
        if (!target) {
          clearMagnify();
          return;
        }
        var tx = Number(target.dataset.orbitX);
        var ty = Number(target.dataset.orbitY);
        var radius = target.classList.contains("tz-orbit-core") ? 430 : 300;
        orbitNodes.forEach(function (node) {
          var dx = Number(node.dataset.orbitX) - tx;
          var dy = Number(node.dataset.orbitY) - ty;
          var distance = Math.sqrt(dx * dx + dy * dy);
          var strength = Math.max(0, 1 - distance / radius);
          var scale = node === target ? 1.34 : 1 + strength * .22;
          node.style.setProperty("--tz-orbit-scale", scale.toFixed(3));
          node.style.zIndex = node === target ? "18" : (strength > 0 ? String(8 + Math.round(strength * 5)) : "2");
          node.classList.toggle("is-orbit-focus", node === target);
          node.classList.toggle("is-orbit-near", node !== target && strength > 0);
        });
      }
      var pointerTarget = null;
      function focusedOrbitNode() {
        var active = document.activeElement &&
          document.activeElement.closest &&
          document.activeElement.closest(".tz-orbit-node, .tz-orbit-core");
        return active && orbit.contains(active) ? active : null;
      }
      function restoreInteractionFocus() {
        magnifyAround(pointerTarget || focusedOrbitNode());
      }
      orbit.addEventListener("pointerover", function (event) {
        var target = event.target.closest(".tz-orbit-node, .tz-orbit-core");
        if (target && orbit.contains(target)) {
          pointerTarget = target;
          magnifyAround(target);
        }
      });
      orbit.addEventListener("pointerout", function (event) {
        var from = event.target.closest(".tz-orbit-node, .tz-orbit-core");
        if (!from) return;
        var to = event.relatedTarget &&
          event.relatedTarget.closest &&
          event.relatedTarget.closest(".tz-orbit-node, .tz-orbit-core");
        if (to && orbit.contains(to)) return;
        pointerTarget = null;
        restoreInteractionFocus();
      });
      orbit.addEventListener("pointerleave", function () {
        pointerTarget = null;
        restoreInteractionFocus();
      });
      orbit.addEventListener("focusin", function (event) {
        var target = event.target.closest(".tz-orbit-node, .tz-orbit-core");
        if (target) magnifyAround(target);
      });
      orbit.addEventListener("focusout", function () {
        window.requestAnimationFrame(function () {
          var active = document.activeElement &&
            document.activeElement.closest &&
            document.activeElement.closest(".tz-orbit-node, .tz-orbit-core");
          if (!active || !orbit.contains(active)) restoreInteractionFocus();
          else magnifyAround(active);
        });
      });
      return { element: orbit, center: center };
    }

    map.setAttribute("aria-busy", "true");
    fetch(indexUrl.href, { credentials: "same-origin", cache: "no-cache" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (payload) {
        var entries = Array.isArray(payload && payload.entries) ? payload.entries : [];
        var hiddenRoutes = {
          "/404.html": true,
          "/words/": true,
          "/coc/village/": true
        };
        var visible = entries.filter(function (entry) {
          return !hiddenRoutes[normalizePath(entry.url)];
        });
        var known = Object.create(null);
        visible.forEach(function (entry) {
          var path = normalizePath(entry.url);
          known[path] = {
            path: path,
            title: entry.title || path,
            href: new URL(path.replace(/^\/+/, ""), rootUrl).href,
            children: []
          };
        });
        if (!known["/"]) throw new Error("站点索引缺少根节点");

        Object.keys(known).forEach(function (path) {
          var node = known[path];
          node.label = displayTitle(node);
          node.icon = iconFor(path);
          if (path === "/") return;
          var parent = known[parentPath(path, known)] || known["/"];
          parent.children.push(node);
        });
        known["/"].children.sort(sortNodes);
        ["/news/", "/blog/"].forEach(function (path) {
          var editorialNode = known[path];
          if (!editorialNode) return;
          editorialNode.children = editorialNode.children
            .slice()
            .sort(sortNodes)
            .slice(-5);
        });

        function countReachable(node) {
          return 1 + node.children.reduce(function (total, child) {
            return total + countReachable(child);
          }, 0);
        }
        var displayedCount = countReachable(known["/"]);

        var radial = buildOrbitMap(known["/"]);
        map.replaceChildren(radial.element);
        map.classList.remove("is-site-tree");
        map.classList.add("is-site-orbit");
        map.setAttribute("data-site-tree-ready", "true");
        map.setAttribute("aria-busy", "false");
        function centerOrbitMap() {
          map.scrollLeft = Math.max(0, radial.center.x - map.clientWidth / 2);
          map.scrollTop = Math.max(0, radial.center.y - map.clientHeight / 2);
        }
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(centerOrbitMap);
        });
        window.setTimeout(centerOrbitMap, 160);
        window.addEventListener("load", centerOrbitMap, { once: true });
        var splitMotionLink = document.querySelector("link[data-tz-split-motion]");
        if (splitMotionLink) splitMotionLink.addEventListener("load", centerOrbitMap, { once: true });
        if ("ResizeObserver" in window) {
          var orbitResizeObserver = new ResizeObserver(centerOrbitMap);
          orbitResizeObserver.observe(map);
        }

        var chip = map.closest(".tz-network-panel") &&
          map.closest(".tz-network-panel").querySelector(".tz-status-chip");
        if (chip) {
          chip.innerHTML = "<i></i>" + displayedCount + " 个精选节点可用";
        }
      })
      .catch(function () {
        map.setAttribute("aria-busy", "false");
        map.classList.add("site-tree-fallback");
        var loading = map.querySelector(".tz-network-loading");
        if (loading) {
          var loadingTitle = loading.querySelector("b");
          var loadingHint = loading.querySelector("small");
          if (loadingTitle) loadingTitle.textContent = "全站星图暂未载入";
          if (loadingHint) loadingHint.textContent = "请通过本地 HTTP 预览重新打开页面";
        }
        var chip = map.closest(".tz-network-panel") &&
          map.closest(".tz-network-panel").querySelector(".tz-status-chip");
        if (chip) chip.innerHTML = "<i></i>节点索引未连接";
      });
  }

  function initTzSiteMotion() {
    if (!document.body || /\/ai\/skill\/tlh\/relativity-demo\.html$/i.test(location.pathname)) return;
    var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.body.classList.add("tz-motion-enabled");

    var candidates = document.querySelectorAll([
      "main > :not(script):not(style)",
      ".tz-split-stack > .tz-split-content",
      ".tz-split-content > *",
      ".tz-workspace-card",
      ".tz-workspace-list__item",
      ".wp-card",
      ".english-tool-card",
      ".game-card",
      ".coc-unit-card"
    ].join(","));
    Array.prototype.forEach.call(candidates, function (element, index) {
      if (element.closest("[role='dialog'][hidden], .modal:not(.show):not(.active), .hidden")) return;
      element.classList.add("tz-motion-item");
      element.style.setProperty("--tz-motion-order", String(index % 7));
    });

    if (!reducedMotion && "IntersectionObserver" in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("tz-motion-visible");
          observer.unobserve(entry.target);
        });
      }, { rootMargin: "0px 0px -7% 0px", threshold: 0.001 });
      document.querySelectorAll(".tz-motion-item").forEach(function (element) {
        observer.observe(element);
      });
    } else {
      document.querySelectorAll(".tz-motion-item").forEach(function (element) {
        element.classList.add("tz-motion-visible");
      });
    }

    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        document.body.classList.add("tz-motion-ready");
      });
    });

    var scrollPending = false;
    function updateScrollMotion() {
      scrollPending = false;
      var shift = Math.max(-18, Math.min(18, window.scrollY * -0.018));
      document.documentElement.style.setProperty("--tz-scroll-shift", shift.toFixed(2) + "px");
    }
    window.addEventListener("scroll", function () {
      if (reducedMotion || scrollPending) return;
      scrollPending = true;
      window.requestAnimationFrame(updateScrollMotion);
    }, { passive: true });
    updateScrollMotion();

    document.addEventListener("click", function (event) {
      if (reducedMotion || event.defaultPrevented || event.button !== 0 ||
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      var link = event.target.closest && event.target.closest("a[href]");
      if (!link || link.hasAttribute("download") || link.target || link.hasAttribute("data-back")) return;
      var raw = link.getAttribute("href") || "";
      if (!raw || raw.charAt(0) === "#" || /^(mailto:|tel:|javascript:)/i.test(raw)) return;
      var target;
      try { target = new URL(link.href, location.href); } catch (e) { return; }
      if (target.origin !== location.origin || target.href === location.href) return;
      event.preventDefault();
      document.body.classList.add("tz-page-leaving");
      window.setTimeout(function () { location.href = target.href; }, 150);
    });
  }

  function initTzSiteAssistant() {
    if (!document.body ||
        /\/ai\/skill\/tlh\/relativity-demo\.html$/i.test(location.pathname) ||
        document.body.classList.contains("nochrome") ||
        document.querySelector(".tz-site-ai-launcher")) return;
    try {
      if (window.parent !== window && new URLSearchParams(location.search).get("nochrome") === "1") return;
    } catch (e) {}

    var rootUrl = getTzSiteRoot();
    var launcher = document.createElement("button");
    launcher.className = "tz-site-ai-launcher";
    launcher.type = "button";
    launcher.setAttribute("aria-label", "打开天择网 AI 对话");
    launcher.setAttribute("aria-haspopup", "dialog");
    launcher.setAttribute("aria-expanded", "false");
    appendTzIcon(launcher, "ai");
    var launcherCopy = document.createElement("span");
    launcherCopy.appendChild(makeTzText("b", "", "问天择网"));
    launcherCopy.appendChild(makeTzText("small", "", "本地优先检索与导航"));
    launcher.appendChild(launcherCopy);

    var dock = document.createElement("section");
    dock.className = "tz-site-ai-dock";
    dock.hidden = true;
    dock.setAttribute("role", "dialog");
    dock.setAttribute("aria-modal", "false");
    dock.setAttribute("aria-label", "天择网 AI 对话");
    dock.setAttribute("aria-hidden", "true");

    var dockBar = document.createElement("header");
    dockBar.className = "tz-site-ai-dock__bar";
    var dockTitle = document.createElement("span");
    appendTzIcon(dockTitle, "ai");
    var titleCopy = document.createElement("span");
    titleCopy.appendChild(makeTzText("b", "", "天择网 AI"));
    titleCopy.appendChild(makeTzText("small", "", "站内索引 + 本机知识 · 配置与天择OS共享"));
    dockTitle.appendChild(titleCopy);
    dockBar.appendChild(dockTitle);
    var close = document.createElement("button");
    close.type = "button";
    close.className = "tz-site-ai-dock__close";
    close.setAttribute("aria-label", "关闭天择网 AI 对话");
    appendTzIcon(close, "close");
    dockBar.appendChild(close);
    dock.appendChild(dockBar);

    var frame = document.createElement("iframe");
    frame.className = "tz-site-ai-dock__frame";
    frame.title = "天择网 AI 对话";
    frame.loading = "lazy";
    frame.setAttribute("allow", "clipboard-read; clipboard-write; display-capture");
    frame.src = new URL("os/float-chat.html?embedded=1&site=1", rootUrl).href;
    dock.appendChild(frame);

    function currentPageContext() {
      var main = document.querySelector("main");
      var description = document.querySelector('meta[name="description"]');
      var text = main ? (main.innerText || main.textContent || "") : "";
      var seenLinks = new Set();
      var navigation = [];
      if (main) {
        main.querySelectorAll("a[href]").forEach(function (link) {
          if (navigation.length >= 30) return;
          var target;
          try { target = new URL(link.href, location.href); } catch (e) { return; }
          if (target.origin !== location.origin || seenLinks.has(target.href)) return;
          seenLinks.add(target.href);
          var container = link.closest("article, section, .card, .tz-workspace-card");
          var detail = container && container.querySelector("p");
          navigation.push({
            url: target.pathname + target.search + target.hash,
            title: (link.getAttribute("aria-label") || link.textContent || target.pathname).replace(/\s+/g, " ").trim().slice(0, 120),
            description: detail ? detail.textContent.replace(/\s+/g, " ").trim().slice(0, 240) : ""
          });
        });
      }
      return {
        url: location.href,
        title: document.title,
        summary: [
          description ? description.content : "",
          text.replace(/\s+/g, " ").trim().slice(0, 5200)
        ].filter(Boolean).join("\n"),
        navigation: navigation
      };
    }

    function sendContext() {
      if (!frame.contentWindow) return;
      frame.contentWindow.postMessage({
        type: "tz-site-context-v1",
        context: currentPageContext()
      }, location.origin);
    }

    function setOpen(open) {
      launcher.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        dock.hidden = false;
        dock.setAttribute("aria-hidden", "false");
        window.requestAnimationFrame(function () {
          dock.classList.add("open");
          document.body.classList.add("tz-site-ai-open");
          sendContext();
          close.focus({ preventScroll: true });
        });
      } else {
        dock.classList.remove("open");
        dock.setAttribute("aria-hidden", "true");
        document.body.classList.remove("tz-site-ai-open");
        window.setTimeout(function () {
          dock.hidden = true;
          launcher.focus({ preventScroll: true });
        }, 190);
      }
    }

    launcher.addEventListener("click", function () { setOpen(dock.hidden); });
    close.addEventListener("click", function () { setOpen(false); });
    frame.addEventListener("load", sendContext);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !dock.hidden) {
        event.preventDefault();
        setOpen(false);
      }
    });
    window.addEventListener("popstate", sendContext);
    var screenshotInProgress = false;
    async function captureCurrentSiteView() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error("当前浏览器不支持网页截图");
      }
      var stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      try {
        var video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await new Promise(function (resolve, reject) {
          video.onloadedmetadata = resolve;
          video.onerror = function () { reject(new Error("无法读取截图画面")); };
        });
        await video.play();
        var sourceWidth = video.videoWidth || 1280;
        var sourceHeight = video.videoHeight || 720;
        var scale = Math.min(1, 1800 / Math.max(sourceWidth, sourceHeight));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));
        var context = canvas.getContext("2d");
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", .84);
      } finally {
        stream.getTracks().forEach(function (track) { track.stop(); });
      }
    }

    window.addEventListener("message", function (event) {
      if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
      if (event.data && event.data.type === "tz-site-context-ready-v1") {
        sendContext();
        return;
      }
      if (event.data && event.data.type === "tz-site-screenshot-request-v1") {
        var requestId = String(event.data.requestId || "").slice(0, 120);
        if (screenshotInProgress) {
          frame.contentWindow.postMessage({
            type: "tz-site-screenshot-result-v1",
            requestId: requestId,
            dataUrl: "",
            error: "已有截图请求正在进行"
          }, location.origin);
          return;
        }
        screenshotInProgress = true;
        dock.classList.add("tz-site-ai-capturing");
        captureCurrentSiteView().then(function (dataUrl) {
          frame.contentWindow.postMessage({
            type: "tz-site-screenshot-result-v1",
            requestId: requestId,
            dataUrl: dataUrl
          }, location.origin);
        }).catch(function (error) {
          frame.contentWindow.postMessage({
            type: "tz-site-screenshot-result-v1",
            requestId: requestId,
            dataUrl: "",
            error: error && error.message ? error.message : "网页截图失败"
          }, location.origin);
        }).finally(function () {
          screenshotInProgress = false;
          dock.classList.remove("tz-site-ai-capturing");
        });
        return;
      }
      if (!event.data || event.data.type !== "tz-site-open-url") return;
      var requested;
      try { requested = new URL(event.data.url, rootUrl); } catch (e) { return; }
      if (requested.origin !== location.origin) return;
      location.href = requested.href;
    });

    document.body.appendChild(launcher);
    document.body.appendChild(dock);
  }

  function bootTzUiV4() {
    ensureTzSplitMotionStyles();
    initTzEvolutionShell();
    initTzInternalPagePrimitives();
    initTzSplitArchitecture();
    initTzHomeSiteTree();
    initTzUiV4();
    initTzSiteMotion();
    initTzSiteAssistant();
  }

  if (document.body) bootTzUiV4();
  else document.addEventListener("DOMContentLoaded", bootTzUiV4);

  /* ============================================================
     配色皮肤（v4.0）
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
      btn.setAttribute("aria-label", "切换界面配色");
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-controls", "tz-palette-panel");
      btn.setAttribute("data-ui-icon", "palette");
      window.TZUI.setIcon(btn, "palette");
      var panel = document.createElement("div");
      panel.className = "tzpal-panel";
      panel.id = "tz-palette-panel";
      panel.setAttribute("role", "group");
      panel.setAttribute("aria-label", "界面配色");
      panel.setAttribute("aria-hidden", "true");
      function renderPanel() {
        var cur = TZPAL.apply();
        panel.innerHTML = "";
        Object.keys(TZPAL.SKINS).forEach(function (id) {
          var s = TZPAL.SKINS[id];
          var o = document.createElement("button");
          o.type = "button";
          o.className = "tzpal-opt" + (cur === id ? " active" : "");
          o.setAttribute("aria-pressed", String(cur === id));
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
        var open = panel.classList.toggle("open");
        btn.setAttribute("aria-expanded", String(open));
        panel.setAttribute("aria-hidden", String(!open));
      };
      document.addEventListener("click", function (e) {
        if (!panel.contains(e.target) && !btn.contains(e.target)) {
          panel.classList.remove("open");
          btn.setAttribute("aria-expanded", "false");
          panel.setAttribute("aria-hidden", "true");
        }
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && panel.classList.contains("open")) {
          panel.classList.remove("open");
          btn.setAttribute("aria-expanded", "false");
          panel.setAttribute("aria-hidden", "true");
          btn.focus();
        }
      });
      var shellTopbar = document.querySelector("body.tz-site-shell .topbar-inner");
      if (shellTopbar) {
        btn.classList.add("tzpal-btn--shell");
        var shellCommand = shellTopbar.querySelector(".tz-command-trigger");
        var shellToggle = shellTopbar.querySelector(".nav-toggle");
        var shellNav = shellTopbar.querySelector(".nav");
        shellTopbar.insertBefore(btn, shellCommand || shellToggle || shellNav || null);
      } else {
        document.body.appendChild(btn);
      }
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
      if (window.TZUI) window.TZUI.setIcon(toggle, isOpen ? "close" : "menu");
      nav.setAttribute("aria-hidden", String(mobileNav.matches && !isOpen));
      nav.querySelectorAll("a").forEach(function (link) {
        if (mobileNav.matches && !isOpen) link.tabIndex = -1;
        else link.removeAttribute("tabindex");
      });
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
    }, { threshold: 0.001, rootMargin: "0px 0px -5% 0px" });

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
