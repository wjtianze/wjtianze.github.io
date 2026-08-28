/* 天择网选择性离线缓存。不得缓存安装包、技能 ZIP 或真实 AI 请求。 */
"use strict";
const CACHE_REV = "20260828i";
const CORE_CACHE = `tz-site-core-${CACHE_REV}`;
const PACK_PREFIX = `tz-site-pack-${CACHE_REV}-`;
const KNOWN_PACKS = ["coc", "english", "game"];
const CORE_FILES = [
  "./", "index.html", "404.html", "offline/", "offline/index.html", "manifest.webmanifest",
  "open/data-center/", "open/data-center/index.html", "open/data-center/data-center.css", "open/data-center/core.js", "open/data-center/data-center.js",
  "assets/css/style.css", "assets/css/split-motion.css", "assets/css/site-refactor.css", "assets/js/main.js", "assets/js/pwa-client.js",
  "assets/data/site-ai-index.json",
  "assets/img/brand/tianze-mark.png",
  "assets/img/pwa/icon-192.png", "assets/img/pwa/icon-512.png", "assets/img/pwa/icon-maskable-512.png",
  "assets/img/section-bg/source/home-20260828.webp", "assets/img/section-bg/mobile/home-20260828.webp",
  "assets/img/ui-v4/core-crystal-generated.png", "assets/img/ui-v4/icon-atlas-cold.png", "assets/img/ui-v4/icon-atlas-mid.png", "assets/img/ui-v4/icon-atlas-warm.png",
  "assets/img/ui-v4/wallpaper-cold.webp", "assets/img/ui-v4/wallpaper-mid.webp", "assets/img/ui-v4/wallpaper-warm.webp",
  "assets/img/ui-v4/surface-cold.webp", "assets/img/ui-v4/surface-mid.webp", "assets/img/ui-v4/surface-warm.webp",
  "assets/img/ui-v4/button-cold.webp", "assets/img/ui-v4/button-mid.webp", "assets/img/ui-v4/button-warm.webp",
  "assets/img/ui-v4/icon-well-cold.webp", "assets/img/ui-v4/icon-well-mid.webp", "assets/img/ui-v4/icon-well-warm.webp"
];
const PACKS = Object.freeze({
  coc: [
    "coc/", "coc/index.html", "coc/app.js", "coc/shared/snapshot-v2.js",
    "coc/data/", "coc/data/index.html", "coc/data/all_game_data_zh.json",
    "coc/live/", "coc/live/index.html", "coc/live/live.css", "coc/live/live.js",
    "coc/planner/", "coc/planner/index.html", "coc/planner/storage.js", "coc/planner/priority.css", "coc/planner/priority.js", "coc/planner/app.js",
    "coc/dmg-calc/", "coc/dmg-calc/index.html", "coc/dmg-calc/app.js", "coc/village/", "coc/village/index.html", "coc/install/", "coc/install/index.html",
    "coc/tutorial/", "coc/tutorial/index.html", "coc/tutorial/articles.json", "coc/tutorial/1/", "coc/tutorial/1/index.html",
    "coc/tutorial/1/images/base1.jpg", "coc/tutorial/1/images/base2.jpg", "coc/tutorial/1/images/base3.jpg", "coc/tutorial/1/images/scores.jpg", "coc/tutorial/1/images/troops.jpg",
    "assets/css/coc-tools.css", "assets/css/coc-workspace.css", "blog/coc-tutorial-card.js",
    "assets/img/section-bg/source/coc-20260828.webp", "assets/img/section-bg/mobile/coc-20260828.webp"
  ],
  english: [
    "english/", "english/index.html", "english/english.css", "english/words/", "english/words/index.html", "english/words/words.css", "english/words/words.js",
    "english/words/sample-vocab.json", "english/words/gre-vocab.json", "words/", "words/index.html", "words/words.css", "words/words.js", "words/sample-vocab.json",
    "assets/img/section-bg/source/english-20260828.webp", "assets/img/section-bg/mobile/english-20260828.webp"
  ],
  game: [
    "game/", "game/index.html", "game/gpa-card/", "game/gpa-card/index.html", "assets/js/gpa-card.js", "assets/css/game-workspace.css", "assets/css/gpa-card.css", "assets/css/gpa-workspace.css",
    "assets/img/section-bg/source/game-20260828.webp", "assets/img/section-bg/mobile/game-20260828.webp"
  ]
});

/* 站内助手受管流代理。
 *
 * 静态站内跳转会销毁页面和 iframe，但服务工作线程仍可持有同一条上游请求。
 * 每个 generationId 永远只对应一次固定的站内 GLM 请求；后来的页面只能附着
 * 并重放已收到的分块，绝不能用同一个 id 静默重发上游。自定义接口、任意 URL、
 * Authorization/Cookie 等凭据均不经过这里。 */
const SITE_AI_PROXY_ENDPOINT = "https://tianze-ai-proxy.xia-xilin-sgy.workers.dev/api/ai/site-chat";
const SITE_AI_MODEL = "glm-4.7-flash";
const SITE_AI_MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const SITE_AI_MAX_BACKLOG_BYTES = 8 * 1024 * 1024;
const SITE_AI_RECONNECT_GRACE_MS = 45000;
const SITE_AI_JOBS = new Map();

function siteAIByteLength(value) {
  return new TextEncoder().encode(String(value || "")).byteLength;
}
function siteAIValidId(value) {
  return /^[A-Za-z0-9:_-]{12,160}$/.test(String(value || ""));
}
function siteAIToken(value) {
  const token = String(value || "").trim();
  if (!token || token.length > 4096 || /[\r\n\u0000]/.test(token)) throw new Error("站内助手安全令牌无效");
  return token;
}
function siteAIRequestBody(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("站内助手请求体无效");
  if (String(value.model || "").toLowerCase() !== SITE_AI_MODEL || value.stream !== true || !Array.isArray(value.messages)) {
    throw new Error("站内助手流代理只允许固定 GLM-4.7-Flash 流式对话");
  }
  const body = JSON.stringify(value);
  if (!body || siteAIByteLength(body) > SITE_AI_MAX_REQUEST_BYTES) throw new Error("站内助手请求体过大");
  return body;
}
function siteAIPost(port, message) {
  try { port.postMessage(message); return true; }
  catch (_) { return false; }
}
function siteAIBroadcast(job, message) {
  for (const port of [...job.ports]) if (!siteAIPost(port, message)) job.ports.delete(port);
}
function siteAITerminate(job, terminal) {
  if (job.terminal) return;
  job.terminal = terminal;
  job.status = terminal.type;
  siteAIBroadcast(job, terminal);
}
function siteAIAttach(job, port) {
  if (!port) throw new Error("站内助手续传端口缺失");
  job.ports.add(port);
  port.onmessage = event => {
    const message = event.data || {};
    if (message.type !== "SITE_AI_STREAM_ABORT" || String(message.generationId || "") !== job.id) return;
    if (!job.terminal) job.controller.abort();
  };
  if (typeof port.start === "function") port.start();
  // 先确认服务工作线程已经接管这一 generationId。上游响应头可能很慢，
  // 客户端不能因此误判代理失联，更不能另起一条上游请求。
  siteAIPost(port, { type: "SITE_AI_STREAM_ACCEPTED", generationId: job.id, status: job.status });
  if (job.response) siteAIPost(port, { type: "SITE_AI_STREAM_STARTED", generationId: job.id, ...job.response });
  job.backlog.forEach(packet => siteAIPost(port, { type: "SITE_AI_STREAM_CHUNK", generationId: job.id, seq: packet.seq, chunk: packet.chunk }));
  if (job.terminal) siteAIPost(port, job.terminal);
}
function siteAIHoldJob(job) {
  return new Promise(resolve => setTimeout(resolve, SITE_AI_RECONNECT_GRACE_MS)).finally(() => {
    if (SITE_AI_JOBS.get(job.id) === job) SITE_AI_JOBS.delete(job.id);
  });
}
async function siteAIRun(job, body, token) {
  try {
    const response = await fetch(SITE_AI_PROXY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "X-Turnstile-Token": token
      },
      body,
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal: job.controller.signal
    });
    const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
    if (!response.ok) {
      const detail = String(await response.text().catch(() => "")).slice(0, 65536);
      siteAITerminate(job, {
        type: "SITE_AI_STREAM_ERROR", generationId: job.id,
        status: Number(response.status) || 0, code: "HTTP_" + (Number(response.status) || 0),
        message: detail || ("站内助手接口错误 " + response.status)
      });
      return;
    }
    if (!contentType.startsWith("text/event-stream")) {
      siteAITerminate(job, {
        type: "SITE_AI_STREAM_ERROR", generationId: job.id, status: 0,
        code: "SITE_AI_STREAM_CONTENT_TYPE", message: "站内助手接口未返回 text/event-stream"
      });
      return;
    }
    if (!response.body) throw new Error("站内助手接口未返回可读取的响应内容");
    job.response = { status: response.status, contentType };
    siteAIBroadcast(job, { type: "SITE_AI_STREAM_STARTED", generationId: job.id, ...job.response });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const packet = await reader.read();
      if (packet.done) break;
      const chunk = decoder.decode(packet.value, { stream: true });
      if (!chunk) continue;
      const bytes = siteAIByteLength(chunk);
      if (job.backlogBytes + bytes > SITE_AI_MAX_BACKLOG_BYTES) {
        siteAITerminate(job, {
          type: "SITE_AI_STREAM_ERROR", generationId: job.id, status: 0,
          code: "SITE_AI_STREAM_LIMIT", message: "站内助手回答超过跨页面续传上限"
        });
        job.controller.abort();
        return;
      }
      const saved = { seq: job.nextSeq++, chunk };
      job.backlog.push(saved);
      job.backlogBytes += bytes;
      siteAIBroadcast(job, { type: "SITE_AI_STREAM_CHUNK", generationId: job.id, ...saved });
    }
    const tail = decoder.decode();
    if (tail) {
      const bytes = siteAIByteLength(tail);
      if (job.backlogBytes + bytes > SITE_AI_MAX_BACKLOG_BYTES) {
        siteAITerminate(job, {
          type: "SITE_AI_STREAM_ERROR", generationId: job.id, status: 0,
          code: "SITE_AI_STREAM_LIMIT", message: "站内助手回答超过跨页面续传上限"
        });
        job.controller.abort();
        return;
      }
      const saved = { seq: job.nextSeq++, chunk: tail };
      job.backlog.push(saved);
      job.backlogBytes += bytes;
      siteAIBroadcast(job, { type: "SITE_AI_STREAM_CHUNK", generationId: job.id, ...saved });
    }
    siteAITerminate(job, { type: "SITE_AI_STREAM_DONE", generationId: job.id });
  } catch (error) {
    if (job.controller.signal.aborted) {
      siteAITerminate(job, { type: "SITE_AI_STREAM_ABORTED", generationId: job.id, code: "ABORT_ERR", message: "已停止生成" });
      return;
    }
    siteAITerminate(job, {
      type: "SITE_AI_STREAM_ERROR", generationId: job.id, status: 0,
      code: "SITE_AI_STREAM_NETWORK", message: String(error && error.message || "站内助手网络请求失败").slice(0, 500)
    });
  }
}
function siteAIStart(generationId, bodyValue, tokenValue, port) {
  const id = String(generationId || "");
  if (!siteAIValidId(id)) throw new Error("站内助手 generationId 无效");
  const existing = SITE_AI_JOBS.get(id);
  if (existing) {
    siteAIAttach(existing, port);
    return existing;
  }
  const body = siteAIRequestBody(bodyValue);
  const token = siteAIToken(tokenValue);
  const job = {
    id, controller: new AbortController(), ports: new Set(), response: null, terminal: null,
    status: "running", backlog: [], backlogBytes: 0, nextSeq: 0, lifetime: null
  };
  SITE_AI_JOBS.set(id, job);
  siteAIAttach(job, port);
  job.lifetime = siteAIRun(job, body, token).then(() => siteAIHoldJob(job));
  return job;
}
function siteAIAttachExisting(generationId, port) {
  const id = String(generationId || "");
  if (!siteAIValidId(id)) throw new Error("站内助手 generationId 无效");
  const job = SITE_AI_JOBS.get(id);
  if (!job) {
    siteAIPost(port, {
      type: "SITE_AI_STREAM_MISSING", generationId: id, code: "SITE_AI_STREAM_MISSING",
      message: "原站内助手流任务已不在服务工作线程中；为防止重复调用工具，系统没有自动重发上游请求"
    });
    return null;
  }
  siteAIAttach(job, port);
  return job;
}

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

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await cacheFiles(CORE_CACHE, CORE_FILES);
    await self.skipWaiting();
  })());
});
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
  if (message.type === "SITE_AI_STREAM_START") {
    try {
      const job = siteAIStart(message.generationId, message.body, message.turnstileToken, event.ports && event.ports[0]);
      if (job && job.lifetime) event.waitUntil(job.lifetime);
    } catch (error) {
      reply({
        type: "SITE_AI_STREAM_ERROR", generationId: String(message.generationId || ""),
        status: 0, code: "SITE_AI_STREAM_REJECTED", message: String(error && error.message || error).slice(0, 500)
      });
    }
    return;
  }
  if (message.type === "SITE_AI_STREAM_ATTACH") {
    try {
      const job = siteAIAttachExisting(message.generationId, event.ports && event.ports[0]);
      if (job && job.lifetime) event.waitUntil(job.lifetime);
    } catch (error) {
      reply({
        type: "SITE_AI_STREAM_ERROR", generationId: String(message.generationId || ""),
        status: 0, code: "SITE_AI_STREAM_REJECTED", message: String(error && error.message || error).slice(0, 500)
      });
    }
    return;
  }
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
  event.respondWith(fetch(request).catch(async (error) => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }));
});

if (self.__TZ_SW_TEST_MODE__) self.__TZ_SW_TEST__ = {
  cacheFiles, installPack, removePack, status, refreshInstalledPacks, hasAllFiles, readPackMeta,
  PACKS, PACK_PREFIX, CACHE_REV, packMetaUrl,
  siteAIStart, siteAIAttachExisting, SITE_AI_JOBS, SITE_AI_PROXY_ENDPOINT, SITE_AI_MODEL
};
