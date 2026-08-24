/* 天择网 COC 数据中心：Cloudflare 只读查询；桌面版可显式切换本机 coc.py。 */
(function () {
  "use strict";

  var CLOUD_ROOT = "https://tianze-coc-query.xia-xilin-sgy.workers.dev";
  var connected = false, capabilities = null, connectionPromise = null, lastResult = null, lastAction = "", currentKind = "player", transport = "cloud";
  var queryGeneration = 0, connectionGeneration = 0;
  var COC_TAG_CHARACTERS = "0289PYLQGRJCUV";
  var LIVE_KINDS = ["player", "clan", "advanced"];
  var STALE_QUERY = {};
  var ACTION_DEFAULTS = {
    player: { action: "get_player", params: { player_tag: "#" } },
    clan: { action: "get_clan", params: { tag: "#" } },
    advanced: { action: "search_clans", params: { name: "", limit: 20 } }
  };

  function $(id) { return document.getElementById(id); }
  function normalizeCocTag(value, noun) {
    var label = noun || "标签";
    var raw = String(value == null ? "" : value).trim().toUpperCase().replace(/O/g, "0");
    if (!raw) throw new Error("请输入" + label);
    var body = raw.charAt(0) === "#" ? raw.slice(1) : raw;
    if (body.length < 3 || body.length > 15) throw new Error(label + "应为 3 至 15 个字符");
    if (body.indexOf("#") >= 0 || !new RegExp("^[" + COC_TAG_CHARACTERS + "]+$").test(body)) {
      throw new Error(label + "只能包含 " + COC_TAG_CHARACTERS + "；字母 O 会自动改为数字 0");
    }
    return "#" + body;
  }
  function normalizeTagInput(input) {
    if (!input || !String(input.value || "").trim()) return;
    try { input.value = normalizeCocTag(input.value, input.id === "cocClanTag" ? "部落标签" : "玩家标签"); } catch (_error) {}
  }
  function normalizedLinkedTag(value, noun) {
    if (typeof value !== "string") return "";
    try { return normalizeCocTag(value, noun); } catch (_error) { return ""; }
  }
  function setStatus(text, tone) {
    var el = $("cocLiveStatus"); if (!el) return;
    el.textContent = text; el.classList.toggle("is-ok", tone === "ok"); el.classList.toggle("is-error", tone === "error");
  }
  function errorText(error) {
    var message = String(error && error.message || error || "请求失败").trim();
    if (/failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(message)) {
      return "无法连接云端查询服务，请检查网络或人机验证后重试。";
    }
    if (/abort(?:ed|error)?|timed?\s*out|timeout/i.test(message)) {
      return "连接云端查询服务超时，请稍后重试。";
    }
    return message || "请求失败";
  }
  function envelope(value) {
    if (!value || typeof value !== "object") throw new Error("查询服务返回了无效响应");
    if (value.ok === false) throw new Error(value.error && (value.error.message || value.error.code) || "请求失败");
    return Object.prototype.hasOwnProperty.call(value, "result") ? value.result : value;
  }
  function desktopBridge(method) {
    try {
      if (window.tzDesktop && typeof window.tzDesktop[method] === "function") return window.tzDesktop;
      if (window.top && window.top !== window && window.top.tzDesktop && typeof window.top.tzDesktop[method] === "function") return window.top.tzDesktop;
    } catch (_error) {}
    return null;
  }
  function desktopRpc(request) {
    var bridge = desktopBridge("cocQuery");
    if (bridge) return Promise.resolve(bridge.cocQuery(request)).then(envelope);
    if (window.TianzeCocDesktop && typeof window.TianzeCocDesktop.request === "function") return Promise.resolve(window.TianzeCocDesktop.request(request)).then(envelope);
    return Promise.reject(new Error("当前环境没有天择OS本机 COC 服务"));
  }
  function cloudSecurity() {
    try {
      if (window.TZCloudSecurity && typeof window.TZCloudSecurity.getToken === "function") return window.TZCloudSecurity;
      if (window.top && window.top !== window && window.top.TZCloudSecurity && typeof window.top.TZCloudSecurity.getToken === "function") return window.top.TZCloudSecurity;
    } catch (_error) {}
    return null;
  }
  function turnstileToken() {
    var security = cloudSecurity();
    if (!security) return Promise.reject(new Error("云端安全验证尚未配置，请稍后重试"));
    return Promise.resolve(security.getToken("coc_query")).then(function (token) {
      token = String(token || "").trim();
      if (!token || token.length > 2048) throw new Error("云端安全验证失败，请重试");
      return token;
    });
  }
  function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function cloudErrorRetryable(status, code) {
    // Worker 已经把账号、出口 IP、Key 上限和上游故障分类为稳定错误码；
    // 再次执行只会重复登录或创建 Key。仅重试没有结构化错误码的临时网关故障。
    if (String(code || "").trim()) return false;
    return [408, 425, 429, 502, 503, 504].indexOf(Number(status)) >= 0;
  }
  function cloudRequest(path, options, requireToken) {
    options = options || {};
    var attempts = 3;
    function run(attempt) {
      var tokenTask = requireToken ? turnstileToken() : Promise.resolve("");
      return tokenTask.then(function (token) {
        var headers = Object.assign({ "Accept": "application/json" }, options.headers || {});
        if (token) headers["X-Turnstile-Token"] = token;
        if (options.body != null) headers["Content-Type"] = "application/json";
        function acceptResponse(status, ok, body) {
          if (!ok) {
            var code = body && body.error && body.error.code || "";
            var error = new Error(body && body.error && (body.error.message || code) || ("云端查询 HTTP " + status));
            error.code = String(code || "");
            error.status = status;
            error.retryable = cloudErrorRetryable(status, code);
            throw error;
          }
          return envelope(body);
        }
        var bridge = desktopBridge("cocCloudRequest");
        if (bridge && typeof bridge.cocCloudRequest === "function") {
          return Promise.resolve(bridge.cocCloudRequest({
            path: path,
            method: options.method || "GET",
            token: token,
            body: options.body
          })).then(function (response) {
            if (!response || typeof response !== "object") throw new Error("桌面云端代理返回了无效响应");
            return acceptResponse(Number(response.status) || 0, response.ok === true, response.body);
          }).catch(function (error) {
            if (!error.status && !error.code) error.retryable = true;
            throw error;
          });
        }
        return fetch(CLOUD_ROOT + path, Object.assign({ method: "GET", mode: "cors", cache: "no-store", credentials: "omit", redirect: "error", headers: headers }, options))
          .then(function (response) {
            return response.json().catch(function () { return null; }).then(function (body) {
              return acceptResponse(response.status, response.ok, body);
            });
          });
      }).catch(function (error) {
        var retryable = error && error.retryable === true || error instanceof TypeError;
        if (!retryable || attempt + 1 >= attempts) throw error;
        return delay(350 * Math.pow(2, attempt)).then(function () { return run(attempt + 1); });
      });
    }
    return run(0);
  }
  function specList(spec, camelName, legacyName) {
    var value = spec && spec[camelName];
    if (!Array.isArray(value)) value = spec && spec[legacyName];
    return Array.isArray(value) ? value : [];
  }
  function safeActions(documentValue) {
    var actions = documentValue && Array.isArray(documentValue.readOnlyActions) ? documentValue.readOnlyActions : [];
    return actions.filter(function (item) {
      var secrets = specList(item, "secretParams", "secret_params");
      return item && /^[a-z][a-z0-9_]{1,80}$/.test(String(item.action || "")) && item.action !== "verify_player_token" && item.status !== "unsupported" && secrets.length === 0;
    });
  }
  function connectionIsCurrent(generation, targetTransport) {
    return generation === connectionGeneration && targetTransport === transport;
  }
  function staleConnectionError() {
    var error = new Error("连接方式已经切换");
    error.staleConnection = true;
    return error;
  }
  function connect() {
    if (connectionPromise) return connectionPromise;
    var generation = connectionGeneration, targetTransport = transport;
    setStatus(targetTransport === "local" ? "正在连接本机 coc.py…" : "正在连接天择云端…");
    var task = targetTransport === "local"
      ? desktopRpc({ operation: "session.status" }).then(function (status) {
          if (!status || (!status.connected && !status.remembered)) throw new Error("本机 COC 服务尚未登录，请先在天择OS中完成本机配置");
          return status;
        })
      : cloudRequest("/api/health", { method: "GET" }, false);
    var pending = task.then(function () {
      if (!connectionIsCurrent(generation, targetTransport)) throw staleConnectionError();
      connected = true;
      return loadCapabilities(targetTransport, generation);
    }).then(function () {
      if (!connectionIsCurrent(generation, targetTransport)) throw staleConnectionError();
      setStatus(targetTransport === "local" ? "本机 coc.py 已连接" : "云端服务在线，等待首次真实查询", targetTransport === "local" ? "ok" : "");
    }).catch(function (error) {
      if (error && error.staleConnection) throw error;
      if (!connectionIsCurrent(generation, targetTransport)) throw staleConnectionError();
      connected = false;
      setStatus(targetTransport === "local" ? "本机服务不可用" : "云端暂不可用", "error");
      $("cocLiveError").textContent = errorText(error);
      throw error;
    });
    connectionPromise = pending;
    pending.then(function () { if (connectionPromise === pending) connectionPromise = null; }, function () { if (connectionPromise === pending) connectionPromise = null; });
    return pending;
  }
  function loadCapabilities(targetTransport, generation) {
    targetTransport = targetTransport || transport;
    generation = typeof generation === "number" ? generation : connectionGeneration;
    var task = targetTransport === "local"
      ? desktopRpc({ operation: "capabilities.get" })
      : cloudRequest("/api/coc/capabilities", { method: "GET" }, true);
    return task.then(function (result) {
      if (!connectionIsCurrent(generation, targetTransport)) throw staleConnectionError();
      var filtered = safeActions(result);
      capabilities = Object.assign({}, result, { readOnlyActions: filtered, events: [] });
      renderActions();
      $("cocCapabilityNote").textContent = "玩家和部落可直接输入标签查询；开发者高级页另提供 coc.py " + (result.cocPyVersion || "4.0.0") + " 的 " + filtered.length + " 个无秘密只读动作。静态游戏数据继续使用天择网自己的 18.400.22 目录。";
      return capabilities;
    });
  }
  function renderActions() {
    var select = $("cocAction"), actions = capabilities && capabilities.readOnlyActions || [];
    select.innerHTML = "";
    actions.forEach(function (item) {
      var option = document.createElement("option"); option.value = item.action; option.textContent = (item.category || "官网") + " · " + item.action; select.appendChild(option);
    });
    if (!actions.length) {
      var empty = document.createElement("option"); empty.value = ""; empty.textContent = "暂无可用查询"; select.appendChild(empty); select.disabled = true; $("cocRun").disabled = true; return;
    }
    select.disabled = false; $("cocRun").disabled = false;
    var preferred = ACTION_DEFAULTS[currentKind] && ACTION_DEFAULTS[currentKind].action;
    select.value = actions.some(function (item) { return item.action === preferred; }) ? preferred : actions[0].action;
    actionChanged();
  }
  function actionSpec(name) {
    return (capabilities && capabilities.readOnlyActions || []).find(function (item) { return item.action === name; }) || null;
  }
  function defaultParamsForSpec(spec) {
    var params = {};
    specList(spec, "requiredParams", "required_params").forEach(function (key) {
      if (/tags$/.test(key)) params[key] = ["#"];
      else if (/tag$/.test(key)) params[key] = "#";
      else if (/^(?:location|league)_id$/.test(key)) params[key] = 0;
      else params[key] = "";
    });
    return params;
  }
  function actionChanged() {
    var name = $("cocAction").value, spec = actionSpec(name), defaults = ACTION_DEFAULTS[currentKind];
    $("cocParams").value = JSON.stringify(defaults && defaults.action === name ? defaults.params || {} : defaultParamsForSpec(spec), null, 2);
    $("cocActionHelp").textContent = spec ? "可用参数：" + (specList(spec, "allowedParams", "allowed_params").join("、") || "无") + "；必填：" + (specList(spec, "requiredParams", "required_params").join("、") || "无") + (spec.notes ? "。" + spec.notes : "") : "";
  }
  function setKind(kind) {
    if (LIVE_KINDS.indexOf(kind) < 0) return;
    currentKind = kind;
    document.querySelectorAll("[data-live-kind]").forEach(function (button) {
      var selected = button.getAttribute("data-live-kind") === kind;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    $("cocPlayerFields").hidden = kind !== "player";
    $("cocClanFields").hidden = kind !== "clan";
    $("cocAdvancedFields").hidden = kind !== "advanced";
    if (capabilities && kind === "advanced") {
      var preferred = ACTION_DEFAULTS[kind] && ACTION_DEFAULTS[kind].action;
      if ((capabilities.readOnlyActions || []).some(function (item) { return item.action === preferred; })) $("cocAction").value = preferred;
      actionChanged();
    }
  }
  function handleKindKeydown(event) {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].indexOf(event.key) < 0) return;
    var buttons = Array.prototype.slice.call(document.querySelectorAll("[data-live-kind]"));
    var current = buttons.indexOf(event.currentTarget);
    if (current < 0 || !buttons.length) return;
    event.preventDefault();
    var next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 :
      (current + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    var button = buttons[next];
    setKind(button.getAttribute("data-live-kind"));
    button.focus();
  }
  function parseParams() {
    var text = $("cocParams").value.trim();
    if (!text) return {};
    var value = JSON.parse(text); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("参数必须是 JSON 对象"); return value;
  }
  function setFriendlyMessage(text, tone) {
    var container = $("cocFriendlyResult");
    container.textContent = "";
    var paragraph = document.createElement("p");
    paragraph.className = "coc-friendly-empty" + (tone === "error" ? " is-error" : "");
    paragraph.textContent = text;
    container.appendChild(paragraph);
  }
  function setResultBusy(busy) {
    $("cocFriendlyResult").setAttribute("aria-busy", String(Boolean(busy)));
  }
  function resetResultState(meta) {
    lastResult = null;
    lastAction = "";
    $("cocResult").textContent = "";
    $("cocRawJsonDetails").open = false;
    $("cocResultMeta").textContent = meta || "尚未查询";
    $("cocImportPlayer").hidden = true;
    $("cocCopyResult").disabled = true;
    $("cocDownloadResult").disabled = true;
    setResultBusy(false);
  }
  function invokeQuery(action, params, button) {
    var generation = ++queryGeneration;
    var queryTransport = transport;
    var queryConnectionGeneration = connectionGeneration;
    if (button) button.disabled = true;
    $("cocLiveError").textContent = "";
    resetResultState("正在查询…");
    setResultBusy(true);
    setFriendlyMessage("正在查询，请稍候…");
    var ready = capabilities ? Promise.resolve() : connect();
    return ready.then(function () {
      if (generation !== queryGeneration || queryTransport !== transport || queryConnectionGeneration !== connectionGeneration) return STALE_QUERY;
      if (!actionSpec(action)) throw new Error("该查询动作不在云端白名单中");
      return queryTransport === "local"
        ? desktopRpc({ operation: "query.invoke", action: action, params: params })
        : cloudRequest("/api/coc/query", { method: "POST", body: JSON.stringify({ action: action, params: params }) }, true);
    }).then(function (result) {
      if (result === STALE_QUERY || generation !== queryGeneration || queryTransport !== transport || queryConnectionGeneration !== connectionGeneration) return result;
      showResult(result, action);
      setStatus(queryTransport === "local" ? "本机查询完成" : "云端实时查询可用", "ok");
      return result;
    }).catch(function (error) {
      if (generation !== queryGeneration || queryTransport !== transport || queryConnectionGeneration !== connectionGeneration || error && error.staleConnection) return;
      resetResultState("查询失败");
      setFriendlyMessage(errorText(error), "error");
      $("cocLiveError").textContent = errorText(error);
      setStatus("查询失败", "error");
    }).finally(function () { if (button) button.disabled = false; });
  }
  function queryAdvanced() {
    var action = $("cocAction").value, params;
    try { params = parseParams(); } catch (error) {
      resetResultState("查询未开始");
      setFriendlyMessage(error.message, "error");
      $("cocLiveError").textContent = error.message;
      $("cocParams").focus();
      return;
    }
    invokeQuery(action, params, $("cocRun"));
  }
  function queryTag(kind) {
    var player = kind === "player", input = $(player ? "cocPlayerTag" : "cocClanTag"), button = $(player ? "cocQueryPlayer" : "cocQueryClan"), tag;
    if (button.disabled) return;
    try {
      tag = normalizeCocTag(input.value, player ? "玩家标签" : "部落标签");
    } catch (error) {
      resetResultState("查询未开始");
      $("cocLiveError").textContent = error.message;
      setFriendlyMessage(error.message, "error");
      input.focus();
      return;
    }
    input.value = tag;
    invokeQuery(player ? "get_player" : "get_clan", player ? { player_tag: tag } : { tag: tag }, button);
  }
  function valueAt(object, path) {
    return String(path || "").split(".").reduce(function (value, key) {
      return value != null && typeof value === "object" ? value[key] : undefined;
    }, object);
  }
  function firstValue(object, paths) {
    for (var i = 0; i < paths.length; i += 1) {
      var value = valueAt(object, paths[i]);
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return undefined;
  }
  function namedValue(value) {
    if (value && typeof value === "object") return firstValue(value, ["name", "tag"]);
    return value;
  }
  function playerLeagueTierName(data) {
    var name = valueAt(data, "leagueTier.name");
    return typeof name === "string" && name.trim() ? name.trim() : "尚未参加排位";
  }
  function displayPlayerLeagueTierName(data) {
    var raw = playerLeagueTierName(data), legend = { "Legend III": "传奇3", "Legend II": "传奇2", "Legend I": "传奇1" };
    if (legend[raw]) return legend[raw];
    var families = [
      ["Skeleton", "骷髅兵"], ["Barbarian", "野蛮人"], ["Archer", "弓箭手"], ["Wizard", "法师"],
      ["Valkyrie", "瓦基丽武神"], ["Witch", "女巫"], ["Golem", "戈仑石人"], ["P.E.K.K.A", "皮卡超人"],
      ["Titan", "泰坦"], ["Dragon", "飞龙"], ["Electro", "雷龙"]
    ];
    for (var i = 0; i < families.length; i += 1) {
      var prefix = families[i][0], localized = families[i][1];
      if (raw === prefix) return localized;
      if (raw.indexOf(prefix + " League ") === 0) return localized + " " + raw.slice((prefix + " League ").length);
      if (raw.indexOf(prefix + " ") === 0) return localized + " " + raw.slice((prefix + " ").length);
    }
    return raw;
  }
  function clanCapitalHallLevel(data) {
    return valueAt(data, "clanCapital.capitalHallLevel");
  }
  function safeHttpsUrl(value) {
    try {
      var source = String(value || "");
      if (!source || source.length > 2048) return "";
      var parsed = new URL(source);
      return parsed.protocol === "https:" && parsed.hostname === "api-assets.clashofclans.com" && !parsed.port && !parsed.username && !parsed.password ? parsed.href : "";
    } catch (_error) { return ""; }
  }
  function element(tagName, className, text) {
    var node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function appendAvatar(parent, imageUrl, fallbackText) {
    var shell = element("div", "coc-profile-avatar");
    var fallback = element("span", "coc-profile-avatar-fallback", String(fallbackText || "?").trim().charAt(0) || "?");
    shell.appendChild(fallback);
    var url = safeHttpsUrl(imageUrl);
    if (url) {
      var image = document.createElement("img");
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      image.hidden = true;
      image.addEventListener("load", function () { image.hidden = false; fallback.hidden = true; }, { once: true });
      image.addEventListener("error", function () { image.hidden = true; fallback.hidden = false; }, { once: true });
      image.src = url;
      shell.appendChild(image);
    }
    parent.appendChild(shell);
  }
  function appendStat(grid, label, value) {
    value = namedValue(value);
    if (value === undefined || value === null || value === "") return;
    var item = element("div", "coc-profile-stat");
    item.appendChild(element("span", "coc-profile-stat-label", label));
    item.appendChild(element("strong", "coc-profile-stat-value", value));
    grid.appendChild(item);
  }
  function playerClan(data) {
    var clan = valueAt(data, "clan");
    if (!clan || typeof clan !== "object") return null;
    var tag = normalizedLinkedTag(clan.tag, "部落标签");
    return tag ? Object.assign({}, clan, { tag: tag }) : null;
  }
  function clanMembers(data) {
    var members = firstValue(data, ["memberList", "member_list"]);
    return Array.isArray(members) ? members.reduce(function (clean, member) {
      if (!member || typeof member !== "object") return clean;
      var tag = normalizedLinkedTag(member.tag, "玩家标签");
      if (tag) clean.push(Object.assign({}, member, { tag: tag }));
      return clean;
    }, []) : [];
  }
  function openLinkedQuery(kind, tag) {
    var player = kind === "player", input = $(player ? "cocPlayerTag" : "cocClanTag");
    try {
      input.value = normalizeCocTag(tag, player ? "玩家标签" : "部落标签");
    } catch (error) {
      $("cocLiveError").textContent = error.message;
      input.focus();
      return;
    }
    setKind(kind);
    try { input.focus({ preventScroll: true }); } catch (_error) { input.focus(); }
    queryTag(kind);
  }
  function appendDrilldownStat(grid, label, value, kind, tag) {
    var button = element("button", "coc-profile-stat coc-profile-drilldown");
    button.type = "button";
    button.setAttribute("data-query-kind", kind);
    button.setAttribute("data-query-tag", tag);
    button.setAttribute("aria-label", "查询" + (kind === "player" ? "玩家" : "部落") + " " + value);
    button.appendChild(element("span", "coc-profile-stat-label", label));
    button.appendChild(element("strong", "coc-profile-stat-value", value));
    button.appendChild(element("span", "coc-profile-drilldown-hint", "点击查看详情"));
    button.addEventListener("click", function () { openLinkedQuery(kind, tag); });
    grid.appendChild(button);
  }
  function appendProfileHeader(card, data, imageUrl, eyebrow) {
    var header = element("div", "coc-profile-head");
    appendAvatar(header, imageUrl, firstValue(data, ["name", "tag"]) || "?");
    var copy = element("div", "coc-profile-identity");
    copy.appendChild(element("span", "coc-profile-eyebrow", eyebrow));
    copy.appendChild(element("h3", "coc-profile-name", firstValue(data, ["name"]) || "未命名"));
    copy.appendChild(element("p", "coc-profile-tag", firstValue(data, ["tag"]) || "—"));
    header.appendChild(copy);
    card.appendChild(header);
  }
  function localizedClanType(value) {
    var types = { open: "任何人均可加入", inviteOnly: "需要邀请", closed: "不开放" };
    return types[value] || value;
  }
  function renderPlayer(container, data) {
    var card = element("section", "coc-profile-card");
    card.setAttribute("data-result-kind", "player");
    var leagueTier = valueAt(data, "leagueTier");
    var avatarUrl = firstValue(data, ["leagueTier.iconUrls.small", "leagueTier.iconUrls.large", "leagueTier.icon_urls.small", "leagueTier.icon_urls.large"]);
    appendProfileHeader(card, data, avatarUrl, "玩家公开资料");
    var grid = element("div", "coc-profile-stats");
    appendStat(grid, "经验等级", firstValue(data, ["expLevel", "exp_level"]));
    var townHall = firstValue(data, ["townHallLevel", "town_hall_level"]);
    var weapon = firstValue(data, ["townHallWeaponLevel", "town_hall_weapon_level"]);
    appendStat(grid, "大本营", townHall === undefined ? undefined : (String(townHall) + (weapon === undefined ? "" : " · 武器 " + weapon + " 级")));
    appendStat(grid, "当前奖杯", firstValue(data, ["trophies"]));
    appendStat(grid, "最高奖杯", firstValue(data, ["bestTrophies", "best_trophies"]));
    appendStat(grid, "个人排位联赛（新版）", displayPlayerLeagueTierName(data));
    var clan = playerClan(data);
    if (clan) appendDrilldownStat(grid, "所属部落", (namedValue(clan) || "—") + " · " + clan.tag, "clan", clan.tag);
    else appendStat(grid, "所属部落", "未加入部落");
    appendStat(grid, "战争之星", firstValue(data, ["warStars", "war_stars"]));
    appendStat(grid, "赛季进攻胜场", firstValue(data, ["attackWins", "attack_wins"]));
    appendStat(grid, "赛季防守胜场", firstValue(data, ["defenseWins", "defense_wins"]));
    appendStat(grid, "捐兵", firstValue(data, ["donations"]));
    appendStat(grid, "收兵", firstValue(data, ["donationsReceived", "received"]));
    appendStat(grid, "建筑大师奖杯", firstValue(data, ["builderBaseTrophies", "versusTrophies", "builder_base_trophies"]));
    appendStat(grid, "建筑大师联赛", firstValue(data, ["builderBaseLeague.name", "builder_base_league.name"]));
    appendStat(grid, "都城贡献", firstValue(data, ["clanCapitalContributions", "clan_capital_contributions"]));
    card.appendChild(grid);
    container.appendChild(card);
  }
  function renderClan(container, data) {
    var card = element("section", "coc-profile-card");
    card.setAttribute("data-result-kind", "clan");
    appendProfileHeader(card, data, firstValue(data, ["badgeUrls.medium", "badgeUrls.small", "badge_urls.medium", "badge_urls.small"]), "部落公开资料");
    var grid = element("div", "coc-profile-stats");
    appendStat(grid, "部落等级", firstValue(data, ["clanLevel", "level", "clan_level"]));
    var members = firstValue(data, ["members"]);
    appendStat(grid, "成员", members === undefined ? undefined : members + " / 50");
    appendStat(grid, "加入类型", localizedClanType(firstValue(data, ["type"])));
    appendStat(grid, "所需奖杯", firstValue(data, ["requiredTrophies", "required_trophies"]));
    appendStat(grid, "部落总奖杯", firstValue(data, ["clanPoints", "points", "clan_points"]));
    appendStat(grid, "建筑大师总奖杯", firstValue(data, ["clanBuilderBasePoints", "versusPoints", "clan_builder_base_points"]));
    appendStat(grid, "都城总奖杯", firstValue(data, ["clanCapitalPoints", "capital_points"]));
    appendStat(grid, "都城联赛", firstValue(data, ["capitalLeague.name", "capital_league.name"]));
    appendStat(grid, "所在地区", firstValue(data, ["location.name"]));
    appendStat(grid, "所需大本营", firstValue(data, ["requiredTownhallLevel", "required_townhall_level"]));
    appendStat(grid, "战争频率", firstValue(data, ["warFrequency", "war_frequency"]));
    appendStat(grid, "战争胜场", firstValue(data, ["warWins", "war_wins"]));
    appendStat(grid, "战争负场", firstValue(data, ["warLosses", "war_losses"]));
    appendStat(grid, "战争平局", firstValue(data, ["warTies", "war_ties"]));
    appendStat(grid, "当前连胜", firstValue(data, ["warWinStreak", "war_win_streak"]));
    appendStat(grid, "战争联赛", firstValue(data, ["warLeague.name", "war_league.name"]));
    appendStat(grid, "都城大本营", clanCapitalHallLevel(data));
    card.appendChild(grid);
    var description = firstValue(data, ["description"]);
    if (description) card.appendChild(element("p", "coc-profile-description", description));
    var memberList = clanMembers(data);
    var memberSection = element("section", "coc-member-section");
    memberSection.appendChild(element("h4", "coc-member-title", "成员概况"));
    memberSection.appendChild(element("p", "coc-member-help", memberList.length ? "共 " + memberList.length + " 位成员，点击任意成员查看完整玩家资料。" : "官方接口没有返回成员列表。"));
    if (memberList.length) {
      var list = element("ol", "coc-member-list");
      memberList.forEach(function (member) {
        var item = element("li", "coc-member-item");
        var button = element("button", "coc-member-button");
        var memberName = firstValue(member, ["name"]) || "未命名成员";
        var memberTag = firstValue(member, ["tag"]);
        button.type = "button";
        button.setAttribute("data-query-kind", "player");
        button.setAttribute("data-query-tag", memberTag);
        button.setAttribute("aria-label", "查询玩家 " + memberName + " " + memberTag);
        appendAvatar(button, firstValue(member, ["leagueTier.iconUrls.small", "leagueTier.iconUrls.large", "leagueTier.icon_urls.small", "leagueTier.icon_urls.large"]), memberName);
        var identity = element("span", "coc-member-identity");
        identity.appendChild(element("strong", "coc-member-name", memberName));
        identity.appendChild(element("span", "coc-member-tag", memberTag));
        var role = { leader: "首领", coLeader: "副首领", admin: "长老", member: "成员" }[firstValue(member, ["role"])] || "成员";
        var townHall = firstValue(member, ["townHallLevel", "town_hall_level"]);
        identity.appendChild(element("span", "coc-member-meta", role + (townHall === undefined ? "" : " · " + townHall + " 本") + " · " + displayPlayerLeagueTierName(member)));
        button.appendChild(identity);
        var overview = element("span", "coc-member-overview");
        var rank = firstValue(member, ["clanRank", "clan_rank"]);
        var trophies = firstValue(member, ["trophies"]);
        var donations = firstValue(member, ["donations"]);
        overview.appendChild(element("span", "", rank === undefined ? "成员" : "第 " + rank + " 名"));
        if (trophies !== undefined) overview.appendChild(element("span", "", "奖杯 " + trophies));
        if (donations !== undefined) overview.appendChild(element("span", "", "捐兵 " + donations));
        button.appendChild(overview);
        button.addEventListener("click", function () { openLinkedQuery("player", memberTag); });
        item.appendChild(button);
        list.appendChild(item);
      });
      memberSection.appendChild(list);
    }
    card.appendChild(memberSection);
    container.appendChild(card);
  }
  function genericLabel(key) {
    var labels = { name: "名称", tag: "标签", items: "结果", paging: "分页", location: "地区", league: "联赛", season: "赛季", members: "成员", status: "状态", type: "类型" };
    return labels[key] || String(key).replace(/_/g, " ");
  }
  function genericDisplay(value) {
    if (Array.isArray(value)) return value.length + " 项";
    if (value && typeof value === "object") return namedValue(value) || (Object.keys(value).length + " 个字段");
    if (value === true) return "是";
    if (value === false) return "否";
    return value;
  }
  function renderGeneric(container, data, action) {
    var card = element("section", "coc-profile-card");
    card.setAttribute("data-result-kind", "advanced");
    card.appendChild(element("span", "coc-profile-eyebrow", "开发者高级查询摘要"));
    card.appendChild(element("h3", "coc-profile-name", action || "查询结果"));
    var grid = element("div", "coc-profile-stats");
    if (data && typeof data === "object" && !Array.isArray(data)) {
      Object.keys(data).slice(0, 16).forEach(function (key) { appendStat(grid, genericLabel(key), genericDisplay(data[key])); });
    } else appendStat(grid, "结果", genericDisplay(data));
    if (!grid.children.length) appendStat(grid, "结果", "没有可显示的字段");
    card.appendChild(grid);
    container.appendChild(card);
  }
  function payloadFrom(result) {
    if (result && result._raw_data) return result._raw_data;
    if (result && result.raw) return result.raw;
    if (result && result.data && result.data.tag) return result.data;
    return result;
  }
  function renderFriendlyResult(result, action) {
    var container = $("cocFriendlyResult"), data = payloadFrom(result);
    container.textContent = "";
    if (action === "get_player" && data && typeof data === "object") renderPlayer(container, data);
    else if (action === "get_clan" && data && typeof data === "object") renderClan(container, data);
    else renderGeneric(container, data, action);
  }
  function showResult(result, action) {
    lastResult = result; lastAction = action;
    $("cocResult").textContent = JSON.stringify(result, null, 2);
    $("cocRawJsonDetails").open = false;
    renderFriendlyResult(result, action);
    var labels = { get_player: "玩家资料", get_clan: "部落资料" };
    $("cocResultMeta").textContent = (labels[action] || action) + " · " + new Date().toLocaleString("zh-CN");
    $("cocImportPlayer").hidden = action !== "get_player" || !result;
    $("cocCopyResult").disabled = !result;
    $("cocDownloadResult").disabled = !result;
    setResultBusy(false);
  }
  function resultPayload() {
    return payloadFrom(lastResult);
  }
  function importPlayer() {
    try {
      if (!window.TianzeCocSnapshot) throw new Error("快照模块没有加载");
      var units = window.__TIANZE_COC_STATIC_UNITS__; if (!Array.isArray(units)) throw new Error("静态游戏目录尚未加载，请稍后重试");
      var raw = resultPayload(), incoming = window.TianzeCocSnapshot.fromOfficialPlayer(raw, units);
      var existing = window.TianzeCocSnapshot.load(), merged = existing ? window.TianzeCocSnapshot.mergeSnapshots(existing, incoming) : incoming;
      window.TianzeCocSnapshot.save(merged);
      $("cocLiveError").textContent = "玩家公开资料已保存为 v2 快照。" + (merged.coverage.buildings ? "已与原有完整账号数据无损合并。" : "官方接口不含建筑与工人，规划器会明确按部分资料运行。") + " 未识别单位 " + (merged.unknownEntities || []).length + " 个。";
      $("cocOpenParser").hidden = false;
      $("cocOpenPlanner").hidden = false;
    } catch (error) { $("cocLiveError").textContent = error.message; }
  }
  function copyResult() {
    if (!lastResult) return;
    var text = JSON.stringify(lastResult, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { $("cocLiveError").textContent = "查询结果 JSON 已复制。"; }, function () { fallbackCopy(text); });
    else fallbackCopy(text);
  }
  function fallbackCopy(text) { var area = document.createElement("textarea"); area.value = text; area.style.position = "fixed"; area.style.opacity = "0"; document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove(); $("cocLiveError").textContent = "查询结果 JSON 已复制。"; }
  function downloadResult() {
    if (!lastResult) return; var blob = new Blob([JSON.stringify(lastResult, null, 2) + "\n"], { type: "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob), anchor = document.createElement("a"); anchor.href = url; anchor.download = "COC-" + (lastAction || "query") + "-" + Date.now() + ".json"; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function toggleTransport() {
    if (!desktopBridge("cocQuery")) return;
    queryGeneration += 1;
    connectionGeneration += 1;
    transport = transport === "cloud" ? "local" : "cloud"; connected = false; capabilities = null; connectionPromise = null;
    resetResultState("尚未查询");
    setFriendlyMessage("切换完成后，请重新查询玩家或部落资料。");
    $("cocUseLocal").textContent = transport === "local" ? "改用天择云端" : "改用本机服务";
    $("cocConnect").textContent = transport === "local" ? "重新连接本机" : "重新连接云端";
    connect().catch(function () {});
  }
  function switchSource(source) {
    var live = source === "live"; $("dqStaticPanel").hidden = live; $("cocLivePanel").hidden = !live;
    document.querySelectorAll("[data-coc-source]").forEach(function (button) { button.setAttribute("aria-selected", String(button.getAttribute("data-coc-source") === source)); });
    if (live && !connected) connect().catch(function () {});
  }
  function init() {
    if (!$("cocLivePanel")) return;
    var localButton = $("cocUseLocal"); localButton.hidden = !desktopBridge("cocQuery");
    if (!localButton.hidden) { localButton.textContent = "改用本机服务"; $("cocConnect").textContent = "重新连接云端"; }
    document.querySelectorAll("[data-coc-source]").forEach(function (button) { button.addEventListener("click", function () { switchSource(button.getAttribute("data-coc-source")); }); });
    document.querySelectorAll("[data-live-kind]").forEach(function (button) {
      button.addEventListener("click", function () { setKind(button.getAttribute("data-live-kind")); });
      button.addEventListener("keydown", handleKindKeydown);
    });
    $("cocConnect").addEventListener("click", function () { connect().catch(function () {}); }); localButton.addEventListener("click", toggleTransport);
    $("cocAction").addEventListener("change", actionChanged); $("cocRun").addEventListener("click", queryAdvanced); $("cocCopyResult").addEventListener("click", copyResult); $("cocDownloadResult").addEventListener("click", downloadResult); $("cocImportPlayer").addEventListener("click", importPlayer);
    $("cocQueryPlayer").addEventListener("click", function () { queryTag("player"); });
    $("cocQueryClan").addEventListener("click", function () { queryTag("clan"); });
    [$("cocPlayerTag"), $("cocClanTag")].forEach(function (input) {
      input.addEventListener("blur", function () { normalizeTagInput(input); });
      input.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        queryTag(input.id === "cocClanTag" ? "clan" : "player");
      });
    });
    resetResultState("尚未查询");
    setKind("player");
  }
  window.__cocLiveQueryTest = {
    CLOUD_ROOT: CLOUD_ROOT,
    specList: specList,
    defaultParamsForSpec: defaultParamsForSpec,
    safeActions: safeActions,
    normalizeCocTag: normalizeCocTag,
    safeHttpsUrl: safeHttpsUrl,
    payloadFrom: payloadFrom,
    playerLeagueTierName: playerLeagueTierName,
    displayPlayerLeagueTierName: displayPlayerLeagueTierName,
    clanCapitalHallLevel: clanCapitalHallLevel,
    playerClan: playerClan,
    clanMembers: clanMembers,
    renderFriendlyResult: renderFriendlyResult,
    cloudErrorRetryable: cloudErrorRetryable,
    errorText: errorText
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
