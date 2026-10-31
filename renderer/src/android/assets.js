/* Images de l'application Android, dessinées dans un canvas à partir du logo choisi :
 * icônes (anciennes, rondes, adaptatives avec calque monochrome), écran de démarrage, Play Store, bannière TV,
 * images des écrans d'accueil et d'annonce. */
import { loadImage } from '../core/dom.js';

export const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.round(w);
  c.height = Math.round(h);
  return c;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function fillBg(ctx, w, h, o) {
  if (o.bg2 && o.bg2 !== o.bg) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, o.bg);
    g.addColorStop(1, o.bg2);
    ctx.fillStyle = g;
  } else ctx.fillStyle = o.bg;
  ctx.fillRect(0, 0, w, h);
}

const isLight = (hex) => {
  const n = parseInt(String(hex || '#ffffff').replace('#', '').padEnd(6, 'f').slice(0, 6), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 > 0.6;
};

/** Logo seul (image ou initiale), centré dans un carré de côté size. */
function drawLogo(ctx, o, cx, cy, size, { white = false } = {}) {
  if (o.img) {
    const k = Math.min(size / o.img.naturalWidth, size / o.img.naturalHeight);
    const w = o.img.naturalWidth * k;
    const h = o.img.naturalHeight * k;
    if (white) {
      const t = canvas(w, h);
      const tc = t.getContext('2d');
      tc.drawImage(o.img, 0, 0, w, h);
      tc.globalCompositeOperation = 'source-in';
      tc.fillStyle = '#fff';
      tc.fillRect(0, 0, w, h);
      ctx.drawImage(t, cx - w / 2, cy - h / 2);
    } else ctx.drawImage(o.img, cx - w / 2, cy - h / 2, w, h);
    return;
  }
  const letter = (o.letter || o.name || 'A').trim().charAt(0).toUpperCase() || 'A';
  ctx.fillStyle = white ? '#fff' : (o.fg || (isLight(o.bg) ? '#1d1d1f' : '#ffffff'));
  ctx.font = `700 ${Math.round(size * 0.78)}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, cx, cy + size * 0.04);
}

/** Image pleine : couvre la zone en gardant ses proportions. */
function drawCover(ctx, img, x, y, w, h) {
  const k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const iw = img.naturalWidth * k;
  const ih = img.naturalHeight * k;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

const full = (o) => o.fill === 'full' && o.img;

/** Calque avant de l'icône adaptative (108 dp, zone sûre de 66 dp au centre). */
function foreground(o, px) {
  const c = canvas(px, px);
  const ctx = c.getContext('2d');
  if (full(o)) drawCover(ctx, o.img, 0, 0, px, px);
  else drawLogo(ctx, o, px / 2, px / 2, px * (66 / 108) * o.scale);
  return c;
}

function monochrome(o, px) {
  const c = canvas(px, px);
  const ctx = c.getContext('2d');
  if (full(o)) drawLogo(ctx, { ...o, img: null }, px / 2, px / 2, px * (52 / 108), { white: true });
  else drawLogo(ctx, o, px / 2, px / 2, px * (66 / 108) * o.scale, { white: true });
  return c;
}

/** Icône complète (fond + logo) découpée selon une forme. */
export function iconCanvas(o, px, shape = 'squircle') {
  const c = canvas(px, px);
  const ctx = c.getContext('2d');
  ctx.save();
  if (shape === 'circle') { ctx.beginPath(); ctx.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2); ctx.clip(); }
  else if (shape === 'squircle') { rr(ctx, 0, 0, px, px, px * 0.3); ctx.clip(); }
  else if (shape === 'rounded') { rr(ctx, 0, 0, px, px, px * 0.18); ctx.clip(); }
  fillBg(ctx, px, px, o);
  // Le calque avant fait 108 dp pour une icône visible de 72 dp : on l'agrandit d'autant.
  const fg = foreground(o, px * 1.5);
  ctx.drawImage(fg, -px * 0.25, -px * 0.25);
  ctx.restore();
  return c;
}

function splashLogo(o, px) {
  const c = canvas(px, px);
  const ctx = c.getContext('2d');
  const src = o.splashImg ? { ...o, img: o.splashImg, fill: 'logo', scale: 1 } : o;
  if (!o.splashImg && full(o)) {
    rr(ctx, px * 0.12, px * 0.12, px * 0.76, px * 0.76, px * 0.2);
    ctx.save();
    ctx.clip();
    drawCover(ctx, o.img, px * 0.12, px * 0.12, px * 0.76, px * 0.76);
    ctx.restore();
  } else drawLogo(ctx, src, px / 2, px / 2, px * 0.92 * (o.splashImg ? 1 : Math.min(1, o.scale + 0.1)));
  return c;
}

/** Icône de l'écran de démarrage d'Android 12+ : 240 dp, visible dans un cercle de 160 dp. */
function splashIcon(o, px) {
  const c = canvas(px, px);
  const ctx = c.getContext('2d');
  const inner = px * (160 / 240);
  if (!o.splashImg && full(o)) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(px / 2, px / 2, inner / 2, 0, Math.PI * 2);
    ctx.clip();
    drawCover(ctx, o.img, (px - inner) / 2, (px - inner) / 2, inner, inner);
    ctx.restore();
  } else drawLogo(ctx, o.splashImg ? { ...o, img: o.splashImg } : o, px / 2, px / 2, inner * 0.7);
  return c;
}

function banner(o, w, h) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  fillBg(ctx, w, h, o);
  const s = h * 0.56;
  if (full(o)) {
    ctx.save();
    rr(ctx, h * 0.22, (h - s) / 2, s, s, s * 0.22);
    ctx.clip();
    drawCover(ctx, o.img, h * 0.22, (h - s) / 2, s, s);
    ctx.restore();
  } else drawLogo(ctx, o, h * 0.22 + s / 2, h / 2, s);
  ctx.fillStyle = isLight(o.bg) ? '#1d1d1f' : '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let size = h * 0.17;
  ctx.font = `700 ${size}px Inter, system-ui, sans-serif`;
  const x = h * 0.22 + s + h * 0.14;
  const max = w - x - h * 0.12;
  while (ctx.measureText(o.name || '').width > max && size > h * 0.08) {
    size -= 1;
    ctx.font = `700 ${size}px Inter, system-ui, sans-serif`;
  }
  ctx.fillText(o.name || '', x, h / 2);
  return c;
}

async function png(c) {
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}
async function webp(c, q = 0.9) {
  const blob = await new Promise((r) => c.toBlob(r, 'image/webp', q));
  return new Uint8Array(await blob.arrayBuffer());
}

/** Image d'écran (accueil, annonce) réduite à maxW de large. */
async function photo(dataUrl, maxW = 1080) {
  const img = await loadImage(dataUrl);
  const k = Math.min(1, maxW / img.naturalWidth);
  const c = canvas(img.naturalWidth * k, img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return webp(c, 0.88);
}

// Logo par défaut d'une application qui n'en a pas encore (avant reconnaissance du site ou import) : NEXORA.
// Taper une initiale dans « Icône et démarrage » remplace ce logo par une lettre.
export const DEFAULT_LOGO = 'logo.png';
let defaultLogo = null;
async function defaultLogoImage() {
  if (!defaultLogo) defaultLogo = loadImage(DEFAULT_LOGO).catch(() => null);
  return defaultLogo;
}

export async function iconOptions(cfg) {
  const ic = cfg.icon || {};
  return {
    img: ic.image ? await loadImage(ic.image).catch(() => null) : (ic.letter ? null : await defaultLogoImage()),
    splashImg: cfg.splash && cfg.splash.image ? await loadImage(cfg.splash.image).catch(() => null) : null,
    bg: ic.bg || '#FFFFFF',
    bg2: ic.gradient ? ic.bg2 : null,
    fg: ic.fg || null,
    scale: Number(ic.scale) || 1,
    fill: ic.fill || 'logo',
    name: cfg.appName || '',
    letter: ic.letter || '',
  };
}

/** Toutes les images à intégrer : { 'mipmap-xxhdpi/ic_launcher.png': Uint8Array, ... }.
 * Les images sont dessinées en parallèle et gardées en mémoire tant que l'icône et les écrans ne changent pas. */
const imageCache = new Map();
export async function generateImages(cfg) {
  const key = JSON.stringify([cfg.icon, cfg.splash && cfg.splash.image, cfg.appName, cfg.tv, (cfg.config.onboarding && cfg.config.onboarding.slides || []).map((s) => s.image || ''), cfg.config.modal && cfg.config.modal.image]);
  if (imageCache.has(key)) return imageCache.get(key);
  const o = await iconOptions(cfg);
  const jobs = [];
  const add = (name, p) => jobs.push(p.then((v) => [name, v]));
  for (const [d, k] of Object.entries(DENSITIES)) {
    add(`mipmap-${d}/ic_launcher.png`, png(iconCanvas(o, 48 * k, 'rounded')));
    add(`mipmap-${d}/ic_launcher_round.png`, png(iconCanvas(o, 48 * k, 'circle')));
    add(`mipmap-${d}/ic_launcher_foreground.png`, png(foreground(o, 108 * k)));
    add(`mipmap-${d}/ic_launcher_monochrome.png`, png(monochrome(o, 108 * k)));
  }
  add('drawable-xxhdpi/vt_splash_logo.png', png(splashLogo(o, 150 * 3)));
  add('drawable-xxhdpi/vt_splash_icon.png', png(splashIcon(o, 240 * 3)));
  add('play-512.png', png(iconCanvas(o, 512, 'square')));
  if (cfg.tv) add('drawable-xhdpi/vt_banner.png', png(banner(o, 640, 360)));
  const slides = (cfg.config.onboarding && cfg.config.onboarding.slides) || [];
  slides.forEach((sl, i) => { if (sl.image) add(`drawable-nodpi/vt_onb_${i + 1}.webp`, photo(sl.image)); });
  if (cfg.config.modal && cfg.config.modal.image) add('drawable-nodpi/vt_modal.webp', photo(cfg.config.modal.image, 900));
  const out = Object.fromEntries(await Promise.all(jobs));
  imageCache.clear();
  imageCache.set(key, out);
  return out;
}

/** Icônes du manifest web (PWA) : 192, 512, adaptable (maskable) et monochrome. */
export async function pwaIcons(cfg) {
  const o = await iconOptions(cfg);
  const maskable = (px) => {
    const c = canvas(px, px);
    const ctx = c.getContext('2d');
    fillBg(ctx, px, px, o);
    // Zone sûre des icônes adaptables : cercle de 80 % au centre.
    const fg = foreground(o, px * 1.25);
    ctx.drawImage(fg, -px * 0.125, -px * 0.125);
    return c;
  };
  const mono = (px) => {
    const c = canvas(px, px);
    c.getContext('2d').drawImage(monochrome(o, px * 1.25), -px * 0.125, -px * 0.125);
    return c;
  };
  const list = await Promise.all([
    ['icon-192.png', png(iconCanvas(o, 192, 'square'))], ['icon-512.png', png(iconCanvas(o, 512, 'square'))],
    ['maskable-512.png', png(maskable(512))], ['monochrome-512.png', png(mono(512))],
  ].map(([n, p]) => p.then((v) => [n, v])));
  return Object.fromEntries(list);
}

/** Aperçus pour l'interface (adresse data:). */
export async function previews(cfg) {
  const o = await iconOptions(cfg);
  return {
    squircle: iconCanvas(o, 192, 'squircle').toDataURL(),
    circle: iconCanvas(o, 192, 'circle').toDataURL(),
    rounded: iconCanvas(o, 192, 'rounded').toDataURL(),
    ios: (() => {
      // Icône iOS : carré plein (iOS applique lui-même l'arrondi continu).
      const c = canvas(192, 192);
      const ctx = c.getContext('2d');
      rr(ctx, 0, 0, 192, 192, 43);
      ctx.clip();
      ctx.drawImage(iconCanvas(o, 192, 'square'), 0, 0);
      return c.toDataURL();
    })(),
    mono: (() => {
      const c = canvas(192, 192);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#3c4043';
      ctx.beginPath();
      ctx.arc(96, 96, 96, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(monochrome(o, 288), -48, -48);
      return c.toDataURL();
    })(),
    splash: splashLogo(o, 300).toDataURL(),
    banner: banner(o, 320, 180).toDataURL(),
  };
}
