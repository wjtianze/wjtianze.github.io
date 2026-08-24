/* 天择网选择性离线缓存。不得缓存安装包、技能 ZIP 或真实 AI 请求。 */
"use strict";
const CACHE_REV = "20260824c";
const CORE_CACHE = `tz-site-core-${CACHE_REV}`;
const PACK_PREFIX = `tz-site-pack-${CACHE_REV}-`;
const KNOWN_PACKS = ["coc", "english", "game"];
const CORE_FILES = [
  "./", "index.html", "404.html", "offline/", "offline/index.html", "manifest.webmanifest",
  "open/data-center/", "open/data-center/index.html", "open/data-center/data-center.css", "open/data-center/core.js", "open/data-center/data-center.js",
  "assets/css/style.css", "assets/css/split-motion.css", "assets/js/main.js", "assets/js/pwa-client.js",
  "assets/data/site-ai-index.json",
  "assets/img/pwa/icon-192.png", "assets/img/pwa/icon-512.png", "assets/img/pwa/icon-maskable-512.png",
  "assets/img/section-bg/source/home.webp", "assets/img/section-bg/mobile/home.webp",
  "assets/img/ui-v4/core-crystal-generated.png", "assets/img/ui-v4/icon-atlas-cold.png", "assets/img/ui-v4/icon-atlas-mid.png", "assets/img/ui-v4/icon-atlas-warm.png",
  "assets/img/ui-v4/wallpaper-cold.webp", "assets/img/ui-v4/wallpaper-mid.webp", "assets/img/ui-v4/wallpaper-warm.webp",
  "assets/img/ui-v4/surface-cold.webp", "assets/img/ui-v4/surface-mid.webp", "assets/img/ui-v4/surface-warm.webp",
  "assets/img/ui-v4/button-cold.webp", "assets/img/ui-v4/button-mid.webp", "assets/img/ui-v4/button-warm.webp",
  "assets/img/ui-v4/icon-well-cold.webp", "assets/img/ui-v4/icon-well-mid.webp", "assets/img/ui-v4/icon-well-warm.webp"
];
const PACKS = Object.freeze({
  coc: [
    "coc/", "coc/index.html", "coc/app.js", "coc/shared/snapshot-v2.js", "coc/data/", "coc/data/index.html", "coc/data/live-query.css", "coc/data/live-query.js", "coc/data/all_game_data_zh.json",
    "coc/planner/", "coc/planner/index.html", "coc/planner/storage.js", "coc/planner/priority.css", "coc/planner/priority.js", "coc/planner/app.js",
    "coc/dmg-calc/", "coc/dmg-calc/index.html", "coc/dmg-calc/app.js", "coc/village/", "coc/village/index.html", "coc/install/", "coc/install/index.html",
    "coc/tutorial/", "coc/tutorial/index.html", "coc/tutorial/articles.json", "coc/tutorial/1/", "coc/tutorial/1/index.html",
    "coc/tutorial/1/images/base1.jpg", "coc/tutorial/1/images/base2.jpg", "coc/tutorial/1/images/base3.jpg", "coc/tutorial/1/images/scores.jpg", "coc/tutorial/1/images/troops.jpg",
    "assets/css/coc-tools.css", "assets/css/coc-workspace.css", "blog/coc-tutorial-card.js",
    "assets/img/section-bg/source/coc.webp", "assets/img/section-bg/mobile/coc.webp"
  ],
  english: [
    "english/", "english/index.html", "english/words/", "english/words/index.html", "english/words/words.css", "english/words/words.js",
    "english/words/sample-vocab.json", "english/words/gre-vocab.json", "words/", "words/index.html", "words/words.css", "words/words.js", "words/sample-vocab.json",
    "assets/img/section-bg/source/english.webp", "assets/img/section-bg/mobile/english.webp"
  ],
  game: [
    "game/", "game/index.html", "game/gpa-card/", "game/gpa-card/index.html", "assets/js/gpa-card.js", "assets/css/game-workspace.css", "assets/css/gpa-card.css", "assets/css/gpa-workspace.css",
    "assets/img/section-bg/source/game.webp", "assets/img/section-bg/mobile/game.webp"
  ]
});

function scoped(path) { return new URL(path, self.registration.scope).href; }
function forbidden(url) {
  const pathname = new URL(url).pathname.toLowerCase();
  return /\.(?:exe|msi|zip|apk)(?:$|[?#])/.test(pathname) || pathname.includes("/os/downloads/");
}
function packMetaUrl(id) { return scoped("__tz_offline_pack_meta__/" + id); }
function packRevision(name, id) {
  const prefix = "tz-site-pack-", suffix = "-" + id;
  return name.startsWith(prefix) && name.endsWith(suffix) ? name.slice(prefix.length, -suffix.length) : "";
}
async function hasAllFiles(name, files) {
  const names = await caches.keys();
  if (!names.includes(name)) return false;
  const cache = await caches.open(name);
  for (const path of files) if (!(await cache.match(scoped(path)))) return false;
  return true;
}
async function readPackMeta(name, id) {
  try {
    const cache = await caches.open(name), response = await cache.match(packMetaUrl(id));
    if (!response) return null;
    const meta = await response.json();
    return meta && typeof meta === "object" ? meta : null;
  } catch (_) { return null; }
}
async function hasAllUrls(name, urls) {
  const cache = await caches.open(name);
  for (const url of urls) if (!(await cache.match(url))) return false;
  return true;
}
async function cacheFiles(name, files, packId) {
  if (files.some((path) => forbidden(scoped(path)))) throw new Error("离线清单包含禁止缓存的文件");
  const ownRevision = packId ? (packRevision(name, packId) || CACHE_REV) : "";
  const expectedUrls = files.map(scoped);
  const existingMeta = packId ? await readPackMeta(name, packId) : null;
  if (await hasAllFiles(name, files) && (!packId || existingMeta && existingMeta.revision === ownRevision && Array.isArray(existingMeta.urls) && existingMeta.urls.length === expectedUrls.length)) return;
  await caches.delete(name);
  const cache = await caches.open(name);
  try {
    await cache.addAll(files.map(scoped));
    if (packId) await cache.put(packMetaUrl(packId), new Response(JSON.stringify({ id: packId, revision: ownRevision, files: files.length, urls: expectedUrls }), { headers: { "Content-Type": "application/json" } }));
    if (!(await hasAllFiles(name, files))) throw new Error("离线缓存完整性校验失败");
  } catch (error) {
    await caches.delete(name);
    throw error;
  }
}
async function installPack(id) {
  if (!Object.prototype.hasOwnProperty.call(PACKS, id)) throw new Error("未知离线内容包");
  await cacheFiles(PACK_PREFIX + id, PACKS[id], id);
}
async function removePack(id) {
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name.startsWith("tz-site-pack-") && name.endsWith("-" + id)).map((name) => caches.delete(name)));
}
async function status() {
  const names = await caches.keys(), packs = {};
  for (const id of KNOWN_PACKS) {
    const candidates = names.filter((name) => name.startsWith("tz-site-pack-") && name.endsWith("-" + id));
    candidates.sort((a, b) => (a === PACK_PREFIX + id ? -1 : b === PACK_PREFIX + id ? 1 : b.localeCompare(a)));
    for (const name of candidates) {
      const cache = await caches.open(name), keys = await cache.keys(), revision = packRevision(name, id);
      const resourceKeys = keys.filter((request) => request.url !== packMetaUrl(id));
      let complete = false, verified = false, count = resourceKeys.length;
      if (revision === CACHE_REV) {
        complete = await hasAllFiles(name, PACKS[id]);
        verified = complete;
      } else {
        const meta = await readPackMeta(name, id);
        if (meta && meta.id === id && meta.revision === revision && Number(meta.files) === meta.urls?.length && Array.isArray(meta.urls) && meta.urls.length &&
            meta.urls.every((url) => { try { return new URL(url).origin === self.location.origin && !forbidden(url); } catch (_) { return false; } })) {
          complete = await hasAllUrls(name, meta.urls);
          verified = complete;
          count = meta.urls.length;
        } else {
          complete = resourceKeys.length > 0 && Boolean(await cache.match(scoped(PACKS[id][0])));
        }
      }
      if (!complete) continue;
      packs[id] = { count, revision, stale: revision !== CACHE_REV, verified };
      break;
    }
  }
  return { revision: CACHE_REV, core: names.includes(CORE_CACHE), packs };
}

async function refreshInstalledPacks() {
  const names = await caches.keys(), failures = {};
  for (const id of KNOWN_PACKS) {
    const oldNames = names.filter((name) => name.startsWith("tz-site-pack-") && name.endsWith("-" + id) && name !== PACK_PREFIX + id);
    if (!oldNames.length) continue;
    try {
      await installPack(id);
      await Promise.all(oldNames.map((name) => caches.delete(name)));
    } catch (error) {
      failures[id] = error && error.message ? error.message : String(error);
    }
  }
  return failures;
}

self.addEventListener("install", (event) => { event.waitUntil(cacheFiles(CORE_CACHE, CORE_FILES)); });
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("tz-site-core-") && name !== CORE_CACHE).map((name) => caches.delete(name)));
    await refreshInstalledPacks();
    await self.clients.claim();
  })());
});
self.addEventListener("message", (event) => {
  const message = event.data || {}, reply = (value) => { if (event.ports && event.ports[0]) event.ports[0].postMessage(value); };
  if (message.type === "SKIP_WAITING") { self.skipWaiting(); reply({ ok: true }); return; }
  if (message.type === "PACK_STATUS") { event.waitUntil(status().then((value) => reply({ ok: true, value })).catch((error) => reply({ ok: false, error: error.message }))); return; }
  if (message.type === "PACK_INSTALL") { event.waitUntil(installPack(String(message.pack || "")).then(() => status()).then((value) => reply({ ok: true, value })).catch((error) => reply({ ok: false, error: error.message }))); return; }
  if (message.type === "PACK_REMOVE") { event.waitUntil(removePack(String(message.pack || "")).then(() => status()).then((value) => reply({ ok: true, value })).catch((error) => reply({ ok: false, error: error.message }))); }
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || forbidden(url.href)) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => (await caches.match(request, { ignoreSearch: true })) || (await caches.match(scoped("offline/index.html")))));
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request)));
});

if (self.__TZ_SW_TEST_MODE__) self.__TZ_SW_TEST__ = { cacheFiles, installPack, removePack, status, refreshInstalledPacks, hasAllFiles, readPackMeta, PACKS, PACK_PREFIX, CACHE_REV, packMetaUrl };
