/* 天择网 COC 快照 v2：统一完整账号数据、官方玩家公开数据与无损合并。 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TianzeCocSnapshot = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SCHEMA_VERSION = 2;
  var STORAGE_KEY = "tz_coc_snapshot_v2";
  var LEGACY_STORAGE_KEY = "tz_coc_village";
  var ARRAY_FIELDS = [
    "helpers", "buildings", "traps", "decos", "obstacles", "units",
    "siege_machines", "heroes", "spells", "pets", "equipment",
    "house_parts", "skins", "sceneries", "buildings2", "traps2",
    "units2", "heroes2"
  ];
  var PRIVATE_FIELDS = ["buildings", "traps", "helpers", "timers", "resources", "supercharges"];

  function copy(value) {
    if (value == null) return value;
    if (typeof structuredClone === "function") {
      try { return structuredClone(value); } catch (_) {}
    }
    return JSON.parse(JSON.stringify(value));
  }

  function number(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : (fallback || 0);
  }

  function normalizedName(value) {
    return String(value == null ? "" : value)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[’'`]/g, "")
      .replace(/[^a-z0-9\u3400-\u9fff]+/g, "")
      .trim();
  }

  function normalizeTag(value) {
    var tag = String(value == null ? "" : value).trim().toUpperCase().replace(/\s+/g, "");
    if (tag && tag.charAt(0) !== "#") tag = "#" + tag;
    if (!/^#[0289PYLQGRJCUV]{3,15}$/.test(tag)) return "";
    return tag;
  }

  function unitAliases(unit) {
    var attributes = unit && unit.staticAttributes || {};
    var aliases = [unit && unit.englishName, unit && unit.chineseName, unit && unit.internalName, attributes.Name];
    if (Array.isArray(unit && unit.aliases)) aliases = aliases.concat(unit.aliases);
    return aliases.filter(Boolean);
  }

  function buildCatalog(units) {
    var byName = Object.create(null), byId = Object.create(null);
    (Array.isArray(units) ? units : []).forEach(function (unit) {
      var id = String(unit && unit.globalID || "").trim();
      if (id) byId[id] = unit;
      unitAliases(unit).forEach(function (alias) {
        var key = normalizedName(alias);
        if (key && !byName[key]) byName[key] = unit;
      });
    });
    return { byName: byName, byId: byId };
  }

  function destinationFor(unit, item, sourceField) {
    var category = String(unit && unit.category || ""), village = String(item && item.village || "").toLowerCase();
    if (sourceField === "heroEquipment") return "equipment";
    if (sourceField === "spells") return "spells";
    if (sourceField === "heroes") {
      return /夜世界/.test(category) || /builder/.test(village) ? "heroes2" : "heroes";
    }
    if (/攻城机器/.test(category)) return "siege_machines";
    if (/战宠/.test(category)) return "pets";
    if (/夜世界兵种/.test(category) || /builder/.test(village)) return "units2";
    return "units";
  }

  function emptyVillage(raw, collectedAt) {
    var village = {
      tag: normalizeTag(raw && raw.tag) || String(raw && raw.tag || ""),
      name: String(raw && raw.name || ""),
      timestamp: Math.floor(number(collectedAt, Date.now()) / 1000),
      townHallLevel: number(raw && raw.townHallLevel),
      builderHallLevel: number(raw && raw.builderHallLevel)
    };
    ARRAY_FIELDS.forEach(function (field) { village[field] = []; });
    return village;
  }

  function mapOfficialCollection(rawList, sourceField, catalog, village, unknown) {
    (Array.isArray(rawList) ? rawList : []).forEach(function (item) {
      var key = normalizedName(item && item.name), unit = catalog.byName[key];
      var id = unit && String(unit.globalID || "").trim();
      if (!unit || !id) {
        unknown.push({ collection: sourceField, name: String(item && item.name || ""), level: number(item && item.level) });
        return;
      }
      var mapped = { data: number(id), lvl: number(item && item.level) };
      if (item && item.superTroopIsActive) mapped.extra = true;
      village[destinationFor(unit, item, sourceField)].push(mapped);
    });
  }

  function fromOfficialPlayer(raw, units, options) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("官方玩家数据必须是对象");
    options = options || {};
    var catalog = units && units.byName ? units : buildCatalog(units);
    var collectedAt = number(options.collectedAt, Date.now());
    var village = emptyVillage(raw, collectedAt), unknown = [];
    mapOfficialCollection(raw.troops, "troops", catalog, village, unknown);
    mapOfficialCollection(raw.spells, "spells", catalog, village, unknown);
    mapOfficialCollection(raw.heroes, "heroes", catalog, village, unknown);
    mapOfficialCollection(raw.heroEquipment || raw.equipment, "heroEquipment", catalog, village, unknown);
    return {
      kind: "tianze-coc-snapshot",
      schemaVersion: SCHEMA_VERSION,
      source: { type: "official-api", provider: "Clash of Clans API", collectedAt: new Date(collectedAt).toISOString() },
      profile: {
        tag: village.tag,
        name: village.name,
        townHallLevel: village.townHallLevel,
        builderHallLevel: village.builderHallLevel,
        clan: copy(raw.clan || null)
      },
      coverage: {
        profile: true, troops: true, spells: true, heroes: true, equipment: true,
        buildings: false, traps: false, helpers: false, timers: false, resources: false, supercharges: false
      },
      missingFields: PRIVATE_FIELDS.slice(),
      unknownEntities: unknown,
      officialRaw: copy(raw),
      village: village
    };
  }

  function hasArray(value, key) { return Boolean(value && Array.isArray(value[key])); }

  function fromFullAccount(raw, options) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("完整账号数据必须是对象");
    options = options || {};
    var collectedAt = number(options.collectedAt, Date.now()), village = copy(raw);
    ARRAY_FIELDS.forEach(function (field) { if (!Array.isArray(village[field])) village[field] = []; });
    var coverage = {
      profile: true, troops: hasArray(raw, "units") || hasArray(raw, "units2"), spells: hasArray(raw, "spells"),
      heroes: hasArray(raw, "heroes") || hasArray(raw, "heroes2"), equipment: hasArray(raw, "equipment"),
      buildings: hasArray(raw, "buildings") || hasArray(raw, "buildings2"), traps: hasArray(raw, "traps") || hasArray(raw, "traps2"),
      helpers: hasArray(raw, "helpers"), timers: true,
      resources: Boolean(raw.resources || raw.resource_caps || raw.resourceCaps),
      supercharges: Boolean(raw.supercharges || raw.mini_levels || raw.miniLevels || (raw.buildings || []).some(function (item) { return item && (item.mini_lvl != null || item.miniLevel != null || item.supercharge != null); }))
    };
    return {
      kind: "tianze-coc-snapshot", schemaVersion: SCHEMA_VERSION,
      source: { type: "full-account", provider: String(options.provider || "game-export"), collectedAt: new Date(collectedAt).toISOString() },
      profile: {
        tag: normalizeTag(raw.tag) || String(raw.tag || ""), name: String(raw.name || ""),
        townHallLevel: number(raw.townHallLevel || options.townHallLevel), builderHallLevel: number(raw.builderHallLevel || options.builderHallLevel)
      },
      coverage: coverage,
      missingFields: Object.keys(coverage).filter(function (key) { return !coverage[key]; }),
      unknownEntities: [], village: village
    };
  }

  function mergeEntityArrays(base, incoming) {
    var result = (Array.isArray(base) ? copy(base) : []), positions = Object.create(null);
    result.forEach(function (item, index) {
      if (item && item.data != null && positions[String(item.data)] == null) positions[String(item.data)] = index;
    });
    (Array.isArray(incoming) ? incoming : []).forEach(function (item) {
      var id = item && item.data != null ? String(item.data) : "";
      if (!id || positions[id] == null) {
        result.push(copy(item));
        if (id) positions[id] = result.length - 1;
        return;
      }
      result[positions[id]] = Object.assign({}, result[positions[id]], copy(item));
    });
    return result;
  }

  function snapshotTag(snapshot) {
    return normalizeTag(snapshot && snapshot.profile && snapshot.profile.tag) ||
      normalizeTag(snapshot && snapshot.village && snapshot.village.tag);
  }

  function privateCoverageScore(snapshot) {
    var coverage = snapshot && snapshot.coverage || {}, score = 0;
    PRIVATE_FIELDS.forEach(function (field) { if (coverage[field]) score += 1; });
    if (snapshot && snapshot.source && snapshot.source.type === "full-account") score += PRIVATE_FIELDS.length + 1;
    return score;
  }

  function mergeProfile(base, incoming) {
    var result = Object.assign({}, copy(base || {}));
    Object.keys(incoming || {}).forEach(function (key) {
      var value = incoming[key];
      if (key === "clan") { result[key] = copy(value); return; }
      if (value == null || value === "") return;
      if ((key === "townHallLevel" || key === "builderHallLevel") && number(value) <= 0) return;
      result[key] = copy(value);
    });
    return result;
  }

  function mergeSnapshots(left, right) {
    if (!left) return copy(right);
    if (!right) return copy(left);
    if (number(left.schemaVersion) !== SCHEMA_VERSION || number(right.schemaVersion) !== SCHEMA_VERSION) throw new Error("只能合并 v2 快照");
    var leftTag = snapshotTag(left), rightTag = snapshotTag(right);
    if (leftTag && rightTag && leftTag !== rightTag) throw new Error("玩家标签不一致，已拒绝合并，避免把两个村庄的数据混在一起");
    var base = privateCoverageScore(right) > privateCoverageScore(left) ? right : left;
    var newer = base === left ? right : left;
    var merged = copy(base), publicFields = ["units", "units2", "siege_machines", "heroes", "heroes2", "spells", "pets", "equipment"];
    publicFields.forEach(function (field) { merged.village[field] = mergeEntityArrays(merged.village[field], newer.village && newer.village[field]); });
    merged.profile = mergeProfile(merged.profile, newer.profile);
    if (merged.profile.tag) merged.village.tag = merged.profile.tag;
    if (merged.profile.name) merged.village.name = merged.profile.name;
    if (merged.profile.townHallLevel) merged.village.townHallLevel = merged.profile.townHallLevel;
    if (merged.profile.builderHallLevel) merged.village.builderHallLevel = merged.profile.builderHallLevel;
    merged.coverage = Object.assign({}, left.coverage || {});
    Object.keys(right.coverage || {}).forEach(function (key) { merged.coverage[key] = Boolean(merged.coverage[key] || right.coverage[key]); });
    merged.missingFields = Object.keys(merged.coverage).filter(function (key) { return !merged.coverage[key]; });
    merged.unknownEntities = (left.unknownEntities || []).concat(right.unknownEntities || []);
    merged.source = {
      type: "merged", provider: "Tianze COC snapshot merger", collectedAt: new Date().toISOString(),
      inputs: [copy(left.source || {}), copy(right.source || {})]
    };
    if (right.officialRaw) merged.officialRaw = copy(right.officialRaw);
    else if (left.officialRaw) merged.officialRaw = copy(left.officialRaw);
    return merged;
  }

  function detectTownHall(village) {
    var explicit = number(village && village.townHallLevel);
    if (explicit) return explicit;
    var value = 0;
    (village && village.buildings || []).forEach(function (item) { if (item && item.weapon != null) value = Math.max(value, number(item.lvl)); });
    return value;
  }

  function detectBuilderHall(village) {
    return number(village && village.builderHallLevel);
  }

  function legacyStore(snapshot) {
    var village = copy(snapshot && snapshot.village || {}), partial = !(snapshot && snapshot.coverage && snapshot.coverage.buildings);
    return {
      schemaVersion: SCHEMA_VERSION,
      snapshotSource: snapshot && snapshot.source || null,
      coverage: copy(snapshot && snapshot.coverage || {}),
      missingFields: copy(snapshot && snapshot.missingFields || []),
      village: village,
      th: number(snapshot && snapshot.profile && snapshot.profile.townHallLevel) || detectTownHall(village),
      bh: number(snapshot && snapshot.profile && snapshot.profile.builderHallLevel) || detectBuilderHall(village),
      baseWC: partial ? { home_builder: 0, home_lab: 1, home_pet: 0, bb_builder: 0, bb_lab: 1 } : {},
      gobWorker: 0, gobLab: 0, tasks: [], ts: Date.now()
    };
  }

  function save(snapshot, storage) {
    storage = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!storage) throw new Error("本机存储不可用");
    if (!snapshot || number(snapshot.schemaVersion) !== SCHEMA_VERSION) throw new Error("快照版本不受支持");
    storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacyStore(snapshot)));
    return snapshot;
  }

  function load(storage) {
    storage = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!storage) return null;
    try {
      var value = JSON.parse(storage.getItem(STORAGE_KEY) || "null");
      return value && number(value.schemaVersion) === SCHEMA_VERSION ? value : null;
    } catch (_) { return null; }
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    STORAGE_KEY: STORAGE_KEY,
    LEGACY_STORAGE_KEY: LEGACY_STORAGE_KEY,
    ARRAY_FIELDS: ARRAY_FIELDS.slice(),
    normalizeTag: normalizeTag,
    normalizedName: normalizedName,
    buildCatalog: buildCatalog,
    fromOfficialPlayer: fromOfficialPlayer,
    fromFullAccount: fromFullAccount,
    mergeSnapshots: mergeSnapshots,
    legacyStore: legacyStore,
    save: save,
    load: load
  };
});
