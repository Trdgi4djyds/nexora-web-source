/* Un appareil affiché : cadre, page (webview), curseurs de défilement.
 *
 * Affichage HD : la webview a la taille de l'écran multipliée par K et l'émulation demande à Chrome
 * de dessiner la page à cette échelle. La surface vaut alors la définition réelle de l'appareil :
 * l'image affichée est nette, les photos et les vidéos sont en pleine définition.
 */
import { lockScreenDataUrl } from '../devices/wallpapers.js';
import { api } from '../core/api.js';
import { settings } from '../core/settings.js';
import {
  Emitter, h, esc, noop, sleep, clamp, loadImageB64,
} from '../core/dom.js';
import { getDevice, resolveState } from '../devices/catalog.js';
import { layoutDevice } from '../devices/geometry.js';
import {
  drawDevice, drawOverlays, drawStatusBar, luminance,
} from '../devices/frames2d.js';
import { uaFor } from './emulation.js';

const MARGIN = 80; // marge autour du cadre pour l'ombre
const winDpr = () => window.devicePixelRatio || 1;

function sizeCanvas(cv, w, h, bs) {
  const k = Math.min(bs, 8192 / Math.max(w, h, 1));
  cv.width = Math.max(1, Math.ceil(w * k));
  cv.height = Math.max(1, Math.ceil(h * k));
  cv.style.width = `${w}px`;
  cv.style.height = `${h}px`;
  const ctx = cv.getContext('2d');
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, k };
}

// Version web : la page s'affiche dans un cadre <nx-webview> (voir web/webview.js).
const WV = typeof window !== 'undefined' && window.__NEXORA_WEB__ ? 'nx-webview' : 'webview';

export class DeviceView extends Emitter {
  constructor(board, cfg) {
    super();
    this.board = board;
    this.cfg = cfg;
    this.uid = cfg.uid;
    this.ready = false;
    this.wcId = null;
    this.url = null;
    this.title = '';
    this.loading = false;
    this.error = null;
    this.scroll = null;
    this.topColor = '#ffffff';
    this.console = [];
    this.net = [];
    this.tech = null;
    this.scale = 1;
    this.K = 1;
    this.message = null;
    this.syncUrl = null;
    this.activeAt = 0;
    this.pendingUrl = null;
    this.emuQueue = Promise.resolve();

    this.el = h(`
      <div class="dv" data-uid="${esc(this.uid)}">
        <div class="dv-head"></div>
        <div class="dv-stage">
          <div class="dv-device">
            <div class="dv-scale">
              <canvas class="dv-body"></canvas>
              <div class="dv-screen">
                <canvas class="dv-sb"></canvas>
                <div class="dv-wvbox"><${WV} partition="persist:vitrine" allowpopups src="about:blank"></${WV}></div>
                <canvas class="dv-ov"></canvas>
                <div class="dv-msg" hidden></div>
              </div>
            </div>
          </div>
          <div class="vscroll" role="scrollbar" aria-orientation="vertical" aria-label="Défilement vertical de la page" tabindex="0"><div class="thumb"></div></div>
          <div class="hscroll" role="scrollbar" aria-orientation="horizontal" aria-label="Défilement horizontal de la page" tabindex="0"><div class="thumb"></div></div>
        </div>
      </div>`);
    const q = (s) => this.el.querySelector(s);
    this.$ = {
      head: q('.dv-head'), stage: q('.dv-stage'), device: q('.dv-device'), scale: q('.dv-scale'), body: q('.dv-body'), screen: q('.dv-screen'), sb: q('.dv-sb'), wvbox: q('.dv-wvbox'), ov: q('.dv-ov'), msg: q('.dv-msg'), vs: q('.vscroll'), hs: q('.hscroll'),
    };
    this.wv = q(WV);
    this.bindWebview();
    this.bindScrollbar(this.$.vs, 'y');
    this.bindScrollbar(this.$.hs, 'x');
    this.el.addEventListener('pointerdown', () => this.board.setFocus(this.uid), true);
    this.el.addEventListener('wheel', () => { this.activeAt = Date.now(); }, { capture: true, passive: true });
    this.applyLayout();
  }

  // ------------------------------------------------------------------ appareil
  get dev() { return getDevice(this.cfg.deviceId, settings.custom); }
  get stateInfo() { return resolveState(this.dev, this.cfg.state); }
  get ua() { return uaFor(this.dev); }

  layoutFor(opts = {}) {
    return layoutDevice(this.dev, this.cfg.state, {
      land: this.cfg.land, framesOn: opts.framesOn ?? settings.framesOn, statusBar: opts.statusBar ?? settings.statusBar, color: this.cfg.color,
    });
  }

  surfaceK(L) {
    if (!settings.displayHD) return 1;
    let K = Math.max(1, L.dpr / winDpr());
    const max = this.board.multi ? 7e6 : 14e6;
    const area = L.vp.w * L.vp.h * (K * winDpr()) ** 2;
    if (area > max) K = Math.max(1, Math.sqrt(max / (L.vp.w * L.vp.h)) / winDpr());
    return Math.round(K * 1000) / 1000;
  }

  applyLayout() {
    const L = this.layoutFor();
    this.L = L;
    this.K = this.surfaceK(L);
    const { scale, body, screen, sb, wvbox, ov } = this.$;
    scale.style.width = `${L.TW}px`;
    scale.style.height = `${L.TH}px`;
    body.style.left = `${-MARGIN}px`;
    body.style.top = `${-MARGIN}px`;
    Object.assign(screen.style, {
      left: `${L.screen.x}px`, top: `${L.screen.y}px`, width: `${L.W}px`, height: `${L.H}px`, borderRadius: L.sr.map((r) => `${r}px`).join(' '),
    });
    screen.style.setProperty('--sw', String(Math.min(L.W, L.H)));
    Object.assign(wvbox.style, {
      left: `${L.vp.x}px`, top: `${L.vp.y}px`, width: `${L.vp.w}px`, height: `${L.vp.h}px`,
    });
    Object.assign(this.wv.style, {
      width: `${L.vp.w * this.K}px`, height: `${L.vp.h * this.K}px`, transform: `scale(${1 / this.K})`,
    });
    sb.hidden = !L.sb;
    ov.style.width = `${L.W}px`;
    ov.style.height = `${L.H}px`;
    this.draw();
    if (!this.url) { this.wpShown = this.wpKey === `${this.cfg.deviceId}|${L.color}|${L.W}x${L.H}` && this.wpShown; this.updateWallpaper(); }
  }

  // Taille affichée (pixels CSS de la fenêtre) et position des curseurs.
  setScale(s) {
    this.scale = s;
    const L = this.L;
    const w = Math.round(L.TW * s);
    const hgt = Math.round(L.TH * s);
    this.$.device.style.width = `${w}px`;
    this.$.device.style.height = `${hgt}px`;
    this.$.scale.style.transform = `scale(${s})`;
    const sx = L.screen.x * s;
    const sy = L.screen.y * s;
    const right = Math.max(w, (L.body.x + L.body.w) * s);
    Object.assign(this.$.vs.style, { left: `${right + 14}px`, top: `${sy + L.vp.y * s}px`, height: `${Math.max(40, L.vp.h * s)}px` });
    Object.assign(this.$.hs.style, { left: `${sx}px`, top: `${hgt + 14}px`, width: `${Math.max(40, L.W * s)}px` });
    this.$.stage.style.width = `${right + 30}px`;
    this.$.stage.style.height = `${hgt + 30}px`;
    this.draw();
    this.updateScrollbars();
  }

  draw() {
    const L = this.L;
    if (!L) return;
    const bs = this.scale * winDpr();
    const { ctx, k } = sizeCanvas(this.$.body, L.TW + MARGIN * 2, L.TH + MARGIN * 2, bs);
    ctx.translate(MARGIN, MARGIN);
    drawDevice(ctx, L, { px: k, shadow: true, screenFill: '#000' });
    const o = sizeCanvas(this.$.ov, L.W, L.H, bs);
    drawOverlays(o.ctx, L);
    this.drawStatus();
  }

  statusColors() {
    const bg = this.topColor || '#ffffff';
    return { bg, fg: luminance(bg) > 0.45 ? '#000000' : '#ffffff' };
  }

  drawStatus() {
    const L = this.L;
    this.$.sb.hidden = !L.sb;
    // Fond de la zone de la page : couleur du haut de la page, pour qu'aucun liseré n'apparaisse
    // à la jonction (position non entière) entre la barre d'état et la page.
    this.$.wvbox.style.background = this.topColor || '#fff';
    if (!L.sb) return;
    const { ctx } = sizeCanvas(this.$.sb, L.W, L.sb.h, this.scale * winDpr());
    const c = this.statusColors();
    drawStatusBar(ctx, L, c.bg, c.fg);
  }

  // ------------------------------------------------------------------ émulation
  emulation() {
    const L = this.L;
    const ua = this.ua;
    let hinge = null;
    if (L.hingeFeature) hinge = { orientation: L.hingeFeature.orientation, offset: L.hingeFeature.offset - (L.hingeFeature.orientation === 'horizontal' ? L.vp.y : 0), mask: L.hingeFeature.mask };
    return {
      width: L.vp.w, height: L.vp.h, screenWidth: L.W, screenHeight: L.H, dpr: L.dpr, mobile: ua.mobile, touch: ua.touch, ua: ua.ua, uaMeta: ua.uaMeta, landscape: L.land, hinge, scale: this.K,
    };
  }

  // Applique l'émulation si elle a changé. Sur une page déjà chargée, Chrome recalcule alors le zoom
  // (il dézoome les pages qui débordent) : on revient au zoom de départ de la page.
  emulate(force = false) {
    if (!this.wcId) return this.emuQueue;
    const emu = this.emulation();
    const key = JSON.stringify([emu, settings.env]);
    if (!force && key === this.emuKey) return this.emuQueue;
    const reapplied = this.emuKey != null;
    this.emuKey = key;
    this.emuQueue = this.emuQueue
      .then(() => api.invoke('device:emulate', { wcId: this.wcId, emu, env: settings.env }))
      .then(() => (reapplied && !this.skipNormalize ? this.normalizeScale() : null))
      .catch(noop);
    return this.emuQueue;
  }

  configurePage() {
    if (!this.ready) return;
    const ua = this.ua;
    try {
      this.wv.send('vitrine-config', {
        dragScroll: settings.dragScroll, touch: ua.touch && ua.mobile, pointer: Boolean(this.recording), syncClicks: this.board.multi && settings.sync.clicks, syncNav: settings.sync.nav,
        syncScroll: this.board.multi && settings.sync.scroll, syncInput: this.board.multi && settings.sync.input !== false,
      });
    } catch { /* page en chargement */ }
  }

  // Après un changement de taille sans rechargement (plier, pivoter), on revient au zoom de départ de la page.
  async normalizeScale() {
    if (!this.ready || !this.url || !this.ua.mobile) return;
    await sleep(150);
    const target = await this.wv.executeJavaScript(`(() => {
      const m = document.querySelector('meta[name="viewport"]');
      const i = m && /initial-scale\\s*=\\s*([\\d.]+)/i.exec(m.content);
      if (i) return parseFloat(i[1]);
      return ${this.L.vp.w} / Math.max(1, document.documentElement.clientWidth);
    })()`).catch(() => null);
    if (target && Number.isFinite(target) && target > 0.05 && target < 10) await api.invoke('device:set-scale', { wcId: this.wcId, scale: target });
  }

  async setDevice(deviceId) {
    this.cfg.deviceId = deviceId;
    this.cfg.state = null;
    this.cfg.land = false;
    this.cfg.color = null;
    this.applyLayout();
    this.board.relayout();
    this.skipNormalize = true;
    await this.emulate();
    this.skipNormalize = false;
    this.configurePage();
    // Nouveau chargement plutôt que reload : un reload restaure le zoom de l'appareil précédent.
    if (this.ready && this.url) this.wv.loadURL(this.url).catch(noop);
    this.emit('changed');
  }

  async setState(stateId) {
    this.cfg.state = stateId;
    this.applyLayout();
    this.board.relayout();
    await this.emulate();
    this.emit('changed');
  }

  cycleState() {
    const dev = this.dev;
    if (!dev.states) return;
    const cur = this.stateInfo;
    const i = dev.states.findIndex((s) => s.id === cur.id);
    this.setState(dev.states[(i + 1) % dev.states.length].id);
  }

  async rotate() {
    if (this.dev.fixed) return;
    this.cfg.land = !this.cfg.land;
    this.applyLayout();
    this.board.relayout();
    await this.emulate();
    this.emit('changed');
  }

  setColor(hex) {
    this.cfg.color = hex;
    this.applyLayout();
    this.emit('changed');
  }

  async refreshLayout() {
    this.applyLayout();
    this.board.relayout();
    await this.emulate();
  }

  // ------------------------------------------------------------------ page
  load(url, { sync = false } = {}) {
    if (!url) return;
    this.error = null;
    this.url = url;
    this.syncUrl = sync ? url : null;
    this.updateMessage();
    if (this.ready) this.wv.loadURL(url).catch(noop);
    else this.pendingUrl = url;
  }

  // Sans page : l'écran de verrouillage de l'appareil (fond d'écran et heure) s'affiche.
  updateWallpaper() {
    const L = this.L;
    const box = this.$ && this.$.wvbox;
    if (!L || !box) return;
    const show = !this.url && L.framesOn && this.ready;
    if (!show) return;
    // La page vide affiche l'écran de verrouillage (la webview est toujours au-dessus des autres calques).
    const key = `${this.cfg.deviceId}|${L.color}|${L.W}x${L.H}`;
    if (this.wpKey === key && this.wpShown) return;
    this.wpKey = key;
    const img = lockScreenDataUrl(this.dev, L.color, L.W, L.H, 2);
    const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#000 url("${img}") 0 0/100% 100% no-repeat;overflow:hidden}</style>`;
    this.wpShown = true;
    this.wv.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(noop);
  }

  blank() {
    this.url = null;
    this.wpShown = false;
    this.scroll = null;
    this.updateScrollbars();
    if (this.ready && this.L && this.L.framesOn) this.updateWallpaper();
    else if (this.ready) this.wv.loadURL('about:blank').catch(noop);
  }

  reload() {
    if (!this.ready || !this.url) return;
    this.error = null;
    this.updateMessage();
    this.wv.reload();
  }

  bindWebview() {
    const wv = this.wv;
    wv.addEventListener('dom-ready', async () => {
      if (this.ready) {
        // Contenu recréé par Chromium (webview rattachée) : nouvel identifiant, émulation à refaire.
        const id = wv.getWebContentsId();
        if (id !== this.wcId) { this.wcId = id; this.emuKey = null; await this.emulate(true); }
        this.configurePage();
        return;
      }
      this.ready = true;
      this.wcId = wv.getWebContentsId();
      await this.emulate();
      this.configurePage();
      const u = this.pendingUrl || this.url;
      this.pendingUrl = null;
      if (u) wv.loadURL(u).catch(noop);
      this.emit('ready');
      if (!u) this.updateWallpaper();
    });
    wv.addEventListener('did-start-loading', () => { this.loading = true; this.emit('loading', true); });
    wv.addEventListener('did-stop-loading', () => {
      this.loading = false;
      this.emit('loading', false);
      setTimeout(() => this.detectTech(), 600);
    });
    wv.addEventListener('did-fail-load', (e) => {
      if (!e.isMainFrame || e.errorCode === -3) return;
      this.error = { code: e.errorCode, text: e.errorDescription, url: e.validatedURL };
      this.updateMessage();
    });
    wv.addEventListener('did-navigate', (e) => {
      if (e.url === 'about:blank' || e.url.startsWith('data:text/html')) return;
      this.wpShown = false;
      this.url = e.url;
      this.error = null;
      this.console = [];
      this.net = [];
      this.tech = null;
      this.updateMessage();
      this.emit('navigate', { url: e.url, inPage: false });
    });
    wv.addEventListener('did-navigate-in-page', (e) => {
      if (!e.isMainFrame || e.url.startsWith('data:text/html')) return;
      this.url = e.url;
      this.emit('navigate', { url: e.url, inPage: true });
    });
    wv.addEventListener('page-title-updated', (e) => { this.title = e.title; this.emit('title', e.title); });
    wv.addEventListener('console-message', (e) => {
      const lvl = typeof e.level === 'number' ? ['debug', 'info', 'warning', 'error'][e.level] || 'info' : String(e.level || 'info');
      this.console.push({
        level: lvl, message: e.message, source: e.sourceId, line: e.line ?? e.lineNumber, at: Date.now(),
      });
      if (this.console.length > 2000) this.console.shift();
      this.emit('console');
    });
    wv.addEventListener('ipc-message', (e) => {
      const data = e.args[0];
      if (e.channel === 'vitrine-scroll') { this.scroll = data; this.updateScrollbars(); this.emit('scroll', data); }
      else if (e.channel === 'vitrine-pointer') { if (!this.replayingClick()) this.activeAt = Date.now(); this.emit('pointer', data); }
      else if (e.channel === 'vitrine-top') { if (data && data !== this.topColor) { this.topColor = data; this.drawStatus(); } }
      else if (e.channel === 'vitrine-click') this.emit('click', data);
      else if (e.channel === 'vitrine-input') this.emit('input', data);
      else if (e.channel === 'vitrine-located') { const f = this.pendingLocate && this.pendingLocate.get(data.req); if (f) { this.pendingLocate.delete(data.req); f(data); } }
      else if (e.channel === 'vitrine-spa-done') this.emit('spa-done', data);
      else if (e.channel === 'vitrine-active') {
        // Un clic rejoué par la synchronisation ne fait pas de cet appareil le meneur.
        if (this.replayingClick()) return;
        this.activeAt = Date.now();
        if (data === 'down') this.board.setFocus(this.uid);
      }
    });
    wv.addEventListener('render-process-gone', () => { this.error = { code: 'crash', text: 'La page a cessé de répondre.' }; this.updateMessage(); });
  }

  addNetError(n) {
    this.net.push({ ...n, at: Date.now() });
    if (this.net.length > 500) this.net.shift();
    this.emit('console');
  }

  async detectTech() {
    if (!this.ready || !this.url || this.url === 'about:blank' || !this.board.auditJs) return;
    try {
      this.tech = await this.wv.executeJavaScript(this.board.auditJs.tech);
      this.emit('tech');
    } catch { /* page en cours */ }
  }

  // ------------------------------------------------------------------ messages dans l'écran
  setMessage(info) { this.message = info; this.updateMessage(); }

  updateMessage() {
    let info = this.message;
    if (this.error) info = { title: this.error.code === 'crash' ? 'La page a planté' : "Impossible d'afficher la page", body: this.error.text || '', bad: true, retry: true };
    const el = this.$.msg;
    el.hidden = !info;
    if (!info) { el.innerHTML = ''; return; }
    el.className = `dv-msg screen-msg${info.bad ? ' bad' : ''}${info.busy ? ' busy' : ''}${info.welcome ? ' idle' : ''}`;
    if (info.welcome) { el.innerHTML = '<div class="idle-mark"><span></span><span></span></div>'; return; }
    el.innerHTML = `<div class="sm-inner">${info.busy ? '<div class="spinner"></div>' : ''}<div class="sm-title">${esc(info.title)}</div>${info.body ? `<div class="sm-body">${esc(info.body)}</div>` : ''}${info.retry ? '<button class="sm-btn">Réessayer</button>' : ''}</div>`;
    const b = el.querySelector('.sm-btn');
    if (b) b.onclick = () => { this.error = null; this.updateMessage(); this.wv.reload(); };
  }

  // ------------------------------------------------------------------ défilement
  scrollAxis(axis) {
    const s = this.scroll;
    if (!s) return null;
    const pos = axis === 'y' ? s.y : s.x;
    const view = axis === 'y' ? s.ch : s.cw;
    const total = axis === 'y' ? s.sh : s.sw;
    return {
      pos, view, total, max: Math.max(0, total - view),
    };
  }

  updateScrollbars() {
    for (const [el, axis] of [[this.$.vs, 'y'], [this.$.hs, 'x']]) {
      const a = this.scrollAxis(axis);
      const track = axis === 'y' ? el.clientHeight : el.clientWidth;
      const thumb = el.firstElementChild;
      const enabled = a && a.max > 1;
      el.classList.toggle('disabled', !enabled);
      if (!enabled) {
        thumb.style[axis === 'y' ? 'height' : 'width'] = `${track}px`;
        thumb.style.transform = 'none';
        el.removeAttribute('title');
        continue;
      }
      const len = Math.max(28, track * (a.view / a.total));
      const off = (track - len) * Math.min(1, a.pos / a.max);
      thumb.style[axis === 'y' ? 'height' : 'width'] = `${len}px`;
      thumb.style.transform = axis === 'y' ? `translateY(${off}px)` : `translateX(${off}px)`;
      el.title = `${Math.round((a.pos / a.max) * 100)} %`;
    }
  }

  scrollTo(axis, value) {
    if (!this.scroll || !this.ready) return;
    // Défilement demandé depuis NEXORA (barres de défilement, molette sur le cadre) : cet appareil mène.
    this.activeAt = Date.now();
    this.board.leader = this.uid;
    const a = this.scrollAxis(axis);
    const v = clamp(value, 0, a.max);
    if (axis === 'y') this.scroll.y = v; else this.scroll.x = v;
    this.updateScrollbars();
    this.wv.send('vitrine-scroll-to', { path: this.scroll.path, [axis]: v });
  }

  // Défilement suivi : même élément de contenu en haut d'écran si possible, sinon même proportion.
  syncScrollFrom(s) {
    if (!this.ready) return;
    const maxY = Math.max(1, s.sh - s.ch);
    const maxX = Math.max(1, s.sw - s.cw);
    try {
      this.wv.send('vitrine-scroll-sync', { anchor: s.anchor || null, ry: s.y / maxY, rx: s.sw - s.cw > 1 ? s.x / maxX : null });
    } catch { /* page en chargement */ }
  }

  // Position d'un élément à l'écran, pour y envoyer un vrai clic.
  locate(c) {
    if (!this.ready) return Promise.resolve({ ok: false });
    this.pendingLocate = this.pendingLocate || new Map();
    const req = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return new Promise((resolve) => {
      const t = setTimeout(() => { this.pendingLocate.delete(req); resolve({ ok: false }); }, 1200);
      this.pendingLocate.set(req, (d) => { clearTimeout(t); resolve(d); });
      try { this.wv.send('vitrine-locate', { ...c, req }); } catch { clearTimeout(t); resolve({ ok: false }); }
    });
  }

  replayingClick() { return Boolean(this.syncClicking && Date.now() - this.syncClicking < 600); }

  // Vrai clic (événements de confiance) aux coordonnées de la page, converties en coordonnées de la webview.
  clickAt(x, y) {
    const k = this.K || 1;
    const X = Math.round(x * k);
    const Y = Math.round(y * k);
    const wv = this.wv;
    try {
      this.syncClicking = Date.now();
      wv.sendInputEvent({ type: 'mouseMove', x: X, y: Y });
      wv.sendInputEvent({ type: 'mouseDown', x: X, y: Y, button: 'left', clickCount: 1 });
      wv.sendInputEvent({ type: 'mouseUp', x: X, y: Y, button: 'left', clickCount: 1 });
      return true;
    } catch { return false; }
  }

  scrollToRatio(ry, rx) {
    if (!this.ready) return;
    try { this.wv.send('vitrine-scroll-ratio', { ry, rx }); } catch { /* page en chargement */ }
  }

  bindScrollbar(el, axis) {
    const thumb = el.firstElementChild;
    thumb.addEventListener('pointerdown', (e) => {
      const a = this.scrollAxis(axis);
      if (!a || a.max <= 1) return;
      e.preventDefault();
      e.stopPropagation();
      this.activeAt = Date.now();
      thumb.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
      const start = axis === 'y' ? e.clientY : e.clientX;
      const startPos = a.pos;
      const track = axis === 'y' ? el.clientHeight : el.clientWidth;
      const len = Math.max(28, track * (a.view / a.total));
      const move = (ev) => {
        this.activeAt = Date.now();
        const d = (axis === 'y' ? ev.clientY : ev.clientX) - start;
        this.scrollTo(axis, startPos + (d / Math.max(1, track - len)) * a.max);
      };
      const up = () => {
        el.classList.remove('dragging');
        thumb.removeEventListener('pointermove', move);
        thumb.removeEventListener('pointerup', up);
        thumb.removeEventListener('pointercancel', up);
      };
      thumb.addEventListener('pointermove', move);
      thumb.addEventListener('pointerup', up);
      thumb.addEventListener('pointercancel', up);
    });
    el.addEventListener('pointerdown', (e) => {
      if (e.target === thumb) return;
      const a = this.scrollAxis(axis);
      if (!a || a.max <= 1) return;
      this.activeAt = Date.now();
      const tr = thumb.getBoundingClientRect();
      const before = (axis === 'y' ? e.clientY : e.clientX) < (axis === 'y' ? tr.top : tr.left);
      this.scrollTo(axis, a.pos + (before ? -1 : 1) * a.view * 0.9);
    });
    el.addEventListener('wheel', (e) => {
      const a = this.scrollAxis(axis);
      if (!a) return;
      e.preventDefault();
      this.activeAt = Date.now();
      this.scrollTo(axis, a.pos + (axis === 'y' ? e.deltaY : (e.deltaX || e.deltaY)));
    }, { passive: false });
    el.addEventListener('keydown', (e) => {
      const a = this.scrollAxis(axis);
      if (!a) return;
      const map = axis === 'y'
        ? { ArrowUp: -40, ArrowDown: 40, PageUp: -a.view * 0.9, PageDown: a.view * 0.9 }
        : { ArrowLeft: -40, ArrowRight: 40, PageUp: -a.view * 0.9, PageDown: a.view * 0.9 };
      this.activeAt = Date.now();
      if (e.key in map) { e.preventDefault(); this.scrollTo(axis, a.pos + map[e.key]); }
      if (e.key === 'Home') { e.preventDefault(); this.scrollTo(axis, 0); }
      if (e.key === 'End') { e.preventDefault(); this.scrollTo(axis, a.max); }
    });
  }

  // ------------------------------------------------------------------ captures
  /* Image de la page à la définition de l'appareil (canvas). fullPage : toute la hauteur. */
  async capturePage({ fullPage = false, maxSide = 30000 } = {}) {
    const L = this.L;
    const physW = Math.floor(L.vp.w * this.K * winDpr());
    const physH = Math.floor(L.vp.h * this.K * winDpr());
    const shot = await api.invoke('capture:shot', {
      wcId: this.wcId, fullPage, dpr: L.dpr, budget: { w: physW, h: physH }, maxSide, mobile: this.ua.mobile,
    });
    if (!shot || !shot.tiles || !shot.tiles.length) throw new Error(shot && shot.error ? shot.error : 'capture');
    const canvas = document.createElement('canvas');
    canvas.width = shot.width;
    canvas.height = shot.height;
    const ctx = canvas.getContext('2d');
    for (const t of shot.tiles) {
      // eslint-disable-next-line no-await-in-loop
      const img = await loadImageB64(t.data);
      ctx.drawImage(img, t.dx, t.dy);
    }
    canvas.cssWidth = shot.cssWidth;
    canvas.cssHeight = shot.cssHeight;
    return canvas;
  }

  dispose() {
    try { this.wv.remove(); } catch { /* déjà retiré */ }
    this.el.remove();
  }
}
