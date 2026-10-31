/* Aperçu de l'App Builder : téléphone iPhone ou Android, écran d'accueil, écran de démarrage animé et
 * simulation du lancement (appui sur l'icône, ouverture, démarrage, application). */
import { esc } from '../core/dom.js';

export const SPLASH_INTROS = {
  none: 'Aucune', pop: 'Apparition élastique', fadeUp: 'Montée en fondu', zoomOut: 'Zoom arrière', spin: 'Rotation', flip: 'Retournement 3D', bounce: 'Chute et rebond', swing: 'Balancier',
  pulse: 'Pulsation (boucle)', heartbeat: 'Battement de cœur (boucle)', shine: 'Reflet lumineux (boucle)', glow: 'Halo lumineux (boucle)', typewriter: 'Nom tapé à la machine', blurIn: 'Mise au point',
};
export const SPLASH_EXITS = {
  fade: 'Fondu', zoom: 'Zoom et fondu', slideUp: 'Glissement vers le haut', shrink: 'Logo qui rétrécit', reveal: 'Ouverture circulaire', blur: 'Flou et fondu', none: 'Aucune',
};

const light = (hex) => {
  const n = parseInt(String(hex || '#fff').replace('#', '').padEnd(6, 'f').slice(0, 6), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 > 0.6;
};

// Icônes génériques de l'écran d'accueil (pas de marques).
const GLYPH = {
  sun: '<circle cx="12" cy="12" r="4.2" fill="#fff"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>',
  camera: '<rect x="3" y="7" width="18" height="12.5" rx="3" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="13.2" r="3.4" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M8.5 7l1.4-2.3h4.2L15.5 7" stroke="#fff" stroke-width="1.8" fill="none" stroke-linejoin="round"/>',
  notes: '<rect x="5" y="3.5" width="14" height="17" rx="2.5" fill="#fff"/><path d="M8 9h8M8 12.5h8M8 16h5" stroke="#d4a017" stroke-width="1.6" stroke-linecap="round"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="3" fill="#fff"/><path d="M3.5 9.5h17" stroke="#e5484d" stroke-width="2.4"/><text x="12" y="17.6" font-family="Inter,system-ui" font-weight="700" font-size="7" text-anchor="middle" fill="#1d1d1f">25</text>',
  music: '<path d="M9 17.5V6.5l10-2v11" stroke="#fff" stroke-width="1.8" fill="none" stroke-linejoin="round"/><circle cx="7" cy="17.5" r="2.3" fill="#fff"/><circle cx="17" cy="15.5" r="2.3" fill="#fff"/>',
  map: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" fill="#fff"/><circle cx="12" cy="10" r="2.4" fill="#2f9e6a"/>',
  gear: '<circle cx="12" cy="12" r="3" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M5.6 18.4l1.7-1.7M16.7 7.3l1.7-1.7" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
  phone: '<path d="M7.2 3.5l2.6.3 1.3 4-1.9 1.4a10.6 10.6 0 0 0 5.6 5.6l1.4-1.9 4 1.3.3 2.6c0 1.2-1 2.2-2.2 2.2A15.6 15.6 0 0 1 5 5.7c0-1.2 1-2.2 2.2-2.2z" fill="#fff"/>',
  chat: '<path d="M12 4c4.7 0 8.5 3 8.5 6.8S16.7 17.6 12 17.6c-.9 0-1.8-.1-2.6-.3L5 19.5l1.3-3.6C4.5 14.7 3.5 12.9 3.5 10.8 3.5 7 7.3 4 12 4z" fill="#fff"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2.5" fill="#fff"/><path d="M3.8 7l8.2 6 8.2-6" stroke="#1f6feb" stroke-width="1.7" fill="none" stroke-linejoin="round"/>',
  photos: '<g transform="translate(12 12)"><ellipse rx="3.2" ry="7" fill="#ffb02e" opacity=".9"/><ellipse rx="3.2" ry="7" fill="#e5484d" opacity=".85" transform="rotate(60)"/><ellipse rx="3.2" ry="7" fill="#3d9df6" opacity=".85" transform="rotate(120)"/></g>',
  store: '<path d="M6 8h12l-1 11.5H7L6 8z" fill="#fff"/><path d="M9 8V6.8a3 3 0 0 1 6 0V8" stroke="#fff" stroke-width="1.7" fill="none"/>',
  clock: '<circle cx="12" cy="12" r="8" fill="#fff"/><path d="M12 7.5V12l3 2" stroke="#1d1d1f" stroke-width="1.7" stroke-linecap="round" fill="none"/>',
  files: '<path d="M4 7.5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="#fff"/>',
};
const APPS = [
  ['Météo', 'sun', '#4aa3ff', '#1f6fd6'], ['Caméra', 'camera', '#6b7280', '#374151'], ['Notes', 'notes', '#ffd75e', '#f0b429'], ['Agenda', 'calendar', '#ffffff', '#f1f1f4'],
  ['Musique', 'music', '#ff5e7a', '#e0245e'], ['Plans', 'map', '#53d18b', '#2f9e6a'], ['Réglages', 'gear', '#9ca3af', '#4b5563'], ['Photos', 'photos', '#ffffff', '#f1f1f4'],
  ['Horloge', 'clock', '#1f2937', '#0b1220'], ['Fichiers', 'files', '#5aa9ff', '#2563eb'], ['Boutique', 'store', '#a78bfa', '#7c3aed'],
];
const DOCK = [['Téléphone', 'phone', '#4ade80', '#16a34a'], ['Messages', 'chat', '#4ade80', '#16a34a'], ['Mail', 'mail', '#60a5fa', '#2563eb']];

function appIcon([name, g, a, b], os) {
  return `<span class="ab-hi"><i class="ab-gl ${os}" style="background:linear-gradient(160deg,${a},${b})"><svg viewBox="0 0 24 24" width="62%" height="62%">${GLYPH[g]}</svg></i><small>${esc(name)}</small></span>`;
}

/** Barre d'état : iOS (île dynamique) ou Android (poinçon). */
export function statusBar(os, bg, { forceLight = false } = {}) {
  const dark = forceLight || (bg !== 'transparent' && !light(bg));
  const sys = `<span class="ab-sys"><svg width="16" height="11" viewBox="0 0 16 11"><path d="M1 10h2V7H1zM5 10h2V5H5zM9 10h2V3H9zM13 10h2V1h-2z" fill="currentColor"/></svg>${os === 'ios' ? '<svg width="15" height="11" viewBox="0 0 15 11"><path d="M7.5 2.3a8 8 0 0 1 6 2.6l-1.2 1.2a6.3 6.3 0 0 0-9.6 0L1.5 4.9a8 8 0 0 1 6-2.6zm0 3.3a4.6 4.6 0 0 1 3.4 1.5L9.7 8.3a3 3 0 0 0-4.4 0L4.1 7.1a4.6 4.6 0 0 1 3.4-1.5zm0 3.2l1.2 1.2-1.2 1.2-1.2-1.2z" fill="currentColor"/></svg>' : ''}<svg width="24" height="11" viewBox="0 0 24 11"><rect x=".5" y=".5" width="20" height="10" rx="3" fill="none" stroke="currentColor" opacity=".45"/><rect x="2" y="2" width="15" height="7" rx="1.6" fill="currentColor"/><rect x="21.5" y="3.5" width="1.8" height="4" rx=".9" fill="currentColor" opacity=".45"/></svg></span>`;
  if (os === 'ios') return `<div class="ab-statusbar ios ${dark ? 'light' : ''}" style="background:${bg}"><span class="ab-time">9:41</span><span class="ab-cut"></span>${sys}</div>`;
  return `<div class="ab-statusbar android ${dark ? 'light' : ''}" style="background:${bg}"><span class="ab-time">12:30</span><span class="ab-cut"></span>${sys.replace('<span class="ab-sys">', '<span class="ab-sys"><svg width="14" height="12" viewBox="0 0 14 12"><path d="M7 11.5 0.3 3.4A10.6 10.6 0 0 1 13.7 3.4z" fill="currentColor"/></svg>')}</div>`;
}

/** Écran d'accueil du téléphone, avec l'icône de l'application. */
export function homeHtml(os, { icon, iosIcon, name }) {
  const me = `<span class="ab-hi me" data-launch><img src="${os === 'ios' ? (iosIcon || icon || '') : (icon || '')}" alt=""><small>${esc(name || 'Mon app')}</small></span>`;
  if (os === 'ios') {
    const grid = APPS.slice(0, 11).map((a) => appIcon(a, 'ios')).join('') + me;
    return `<div class="ab-home ios">
      <div class="ab-widgets"><div class="ab-wdg ab-wdg-weather"><b>Cotonou</b><span>29°</span><small>Ensoleillé</small></div><div class="ab-wdg ab-wdg-cal"><small>SAMEDI</small><b>25</b><span>Aucun événement</span></div></div>
      <div class="ab-icons ios">${grid}</div>
      <div class="ab-dots"><i class="on"></i><i></i></div>
      <div class="ab-dock">${DOCK.map((a) => appIcon(a, 'ios').replace(/<small>.*?<\/small>/, '')).join('')}${appIcon(APPS[1], 'ios').replace(/<small>.*?<\/small>/, '')}</div>
    </div>`;
  }
  const grid = APPS.slice(0, 7).map((a) => appIcon(a, 'android')).join('') + me;
  return `<div class="ab-home android">
    <div class="ab-glance"><b>sam. 25 oct.</b><span>☀ 29 °C</span></div>
    <div class="ab-icons android">${grid}</div>
    <div class="ab-dock android">${DOCK.map((a) => appIcon(a, 'android').replace(/<small>.*?<\/small>/, '')).join('')}${appIcon(APPS[4], 'android').replace(/<small>.*?<\/small>/, '')}</div>
    <div class="ab-gsearch"><svg width="18" height="18" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" fill="none" stroke="#5f6368" stroke-width="2"/><path d="M16 16l4 4" stroke="#5f6368" stroke-width="2" stroke-linecap="round"/></svg><span>Rechercher</span><svg width="16" height="16" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" fill="#5f6368"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4" stroke="#5f6368" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg></div>
  </div>`;
}

/** Écran de démarrage animé (mêmes animations que dans l'application Android). */
export function splashHtml(c, logo) {
  const sp = c.splash;
  const bg = sp.bg || c.icon.bg;
  const fg = sp.textColor || (light(bg) ? '#1d1d1f' : '#ffffff');
  const size = Math.max(64, Math.min(260, Number(sp.logoSize) || 150));
  const name = sp.showName && c.appName ? `<b class="ab-sp-name" style="color:${fg}" data-full="${esc(c.appName)}">${sp.intro === 'typewriter' ? '' : esc(c.appName)}</b>` : '';
  const tag = sp.tagline ? `<small class="ab-sp-tag" style="color:${fg}">${esc(sp.tagline)}</small>` : '';
  return `<div class="ab-sp" data-intro="${esc(sp.intro || 'none')}" data-exit="${esc(sp.anim || 'fade')}" style="background:${bg};--accent:${c.accent};--sz:${size / 3.6}cqw">
    <div class="ab-sp-col"><div class="ab-sp-holder"><i class="ab-sp-halo"></i><span class="ab-sp-logo" style="--logo:url('${logo || ''}')"><img src="${logo || ''}" alt=""></span></div>${name}${tag}</div>
  </div>`;
}

/** Démarre l'animation d'entrée (relance l'animation CSS, machine à écrire). */
export function playIntro(root) {
  const sp = root.querySelector('.ab-sp');
  if (!sp) return;
  sp.classList.remove('play');
  // eslint-disable-next-line no-unused-expressions
  sp.offsetWidth;
  sp.classList.add('play');
  const n = sp.querySelector('.ab-sp-name');
  if (n && sp.dataset.intro === 'typewriter') {
    const full = n.dataset.full || '';
    let i = 0;
    clearInterval(n._tw);
    n.textContent = '';
    setTimeout(() => {
      n._tw = setInterval(() => { i += 1; n.textContent = full.slice(0, i); if (i >= full.length) clearInterval(n._tw); }, 70);
    }, 380);
  }
}

export function playExit(root) {
  const sp = root.querySelector('.ab-sp');
  if (!sp) return Promise.resolve();
  sp.classList.add('exit');
  const d = { none: 0, fade: 280, zoom: 360, slideUp: 440, shrink: 460, reveal: 480, blur: 400 }[sp.dataset.exit] ?? 300;
  return new Promise((r) => setTimeout(r, d));
}

/** Simulation du lancement : l'icône s'ouvre en plein écran (geste iOS ou Android), puis l'écran de démarrage. */
export async function launchSim(screen, iconEl, { os, bg, splash, hold = 1800, onApp }) {
  // Le calque est posé sur le téléphone (et non dans l'écran) : l'application peut s'afficher dessous.
  const host = screen.parentElement;
  const hr = host.getBoundingClientRect();
  const sr = screen.getBoundingClientRect();
  const ir = (iconEl.querySelector('img') || iconEl).getBoundingClientRect();
  const ov = document.createElement('div');
  ov.className = `ab-launch ${os}`;
  ov.style.background = bg;
  host.append(ov);
  const radius = getComputedStyle(screen).borderTopLeftRadius || '0px';
  // Le téléphone est réduit (transform) : les mesures à l'écran sont ramenées à ses unités internes.
  const k = hr.width / (host.offsetWidth || hr.width) || 1;
  const px = (v) => `${v / k}px`;
  const from = {
    left: px(ir.left - hr.left), top: px(ir.top - hr.top), width: px(ir.width), height: px(ir.height), borderRadius: os === 'ios' ? px(ir.width * 0.2237) : px(ir.width * 0.3),
  };
  const to = {
    left: px(sr.left - hr.left), top: px(sr.top - hr.top), width: px(sr.width), height: px(sr.height), borderRadius: radius,
  };
  iconEl.classList.add('pressed');
  await new Promise((r) => setTimeout(r, 140));
  const anim = ov.animate([from, to], { duration: os === 'ios' ? 540 : 430, easing: os === 'ios' ? 'cubic-bezier(.2,.85,.25,1)' : 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' });
  const home = screen.querySelector('.ab-home');
  if (home) home.animate([{ transform: 'scale(1)', filter: 'blur(0)' }, { transform: 'scale(1.06)', filter: 'blur(3px)' }], { duration: 480, fill: 'forwards' });
  await anim.finished;
  iconEl.classList.remove('pressed');
  ov.innerHTML = splash;
  playIntro(ov);
  await new Promise((r) => setTimeout(r, hold));
  if (onApp) await onApp();
  await playExit(ov);
  ov.remove();
}
