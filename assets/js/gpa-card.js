/* ============================================================
   绩点战争：GPA 4.3 — 内测版 v0.1
   单文件游戏逻辑，玩家 vs AI
   ============================================================ */
(function () {
  "use strict";

  function uiGlyph(key) {
    return '<span class="tz-icon" data-icon="' + key + '" aria-hidden="true"></span>';
  }

  // ===== 卡牌数据 =====
  var CARDS = [
    { id: "basic_q",     name: "基础题",   type: "攻击",   buyCost: 2, useCost: 1, weight: 14, target: "enemy", desc: "造成 8 伤害" },
    { id: "hard_q",      name: "难题突破", type: "攻击",   buyCost: 4, useCost: 2, weight: 9,  target: "enemy", desc: "造成 17 伤害" },
    { id: "precise",     name: "精准纠错", type: "攻击",   buyCost: 4, useCost: 2, weight: 8,  target: "enemy", desc: "移除最多 8 护盾，再造成 10 伤害" },
    { id: "break_time",  name: "课间休息", type: "防御",   buyCost: 2, useCost: 1, weight: 14, target: "self",  desc: "获得 10 护盾" },
    { id: "early_sleep", name: "早睡",     type: "治疗",   buyCost: 4, useCost: 2, weight: 9,  target: "self",  desc: "治疗 14" },
    { id: "routine",     name: "规律作息", type: "防御",   buyCost: 5, useCost: 2, weight: 8,  target: "self",  desc: "获得 8 护盾并治疗 7" },
    { id: "preview",     name: "预习",     type: "过牌",   buyCost: 3, useCost: 1, weight: 10, target: "self",  desc: "抽 2 张，再放回 1 张手牌" },
    { id: "time_mgmt",   name: "时间管理", type: "资源",   buyCost: 4, useCost: 1, weight: 8,  target: "self",  desc: "下回合补给额外 +2 能量" },
    { id: "study_plan",  name: "学习计划", type: "检索",   buyCost: 4, useCost: 2, weight: 8,  target: "self",  desc: "按权重从卡组抽 1 张" },
    { id: "homework",    name: "平时作业", type: "GPA",    buyCost: 2, useCost: 1, weight: 12, target: "self",  desc: "获得 0.1 GPA" },
    { id: "quiz",        name: "小测验",   type: "攻击",   buyCost: 3, useCost: 1, weight: 10, target: "enemy", desc: "造成 5 伤害；若造成伤害，获得 0.1 GPA" },
    { id: "scholarship", name: "奖学金",   type: "逆风",   buyCost: 5, useCost: 1, weight: 6,  target: "self",  desc: "若 GPA 落后 ≥0.5，获得 3 能量；否则获得 1 能量" }
  ];

  var CARD_MAP = {};
  CARDS.forEach(function (c) { CARD_MAP[c.id] = c; });

  // ===== 技能数据 =====
  var SKILLS = [
    { id: "steady",    name: "稳扎稳打", type: "被动", hpCost: 15, desc: "每回合首张权重≥12的牌使用成本-1（最低1）", isPassive: true },
    { id: "comeback",  name: "越挫越勇", type: "被动", hpCost: 20, desc: "首次降到 40% 生命时获得 12 护盾和 2 能量", isPassive: true },
    { id: "adjust",    name: "临场调整", type: "主动", hpCost: 10, energyCost: 1, cooldown: 2, desc: "放回 1 张手牌，按权重重抽 1 张", isPassive: false },
    { id: "breathe",   name: "深呼吸",   type: "主动", hpCost: 10, energyCost: 1, cooldown: 3, desc: "治疗 8", isPassive: false }
  ];
  var SKILL_MAP = {};
  SKILLS.forEach(function (s) { SKILL_MAP[s.id] = s; });
  var CARD_TYPE_ICON = {
    "攻击": "swords",
    "防御": "shield",
    "治疗": "heart",
    "过牌": "refresh",
    "资源": "lightning",
    "检索": "search",
    "GPA": "trophy",
    "干扰": "burst",
    "逆风": "warning",
    "连携": "sparkle"
  };

  // ===== GPA 里程碑 =====
  var MILESTONES = [
    { gpa: 1.5, reward: "抽 1 张牌",           effect: function (p) { drawCards(p, 1); } },
    { gpa: 2.0, reward: "治疗 8",               effect: function (p) { healPlayer(p, 8); } },
    { gpa: 2.5, reward: "获得 2 能量",          effect: function (p) { p.energy = Math.min(10, p.energy + 2); } },
    { gpa: 3.0, reward: "最大生命+10 治疗10",   effect: function (p) { p.maxHp += 10; healPlayer(p, 10); } },
    { gpa: 3.5, reward: "下一张牌使用成本-2",   effect: function (p) { p.costReduction = 2; } },
    { gpa: 4.0, reward: "抽 2 张 获得 10 护盾", effect: function (p) { drawCards(p, 2); p.shield += 10; } }
  ];

  // ===== 游戏状态 =====
  var G = null;
  var activeDialog = null;
  var dialogReturnFocus = null;
  var toastTimer = 0;

  function getFocusable(container) {
    return Array.prototype.slice.call(container.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter(function (el) { return !el.hidden && el.offsetParent !== null; });
  }

  function focusWithoutScroll(element) {
    if (!element) return;
    var scrollX = window.scrollX;
    var scrollY = window.scrollY;
    try {
      element.focus({ preventScroll: true });
    } catch (error) {
      element.focus();
      window.scrollTo(scrollX, scrollY);
    }
  }

  function keepBoardBelowTopbar(board) {
    if (!board) return;
    window.requestAnimationFrame(function () {
      var topbar = document.querySelector(".topbar");
      var safeTop = (topbar ? topbar.getBoundingClientRect().bottom : 64) + 14;
      var boardTop = board.getBoundingClientRect().top;
      if (boardTop < safeTop) {
        var root = document.documentElement;
        var previousScrollBehavior = root.style.scrollBehavior;
        root.style.setProperty("scroll-behavior", "auto", "important");
        window.scrollTo({
          left: window.scrollX,
          top: Math.max(0, window.scrollY + boardTop - safeTop),
          behavior: "auto"
        });
        window.requestAnimationFrame(function () {
          root.style.scrollBehavior = previousScrollBehavior;
        });
      }
    });
  }

  function openDialog(dialog, preferredFocus) {
    dialogReturnFocus = document.activeElement;
    activeDialog = dialog;
    dialog.classList.remove("hidden");
    dialog.setAttribute("aria-hidden", "false");
    window.requestAnimationFrame(function () {
      var target = preferredFocus || getFocusable(dialog)[0] || dialog.querySelector(".gpa-overlay-card");
      if (target) target.focus();
    });
  }

  function closeDialog(dialog, restoreFocus) {
    dialog.classList.add("hidden");
    dialog.setAttribute("aria-hidden", "true");
    activeDialog = null;
    if (restoreFocus !== false && dialogReturnFocus && document.contains(dialogReturnFocus)) dialogReturnFocus.focus();
    dialogReturnFocus = null;
  }

  function announce(message) {
    var el = document.getElementById("gameAnnouncer");
    el.textContent = "";
    window.setTimeout(function () { el.textContent = message; }, 20);
  }

  function newGame(pickedSkills) {
    var maxHp = 100;
    pickedSkills.forEach(function (s) { maxHp -= s.hpCost; });
    G = {
      turn: 1,
      phase: "config",
      firstPlayer: Math.random() < 0.5 ? "player" : "ai",
      player: {
        name: "你", hp: maxHp, maxHp: maxHp, shield: 0, energy: 3, gpa: 1.0,
        deck: [], hand: [], shop: [], unlocked: CARDS.map(function (c) { return c.id; }),
        skills: pickedSkills.map(function (s) { return { id: s.id, cooldown: 0, used: false }; }),
        milestonesClaimed: {}, costReduction: 0, nextEnergyBonus: 0, hasTakenTurn: false,
        gpaThisTurn: 0, gpaAttack: false, gpaDefense: false, gpaBuy: false,
        passiveTriggered: {}
      },
      ai: {
        name: "AI 对手", hp: 95, maxHp: 95, shield: 0, energy: 3, gpa: 1.0,
        deck: [], hand: [], shop: [], unlocked: CARDS.map(function (c) { return c.id; }),
        skills: [{ id: "steady", cooldown: 0, used: false }, { id: "adjust", cooldown: 0, used: false }],
        milestonesClaimed: {}, costReduction: 0, nextEnergyBonus: 0, hasTakenTurn: false,
        gpaThisTurn: 0, gpaAttack: false, gpaDefense: false, gpaBuy: false,
        passiveTriggered: {}
      },
      log: [],
      ended: false,
      secondPlayerBonusPending: null
    };
    G.secondPlayerBonusPending = G.firstPlayer === "player" ? "ai" : "player";
    buildDeck(G.player);
    buildDeck(G.ai);
    drawCards(G.player, 5);
    drawCards(G.ai, 5);
    refreshShop(G.player);
    refreshShop(G.ai);
    log("system", "对局开始！先手：" + (G.firstPlayer === "player" ? "你" : "AI"));
    if (G.firstPlayer === "ai") {
      G.phase = "supply";
      render();
      setTimeout(aiTurn, 800);
    } else {
      startPlayerTurn();
    }
  }

  function consumeSecondPlayerBonus(side) {
    if (G.secondPlayerBonusPending !== side) return 0;
    G.secondPlayerBonusPending = null;
    log("system", (side === "player" ? "你" : "AI") + " 获得后手首回合补偿：额外 +1 能量");
    return 1;
  }

  function startPlayerTurn() {
    if (G.ended) return;
    var p = G.player;
    G.firstPlayer = "player";
    G.phase = "supply";
    var playerSupply = p.hasTakenTurn ? 3 + p.nextEnergyBonus : consumeSecondPlayerBonus("player");
    p.energy = Math.min(10, p.energy + playerSupply);
    p.hasTakenTurn = true;
    p.nextEnergyBonus = 0;
    p.shield = 0;
    p.gpaThisTurn = 0; p.gpaAttack = false; p.gpaDefense = false; p.gpaBuy = false;
    p.passiveTriggered = {};
    p.costReduction = 0;
    p.skills.forEach(function (sk) { if (sk.cooldown > 0) sk.cooldown--; });
    drawCards(p, 5 - p.hand.length);
    refreshShop(p);
    G.phase = "action";
    log("system", "你的回合——行动阶段");
    render();
    announce("你的回合。当前能量 " + p.energy + "，手牌 " + p.hand.length + " 张。");
  }

  function buildDeck(p) {
    p.deck = [];
    p.unlocked.forEach(function (id) {
      var card = CARD_MAP[id];
      for (var i = 0; i < card.weight; i++) p.deck.push(id);
    });
    // shuffle
    for (var i = p.deck.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = p.deck[i]; p.deck[i] = p.deck[j]; p.deck[j] = t;
    }
  }

  function drawCards(p, n) {
    for (var i = 0; i < n; i++) {
      if (p.deck.length === 0) {
        // reshuffle from unlocked (simplified: rebuild)
        buildDeck(p);
      }
      if (p.hand.length >= 7) break;
      p.hand.push(p.deck.pop());
    }
  }

  function refreshShop(p) {
    p.shop = [];
    var pool = p.unlocked.filter(function (id) { return true; }); // all unlocked can appear
    for (var i = 0; i < 3; i++) {
      if (pool.length === 0) break;
      var idx = Math.floor(Math.random() * pool.length);
      p.shop.push(pool[idx]);
    }
  }

  // ===== 玩家行动 =====
  function playCard(cardIdx) {
    if (G.ended || G.phase !== "action" || G.firstPlayer !== "player") return;
    var p = G.player;
    var card = CARD_MAP[p.hand[cardIdx]];
    if (!card) return;
    var cost = card.useCost;
    var usesCostReduction = p.costReduction > 0;
    if (usesCostReduction) cost = Math.max(1, cost - p.costReduction);
    // steady skill
    var steady = p.skills.find(function (s) { return s.id === "steady"; });
    var usesSteady = steady && !p.passiveTriggered.steady && card.weight >= 12;
    if (usesSteady) cost = Math.max(1, cost - 1);
    if (p.energy < cost) { toast("能量不足"); return; }
    if (usesCostReduction) p.costReduction = 0;
    if (usesSteady) p.passiveTriggered.steady = true;
    p.energy -= cost;
    p.hand.splice(cardIdx, 1);
    executeCardEffect(card, p, G.ai);
    log("play", p.name + " 打出【" + card.name + "】");
    checkMilestones(p);
    checkWin();
    render();
  }

  function buyCard(shopIdx) {
    if (G.ended || G.phase !== "action" || G.firstPlayer !== "player") return;
    var p = G.player;
    var cardId = p.shop[shopIdx];
    if (!cardId) return;
    var card = CARD_MAP[cardId];
    if (p.energy < card.buyCost) { toast("能量不足"); return; }
    p.energy -= card.buyCost;
    p.shop[shopIdx] = null;
    if (p.unlocked.indexOf(cardId) < 0) p.unlocked.push(cardId);
    // add to deck
    for (var i = 0; i < card.weight; i++) p.deck.unshift(cardId);
    log("buy", p.name + " 购买【" + card.name + "】");
    // GPA from buying
    if (!p.gpaBuy && p.gpaThisTurn < 0.3) { addGpa(p, 0.1); p.gpaBuy = true; }
    checkMilestones(p);
    checkWin();
    render();
  }

  function refreshShopManual() {
    if (G.ended || G.phase !== "action" && G.phase !== "config") return;
    var p = G.player;
    if (p.energy < 1) { toast("能量不足"); return; }
    p.energy -= 1;
    refreshShop(p);
    log("system", p.name + " 刷新了商店");
    render();
  }

  function useSkill(skillIdx) {
    if (G.ended || G.phase !== "action" || G.firstPlayer !== "player") return;
    var p = G.player;
    var sk = p.skills[skillIdx];
    var def = SKILL_MAP[sk.id];
    if (def.isPassive) { toast("被动技能自动触发"); return; }
    if (sk.cooldown > 0) { toast("冷却中：" + sk.cooldown + " 回合"); return; }
    if (p.energy < def.energyCost) { toast("能量不足"); return; }
    p.energy -= def.energyCost;
    sk.cooldown = def.cooldown;
    if (sk.id === "adjust") {
      // 放回最后一张手牌，重抽
      if (p.hand.length > 0) {
        p.hand.pop();
        drawCards(p, 1);
        log("system", p.name + " 使用【临场调整】，重抽 1 张");
      }
    } else if (sk.id === "breathe") {
      healPlayer(p, 8);
      log("heal", p.name + " 使用【深呼吸】，治疗 8");
    }
    checkMilestones(p);
    checkWin();
    render();
  }

  function endTurn() {
    if (G.ended) return;
    if (G.firstPlayer !== "player") return;
    endPlayerTurn();
    // AI turn
    setTimeout(aiTurn, 600);
  }

  function endPlayerTurn() {
    G.turn++;
    G.firstPlayer = "ai";
    G.phase = "supply";
    log("system", "—— 回合 " + G.turn + "：AI 的回合 ——");
    render();
  }

  // ===== AI 回合 =====
  function aiTurn() {
    if (G.ended) return;
    if (activeDialog) { setTimeout(aiTurn, 250); return; }
    var ai = G.ai;
    var pl = G.player;
    // supply phase
    var aiSupply = ai.hasTakenTurn ? 3 + ai.nextEnergyBonus : consumeSecondPlayerBonus("ai");
    ai.energy = Math.min(10, ai.energy + aiSupply);
    ai.hasTakenTurn = true;
    ai.nextEnergyBonus = 0;
    ai.shield = 0;
    ai.gpaThisTurn = 0; ai.gpaAttack = false; ai.gpaDefense = false; ai.gpaBuy = false;
    ai.passiveTriggered = {};
    ai.costReduction = 0;
    ai.skills.forEach(function (sk) { if (sk.cooldown > 0) sk.cooldown--; });
    drawCards(ai, 5 - ai.hand.length);
    if (ai.hand.length < 5) drawCards(ai, 5 - ai.hand.length);
    refreshShop(ai);
    log("system", "AI 补给：能量 " + ai.energy + "，手牌 " + ai.hand.length);
    G.phase = "action";
    render();
    announce("AI 回合，请稍候。");

    // AI decisions
    setTimeout(aiAction, 500);
  }

  function getAICandidate(predicate) {
    var ai = G.ai;
    var steadyReady = ai.skills.some(function (s) { return s.id === "steady"; }) && !ai.passiveTriggered.steady;
    for (var i = 0; i < ai.hand.length; i++) {
      var card = CARD_MAP[ai.hand[i]];
      if (!predicate(card)) continue;
      var cost = card.useCost;
      var usesCostReduction = ai.costReduction > 0;
      if (usesCostReduction) cost = Math.max(1, cost - ai.costReduction);
      var usesSteady = steadyReady && card.weight >= 12;
      if (usesSteady) cost = Math.max(1, cost - 1);
      if (ai.energy >= cost) return { idx: i, card: card, cost: cost, usesCostReduction: usesCostReduction, usesSteady: usesSteady };
    }
    return null;
  }

  function playAICandidate(candidate, suffix) {
    if (!candidate || G.ended) return false;
    var ai = G.ai;
    if (candidate.idx < 0 || candidate.idx >= ai.hand.length || ai.hand[candidate.idx] !== candidate.card.id || ai.energy < candidate.cost) return false;
    ai.energy -= candidate.cost;
    if (candidate.usesCostReduction) ai.costReduction = 0;
    if (candidate.usesSteady) ai.passiveTriggered.steady = true;
    ai.hand.splice(candidate.idx, 1);
    executeCardEffect(candidate.card, ai, G.player);
    log("play", "AI 打出【" + candidate.card.name + "】" + (suffix || ""));
    checkMilestones(ai);
    checkWin();
    return true;
  }

  function canAIForceLethal() {
    var ai = G.ai;
    var energy = ai.energy;
    var steadyReady = ai.skills.some(function (s) { return s.id === "steady"; }) && !ai.passiveTriggered.steady;
    var reduction = ai.costReduction;
    var damage = 0;
    ai.hand.forEach(function (id) {
      var card = CARD_MAP[id];
      if (card.target !== "enemy") return;
      var cost = card.useCost;
      if (reduction > 0) { cost = Math.max(1, cost - reduction); reduction = 0; }
      if (steadyReady && card.weight >= 12) { cost = Math.max(1, cost - 1); steadyReady = false; }
      if (energy < cost) return;
      energy -= cost;
      damage += parseDamage(card);
    });
    return damage >= G.player.hp + G.player.shield;
  }

  function aiAction() {
    if (G.ended) return;
    if (activeDialog) { setTimeout(aiAction, 250); return; }
    var ai = G.ai;
    var pl = G.player;

    if (canAIForceLethal()) {
      var lethalAttack;
      while (!G.ended && (lethalAttack = getAICandidate(function (card) { return card.target === "enemy"; }))) {
        playAICandidate(lethalAttack, "");
      }
    } else {
      if (ai.hp < ai.maxHp * 0.35) {
        playAICandidate(getAICandidate(function (card) { return card.type === "防御" || card.type === "治疗"; }), "（防守）");
      }
      if (!G.ended) playAICandidate(getAICandidate(function (card) { return card.target === "enemy"; }), "");
      if (!G.ended) playAICandidate(getAICandidate(function (card) { return card.type === "GPA"; }), "");

      if (!G.ended && ai.energy >= 3) {
        var bestBuy = null;
        ai.shop.forEach(function (cid, si) {
          if (!cid) return;
          var card = CARD_MAP[cid];
          if (ai.energy >= card.buyCost && (!bestBuy || card.weight > bestBuy.card.weight)) bestBuy = { idx: si, card: card };
        });
        if (bestBuy) {
          ai.energy -= bestBuy.card.buyCost;
          ai.shop[bestBuy.idx] = null;
          if (ai.unlocked.indexOf(bestBuy.card.id) < 0) ai.unlocked.push(bestBuy.card.id);
          for (var i = 0; i < bestBuy.card.weight; i++) ai.deck.unshift(bestBuy.card.id);
          log("buy", "AI 购买【" + bestBuy.card.name + "】");
          if (!ai.gpaBuy && ai.gpaThisTurn < 0.3) { addGpa(ai, 0.1); ai.gpaBuy = true; }
          checkMilestones(ai);
          checkWin();
        }
      }

      if (!G.ended) {
        ai.skills.forEach(function (sk) {
          var def = SKILL_MAP[sk.id];
          if (def.isPassive || sk.cooldown > 0 || ai.energy < (def.energyCost || 0)) return;
          if (sk.id === "breathe" && ai.hp < ai.maxHp * 0.6) {
            ai.energy -= def.energyCost;
            sk.cooldown = def.cooldown;
            healPlayer(ai, 8);
            log("heal", "AI 使用【深呼吸】");
            checkMilestones(ai);
          }
        });
      }
    }

    if (G.ended) return;
    G.turn++;
    log("system", "—— 回合 " + G.turn + "：你的回合 ——");
    if (G.turn > 15) {
      var playerHpPct = G.player.hp / G.player.maxHp;
      var aiHpPct = ai.hp / ai.maxHp;
      if (G.player.gpa > ai.gpa) { endGame("player", "回合超限，GPA 更高者胜"); }
      else if (ai.gpa > G.player.gpa) { endGame("ai", "回合超限，GPA 更高者胜"); }
      else if (playerHpPct > aiHpPct) { endGame("player", "回合超限，生命百分比更高者胜"); }
      else { endGame("ai", "回合超限，AI 生命百分比更高"); }
      return;
    }
    startPlayerTurn();
  }

  // ===== 卡牌效果执行 =====
  function executeCardEffect(card, caster, target) {
    switch (card.id) {
      case "basic_q": dealDamage(caster, target, 8); break;
      case "hard_q": dealDamage(caster, target, 17); break;
      case "precise":
        if (target.shield > 0) {
          var removed = Math.min(target.shield, 8);
          target.shield -= removed;
          log("shield", "移除 " + removed + " 护盾");
        }
        dealDamage(caster, target, 10);
        break;
      case "break_time": caster.shield += 10; gpaFromDefense(caster, 10); log("shield", caster.name + " 获得 10 护盾"); break;
      case "early_sleep": healPlayer(caster, 14); gpaFromDefense(caster, 14); break;
      case "routine": caster.shield += 8; healPlayer(caster, 7); gpaFromDefense(caster, 15); break;
      case "preview": drawCards(caster, 2); if (caster.hand.length > 0) caster.deck.unshift(caster.hand.pop()); break;
      case "time_mgmt": caster.nextEnergyBonus = 2; break;
      case "study_plan": drawCards(caster, 1); break;
      case "homework": addGpa(caster, 0.1); break;
      case "quiz":
        var dmg = dealDamage(caster, target, 5);
        if (dmg > 0) addGpa(caster, 0.1);
        break;
      case "scholarship":
        var diff = target.gpa - caster.gpa;
        var gain = diff >= 0.5 ? 3 : 1;
        caster.energy = Math.min(10, caster.energy + gain);
        log("system", caster.name + " 获得 " + gain + " 能量");
        break;
    }
  }

  function parseDamage(card) {
    if (card.id === "basic_q") return 8;
    if (card.id === "hard_q") return 17;
    if (card.id === "precise") return 10;
    if (card.id === "quiz") return 5;
    return 0;
  }

  function dealDamage(caster, target, amount) {
    var remaining = amount;
    if (target.shield > 0) {
      var absorbed = Math.min(target.shield, remaining);
      target.shield -= absorbed;
      remaining -= absorbed;
      log("shield", target.name + " 护盾吸收 " + absorbed + " 伤害");
    }
    if (remaining > 0) {
      target.hp -= remaining;
      log("damage", target.name + " 受到 " + remaining + " 伤害");
      // GPA from attack
      if (amount >= 8 && !caster.gpaAttack && caster.gpaThisTurn < 0.3) {
        caster.gpa += 0.1; caster.gpaAttack = true; caster.gpaThisTurn += 0.1;
        log("gpa", caster.name + " GPA +0.1（攻击）");
      }
      // comeback skill
      if (target === caster) return remaining; // self damage doesn't trigger comeback
    }
    // comeback passive
    if (target === caster) return remaining;
    var cb = target.skills.find(function (s) { return s.id === "comeback"; });
    if (cb && !target.passiveTriggered.comeback && target.hp > 0 && target.hp <= target.maxHp * 0.4) {
      target.passiveTriggered.comeback = true;
      target.shield += 12;
      target.energy = Math.min(10, target.energy + 2);
      log("system", target.name + " 触发【越挫越勇】：+12 护盾 +2 能量");
    }
    return remaining;
  }

  function healPlayer(p, amount) {
    var before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + amount);
    var healed = p.hp - before;
    if (healed > 0) log("heal", p.name + " 治疗 " + healed);
  }

  function gpaFromDefense(p, totalValue) {
    if (totalValue >= 8 && !p.gpaDefense && p.gpaThisTurn < 0.3) {
      p.gpa += 0.1; p.gpaDefense = true; p.gpaThisTurn += 0.1;
      log("gpa", p.name + " GPA +0.1（防守）");
    }
  }

  function addGpa(p, amount) {
    if (p.gpaThisTurn >= 0.3) return;
    var remaining = 0.3 - p.gpaThisTurn;
    var actual = Math.min(amount, remaining);
    p.gpa += actual; p.gpaThisTurn += actual;
    log("gpa", p.name + " GPA +" + actual.toFixed(1));
  }

  // ===== 里程碑 =====
  function checkMilestones(p) {
    MILESTONES.forEach(function (m) {
      if (p.gpa >= m.gpa && !p.milestonesClaimed[m.gpa]) {
        p.milestonesClaimed[m.gpa] = true;
        log("gpa", p.name + " 达到 GPA " + m.gpa + "：" + m.reward);
        m.effect(p);
      }
    });
  }

  // ===== 胜负检查 =====
  function checkWin() {
    if (G.ended) return;
    var p = G.player, ai = G.ai;
    if (p.gpa >= 4.3) { endGame("player", "GPA 达到 4.3！"); return; }
    if (ai.gpa >= 4.3) { endGame("ai", "AI GPA 达到 4.3"); return; }
    if (p.hp <= 0) { endGame("ai", "你的生命归零"); return; }
    if (ai.hp <= 0) { endGame("player", "击败 AI 对手！"); return; }
    if (p.gpa <= 0) { endGame("ai", "你的 GPA 归零"); return; }
    if (ai.gpa <= 0) { endGame("player", "AI 的 GPA 归零"); return; }
  }

  function endGame(winner, reason) {
    G.ended = true;
    var screen = document.getElementById("endScreen");
    var icon = document.getElementById("endIcon");
    var title = document.getElementById("endTitle");
    var desc = document.getElementById("endDesc");
    if (winner === "player") {
      icon.textContent = ""; icon.className = "gpa-dialog-icon win-icon"; icon.setAttribute("data-ui-icon", "trophy");
      title.textContent = "胜利！";
    } else {
      icon.textContent = ""; icon.className = "gpa-dialog-icon lose-icon"; icon.setAttribute("data-ui-icon", "warning");
      title.textContent = "失败";
    }
    if (window.TZUI && window.TZUI.setIcon) window.TZUI.setIcon(icon, winner === "player" ? "trophy" : "warning");
    desc.innerHTML = reason + "<br/>回合 " + G.turn + "　|　你的 GPA " + G.player.gpa.toFixed(1) + "　|　AI GPA " + G.ai.gpa.toFixed(1);
    announce(title.textContent + "。" + reason);
    openDialog(screen, document.getElementById("playAgainBtn"));
  }

  // ===== 日志 =====
  function log(type, msg) {
    G.log.push({ type: type, msg: msg, turn: G.turn });
    if (G.log.length > 100) G.log.shift();
  }

  // ===== 渲染 =====
  function render() {
    if (!G) return;
    var board = document.getElementById("gameBoard");
    if (G.phase === "config" || G.phase === "supply" || G.phase === "action" || G.phase === "end") {
      board.style.display = "";
    }

    // phase bar
    document.querySelectorAll(".gpa-phase-step").forEach(function (el) {
      el.classList.remove("active", "done");
      el.removeAttribute("aria-current");
      var ph = el.getAttribute("data-phase");
      if (ph === G.phase) {
        el.classList.add("active");
        el.setAttribute("aria-current", "step");
      }
    });

    var isPlayerTurn = G.firstPlayer === "player";
    document.getElementById("playerSide").classList.toggle("active-turn", isPlayerTurn);
    document.getElementById("opponentSide").classList.toggle("active-turn", !isPlayerTurn);
    document.getElementById("playerTurnTag").textContent = isPlayerTurn ? "（你的回合）" : "";
    document.getElementById("aiTurnTag").textContent = isPlayerTurn ? "" : "（AI 回合）";

    // stats
    renderStats("playerStats", G.player);
    renderStats("aiStats", G.ai);

    // hands
    renderPlayerHand();
    renderAIHand();
    document.getElementById("playerHandCount").textContent = "(" + G.player.hand.length + "/7)";
    document.getElementById("aiHandCount").textContent = "(" + G.ai.hand.length + " 张)";
    document.getElementById("deckInfo").textContent = "卡组 " + G.player.deck.length + " 张";

    // shop
    renderShop();

    // skills
    renderSkills();

    // log
    var logEl = document.getElementById("gameLog");
    logEl.innerHTML = G.log.slice(-30).map(function (e) {
      return '<div class="log-' + e.type + '"><span class="log-turn">[T' + e.turn + ']</span> ' + e.msg + "</div>";
    }).join("");
    logEl.scrollTop = logEl.scrollHeight;

    // buttons
    document.getElementById("endTurnBtn").disabled = !isPlayerTurn || G.ended;
    document.getElementById("refreshBtn").disabled = !isPlayerTurn || G.ended;
  }

  function renderStats(elId, p) {
    var el = document.getElementById(elId);
    var hpPct = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100));
    var gpaPct = Math.max(0, Math.min(100, (p.gpa / 4.3) * 100));
    el.innerHTML =
      '<div class="gpa-stat"><span class="gpa-stat-label">生命</span><span class="val hp">' + Math.max(0, p.hp) + '</span><div class="gpa-hp-bar" role="progressbar" aria-label="' + p.name + '生命值" aria-valuemin="0" aria-valuemax="' + p.maxHp + '" aria-valuenow="' + Math.max(0, p.hp) + '"><div class="gpa-hp-bar-fill" style="width:' + hpPct + '%"></div></div></div>' +
      '<div class="gpa-stat"><span class="gpa-stat-label">GPA</span><span class="val gpa">' + p.gpa.toFixed(1) + '</span><div class="gpa-gpa-bar" role="progressbar" aria-label="' + p.name + ' GPA" aria-valuemin="0" aria-valuemax="4.3" aria-valuenow="' + p.gpa.toFixed(1) + '"><div class="gpa-gpa-bar-fill" style="width:' + gpaPct + '%"></div></div></div>' +
      '<div class="gpa-stat"><span class="gpa-stat-label">能量</span><span class="val energy">' + p.energy + '</span></div>' +
      '<div class="gpa-stat"><span class="gpa-stat-label">护盾</span><span class="val shield">' + p.shield + '</span></div>';
  }

  function renderPlayerHand() {
    var el = document.getElementById("playerHand");
    var p = G.player;
    var isMyTurn = G.firstPlayer === "player" && G.phase === "action";
    if (!p.hand.length) {
      el.innerHTML = '<div class="gpa-empty-state" role="status">' + uiGlyph("file") + '<span>手牌为空，下一次补给会自动抽牌</span></div>';
      return;
    }
    el.innerHTML = p.hand.map(function (id, i) {
      var c = CARD_MAP[id];
      var cost = c.useCost;
      var steady = p.skills.find(function (s) { return s.id === "steady"; });
      if (steady && !p.passiveTriggered.steady && c.weight >= 12) cost = Math.max(1, cost - 1);
      if (p.costReduction > 0) cost = Math.max(1, cost - p.costReduction);
      var canPlay = isMyTurn && p.energy >= cost;
      return '<button type="button" class="gpa-card' + (canPlay ? "" : " disabled") + '" data-idx="' + i + '"' + (canPlay ? "" : " disabled") + ' aria-label="' + c.name + '，' + c.type + '，' + c.desc + '，使用能量 ' + cost + '">' +
        '<span class="gpa-card-name">' + c.name + '</span>' +
        '<span class="gpa-card-type ' + c.type + '">' + uiGlyph(CARD_TYPE_ICON[c.type] || "file") + c.type + '</span>' +
        '<span class="gpa-card-desc">' + c.desc + '</span>' +
        '<span class="gpa-card-cost">' +
          '<span class="cost-use">' + uiGlyph("lightning") + '<b>' + cost + '</b></span>' +
          '<span class="cost-buy">' + uiGlyph("cart") + '<b>' + c.buyCost + '</b></span>' +
          '<span class="cost-wt">' + uiGlyph("info") + '<b>' + c.weight + '</b></span>' +
        '</span></button>';
    }).join("");
    el.querySelectorAll(".gpa-card").forEach(function (card) {
      card.addEventListener("click", function () {
        var idx = parseInt(this.getAttribute("data-idx"));
        playCard(idx);
      });
    });
  }

  function renderAIHand() {
    var el = document.getElementById("aiHand");
    if (!G.ai.hand.length) {
      el.innerHTML = '<div class="gpa-empty-state">' + uiGlyph("file") + '<span>AI 手牌为空</span></div>';
      return;
    }
    el.innerHTML = G.ai.hand.map(function (_, i) {
      return '<div class="gpa-card-back" role="img" aria-label="AI 手牌 ' + (i + 1) + '">' + uiGlyph("file") + '</div>';
    }).join("");
  }

  function renderShop() {
    var el = document.getElementById("shopArea");
    var p = G.player;
    var isMyTurn = G.firstPlayer === "player";
    el.innerHTML = p.shop.map(function (cid, i) {
      if (!cid) return '<div class="gpa-shop-slot empty" aria-label="此商店位已购买">已购买</div>';
      var c = CARD_MAP[cid];
      var canBuy = isMyTurn && p.energy >= c.buyCost;
      return '<button type="button" class="gpa-shop-slot has-card' + (canBuy ? "" : " disabled") + '" data-idx="' + i + '"' + (canBuy ? "" : " disabled") + ' aria-label="购买 ' + c.name + '，' + c.desc + '，需要能量 ' + c.buyCost + '">' +
        '<span class="gpa-shop-card-body">' +
        '<span class="gpa-card-name">' + c.name + '</span>' +
        '<span class="gpa-card-type ' + c.type + '">' + uiGlyph(CARD_TYPE_ICON[c.type] || "file") + c.type + '</span>' +
        '<span class="gpa-card-desc">' + c.desc + '</span>' +
        '<span class="gpa-card-cost"><span class="cost-buy">' + uiGlyph("cart") + '<b>' + c.buyCost + '</b></span><span class="cost-wt">' + uiGlyph("info") + '<b>' + c.weight + '</b></span></span>' +
        '</span></button>';
    }).join("");
    el.querySelectorAll(".gpa-shop-slot.has-card").forEach(function (slot) {
      slot.addEventListener("click", function () {
        var idx = parseInt(this.getAttribute("data-idx"));
        buyCard(idx);
      });
    });
  }

  function renderSkills() {
    var el = document.getElementById("playerSkills");
    var p = G.player;
    el.innerHTML = p.skills.map(function (sk, i) {
      var def = SKILL_MAP[sk.id];
      if (def.isPassive) {
        return '<span class="gpa-skill-chip is-passive" role="note" aria-label="被动技能 ' + def.name + '，' + def.desc + '">' + uiGlyph("shield") + def.name + '</span>';
      }
      var ready = !def.isPassive && sk.cooldown === 0 && p.energy >= (def.energyCost || 0) && G.firstPlayer === "player" && G.phase === "action";
      var cls = "gpa-skill-chip" + (ready ? " ready" : "") + (sk.cooldown > 0 ? " on-cd" : "");
      var cd = sk.cooldown > 0 ? ' <span class="cd-tag">CD' + sk.cooldown + '</span>' : "";
      return '<button type="button" class="' + cls + '" data-idx="' + i + '"' + (ready ? "" : " disabled") + ' aria-label="技能 ' + def.name + '，' + def.desc + '">' + uiGlyph("lightning") + def.name + cd + '</button>';
    }).join("");
    el.querySelectorAll(".gpa-skill-chip.ready").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var idx = parseInt(this.getAttribute("data-idx"));
        useSkill(idx);
      });
    });
  }

  // ===== Toast =====
  function toast(msg) {
    var el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2000);
  }

  // ===== 开始界面 =====
  function initStartScreen() {
    var container = document.getElementById("skillPick");
    var startButton = document.getElementById("startBtn");
    var status = document.getElementById("skillPickStatus");
    container.innerHTML = SKILLS.map(function (s) {
      return '<button type="button" class="gpa-skill-option" data-id="' + s.id + '" data-kind="' + (s.isPassive ? "passive" : "active") + '" aria-pressed="false">' +
        '<span class="sk-name">' + uiGlyph(s.isPassive ? "shield" : "lightning") + s.name + '</span>' +
        '<span class="sk-type">' + (s.isPassive ? "被动" : "主动") + (s.cooldown ? " · CD" + s.cooldown : "") + '</span>' +
        '<span class="sk-desc">' + s.desc + '</span>' +
        '<span class="sk-cost">生命成本 ' + s.hpCost + (s.energyCost ? " · 能量 " + s.energyCost : "") + '</span>' +
        '</button>';
    }).join("");

    function selectedOption(kind) {
      return container.querySelector('.gpa-skill-option.selected[data-kind="' + kind + '"]');
    }

    function syncSelectionState() {
      var passive = selectedOption("passive");
      var active = selectedOption("active");
      startButton.disabled = !(passive && active);
      if (passive && active) {
        status.textContent = "已选：" + SKILL_MAP[passive.getAttribute("data-id")].name + " + " + SKILL_MAP[active.getAttribute("data-id")].name + "。可以启动对局。";
      } else if (passive) {
        status.textContent = "已选择被动技能，请再选择一项主动技能。";
      } else if (active) {
        status.textContent = "已选择主动技能，请再选择一项被动技能。";
      } else {
        status.textContent = "请选择一项被动技能和一项主动技能。";
      }
    }

    container.addEventListener("click", function (event) {
      var option = event.target.closest(".gpa-skill-option");
      if (!option || !container.contains(option)) return;
      var kind = option.getAttribute("data-kind");
      container.querySelectorAll('.gpa-skill-option[data-kind="' + kind + '"]').forEach(function (item) {
        item.classList.remove("selected");
        item.setAttribute("aria-pressed", "false");
      });
      option.classList.add("selected");
      option.setAttribute("aria-pressed", "true");
      syncSelectionState();
    });

    startButton.addEventListener("click", function () {
      var passive = selectedOption("passive");
      var active = selectedOption("active");
      if (!passive || !active) {
        syncSelectionState();
        return;
      }
      var picked = [
        SKILL_MAP[passive.getAttribute("data-id")],
        SKILL_MAP[active.getAttribute("data-id")]
      ];
      startButton.disabled = true;
      try {
        document.getElementById("gameBoard").style.display = "";
        newGame(picked);
        closeDialog(document.getElementById("startScreen"), false);
      } catch (error) {
        document.getElementById("gameBoard").style.display = "none";
        startButton.disabled = false;
        status.textContent = "对局启动失败，请重试。";
        console.error("GPA game start failed", error);
        return;
      }
      var board = document.getElementById("gameBoard");
      var focusTarget = G.firstPlayer === "player" ? getFocusable(document.getElementById("playerSide"))[0] : document.getElementById("helpBtn");
      focusWithoutScroll(focusTarget);
      keepBoardBelowTopbar(board);
    });
  }

  // ===== 事件绑定 =====
  document.getElementById("endTurnBtn").addEventListener("click", endTurn);
  document.getElementById("refreshBtn").addEventListener("click", refreshShopManual);
  document.getElementById("restartBtn").addEventListener("click", function () {
    openDialog(document.getElementById("restartScreen"), document.getElementById("cancelRestartBtn"));
  });
  document.getElementById("cancelRestartBtn").addEventListener("click", function () {
    closeDialog(document.getElementById("restartScreen"));
  });
  document.getElementById("confirmRestartBtn").addEventListener("click", function () { location.reload(); });
  document.getElementById("playAgainBtn").addEventListener("click", function () { location.reload(); });
  document.getElementById("helpBtn").addEventListener("click", function () {
    openDialog(document.getElementById("helpScreen"), document.getElementById("closeHelpBtn"));
  });
  document.getElementById("closeHelpBtn").addEventListener("click", function () {
    closeDialog(document.getElementById("helpScreen"));
  });
  document.getElementById("helpScreen").addEventListener("click", function (event) {
    if (event.target === this) closeDialog(this);
  });
  document.getElementById("restartScreen").addEventListener("click", function (event) {
    if (event.target === this) closeDialog(this);
  });
  document.addEventListener("keydown", function (event) {
    if (!activeDialog) return;
    if (event.key === "Escape" && (activeDialog.id === "helpScreen" || activeDialog.id === "restartScreen")) {
      event.preventDefault();
      closeDialog(activeDialog);
      return;
    }
    if (event.key !== "Tab") return;
    var focusable = getFocusable(activeDialog);
    if (!focusable.length) { event.preventDefault(); return; }
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (!activeDialog.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  // ===== 初始化 =====
  initStartScreen();
  activeDialog = document.getElementById("startScreen");
  var initialFocus = getFocusable(activeDialog)[0] || activeDialog.querySelector(".gpa-overlay-card");
  if (initialFocus) initialFocus.focus();
})();
