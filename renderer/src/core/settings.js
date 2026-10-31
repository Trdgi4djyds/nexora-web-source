/* Réglages enregistrés (dossier de données de l'application). */
import { api } from './api.js';
import { DEFAULT_DEVICE } from '../devices/catalog.js';

export const DEFAULT_ENV = {
  pageTheme: 'system', network: 'none', cpu: 1, reducedMotion: false,
};

export const DEFAULTS = {
  appTheme: 'light',
  accent: 'nexora',
  mode: 'preview', // preview | studio | android
  layout: 'single', // single | multi
  boardScale: 'real', // real | height
  devices: [{ uid: 'main', deviceId: DEFAULT_DEVICE, state: null, land: false, color: null }],
  focused: 'main',
  sync: { nav: true, scroll: true, clicks: true, input: true },
  custom: [],
  recent: [],
  collapsed: {},
  env: { ...DEFAULT_ENV },
  framesOn: true,
  statusBar: true,
  dragScroll: true,
  showTouches: true,
  displayHD: true,
  zoom: 'fit',
  sidebar: true,
  inspector: false,
  inspectorTab: 'infos',
  consoleTab: 'page',
  codeTab: 'files',
  photo: { kind: 'mockup', format: 'png', scale: 'native', bg: 'transparent', saveAs: false, pdfPages: 'a4' },
  video: { framed: true, bg: 'light', fps: 30, size: '1080', format: 'mp4' },
  captureDir: null,
  android: null,
  panels: {},
  officialFrames: true,
  browserLab: null,
  devLab: null,
};

export const settings = { ...DEFAULTS };
let timer = null;

export async function loadSettings() {
  const saved = (await api.invoke('settings:load')) || {};
  Object.assign(settings, DEFAULTS, saved);
  settings.env = { ...DEFAULT_ENV, ...(saved.env || {}) };
  settings.sync = { ...DEFAULTS.sync, ...(saved.sync || {}) };
  // Interface 2 (NEXORA) : l'accent bleu d'origine, jamais choisi, passe à la couleur de la marque.
  if (!saved.uiV2) { if (!saved.accent || saved.accent === 'blue') settings.accent = 'nexora'; settings.uiV2 = true; }
  settings.photo = { ...DEFAULTS.photo, ...(saved.photo || {}) };
  settings.video = { ...DEFAULTS.video, ...(saved.video || {}) };
  // Réglages de la version 2 : un seul appareil (deviceId, states, orient).
  if (!Array.isArray(saved.devices) || !saved.devices.length) {
    const id = saved.deviceId || DEFAULT_DEVICE;
    settings.devices = [{
      uid: 'main', deviceId: id, state: saved.states ? saved.states[id] || null : null, land: saved.orient ? saved.orient[id] === 'landscape' : false, color: null,
    }];
    settings.focused = 'main';
  }
  if (!settings.devices.some((d) => d.uid === settings.focused)) settings.focused = settings.devices[0].uid;
  // Récents : formats précédents, entrées invalides et doublons.
  const seen = new Set();
  settings.recent = (Array.isArray(saved.recent) ? saved.recent : []).map((r) => ({ ...r, dir: r.dir || r.path })).filter((r) => {
    const key = r.dir || r.url;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!['preview', 'browser', 'dev', 'studio', 'android', 'design', 'security', 'home'].includes(settings.mode)) settings.mode = 'preview';
  return settings;
}

// Abonnés prévenus à chaque enregistrement (synchronisation NEXORA Cloud).
export const persistHooks = [];

export function persist() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    api.invoke('settings:save', settings);
    for (const f of persistHooks) { try { f(settings); } catch (e) { console.warn('[persist]', e); } }
  }, 300);
}
