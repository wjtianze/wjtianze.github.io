/* 天择网 COC 规划优先级与配兵链接解析。
 * 配兵语法基于 MIT 许可的 coc.py 4.0.0 ArmyRecipe：
 * https://github.com/mathsman5133/coc.py/blob/v4.0.0/coc/game_data.py
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CocPlannerPriority = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STORAGE_KEY = "tz_coc_army_priority_v1";
  var TROOP_BASE_ID = 4000000;
  var SPELL_BASE_ID = 26000000;
  var HERO_BASE_ID = 28000000;
  var PET_BASE_ID = 73000000;
  var EQUIPMENT_BASE_ID = 90000000;

  var BUILDING_PHASE = Object.freeze({
    "1000007": 0, // 实验室
    "1000005": 1, // 储金罐
    "1000003": 1, // 圣水瓶
    "1000024": 1, // 暗黑重油罐
    "1000014": 1, // 部落城堡
    "1000006": 1, // 训练营
    "1000026": 1, // 暗黑训练营
    "1000020": 1, // 法术工厂
    "1000029": 1, // 暗黑法术工厂
    "1000000": 1, // 兵营
    "1000071": 1, // 英雄殿堂
    "1000070": 1, // 铁匠铺
    "1000068": 1, // 战宠小屋
    "1000059": 1, // 攻城机器工坊
    "1000031": 2, // 天鹰火炮
    "1000067": 2, // 投石炮
    "1000072": 2, // 法术塔
    "1000077": 2, // 擎天巨柱
    "1000085": 2, // 跳弹加农炮
    "1000084": 2, // 多人箭塔
    "1000089": 2, // 火焰喷射器
    "1000079": 2, // 复合机械塔
    "1000086": 2, // 反击之塔
    "1000102": 2  // 超级法师塔
  });
  var LAST_PETS = Object.freeze({
    "73000000": true, // L.A.S.S.I / 莱希
    "73000001": true  // Mighty Yak / 大牦
  });

  function uniqueSorted(values) {
    var seen = Object.create(null), result = [];
    (Array.isArray(values) ? values : []).forEach(function (value) {
      var id = String(value == null ? "" : value).trim();
      if (!/^\d+$/.test(id) || seen[id]) return;
      seen[id] = true;
      result.push(id);
    });
    return result.sort(function (a, b) { return Number(a) - Number(b); });
  }

  function normalizeConfig(value) {
    return {
      schemaVersion: 1,
      selectedGids: uniqueSorted(value && value.selectedGids),
      source: value && value.source === "link" ? "link" : "custom",
      updatedAt: Number(value && value.updatedAt) || 0
    };
  }

  function fnv1a(value) {
    var text = String(value || ""), hash = 0x811c9dc5;
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  }

  function fingerprint(config) {
    return "army-v1-" + fnv1a(normalizeConfig(config).selectedGids.join(","));
  }

  function recipeFromLink(link) {
    var source = String(link == null ? "" : link).trim();
    if (!source) throw new Error("请先粘贴配兵链接");
    if (source.length > 8192) throw new Error("配兵链接过长");
    var recipe = source;
    if (/^https?:\/\//i.test(source)) {
      var parsed;
      try { parsed = new URL(source); } catch (_error) { throw new Error("配兵链接格式无效"); }
      if (parsed.hostname.toLowerCase() !== "link.clashofclans.com") throw new Error("只接受游戏生成的 link.clashofclans.com 配兵链接");
      if ((parsed.searchParams.get("action") || "").toLowerCase() !== "copyarmy") throw new Error("这不是游戏的复制军队链接");
      recipe = parsed.searchParams.get("army") || "";
    } else {
      var match = source.match(/(?:^|[?&])army=([^&]+)/i);
      if (match) {
        try { recipe = decodeURIComponent(match[1]); } catch (_error2) { throw new Error("配兵参数编码无效"); }
      }
    }
    if (!recipe || !/^[hidus0-9x_\-mpe]+$/i.test(recipe)) throw new Error("配兵参数为空或包含未知字符");
    return recipe;
  }

  function parseItemGroup(value, baseId, target) {
    if (!/^\d+x\d+(?:-\d+x\d+)*$/.test(value)) throw new Error("配兵数量或单位编号格式无效");
    value.split("-").forEach(function (entry) {
      var pair = entry.split("x"), quantity = Number(pair[0]), offset = Number(pair[1]);
      if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 10000 || !Number.isSafeInteger(offset) || offset < 0 || offset > 999999) {
        throw new Error("配兵数量或单位编号超出安全范围");
      }
      target.push({ gid: String(baseId + offset), quantity: quantity });
    });
  }

  function parseArmyLink(link) {
    var recipe = recipeFromLink(link);
    var result = { recipe: recipe, troops: [], spells: [], clanCastleTroops: [], clanCastleSpells: [], heroes: [], pets: [], equipment: [], gids: [] };
    var sectionPattern = /h([^idus]+)|i([\d+x-]+)|d([\d+x-]+)|u([\d+x-]+)|s([\d+x-]+)/gi;
    var heroPattern = /^(\d+)(?:m\d+)?(?:p(\d+))?(?:e(\d+)(?:_(\d+))?)?$/;
    var match, matched = "";
    while ((match = sectionPattern.exec(recipe))) {
      matched += match[0];
      if (match[1]) {
        match[1].split("-").forEach(function (entry) {
          var hero = entry.match(heroPattern);
          if (!hero) throw new Error("英雄、战宠或装备参数格式无效");
          result.heroes.push({ gid: String(HERO_BASE_ID + Number(hero[1])), quantity: 1 });
          if (hero[2]) result.pets.push({ gid: String(PET_BASE_ID + Number(hero[2])), quantity: 1 });
          if (hero[3]) result.equipment.push({ gid: String(EQUIPMENT_BASE_ID + Number(hero[3])), quantity: 1 });
          if (hero[4]) result.equipment.push({ gid: String(EQUIPMENT_BASE_ID + Number(hero[4])), quantity: 1 });
        });
      } else if (match[2]) parseItemGroup(match[2], TROOP_BASE_ID, result.clanCastleTroops);
      else if (match[3]) parseItemGroup(match[3], SPELL_BASE_ID, result.clanCastleSpells);
      else if (match[4]) parseItemGroup(match[4], TROOP_BASE_ID, result.troops);
      else if (match[5]) parseItemGroup(match[5], SPELL_BASE_ID, result.spells);
    }
    if (!matched || matched.toLowerCase() !== recipe.toLowerCase()) throw new Error("配兵链接中存在无法识别的片段");
    result.gids = uniqueSorted([].concat(
      result.troops, result.spells, result.clanCastleTroops, result.clanCastleSpells,
      result.heroes, result.pets, result.equipment
    ).map(function (entry) { return entry.gid; }));
    return result;
  }

  function selectedLookup(config) {
    var lookup = Object.create(null);
    normalizeConfig(config).selectedGids.forEach(function (gid) { lookup[gid] = true; });
    return lookup;
  }

  function tupleForTask(task, options) {
    var laneForTask = options && options.laneForTask;
    var lane = laneForTask ? laneForTask(task) : "";
    var gid = String(task && task.gid || "");
    var category = String(task && task.cat || "");
    var selected = options && options.selected || Object.create(null);
    var heroContention = Boolean(options && options.heroContention);
    if (lane === "home_builder" || lane === "bb_builder") {
      if (task && task.world === "home" && Object.prototype.hasOwnProperty.call(BUILDING_PHASE, gid)) return [BUILDING_PHASE[gid], 0];
      if (/英雄/.test(category)) return [3, heroContention && selected[gid] ? 0 : 1];
      return [4, 0];
    }
    if (lane === "home_pet") {
      if (LAST_PETS[gid]) return [2, 0];
      return [selected[gid] ? 0 : 1, 0];
    }
    if (lane === "home_lab" || lane === "bb_lab") return [selected[gid] ? 0 : 1, 0];
    return [0, 0];
  }

  function compareTasks(a, b, options) {
    if (options && options.mode === "steady") {
      var at = tupleForTask(a, options), bt = tupleForTask(b, options);
      if (at[0] !== bt[0]) return at[0] - bt[0];
      if (at[1] !== bt[1]) return at[1] - bt[1];
    }
    var duration = Number(a && a.sec || 0) - Number(b && b.sec || 0);
    if (duration) return duration;
    var aid = String(a && a.id || ""), bid = String(b && b.id || "");
    return aid < bid ? -1 : (aid > bid ? 1 : 0);
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    BUILDING_PHASE: BUILDING_PHASE,
    LAST_PETS: LAST_PETS,
    normalizeConfig: normalizeConfig,
    fingerprint: fingerprint,
    recipeFromLink: recipeFromLink,
    parseArmyLink: parseArmyLink,
    selectedLookup: selectedLookup,
    tupleForTask: tupleForTask,
    compareTasks: compareTasks
  };
});
