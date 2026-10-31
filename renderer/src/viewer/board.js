/* Planche : un ou plusieurs appareils, leur disposition, leur synchronisation. */
import { settings, persist } from '../core/settings.js';
import {
  Emitter, $, esc, uid, noop,
} from '../core/dom.js';
import { icon } from '../core/icons.js';
import { getDevice, resolveState, defaultColor } from '../devices/catalog.js';
import { DeviceView } from './deviceview.js';

export const MAX_DEVICES = 8;
const GAP = 46;

export class Board extends Emitter {
  constructor({ stage, container }) {
    super();
    this.stage = stage;
    this.container = container;
    this.views = new Map();
    this.currentUrl = null;
    this.message = null;
    this.auditJs = null;
    this.presenting = false;
    this.welcome = false;
    for (const cfg of settings.devices) this.createView(cfg);
    if (!this.views.has(settings.focused)) settings.focused = settings.devices[0].uid;
    this.applyMode();
    new ResizeObserver(() => this.relayout()).observe(stage);
  }

  get multi() { return settings.layout === 'multi'; }
  get focused() { return this.views.get(settings.focused) || [...this.views.values()][0]; }
  get list() { return settings.devices.map((c) => this.views.get(c.uid)).filter(Boolean); }

  createView(cfg) {
    const v = new DeviceView(this, cfg);
    this.views.set(cfg.uid, v);
    this.container.append(v.el);
    v.on('navigate', (e) => this.onNavigate(v, e));
    v.on('scroll', (s) => this.onScroll(v, s));
    v.on('input', (d) => this.onInput(v, d));
    v.on('spa-done', (d) => this.onSpaDone(v, d));
    v.on('click', (c) => this.onClick(v, c));
    v.on('ready', () => { if (this.currentUrl && !v.url) v.load(this.currentUrl, { sync: true }); this.emit('view-ready', v); });
    v.on('changed', () => { persist(); this.renderHeads(); this.emit('changed', v); });
    for (const ev of ['loading', 'title', 'console', 'tech', 'pointer']) v.on(ev, (d) => this.emit(`view-${ev}`, v, d));
    if (this.message) v.setMessage(this.message);
    if (this.currentUrl) v.load(this.currentUrl, { sync: true });
    return v;
  }

  // ------------------------------------------------------------------ appareils
  setFocus(id) {
    if (settings.focused === id || !this.views.has(id)) return;
    settings.focused = id;
    persist();
    for (const v of this.views.values()) v.el.classList.toggle('focused', v.uid === id);
    this.emit('focus', this.focused);
  }

  selectDevice(deviceId) {
    if (this.multi) {
      const existing = this.list.find((v) => v.cfg.deviceId === deviceId);
      if (existing) {
        if (this.views.size > 1) this.removeView(existing.uid);
        return;
      }
      this.addDevice(deviceId);
      return;
    }
    const v = this.focused;
    if (v.cfg.deviceId === deviceId) return;
    v.setDevice(deviceId);
    this.emit('focus', v);
  }

  addDevice(deviceId, extra = {}) {
    if (this.views.size >= MAX_DEVICES) { this.emit('limit'); return null; }
    const cfg = {
      uid: uid(), deviceId, state: null, land: false, color: null, ...extra,
    };
    settings.devices.push(cfg);
    const v = this.createView(cfg);
    settings.focused = cfg.uid;
    persist();
    this.applyMode();
    this.emit('focus', v);
    return v;
  }

  removeView(id) {
    if (this.views.size <= 1) return;
    const v = this.views.get(id);
    if (!v) return;
    v.dispose();
    this.views.delete(id);
    settings.devices = settings.devices.filter((c) => c.uid !== id);
    if (settings.focused === id) settings.focused = settings.devices[0].uid;
    persist();
    this.applyMode();
    this.emit('focus', this.focused);
  }

  setLayout(mode) {
    if (settings.layout === mode) return;
    settings.layout = mode;
    if (mode === 'single' && this.views.size > 1) {
      // On garde l'appareil sélectionné, les autres sont retirés de la planche.
      for (const v of [...this.views.values()]) if (v.uid !== settings.focused) v.dispose();
      for (const id of [...this.views.keys()]) if (id !== settings.focused) this.views.delete(id);
      settings.devices = settings.devices.filter((c) => c.uid === settings.focused);
    }
    persist();
    this.applyMode();
    for (const v of this.views.values()) { v.applyLayout(); v.emulate(); v.configurePage(); }
    this.emit('focus', this.focused);
    this.emit('layout');
  }

  applyMode() {
    document.body.classList.toggle('board-multi', this.multi);
    for (const v of this.views.values()) v.el.classList.toggle('focused', this.multi && v.uid === settings.focused);
    // Ordre d'affichage = ordre des réglages. On ne déplace jamais un appareil déjà affiché :
    // déplacer une webview dans la page recrée son contenu (page rechargée, émulation perdue).
    const order = settings.devices.map((c) => this.views.get(c.uid)).filter(Boolean).map((v) => v.el);
    const current = [...this.container.children];
    if (order.some((el, i) => current[i] !== el)) {
      for (const el of order) if (!el.isConnected) this.container.append(el);
    }
    this.renderHeads();
    this.relayout();
  }

  renderHeads() {
    for (const v of this.views.values()) {
      if (!this.multi) { v.$.head.innerHTML = ''; continue; }
      const dev = v.dev;
      const st = v.stateInfo;
      const states = dev.states ? `<div class="seg mini">${dev.states.map((s) => `<button class="${s.id === st.id ? 'on' : ''}" data-head-state="${esc(s.id)}">${esc(s.label)}</button>`).join('')}</div>` : '';
      v.$.head.innerHTML = `
        <span class="dh-dot" style="--c:${esc(v.cfg.color || defaultColor(dev))}"></span>
        <span class="dh-name" title="${esc(dev.name)}">${esc(dev.name)}</span>
        ${states}
        <button class="icon-btn small" data-head="rotate" ${dev.fixed ? 'disabled' : ''} title="Pivoter">${icon('rotate', 14)}</button>
        <button class="icon-btn small" data-head="remove" title="Retirer de la planche">${icon('close', 13)}</button>`;
      v.$.head.onclick = (e) => {
        const s = e.target.closest('[data-head-state]');
        if (s) { v.setState(s.dataset.headState); return; }
        const b = e.target.closest('[data-head]');
        if (!b) return;
        if (b.dataset.head === 'rotate') v.rotate();
        if (b.dataset.head === 'remove') this.removeView(v.uid);
      };
    }
  }

  // ------------------------------------------------------------------ disposition
  available() {
    const r = this.stage.getBoundingClientRect();
    const welcome = this.welcome;
    return {
      w: (welcome ? r.width * 0.42 : r.width) - 110,
      h: r.height - (this.presenting ? 130 : 170) - (this.multi ? 44 : 0),
    };
  }

  relayout() {
    const views = this.list;
    if (!views.length) return;
    const av = this.available();
    if (!this.multi) {
      const v = views[0];
      const fit = Math.max(0.05, Math.min(1, av.w / v.L.TW, av.h / v.L.TH));
      v.setScale(settings.zoom === 'fit' ? fit : settings.zoom);
      this.scaleValue = v.scale;
    } else {
      // Échelle réelle : même nombre de pixels par millimètre pour tous les appareils.
      const real = settings.boardScale === 'real';
      const mmW = views.map((v) => v.L.TW / v.L.k);
      const mmH = views.map((v) => v.L.TH / v.L.k);
      // Chaque appareil occupe sa largeur + son curseur vertical (30 px) ; GAP entre deux appareils.
      const freeW = Math.max(120, av.w - GAP * (views.length - 1) - 30 * views.length);
      let scales;
      if (real) {
        const totalW = mmW.reduce((a, b) => a + b, 0);
        const g = Math.min(av.h / Math.max(...mmH), freeW / totalW);
        scales = views.map((v) => g / v.L.k);
      } else {
        const base = views.map((v) => av.h / v.L.TH);
        const totalW = views.reduce((a, v, i) => a + v.L.TW * base[i], 0);
        const f = Math.min(1, freeW / totalW);
        scales = base.map((b) => b * f);
      }
      const z = settings.zoom === 'fit' ? 1 : settings.zoom;
      views.forEach((v, i) => v.setScale(Math.max(0.03, scales[i] * z)));
      this.scaleValue = z;
    }
    this.emit('relayout');
  }

  setZoom(z) { settings.zoom = z; persist(); this.relayout(); }

  // ------------------------------------------------------------------ pages
  loadAll(url) {
    this.currentUrl = url;
    for (const v of this.views.values()) v.load(url, { sync: true });
  }

  blankAll() {
    this.currentUrl = null;
    for (const v of this.views.values()) v.blank();
  }

  setMessage(info) {
    this.message = info;
    for (const v of this.views.values()) v.setMessage(info);
  }

  reloadAll() { for (const v of this.views.values()) v.reload(); }

  emulateAll() { return Promise.all([...this.views.values()].map((v) => v.emulate())); }

  configureAll() { for (const v of this.views.values()) v.configurePage(); }

  async refreshAll() { for (const v of this.views.values()) await v.refreshLayout(); }

  // ------------------------------------------------------------------ synchronisation
  onNavigate(view, { url, inPage }) {
    if (view === this.focused || !this.multi) this.currentUrl = url;
    this.emit('navigate', view, url, inPage);
    // syncUrl marque une navigation provoquée par la synchronisation : elle n'est pas répétée.
    const fromSync = view.syncUrl === url;
    view.syncUrl = null;
    if (fromSync || !this.multi || !settings.sync.nav) return;
    // Changement de route dans la page (applications monopage) : seulement depuis l'appareil utilisé.
    if (inPage && Date.now() - view.activeAt > 2500) return;
    for (const o of this.views.values()) {
      if (o === view || o.url === url) continue;
      if (inPage && o.ready) {
        // Même application monopage : on change de route sans recharger (l'état est gardé) ; si la page ne
        // suit pas, onSpaDone recharge l'adresse.
        o.syncUrl = url;
        try { o.wv.send('vitrine-spa-nav', { url }); continue; } catch { noop(); }
      }
      o.load(url, { sync: true });
    }
  }

  onSpaDone(view, d) {
    if (!d || d.ok) return;
    view.load(d.url, { sync: true });
  }

  // L'appareil « meneur » est celui qu'on manipule (souris, toucher, molette, clavier, barre de défilement) :
  // seul lui transmet ; les autres suivent sans renvoyer (pas d'écho ni de rebond entre appareils).
  isLeader(view, ms = 1500) {
    if (Date.now() - view.activeAt > ms) return false;
    let best = null;
    for (const o of this.views.values()) if (!best || o.activeAt > best.activeAt) best = o;
    return best === view;
  }

  onScroll(view, s) {
    if (!this.multi || !settings.sync.scroll || !this.isLeader(view)) return;
    for (const o of this.views.values()) if (o !== view) o.syncScrollFrom(s);
  }

  async onClick(view, c) {
    if (!this.multi || !settings.sync.clicks || (view.syncClicking && Date.now() - view.syncClicking < 600)) return;
    for (const o of this.views.values()) {
      if (o === view || !o.ready) continue;
      // eslint-disable-next-line no-await-in-loop
      const at = await o.locate(c);
      if (!(at && at.ok && o.clickAt(at.x, at.y))) { try { o.wv.send('vitrine-do-click', c); } catch { noop(); } }
    }
  }

  onInput(view, d) {
    if (!this.multi || settings.sync.input === false || !this.isLeader(view, 4000)) return;
    for (const o of this.views.values()) if (o !== view && o.ready) { try { o.wv.send('vitrine-set-input', d); } catch { noop(); } }
  }

  // ------------------------------------------------------------------ résumé
  describe(v = this.focused) {
    const dev = getDevice(v.cfg.deviceId, settings.custom);
    const st = resolveState(dev, v.cfg.state);
    return `${dev.name}${st.label ? ` ${st.label}` : ''}${v.cfg.land ? ' paysage' : ''}`;
  }

  findView(wcId) { return [...this.views.values()].find((v) => v.wcId === wcId); }
}

export const boardEl = () => $('#board');
