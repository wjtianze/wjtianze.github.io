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
  var latestEventData = null;

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

  function legacyCopyText(value) {
    var field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.left = "-9999px";
    field.style.top = "0";
    document.body.appendChild(field);
    field.focus();
    field.select();
    field.setSelectionRange(0, field.value.length);
    var copied = false;
    try { copied = document.execCommand("copy"); } catch (_error) {}
    field.remove();
    return copied;
  }

  function copyText(value) {
    var text = String(value || "");
    if (!text) return Promise.reject(new Error("没有可复制的内容"));
    var legacyCopied = legacyCopyText(text);
    if (root.navigator && root.navigator.clipboard && root.isSecureContext) {
      return root.navigator.clipboard.writeText(text).catch(function (error) {
        if (legacyCopied) return;
        throw error;
      });
    }
    return legacyCopied ? Promise.resolve() : Promise.reject(new Error("clipboard unavailable"));
  }

  function bindCopyButtons() {
    document.querySelectorAll("[data-copy-tag]").forEach(function (button) {
      button.addEventListener("click", function () {
        var tag = button.getAttribute("data-copy-tag");
        copyText(tag).then(function () { showToast("已复制部落标签 " + tag); }).catch(function () { showToast("部落标签：" + tag); });
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

  function rewardBadgeText(entrantId, preview) {
    var groupId = Object.keys(preview.groupEntrantIds).find(function (key) {
      return preview.groupEntrantIds[key].indexOf(entrantId) !== -1;
    });
    if (groupId) return preview.finalized ? "额外奖励" : "当前奖励区";
    if (preview.lotteryWinnerEntrantIds.indexOf(entrantId) !== -1) return preview.finalized ? "抽奖奖励" : "抽奖名额";
    return "";
  }

  function rosterNode(entrants, rewardPreview) {
    if (!entrants.length) return element("p", "darwin-empty", "本组暂时无人报名");
    var list = element("ol", "darwin-roster");
    entrants.slice().sort(function (left, right) {
      return finite(left.registrationOrder, 9999) - finite(right.registrationOrder, 9999);
    }).forEach(function (entrant) {
      var item = element("li");
      var badgeText = rewardBadgeText(entrant.id, rewardPreview);
      if (badgeText) item.classList.add("is-reward-zone");
      item.appendChild(element("em", "", String(entrant.registrationOrder).padStart(2, "0")));
      var name = element("span", "darwin-roster-name");
      name.appendChild(element("strong", "", entrant.nickname));
      if (badgeText) name.appendChild(element("small", "darwin-reward-badge", badgeText));
      item.appendChild(name);
      item.appendChild(element("span", "darwin-roster-townhall", entrant.townHall + " 本"));
      list.appendChild(item);
    });
    return list;
  }

  function rankingNode(rows, rewardPreview) {
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
      var badgeText = rewardBadgeText(row.entrant.id, rewardPreview);
      if (badgeText) tr.classList.add("is-reward-zone");
      tr.appendChild(element("td", "", row.rank === null ? "—" : String(row.rank)));
      var name = element("td");
      name.appendChild(element("strong", "", row.entrant.nickname));
      name.appendChild(element("small", "", row.hasResult ? row.entrant.townHall + " 本" : row.entrant.townHall + " 本 · 尚未比赛"));
      if (badgeText) name.appendChild(element("span", "darwin-reward-badge", badgeText));
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

  function rewardCard(kicker, rule, entrantIds, entrants, emptyText) {
    var entrantsById = entrants.reduce(function (map, entrant) { map[entrant.id] = entrant; return map; }, Object.create(null));
    var names = entrantIds.map(function (entrantId) { return entrantsById[entrantId]; }).filter(Boolean).map(function (entrant) { return entrant.nickname; });
    var card = element("article", "darwin-reward-card");
    card.appendChild(element("small", "", kicker));
    card.appendChild(element("strong", "", rule));
    card.appendChild(element("p", "", names.length ? "当前：" + names.join("、") : emptyText));
    return card;
  }

  function renderRewardPreview(preview, entrants) {
    var host = byId("rewardPreview");
    if (!host) return;
    host.replaceChildren();
    ["low", "middle", "high"].forEach(function (groupId) {
      var group = root.DarwinCupScoring.GROUPS[groupId];
      var slots = preview.groupSlots[groupId];
      var rule = slots === 1 ? "冠军 · 1 份" : "前 " + slots + " 名 · " + slots + " 份";
      host.appendChild(rewardCard(group.name, rule, preview.groupEntrantIds[groupId], entrants, "排名尚未产生"));
    });
    host.appendChild(rewardCard("剩余名额", "随机抽奖 · " + preview.lotterySlots + " 份", preview.lotteryWinnerEntrantIds, entrants, "尚未抽取"));
    var slotCount = byId("rewardSlotCount");
    if (slotCount) slotCount.textContent = "共 " + preview.totalSlots + " 份";
  }

  function renderCupOverviewRankings(data, preview) {
    var host = byId("cupOverviewRankings");
    if (!host) return;
    host.replaceChildren();
    ["low", "middle", "high"].forEach(function (groupId) {
      var group = root.DarwinCupScoring.GROUPS[groupId];
      var section = element("section", "darwin-overview-rank-group");
      var heading = element("h3", "", group.name);
      heading.appendChild(element("span", "", "当前排名"));
      section.appendChild(heading);
      var rows = root.DarwinCupScoring.standingsFor(groupId, data.entrants, data.matches).filter(function (row) { return row.hasResult; }).slice(0, 3);
      if (!rows.length) {
        section.appendChild(element("p", "darwin-overview-rank-empty", "暂无成绩"));
      } else {
        var list = element("ol");
        rows.forEach(function (row) {
          var item = element("li");
          if (preview.groupEntrantIds[groupId].indexOf(row.entrant.id) !== -1) item.classList.add("is-reward-zone");
          item.appendChild(element("em", "", String(row.rank)));
          item.appendChild(element("strong", "", row.entrant.nickname));
          item.appendChild(element("span", "", row.stars + " 星 · " + percent(row.destruction)));
          list.appendChild(item);
        });
        section.appendChild(list);
      }
      host.appendChild(section);
    });
  }

  function buildCupBrief() {
    if (!latestEventData) return "赛事数据暂未取得，请稍后刷新页面。";
    return root.DarwinCupScoring.buildCupBrief(latestEventData, new Date());
  }

  function updateCupBriefAvailability() {
    var button = byId("copyCupBrief");
    var status = byId("cupBriefStatus");
    if (button) button.disabled = !latestEventData;
    if (!status) return;
    status.textContent = latestEventData ? "赛事数据已就绪" : "正在汇总赛事数据";
  }

  function bindCupBriefButton() {
    var button = byId("copyCupBrief");
    if (!button) return;
    button.addEventListener("click", function () {
      var brief = "";
      try { brief = buildCupBrief(); }
      catch (error) {
        showToast("简报生成失败，请刷新页面后重试");
        return;
      }
      copyText(brief).then(function () {
        showToast("达尔文杯简报已复制，可以直接粘贴到群聊");
        var status = byId("cupBriefStatus");
        if (status) status.textContent = "达尔文杯简报已复制";
      }).catch(function () {
        showToast("复制失败，请检查浏览器剪贴板权限");
      });
    });
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
    latestEventData = data;
    var rewardPreview = scoring.rewardPreview(data);
    renderRewardPreview(rewardPreview, data.entrants);
    renderCupOverviewRankings(data, rewardPreview);
    var cupEntrantCount = byId("cupEntrantCount");
    var cupMatchCount = byId("cupMatchCount");
    var cupRewardCount = byId("cupRewardCount");
    if (cupEntrantCount) cupEntrantCount.textContent = String(data.entrants.length);
    if (cupMatchCount) cupMatchCount.textContent = String(data.matches.filter(function (match) { return match.status !== "void"; }).length);
    if (cupRewardCount) cupRewardCount.textContent = String(rewardPreview.totalSlots);
    ["low", "middle", "high"].forEach(function (groupId) {
      var group = document.querySelector('[data-group="' + groupId + '"]');
      if (!group) return;
      var entrants = data.entrants.filter(function (entrant) { return entrant.group === groupId; });
      var matches = data.matches.filter(function (match) { return match.group === groupId && match.status !== "void"; });
      group.querySelector("[data-group-count]").textContent = String(entrants.length);
      group.querySelector("[data-match-count]").textContent = String(matches.length);
      group.querySelector("[data-roster]").replaceChildren(rosterNode(entrants, rewardPreview));
      group.querySelector("[data-ranking]").replaceChildren(rankingNode(scoring.standingsFor(groupId, data.entrants, data.matches), rewardPreview));
      group.querySelector("[data-match-log]").replaceChildren(matchLogNode(matches, data.entrants));
    });
    byId("cupUpdatedAt").textContent = "赛事数据更新于 " + formatCalendarDate(data.updatedAt) + " · 每分钟检查更新";
    updateCupBriefAvailability();
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
        updateCupBriefAvailability();
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

  function renderWarOverviewRow(clan, war) {
    var card = element("article", "darwin-overview-war-row");
    var identity = element("div", "darwin-overview-war-name");
    identity.appendChild(element("small", "", clan.label));
    identity.appendChild(element("strong", "", clan.name));
    card.appendChild(identity);
    if (!war || war.error) {
      card.appendChild(element("p", "darwin-overview-war-message", war && String(war.error.message || war.error) || "暂时无法读取"));
      return card;
    }
    var state = String(war.state || "notInWar");
    if (state === "notInWar" || state === "matchmaking" || !war.clan || !war.opponent) {
      card.appendChild(element("p", "darwin-overview-war-message", WAR_STATES[state] || state));
      return card;
    }
    var teams = ownTeams(war, clan.tag);
    var result = element("div", "darwin-overview-war-result");
    result.appendChild(element("b", "", finite(teams.own.stars, 0) + " : " + finite(teams.other.stars, 0)));
    result.appendChild(element("span", "", (WAR_STATES[state] || state) + " · 对 " + (teams.other.name || "对手")));
    card.appendChild(result);
    return card;
  }

  function renderWarOverview(rows, errorMessage) {
    var host = byId("warOverviewCards");
    if (!host) return;
    host.replaceChildren();
    CLANS.forEach(function (clan, index) {
      host.appendChild(renderWarOverviewRow(clan, errorMessage ? { error: errorMessage } : warForClan(rows, clan, index)));
    });
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
    renderWarOverview([], message);
  }
  function setWarStatus(text, state) {
    [byId("warServiceStatus"), byId("warOverviewStatus")].forEach(function (status) {
      if (!status) return;
      status.className = "darwin-live-status" + (state ? " is-" + state : "");
      var dot = element("i");
      dot.setAttribute("aria-hidden", "true");
      status.replaceChildren(dot, document.createTextNode(text));
    });
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
      renderWarOverview(rows);
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
    bindCupBriefButton();
    updateCupBriefAvailability();
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

  root.__darwinSiteTest = Object.freeze({
    normalizeWarPayload: normalizeWarPayload,
    normalizeTag: normalizeTag,
    buildCupBrief: buildCupBrief
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
