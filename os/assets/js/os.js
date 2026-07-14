/* ============================================================
   天择OS · 核心逻辑
   模块：Storage | Device | Apps | WindowManager
         | Desktop(自由摆放+分类) | Taskbar | StartMenu
         | ContextMenu | FloatingWidget | AIEngine
         | 内置应用（配置/对话/商城/设置/关于）
   ============================================================ */
(function () {
'use strict';

/* ===================== 存储层 ===================== */
const Store = {
  KEY: 'tzos_state_v1',
  load() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; }
    catch { return {}; }
  },
  save(state) { localStorage.setItem(this.KEY, JSON.stringify(state)); },
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
  setWidget(w) { this.set('widget', w); }
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
  // Windows 风格：底部全宽任务栏 52px；macOS 风格：底部居中 Dock 约 84px
  const reservedBottom = isMac ? 84 : 52;
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
  }
};

// 天择网预装应用：iframe 加载天择网页面
const TZNET_BASE = (() => {
  // dev 版本用相对路径 ../ ; normal 版本 sync 会改写为绝对地址
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
  { id: 'tz-game', name: '游戏专区', icon: '🎮', grad: false, category: 'tznet', url: TZNET_BASE + 'game/index.html', desc: '天择网游戏' },
  { id: 'tz-gpa', name: '绩点战争', icon: '⚔️', grad: true, category: 'game', url: TZNET_BASE + 'game/gpa-card/index.html', desc: '卡牌对战游戏' }
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
    title.append(icons, titleIcon, titleText, spacer);

    const body = el('div', 'win-body pad');
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
      iframe.src = app.url;
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
      iframe.src = app.url;
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
    const order = ['system','ai','tznet','game','tool'];
    apps.sort((a,b) => { const ia = order.indexOf(a.category), ib = order.indexOf(b.category); return (ia-ib) || (a.name||'').localeCompare(b.name||''); });
    if (!apps.length) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--ink-faint);padding:30px;font-size:13px;">未找到匹配的应用</div>';
      return;
    }
    apps.forEach(app => {
      const a = el('div', 'start-app');
      a.innerHTML = `<div class="sa-icon${app.grad?' grad':''}">${app.icon||'📦'}</div><div class="sa-name">${escapeHtml(app.name||'应用')}</div>`;
      a.onclick = () => { launchApp(app.id); this.hide(); };
      grid.appendChild(a);
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
const CAT_ORDER = ['system', 'ai', 'tznet', 'game', 'tool'];
const CAT_LABEL = { system: '系统', ai: 'AI', tznet: '天择网', game: '游戏', tool: '我的软件' };

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
    if (st.closed) { w.classList.add('hidden'); reopen.classList.remove('hidden'); this.placeReopen(reopen, st); }

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

    // 重新打开
    reopen.onclick = () => { this.open(); };
    // 快捷按钮
    w.querySelectorAll('.fw-btn').forEach(b => {
      b.onclick = (e) => { e.stopPropagation(); launchApp(b.dataset.app); };
    });
    // 时钟
    const tick = () => { const c = $('#fwClock'); if (c) { c.textContent = fmtTime(new Date()); } };
    tick(); setInterval(tick, 1000 * 10);
  },
  placeReopen(reopen, st) {
    if (st.x != null && st.y != null) { reopen.style.left = st.x + 'px'; reopen.style.top = st.y + 'px'; reopen.style.bottom = 'auto'; reopen.style.right = 'auto'; }
  },
  close() {
    this.el.classList.add('hidden');
    const reopen = $('#fwReopen');
    reopen.classList.remove('hidden');
    this.placeReopen(reopen, Store.getWidget());
    const cur = Store.getWidget(); cur.closed = true; Store.setWidget(cur);
  },
  open() {
    this.el.classList.remove('hidden');
    $('#fwReopen').classList.add('hidden');
    const cur = Store.getWidget(); cur.closed = false; Store.setWidget(cur);
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
  // 按当前 provider 取配置；deepThink 时若为 DeepSeek 自动用 reasoner 模型，关闭时切回 chat
  config(provider) {
    const p = provider || Store.getProvider();
    let c = (p === 'doubao') ? Store.getDoubaoConfig() : Store.getAIConfig();
    c = { ...c };
    if (/deepseek\.com/i.test(c.url)) {
      if (Store.getDeepThink() && /deepseek-chat/i.test(c.model)) c.model = 'deepseek-reasoner';
      else if (!Store.getDeepThink() && /deepseek-reasoner/i.test(c.model)) c.model = 'deepseek-chat';
    }
    return c;
  },
  isReady(provider) { const c = this.config(provider); return !!(c.url && c.key && c.model); },

  async chat(messages, opts = {}) {
    const c = this.config(opts.provider);
    if (!this.isReady(opts.provider)) throw new Error('AI 未配置，请先在「AI 配置」中设置 URL、Key 和模型。' + (Store.getProvider()==='doubao'?'（当前为豆包，需填入 Volcengine Ark API Key）':''));
    const res = await fetch(c.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.key },
      body: JSON.stringify({ model: c.model, messages, temperature: opts.temperature ?? 0.7, max_tokens: opts.max_tokens ?? 384000, stream: false })
    });
    if (!res.ok) { const t = await res.text().catch(()=> ''); throw new Error('AI 接口错误 ' + res.status + '：' + t.slice(0,200)); }
    const data = await res.json();
    const msg = data.choices?.[0]?.message || {};
    return { content: msg.content || '', reasoning: msg.reasoning_content || '' };
  },

  // 流式输出。onChunk(delta, fullContent) 收正文；onReasoning(delta, fullReasoning) 收思考过程
  async chatStream(messages, onChunk, opts = {}) {
    const c = this.config(opts.provider);
    if (!this.isReady(opts.provider)) throw new Error('AI 未配置，请先在「AI 配置」中设置 URL、Key 和模型。' + (Store.getProvider()==='doubao'?'（当前为豆包，需填入 Volcengine Ark API Key）':''));
    const res = await fetch(c.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.key },
      body: JSON.stringify({ model: c.model, messages, temperature: opts.temperature ?? 0.7, max_tokens: opts.max_tokens ?? 384000, stream: true })
    });
    if (!res.ok) { const t = await res.text().catch(()=> ''); throw new Error('AI 接口错误 ' + res.status + '：' + t.slice(0,200)); }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', full = '', reasoning = '';
    const onReasoning = opts.onReasoning;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith('data:')) continue;
        const data = s.slice(5).trim();
        if (data === '[DONE]') return { content: full, reasoning };
        try {
          const j = JSON.parse(data);
          const delta = j.choices?.[0]?.delta || {};
          if (delta.reasoning_content) { reasoning += delta.reasoning_content; if (onReasoning) onReasoning(delta.reasoning_content, reasoning); }
          if (delta.content) { full += delta.content; onChunk(delta.content, full); }
        } catch {}
      }
    }
    return { content: full, reasoning };
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
    const out = await this.chat([{ role: 'system', content: sys }, { role: 'user', content: userPrompt }], { temperature: 0.5, max_tokens: 384000 });
    return (out.content || '').trim();
  },

  async generateApp(spec, userPrompt, onChunk) {
    const sys = `你是一位顶尖前端工程师。请根据软件规格生成一个完整的、可直接在浏览器中运行的单文件 HTML 应用。

【硬性要求】
1. 只输出一个完整的 <!DOCTYPE html> 文档，不要任何解释文字、不要 markdown 代码块包裹
2. 所有 CSS 写在 <style> 标签内，所有 JS 写在 <script> 标签内，全部内联
3. 界面必须是深色主题，配色使用紫(#7c3aed)-蓝(#3b82f6)-绿(#10b981)渐变，与天择OS风格一致
4. 使用现代 CSS（flex/grid/变量/玻璃态毛玻璃效果），界面精致美观
5. 完整实现所有功能，确保可用、可交互，不要占位符
6. 代码健壮，有输入校验和错误处理
7. 中文界面，注释用中文
8. 字体使用系统字体栈：-apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif
9. 不要使用任何外部 CDN、外部资源或网络请求（图片用 SVG 或 emoji）
10. 应用应在 720×540 左右的窗口内良好显示，支持响应式

【软件规格】
${spec}

【用户原始需求】
${userPrompt}

请直接输出完整 HTML 代码，从 <!DOCTYPE html> 开始：`;
    return await this.chatStream([{ role: 'system', content: sys }, { role: 'user', content: '请生成这个软件' }], onChunk, { temperature: 0.7, max_tokens: 384000 });
  },

  async fixApp(app, instruction, onChunk) {
    const sys = `你是一位顶尖前端工程师。用户有一个已生成的单文件 HTML 软件，现在要按用户的需求修改或修复它。

【硬性要求】
1. 只输出一个完整的 <!DOCTYPE html> 文档（修改后的完整版本），不要任何解释文字、不要 markdown 代码块包裹
2. 保留原软件的整体结构与风格，只针对用户的需求做修改
3. 所有 CSS 写在 <style> 标签内，所有 JS 写在 <script> 标签内，全部内联
4. 界面保持深色主题，配色使用紫(#7c3aed)-蓝(#3b82f6)-绿(#10b981)渐变
5. 代码健壮，修复 bug 时确保不引入新问题
6. 中文界面，注释用中文
7. 不要使用任何外部 CDN、外部资源或网络请求（图片用 SVG 或 emoji）
8. 应用应在 720×540 左右的窗口内良好显示，支持响应式

【用户修改需求】
${instruction}

【当前软件完整代码】
${app.html}

请直接输出修改后的完整 HTML 代码，从 <!DOCTYPE html> 开始：`;
    return await this.chatStream([{ role: 'system', content: sys }, { role: 'user', content: '请按需求修改这个软件' }], onChunk, { temperature: 0.6, max_tokens: 384000 });
  }
};

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
    <div style="display:flex;gap:8px;margin-top:18px">
      <button class="btn" onclick="TZOS.saveConfig()">💾 保存配置</button>
      <button class="btn ghost" onclick="TZOS.testConfig()">🧪 测试连接</button>
    </div>
    <p style="margin-top:18px;font-size:11px;color:var(--ink-muted);line-height:1.6">
      你的 Key 只保存在本机 localStorage，不会上传到任何服务器。建议使用 DeepSeek 等国产 API，便宜且快。
    </p>

    <hr style="margin:22px 0;border:none;border-top:1px solid var(--glass-border)" />
    <h3 style="font-size:15px;margin-bottom:4px">🫘 豆包 AI（doubao.com 网页版）</h3>
    <p class="sub" style="margin-bottom:10px">豆包AI 采用 <strong>网页嵌入</strong> 方式接入（非 API Key）。在「AI 对话」顶部点「⚙️ 自定义AI」可一键切换为「🫘 豆包AI」，将在窗口内嵌入 doubao.com 网页版。</p>
    <div class="config-status warn"><span>ℹ</span><span>豆包无需在此配置 API Key。若 doubao.com 禁止被嵌入（白屏），点对话窗口右上角「↗ 外部打开」在系统浏览器中使用，首次需登录豆包账号。</span></div>
  </div>`;
}
window.TZOS = window.TZOS || {};
window.TZOS.saveConfig = function() {
  const cfg = { url: $('#cfgUrl').value.trim(), key: $('#cfgKey').value.trim(), model: $('#cfgModel').value.trim() };
  Store.setAIConfig(cfg);
  toast('配置已保存');
  refreshOpenApp('ai-config');
};
window.TZOS.testConfig = async function() {
  const cfg = { url: $('#cfgUrl').value.trim(), key: $('#cfgKey').value.trim(), model: $('#cfgModel').value.trim() };
  Store.setAIConfig(cfg);
  const prev = Store.getProvider(); Store.setProvider('custom');
  toast('正在测试连接…', 1500);
  try {
    const r = await AI.chat([{role:'user',content:'请回复"OK"'}], { max_tokens: 10, provider:'custom' });
    toast('✓ 连接成功：' + (r.content || '').slice(0, 30));
  } catch (e) { toast('✗ ' + e.message.slice(0, 60), 4000); }
  finally { Store.setProvider(prev); }
};

/* ===================== 内置应用：AI 对话 ===================== */
function renderAIChat() {
  const provider = Store.getProvider();
  // 豆包AI：doubao.com 网页版嵌入（非 API Key 方式）
  if (provider === 'doubao') {
    return `
    <div class="app-chat" id="chatApp" style="background:rgba(5,8,19,0.4)">
      <div class="chat-toolbar" style="display:flex;gap:6px;padding:6px 10px;border-bottom:1px solid var(--glass-border);background:rgba(255,255,255,0.04);align-items:center">
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
  return `
  <div class="app-chat" id="chatApp">
    <div class="chat-toolbar" style="display:flex;gap:6px;padding:6px 10px;border-bottom:1px solid var(--glass-border);background:rgba(255,255,255,0.04);align-items:center">
      <button class="btn sm ghost" id="chatProvider" title="切换 AI 提供方">⚙️ 自定义AI</button>
      <button class="btn sm ${deep?'':'ghost'}" id="chatDeep" title="深度思考（显示思考过程）">🧠 深度思考${deep?'·开':'·关'}</button>
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
  return `<details class="msg-reasoning"${ongoing?' open':''} style="margin-bottom:6px"><summary style="cursor:pointer;color:var(--ink-faint);font-size:12px">🧠 思考过程${tag}</summary><div style="font-size:12px;color:var(--ink-faint);line-height:1.6;padding:6px 8px;background:rgba(255,255,255,0.03);border-radius:6px;margin-top:4px;white-space:pre-wrap">${escapeHtml(reasoning)}</div></details>`;
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
    const provName = Store.getProvider()==='doubao' ? '豆包AI' : '自定义AI';
    msgs.innerHTML = `<div class="chat-empty">
      <div class="ce-icon">💬</div>
      <div class="ce-title">天择 AI 助手 · ${provName}</div>
      <div id="chatEmptyHint" style="font-size:12px;max-width:360px">${ready?(Store.getDeepThink()?'深度思考已开启，会显示思考过程。':'问我任何问题，或试试下面的建议'):'请先在「AI 配置」中设置当前提供方的 API Key'}</div>
      <div class="ce-suggest">
        ${ready?['介绍一下你自己','帮我写一首关于夏天的诗','解释一下量子纠缠，给出公式'].map(s=>`<div class="chat-suggest-chip" onclick="TZOS.chatSuggest(this.textContent)">${s}</div>`).join(''):'<div class="chat-suggest-chip" onclick="TZOS.openConfig()">去配置 →</div>'}
      </div>
    </div>`;
  } else {
    history.forEach(m => appendMsg(m.role, m.content, m.reasoning));
  }
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
    // 只更新按钮状态，不重渲染对话，避免影响已有内容
    deepBtn.classList.toggle('ghost', !d);
    deepBtn.textContent = '🧠 深度思考' + (d ? '·开' : '·关');
    const eh = $('#chatEmptyHint');
    if (eh && AI.isReady()) eh.textContent = d ? '深度思考已开启，会显示思考过程。' : '问我任何问题，或试试下面的建议';
    toast('深度思考已' + (d ? '开启' : '关闭') + '（仅影响后续回复）');
  };
  const clrBtn = $('#chatClear');
  if (clrBtn) clrBtn.onclick = async () => {
    const ok = await confirmDialog({ title: '清空对话', message: '清空当前对话历史？', confirmText: '清空', danger: true });
    if (!ok) return;
    Store.setChat([]);
    refreshOpenApp('ai-chat');
  };
}
function appendMsg(role, content, reasoning) {
  const msgs = $('#chatMsgs');
  const empty = msgs.querySelector('.chat-empty');
  if (empty) empty.remove();
  const m = el('div', 'msg ' + role);
  m.innerHTML = `<div class="msg-avatar">${role==='ai'?'🤖':'🧑'}</div><div class="msg-bubble">${reasoningHtml(reasoning,false)}${renderMd(content)}</div>`;
  msgs.appendChild(m);
  if (role === 'ai') renderMath(m);
  msgs.scrollTop = msgs.scrollHeight;
  return m;
}
function renderMd(text) {
  // 先抽取数学公式占位符，保护 $$...$$ 跨行不被 <br> 与转义破坏
  const maths = [];
  let work = text.replace(/\$\$([\s\S]*?)\$\$/g, (m, c) => { maths.push({ d: true, c }); return '\u0000M' + (maths.length - 1) + '\u0000'; });
  work = work.replace(/(?<!\$)\$([^\$\n]+?)\$(?!\$)/g, (m, c) => { maths.push({ d: false, c }); return '\u0000M' + (maths.length - 1) + '\u0000'; });
  let html = escapeHtml(work);
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_,l,c) => `<pre><code>${c.replace(/&lt;\/?pre.*?>/g,'')}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.3);padding:2px 5px;border-radius:4px;font-size:0.9em">$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n/g, '<br>');
  // 还原数学占位符为 span（内含原始 LaTeX 文本，供 KaTeX auto-render 处理）
  html = html.replace(/\u0000M(\d+)\u0000/g, (m, i) => {
    const x = maths[+i]; if (!x) return '';
    const delim = x.d ? '$$' : '$';
    return '<span class="tz-math">' + escapeHtml(delim + x.c + delim) + '</span>';
  });
  return html;
}
// LaTeX 渲染：依赖在 os/index.html 中预加载的 KaTeX（与 TLH 演示页一致，jsdelivr 0.16.11）。
// 这里只负责调用 auto-render；若 KaTeX 尚未加载完成，排队并在就绪后统一渲染。
const KATEX_OPTS = { delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false},{left:'\\(',right:'\\)',display:false},{left:'\\[',right:'\\]',display:true}], throwOnError:false };
let _katexQueue = [], _katexTimer = null, _katexFallbackTried = false;
function renderMath(node) {
  if (!node) return;
  if (window.renderMathInElement) { try { window.renderMathInElement(node, KATEX_OPTS); } catch {} return; }
  // KaTeX 还在加载中，入队等待
  _katexQueue.push(node);
  if (!_katexTimer) {
    _katexTimer = setInterval(() => {
      if (!window.renderMathInElement) return;
      clearInterval(_katexTimer); _katexTimer = null;
      const q = _katexQueue; _katexQueue = [];
      q.forEach(n => { try { window.renderMathInElement(n, KATEX_OPTS); } catch {} });
    }, 150);
    // 兜底：3 秒后若 jsdelivr 仍未就绪，尝试国内备用 CDN（staticfile.org）
    setTimeout(() => {
      if (window.renderMathInElement || _katexFallbackTried) return;
      _katexFallbackTried = true;
      const head = document.head;
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdn.staticfile.org/KaTeX/0.16.11/katex.min.css'; head.appendChild(css);
      const s1 = document.createElement('script'); s1.src = 'https://cdn.staticfile.org/KaTeX/0.16.11/katex.min.js';
      s1.onload = () => { const s2 = document.createElement('script'); s2.src = 'https://cdn.staticfile.org/KaTeX/0.16.11/contrib/auto-render.min.js'; head.appendChild(s2); };
      head.appendChild(s1);
    }, 3000);
  }
}
async function sendChat() {
  const input = $('#chatInput');
  const sendBtn = $('#chatSend');
  const text = input.value.trim();
  if (!text) return;
  if (!AI.isReady()) { toast(Store.getProvider()==='doubao' ? '请先在「AI 配置」中填入豆包(Volcengine Ark) API Key' : '请先配置 AI'); launchApp('ai-config'); return; }
  input.value = ''; input.style.height = 'auto';
  appendMsg('user', text);
  const history = Store.getChat();
  history.push({ role: 'user', content: text });
  const aiMsg = appendMsg('ai', '<span class="typing-dots"><span></span><span></span><span></span></span>');
  sendBtn.disabled = true;
  const msgs = $('#chatMsgs');
  let full = '', reasoning = '';
  const bubble = aiMsg.querySelector('.msg-bubble');
  // 深度思考关闭时：不显示、不存储思考过程（仅影响本次及后续回复，不动已有消息）
  const deep = Store.getDeepThink();
  const paint = () => { bubble.innerHTML = (deep ? reasoningHtml(reasoning, true) : '') + renderMd(full); msgs.scrollTop = msgs.scrollHeight; };
  try {
    const sysMsg = { role: 'system', content: '你是天择 AI 助手，运行在天择OS中。回答简洁有用，使用中文。可写代码（markdown代码块）。数学公式用 LaTeX：行内 $...$，块级 $$...$$。' };
    await AI.chatStream([sysMsg, ...history.slice(-12).map(m => ({role: m.role==='ai'?'assistant':'user', content: m.content}))],
      (delta, all) => { full = all; paint(); },
      { onReasoning: deep ? ((d, allR) => { reasoning = allR; paint(); }) : undefined }
    );
    bubble.innerHTML = (deep ? reasoningHtml(reasoning, false) : '') + renderMd(full);
    renderMath(aiMsg);
    history.push({ role: 'ai', content: full, reasoning: deep ? reasoning : '' });
    Store.setChat(history);
  } catch (e) {
    bubble.innerHTML = `<span style="color:#fca5a5">⚠ ${escapeHtml(e.message)}</span>`;
  } finally {
    sendBtn.disabled = false;
  }
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
      <button class="btn sm ${deep?'':'ghost'}" id="storeDeep" title="深度思考（用推理模型生成更严谨的代码，速度较慢）">🧠 深度思考${deep?'·开':'·关'}</button>
      <button class="btn" id="storeGen" onclick="TZOS.startGen()">✨ 生成</button>
    </div>
    <div class="store-step" id="storeSteps" style="display:none">
      <div class="store-step-label"><span class="step-dot">1</span><span id="step1Label">智能优化提示词…</span></div>
      <div class="store-prompt-box" id="refinedBox"></div>
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
    deepBtn.classList.toggle('ghost', !d);
    deepBtn.textContent = '🧠 深度思考' + (d ? '·开' : '·关');
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
  $('#refinedBox').innerHTML = '<span style="color:var(--ink-faint)">正在优化提示词…</span>';
  $('#codeProgress').textContent = '';
  try {
    const spec = await AI.refinePrompt(prompt);
    $('#refinedBox').innerHTML = escapeHtml(spec).replace(/\|/g, '<br><span class="opt">▸ </span>');
    $('#codeProgress').innerHTML = '<div style="color:var(--ink-faint);margin-bottom:4px">开始生成代码…</div>';
    let code = '';
    const showStream = (all) => {
      const tail = all.length > 1600 ? all.slice(-1600) : all;
      $('#codeProgress').innerHTML = '<div style="color:var(--c-blue);margin-bottom:4px">⌨ 生成中… ' + all.length + ' 字符</div><pre style="white-space:pre-wrap;word-break:break-all;margin:0">' + escapeHtml(tail) + '</pre>';
      $('#codeProgress').scrollTop = $('#codeProgress').scrollHeight;
    };
    const result = await AI.generateApp(spec, prompt, (delta, all) => {
      code = all;
      showStream(all);
    });
    if (typeof result === 'object' && result.content) code = result.content;
    code = code.trim();
    if (code.startsWith('```')) { code = code.replace(/^```(?:html)?\n?/, '').replace(/```$/, ''); }
    if (!code.includes('<!DOCTYPE') && !code.includes('<html')) {
      throw new Error('生成的代码不完整，请重试');
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
  card.innerHTML = '<div class="tz-dialog-title">🔧 正在改进「' + escapeHtml(app.name) + '」</div><div class="tz-dialog-msg" id="fixStatus" style="margin-bottom:8px">⌨ AI 正在修改代码…</div><div id="fixCode" style="max-height:220px;overflow:auto;font-family:monospace;font-size:11px;white-space:pre-wrap;word-break:break-all;color:var(--ink-muted);background:rgba(0,0,0,0.25);border-radius:8px;padding:10px;margin-bottom:4px"></div>';
  mask.appendChild(card); document.body.appendChild(mask);
  const fixCode = card.querySelector('#fixCode');
  const fixStatus = card.querySelector('#fixStatus');
  const close = () => { mask.classList.remove('show'); setTimeout(() => mask.remove(), 200); };
  try {
    let code = '';
    const result = await AI.fixApp(app, instruction.trim(), (delta, all) => {
      code = all;
      const tail = all.length > 1500 ? all.slice(-1500) : all;
      fixCode.textContent = tail;
      fixCode.scrollTop = fixCode.scrollHeight;
    });
    code = (result && result.content) ? result.content : code;
    code = code.trim();
    if (code.startsWith('```')) { code = code.replace(/^```(?:html)?\n?/, '').replace(/```$/, ''); }
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
  return `
  <div class="settings-panel">
    <h2>⚙️ 系统设置</h2>
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
      <div><div class="sr-label">存储用量</div><div class="sr-desc" id="storageInfo">计算中…</div></div>
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
}
window.TZOS.setStyle = function(s) {
  Store.setStyle(s);
  applyDeviceStyle();
  Desktop.render();
  refreshOpenApp('settings');
  toast('风格已切换为 ' + (s === 'mac' ? 'macOS' : s === 'win' ? 'Windows' : '自动'));
};
window.TZOS.reset = async function() {
  const ok1 = await confirmDialog({ title: '重置天择OS', message: '⚠️ 这将清除天择OS的所有本地数据（已安装软件、AI配置、对话历史、图标布局），确定继续吗？', confirmText: '继续', danger: true });
  if (!ok1) return;
  const ok2 = await confirmDialog({ title: '再次确认', message: '此操作不可恢复！', confirmText: '确认重置', danger: true });
  if (!ok2) return;
  localStorage.removeItem(Store.KEY);
  location.reload();
};

/* ===================== 内置应用：关于 ===================== */
function renderAbout() {
  return `
  <div style="padding:30px;text-align:center">
    <div style="width:72px;height:72px;margin:0 auto 18px;border-radius:18px;background:var(--grad-main);display:flex;align-items:center;justify-content:center;font-size:38px">🖥️</div>
    <h2 style="font-size:22px;background:var(--grad-main);-webkit-background-clip:text;background-clip:text;color:transparent">天择OS</h2>
    <p style="color:var(--ink-faint);font-size:13px;margin-top:6px">v1.1.0 · 浏览器内全屏操作系统</p>
    <div style="margin:24px 0;padding:16px;background:rgba(255,255,255,0.04);border-radius:12px;text-align:left;font-size:13px;line-height:1.9;color:var(--ink-dim)">
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
  { cat: '快捷键', title: 'Ctrl+Q 全屏', body: '按 Ctrl+Q 进入浏览器全屏沉浸模式，再按一次退出（覆盖浏览器默认快捷键）。' },
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
      <div style="background:rgba(255,255,255,0.04);border:1px solid var(--glass-border);border-radius:10px;padding:12px 14px">
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

/* ===================== 内置应用：浏览器 ===================== */
function renderBrowser() {
  return `
  <div class="app-browser" style="position:absolute;inset:0;display:flex;flex-direction:column;background:rgba(5,8,19,0.4)">
    <div id="brTabs" style="display:flex;gap:4px;padding:6px 8px;border-bottom:1px solid var(--glass-border);background:rgba(255,255,255,0.03);overflow-x:auto;align-items:center;min-height:34px"></div>
    <div style="display:flex;gap:6px;padding:8px;border-bottom:1px solid var(--glass-border);background:rgba(255,255,255,0.04);align-items:center">
      <button class="btn sm ghost" id="brBack" title="后退">←</button>
      <button class="btn sm ghost" id="brFwd" title="前进">→</button>
      <button class="btn sm ghost" id="brReload" title="刷新">⟳</button>
      <input class="input" id="brUrl" placeholder="输入网址或搜索词，回车前往…" style="flex:1;height:36px" />
      <button class="btn sm" id="brGo">前往</button>
      <button class="btn sm ghost" id="brNewTab" title="在OS内新标签页打开当前网址">↗</button>
    </div>
    <div id="brViews" style="flex:1;position:relative;background:#fff;min-height:0"></div>
  </div>`;
}
function initBrowser() {
  const tabsEl = $('#brTabs'), views = $('#brViews'), urlInput = $('#brUrl');
  const QUICK = [['天择网首页','https://wjtianze.github.io/'],['新闻','https://wjtianze.github.io/news/'],['博客','https://wjtianze.github.io/blog/'],['COC 数据','https://wjtianze.github.io/coc/data/']];
  let tabs = [], activeId = null, counter = 0;
  // 清理上一次浏览器实例遗留的 URL 轮询与消息监听（窗口刷新/重开场景）
  if (window.__tzBrWatcher) { clearInterval(window.__tzBrWatcher); window.__tzBrWatcher = null; }
  if (window.__tzBrMsg) { window.removeEventListener('message', window.__tzBrMsg); window.__tzBrMsg = null; }

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
      const tab = el('div', '');
      const label = t.title || (t.url ? hostOf(t.url) : '新标签页');
      Object.assign(tab.style, { display:'flex', alignItems:'center', gap:'6px', padding:'4px 10px', borderRadius:'6px', background: t.id===activeId ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)', fontSize:'12px', color:'var(--ink-dim)', cursor:'pointer', whiteSpace:'nowrap', maxWidth:'180px', flexShrink:'0' });
      tab.innerHTML = `<span style="overflow:hidden;text-overflow:ellipsis">${escapeHtml(label)}</span><span class="br-x" style="opacity:.6;padding:0 2px;border-radius:3px">✕</span>`;
      tab.onclick = (e) => { if (e.target.classList.contains('br-x')) { e.stopPropagation(); closeTab(t.id); } else activate(t.id); };
      tabsEl.appendChild(tab);
    });
    const plus = el('button', 'btn sm ghost', '＋');
    plus.title = '新建标签页';
    Object.assign(plus.style, { flexShrink:'0', padding:'4px 10px' });
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

  // 轮询：捕获同源页面 SPA 式 URL 变化（pushState/replaceState 不触发 load），同步地址栏与标签标题
  window.__tzBrWatcher = setInterval(() => {
    tabs.forEach(t => {
      if (!document.body.contains(t.frame)) return;
      let cur = '';
      try { cur = t.frame.contentWindow.location.href; } catch (e) { return; }
      if (cur && cur !== 'about:blank' && cur !== t.url) {
        t.url = cur;
        try { t.title = (t.frame.contentDocument && t.frame.contentDocument.title) || ''; } catch {}
        if (t.id === activeId) urlInput.value = cur;
        renderTabs();
      }
    });
  }, 800);

  newTab('');
}

/* ===================== 刷新已打开的应用窗口 ===================== */
function refreshOpenApp(appId) {
  const w = WM.windows.find(x => x.appId === appId);
  if (w) { w.body.innerHTML = ''; if (w.app.type === 'builtin') w.body.innerHTML = w.app.render(); initAppHooks(appId); }
}
function initAppHooks(appId) {
  if (appId === 'ai-chat') initChat();
  if (appId === 'app-store') initAppStore();
  if (appId === 'settings') initSettings();
  if (appId === 'ai-config') initAIConfig();
  if (appId === 'browser') initBrowser();
  if (appId === 'tips') initTips();
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
  tick(); setInterval(tick, 1000);
}

/* ===================== 开机流程 ===================== */
async function boot() {
  const tips = ['正在唤醒系统…', '加载桌面环境…', '注册应用…', '连接存储…', '准备就绪…'];
  const tipEl = $('#bootTip');
  let i = 0;
  const tipTimer = setInterval(() => { tipEl.textContent = tips[i % tips.length]; i++; }, 380);

  applyDeviceStyle();
  Desktop.render();
  FloatingWidget.init();
  startClock();
  bindGlobalEvents();

  await new Promise(r => setTimeout(r, 1400));
  clearInterval(tipTimer);

  const boot = $('#bootScreen');
  boot.classList.add('gone');
  setTimeout(() => { boot.style.display = 'none'; $('#desktop').hidden = false; }, 600);

  Store.addNotif({ title: '欢迎使用天择OS', body: '所有天择网功能已预装为应用。点击「🔑 AI 配置」开始使用 AI 功能。' });
  Store.addNotif({ title: '软件商城已就绪', body: '输入一句话，让 AI 为你生成专属软件。' });
}

/* ===================== 全局事件绑定 ===================== */
function bindGlobalEvents() {
  // 开始按钮
  $('#btnStart').onclick = (e) => { e.stopPropagation(); StartMenu.toggle(); };
  // 风格切换按钮（任务栏）
  $('#btnStyle').onclick = (e) => { e.stopPropagation(); toggleStyle(); };
  // AI 配置快捷按钮（任务栏）
  $('#btnAiConfig').onclick = (e) => { e.stopPropagation(); launchApp('ai-config'); };
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
    showCtxMenu(e.clientX, e.clientY, [
      { icon: '🔄', label: '刷新系统', act: () => location.reload() },
      { sep: true },
      { icon: '🌐', label: '返回天择网', act: () => { window.location.href = TZNET_BASE + 'index.html'; } }
    ]);
  };
  // 时钟点击 → 通知中心
  $('#tbClock').onclick = (e) => { e.stopPropagation(); toggleNotifCenter(); };
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
      { icon: '🌐', label: '返回天择网', act: () => { window.location.href = TZNET_BASE + 'index.html'; } }
    ]);
  });
  // 开始菜单搜索
  $('#startSearch').oninput = (e) => StartMenu.render(e.target.value);
  // 窗口大小变化重新适配
  window.addEventListener('resize', () => { applyDeviceStyle(); Desktop.render(); });
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
      if (document.fullscreenElement) { document.exitFullscreen(); }
      else { try { document.documentElement.requestFullscreen(); } catch (err) {} }
    }
    if (e.ctrlKey && e.key === ' ') { e.preventDefault(); StartMenu.toggle(); }
  });
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
  goHome: () => { window.location.href = TZNET_BASE + 'index.html'; }
});

})();
