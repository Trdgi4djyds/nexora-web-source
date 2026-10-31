/* App Builder : transforme un site ou une application web en application Android (APK, AAB).
 * Réglages et fonctions natives au niveau de WebToNative (SDK JavaScript compatible), aperçu en direct. */
import { paintGlass, paintFluid } from '../devices/wallpapers.js';
import { DEVICES, getDevice } from '../devices/catalog.js';
import { layoutDevice } from '../devices/geometry.js';
import { drawDevice, drawOverlays } from '../devices/frames2d.js';
import { api } from '../core/api.js';
import { S } from '../core/state.js';
import {
  $, $$, esc, fmtBytes, uid,
} from '../core/dom.js';
import { icon } from '../core/icons.js';
import { settings, persist } from '../core/settings.js';
import {
  toast, seg, toggle, showPopover, hidePopover,
} from '../core/ui.js';
import { uaFor } from '../viewer/emulation.js';
import { currentProject, linkApp } from '../core/projects.js';
import { resizable } from '../core/resize.js';
import { generateImages, previews, pwaIcons } from './assets.js';
import {
  SPLASH_INTROS, SPLASH_EXITS, statusBar, homeHtml, splashHtml, playIntro, launchSim,
} from './preview.js';

const PREV_DEFAULT = { ios: 'iphone-18-pro', android: 'galaxy-s26-ultra' };

export const SECTIONS = [
  ['source', 'Source', 'globe', 'Site en ligne ou projet local'],
  ['pwa', 'Inspection', 'audit', 'Identité, manifest, service worker, sécurité'],
  ['twa', 'Trusted Web Activity', 'shield', 'Site en plein écran dans le navigateur'],
  ['identity', 'Identité', 'phoneSettings', 'Nom, identifiant, version'],
  ['icon', 'Icône et démarrage', 'image', 'Icône adaptative, écran de démarrage'],
  ['look', 'Apparence', 'palette', 'Barres système, couleurs, chargement'],
  ['orient', 'Orientation', 'rotate', 'Portrait, paysage, automatique, verrouillage'],
  ['nav', 'Navigation', 'grid', 'Onglets, menu, bouton flottant'],
  ['links', 'Liens', 'link', 'Liens externes, règles, liens profonds'],
  ['native', 'Fonctions natives', 'sparkle', 'Autorisations et SDK'],
  ['events', 'Notifications locales', 'bolt', 'Sans serveur : événements de l’app, API notify'],
  ['push', 'Notifications push', 'bell', 'Serveur (Firebase) : envoi, documentation'],
  ['notifs', 'Centre de notifications', 'chat', 'Historique, envois programmés, modèles'],
  ['remote', 'Réglages à distance', 'cloud', 'Annonce, maintenance, mise à jour'],
  ['screens', 'Écrans', 'layers', 'Accueil, annonce, hors ligne, code'],
  ['advanced', 'Avancé', 'wrench', 'Injection, cache, sécurité'],
  ['publish', 'Signature et fichiers', 'shield', 'Clé, APK, AAB, installation'],
  ['store', 'Publication Play Store', 'rocket', 'Envoi guidé sur Google Play'],
];

// Orientations proposées : [valeur, nom, explication courte, pictogramme]
const ORIENTS = [
  ['unspecified', 'Automatique', 'Suit le téléphone', 'auto'],
  ['portrait', 'Portrait', 'Verrouillé debout', 'portrait'],
  ['landscape', 'Paysage', 'Verrouillé couché', 'landscape'],
  ['sensor', 'Libre', 'Tous les sens, même rotation bloquée', 'sensor'],
];

const PERMS = [
  ['camera', 'Appareil photo', 'Photos, vidéos et visio dans la page (getUserMedia, champ fichier).'],
  ['microphone', 'Micro', 'Enregistrement audio, appels et visio.'],
  ['location', 'Localisation', 'navigator.geolocation et cartes.'],
  ['notifications', 'Notifications', 'Notifications locales (Android 13+ demande l’accord).'],
  ['vibrate', 'Vibration', 'navigator.vibrate et retour haptique.'],
  ['biometric', 'Empreinte et visage', 'Connexion par biométrie, secret protégé.'],
  ['contacts', 'Contacts', 'Choisir ou lire les contacts du téléphone.'],
  ['nfc', 'NFC', 'Lire et écrire des étiquettes NFC.'],
];

const FAB_ACTIONS = {
  whatsapp: 'WhatsApp', tel: 'Appel', url: 'Ouvrir une page', share: 'Partager la page', menu: 'Ouvrir le menu', reload: 'Recharger', js: 'Code JavaScript',
};

const WTN_FEATURES = [
  'deviceInfo · isDeviceGPSEnabled · getSafeArea · firstCallWhenAppStarted',
  'statusBar · setNavigationBarColor · hideSplashScreen · hide/showNativeComponents · showHideStickyFooter',
  'shareLink · shareFile · downloadFile · openPDF · printFunction · openUrlInBrowser',
  'Biometric (statut, secret, authentification) · Clipboard · Haptics · Sound',
  'NativeContacts · NativeDatastore (setAppData/getAppData) · Permission (check/show/réglages)',
  'BarcodeScan · VoiceSearch · NFC (lecture, écriture) · DateTimePicker',
  'setOrientation · pinchToZoom · enablePullToRefresh · disableScreenshot · keepScreenOn · customBackHandling',
  'clearAppCache · clearAppData · closeApp · Passcode · forceUpdateCookies',
];

const RX_APPID = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

function defaults() {
  return {
    id: uid(),
    source: { kind: 'url', url: '', dir: '', www: '' },
    engine: 'webview',
    twa: {
      launcherName: '', display: 'standalone', orientation: 'default', themeColor: '', themeColorDark: '', navColor: '', navColorDark: '', navDivider: '', navDividerDark: '', bgColor: '',
      fallback: 'webview', splashFade: 300, notifications: true, siteSettings: true, trustedOrigins: [], chromeOsOnly: false, shareTarget: null, extraFingerprints: [],
    },
    pwa: { strategy: 'offline', report: null },
    push: {
      enabled: false, googleServices: '', project: null, ask: true, channel: 'Notifications', registerUrl: '', topics: ['all'], topicsText: 'all', test: { title: 'Bonjour 👋', body: 'Ceci est une notification de test envoyée depuis NEXORA.', url: '', image: '', target: 'topic', token: '' },
    },
    appName: '',
    appId: '',
    versionName: '1.0.0',
    versionCode: 1,
    orientation: 'unspecified',
    orientFlip: false,
    orientTablet: 'same',
    orientJs: true,
    tv: false,
    icon: {
      image: null, bg: '#FFFFFF', bg2: '#E9E9EF', gradient: false, scale: 1, fill: 'logo', letter: '',
    },
    splash: {
      image: null, bg: '', anim: 'fade', intro: 'pop', showName: false, tagline: '', textColor: '', logoSize: 150, hideOn: 'load', min: 400, max: 6000,
    },
    accent: '#007AFF',
    config: {
      statusMode: 'auto', statusColor: '#FFFFFF', navMode: 'auto', navColor: '#FFFFFF', bgColor: '#FFFFFF',
      loader: 'bar', progressBar: true, fullscreen: false, zoom: false, pullToRefresh: true, back: 'history',
      tabs: [], tabBg: '#FFFFFF', tabActive: '', tabInactive: '#8E8E93',
      menu: { enabled: false, title: '', bg: '', items: [] },
      fab: {
        enabled: false, icon: 'chat', action: 'whatsapp', value: '', position: 'right', color: '', label: '',
      },
      externalLinks: 'browser', inAppBrowser: true, linkRules: [],
      fileUpload: true, offlinePage: true, offlineTitle: 'Pas de connexion', offlineText: 'Vérifie ta connexion Internet, puis réessaie.', offlineButton: 'Réessayer',
      onboarding: {
        enabled: false, slides: [], button: 'Commencer', next: 'Suivant', skip: 'Passer', bg: '',
      },
      modal: {
        enabled: false, title: '', text: '', button: 'OK', url: '', frequency: 'once', image: null, id: '1',
      },
      passcode: {
        enabled: false, required: false, timeout: 30, title: 'Saisis ton code',
      },
      uaSuffix: '', injectCss: '', injectJs: '', cache: 'default', debug: false, secure: false, keepAwake: false, askAtStart: false, scanner: false, clipboard: true,
      events: { enabled: true, network: true, download: true, update: true, channel: 'Activité' },
    },
    permissions: ['vibrate', 'notifications'],
    downloads: true,
    deepLinks: { enabled: false, hosts: [], scheme: '' },
    shortcuts: [],
    hosts: [],
    optimize: {
      enabled: true, viewport: true, fonts: true, images: true, maxImageSide: 2560, preload: true,
    },
    outputs: { apk: true, aab: false },
    remote: {
      enabled: false, url: '', minVersionCode: 0, forceUpdate: false, updateText: '', startUrl: '',
      announcement: { enabled: false, id: '1', title: '', text: '', button: 'OK', url: '', frequency: 'once' },
      maintenance: { enabled: false, title: 'Maintenance en cours', text: 'L’application revient très vite. Merci de ta patience.' },
    },
    store: { track: 'internal', notes: '', rollout: 100 },
    notifTemplates: [],
    outDir: '',
    owner: {
      kind: 'person', name: '', org: '', role: '', website: '', email: '', phone: '', street: '', city: '', region: '', postal: '', country: '',
    },
  };
}

function merge(base, saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return saved === undefined ? base : saved;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(saved)) {
    out[k] = base && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k]) ? merge(base[k], v) : v;
  }
  return out;
}

const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function setPath(o, p, v) {
  const ks = p.split('.');
  let cur = o;
  for (let i = 0; i < ks.length - 1; i += 1) {
    if (cur[ks[i]] == null || typeof cur[ks[i]] !== 'object') cur[ks[i]] = {};
    cur = cur[ks[i]];
  }
  cur[ks[ks.length - 1]] = v;
}

function slug(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').replace(/^[0-9]+/, '').slice(0, 30);
}
function suggestId(cfg) {
  try {
    if (cfg.source.kind === 'url' && cfg.source.url) {
      const host = new URL(cfg.source.url).hostname.replace(/^www\./, '');
      const parts = host.split('.').filter(Boolean).reverse().map(slug).filter(Boolean);
      if (parts.length >= 2) return `${parts.join('.')}.app`;
    }
  } catch { /* adresse incomplète */ }
  const s = slug(cfg.appName) || 'monapp';
  return `com.${s}.app`;
}

function isLightHex(hex) {
  const n = parseInt(String(hex || '#fff').replace('#', '').padEnd(6, 'f').slice(0, 6), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 > 0.55;
}

// =========================================================================== composant
class AppBuilder {
  constructor(el) {
    this.el = el;
    const store = settings.android && settings.android.apps ? settings.android : { apps: [], current: null };
    if (!store.apps.length) store.apps.push(defaults());
    store.apps = store.apps.map((a) => merge(defaults(), a));
    if (!store.apps.some((a) => a.id === store.current)) store.current = store.apps[0].id;
    settings.android = store;
    this.section = store.section || 'source';
    this.preview = 'app';
    this.os = settings.android.os === 'ios' ? 'ios' : 'android';
    this.tools = null;
    this.tabIcons = {};
    this.log = [];
    this.building = false;
    this.result = null;
    this.key = null;
    this.devices = [];
    this.previewTimer = null;
    this.render();
    this.init();
  }

  get cfg() { return settings.android.apps.find((a) => a.id === settings.android.current); }

  save() { persist(); }

  async init() {
    api.on('android:log', (l) => this.addLog(l));
    api.on('android:step', (s) => this.setStep(s));
    api.on('android:progress', (p) => this.setInstallProgress(p));
    try { this.tabIcons = await api.invoke('android:tab-icons'); } catch { this.tabIcons = {}; }
    this.renderPreview();
    this.refreshTools();
    this.refreshKey();
  }

  async refreshTools() {
    try { this.tools = await api.invoke('android:tools'); } catch (e) { this.tools = { ready: false, missing: ['?'], error: e.message }; }
    this.renderTools();
  }

  async refreshKey() {
    const id = this.cfg.appId;
    this.key = id && RX_APPID.test(id) ? await api.invoke('android:key-info', id).catch(() => null) : null;
    if (this.section === 'publish') this.renderForm();
  }

  // ------------------------------------------------------------------ squelette
  render() {
    this.el.innerHTML = `
      <div class="ab">
        <nav class="ab-nav">
          <div class="ab-apps"></div>
          <div class="ab-sections">${SECTIONS.map(([k, label, ic, hint]) => `
            <button class="ab-sec" data-sec="${k}" title="${label} — ${hint}">${icon(ic, 17)}<span><b>${label}</b><small>${hint}</small></span></button>`).join('')}
          </div>
        </nav>
        <main class="ab-main">
          <div class="ab-tools" hidden></div>
          <div class="ab-form"></div>
        </main>
        <aside class="ab-side">
          <div class="ab-prev-head">
            <div class="ab-os">${seg('abOs', this.os, { android: `${icon('android', 13)}<span>Android</span>`, ios: `${icon('phone', 13)}<span>iPhone</span>` })}</div>
            ${seg('abPrev', this.preview, { home: 'Accueil', splash: 'Démarrage', app: 'Application' })}
          </div>
          <div class="ab-devrow"></div>
          <div class="ab-phone-wrap"><div class="ab-devhold"><div class="ab-phone ab-dev" data-os="${this.os}"><canvas class="ab-frame"></canvas><div class="ab-screen"></div><canvas class="ab-ov"></canvas></div></div></div>
          <div class="ab-sim"><button class="btn small" data-act="launch-sim">${icon('play', 13)}<span>Simuler le lancement</span></button><button class="btn small" data-act="replay-splash" title="Rejouer l’animation de démarrage">${icon('restart', 13)}</button></div>
          <div class="ab-build">
            <div class="ab-build-row">
              <label class="ab-chip"><input type="checkbox" data-k="outputs.apk"><span>APK</span></label>
              <label class="ab-chip"><input type="checkbox" data-k="outputs.aab"><span>AAB Play Store</span></label>
              <button class="btn primary ab-go" data-act="build">${icon('android', 16)}<span>Construire</span></button>
            </div>
            <div class="ab-progress" hidden><div class="ab-bar"><i></i></div><span class="ab-step"></span></div>
            <div class="ab-result" hidden></div>
            <details class="ab-log"><summary>Détail des étapes</summary><pre></pre></details>
          </div>
        </aside>
      </div>`;
    // Les écouteurs sont posés une seule fois : render() est rappelé à chaque changement d'application, et
    // chaque appel ajoutait une copie (actions exécutées deux, trois fois…, interrupteurs qui se ré-inversent).
    if (!this.bound) {
      this.bound = true;
      this.el.addEventListener('click', (e) => this.onClick(e));
      this.el.addEventListener('input', (e) => this.onInput(e));
      this.el.addEventListener('change', (e) => this.onInput(e, true));
    }
    this.phoneKey = null;
    this.phoneL = null;
    this.pushSt = null; // état push (clé du compte de service…) propre à l'application affichée
    this.notifHist = null; this.playSt = null; this.playChecked = null;
    this.renderApps();
    this.renderNav();
    this.renderForm();
    this.syncBuildBar();
    resizable($('.ab-nav', this.el), { key: 'abNav', edge: 'right', min: 64, max: 340 });
    resizable($('.ab-side', this.el), {
      key: 'abSide', edge: 'left', min: 300, max: () => Math.max(320, window.innerWidth * 0.5), onResize: () => requestAnimationFrame(() => this.layoutPhone()),
    });
    // Le téléphone suit la taille du panneau (et de la fenêtre) : tout est dessiné à l'échelle réelle puis réduit.
    if (this.phoneRO) this.phoneRO.disconnect();
    this.phoneRO = new ResizeObserver(() => this.layoutPhone());
    this.phoneRO.observe($('.ab-phone-wrap', this.el));
    this.renderDevRow();
  }

  // ------------------------------------------------------------------ téléphone de l'aperçu
  // Les mêmes maquettes que le Responsive Lab (cadre dessiné, île dynamique ou poinçon) ; l'écran a la taille
  // réelle de l'appareil en points (iPhone) ou en dp (Android), pour que les icônes et les textes y soient
  // à leur vraie taille. Le tout est ensuite réduit pour tenir dans le panneau.
  // Tous les appareils mobiles du système choisi : téléphones, pliables et tablettes (pas d'ordinateurs,
  // téléviseurs, montres ni consoles).
  phoneDevices(os = this.os) {
    const OS = os === 'ios' ? ['ios', 'ipados'] : ['android', 'android-tablet'];
    const PHONES = ['iphone', 'samsung', 'xiaomi', 'pixel', 'transsion', 'bbk', 'huawei', 'moto', 'generic'];
    return DEVICES.filter((d) => !d.hidden && OS.includes(d.os) && (PHONES.includes(d.category) || d.category === 'foldable' || d.category === 'tablet'));
  }

  previewState(dev) {
    if (!dev.states || !dev.states.length) return undefined;
    const ps = settings.android.prevState || {};
    return dev.states.some((s) => s.id === ps[dev.id]) ? ps[dev.id] : undefined;
  }

  previewDevice(os = this.os) {
    const pd = settings.android.prevDev || {};
    const dev = getDevice(pd[os] || PREV_DEFAULT[os], settings.custom) || getDevice(PREV_DEFAULT[os]);
    const pc = settings.android.prevColor || {};
    const color = pc[`${os}:${dev.id}`] || (dev.colors && dev.colors[0] && dev.colors[0][1]) || null;
    return { dev, color };
  }

  renderDevRow() {
    const row = $('.ab-devrow', this.el);
    if (!row) return;
    const { dev, color } = this.previewDevice();
    const groups = [['Téléphones', (d) => d.category !== 'foldable' && d.category !== 'tablet'], ['Pliables', (d) => d.category === 'foldable'], ['Tablettes', (d) => d.category === 'tablet']];
    const list = this.phoneDevices();
    const st = this.previewState(dev);
    row.innerHTML = `<select class="input" data-ab-dev title="Appareil de l’aperçu : téléphones, pliables et tablettes (maquettes du Responsive Lab)">${groups.map(([label, f]) => { const ds = list.filter(f); return ds.length ? `<optgroup label="${label} (${ds.length})">${ds.map((d) => `<option value="${esc(d.id)}" ${d.id === dev.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</optgroup>` : ''; }).join('')}</select>
      ${dev.states && dev.states.length > 1 ? `<select class="input ab-devstate" data-ab-state title="État de l’appareil (plié, ouvert…)">${dev.states.map((s) => `<option value="${esc(s.id)}" ${(st || dev.states[0].id) === s.id ? 'selected' : ''}>${esc(s.label || s.id)}</option>`).join('')}</select>` : ''}
      <span class="ab-devcolors">${(dev.colors || []).slice(0, 6).map(([n, hex]) => `<button class="st-color${hex === color ? ' on' : ''}" style="--c:${esc(hex)}" data-ab-color="${esc(hex)}" title="${esc(n)}"></button>`).join('')}</span>
      <button class="icon-btn small" data-ab-wall title="Fond d’écran de l’aperçu" aria-haspopup="true">${icon('image', 14)}</button>
      <button class="icon-btn small ${this.previewLand() ? 'on' : ''}" data-ab-rotate title="${this.cfg.orientation === 'portrait' ? 'Application verrouillée en portrait' : this.cfg.orientation === 'landscape' ? 'Application verrouillée en paysage' : 'Tourner l’aperçu (portrait / paysage)'}" ${this.cfg.orientation === 'portrait' || this.cfg.orientation === 'landscape' ? 'disabled' : ''}>${icon('rotate', 14)}</button>`;
    row.onchange = (e) => {
      if (e.target.matches('[data-ab-state]')) {
        settings.android.prevState = { ...(settings.android.prevState || {}), [this.previewDevice().dev.id]: e.target.value };
        persist();
        this.layoutPhone(true);
        this.renderPreview();
        return;
      }
      if (!e.target.matches('[data-ab-dev]')) return;
      settings.android.prevDev = { ...(settings.android.prevDev || {}), [this.os]: e.target.value };
      persist();
      this.renderDevRow();
      this.layoutPhone(true);
      this.renderPreview();
    };
    row.onclick = (e) => {
      const wb = e.target.closest('[data-ab-wall]');
      if (wb) { this.wallMenu(wb); return; }
      if (e.target.closest('[data-ab-rotate]')) { this.prevLandUser = !this.prevLandUser; this.renderDevRow(); this.layoutPhone(true); this.renderPreview(); return; }
      const b = e.target.closest('[data-ab-color]');
      if (!b) return;
      const d = this.previewDevice().dev;
      settings.android.prevColor = { ...(settings.android.prevColor || {}), [`${this.os}:${d.id}`]: b.dataset.abColor };
      persist();
      this.renderDevRow();
      this.layoutPhone(true);
    };
  }

  layoutPhone(force = false) {
    const wrap = $('.ab-phone-wrap', this.el);
    const phone = $('.ab-phone', this.el);
    if (!wrap || !phone || !wrap.clientWidth) return;
    const { dev, color } = this.previewDevice();
    const aw = wrap.clientWidth - 24;
    const ah = wrap.clientHeight - 16;
    const land = this.previewLand();
    const key = `${dev.id}|${this.previewState(dev) || ''}|${color}|${aw}x${ah}|${window.devicePixelRatio}|${land}`;
    if (!force && key === this.phoneKey) return;
    this.phoneKey = key;
    const L = layoutDevice(dev, this.previewState(dev), {
      framesOn: true, statusBar: false, skin: false, color, land,
    });
    this.phoneL = L;
    phone.classList.toggle('land', land);
    const s = Math.max(0.15, Math.min(aw / L.TW, ah / L.TH, 1));
    this.phoneScale = s;
    const hold = $('.ab-devhold', this.el);
    hold.style.width = `${Math.round(L.TW * s)}px`;
    hold.style.height = `${Math.round(L.TH * s)}px`;
    Object.assign(phone.style, { width: `${L.TW}px`, height: `${L.TH}px`, transform: `scale(${s})` });
    phone.dataset.os = this.os;
    const M = 60;
    const bs = s * (window.devicePixelRatio || 1);
    const fit = (cv, w, h) => {
      const k = Math.min(bs * 1.15, 8192 / Math.max(w, h, 1));
      cv.width = Math.max(1, Math.ceil(w * k)); cv.height = Math.max(1, Math.ceil(h * k));
      cv.style.width = `${w}px`; cv.style.height = `${h}px`;
      const ctx = cv.getContext('2d'); ctx.setTransform(k, 0, 0, k, 0, 0); ctx.clearRect(0, 0, w, h);
      return { ctx, k };
    };
    const fr = $('.ab-frame', phone);
    const f = fit(fr, L.TW + M * 2, L.TH + M * 2);
    Object.assign(fr.style, { left: `${-M}px`, top: `${-M}px` });
    f.ctx.translate(M, M);
    drawDevice(f.ctx, L, { px: f.k, shadow: true, screenFill: '#000' });
    const screen = $('.ab-screen', phone);
    Object.assign(screen.style, {
      left: `${L.screen.x}px`, top: `${L.screen.y}px`, width: `${L.W}px`, height: `${L.H}px`, borderRadius: L.sr.map((r) => `${r}px`).join(' '),
    });
    const cut = (L.dev.p || {}).cut || {};
    screen.style.setProperty('--cut-w', `${cut.t === 'island' ? (cut.w || 120) + 24 : cut.t === 'notch' ? (cut.w || 160) + 10 : 40}px`);
    screen.style.setProperty('--scr-r', `${L.sr[0]}px`);
    const ov = $('.ab-ov', phone);
    const o = fit(ov, L.W, L.H);
    Object.assign(ov.style, { left: `${L.screen.x}px`, top: `${L.screen.y}px` });
    drawOverlays(o.ctx, L);
    this.fitWebview();
  }

  renderApps() {
    const list = settings.android.apps;
    $('.ab-apps', this.el).innerHTML = `
      <label class="ab-app-pick">
        <select class="input" data-app-pick>${list.map((a) => `<option value="${a.id}" ${a.id === this.cfg.id ? 'selected' : ''}>${esc(a.appName || 'Nouvelle application')}</option>`).join('')}</select>
      </label>
      <button class="icon-btn" data-act="app-new" title="Nouvelle application">${icon('plus', 16)}</button>
      <button class="icon-btn" data-act="app-dup" title="Dupliquer">${icon('copy', 15)}</button>
      ${list.length > 1 ? `<button class="icon-btn" data-act="app-del" title="Supprimer ces réglages">${icon('trash', 15)}</button>` : ''}`;
  }

  renderNav() {
    const twa = this.cfg.engine === 'twa' && this.cfg.source.kind === 'url';
    for (const b of $$('.ab-sec', this.el)) {
      b.classList.toggle('on', b.dataset.sec === this.section);
      b.hidden = b.dataset.sec === 'twa' && !twa;
      b.classList.toggle('dim', twa && ['nav', 'native', 'screens'].includes(b.dataset.sec));
    }
  }

  syncBuildBar() {
    for (const inp of $$('.ab-build [data-k]', this.el)) inp.checked = Boolean(getPath(this.cfg, inp.dataset.k));
  }

  renderTools() {
    const box = $('.ab-tools', this.el);
    const t = this.tools;
    if (!t || t.ready) { box.hidden = true; return; }
    const names = {
      'build-tools': 'outils de compilation', platform: `plateforme Android ${t.targetApi || 36}`, java: 'moteur de compilation', bundletool: 'format Play Store (AAB)', 'platform-tools': 'installation sur téléphone',
    };
    box.hidden = false;
    box.innerHTML = `
      <div class="ab-banner">
        ${icon('download', 20)}
        <div><b>Outils Android à installer</b><p>Il manque : ${(t.missing || []).map((m) => names[m] || m).join(', ')}. NEXORA les télécharge une seule fois (≈ 350 Mo) ; aucun autre logiciel n’est nécessaire.</p>
        <label class="ab-check"><input type="checkbox" data-act-check="license"> J’accepte les <button class="link-btn" data-external="${esc(t.licenseUrl || 'https://developer.android.com/studio/terms')}">conditions du SDK Android</button></label>
        <div class="ab-install-prog" hidden><div class="ab-bar"><i></i></div><span></span></div></div>
        <button class="btn primary" data-act="install" disabled>Installer</button>
      </div>`;
  }

  setInstallProgress(p) {
    const box = $('.ab-install-prog', this.el);
    if (!box) return;
    box.hidden = false;
    $('i', box).style.width = `${Math.round((p.progress || 0) * 100)}%`;
    $('span', box).textContent = `${p.label || ''}${p.progress != null ? ` · ${Math.round(p.progress * 100)} %` : ''}`;
  }

  // ------------------------------------------------------------------ formulaires
  renderForm() {
    const f = $('.ab-form', this.el);
    const c = this.cfg;
    const [, title, , hint] = SECTIONS.find((s) => s[0] === this.section);
    const twaNote = c.engine === 'twa' && c.source.kind === 'url' && ['nav', 'native', 'screens', 'look'].includes(this.section)
      ? `<div class="ab-note">${icon('info', 15)}<span>Mode Trusted Web Activity : c’est le navigateur qui affiche le site. Ces réglages servent uniquement à la WebView de repli (téléphone sans navigateur compatible).</span></div>` : '';
    const same = this._formSec === this.section;
    const top = f.scrollTop;
    f.innerHTML = `<header class="ab-head"><h2>${title}</h2><p>${hint}</p></header>${twaNote}${this[`form_${this.section}`](c)}`;
    // Même section : on garde la position (un réglage ne ramène plus en haut) ; nouvelle section : en haut.
    f.scrollTop = same ? top : 0;
    this._formSec = this.section;
    if (this.section === 'icon') this.updateIconPreviews();
  }

  field(label, k, opts = {}) {
    const v = getPath(this.cfg, k);
    const type = opts.type || 'text';
    if (type === 'color') {
      return `<label class="field ab-color"><span>${label}</span><span class="ab-color-row"><input type="color" data-k="${k}" value="${esc(v || opts.placeholder || '#ffffff')}"><input class="input" data-k="${k}" value="${esc(v || '')}" placeholder="${esc(opts.placeholder || '#FFFFFF')}" spellcheck="false"></span></label>`;
    }
    if (type === 'textarea') return `<label class="field"><span>${label}</span><textarea class="input code" rows="${opts.rows || 5}" data-k="${k}" placeholder="${esc(opts.placeholder || '')}" spellcheck="false">${esc(v || '')}</textarea>${opts.hint ? `<small class="ab-hint">${opts.hint}</small>` : ''}</label>`;
    if (type === 'select') return `<label class="field"><span>${label}</span><select class="input" data-k="${k}">${Object.entries(opts.options).map(([val, l]) => `<option value="${val}" ${String(v) === val ? 'selected' : ''}>${l}</option>`).join('')}</select>${opts.hint ? `<small class="ab-hint">${opts.hint}</small>` : ''}</label>`;
    return `<label class="field"><span>${label}</span><input class="input" type="${type}" data-k="${k}" value="${esc(v ?? '')}" placeholder="${esc(opts.placeholder || '')}" ${opts.min != null ? `min="${opts.min}"` : ''} ${opts.max != null ? `max="${opts.max}"` : ''} ${opts.step ? `step="${opts.step}"` : ''} spellcheck="false">${opts.hint ? `<small class="ab-hint">${opts.hint}</small>` : ''}</label>`;
  }

  tog(label, k, hint) {
    return toggle(`k:${k}`, label, hint, Boolean(getPath(this.cfg, k)));
  }

  segK(k, options) {
    return seg(`k:${k}`, getPath(this.cfg, k), options);
  }

  card(title, body, extra = '') {
    return `<section class="ab-card">${title ? `<h3>${title}${extra}</h3>` : ''}${body}</section>`;
  }

  form_source(c) {
    const project = S.source && S.source.mode === 'project' && S.source.dir ? S.source : null;
    const kind = c.source.kind;
    let body = '';
    if (kind === 'url') {
      body = this.card('Adresse du site', `${this.field('Adresse de départ', 'source.url', { type: 'url', placeholder: 'https://www.monsite.com/' })}
        <div class="ab-row">
          ${S.baseUrl && /^https?:/.test(S.baseUrl) ? `<button class="btn small" data-act="use-current">${icon('link', 14)}<span>Page ouverte (NEX-LAB)</span></button>` : ''}
          <button class="btn small" data-act="check-url">${icon('pass', 14)}<span>Vérifier</span></button>
          <button class="btn small primary" data-act="detect" ${c.source.url ? '' : 'disabled'} title="Nom, logo, couleurs, langue, contacts, identifiant…">${icon('sparkle', 14)}<span>Reconnaître le site</span></button>
          <span class="ab-url-state"></span>
        </div>
        ${c.detected ? `<div class="ab-detected">${icon('pass', 13)}<span>Identité reconnue : <b>${esc(c.detected.name || '')}</b>${c.detected.logo ? ' · logo' : ''}${c.detected.brand ? ` · <i class="ab-dot" style="background:${esc(c.detected.brand)}"></i>${esc(c.detected.brand)}` : ''}${c.detected.lang ? ` · ${esc(c.detected.lang)}` : ''}</span></div>` : ''}
        ${this.listEditor('hosts', 'Autres domaines de l’application', [{ f: '', ph: 'paiement.monsite.com ou *.monsite.com' }], 'Les liens vers ces domaines restent dans l’application ; les autres suivent la règle des liens externes.')}`);
    } else {
      body = this.card('Projet', `
        <div class="ab-pick">
          <div><b>${esc(c.source.dir || 'Aucun dossier')}</b><small>${c.source.www ? `Fichiers intégrés : ${esc(c.source.www)}` : kind === 'project' ? 'Dossier du code source (package.json, pubspec.yaml…)' : 'Dossier contenant index.html'}</small></div>
          <button class="btn small" data-act="pick-dir">${icon('folderOpen', 14)}<span>Choisir…</span></button>
        </div>
        ${project ? `<button class="btn small" data-act="use-project">${icon('folder', 14)}<span>Projet ouvert : ${esc(project.name || project.dir)}</span></button>` : ''}
        <div class="ab-dirinfo"></div>
        ${kind === 'project' ? `<button class="btn small" data-act="build-web" ${c.source.dir ? '' : 'disabled'}>${icon('wrench', 14)}<span>Construire le projet (npm run build / flutter build web)</span></button>` : ''}
        ${this.field('Adresse publique du site (facultatif)', 'source.publicUrl', { type: 'url', placeholder: 'https://www.monsite.com', hint: 'Utilisée pour les liens partagés et les liens profonds. Les fichiers restent dans l’application : elle démarre sans réseau.' })}`)
        + this.card('Optimisations', `
          ${this.tog('Optimiser à la construction', 'optimize.enabled', 'Appliqué à la copie intégrée, jamais à tes fichiers.')}
          ${this.tog('Proportions et responsive', 'optimize.viewport', 'Balise viewport complète : la page garde sa mise en page mobile, sans agrandissement par la taille du texte système.')}
          ${this.tog('Polices Google intégrées', 'optimize.fonts', 'Téléchargées une fois : premier affichage immédiat, même hors ligne.')}
          ${this.tog('Images réduites', 'optimize.images', 'Côté le plus long limité à la valeur ci-dessous ; même format, même nom.')}
          ${this.field('Taille maximale des images (px)', 'optimize.maxImageSide', { type: 'number', min: 800, max: 6000, step: 100 })}
          ${this.tog('Préchargement des styles', 'optimize.preload', 'La page d’accueil s’affiche plus vite.')}`);
    }
    const engine = kind === 'url' ? this.card('Moteur de l’application', `${this.segK('engine', { webview: 'NEX-WEBVIEW', twa: 'Plein écran navigateur (PWA)' })}
        <p class="ab-hint">${c.engine === 'twa'
    ? 'Le site s’ouvre en plein écran dans Chrome (ou Edge, Samsung Internet…) : service workers, notifications push, connexion Google et cookies du navigateur. Il faut publier assetlinks.json sur le site. Sans navigateur compatible, l’application se replie sur la WebView de NEXORA.'
    : 'WebView intégrée : toutes les fonctions natives de NEXORA (onglets, menu, scanner, biométrie, compatible avec le SDK webtonative), sans dépendre du navigateur installé.'}</p>`) : '';
    return this.card('Type de source', this.segK('source.kind', { url: 'Site en ligne', project: 'Projet (code source)', built: 'Dossier construit' })
      + `<p class="ab-hint">${kind === 'url' ? 'L’application ouvre ton site en ligne : chaque mise à jour du site est visible sans republier l’application.' : 'Les fichiers sont intégrés à l’application (comme pour THE GOOD’s DEEL) : démarrage rapide, fonctionnement hors ligne, proportions conservées.'}</p>`) + engine + body;
  }

  // ------------------------------------------------------------------ inspection PWA (comme PWABuilder)
  form_pwa(c) {
    const r = c.pwa.report;
    const url = c.source.kind === 'url' ? c.source.url : (c.source.publicUrl || '');
    const ring = (title, sc, ic) => {
      if (!sc) return `<div class="ab-score"><div class="ab-ring" style="--p:0">${icon(ic, 18)}</div><b>${title}</b><small>Absent</small></div>`;
      const [ok, all] = sc.required;
      const tot = sc.required[1] + sc.recommended[1] + sc.optional[1];
      const got = sc.required[0] + sc.recommended[0] + sc.optional[0];
      const pct = tot ? Math.round((got / tot) * 100) : 0;
      return `<div class="ab-score ${ok < all ? 'bad' : pct > 70 ? 'ok' : 'warn'}"><div class="ab-ring" style="--p:${pct}"><span>${got}<small>/${tot}</small></span></div><b>${title}</b><small>${ok}/${all} requis · ${sc.recommended[0]}/${sc.recommended[1]} recommandés</small></div>`;
    };
    const list = (tests) => ['required', 'recommended', 'optional'].map((cat) => {
      const t = tests.filter((x) => x.category === cat);
      if (!t.length) return '';
      return `<div class="ab-tests"><h4>${{ required: 'Requis', recommended: 'Recommandés', optional: 'Facultatifs' }[cat]}</h4>${t.map((x) => `<div class="ab-test ${x.ok ? 'ok' : cat === 'required' ? 'bad' : 'warn'}">${icon(x.ok ? 'pass' : cat === 'required' ? 'error' : 'warn', 13)}<span>${esc(x.label)}${x.note ? `<small>${esc(x.note)}</small>` : ''}</span></div>`).join('')}</div>`;
    }).join('');
    const served = this.inspectUrl();
    const local = c.source.kind !== 'url';
    const head = this.card('Site à analyser', `
      <div class="ab-row"><input class="input" data-pwa-url value="${esc(url || served)}" placeholder="${local ? 'Lance le projet dans le Responsive Lab, ou colle une adresse' : 'https://www.monsite.com/'}" spellcheck="false">
        <button class="btn primary small" data-act="pwa-inspect">${icon('audit', 14)}<span>Analyser</span></button>
        <button class="btn small primary" data-act="detect" title="Nom, logo, couleurs, langue, contacts, identifiant…">${icon('sparkle', 14)}<span>Reconnaître le site</span></button>
      </div>
      <p class="ab-hint">Reconnaît l’identité (nom, logo, couleurs) puis vérifie le manifest, le service worker (dont le fonctionnement hors ligne) et la sécurité. ${local ? 'Pour un projet local, lance-le d’abord dans le Responsive Lab : NEXORA analyse alors son adresse locale.' : 'Les points manquants peuvent être générés ci-dessous.'}</p>
      ${local && !served ? '<p class="ab-hint bad">Aucune adresse à analyser : lance le projet (Responsive Lab) ou renseigne une adresse publique dans la section Source.</p>' : ''}`);
    if (!r) return head + this.pwaGenerator(c);
    const m = r.manifest;
    return head + this.card('Bilan', `<div class="ab-scores">${ring('Manifest', r.scores.manifest, 'file')}${ring('Service worker', r.scores.sw, 'layers')}${ring('Sécurité', r.scores.security, 'lock')}</div>
        <p class="ab-hint">${esc(r.url)} · ${r.installable ? '<span class="ok">installable</span>' : '<span class="bad">pas encore installable</span>'}${r.manifestUrl ? ` · manifest : ${esc(r.manifestUrl)}` : ' · aucun manifest déclaré'}</p>
        ${!m && r.identity ? `<div class="ab-row"><button class="btn small primary" data-act="pwa-identity">${icon('sparkle', 14)}<span>Pas de manifest : utiliser l’identité reconnue (nom, logo, couleurs)</span></button></div>` : ''}
        ${m ? `<div class="ab-row"><button class="btn small primary" data-act="pwa-apply">${icon('download', 14)}<span>Utiliser ce manifest pour l’application</span></button>${r.icons.length ? `<span class="ab-hint" style="margin-left:auto">${r.icons.length} icône${r.icons.length > 1 ? 's' : ''} : ${esc(r.icons.map((i) => `${i.sizes || '?'}${i.purpose && i.purpose !== 'any' ? ` ${i.purpose}` : ''}`).join(', '))}</span>` : ''}</div>` : ''}`)
      + this.card('Manifest', m ? list(r.tests) + `<details class="ab-details"><summary>Contenu du manifest</summary><pre class="ab-pre">${esc(JSON.stringify(m, null, 2))}</pre></details>` : `<p class="ab-hint bad">${r.manifestError ? `Manifest illisible : ${esc(r.manifestError)}` : 'Aucune balise &lt;link rel="manifest"&gt; dans la page.'}</p>`)
      + this.card('Service worker', `${list(r.swTests)}`)
      + this.card('Sécurité', `${list(r.secTests)}${r.security.mixed.length ? `<details class="ab-details"><summary>${r.security.mixed.length} ressource(s) en http</summary><pre class="ab-pre">${esc(r.security.mixed.join('\n'))}</pre></details>` : ''}`)
      + this.aiCard(c)
      + this.pwaGenerator(c);
  }

  // Assistant IA : explique et corrige les points manquants de l'inspection (manifest, SW, sécurité).
  aiCard() {
    const r = this.cfg.pwa.report;
    const fails = [...(r.tests || []), ...(r.swTests || []), ...(r.secTests || [])].filter((t) => !t.ok && t.category !== 'optional');
    return this.card('Assistant IA', `<p class="ab-hint">${fails.length ? `${fails.length} point${fails.length > 1 ? 's' : ''} à corriger. L’IA explique chacun et te donne le code exact (manifest, service worker, balises, en-têtes serveur), adapté à ton site.` : 'Aucun point requis ou recommandé en échec. Tu peux quand même demander des conseils d’amélioration.'}</p>
      <div class="ab-row"><button class="btn small primary" data-act="pwa-ai">${icon('sparkle', 14)}<span>${fails.length ? 'Corriger avec l’IA' : 'Conseils de l’IA'}</span></button></div>
      <div class="ab-ai-out" hidden></div>`);
  }

  async act_pwa_ai(btn) {
    const ai = await import('../core/ai.js');
    const { renderMd } = await import('../core/md.js');
    if (!(await ai.aiReady())) { toast('Configure d’abord une IA (bouton IA en haut à droite).'); ai.openAiSettings(); return; }
    const r = this.cfg.pwa.report;
    if (!r) return;
    const target = $('.ab-ai-out', this.el);
    target.hidden = false;
    target.innerHTML = `<div class="ab-ai-load"><span class="spinner small"></span> L’IA analyse le rapport…</div>`;
    const fmt = (arr) => (arr || []).filter((t) => !t.ok && t.category !== 'optional').map((t) => `- [${t.category}] ${t.label}${t.note ? ` (${t.note})` : ''}`).join('\n');
    const sections = [
      ['Manifest', fmt(r.tests)], ['Service worker', fmt(r.swTests)], ['Sécurité (en-têtes, HTTPS)', fmt(r.secTests)],
    ].filter(([, v]) => v).map(([k, v]) => `${k} :\n${v}`).join('\n\n');
    const system = 'Tu es un expert des PWA (Progressive Web Apps) et de la checklist PWABuilder de Microsoft. On te donne le résultat d’une inspection PWA d’un site. Pour chaque point manquant, explique brièvement pourquoi il compte puis donne le code EXACT à ajouter : entrées du manifest.json, code du service worker, balises <link>/<meta> à mettre dans le HTML, et en-têtes serveur (nginx, Apache .htaccess) quand c’est pertinent. Réponds en français, en blocs de code copiables, sans bla-bla. N’invente pas de problèmes : traite uniquement les points listés. Si aucun point n’est listé, donne 3 à 5 conseils concrets pour améliorer la PWA.';
    const prompt = `Site inspecté : ${r.url}\nInstallable : ${r.installable ? 'oui' : 'non'}\n\n${sections || 'Aucun point requis/recommandé en échec.'}`;
    let acc = '';
    try {
      await ai.aiChat({ messages: [{ role: 'user', content: prompt }], system, onChunk: (t) => { acc += t; target.innerHTML = `<div class="ab-ai-md">${renderMd(acc)}</div>`; } });
      target.innerHTML = `<div class="ab-ai-md">${renderMd(acc)}</div><div class="ab-row" style="margin-top:8px"><button class="btn small" data-copy="${esc(acc)}">${icon('copy', 12)}<span>Copier</span></button></div>`;
    } catch (err) { target.innerHTML = `<p class="ab-hint bad">${esc(err.message || String(err))}</p>`; }
  }

  pwaGenerator(c) {
    return this.card('Générer les fichiers PWA', `
      <p class="ab-hint">manifest.json (d’après les réglages de l’application), service worker, page hors ligne, icônes 192, 512, adaptable et monochrome, balises à ajouter aux pages et .well-known/assetlinks.json.</p>
      ${this.field('Stratégie du service worker', 'pwa.strategy', {
    type: 'select',
    options: {
      offline: 'Page hors ligne de secours', 'network-first': 'Réseau d’abord, cache en secours', 'cache-first': 'Cache d’abord pour les fichiers statiques', swr: 'Cache puis mise à jour en arrière-plan',
    },
  })}
      <div class="ab-row"><button class="btn small" data-act="pwa-pack">${icon('folderOpen', 14)}<span>Enregistrer les fichiers…</span></button><button class="btn small" data-act="pwa-sw-preview">${icon('code', 14)}<span>Voir le service worker</span></button></div>
      ${c.source.kind !== 'url' && c.source.dir ? `<div class="ab-isolate">${icon('sparkle', 14)}<div><b>Projet avec code source</b><small>NEXORA peut créer une <b>copie</b> de ton projet avec le manifest, le service worker, les icônes et les balises ajoutées dans les pages — <b>sans toucher à l’original</b> — puis continuer dessus.</small></div></div><button class="btn small primary wide" data-act="pwa-inject">${icon('copy', 14)}<span>Créer une copie du projet avec les éléments PWA</span></button>` : ''}
      <pre class="ab-pre ab-sw-prev" hidden></pre>`);
  }

  form_twa(c) {
    const t = c.twa;
    return this.card('Lancement', `
      ${this.field('Nom sous l’icône', 'twa.launcherName', { placeholder: (c.appName || '').slice(0, 12), hint: 'Version courte du nom (12 caractères conseillés).' })}
      ${this.field('Affichage', 'twa.display', { type: 'select', options: { standalone: 'Standard (barres système visibles)', fullscreen: 'Plein écran (jeux, médias)', 'fullscreen-sticky': 'Plein écran persistant (dessin, jeux à gestes)' } })}
      ${this.field('Orientation', 'twa.orientation', {
    type: 'select',
    options: {
      default: 'Par défaut', any: 'Toutes', natural: 'Naturelle', portrait: 'Portrait', 'portrait-primary': 'Portrait (endroit)', landscape: 'Paysage', 'landscape-primary': 'Paysage (endroit)',
    },
  })}
      ${this.field('Si aucun navigateur compatible', 'twa.fallback', { type: 'select', options: { webview: 'WebView de NEXORA (toutes les fonctions natives)', customtabs: 'Onglet personnalisé du navigateur' } })}`)
      + this.card('Couleurs', `<div class="ab-grid2">
        ${this.field('Barre d’état (thème)', 'twa.themeColor', { type: 'color', placeholder: c.icon.bg })}${this.field('Thème sombre', 'twa.themeColorDark', { type: 'color', placeholder: '' })}
        ${this.field('Barre de navigation', 'twa.navColor', { type: 'color', placeholder: c.icon.bg })}${this.field('Navigation (sombre)', 'twa.navColorDark', { type: 'color', placeholder: '' })}
        ${this.field('Séparateur de navigation', 'twa.navDivider', { type: 'color', placeholder: '' })}${this.field('Séparateur (sombre)', 'twa.navDividerDark', { type: 'color', placeholder: '' })}
        ${this.field('Fond de l’écran de démarrage', 'twa.bgColor', { type: 'color', placeholder: c.splash.bg || c.icon.bg })}${this.field('Fondu du démarrage (ms)', 'twa.splashFade', { type: 'number', min: 0, max: 3000, step: 50 })}</div>`)
      + this.card('Fonctions', `
        ${this.tog('Délégation des notifications', 'twa.notifications', 'Les notifications push du site s’affichent au nom de l’application, sans demande du navigateur.')}
        ${this.tog('Raccourci « Réglages du site »', 'twa.siteSettings', 'Appui long sur l’icône : autorisations et données du site.')}
        ${this.tog('Chromebook uniquement', 'twa.chromeOsOnly', 'Limite l’installation aux Chromebook (Play Store).')}
        ${this.listEditor('twa.trustedOrigins', 'Autres origines de confiance', [{ f: '', ph: 'https://paiement.monsite.com' }], 'Ces sites restent en plein écran s’ils publient aussi assetlinks.json.')}
        <p class="ab-hint">Cible de partage : ${t.shareTarget ? `<b>${esc(t.shareTarget.action || '/')}</b> (${esc((t.shareTarget.method || 'GET').toUpperCase())}), importée du manifest` : 'aucune (importée automatiquement si le manifest du site déclare share_target).'}</p>`)
      + this.card('Vérification du domaine', `<p class="ab-hint">La barre d’adresse disparaît quand le site publie <code>/.well-known/assetlinks.json</code> avec l’empreinte de la clé de signature. Le fichier est produit à chaque construction.</p>
        ${this.key && this.key.sha256 ? `<pre class="ab-pre">${esc(this.assetLinks())}</pre><button class="btn small" data-copy="${esc(this.assetLinks())}">${icon('copy', 14)}<span>Copier</span></button>` : '<p class="ab-hint">L’empreinte apparaîtra après la création de la clé (section Signature).</p>'}
        ${this.listEditor('twa.extraFingerprints', 'Empreintes supplémentaires (clé Google Play)', [{ f: '', ph: 'AB:CD:…' }], 'Play Console › Intégrité de l’application › empreinte SHA-256 de la clé de signature.')}`);
  }

  form_identity() {
    return this.card('Application', `
      ${this.field('Nom affiché', 'appName', { placeholder: 'Mon application' })}
      <label class="field"><span>Identifiant (package)</span><span class="ab-row"><input class="input mono" data-k="appId" value="${esc(this.cfg.appId)}" placeholder="${esc(suggestId(this.cfg))}" spellcheck="false"><button class="btn small" data-act="suggest-id">Proposer</button></span>
      <small class="ab-hint ${this.cfg.appId && !RX_APPID.test(this.cfg.appId) ? 'bad' : ''}">Unique sur le Play Store et définitif après la première publication. Lettres, chiffres et points : com.entreprise.app</small></label>
      <div class="ab-grid2">${this.field('Version', 'versionName', { placeholder: '1.0.0' })}${this.field('Numéro de version', 'versionCode', { type: 'number', min: 1, hint: 'À augmenter à chaque envoi sur le Play Store.' })}</div>`)
      + this.card('Écran', `
        <div class="ab-row"><span class="ab-hint">Orientation : <b>${esc((ORIENTS.find((o) => o[0] === this.cfg.orientation) || ORIENTS[0])[1])}</b></span><button class="btn small" data-sec="orient">${icon('rotate', 13)}<span>Régler l’orientation…</span></button></div>
        ${this.tog('Android TV et Google TV', 'tv', 'Ajoute l’application à l’écran d’accueil des téléviseurs (bannière générée).')}`)
      + this.ownerCard();
  }

  ownerCard() {
    const o = this.cfg.owner;
    const person = (o.kind || 'person') === 'person';
    return this.card('Éditeur et contact', `
      <p class="ab-hint">Ces informations servent à la fiche Play Store (coordonnées de l’éditeur), au certificat de signature et aux mentions dans l’application. L’adresse e-mail et le site sont demandés par Google pour publier.</p>
      ${this.segK('owner.kind', { person: 'Personne', company: 'Entreprise' })}
      <div class="ab-grid2">${this.field(person ? 'Nom et prénom' : 'Raison sociale', 'owner.name', { placeholder: person ? 'Abraham Togbonon' : 'Mon Entreprise SARL' })}${person ? this.field('Organisation (facultatif)', 'owner.org') : this.field('Forme / sigle (facultatif)', 'owner.org', { placeholder: 'SARL, SAS…' })}</div>
      ${this.field('Fonction / rôle (facultatif)', 'owner.role', { placeholder: person ? 'Fondateur, développeur…' : 'Éditeur' })}
      <div class="ab-grid2">${this.field('E-mail de contact', 'owner.email', { type: 'email', placeholder: 'contact@monsite.com' })}${this.field('Téléphone', 'owner.phone', { type: 'tel', placeholder: '+229 01 00 00 00 00' })}</div>
      ${this.field('Site web', 'owner.website', { type: 'url', placeholder: 'https://www.monsite.com' })}
      <div class="ab-head-sep">Adresse</div>
      ${this.field('Rue et numéro', 'owner.street', { placeholder: 'Quartier, rue, numéro' })}
      <div class="ab-grid2">${this.field('Ville', 'owner.city', { placeholder: 'Cotonou' })}${this.field('Région / État (facultatif)', 'owner.region', { placeholder: 'Littoral' })}</div>
      <div class="ab-grid2">${this.field('Code postal (facultatif)', 'owner.postal')}${this.field('Pays (code à 2 lettres)', 'owner.country', { placeholder: 'BJ' })}</div>
      ${this.cfg.owner.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(this.cfg.owner.email) ? '<p class="ab-hint bad">L’adresse e-mail ne semble pas valide.</p>' : ''}`);
  }

  form_icon(c) {
    return this.card('Icône', `
      <div class="ab-icon-edit">
        <div class="ab-icon-prevs"></div>
        <div class="ab-icon-ctl">
          <div class="ab-row"><button class="btn small" data-act="pick-icon">${icon('image', 14)}<span>${c.icon.image ? 'Changer l’image' : 'Choisir une image'}</span></button>${c.icon.image ? `<button class="btn small" data-act="clear-icon">${icon('trash', 14)}</button>` : ''}</div>
          <small class="ab-hint">PNG ou SVG, carré, 1024 px conseillé. Sans image, l’initiale du nom est utilisée.</small>
          ${this.segK('icon.fill', { logo: 'Logo sur fond', full: 'Image pleine' })}
          ${c.icon.fill !== 'full' ? `<label class="field"><span>Taille du logo · ${Math.round(c.icon.scale * 100)} %</span><input type="range" min="0.4" max="1.3" step="0.01" data-k="icon.scale" value="${c.icon.scale}"></label>` : ''}
          <div class="ab-grid2">${this.field('Fond', 'icon.bg', { type: 'color' })}${c.icon.gradient ? this.field('Fond (2ᵉ couleur)', 'icon.bg2', { type: 'color' }) : ''}</div>
          ${this.tog('Dégradé', 'icon.gradient')}
          ${!c.icon.image ? this.field('Initiale (sinon logo NEXORA)', 'icon.letter', { placeholder: 'Logo NEXORA par défaut', hint: 'Sans image ni initiale, l’application porte le logo NEXORA jusqu’à la reconnaissance du site ou l’import de ton logo.' }) : ''}
        </div>
      </div>
      <p class="ab-hint">Toutes les tailles sont générées : icônes adaptatives (avec calque monochrome pour les icônes à thème d’Android 13+), rondes, anciennes versions, icône Play Store 512 px${c.tv ? ' et bannière TV' : ''}.</p>`)
      + this.card('Écran de démarrage', `
        <div class="ab-row"><button class="btn small" data-act="pick-splash">${icon('image', 14)}<span>${c.splash.image ? 'Changer le logo' : 'Logo spécifique (facultatif)'}</span></button>${c.splash.image ? `<button class="btn small" data-act="clear-splash">${icon('trash', 14)}</button>` : ''}</div>
        ${this.field('Couleur de fond', 'splash.bg', { type: 'color', placeholder: c.icon.bg })}
        <div class="ab-grid2">${this.field('Animation du logo', 'splash.intro', { type: 'select', options: SPLASH_INTROS })}${this.field('Animation de sortie', 'splash.anim', { type: 'select', options: SPLASH_EXITS })}</div>
        <label class="field"><span>Taille du logo · ${Math.round(c.splash.logoSize || 150)} dp</span><input type="range" min="72" max="240" step="2" data-k="splash.logoSize" value="${c.splash.logoSize || 150}"></label>
        ${this.tog('Nom de l’application sous le logo', 'splash.showName')}
        <div class="ab-grid2">${this.field('Phrase d’accroche', 'splash.tagline', { placeholder: 'Le marché dans ta poche' })}${this.field('Couleur du texte', 'splash.textColor', { type: 'color', placeholder: '' })}</div>
        <button class="btn small" data-act="replay-splash">${icon('play', 13)}<span>Voir l’animation</span></button>
        ${this.field('Masquer', 'splash.hideOn', { type: 'select', options: { load: 'Quand la page est affichée', js: 'Quand la page appelle hideSplashScreen()' }, hint: 'Avec le signal JavaScript, la page décide du moment (données chargées…). Une durée maximale évite tout blocage.' })}
        <div class="ab-grid2">${this.field('Durée minimale (ms)', 'splash.min', { type: 'number', min: 0, max: 5000, step: 100 })}${this.field('Durée maximale (ms)', 'splash.max', { type: 'number', min: 1500, max: 20000, step: 500 })}</div>`);
  }

  // Orientation de l'écran : verrouillage portrait / paysage, automatique, réglage tablette, contrôle par la page.
  form_orient(c) {
    const cur = c.orientation || 'unspecified';
    const tile = ([v, label, hint, ic]) => `<label class="ab-ot${cur === v ? ' on' : ''}"><input type="radio" name="ab-orient" data-k="orientation" value="${v}" ${cur === v ? 'checked' : ''}><span class="ab-ot-ic ${ic}"><i></i></span><b>${label}</b><small>${hint}</small></label>`;
    const flipOk = cur === 'portrait' || cur === 'landscape';
    return this.card('Orientation du téléphone', `<div class="ab-ots">${ORIENTS.map(tile).join('')}</div>
        ${flipOk ? this.tog('Autoriser le retournement à 180°', 'orientFlip', cur === 'portrait' ? 'Portrait à l’endroit ou à l’envers, selon la façon dont le téléphone est tenu.' : 'Paysage à gauche ou à droite selon la façon dont le téléphone est tenu (conseillé pour les jeux et les vidéos).') : ''}
        <p class="ab-hint">${{
    unspecified: 'L’écran tourne avec le téléphone, sauf si l’utilisateur a verrouillé la rotation dans ses réglages rapides.',
    portrait: 'L’application reste toujours en portrait, même téléphone tourné.',
    landscape: 'L’application reste toujours en paysage, même téléphone tenu droit. L’aperçu à droite est affiché en paysage.',
    sensor: 'L’écran suit le capteur dans les quatre sens, y compris quand l’utilisateur a verrouillé la rotation.',
  }[cur] || ''}</p>`)
      + this.card('Tablettes', `${this.field('Orientation sur tablette', 'orientTablet', {
        type: 'select',
        options: {
          same: 'Comme sur téléphone', unspecified: 'Automatique', portrait: 'Portrait verrouillé', landscape: 'Paysage verrouillé', sensor: 'Toutes (capteur)',
        },
        hint: 'Tablettes et grands écrans (plus de 600 dp de large). Exemple courant : portrait sur téléphone, automatique sur tablette.',
      })}`)
      + this.card('Contrôle par la page', `${this.tog('La page peut changer l’orientation', 'orientJs', 'Utile pour une vidéo en plein écran ou un jeu : la page verrouille puis libère l’orientation.')}
        ${c.orientJs ? `<pre class="ab-pre">${esc(`// Verrouiller en paysage pendant la vidéo, puis revenir au réglage de l’application
await NexoraApp.setOrientation('landscape');   // 'portrait' · 'landscape' · 'auto' · 'lock' (garder l’actuelle)
NexoraApp.setOrientation('default');           // réglage choisi dans l’App Builder
NexoraApp.orientation();                       // 'portrait' ou 'landscape'

// L’API standard du web fonctionne aussi dans l’application :
screen.orientation.lock('landscape'); screen.orientation.unlock();`)}</pre>` : ''}`)
      + (c.engine === 'twa' ? this.card('', '<p class="ab-hint">Moteur « Plein écran navigateur » : l’orientation choisie s’applique aussi au manifest du site (réglage tablette et contrôle par la page : moteur WebView uniquement).</p>') : '');
  }

  form_look() {
    return this.card('Barre d’état', `
      ${this.segK('config.statusMode', { auto: 'Couleur de la page', color: 'Couleur fixe', overlay: 'Superposée' })}
      <p class="ab-hint">« Couleur de la page » suit le haut de chaque page, comme dans Chrome. « Superposée » dessine la page sous la barre (variable CSS --nexora-top et env(safe-area-inset-top)).</p>
      ${this.field('Couleur', 'config.statusColor', { type: 'color' })}`)
      + this.card('Barre de navigation du système', `${this.segK('config.navMode', { auto: 'Couleur de la page', color: 'Couleur fixe' })}${this.field('Couleur', 'config.navColor', { type: 'color' })}`)
      + this.card('Couleurs', `<div class="ab-grid2">${this.field('Accent (boutons, chargement)', 'accent', { type: 'color' })}${this.field('Fond de l’application', 'config.bgColor', { type: 'color' })}</div>`)
      + this.card('Chargement', `${this.segK('config.loader', { bar: 'Barre fine', spinner: 'Rond au centre', none: 'Aucun' })}
        ${this.tog('Tirer pour actualiser', 'config.pullToRefresh', 'Geste vers le bas en haut de page.')}
        ${this.tog('Plein écran', 'config.fullscreen', 'Barres système masquées (jeux, bornes, vidéo).')}
        ${this.tog('Zoom à deux doigts', 'config.zoom')}`);
  }

  form_nav(c) {
    const iconOpts = Object.keys(this.tabIcons).sort();
    const tabs = c.config.tabs.map((t, i) => `
      <div class="ab-li">
        ${this.iconPick(`config.tabs.${i}.icon`, t.icon, iconOpts)}
        <input class="input" data-k="config.tabs.${i}.label" value="${esc(t.label)}" placeholder="Libellé">
        <input class="input" data-k="config.tabs.${i}.url" value="${esc(t.url)}" placeholder="https://… ou /chemin">
        <button class="icon-btn" data-list-del="config.tabs" data-i="${i}" title="Retirer">${icon('close', 13)}</button>
      </div>`).join('');
    const items = c.config.menu.items.map((t, i) => `
      <div class="ab-li">
        ${this.iconPick(`config.menu.items.${i}.icon`, t.icon, iconOpts)}
        <input class="input" data-k="config.menu.items.${i}.label" value="${esc(t.label)}" placeholder="Libellé">
        <input class="input" data-k="config.menu.items.${i}.url" value="${esc(t.url)}" placeholder="https://… ou /chemin">
        <button class="icon-btn" data-list-del="config.menu.items" data-i="${i}">${icon('close', 13)}</button>
      </div>`).join('');
    const sc = c.shortcuts.map((t, i) => `
      <div class="ab-li">
        ${this.iconPick(`shortcuts.${i}.icon`, t.icon, iconOpts)}
        <input class="input" data-k="shortcuts.${i}.label" value="${esc(t.label)}" placeholder="Libellé (25 car.)" maxlength="25">
        <input class="input" data-k="shortcuts.${i}.url" value="${esc(t.url)}" placeholder="https://…">
        <button class="icon-btn" data-list-del="shortcuts" data-i="${i}">${icon('close', 13)}</button>
      </div>`).join('');
    return this.card('Onglets en bas', `${tabs || '<p class="ab-empty">Aucun onglet : la page occupe tout l’écran.</p>'}
        ${c.config.tabs.length < 5 ? `<button class="btn small" data-list-add="config.tabs">${icon('plus', 14)}<span>Ajouter un onglet</span></button>` : ''}
        ${c.config.tabs.length ? `<div class="ab-grid3">${this.field('Fond', 'config.tabBg', { type: 'color' })}${this.field('Actif', 'config.tabActive', { type: 'color', placeholder: c.accent })}${this.field('Inactif', 'config.tabInactive', { type: 'color' })}</div>` : ''}`, ' <small>jusqu’à 5</small>')
      + this.card('Menu latéral', `${this.tog('Menu latéral', 'config.menu.enabled', 'S’ouvre avec le bouton flottant (action « Ouvrir le menu ») ou NexoraApp.openMenu().')}
        ${c.config.menu.enabled ? `${this.field('Titre', 'config.menu.title', { placeholder: c.appName })}${items}<button class="btn small" data-list-add="config.menu.items">${icon('plus', 14)}<span>Ajouter une entrée</span></button>` : ''}`)
      + this.card('Bouton flottant', `${this.tog('Bouton flottant', 'config.fab.enabled')}
        ${c.config.fab.enabled ? `<div class="ab-grid2">${this.field('Action', 'config.fab.action', { type: 'select', options: FAB_ACTIONS })}${['whatsapp', 'tel', 'url', 'js'].includes(c.config.fab.action) ? this.field(c.config.fab.action === 'whatsapp' || c.config.fab.action === 'tel' ? 'Numéro' : c.config.fab.action === 'js' ? 'Code' : 'Adresse', 'config.fab.value', { placeholder: c.config.fab.action === 'url' ? '/contact' : c.config.fab.action === 'js' ? 'openChat()' : '+229 01 00 00 00 00' }) : ''}</div>
        <div class="ab-grid2"><label class="field"><span>Icône</span>${this.iconPick('config.fab.icon', c.config.fab.icon, iconOpts)}</label>${this.field('Couleur', 'config.fab.color', { type: 'color', placeholder: c.accent })}</div>
        ${this.segK('config.fab.position', { left: 'À gauche', right: 'À droite' })}` : ''}`)
      + this.card('Bouton retour', this.field('Comportement', 'config.back', { type: 'select', options: { history: 'Page précédente, puis quitter', confirm: 'Page précédente, puis « appuie encore pour quitter »', exit: 'Quitter directement' } }))
      + this.card('Raccourcis de l’icône', `<p class="ab-hint">Appui long sur l’icône de l’application (4 au maximum).</p>${sc}${c.shortcuts.length < 4 ? `<button class="btn small" data-list-add="shortcuts">${icon('plus', 14)}<span>Ajouter un raccourci</span></button>` : ''}`);
  }

  iconPick(k, value, opts) {
    return `<button class="ab-icopick" data-iconpick="${k}" title="Choisir l’icône">${this.svgTab(value || 'home', 18)}</button>`;
  }

  svgTab(name, size = 22, color = 'currentColor') {
    const paths = this.tabIcons[name] || this.tabIcons.home || [];
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round">${paths.map((p) => `<path d="${p.d}" ${p.fill ? `fill="${color}"` : ''} ${p.stroke ? `stroke-width="${p.width}"` : 'stroke="none"'}/>`).join('')}</svg>`;
  }

  form_links(c) {
    const rules = c.config.linkRules.map((r, i) => `
      <div class="ab-li">
        <input class="input mono" data-k="config.linkRules.${i}.pattern" value="${esc(r.pattern)}" placeholder="*.pdf  ·  facebook.com  ·  https://site.com/aide/*">
        <select class="input" data-k="config.linkRules.${i}.action">${Object.entries({ app: 'Dans l’application', inapp: 'Navigateur intégré', browser: 'Navigateur externe', block: 'Bloquer' }).map(([k, l]) => `<option value="${k}" ${r.action === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="icon-btn" data-list-del="config.linkRules" data-i="${i}">${icon('close', 13)}</button>
      </div>`).join('');
    return this.card('Liens vers d’autres sites', `${this.segK('config.externalLinks', { browser: 'Navigateur externe', inapp: 'Navigateur intégré', app: 'Dans l’application' })}
        <p class="ab-hint">Le navigateur intégré s’ouvre par-dessus l’application avec un bouton de fermeture (paiements, réseaux sociaux…). Les liens tel:, mailto:, WhatsApp, Maps et intent:// ouvrent toujours l’application correspondante.</p>`)
      + this.card('Règles', `<p class="ab-hint">Évaluées dans l’ordre, avant la règle générale. « * » remplace n’importe quels caractères ; sans « / », le motif vise le domaine et ses sous-domaines.</p>${rules}<button class="btn small" data-list-add="config.linkRules">${icon('plus', 14)}<span>Ajouter une règle</span></button>`)
      + this.card('Liens profonds', `${this.tog('Ouvrir les liens du site dans l’application', 'deepLinks.enabled', 'Un lien https vers ton domaine ouvre directement l’application (après vérification du domaine par assetlinks.json).')}
        ${c.deepLinks.enabled ? `${this.listEditor('deepLinks.hosts', 'Domaines', [{ f: '', ph: 'www.monsite.com' }])}${this.field('Schéma personnalisé', 'deepLinks.scheme', { placeholder: 'monapp', hint: 'monapp://produit/42 ouvre /produit/42.' })}${this.key && this.key.sha256 ? `<details class="ab-details"><summary>Fichier assetlinks.json à publier</summary><pre class="ab-pre">${esc(this.assetLinks())}</pre><button class="btn small" data-copy="${esc(this.assetLinks())}">${icon('copy', 14)}<span>Copier</span></button><p class="ab-hint">À placer sur https://${esc((c.deepLinks.hosts[0]) || 'ton-domaine')}/.well-known/assetlinks.json</p></details>` : '<p class="ab-hint">Le fichier assetlinks.json sera proposé après la création de la clé de signature.</p>'}` : ''}`);
  }

  assetLinks() {
    const fps = [this.key.sha256, ...((this.cfg.twa && this.cfg.twa.extraFingerprints) || [])].filter(Boolean);
    return JSON.stringify([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: this.cfg.appId, sha256_cert_fingerprints: fps } }], null, 2);
  }

  listEditor(k, label, cols, hint) {
    const arr = getPath(this.cfg, k) || [];
    return `<div class="field"><span>${label}</span>${arr.map((v, i) => `<div class="ab-li"><input class="input mono" data-k="${k}.${i}" value="${esc(v)}" placeholder="${esc(cols[0].ph)}"><button class="icon-btn" data-list-del="${k}" data-i="${i}">${icon('close', 13)}</button></div>`).join('')}
      <button class="btn small" data-list-add="${k}" data-scalar="1">${icon('plus', 14)}<span>Ajouter</span></button>${hint ? `<small class="ab-hint">${hint}</small>` : ''}</div>`;
  }

  form_native(c) {
    const perms = PERMS.map(([k, l, hint]) => `<label class="tog-row"><span class="tog-text"><span>${l}</span><small>${hint}</small></span><input type="checkbox" data-perm="${k}" ${c.permissions.includes(k) ? 'checked' : ''}><span class="tog"></span></label>`).join('');
    return this.card('Autorisations', `${perms}${this.tog('Demander au premier lancement', 'config.askAtStart', 'Sinon, chaque autorisation est demandée au moment où la page en a besoin (recommandé par Google).')}`)
      + this.card('Fonctions', `
        ${this.tog('Lecteur de codes-barres et QR codes', 'config.scanner', 'Plein écran, lampe, tous les formats courants. Ajoute l’appareil photo.')}
        ${this.tog('Envoi de fichiers', 'config.fileUpload', 'Champs <input type=file> avec appareil photo et galerie.')}
        ${this.tog('Téléchargements', 'downloads', 'Fichiers, blobs et data: enregistrés dans Téléchargements.')}
        ${this.tog('Presse-papiers', 'config.clipboard')}`)
      + this.card('Stabilité et isolement', `<ul class="ab-feat">
          <li>Environnement propre à l’application <code>${esc(c.appId || 'com.exemple.app')}</code> : stockage, cookies, cache, clés de signature et sujets de notifications ne sont partagés avec aucune autre application créée par NEXORA.</li>
          <li>Démarrage protégé : une fonction facultative qui échoue (menu, onglets, notifications…) est ignorée au lieu de fermer l’application.</li>
          <li>Si l’application se ferme deux fois de suite au démarrage, elle se relance en mode simplifié (page seule) et garde un rapport d’erreur.</li>
          <li>Moteur de page arrêté par Android (mémoire saturée) : l’application recharge la page au lieu de se fermer.</li>
        </ul>
        ${this.tog('Afficher le rapport d’erreur au redémarrage', 'config.debug', 'Mode diagnostic : affiche la cause d’une fermeture inattendue et active l’inspection depuis Chrome (chrome://inspect). À désactiver pour la publication.')}
        <small class="ab-hint">Le rapport est aussi enregistré dans <code>Android/data/${esc(c.appId || '…')}/files/nexora-crash.txt</code> et lisible depuis la page avec <code>NexoraApp.lastError()</code>.</small>`)
      + this.card('SDK JavaScript', `<p class="ab-hint">L’application expose <code>window.WebToNativeInterface</code> : une page déjà adaptée au SDK <b>webtonative</b> (npm) fonctionne sans changement. Elle expose aussi <code>window.NexoraApp</code> (promesses) et l’événement <code>vitrinenative</code>.</p>
        <ul class="ab-feat">${WTN_FEATURES.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <pre class="ab-pre">${esc(`if (window.NexoraApp) {
  NexoraApp.share({ title: 'Mon produit', url: location.href });
  const code = await NexoraApp.scan();          // lecteur de codes
  NexoraApp.notify('Commande', 'Ta commande est prête');
  NexoraApp.hideSplash();                        // écran de démarrage
}`)}</pre>`);
  }

  // ------------------------------------------------------------------ notifications locales (sans serveur)
  form_events(c) {
    const e = c.config.events || (c.config.events = { enabled: true, network: true, download: true, update: true, channel: 'Activité' });
    const hasNotif = (c.permissions || []).includes('notifications');
    return this.card('Notifications locales', `<p class="ab-hint">L’application affiche elle-même des notifications, <b>sans aucun serveur</b>. Deux usages : les <b>événements intégrés</b> ci-dessous (connexion, téléchargement, mise à jour) et les notifications que <b>ta page déclenche</b> avec <code>NexoraApp.notify()</code> (commande prête, nouveau message…). Pour une diffusion depuis ton serveur même application fermée, utilise en plus les <b>notifications push</b>.</p>
        ${hasNotif ? '' : `<p class="ab-err">${icon('warn', 13)} L’autorisation « Notifications » n’est pas cochée (section Fonctions natives) : sans elle, Android 13+ n’affichera rien.</p>`}
        ${this.tog('Activer les notifications locales', 'config.events.enabled', 'Décoche pour tout désactiver d’un coup.')}`)
      + (e.enabled !== false ? this.card('Événements intégrés', `
        ${this.tog('Connexion perdue / rétablie', 'config.events.network', 'Prévient l’utilisateur quand le téléphone perd puis retrouve Internet.')}
        ${this.tog('Fin d’un téléchargement', 'config.events.download', 'Android affiche une notification quand un fichier téléchargé est prêt (appui = ouvrir).')}
        ${this.tog('Mise à jour disponible', 'config.events.update', 'Quand les réglages à distance annoncent une nouvelle version non obligatoire, une notification le rappelle.')}
        ${this.field('Nom de la catégorie', 'config.events.channel', { placeholder: 'Activité', hint: 'Nom affiché dans les réglages Android de l’application, pour que l’utilisateur puisse couper ces notifications sans couper les autres.' })}`)
        : '')
      + this.card('Déclencher depuis ta page', `<p class="ab-hint">Un seul appel, aucune configuration serveur. Idéal pour notifier un événement de l’application à l’instant où il se produit, quand l’application est ouverte.</p>
        <pre class="ab-pre">${esc(`// Notification simple
NexoraApp.notify('Commande validée', 'Ton paiement a été accepté ✅');

// Avec une page à ouvrir et une catégorie dédiée
NexoraApp.notify('Nouveau message', 'Amina t’a écrit', {
  url: '/messages/amina',
  channel: 'Messages',   // classe la notification (réglable par l’utilisateur)
  id: 42                 // réutilise le même id pour remplacer une notification
});`)}</pre>
        <details class="ab-doc"><summary>Événements de la page à relier</summary><p>Relie <code>NexoraApp.notify()</code> à tes propres événements : réception d’un message (WebSocket), fin d’une commande, minuteur, rappel… Exemple avec un service worker déjà présent :</p>
        <pre class="ab-pre">${esc(`self.addEventListener('message', (e) => {
  if (e.data?.type === 'order-ready')
    window.NexoraApp?.notify('Commande prête', e.data.text, { url: '/suivi' });
});`)}</pre>
        <p class="ab-hint">Sur un téléphone sans l’application (navigateur web), <code>NexoraApp</code> est absent : prévois une solution de repli (Notification web ou rien).</p></details>`);
  }

  // ------------------------------------------------------------------ notifications push
  form_push(c) {
    const p = c.push;
    const twa = c.engine === 'twa' && c.source.kind === 'url';
    const st = this.pushSt || {};
    const pr = p.project;
    const idOk = RX_APPID.test(c.appId || '');
    const gsOk = Boolean(p.googleServices && pr && pr.app === c.appId);
    const pfx = `${String(c.appId || 'com.exemple.app').replace(/\./g, '_')}__`;
    const topics = (p.topics && p.topics.length ? p.topics : ['all']).filter(Boolean);
    const step = (ok, n, title, body, warn) => `<li class="ab-pstep ${ok ? 'ok' : warn ? 'warn' : ''}"><i>${ok ? icon('check', 12) : n}</i><div><b>${title}</b>${body}</div></li>`;
    if (!this.pushSt && !this.pushStLoading) {
      this.pushStLoading = true;
      api.invoke('android:push-status', c.appId).then((r) => { this.pushSt = r; this.pushStLoading = false; if (this.section === 'push') this.renderForm(); }).catch(() => { this.pushStLoading = false; });
    }
    if (twa) {
      return this.card('Mode Trusted Web Activity', `<p class="ab-hint">En mode Trusted Web Activity, c’est Chrome qui affiche le site : les notifications passent par les <b>notifications web</b> du site (Web Push, service worker), et l’application les affiche grâce à la <b>délégation des notifications</b> (section Trusted Web Activity). Rien d’autre à configurer ici.</p><p class="ab-hint">Pour des notifications push gérées par l’application (Firebase), choisis le moteur WebView dans la section Source.</p>`);
    }
    return this.card('Notifications push', `<p class="ab-hint">Le serveur envoie des messages à tous les utilisateurs, <b>même application fermée</b>. Pour de simples notifications déclenchées par l’app ou ta page, sans serveur, vois <button class="link-btn" data-sec="events">Notifications locales</button>.</p>
      ${this.tog('Activer les notifications push', 'push.enabled', 'Messages envoyés à tes utilisateurs, même application fermée (Firebase Cloud Messaging, gratuit).')}
      ${p.enabled ? `<ol class="ab-psteps">
        ${step(idOk, 1, 'Identifiant de l’application', `<p>Firebase relie les notifications à cet identifiant : <code>${esc(c.appId || '—')}</code> <button class="link-btn" data-copy="${esc(c.appId || '')}">Copier</button>. Ne le change plus après la publication.</p>`, !idOk)}
        ${step(Boolean(pr), 2, 'Projet Firebase', `<p>Crée un projet gratuit (compte Google), puis <b>Ajouter une application › Android</b> avec l’identifiant ci-dessus. Le nom et l’empreinte SHA-1 sont facultatifs.</p><button class="btn small" data-external="https://console.firebase.google.com/">${icon('external', 13)}<span>Ouvrir la console Firebase</span></button>`)}
        ${step(gsOk, 3, 'Fichier google-services.json', `<p>${pr ? `Projet <b>${esc(pr.id)}</b> relié à l’application ${esc(pr.app)}` : 'Télécharge-le à la fin de l’ajout de l’application Android (ou Paramètres du projet › Général), puis importe-le ici.'}</p>${pr && pr.app !== c.appId ? `<p class="ab-err">Ce fichier est pour « ${esc(pr.app)} » : il doit correspondre à « ${esc(c.appId)} ».</p>` : ''}<div class="ab-row"><button class="btn small ${gsOk ? '' : 'primary'}" data-act="push-gs">${icon('folderOpen', 13)}<span>${p.googleServices ? 'Remplacer le fichier' : 'Importer google-services.json'}</span></button>${p.googleServices ? `<button class="btn small" data-act="push-gs-clear">${icon('trash', 13)}</button>` : ''}</div>`, p.googleServices && !gsOk)}
        ${step(Boolean(st.installed), 4, 'Kit de notifications', `<p>${st.installed ? 'Prêt : il est ajouté automatiquement à chaque construction.' : 'Préparé une seule fois sur ce PC (≈ 10 Mo, moins d’une minute). Sinon, il le sera à la première construction.'}</p>
          <p class="ab-hint">Emplacement : <code>${esc(st.dir || '—')}</code>${st.customDir ? ' (choisi)' : ' (par défaut)'}</p>
          <div class="ab-row">${st.installed ? '' : `<button class="btn small primary" data-act="push-kit">${icon('download', 13)}<span>Préparer le kit maintenant</span></button>`}<button class="btn small" data-act="push-kit-dir">${icon('folderOpen', 13)}<span>Changer l’emplacement…</span></button>${st.customDir ? `<button class="btn small" data-act="push-kit-dir-reset">${icon('restart', 13)}<span>Par défaut</span></button>` : ''}</div>
          ${this.pushKitErr ? `<p class="ab-err">${esc(this.pushKitErr)}</p>` : '<p class="ab-hint">En cas d’erreur d’accès (antivirus, OneDrive, dossiers protégés), choisis un dossier court comme <code>C:\\NEXORA-kit</code>.</p>'}`, Boolean(this.pushKitErr))}
      </ol>` : ''}`)
      + (p.enabled ? this.card('Réglages', `${this.tog('Demander l’autorisation au premier lancement', 'push.ask', 'Android 13 et plus demandent l’accord de l’utilisateur. Sinon, la page le demande avec NexoraApp.push.requestPermission().')}
        <div class="ab-grid2">${this.field('Nom de la catégorie de notifications', 'push.channel', { placeholder: 'Notifications' })}${this.field('Sujets (séparés par des virgules)', 'push.topicsText', { placeholder: 'all, promos' })}</div>
        <small class="ab-hint">Chaque appareil s’abonne à ces sujets : envoie un message au sujet « all » pour toucher tous tes utilisateurs, sans gérer les jetons.</small>
        <div class="ab-isolate">${icon('shield', 14)}<div><b>Environnement isolé de cette application</b><small>Les sujets sont propres à l’application : chez Firebase, « all » devient <code>${esc(pfx)}all</code>${topics.length > 1 ? `, « ${esc(topics[1])} » devient <code>${esc(pfx + topics[1])}</code>` : ''}. Les autres applications construites avec NEXORA — même dans le même projet Firebase — ne reçoivent jamais ces envois. Les messages de test portent aussi le nom du paquet (<code>${esc(c.appId || '—')}</code>) et la clé du compte de service est enregistrée pour cette application seulement.</small></div></div>
        ${this.field('Adresse d’enregistrement des appareils (facultatif)', 'push.registerUrl', { placeholder: 'https://mon-site.com/api/appareils' })}
        <small class="ab-hint">L’application y envoie en POST <code>{ token, platform, package, app, model, sdk, locale }</code> à chaque nouveau jeton : ton serveur peut ainsi viser un utilisateur précis.</small>`)
      + this.card('Envoyer un test', `<p class="ab-hint">Pour envoyer depuis NEXORA, importe la <b>clé du compte de service</b> du projet (console Firebase › Paramètres du projet › Comptes de service › <b>Générer une nouvelle clé privée</b>). Elle est chiffrée sur ce PC et sert uniquement à appeler l’API de Firebase.</p>
        <div class="ab-row">${st.serviceAccount ? `<span class="ab-okchip">${icon('check', 12)} Clé enregistrée</span><button class="btn small" data-act="push-sa-clear">${icon('trash', 13)}<span>Retirer</span></button>` : `<button class="btn small" data-act="push-sa">${icon('key', 13)}<span>Importer la clé du compte de service</span></button>`}</div>
        <div class="ab-grid2">${this.field('Titre', 'push.test.title')}${this.field('Lien à ouvrir (facultatif)', 'push.test.url', { placeholder: '/promo' })}</div>
        ${this.field('Texte', 'push.test.body', { type: 'textarea', rows: 2 })}
        ${this.field('Image (adresse https, facultatif)', 'push.test.image', { placeholder: 'https://…/visuel.jpg' })}
        <div class="ab-grid2">${this.field('Destinataires', 'push.test.target', { type: 'select', options: { topic: 'Les appareils abonnés à un sujet', token: 'Un appareil (jeton)' } })}${p.test.target !== 'token' ? this.field('Sujet', 'push.test.topic', { type: 'select', options: Object.fromEntries(topics.map((t) => [t, `${t} (${pfx}${t})`])) }) : ''}${p.test.target === 'token' ? this.field('Jeton de l’appareil', 'push.test.token', { placeholder: 'Affiché par NexoraApp.push.getToken()' }) : ''}</div>
        <div class="ab-row"><button class="btn primary small" data-act="push-send" ${st.serviceAccount ? '' : 'disabled'}>${icon('bell', 13)}<span>Envoyer la notification</span></button><span class="ab-hint" data-push-msg></span></div>`)
      + this.card('Comment ça marche', `<details class="ab-doc" open><summary>Fonctionnement</summary><p>Ton serveur (ou la console Firebase, ou NEXORA) envoie un message à Firebase Cloud Messaging, qui le transmet aux téléphones Android via les services Google Play. Application fermée, Android affiche la notification ; un appui ouvre l’application sur le lien indiqué (donnée <code>url</code>). Application ouverte, la notification s’affiche aussi et la page reçoit l’événement <code>vitrinepush</code>.</p></details>
        <details class="ab-doc"><summary>Dans la page (JavaScript)</summary><pre class="ab-pre">${esc(`if (window.NexoraApp) {
  const jeton = await NexoraApp.push.getToken();   // à envoyer à ton serveur
  await NexoraApp.push.requestPermission();        // Android 13+
  await NexoraApp.push.subscribe('promos');        // sujet
  NexoraApp.push.onMessage((m) => console.log(m.title, m.body, m.data));
}`)}</pre></details>
        <details class="ab-doc"><summary>Envoyer depuis ton serveur</summary><p>API FCM HTTP v1 : <code>POST https://fcm.googleapis.com/v1/projects/${esc(pr ? pr.id : 'ID_DU_PROJET')}/messages:send</code> avec un jeton OAuth du compte de service, et le corps :</p><pre class="ab-pre">${esc(`{ "message": {
  "topic": "${pfx}all",
  "notification": { "title": "Nouveautés", "body": "Découvre nos offres" },
  "data": { "url": "/promo", "vt_app": "${c.appId || 'com.exemple.app'}" },
  "android": { "restricted_package_name": "${c.appId || 'com.exemple.app'}", "notification": { "channel_id": "vt_default" } }
} }`)}</pre><p class="ab-hint">Toujours le sujet préfixé <code>${esc(pfx)}</code> : un sujet sans préfixe n’atteint aucun appareil de cette application. Dans la page, <code>NexoraApp.push.subscribe('promos')</code> ajoute le préfixe tout seul, et <code>NexoraApp.push.state()</code> renvoie <code>topicPrefix</code>.</p></details>
        <details class="ab-doc"><summary>Vérifier</summary><ol><li>Construis l’APK et installe-le sur un téléphone (section Signature et fichiers).</li><li>Ouvre l’application une fois et accepte les notifications.</li><li>Envoie un test au sujet « all » (ci-dessus) ou depuis la console Firebase › Messaging.</li><li>Ferme l’application et renvoie un test : la notification doit apparaître et ouvrir le lien.</li></ol></details>
        <details class="ab-doc"><summary>Limites à connaître</summary><ul><li>Il faut un compte Google et un projet Firebase (gratuit) ; NEXORA ne peut pas les créer à ta place.</li><li>La clé du compte de service donne le droit d’envoyer des notifications : ne la partage pas et ne la mets jamais dans le site ou l’application.</li><li>Les téléphones sans services Google Play (certains Huawei récents) ne reçoivent pas les notifications Firebase.</li><li>iPhone : l’App Builder construit des applications Android. Sur iPhone, une PWA installée peut recevoir des notifications web (iOS 16.4+) ; une application iOS native demande un compte Apple Developer et les certificats APNs.</li><li>Android peut retarder les notifications quand le téléphone économise la batterie ; les messages « priorité haute » sont envoyés tout de suite.</li><li>Le mode Trusted Web Activity utilise les notifications web du site, pas Firebase.</li></ul></details>`) : '');
  }

  async act_push_gs() {
    const f = await api.invoke('dialog:open-file', { title: 'Fichier google-services.json du projet Firebase', filters: [{ name: 'google-services.json', extensions: ['json'] }], asText: true });
    if (!f) return;
    const text = f.text != null ? f.text : (f.dataUrl ? atob(f.dataUrl.split(',')[1]) : '');
    const r = await api.invoke('android:push-parse', { text, appId: this.cfg.appId });
    if (!r.ok && !r.projectId) { toast(r.error, { kind: 'bad' }); return; }
    this.cfg.push.googleServices = text;
    let pkgs = r.packages || [];
    this.cfg.push.project = { id: r.projectId, sender: r.senderId || '', app: r.ok ? this.cfg.appId : (pkgs[0] || '') };
    this.save();
    this.renderForm();
    toast(r.ok ? `Projet Firebase « ${r.projectId} » relié à l’application.` : r.error, r.ok ? {} : { kind: 'bad' });
  }

  act_push_gs_clear() { this.cfg.push.googleServices = ''; this.cfg.push.project = null; this.save(); this.renderForm(); }

  async act_push_kit(btn) {
    if (btn) btn.disabled = true;
    const t = toast('Préparation du kit de notifications…', { busy: true, sticky: true });
    const off = api.on('android:progress', (p) => { if (p.part === 'push') t.update(`${p.label} · ${Math.round((p.progress || 0) * 100)} %`); });
    try {
      await api.invoke('android:push-install');
      this.pushKitErr = null;
      this.pushSt = await api.invoke('android:push-status', this.cfg.appId);
      toast('Kit de notifications prêt.');
    } catch (e) {
      this.pushKitErr = e.message;
      // Accès refusé à l'emplacement : on propose tout de suite d'en choisir un autre.
      if (/emplacement|Windows a bloqué|EPERM|accès refusé/i.test(e.message)) {
        toast('Accès refusé à l’emplacement du kit.', { kind: 'bad', action: 'Choisir un dossier', onAction: () => this.act_push_kit_dir() });
      } else toast(e.message, { kind: 'bad' });
    } finally { if (off) off(); t.close(); this.renderForm(); }
  }

  async act_push_kit_dir() {
    try {
      const r = await api.invoke('android:push-kit-dir-pick');
      if (!r) return;
      this.pushKitErr = null;
      this.pushSt = await api.invoke('android:push-status', this.cfg.appId);
      toast(`Le kit sera installé dans ${r.dir}.`, r.installed ? {} : { action: 'Préparer maintenant', onAction: () => this.act_push_kit() });
    } catch (e) { toast(e.message, { kind: 'bad' }); } finally { this.renderForm(); }
  }

  async act_push_kit_dir_reset() {
    this.pushSt = await api.invoke('android:push-kit-dir-reset');
    this.pushSt = await api.invoke('android:push-status', this.cfg.appId);
    this.pushKitErr = null;
    this.renderForm();
    toast('Emplacement par défaut rétabli.');
  }

  async act_push_sa() {
    const f = await api.invoke('dialog:open-file', { title: 'Clé du compte de service (fichier .json)', filters: [{ name: 'Clé JSON', extensions: ['json'] }], asText: true });
    if (!f) return;
    const text = f.text != null ? f.text : (f.dataUrl ? atob(f.dataUrl.split(',')[1]) : '');
    const r = await api.invoke('android:push-sa-save', { appId: this.cfg.appId, text });
    if (!r.ok) { toast(r.error, { kind: 'bad' }); return; }
    if (this.cfg.push.project && r.projectId !== this.cfg.push.project.id) toast(`Attention : cette clé est pour le projet « ${r.projectId} », le fichier google-services.json pour « ${this.cfg.push.project.id} ».`, { kind: 'bad' });
    else toast('Clé du compte de service enregistrée (chiffrée).');
    this.pushSt = await api.invoke('android:push-status', this.cfg.appId);
    this.renderForm();
  }

  async act_push_sa_clear() { await api.invoke('android:push-sa-remove', this.cfg.appId); this.pushSt = await api.invoke('android:push-status', this.cfg.appId); this.renderForm(); }

  async act_push_send(btn) {
    const t = this.cfg.push.test;
    const msg = $('[data-push-msg]', this.el);
    btn.disabled = true;
    if (msg) msg.textContent = 'Envoi…';
    const url = t.url && t.url.startsWith('/') && this.cfg.source.url ? new URL(t.url, this.cfg.source.url).href : t.url;
    const r = await api.invoke('android:push-test', {
      appId: this.cfg.appId, title: t.title, body: t.body, url, image: t.image, topic: t.target === 'token' ? undefined : (t.topic || (this.cfg.push.topics || ['all'])[0] || 'all'), token: t.target === 'token' ? t.token : undefined,
    });
    btn.disabled = false;
    if (msg) msg.textContent = r.ok ? `Envoyée ✓ ${r.topic ? `au sujet ${r.topic}` : 'à l’appareil'} (${r.name ? r.name.split('/').pop() : 'ok'})` : r.error;
    if (msg) msg.classList.toggle('ab-err', !r.ok);
  }

  // ------------------------------------------------------------------ centre de notifications
  form_notifs(c) {
    if (!c.push.enabled) return this.card('Centre de notifications', `<p class="ab-hint">Active d’abord les notifications push (section précédente) : ce centre sert ensuite à envoyer, programmer et suivre tes notifications, pour cette application seulement.</p><button class="btn small primary" data-sec="push">${icon('bell', 13)}<span>Aller aux notifications push</span></button>`);
    const h = this.notifHist || { sent: [], scheduled: [] };
    if (!this.notifHist && !this.notifLoading) { this.notifLoading = true; api.invoke('android:notif-list', c.appId).then((r) => { this.notifHist = r; this.notifLoading = false; if (this.section === 'notifs') this.renderForm(); }).catch(() => { this.notifLoading = false; }); }
    const topics = (c.push.topics && c.push.topics.length ? c.push.topics : ['all']);
    const d = (t) => new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    const n = c.notifDraft || (c.notifDraft = { title: '', body: '', url: '', image: '', topic: topics[0], when: '' });
    const tpl = c.notifTemplates || [];
    return this.card('Nouvelle notification', `
        <div class="ab-grid2">${this.field('Titre', 'notifDraft.title', { placeholder: 'Nouvelle promo 🎉' })}${this.field('Sujet (destinataires)', 'notifDraft.topic', { type: 'select', options: Object.fromEntries(topics.map((t) => [t, t === 'all' ? 'Tous les utilisateurs' : t])) })}</div>
        ${this.field('Message', 'notifDraft.body', { type: 'textarea', rows: 2, placeholder: '-20 % sur tout le catalogue jusqu’à dimanche.' })}
        <div class="ab-grid2">${this.field('Page à ouvrir (facultatif)', 'notifDraft.url', { placeholder: '/promo' })}${this.field('Image (adresse https, facultatif)', 'notifDraft.image', { placeholder: 'https://…/visuel.jpg' })}</div>
        <div class="ab-grid2">${this.field('Programmer (facultatif)', 'notifDraft.when', { type: 'datetime-local' })}<div></div></div>
        <div class="ab-row"><button class="btn primary small" data-act="notif-send">${icon(n.when ? 'clock' : 'bell', 13)}<span>${n.when ? 'Programmer l’envoi' : 'Envoyer maintenant'}</span></button><button class="btn small" data-act="notif-tpl-save">${icon('star', 13)}<span>Enregistrer comme modèle</span></button><span class="ab-hint" data-notif-msg></span></div>
        <p class="ab-hint">Les envois programmés partent à l’heure prévue <b>tant que NEXORA est ouverte</b> sur ce PC.</p>`)
      + (tpl.length ? this.card('Modèles', `<div class="ab-notif-list">${tpl.map((t, i) => `<div class="ab-notif"><span>${icon('star', 14)}</span><div><b>${esc(t.title)}</b><small>${esc(t.body)}</small></div><button class="btn small" data-act="notif-tpl-use" data-i="${i}">Utiliser</button><button class="icon-btn small" data-act="notif-tpl-del" data-i="${i}">${icon('trash', 12)}</button></div>`).join('')}</div>`) : '')
      + this.card(`Programmées (${h.scheduled.length})`, h.scheduled.length ? `<div class="ab-notif-list">${h.scheduled.map((x) => `<div class="ab-notif"><span>${icon('clock', 14)}</span><div><b>${esc(x.msg.title)}</b><small>${d(x.at)} · ${esc(x.msg.topic || 'all')}</small></div><button class="btn small" data-act="notif-cancel" data-id="${esc(x.id)}">Annuler</button></div>`).join('')}</div>` : '<p class="ab-hint">Aucun envoi programmé.</p>')
      + this.card(`Historique (${h.sent.length})`, h.sent.length ? `<div class="ab-notif-list">${h.sent.slice(0, 40).map((x) => `<div class="ab-notif ${x.ok ? '' : 'bad'}"><span>${icon(x.ok ? 'pass' : 'warn', 14)}</span><div><b>${esc(x.title || '')}</b><small>${d(x.at)} · ${esc(x.topic ? x.topic.split('__').pop() : x.token ? 'un appareil' : 'all')}${x.ok ? '' : ` · ${esc(x.error || 'échec')}`}</small></div></div>`).join('')}</div>` : '<p class="ab-hint">Les notifications envoyées depuis NEXORA apparaîtront ici.</p>');
  }

  async act_notif_send() {
    const c = this.cfg; const n = c.notifDraft || {};
    const msgEl = $('[data-notif-msg]', this.el);
    if (!n.title) throw new Error('Donne un titre à la notification.');
    const url = n.url && n.url.startsWith('/') && c.source.url ? new URL(n.url, c.source.url).href : n.url;
    const msg = { title: n.title, body: n.body, url, image: n.image, topic: n.topic || 'all' };
    if (n.when) {
      const at = new Date(n.when).getTime();
      if (!(at > Date.now())) throw new Error('Choisis une date et une heure à venir.');
      this.notifHist = await api.invoke('android:notif-schedule', { appId: c.appId, msg, at });
      toast(`Notification programmée le ${new Date(at).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}.`);
    } else {
      if (msgEl) msgEl.textContent = 'Envoi…';
      const r = await api.invoke('android:push-test', { appId: c.appId, ...msg });
      if (!r.ok) throw new Error(r.error);
      toast('Notification envoyée.');
      this.notifHist = await api.invoke('android:notif-list', c.appId);
    }
    c.notifDraft = { ...n, title: '', body: '', when: '' };
    this.save(); this.renderForm();
  }

  act_notif_tpl_save() { const c = this.cfg; const n = c.notifDraft || {}; if (!n.title) throw new Error('Écris au moins un titre.'); c.notifTemplates = [...(c.notifTemplates || []), { title: n.title, body: n.body, url: n.url, image: n.image }]; this.save(); this.renderForm(); toast('Modèle enregistré.'); }
  act_notif_tpl_use(btn) { const c = this.cfg; const t = c.notifTemplates[Number(btn.dataset.i)]; c.notifDraft = { ...(c.notifDraft || {}), ...t }; this.save(); this.renderForm(); }
  act_notif_tpl_del(btn) { this.cfg.notifTemplates.splice(Number(btn.dataset.i), 1); this.save(); this.renderForm(); }
  async act_notif_cancel(btn) { this.notifHist = await api.invoke('android:notif-cancel', { appId: this.cfg.appId, id: btn.dataset.id }); this.renderForm(); toast('Envoi programmé annulé.'); }

  // ------------------------------------------------------------------ réglages à distance
  remoteJson() {
    const r = this.cfg.remote;
    const o = {};
    if (r.announcement.enabled) o.announcement = { id: r.announcement.id || '1', title: r.announcement.title, text: r.announcement.text, button: r.announcement.button || 'OK', url: r.announcement.url || '', frequency: r.announcement.frequency || 'once' };
    if (r.maintenance.enabled) o.maintenance = { enabled: true, title: r.maintenance.title, text: r.maintenance.text };
    if (Number(r.minVersionCode) > 0) { o.minVersionCode = Number(r.minVersionCode); o.forceUpdate = Boolean(r.forceUpdate); if (r.updateText) o.updateText = r.updateText; }
    if (r.startUrl) o.startUrl = r.startUrl;
    return JSON.stringify(o, null, 2);
  }

  form_remote(c) {
    const r = c.remote;
    const host = (() => { try { return new URL(c.source.url || c.source.publicUrl).origin; } catch { return 'https://monsite.com'; } })();
    return this.card('Réglages à distance', `<p class="ab-hint">Change certaines choses de ton application <b>sans la reconstruire ni la republier</b> : une annonce, une page de maintenance, une mise à jour obligatoire. L’application lit un petit fichier que tu publies sur ton site, à chaque ouverture.</p>
        <ol class="ab-psteps">
          <li class="ab-pstep ${r.enabled ? 'ok' : ''}"><i>${r.enabled ? icon('check', 12) : 1}</i><div><b>Activer</b>${this.tog('Lire les réglages à distance', 'remote.enabled', 'À activer avant de construire l’application (une seule fois).')}</div></li>
          <li class="ab-pstep ${/^https:/.test(r.url) ? 'ok' : ''}"><i>${/^https:/.test(r.url) ? icon('check', 12) : 2}</i><div><b>Adresse du fichier</b>${this.field('Adresse https du fichier', 'remote.url', { placeholder: `${host}/vitrine-app.json` })}</div></li>
          <li class="ab-pstep"><i>3</i><div><b>Publier le fichier</b><p>Enregistre le fichier ci-dessous et place-le à cette adresse sur ton site. À chaque changement, remplace-le : les utilisateurs le voient à la prochaine ouverture.</p></div></li>
        </ol>`)
      + this.card('Annonce', `${this.tog('Afficher une annonce', 'remote.announcement.enabled')}
        ${r.announcement.enabled ? `${this.field('Titre', 'remote.announcement.title', { placeholder: 'Nouveauté' })}${this.field('Texte', 'remote.announcement.text', { type: 'textarea', rows: 2 })}<div class="ab-grid2">${this.field('Bouton', 'remote.announcement.button', { placeholder: 'OK' })}${this.field('Lien du bouton (facultatif)', 'remote.announcement.url', { placeholder: '/promo' })}</div><div class="ab-grid2">${this.field('Fréquence', 'remote.announcement.frequency', { type: 'select', options: { once: 'Une seule fois', always: 'À chaque ouverture' } })}${this.field('Numéro de l’annonce', 'remote.announcement.id', { hint: 'Change-le pour réafficher une annonce « une seule fois ».' })}</div>` : ''}`)
      + this.card('Maintenance', `${this.tog('Mode maintenance', 'remote.maintenance.enabled', 'L’application affiche ce message à la place du site.')}${r.maintenance.enabled ? `${this.field('Titre', 'remote.maintenance.title')}${this.field('Message', 'remote.maintenance.text', { type: 'textarea', rows: 2 })}` : ''}`)
      + this.card('Mise à jour', `${this.field('Version minimale (numéro de version)', 'remote.minVersionCode', { type: 'number', min: 0, hint: `Version actuelle de cette application : ${c.versionCode}. Les versions plus anciennes proposent la mise à jour.` })}${this.tog('Mise à jour obligatoire', 'remote.forceUpdate', 'Sans mise à jour, l’application se ferme.')}${this.field('Message', 'remote.updateText', { placeholder: 'Une nouvelle version est disponible.' })}`)
      + this.card('Fichier à publier', `<pre class="ab-pre">${esc(this.remoteJson())}</pre><div class="ab-row"><button class="btn small primary" data-act="remote-save">${icon('download', 13)}<span>Enregistrer le fichier…</span></button><button class="btn small" data-copy="${esc(this.remoteJson())}">${icon('copy', 13)}<span>Copier</span></button>${/^https:/.test(r.url) ? `<button class="btn small" data-act="remote-check">${icon('pass', 13)}<span>Vérifier en ligne</span></button>` : ''}<span class="ab-hint" data-remote-msg></span></div>`);
  }

  async act_remote_save() {
    const f = await api.invoke('lab:save-text', { name: 'nexora-app.json', text: this.remoteJson(), filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (f) toast('Fichier enregistré : publie-le sur ton site à l’adresse indiquée.', { action: 'Afficher', onAction: () => api.invoke('lab:reveal', f) });
  }

  async act_remote_check() {
    const el = $('[data-remote-msg]', this.el);
    const r = await api.invoke('url:check', this.cfg.remote.url).catch((e) => ({ ok: false, error: e.message }));
    if (el) el.textContent = r && (r.ok || r.status === 200) ? 'Fichier trouvé en ligne ✓' : 'Fichier introuvable à cette adresse.';
  }

  // ------------------------------------------------------------------ publication Play Store
  form_store(c) {
    const st = this.playSt || {};
    if (!this.playSt && !this.playLoading) { this.playLoading = true; api.invoke('android:play-status', c.appId).then((r) => { this.playSt = r; this.playLoading = false; if (this.section === 'store') this.renderForm(); }).catch(() => { this.playLoading = false; }); }
    const aab = this.result && this.result.aab;
    const step = (ok, n, title, body) => `<li class="ab-pstep ${ok ? 'ok' : ''}"><i>${ok ? icon('check', 12) : n}</i><div><b>${title}</b>${body}</div></li>`;
    return this.card('Publier sur Google Play', `<ol class="ab-psteps">
        ${step(Boolean(this.playChecked), 1, 'Créer l’application dans la Play Console (une seule fois)', `<p>Compte développeur Google Play (25 $ une fois). <b>Créer une application</b>, puis envoie le <b>tout premier</b> AAB à la main (Tests › Test interne) : Google l’exige. Ensuite, NEXORA publie les versions suivantes.</p><button class="btn small" data-external="https://play.google.com/console">${icon('external', 13)}<span>Ouvrir la Play Console</span></button>`)}
        ${step(Boolean(st.serviceAccount), 2, 'Clé d’accès pour NEXORA', `<p>Google Cloud › <b>IAM › Comptes de service › Créer</b>, puis <b>Clés › Ajouter une clé › JSON</b>. Dans la Play Console : <b>Utilisateurs et autorisations › Inviter</b> l’adresse du compte de service, avec le droit de <b>publier sur les pistes</b>.</p><div class="ab-row">${st.serviceAccount ? `<span class="ab-okchip">${icon('check', 12)} Clé enregistrée (chiffrée)</span><button class="btn small" data-act="play-sa-clear">${icon('trash', 13)}<span>Retirer</span></button><button class="btn small" data-act="play-check">${icon('pass', 13)}<span>Vérifier l’accès</span></button>` : `<button class="btn small primary" data-act="play-sa">${icon('key', 13)}<span>Importer la clé (JSON)</span></button>`}<button class="btn small" data-external="https://console.cloud.google.com/iam-admin/serviceaccounts">${icon('external', 13)}<span>Google Cloud</span></button></div>${this.playChecked ? `<p class="ab-hint">Accès vérifié. Pistes : ${esc(this.playChecked.tracks.map((t) => t.track).join(', ') || 'aucune version encore')}.</p>` : ''}`)}
        ${step(Boolean(aab), 3, 'Fichier AAB', `<p>${aab ? `Prêt : version ${esc(this.result.versionName)} (n° ${this.result.versionCode}).` : 'Coche « AAB Play Store » en bas à droite, puis <b>Construire</b>. Chaque nouvel envoi demande un <b>numéro de version</b> plus grand (section Identité).'}</p>`)}
        ${step(false, 4, 'Choisir la piste et publier', `<div class="ab-grid2">${this.field('Piste', 'store.track', { type: 'select', options: { internal: 'Test interne (jusqu’à 100 testeurs)', alpha: 'Test fermé', beta: 'Test ouvert', production: 'Production (tout le monde)' } })}${this.field('Déploiement progressif (%)', 'store.rollout', { type: 'number', min: 1, max: 100, hint: 'Production : commence par 10 % puis augmente.' })}</div>${this.field('Nouveautés de cette version', 'store.notes', { type: 'textarea', rows: 3, placeholder: '• Commande plus rapide\n• Corrections' })}<div class="ab-row"><button class="btn primary small" data-act="play-publish" ${st.serviceAccount && aab ? '' : 'disabled'}>${icon('rocket', 13)}<span>Envoyer sur Google Play</span></button></div><p class="ab-hint">Google vérifie ensuite la version (de quelques minutes à quelques jours en production).</p>`)}
      </ol>`);
  }

  async act_play_sa() {
    const f = await api.invoke('dialog:open-file', { title: 'Clé du compte de service Google Play (JSON)', filters: [{ name: 'Clé JSON', extensions: ['json'] }], asText: true });
    if (!f || !f.text) return;
    const r = await api.invoke('android:play-sa-save', { appId: this.cfg.appId, text: f.text });
    if (!r.ok) throw new Error(r.error);
    this.playSt = null; this.playChecked = null; this.renderForm(); toast('Clé enregistrée et chiffrée sur ce PC.');
  }
  async act_play_sa_clear() { await api.invoke('android:play-sa-remove', this.cfg.appId); this.playSt = null; this.playChecked = null; this.renderForm(); }
  async act_play_check() { const t = toast('Vérification de l’accès à Google Play…', { busy: true, sticky: true }); try { this.playChecked = await api.invoke('android:play-check', { appId: this.cfg.appId }); toast('Accès à Google Play vérifié.'); this.renderForm(); } finally { t.close(); } }
  async act_play_publish() {
    const s = this.cfg.store;
    const t = toast('Envoi sur Google Play…', { busy: true, sticky: true });
    try {
      const r = await api.invoke('android:play-publish', { appId: this.cfg.appId, aab: this.result.aab, track: s.track, notes: s.notes, rollout: s.track === 'production' && Number(s.rollout) < 100 ? Number(s.rollout) / 100 : undefined });
      toast(`Version n° ${r.versionCode} envoyée sur la piste « ${{ internal: 'test interne', alpha: 'test fermé', beta: 'test ouvert', production: 'production' }[r.track] || r.track} ».`);
      this.cfg.lastStore = { at: Date.now(), track: r.track, versionCode: r.versionCode }; this.save();
    } finally { t.close(); }
  }

  form_screens(c) {
    const slides = c.config.onboarding.slides.map((s, i) => `
      <div class="ab-slide">
        <button class="ab-slide-img" data-act="pick-slide" data-i="${i}">${s.image ? `<img src="${s.image}" alt="">` : icon('image', 20)}</button>
        <div class="ab-slide-text"><input class="input" data-k="config.onboarding.slides.${i}.title" value="${esc(s.title)}" placeholder="Titre"><textarea class="input" rows="2" data-k="config.onboarding.slides.${i}.text" placeholder="Texte">${esc(s.text)}</textarea></div>
        <button class="icon-btn" data-list-del="config.onboarding.slides" data-i="${i}">${icon('close', 13)}</button>
      </div>`).join('');
    return this.card('Écrans d’accueil', `${this.tog('Présentation au premier lancement', 'config.onboarding.enabled', 'Diapositives avec image, titre et texte, puis l’application.')}
        ${c.config.onboarding.enabled ? `${slides}${c.config.onboarding.slides.length < 6 ? `<button class="btn small" data-list-add="config.onboarding.slides">${icon('plus', 14)}<span>Ajouter une diapositive</span></button>` : ''}
        <div class="ab-grid3">${this.field('Bouton final', 'config.onboarding.button')}${this.field('Suivant', 'config.onboarding.next')}${this.field('Passer', 'config.onboarding.skip')}</div>` : ''}`)
      + this.card('Annonce au démarrage', `${this.tog('Fenêtre d’annonce', 'config.modal.enabled', 'Promotion, nouveauté, information importante.')}
        ${c.config.modal.enabled ? `${this.field('Titre', 'config.modal.title')}${this.field('Texte', 'config.modal.text', { type: 'textarea', rows: 3 })}
        <div class="ab-grid2">${this.field('Bouton', 'config.modal.button')}${this.field('Lien du bouton', 'config.modal.url', { placeholder: '/promo' })}</div>
        ${this.field('Fréquence', 'config.modal.frequency', { type: 'select', options: { once: 'Une seule fois', launch: 'À chaque lancement' } })}
        <div class="ab-row"><button class="btn small" data-act="pick-modal">${icon('image', 14)}<span>${c.config.modal.image ? 'Changer l’image' : 'Image (facultatif)'}</span></button>${c.config.modal.image ? `<button class="btn small" data-act="clear-modal">${icon('trash', 14)}</button>` : ''}</div>
        <small class="ab-hint">Change le numéro pour afficher à nouveau une annonce « une seule fois ».</small>${this.field('Numéro de l’annonce', 'config.modal.id')}` : ''}`)
      + this.card('Hors connexion', `${this.tog('Page hors connexion', 'config.offlinePage', 'Remplace la page d’erreur de Chrome ; nouvel essai automatique au retour du réseau.')}
        ${c.config.offlinePage ? `${this.field('Titre', 'config.offlineTitle')}${this.field('Texte', 'config.offlineText')}${this.field('Bouton', 'config.offlineButton')}` : ''}`)
      + this.card('Code de verrouillage', `${this.tog('Code à 4 chiffres', 'config.passcode.enabled', 'Demandé à l’ouverture et au retour dans l’application ; déverrouillage par empreinte possible.')}
        ${c.config.passcode.enabled ? `${this.tog('Obligatoire dès le premier lancement', 'config.passcode.required', 'Sinon, la page l’active avec setPasscode().')}${this.field('Verrouiller après (secondes en arrière-plan)', 'config.passcode.timeout', { type: 'number', min: 0, max: 3600 })}` : ''}`);
  }

  form_advanced() {
    return this.card('Injection', `
      ${this.field('CSS ajouté à chaque page', 'config.injectCss', { type: 'textarea', placeholder: '.bandeau-app, .cookie-banner { display: none !important; }', hint: 'Masque par exemple le bandeau « Télécharger l’application » du site.' })}
      ${this.field('JavaScript exécuté à chaque page', 'config.injectJs', { type: 'textarea', placeholder: "document.body.classList.add('in-app');" })}
      ${this.field('Ajout au User-Agent', 'config.uaSuffix', { placeholder: 'MonAppAndroid', hint: 'Le site peut détecter l’application (NexoraApp/1.0 est toujours ajouté).' })}`)
      + this.card('Cache et réseau', this.field('Cache', 'config.cache', { type: 'select', options: { default: 'Normal (règles du site)', 'offline-first': 'Cache d’abord (plus rapide, moins frais)', network: 'Toujours le réseau' } }))
      + this.card('Sécurité', `
        ${this.tog('Interdire les captures d’écran', 'config.secure', 'Écran noir dans les captures et l’aperçu des applications récentes.')}
        ${this.tog('Garder l’écran allumé', 'config.keepAwake')}
        ${this.tog('Débogage (chrome://inspect)', 'config.debug', 'Inspecter l’application depuis Chrome sur l’ordinateur. À désactiver pour la publication.')}`);
  }

  form_publish(c) {
    const k = this.key;
    return this.card('Clé de signature', k ? `
        <div class="ab-key"><b>${icon('key', 15)} ${esc(k.alias)}</b>${k.imported ? '<span class="pill">importée</span>' : ''}<small>${esc(k.file)}</small>
        <div class="ab-fp"><span>SHA-256</span><code>${esc(k.sha256 || '—')}</code><button class="icon-btn" data-copy="${esc(k.sha256 || '')}">${icon('copy', 13)}</button></div>
        <div class="ab-fp"><span>SHA-1</span><code>${esc(k.sha1 || '—')}</code><button class="icon-btn" data-copy="${esc(k.sha1 || '')}">${icon('copy', 13)}</button></div></div>
        <div class="ab-row"><button class="btn small" data-act="key-export">${icon('upload', 14)}<span>Exporter (sauvegarde)</span></button></div>
        <p class="ab-hint">Sauvegarde ce fichier : sans lui, aucune mise à jour de l’application ne pourra être publiée.</p>`
      : `<p class="ab-hint">${RX_APPID.test(c.appId || '') ? 'Une clé sera créée à la première construction (valable 30 ans, comme l’exige le Play Store), protégée sur ce PC. Pense à la sauvegarder : sans elle, impossible de publier une mise à jour.' : 'Indique d’abord un identifiant d’application valide (section Identité).'}</p>
        <div class="ab-row"><button class="btn small" data-act="key-create" ${RX_APPID.test(c.appId || '') ? '' : 'disabled'}>${icon('key', 14)}<span>Créer maintenant</span></button>
        <button class="btn small" data-act="key-import-open" ${RX_APPID.test(c.appId || '') ? '' : 'disabled'}>${icon('download', 14)}<span>Importer une clé existante</span></button></div>
        <div class="ab-import" hidden>
          <div class="ab-pick"><div><b class="ab-import-file">Aucun fichier</b><small>.jks, .keystore, .p12</small></div><button class="btn small" data-act="key-import-pick">Choisir…</button></div>
          <div class="ab-grid2"><label class="field"><span>Alias</span><input class="input" data-imp="alias" placeholder="upload"></label><label class="field"><span>Mot de passe du fichier</span><input class="input" type="password" data-imp="storePass"></label><label class="field"><span>Mot de passe de la clé (si différent)</span><input class="input" type="password" data-imp="keyPass"></label></div>
          <button class="btn primary small" data-act="key-import">Importer</button>
        </div>`)
      + this.card('Fichiers produits', `
        ${this.tog('APK', 'outputs.apk', 'À installer directement ou à partager.')}
        ${this.tog('AAB (Play Store)', 'outputs.aab', 'Format exigé par Google Play pour publier l’application.')}
        <div class="ab-pick"><div><b>${esc(c.outDir || 'Documents/NEXORA/Applications')}</b><small>Dossier d’enregistrement</small></div><button class="btn small" data-act="pick-out">Changer…</button></div>`)
      + this.card('Installer sur un téléphone', `<p class="ab-hint">Branche le téléphone en USB avec le débogage USB activé (Options pour les développeurs).</p>
        <div class="ab-devices"></div><button class="btn small" data-act="devices">${icon('usb', 14)}<span>Rechercher les appareils</span></button>`);
  }

  // ------------------------------------------------------------------ événements
  set(k, v, { rerender = false } = {}) {
    setPath(this.cfg, k, v);
    if (k === 'appName') this.renderApps();
    if (k.startsWith('outputs')) this.syncBuildBar();
    this.save();
    if (rerender) this.renderForm();
    if (k.startsWith('icon') || k.startsWith('splash') || k === 'appName' || k === 'tv') this.updateIconPreviews();
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.renderPreview(k), 120);
  }

  onInput(e, committed = false) {
    const t = e.target;
    if (t.dataset.appPick !== undefined && committed) {
      settings.android.current = t.value;
      this.save();
      this.render();
      this.renderPreview();
      this.refreshKey();
      return;
    }
    if (t.dataset.actCheck === 'license') { $('[data-act="install"]', this.el).disabled = !t.checked; return; }
    if (t.dataset.perm) {
      const set = new Set(this.cfg.permissions);
      if (t.checked) set.add(t.dataset.perm); else set.delete(t.dataset.perm);
      this.set('permissions', [...set]);
      return;
    }
    if (t.dataset.toggle && t.dataset.toggle.startsWith('k:')) {
      this.set(t.dataset.toggle.slice(2), t.checked, { rerender: committed });
      return;
    }
    const k = t.dataset.k;
    if (!k) return;
    let v = t.type === 'checkbox' ? t.checked : t.value;
    if (t.type === 'number' || t.type === 'range') v = Number(v);
    if (t.type === 'color') {
      const twin = $$(`[data-k="${k}"]`, this.el).find((x) => x !== t);
      if (twin) twin.value = v;
    }
    if (k === 'appId') {
      v = String(v).trim();
      const hint = t.closest('.field') && $('.ab-hint', t.closest('.field'));
      if (hint) hint.classList.toggle('bad', Boolean(v) && !RX_APPID.test(v));
    }
    const struct = t.tagName === 'SELECT' || t.type === 'checkbox' || t.type === 'range' || t.type === 'radio';
    this.set(k, v, { rerender: committed && struct && !k.includes('.action') && t.type !== 'range' });
    if (k === 'appId' && committed) this.refreshKey();
    if (t.type === 'range' && k === 'icon.scale') {
      const lab = t.closest('.field').firstElementChild;
      lab.textContent = `Taille du logo · ${Math.round(v * 100)} %`;
    }
    if (committed && k === 'config.fab.action') this.renderForm();
    if (committed && k === 'orientation') this.orientationChanged();
  }

  // Orientation choisie : le moteur navigateur (TWA / manifest du site) suit, et l'aperçu pivote.
  orientationChanged() {
    const o = this.cfg.orientation;
    this.set('twa.orientation', { portrait: 'portrait', landscape: 'landscape', sensor: 'any', unspecified: 'default' }[o] || 'default', { rerender: false });
    if (o !== 'portrait' && o !== 'landscape' && this.cfg.orientFlip) this.set('orientFlip', false, { rerender: false });
    this.renderDevRow();
    this.layoutPhone(true);
    this.renderPreview();
  }

  // Aperçu en paysage : imposé par un verrouillage paysage, sinon au choix (bouton de rotation).
  previewLand() {
    const o = this.cfg.orientation;
    if (o === 'landscape') return true;
    if (o === 'portrait') return false;
    return Boolean(this.prevLandUser);
  }

  async onClick(e) {
    const sec = e.target.closest('[data-sec]');
    if (sec) {
      this.section = sec.dataset.sec;
      settings.android.section = this.section;
      this.save();
      this.renderNav();
      this.renderForm();
      if (this.section === 'icon') this.preview = this.preview === 'app' ? 'home' : this.preview;
      this.renderPreview();
      return;
    }
    const segBtn = e.target.closest('[data-set]');
    if (segBtn) {
      const name = segBtn.dataset.set;
      if (name === 'abPrev') {
        this.preview = segBtn.dataset.val;
        for (const b of segBtn.parentElement.children) b.classList.toggle('on', b === segBtn);
        this.renderPreview();
      } else if (name === 'abOs') {
        this.os = segBtn.dataset.val === 'ios' ? 'ios' : 'android';
        settings.android.os = this.os;
        this.save();
        for (const b of segBtn.parentElement.children) b.classList.toggle('on', b === segBtn);
        $('.ab-phone', this.el).dataset.os = this.os;
        $('.ab-screen', this.el).innerHTML = '';
        this.dropWebview();
        this.renderDevRow();
        this.layoutPhone(true);
        this.renderPreview();
      } else if (name.startsWith('k:')) {
        let v = segBtn.dataset.val;
        if (v === 'true' || v === 'false') v = v === 'true';
        this.set(name.slice(2), v, { rerender: true });
      }
      return;
    }
    const add = e.target.closest('[data-list-add]');
    if (add) {
      const k = add.dataset.listAdd;
      const arr = [...(getPath(this.cfg, k) || [])];
      const proto = {
        'config.tabs': { label: arr.length ? `Onglet ${arr.length + 1}` : 'Accueil', icon: ['home', 'search', 'cart', 'user', 'menu'][arr.length] || 'star', url: arr.length ? '' : (this.startUrl() || '/') },
        'config.menu.items': { label: 'Page', icon: 'info', url: '' },
        'config.linkRules': { pattern: '', action: 'browser' },
        'config.onboarding.slides': { title: '', text: '', image: null },
        shortcuts: { label: '', icon: 'star', url: '' },
      }[k];
      arr.push(add.dataset.scalar ? '' : { ...proto });
      this.set(k, arr, { rerender: true });
      return;
    }
    const del = e.target.closest('[data-list-del]');
    if (del) {
      const k = del.dataset.listDel;
      const arr = [...(getPath(this.cfg, k) || [])];
      arr.splice(Number(del.dataset.i), 1);
      this.set(k, arr, { rerender: true });
      return;
    }
    const ip = e.target.closest('[data-iconpick]');
    if (ip) { this.openIconPicker(ip); return; }
    const pickIcon = e.target.closest('[data-pick-icon]');
    if (pickIcon) {
      this.set(pickIcon.dataset.target, pickIcon.dataset.pickIcon, { rerender: true });
      $('#popover').hidden = true;
      return;
    }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;
    const fn = this[`act_${a.replace(/-/g, '_')}`];
    if (fn) {
      // Une action ne se relance pas tant que la précédente (même action) n'est pas terminée.
      this.running = this.running || new Set();
      if (this.running.has(a)) return;
      this.running.add(a);
      act.setAttribute('aria-busy', 'true');
      try { await fn.call(this, act); } catch (err) { toast(err.message || String(err), { kind: 'bad' }); } finally { this.running.delete(a); act.removeAttribute('aria-busy'); }
    }
  }

  openIconPicker(btn) {
    const pop = $('#popover');
    const names = Object.keys(this.tabIcons).sort();
    pop.innerHTML = `<div class="ab-icongrid">${names.map((n) => `<button data-pick-icon="${n}" data-target="${btn.dataset.iconpick}" title="${n}">${this.svgTab(n, 20)}</button>`).join('')}</div>`;
    pop.style.width = '252px';
    pop.hidden = false;
    const r = btn.getBoundingClientRect();
    pop.style.left = `${Math.min(window.innerWidth - 262, r.left)}px`;
    pop.style.top = `${Math.min(window.innerHeight - pop.offsetHeight - 10, r.bottom + 6)}px`;
    const close = (ev) => { if (!pop.contains(ev.target) && ev.target !== btn) { pop.hidden = true; document.removeEventListener('mousedown', close, true); } };
    setTimeout(() => document.addEventListener('mousedown', close, true));
  }

  // ------------------------------------------------------------------ actions
  async act_install() {
    const t = this.tools;
    const btn = $('[data-act="install"]', this.el);
    btn.disabled = true;
    btn.textContent = 'Installation…';
    try {
      this.tools = { ...(await api.invoke('android:install', t.missing)), targetApi: t.targetApi, licenseUrl: t.licenseUrl };
      toast('Outils Android installés.');
      await this.refreshTools();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Réessayer';
      throw e;
    }
  }

  // Fond d'écran de l'aperçu, au choix par système : « Verre » ou « Fluide » (créations originales de NEXORA,
  // dans l'esprit des fonds iPhone / Galaxy), dégradé aux couleurs de l'application, ou image importée
  // (par exemple le fond d'écran de ton propre téléphone). Les fonds officiels d'Apple et de Samsung sont des
  // œuvres protégées : NEXORA ne les copie pas, mais tu peux importer celui que tu utilises.
  wallFor(os) {
    const pref = (settings.android.wall || {})[os] || { kind: os === 'ios' ? 'glass' : 'fluid' };
    if (pref.kind === 'image' && pref.data) return pref.data;
    const key = `${os}|${pref.kind}|${pref.kind === 'app' ? `${this.cfg.accent}|${this.cfg.config.bgColor}` : ''}`;
    this.walls = this.walls || {};
    if (!this.walls[key]) {
      const c = document.createElement('canvas');
      c.width = 804; c.height = 1748;
      const ctx = c.getContext('2d');
      ctx.scale(2, 2);
      const kind = pref.kind === 'image' ? (os === 'ios' ? 'glass' : 'fluid') : pref.kind;
      if (kind === 'glass') paintGlass(ctx, 402, 874, os === 'ios' ? '#bccbd7' : '#9fb3c8');
      else if (kind === 'fluid') paintFluid(ctx, 402, 874, os === 'ios' ? '#3a4a7a' : '#5d5688');
      else if (kind === 'dark') { const g = ctx.createLinearGradient(0, 0, 402, 874); g.addColorStop(0, '#1c1c24'); g.addColorStop(1, '#050507'); ctx.fillStyle = g; ctx.fillRect(0, 0, 402, 874); }
      else {
        const a = this.cfg.accent || '#007AFF';
        const g = ctx.createLinearGradient(0, 0, 402, 874);
        g.addColorStop(0, a); g.addColorStop(1, '#0b0b12');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 402, 874);
        const r = ctx.createRadialGradient(300, 160, 10, 300, 160, 420);
        r.addColorStop(0, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = r; ctx.fillRect(0, 0, 402, 874);
      }
      this.walls[key] = c.toDataURL('image/jpeg', 0.88);
    }
    return this.walls[key];
  }

  wallMenu(anchor) {
    const os = this.os;
    const cur = ((settings.android.wall || {})[os] || {}).kind || (os === 'ios' ? 'glass' : 'fluid');
    const opts = [['glass', 'Verre', 'Lumineux et givré'], ['fluid', 'Fluide', 'Volutes profondes'], ['app', 'Couleurs de l’app', 'Dégradé de la couleur d’accent'], ['dark', 'Sombre', 'Uni, discret']];
    const pop = showPopover(anchor, `<div class="pop-title">Fond d’écran ${os === 'ios' ? 'iPhone' : 'Android'}</div>
      <div class="ab-walls">${opts.map(([k, l, h]) => `<button class="ab-wallopt${cur === k ? ' on' : ''}" data-wall="${k}"><img src="${this.wallThumb(os, k)}" alt=""><span><b>${l}</b><small>${h}</small></span></button>`).join('')}</div>
      <button class="btn wide" data-wall="import">${icon('upload', 14)}<span>Importer mon fond d’écran…</span></button>
      ${cur === 'image' ? `<button class="btn wide" data-wall="glass">${icon('trash', 14)}<span>Retirer l’image importée</span></button>` : ''}
      <p class="pop-note">Les fonds officiels d’Apple et de Samsung sont protégés par le droit d’auteur : NEXORA n’en inclut pas de copie. Pour un aperçu identique à ton téléphone, importe le fond que tu utilises (capture ou fichier).</p>`, { width: 320 });
    if (!pop) return;
    pop.onclick = async (e) => {
      const b = e.target.closest('[data-wall]');
      if (!b) return;
      const w = settings.android.wall || (settings.android.wall = {});
      if (b.dataset.wall === 'import') {
        hidePopover();
        const f = await api.invoke('dialog:open-file', { title: 'Fond d’écran (image)', filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic'] }], asDataUrl: true, maxBytes: 30e6 });
        if (!f || !f.dataUrl) return;
        // Recadré au format de l'écran (402 × 874 points, 2×) pour rester léger.
        const im = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = f.dataUrl; });
        if (!im) { toast('Image illisible.', { kind: 'bad' }); return; }
        const c = document.createElement('canvas'); c.width = 804; c.height = 1748;
        const k = Math.max(c.width / im.naturalWidth, c.height / im.naturalHeight);
        c.getContext('2d').drawImage(im, (c.width - im.naturalWidth * k) / 2, (c.height - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k);
        w[os] = { kind: 'image', data: c.toDataURL('image/jpeg', 0.86) };
      } else { w[os] = { kind: b.dataset.wall }; hidePopover(); }
      persist();
      this.renderPreview();
    };
  }

  wallThumb(os, kind) {
    const saved = settings.android.wall;
    settings.android.wall = { ...(saved || {}), [os]: { kind } };
    const full = this.wallFor(os);
    settings.android.wall = saved;
    return full;
  }

  // Nouvelle application à partir d'un modèle (assistant « Nouveau »).
  newApp(patch = {}) {
    const a = merge(defaults(), JSON.parse(JSON.stringify(patch)));
    a.id = uid();
    settings.android.apps.push(a);
    settings.android.current = a.id;
    this.section = a.engine === 'twa' ? 'pwa' : 'source';
    this.save();
    this.render();
    this.renderPreview();
    this.refreshKey();
    return a;
  }

  act_app_new() {
    const a = defaults();
    settings.android.apps.push(a);
    settings.android.current = a.id;
    this.section = 'source';
    this.save();
    this.render();
    this.renderPreview();
    this.refreshKey();
  }

  act_app_dup() {
    const a = JSON.parse(JSON.stringify(this.cfg));
    a.id = uid();
    a.appName = `${a.appName || 'Application'} (copie)`;
    a.appId = '';
    settings.android.apps.push(a);
    settings.android.current = a.id;
    this.save();
    this.render();
    this.renderPreview();
    this.refreshKey();
  }

  act_app_del() {
    const list = settings.android.apps;
    if (list.length < 2) return;
    settings.android.apps = list.filter((x) => x.id !== this.cfg.id);
    settings.android.current = settings.android.apps[0].id;
    this.save();
    this.render();
    this.renderPreview();
    toast('Réglages supprimés (la clé de signature est conservée).');
  }

  act_suggest_id() {
    this.set('appId', suggestId(this.cfg), { rerender: true });
    this.refreshKey();
  }

  act_use_current() {
    this.set('source.url', S.baseUrl, { rerender: true });
    this.autofill();
  }

  async act_check_url() {
    const out = $('.ab-url-state', this.el);
    out.textContent = 'Vérification…';
    const r = await api.invoke('url:check', this.cfg.source.url);
    out.innerHTML = r ? `<span class="ok">${icon('pass', 14)} Accessible</span>` : `<span class="bad">${icon('warn', 14)} Inaccessible</span>`;
    if (r) this.autofill();
  }

  autofill() {
    const c = this.cfg;
    try {
      const u = new URL(c.source.url);
      if (!c.appName) this.set('appName', u.hostname.replace(/^www\./, '').split('.')[0].replace(/^./, (x) => x.toUpperCase()));
      if (!c.appId) this.set('appId', suggestId(c));
      this.renderApps();
    } catch { /* adresse incomplète */ }
  }

  async act_pick_dir() {
    const dir = await api.invoke('android:pick-dir', this.cfg.source.kind === 'project' ? 'Dossier du projet' : 'Dossier contenant index.html');
    if (!dir) return;
    await this.useDir(dir);
  }

  async act_use_project() { await this.useDir(S.source.dir); }

  async useDir(dir) {
    const info = await api.invoke('android:inspect-dir', dir);
    this.set('source.dir', dir);
    this.set('source.www', info.www || '');
    if (!this.cfg.appName && info.name) this.set('appName', info.name);
    if (!this.cfg.appId) this.set('appId', suggestId(this.cfg));
    this.renderForm();
    this.renderApps();
    this.showDirInfo(info);
  }

  showDirInfo(info) {
    const box = $('.ab-dirinfo', this.el);
    if (!box) return;
    box.innerHTML = info.www ? `<p class="ok">${icon('pass', 14)} index.html trouvé dans ${esc(info.www)}</p>` : `<p class="warn">${icon('warn', 14)} Aucun index.html construit${info.canBuild ? ' : lance la construction du projet.' : '.'}</p>`;
  }

  async act_build_web(btn) {
    btn.disabled = true;
    this.openLog();
    const t = toast('Construction du projet…', { busy: true, sticky: true });
    try {
      const info = await api.invoke('android:build-web', this.cfg.source.dir);
      this.set('source.www', info.www || '');
      this.renderForm();
      this.showDirInfo(info);
      t.close();
      toast(info.www ? 'Projet construit.' : 'Construit, mais aucun index.html trouvé.', { kind: info.www ? '' : 'bad' });
    } catch (e) {
      t.close();
      throw e;
    } finally { btn.disabled = false; }
  }

  async pickImage(k) {
    const r = await api.invoke('dialog:open-file', { title: 'Choisir une image', filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }], asDataUrl: true });
    if (!r || !r.dataUrl) return;
    this.set(k, r.dataUrl, { rerender: true });
  }

  act_pick_icon() { return this.pickImage('icon.image'); }
  act_clear_icon() { this.set('icon.image', null, { rerender: true }); }
  act_pick_splash() { return this.pickImage('splash.image'); }
  act_clear_splash() { this.set('splash.image', null, { rerender: true }); }
  act_pick_modal() { return this.pickImage('config.modal.image'); }
  act_clear_modal() { this.set('config.modal.image', null, { rerender: true }); }
  act_pick_slide(btn) { return this.pickImage(`config.onboarding.slides.${btn.dataset.i}.image`); }

  async act_pick_out() {
    const d = await api.invoke('android:pick-out', this.cfg.outDir || undefined);
    if (d) this.set('outDir', d, { rerender: true });
  }

  async act_key_create() {
    const k = await api.invoke('android:key-create', { appId: this.cfg.appId, owner: this.ownerFor() });
    toast('Clé de signature créée.');
    this.key = k;
    await this.refreshKey();
  }

  act_key_import_open() { $('.ab-import', this.el).hidden = false; }

  async act_key_import_pick() {
    const r = await api.invoke('dialog:open-file', { title: 'Clé de signature', filters: [{ name: 'Clés', extensions: ['jks', 'keystore', 'p12', 'pfx'] }] });
    if (!r || !r.path) return;
    this.importFile = r.path;
    $('.ab-import-file', this.el).textContent = r.path;
  }

  async act_key_import() {
    if (!this.importFile) throw new Error('Choisis le fichier de la clé.');
    const v = (n) => $(`[data-imp="${n}"]`, this.el).value;
    await api.invoke('android:key-import', {
      appId: this.cfg.appId, source: this.importFile, alias: v('alias') || 'upload', storePass: v('storePass'), keyPass: v('keyPass') || undefined,
    });
    toast('Clé importée.');
    await this.refreshKey();
  }

  async act_key_export() {
    const r = await api.invoke('android:key-export', this.cfg.appId);
    if (r) toast('Clé exportée, avec ses mots de passe dans un fichier .txt à côté.');
  }

  async act_devices() {
    const r = await api.invoke('android:devices');
    this.devices = r.devices || [];
    const box = $('.ab-devices', this.el);
    if (!r.adb) { box.innerHTML = '<p class="ab-hint">L’installation sur téléphone n’est pas encore prête : elle est ajoutée avec les outils Android.</p>'; return; }
    box.innerHTML = this.devices.length ? this.devices.map((d) => `
      <div class="ab-dev">${icon('phone', 16)}<span><b>${esc(d.model)}</b><small>${d.state === 'device' ? 'prêt' : d.state === 'unauthorized' ? 'autorise le débogage sur le téléphone' : esc(d.state)}</small></span>
      <button class="btn small" data-act="install-on" data-serial="${esc(d.serial)}" ${d.state === 'device' && this.result && this.result.apk ? '' : 'disabled'}>Installer et ouvrir</button>
      <button class="btn small primary" data-act="test-on" data-serial="${esc(d.serial)}" ${d.state === 'device' && this.result && this.result.apk ? '' : 'disabled'} title="Installe, ouvre et surveille l’application pendant 15 secondes, puis explique un éventuel plantage">${icon('pass', 13)}<span>Tester</span></button></div>`).join('') + (this.result && this.result.apk ? '' : '<p class="ab-hint">Construis d’abord l’application (bouton « Construire ») pour pouvoir l’installer et la tester.</p>')
      : `<div class="ab-usbhelp"><b>Aucun téléphone détecté.</b><ol>
          <li>Sur le téléphone : <b>Paramètres › À propos du téléphone</b>, touche 7 fois <b>Numéro de build</b> (« Vous êtes développeur »).</li>
          <li><b>Paramètres › Système › Options pour les développeurs</b> : active <b>Débogage USB</b> (et « Installer via USB » sur Xiaomi).</li>
          <li>Branche le téléphone avec un câble de données, choisis <b>Transfert de fichiers</b>, puis accepte « Autoriser le débogage USB » sur l’écran.</li>
          <li>Clique sur <b>Rechercher</b> ci-dessus.</li></ol></div>`;
  }

  // Test réel : installation, ouverture, 15 s de surveillance, explication claire en cas de plantage.
  async act_test_on(btn) {
    const t = toast('Test sur le téléphone : installation, ouverture puis surveillance pendant 15 s…', { busy: true, sticky: true });
    const box = $('.ab-devtest', this.el) || (() => { const d = document.createElement('div'); d.className = 'ab-devtest'; $('.ab-devices', this.el).after(d); return d; })();
    box.innerHTML = '<p class="ab-hint"><span class="spinner small"></span> Test en cours… garde le téléphone déverrouillé.</p>';
    try {
      const r = await api.invoke('android:test-run', { serial: btn.dataset.serial, apk: this.result.apk, appId: this.result.appId, seconds: 15 });
      const dev = r.device ? `${r.device.brand || ''} ${r.device.model || ''} · Android ${r.device.release || '?'}` : '';
      box.innerHTML = `<div class="ab-testres ${r.ok ? 'ok' : 'bad'}">${icon(r.ok ? 'pass' : 'warn', 18)}<div><b>${r.ok ? 'Test réussi' : r.stage === 'install' ? 'Installation impossible' : 'L’application s’est fermée'}</b><p>${esc(r.message)}</p><small>${esc(dev)}</small>
        ${r.detail ? `<details class="ab-details"><summary>Détails pour l’assistance</summary><pre class="ab-pre">${esc(r.detail)}</pre><button class="btn small" data-copy="${esc(`${dev}\n${r.message}\n${r.detail}`)}">${icon('copy', 12)}<span>Copier le rapport</span></button></details>` : ''}</div></div>`;
    } catch (e) { box.innerHTML = ''; throw e; } finally { t.close(); }
  }

  async act_install_on(btn) {
    btn.disabled = true;
    const t = toast('Installation sur le téléphone…', { busy: true, sticky: true });
    try {
      await api.invoke('android:install-apk', {
        serial: btn.dataset.serial, apk: this.result.apk, appId: this.result.appId, launch: true,
      });
      t.close();
      toast('Application installée et ouverte.');
    } catch (e) { t.close(); throw e; } finally { btn.disabled = false; }
  }

  act_reveal() { if (this.result) api.invoke('android:reveal', this.result.files[0]); }

  // ------------------------------------------------------------------ PWA
  // Adresse à analyser : le champ, sinon l'adresse du site, sinon l'adresse publique, sinon — pour un projet
  // local — le serveur lancé dans le Responsive Lab quand c'est bien ce projet qui tourne.
  inspectUrl() {
    const c = this.cfg;
    if (c.source.kind === 'url' && c.source.url) return c.source.url;
    if (c.source.publicUrl) return c.source.publicUrl;
    if (S.baseUrl && S.source && (S.source.dir === c.source.dir || (S.source.url && c.source.url && (() => { try { return new URL(S.source.url).host === new URL(c.source.url).host; } catch { return false; } })()))) return S.baseUrl;
    if (S.baseUrl && c.source.kind !== 'url') return S.baseUrl;
    return '';
  }

  async act_pwa_inspect() {
    const inp = $('[data-pwa-url]', this.el);
    let url = (inp && inp.value.trim()) || this.inspectUrl();
    if (!url) throw new Error('Indique l’adresse du site, ou lance le projet dans le Responsive Lab.');
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const t = toast('Analyse du site (manifest, service worker, hors ligne, sécurité)…', { busy: true, sticky: true });
    try {
      const r = await api.invoke('android:pwa-inspect', url);
      this.cfg.pwa.report = r;
      this.save();
      this.renderForm();
    } finally { t.close(); }
  }

  async act_pwa_identity() {
    const n = await this.applyIdentity(this.cfg.pwa.report, { force: true });
    this.save(); this.renderApps(); this.renderNav(); this.renderForm(); this.updateIconPreviews(); this.renderPreview();
    toast(`Identité du site appliquée (${n} réglage${n > 1 ? 's' : ''}).`);
  }

  // Reconnaissance automatique de l'identité du site : nom, nom court, logo, couleurs, langue, identifiant,
  // contacts. Ne remplace que ce qui n'a pas été réglé à la main (sauf « force »).
  async act_detect(_btn, { force = true, quiet = false } = {}) {
    const url = this.cfg.source.url || this.inspectUrl();
    if (!url) throw new Error('Indique l’adresse du site, ou lance le projet dans le Responsive Lab pour l’analyser.');
    const t = quiet ? null : toast('Reconnaissance du site : nom, logo, couleurs…', { busy: true, sticky: true });
    try {
      const r = await api.invoke('android:pwa-inspect', url);
      this.cfg.pwa.report = r;
      const n = await this.applyIdentity(r, { force });
      this.save();
      this.renderApps(); this.renderNav(); this.renderForm(); this.updateIconPreviews(); this.renderPreview();
      if (!quiet) toast(n ? `Identité du site appliquée (${n} réglage${n > 1 ? 's' : ''}).` : 'Rien de nouveau à appliquer : les réglages faits à la main sont conservés.');
      return r;
    } finally { if (t) t.close(); }
  }

  async applyIdentity(r, { force = false } = {}) {
    const id = r && r.identity;
    if (!id) return 0;
    const c = this.cfg;
    const d = defaults();
    let n = 0;
    const put = (k, v) => {
      if (v == null || v === '') return;
      const cur = k.split('.').reduce((o, x) => (o ? o[x] : undefined), c);
      const def = k.split('.').reduce((o, x) => (o ? o[x] : undefined), d);
      if (!force && cur !== def && cur !== '' && cur != null) return;
      if (cur === v) return;
      this.set(k, v); n += 1;
    };
    const m = r.manifest || {};
    put('appName', (m.name || id.name || '').slice(0, 50));
    put('twa.launcherName', (m.short_name || id.shortName || '').slice(0, 12));
    if (!c.appId || force) { const v = c.appId && !force ? c.appId : id.appId; if (v && v !== c.appId && /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(v)) { this.set('appId', v); n += 1; } }
    const brand = id.brand || '';
    const theme = id.theme || brand;
    const bg = id.background || '#FFFFFF';
    if (brand) { put('accent', brand.toUpperCase()); put('config.tabActive', brand.toUpperCase()); }
    if (theme) { put('config.statusColor', theme.toUpperCase()); put('twa.themeColor', theme.toUpperCase()); }
    if (id.themeDark) put('twa.themeColorDark', id.themeDark.toUpperCase());
    put('config.bgColor', bg.toUpperCase()); put('splash.bg', bg.toUpperCase()); put('twa.bgColor', bg.toUpperCase());
    put('config.navColor', bg.toUpperCase());
    if (m.orientation) put('orientation', /portrait/.test(m.orientation) ? 'portrait' : /landscape/.test(m.orientation) ? 'landscape' : 'unspecified');
    if (m.display === 'fullscreen') put('config.fullscreen', true);
    if (id.contacts && id.contacts.whatsapp && !c.config.fab.value) { this.set('config.fab.action', 'whatsapp'); this.set('config.fab.value', id.contacts.whatsapp); n += 1; }
    if (Array.isArray(m.shortcuts) && m.shortcuts.length && (force || !c.shortcuts.length)) {
      const base = r.manifestUrl || r.url;
      const abs = (u) => { try { return new URL(u, base).href; } catch { return u; } };
      this.set('shortcuts', m.shortcuts.slice(0, 4).map((x) => ({ label: String(x.short_name || x.name || '').slice(0, 25), url: abs(x.url), icon: 'star' })).filter((x) => x.label && x.url)); n += 1;
    }
    // Logo : premier candidat qui se charge, carré si possible.
    let logo = null;
    if (force || !c.icon.image) {
      logo = await this.pickLogo(id.logos || []);
      if (logo) {
        this.set('icon.image', logo.data); n += 1;
        this.set('icon.fill', logo.kind === 'manifest-maskable' ? 'full' : 'logo');
        // Fond de l'icône : celui du logo s'il est opaque, sinon le fond du site (ou la couleur de marque si le logo est clair).
        this.set('icon.bg', (logo.edge || (logo.light && brand) || bg).toUpperCase());
        if (force || !c.splash.image) this.set('splash.image', null);
      }
    }
    c.detected = { name: c.appName, brand, lang: id.lang, logo: Boolean(logo || c.icon.image), at: Date.now() };
    return n;
  }

  // Charge les logos candidats et garde le premier exploitable (≥ 96 px, à peu près carré) ;
  // un logo SVG est converti en PNG 1024 px. Renvoie aussi la couleur des bords (fond opaque du logo).
  async pickLogo(cands) {
    const load = (src) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
    let best = null;
    for (const cand of cands.slice(0, 10)) {
      if (cand.kind === 'image-partage' && best) break;
      let data = cand.src;
      if (!/^data:/.test(data)) { try { data = await api.invoke('android:fetch-image', cand.src); } catch { continue; } }
      // eslint-disable-next-line no-await-in-loop
      const im = await load(data);
      if (!im || !im.naturalWidth) continue;
      const w = im.naturalWidth; const h = im.naturalHeight;
      const svg = /^data:image\/svg/.test(data);
      const side = svg ? 1024 : Math.min(1024, Math.max(w, h));
      const ratio = Math.max(w, h) / Math.max(1, Math.min(w, h));
      const cv = document.createElement('canvas');
      cv.width = side; cv.height = side;
      const g = cv.getContext('2d');
      const k = side / Math.max(w, h);
      g.drawImage(im, (side - w * k) / 2, (side - h * k) / 2, w * k, h * k);
      let edge = ''; let light = false;
      try {
        const px = g.getImageData(0, 0, side, side).data;
        const at = (x, y) => { const i = (y * side + x) * 4; return [px[i], px[i + 1], px[i + 2], px[i + 3]]; };
        const corners = [at(1, 1), at(side - 2, 1), at(1, side - 2), at(side - 2, side - 2)];
        if (ratio < 1.15 && corners.every((q) => q[3] > 240) && corners.every((q) => Math.abs(q[0] - corners[0][0]) + Math.abs(q[1] - corners[0][1]) + Math.abs(q[2] - corners[0][2]) < 30)) edge = `#${corners[0].slice(0, 3).map((x) => x.toString(16).padStart(2, '0')).join('')}`;
        let sum = 0; let cnt = 0;
        for (let i = 0; i < px.length; i += 4 * 97) if (px[i + 3] > 128) { sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; cnt += 1; }
        light = cnt > 0 && sum / cnt > 225;
      } catch { /* image d'une autre origine */ }
      const out = { data: cv.toDataURL('image/png'), kind: cand.kind, size: side, edge, light };
      const good = side >= 96 && ratio < 1.6;
      if (good) return out;
      if (!best || side > best.size) best = out;
    }
    return best;
  }

  // Projet / site ouvert dans NEXORA : l'App Builder s'y aligne.
  // - application déjà faite pour ce site → elle devient l'application courante ;
  // - application courante vide → elle prend ce site (et reconnaît son identité) ;
  // - sinon → bandeau « Créer l'application de ce site ».
  syncSource(src, url) {
    if (!src) return;
    const apps = settings.android.apps;
    const same = (a) => (src.mode === 'project' ? a.source.dir && a.source.dir === src.dir : a.source.kind === 'url' && a.source.url && new URL(a.source.url).host === new URL(url || src.url).host);
    const safeSame = (a) => { try { return same(a); } catch { return false; } };
    const cur = this.cfg;
    // Applications rattachées au projet ouvert (Accueil › projets) : elles passent en premier.
    const proj = currentProject();
    const linked = proj ? apps.filter((a) => proj.apps.includes(a.id)) : [];
    if (linked.some((a) => a.id === cur.id) || safeSame(cur)) { linkApp(cur.id); this.hideSyncBar(); return; }
    const other = linked[0] || apps.find(safeSame);
    if (other) {
      settings.android.current = other.id; this.save(); this.render(); this.renderPreview(); this.refreshKey();
      linkApp(other.id);
      toast(`App Builder : application « ${other.appName || 'sans nom'} » (projet ouvert).`);
      return;
    }
    const empty = !cur.source.url && !cur.source.dir;
    if (empty) { this.adoptSource(src, url); return; }
    this.showSyncBar(src, url);
  }

  adoptSource(src, url) {
    linkApp(this.cfg.id, src);
    if (src.mode === 'project') {
      this.set('source.kind', 'project');
      this.set('source.dir', src.dir);
      if (!this.cfg.appName) this.set('appName', src.name || '');
      this.useDir(src.dir).catch(() => {});
      this.render(); this.renderPreview();
    } else {
      this.set('source.kind', 'url');
      this.set('source.url', url || src.url);
      this.render(); this.renderPreview();
      this.act_detect(null, { force: false, quiet: true }).catch(() => {});
    }
    this.hideSyncBar();
  }

  showSyncBar(src, url) {
    const main = $('.ab-main', this.el);
    let bar = $('.ab-syncbar', this.el);
    if (!bar) { bar = document.createElement('div'); bar.className = 'ab-syncbar'; main.prepend(bar); }
    const label = src.mode === 'project' ? (src.name || src.dir) : (() => { try { return new URL(url || src.url).host; } catch { return url; } })();
    bar.innerHTML = `${icon('link', 14)}<span>Projet ouvert dans NEXORA : <b>${esc(label)}</b> — il n’a pas encore d’application.</span><button class="btn small primary" data-sync="new">Créer son application</button><button class="btn small" data-sync="use">Utiliser pour celle-ci</button><button class="icon-btn small" data-sync="x" title="Ignorer">${icon('close', 12)}</button>`;
    bar.onclick = (e) => {
      const b = e.target.closest('[data-sync]');
      if (!b) return;
      if (b.dataset.sync === 'x') { this.hideSyncBar(); return; }
      if (b.dataset.sync === 'new') { this.act_app_new(); }
      this.adoptSource(src, url);
    };
  }

  hideSyncBar() { const b = $('.ab-syncbar', this.el); if (b) b.remove(); }

  // Reprend le manifest du site : nom, couleurs, orientation, affichage, icône, raccourcis, partage.
  async act_pwa_apply() {
    const r = this.cfg.pwa.report;
    const m = r && r.manifest;
    if (!m) return;
    const c = this.cfg;
    const abs = (u) => { try { return new URL(u, r.manifestUrl || r.url).href; } catch { return u; } };
    if (m.name || m.short_name) this.set('appName', m.name || m.short_name);
    if (m.short_name) this.set('twa.launcherName', m.short_name);
    if (m.start_url) this.set('source.url', abs(m.start_url));
    else if (!c.source.url) this.set('source.url', r.url);
    if (/^#/.test(m.theme_color || '')) { this.set('twa.themeColor', m.theme_color); this.set('config.statusColor', m.theme_color); this.set('accent', m.theme_color); }
    if (/^#/.test(m.background_color || '')) { this.set('splash.bg', m.background_color); this.set('twa.bgColor', m.background_color); this.set('config.bgColor', m.background_color); this.set('icon.bg', m.background_color); }
    if (m.display) this.set('twa.display', m.display === 'fullscreen' ? 'fullscreen' : 'standalone');
    if (m.display === 'fullscreen') this.set('config.fullscreen', true);
    if (m.orientation) {
      this.set('twa.orientation', m.orientation);
      this.set('orientation', /portrait/.test(m.orientation) ? 'portrait' : /landscape/.test(m.orientation) ? 'landscape' : 'unspecified');
    }
    if (m.share_target) this.set('twa.shareTarget', m.share_target);
    if (Array.isArray(m.shortcuts)) this.set('shortcuts', m.shortcuts.slice(0, 4).map((x) => ({ label: String(x.short_name || x.name || '').slice(0, 25), url: abs(x.url), icon: 'star' })).filter((x) => x.label && x.url));
    // Icône : la plus grande adaptable, sinon la plus grande.
    const size = (i) => Math.max(...String(i.sizes || '0').split(/\s+/).map((x) => Number(x.split('x')[0]) || (x === 'any' ? 1024 : 0)));
    const icons = [...r.icons].sort((a, b) => size(b) - size(a));
    const pick = icons.find((i) => /maskable/.test(i.purpose || '') && size(i) >= 192) || icons.find((i) => !/monochrome/.test(i.purpose || ''));
    if (pick) {
      try {
        const data = await api.invoke('android:fetch-image', pick.src);
        this.set('icon.image', data);
        this.set('icon.fill', /maskable/.test(pick.purpose || '') ? 'full' : 'logo');
      } catch { /* icône inaccessible */ }
    }
    if (!c.appId) this.set('appId', suggestId(c));
    // Complète avec l'identité reconnue (logo d'en-tête, couleur de marque…) ce que le manifest ne donne pas.
    if (r.identity) await this.applyIdentity(r, { force: false });
    this.renderApps();
    this.renderNav();
    this.renderForm();
    this.updateIconPreviews();
    toast('Réglages repris du manifest du site.');
  }

  pwaManifest() {
    const c = this.cfg;
    let start = '/';
    let scope = '/';
    try { const u = new URL(c.source.url || c.source.publicUrl); start = u.pathname + u.search || '/'; scope = '/'; } catch { /* projet local */ }
    const theme = c.twa.themeColor || c.config.statusColor || c.accent;
    return {
      id: start, name: c.appName, short_name: (c.twa.launcherName || c.appName || '').slice(0, 12), description: this.appDescription(), lang: (c.pwa.report && c.pwa.report.identity && c.pwa.report.identity.lang) || 'fr', dir: 'ltr', start_url: start, scope, display: c.twa.display === 'standalone' ? 'standalone' : 'fullscreen', display_override: ['window-controls-overlay', 'standalone'], edge_side_panel: { preferred_width: 420 },
      orientation: c.twa.orientation && c.twa.orientation !== 'default' ? c.twa.orientation : 'any', theme_color: theme, background_color: c.splash.bg || c.icon.bg, categories: ['business'],
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }, { src: '/icons/monochrome-512.png', sizes: '512x512', type: 'image/png', purpose: 'monochrome' },
      ],
      shortcuts: c.shortcuts.filter((x) => x.label && x.url).map((x) => ({ name: x.label, url: (() => { try { const u = new URL(x.url); return u.pathname + u.search; } catch { return x.url; } })(), icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] })),
      launch_handler: { client_mode: 'navigate-existing' }, handle_links: 'preferred', prefer_related_applications: false,
      ...(c.appId ? { related_applications: [{ platform: 'play', url: `https://play.google.com/store/apps/details?id=${c.appId}`, id: c.appId }] } : {}),
    };
  }

  appDescription() {
    const c = this.cfg;
    const r = c.pwa.report;
    const id = r && r.identity;
    return (c.description || (id && id.description) || (r && r.manifest && r.manifest.description) || `${c.appName} — application mobile.`).slice(0, 300);
  }

  async act_pwa_inject() {
    const c = this.cfg;
    if (c.source.kind === 'url') { toast('Cette option est pour un projet avec code source (section Source : Projet ou Dossier construit).', { kind: 'bad' }); return; }
    if (!c.source.dir) { toast('Choisis d’abord le dossier du projet (section Source).', { kind: 'bad' }); return; }
    const icons = await pwaIcons(c);
    const t = toast('Création d’une copie du projet avec les éléments PWA…', { busy: true, sticky: true });
    try {
      const r = await api.invoke('android:pwa-inject', {
        dir: c.source.dir, manifest: this.pwaManifest(), strategy: c.pwa.strategy, version: String(c.versionCode || 1), appId: RX_APPID.test(c.appId || '') ? c.appId : null,
        icons: Object.fromEntries(Object.entries(icons).map(([k, v]) => [k, Array.from(v)])),
        offline: { name: c.appName, bg: c.config.bgColor, accent: c.accent, title: c.config.offlineTitle, text: c.config.offlineText, button: c.config.offlineButton },
      });
      t.close();
      // On continue sur la copie : elle devient la source, et s'ouvre dans le Dev Lab.
      this.set('source.dir', r.dest);
      toast(`Copie créée : ${r.pages} page(s) mises à jour.${r.framework === 'node' ? ' Lance « npm install » puis le projet dans le Dev Lab.' : ''} On continue sur la copie.`, {
        action: 'Ouvrir dans le Dev Lab',
        onAction: () => import('../core/sync.js').then((m) => m.adoptDevFolder(r.dest)).catch(() => {}),
      });
      import('../core/sync.js').then((m) => m.adoptDevFolder(r.dest)).catch(() => {});
    } catch (e) { t.close(); throw e; }
  }

  async act_pwa_pack() {
    const c = this.cfg;
    const icons = await pwaIcons(c);
    const dir = await api.invoke('android:pwa-pack', {
      manifest: this.pwaManifest(), strategy: c.pwa.strategy, version: String(c.versionCode || 1), appId: RX_APPID.test(c.appId || '') ? c.appId : null,
      icons: Object.fromEntries(Object.entries(icons).map(([k, v]) => [k, Array.from(v)])),
      offline: { name: c.appName, bg: c.config.bgColor, accent: c.accent, title: c.config.offlineTitle, text: c.config.offlineText, button: c.config.offlineButton },
    });
    if (dir) toast(`Fichiers PWA enregistrés dans ${dir}`);
  }

  async act_pwa_sw_preview() {
    const pre = $('.ab-sw-prev', this.el);
    const r = await api.invoke('android:pwa-sw', { strategy: this.cfg.pwa.strategy, version: String(this.cfg.versionCode || 1) });
    pre.textContent = r.sw;
    pre.hidden = !pre.hidden;
  }

  // ------------------------------------------------------------------ simulation de lancement
  async act_launch_sim() {
    if (this.simulating) return;
    this.simulating = true;
    try {
      if (this.preview !== 'home') { this.preview = 'home'; this.renderPreview(); await new Promise((r) => setTimeout(r, 450)); }
      const screen = $('.ab-screen', this.el);
      const me = $('[data-launch]', screen);
      if (!me) return;
      if (!this.iconPrev) await this.updateIconPreviews();
      const c = this.cfg;
      await launchSim(screen, me, {
        os: this.os,
        bg: c.splash.bg || c.icon.bg,
        splash: splashHtml(c, this.iconPrev && this.iconPrev.splash),
        hold: Math.max(1400, Math.min(3200, (Number(c.splash.min) || 400) + 1300)),
        onApp: async () => {
          this.preview = 'app';
          for (const b of $$('[data-set="abPrev"]', this.el)) b.classList.toggle('on', b.dataset.val === 'app');
          this.renderPreview();
        },
      });
    } finally { this.simulating = false; }
  }

  act_replay_splash() {
    if (this.preview !== 'splash') { this.preview = 'splash'; this.renderPreview(); return; }
    playIntro($('.ab-screen', this.el));
  }

  // ------------------------------------------------------------------ construction
  ownerFor() {
    const o = this.cfg.owner || {};
    return {
      name: o.name || this.cfg.appName, org: o.org || (o.kind === 'company' ? o.name : '') || this.cfg.appName, role: o.role, region: o.region, city: o.city, country: o.country, email: o.email, website: o.website, phone: o.phone, street: o.street, postal: o.postal,
    };
  }

  startUrl() {
    const c = this.cfg;
    return c.source.kind === 'url' ? c.source.url : 'https://appassets.androidplatform.net/';
  }

  validate() {
    const c = this.cfg;
    const errs = [];
    if (!String(c.appName || '').trim()) errs.push(['identity', 'Donne un nom à l’application.']);
    if (!RX_APPID.test(c.appId || '')) errs.push(['identity', 'Identifiant d’application invalide (ex. com.entreprise.app).']);
    if (c.source.kind === 'url' && !/^https?:\/\/[^/]+/.test(c.source.url || '')) errs.push(['source', 'Indique l’adresse du site (https://…).']);
    if (c.source.kind === 'url' && c.engine === 'twa' && !/^https:\/\//.test(c.source.url || '')) errs.push(['source', 'Le mode Trusted Web Activity demande un site en https.']);
    if (c.source.kind !== 'url' && !c.source.www) errs.push(['source', c.source.kind === 'project' ? 'Construis le projet ou choisis le dossier construit.' : 'Choisis le dossier contenant index.html.']);
    if (!c.outputs.apk && !c.outputs.aab) errs.push(['publish', 'Choisis au moins un fichier à produire (APK ou AAB).']);
    if (c.push.enabled && !(c.engine === 'twa' && c.source.kind === 'url')) {
      if (!c.push.googleServices) errs.push(['push', 'Notifications push : importe le fichier google-services.json de ton projet Firebase (étape 3).']);
      else if (c.push.project && c.push.project.app && c.push.project.app !== c.appId) errs.push(['push', `Notifications push : le fichier google-services.json a été créé pour « ${c.push.project.app} », pas pour « ${c.appId} ». Ajoute cette application dans Firebase et télécharge à nouveau le fichier.`]);
    }
    return errs;
  }

  async spec() {
    const c = this.cfg;
    const cc = c.config;
    const images = await generateImages(c);
    const startUrl = this.startUrl();
    const local = c.source.kind !== 'url';
    const absolute = (u) => {
      if (!u) return u;
      if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return u;
      try { return new URL(u, startUrl).href; } catch { return u; }
    };
    const tabs = cc.tabs.filter((t) => t.url || t.label).map((t) => ({ ...t, url: absolute(t.url || '/') }));
    return {
      appName: (c.engine === 'twa' && !local && c.twa.launcherName ? c.twa.launcherName : c.appName).trim(),
      appId: c.appId.trim(),
      versionName: c.versionName || '1.0.0',
      versionCode: Number(c.versionCode) || 1,
      mode: local ? 'local' : (c.engine === 'twa' ? 'twa' : 'remote'),
      twa: c.engine === 'twa' && !local ? {
        ...c.twa, themeColor: c.twa.themeColor || c.config.statusColor, navColor: c.twa.navColor || c.twa.themeColor || c.config.navColor, bgColor: c.twa.bgColor || c.splash.bg || c.icon.bg,
        trustedOrigins: (c.twa.trustedOrigins || []).filter(Boolean), extraFingerprints: undefined,
      } : undefined,
      extraFingerprints: (c.twa.extraFingerprints || []).filter((x) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/i.test(String(x).trim())).map((x) => x.trim().toUpperCase()),
      startUrl,
      publicUrl: local ? (c.source.publicUrl || '') : '',
      wwwDir: local ? c.source.www : undefined,
      hosts: c.hosts.filter(Boolean),
      permissions: c.permissions,
      orientation: c.orientation,
      orientFlip: Boolean(c.orientFlip),
      orientTablet: c.orientTablet && c.orientTablet !== 'same' ? c.orientTablet : null,
      orientJs: c.orientJs !== false,
      downloads: c.downloads,
      tv: c.tv,
      deepLinks: c.deepLinks.enabled ? { hosts: c.deepLinks.hosts.filter(Boolean), scheme: (c.deepLinks.scheme || '').replace(/[^a-z0-9+.-]/gi, '').toLowerCase() } : null,
      shortcuts: c.shortcuts.filter((x) => x.label && x.url).map((x) => ({ ...x, url: absolute(x.url) })),
      colors: { splashBg: c.splash.bg || c.icon.bg, iconBg: c.icon.bg, accent: c.accent },
      config: {
        ...cc,
        tabs,
        tabActive: cc.tabActive || c.accent,
        splashMin: c.splash.min,
        splashMax: c.splash.max,
        splashAnim: c.splash.anim,
        splashIntro: c.splash.intro,
        splashName: c.splash.showName,
        splashTagline: c.splash.tagline,
        splashTextColor: c.splash.textColor,
        splashLogoSize: c.splash.logoSize,
        splashHideOn: c.splash.hideOn,
        progressBar: cc.loader === 'bar',
        menu: cc.menu.enabled ? { ...cc.menu, items: cc.menu.items.filter((x) => x.label).map((x) => ({ ...x, url: absolute(x.url || '/') })) } : null,
        fab: cc.fab.enabled ? { ...cc.fab, value: cc.fab.action === 'url' ? absolute(cc.fab.value) : cc.fab.value } : null,
        onboarding: cc.onboarding.enabled && cc.onboarding.slides.length ? { ...cc.onboarding, slides: cc.onboarding.slides.map(({ image, ...s }) => s) } : null,
        modal: cc.modal.enabled ? (({ image, ...m }) => ({ ...m, url: m.url ? absolute(m.url) : '' }))(cc.modal) : null,
        passcode: cc.passcode.enabled ? cc.passcode : null,
        linkRules: cc.linkRules.filter((r) => r.pattern),
      },
      remote: c.remote && c.remote.enabled ? { enabled: true, url: c.remote.url } : null,
      push: c.push.enabled && !(c.engine === 'twa' && !local) ? {
        enabled: true, googleServices: c.push.googleServices, ask: c.push.ask, channel: c.push.channel, registerUrl: c.push.registerUrl, topics: String(c.push.topicsText ?? (c.push.topics || []).join(',')).split(',').map((x) => x.trim().replace(/[^a-zA-Z0-9-_.~%]/g, '')).filter(Boolean),
      } : null,
      optimize: c.optimize,
      images: Object.fromEntries(Object.entries(images).map(([k, v]) => [k, Array.from(v)])),
      outputs: c.outputs,
      outDir: c.outDir || undefined,
      owner: this.ownerFor(),
    };
  }

  async act_build() { return this.build(); }

  async build() {
    if (this.building) return null;
    const errs = this.validate();
    if (errs.length) {
      this.section = errs[0][0];
      this.renderNav();
      this.renderForm();
      throw new Error(errs[0][1]);
    }
    if (this.tools && !this.tools.ready) throw new Error('Installe d’abord les outils Android (bandeau en haut).');
    this.building = true;
    this.log = [];
    $('.ab-log pre', this.el).textContent = '';
    const go = $('.ab-go', this.el);
    go.disabled = true;
    $('.ab-result', this.el).hidden = true;
    this.setStep({ label: 'Préparation des images', progress: 0.02 });
    try {
      const spec = await this.spec();
      const r = await api.invoke('android:build', spec);
      this.result = r;
      this.cfg.lastBuild = { at: Date.now(), version: this.cfg.versionName, size: r.apkSize || 0, ok: true };
      this.save();
      this.showResult(r);
      if (this.cfg.outputs.aab) {
        this.set('versionCode', (Number(this.cfg.versionCode) || 1) + 1);
        this.addLog(`Numéro de version porté à ${this.cfg.versionCode} pour le prochain envoi au Play Store.`);
      }
      this.refreshKey();
      return r;
    } catch (e) {
      $('.ab-progress', this.el).hidden = true;
      this.openLog();
      throw e;
    } finally {
      this.building = false;
      go.disabled = false;
    }
  }

  setStep(s) {
    const box = $('.ab-progress', this.el);
    box.hidden = false;
    $('i', box).style.width = `${Math.round((s.progress || 0) * 100)}%`;
    $('.ab-step', box).textContent = s.label;
  }

  addLog(line) {
    this.log.push(line);
    const pre = $('.ab-log pre', this.el);
    if (!pre) return;
    pre.textContent += `${line}\n`;
    pre.scrollTop = pre.scrollHeight;
  }

  openLog() { $('.ab-log', this.el).open = true; }

  showResult(r) {
    $('.ab-progress', this.el).hidden = true;
    const box = $('.ab-result', this.el);
    box.hidden = false;
    box.innerHTML = `
      <div class="ab-res-head">${icon('pass', 18, 'ok')}<b>Application prête</b></div>
      ${r.apk ? `<div class="ab-file">${icon('android', 15)}<span>${esc(r.apk.split(/[\\/]/).pop())}</span><small>${fmtBytes(r.apkSize)} · signé ${esc((r.schemes || []).join(' + '))}</small></div>` : ''}
      ${r.aab ? `<div class="ab-file">${icon('layers', 15)}<span>${esc(r.aab.split(/[\\/]/).pop())}</span><small>${fmtBytes(r.aabSize)}</small></div>` : ''}
      ${r.optimize ? `<small class="ab-hint">Optimisé : ${[r.optimize.viewport.length ? 'viewport' : '', r.optimize.fonts ? `${r.optimize.fonts} police(s) intégrée(s)` : '', r.optimize.images ? `${r.optimize.images} image(s) réduite(s), ${fmtBytes(r.optimize.imageBytes)} gagnés` : ''].filter(Boolean).join(' · ') || 'rien à changer'}</small>` : ''}
      <div class="ab-row"><button class="btn small" data-act="reveal">${icon('folderOpen', 14)}<span>Afficher</span></button><button class="btn small" data-act="devices">${icon('usb', 14)}<span>Installer sur un téléphone</span></button></div>`;
  }

  // ------------------------------------------------------------------ aperçus
  async updateIconPreviews() {
    const box = $('.ab-icon-prevs', this.el);
    const token = (this.iconToken = (this.iconToken || 0) + 1);
    const p = await previews(this.cfg);
    if (token !== this.iconToken) return;
    this.iconPrev = p;
    if (box) {
      box.innerHTML = `
        <figure><img src="${p.squircle}" alt=""><figcaption>Pixel</figcaption></figure>
        <figure><img src="${p.circle}" alt=""><figcaption>Rond</figcaption></figure>
        <figure><img src="${p.rounded}" alt=""><figcaption>Samsung</figcaption></figure>
        <figure><img src="${p.mono}" alt=""><figcaption>À thème</figcaption></figure>
        ${this.cfg.tv ? `<figure class="wide"><img src="${p.banner}" alt=""><figcaption>Bannière TV</figcaption></figure>` : ''}`;
    }
    if (this.preview !== 'app') this.renderPreview();
  }

  renderPreview(changedKey) {
    const screen = $('.ab-screen', this.el);
    if (!screen) return;
    if (!this.phoneL) this.layoutPhone();
    for (const b of $$('[data-set="abPrev"]', this.el)) b.classList.toggle('on', b.dataset.val === this.preview);
    const c = this.cfg;
    const cc = c.config;
    const splashBg = c.splash.bg || c.icon.bg;
    if (this.preview === 'splash') {
      this.dropWebview();
      screen.style.background = splashBg;
      screen.innerHTML = `${statusBar(this.os, splashBg)}${splashHtml(c, this.iconPrev && this.iconPrev.splash)}${this.os === 'android' ? '<div class="ab-gesture"></div>' : '<div class="ab-homebar"></div>'}`;
      playIntro(screen);
      if (!this.iconPrev) this.updateIconPreviews();
      return;
    }
    if (this.preview === 'home') {
      this.dropWebview();
      screen.style.background = '';
      screen.innerHTML = `<div class="ab-wall ${this.os}" style="background-image:url('${this.wallFor(this.os)}')"></div>${statusBar(this.os, 'transparent', { forceLight: true })}${homeHtml(this.os, { icon: this.iconPrev && this.iconPrev.circle, iosIcon: this.iconPrev && this.iconPrev.ios, name: (c.engine === 'twa' && c.twa.launcherName) || c.appName })}${this.os === 'ios' ? '<div class="ab-homebar light"></div>' : '<div class="ab-gesture dark"></div>'}`;
      const me = $('[data-launch]', screen);
      if (me) me.addEventListener('click', () => this.act_launch_sim());
      if (!this.iconPrev) this.updateIconPreviews();
      return;
    }
    // Application
    screen.style.background = cc.bgColor || '#fff';
    const statusColor = cc.statusMode === 'color' ? cc.statusColor : cc.statusMode === 'overlay' ? 'transparent' : (this.autoTop || cc.statusColor || '#fff');
    let wrap = $('.ab-app', screen);
    if (!wrap) {
      screen.innerHTML = `<div class="ab-app"><div class="ab-sb-slot"></div><div class="ab-content"><div class="ab-wv-box"></div><div class="ab-overlay"></div></div><div class="ab-tabs-slot"></div><div class="ab-gesture"></div></div>`;
      wrap = $('.ab-app', screen);
    }
    $('.ab-sb-slot', wrap).innerHTML = cc.fullscreen ? '' : statusBar(this.os, statusColor);
    wrap.dataset.os = this.os;
    $('.ab-sb-slot', wrap).classList.toggle('overlay', cc.statusMode === 'overlay');
    const twaMode = c.engine === 'twa' && c.source.kind === 'url';
    const active = cc.tabActive || c.accent;
    $('.ab-tabs-slot', wrap).innerHTML = cc.tabs.length && !twaMode ? `<div class="ab-tabs" style="background:${cc.tabBg}">${cc.tabs.map((t, i) => `<span style="color:${i === 0 ? active : cc.tabInactive}">${this.svgTab(t.icon, 20, i === 0 ? active : cc.tabInactive)}<small>${esc(t.label)}</small></span>`).join('')}</div>` : '';
    const navBg = cc.tabs.length ? cc.tabBg : (cc.navMode === 'color' ? cc.navColor : (this.autoBottom || cc.bgColor || '#fff'));
    $('.ab-gesture', wrap).style.background = cc.fullscreen || this.os === 'ios' ? 'transparent' : navBg;
    $('.ab-gesture', wrap).classList.toggle('dark', !isLightHex(navBg));
    const fab = cc.fab.enabled && !twaMode ? `<span class="ab-fab ${cc.fab.position === 'left' ? 'left' : ''}" style="background:${cc.fab.color || c.accent}">${this.svgTab(cc.fab.icon, 22, isLightHex(cc.fab.color || c.accent) ? '#1d1d1f' : '#fff')}</span>` : '';
    const loader = cc.loader === 'spinner' ? '' : cc.loader === 'bar' ? `<span class="ab-loadbar" style="background:${c.accent}"></span>` : '';
    const menu = this.section === 'nav' && cc.menu.enabled ? `<div class="ab-drawer"><div style="background:${cc.menu.bg || cc.bgColor}"><b>${esc(cc.menu.title || c.appName)}</b>${cc.menu.items.map((it) => `<span>${this.svgTab(it.icon, 18, c.accent)}<em>${esc(it.label)}</em></span>`).join('')}</div></div>` : '';
    const onb = this.section === 'screens' && cc.onboarding.enabled && cc.onboarding.slides.length ? this.onbHtml(cc.onboarding.slides[0], c) : '';
    const modal = this.section === 'screens' && !onb && cc.modal.enabled ? `<div class="ab-modal-prev"><div>${cc.modal.image ? `<img src="${cc.modal.image}" alt="">` : ''}<b>${esc(cc.modal.title)}</b><p>${esc(cc.modal.text)}</p><span style="color:${c.accent}">${esc(cc.modal.button)}</span></div></div>` : '';
    const offline = this.section === 'screens' && !onb && !modal && cc.offlinePage ? `<div class="ab-offline" style="background:${cc.bgColor}"><b>${esc(cc.offlineTitle)}</b><p>${esc(cc.offlineText)}</p><span style="background:${c.accent}">${esc(cc.offlineButton)}</span></div>` : '';
    const pt = c.push.test || {};
    const notif = this.section === 'push' && c.push.enabled ? `<div class="ab-notif ${this.os}"><img src="${(this.iconPrev && (this.os === 'ios' ? this.iconPrev.ios : this.iconPrev.circle)) || ''}" alt=""><div><span><b>${esc(c.appName || 'Mon app')}</b><em>maintenant</em></span><strong>${esc(pt.title || 'Titre de la notification')}</strong><p>${esc(pt.body || '')}</p></div>${pt.image ? `<i style="background-image:url('${esc(pt.image)}')"></i>` : ''}</div>` : '';
    $('.ab-overlay', wrap).innerHTML = loader + fab + menu + onb + modal + offline + notif;
    this.ensureWebview(changedKey);
  }

  onbHtml(s, c) {
    return `<div class="ab-onb" style="background:${c.config.onboarding.bg || c.config.bgColor}"><div class="ab-onb-img">${s.image ? `<img src="${s.image}" alt="">` : (this.iconPrev ? `<img src="${this.iconPrev.splash}" alt="">` : '')}</div><b>${esc(s.title || 'Titre')}</b><p>${esc(s.text || '')}</p><span style="background:${c.accent}">${esc(c.config.onboarding.slides.length > 1 ? c.config.onboarding.next : c.config.onboarding.button)}</span></div>`;
  }

  statusBarHtml(bg, forceLight = false) {
    const light = forceLight || (bg !== 'transparent' && !isLightHex(bg));
    return `<div class="ab-statusbar ${light ? 'light' : ''}" style="background:${bg}"><span>9:41</span><i class="ab-cam"></i><span class="ab-sys"><svg width="15" height="11" viewBox="0 0 15 11"><path d="M1 10h2V7H1zM5 10h2V5H5zM9 10h2V3H9zM13 10h2V1h-2z" fill="currentColor"/></svg><svg width="22" height="11" viewBox="0 0 22 11"><rect x=".5" y=".5" width="18" height="10" rx="2.5" fill="none" stroke="currentColor" opacity=".5"/><rect x="2" y="2" width="13" height="7" rx="1.2" fill="currentColor"/><rect x="19.5" y="3.5" width="1.6" height="4" rx=".8" fill="currentColor" opacity=".5"/></svg></span></div>`;
  }

  dropWebview() {
    if (this.wv) { this.wv.remove(); this.wv = null; this.wvUrl = null; }
  }

  ensureWebview() {
    const box = $('.ab-wv-box', this.el);
    if (!box) return;
    const c = this.cfg;
    const url = c.source.kind === 'url' ? c.source.url : (S.server && S.server.url && S.source && S.source.dir === c.source.dir ? S.server.url : '');
    if (!url || !/^https?:/.test(url)) {
      this.dropWebview();
      box.innerHTML = `<div class="ab-wv-empty">${icon(c.source.kind === 'url' ? 'globe' : 'folder', 28)}<p>${c.source.kind === 'url' ? 'Indique l’adresse du site pour l’aperçu.' : 'Les fichiers seront intégrés à l’application. Pour un aperçu en direct, lance le projet dans le Responsive Lab.'}</p></div>`;
      return;
    }
    if (this.wv && this.wvUrl === url && box.contains(this.wv)) { this.fitWebview(); return; }
    box.innerHTML = '';
    const wv = document.createElement('webview');
    wv.setAttribute('partition', 'persist:vitrine');
    const ua = uaFor({ os: 'android' });
    wv.setAttribute('useragent', ua.ua);
    wv.src = url;
    this.wv = wv;
    this.wvUrl = url;
    box.append(wv);
    const sample = () => {
      // Couleurs du haut et du bas de la page, comme le fait l'application pour ses barres système.
      if (!wv.isConnected || this.wv !== wv) return;
      try { wv.getWebContentsId(); } catch { return; }
      wv.executeJavaScript(`(() => {
        const theme = () => { const ms = document.querySelectorAll('meta[name="theme-color"]'); let g = ''; for (const m of ms) { const md = m.getAttribute('media'); const ct = (m.getAttribute('content') || '').trim(); if (!ct) continue; if (!md) { if (!g) g = ct; continue; } try { if (matchMedia(md).matches) return ct; } catch (e) {} } return g; };
        const colorOf = (e) => { const s = getComputedStyle(e); const c = s.backgroundColor; if (c && !/rgba\\(0,\\s*0,\\s*0,\\s*0\\)|transparent/.test(c)) return c; const bi = s.backgroundImage; if (bi && bi !== 'none') { const m = bi.match(/rgba?\\([^)]*\\)|#[0-9a-fA-F]{3,8}/); if (m) return m[0]; } return ''; };
        const pick = (y) => { let e = document.elementFromPoint(innerWidth / 2, y); while (e) { const c = colorOf(e); if (c) return c; e = e.parentElement; } return (document.body && colorOf(document.body)) || colorOf(document.documentElement) || theme() || '#ffffff'; };
        return [pick(1), pick(innerHeight - 2)];
      })()`).then(([top, bottom]) => {
        const hex = (c) => {
          if (!c) return null;
          if (c[0] === '#') { let h = c.slice(1); if (h.length === 3) h = h.split('').map((x) => x + x).join(''); return `#${h.slice(0, 6).toLowerCase()}`; }
          const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(c);
          return m && (m[4] == null || Number(m[4]) > 0.5) ? `#${[m[1], m[2], m[3]].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}` : null;
        };
        const t = hex(top);
        const b = hex(bottom);
        if (t !== this.autoTop || b !== this.autoBottom) {
          this.autoTop = t;
          this.autoBottom = b;
          if (this.preview === 'app') this.renderPreview();
        }
      }).catch(() => {});
    };
    wv.addEventListener('did-finish-load', () => setTimeout(sample, 300));
    wv.addEventListener('did-navigate-in-page', () => setTimeout(sample, 300));
    wv.addEventListener('dom-ready', () => {
      const wcId = wv.getWebContentsId();
      if (this.wvId === wcId) return;
      this.wvId = wcId;
      this.fitWebview();
    });
    this.fitWebview();
  }

  fitWebview() {
    const wv = this.wv;
    if (!wv) return;
    const box = wv.parentElement;
    // L'écran de l'aperçu a déjà la taille réelle de l'appareil : la page s'affiche à 100 %, sans réduction.
    const W = Math.max(240, Math.round(box.clientWidth));
    const H = Math.max(320, Math.round(box.clientHeight));
    wv.style.width = `${W}px`;
    wv.style.height = `${H}px`;
    wv.style.transform = 'none';
    if (this.wvId) {
      const ua = uaFor({ os: this.os === 'ios' ? 'ios' : 'android' });
      const L = this.phoneL;
      api.invoke('device:emulate', {
        wcId: this.wvId,
        emu: {
          width: W, height: H, screenWidth: L ? L.W : W, screenHeight: L ? L.H : H + 80, dpr: L ? L.dpr : 3, mobile: true, touch: true, ua: `${ua.ua} NexoraApp/1.0${this.cfg.config.uaSuffix ? ` ${this.cfg.config.uaSuffix}` : ''}`, uaMeta: ua.uaMeta, scale: 1,
        },
        env: settings.env,
      }).catch(() => {});
    }
  }

  pause() { /* rien à suspendre */ }
}

export async function openAndroid(el) {
  if (!S.android) {
    S.android = new AppBuilder(el);
    S.android.autotest = (ctx) => autotest(S.android, ctx);
  } else S.android.renderPreview();
  return S.android;
}

// ------------------------------------------------------------------ test automatique
async function autotest(ab, { log, snap, sleep, url }) {
  ab.set('source.kind', 'url', { rerender: true });
  ab.set('source.url', 'http://127.0.0.1:4599/');
  ab.set('appName', 'Boutique Test');
  ab.set('appId', 'com.nexora.boutiquetest');
  ab.set('icon.bg', '#101828');
  ab.set('icon.gradient', true);
  ab.set('icon.bg2', '#7C3AED');
  ab.set('accent', '#7C3AED');
  ab.set('config.tabs', [{ label: 'Accueil', icon: 'home', url: '/' }, { label: 'Panier', icon: 'cart', url: '/cart' }, { label: 'Compte', icon: 'user', url: '/me' }]);
  ab.set('config.fab', { ...ab.cfg.config.fab, enabled: true, action: 'whatsapp', value: '+22900000000' });
  ab.set('config.scanner', true);
  ab.set('splash.showName', true);
  ab.set('splash.tagline', 'Le marché dans ta poche');
  // Inspection PWA d'un site avec manifest et service worker.
  if (url) {
    ab.section = 'pwa';
    ab.renderNav();
    ab.renderForm();
    ab.set('source.url', url.replace(/index\.html$/, 'pwa.html'), { rerender: true });
    try {
      await ab.act_pwa_inspect();
      const r = ab.cfg.pwa.report;
      log(`pwa manifest=${Boolean(r.manifest)} tests=${r.tests.filter((t) => t.ok).length}/${r.tests.length} sw=${r.sw.registered} controlling=${r.sw.controlling} offline=${r.sw.offline} https=${r.security.https} installable=${r.installable}`);
      await sleep(300);
      await snap('60-ab-pwa');
      await ab.act_pwa_apply();
      log(`pwa appliqué : nom=${ab.cfg.appName} couleur=${ab.cfg.twa.themeColor} raccourcis=${ab.cfg.shortcuts.length} partage=${Boolean(ab.cfg.twa.shareTarget)} icône=${Boolean(ab.cfg.icon.image)}`);
    } catch (e) { log(`pwa FAIL ${e.message}`); }
  }
  for (const s of ['source', 'identity', 'icon', 'look', 'nav', 'links', 'native', 'screens', 'advanced', 'publish']) {
    ab.section = s;
    ab.renderNav();
    ab.renderForm();
    ab.renderPreview();
    await sleep(s === 'source' ? 2500 : 400);
    await snap(`61-ab-${s}`);
  }
  for (const intro of ['shine', 'glow', 'bounce']) {
    ab.set('splash.intro', intro);
    ab.preview = 'splash';
    ab.renderPreview();
    await sleep(intro === 'bounce' ? 1200 : 700);
    await snap(`62-ab-splash-${intro}`);
  }
  for (const os of ['android', 'ios']) {
    ab.os = os;
    document.querySelector('.ab-phone').dataset.os = os;
    ab.preview = 'home';
    ab.renderPreview();
    await sleep(700);
    await snap(`62-ab-home-${os}`);
    const sim = ab.act_launch_sim();
    await sleep(380);
    await snap(`62-ab-launch-${os}-a`);
    await sleep(900);
    await snap(`62-ab-launch-${os}-b`);
    await sim;
    await sleep(500);
    await snap(`62-ab-launch-${os}-c`);
  }
  ab.os = 'android';
  document.querySelector('.ab-phone').dataset.os = 'android';
  ab.preview = 'app';
  ab.renderPreview();
  const tools = await api.invoke('android:tools');
  log(`android tools ready=${tools.ready} missing=${(tools.missing || []).join(',')}`);
  if (tools.ready) {
    ab.tools = tools;
    ab.cfg.outputs = { apk: true, aab: true };
    try {
      const t0 = performance.now();
      const r = await ab.build();
      log(`android build ok apk=${r.apkSize} aab=${r.aabSize} schemes=${(r.schemes || []).join('+')} en ${Math.round(performance.now() - t0)} ms (paquets ${r.timings && r.timings.packaging} ms)`);
      const t1 = performance.now();
      const r2 = await ab.build();
      log(`android rebuild en ${Math.round(performance.now() - t1)} ms`);
      void r2;
    } catch (e) { log(`android build FAIL ${e.message}`); }
    // Mode Trusted Web Activity.
    ab.set('engine', 'twa');
    ab.set('source.url', 'https://www.example.com/');
    ab.section = 'twa';
    ab.renderNav();
    ab.renderForm();
    await sleep(300);
    await snap('63-ab-twa');
    try {
      const r = await ab.build();
      log(`android twa ok apk=${r.apkSize} files=${r.files.map((f) => f.split(/[\\/]/).pop()).join(',')}`);
    } catch (e) { log(`android twa FAIL ${e.message}`); }
    await sleep(400);
    await snap('63-ab-built');
    ab.set('engine', 'webview');
  }
}
