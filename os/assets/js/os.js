/* ============================================================
   天择OS · 核心逻辑
   模块：Storage | Device | Apps | WindowManager
         | Desktop(自由摆放+分类) | Taskbar | StartMenu
         | ContextMenu | FloatingWidget | AIEngine
         | 内置应用（配置/对话/商城/设置/关于）
   ============================================================ */
(function () {
'use strict';

/* 系统版本（每次发布更新必须同步递增，并更新 dev/os/version.json） */
const OS_VERSION = '2.2.0';

/* ===================== 存储层 ===================== */
const Store = {
  KEY: 'tzos_state_v1',
  _cache: null,
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
  // 已安装软件
  getApps() { return this.get('installedApps', []); },
  saveApp(app) { const apps = this.getApps(); apps.push(app); this.set('installedApps', apps); },
  removeApp(id) { const apps = this.getApps().filter(a => a.id !== id); this.set('installedApps', apps); },
  updateApp(id, patch) { const apps = this.getApps(); const i = apps.findIndex(a => a.id === id); if (i < 0) return null; apps[i] = { ...apps[i], ...patch }; this.set('installedApps', apps); return apps[i]; },
  // AI 配置
  getAIConfig() {
    return this.get('aiConfig', { url: 'https://api.deepseek.com/v1/chat/completions', key: '', model: 'deepseek-chat' });
  },
  setAIConfig(cfg) { this.set('aiConfig', cfg); },
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
  // AI 对话历史
  getChat() { return this.get('chatHistory', []); },
  setChat(h) { this.set('chatHistory', h.slice(-100)); },
  // 通知
  getNotifs() { return this.get('notifs', []); },
  addNotif(n) { const ns = this.getNotifs(); ns.unshift({ ...n, time: Date.now() }); this.set('notifs', ns.slice(0, 30)); },
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
  setScreenshotMode(b) { this.set('chatScreenshot', !!b); }
};

/* ===================== 工具函数 ===================== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const fmtTime = (d) => d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
const fmtDate = (d) => `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
const fmtDateTime = (d) => `${fmtDate(d)} ${fmtTime(d)}`;
const ago = (t) => { const s = (Date.now() - t) / 1000; if (s < 60) return '刚刚'; if (s < 3600) return Math.floor(s/60)+'分钟前'; if (s < 86400) return Math.floor(s/3600)+'小时前'; return Math.floor(s/86400)+'天前'; };
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// 移动端判定收窄：仅小屏触控设备才算移动端，避免触摸笔记本被误判为移动端导致窗口全屏
const isMobile = () => {
  const narrow = window.innerWidth < 768;
  const touch = navigator.maxTouchPoints > 1;
  return narrow && touch;
};

// 可用桌面区域（排除天择OS任务栏/Dock）：窗口最大化时限制在此区域内，底部紧贴任务栏上方
function getWorkArea() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const isMac = !isMobile() && Store.getStyle() === 'mac';
  // Windows 风格：底部全宽任务栏 52px；macOS 风格：Dock 52px + 悬浮边距
  const reservedBottom = isMac ? 72 : 52;
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
    name: 'AI 配置', icon: '🔑', grad: true, category: 'system',
    desc: '配置 AI 接口（URL、Key、模型）',
    render: () => renderAIConfig()
  },
  'ai-chat': {
    name: 'AI 对话', icon: '💬', grad: true, category: 'ai',
    desc: '与 AI 助手对话（可多开）',
    render: () => renderAIChat()
  },
  'app-store': {
    name: '软件商城', icon: '🛒', grad: true, category: 'system',
    desc: '用自然语言生成新软件',
    render: () => renderAppStore(),
    singleton: true
  },
  'settings': {
    name: '系统设置', icon: '⚙️', grad: false, category: 'system',
    desc: '桌面风格、存储管理',
    render: () => renderSettings()
  },
  'about': {
    name: '关于天择OS', icon: 'ℹ️', grad: false, category: 'system',
    desc: '系统信息',
    render: () => renderAbout()
  },
  'file-manager': {
    name: '我的软件', icon: '📁', grad: false, category: 'system',
    desc: '管理已安装的软件',
    render: () => renderFileManager()
  },
  'browser': {
    name: '浏览器', icon: '🌐', grad: true, category: 'system',
    desc: '浏览网页',
    render: () => renderBrowser()
  },
  'tips': {
    name: '玩机技巧', icon: '💡', grad: true, category: 'system',
    desc: '系统使用技巧与隐藏功能',
    render: () => renderTips()
  },
  'tz-tree': {
    name: '天择导航', icon: '🌳', grad: true, category: 'tznet',
    desc: '天择网专区树状导航',
    render: () => renderTzTree()
  },
  'terminal': {
    name: '命令行', icon: '⌨️', grad: true, category: 'system',
    desc: '用命令操作天择OS（也供 AI Agent 调用）',
    render: () => renderTerminal()
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
  { id: 'tz-home', name: '天择网', icon: '🌐', grad: true, category: 'tznet', url: TZNET_BASE + 'index.html', desc: '天择网主页' },
  { id: 'tz-news', name: '新闻', icon: '📰', grad: false, category: 'tznet', url: TZNET_BASE + 'news/index.html', desc: '站点新闻' },
  { id: 'tz-blog', name: '博客', icon: '✍️', grad: false, category: 'tznet', url: TZNET_BASE + 'blog/index.html', desc: '博客文章' },
  { id: 'tz-open', name: '数据开源', icon: '🔓', grad: false, category: 'tznet', url: TZNET_BASE + 'open/index.html', desc: '开源数据' },
  { id: 'tz-ai', name: 'AI 专区', icon: '🤖', grad: false, category: 'tznet', url: TZNET_BASE + 'ai/index.html', desc: 'AI 工具' },
  { id: 'tz-coc', name: 'COC 专区', icon: '🛡️', grad: false, category: 'tznet', url: TZNET_BASE + 'coc/index.html', desc: '部落冲突' },
  { id: 'tz-coc-data', name: 'COC 数据', icon: '📊', grad: false, category: 'tznet', url: TZNET_BASE + 'coc/data/index.html', desc: '游戏数据查询' },
  { id: 'tz-coc-village', name: '村庄分析', icon: '🏘️', grad: false, category: 'tznet', url: TZNET_BASE + 'coc/village/index.html', desc: '村庄存档分析' },
  { id: 'tz-coc-planner', name: '升级规划', icon: '📅', grad: false, category: 'tznet', url: TZNET_BASE + 'coc/planner/index.html', desc: '升级规划器' },
  { id: 'tz-coc-dmg', name: '伤害计算', icon: '💥', grad: false, category: 'tznet', url: TZNET_BASE + 'coc/dmg-calc/index.html', desc: '法术伤害计算器' },
  { id: 'tz-game', name: '游戏专区', icon: '🎮', grad: false, category: 'tznet', url: TZNET_BASE + 'game/index.html', desc: '天择网游戏' },
  { id: 'tz-gpa', name: '绩点战争', icon: '⚔️', grad: true, category: 'game', url: TZNET_BASE + 'game/gpa-card/index.html', desc: '卡牌对战游戏' },
  { id: 'tz-en', name: '英语专区', icon: '📖', grad: false, category: 'tznet', url: TZNET_BASE + 'english/index.html', desc: '英语学习' },
  { id: 'tz-words', name: '背单词', icon: '📚', grad: true, category: 'tznet', url: TZNET_BASE + 'english/words/index.html', desc: '四阶段背单词' },
  // 系统模拟器（现代系统的网页高仿真版，均可被 iframe 嵌入；均为界面级模拟，非真实虚拟机）
  { id: 'emu-win', name: 'Windows 11 模拟器', icon: '🪟', grad: true, category: 'emu', url: 'https://win11.blueedge.me/', desc: '浏览器内的 Windows 11 高仿真版（开源 Win11React）' },
  { id: 'emu-win10', name: 'Windows 10 模拟器', icon: '💻', grad: false, category: 'emu', url: 'https://dustinbrett.com/', desc: '浏览器内的 Win10 风格功能桌面（daedalOS）' },
  { id: 'emu-android', name: '安卓模拟器', icon: '🤖', grad: true, category: 'emu', url: 'https://mobilegym.dev/', desc: '浏览器内的现代安卓仿真环境（MobileGym，中科院开源，28 个应用）' }
];

function getAllApps() {
  const installed = Store.getApps().map(a => ({ ...a, type: 'installed', category: a.category || 'tool' }));
  return [...Object.entries(BUILTIN_APPS).map(([id, app]) => ({ id, ...app, type: 'builtin' })),
          ...PRESET_APPS.map(a => ({ ...a, type: 'preset' })),
          ...installed];
}
function findApp(id) { return getAllApps().find(a => a.id === id); }

/* ===================== 窗口管理器 ===================== */
const WM = {
  windows: [],
  zTop: 100,
  openCount: 0,
  create(opts) {
    const app = opts.app;
    // 单例
    if (app.singleton) {
      const exist = this.windows.find(w => w.appId === app.id);
      if (exist) { this.focus(exist.id); if (exist.minimized) this.restore(exist.id); return exist; }
    }
    const mobile = isMobile();
    const id = 'win-' + (++this.openCount);
    const winEl = el('div', 'win' + (mobile ? ' mobile-fullscreen' : ''));
    winEl.id = id;
    winEl.dataset.appId = app.id;

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
    const minBtn = el('button', 'wctrl min', '<svg viewBox="0 0 8 8" fill="none" stroke="#5b3a00" stroke-width="1.5"><path d="M1 4h6"/></svg>');
    minBtn.title = '最小化';
    const maxBtn = el('button', 'wctrl max', '<svg viewBox="0 0 8 8" fill="none" stroke="#003d00" stroke-width="1.5"><path d="M1 1h6v6H1z"/></svg>');
    maxBtn.title = '最大化 / 还原';
    // 刷新/重载按钮（仅 preset/installed 应用显示）
    const reloadBtn = (app.type === 'preset' || app.type === 'installed') ? el('button', 'wctrl reload', '<svg viewBox="0 0 8 8" fill="none" stroke="#003d00" stroke-width="1.3"><path d="M4 1.5a2.5 2.5 0 1 0 2.3 3.5M6.3 2v2h-2"/></svg>') : null;
    if (reloadBtn) reloadBtn.title = '刷新（恢复初始状态）';
    const uninstBtn = app.type === 'installed' ? el('button', 'wctrl uninst', '<svg viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 2l4 4M6 2L2 6"/></svg>') : null;
    if (uninstBtn) { uninstBtn.title = '卸载此软件'; }
    icons.append(closeBtn, minBtn, maxBtn, ...(reloadBtn ? [reloadBtn] : []), ...(uninstBtn ? [uninstBtn] : []));

    const titleIcon = el('span', 'win-title-icon', app.icon || '📦');
    const titleText = el('span', 'win-title-text', escapeHtml(app.name || '应用'));
    const spacer = el('div', 'win-title-spacer');
    // 浏览器应用：标签页栏与窗口标题栏合并（标签显示网页标题）
    if (app.id === 'browser') {
      winEl.classList.add('browser-win');
      titleText.style.display = 'none';
      const tabsWrap = el('div', 'win-tabs');
      tabsWrap.id = 'brTabsTitle';
      title.append(icons, titleIcon, tabsWrap, spacer);
    } else {
      title.append(icons, titleIcon, titleText, spacer);
    }

    const bodyClass = app.id === 'ai-chat' || app.id === 'terminal' ? 'win-body pad app-shell-body' : 'win-body pad';
    const body = el('div', bodyClass);
    const resizers = ['r-nw','r-n','r-ne','r-e','r-se','r-s','r-sw','r-w'];
    const resizerEls = resizers.map(r => { const e = el('div', 'win-resizer ' + r); e.dataset.dir = r; return e; });

    winEl.append(title, body, ...resizerEls);
    $('#windows').appendChild(winEl);

    const winObj = { id, appId: app.id, el: winEl, body, minimized: false, maximized: false, app, savedRect: null };
    this.windows.push(winObj);

    // 渲染内容
    this.renderContent(winObj, opts);

    // 事件
    closeBtn.onclick = (e) => { e.stopPropagation(); this.close(id); };
    minBtn.onclick = (e) => { e.stopPropagation(); this.minimize(id); };
    maxBtn.onclick = (e) => { e.stopPropagation(); this.toggleMax(id); };
    if (reloadBtn) reloadBtn.onclick = (e) => { e.stopPropagation(); this.reload(id); };
    if (uninstBtn) uninstBtn.onclick = (e) => { e.stopPropagation(); uninstallApp(app.id); };
    title.ondblclick = (e) => { if (e.target.closest('.wctrl')) return; if (!isMobile()) this.toggleMax(id); };
    this.bindDrag(winObj);
    this.bindResize(winObj);
    winEl.addEventListener('pointerdown', () => this.focus(id), { passive: true });

    this.focus(id);
    Taskbar.render();
    return winObj;
  },
  renderContent(winObj, opts) {
    const { app, body } = winObj;
    if (app.type === 'preset') {
      body.className = 'win-body no-pad';
      const loading = el('div', 'app-loading', '<div class="al-spin"></div><div>正在加载 ' + escapeHtml(app.name) + '…</div>');
      loading.style.position = 'absolute'; loading.style.inset = '0'; loading.style.zIndex = '2';
      const iframe = el('iframe', 'app-iframe');
      // 非天择网首页的应用加 nochrome=1 隐藏页眉页脚
      iframe.src = (app.id !== 'tz-home' && app.category === 'tznet') ? app.url + (app.url.includes('?') ? '&' : '?') + 'nochrome=1' : app.url;
      iframe.loading = 'lazy';
      // 关键修复：先把 iframe 插入 DOM，浏览器才会真正加载，onload 才会触发
      body.appendChild(iframe);
      body.appendChild(loading);
      iframe.onload = () => { loading.remove(); };
      iframe.onerror = () => { loading.innerHTML = '<div class="app-error"><div class="ae-icon">⚠️</div>加载失败<br/><small>无法连接到 ' + escapeHtml(app.url) + '</small></div>'; };
      setTimeout(() => { if (loading.parentNode) { const sp = loading.querySelector('.al-spin'); if (sp) sp.style.borderTopColor = '#ef4444'; } }, 8000);
    } else if (app.type === 'installed') {
      body.className = 'win-body no-pad';
      const iframe = el('iframe', 'app-iframe');
      iframe.sandbox = 'allow-scripts allow-forms allow-modals allow-popups allow-same-origin';
      iframe.srcdoc = app.html;
      body.appendChild(iframe);
    } else {
      // builtin
      const html = app.render(opts);
      if (typeof html === 'string') { body.innerHTML = html; }
      else if (html instanceof HTMLElement) { body.innerHTML = ''; body.appendChild(html); }
    }
  },
  focus(id) {
    this.windows.forEach(w => { w.el.classList.toggle('focused', w.id === id); });
    const w = this.windows.find(x => x.id === id);
    if (w) { w.el.style.zIndex = ++this.zTop; if (w.minimized) this.restore(id); }
    // 任意窗口被聚焦/操作后，退出"显示桌面"状态
    if (window.__tzDesktopShown) {
      window.__tzDesktopShown = false;
      const sd = document.getElementById('btnShowDesktop');
      if (sd) sd.classList.remove('active');
    }
    Taskbar.render();
  },
  close(id) {
    const idx = this.windows.findIndex(w => w.id === id);
    if (idx < 0) return;
    const w = this.windows[idx];
    w.el.classList.add('closing');
    w.el.style.pointerEvents = 'none';
    setTimeout(() => { w.el.remove(); }, 180);
    this.windows.splice(idx, 1);
    if (w.appId === 'browser') cleanupBrowserHooks();
    Taskbar.render();
    if (w.onClose) w.onClose();
  },
  minimize(id) {
    const w = this.windows.find(x => x.id === id);
    if (!w) return;
    w.minimized = true;
    w.el.classList.add('minimized');
    setTimeout(() => { if (w.minimized) w.el.style.display = 'none'; }, 220);
    Taskbar.render();
  },
  restore(id) {
    const w = this.windows.find(x => x.id === id);
    if (!w) return;
    w.minimized = false;
    w.el.style.display = '';
    w.el.classList.remove('minimized');
    this.focus(id);
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
    this.focus(id);
  },
  // 刷新/重载：恢复应用到初始状态（等同于退出后重新打开）
  reload(id) {
    const w = this.windows.find(x => x.id === id);
    if (!w) return;
    const app = w.app;
    w.body.innerHTML = '';
    if (app.type === 'preset') {
      const iframe = el('iframe', 'app-iframe');
      // 非天择网首页的应用加 nochrome=1 隐藏页眉页脚
      iframe.src = (app.id !== 'tz-home' && app.category === 'tznet') ? app.url + (app.url.includes('?') ? '&' : '?') + 'nochrome=1' : app.url;
      iframe.loading = 'lazy';
      const loading = el('div', 'app-loading', '<div class="al-spin"></div><div>正在重新加载…</div>');
      loading.style.cssText = 'position:absolute;inset:0;z-index:2';
      w.body.appendChild(iframe);
      w.body.appendChild(loading);
      iframe.onload = () => loading.remove();
    } else if (app.type === 'installed') {
      const iframe = el('iframe', 'app-iframe');
      iframe.sandbox = 'allow-scripts allow-forms allow-modals allow-popups allow-same-origin';
      iframe.srcdoc = app.html;
      w.body.appendChild(iframe);
    } else {
      if (app.id === 'browser') cleanupBrowserHooks();
      const html = app.render();
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
      w.el.style.left = Math.max(0, sl + dx) + 'px';
      w.el.style.top = Math.max(0, st + dy) + 'px';
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
        const minWidth = 320, minHeight = 200;
        r.setPointerCapture(e.pointerId);
        const move = (ev) => {
          const dx = ev.clientX - sx, dy = ev.clientY - sy;
          let nw = sw, nh = sh, nl = sl, nt = st;
          if (dir.includes('e')) nw = Math.max(minWidth, sw + dx);
          if (dir.includes('s')) nh = Math.max(minHeight, sh + dy);
          if (dir.includes('w')) { nw = Math.max(minWidth, sw - dx); nl = sl + (sw - nw); }
          if (dir.includes('n')) { nh = Math.max(minHeight, sh - dy); nt = st + (sh - nh); }
          w.el.style.width = nw + 'px'; w.el.style.height = nh + 'px';
          w.el.style.left = nl + 'px'; w.el.style.top = nt + 'px';
        };
        const up = (ev) => { r.releasePointerCapture(ev.pointerId); r.removeEventListener('pointermove', move); r.removeEventListener('pointerup', up); };
        r.addEventListener('pointermove', move);
        r.addEventListener('pointerup', up);
      });
    });
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
    t.innerHTML = `<span class="tb-task-icon">${app.icon || '📦'}</span><span class="tb-task-name">${escapeHtml(app.name)}</span>`;
    t.title = app.name;
    t.onclick = () => {
      if (!w) { launchApp(app.id); return; }
      if (w.minimized) WM.restore(w.id);
      else if (w.el.classList.contains('focused')) WM.minimize(w.id);
      else WM.focus(w.id);
    };
    t.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation(); // 阻止冒泡到 #desktop，避免同时弹出桌面右键菜单
      const items = [];
      const isPinned = Store.getPinned().includes(app.id);
      items.push(isPinned
        ? { icon: '📌', label: '从任务栏取消固定', act: () => { Store.togglePin(app.id); this.render(); } }
        : { icon: '📌', label: '固定到任务栏', act: () => { Store.togglePin(app.id); this.render(); } });
      if (w) items.push({ icon: '✕', label: '关闭窗口', act: () => WM.close(w.id) });
      showCtxMenu(e.clientX, e.clientY, items);
    };
    container.appendChild(t);
  }
};

/* ===================== 开始菜单 ===================== */
const StartMenu = {
  open: false,
  toggle() { this.open ? this.hide() : this.show(); },
  show() {
    this.open = true;
    $('#startMenu').hidden = false;
    $('#btnStart').classList.add('active');
    // 打开时清空搜索框，避免上次残留过滤导致空列表
    const searchInput = $('#startSearch');
    if (searchInput) searchInput.value = '';
    this.render();
    setTimeout(() => $('#startSearch').focus(), 50);
  },
  hide() { this.open = false; $('#startMenu').hidden = true; $('#btnStart').classList.remove('active'); },
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
    apps.forEach(a => { const c = a.category || 'tool'; (groups[c] = groups[c] || []).push(a); });
    Object.values(groups).forEach(list => list.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    CAT_ORDER.forEach(cat => {
      const list = groups[cat];
      if (!list || !list.length) return;
      const head = el('div', 'start-cat', escapeHtml(CAT_LABEL[cat] || '应用'));
      grid.appendChild(head);
      list.forEach(app => {
        const a = el('div', 'start-app');
        a.innerHTML = `<div class="sa-icon${app.grad?' grad':''}">${app.icon||'📦'}</div><div class="sa-name">${escapeHtml(app.name||'应用')}</div>`;
        a.onclick = () => { launchApp(app.id); this.hide(); };
        grid.appendChild(a);
      });
    });
  }
};

/* ===================== 右键菜单 ===================== */
let ctxEl = null;
function showCtxMenu(x, y, items) {
  hideCtxMenu();
  const menu = $('#ctxMenu');
  menu.innerHTML = '';
  items.forEach(it => {
    if (it.sep) { menu.appendChild(el('div', 'ctx-sep')); return; }
    const i = el('div', 'ctx-item', `<span class="ci-icon">${it.icon||''}</span><span>${escapeHtml(it.label)}</span>`);
    i.onclick = () => { hideCtxMenu(); if (it.act) it.act(); };
    menu.appendChild(i);
  });
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
  ctxEl = menu;
}
function hideCtxMenu() { if (ctxEl) { ctxEl.hidden = true; ctxEl = null; } }

/* ===================== 桌面渲染（自由摆放 + 分类整理） ===================== */
const CAT_ORDER = ['system', 'ai', 'tznet', 'emu', 'game', 'tool'];
const CAT_LABEL = { system: '系统', ai: 'AI', tznet: '天择网', emu: '模拟器', game: '游戏', tool: '我的软件' };

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

    // 1) 已保存位置的图标 → 自由摆放在保存坐标
    apps.forEach(app => {
      if (saved[app.id]) {
        const ic = this.makeIcon(app, true);
        ic.style.left = saved[app.id].x + 'px';
        ic.style.top = saved[app.id].y + 'px';
        iconsEl.appendChild(ic);
        placed.add(app.id);
      }
    });

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
    apps.forEach(a => { const c = a.category || 'tool'; (groups[c] = groups[c] || []).push(a); });
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
    ic.innerHTML = `<div class="di-icon${app.grad?' grad':''}">${app.icon||'📦'}${badge}</div><div class="di-label">${escapeHtml(app.name)}</div>`;
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

    ic.onclick = (e) => {
      if (wasDragged) { wasDragged = false; return; }
      e.stopPropagation();
      const now = Date.now();
      if (now - lastTap < 450) return; // 防止双击时第二次点击重复打开
      lastTap = now;
      launchApp(app.id);
    };
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
      const d = el('div', 'dock-app' + (app.grad ? ' grad' : ''), app.icon);
      d.onclick = () => launchApp(id);
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
  },
  placeReopen(reopen, st) {
    if (st.bx != null && st.by != null) { reopen.style.left = st.bx + 'px'; reopen.style.top = st.by + 'px'; reopen.style.bottom = 'auto'; reopen.style.right = 'auto'; }
    else if (st.x != null && st.y != null) { reopen.style.left = st.x + 'px'; reopen.style.top = st.y + 'px'; reopen.style.bottom = 'auto'; reopen.style.right = 'auto'; }
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
  } else if (id === 'tips') {
    defaults.width = 600; defaults.height = 560;
  } else if (id === 'about' || id === 'ai-config' || id === 'settings' || id === 'file-manager') {
    defaults.width = 560; defaults.height = 520;
  }
  return WM.create({ app, ...defaults, ...opts });
}

async function uninstallApp(id) {
  const app = Store.getApps().find(a => a.id === id);
  const name = app ? app.name : '此软件';
  const ok = await confirmDialog({ title: '卸载软件', message: '确定要卸载「' + name + '」吗？\n该软件将从桌面移除。', confirmText: '卸载', danger: true });
  if (!ok) return;
  Store.removeApp(id);
  WM.windows.filter(w => w.appId === id).forEach(w => WM.close(w.id));
  Desktop.render();
  StartMenu.render();
  refreshOpenApp('file-manager');
  toast('已卸载');
}

/* ===================== Toast 通知 ===================== */
function toast(msg, dur = 2600) {
  const t = el('div', '', escapeHtml(msg));
  Object.assign(t.style, {
    position: 'fixed', bottom: '70px', left: '50%', transform: 'translateX(-50%)',
    background: 'var(--glass-strong)', backdropFilter: 'blur(20px)', color: 'var(--ink)',
    padding: '10px 20px', borderRadius: '8px', fontSize: '13px', zIndex: '9999',
    border: '1px solid var(--glass-border)', boxShadow: 'var(--sh-md)', opacity: '0', transition: 'opacity 0.3s, transform 0.3s'
  });
  document.body.appendChild(t);
  requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateX(-50%) translateY(-6px)'; });
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, dur);
}

/* ===================== 自定义对话框（替代原生 confirm/prompt）===================== */
function openDialog(opts) {
  return new Promise((resolve) => {
    const o = Object.assign({ title: '提示', message: '', value: '', placeholder: '', confirmText: '确定', cancelText: '取消', danger: false, input: false, multiline: false }, opts || {});
    const mask = el('div', 'tz-dialog-mask');
    const card = el('div', 'tz-dialog' + (o.danger ? ' danger' : ''));
    const titleEl = el('div', 'tz-dialog-title', escapeHtml(o.title));
    card.appendChild(titleEl);
    if (o.message) {
      const msg = el('div', 'tz-dialog-msg');
      msg.innerHTML = escapeHtml(o.message).replace(/\n/g, '<br>');
      card.appendChild(msg);
    }
    let inputEl = null;
    if (o.input) {
      inputEl = el(o.multiline ? 'textarea' : 'input', 'tz-dialog-input');
      if (o.multiline) inputEl.rows = 3; else inputEl.type = 'text';
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
    if (inputEl) setTimeout(() => { inputEl.focus(); inputEl.select(); }, 60);
    let done = false;
    const onKey = (ev) => {
      if (ev.key === 'Escape') finish(inputEl ? null : false);
      else if (ev.key === 'Enter' && inputEl && !o.multiline) { ev.preventDefault(); finish(inputEl.value); }
    };
    document.addEventListener('keydown', onKey);
    const finish = (val) => {
      if (done) return; done = true;
      document.removeEventListener('keydown', onKey);
      mask.classList.remove('show');
      setTimeout(() => mask.remove(), 200);
      resolve(val);
    };
    confirmBtn.onclick = () => finish(inputEl ? inputEl.value : true);
    cancelBtn.onclick = () => finish(inputEl ? null : false);
    mask.addEventListener('click', (e) => { if (e.target === mask) finish(inputEl ? null : false); });
  });
}
const confirmDialog = (opts) => openDialog({ ...opts, input: false }).then(v => !!v);
const promptDialog = (opts) => openDialog({ ...opts, input: true });

/* ===================== AI 引擎 ===================== */
const AI = {
  // 所有 API 类 AI 功能统一使用「AI 配置」里的通用配置（豆包仅为对话网页嵌入模式，不走 API）。
  // deepThink 时若为 DeepSeek 自动用 reasoner 模型，关闭时切回 chat
  config() {
    let c = { ...Store.getAIConfig() };
    if (/deepseek\.com/i.test(c.url)) {
      if (Store.getDeepThink() && /deepseek-chat/i.test(c.model)) c.model = 'deepseek-reasoner';
      else if (!Store.getDeepThink() && /deepseek-reasoner/i.test(c.model)) c.model = 'deepseek-chat';
    }
    return c;
  },
  isReady() { const c = this.config(); return !!(c.url && c.key && c.model); },
  // 最大输出 token：AI 配置里可自定义 maxTokens，默认 8192
  maxTokens(c, fallback) { const v = parseInt(c.maxTokens, 10); return (v > 0) ? v : (fallback || 8192); },

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
        const response = await window.tzDesktop.requestAI({ id, url: c.url, key: c.key, body }, chunk => {
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
      headers: { 'Content-Type': 'application/json', 'Accept': body.stream ? 'text/event-stream' : 'application/json', 'Authorization': 'Bearer ' + c.key },
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
    const text = await this.request(c, { model: c.model, messages, temperature: opts.temperature ?? 0.7, max_tokens: opts.max_tokens ?? this.maxTokens(c), stream: false }, null, opts.signal);
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('AI 接口返回了无效的 JSON'); }
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('AI 接口响应缺少 choices[0].message');
    return { content: msg.content || '', reasoning: msg.reasoning_content || '', usage: data.usage || null };
  },

  // 流式输出。onChunk(delta, fullContent) 收正文；opts.onReasoning(delta, fullReasoning) 收思考过程
  // 返回 { content, reasoning, usage, finishReason }（usage 来自 stream_options include_usage 的末块）
  async chatStream(messages, onChunk, opts = {}) {
    const c = this.config();
    if (!this.isReady()) throw new Error('AI 未配置，请先在「AI 配置」中设置 URL、Key 和模型。');
    let buf = '', full = '', reasoning = '', finished = false, usage = null, finishReason = null;
    const onReasoning = opts.onReasoning;
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
          if (j.usage) usage = j.usage;
          const choice = j.choices?.[0];
          if (choice && choice.finish_reason) finishReason = choice.finish_reason;
          const delta = choice?.delta || {};
          if (delta.reasoning_content) { reasoning += delta.reasoning_content; if (onReasoning) onReasoning(delta.reasoning_content, reasoning); }
          if (delta.content) { full += delta.content; onChunk(delta.content, full); }
        } catch {}
      }
    };
    await this.request(c, { model: c.model, messages, temperature: opts.temperature ?? 0.7, max_tokens: opts.max_tokens ?? this.maxTokens(c), stream: true, stream_options: { include_usage: true } }, chunk => {
      if (finished) return;
      buf += chunk;
      consume(false);
    }, opts.signal);
    if (buf.trim() && !finished) { buf += '\n'; consume(true); }
    return { content: full, reasoning, usage, finishReason };
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
    const out = await this.chat([{ role: 'system', content: sys }, { role: 'user', content: userPrompt }], { temperature: 0.5, max_tokens: 8192 });
    return (out.content || '').trim();
  },

  // 生成/改进软件的公共提示词片段（含 KaTeX、Markdown、本地存储教程与用户 AI 配置）
  appPromptExtra() {
    const c = this.config();
    const aiCfgText = this.isReady()
      ? `用户的 AI 配置（OpenAI 兼容接口）：
- 接口地址 URL：${c.url}
- API Key：${c.key}
- 模型 Model：${c.model}
当软件需要 AI 功能（如 AI 问答、AI 分析、AI 生成内容）时，直接在代码里用 fetch 调用该接口，示例：
fetch('${c.url}', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ${c.key}' }, body: JSON.stringify({ model: '${c.model}', messages: [{ role: 'user', content: '你好' }] }) }).then(r => r.json()).then(d => console.log(d.choices[0].message.content));
请把 URL、Key、Model 写成代码顶部可修改的常量，方便用户日后更换。`
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

【CDN 使用许可】仅允许引入 KaTeX、marked 这两个库（用上面的 jsdelivr 地址，失败可换 https://cdn.staticfile.org/ 对应路径）；除这两个库与第 C 条的 AI 接口外，不要任何其它外部资源或网络请求（图片用 SVG 或 emoji）。`;
  },

  // 输出被 token 上限截断时自动续写：从截断点继续，不重复已输出内容
  async continueApp(partialCode, onChunk, opts = {}) {
    const sys = `你正在输出一个单文件 HTML 应用的完整代码，上一次输出因长度限制被截断。请直接从截断点继续输出剩余代码：不要重复任何已输出内容，不要解释或寒暄，不要用 markdown 代码块包裹，你的第一个字符就是截断点的下一个字符。`;
    return await this.chatStream([
      { role: 'system', content: sys },
      { role: 'user', content: '已输出内容的结尾如下（仅供定位断点，不要重复输出它）：\n……' + partialCode.slice(-2000) + '\n\n请从断点继续：' }
    ], onChunk, { temperature: 0.7, max_tokens: this.maxTokens(this.config(), 16384), onReasoning: opts.onReasoning, signal: opts.signal });
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
    return await this.chatStream([{ role: 'system', content: sys }, { role: 'user', content: '请生成这个软件。记住：只输出代码，第一个字符必须是 <' }], onChunk, { temperature: 0.7, max_tokens: this.maxTokens(this.config(), 16384), onReasoning: opts.onReasoning, signal: opts.signal });
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

【用户修改需求】
${instruction}

【当前软件完整代码】
${app.html}

请直接输出修改后的完整 HTML 代码（第一个字符必须是 <）：`;
    return await this.chatStream([{ role: 'system', content: sys }, { role: 'user', content: '请按需求修改这个软件。记住：只输出代码，第一个字符必须是 <' }], onChunk, { temperature: 0.6, max_tokens: this.maxTokens(this.config(), 16384), onReasoning: opts.onReasoning, signal: opts.signal });
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
      ], { temperature: 0.2, max_tokens: 400 });
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

/* ===================== 命令行引擎（供终端应用与 AI Agent 调用） ===================== */
const CLI = {
  history: [],
  // 执行一行命令，返回 { ok, out }；out 为文本输出
  exec(line) {
    line = String(line || '').trim();
    if (!line) return { ok: true, out: '' };
    const sp = line.indexOf(' ');
    const cmd = (sp < 0 ? line : line.slice(0, sp)).toLowerCase();
    const rest = sp < 0 ? '' : line.slice(sp + 1).trim();
    const fn = this.cmds[cmd];
    if (!fn) return { ok: false, out: '未知命令：' + cmd + '（输入 help 查看全部命令）' };
    try { return { ok: true, out: String(fn(rest) ?? '') }; }
    catch (e) { return { ok: false, out: '执行出错：' + (e.message || e) }; }
  },
  // 完整教程（终端 help 用）
  manual() {
    return '天择OS 命令行 · 全部命令\n' +
'── 系统 ──\n' +
'  version                     查看系统版本\n' +
'  theme dark|light            切换深色/浅色主题\n' +
'  style win|mac|auto          切换桌面风格\n' +
'  widget open|close           打开/关闭快捷面板\n' +
'  resetlayout                 重置桌面图标布局\n' +
'  export                      导出全量存档\n' +
'── 应用 ──\n' +
'  apps                        列出所有应用（含 id）\n' +
'  open 应用id                 打开应用\n' +
'  close 应用id                关闭应用窗口\n' +
'  install 名称|图标|HTML       安装新软件（三段以 | 分隔）\n' +
'  uninstall 应用id            卸载 AI 软件\n' +
'  rename 应用id|新名[|图标]    重命名软件\n' +
'  sethtml 应用id|HTML          改写软件代码并热更新\n' +
'  gethtml 应用id              查看软件完整 HTML 代码\n' +
'── AI ──\n' +
'  aiconfig                    查看当前 AI 配置\n' +
'  aiconfig url|key|model|maxtokens 值    修改配置\n' +
'  price                       查看 token 单价\n' +
'  price hit|write|input|output 数值      设置单价（每百万 tokens）\n' +
'  price unit usd|cny          设置货币单位\n' +
'  deepthink on|off            深度思考开关\n' +
'  agent on|off                AI 命令行模式开关\n' +
'── 记忆 ──\n' +
'  mem                         列出全部记忆（带编号）\n' +
'  mem add 内容                写入一条记忆\n' +
'  mem del 编号                删除记忆\n' +
'  mem on|off 编号             启用/停用某条记忆\n' +
'── 对话与通知 ──\n' +
'  clear chat                  清空 AI 对话历史\n' +
'  clear notifs                清空通知\n' +
'  clear                       清空本终端屏幕\n' +
'  notify 文本                 发送一条系统通知\n' +
'── 浏览器 ──\n' +
'  bm                          列出收藏夹\n' +
'  bm add 网址 [| 标题]         收藏网址\n' +
'  bm del 编号                 删除收藏\n' +
'── 其他 ──\n' +
'  js 代码                     执行任意 JavaScript（万能兜底，慎用）\n' +
'  echo 文本                   原样输出\n' +
'  help                        显示本教程\n' +
'快捷键：↑/↓ 翻阅历史命令，Enter 执行。';
  },
  // AI 提示词片段（命令行模式开启时注入系统提示词，尽量紧凑以节省 token）
  aiPrompt() {
    return '\n\n【天择OS 命令行能力】你可以输出 tzcli 代码块让操作系统执行命令，格式（每行一条命令）：\n' +
'```tzcli\nopen ai-config\nmem add 用户喜欢简洁的回答\n```\n' +
'可用命令：apps 列出应用id | open/close 应用id | install 名称|图标|完整HTML | uninstall 应用id | rename 应用id|新名[|图标] | sethtml 应用id|完整HTML | gethtml 应用id | aiconfig [url|key|model|maxtokens 值] | price [hit|write|input|output 值] / price unit usd|cny | mem / mem add 内容 / mem del 编号 / mem on|off 编号 | theme dark|light | style win|mac|auto | deepthink on|off | clear chat | notify 文本 | bm / bm add 网址|标题 / bm del 编号 | js JavaScript代码 | version\n' +
'规则：仅在确有必要时使用（普通问答不要用）；命令在你输出后立即执行，结果会以用户消息回传，你再据此继续回答；块内不要写注释和空行；一次不超过 5 条；写记忆、改配置、装改软件等操作优先用命令完成，不要只口头描述。';
  },
  cmds: {
    help: () => CLI.manual(),
    version: () => '天择OS v' + OS_VERSION + ' · ' + (isMobile() ? '移动端' : '桌面端'),
    apps: () => getAllApps().map(a => a.id + '  ' + a.name + '  [' + a.type + ']').join('\n'),
    open: (r) => { need(r, 'open 应用id'); const app = findApp(r); if (!app) throw new Error('应用不存在：' + r); launchApp(r); return '已打开 ' + app.name; },
    close: (r) => { need(r, 'close 应用id'); const ws = WM.windows.filter(w => w.appId === r); if (!ws.length) return '没有该应用的窗口'; ws.forEach(w => WM.close(w.id)); return '已关闭 ' + ws.length + ' 个窗口'; },
    install: (r) => {
      const p = r.split('|').map(s => s.trim());
      if (p.length < 3) throw new Error('用法：install 名称 | 图标 | 完整HTML代码');
      const name = p[0], icon = p[1], html = p.slice(2).join('|');
      if (!name) throw new Error('名称不能为空');
      if (!/<html|<!doctype/i.test(html)) throw new Error('第三段必须是完整 HTML 代码（以 <!DOCTYPE 或 <html 开头）');
      const id = 'app-' + Date.now();
      Store.saveApp({ id, name, icon: icon || '📦', desc: '通过命令行安装', grad: true, html, createdAt: Date.now() });
      Desktop.render(); StartMenu.render();
      return '已安装「' + name + '」（id: ' + id + '）';
    },
    uninstall: (r) => {
      need(r, 'uninstall 应用id');
      const app = Store.getApps().find(a => a.id === r);
      if (!app) throw new Error('未安装该软件（仅 AI 生成的软件可卸载）：' + r);
      Store.removeApp(r);
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
      if (p[2] && /\p{Extended_Pictographic}/u.test(p[2])) patch.icon = p[2];
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
        return '缓存命中 ' + (p.hit || 0) + ' / 缓存写入 ' + (p.write || 0) + ' / 输入 ' + (p.input || 0) + ' / 输出 ' + (p.output || 0) + '（' + (p.unit === 'usd' ? '美元' : '人民币') + '/百万 tokens）';
      }
      const sp = r.indexOf(' '); const k = (sp < 0 ? r : r.slice(0, sp)).toLowerCase(); const v = sp < 0 ? '' : r.slice(sp + 1).trim();
      const c = Store.getAIConfig(); c.prices = c.prices || {};
      if (k === 'unit') { if (v !== 'usd' && v !== 'cny') throw new Error('unit 只能是 usd 或 cny'); c.prices.unit = v; }
      else if (['hit', 'write', 'input', 'output'].includes(k)) { const n = parseFloat(v); if (isNaN(n) || n < 0) throw new Error('价格必须是非负数字'); c.prices[k] = n; }
      else throw new Error('用法：price hit|write|input|output 数值 或 price unit usd|cny');
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
    deepthink: (r) => { const on = parseOnOff(r); Store.setDeepThink(on); syncDeepBtns(); return '深度思考已' + (on ? '开启' : '关闭'); },
    agent: (r) => { const on = parseOnOff(r); Store.setAgentMode(on); refreshOpenApp('settings'); return 'AI 命令行模式已' + (on ? '开启（自动写入记忆已关闭）' : '关闭'); },
    clear: (r) => {
      if (r === 'chat') { Store.setChat([]); refreshOpenApp('ai-chat'); return 'AI 对话历史已清空'; }
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
    resetlayout: () => { Store.clearIconPositions(); Desktop.render(); return '桌面图标布局已重置'; },
    export: () => { window.TZOS.exportArchive(); return '正在导出存档…'; },
    js: (r) => {
      need(r, 'js 代码');
      const ret = (0, eval)(r);
      if (ret === undefined) return '（无返回值）';
      const s = typeof ret === 'object' ? JSON.stringify(ret) : String(ret);
      return String(s).slice(0, 2000);
    },
    echo: (r) => r
  }
};
function need(v, usage) { if (!v) throw new Error('用法：' + usage); }
function parseOnOff(r) {
  const v = String(r || '').toLowerCase();
  if (['on', '开', 'true', '1', '开启'].includes(v)) return true;
  if (['off', '关', 'false', '0', '关闭'].includes(v)) return false;
  throw new Error('参数只能是 on 或 off');
}
function maskKey(k) { if (!k) return '（未设置）'; if (k.length <= 8) return '****'; return k.slice(0, 4) + '…' + k.slice(-4); }

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
        if (Store.getScreenshotMode()) { Store.setScreenshotMode(false); refreshOpenApp('settings'); refreshOpenApp('ai-chat'); toast('屏幕共享已停止，自动截图已关闭'); }
      };
      const v = document.createElement('video');
      v.srcObject = this.stream; v.muted = true;
      await v.play();
      this.video = v;
      return true;
    } catch (e) { this.stop(); return false; }
  },
  // 抓一帧并压缩为 JPEG dataURL（控制宽度以节省 token）
  capture(maxW = 1280) {
    const v = this.video;
    if (!v || !v.videoWidth) return null;
    try {
      const scale = Math.min(1, maxW / v.videoWidth);
      const cv = document.createElement('canvas');
      cv.width = Math.round(v.videoWidth * scale);
      cv.height = Math.round(v.videoHeight * scale);
      cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
      return cv.toDataURL('image/jpeg', 0.7);
    } catch (e) { return null; }
  },
  stop() {
    if (this.stream) { try { this.stream.getTracks().forEach(t => t.stop()); } catch (e) {} }
    this.stream = null; this.video = null;
  }
};

/* ===================== 内置应用：命令行终端 ===================== */
function renderTerminal() {
  return `
  <div class="term-app">
    <div class="term-out" id="termOut"></div>
    <div class="term-input-row"><span class="term-prompt">天择OS ></span><input id="termIn" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="输入命令，help 查看教程…" /></div>
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
  print('天择OS 命令行 v' + OS_VERSION + ' —— 输入 help 查看全部命令教程。', 't-dim');
  print('系统提示：apps 可查看全部应用 id；AI 命令行模式可在「系统设置」中开启。', 't-dim');
  print(' ');
  let hIdx = CLI.history.length;
  inp.onkeydown = (e) => {
    if (e.key === 'Enter') {
      const line = inp.value.trim();
      inp.value = '';
      if (!line) return;
      print('天择OS > ' + line, 't-cmd');
      CLI.history.push(line); hIdx = CLI.history.length;
      const r = CLI.exec(line);
      if (r.out === '__CLEAR__') { out.innerHTML = ''; return; }
      print(r.out || '(完成)', r.ok ? '' : 't-err');
      print(' ');
      scroll();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (hIdx > 0) { hIdx--; inp.value = CLI.history[hIdx] || ''; setTimeout(() => inp.setSelectionRange(inp.value.length, inp.value.length)); }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (hIdx < CLI.history.length) { hIdx++; inp.value = CLI.history[hIdx] || ''; }
    }
  };
  setTimeout(() => inp.focus(), 60);
}

/* ===================== 内置应用：AI 配置 ===================== */
function renderAIConfig() {
  const c = Store.getAIConfig();
  const ready = AI.isReady();
  return `
  <div class="app-config">
    <h2>🔑 AI 配置</h2>
    <p class="sub">配置 OpenAI 兼容的 AI 接口，用于「AI 对话」与「软件商城」</p>
    <div class="config-status ${ready?'ok':'warn'}">
      <span>${ready?'✓':'⚠'}</span><span>${ready?'已就绪：'+escapeHtml(c.model):'尚未配置 API Key'}</span>
    </div>
    <div class="config-presets">
      <div class="preset-chip" data-url="https://api.deepseek.com/v1/chat/completions" data-model="deepseek-chat">DeepSeek</div>
      <div class="preset-chip" data-url="https://api.deepseek.com/v1/chat/completions" data-model="deepseek-reasoner">DeepSeek-R1</div>
      <div class="preset-chip" data-url="https://api.openai.com/v1/chat/completions" data-model="gpt-4o-mini">OpenAI</div>
      <div class="preset-chip" data-url="https://api.siliconflow.cn/v1/chat/completions" data-model="deepseek-ai/DeepSeek-V3">硅基流动</div>
      <div class="preset-chip" data-url="https://open.bigmodel.cn/api/paas/v4/chat/completions" data-model="glm-4-flash">智谱GLM</div>
    </div>
    <div class="field">
      <label>API 接口地址 (URL)</label>
      <input class="input" id="cfgUrl" value="${escapeHtml(c.url)}" placeholder="https://api.deepseek.com/v1/chat/completions" />
    </div>
    <div class="field">
      <label>API Key</label>
      <input class="input" id="cfgKey" type="password" value="${escapeHtml(c.key)}" placeholder="sk-..." />
    </div>
    <div class="field">
      <label>模型名称 (Model)</label>
      <input class="input" id="cfgModel" value="${escapeHtml(c.model)}" placeholder="deepseek-chat" />
    </div>
    <div class="field">
      <label>最大输出 Token（留空默认 8192；生成软件时代码较长，可适当调大，如 16384）</label>
      <input class="input" id="cfgMaxTokens" type="number" min="1024" max="131072" value="${escapeHtml(String(c.maxTokens || ''))}" placeholder="8192" />
    </div>
    <hr style="margin:18px 0;border:none;border-top:1px solid var(--glass-border)" />
    <h3 style="font-size:15px;margin-bottom:4px">💰 Token 单价（选填）</h3>
    <p class="sub" style="margin-bottom:12px">每百万 tokens 的价格，填后每条 AI 消息下的用量统计会自动估算费用；留空则不显示费用。价格以你的服务商页面为准。</p>
    <div class="field">
      <label>货币单位</label>
      <div class="style-pick">
        <button id="priceUnitCny" class="${(c.prices && c.prices.unit === 'usd') ? '' : 'active'}">¥ 人民币</button>
        <button id="priceUnitUsd" class="${(c.prices && c.prices.unit === 'usd') ? 'active' : ''}">$ 美元</button>
      </div>
    </div>
    <div class="price-grid">
      <div class="field"><label>缓存命中</label><input class="input" id="cfgPriceHit" type="number" min="0" step="0.0001" value="${escapeHtml(String((c.prices && c.prices.hit) || ''))}" placeholder="如 0.5" /></div>
      <div class="field"><label>缓存写入</label><input class="input" id="cfgPriceWrite" type="number" min="0" step="0.0001" value="${escapeHtml(String((c.prices && c.prices.write) || ''))}" placeholder="如 1" /></div>
      <div class="field"><label>输入（未命中缓存）</label><input class="input" id="cfgPriceInput" type="number" min="0" step="0.0001" value="${escapeHtml(String((c.prices && c.prices.input) || ''))}" placeholder="如 2" /></div>
      <div class="field"><label>输出</label><input class="input" id="cfgPriceOutput" type="number" min="0" step="0.0001" value="${escapeHtml(String((c.prices && c.prices.output) || ''))}" placeholder="如 8" /></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:18px">
      <button class="btn" onclick="TZOS.saveConfig()">💾 保存配置</button>
      <button class="btn ghost" onclick="TZOS.testConfig()">🧪 测试连接</button>
    </div>
    <p style="margin-top:18px;font-size:11px;color:var(--ink-muted);line-height:1.6">
      你的 Key 只保存在本机 localStorage，不会上传到任何服务器。建议使用 DeepSeek 等国产 API，便宜且快。
    </p>

    <hr style="margin:22px 0;border:none;border-top:1px solid var(--glass-border)" />
    <h3 style="font-size:15px;margin-bottom:8px">🧠 AI 记忆</h3>
    <p class="sub" style="margin-bottom:12px">AI 会记住关于你的事实（如"用户是大学生"），并在对话与生成时参考。可手动增删改，也可让 AI 在回答后自动写入。</p>
    <div class="setting-row" style="border:none;padding:6px 0">
      <div><div class="sr-label" style="font-size:13px">生成后自动写入记忆</div><div class="sr-desc">AI 回答后自动判断有无值得记忆的内容</div></div>
      <div class="toggle ${Store.getMemAuto()?'on':''}" id="memAutoTg"></div>
    </div>
    <div class="setting-row" style="border:none;padding:6px 0">
      <div><div class="sr-label" style="font-size:13px">将记忆注入提示词</div><div class="sr-desc">关闭后所有记忆都不会发给 AI</div></div>
      <div class="toggle ${Store.getMemInject()?'on':''}" id="memInjectTg"></div>
    </div>
    <div id="memList" style="margin-top:8px"></div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <input class="input" id="memNewInput" placeholder="新增一条记忆，如：用户是大学生" style="flex:1" />
      <button class="btn sm" onclick="TZOS.memAdd()">＋ 添加</button>
    </div>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="btn sm ghost" onclick="TZOS.memAll(true)">全选</button>
      <button class="btn sm ghost" onclick="TZOS.memAll(false)">全不选</button>
      <span style="flex:1"></span>
      <span style="font-size:11px;color:var(--ink-muted);align-self:center">勾选 = 该条记忆会注入提示词</span>
    </div>

    <hr style="margin:22px 0;border:none;border-top:1px solid var(--glass-border)" />
    <h3 style="font-size:15px;margin-bottom:4px">🫘 豆包 AI（doubao.com 网页版）</h3>
    <p class="sub" style="margin-bottom:10px">豆包AI 采用 <strong>网页嵌入</strong> 方式接入（非 API Key）。在「AI 对话」顶部点「⚙️ 自定义AI」可一键切换为「🫘 豆包AI」，将在窗口内嵌入 doubao.com 网页版。</p>
    <div class="config-status warn"><span>ℹ</span><span>豆包仅为对话界面的网页嵌入模式；AI 对话 API、软件商城等所有 AI 功能始终使用上方通用配置，与豆包模式互不影响。</span></div>
  </div>`;
}
// AI 记忆条目渲染（配置页内）
function renderMemList() {
  const box = $('#memList');
  if (!box) return;
  const ms = Mem.list();
  if (!ms.length) {
    box.innerHTML = '<div style="color:var(--ink-faint);font-size:12.5px;padding:10px;text-align:center;background:var(--surface);border-radius:8px">暂无记忆。AI 会在对话后自动积累（需开启"自动写入"），也可在下方手动添加。</div>';
    return;
  }
  box.innerHTML = ms.map(m => `
    <div class="mem-row" data-id="${m.id}" style="display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:8px;background:var(--surface);border:1px solid var(--glass-border);margin-bottom:6px">
      <input type="checkbox" class="mem-en" ${m.enabled !== false ? 'checked' : ''} title="是否注入提示词" style="flex-shrink:0;accent-color:var(--c-blue)" />
      <span class="mem-text" style="flex:1;font-size:13px;color:var(--ink-dim);line-height:1.5;word-break:break-all">${escapeHtml(m.text)}</span>
      <button class="btn sm ghost mem-edit" title="修改" style="padding:3px 8px">✏️</button>
      <button class="btn sm ghost mem-del" title="删除" style="padding:3px 8px;border-color:#ef4444;color:#fca5a5">🗑</button>
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
      unit: (usdBtn && usdBtn.classList.contains('active')) ? 'usd' : 'cny'
    }
  };
}
window.TZOS.saveConfig = function() {
  Store.setAIConfig(readConfigForm());
  toast('配置已保存');
  refreshOpenApp('ai-config');
};
window.TZOS.testConfig = async function() {
  Store.setAIConfig(readConfigForm());
  toast('正在测试连接…', 1500);
  try {
    const r = await AI.chat([{role:'user',content:'请回复"OK"'}], { max_tokens: 10 });
    toast('✓ 连接成功：' + (r.content || '').slice(0, 30));
  } catch (e) { toast('✗ ' + e.message.slice(0, 60), 4000); }
};

/* ===================== 内置应用：AI 对话 ===================== */
function renderAIChat() {
  const provider = Store.getProvider();
  // 豆包AI：doubao.com 网页版嵌入（非 API Key 方式）
  if (provider === 'doubao') {
    return `
    <div class="app-chat" id="chatApp" style="background:rgba(5,8,19,0.4)">
      <div class="chat-toolbar" style="display:flex;gap:6px;padding:6px 10px;border-bottom:1px solid var(--glass-border);background:var(--surface);align-items:center">
        <button class="btn sm" id="chatProvider" title="切换回自定义AI">🫘 豆包AI（网页版）</button>
        <span style="flex:1"></span>
        <a class="btn sm ghost" href="https://www.doubao.com/chat" target="_blank" rel="noopener" title="在系统外新标签页打开豆包">↗ 外部打开</a>
      </div>
      <div style="flex:1;position:relative;min-height:0;background:#fff">
        <iframe id="doubaoFrame" style="width:100%;height:100%;border:none;background:#fff" src="https://www.doubao.com/chat/" referrerpolicy="no-referrer"></iframe>
        <div id="doubaoHint" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;text-align:center;padding:24px;color:var(--ink-faint);background:var(--glass-strong)">
          <div style="font-size:38px">🫘</div>
          <div style="font-size:14px;color:var(--ink-dim)">正在加载豆包网页版…</div>
          <div style="font-size:12px;max-width:380px;line-height:1.6">若长时间空白，说明豆包禁止被嵌入（站点安全策略）。可点右上角「↗ 外部打开」在系统浏览器中使用，首次需登录豆包账号。</div>
          <button class="btn sm" onclick="TZOS.openDoubaoExternal()">↗ 在系统外打开豆包</button>
        </div>
      </div>
    </div>`;
  }
  const deep = Store.getDeepThink();
  const shotOn = Store.getScreenshotMode();
  return `
  <div class="app-chat" id="chatApp">
    <div class="chat-toolbar" style="display:flex;gap:6px;padding:6px 10px;border-bottom:1px solid var(--glass-border);background:var(--surface);align-items:center">
      <button class="btn sm ghost" id="chatProvider" title="切换 AI 提供方">⚙️ 自定义AI</button>
      <button class="btn sm ${deep?'':'ghost'} js-deep-btn" id="chatDeep" title="深度思考（显示思考过程）">🧠 深度思考${deep?'·开':'·关'}</button>
      <button class="btn sm ${shotOn?'':'ghost'}" id="chatShot" title="发送消息时自动截取当前屏幕（需视觉模型）">📷 截图${shotOn?'·开':'·关'}</button>
      ${Store.getAgentMode() ? '<span style="font-size:11px;color:var(--c-violet);padding:3px 8px;border:1px dashed var(--c-violet);border-radius:999px;flex-shrink:0" title="AI 可在对话中直接执行命令行命令">⌨️ 命令行模式</span>' : ''}
      <span style="flex:1"></span>
      <button class="btn sm ghost" id="chatClear" title="清空当前对话">🗑</button>
    </div>
    <div class="chat-messages" id="chatMsgs"></div>
    <div class="chat-input-bar">
      <textarea class="textarea" id="chatInput" placeholder="输入消息，Enter 发送，Shift+Enter 换行…" rows="1"></textarea>
      <button class="chat-send" id="chatSend" title="发送">➤</button>
    </div>
  </div>`;
}
function reasoningHtml(reasoning, ongoing) {
  if (!reasoning) return '';
  const tag = ongoing ? '（进行中…）' : '';
  return `<details class="msg-reasoning"${ongoing?' open':''} style="margin-bottom:6px"><summary style="cursor:pointer;color:var(--ink-faint);font-size:12px">🧠 思考过程${tag}</summary><div style="font-size:12px;color:var(--ink-faint);line-height:1.6;padding:6px 8px;background:var(--surface);border-radius:6px;margin-top:4px;white-space:pre-wrap">${escapeHtml(reasoning)}</div></details>`;
}
function initChat() {
  // 豆包网页嵌入模式：只绑定切换按钮 + iframe 加载隐藏提示
  if (Store.getProvider() === 'doubao') {
    const provBtn = $('#chatProvider');
    if (provBtn) provBtn.onclick = () => { Store.setProvider('custom'); toast('已切换为 ⚙️ 自定义AI'); refreshOpenApp('ai-chat'); };
    const f = $('#doubaoFrame');
    const hint = $('#doubaoHint');
    if (f && hint) {
      // iframe 加载成功即隐藏提示（load 事件对跨源 iframe 同样会触发）
      let loaded = false;
      const hide = () => { loaded = true; hint.style.display = 'none'; };
      f.addEventListener('load', hide);
      // 兜底：6 秒后若仍未加载完成，说明豆包可能禁止被嵌入，更新文案引导用户外部打开
      // （不强制重显已隐藏的提示——之前用 contentWindow.length===0 判断"空白"是错的：
      //  正常加载的豆包页面也没有子框架，length 就是 0，会把已隐藏的提示重新显示出来）
      setTimeout(() => {
        if (loaded || !hint.parentNode) return;
        const sub = hint.querySelector('div[style*="14px"]');
        if (sub) sub.textContent = '豆包网页版加载较慢或被禁止嵌入…';
      }, 6000);
    }
    return;
  }
  const msgs = $('#chatMsgs');
  const input = $('#chatInput');
  const sendBtn = $('#chatSend');
  const history = Store.getChat();
  if (!history.length) {
    const ready = AI.isReady();
    msgs.innerHTML = `<div class="chat-empty">
      <div class="ce-icon">💬</div>
      <div class="ce-title">天择 AI 助手</div>
      <div id="chatEmptyHint" style="font-size:12px;max-width:360px">${ready?(Store.getDeepThink()?'深度思考已开启，会显示思考过程。':'问我任何问题，或试试下面的建议'):'请先在「AI 配置」中设置 API Key'}</div>
      <div class="ce-suggest">
        ${ready?['介绍一下你自己','帮我写一首关于夏天的诗','解释一下量子纠缠，给出公式'].map(s=>`<div class="chat-suggest-chip" onclick="TZOS.chatSuggest(this.textContent)">${s}</div>`).join(''):'<div class="chat-suggest-chip" onclick="TZOS.openConfig()">去配置 →</div>'}
      </div>
    </div>`;
  } else {
    history.forEach((m, i) => appendMsg(m.role, m.content, { reasoning: m.reasoning, usage: m.usage, actions: true, index: i }));
  }
  updateChatSendBtn();
  input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } };
  input.oninput = () => { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; };
  sendBtn.onclick = sendChat;
  // 工具栏
  const provBtn = $('#chatProvider');
  if (provBtn) provBtn.onclick = () => {
    const next = Store.getProvider()==='doubao' ? 'custom' : 'doubao';
    Store.setProvider(next);
    toast('已切换为 ' + (next==='doubao'?'🫘 豆包AI':'⚙️ 自定义AI'));
    refreshOpenApp('ai-chat');
  };
  const deepBtn = $('#chatDeep');
  if (deepBtn) deepBtn.onclick = () => {
    Store.setDeepThink(!Store.getDeepThink());
    const d = Store.getDeepThink();
    // 全局同步所有窗口的深度思考按钮（修复多窗口状态不一致导致的"关不掉"）
    syncDeepBtns();
    const eh = $('#chatEmptyHint');
    if (eh && AI.isReady()) eh.textContent = d ? '深度思考已开启，会显示思考过程。' : '问我任何问题，或试试下面的建议';
    toast('深度思考已' + (d ? '开启' : '关闭') + '（仅影响后续回复）');
  };
  // 自动截图开关（需视觉模型；首次开启需授权屏幕共享，选择「此标签页」）
  const shotBtn = $('#chatShot');
  if (shotBtn) shotBtn.onclick = async () => {
    const next = !Store.getScreenshotMode();
    if (next) {
      if (!Shot.supported()) { toast('当前环境不支持屏幕截取'); return; }
      toast('请在弹窗中选择「此标签页」共享天择OS画面', 3600);
      if (!(await Shot.ensure())) { toast('未获得屏幕共享授权，功能未开启', 3000); return; }
    } else {
      Shot.stop();
    }
    Store.setScreenshotMode(next);
    shotBtn.classList.toggle('ghost', !next);
    shotBtn.textContent = '📷 截图' + (next ? '·开' : '·关');
    toast('自动截图已' + (next ? '开启（请确认模型支持视觉）' : '关闭'));
  };
  const clrBtn = $('#chatClear');
  if (clrBtn) clrBtn.onclick = async () => {
    const ok = await confirmDialog({ title: '清空对话', message: '清空当前对话历史？', confirmText: '清空', danger: true });
    if (!ok) return;
    Store.setChat([]);
    refreshOpenApp('ai-chat');
  };
}
// token 用量格式化（缓存命中/缓存写入/普通输入/输出/总量 + 按单价估算费用）
function usageText(u) {
  if (!u) return '';
  const hit = u.prompt_cache_hit_tokens || 0;
  const write = u.cache_creation_input_tokens || u.cache_write_tokens || 0;
  const miss = (u.prompt_cache_miss_tokens != null) ? u.prompt_cache_miss_tokens : Math.max(0, (u.prompt_tokens || 0) - hit);
  const out = u.completion_tokens || 0;
  const total = u.total_tokens || (hit + miss + out);
  return '🔢 缓存命中 ' + hit + ' · 缓存写入 ' + write + ' · 普通输入 ' + miss + ' · 输出 ' + out + ' · 总量 ' + total + usageCostText(u);
}
// 按 AI 配置中的单价（每百万 tokens）估算本条消息费用；未填单价或费用为 0 时不显示
function usageCostText(u) {
  const p = (Store.getAIConfig() || {}).prices || {};
  const rates = { hit: +p.hit || 0, write: +p.write || 0, input: +p.input || 0, output: +p.output || 0 };
  if (!(rates.hit || rates.write || rates.input || rates.output)) return '';
  const hit = u.prompt_cache_hit_tokens || 0;
  const write = u.cache_creation_input_tokens || u.cache_write_tokens || 0;
  const miss = (u.prompt_cache_miss_tokens != null) ? u.prompt_cache_miss_tokens : Math.max(0, (u.prompt_tokens || 0) - hit);
  const out = u.completion_tokens || 0;
  const cost = (hit * rates.hit + write * rates.write + miss * rates.input + out * rates.output) / 1e6;
  if (!(cost > 0)) return '';
  const sym = p.unit === 'usd' ? '$' : '¥';
  const txt = cost >= 0.01 ? cost.toFixed(4) : (cost >= 0.0001 ? cost.toFixed(5) : cost.toExponential(2));
  return ' · 💰 ≈' + sym + txt;
}
function appendMsg(role, content, opts = {}) {
  const msgs = $('#chatMsgs');
  const empty = msgs.querySelector('.chat-empty');
  if (empty) empty.remove();
  const m = el('div', 'msg ' + role);
  const inner = opts.raw ? content : reasoningHtml(opts.reasoning, false) + (role === 'ai' ? renderAiBody(content) : renderMd(content));
  m.innerHTML = `<div class="msg-avatar">${role==='ai'?'🤖':'🧑'}</div><div class="msg-body"><div class="msg-bubble">${inner}</div>` +
    (opts.usage ? `<div class="msg-usage">${escapeHtml(usageText(opts.usage))}</div>` : '') +
    (opts.actions ? `<div class="msg-actions">` +
      '<button class="msg-act" data-act="copy" title="复制这条内容">📋 复制</button>' +
      (role === 'user'
        ? '<button class="msg-act" data-act="edit" title="编辑此消息并重新发送（后续消息将删除）">✏️ 编辑重发</button>'
        : '<button class="msg-act" data-act="regen" title="重新生成回答（此条及后续消息将删除）">⟳ 重新生成</button>') +
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
  msgs.scrollTop = msgs.scrollHeight;
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
  // 4) 转义后按行做块级解析
  const lines = escapeHtml(work).split('\n');
  const inlineFmt = (s) => s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '<em>$1</em>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>');
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
  if (cmdLog.length) {
    html += '<details class="cmd-card" open><summary>执行了 ' + cmdLog.length + ' 条系统命令</summary><div class="cmd-body">' +
      cmdLog.map(c => '<div class="cmd-line">' + escapeHtml(c.cmd) + '</div>' +
        (c.out ? '<div class="cmd-res' + (c.ok ? '' : ' err') + '">' + escapeHtml(String(c.out)) + '</div>' : '<div class="cmd-res">(完成)</div>')
      ).join('') + '</div></details>';
  }
  if (!html && ongoing) html = '';
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
  const d = Store.getDeepThink();
  $$('.js-deep-btn').forEach(b => {
    b.classList.toggle('ghost', !d);
    b.textContent = '🧠 深度思考' + (d ? '·开' : '·关');
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
/* 当前生成的中止控制器（全局唯一，对话共享历史，同时只允许一路生成） */
let chatCtl = null;
/* 停止时被锁定的 bubble / body 引用，用于停止瞬间把"已停止"提示写上去（不依赖 await 链路） */
let chatCtlTarget = null;

function updateChatSendBtn() {
  const sendBtn = $('#chatSend');
  if (!sendBtn) return;
  const busy = !!chatCtl;
  sendBtn.innerHTML = busy ? '⏹' : '➤';
  sendBtn.title = busy ? '停止生成' : '发送';
  sendBtn.classList.toggle('stopping', busy);
}
function stopGeneration() {
  if (!chatCtl) return;
  // 1) 立刻把"⏹ 已停止生成"提示写进 bubble（不等 runGeneration 走完 catch/finally，避免用户看到残留内容"以为没停"）
  try {
    const t = chatCtlTarget;
    if (t && t.bubble) {
      const existing = t.stopped || t.bubble.querySelector('.tz-stopped-tip');
      if (!existing) {
        const tip = el('div', 'tz-stopped-tip', '⏹ 已停止生成');
        tip.style.cssText = 'color:var(--ink-faint);font-size:12px;margin-top:6px';
        t.bubble.appendChild(tip);
        if (t.msgs) t.msgs.scrollTop = t.msgs.scrollHeight;
      }
    }
  } catch (_) {}
  // 2) 中断 AbortController（同步）；listener 链会立即 reject 渲染层 promise 并通知主进程
  try { chatCtl.abort(); } catch (_) {}
  // 3) 即时把按钮变回 ➤（catch/finally 还会再调用一次，但这里先给用户即时反馈）
  chatCtl = null;
  chatCtlTarget = null;
  updateChatSendBtn();
}

// 编辑某条用户消息：内容填入输入框，发送时删除该消息及后续
function startEditMessage(i) {
  if (chatCtl) { toast('正在生成中，请先停止'); return; }
  const history = Store.getChat();
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
  if (chatCtl) { toast('正在生成中，请先停止'); return; }
  const history = Store.getChat();
  if (!history[i] || history[i].role !== 'ai') return;
  let ui = i - 1;
  while (ui >= 0 && history[ui].role !== 'user') ui--;
  if (ui < 0) { toast('找不到对应的用户消息'); return; }
  const userText = history[ui].content;
  history.splice(ui + 1); // 删除该 AI 消息及之后的全部
  Store.setChat(history);
  refreshOpenApp('ai-chat');
  await runGeneration(userText);
}

async function sendChat() {
  const input = $('#chatInput');
  if (chatCtl) { stopGeneration(); return; } // 生成中点击 = 停止
  const text = input.value.trim();
  if (!text) return;
  if (!AI.isReady()) { toast('请先配置 AI'); launchApp('ai-config'); return; }
  const history = Store.getChat();
  // 编辑重发：截断到被编辑消息（含）之前
  if (input.dataset.editIdx !== undefined) {
    const i = parseInt(input.dataset.editIdx, 10);
    delete input.dataset.editIdx;
    if (!isNaN(i) && i >= 0 && i < history.length) {
      history.splice(i);
      Store.setChat(history);
      refreshOpenApp('ai-chat');
    }
  }
  input.value = ''; input.style.height = 'auto';
  history.push({ role: 'user', content: text });
  Store.setChat(history);
  appendMsg('user', text, { actions: true, index: history.length - 1 });
  await runGeneration(text);
}

// 核心生成流程：流式 + 实时公式渲染 + 思考过程 + token 统计 + 命令行 Agent 轮次 + 自动截图 + 记忆
async function runGeneration(userText) {
  const msgs = $('#chatMsgs');
  if (!msgs) return;
  // 进入生成时若已有 chatCtl 残留（异常态），先 abort 并清空，防止多个生成并行
  if (chatCtl) { try { chatCtl.abort(); } catch (_) {} chatCtl = null; chatCtlTarget = null; }
  // 当 reasoning 还没出来时，msg-bubble 不要显示独立的 typing-dots（避免和"思考过程（进行中…）"details 重复成"两个进度条"）。
  // 用户看到的进度指示只有"🧠 思考过程（进行中…）"标题一处，简洁清晰。
  // reasoning 完成后主体才开始 streaming，typing-dots 由初次 renderAiBody 内部统一处理。
  const aiMsg = appendMsg('ai', '<span class="chat-streaming-placeholder">正在等待 AI 首字…</span>', { raw: true });
  const bubble = aiMsg.querySelector('.msg-bubble');
  const bodyEl = aiMsg.querySelector('.msg-body');
  chatCtl = new AbortController();
  chatCtlTarget = { bubble, bodyEl, msgs, stopped: false };
  updateChatSendBtn();
  ensureKatex().catch(() => {});
  const agentOn = Store.getAgentMode();
  const deepOn = Store.getDeepThink();
  let reasoning = '', usage = null, stopped = false;
  const roundTexts = [];
  const cmdLog = [];
  let displayText = '';
  let paintFrame = 0;
  const paint = () => {
    if (paintFrame) return;
    if (chatCtl && chatCtl.signal && chatCtl.signal.aborted) return; // 已停止，不再 paint 新内容
    paintFrame = requestAnimationFrame(() => {
      paintFrame = 0;
      if (chatCtl && chatCtl.signal && chatCtl.signal.aborted) return;
      const reasoningPart = reasoningHtml(reasoning, !!reasoning && !chatCtl?.signal?.aborted);
      // 主体区：reasoning 还在进行时显示"等待首字"占位，reasoning 完成或没开启深度思考时显示实际内容
      let body;
      if (deepOn && !reasoning) {
        body = '<span class="chat-streaming-placeholder">正在等待 AI 思考…</span>';
      } else {
        body = renderAiBody(displayText, cmdLog, !chatCtl?.signal?.aborted);
        if (!body && !chatCtl?.signal?.aborted) body = '<span class="chat-streaming-placeholder">正在等待 AI 首字…</span>';
      }
      bubble.innerHTML = reasoningPart + body;
      // 流式期间实时渲染 LaTeX（已渲染的 .katex 会被 auto-render 自动跳过）
      if (window.renderMathInElement) { try { window.renderMathInElement(bubble, KATEX_OPTS); } catch {} }
      msgs.scrollTop = msgs.scrollHeight;
    });
  };
  // 自动截图（需视觉模型；失败则降级为纯文本）
  let shot = null;
  if (Store.getScreenshotMode() && Shot.supported()) {
    if (await Shot.ensure()) {
      await new Promise(r => setTimeout(r, 150));
      shot = Shot.capture();
    }
    if (!shot) toast('📷 截图失败，本条按纯文本发送', 2800);
  }
  const sysContent = '你是天择 AI 助手，运行在天择OS中。回答简洁有用，使用中文。可写代码（markdown代码块）。数学公式用 LaTeX：行内 $...$，块级 $$...$$。' + Mem.promptSnippet() + (agentOn ? CLI.aiPrompt() : '') +
    (shot ? '\n\n用户开启了屏幕共享，本条消息附带一张当前屏幕截图，请结合截图内容回答。' : '');
  const baseHistory = Store.getChat().slice(-12).map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));
  if (shot && baseHistory.length && baseHistory[baseHistory.length - 1].role === 'user') {
    const last = baseHistory[baseHistory.length - 1];
    baseHistory[baseHistory.length - 1] = { role: 'user', content: [{ type: 'text', text: last.content }, { type: 'image_url', image_url: { url: shot } }] };
  }
  const extra = [];
  try {
    let round = 0;
    while (true) {
      let roundText = '';
      const r = await AI.chatStream(
        [{ role: 'system', content: sysContent }, ...baseHistory, ...extra],
        (delta, all) => { roundText = all; displayText = roundTexts.concat([roundText]).join('\n'); paint(); },
        deepOn ? { onReasoning: (d, allR) => { reasoning = allR; paint(); }, signal: chatCtl.signal } : { signal: chatCtl.signal }
      );
      roundText = r.content || roundText;
      if (deepOn && r.reasoning) reasoning = r.reasoning;
      if (r.usage) usage = mergeUsage(usage, r.usage);
      roundTexts.push(roundText);
      displayText = roundTexts.join('\n');
      if (!agentOn) break;
      const cmds = parseTzcli(roundText);
      if (!cmds.length || round >= 3) break; // 最多 3 轮命令，避免 token 失控
      round++;
      const results = [];
      for (const c of cmds) {
        const res = CLI.exec(c);
        cmdLog.push({ cmd: c, ok: res.ok, out: res.out });
        results.push('$ ' + c + '\n' + (res.out || '(完成)'));
        paint();
      }
      toast('⌨️ AI 执行了 ' + cmds.length + ' 条系统命令', 2400);
      extra.push({ role: 'assistant', content: roundText });
      extra.push({ role: 'user', content: '（系统回执）你请求执行的命令行命令已完成，结果如下：\n' + results.join('\n------\n').slice(0, 4000) + '\n请据此继续回答用户；如无需再执行命令，请直接给出最终回答，不要重复执行同一命令。' });
    }
  } catch (e) {
    if (e && (e.name === 'AbortError' || /已停止/.test(e.message || ''))) {
      stopped = true;
      if (chatCtlTarget) chatCtlTarget.stopped = true;
    } else {
      bubble.innerHTML = `<span style="color:#fca5a5">⚠ ${escapeHtml(e.message)}</span>`;
    }
  } finally {
    if (paintFrame) { cancelAnimationFrame(paintFrame); paintFrame = 0; }
    chatCtl = null;
    chatCtlTarget = null;
    updateChatSendBtn();
  }
  const full = displayText.trim();
  if (!full && !reasoning) {
    // 没有任何内容生成：把"等待中"占位移除，避免在错误或空响应下还显示进度文字
    if (bubble) {
      const ph = bubble.querySelector('.chat-streaming-placeholder');
      if (ph) ph.remove();
    }
    return; // 仅错误信息
  }
  // 完成（含手动停止的部分内容）：定稿渲染 + 入库
  bubble.innerHTML = reasoningHtml(reasoning, false) + renderAiBody(displayText, cmdLog, false) +
    (stopped ? '<div class="tz-stopped-tip" style="color:var(--ink-faint);font-size:12px;margin-top:6px">⏹ 已停止生成</div>' : '');
  if (window.renderMathInElement) { try { window.renderMathInElement(bubble, KATEX_OPTS); } catch {} }
  else renderMath(aiMsg);
  const history = Store.getChat();
  history.push({ role: 'ai', content: full, reasoning, usage });
  Store.setChat(history);
  if (usage) bodyEl.appendChild(el('div', 'msg-usage', escapeHtml(usageText(usage))));
  const acts = el('div', 'msg-actions');
  const idx = history.length - 1;
  acts.innerHTML = '<button class="msg-act" data-act="copy" title="复制这条内容">📋 复制</button><button class="msg-act" data-act="regen" title="重新生成回答（此条及后续消息将删除）">⟳ 重新生成</button>';
  acts.querySelector('[data-act="copy"]').onclick = () => copyText(full);
  acts.querySelector('[data-act="regen"]').onclick = () => regenerateMessage(idx);
  bodyEl.appendChild(acts);
  msgs.scrollTop = msgs.scrollHeight;
  if (!stopped && full && !agentOn) Mem.autoLearn(userText, full);
}
window.TZOS.chatSuggest = function(t) { const i = $('#chatInput'); if (i) { i.value = t; sendChat(); } };
window.TZOS.openConfig = function() { launchApp('ai-config'); };
window.TZOS.openDoubaoExternal = function() { window.open('https://www.doubao.com/chat/', '_blank'); };

/* ===================== 内置应用：软件商城 ===================== */
function renderAppStore() {
  const installed = Store.getApps();
  const deep = Store.getDeepThink();
  return `
  <div class="app-store">
    <div class="store-header">
      <h2>🛒 软件商城</h2>
      <p>用一句话描述你想要的软件，AI 会为你生成并安装</p>
    </div>
    <div class="store-form">
      <input class="input" id="storePrompt" placeholder="例如：一个贪吃蛇游戏 / 一个番茄钟计时器 / 一个markdown笔记…" />
      <button class="btn sm ${deep?'':'ghost'} js-deep-btn" id="storeDeep" title="深度思考（用推理模型生成更严谨的代码，速度较慢）">🧠 深度思考${deep?'·开':'·关'}</button>
      <button class="btn" id="storeGen" onclick="TZOS.startGen()">✨ 生成</button>
    </div>
    <div class="store-step" id="storeSteps" style="display:none">
      <div class="store-step-label"><span class="step-dot">1</span><span id="step1Label">智能优化提示词…</span></div>
      <div class="store-prompt-box" id="refinedBox"></div>
      <details class="msg-reasoning" id="storeReasonBox" style="display:none;margin-top:10px"><summary style="cursor:pointer;color:var(--ink-faint);font-size:12px">🧠 思考过程</summary><div id="storeReasonBody" style="font-size:12px;color:var(--ink-faint);line-height:1.6;padding:6px 8px;background:var(--surface);border-radius:6px;margin-top:4px;white-space:pre-wrap;max-height:160px;overflow-y:auto"></div></details>
      <div class="store-step-label" style="margin-top:14px"><span class="step-dot">2</span><span id="step2Label">生成软件代码…</span></div>
      <div class="store-prompt-box" id="codeProgress" style="font-family:monospace;font-size:11px;max-height:120px;color:var(--ink-muted)"></div>
    </div>
    <div class="store-installed">
      <h3>📦 已安装的 AI 软件 (${installed.length})</h3>
      <div class="store-installed-list" id="installedList"></div>
    </div>
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
  if (!apps.length) { list.innerHTML = '<div style="color:var(--ink-faint);font-size:13px;text-align:center;padding:20px">还没有安装 AI 生成的软件<br/>在上方输入提示词开始创建</div>'; return; }
  list.innerHTML = apps.map(a => `
    <div class="store-installed-item">
      <div class="sii-icon">${a.icon||'📦'}</div>
      <div class="sii-info"><div class="sii-name">${escapeHtml(a.name)}</div><div class="sii-meta">${ago(a.createdAt)} · ${escapeHtml(a.desc||'')}</div></div>
      <button class="btn sm" onclick="TZOS.openInstalled('${a.id}')">打开</button>
      <button class="btn sm ghost" onclick="TZOS.renameApp('${a.id}')">重命名</button>
      <button class="btn sm ghost" onclick="TZOS.fixApp('${a.id}')">AI改进</button>
      <button class="btn sm ghost" style="border-color:#ef4444;color:#fca5a5" onclick="TZOS.uninstall('${a.id}')">卸载</button>
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
    $('#refinedBox').innerHTML = escapeHtml(spec).replace(/\|/g, '<br><span class="opt">▸ </span>');
    $('#step2Label').textContent = '生成软件代码…（模型 ' + AI.config().model + '）';
    $('#codeProgress').innerHTML = '<div style="color:var(--ink-faint);margin-bottom:4px">开始生成代码…</div>';
    let code = '';
    const showStream = (all, conts) => {
      const tail = all.length > 1600 ? all.slice(-1600) : all;
      $('#codeProgress').innerHTML = '<div style="color:var(--c-blue);margin-bottom:4px">⌨ 生成中… ' + all.length + ' 字符' + (conts ? '（续写第 ' + conts + ' 次）' : '') + '</div><pre style="white-space:pre-wrap;word-break:break-all;margin:0">' + escapeHtml(tail) + '</pre>';
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
    $('#codeProgress').innerHTML = '<div style="color:var(--c-emerald)">✓ 生成完成，共 ' + code.length + ' 字符</div>';
    const parts = spec.split('|').map(s => s.trim());
    const nameMatch = parts[0] || '新软件';
    const iconRaw = parts[1] || '';
    const iconMatch = (iconRaw && /\p{Extended_Pictographic}/u.test(iconRaw)) ? iconRaw : '📦';
    const descMatch = parts[2] || prompt;
    const appId = 'app-' + Date.now();
    Store.saveApp({
      id: appId, name: nameMatch, desc: descMatch, icon: iconMatch, grad: true,
      html: code, prompt, spec, createdAt: Date.now()
    });
    Desktop.render();
    StartMenu.render();
    refreshInstalledList();
    toast('✓ ' + nameMatch + ' 已安装到桌面');
    input.value = '';
    Mem.autoLearn('生成软件：' + prompt, nameMatch + ' - ' + descMatch);
    setTimeout(() => launchApp(appId), 400);
  } catch (e) {
    $('#codeProgress').innerHTML = '<span style="color:#fca5a5">✗ ' + escapeHtml(e.message) + '</span>';
    toast('生成失败：' + e.message.slice(0, 40), 4000);
  } finally {
    genBtn.disabled = false; genBtn.textContent = '✨ 生成';
  }
};
window.TZOS.openInstalled = function(id) { launchApp(id); };
window.TZOS.uninstall = function(id) { uninstallApp(id); refreshInstalledList(); };
window.TZOS.clearChat = async function() {
  const ok = await confirmDialog({ title: '清空对话', message: '确定清空所有 AI 对话记录？', confirmText: '清空', danger: true });
  if (!ok) return;
  Store.setChat([]); toast('已清空');
};
window.TZOS.renameApp = async function(id) {
  const app = Store.getApps().find(a => a.id === id);
  if (!app) return;
  const name = await promptDialog({ title: '重命名软件', message: '软件名称：', value: app.name || '', placeholder: '输入新名称', confirmText: '下一步' });
  if (name === null) return;
  const icon = await promptDialog({ title: '更换图标', message: '输入一个 emoji 作为图标：', value: app.icon || '📦', placeholder: '🎮 / 📝 / ⏰ …', confirmText: '保存' });
  if (icon === null) return;
  const patch = {};
  const n = (name || '').trim(); if (n) patch.name = n;
  const ic = (icon || '').trim();
  if (ic && /\p{Extended_Pictographic}/u.test(ic)) patch.icon = ic;
  if (!patch.name && !patch.icon) { toast('未修改'); return; }
  Store.updateApp(id, patch);
  Desktop.render(); StartMenu.render(); refreshInstalledList(); refreshOpenApp('file-manager');
  WM.windows.filter(w => w.appId === id).forEach(w => {
    if (patch.icon) { const ti = w.el.querySelector('.win-title-icon'); if (ti) ti.textContent = patch.icon; }
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
  card.innerHTML = '<div class="tz-dialog-title">🔧 正在改进「' + escapeHtml(app.name) + '」</div><div class="tz-dialog-msg" id="fixStatus" style="margin-bottom:8px">⌨ AI 正在修改代码…（模型 ' + escapeHtml(AI.config().model) + '）</div><details class="msg-reasoning" id="fixReasonBox" style="display:none;margin-bottom:6px"><summary style="cursor:pointer;color:var(--ink-faint);font-size:12px">🧠 思考过程</summary><div id="fixReasonBody" style="font-size:12px;color:var(--ink-faint);line-height:1.6;padding:6px 8px;background:var(--surface);border-radius:6px;margin-top:4px;white-space:pre-wrap;max-height:140px;overflow-y:auto"></div></details><div id="fixCode" style="max-height:220px;overflow:auto;font-family:monospace;font-size:11px;white-space:pre-wrap;word-break:break-all;color:var(--ink-muted);background:rgba(0,0,0,0.25);border-radius:8px;padding:10px;margin-bottom:4px"></div>';
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
      fixStatus.textContent = '⌨ 代码过长，自动续写中…（第 ' + conts + ' 次）';
      let part = '';
      result = await AI.continueApp(code, (delta, all) => { part = all; showTail(code + all); }, { onReasoning });
      code += (result && result.content) || part;
    }
    code = AI.cleanAppCode(code);
    if (!code.includes('<!DOCTYPE') && !code.includes('<html')) throw new Error('生成失败，请重试');
    Store.updateApp(id, { html: code });
    WM.windows.filter(w => w.appId === id).forEach(w => WM.reload(w.id));
    Desktop.render(); StartMenu.render(); refreshInstalledList(); refreshOpenApp('file-manager');
    fixStatus.innerHTML = '<span style="color:var(--c-emerald,#10b981)">✓ 改进完成，共 ' + code.length + ' 字符</span>';
    toast('✓ ' + app.name + ' 已更新');
    setTimeout(close, 1300);
  } catch (e) {
    fixStatus.innerHTML = '<span style="color:#fca5a5">✗ ' + escapeHtml(e.message) + '</span>';
    toast('改进失败：' + e.message.slice(0, 40), 4000);
    setTimeout(close, 2600);
  }
};

/* ===================== 内置应用：系统设置 ===================== */
function renderSettings() {
  const style = Store.getStyle();
  const theme = Store.getTheme();
  return `
  <div class="settings-panel">
    <h2>⚙️ 系统设置</h2>
    <div class="setting-row">
      <div><div class="sr-label">界面主题</div><div class="sr-desc">切换深色 / 浅色界面</div></div>
      <div class="style-pick">
        <button class="${theme==='dark'?'active':''}" onclick="TZOS.setTheme('dark')">🌙 深色</button>
        <button class="${theme==='light'?'active':''}" onclick="TZOS.setTheme('light')">☀️ 浅色</button>
      </div>
    </div>
    <div class="setting-row">
      <div><div class="sr-label">系统版本</div><div class="sr-desc">当前 v${OS_VERSION} · 启动时自动检查更新</div></div>
      <button class="btn sm" id="btnCheckUpdate">🔄 检查更新</button>
    </div>
    <div class="setting-row" id="updateRow" style="display:none">
      <div><div class="sr-label" style="color:var(--c-emerald)">发现新版本 <span id="updateVer"></span></div><div class="sr-desc">线上已发布更新，点击获取最新版本</div></div>
      <button class="btn sm" id="btnDoUpdate">⬆ 立即更新</button>
    </div>
    <div class="setting-row">
      <div><div class="sr-label">桌面风格</div><div class="sr-desc">PC 端可切换 Windows / macOS 风格</div></div>
      <div class="style-pick">
        <button class="${!style?'active':''}" onclick="TZOS.setStyle('')">自动</button>
        <button class="${style==='win'?'active':''}" onclick="TZOS.setStyle('win')">Windows</button>
        <button class="${style==='mac'?'active':''}" onclick="TZOS.setStyle('mac')">macOS</button>
      </div>
    </div>
    <div class="setting-row">
      <div><div class="sr-label">桌面图标布局</div><div class="sr-desc">重置所有图标到分类默认位置</div></div>
      <button class="btn sm ghost" onclick="TZOS.Desktop.resetLayout()">重置布局</button>
    </div>
    <div class="setting-row">
      <div><div class="sr-label">刷新桌面</div><div class="sr-desc">重新加载所有图标</div></div>
      <button class="btn sm" onclick="TZOS.Desktop.render();TZOS.StartMenu.render();TZOS.toast('已刷新')">刷新</button>
    </div>
    <div class="setting-row">
      <div><div class="sr-label">关闭所有窗口</div><div class="sr-desc">清理桌面</div></div>
      <button class="btn sm ghost" onclick="TZOS.WM.closeAll()">关闭全部</button>
    </div>
    <div class="setting-row">
      <div><div class="sr-label">清空对话历史</div><div class="sr-desc">删除所有 AI 对话记录</div></div>
      <button class="btn sm ghost" onclick="TZOS.clearChat()">清空</button>
    </div>
    <div class="setting-row">
      <div><div class="sr-label">清空通知</div><div class="sr-desc">删除所有通知</div></div>
      <button class="btn sm ghost" onclick="TZOS.Store.clearNotifs();TZOS.toast('已清空')">清空</button>
    </div>
    <div class="setting-row">
      <div><div class="sr-label">AI 命令行模式（Agent）</div><div class="sr-desc">开启后 AI 对话可直接执行命令行命令（装/改/卸软件、改配置、写记忆等），消耗大量 token；开启期间「生成后自动写入记忆」自动关闭，由命令行接管</div></div>
      <div class="toggle ${Store.getAgentMode()?'on':''}" id="agentModeTg"></div>
    </div>
    <div class="setting-row">
      <div><div class="sr-label">发送时自动截图</div><div class="sr-desc">每次向 AI 发送消息时自动截取当前屏幕一并发送（需视觉模型，纯文本模型会浪费 token 甚至报错）；首次开启需授权屏幕共享</div></div>
      <div class="toggle ${Store.getScreenshotMode()?'on':''}" id="shotModeTg"></div>
    </div>
    ${window.tzDesktop ? `<div class="setting-row">
      <div><div class="sr-label">设为默认浏览器</div><div class="sr-desc">外部链接自动在天择OS 内打开（需在系统设置确认）</div></div>
      <button class="btn sm" onclick="TZOS.setDefaultBrowser()">设置</button>
    </div>` : ''}
    <div class="setting-row">
      <div><div class="sr-label">存储用量</div><div class="sr-desc" id="storageInfo">计算中…</div></div>
    </div>
    <div class="setting-row">
      <div><div class="sr-label">存档管理</div><div class="sr-desc">导出/恢复本机全部数据：AI 配置、系统设置、已装软件、对话历史、图标布局、收藏夹、AI 记忆、背单词等天择网各应用数据（localStorage + IndexedDB）</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn sm" onclick="TZOS.exportArchive()">📦 导出存档</button>
        <button class="btn sm" onclick="document.getElementById('archiveInput').click()">📥 导入存档</button>
        <input type="file" id="archiveInput" accept="application/json,.json" style="display:none" onchange="TZOS.importArchive(this)">
      </div>
    </div>
    <div class="setting-row">
      <div><div class="sr-label" style="color:#fca5a5">重置天择OS</div><div class="sr-desc">清除所有本地数据并重启</div></div>
      <button class="btn sm" style="background:#ef4444" onclick="TZOS.reset()">重置</button>
    </div>
  </div>`;
}
function initSettings() {
  const si = $('#storageInfo');
  if (si) {
    let total = 0;
    for (let k in localStorage) { if (localStorage.hasOwnProperty(k)) total += (localStorage[k]||'').length; }
    si.textContent = (total / 1024).toFixed(1) + ' KB（' + Store.getApps().length + ' 个已装软件）';
  }
  const chk = $('#btnCheckUpdate');
  if (chk) chk.onclick = () => Updater.check(true);
  const doUp = $('#btnDoUpdate');
  if (doUp) doUp.onclick = () => Updater.apply();
  // AI 命令行模式（Agent）开关
  const ag = $('#agentModeTg');
  if (ag) ag.onclick = () => {
    const next = !Store.getAgentMode();
    Store.setAgentMode(next);
    ag.classList.toggle('on', next);
    toast('AI 命令行模式已' + (next ? '开启（自动写入记忆已交给命令行）' : '关闭'), 3200);
    refreshOpenApp('ai-config');
    refreshOpenApp('ai-chat');
  };
  // 自动截图开关（首次开启需授权屏幕共享）
  const st = $('#shotModeTg');
  if (st) st.onclick = async () => {
    const next = !Store.getScreenshotMode();
    if (next) {
      if (!Shot.supported()) { toast('当前环境不支持屏幕截取'); return; }
      toast('请在弹窗中选择「此标签页」共享天择OS画面', 3600);
      if (!(await Shot.ensure())) { toast('未获得屏幕共享授权，功能未开启', 3000); return; }
    } else {
      Shot.stop();
    }
    Store.setScreenshotMode(next);
    st.classList.toggle('on', next);
    refreshOpenApp('ai-chat');
    toast('自动截图已' + (next ? '开启（请确认模型支持视觉）' : '关闭'));
  };
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
  document.body.classList.toggle('light', Store.getTheme() === 'light');
}

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
        Store.addNotif({ title: '天择OS 有新版本 v' + remote, body: '当前 v' + OS_VERSION + '。前往「系统设置 → 系统版本」点击「立即更新」。' });
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
  try { localStorage.clear(); } catch (e) {}
  try {
    if (indexedDB.databases) {
      const dbs = await indexedDB.databases();
      await Promise.all(dbs.map(d => new Promise(res => {
        const del = indexedDB.deleteDatabase(d.name);
        del.onsuccess = del.onerror = del.onblocked = () => res();
      })));
    }
  } catch (e) {}
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
async function dumpIndexedDBs() {
  const out = {};
  if (!('indexedDB' in window) || !indexedDB.databases) return out; // 老浏览器无 databases() 则跳过
  let dbs = [];
  try { dbs = await indexedDB.databases(); } catch (e) { return out; }
  for (const info of dbs) {
    const name = info && info.name;
    if (!name) continue;
    try {
      out[name] = await new Promise((resolve) => {
        const req = indexedDB.open(name);
        req.onsuccess = () => {
          const db = req.result;
          const storeNames = [...db.objectStoreNames];
          const result = { version: db.version, stores: {} };
          if (!storeNames.length) { db.close(); resolve(result); return; }
          let pending = storeNames.length;
          const tx = db.transaction(storeNames, 'readonly');
          storeNames.forEach(sn => {
            const rq = tx.objectStore(sn).getAll();
            rq.onsuccess = () => { result.stores[sn] = rq.result; if (--pending === 0) { db.close(); resolve(result); } };
            rq.onerror = () => { if (--pending === 0) { db.close(); resolve(result); } };
          });
        };
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
    try {
      // 先删旧库再按存档结构重建，保证 objectStore 结构一致
      await new Promise(res => {
        const del = indexedDB.deleteDatabase(name);
        del.onsuccess = del.onerror = del.onblocked = () => res();
      });
      await new Promise((resolve) => {
        const req = indexedDB.open(name, dump.version || 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          Object.keys(dump.stores).forEach(sn => {
            if (!db.objectStoreNames.contains(sn)) db.createObjectStore(sn, { keyPath: 'k' });
          });
        };
        req.onsuccess = () => {
          const db = req.result;
          const stores = Object.keys(dump.stores).filter(sn => [...db.objectStoreNames].includes(sn));
          if (!stores.length) { db.close(); resolve(); return; }
          const tx = db.transaction(stores, 'readwrite');
          stores.forEach(sn => {
            const st = tx.objectStore(sn);
            (dump.stores[sn] || []).forEach(rec => { try { st.put(rec); } catch (e) {} });
          });
          tx.oncomplete = tx.onerror = () => { db.close(); resolve(); };
        };
        req.onerror = () => resolve();
      });
    } catch (e) {}
  }
}
// 存档导出：本机全部数据（localStorage 全量 + IndexedDB 全库）打包下载
window.TZOS.exportArchive = async function() {
  try {
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
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tianze-os-archive-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    toast('存档已导出（localStorage ' + Object.keys(ls).length + ' 项 + IndexedDB ' + Object.keys(idb).length + ' 库）', 3600);
  } catch (e) { toast('导出失败：' + (e.message || e), 4000); }
};
// 存档导入：全量覆盖本机数据后重载（兼容 v1 老存档）
window.TZOS.importArchive = async function(input) {
  const file = input && input.files && input.files[0];
  try { input.value = ''; } catch (_) {}
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || data.__archive !== 'tianze-os') throw new Error('存档格式不正确');
    const isV2 = data.version >= 2 && data.localStorage && typeof data.localStorage === 'object';
    if (!isV2 && (!data.state || typeof data.state !== 'object')) throw new Error('存档格式不正确');
    const ok = await confirmDialog({ title: '导入存档', message: '将用存档内容【完全覆盖】本机当前所有数据（AI 配置、系统设置、已装软件、对话历史、各应用数据等），并重新加载。确定继续吗？', confirmText: '导入并覆盖', danger: true });
    if (!ok) return;
    if (isV2) {
      localStorage.clear();
      Object.keys(data.localStorage).forEach(k => {
        try { localStorage.setItem(k, data.localStorage[k]); } catch (e) {}
      });
      await restoreIndexedDBs(data.indexedDB);
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
  <div style="padding:30px;text-align:center">
    <div style="width:72px;height:72px;margin:0 auto 18px;border-radius:18px;background:var(--grad-main);display:flex;align-items:center;justify-content:center;font-size:38px">🖥️</div>
    <h2 style="font-size:22px;background:var(--grad-main);-webkit-background-clip:text;background-clip:text;color:transparent">天择OS</h2>
    <p style="color:var(--ink-faint);font-size:13px;margin-top:6px">v${OS_VERSION} · 浏览器内全屏操作系统</p>
    <p id="aboutUpdate" style="font-size:12px;margin-top:4px;color:var(--c-emerald)"></p>
    <div style="margin-top:10px"><button class="btn sm ghost" onclick="TZOS.checkUpdate()">🔄 检查更新</button></div>
    <div style="margin:24px 0;padding:16px;background:var(--surface);border-radius:12px;text-align:left;font-size:13px;line-height:1.9;color:var(--ink-dim)">
      <div>🌐 <b>天择网</b> —— 所有功能预装为应用</div>
      <div>🤖 <b>AI 引擎</b> —— 对话 + 代码生成</div>
      <div>🛒 <b>软件商城</b> —— 一句话生成新软件</div>
      <div>🖥️ <b>自由桌面</b> —— 图标可拖拽摆放，分类整理</div>
      <div>💠 <b>双风格</b> —— Windows / macOS 自由切换</div>
      <div>💾 <b>本地存储</b> —— 数据持久化在浏览器</div>
    </div>
    <p style="font-size:12px;color:var(--ink-muted);line-height:1.7">
      天择OS 运行在 wjtianze.github.io/os<br/>
      所有数据保存在你的浏览器本地，不会上传<br/>
      配色与天择网保持一致：紫 · 蓝 · 绿
    </p>
    <div style="margin-top:20px">
      <button class="btn" onclick="TZOS.goHome()">🌐 返回天择网</button>
    </div>
  </div>`;
}

/* ===================== 内置应用：我的软件 ===================== */
function renderFileManager() {
  const apps = Store.getApps();
  return `
  <div style="padding:20px;max-width:520px;margin:0 auto">
    <h2 style="font-size:18px;margin-bottom:4px">📁 我的软件</h2>
    <p style="font-size:12px;color:var(--ink-faint);margin-bottom:16px">管理通过 AI 生成的已安装软件</p>
    ${apps.length === 0 ? '<div style="text-align:center;padding:40px 20px;color:var(--ink-faint);font-size:13px">还没有安装任何软件<br/><br/><button class="btn" onclick="TZOS.launchApp(\'app-store\')">去软件商城 →</button></div>' :
    apps.map(a => `
      <div class="store-installed-item" style="margin-bottom:8px">
        <div class="sii-icon">${a.icon||'📦'}</div>
        <div class="sii-info">
          <div class="sii-name">${escapeHtml(a.name)}</div>
          <div class="sii-meta">${ago(a.createdAt)}</div>
        </div>
        <button class="btn sm" onclick="TZOS.launchApp('${a.id}')">打开</button>
        <button class="btn sm ghost" onclick="TZOS.renameApp('${a.id}');TZOS.refreshOpenApp('file-manager')">重命名</button>
        <button class="btn sm ghost" onclick="TZOS.fixApp('${a.id}')">AI改进</button>
        <button class="btn sm ghost" style="border-color:#ef4444;color:#fca5a5" onclick="TZOS.uninstallApp('${a.id}');TZOS.refreshOpenApp('file-manager')">卸载</button>
      </div>`).join('')}
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
  { cat: 'AI 对话', title: '自动截图（视觉模型）', body: '对话工具栏「📷 截图」或系统设置开启后，每次发送消息自动截取当前屏幕一并发送。需搭配视觉模型（如 GLM-4V、GPT-4o），纯文本模型会浪费 token 甚至报错；首次开启需在浏览器弹窗中选择「此标签页」授权。' },
  { cat: '浏览器', title: '中键关闭标签页', body: '在标签页上按下鼠标中键（滚轮）可直接关闭该标签，与桌面浏览器习惯一致。' },
  { cat: '窗口与任务栏', title: '快捷面板与悬浮球', body: '关闭快捷面板会收起为小悬浮球，二者位置始终一致；拖动任意一个，切换形态后位置不变。' },
  { cat: '数据与安全', title: '全量存档', body: '系统设置 → 存档管理可导出/导入本机全部数据：AI 配置、系统设置、已装软件、对话历史、收藏夹、AI 记忆、背单词等天择网各应用数据（含 IndexedDB）。' },
  { cat: '快捷键', title: 'Ctrl+空格 开始菜单', body: '按 Ctrl+空格 快速打开/关闭开始菜单（应用列表）。' },
  { cat: '快捷键', title: 'Esc 关闭菜单', body: '开始菜单、右键菜单、通知中心打开时，按 Esc 即可关闭。' },
  { cat: 'AI 对话', title: '深度思考', body: 'AI 对话默认开启「🧠 深度思考」，会先展示思考过程（可折叠），再给正式回答。点工具栏按钮可开关。' },
  { cat: 'AI 对话', title: '多开对话窗口', body: 'AI 对话不再是单例，可连续打开多个对话窗口并行使用。' },
  { cat: 'AI 对话', title: 'LaTeX 公式', body: 'AI 回答中的数学公式会自动渲染。行内用 $...$，块级用 $$...$$。例如 $E=mc^2$。' },
  { cat: 'AI 对话', title: '切换 AI 提供方', body: '对话工具栏「⚙️自定义AI / 🫘豆包AI」一键切换。自定义走你配置的 OpenAI 兼容接口；豆包为网页嵌入。' },
  { cat: '软件商城', title: '一句话生成软件', body: '在软件商城输入需求，AI 会先优化提示词，再实时流式生成代码（可看到代码逐行写出），完成后自动安装到桌面并打开。' },
  { cat: '软件商城', title: '管理已安装软件', body: '「📁我的软件」或软件商城底部可查看/打开/卸载 AI 生成的软件。卸载按钮在窗口标题栏（紫色圆点）。' },
  { cat: '软件商城', title: 'AI 改进软件', body: '已生成的软件可继续用 AI 修改：右键桌面软件图标 →「AI 改进」，或在「我的软件」点「AI改进」，输入要改的地方（如修复某 bug、加个功能），AI 会基于现有代码改好后自动更新。' },
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
  <div style="padding:18px;max-width:560px;margin:0 auto">
    <h2 style="font-size:18px;margin-bottom:4px">💡 玩机技巧</h2>
    <p style="font-size:12px;color:var(--ink-faint);margin-bottom:14px">系统使用技巧、隐藏功能与快捷操作指南</p>
    <input class="input" id="tipsSearch" placeholder="搜索技巧…" style="width:100%;margin-bottom:14px" />
    <div id="tipsCats" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">
      <button class="preset-chip tips-cat active" data-cat="">全部</button>
      ${cats.map(c => `<button class="preset-chip tips-cat" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}
    </div>
    <div id="tipsList" style="display:flex;flex-direction:column;gap:10px"></div>
  </div>`;
}
function initTips() {
  let curCat = '', curKw = '';
  const list = $('#tipsList');
  const render = () => {
    const kw = curKw.toLowerCase();
    const items = TIPS_DATA.filter(t => (!curCat || t.cat === curCat) && (!kw || t.title.toLowerCase().includes(kw) || t.body.toLowerCase().includes(kw)));
    if (!items.length) { list.innerHTML = '<div style="color:var(--ink-faint);font-size:13px;text-align:center;padding:24px">未找到匹配的技巧</div>'; return; }
    list.innerHTML = items.map(t => `
      <div style="background:var(--surface);border:1px solid var(--glass-border);border-radius:10px;padding:12px 14px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-size:11px;padding:2px 8px;border-radius:999px;background:rgba(99,102,241,0.2);color:var(--c-violet)">${escapeHtml(t.cat)}</span><strong style="font-size:14px">${escapeHtml(t.title)}</strong></div>
        <div style="font-size:13px;color:var(--ink-dim);line-height:1.7">${escapeHtml(t.body)}</div>
      </div>`).join('');
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
    { name: 'AI 技能（TLH 课本学习助手）', icon: '📚', url: 'ai/skill/tlh/index.html' },
    { name: 'AI 词库转换', icon: '🔄', url: 'ai/skill/vocab-to-json/index.html' }
  ]},
  { name: 'COC 专区', icon: '🛡️', url: 'coc/index.html', children: [
    { name: '数据查询', icon: '📊', url: 'coc/data/index.html' },
    { name: '村庄分析', icon: '🏘️', url: 'coc/village/index.html' },
    { name: '升级规划', icon: '📅', url: 'coc/planner/index.html' },
    { name: '伤害计算', icon: '💥', url: 'coc/dmg-calc/index.html' }
  ]},
  { name: '游戏专区', icon: '🎮', url: 'game/index.html', children: [
    { name: '绩点战争：GPA 4.3', icon: '⚔️', url: 'game/gpa-card/index.html' }
  ]},
  { name: '英语专区', icon: '📖', url: 'english/index.html', children: [
    { name: '天择背单词', icon: '📚', url: 'english/words/index.html' }
  ]},
  { name: '天择OS', icon: '🖥️', url: 'os/index.html' }
];
// 打开任意天择网页面为一个新窗口（树状导航用）
function openTzPage(name, icon, url) {
  const full = url.startsWith('http') ? url : TZNET_BASE + url;
  const app = { id: 'tzpage-' + url.replace(/[^\w]/g, '-'), name, icon, type: 'preset', category: 'tznet', url: full, singleton: true };
  return WM.create({ app, width: 980, height: 680 });
}
function renderTzTree() {
  const node = (item, depth) => {
    const hasKids = item.children && item.children.length;
    return `<li class="tt-item" style="--d:${depth}">
      <div class="tt-row" data-url="${escapeHtml(item.url)}" data-name="${escapeHtml(item.name)}" data-icon="${escapeHtml(item.icon)}">
        ${hasKids ? '<span class="tt-toggle">▸</span>' : '<span class="tt-leaf">·</span>'}
        <span class="tt-icon">${item.icon}</span>
        <span class="tt-name">${escapeHtml(item.name)}</span>
        <span class="tt-open" title="打开">↗</span>
      </div>
      ${hasKids ? `<ul class="tt-kids" ${depth < 1 ? '' : 'hidden'}>${item.children.map(c => node(c, depth + 1)).join('')}</ul>` : ''}
    </li>`;
  };
  return `
  <div style="padding:18px;max-width:520px;margin:0 auto">
    <h2 style="font-size:18px;margin-bottom:4px">🌳 天择网导航</h2>
    <p style="font-size:12px;color:var(--ink-faint);margin-bottom:14px">专区 / 二级专区树状结构，点击名称在新窗口打开，点击 ▸ 展开/收起</p>
    <ul class="tt-tree">${TZ_TREE.map(t => node(t, 0)).join('')}</ul>
  </div>`;
}
function initTzTree() {
  $$('.tt-row').forEach(row => {
    row.onclick = (e) => {
      // 点展开钮只切换展开，不打开页面
      const toggle = row.querySelector('.tt-toggle');
      const kids = row.parentElement.querySelector('.tt-kids');
      if (toggle && kids && (e.target === toggle || e.target.closest('.tt-toggle'))) {
        const hidden = kids.hidden;
        kids.hidden = !hidden;
        toggle.textContent = hidden ? '▾' : '▸';
        return;
      }
      openTzPage(row.dataset.name, row.dataset.icon, row.dataset.url);
    };
  });
}

/* ===================== 内置应用：浏览器 ===================== */
function renderBrowser() {
  return `
  <div class="app-browser" style="position:absolute;inset:0;display:flex;flex-direction:column;background:rgba(5,8,19,0.4)">
    <div style="display:flex;gap:6px;padding:8px;border-bottom:1px solid var(--glass-border);background:var(--surface);align-items:center">
      <button class="btn sm ghost" id="brBack" title="后退">←</button>
      <button class="btn sm ghost" id="brFwd" title="前进">→</button>
      <button class="btn sm ghost" id="brReload" title="刷新">⟳</button>
      <input class="input" id="brUrl" placeholder="输入网址或搜索词，回车前往…" style="flex:1;height:36px" />
      <button class="btn sm" id="brGo">前往</button>
      <button class="btn sm ghost" id="brBookmark" title="收藏/取消收藏当前页">☆</button>
      <button class="btn sm ghost" id="brBookmarkList" title="收藏夹">📑</button>
      <button class="btn sm ghost" id="brNewTab" title="在OS内新标签页打开当前网址">↗</button>
    </div>
    <div id="brBmPanel" style="display:none;border-bottom:1px solid var(--glass-border);background:var(--glass-strong);max-height:220px;overflow-y:auto"></div>
    <div id="brViews" style="flex:1;position:relative;background:#fff;min-height:0"></div>
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
  const QUICK = [['天择网首页','https://wjtianze.github.io/'],['新闻','https://wjtianze.github.io/news/'],['博客','https://wjtianze.github.io/blog/'],['COC 数据','https://wjtianze.github.io/coc/data/']];
  let tabs = [], activeId = null, counter = 0;
  // 清理上一次浏览器实例遗留的 URL 轮询与消息监听（窗口刷新/重开场景）
  cleanupBrowserHooks();

  const sanitizeUrl = (u) => {
    let full = (u || '').trim();
    if (!full) return '';
    if (!/^https?:\/\//i.test(full)) {
      if (/^[\w-]+(\.[\w-]+)+/.test(full)) full = 'https://' + full;
      else full = 'https://www.bing.com/search?q=' + encodeURIComponent(full);
    }
    return full;
  };
  const hostOf = (u) => { try { return new URL(u).host; } catch { return u.replace(/^https?:\/\//,'').split('/')[0]; } };

  // 创建一个新标签页（url 可空=空白起始页）。所有新网页都在 OS 内打开，绝不外跳
  const newTab = (url) => {
    const id = 'brtab-' + (++counter);
    const overlay = el('div', '');
    Object.assign(overlay.style, { position:'absolute', inset:'0', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:'14px', color:'var(--ink-faint)', background:'var(--glass-strong)', textAlign:'center', padding:'24px' });
    overlay.innerHTML = '<div style="font-size:44px">🌐</div><div style="font-size:15px;color:var(--ink-dim)">天择OS 浏览器</div><div class="br-quick" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;max-width:420px"></div><div style="font-size:11px;color:var(--ink-muted);max-width:380px;line-height:1.6">提示：部分网站禁止被嵌入显示，白屏时可换其它网址。新链接会在本浏览器内的新标签页打开。</div>';
    const q = overlay.querySelector('.br-quick');
    QUICK.forEach(([n, u]) => { const b = el('button', 'btn sm ghost', n); b.onclick = () => navigate(id, u); q.appendChild(b); });

    const frame = el('iframe', '');
    Object.assign(frame.style, { width:'100%', height:'100%', border:'none', background:'#fff' });
    // sandbox：允许脚本/表单/同源（保证同源点击委托可工作、天择网页面功能正常），
    // 但【不】给 allow-popups / allow-top-navigation —— 这样跨域网站的 target=_blank/_top 链接
    // 无法跳出天择OS 到外部浏览器；同源页面则由下方点击委托接管，改到 OS 内新标签页打开。
    frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin allow-modals allow-downloads allow-presentation');
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
          // window.open 在沙箱内会被静默拦截 → 同源页面挂钩到 OS 内新标签页
          try {
            frame.contentWindow.open = (u) => { if (u) newTab(new URL(u, frame.contentWindow.location.href).href); return null; };
          } catch (e2) {}
        }
      } catch (e) { /* 跨域无法注入委托；sandbox 已阻止跳出系统 */ }
      // 同步地址栏与 tab 信息：同源读精确当前 URL（含自导航），跨域回退到 frame.src
      const t = tabs.find(x => x.id === id);
      if (t) {
        let cur = '';
        try { cur = frame.contentWindow.location.href; } catch (e) { cur = frame.src; }
        if (cur && cur !== 'about:blank') { t.url = cur; t.overlay.style.display = 'none'; }
        try { t.title = (frame.contentDocument && frame.contentDocument.title) || ''; } catch {}
        renderTabs();
        if (id === activeId) urlInput.value = t.url || '';
      }
    });

    views.appendChild(frame);
    views.appendChild(overlay);
    tabs.push({ id, url: url || '', frame, overlay, history: ['about:blank'], hi: 0, title: '' });
    renderTabs();
    activate(id);
    if (url) navigate(id, url);
    return id;
  };

  const navigate = (id, u, push) => {
    const t = tabs.find(x => x.id === id); if (!t) return;
    const full = sanitizeUrl(u); if (!full) return;
    t.url = full;
    t.frame.src = full;
    t.overlay.style.display = 'none';
    if (push !== false) { t.history.length = t.hi + 1; t.history.push(full); t.hi = t.history.length - 1; }
    if (id === activeId) urlInput.value = full;
    updateNav();
    if (typeof refreshBmBtn === 'function') refreshBmBtn();
  };

  const activate = (id) => {
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
    if (typeof refreshBmBtn === 'function') refreshBmBtn();
  };

  const closeTab = (id) => {
    const i = tabs.findIndex(x => x.id === id); if (i < 0) return;
    tabs[i].frame.remove(); tabs[i].overlay.remove();
    tabs.splice(i, 1);
    if (!tabs.length) { newTab(''); return; }
    if (activeId === id) activate(tabs[Math.min(i, tabs.length - 1)].id);
    else renderTabs();
  };

  const renderTabs = () => {
    tabsEl.innerHTML = '';
    tabs.forEach(t => {
      const tab = el('div', 'br-tab' + (t.id === activeId ? ' active' : ''));
      // 标签显示网页自带标题（同源/天择网页面可获取），取不到时回退到域名
      const label = t.title || (t.url ? hostOf(t.url) : '新标签页');
      tab.title = (t.title ? t.title + '\n' : '') + (t.url || '');
      tab.innerHTML = `<span class="br-tab-label">${escapeHtml(label)}</span><span class="br-x">✕</span>`;
      tab.onclick = (e) => { if (e.target.classList.contains('br-x')) { e.stopPropagation(); closeTab(t.id); } else activate(t.id); };
      // 中键（滚轮）点击标签页直接关闭
      tab.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); e.stopPropagation(); closeTab(t.id); } });
      tab.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
      tabsEl.appendChild(tab);
    });
    const plus = el('button', 'br-tab-plus', '＋');
    plus.title = '新建标签页';
    plus.onclick = () => newTab('');
    tabsEl.appendChild(plus);
  };

  const updateNav = () => {
    const t = tabs.find(x => x.id === activeId);
    $('#brBack').disabled = !t || t.hi <= 0;
    $('#brFwd').disabled = !t || t.hi >= t.history.length - 1;
  };

  $('#brGo').onclick = () => navigate(activeId, urlInput.value);
  urlInput.onkeydown = (e) => { if (e.key === 'Enter') navigate(activeId, urlInput.value); };
  // ↗ 在 OS 内新标签页打开当前网址（不再 window.open 外跳）
  $('#brNewTab').onclick = () => { const t = tabs.find(x => x.id === activeId); const u = urlInput.value || (t && t.url) || ''; newTab(u); };
  $('#brBack').onclick = () => { const t = tabs.find(x => x.id === activeId); if (t && t.hi > 0) { t.hi--; navigate(t.id, t.history[t.hi], false); } };
  $('#brFwd').onclick = () => { const t = tabs.find(x => x.id === activeId); if (t && t.hi < t.history.length - 1) { t.hi++; navigate(t.id, t.history[t.hi], false); } };
  $('#brReload').onclick = () => { const t = tabs.find(x => x.id === activeId); if (t && t.url) t.frame.src = t.url; };

  /* ===== 收藏夹书签（支持导入导出，兼容 Chrome/Edge/Firefox 的 Netscape 书签格式） ===== */
  const bmBtn = $('#brBookmark'), bmPanel = $('#brBmPanel');
  const activeTab = () => tabs.find(x => x.id === activeId);
  const isBm = (u) => Store.getBookmarks().some(b => b.url === u);
  const refreshBmBtn = () => {
    const t = activeTab();
    if (bmBtn) bmBtn.textContent = (t && t.url && isBm(t.url)) ? '★' : '☆';
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
    bmPanel.innerHTML = '<div style="display:flex;gap:8px;padding:8px 10px;border-bottom:1px solid var(--glass-border);align-items:center"><strong style="font-size:13px">📑 收藏夹</strong><span style="flex:1"></span><button class="btn sm ghost" id="brBmImport">📥 导入</button><button class="btn sm ghost" id="brBmExport">📤 导出</button></div>' +
      (bms.length
        ? bms.map((b, i) => `<div class="br-bm-item" data-url="${escapeHtml(b.url)}" style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;font-size:13px;color:var(--ink-dim)"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(b.title || b.url)}</span><small style="color:var(--ink-muted);max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(hostOf(b.url))}</small><span class="br-bm-del" data-i="${i}" style="opacity:.6;padding:2px 6px" title="删除">✕</span></div>`).join('')
        : '<div style="padding:18px;text-align:center;color:var(--ink-faint);font-size:12.5px">暂无收藏。点导航栏 ☆ 收藏当前页；也可点「导入」从 Chrome/Edge/Firefox 书签文件导入。</div>');
    bmPanel.querySelectorAll('.br-bm-item').forEach(item => {
      item.onclick = (e) => {
        if (e.target.classList.contains('br-bm-del')) {
          const i = +e.target.dataset.i;
          const bms2 = Store.getBookmarks();
          bms2.splice(i, 1);
          Store.setBookmarks(bms2);
          refreshBmBtn(); renderBmPanel();
          return;
        }
        navigate(activeId, item.dataset.url);
        bmPanel.style.display = 'none';
      };
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
        tab.url = d.url;
        tab.overlay.style.display = 'none';
        if (d.title) tab.title = d.title;
        if (tab.id === activeId) urlInput.value = d.url;
        renderTabs();
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
      t.url = cur;
      try { t.title = (t.frame.contentDocument && t.frame.contentDocument.title) || ''; } catch {}
      urlInput.value = cur;
      renderTabs();
    }
  }, 2000);

  newTab('');
  // 桌面版集成：暴露 newTab 给外部（tzOpenInBrowser 用），网页版无副作用
  window.__tzBrNewTab = newTab;
}

/* ===================== 刷新已打开的应用窗口 ===================== */
function refreshOpenApp(appId) {
  const w = WM.windows.find(x => x.appId === appId);
  if (w) { w.body.innerHTML = ''; if (w.app.type === 'builtin') w.body.innerHTML = w.app.render(); initAppHooks(appId); }
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
function initAppHooks(appId) {
  if (appId === 'ai-chat') initChat();
  if (appId === 'app-store') initAppStore();
  if (appId === 'settings') initSettings();
  if (appId === 'ai-config') initAIConfig();
  if (appId === 'browser') initBrowser();
  if (appId === 'terminal') initTerminal();
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
  $$('.preset-chip').forEach(chip => {
    chip.onclick = () => {
      const url = $('#cfgUrl'), model = $('#cfgModel');
      if (chip.dataset.url) url.value = chip.dataset.url;
      if (chip.dataset.model) model.value = chip.dataset.model;
      $$('.preset-chip').forEach(c => c.style.borderColor = '');
      chip.style.borderColor = 'var(--c-blue)';
      toast('已填入 ' + chip.textContent);
    };
  });
  // 货币单位切换（仅切换选中态，保存时读取）
  const puC = $('#priceUnitCny'), puU = $('#priceUnitUsd');
  if (puC && puU) {
    puC.onclick = () => { puC.classList.add('active'); puU.classList.remove('active'); };
    puU.onclick = () => { puU.classList.add('active'); puC.classList.remove('active'); };
  }
  // 记忆开关
  const bindTg = (id, get, set) => {
    const tg = $(id);
    if (!tg) return;
    tg.onclick = () => { set(!get()); tg.classList.toggle('on', get()); };
  };
  bindTg('#memAutoTg', Store.getMemAuto.bind(Store), Store.setMemAuto.bind(Store));
  bindTg('#memInjectTg', Store.getMemInject.bind(Store), Store.setMemInject.bind(Store));
  // AI 命令行模式开启期间：自动写入记忆被接管（由 AI 通过 mem 命令写），开关禁用并提示
  if (Store.getAgentMode()) {
    const tg = $('#memAutoTg');
    if (tg) {
      tg.classList.remove('on');
      tg.style.opacity = '0.4';
      tg.onclick = () => toast('AI 命令行模式开启期间，记忆由 AI 通过命令行写入（可在系统设置关闭命令行模式）', 3200);
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
  setTimeout(() => initAppHooks(winObj.appId), 0);
};

/* ===================== 时钟 ===================== */
function startClock() {
  const tick = () => {
    const d = new Date();
    const tc = $('#tbClock');
    if (tc) tc.innerHTML = fmtTime(d) + '<br>' + fmtDate(d);
  };
  tick();
  const schedule = () => {
    const delay = 60000 - (Date.now() % 60000) + 20;
    window.__tzClockTimer = setTimeout(() => { tick(); schedule(); }, delay);
  };
  schedule();
}

/* ===================== 开机流程 ===================== */
async function boot() {
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

  // 启动后静默检查更新（不打扰，发现新版本仅通知）
  setTimeout(() => Updater.check(false), 2600);

  await new Promise(r => setTimeout(r, 1400));
  clearInterval(tipTimer);

  const boot = $('#bootScreen');
  boot.classList.add('gone');
  setTimeout(() => { boot.style.display = 'none'; $('#desktop').hidden = false; }, 600);

  Store.addNotif({ title: '欢迎使用天择OS', body: '所有天择网功能已预装为应用。点击「🔑 AI 配置」开始使用 AI 功能。' });
  Store.addNotif({ title: '软件商城已就绪', body: '输入一句话，让 AI 为你生成专属软件。' });

  // 桌面版首次启动：AI 配置独立存于本机（与网页版不共享），未配置时自动弹出引导
  if (window.tzDesktop && !AI.isReady()) {
    setTimeout(() => {
      toast('桌面版需单独配置 AI：填入 API Key 即可使用对话与软件商城', 6000);
      launchApp('ai-config');
    }, 1200);
  }
}

/* ===================== 全局事件绑定 ===================== */
function bindGlobalEvents() {
  // 开始按钮
  $('#btnStart').onclick = (e) => { e.stopPropagation(); StartMenu.toggle(); };
  // 风格切换按钮（任务栏）
  $('#btnStyle').onclick = (e) => { e.stopPropagation(); toggleStyle(); };
  // AI 配置快捷按钮（任务栏）
  $('#btnAiConfig').onclick = (e) => { e.stopPropagation(); launchApp('ai-config'); };
  // 设置按钮
  $('#btnSettings').onclick = (e) => { e.stopPropagation(); StartMenu.hide(); launchApp('settings'); };
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
    if (!e.target.closest('#startMenu') && !e.target.closest('#btnStart')) StartMenu.hide();
    if (!e.target.closest('#ctxMenu')) hideCtxMenu();
    if (!e.target.closest('#notifCenter') && !e.target.closest('#tbClock')) $('#notifCenter').hidden = true;
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
      Desktop.render();
    });
  }, { passive: true });
  // 键盘快捷键
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Esc 仅用于关闭菜单/面板
      if (StartMenu.open) { StartMenu.hide(); return; }
      if (ctxEl) { hideCtxMenu(); return; }
      const nc = $('#notifCenter'); if (nc && !nc.hidden) { nc.hidden = true; return; }
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
    if (d.type === 'tz_hotkey' && d.key === 'ctrl+q') toggleFullscreen();
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

/* ===================== 通知中心 ===================== */
function toggleNotifCenter() {
  const nc = $('#notifCenter');
  if (nc.hidden) {
    const notifs = Store.getNotifs();
    nc.innerHTML = notifs.length ? notifs.map(n => `
      <div class="notif"><div class="nf-title">${escapeHtml(n.title)}</div><div class="nf-body">${escapeHtml(n.body)}</div><div class="nf-time">${ago(n.time)}</div></div>
    `).join('') : '<div style="padding:30px;text-align:center;color:var(--ink-faint);font-size:13px">暂无通知</div>';
    nc.hidden = false;
  } else { nc.hidden = true; }
}

/* ===================== 启动 ===================== */
window.addEventListener('DOMContentLoaded', boot);

// 暴露给 onclick 使用的全局接口
Object.assign(window.TZOS, {
  launchApp, uninstallApp, Store, AI, WM, Desktop, StartMenu, refreshOpenApp, toast,
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
