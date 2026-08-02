/* ============================================================
   天择OS · 核心逻辑
   模块：Storage | Device | Apps | WindowManager
         | Desktop(自由摆放+分类) | Taskbar | StartMenu
         | ContextMenu | FloatingWidget | AIEngine
         | 内置应用（配置/对话/商城/设置/关于）
         | FloatChat（4.0 独立悬浮窗 Ctrl+1）
   ============================================================ */
(function () {
'use strict';

/* 系统版本（每次发布更新必须同步递增，并更新 dev/os/version.json） */
const OS_VERSION = '4.1.0';

/* ===================== 存储层 ===================== */
const Store = {
  KEY: 'tzos_state_v1',
  CHAT_KEY: 'tzos_chat_state_v3',
  SITE_CHAT_KEY: 'tz_site_ai_chat_v1',
  _cache: null,
  _chatCache: null,
  _siteChatCache: null,
  load() {
    if (this._cache) return this._cache;
    try { this._cache = JSON.parse(localStorage.getItem(this.KEY)) || {}; }
    catch { this._cache = {}; }
    return this._cache;
  },
  save(state) {
    this._cache = state;
    localStorage.setItem(this.KEY, JSON.stringify(state));
  },
  get(k, def) { const s = this.load(); return s[k] !== undefined ? s[k] : def; },
  set(k, v) { const s = this.load(); s[k] = v; this.save(s); },
  _chatState() {
    if (window.__tzSiteEmbedMode) {
      if (this._siteChatCache) return this._siteChatCache;
      try { this._siteChatCache = JSON.parse(localStorage.getItem(this.SITE_CHAT_KEY)) || {}; }
      catch { this._siteChatCache = {}; }
      return this._siteChatCache;
    }
    if (this._chatCache) return this._chatCache;
    try {
      const saved = JSON.parse(localStorage.getItem(this.CHAT_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        this._chatCache = saved;
        return saved;
      }
    } catch (_) {}
    // v4.1 之前聊天和系统设置共用一个巨大 JSON。首次读取时无损迁移到独立键，
    // 以后切换主题、移动窗口等小操作不再序列化整份对话历史。
    const legacy = this.load();
    const fields = ['chatSessions', 'activeChatId', 'chatHistory', 'chatCtxReal', 'chatCtxRealByChat', 'chatSchemaVersion'];
    const migrated = {};
    let found = false;
    fields.forEach(key => {
      if (legacy[key] !== undefined) {
        migrated[key] = legacy[key];
        delete legacy[key];
        found = true;
      }
    });
    this._chatCache = migrated;
    try {
      localStorage.setItem(this.CHAT_KEY, JSON.stringify(migrated));
      if (found) this.save(legacy);
    } catch (_) {}
    return migrated;
  },
  _saveChatState(state) {
    state.storageRev = (parseInt(state.storageRev, 10) || 0) + 1;
    if (window.__tzSiteEmbedMode) {
      this._siteChatCache = state;
      localStorage.setItem(this.SITE_CHAT_KEY, JSON.stringify(state));
      return;
    }
    this._chatCache = state;
    localStorage.setItem(this.CHAT_KEY, JSON.stringify(state));
  },
  chatStorageKey() { return window.__tzSiteEmbedMode ? this.SITE_CHAT_KEY : this.CHAT_KEY; },
  invalidateChatCache() {
    if (window.__tzSiteEmbedMode) this._siteChatCache = null;
    else this._chatCache = null;
  },
  getSiteChatOption(key, fallback) {
    const state = this._chatState();
    return state[key] !== undefined ? state[key] : fallback;
  },
  setSiteChatOption(key, value) {
    const state = this._chatState();
    state[key] = value;
    this._saveChatState(state);
  },
  // 已安装软件
  getApps() { return this.get('installedApps', []); },
  saveApp(app) { const apps = this.getApps(); apps.push(app); this.set('installedApps', apps); },
  removeApp(id) { const apps = this.getApps().filter(a => a.id !== id); this.set('installedApps', apps); },
  updateApp(id, patch) { const apps = this.getApps(); const i = apps.findIndex(a => a.id === id); if (i < 0) return null; apps[i] = { ...apps[i], ...patch }; this.set('installedApps', apps); return apps[i]; },
  // AI 配置
  getAIConfig() {
    return this.get('aiConfig', { url: 'https://api.deepseek.com/v1/chat/completions', key: '', model: 'deepseek-v4-flash' });
  },
  setAIConfig(cfg) { this.set('aiConfig', cfg); },
  // 用户自定义 AI 配置：固定三个本地槽位，槽位可为空；密钥随整套配置仅存 localStorage。
  getAIProfiles() {
    const raw = this.get('aiCustomProfiles', []);
    return Array.from({ length: 3 }, (_, index) => {
      const item = Array.isArray(raw) ? raw[index] : null;
      if (!item || typeof item !== 'object' || !item.config || typeof item.config !== 'object') return null;
      return {
        name: String(item.name || ('我的配置 ' + (index + 1))).slice(0, 32),
        config: { ...item.config, prices: { ...(item.config.prices || {}) } },
        caps: { image: true, file: true, webSearch: false, contextLength: 0, ...(item.caps || {}) },
        updatedAt: Number(item.updatedAt) || 0
      };
    });
  },
  setAIProfiles(items) {
    const safe = Array.from({ length: 3 }, (_, index) => {
      const item = Array.isArray(items) ? items[index] : null;
      return item && item.config ? item : null;
    });
    this.set('aiCustomProfiles', safe);
  },
  // 豆包 AI 配置（Volcengine Ark OpenAI 兼容接口）
  getDoubaoConfig() {
    return this.get('doubaoConfig', { url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', key: '', model: 'doubao-1-5-pro-32k-250115' });
  },
  setDoubaoConfig(cfg) { this.set('doubaoConfig', cfg); },
  // 当前对话使用的 AI 提供方：'custom' | 'doubao'
  getProvider() { return this.get('aiProvider', 'custom'); },
  setProvider(p) { this.set('aiProvider', p); },
  // 深度思考开关（默认开启）
  getDeepThink() { return this.get('deepThink', true); },
  setDeepThink(b) { this.set('deepThink', !!b); },
  // 桌面风格
  getStyle() { return this.get('desktopStyle', null); }, // null=自动, 'win', 'mac'
  setStyle(s) { this.set('desktopStyle', s); },
  // AI 多会话：旧存档只有 chatHistory，首次读取时自动迁移为第一个标签。
  _newChatId() { return (window.__tzSiteEmbedMode ? 'site-chat-' : 'chat-') + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); },
  _chatTitle(messages) {
    const first = (messages || []).find(m => m && m.role === 'user' && typeof m.content === 'string');
    const text = first ? first.content.replace(/\s+/g, ' ').trim() : '';
    return text ? text.slice(0, 22) : '新对话';
  },
  _makeChatRecord() {
    const now = Date.now();
    return { id: this._newChatId(), title: '新对话', messages: [], createdAt: now, updatedAt: now, rev: 1, aiNamed: false, nameState: 'idle' };
  },
  getChats() {
    const s = this._chatState();
    let chats = Array.isArray(s.chatSessions) ? s.chatSessions.filter(c => c && c.id && Array.isArray(c.messages)) : [];
    if (!chats.length) {
      const now = Date.now();
      const legacy = window.__tzSiteEmbedMode ? [] : (Array.isArray(s.chatHistory) ? s.chatHistory.slice(-100) : []);
      // 使用确定性迁移 ID，避免主窗口和悬浮窗首次并发读取旧存档时各造一个会话。
      const id = window.__tzSiteEmbedMode ? 'site-chat-default-v1' : 'chat-legacy-v1';
      chats = [{ id, title: this._chatTitle(legacy), messages: legacy, createdAt: now, updatedAt: now, rev: 1, aiNamed: false, nameState: 'idle' }];
      s.chatSessions = chats;
      s.activeChatId = id;
      delete s.chatHistory;
      s.chatSchemaVersion = 2;
      this._saveChatState(s);
    }
    return chats;
  },
  getActiveChatId() {
    const chats = this.getVisibleChats();
    const current = this._chatState().activeChatId || '';
    if (chats.some(c => c.id === current)) return current;
    if (chats.length) return chats[0].id;
    const s = this._chatState();
    const chat = this._makeChatRecord();
    const all = this.getChats();
    all.push(chat);
    s.chatSessions = all;
    s.activeChatId = chat.id;
    delete s.chatHistory;
    s.chatCtxReal = null;
    s.chatSchemaVersion = 2;
    this._saveChatState(s);
    return chat.id;
  },
  getVisibleChats() { return this.getChats().filter(chat => !chat.archivedAt); },
  getArchivedChats() {
    return this.getChats().filter(chat => !!chat.archivedAt).sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));
  },
  setActiveChat(id) {
    const s = this._chatState();
    const chats = this.getChats();
    const chat = chats.find(c => c.id === id);
    if (!chat || chat.archivedAt) return false;
    s.activeChatId = chat.id;
    delete s.chatHistory;
    s.chatCtxReal = this.getChatCtxReal(chat.id);
    this._saveChatState(s);
    return true;
  },
  getChat(id) {
    const chats = this.getChats();
    const target = id || this.getActiveChatId();
    const chat = chats.find(c => c.id === target);
    return chat ? chat.messages : [];
  },
  setChat(h, id) {
    const s = this._chatState();
    const chats = this.getChats();
    const target = id || this.getActiveChatId();
    const chat = chats.find(c => c.id === target);
    // 已关闭会话的异步回复绝不能回退写入其他标签。
    if (!chat) return false;
    chat.messages = (Array.isArray(h) ? h : []).slice(-100);
    if (!chat.title || chat.title === '新对话') chat.title = this._chatTitle(chat.messages);
    chat.updatedAt = Date.now();
    chat.rev = (parseInt(chat.rev, 10) || 0) + 1;
    s.chatSessions = chats;
    s.chatSchemaVersion = 2;
    if (s.activeChatId === chat.id || !s.activeChatId) {
      s.activeChatId = chat.id;
    }
    delete s.chatHistory;
    this._saveChatState(s);
    return true;
  },
  updateChatMeta(id, patch) {
    const s = this._chatState();
    const chats = this.getChats();
    const chat = chats.find(item => item.id === id);
    if (!chat) return false;
    Object.assign(chat, patch || {});
    chat.updatedAt = Date.now();
    chat.rev = (parseInt(chat.rev, 10) || 0) + 1;
    s.chatSessions = chats;
    this._saveChatState(s);
    return true;
  },
  newChat() {
    const s = this._chatState();
    const chats = this.getChats();
    if (this.getVisibleChats().length >= 30) return null;
    const chat = this._makeChatRecord();
    chats.push(chat);
    s.chatSessions = chats;
    s.activeChatId = chat.id;
    delete s.chatHistory;
    s.chatCtxReal = null;
    s.chatSchemaVersion = 2;
    this._saveChatState(s);
    return chat;
  },
  archiveChat(id) {
    const s = this._chatState();
    const chats = this.getChats();
    const chat = chats.find(item => item.id === id);
    if (!chat || chat.archivedAt) return false;
    chat.archivedAt = Date.now();
    chat.updatedAt = chat.archivedAt;
    chat.rev = (parseInt(chat.rev, 10) || 0) + 1;
    let visible = chats.filter(item => !item.archivedAt);
    if (!visible.length) {
      const next = this._makeChatRecord();
      chats.push(next);
      visible = [next];
    }
    const active = visible.find(item => item.id === s.activeChatId) || visible[0];
    s.chatSessions = chats;
    s.activeChatId = active.id;
    delete s.chatHistory;
    s.chatCtxReal = this.getChatCtxReal(active.id);
    s.chatSchemaVersion = 2;
    this._saveChatState(s);
    return true;
  },
  restoreChat(id) {
    const s = this._chatState();
    const chats = this.getChats();
    const chat = chats.find(item => item.id === id);
    if (!chat || !chat.archivedAt) return false;
    delete chat.archivedAt;
    chat.updatedAt = Date.now();
    chat.rev = (parseInt(chat.rev, 10) || 0) + 1;
    s.chatSessions = chats;
    s.activeChatId = chat.id;
    delete s.chatHistory;
    s.chatCtxReal = this.getChatCtxReal(chat.id);
    s.chatSchemaVersion = 2;
    this._saveChatState(s);
    return true;
  },
  removeChat(id) {
    const s = this._chatState();
    const before = this.getChats();
    const removedIndex = before.findIndex(c => c.id === id);
    let chats = before.filter(c => c.id !== id);
    let visible = chats.filter(c => !c.archivedAt);
    if (!visible.length) {
      const next = this._makeChatRecord();
      chats.push(next);
      visible = [next];
    }
    const active = visible.find(c => c.id === s.activeChatId) ||
      visible[Math.min(Math.max(removedIndex, 0), visible.length - 1)];
    s.chatSessions = chats;
    s.activeChatId = active.id;
    delete s.chatHistory;
    const ctxMap = { ...(s.chatCtxRealByChat || {}) };
    delete ctxMap[id];
    s.chatCtxRealByChat = ctxMap;
    s.chatCtxReal = ctxMap[active.id] || null;
    s.chatSchemaVersion = 2;
    this._saveChatState(s);
    if (typeof ChatSessions !== 'undefined') ChatSessions.releaseChat(id);
    return active.id;
  },
  clearAllChats() {
    const s = this._chatState();
    const chat = this._makeChatRecord();
    s.chatSessions = [chat];
    s.activeChatId = chat.id;
    delete s.chatHistory;
    s.chatCtxRealByChat = {};
    s.chatCtxReal = null;
    s.chatSchemaVersion = 2;
    this._saveChatState(s);
    return chat;
  },
  getChatCtxReal(id) {
    const map = this._chatState().chatCtxRealByChat || {};
    return map[id || this.getActiveChatId()] || null;
  },
  setChatCtxReal(value, id) {
    const key = id || this.getActiveChatId();
    const s = this._chatState();
    const map = { ...(s.chatCtxRealByChat || {}) };
    if (value) map[key] = value; else delete map[key];
    s.chatCtxRealByChat = map;
    if (key === s.activeChatId) s.chatCtxReal = value || null;
    this._saveChatState(s);
  },
  // 通知
  getNotifs() { return this.get('notifs', []); },
  addNotif(n) { const ns = this.getNotifs(); ns.unshift({ ...n, time: Date.now() }); this.set('notifs', ns.slice(0, 30)); },
  addNotifOnce(key, n) {
    const ns = this.getNotifs().filter(item => item && item.dedupeKey !== key && !(item.title === n.title && item.body === n.body));
    ns.unshift({ ...n, dedupeKey: key, time: Date.now() });
    this.set('notifs', ns.slice(0, 30));
  },
  clearNotifs() { this.set('notifs', []); },
  // 桌面图标自由位置 { appId: {x,y} }
  getIconPositions() { return this.get('iconPositions', {}); },
  setIconPositions(p) { this.set('iconPositions', p); },
  clearIconPositions() { this.set('iconPositions', {}); },
  // 任务栏固定应用 [appId,...]
  getPinned() { return this.get('pinnedApps', []); },
  togglePin(id) { const p = this.getPinned(); const i = p.indexOf(id); if (i >= 0) p.splice(i, 1); else p.push(id); this.set('pinnedApps', p); },
  // 悬浮窗位置与开关 {x,y} / bool
  getWidget() { return this.get('widget', { x: null, y: null, closed: false }); },
  setWidget(w) { this.set('widget', w); },
  // 浅色/深色主题
  getTheme() { return this.get('theme', 'dark'); },
  setTheme(t) { this.set('theme', t === 'light' ? 'light' : 'dark'); },
  getAccessibility() {
    const saved = this.get('accessibility', {});
    return {
      largeText: !!saved.largeText,
      highContrast: !!saved.highContrast,
      lowTransparency: !!saved.lowTransparency,
      reducedMotion: !!saved.reducedMotion
    };
  },
  setAccessibility(patch) { this.set('accessibility', { ...this.getAccessibility(), ...(patch || {}) }); },
  // 浏览器收藏夹 [{title,url,time}]
  getBookmarks() { return this.get('bookmarks', []); },
  setBookmarks(b) { this.set('bookmarks', b); },
  // AI 记忆 [{id,text,enabled}]
  getMemories() { return this.get('aiMemories', []); },
  setMemories(m) { this.set('aiMemories', m); },
  // 记忆总开关：生成后自动写入记忆
  getMemAuto() { return this.get('memAutoWrite', true); },
  setMemAuto(b) { this.set('memAutoWrite', !!b); },
  // 记忆总开关：将启用的记忆注入提示词
  getMemInject() { return this.get('memInject', true); },
  setMemInject(b) { this.set('memInject', !!b); },
  // AI 命令行模式（Agent）：开启后 AI 可在对话中直接执行命令行命令（消耗大量 token）
  getAgentMode() { return this.get('agentMode', false); },
  setAgentMode(b) { this.set('agentMode', !!b); },
  // 对话自动截图开关（需视觉模型）
  getScreenshotMode() { return this.get('chatScreenshot', false); },
  setScreenshotMode(b) { this.set('chatScreenshot', !!b); },
  // AI 能力设置：图片输入（关闭则截图功能禁用）、文件输入、联网搜索（开启则对话默认带 web_search）、上下文长度
  getAICaps() {
    return this.get('aiCaps', { image: true, file: true, webSearch: false, contextLength: 0 });
  },
  setAICaps(caps) { this.set('aiCaps', { ...this.getAICaps(), ...caps }); },
  // AI 知识库四来源模式：off=完全关闭，auto=按问题匹配，full=每轮全量优先注入。
  getKnowledgeModes() {
    const saved = this.get('knowledgeSourceModes', {});
    const valid = value => ['off', 'auto', 'full'].includes(value) ? value : 'auto';
    return {
      site: valid(saved.site),
      document: valid(saved.document),
      note: valid(saved.note),
      chat: valid(saved.chat)
    };
  },
  setKnowledgeMode(source, mode) {
    if (!['site', 'document', 'note', 'chat'].includes(source)) return false;
    if (!['off', 'auto', 'full'].includes(mode)) return false;
    const next = { ...this.getKnowledgeModes(), [source]: mode };
    this.set('knowledgeSourceModes', next);
    return true;
  },
  // 联网能力与本轮启用状态分离：不支持的模型不显示按钮，支持的模型可按需开关。
  getWebSearch() { return this.get('chatWebSearch', false); },
  setWebSearch(b) { this.set('chatWebSearch', !!b); },
  // 完整皮肤：基础皮肤由积分与等级解锁；vip-* 由当期 VIP 权益解锁（见 RPG）。
  getPalette() {
    const p = this.get('palette', 'cold');
    return ['cold', 'mid', 'warm', 'vip-bronze', 'vip-silver', 'vip-gold', 'vip-platinum', 'vip-blackgold', 'vip-diamond'].includes(p) ? p : 'cold';
  },
  setPalette(p) {
    const valid = ['cold', 'mid', 'warm', 'vip-bronze', 'vip-silver', 'vip-gold', 'vip-platinum', 'vip-blackgold', 'vip-diamond'];
    this.set('palette', valid.includes(p) ? p : 'cold');
  }
};

/* ===================== 用户等级与积分（v3.5）=====================
 * 日常使用即可获得积分，积分可兑换界面配色皮肤；等级由累计积分决定。
 * 数据经混淆 + 校验和存储（防直接在 localStorage 手改数字），键 tzos_rpg_v1；
 * 全量存档导出覆盖 localStorage 全量，等级积分随存档一并迁移。
 * 注意：字段只含数字/英文/数组（btoa 不容非 Latin1 字符），勿存中文。 */
const RPG_SKINS = {
  cold: { name: '星海冷光', desc: '紫蓝星海 · 默认完整皮肤', cost: 0, minLevel: 1, texture: 'cold', css: ['#7c3aed', '#3b82f6', '#10b981'], soft: ['#a78bfa', '#60a5fa', '#6ee7b7'], rgb: ['139,92,246', '59,130,246', '16,185,129'] },
  mid:  { name: '森屿标准', desc: '蓝绿生态 · 清晰平衡', cost: 300, minLevel: 3, texture: 'mid', css: ['#3b82f6', '#10b981', '#eab308'], soft: ['#60a5fa', '#6ee7b7', '#fde047'], rgb: ['96,165,250', '110,231,183', '253,224,71'] },
  warm: { name: '日曜暖金', desc: '绿金日光 · 温暖明亮', cost: 800, minLevel: 6, texture: 'warm', css: ['#10b981', '#eab308', '#f97316'], soft: ['#6ee7b7', '#fde047', '#fdba74'], rgb: ['110,231,183', '253,224,71', '253,186,116'] },
  'vip-bronze': { name: '青铜纪元', desc: '拉丝青铜 · 晨光电路', vipTier: 'bronze', texture: 'warm', css: ['#a16207', '#d97706', '#0f766e'], soft: ['#d6a76c', '#f4b860', '#5eead4'], rgb: ['161,98,7', '217,119,6', '15,118,110'] },
  'vip-silver': { name: '白银月霜', desc: '月白银霜 · 淡蓝流光', vipTier: 'silver', texture: 'cold', css: ['#64748b', '#60a5fa', '#22d3ee'], soft: ['#cbd5e1', '#93c5fd', '#67e8f9'], rgb: ['100,116,139', '96,165,250', '34,211,238'] },
  'vip-gold': { name: '黄金日冕', desc: '香槟金 · 日冕弧光', vipTier: 'gold', texture: 'warm', css: ['#b45309', '#f59e0b', '#facc15'], soft: ['#f5c46b', '#fcd34d', '#fef08a'], rgb: ['180,83,9', '245,158,11', '250,204,21'] },
  'vip-platinum': { name: '铂金虹辉', desc: '珍珠铂金 · 冰白虹彩', vipTier: 'platinum', texture: 'cold', css: ['#8b5cf6', '#cbd5e1', '#38bdf8'], soft: ['#c4b5fd', '#f8fafc', '#7dd3fc'], rgb: ['139,92,246', '203,213,225', '56,189,248'] },
  'vip-blackgold': { name: '黑金曜界', desc: '黑曜石 · 精密金线', vipTier: 'blackgold', texture: 'warm', css: ['#292524', '#ca8a04', '#f59e0b'], soft: ['#78716c', '#fde047', '#fbbf24'], rgb: ['41,37,36', '202,138,4', '245,158,11'] },
  'vip-diamond': { name: '钻石棱境', desc: '晶格棱镜 · 冰蓝极光', vipTier: 'diamond', texture: 'cold', css: ['#6366f1', '#22d3ee', '#e879f9'], soft: ['#a5b4fc', '#a5f3fc', '#f0abfc'], rgb: ['99,102,241', '34,211,238', '232,121,249'] }
};
const VIP_PLANS = [
  { id: 'bronze', name: '青铜 VIP', level: 1, cost: 200, skin: 'vip-bronze' },
  { id: 'silver', name: '白银 VIP', level: 2, cost: 400, skin: 'vip-silver' },
  { id: 'gold', name: '黄金 VIP', level: 4, cost: 700, skin: 'vip-gold' },
  { id: 'platinum', name: '铂金 VIP', level: 6, cost: 1150, skin: 'vip-platinum' },
  { id: 'blackgold', name: '黑金 VIP', level: 8, cost: 1800, skin: 'vip-blackgold' },
  { id: 'diamond', name: '钻石 VIP', level: 10, cost: 2600, skin: 'vip-diamond' }
];
const VIP_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const RPG_RULES = [
  { id: 'boot',    pts: 10, cap: 10, name: '每日启动' },
  { id: 'chat',    pts: 2,  cap: 20, name: 'AI 对话' },
  { id: 'term',    pts: 1,  cap: 15, name: '终端命令' },
  { id: 'aicmd',   pts: 1,  cap: 10, name: 'AI 执行命令' },
  { id: 'note',    pts: 5,  cap: 15, name: '新建笔记' },
  { id: 'install', pts: 15, cap: 45, name: '安装 AI 软件' },
  { id: 'export',  pts: 5,  cap: 5,  name: '导出存档' }
];
const RPG_DAILY_CAP = RPG_RULES.reduce((sum, rule) => sum + rule.cap, 0);
const RPG_TITLES = [[1, '萌芽'], [3, '探路者'], [5, '进取者'], [8, '精通者'], [12, '大师'], [16, '传说'], [20, '星穹']];
const RPG = {
  KEY: 'tzos_rpg_v1',
  _SALT: 'tzos-rpg-salt-2026#v1',
  _XK: 'TZOS$RPG#2026',
  _d: null, _tp: 0, _tt: null,
  _def() { return { v: 2, total: 0, points: 0, day: '', gain: {}, skins: ['cold'], vip: { tier: '', expiresAt: 0 }, ts: 0 }; },
  _hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = (((h << 5) + h + s.charCodeAt(i)) >>> 0); return h.toString(36); },
  _xor(s) { const k = this._XK; let o = ''; for (let i = 0; i < s.length; i++) o += String.fromCharCode(s.charCodeAt(i) ^ k.charCodeAt(i % k.length)); return o; },
  data() {
    if (this._d) return this._d;
    let d = null;
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) {
        const p = JSON.parse(raw);
        const json = this._xor(atob(p.d || ''));
        if (p.s === this._hash(json + this._SALT)) d = JSON.parse(json);
      }
    } catch (e) { d = null; }
    // 校验失败（含手改）→ 重置为初始，不给篡改留口子
    if (!d || typeof d !== 'object' || !Array.isArray(d.skins) || typeof d.points !== 'number') d = this._def();
    if (!d.vip || typeof d.vip !== 'object') d.vip = { tier: '', expiresAt: 0 };
    if (!VIP_PLANS.some(plan => plan.id === d.vip.tier)) d.vip.tier = '';
    d.vip.expiresAt = Math.max(0, Number(d.vip.expiresAt) || 0);
    d.v = 2;
    this._d = d;
    return d;
  },
  save() {
    const d = this._d || this._def();
    this._d = d;
    try {
      const json = JSON.stringify(d);
      localStorage.setItem(this.KEY, JSON.stringify({ d: btoa(this._xor(json)), s: this._hash(json + this._SALT) }));
    } catch (e) {}
  },
  _today() { const t = new Date(); return t.getFullYear() + '-' + (t.getMonth() + 1) + '-' + t.getDate(); },
  _rollDay(d) { const t = this._today(); if (d.day !== t) { d.day = t; d.gain = {}; } },
  // 发放积分（受每日上限约束）；返回实际获得。toast 做 900ms 聚合，避免 AI 连发命令时刷屏
  gain(id) {
    const rule = RPG_RULES.find(r => r.id === id);
    if (!rule) return 0;
    const d = this.data();
    this._rollDay(d);
    const got = d.gain[id] || 0;
    if (got >= rule.cap) return 0;
    const add = Math.min(rule.pts, rule.cap - got);
    d.gain[id] = got + add;
    d.total += add; d.points += add;
    this.save();
    this._tp += add;
    clearTimeout(this._tt);
    this._tt = setTimeout(() => { toast('+' + this._tp + ' 积分 · 当前 ' + this.data().points + ' 分（level 命令查看）', 1800); this._tp = 0; }, 900);
    return add;
  },
  // 等级：Lv1→2 需累计 100，之后每级递增 100（Lv2→3 需 200，Lv3→4 需 300…）
  level() {
    let l = 1, left = Math.max(0, this.data().total | 0);
    while (left >= l * 100) { left -= l * 100; l++; }
    return { lv: l, into: left, need: l * 100 };
  },
  title() { const lv = this.level().lv; let t = RPG_TITLES[0][1]; for (const pair of RPG_TITLES) if (lv >= pair[0]) t = pair[1]; return t; },
  vip() {
    const d = this.data();
    const plan = VIP_PLANS.find(item => item.id === d.vip.tier) || null;
    const active = !!plan && d.vip.expiresAt > Date.now();
    return { active, tier: active ? plan.id : '', plan: active ? plan : null, expiresAt: d.vip.expiresAt, expiredTier: active ? '' : (plan && plan.id) || '' };
  },
  vipRank(id) { return VIP_PLANS.findIndex(plan => plan.id === id); },
  hasVipTier(id) {
    const current = this.vip();
    return current.active && this.vipRank(current.tier) >= this.vipRank(id) && this.vipRank(id) >= 0;
  },
  hasSkin(id) {
    const skin = RPG_SKINS[id];
    if (!skin) return false;
    return skin.vipTier ? this.hasVipTier(skin.vipTier) : this.data().skins.indexOf(id) >= 0;
  },
  unlockSkin(id) {
    const s = RPG_SKINS[id];
    if (!s) return { ok: false, msg: '未知配色：' + id };
    if (s.vipTier) return { ok: false, msg: '「' + s.name + '」是 ' + (VIP_PLANS.find(plan => plan.id === s.vipTier)?.name || 'VIP') + ' 专属皮肤，请用 vip subscribe ' + s.vipTier + ' 按月解锁' };
    const d = this.data();
    if (d.skins.indexOf(id) >= 0) return { ok: true, msg: '「' + s.name + '」已解锁过' };
    const level = this.level().lv;
    if (level < (s.minLevel || 1)) return { ok: false, msg: '等级不足：「' + s.name + '」需要 Lv.' + (s.minLevel || 1) + '，当前 Lv.' + level };
    if (d.points < s.cost) return { ok: false, msg: '积分不足：「' + s.name + '」需 ' + s.cost + ' 分，当前 ' + d.points + ' 分' };
    d.points -= s.cost;
    d.skins.push(id);
    this.save();
    return { ok: true, msg: '已解锁「' + s.name + '」配色（-' + s.cost + ' 积分，剩余 ' + d.points + ' 分）' };
  },
  subscribeVip(id) {
    const plan = VIP_PLANS.find(item => item.id === id);
    if (!plan) return { ok: false, msg: '未知 VIP 档位：' + id };
    const d = this.data();
    const level = this.level().lv;
    if (level < plan.level) return { ok: false, msg: plan.name + ' 需要 Lv.' + plan.level + '，当前 Lv.' + level };
    const current = this.vip();
    if (current.active && this.vipRank(current.tier) > this.vipRank(id)) return { ok: false, msg: '当前 ' + current.plan.name + ' 已覆盖该档权益，无需降档购买' };
    if (d.points < plan.cost) return { ok: false, msg: '积分不足：' + plan.name + ' 包月需 ' + plan.cost + ' 分，当前 ' + d.points + ' 分' };
    d.points -= plan.cost;
    const base = current.active ? Math.max(Date.now(), d.vip.expiresAt) : Date.now();
    d.vip = { tier: plan.id, expiresAt: base + VIP_MONTH_MS };
    this.save();
    return { ok: true, msg: '已开通 ' + plan.name + ' 30 天（-' + plan.cost + ' 积分，剩余 ' + d.points + ' 分）', plan, expiresAt: d.vip.expiresAt };
  },
  summary() {
    const d = this.data();
    this._rollDay(d);
    const l = this.level();
    return { lv: l.lv, into: l.into, need: l.need, title: this.title(), points: d.points, total: d.total, gain: { ...d.gain }, skins: d.skins.slice(), vip: this.vip() };
  }
};
// 应用当前配色到 <body data-palette>（cold 为默认，不设属性）
// 若存档被篡改/重置导致已选配色不再解锁，回落到冷色并同步纠正存储
function applyPalette() {
  let p = Store.getPalette();
  if (p !== 'cold' && !RPG.hasSkin(p)) { p = 'cold'; Store.setPalette('cold'); }
  if (p === 'cold') document.body.removeAttribute('data-palette');
  else document.body.setAttribute('data-palette', p);
  syncFloatOverlayTheme();
}
window.TZOS = window.TZOS || {}; // TZOS 正式赋值在后文，这里先确保存在
window.TZOS.setPalette = function (p) {
  if (!RPG_SKINS[p]) return;
  if (!RPG.hasSkin(p)) {
    const skin = RPG_SKINS[p];
    const plan = skin.vipTier && VIP_PLANS.find(item => item.id === skin.vipTier);
    toast(plan
      ? '「' + skin.name + '」需要有效的 ' + plan.name + ' 或更高档 VIP'
      : '「' + skin.name + '」尚未解锁（Lv.' + (skin.minLevel || 1) + ' 且 ' + skin.cost + ' 积分）', 3400);
    return;
  }
  Store.setPalette(p);
  applyPalette();
  refreshOpenApp('growth');
  refreshOpenApp('settings');
  toast('已切换为「' + RPG_SKINS[p].name + '」配色（' + RPG_SKINS[p].desc + '）');
};
// 点击配色卡片：已解锁→直接切换；未解锁→尝试用积分兑换并切换
window.TZOS.tryUnlockSkin = function (p) {
  const s = RPG_SKINS[p];
  if (!s) return;
  if (RPG.hasSkin(p)) { window.TZOS.setPalette(p); return; }
  if (s.vipTier) { window.TZOS.subscribeVip(s.vipTier); return; }
  const res = RPG.unlockSkin(p);
  toast(res.msg, 3400);
  if (res.ok) window.TZOS.setPalette(p);
  else { refreshOpenApp('growth'); refreshOpenApp('settings'); }
};
window.TZOS.subscribeVip = async function(id) {
  const plan = VIP_PLANS.find(item => item.id === String(id || ''));
  if (!plan) return;
  const level = RPG.level().lv;
  const current = RPG.vip();
  if (level < plan.level) { toast(plan.name + ' 需要 Lv.' + plan.level + '，当前 Lv.' + level, 3400); return; }
  if (current.active && RPG.vipRank(current.tier) > RPG.vipRank(plan.id)) {
    toast('当前 ' + current.plan.name + ' 已包含 ' + plan.name + ' 皮肤权益');
    return;
  }
  const action = current.active && current.tier === plan.id ? '续订' : current.active ? '升级并续期' : '开通';
  const ok = await confirmDialog({
    title: action + plan.name,
    message: `${action}将扣除 ${plan.cost} 积分，权益有效期增加 30 天。\nVIP 不会自动续费；高档 VIP 可使用本档及以下全部 VIP 皮肤。`,
    confirmText: action + '（' + plan.cost + ' 分）'
  });
  if (!ok) return;
  const result = RPG.subscribeVip(plan.id);
  toast(result.msg, 4200);
  if (result.ok) {
    Store.setPalette(plan.skin);
    applyPalette();
    refreshOpenApp('growth');
    refreshOpenApp('settings');
    Desktop.render();
  }
};

/* ===================== 悬浮窗独立设置 =====================
 * OS 对话窗口与普通 AI 悬浮窗共享 API 配置和聊天记录，但交互开关各自独立。
 * 站内嵌入模式只共享 API 配置；聊天记录、活动会话与交互开关均使用独立存档，
 * 也不读取普通悬浮窗的提供商选择。
 * 悬浮窗是独立文档（desktop float-chat.html），window.__tzFloatMode 为 true。 */
function _isFloatCtx() { return !!window.__tzFloatMode; }
function getDeepThinkCtx() {
  if (window.__tzSiteEmbedMode) return Store.getSiteChatOption('deepThink', true);
  return _isFloatCtx() ? Store.get('float_deepThink', Store.getDeepThink()) : Store.getDeepThink();
}
function setDeepThinkCtx(b) {
  if (window.__tzSiteEmbedMode) Store.setSiteChatOption('deepThink', !!b);
  else if (_isFloatCtx()) Store.set('float_deepThink', !!b);
  else Store.setDeepThink(b);
}
function getProviderCtx() {
  if (window.__tzSiteEmbedMode) return 'custom';
  return _isFloatCtx() ? Store.get('float_provider', Store.getProvider()) : Store.getProvider();
}
function setProviderCtx(p) {
  if (window.__tzSiteEmbedMode) return;
  if (_isFloatCtx()) Store.set('float_provider', p);
  else Store.setProvider(p);
}
function getScreenshotCtx() {
  if (window.__tzSiteEmbedMode) return Store.getSiteChatOption('screenshot', false);
  return _isFloatCtx() ? Store.get('float_chatScreenshot', Store.getScreenshotMode()) : Store.getScreenshotMode();
}
function setScreenshotCtx(b) {
  if (window.__tzSiteEmbedMode) Store.setSiteChatOption('screenshot', !!b);
  else if (_isFloatCtx()) Store.set('float_chatScreenshot', !!b);
  else Store.setScreenshotMode(b);
}
function getWebSearchCtx() {
  if (window.__tzSiteEmbedMode) return Store.getSiteChatOption('webSearch', false);
  return _isFloatCtx() ? Store.get('float_webSearch', Store.getWebSearch()) : Store.getWebSearch();
}
function setWebSearchCtx(b) {
  if (window.__tzSiteEmbedMode) Store.setSiteChatOption('webSearch', !!b);
  else if (_isFloatCtx()) Store.set('float_webSearch', !!b);
  else Store.setWebSearch(b);
}

/* ===================== 天择网站内 AI 上下文 =====================
 * `float-chat.html?embedded=1&site=1` 仅使用父页提供的只读站点上下文和
 * `/assets/data/site-ai-index.json`。这里不提供导航或 Agent 桥接，模型只能
 * 在回答中返回用户可自行点击的站内 Markdown 链接。 */
const SITE_AI_CONTEXT_MESSAGE = 'tz-site-context-v1';
const SITE_AI_READY_MESSAGE = 'tz-site-context-ready-v1';
const SITE_AI_SCREENSHOT_REQUEST = 'tz-site-screenshot-request-v1';
const SITE_AI_SCREENSHOT_RESULT = 'tz-site-screenshot-result-v1';
const SITE_AI_OPEN_URL = 'tz-site-open-url';

/* 用户主动加入的本地文档知识库。正文只保存在当前站点/天择OS来源的
 * IndexedDB 中；检索先在本机完成，只有命中的短摘录会随本轮请求发给
 * 用户已配置的模型。 */
const KnowledgeStore = {
  DB_NAME: 'tzknowledge',
  DB_VERSION: 1,
  STORE_NAME: 'documents',
  open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  async withStore(mode, action) {
    let db = null;
    try {
      db = await this.open();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE_NAME, mode);
        const store = tx.objectStore(this.STORE_NAME);
        let result;
        try { result = action(store); }
        catch (error) { reject(error); return; }
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      if (db) db.close();
    }
  },
  async listDocs() {
    let db = null;
    try {
      db = await this.open();
      const rows = await new Promise((resolve, reject) => {
        const request = db.transaction(this.STORE_NAME, 'readonly')
          .objectStore(this.STORE_NAME).getAll();
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
        request.onerror = () => reject(request.error);
      });
      return rows.sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
    } catch (_) {
      return [];
    } finally {
      if (db) db.close();
    }
  },
  async getDoc(id) {
    if (!id) return null;
    let db = null;
    try {
      db = await this.open();
      return await new Promise((resolve, reject) => {
        const request = db.transaction(this.STORE_NAME, 'readonly')
          .objectStore(this.STORE_NAME).get(String(id));
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch (_) {
      return null;
    } finally {
      if (db) db.close();
    }
  },
  async putDoc(input) {
    const source = input && typeof input === 'object' ? input : {};
    const clean = value => String(value == null ? '' : value)
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const record = {
      id: clean(source.id).slice(0, 500),
      title: clean(source.title || '未命名文档').slice(0, 180),
      source: clean(source.source || '本地文件').slice(0, 600),
      text: clean(source.text).slice(0, 120000),
      updatedAt: Date.now()
    };
    if (!record.id || !record.text) throw new Error('文档没有可检索文字');
    await this.withStore('readwrite', store => store.put(record));
    const rows = await this.listDocs();
    if (rows.length > 30) {
      await Promise.all(rows.slice(30).map(item =>
        this.withStore('readwrite', store => store.delete(item.id)).catch(() => false)
      ));
    }
    return record;
  },
  async removeDoc(id) {
    if (!id) return false;
    try {
      await this.withStore('readwrite', store => store.delete(String(id)));
      return true;
    } catch (_) {
      return false;
    }
  }
};

const SiteAI = {
  enabled: !!window.__tzSiteEmbedMode,
  current: { url: '', title: '', summary: '', navigation: [] },
  indexPromise: null,
  indexGeneratedAt: '',
  screenshotPending: new Map(),
  cleanText(value, max = 1200) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  },
  siteUrl(value, base) {
    try {
      const parsed = new URL(String(value || ''), base ? new URL(base, location.origin) : location.href);
      if (parsed.origin !== location.origin || !/^https?:$/.test(parsed.protocol)) return '';
      return parsed.pathname + parsed.search + parsed.hash;
    } catch (_) {
      return '';
    }
  },
  normalizeNavigation(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const seen = new Set();
    return list.slice(0, 40).map(item => {
      const source = typeof item === 'string' ? { url: item, title: item } : (item || {});
      return {
        url: this.siteUrl(source.url || source.href),
        title: this.cleanText(source.title || source.label || source.name, 100),
        description: this.cleanText(source.description || source.summary, 180)
      };
    }).filter(item => item.url && item.title && !seen.has(item.url) && seen.add(item.url)).slice(0, 16);
  },
  setContext(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    this.current = {
      url: this.siteUrl(source.url),
      title: this.cleanText(source.title, 160),
      summary: this.cleanText(source.summary || source.text, 4200),
      navigation: this.normalizeNavigation(source.navigation || source.nav || source.links)
    };
    if (typeof chatSess !== 'undefined' && chatSess && chatSess.siteMode) refreshContextEstimate(chatSess);
  },
  start() {
    if (!this.enabled) return;
    window.addEventListener('message', event => {
      if (event.source !== window.parent || event.origin !== location.origin) return;
      const data = event.data;
      if (!data) return;
      if (data.type === SITE_AI_CONTEXT_MESSAGE) {
        this.setContext(data.context || data.payload || {});
        return;
      }
      if (data.type === SITE_AI_SCREENSHOT_RESULT) {
        const pending = this.screenshotPending.get(String(data.requestId || ''));
        if (!pending) return;
        const dataUrl = String(data.dataUrl || '');
        const safe = /^data:image\/(?:png|jpeg|webp);base64,/i.test(dataUrl) && dataUrl.length <= 8 * 1024 * 1024
          ? dataUrl
          : '';
        pending.finish(safe);
      }
    });
    document.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target.closest('a.md-link[data-site-url]') : null;
      if (!target) return;
      const url = this.siteUrl(target.dataset.siteUrl, this.current.url || '/');
      if (!url || !window.parent || window.parent === window) return;
      event.preventDefault();
      window.parent.postMessage({ type: SITE_AI_OPEN_URL, url }, location.origin);
    });
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: SITE_AI_READY_MESSAGE, version: 1 }, location.origin);
    }
  },
  requestScreenshot() {
    if (!this.enabled || !window.parent || window.parent === window) return Promise.resolve('');
    const requestId = (window.crypto && typeof window.crypto.randomUUID === 'function')
      ? window.crypto.randomUUID()
      : 'site-shot-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    return new Promise(resolve => {
      let timer = null;
      const finish = dataUrl => {
        clearTimeout(timer);
        this.screenshotPending.delete(requestId);
        resolve(dataUrl || '');
      };
      timer = setTimeout(() => finish(''), 8000);
      this.screenshotPending.set(requestId, { finish });
      window.parent.postMessage({ type: SITE_AI_SCREENSHOT_REQUEST, requestId }, location.origin);
    });
  },
  async loadIndex() {
    if (!this.indexPromise) {
      this.indexPromise = fetch('/assets/data/site-ai-index.json', {
        credentials: 'same-origin',
        cache: 'no-cache'
      }).then(response => {
        if (!response.ok) throw new Error('站点索引加载失败：' + response.status);
        return response.json();
      }).then(data => {
        this.indexGeneratedAt = this.cleanText(data && data.generatedAt, 80);
        const entries = Array.isArray(data) ? data : (Array.isArray(data && data.entries) ? data.entries : []);
        return entries.slice(0, 1200).map(item => ({
          url: this.siteUrl(item && item.url),
          title: this.cleanText(item && item.title, 160),
          description: this.cleanText(item && item.description, 500),
          headings: Array.isArray(item && item.headings)
            ? item.headings.map(value => this.cleanText(value, 120)).filter(Boolean).slice(0, 24)
            : [],
          text: this.cleanText(item && item.text, 20000),
          updatedAt: this.cleanText(item && item.updatedAt, 80),
          sourceType: 'site',
          sourceLabel: '站内页面'
        })).filter(item => item.url && item.title);
      }).catch(error => {
        console.warn('[SiteAI index]', error);
        return [];
      });
    }
    return this.indexPromise;
  },
  queryTerms(query) {
    const text = this.cleanText(query, 600).toLowerCase();
    const terms = [];
    const add = value => {
      const term = String(value || '').trim();
      if (term.length < 2 || terms.includes(term)) return;
      terms.push(term);
    };
    (text.match(/[a-z0-9][a-z0-9._+-]{1,}/g) || []).forEach(add);
    (text.match(/[\u3400-\u9fff]{2,}/g) || []).forEach(segment => {
      if (segment.length <= 10) add(segment);
      for (let i = 0; i < segment.length - 1 && terms.length < 28; i++) add(segment.slice(i, i + 2));
      for (let i = 0; i < segment.length - 2 && terms.length < 28; i += 2) add(segment.slice(i, i + 3));
    });
    return terms.slice(0, 28);
  },
  searchCompact(value) {
    return this.cleanText(value, 1200).toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, '');
  },
  charGrams(value) {
    const text = this.searchCompact(value);
    if (text.length < 2) return text ? [text] : [];
    const grams = [];
    for (let i = 0; i < text.length - 1 && grams.length < 120; i++) grams.push(text.slice(i, i + 2));
    return [...new Set(grams)];
  },
  fuzzyScore(entry, rawQuery) {
    const queryGrams = this.charGrams(rawQuery);
    if (!queryGrams.length) return 0;
    const candidateGrams = new Set(this.charGrams([
      entry.title, entry.description, ...(Array.isArray(entry.headings) ? entry.headings : [])
    ].join(' ')));
    if (!candidateGrams.size) return 0;
    const matched = queryGrams.filter(gram => candidateGrams.has(gram)).length;
    return (2 * matched / (queryGrams.length + candidateGrams.size)) * 12;
  },
  scoreEntry(entry, terms, rawQuery) {
    const title = String(entry.title || '').toLowerCase();
    const description = String(entry.description || '').toLowerCase();
    const headings = (Array.isArray(entry.headings) ? entry.headings : []).join(' ').toLowerCase();
    const text = String(entry.text || '').toLowerCase();
    const url = String(entry.url || '').toLowerCase();
    const exact = this.cleanText(rawQuery, 160).toLowerCase();
    let score = exact.length >= 3 && (title.includes(exact) || headings.includes(exact)) ? 30 : 0;
    terms.forEach(term => {
      if (title.includes(term)) score += 9;
      if (url.includes(term)) score += 5;
      if (headings.includes(term)) score += 5;
      if (description.includes(term)) score += 3;
      if (text.includes(term)) score += 1;
    });
    score += this.fuzzyScore(entry, rawQuery);
    const updated = new Date(entry.updatedAt || 0).getTime();
    if (score > 0 && updated > 0) {
      const ageDays = Math.max(0, (Date.now() - updated) / 86400000);
      score += Math.max(0, 2 - Math.min(2, ageDays / 365));
    }
    if (this.current.url && entry.url === this.current.url) score += 4;
    return score;
  },
  entryExcerpt(entry, terms) {
    const text = entry.text || entry.description;
    if (!text) return '';
    const lower = text.toLowerCase();
    const offsets = terms.map(term => lower.indexOf(term)).filter(index => index >= 0);
    const center = offsets.length ? Math.min(...offsets) : 0;
    const start = Math.max(0, center - 240);
    const excerpt = text.slice(start, start + 1300).trim();
    return (start ? '…' : '') + excerpt + (start + 1300 < text.length ? '…' : '');
  },
  formatSourceTime(value) {
    if (!value) return '未知';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return this.cleanText(value, 80) || '未知';
    return date.toLocaleString('zh-CN', { hour12: false });
  },
  rankEntries(entries, query, limit = 5) {
    const terms = this.queryTerms(query);
    return (Array.isArray(entries) ? entries : []).map(entry => ({
      entry,
      score: this.scoreEntry(entry, terms, query)
    })).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || String(a.entry.title).localeCompare(String(b.entry.title), 'zh-CN'))
      .slice(0, limit);
  },
  messageText(content) {
    if (typeof content === 'string') return this.cleanText(content, 20000);
    if (!Array.isArray(content)) return '';
    return this.cleanText(content.map(part => part && typeof part.text === 'string' ? part.text : '').join(' '), 20000);
  },
  async loadLocalEntries(excludeChatId = '', requestedSources = ['document', 'note', 'chat']) {
    const entries = [];
    const wanted = new Set(requestedSources || []);
    const [documents, notes] = await Promise.all([
      wanted.has('document') ? KnowledgeStore.listDocs() : Promise.resolve([]),
      wanted.has('note') && typeof notesLoad === 'function' ? notesLoad() : Promise.resolve([])
    ]);
    documents.forEach(doc => {
      entries.push({
        id: doc.id,
        url: '',
        title: this.cleanText(doc.title || '未命名文档', 160),
        description: this.cleanText(doc.source || '本地文件', 500),
        headings: [],
        text: this.cleanText(doc.text, 120000),
        updatedAt: doc.updatedAt || '',
        sourceType: 'document',
        sourceLabel: '本地文档'
      });
    });
    (Array.isArray(notes) ? notes : []).forEach(note => {
      const no = Number(note.no) > 0 ? ' #' + note.no : '';
      entries.push({
        id: note.id,
        url: '',
        title: this.cleanText(note.title || ('笔记' + no), 160),
        description: '天择OS 笔记' + no,
        headings: [],
        text: this.cleanText(note.content, 120000),
        updatedAt: note.updated || note.updatedAt || '',
        sourceType: 'note',
        sourceLabel: '本地笔记'
      });
    });
    const chats = wanted.has('chat') && typeof Store !== 'undefined' && typeof Store.getChats === 'function' ? Store.getChats() : [];
    chats.filter(chat => chat && chat.id !== excludeChatId)
      .sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))
      .forEach(chat => {
        const text = (Array.isArray(chat.messages) ? chat.messages : []).slice(-100)
          .map(message => this.messageText(message && message.content))
          .filter(Boolean).join('\n');
        if (!text) return;
        entries.push({
          id: chat.id,
          url: '',
          title: this.cleanText(chat.title || '历史对话', 160),
          description: chat.archivedAt ? '天择 AI 已归档历史会话' : '天择 AI 历史会话',
          headings: [],
          text: this.cleanText(text, 120000),
          updatedAt: chat.updatedAt || chat.createdAt || '',
          sourceType: 'chat',
          sourceLabel: '历史对话'
        });
      });
    return entries;
  },
  formatRetrievedEntry(entry, terms) {
    const source = entry.sourceLabel || '资料';
    const timeLabel = entry.sourceType === 'site' ? '内容时间' : '更新时间';
    const title = entry.url ? '[' + entry.title + '](' + entry.url + ')' : entry.title;
    const lines = ['- ' + title + ' | 来源：' + source + ' | ' + timeLabel + '：' + this.formatSourceTime(entry.updatedAt)];
    if (entry.description) lines.push('  简介：' + entry.description);
    if (Array.isArray(entry.headings) && entry.headings.length) lines.push('  小节：' + entry.headings.slice(0, 10).join('；'));
    const excerpt = this.entryExcerpt(entry, terms);
    if (excerpt) lines.push('  命中摘录：' + excerpt);
    return lines.join('\n');
  },
  formatFullEntry(entry) {
    const source = entry.sourceLabel || '资料';
    const timeLabel = entry.sourceType === 'site' ? '内容时间' : '更新时间';
    const title = entry.url ? '[' + entry.title + '](' + entry.url + ')' : entry.title;
    const lines = ['- ' + title + ' | 来源：' + source + ' | ' + timeLabel + '：' + this.formatSourceTime(entry.updatedAt)];
    if (entry.description) lines.push('  简介：' + entry.description);
    if (Array.isArray(entry.headings) && entry.headings.length) lines.push('  小节：' + entry.headings.join('；'));
    if (entry.text) lines.push('  正文：' + entry.text);
    return lines.join('\n');
  },
  knowledgeBudgetChars() {
    const caps = typeof effectiveAICaps === 'function' ? effectiveAICaps() : {};
    const contextTokens = Math.max(0, parseInt(caps && caps.contextLength, 10) || 0);
    // 中文通常接近 1 字/token。最多使用约 55% 上下文给知识库，为系统提示、历史和回答留空间。
    return contextTokens
      ? Math.max(12000, Math.min(120000, Math.floor(contextTokens * 0.55)))
      : 48000;
  },
  async allKnowledgeEntries(excludeChatId = '') {
    const [siteEntries, localEntries] = await Promise.all([
      this.loadIndex(),
      this.loadLocalEntries(excludeChatId)
    ]);
    return [...siteEntries, ...localEntries];
  },
  async knowledgePromptFor(query, excludeChatId = '') {
    const modes = Store.getKnowledgeModes();
    const terms = this.queryTerms(query);
    const sources = [
      { key: 'site', label: '站内页面', limit: 5 },
      { key: 'document', label: '本地文档', limit: 4 },
      { key: 'note', label: '本地笔记', limit: 4 },
      { key: 'chat', label: '历史会话', limit: 4 }
    ];
    const enabled = sources.filter(source => (modes[source.key] || 'auto') !== 'off');
    if (!enabled.length) return '';
    const needSite = enabled.some(source => source.key === 'site');
    const localKeys = enabled.map(source => source.key).filter(key => key !== 'site');
    // 开关先于 I/O：关闭的来源不再读 IndexedDB、笔记或对话全文。
    const [siteEntries, localEntries] = await Promise.all([
      needSite ? this.loadIndex() : Promise.resolve([]),
      localKeys.length ? this.loadLocalEntries(excludeChatId, localKeys) : Promise.resolve([])
    ]);
    const entries = [...siteEntries, ...localEntries];
    const sections = [];
    const modeLabel = { auto: '自动匹配', full: '完整注入（全量优先）' };
    const budget = this.knowledgeBudgetChars();
    const header = '【AI 知识库】\n检索在本机完成；自动匹配只发送命中摘录，完整注入会按更新时间填充当前上下文预算。';
    let remaining = Math.max(0, budget - header.length - 2);
    let truncated = false;
    enabled.forEach(source => {
      const mode = modes[source.key] || 'auto';
      const pool = entries.filter(entry => entry.sourceType === source.key);
      if (!pool.length) return;
      let selected;
      if (mode === 'full') {
        selected = pool.slice().sort((a, b) => (new Date(b.updatedAt || 0).getTime() || 0) - (new Date(a.updatedAt || 0).getTime() || 0));
      } else {
        selected = this.rankEntries(pool, query, source.limit).map(item => item.entry);
      }
      if (!selected.length) return;
      const rendered = [];
      for (const entry of selected) {
        if (remaining <= 180) { truncated = true; break; }
        const text = mode === 'full' ? this.formatFullEntry(entry) : this.formatRetrievedEntry(entry, terms);
        if (text.length > remaining - 120) {
          rendered.push(text.slice(0, Math.max(0, remaining - 150)) + '\n  …（本条资料已按上下文预算截断）');
          remaining = 0;
          truncated = true;
          break;
        }
        rendered.push(text);
        remaining -= text.length + 1;
      }
      if (!rendered.length) return;
      const sectionHead = '【' + source.label + ' · ' + modeLabel[mode] + ' · ' + rendered.length + '/' + pool.length + '】\n';
      remaining = Math.max(0, remaining - sectionHead.length - 2);
      sections.push(sectionHead + rendered.join('\n'));
    });
    if (!sections.length) return '';
    return header + '\n\n' + sections.join('\n\n') +
      (truncated ? '\n\n【知识库截断提示】内容超过当前模型上下文预算，已按来源与时间有序截断。' : '');
  },
  async localPromptFor(query, excludeChatId = '') {
    return this.knowledgePromptFor(query, excludeChatId);
  },
  currentPrompt() {
    if (!this.enabled) return '';
    const page = this.current;
    const lines = [];
    if (page.title || page.url || page.summary) {
      lines.push('【当前页面】');
      if (page.title) lines.push('标题：' + page.title);
      if (page.url) lines.push('URL：' + page.url);
      if (page.summary) lines.push('正文摘要：' + page.summary);
    }
    if (page.navigation.length) {
      lines.push('【当前页面候选导航】');
      page.navigation.forEach(item => {
        lines.push('- ' + item.title + ' | ' + item.url + (item.description ? ' | ' + item.description : ''));
      });
    }
    return lines.join('\n');
  },
  async promptFor(query, excludeChatId = '') {
    if (!this.enabled) return '';
    const modes = Store.getKnowledgeModes();
    const current = modes.site === 'off' ? '' : this.currentPrompt();
    const knowledge = await this.knowledgePromptFor(query, excludeChatId);
    return [
      current,
      knowledge
    ].filter(Boolean).join('\n\n');
  }
};
SiteAI.start();

/* ===================== 工具函数 ===================== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
function bindButtonLike(node, activate, label = '') {
  node.setAttribute('role', 'button');
  node.tabIndex = 0;
  if (label) node.setAttribute('aria-label', label);
  node.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) activate(event);
  });
  return node;
}
function bindSwitch(node, getValue, setValue, label = '') {
  const sync = () => {
    const checked = !!getValue();
    node.classList.toggle('on', checked);
    node.setAttribute('aria-checked', String(checked));
  };
  const activate = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const result = setValue(!getValue());
    if (result && typeof result.finally === 'function') result.finally(sync);
    else sync();
  };
  node.setAttribute('role', 'switch');
  node.tabIndex = 0;
  if (label) node.setAttribute('aria-label', label);
  node.addEventListener('click', activate);
  node.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!event.repeat) activate(event);
  });
  sync();
  return { sync };
}
function focusSafely(node) {
  const applyFocus = () => {
    if (!node || !node.isConnected || typeof node.focus !== 'function') return;
    try { node.focus({ preventScroll: true }); } catch { node.focus(); }
  };
  applyFocus();
  requestAnimationFrame(applyFocus);
}
function motionDelay(ms) {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms;
}
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function isVisibleFocusable(node) {
  return !!(node && node.isConnected && !node.disabled && node.getClientRects().length);
}
const fmtTime = (d) => d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
const fmtDate = (d) => `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
const fmtDateTime = (d) => `${fmtDate(d)} ${fmtTime(d)}`;
const ago = (t) => { const s = (Date.now() - t) / 1000; if (s < 60) return '刚刚'; if (s < 3600) return Math.floor(s/60)+'分钟前'; if (s < 86400) return Math.floor(s/3600)+'小时前'; return Math.floor(s/86400)+'天前'; };
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ===================== 4.0 统一图片图标系统 =====================
 * icon-atlas.png 是 AI 生成的 8×8 透明位图图集。应用数据继续保留旧 icon 字段，
 * 以兼容既有 installedApps / 命令行协议；所有系统 UI 统一转成 iconKey 后渲染。
 * 未识别的用户图标回退到 crystal，绝不把原 emoji 直接塞回 UI chrome。 */
const UI_ICON_GRID = {
  home:[0,0], newspaper:[1,0], pen:[2,0], unlock:[3,0], ai:[4,0], shield:[5,0], gamepad:[6,0], book:[7,0],
  monitor:[0,1], user:[1,1], palette:[2,1], menu:[3,1], key:[4,1], chat:[5,1], cart:[6,1], trophy:[7,1],
  settings:[0,2], info:[1,2], folder:[2,2], globe:[3,2], bulb:[4,2], tree:[5,2], terminal:[6,2], clock:[7,2],
  document:[0,3], notes:[1,3], calendar:[2,3], burst:[3,3], swords:[4,3], windows:[5,3], laptop:[6,3], android:[7,3],
  search:[0,4], close:[1,4], power:[2,4], network:[3,4], volume:[4,4], battery:[5,4], moon:[6,4], pin:[7,4],
  refresh:[0,5], left:[1,5], right:[2,5], download:[3,5], upload:[4,5], camera:[5,5], paperclip:[6,5], stop:[7,5],
  play:[0,6], pause:[1,6], trash:[2,6], save:[3,6], edit:[4,6], copy:[5,6], check:[6,6], warning:[7,6],
  rocket:[0,7], star:[1,7], heart:[2,7], lightning:[3,7], sparkle:[4,7], file:[5,7], cursor:[6,7], crystal:[7,7]
};
const LEGACY_UI_ICON_KEYS = {
  '🏠':'home', '🌐':'globe', '📰':'newspaper', '📑':'newspaper', '✍':'pen', '✍️':'pen', '🔓':'unlock',
  '🤖':'ai', '🧠':'ai', '🛡':'shield', '🛡️':'shield', '🎮':'gamepad', '📚':'book', '📖':'book',
  '🖥':'monitor', '🖥️':'monitor', '👤':'user', '🧑':'user', '🎨':'palette', '☰':'menu',
  '🔑':'key', '💬':'chat', '📬':'chat', '🛒':'cart', '🏆':'trophy', '⚙':'settings', '⚙️':'settings',
  '🔧':'settings', 'ℹ':'info', 'ℹ️':'info', '📁':'folder', '📂':'folder', '💡':'bulb', '🌳':'tree',
  '⌨':'terminal', '⌨️':'terminal', '🕐':'clock', '⏱':'clock', '⏳':'clock', '📄':'document',
  '📝':'notes', '📅':'calendar', '💥':'burst', '⚔':'swords', '⚔️':'swords', '🪟':'windows',
  '💻':'laptop', '🔍':'search', '✕':'close', '×':'close', '⏻':'power', '📶':'network', '📵':'network',
  '🔊':'volume', '🔉':'volume', '🔇':'volume', '🔋':'battery', '🪫':'battery', '🌙':'moon', '☀':'moon',
  '☀️':'moon', '🌓':'moon', '📌':'pin', '📍':'pin', '🔄':'refresh', '⟳':'refresh', '↩':'left',
  '←':'left', '→':'right', '↗':'right', '📥':'download', '⬇':'download', '📤':'upload', '⬆':'upload',
  '📷':'camera', '📎':'paperclip', '⏹':'stop', '▶':'play', '➤':'play', '⏸':'pause', '🗑':'trash',
  '💾':'save', '✏':'edit', '✏️':'edit', '📋':'copy', '✓':'check', '✅':'check', '⚠':'warning',
  '⚠️':'warning', '🚀':'rocket', '★':'star', '☆':'star', '❤':'heart', '❤️':'heart', '⚡':'lightning',
  '✨':'sparkle', '📦':'file', '🖱':'cursor', '🖱️':'cursor', '💠':'crystal', '🧩':'crystal',
  '🫘':'ai', '💰':'star', '🔢':'info', '📏':'info', '👁':'monitor', '👁️':'monitor', '📊':'newspaper',
  '□':'monitor', '⧉':'windows', '🗕':'download'
};
function normalizeUiIconKey(value, fallback = 'crystal') {
  if (value && typeof value === 'object') value = value.iconKey || value.icon;
  const raw = String(value || '').trim();
  if (UI_ICON_GRID[raw]) return raw;
  if (LEGACY_UI_ICON_KEYS[raw]) return LEGACY_UI_ICON_KEYS[raw];
  const compact = raw.replace(/\uFE0F/g, '');
  if (LEGACY_UI_ICON_KEYS[compact]) return LEGACY_UI_ICON_KEYS[compact];
  return UI_ICON_GRID[fallback] ? fallback : 'crystal';
}
function uiIconHTML(value, label = '', extraClass = '') {
  const key = normalizeUiIconKey(value);
  const pos = UI_ICON_GRID[key] || UI_ICON_GRID.crystal;
  const x = (pos[0] * 100 / 7).toFixed(6);
  const y = (pos[1] * 100 / 7).toFixed(6);
  const aria = label ? ` role="img" aria-label="${escapeHtml(label)}"` : ' aria-hidden="true"';
  return `<span class="tz-icon${extraClass ? ' ' + extraClass : ''}" data-icon="${key}" style="--tz-ix:${pos[0]};--tz-iy:${pos[1]};--tz-x:${x}%;--tz-y:${y}%"${aria}></span>`;
}
function appIconKey(app) { return normalizeUiIconKey(app && (app.iconKey || app.icon)); }
function appIconHTML(app, label = '') { return uiIconHTML(appIconKey(app), label || (app && app.name) || '应用'); }
const UI_ICON_TOKENS = Object.keys(LEGACY_UI_ICON_KEYS).sort((a, b) => b.length - a.length);
function uiStatusHTML(value) {
  const raw = String(value == null ? '' : value);
  const leading = raw.match(/^\s*/)[0];
  const text = raw.slice(leading.length);
  const token = UI_ICON_TOKENS.find(item => text.startsWith(item));
  if (!token) return escapeHtml(raw);
  const rest = text.slice(token.length).replace(/^\s+/, '');
  return `<span class="tz-icon-label">${uiIconHTML(LEGACY_UI_ICON_KEYS[token])}<span>${escapeHtml(rest)}</span></span>`;
}
function setUiIcon(node, key, suffix = '') {
  if (!node) return;
  node.innerHTML = uiIconHTML(key) + (suffix ? `<span class="tz-icon-suffix">${escapeHtml(suffix)}</span>` : '');
}
// 响应式布局以可用空间为主，指针类型为辅：支持横屏手机、单触点设备和桌面窄窗口。
const isMobile = () => {
  const forced = Store.get('deviceLayout', 'auto');
  if (forced === 'mobile') return true;
  if (forced === 'desktop') return false;
  const shortSide = Math.min(window.innerWidth, window.innerHeight);
  const narrow = window.innerWidth < 768;
  const coarse = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0;
  return narrow || (coarse && shortSide < 820);
};

// 可用桌面区域（排除天择OS任务栏/Dock）：窗口最大化时限制在此区域内，底部紧贴任务栏上方
function getWorkArea() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const isMac = !isMobile() && Store.getStyle() === 'mac';
  // Windows 风格：底部全宽任务栏 52px；macOS 风格：Dock 52px + 悬浮边距
  const reservedBottom = isMac ? 74 : 74;
  return { left: 0, top: 0, width: vw, height: Math.max(200, vh - reservedBottom) };
}

/* ===================== 设备检测 / 风格应用 ===================== */
function applyDeviceStyle() {
  const mobile = isMobile();
  document.body.classList.toggle('mobile', mobile);
  const auto = Store.getStyle();
  let style = auto || (mobile ? 'ios' : 'win');
  if (mobile) {
    $('#taskbar').hidden = true;
    $('#mobileDock').hidden = false;
    $('#homeBar').hidden = false;
    $('#desktopIcons').hidden = false;
    $('#homeScreen').hidden = false;
  } else {
    $('#mobileDock').hidden = true;
    $('#homeBar').hidden = true;
    $('#desktopIcons').hidden = false;
    $('#homeScreen').hidden = true;
    const isMac = style === 'mac';
    $('#desktop').classList.toggle('mac-style', isMac);
    // Mac 风格：底部 taskbar 通过 CSS 变身为居中 Dock（顶部无 macBar）
    $('#taskbar').hidden = false;
  }
  applyStyleToWindows();
}

// 切换风格时同步更新所有已打开窗口的控件样式
function applyStyleToWindows() {
  const isMac = !isMobile() && Store.getStyle() === 'mac';
  $$('.win').forEach(w => w.classList.toggle('mac-style', isMac));
}

/* ===================== 应用注册表 ===================== */
const BUILTIN_APPS = {
  'ai-config': {
    name: 'AI 配置', icon: '🔑', iconKey: 'key', grad: true, category: 'system',
    desc: '配置 AI 接口（URL、Key、模型）',
    render: () => renderAIConfig()
  },
  'ai-chat': {
    name: 'AI 对话', icon: '💬', iconKey: 'chat', grad: true, category: 'ai',
    desc: '与 AI 助手对话（单一工作区）',
    render: (opts) => renderAIChat(opts)
  },
  'knowledge-manager': {
    name: '知识库管理', icon: '🗂️', iconKey: 'folder', grad: true, category: 'ai',
    desc: '查看与管理 AI 可使用的站内页面、文档、笔记和历史会话',
    render: () => renderKnowledgeManager()
  },
  'ai-usage': {
    name: 'Token 用量与计费', icon: '📊', iconKey: 'info', grad: true, category: 'ai',
    desc: '统计全部 AI API 请求的 Token 与估算费用',
    render: () => renderAIUsage()
  },
  'agent-center': {
    name: 'Agent 与命令中心', icon: '🤖', iconKey: 'terminal', grad: true, category: 'ai',
    desc: '查看子智能体、命令执行、循环熔断与命令手册',
    render: () => renderAgentCenter()
  },
  'app-store': {
    name: '软件商城', icon: '🛒', iconKey: 'cart', grad: true, category: 'system',
    desc: '用自然语言生成新软件',
    render: () => renderAppStore(),
    singleton: true
  },
  'growth': {
    name: '等级、VIP 与外观', icon: '🏆', iconKey: 'trophy', grad: true, category: 'system',
    desc: '用户等级、积分、VIP 月卡与完整界面皮肤',
    render: () => renderGrowth()
  },
  'settings': {
    name: '系统设置', icon: '⚙️', iconKey: 'settings', grad: false, category: 'system',
    desc: '桌面风格、存储管理',
    render: () => renderSettings()
  },
  'about': {
    name: '关于天择OS', icon: 'ℹ️', iconKey: 'info', grad: false, category: 'system',
    desc: '系统信息',
    render: () => renderAbout()
  },
  'file-manager': {
    name: '我的软件', icon: '📁', iconKey: 'folder', grad: false, category: 'system',
    desc: '管理已安装的软件',
    render: () => renderFileManager()
  },
  'browser': {
    name: '浏览器', icon: '🌐', iconKey: 'globe', grad: true, category: 'system',
    desc: '浏览网页',
    render: () => renderBrowser()
  },
  'tips': {
    name: '玩机技巧', icon: '💡', iconKey: 'bulb', grad: true, category: 'system',
    desc: '系统使用技巧与隐藏功能',
    render: () => renderTips()
  },
  'tz-tree': {
    name: '天择导航', icon: '🌳', iconKey: 'tree', grad: true, category: 'tznet',
    desc: '天择网专区树状导航',
    render: () => renderTzTree()
  },
  'terminal': {
    name: '命令行', icon: '⌨️', iconKey: 'terminal', grad: true, category: 'system',
    desc: '用命令操作天择OS（也供 AI Agent 调用）',
    render: () => renderTerminal()
  },
  'clock': {
    name: '时钟', icon: '🕐', iconKey: 'clock', grad: true, category: 'system',
    desc: '时钟 / 秒表 / 倒计时',
    render: () => renderClockApp()
  },
  'doc-reader': {
    name: '文档阅读器', icon: '📄', iconKey: 'document', grad: true, category: 'system',
    desc: '阅读 docx / pptx / xlsx / pdf / html',
    render: () => renderDocReader()
  },
  'notes': {
    name: '笔记', icon: '📝', iconKey: 'notes', grad: true, category: 'tool',
    desc: 'Markdown / LaTeX 笔记（可被命令行 note 操控）',
    render: () => renderNotes()
  }
};

// 天择网预装应用：iframe 加载天择网页面
const TZNET_BASE = (() => {
  // 桌面版（Electron，window.tzDesktop 由 preload 注入）：preset 应用加载线上天择网，
  //   因为桌面安装包只打包 os/ 本身，不含整个站点；线上内容也始终保持最新。
  // 网页版：dev 用相对路径 ../（本地预览），normal 部署后 ../ 相对 os/index.html 解析为域名根，均正确。
  if (typeof window !== 'undefined' && window.tzDesktop) return 'https://wjtianze.github.io/';
  return '../';
})();

const PRESET_APPS = [
  // 天择网系列（精简为 天择网主页 + 天择导航；其余板块通过天择导航树或天择网主页访问）
  { id: 'tz-home', name: '天择网', icon: '🌐', iconKey: 'globe', grad: true, category: 'tznet', url: TZNET_BASE + 'index.html', desc: '天择网主页' },
  // 实用工具：本地页面（与 OS 同源，相对路径加载，不实时连接天择网）——
  // 浏览器 localStorage 与 IndexedDB 同源共享，存档直接读写：
  //   · COC 专区首页（含村庄存档分析）读写 localStorage["tz_coc_village"]
  //   · 背单词读写 IndexedDB tzwords 词库
  { id: 'tz-coc', name: 'COC 专区', icon: '🛡️', iconKey: 'shield', grad: false, category: 'tool', url: '../coc/index.html', desc: '部落冲突数据、村庄存档分析' },
  { id: 'tz-coc-planner', name: '升级规划', icon: '📅', iconKey: 'calendar', grad: false, category: 'tool', url: '../coc/planner/index.html', desc: '升级规划器' },
  { id: 'tz-coc-dmg', name: '伤害计算', icon: '💥', iconKey: 'burst', grad: false, category: 'tool', url: '../coc/dmg-calc/index.html', desc: '法术伤害计算器' },
  { id: 'tz-words', name: '背单词', icon: '📚', iconKey: 'book', grad: true, category: 'tool', url: '../english/words/index.html', desc: '四阶段背单词' },
  // 游戏
  { id: 'tz-gpa', name: '绩点战争', icon: '⚔️', iconKey: 'swords', grad: true, category: 'game', url: TZNET_BASE + 'game/gpa-card/index.html', nochrome: true, desc: '卡牌对战游戏' },
  // 系统模拟器（现代系统的网页高仿真版，均可被 iframe 嵌入；均为界面级模拟，非真实虚拟机）
  { id: 'emu-win', name: 'Windows 11 模拟器', icon: '🪟', iconKey: 'windows', grad: true, category: 'emu', url: 'https://win11.blueedge.me/', desc: '浏览器内的 Windows 11 高仿真版（开源 Win11React）' },
  { id: 'emu-win10', name: 'Windows 10 模拟器', icon: '💻', iconKey: 'laptop', grad: false, category: 'emu', url: 'https://dustinbrett.com/', desc: '浏览器内的 Win10 风格功能桌面（daedalOS）' },
  { id: 'emu-android', name: '安卓模拟器', icon: '🤖', iconKey: 'android', grad: true, category: 'emu', url: 'https://mobilegym.dev/', desc: '浏览器内的现代安卓仿真环境（MobileGym，中科院开源，28 个应用）' }
];

function getAllApps() {
  const installed = Store.getApps().map(a => ({ ...a, iconKey: normalizeUiIconKey(a.iconKey || a.icon), type: 'installed', category: a.category || 'installed' }));
  return [...Object.entries(BUILTIN_APPS).map(([id, app]) => ({ id, ...app, type: 'builtin' })),
          ...PRESET_APPS.map(a => ({ ...a, type: 'preset' })),
          ...installed];
}
function findApp(id) { return getAllApps().find(a => a.id === id); }
function presetFrameUrl(app) {
  const hideSiteChrome = app.id !== 'tz-home'
    && (app.nochrome === true || app.category === 'tznet' || app.category === 'tool');
  return hideSiteChrome ? app.url + (app.url.includes('?') ? '&' : '?') + 'nochrome=1' : app.url;
}

/* ---- 已安装软件引导注入（v3.1.1）----
 * 修复"软件命令包不管用"的三个根因：
 *  1) 应用 id 安装时才生成（app-<时间戳>），AI 写代码时不可能知道
 *     → 注入 window.TZOS_APP_ID 与 TZOS_CMD.register（无需自己填 id）
 *  2) 旧教程让 AI 写死错误 id 注册，cmd list 永远查不到
 *     → shim localStorage.setItem：任何 tz_app_cmds_* 键统一改写到正确键
 *  3) 旧设计中命令 js 在 OS 父页面执行，够不到软件内部函数
 *     → 注入执行桥：父页面 postMessage 过来，js 在软件自己的 iframe 里执行 */
function injectAppBootstrap(html, app) {
  const meta = { id: app.id, name: app.name || '' };
  // srcdoc 应用保持 opaque origin，不能直接访问父页面 localStorage。为应用注入同步
  // Storage 兼容层：当前 iframe 内存中同步读写，父页面按 appId 隔离后持久化。
  const appStorageKey = 'tz_app_storage_' + app.id;
  let appStorageSnapshot = {};
  try {
    const saved = JSON.parse(localStorage.getItem(appStorageKey) || '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) appStorageSnapshot = saved;
  } catch (e) {}
  const boot = '<script>(function(){' +
    'var APP_ID=' + JSON.stringify(app.id) + ';' +
    'window.TZOS_APP_ID=APP_ID;' +
    'var REAL_KEY="tz_app_cmds_"+APP_ID;' +
    'var STORAGE_DATA=' + JSON.stringify(appStorageSnapshot) + ';' +
    'var STORAGE_KEYS=function(){return Object.keys(STORAGE_DATA);};' +
    'var _persist=function(op,key,value){try{window.parent.postMessage({__tzStorageWrite:{appId:APP_ID,op:op,key:key,value:value}},"*");}catch(e){}};' +
    'var _storage={' +
      'getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(STORAGE_DATA,k)?STORAGE_DATA[k]:null;},' +
      'setItem:function(k,v){k=String(k);v=String(v);STORAGE_DATA[k]=v;_persist("set",k,v);},' +
      'removeItem:function(k){k=String(k);delete STORAGE_DATA[k];_persist("remove",k,"");},' +
      'clear:function(){STORAGE_DATA={};_persist("clear","","");},' +
      'key:function(i){var keys=STORAGE_KEYS();i=Number(i)||0;return i>=0&&i<keys.length?keys[i]:null;}' +
    '};' +
    'try{Object.defineProperty(_storage,"length",{get:function(){return STORAGE_KEYS().length;}});}catch(e){}' +
    'window.TZOS_STORAGE=_storage;' +
    'try{Object.defineProperty(window,"localStorage",{configurable:true,get:function(){return _storage;}});}catch(e){}' +
    'var _set=_storage.setItem.bind(_storage);' +
    'var _sysSeq=0,_sysPending={};' +
    'window.TZOS_CMD={' +
      'appId:APP_ID,' +
      'register:function(list){if(!Array.isArray(list))return;_set(REAL_KEY,JSON.stringify(list));try{window.parent.postMessage({__tzCmdRegister:{appId:APP_ID,list:list}},"*");}catch(e){}},' +
      // v3.5：软件内调用系统命令行并拿回输出（返回 Promise<string>），如 TZOS_CMD.exec("note list")
      'exec:function(cmd){return new Promise(function(resolve){var id="s"+Date.now()+"_"+(++_sysSeq);var timer=setTimeout(function(){delete _sysPending[id];resolve("（系统命令桥接等待超时）");},60000);_sysPending[id]={resolve:resolve,timer:timer};' +
        'try{window.parent.postMessage({__tzSysExec:{reqId:id,appId:APP_ID,cmd:String(cmd==null?"":cmd)}},"*");}catch(e){clearTimeout(timer);delete _sysPending[id];resolve("（无法联系系统命令行）");}' +
      '});}' +
    '};' +
    'window.addEventListener("message",function(ev){' +
      'var sr=ev.data&&ev.data.__tzSysResult;' +
      'if(sr&&_sysPending[sr.reqId]){var p=_sysPending[sr.reqId];clearTimeout(p.timer);delete _sysPending[sr.reqId];p.resolve(sr.ok?String(sr.value==null?"（完成）":sr.value):"执行出错："+sr.value);return;}' +
      'var d=ev.data&&ev.data.__tzCmdExec;if(!d)return;' +
      'var reply=function(ok,value){try{window.parent.postMessage({__tzCmdResult:{reqId:d.reqId,ok:ok,value:value}},"*");}catch(e){}};' +
      'var api={appId:APP_ID,version:' + JSON.stringify(OS_VERSION) + '};' +
      'var appMeta=' + JSON.stringify(meta) + ';' +
      'try{' +
        'var fn=new Function("args","appId","api","app",d.js);' +
        'var ret=fn(String(d.args==null?"":d.args),APP_ID,api,appMeta);' +
        'Promise.resolve(ret).then(function(v){reply(true,v===undefined?"（已执行）":String(v));},function(e){reply(false,"指令执行出错："+(e&&e.message||e));});' +
      '}catch(e){reply(false,"指令执行出错："+(e&&e.message||e));}' +
    '});' +
    'window.addEventListener("DOMContentLoaded",function(){try{window.parent.postMessage({__tzCmdReady:{appId:APP_ID}},"*");}catch(e){}});' +
  '})();<\/script>';
  const m = String(html || '').match(/<head[^>]*>/i) || String(html || '').match(/<html[^>]*>/i);
  if (m) { const i = html.indexOf(m[0]) + m[0].length; return html.slice(0, i) + boot + html.slice(i); }
  return boot + html;
}

/* ===================== 窗口管理器 ===================== */
const WM = {
  windows: [],
  zTop: 100,
  pinTop: 0,      // 置顶窗口在 4000+ 的次级层级（v2.6：低于快捷面板 4600、任务栏 5000、开始菜单 5100、右键菜单 6000）
  PIN_Z_BASE: 4000,
  PIN_Z_MAX: 4499, // 置顶窗口层级上限：始终低于快捷面板/任务栏/开始菜单
  openCount: 0,
  // 同一种软件只允许开一个窗口；重复收到打开命令时聚焦已有窗口而不是再开一个。
  isSingleton(app) { return !!(app && !app.multi); },
  findWindow(appId) { return this.windows.find(w => w.appId === appId) || null; },
  focusApp(appId) {
    const w = this.findWindow(appId);
    if (!w) return null;
    if (w.minimized) this.restore(w.id, { focusDom: true }); else this.focus(w.id, { focusDom: true });
    return w;
  },
  create(opts) {
    const app = opts.app;
    const activeBeforeOpen = document.activeElement;
    const returnFocus = activeBeforeOpen instanceof HTMLElement &&
      activeBeforeOpen !== document.body && activeBeforeOpen !== document.documentElement
      ? activeBeforeOpen
      : null;
    // 单例（v2.5 起所有应用默认单例，AI 对话除外）
    if (this.isSingleton(app)) {
      const exist = this.windows.find(w => w.appId === app.id);
      if (exist) {
        if (exist.minimized) this.restore(exist.id, { focusDom: true });
        else this.focus(exist.id, { focusDom: true });
        return exist;
      }
    }
    // 修复 v3.2：AI 悬浮窗模式（float-chat.html，独立窗口）下，#windows 是占位 hidden 容器。
    // 窗口对象照常创建并渲染（让 AI 命令行调用的 timer/clock 等后续操作能找到 w.body），
    // 但不绑定拖拽/resize/任务栏/全局事件，也不调用 focus()/Taskbar.render()。
    const floatMode = !!window.__tzFloatMode;
    const mobile = isMobile();
    const id = 'win-' + (++this.openCount);
    const winEl = el('div', 'win' + (mobile ? ' mobile-fullscreen' : ''));
    winEl.id = id;
    winEl.dataset.appId = app.id;
    winEl.tabIndex = -1;
    winEl.setAttribute('role', 'dialog');
    winEl.setAttribute('aria-modal', 'false');

    const isMac = !mobile && (Store.getStyle() === 'mac');
    if (isMac) winEl.classList.add('mac-style');

    // 尺寸与位置 —— 默认分屏窗口模式（留出明显边距，非最大化）
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(opts.width || 720, Math.round(vw * 0.64));
    const h = Math.min(opts.height || 480, Math.round(vh * 0.74));
    const offset = (this.openCount % 6) * 26;
    const left = opts.left ?? Math.max(20, Math.round((vw - w) / 2) + offset - 70);
    const top = opts.top ?? Math.max(20, Math.round((vh - h) / 2) + offset - 50);
    winEl.style.width = w + 'px';
    winEl.style.height = h + 'px';
    winEl.style.left = left + 'px';
    winEl.style.top = (mobile ? 0 : top) + 'px';

    // 标题栏（统一 DOM 顺序，由 CSS 按风格排列控件位置）
    const title = el('div', 'win-title');
    const icons = el('div', 'win-title-icons');
    const closeBtn = el('button', 'wctrl close', '<svg viewBox="0 0 8 8" fill="none" stroke="#5b0700" stroke-width="1.5"><path d="M1 1l6 6M7 1L1 7"/></svg>');
    closeBtn.title = '关闭';
    closeBtn.setAttribute('aria-label', '关闭 ' + (app.name || '应用'));
    const minBtn = el('button', 'wctrl min', '<svg viewBox="0 0 8 8" fill="none" stroke="#5b3a00" stroke-width="1.5"><path d="M1 4h6"/></svg>');
    minBtn.title = '最小化';
    minBtn.setAttribute('aria-label', '最小化 ' + (app.name || '应用'));
    const maxBtn = el('button', 'wctrl max', '<svg viewBox="0 0 8 8" fill="none" stroke="#003d00" stroke-width="1.5"><path d="M1 1h6v6H1z"/></svg>');
    maxBtn.title = '最大化 / 还原';
    maxBtn.setAttribute('aria-label', '最大化或还原 ' + (app.name || '应用'));
    // 刷新/重载按钮（仅 preset/installed 应用显示）
    const reloadBtn = (app.type === 'preset' || app.type === 'installed') ? el('button', 'wctrl reload', '<svg viewBox="0 0 8 8" fill="none" stroke="#003d00" stroke-width="1.3"><path d="M4 1.5a2.5 2.5 0 1 0 2.3 3.5M6.3 2v2h-2"/></svg>') : null;
    if (reloadBtn) {
      reloadBtn.title = '刷新（恢复初始状态）';
      reloadBtn.setAttribute('aria-label', '刷新 ' + (app.name || '应用'));
    }
    const uninstBtn = app.type === 'installed' ? el('button', 'wctrl uninst', '<svg viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 2l4 4M6 2L2 6"/></svg>') : null;
    if (uninstBtn) {
      uninstBtn.title = '卸载此软件';
      uninstBtn.setAttribute('aria-label', '卸载 ' + (app.name || '应用'));
    }
    // 置顶按钮（图钉）：所有窗口通用，固定在刷新/卸载之后、最小化之前
    const pinBtn = el('button', 'wctrl pin', '<svg viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 1v5M2 1h4M3 6l1 1 1-1"/></svg>');
    pinBtn.title = '置顶窗口';
    pinBtn.setAttribute('aria-label', '置顶 ' + (app.name || '应用'));
    icons.append(closeBtn, minBtn, maxBtn, ...(reloadBtn ? [reloadBtn] : []), ...(uninstBtn ? [uninstBtn] : []), pinBtn);

    const titleIcon = el('span', 'win-title-icon', appIconHTML(app));
    const titleText = el('span', 'win-title-text', escapeHtml(app.name || '应用'));
    titleText.id = id + '-title';
    winEl.setAttribute('aria-labelledby', titleText.id);
    const spacer = el('div', 'win-title-spacer');
    // 浏览器 / 文档阅读器 / 主 AI 对话：标签页栏与窗口标题栏合并。
    if (app.id === 'browser' || app.id === 'doc-reader' || (app.id === 'ai-chat' && !floatMode)) {
      if (app.id === 'browser') winEl.classList.add('browser-win');
      else if (app.id === 'doc-reader') winEl.classList.add('doc-win');
      else winEl.classList.add('chat-win');
      titleText.style.display = 'none';
      const tabsWrap = el('div', 'win-tabs');
      tabsWrap.id = app.id === 'browser' ? 'brTabsTitle' : (app.id === 'doc-reader' ? 'docTabsTitle' : 'chatTabsTitle');
      title.append(icons, titleIcon, tabsWrap, spacer);
    } else {
      title.append(icons, titleIcon, titleText, spacer);
    }

    const bodyClass = app.id === 'ai-chat' || app.id === 'terminal' ? 'win-body pad app-shell-body' : 'win-body pad';
    const body = el('div', bodyClass);
    const resizers = ['r-nw','r-n','r-ne','r-e','r-se','r-s','r-sw','r-w'];
    const resizerEls = resizers.map(r => { const e = el('div', 'win-resizer ' + r); e.dataset.dir = r; return e; });

    winEl.append(title, body, ...resizerEls);
    // 浮窗模式下：窗口挂到 hidden 占位 #windows，display: none 不显示
    if (floatMode) {
      winEl.style.display = 'none';
      winEl.classList.add('float-mode-hidden');
    }
    $('#windows').appendChild(winEl);

    const winObj = {
      id, appId: app.id, el: winEl, body,
      minimized: false, maximized: false, pinned: false, app,
      savedRect: null, mobileSavedRect: null, returnFocus
    };
    this.windows.push(winObj);

    // 渲染内容
    this.renderContent(winObj, { ...opts, titlebarTabs: app.id === 'ai-chat' && !floatMode });

    // 事件 —— 浮窗模式下跳过窗口级交互（拖拽/调整大小/标题栏菜单等都不需要）
    closeBtn.onclick = (e) => { e.stopPropagation(); this.close(id); };
    minBtn.onclick = (e) => { e.stopPropagation(); this.minimize(id); };
    maxBtn.onclick = (e) => { e.stopPropagation(); this.toggleMax(id); };
    if (reloadBtn) reloadBtn.onclick = (e) => { e.stopPropagation(); this.reload(id); };
    if (uninstBtn) uninstBtn.onclick = (e) => { e.stopPropagation(); uninstallApp(app.id); };
    pinBtn.onclick = (e) => { e.stopPropagation(); this.togglePin(id); };
    if (!floatMode) {
      title.oncontextmenu = (e) => {
        if (e.target.closest('.wctrl')) return;
        if (e.target.closest('.win-tabs')) return;
        e.preventDefault(); e.stopPropagation();
        const w = this.windows.find(x => x.id === id);
        if (!w) return;
        const items = [
          w.pinned
            ? { icon: '📌', label: '取消置顶', act: () => this.unpin(id) }
            : { icon: '📌', label: '置顶窗口', act: () => this.pin(id) },
          { icon: w.maximized ? '⧉' : '□', label: w.maximized ? '还原' : '最大化', act: () => this.toggleMax(id) },
          { icon: '🗕', label: '最小化', act: () => this.minimize(id) },
          { sep: true },
          { icon: '✕', label: '关闭', act: () => this.close(id) }
        ];
        showCtxMenu(e.clientX, e.clientY, items);
      };
      title.ondblclick = (e) => { if (e.target.closest('.wctrl')) return; if (!isMobile()) this.toggleMax(id); };
      this.bindDrag(winObj);
      this.bindResize(winObj);
      winEl.addEventListener('pointerdown', () => this.focus(id), { passive: true });
    }

    // 浮窗模式不调用 focus（依赖任务栏/桌面）和 Taskbar.render（依赖 #tbRunning）
    if (!floatMode) {
      this.constrainWindow(winObj);
      this.focus(id, { focusDom: true });
    }
    if (!floatMode) Taskbar.render();
    persistOpenWindows();
    return winObj;
  },
  renderContent(winObj, opts) {
    const { app, body } = winObj;
    if (app.type === 'preset') {
      body.className = 'win-body no-pad';
      const loading = el('div', 'app-loading', '<div class="al-spin"></div><div>正在加载 ' + escapeHtml(app.name) + '…</div>');
      loading.style.position = 'absolute'; loading.style.inset = '0'; loading.style.zIndex = '2';
      const iframe = el('iframe', 'app-iframe');
      // 天择网子页面及显式标记的站内应用加 nochrome=1，避免 OS 窗口里出现网站壳中壳。
      iframe.src = presetFrameUrl(app);
      iframe.loading = 'lazy';
      // 关键修复：先把 iframe 插入 DOM，浏览器才会真正加载，onload 才会触发
      body.appendChild(iframe);
      body.appendChild(loading);
      let settled = false;
      const showLoadError = (reason) => {
        if (!loading.parentNode) return;
        loading.innerHTML = '<div class="app-error"><div class="ae-icon">' + uiIconHTML('warning', '警告') + '</div><strong>应用未能完成加载</strong><small>' + escapeHtml(reason) + '</small><div class="app-error-actions"><button class="btn sm primary" data-load-action="retry">重试</button><button class="btn sm ghost" data-load-action="external">外部打开</button></div></div>';
        const retry = loading.querySelector('[data-load-action="retry"]');
        const external = loading.querySelector('[data-load-action="external"]');
        if (retry) retry.onclick = () => this.reload(winObj.id);
        if (external) external.onclick = () => {
          const url = new URL(app.url, location.href).href;
          try { if (window.tzDesktop && window.tzDesktop.openExternal) window.tzDesktop.openExternal(url); else window.open(url, '_blank', 'noopener'); }
          catch (_) { window.open(url, '_blank', 'noopener'); }
        };
      };
      iframe.onload = () => { settled = true; loading.remove(); };
      iframe.onerror = () => { settled = true; showLoadError('网络连接失败，或目标站点拒绝被 iframe 嵌入。'); };
      setTimeout(() => { if (!settled) showLoadError('等待超过 8 秒。可能是网络过慢，或站点的 CSP / X-Frame-Options 禁止嵌入。'); }, 8000);
    } else if (app.type === 'installed') {
      body.className = 'win-body no-pad';
      const iframe = el('iframe', 'app-iframe');
      // AI 生成应用使用独立沙箱来源，只能经受控 postMessage 桥访问系统，
      // 不再直接读取父页 localStorage 中的 API Key 和其他应用数据。
      iframe.sandbox = 'allow-scripts allow-forms allow-modals allow-popups';
      iframe.srcdoc = injectAppBootstrap(app.html, app);
      body.appendChild(iframe);
    } else {
      // builtin
      const html = app.render(opts);
      if (typeof html === 'string') { body.innerHTML = html; }
      else if (html instanceof HTMLElement) { body.innerHTML = ''; body.appendChild(html); }
    }
  },
  focus(id, options = {}) {
    this.windows.forEach(w => { w.el.classList.toggle('focused', w.id === id); });
    const w = this.windows.find(x => x.id === id);
    if (w) {
      // 置顶窗口拥有独立的高位层级，普通窗口永远不能超过
      if (w.pinned) {
        // v2.6：置顶窗口层级限制在 PIN_Z_BASE~PIN_Z_MAX，确保始终低于
        // 快捷面板(4600)、任务栏(5000)、开始菜单(5100)、右键菜单(6000)
        if (this.pinTop >= this.PIN_Z_MAX - this.PIN_Z_BASE) this.pinTop = 0;
        w.el.style.zIndex = this.PIN_Z_BASE + (++this.pinTop);
      } else {
        // 普通窗口限制在 100~PIN_Z_BASE-1 之间，避免超过置顶层
        if (this.zTop >= this.PIN_Z_BASE - 1) this.zTop = 100;
        w.el.style.zIndex = ++this.zTop;
      }
      if (w.minimized) {
        this.restore(id, options);
        return;
      }
      if (options.focusDom) focusSafely(w.el);
    }
    // 任意窗口被聚焦/操作后，退出"显示桌面"状态
    if (window.__tzDesktopShown) {
      window.__tzDesktopShown = false;
      const sd = document.getElementById('btnShowDesktop');
      if (sd) sd.classList.remove('active');
    }
    Taskbar.render();
  },
  topVisible(exceptId = '') {
    return this.windows
      .filter(item => item.id !== exceptId && !item.minimized && item.el.isConnected)
      .sort((a, b) => (parseInt(b.el.style.zIndex, 10) || 0) - (parseInt(a.el.style.zIndex, 10) || 0))[0] || null;
  },
  focusedWindow() {
    return this.windows.find(item => item.el.classList.contains('focused')) || this.topVisible();
  },
  cycleFocus(reverse = false) {
    const visible = this.windows.filter(item => !item.minimized && item.el.isConnected);
    if (!visible.length) return;
    visible.sort((a, b) => (parseInt(b.el.style.zIndex, 10) || 0) - (parseInt(a.el.style.zIndex, 10) || 0));
    const current = this.focusedWindow();
    let index = visible.indexOf(current);
    index = reverse ? (index <= 0 ? visible.length - 1 : index - 1) : (index + 1) % visible.length;
    this.focus(visible[index].id, { focusDom: true });
    announce('已切换到 ' + (visible[index].app.name || '应用'));
  },
  snap(id, side) {
    const win = this.windows.find(item => item.id === id);
    if (!win || isMobile()) return;
    const area = getWorkArea();
    win.maximized = false;
    win.el.classList.remove('maximized');
    if (side === 'max') {
      this.toggleMax(id);
      return;
    }
    const half = Math.floor(area.width / 2);
    win.el.style.top = area.top + 'px';
    win.el.style.left = (side === 'right' ? area.left + half : area.left) + 'px';
    win.el.style.width = (side === 'right' ? area.width - half : half) + 'px';
    win.el.style.height = area.height + 'px';
    this.focus(id, { focusDom: true });
  },
  handoffFocus(closedWindow = null) {
    const settleFocus = (target) => {
      focusSafely(target);
      setTimeout(() => {
        if (document.activeElement === document.body || document.activeElement === document.documentElement) {
          focusSafely(target);
        }
      }, 220);
    };
    const next = this.topVisible(closedWindow && closedWindow.id);
    if (next) {
      this.focus(next.id, { focusDom: true });
      settleFocus(next.el);
      return;
    }
    const fallback = closedWindow && isVisibleFocusable(closedWindow.returnFocus)
      ? closedWindow.returnFocus
      : ($('#btnStart') || $('#shellSearch') || $('#desktop'));
    settleFocus(fallback);
    // 最后一个可见窗口关闭或最小化时没有后继窗口触发 focus()，
    // 因此必须在这里立即同步任务栏，避免残留“仍在运行/仍为活动窗口”的旧状态。
    Taskbar.render();
  },
  close(id) {
    const idx = this.windows.findIndex(w => w.id === id);
    if (idx < 0) return;
    const w = this.windows[idx];
    const wasFocused = w.el.classList.contains('focused') || w.el.contains(document.activeElement);
    w.el.classList.add('closing');
    w.el.classList.remove('focused');
    w.el.style.pointerEvents = 'none';
    setTimeout(() => { w.el.remove(); }, 180);
    this.windows.splice(idx, 1);
    if (w.appId === 'browser') cleanupBrowserHooks();
    if (w.appId === 'ai-chat' && typeof ChatSessions !== 'undefined') ChatSessions.releaseWindow(id);
    if (wasFocused) this.handoffFocus(w);
    else Taskbar.render();
    if (w.onClose) w.onClose();
    persistOpenWindows();
  },
  minimize(id) {
    const w = this.windows.find(x => x.id === id);
    if (!w) return;
    const wasFocused = w.el.classList.contains('focused') || w.el.contains(document.activeElement);
    w.minimized = true;
    w.el.classList.remove('focused');
    w.el.classList.add('minimized');
    setTimeout(() => { if (w.minimized) w.el.style.display = 'none'; }, 220);
    if (wasFocused) this.handoffFocus(w);
    else Taskbar.render();
  },
  restore(id, options = {}) {
    const w = this.windows.find(x => x.id === id);
    if (!w) return;
    w.minimized = false;
    w.el.style.display = '';
    w.el.classList.remove('minimized');
    this.focus(id, { focusDom: options.focusDom !== false });
  },
  // 最大化 / 还原 切换（分屏窗口 ↔ 最大化，最大化时不覆盖任务栏）
  toggleMax(id) {
    const w = this.windows.find(x => x.id === id);
    if (!w || isMobile()) return;
    if (w.maximized) {
      w.maximized = false;
      w.el.classList.remove('maximized');
      if (w.savedRect) {
        w.el.style.left = w.savedRect.l; w.el.style.top = w.savedRect.t;
        w.el.style.width = w.savedRect.w; w.el.style.height = w.savedRect.h;
      }
    } else {
      w.savedRect = { l: w.el.style.left, t: w.el.style.top, w: w.el.style.width, h: w.el.style.height };
      w.maximized = true;
      w.el.classList.add('maximized');
      // 限制在任务栏之外的可用桌面区域：底部紧贴任务栏上方，不被遮挡
      const area = getWorkArea();
      w.el.style.left = area.left + 'px';
      w.el.style.top = area.top + 'px';
      w.el.style.width = area.width + 'px';
      w.el.style.height = area.height + 'px';
    }
    this.constrainWindow(w);
    this.focus(id, { focusDom: true });
  },
  constrainWindow(w) {
    if (!w || !w.el.isConnected) return;
    const area = getWorkArea();
    if (isMobile()) {
      if (!w.el.classList.contains('mobile-fullscreen')) {
        w.mobileSavedRect = {
          l: w.el.style.left, t: w.el.style.top,
          w: w.el.style.width, h: w.el.style.height
        };
      }
      w.el.classList.add('mobile-fullscreen');
      w.el.style.left = '0px';
      w.el.style.top = '0px';
      w.el.style.width = window.innerWidth + 'px';
      w.el.style.height = window.innerHeight + 'px';
      return;
    }
    const wasMobile = w.el.classList.contains('mobile-fullscreen');
    w.el.classList.remove('mobile-fullscreen');
    if (wasMobile && w.mobileSavedRect) {
      Object.assign(w.el.style, {
        left: w.mobileSavedRect.l,
        top: w.mobileSavedRect.t,
        width: w.mobileSavedRect.w,
        height: w.mobileSavedRect.h
      });
      w.mobileSavedRect = null;
    }
    if (w.maximized) {
      Object.assign(w.el.style, {
        left: area.left + 'px',
        top: area.top + 'px',
        width: area.width + 'px',
        height: area.height + 'px'
      });
      return;
    }
    const width = clamp(w.el.offsetWidth || parseInt(w.el.style.width, 10) || 720, Math.min(320, area.width), area.width);
    const height = clamp(w.el.offsetHeight || parseInt(w.el.style.height, 10) || 480, Math.min(200, area.height), area.height);
    const left = clamp(parseInt(w.el.style.left, 10) || 0, area.left, Math.max(area.left, area.left + area.width - width));
    const top = clamp(parseInt(w.el.style.top, 10) || 0, area.top, Math.max(area.top, area.top + area.height - height));
    Object.assign(w.el.style, {
      left: left + 'px',
      top: top + 'px',
      width: width + 'px',
      height: height + 'px'
    });
  },
  reflowAll() {
    this.windows.forEach(w => this.constrainWindow(w));
    Taskbar.render();
  },
  // 刷新/重载：恢复应用到初始状态（等同于退出后重新打开）
  reload(id) {
    const w = this.windows.find(x => x.id === id);
    if (!w) return;
    const app = w.app;
    w.body.innerHTML = '';
    if (app.type === 'preset') {
      const iframe = el('iframe', 'app-iframe');
      // 与首次打开共用同一 URL 规则，刷新后仍保持无网站外壳模式。
      iframe.src = presetFrameUrl(app);
      iframe.loading = 'lazy';
      const loading = el('div', 'app-loading', '<div class="al-spin"></div><div>正在重新加载…</div>');
      loading.style.cssText = 'position:absolute;inset:0;z-index:2';
      w.body.appendChild(iframe);
      w.body.appendChild(loading);
      iframe.onload = () => loading.remove();
    } else if (app.type === 'installed') {
      const iframe = el('iframe', 'app-iframe');
      iframe.sandbox = 'allow-scripts allow-forms allow-modals allow-popups';
      iframe.srcdoc = injectAppBootstrap(app.html, app);
      w.body.appendChild(iframe);
    } else {
      if (app.id === 'browser') cleanupBrowserHooks();
      const html = app.render({ titlebarTabs: app.id === 'ai-chat' && !window.__tzFloatMode });
      if (typeof html === 'string') w.body.innerHTML = html;
      else if (html instanceof HTMLElement) { w.body.innerHTML = ''; w.body.appendChild(html); }
      setTimeout(() => initAppHooks(app.id), 0);
    }
    this.focus(id);
    toast('已刷新 ' + (app.name || '应用'));
  },
  bindDrag(w) {
    const title = w.el.querySelector('.win-title');
    let sx, sy, sl, st, dragging = false;
    title.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.wctrl')) return;
      if (e.target.closest('.win-tabs')) return; // 浏览器标签栏区域不触发窗口拖拽
      if (w.maximized) return;
      if (isMobile()) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      sl = parseInt(w.el.style.left); st = parseInt(w.el.style.top);
      w.el.style.transition = 'none';
      title.setPointerCapture(e.pointerId);
    });
    title.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      const area = getWorkArea();
      const maxLeft = Math.max(area.left, area.left + area.width - w.el.offsetWidth);
      const maxTop = Math.max(area.top, area.top + area.height - w.el.offsetHeight);
      w.el.style.left = clamp(sl + dx, area.left, maxLeft) + 'px';
      w.el.style.top = clamp(st + dy, area.top, maxTop) + 'px';
    });
    title.addEventListener('pointerup', (e) => {
      dragging = false;
      w.el.style.transition = '';
      try { title.releasePointerCapture(e.pointerId); } catch {}
    });
  },
  bindResize(w) {
    w.el.querySelectorAll('.win-resizer').forEach(r => {
      r.addEventListener('pointerdown', (e) => {
        if (w.maximized || isMobile()) return;
        e.stopPropagation();
        const dir = r.dataset.dir;
        const sx = e.clientX, sy = e.clientY;
        const sw = w.el.offsetWidth, sh = w.el.offsetHeight;
        const sl = parseInt(w.el.style.left), st = parseInt(w.el.style.top);
        const area = getWorkArea();
        const minWidth = Math.min(320, area.width), minHeight = Math.min(200, area.height);
        r.setPointerCapture(e.pointerId);
        const move = (ev) => {
          const dx = ev.clientX - sx, dy = ev.clientY - sy;
          let nw = sw, nh = sh, nl = sl, nt = st;
          if (dir.includes('e')) nw = clamp(sw + dx, minWidth, area.left + area.width - sl);
          if (dir.includes('s')) nh = clamp(sh + dy, minHeight, area.top + area.height - st);
          if (dir.includes('w')) { nw = Math.max(minWidth, sw - dx); nl = sl + (sw - nw); }
          if (dir.includes('n')) { nh = Math.max(minHeight, sh - dy); nt = st + (sh - nh); }
          nl = clamp(nl, area.left, Math.max(area.left, area.left + area.width - minWidth));
          nt = clamp(nt, area.top, Math.max(area.top, area.top + area.height - minHeight));
          nw = clamp(nw, minWidth, area.left + area.width - nl);
          nh = clamp(nh, minHeight, area.top + area.height - nt);
          w.el.style.width = nw + 'px'; w.el.style.height = nh + 'px';
          w.el.style.left = nl + 'px'; w.el.style.top = nt + 'px';
        };
        const up = (ev) => {
          try { r.releasePointerCapture(ev.pointerId); } catch {}
          r.removeEventListener('pointermove', move);
          r.removeEventListener('pointerup', up);
          this.constrainWindow(w);
        };
        r.addEventListener('pointermove', move);
        r.addEventListener('pointerup', up);
      });
    });
  },
  pin(id) {
    const w = this.windows.find(x => x.id === id);
    if (!w || w.pinned) return;
    w.pinned = true;
    w.el.classList.add('pinned');
    const btn = w.el.querySelector('.wctrl.pin');
    if (btn) { btn.title = '取消置顶'; btn.classList.add('active'); }
    this.focus(id);
    toast('窗口已置顶：' + (w.app.name || '应用'));
    Taskbar.render();
  },
  unpin(id) {
    const w = this.windows.find(x => x.id === id);
    if (!w || !w.pinned) return;
    w.pinned = false;
    w.el.classList.remove('pinned');
    const btn = w.el.querySelector('.wctrl.pin');
    if (btn) { btn.title = '置顶窗口'; btn.classList.remove('active'); }
    this.focus(id);
    toast('窗口已取消置顶');
    Taskbar.render();
  },
  togglePin(id) {
    const w = this.windows.find(x => x.id === id);
    if (!w) return;
    w.pinned ? this.unpin(id) : this.pin(id);
  },
  closeAll() { [...this.windows].forEach(w => this.close(w.id)); }
};

/* ===================== 任务栏 ===================== */
const Taskbar = {
  render() {
    const running = $('#tbRunning');
    if (!running) return;
    running.innerHTML = '';
    const pinned = Store.getPinned();
    const wins = WM.windows;
    // 1) 固定的应用（始终显示，未运行时半透明）
    pinned.forEach(id => {
      const app = findApp(id);
      if (!app) return;
      const w = wins.find(x => x.appId === id);
      this.addItem(running, app, w);
    });
    // 2) 正在运行但未固定的应用
    wins.forEach(w => {
      if (pinned.includes(w.appId)) return;
      this.addItem(running, w.app, w);
    });
  },
  addItem(container, app, w) {
    const cls = 'tb-task' + (w ? (w.el.classList.contains('focused') ? ' active' : '') : ' pinned');
    const t = el('button', cls);
    t.innerHTML = `<span class="tb-task-icon">${uiIconHTML(appIconKey(app))}</span><span class="tb-task-name">${escapeHtml(app.name)}</span>`;
    t.title = app.name;
    t.dataset.appId = app.id;
    t.setAttribute('aria-label', w ? `${app.name}${w.minimized ? '（已最小化）' : ''}` : `打开 ${app.name}`);
    t.setAttribute('aria-pressed', String(!!(w && w.el.classList.contains('focused'))));
    t.onclick = () => {
      if (!w) { launchApp(app.id); return; }
      if (w.minimized) WM.restore(w.id, { focusDom: true });
      else if (w.el.classList.contains('focused')) WM.minimize(w.id);
      else WM.focus(w.id, { focusDom: true });
    };
    t.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation(); // 阻止冒泡到 #desktop，避免同时弹出桌面右键菜单
      const items = [];
      const isPinned = Store.getPinned().includes(app.id);
      items.push(isPinned
        ? { icon: '📌', label: '从任务栏取消固定', act: () => { Store.togglePin(app.id); this.render(); } }
        : { icon: '📌', label: '固定到任务栏', act: () => { Store.togglePin(app.id); this.render(); } });
      if (w) {
        items.push(w.pinned
          ? { icon: '📍', label: '取消置顶窗口', act: () => { WM.unpin(w.id); this.render(); } }
          : { icon: '📍', label: '置顶窗口', act: () => { WM.pin(w.id); this.render(); } });
        items.push({ icon: '✕', label: '关闭窗口', act: () => WM.close(w.id) });
      }
      showCtxMenu(e.clientX, e.clientY, items);
    };
    container.appendChild(t);
  }
};

/* ===================== 开始菜单 ===================== */
const StartMenu = {
  open: false,
  returnFocus: null,
  closeTimer: null,
  toggle() { this.open ? this.hide() : this.show(); },
  show() {
    if (this.open) return;
    clearTimeout(this.closeTimer);
    this.closeTimer = null;
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : $('#btnStart');
    this.open = true;
    const menu = $('#startMenu');
    menu.classList.remove('panel-exit');
    menu.hidden = false;
    $('#btnStart').classList.add('active');
    $('#btnStart').setAttribute('aria-expanded', 'true');
    // 打开时清空搜索框，避免上次残留过滤导致空列表
    const searchInput = $('#startSearch');
    if (searchInput) searchInput.value = '';
    this.render();
    focusSafely($('#startSearch'));
  },
  hide(restoreFocus = true) {
    if (!this.open) return;
    this.open = false;
    const menu = $('#startMenu');
    menu.classList.add('panel-exit');
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => {
      if (!this.open) menu.hidden = true;
      menu.classList.remove('panel-exit');
      this.closeTimer = null;
    }, motionDelay(150));
    $('#btnStart').classList.remove('active');
    $('#btnStart').setAttribute('aria-expanded', 'false');
    const target = this.returnFocus;
    this.returnFocus = null;
    if (restoreFocus) focusSafely(isVisibleFocusable(target) ? target : $('#btnStart'));
  },
  render(filter = '') {
    const grid = $('#startApps');
    if (!grid) return;
    grid.innerHTML = '';
    const all = (typeof getAllApps === 'function') ? getAllApps() : [];
    const apps = all.filter(a => !filter || (a.name||'').toLowerCase().includes(filter.toLowerCase()) || (a.desc||'').toLowerCase().includes(filter.toLowerCase()));
    if (!apps.length) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--ink-faint);padding:30px;font-size:13px;">未找到匹配的应用</div>';
      return;
    }
    // 按分类分组显示（带分类标题），不再一股脑堆在一起
    const groups = {};
    apps.forEach(a => { const c = a.category || 'installed'; (groups[c] = groups[c] || []).push(a); });
    Object.values(groups).forEach(list => list.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    CAT_ORDER.forEach(cat => {
      const list = groups[cat];
      if (!list || !list.length) return;
      const head = el('div', 'start-cat', escapeHtml(CAT_LABEL[cat] || '应用'));
      grid.appendChild(head);
      list.forEach(app => {
        const a = el('div', 'start-app');
        a.innerHTML = `<div class="sa-icon${app.grad?' grad':''}">${appIconHTML(app)}</div><div class="sa-name">${escapeHtml(app.name||'应用')}</div>`;
        const activate = () => { this.hide(false); launchApp(app.id); };
        a.onclick = activate;
        bindButtonLike(a, activate, app.name || '应用');
        grid.appendChild(a);
      });
    });
  }
};

/* ===================== 右键菜单 ===================== */
let ctxEl = null;
let ctxReturnFocus = null;
function showCtxMenu(x, y, items) {
  hideCtxMenu(false);
  const menu = $('#ctxMenu');
  menu.innerHTML = '';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', '上下文菜单');
  ctxReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  items.forEach(it => {
    if (it.sep) {
      const sep = el('div', 'ctx-sep');
      sep.setAttribute('role', 'separator');
      menu.appendChild(sep);
      return;
    }
    const i = el('button', 'ctx-item', `<span class="ci-icon">${uiIconHTML(it.icon || 'crystal')}</span><span>${escapeHtml(it.label)}</span>`);
    i.type = 'button';
    i.setAttribute('role', 'menuitem');
    i.onclick = () => { hideCtxMenu(false); if (it.act) it.act(); };
    menu.appendChild(i);
  });
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = clamp(x, 8, Math.max(8, window.innerWidth - r.width - 8)) + 'px';
  menu.style.top = clamp(y, 8, Math.max(8, window.innerHeight - r.height - 8)) + 'px';
  ctxEl = menu;
  const focusable = () => $$('[role="menuitem"]', menu);
  menu.onkeydown = (event) => {
    const entries = focusable();
    const index = entries.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      hideCtxMenu(true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      focusSafely(entries[(index + step + entries.length) % entries.length]);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      focusSafely(entries[event.key === 'Home' ? 0 : entries.length - 1]);
    } else if (event.key === 'Tab') {
      hideCtxMenu(false);
    }
  };
  focusSafely(focusable()[0]);
}
function hideCtxMenu(restoreFocus = false) {
  if (!ctxEl) return;
  ctxEl.hidden = true;
  ctxEl.onkeydown = null;
  ctxEl = null;
  const target = ctxReturnFocus;
  ctxReturnFocus = null;
  if (restoreFocus && isVisibleFocusable(target)) focusSafely(target);
}

/* ===================== 桌面渲染（自由摆放 + 分类整理） ===================== */
const CAT_ORDER = ['system', 'ai', 'tznet', 'tool', 'installed', 'emu', 'game'];
const CAT_LABEL = { system: '系统', ai: 'AI', tznet: '天择网', tool: '实用工具', installed: '我的软件', emu: '模拟器', game: '游戏' };

const Desktop = {
  selected: null,
  render() {
    const iconsEl = $('#desktopIcons');
    const homeEl = $('#homeScreen');
    iconsEl.innerHTML = '';
    homeEl.innerHTML = '';
    const apps = getAllApps();

    if (isMobile()) {
      // 移动端：保持网格，不支持自由拖拽
      iconsEl.classList.remove('canvas-mode');
      apps.forEach(app => { const ic = this.makeIcon(app, false); homeEl.appendChild(ic); });
      this.renderDock();
      return;
    }

    // PC：绝对定位画布，支持自由拖拽 + 分类整理
    iconsEl.classList.add('canvas-mode');
    const saved = Store.getIconPositions();
    const placed = new Set();
    let savedChanged = false;

    // 1) 已保存位置的图标 → 自由摆放在保存坐标
    apps.forEach(app => {
      if (saved[app.id]) {
        const ic = this.makeIcon(app, true);
        iconsEl.appendChild(ic);
        const maxX = Math.max(0, iconsEl.clientWidth - ic.offsetWidth);
        const maxY = Math.max(0, iconsEl.clientHeight - ic.offsetHeight);
        const x = clamp(Number(saved[app.id].x) || 0, 0, maxX);
        const y = clamp(Number(saved[app.id].y) || 0, 0, maxY);
        ic.style.left = x + 'px';
        ic.style.top = y + 'px';
        if (x !== saved[app.id].x || y !== saved[app.id].y) {
          saved[app.id] = { x, y };
          savedChanged = true;
        }
        placed.add(app.id);
      }
    });
    if (savedChanged) Store.setIconPositions(saved);

    // 2) 其余图标 → 按分类整理到独立区域（带分类标签）
    const remaining = apps.filter(a => !placed.has(a.id));
    this.layoutByCategory(iconsEl, remaining);
    this.renderDock();
  },
  // 按分类整理：每个分类一列，带标签，超出高度自动换列
  layoutByCategory(container, apps) {
    const rect = container.getBoundingClientRect();
    const padX = 10, padY = 8;
    const colW = 100, rowH = 100, labelH = 24;
    const maxBottom = (rect.height || (window.innerHeight - 120)) - 20;
    const groups = {};
    apps.forEach(a => { const c = a.category || 'installed'; (groups[c] = groups[c] || []).push(a); });
    let col = 0;
    CAT_ORDER.forEach(cat => {
      const list = groups[cat];
      if (!list || !list.length) return;
      let x = padX + col * colW;
      let y = padY;
      const label = el('div', 'zone-label', CAT_LABEL[cat] || '应用');
      label.style.left = x + 'px';
      label.style.top = y + 'px';
      container.appendChild(label);
      y += labelH;
      list.forEach(app => {
        if (y + rowH > maxBottom) { col++; x = padX + col * colW; y = padY + labelH; }
        const ic = this.makeIcon(app, true);
        ic.style.left = x + 'px';
        ic.style.top = y + 'px';
        container.appendChild(ic);
        y += rowH;
      });
      col++;
    });
  },
  makeIcon(app, draggable) {
    const ic = el('div', 'desktop-icon');
    ic.dataset.appId = app.id;
    const badge = app.badge ? `<span class="di-badge">${app.badge}</span>` : '';
    ic.innerHTML = `<div class="di-icon${app.grad?' grad':''}">${appIconHTML(app)}${badge}</div><div class="di-label">${escapeHtml(app.name)}</div>`;
    this.bindIcon(ic, app, draggable);
    return ic;
  },
  bindIcon(ic, app, draggable) {
    let lastTap = 0;
    let pressX, pressY, startL, startT, dragging = false, moved = false, wasDragged = false;
    const canDrag = draggable && !isMobile();

    ic.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      pressX = e.clientX; pressY = e.clientY;
      moved = false; wasDragged = false;
      if (canDrag) { startL = ic.offsetLeft; startT = ic.offsetTop; }
    });
    ic.addEventListener('pointermove', (e) => {
      if (!canDrag || pressX === undefined) return;
      const dx = e.clientX - pressX, dy = e.clientY - pressY;
      if (!dragging && Math.hypot(dx, dy) > 5) {
        dragging = true;
        try { ic.setPointerCapture(e.pointerId); } catch {}
        ic.classList.add('dragging', 'free');
      }
      if (dragging) {
        moved = true;
        const cw = ic.parentElement.clientWidth, ch = ic.parentElement.clientHeight;
        const nx = Math.max(0, Math.min(cw - ic.offsetWidth, startL + dx));
        const ny = Math.max(0, Math.min(ch - ic.offsetHeight, startT + dy));
        ic.style.left = nx + 'px';
        ic.style.top = ny + 'px';
      }
    });
    const endDrag = (e) => {
      if (dragging) {
        dragging = false;
        try { ic.releasePointerCapture(e.pointerId); } catch {}
        ic.classList.remove('dragging');
        if (moved) {
          wasDragged = true;
          const saved = Store.getIconPositions();
          saved[app.id] = { x: ic.offsetLeft, y: ic.offsetTop };
          Store.setIconPositions(saved);
        }
      }
      pressX = undefined;
    };
    ic.addEventListener('pointerup', endDrag);
    ic.addEventListener('pointercancel', endDrag);

    const activate = (e) => {
      if (wasDragged) { wasDragged = false; return; }
      e.stopPropagation();
      const now = Date.now();
      if (now - lastTap < 450) return; // 防止双击时第二次点击重复打开
      lastTap = now;
      launchApp(app.id);
    };
    ic.onclick = activate;
    bindButtonLike(ic, activate, app.name || '应用');
    ic.oncontextmenu = (e) => {
      e.preventDefault(); e.stopPropagation();
      const items = [{ icon: '▶', label: '打开', act: () => launchApp(app.id) }];
      if (Store.getIconPositions()[app.id]) {
        items.push({ icon: '↩', label: '重置此图标位置', act: () => {
          const saved = Store.getIconPositions(); delete saved[app.id]; Store.setIconPositions(saved); Desktop.render();
        }});
      }
      if (app.type === 'installed') {
        items.push({ sep: true });
        items.push({ icon: '✏️', label: '重命名', act: () => TZOS.renameApp(app.id) });
        items.push({ icon: '🔧', label: 'AI 改进', act: () => TZOS.fixApp(app.id) });
        items.push({ icon: '🗑', label: '卸载', act: () => uninstallApp(app.id) });
      }
      showCtxMenu(e.clientX, e.clientY, items);
    };
  },
  select(ic) {
    $$('.desktop-icon').forEach(x => x.classList.remove('selected'));
    ic.classList.add('selected');
    this.selected = ic.dataset.appId;
  },
  clearSelect() { $$('.desktop-icon').forEach(x => x.classList.remove('selected')); this.selected = null; },
  resetLayout() {
    Store.clearIconPositions();
    this.render();
    toast('图标布局已重置');
  },
  renderDock() {
    const dock = $('#mobileDock');
    if (!isMobile()) { dock.innerHTML = ''; return; }
    dock.innerHTML = '';
    const dockApps = ['browser', 'tips', 'ai-chat', 'app-store', 'ai-config', 'tz-home', 'tz-gpa', 'settings'];
    dockApps.forEach((id, idx) => {
      const app = findApp(id);
      if (!app) return;
      if (idx === 3) dock.appendChild(el('div', 'dock-sep'));
      const d = el('div', 'dock-app' + (app.grad ? ' grad' : ''), appIconHTML(app));
      const activate = () => launchApp(id);
      d.onclick = activate;
      bindButtonLike(d, activate, app.name || '应用');
      dock.appendChild(d);
    });
  }
};

/* ===================== 左下角悬浮窗（可拖拽 / 可关闭） ===================== */
const FloatingWidget = {
  el: null,
  init() {
    const w = $('#floatingWidget');
    const reopen = $('#fwReopen');
    this.el = w;
    const st = Store.getWidget();
    // 位置
    if (st.x != null && st.y != null) { w.style.left = st.x + 'px'; w.style.top = st.y + 'px'; w.style.bottom = 'auto'; w.style.right = 'auto'; }
    if (st.bx != null && st.by != null) { reopen.style.left = st.bx + 'px'; reopen.style.top = st.by + 'px'; reopen.style.bottom = 'auto'; reopen.style.right = 'auto'; }
    if (st.closed) { w.classList.add('hidden'); reopen.classList.remove('hidden'); this.placeReopen(reopen, st); }

    // 悬浮球（快捷面板关闭后的小球）：可拖拽换位置，点击重新打开面板
    let ballDrag = false, ballMoved = false, bsx, bsy, bsl, bst;
    const ballOnMove = (e) => {
      if (!ballDrag) return;
      const dx = e.clientX - bsx, dy = e.clientY - bsy;
      if (!ballMoved && Math.hypot(dx, dy) < 5) return;
      ballMoved = true;
      const nx = Math.max(0, Math.min(window.innerWidth - reopen.offsetWidth, bsl + dx));
      const ny = Math.max(0, Math.min(window.innerHeight - reopen.offsetHeight, bst + dy));
      reopen.style.left = nx + 'px';
      reopen.style.top = ny + 'px';
      reopen.style.bottom = 'auto';
      reopen.style.right = 'auto';
    };
    const ballOnUp = (e) => {
      if (!ballDrag) return;
      ballDrag = false;
      document.removeEventListener('pointermove', ballOnMove);
      document.removeEventListener('pointerup', ballOnUp);
      document.removeEventListener('pointercancel', ballOnUp);
      if (ballMoved) {
        const cur = Store.getWidget();
        cur.bx = reopen.offsetLeft; cur.by = reopen.offsetTop;
        Store.setWidget(cur);
        // 拖动后阻止随后的 click 触发重新打开
        setTimeout(() => { ballMoved = false; }, 80);
      }
    };
    reopen.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      ballDrag = true; ballMoved = false;
      bsx = e.clientX; bsy = e.clientY;
      bsl = reopen.offsetLeft; bst = reopen.offsetTop;
      document.addEventListener('pointermove', ballOnMove);
      document.addEventListener('pointerup', ballOnUp);
      document.addEventListener('pointercancel', ballOnUp);
    });

    // 拖拽：使用 document 级 pointermove/pointerup，避开 setPointerCapture 兼容性问题
    const head = $('#fwHeader');
    let dragging = false, sx, sy, sl, st2;
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      const nx = Math.max(0, Math.min(window.innerWidth - w.offsetWidth, sl + dx));
      const ny = Math.max(0, Math.min(window.innerHeight - w.offsetHeight, st2 + dy));
      w.style.left = nx + 'px';
      w.style.top = ny + 'px';
      w.style.bottom = 'auto';
      w.style.right = 'auto';
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      w.style.transition = '';
      const cur = Store.getWidget();
      cur.x = w.offsetLeft; cur.y = w.offsetTop;
      Store.setWidget(cur);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };
    head.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.target.closest('.fw-close')) return; // 点关闭按钮不启动拖拽
      e.preventDefault();
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      sl = w.offsetLeft; st2 = w.offsetTop;
      w.style.transition = 'none';
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    });

    // 关闭按钮：pointerdown 阻止冒泡到 header，click 触发关闭
    const closeBtn = $('#fwClose');
    closeBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
    closeBtn.onclick = (e) => { e.stopPropagation(); this.close(); };

    // 重新打开（拖拽刚结束时不触发）
    reopen.onclick = () => { if (ballMoved) return; this.open(); };
    // 快捷按钮
    w.querySelectorAll('.fw-btn').forEach(b => {
      b.onclick = (e) => { e.stopPropagation(); launchApp(b.dataset.app); };
    });
    // 时钟
    const tick = () => { const c = $('#fwClock'); if (c) { c.textContent = fmtTime(new Date()); } };
    tick(); setInterval(tick, 1000 * 10);
    this.constrain();
  },
  placeReopen(reopen, st) {
    const x = st.bx != null ? st.bx : st.x;
    const y = st.by != null ? st.by : st.y;
    if (x == null || y == null) return;
    reopen.style.left = clamp(Number(x) || 0, 0, Math.max(0, window.innerWidth - reopen.offsetWidth)) + 'px';
    reopen.style.top = clamp(Number(y) || 0, 0, Math.max(0, window.innerHeight - reopen.offsetHeight)) + 'px';
    reopen.style.bottom = 'auto';
    reopen.style.right = 'auto';
  },
  constrain() {
    const w = this.el;
    const reopen = $('#fwReopen');
    if (w && !w.classList.contains('hidden')) {
      const x = clamp(w.offsetLeft, 0, Math.max(0, window.innerWidth - w.offsetWidth));
      const y = clamp(w.offsetTop, 0, Math.max(0, window.innerHeight - w.offsetHeight));
      w.style.left = x + 'px';
      w.style.top = y + 'px';
      const state = Store.getWidget();
      state.x = x;
      state.y = y;
      Store.setWidget(state);
    }
    if (reopen && !reopen.classList.contains('hidden')) {
      const state = Store.getWidget();
      this.placeReopen(reopen, state);
      state.bx = reopen.offsetLeft;
      state.by = reopen.offsetTop;
      Store.setWidget(state);
    }
  },
  close() {
    // 关闭面板时，悬浮球出现在面板当前位置（形态切换位置不变）
    const cur = Store.getWidget();
    cur.bx = this.el.offsetLeft; cur.by = this.el.offsetTop;
    cur.closed = true;
    Store.setWidget(cur);
    this.el.classList.add('hidden');
    const reopen = $('#fwReopen');
    reopen.classList.remove('hidden');
    reopen.style.left = cur.bx + 'px'; reopen.style.top = cur.by + 'px';
    reopen.style.bottom = 'auto'; reopen.style.right = 'auto';
  },
  open() {
    // 重新打开面板时，面板出现在悬浮球当前位置（形态切换位置不变）
    const ball = $('#fwReopen');
    const cur = Store.getWidget();
    cur.x = ball.offsetLeft; cur.y = ball.offsetTop;
    cur.closed = false;
    Store.setWidget(cur);
    this.el.style.left = cur.x + 'px'; this.el.style.top = cur.y + 'px';
    this.el.style.bottom = 'auto'; this.el.style.right = 'auto';
    this.el.classList.remove('hidden');
    ball.classList.add('hidden');
  }
};

/* ===================== 启动应用 ===================== */
function launchApp(id, opts = {}) {
  const app = findApp(id);
  if (!app) { toast('应用不存在：' + id); return; }
  const defaults = { width: 820, height: 560 };
  if (app.type === 'preset') {
    defaults.width = 980; defaults.height = 680;
  } else if (app.type === 'installed') {
    defaults.width = app.width || 760; defaults.height = app.height || 540;
  } else if (id === 'ai-chat') {
    defaults.width = 720; defaults.height = 600;
  } else if (id === 'app-store') {
    defaults.width = 760; defaults.height = 640;
  } else if (id === 'browser') {
    defaults.width = 980; defaults.height = 680;
  } else if (id === 'terminal') {
    defaults.width = 680; defaults.height = 480;
  } else if (id === 'notes') {
    defaults.width = 880; defaults.height = 600;
  } else if (id === 'tips') {
    defaults.width = 760; defaults.height = 620;
  } else if (id === 'ai-config') {
    defaults.width = 940; defaults.height = 680;
  } else if (id === 'agent-center') {
    defaults.width = 980; defaults.height = 700;
  } else if (id === 'settings') {
    defaults.width = 880; defaults.height = 660;
  } else if (id === 'growth') {
    defaults.width = 820; defaults.height = 640;
  } else if (id === 'file-manager') {
    defaults.width = 780; defaults.height = 600;
  } else if (id === 'about' || id === 'tz-tree') {
    defaults.width = 760; defaults.height = 620;
  } else if (id === 'clock') {
    defaults.width = 620; defaults.height = 540;
  }
  return WM.create({ app, ...defaults, ...opts });
}

/* ---- 会话恢复：系统重启后自动重新打开上次未关闭的软件 ----
 * 每次创建/关闭窗口时把当前打开的 appId 列表写入 Store；boot 时按列表重开。 */
function persistOpenWindows() {
  if (window.__tzFloatMode) return;
  try {
    const ids = WM.windows.map(w => w.appId);
    Store.set('openSession', ids);
  } catch (e) {}
}
function restoreOpenWindows() {
  let ids = [];
  try { ids = Store.get('openSession', []) || []; } catch (e) { return; }
  if (!ids.length) return;
  // 去重（单例应用只开一个）+ 过滤已不存在的应用
  const seen = new Set();
  ids.filter(id => { if (seen.has(id)) return false; seen.add(id); return !!findApp(id); })
    .forEach((id, i) => setTimeout(() => { try { launchApp(id); } catch (e) {} }, 700 + i * 220));
}

async function uninstallApp(id) {
  const app = Store.getApps().find(a => a.id === id);
  const name = app ? app.name : '此软件';
  const ok = await confirmDialog({ title: '卸载软件', message: '确定要卸载「' + name + '」吗？\n该软件将从桌面移除。', confirmText: '卸载', danger: true });
  if (!ok) return;
  Store.removeApp(id);
  try { localStorage.removeItem('tz_app_cmds_' + id); } catch (e) {}
  WM.windows.filter(w => w.appId === id).forEach(w => WM.close(w.id));
  Desktop.render();
  StartMenu.render();
  refreshOpenApp('file-manager');
  toast('已卸载');
}

/* ===================== Toast 通知 ===================== */
function announce(message, assertive = false) {
  const live = document.getElementById(assertive ? 'tzLiveAssertive' : 'tzLivePolite');
  if (!live) return;
  live.textContent = '';
  setTimeout(() => { live.textContent = String(message || ''); }, 20);
}
function toast(msg, dur = 2600) {
  announce(String(msg || '').replace(/[\u{1F300}-\u{1FAFF}]/gu, '').trim());
  const t = el('div', 'tz-toast', uiStatusHTML(msg));
  Object.assign(t.style, {
    position: 'fixed', bottom: '70px', left: '50%', transform: 'translateX(-50%)',
    backgroundColor: 'transparent', backgroundImage: 'var(--os-surface-layer)', backgroundSize: 'cover',
    backgroundPosition: 'center', backdropFilter: 'blur(20px)', color: 'var(--ink)',
    padding: '10px 20px', borderRadius: '8px', fontSize: '13px', zIndex: '9999',
    border: '1px solid var(--glass-border)', boxShadow: 'var(--sh-md)', opacity: '0', transition: 'opacity 0.3s, transform 0.3s'
  });
  document.body.appendChild(t);
  requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateX(-50%) translateY(-6px)'; });
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, dur);
}

/* ===================== 自定义对话框（替代原生 confirm/prompt）===================== */
let dialogSeq = 0;
function openDialog(opts) {
  return new Promise((resolve) => {
    const o = Object.assign({ title: '提示', message: '', value: '', placeholder: '', confirmText: '确定', cancelText: '取消', danger: false, input: false, multiline: false, inputType: 'text' }, opts || {});
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialogId = 'tz-dialog-' + (++dialogSeq);
    const mask = el('div', 'tz-dialog-mask');
    const card = el('div', 'tz-dialog' + (o.danger ? ' danger' : ''));
    const titleEl = el('div', 'tz-dialog-title', escapeHtml(o.title));
    titleEl.id = dialogId + '-title';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', titleEl.id);
    card.tabIndex = -1;
    card.appendChild(titleEl);
    let msg = null;
    if (o.message) {
      msg = el('div', 'tz-dialog-msg');
      msg.id = dialogId + '-message';
      msg.innerHTML = escapeHtml(o.message).replace(/\n/g, '<br>');
      card.appendChild(msg);
      card.setAttribute('aria-describedby', msg.id);
    }
    let inputEl = null;
    if (o.input) {
      inputEl = el(o.multiline ? 'textarea' : 'input', 'tz-dialog-input');
      if (o.multiline) inputEl.rows = 3; else inputEl.type = o.inputType === 'password' ? 'password' : 'text';
      inputEl.placeholder = o.placeholder || '';
      inputEl.value = o.value || '';
      card.appendChild(inputEl);
    }
    const btns = el('div', 'tz-dialog-btns');
    const cancelBtn = el('button', 'tz-dialog-btn cancel', escapeHtml(o.cancelText));
    const confirmBtn = el('button', 'tz-dialog-btn confirm' + (o.danger ? ' danger' : ''), escapeHtml(o.confirmText));
    btns.append(cancelBtn, confirmBtn);
    card.append(btns);
    mask.appendChild(card);
    document.body.appendChild(mask);
    requestAnimationFrame(() => mask.classList.add('show'));
    let done = false;
    const focusables = () => $$('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', card)
      .filter(isVisibleFocusable);
    const finish = (val) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      mask.classList.remove('show');
      setTimeout(() => {
        mask.remove();
        focusSafely(isVisibleFocusable(previousFocus) ? previousFocus : ($('#btnStart') || $('#desktop')));
      }, 200);
      resolve(val);
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        finish(inputEl ? null : false);
      } else if (ev.key === 'Tab') {
        const items = focusables();
        if (!items.length) {
          ev.preventDefault();
          focusSafely(card);
          return;
        }
        const first = items[0], last = items[items.length - 1];
        if (ev.shiftKey && (document.activeElement === first || !card.contains(document.activeElement))) {
          ev.preventDefault();
          focusSafely(last);
        } else if (!ev.shiftKey && document.activeElement === last) {
          ev.preventDefault();
          focusSafely(first);
        }
      } else if (ev.key === 'Enter' && inputEl && !o.multiline) {
        ev.preventDefault();
        finish(inputEl.value);
      }
    };
    document.addEventListener('keydown', onKey, true);
    confirmBtn.onclick = () => finish(inputEl ? inputEl.value : true);
    cancelBtn.onclick = () => finish(inputEl ? null : false);
    mask.addEventListener('click', (e) => { if (e.target === mask) finish(inputEl ? null : false); });
    setTimeout(() => {
      if (inputEl) {
        focusSafely(inputEl);
        try { inputEl.select(); } catch {}
      } else {
        focusSafely(o.danger ? cancelBtn : confirmBtn);
      }
    }, 60);
  });
}
const confirmDialog = (opts) => openDialog({ ...opts, input: false }).then(v => !!v);
const promptDialog = (opts) => openDialog({ ...opts, input: true });

/* ===================== AI Token 用量账本 =====================
 * 所有经 AI.chat / AI.chatStream 发出的 API 请求都在这里统一记账。
 * 单价按请求发生时的 AI 配置快照计算，换模型或改价不会改写历史费用。 */
const AIUsage = {
  KEY: 'aiUsageLedgerV1',
  empty() {
    return { version: 1, migratedChats: false, totals: { requests: 0, estimatedRequests: 0, hit: 0, write: 0, input: 0, output: 0, total: 0, costCny: 0, costUsd: 0 }, records: [] };
  },
  estimate(messages, output) {
    const count = value => {
      const text = typeof value === 'string' ? value : JSON.stringify(value || '');
      const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
      return Math.max(1, Math.ceil(cjk + (text.length - cjk) / 4));
    };
    const prompt = (messages || []).reduce((sum, message) => sum + count(message && message.content) + 6, 0);
    const completion = count(output || '');
    return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
  },
  tokens(usage) {
    const u = usage || {};
    const hit = Number(u.prompt_cache_hit_tokens ?? u.cache_read_input_tokens ?? u.prompt_tokens_details?.cached_tokens) || 0;
    const write = Number(u.cache_creation_input_tokens ?? u.cache_write_tokens) || 0;
    const prompt = Number(u.prompt_tokens ?? u.input_tokens) || 0;
    const input = Number(u.prompt_cache_miss_tokens) || Math.max(0, prompt - hit - write);
    const output = Number(u.completion_tokens ?? u.output_tokens) || 0;
    const searches = Number(u.web_search_calls ?? u.search_calls ?? u.web_search_count ?? u.search_count) || 0;
    return { hit, write, input, output, total: Number(u.total_tokens) || (hit + write + input + output), searches };
  },
  cost(tokens, prices) {
    const p = prices || {};
    return (tokens.hit * (+p.hit || 0) + tokens.write * (+p.write || 0) + tokens.input * (+p.input || 0) + tokens.output * (+p.output || 0)) / 1e6 + tokens.searches * (+p.search || 0);
  },
  add(data, usage, meta = {}) {
    if (!usage) return data;
    const tokens = this.tokens(usage);
    if (!(tokens.total || tokens.searches)) return data;
    const config = Store.getAIConfig() || {};
    const prices = { ...(meta.prices || config.prices || {}) };
    const unit = prices.unit === 'usd' ? 'usd' : 'cny';
    const cost = this.cost(tokens, prices);
    data.totals.requests += 1;
    if (meta.estimated) data.totals.estimatedRequests = (data.totals.estimatedRequests || 0) + 1;
    ['hit', 'write', 'input', 'output', 'total'].forEach(key => { data.totals[key] += tokens[key]; });
    data.totals[unit === 'usd' ? 'costUsd' : 'costCny'] += cost;
    data.records.unshift({
      id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      at: Date.now(),
      source: meta.source || 'api',
      model: meta.model || config.model || '未知模型',
      ...tokens,
      cost,
      unit,
      estimated: !!meta.estimated
    });
    data.records = data.records.slice(0, 300);
    return data;
  },
  get() {
    let data = Store.get(this.KEY, null);
    if (!data || !data.totals || !Array.isArray(data.records)) data = this.empty();
    if (!data.migratedChats) {
      const chats = typeof Store.getChats === 'function' ? Store.getChats() : [];
      chats.forEach(chat => (chat.messages || []).forEach(message => {
        if (message && message.usage) this.add(data, message.usage, { source: chat.archivedAt ? 'archived-chat' : 'chat', model: '历史会话' });
      }));
      data.migratedChats = true;
      Store.set(this.KEY, data);
    }
    return data;
  },
  record(usage, meta) {
    if (!usage) return;
    try {
      const data = this.add(this.get(), usage, meta);
      Store.set(this.KEY, data);
      refreshOpenApp('ai-usage');
    } catch (error) {
      console.warn('[AIUsage] 用量记录失败：', error);
    }
  },
  reset() { Store.set(this.KEY, { ...this.empty(), migratedChats: true }); }
};

/* ===================== AI 引擎 ===================== */
const AI = {
  // 所有 API 类 AI 功能统一使用「AI 配置」里的通用配置（豆包仅为对话网页嵌入模式，不走 API）。
  config() { return { ...Store.getAIConfig() }; },
  isReady() { const c = this.config(); return !!(c.url && c.key && c.model); },
  // 最大输出 token：AI 配置里可自定义 maxTokens，默认 8192
  maxTokens(c, fallback) {
    const v = parseInt(c.maxTokens, 10);
    return Math.min(384000, (v > 0) ? v : (fallback || 8192));
  },
  supportsThinking(c) {
    const model = String(c && c.model || '').toLowerCase();
    const url = String(c && c.url || '');
    return /deepseek\.com/i.test(url) && /^deepseek-v4-(flash|pro)$/.test(model);
  },
  isMiMo(c) {
    return /xiaomimimo\.com/i.test(String(c && c.url || '')) ||
      /^mimo-v2\.5(?:-pro)?$/i.test(String(c && c.model || ''));
  },
  requestHeaders(c, stream) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': stream ? 'text/event-stream' : 'application/json'
    };
    if (this.isMiMo(c)) headers['api-key'] = c.key;
    else headers.Authorization = 'Bearer ' + c.key;
    return headers;
  },
  requestBody(c, messages, opts = {}, stream = false) {
    const body = {
      model: c.model,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.max_tokens ?? this.maxTokens(c),
      stream: !!stream
    };
    // MiMo V2.5 的 OpenAI 兼容接口使用 max_completion_tokens。
    if (this.isMiMo(c)) {
      body.max_completion_tokens = body.max_tokens;
      delete body.max_tokens;
    }
    if (stream) body.stream_options = { include_usage: true };
    if (this.supportsThinking(c)) {
      const thinking = opts.thinking !== undefined ? !!opts.thinking : getDeepThinkCtx();
      body.thinking = { type: thinking ? 'enabled' : 'disabled' };
      // DeepSeek V4 思考模式会忽略温度；不发送可避免给用户造成参数生效的错觉。
      if (thinking) delete body.temperature;
    }
    return body;
  },

  async request(c, body, onData, signal) {
    if (window.tzDesktop?.requestAI) {
      let text = '';
      const id = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : 'ai-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      const abort = () => window.tzDesktop.abortAI && window.tzDesktop.abortAI(id);
      if (signal) {
        if (signal.aborted) { const err = new Error('已停止生成'); err.name = 'AbortError'; throw err; }
        signal.addEventListener('abort', abort, { once: true });
      }
      try {
        const response = await window.tzDesktop.requestAI({ id, url: c.url, key: c.key, body, provider: this.isMiMo(c) ? 'mimo' : 'openai' }, chunk => {
          if (signal && signal.aborted) return;
          text += chunk;
          if (onData) onData(chunk);
        });
        if (signal && signal.aborted) { const err = new Error('已停止生成'); err.name = 'AbortError'; throw err; }
        if (response.status < 200 || response.status >= 300) throw this.httpError(response.status, text);
        return text;
      } finally {
        if (signal) signal.removeEventListener('abort', abort);
      }
    }
    const res = await fetch(c.url, {
      method: 'POST',
      headers: this.requestHeaders(c, body.stream),
      body: JSON.stringify(body),
      signal: signal || undefined
    });
    if (!res.ok) throw this.httpError(res.status, await res.text().catch(()=> ''));
    if (!onData) return await res.text();
    if (!res.body) throw new Error('AI 接口未返回可读取的响应内容');
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = dec.decode(value, { stream: true });
      text += chunk;
      if (chunk) onData(chunk);
    }
    const tail = dec.decode();
    text += tail;
    if (tail) onData(tail);
    return text;
  },

  httpError(status, body) {
    let detail = String(body || '').trim();
    try { const parsed = JSON.parse(detail); detail = parsed.error?.message || parsed.message || detail; } catch {}
    return new Error('AI 接口错误 ' + status + (detail ? '：' + detail.slice(0, 300) : ''));
  },

  async chat(messages, opts = {}) {
    const c = this.config();
    if (!this.isReady()) throw new Error('AI 未配置，请先在「AI 配置」中设置 URL、Key 和模型。');
    const text = await this.request(c, this.requestBody(c, messages, opts, false), null, opts.signal);
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('AI 接口返回了无效的 JSON'); }
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('AI 接口响应缺少 choices[0].message');
    const result = { content: msg.content || '', reasoning: msg.reasoning_content || '', usage: data.usage || null };
    AIUsage.record(result.usage || AIUsage.estimate(messages, result.content), { source: opts.source || 'api', model: c.model, estimated: !result.usage });
    return result;
  },

  // 流式输出。onChunk(delta, fullContent) 收正文；opts.onReasoning(delta, fullReasoning) 收思考过程
  // 返回 { content, reasoning, usage, finishReason }（usage 来自 stream_options include_usage 的末块）
  async chatStream(messages, onChunk, opts = {}) {
    const c = this.config();
    if (!this.isReady()) throw new Error('AI 未配置，请先在「AI 配置」中设置 URL、Key 和模型。');
    let buf = '', full = '', reasoning = '', finished = false, usage = null, finishReason = null, validEvents = 0;
    const onReasoning = opts.onReasoning;
    const reqBody = this.requestBody(c, messages, opts, true);
    // 联网搜索工具（MiMo 等 OpenAI 兼容服务），不支持的服务端会忽略或报错（由调用方降级）
    if (opts.tools && opts.tools.length) { reqBody.tools = opts.tools; reqBody.tool_choice = 'auto'; }
    const consume = (flush = false) => {
      const lines = buf.split(/\r?\n/);
      buf = flush ? '' : lines.pop();
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith('data:')) continue;
        const raw = s.slice(5).trim();
        if (raw === '[DONE]') { finished = true; continue; }
        try {
          const j = JSON.parse(raw);
          if (j && j.error) throw new Error(j.error.message || j.error.code || 'AI 流式接口返回错误');
          validEvents++;
          if (j.usage) usage = j.usage;
          const choice = j.choices?.[0];
          if (choice && choice.finish_reason) finishReason = choice.finish_reason;
          const delta = choice?.delta || {};
          if (delta.reasoning_content) { reasoning += delta.reasoning_content; if (onReasoning) onReasoning(delta.reasoning_content, reasoning); }
          if (delta.content) { full += delta.content; onChunk(delta.content, full); }
        } catch (e) {
          // 网络分块已由 buf 跨 chunk 拼接；完整 data 行仍无法解析时才忽略非 JSON 心跳。
          if (!(e instanceof SyntaxError)) throw e;
        }
      }
    };
    const perform = async () => {
      await this.request(c, reqBody, chunk => {
        if (finished) return;
        buf += chunk;
        consume(false);
      }, opts.signal);
    };
    try {
      await perform();
    } catch (error) {
      // 部分 OpenAI 兼容服务不接受 stream_options；仅在尚未收到有效事件时无损降级重试。
      if (!validEvents && reqBody.stream_options && /stream_options|include_usage|unknown (field|parameter)|extra inputs/i.test(String(error && error.message || ''))) {
        delete reqBody.stream_options;
        buf = ''; full = ''; reasoning = ''; finished = false; usage = null; finishReason = null;
        await perform();
      } else {
        throw error;
      }
    }
    if (buf.trim() && !finished) { buf += '\n'; consume(true); }
    if (!validEvents || (!full && !reasoning && !usage)) {
      throw new Error('AI 接口未返回兼容的 SSE 对话数据，请检查该模型是否支持流式输出');
    }
    const result = { content: full, reasoning, usage, finishReason };
    AIUsage.record(result.usage || AIUsage.estimate(messages, result.content || result.reasoning), { source: opts.source || 'api', model: c.model, estimated: !result.usage });
    return result;
  },

  async refinePrompt(userPrompt) {
    const sys = `你是一位资深软件产品经理与全栈工程师。用户想用一句话创建一个浏览器内运行的小软件。请把用户的模糊需求优化为一份清晰的软件规格说明书。

输出格式（严格遵循，不要加任何额外说明或代码块包裹）：
名称|图标|一句话描述|主要功能1,主要功能2,主要功能3,主要功能4,主要功能5|界面要点|交互要点

要求：
- 名称：4-8个字，朗朗上口
- 图标：一个最能代表该软件的 emoji 表情（只输出一个 emoji，不要任何文字）
- 主要功能：3-6条，每条简短
- 界面要点：描述布局和视觉风格
- 交互要点：描述关键交互
- 所有内容用中文，简洁清晰`;
    const out = await this.chat([{ role: 'system', content: sys }, { role: 'user', content: userPrompt }], { temperature: 0.5, max_tokens: 8192, source: 'app' });
    return (out.content || '').trim();
  },

  // 生成/改进软件的公共提示词片段（含 KaTeX、Markdown、本地存储教程与用户 AI 配置）
  appPromptExtra() {
    const c = this.config();
    const aiCfgText = this.isReady()
      ? `用户已经配置 AI。软件需要 AI 功能时，必须通过天择OS纯 API 命令调用，不要读取或写入 API Key，也不要自行 fetch：
const answer = await TZOS_CMD.exec('ask ' + 用户问题);
if (answer.startsWith('执行出错：')) throw new Error(answer);
ask 会直接返回模型正文，不会打开或写入 AI 对话，也不会启用截图、知识库或 Agent；Token 和费用会自动进入“Token 用量与计费”。`
      : '用户尚未配置 AI 接口，本软件不要实现需要联网 AI 的功能。';
    return `
【基本功能自动实现（按需取用，不需要的功能不要硬塞）】
A. LaTeX 公式与 Markdown 渲染：若软件涉及数学公式或富文本展示，引入 KaTeX 与 marked 并自动渲染，写法：
<head> 加入：
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
需要渲染时：元素.innerHTML = marked.parse(markdown文本); 然后 renderMathInElement(元素, { delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}], throwOnError: false });
动态更新内容后重新调用 renderMathInElement 即可。LaTeX 行内公式用 $...$，块级用 $$...$$。
B. 数据保存至本地：若软件有用户数据（记录、设置、进度等），用 localStorage 持久化，写法：
const KEY = 'tz_app_数据名_v1';
function save(d){ localStorage.setItem(KEY, JSON.stringify(d)); }
function load(){ try { return JSON.parse(localStorage.getItem(KEY)) || 默认值; } catch(e){ return 默认值; } }
每次数据变化后立即 save，启动时 load 恢复。
C. AI 功能（仅当用户需求明确需要 AI 时实现）：
${aiCfgText}

【CDN 使用许可】仅允许引入 KaTeX、marked 这两个库（用上面的 jsdelivr 地址，失败可换 https://cdn.staticfile.org/ 对应路径）；除这两个库与第 C 条的 AI 接口外，不要任何其它外部资源或网络请求（图片用 SVG 或 emoji）。

【可选：让软件能被天择OS命令行操控】若软件适合用命令操作（如笔记、待办、记账类），在代码里注册命令包：
TZOS_CMD.register([{ cmd: '指令名', desc: '说明', js: '执行代码字符串，可用 args/appId/api/app 变量，return 的值回显到命令行' }]);
TZOS_CMD 与 window.TZOS_APP_ID 由系统注入，直接用即可；绝不要自己猜或写死应用 id。js 会在你的软件内部执行，可直接调用你定义的全局函数（如 window.appAdd）。注册后用户可在命令行用「cmd 应用id 指令 参数」操控软件，例如笔记软件注册 note 指令后，命令行「cmd xxx note 一段文字」即把文字记入笔记。不需要命令操控的软件可跳过。

【可选：软件内调用系统命令行】软件里可随时 await TZOS_CMD.exec('系统命令') 调用天择OS命令行并拿到输出文本（Promise<string>），例如：
const list = await TZOS_CMD.exec('note list');   // 读取系统笔记列表
await TZOS_CMD.exec('clock');                     // 打开系统时钟
可用的系统命令与用户终端一致（help 列出的全部命令，含 ask 与其它软件注册的 cmd 应用id 指令）。需要读取系统数据、调用 AI 或联动系统功能时使用，不需要可跳过。`;
  },

  // 输出被 token 上限截断时自动续写：从截断点继续，不重复已输出内容
  async continueApp(partialCode, onChunk, opts = {}) {
    const sys = `你正在输出一个单文件 HTML 应用的完整代码，上一次输出因长度限制被截断。请直接从截断点继续输出剩余代码：不要重复任何已输出内容，不要解释或寒暄，不要用 markdown 代码块包裹，你的第一个字符就是截断点的下一个字符。`;
    return await this.chatStream([
      { role: 'system', content: sys },
      { role: 'user', content: '已输出内容的结尾如下（仅供定位断点，不要重复输出它）：\n……' + partialCode.slice(-2000) + '\n\n请从断点继续：' }
    ], onChunk, { temperature: 0.7, max_tokens: this.maxTokens(this.config(), 16384), onReasoning: opts.onReasoning, signal: opts.signal, source: 'app' });
  },

  async generateApp(spec, userPrompt, onChunk, opts = {}) {
    const sys = `你是一位顶尖前端工程师。请根据软件规格生成一个完整的、可直接在浏览器中运行的单文件 HTML 应用。

【硬性要求】
1. 【最重要】只输出代码本身：从 <!DOCTYPE html> 开始到 </html> 结束。严禁输出任何解释、寒暄或说明文字（例如"好的，以下是你要的html"这类句子一个字都不能有），不要用 markdown 代码块包裹，第一个字符必须是 <
2. 所有 CSS 写在 <style> 标签内，所有 JS 写在 <script> 标签内，全部内联
3. 界面必须是深色主题，配色使用紫(#7c3aed)-蓝(#3b82f6)-绿(#10b981)渐变，与天择OS风格一致
4. 使用现代 CSS（flex/grid/变量/玻璃态毛玻璃效果），界面精致美观
5. 完整实现所有功能，确保可用、可交互，不要占位符，不要写到一半留省略号
6. 代码健壮，有输入校验和错误处理
7. 中文界面，注释用中文
8. 字体使用系统字体栈：-apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif
9. 应用应在 720×540 左右的窗口内良好显示，支持响应式
${this.appPromptExtra()}

【软件规格】
${spec}

【用户原始需求】
${userPrompt}

请直接输出完整 HTML 代码（第一个字符必须是 <）：`;
    return await this.chatStream([{ role: 'system', content: sys }, { role: 'user', content: '请生成这个软件。记住：只输出代码，第一个字符必须是 <' }], onChunk, { temperature: 0.7, max_tokens: this.maxTokens(this.config(), 16384), onReasoning: opts.onReasoning, signal: opts.signal, source: 'app' });
  },

  async fixApp(app, instruction, onChunk, opts = {}) {
    const sys = `你是一位顶尖前端工程师。用户有一个已生成的单文件 HTML 软件，现在要按用户的需求修改或修复它。

【硬性要求】
1. 【最重要】只输出代码本身：从 <!DOCTYPE html> 开始到 </html> 结束的完整修改后版本。严禁输出任何解释、寒暄或说明文字（例如"好的"这类句子一个字都不能有），不要用 markdown 代码块包裹，第一个字符必须是 <
2. 保留原软件的整体结构与风格，只针对用户的需求做修改
3. 所有 CSS 写在 <style> 标签内，所有 JS 写在 <script> 标签内，全部内联
4. 界面保持深色主题，配色使用紫(#7c3aed)-蓝(#3b82f6)-绿(#10b981)渐变
5. 代码健壮，修复 bug 时确保不引入新问题
6. 中文界面，注释用中文
7. 除原有的 KaTeX/marked 库与 AI 接口外，不要使用任何外部 CDN、外部资源或网络请求（图片用 SVG 或 emoji）
8. 应用应在 720×540 左右的窗口内良好显示，支持响应式
9. 若软件含 TZOS_CMD.register（命令包注册）或 window.TZOS_APP_ID 相关代码，必须原样保留，不得删除或改写

【用户修改需求】
${instruction}

【当前软件完整代码】
${app.html}

请直接输出修改后的完整 HTML 代码（第一个字符必须是 <）：`;
    return await this.chatStream([{ role: 'system', content: sys }, { role: 'user', content: '请按需求修改这个软件。记住：只输出代码，第一个字符必须是 <' }], onChunk, { temperature: 0.6, max_tokens: this.maxTokens(this.config(), 16384), onReasoning: opts.onReasoning, signal: opts.signal, source: 'app' });
  },

  // 代码清洗：剥离开头寒暄/结尾废话/markdown 围栏，只保留 <!DOCTYPE…</html>
  cleanAppCode(code) {
    code = (code || '').trim();
    if (code.startsWith('```')) { code = code.replace(/^```(?:html)?\n?/, '').replace(/```\s*$/, ''); }
    const mDoc = code.search(/<!DOCTYPE/i);
    const mHtml = code.search(/<html[\s>]/i);
    let start = -1;
    if (mDoc >= 0 && (mHtml < 0 || mDoc <= mHtml)) start = mDoc;
    else if (mHtml >= 0) start = mHtml;
    if (start > 0) code = code.slice(start);
    const endIdx = code.toLowerCase().lastIndexOf('</html>');
    if (endIdx >= 0) code = code.slice(0, endIdx + 7);
    return code.trim();
  }
};

/* ===================== AI 记忆 ===================== */
const Mem = {
  list() { return Store.getMemories(); },
  enabledTexts() {
    if (!Store.getMemInject()) return [];
    return this.list().filter(m => m.enabled !== false && (m.text || '').trim()).map(m => m.text.trim());
  },
  // 注入到系统提示词的记忆片段
  promptSnippet() {
    const ts = this.enabledTexts();
    if (!ts.length) return '';
    return '\n\n【关于用户的记忆】（以下是系统记录的关于用户的事实，回答时可自然参考，不要向用户复述本说明）：\n' + ts.map(t => '- ' + t).join('\n');
  },
  add(text) {
    const ms = this.list();
    ms.push({ id: 'mem-' + Date.now() + '-' + Math.floor(Math.random() * 1000), text: (text || '').trim(), enabled: true });
    Store.setMemories(ms);
  },
  update(id, patch) {
    const ms = this.list();
    const i = ms.findIndex(m => m.id === id);
    if (i >= 0) { ms[i] = { ...ms[i], ...patch }; Store.setMemories(ms); }
  },
  remove(id) { Store.setMemories(this.list().filter(m => m.id !== id)); },
  // 生成完成后，让 AI 自动判断是否有值得记忆的内容（静默后台执行）
  async autoLearn(userText, aiText) {
    if (Store.getAgentMode()) return; // 命令行模式开启时由 AI 通过 mem 命令自行写记忆
    if (!Store.getMemAuto() || !AI.isReady()) return;
    const cur = this.list();
    const sys = `你是用户记忆管理器。根据刚才的一轮对话，判断是否有值得长期记忆的关于用户的事实（如身份、偏好、习惯、项目、目标等；闲聊、一次性请求不算）。
当前已有记忆（带编号）：
${cur.length ? cur.map((m, i) => (i + 1) + '. ' + m.text).join('\n') : '（空）'}
【输出要求】只输出一个 JSON 对象，不要任何其它文字：
{"add":["新记忆1","新记忆2"], "update":[{"index":编号,"text":"修改后的完整记忆"}], "delete":[编号]}
- 没有值得记忆的内容就输出 {"add":[],"update":[],"delete":[]}
- 每条记忆是一句简短的第三人称事实陈述（如"用户是大学生"）
- 已有记忆与新信息重复/冲突时，用 update 修改或 delete 删除，不要重复 add
- 编号从 1 开始，对应上面已有记忆的序号`;
    try {
      const r = await AI.chat([
        { role: 'system', content: sys },
        { role: 'user', content: '用户说：' + (userText || '').slice(0, 500) + '\n\nAI 回答：' + (aiText || '').slice(0, 800) }
      ], { temperature: 0.2, max_tokens: 400, source: 'chat' });
      const m = (r.content || '').match(/\{[\s\S]*\}/);
      if (!m) return;
      const ops = JSON.parse(m[0]);
      let ms = this.list();
      let changed = false;
      (ops.delete || []).slice().sort((a, b) => b - a).forEach(idx => {
        const i = idx - 1;
        if (i >= 0 && i < ms.length) { ms.splice(i, 1); changed = true; }
      });
      (ops.update || []).forEach(u => {
        const i = (u.index | 0) - 1;
        if (i >= 0 && i < ms.length && (u.text || '').trim()) { ms[i] = { ...ms[i], text: u.text.trim() }; changed = true; }
      });
      (ops.add || []).forEach(t => {
        t = (t || '').trim();
        if (t && !ms.some(x => x.text === t)) { ms.push({ id: 'mem-' + Date.now() + '-' + Math.floor(Math.random() * 1000), text: t, enabled: true }); changed = true; }
      });
      if (changed) { Store.setMemories(ms); toast('🧠 AI 记忆已更新', 1800); refreshOpenApp('ai-config'); }
    } catch (e) { /* 静默失败 */ }
  }
};

/* ===================== 自有软件命令包（每个软件一个顶层命令，help 直接可见） =====================
 * 设计原则：
 *   1) 每个 builtin/preset 软件对应一个顶层命令（命令名 = 软件短名，如 coc-data/words/chat）
 *   2) 命令带子命令时，无参数显示用法；用空格分隔子命令与参数
 *   3) 异步命令（fetch/IndexedDB）返回 Promise，CLI.exec 自动处理
 *   4) 不与系统命令（open/close/pin/theme/aiconfig…）重名
 * 用户安装的 AI 软件仍用 `cmd 应用id 指令` 调用（AppCommands 注册表）。
 * 教程见 APP_STORE_TUTORIAL。 */
const _appCmdCache = { coc: null, words: null, wordsTs: 0 };

// 异步获取 COC 中文数据 JSON（带缓存；本地相对路径，网页版/桌面版同源均可用）
async function fetchCocData() {
  if (_appCmdCache.coc) return _appCmdCache.coc;
  const res = await fetch('../coc/data/all_game_data_zh.json');
  if (!res.ok) throw new Error('COC 数据加载失败（HTTP ' + res.status + '）');
  const data = await res.json();
  _appCmdCache.coc = data;
  return data;
}

// 读取本地保存的玩家村庄存档（localStorage["tz_coc_village"]，由 COC 村庄分析页保存）
function loadVillageSave() {
  try {
    const raw = localStorage.getItem('tz_coc_village');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

// 打开背单词词库（与背单词应用完全一致的库结构：tzwords 库 kv 表，词库数组存于 key='vocab'）
function openWordsDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('tzwords', 1);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', { keyPath: 'k' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

// 异步获取单词本：优先 IndexedDB（同源），失败回退到示例词库
async function readWordsVocab() {
  // 1) 尝试同源 IndexedDB（tzwords/kv['vocab']，与背单词应用同库同键）
  let db = null;
  try {
    db = await openWordsDB();
    if (db.objectStoreNames && db.objectStoreNames.contains('kv')) {
      const rec = await new Promise((res, rej) => {
        const r = db.transaction('kv', 'readonly').objectStore('kv').get('vocab');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      if (rec && Array.isArray(rec.v)) return { words: rec.v, source: 'indexeddb' };
    }
  } catch (e) { /* 不存在或不可用，静默回退 */ }
  finally { if (db) db.close(); }
  // 2) 回退：fetch 示例词库（从未使用过背单词应用时）
  const res = await fetch('../english/words/sample-vocab.json');
  if (!res.ok) throw new Error('单词本加载失败（HTTP ' + res.status + '）');
  const list = await res.json();
  return { words: list, source: 'sample' };
}

// 写入单词本到 IndexedDB（与背单词应用同库同键；失败返回 false）
async function writeWordsVocab(list) {
  let db = null;
  try {
    db = await openWordsDB();
    if (!db.objectStoreNames || !db.objectStoreNames.contains('kv')) return false;
    await new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ k: 'vocab', v: list });
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
    _appCmdCache.words = null;
    return true;
  } catch (e) { return false; }
  finally { if (db) db.close(); }
}

// 子命令解析：把 "search 野蛮人" 拆成 { sub: 'search', args: '野蛮人' }
function splitSub(r) {
  const sp = r.indexOf(' ');
  return {
    sub: (sp < 0 ? r : r.slice(0, sp)).toLowerCase(),
    args: sp < 0 ? '' : r.slice(sp + 1).trim()
  };
}

const BUILTIN_APP_CMDS = {
  /* ===== COC 玩家村庄存档（coc-data）===== */
  // coc-data：读写本地保存的玩家村庄存档（localStorage["tz_coc_village"]，由 COC 专区首页解析时保存）
  'coc-data': (r) => {
    const arg = r || '';
    const sp = arg.indexOf(' ');
    const sub = (sp >= 0 ? arg.slice(0, sp) : arg).toLowerCase();
    if (sub === 'clear' || sub === 'reset' || sub === 'rm') {
      localStorage.removeItem('tz_coc_village');
      return '已清除本地村庄存档';
    }
    if (sub === 'save' || sub === 'set' || sub === 'import') {
      const json = sp >= 0 ? arg.slice(sp + 1).trim() : '';
      if (!json) throw new Error('用法：coc-data save <村庄JSON>（JSON 需压成一行）');
      let obj; try { obj = JSON.parse(json); } catch (e) { throw new Error('村庄 JSON 格式错误：' + e.message); }
      const save = { village: obj, th: 0, bh: 0, ts: Date.now() };
      try { const bs = obj.buildings || []; const th = bs.find(b => b.data === 1000001); if (th) save.th = th.lvl || 0; } catch (e) {}
      try { localStorage.setItem('tz_coc_village', JSON.stringify(save)); } catch (e) { throw new Error('保存失败（localStorage 可能已满）：' + e.message); }
      return '已保存村庄存档（大本 ' + (save.th || '?') + ' 级）。可用 coc-data 查看摘要，或在 COC 专区村庄分析中自动载入。';
    }
    const sv = loadVillageSave();
    if (!sv) return '（暂无本地村庄存档。在 COC 专区首页粘贴村庄 JSON 解析后会自动保存，或用 coc-data save <JSON> 写入。）\n提示：coc-data json 输出原始村庄 JSON；coc-data save <JSON> 保存；coc-game 查询游戏静态数据。';
    if (sub === 'json' || sub === 'raw') {
      return typeof sv.village === 'string' ? sv.village : JSON.stringify(sv.village, null, 2);
    }
    if (arg && sub !== 'help' && sub !== '?') throw new Error('未知子命令：' + arg + '（coc-data [save <JSON>|json|clear|help]）');
    const th = sv.th || '?', bh = sv.bh || '?';
    let buildings = 0, troops = 0, heroes = 0, spells = 0, pets = 0, equips = 0;
    try {
      const obj = typeof sv.village === 'string' ? JSON.parse(sv.village) : sv.village;
      buildings = (obj.buildings || []).length;
      // 导出格式为 units；兼容旧字段 troops
      troops = (obj.units || obj.troops || []).length;
      heroes = (obj.heroes || []).length;
      spells = (obj.spells || []).length;
      pets = (obj.pets || []).length;
      equips = (obj.equipment || []).length;
    } catch (e) {}
    return '本地村庄存档摘要：\n' +
      '  大本营：' + th + ' 级 · 夜世界大本：' + bh + ' 级\n' +
      '  建筑：' + buildings + ' · 兵种：' + troops + ' · 英雄：' + heroes + ' · 法术：' + spells + (pets ? ' · 战宠：' + pets : '') + (equips ? ' · 装备：' + equips : '') + '\n' +
      '  保存时间：' + (sv.ts ? new Date(sv.ts).toLocaleString('zh-CN') : '未知') + '\n\n' +
      '提示：coc-data json 输出原始村庄 JSON；coc-data save <JSON> 保存存档；coc-data clear 清除；coc-game 查询游戏静态数据。';
  },
  /* ===== COC 游戏静态数据查询（coc-game）===== */
  // coc-game：查询游戏静态数据（兵种/建筑/法术等）；coc-game json 输出原始 JSON（约 2MB）
  'coc-game': async (r) => {
    if (!r) return cocDataOverview();
    const { sub, args } = splitSub(r);
    if (sub === 'search') return cocDataSearch(args);
    if (sub === 'th' || sub === 'townhall') return cocDataByTH(args);
    if (sub === 'count' || sub === 'stats') return cocDataCount();
    if (sub === 'cat' || sub === 'category') return cocDataByCategory(args);
    if (sub === 'json' || sub === 'raw') { const d = await fetchCocData(); return JSON.stringify(d, null, 2); }
    if (sub === 'help' || sub === '?') {
      return 'coc-game 用法：\n' +
        '  coc-game                  游戏数据概览（版本/总数/分类统计+前若干单位）\n' +
        '  coc-game search 名字      按中文或英文名搜索单位详情\n' +
        '  coc-game th 大本等级      列出某大本营等级可解锁的单位\n' +
        '  coc-game cat 类别名       列出某类别（圣水兵/暗黑兵/法术/英雄/建筑/陷阱等）下单位\n' +
        '  coc-game count            分类统计\n' +
        '  coc-game json             输出原始游戏 JSON（约 2MB）';
    }
    throw new Error('未知子命令：' + sub + '（coc-game help 查看用法）');
  },

  /* ===== 背单词（tz-words）===== */
  // words：默认输出单词本 JSON；带子命令时执行单词本操作
  words: (r) => {
    if (!r) return wordsExport();
    const { sub, args } = splitSub(r);
    if (sub === 'add') return wordsAdd(args);
    if (sub === 'list') return wordsList(args);
    if (sub === 'count') return wordsCount();
    if (sub === 'find' || sub === 'search') return wordsFind(args);
    if (sub === 'del' || sub === 'rm') return wordsDel(args);
    if (sub === 'help' || sub === '?') {
      return 'words 用法：\n' +
        '  words                     输出当前单词本 JSON（同源读取本地 IndexedDB 词库）\n' +
        '  words add 单词|词性|释义[|例句]  添加单词；释义用 / 分隔，例句用 英文::中文、多个例句用 || 分隔\n' +
        '      例：words add hypothesis|n.|假设/猜想|This is a hypothesis::这是一个假设\n' +
        '  words list [N]            列出前 N 个单词（默认 20）\n' +
        '  words count               统计单词总数\n' +
        '  words find 关键词         按单词或释义查找\n' +
        '  words del 编号            删除指定编号的单词（编号见 words list）';
    }
    throw new Error('未知子命令：' + sub + '（words help 查看用法）');
  },

  /* ===== 笔记（Markdown / LaTeX）===== */
  // note：无参数打开应用；子命令完成增删查改，数据与笔记应用同源（IndexedDB tznotes）
  // 编号规则：每篇笔记创建时分配一个永不改变的固定编号 no（最早创建的为 1，后续递增），便于 CLI 长期引用。
  note: async (r) => {
    if (!r) { launchApp('notes'); return '已打开笔记（note help 查看命令用法）' + floatTip('笔记'); }
    const { sub, args } = splitSub(r);
    if (sub === 'help' || sub === '?') {
      return 'note 用法：\n' +
        '  note                      打开笔记应用\n' +
        '  note list                 列出全部笔记（编号 标题 · 字数 · 更新时间）\n' +
        '  note new 标题             新建笔记（输出包含分配的固定编号）\n' +
        '  note open 编号|标题       在应用中打开某篇笔记\n' +
        '  note view 编号|标题       查看笔记完整 Markdown 内容\n' +
        '  note edit 编号 文本       整体替换笔记内容（文本中 \\n 表示换行）\n' +
        '  note append 编号 文本     向笔记末尾追加（文本中 \\n 表示换行）\n' +
        '  note export 编号          输出笔记完整 Markdown 原文（与 view 同义）\n' +
        '  note search 关键词        在标题与正文中搜索\n' +
        '  note undo                 撤销最近一次改动（new/edit/append/del，可连续撤销）\n' +
        '  note del 编号             删除笔记';
    }
    if (sub === 'list') {
      const ns = await notesLoad();
      return ns.length
        ? ns.map((n) => n.no + '. ' + (n.title || '未命名') + '（' + (n.content || '').length + ' 字 · ' + new Date(n.updated || 0).toLocaleString('zh-CN') + '）').join('\n')
        : '（暂无笔记，note new 标题 新建）';
    }
    if (sub === 'new') {
      need(args, 'note new 标题');
      const ns = await notesLoad();
      const no = notesNextNo(ns);
      notesSnapshot(ns);
      ns.unshift({ id: 'n' + Date.now(), no: no, title: args, content: '', updated: Date.now() });
      await notesSave(ns);
      refreshOpenApp('notes');
      RPG.gain('note'); // v3.5 积分：新建笔记 +5（每日上限 15）
      return '已新建笔记：' + args + '（编号' + no + '）';
    }
    if (sub === 'open') {
      need(args, 'note open 编号|标题');
      const ns = await notesLoad();
      const n = pickNote(ns, args);
      if (!n) throw new Error('找不到笔记：' + args + '（note list 查看编号）');
      notesPendingOpen = n.id;
      launchApp('notes');
      refreshOpenApp('notes');
      return '已打开笔记：' + (n.title || '未命名') + '（编号' + n.no + '）' + floatTip('笔记');
    }
    if (sub === 'view' || sub === 'show') {
      need(args, 'note view 编号|标题');
      const ns = await notesLoad();
      const n = pickNote(ns, args);
      if (!n) throw new Error('找不到笔记：' + args + '（note list 查看编号）');
      return '# ' + (n.title || '未命名') + '\n\n' + (n.content || '（空笔记）');
    }
    if (sub === 'edit' || sub === 'set' || sub === 'write') {
      need(args, 'note edit 编号 文本');
      const sp2 = args.indexOf(' ');
      if (sp2 < 0) throw new Error('用法：note edit 编号 文本');
      const ref = args.slice(0, sp2), text = args.slice(sp2 + 1).replace(/\\n/g, '\n');
      const ns = await notesLoad();
      const n = pickNote(ns, ref);
      if (!n) throw new Error('找不到笔记：' + ref + '（note list 查看编号）');
      notesSnapshot(ns);
      n.content = text;
      n.updated = Date.now();
      await notesSave(ns);
      refreshOpenApp('notes');
      return '已整体替换「' + (n.title || '未命名') + '」（编号' + n.no + '，现共 ' + n.content.length + ' 字）';
    }
    if (sub === 'append') {
      need(args, 'note append 编号 文本');
      const sp2 = args.indexOf(' ');
      if (sp2 < 0) throw new Error('用法：note append 编号 文本');
      const ref = args.slice(0, sp2), text = args.slice(sp2 + 1).replace(/\\n/g, '\n');
      const ns = await notesLoad();
      const n = pickNote(ns, ref);
      if (!n) throw new Error('找不到笔记：' + ref + '（note list 查看编号）');
      notesSnapshot(ns);
      n.content = (n.content ? n.content.replace(/\s+$/, '') + '\n' : '') + text + '\n';
      n.updated = Date.now();
      await notesSave(ns);
      refreshOpenApp('notes');
      return '已追加到「' + (n.title || '未命名') + '」（编号' + n.no + '，现共 ' + n.content.length + ' 字）';
    }
    if (sub === 'export' || sub === 'cat') {
      need(args, 'note export 编号|标题');
      const ns = await notesLoad();
      const n = pickNote(ns, args);
      if (!n) throw new Error('找不到笔记：' + args);
      return '# ' + (n.title || '未命名') + '\n\n' + (n.content || '（空笔记）');
    }
    if (sub === 'search' || sub === 'find') {
      need(args, 'note search 关键词');
      const ns = await notesLoad();
      const hits = ns.filter(n => (n.title || '').includes(args) || (n.content || '').includes(args));
      if (!hits.length) return '没有找到包含「' + args + '」的笔记';
      return hits.map(n => {
        const ci = (n.content || '').indexOf(args);
        const ctx = ci >= 0 ? '：…' + n.content.slice(Math.max(0, ci - 12), ci + args.length + 24).replace(/\n/g, ' ') + '…' : '';
        return n.no + '. ' + (n.title || '未命名') + ctx;
      }).join('\n');
    }
    if (sub === 'undo') {
      const prev = notesUndoStack.pop();
      if (!prev) return '（无可撤销的改动）';
      await notesSave(prev);
      refreshOpenApp('notes');
      return '已撤销上一次改动（剩余可撤销次数：' + notesUndoStack.length + '）';
    }
    if (sub === 'del' || sub === 'rm') {
      need(args, 'note del 编号|标题');
      const ns = await notesLoad();
      const n = pickNote(ns, args);
      if (!n) throw new Error('找不到笔记：' + args);
      notesSnapshot(ns);
      await notesSave(ns.filter(x => x.id !== n.id));
      refreshOpenApp('notes');
      return '已删除笔记：' + (n.title || '未命名') + '（编号' + n.no + '）';
    }
    throw new Error('未知子命令：' + sub + '（note help 查看用法）');
  },

  /* ===== AI 对话（ai-chat）===== */
  chat: (r) => {
    if (!r) return 'chat 用法：\n  chat clear  清空对话（保留 AI 最后一次回复）\n  chat history  查看对话历史摘要\n  chat last  查看 AI 最后一次回复\n  ask 问题  让 AI 回答（与顶层 ask 等价）';
    const { sub, args } = splitSub(r);
    if (sub === 'clear') {
      const id = Store.getActiveChatId();
      Store.setChat([], id);
      Store.updateChatMeta(id, { title: '新对话', aiNamed: false, nameState: 'idle' });
      Store.setChatCtxReal(null, id);
      refreshChatView();
      return '当前 AI 对话历史已清空';
    }
    if (sub === 'history') {
      const h = Store.getChat();
      if (!h.length) return '（暂无对话历史）';
      return h.map((m, i) => (i + 1) + '. [' + (m.role === 'ai' ? 'AI' : '用户') + '] ' + (String(m.content || '').slice(0, 60).replace(/\n/g, ' ') || '(空)')).join('\n');
    }
    if (sub === 'last') {
      const h = Store.getChat();
      const last = [...h].reverse().find(m => m.role === 'ai');
      return last ? String(last.content || '') : '（暂无 AI 回复）';
    }
    throw new Error('未知子命令：' + sub + '（chat help 查看用法）');
  },

  /* ===== 软件商城（app-store）===== */
  store: (r) => {
    if (!r) return 'store 用法：\n  store open  打开软件商城\n  store tutorial  获取软件生成教程（与 installhelp 等价）\n  store idea  获取软件创意建议';
    const { sub } = splitSub(r);
    if (sub === 'open') { launchApp('app-store'); return '已打开软件商城' + floatTip('软件商城'); }
    if (sub === 'tutorial') return APP_STORE_TUTORIAL;
    if (sub === 'idea') return '软件创意建议：\n1. 番茄钟（25 分钟工作 + 5 分钟休息循环，统计今日专注时长）\n2. 待办清单（按优先级分组，支持截止日期与提醒）\n3. 习惯打卡（每日习惯勾选 + 连续天数 streak 统计）\n4. 单位换算（长度/重量/温度/压力等，支持科学计数法）\n5. 密码生成器（自定义长度/字符集，避免易混字符）\n6. 倒计时日历（距离重要日期还有多少天，桌面图标徽章）\n7. 调色板（HSL 滑块 + HEX/RGB 互转，保存历史颜色）\n8. 二维码生成（输入文本/网址，下载 PNG）\n\n打开软件商城用自然语言描述即可生成（Markdown/LaTeX 笔记已内置为系统应用「笔记」，无需再生成）。';
    throw new Error('未知子命令：' + sub);
  },

  /* ===== 系统设置（settings）===== */
  settings: (r) => {
    if (!r) return 'settings 用法：\n  settings info  系统信息摘要\n  settings storage  存储 usage\n  settings reset  重置桌面布局（与 resetlayout 等价）';
    const { sub } = splitSub(r);
    if (sub === 'info') {
      const c = Store.getAIConfig();
      return '系统：天择OS v' + OS_VERSION + '（' + (isMobile() ? '移动端' : '桌面端') + '）\n' +
        '主题：' + (Store.getTheme() || 'dark') + ' · 风格：' + (Store.getStyle() || 'auto') + '\n' +
        'AI 模型：' + (c.model || '（未配置）') + '\n' +
        '已安装软件：' + Store.getApps().length + ' 个 · 已开窗口：' + WM.windows.length + ' 个\n' +
        '记忆条数：' + Mem.list().length + ' 条';
    }
    if (sub === 'storage') {
      let ls = 0;
      for (let i = 0; i < localStorage.length; i++) { try { ls += (localStorage.getItem(localStorage.key(i)) || '').length; } catch (e) {} }
      return 'localStorage：约 ' + (ls / 1024).toFixed(1) + ' KB（' + localStorage.length + ' 个键）\n' +
        '已安装软件数：' + Store.getApps().length + '\n' +
        '提示：浏览器 localStorage 通常有 5-10 MB 上限；词库与文档等大块数据存 IndexedDB，不占 localStorage。';
    }
    if (sub === 'reset') { Store.clearIconPositions(); Desktop.render(); return '桌面图标布局已重置'; }
    throw new Error('未知子命令：' + sub);
  },

  /* ===== 关于（about）===== */
  about: (r) => {
    if (!r) return 'about 用法：\n  about info  系统详细信息\n  about changelog  查看更新日志\n  about credits  致谢';
    const { sub } = splitSub(r);
    if (sub === 'info') return '天择OS v' + OS_VERSION + '\n发布日期：2026-08-01\n版本代号：Evolution Shell\n作者：天择网\n构建：浏览器内操作系统（Web + Electron 桌面版）\n视觉：简洁系统壁纸、专区专属背景与统一图片图标图集\nAI：OpenAI 兼容接口（DeepSeek/OpenAI/GLM/MiMo 等）\n开源：https://wjtianze.github.io/open/';
    if (sub === 'changelog') return 'v4.1（2026-08-01）：主页与OS背景简化；各专区启用标志性专属背景；移动端与首页一屏树状导航完成适配；AI 对话支持归档、查看、还原与永久删除，归档内容仍进入知识库；命令行升级为统一注册中心并支持桌面 PowerShell/CMD；ask 为纯 API 问答，agent 为可调用命令的子智能体，二者均可被主 AI 和应用调用；取消 Agent 次数/轮数硬限制，改用无进展循环检测；应用 AI 调用加入实时滥用监管；新增 Token 用量与计费账本\nv4.0（2026-07-31）：Evolution Shell 全面重构；新增顶部态势线与系统轨道；冷/中/暖三套生成式星图壁纸、图片按钮与表面材质；统一 8×8 图片图标图集并兼容旧 installedApps emoji 数据；网页与独立 AI 悬浮窗视觉同步；独立悬浮窗可通过代理执行主桌面 Agent 命令\nv3.5（2026-07-25）：用户等级与积分（加密存储、随存档迁移）、冷/中/暖配色皮肤（OS 内积分解锁，天择网全免费）、AI 对话工具栏联网与命令行开关、纯文本模型图片 OCR 与文本文件直读、软件可调用系统命令行（TZOS_CMD.exec）、修复上下文用量刷新后缩水\nv3.2（2026-07-24）：笔记编号固定化 + view/edit/undo、COC 伤害自定义闪震、官网版本探测修复、悬浮窗命令修复\nv3.1.1（2026-07-23）：修复 AI 软件命令包注册失效、新增命令行笔记应用、文档阅读器标签并入标题栏、命令行输入输出取消字符限制、AI 提示词补全\nv3.1（2026-07-22）：实用工具全面本地化、AI 对话与悬浮窗互通、命令行重构\nv3.0（2026-07-21）：AI 悬浮窗（Ctrl+1）、窗口层级体系、桌面版自定义协议\nv2.6（2026-07-20）：窗口置顶、文档缩放、命令行扩展\nv2.5（2026-07-20）：联网搜索、文件上传、命令行全面开放\nv2.2（2026-07-19）：桌面版四大痛点修复\nv2.1（2026-07-18）：命令行终端与 AI Agent\nv2.0（2026-07-18）：AI 全链路升级\nv1.0（2026-07-14）：首个版本发布';
    if (sub === 'credits') return '天择OS 致谢：\n· DeepSeek / OpenAI / GLM / MiMo 等 AI 服务商\n· Electron 跨平台桌面框架\n· 所有开源项目（marked/highlight.js/pdf.js 等）\n· 天择网用户的支持与反馈';
    throw new Error('未知子命令：' + sub);
  },

  /* ===== 我的软件（file-manager）===== */
  files: (r) => {
    if (!r) return 'files 用法：\n  files list  列出已安装软件\n  files export 应用id  导出某软件 HTML 代码\n  files size  各软件 HTML 大小';
    const { sub, args } = splitSub(r);
    const apps = Store.getApps();
    if (sub === 'list') {
      if (!apps.length) return '（暂无已安装软件，可用 store open 打开软件商城生成）';
      return apps.map((a, i) => (i + 1) + '. ' + a.id + '  ' + a.name + '  ' + (a.icon || '📦') + '  ' + (a.html ? a.html.length + ' 字符' : '')).join('\n');
    }
    if (sub === 'export') {
      need(args, 'files export 应用id');
      const a = apps.find(x => x.id === args);
      if (!a) throw new Error('未找到已安装软件：' + args);
      return '「' + a.name + '」HTML 代码（' + (a.html || '').length + ' 字符）：\n' + (a.html || '');
    }
    if (sub === 'size') {
      if (!apps.length) return '（暂无已安装软件）';
      const sorted = apps.map(a => ({ id: a.id, name: a.name, size: (a.html || '').length })).sort((a, b) => b.size - a.size);
      const total = sorted.reduce((s, x) => s + x.size, 0);
      return sorted.map(x => x.name + '：' + (x.size / 1024).toFixed(1) + ' KB').join('\n') + '\n合计：' + (total / 1024).toFixed(1) + ' KB';
    }
    throw new Error('未知子命令：' + sub);
  },

  /* ===== 浏览器（browser）===== */
  browser: (r) => {
    if (!r) return 'browser 用法：\n  browser tabs  列出当前标签页\n  browser closeall  关闭所有标签页\n  browser home  打开天择网主页\n  openurl 网址  打开任意网址（顶层命令）';
    const { sub } = splitSub(r);
    if (sub === 'tabs') {
      const w = WM.findWindow('browser');
      if (!w) return '（浏览器未打开）';
      const frames = w.el.querySelectorAll('iframe');
      if (!frames.length) return '（无标签页）';
      let out = ''; let i = 0;
      frames.forEach((f, idx) => {
        let href = f.src || '';
        try { if (f.contentWindow) href = f.contentWindow.location.href; } catch (e) {}
        out += (idx + 1) + '. ' + href.slice(0, 80) + '\n';
      });
      return out.trim() || '（无标签页）';
    }
    if (sub === 'closeall') {
      const w = WM.findWindow('browser');
      if (!w) return '（浏览器未打开）';
      const frames = w.el.querySelectorAll('iframe');
      if (!frames.length) return '（无标签页可关闭）';
      // 通过触发 browser 应用的关闭全部标签函数（如暴露了的话）
      try { if (window.__tzBrCloseAll) { window.__tzBrCloseAll(); return '已关闭全部 ' + frames.length + ' 个标签页'; } } catch (e) {}
      return '已尝试关闭标签页（如未生效，请在浏览器内手动关闭）';
    }
    if (sub === 'home') { openInOsBrowser(TZNET_BASE + 'index.html'); return '已打开天择网主页' + floatTip('浏览器'); }
    throw new Error('未知子命令：' + sub);
  },

  /* ===== 玩机技巧（tips）===== */
  tips: (r) => {
    const all = [
      { t: '窗口置顶', d: '标题栏图钉、右键菜单、任务栏右键、命令行 pin/top 均可置顶窗口。置顶窗口始终在最上层（但低于任务栏与开始菜单）。' },
      { t: 'AI 命令行模式', d: '系统设置中开启 Agent 模式后，AI 会自动写 tzcli 代码块执行系统命令，如安装软件、写记忆、改配置。' },
      { t: '深度思考', d: 'AI 对话工具栏灯泡按钮开启深度思考，AI 会先展示推理过程再给答案；适合数学、编程、推理题。' },
      { t: '授权截图', d: '对话工具栏可读取你在浏览器共享选择器中明确授权的标签页、窗口或屏幕；视觉模型读图，文本模型在本地 OCR。' },
      { t: '软件命令包', d: '用户安装的 AI 软件可注册命令包，用 cmd 应用id 指令 调用；自有软件直接用顶层命令（如 coc-data、words）。' },
      { t: '全屏切换', d: 'Ctrl+Q 切换浏览器全屏模式，适合沉浸式使用天择OS。' },
      { t: '开始菜单', d: 'Ctrl+空格 快速打开/关闭开始菜单；左下角开始按钮也可。' },
      { t: '历史命令', d: '终端中按 ↑/↓ 翻阅历史命令，Enter 执行。' },
      { t: 'AI 对话工作区', d: 'AI 对话使用单一工作区；重复打开会聚焦已有窗口，避免共享历史与附件状态错位。' },
      { t: '存档导出', d: '命令行输入 export 导出全量存档（含软件、记忆、配置）；可在另一台设备导入恢复。' }
    ];
    if (!r) return '玩机技巧（输入 tips 编号 查看详情）：\n' + all.map((x, i) => (i + 1) + '. ' + x.t).join('\n');
    const n = parseInt(r, 10);
    if (n >= 1 && n <= all.length) return all[n - 1].t + '\n' + all[n - 1].d;
    throw new Error('编号无效（1-' + all.length + '）');
  },

  /* ===== 天择导航（tz-tree）===== */
  tree: (r) => {
    const cats = {
      'tznet': '天择网（首页+天择导航）',
      'tool': '实用工具（COC 专区（含存档分析）/升级规划/伤害计算/背单词/笔记）',
      'system': '系统（AI 配置/对话/软件商城/设置/关于/我的软件/浏览器/命令行/时钟/文档阅读器/玩机技巧/导航）',
      'ai': 'AI（AI 配置、AI 对话）',
      'game': '游戏（绩点战争）',
      'emu': '模拟器（Windows 11/Windows 10/安卓）'
    };
    if (!r) return '天择导航分类：\n' + Object.entries(cats).map(([k, v]) => '  ' + k + ' → ' + v).join('\n') + '\n\n输入 tree 分类名 查看该分类下应用';
    const c = r.toLowerCase();
    if (!cats[c]) throw new Error('未知分类：' + c + '（' + Object.keys(cats).join('/') + '）');
    const apps = getAllApps().filter(a => (a.category || 'installed') === c);
    if (!apps.length) return '（该分类下无应用）';
    return '「' + c + '」分类下应用：\n' + apps.map(a => '  ' + a.id + '  ' + a.name + '  ' + a.desc).join('\n');
  },

  /* ===== 文档阅读器（doc-reader）===== */
  docs: (r) => {
    if (!r) return 'docs 用法：\n  docs open URL  在文档阅读器中打开在线文档（pdf/docx/pptx/xlsx/html/md）\n  docs recent  列出最近打开记录';
    const { sub, args } = splitSub(r);
    if (sub === 'open') {
      need(args, 'docs open URL');
      const w = launchApp('doc-reader');
      setTimeout(() => { try { if (window.__tzDocOpenUrl) window.__tzDocOpenUrl(args); } catch (e) {} }, 200);
      return '正在文档阅读器中打开：' + args;
    }
    if (sub === 'recent') {
      let recent = [];
      try { recent = JSON.parse(localStorage.getItem('tz_doc_recent') || '[]'); } catch (e) {}
      if (!recent.length) return '（暂无最近打开记录）';
      return recent.slice(0, 10).map((x, i) => (i + 1) + '. ' + (x.name || x.url || String(x))).join('\n');
    }
    throw new Error('未知子命令：' + sub);
  },

  /* ===== 天择网主页（tz-home）===== */
  home: (r) => {
    if (!r) return 'home 用法：\n  home sections  主页板块列表\n  home open 板块名  打开某板块（如 news/blog/coc/game/english/os）';
    const { sub, args } = splitSub(r);
    if (sub === 'sections') return '天择网主页板块：\n  news 新闻\n  blog 博客\n  open 数据开源\n  ai AI 专区\n  coc COC 专区\n  game 游戏专区\n  english 英语专区\n  os 天择OS';
    if (sub === 'open') {
      need(args, 'home open 板块名');
      const map = { news: 'news/index.html', blog: 'blog/index.html', open: 'open/index.html', ai: 'ai/index.html', coc: 'coc/index.html', game: 'game/index.html', english: 'english/index.html', os: 'os/index.html' };
      const path = map[args.toLowerCase()];
      if (!path) throw new Error('未知板块：' + args + '（home sections 查看全部）');
      openInOsBrowser(TZNET_BASE + path);
      return '已打开：' + args;
    }
    throw new Error('未知子命令：' + sub);
  },

  /* ===== 新闻（tz-news）===== */
  news: async (r) => {
    if (!r) {
      try {
        const res = await fetch(TZNET_BASE + 'news/index.html');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const html = await res.text();
        // 简单提取新闻列表（h3 标题）
        const titles = [];
        const re = /<h3>([^<]+)<\/h3>/g; let m;
        while ((m = re.exec(html)) && titles.length < 12) titles.push(m[1].trim());
        if (!titles.length) return '（未能解析新闻列表，请直接打开新闻页查看）';
        return '最新新闻（输入 news 编号 打开）：\n' + titles.map((t, i) => (i + 1) + '. ' + t).join('\n');
      } catch (e) { return '新闻加载失败：' + (e.message || e) + '\n（可直接 open tz-news 打开新闻应用）'; }
    }
    const n = parseInt(r, 10);
    if (n >= 1 && n <= 20) {
      openInOsBrowser(TZNET_BASE + 'news/' + n + '/index.html');
      return '已打开第 ' + n + ' 条新闻';
    }
    throw new Error('编号无效（1-20）');
  },

  /* ===== 博客（tz-blog）===== */
  blog: async (r) => {
    if (!r) {
      try {
        const res = await fetch(TZNET_BASE + 'blog/index.html');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const html = await res.text();
        const titles = [];
        const re = /<h3[^>]*>([^<]+)<\/h3>/g; let m;
        while ((m = re.exec(html)) && titles.length < 12) titles.push(m[1].trim());
        if (!titles.length) return '（未能解析博客列表，请直接打开博客页查看）';
        return '最新博客（输入 blog 编号 打开）：\n' + titles.map((t, i) => (i + 1) + '. ' + t).join('\n');
      } catch (e) { return '博客加载失败：' + (e.message || e); }
    }
    const n = parseInt(r, 10);
    if (n >= 1) {
      openInOsBrowser(TZNET_BASE + 'blog/' + n + '/index.html');
      return '已打开第 ' + n + ' 篇博客';
    }
    throw new Error('编号无效');
  },

  /* ===== 数据开源（tz-open）===== */
  'open-data': (r) => {
    if (!r) return 'open-data 用法：\n  open-data list  列出开源数据集\n  open-data open  打开数据开源主页';
    const { sub } = splitSub(r);
    if (sub === 'list') return '天择网开源数据集：\n  · COC 完整游戏数据（v18.400.9，272 个单位，coc-game json 输出）\n  · COC 单位中文介绍与等级数据\n  · 单词本示例（sample-vocab.json）\n  · GRE 词汇表（gre-vocab.json）\n  · 天择OS 源代码\n\n输入 open-data open 打开主页查看全部';
    if (sub === 'open') { openInOsBrowser(TZNET_BASE + 'open/index.html'); return '已打开数据开源主页'; }
    throw new Error('未知子命令：' + sub);
  },

  /* ===== AI 专区（tz-ai）===== */
  'ai-zone': (r) => {
    if (!r) return 'ai-zone 用法：\n  ai-zone list  列出 AI 工具\n  ai-zone open  打开 AI 专区主页';
    const { sub } = splitSub(r);
    if (sub === 'list') return '天择网 AI 工具：\n  · AI 对话（天择OS 内置）\n  · 软件商城（自然语言生成软件）\n  · AI 命令行模式（Agent）\n  · 相对论演示（relativity-demo）\n  · AI 记忆系统\n\n输入 ai-zone open 打开 AI 专区';
    if (sub === 'open') { openInOsBrowser(TZNET_BASE + 'ai/index.html'); return '已打开 AI 专区'; }
    throw new Error('未知子命令：' + sub);
  },

  /* ===== COC 专区（tz-coc）===== */
  coc: (r) => {
    if (!r) return 'coc 用法：\n  coc list  COC 专区板块列表\n  coc open  打开 COC 专区（含村庄存档分析）';
    const { sub } = splitSub(r);
    if (sub === 'list') return 'COC 专区板块：\n  · 村庄存档分析（COC 专区首页，命令 coc-data 读写本地存档）\n  · 数据查询（命令 coc-game）\n  · tz-coc-planner 升级规划（命令 planner）\n  · tz-coc-dmg 伤害计算（命令 dmg）';
    if (sub === 'open') { launchApp('tz-coc'); return '已打开 COC 专区（含村庄存档分析）'; }
    throw new Error('未知子命令：' + sub);
  },

  /* ===== 村庄存档分析（已并入 COC 专区首页）===== */
  village: (r) => {
    if (!r) return 'village 用法：\n  village info  功能介绍\n  village open  打开村庄存档分析（COC 专区首页）';
    const { sub } = splitSub(r);
    if (sub === 'info') return '村庄存档分析已并入 COC 专区首页：粘贴村庄 JSON，自动解析并按家乡/夜世界分类展示，计算剩余升级时间（含墙钟时间）。存档保存在本地，升级规划器与伤害计算器可直接读取。';
    if (sub === 'open') { launchApp('tz-coc'); return '已打开 COC 专区（含村庄存档分析）'; }
    throw new Error('未知子命令：' + sub);
  },

  /* ===== 升级规划（tz-coc-planner）===== */
  planner: (r) => {
    if (!r) return 'planner 用法：\n  planner info  功能介绍\n  planner open  打开升级规划';
    const { sub } = splitSub(r);
    if (sub === 'info') return '升级规划器：读取 COC 专区首页解析好的村庄存档，按单级拆分自动规划升级顺序（甘特图排程，稳本/速本两种模式，含前置依赖）。';
    if (sub === 'open') { launchApp('tz-coc-planner'); return '已打开升级规划'; }
    throw new Error('未知子命令：' + sub);
  },

  /* ===== 伤害计算（tz-coc-dmg）===== */
  dmg: (r) => {
    if (!r) return 'dmg 用法：\n  dmg info  功能介绍\n  dmg quake 城墙HP [地震等级]  计算地震法术对城墙的伤害\n  dmg open  打开伤害计算器';
    const { sub, args } = splitSub(r);
    if (sub === 'info') return '伤害计算器：基于雷电、地震法术与英雄装备技能伤害数据，计算给定法术空间内的最高伤害、摧毁建筑所需最少法术。支持从村庄存档（COC 专区首页解析）一键导入等级。';
    if (sub === 'open') { launchApp('tz-coc-dmg'); return '已打开伤害计算器'; }
    if (sub === 'quake') {
      // 城墙规则（见 MEMORY）：3 瓶地震不毁任意 HP 城墙，4 瓶必毁
      const p = args.split(/\s+/).map(s => s.trim()).filter(Boolean);
      if (!p.length) throw new Error('用法：dmg quake 城墙HP [地震等级]');
      const hp = parseInt(p[0], 10); if (!(hp > 0)) throw new Error('城墙 HP 必须是正整数');
      const lvl = p[1] ? parseInt(p[1], 10) : 4; if (!(lvl >= 1 && lvl <= 5)) throw new Error('地震等级 1-5');
      // 地震法术对城墙有特殊倍率（约 14x），单瓶伤害 = 0.14 * HP 大致（实际公式较复杂）
      // 简化：直接套用城墙规则
      return '城墙 HP=' + hp + '，地震法术等级=' + lvl + '\n' +
        '· 1 瓶地震：城墙受损但不会摧毁\n' +
        '· 3 瓶地震：城墙剩余 HP > 0，依然存活（v18 规则：3 瓶不毁任意 HP 城墙）\n' +
        '· 4 瓶地震：城墙必毁（v18 规则：4 瓶必毁任意 HP 城墙）\n' +
        '结论：摧毁该城墙需要 4 瓶地震法术。\n' +
        '（详细单瓶伤害与建筑工人小屋回血容错请用 dmg open 打开计算器）';
    }
    throw new Error('未知子命令：' + sub);
  },

  /* ===== 游戏专区（tz-game）===== */
  game: (r) => {
    if (!r) return 'game 用法：\n  game list  列出游戏\n  game open  打开游戏专区';
    const { sub } = splitSub(r);
    if (sub === 'list') return '天择网游戏：\n  · tz-gpa 绩点战争（卡牌对战）\n\n输入 game open 打开游戏专区';
    if (sub === 'open') { openInOsBrowser(TZNET_BASE + 'game/index.html'); return '已打开游戏专区'; }
    throw new Error('未知子命令：' + sub);
  },

  /* ===== 绩点战争（tz-gpa）===== */
  gpa: (r) => {
    if (!r) return 'gpa 用法：\n  gpa info  游戏介绍\n  gpa open  打开游戏\n  gpa rules  查看规则要点';
    const { sub } = splitSub(r);
    if (sub === 'info') return '绩点战争：天择网原创卡牌对战游戏。玩家用学科卡牌（高数/线代/物理等）对战，每张卡有攻击/防御/技能属性，目标是把对手血量打到 0。';
    if (sub === 'open') { openInOsBrowser(TZNET_BASE + 'game/gpa-card/index.html'); return '已打开绩点战争'; }
    if (sub === 'rules') return '绩点战争规则要点：\n· 双方各 30 HP，从手牌出卡\n· 每回合获得法力值，法力值随回合递增\n· 卡牌分攻击/法术/装备三类\n· 攻击卡直接造成伤害，可被对方防御卡抵挡\n· 法术卡触发特殊效果（抽牌/治疗/减费等）\n· 装备卡持续生效直到被破坏\n\n详细规则与卡牌数据请打开游戏查看。';
    throw new Error('未知子命令：' + sub);
  },

  /* ===== 英语专区（tz-en）===== */
  english: (r) => {
    if (!r) return 'english 用法：\n  english list  列出英语工具\n  english open  打开英语专区';
    const { sub } = splitSub(r);
    if (sub === 'list') return '英语学习工具：\n  · tz-words 背单词（命令 words）\n\n输入 english open 打开英语专区';
    if (sub === 'open') { openInOsBrowser(TZNET_BASE + 'english/index.html'); return '已打开英语专区'; }
    throw new Error('未知子命令：' + sub);
  },

  /* ===== 模拟器 ===== */
  'emu-win': (r) => {
    if (!r) return 'emu-win 用法：\n  emu-win info  介绍\n  emu-win open  打开 Windows 11 模拟器';
    const { sub } = splitSub(r);
    if (sub === 'info') return 'Windows 11 模拟器（Win11React 开源项目）：浏览器内的高仿真 Windows 11 桌面，包含开始菜单、设置、Edge 浏览器、商店等。仅界面模拟，非真实系统。';
    if (sub === 'open') { launchApp('emu-win'); return '已打开 Windows 11 模拟器'; }
    throw new Error('未知子命令：' + sub);
  },
  'emu-win10': (r) => {
    if (!r) return 'emu-win10 用法：\n  emu-win10 info  介绍\n  emu-win10 open  打开 Windows 10 模拟器';
    const { sub } = splitSub(r);
    if (sub === 'info') return 'Windows 10 模拟器（daedalOS 开源项目）：浏览器内的 Win10 风格功能桌面，包含文件管理、终端、编辑器等。仅界面模拟。';
    if (sub === 'open') { launchApp('emu-win10'); return '已打开 Windows 10 模拟器'; }
    throw new Error('未知子命令：' + sub);
  },
  'emu-android': (r) => {
    if (!r) return 'emu-android 用法：\n  emu-android info  介绍\n  emu-android open  打开安卓模拟器';
    const { sub } = splitSub(r);
    if (sub === 'info') return '安卓模拟器（MobileGym，中科院开源）：浏览器内的现代安卓仿真环境，预装 28 个应用，含通知栏/设置/相册等。仅界面模拟。';
    if (sub === 'open') { launchApp('emu-android'); return '已打开安卓模拟器'; }
    throw new Error('未知子命令：' + sub);
  },

  /* ===== 时钟（clock）扩展子命令 ===== */
  // 顶层已有 clock/stopwatch/timer；clock-now 是补充
  'clock-now': () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return '当前时间：' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '（' + ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()] + '）';
  }
};

/* ===== COC 数据命令实现 ===== */
async function cocDataOverview() {
  const data = await fetchCocData();
  const meta = data.meta || {};
  const units = data.units || [];
  // 类别统计
  const catCount = {};
  units.forEach(u => { const c = u.category || '其他'; catCount[c] = (catCount[c] || 0) + 1; });
  const catStr = Object.entries(catCount).map(([k, v]) => k + '：' + v).join(' · ');
  // 前 15 个单位
  const sample = units.slice(0, 15).map((u, i) => (i + 1) + '. ' + u.chineseName + '（' + u.englishName + '）' + u.category + ' · ' + (u.levels ? u.levels.length : (u.levelRows ? u.levelRows.length : '?')) + ' 级').join('\n');
  return '天择 COC 完整数据 · 版本 ' + (meta.version || '?') + '\n' +
    '总单位数：' + (meta.totalUnits || units.length) + ' · 类别：' + catStr + '\n\n' +
    '单位列表（前 15 个，完整列表用 coc-game cat 类别名）：\n' + sample + '\n\n' +
    '提示：coc-game search 名字 查看单位详情；coc-game th 等级 列出某大本营可解锁单位；coc-game json 输出原始 JSON。';
}
async function cocDataSearch(q) {
  need(q, 'coc-game search 名字');
  const data = await fetchCocData();
  const units = data.units || [];
  const ql = q.toLowerCase();
  const hits = units.filter(u => (u.chineseName || '').includes(q) || (u.englishName || '').toLowerCase().includes(ql));
  if (!hits.length) return '未找到匹配「' + q + '」的单位';
  if (hits.length > 5) return '匹配 ' + hits.length + ' 个单位，请缩小范围（前 5 个）：\n' + hits.slice(0, 5).map(u => u.chineseName + '（' + u.englishName + '）').join('\n');
  // 详细输出（前 5 个）
  return hits.map(u => {
    const lv = u.levels || u.levelRows || [];
    let s = '━━━ ' + u.chineseName + '（' + u.englishName + '）━━━\n';
    s += '类别：' + (u.category || '?') + ' · 等级数：' + lv.length + '\n';
    if (u.description) s += '介绍：' + u.description + '\n';
    if (lv.length) {
      const l1 = lv[0]; const lN = lv[lv.length - 1];
      const stat = (l) => {
        const dps = l.DPS || l.dps || l.damagePerSecond;
        const hp = l.Hitpoints || l.hitpoints || l.hp;
        if (dps) return dps + ' DPS';
        if (hp) return hp + ' HP';
        return '?';
      };
      s += '1 级：' + stat(l1);
      if (l1.UpgradeCost) s += ' · 升级花费 ' + l1.UpgradeCost;
      if (l1.requiredTownHallLevel) s += ' · 需大本 ' + l1.requiredTownHallLevel;
      s += '\n';
      if (lv.length > 1) {
        s += (lv.length) + ' 级：' + stat(lN);
        if (lN.UpgradeCost) s += ' · 升级花费 ' + lN.UpgradeCost;
        if (lN.requiredTownHallLevel) s += ' · 需大本 ' + lN.requiredTownHallLevel;
        s += '\n';
      }
    }
    return s.trim();
  }).join('\n\n');
}
async function cocDataByTH(th) {
  need(th, 'coc-game th 大本等级');
  const n = parseInt(th, 10);
  if (!(n >= 1 && n <= 16)) throw new Error('大本等级 1-16');
  const data = await fetchCocData();
  const units = data.units || [];
  const hits = units.filter(u => {
    const lv = u.levels || u.levelRows || [];
    return lv.some(l => (l.requiredTownHallLevel || l.th) === n);
  });
  if (!hits.length) return '（大本 ' + n + ' 级没有可解锁单位）';
  return '大本营 ' + n + ' 级可解锁单位（共 ' + hits.length + ' 个）：\n' + hits.map(u => '  ' + u.chineseName + '（' + u.englishName + '）' + u.category).join('\n');
}
async function cocDataByCategory(cat) {
  need(cat, 'coc-game cat 类别名');
  const data = await fetchCocData();
  const units = data.units || [];
  const hits = units.filter(u => (u.category || '').includes(cat));
  if (!hits.length) return '未找到类别「' + cat + '」（可用：圣水兵/暗黑兵/法术/英雄/建筑/陷阱等）';
  return '类别「' + cat + '」（' + hits.length + ' 个单位）：\n' + hits.map((u, i) => (i + 1) + '. ' + u.chineseName + '（' + u.englishName + '）').join('\n');
}
async function cocDataCount() {
  const data = await fetchCocData();
  const units = data.units || [];
  const catCount = {};
  units.forEach(u => { const c = u.category || '其他'; catCount[c] = (catCount[c] || 0) + 1; });
  return 'COC 数据统计：\n  总单位数：' + units.length + '\n' + Object.entries(catCount).map(([k, v]) => '  ' + k + '：' + v).join('\n');
}

/* ===== 单词本命令实现 ===== */
async function wordsExport() {
  const { words, source } = await readWordsVocab();
  const json = JSON.stringify(words, null, 2);
  return json + (source === 'sample' ? '\n\n（注：当前为示例词库——你还未在背单词应用中创建词库。在背单词应用里添加过单词后，这里会输出你的真实词库。）' : '');
}
async function wordsList(r) {
  const n = r ? parseInt(r, 10) : 20;
  const { words, source } = await readWordsVocab();
  if (!words.length) return '（单词本为空）';
  const list = words.slice(0, n > 0 ? n : 20);
  return '单词本（共 ' + words.length + ' 个' + (source === 'sample' ? '，示例词库' : '') + '，显示前 ' + list.length + ' 个）：\n' +
    list.map((w, i) => (i + 1) + '. ' + (w.word || '?') + ' ' + (w.phonetic || '') + ' ' + (w.pos || '') + ' ' + (Array.isArray(w.meaning) ? w.meaning.join('；') : (w.meaning || ''))).join('\n');
}
async function wordsCount() {
  const { words } = await readWordsVocab();
  return '单词本共 ' + words.length + ' 个单词';
}
async function wordsFind(q) {
  need(q, 'words find 关键词');
  const { words } = await readWordsVocab();
  const ql = q.toLowerCase();
  const hits = words.filter(w => (w.word || '').toLowerCase().includes(ql) || (Array.isArray(w.meaning) ? w.meaning.join(' ') : (w.meaning || '')).includes(q));
  if (!hits.length) return '未找到匹配「' + q + '」的单词';
  return '匹配 ' + hits.length + ' 个：\n' + hits.map(w => '  ' + (w.word || '?') + ' ' + (w.phonetic || '') + ' ' + (w.pos || '') + ' ' + (Array.isArray(w.meaning) ? w.meaning.join('；') : (w.meaning || ''))).join('\n');
}
async function wordsAdd(r) {
  need(r, 'words add word|词性|释义[|例句]');
  const parts = r.split('|').map(s => s.trim());
  if (parts.length < 2) throw new Error('用法：words add 单词|词性|释义[|例句]\n  释义多个用 / 分隔；例句格式 英文::中文，多个例句用 || 分隔\n  例：words add hypothesis|n.|假设/猜想|This is a hypothesis::这是一个假设||Another example::另一个例子');
  const word = parts[0]; const pos = parts[1] || '';
  const meanings = (parts[2] || '').split('/').map(s => s.trim()).filter(Boolean);
  // 例句：第 4 段起，用 || 分隔多个例句，每个例句「英文::中文」
  const examples = [];
  if (parts[3]) {
    parts.slice(3).join('|').split('||').forEach(ex => {
      const m = ex.split('::').map(s => s.trim());
      if (m[0]) examples.push({ en: m[0], zh: m[1] || '' });
    });
  }
  const { words } = await readWordsVocab();
  if (words.some(w => (w.word || '').toLowerCase() === word.toLowerCase())) return '「' + word + '」已在单词本中';
  const item = { word, pos, meaning: meanings.length ? meanings : (parts[2] ? [parts[2]] : ['']) };
  if (examples.length) item.examples = examples;
  words.push(item);
  const ok = await writeWordsVocab(words);
  const exTip = examples.length ? '（含 ' + examples.length + ' 条例句）' : '';
  if (ok) return '已添加单词：' + word + '（' + item.meaning.join('；') + '）' + exTip;
  return '⚠ 未能写入词库（IndexedDB 不可用）。请在背单词应用内手动添加：\n  ' + word + ' ' + pos + ' ' + item.meaning.join('；') + exTip;
}
async function wordsDel(r) {
  need(r, 'words del 编号');
  const n = parseInt(r, 10);
  const { words } = await readWordsVocab();
  if (!(n >= 1 && n <= words.length)) throw new Error('编号无效（1-' + words.length + '）');
  const removed = words.splice(n - 1, 1)[0];
  const ok = await writeWordsVocab(words);
  if (ok) return '已删除：' + (removed.word || '?');
  return '⚠ 未能写入词库（IndexedDB 不可用）。请在背单词应用内手动删除。';
}

/* ===================== 命令行引擎（供终端应用与 AI Agent 调用） ===================== */
const CLI = {
  history: Store.get('cliHistory', []),
  registry: null,
  tasks: null,
  // 执行一行命令，返回 { ok, out } 或 Promise<{ok,out}>（当命令函数返回 Promise 时）
  // opts.byAI=true 表示由 AI 命令行模式触发
  exec(line, opts) {
    line = String(line || '').trim();
    if (!line) return { ok: true, out: '' };
    if (this.registry && !(opts && opts.__legacy)) return this.registry.execute(line, opts || {});
    const sp = line.indexOf(' ');
    const cmd = (sp < 0 ? line : line.slice(0, sp)).toLowerCase();
    const rest = sp < 0 ? '' : line.slice(sp + 1).trim();
    const fn = this.cmds[cmd];
    if (!fn) return { ok: false, out: '未知命令：' + cmd + '（输入 help 查看全部命令）' };
    try {
      const ret = fn(rest, opts || {});
      // 异步命令（fetch / IndexedDB 等）：返回 Promise
      if (ret && typeof ret.then === 'function') {
        return ret.then(v => v && typeof v === 'object' && ('out' in v || 'ok' in v)
          ? { ok: v.ok !== false, out: String(v.out ?? ''), data: v.data, display: v.display || 'text', warnings: v.warnings || [] }
          : ({ ok: true, out: String(v ?? '') }))
                  .catch(e => ({ ok: false, out: '执行出错：' + (e.message || e) }));
      }
      if (ret && typeof ret === 'object' && ('out' in ret || 'ok' in ret)) {
        return { ok: ret.ok !== false, out: String(ret.out ?? ''), data: ret.data, display: ret.display || 'text', warnings: ret.warnings || [] };
      }
      return { ok: true, out: String(ret ?? '') };
    }
    catch (e) { return { ok: false, out: '执行出错：' + (e.message || e) }; }
  },
  start(line, opts) {
    if (!this.tasks) {
      const controller = new AbortController();
      const result = this.exec(line, { ...(opts || {}), signal: controller.signal });
      return { id: 'cli-legacy-' + Date.now(), status: 'running', cancel: () => controller.abort(), promise: Promise.resolve(result) };
    }
    return this.tasks.start(line, opts || {});
  },
  remember(line) {
    const value = String(line || '').trim();
    if (!value) return;
    if (this.history[this.history.length - 1] !== value) this.history.push(value);
    if (this.history.length > 200) this.history.splice(0, this.history.length - 200);
    Store.set('cliHistory', this.history.slice());
  },
  // 完整教程（终端 help 用）
  manual(query) {
    if (this.registry) return this.registry.help(query || '');
    return '天择OS 命令行 · 全部命令\n' +
'── 系统 ──\n' +
'  version                     查看系统版本\n' +
'  theme dark|light            切换深色/浅色主题\n' +
'  style win|mac|auto          切换桌面风格\n' +
'  level [rule|open]           查看等级与积分（rule 规则；open 打开等级与外观应用）\n' +
'  skin [list|use|unlock]      界面配色：查看/切换/积分解锁（冷中暖）\n' +
'  widget open|close           打开/关闭快捷面板\n' +
'  resetlayout                 重置桌面图标布局\n' +
'  export                      导出全量存档\n' +
'  settings info|storage|reset 系统信息/存储/重置布局\n' +
'  about info|changelog|credits 关于/更新日志/致谢\n' +
'── 应用 ──\n' +
'  apps                        列出所有应用（含 id）\n' +
'  open 应用id                 打开应用\n' +
'  close 应用id                关闭应用窗口\n' +
'  pin 应用id                  置顶窗口（也可用 top）\n' +
'  unpin 应用id                取消置顶窗口\n' +
'  pinned                      列出当前置顶窗口\n' +
'  install 名称|图标|HTML       安装新软件（三段以 | 分隔）\n' +
'  uninstall 应用id            卸载 AI 软件\n' +
'  rename 应用id|新名[|图标]    重命名软件\n' +
'  sethtml 应用id|HTML          改写软件代码并热更新\n' +
'  gethtml 应用id              查看软件完整 HTML 代码\n' +
'  files list|export|size      已安装软件列表/导出/大小\n' +
'── AI ──\n' +
'  aiconfig                    查看当前 AI 配置\n' +
'  aiconfig url|key|model|maxtokens 值    修改配置\n' +
'  price                       查看 token 单价\n' +
'  price hit|write|input|output|search 数值  设置单价（每百万 tokens；search 按次）\n' +
'  price unit usd|cny          设置货币单位\n' +
'  deepthink on|off            深度思考开关\n' +
'  agent on|off                AI 命令行模式开关\n' +
'  chat clear|history|last     清空/查看历史/AI最后回复\n' +
'  store open|tutorial|idea    软件商城/教程/创意\n' +
'── 记忆 ──\n' +
'  mem                         列出全部记忆（带编号）\n' +
'  mem add 内容                写入一条记忆\n' +
'  mem del 编号                删除记忆\n' +
'  mem on|off 编号             启用/停用某条记忆\n' +
'── 对话与通知 ──\n' +
'  clear chat                  清空 AI 对话历史（保留 AI 最后一次回复）\n' +
'  clear notifs                清空通知\n' +
'  clear                       清空本终端屏幕\n' +
'  notify 文本                 发送一条系统通知\n' +
'── 浏览器与网页 ──\n' +
'  openurl 网址或搜索词         在内置浏览器打开网页（go 亦可）\n' +
'  browser tabs|closeall|home  浏览器标签页/全关/打开主页\n' +
'  home sections|open 板块     天择网板块列表/打开板块\n' +
'  news [编号]                 最新新闻列表/打开某条\n' +
'  blog [编号]                 最新博客列表/打开某篇\n' +
'  bm                          列出收藏夹\n' +
'  bm add 网址 [| 标题]         收藏网址\n' +
'  bm del 编号                 删除收藏\n' +
'── 时钟（时钟/秒表/倒计时）──\n' +
'  clock                       打开时钟应用\n' +
'  clock-now                   查看当前时间\n' +
'  stopwatch [start|stop|reset] 秒表：开/停/归零（默认打开）\n' +
'  timer 时长                  倒计时，如 timer 5m / timer 90s / timer 1h30m\n' +
'── 天择网专区直达 ──\n' +
'  coc list|open               COC 专区板块/打开专区\n' +
'  coc-data [save <JSON>|json|clear|help]  读写本地玩家村庄存档\n' +
'  coc-game [子命令]           COC 游戏静态数据查询；子命令：\n' +
'    search 名字 | th 等级 | cat 类别 | count | json | help\n' +
'  village info|open           村庄存档分析（COC 首页）介绍/打开\n' +
'  planner info|open           升级规划介绍/打开\n' +
'  dmg info|quake HP [等级]|open 伤害计算/地震规则/打开\n' +
'  game list|open              游戏列表/打开专区\n' +
'  gpa info|open|rules         绩点战争介绍/打开/规则\n' +
'  english list|open           英语工具/打开专区\n' +
'  ai-zone list|open           AI 工具/打开专区\n' +
'  open-data list|open         开源数据集/打开主页\n' +
'  tree [分类]                 天择导航分类/分类下应用\n' +
'── 单词本（背单词）──\n' +
'  words                       输出当前单词本 JSON\n' +
'  words add word|词性|释义    添加单词，如 words add hypothesis|n.|假设\n' +
'  words list [N]              列出前 N 个单词（默认 20）\n' +
'  words count                 统计单词总数\n' +
'  words find 关键词           按单词或释义查找\n' +
'  words del 编号              删除指定编号的单词\n' +
'── 笔记（Markdown / LaTeX）──\n' +
'  note                        打开笔记应用\n' +
'  note list                   列出全部笔记\n' +
'  note new 标题               新建笔记（输出包含分配的固定编号）\n' +
'  note open 编号|标题         打开某篇笔记\n' +
'  note view 编号|标题         查看笔记完整 Markdown 内容\n' +
'  note edit 编号 文本         整体替换笔记内容（\\n 表示换行）\n' +
'  note append 编号 文本       向笔记末尾追加（\\n 表示换行）\n' +
'  note export 编号            输出笔记完整 Markdown 原文\n' +
'  note search 关键词          搜索笔记\n' +
'  note undo                   撤销最近一次改动（new/edit/append/del）\n' +
'  note del 编号               删除笔记\n' +
'── 文档与其他 ──\n' +
'  docs open URL|recent        文档阅读器打开/最近记录\n' +
'  tips [编号]                 玩机技巧列表/详情\n' +
'  emu-win info|open           Windows 11 模拟器\n' +
'  emu-win10 info|open         Windows 10 模拟器\n' +
'  emu-android info|open       安卓模拟器\n' +
'── 软件命令包与 AI 提问 ──\n' +
'  ask 问题                    纯 API 提问，结果直接输出到命令行；不写入 AI 对话\n' +
'  ai-usage [open|summary]     打开或汇总 Token 用量与计费统计\n' +
'  cmd 应用id 指令 [参数]       调用 AI 软件注册的命令包（cmd list 查看）\n' +
'  installhelp                 获取安装软件教程（返回 AI 软件商城提示词）\n' +
'── 其他 ──\n' +
'  js 代码                     执行任意 JavaScript（万能兜底，慎用）\n' +
'  echo 文本                   原样输出\n' +
'  help                        显示本教程\n' +
'快捷键：↑/↓ 翻阅历史命令，Enter 执行。';
  },
  // AI 提示词片段（命令行模式开启时注入系统提示词，尽量紧凑以节省 token）
  aiPrompt() {
    if (this.registry) {
      return '\n\n【天择OS 命令行能力】你可以输出 tzcli 代码块让操作系统执行命令，每行一条：\n```tzcli\napp open ai-config\nmemory add 用户喜欢简洁回答\n```\n' +
        this.registry.agentPrompt() +
        '\n规则：仅在确有必要时使用；不要写注释；优先使用新的命名空间。包括 ai ask/ask 在内的全部命令都可调用。系统不限制调用次数或轮数，但会在发现重复命令、重复结果或周期性无进展时自动掐断循环。';
    }
    return '\n\n【天择OS 命令行能力】你可以输出 tzcli 代码块让操作系统执行命令，格式（每行一条命令）：\n' +
'```tzcli\nopen ai-config\nmem add 用户喜欢简洁的回答\n```\n' +
'全部命令如下（自有软件命令均为顶层命令，无需 cmd 前缀；只有用户安装的 AI 软件才走 cmd）：\n' +
'· 系统：version | theme dark|light | style win|mac|auto | level [rule] | skin [list|use|unlock] | widget open|close | resetlayout | export | settings info|storage|reset | about info|changelog|credits\n' +
'· 应用：apps | open 应用id | close 应用id | pin/top 应用id | unpin 应用id | pinned | install 名称|图标|完整HTML | uninstall 应用id | rename 应用id|新名[|图标] | sethtml 应用id|完整HTML | gethtml 应用id | files list|export 应用id|size\n' +
'· AI：aiconfig [url|key|model|maxtokens 值] | price [hit|write|input|output 值] / price unit usd|cny | deepthink on|off | agent on|off | chat clear|history|last | store open|tutorial|idea | installhelp（AI 软件命令包接入教程）\n' +
'· 记忆：mem | mem add 内容 | mem del 编号 | mem on|off 编号\n' +
'· 通知/对话：notify 文本 | clear chat（清空 AI 对话，保留最后一次回复） | clear notifs\n' +
'· 浏览器/网页：openurl 网址或搜索词（go 同义） | browser tabs|closeall|home | home sections|open 板块 | news [编号] | blog [编号] | bm / bm add 网址|标题 / bm del 编号\n' +
'· 时钟：clock | clock-now | stopwatch [start|stop|reset] | timer 时长(如 5m / 90s / 1h30m)\n' +
'· 天择网专区：coc list|open | coc-data [save <JSON>|json|clear] | coc-game [search 名字|th 等级|cat 类别|count|json] | village info|open | planner info|open | dmg info|quake HP|open | game list|open | gpa info|open|rules | english list|open | ai-zone list|open | open-data list|open | tree [分类]\n' +
'· 单词本：words | words add word|词性|释义 | words list [N] | words count | words find 关键词 | words del 编号\n' +
'· 笔记（Markdown/LaTeX）：note | note list | note new 标题 | note open 编号|标题 | note view 编号|标题 | note edit 编号 文本(整体替换，\\n 为换行) | note append 编号 文本(\n 为换行) | note export 编号 | note search 关键词 | note undo | note del 编号\n' +
'· 文档/技巧/模拟器：docs open URL|recent | tips [编号] | emu-win/emu-win10/emu-android info|open\n' +
'· 用户安装的 AI 软件：cmd list 查看已注册命令；cmd 应用id 指令 [参数] 调用（会自动打开软件窗口，指令在软件内部执行）\n' +
'· 其他：js JavaScript代码 | echo 文本 | ask 问题（纯 API 提问，AI 也可调用）\n' +
'规则：仅在确有必要时使用（普通问答不要用）；命令在你输出后立即执行，结果会以用户消息回传；异步命令（fetch/IndexedDB）会自动等待；块内不要写注释和空行；命令调用没有次数或轮数硬限制，系统仅在检测到重复且无进展的循环时自动终止；写记忆、改配置、装改软件、查 COC/单词/笔记数据等操作优先用命令完成，不要只口头描述。';
  },
  cmds: {
    help: (r) => CLI.manual(r),
    version: () => '天择OS v' + OS_VERSION + ' · ' + (isMobile() ? '移动端' : '桌面端'),
    apps: () => getAllApps().map(a => a.id + '  ' + a.name + '  [' + a.type + ']').join('\n'),
    open: (r) => { need(r, 'open 应用id'); const app = findApp(r); if (!app) throw new Error('应用不存在：' + r); launchApp(r); return '已打开 ' + app.name + floatTip(app.name); },
    close: (r) => { need(r, 'close 应用id'); const ws = WM.windows.filter(w => w.appId === r); if (!ws.length) return '没有该应用的窗口'; ws.forEach(w => WM.close(w.id)); return '已关闭 ' + ws.length + ' 个窗口'; },
    pin: (r) => { need(r, 'pin 应用id'); const ws = WM.windows.filter(w => w.appId === r); if (!ws.length) throw new Error('没有该应用的窗口：' + r); ws.forEach(w => WM.pin(w.id)); return '已置顶 ' + ws.length + ' 个窗口'; },
    unpin: (r) => { need(r, 'unpin 应用id'); const ws = WM.windows.filter(w => w.appId === r); if (!ws.length) throw new Error('没有该应用的窗口：' + r); ws.forEach(w => WM.unpin(w.id)); return '已取消置顶 ' + ws.length + ' 个窗口'; },
    top: (r) => { need(r, 'top 应用id'); return CLI.cmds.pin(r); },
    pinned: () => {
      const ws = WM.windows.filter(w => w.pinned);
      return ws.length ? ws.map(w => w.app.id + '  ' + w.app.name).join('\n') : '（暂无置顶窗口）';
    },
    install: (r) => {
      const p = r.split('|').map(s => s.trim());
      if (p.length < 3) throw new Error('用法：install 名称 | 图标 | 完整HTML代码');
      const name = p[0], icon = p[1], html = p.slice(2).join('|');
      if (!name) throw new Error('名称不能为空');
      if (!/<html|<!doctype/i.test(html)) throw new Error('第三段必须是完整 HTML 代码（以 <!DOCTYPE 或 <html 开头）');
      const id = 'app-' + Date.now();
      Store.saveApp({ id, name, icon: icon || '📦', iconKey: normalizeUiIconKey(icon || '📦'), desc: '通过命令行安装', grad: true, html, createdAt: Date.now() });
      Desktop.render(); StartMenu.render();
      RPG.gain('install'); // v3.5 积分：安装 AI 软件 +15（每日上限 45）
      return '已安装「' + name + '」（id: ' + id + '）';
    },
    uninstall: (r) => {
      need(r, 'uninstall 应用id');
      const app = Store.getApps().find(a => a.id === r);
      if (!app) throw new Error('未安装该软件（仅 AI 生成的软件可卸载）：' + r);
      Store.removeApp(r);
      try { localStorage.removeItem('tz_app_cmds_' + r); } catch (e) {}
      if (typeof AppCommands !== 'undefined') AppCommands.syncRegistry(r, []);
      WM.windows.filter(w => w.appId === r).forEach(w => WM.close(w.id));
      Desktop.render(); StartMenu.render(); refreshOpenApp('file-manager');
      return '已卸载「' + app.name + '」';
    },
    rename: (r) => {
      const p = r.split('|').map(s => s.trim());
      if (p.length < 2) throw new Error('用法：rename 应用id | 新名称 [| 新图标]');
      const app = Store.getApps().find(a => a.id === p[0]);
      if (!app) throw new Error('未找到已安装软件：' + p[0]);
      const patch = {};
      if (p[1]) patch.name = p[1];
      if (p[2] && /\p{Extended_Pictographic}/u.test(p[2])) { patch.icon = p[2]; patch.iconKey = normalizeUiIconKey(p[2]); }
      Store.updateApp(p[0], patch);
      Desktop.render(); StartMenu.render(); refreshOpenApp('file-manager');
      return '已重命名为「' + (patch.name || app.name) + '」';
    },
    sethtml: (r) => {
      const sp2 = r.indexOf('|');
      if (sp2 < 0) throw new Error('用法：sethtml 应用id | 完整HTML代码');
      const id = r.slice(0, sp2).trim(), html = r.slice(sp2 + 1).trim();
      const app = Store.getApps().find(a => a.id === id);
      if (!app) throw new Error('未找到已安装软件：' + id);
      if (!/<html|<!doctype/i.test(html)) throw new Error('第二段必须是完整 HTML 代码');
      Store.updateApp(id, { html });
      WM.windows.filter(w => w.appId === id).forEach(w => WM.reload(w.id));
      return '已更新「' + app.name + '」的代码（' + html.length + ' 字符）';
    },
    gethtml: (r) => {
      need(r, 'gethtml 应用id');
      const app = Store.getApps().find(a => a.id === r);
      if (!app) throw new Error('未找到已安装软件：' + r);
      const html = app.html || '';
      // 大段 HTML 单独一行作为"待展开"提示，正文通过 print 的自动折叠渲染，
      // 避免一次性 inline 渲染数 MB 文本导致浏览器只渲染开头部分。
      if (html.length > 5000) {
        return '「' + app.name + '」完整 HTML 代码共 ' + html.length + ' 字符：\n' + html;
      }
      return '「' + app.name + '」完整 HTML 代码（' + html.length + ' 字符）：\n' + html;
    },
    aiconfig: (r) => {
      if (!r) {
        const c = Store.getAIConfig(); const p = c.prices || {};
        return 'URL：' + c.url + '\n模型：' + c.model + '\nKey：' + maskKey(c.key) + '\nmaxTokens：' + (c.maxTokens || '默认 8192') +
          '\n单价：命中 ' + (p.hit || 0) + ' / 写入 ' + (p.write || 0) + ' / 输入 ' + (p.input || 0) + ' / 输出 ' + (p.output || 0) + '（' + (p.unit === 'usd' ? '美元' : '人民币') + '/百万）';
      }
      const sp = r.indexOf(' '); const k = (sp < 0 ? r : r.slice(0, sp)).toLowerCase(); const v = sp < 0 ? '' : r.slice(sp + 1).trim();
      if (!v) throw new Error('用法：aiconfig url|key|model|maxtokens 值');
      const c = Store.getAIConfig();
      if (k === 'url') c.url = v;
      else if (k === 'key') c.key = v;
      else if (k === 'model') c.model = v;
      else if (k === 'maxtokens') { const n = parseInt(v, 10); if (!(n > 0)) throw new Error('maxtokens 必须是正整数'); c.maxTokens = n; }
      else throw new Error('用法：aiconfig url|key|model|maxtokens 值');
      Store.setAIConfig(c);
      return 'AI 配置已更新：' + k;
    },
    price: (r) => {
      if (!r) {
        const p = Store.getAIConfig().prices || {};
        return '缓存命中 ' + (p.hit || 0) + ' / 缓存写入 ' + (p.write || 0) + ' / 输入 ' + (p.input || 0) + ' / 输出 ' + (p.output || 0) + '（每百万 tokens） / 联网 ' + (p.search || 0) + '（每次），单位：' + (p.unit === 'usd' ? '美元' : '人民币');
      }
      const sp = r.indexOf(' '); const k = (sp < 0 ? r : r.slice(0, sp)).toLowerCase(); const v = sp < 0 ? '' : r.slice(sp + 1).trim();
      const c = Store.getAIConfig(); c.prices = c.prices || {};
      if (k === 'unit') { if (v !== 'usd' && v !== 'cny') throw new Error('unit 只能是 usd 或 cny'); c.prices.unit = v; }
      else if (['hit', 'write', 'input', 'output', 'search'].includes(k)) { const n = parseFloat(v); if (isNaN(n) || n < 0) throw new Error('价格必须是非负数字'); c.prices[k] = n; }
      else throw new Error('用法：price hit|write|input|output|search 数值 或 price unit usd|cny');
      Store.setAIConfig(c);
      return 'token 单价已更新';
    },
    mem: (r) => {
      if (!r) {
        const ms = Mem.list();
        return ms.length ? ms.map((m, i) => (i + 1) + '. [' + (m.enabled !== false ? '启用' : '停用') + '] ' + m.text).join('\n') : '（暂无记忆）';
      }
      const sp = r.indexOf(' '); const sub = (sp < 0 ? r : r.slice(0, sp)).toLowerCase(); const v = sp < 0 ? '' : r.slice(sp + 1).trim();
      if (sub === 'add') { if (!v) throw new Error('用法：mem add 内容'); Mem.add(v); refreshOpenApp('ai-config'); return '已写入记忆：' + v; }
      if (sub === 'del' || sub === 'on' || sub === 'off') {
        const n = parseInt(v, 10); const ms = Mem.list();
        if (!(n >= 1 && n <= ms.length)) throw new Error('编号无效（1-' + ms.length + '）');
        if (sub === 'del') { const t = ms[n - 1].text; Mem.remove(ms[n - 1].id); refreshOpenApp('ai-config'); return '已删除记忆：' + t; }
        Mem.update(ms[n - 1].id, { enabled: sub === 'on' }); refreshOpenApp('ai-config');
        return '已' + (sub === 'on' ? '启用' : '停用') + '记忆 ' + n;
      }
      throw new Error('用法：mem [add 内容 | del 编号 | on 编号 | off 编号]');
    },
    theme: (r) => {
      if (r !== 'dark' && r !== 'light') throw new Error('用法：theme dark|light');
      Store.setTheme(r); applyTheme(); refreshOpenApp('settings');
      return '已切换为' + (r === 'light' ? '浅色' : '深色') + '主题';
    },
    style: (r) => {
      if (!['win', 'mac', 'auto'].includes(r)) throw new Error('用法：style win|mac|auto');
      Store.setStyle(r === 'auto' ? null : r); applyDeviceStyle(); Desktop.render(); refreshOpenApp('settings');
      return '桌面风格已切换为 ' + r;
    },
    // v3.5：用户等级与积分
    level: (r) => {
      const { sub } = splitSub(r);
      if (sub === 'open') { launchApp('growth'); return '已打开「等级与外观」' + floatTip('等级与外观'); }
      if (sub === 'rule' || sub === 'rules') {
        return '积分获取规则（每日 0 点重置上限）：\n' +
          RPG_RULES.map(x => '  ' + x.name + '：每次 +' + x.pts + ' 分（每日上限 ' + x.cap + ' 分）').join('\n') +
          '\n\n等级规则：累计积分升级——Lv1→2 需 100 分，之后每级递增 100（Lv2→3 需 200、Lv3→4 需 300…）。\n' +
          '等级称号：' + RPG_TITLES.map(p => 'Lv' + p[0] + '「' + p[1] + '」').join('、') + '。\n' +
          '积分用途：兑换基础完整皮肤，或按 30 天开通 VIP 专属皮肤（skin list / vip plans 查看）。等级与积分随全量存档迁移，加密存储防篡改。';
      }
      const s = RPG.summary();
      return 'Lv.' + s.lv + '「' + s.title + '」\n' +
        '可用积分：' + s.points + ' 分 · 累计积分：' + s.total + ' 分\n' +
        '升级进度：' + s.into + ' / ' + s.need + '（再获 ' + (s.need - s.into) + ' 分升 Lv.' + (s.lv + 1) + '）\n' +
        '今日已获：' + RPG_RULES.map(x => (s.gain[x.id] || 0) + '/' + x.cap + '（' + x.name + '）').join('、') + '\n' +
        '已解锁配色：' + s.skins.map(id => RPG_SKINS[id].name).join('、') + '\n' +
        '（level rule 查看规则；level open 打开「等级与外观」应用；skin 命令兑换/切换配色）';
    },
    // v4.1：完整皮肤（基础皮肤需积分+等级；VIP 专属皮肤按月解锁）
    skin: (r) => {
      const { sub, args } = splitSub(r);
      if (!sub || sub === 'list') {
        const cur = Store.getPalette();
        return '界面配色（当前：' + RPG_SKINS[cur].name + ' · ' + RPG_SKINS[cur].desc + '；可用积分 ' + RPG.data().points + ' 分）：\n' +
          Object.keys(RPG_SKINS).map(id => {
            const s = RPG_SKINS[id];
            const plan = s.vipTier && VIP_PLANS.find(item => item.id === s.vipTier);
            const st = id === cur ? '使用中' : RPG.hasSkin(id) ? '可使用' : plan ? '🔒 ' + plan.name + ' 或更高' : '🔒 Lv.' + (s.minLevel || 1) + ' + ' + s.cost + ' 积分';
            return '  ' + id + '  ' + s.name + '（' + s.desc + '）· ' + st;
          }).join('\n') +
          '\n用法：skin use 皮肤id；skin unlock mid|warm；vip plans / vip subscribe 档位（天择网皮肤全部免费）';
      }
      if (sub === 'use') {
        const id = args.toLowerCase();
        if (!RPG_SKINS[id]) throw new Error('未知皮肤 id（用 skin list 查看）');
        if (!RPG.hasSkin(id)) {
          const skin = RPG_SKINS[id];
          const plan = skin.vipTier && VIP_PLANS.find(item => item.id === skin.vipTier);
          throw new Error(plan ? '「' + skin.name + '」需要有效的 ' + plan.name + ' 或更高档 VIP' : '「' + skin.name + '」尚未解锁（需要 Lv.' + (skin.minLevel || 1) + ' 且 ' + skin.cost + ' 积分）');
        }
        Store.setPalette(id); applyPalette(); refreshOpenApp('growth');
        return '已切换为「' + RPG_SKINS[id].name + '」配色（' + RPG_SKINS[id].desc + '）';
      }
      if (sub === 'unlock') {
        const id = args.toLowerCase();
        if (!RPG_SKINS[id] || RPG_SKINS[id].vipTier) throw new Error('基础皮肤可解锁项：mid、warm；VIP 皮肤请用 vip subscribe 档位');
        const res = RPG.unlockSkin(id);
        if (!res.ok) throw new Error(res.msg);
        refreshOpenApp('growth');
        return res.msg + '（skin use ' + id + ' 立即启用）';
      }
      throw new Error('用法：skin [list|use 皮肤id|unlock mid|warm]');
    },
    vip: (r) => {
      const { sub, args } = splitSub(r);
      const current = RPG.vip();
      if (!sub || sub === 'status') {
        return current.active
          ? '当前：' + current.plan.name + '\n到期：' + new Date(current.expiresAt).toLocaleString('zh-CN') + '\n剩余：' + Math.max(1, Math.ceil((current.expiresAt - Date.now()) / 86400000)) + ' 天\n可使用本档及以下全部 VIP 专属皮肤。'
          : '当前未开通 VIP。VIP 使用积分按 30 天开通，不会自动续费；用 vip plans 查看六档方案。';
      }
      if (sub === 'plans' || sub === 'list') {
        return '天择OS VIP 月卡（每次 30 天，不自动续费）：\n' + VIP_PLANS.map((plan, index) => {
          const usable = RPG.level().lv >= plan.level;
          return '  ' + plan.id + '  ' + plan.name + ' · Lv.' + plan.level + ' · ' + plan.cost + ' 积分/月 · 专属「' + RPG_SKINS[plan.skin].name + '」' + (usable ? '' : '（等级未达）') + (current.active && RPG.vipRank(current.tier) >= index ? '（当前权益覆盖）' : '');
        }).join('\n') + '\n当前每日积分上限 ' + RPG_DAILY_CAP + '，30 天理论上限 ' + (RPG_DAILY_CAP * 30) + '；全部档位均可在一个月积分上限内开通。\n高档 VIP 可使用低档 VIP 皮肤；购买/续订：vip subscribe 档位';
      }
      if (sub === 'subscribe' || sub === 'buy' || sub === 'renew') {
        const id = args.toLowerCase();
        if (!VIP_PLANS.some(plan => plan.id === id)) throw new Error('档位：bronze|silver|gold|platinum|blackgold|diamond');
        const result = RPG.subscribeVip(id);
        if (!result.ok) throw new Error(result.msg);
        Store.setPalette(result.plan.skin);
        applyPalette(); refreshOpenApp('growth'); refreshOpenApp('settings');
        return result.msg + '；已切换为「' + RPG_SKINS[result.plan.skin].name + '」';
      }
      if (sub === 'open') { launchApp('growth'); return '已打开 VIP 与皮肤中心'; }
      throw new Error('用法：vip status|plans|subscribe 档位|open');
    },
    deepthink: (r) => { const on = parseOnOff(r); setDeepThinkCtx(on); syncDeepBtns(); return '深度思考已' + (on ? '开启' : '关闭'); },
    agent: (r, execOpts = {}) => {
      const value = String(r || '').trim();
      if (/^(on|off|开|关|true|false|1|0|开启|关闭)$/i.test(value)) {
        const on = parseOnOff(value); Store.setAgentMode(on); refreshOpenApp('settings');
        return 'AI 命令行模式已' + (on ? '开启（自动写入记忆已关闭）' : '关闭');
      }
      const question = value.replace(/^ask\s+/i, '').trim();
      need(question, 'agent 问题（agent on|off 仍用于切换主 AI 命令行模式）');
      return runSubAgent(question, execOpts);
    },
    clear: (r) => {
      if (r === 'chat') {
        // 修复：清空后 AI 的最后一次回复应保留在屏幕上——清空历史但保留最后一条 AI 消息作为上下文
        const h = Store.getChat();
        const lastAi = [...h].reverse().find(m => m.role === 'ai');
        Store.setChat(lastAi ? [lastAi] : []);
        Store.setChatCtxReal(null);
        refreshChatView();
        return lastAi ? 'AI 对话历史已清空（保留了 AI 最后一次回复）' : 'AI 对话历史已清空';
      }
      if (r === 'notifs') { Store.clearNotifs(); return '通知已清空'; }
      if (!r) return '__CLEAR__';
      throw new Error('用法：clear [chat|notifs]');
    },
    notify: (r) => { need(r, 'notify 文本'); Store.addNotif({ title: '命令行', body: r }); return '已发送通知'; },
    bm: (r) => {
      if (!r || r === 'list') { const b = Store.getBookmarks(); return b.length ? b.map((x, i) => (i + 1) + '. ' + x.title + '  ' + x.url).join('\n') : '（收藏夹为空）'; }
      const sp = r.indexOf(' '); const sub = (sp < 0 ? r : r.slice(0, sp)).toLowerCase(); const v = sp < 0 ? '' : r.slice(sp + 1).trim();
      if (sub === 'add') {
        const pp = v.split('|').map(s => s.trim());
        if (!/^https?:\/\//i.test(pp[0] || '')) throw new Error('用法：bm add http(s)网址 [| 标题]');
        const b = Store.getBookmarks(); b.unshift({ title: pp[1] || pp[0], url: pp[0], time: Date.now() }); Store.setBookmarks(b);
        return '已收藏 ' + pp[0];
      }
      if (sub === 'del') {
        const n = parseInt(v, 10); const b = Store.getBookmarks();
        if (!(n >= 1 && n <= b.length)) throw new Error('编号无效（1-' + b.length + '）');
        const t = b.splice(n - 1, 1)[0]; Store.setBookmarks(b);
        return '已删除收藏：' + t.title;
      }
      throw new Error('用法：bm [list | add 网址 [| 标题] | del 编号]');
    },
    widget: (r) => {
      if (r === 'open') { FloatingWidget.open(); return '快捷面板已打开'; }
      if (r === 'close') { FloatingWidget.close(); return '快捷面板已收起为悬浮球'; }
      throw new Error('用法：widget open|close');
    },
    // 打开特定网页：在内置浏览器新标签页打开（支持搜索词）
    openurl: (r) => {
      need(r, 'openurl 网址或搜索词');
      openInOsBrowser(r);
      return '已在浏览器打开：' + r + floatTip('浏览器');
    },
    go: (r) => { need(r, 'go 网址'); openInOsBrowser(r); return '已在浏览器打开：' + r + floatTip('浏览器'); },
    // 时钟 / 秒表 / 倒计时
    clock: () => { launchApp('clock'); return '已打开时钟（含秒表与倒计时）' + floatTip('时钟'); },
    stopwatch: (r) => {
      const w = launchApp('clock');
      const act = (r || '').toLowerCase();
      const call = (m) => { try { if (w && w.body) { const b = w.body.querySelector('[data-sw="' + m + '"]'); if (b) b.click(); } } catch (e) {} };
      setTimeout(() => {
        if (act === 'start' || act === 'on') call('start');
        else if (act === 'stop') call('stop');
        else if (act === 'reset') call('reset');
        else call('tab'); // 无参数仅切到秒表页
      }, 120);
      const label = ({ start: '已开始', stop: '已停止', reset: '已归零' }[act] || '已就绪');
      return '秒表' + label + floatTip('时钟');
    },
    timer: (r) => {
      need(r, 'timer 时长（如 5m / 90s / 1h30m / 300）');
      const sec = parseDuration(r);
      if (!(sec > 0)) throw new Error('无法识别时长：' + r);
      const w = launchApp('clock');
      setTimeout(() => { try { if (w && w.body) startCountdownInApp(w.body, sec); } catch (e) {} }, 120);
      return '倒计时 ' + sec + ' 秒已开始' + floatTip('时钟');
    },
    // 软件直达（coc-data 玩家存档 / coc-game 游戏数据 / words 词库 均为数据输出命令，见 BUILTIN_APP_CMDS）
    // 纯 API 提问：不打开/写入 AI 对话，不带截图、附件、知识库或 Agent。
    ask: async (r, execOpts = {}) => {
      need(r, 'ask 问题');
      if (!AI.isReady()) throw new Error('AI 未配置，请先在「AI 配置」中设置');
      const result = await AI.chat([{ role: 'user', content: r }], { thinking: false, signal: execOpts.signal || null, source: execOpts.byApp ? 'app' : 'ask' });
      const usage = result.usage ? '\n\n[' + usageText(result.usage) + ']' : '';
      const answer = result.content || result.reasoning || '（AI 未返回正文）';
      return { out: answer + usage, data: { kind: 'ask', question: r, answer, reasoning: result.reasoning || '', usage: result.usage || null } };
    },
    'ai-usage': (r) => {
      const sub = String(r || '').trim().toLowerCase();
      const data = AIUsage.get();
      const t = data.totals;
      if (!sub || sub === 'open') { launchApp('ai-usage'); return '已打开 Token 用量与计费'; }
      if (sub !== 'summary') throw new Error('用法：ai-usage [open|summary]');
      const costs = (t.costCny > 0 ? '¥' + t.costCny.toFixed(6) : '') + (t.costUsd > 0 ? (t.costCny > 0 ? ' + ' : '') + '$' + t.costUsd.toFixed(6) : '');
      return 'AI 历史用量：' + t.requests + ' 次请求\n输入：' + (t.input + t.hit + t.write) + '\n输出：' + t.output + '\n总计：' + t.total + ' tokens\n估算费用：' + (costs || '未计价');
    },
    // 调用软件命令包
    cmd: (r, execOpts = {}) => {
      need(r, 'cmd 应用id 指令 [参数]（cmd list 查看全部）');
      if (r === 'list') return AppCommands.listText();
      const sp = r.indexOf(' ');
      const appId = sp < 0 ? r : r.slice(0, sp).trim();
      const rest = sp < 0 ? '' : r.slice(sp + 1).trim();
      return AppCommands.exec(appId, rest, execOpts);
    },
    // 获取安装软件教程：返回 AI 软件商城的完整提示词（含命令包接入教程）
    installhelp: () => APP_STORE_TUTORIAL,
    resetlayout: () => { Store.clearIconPositions(); Desktop.render(); return '桌面图标布局已重置'; },
    export: () => { window.TZOS.exportArchive(); return '正在导出存档…'; },
    js: (r) => {
      need(r, 'js 代码');
      const ret = (0, eval)(r);
      if (ret === undefined) return '（无返回值）';
      const s = typeof ret === 'object' ? JSON.stringify(ret) : String(ret);
      return String(s);
    },
    echo: (r) => r,
    // ===== 自有软件命令（每个软件一个顶层命令，help 直接可见）=====
    ...BUILTIN_APP_CMDS
  }
};

const ShellRuntime = {
  jobs: new Map(),
  profile() { return Store.get('shellProfile', 'powershell') === 'cmd' ? 'cmd' : 'powershell'; },
  cwd() { return Store.get('shellCwd', ''); },
  async setCwd(value) {
    if (!window.tzDesktop?.validateShellCwd) throw new Error('真实 Shell 仅在天择OS桌面版可用');
    const result = await window.tzDesktop.validateShellCwd(value || '');
    Store.set('shellCwd', result.cwd);
    return result.cwd;
  },
  async run(command, ctx = {}) {
    need(command, 'shell run 命令');
    if (!window.tzDesktop?.runShell) throw new Error('真实 PowerShell/CMD 仅在天择OS桌面版可用');
    const id = 'shell-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    const job = { id, command, profile: this.profile(), cwd: this.cwd(), startedAt: Date.now(), status: 'running', output: '' };
    this.jobs.set(id, job);
    const abort = () => window.tzDesktop.stopShell && window.tzDesktop.stopShell(id).catch(() => {});
    if (ctx.signal) {
      if (ctx.signal.aborted) throw new DOMException('已停止', 'AbortError');
      ctx.signal.addEventListener('abort', abort, { once: true });
    }
    try {
      const result = await window.tzDesktop.runShell({ id, command, profile: job.profile, cwd: job.cwd }, (chunk, stream) => {
        job.output += chunk;
        if (ctx.streamOutput && typeof ctx.emit === 'function') ctx.emit(chunk, stream);
      });
      job.status = result.ok ? 'completed' : 'failed';
      job.code = result.code;
      job.signal = result.signal;
      job.output = result.out;
      return {
        ok: result.ok,
        code: Number.isInteger(result.code) ? result.code : (result.ok ? 0 : 1),
        out: ctx.streamOutput ? ('[任务 ' + id + ' 已结束，退出码 ' + result.code + ']') : (result.out || '[退出码 ' + result.code + ']'),
        data: { id, profile: job.profile, cwd: job.cwd, exitCode: result.code, signal: result.signal }
      };
    } finally {
      if (ctx.signal) ctx.signal.removeEventListener('abort', abort);
    }
  },
  async stop(id) {
    need(id, 'shell stop 任务id');
    if (!window.tzDesktop?.stopShell) throw new Error('真实 Shell 仅在天择OS桌面版可用');
    const result = await window.tzDesktop.stopShell(id);
    const job = this.jobs.get(id);
    if (job) job.status = 'stopping';
    return result.ok ? '已请求停止 ' + id : result.message;
  }
};

function resolveChatTarget(value, options = {}) {
  const all = Store.getChats();
  const pool = options.archived ? all.filter(chat => chat.archivedAt) : options.all ? all : all.filter(chat => !chat.archivedAt);
  const query = String(value || '').trim();
  if (!query) return all.find(chat => chat.id === Store.getActiveChatId()) || pool[0] || null;
  const index = parseInt(query, 10);
  return pool.find(chat => chat.id === query) || (index >= 1 ? pool[index - 1] : null) || pool.find(chat => String(chat.title || '').includes(query)) || null;
}

function formatChatList(chats) {
  return chats.length ? chats.map((chat, index) => (index + 1) + '. ' + chat.id + '  ' + (chat.archivedAt ? '[已归档] ' : '') + (chat.title || '新对话') + '  ' + (chat.messages || []).length + ' 条消息').join('\n') : '（暂无对话）';
}

function initCLIRegistry() {
  if (!window.TZCLIEngine) return;
  const registry = new window.TZCLIEngine.Registry();
  const legacyHandler = name => ctx => CLI.cmds[name](ctx.raw, ctx);
  Object.keys(CLI.cmds).forEach(name => registry.register({ path: name, hidden: true, handler: legacyHandler(name) }));

  const add = (path, legacy, usage, description, group, extra = {}) => registry.register({
    path,
    usage: usage || path,
    description,
    group,
    handler: typeof legacy === 'function'
      ? legacy
      : ctx => CLI.cmds[legacy](extra.preserveRaw ? ctx.raw : ctx.args.join(' '), ctx),
    ...extra
  });

  add('help', ctx => CLI.manual(ctx.raw), 'help [关键词]', '查看全部命令或搜索帮助', '系统');
  add('system info', ctx => CLI.cmds.settings('info', ctx), 'system info', '查看系统与运行环境信息', '系统', { aliases: ['version', 'settings info'] });
  add('system storage', ctx => {
    const state = localStorage.getItem(Store.KEY) || '';
    return '主存档：' + state.length + ' 字符\n已安装应用：' + Store.getApps().length + '\n对话：' + Store.getChats().length + '\n知识库文档：请用 knowledge documents 查看';
  }, 'system storage', '查看本机存储概况', '系统', { aliases: ['settings storage'] });
  add('system theme', 'theme', 'system theme dark|light', '切换深色或浅色主题', '系统', { aliases: ['theme'] });
  add('system style', 'style', 'system style win|mac|auto', '切换桌面窗口风格', '系统', { aliases: ['style'] });
  add('system palette', 'skin', 'system palette list|use|unlock', '查看、切换或解锁界面配色', '系统', { aliases: ['skin'] });
  add('vip', 'vip', 'vip status|plans|subscribe 档位|open', '查看或开通天择OS积分月卡 VIP', '外观与 VIP');
  add('vip status', ctx => CLI.cmds.vip('status', ctx), 'vip status', '查看当前 VIP 档位与到期时间', '外观与 VIP');
  add('vip plans', ctx => CLI.cmds.vip('plans', ctx), 'vip plans', '查看六档 VIP 的等级门槛、月费与专属皮肤', '外观与 VIP');
  add('vip subscribe', ctx => CLI.cmds.vip('subscribe ' + ctx.raw, ctx), 'vip subscribe bronze|silver|gold|platinum|blackgold|diamond', '使用积分开通或续订 30 天 VIP', '外观与 VIP');
  add('system archive export', 'export', 'system archive export', '导出天择OS全量存档', '系统', { aliases: ['export'] });
  add('system update check', async () => '线上版本：' + ((await Updater.check(true)) || '检查失败'), 'system update check', '检查天择OS更新', '系统');
  add('system update apply', () => { Updater.apply(); return '已启动更新流程'; }, 'system update apply', '应用可用更新', '系统');
  add('system volume', ctx => {
    const action = (ctx.args[0] || 'get').toLowerCase();
    if (action === 'mute' || action === 'unmute') Store.set('sysMuted', action === 'mute');
    else if (action === 'set') {
      const n = Number(ctx.args[1]); if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('音量必须为 0 到 100');
      Store.set('sysVolume', n / 100); Store.set('sysMuted', n === 0);
    } else if (action !== 'get') throw new Error('用法：system volume get|set 0-100|mute|unmute');
    applySysVolume();
    return '音量：' + Math.round(Store.get('sysVolume', 1) * 100) + '% · ' + (Store.get('sysMuted', false) ? '静音' : '播放');
  }, 'system volume get|set 0-100|mute|unmute', '查看或调整系统媒体音量', '系统');
  add('system quit', () => { if (!window.tzDesktop?.quit) throw new Error('仅桌面版可退出'); window.tzDesktop.quit(); return '正在退出天择OS…'; }, 'system quit', '退出桌面版天择OS', '系统');
  add('system restart', () => { if (!window.tzDesktop?.restart) throw new Error('仅桌面版可重启'); window.tzDesktop.restart(); return '正在重启天择OS…'; }, 'system restart', '重启桌面版天择OS', '系统');

  add('desktop reset-layout', 'resetlayout', 'desktop reset-layout', '重置桌面图标布局', '桌面', { aliases: ['resetlayout'] });
  add('desktop widget', 'widget', 'desktop widget open|close', '打开或收起快捷面板', '桌面', { aliases: ['widget'] });
  add('window list', () => WM.windows.length ? WM.windows.map(w => w.id + '  ' + w.appId + '  ' + w.app.name + '  ' + (w.minimized ? '最小化' : w.maximized ? '最大化' : '普通') + (w.pinned ? ' · 置顶' : '')).join('\n') : '（暂无窗口）', 'window list', '列出当前窗口及窗口 ID', '窗口');
  add('window open', 'open', 'window open 应用id', '打开应用窗口', '窗口', { aliases: ['open'] });
  add('window focus', ctx => { const w = WM.windows.find(item => item.id === ctx.raw) || WM.findWindow(ctx.raw); if (!w) throw new Error('窗口不存在：' + ctx.raw); WM.focus(w.id, { focusDom: true }); return '已聚焦 ' + w.app.name; }, 'window focus 窗口id|应用id', '聚焦指定窗口', '窗口');
  add('window close', ctx => { const targets = WM.windows.filter(w => w.id === ctx.raw || w.appId === ctx.raw); if (!targets.length) throw new Error('窗口不存在：' + ctx.raw); targets.forEach(w => WM.close(w.id)); return '已关闭 ' + targets.length + ' 个窗口'; }, 'window close 窗口id|应用id', '关闭指定窗口', '窗口', { aliases: ['close'] });
  add('window close-all', () => { const count = WM.windows.length; [...WM.windows].forEach(w => WM.close(w.id)); return '已关闭 ' + count + ' 个窗口'; }, 'window close-all', '关闭全部窗口', '窗口');
  ['focus', 'minimize', 'restore', 'maximize', 'pin', 'unpin'].forEach(action => {
    if (action === 'focus') return;
    add('window ' + action, ctx => {
      const w = WM.windows.find(item => item.id === ctx.raw) || WM.findWindow(ctx.raw); if (!w) throw new Error('窗口不存在：' + ctx.raw);
      if (action === 'minimize') WM.minimize(w.id); else if (action === 'restore') { if (w.maximized) WM.toggleMax(w.id); else WM.restore(w.id); }
      else if (action === 'maximize') { if (!w.maximized) WM.toggleMax(w.id); } else WM[action](w.id);
      return '已' + ({ minimize: '最小化', restore: '还原', maximize: '最大化', pin: '置顶', unpin: '取消置顶' }[action]) + ' ' + w.app.name;
    }, 'window ' + action + ' 窗口id|应用id', '调整窗口状态', '窗口');
  });

  add('app list', 'apps', 'app list', '列出所有应用', '应用', { aliases: ['apps'] });
  add('app open', 'open', 'app open 应用id', '打开一个应用', '应用');
  add('app close', 'close', 'app close 应用id', '关闭某应用的窗口', '应用');
  add('app install', 'install', 'app install 名称|图标|HTML', '安装 HTML 应用', '应用', { aliases: ['install'], preserveRaw: true });
  add('app uninstall', 'uninstall', 'app uninstall 应用id', '卸载用户应用', '应用', { aliases: ['uninstall'] });
  add('app rename', 'rename', 'app rename 应用id|新名[|图标]', '重命名用户应用', '应用', { aliases: ['rename'] });
  add('app code get', 'gethtml', 'app code get 应用id', '读取应用完整 HTML', '应用', { aliases: ['gethtml'] });
  add('app code set', 'sethtml', 'app code set 应用id|HTML', '替换应用完整 HTML', '应用', { aliases: ['sethtml'], preserveRaw: true });
  add('app commands', 'cmd', 'app commands [list|应用id 指令 参数]', '查看或调用应用注册的命令', '应用', { aliases: ['cmd'] });
  add('app ai-monitor', ctx => JSON.stringify(AppAIGuard.snapshot(ctx.raw || ''), null, 2), 'app ai-monitor [应用id]', '查看应用 AI 调用实时监管状态', '应用');

  add('ask', 'ask', 'ask 问题', '纯 API 问答；不打开对话、不启用 Agent', 'AI', { preserveRaw: true });
  add('agent', 'agent', 'agent 问题', '调用可使用全部命令行的子智能体；on/off 保留为模式开关', 'AI', { preserveRaw: true });
  add('ai ask', 'ask', 'ai ask 问题', '纯 API 问答', 'AI', { preserveRaw: true });
  add('ai agent', 'agent', 'ai agent 问题', '调用可使用命令行的子智能体', 'AI', { preserveRaw: true });
  add('ai agent-mode', 'agent', 'ai agent-mode on|off', '开关主 AI 命令行模式', 'AI');
  add('ai config', 'aiconfig', 'ai config [url|key|model|maxtokens 值]', '查看或修改 AI 配置', 'AI', { aliases: ['aiconfig'] });
  add('ai price', 'price', 'ai price [字段 值]', '查看或设置 Token 单价', 'AI', { aliases: ['price'] });
  add('ai deepthink', 'deepthink', 'ai deepthink on|off', '开关深度思考', 'AI', { aliases: ['deepthink'] });
  add('ai usage', 'ai-usage', 'ai usage open|summary', '打开或汇总 AI 用量', 'AI', { aliases: ['ai-usage'] });
  add('ai activity', () => { launchApp('agent-center'); return '已打开 Agent 与命令中心'; }, 'ai activity', '打开 Agent 活动与统一命令中心', 'AI');
  add('ai activity status', () => JSON.stringify({ activities: AgentActivity.snapshot(), appGuard: AppAIGuard.snapshot() }, null, 2), 'ai activity status', '输出智能体活动与应用 AI 监管状态', 'AI');
  add('ai activity stop', ctx => { need(ctx.raw, 'ai activity stop 活动id'); if (!AgentActivity.stop(ctx.raw)) throw new Error('活动不存在或已经结束'); return '正在停止：' + ctx.raw; }, 'ai activity stop 活动id', '停止指定的智能体活动', 'AI');

  add('usage summary', ctx => CLI.cmds['ai-usage']('summary', ctx), 'usage summary', '汇总历史 Token 与费用', '用量');
  add('usage list', ctx => {
    const rows = AIUsage.get().records; const limit = Math.max(1, parseInt(ctx.options.limit || ctx.args[0] || 20, 10) || 20);
    return rows.slice(0, limit).map(r => new Date(r.at).toLocaleString('zh-CN') + '  ' + r.model + '  ' + r.source + '  ' + r.total + ' tokens  ' + r.cost.toFixed(6) + ' ' + r.unit.toUpperCase()).join('\n') || '（暂无记录）';
  }, 'usage list [数量]', '列出最近 AI 调用明细', '用量');
  add('usage model', ctx => {
    const groups = {}; AIUsage.get().records.forEach(r => { const g = groups[r.model] ||= { requests: 0, tokens: 0, cost: 0, unit: r.unit }; g.requests++; g.tokens += r.total; g.cost += r.cost; });
    return Object.entries(groups).map(([name, g]) => name + '  ' + g.requests + ' 次  ' + g.tokens + ' tokens  ' + g.cost.toFixed(6) + ' ' + g.unit.toUpperCase()).join('\n') || '（暂无记录）';
  }, 'usage model', '按模型汇总 AI 用量', '用量');
  add('usage export', () => JSON.stringify(AIUsage.get(), null, 2), 'usage export', '输出完整 AI 用量 JSON', '用量');
  add('usage reset', () => { AIUsage.reset(); return 'AI 用量统计已清空'; }, 'usage reset', '清空 AI 用量账本', '用量');
  add('usage price', 'price', 'usage price [字段 值]', '查看或设置计费单价', '用量');

  add('chat list', ctx => formatChatList(ctx.options.all ? Store.getChats() : ctx.options.archived ? Store.getArchivedChats() : Store.getVisibleChats()), 'chat list [--archived|--all]', '列出活动、归档或全部对话', '对话');
  add('chat show', ctx => { const chat = resolveChatTarget(ctx.raw, { all: true }); if (!chat) throw new Error('对话不存在'); return JSON.stringify(chat, null, 2); }, 'chat show 编号|id|标题', '查看对话完整内容', '对话');
  add('chat new', () => { const chat = Store.newChat(); if (!chat) throw new Error('活动对话数量已达上限，请先归档'); refreshChatView(); return '已新建对话：' + chat.id; }, 'chat new', '新建并切换到一个对话', '对话');
  add('chat rename', ctx => { const split = ctx.raw.indexOf('|'); if (split < 0) throw new Error('用法：chat rename 对话|新标题'); const chat = resolveChatTarget(ctx.raw.slice(0, split), { all: true }); if (!chat) throw new Error('对话不存在'); Store.updateChatMeta(chat.id, { title: ctx.raw.slice(split + 1).trim(), aiNamed: false }); refreshChatView(); return '已重命名对话'; }, 'chat rename 对话|新标题', '重命名对话', '对话');
  add('chat archive', ctx => { const chat = resolveChatTarget(ctx.raw); if (!chat) throw new Error('对话不存在'); Store.archiveChat(chat.id); refreshChatView(); return '已归档：' + chat.title; }, 'chat archive 编号|id|标题', '归档对话；内容仍进入知识库', '对话');
  add('chat restore', ctx => { const chat = resolveChatTarget(ctx.raw, { archived: true }); if (!chat) throw new Error('归档对话不存在'); Store.restoreChat(chat.id); refreshChatView(); return '已还原：' + chat.title; }, 'chat restore 编号|id|标题', '还原已归档对话', '对话');
  add('chat delete', ctx => { if (!ctx.options.permanent) throw new Error('彻底删除需要显式添加 --permanent'); const chat = resolveChatTarget(ctx.args.join(' '), { all: true }); if (!chat) throw new Error('对话不存在'); Store.removeChat(chat.id); refreshChatView(); return '已彻底删除：' + chat.title; }, 'chat delete 编号|id|标题 --permanent', '彻底删除对话', '对话');
  add('chat clear', ctx => CLI.cmds.chat(ctx.raw || 'clear', ctx), 'chat clear|history|last', '清空或查看当前对话历史', '对话');
  add('chat export', ctx => { const chat = resolveChatTarget(ctx.raw, { all: true }); if (!chat) throw new Error('对话不存在'); return JSON.stringify(chat, null, 2); }, 'chat export 编号|id|标题', '导出单个对话 JSON', '对话');
  add('chat use', ctx => { const chat = resolveChatTarget(ctx.raw); if (!chat || !Store.setActiveChat(chat.id)) throw new Error('活动对话不存在'); refreshChatView(); return '已切换到：' + chat.title; }, 'chat use 编号|id|标题', '切换当前对话', '对话');

  add('memory', 'mem', 'memory [list|add|del|on|off]', '管理长期记忆', '知识与记忆', { aliases: ['mem'] });
  add('memory list', ctx => CLI.cmds.mem('', ctx), 'memory list', '列出全部长期记忆', '知识与记忆');
  add('memory add', ctx => CLI.cmds.mem('add ' + ctx.raw, ctx), 'memory add 内容', '写入一条长期记忆', '知识与记忆');
  add('memory delete', ctx => CLI.cmds.mem('del ' + ctx.raw, ctx), 'memory delete 编号', '删除长期记忆', '知识与记忆');
  add('memory enable', ctx => CLI.cmds.mem('on ' + ctx.raw, ctx), 'memory enable 编号', '启用长期记忆', '知识与记忆');
  add('memory disable', ctx => CLI.cmds.mem('off ' + ctx.raw, ctx), 'memory disable 编号', '停用长期记忆', '知识与记忆');
  add('knowledge status', async () => { const entries = await SiteAI.allKnowledgeEntries(); const modes = Store.getKnowledgeModes(); return '来源模式：' + JSON.stringify(modes) + '\n可检索条目：' + entries.length; }, 'knowledge status', '查看知识库状态', '知识与记忆');
  add('knowledge sources', () => JSON.stringify(Store.getKnowledgeModes(), null, 2), 'knowledge sources', '查看四类知识来源模式', '知识与记忆');
  add('knowledge mode', ctx => { const source = ctx.args[0], mode = ctx.args[1]; if (!Store.setKnowledgeMode(source, mode)) throw new Error('用法：knowledge mode site|document|note|chat off|auto|full'); return '已将 ' + source + ' 设为 ' + mode; }, 'knowledge mode 来源 off|auto|full', '设置知识来源注入模式', '知识与记忆');
  add('knowledge search', async ctx => { const query = ctx.args.join(' '); need(query, 'knowledge search 关键词'); const entries = await SiteAI.allKnowledgeEntries(); const hits = SiteAI.rankEntries(entries, query, parseInt(ctx.options.limit || 10, 10) || 10); return hits.map((hit, i) => (i + 1) + '. [' + hit.entry.sourceLabel + '] ' + hit.entry.title + '\n' + SiteAI.entryExcerpt(hit.entry, SiteAI.queryTerms(query))).join('\n\n') || '（没有命中）'; }, 'knowledge search 关键词 [--limit N]', '在本机知识库中检索', '知识与记忆');
  add('knowledge documents', async () => { const docs = await KnowledgeStore.listDocs(); return docs.map((doc, i) => (i + 1) + '. ' + doc.id + '  ' + doc.title + '  ' + doc.source).join('\n') || '（暂无文档）'; }, 'knowledge documents', '列出导入的知识库文档', '知识与记忆');
  add('knowledge show', async ctx => { const doc = await KnowledgeStore.getDoc(ctx.raw); if (!doc) throw new Error('文档不存在：' + ctx.raw); return JSON.stringify(doc, null, 2); }, 'knowledge show 文档id', '查看知识库文档', '知识与记忆');
  add('knowledge remove', async ctx => { need(ctx.raw, 'knowledge remove 文档id'); await KnowledgeStore.removeDoc(ctx.raw); return '已移除知识库文档：' + ctx.raw; }, 'knowledge remove 文档id', '移除知识库文档', '知识与记忆');

  add('notify send', 'notify', 'notify send 文本', '发送系统通知', '工具', { aliases: ['notify'] });
  add('notify list', () => JSON.stringify(Store.getNotifs(), null, 2), 'notify list', '列出系统通知', '工具');
  add('notify clear', ctx => CLI.cmds.clear('notifs', ctx), 'notify clear', '清空系统通知', '工具');
  add('web open', 'openurl', 'web open 网址或搜索词', '在内置浏览器打开网页', '网页', { aliases: ['openurl', 'go'] });
  add('web tabs', ctx => CLI.cmds.browser(ctx.raw || 'tabs', ctx), 'web tabs [closeall|home]', '管理内置浏览器标签', '网页', { aliases: ['browser'] });
  add('web bookmark', 'bm', 'web bookmark list|add|del', '管理网页收藏', '网页', { aliases: ['bm'] });
  add('web section', 'home', 'web section list|open 板块', '查看或打开天择网站板块', '网页', { aliases: ['home'] });

  add('clock open', 'clock', 'clock open', '打开时钟应用', '工具', { aliases: ['clock'] });
  add('clock now', 'clock-now', 'clock now', '查看当前时间', '工具', { aliases: ['clock-now'] });
  add('clock stopwatch', 'stopwatch', 'clock stopwatch start|stop|reset', '控制秒表', '工具', { aliases: ['stopwatch'] });
  add('clock timer', 'timer', 'clock timer 时长', '启动倒计时', '工具', { aliases: ['timer'] });
  ['note', 'words', 'coc', 'coc-data', 'coc-game', 'game', 'english', 'ai-zone', 'open-data', 'tree', 'docs', 'tips'].forEach(name => add(name, name, name + ' [子命令]', '使用「' + name + '」内置工具', '专区与工具', { preserveRaw: name === 'note' || name === 'coc-data' || name === 'coc-game' }));
  add('emulator windows', 'emu-win', 'emulator windows info|open', '打开 Windows 11 模拟器', '专区与工具', { aliases: ['emu-win'] });
  add('emulator windows10', 'emu-win10', 'emulator windows10 info|open', '打开 Windows 10 模拟器', '专区与工具', { aliases: ['emu-win10'] });
  add('emulator android', 'emu-android', 'emulator android info|open', '打开安卓模拟器', '专区与工具', { aliases: ['emu-android'] });

  add('shell profile', ctx => { const value = (ctx.args[0] || '').toLowerCase(); if (!value || value === 'list') return 'powershell\ncmd\n当前：' + ShellRuntime.profile(); if (!['powershell', 'cmd'].includes(value)) throw new Error('配置只能是 powershell 或 cmd'); Store.set('shellProfile', value); return 'Shell 已切换为 ' + value; }, 'shell profile list|powershell|cmd', '查看或切换本机 Shell', '本机 Shell');
  add('shell pwd', async () => ShellRuntime.cwd() || (await window.tzDesktop?.validateShellCwd?.(''))?.cwd || '（桌面版启动后解析用户目录）', 'shell pwd', '查看 Shell 工作目录', '本机 Shell');
  add('shell cd', async ctx => 'Shell 工作目录：' + await ShellRuntime.setCwd(ctx.raw), 'shell cd 路径', '切换 Shell 工作目录', '本机 Shell');
  add('shell run', ctx => ShellRuntime.run(ctx.raw, ctx), 'shell run 命令', '在 PowerShell/CMD 执行任意命令', '本机 Shell');
  add('shell jobs', () => { const jobs = [...ShellRuntime.jobs.values()]; return jobs.map(job => job.id + '  ' + job.status + '  ' + job.profile + '  ' + job.command).join('\n') || '（暂无 Shell 任务）'; }, 'shell jobs', '列出 Shell 任务', '本机 Shell');
  add('shell stop', ctx => ShellRuntime.stop(ctx.raw), 'shell stop 任务id', '停止 Shell 任务', '本机 Shell');
  add('shell env', ctx => ShellRuntime.run(ShellRuntime.profile() === 'cmd' ? 'set' : 'Get-ChildItem Env: | Sort-Object Name', ctx), 'shell env', '查看 Shell 环境变量', '本机 Shell');
  add('dev eval', 'js', 'dev eval JavaScript', '执行 JavaScript 开发者代码', '开发', { aliases: ['js'], preserveRaw: true });
  add('dev echo', ctx => ctx.args.join(' '), 'dev echo 文本', '原样输出文本', '开发', { aliases: ['echo'] });

  CLI.registry = registry;
  CLI.tasks = new window.TZCLIEngine.TaskManager(registry);
}

initCLIRegistry();
function need(v, usage) { if (!v) throw new Error('用法：' + usage); }
function parseOnOff(r) {
  const v = String(r || '').toLowerCase();
  if (['on', '开', 'true', '1', '开启'].includes(v)) return true;
  if (['off', '关', 'false', '0', '关闭'].includes(v)) return false;
  throw new Error('参数只能是 on 或 off');
}
function maskKey(k) { if (!k) return '（未设置）'; if (k.length <= 8) return '****'; return k.slice(0, 4) + '…' + k.slice(-4); }
// v3.2 修复：AI 悬浮窗模式下，创建窗口的命令追加"需在主 OS 桌面查看"提示，
// 避免 AI 误以为窗口已显示在悬浮窗中
function floatTip(name) {
  return (window.__tzFloatMode ? '（窗口已创建，请在主 OS 桌面查看，悬浮窗无法显示完整窗口）' : '');
}

/* ---- 在内置浏览器打开网页（供 openurl/go/tzOpenInBrowser 复用；网页版与桌面版通用） ---- */
function openInOsBrowser(urlOrQuery) {
  let u = String(urlOrQuery || '').trim();
  if (!u) return;
  if (!/^https?:\/\//i.test(u)) {
    if (/^[\w-]+(\.[\w-]+)+/.test(u)) u = 'https://' + u;
    else u = 'https://www.bing.com/search?q=' + encodeURIComponent(u);
  }
  const exist = WM.focusApp('browser');
  if (!exist) launchApp('browser');
  let n = 0;
  (function wait() { if (window.__tzBrNewTab) { window.__tzBrNewTab(u); } else if (++n < 120) { setTimeout(wait, 30); } })();
}

/* ---- 解析时长文本为秒：支持 300 / 90s / 5m / 1h30m / 1:30 ---- */
function parseDuration(s) {
  s = String(s || '').trim().toLowerCase();
  if (!s) return 0;
  if (/^\d+$/.test(s)) return parseInt(s, 10); // 纯数字按秒
  const colon = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (colon) return (parseInt(colon[1] || 0, 10) * 3600) + parseInt(colon[2], 10) * 60 + parseInt(colon[3], 10);
  let sec = 0, m;
  const re = /(\d+(?:\.\d+)?)\s*(h|hr|小时|m|min|分|s|sec|秒)/g;
  while ((m = re.exec(s))) {
    const v = parseFloat(m[1]); const u = m[2];
    if (u === 'h' || u === 'hr' || u === '小时') sec += v * 3600;
    else if (u === 'm' || u === 'min' || u === '分') sec += v * 60;
    else sec += v;
  }
  return Math.round(sec);
}

/* ===================== 软件命令包注册表 =====================
 * 已安装软件（含自定义软件）可注册自己的命令，用 cmd 应用id 指令 调用。
 * 注册方式（v3.1.1 起推荐）：软件内调用 TZOS_CMD.register([{cmd, desc, js}])
 *   —— TZOS_CMD 由 injectAppBootstrap 注入，自动使用真实应用 id。
 * 兼容旧方式：localStorage 键 tz_app_cmds_<应用id>（注入的 shim 会把错误 id 改写到正确键）。
 * 执行方式：js 字符串经 postMessage 送进软件自己的 iframe 内执行（可调用软件内部函数），
 *   可用变量 args（参数字符串）、appId、api、app；return 的值（可为 Promise）回显到命令行。
 * 教程见 APP_STORE_TUTORIAL（installhelp 命令 / 软件商城提示词内置）。 */
const AppAIGuard = {
  states: new Map(),
  normalize(command) { return String(command || '').replace(/\s+/g, ' ').trim().toLowerCase(); },
  isAICommand(command) {
    const value = this.normalize(command);
    return /^ask\s+/.test(value) || (/^agent\s+/.test(value) && !/^agent\s+(?:on|off|开|关|true|false|1|0|开启|关闭)$/.test(value)) || /^ai\s+(?:ask|agent)\s+/.test(value);
  },
  fingerprint(value) {
    const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    let hash = 5381;
    for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
    return (hash >>> 0).toString(36) + ':' + text.length;
  },
  state(appId) {
    if (!this.states.has(appId)) this.states.set(appId, { risk: 0, lastAt: 0, averageInterval: 0, events: [], active: new Map(), blockedUntil: 0, total: 0, stopped: 0 });
    return this.states.get(appId);
  },
  trip(appId, state, reason) {
    state.stopped += 1;
    const cooldown = Math.min(120000, Math.round(15000 * (1 + state.risk / 8)));
    state.blockedUntil = Date.now() + cooldown;
    state.active.forEach(item => { try { item.controller.abort(); } catch (_) {} });
    state.active.clear();
    Store.addNotif({ title: '已掐断应用 AI 滥用', body: (findApp(appId)?.name || appId) + '：' + reason });
    if (typeof AgentActivity !== 'undefined') AgentActivity._refresh();
    return '系统检测到应用 AI 调用存在滥用模式（' + reason + '），已掐断正在进行的请求并临时熔断。';
  },
  begin(appId, command) {
    if (!this.isAICommand(command)) return null;
    const state = this.state(appId);
    const now = Date.now();
    if (state.blockedUntil > now) throw new Error('应用 AI 调用已被系统实时监管熔断，请稍后重试');
    const normalized = this.normalize(command);
    const interval = state.lastAt ? now - state.lastAt : 0;
    const elapsed = state.lastAt ? now - state.lastAt : 0;
    state.risk *= Math.exp(-elapsed / 20000);
    if (interval > 0) {
      if (state.averageInterval > 0 && interval < Math.max(180, state.averageInterval * 0.16)) state.risk += 2.2;
      state.averageInterval = state.averageInterval ? state.averageInterval * 0.75 + interval * 0.25 : interval;
    }
    const recent = state.events.filter(item => now - item.at < 120000);
    const repeats = recent.filter(item => item.command === normalized).length;
    if (repeats) state.risk += Math.min(5, 1.5 + repeats * 1.2);
    if (state.active.size) state.risk += Math.min(4, state.active.size * 1.4);
    state.events = recent;
    state.lastAt = now;
    state.total += 1;
    if (state.risk >= 8) throw new Error(this.trip(appId, state, repeats ? '短时间重复提出相同 AI 请求' : '请求密度与并发量异常'));
    const id = 'app-ai-' + now.toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    const controller = new AbortController();
    const event = { id, at: now, command: normalized, result: '', controller };
    state.events.push(event);
    state.active.set(id, event);
    if (typeof AgentActivity !== 'undefined') AgentActivity._refresh();
    return { id, appId, state, controller, event };
  },
  finish(token, result) {
    if (!token) return;
    const { state, event } = token;
    state.active.delete(token.id);
    event.result = this.fingerprint(result && result.out);
    if (state.blockedUntil > Date.now()) return;
    const previous = [...state.events].reverse().find(item => item !== event && item.command === event.command && item.result);
    if (previous && previous.result === event.result) state.risk += 2.5;
    else state.risk = Math.max(0, state.risk - 0.8);
    if (state.risk >= 8) this.trip(token.appId, state, '重复请求持续得到相同结果，未产生新进展');
    if (typeof AgentActivity !== 'undefined') AgentActivity._refresh();
  },
  snapshot(appId) {
    const entries = appId ? [[appId, this.state(appId)]] : [...this.states.entries()];
    return entries.map(([id, state]) => ({ appId: id, appName: findApp(id)?.name || id, total: state.total, active: state.active.size, stopped: state.stopped, risk: +state.risk.toFixed(2), blockedUntil: state.blockedUntil }));
  }
};
const AgentActivity = {
  seq: 0,
  active: new Map(),
  recent: [],
  _refresh() {
    const win = WM.findWindow('agent-center');
    if (!win || !win.body || !win.body.isConnected) return;
    const list = win.body.querySelector('#agentActivityList');
    const guard = win.body.querySelector('#agentGuardList');
    if (list) list.innerHTML = agentActivityListHTML();
    if (guard) guard.innerHTML = agentGuardListHTML();
  },
  begin(kind, title, cancel) {
    const id = 'agent-' + Date.now().toString(36) + '-' + (++this.seq);
    const item = { id, kind, title: String(title || '').slice(0, 180), startedAt: Date.now(), status: 'running', commands: [], cancel: typeof cancel === 'function' ? cancel : null };
    this.active.set(id, item);
    this._refresh();
    return id;
  },
  command(id, command, result) {
    const item = this.active.get(id);
    if (!item) return;
    item.commands.push({
      command: String(command || '').slice(0, 500),
      ok: !result || result.ok !== false,
      out: String(result && result.out != null ? result.out : '').slice(0, 1200),
      at: Date.now()
    });
    if (item.commands.length > 80) item.commands.splice(0, item.commands.length - 80);
    this._refresh();
  },
  finish(id, status = 'completed', detail = '') {
    const item = this.active.get(id);
    if (!item) return;
    item.status = status;
    item.detail = String(detail || '').slice(0, 500);
    item.endedAt = Date.now();
    item.cancel = null;
    this.active.delete(id);
    this.recent.unshift(item);
    if (this.recent.length > 60) this.recent.length = 60;
    this._refresh();
  },
  stop(id) {
    const item = this.active.get(id);
    if (!item || !item.cancel) return false;
    item.status = 'cancelling';
    try { item.cancel(); } catch (_) {}
    this._refresh();
    return true;
  },
  snapshot() { return { active: [...this.active.values()], recent: this.recent.slice() }; }
};
const AppCommands = {
  key: (appId) => 'tz_app_cmds_' + appId,
  _pending: {}, _reqSeq: 0, _listening: false,
  _sourceAppId(source) {
    const match = WM.windows.find(win => {
      if (!win || !win.app || win.app.type !== 'installed') return false;
      const frame = win.body && win.body.querySelector('iframe');
      return !!frame && frame.contentWindow === source;
    });
    return match ? match.appId : '';
  },
  load(appId) {
    try { const v = JSON.parse(localStorage.getItem(this.key(appId)) || '[]'); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  },
  save(appId, list) {
    localStorage.setItem(this.key(appId), JSON.stringify(list || []));
    this.syncRegistry(appId, list || []);
  },
  syncRegistry(appId, list) {
    if (!CLI.registry || typeof CLI.registry.unregister !== 'function') return;
    CLI.registry.unregister(spec => spec.dynamicAppId === appId);
    const app = findApp(appId);
    if (!app) return;
    (Array.isArray(list) ? list : this.load(appId)).forEach(def => {
      const command = String(def && def.cmd || '').trim().toLowerCase();
      if (!command || /\s/.test(command)) return;
      CLI.registry.register({
        path: ['app', appId, command],
        usage: 'app ' + appId + ' ' + command + ' [参数]',
        description: (def.desc || '调用应用指令') + '（' + app.name + '）',
        group: '应用扩展',
        dynamicAppId: appId,
        handler: async ctx => {
          const out = await this.exec(appId, command + (ctx.raw ? ' ' + ctx.raw : ''), ctx);
          return { out, data: { kind: 'app-command', appId, appName: app.name, command, args: ctx.raw } };
        }
      });
    });
  },
  syncAllRegistries() { getAllApps().forEach(app => this.syncRegistry(app.id, this.load(app.id))); },
  _ensureListener() {
    if (this._listening) return;
    this._listening = true;
    window.addEventListener('message', (ev) => {
      // 沙箱应用的同步 Storage 兼容层：只接受当前已安装应用 iframe 的写入，
      // 并限制单键与单应用总量，避免任意 frame 或异常应用污染系统存储。
      const sw = ev.data && ev.data.__tzStorageWrite;
      if (sw && sw.appId && typeof sw.op === 'string') {
        const sourceAppId = this._sourceAppId(ev.source);
        if (!sourceAppId || sourceAppId !== sw.appId) return;
        const storageKey = 'tz_app_storage_' + sourceAppId;
        let data = {};
        try {
          const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
          if (saved && typeof saved === 'object' && !Array.isArray(saved)) data = saved;
        } catch (e) {}
        const op = sw.op;
        const key = String(sw.key == null ? '' : sw.key).slice(0, 256);
        if (op === 'clear') {
          data = {};
        } else if (op === 'remove') {
          delete data[key];
        } else if (op === 'set') {
          const value = String(sw.value == null ? '' : sw.value);
          if (!key || value.length > 2 * 1024 * 1024) return;
          data[key] = value;
        } else {
          return;
        }
        try {
          const encoded = JSON.stringify(data);
          if (encoded.length <= 4 * 1024 * 1024) localStorage.setItem(storageKey, encoded);
        } catch (e) {}
        return;
      }
      // v3.5：软件内调用系统命令行（TZOS_CMD.exec）——在父页执行 CLI 并把输出回传给软件
      const se = ev.data && ev.data.__tzSysExec;
      if (se && se.reqId != null && typeof se.cmd === 'string') {
        (async () => {
          let ok = true, out = '';
          let guardToken = null;
          try {
            const appFrame = WM.findWindow(se.appId)?.body?.querySelector('iframe');
            if (!findApp(se.appId) || !appFrame || appFrame.contentWindow !== ev.source) throw new Error('应用身份验证失败');
            guardToken = AppAIGuard.begin(se.appId, se.cmd);
            const r = await CLI.exec(se.cmd, { byApp: true, appId: se.appId, signal: guardToken && guardToken.controller.signal });
            ok = !!(r && r.ok !== false);
            out = r ? String(r.out == null ? '' : r.out) : '';
          } catch (e) { ok = false; out = (e && e.message) || String(e); }
          finally { AppAIGuard.finish(guardToken, { ok, out }); }
          try { ev.source && ev.source.postMessage({ __tzSysResult: { reqId: se.reqId, ok, value: out } }, '*'); } catch (e) {}
        })();
        return;
      }
      const reg = ev.data && ev.data.__tzCmdRegister;
      if (reg && reg.appId && Array.isArray(reg.list)) {
        const sourceAppId = this._sourceAppId(ev.source);
        if (!sourceAppId || sourceAppId !== reg.appId) return;
        const safeList = reg.list.slice(0, 100).map(item => ({
          cmd: String(item && item.cmd || '').trim().slice(0, 64),
          desc: String(item && item.desc || '').slice(0, 240),
          js: String(item && item.js || '').slice(0, 200000)
        })).filter(item => item.cmd && item.js);
        try { this.save(sourceAppId, safeList); } catch (e) {}
        return;
      }
      const ready = ev.data && ev.data.__tzCmdReady;
      if (ready && ready.appId) {
        const sourceAppId = this._sourceAppId(ev.source);
        if (!sourceAppId || sourceAppId !== ready.appId) return;
        const win = WM.findWindow(sourceAppId);
        const frame = win && win.body && win.body.querySelector('iframe');
        if (frame && frame.contentWindow === ev.source) frame.dataset.tzReady = '1';
        return;
      }
      const res = ev.data && ev.data.__tzCmdResult;
      if (res && this._pending[res.reqId]) {
        const p = this._pending[res.reqId];
        if (p.source !== ev.source || this._sourceAppId(ev.source) !== p.appId) return;
        delete this._pending[res.reqId];
        if (p.timer) clearTimeout(p.timer);
        if (p.signal && p.onAbort) p.signal.removeEventListener('abort', p.onAbort);
        p.resolve(res);
      }
    });
  },
  all() {
    const out = [];
    getAllApps().forEach(a => {
      this.load(a.id).forEach(c => out.push({ appId: a.id, appName: a.name, cmd: c.cmd, desc: c.desc || '' }));
    });
    return out;
  },
  listText() {
    const all = this.all();
    if (!all.length) return '（暂无软件注册命令包。自定义软件在代码里调用 TZOS_CMD.register 注册，教程见 installhelp）';
    return all.map(c => c.appId + ' :: ' + c.cmd + (c.desc ? ' — ' + c.desc : '') + '（' + c.appName + '）').join('\n');
  },
  // 找到应用窗口的 iframe（未打开则自动打开并等待其引导注入就绪）
  async _ensureFrame(appId, signal) {
    let w = WM.findWindow(appId);
    if (!w) { launchApp(appId); w = WM.findWindow(appId); }
    if (!w) return null;
    while (WM.windows.includes(w)) {
      if (signal && signal.aborted) throw new DOMException('已停止', 'AbortError');
      const f = w.body && w.body.querySelector('iframe');
      if (f && f.contentWindow && f.dataset.tzReady === '1') return f;
      await new Promise(r => setTimeout(r, 100));
    }
    return null;
  },
  async exec(appId, rest, options = {}) {
    const app = findApp(appId);
    if (!app) throw new Error('应用不存在：' + appId);
    const sp = rest.indexOf(' ');
    const cmd = (sp < 0 ? rest : rest.slice(0, sp)).trim();
    const args = sp < 0 ? '' : rest.slice(sp + 1).trim();
    if (!cmd) {
      const list = this.load(appId);
      return list.length ? ('「' + app.name + '」可用指令：\n' + list.map(c => '  ' + c.cmd + (c.desc ? '  — ' + c.desc : '')).join('\n')) : '「' + app.name + '」未注册任何命令';
    }
    const def = this.load(appId).find(c => c.cmd === cmd);
    if (!def) throw new Error('「' + app.name + '」没有指令「' + cmd + '」（用 cmd ' + appId + ' 查看）');
    // 非自定义软件（builtin/preset）没有 iframe 桥，兜底在父页面执行
    if (app.type !== 'installed') {
      try {
        const fn = new Function('args', 'appId', 'api', 'app', def.js);
        const ret = await fn(args, appId, window.TZOS, app);
        return (ret === undefined) ? '（已执行）' : String(ret);
      } catch (e) { throw new Error('指令执行出错：' + (e.message || e)); }
    }
    // 自定义软件：桥接进软件 iframe 内执行（window.* 即软件自身作用域）
    this._ensureListener();
    const frame = await this._ensureFrame(appId, options.signal);
    if (!frame || !frame.contentWindow) throw new Error('无法打开「' + app.name + '」的窗口');
    const reqId = 'r' + (++this._reqSeq) + '_' + Date.now();
    const replyP = new Promise((resolve) => {
      const onAbort = () => {
        const pending = this._pending[reqId];
        if (pending && pending.timer) clearTimeout(pending.timer);
        delete this._pending[reqId];
        resolve({ ok: false, value: '已停止执行软件指令' });
      };
      if (options.signal && options.signal.aborted) { onAbort(); return; }
      if (options.signal) options.signal.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => {
        const pending = this._pending[reqId];
        if (!pending) return;
        delete this._pending[reqId];
        if (pending.signal && pending.onAbort) pending.signal.removeEventListener('abort', pending.onAbort);
        resolve({ ok: false, value: '应用指令等待超时，可刷新应用后重试' });
      }, 60000);
      this._pending[reqId] = { resolve, signal: options.signal || null, onAbort, timer, source: frame.contentWindow, appId };
    });
    frame.contentWindow.postMessage({ __tzCmdExec: { reqId, js: def.js, args } }, '*');
    const res = await replyP;
    if (!res.ok) throw new Error(res.value);
    return res.value;
  }
};
AppCommands.syncAllRegistries();

/* ===================== AI 软件商城提示词（installhelp 返回 + 注入生成提示词） ===================== */
const APP_STORE_TUTORIAL = `【天择OS 软件命令包接入教程】
你的软件可以被天择OS命令行直接操控。系统已为每个软件注入 TZOS_CMD 对象与真实应用 id（window.TZOS_APP_ID），不需要、也绝不要自己猜或写死应用 id。

1) 注册（软件启动时执行一次）：
TZOS_CMD.register([
  { cmd: 'add',  desc: '新增一条记录', js: "window.appAdd(args); return '已新增：'+args;" },
  { cmd: 'list', desc: '列出全部记录', js: "return window.appList();" }
]);

2) 每条命令的 js 字符串会在【你的软件内部】执行，因此可以直接调用你在软件里定义的全局函数（如 window.appAdd / window.appList）。可用变量：
   - args：命令行传入的参数字符串（如 cmd myapp add 买牛奶 里 args='买牛奶'）
   - appId：本软件 id（与 window.TZOS_APP_ID 相同）
   - api：{ appId, version } 系统信息；app：本软件元数据 { id, name }
   - js 的返回值（可以是 Promise）会回显到命令行；抛出的错误会作为错误信息显示

3) 用户即可这样操控你的软件（执行时系统会自动打开软件窗口）：
   cmd 你的应用id add 买牛奶      → 新增一条
   cmd 你的应用id list            → 列出全部
   cmd list                       → 查看全部软件已注册的命令

完整示例（待办软件）：
  window.todos = JSON.parse(localStorage.getItem('my_todos') || '[]');
  window.todoAdd = function (t) { window.todos.push(t); localStorage.setItem('my_todos', JSON.stringify(window.todos)); render(); };
  window.todoList = function () { return window.todos.map((t, i) => (i + 1) + '. ' + t).join('\\n') || '（空）'; };
  TZOS_CMD.register([
    { cmd: 'add',  desc: '加一条待办', js: "window.todoAdd(args); return '已添加：' + args;" },
    { cmd: 'list', desc: '列出待办',   js: "return window.todoList();" }
  ]);
不需要命令操控的软件可跳过本教程。

4) 反过来，你的软件也可以随时调用【系统命令行】并拿到输出（v3.5 新增）：
   const out = await TZOS_CMD.exec('note list');  // out 就是命令行输出文本
   - 与用户终端可用的命令完全一致（help 列出的全部命令，含 ask 与其它软件注册的 cmd 应用id 指令）
   - 返回 Promise<string>；异步命令（如 ask/note/coc-data/words）同样 await 即可
   - 适合调用纯 API AI、读取系统数据（笔记、单词、COC 存档）、联动打开系统应用、查询系统状态等场景`;



/* ===================== 屏幕截图（对话自动附图，需视觉模型） ===================== */
const Shot = {
  stream: null, video: null,
  supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia); },
  // 申请并保持屏幕共享流（首次需用户在弹窗中选择「此标签页」）
  async ensure() {
    if (this.stream && this.stream.active && this.video) return true;
    if (!this.supported()) return false;
    try {
      this.stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = this.stream.getVideoTracks()[0];
      if (!track) { this.stop(); return false; }
      track.onended = () => {
        // 用户从浏览器 UI 停止了共享 → 自动关闭开关
        this.stream = null; this.video = null;
        if (getScreenshotCtx()) { setScreenshotCtx(false); refreshOpenApp('settings'); refreshChatView(); toast('屏幕共享已停止，自动截图已关闭'); }
      };
      const v = document.createElement('video');
      v.srcObject = this.stream; v.muted = true;
      await v.play();
      this.video = v;
      return true;
    } catch (e) { this.stop(); return false; }
  },
  // 抓一帧为高分辨率 PNG。文字边缘不再受低质量 JPEG 压缩影响，同时限制像素总量。
  capture(maxW = 2048) {
    const v = this.video;
    if (!v || !v.videoWidth) return null;
    try {
      const maxPixels = 10 * 1024 * 1024;
      const scale = Math.min(
        1,
        maxW / v.videoWidth,
        Math.sqrt(maxPixels / Math.max(1, v.videoWidth * v.videoHeight))
      );
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(v.videoWidth * scale));
      cv.height = Math.max(1, Math.round(v.videoHeight * scale));
      const ctx = cv.getContext('2d');
      if (!ctx) return null;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(v, 0, 0, cv.width, cv.height);
      return cv.toDataURL('image/png');
    } catch (e) { return null; }
  },
  stop() {
    if (this.stream) { try { this.stream.getTracks().forEach(t => t.stop()); } catch (e) {} }
    this.stream = null; this.video = null;
  }
};

/* ===================== 4.1 内置应用共享工作区 =====================
 * 只负责应用正文的信息架构与视觉骨架。窗口标题栏、固定 ID、各 init 函数
 * 和 iframe/悬浮窗契约继续由原有系统管理。 */
function appWorkspaceHeaderHTML(icon, title, subtitle, opts = {}) {
  const eyebrow = opts.eyebrow || '天择OS · 工作区';
  const meta = opts.meta || '';
  const actions = opts.actions || '';
  return `
    <header class="app-workspace__header${opts.compact ? ' is-compact' : ''}">
      <div class="app-workspace__identity">
        <span class="app-workspace__icon">${uiIconHTML(icon, title)}</span>
        <span class="app-workspace__heading">
          <span class="app-workspace__eyebrow">${escapeHtml(eyebrow)}</span>
          <strong class="app-workspace__title">${escapeHtml(title)}</strong>
          ${subtitle ? `<span class="app-workspace__subtitle">${escapeHtml(subtitle)}</span>` : ''}
        </span>
      </div>
      ${meta ? `<div class="app-workspace__meta">${meta}</div>` : ''}
      ${actions ? `<div class="app-workspace__actions">${actions}</div>` : ''}
    </header>`;
}
function appSectionHTML(icon, title, subtitle, body, opts = {}) {
  const id = opts.id ? ` id="${escapeHtml(opts.id)}"` : '';
  const cls = opts.className ? ' ' + opts.className : '';
  const actions = opts.actions || '';
  return `
    <section class="app-section${cls}"${id}>
      <header class="app-section__header">
        <span class="app-section__icon">${uiIconHTML(icon, title)}</span>
        <span class="app-section__heading">
          <strong>${escapeHtml(title)}</strong>
          ${subtitle ? `<small>${escapeHtml(subtitle)}</small>` : ''}
        </span>
        ${actions ? `<span class="app-section__actions">${actions}</span>` : ''}
      </header>
      <div class="app-section__body">${body}</div>
    </section>`;
}
function appEmptyStateHTML(icon, title, subtitle, actions = '') {
  return `<div class="app-empty">
    <span class="app-empty__icon">${uiIconHTML(icon, title)}</span>
    <strong>${escapeHtml(title)}</strong>
    <p>${escapeHtml(subtitle)}</p>
    ${actions ? `<div class="app-empty__actions">${actions}</div>` : ''}
  </div>`;
}

function initAppWorkspaceNav(rootSelector) {
  const root = document.querySelector(`.win.focused ${rootSelector}`) || document.querySelector(rootSelector);
  if (!root) return;
  const rail = root.querySelector('.app-nav');
  const main = root.querySelector('.app-workspace__main--scroll');
  if (!rail || !main) return;

  const entries = [...rail.querySelectorAll('a.app-nav__item[href^="#"]')]
    .map(link => ({ link, target: root.querySelector(link.getAttribute('href')) }))
    .filter(entry => entry.target);
  if (!entries.length) return;

  const setActive = activeLink => {
    entries.forEach(({ link }) => {
      const active = link === activeLink;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };

  entries.forEach(({ link, target }) => {
    link.onclick = event => {
      event.preventDefault();
      setActive(link);
      main.scrollTo({ top: Math.max(0, target.offsetTop - 14), behavior: 'smooth' });
    };
  });

  let scheduled = false;
  const syncFromScroll = () => {
    scheduled = false;
    const marker = main.scrollTop + 28;
    let current = entries[0];
    entries.forEach(entry => {
      if (entry.target.offsetTop <= marker) current = entry;
    });
    setActive(current.link);
  };
  main.addEventListener('scroll', () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(syncFromScroll);
  }, { passive: true });
  syncFromScroll();
}

/* ===================== 内置应用：时钟（时钟/秒表/倒计时） ===================== */
function renderClockApp() {
  return `
  <div class="app-workspace app-workspace--compact clock-app">
    ${appWorkspaceHeaderHTML('clock', '时钟', '本地时间、秒表与专注倒计时', {
      eyebrow: '时间中枢',
      compact: true,
      meta: '<span class="app-badge">离线可用</span>'
    })}
    <div class="app-toolbar clock-tabs" role="tablist" aria-label="时钟功能">
      <button class="clock-tab active tz-icon-label" data-tab="clock">${uiIconHTML('clock')}<span>时钟</span></button>
      <button class="clock-tab tz-icon-label" data-tab="sw">${uiIconHTML('clock')}<span>秒表</span></button>
      <button class="clock-tab tz-icon-label" data-tab="cd">${uiIconHTML('clock')}<span>倒计时</span></button>
    </div>
    <div class="app-workspace__stage clock-stage">
      <div class="clock-pane app-card" data-pane="clock">
        <span class="clock-kicker">CURRENT LOCAL TIME</span>
        <div class="clock-big" id="clockBig">--:--:--</div>
        <div class="clock-date" id="clockDate"></div>
      </div>
      <div class="clock-pane app-card" data-pane="sw" hidden>
        <span class="clock-kicker">STOPWATCH</span>
        <div class="clock-big" id="swBig">00:00.0</div>
        <div class="clock-btns">
          <button class="btn sm primary" data-sw="start" id="swStart">开始</button>
          <button class="btn sm ghost" data-sw="stop" id="swStop">停止</button>
          <button class="btn sm ghost" data-sw="reset" id="swReset">归零</button>
        </div>
        <div id="swLaps" class="clock-laps"></div>
      </div>
      <div class="clock-pane app-card" data-pane="cd" hidden>
        <span class="clock-kicker">COUNTDOWN</span>
        <div class="clock-big" id="cdBig">00:00</div>
        <div class="clock-btns clock-countdown-controls">
          <input class="input" id="cdInput" placeholder="如 5m / 90s / 1:30" aria-label="倒计时时长" />
          <button class="btn sm primary" id="cdStartBtn">开始</button>
          <button class="btn sm ghost" id="cdStopBtn">停止</button>
        </div>
        <div class="clock-quick">
          ${[['1m',60],['5m',300],['10m',600],['25m',1500]].map(x=>`<button class="preset-chip" data-cd="${x[1]}">${x[0]}</button>`).join('')}
        </div>
      </div>
    </div>
  </div>`;
}
function fmtSW(ms) {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000), s = Math.floor(t % 60000 / 1000), d = Math.floor(t % 1000 / 100);
  return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0') + '.' + d;
}
function fmtCD(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec/3600), m = Math.floor(sec%3600/60), s = sec%60;
  return (h ? String(h).padStart(2,'0')+':' : '') + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}
function initClockApp() {
  const root = $('.clock-app'); if (!root) return;
  // 标签切换
  const clockTabs = [...root.querySelectorAll('.clock-tab')];
  const selectClockTab = (tab, focus = false) => {
    clockTabs.forEach(x => {
      const active = x === tab;
      x.classList.toggle('active', active);
      x.setAttribute('aria-selected', String(active));
      x.tabIndex = active ? 0 : -1;
    });
    root.querySelectorAll('.clock-pane').forEach(p => p.hidden = p.dataset.pane !== tab.dataset.tab);
    if (focus) focusSafely(tab);
  };
  clockTabs.forEach((tab, index) => {
    const pane = root.querySelector(`.clock-pane[data-pane="${tab.dataset.tab}"]`);
    tab.id = 'clock-tab-' + tab.dataset.tab;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(tab.classList.contains('active')));
    tab.tabIndex = tab.classList.contains('active') ? 0 : -1;
    if (pane) {
      pane.id = 'clock-pane-' + tab.dataset.tab;
      pane.setAttribute('role', 'tabpanel');
      pane.setAttribute('aria-labelledby', tab.id);
      tab.setAttribute('aria-controls', pane.id);
    }
    tab.onclick = () => selectClockTab(tab);
    tab.onkeydown = (event) => {
      let next = -1;
      if (event.key === 'ArrowLeft') next = (index - 1 + clockTabs.length) % clockTabs.length;
      if (event.key === 'ArrowRight') next = (index + 1) % clockTabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = clockTabs.length - 1;
      if (next >= 0) {
        event.preventDefault();
        selectClockTab(clockTabs[next], true);
      }
    };
  });
  // 时钟
  const tick = () => {
    const d = new Date();
    const b = $('#clockBig'); if (b) b.textContent = d.toLocaleTimeString('zh-CN', { hour12: false });
    const dd = $('#clockDate'); if (dd) dd.textContent = fmtDate(d) + ' 星期' + '日一二三四五六'[d.getDay()];
  };
  tick(); const clockTimer = setInterval(() => {
    // 自检：root 仍在 DOM 中才继续走表（替代废弃的 DOMNodeRemoved 事件，避免误触发导致时钟走 1 秒就停）
    if (!document.body.contains(root)) { clearInterval(clockTimer); return; }
    tick();
  }, 1000);
  // 秒表
  let swT0 = 0, swAcc = 0, swRun = false, swRaf = 0;
  const swBig = $('#swBig');
  const swPaint = () => {
    if (!root.isConnected) { swRun = false; swRaf = 0; return; }
    if (swBig) swBig.textContent = fmtSW(swAcc + (swRun ? Date.now() - swT0 : 0));
    if (swRun) swRaf = requestAnimationFrame(swPaint);
  };
  const swStart = $('#swStart'), swStop = $('#swStop'), swReset = $('#swReset');
  if (swStart) swStart.onclick = () => { if (swRun) return; swRun = true; swT0 = Date.now(); swPaint(); };
  if (swStop) swStop.onclick = () => { if (!swRun) return; swRun = false; swAcc += Date.now() - swT0; cancelAnimationFrame(swRaf); swPaint(); };
  if (swReset) swReset.onclick = () => { swRun = false; swAcc = 0; cancelAnimationFrame(swRaf); swPaint(); const l = $('#swLaps'); if (l) l.innerHTML = ''; };
  // 倒计时
  let cdEnd = 0, cdTimer = 0;
  const cdBig = $('#cdBig');
  const cdPaint = () => {
    const left = (cdEnd - Date.now()) / 1000;
    if (left <= 0) {
      clearInterval(cdTimer); cdTimer = 0;
      if (cdBig) cdBig.textContent = '00:00';
      Store.addNotif({ title: '倒计时结束', body: '设定的倒计时时间到了', iconKey: 'clock' });
      toast('⏳ 倒计时结束！', 4000);
      return;
    }
    if (cdBig) cdBig.textContent = fmtCD(left);
  };
  const cdStart = (sec) => {
    if (!(sec > 0)) { toast('请输入有效时长'); return; }
    cdEnd = Date.now() + sec * 1000;
    if (cdTimer) clearInterval(cdTimer);
    cdTimer = setInterval(cdPaint, 200);
    cdPaint();
    // 切到倒计时页
    const tab = root.querySelector('.clock-tab[data-tab="cd"]'); if (tab) tab.click();
  };
  window.__tzCdStart = cdStart; // 供命令行 timer 调用
  const cdStartBtn = $('#cdStartBtn'), cdStopBtn = $('#cdStopBtn'), cdInput = $('#cdInput');
  if (cdStartBtn) cdStartBtn.onclick = () => cdStart(parseDuration(cdInput.value));
  if (cdInput) cdInput.onkeydown = (e) => { if (e.key === 'Enter') cdStart(parseDuration(cdInput.value)); };
  if (cdStopBtn) cdStopBtn.onclick = () => { if (cdTimer) clearInterval(cdTimer); cdTimer = 0; if (cdBig) cdBig.textContent = '00:00'; };
  root.querySelectorAll('[data-cd]').forEach(b => b.onclick = () => { if (cdInput) cdInput.value = ''; cdStart(parseInt(b.dataset.cd, 10)); });
  const hostWin = root.closest('.win');
  const winObj = hostWin && WM.windows.find(item => item.el === hostWin);
  if (winObj) {
    const previousClose = winObj.onClose;
    winObj.onClose = () => {
      swRun = false;
      cancelAnimationFrame(swRaf);
      clearInterval(clockTimer);
      if (cdTimer) clearInterval(cdTimer);
      if (window.__tzCdStart === cdStart) delete window.__tzCdStart;
      if (typeof previousClose === 'function') previousClose();
    };
  }
}
// 供命令行 timer 在已打开的时钟窗口里启动倒计时
function startCountdownInApp(body, sec) {
  const tab = body.querySelector('.clock-tab[data-tab="cd"]'); if (tab) tab.click();
  if (window.__tzCdStart) window.__tzCdStart(sec);
}

/* ===================== 内置应用：文档阅读器 =====================
 * 支持 docx / pptx / xlsx / pdf / html（pdf/html 用内置预览，Office 用 CDN 库转 HTML） */
const DOC_CDN = {
  pdfjs: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  pdfjsWorker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
  mammoth: 'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js',
  xlsx: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  jszip: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
};
function renderDocReader() {
  // v3.1.1：标签页栏并入窗口标题栏（#docTabsTitle 由 WM 创建）；取消缩放工具栏，仅 Ctrl+滚轮缩放
  return `
  <div class="app-workspace app-workspace--tool doc-app">
    <input type="file" id="docFile" style="display:none" accept=".docx,.pptx,.xlsx,.pdf,.html,.htm,.txt,.md" />
    <div class="app-toolbar doc-toolbar">
      <span class="app-toolbar__label tz-icon-label">${uiIconHTML('document')}<span>本地文档工作区</span></span>
      <span class="app-toolbar__hint">多标签 · 拖放打开 · Ctrl + 滚轮缩放</span>
      <span class="app-toolbar__spacer"></span>
      <button class="btn sm ghost tz-icon-label" id="docKnowledgeBtn" disabled title="文档解析完成后可显式加入本机 AI 知识库">${uiIconHTML('ai')}<span>加入 AI 知识库</span></button>
      <button class="btn sm primary tz-icon-label" id="docPickBtn">${uiIconHTML('folder')}<span>打开文件</span></button>
    </div>
    <div class="app-workspace__stage doc-stage" id="docStage">
      <div class="doc-open app-empty" id="docOpen">
        <div class="app-empty__icon doc-open-icon">${uiIconHTML('document', '文档')}</div>
        <strong class="doc-open-title">把文档带进工作区</strong>
        <p class="doc-open-sub">支持 Word · PPT · Excel · PDF · HTML · txt · Markdown</p>
        <div class="app-empty__meta doc-open-tip">拖放文件到窗口，或使用上方“打开文件”；每份文档都会进入独立标签页。</div>
      </div>
    </div>
  </div>`;
}
function initDocReader() {
  const stage = $('#docStage'), openEl = $('#docOpen');
  const tabsBar = $('#docTabsTitle'); // 位于窗口标题栏（WM 创建）
  if (!stage) return;
  const fin = $('#docFile');
  const docs = []; // {id,name,el,zoom,knowledgeId,source,ready}
  let activeId = null, seq = 0;
  const pick = () => { if (fin) fin.click(); };
  const pickBtn = $('#docPickBtn');
  const knowledgeBtn = $('#docKnowledgeBtn');
  if (pickBtn) pickBtn.onclick = pick;
  if (fin) fin.onchange = () => { [...fin.files].forEach(loadFile); fin.value = ''; };

  // 标题栏中的"＋"新标签按钮（与浏览器一致的 br-tab-plus 外观）
  let plusBtn = null;
  if (tabsBar) {
    tabsBar.innerHTML = '';
    plusBtn = el('button', 'br-tab-plus', '＋');
    plusBtn.title = '打开文档';
    plusBtn.onclick = pick;
    tabsBar.appendChild(plusBtn);
  }

  function activeDoc() { return docs.find(d => d.id === activeId); }
  function documentSearchText(d) {
    if (!d || !d.el) return '';
    if (d.searchText) return SiteAI.cleanText(d.searchText, 120000);
    const pdf = d.el.querySelector('.doc-pdf');
    if (pdf && pdf.__tzKnowledgeText) return SiteAI.cleanText(pdf.__tzKnowledgeText, 120000);
    const frame = d.el.querySelector('.doc-frame');
    if (frame) {
      try {
        const frameText = frame.contentDocument && frame.contentDocument.body
          ? frame.contentDocument.body.innerText
          : '';
        if (frameText) return SiteAI.cleanText(frameText, 120000);
      } catch (_) {}
    }
    return SiteAI.cleanText(d.el.innerText, 120000);
  }
  async function refreshKnowledgeButton() {
    if (!knowledgeBtn) return;
    const d = activeDoc();
    knowledgeBtn.disabled = !d || !d.ready;
    if (!d || !d.ready) {
      knowledgeBtn.innerHTML = uiIconHTML('ai') + '<span>加入 AI 知识库</span>';
      knowledgeBtn.title = d ? '正在解析文档，完成后可加入本机 AI 知识库' : '先打开并选择一份文档';
      return;
    }
    const exists = await KnowledgeStore.getDoc(d.knowledgeId);
    if (activeDoc() !== d) return;
    knowledgeBtn.classList.toggle('primary', !!exists);
    knowledgeBtn.classList.toggle('ghost', !exists);
    knowledgeBtn.innerHTML = uiIconHTML(exists ? 'check' : 'ai') +
      '<span>' + (exists ? '已加入 AI 知识库' : '加入 AI 知识库') + '</span>';
    knowledgeBtn.title = exists
      ? '点击从本机 AI 知识库移除；文档正文不会自动上传'
      : '显式加入后在本机检索；只有命中摘录会随 AI 请求发送';
  }
  if (knowledgeBtn) knowledgeBtn.onclick = async () => {
    const d = activeDoc();
    if (!d || !d.ready) return;
    knowledgeBtn.disabled = true;
    const exists = await KnowledgeStore.getDoc(d.knowledgeId);
    if (exists) {
      await KnowledgeStore.removeDoc(d.knowledgeId);
      toast('已从本机 AI 知识库移除「' + d.name + '」');
    } else {
      const text = documentSearchText(d);
      if (!text) {
        toast('这份文档没有可检索文字，未加入知识库', 3000);
        await refreshKnowledgeButton();
        return;
      }
      try {
        await KnowledgeStore.putDoc({ id: d.knowledgeId, title: d.name, source: d.source, text });
        toast('已加入本机 AI 知识库；仅命中摘录会随请求发送', 3600);
      } catch (error) {
        toast('加入知识库失败：' + (error && error.message ? error.message : error), 3200);
      }
    }
    await refreshKnowledgeButton();
  };
  function refreshTabs() {
    if (!tabsBar) return;
    tabsBar.querySelectorAll('.doc-tab').forEach(t => t.remove());
    docs.forEach(d => {
      const tab = el('button', 'br-tab doc-tab' + (d.id === activeId ? ' active' : ''));
      tab.innerHTML = `<span class="br-tab-label dt-label">${escapeHtml(d.name)}</span><span class="br-x dt-x" title="关闭">${uiIconHTML('close', '关闭')}</span>`;
      tab.title = d.name;
      tab.onclick = (e) => { if (e.target.closest('.dt-x')) closeDoc(d.id); else activate(d.id); };
      tabsBar.insertBefore(tab, plusBtn);
    });
    if (openEl) openEl.style.display = docs.length ? 'none' : '';
  }
  function activate(id) {
    activeId = id;
    docs.forEach(d => { d.el.style.display = d.id === id ? '' : 'none'; });
    refreshTabs();
    void refreshKnowledgeButton();
  }
  function closeDoc(id) {
    const i = docs.findIndex(d => d.id === id);
    if (i < 0) return;
    docs[i].el.remove(); docs.splice(i, 1);
    if (!docs.length) { activeId = null; refreshTabs(); void refreshKnowledgeButton(); return; }
    if (activeId === id) activate(docs[Math.min(i, docs.length - 1)].id); else refreshTabs();
  }
  // 按类型把数据渲染进 pane（本地文件与在线 URL 共用）
  function renderDocData(ext, data, pane, fail, done, onReady) {
    if (ext === 'pdf') {
      renderPdf(new Uint8Array(data), pane, fail, () => onReady());
    } else if (ext === 'docx') {
      ensureLib('mammoth', DOC_CDN.mammoth).then(() =>
        window.mammoth.convertToHtml({ arrayBuffer: data }).then(r => done(r.value || '<p>（空文档）</p>')).catch(e => fail(e.message))
      ).catch(e => fail('加载解析库失败：' + e.message));
    } else if (ext === 'xlsx') {
      ensureLib('XLSX', DOC_CDN.xlsx).then(() => {
        try {
          const wb = window.XLSX.read(data, { type: 'array' });
          let html = '';
          wb.SheetNames.forEach(sn => { html += '<h3 class="tz-icon-label" style="margin:14px 0 6px">' + uiIconHTML('newspaper') + '<span>' + escapeHtml(sn) + '</span></h3>' + window.XLSX.utils.sheet_to_html(wb.Sheets[sn], { header: '', footer: '' }); });
          done(html || '<p>（空表格）</p>');
        } catch (e) { fail(e.message); }
      }).catch(e => fail('加载解析库失败：' + e.message));
    } else if (ext === 'pptx') {
      renderPptx(data, pane, fail, () => onReady());
    } else if (ext === 'html' || ext === 'htm') {
      // HTML 全功能运行：allow-scripts 让内联 JS 与交互可用（外部脚本受 CSP 限制）
      pane.innerHTML = '';
      const f = document.createElement('iframe');
      f.className = 'doc-frame';
      f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups');
      f.srcdoc = data;
      f.onload = () => onReady();
      pane.appendChild(f);
    } else if (ext === 'md') {
      // Markdown 用系统渲染器（含 LaTeX 公式）
      const html = '<div class="doc-md">' + renderMd(String(data)) + '</div>';
      done(html);
      ensureKatex().then(() => {
        const c = pane.querySelector('.doc-content');
        if (c && window.renderMathInElement) { try { window.renderMathInElement(c, KATEX_OPTS); } catch (e) {} }
      }).catch(() => {});
    } else if (ext === 'txt') {
      done('<pre style="white-space:pre-wrap;word-break:break-word;font:13px/1.7 inherit">' + escapeHtml(String(data)) + '</pre>');
    } else {
      fail('暂不支持 .' + ext + ' 格式（支持 docx / pptx / xlsx / pdf / html / txt / md）');
    }
  }
  function loadFile(file) {
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const pane = el('div', 'doc-pane');
    pane.innerHTML = '<div class="app-loading"><div class="al-spin"></div><div>正在解析 ' + escapeHtml(file.name) + '…</div></div>';
    stage.appendChild(pane);
    const d = {
      id: ++seq,
      name: file.name,
      el: pane,
      zoom: { mode: 'percent', value: 100 },
      knowledgeId: 'file:' + file.name + ':' + file.size + ':' + file.lastModified,
      source: '本地文件 · ' + file.name,
      ready: false
    };
    docs.push(d); activate(d.id);
    const onReady = () => {
      applyZoom(d);
      d.ready = true;
      d.searchText = documentSearchText(d);
      if (activeDoc() === d) void refreshKnowledgeButton();
    };
    const fail = (msg) => {
      d.ready = false;
      pane.innerHTML = '<div class="app-error"><div class="ae-icon">' + uiIconHTML('warning', '警告') + '</div>' + escapeHtml(msg || '解析失败') + '</div>';
      if (activeDoc() === d) void refreshKnowledgeButton();
    };
    const done = (html) => { pane.innerHTML = '<div class="doc-content">' + html + '</div>'; onReady(); };
    const rd = new FileReader();
    const isText = (ext === 'html' || ext === 'htm' || ext === 'txt' || ext === 'md');
    rd.onload = () => renderDocData(ext, rd.result, pane, fail, done, onReady);
    rd.onerror = () => fail('读取文件失败');
    if (isText) rd.readAsText(file); else rd.readAsArrayBuffer(file);
  }
  // 在线文档：docs open URL 命令经 __tzDocOpenUrl 调入；同时记录"最近打开"
  function loadFromUrl(url) {
    const name = decodeURIComponent((url.split('/').pop() || '').split('?')[0]) || '在线文档';
    const ext = (name.split('.').pop() || '').toLowerCase();
    const pane = el('div', 'doc-pane');
    pane.innerHTML = '<div class="app-loading"><div class="al-spin"></div><div>正在获取 ' + escapeHtml(name) + '…</div></div>';
    stage.appendChild(pane);
    const d = {
      id: ++seq,
      name: name + '（在线）',
      el: pane,
      zoom: { mode: 'percent', value: 100 },
      knowledgeId: 'url:' + url,
      source: url,
      ready: false
    };
    docs.push(d); activate(d.id);
    const onReady = () => {
      applyZoom(d);
      d.ready = true;
      d.searchText = documentSearchText(d);
      if (activeDoc() === d) void refreshKnowledgeButton();
    };
    const fail = (msg) => {
      d.ready = false;
      pane.innerHTML = '<div class="app-error"><div class="ae-icon">' + uiIconHTML('warning', '警告') + '</div>' + escapeHtml(msg || '加载失败') + '</div>';
      if (activeDoc() === d) void refreshKnowledgeButton();
    };
    const done = (html) => { pane.innerHTML = '<div class="doc-content">' + html + '</div>'; onReady(); };
    const isText = (ext === 'html' || ext === 'htm' || ext === 'txt' || ext === 'md');
    fetch(url).then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      // 获取成功才记入最近打开
      try {
        const recent = JSON.parse(localStorage.getItem('tz_doc_recent') || '[]');
        recent.unshift({ name, url, time: Date.now() });
        localStorage.setItem('tz_doc_recent', JSON.stringify(recent.slice(0, 10)));
      } catch (e) {}
      return isText ? r.text() : r.arrayBuffer();
    }).then(data => renderDocData(ext, data, pane, fail, done, onReady))
      .catch(e => fail('获取文档失败：' + (e.message || e) + '（跨域资源可能被目标站点拦截）'));
  }
  window.__tzDocOpenUrl = (url) => loadFromUrl(url);
  // 缩放提示（Ctrl+滚轮时短暂显示当前百分比）
  let zoomTip = null, zoomTipTimer = 0;
  function showZoomTip(pct) {
    if (!zoomTip) { zoomTip = el('div', 'doc-zoom-tip'); stage.appendChild(zoomTip); }
    zoomTip.textContent = pct + '%';
    zoomTip.classList.add('show');
    clearTimeout(zoomTipTimer);
    zoomTipTimer = setTimeout(() => zoomTip.classList.remove('show'), 750);
  }
  function changeZoomBy(d, delta) {
    const v = Math.max(10, Math.min(500, d.zoom.value + delta));
    d.zoom = { mode: 'percent', value: v };
    applyZoom(d);
    showZoomTip(v);
  }
  function applyZoom(d) {
    if (!d || !d.el) return;
    const s = Math.max(10, Math.min(500, d.zoom.value)) / 100;
    const content = d.el.querySelector('.doc-content, .doc-pdf');
    const iframe = d.el.querySelector('.doc-frame');
    if (content) {
      // 先读取自然尺寸，再应用 zoom 并同步容器宽高，确保滚动条跟随
      content.style.zoom = '100%';
      content.style.maxWidth = 'none';
      const w = content.scrollWidth || 1;
      const h = content.scrollHeight || 1;
      content.style.zoom = (s * 100) + '%';
      content.style.width = Math.round(w * s) + 'px';
      content.style.minHeight = Math.round(h * s) + 'px';
      content.style.maxWidth = '';
    }
    if (iframe) {
      iframe.style.transform = 'scale(' + s + ')';
      iframe.style.transformOrigin = 'top left';
      iframe.style.width = (100 / s) + '%';
      iframe.style.height = (100 / s) + '%';
    }
  }
  // Ctrl+滚轮缩放（唯一缩放方式）
  stage.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    const d = activeDoc(); if (!d) return;
    e.preventDefault();
    changeZoomBy(d, e.deltaY < 0 ? 10 : -10);
  }, { passive: false });
  // 拖拽整个窗口
  const app = $('.doc-app');
  app.addEventListener('dragover', (e) => { e.preventDefault(); app.classList.add('drag'); });
  app.addEventListener('dragleave', () => app.classList.remove('drag'));
  app.addEventListener('drop', (e) => { e.preventDefault(); app.classList.remove('drag'); [...(e.dataTransfer.files || [])].forEach(loadFile); });
}
// 动态加载外部库（带缓存）
const _libCache = {};
function ensureLib(globalName, src) {
  if (window[globalName]) return Promise.resolve();
  if (_libCache[globalName]) return _libCache[globalName];
  _libCache[globalName] = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('库加载失败')); document.head.appendChild(s);
  });
  return _libCache[globalName];
}
// PDF 渲染（pdf.js，每页一张 canvas）
function renderPdf(data, body, fail, onReady) {
  ensureLib('pdfjsLib', DOC_CDN.pdfjs).then(() => {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = DOC_CDN.pdfjsWorker;
    return window.pdfjsLib.getDocument({ data }).promise;
  }).then(async (pdf) => {
    body.innerHTML = '';
    const wrap = document.createElement('div'); wrap.className = 'doc-content doc-pdf';
    const textParts = [];
    const canvases = [];
    body.appendChild(wrap);
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      try {
        const content = await page.getTextContent();
        textParts.push(content.items.map(item => item && item.str ? item.str : '').filter(Boolean).join(' '));
      } catch (_) {}
      const vp = page.getViewport({ scale: 1.4 });
      const cv = document.createElement('canvas');
      cv.className = 'doc-pdf-page';
      cv.width = vp.width; cv.height = vp.height;
      canvases.push(cv);
      wrap.appendChild(cv);
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    }
    let extractedText = textParts.join('\n').trim();
    const visibleChars = extractedText.replace(/\s+/g, '').length;
    const scanThreshold = Math.max(80, pdf.numPages * 18);
    if (visibleChars < scanThreshold && canvases.length) {
      const status = document.createElement('div');
      status.className = 'doc-ocr-status';
      status.innerHTML = `${uiIconHTML('search')}<span><strong>检测到扫描版 PDF</strong><small>共 ${pdf.numPages} 页，正在准备本地 OCR；首次使用需要联网下载识别组件。</small></span><b>0%</b>`;
      body.insertBefore(status, wrap);
      const percent = status.querySelector('b');
      const copy = status.querySelector('small');
      const ocrParts = [];
      let ocrAvailable = true;
      try { await ensureTesseract(); }
      catch (error) {
        ocrAvailable = false;
        status.classList.add('is-warn');
        copy.textContent = 'OCR 组件加载失败：' + (error && error.message ? error.message : error);
        percent.textContent = '失败';
      }
      if (ocrAvailable) {
        for (let i = 0; i < canvases.length; i++) {
          if (!body.isConnected) break;
          copy.textContent = '正在识别第 ' + (i + 1) + ' / ' + canvases.length + ' 页；处理只在本机进行。';
          const text = await ocrDataUrl(canvases[i], progress => {
            const total = (i + Math.max(0, Math.min(1, progress))) / canvases.length;
            percent.textContent = Math.round(total * 100) + '%';
          }, { profile: 'document', isCancelled: () => !body.isConnected });
          if (text) ocrParts.push('第 ' + (i + 1) + ' 页\n' + text);
        }
        const ocrText = ocrParts.join('\n\n').trim();
        if (ocrText) {
          extractedText = [extractedText, ocrText].filter(Boolean).join('\n\n');
          status.classList.add('is-done');
          copy.textContent = '本地 OCR 完成，共识别 ' + ocrText.length.toLocaleString('zh-CN') + ' 字，可加入 AI 知识库。';
          percent.textContent = '100%';
        } else if (body.isConnected) {
          status.classList.add('is-warn');
          copy.textContent = 'OCR 已完成，但没有识别到可检索文字。';
          percent.textContent = '无文字';
        }
      }
    }
    wrap.__tzKnowledgeText = extractedText.slice(0, 120000);
    if (onReady) onReady();
  }).catch(e => fail('PDF 解析失败：' + (e.message || e)));
}
// PPTX 渲染（JSZip 解包读 slide XML 的文本，按页列出）
function renderPptx(data, body, fail, onReady) {
  ensureLib('JSZip', DOC_CDN.jszip).then(() => window.JSZip.loadAsync(data)).then(async (zip) => {
    const slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
    if (!slides.length) { fail('未在 PPT 中找到幻灯片'); return; }
    let html = '<div class="doc-content">';
    for (const n of slides) {
      const xml = await zip.file(n).async('text');
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const texts = [...doc.getElementsByTagName('a:t')].map(t => t.textContent);
      const num = n.match(/\d+/)[0];
      html += '<div class="doc-slide"><div class="doc-slide-no">第 ' + num + ' 页</div>' +
        (texts.length ? texts.map(t => '<div class="doc-slide-line">' + escapeHtml(t) + '</div>').join('') : '<div class="doc-slide-line" style="opacity:.5">（无文字）</div>') + '</div>';
    }
    body.innerHTML = html + '</div>';
    if (onReady) onReady();
  }).catch(e => fail('PPTX 解析失败：' + (e.message || e)));
}

/* ===================== 内置应用：AI 知识库管理 ===================== */
function renderKnowledgeManager() {
  return `
  <div class="app-workspace app-workspace--tool kb-manager-app">
    ${appWorkspaceHeaderHTML('folder', 'AI 知识库管理', '查看四类来源、检索模式、更新时间与可用正文；本地文档可在这里移除。', {
      eyebrow: 'LOCAL-FIRST KNOWLEDGE',
      meta: '<span class="app-badge is-live">本机检索</span><span class="app-badge">四来源</span>'
    })}
    <main class="app-workspace__main kb-manager-main">
      <div class="app-toolbar kb-manager-toolbar">
        <label class="kb-search-wrap">${uiIconHTML('search')}<input class="input" id="kbManagerSearch" type="search" placeholder="搜索标题、来源或正文…" /></label>
        <span class="app-toolbar__spacer"></span>
        <button class="btn sm ghost tz-icon-label" id="kbManagerReload">${uiIconHTML('refresh')}<span>刷新</span></button>
        <button class="btn sm primary tz-icon-label" id="kbManagerOpenChat">${uiIconHTML('chat')}<span>打开 AI 对话设置</span></button>
      </div>
      <div class="kb-source-strip" id="kbSourceStrip" role="tablist" aria-label="知识库来源"></div>
      <div class="kb-manager-layout">
        <section class="kb-entry-list" id="kbEntryList" aria-label="知识库内容列表">
          <div class="app-loading"><div class="al-spin"></div><div>正在读取本机知识库…</div></div>
        </section>
        <aside class="kb-entry-detail" id="kbEntryDetail">
          <div class="app-empty"><div class="app-empty__icon">${uiIconHTML('folder', '知识库')}</div><strong>选择一条资料</strong><p>右侧会显示来源、时间和可检索正文摘要。</p></div>
        </aside>
      </div>
    </main>
  </div>`;
}
async function initKnowledgeManager() {
  const listEl = $('#kbEntryList'), detailEl = $('#kbEntryDetail'), strip = $('#kbSourceStrip');
  const search = $('#kbManagerSearch');
  if (!listEl || !detailEl || !strip || !search) return;
  let entries = [];
  let activeSource = 'all';
  let activeKey = '';
  const sourceMeta = [{ key: 'all', label: '全部', icon: 'folder' }, ...KNOWLEDGE_SOURCE_META];
  const modeNames = { off: '关闭', auto: '自动匹配', full: '完整注入' };
  const entryKey = entry => entry.sourceType + ':' + String(entry.id || entry.url || entry.title);
  const matching = () => {
    const q = SiteAI.cleanText(search.value, 300).toLowerCase();
    return entries.filter(entry => {
      if (activeSource !== 'all' && entry.sourceType !== activeSource) return false;
      if (!q) return true;
      return [entry.title, entry.description, entry.text, entry.url].join(' ').toLowerCase().includes(q);
    });
  };
  function renderSources() {
    const modes = Store.getKnowledgeModes();
    strip.innerHTML = sourceMeta.map(source => {
      const count = source.key === 'all' ? entries.length : entries.filter(entry => entry.sourceType === source.key).length;
      const mode = source.key === 'all' ? '' : (modes[source.key] || 'auto');
      return `<button class="kb-source-chip${activeSource === source.key ? ' active' : ''}${mode === 'off' ? ' is-off' : ''}" role="tab" aria-selected="${activeSource === source.key}" data-kb-filter="${source.key}">
        ${uiIconHTML(source.icon)}<span><strong>${source.label}</strong><small>${count} 项${mode ? ' · ' + modeNames[mode] : ''}</small></span>
      </button>`;
    }).join('');
    strip.querySelectorAll('[data-kb-filter]').forEach(button => {
      button.onclick = () => { activeSource = button.dataset.kbFilter; activeKey = ''; renderSources(); renderList(); renderDetail(null); };
    });
  }
  function renderList() {
    const rows = matching();
    if (!rows.length) {
      listEl.innerHTML = '<div class="app-empty"><strong>没有匹配内容</strong><p>尝试切换来源或清除搜索词。</p></div>';
      return;
    }
    listEl.innerHTML = rows.map(entry => {
      const key = entryKey(entry);
      const preview = SiteAI.cleanText(entry.text || entry.description, 110);
      return `<button class="kb-entry${activeKey === key ? ' active' : ''}" data-kb-entry="${escapeHtml(key)}">
        <span class="kb-entry-icon">${uiIconHTML((KNOWLEDGE_SOURCE_META.find(source => source.key === entry.sourceType) || {}).icon || 'folder')}</span>
        <span class="kb-entry-copy"><strong>${escapeHtml(entry.title || '未命名资料')}</strong><small>${escapeHtml(entry.sourceLabel || '资料')} · ${escapeHtml(SiteAI.formatSourceTime(entry.updatedAt))}</small><span>${escapeHtml(preview || '（没有可检索正文）')}</span></span>
      </button>`;
    }).join('');
    listEl.querySelectorAll('[data-kb-entry]').forEach(button => {
      button.onclick = () => {
        activeKey = button.dataset.kbEntry;
        renderList();
        renderDetail(entries.find(entry => entryKey(entry) === activeKey) || null);
      };
    });
  }
  function renderDetail(entry) {
    if (!entry) {
      detailEl.innerHTML = `<div class="app-empty"><div class="app-empty__icon">${uiIconHTML('folder', '知识库')}</div><strong>选择一条资料</strong><p>这里会显示来源、时间和可检索正文摘要。</p></div>`;
      return;
    }
    const mode = Store.getKnowledgeModes()[entry.sourceType] || 'auto';
    const text = SiteAI.cleanText(entry.text || entry.description, 12000);
    const sourceActions = entry.sourceType === 'document'
      ? `<button class="btn sm danger tz-icon-label" id="kbRemoveDocument">${uiIconHTML('trash')}<span>移出知识库</span></button>`
      : entry.sourceType === 'note'
        ? `<button class="btn sm primary tz-icon-label" id="kbOpenSourceApp">${uiIconHTML('notes')}<span>打开笔记</span></button>`
        : entry.sourceType === 'chat'
          ? `<button class="btn sm primary tz-icon-label" id="kbOpenSourceApp">${uiIconHTML('chat')}<span>打开 AI 对话</span></button>`
          : '';
    detailEl.innerHTML = `<div class="kb-detail-head">
      <span class="app-badge">${escapeHtml(entry.sourceLabel || '资料')}</span><span class="app-badge ${mode === 'off' ? 'is-warn' : 'is-live'}">${modeNames[mode]}</span>
      <h3>${escapeHtml(entry.title || '未命名资料')}</h3>
      <p>${escapeHtml(entry.description || entry.url || '')}</p>
      <div class="kb-detail-meta"><span>更新时间：${escapeHtml(SiteAI.formatSourceTime(entry.updatedAt))}</span><span>可检索文字：${(entry.text || '').length.toLocaleString('zh-CN')} 字</span></div>
    </div>
    <div class="kb-detail-text">${escapeHtml(text || '（没有可检索正文）')}</div>
    <div class="kb-detail-actions">${sourceActions}</div>`;
    const remove = $('#kbRemoveDocument');
    if (remove) remove.onclick = async () => {
      const ok = await confirmDialog({ title: '移出知识库', message: '从 AI 知识库移除「' + entry.title + '」？原始文件不会被删除。', confirmText: '移除', danger: true });
      if (!ok) return;
      await KnowledgeStore.removeDoc(entry.id);
      toast('已移出 AI 知识库');
      await load();
    };
    const open = $('#kbOpenSourceApp');
    if (open) open.onclick = () => launchApp(entry.sourceType === 'note' ? 'notes' : 'ai-chat');
  }
  async function load() {
    listEl.innerHTML = '<div class="app-loading"><div class="al-spin"></div><div>正在读取本机知识库…</div></div>';
    entries = await SiteAI.allKnowledgeEntries('');
    entries.forEach((entry, index) => { if (!entry.id) entry.id = entry.url || ('entry-' + index); });
    activeKey = activeKey && entries.some(entry => entryKey(entry) === activeKey) ? activeKey : '';
    renderSources();
    renderList();
    renderDetail(activeKey ? entries.find(entry => entryKey(entry) === activeKey) : null);
  }
  search.oninput = () => { activeKey = ''; renderList(); renderDetail(null); };
  const reload = $('#kbManagerReload');
  if (reload) reload.onclick = load;
  const openChat = $('#kbManagerOpenChat');
  if (openChat) openChat.onclick = () => {
    launchApp('ai-chat');
    setTimeout(() => { const button = $('#chatKnowledge'); if (button) button.click(); }, 80);
  };
  await load();
}

/* ===================== 内置应用：笔记（Markdown / LaTeX，可被命令行操控） =====================
 * 存储：IndexedDB tznotes 库 kv 表 key='notes'，[{id, no, title, content, updated}]
 *   no = 固定编号（创建顺序，1 起始，永不改变，永不重用），便于 CLI 长期引用；旧数据加载时按 id 升序补齐。
 * 命令行：note list|new|open|view|edit|append|export|search|undo|del|help（见 BUILTIN_APP_CMDS.note） */
function openNotesDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('tznotes', 1);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', { keyPath: 'k' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function notesLoad() {
  let db = null;
  try {
    db = await openNotesDB();
    if (!db.objectStoreNames || !db.objectStoreNames.contains('kv')) return [];
    const rec = await new Promise((res, rej) => {
      const r = db.transaction('kv', 'readonly').objectStore('kv').get('notes');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const list = (rec && Array.isArray(rec.v)) ? rec.v : [];
    /* 迁移：为没有 no 字段的旧笔记补上固定编号（按 id 升序=创建顺序，1 开始，永不重用） */
    const sorted = list.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    sorted.forEach((n, i) => { if (!n.no) n.no = i + 1; });
    return list;
  } catch (e) { return []; }
  finally { if (db) db.close(); }
}
async function notesSave(list) {
  let db = null;
  try {
    db = await openNotesDB();
    if (!db.objectStoreNames || !db.objectStoreNames.contains('kv')) return false;
    await new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ k: 'notes', v: list });
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
    return true;
  } catch (e) { return false; }
  finally { if (db) db.close(); }
}
// 按编号（固定 no，1 起始）或标题查找笔记
function pickNote(notes, ref) {
  ref = String(ref || '').trim();
  const n = parseInt(ref, 10);
  if (String(n) === ref && n >= 1) return notes.find(x => x.no === n) || null;
  const exact = notes.find(x => (x.title || '') === ref);
  if (exact) return exact;
  return notes.find(x => (x.title || '').includes(ref)) || null;
}
// 取下一个可用固定编号（永不重用已被占用的 no，全删后从 1 重新开始）
function notesNextNo(notes) {
  let m = 0;
  notes.forEach(x => { if (x.no && x.no > m) m = x.no; });
  return m + 1;
}
let notesUndoStack = []; // 每次 CLI 改动前快照原数组，note undo 依次弹出回退
function notesSnapshot(notes) {
  notesUndoStack.push(JSON.parse(JSON.stringify(notes)));
  if (notesUndoStack.length > 30) notesUndoStack.shift(); // 防止无限增长，最多保留 30 步
}
let notesPendingOpen = null; // CLI note open 传参：窗口初始化后聚焦该笔记

function renderNotes() {
  return `
  <div class="app-workspace app-workspace--split app-workspace--tool notes-app">
    <div class="app-workspace__rail notes-side">
      <div class="notes-side-head">
        <span class="tz-icon-label">${uiIconHTML('notes')}<strong>笔记库</strong></span>
        <small>Markdown · LaTeX</small>
      </div>
      <button class="btn sm primary notes-new tz-icon-label" id="notesNew">${uiIconHTML('edit')}<span>新建笔记</span></button>
      <div class="notes-list" id="notesList"></div>
    </div>
    <div class="app-workspace__main notes-main">
      <div class="app-toolbar notes-toolbar">
        <input class="input notes-title" id="notesTitle" placeholder="笔记标题…" aria-label="笔记标题" />
        <div class="notes-modes">
          <button class="notes-mode" id="notesModeEdit" title="仅编辑">${uiIconHTML('edit')}</button>
          <button class="notes-mode active" id="notesModeSplit" title="编辑 + 预览">${uiIconHTML('windows')}</button>
          <button class="notes-mode" id="notesModePrev" title="仅预览">${uiIconHTML('monitor')}</button>
        </div>
        <button class="btn sm danger" id="notesDel" title="删除当前笔记">${uiIconHTML('trash')}</button>
      </div>
      <div class="notes-body split" id="notesBody">
        <textarea class="notes-editor" id="notesEditor" spellcheck="false" aria-label="笔记正文" placeholder="支持 Markdown 与 LaTeX：行内 $...$，块级 $$...$$&#10;&#10;命令行也能操控本应用：note new 标题 / note append 编号 内容 / note list"></textarea>
        <div class="notes-preview" id="notesPreview"></div>
      </div>
      <div class="notes-status" id="notesStatus">就绪</div>
    </div>
  </div>`;
}
async function initNotes() {
  const listEl = $('#notesList'), ed = $('#notesEditor'), prev = $('#notesPreview');
  const titleInp = $('#notesTitle'), status = $('#notesStatus'), body = $('#notesBody');
  if (!listEl || !ed || !prev || !body) return;
  listEl.setAttribute('role', 'listbox');
  listEl.setAttribute('aria-label', '笔记列表');
  let notes = await notesLoad();
  let curId = null;
  let saveTimer = 0, listTimer = 0, prevTimer = 0;
  const cur = () => notes.find(n => n.id === curId) || null;
  const fmtTime = (ts) => { const d = new Date(ts || Date.now()); return (d.getMonth() + 1) + '-' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  function renderList() {
    if (!notes.length) { listEl.innerHTML = '<div class="notes-empty">暂无笔记<br/>点上方「＋ 新建笔记」开始</div>'; return; }
    listEl.innerHTML = '';
    notes.forEach(n => {
      const item = el('div', 'notes-item' + (n.id === curId ? ' active' : ''));
      item.innerHTML = '<div class="ni-title"><span class="ni-no">#' + (n.no || '?') + '</span>' + escapeHtml(n.title || '未命名') + '</div>' +
        '<div class="ni-sub">' + escapeHtml((n.content || '').replace(/\s+/g, ' ').slice(0, 24) || '（空）') + ' · ' + fmtTime(n.updated) + '</div>';
      item.onclick = () => open(n.id);
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(n.id === curId));
      bindButtonLike(item, () => open(n.id), '打开笔记 ' + (n.title || '未命名'));
      item.setAttribute('role', 'option');
      listEl.appendChild(item);
    });
  }
  function renderPreview() {
    prev.innerHTML = renderMd(ed.value || '');
    if (window.renderMathInElement) { try { window.renderMathInElement(prev, KATEX_OPTS); } catch (e) {} }
  }
  function setMode(m) {
    body.classList.remove('edit', 'split', 'prev');
    body.classList.add(m);
    [['Edit', 'edit'], ['Split', 'split'], ['Prev', 'prev']].forEach(([k, v]) => {
      const b = $('#notesMode' + k); if (b) b.classList.toggle('active', v === m);
    });
    if (m !== 'edit') renderPreview();
  }
  async function persist() {
    const ok = await notesSave(notes);
    /* 单条轻量占位，避免与预览重渲染同时呈现"两条进度"。仅在用户真正改动后短暂显示一次，然后回到"已保存 · 时间"。 */
    if (status.dataset.editing === '1') {
      status.textContent = ok ? ('已保存 · ' + new Date().toLocaleTimeString('zh-CN')) : '保存失败（IndexedDB 不可用）';
      status.dataset.editing = '0';
    }
  }
  function saveSoon() {
    /* 与 AI 对话修复同源：用 chat-streaming-placeholder 风格的单条轻量占位代替任何"双进度"组合；
       预览重渲染是 DOM 直接更新，不属于进度条；这里确保状态栏是唯一的进度反馈通道。 */
    status.dataset.editing = '1';
    status.textContent = '';
    status.innerHTML = '<span class="notes-saving-dot"></span><span class="notes-saving-text">正在保存…</span>';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 500);
  }
  function open(id) {
    const n = notes.find(x => x.id === id);
    if (!n) return;
    curId = id;
    titleInp.value = n.title || '';
    ed.value = n.content || '';
    renderPreview();
    renderList();
  }
  async function createNote(title) {
    let m = 0; notes.forEach(x => { if (x.no && x.no > m) m = x.no; });
    const n = { id: 'n' + Date.now(), no: m + 1, title: title || '未命名笔记', content: '', updated: Date.now() };
    notes.unshift(n);
    curId = n.id;
    titleInp.value = n.title;
    ed.value = '';
    renderPreview();
    renderList();
    await notesSave(notes);
    status.dataset.editing = '0';
    status.innerHTML = '已创建（编号 ' + n.no + '） · ' + new Date().toLocaleTimeString('zh-CN');
    RPG.gain('note'); // v3.5 积分：新建笔记 +5（每日上限 15）
  }

  const newBtn = $('#notesNew');
  if (newBtn) newBtn.onclick = () => createNote('');
  const delBtn = $('#notesDel');
  if (delBtn) delBtn.onclick = async () => {
    const n = cur();
    if (!n) { toast('没有打开的笔记'); return; }
    const ok = await confirmDialog({ title: '删除笔记', message: '确定删除「' + (n.title || '未命名') + '」吗？删除后不可恢复。', confirmText: '删除', danger: true });
    if (!ok) return;
    notes = notes.filter(x => x.id !== n.id);
    curId = null;
    await notesSave(notes);
    titleInp.value = ''; ed.value = '';
    renderPreview(); renderList();
    status.dataset.editing = '0';
    status.textContent = '已删除';
  };
  const mE = $('#notesModeEdit'), mS = $('#notesModeSplit'), mP = $('#notesModePrev');
  if (mE) mE.onclick = () => setMode('edit');
  if (mS) mS.onclick = () => setMode('split');
  if (mP) mP.onclick = () => setMode('prev');

  ed.addEventListener('input', () => {
    const n = cur(); if (!n) return;
    n.content = ed.value; n.updated = Date.now();
    saveSoon();
    clearTimeout(prevTimer);
    prevTimer = setTimeout(renderPreview, 300);
    clearTimeout(listTimer);
    listTimer = setTimeout(renderList, 800);
  });
  titleInp.addEventListener('input', () => {
    const n = cur(); if (!n) return;
    n.title = titleInp.value; n.updated = Date.now();
    saveSoon();
    clearTimeout(listTimer);
    listTimer = setTimeout(renderList, 600);
  });

  // 初始打开：CLI note open 指定 > 第一篇 > 自动新建一篇
  if (notesPendingOpen && notes.some(n => n.id === notesPendingOpen)) {
    const id = notesPendingOpen;
    notesPendingOpen = null;
    open(id);
  } else {
    notesPendingOpen = null;
    if (notes.length) open(notes[0].id);
    else createNote('');
  }
  // KaTeX 异步加载完成后重渲染预览（否则首次打开时公式保持源码状态）
  ensureKatex().then(() => { if (cur()) renderPreview(); }).catch(() => {});
}

/* ===================== 内置应用：命令行终端 ===================== */
function renderTerminal() {
  return `
  <div class="app-workspace app-workspace--tool term-app">
    <div class="app-toolbar term-session-bar">
      <span class="app-toolbar__label tz-icon-label">${uiIconHTML('terminal')}<span>DESKTOP AGENT CONSOLE</span></span>
      <span class="app-toolbar__spacer"></span>
      <span class="app-badge is-live">统一命令中心</span>
      <span class="app-badge">${window.tzDesktop ? 'PowerShell / CMD' : '网页模式'}</span>
      <span class="app-badge">v${OS_VERSION}</span>
    </div>
    <div class="term-out" id="termOut" role="log" aria-live="polite" aria-relevant="additions text" aria-label="命令执行输出"></div>
    <div class="app-toolbar term-input-row"><span class="term-prompt">天择OS ></span><input id="termIn" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="输入命令，help 查看教程…" aria-label="命令行输入" /></div>
  </div>`;
}
function initTerminal() {
  const out = $('#termOut'), inp = $('#termIn');
  if (!out || !inp) return;
  const print = (text, cls) => {
    if (text === '' || text == null) return;
    // 超长文本（>5000 字符）改用 <details><pre> 自动折叠，避免一次性 inline 渲染
    // 大量 < 与 > 也能在 pre 内被等宽字体整齐排版，且不会拖累 term-out 整体渲染（曾因大段 HTML
    // 一次 append 到 div.textContent 导致浏览器只渲染了开头几百 KB，后续内容看似被截断）。
    if (typeof text === 'string' && text.length > 5000) {
      const wrap = el('details', 'tz-term-big');
      const sum = el('summary', '', '已输出 ' + text.length + ' 字符（点击展开）');
      const pre = el('pre', 'tz-term-pre');
      pre.textContent = text;
      wrap.appendChild(sum);
      wrap.appendChild(pre);
      if (cls) wrap.classList.add(cls);
      out.appendChild(wrap);
      return;
    }
    const d = el('div', cls || '');
    d.textContent = text;
    out.appendChild(d);
  };
  const scroll = () => { out.scrollTop = out.scrollHeight; };
  print('天择OS 命令行 v' + OS_VERSION + ' —— 输入 help 查看统一命令中心。', 't-dim');
  print('Tab 补全 · ↑/↓ 历史 · Ctrl+L 清屏 · Ctrl+C 中止当前任务。桌面版可用 shell run 执行 PowerShell/CMD。', 't-dim');
  print(' ');
  let hIdx = CLI.history.length;
  let currentTask = null;
  inp.onkeydown = (e) => {
    if (e.key === 'Enter') {
      const line = inp.value.trim();
      inp.value = '';
      if (!line) return;
      print('天择OS > ' + line, 't-cmd');
      CLI.remember(line); hIdx = CLI.history.length;
      RPG.gain('term'); // v3.5 积分：终端每执行一条命令 +1（每日上限 15）
      const handleResult = (r) => {
        if (r.out === '__CLEAR__') { out.innerHTML = ''; return; }
        print(r.out || '(完成)', r.ok ? '' : 't-err');
        (r.warnings || []).forEach(warning => print('警告：' + warning, 't-err'));
        print(' ');
        scroll();
      };
      const task = CLI.start(line, {
        streamOutput: true,
        emit: (chunk, stream) => { print(String(chunk || ''), stream === 'stderr' ? 't-err' : ''); scroll(); }
      });
      currentTask = task;
      print('[' + task.id + ' · 执行中，可按 Ctrl+C 中止]', 't-dim'); scroll();
      task.promise.then(handleResult).finally(() => { if (currentTask === task) currentTask = null; CLI.tasks && CLI.tasks.prune(30); });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (hIdx > 0) { hIdx--; inp.value = CLI.history[hIdx] || ''; setTimeout(() => inp.setSelectionRange(inp.value.length, inp.value.length)); }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (hIdx < CLI.history.length) { hIdx++; inp.value = CLI.history[hIdx] || ''; }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const matches = CLI.registry ? CLI.registry.complete(inp.value) : [];
      if (matches.length === 1) { inp.value = matches[0] + ' '; inp.setSelectionRange(inp.value.length, inp.value.length); }
      else if (matches.length > 1) { print(matches.join('    '), 't-dim'); scroll(); }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault(); out.innerHTML = '';
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      if (currentTask && (currentTask.status === 'running' || currentTask.status === 'cancelling')) {
        currentTask.cancel(); print('^C 正在中止 ' + currentTask.id + '…', 't-err'); scroll();
      } else print('^C（当前没有运行中的任务）', 't-dim');
    }
  };
  setTimeout(() => inp.focus(), 60);
}

/* ===================== 内置应用：AI 配置 ===================== */
// 静态站点无法安全保存共享 API Key；所有服务商预设都只填写公开参数，Key 由用户自行提供。
const AI_MODEL_PRESETS = [
  {
    id: 'deepseek-v4-flash', provider: 'DeepSeek', model: 'deepseek-v4-flash',
    url: 'https://api.deepseek.com/v1/chat/completions',
    title: 'DeepSeek V4 Flash', desc: '极高性能快速文本模型',
    contextLength: 1000000, maxTokens: 384000,
    caps: { image: false, file: false, webSearch: false },
    prices: { hit: 0.02, write: 0, input: 1, output: 2, search: 0, unit: 'cny' }
  },
  {
    id: 'deepseek-v4-pro', provider: 'DeepSeek', model: 'deepseek-v4-pro',
    url: 'https://api.deepseek.com/v1/chat/completions',
    title: 'DeepSeek V4 Pro', desc: '超高性能旗舰文本模型',
    contextLength: 1000000, maxTokens: 384000,
    caps: { image: false, file: false, webSearch: false },
    prices: { hit: 0.025, write: 0, input: 3, output: 6, search: 0, unit: 'cny' }
  },
  {
    id: 'mimo-v2.5', provider: 'MiMo', model: 'mimo-v2.5',
    url: 'https://api.xiaomimimo.com/v1/chat/completions',
    title: 'MiMo V2.5', desc: '中性能快速多模态+联网模型',
    contextLength: 1048576, maxTokens: 131072,
    caps: { image: true, file: false, webSearch: true },
    prices: { hit: 0.02, write: 0, input: 1, output: 2, search: 0.016, unit: 'cny' }
  },
  {
    id: 'glm-4.7-flash', provider: '智谱 GLM', model: 'glm-4.7-flash',
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    title: 'GLM 4.7 Flash', desc: '低性能免费文本模型',
    contextLength: 200000, maxTokens: 128000,
    caps: { image: false, file: false, webSearch: false },
    prices: { hit: 0, write: 0, input: 0, output: 0, search: 0, unit: 'cny' }
  },
  {
    id: 'glm-4.6v-flash', provider: '智谱 GLM', model: 'glm-4.6v-flash',
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    title: 'GLM 4.6V Flash', desc: '超低性能免费多模态模型',
    contextLength: 128000, maxTokens: 32768,
    caps: { image: true, file: false, webSearch: false },
    prices: { hit: 0, write: 0, input: 0, output: 0, search: 0, unit: 'cny' }
  }
];
function effectiveAICaps() {
  const saved = Store.getAICaps();
  const cfg = Store.getAIConfig();
  const known = AI_MODEL_PRESETS.find(p => p.model === cfg.model);
  return known ? { ...saved, ...known.caps, contextLength: known.contextLength } : saved;
}
function aiModelPresetHTML() {
  const tokenLabel = (n) => {
    if (n === 1048576 || n === 1000000) return '1M';
    if (n % 1000 === 0) return (n / 1000) + 'K';
    return Math.round(n / 1024) + 'K';
  };
  return AI_MODEL_PRESETS.map(p => {
    const caps = [
      p.caps.image ? '图片' : '文本',
      p.caps.webSearch ? '联网 ¥' + p.prices.search + '/次' : '',
      '自备 Key'
    ].filter(Boolean);
    return `<button type="button" class="model-preset" data-preset="${escapeHtml(p.id)}" aria-label="选择 ${escapeHtml(p.title)}">
      <span class="model-preset__provider">${escapeHtml(p.provider)}</span>
      <strong>${escapeHtml(p.title)}</strong>
      <small>${escapeHtml(p.desc)}</small>
      <span class="model-preset__meta">${escapeHtml(tokenLabel(p.contextLength) + ' 上下文 · ' + tokenLabel(p.maxTokens) + ' 输出')}</span>
      <span class="model-preset__caps">${caps.map(x => `<i>${escapeHtml(x)}</i>`).join('')}</span>
    </button>`;
  }).join('');
}
function aiProfileEndpointLabel(url) {
  try { return new URL(String(url || '')).hostname || '自定义接口'; }
  catch { return '自定义接口'; }
}
function aiCustomProfilesHTML() {
  const profiles = Store.getAIProfiles();
  const count = profiles.filter(Boolean).length;
  return `<div class="custom-ai-profiles" data-profile-count="${count}">
    <div class="custom-ai-profiles__head">
      <span><strong>我的 AI 配置</strong><small>最多保存 3 套，可自行命名并一键切换整套接口、模型、能力和计费参数。</small></span>
      <span class="app-badge ${count === 3 ? 'is-warn' : 'is-live'}">${count} / 3</span>
    </div>
    <div class="custom-ai-profile-grid">${profiles.map((profile, index) => {
      const saved = !!profile;
      const defaultName = saved ? profile.name : ('我的配置 ' + (index + 1));
      const model = saved ? String(profile.config.model || '未填写模型') : '空槽位';
      const endpoint = saved ? aiProfileEndpointLabel(profile.config.url) : '保存当前表单即可创建';
      return `<article class="custom-ai-profile${saved ? ' is-saved' : ''}" data-profile-slot="${index}">
        <div class="custom-ai-profile__top"><span class="custom-ai-profile__slot">槽位 ${index + 1}</span><span class="app-badge ${saved ? 'is-live' : ''}">${saved ? '已保存' : '空'}</span></div>
        <label class="field app-field"><span>配置名称</span><input class="input custom-ai-profile__name" maxlength="32" value="${escapeHtml(defaultName)}" data-profile-name="${index}" aria-label="槽位 ${index + 1} 配置名称" /></label>
        <div class="custom-ai-profile__summary"><strong>${escapeHtml(model)}</strong><small>${escapeHtml(endpoint)}</small></div>
        <div class="custom-ai-profile__actions">
          ${saved ? `<button type="button" class="btn sm primary tz-icon-label" data-profile-load="${index}">${uiIconHTML('play')}<span>载入使用</span></button>` : ''}
          <button type="button" class="btn sm ${saved ? 'ghost' : 'primary'} tz-icon-label" data-profile-save="${index}">${uiIconHTML('save')}<span>${saved ? '覆盖保存' : '保存当前配置'}</span></button>
          ${saved ? `<button type="button" class="btn sm danger" data-profile-delete="${index}" title="删除槽位 ${index + 1}">${uiIconHTML('trash')}</button>` : ''}
        </div>
      </article>`;
    }).join('')}</div>
    <p class="app-security-note tz-icon-label">${uiIconHTML('shield')}<span>自定义配置及其中的 API Key 仅保存在这台设备的 localStorage；导出完整系统存档时也会包含这些配置，请妥善保管存档文件。</span></p>
  </div>`;
}
function compactTokenNumber(value) {
  const n = Number(value) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(n >= 10000000 ? 1 : 2) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'K';
  return String(n);
}
function renderAIUsage() {
  const data = AIUsage.get();
  const totals = { requests: 0, estimatedRequests: 0, hit: 0, write: 0, input: 0, output: 0, total: 0, costCny: 0, costUsd: 0, ...(data.totals || {}) };
  const costParts = [];
  if (totals.costCny > 0) costParts.push('¥' + totals.costCny.toFixed(totals.costCny >= 0.01 ? 4 : 6));
  if (totals.costUsd > 0) costParts.push('$' + totals.costUsd.toFixed(totals.costUsd >= 0.01 ? 4 : 6));
  const sourceLabels = { chat: 'AI 对话', 'archived-chat': '归档对话', ask: '命令行 ask', subagent: '子智能体 agent', api: '系统 API', test: '配置测试', app: '自定义软件' };
  const rows = (data.records || []).slice(0, 100).map(record => {
    const cost = Number(record.cost) || 0;
    const costLabel = cost > 0 ? (record.unit === 'usd' ? '$' : '¥') + cost.toFixed(cost >= 0.01 ? 4 : 6) : '—';
    return `<tr>
      <td><strong>${escapeHtml(sourceLabels[record.source] || record.source || 'API')}</strong><small>${new Date(record.at).toLocaleString('zh-CN')}</small></td>
      <td>${escapeHtml(record.model || '未知模型')}</td>
      <td>${record.estimated ? '≈' : ''}${compactTokenNumber(record.input + record.hit + record.write)}</td>
      <td>${record.estimated ? '≈' : ''}${compactTokenNumber(record.output)}</td>
      <td>${record.estimated ? '≈' : ''}${compactTokenNumber(record.total)}</td>
      <td>${costLabel}</td>
    </tr>`;
  }).join('');
  return `<div class="app-workspace ai-usage-app">
    ${appWorkspaceHeaderHTML('info', 'Token 用量与计费', '自动统计天择OS中全部 AI API 请求；费用按请求发生时的模型单价快照估算', {
      eyebrow: 'AI USAGE LEDGER',
      meta: `<span class="app-badge is-live">${totals.requests} 次请求</span><span class="app-badge">本地存储</span>`,
      actions: `<button class="btn sm ghost tz-icon-label" onclick="TZOS.openConfig()">${uiIconHTML('settings')}<span>配置单价</span></button><button class="btn sm ghost tz-icon-label" onclick="TZOS.clearAIUsage()">${uiIconHTML('trash')}<span>清空统计</span></button>`
    })}
    <main class="app-workspace__main app-workspace__main--scroll ai-usage-main">
      <section class="ai-usage-summary">
        <article class="app-card"><small>累计 Token</small><strong>${compactTokenNumber(totals.total)}</strong><span>${totals.total.toLocaleString('zh-CN')} tokens</span></article>
        <article class="app-card"><small>输入 Token</small><strong>${compactTokenNumber(totals.input + totals.hit + totals.write)}</strong><span>普通 ${totals.input.toLocaleString('zh-CN')} · 命中 ${totals.hit.toLocaleString('zh-CN')} · 写入 ${totals.write.toLocaleString('zh-CN')}</span></article>
        <article class="app-card"><small>输出 Token</small><strong>${compactTokenNumber(totals.output)}</strong><span>${totals.output.toLocaleString('zh-CN')} tokens</span></article>
        <article class="app-card"><small>历史估算费用</small><strong>${costParts.join(' + ') || '未计价'}</strong><span>修改单价只影响之后的新请求</span></article>
      </section>
      <section class="app-card ai-usage-history">
        <div class="ai-usage-history__head"><div><span class="eyebrow">RECENT REQUESTS</span><strong>最近 100 次请求</strong></div><small>账本最多保留 300 条明细，累计总数不会因明细轮换而减少。${totals.estimatedRequests ? '其中 ' + totals.estimatedRequests + ' 次因接口未返回 usage，以“≈”标出本地估算。' : ''}</small></div>
        ${rows ? `<div class="ai-usage-table-wrap"><table><thead><tr><th>来源 / 时间</th><th>模型</th><th>输入</th><th>输出</th><th>总量</th><th>费用</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="archived-chat-empty archived-chat-empty--panel">还没有可统计的 AI API 请求。</div>'}
      </section>
    </main>
  </div>`;
}
window.TZOS.clearAIUsage = async function() {
  const ok = await confirmDialog({ title: '清空 Token 统计', message: '确定清空全部累计 Token 和费用记录？\n这不会删除 AI 对话。', confirmText: '清空统计', danger: true });
  if (!ok) return;
  AIUsage.reset();
  refreshOpenApp('ai-usage');
  toast('Token 用量统计已清空');
};

function formatAgentDuration(item) {
  const end = item.endedAt || Date.now();
  const ms = Math.max(0, end - (item.startedAt || end));
  if (ms < 1000) return ms + ' ms';
  if (ms < 60000) return (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + ' 秒';
  return Math.floor(ms / 60000) + ' 分 ' + Math.floor((ms % 60000) / 1000) + ' 秒';
}
function agentActivityListHTML() {
  const snapshot = AgentActivity.snapshot();
  const items = [...snapshot.active, ...snapshot.recent.slice(0, 16)];
  if (!items.length) return appEmptyStateHTML('ai', '还没有 Agent 活动', '在 AI 对话中启用 Agent，或在终端运行 agent 问题。');
  const kindLabel = { chat: '主对话 Agent', subagent: '子智能体', app: '应用 AI' };
  const statusLabel = { running: '运行中', cancelling: '正在停止', completed: '已完成', stopped: '已掐断', failed: '失败', retrying: '正在重试' };
  return items.map(item => {
    const active = snapshot.active.some(entry => entry.id === item.id);
    const commands = (item.commands || []).map(entry => `<li class="${entry.ok ? 'is-ok' : 'is-error'}">
      <code>${escapeHtml(entry.command)}</code>
      <span>${escapeHtml(entry.out || (entry.ok ? '已完成' : '未返回结果'))}</span>
    </li>`).join('');
    return `<article class="agent-job app-card ${active ? 'is-active' : ''}">
      <header class="agent-job__head">
        <span><small>${escapeHtml(kindLabel[item.kind] || item.kind || 'Agent')}</small><strong>${escapeHtml(item.title || '未命名任务')}</strong></span>
        <span class="agent-job__state"><i class="app-badge ${active ? 'is-live' : item.status === 'failed' || item.status === 'stopped' ? 'is-warn' : ''}">${escapeHtml(statusLabel[item.status] || item.status)}</i><small>${escapeHtml(formatAgentDuration(item))}</small></span>
      </header>
      <div class="agent-job__meta"><span>${(item.commands || []).length} 条命令</span><code>${escapeHtml(item.id)}</code>${active && item.cancel ? `<button type="button" class="btn sm danger" onclick="TZOS.stopAgentActivity('${escapeHtml(item.id)}')">停止</button>` : ''}</div>
      ${item.detail ? `<p class="agent-job__detail">${escapeHtml(item.detail)}</p>` : ''}
      ${commands ? `<details class="agent-job__commands" ${active ? 'open' : ''}><summary>查看工作流程</summary><ol>${commands}</ol></details>` : '<p class="agent-job__detail">等待第一项系统操作…</p>'}
    </article>`;
  }).join('');
}
function agentGuardListHTML() {
  const rows = AppAIGuard.snapshot();
  if (!rows.length) return appEmptyStateHTML('shield', '暂无应用 AI 调用', '应用通过 ask 或 agent 调用 AI 后，系统会在这里显示实时风险。');
  return rows.map(row => {
    const blocked = row.blockedUntil > Date.now();
    const risk = Math.min(100, Math.round((Number(row.risk) || 0) / 8 * 100));
    return `<article class="agent-guard-row app-card ${blocked ? 'is-blocked' : ''}">
      <span><strong>${escapeHtml(row.appName)}</strong><small>${row.total} 次调用 · ${row.active} 项进行中 · 已掐断 ${row.stopped} 次</small></span>
      <span class="agent-guard-risk"><i style="--risk:${risk}%"></i><small>${blocked ? '熔断至 ' + new Date(row.blockedUntil).toLocaleTimeString('zh-CN') : '风险 ' + risk + '%'}</small></span>
    </article>`;
  }).join('');
}
function commandExplorerHTML() {
  if (!CLI.registry) return '<div class="app-empty">命令注册表尚未就绪。</div>';
  const groups = new Map();
  CLI.registry.visible().forEach(spec => {
    const group = spec.group || '其他';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(spec);
  });
  return [...groups.entries()].map(([group, specs]) => `<section class="command-group" data-command-group>
    <h3>${escapeHtml(group)} <small>${specs.length}</small></h3>
    <div class="command-grid">${specs.map(spec => {
      const aliases = (spec.aliases || []).map(item => item.join(' '));
      const search = [spec.key, spec.usage, spec.description, group, ...aliases].join(' ').toLowerCase();
      return `<article class="command-item app-card" data-command-item data-search="${escapeHtml(search)}">
        <code>${escapeHtml(spec.usage || spec.key)}</code>
        <p>${escapeHtml(spec.description || '暂无说明')}</p>
        <footer>${spec.agent === false ? '<span class="app-badge is-warn">仅用户</span>' : '<span class="app-badge is-live">Agent 可用</span>'}${aliases.length ? `<small>别名：${escapeHtml(aliases.join('、'))}</small>` : ''}</footer>
      </article>`;
    }).join('')}</div>
  </section>`).join('');
}
function renderAgentCenter() {
  const snapshot = AgentActivity.snapshot();
  const commandCount = CLI.registry ? CLI.registry.visible().length : 0;
  return `<div class="app-workspace agent-center-app">
    ${appWorkspaceHeaderHTML('terminal', 'Agent 与命令中心', '查看智能体工作流、应用 AI 熔断状态和统一命令手册', {
      eyebrow: 'AGENT OPERATIONS',
      meta: `<span class="app-badge ${snapshot.active.length ? 'is-live' : ''}">${snapshot.active.length} 项运行中</span><span class="app-badge">${commandCount} 条命令</span>`,
      actions: `<button type="button" class="btn sm ghost tz-icon-label" onclick="TZOS.launchApp('terminal')">${uiIconHTML('terminal')}<span>打开终端</span></button><button type="button" class="btn sm primary tz-icon-label" onclick="TZOS.launchApp('ai-usage')">${uiIconHTML('info')}<span>Token 账本</span></button>`
    })}
    <main class="app-workspace__main app-workspace__main--scroll agent-center-main">
      ${appSectionHTML('ai', '智能体活动', '实时查看主对话 Agent 与子智能体执行的每一步；需要时可立即停止', `<div id="agentActivityList" class="agent-activity-list" aria-live="polite">${agentActivityListHTML()}</div>`, { id: 'agent-activity' })}
      ${appSectionHTML('shield', '应用 AI 实时监管', '不设固定次数上限；仅在高频重复、异常并发或持续无进展时自动掐断', `<div id="agentGuardList" class="agent-guard-list">${agentGuardListHTML()}</div>`, { id: 'agent-guard' })}
      ${appSectionHTML('search', '命令浏览器', '统一查看命名空间、用途、别名及 Agent 可用性', `<label class="app-search agent-command-search">${uiIconHTML('search')}<input id="commandExplorerSearch" type="search" placeholder="搜索命令、用途或分组…" aria-label="搜索系统命令" /><span id="commandExplorerCount">${commandCount} 条</span></label><div id="commandExplorerList" class="command-explorer">${commandExplorerHTML()}</div>`, { id: 'agent-commands' })}
    </main>
  </div>`;
}
function initAgentCenter(winObj) {
  const root = winObj?.body?.querySelector('.agent-center-app') || document.querySelector('.agent-center-app');
  if (!root) return;
  const input = root.querySelector('#commandExplorerSearch');
  const count = root.querySelector('#commandExplorerCount');
  if (input) input.oninput = () => {
    const query = input.value.trim().toLowerCase();
    let visible = 0;
    root.querySelectorAll('[data-command-item]').forEach(item => {
      const show = !query || String(item.dataset.search || '').includes(query);
      item.hidden = !show;
      if (show) visible++;
    });
    root.querySelectorAll('[data-command-group]').forEach(group => { group.hidden = !group.querySelector('[data-command-item]:not([hidden])'); });
    if (count) count.textContent = visible + ' 条';
  };
  const timer = setInterval(() => AgentActivity._refresh(), 1000);
  const previousClose = winObj && winObj.onClose;
  if (winObj) winObj.onClose = () => { clearInterval(timer); if (typeof previousClose === 'function') previousClose(); };
}
window.TZOS.stopAgentActivity = function(id) {
  if (AgentActivity.stop(String(id || ''))) toast('正在停止智能体任务…');
  else toast('该任务已经结束');
};

function renderAIConfig() {
  const c = Store.getAIConfig();
  const caps = effectiveAICaps();
  const ready = AI.isReady();
  const priceValue = (name) => c.prices && c.prices[name] != null ? String(c.prices[name]) : '';
  return `
  <div class="app-workspace app-workspace--settings app-config">
    ${appWorkspaceHeaderHTML('key', 'AI 配置', '统一管理模型接入、能力、费用与长期记忆', {
      eyebrow: 'AI CONTROL PLANE',
      meta: `<span class="app-badge ${ready ? 'is-live' : 'is-warn'}">${ready ? escapeHtml(c.model || '已连接') : '等待配置'}</span>`,
      actions: `<button class="btn sm ghost tz-icon-label" onclick="TZOS.testConfig()">${uiIconHTML('network')}<span>测试连接</span></button>
                <button class="btn sm primary tz-icon-label" onclick="TZOS.saveConfig()">${uiIconHTML('save')}<span>保存配置</span></button>`
    })}
    <div class="app-workspace__layout">
      <nav class="app-workspace__rail app-nav" aria-label="AI 配置分区">
        <a class="app-nav__item active" href="#cfg-provider">${uiIconHTML('key')}<span>接口与模型</span></a>
        <a class="app-nav__item" href="#cfg-profiles">${uiIconHTML('save')}<span>我的配置</span></a>
        <a class="app-nav__item" href="#cfg-capabilities">${uiIconHTML('crystal')}<span>模型能力</span></a>
        <a class="app-nav__item" href="#cfg-pricing">${uiIconHTML('star')}<span>Token 费用</span></a>
        <a class="app-nav__item" href="#cfg-memory">${uiIconHTML('ai')}<span>AI 记忆</span></a>
        <a class="app-nav__item" href="#cfg-doubao">${uiIconHTML('globe')}<span>网页 AI</span></a>
      </nav>
      <main class="app-workspace__main app-workspace__main--scroll cfg-main">
        ${appSectionHTML('key', '接口与模型', 'OpenAI 兼容接口用于 AI 对话与软件商城', `
          <div class="config-status ${ready?'ok':'warn'}">
            <span>${uiIconHTML(ready ? 'check' : 'warning')}</span><span>${ready?'已就绪：'+escapeHtml(c.model):'尚未配置 API Key'}</span>
          </div>
          <div class="config-presets" aria-label="最新模型快速预设">
            <div class="model-presets__head">
              <span><strong>最新模型预设</strong><small>选择后会同步接口、能力、上下文、输出上限和价格</small></span>
              <span class="app-badge is-live">2026 · V4</span>
            </div>
            <div class="model-presets-grid">${aiModelPresetHTML()}</div>
          </div>
          <div class="app-form-grid">
            <div class="field app-field app-field--wide">
              <label>API 接口地址</label>
              <input class="input" id="cfgUrl" value="${escapeHtml(c.url)}" placeholder="https://api.deepseek.com/v1/chat/completions" />
            </div>
            <div class="field app-field">
              <label>API Key</label>
              <input class="input" id="cfgKey" type="password" value="${escapeHtml(c.key)}" placeholder="sk-..." />
            </div>
            <div class="field app-field">
              <label>最大输出 Token</label>
              <input class="input" id="cfgMaxTokens" type="number" min="1" max="384000" value="${escapeHtml(String(c.maxTokens || ''))}" placeholder="8192" />
            </div>
            <div class="field app-field app-field--wide">
              <label class="field-label-actions"><span>模型名称</span><button class="btn sm ghost tz-icon-label" id="cfgFetchModels" type="button" title="用当前 URL 与 Key 调用 /models 拉取接口支持的模型列表">${uiIconHTML('download')}<span>获取模型</span></button></label>
              <input class="input" id="cfgModel" value="${escapeHtml(c.model)}" placeholder="可手填，或拉取后从列表选择" list="cfgModelList" />
              <datalist id="cfgModelList"></datalist>
            </div>
          </div>
          <p class="app-security-note tz-icon-label">${uiIconHTML('shield')}<span>静态网站无法安全内置共享密钥；所有预设均需填写自己的 API Key。Key 只保存在本机，推荐使用加密存档迁移。</span></p>
        `, { id: 'cfg-provider' })}

        ${appSectionHTML('save', '我的配置', '三个可命名的本地槽位，适合在不同服务商、模型或费用方案之间快速切换', `
          ${aiCustomProfilesHTML()}
        `, { id: 'cfg-profiles' })}

        ${appSectionHTML('crystal', '模型能力', '只开启当前模型真实支持的能力，避免请求失败和无效 token', `
          <div class="app-setting-list">
            <div class="setting-row">
              <div><div class="sr-label">支持图片输入</div><div class="sr-desc">视觉模型直接读取图片与截图；关闭后改用本地 OCR 转文字。</div></div>
              <div class="toggle ${caps.image!==false?'on':''}" id="capImageTg"></div>
            </div>
            <div class="setting-row">
              <div><div class="sr-label">支持文件输入</div><div class="sr-desc">文本类文件始终可读；开启后允许把二进制文件作为 base64 发送。</div></div>
              <div class="toggle ${caps.file!==false?'on':''}" id="capFileTg"></div>
            </div>
            <div class="setting-row">
              <div><div class="sr-label">支持联网搜索</div><div class="sr-desc">服务商支持 web_search 工具时开启，对话会默认带联网能力。</div></div>
              <div class="toggle ${caps.webSearch?'on':''}" id="capWebTg"></div>
            </div>
          </div>
          <div class="field app-field app-field--compact">
            <label>上下文长度（token）</label>
            <input class="input" id="cfgCtxLen" type="number" min="0" max="2000000" value="${escapeHtml(String(caps.contextLength || ''))}" placeholder="如 64000 / 128000" />
          </div>
        `, { id: 'cfg-capabilities' })}

        ${appSectionHTML('star', 'Token 费用', '每百万 tokens 的单价；留空时不显示费用估算', `
          <div class="app-toolbar price-toolbar">
            <span class="app-toolbar__label">货币单位</span>
            <div class="style-pick">
              <button id="priceUnitCny" class="${(c.prices && c.prices.unit === 'usd') ? '' : 'active'}">¥ 人民币</button>
              <button id="priceUnitUsd" class="${(c.prices && c.prices.unit === 'usd') ? 'active' : ''}">$ 美元</button>
            </div>
          </div>
          <div class="price-grid app-form-grid">
            <div class="field app-field"><label>缓存命中</label><input class="input" id="cfgPriceHit" type="number" min="0" step="0.0001" value="${escapeHtml(priceValue('hit'))}" placeholder="如 0.5" /></div>
            <div class="field app-field"><label>缓存写入</label><input class="input" id="cfgPriceWrite" type="number" min="0" step="0.0001" value="${escapeHtml(priceValue('write'))}" placeholder="国内模型通常填 0" /></div>
            <div class="field app-field"><label>输入（未命中）</label><input class="input" id="cfgPriceInput" type="number" min="0" step="0.0001" value="${escapeHtml(priceValue('input'))}" placeholder="如 2" /></div>
            <div class="field app-field"><label>输出</label><input class="input" id="cfgPriceOutput" type="number" min="0" step="0.0001" value="${escapeHtml(priceValue('output'))}" placeholder="如 8" /></div>
            <div class="field app-field"><label>联网搜索（每次）</label><input class="input" id="cfgPriceSearch" type="number" min="0" step="0.0001" value="${escapeHtml(priceValue('search'))}" placeholder="如 0.016" /></div>
          </div>
        `, { id: 'cfg-pricing' })}

        ${appSectionHTML('ai', 'AI 记忆', '决定哪些长期信息写入并注入后续对话', `
          <div class="app-setting-list">
            <div class="setting-row">
              <div><div class="sr-label">生成后自动写入记忆</div><div class="sr-desc">AI 回答后自动判断有无值得长期保存的内容。</div></div>
              <div class="toggle ${Store.getMemAuto()?'on':''}" id="memAutoTg"></div>
            </div>
            <div class="setting-row">
              <div><div class="sr-label">将记忆注入提示词</div><div class="sr-desc">关闭后所有记忆都不会发送给 AI。</div></div>
              <div class="toggle ${Store.getMemInject()?'on':''}" id="memInjectTg"></div>
            </div>
          </div>
          <div id="memList" class="memory-list"></div>
          <div class="app-toolbar memory-create">
            <input class="input" id="memNewInput" placeholder="新增一条记忆，如：用户是大学生" />
            <button class="btn sm primary tz-icon-label" onclick="TZOS.memAdd()">${uiIconHTML('edit')}<span>添加</span></button>
          </div>
          <div class="app-toolbar memory-actions">
            <button class="btn sm ghost" onclick="TZOS.memAll(true)">全选</button>
            <button class="btn sm ghost" onclick="TZOS.memAll(false)">全不选</button>
            <span class="app-toolbar__spacer"></span>
            <small>勾选的记忆会注入提示词</small>
          </div>
        `, { id: 'cfg-memory' })}

        ${appSectionHTML('globe', '网页 AI', '无需 API Key 的外部网页对话入口', `
          <div class="app-card app-card--horizontal">
            <span class="app-card__icon">${uiIconHTML('ai', '豆包 AI')}</span>
            <span><strong>豆包 AI</strong><small>在 AI 对话工具栏切换为豆包网页版；API 功能仍使用上方通用配置。</small></span>
            <span class="app-badge is-warn">网页嵌入</span>
          </div>
        `, { id: 'cfg-doubao' })}
      </main>
    </div>
  </div>`;
}
// AI 记忆条目渲染（配置页内）
function renderMemList() {
  const box = $('#memList');
  if (!box) return;
  const ms = Mem.list();
  if (!ms.length) {
    box.innerHTML = appEmptyStateHTML('ai', '暂无长期记忆', '开启自动写入，或在下方手动添加一条信息。');
    return;
  }
  box.innerHTML = ms.map(m => `
    <div class="app-card mem-row" data-id="${m.id}">
      <input type="checkbox" class="mem-en" ${m.enabled !== false ? 'checked' : ''} title="是否注入提示词" />
      <span class="mem-text">${escapeHtml(m.text)}</span>
      <button class="btn sm ghost mem-edit" title="修改">${uiIconHTML('edit')}</button>
      <button class="btn sm danger mem-del" title="删除">${uiIconHTML('trash')}</button>
    </div>`).join('');
  box.querySelectorAll('.mem-row').forEach(row => {
    const id = row.dataset.id;
    row.querySelector('.mem-en').onchange = (e) => Mem.update(id, { enabled: e.target.checked });
    row.querySelector('.mem-edit').onclick = async () => {
      const cur = Mem.list().find(x => x.id === id);
      if (!cur) return;
      const t = await promptDialog({ title: '修改记忆', message: '记忆内容：', value: cur.text, confirmText: '保存' });
      if (t === null) return;
      if (!(t || '').trim()) { toast('内容为空，未修改'); return; }
      Mem.update(id, { text: t.trim() });
      renderMemList();
    };
    row.querySelector('.mem-del').onclick = async () => {
      const ok = await confirmDialog({ title: '删除记忆', message: '删除这条记忆？', confirmText: '删除', danger: true });
      if (!ok) return;
      Mem.remove(id);
      renderMemList();
    };
  });
}
window.TZOS = window.TZOS || {};
window.TZOS.memAdd = function() {
  const inp = $('#memNewInput');
  const t = (inp.value || '').trim();
  if (!t) { toast('请输入记忆内容'); return; }
  Mem.add(t);
  inp.value = '';
  renderMemList();
  toast('已添加记忆');
};
window.TZOS.memAll = function(on) {
  const ms = Mem.list().map(m => ({ ...m, enabled: !!on }));
  Store.setMemories(ms);
  renderMemList();
};
// 从表单读取完整 AI 配置（含 token 单价与货币单位）
function readConfigForm() {
  const num = (id) => { const elx = document.getElementById(id); const v = parseFloat(elx && elx.value); return (isNaN(v) || v < 0) ? 0 : v; };
  const usdBtn = document.getElementById('priceUnitUsd');
  return {
    url: $('#cfgUrl').value.trim(),
    key: $('#cfgKey').value.trim(),
    model: $('#cfgModel').value.trim(),
    maxTokens: parseInt(($('#cfgMaxTokens') || {}).value, 10) || 0,
    prices: {
      hit: num('cfgPriceHit'), write: num('cfgPriceWrite'), input: num('cfgPriceInput'), output: num('cfgPriceOutput'),
      search: num('cfgPriceSearch'),
      unit: (usdBtn && usdBtn.classList.contains('active')) ? 'usd' : 'cny'
    }
  };
}
// 读取能力设置表单（图片/文件/联网/上下文长度）
function readCapsForm() {
  const g = (id) => { const e = document.getElementById(id); return e ? e.classList.contains('on') : true; };
  const ctxEl = document.getElementById('cfgCtxLen');
  return {
    image: g('capImageTg'), file: g('capFileTg'), webSearch: g('capWebTg'),
    contextLength: parseInt(ctxEl && ctxEl.value, 10) || 0
  };
}
function applyAIConfigToForm(config, caps) {
  const cfg = config || {};
  const abilities = { image: true, file: true, webSearch: false, contextLength: 0, ...(caps || {}) };
  const setValue = (id, value) => { const field = $(id); if (field) field.value = String(value == null ? '' : value); };
  setValue('#cfgUrl', cfg.url);
  setValue('#cfgKey', cfg.key);
  setValue('#cfgModel', cfg.model);
  setValue('#cfgMaxTokens', cfg.maxTokens);
  setValue('#cfgCtxLen', abilities.contextLength);
  const prices = cfg.prices || {};
  setValue('#cfgPriceHit', prices.hit);
  setValue('#cfgPriceWrite', prices.write);
  setValue('#cfgPriceInput', prices.input);
  setValue('#cfgPriceOutput', prices.output);
  setValue('#cfgPriceSearch', prices.search);
  [['#capImageTg', abilities.image], ['#capFileTg', abilities.file], ['#capWebTg', abilities.webSearch]].forEach(([id, on]) => {
    const toggle = $(id);
    if (!toggle) return;
    toggle.classList.toggle('on', !!on);
    toggle.setAttribute('aria-checked', String(!!on));
  });
  const cny = $('#priceUnitCny'), usd = $('#priceUnitUsd');
  if (cny && usd) {
    const useUsd = prices.unit === 'usd';
    cny.classList.toggle('active', !useUsd);
    usd.classList.toggle('active', useUsd);
  }
  $$('.model-preset').forEach(card => {
    const preset = AI_MODEL_PRESETS.find(item => item.id === card.dataset.preset);
    card.classList.toggle('active', !!preset && preset.model === cfg.model && preset.url === cfg.url);
  });
}
window.TZOS.saveConfig = function() {
  Store.setAIConfig(readConfigForm());
  Store.setAICaps(readCapsForm());
  // 图片输入被关闭时，自动关掉截图模式并停掉屏幕共享
  if (Store.getAICaps().image === false && Store.getScreenshotMode()) { Store.setScreenshotMode(false); Shot.stop(); }
  toast('配置已保存');
  refreshOpenApp('ai-config');
  refreshChatView();
};
window.TZOS.saveAIProfile = function(slot) {
  const index = Number(slot);
  if (!Number.isInteger(index) || index < 0 || index > 2) return;
  const input = document.querySelector('[data-profile-name="' + index + '"]');
  const name = String((input && input.value) || ('我的配置 ' + (index + 1))).trim().slice(0, 32);
  if (!name) { toast('请先填写配置名称'); if (input) focusSafely(input); return; }
  const profiles = Store.getAIProfiles();
  profiles[index] = { name, config: readConfigForm(), caps: readCapsForm(), updatedAt: Date.now() };
  Store.setAIProfiles(profiles);
  Store.setAIConfig(profiles[index].config);
  Store.setAICaps(profiles[index].caps);
  toast('已保存“' + name + '”到槽位 ' + (index + 1));
  refreshOpenApp('ai-config');
  refreshChatView();
};
window.TZOS.loadAIProfile = function(slot) {
  const index = Number(slot);
  const profile = Store.getAIProfiles()[index];
  if (!profile) { toast('该槽位尚未保存配置'); return; }
  Store.setAIConfig(profile.config);
  Store.setAICaps(profile.caps);
  if (profile.caps.image === false && Store.getScreenshotMode()) { Store.setScreenshotMode(false); Shot.stop(); }
  if (!profile.caps.webSearch) setWebSearchCtx(false);
  applyAIConfigToForm(profile.config, profile.caps);
  toast('已载入“' + profile.name + '”并设为当前配置');
  refreshOpenApp('ai-config');
  refreshChatView();
};
window.TZOS.renameAIProfile = function(slot, value) {
  const index = Number(slot);
  const profiles = Store.getAIProfiles();
  const profile = profiles[index];
  if (!profile) return;
  const name = String(value || '').trim().slice(0, 32);
  if (!name) { toast('配置名称不能为空'); refreshOpenApp('ai-config'); return; }
  if (name === profile.name) return;
  profiles[index] = { ...profile, name, updatedAt: Date.now() };
  Store.setAIProfiles(profiles);
  toast('配置已改名为“' + name + '”');
};
window.TZOS.deleteAIProfile = async function(slot) {
  const index = Number(slot);
  const profiles = Store.getAIProfiles();
  const profile = profiles[index];
  if (!profile) return;
  const ok = await confirmDialog({ title: '删除自定义配置', message: '删除“' + profile.name + '”？当前正在使用的配置不会被清空。', confirmText: '删除', danger: true });
  if (!ok) return;
  profiles[index] = null;
  Store.setAIProfiles(profiles);
  toast('已删除“' + profile.name + '”');
  refreshOpenApp('ai-config');
};
// 用当前 URL + Key 调 /models 拉取接口支持的模型列表，填入 datalist 供选择（仍可自定义手填）
window.TZOS.fetchModels = async function() {
  const url = ($('#cfgUrl').value || '').trim();
  const key = ($('#cfgKey').value || '').trim();
  if (!url || !key) { toast('请先填写接口地址与 API Key'); return; }
  // 由 chat/completions 推 models 端点：去掉尾部 /chat/completions 换 /models
  const murl = url.replace(/\/chat\/completions\/?$/i, '') + '/models';
  const btn = $('#cfgFetchModels');
  if (btn) { btn.disabled = true; btn.textContent = '拉取中…'; }
  try {
    // 直接 GET /models（网页版可跨域；桌面版 file:// 若被 CORS 拦截会进 catch 提示手填）
    const res = await fetch(murl, {
      headers: /xiaomimimo\.com/i.test(url)
        ? { 'api-key': key, 'Accept': 'application/json' }
        : { 'Authorization': 'Bearer ' + key, 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const list = (data && data.data) || [];
    const dl = $('#cfgModelList');
    if (!dl) return;
    dl.innerHTML = '';
    if (!list.length) { toast('该接口未返回模型列表，可继续手填'); return; }
    list.forEach(m => { const o = document.createElement('option'); o.value = m.id; dl.appendChild(o); });
    toast('✓ 已拉取 ' + list.length + ' 个模型，点模型输入框右侧下拉选择', 3600);
    $('#cfgModel').focus();
  } catch (e) {
    toast('拉取失败：' + (e.message || e).toString().slice(0, 60) + '（可继续手填）', 4200);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = uiIconHTML('download') + '<span>获取模型列表</span>'; btn.classList.add('tz-icon-label'); }
  }
};
window.TZOS.testConfig = async function() {
  Store.setAIConfig(readConfigForm());
  Store.setAICaps(readCapsForm());
  toast('正在测试真实流式对话…', 1800);
  try {
    let visible = '';
    const r = await AI.chatStream([{role:'user',content:'只回复“OK”'}], (d, all) => { visible = all; }, { max_tokens: 64, thinking: false, source: 'test' });
    toast('✓ 流式对话成功（' + AI.config().model + '）：' + ((r.content || visible || '').slice(0, 30) || '已收到响应'), 3600);
  } catch (e) { toast('✗ ' + e.message.slice(0, 60), 4000); }
};

/* ===================== 内置应用：AI 对话 ===================== */
function chatTabsHTML() {
  const activeId = Store.getActiveChatId();
  const chats = Store.getVisibleChats();
  return chats.map(c => `
    <div class="chat-tab${c.id === activeId ? ' active' : ''}" data-chat-id="${escapeHtml(c.id)}">
      <button type="button" class="chat-tab__main" role="tab" aria-selected="${c.id === activeId ? 'true' : 'false'}" title="${escapeHtml(c.title || '新对话')}">
        ${uiIconHTML('chat')}<span>${escapeHtml(c.title || '新对话')}</span>
      </button>
      <button type="button" class="chat-tab__close" title="归档「${escapeHtml(c.title || '新对话')}」" aria-label="归档对话">${uiIconHTML('folder')}</button>
    </div>`).join('');
}
const KNOWLEDGE_SOURCE_META = [
  { key: 'site', label: '站内页面', icon: 'globe' },
  { key: 'document', label: '本地文档', icon: 'document' },
  { key: 'note', label: '本地笔记', icon: 'notes' },
  { key: 'chat', label: '历史会话', icon: 'chat' }
];
const KNOWLEDGE_MODE_META = [
  { key: 'off', label: '完全不参考', desc: '本轮不读取该来源' },
  { key: 'auto', label: '自动匹配', desc: '仅发送相关命中摘录' },
  { key: 'full', label: '完整注入', desc: '每轮全量优先，超限截断' }
];
function knowledgeToolbarLabel() {
  const modes = Store.getKnowledgeModes();
  const off = Object.values(modes).filter(mode => mode === 'off').length;
  const full = Object.values(modes).filter(mode => mode === 'full').length;
  if (full) return '知识库·全量' + full;
  if (off) return '知识库·关闭' + off;
  return '知识库·自动';
}
function renderKnowledgeSettingsPanel(siteMode) {
  const modes = Store.getKnowledgeModes();
  const head = KNOWLEDGE_SOURCE_META.map(source => `<th scope="col"><span class="tz-icon-label">${uiIconHTML(source.icon)}<span>${source.label}</span></span></th>`).join('');
  const rows = KNOWLEDGE_MODE_META.map(mode => `<tr>${KNOWLEDGE_SOURCE_META.map(source => {
    const id = 'kb-mode-' + source.key + '-' + mode.key;
    const checked = modes[source.key] === mode.key;
    return `<td><label class="kb-mode-cell${checked ? ' active' : ''}" for="${id}">
      <input type="radio" id="${id}" name="kb-mode-${source.key}" value="${mode.key}" data-kb-source="${source.key}" ${checked ? 'checked' : ''} />
      <span class="kb-mode-check" aria-hidden="true">${checked ? '✓' : ''}</span>
      <strong>${mode.label}</strong><small>${mode.desc}</small>
    </label></td>`;
  }).join('')}</tr>`).join('');
  return `<div class="kb-settings-panel" id="chatKnowledgePanel" hidden role="dialog" aria-modal="false" aria-label="AI 知识库设置">
    <div class="kb-settings-head">
      <div><span class="eyebrow">LOCAL-FIRST RETRIEVAL</span><strong>AI 知识库设置</strong><small>四个来源各选一档；设置会同时用于天择网与天择OS。</small></div>
      <button class="btn sm ghost" id="chatKnowledgeClose" title="关闭知识库设置" aria-label="关闭知识库设置">${uiIconHTML('close')}</button>
    </div>
    <div class="kb-table-wrap"><table class="kb-mode-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>
    <div class="kb-settings-foot">
      <span>${uiIconHTML('info')}“完整注入”会增加上下文和费用；超过当前模型安全预算时会明确截断。</span>
      ${siteMode ? '' : `<button class="btn sm primary tz-icon-label" id="chatKnowledgeManage">${uiIconHTML('folder')}<span>打开知识库管理</span></button>`}
    </div>
  </div>`;
}
function archivedMessageText(message) {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  try { return JSON.stringify(message.content); } catch (_) { return String(message.content || ''); }
}
function renderArchivedChatsPanel(siteMode) {
  if (siteMode) return '';
  const chats = Store.getArchivedChats();
  const body = chats.length ? chats.map(chat => {
    const messages = chat.messages || [];
    const preview = messages.length ? messages.map(message => `<div class="archived-chat-message is-${message.role === 'user' ? 'user' : 'assistant'}">
      <strong>${message.role === 'user' ? '你' : 'AI'}</strong><p>${escapeHtml(archivedMessageText(message))}</p>
    </div>`).join('') : '<div class="archived-chat-empty">这个归档对话没有消息。</div>';
    return `<article class="archived-chat-card" data-archived-chat-id="${escapeHtml(chat.id)}">
      <div class="archived-chat-card__head">
        <div><strong>${escapeHtml(chat.title || '新对话')}</strong><small>${new Date(chat.archivedAt).toLocaleString('zh-CN')} · ${messages.length} 条消息</small></div>
        <div class="archived-chat-actions">
          <button class="btn sm tz-icon-label" data-archive-action="restore">${uiIconHTML('refresh')}<span>还原</span></button>
          <button class="btn sm ghost tz-icon-label" data-archive-action="delete">${uiIconHTML('trash')}<span>永久删除</span></button>
        </div>
      </div>
      <details><summary>查看对话内容</summary><div class="archived-chat-messages">${preview}</div></details>
    </article>`;
  }).join('') : `<div class="archived-chat-empty archived-chat-empty--panel">${uiIconHTML('folder')}<strong>暂无已归档对话</strong><span>从对话标签右侧点击归档按钮后，会在这里保留。</span></div>`;
  return `<section class="archived-chats-panel" id="chatArchivedPanel" hidden role="dialog" aria-modal="false" aria-label="已归档对话">
    <div class="archived-chats-head"><div><span class="eyebrow">ARCHIVED CONVERSATIONS</span><strong>已归档对话</strong><small>归档对话不会出现在标签栏，但仍会录入 AI 知识库。</small></div>
      <button class="btn sm ghost" id="chatArchivedClose" title="关闭已归档对话" aria-label="关闭已归档对话">${uiIconHTML('close')}</button>
    </div>
    <div class="archived-chats-list">${body}</div>
  </section>`;
}
function renderAIChat(options = {}) {
  const siteMode = !!options.siteMode || !!window.__tzSiteEmbedMode;
  const provider = siteMode ? 'custom' : getProviderCtx();
  const disableAgent = siteMode || !!options.disableAgent || !hasDesktopAgentBroker();
  // 豆包AI：doubao.com 网页版嵌入（非 API Key 方式）
  if (provider === 'doubao') {
    return `
    <div class="app-workspace app-workspace--conversation app-chat" id="chatApp">
      <div class="app-toolbar chat-toolbar">
        <button class="btn sm tz-icon-label" id="chatProvider" title="切换回自定义AI">${uiIconHTML('ai')}<span>豆包AI（网页版）</span></button>
        <span class="app-badge is-warn">网页嵌入</span>
        <span style="flex:1"></span>
        <a class="btn sm ghost tz-icon-label" href="https://www.doubao.com/chat" target="_blank" rel="noopener" title="在系统外新标签页打开豆包">${uiIconHTML('right')}<span>外部打开</span></a>
      </div>
      <div style="flex:1;position:relative;min-height:0;background:#fff">
        <iframe id="doubaoFrame" style="width:100%;height:100%;border:none;background:#fff" src="https://www.doubao.com/chat/" referrerpolicy="no-referrer"></iframe>
        <div id="doubaoHint" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;text-align:center;padding:24px;color:var(--ink-faint);background:var(--glass-strong)">
          <div style="font-size:38px;color:var(--c-violet-soft)">${uiIconHTML('ai', '豆包AI')}</div>
          <div style="font-size:14px;color:var(--ink-dim)">正在加载豆包网页版…</div>
          <div style="font-size:12px;max-width:380px;line-height:1.6">若长时间空白，说明豆包禁止被嵌入（站点安全策略）。可点右上角「↗ 外部打开」在系统浏览器中使用，首次需登录豆包账号。</div>
          <button class="btn sm tz-icon-label" onclick="TZOS.openDoubaoExternal()">${uiIconHTML('right')}<span>在系统外打开豆包</span></button>
        </div>
      </div>
    </div>`;
  }
  const deep = getDeepThinkCtx();
  const thinkingCap = AI.supportsThinking(AI.config());
  const caps = effectiveAICaps();
  const shotOn = getScreenshotCtx();
  const webCap = !!caps.webSearch;
  const webOn = webCap && getWebSearchCtx();
  const inlineTabs = options.titlebarTabs ? '' : `
    <div class="chat-tabbar" aria-label="AI 对话标签页">
      <div class="chat-tabs" id="chatTabs" role="tablist">${chatTabsHTML()}</div>
      <button type="button" class="chat-tab-new tz-icon-label" id="chatNew" title="新建对话" aria-label="新建对话">${uiIconHTML('edit')}<span>新建</span></button>
    </div>`;
  return `
  <div class="app-workspace app-workspace--conversation app-chat" id="chatApp">
    ${inlineTabs}
    <div class="app-toolbar chat-toolbar">
      ${siteMode
        ? `<span class="app-badge tz-icon-label site-ai-badge">${uiIconHTML('globe')}<span>天择网站内问答</span></span>`
        : `<button class="btn sm ghost tz-icon-label" id="chatProvider" title="切换 AI 提供方">${uiIconHTML('settings')}<span>自定义AI</span></button>`}
      ${thinkingCap ? `<button class="btn sm ${deep?'':'ghost'} js-deep-btn tz-icon-label" id="chatDeep" title="深度思考（显示思考过程）">${uiIconHTML('ai')}<span>深度思考${deep?'·开':'·关'}</span></button>` : ''}
      ${webCap ? `<button class="btn sm ${webOn?'':'ghost'} tz-icon-label" id="chatWeb" title="联网搜索（当前模型支持；开启后可能产生单次搜索费用）">${uiIconHTML('globe')}<span>联网${webOn?'·开':'·关'}</span></button>` : ''}
      <button class="btn sm ${shotOn?'':'ghost'} tz-icon-label" id="chatShot" title="${siteMode ? '发送消息时由当前网页提供截图（视觉模型直接读图，纯文本模型本地 OCR 识别为文字）' : '发送消息时读取你明确授权的共享源（视觉模型直接读图，纯文本模型本地 OCR 识别为文字）'}">${uiIconHTML('camera')}<span>截图${shotOn?'·开':'·关'}</span></button>
      ${disableAgent ? '' : `<button class="btn sm ${Store.getAgentMode()?'':'ghost'} tz-icon-label" id="chatAgent" title="AI 命令行模式：AI 可在对话中直接执行命令行命令（消耗大量 token）">${uiIconHTML('terminal')}<span>命令行${Store.getAgentMode()?'·开':'·关'}</span></button>`}
      <button class="btn sm ghost tz-icon-label" id="chatKnowledge" title="设置站内页面、本地文档、笔记和历史会话的知识库引用方式">${uiIconHTML('folder')}<span>${knowledgeToolbarLabel()}</span></button>
      ${siteMode ? '' : `<button class="btn sm ghost tz-icon-label" id="chatArchived" title="查看、还原或永久删除已归档对话">${uiIconHTML('folder')}<span>已归档 ${Store.getArchivedChats().length}</span></button>`}
      <span style="flex:1"></span>
      <span class="chat-ctx" id="chatCtx"></span>
      ${siteMode ? '' : `<button class="btn sm ghost" id="chatSync" title="同步最新对话（OS 对话窗口与 AI 悬浮窗内容互通，平时自动同步）">${uiIconHTML('refresh')}</button>`}
      <button class="btn sm ghost" id="chatClear" title="清空当前对话">${uiIconHTML('trash')}</button>
    </div>
    ${renderKnowledgeSettingsPanel(siteMode)}
    ${renderArchivedChatsPanel(siteMode)}
    <div class="chat-messages" id="chatMsgs" role="log" aria-label="AI 对话消息" aria-relevant="additions"></div>
    <div class="chat-attach" id="chatAttach" hidden></div>
    <div class="app-toolbar chat-input-bar">
      <button class="chat-attach-btn" id="chatAttachBtn" title="上传图片或文件（也可直接粘贴到这里）；不支持图片/文件输入的模型会自动转为文字（图片 OCR、文本直读）">${uiIconHTML('paperclip')}</button><input type="file" id="chatFileInput" style="display:none" multiple />
      <textarea class="textarea" id="chatInput" aria-label="AI 对话输入" placeholder="${siteMode ? '询问当前页面或天择网内容，Enter 发送，Shift+Enter 换行…' : `输入消息，Enter 发送，Shift+Enter 换行，可粘贴图片/文件${caps.image === false ? '（图片将 OCR 识别为文字）' : ''}…`}" rows="1"></textarea>
      <button class="chat-send" id="chatSend" title="发送" aria-label="发送消息">${uiIconHTML('play')}</button>
    </div>
  </div>`;
}
function bindKnowledgeSettingsPanel(siteMode) {
  const button = $('#chatKnowledge');
  const panel = $('#chatKnowledgePanel');
  if (!button || !panel) return;
  const close = () => { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); };
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  button.onclick = () => {
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) focusSafely(panel.querySelector('input:checked'));
  };
  const closeBtn = $('#chatKnowledgeClose');
  if (closeBtn) closeBtn.onclick = close;
  panel.querySelectorAll('input[data-kb-source]').forEach(input => {
    input.onchange = () => {
      if (!input.checked) return;
      const source = input.dataset.kbSource;
      Store.setKnowledgeMode(source, input.value);
      panel.querySelectorAll('input[name="' + input.name + '"]').forEach(item => {
        const cell = item.closest('.kb-mode-cell');
        if (!cell) return;
        cell.classList.toggle('active', item.checked);
        const mark = cell.querySelector('.kb-mode-check');
        if (mark) mark.textContent = item.checked ? '✓' : '';
      });
      const label = button.querySelector('span:last-child');
      if (label) label.textContent = knowledgeToolbarLabel();
      const sourceMeta = KNOWLEDGE_SOURCE_META.find(item => item.key === source);
      const modeMeta = KNOWLEDGE_MODE_META.find(item => item.key === input.value);
      toast((sourceMeta ? sourceMeta.label : '知识库') + '已设为“' + (modeMeta ? modeMeta.label : input.value) + '”' +
        (input.value === 'full' ? '；超出上下文时会截断' : ''), 3200);
      refreshContextEstimate(chatSess);
    };
  });
  const manage = $('#chatKnowledgeManage');
  if (manage && !siteMode) manage.onclick = () => { close(); launchApp('knowledge-manager'); };
  panel.onkeydown = event => { if (event.key === 'Escape') { event.preventDefault(); close(); focusSafely(button); } };
}
function bindArchivedChatsPanel(siteMode) {
  if (siteMode) return;
  const button = $('#chatArchived');
  const panel = $('#chatArchivedPanel');
  if (!button || !panel) return;
  const close = () => { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); };
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  button.onclick = () => {
    const knowledge = $('#chatKnowledgePanel');
    if (knowledge) knowledge.hidden = true;
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) focusSafely(panel.querySelector('summary, button'));
  };
  const closeBtn = $('#chatArchivedClose');
  if (closeBtn) closeBtn.onclick = close;
  panel.querySelectorAll('[data-archive-action]').forEach(action => {
    action.onclick = async () => {
      const card = action.closest('[data-archived-chat-id]');
      const id = card && card.dataset.archivedChatId;
      const chat = Store.getArchivedChats().find(item => item.id === id);
      if (!chat) return;
      if (action.dataset.archiveAction === 'restore') {
        Store.restoreChat(id);
        markChatDirty();
        refreshChatView();
        toast('已还原「' + (chat.title || '新对话') + '」');
        return;
      }
      const ok = await confirmDialog({
        title: '永久删除对话',
        message: '确定永久删除「' + (chat.title || '新对话') + '」？\n删除后也会从 AI 知识库移除，且无法还原。',
        confirmText: '永久删除',
        danger: true
      });
      if (!ok) return;
      Store.removeChat(id);
      markChatDirty();
      refreshChatView();
      toast('已永久删除归档对话');
    };
  });
  panel.onkeydown = event => { if (event.key === 'Escape') { event.preventDefault(); close(); focusSafely(button); } };
}
// 待发送附件 chips（图片/文件/OCR）渲染
function renderPendingChips(sess) {
  const box = sess && sess.attachEl;
  if (!box || !box.isConnected) return;
  const list = sess.pending || [];
  if (!list.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = '';
  list.forEach((p, i) => {
    const chip = el('div', 'attach-chip');
    if (p.kind === 'image') {
      const img = el('img', 'attach-thumb');
      img.src = p.dataUrl; img.alt = p.name;
      chip.appendChild(img);
    } else if (p.kind === 'ocr') {
      chip.appendChild(el('span', 'attach-ficon', uiIconHTML('search')));
    } else {
      chip.appendChild(el('span', 'attach-ficon', uiIconHTML('document')));
    }
    let label = p.name;
    if (p.kind === 'ocr') label += p.status === 'doing' ? ('（OCR 识别中 ' + Math.round((p.progress || 0) * 100) + '%…）') : p.status === 'done' ? ('（已识别 ' + (p.text || '').length + ' 字）') : '（识别失败，发送时不会附带）';
    else if (p.kind === 'file' && p.text != null) label += '（文本 ' + p.text.length + ' 字）';
    chip.appendChild(el('span', 'attach-name', escapeHtml(label)));
    const x = el('button', 'attach-x', uiIconHTML('close'));
    x.title = '移除';
    x.onclick = () => { sess.pending.splice(i, 1); renderPendingChips(sess); };
    chip.appendChild(x);
    box.appendChild(chip);
  });
}
// 判断是否为可直接读取文字的文本类文件（v3.5：文本文件不再发 base64，直接发内容）
function looksTextFile(file) {
  const mime = String(file.type || '').toLowerCase();
  if (/^text\//.test(mime)) return true;
  if (/(json|xml|javascript|x-yaml|x-sh|csv)/.test(mime)) return true;
  const ext = (String(file.name || '').split('.').pop() || '').toLowerCase();
  return ['txt','md','markdown','json','csv','tsv','log','js','ts','jsx','tsx','mjs','html','htm','css','py','java','c','h','cpp','cc','go','rs','xml','yml','yaml','toml','ini','cfg','conf','sh','bat','ps1','sql','vue','tex','svg','gitignore','env'].indexOf(ext) >= 0;
}
// 图片 OCR（v3.5）：纯文本模型下上传图片，本地 Tesseract.js 识别文字后随消息发送
// v5.1.1 worker 只创建一次；所有识别串行排队，避免多张图片同时复制中英模型耗尽内存。
let _tessP = null;
let _tessWorkerP = null;
let _tessQueue = Promise.resolve();
let _tessProgress = null;
let _tessIdleTimer = null;
let _tessJobSeq = 0;
function ensureTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (_tessP) return _tessP;
  _tessP = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = () => {
      if (window.Tesseract) res(window.Tesseract);
      else { _tessP = null; rej(new Error('OCR 组件加载失败')); }
    };
    s.onerror = () => { _tessP = null; rej(new Error('OCR 组件加载失败（需要联网下载识别引擎）')); };
    document.head.appendChild(s);
  });
  return _tessP;
}
function reportTesseractProgress(message) {
  if (!_tessProgress || !message || typeof message.progress !== 'number') return;
  const value = Math.max(0, Math.min(1, message.progress));
  let mapped = 0.04 + value * 0.16;
  if (message.status === 'loading language traineddata') mapped = 0.08 + value * 0.20;
  else if (message.status === 'initializing api') mapped = 0.28 + value * 0.07;
  else if (message.status === 'recognizing text') mapped = 0.35 + value * 0.65;
  _tessProgress(Math.max(0, Math.min(1, mapped)));
}
function ensureTesseractWorker() {
  if (_tessWorkerP) return _tessWorkerP;
  _tessWorkerP = ensureTesseract()
    .then((T) => T.createWorker(
      ['chi_sim', 'eng'],
      T.OEM && T.OEM.LSTM_ONLY !== undefined ? T.OEM.LSTM_ONLY : 1,
      {
        cacheMethod: 'write',
        logger: reportTesseractProgress,
        errorHandler: (error) => { console.warn('[TZOS OCR worker]', error); }
      }
    ))
    .catch((error) => {
      _tessWorkerP = null;
      throw error;
    });
  return _tessWorkerP;
}
async function disposeTesseractWorker() {
  clearTimeout(_tessIdleTimer);
  _tessIdleTimer = null;
  const workerP = _tessWorkerP;
  _tessWorkerP = null;
  if (!workerP) return;
  try {
    const worker = await workerP;
    await worker.terminate();
  } catch (_) {}
}
function scheduleTesseractIdleCleanup() {
  clearTimeout(_tessIdleTimer);
  _tessIdleTimer = setTimeout(() => { disposeTesseractWorker(); }, 3 * 60 * 1000);
}
function enqueueTesseractJob(task) {
  const job = _tessQueue.then(task);
  _tessQueue = job.catch(() => {});
  return job;
}
async function decodeOcrSource(source) {
  if (!source) throw new Error('图片数据为空');
  if (typeof createImageBitmap === 'function' && typeof Blob !== 'undefined' && source instanceof Blob) {
    try {
      const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
      return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch (_) {
      const bitmap = await createImageBitmap(source);
      return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    }
  }
  if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
    return { image: source, width: source.width, height: source.height, close: () => {} };
  }
  const image = new Image();
  let objectUrl = '';
  const src = (typeof Blob !== 'undefined' && source instanceof Blob)
    ? (objectUrl = URL.createObjectURL(source))
    : String(source);
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('无法解码图片'));
      image.src = src;
    });
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
  return {
    image,
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
    close: () => {}
  };
}
function histogramPercentile(histogram, sampleCount, ratio) {
  const target = sampleCount * ratio;
  let seen = 0;
  for (let i = 0; i < histogram.length; i++) {
    seen += histogram[i];
    if (seen >= target) return i;
  }
  return 255;
}
async function preprocessOcrImage(source, profile) {
  const decoded = await decodeOcrSource(source);
  try {
    const sourceWidth = Math.max(1, decoded.width | 0);
    const sourceHeight = Math.max(1, decoded.height | 0);
    const maxPixels = 10 * 1024 * 1024;
    const minWidth = profile === 'ui' ? 1920 : 1600;
    const maxUpscale = 2;
    let scale = Math.min(maxUpscale, Math.max(1, minWidth / sourceWidth));
    scale = Math.min(scale, Math.sqrt(maxPixels / Math.max(1, sourceWidth * sourceHeight)));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const border = 18;
    const canvas = document.createElement('canvas');
    canvas.width = width + border * 2;
    canvas.height = height + border * 2;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('浏览器无法创建 OCR 画布');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(decoded.image, border, border, width, height);

    const pixels = ctx.getImageData(border, border, width, height);
    const data = pixels.data;
    const histogram = new Uint32Array(256);
    const sampleStride = Math.max(1, Math.floor(Math.sqrt((width * height) / 500000)));
    let sampleCount = 0;
    for (let y = 0; y < height; y += sampleStride) {
      for (let x = 0; x < width; x += sampleStride) {
        const i = (y * width + x) * 4;
        const lum = Math.round(data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722);
        histogram[lum]++;
        sampleCount++;
      }
    }
    let low = histogramPercentile(histogram, sampleCount, 0.01);
    const median = histogramPercentile(histogram, sampleCount, 0.5);
    let high = histogramPercentile(histogram, sampleCount, 0.99);
    // 稀疏文字可能占不到 1%：再探测极端分位，仍不足时保持原动态范围，
    // 避免白底黑字或黑底白字被误拉伸成整片纯色。
    if (high - low < 36) {
      low = histogramPercentile(histogram, sampleCount, 0.001);
      high = histogramPercentile(histogram, sampleCount, 0.999);
    }
    if (high - low < 20) {
      low = 0;
      high = 255;
    }
    const range = Math.max(1, high - low);
    const invert = median < (profile === 'ui' ? 122 : 88) && high - median > 24;
    for (let i = 0; i < data.length; i += 4) {
      let lum = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      lum = Math.max(0, Math.min(255, (lum - low) * 255 / range));
      if (invert) lum = 255 - lum;
      const value = Math.max(0, Math.min(255, Math.round((lum - 128) * 1.06 + 128)));
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
    ctx.putImageData(pixels, border, border);
    return canvas;
  } finally {
    decoded.close();
  }
}
async function runImageOcr(p, sess) {
  const profile = p.ocrProfile || 'document';
  const text = await ocrDataUrl(p.source || p.dataUrl, (prog) => {
    p.progress = prog;
    p._tick = (p._tick || 0) + 1;
    if (p._tick % 4 === 0) renderPendingChips(sess);
  }, { profile, isCancelled: () => !sess.pending.includes(p) });
  if (!sess.pending.includes(p)) return;
  p.source = null;
  p.text = text;
  p.status = text ? 'done' : 'fail';
  if (!text) toast('「' + p.name + '」未识别到文字', 3000);
  renderPendingChips(sess);
}
// 识别一张图片，返回文字（失败/无字返回 ''）；默认 profile=ui 供自动截图使用。
async function ocrDataUrl(source, onProgress, options = {}) {
  return enqueueTesseractJob(async () => {
    if (options.isCancelled && options.isCancelled()) return '';
    clearTimeout(_tessIdleTimer);
    _tessIdleTimer = null;
    _tessProgress = typeof onProgress === 'function' ? onProgress : null;
    let worker = null;
    try {
      if (_tessProgress) _tessProgress(0.02);
      const profile = options.profile === 'document' ? 'document' : 'ui';
      const prepared = await preprocessOcrImage(source, profile);
      if (options.isCancelled && options.isCancelled()) return '';
      if (_tessProgress) _tessProgress(0.32);
      const T = await ensureTesseract();
      worker = await ensureTesseractWorker();
      const psm = profile === 'ui'
        ? (T.PSM && T.PSM.SPARSE_TEXT ? T.PSM.SPARSE_TEXT : '11')
        : (T.PSM && T.PSM.AUTO ? T.PSM.AUTO : '3');
      const jobId = 'tzos-ocr-' + (++_tessJobSeq);
      await worker.setParameters({
        tessedit_pageseg_mode: psm,
        preserve_interword_spaces: profile === 'ui' ? '1' : '0',
        user_defined_dpi: '300'
      }, jobId + '-params');
      const result = await worker.recognize(prepared, {
        rotateAuto: profile === 'document'
      }, { text: true }, jobId);
      if (_tessProgress) _tessProgress(1);
      return ((result && result.data && result.data.text) || '').trim();
    } catch (e) {
      if (worker) await disposeTesseractWorker();
      toast('图片 OCR 失败：' + (e.message || e), 3600);
      return '';
    } finally {
      _tessProgress = null;
      if (_tessWorkerP) scheduleTesseractIdleCleanup();
    }
  });
}
// 把 File 读成待发送附件并加入列表
// v3.5 统一规则：① 图片——模型支持图片输入则直发，不支持则本地 OCR 成文字（任何模型都能发图）
// ② 文本类文件——任何模型都能接受文字，直接读取内容发送
// ③ 二进制文件——需开启「文件输入」（base64 发送），否则无法附加
function addPendingFile(sess, file) {
  if (!file) return;
  const caps = effectiveAICaps();
  const isImg = /^image\//i.test(file.type || '');
  if (file.size > 8 * 1024 * 1024) { toast('「' + file.name + '」超过 8MB，已跳过'); return; }
  if (isImg && caps.image === false) {
    const displayName = file.name || '粘贴图片.png';
    const uiLike = /(?:screen.?shot|截图|屏幕截图)/i.test(displayName)
      || (/^image(?:[ (._-]|$)/i.test(displayName) && /png/i.test(file.type || ''));
    const p = {
      kind: 'ocr',
      name: displayName,
      source: file,
      ocrProfile: uiLike ? 'ui' : 'document',
      status: 'doing',
      progress: 0,
      text: ''
    };
    sess.pending.push(p);
    renderPendingChips(sess);
    toast('当前为纯文本模型，图片将本地 OCR 识别为文字发送', 2600);
    runImageOcr(p, sess);
    return;
  }
  if (!isImg && looksTextFile(file)) {
    const rd = new FileReader();
    rd.onload = () => {
      sess.pending.push({ kind: 'file', name: file.name || '未命名文件', mime: file.type || 'text/plain', text: String(rd.result || '') });
      renderPendingChips(sess);
    };
    rd.onerror = () => toast('读取「' + file.name + '」失败');
    rd.readAsText(file);
    return;
  }
  if (!isImg && caps.file === false) {
    toast('「文件输入」已在 AI 配置中关闭：文本类文件与图片会自动转为文字发送，此二进制文件无法附加', 3800);
    return;
  }
  const rd = new FileReader();
  rd.onload = () => {
    sess.pending.push({ kind: isImg ? 'image' : 'file', name: file.name || (isImg ? '粘贴图片.png' : '未命名文件'), mime: file.type || '', dataUrl: rd.result });
    renderPendingChips(sess);
  };
  rd.onerror = () => toast('读取「' + file.name + '」失败');
  rd.readAsDataURL(file);
}
function reasoningHtml(reasoning, ongoing) {
  if (!reasoning) return '';
  const tag = ongoing ? '（进行中…）' : '';
  return `<details class="msg-reasoning"${ongoing?' open':''} style="margin-bottom:6px"><summary class="tz-icon-label" style="cursor:pointer;color:var(--ink-faint);font-size:12px">${uiIconHTML('ai')}<span>思考过程${tag}</span></summary><div style="font-size:12px;color:var(--ink-faint);line-height:1.6;padding:6px 8px;background:var(--surface);border-radius:6px;margin-top:4px;white-space:pre-wrap">${escapeHtml(reasoning)}</div></details>`;
}
// 刷新 AI 对话视图：悬浮窗模式下重新渲染 floatRoot，否则刷新 ai-chat 应用窗口
// v3.1 修复：此前非悬浮窗分支递归调用自身，清空对话/切换开关时直接栈溢出
function refreshChatView() {
  if (window.__tzFloatMode) {
    const root = document.getElementById('floatRoot');
    const siteMode = !!window.__tzSiteEmbedMode;
    if (root) {
      root.innerHTML = renderAIChat({ floatMode: true, siteMode, disableAgent: siteMode });
      initChat('float-chat-win', siteMode);
    }
    return;
  }
  refreshOpenApp('ai-chat');
}

/* ===================== 对话内容跨窗口同步 =====================
 * OS 对话窗口与普通 AI 悬浮窗共享 chatSessions / activeChatId（同源 localStorage）；
 * 站内嵌入模式使用 tz_site_ai_chat_v1 独立存档，不参与这组会话同步。
 * 本窗口写入后调用 markChatDirty 记录签名；另一个窗口通过 storage 事件
 * （跨文档实时）+ 定时轮询（兜底）发现变化后增量重渲染消息区。
 * 设置不同步：API 配置共享；深度思考/提供方/截图开关各自独立（见 *_Ctx）。 */
let _lastChatSig = null;
function _chatSig(h) {
  if (!h || !h.length) return '0';
  const last = h[h.length - 1];
  return h.length + '|' + last.role + '|' + String(last.content || '').length + '|' + String(last.reasoning || '').length + '|' + (last.rounds ? last.rounds.length : 0);
}
function _chatStateSig() {
  const active = Store.getActiveChatId();
  const chats = Store.getChats();
  return active + '||' + chats.map(c => c.id + ':' + c.title + ':' + c.messages.length + ':' + (c.updatedAt || 0) + ':' + (c.archivedAt || 0)).join('|') + '||' + _chatSig(Store.getChat(active));
}
function markChatDirty() { try { _lastChatSig = _chatStateSig(); } catch (e) {} }
// 发现外部（另一个窗口）写入的新对话时，重渲染消息区（保留输入框草稿，不打断生成）
function syncChatFromStore(force) {
  if (_sessCtl()) {
    if (chatSess) chatSess.syncPending = true;
    return;
  }
  Store.invalidateChatCache(); // 另一个窗口可能写过，必须绕过当前会话命名空间的缓存读最新
  const activeId = Store.getActiveChatId();
  const history = Store.getChat(activeId);
  const sig = _chatStateSig();
  if (!force && sig === _lastChatSig) return;
  _lastChatSig = sig;
  if (!window.__tzSiteEmbedMode && getProviderCtx() === 'doubao') return; // 豆包嵌入模式无本地消息区
  if (chatSess && chatSess.chatId !== activeId) {
    refreshChatView();
    return;
  }
  const tabs = $('#chatTabs');
  if (tabs) { tabs.innerHTML = chatTabsHTML(); bindChatTabs(); }
  const msgs = $('#chatMsgs');
  if (!msgs || !msgs.isConnected) return;
  const wasEmpty = !!msgs.querySelector('.chat-empty');
  if (!history.length && wasEmpty) return;
  msgs.innerHTML = '';
  if (!history.length) {
    const ready = AI.isReady();
    const floatOnly = !!window.__tzFloatMode;
    const siteMode = !!window.__tzSiteEmbedMode;
    const emptyTitle = siteMode ? '天择网站内助手' : '天择 AI 助手';
    const emptyHint = ready
      ? (siteMode ? '可以询问当前页面、站内专栏，或让我帮你找到对应页面。' : (AI.supportsThinking(AI.config()) && getDeepThinkCtx() ? '深度思考已开启，会显示思考过程。' : '问我任何问题，或试试下面的建议'))
      : (siteMode ? '请先在天择OS的「AI 配置」中设置 API Key' : '请先在「AI 配置」中设置 API Key');
    const suggestions = siteMode
      ? ['这个页面主要讲什么？', '帮我找相关的站内专栏', '天择OS有哪些功能？']
      : ['介绍一下你自己', '帮我写一首关于夏天的诗', '解释一下量子纠缠，给出公式'];
    msgs.innerHTML = `<div class="chat-empty">
      <div class="ce-icon">${uiIconHTML('chat', 'AI 对话')}</div>
      <div class="ce-title">${emptyTitle}</div>
      <div id="chatEmptyHint" style="font-size:12px;max-width:360px">${emptyHint}</div>
      <div class="ce-suggest">
        ${ready ? suggestions.map(s => `<button type="button" class="chat-suggest-chip" onclick="TZOS.chatSuggest(this.textContent)">${s}</button>`).join('') : `<button type="button" class="chat-suggest-chip" onclick="TZOS.openConfig()">${floatOnly ? '打开 AI 配置 →' : '去配置 →'}</button>`}
      </div>
    </div>`;
    return;
  }
  history.forEach((m, i) => appendMsg(m.role, m.content, { reasoning: m.reasoning, rounds: m.rounds, usage: m.usage, actions: true, index: i }));
  if (chatSess) refreshContextEstimate(chatSess);
}
// 绑定跨窗口同步（每个文档只绑一次）：storage 事件（另一文档写入时触发）+ 4 秒轮询兜底
function ensureChatSyncBound() {
  if (window.__tzChatSyncBound) return;
  window.__tzChatSyncBound = true;
  window.addEventListener('storage', (e) => {
    const chatChanged = e.key === Store.chatStorageKey() || e.key === null;
    const configChanged = e.key === Store.KEY || e.key === null;
    if (chatChanged || configChanged) {
      let toolbarChanged = false;
      try {
        const pick = (raw) => {
          const s = JSON.parse(raw || '{}');
          return JSON.stringify([
            s.theme, s.palette, s.agentMode, s.deepThink, s.float_deepThink,
            s.provider, s.float_provider, s.chatScreenshot, s.float_chatScreenshot,
            s.chatWebSearch, s.float_webSearch, s.aiCaps, s.knowledgeSourceModes
          ]);
        };
        if (configChanged) toolbarChanged = pick(e.oldValue) !== pick(e.newValue);
      } catch (_) {}
      if (configChanged) Store._cache = null;
      if (chatChanged) Store.invalidateChatCache();
      if (configChanged && window.__tzFloatMode) applyTheme();
      setTimeout(() => {
        if (toolbarChanged && !_sessCtl()) refreshChatView();
        else if (chatChanged) syncChatFromStore(false);
      }, 40);
    }
  });
  setInterval(() => { if (!document.hidden) syncChatFromStore(false); }, 15000);
  markChatDirty();
}
function switchChatConversation(id) {
  if (!id || id === Store.getActiveChatId()) return;
  if (!Store.setActiveChat(id)) return;
  markChatDirty();
  refreshChatView();
}
function newChatConversation() {
  const chat = Store.newChat();
  if (!chat) { toast('最多同时保留 30 个未归档对话，请先归档一个标签'); return; }
  markChatDirty();
  refreshChatView();
}
function isChatGenerating(id) {
  return Object.values(ChatSessions.map).some(sess => sess && sess.chatId === id && sess.ctl);
}
async function closeChatConversation(id) {
  if (isChatGenerating(id)) { toast('这个对话仍在生成，请先切换到它并停止回答'); return; }
  const chat = Store.getChats().find(c => c.id === id);
  if (!chat) return;
  const ok = await confirmDialog({
    title: '归档对话',
    message: '归档「' + (chat.title || '新对话') + '」？\n它会从对话栏隐藏，但仍保留在知识库和“已归档对话”中。',
    confirmText: '归档'
  });
  if (!ok) return;
  Store.archiveChat(id);
  markChatDirty();
  refreshChatView();
  toast('对话已归档');
}
function mountChatTitleTabs() {
  const host = $('#chatTabsTitle');
  if (!host) return false;
  host.innerHTML = `<div class="chat-tabs chat-tabs--title" id="chatTabs" role="tablist" aria-label="AI 对话标签页">${chatTabsHTML()}</div>
    <button type="button" class="chat-tab-new chat-tab-new--title" id="chatNew" title="新建对话" aria-label="新建对话">${uiIconHTML('edit')}</button>`;
  return true;
}
function bindChatTabs() {
  const root = $('#chatTabs');
  if (!root) return;
  const tabs = $$('.chat-tab', root);
  tabs.forEach((tab, index) => {
    const id = tab.dataset.chatId;
    const main = $('.chat-tab__main', tab);
    const close = $('.chat-tab__close', tab);
    if (main) {
      main.id = 'chat-tab-' + id;
      main.tabIndex = tab.classList.contains('active') ? 0 : -1;
      main.onclick = () => switchChatConversation(id);
      main.onkeydown = (event) => {
        let next = -1;
        if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        if (event.key === 'Delete') {
          event.preventDefault();
          closeChatConversation(id);
          return;
        }
        if (next >= 0) {
          event.preventDefault();
          const nextId = tabs[next].dataset.chatId;
          switchChatConversation(nextId);
          setTimeout(() => focusSafely($(`.chat-tab[data-chat-id="${CSS.escape(nextId)}"] .chat-tab__main`)), 0);
        }
      };
    }
    if (close) close.onclick = (e) => { e.stopPropagation(); closeChatConversation(id); };
  });
  const add = $('#chatNew');
  if (add) add.onclick = newChatConversation;
  if (!root.dataset.wheelBound) {
    root.dataset.wheelBound = '1';
    root.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      root.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });
  }
  const active = $('.chat-tab.active', root);
  if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function refreshChatTabsOnly() {
  const root = $('#chatTabs');
  if (!root) return;
  root.innerHTML = chatTabsHTML();
  bindChatTabs();
}
function initChat(winId, disableAgent = false) {
  const siteMode = !!window.__tzSiteEmbedMode;
  // 豆包模式也必须先绑定跨窗口主题/配色同步；其 provider 分支随后会提前返回。
  ensureChatSyncBound();
  // 豆包网页嵌入模式：只绑定切换按钮 + iframe 加载隐藏提示
  if (!siteMode && getProviderCtx() === 'doubao') {
    const titleHost = $('#chatTabsTitle');
    if (titleHost) titleHost.innerHTML = `<span class="chat-title-static tz-icon-label">${uiIconHTML('ai')}<span>豆包 AI</span></span>`;
    const provBtn = $('#chatProvider');
    if (provBtn) provBtn.onclick = () => { setProviderCtx('custom'); toast('已切换为 ⚙️ 自定义AI'); refreshChatView(); };
    const f = $('#doubaoFrame');
    const hint = $('#doubaoHint');
    if (f && hint) {
      let loaded = false;
      const hide = () => { loaded = true; hint.style.display = 'none'; };
      f.addEventListener('load', hide);
      setTimeout(() => {
        if (loaded || !hint.parentNode) return;
        const sub = hint.querySelector('div[style*="14px"]');
        if (sub) sub.textContent = '豆包网页版加载较慢或被禁止嵌入…';
      }, 6000);
    }
    return;
  }
  mountChatTitleTabs();
  // 建立/恢复本窗口的会话（窗口重开时会话仍在，进行中的生成不中断）
  const activeChatId = Store.getActiveChatId();
  ChatSessions.releaseWindow(winId || 'chat-main', activeChatId);
  const sess = ChatSessions.get(winId || 'chat-main', activeChatId);
  sess.siteMode = siteMode;
  sess.disableAgent = siteMode || !!disableAgent || !hasDesktopAgentBroker();
  chatSess = sess;
  const msgs = $('#chatMsgs');
  const input = $('#chatInput');
  const sendBtn = $('#chatSend');
  sess.msgs = msgs;
  sess.ctxEl = $('#chatCtx');
  sess.attachEl = $('#chatAttach');
  sess.pending = sess.pending || [];
  sess.scroll = null;

  bindChatTabs();
  bindKnowledgeSettingsPanel(siteMode);
  bindArchivedChatsPanel(siteMode);
  const history = Store.getChat(sess.chatId);
  if (!history.length) {
    const ready = AI.isReady();
    const emptyTitle = siteMode ? '天择网站内助手' : '天择 AI 助手';
    const emptyHint = ready
      ? (siteMode ? '可以询问当前页面、站内专栏，或让我帮你找到对应页面。' : (AI.supportsThinking(AI.config()) && getDeepThinkCtx() ? '深度思考已开启，会显示思考过程。' : '问我任何问题，或试试下面的建议'))
      : (siteMode ? '请先在天择OS的「AI 配置」中设置 API Key' : '请先在「AI 配置」中设置 API Key');
    const suggestions = siteMode
      ? ['这个页面主要讲什么？', '帮我找相关的站内专栏', '天择OS有哪些功能？']
      : ['介绍一下你自己', '帮我写一首关于夏天的诗', '解释一下量子纠缠，给出公式'];
    msgs.innerHTML = `<div class="chat-empty">
      <div class="ce-icon">${uiIconHTML('chat', 'AI 对话')}</div>
      <div class="ce-title">${emptyTitle}</div>
      <div id="chatEmptyHint" style="font-size:12px;max-width:360px">${emptyHint}</div>
      <div class="ce-suggest">
        ${ready?suggestions.map(s=>`<button type="button" class="chat-suggest-chip" onclick="TZOS.chatSuggest(this.textContent)">${s}</button>`).join(''):`<button type="button" class="chat-suggest-chip" onclick="TZOS.openConfig()">${window.__tzFloatMode?'打开 AI 配置 →':'去配置 →'}</button>`}
      </div>
    </div>`;
  } else {
    history.forEach((m, i) => appendMsg(m.role, m.content, { reasoning: m.reasoning, rounds: m.rounds, usage: m.usage, actions: true, index: i }));
  }
  // 智能滚动：用户上滑阅读时不吸底
  bindChatScroll(msgs, sess);
  msgs.scrollTop = msgs.scrollHeight;
  // 初始上下文用量（v3.5：优先沿用上轮真实 token，历史变化才估算）
  refreshContextEstimate(sess);
  renderPendingChips(sess);
  // 若本会话有进行中的生成（窗口被关后重开），提示并恢复按钮态
  if (sess.ctl) {
    const tip = el('div', 'chat-resume-tip tz-icon-label', uiIconHTML('clock') + '<span>上次关闭窗口时的回答仍在生成中，完成后会自动出现在上方…</span>');
    msgs.appendChild(tip);
    msgs.scrollTop = msgs.scrollHeight;
  }
  updateChatSendBtn();
  input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } };
  input.oninput = () => { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; };
  // 粘贴图片/文件自动上传
  input.addEventListener('paste', (e) => {
    const items = (e.clipboardData && e.clipboardData.items) || [];
    const files = [];
    for (const it of items) { if (it.kind === 'file') { const f = it.getAsFile(); if (f) files.push(f); } }
    if (files.length) { e.preventDefault(); files.forEach(f => addPendingFile(sess, f)); }
  });
  sendBtn.onclick = sendChat;
  // 附件上传按钮（v3.5：任何模型都可传——不支持图片/文件输入时自动转为文字发送）
  const attachBtn = $('#chatAttachBtn'), fileInput = $('#chatFileInput');
  if (attachBtn && fileInput) {
    fileInput.accept = 'image/*,*/*';
    attachBtn.onclick = () => fileInput.click();
    fileInput.onchange = () => { [...fileInput.files].forEach(f => addPendingFile(sess, f)); fileInput.value = ''; };
  }
  // 工具栏
  const provBtn = $('#chatProvider');
  if (provBtn) provBtn.onclick = () => {
    const next = getProviderCtx()==='doubao' ? 'custom' : 'doubao';
    setProviderCtx(next);
    toast('已切换为 ' + (next==='doubao'?'🫘 豆包AI':'⚙️ 自定义AI'));
    refreshChatView();
  };
  const deepBtn = $('#chatDeep');
  if (deepBtn) deepBtn.onclick = () => {
    setDeepThinkCtx(!getDeepThinkCtx());
    const d = getDeepThinkCtx();
    syncDeepBtns();
    const eh = $('#chatEmptyHint');
    if (eh && AI.isReady()) eh.textContent = siteMode ? '可以询问当前页面、站内专栏，或让我帮你找到对应页面。' : (d ? '深度思考已开启，会显示思考过程。' : '问我任何问题，或试试下面的建议');
    toast('深度思考已' + (d ? '开启' : '关闭') + '（仅影响后续回复）');
  };
  // 联网搜索开关：能力由模型预设/AI 配置决定；这里只控制当前对话窗口是否启用。
  const webBtn = $('#chatWeb');
  if (webBtn) webBtn.onclick = () => {
    const next = !getWebSearchCtx();
    setWebSearchCtx(next);
    webBtn.classList.toggle('ghost', !next);
    webBtn.innerHTML = uiIconHTML('globe') + '<span>联网' + (next ? '·开' : '·关') + '</span>';
    const searchPrice = +(((Store.getAIConfig() || {}).prices || {}).search) || 0;
    toast('联网搜索已' + (next ? '开启' + (searchPrice ? '（调用时约 ¥' + searchPrice + '/次）' : '') : '关闭'));
  };
  // AI 命令行模式开关（v3.5：对话窗口内直接切换，与系统设置同源）
  const agentBtn = $('#chatAgent');
  if (agentBtn) agentBtn.onclick = () => {
    const next = !Store.getAgentMode();
    Store.setAgentMode(next);
    agentBtn.classList.toggle('ghost', !next);
    agentBtn.innerHTML = uiIconHTML('terminal') + '<span>命令行' + (next ? '·开' : '·关') + '</span>';
    toast('AI 命令行模式已' + (next ? '开启（自动写入记忆交给命令行）' : '关闭'), 3200);
    refreshOpenApp('ai-config');
    refreshOpenApp('settings');
  };
  // 自动截图开关（v3.5：任何模型可用——视觉模型直发截图，纯文本模型截图 OCR 成文字）
  const shotBtn = $('#chatShot');
  if (shotBtn) shotBtn.onclick = async () => {
    const next = !getScreenshotCtx();
    if (next) {
      if (siteMode) {
        toast('已开启：发送消息时会读取当前天择网页面的截图', 3000);
      } else {
        if (!Shot.supported()) { toast('当前环境不支持屏幕截取'); return; }
        toast('请在弹窗中选择「此标签页」共享天择OS画面', 3600);
        if (!(await Shot.ensure())) { toast('未获得屏幕共享授权，功能未开启', 3000); return; }
      }
    } else if (!siteMode) {
      Shot.stop();
    }
    setScreenshotCtx(next);
    shotBtn.classList.toggle('ghost', !next);
    shotBtn.innerHTML = uiIconHTML('camera') + '<span>截图' + (next ? '·开' : '·关') + '</span>';
    toast('自动截图已' + (next ? '开启（' + (effectiveAICaps().image !== false ? '截图随消息直接发送' : '纯文本模型：截图将 OCR 识别为文字') + '）' : '关闭'));
  };
  const clrBtn = $('#chatClear');
  if (clrBtn) clrBtn.onclick = async () => {
    const ok = await confirmDialog({ title: '清空对话', message: '清空当前对话历史？', confirmText: '清空', danger: true });
    if (!ok) return;
    Store.setChat([], sess.chatId);
    Store.updateChatMeta(sess.chatId, { title: '新对话', aiNamed: false, nameState: 'idle' });
    Store.setChatCtxReal(null, sess.chatId);
    markChatDirty();
    refreshChatView();
  };
  // 手动同步按钮：立即从共享存档拉取最新对话（悬浮窗 ↔ OS 对话窗口互通）
  const syncBtn = $('#chatSync');
  if (syncBtn) syncBtn.onclick = () => {
    if (_sessCtl()) { toast('正在生成中，完成后再同步'); return; }
    syncChatFromStore(true);
    toast('已同步最新对话');
  };
  // 自动同步：storage 事件 + 定时轮询（每个文档绑一次）
  ensureChatSyncBound();
  markChatDirty();
}
// token 用量格式化（缓存命中/缓存写入/普通输入/输出/总量 + 按单价估算费用）
function usageText(u) {
  if (!u) return '';
  const tokens = AIUsage.tokens(u);
  return '缓存命中 ' + tokens.hit + ' · 缓存写入 ' + tokens.write + ' · 普通输入 ' + tokens.input + ' · 输出 ' + tokens.output + ' · 总量 ' + tokens.total +
    (tokens.searches ? ' · 联网 ' + tokens.searches + ' 次' : '') + usageCostText(u);
}
// 按 AI 配置中的单价（每百万 tokens）估算本条消息费用；未填单价或费用为 0 时不显示
function usageCostText(u) {
  const config = Store.getAIConfig() || {};
  const p = config.prices || {};
  const rates = { hit: +p.hit || 0, write: +p.write || 0, input: +p.input || 0, output: +p.output || 0, search: +p.search || 0 };
  if (!(rates.hit || rates.write || rates.input || rates.output || rates.search)) return '';
  const tokens = AIUsage.tokens(u);
  const cost = (tokens.hit * rates.hit + tokens.write * rates.write + tokens.input * rates.input + tokens.output * rates.output) / 1e6 + tokens.searches * rates.search;
  if (!(cost > 0)) return '';
  const sym = p.unit === 'usd' ? '$' : '¥';
  const txt = cost >= 0.01 ? cost.toFixed(4) : (cost >= 0.0001 ? cost.toFixed(5) : cost.toExponential(2));
  return ' · 费用 ≈' + sym + txt;
}
function appendMsg(role, content, opts = {}) {
  const msgs = $('#chatMsgs');
  const empty = msgs.querySelector('.chat-empty');
  if (empty) empty.remove();
  const m = el('div', 'msg ' + role);
  const inner = opts.raw ? content
    : (role === 'ai' && opts.rounds && opts.rounds.length)
      ? renderRoundsHtml(opts.rounds, null, false)
      : reasoningHtml(opts.reasoning, false) + (role === 'ai' ? renderAiBody(content) : renderMd(content));
  m.innerHTML = `<div class="msg-avatar">${uiIconHTML(role === 'ai' ? 'ai' : 'user', role === 'ai' ? 'AI' : '用户')}</div><div class="msg-body"><div class="msg-bubble">${inner}</div>` +
    (opts.usage ? `<div class="msg-usage">${escapeHtml(usageText(opts.usage))}</div>` : '') +
    (opts.actions ? `<div class="msg-actions">` +
      `<button class="msg-act tz-icon-label" data-act="copy" title="复制这条内容">${uiIconHTML('copy')}<span>复制</span></button>` +
      (role === 'user'
        ? `<button class="msg-act tz-icon-label" data-act="edit" title="编辑此消息并重新发送（后续消息将删除）">${uiIconHTML('edit')}<span>编辑重发</span></button>`
        : `<button class="msg-act tz-icon-label" data-act="regen" title="重新生成回答（此条及后续消息将删除）">${uiIconHTML('refresh')}<span>重新生成</span></button>`) +
      `</div>` : '') +
    `</div>`;
  msgs.appendChild(m);
  if (role === 'ai' && !opts.raw) renderMath(m);
  if (opts.actions) {
    m.querySelectorAll('.msg-act').forEach(b => {
      b.onclick = () => {
        if (b.dataset.act === 'copy') copyText(typeof content === 'string' ? content : '');
        else if (b.dataset.act === 'edit') startEditMessage(opts.index);
        else if (b.dataset.act === 'regen') regenerateMessage(opts.index);
      };
    });
  }
  scrollChatToBottom(msgs, chatSess);
  return m;
}
function renderMd(text) {
  // 1) 抽取数学公式占位符，保护 $$...$$ 跨行不被破坏
  const maths = [];
  let work = String(text == null ? '' : text);
  work = work.replace(/\$\$([\s\S]*?)\$\$/g, (m, c) => { maths.push({ d: true, c }); return '\u0000M' + (maths.length - 1) + '\u0000'; });
  work = work.replace(/(?<!\$)\$([^\$\n]+?)\$(?!\$)/g, (m, c) => { maths.push({ d: false, c }); return '\u0000M' + (maths.length - 1) + '\u0000'; });
  // 2) 抽取围栏代码块（防止内部文本被 markdown 规则误伤）
  const codes = [];
  work = work.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, l, c) => { codes.push(c.replace(/\n$/, '')); return '\n\u0000C' + (codes.length - 1) + '\u0000\n'; });
  // 3) 抽取行内代码
  const ics = [];
  work = work.replace(/`([^`\n]+)`/g, (m, c) => { ics.push(c); return '\u0000I' + (ics.length - 1) + '\u0000'; });
  // 4) 抽取链接与图片（转义前提取，避免 URL 中的 & 与括号被转义破坏；拦截 javascript: 伪协议）
  const links = [];
  work = work.replace(/!?\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (m, t, u, ti) => {
    const isImg = m.charAt(0) === '!';
    let safe = /^(https?:|data:image\/|mailto:)/i.test(u) ? u : '#';
    let siteUrl = '';
    if (window.__tzSiteEmbedMode && !isImg) {
      siteUrl = SiteAI.siteUrl(u, SiteAI.current.url || '/');
      if (siteUrl) safe = siteUrl;
    }
    links.push({ isImg, t, u: safe, ti: ti || '', siteUrl });
    return '￼L' + (links.length - 1) + '￼';
  });
  // 5) 转义后按行做块级解析
  const lines = escapeHtml(work).split('\n');
  // 行内格式：先加粗（**/__）后斜体（*/_），避免 ** 被斜体规则吃掉导致加粗失效
  const inlineFmt = (s) => s
    .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__([\s\S]+?)__/g, '<strong>$1</strong>')
    .replace(/(?<![\w*])\*([^*\n]+?)\*(?![\w*])/g, '<em>$1</em>')
    .replace(/(?<![\w_])_([^_\n]+?)_(?![\w_])/g, '<em>$1</em>')
    .replace(/~~([^~]+?)~~/g, '<s>$1</s>');
  const out = [];
  let i = 0, para = [];
  const flushPara = () => { if (para.length) { out.push('<p>' + para.map(inlineFmt).join('<br>') + '</p>'); para = []; } };
  const splitRow = (r) => { let s = r.trim(); if (s.startsWith('|')) s = s.slice(1); if (s.endsWith('|')) s = s.slice(0, -1); return s.split('|').map(c => c.trim()); };
  while (i < lines.length) {
    const line = lines[i];
    const trim = line.trim();
    let m;
    if ((m = trim.match(/^\u0000C(\d+)\u0000$/))) { flushPara(); out.push('\u0000C' + m[1] + '\u0000'); i++; continue; }
    if (!trim) { flushPara(); i++; continue; }
    // 标题 # ~ ######
    if ((m = line.match(/^(#{1,6})\s+(.+)$/))) { flushPara(); const lv = m[1].length; out.push('<h' + lv + '>' + inlineFmt(m[2].trim()) + '</h' + lv + '>'); i++; continue; }
    // 分割线 --- / *** / ___
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); out.push('<hr>'); i++; continue; }
    // 表格（GFM）：当前行含 | 且下一行是分隔行
    if (line.indexOf('|') >= 0 && i + 1 < lines.length && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      flushPara();
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map(a => /^:-+:$/.test(a) ? 'center' : /^-+:$/.test(a) ? 'right' : 'left');
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].indexOf('|') >= 0 && lines[i].trim()) { rows.push(splitRow(lines[i])); i++; }
      const cell = (t, tag, j) => '<' + tag + (aligns[j] && aligns[j] !== 'left' ? ' style="text-align:' + aligns[j] + '"' : '') + '>' + inlineFmt(t) + '</' + tag + '>';
      let th = '<div class="md-table-wrap"><table class="md-table"><thead><tr>' + head.map((h, j) => cell(h, 'th', j)).join('') + '</tr></thead><tbody>';
      th += rows.map(r => '<tr>' + head.map((_, j) => cell(r[j] || '', 'td', j)).join('') + '</tr>').join('');
      out.push(th + '</tbody></table></div>');
      continue;
    }
    // 无序列表
    if (/^\s*[-*+]\s+/.test(line)) {
      flushPara();
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*+]\s+/, '')); i++; }
      out.push('<ul>' + items.map(t => '<li>' + inlineFmt(t) + '</li>').join('') + '</ul>');
      continue;
    }
    // 有序列表
    if (/^\s*\d{1,3}[.)]\s+/.test(line)) {
      flushPara();
      const items = [];
      while (i < lines.length && /^\s*\d{1,3}[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d{1,3}[.)]\s+/, '')); i++; }
      out.push('<ol>' + items.map(t => '<li>' + inlineFmt(t) + '</li>').join('') + '</ol>');
      continue;
    }
    // 引用块（转义后的 > 为 &gt;）
    if (/^\s*&gt;\s?/.test(line)) {
      flushPara();
      const items = [];
      while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) { items.push(lines[i].replace(/^\s*&gt;\s?/, '')); i++; }
      out.push('<blockquote>' + items.map(inlineFmt).join('<br>') + '</blockquote>');
      continue;
    }
    para.push(line);
    i++;
  }
  flushPara();
  let html = out.join('\n');
  // 5) 还原行内代码 / 代码块 / 数学公式
  html = html.replace(/\u0000I(\d+)\u0000/g, (m, n) => '<code class="md-ic">' + escapeHtml(ics[+n]) + '</code>');
  html = html.replace(/\u0000C(\d+)\u0000/g, (m, n) => '<pre><code>' + escapeHtml(codes[+n]) + '</code></pre>');
  html = html.replace(/\u0000M(\d+)\u0000/g, (m, n) => {
    const x = maths[+n]; if (!x) return '';
    const delim = x.d ? '$$' : '$';
    return '<span class="tz-math">' + escapeHtml(delim + x.c + delim) + '</span>';
  });
  // 还原链接与图片（占位符为 ￼L…￼）
  html = html.replace(/￼L(\d+)￼/g, (m, n) => {
    const x = links[+n]; if (!x) return '';
    if (x.isImg) return '<img class="md-img" src="' + escapeHtml(x.u) + '" alt="' + escapeHtml(x.t) + '" loading="lazy">';
    const attrs = x.siteUrl
      ? ' data-site-url="' + escapeHtml(x.siteUrl) + '" target="_top"'
      : ' target="_blank" rel="noopener"';
    return '<a class="md-link" href="' + escapeHtml(x.u) + '"' + attrs + ' title="' + escapeHtml(x.ti || x.u) + '">' + (x.t ? inlineFmt(escapeHtml(x.t)) : escapeHtml(x.u)) + '</a>';
  });
  return html;
}
/* ---- AI 消息正文渲染（剥离 tzcli 命令块并生成执行卡片） ---- */
function parseTzcli(text) {
  const out = [];
  String(text || '').replace(/```tzcli\s*\n([\s\S]*?)```/g, (m, body) => {
    body.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')).forEach(s => out.push(s));
    return m;
  });
  return out;
}
function renderAiBody(text, cmdLog, ongoing) {
  if (!cmdLog) cmdLog = parseTzcli(text).map(c => ({ cmd: c, ok: true, out: '' }));
  const stripped = String(text || '').replace(/```tzcli\s*\n[\s\S]*?```/g, '').trim();
  let html = stripped ? renderMd(stripped) : '';
  if (cmdLog.length) html += cmdCardHtml(cmdLog);
  if (!html && ongoing) html = '';
  return html;
}
/* ---- 多轮 Agent 渲染：思考过程 → 回答 → 命令卡片 → 下一轮…（agent 式交错） ---- */
function stripTzcli(text) { return String(text || '').replace(/```tzcli\s*\n[\s\S]*?```/g, '').trim(); }
function agentCommandCardMeta(item) {
  const command = String(item && item.cmd || '').trim();
  const data = item && item.data;
  if (data && data.kind === 'ask') return { kind: 'ask', title: 'Agent 问了 AI：' + data.question };
  if (data && data.kind === 'agent') return { kind: 'agent', title: '调用了子智能体：' + data.question };
  if (data && data.kind === 'app-command') return { kind: 'app', title: 'AI 让「' + data.appName + '」执行了「' + data.command + '」' };
  const lower = command.toLowerCase();
  const rules = [
    [/^(?:words|word)\s+add\b/, 'AI 往单词本里新增了一个单词'],
    [/^(?:words|word)\s+(?:del|delete|remove)\b/, 'AI 从单词本里删除了一个单词'],
    [/^(?:words|word)\s+(?:find|search)\b/, 'AI 搜索了单词本'],
    [/^(?:words|word)(?:\s+(?:list|count))?\b/, 'AI 查看了单词本'],
    [/^note\s+new\b/, 'AI 新建了一篇笔记'],
    [/^note\s+(?:edit|append)\b/, 'AI 修改了一篇笔记'],
    [/^note\s+(?:del|delete|remove)\b/, 'AI 删除了一篇笔记'],
    [/^note\s+(?:view|open|export)\b/, 'AI 查看了一篇笔记'],
    [/^note\s+(?:list|search)\b/, 'AI 检索了笔记'],
    [/^(?:mem|memory)\s+add\b/, 'AI 写入了一条记忆'],
    [/^(?:mem|memory)\s+(?:del|delete|remove)\b/, 'AI 删除了一条记忆'],
    [/^(?:mem|memory)\s+(?:on|off|enable|disable|edit)\b/, 'AI 更新了一条记忆'],
    [/^(?:mem|memory)(?:\s+list)?\b/, 'AI 查看了记忆'],
    [/^(?:app\s+)?install\b/, 'AI 安装了一个应用'],
    [/^(?:app\s+)?uninstall\b/, 'AI 卸载了一个应用'],
    [/^(?:app\s+)?(?:rename|sethtml|code\s+set)\b/, 'AI 修改了一个应用'],
    [/^(?:app\s+)?(?:open)\b/, 'AI 打开了一个应用'],
    [/^(?:app\s+)?(?:close)\b/, 'AI 关闭了一个应用'],
    [/^window\s+open\b/, 'AI 打开了一个窗口'],
    [/^window\s+close\b/, 'AI 关闭了窗口'],
    [/^window\s+(?:focus|restore|maximize|minimize|pin|unpin|move|resize)\b/, 'AI 调整了窗口'],
    [/^chat\s+new\b/, 'AI 新建了一个对话'],
    [/^chat\s+archive\b/, 'AI 归档了一个对话'],
    [/^chat\s+restore\b/, 'AI 还原了一个对话'],
    [/^chat\s+(?:delete|clear)\b/, 'AI 删除了对话内容'],
    [/^chat\s+(?:list|show|export|use)\b/, 'AI 查看了对话'],
    [/^knowledge\s+(?:search|show|documents|status|sources)\b/, 'AI 查询了知识库'],
    [/^knowledge\s+(?:mode|remove|rebuild)\b/, 'AI 更新了知识库'],
    [/^(?:shell\s+run|powershell|cmd)\b/, 'AI 在本机 Shell 中执行了命令'],
    [/^shell\s+(?:stop|jobs|pwd|cd|profile|env)\b/, 'AI 管理了本机 Shell 会话'],
    [/^(?:openurl|go|web\s+open|browser)\b/, 'AI 使用了浏览器'],
    [/^(?:notify|notify\s+send)\b/, 'AI 发送了一条系统通知'],
    [/^(?:coc|coc-data|coc-game|village|planner|dmg)\b/, 'AI 使用了 COC 专区工具'],
    [/^(?:clock|clock-now|stopwatch|timer)\b/, 'AI 使用了时钟工具'],
    [/^(?:system|settings|theme|style|skin|level|version|about)\b/, 'AI 调整或查看了系统'],
    [/^(?:js|dev\s+eval)\b/, 'AI 执行了开发者脚本'],
    [/^cmd\s+/, 'AI 调用了一个应用注册的指令']
  ];
  const match = rules.find(([pattern]) => pattern.test(lower));
  return { kind: 'command', title: match ? match[1] : 'AI 执行了「' + (command.split(/\s+/)[0] || '命令') + '」' };
}
function subAgentWorkflowHtml(data) {
  const workflow = Array.isArray(data && data.workflow) ? data.workflow : [];
  const steps = workflow.map((step, index) => {
    let body = '<div class="cmd-line">第 ' + (index + 1) + ' 轮</div>';
    if (step.reasoning) body += '<div class="cmd-res">思考：' + escapeHtml(step.reasoning) + '</div>';
    const answer = stripTzcli(step.text || '');
    if (answer) body += '<div class="cmd-res">回答：' + escapeHtml(answer) + '</div>';
    (step.commands || []).forEach(command => {
      const meta = agentCommandCardMeta(command);
      body += '<div class="cmd-line">' + escapeHtml(meta.title) + '</div><div class="cmd-res' + (command.ok ? '' : ' err') + '">' + escapeHtml(command.out || '(完成)') + '</div>';
    });
    if (step.loopStopped) body += '<div class="cmd-res err">' + escapeHtml(step.loopStopped) + '</div>';
    return body;
  }).join('');
  return steps || '<div class="cmd-res">（子智能体未产生工作步骤）</div>';
}
function cmdCardHtml(cmds) {
  if (!cmds || !cmds.length) return '';
  return cmds.map(c => {
    const meta = agentCommandCardMeta(c);
    const data = c && c.data;
    let body = '';
    if (meta.kind === 'ask') {
      body = '<div class="cmd-line">问题</div><div class="cmd-res">' + escapeHtml(data.question || '') + '</div>' +
        '<div class="cmd-line">AI 回答</div><div class="cmd-res">' + escapeHtml(data.answer || c.out || '') + '</div>';
    } else if (meta.kind === 'agent') {
      body = subAgentWorkflowHtml(data) + '<div class="cmd-line">子智能体结论</div><div class="cmd-res">' + escapeHtml(data.answer || c.out || '') + '</div>';
    } else {
      body = '<div class="cmd-line">' + escapeHtml(c.cmd) + '</div>' +
        '<div class="cmd-res' + (c.ok ? '' : ' err') + '">' + escapeHtml(c.out || '(完成)') + '</div>';
    }
    return '<details class="cmd-card cmd-card--' + meta.kind + '" open><summary>' + escapeHtml(meta.title) + '</summary><div class="cmd-body">' + body + '</div></details>';
  }).join('');
}
function renderRoundHtml(r, ongoing) {
  if (!r) return '';
  let h = '';
  if (r.reasoning) h += reasoningHtml(r.reasoning, !!ongoing);
  const stripped = stripTzcli(r.text);
  // 流式期间只做安全的轻量文本绘制；一轮完成后再一次性解析 Markdown/LaTeX。
  // 这避免每个 token 都对累计全文做正则、innerHTML 和 KaTeX 重算。
  if (stripped) h += ongoing
    ? '<div class="chat-stream-text">' + escapeHtml(stripped).replace(/\n/g, '<br>') + '</div>'
    : renderMd(stripped);
  if (r.cmds && r.cmds.length) h += cmdCardHtml(r.cmds);
  return h;
}
function renderRoundsHtml(doneRounds, curRound, ongoing) {
  let html = '';
  (doneRounds || []).forEach(r => { html += renderRoundHtml(r, false); });
  if (curRound) html += renderRoundHtml(curRound, ongoing);
  return html;
}
// 复制文本到剪贴板（带降级方案）
function copyText(text) {
  const done = () => toast('📋 已复制');
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败'); }
    ta.remove();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
  else fallback();
}
// 多轮 Agent 生成时合并 usage（token 累加）
function mergeUsage(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  const o = { ...a };
  Object.keys(b).forEach(k => { if (typeof b[k] === 'number') o[k] = (o[k] || 0) + b[k]; });
  return o;
}
// 深度思考开关变化时同步所有窗口中的按钮（修复多窗口状态不一致导致的"关不掉"）
function syncDeepBtns() {
  const d = getDeepThinkCtx();
  $$('.js-deep-btn').forEach(b => {
    b.classList.toggle('ghost', !d);
    b.innerHTML = uiIconHTML('ai') + '<span>深度思考' + (d ? '·开' : '·关') + '</span>';
    b.classList.add('tz-icon-label');
  });
}
// LaTeX 仅在 AI 回复需要公式时加载，避免 KaTeX 阻塞 OS 首屏和开机动画。
const KATEX_OPTS = { delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false},{left:'\\(',right:'\\)',display:false},{left:'\\[',right:'\\]',display:true}], throwOnError:false };
let _katexPromise = null;
function loadExternalScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}
function loadKatexFrom(base) {
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = base + '/katex.min.css';
  document.head.appendChild(css);
  return loadExternalScript(base + '/katex.min.js')
    .then(() => loadExternalScript(base + '/contrib/auto-render.min.js'));
}
function ensureKatex() {
  if (window.renderMathInElement) return Promise.resolve();
  if (!_katexPromise) {
    _katexPromise = loadKatexFrom('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist')
      .catch(() => loadKatexFrom('https://cdn.staticfile.org/KaTeX/0.16.11'));
  }
  return _katexPromise;
}
function renderMath(node) {
  if (!node) return;
  ensureKatex().then(() => {
    if (!node.isConnected || !window.renderMathInElement) return;
    try { window.renderMathInElement(node, KATEX_OPTS); } catch {}
  }).catch(() => {});
}
/* ===================== 聊天会话注册表 =====================
 * 每个 AI 对话窗口一个会话，独立 AbortController，互不干扰。
 * 会话脱离具体窗口 DOM 存活：窗口关闭后再打开，生成中的会话会重新绑定到新窗口，
 * 因此"关闭对话窗口不会中断正在进行的 AI 请求"。 */
const ChatSessions = {
  map: {},
  get(winId, chatId) {
    const key = String(winId) + '::' + String(chatId);
    if (!this.map[key]) this.map[key] = { key, winId, chatId, ctl: null, target: null, scroll: null, pending: [] };
    return this.map[key];
  },
  releaseWindow(winId, keepChatId = '') {
    Object.keys(this.map).forEach(key => {
      const sess = this.map[key];
      if (!sess || String(sess.winId) !== String(winId) || (keepChatId && sess.chatId === keepChatId)) return;
      // 后台请求可以继续，但关闭的视图不再保留 DOM 和 base64 附件。
      sess.msgs = null;
      sess.ctxEl = null;
      sess.attachEl = null;
      sess.scroll = null;
      sess.target = null;
      if (!sess.ctl) {
        sess.pending = [];
        delete this.map[key];
      }
    });
    this.prune();
  },
  releaseChat(chatId) {
    Object.keys(this.map).forEach(key => {
      const sess = this.map[key];
      if (!sess || sess.chatId !== chatId || sess.ctl) return;
      sess.pending = [];
      delete this.map[key];
    });
  },
  prune() {
    const idle = Object.keys(this.map).filter(key => this.map[key] && !this.map[key].ctl);
    if (idle.length <= 12) return;
    idle.slice(0, idle.length - 12).forEach(key => delete this.map[key]);
  }
};
const chatNamingInFlight = new Set();
function chatNamingText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(part => part && part.text ? part.text : '').filter(Boolean).join(' ');
  return String(content || '');
}
function cleanChatTitle(raw) {
  let title = String(raw || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/^\s*(?:标题|对话标题)\s*[:：]\s*/i, '')
    .replace(/^[\s"'`“”‘’《》「」【】]+|[\s"'`“”‘’《》「」【】]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (title.length > 18) title = title.slice(0, 18).trim();
  return title;
}
async function maybeNameChat(chatId) {
  if (!chatId || chatNamingInFlight.has(chatId) || !AI.isReady()) return;
  const chat = Store.getChats().find(item => item.id === chatId);
  if (!chat || chat.aiNamed || (chat.nameState && chat.nameState !== 'idle')) return;
  const firstUser = chat.messages.find(message => message && message.role === 'user');
  const firstAi = chat.messages.find(message => message && (message.role === 'ai' || message.role === 'assistant'));
  if (!firstUser || !firstAi) return;
  if (!Store.updateChatMeta(chatId, { nameState: 'pending', aiNamed: false })) return;
  chatNamingInFlight.add(chatId);
  try {
    const userText = chatNamingText(firstUser.content).slice(0, 900);
    const aiText = chatNamingText(firstAi.content).slice(0, 900);
    const result = await AI.chat([
      { role: 'system', content: '请给这段对话起一个简洁中文标题。只输出标题，不要引号、解释、标点或换行，建议 4 到 12 个字。' },
      { role: 'user', content: `用户：${userText}\n助手：${aiText}` }
    ], { temperature: 0.2, max_tokens: 32, thinking: false, source: 'chat' });
    const title = cleanChatTitle(result.content);
    if (title.length < 2) throw new Error('标题为空');
    const current = Store.getChats().find(item => item.id === chatId);
    if (!current || current.nameState !== 'pending') return;
    Store.updateChatMeta(chatId, { title, aiNamed: true, nameState: 'done' });
    markChatDirty();
    refreshChatTabsOnly();
  } catch (error) {
    const current = Store.getChats().find(item => item.id === chatId);
    if (current && current.nameState === 'pending') {
      Store.updateChatMeta(chatId, { aiNamed: false, nameState: 'failed' });
    }
  } finally {
    chatNamingInFlight.delete(chatId);
  }
}
// 当前窗口上下文（initChat 内赋值，其闭包内的函数都操作这个会话）
let chatSess = null;
// 兼容旧引用：chatCtl/chatCtlTarget 转发到当前会话（外部代码只读判断 busy）
function _sessCtl() { return chatSess ? chatSess.ctl : null; }

function updateChatSendBtn() {
  const sendBtn = $('#chatSend');
  if (!sendBtn || !chatSess) return;
  const busy = !!chatSess.ctl;
  sendBtn.innerHTML = uiIconHTML(busy ? 'stop' : 'play');
  sendBtn.title = busy ? '停止生成' : '发送';
  sendBtn.classList.toggle('stopping', busy);
}
function stopGeneration() {
  const sess = chatSess;
  if (!sess || !sess.ctl) return;
  // 1) 立刻把"⏹ 已停止生成"提示写进 bubble（不等 runGeneration 走完 catch/finally，避免用户看到残留内容"以为没停"）
  try {
    const t = sess.target;
    if (t && t.bubble && t.bubble.isConnected) {
      const existing = t.stopped || t.bubble.querySelector('.tz-stopped-tip');
      if (!existing) {
        const tip = el('div', 'tz-stopped-tip tz-icon-label', uiIconHTML('stop') + '<span>已停止生成</span>');
        t.bubble.appendChild(tip);
        if (t.msgs && t.msgs.isConnected) scrollChatToBottom(t.msgs, sess);
      }
    }
  } catch (_) {}
  // 2) 中断 AbortController（同步）；listener 链会立即 reject 渲染层 promise 并通知主进程
  try { sess.ctl.abort(); } catch (_) {}
  // 3) 即时把按钮变回 ➤（catch/finally 还会再调用一次，但这里先给用户即时反馈）
  sess.ctl = null;
  sess.target = null;
  updateChatSendBtn();
}

/* ---- 智能滚动：生成期间仅当用户本来就在底部附近时才吸底；用户上滑阅读时不打扰 ---- */
function bindChatScroll(msgs, sess) {
  // 初始视为贴底（历史回填后滚到底部）
  sess.scroll = { stick: true, bound: true };
  msgs.addEventListener('scroll', () => {
    if (!sess.scroll) return;
    const gap = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight;
    // 只有用户主动离开底部区域才取消吸底；回到距底 48px 内恢复吸底
    sess.scroll.stick = gap < 48;
  }, { passive: true });
}
function scrollChatToBottom(msgs, sess) {
  if (!msgs || !msgs.isConnected) return;
  // 无会话（如历史回填）直接滚到底；生成中遵循用户阅读位置
  if (!sess || !sess.scroll || sess.scroll.stick) msgs.scrollTop = msgs.scrollHeight;
}

// 编辑某条用户消息：内容填入输入框，发送时删除该消息及后续
function startEditMessage(i) {
  if (_sessCtl()) { toast('正在生成中，请先停止'); return; }
  const sess = chatSess;
  if (!sess) return;
  const history = Store.getChat(sess.chatId);
  const msg = history[i];
  if (!msg || msg.role !== 'user') return;
  const input = $('#chatInput');
  if (!input) return;
  input.value = msg.content;
  input.dataset.editIdx = i;
  input.style.height = 'auto';
  input.style.height = Math.min(120, input.scrollHeight) + 'px';
  input.focus();
  const n = history.length - i - 1;
  toast('已载入编辑。发送后将替换此消息' + (n > 0 ? '并删除后续 ' + n + ' 条消息' : ''), 3000);
}

// 重新生成某条 AI 消息：删除该条及后续，以其前最近的用户消息重新生成
async function regenerateMessage(i) {
  if (_sessCtl()) { toast('正在生成中，请先停止'); return; }
  const sess = chatSess;
  if (!sess) return;
  const chatId = sess.chatId;
  const history = Store.getChat(chatId);
  if (!history[i] || history[i].role !== 'ai') return;
  let ui = i - 1;
  while (ui >= 0 && history[ui].role !== 'user') ui--;
  if (ui < 0) { toast('找不到对应的用户消息'); return; }
  const userText = history[ui].content;
  history.splice(ui + 1); // 删除该 AI 消息及之后的全部
  Store.setChat(history, chatId);
  markChatDirty();
  refreshChatView();
  await runGeneration(userText, sess, chatId);
}

async function sendChat() {
  const sess = chatSess;
  const input = $('#chatInput');
  if (_sessCtl()) { stopGeneration(); return; } // 生成中点击 = 停止
  if (!sess || !input) return;
  const chatId = sess.chatId;
  const text = input.value.trim();
  if (!text) return;
  if (chatSess && (chatSess.pending || []).some(p => p.kind === 'ocr' && p.status === 'doing')) { toast('图片仍在 OCR 识别中，请稍候再发送', 2600); return; }
  if (chatSess && (chatSess.pending || []).some(p => p.kind === 'ocr' && p.status === 'fail')) toast('有图片识别失败，将不会随消息附带', 2600);
  if (!AI.isReady()) {
    if (window.__tzFloatMode) toast('请回到天择OS主窗口配置 AI');
    else { toast('请先配置 AI'); launchApp('ai-config'); }
    return;
  }
  const history = Store.getChat(chatId);
  // 编辑重发：截断到被编辑消息（含）之前
  if (input.dataset.editIdx !== undefined) {
    const i = parseInt(input.dataset.editIdx, 10);
    delete input.dataset.editIdx;
    if (!isNaN(i) && i >= 0 && i < history.length) {
      history.splice(i);
      Store.setChat(history, chatId);
      markChatDirty();
      refreshChatView();
    }
  }
  input.value = ''; input.style.height = 'auto';
  history.push({ role: 'user', content: text });
  Store.setChat(history, chatId);
  markChatDirty();
  refreshChatTabsOnly();
  if (!sess.siteMode) RPG.gain('chat'); // 站内 AI 使用独立会话，不改写 OS 成长状态
  appendMsg('user', text, { actions: true, index: history.length - 1 });
  await runGeneration(text, sess, chatId);
}

// 估算单条消息大致 token 数（用于上下文用量条，非精确值）
// v3.5 修订：中文按 ≈1 token/字、英文按 ≈1 token/4 字符分别计（旧版统一 /2.5，中文被低估约一半）；
// 图片部分（image_url）每张按 ≈1000 token 计入。
function estTokens(m) {
  let s = '', imgs = 0;
  if (typeof m.content === 'string') s = m.content;
  else if (Array.isArray(m.content)) {
    for (const p of m.content) {
      if (p && p.type === 'image_url') imgs++;
      else if (p && p.text) s += p.text;
    }
  }
  s = String(s);
  const cjk = (s.match(/[\u2e80-\u9fff\uff00-\uffef]/g) || []).length;
  return cjk + Math.ceil((s.length - cjk) / 4) + imgs * 1000 + 4;
}
// 构造对话系统提示词（与 runGeneration 同源；shot=false 用于上下文估算）
function buildChatSysPrompt(agentOn, caps, shot, siteContext = '', siteMode = false, localContext = '') {
  const identity = siteMode
    ? '你是天择网 AI 助手。回答简洁有用，使用中文。'
    : '你是天择 AI 助手，运行在天择OS中。回答简洁有用，使用中文。';
  const siteGuide = siteMode
    ? '\n\n你当前是嵌入天择网各页面的站内问答助手。当前页面、站点索引以及用户本机命中的文档、笔记和历史会话都是只读参考资料；请优先依据这些资料回答，并尽量标注来源标题与资料时间。涉及具体站内页面时给出对应的站内 Markdown 链接，例如 [页面标题](/path/)。不要自动导航、不要声称已经打开或操作页面，也不要输出或执行天择OS命令。若资料不足，请明确说明，不要编造资料、页面或 URL。' +
      (siteContext ? '\n\n以下是本轮可用的天择网站内资料：\n' + siteContext : '')
    : '';
  const localGuide = !siteMode && localContext
    ? '\n\n以下是本机优先检索命中的只读摘录。回答时请标注来源标题和更新时间，不要声称看过未提供的完整文档；若摘录不足请明确说明。本机检索只负责选取资料，所列命中摘录会随本轮请求发送给当前配置的模型：\n' + localContext
    : '';
  return identity + '可写代码（markdown代码块）。数学公式用 LaTeX：行内 $...$，块级 $$...$$。' + (siteMode ? '' : Mem.promptSnippet()) + (agentOn ? CLI.aiPrompt() : '') +
    (shot ? '\n\n用户已明确授权屏幕共享，并在浏览器选择器中选择了一个标签页、窗口或屏幕；本条消息附带一张来自该共享源的截图，请结合截图内容回答。' : '') +
    (caps.webSearch ? '\n\n本轮对话已开启联网搜索：需要实时信息时系统会提供搜索结果，请结合搜索结果回答并注明来源。' : '') +
    siteGuide + localGuide;
}
// 刷新上下文用量条（v3.5 修复"刷新后上下文变少"）：
// 上一轮 API 返回的真实 prompt_tokens 会连同历史长度持久化到 chatCtxReal；
// 历史未变时直接沿用真实值（与刷新前显示一致），历史变了才退回估算（估算含系统提示词）。
function refreshContextEstimate(sess) {
  if (!sess) return;
  const history = Store.getChat(sess.chatId);
  const rec = Store.getChatCtxReal(sess.chatId);
  if (rec && rec.len === history.length && rec.tokens > 0) {
    updateContextBar(sess, [], { prompt_tokens: rec.tokens });
    return;
  }
  const siteContext = sess.siteMode ? SiteAI.currentPrompt() : '';
  const sys = buildChatSysPrompt(!sess.disableAgent && Store.getAgentMode(), effectiveAICaps(), false, siteContext, !!sess.siteMode);
  updateContextBar(sess, [{ role: 'system', content: sys }, ...history], null);
}
// 更新上下文用量条（对话工具栏右侧）
function updateContextBar(sess, messages, usage) {
  const bar = sess && sess.ctxEl;
  if (!bar || !bar.isConnected) return;
  const caps = effectiveAICaps();
  const limit = parseInt(caps.contextLength, 10) || 0;
  let used = 0;
  if (usage && (usage.prompt_tokens || usage.total_tokens)) used = usage.prompt_tokens || usage.total_tokens;
  else used = messages.reduce((a, m) => a + estTokens(m), 0);
  if (limit > 0) {
    const pct = Math.min(100, Math.round(used / limit * 100));
    bar.innerHTML = uiIconHTML('info') + '<span>上下文 ' + used + ' / ' + limit + '（' + pct + '%）</span>';
    bar.classList.add('tz-icon-label');
    bar.style.color = pct >= 90 ? '#fca5a5' : pct >= 70 ? '#fbbf24' : '';
    bar.title = '本轮对话约占用的上下文 token；达到上限后请开启新对话或在 AI 配置中调大上下文长度';
  } else {
    bar.innerHTML = uiIconHTML('info') + '<span>上下文 ≈' + used + '</span>';
    bar.classList.add('tz-icon-label');
    bar.style.color = '';
    bar.title = '本轮对话估算的上下文 token；在「AI 配置 → 能力设置」填入上下文长度后显示百分比';
  }
}

// 核心生成流程：流式 + 实时公式渲染 + 思考过程 + token 统计 + 命令行 Agent 轮次 + 自动截图/附件 + 联网搜索 + 记忆
// sess 为窗口会话；窗口被关闭后会话仍继续，重新打开窗口时可用 resumeGeneration 重新绑定显示。
function hasDesktopAgentBroker() {
  return !window.__tzFloatMode ||
    !!(window.tzDesktop && typeof window.tzDesktop.executeAgentCommand === 'function');
}
async function executeAgentCommand(command, options = {}) {
  const text = String(command || '').trim();
  if (!text) return { ok: false, out: '命令为空' };
  const recorded = result => {
    if (options.activityId) AgentActivity.command(options.activityId, text, result);
    return result;
  };
  if (window.__tzSiteEmbedMode) return recorded({ ok: false, out: '站内 AI 模式禁止调用天择OS命令行或桌面 Agent' });
  // AI 与用户共享完整命令集，包括 ask；不设置命令长度、次数、轮数或固定超时上限。
  if (window.__tzFloatMode) {
    if (!window.tzDesktop || typeof window.tzDesktop.executeAgentCommand !== 'function') {
      return recorded({ ok: false, out: '无法连接天择OS主窗口，桌面 Agent 命令未执行' });
    }
    try {
      const result = await window.tzDesktop.executeAgentCommand(text);
      Store._cache = null;
      return recorded(result);
    } catch (error) {
      Store._cache = null;
      return recorded({
        ok: false,
        out: '桌面 Agent 执行失败：' + String(error && error.message ? error.message : error)
      });
    }
  }
  const result = CLI.exec(text, { byAI: true, signal: options.signal || null, agentTrace: options.agentTrace || [] });
  return recorded((result && typeof result.then === 'function') ? await result : result);
}
async function executeDelegatedAgentCommand(command) {
  if (window.__tzFloatMode || !window.tzDesktop) {
    return { ok: false, out: '拒绝在非主天择OS窗口执行委托命令' };
  }
  Store._cache = null;
  if (!Store.getAgentMode()) return { ok: false, out: 'AI 命令行模式已关闭，命令未执行' };
  const result = await executeAgentCommand(command);
  return {
    ok: !!(result && result.ok),
    out: String(result && result.out != null ? result.out : ''),
    data: result && result.data,
    display: result && result.display,
    meta: result && result.meta,
    warnings: result && result.warnings,
    code: result && result.code
  };
}

/* Agent 循环检测只看“是否持续重复且没有新结果”，不以调用次数或轮数作为停止条件。
 * 精确重复、交替循环、重复批次会累计停滞分；出现新命令或新结果则主动消退。
 * 因此长链路任务可以一直运行，而死循环会在模式足够明确时被掐断。 */
function createAgentLoopDetector() {
  if (window.TZCLIEngine && typeof window.TZCLIEngine.createLoopDetector === 'function') {
    return window.TZCLIEngine.createLoopDetector();
  }
  const observations = [];
  let stagnation = 0;
  const compact = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  const fingerprint = value => {
    const text = compact(value);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36) + ':' + text.length;
  };
  return {
    observe(commands, results) {
      const commandSig = (commands || []).map(compact).join('\n');
      const resultSig = (results || []).map(item => fingerprint(item && item.out)).join('|');
      const signature = fingerprint(commandSig) + '>' + resultSig;
      const previous = observations[observations.length - 1];
      const sameAsPrevious = !!previous && previous.signature === signature;
      const sameCommands = !!previous && previous.commandSig === commandSig;
      const sameResults = !!previous && previous.resultSig === resultSig;
      const twoCycle = observations.length >= 2 && observations[observations.length - 2].signature === signature;
      const seenBefore = observations.some(item => item.signature === signature);

      if (sameAsPrevious) stagnation += 4;
      else if (twoCycle) stagnation += 3;
      else if (sameCommands && sameResults) stagnation += 3;
      else if (seenBefore) stagnation += 2;
      else if (sameCommands || sameResults) stagnation += 1;
      else stagnation = Math.max(0, stagnation - 2);

      observations.push({ signature, commandSig, resultSig });
      if (observations.length > 12) observations.shift();
      const loop = stagnation >= 7;
      return {
        loop,
        reason: loop
          ? (twoCycle ? '检测到命令与结果在周期性重复，且没有产生新进展' : '检测到相同命令持续得到相同结果，且没有产生新进展')
          : ''
      };
    }
  };
}

async function runSubAgent(question, execOpts = {}) {
  if (!AI.isReady()) throw new Error('AI 未配置，请先在「AI 配置」中设置');
  const normalizedQuestion = String(question || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const trace = Array.isArray(execOpts.agentTrace) ? execOpts.agentTrace.slice() : [];
  if (trace.includes(normalizedQuestion)) {
    throw new Error('子智能体循环检测：同一问题正在调用链中重复出现，已自动掐断');
  }
  trace.push(normalizedQuestion);
  const parentSignal = execOpts.signal || null;
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort();
    else parentSignal.addEventListener('abort', forwardAbort, { once: true });
  }
  const signal = controller.signal;
  const messages = [{
    role: 'system',
    content: '你是天择OS的子智能体。独立完成用户交给你的任务，并在需要时通过 tzcli 代码块调用系统命令。' +
      '你可以调用包括 ask 和 agent 在内的全部命令；没有调用次数或轮数上限。完成后直接给出结论。\n\n' + CLI.aiPrompt()
  }, { role: 'user', content: question }];
  const workflow = [];
  const loopDetector = createAgentLoopDetector();
  const commandLoopDetector = createAgentLoopDetector();
  let finalAnswer = '';
  let loopStopped = '';
  const activityId = AgentActivity.begin('subagent', question, () => controller.abort());

  try {
  while (true) {
    if (signal && signal.aborted) throw new DOMException('已停止', 'AbortError');
    const response = await AI.chat(messages, { signal, source: 'subagent' });
    const text = response.content || '';
    const commands = parseTzcli(text);
    const step = { reasoning: response.reasoning || '', text, commands: [], usage: response.usage || null };
    workflow.push(step);
    if (!commands.length) {
      finalAnswer = stripTzcli(text) || response.reasoning || '（子智能体未返回正文）';
      break;
    }

    const receipts = [];
    let commandLoop = null;
    for (const command of commands) {
      if (signal && signal.aborted) throw new DOMException('已停止', 'AbortError');
      const resolved = await executeAgentCommand(command, { signal, agentTrace: trace, activityId });
      const item = {
        cmd: command,
        ok: !!(resolved && resolved.ok),
        out: String(resolved && resolved.out != null ? resolved.out : ''),
        data: resolved && resolved.data
      };
      step.commands.push(item);
      receipts.push('$ ' + command + '\n' + (item.out || '(完成)'));
      const commandState = commandLoopDetector.observe([command], [item]);
      if (commandState.loop) { commandLoop = commandState; break; }
    }
    if (commandLoop) {
      step.loopStopped = commandLoop.reason;
      loopStopped = commandLoop.reason;
      finalAnswer = commandLoop.reason + '。子智能体已自动掐断循环；这不是次数或轮数限制。';
      break;
    }
    const loopState = loopDetector.observe(commands, step.commands);
    if (loopState.loop) {
      step.loopStopped = loopState.reason;
      loopStopped = loopState.reason;
      finalAnswer = loopState.reason + '。子智能体已自动掐断循环；这不是次数或轮数限制。';
      break;
    }
    messages.push({ role: 'assistant', content: text });
    messages.push({ role: 'user', content: '（系统回执）命令执行结果：\n' + receipts.join('\n------\n') + '\n请继续工作；若任务已完成，请直接给出最终答案。' });
  }

    AgentActivity.finish(activityId, loopStopped ? 'stopped' : 'completed', loopStopped);
    return {
      ok: true,
      out: finalAnswer,
      data: { kind: 'agent', question, answer: finalAnswer, workflow }
    };
  } catch (error) {
    AgentActivity.finish(activityId, signal.aborted ? 'stopped' : 'failed', error && error.message);
    throw error;
  } finally {
    if (parentSignal) parentSignal.removeEventListener('abort', forwardAbort);
  }
}
async function runGeneration(userText, fixedSess, fixedChatId) {
  const sess = fixedSess || chatSess;
  const chatId = fixedChatId || (sess && sess.chatId);
  const msgs = sess ? sess.msgs : $('#chatMsgs');
  if (!msgs || !sess || !chatId) return;
  if (!Store.getChats().some(c => c.id === chatId)) return;
  // 进入生成时若已有生成残留（异常态），先 abort 并清空，防止多路并行
  if (sess.ctl) { try { sess.ctl.abort(); } catch (_) {} sess.ctl = null; sess.target = null; }
  // 当 reasoning 还没出来时，msg-bubble 不要显示独立的 typing-dots（避免和"思考过程（进行中…）"details 重复成"两个进度条"）。
  const aiMsg = appendMsg('ai', '<span class="chat-streaming-placeholder">正在等待 AI 首字…</span>', { raw: true });
  const bubble = aiMsg.querySelector('.msg-bubble');
  const bodyEl = aiMsg.querySelector('.msg-body');
  const ctl = new AbortController();
  sess.ctl = ctl;
  sess.target = { bubble, bodyEl, msgs, stopped: false };
  const sig = ctl.signal;
  updateChatSendBtn();
  ensureKatex().catch(() => {});
  const agentOn = !sess.disableAgent && Store.getAgentMode();
  const deepOn = AI.supportsThinking(AI.config()) && getDeepThinkCtx();
  const caps = effectiveAICaps();
  let usage = null, lastUsage = null, stopped = false, retryWithoutWeb = false, generationError = '', loopStopped = '';
  const activityId = agentOn ? AgentActivity.begin('chat', userText, () => ctl.abort()) : '';
  // 多轮 Agent：每轮 {reasoning, text, cmds}；命令卡片内联在所属轮次下方（agent 式交错显示）
  const doneRounds = [];
  let curRound = { reasoning: '', text: '', cmds: [] };
  let paintTimer = 0;
  let renderedDoneCount = -1;
  let renderedDoneHtml = '';
  const paint = () => {
    if (paintTimer) return;
    if (sig.aborted) return; // 已停止，不再 paint 新内容
    paintTimer = setTimeout(() => {
      paintTimer = 0;
      if (sig.aborted) return;
      // 窗口已被关闭（bubble 脱离 DOM）：不再触碰界面，只让请求跑完入库
      if (!bubble.isConnected) return;
      let body;
      if (deepOn && !doneRounds.length && !curRound.reasoning && !curRound.text) {
        body = '<span class="chat-streaming-placeholder">正在等待 AI 思考…</span>';
      } else {
        if (renderedDoneCount !== doneRounds.length) {
          renderedDoneCount = doneRounds.length;
          renderedDoneHtml = renderRoundsHtml(doneRounds, null, false);
        }
        body = renderedDoneHtml + (curRound ? renderRoundHtml(curRound, true) : '');
        if (!body && !sig.aborted) body = '<span class="chat-streaming-placeholder">正在等待 AI 首字…</span>';
      }
      bubble.innerHTML = body;
      scrollChatToBottom(msgs, sess);
    }, 72);
  };
  // 自动截图（v3.5：任何模型都能用——视觉模型直接发图，纯文本模型本地 OCR 成文字；失败则降级为纯文本）
  let shot = null;
  if (getScreenshotCtx()) {
    if (sess.siteMode) {
      shot = await SiteAI.requestScreenshot();
    } else if (Shot.supported()) {
      if (await Shot.ensure()) {
        await new Promise(r => setTimeout(r, 150));
        shot = Shot.capture();
      }
    }
    if (!shot) toast('📷 截图失败，本条按纯文本发送', 2800);
  }
  // 纯文本模型：截图本地 OCR，识别文字随消息发送（图片不上传）
  let shotOcr = '';
  if (shot && caps.image === false) {
    shotOcr = await ocrDataUrl(shot);
    if (!shotOcr) toast('📷 截图 OCR 未识别到文字，本条按纯文本发送', 2800);
    shot = null;
  }
  // 待发送附件（输入框上传/粘贴的图片与文件；v3.5：文本文件发内容、纯文本模型图片走 OCR 文字）
  const pend = (sess.pending || []).slice();
  sess.pending = [];
  renderPendingChips(sess);
  const imgParts = pend.filter(p => p.kind === 'image').map(p => ({ type: 'image_url', image_url: { url: p.dataUrl } }));
  const ocrNotes = pend.filter(p => p.kind === 'ocr' && p.status === 'done' && p.text)
    .map(p => '📷 图片「' + p.name + '」的 OCR 文字识别结果（本地识别，可能有误差）：\n' + (p.text.length > 20000 ? p.text.slice(0, 20000) + '\n…（识别内容过长已截断）' : p.text));
  if (shotOcr) ocrNotes.unshift('📷 已授权共享源截图的 OCR 文字识别结果（本地识别，可能有误差）：\n' + (shotOcr.length > 20000 ? shotOcr.slice(0, 20000) + '\n…（识别内容过长已截断）' : shotOcr));
  const fileNotes = pend.filter(p => p.kind === 'file').map(p => {
    if (p.text != null) return '📎 文件「' + p.name + '」（文本内容如下）：\n' + (p.text.length > 20000 ? p.text.slice(0, 20000) + '\n…（文件过长已截断）' : p.text);
    return '📎 附件「' + p.name + '」（' + (p.mime || '未知类型') + '，base64 数据如下）：\n' + (p.dataUrl.length > 120000 ? p.dataUrl.slice(0, 120000) + '\n…（附件过长已截断）' : p.dataUrl);
  });
  const attachNotes = [...ocrNotes, ...fileNotes];
  const webOn = !!caps.webSearch && getWebSearchCtx();
  const activeCaps = { ...caps, webSearch: webOn };
  const siteContext = sess.siteMode ? await SiteAI.promptFor(userText, chatId) : '';
  const localContext = sess.siteMode ? '' : await SiteAI.localPromptFor(userText, chatId);
  const sysContent = buildChatSysPrompt(agentOn, activeCaps, shot, siteContext, !!sess.siteMode, localContext);
  const baseHistory = Store.getChat(chatId).slice(-12).map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));
  // 最后一条用户消息注入截图与附件（图片走 image_url，文件/OCR 文字并入文本）
  // v3.5 修复：此前仅当 parts.length>1（含图片）才写回，纯 OCR/文本附件（无图）时 attachNotes 被静默丢弃
  if (baseHistory.length && baseHistory[baseHistory.length - 1].role === 'user') {
    const last = baseHistory[baseHistory.length - 1];
    const parts = [{ type: 'text', text: last.content + (attachNotes.length ? '\n\n' + attachNotes.join('\n\n') : '') }];
    if (shot) parts.push({ type: 'image_url', image_url: { url: shot } });
    imgParts.forEach(p => parts.push(p));
    if (parts.length > 1 || attachNotes.length) baseHistory[baseHistory.length - 1] = { role: 'user', content: parts };
  }
  const extra = [];
  // 联网搜索工具声明（MiMo / 博查等 OpenAI 兼容服务格式；不支持的服务端会忽略或报错降级）
  const tools = webOn ? [{ type: 'web_search', max_keyword: 3, limit: 5, user_location: { type: 'approximate', country: 'China', city: '合肥' } }] : null;
  try {
    const loopDetector = createAgentLoopDetector();
    const commandLoopDetector = createAgentLoopDetector();
    while (true) {
      const r = await AI.chatStream(
        [{ role: 'system', content: sysContent }, ...baseHistory, ...extra],
        (delta, all) => { curRound.text = all; paint(); },
        deepOn ? { onReasoning: (d, allR) => { curRound.reasoning = allR; paint(); }, signal: sig, tools, source: 'chat' } : { signal: sig, tools, source: 'chat' }
      );
      curRound.text = r.content || curRound.text;
      if (deepOn && r.reasoning) curRound.reasoning = r.reasoning;
      if (r.usage) {
        lastUsage = r.usage;
        usage = mergeUsage(usage, r.usage);
      }
      if (!agentOn) { doneRounds.push(curRound); curRound = null; break; }
      const cmds = parseTzcli(curRound.text);
      if (!cmds.length) { doneRounds.push(curRound); curRound = null; break; }
      const results = [];
      let commandLoop = null;
      for (const c of cmds) {
        if (sig.aborted) throw new DOMException('已停止', 'AbortError');
        // 独立悬浮窗通过受控 IPC 委托给主 OS 执行，主窗口则直接执行。
        const rr = await executeAgentCommand(c, { signal: sig, activityId });
        curRound.cmds.push({ cmd: c, ok: rr.ok, out: rr.out, data: rr.data, display: rr.display });
        RPG.gain('aicmd'); // v3.5 积分：AI 每执行一条命令 +1（每日上限 10）
        results.push('$ ' + c + '\n' + (rr.out || '(完成)'));
        paint();
        const commandState = commandLoopDetector.observe([c], [rr]);
        if (commandState.loop) { commandLoop = commandState; break; }
      }
      if (commandLoop) {
        loopStopped = commandLoop.reason;
        doneRounds.push(curRound);
        doneRounds.push({ reasoning: '', text: '', cmds: [{ cmd: '系统循环检测', ok: false, out: commandLoop.reason + '。已自动掐断本次 Agent 命令链；这不是次数或轮数限制。' }] });
        curRound = null;
        toast('已自动掐断无进展的 AI 命令循环', 3600);
        break;
      }
      if (cmds.length === 1) toast(agentCommandCardMeta(curRound.cmds[curRound.cmds.length - 1]).title, 2400);
      else toast('AI 完成了 ' + cmds.length + ' 项系统操作', 2400);
      extra.push({ role: 'assistant', content: curRound.text });
      const joinedResults = results.join('\n------\n');
      extra.push({ role: 'user', content: '（系统回执）你请求执行的命令行命令已完成，结果如下：\n' + joinedResults + '\n请据此继续回答用户；如无需再执行命令，请直接给出最终回答，不要重复执行同一命令。' });
      doneRounds.push(curRound);
      const loopState = loopDetector.observe(cmds, curRound.cmds.slice(-cmds.length));
      if (loopState.loop) {
        loopStopped = loopState.reason;
        doneRounds.push({
          reasoning: '',
          text: '',
          cmds: [{ cmd: '系统循环检测', ok: false, out: loopState.reason + '。已自动掐断本次 Agent 命令链；这不是次数或轮数限制。' }]
        });
        curRound = null;
        toast('已自动掐断无进展的 AI 命令循环', 3600);
        break;
      }
      curRound = { reasoning: '', text: '', cmds: [] };
    }
  } catch (e) {
    if (e && (e.name === 'AbortError' || /已停止/.test(e.message || ''))) {
      stopped = true;
      if (sess.target) sess.target.stopped = true;
    } else if (sig.aborted) {
      stopped = true;
    } else {
      generationError = String(e && e.message || e || '未知错误');
      // 联网搜索不支持时自动降级：关闭开关重试一次纯对话
      if (tools && /tool|web_search|联网|search/i.test(String(e && e.message || ''))) {
        setWebSearchCtx(false);
        retryWithoutWeb = true;
        if (bubble.isConnected) bubble.innerHTML = '<span class="chat-streaming-placeholder">当前接口未接受联网搜索，已关闭本次联网并重试…</span>';
        toast('当前接口未接受联网搜索，已关闭当前对话的联网开关并重试', 3600);
      }
      if (!retryWithoutWeb && bubble.isConnected) bubble.innerHTML = `<span class="tz-icon-label" style="color:#fca5a5">${uiIconHTML('warning')}<span>${escapeHtml(e.message)}</span></span>`;
    }
  } finally {
    if (paintTimer) { clearTimeout(paintTimer); paintTimer = 0; }
    if (sess.ctl === ctl) sess.ctl = null;
    if (sess.target && sess.target.bubble === bubble) sess.target = null;
    if (chatSess === sess) updateChatSendBtn();
    if (activityId) AgentActivity.finish(activityId,
      retryWithoutWeb ? 'retrying' : stopped || loopStopped ? 'stopped' : generationError ? 'failed' : 'completed',
      loopStopped || generationError);
  }
  if (retryWithoutWeb) {
    if (aiMsg.isConnected) aiMsg.remove();
    return runGeneration(userText, sess, chatId);
  }
  const full = doneRounds.map(r => r.text).join('\n').trim();
  const lastReasoning = doneRounds.length ? (doneRounds[doneRounds.length - 1].reasoning || '') : '';
  const hasAgentTrail = doneRounds.length > 1 || doneRounds.some(r => r.cmds && r.cmds.length);
  if (!full && !lastReasoning) {
    // 没有任何内容生成：把"等待中"占位移除，避免在错误或空响应下还显示进度文字
    if (bubble.isConnected) {
      const ph = bubble.querySelector('.chat-streaming-placeholder');
      if (ph) ph.remove();
    }
    if (sess.syncPending) {
      sess.syncPending = false;
      setTimeout(() => syncChatFromStore(false), 0);
    }
    return; // 仅错误信息
  }
  // 完成（含手动停止的部分内容）：入库（无论窗口是否还开着，回复都会被保留）
  if (!Store.getChats().some(c => c.id === chatId)) return;
  const history = Store.getChat(chatId);
  const msgAi = { role: 'ai', content: full, reasoning: lastReasoning, usage };
  if (hasAgentTrail) msgAi.rounds = doneRounds.map(r => ({ reasoning: r.reasoning || '', text: r.text || '', cmds: r.cmds || [] }));
  history.push(msgAi);
  if (!Store.setChat(history, chatId)) return;
  markChatDirty();
  if (!stopped) void maybeNameChat(chatId);
  const visibleHere = Store.getActiveChatId() === chatId && chatSess === sess && bubble.isConnected;
  if (visibleHere) {
    bubble.innerHTML = renderRoundsHtml(doneRounds, null, false) +
      (stopped ? `<div class="tz-stopped-tip tz-icon-label">${uiIconHTML('stop')}<span>已停止生成</span></div>` : '');
    if (window.renderMathInElement) { try { window.renderMathInElement(bubble, KATEX_OPTS); } catch {} }
    else renderMath(aiMsg);
    if (usage) bodyEl.appendChild(el('div', 'msg-usage', escapeHtml(usageText(usage))));
    const acts = el('div', 'msg-actions');
    const idx = history.length - 1;
    acts.innerHTML = `<button class="msg-act tz-icon-label" data-act="copy" title="复制这条内容">${uiIconHTML('copy')}<span>复制</span></button><button class="msg-act tz-icon-label" data-act="regen" title="重新生成回答（此条及后续消息将删除）">${uiIconHTML('refresh')}<span>重新生成</span></button>`;
    acts.querySelector('[data-act="copy"]').onclick = () => copyText(full);
    acts.querySelector('[data-act="regen"]').onclick = () => regenerateMessage(idx);
    bodyEl.appendChild(acts);
    scrollChatToBottom(msgs, sess);
  } else {
    // 后台标签只入库；若同一标签已重新打开，则刷新新绑定的窗口。
    if (Store.getActiveChatId() === chatId) refreshChatView();
  }
  if (Store.getActiveChatId() === chatId) updateContextBar(sess, [{ role: 'system', content: sysContent }, ...baseHistory], lastUsage);
  // v3.5：持久化本轮真实 prompt token（含当前历史长度），刷新页面后用量条不掉回低估算值
  if (lastUsage && (lastUsage.prompt_tokens || lastUsage.total_tokens)) {
    Store.setChatCtxReal({ tokens: lastUsage.prompt_tokens || lastUsage.total_tokens, len: history.length }, chatId);
  }
  if (sess.syncPending) {
    sess.syncPending = false;
    setTimeout(() => syncChatFromStore(false), 0);
  }
  if (!stopped && full && !agentOn && !sess.siteMode) Mem.autoLearn(userText, full);
}
window.TZOS.chatSuggest = function(t) { const i = $('#chatInput'); if (i) { i.value = t; sendChat(); } };
window.TZOS.openConfig = function() {
  if (window.__tzSiteEmbedMode) {
    try { window.parent.postMessage({ type: 'tz-site-open-url', url: '/os/webos.html?open=ai-config' }, '*'); }
    catch (_) { window.open('/os/webos.html?open=ai-config', '_blank', 'noopener'); }
    return;
  }
  if (window.__tzFloatMode) {
    try {
      if (window.opener && window.opener.TZOS) { window.opener.TZOS.launchApp('ai-config'); window.opener.focus(); return; }
    } catch (_) {}
    toast('请在天择OS主窗口打开「AI 配置」');
    return;
  }
  launchApp('ai-config');
};
window.TZOS.openDoubaoExternal = function() { window.open('https://www.doubao.com/chat/', '_blank'); };

/* ===================== 内置应用：软件商城 ===================== */
function renderAppStore() {
  const installed = Store.getApps();
  const deep = Store.getDeepThink();
  return `
  <div class="app-workspace app-workspace--creator app-store">
    ${appWorkspaceHeaderHTML('cart', '软件工坊', '从一句需求到可运行软件，生成、安装和维护在同一个工作区', {
      eyebrow: 'AI SOFTWARE STUDIO',
      meta: `<span class="app-badge">${installed.length} 个软件</span><span class="app-badge ${AI.isReady() ? 'is-live' : 'is-warn'}">${AI.isReady() ? 'AI 已就绪' : '等待 AI 配置'}</span>`
    })}
    <main class="app-workspace__main app-workspace__main--scroll store-workspace">
      <section class="app-section store-create">
        <header class="app-section__header">
          <span class="app-section__icon">${uiIconHTML('sparkle', '创建软件')}</span>
          <span class="app-section__heading"><strong>创建软件</strong><small>描述目标，AI 会先规划再生成完整代码</small></span>
        </header>
        <div class="app-section__body">
          <div class="app-card store-composer">
            <textarea class="textarea store-prompt" id="storePrompt" rows="3" placeholder="例如：一个带统计视图的番茄钟；一个支持 Markdown 的学习卡片工具…"></textarea>
            <div class="app-toolbar store-form">
              <button class="btn sm ${deep?'primary':'ghost'} js-deep-btn tz-icon-label" id="storeDeep" title="深度思考（用推理模型生成更严谨的代码，速度较慢）">${uiIconHTML('ai')}<span>深度思考${deep?'·开':'·关'}</span></button>
              <span class="app-toolbar__hint">生成结果会自动安装到桌面</span>
              <span class="app-toolbar__spacer"></span>
              <button class="btn primary tz-icon-label" id="storeGen" onclick="TZOS.startGen()">${uiIconHTML('sparkle')}<span>开始生成</span></button>
            </div>
          </div>
          <div class="store-step app-card" id="storeSteps" style="display:none">
            <div class="store-step-label"><span class="step-dot">1</span><span id="step1Label">智能优化提示词…</span></div>
            <div class="store-prompt-box" id="refinedBox"></div>
            <details class="msg-reasoning" id="storeReasonBox" style="display:none"><summary class="tz-icon-label">${uiIconHTML('ai')}<span>思考过程</span></summary><div id="storeReasonBody" class="store-reason-body"></div></details>
            <div class="store-step-label"><span class="step-dot">2</span><span id="step2Label">生成软件代码…</span></div>
            <div class="store-prompt-box store-code-progress" id="codeProgress"></div>
          </div>
        </div>
      </section>
      <section class="app-section store-installed">
        <header class="app-section__header">
          <span class="app-section__icon">${uiIconHTML('folder', '软件库')}</span>
          <span class="app-section__heading"><strong>软件库</strong><small>打开、改名、继续改进或卸载 AI 软件</small></span>
          <span class="app-section__actions"><button class="btn sm ghost tz-icon-label" onclick="TZOS.launchApp('file-manager')">${uiIconHTML('right')}<span>独立管理</span></button></span>
        </header>
        <div class="app-section__body">
          <div class="store-installed-list app-list" id="installedList"></div>
        </div>
      </section>
    </main>
  </div>`;
}
function initAppStore() {
  refreshInstalledList();
  $('#storePrompt').onkeydown = (e) => { if (e.key === 'Enter') window.TZOS.startGen(); };
  // 深度思考开关：与 AI 对话共用同一设置，config() 据此在 DeepSeek 下切换 reasoner/chat 模型
  const deepBtn = $('#storeDeep');
  if (deepBtn) deepBtn.onclick = () => {
    Store.setDeepThink(!Store.getDeepThink());
    const d = Store.getDeepThink();
    syncDeepBtns();
    toast('深度思考已' + (d ? '开启' : '关闭') + '（影响后续生成）');
  };
}
function refreshInstalledList() {
  const list = $('#installedList');
  if (!list) return;
  const apps = Store.getApps();
  if (!apps.length) {
    list.innerHTML = appEmptyStateHTML('folder', '软件库还是空的', '在创建区输入需求，生成完成的软件会出现在这里。');
    return;
  }
  list.innerHTML = apps.map(a => `
    <div class="store-installed-item">
      <div class="sii-icon">${appIconHTML(a)}</div>
      <div class="sii-info"><div class="sii-name">${escapeHtml(a.name)}</div><div class="sii-meta">${ago(a.createdAt)} · ${escapeHtml(a.desc||'')}</div></div>
      <button class="btn sm primary" onclick="TZOS.openInstalled('${a.id}')">打开</button>
      <button class="btn sm ghost" onclick="TZOS.renameApp('${a.id}')">重命名</button>
      <button class="btn sm ghost" onclick="TZOS.fixApp('${a.id}')">AI改进</button>
      <button class="btn sm danger" onclick="TZOS.uninstall('${a.id}')">卸载</button>
    </div>`).join('');
}
window.TZOS.startGen = async function() {
  const input = $('#storePrompt');
  const prompt = input.value.trim();
  if (!prompt) { toast('请输入软件描述'); return; }
  if (!AI.isReady()) { toast('请先配置 AI'); launchApp('ai-config'); return; }
  const genBtn = $('#storeGen');
  genBtn.disabled = true; genBtn.textContent = '生成中…';
  $('#storeSteps').style.display = 'block';
  $('#storeReasonBox').style.display = 'none';
  $('#storeReasonBody').textContent = '';
  // 显示当前生效模型与深度思考状态（深度思考开关对 DeepSeek 生效，关=deepseek-chat）
  const c0 = AI.config();
  $('#step1Label').textContent = '智能优化提示词…（模型 ' + c0.model + (Store.getDeepThink() ? '，深度思考·开' : '，深度思考·关') + '）';
  $('#refinedBox').innerHTML = '<span style="color:var(--ink-faint)">正在优化提示词…</span>';
  $('#codeProgress').textContent = '';
  // 思考过程实时显示（所有场合均展示）
  const onReasoning = (d, allR) => {
    const box = $('#storeReasonBox');
    if (box.style.display === 'none') box.style.display = '';
    const body = $('#storeReasonBody');
    body.textContent = allR;
    body.scrollTop = body.scrollHeight;
  };
  try {
    const spec = await AI.refinePrompt(prompt);
    $('#refinedBox').innerHTML = escapeHtml(spec).replace(/\|/g, '<br><span class="opt" aria-hidden="true"></span>');
    $('#step2Label').textContent = '生成软件代码…（模型 ' + AI.config().model + '）';
    $('#codeProgress').innerHTML = '<div style="color:var(--ink-faint);margin-bottom:4px">开始生成代码…</div>';
    let code = '';
    const showStream = (all, conts) => {
      const tail = all.length > 1600 ? all.slice(-1600) : all;
      $('#codeProgress').innerHTML = '<div class="tz-icon-label" style="color:var(--c-blue);margin-bottom:4px">' + uiIconHTML('terminal') + '<span>生成中… ' + all.length + ' 字符' + (conts ? '（续写第 ' + conts + ' 次）' : '') + '</span></div><pre style="white-space:pre-wrap;word-break:break-all;margin:0">' + escapeHtml(tail) + '</pre>';
      $('#codeProgress').scrollTop = $('#codeProgress').scrollHeight;
    };
    let result = await AI.generateApp(spec, prompt, (delta, all) => { code = all; showStream(all, 0); }, { onReasoning });
    if (result && result.content) code = result.content;
    // 输出被 token 上限截断 → 自动续写（最多 3 次），杜绝"写到一半停止"
    let conts = 0;
    while (result && result.finishReason === 'length' && conts < 3) {
      conts++;
      $('#step2Label').textContent = '代码过长，自动续写中…（第 ' + conts + ' 次）';
      let part = '';
      result = await AI.continueApp(code, (delta, all) => { part = all; showStream(code + all, conts); }, { onReasoning });
      code += (result && result.content) || part;
    }
    if (conts) $('#step2Label').textContent = '生成软件代码…（已自动续写 ' + conts + ' 次）';
    code = AI.cleanAppCode(code);
    if (!code.includes('<!DOCTYPE') && !code.includes('<html')) {
      throw new Error('生成的代码不完整，请重试（可在 AI 配置中调大"最大输出 Token"）');
    }
    $('#codeProgress').innerHTML = '<div class="tz-icon-label" style="color:var(--c-emerald)">' + uiIconHTML('check', '完成') + '<span>生成完成，共 ' + code.length + ' 字符</span></div>';
    const parts = spec.split('|').map(s => s.trim());
    const nameMatch = parts[0] || '新软件';
    const iconRaw = parts[1] || '';
    const iconMatch = (iconRaw && /\p{Extended_Pictographic}/u.test(iconRaw)) ? iconRaw : '📦';
    const descMatch = parts[2] || prompt;
    const appId = 'app-' + Date.now();
    Store.saveApp({
      id: appId, name: nameMatch, desc: descMatch, icon: iconMatch, iconKey: normalizeUiIconKey(iconMatch), grad: true,
      html: code, prompt, spec, createdAt: Date.now()
    });
    RPG.gain('install'); // v3.5 积分：安装 AI 软件 +15（每日上限 45）
    Desktop.render();
    StartMenu.render();
    refreshInstalledList();
    toast(nameMatch + ' 已安装到桌面');
    input.value = '';
    Mem.autoLearn('生成软件：' + prompt, nameMatch + ' - ' + descMatch);
    setTimeout(() => launchApp(appId), 400);
  } catch (e) {
    $('#codeProgress').innerHTML = '<span class="tz-icon-label" style="color:#fca5a5">' + uiIconHTML('warning', '错误') + '<span>' + escapeHtml(e.message) + '</span></span>';
    toast('生成失败：' + e.message.slice(0, 40), 4000);
  } finally {
    genBtn.disabled = false; genBtn.innerHTML = uiIconHTML('sparkle') + '<span>生成</span>'; genBtn.classList.add('tz-icon-label');
  }
};
window.TZOS.openInstalled = function(id) { launchApp(id); };
window.TZOS.uninstall = function(id) { uninstallApp(id); refreshInstalledList(); };
window.TZOS.clearChat = async function() {
  const ok = await confirmDialog({ title: '清空对话', message: '确定清空所有 AI 对话记录？', confirmText: '清空', danger: true });
  if (!ok) return;
  Store.clearAllChats();
  markChatDirty();
  refreshChatView();
  toast('已清空全部 AI 对话');
};
window.TZOS.renameApp = async function(id) {
  const app = Store.getApps().find(a => a.id === id);
  if (!app) return;
  const name = await promptDialog({ title: '重命名软件', message: '软件名称：', value: app.name || '', placeholder: '输入新名称', confirmText: '下一步' });
  if (name === null) return;
  const icon = await promptDialog({ title: '更换图标', message: '输入一个图标关键词或 emoji（将匹配 4.1 图片图集）：', value: app.iconKey || app.icon || 'crystal', placeholder: 'gamepad / notes / clock / 🎮 …', confirmText: '保存' });
  if (icon === null) return;
  const patch = {};
  const n = (name || '').trim(); if (n) patch.name = n;
  const ic = (icon || '').trim();
  if (ic) {
    patch.iconKey = normalizeUiIconKey(ic);
    if (/\p{Extended_Pictographic}/u.test(ic)) patch.icon = ic;
  }
  if (!patch.name && !patch.iconKey) { toast('未修改'); return; }
  Store.updateApp(id, patch);
  Desktop.render(); StartMenu.render(); refreshInstalledList(); refreshOpenApp('file-manager');
  WM.windows.filter(w => w.appId === id).forEach(w => {
    if (patch.iconKey) { const ti = w.el.querySelector('.win-title-icon'); if (ti) ti.innerHTML = uiIconHTML(patch.iconKey, patch.name || app.name); }
    if (patch.name) { const tt = w.el.querySelector('.win-title-text'); if (tt) tt.textContent = patch.name; }
    w.app = { ...w.app, ...patch };
  });
  toast('已更新');
};
window.TZOS.fixApp = async function(id) {
  const app = Store.getApps().find(a => a.id === id);
  if (!app) return;
  if (!AI.isReady()) { toast('请先配置 AI'); launchApp('ai-config'); return; }
  const instruction = await promptDialog({ title: 'AI 改进「' + app.name + '」', message: '描述你要修改或修复的内容：', placeholder: '例如：修复点击没反应 / 增加深色模式 / 调整布局…', confirmText: '开始改进', multiline: true });
  if (!instruction || !instruction.trim()) return;
  const mask = el('div', 'tz-dialog-mask show');
  const card = el('div', 'tz-dialog');
  card.style.width = 'min(520px,92vw)';
  card.innerHTML = '<div class="tz-dialog-title tz-icon-label">' + uiIconHTML('settings') + '<span>正在改进「' + escapeHtml(app.name) + '」</span></div><div class="tz-dialog-msg tz-icon-label" id="fixStatus" style="margin-bottom:8px">' + uiIconHTML('terminal') + '<span>AI 正在修改代码…（模型 ' + escapeHtml(AI.config().model) + '）</span></div><details class="msg-reasoning" id="fixReasonBox" style="display:none;margin-bottom:6px"><summary class="tz-icon-label" style="cursor:pointer;color:var(--ink-faint);font-size:12px">' + uiIconHTML('ai') + '<span>思考过程</span></summary><div id="fixReasonBody" style="font-size:12px;color:var(--ink-faint);line-height:1.6;padding:6px 8px;background:var(--surface);border-radius:6px;margin-top:4px;white-space:pre-wrap;max-height:140px;overflow-y:auto"></div></details><div id="fixCode" style="max-height:220px;overflow:auto;font-family:monospace;font-size:11px;white-space:pre-wrap;word-break:break-all;color:var(--ink-muted);background:var(--surface);border-radius:8px;padding:10px;margin-bottom:4px"></div>';
  mask.appendChild(card); document.body.appendChild(mask);
  const fixCode = card.querySelector('#fixCode');
  const fixStatus = card.querySelector('#fixStatus');
  const fixReasonBox = card.querySelector('#fixReasonBox');
  const fixReasonBody = card.querySelector('#fixReasonBody');
  const close = () => { mask.classList.remove('show'); setTimeout(() => mask.remove(), 200); };
  const onReasoning = (d, allR) => {
    fixReasonBox.style.display = '';
    fixReasonBody.textContent = allR;
    fixReasonBody.scrollTop = fixReasonBody.scrollHeight;
  };
  try {
    let code = '';
    const showTail = (all) => {
      const tail = all.length > 1500 ? all.slice(-1500) : all;
      fixCode.textContent = tail;
      fixCode.scrollTop = fixCode.scrollHeight;
    };
    let result = await AI.fixApp(app, instruction.trim(), (delta, all) => { code = all; showTail(all); }, { onReasoning });
    code = (result && result.content) ? result.content : code;
    // 截断自动续写（最多 2 次）
    let conts = 0;
    while (result && result.finishReason === 'length' && conts < 2) {
      conts++;
      fixStatus.innerHTML = uiIconHTML('terminal') + '<span>代码过长，自动续写中…（第 ' + conts + ' 次）</span>';
      let part = '';
      result = await AI.continueApp(code, (delta, all) => { part = all; showTail(code + all); }, { onReasoning });
      code += (result && result.content) || part;
    }
    code = AI.cleanAppCode(code);
    if (!code.includes('<!DOCTYPE') && !code.includes('<html')) throw new Error('生成失败，请重试');
    Store.updateApp(id, { html: code });
    WM.windows.filter(w => w.appId === id).forEach(w => WM.reload(w.id));
    Desktop.render(); StartMenu.render(); refreshInstalledList(); refreshOpenApp('file-manager');
    fixStatus.innerHTML = '<span class="tz-icon-label" style="color:var(--c-emerald,#10b981)">' + uiIconHTML('check', '完成') + '<span>改进完成，共 ' + code.length + ' 字符</span></span>';
    toast(app.name + ' 已更新');
    setTimeout(close, 1300);
  } catch (e) {
    fixStatus.innerHTML = '<span class="tz-icon-label" style="color:#fca5a5">' + uiIconHTML('warning', '错误') + '<span>' + escapeHtml(e.message) + '</span></span>';
    toast('改进失败：' + e.message.slice(0, 40), 4000);
    setTimeout(close, 2600);
  }
};

/* ===================== 内置应用：等级与外观（v3.5）===================== */
// 配色皮肤卡片（本应用与系统设置入口共用；点击=已解锁切换/未解锁兑换）
function skinCardsHtml() {
  const curPal = Store.getPalette();
  const level = RPG.level().lv;
  return Object.keys(RPG_SKINS).filter(id => !RPG_SKINS[id].vipTier).map(id => {
    const s = RPG_SKINS[id];
    const locked = !RPG.hasSkin(id);
    const levelReady = level >= (s.minLevel || 1);
    return `<button type="button" class="app-card skin-opt ${curPal === id ? 'active' : ''} ${locked ? 'locked' : ''}" onclick="TZOS.tryUnlockSkin('${id}')" aria-pressed="${curPal === id}" title="${locked ? (levelReady ? '点击用 ' + s.cost + ' 积分解锁' : '需要达到 Lv.' + (s.minLevel || 1)) : '点击切换为' + s.name}">
      <span class="skin-dots">${s.css.map(c => `<i style="background:${c}"></i>`).join('')}</span>
      <span class="skin-name">${s.name}</span>
      <span class="skin-sub">${s.desc}</span>
      <span class="skin-cost">${curPal === id ? '使用中' : locked ? (levelReady ? uiIconHTML('key') + ' Lv.' + (s.minLevel || 1) + ' · ' + s.cost + ' 分' : uiIconHTML('key') + ' 等级需 Lv.' + (s.minLevel || 1)) : '已解锁'}</span>
    </button>`;
  }).join('');
}
function vipCardsHtml() {
  const curPal = Store.getPalette();
  const rpg = RPG.summary();
  return VIP_PLANS.map((plan, index) => {
    const skin = RPG_SKINS[plan.skin];
    const entitled = RPG.hasVipTier(plan.id);
    const selected = curPal === plan.skin;
    const levelReady = rpg.lv >= plan.level;
    const currentRank = rpg.vip.active ? RPG.vipRank(rpg.vip.tier) : -1;
    const covered = currentRank >= index;
    const currentTier = !!rpg.vip.active && rpg.vip.tier === plan.id;
    const action = selected ? '使用中' : entitled ? '立即使用' : !levelReady ? '等级未达' : rpg.vip.active ? '升级并续期' : '积分包月';
    return `<article class="app-card vip-plan vip-plan--${plan.id} ${selected ? 'active' : ''} ${!levelReady ? 'locked' : ''}">
      <div class="vip-plan__preview" style="--vip-a:${skin.css[0]};--vip-b:${skin.css[1]};--vip-c:${skin.css[2]};--vip-preview:url('../../../assets/img/os-vip/vip-${plan.id}.webp')"><span>${uiIconHTML('crystal')}</span></div>
      <header><span><small>VIP ${String(index + 1).padStart(2, '0')}</small><strong>${escapeHtml(plan.name)}</strong></span><i class="app-badge ${covered ? 'is-live' : ''}">${covered ? '权益覆盖' : 'Lv.' + plan.level}</i></header>
      <p>${escapeHtml(skin.name + ' · ' + skin.desc)}</p>
      <div class="vip-plan__price"><strong>${plan.cost}</strong><span>积分 / 30 天</span></div>
      <div class="vip-plan__actions">
        <button type="button" class="btn sm ${entitled ? 'primary' : 'ghost'}" ${!levelReady || selected ? 'disabled' : ''} onclick="${entitled ? `TZOS.setPalette('${plan.skin}')` : `TZOS.subscribeVip('${plan.id}')`}" aria-pressed="${selected}">${escapeHtml(action)}</button>
        ${currentTier ? `<button type="button" class="btn sm ghost" onclick="TZOS.subscribeVip('${plan.id}')">续订 30 天</button>` : ''}
      </div>
    </article>`;
  }).join('');
}
function renderGrowth() {
  const rpg = RPG.summary();
  const pct = Math.min(100, Math.round(rpg.into / rpg.need * 100));
  const todayHtml = RPG_RULES.map(x => {
    const got = rpg.gain[x.id] || 0;
    const w = Math.min(100, Math.round(got / x.cap * 100));
    return `<div class="app-card growth-rule">
      <div class="gr-head"><span>${x.name}</span><span class="gr-vals">${got} / ${x.cap}（每次 +${x.pts} 分）</span></div>
      <div class="rpg-bar" style="width:100%"><i style="width:${w}%"></i></div>
    </div>`;
  }).join('');
  const titlesHtml = RPG_TITLES.map(p => `<span class="growth-title ${rpg.lv >= p[0] ? 'got' : ''}">Lv${p[0]} ${p[1]}</span>`).join('');
  return `
  <div class="app-workspace app-workspace--dashboard growth-panel">
    ${appWorkspaceHeaderHTML('trophy', '等级、VIP 与外观', '成长进度、积分皮肤与六档 VIP 专属视觉主题', {
      eyebrow: 'EVOLUTION PROFILE',
      meta: `<span class="app-badge is-live">Lv.${rpg.lv} ${escapeHtml(rpg.title)}</span><span class="app-badge">${rpg.points} 可用积分</span>`
    })}
    <main class="app-workspace__main app-workspace__main--scroll growth-main">
      <section class="app-section growth-overview">
        <div class="app-section__body">
          <div class="growth-hero app-card">
            <div class="gh-lv">Lv.${rpg.lv}</div>
            <div class="gh-main">
              <span class="app-section__kicker">CURRENT EVOLUTION</span>
              <div class="gh-title">「${rpg.title}」</div>
              <div class="gh-pts">可用 <b>${rpg.points}</b> 分 · 累计 ${rpg.total} 分</div>
              <div class="rpg-bar" style="width:100%"><i style="width:${pct}%"></i></div>
              <div class="gh-next">距 Lv.${rpg.lv + 1} 还差 ${rpg.need - rpg.into} 分</div>
            </div>
          </div>
          <div class="growth-titles">${titlesHtml}</div>
        </div>
      </section>
      ${appSectionHTML('star', '今日积分', '每日 0 点重置各项上限；等级数据会随全量存档迁移', `<div class="growth-rules">${todayHtml}</div>`, { id: 'growth-daily' })}
      ${appSectionHTML('palette', '基础完整皮肤', `默认皮肤直接可用；其他皮肤同时要求等级与积分，当前可用 ${rpg.points} 分`, `<div class="skin-pick">${skinCardsHtml()}</div>`, { id: 'growth-skins' })}
      ${appSectionHTML('crystal', 'VIP 月卡与专属皮肤', `每日最多 ${RPG_DAILY_CAP} 分，30 天理论上限 ${RPG_DAILY_CAP * 30} 分；六档价格均低于月度上限且不会自动续费，高档 VIP 可使用本档及以下全部专属皮肤`, `
        <div class="vip-current app-card ${rpg.vip.active ? 'is-active' : ''}">
          <span>${uiIconHTML('crystal')}</span>
          <span><strong>${rpg.vip.active ? escapeHtml(rpg.vip.plan.name) : '尚未开通 VIP'}</strong><small>${rpg.vip.active ? '有效至 ' + new Date(rpg.vip.expiresAt).toLocaleString('zh-CN') : '青铜从 Lv.1 开放，其余五档逐级提高等级门槛'}</small></span>
          <span class="app-badge ${rpg.vip.active ? 'is-live' : 'is-warn'}">${rpg.vip.active ? Math.max(1, Math.ceil((rpg.vip.expiresAt - Date.now()) / 86400000)) + ' 天' : '积分月卡'}</span>
        </div>
        <div class="vip-plan-grid">${vipCardsHtml()}</div>
      `, { id: 'growth-vip', className: 'growth-vip-section' })}
    </main>
  </div>`;
}

/* ===================== 内置应用：系统设置 ===================== */
function renderSettings() {
  const style = Store.getStyle();
  const theme = Store.getTheme();
  const a11y = Store.getAccessibility();
  const deviceLayout = Store.get('deviceLayout', 'auto');
  return `
  <div class="app-workspace app-workspace--settings settings-panel">
    ${appWorkspaceHeaderHTML('settings', '系统设置', '管理 Evolution Shell、AI 权限、数据和更新', {
      eyebrow: 'SYSTEM CONTROL',
      meta: `<span class="app-badge">v${OS_VERSION}</span><span class="app-badge is-live">本地优先</span>`
    })}
    <div class="app-workspace__layout">
      <nav class="app-workspace__rail app-nav" aria-label="系统设置分区">
        <a class="app-nav__item active" href="#settings-appearance">${uiIconHTML('palette')}<span>外观与桌面</span></a>
        <a class="app-nav__item" href="#settings-system">${uiIconHTML('monitor')}<span>系统与更新</span></a>
        <a class="app-nav__item" href="#settings-ai">${uiIconHTML('ai')}<span>AI 与 Agent</span></a>
        <a class="app-nav__item" href="#settings-data">${uiIconHTML('save')}<span>数据与存档</span></a>
        <a class="app-nav__item is-danger" href="#settings-danger">${uiIconHTML('warning')}<span>重置</span></a>
      </nav>
      <main class="app-workspace__main app-workspace__main--scroll settings-main">
        ${appSectionHTML('palette', '外观与桌面', '主题、桌面风格和图标布局', `
          <div class="app-setting-list">
            <div class="setting-row">
              <div><div class="sr-label">界面主题</div><div class="sr-desc">切换深色或浅色界面；当前配色不变。</div></div>
              <div class="style-pick">
                <button aria-pressed="${theme==='dark'}" class="${theme==='dark'?'active':''} tz-icon-label" onclick="TZOS.setTheme('dark')">${uiIconHTML('moon')}<span>深色</span></button>
                <button aria-pressed="${theme==='light'}" class="${theme==='light'?'active':''} tz-icon-label" onclick="TZOS.setTheme('light')">${uiIconHTML('sparkle')}<span>浅色</span></button>
              </div>
            </div>
            <div class="setting-row">
              <div><div class="sr-label">等级与外观</div><div class="sr-desc">查看成长积分并切换冷、中、暖三套生成式主题。</div></div>
              <button class="btn sm primary tz-icon-label" onclick="TZOS.launchApp('growth')">${uiIconHTML('trophy')}<span>打开</span></button>
            </div>
            <div class="setting-row">
              <div><div class="sr-label">大字模式</div><div class="sr-desc">放大正文和常用控件，不影响存档内容。</div></div>
              <div class="toggle ${a11y.largeText?'on':''}" id="a11yLargeText"></div>
            </div>
            <div class="setting-row">
              <div><div class="sr-label">高对比度</div><div class="sr-desc">加强文字、边框和焦点轮廓。</div></div>
              <div class="toggle ${a11y.highContrast?'on':''}" id="a11yHighContrast"></div>
            </div>
            <div class="setting-row">
              <div><div class="sr-label">低透明度</div><div class="sr-desc">关闭高成本玻璃模糊，提高文字可读性与移动端性能。</div></div>
              <div class="toggle ${a11y.lowTransparency?'on':''}" id="a11yLowTransparency"></div>
            </div>
            <div class="setting-row">
              <div><div class="sr-label">减少动效</div><div class="sr-desc">即使系统未开启减少动效，也可在天择OS中单独关闭。</div></div>
              <div class="toggle ${a11y.reducedMotion?'on':''}" id="a11yReducedMotion"></div>
            </div>
            <div class="setting-row">
              <div><div class="sr-label">桌面风格</div><div class="sr-desc">PC 端可切换 Windows 或 macOS 窗口风格。</div></div>
              <div class="style-pick">
                <button aria-pressed="${!style}" class="${!style?'active':''}" onclick="TZOS.setStyle('')">自动</button>
                <button aria-pressed="${style==='win'}" class="${style==='win'?'active':''}" onclick="TZOS.setStyle('win')">Windows</button>
                <button aria-pressed="${style==='mac'}" class="${style==='mac'?'active':''}" onclick="TZOS.setStyle('mac')">macOS</button>
              </div>
            </div>
            <div class="setting-row">
              <div><div class="sr-label">设备布局</div><div class="sr-desc">默认自动根据窗口和指针判断；也可手动覆盖。</div></div>
              <div class="style-pick">
                <button aria-pressed="${deviceLayout==='auto'}" class="${deviceLayout==='auto'?'active':''}" onclick="TZOS.setDeviceLayout('auto')">自动</button>
                <button aria-pressed="${deviceLayout==='mobile'}" class="${deviceLayout==='mobile'?'active':''}" onclick="TZOS.setDeviceLayout('mobile')">移动</button>
                <button aria-pressed="${deviceLayout==='desktop'}" class="${deviceLayout==='desktop'?'active':''}" onclick="TZOS.setDeviceLayout('desktop')">桌面</button>
              </div>
            </div>
            <div class="setting-row">
              <div><div class="sr-label">桌面图标布局</div><div class="sr-desc">恢复所有图标到分类默认位置。</div></div>
              <button class="btn sm ghost" onclick="TZOS.Desktop.resetLayout()">重置布局</button>
            </div>
            <div class="setting-row">
              <div><div class="sr-label">刷新桌面</div><div class="sr-desc">重新读取应用列表与图标。</div></div>
              <button class="btn sm ghost" onclick="TZOS.Desktop.render();TZOS.StartMenu.render();TZOS.toast('已刷新')">刷新</button>
            </div>
          </div>
        `, { id: 'settings-appearance' })}

        ${appSectionHTML('monitor', '系统与更新', '窗口会话、版本检查与桌面集成', `
          <div class="app-setting-list">
            <div class="setting-row">
              <div><div class="sr-label">系统版本</div><div class="sr-desc">当前 v${OS_VERSION}；启动时会自动检查更新。</div></div>
              <button class="btn sm primary tz-icon-label" id="btnCheckUpdate">${uiIconHTML('refresh')}<span>检查更新</span></button>
            </div>
            <div class="setting-row is-highlight" id="updateRow" style="display:none">
              <div><div class="sr-label">发现新版本 <span id="updateVer"></span></div><div class="sr-desc">线上已发布更新，可以立即获取。</div></div>
              <button class="btn sm primary tz-icon-label" id="btnDoUpdate">${uiIconHTML('upload')}<span>立即更新</span></button>
            </div>
            <div class="setting-row">
              <div><div class="sr-label">关闭所有窗口</div><div class="sr-desc">结束当前桌面上的应用窗口。</div></div>
              <button class="btn sm ghost" onclick="TZOS.WM.closeAll()">关闭全部</button>
            </div>
            ${window.tzDesktop ? `<div class="setting-row">
              <div><div class="sr-label">设为默认浏览器</div><div class="sr-desc">外部链接自动在天择OS 内打开，需要在 Windows 设置中确认。</div></div>
              <button class="btn sm primary" onclick="TZOS.setDefaultBrowser()">设置</button>
            </div>` : ''}
          </div>
        `, { id: 'settings-system' })}

        ${appSectionHTML('ai', 'AI 与 Agent', '控制模型可执行的桌面能力与截图上下文', `
          <div class="app-setting-list">
            <div class="setting-row">
              <div><div class="sr-label">AI 命令行模式（Agent）</div><div class="sr-desc">允许 AI 对话执行系统命令；开启时由命令行接管记忆写入，token 消耗会增加。</div></div>
              <div class="toggle ${Store.getAgentMode()?'on':''}" id="agentModeTg"></div>
            </div>
            <div class="setting-row">
              <div><div class="sr-label">发送时读取授权截图</div><div class="sr-desc">只读取你在浏览器共享选择器中明确选择的来源；视觉模型读图，纯文本模型本地 OCR。</div></div>
              <div class="toggle ${Store.getScreenshotMode()?'on':''}" id="shotModeTg"></div>
            </div>
            <div class="setting-row">
              <div><div class="sr-label">AI 接口与记忆</div><div class="sr-desc">模型地址、Key、能力、Token 价格和长期记忆集中在 AI 配置。</div></div>
              <button class="btn sm primary tz-icon-label" onclick="TZOS.launchApp('ai-config')">${uiIconHTML('key')}<span>打开配置</span></button>
            </div>
          </div>
        `, { id: 'settings-ai' })}

        ${appSectionHTML('save', '数据与存档', '本机存储统计、迁移和可恢复清理', `
          <div class="app-setting-list">
            <div class="setting-row">
              <div><div class="sr-label">存储用量</div><div class="sr-desc" id="storageInfo">计算中…</div></div>
              <span class="app-badge">LOCAL</span>
            </div>
            <div class="setting-row">
              <div><div class="sr-label">全量存档</div><div class="sr-desc">迁移系统全部数据；推荐加密导出，因为其中包含 API Key 与应用本地数据。</div></div>
              <div class="setting-actions">
                <button class="btn sm primary tz-icon-label" onclick="TZOS.exportArchive()">${uiIconHTML('shield')}<span>加密导出</span></button>
                <button class="btn sm ghost tz-icon-label" onclick="TZOS.exportArchive({plain:true})">${uiIconHTML('file')}<span>明文导出</span></button>
                <button class="btn sm ghost tz-icon-label" onclick="document.getElementById('archiveInput').click()">${uiIconHTML('download')}<span>导入</span></button>
                <input type="file" id="archiveInput" accept="application/json,.json,.tzarchive" style="display:none" onchange="TZOS.importArchive(this)">
              </div>
            </div>
            <div class="setting-row">
              <div><div class="sr-label">清空对话历史</div><div class="sr-desc">删除 AI 对话记录，不影响模型配置与记忆。</div></div>
              <button class="btn sm ghost" onclick="TZOS.clearChat()">清空对话</button>
            </div>
            <div class="setting-row">
              <div><div class="sr-label">清空通知</div><div class="sr-desc">移除通知中心的历史项目。</div></div>
              <button class="btn sm ghost" onclick="TZOS.Store.clearNotifs();TZOS.toast('已清空')">清空通知</button>
            </div>
          </div>
        `, { id: 'settings-data' })}

        ${appSectionHTML('warning', '重置系统', '不可恢复的本地清理操作', `
          <div class="app-card app-card--danger setting-danger">
            <span><strong>清除所有本地数据并重启天择OS</strong><small>建议先导出全量存档。此操作会删除设置、软件、对话、布局与应用数据。</small></span>
            <button class="btn sm danger tz-icon-label" onclick="TZOS.reset()">${uiIconHTML('trash')}<span>重置天择OS</span></button>
          </div>
        `, { id: 'settings-danger', className: 'app-section--danger' })}
      </main>
    </div>
  </div>`;
}
function formatStorageBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return value + ' B';
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB';
  if (value < 1024 * 1024 * 1024) return (value / 1024 / 1024).toFixed(1) + ' MB';
  return (value / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}
async function updateStorageInfo(node) {
  if (!node) return;
  let localBytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i) || '';
    const value = localStorage.getItem(key) || '';
    localBytes += (key.length + value.length) * 2;
  }
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      if (!node.isConnected) return;
      const quota = Number(estimate.quota) || 0;
      node.textContent = `${formatStorageBytes(estimate.usage || localBytes)}${quota ? ' / ' + formatStorageBytes(quota) : ''}（浏览器估算，包含 localStorage、IndexedDB 与缓存；${Store.getApps().length} 个已装软件）`;
      return;
    }
    const databases = await dumpIndexedDBs();
    const idbBytes = new Blob([JSON.stringify(databases)]).size;
    if (node.isConnected) node.textContent = `${formatStorageBytes(localBytes + idbBytes)}（localStorage + IndexedDB 近似值；${Store.getApps().length} 个已装软件）`;
  } catch (error) {
    if (node.isConnected) node.textContent = `${formatStorageBytes(localBytes)}（仅 localStorage；当前浏览器无法统计 IndexedDB）`;
  }
}
function initSettings() {
  initAppWorkspaceNav('.settings-panel');
  const si = $('#storageInfo');
  if (si) updateStorageInfo(si);
  const chk = $('#btnCheckUpdate');
  if (chk) chk.onclick = () => Updater.check(true);
  const doUp = $('#btnDoUpdate');
  if (doUp) doUp.onclick = () => Updater.apply();
  const bindA11y = (id, key, label) => {
    const node = $('#' + id);
    if (!node) return;
    bindSwitch(node, () => Store.getAccessibility()[key], (next) => {
      Store.setAccessibility({ [key]: next });
      applyAccessibility();
      toast(label + '已' + (next ? '开启' : '关闭'));
    }, label);
  };
  bindA11y('a11yLargeText', 'largeText', '大字模式');
  bindA11y('a11yHighContrast', 'highContrast', '高对比度');
  bindA11y('a11yLowTransparency', 'lowTransparency', '低透明度');
  bindA11y('a11yReducedMotion', 'reducedMotion', '减少动效');
  // AI 命令行模式（Agent）开关
  const ag = $('#agentModeTg');
  if (ag) bindSwitch(ag, () => Store.getAgentMode(), (next) => {
    Store.setAgentMode(next);
    toast('AI 命令行模式已' + (next ? '开启（自动写入记忆已交给命令行）' : '关闭'), 3200);
    refreshOpenApp('ai-config');
    refreshChatView();
  }, 'AI 命令行模式');
  // 自动截图开关（首次开启需授权屏幕共享）
  const st = $('#shotModeTg');
  if (st) bindSwitch(st, () => Store.getScreenshotMode(), async (next) => {
    if (next) {
      if (!Shot.supported()) { toast('当前环境不支持屏幕截取'); return; }
      toast('请在弹窗中选择「此标签页」共享天择OS画面', 3600);
      if (!(await Shot.ensure())) { toast('未获得屏幕共享授权，功能未开启', 3000); return; }
    } else {
      Shot.stop();
    }
    Store.setScreenshotMode(next);
    refreshChatView();
    toast('自动截图已' + (next ? '开启（' + (effectiveAICaps().image !== false ? '截图随消息直接发送' : '纯文本模型：截图将 OCR 识别为文字') + '）' : '关闭'));
  }, '发送时自动截图');
  // 已有待更新信息时直接显示
  const pending = Store.get('updateAvailable', null);
  if (pending && compareVersions(pending, OS_VERSION) > 0) showUpdateRow(pending);
}
function showUpdateRow(ver) {
  const row = $('#updateRow');
  if (row) { row.style.display = ''; const v = $('#updateVer'); if (v) v.textContent = 'v' + ver; }
}
window.TZOS.setTheme = function(t) {
  Store.setTheme(t);
  applyTheme();
  refreshOpenApp('settings');
  toast('已切换为' + (t === 'light' ? '浅色' : '深色') + '主题');
};
// 主题应用：body.tzos 挂 light 类
function applyTheme() {
  const isLight = Store.getTheme() === 'light';
  document.body.classList.toggle('light', isLight);
  const themeButton = $('#btnTheme');
  if (themeButton) {
    themeButton.setAttribute('aria-pressed', String(isLight));
    themeButton.setAttribute('aria-label', isLight ? '切换为深色主题' : '切换为浅色主题');
  }
  applyPalette(); // v3.5：配色皮肤（冷/中/暖）随主题一起应用
  applyAccessibility();
}
function applyAccessibility() {
  const options = Store.getAccessibility();
  document.body.classList.toggle('a11y-large-text', options.largeText);
  document.body.classList.toggle('a11y-high-contrast', options.highContrast);
  document.body.classList.toggle('a11y-low-transparency', options.lowTransparency);
  document.body.classList.toggle('a11y-reduced-motion', options.reducedMotion);
}
window.TZOS.setDeviceLayout = function(layout) {
  Store.set('deviceLayout', ['mobile', 'desktop'].includes(layout) ? layout : 'auto');
  applyDeviceStyle();
  WM.reflowAll();
  Desktop.render();
  refreshOpenApp('settings');
  toast('已切换设备布局');
};

/* ===================== 在线更新检查 ===================== */
const Updater = {
  url() {
    // 桌面版拉线上；网页版取同源 version.json
    return window.tzDesktop ? 'https://wjtianze.github.io/os/version.json' : 'version.json';
  },
  async check(manual) {
    try {
      const r = await fetch(this.url() + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      const remote = String(d.version || '').trim();
      if (!remote) throw new Error('版本文件格式异常');
      if (compareVersions(remote, OS_VERSION) > 0) {
        Store.set('updateAvailable', remote);
        showUpdateRow(remote);
        Store.addNotif({ title: '天择OS 有新版本 v' + remote, body: '当前 v' + OS_VERSION + '。前往「系统设置 → 系统版本」点击「立即更新」。', iconKey: 'refresh' });
        if (manual) toast('发现新版本 v' + remote + '，点击「立即更新」获取', 3600);
      } else {
        Store.set('updateAvailable', null);
        if (manual) toast('✓ 已是最新版本（v' + OS_VERSION + '）');
      }
      return remote;
    } catch (e) {
      if (manual) toast('检查更新失败：' + (e.message || e).toString().slice(0, 50), 3600);
      return null;
    }
  },
  apply() {
    if (window.tzDesktop) {
      // 桌面版：打开下载页获取最新安装包
      try { window.tzDesktop.openExternal ? window.tzDesktop.openExternal('https://wjtianze.github.io/os/') : window.open('https://wjtianze.github.io/os/', '_blank'); } catch (e) { window.open('https://wjtianze.github.io/os/', '_blank'); }
      return;
    }
    // 网页版：绕过缓存强制刷新获取最新文件
    try { location.reload(true); } catch (e) { location.reload(); }
  }
};
// 语义化版本比较：a>b 返回 1，a<b 返回 -1，相等 0
function compareVersions(a, b) {
  const pa = String(a).split('.').map(x => parseInt(x, 10) || 0);
  const pb = String(b).split('.').map(x => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}
window.TZOS.setStyle = function(s) {
  Store.setStyle(s);
  applyDeviceStyle();
  Desktop.render();
  refreshOpenApp('settings');
  toast('风格已切换为 ' + (s === 'mac' ? 'macOS' : s === 'win' ? 'Windows' : '自动'));
};
window.TZOS.reset = async function() {
  const ok1 = await confirmDialog({ title: '重置天择OS', message: '⚠️ 这将清除本机所有天择网/OS 数据（已安装软件、AI配置、对话历史、图标布局、各应用数据），确定继续吗？', confirmText: '继续', danger: true });
  if (!ok1) return;
  const ok2 = await confirmDialog({ title: '再次确认', message: '此操作不可恢复！', confirmText: '确认重置', danger: true });
  if (!ok2) return;
  try {
    const names = await listIndexedDBNames();
    for (const name of names) await deleteDatabaseSafe(name);
  } catch (error) {
    toast('重置未完成：' + (error.message || error), 5000);
    return;
  }
  try { localStorage.clear(); } catch (error) {
    toast('重置未完成：本地设置无法清除', 4000);
    return;
  }
  location.reload();
};
// 桌面版：设为系统默认浏览器（注册协议处理器 + 引导用户在系统设置确认）
window.TZOS.setDefaultBrowser = function() {
  if (!window.tzDesktop) { toast('仅桌面版支持此功能'); return; }
  toast('正在注册…', 1500);
  try { window.tzDesktop.setAsDefaultBrowser(function (r) { toast((r && r.msg) || (r && r.ok ? '已设置' : '设置失败'), 6000); }); }
  catch (e) { toast('设置失败', 3000); }
};
// ===== 全量存档：localStorage 全量 + IndexedDB 全库（含 AI 配置、系统设置、软件数据等一切本机数据） =====
async function dumpAllLocalStorage() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    out[k] = localStorage.getItem(k);
  }
  return out;
}
const KNOWN_INDEXED_DB_NAMES = ['tznotes', 'tzwords'];
async function listIndexedDBNames() {
  if (!('indexedDB' in window)) return [];
  if (!indexedDB.databases) return KNOWN_INDEXED_DB_NAMES.slice();
  try {
    const dbs = await indexedDB.databases();
    return [...new Set(dbs.map(item => item && item.name).filter(Boolean))];
  } catch (error) {
    return KNOWN_INDEXED_DB_NAMES.slice();
  }
}
function deleteDatabaseSafe(name) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const request = indexedDB.deleteDatabase(name);
    const timer = setTimeout(() => finish(new Error(`IndexedDB「${name}」删除超时，可能仍被其他页面占用`)), 5000);
    request.onsuccess = () => finish();
    request.onerror = () => finish(request.error || new Error(`IndexedDB「${name}」删除失败`));
    request.onblocked = () => finish(new Error(`IndexedDB「${name}」正被其他页面占用，请关闭相关天择网页面后重试`));
  });
}
async function dumpIndexedDBs() {
  const out = {};
  if (!('indexedDB' in window)) return out;
  const names = await listIndexedDBNames();
  for (const name of names) {
    try {
      out[name] = await new Promise((resolve) => {
        const req = indexedDB.open(name);
        req.onsuccess = () => {
          const db = req.result;
          const storeNames = [...db.objectStoreNames];
          const result = { version: db.version, stores: {} };
          if (!storeNames.length) { db.close(); resolve(result); return; }
          const tx = db.transaction(storeNames, 'readonly');
          storeNames.forEach(sn => {
            const rq = tx.objectStore(sn).getAll();
            rq.onsuccess = () => { result.stores[sn] = rq.result; };
            rq.onerror = () => { result.stores[sn] = []; };
          });
          tx.oncomplete = () => { db.close(); resolve(result); };
          tx.onerror = tx.onabort = () => { db.close(); resolve(null); };
        };
        req.onblocked = () => resolve(null);
        req.onerror = () => resolve(null);
      });
      if (!out[name]) delete out[name];
    } catch (e) {}
  }
  return out;
}
async function restoreIndexedDBs(data) {
  if (!data || typeof data !== 'object') return;
  for (const name of Object.keys(data)) {
    const dump = data[name];
    if (!dump || !dump.stores) continue;
    // 先删旧库再按存档结构重建；blocked/error 都必须向调用者报告，不能假装成功。
    await deleteDatabaseSafe(name);
    await new Promise((resolve, reject) => {
      const req = indexedDB.open(name, dump.version || 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        Object.keys(dump.stores).forEach(sn => {
          if (!db.objectStoreNames.contains(sn)) db.createObjectStore(sn, { keyPath: 'k' });
        });
      };
      req.onblocked = () => reject(new Error(`IndexedDB「${name}」恢复被阻止，请关闭相关页面后重试`));
      req.onsuccess = () => {
        const db = req.result;
        const stores = Object.keys(dump.stores).filter(sn => [...db.objectStoreNames].includes(sn));
        if (!stores.length) { db.close(); resolve(); return; }
        const tx = db.transaction(stores, 'readwrite');
        stores.forEach(sn => {
          const st = tx.objectStore(sn);
          (dump.stores[sn] || []).forEach(rec => st.put(rec));
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = tx.onabort = () => {
          const error = tx.error || new Error(`IndexedDB「${name}」写入失败`);
          db.close();
          reject(error);
        };
      };
      req.onerror = () => reject(req.error || new Error(`IndexedDB「${name}」打开失败`));
    });
  }
}
function archiveBytesToBase64(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}
function archiveBase64ToBytes(value) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function encryptArchiveData(data, password) {
  if (!window.crypto || !window.crypto.subtle) throw new Error('当前环境不支持 Web Crypto 加密');
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const base = await window.crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await window.crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const cipher = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
  return {
    __archive: 'tianze-os-encrypted', version: 3, exportedAt: data.exportedAt, osVersion: data.osVersion,
    crypto: { algorithm: 'AES-GCM', kdf: 'PBKDF2-SHA256', iterations: 210000, salt: archiveBytesToBase64(salt), iv: archiveBytesToBase64(iv) },
    payload: archiveBytesToBase64(cipher)
  };
}
async function decryptArchiveData(wrapper, password) {
  if (!window.crypto || !window.crypto.subtle) throw new Error('当前环境不支持 Web Crypto 解密');
  const meta = wrapper && wrapper.crypto || {};
  if (meta.algorithm !== 'AES-GCM' || meta.kdf !== 'PBKDF2-SHA256' || !wrapper.payload) throw new Error('加密存档格式不受支持');
  const iterations = Number(meta.iterations) || 0;
  if (iterations < 100000 || iterations > 1000000) throw new Error('加密存档的密钥参数异常');
  try {
    const base = await window.crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await window.crypto.subtle.deriveKey({ name: 'PBKDF2', salt: archiveBase64ToBytes(meta.salt), iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const plain = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: archiveBase64ToBytes(meta.iv) }, key, archiveBase64ToBytes(wrapper.payload));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch (error) {
    throw new Error('密码错误，或加密存档已经损坏');
  }
}
function downloadArchivePayload(payload, filename) {
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
// 存档导出：默认使用密码 + PBKDF2 + AES-GCM；只有显式选择时才生成含 Key 的明文 JSON。
window.TZOS.exportArchive = async function(options = {}) {
  try {
    const plain = !!(options && options.plain);
    let password = '';
    if (plain) {
      const ok = await confirmDialog({ title: '导出明文存档', message: '明文存档包含 API Key、应用本地数据与对话。任何拿到文件的人都可以读取，确定继续吗？', confirmText: '仍要明文导出', danger: true });
      if (!ok) return;
    } else {
      password = await promptDialog({ title: '设置存档密码', message: '密码仅用于本次加密，不会被天择OS保存。至少 8 个字符；丢失后无法恢复存档。', placeholder: '输入存档密码', confirmText: '下一步', inputType: 'password' });
      if (password == null) return;
      if (String(password).length < 8) { toast('存档密码至少需要 8 个字符'); return; }
      const confirmPassword = await promptDialog({ title: '确认存档密码', message: '请再次输入同一个密码。', placeholder: '再次输入密码', confirmText: '加密导出', inputType: 'password' });
      if (confirmPassword == null) return;
      if (password !== confirmPassword) { toast('两次输入的密码不一致'); return; }
    }
    toast('正在打包全部数据…', 1500);
    const ls = await dumpAllLocalStorage();
    const idb = await dumpIndexedDBs();
    const data = {
      __archive: 'tianze-os', version: 2, exportedAt: new Date().toISOString(),
      osVersion: OS_VERSION,
      localStorage: ls,
      indexedDB: idb,
      // 向后兼容：保留 state 字段（老版本导入逻辑可读）
      state: (() => { try { return JSON.parse(ls[Store.KEY] || '{}'); } catch (e) { return {}; } })()
    };
    const date = new Date().toISOString().slice(0, 10);
    if (plain) downloadArchivePayload(data, 'tianze-os-archive-' + date + '.json');
    else downloadArchivePayload(await encryptArchiveData(data, password), 'tianze-os-archive-' + date + '.tzarchive');
    toast((plain ? '明文' : '加密') + '存档已导出（localStorage ' + Object.keys(ls).length + ' 项 + IndexedDB ' + Object.keys(idb).length + ' 库）', 3600);
    RPG.gain('export'); // v3.5 积分：导出存档 +5（每日上限 5）
  } catch (e) { toast('导出失败：' + (e.message || e), 4000); }
};
// 存档导入：全量覆盖本机数据后重载（兼容 v1 老存档）
window.TZOS.importArchive = async function(input) {
  const file = input && input.files && input.files[0];
  try { input.value = ''; } catch (_) {}
  if (!file) return;
  try {
    const text = await file.text();
    let data = JSON.parse(text);
    if (data && data.__archive === 'tianze-os-encrypted') {
      const password = await promptDialog({ title: '解密天择OS存档', message: '请输入导出这个存档时设置的密码。', placeholder: '存档密码', confirmText: '解密', inputType: 'password' });
      if (password == null) return;
      data = await decryptArchiveData(data, password);
    }
    if (!data || data.__archive !== 'tianze-os') throw new Error('存档格式不正确');
    const isV2 = data.version >= 2 && data.localStorage && typeof data.localStorage === 'object';
    if (!isV2 && (!data.state || typeof data.state !== 'object')) throw new Error('存档格式不正确');
    const ok = await confirmDialog({ title: '导入存档', message: '将用存档内容【完全覆盖】本机当前所有数据（AI 配置、系统设置、已装软件、对话历史、各应用数据等），并重新加载。确定继续吗？', confirmText: '导入并覆盖', danger: true });
    if (!ok) return;
    if (isV2) {
      await restoreIndexedDBs(data.indexedDB);
      localStorage.clear();
      Object.keys(data.localStorage).forEach(k => {
        try { localStorage.setItem(k, data.localStorage[k]); } catch (e) {}
      });
    } else {
      // v1 老存档：仅恢复天择OS 主状态
      Store.save(data.state);
    }
    toast('存档已导入，正在重载…', 2000);
    setTimeout(() => location.reload(), 800);
  } catch (e) { toast('导入失败：' + (e.message || e), 4000); }
};

/* ===================== 内置应用：关于 ===================== */
function renderAbout() {
  return `
  <div class="app-workspace app-workspace--about about-v4">
    ${appWorkspaceHeaderHTML('crystal', '关于天择OS', '面向天择网服务与本地 AI 工作流的 Evolution Shell', {
      eyebrow: 'SYSTEM IDENTITY',
      meta: `<span class="app-badge is-live">v${OS_VERSION}</span><span class="app-badge">2026-08-01</span>`,
      actions: `<button class="btn sm ghost tz-icon-label" onclick="TZOS.checkUpdate()">${uiIconHTML('refresh')}<span>检查更新</span></button>`
    })}
    <main class="app-workspace__main app-workspace__main--scroll about-main">
      <section class="app-card about-hero">
        <span class="about-mark">${uiIconHTML('crystal', '天择OS')}</span>
        <span class="about-copy">
          <span class="app-workspace__eyebrow">EVOLUTION SHELL</span>
          <strong>一个窗口化、可扩展、由本地数据驱动的网页操作系统</strong>
          <small>天择网服务、AI 对话、软件生成、Agent 命令与个人数据在统一桌面中协作。</small>
          <span id="aboutUpdate" class="about-update"></span>
        </span>
      </section>
      ${appSectionHTML('sparkle', '核心能力矩阵', '应用、AI、系统壳与三套视觉材质已经进入同一个工作空间', `
        <div class="about-capabilities">
          <div class="app-card about-cap">${uiIconHTML('globe')}<span><strong>天择网应用</strong><small>站点功能预装为窗口应用</small></span></div>
          <div class="app-card about-cap">${uiIconHTML('ai')}<span><strong>AI 引擎</strong><small>对话、推理、附件与记忆</small></span></div>
          <div class="app-card about-cap">${uiIconHTML('cart')}<span><strong>软件工坊</strong><small>自然语言生成并维护软件</small></span></div>
          <div class="app-card about-cap">${uiIconHTML('monitor')}<span><strong>Evolution Shell</strong><small>态势线、系统轨道与窗口管理</small></span></div>
          <div class="app-card about-cap">${uiIconHTML('palette')}<span><strong>三套生成视觉</strong><small>冷、中、暖配色图片材质</small></span></div>
          <div class="app-card about-cap">${uiIconHTML('terminal')}<span><strong>桌面 Agent</strong><small>主窗口与外部浮窗安全执行命令</small></span></div>
        </div>
      `)}
      ${appSectionHTML('shield', '数据边界', '你的工作空间以本地存储为主', `
        <div class="app-card app-card--horizontal about-privacy">
          <span class="app-card__icon">${uiIconHTML('save')}</span>
          <span><strong>数据保存在当前设备</strong><small>设置、软件、对话和布局不会上传到天择网；可以在系统设置中导出全量存档。</small></span>
          <button class="btn sm ghost tz-icon-label" onclick="TZOS.launchApp('settings')">${uiIconHTML('settings')}<span>数据设置</span></button>
        </div>
      `)}
      <footer class="app-workspace__footer">
        <button class="btn primary tz-icon-label" onclick="TZOS.goHome()">${uiIconHTML('globe')}<span>打开天择网</span></button>
        <span>wjtianze.github.io/os · v${OS_VERSION}</span>
      </footer>
    </main>
  </div>`;
}

/* ===================== 内置应用：我的软件 ===================== */
function renderFileManager() {
  const apps = Store.getApps();
  return `
  <div class="app-workspace app-workspace--library file-manager">
    ${appWorkspaceHeaderHTML('folder', '我的软件', '管理由 AI 生成并安装到桌面的应用', {
      eyebrow: 'LOCAL SOFTWARE LIBRARY',
      meta: `<span class="app-badge">${apps.length} 个软件</span>`,
      actions: `<button class="btn sm primary tz-icon-label" onclick="TZOS.launchApp('app-store')">${uiIconHTML('sparkle')}<span>创建软件</span></button>`
    })}
    <main class="app-workspace__main app-workspace__main--scroll file-manager-main">
      ${apps.length === 0
        ? appEmptyStateHTML('folder', '还没有安装软件', '去软件工坊描述一个需求，生成结果会自动加入这里。', `<button class="btn primary tz-icon-label" onclick="TZOS.launchApp('app-store')">${uiIconHTML('cart')}<span>打开软件工坊</span></button>`)
        : `<section class="app-section">
            <header class="app-section__header">
              <span class="app-section__icon">${uiIconHTML('file')}</span>
              <span class="app-section__heading"><strong>本地软件库</strong><small>软件数据和代码保存在当前设备</small></span>
            </header>
            <div class="app-section__body app-list">
              ${apps.map(a => `
                <div class="store-installed-item app-card">
                  <div class="sii-icon">${appIconHTML(a)}</div>
                  <div class="sii-info">
                    <div class="sii-name">${escapeHtml(a.name)}</div>
                    <div class="sii-meta">${ago(a.createdAt)} · ${escapeHtml(a.desc || 'AI 生成软件')}</div>
                  </div>
                  <button class="btn sm primary" onclick="TZOS.launchApp('${a.id}')">打开</button>
                  <button class="btn sm ghost" onclick="TZOS.renameApp('${a.id}');TZOS.refreshOpenApp('file-manager')">重命名</button>
                  <button class="btn sm ghost" onclick="TZOS.fixApp('${a.id}')">AI 改进</button>
                  <button class="btn sm danger" onclick="TZOS.uninstallApp('${a.id}');TZOS.refreshOpenApp('file-manager')">卸载</button>
                </div>`).join('')}
            </div>
          </section>`}
    </main>
  </div>`;
}

/* ===================== 内置应用：玩机技巧 ===================== */
const TIPS_DATA = [
  { cat: '基础操作', title: '打开与关闭应用', body: '单击桌面图标即可打开应用；窗口右上角红/黄/绿圆点分别是关闭/最小化/最大化。双击标题栏可快速最大化/还原。' },
  { cat: '基础操作', title: '自由摆放桌面图标', body: '按住任一桌面图标拖动，可摆到任意位置，松开后位置自动保存；刷新或重启后布局保留。右键图标可「重置此图标位置」。' },
  { cat: '基础操作', title: '重置全部图标布局', body: '右键桌面空白处 → 「重置图标布局」，或进系统设置点「重置布局」，所有图标回到分类默认位置。' },
  { cat: '窗口与任务栏', title: '窗口刷新', body: '天择网系列应用与 AI 生成软件的窗口标题栏多了一颗蓝色圆点（刷新按钮），点击即恢复到初始状态，等同退出重开。' },
  { cat: '窗口与任务栏', title: '固定应用到任务栏', body: '右键任务栏上的应用图标 → 「固定到任务栏」，该应用会常驻任务栏（半透明显示），即使没运行也在，点击即启动。' },
  { cat: '窗口与任务栏', title: '最大化不遮挡任务栏', body: '点最大化后窗口会自动避开底部任务栏，底部紧贴任务栏上方，不会被遮挡。再点一次还原。' },
  { cat: '快捷键', title: 'Ctrl+Q 全屏', body: '按 Ctrl+Q 进入浏览器全屏沉浸模式，再按一次退出（覆盖浏览器默认快捷键）。在天择网应用窗口内点按时同样生效。' },
  { cat: '窗口与任务栏', title: '显示桌面', body: 'Windows 风格下，点击任务栏最右端的细条可一键最小化所有窗口，再点一次全部复原。' },
  { cat: '窗口与任务栏', title: '点击网页即聚焦', body: '点击应用内的网页区域即视为点击了该应用：窗口自动置顶，快捷键（如 Ctrl+Q）恢复生效。' },
  { cat: '桌面风格', title: '浅色 / 深色主题', body: '任务栏右侧 🌓 按钮或「系统设置 → 界面主题」可切换浅色/深色主题，全系统即时生效。' },
  { cat: 'AI 对话', title: 'AI 记忆', body: '「AI 配置 → AI 记忆」可查看/增删改 AI 对你的记忆。开启"自动写入"后 AI 会在回答后自动积累记忆；每条记忆可单独勾选是否注入提示词。' },
  { cat: 'AI 对话', title: '停止 / 重新生成 / 编辑重发', body: '生成中点 ⏹ 可停止；AI 消息下的「⟳ 重新生成」与你消息下的「✏️ 编辑重发」可重来——注意：重新生成/编辑重发后，该消息之后的所有消息都会被删除。每条 AI 消息下方还会显示本次消耗的 token 明细。' },
  { cat: '软件商城', title: '更稳的代码生成', body: '生成软件时若输出达到 token 上限会自动续写（最多 3 次）；可在「AI 配置」调大"最大输出 Token"。提示词已内置 KaTeX 公式、Markdown、本地存储教程与你的 AI 配置，需要 AI 功能的软件会自动带上。' },
  { cat: '浏览器', title: '收藏夹书签', body: '点导航栏 ☆ 收藏当前页；📑 打开收藏夹，支持导入/导出书签文件（兼容 Chrome/Edge/Firefox 的 Netscape 书签格式）。' },
  { cat: '浏览器', title: '标签页栏在标题栏里', body: '浏览器的标签页已并入窗口标题栏，标签显示网页自带的标题（取不到时显示域名）。' },
  { cat: '模拟器', title: 'Windows / 安卓模拟器', body: '桌面「模拟器」分类内置三款现代系统的网页模拟器：Windows 11 高仿真版（Win11React）、Windows 10 风格功能桌面（daedalOS）、现代安卓仿真环境（MobileGym，28 个应用）。均为浏览器内的界面级模拟，非真实虚拟机。' },
  { cat: '命令行', title: '命令行终端', body: '打开「⌨️ 命令行」应用，输入 help 查看全部命令教程：开关应用、安装/卸载/改写软件、修改 AI 配置与 token 单价、写入/删除记忆、切换主题风格、管理收藏夹等，系统里能做的几乎都能用命令完成。' },
  { cat: '命令行', title: 'AI 命令行模式（Agent）', body: '系统设置开启「AI 命令行模式」后，AI 在对话中可直接输出命令操作系统（比如帮你改软件、记偏好、调配置），命令执行结果会自动回传给 AI 继续处理，最多连续 3 轮。该模式会消耗大量 token；开启期间「生成后自动写入记忆」自动关闭，由 AI 通过 mem 命令自行写记忆。' },
  { cat: 'AI 对话', title: '复制消息', body: '鼠标悬停任意一条消息，点「📋 复制」即可复制该条内容（AI 的回答复制的是 markdown 原文）。' },
  { cat: 'AI 对话', title: 'Token 费用统计', body: '在「AI 配置 → Token 单价」填入缓存命中/缓存写入/输入/输出四类单价（支持人民币或美元），每条 AI 消息下方的用量统计会自动估算本次费用。' },
  { cat: 'AI 对话', title: '授权截图', body: '对话工具栏「截图」或系统设置开启后，浏览器会先让你明确选择共享的标签页、窗口或屏幕。视觉模型直接读图；纯文本模型只接收天择OS在本地 OCR 得到的文字。停止共享后开关会自动关闭。' },
  { cat: '浏览器', title: '中键关闭标签页', body: '在标签页上按下鼠标中键（滚轮）可直接关闭该标签，与桌面浏览器习惯一致。' },
  { cat: '窗口与任务栏', title: '快捷面板与悬浮球', body: '关闭快捷面板会收起为小悬浮球，二者位置始终一致；拖动任意一个，切换形态后位置不变。' },
  { cat: '数据与安全', title: '全量存档', body: '系统设置 → 存档管理可导出/导入本机全部数据：AI 配置、系统设置、已装软件、对话历史、收藏夹、AI 记忆、背单词等天择网各应用数据（含 IndexedDB）。' },
  { cat: '快捷键', title: 'Ctrl+空格 开始菜单', body: '按 Ctrl+空格 快速打开/关闭开始菜单（应用列表）。' },
  { cat: '快捷键', title: 'Esc 关闭菜单', body: '开始菜单、右键菜单、通知中心打开时，按 Esc 即可关闭。' },
  { cat: 'AI 对话', title: '深度思考', body: 'AI 对话默认开启「🧠 深度思考」，会先展示思考过程（可折叠），再给正式回答。点工具栏按钮可开关。' },
  { cat: 'AI 对话', title: '单一对话工作区', body: 'AI 对话使用单一工作区；重复打开会自动聚焦已有窗口，确保历史、附件与生成状态始终一致。' },
  { cat: 'AI 对话', title: 'LaTeX 公式', body: 'AI 回答中的数学公式会自动渲染。行内用 $...$，块级用 $$...$$。例如 $E=mc^2$。' },
  { cat: 'AI 对话', title: '切换 AI 提供方', body: '对话工具栏「⚙️自定义AI / 🫘豆包AI」一键切换。自定义走你配置的 OpenAI 兼容接口；豆包为网页嵌入。' },
  { cat: '软件商城', title: '一句话生成软件', body: '在软件商城输入需求，AI 会先优化提示词，再实时流式生成代码（可看到代码逐行写出），完成后自动安装到桌面并打开。' },
  { cat: '软件商城', title: '管理已安装软件', body: '「📁我的软件」或软件商城底部可查看/打开/卸载 AI 生成的软件。卸载按钮在窗口标题栏（紫色圆点）。' },
  { cat: '软件商城', title: 'AI 改进软件', body: '已生成的软件可继续用 AI 修改：右键桌面软件图标 →「AI 改进」，或在「我的软件」点「AI改进」，输入要改的地方（如修复某 bug、加个功能），AI 会基于现有代码改好后自动更新。' },
  { cat: '个性化', title: '用户等级与积分', body: '每日启动、AI 对话、终端命令、新建笔记、安装软件、导出存档都能获得积分（各项有每日上限），累计积分升级并获得称号。打开「等级与外观」应用或终端输入 level 查看等级与今日进度，level rule 查看完整规则。等级积分加密存储、随全量存档迁移。' },
  { cat: '个性化', title: '界面配色皮肤', body: '「等级与外观」应用可在冷（紫蓝绿）/ 中（蓝绿黄）/ 暖（绿黄橙）三套配色间切换：冷色默认解锁，中、暖色用积分解锁（终端 skin 命令同样可行）。天择网配色全部免费，网站左下角 🎨 随时切换。' },
  { cat: 'AI 对话', title: '工具栏快捷开关', body: 'AI 对话工具栏可直接开关「🌐 联网搜索」与「⌨️ 命令行模式」，不用进设置页；与 AI 配置、系统设置中的开关同源同步。' },
  { cat: 'AI 对话', title: '图片 OCR 与文本文件', body: '使用纯文本模型（关闭图片输入）时，上传/粘贴的图片会在本地 OCR 识别成文字随消息发送，图片本身不上传；txt/md/json/代码等文本文件会直接读取内容发送，不再是 base64。' },
  { cat: '命令行', title: '软件调用系统命令行', body: 'AI 生成的软件不仅能注册自己的命令，还能在软件内用 await TZOS_CMD.exec("命令") 调用任意系统命令并拿到输出（如读取笔记列表、打开系统应用），教程见 installhelp。' },
  { cat: '软件商城', title: '改名与换图标', body: '右键桌面软件图标 →「重命名」，或在「我的软件」点「重命名」，依次修改名称和图标（图标输入一个 emoji 即可）。' },
  { cat: '软件商城', title: '自动命名与图标', body: '生成软件时，AI 会自动起名并选一个匹配的 emoji 图标，无需手动设置。' },
  { cat: '浏览器', title: '多标签页', body: '浏览器支持多标签页，点标签栏「＋」新建，点「✕」关闭。新链接在 OS 内新标签页打开，不外跳。' },
  { cat: '浏览器', title: '地址栏搜索', body: '在地址栏输入非网址文字会自动用 Bing 搜索；输入域名会自动补 https://。' },
  { cat: '桌面风格', title: 'Windows / macOS 切换', body: '任务栏右侧 🖥 按钮、系统设置、或右键桌面「切换桌面风格」可切 Windows（底部全宽任务栏，控件在右）与 macOS（底部居中 Dock，控件在左）两种风格。' },
  { cat: '数据与安全', title: '数据全在本地', body: '你的 AI 配置、已装软件、对话历史、图标布局、固定项全部存在浏览器 localStorage，不上传服务器。清理浏览器数据会清空天择OS。' },
  { cat: '数据与安全', title: '重置系统', body: '系统设置 → 「重置天择OS」可清除所有本地数据并重启。请谨慎。' }
];
function renderTips() {
  const cats = [...new Set(TIPS_DATA.map(t => t.cat))];
  return `
  <div class="app-workspace app-workspace--knowledge tips-app">
    ${appWorkspaceHeaderHTML('bulb', '玩机技巧', '搜索系统能力、快捷操作和数据安全指南', {
      eyebrow: 'KNOWLEDGE BASE',
      meta: `<span class="app-badge">${TIPS_DATA.length} 条指南</span>`
    })}
    <div class="app-workspace__layout">
      <aside class="app-workspace__rail tips-rail">
        <label class="app-search tz-icon-label">${uiIconHTML('search')}<input class="input" id="tipsSearch" placeholder="搜索技巧…" /></label>
        <div class="app-nav" id="tipsCats" aria-label="技巧分类">
          <button class="app-nav__item tips-cat active" data-cat="">${uiIconHTML('sparkle')}<span>全部技巧</span></button>
          ${cats.map(c => `<button class="app-nav__item tips-cat" data-cat="${escapeHtml(c)}"><span>${escapeHtml(c)}</span></button>`).join('')}
        </div>
      </aside>
      <main class="app-workspace__main app-workspace__main--scroll tips-main">
        <section class="app-section">
          <header class="app-section__header">
            <span class="app-section__icon">${uiIconHTML('book')}</span>
            <span class="app-section__heading"><strong>指南库</strong><small>按分类筛选，或搜索标题与正文</small></span>
          </header>
          <div class="app-section__body app-list tips-list" id="tipsList"></div>
        </section>
      </main>
    </div>
  </div>`;
}
function initTips() {
  let curCat = '', curKw = '';
  const list = $('#tipsList');
  const render = () => {
    const kw = curKw.toLowerCase();
    const items = TIPS_DATA.filter(t => (!curCat || t.cat === curCat) && (!kw || t.title.toLowerCase().includes(kw) || t.body.toLowerCase().includes(kw)));
    if (!items.length) { list.innerHTML = appEmptyStateHTML('search', '没有匹配结果', '换一个关键词或切换分类再试。'); return; }
    list.innerHTML = items.map(t => `
      <article class="app-card tip-card">
        <header><span class="app-badge">${escapeHtml(t.cat)}</span><strong>${escapeHtml(t.title)}</strong></header>
        <p>${escapeHtml(t.body)}</p>
      </article>`).join('');
  };
  render();
  $('#tipsSearch').oninput = (e) => { curKw = e.target.value.trim(); render(); };
  $$('.tips-cat').forEach(b => b.onclick = () => {
    $$('.tips-cat').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    curCat = b.dataset.cat;
    render();
  });
}

/* ===================== 内置应用：天择导航（树状图） ===================== */
// 天择网站点结构：专区/二级专区层级（新闻/博客等特殊栏目级别等同于专区）
const TZ_TREE = [
  { name: '首页', icon: '🌐', url: 'index.html' },
  { name: '新闻', icon: '📰', url: 'news/index.html' },
  { name: '博客', icon: '✍️', url: 'blog/index.html' },
  { name: '数据开源', icon: '🔓', url: 'open/index.html' },
  { name: 'AI 专区', icon: '🤖', url: 'ai/index.html', children: [
    { name: 'TLH 课本学习助手', icon: '📚', url: 'ai/skill/tlh/index.html' },
    { name: '词库转换工具', icon: '🔄', url: 'ai/skill/vocab-to-json/index.html' }
  ]},
  { name: 'COC 专区', icon: '🛡️', url: 'coc/index.html', children: [
    { name: '村庄存档分析', icon: '📋', url: 'coc/index.html' },
    { name: '数据查询', icon: '📊', url: 'coc/data/index.html' },
    { name: '升级规划', icon: '📅', url: 'coc/planner/index.html' },
    { name: '伤害计算', icon: '💥', url: 'coc/dmg-calc/index.html' }
  ]},
  { name: '游戏专区', icon: '🎮', url: 'game/index.html', children: [
    { name: '绩点战争：GPA 4.3', icon: '⚔️', url: 'game/gpa-card/index.html' }
  ]},
  { name: '英语专区', icon: '📖', url: 'english/index.html', children: [
    { name: '天择背单词', icon: '📚', url: 'english/words/index.html' }
  ]},
  { name: '天择OS', icon: '🖥️', url: 'os/index.html' },
  { name: '联系开发者', icon: '📬', url: 'contact/index.html' }
];
// 打开任意天择网页面为一个新窗口（树状导航用）
function openTzPage(name, icon, url) {
  const full = url.startsWith('http') ? url : TZNET_BASE + url;
  const app = { id: 'tzpage-' + url.replace(/[^\w]/g, '-'), name, icon, iconKey: normalizeUiIconKey(icon), type: 'preset', category: 'tznet', url: full, singleton: true };
  return WM.create({ app, width: 980, height: 680 });
}
function renderTzTree() {
  const node = (item, depth) => {
    const hasKids = item.children && item.children.length;
    return `<li class="tt-item" style="--d:${depth}">
      <div class="tt-row app-card" data-url="${escapeHtml(item.url)}" data-name="${escapeHtml(item.name)}" data-icon="${escapeHtml(item.icon)}">
        ${hasKids ? `<span class="tt-toggle" aria-hidden="true">${uiIconHTML('right')}</span>` : '<span class="tt-leaf" aria-hidden="true"></span>'}
        <span class="tt-icon">${uiIconHTML(item.icon, item.name)}</span>
        <span class="tt-name">${escapeHtml(item.name)}</span>
        <span class="tt-open" title="打开">${uiIconHTML('right')}</span>
      </div>
      ${hasKids ? `<ul class="tt-kids" role="group" ${depth < 1 ? '' : 'hidden'}>${item.children.map(c => node(c, depth + 1)).join('')}</ul>` : ''}
    </li>`;
  };
  return `
  <div class="app-workspace app-workspace--explorer tz-tree-app">
    ${appWorkspaceHeaderHTML('tree', '天择网导航', '按专区浏览天择网内容，并在独立窗口中打开', {
      eyebrow: 'TIANZE SERVICE MAP',
      meta: `<span class="app-badge">${TZ_TREE.length} 个顶级入口</span>`,
      actions: `<button class="btn sm primary tz-icon-label" onclick="TZOS.launchApp('tz-home')">${uiIconHTML('globe')}<span>打开首页</span></button>`
    })}
    <main class="app-workspace__main app-workspace__main--scroll tz-tree-main">
      <section class="app-section">
        <header class="app-section__header">
          <span class="app-section__icon">${uiIconHTML('tree')}</span>
          <span class="app-section__heading"><strong>服务地图</strong><small>点击节点打开页面；带分支的节点可展开二级专区</small></span>
        </header>
        <div class="app-section__body">
          <ul class="tt-tree app-tree" role="tree" aria-label="天择网服务地图">${TZ_TREE.map(t => node(t, 0)).join('')}</ul>
        </div>
      </section>
    </main>
  </div>`;
}
function initTzTree() {
  $$('.tt-row').forEach(row => {
    const toggle = row.querySelector('.tt-toggle');
    const kids = row.parentElement.querySelector(':scope > .tt-kids');
    row.setAttribute('role', 'treeitem');
    row.tabIndex = 0;
    row.setAttribute('aria-label', '打开 ' + row.dataset.name);
    if (kids) row.setAttribute('aria-expanded', String(!kids.hidden));
    const setExpanded = (expanded) => {
      if (!toggle || !kids) return;
      kids.hidden = !expanded;
      toggle.classList.toggle('is-open', expanded);
      row.setAttribute('aria-expanded', String(expanded));
    };
    row.onclick = (e) => {
      // 点展开钮只切换展开，不打开页面
      if (toggle && kids && (e.target === toggle || e.target.closest('.tt-toggle'))) {
        setExpanded(kids.hidden);
        return;
      }
      openTzPage(row.dataset.name, row.dataset.icon, row.dataset.url);
    };
    row.onkeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        openTzPage(row.dataset.name, row.dataset.icon, row.dataset.url);
      } else if (event.key === ' ') {
        event.preventDefault();
        if (kids) setExpanded(kids.hidden);
        else openTzPage(row.dataset.name, row.dataset.icon, row.dataset.url);
      } else if (event.key === 'ArrowRight' && kids) {
        event.preventDefault();
        setExpanded(true);
      } else if (event.key === 'ArrowLeft' && kids) {
        event.preventDefault();
        setExpanded(false);
      }
    };
  });
}

/* ===================== 内置应用：浏览器 ===================== */
function renderBrowser() {
  return `
  <div class="app-workspace app-workspace--browser app-browser">
    <div class="app-toolbar browser-toolbar">
      <button class="btn sm ghost" id="brBack" title="后退">${uiIconHTML('left')}</button>
      <button class="btn sm ghost" id="brFwd" title="前进">${uiIconHTML('right')}</button>
      <button class="btn sm ghost" id="brReload" title="刷新">${uiIconHTML('refresh')}</button>
      <label class="browser-address tz-icon-label">${uiIconHTML('search')}<input class="input" id="brUrl" placeholder="输入网址或搜索词，回车前往…" /></label>
      <button class="btn sm primary" id="brGo">前往</button>
      <button class="btn sm ghost" id="brBookmark" title="收藏/取消收藏当前页">${uiIconHTML('star')}</button>
      <button class="btn sm ghost" id="brBookmarkList" title="收藏夹">${uiIconHTML('newspaper')}</button>
      <button class="btn sm ghost" id="brNewTab" title="在系统外（系统浏览器）打开当前网址">${uiIconHTML('right')}</button>
    </div>
    <div id="brBmPanel" class="browser-bookmarks" style="display:none"></div>
    <div id="brViews" class="app-workspace__stage browser-views"></div>
  </div>`;
}
function cleanupBrowserHooks() {
  if (window.__tzBrWatcher) { clearInterval(window.__tzBrWatcher); window.__tzBrWatcher = null; }
  if (window.__tzBrMsg) { window.removeEventListener('message', window.__tzBrMsg); window.__tzBrMsg = null; }
  window.__tzBrNewTab = null;
}
function initBrowser() {
  const tabsEl = $('#brTabsTitle'), views = $('#brViews'), urlInput = $('#brUrl');
  if (!tabsEl) return;
  tabsEl.setAttribute('role', 'tablist');
  tabsEl.setAttribute('aria-label', '浏览器标签页');
  const QUICK = [['天择网首页','https://wjtianze.github.io/'],['新闻','https://wjtianze.github.io/news/'],['博客','https://wjtianze.github.io/blog/'],['COC 数据','https://wjtianze.github.io/coc/data/']];
  let tabs = [], activeId = null, counter = 0;
  // 清理上一次浏览器实例遗留的 URL 轮询与消息监听（窗口刷新/重开场景）
  cleanupBrowserHooks();

  const sanitizeUrl = (u) => {
    let full = (u || '').trim();
    if (!full) return '';
    if (full.toLowerCase() === 'about:blank') return 'about:blank';
    if (!/^https?:\/\//i.test(full)) {
      if (/^[\w-]+(\.[\w-]+)+/.test(full)) full = 'https://' + full;
      else full = 'https://www.bing.com/search?q=' + encodeURIComponent(full);
    }
    return full;
  };
  const hostOf = (u) => { try { return new URL(u).host; } catch { return u.replace(/^https?:\/\//,'').split('/')[0]; } };
  const commitObservedUrl = (t, cur, title = '', fromLoad = false) => {
    if (!t || !cur || cur === 'about:blank') return;
    const pending = t.pendingUrl;
    if (pending) {
      // 导航切换期间旧页面可能仍会发送最后一条 URL 消息；只有新文档的 load 才能确认落点。
      // 且地址必须与本次目标一致；否则可能是上一个文档迟到的 load。
      if (!fromLoad || cur !== pending) return;
      t.pendingUrl = '';
      if (t.hi > 0 && t.history[t.hi] === t.history[t.hi - 1]) {
        t.history.splice(t.hi, 1);
        t.hi--;
      }
    } else if (cur !== t.url) {
      if (t.history[t.hi] !== cur) {
        t.history.length = t.hi + 1;
        t.history.push(cur);
        t.hi = t.history.length - 1;
      }
    }
    t.url = cur;
    t.overlay.style.display = 'none';
    if (title) t.title = title;
    renderTabs();
    updateNav();
    if (t.id === activeId) urlInput.value = cur;
    if (typeof refreshBmBtn === 'function') refreshBmBtn();
  };

  // 创建一个新标签页（url 可空=空白起始页）。所有新网页都在 OS 内打开，绝不外跳
  const newTab = (url) => {
    const id = 'brtab-' + (++counter);
    const overlay = el('div', 'app-empty browser-empty');
    overlay.innerHTML = '<div class="app-empty__icon">' + uiIconHTML('globe', '浏览器') + '</div><strong>从这里开始浏览</strong><p>输入网址或关键词，也可以打开一个常用入口。</p><div class="br-quick app-empty__actions"></div><div class="app-empty__meta">部分站点禁止 iframe 嵌入；遇到空白页时可更换网址。</div>';
    const q = overlay.querySelector('.br-quick');
    QUICK.forEach(([n, u]) => { const b = el('button', 'btn sm ghost', n); b.onclick = () => navigate(id, u); q.appendChild(b); });

    const frame = el('iframe', '');
    frame.id = id + '-panel';
    frame.setAttribute('role', 'tabpanel');
    Object.assign(frame.style, { width:'100%', height:'100%', border:'none', background:'#fff' });
    // sandbox：允许脚本/表单/同源（保证同源点击委托可工作、天择网页面功能正常），
    // 但【不】给 allow-popups / allow-top-navigation —— 这样跨域网站的 target=_blank/_top 链接
    // 无法跳出天择OS 到外部浏览器；同源页面则由下方点击委托接管，改到 OS 内新标签页打开。
    // sandbox：允许脚本/表单/同源，保证同源点击委托与天择网页面功能正常；
    // 补 allow-popups：让跨域站点的 target=_blank / window.open 能冒泡（网页版由同源
    // window.open 桥接接管到 OS 新标签页，桌面版由主进程 setWindowOpenHandler 接管），
    // 修复"点击 B 站搜索等链接无反应"——此前弹窗被沙箱静默吞掉。
    frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin allow-modals allow-downloads allow-presentation allow-popups');
    frame.src = 'about:blank';
    frame.referrerPolicy = 'no-referrer';
    frame.addEventListener('load', () => {
      // 同源页面：点击委托拦截 _blank/_new/_top/_parent 及外站链接 → OS 内新标签页；同站同窗口链接放行自导航
      try {
        const doc = frame.contentDocument;
        if (doc && !doc.__tzHooked) {
          doc.__tzHooked = true;
          doc.addEventListener('click', (ev) => {
            const a = ev.target.closest && ev.target.closest('a');
            if (!a || !a.href || a.hasAttribute('download')) return;
            const tgt = a.target;
            let isExternal = false;
            try { isExternal = new URL(a.href).origin !== location.origin; } catch {}
            if (tgt === '_blank' || tgt === '_new' || tgt === '_top' || tgt === '_parent' || isExternal) {
              ev.preventDefault();
              newTab(a.href);
              return;
            }
            // 否则放行：同站同窗口链接由 iframe 自身导航，下方会同步地址栏
          });
          // window.open 挂钩到 OS 内新标签页（覆盖站内脚本里 window.open 的跳转，如 B 站搜索结果页）
          try {
            frame.contentWindow.open = (u) => { if (u) newTab(new URL(u, frame.contentWindow.location.href).href); return null; };
          } catch (e2) {}
          // SPA 站点的"伪链接"（role=link / data-href / 带 cursor:pointer 的可点元素）：
          // 点击时若没有 <a>，尝试读取 data-href / onclick 里的 URL 并在本标签页导航
          doc.addEventListener('click', (ev) => {
            if (ev.defaultPrevented) return;
            if (ev.target.closest && ev.target.closest('a')) return; // <a> 已由上方委托处理
            const t = ev.target.closest('[data-href],[role="link"]');
            if (!t) return;
            const raw = t.getAttribute('data-href') || t.getAttribute('data-url') || '';
            if (raw && /^https?:\/\//i.test(raw)) {
              ev.preventDefault();
              try { frame.contentWindow.location.href = new URL(raw, frame.contentWindow.location.href).href; } catch (e3) {}
            }
          }, true);
        }
      } catch (e) { /* 跨域无法注入委托；sandbox 已阻止跳出系统 */ }
      // 同步地址栏与 tab 信息：同源读精确当前 URL（含自导航），跨域回退到 frame.src
      const t = tabs.find(x => x.id === id);
      if (t) {
        let cur = '';
        try { cur = frame.contentWindow.location.href; } catch (e) { cur = frame.src; }
        let title = '';
        try { title = (frame.contentDocument && frame.contentDocument.title) || ''; } catch {}
        commitObservedUrl(t, cur, title, true);
      }
    });

    views.appendChild(frame);
    views.appendChild(overlay);
    tabs.push({ id, url: '', frame, overlay, history: ['about:blank'], hi: 0, title: '', pendingUrl: '' });
    renderTabs();
    activate(id);
    if (url) navigate(id, url);
    return id;
  };

  const navigate = (id, u, push) => {
    const t = tabs.find(x => x.id === id); if (!t) return;
    const full = sanitizeUrl(u); if (!full) return;
    const blank = full === 'about:blank';
    t.url = blank ? '' : full;
    t.pendingUrl = full;
    t.frame.src = full;
    t.overlay.style.display = blank ? 'flex' : 'none';
    if (push !== false) { t.history.length = t.hi + 1; t.history.push(full); t.hi = t.history.length - 1; }
    if (id === activeId) urlInput.value = blank ? '' : full;
    updateNav();
    if (typeof refreshBmBtn === 'function') refreshBmBtn();
  };

  const activate = (id, focusTab = false) => {
    activeId = id;
    tabs.forEach(t => {
      const on = t.id === id;
      t.frame.style.display = on ? '' : 'none';
      t.overlay.style.display = on ? (t.url ? 'none' : 'flex') : 'none';
    });
    const t = tabs.find(x => x.id === id);
    if (t) urlInput.value = t.url || '';
    updateNav();
    renderTabs();
    if (focusTab) focusSafely(tabsEl.querySelector(`[data-tab-id="${id}"] .br-tab-main`));
    if (typeof refreshBmBtn === 'function') refreshBmBtn();
  };

  const closeTab = (id, focusTab = false) => {
    const i = tabs.findIndex(x => x.id === id); if (i < 0) return;
    tabs[i].frame.remove(); tabs[i].overlay.remove();
    tabs.splice(i, 1);
    if (!tabs.length) {
      const newId = newTab('');
      if (focusTab) focusSafely(tabsEl.querySelector(`[data-tab-id="${newId}"] .br-tab-main`));
      return;
    }
    if (activeId === id) activate(tabs[Math.min(i, tabs.length - 1)].id, focusTab);
    else {
      renderTabs();
      if (focusTab) focusSafely(tabsEl.querySelector(`[data-tab-id="${activeId}"] .br-tab-main`));
    }
  };

  const renderTabs = () => {
    tabsEl.innerHTML = '';
    tabs.forEach((t, index) => {
      const tab = el('div', 'br-tab' + (t.id === activeId ? ' active' : ''));
      tab.dataset.tabId = t.id;
      // 标签显示网页自带标题（同源/天择网页面可获取），取不到时回退到域名
      const label = t.title || (t.url ? hostOf(t.url) : '新标签页');
      tab.title = (t.title ? t.title + '\n' : '') + (t.url || '');
      const main = el('button', 'br-tab-main', `<span class="br-tab-label">${escapeHtml(label)}</span>`);
      main.type = 'button';
      main.setAttribute('role', 'tab');
      main.setAttribute('aria-selected', String(t.id === activeId));
      main.setAttribute('aria-controls', t.frame.id);
      main.tabIndex = t.id === activeId ? 0 : -1;
      t.frame.setAttribute('aria-labelledby', t.id + '-tab');
      main.id = t.id + '-tab';
      main.onclick = () => activate(t.id);
      main.onkeydown = (event) => {
        let nextIndex = -1;
        if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabs.length - 1;
        if (event.key === 'Delete') {
          event.preventDefault();
          closeTab(t.id, true);
          return;
        }
        if (nextIndex >= 0) {
          event.preventDefault();
          activate(tabs[nextIndex].id, true);
        }
      };
      const close = el('button', 'br-x', uiIconHTML('close'));
      close.type = 'button';
      close.setAttribute('aria-label', '关闭标签页 ' + label);
      close.onclick = (event) => {
        event.stopPropagation();
        closeTab(t.id, true);
      };
      tab.append(main, close);
      // 中键（滚轮）点击标签页直接关闭
      tab.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); e.stopPropagation(); closeTab(t.id); } });
      tab.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
      tabsEl.appendChild(tab);
    });
    const plus = el('button', 'br-tab-plus', '＋');
    plus.title = '新建标签页';
    plus.setAttribute('aria-label', '新建标签页');
    plus.onclick = () => newTab('');
    tabsEl.appendChild(plus);
  };

  const updateNav = () => {
    const t = tabs.find(x => x.id === activeId);
    $('#brBack').disabled = !t || t.hi <= 0;
    $('#brFwd').disabled = !t || t.hi >= t.history.length - 1;
  };
  const moveHistory = (t, step) => {
    if (!t) return;
    const current = t.url || 'about:blank';
    let next = t.hi + step;
    while (next >= 0 && next < t.history.length && t.history[next] === current) next += step;
    if (next < 0 || next >= t.history.length) return;
    t.hi = next;
    navigate(t.id, t.history[t.hi], false);
  };

  $('#brGo').onclick = () => navigate(activeId, urlInput.value);
  urlInput.onkeydown = (e) => { if (e.key === 'Enter') navigate(activeId, urlInput.value); };
  // ↗ 在 OS 内新标签页打开当前网址（不再 window.open 外跳）
  $('#brNewTab').onclick = () => { const t = tabs.find(x => x.id === activeId); const u = urlInput.value || (t && t.url) || ''; if (!u) return; try { if (window.tzDesktop && window.tzDesktop.openExternal) window.tzDesktop.openExternal(u); else window.open(u, '_blank'); } catch (e) { window.open(u, '_blank'); } };
  $('#brBack').onclick = () => moveHistory(tabs.find(x => x.id === activeId), -1);
  $('#brFwd').onclick = () => moveHistory(tabs.find(x => x.id === activeId), 1);
  $('#brReload').onclick = () => { const t = tabs.find(x => x.id === activeId); if (t && t.url) t.frame.src = t.url; };

  /* ===== 收藏夹书签（支持导入导出，兼容 Chrome/Edge/Firefox 的 Netscape 书签格式） ===== */
  const bmBtn = $('#brBookmark'), bmPanel = $('#brBmPanel');
  const activeTab = () => tabs.find(x => x.id === activeId);
  const isBm = (u) => Store.getBookmarks().some(b => b.url === u);
  const refreshBmBtn = () => {
    const t = activeTab();
    if (bmBtn) {
      bmBtn.innerHTML = uiIconHTML('star');
      bmBtn.classList.toggle('active', !!(t && t.url && isBm(t.url)));
    }
  };
  const exportBookmarks = () => {
    const bms = Store.getBookmarks();
    if (!bms.length) { toast('收藏夹为空'); return; }
    const esc2 = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const items = bms.map(b => '    <DT><A HREF="' + esc2(b.url) + '" ADD_DATE="' + Math.floor((b.time || Date.now()) / 1000) + '">' + esc2(b.title || b.url) + '</A>').join('\n');
    const html = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<!-- This is an automatically generated file.\n     It will be read and overwritten.\n     DO NOT EDIT! -->\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n' + items + '\n</DL><p>\n';
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tianze-bookmarks-' + new Date().toISOString().slice(0, 10) + '.html';
    a.click();
    URL.revokeObjectURL(url);
    toast('已导出 ' + bms.length + ' 条收藏（可导入 Chrome/Edge/Firefox）', 3200);
  };
  const importBookmarks = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.html,.htm,.json,text/html,application/json';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      try {
        const text = await f.text();
        let found = [];
        if (/^\s*[[{]/.test(text)) {
          // JSON：支持 [{title,url}] 或 {bookmarks:[...]}
          try {
            const j = JSON.parse(text);
            const arr = Array.isArray(j) ? j : (j.bookmarks || []);
            arr.forEach(x => { if (x && x.url) found.push({ title: x.title || x.name || x.url, url: x.url }); });
          } catch (e) {}
        }
        if (!found.length) {
          // Netscape 书签 HTML（Chrome/Edge/Firefox 导出格式）
          const doc = new DOMParser().parseFromString(text, 'text/html');
          doc.querySelectorAll('a[href]').forEach(a => {
            const u = a.getAttribute('href');
            if (u && /^https?:\/\//i.test(u)) found.push({ title: (a.textContent || '').trim() || u, url: u });
          });
        }
        if (!found.length) { toast('未在文件中识别到书签', 3000); return; }
        const bms = Store.getBookmarks();
        let added = 0;
        found.forEach(x => {
          if (!bms.some(b => b.url === x.url)) { bms.push({ title: x.title, url: x.url, time: Date.now() }); added++; }
        });
        Store.setBookmarks(bms);
        refreshBmBtn(); renderBmPanel();
        toast('导入完成：新增 ' + added + ' 条，跳过重复 ' + (found.length - added) + ' 条', 3200);
      } catch (e) { toast('导入失败：' + (e.message || e), 3200); }
    };
    inp.click();
  };
  const renderBmPanel = () => {
    if (!bmPanel || bmPanel.style.display === 'none') return;
    const bms = Store.getBookmarks();
    bmPanel.innerHTML = '<div style="display:flex;gap:8px;padding:8px 10px;border-bottom:1px solid var(--glass-border);align-items:center"><strong class="tz-icon-label" style="font-size:13px">' + uiIconHTML('newspaper') + '<span>收藏夹</span></strong><span style="flex:1"></span><button class="btn sm ghost tz-icon-label" id="brBmImport">' + uiIconHTML('download') + '<span>导入</span></button><button class="btn sm ghost tz-icon-label" id="brBmExport">' + uiIconHTML('upload') + '<span>导出</span></button></div>' +
      (bms.length
        ? bms.map((b, i) => `<div class="br-bm-item" role="button" tabindex="0" aria-label="打开书签 ${escapeHtml(b.title || b.url)}" data-url="${escapeHtml(b.url)}" style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;font-size:13px;color:var(--ink-dim)"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(b.title || b.url)}</span><small style="color:var(--ink-muted);max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(hostOf(b.url))}</small><button type="button" class="br-bm-del" data-i="${i}" style="opacity:.6;padding:2px 6px" aria-label="删除书签 ${escapeHtml(b.title || b.url)}">${uiIconHTML('close')}</button></div>`).join('')
        : '<div style="padding:18px;text-align:center;color:var(--ink-faint);font-size:12.5px">暂无收藏。点导航栏 ☆ 收藏当前页；也可点「导入」从 Chrome/Edge/Firefox 书签文件导入。</div>');
    bmPanel.querySelectorAll('.br-bm-item').forEach(item => {
      const activateBookmark = (e) => {
        const removeButton = e.target.closest('.br-bm-del');
        if (removeButton) {
          e.stopPropagation();
          const i = +removeButton.dataset.i;
          const bms2 = Store.getBookmarks();
          bms2.splice(i, 1);
          Store.setBookmarks(bms2);
          refreshBmBtn(); renderBmPanel();
          return;
        }
        navigate(activeId, item.dataset.url);
        bmPanel.style.display = 'none';
      };
      item.onclick = activateBookmark;
      item.onkeydown = (event) => {
        if (event.target !== item || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        activateBookmark(event);
      };
      const removeButton = item.querySelector('.br-bm-del');
      if (removeButton) removeButton.onkeydown = (event) => event.stopPropagation();
    });
    const imp = $('#brBmImport'), exp = $('#brBmExport');
    if (imp) imp.onclick = importBookmarks;
    if (exp) exp.onclick = exportBookmarks;
  };
  if (bmBtn) bmBtn.onclick = () => {
    const t = activeTab();
    if (!t || !t.url) { toast('当前页无法收藏'); return; }
    let bms = Store.getBookmarks();
    if (isBm(t.url)) { bms = bms.filter(b => b.url !== t.url); toast('已取消收藏'); }
    else { bms.unshift({ title: t.title || hostOf(t.url), url: t.url, time: Date.now() }); toast('已收藏 ' + (t.title || hostOf(t.url))); }
    Store.setBookmarks(bms);
    refreshBmBtn(); renderBmPanel();
  };
  const bmListBtn = $('#brBookmarkList');
  if (bmListBtn) bmListBtn.onclick = () => {
    bmPanel.style.display = bmPanel.style.display === 'none' ? '' : 'none';
    if (bmPanel.style.display !== 'none') renderBmPanel();
  };
  // 切换/导航后同步收藏按钮状态（activate/navigate 内部已调用 refreshBmBtn）
  refreshBmBtn();

  // 接收天择网页面（被嵌入时）主动上报的消息：新窗口链接 → OS 内开标签页；当前网址 → 同步地址栏。
  // 不依赖同源，本地预览（localhost）与线上均生效。
  const onBrMsg = (ev) => {
    const d = ev.data; if (!d) return;
    let tab = null;
    for (let i = 0; i < tabs.length; i++) {
      try { if (tabs[i].frame.contentWindow === ev.source) { tab = tabs[i]; break; } } catch (e) {}
    }
    if (!tab) return;
    if (d.type === 'tz_browser_open' && d.url) {
      newTab(d.url);
    } else if (d.type === 'tz_browser_url') {
      if (d.url && d.url !== 'about:blank') {
        commitObservedUrl(tab, d.url, d.title || '');
      }
    }
  };
  window.addEventListener('message', onBrMsg);
  window.__tzBrMsg = onBrMsg;

  // 同源页面通常通过 postMessage / load 同步；仅在标签页可见且浏览器窗口存在时低频兜底。
  window.__tzBrWatcher = setInterval(() => {
    if (document.hidden || !document.body.contains(views)) return;
    const t = tabs.find(x => x.id === activeId);
    if (!t || !document.body.contains(t.frame)) return;
    let cur = '';
    try { cur = t.frame.contentWindow.location.href; } catch (e) { return; }
    if (cur && cur !== 'about:blank' && cur !== t.url) {
      let title = '';
      try { title = (t.frame.contentDocument && t.frame.contentDocument.title) || ''; } catch {}
      commitObservedUrl(t, cur, title);
    }
  }, 2000);

  newTab('');
  // 桌面版集成：暴露 newTab 给外部（tzOpenInBrowser 用），网页版无副作用
  window.__tzBrNewTab = newTab;
}

/* ===================== 刷新已打开的应用窗口 ===================== */
function refreshOpenApp(appId) {
  WM.windows.filter(x => x.appId === appId).forEach(w => {
    w.body.innerHTML = '';
    if (w.app.type === 'builtin') w.body.innerHTML = w.app.render({ titlebarTabs: appId === 'ai-chat' && !window.__tzFloatMode });
    initAppHooks(appId, w);
  });
}
window.TZOS.checkUpdate = async function() {
  const remote = await Updater.check(true);
  const au = $('#aboutUpdate');
  if (au) {
    const pending = Store.get('updateAvailable', null);
    au.textContent = (pending && compareVersions(pending, OS_VERSION) > 0)
      ? '发现新版本 v' + pending + '，请前往「系统设置 → 系统版本」更新'
      : (remote ? '当前已是最新版本' : '');
  }
};
function initAppHooks(appId, winObj) {
  if (appId === 'ai-chat') initChat('ai-chat-main');
  if (appId === 'app-store') initAppStore();
  if (appId === 'settings') initSettings();
  if (appId === 'ai-config') initAIConfig();
  if (appId === 'browser') initBrowser();
  if (appId === 'terminal') initTerminal();
  if (appId === 'clock') initClockApp();
  if (appId === 'doc-reader') initDocReader();
  if (appId === 'knowledge-manager') initKnowledgeManager();
  if (appId === 'agent-center') initAgentCenter(winObj);
  if (appId === 'notes') initNotes();
  if (appId === 'tips') initTips();
  if (appId === 'tz-tree') initTzTree();
  if (appId === 'about') {
    const pending = Store.get('updateAvailable', null);
    const au = $('#aboutUpdate');
    if (au && pending && compareVersions(pending, OS_VERSION) > 0) {
      au.textContent = '发现新版本 v' + pending + '，请前往「系统设置 → 系统版本」更新';
    }
  }
}
function initAIConfig() {
  initAppWorkspaceNav('.app-config');
  $$('[data-profile-save]').forEach(button => { button.onclick = () => window.TZOS.saveAIProfile(button.dataset.profileSave); });
  $$('[data-profile-load]').forEach(button => { button.onclick = () => window.TZOS.loadAIProfile(button.dataset.profileLoad); });
  $$('[data-profile-delete]').forEach(button => { button.onclick = () => window.TZOS.deleteAIProfile(button.dataset.profileDelete); });
  $$('[data-profile-name]').forEach(input => {
    input.onchange = () => window.TZOS.renameAIProfile(input.dataset.profileName, input.value);
    input.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); input.blur(); } };
  });
  $$('.model-preset').forEach(chip => {
    const preset = AI_MODEL_PRESETS.find(p => p.id === chip.dataset.preset);
    if (preset && preset.model === ($('#cfgModel') || {}).value && preset.url === ($('#cfgUrl') || {}).value) chip.classList.add('active');
    chip.onclick = () => {
      const p = AI_MODEL_PRESETS.find(x => x.id === chip.dataset.preset);
      if (!p) return;
      const setValue = (id, value) => { const e = $(id); if (e) e.value = String(value == null ? '' : value); };
      setValue('#cfgUrl', p.url);
      setValue('#cfgModel', p.model);
      setValue('#cfgMaxTokens', p.maxTokens);
      setValue('#cfgCtxLen', p.contextLength);
      setValue('#cfgPriceHit', p.prices.hit);
      setValue('#cfgPriceWrite', p.prices.write);
      setValue('#cfgPriceInput', p.prices.input);
      setValue('#cfgPriceOutput', p.prices.output);
      setValue('#cfgPriceSearch', p.prices.search);
      const key = $('#cfgKey');
      if (key) key.value = '';
      const setCap = (id, on) => {
        const e = $(id);
        if (!e) return;
        e.classList.toggle('on', !!on);
        e.setAttribute('aria-checked', String(!!on));
      };
      setCap('#capImageTg', p.caps.image);
      setCap('#capFileTg', p.caps.file);
      setCap('#capWebTg', p.caps.webSearch);
      if (!p.caps.webSearch) setWebSearchCtx(false);
      const puC = $('#priceUnitCny'), puU = $('#priceUnitUsd');
      if (puC && puU) { puC.classList.add('active'); puU.classList.remove('active'); }
      $$('.model-preset').forEach(c => c.classList.toggle('active', c === chip));
      toast('已载入 ' + p.title + ' 全套配置（请填写自己的 API Key）', 3200);
    };
  });
  // 货币单位切换（仅切换选中态，保存时读取）
  const puC = $('#priceUnitCny'), puU = $('#priceUnitUsd');
  if (puC && puU) {
    puC.onclick = () => { puC.classList.add('active'); puU.classList.remove('active'); };
    puU.onclick = () => { puU.classList.add('active'); puC.classList.remove('active'); };
  }
  // 记忆开关
  const memInjectTg = $('#memInjectTg');
  if (memInjectTg) bindSwitch(memInjectTg, Store.getMemInject.bind(Store), Store.setMemInject.bind(Store), '将启用的记忆注入提示词');
  const memAutoTg = $('#memAutoTg');
  if (memAutoTg && !Store.getAgentMode()) bindSwitch(memAutoTg, Store.getMemAuto.bind(Store), Store.setMemAuto.bind(Store), '生成后自动写入记忆');
  // 能力设置开关：只切换选中态，实际保存走 saveConfig（读取 readCapsForm）
  const capToggle = (id, label) => {
    const e = $(id);
    if (e) bindSwitch(e, () => e.classList.contains('on'), (next) => e.classList.toggle('on', next), label);
  };
  capToggle('#capImageTg', '允许图片输入');
  capToggle('#capFileTg', '允许文件输入');
  capToggle('#capWebTg', '允许联网搜索');
  // 模型列表拉取按钮
  const fm = $('#cfgFetchModels');
  if (fm) fm.onclick = () => window.TZOS.fetchModels();
  // AI 命令行模式开启期间：自动写入记忆被接管（由 AI 通过 mem 命令写），开关禁用并提示
  if (Store.getAgentMode()) {
    const tg = $('#memAutoTg');
    if (tg) {
      tg.classList.remove('on');
      tg.style.opacity = '0.4';
      tg.setAttribute('role', 'switch');
      tg.setAttribute('aria-checked', 'false');
      tg.setAttribute('aria-disabled', 'true');
      tg.setAttribute('aria-label', '生成后自动写入记忆（由命令行模式接管）');
      tg.tabIndex = 0;
      const explain = (event) => {
        if (event && event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
        if (event) event.preventDefault();
        toast('AI 命令行模式开启期间，记忆由 AI 通过命令行写入（可在系统设置关闭命令行模式）', 3200);
      };
      tg.onclick = explain;
      tg.onkeydown = explain;
      const desc = tg.closest('.setting-row') && tg.closest('.setting-row').querySelector('.sr-desc');
      if (desc) desc.textContent = '已被「AI 命令行模式」接管（系统设置可关）';
    }
  }
  renderMemList();
  const memInp = $('#memNewInput');
  if (memInp) memInp.onkeydown = (e) => { if (e.key === 'Enter') window.TZOS.memAdd(); };
}
// 在窗口创建后初始化内置应用钩子
const origRender = WM.renderContent.bind(WM);
WM.renderContent = function(winObj, opts) {
  origRender(winObj, opts);
  setTimeout(() => initAppHooks(winObj.appId, winObj), 0);
};

/* ===================== 时钟 ===================== */
function startClock() {
  const tick = () => {
    const d = new Date();
    const tc = $('#tbClock');
    if (tc) tc.innerHTML = fmtTime(d) + '<br>' + fmtDate(d);
    const topClock = $('#osTopClock');
    if (topClock) topClock.textContent = fmtTime(d);
  };
  tick();
  const schedule = () => {
    const delay = 60000 - (Date.now() % 60000) + 20;
    window.__tzClockTimer = setTimeout(() => { tick(); schedule(); }, delay);
  };
  schedule();
  startStatusIndicators();
}
/* ---- 右下角状态：联网情况 + 电量 ---- */
// 把系统主音量/静音应用到当前所有音视频元素，并挂钩之后新建的元素
function applySysVolume() {
  const v = Store.get('sysMuted', false) ? 0 : (Store.get('sysVolume', 1) ?? 1);
  document.querySelectorAll('audio,video').forEach(m => { try { m.volume = v; m.muted = Store.get('sysMuted', false); } catch (e) {} });
}
function startStatusIndicators() {
  // 联网状态
  const net = $('#tbNet');
  const paintNet = () => {
    if (!net) return;
    const on = navigator.onLine;
    setUiIcon(net, 'network');
    net.title = on ? '已联网' : '已断网';
    net.classList.toggle('off', !on);
    const topStatus = $('#osTopStatus');
    if (topStatus) topStatus.textContent = on ? '系统就绪 · 已联网' : '系统就绪 · 离线';
  };
  paintNet();
  window.addEventListener('online', paintNet);
  window.addEventListener('offline', paintNet);
  // 音量：维护一个全局主音量（0~1）与静音态，作用于系统内新建的音视频元素
  const vol = $('#tbVol');
  if (vol) {
    const paintVol = () => {
      const v = Store.get('sysVolume', 1);
      const muted = Store.get('sysMuted', false) || v === 0;
      setUiIcon(vol, 'volume');
      vol.title = muted ? '已静音（点击取消）' : '音量 ' + Math.round(v * 100) + '%（点击静音）';
      vol.setAttribute('aria-label', muted ? '取消静音' : '静音，当前音量 ' + Math.round(v * 100) + '%');
      vol.setAttribute('aria-pressed', String(muted));
    };
    paintVol();
    vol.onclick = () => {
      const muted = Store.get('sysMuted', false);
      if (muted) { Store.set('sysMuted', false); if ((Store.get('sysVolume', 1) || 0) === 0) Store.set('sysVolume', 0.5); }
      else Store.set('sysMuted', true);
      paintVol();
      applySysVolume();
      toast(Store.get('sysMuted', false) ? '🔇 已静音' : '🔊 已取消静音');
    };
    // 滚轮微调音量
    vol.addEventListener('wheel', (e) => {
      e.preventDefault();
      let v = Store.get('sysVolume', 1);
      v = Math.min(1, Math.max(0, v + (e.deltaY < 0 ? 0.1 : -0.1)));
      Store.set('sysVolume', Math.round(v * 100) / 100);
      Store.set('sysMuted', v === 0);
      paintVol();
      applySysVolume();
    }, { passive: false });
  }
  // 电量（Battery Status API，不支持的浏览器隐藏图标）
  const bat = $('#tbBattery');
  if (bat) {
    if (navigator.getBattery) {
      navigator.getBattery().then(b => {
        const paintBat = () => {
          const pct = Math.round(b.level * 100);
          const chg = b.charging;
          setUiIcon(bat, chg ? 'lightning' : 'battery', pct + '%');
          bat.title = (chg ? '充电中 · ' : '') + '电量 ' + pct + '%';
          bat.classList.toggle('low', !chg && pct < 20);
        };
        paintBat();
        b.addEventListener('levelchange', paintBat);
        b.addEventListener('chargingchange', paintBat);
      }).catch(() => { bat.style.display = 'none'; });
    } else {
      bat.style.display = 'none';
    }
  }
}

/* ===================== 开机流程 ===================== */
async function boot() {
  AppCommands._ensureListener(); // v3.5：软件→系统命令行桥（__tzSysExec）尽早待命
  // v3.0 悬浮窗模式：float-chat.html 加载 os.js 时走轻量启动
  if (window.__tzFloatMode) {
    const tipEl = $('#bootTip');
    if (tipEl) tipEl.textContent = '悬浮窗加载中…';
    applyTheme();
    // 不执行 Desktop.render / FloatingWidget.init / startClock / bindGlobalEvents
    // 不需要任务栏/开始菜单/更新检查/通知
    await new Promise(r => setTimeout(r, 300));
    const boot = $('#bootScreen');
    if (boot) { boot.classList.add('gone'); setTimeout(() => { boot.style.display = 'none'; }, 300); }
    return;
  }
  const tips = ['正在唤醒系统…', '加载桌面环境…', '注册应用…', '连接存储…', '准备就绪…'];
  const tipEl = $('#bootTip');
  let i = 0;
  const tipTimer = setInterval(() => { tipEl.textContent = tips[i % tips.length]; i++; }, 380);

  applyTheme();
  applyDeviceStyle();
  Desktop.render();
  FloatingWidget.init();
  startClock();
  bindGlobalEvents();
  RPG.gain('boot'); // v3.5 积分：每日首次启动 +10

  // 启动后静默检查更新（不打扰，发现新版本仅通知）
  setTimeout(() => Updater.check(false), 2600);

  await new Promise(r => setTimeout(r, 1400));
  clearInterval(tipTimer);

  const boot = $('#bootScreen');
  boot.classList.add('gone');
  setTimeout(() => { boot.style.display = 'none'; $('#desktop').hidden = false; restoreOpenWindows(); }, 600);

  Store.addNotifOnce('boot-welcome-v4', { title: '欢迎使用天择OS', body: '所有天择网功能已预装为应用。打开「AI 配置」即可开始使用 AI 功能。', iconKey: 'crystal' });
  Store.addNotifOnce('boot-store-ready-v4', { title: '软件商城已就绪', body: '输入一句话，让 AI 为你生成专属软件。', iconKey: 'cart' });

  // 桌面版首次启动：AI 配置独立存于本机（与网页版不共享），未配置时自动弹出引导
  if (window.tzDesktop && !AI.isReady()) {
    setTimeout(() => {
      toast('桌面版需单独配置 AI：填入 API Key 即可使用对话与软件商城', 6000);
      launchApp('ai-config');
    }, 1200);
  }
  const requestedApp = new URLSearchParams(location.search).get('open');
  if (requestedApp && findApp(requestedApp)) setTimeout(() => launchApp(requestedApp), 900);
}

/* ===================== 全局事件绑定 ===================== */
function bindGlobalEvents() {
  // 4.0 顶部态势线 / 系统轨道入口
  $$('[data-shell-app]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const appId = btn.dataset.shellApp;
      if (appId) launchApp(appId);
    };
  });
  const shellSearch = $('#shellSearch');
  if (shellSearch) shellSearch.onclick = (e) => { e.stopPropagation(); StartMenu.show(); };
  // 开始按钮
  $('#btnStart').onclick = (e) => { e.stopPropagation(); StartMenu.toggle(); };
  // 风格切换按钮（任务栏）
  $('#btnStyle').onclick = (e) => { e.stopPropagation(); toggleStyle(); };
  // AI 配置快捷按钮（任务栏）
  $('#btnAiConfig').onclick = (e) => { e.stopPropagation(); launchApp('ai-config'); };
  // 设置按钮
  $('#btnSettings').onclick = (e) => { e.stopPropagation(); StartMenu.hide(false); launchApp('settings'); };
  // 开始菜单关闭按钮
  const btnStartClose = $('#btnStartClose');
  if (btnStartClose) btnStartClose.onclick = (e) => { e.stopPropagation(); StartMenu.hide(); };
  // 关机按钮
  $('#btnPower').onclick = (e) => {
    e.stopPropagation();
    const items = [
      { icon: '🔄', label: '刷新系统', act: () => location.reload() },
      { sep: true }
    ];
    if (window.tzDesktop) {
      // 桌面版：在 OS 内置浏览器打开天择网（不跳出应用），并提供退出应用
      items.push({ icon: '🌐', label: '打开天择网', act: () => tzOpenInBrowser('https://wjtianze.github.io/') });
      items.push({ icon: '⏻', label: '退出天择OS', act: () => { try { window.tzDesktop.quit(); } catch (e) {} } });
    } else {
      // 网页版：返回天择OS 入口页（选择桌面端/网页端）
      items.push({ icon: '🌐', label: '返回天择网', act: () => { window.location.href = 'index.html'; } });
    }
    showCtxMenu(e.clientX, e.clientY, items);
  };
  // 时钟点击 → 通知中心
  $('#tbClock').onclick = (e) => { e.stopPropagation(); toggleNotifCenter(); };
  // 主题切换按钮（任务栏托盘）
  const btnTheme = $('#btnTheme');
  if (btnTheme) btnTheme.onclick = (e) => {
    e.stopPropagation();
    const next = Store.getTheme() === 'light' ? 'dark' : 'light';
    Store.setTheme(next);
    applyTheme();
    refreshOpenApp('settings');
    toast('已切换为' + (next === 'light' ? '浅色' : '深色') + '主题');
  };
  // 显示桌面按钮（Windows 风格右下角）：点击最小化所有窗口，再点复原
  const sdBtn = $('#btnShowDesktop');
  if (sdBtn) sdBtn.onclick = (e) => {
    e.stopPropagation();
    if (!window.__tzDesktopShown) {
      WM.windows.forEach(w => { if (!w.minimized) WM.minimize(w.id); });
      window.__tzDesktopShown = true;
      sdBtn.classList.add('active');
    } else {
      [...WM.windows].reverse().forEach(w => { if (w.minimized) WM.restore(w.id); });
      window.__tzDesktopShown = false;
      sdBtn.classList.remove('active');
    }
  };
  // 点击空白关闭菜单
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('#startMenu') && !e.target.closest('#btnStart')) StartMenu.hide(false);
    if (!e.target.closest('#ctxMenu')) hideCtxMenu(false);
    if (!e.target.closest('#notifCenter') && !e.target.closest('#tbClock')) setNotifCenterOpen(false);
    if (!e.target.closest('.desktop-icon') && !e.target.closest('.start-app') && !e.target.closest('#floatingWidget') && !e.target.closest('#fwReopen')) Desktop.clearSelect();
  });
  // 桌面右键（任务栏/窗口/图标/悬浮窗不触发桌面菜单）
  $('#desktop').addEventListener('contextmenu', (e) => {
    if (e.target.closest('.desktop-icon') || e.target.closest('.win') || e.target.closest('#floatingWidget') || e.target.closest('#taskbar') || e.target.closest('#startMenu') || e.target.closest('#notifCenter')) return;
    e.preventDefault();
    showCtxMenu(e.clientX, e.clientY, [
      { icon: '🔄', label: '刷新桌面', act: () => { Desktop.render(); StartMenu.render(); } },
      { icon: '↩', label: '重置图标布局', act: () => Desktop.resetLayout() },
      { sep: true },
      { icon: '🛒', label: '打开软件商城', act: () => launchApp('app-store') },
      { icon: '💬', label: 'AI 对话', act: () => launchApp('ai-chat') },
      { sep: true },
      { icon: '🖥️', label: '切换桌面风格', act: () => toggleStyle() },
      { icon: '⚙️', label: '系统设置', act: () => launchApp('settings') },
      { icon: '🌐', label: '返回天择网', act: () => { if (window.tzDesktop) { tzOpenInBrowser('https://wjtianze.github.io/'); } else { window.location.href = 'index.html'; } } }
    ]);
  });
  // 开始菜单搜索
  $('#startSearch').oninput = (e) => StartMenu.render(e.target.value);
  // 窗口大小变化合并到下一帧，避免拖动窗口时反复重建桌面 DOM。
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      applyDeviceStyle();
      WM.reflowAll();
      FloatingWidget.constrain();
      Desktop.render();
    });
  }, { passive: true });
  // 键盘快捷键
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 'Tab') {
      e.preventDefault();
      WM.cycleFocus(e.shiftKey);
      return;
    }
    if (e.altKey && e.key === 'F4') {
      const focused = WM.focusedWindow();
      if (focused) { e.preventDefault(); WM.close(focused.id); }
      return;
    }
    if (e.ctrlKey && e.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(e.key)) {
      const focused = WM.focusedWindow();
      if (focused) {
        e.preventDefault();
        WM.snap(focused.id, e.key === 'ArrowLeft' ? 'left' : e.key === 'ArrowRight' ? 'right' : 'max');
      }
      return;
    }
    if (e.key === 'Escape') {
      // Esc 仅用于关闭菜单/面板
      if (StartMenu.open) { StartMenu.hide(); return; }
      if (ctxEl) { hideCtxMenu(true); return; }
      const nc = $('#notifCenter'); if (nc && !nc.hidden) { setNotifCenterOpen(false, true); return; }
    }
    // Ctrl+1 切换 AI 悬浮窗（v3.0：独立于 OS 窗口的浮动对话）
    if (e.ctrlKey && (e.key === '1' || e.key === '!')) {
      e.preventDefault();
      toggleFloatingChat();
      return;
    }
    // Ctrl+Q 切换浏览器全屏（覆盖浏览器默认快捷键）
    if (e.ctrlKey && (e.key === 'q' || e.key === 'Q')) {
      e.preventDefault();
      toggleFullscreen();
    }
    if (e.ctrlKey && e.key === ' ') { e.preventDefault(); StartMenu.toggle(); }
  });
  // 点击网页渲染框 = 点击了系统/应用：天择网页面（main.js）会 postMessage 桥接点击与 Ctrl+Q
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (!d || !d.type) return;
    if (d.type !== 'tz_iframe_focus' && d.type !== 'tz_hotkey') return;
    const w = WM.windows.find(x => {
      const frames = x.el.querySelectorAll('iframe');
      for (const f of frames) { try { if (f.contentWindow === ev.source) return true; } catch (e) {} }
      return false;
    });
    if (w) WM.focus(w.id);
    if (d.type === 'tz_hotkey') {
      if (d.key === 'ctrl+q') toggleFullscreen();
      else if (d.key === 'ctrl+1') toggleFloatingChat();
    }
  });
  // 跨域外部网站无法桥接：顶层 blur + activeElement 检测兜底聚焦（点击 iframe 后窗口自动置顶）
  window.addEventListener('blur', () => {
    setTimeout(() => {
      const ae = document.activeElement;
      if (ae && ae.tagName === 'IFRAME') {
        const w = WM.windows.find(x => x.el.contains(ae));
        if (w) WM.focus(w.id);
      }
    }, 0);
  });
}
function toggleFullscreen() {
  if (document.fullscreenElement) { document.exitFullscreen(); }
  else { try { document.documentElement.requestFullscreen(); } catch (err) {} }
}

function toggleStyle() {
  const cur = Store.getStyle() || 'win';
  const next = cur === 'mac' ? 'win' : 'mac';
  Store.setStyle(next);
  applyDeviceStyle();
  Desktop.render();
  toast('切换为 ' + (next === 'mac' ? 'macOS' : 'Windows') + ' 风格');
}

/* v3.0 悬浮窗桥接：float-chat.html 通过 window.opener.TZOS 复用完整 AI 对话功能 */
window.TZOS.renderAIChat = function (opts) { return renderAIChat(opts || {}); };
window.TZOS.initChat = function (winId, disableAgent) { initChat(winId, disableAgent); };
window.TZOS.executeAgentCommand = executeAgentCommand;
window.TZOS.executeDelegatedAgentCommand = executeDelegatedAgentCommand;
window.TZOS.ChatSessions = ChatSessions;
window.TZOS.escapeHtml = escapeHtml;
window.TZOS.el = el;
window.TZOS.$ = $;
window.TZOS.$$ = $$;
window.TZOS.toast = toast;
window.TZOS.AI = AI;
window.TZOS.CLI = CLI;
window.TZOS.Store = Store;
window.TZOS.Mem = Mem;
window.TZOS.Shot = Shot;
window.TZOS.SiteAI = SiteAI;
window.TZOS.KnowledgeStore = KnowledgeStore;
window.TZOS.confirmDialog = confirmDialog;
window.TZOS.launchApp = launchApp;
window.TZOS.appendMsg = appendMsg;
window.TZOS.renderPendingChips = renderPendingChips;
window.TZOS.updateChatSendBtn = updateChatSendBtn;
window.TZOS.bindChatScroll = bindChatScroll;
window.TZOS.scrollChatToBottom = scrollChatToBottom;
window.TZOS.updateContextBar = updateContextBar;
window.TZOS.usageText = usageText;
window.TZOS.mergeUsage = mergeUsage;
window.TZOS.syncDeepBtns = syncDeepBtns;
window.TZOS.KATEX_OPTS = KATEX_OPTS;
window.TZOS.ensureKatex = ensureKatex;
window.TZOS.renderMath = renderMath;
window.TZOS.refreshOpenApp = refreshOpenApp;
window.TZOS.initAppHooks = initAppHooks;
window.TZOS.copyText = copyText;
window.TZOS.regenerateMessage = regenerateMessage;
window.TZOS.stopGeneration = stopGeneration;
window.TZOS.isMobile = isMobile;
window.TZOS.getWorkArea = getWorkArea;
window.TZOS.toggleFullscreen = toggleFullscreen;
window.TZOS.toggleStyle = toggleStyle;
window.TZOS.toggleNotifCenter = toggleNotifCenter;
window.TZOS.toggleFloatingChat = toggleFloatingChat;
window.TZOS.uninstallApp = uninstallApp;
window.TZOS.persistOpenWindows = persistOpenWindows;
window.TZOS.restoreOpenWindows = restoreOpenWindows;
window.TZOS.getAllApps = getAllApps;
window.TZOS.findApp = findApp;
window.TZOS.cleanupBrowserHooks = cleanupBrowserHooks;
window.TZOS.initAppHooks = initAppHooks;
window.TZOS.openDialog = openDialog;
window.TZOS.promptDialog = promptDialog;
window.TZOS.confirmDialog = confirmDialog;
window.TZOS.tzOpenInBrowser = tzOpenInBrowser;

/* ===================== 通知中心 ===================== */
let notifCloseTimer = null;
function setNotifCenterOpen(open, restoreFocus = false) {
  const nc = $('#notifCenter');
  const clock = $('#tbClock');
  if (!nc) return;
  clearTimeout(notifCloseTimer);
  notifCloseTimer = null;
  nc.dataset.open = String(open);
  if (open) {
    nc.classList.remove('panel-exit');
    nc.hidden = false;
  } else if (!nc.hidden) {
    nc.classList.add('panel-exit');
    notifCloseTimer = setTimeout(() => {
      if (nc.dataset.open !== 'true') nc.hidden = true;
      nc.classList.remove('panel-exit');
      notifCloseTimer = null;
    }, motionDelay(150));
  }
  if (clock) {
    clock.setAttribute('aria-expanded', String(open));
    clock.setAttribute('aria-label', open ? '关闭通知中心' : '打开通知中心');
    if (restoreFocus) focusSafely(clock);
  }
}
function toggleNotifCenter() {
  const nc = $('#notifCenter');
  if (nc.hidden || nc.dataset.open !== 'true') {
    const notifs = Store.getNotifs();
    nc.innerHTML = notifs.length ? notifs.map(n => `
      <article class="notif"><div class="nf-title${n.iconKey ? ' tz-icon-label' : ''}">${n.iconKey ? uiIconHTML(n.iconKey) : ''}<span>${escapeHtml(n.title)}</span></div><div class="nf-body">${escapeHtml(n.body)}</div><div class="nf-time">${ago(n.time)}</div></article>
    `).join('') : '<div style="padding:30px;text-align:center;color:var(--ink-faint);font-size:13px">暂无通知</div>';
    setNotifCenterOpen(true);
  } else {
    setNotifCenterOpen(false, true);
  }
}

/* ===================== v3.0 AI 悬浮窗 ===================== */
// 独立于 OS 窗口系统之外的浮动 AI 对话
// 桌面版：创建单独的 Electron 窗口（alwaysOnTop）
// 网页版：创建固定定位的覆盖层
let _floatOverlay = null;
let _floatWinId = null;

function toggleFloatingChat() {
  // 桌面版：通过 IPC 在主进程创建/关闭独立窗口
  if (window.tzDesktop && window.tzDesktop.floatChatToggle) {
    window.tzDesktop.floatChatToggle();
    return;
  }
  // 网页版：创建/移除固定覆盖层
  if (_floatOverlay && _floatOverlay.parentNode) {
    if (_floatOverlay.__tzResizeObserver) _floatOverlay.__tzResizeObserver.disconnect();
    _floatOverlay.remove();
    _floatOverlay = null;
    return;
  }
  createFloatOverlay();
}

function createFloatOverlay() {
  // 复用当前页面的 AI 配置和历史
  const aiCfg = Store.getAIConfig();
  _floatOverlay = el('div', 'tz-float-overlay');
  _floatOverlay.id = 'tzFloatOverlay';
  const overlay = _floatOverlay;
  // v3.1：记忆位置与大小（localStorage，下次打开恢复）
  let _fb = null; try { _fb = JSON.parse(localStorage.getItem('tz_float_bounds') || 'null'); } catch (e) {}
  _fb = _fb || {};
  const _hasPos = (_fb.left != null && _fb.top != null);
  Object.assign(_floatOverlay.style, {
    position: 'fixed', zIndex: '2147483640',
    width: _fb.width ? _fb.width + 'px' : '420px', height: _fb.height ? _fb.height + 'px' : '520px', minWidth: '320px', minHeight: '320px',
    left: _hasPos ? _fb.left + 'px' : '', top: _hasPos ? _fb.top + 'px' : '80px',
    right: _hasPos ? 'auto' : '20px',
    backgroundColor: 'transparent', backgroundImage: 'var(--os-surface-layer)', backgroundSize: 'cover', backgroundPosition: 'center', backdropFilter: 'blur(28px) saturate(170%)',
    border: '2px solid rgba(var(--c-violet-rgb),0.45)', borderRadius: '12px',
    boxShadow: '0 8px 40px rgba(var(--c-violet-rgb),0.25), 0 12px 48px rgba(0,0,0,0.5)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    resize: 'both', fontFamily: 'inherit', color: 'var(--ink)',
    animation: 'tzFloatIn 0.22s cubic-bezier(0.16,1,0.3,1)'
  });
  // 保存位置/大小到 localStorage
  const _saveFloatBounds = () => {
    try { localStorage.setItem('tz_float_bounds', JSON.stringify({ left: overlay.offsetLeft, top: overlay.offsetTop, width: overlay.offsetWidth, height: overlay.offsetHeight })); } catch (e) {}
  };

  // 标题栏
  const titleBar = el('div', '');
  Object.assign(titleBar.style, {
    height: '34px', flexShrink: '0', display: 'flex', alignItems: 'center',
    padding: '0 10px', gap: '8px', cursor: 'move',
    backgroundColor: 'transparent', backgroundImage: 'var(--os-surface-layer)', backgroundSize: 'cover', backgroundPosition: 'center top',
    borderBottom: '1px solid rgba(255,255,255,0.08)'
  });
  const titleIcon = el('span', '', uiIconHTML('chat'));
  titleIcon.style.cssText = 'font-size:14px;pointer-events:none';
  const titleText = el('span', '', 'AI 悬浮窗');
  titleText.style.cssText = 'font-size:12px;color:var(--c-violet-soft);flex:1';
  const closeBtn = el('button', '', uiIconHTML('close'));
  closeBtn.style.cssText = 'width:22px;height:22px;border-radius:50%;border:1px solid rgba(255,255,255,.16);background-image:var(--os-button-layer);background-size:cover;color:#fff;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center';
  closeBtn.title = '关闭 AI 悬浮窗';
  closeBtn.setAttribute('aria-label', '关闭 AI 悬浮窗');
  closeBtn.onclick = () => {
    _saveFloatBounds();
    if (overlay.__tzResizeObserver) overlay.__tzResizeObserver.disconnect();
    overlay.remove();
    if (_floatOverlay === overlay) _floatOverlay = null;
  };
  titleBar.append(titleIcon, titleText, closeBtn);

  // 拖拽
  let dragging = false, sx, sy, sl, st;
  titleBar.addEventListener('pointerdown', (e) => {
    if (closeBtn.contains(e.target)) return;
    dragging = true;
    sx = e.clientX; sy = e.clientY;
    sl = overlay.offsetLeft; st = overlay.offsetTop;
    overlay.style.transition = 'none';
    titleBar.setPointerCapture(e.pointerId);
  });
  titleBar.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    overlay.style.left = Math.max(0, sl + (e.clientX - sx)) + 'px';
    overlay.style.top = Math.max(0, st + (e.clientY - sy)) + 'px';
    overlay.style.right = 'auto';
  });
  titleBar.addEventListener('pointerup', () => { dragging = false; overlay.style.transition = ''; _saveFloatBounds(); });

  // 聊天内容区：内嵌 iframe 加载独立对话页
  const chatFrame = el('iframe', '');
  chatFrame.style.cssText = 'flex:1;min-height:0;border:none;background:transparent';
  chatFrame.addEventListener('load', syncFloatOverlayTheme);
  // 网页浮层也复用完整悬浮对话页：多会话标签、能力开关和主对话保持同一套实现。
  chatFrame.src = 'float-chat.html?embedded=1&v=4.1.0';
  overlay.append(titleBar, chatFrame);
  document.body.appendChild(overlay);
  // v3.1：大小变化时保存位置/大小
  try {
    const resizeObserver = new ResizeObserver(() => _saveFloatBounds());
    resizeObserver.observe(overlay);
    overlay.__tzResizeObserver = resizeObserver;
  } catch (e) {}

  // 加载 KaTeX
  const katexCss = document.createElement('link');
  katexCss.rel = 'stylesheet';
  katexCss.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
  document.head.appendChild(katexCss);
}

function getFloatThemeTokens() {
  const paletteId = Store.getPalette();
  const pal = RPG_SKINS[paletteId] || RPG_SKINS.cold;
  const texture = pal.texture || 'cold';
  const light = Store.getTheme() === 'light';
  return {
    paletteId,
    ink: light ? '#17213a' : '#f5f7ff',
    muted: light ? '#53617f' : '#8b94b8',
    tint: light ? 'rgba(242,246,255,.78)' : 'rgba(7,13,30,.76)',
    panel: light ? 'rgba(255,255,255,.58)' : 'rgba(255,255,255,.055)',
    border: `rgba(${pal.rgb[1]},${light ? '.34' : '.24'})`,
    accent: pal.soft[0],
    user: `rgba(${pal.rgb[0]},${light ? '.16' : '.2'})`,
    buttonTint: light ? 'rgba(235,241,255,.28)' : 'rgba(11,18,39,.24)',
    surface: `url("../assets/img/ui-v4/surface-${texture}.webp")`,
    button: `url("../assets/img/ui-v4/button-${texture}.webp")`
  };
}
function applyFloatThemeTokens(root, tokens) {
  if (!root || !tokens) return;
  Object.entries(tokens).forEach(([key, value]) => {
    if (key !== 'paletteId') root.style.setProperty('--float-' + key.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), value);
  });
}
function syncFloatOverlayTheme() {
  if (!_floatOverlay || !_floatOverlay.parentNode) return;
  const frame = _floatOverlay.querySelector('iframe');
  if (!frame || !frame.contentDocument) return;
  applyFloatThemeTokens(frame.contentDocument.documentElement, getFloatThemeTokens());
}

// 构建悬浮窗内的独立对话页面 HTML（精简自 renderAIChat + AI 引擎）
// srcdoc 使用 CSS 变量，跟随当前主题与冷/中/暖配色，无需重载对话。
function buildFloatChatHTML() {
  const ft = getFloatThemeTokens();
  let h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
  ':root{--float-ink:' + ft.ink + ';--float-muted:' + ft.muted + ';--float-tint:' + ft.tint + ';--float-panel:' + ft.panel + ';--float-border:' + ft.border + ';--float-accent:' + ft.accent + ';--float-user:' + ft.user + ';--float-button-tint:' + ft.buttonTint + ';--float-surface:' + ft.surface + ';--float-button:' + ft.button + '}' +
  '*{margin:0;padding:0;box-sizing:border-box}' +
  'body{font-family:"Noto Sans SC","Source Han Sans SC","Microsoft YaHei",system-ui,-apple-system,"Segoe UI",sans-serif;' +
  'color:var(--float-ink);background-image:linear-gradient(var(--float-tint),var(--float-tint)),var(--float-surface);background-size:cover;background-position:center;display:flex;flex-direction:column;height:100%;overflow:hidden}' +
  '.chat-toolbar{display:flex;gap:4px;padding:4px 8px;border-bottom:1px solid var(--float-border);align-items:center;flex-shrink:0}' +
  '.btn{display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:6px;font-size:11px;border:1px solid var(--float-border);cursor:pointer;color:var(--float-muted);background-image:linear-gradient(var(--float-button-tint),var(--float-button-tint)),var(--float-button);background-size:280% 280%;background-position:center}' +
  '.btn:hover{background-position:68% 42%;color:var(--float-ink)}' +
  '.chat-messages{flex:1;overflow-y:auto;padding:10px;min-height:0}' +
  '.chat-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px;color:var(--float-muted)}' +
  '.chat-input-bar{display:flex;gap:6px;padding:6px 8px;border-top:1px solid var(--float-border);align-items:flex-end;flex-shrink:0}' +
  '.textarea{flex:1;background:var(--float-panel);border:1px solid var(--float-border);border-radius:8px;padding:6px 8px;font-size:12px;color:var(--float-ink);resize:none;outline:none;font-family:inherit;min-height:32px;max-height:80px}' +
  '.textarea:focus{border-color:var(--float-accent)}' +
  '.chat-send{width:44px;height:30px;border-radius:8px;border:1px solid var(--float-border);background-image:linear-gradient(var(--float-button-tint),var(--float-button-tint)),var(--float-button);background-size:260% 260%;background-position:center;color:var(--float-ink);cursor:pointer;font-size:11px;flex-shrink:0;display:flex;align-items:center;justify-content:center}' +
  '.msg{margin-bottom:10px;animation:fadeIn .2s ease}' +
  '.msg .role{font-size:11px;color:var(--float-muted);margin-bottom:3px}' +
  '.msg .bubble{font-size:12px;line-height:1.6;padding:8px 10px;border-radius:8px;background:var(--float-panel);white-space:pre-wrap;word-break:break-word}' +
  '.msg.user .bubble{background:var(--float-user)}' +
  '.msg-reasoning{margin-bottom:6px}' +
  '.msg-reasoning summary{font-size:11px;color:var(--float-muted);cursor:pointer}' +
  '.msg-reasoning div{font-size:11px;color:var(--float-muted);line-height:1.5;padding:4px 6px;background:var(--float-panel);border-radius:4px;margin-top:2px;white-space:pre-wrap}' +
  '.stopped-tip{font-size:11px;color:var(--float-accent);margin-top:4px}' +
  '@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}' +
  '::-webkit-scrollbar{width:6px}' +
  '::-webkit-scrollbar-thumb{background:var(--float-border);border-radius:3px}' +
  '</style></head><body>' +
  '<div class="chat-toolbar">' +
  '<span style="font-size:12px;color:var(--float-accent);flex:1">AI 悬浮对话 · 4.1</span>' +
  '<button class="btn" id="btnSync" title="同步最新对话">同步</button>' +
  '<button class="btn" id="btnClear" title="清空对话">清空</button>' +
  '</div>' +
  '<div class="chat-messages" id="chatMsgs"></div>' +
  '<div class="chat-input-bar">' +
  '<textarea class="textarea" id="chatInput" placeholder="输入消息，Enter 发送…" rows="1"></textarea>' +
  '<button class="chat-send" id="chatSend">发送</button>' +
  '</div>' +
  '<script>' +
  '(()=>{' +
  // 优先复用父页面 Store，保证 Store 缓存、多会话和兼容字段同时更新；保留独立存储兜底。
  'var KEY="tzos_state_v1",CHAT_KEY="tzos_chat_state_v3";' +
  'function bridgeStore(){try{return parent&&parent.TZOS&&parent.TZOS.Store||null}catch(e){return null}}' +
  'function stateRead(){try{var raw=localStorage.getItem(CHAT_KEY);if(raw)return JSON.parse(raw)||{};var old=JSON.parse(localStorage.getItem(KEY)||"{}")||{};return{chatSessions:old.chatSessions,activeChatId:old.activeChatId,chatHistory:old.chatHistory,chatCtxRealByChat:old.chatCtxRealByChat}}catch(e){return{}}}' +
  'function stateWrite(s){localStorage.setItem(CHAT_KEY,JSON.stringify(s))}' +
  'function configRead(){try{return JSON.parse(localStorage.getItem(KEY)||"{}")||{}}catch(e){return{}}}' +
  'function load(n,d){var st=bridgeStore();try{if(st&&typeof st.get==="function")return st.get(n,d)}catch(e){}var s=configRead();return s[n]!==undefined?s[n]:d}' +
  'function chatTitle(h){var first=(h||[]).find(function(m){return m&&m.role==="user"&&typeof m.content==="string"});var t=first?first.content.replace(/\\s+/g," ").trim():"";return t?t.slice(0,22):"新对话"}' +
  'function fallbackSnapshot(){var s=stateRead(),dirty=false;var chats=Array.isArray(s.chatSessions)?s.chatSessions.filter(function(c){return c&&c.id&&Array.isArray(c.messages)}):[];' +
  'if(!chats.length){var now=Date.now(),legacy=Array.isArray(s.chatHistory)?s.chatHistory.slice(-100):[];chats=[{id:"chat-legacy-v1",title:chatTitle(legacy),messages:legacy,createdAt:now,updatedAt:now,rev:1}];s.chatSessions=chats;s.activeChatId=chats[0].id;s.chatSchemaVersion=2;dirty=true}' +
  'var visible=chats.filter(function(c){return !c.archivedAt});if(!visible.length){var fresh={id:"chat-"+Date.now().toString(36)+"-fallback",title:"新对话",messages:[],createdAt:Date.now(),updatedAt:Date.now(),rev:1};chats.push(fresh);s.chatSessions=chats;visible=[fresh];dirty=true}' +
  'var chat=visible.find(function(c){return c.id===s.activeChatId});if(!chat){chat=visible[0];s.activeChatId=chat.id;dirty=true}' +
  'var mirror=chat.messages.slice(-100);if(s.chatHistory){delete s.chatHistory;dirty=true}if(dirty)stateWrite(s);' +
  'return{id:chat.id,rev:parseInt(chat.rev,10)||0,messages:mirror}}' +
  'function currentSnapshot(){var st=bridgeStore();try{if(st&&typeof st.getChats==="function"&&typeof st.getActiveChatId==="function"&&typeof st.getChat==="function"){var chats=st.getChats(),id=st.getActiveChatId(),chat=chats.find(function(c){return c.id===id});return{id:id,rev:chat?(parseInt(chat.rev,10)||0):0,messages:(st.getChat(id)||[]).slice(-100)}}}catch(e){}return fallbackSnapshot()}' +
  'function fallbackSave(id,h){var s=stateRead();if(!Array.isArray(s.chatSessions)||!s.chatSessions.length){fallbackSnapshot();s=stateRead()}var chats=s.chatSessions.filter(function(c){return c&&c.id&&Array.isArray(c.messages)}),chat=chats.find(function(c){return c.id===id});if(!chat)return false;' +
  'chat.messages=(Array.isArray(h)?h:[]).slice(-100);if(!chat.title||chat.title==="新对话")chat.title=chatTitle(chat.messages);chat.updatedAt=Date.now();chat.rev=(parseInt(chat.rev,10)||0)+1;s.chatSessions=chats;s.chatSchemaVersion=2;' +
  'var active=chats.find(function(c){return c.id===s.activeChatId&&!c.archivedAt});if(!active){active=chat;s.activeChatId=chat.id}delete s.chatHistory;stateWrite(s);return true}' +
  'function saveHist(id,h){var st=bridgeStore();try{if(st&&typeof st.setChat==="function")return st.setChat(h,id)}catch(e){}return fallbackSave(id,h)}' +
  'var cfg=load("aiConfig",{url:"https://api.deepseek.com/v1/chat/completions",key:"",model:"deepseek-v4-flash"});' +
  // 悬浮窗独立深度思考键（缺省跟随主设置）；API 配置共享
  'var deep=load("float_deepThink", load("deepThink",true));' +
  'var caps=load("aiCaps",{image:true,file:true,webSearch:false,contextLength:0});' +
  'var snapshot=currentSnapshot(),activeChatId=snapshot.id,hist=snapshot.messages;' +
  'var msgs=document.getElementById("chatMsgs");' +
  'var input=document.getElementById("chatInput");' +
  'var abortCtl=null;' +
  // 与 OS 对话窗口同步：比较签名，变化且空闲时重载并重渲染
  'function textHash(v){var s=String(v||""),n=0;for(var i=0;i<s.length;i++)n=((n<<5)-n+s.charCodeAt(i))|0;return n}' +
  'function sig(s,c,d,p){var h=s.messages||[],l=h[h.length-1]||{};return[s.id,s.rev,h.length,l.role||"",textHash(l.content),textHash(l.reasoning),c.url||"",c.model||"",c.maxTokens||"",textHash(c.key),d?1:0,JSON.stringify(p||{})].join("|")}' +
  'var lastSig=sig(snapshot,cfg,deep,caps);' +
  'function syncFromStore(force){if(abortCtl)return;var next=currentSnapshot(),nextCfg=load("aiConfig",cfg),nextDeep=load("float_deepThink",load("deepThink",true)),nextCaps=load("aiCaps",caps);var sg=sig(next,nextCfg,nextDeep,nextCaps);if(!force&&sg===lastSig)return;activeChatId=next.id;hist=next.messages;cfg=nextCfg;deep=nextDeep;caps=nextCaps;lastSig=sg;render()}' +
  'setInterval(function(){if(!document.hidden)syncFromStore(false)},15000);' +
  'window.addEventListener("storage",function(e){if(e.key===KEY||e.key===CHAT_KEY)setTimeout(function(){syncFromStore(false)},40)});' +
  // 渲染历史
  'function render(){msgs.replaceChildren();if(!hist.length){var box=document.createElement("div"),title=document.createElement("div"),hint=document.createElement("div");box.className="chat-empty";title.textContent=cfg.key?"AI 悬浮窗":"未配置 AI";hint.style.fontSize="11px";hint.textContent=cfg.key?(deep?"深度思考已开启":"问我任何问题"):"请在天择OS的 AI 配置中设置 API Key";box.append(title,hint);msgs.appendChild(box);return}hist.forEach(function(m){addMsg(m.role,m.content,m.reasoning)})}' +
  'function addMsg(role,text,reasoning){var d=document.createElement("div");d.className="msg "+(role==="user"?"user":"ai");' +
  'd.innerHTML=(role==="user"?"<div class=\\"role\\">你</div>":"")+' +
  '(reasoning?\'<details class="msg-reasoning"><summary>思考过程</summary><div>\'+esc(reasoning)+\'</div></details>\':"")+' +
  '\'<div class="bubble">\'+(role==="ai"?md(text):esc(text))+\'</div>\';' +
  'msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight}' +
  'function esc(s){return String(s).replace(/[&<>\\x22\\x27]/g,function(c){var n=c.charCodeAt(0);return n===38?"&amp;":n===60?"&lt;":n===62?"&gt;":n===34?"&quot;":"&#39;"})}' +
  'function md(s){var safe=esc(s);return safe.replace(/```(\\w*)\\n?([\\s\\S]*?)```/g,\'<pre style="background:rgba(255,255,255,0.05);padding:8px;border-radius:6px;font-size:11px;overflow-x:auto;margin:4px 0"><code>$2</code></pre>\')' +
  '.replace(/`([^`]+)`/g,\'<code style="background:rgba(255,255,255,0.08);padding:1px 4px;border-radius:3px;font-size:11px">$1</code>\')' +
  '.replace(/\\*\\*([^*]+)\\*\\*/g,\'<b>$1</b>\').replace(/\\*([^*]+)\\*/g,\'<i>$1</i>\')' +
  '.replace(/\\n/g,\'<br>\')}' +
  // 发送消息：参数规则与主 AI 引擎一致，SSE 使用跨网络 chunk 的持久缓冲。
  'function maxTokens(c){var v=parseInt(c&&c.maxTokens,10);return Math.min(384000,v>0?v:8192)}' +
  'function isMiMo(c){return /xiaomimimo\\.com/i.test(String(c&&c.url||""))||/^mimo-v2\\.5(?:-pro)?$/i.test(String(c&&c.model||""))}' +
  'function supportsThinking(c){var model=String(c&&c.model||"").toLowerCase(),url=String(c&&c.url||"");return /deepseek\\.com/i.test(url)&&/^deepseek-v4-(flash|pro)$/.test(model)}' +
  'function requestHeaders(c){var out={"Content-Type":"application/json",Accept:"text/event-stream"};if(isMiMo(c))out["api-key"]=c.key;else out.Authorization="Bearer "+c.key;return out}' +
  'function markSaved(id){var now=currentSnapshot();lastSig=now.id===id?sig(now,cfg,deep,caps):""}' +
  'async function send(){if(abortCtl){abortCtl.abort();return}syncFromStore(true);var t=input.value.trim();if(!t)return;if(!cfg.url||!cfg.key||!cfg.model)return;' +
  'var sendChatId=activeChatId;hist.push({role:"user",content:t});if(!saveHist(sendChatId,hist)){hist.pop();syncFromStore(true);return}markSaved(sendChatId);' +
  'input.value="";input.style.height="auto";addMsg("user",t);' +
  'var aiDiv=document.createElement("div");aiDiv.className="msg ai";' +
  'aiDiv.innerHTML=\'<div class="bubble"><span class="chat-streaming-placeholder">思考中…</span></div>\';msgs.appendChild(aiDiv);' +
  'var bubble=aiDiv.querySelector(".bubble");' +
  'var sys="你是天择 AI 助手，运行在天择OS悬浮窗中。回答简洁有用，使用中文。数学公式用 LaTeX：行内 $...$，块级 $$...$$。悬浮窗不支持命令行模式。";' +
  'var msgs_arr=[{role:"system",content:sys}];' +
  'hist.slice(-12).forEach(function(m){msgs_arr.push({role:m.role==="ai"?"assistant":"user",content:String(m.content||"")})});' +
  'var body={model:cfg.model,messages:msgs_arr,stream:true,temperature:0.7,max_tokens:maxTokens(cfg),stream_options:{include_usage:true}};' +
  'if(isMiMo(cfg)){body.max_completion_tokens=body.max_tokens;delete body.max_tokens}' +
  'if(supportsThinking(cfg)){body.thinking={type:deep?"enabled":"disabled"};if(deep)delete body.temperature}' +
  'if(caps.webSearch){body.tools=[{type:"web_search",max_keyword:3,limit:5,user_location:{type:"approximate",country:"China",city:"合肥"}}];body.tool_choice="auto"}' +
  'try{abortCtl=new AbortController();' +
  'var resp=await fetch(cfg.url,{method:"POST",headers:requestHeaders(cfg),body:JSON.stringify(body),signal:abortCtl.signal});' +
  'if(!resp.ok){var err=await resp.text().catch(function(){return""});throw new Error("AI 接口错误 "+resp.status+(err?"："+err.slice(0,300):""))}' +
  'if(!resp.body)throw new Error("AI 接口未返回可读取的响应内容");' +
  'var reader=resp.body.getReader(),decoder=new TextDecoder(),full="",reasoning="",buffer="",validEvents=0,usage=null,finished=false,paintTimer=0;' +
  'function paintStream(){if(paintTimer)return;paintTimer=setTimeout(function(){paintTimer=0;var rp=reasoning?\'<details class="msg-reasoning" open><summary>思考过程（进行中…）</summary><div>\'+esc(reasoning)+\'</div></details>\':"";bubble.innerHTML=rp+esc(full).replace(/\\n/g,"<br>");msgs.scrollTop=msgs.scrollHeight},72)}' +
  'function consume(flush){var lines=buffer.split(/\\r?\\n/);buffer=flush?"":lines.pop();for(var i=0;i<lines.length;i++){var line=lines[i].trim();if(!line.startsWith("data:"))continue;var data=line.slice(5).trim();if(data==="[DONE]"){finished=true;continue}try{var j=JSON.parse(data);if(j&&j.error)throw new Error(j.error.message||j.error.code||"AI 流式接口返回错误");validEvents++;if(j.usage)usage=j.usage;var choice=j.choices&&j.choices[0],delta=choice&&choice.delta||{},changed=false;if(delta.reasoning_content){reasoning+=delta.reasoning_content;changed=true}if(delta.content){full+=delta.content;changed=true}if(changed)paintStream()}catch(parseErr){if(!(parseErr instanceof SyntaxError))throw parseErr}}}' +
  'while(!finished){var r=await reader.read();if(r.done)break;buffer+=decoder.decode(r.value,{stream:true});consume(false)}' +
  'var tail=decoder.decode();if(tail)buffer+=tail;if(buffer.trim()&&!finished){buffer+="\\n";consume(true)}' +
  'if(!validEvents||(!full&&!reasoning&&!usage))throw new Error("AI 接口未返回兼容的 SSE 对话数据，请检查该模型是否支持流式输出");' +
  'if(paintTimer){clearTimeout(paintTimer);paintTimer=0}if(full||reasoning){hist.push({role:"ai",content:full,reasoning:reasoning});saveHist(sendChatId,hist);markSaved(sendChatId);' +
  'bubble.innerHTML=(reasoning?\'<details class="msg-reasoning"><summary>思考过程</summary><div>\'+esc(reasoning)+\'</div></details>\':"")+md(full)}' +
  'else{bubble.textContent="(空响应)"}' +
  '}catch(e){if(e.name==="AbortError"){bubble.insertAdjacentHTML("beforeend",\'<div class="stopped-tip">已停止生成</div>\')}else{bubble.textContent=e.message}}' +
  'finally{if(paintTimer){clearTimeout(paintTimer);paintTimer=0}abortCtl=null;setTimeout(function(){syncFromStore(false)},0)}}' +
  'input.onkeydown=function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}};' +
  'input.oninput=function(){input.style.height="auto";input.style.height=Math.min(80,input.scrollHeight)+"px"};' +
  'document.getElementById("chatSend").onclick=send;' +
  'document.getElementById("btnClear").onclick=function(){if(abortCtl)return;hist=[];saveHist(activeChatId,hist);markSaved(activeChatId);render()};' +
  'document.getElementById("btnSync").onclick=function(){syncFromStore(true)};' +
  'render();' +
  '})()' +
  '</scr' + 'ipt>' +
  '</body></html>';
  return h;
}

/* ===================== 启动 ===================== */
window.addEventListener('DOMContentLoaded', boot);

// 暴露给 onclick 使用的全局接口
Object.assign(window.TZOS, {
  launchApp, uninstallApp, Store, AI, WM, Desktop, StartMenu, refreshOpenApp, toast,
  toggleFloatingChat: () => toggleFloatingChat(),
  goHome: () => {
    // 桌面版：在 OS 内置浏览器打开天择网首页（不跳出应用）；网页版：返回天择OS 入口页
    if (window.tzDesktop) { tzOpenInBrowser('https://wjtianze.github.io/'); }
    else { window.location.href = 'index.html'; }
  }
});

/* ===================== 桌面应用（Electron）集成 =====================
 * 仅在桌面环境（window.tzDesktop 由 preload.js 注入）生效；网页版
 * window.tzDesktop 不存在，以下全部 no-op，对网页版外观与功能零影响。
 * -----------------------------------------------------------------
 * tzOpenInBrowser(url)：在 OS 内置浏览器打开链接——复用已开浏览器窗口
 *   （浏览器应用非单例，需手动查找已开窗口），没有则新开；initBrowser
 *   就绪后调用其 newTab 在新标签页打开。
 * onOpenUrl：接收主进程转来的链接（外部链接唤起 / setWindowOpenHandler
 *   拦截的 target=_blank / window.open），统一交给 tzOpenInBrowser。 */
function tzOpenInBrowser(url) {
  if (!window.tzDesktop || !url) return;
  try {
    const exist = WM.windows.find(w => w.appId === 'browser');
    if (exist) { WM.focus(exist.id); if (exist.minimized) WM.restore(exist.id); }
    else { launchApp('browser'); }
    let n = 0;
    (function wait() { if (window.__tzBrNewTab) { window.__tzBrNewTab(url); } else if (++n < 120) { setTimeout(wait, 30); } })();
  } catch (e) { /* 忽略 */ }
}
if (window.tzDesktop) {
  window.tzDesktop.onOpenUrl(function (url) { tzOpenInBrowser(url); });
}

})();
