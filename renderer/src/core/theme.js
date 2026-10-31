/* Thème clair / sombre et couleur d'accentuation. */
import { api } from './api.js';
import { settings } from './settings.js';
import { bus } from './dom.js';

export const ACCENTS = {
  nexora: ['#6a4cff', '#8f7cff', 'NEXORA'],
  blue: ['#007aff', '#0a84ff', 'Bleu'],
  purple: ['#af52de', '#bf5af2', 'Violet'],
  pink: ['#ff2d55', '#ff375f', 'Rose'],
  orange: ['#ff9500', '#ff9f0a', 'Orange'],
  green: ['#28a745', '#30d158', 'Vert'],
  graphite: ['#8e8e93', '#98989d', 'Graphite'],
  indigo: ['#5856d6', '#5e5ce6', 'Indigo'],
  teal: ['#0f9fb5', '#40c8e0', 'Bleu canard'],
  mint: ['#00a896', '#63e6be', 'Menthe'],
  red: ['#e5302a', '#ff453a', 'Rouge'],
  yellow: ['#d4a000', '#ffd60a', 'Jaune'],
  brown: ['#a2845e', '#ac8e68', 'Brun'],
};

export const UI_DEFAULTS = {
  density: 'normal', scale: 1, radius: 'normal', glass: 'normal', motion: 'normal', font: 'inter', stage: 'default', accentCustom: '#007aff', contrast: false, labels: true,
};

const FONTS = {
  inter: "'Inter', -apple-system, 'SF Pro Text', 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif",
  system: "-apple-system, 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif",
  rounded: "ui-rounded, 'SF Pro Rounded', 'Nunito', 'Segoe UI', system-ui, sans-serif",
  serif: "'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
  mono: "'Cascadia Code', 'SF Mono', Consolas, monospace",
};

const STAGES = {
  default: null,
  plain: ['var(--window)', 'var(--window)'],
  cool: ['#eef3fb', '#dfe7f5', '#1b2230', '#121722'],
  warm: ['#fbf4ec', '#efe3d4', '#2a221b', '#1c1712'],
  mint: ['#eef8f4', '#dcefe7', '#18251f', '#101914'],
  dusk: ['#f2eefb', '#e2dbf3', '#211c2d', '#16121f'],
  dark: ['#2a2a2e', '#18181b', '#2a2a2e', '#111113'],
};

// Réglages de l'interface : densité, taille, arrondis, transparence, animations, police, fond de la scène.
export function applyUi() {
  const u = { ...UI_DEFAULTS, ...(settings.ui || {}) };
  const root = document.documentElement;
  root.dataset.density = u.density;
  root.dataset.radius = u.radius;
  root.dataset.glass = u.glass;
  root.dataset.motion = u.motion;
  root.dataset.contrast = u.contrast ? 'high' : 'normal';
  root.dataset.labels = u.labels ? 'on' : 'off';
  root.style.setProperty('--font', FONTS[u.font] || FONTS.inter);
  const st = STAGES[u.stage];
  if (st) {
    const dark = isDark();
    root.style.setProperty('--stage-a', dark ? (st[2] || st[0]) : st[0]);
    root.style.setProperty('--stage-b', dark ? (st[3] || st[1]) : st[1]);
  } else { root.style.removeProperty('--stage-a'); root.style.removeProperty('--stage-b'); }
  if (applyUi.lastZoom !== u.scale) { applyUi.lastZoom = u.scale; Promise.resolve().then(() => api.invoke('window:zoom', u.scale)).catch(() => {}); }
}

const darkMql = window.matchMedia('(prefers-color-scheme: dark)');
export const isDark = () => settings.appTheme === 'dark' || (settings.appTheme === 'system' && darkMql.matches);
export const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0a84ff';

export function applyTheme() {
  const dark = isDark();
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const custom = settings.accent === 'custom' && settings.ui && settings.ui.accentCustom;
  const acc = ACCENTS[settings.accent] || ACCENTS.blue;
  document.documentElement.style.setProperty('--accent', custom || (dark ? acc[1] : acc[0]));
  applyUi();
  // Mode léger (petits PC) : effets de flou, animations et rendu haute définition réduits.
  document.body.classList.toggle('lite', Boolean(settings.lite));
  api.invoke('window:titlebar', { color: dark ? '#0d0e11' : '#e9ebf2', symbolColor: dark ? '#f5f5f7' : '#1d1d1f' });
  bus.emit('theme');
}
darkMql.addEventListener('change', () => { if (settings.appTheme === 'system') applyTheme(); });
