/* 达尔文小屋官网：赛事数据渲染、计分、倒计时与双部落实时战况。 */
(function (root) {
  "use strict";

  var CLOUD_ROOT = "https://tianze-coc-query.xia-xilin-sgy.workers.dev";
  var EVENT_REFRESH_MS = 60 * 1000;
  var WAR_REFRESH_MS = 5 * 60 * 1000;
  var CLANS = [
    { label: "本部", name: "达尔文小屋", tag: "#2C9UC88CJ" },
    { label: "二部", name: "达尔文小屋二部", tag: "#2CLVRURJC" }
  ];
  var WAR_STATES = {
    notInWar: "当前没有进行中的部落战",
    matchmaking: "正在匹配",
    preparation: "准备日",
    inWar: "战斗日",
    warEnded: "对战已结束",
    ended: "对战已结束",
    groupNotFound: "未找到联赛小组"
  };
  var warBusy = false;
  var lastWarFetch = 0;
  var toastTimer = 0;

  function byId(id) { return document.getElementById(id); }
  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function normalizeTag(value) { return String(value || "").trim().toUpperCase().replace(/^#+/, "#"); }
  function finite(value, fallback) { var number = Number(value); return Number.isFinite(number) ? number : fallback; }
  function percent(value) {
    var number = finite(value, 0);
    return number.toLocaleString("zh-CN", { maximumFractionDigits: 2 }) + "%";
  }
  function showToast(message) {
    var toast = byId("darwinToast");
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    root.clearTimeout(toastTimer);
    toastTimer = root.setTimeout(function () { toast.hidden = true; }, 2300);
  }

  function bindCopyButtons() {
    document.querySelectorAll("[data-copy-tag]").forEach(function (button) {
      button.addEventListener("click", function () {
        var tag = button.getAttribute("data-copy-tag");
        var task = root.navigator && root.navigator.clipboard && root.isSecureContext
          ? root.navigator.clipboard.writeText(tag)
          : Promise.reject(new Error("clipboard unavailable"));
        task.then(function () { showToast("已复制部落标签 " + tag); }).catch(function () {
          var field = document.createElement("textarea");
          field.value = tag;
          field.style.position = "fixed";
          field.style.opacity = "0";
          document.body.appendChild(field);
          field.select();
          var copied = false;
          try { copied = document.execCommand("copy"); } catch (_error) {}
          field.remove();
          showToast(copied ? "已复制部落标签 " + tag : "部落标签：" + tag);
        });
      });
    });
  }

  function formatCalendarDate(value) {
    if (!value) return "未标注";
    var date = new Date(value.length === 10 ? value + "T00:00:00+08:00" : value);
    if (!Number.isFinite(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(date);
  }

  function countdownParts(milliseconds) {
    var totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    var days = Math.floor(totalSeconds / 86400);
    var hours = Math.floor(totalSeconds % 86400 / 3600);
    var minutes = Math.floor(totalSeconds % 3600 / 60);
    var seconds = totalSeconds % 60;
    return days + " 天 " + String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
  }

  function updateCupClock() {
    var now = Date.now();
    var registrationClose = new Date("2026-09-03T12:00:00+08:00").getTime();
    var starts = new Date("2026-09-03T16:00:00+08:00").getTime();
    var ends = new Date("2026-09-11T16:00:00+08:00").getTime();
    var label = byId("cupClockLabel");
    var countdown = byId("cupCountdown");
    var phase = byId("cupPhase");
    if (!label || !countdown || !phase) return;
    if (now < registrationClose) {
      label.textContent = "距离报名截止";
      countdown.textContent = countdownParts(registrationClose - now);
      phase.textContent = "报名进行中";
    } else if (now < starts) {
      label.textContent = "距离比赛开始";
      countdown.textContent = countdownParts(starts - now);
      phase.textContent = "报名已经截止";
    } else if (now < ends) {
      label.textContent = "距离比赛结束";
      countdown.textContent = countdownParts(ends - now);
      phase.textContent = "比赛进行中";
    } else {
      label.textContent = "本届比赛";
      countdown.textContent = "已经结束";
      phase.textContent = "等待公布最终成绩";
    }
  }

  function rosterNode(entrants) {
    if (!entrants.length) return element("p", "darwin-empty", "本组暂时无人报名");
    var list = element("ol", "darwin-roster");
    entrants.slice().sort(function (left, right) {
      return finite(left.registrationOrder, 9999) - finite(right.registrationOrder, 9999);
    }).forEach(function (entrant) {
      var item = element("li");
      item.appendChild(element("em", "", String(entrant.registrationOrder).padStart(2, "0")));
      item.appendChild(element("strong", "", entrant.nickname));
      item.appendChild(element("span", "", entrant.townHall + " 本"));
      list.appendChild(item);
    });
    return list;
  }

  function rankingNode(rows) {
    if (!rows.length) return element("p", "darwin-empty", "本组暂时没有排名数据");
    var wrapper = element("div", "darwin-ranking-wrap");
    var table = element("table", "darwin-ranking");
    table.setAttribute("aria-label", "达尔文杯实时得分排名");
    var head = element("thead");
    var headRow = element("tr");
    ["名次", "账号", "星", "摧毁率", "对局"].forEach(function (label) { headRow.appendChild(element("th", "", label)); });
    head.appendChild(headRow);
    table.appendChild(head);
    var body = element("tbody");
    rows.forEach(function (row) {
      var tr = element("tr");
      tr.appendChild(element("td", "", row.rank === null ? "—" : String(row.rank)));
      var name = element("td");
      name.appendChild(element("strong", "", row.entrant.nickname));
      name.appendChild(element("small", "", row.hasResult ? row.entrant.townHall + " 本" : row.entrant.townHall + " 本 · 尚未比赛"));
      tr.appendChild(name);
      tr.appendChild(element("td", "", String(row.stars)));
      tr.appendChild(element("td", "", percent(row.destruction)));
      tr.appendChild(element("td", "", String(row.matches)));
      body.appendChild(tr);
    });
    table.appendChild(body);
    wrapper.appendChild(table);
    return wrapper;
  }

  function attackChip(side, attack, index) {
    var chip = element("span");
    chip.textContent = (attack.adjusted ? "计入 " : "") + attack.stars + " 星 " + percent(attack.destruction);
    var detail = side.entrant.nickname + "第 " + (index + 1) + " 次 · ";
    detail += attack.adjusted
      ? "实际 " + attack.actualStars + " 星 " + percent(attack.actualDestruction)
      : attack.difficulty;
    chip.appendChild(element("small", "", detail));
    return chip;
  }

  function matchLogNode(matches, entrants) {
    if (!matches.length) return element("p", "darwin-empty", "本组尚无已登记的正式对局");
    var scoring = root.DarwinCupScoring;
    var log = element("div", "darwin-match-log");
    matches.forEach(function (match) {
      var scored = scoring.scoreMatch(match, entrants);
      var card = element("article", "darwin-match-card");
      var header = element("header");
      header.appendChild(element("strong", "", scored.left.entrant.nickname + " × " + scored.right.entrant.nickname));
      header.appendChild(element("span", "", scored.playedAt ? formatCalendarDate(scored.playedAt) : "已完成"));
      card.appendChild(header);
      var score = element("div", "darwin-match-score");
      var left = element("div", "darwin-match-side");
      left.appendChild(element("strong", "", scored.left.entrant.nickname));
      left.appendChild(element("span", "", scored.left.entrant.townHall + " 本"));
      score.appendChild(left);
      var total = element("div", "darwin-match-total");
      total.appendChild(element("b", "", scored.left.stars + " : " + scored.right.stars));
      total.appendChild(element("small", "", percent(scored.left.destruction) + " · " + percent(scored.right.destruction)));
      score.appendChild(total);
      var right = element("div", "darwin-match-side");
      right.appendChild(element("strong", "", scored.right.entrant.nickname));
      right.appendChild(element("span", "", scored.right.entrant.townHall + " 本"));
      score.appendChild(right);
      card.appendChild(score);
      var attacks = element("div", "darwin-attack-lines");
      scored.left.attacks.forEach(function (attack, index) { attacks.appendChild(attackChip(scored.left, attack, index)); });
      scored.right.attacks.forEach(function (attack, index) { attacks.appendChild(attackChip(scored.right, attack, index)); });
      card.appendChild(attacks);
      log.appendChild(card);
    });
    return log;
  }

  function renderEventData(data) {
    var scoring = root.DarwinCupScoring;
    if (!scoring) throw new Error("赛事计分模块没有加载");
    var errors = scoring.validateData(data);
    if (errors.length) throw new Error(errors[0]);
    ["low", "middle", "high"].forEach(function (groupId) {
      var group = document.querySelector('[data-group="' + groupId + '"]');
      if (!group) return;
      var entrants = data.entrants.filter(function (entrant) { return entrant.group === groupId; });
      var matches = data.matches.filter(function (match) { return match.group === groupId && match.status !== "void"; });
      group.querySelector("[data-group-count]").textContent = String(entrants.length);
      group.querySelector("[data-match-count]").textContent = String(matches.length);
      group.querySelector("[data-roster]").replaceChildren(rosterNode(entrants));
      group.querySelector("[data-ranking]").replaceChildren(rankingNode(scoring.standingsFor(groupId, data.entrants, data.matches)));
      group.querySelector("[data-match-log]").replaceChildren(matchLogNode(matches, data.entrants));
    });
    byId("cupUpdatedAt").textContent = "赛事数据更新于 " + formatCalendarDate(data.updatedAt) + " · 每分钟检查更新";
  }

  function loadEventData() {
    if (document.visibilityState === "hidden") return Promise.resolve();
    return root.fetch("event-data.json?time=" + Date.now(), { cache: "no-store", credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) throw new Error("赛事数据读取失败（" + response.status + "）");
        return response.json();
      })
      .then(renderEventData)
      .catch(function (error) {
        var status = byId("cupUpdatedAt");
        if (status) status.textContent = "赛事数据暂时无法读取：" + error.message;
      });
  }

  function parseCocDate(value) {
    var raw = String(value || "");
    var match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:\.\d+)?Z$/);
    if (match) raw = match[1] + "-" + match[2] + "-" + match[3] + "T" + match[4] + ":" + match[5] + ":" + match[6] + "Z";
    var date = new Date(raw);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  function formatCocDate(value) {
    var date = parseCocDate(value);
    if (!date) return "未提供";
    return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  }
  function remaining(value) {
    var date = parseCocDate(value);
    if (!date) return "结束时间未提供";
    var difference = date.getTime() - Date.now();
    if (difference <= 0) return "已经结束";
    var hours = Math.floor(difference / 3600000);
    var minutes = Math.floor(difference % 3600000 / 60000);
    return hours > 0 ? "剩余 " + hours + " 小时 " + minutes + " 分钟" : "剩余 " + minutes + " 分钟";
  }
  function teamAttacks(team) {
    if (Number.isFinite(Number(team && team.attacks))) return Number(team.attacks);
    return (team && Array.isArray(team.members) ? team.members : []).reduce(function (count, member) {
      return count + (Array.isArray(member.attacks) ? member.attacks.length : finite(member.attacks, 0));
    }, 0);
  }
  function unwrapWar(value, key) {
    if (!value || typeof value !== "object") return value;
    var war = value.data || value.result || value.value || value.war || value;
    if (war && typeof war === "object" && key && !war.requestedTag) war.requestedTag = normalizeTag(key);
    return war;
  }
  function normalizeWarPayload(payload) {
    var rows = [];
    if (Array.isArray(payload)) rows = payload.map(function (value) { return unwrapWar(value); });
    else if (payload && (payload.state || payload.clan || payload.opponent)) rows = [unwrapWar(payload)];
    else if (payload && Array.isArray(payload.items)) rows = payload.items.map(function (value) { return unwrapWar(value); });
    else if (payload && Array.isArray(payload.results)) rows = payload.results.map(function (value) { return unwrapWar(value); });
    else if (payload && Array.isArray(payload.data)) rows = payload.data.map(function (value) { return unwrapWar(value); });
    else if (payload && typeof payload === "object") {
      Object.keys(payload).forEach(function (key) {
        if (key !== "meta" && key !== "pagination") rows.push(unwrapWar(payload[key], key));
      });
    }
    return rows.filter(function (row) { return row && typeof row === "object"; });
  }
  function warForClan(rows, clan, index) {
    var tag = normalizeTag(clan.tag);
    return rows.find(function (war) {
      return normalizeTag(war.requestedTag) === tag || normalizeTag(war.clan && war.clan.tag) === tag || normalizeTag(war.opponent && war.opponent.tag) === tag;
    }) || rows[index] || null;
  }
  function ownTeams(war, clanTag) {
    var clan = war && war.clan || {};
    var opponent = war && war.opponent || {};
    return normalizeTag(opponent.tag) === normalizeTag(clanTag) ? { own: opponent, other: clan } : { own: clan, other: opponent };
  }

  function renderWarCard(clan, war) {
    var card = element("article", "darwin-war-card");
    card.setAttribute("data-clan-tag", clan.tag);
    var top = element("header", "darwin-war-top");
    var identity = element("div");
    identity.appendChild(element("small", "", clan.label));
    identity.appendChild(element("h3", "", clan.name));
    var link = element("a", "", clan.tag);
    link.href = "https://link.clashofclans.com/en?action=OpenClanProfile&tag=" + encodeURIComponent(clan.tag);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    identity.appendChild(link);
    top.appendChild(identity);
    var state = war && (WAR_STATES[war.state] || war.state) || "无法读取";
    top.appendChild(element("span", "darwin-war-state", state));
    card.appendChild(top);

    if (!war || war.error || war.state === "notInWar" || !war.clan || !war.opponent) {
      var empty = element("div", "darwin-war-empty");
      empty.appendChild(element("div"));
      empty.firstChild.appendChild(element("strong", "", war && war.state === "notInWar" ? "当前没有进行中的部落战" : "实时战况暂不可用"));
      empty.firstChild.appendChild(element("p", "", war && war.error ? String(war.error.message || war.error) : "部落可能没有开战、对战资料没有公开，或查询服务刚好不可用。"));
      card.appendChild(empty);
      return card;
    }

    var teams = ownTeams(war, clan.tag);
    var score = element("div", "darwin-war-score");
    var own = element("div", "darwin-war-team");
    own.appendChild(element("strong", "", teams.own.name || clan.name));
    own.appendChild(element("p", "", percent(teams.own.destructionPercentage) + " 摧毁率"));
    score.appendChild(own);
    var scoreMain = element("div", "darwin-war-score-main");
    scoreMain.appendChild(element("strong", "", finite(teams.own.stars, 0) + " : " + finite(teams.other.stars, 0)));
    scoreMain.appendChild(element("span", "", "胜利之星"));
    score.appendChild(scoreMain);
    var other = element("div", "darwin-war-team");
    other.appendChild(element("strong", "", teams.other.name || "对手"));
    other.appendChild(element("p", "", percent(teams.other.destructionPercentage) + " 摧毁率"));
    score.appendChild(other);
    card.appendChild(score);

    var progress = element("dl", "darwin-war-progress");
    var totalAttacks = finite(war.teamSize, 0) * finite(war.attacksPerMember, 0);
    [
      ["对战规模", finite(war.teamSize, 0) + " 人"],
      ["我方进攻", teamAttacks(teams.own) + (totalAttacks ? " / " + totalAttacks : "")],
      ["结束", war.state === "warEnded" || war.state === "ended" ? formatCocDate(war.endTime) : remaining(war.endTime)]
    ].forEach(function (item) {
      var wrapper = element("div");
      wrapper.appendChild(element("dt", "", item[0]));
      wrapper.appendChild(element("dd", "", item[1]));
      progress.appendChild(wrapper);
    });
    card.appendChild(progress);
    return card;
  }

  function renderWarError(message) {
    var host = byId("warCards");
    if (!host) return;
    host.replaceChildren();
    CLANS.forEach(function (clan) {
      host.appendChild(renderWarCard(clan, { error: message }));
    });
  }
  function setWarStatus(text, state) {
    var status = byId("warServiceStatus");
    if (!status) return;
    status.className = "darwin-live-status" + (state ? " is-" + state : "");
    var dot = element("i");
    dot.setAttribute("aria-hidden", "true");
    status.replaceChildren(dot, document.createTextNode(text));
  }
  function responseMessage(body, response) {
    var value = body && (body.error && (body.error.message || body.error) || body.message || body.detail);
    return String(value || "云端查询失败（" + response.status + "）").slice(0, 240);
  }

  function fetchWars() {
    if (warBusy || document.visibilityState === "hidden") return Promise.resolve();
    warBusy = true;
    setWarStatus("正在读取实时战况", "loading");
    var button = byId("refreshWars");
    var host = byId("warCards");
    if (button) button.disabled = true;
    if (host) host.setAttribute("aria-busy", "true");
    var security = root.TZCloudSecurity;
    var tokenTask = security && typeof security.getToken === "function"
      ? Promise.resolve(security.getToken("coc_query"))
      : Promise.reject(new Error("云端安全验证尚未加载"));
    return tokenTask.then(function (token) {
      return root.fetch(CLOUD_ROOT + "/api/coc/query", {
        method: "POST",
        mode: "cors",
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        headers: { "Accept": "application/json", "Content-Type": "application/json", "X-Turnstile-Token": String(token || "") },
        body: JSON.stringify({ action: "get_current_wars", params: { clan_tags: CLANS.map(function (clan) { return clan.tag; }) } })
      });
    }).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (body) {
        if (!response.ok) throw new Error(responseMessage(body, response));
        if (body && body.ok === false) throw new Error(responseMessage(body, response));
        return body && Object.prototype.hasOwnProperty.call(body, "result") ? body.result : body;
      });
    }).then(function (body) {
      var rows = normalizeWarPayload(body);
      if (!rows.length) throw new Error("查询服务没有返回可识别的部落战数据");
      host.replaceChildren();
      CLANS.forEach(function (clan, index) { host.appendChild(renderWarCard(clan, warForClan(rows, clan, index))); });
      lastWarFetch = Date.now();
      setWarStatus("实时服务在线", "online");
      byId("warUpdatedAt").textContent = "最近刷新：" + new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(lastWarFetch));
    }).catch(function (error) {
      renderWarError(error && error.message || "实时查询失败");
      setWarStatus("实时服务暂不可用", "error");
      byId("warUpdatedAt").textContent = "本次刷新未完成：" + String(error && error.message || error);
    }).finally(function () {
      warBusy = false;
      if (button) button.disabled = false;
      if (host) host.setAttribute("aria-busy", "false");
    });
  }

  function init() {
    bindCopyButtons();
    updateCupClock();
    loadEventData();
    root.setInterval(updateCupClock, 1000);
    root.setInterval(loadEventData, EVENT_REFRESH_MS);
    root.setInterval(fetchWars, WAR_REFRESH_MS);
    var refreshButton = byId("refreshWars");
    if (refreshButton) refreshButton.addEventListener("click", fetchWars);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && Date.now() - lastWarFetch >= WAR_REFRESH_MS) fetchWars();
    });
    root.setTimeout(fetchWars, 350);
  }

  root.__darwinSiteTest = Object.freeze({ normalizeWarPayload: normalizeWarPayload, normalizeTag: normalizeTag });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
