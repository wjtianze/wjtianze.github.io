/* ============================================================
   天择OS · 核心逻辑
   模块：Storage | Device | Apps | Desktop | WindowManager
         | Taskbar | StartMenu | ContextMenu | AIEngine
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
  // AI 配置
  getAIConfig() {
    return this.get('aiConfig', { url: 'https://api.deepseek.com/v1/chat/completions', key: '', model: 'deepseek-chat' });
  },
  setAIConfig(cfg) { this.set('aiConfig', cfg); },
  // 桌面风格
  getStyle() { return this.get('desktopStyle', null); }, // null=自动, 'win', 'mac'
  setStyle(s) { this.set('desktopStyle', s); },
  // AI 对话历史
  getChat() { return this.get('chatHistory', []); },
  setChat(h) { this.set('chatHistory', h.slice(-100)); },
  // 通知
  getNotifs() { return this.get('notifs', []); },
  addNotif(n) { const ns = this.getNotifs(); ns.unshift({ ...n, time: Date.now() }); this.set('notifs', ns.slice(0, 30)); },
  clearNotifs() { this.set('notifs', []); }
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
const isMobile = () => navigator.maxTouchPoints > 1 || window.innerWidth < 768;

/* ===================== 设备检测 ===================== */
function applyDeviceStyle() {
  const mobile = isMobile();
  document.body.classList.toggle('mobile', mobile);
  const auto = Store.getStyle();
  let style = auto || (mobile ? 'ios' : 'win');
  if (mobile) {
    $('#taskbar').hidden = true;
    $('#macBar').hidden = true;
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
    $('#macBar').hidden = !isMac;
    $('#taskbar').hidden = isMac ? false : false; // 任务栏两种都保留（mac 用作 dock 底栏）
  }
}

/* ===================== 应用注册表 ===================== */
// 内置应用：返回 HTML 字符串由窗口渲染
const BUILTIN_APPS = {
  'ai-config': {
    name: 'AI 配置', icon: '🔑', grad: true, category: 'system',
    desc: '配置 AI 接口（URL、Key、模型）',
    render: () => renderAIConfig()
  },
  'ai-chat': {
    name: 'AI 对话', icon: '💬', grad: true, category: 'ai',
    desc: '与 AI 助手对话',
    render: () => renderAIChat(),
    singleton: true
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
  const installed = Store.getApps().map(a => ({ ...a, type: 'installed' }));
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

    // 尺寸与位置
    const w = opts.width || 720, h = opts.height || 480;
    const offset = (this.openCount % 6) * 28;
    const left = opts.left ?? Math.max(20, (window.innerWidth - w) / 2 + offset - 70);
    const top = opts.top ?? Math.max(20, (window.innerHeight - h) / 2 + offset - 60);
    winEl.style.width = w + 'px';
    winEl.style.height = h + 'px';
    winEl.style.left = left + 'px';
    winEl.style.top = (mobile ? 0 : top) + 'px';

    // 标题栏
    const title = el('div', 'win-title');
    const icons = el('div', 'win-title-icons');
    const closeBtn = el('button', 'wctrl close', '<svg viewBox="0 0 8 8" fill="none" stroke="#5b0700" stroke-width="1.5"><path d="M1 1l6 6M7 1L1 7"/></svg>');
    closeBtn.title = '关闭';
    const minBtn = el('button', 'wctrl min', '<svg viewBox="0 0 8 8" fill="none" stroke="#5b3a00" stroke-width="1.5"><path d="M1 4h6"/></svg>');
    minBtn.title = '最小化';
    const maxBtn = el('button', 'wctrl max', '<svg viewBox="0 0 8 8" fill="none" stroke="#003d00" stroke-width="1.5"><path d="M1 1h6v6H1z"/></svg>');
    maxBtn.title = '最大化';
    icons.append(closeBtn, minBtn, maxBtn);

    const titleIcon = el('span', 'win-title-icon', app.icon || '📦');
    const titleText = el('span', 'win-title-text', escapeHtml(app.name || '应用'));
    const spacer = el('div', 'win-title-spacer');
    // mac 风格：[圆点][图标][标题居中][平衡占位]；Windows 风格：[图标][标题左对齐][按钮在右]
    if (isMac) { title.append(icons, titleIcon, titleText, spacer); }
    else { title.append(titleIcon, titleText, icons); }

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
    title.ondblclick = () => { if (!isMobile()) this.toggleMax(id); };
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
      const iframe = el('iframe', 'app-iframe');
      iframe.src = app.url;
      iframe.loading = 'lazy';
      const loading = el('div', 'app-loading', '<div class="al-spin"></div><div>正在加载 ' + escapeHtml(app.name) + '…</div>');
      body.appendChild(loading);
      iframe.onload = () => { loading.remove(); body.appendChild(iframe); };
      iframe.onerror = () => { loading.innerHTML = '<div class="app-error"><div class="ae-icon">⚠️</div>加载失败<br/><small>无法连接到 ' + escapeHtml(app.url) + '</small></div>'; };
      // 超时保护
      setTimeout(() => { if (loading.parentNode) loading.querySelector('.al-spin').style.borderTopColor = '#ef4444'; }, 8000);
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
    // 触发 onClose 钩子
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
      w.el.style.left = '0'; w.el.style.top = '0';
      w.el.style.width = '100%'; w.el.style.height = '100%';
    }
    this.focus(id);
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
    running.innerHTML = '';
    WM.windows.forEach(w => {
      const t = el('button', 'tb-task' + (w.el.classList.contains('focused') ? ' active' : ''));
      t.innerHTML = `<span class="tb-task-icon">${w.app.icon || '📦'}</span><span class="tb-task-name">${escapeHtml(w.app.name)}</span>`;
      t.onclick = () => {
        if (w.minimized) WM.restore(w.id);
        else if (w.el.classList.contains('focused')) WM.minimize(w.id);
        else WM.focus(w.id);
      };
      t.oncontextmenu = (e) => { e.preventDefault(); showCtxMenu(e.clientX, e.clientY, [{ icon: '✕', label: '关闭窗口', act: () => WM.close(w.id) }]); };
      running.appendChild(t);
    });
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
    this.render();
    setTimeout(() => $('#startSearch').focus(), 50);
  },
  hide() { this.open = false; $('#startMenu').hidden = true; $('#btnStart').classList.remove('active'); },
  render(filter = '') {
    const apps = getAllApps().filter(a => !filter || a.name.toLowerCase().includes(filter.toLowerCase()) || (a.desc||'').includes(filter));
    const grid = $('#startApps');
    grid.innerHTML = '';
    // 分类排序
    const order = ['system','ai','tznet','game','tool'];
    apps.sort((a,b) => { const ia = order.indexOf(a.category), ib = order.indexOf(b.category); return (ia-ib) || a.name.localeCompare(b.name); });
    apps.forEach(app => {
      const a = el('div', 'start-app');
      a.innerHTML = `<div class="sa-icon${app.grad?' grad':''}">${app.icon||'📦'}</div><div class="sa-name">${escapeHtml(app.name)}</div>`;
      a.onclick = () => { launchApp(app.id); this.hide(); };
      grid.appendChild(a);
    });
    if (!apps.length) grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--ink-faint);padding:30px;font-size:13px;">未找到匹配的应用</div>';
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

/* ===================== 桌面渲染 ===================== */
const Desktop = {
  selected: null,
  render() {
    const iconsEl = $('#desktopIcons');
    const homeEl = $('#homeScreen');
    iconsEl.innerHTML = '';
    homeEl.innerHTML = '';
    const apps = getAllApps();
    // 桌面显示所有应用
    apps.forEach(app => {
      const ic = this.makeIcon(app);
      iconsEl.appendChild(ic);
      // 移动端主屏副本
      const ic2 = ic.cloneNode(true);
      this.bindIcon(ic2, app);
      homeEl.appendChild(ic2);
    });
    // 移动端 Dock：固定应用
    this.renderDock();
  },
  makeIcon(app) {
    const ic = el('div', 'desktop-icon');
    ic.dataset.appId = app.id;
    const badge = app.badge ? `<span class="di-badge">${app.badge}</span>` : '';
    ic.innerHTML = `<div class="di-icon${app.grad?' grad':''}">${app.icon||'📦'}${badge}</div><div class="di-label">${escapeHtml(app.name)}</div>`;
    this.bindIcon(ic, app);
    return ic;
  },
  bindIcon(ic, app) {
    let lastTap = 0;
    ic.onclick = (e) => {
      e.stopPropagation();
      // 双击打开（PC），单击打开（移动端）
      const now = Date.now();
      const dbl = now - lastTap < 350;
      lastTap = now;
      if (isMobile() || dbl) {
        launchApp(app.id);
      } else {
        this.select(ic);
      }
    };
    ic.ondblclick = (e) => { e.stopPropagation(); if (!isMobile()) launchApp(app.id); };
    ic.oncontextmenu = (e) => {
      e.preventDefault(); e.stopPropagation();
      const items = [
        { icon: '▶', label: '打开', act: () => launchApp(app.id) }
      ];
      if (app.type === 'installed') {
        items.push({ sep: true });
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
  renderDock() {
    const dock = $('#mobileDock');
    if (!isMobile()) { dock.innerHTML = ''; return; }
    dock.innerHTML = '';
    const dockApps = ['ai-chat', 'app-store', 'ai-config', 'tz-home', 'tz-gpa', 'settings'];
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
  } else if (id === 'about' || id === 'ai-config' || id === 'settings' || id === 'file-manager') {
    defaults.width = 560; defaults.height = 520;
  }
  return WM.create({ app, ...defaults, ...opts });
}

function uninstallApp(id) {
  if (!confirm('确定要卸载这个软件吗？')) return;
  Store.removeApp(id);
  // 关闭对应窗口
  WM.windows.filter(w => w.appId === id).forEach(w => WM.close(w.id));
  Desktop.render();
  StartMenu.render();
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

/* ===================== AI 引擎 ===================== */
const AI = {
  config() { return Store.getAIConfig(); },
  isReady() { const c = this.config(); return !!(c.url && c.key && c.model); },

  // 通用 chat completion（非流式）
  async chat(messages, opts = {}) {
    const c = this.config();
    if (!this.isReady()) throw new Error('AI 未配置，请先在「AI 配置」中设置 URL、Key 和模型。');
    const res = await fetch(c.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.key },
      body: JSON.stringify({ model: c.model, messages, temperature: opts.temperature ?? 0.7, max_tokens: opts.max_tokens ?? 4096, stream: false })
    });
    if (!res.ok) { const t = await res.text().catch(()=> ''); throw new Error('AI 接口错误 ' + res.status + '：' + t.slice(0,200)); }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  },

  // 流式 chat
  async chatStream(messages, onChunk, opts = {}) {
    const c = this.config();
    if (!this.isReady()) throw new Error('AI 未配置，请先在「AI 配置」中设置 URL、Key 和模型。');
    const res = await fetch(c.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.key },
      body: JSON.stringify({ model: c.model, messages, temperature: opts.temperature ?? 0.7, max_tokens: opts.max_tokens ?? 4096, stream: true })
    });
    if (!res.ok) { const t = await res.text().catch(()=> ''); throw new Error('AI 接口错误 ' + res.status + '：' + t.slice(0,200)); }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', full = '';
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
        if (data === '[DONE]') return full;
        try {
          const j = JSON.parse(data);
          const delta = j.choices?.[0]?.delta?.content || '';
          if (delta) { full += delta; onChunk(delta, full); }
        } catch {}
      }
    }
    return full;
  },

  // 智能优化提示词
  async refinePrompt(userPrompt) {
    const sys = `你是一位资深软件产品经理与全栈工程师。用户想用一句话创建一个浏览器内运行的小软件。请把用户的模糊需求优化为一份清晰的软件规格说明书。

输出格式（严格遵循，不要加任何额外说明或代码块包裹）：
名称|一句话描述|主要功能1,主要功能2,主要功能3,主要功能4,主要功能5|界面要点|交互要点

要求：
- 名称：4-8个字，朗朗上口
- 主要功能：3-6条，每条简短
- 界面要点：描述布局和视觉风格
- 交互要点：描述关键交互
- 所有内容用中文，简洁清晰`;
    const out = await this.chat([{ role: 'system', content: sys }, { role: 'user', content: userPrompt }], { temperature: 0.5, max_tokens: 600 });
    return out.trim();
  },

  // 根据规格生成完整 HTML 软件
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
    return await this.chatStream([{ role: 'system', content: sys }, { role: 'user', content: '请生成这个软件' }], onChunk, { temperature: 0.7, max_tokens: 8192 });
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
  toast('正在测试连接…', 1500);
  try {
    const r = await AI.chat([{role:'user',content:'请回复"OK"'}], { max_tokens: 10 });
    toast('✓ 连接成功：' + r.slice(0, 30));
  } catch (e) { toast('✗ ' + e.message.slice(0, 60), 4000); }
};

/* ===================== 内置应用：AI 对话 ===================== */
function renderAIChat() {
  const history = Store.getChat();
  return `
  <div class="app-chat" id="chatApp">
    <div class="chat-messages" id="chatMsgs"></div>
    <div class="chat-input-bar">
      <textarea class="textarea" id="chatInput" placeholder="输入消息，Enter 发送，Shift+Enter 换行…" rows="1"></textarea>
      <button class="chat-send" id="chatSend" title="发送">➤</button>
    </div>
  </div>`;
}
function initChat() {
  const msgs = $('#chatMsgs');
  const input = $('#chatInput');
  const sendBtn = $('#chatSend');
  const history = Store.getChat();
  if (!history.length) {
    msgs.innerHTML = `<div class="chat-empty">
      <div class="ce-icon">💬</div>
      <div class="ce-title">天择 AI 助手</div>
      <div style="font-size:12px;max-width:360px">${AI.isReady()?'问我任何问题，或试试下面的建议':'请先在「AI 配置」中设置 API Key 才能开始对话'}</div>
      <div class="ce-suggest">
        ${AI.isReady()?['介绍一下你自己','帮我写一首关于夏天的诗','解释一下量子纠缠'].map(s=>`<div class="chat-suggest-chip" onclick="TZOS.chatSuggest(this.textContent)">${s}</div>`).join(''):'<div class="chat-suggest-chip" onclick="TZOS.openConfig()">去配置 →</div>'}
      </div>
    </div>`;
  } else {
    history.forEach(m => appendMsg(m.role, m.content));
  }
  input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } };
  input.oninput = () => { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; };
  sendBtn.onclick = sendChat;
}
function appendMsg(role, content) {
  const msgs = $('#chatMsgs');
  // 移除空状态
  const empty = msgs.querySelector('.chat-empty');
  if (empty) empty.remove();
  const m = el('div', 'msg ' + role);
  m.innerHTML = `<div class="msg-avatar">${role==='ai'?'🤖':'🧑'}</div><div class="msg-bubble">${renderMd(content)}</div>`;
  msgs.appendChild(m);
  msgs.scrollTop = msgs.scrollHeight;
  return m;
}
function renderMd(text) {
  // 简易 markdown：代码块、行内代码、加粗、换行
  let html = escapeHtml(text);
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_,l,c) => `<pre><code>${c.replace(/&lt;\/?pre.*?>/g,'')}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.3);padding:2px 5px;border-radius:4px;font-size:0.9em">$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n/g, '<br>');
  return html;
}
async function sendChat() {
  const input = $('#chatInput');
  const sendBtn = $('#chatSend');
  const text = input.value.trim();
  if (!text) return;
  if (!AI.isReady()) { toast('请先配置 AI'); launchApp('ai-config'); return; }
  input.value = ''; input.style.height = 'auto';
  appendMsg('user', text);
  const history = Store.getChat();
  history.push({ role: 'user', content: text });
  // AI 回复占位
  const aiMsg = appendMsg('ai', '<span class="typing-dots"><span></span><span></span><span></span></span>');
  sendBtn.disabled = true;
  const msgs = $('#chatMsgs');
  let full = '';
  try {
    const sysMsg = { role: 'system', content: '你是天择 AI 助手，运行在天择OS中。回答简洁有用，使用中文。可以写代码（用markdown代码块）。' };
    await AI.chatStream([sysMsg, ...history.slice(-12).map(m => ({role: m.role==='ai'?'assistant':'user', content: m.content}))],
      (delta, all) => {
        full = all;
        aiMsg.querySelector('.msg-bubble').innerHTML = renderMd(all);
        msgs.scrollTop = msgs.scrollHeight;
      });
    history.push({ role: 'ai', content: full });
    Store.setChat(history);
  } catch (e) {
    aiMsg.querySelector('.msg-bubble').innerHTML = `<span style="color:#fca5a5">⚠ ${escapeHtml(e.message)}</span>`;
  } finally {
    sendBtn.disabled = false;
  }
}
window.TZOS.chatSuggest = function(t) { $('#chatInput').value = t; sendChat(); };
window.TZOS.openConfig = function() { launchApp('ai-config'); };

/* ===================== 内置应用：软件商城 ===================== */
function renderAppStore() {
  const installed = Store.getApps();
  return `
  <div class="app-store">
    <div class="store-header">
      <h2>🛒 软件商城</h2>
      <p>用一句话描述你想要的软件，AI 会为你生成并安装</p>
    </div>
    <div class="store-form">
      <input class="input" id="storePrompt" placeholder="例如：一个贪吃蛇游戏 / 一个番茄钟计时器 / 一个markdown笔记…" />
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
      <button onclick="TZOS.openInstalled('${a.id}')">打开</button>
      <button onclick="TZOS.uninstall('${a.id}')">卸载</button>
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
    // 步骤1：优化提示词
    const spec = await AI.refinePrompt(prompt);
    $('#refinedBox').innerHTML = escapeHtml(spec).replace(/\|/g, '<br><span class="opt">▸ </span>');
    // 步骤2：生成代码
    $('#codeProgress').textContent = '开始生成代码…';
    let code = '';
    code = await AI.generateApp(spec, prompt, (delta, all) => {
      code = all;
      $('#codeProgress').textContent = '生成中… ' + all.length + ' 字符';
    });
    // 清理：去掉可能的 markdown 包裹
    code = code.trim();
    if (code.startsWith('```')) { code = code.replace(/^```(?:html)?\n?/, '').replace(/```$/, ''); }
    if (!code.includes('<!DOCTYPE') && !code.includes('<html')) {
      throw new Error('生成的代码不完整，请重试');
    }
    $('#codeProgress').textContent = '✓ 生成完成，共 ' + code.length + ' 字符';
    // 解析规格中的名称
    const nameMatch = spec.split('|')[0]?.trim() || '新软件';
    const descMatch = spec.split('|')[1]?.trim() || prompt;
    // 安装
    const appId = 'app-' + Date.now();
    Store.saveApp({
      id: appId, name: nameMatch, desc: descMatch, icon: '📦', grad: true,
      html: code, prompt, spec, createdAt: Date.now()
    });
    Desktop.render();
    StartMenu.render();
    refreshInstalledList();
    toast('✓ ' + nameMatch + ' 已安装到桌面');
    input.value = '';
    // 自动打开
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
      <div><div class="sr-label">刷新桌面</div><div class="sr-desc">重新加载所有图标</div></div>
      <button class="btn sm" onclick="TZOS.Desktop.render();TZOS.StartMenu.render();TZOS.toast('已刷新')">刷新</button>
    </div>
    <div class="setting-row">
      <div><div class="sr-label">关闭所有窗口</div><div class="sr-desc">清理桌面</div></div>
      <button class="btn sm ghost" onclick="TZOS.WM.closeAll()">关闭全部</button>
    </div>
    <div class="setting-row">
      <div><div class="sr-label">清空对话历史</div><div class="sr-desc">删除所有 AI 对话记录</div></div>
      <button class="btn sm ghost" onclick="if(confirm('确定清空？')){TZOS.Store.setChat([]);TZOS.toast('已清空')}">清空</button>
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
window.TZOS.setStyle = function(s) { Store.setStyle(s); applyDeviceStyle(); Desktop.render(); refreshOpenApp('settings'); toast('风格已切换'); };
window.TZOS.reset = function() {
  if (!confirm('⚠️ 这将清除天择OS的所有本地数据（已安装软件、AI配置、对话历史），确定继续吗？')) return;
  if (!confirm('再次确认：此操作不可恢复！')) return;
  localStorage.removeItem(Store.KEY);
  location.reload();
};

/* ===================== 内置应用：关于 ===================== */
function renderAbout() {
  return `
  <div style="padding:30px;text-align:center">
    <div style="width:72px;height:72px;margin:0 auto 18px;border-radius:18px;background:var(--grad-main);display:flex;align-items:center;justify-content:center;font-size:38px">🖥️</div>
    <h2 style="font-size:22px;background:var(--grad-main);-webkit-background-clip:text;background-clip:text;color:transparent">天择OS</h2>
    <p style="color:var(--ink-faint);font-size:13px;margin-top:6px">v1.0.0 · 浏览器内全屏操作系统</p>
    <div style="margin:24px 0;padding:16px;background:rgba(255,255,255,0.04);border-radius:12px;text-align:left;font-size:13px;line-height:1.9;color:var(--ink-dim)">
      <div>🌐 <b>天择网</b> —— 所有功能预装为应用</div>
      <div>🤖 <b>AI 引擎</b> —— 对话 + 代码生成</div>
      <div>🛒 <b>软件商城</b> —— 一句话生成新软件</div>
      <div>💾 <b>本地存储</b> —— 数据持久化在浏览器</div>
      <div>📱 <b>自适应</b> —— PC/移动端自动切换风格</div>
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
        <button class="btn sm ghost" style="border-color:#ef4444;color:#fca5a5" onclick="TZOS.uninstallApp('${a.id}');TZOS.refreshOpenApp('file-manager')">卸载</button>
      </div>`).join('')}
  </div>`;
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
// 在窗口创建后初始化
const origRender = WM.renderContent.bind(WM);
WM.renderContent = function(winObj, opts) {
  origRender(winObj, opts);
  setTimeout(() => initAppHooks(winObj.appId), 0);
};

/* ===================== 时钟 ===================== */
function startClock() {
  const tick = () => {
    const d = new Date();
    const tc = $('#tbClock'); const mc = $('#macClock');
    const t = fmtTime(d) + '<br>' + fmtDate(d);
    if (tc) tc.innerHTML = t;
    if (mc) mc.textContent = `${d.getMonth()+1}月${d.getDate()}日 ${fmtTime(d)}`;
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
  startClock();
  bindGlobalEvents();

  await new Promise(r => setTimeout(r, 1400));
  clearInterval(tipTimer);

  const boot = $('#bootScreen');
  boot.classList.add('gone');
  setTimeout(() => { boot.style.display = 'none'; $('#desktop').hidden = false; }, 600);

  // 欢迎通知
  Store.addNotif({ title: '欢迎使用天择OS', body: '所有天择网功能已预装为应用。点击「🔑 AI 配置」开始使用 AI 功能。' });
  Store.addNotif({ title: '软件商城已就绪', body: '输入一句话，让 AI 为你生成专属软件。' });
}

/* ===================== 全局事件绑定 ===================== */
function bindGlobalEvents() {
  // 开始按钮
  $('#btnStart').onclick = (e) => { e.stopPropagation(); StartMenu.toggle(); };
  // 风格切换按钮
  $('#btnStyle').onclick = (e) => {
    e.stopPropagation();
    const cur = Store.getStyle();
    const next = cur === 'mac' ? 'win' : 'mac';
    Store.setStyle(next);
    applyDeviceStyle();
    Desktop.render();
    toast('切换为 ' + (next === 'mac' ? 'macOS' : 'Windows') + ' 风格');
  };
  // AI 配置快捷按钮
  $('#btnAiConfig').onclick = (e) => { e.stopPropagation(); launchApp('ai-config'); };
  // 设置按钮
  $('#btnSettings').onclick = (e) => { e.stopPropagation(); StartMenu.hide(); launchApp('settings'); };
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
    if (!e.target.closest('.desktop-icon') && !e.target.closest('.start-app')) Desktop.clearSelect();
  });
  // 桌面右键
  $('#desktop').addEventListener('contextmenu', (e) => {
    if (e.target.closest('.desktop-icon') || e.target.closest('.win')) return;
    e.preventDefault();
    showCtxMenu(e.clientX, e.clientY, [
      { icon: '🔄', label: '刷新桌面', act: () => { Desktop.render(); StartMenu.render(); } },
      { icon: '🛒', label: '打开软件商城', act: () => launchApp('app-store') },
      { icon: '💬', label: 'AI 对话', act: () => launchApp('ai-chat') },
      { sep: true },
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
    if (e.key === 'Escape') { StartMenu.hide(); hideCtxMenu(); }
    if (e.ctrlKey && e.key === ' ') { e.preventDefault(); StartMenu.toggle(); }
  });
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
