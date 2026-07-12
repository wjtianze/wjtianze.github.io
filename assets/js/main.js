/* ============================================================
   天择网 · 交互脚本 v2
   目标：60fps 丝滑动画、被动监听、GPU 加速
   ============================================================ */
(function () {
  "use strict";

  /* 顶部栏滚动阴影 */
  var topbar = document.querySelector(".topbar");
  function onScroll() {
    if (!topbar) return;
    if (window.scrollY > 8) topbar.classList.add("scrolled");
    else topbar.classList.remove("scrolled");
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* 移动端导航开关 */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      nav.classList.toggle("open");
    });
    nav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("open");
      });
    });
    document.addEventListener("click", function (e) {
      if (!nav.contains(e.target) && !toggle.contains(e.target)) {
        nav.classList.remove("open");
      }
    });
  }

  /* 滚动揭示动画：优先使用 IntersectionObserver */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && reveals.length) {
    var revealIO = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            revealIO.unobserve(e.target);
          }
        });
      },
      { threshold: 0.10, rootMargin: "0px 0px -6% 0px" }
    );
    reveals.forEach(function (el) { revealIO.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  /* 网格内部子元素自动错峰显示 */
  var staggerContainers = document.querySelectorAll(".grid, .feature-grid, .subzones, .scenario-list, .news-list");
  staggerContainers.forEach(function (container) {
    var children = container.querySelectorAll(".reveal");
    children.forEach(function (child, idx) {
      // 限制最大延迟，避免过长等待
      var delay = Math.min(idx, 5) * 0.08;
      child.style.transitionDelay = delay + "s";
    });
  });

  /* 背景网格视差：滚动时缓慢移动，营造空间感 */
  var bgMesh = document.querySelector(".bg-mesh");
  if (bgMesh) {
    var ticking = false;
    function updateParallax() {
      var y = window.scrollY;
      bgMesh.style.transform = "translateY(" + (y * 0.06) + "px)";
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) {
        window.requestAnimationFrame(updateParallax);
        ticking = true;
      }
    }, { passive: true });
  }

  /* 通用返回上一页（带兜底回主页） */
  document.querySelectorAll("[data-back]").forEach(function (btn) {
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      if (history.length > 1) {
        history.back();
      } else {
        var home = btn.getAttribute("data-home") || "../index.html";
        window.location.href = home;
      }
    });
  });

  /* 404：显示尝试访问的路径 */
  var pathEl = document.getElementById("err-path");
  if (pathEl) {
    var attempted =
      new URLSearchParams(window.location.search).get("path") ||
      window.location.hash.replace(/^#/, "") ||
      document.referrer ||
      window.location.pathname;
    pathEl.textContent = attempted || window.location.href;
  }

  /* 横幅轮播（若存在多条） */
  var banners = document.querySelectorAll(".banner-track .banner");
  if (banners.length > 1) {
    var idx = 0;
    banners.forEach(function (b, i) { b.style.display = i === 0 ? "" : "none"; });
    setInterval(function () {
      banners[idx].style.display = "none";
      idx = (idx + 1) % banners.length;
      banners[idx].style.display = "";
      banners[idx].classList.remove("in");
      void banners[idx].offsetWidth;
      banners[idx].classList.add("in");
    }, 5000);
  }

  /* 按钮涟漪（可选增强，不影响核心功能） */
  document.querySelectorAll(".btn, .nav a, .dq-cat, .news-row").forEach(function (el) {
    el.addEventListener("mousedown", function () {
      el.style.transform = "scale(0.98)";
    });
    el.addEventListener("mouseup", function () {
      el.style.transform = "";
    });
    el.addEventListener("mouseleave", function () {
      el.style.transform = "";
    });
  });
})();
