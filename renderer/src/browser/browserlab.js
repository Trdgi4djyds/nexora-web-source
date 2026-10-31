/* Browser Lab : un vrai navigateur de travail, avec sélection de composants (façon Figma), analyse réseau
 * avancée, audit, tests automatiques de navigation, aspiration complète du site, console et Chrome
 * DevTools intégrés. */
import { api } from '../core/api.js';
import { S } from '../core/state.js';
import { $, $$, esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { settings, persist } from '../core/settings.js';
import { toast } from '../core/ui.js';
import { resizable } from '../core/resize.js';
import { uaFor } from '../viewer/emulation.js';
import { PICKER_SRC } from './picker-src.js';

export const VIEWPORTS = {
  fill: { label: 'Fenêtre', w: 0, h: 0 },
  fhd: { label: 'Écran 1920 × 1080', w: 1920, h: 1080 },
  desktop: { label: 'Ordinateur 1440 × 900', w: 1440, h: 900 },
  laptop: { label: 'Portable 1280 × 800', w: 1280, h: 800 },
  tabletL: { label: 'Tablette paysage 1180 × 820', w: 1180, h: 820, mobile: true, dpr: 2, os: 'android-tablet' },
  tablet: { label: 'Tablette 820 × 1180', w: 820, h: 1180, mobile: true, dpr: 2, os: 'android-tablet' },
  iphone: { label: 'iPhone 402 × 874', w: 402, h: 874, mobile: true, dpr: 3, os: 'ios' },
  android: { label: 'Android 412 × 915', w: 412, h: 915, mobile: true, dpr: 2.625, os: 'android' },
  small: { label: 'Petit mobile 360 × 780', w: 360, h: 780, mobile: true, dpr: 3, os: 'android' },
};

export const THROTTLES = {
  none: 'Réseau normal', fibre: 'Fibre', '4g': '4G', '3g': '3G', '3g-slow': '3G lente', edge: 'EDGE (2G)', offline: 'Hors ligne',
};

const TABS = [
  ['elements', 'Éléments', 'target', () => import('./elements-panel.js')],
  ['network', 'Réseau', 'sync', () => import('./network-panel.js')],
  ['audit', 'Audit', 'audit', () => import('./audit-panel.js')],
  ['tests', 'Tests', 'pass', () => import('./tests-panel.js')],
  ['scrape', 'Aspirateur', 'download', () => import('./scrape-panel.js')],
  ['console', 'Console', 'terminal', () => import('./console-panel.js')],
  ['devtools', 'DevTools', 'wrench', null],
];

function defaults() {
  return {
    url: '', viewport: 'fill', throttle: 'none', cpu: 1, tab: 'elements', pick: false, pickMode: 'element', cacheOff: false, history: [],
  };
}

export class BrowserLab {
  constructor(el) {
    this.el = el;
    settings.browserLab = { ...defaults(), ...(settings.browserLab || {}) };
    this.st = settings.browserLab;
    this.panels = new Map();
    this.wv = null;
    this.wcId = null;
    this.listeners = new Map();
    this.render();
    // Console et réseau écoutent dès l'ouverture, même si leur onglet n'est pas affiché.
    this.ensurePanel('console');
    this.ensurePanel('network');
    // Le site ouvert dans NEXORA passe avant la dernière page visitée s'il s'agit d'un autre site.
    const cur = S.baseUrl || (S.source && S.source.url) || '';
    const originOf = (u) => { try { return new URL(u).origin; } catch { return ''; } };
    const start = (cur && originOf(cur) !== originOf(this.st.url) ? cur : '') || this.st.url || (S.board && S.board.focused && S.board.focused.url) || '';
    if (start) this.navigate(start);
    else this.showEmpty();
  }

  save() { persist(); }

  // ------------------------------------------------------------------ événements internes
  on(ev, fn) {
    if (!this.listeners.has(ev)) this.listeners.set(ev, new Set());
    this.listeners.get(ev).add(fn);
    return () => this.listeners.get(ev).delete(fn);
  }

  emit(ev, ...a) {
    for (const fn of this.listeners.get(ev) || []) { try { fn(...a); } catch (e) { console.error(e); } }
  }

  // ------------------------------------------------------------------ interface
  render() {
    this.el.innerHTML = `
      <div class="bl">
        <div class="bl-bar">
          <div class="bl-navs">
            <button class="icon-btn" data-act="back" title="Précédente">${icon('back', 17)}</button>
            <button class="icon-btn" data-act="forward" title="Suivante">${icon('forward', 17)}</button>
            <button class="icon-btn" data-act="reload" title="Recharger (Maj : sans cache)">${icon('reload', 16)}</button>
          </div>
          <form class="bl-addr" autocomplete="off"><span class="bl-addr-ico">${icon('globe', 14)}</span><input class="bl-url" spellcheck="false" placeholder="Adresse d’un site ou recherche" value=""><span class="bl-load"></span></form>
          <select class="input bl-sel" data-set="viewport" title="Taille d’affichage">${Object.entries(VIEWPORTS).map(([k, v]) => `<option value="${k}" ${this.st.viewport === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
          <select class="input bl-sel" data-set="throttle" title="Débit réseau simulé">${Object.entries(THROTTLES).map(([k, v]) => `<option value="${k}" ${this.st.throttle === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <div class="seg bl-pick" role="group">
            <button data-act="pick-element" class="${this.st.pick && this.st.pickMode === 'element' ? 'on' : ''}" title="Sélectionner un composant (comme dans Figma)">${icon('target', 15)}<span>Composant</span></button>
            <button data-act="pick-section" class="${this.st.pick && this.st.pickMode === 'section' ? 'on' : ''}" title="Sélectionner une section entière">${icon('layers', 15)}<span>Section</span></button>
          </div>
          <button class="icon-btn" data-act="to-responsive" title="Ouvrir cette page dans le Responsive Lab">${icon('multi', 17)}</button>
        </div>
        <div class="bl-body">
          <div class="bl-view">
            <div class="bl-canvas"></div>
            <div class="bl-size"></div>
          </div>
          <aside class="bl-panel">
            <div class="bl-tabs" role="tablist">${TABS.map(([k, l, ic]) => `<button role="tab" data-tab="${k}" class="${this.st.tab === k ? 'on' : ''}">${icon(ic, 14)}<span>${l}</span></button>`).join('')}</div>
            <div class="bl-panes">${TABS.map(([k]) => `<div class="bl-pane" data-pane="${k}" hidden></div>`).join('')}</div>
          </aside>
        </div>
      </div>`;
    this.$ = {
      url: $('.bl-url', this.el), canvas: $('.bl-canvas', this.el), view: $('.bl-view', this.el), size: $('.bl-size', this.el), load: $('.bl-load', this.el), panel: $('.bl-panel', this.el),
    };
    $('.bl-addr', this.el).addEventListener('submit', (e) => { e.preventDefault(); this.navigate(this.$.url.value); this.$.url.blur(); });
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('change', (e) => this.onChange(e));
    resizable(this.$.panel, { key: 'browserPanel', edge: 'left', min: 340, max: () => Math.max(360, window.innerWidth * 0.62), onResize: () => this.layout() });
    new ResizeObserver(() => this.layout()).observe(this.$.view);
    this.openTab(this.st.tab);
  }

  showEmpty() {
    this.$.canvas.innerHTML = `<div class="bl-empty">${icon('globe', 34)}<h2>Browser Lab</h2><p>Saisis l’adresse d’un site pour l’analyser : composants et leur code, réseau, audit, tests automatiques, aspiration complète.</p>
      ${S.board && S.board.focused && S.board.focused.url ? `<button class="btn" data-act="from-responsive">${icon('multi', 15)}<span>Page du Responsive Lab</span></button>` : ''}</div>`;
  }

  onClick(e) {
    const tab = e.target.closest('[data-tab]');
    if (tab) { this.openTab(tab.dataset.tab); return; }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    switch (a.dataset.act) {
      case 'back': if (this.wv && this.wv.canGoBack()) this.wv.goBack(); break;
      case 'forward': if (this.wv && this.wv.canGoForward()) this.wv.goForward(); break;
      case 'reload': if (this.wv) { if (e.shiftKey) this.wv.reloadIgnoringCache(); else this.wv.reload(); } break;
      case 'pick-element': this.togglePick('element'); break;
      case 'pick-section': this.togglePick('section'); break;
      case 'to-responsive': this.toResponsive(); break;
      case 'from-responsive': this.navigate(S.board.focused.url); break;
      default: break;
    }
  }

  onChange(e) {
    const k = e.target.dataset.set;
    if (!k) return;
    this.st[k] = e.target.value;
    this.save();
    if (k === 'viewport') this.applyViewport();
    if (k === 'throttle' && this.wcId) api.invoke('lab:net-throttle', { wcId: this.wcId, preset: this.st.throttle });
  }

  async toResponsive() {
    if (!this.url) return;
    const { setMode } = await import('../viewer/toolbar.js');
    const { openUrl } = await import('../viewer/sources.js');
    await setMode('preview');
    openUrl(this.url);
  }

  async openTab(k) {
    this.st.tab = k;
    this.save();
    for (const b of $$('[data-tab]', this.el)) b.classList.toggle('on', b.dataset.tab === k);
    for (const p of $$('[data-pane]', this.el)) p.hidden = p.dataset.pane !== k;
    for (const [key, panel] of this.panels) if (key !== k && panel.deactivate) panel.deactivate();
    const pane = $(`[data-pane="${k}"]`, this.el);
    if (k === 'devtools') { this.openDevtools(pane); return; }
    const panel = await this.ensurePanel(k);
    if (panel && panel.activate && this.st.tab === k) panel.activate();
  }

  async ensurePanel(k) {
    let panel = this.panels.get(k);
    if (panel) return panel;
    const def = TABS.find((t) => t[0] === k);
    const pane = $(`[data-pane="${k}"]`, this.el);
    try {
      const m = await def[3]();
      panel = this.panels.get(k) || new m.default(this, pane);
      this.panels.set(k, panel);
      return panel;
    } catch (err) {
      console.error(err);
      pane.innerHTML = `<p class="bl-err">${esc(err.message)}</p>`;
      return null;
    }
  }

  // ------------------------------------------------------------------ webview
  normalize(input) {
    const v = String(input || '').trim();
    if (!v) return null;
    if (/^(https?|file|about|data):/i.test(v)) return v;
    if (/^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(v) || /^[\w-]+\.(vitrine|nexora)(:\d+)?(\/|$)/i.test(v)) return `http://${v}`;
    if (/^[^\s]+\.[a-z]{2,}(:\d+)?(\/|$)/i.test(v)) return `https://${v}`;
    return `https://www.google.com/search?q=${encodeURIComponent(v)}`;
  }

  navigate(input) {
    const url = this.normalize(input);
    if (!url) return;
    this.st.url = url;
    this.save();
    this.$.url.value = url;
    if (!this.wv) { this.createWebview(url); return; }
    // Tant que la page n'a jamais été prête, loadURL lève une erreur : on change simplement l'adresse.
    try { this.wv.loadURL(url).catch(() => {}); } catch { this.wv.src = url; }
  }

  createWebview(url) {
    this.$.canvas.innerHTML = '';
    const wv = document.createElement('webview');
    wv.className = 'bl-wv';
    wv.setAttribute('partition', 'persist:vitrine');
    wv.setAttribute('allowpopups', '');
    wv.src = url;
    this.wv = wv;
    this.$.canvas.append(wv);
    wv.addEventListener('dom-ready', () => this.onDomReady());
    wv.addEventListener('did-start-loading', () => { this.loading = true; this.$.load.classList.add('on'); this.emit('loading', true); });
    wv.addEventListener('did-stop-loading', () => { this.loading = false; this.$.load.classList.remove('on'); this.emit('loading', false); });
    wv.addEventListener('did-navigate', (e) => this.onNavigated(e.url, false));
    wv.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame) this.onNavigated(e.url, true); });
    wv.addEventListener('page-title-updated', (e) => { this.title = e.title; this.emit('title', e.title); });
    wv.addEventListener('did-fail-load', (e) => { if (e.isMainFrame && e.errorCode !== -3) toast(`Page inaccessible : ${e.errorDescription}`, { kind: 'bad' }); });
    wv.addEventListener('console-message', (e) => {
      const msg = e.message || '';
      if (msg.startsWith('__VT__')) {
        try { this.emit('picker', JSON.parse(msg.slice(6))); } catch { /* message tronqué */ }
        return;
      }
      this.emit('console', { level: e.level, message: msg, line: e.line, source: e.sourceId, time: Date.now() });
    });
    wv.addEventListener('new-window', (e) => this.navigate(e.url));
    this.layout();
  }

  async onDomReady() {
    const id = this.wv.getWebContentsId();
    const fresh = id !== this.wcId;
    this.wcId = id;
    try { this.wv.send('vitrine-config', { dragScroll: false, touch: false, pointer: false, syncClicks: false, syncNav: false }); } catch { /* préchargement absent */ }
    if (fresh) {
      await this.applyViewport();
      if (this.st.throttle !== 'none') api.invoke('lab:net-throttle', { wcId: id, preset: this.st.throttle }).catch(() => {});
      this.emit('attach', id);
    }
    if (this.st.pick) this.injectPicker();
    this.emit('ready', id);
  }

  onNavigated(url, inPage) {
    this.url = url;
    if (document.activeElement !== this.$.url) this.$.url.value = url;
    this.st.url = url;
    this.save();
    try { this.$.url.parentElement.querySelector('.bl-addr-ico').innerHTML = icon(url.startsWith('https:') ? 'lock' : 'globe', 14); } catch { /* barre absente */ }
    this.emit('navigate', url, inPage);
  }

  async applyViewport() {
    this.layout();
    if (!this.wcId) return;
    const v = VIEWPORTS[this.st.viewport] || VIEWPORTS.fill;
    if (!v.w) {
      await api.invoke('lab:emu-clear', { wcId: this.wcId }).catch(() => {});
      return;
    }
    const ua = v.mobile ? uaFor({ os: v.os || 'android' }) : uaFor({ os: 'windows' });
    await api.invoke('device:emulate', {
      wcId: this.wcId,
      emu: {
        width: v.w, height: v.h, screenWidth: v.w, screenHeight: v.h, dpr: v.dpr || 1, mobile: Boolean(v.mobile), touch: Boolean(v.mobile), ua: ua.ua, uaMeta: ua.uaMeta, scale: 1,
      },
      env: settings.env,
    }).catch(() => {});
    try { this.wv.send('vitrine-config', { dragScroll: Boolean(v.mobile), touch: Boolean(v.mobile), pointer: false, syncClicks: false, syncNav: false }); } catch { /* ignore */ }
  }

  layout() {
    const wv = this.wv;
    if (!wv) return;
    const v = VIEWPORTS[this.st.viewport] || VIEWPORTS.fill;
    const box = this.$.view.getBoundingClientRect();
    if (!v.w) {
      wv.style.width = '100%';
      wv.style.height = '100%';
      wv.style.transform = '';
      this.$.canvas.classList.add('fill');
      this.$.size.textContent = `${Math.round(box.width)} × ${Math.round(box.height)}`;
      this.scale = 1;
      return;
    }
    this.$.canvas.classList.remove('fill');
    const k = Math.min(1, (box.width - 32) / v.w, (box.height - 40) / v.h);
    this.scale = k;
    wv.style.width = `${v.w}px`;
    wv.style.height = `${v.h}px`;
    wv.style.transform = `scale(${k})`;
    this.$.canvas.style.width = `${v.w * k}px`;
    this.$.canvas.style.height = `${v.h * k}px`;
    this.$.size.textContent = `${v.w} × ${v.h}${k < 1 ? ` · ${Math.round(k * 100)} %` : ''}`;
  }

  // ------------------------------------------------------------------ sélection façon Figma
  async injectPicker() {
    if (!this.wv) return;
    try { await this.wv.executeJavaScript(`${PICKER_SRC}(${JSON.stringify({ mode: this.st.pickMode })})`); } catch { /* page pas prête */ }
  }

  async togglePick(mode) {
    const was = this.st.pick && this.st.pickMode === mode;
    this.st.pick = !was;
    this.st.pickMode = mode;
    this.save();
    for (const b of $$('.bl-pick button', this.el)) b.classList.toggle('on', this.st.pick && b.dataset.act === `pick-${this.st.pickMode}`);
    if (!this.wv) return;
    if (this.st.pick) {
      await this.injectPicker();
      if (this.st.tab !== 'elements') this.openTab('elements');
    } else {
      try { await this.wv.executeJavaScript('window.__vtPick && window.__vtPick.off()'); } catch { /* ignore */ }
    }
  }

  pickCall(js) {
    if (!this.wv) return Promise.resolve(null);
    return this.wv.executeJavaScript(`window.__vtPick ? window.__vtPick.${js} : null`).catch(() => null);
  }

  // ------------------------------------------------------------------ DevTools intégrés
  openDevtools(pane) {
    if (!this.wv || !this.wcId) {
      pane.innerHTML = `<div class="bl-note">${icon('wrench', 22)}<p>Ouvre d’abord une page : les outils de développement de Chrome s’afficheront ici, accolés à la page.</p></div>`;
      this.on('ready', () => { if (this.st.tab === 'devtools' && !this.dtOpen) this.openDevtools(pane); });
      return;
    }
    if (this.dtOpen && this.dtTarget === this.wcId) return;
    pane.innerHTML = '<webview class="bl-dt" src="about:blank"></webview>';
    const host = $('webview', pane);
    host.addEventListener('dom-ready', async () => {
      if (this.dtTarget === this.wcId && this.dtOpen) return;
      try {
        await api.invoke('lab:devtools-open', { targetId: this.wcId, hostId: host.getWebContentsId() });
        this.dtOpen = true;
        this.dtTarget = this.wcId;
      } catch (e) { pane.innerHTML = `<p class="bl-err">${esc(e.message)}</p>`; }
    }, { once: true });
  }

  pause() {
    if (this.st.pick) this.pickCall('off()');
  }

  resume() {
    if (this.st.pick) this.injectPicker();
    this.layout();
  }
}

export async function openBrowserLab(el) {
  if (!S.browserLab) S.browserLab = new BrowserLab(el);
  else S.browserLab.resume();
  return S.browserLab;
}
