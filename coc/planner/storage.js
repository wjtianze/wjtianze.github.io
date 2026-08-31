/* 天择网 COC 升级规划器：双方案持久化、身份校验与导出工具。 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CocPlannerStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SCHEMA_VERSION = 2;
  var STORAGE_KEY = "tz_coc_planner_v1";
  var MODES = Object.freeze(["steady", "rush"]);
  var CATEGORY_DISPLAY = Object.freeze({
    "夜世界兵种": "建筑大师基地兵种",
    "夜世界英雄": "建筑大师基地英雄",
    "夜世界资源建筑": "建筑大师基地资源建筑",
    "夜世界科技建筑": "建筑大师基地科技建筑",
    "夜世界防御建筑": "建筑大师基地防御建筑",
    "夜世界其它建筑": "建筑大师基地其它建筑",
    "夜世界陷阱": "建筑大师基地陷阱",
    "帮手角色": "帮手"
  });

  function displayCategory(value) {
    var category = String(value || "升级任务");
    return CATEGORY_DISPLAY[category] || category;
  }

  function safeNumber(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : (fallback || 0);
  }

  function fnv1a(value) {
    var text = String(value || "");
    var hash = 0x811c9dc5;
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  }

  function fingerprintVillage(store, taskIds) {
    var village = store && store.village || {};
    var payload = {
      tag: String(village.tag || ""),
      timestamp: safeNumber(village.timestamp),
      th: safeNumber(store && store.th),
      bh: safeNumber(store && store.bh),
      tasks: Array.isArray(taskIds) ? taskIds.slice().sort() : []
    };
    return "v1-" + fnv1a(JSON.stringify(payload));
  }

  function laneForTask(task) {
    var category = String(task && task.cat || ""), world = task && task.world === "bb" ? "bb" : "home";
    if (/兵|法术|攻城机器/.test(category)) return world === "bb" ? "bb_lab" : "home_lab";
    if (/战宠/.test(category)) return "home_pet";
    return world === "bb" ? "bb_builder" : "home_builder";
  }

  function cleanPlan(list, taskMap, world, slotCounts, allowTask) {
    if (!Array.isArray(list)) return [];
    var seen = Object.create(null);
    return list.map(function (entry) {
      var task = taskMap && taskMap[entry && entry.id];
      if (!task || task.world !== world || seen[entry.id] || (allowTask && !allowTask(task))) return null;
      var lane = laneForTask(task), slots = Math.max(0, Math.floor(safeNumber(slotCounts && slotCounts[lane])));
      var duration = Math.max(0, safeNumber(task.sec));
      if (!slots || !duration) return null;
      seen[entry.id] = true;
      return {
        id: String(entry.id),
        start: Math.max(0, safeNumber(entry.start)),
        dur: duration,
        lane: lane,
        slot: Math.min(slots - 1, Math.max(0, Math.floor(safeNumber(entry.slot)))),
        locked: Boolean(task.locked)
      };
    }).filter(Boolean);
  }

  function planMetrics(modeSnapshot) {
    var home = Array.isArray(modeSnapshot && modeSnapshot.home) ? modeSnapshot.home : [];
    var bb = Array.isArray(modeSnapshot && modeSnapshot.bb) ? modeSnapshot.bb : [];
    function span(list) {
      return list.reduce(function (max, entry) {
        return Math.max(max, safeNumber(entry.start) + safeNumber(entry.dur));
      }, 0);
    }
    return {
      tasks: home.length + bb.length,
      homeTasks: home.length,
      bbTasks: bb.length,
      homeSpan: span(home),
      bbSpan: span(bb),
      totalSpan: Math.max(span(home), span(bb))
    };
  }

  function isCompatible(snapshot, identity) {
    function validPlanEntry(entry) {
      return Boolean(entry && typeof entry === "object" && !Array.isArray(entry) && typeof entry.id === "string" && entry.id &&
        Number.isFinite(Number(entry.start)) && Number(entry.start) >= 0 && Number.isFinite(Number(entry.dur)) && Number(entry.dur) >= 0 &&
        Number.isFinite(Number(entry.slot)) && Number(entry.slot) >= 0 && typeof entry.lane === "string");
    }
    function validMode(mode) {
      return Boolean(mode && typeof mode === "object" && !Array.isArray(mode) && Array.isArray(mode.home) && Array.isArray(mode.bb) &&
        mode.home.every(validPlanEntry) && mode.bb.every(validPlanEntry));
    }
    return Boolean(snapshot && snapshot.schemaVersion === SCHEMA_VERSION && identity &&
      snapshot.villageFingerprint === identity.villageFingerprint &&
      snapshot.gameDataVersion === identity.gameDataVersion &&
      snapshot.priorityFingerprint === String(identity.priorityFingerprint || "") && MODES.indexOf(snapshot.activeMode) >= 0 &&
      snapshot.modes && typeof snapshot.modes === "object" && !Array.isArray(snapshot.modes) &&
      validMode(snapshot.modes.steady) && validMode(snapshot.modes.rush));
  }

  function emptySnapshot(identity) {
    return {
      schemaVersion: SCHEMA_VERSION,
      villageFingerprint: String(identity && identity.villageFingerprint || ""),
      villageTag: String(identity && identity.villageTag || ""),
      villageTimestamp: safeNumber(identity && identity.villageTimestamp),
      gameDataVersion: String(identity && identity.gameDataVersion || "unknown"),
      priorityFingerprint: String(identity && identity.priorityFingerprint || ""),
      activeMode: "steady",
      updatedAt: Date.now(),
      modes: { steady: null, rush: null },
      previous: null
    };
  }

  function clonePlan(list) {
    return (Array.isArray(list) ? list : []).map(function (entry) {
      return {
        id: String(entry.id), start: safeNumber(entry.start), dur: safeNumber(entry.dur),
        lane: String(entry.lane || ""), slot: Math.max(0, Math.floor(safeNumber(entry.slot))),
        locked: Boolean(entry.locked)
      };
    });
  }

  function exportJson(snapshot, mode, taskMap) {
    if (MODES.indexOf(mode) < 0) throw new Error("未知规划模式");
    var selected = snapshot && snapshot.modes && snapshot.modes[mode];
    if (!selected) throw new Error("当前模式没有可导出的方案");
    function decorate(list) {
      return clonePlan(list).map(function (entry) {
        var task = taskMap && taskMap[entry.id];
        return Object.assign({}, entry, task ? {
          name: task.name,
          world: task.world,
          fromLevel: task.fromLvl,
          toLevel: task.toLvl,
          category: task.cat
        } : {});
      });
    }
    return JSON.stringify({
      kind: "tianze-coc-planner",
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      mode: mode,
      villageFingerprint: snapshot.villageFingerprint,
      villageTag: snapshot.villageTag,
      villageTimestamp: snapshot.villageTimestamp,
      gameDataVersion: snapshot.gameDataVersion,
      priorityFingerprint: snapshot.priorityFingerprint,
      metrics: planMetrics(selected),
      plans: { home: decorate(selected.home), bb: decorate(selected.bb) }
    }, null, 2) + "\n";
  }

  function icsEscape(value) {
    return String(value == null ? "" : value)
      .replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n")
      .replace(/,/g, "\\,").replace(/;/g, "\\;");
  }

  function icsDate(timestampMs) {
    return new Date(timestampMs).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function utf8Length(value) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(value).length;
    if (typeof Buffer !== "undefined") return Buffer.byteLength(value, "utf8");
    return unescape(encodeURIComponent(value)).length;
  }

  function foldIcsLine(value) {
    var source = String(value == null ? "" : value), lines = [], current = "", bytes = 0;
    for (var character of source) {
      var size = utf8Length(character);
      if (current && bytes + size > 75) {
        lines.push(current);
        current = " " + character;
        bytes = 1 + size;
      } else {
        current += character;
        bytes += size;
      }
    }
    lines.push(current);
    return lines.join("\r\n");
  }

  function exportIcs(snapshot, mode, taskMap, baseTimestampSeconds) {
    if (MODES.indexOf(mode) < 0) throw new Error("未知规划模式");
    var selected = snapshot && snapshot.modes && snapshot.modes[mode];
    if (!selected) throw new Error("当前模式没有可导出的方案");
    var baseMs = Math.max(Date.now(), Math.max(0, safeNumber(baseTimestampSeconds)) * 1000);
    var rows = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tianze//COC Planner//ZH-CN",
      "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "X-WR-CALNAME:" + icsEscape("COC " + (mode === "steady" ? "稳本" : "速本") + "方案")
    ];
    ["home", "bb"].forEach(function (world) {
      clonePlan(selected[world]).sort(function (a, b) { return a.start - b.start || a.id.localeCompare(b.id); })
        .forEach(function (entry, index) {
          var task = taskMap && taskMap[entry.id];
          if (!task || entry.dur <= 0) return;
          var start = baseMs + entry.start * 1000;
          var end = start + entry.dur * 1000;
          rows.push("BEGIN:VEVENT");
          rows.push("UID:" + fnv1a(snapshot.villageFingerprint + mode + entry.id + index) + "@wjtianze.github.io");
          rows.push("DTSTAMP:" + icsDate(Date.now()));
          rows.push("DTSTART:" + icsDate(start));
          rows.push("DTEND:" + icsDate(end));
          rows.push("SUMMARY:" + icsEscape("COC · " + task.name + " " + task.fromLvl + "→" + task.toLvl));
          rows.push("DESCRIPTION:" + icsEscape((world === "home" ? "家乡村庄" : "建筑大师基地") + " · " + displayCategory(task.cat) + " · " + (mode === "steady" ? "稳本方案" : "速本方案")));
          rows.push("END:VEVENT");
        });
    });
    rows.push("END:VCALENDAR");
    return rows.map(foldIcsLine).join("\r\n") + "\r\n";
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    STORAGE_KEY: STORAGE_KEY,
    MODES: MODES,
    fnv1a: fnv1a,
    fingerprintVillage: fingerprintVillage,
    laneForTask: laneForTask,
    cleanPlan: cleanPlan,
    planMetrics: planMetrics,
    isCompatible: isCompatible,
    emptySnapshot: emptySnapshot,
    clonePlan: clonePlan,
    exportJson: exportJson,
    exportIcs: exportIcs,
    foldIcsLine: foldIcsLine
  };
});
