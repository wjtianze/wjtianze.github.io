/* 达尔文杯计分规则：纯函数模块，供网页渲染与 Node 回归测试共用。 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DarwinCupScoring = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var GROUPS = Object.freeze({
    low: Object.freeze({ id: "low", name: "低本组", range: "10～12 本", min: 10, max: 12 }),
    middle: Object.freeze({ id: "middle", name: "中本组", range: "13～15 本", min: 13, max: 15 }),
    high: Object.freeze({ id: "high", name: "高本组", range: "16～18 本", min: 16, max: 18 })
  });

  function finiteNumber(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, finiteNumber(value, min)));
  }

  function difficultyFor(attackerTownHall, defenderTownHall) {
    var difference = finiteNumber(attackerTownHall, 0) - finiteNumber(defenderTownHall, 0);
    if (difference <= -2) return { label: "普通", adjustment: false, difference: difference };
    if (difference === -1) return { label: "传奇杯 3", adjustment: false, difference: difference };
    if (difference === 0) return { label: "传奇杯 1", adjustment: false, difference: difference };
    if (difference === 1) return { label: "电竞", adjustment: false, difference: difference };
    return { label: "电竞＋成绩修正", adjustment: true, difference: difference };
  }

  function scoreAttack(attackerTownHall, defenderTownHall, attack) {
    var actualStars = Math.round(clamp(attack && attack.stars, 0, 3));
    var actualDestruction = clamp(attack && attack.destruction, 0, 100);
    var difficulty = difficultyFor(attackerTownHall, defenderTownHall);
    return {
      actualStars: actualStars,
      actualDestruction: actualDestruction,
      stars: difficulty.adjustment ? Math.max(0, actualStars - 1) : actualStars,
      destruction: difficulty.adjustment ? Math.max(0, actualDestruction - 20) : actualDestruction,
      difficulty: difficulty.label,
      adjusted: difficulty.adjustment
    };
  }

  function groupForTownHall(townHall) {
    var level = finiteNumber(townHall, 0);
    return Object.keys(GROUPS).map(function (key) { return GROUPS[key]; }).find(function (group) {
      return level >= group.min && level <= group.max;
    }) || null;
  }

  function entrantMap(entrants) {
    return (Array.isArray(entrants) ? entrants : []).reduce(function (map, entrant) {
      if (entrant && entrant.id) map[entrant.id] = entrant;
      return map;
    }, Object.create(null));
  }

  function scoredSide(side, opponent, entrantsById) {
    var entrant = entrantsById[side && side.entrantId];
    var defender = entrantsById[opponent && opponent.entrantId];
    var attacks = entrant && defender && Array.isArray(side.attacks) ? side.attacks.map(function (attack) {
      return scoreAttack(entrant.townHall, defender.townHall, attack);
    }) : [];
    return {
      entrant: entrant || null,
      defender: defender || null,
      attacks: attacks,
      stars: attacks.reduce(function (total, attack) { return total + attack.stars; }, 0),
      destruction: attacks.reduce(function (total, attack) { return total + attack.destruction; }, 0)
    };
  }

  function scoreMatch(match, entrants) {
    var entrantsById = entrantMap(entrants);
    var left = scoredSide(match && match.left || {}, match && match.right || {}, entrantsById);
    var right = scoredSide(match && match.right || {}, match && match.left || {}, entrantsById);
    return {
      id: match && match.id || "",
      group: match && match.group || "",
      status: match && match.status || "completed",
      playedAt: match && match.playedAt || "",
      left: left,
      right: right
    };
  }

  function standingsFor(groupId, entrants, matches) {
    var rows = (Array.isArray(entrants) ? entrants : []).filter(function (entrant) {
      return entrant.group === groupId;
    }).map(function (entrant) {
      return {
        entrant: entrant,
        stars: 0,
        destruction: 0,
        attacks: 0,
        matches: 0,
        hasResult: false,
        registrationOrder: finiteNumber(entrant.registrationOrder, 9999)
      };
    });
    var byId = rows.reduce(function (map, row) { map[row.entrant.id] = row; return map; }, Object.create(null));

    (Array.isArray(matches) ? matches : []).filter(function (match) {
      return match && match.group === groupId && match.status !== "void";
    }).forEach(function (match) {
      var scored = scoreMatch(match, entrants);
      [scored.left, scored.right].forEach(function (side) {
        if (!side.entrant || !byId[side.entrant.id] || !side.attacks.length) return;
        var row = byId[side.entrant.id];
        row.stars += side.stars;
        row.destruction += side.destruction;
        row.attacks += side.attacks.length;
        row.matches += 1;
        row.hasResult = true;
      });
    });

    rows.sort(function (left, right) {
      if (left.hasResult !== right.hasResult) return left.hasResult ? -1 : 1;
      if (right.stars !== left.stars) return right.stars - left.stars;
      if (right.destruction !== left.destruction) return right.destruction - left.destruction;
      return left.registrationOrder - right.registrationOrder;
    });

    var lastScore = "";
    var rank = 0;
    rows.forEach(function (row, index) {
      if (!row.hasResult) {
        row.rank = null;
        return;
      }
      var score = row.stars + ":" + row.destruction;
      if (score !== lastScore) rank = index + 1;
      row.rank = rank;
      lastScore = score;
    });
    return rows;
  }

  function nonNegativeInteger(value, fallback) {
    var number = finiteNumber(value, fallback);
    return Number.isInteger(number) && number >= 0 ? number : fallback;
  }

  function rewardPreview(data) {
    var entrants = data && Array.isArray(data.entrants) ? data.entrants : [];
    var matches = data && Array.isArray(data.matches) ? data.matches : [];
    var rewards = data && data.rewards || {};
    var configuredGroupSlots = rewards.groupSlots || {};
    var groupSlots = {};
    var groupEntrantIds = {};
    var highlightedEntrantIds = [];

    Object.keys(GROUPS).forEach(function (groupId) {
      var slots = nonNegativeInteger(configuredGroupSlots[groupId], 0);
      var rows = standingsFor(groupId, entrants, matches);
      groupSlots[groupId] = slots;
      groupEntrantIds[groupId] = rows.filter(function (row) {
        return slots > 0 && row.hasResult && row.rank !== null && row.rank <= slots;
      }).map(function (row) { return row.entrant.id; });
      highlightedEntrantIds = highlightedEntrantIds.concat(groupEntrantIds[groupId]);
    });

    var lotterySlots = nonNegativeInteger(rewards.lotterySlots, 0);
    var entrantsById = entrantMap(entrants);
    var seenLotteryWinners = Object.create(null);
    var lotteryWinnerEntrantIds = (Array.isArray(rewards.lotteryWinnerEntrantIds) ? rewards.lotteryWinnerEntrantIds : []).filter(function (entrantId) {
      if (!entrantsById[entrantId] || seenLotteryWinners[entrantId]) return false;
      seenLotteryWinners[entrantId] = true;
      return true;
    });
    lotteryWinnerEntrantIds.forEach(function (entrantId) {
      if (highlightedEntrantIds.indexOf(entrantId) === -1) highlightedEntrantIds.push(entrantId);
    });

    return {
      finalized: rewards.finalized === true,
      groupSlots: groupSlots,
      groupEntrantIds: groupEntrantIds,
      lotterySlots: lotterySlots,
      lotteryWinnerEntrantIds: lotteryWinnerEntrantIds,
      highlightedEntrantIds: highlightedEntrantIds,
      totalSlots: Object.keys(groupSlots).reduce(function (total, groupId) { return total + groupSlots[groupId]; }, 0) + lotterySlots
    };
  }

  function percentText(value) {
    return finiteNumber(value, 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 }) + "%";
  }

  function buildCupBrief(data, generatedAt) {
    var date = generatedAt instanceof Date ? generatedAt : new Date(generatedAt || Date.now());
    if (!Number.isFinite(date.getTime())) date = new Date();
    var generatedTime = new Intl.DateTimeFormat("zh-CN", {
      month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false
    }).format(date);
    var entrants = data && Array.isArray(data.entrants) ? data.entrants : [];
    var matches = data && Array.isArray(data.matches) ? data.matches : [];
    var preview = rewardPreview(data);
    var lines = ["【第一届达尔文杯战况简报】", "生成时间：" + generatedTime, ""];
    lines.push("报名 " + entrants.length + " 人｜已登记 " + matches.filter(function (match) { return match.status !== "void"; }).length + " 场｜额外奖励 " + preview.totalSlots + " 份");
    ["low", "middle", "high"].forEach(function (groupId) {
      var rows = standingsFor(groupId, entrants, matches).filter(function (row) { return row.hasResult; }).slice(0, 3);
      if (!rows.length) {
        lines.push(GROUPS[groupId].name + "：暂无成绩");
        return;
      }
      lines.push(GROUPS[groupId].name + "：");
      rows.forEach(function (row) {
        var inRewardZone = preview.groupEntrantIds[groupId].indexOf(row.entrant.id) !== -1;
        lines.push(row.rank + ". " + row.entrant.nickname + "　" + row.stars + " 星　" + percentText(row.destruction) + "　" + row.matches + " 场" + (inRewardZone ? "【当前奖励区】" : ""));
      });
    });
    var entrantsById = entrantMap(entrants);
    var lotteryNames = preview.lotteryWinnerEntrantIds.map(function (entrantId) { return entrantsById[entrantId]; }).filter(Boolean).map(function (entrant) { return entrant.nickname; });
    lines.push("随机抽奖：" + (lotteryNames.length ? lotteryNames.join("、") : "尚未抽取"));
    lines.push("", "以上为预览版分配，一切以群主最终确认为准，尚未核定或发放。");
    return lines.join("\n");
  }

  function validateData(data) {
    var errors = [];
    var entrants = data && Array.isArray(data.entrants) ? data.entrants : [];
    var matches = data && Array.isArray(data.matches) ? data.matches : [];
    var seenEntrants = Object.create(null);
    entrants.forEach(function (entrant, index) {
      if (!entrant || !entrant.id) errors.push("第 " + (index + 1) + " 名参赛账号缺少编号");
      else if (seenEntrants[entrant.id]) errors.push("参赛账号编号重复：" + entrant.id);
      else seenEntrants[entrant.id] = entrant;
      var expectedGroup = groupForTownHall(entrant && entrant.townHall);
      if (!expectedGroup || expectedGroup.id !== entrant.group) errors.push("参赛账号组别与大本营不一致：" + (entrant && entrant.nickname || index + 1));
    });
    var seenMatches = Object.create(null);
    matches.forEach(function (match, index) {
      if (!match || !match.id) errors.push("第 " + (index + 1) + " 场对局缺少编号");
      else if (seenMatches[match.id]) errors.push("对局编号重复：" + match.id);
      else seenMatches[match.id] = true;
      var left = seenEntrants[match && match.left && match.left.entrantId];
      var right = seenEntrants[match && match.right && match.right.entrantId];
      if (!left || !right) errors.push("对局包含未报名账号：" + (match && match.id || index + 1));
      else if (left.id === right.id || left.group !== right.group || left.group !== match.group) errors.push("对局双方或组别无效：" + match.id);
    });

    var rewards = data && data.rewards;
    if (!rewards || typeof rewards !== "object") {
      errors.push("赛事数据缺少额外奖励规则");
    } else {
      var groupSlots = rewards.groupSlots || {};
      Object.keys(GROUPS).forEach(function (groupId) {
        if (nonNegativeInteger(groupSlots[groupId], -1) < 0) errors.push(GROUPS[groupId].name + "奖励名额无效");
      });
      var lotterySlots = nonNegativeInteger(rewards.lotterySlots, -1);
      if (lotterySlots < 0) errors.push("随机抽奖名额无效");
      if (!Array.isArray(rewards.lotteryWinnerEntrantIds)) {
        errors.push("随机抽奖结果格式无效");
      } else {
        if (lotterySlots >= 0 && rewards.lotteryWinnerEntrantIds.length > lotterySlots) errors.push("随机抽奖获奖账号多于抽奖名额");
        var seenLotteryWinners = Object.create(null);
        rewards.lotteryWinnerEntrantIds.forEach(function (entrantId) {
          if (!seenEntrants[entrantId]) errors.push("随机抽奖包含未报名账号：" + entrantId);
          else if (seenLotteryWinners[entrantId]) errors.push("随机抽奖账号重复：" + entrantId);
          else seenLotteryWinners[entrantId] = true;
        });
      }
    }
    return errors;
  }

  return Object.freeze({
    GROUPS: GROUPS,
    difficultyFor: difficultyFor,
    groupForTownHall: groupForTownHall,
    scoreAttack: scoreAttack,
    scoreMatch: scoreMatch,
    standingsFor: standingsFor,
    rewardPreview: rewardPreview,
    buildCupBrief: buildCupBrief,
    validateData: validateData
  });
});
