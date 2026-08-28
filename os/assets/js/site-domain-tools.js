/* 天择网站内助手的确定性领域工具：不持有密钥，不调用模型。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TZSiteDomainTools = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const GPA_STORAGE_KEY = 'tz_site_ai_gpa_war_v1';
  const WORDS_STORAGE_KEY = 'tz_site_ai_words_session_v1';
  const GPA_CARDS = Object.freeze([
    { id: 'basic_q', name: '基础题', type: '攻击', buyCost: 2, useCost: 1, weight: 14, desc: '造成 8 伤害' },
    { id: 'hard_q', name: '难题突破', type: '攻击', buyCost: 4, useCost: 2, weight: 9, desc: '造成 17 伤害' },
    { id: 'precise', name: '精准纠错', type: '攻击', buyCost: 4, useCost: 2, weight: 8, desc: '移除最多 8 护盾，再造成 10 伤害' },
    { id: 'break_time', name: '课间休息', type: '防御', buyCost: 2, useCost: 1, weight: 14, desc: '获得 10 护盾' },
    { id: 'early_sleep', name: '早睡', type: '治疗', buyCost: 4, useCost: 2, weight: 9, desc: '治疗 14' },
    { id: 'routine', name: '规律作息', type: '防御', buyCost: 5, useCost: 2, weight: 8, desc: '获得 8 护盾并治疗 7' },
    { id: 'preview', name: '预习', type: '过牌', buyCost: 3, useCost: 1, weight: 10, desc: '抽 2 张，再放回 1 张手牌' },
    { id: 'time_mgmt', name: '时间管理', type: '资源', buyCost: 4, useCost: 1, weight: 8, desc: '下回合补给额外 +2 能量' },
    { id: 'study_plan', name: '学习计划', type: '检索', buyCost: 4, useCost: 2, weight: 8, desc: '按权重从卡组抽 1 张' },
    { id: 'homework', name: '平时作业', type: 'GPA', buyCost: 2, useCost: 1, weight: 12, desc: '获得 0.1 GPA' },
    { id: 'quiz', name: '小测验', type: '攻击', buyCost: 3, useCost: 1, weight: 10, desc: '造成 5 伤害；若造成伤害，获得 0.1 GPA' },
    { id: 'scholarship', name: '奖学金', type: '逆风', buyCost: 5, useCost: 1, weight: 6, desc: 'GPA 落后至少 0.5 时获得 3 能量，否则获得 1 能量' }
  ]);
  const GPA_SKILLS = Object.freeze([
    { id: 'steady', name: '稳扎稳打', type: '被动', hpCost: 15, desc: '每回合首张权重至少 12 的牌使用成本减 1（最低 1）' },
    { id: 'comeback', name: '越挫越勇', type: '被动', hpCost: 20, desc: '首次降到 40% 生命时获得 12 护盾和 2 能量' },
    { id: 'adjust', name: '临场调整', type: '主动', hpCost: 10, energyCost: 1, cooldown: 2, desc: '放回 1 张手牌，重抽 1 张' },
    { id: 'breathe', name: '深呼吸', type: '主动', hpCost: 10, energyCost: 1, cooldown: 3, desc: '治疗 8' }
  ]);
  const CARD_MAP = Object.freeze(Object.fromEntries(GPA_CARDS.map(card => [card.id, card])));
  const SKILL_MAP = Object.freeze(Object.fromEntries(GPA_SKILLS.map(skill => [skill.id, skill])));
  const WORD_STAGES = Object.freeze([
    { id: 'preview', name: '英译中预习', mode: 'en2cn', preview: true },
    { id: 'recall', name: '中译英回忆', mode: 'cn2en' },
    { id: 'distinguish', name: '英译中辨析', mode: 'en2cn' },
    { id: 'spell', name: '完整拼写', mode: 'spell' }
  ]);

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function integer(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : (fallback || 0);
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function copy(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function shuffle(values, random) {
    const result = values.slice();
    const rng = typeof random === 'function' ? random : Math.random;
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = Math.floor(rng() * (index + 1));
      const current = result[index]; result[index] = result[target]; result[target] = current;
    }
    return result;
  }
  function readJson(storage, key) {
    if (!storage || typeof storage.getItem !== 'function') return null;
    try { return JSON.parse(storage.getItem(key) || 'null'); } catch (_) { return null; }
  }
  function writeJson(storage, key, value) {
    if (!storage || typeof storage.setItem !== 'function') return;
    storage.setItem(key, JSON.stringify(value));
  }
  function formatDuration(seconds) {
    let left = Math.max(0, Math.round(number(seconds)));
    const days = Math.floor(left / 86400); left %= 86400;
    const hours = Math.floor(left / 3600); left %= 3600;
    const minutes = Math.floor(left / 60);
    const parts = [];
    if (days) parts.push(days + ' 天');
    if (hours) parts.push(hours + ' 小时');
    if (minutes) parts.push(minutes + ' 分钟');
    if (!parts.length) parts.push(left + ' 秒');
    return parts.join(' ');
  }

  function villageLane(task) {
    const category = String(task && task.cat || '');
    const world = task && task.world === 'bb' ? 'bb' : 'home';
    if (/兵|法术|攻城机器/.test(category)) return world === 'bb' ? 'bb_lab' : 'home_lab';
    if (/战宠/.test(category)) return 'home_pet';
    return world === 'bb' ? 'bb_builder' : 'home_builder';
  }
  function analyzeVillage(rawVillage) {
    const stored = rawVillage && rawVillage.value ? rawVillage.value : rawVillage;
    if (!stored || !stored.village) throw new Error('没有可分析的村庄存档，请先在 COC 专区导入完整村庄 JSON');
    const tasks = Array.isArray(stored.tasks) ? stored.tasks : [];
    if (!tasks.length) throw new Error('当前村庄存档没有待升级任务；若并非满级，请回到 COC 专区重新解析完整村庄 JSON');
    const base = stored.baseWC || {};
    const slots = {
      home_builder: Math.max(1, integer(base.home_builder, 5) + integer(stored.gobWorker)),
      home_lab: Math.max(1, integer(base.home_lab, 1) + integer(stored.gobLab)),
      home_pet: Math.max(0, integer(base.home_pet)),
      bb_builder: Math.max(1, integer(base.bb_builder, 1)),
      bb_lab: Math.max(1, integer(base.bb_lab, 1))
    };
    const groups = {};
    Object.keys(slots).forEach(key => { groups[key] = { lane: key, tasks: 0, serialSeconds: 0, slots: slots[key] }; });
    tasks.forEach(task => {
      const lane = villageLane(task);
      const group = groups[lane];
      if (!group) return;
      group.tasks += 1;
      group.serialSeconds += Math.max(0, number(task.sec));
    });
    const laneLabels = {
      home_builder: '家乡建筑工人', home_lab: '家乡实验室', home_pet: '战宠小屋',
      bb_builder: '建筑大师基地建筑工人', bb_lab: '星空实验室'
    };
    const lanes = Object.values(groups).map(group => {
      const wallSeconds = group.slots > 0 ? group.serialSeconds / group.slots : null;
      return {
        lane: group.lane, label: laneLabels[group.lane], tasks: group.tasks, slots: group.slots,
        serialSeconds: Math.round(group.serialSeconds), serialTime: formatDuration(group.serialSeconds),
        wallSeconds: wallSeconds == null ? null : Math.round(wallSeconds),
        wallTime: wallSeconds == null ? '缺少对应升级栏位' : formatDuration(wallSeconds)
      };
    });
    const maxFor = prefix => Math.max(0, ...lanes.filter(item => item.lane.startsWith(prefix) && item.wallSeconds != null).map(item => item.wallSeconds));
    const homeSeconds = maxFor('home_');
    const builderBaseSeconds = maxFor('bb_');
    const overallSeconds = Math.max(homeSeconds, builderBaseSeconds);
    const longest = tasks.slice().sort((a, b) => number(b.sec) - number(a.sec)).slice(0, 12).map(task => ({
      name: String(task.name || '未命名任务'), currentLevel: integer(task.curLvl), targetLevel: integer(task.maxLvl),
      world: task.world === 'bb' ? '建筑大师基地' : '家乡村庄', seconds: Math.round(number(task.sec)), time: formatDuration(task.sec), upgrading: !!task.upgrading
    }));
    return {
      source: 'tz_coc_village', playerTag: String(stored.village.tag || ''), townHallLevel: integer(stored.th || stored.village.townHallLevel),
      builderHallLevel: integer(stored.bh || stored.village.builderHallLevel), partial: !!(stored.coverage && stored.coverage.buildings === false),
      taskCount: tasks.length, lanes,
      homeCompletion: { seconds: Math.round(homeSeconds), time: formatDuration(homeSeconds) },
      builderBaseCompletion: { seconds: Math.round(builderBaseSeconds), time: formatDuration(builderBaseSeconds) },
      allCompletion: { seconds: Math.round(overallSeconds), time: formatDuration(overallSeconds) },
      longestTasks: longest,
      assumptions: ['同一升级栏位内任务串行执行，不同栏位并行', '没有计入魔法物品、活动折扣、临时加速和未来版本改动']
    };
  }

  function newPlayer(name, skillIds, hpBase) {
    const skills = skillIds.map(id => SKILL_MAP[id]).filter(Boolean);
    const maxHp = Math.max(20, hpBase - skills.reduce((sum, skill) => sum + skill.hpCost, 0));
    return {
      name, hp: maxHp, maxHp, shield: 0, energy: 3, gpa: 1,
      deck: [], hand: [], shop: [], skills: skills.map(skill => ({ id: skill.id, cooldown: 0 })),
      milestones: {}, nextEnergyBonus: 0, costReduction: 0, firstTurn: true,
      gpaThisTurn: 0, gpaAttack: false, gpaDefense: false, gpaBuy: false, passive: {}
    };
  }
  function buildDeck(player, random) {
    const deck = [];
    GPA_CARDS.forEach(card => { for (let index = 0; index < card.weight; index += 1) deck.push(card.id); });
    player.deck = shuffle(deck, random);
  }
  function draw(player, count, random) {
    for (let index = 0; index < count && player.hand.length < 7; index += 1) {
      if (!player.deck.length) buildDeck(player, random);
      player.hand.push(player.deck.pop());
    }
  }
  function refreshShop(player, random) { player.shop = shuffle(GPA_CARDS.map(card => card.id), random).slice(0, 3); }
  function log(game, text) {
    game.log.push({ turn: game.turn, text: String(text) });
    if (game.log.length > 60) game.log.splice(0, game.log.length - 60);
  }
  function addGpa(game, player, amount, reason) {
    if (player.gpaThisTurn >= 0.3) return;
    const gain = Math.min(amount, 0.3 - player.gpaThisTurn);
    player.gpa = Math.round((player.gpa + gain) * 10) / 10;
    player.gpaThisTurn = Math.round((player.gpaThisTurn + gain) * 10) / 10;
    log(game, player.name + ' GPA +' + gain.toFixed(1) + (reason ? '（' + reason + '）' : ''));
  }
  function heal(game, player, amount) {
    const before = player.hp; player.hp = Math.min(player.maxHp, player.hp + amount);
    if (player.hp > before) log(game, player.name + ' 治疗 ' + (player.hp - before));
  }
  function damage(game, caster, target, amount) {
    let remaining = amount;
    if (target.shield > 0) { const absorbed = Math.min(target.shield, remaining); target.shield -= absorbed; remaining -= absorbed; }
    if (remaining > 0) {
      target.hp -= remaining;
      log(game, target.name + ' 受到 ' + remaining + ' 伤害');
      if (amount >= 8 && !caster.gpaAttack) { caster.gpaAttack = true; addGpa(game, caster, 0.1, '攻击'); }
    }
    const comeback = target.skills.some(skill => skill.id === 'comeback');
    if (comeback && !target.passive.comeback && target.hp > 0 && target.hp <= target.maxHp * 0.4) {
      target.passive.comeback = true; target.shield += 12; target.energy = Math.min(10, target.energy + 2);
      log(game, target.name + ' 触发【越挫越勇】');
    }
    return remaining;
  }
  function defenseGpa(game, player, value) {
    if (value >= 8 && !player.gpaDefense) { player.gpaDefense = true; addGpa(game, player, 0.1, '防守'); }
  }
  function milestones(game, player, random) {
    [1.5, 2, 2.5, 3, 3.5, 4].forEach(point => {
      if (player.gpa < point || player.milestones[point]) return;
      player.milestones[point] = true;
      if (point === 1.5) draw(player, 1, random);
      else if (point === 2) heal(game, player, 8);
      else if (point === 2.5) player.energy = Math.min(10, player.energy + 2);
      else if (point === 3) { player.maxHp += 10; heal(game, player, 10); }
      else if (point === 3.5) player.costReduction = 2;
      else { draw(player, 2, random); player.shield += 10; }
      log(game, player.name + ' 达到 GPA ' + point.toFixed(1) + ' 里程碑');
    });
  }
  function winner(game) {
    if (game.player.gpa >= 4.3 || game.assistant.hp <= 0 || game.assistant.gpa <= 0) return { side: 'player', reason: game.player.gpa >= 4.3 ? 'GPA 达到 4.3' : '击败天择网 AI' };
    if (game.assistant.gpa >= 4.3 || game.player.hp <= 0 || game.player.gpa <= 0) return { side: 'assistant', reason: game.assistant.gpa >= 4.3 ? 'GPA 达到 4.3' : '玩家生命或 GPA 归零' };
    return null;
  }
  function finishIfNeeded(game) { const result = winner(game); if (result) { game.ended = true; game.winner = result; log(game, '对局结束：' + result.reason); } }
  function cardCost(player, card) {
    let cost = card.useCost;
    if (player.costReduction > 0) cost = Math.max(1, cost - player.costReduction);
    const steady = player.skills.some(skill => skill.id === 'steady') && !player.passive.steady && card.weight >= 12;
    if (steady) cost = Math.max(1, cost - 1);
    return { cost, steady, reduced: player.costReduction > 0 };
  }
  function playCard(game, side, cardId, random) {
    const player = game[side], target = game[side === 'player' ? 'assistant' : 'player'];
    const handIndex = player.hand.indexOf(cardId), card = CARD_MAP[cardId];
    if (handIndex < 0 || !card) throw new Error(player.name + ' 的手牌中没有【' + cardId + '】');
    const expense = cardCost(player, card);
    if (player.energy < expense.cost) throw new Error('能量不足，使用【' + card.name + '】需要 ' + expense.cost + ' 点能量');
    player.energy -= expense.cost; player.hand.splice(handIndex, 1);
    if (expense.reduced) player.costReduction = 0;
    if (expense.steady) player.passive.steady = true;
    if (card.id === 'basic_q') damage(game, player, target, 8);
    else if (card.id === 'hard_q') damage(game, player, target, 17);
    else if (card.id === 'precise') { target.shield = Math.max(0, target.shield - 8); damage(game, player, target, 10); }
    else if (card.id === 'break_time') { player.shield += 10; defenseGpa(game, player, 10); }
    else if (card.id === 'early_sleep') { heal(game, player, 14); defenseGpa(game, player, 14); }
    else if (card.id === 'routine') { player.shield += 8; heal(game, player, 7); defenseGpa(game, player, 15); }
    else if (card.id === 'preview') { draw(player, 2, random); if (player.hand.length) player.deck.unshift(player.hand.pop()); }
    else if (card.id === 'time_mgmt') player.nextEnergyBonus = 2;
    else if (card.id === 'study_plan') draw(player, 1, random);
    else if (card.id === 'homework') addGpa(game, player, 0.1);
    else if (card.id === 'quiz') { if (damage(game, player, target, 5) > 0) addGpa(game, player, 0.1); }
    else if (card.id === 'scholarship') player.energy = Math.min(10, player.energy + (target.gpa - player.gpa >= 0.5 ? 3 : 1));
    log(game, player.name + ' 打出【' + card.name + '】'); milestones(game, player, random); finishIfNeeded(game);
  }
  function buyCard(game, side, cardId, random) {
    const player = game[side], index = player.shop.indexOf(cardId), card = CARD_MAP[cardId];
    if (index < 0 || !card) throw new Error('商店中没有【' + cardId + '】');
    if (player.energy < card.buyCost) throw new Error('能量不足，购买【' + card.name + '】需要 ' + card.buyCost + ' 点能量');
    player.energy -= card.buyCost; player.shop.splice(index, 1); player.deck.unshift(card.id);
    if (!player.gpaBuy) { player.gpaBuy = true; addGpa(game, player, 0.1, '购买'); }
    log(game, player.name + ' 购买【' + card.name + '】'); milestones(game, player, random); finishIfNeeded(game);
  }
  function useSkill(game, side, skillId, random) {
    const player = game[side], owned = player.skills.find(skill => skill.id === skillId), skill = SKILL_MAP[skillId];
    if (!owned || !skill) throw new Error('没有这个技能：' + skillId);
    if (skill.type === '被动') throw new Error('被动技能会自动触发');
    if (owned.cooldown > 0) throw new Error('技能仍在冷却：' + owned.cooldown + ' 回合');
    if (player.energy < skill.energyCost) throw new Error('能量不足');
    player.energy -= skill.energyCost; owned.cooldown = skill.cooldown;
    if (skill.id === 'adjust') { if (player.hand.length) player.deck.unshift(player.hand.pop()); draw(player, 1, random); }
    else if (skill.id === 'breathe') heal(game, player, 8);
    log(game, player.name + ' 使用【' + skill.name + '】'); milestones(game, player, random); finishIfNeeded(game);
  }
  function beginTurn(game, side, random) {
    const player = game[side]; game.side = side;
    const supply = player.firstTurn ? 0 : 3 + player.nextEnergyBonus;
    player.firstTurn = false; player.energy = Math.min(10, player.energy + supply); player.nextEnergyBonus = 0;
    player.shield = 0; player.gpaThisTurn = 0; player.gpaAttack = false; player.gpaDefense = false; player.gpaBuy = false;
    player.passive = {}; player.costReduction = 0; player.skills.forEach(skill => { if (skill.cooldown > 0) skill.cooldown -= 1; });
    draw(player, 5 - player.hand.length, random); refreshShop(player, random);
    log(game, '轮到' + player.name + '行动');
  }
  function endSide(game, side, random) {
    if (game.side !== side) throw new Error('现在不是' + game[side].name + '的回合');
    if (side === 'assistant') game.turn += 1;
    if (game.turn > 30) {
      const p = game.player, a = game.assistant;
      game.ended = true;
      game.winner = p.gpa > a.gpa || (p.gpa === a.gpa && p.hp / p.maxHp > a.hp / a.maxHp)
        ? { side: 'player', reason: '回合上限结算胜出' } : { side: 'assistant', reason: '回合上限结算胜出' };
      return;
    }
    beginTurn(game, side === 'player' ? 'assistant' : 'player', random);
  }
  function publicPlayer(player) {
    return {
      name: player.name, hp: player.hp, maxHp: player.maxHp, shield: player.shield, energy: player.energy, gpa: player.gpa,
      hand: player.hand.map(id => ({ id, name: CARD_MAP[id].name, type: CARD_MAP[id].type, cost: cardCost(player, CARD_MAP[id]).cost, desc: CARD_MAP[id].desc })),
      shop: player.shop.map(id => ({ id, name: CARD_MAP[id].name, cost: CARD_MAP[id].buyCost, desc: CARD_MAP[id].desc })),
      skills: player.skills.map(item => ({ id: item.id, name: SKILL_MAP[item.id].name, type: SKILL_MAP[item.id].type, cooldown: item.cooldown, desc: SKILL_MAP[item.id].desc }))
    };
  }
  function publicGame(game) {
    return {
      schemaVersion: 1, turn: game.turn, turnSide: game.side, ended: !!game.ended, winner: game.winner || null,
      player: publicPlayer(game.player), assistant: publicPlayer(game.assistant), recentLog: game.log.slice(-12),
      instruction: game.ended ? '对局已结束。' : (game.side === 'player' ? '等待玩家用自然语言选择打牌、购买、技能或结束回合。' : '天择网 AI 应根据公开状态选择本回合动作，并调用 assistant_turn。')
    };
  }
  function startGpa(storage, rawArgs, random) {
    const args = rawArgs || {};
    const passive = String(args.passive_skill || 'steady');
    const active = String(args.active_skill || 'adjust');
    if (!['steady', 'comeback'].includes(passive)) throw new Error('被动技能只能选择 steady 或 comeback');
    if (!['adjust', 'breathe'].includes(active)) throw new Error('主动技能只能选择 adjust 或 breathe');
    const game = {
      schemaVersion: 1, turn: 1, side: (typeof random === 'function' ? random() : Math.random()) < 0.5 ? 'player' : 'assistant',
      player: newPlayer('你', [passive, active], 100), assistant: newPlayer('天择网 AI', ['steady', 'adjust'], 110), log: [], ended: false, winner: null
    };
    buildDeck(game.player, random); buildDeck(game.assistant, random); draw(game.player, 5, random); draw(game.assistant, 5, random);
    refreshShop(game.player, random); refreshShop(game.assistant, random); log(game, '绩点战争开始');
    writeJson(storage, GPA_STORAGE_KEY, game); return publicGame(game);
  }
  function invokeGpa(storage, rawArgs, random) {
    const args = rawArgs || {}, action = String(args.action || 'status');
    if (action === 'start') return startGpa(storage, args, random);
    if (action === 'reset') { if (storage && storage.removeItem) storage.removeItem(GPA_STORAGE_KEY); return { reset: true }; }
    const game = readJson(storage, GPA_STORAGE_KEY);
    if (!game || !game.player || !game.assistant) throw new Error('还没有进行中的绩点战争，请先开始新对局');
    if (action === 'status') return publicGame(game);
    if (game.ended) return publicGame(game);
    if (action === 'player_play') { if (game.side !== 'player') throw new Error('现在是天择网 AI 的回合'); playCard(game, 'player', String(args.card_id || ''), random); }
    else if (action === 'player_buy') { if (game.side !== 'player') throw new Error('现在是天择网 AI 的回合'); buyCard(game, 'player', String(args.card_id || ''), random); }
    else if (action === 'player_skill') { if (game.side !== 'player') throw new Error('现在是天择网 AI 的回合'); useSkill(game, 'player', String(args.skill_id || ''), random); }
    else if (action === 'player_end_turn') endSide(game, 'player', random);
    else if (action === 'assistant_turn') {
      if (game.side !== 'assistant') throw new Error('现在不是天择网 AI 的回合');
      const actions = Array.isArray(args.actions) ? args.actions.slice(0, 12) : [];
      const errors = [];
      actions.forEach(item => {
        if (game.ended) return;
        try {
          const type = String(item && item.type || '');
          if (type === 'play') playCard(game, 'assistant', String(item.card_id || ''), random);
          else if (type === 'buy') buyCard(game, 'assistant', String(item.card_id || ''), random);
          else if (type === 'skill') useSkill(game, 'assistant', String(item.skill_id || ''), random);
          else errors.push('未知动作：' + type);
        } catch (error) { errors.push(String(error.message || error)); }
      });
      if (!game.ended) endSide(game, 'assistant', random);
      if (errors.length) log(game, '天择网 AI 的无效动作已跳过：' + errors.join('；'));
    } else throw new Error('未知绩点战争动作：' + action);
    writeJson(storage, GPA_STORAGE_KEY, game); return publicGame(game);
  }

  function normalizeWord(item, index) {
    if (!item || typeof item !== 'object') return null;
    const word = String(item.word || '').trim();
    const meanings = (Array.isArray(item.meaning) ? item.meaning : [item.meaning]).map(value => String(value || '').trim()).filter(Boolean);
    if (!word || !meanings.length) return null;
    return { id: String(item.id || ('word-' + index)), word, phonetic: String(item.phonetic || ''), pos: String(item.pos || ''), meaning: meanings.slice(0, 8) };
  }
  function buildWordQuestion(session, random) {
    const stage = WORD_STAGES[session.stage], word = session.words[session.index], all = session.words;
    if (!stage || !word) return null;
    if (stage.mode === 'spell') return { stage: stage.name, stageIndex: session.stage + 1, wordIndex: session.index + 1, total: session.words.length, type: 'spell', prompt: word.meaning[0], instruction: '请完整拼写对应的英文单词。' };
    if (stage.mode === 'cn2en') {
      const distractors = shuffle(all.filter(item => item.id !== word.id), random).slice(0, 3);
      const options = shuffle([{ text: word.word, correct: true }].concat(distractors.map(item => ({ text: item.word, correct: false }))), random)
        .map((item, index) => ({ key: String.fromCharCode(65 + index), text: item.text, correct: item.correct }));
      return { stage: stage.name, stageIndex: session.stage + 1, wordIndex: session.index + 1, total: session.words.length, type: 'single', prompt: word.meaning[0], phonetic: word.phonetic, options, instruction: '请选择对应的英文单词。' };
    }
    const correct = word.meaning.slice(0, 4);
    const otherMeanings = shuffle(all.filter(item => item.id !== word.id).flatMap(item => item.meaning), random).filter(value => !correct.includes(value)).slice(0, Math.max(2, 6 - correct.length));
    const options = shuffle(correct.map(text => ({ text, correct: true })).concat(otherMeanings.map(text => ({ text, correct: false }))), random)
      .map((item, index) => ({ key: String.fromCharCode(65 + index), text: item.text, correct: item.correct }));
    return { stage: stage.name, stageIndex: session.stage + 1, wordIndex: session.index + 1, total: session.words.length, type: 'multiple', prompt: word.word, phonetic: word.phonetic, options, instruction: stage.preview ? '这是预习轮：选出所有正确释义，答后会显示完整释义。' : '选出所有正确释义。' };
  }
  function publicWordQuestion(question) {
    if (!question) return null;
    const value = copy(question);
    if (Array.isArray(value.options)) value.options.forEach(option => { delete option.correct; });
    return value;
  }
  function startWords(storage, vocabulary, rawArgs, random) {
    const args = rawArgs || {};
    const normalized = (Array.isArray(vocabulary) ? vocabulary : []).map(normalizeWord).filter(Boolean);
    if (!normalized.length) throw new Error('当前单词本为空，请先在天择背单词中添加或导入词库');
    const count = clamp(integer(args.count, 10), 1, Math.min(30, normalized.length));
    const words = shuffle(normalized, random).slice(0, count);
    const session = { schemaVersion: 1, words, stage: 0, index: 0, results: [[], [], [], []], startedAt: Date.now(), finished: false };
    session.question = buildWordQuestion(session, random); writeJson(storage, WORDS_STORAGE_KEY, session);
    return { started: true, stages: WORD_STAGES.map(item => item.name), selectedWords: words.length, question: publicWordQuestion(session.question) };
  }
  function parseAnswer(question, word, rawAnswer) {
    const answer = String(rawAnswer == null ? '' : rawAnswer).trim();
    if (question.type === 'spell') return { correct: answer.toLowerCase() === word.word.toLowerCase(), user: answer, right: word.word };
    const options = question.options || [];
    const tokens = answer.split(/[，,、\s]+/).map(value => value.trim()).filter(Boolean);
    const selected = tokens.map(token => {
      const byKey = options.find(option => option.key.toLowerCase() === token.toLowerCase());
      return byKey || options.find(option => option.text.toLowerCase() === token.toLowerCase());
    }).filter(Boolean);
    const selectedKeys = Array.from(new Set(selected.map(option => option.key))).sort();
    const correctKeys = options.filter(option => option.correct).map(option => option.key).sort();
    return { correct: selectedKeys.join(',') === correctKeys.join(','), user: selectedKeys.join(',') || '（未作答）', right: correctKeys.join(',') };
  }
  function invokeWords(storage, vocabulary, rawArgs, random, recordAnswer) {
    const args = rawArgs || {}, action = String(args.action || 'status');
    if (action === 'start') return startWords(storage, vocabulary, args, random);
    if (action === 'reset') { if (storage && storage.removeItem) storage.removeItem(WORDS_STORAGE_KEY); return { reset: true }; }
    const session = readJson(storage, WORDS_STORAGE_KEY);
    if (!session || !Array.isArray(session.words)) throw new Error('还没有进行中的四流程背单词，请先开始');
    if (action === 'status') return session.finished ? { finished: true, summary: session.summary } : { finished: false, question: publicWordQuestion(session.question), progress: { stage: session.stage + 1, word: session.index + 1, total: session.words.length } };
    if (session.finished) return { finished: true, summary: session.summary };
    if (action === 'skip') args.answer = '';
    else if (action !== 'answer') throw new Error('未知背单词动作：' + action);
    const word = session.words[session.index], question = session.question;
    const result = action === 'skip' ? { correct: false, user: '（跳过）', right: question.type === 'spell' ? word.word : question.options.filter(option => option.correct).map(option => option.key).join(',') } : parseAnswer(question, word, args.answer);
    const stage = WORD_STAGES[session.stage];
    session.results[session.stage].push({ wordId: word.id, word: word.word, correct: result.correct });
    if (typeof recordAnswer === 'function') recordAnswer({ word, stage: stage.id, correct: result.correct, user: result.user, right: result.right });
    const feedback = { correct: result.correct, yourAnswer: result.user, correctAnswer: result.right, word: word.word, meanings: word.meaning, preview: !!stage.preview };
    session.index += 1;
    if (session.index >= session.words.length) { session.stage += 1; session.index = 0; }
    if (session.stage >= WORD_STAGES.length) {
      session.finished = true;
      const flat = session.results.flat();
      session.summary = {
        words: session.words.length, answered: flat.length, correct: flat.filter(item => item.correct).length,
        stages: WORD_STAGES.map((item, index) => ({ name: item.name, correct: session.results[index].filter(entry => entry.correct).length, total: session.results[index].length })),
        durationSeconds: Math.max(0, Math.round((Date.now() - session.startedAt) / 1000))
      };
      session.question = null;
    } else session.question = buildWordQuestion(session, random);
    writeJson(storage, WORDS_STORAGE_KEY, session);
    return { feedback, finished: session.finished, summary: session.summary || null, nextQuestion: publicWordQuestion(session.question) };
  }

  function invoke(name, args, dependencies) {
    const deps = dependencies || {};
    if (name === 'coc_village_analyze') return analyzeVillage(args && args.village ? args.village : readJson(deps.storage, 'tz_coc_village'));
    if (name === 'tianze_gpa_war') return invokeGpa(deps.storage, args, deps.random);
    if (name === 'tianze_word_training') return invokeWords(deps.storage, deps.vocabulary || [], args, deps.random, deps.recordWordAnswer);
    throw new Error('未登记的领域工具：' + name);
  }

  return Object.freeze({
    GPA_STORAGE_KEY, WORDS_STORAGE_KEY, GPA_CARDS, GPA_SKILLS, WORD_STAGES,
    analyzeVillage, invokeGpa, invokeWords, invoke, formatDuration
  });
});
