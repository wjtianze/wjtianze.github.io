/* ============================================================
   绩点战争：GPA 4.3 — 内测版 v0.1
   单文件游戏逻辑，玩家 vs AI
   ============================================================ */
(function () {
  "use strict";

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
        milestonesClaimed: {}, costReduction: 0, nextEnergyBonus: 0,
        gpaThisTurn: 0, gpaAttack: false, gpaDefense: false, gpaBuy: false,
        passiveTriggered: {}
      },
      ai: {
        name: "AI 对手", hp: 95, maxHp: 95, shield: 0, energy: 3, gpa: 1.0,
        deck: [], hand: [], shop: [], unlocked: CARDS.map(function (c) { return c.id; }),
        skills: [{ id: "steady", cooldown: 0, used: false }, { id: "adjust", cooldown: 0, used: false }],
        milestonesClaimed: {}, costReduction: 0, nextEnergyBonus: 0,
        gpaThisTurn: 0, gpaAttack: false, gpaDefense: false, gpaBuy: false,
        passiveTriggered: {}
      },
      log: [],
      ended: false
    };
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
      G.phase = "config";
      log("system", "你的回合——配卡阶段");
      render();
    }
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
    if (p.costReduction > 0) { cost = Math.max(1, cost - p.costReduction); p.costReduction = 0; }
    // steady skill
    var steady = p.skills.find(function (s) { return s.id === "steady"; });
    if (steady && !p.passiveTriggered.steady && card.weight >= 12) {
      cost = Math.max(1, cost - 1);
      p.passiveTriggered.steady = true;
    }
    if (p.energy < cost) { toast("能量不足"); return; }
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
    if (!p.gpaBuy) { p.gpa += 0.1; p.gpaBuy = true; p.gpaThisTurn += 0.1; }
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
    var p = G.player;
    // clear shield
    p.shield = 0;
    // reset per-turn flags
    p.gpaThisTurn = 0; p.gpaAttack = false; p.gpaDefense = false; p.gpaBuy = false;
    p.passiveTriggered = {};
    p.costReduction = 0;
    // reduce cooldowns
    p.skills.forEach(function (sk) { if (sk.cooldown > 0) sk.cooldown--; });
    G.turn++;
    G.firstPlayer = "ai";
    G.phase = "supply";
    log("system", "—— 回合 " + G.turn + "：AI 的回合 ——");
    render();
  }

  // ===== AI 回合 =====
  function aiTurn() {
    if (G.ended) return;
    var ai = G.ai;
    var pl = G.player;
    // supply phase
    ai.energy = Math.min(10, ai.energy + 3 + ai.nextEnergyBonus);
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

    // AI decisions
    setTimeout(aiAction, 500);
  }

  function aiAction() {
    if (G.ended) return;
    var ai = G.ai;
    var pl = G.player;

    // 1. Check if can win by attacking
    var lethal = false;
    var playable = ai.hand.map(function (id, i) {
      var c = CARD_MAP[id];
      var cost = c.useCost;
      var steady = ai.skills.find(function (s) { return s.id === "steady"; });
      if (steady && !ai.passiveTriggered.steady && c.weight >= 12) { cost = Math.max(1, cost - 1); }
      return { idx: i, card: c, cost: cost, affordable: ai.energy >= cost };
    }).filter(function (x) { return x.affordable; });

    // Calculate total possible damage
    var totalDmg = 0;
    playable.forEach(function (x) {
      if (x.card.target === "enemy") {
        var dmg = parseDamage(x.card);
        if (x.card.id === "precise") dmg += Math.min(pl.shield, 8);
        totalDmg += dmg;
      }
    });

    if (totalDmg >= pl.hp + pl.shield) {
      // lethal: play all attacks
      playable.forEach(function (x) {
        if (G.ended) return;
        if (x.card.target === "enemy" && ai.energy >= x.cost) {
          ai.energy -= x.cost;
          if (ai.skills.find(function (s) { return s.id === "steady"; }) && !ai.passiveTriggered.steady && x.card.weight >= 12) ai.passiveTriggered.steady = true;
          ai.hand.splice(x.idx, 1);
          executeCardEffect(x.card, ai, pl);
          log("play", "AI 打出【" + x.card.name + "】");
          checkMilestones(ai);
          checkWin();
        }
      });
    } else {
      // 2. If low HP, try to defend/heal
      if (ai.hp < ai.maxHp * 0.35) {
        var defense = playable.find(function (x) { return x.card.type === "防御" || x.card.type === "治疗"; });
        if (defense) {
          ai.energy -= defense.cost;
          ai.hand.splice(defense.idx, 1);
          executeCardEffect(defense.card, ai, pl);
          log("play", "AI 打出【" + defense.card.name + "】（防守）");
          checkMilestones(ai);
          checkWin();
        }
      }
      // 3. Try to play an attack if affordable
      if (!G.ended) {
        var attack = playable.find(function (x) { return x.card.target === "enemy"; });
        if (attack && ai.energy >= attack.cost) {
          ai.energy -= attack.cost;
          if (ai.skills.find(function (s) { return s.id === "steady"; }) && !ai.passiveTriggered.steady && attack.card.weight >= 12) ai.passiveTriggered.steady = true;
          ai.hand.splice(attack.idx, 1);
          executeCardEffect(attack.card, ai, pl);
          log("play", "AI 打出【" + attack.card.name + "】");
          checkMilestones(ai);
          checkWin();
        }
      }
      // 4. Try to play a GPA card
      if (!G.ended) {
        var gpaCard = playable.find(function (x) { return x.card.type === "GPA"; });
        if (gpaCard && ai.energy >= gpaCard.cost) {
          ai.energy -= gpaCard.cost;
          ai.hand.splice(gpaCard.idx, 1);
          executeCardEffect(gpaCard.card, ai, pl);
          log("gpa", "AI 打出【" + gpaCard.card.name + "】");
          checkMilestones(ai);
          checkWin();
        }
      }
      // 5. Buy a card if energy remaining
      if (!G.ended && ai.energy >= 3) {
        var bestBuy = null;
        ai.shop.forEach(function (cid, si) {
          if (!cid) return;
          var c = CARD_MAP[cid];
          if (ai.energy >= c.buyCost) {
            if (!bestBuy || c.weight > bestBuy.card.weight) bestBuy = { idx: si, card: c };
          }
        });
        if (bestBuy) {
          ai.energy -= bestBuy.card.buyCost;
          ai.shop[bestBuy.idx] = null;
          if (ai.unlocked.indexOf(bestBuy.card.id) < 0) ai.unlocked.push(bestBuy.card.id);
          for (var i = 0; i < bestBuy.card.weight; i++) ai.deck.unshift(bestBuy.card.id);
          log("buy", "AI 购买【" + bestBuy.card.name + "】");
          if (!ai.gpaBuy) { ai.gpa += 0.1; ai.gpaBuy = true; ai.gpaThisTurn += 0.1; }
          checkMilestones(ai);
          checkWin();
        }
      }
      // 6. Use skill if available
      if (!G.ended) {
        ai.skills.forEach(function (sk, si) {
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

    // End AI turn
    if (G.ended) return;
    ai.shield = 0;
    ai.gpaThisTurn = 0; ai.gpaAttack = false; ai.gpaDefense = false; ai.gpaBuy = false;
    ai.passiveTriggered = {};
    ai.costReduction = 0;
    ai.skills.forEach(function (sk) { if (sk.cooldown > 0) sk.cooldown--; });
    G.turn++;
    G.firstPlayer = "player";
    // player supply
    var pp = G.player;
    pp.energy = Math.min(10, pp.energy + 3 + pp.nextEnergyBonus);
    pp.nextEnergyBonus = 0;
    pp.shield = 0;
    pp.gpaThisTurn = 0; pp.gpaAttack = false; pp.gpaDefense = false; pp.gpaBuy = false;
    pp.passiveTriggered = {};
    pp.costReduction = 0;
    pp.skills.forEach(function (sk) { if (sk.cooldown > 0) sk.cooldown--; });
    drawCards(pp, 5 - pp.hand.length);
    if (pp.hand.length < 5) drawCards(pp, 5 - pp.hand.length);
    refreshShop(pp);
    G.phase = "config";
    log("system", "—— 回合 " + G.turn + "：你的回合 ——");
    // check turn limit
    if (G.turn > 15) {
      // sudden death
      if (pp.gpa > ai.gpa) { endGame("player", "回合超限，GPA 更高者胜"); }
      else if (ai.gpa > pp.gpa) { endGame("ai", "回合超限，GPA 更高者胜"); }
      else if (pp.hp > ai.hp) { endGame("player", "回合超限，生命百分比更高者胜"); }
      else { endGame("ai", "回合超限，AI 生命百分比更高"); }
      return;
    }
    render();
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
      icon.textContent = "🏆"; icon.className = "win-icon";
      title.textContent = "胜利！";
    } else {
      icon.textContent = "💀"; icon.className = "lose-icon";
      title.textContent = "失败";
    }
    desc.innerHTML = reason + "<br/>回合 " + G.turn + "　|　你的 GPA " + G.player.gpa.toFixed(1) + "　|　AI GPA " + G.ai.gpa.toFixed(1);
    screen.classList.remove("hidden");
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
      var ph = el.getAttribute("data-phase");
      if (ph === G.phase) el.classList.add("active");
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
      '<div class="gpa-stat"><label>生命</label><span class="val hp">' + Math.max(0, p.hp) + '</span><div class="gpa-hp-bar"><div class="gpa-hp-bar-fill" style="width:' + hpPct + '%"></div></div></div>' +
      '<div class="gpa-stat"><label>GPA</label><span class="val gpa">' + p.gpa.toFixed(1) + '</span><div class="gpa-gpa-bar"><div class="gpa-gpa-bar-fill" style="width:' + gpaPct + '%"></div></div></div>' +
      '<div class="gpa-stat"><label>能量</label><span class="val energy">' + p.energy + '</span></div>' +
      '<div class="gpa-stat"><label>护盾</label><span class="val shield">' + p.shield + '</span></div>';
  }

  function renderPlayerHand() {
    var el = document.getElementById("playerHand");
    var p = G.player;
    var isMyTurn = G.firstPlayer === "player" && G.phase === "action";
    el.innerHTML = p.hand.map(function (id, i) {
      var c = CARD_MAP[id];
      var cost = c.useCost;
      var steady = p.skills.find(function (s) { return s.id === "steady"; });
      if (steady && !p.passiveTriggered.steady && c.weight >= 12) cost = Math.max(1, cost - 1);
      if (p.costReduction > 0) cost = Math.max(1, cost - p.costReduction);
      var canPlay = isMyTurn && p.energy >= cost;
      return '<div class="gpa-card' + (canPlay ? "" : " disabled") + '" data-idx="' + i + '">' +
        '<div class="gpa-card-name">' + c.name + '</div>' +
        '<span class="gpa-card-type ' + c.type + '">' + c.type + '</span>' +
        '<div class="gpa-card-desc">' + c.desc + '</div>' +
        '<div class="gpa-card-cost">' +
          '<span class="cost-use">⚡' + cost + '</span>' +
          '<span class="cost-buy">💰' + c.buyCost + '</span>' +
          '<span class="cost-wt">⚖' + c.weight + '</span>' +
        '</div></div>';
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
    el.innerHTML = G.ai.hand.map(function () {
      return '<div class="gpa-card-back">🂠</div>';
    }).join("");
  }

  function renderShop() {
    var el = document.getElementById("shopArea");
    var p = G.player;
    var isMyTurn = G.firstPlayer === "player";
    el.innerHTML = p.shop.map(function (cid, i) {
      if (!cid) return '<div class="gpa-shop-slot empty">已购买</div>';
      var c = CARD_MAP[cid];
      var canBuy = isMyTurn && p.energy >= c.buyCost;
      return '<div class="gpa-shop-slot has-card' + (canBuy ? "" : " disabled") + '" data-idx="' + i + '">' +
        '<div style="width:100%;">' +
        '<div class="gpa-card-name">' + c.name + '</div>' +
        '<span class="gpa-card-type ' + c.type + '">' + c.type + '</span>' +
        '<div class="gpa-card-desc">' + c.desc + '</div>' +
        '<div class="gpa-card-cost"><span class="cost-buy">💰' + c.buyCost + '</span><span class="cost-wt">⚖' + c.weight + '</span></div>' +
        '</div></div>';
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
      var ready = !def.isPassive && sk.cooldown === 0 && p.energy >= (def.energyCost || 0) && G.firstPlayer === "player" && G.phase === "action";
      var cls = "gpa-skill-chip" + (ready ? " ready" : "") + (sk.cooldown > 0 ? " on-cd" : "");
      var cd = sk.cooldown > 0 ? ' <span class="cd-tag">CD' + sk.cooldown + '</span>' : "";
      return '<div class="' + cls + '" data-idx="' + i + '">' + def.name + cd + '</div>';
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
    setTimeout(function () { el.classList.remove("show"); }, 2000);
  }

  // ===== 开始界面 =====
  function initStartScreen() {
    var container = document.getElementById("skillPick");
    var selected = { passive: null, active: null };
    container.innerHTML = SKILLS.map(function (s) {
      return '<div class="gpa-skill-option" data-id="' + s.id + '">' +
        '<div class="sk-name">' + s.name + '</div>' +
        '<div class="sk-type">' + (s.isPassive ? "被动" : "主动") + (s.cooldown ? " · CD" + s.cooldown : "") + '</div>' +
        '<div class="sk-desc">' + s.desc + '</div>' +
        '<div class="sk-cost">生命成本 ' + s.hpCost + (s.energyCost ? " · 能量 " + s.energyCost : "") + '</div>' +
        '</div>';
    }).join("");
    container.querySelectorAll(".gpa-skill-option").forEach(function (el) {
      el.addEventListener("click", function () {
        var id = this.getAttribute("data-id");
        var skill = SKILL_MAP[id];
        if (skill.isPassive) {
          container.querySelectorAll(".gpa-skill-option").forEach(function (e) {
            var sid = e.getAttribute("data-id");
            if (SKILL_MAP[sid].isPassive) e.classList.remove("selected");
          });
          selected.passive = id;
        } else {
          container.querySelectorAll(".gpa-skill-option").forEach(function (e) {
            var sid = e.getAttribute("data-id");
            if (!SKILL_MAP[sid].isPassive) e.classList.remove("selected");
          });
          selected.active = id;
        }
        this.classList.add("selected");
        document.getElementById("startBtn").disabled = !(selected.passive && selected.active);
      });
    });
    document.getElementById("startBtn").addEventListener("click", function () {
      if (!selected.passive || !selected.active) return;
      var picked = [SKILL_MAP[selected.passive], SKILL_MAP[selected.active]];
      document.getElementById("startScreen").classList.add("hidden");
      document.getElementById("gameBoard").style.display = "";
      newGame(picked);
    });
  }

  // ===== 事件绑定 =====
  document.getElementById("endTurnBtn").addEventListener("click", endTurn);
  document.getElementById("refreshBtn").addEventListener("click", refreshShopManual);
  document.getElementById("restartBtn").addEventListener("click", function () { location.reload(); });
  document.getElementById("playAgainBtn").addEventListener("click", function () { location.reload(); });
  document.getElementById("helpBtn").addEventListener("click", function () {
    document.getElementById("helpScreen").classList.remove("hidden");
  });
  document.getElementById("closeHelpBtn").addEventListener("click", function () {
    document.getElementById("helpScreen").classList.add("hidden");
  });

  // ===== 初始化 =====
  initStartScreen();
})();
