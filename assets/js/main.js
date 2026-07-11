/* ============================================================
   天择网 · 交互脚本
   所有动画与交互均带丝滑过渡
   ============================================================ */
(function () {
  "use strict";

  /* 顶部栏滚动阴影 */
  var topbar = document.querySelector(".topbar");
  function onScroll() {
    if (!topbar) return;
    if (window.scrollY > 12) topbar.classList.add("scrolled");
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
  }

  /* 进场揭示动画 */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && reveals.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
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
})();
