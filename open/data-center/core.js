/* 天择网本地数据中心：可复用的归档校验、秘密清理与加密核心。 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TianzeDataCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var ARCHIVE_KIND = "tianze-web-backup";
  var ENCRYPTED_KIND = "tianze-web-backup-encrypted";
  var SCHEMA_VERSION = 1;
  var ITERATIONS = 210000;
  var MODULE_IDS = Object.freeze(["settings", "coc", "english", "learning"]);
  var LOCAL_KEY_RULES = {
    settings: function (key) { return ["tz_site_palette", "tz_site_theme", "tz_palette", "tianze_site_palette"].indexOf(key) >= 0; },
    coc: function (key) { return ["tz_coc_village", "tz_coc_dmgcalc_v1", "tz_coc_planner_v1"].indexOf(key) >= 0; },
    learning: function (key, archive) { return key.indexOf("tlh_") === 0 || key.indexOf("tlhL") === 0 || (archive.includeSecrets === true && key === "tz_site_tlh_apikey"); }
  };

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function utf8Bytes(value) { return new TextEncoder().encode(String(value == null ? "" : value)); }
  function byteLength(value) { return utf8Bytes(typeof value === "string" ? value : JSON.stringify(value)).byteLength; }

  function redactSecretText(value) {
    return String(value == null ? "" : value)
      .replace(/\bsk-[A-Za-z0-9_-]{16,}(?![A-Za-z0-9_-])/g, "[已排除的密钥]")
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}(?![A-Za-z0-9._~+/=-])/gi, "Bearer [已排除的令牌]")
      .replace(/((?:api[\s_-]?key|access[\s_-]?token|refresh[\s_-]?token|authorization)\s*[:=]\s*["']?)([A-Za-z0-9._~+/=-]{16,})/gi, "$1[已排除的密钥]");
  }

  function secretField(key) {
    var compact = String(key || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (["key", "apikey", "token", "accesstoken", "refreshtoken", "authtoken", "authorization", "credential", "credentials", "secret", "password"].indexOf(compact) >= 0) return true;
    return /(?:api|openai|deepseek|anthropic|qwen|glm|kimi|mimo)key$/.test(compact) ||
      /(?:access|refresh|auth|bearer)token$/.test(compact) || /(?:client)?secret$/.test(compact) || /password$/.test(compact);
  }

  function parseStructuredString(value) {
    var text = String(value == null ? "" : value), trimmed = text.trim();
    if (!trimmed || (trimmed.charAt(0) !== "{" && trimmed.charAt(0) !== "[")) return null;
    try {
      var parsed = JSON.parse(text);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (_) { return null; }
  }

  function stripSecrets(value) {
    if (Array.isArray(value)) return value.map(stripSecrets);
    if (typeof value === "string") {
      var parsed = parseStructuredString(value);
      return parsed ? JSON.stringify(stripSecrets(parsed)) : redactSecretText(value);
    }
    if (!value || typeof value !== "object") return value;
    var result = {};
    Object.keys(value).forEach(function (key) {
      if (secretField(key)) {
        result[key] = "";
      } else {
        result[key] = stripSecrets(value[key]);
      }
    });
    return result;
  }

  function sanitizeModule(moduleValue, includeSecrets) {
    return includeSecrets ? clone(moduleValue) : stripSecrets(moduleValue);
  }

  function preserveSecrets(incoming, current) {
    if (Array.isArray(incoming)) return incoming.map(function (item, index) { return preserveSecrets(item, Array.isArray(current) ? current[index] : undefined); });
    if (typeof incoming === "string") {
      var parsedIncoming = parseStructuredString(incoming);
      if (!parsedIncoming) return incoming;
      var parsedCurrent = typeof current === "string" ? parseStructuredString(current) : current;
      return JSON.stringify(preserveSecrets(parsedIncoming, parsedCurrent));
    }
    if (!incoming || typeof incoming !== "object") return incoming;
    var result = {};
    Object.keys(incoming).forEach(function (key) {
      if (secretField(key)) {
        result[key] = current && Object.prototype.hasOwnProperty.call(current, key) ? current[key] : incoming[key];
      } else {
        result[key] = preserveSecrets(incoming[key], current && typeof current === "object" ? current[key] : undefined);
      }
    });
    if (current && typeof current === "object" && !Array.isArray(current)) {
      Object.keys(current).forEach(function (key) {
        if (!Object.prototype.hasOwnProperty.call(result, key) && secretField(key)) result[key] = current[key];
      });
    }
    return result;
  }

  function prepareRestoreModule(incoming, current, allowArchivedSecrets) {
    return allowArchivedSecrets ? clone(incoming) : preserveSecrets(stripSecrets(incoming), current);
  }

  function makeArchive(modules, options) {
    options = options || {};
    var selected = {};
    MODULE_IDS.forEach(function (id) {
      if (modules && Object.prototype.hasOwnProperty.call(modules, id)) {
        selected[id] = sanitizeModule(modules[id], Boolean(options.includeSecrets));
      }
    });
    return {
      kind: ARCHIVE_KIND,
      schemaVersion: SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      source: "天择网本地数据中心",
      includeSecrets: Boolean(options.includeSecrets),
      modules: selected
    };
  }

  function validateArchive(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("归档顶层结构无效");
    if (value.kind !== ARCHIVE_KIND || value.schemaVersion !== SCHEMA_VERSION) throw new Error("不是受支持的天择网归档");
    if (typeof value.includeSecrets !== "boolean") throw new Error("归档密钥声明无效");
    if (!value.modules || typeof value.modules !== "object" || Array.isArray(value.modules)) throw new Error("归档缺少模块数据");
    var ids = Object.keys(value.modules);
    if (!ids.length || ids.some(function (id) { return MODULE_IDS.indexOf(id) < 0; })) throw new Error("归档模块列表无效");
    ids.forEach(function (id) {
      var moduleValue = value.modules[id];
      if (!moduleValue || typeof moduleValue !== "object" || Array.isArray(moduleValue)) throw new Error("模块数据无效：" + id);
      if (id === "english") {
        if (!moduleValue.meta || typeof moduleValue.meta !== "object" || Array.isArray(moduleValue.meta) ||
            !moduleValue.indexedDB || typeof moduleValue.indexedDB !== "object" || Array.isArray(moduleValue.indexedDB) ||
            !Array.isArray(moduleValue.indexedDB.vocab) || !moduleValue.indexedDB.records || typeof moduleValue.indexedDB.records !== "object" || Array.isArray(moduleValue.indexedDB.records)) {
          throw new Error("英语学习模块结构无效");
        }
        if (moduleValue.indexedDB.vocab.length > 100000 || Object.keys(moduleValue.indexedDB.records).length > 100000) throw new Error("英语学习模块条目过多");
      } else {
        var map = moduleValue.localStorage;
        if (!map || typeof map !== "object" || Array.isArray(map)) throw new Error("模块本地存储结构无效：" + id);
        var keys = Object.keys(map);
        if (keys.length > 10000 || keys.some(function (key) { return !LOCAL_KEY_RULES[id](key, value) || typeof map[key] !== "string"; })) {
          throw new Error("模块包含越界或无效的本地存储项：" + id);
        }
      }
    });
    return value;
  }

  function bytesToBase64(bytes) {
    var binary = "";
    for (var i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
    }
    if (typeof root.btoa === "function") return root.btoa(binary);
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
    throw new Error("当前环境不支持 Base64 编码");
  }

  function base64ToBytes(value) {
    if (typeof root.atob === "function") {
      var binary = root.atob(String(value || ""));
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(String(value || ""), "base64"));
    throw new Error("当前环境不支持 Base64 解码");
  }

  function cryptoApi(customCrypto) {
    var value = customCrypto || root.crypto;
    if (!value || !value.subtle || typeof value.getRandomValues !== "function") throw new Error("当前环境不支持安全加密");
    return value;
  }

  async function deriveKey(password, salt, usage, customCrypto) {
    var api = cryptoApi(customCrypto);
    var material = await api.subtle.importKey("raw", utf8Bytes(password), "PBKDF2", false, ["deriveKey"]);
    return api.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: ITERATIONS, hash: "SHA-256" }, material,
      { name: "AES-GCM", length: 256 }, false, [usage]);
  }

  async function encryptArchive(archive, password, customCrypto) {
    validateArchive(archive);
    if (String(password || "").length < 6) throw new Error("归档密码至少需要 6 个字符");
    var api = cryptoApi(customCrypto);
    var salt = api.getRandomValues(new Uint8Array(16));
    var iv = api.getRandomValues(new Uint8Array(12));
    var key = await deriveKey(password, salt, "encrypt", api);
    var ciphertext = new Uint8Array(await api.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, utf8Bytes(JSON.stringify(archive))));
    return {
      kind: ENCRYPTED_KIND,
      schemaVersion: SCHEMA_VERSION,
      crypto: { cipher: "AES-256-GCM", kdf: "PBKDF2-SHA256", iterations: ITERATIONS, salt: bytesToBase64(salt), iv: bytesToBase64(iv) },
      ciphertext: bytesToBase64(ciphertext)
    };
  }

  async function decryptArchive(wrapper, password, customCrypto) {
    if (!wrapper || wrapper.kind !== ENCRYPTED_KIND || wrapper.schemaVersion !== SCHEMA_VERSION || !wrapper.crypto || typeof wrapper.ciphertext !== "string") {
      throw new Error("不是受支持的加密归档");
    }
    if (wrapper.crypto.iterations !== ITERATIONS || wrapper.crypto.cipher !== "AES-256-GCM" || wrapper.crypto.kdf !== "PBKDF2-SHA256") {
      throw new Error("归档加密参数不受支持");
    }
    var api = cryptoApi(customCrypto);
    try {
      var salt = base64ToBytes(wrapper.crypto.salt);
      var iv = base64ToBytes(wrapper.crypto.iv);
      if (salt.length !== 16 || iv.length !== 12) throw new Error("归档加密参数损坏");
      var key = await deriveKey(password, salt, "decrypt", api);
      var plaintext = await api.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, base64ToBytes(wrapper.ciphertext));
      return validateArchive(JSON.parse(new TextDecoder().decode(plaintext)));
    } catch (error) {
      if (error && /参数|归档/.test(error.message || "")) throw error;
      throw new Error("密码错误或归档已损坏");
    }
  }

  async function runTransactional(ids, snapshotModule, applyModule, rollbackModule) {
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || ids.some(function (id) { return MODULE_IDS.indexOf(id) < 0; })) {
      throw new Error("事务模块列表无效");
    }
    if (typeof snapshotModule !== "function" || typeof applyModule !== "function" || typeof rollbackModule !== "function") throw new Error("事务处理器无效");
    var snapshots = {}, touched = [];
    for (var i = 0; i < ids.length; i += 1) snapshots[ids[i]] = await snapshotModule(ids[i]);
    try {
      for (var j = 0; j < ids.length; j += 1) {
        touched.push(ids[j]);
        await applyModule(ids[j], snapshots[ids[j]]);
      }
      return { ok: true, applied: ids.slice() };
    } catch (cause) {
      var rollbackErrors = [];
      for (var k = touched.length - 1; k >= 0; k -= 1) {
        var id = touched[k];
        try { await rollbackModule(id, snapshots[id]); }
        catch (rollbackError) { rollbackErrors.push(id + "：" + (rollbackError && rollbackError.message || String(rollbackError))); }
      }
      var message = "恢复失败" + (cause && cause.message ? "：" + cause.message : "") +
        (rollbackErrors.length ? "；回滚未完全成功（" + rollbackErrors.join("；") + "）" : "；已回滚到恢复前状态");
      var error = new Error(message);
      error.cause = cause;
      error.rollbackComplete = rollbackErrors.length === 0;
      error.rollbackErrors = rollbackErrors;
      throw error;
    }
  }

  return {
    ARCHIVE_KIND: ARCHIVE_KIND,
    ENCRYPTED_KIND: ENCRYPTED_KIND,
    SCHEMA_VERSION: SCHEMA_VERSION,
    ITERATIONS: ITERATIONS,
    MODULE_IDS: MODULE_IDS,
    clone: clone,
    byteLength: byteLength,
    redactSecretText: redactSecretText,
    stripSecrets: stripSecrets,
    secretField: secretField,
    preserveSecrets: preserveSecrets,
    prepareRestoreModule: prepareRestoreModule,
    sanitizeModule: sanitizeModule,
    makeArchive: makeArchive,
    validateArchive: validateArchive,
    runTransactional: runTransactional,
    encryptArchive: encryptArchive,
    decryptArchive: decryptArchive
  };
});
