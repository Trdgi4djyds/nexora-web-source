/* Maquettes : rendu 2D (fonds, appareils, inclinaison 3D en perspective, ombres, textes, filigrane, effets).
 * Tout est dessiné sur un canevas à la taille de l'export : l'aperçu et le fichier final sont identiques. */
import { getDevice } from '../devices/catalog.js';
import { layoutDevice } from '../devices/geometry.js';
import { drawComposite, shade } from '../devices/frames2d.js';
import { paintGlass, paintFluid } from '../devices/wallpapers.js';

export const MK_FORMATS = {
  square: ['Carré 1:1', 1080, 1080], portrait: ['Portrait 4:5', 1080, 1350], story: ['Story 9:16', 1080, 1920], wide: ['Paysage 16:9', 1920, 1080],
  x: ['X (Twitter)', 1600, 900], linkedin: ['LinkedIn', 1200, 627], dribbble: ['Dribbble 4:3', 1600, 1200], ph: ['Product Hunt', 1270, 760],
  play: ['Bannière Play Store', 1024, 500], appstore: ['Capture App Store', 1290, 2796], og: ['Partage de lien', 1200, 630], custom: ['Personnalisé', 1600, 1200],
};

export const MK_PRESETS = {
  glass: 'Verre', fluid: 'Fluide', cosmic: 'Cosmique', mystic: 'Mystique', abstract: 'Abstrait', aurora: 'Aurore', sunset: 'Couchant', paper: 'Papier', desk: 'Bureau', mint: 'Menthe',
};

export const MK_STYLES = {
  default: 'Standard', 'glass-light': 'Verre clair', 'glass-dark': 'Verre sombre', 'liquid': 'Verre liquide', 'inset-light': 'Encart clair', 'inset-dark': 'Encart sombre', outline: 'Contour', border: 'Bordure',
};

export const MK_LAYOUTS = {
  single: ['Un appareil', [{ x: 0.5, y: 0.52, size: 0.8 }]],
  tilt: ['Incliné', [{ x: 0.52, y: 0.54, size: 0.84, rx: 10, ry: -22, rz: -4 }]],
  flat: ['À plat (dessus)', [{ x: 0.5, y: 0.5, size: 0.82, rx: 48, ry: 0, rz: -32 }]],
  duo: ['Deux côte à côte', [{ x: 0.32, y: 0.54, size: 0.72, ry: 14 }, { x: 0.68, y: 0.52, size: 0.72, ry: -14 }]],
  trio: ['Trois, centre en avant', [{ x: 0.5, y: 0.52, size: 0.78, z: 3 }, { x: 0.22, y: 0.56, size: 0.6, ry: 22, z: 1 }, { x: 0.78, y: 0.56, size: 0.6, ry: -22, z: 1 }]],
  cascade: ['Cascade', [{ x: 0.3, y: 0.62, size: 0.62, rx: 12, ry: -24, rz: -6, z: 1 }, { x: 0.5, y: 0.5, size: 0.62, rx: 12, ry: -24, rz: -6, z: 2 }, { x: 0.7, y: 0.38, size: 0.62, rx: 12, ry: -24, rz: -6, z: 3 }]],
  hero: ['Ordinateur + téléphone', [{ x: 0.45, y: 0.52, size: 0.66, kind: 'device', device: 'macbook-pro-14', z: 1 }, { x: 0.8, y: 0.62, size: 0.56, kind: 'device', device: 'iphone-18-pro', z: 2 }]],
  web: ['Site dans un navigateur', [{ x: 0.5, y: 0.53, size: 0.78, kind: 'browser' }]],
  grid: ['Grille de 4', [{ x: 0.3, y: 0.3, size: 0.4, kind: 'screen' }, { x: 0.7, y: 0.3, size: 0.4, kind: 'screen' }, { x: 0.3, y: 0.72, size: 0.4, kind: 'screen' }, { x: 0.7, y: 0.72, size: 0.4, kind: 'screen' }]],
};

export const MK_ANIMS = {
  none: 'Aucune', tilt: 'Inclinaison douce', zoom: 'Zoom avant', float: 'Flottement (parallaxe)', reveal: 'Apparition', orbit: 'Tour d’horizon', scroll: 'Défilement de l’écran',
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const hexA = (hex, a) => {
  const h = String(hex || '#000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); }
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* Couleurs dominantes d'une image (pour le fond « magique » et l'ombre adaptative). */
export function dominantColors(img, n = 4) {
  try {
    const c = document.createElement('canvas'); c.width = 48; c.height = 48;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, 48, 48);
    const d = g.getImageData(0, 0, 48, 48).data;
    const buckets = new Map();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      const r = d[i]; const gg = d[i + 1]; const b = d[i + 2];
      const max = Math.max(r, gg, b); const min = Math.min(r, gg, b);
      const sat = max ? (max - min) / max : 0;
      const key = `${r >> 5},${gg >> 5},${b >> 5}`;
      const e = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0, w: 0 };
      e.r += r; e.g += gg; e.b += b; e.n += 1; e.w += 1 + sat * 3;
      buckets.set(key, e);
    }
    return [...buckets.values()].sort((a, b) => b.w - a.w).slice(0, n).map((e) => `#${[e.r, e.g, e.b].map((v) => Math.round(v / e.n).toString(16).padStart(2, '0')).join('')}`);
  } catch { return ['#5e5ce6', '#0a84ff', '#bf5af2', '#30d158']; }
}

// ============================================================================ fonds
export function paintBackground(ctx, W, H, bg, { media, transparentPreview = false } = {}) {
  const type = bg.type || 'gradient';
  if (type === 'transparent') {
    if (transparentPreview) {
      const s = Math.max(12, Math.round(W / 60));
      for (let y = 0; y < H; y += s) for (let x = 0; x < W; x += s) { ctx.fillStyle = ((x / s + y / s) % 2) ? '#e6e6ea' : '#f7f7f9'; ctx.fillRect(x, y, s, s); }
    }
    return;
  }
  if (type === 'solid') { ctx.fillStyle = bg.color || '#f2f2f7'; ctx.fillRect(0, 0, W, H); return; }
  if (type === 'gradient') {
    const a = ((bg.angle ?? 135) * Math.PI) / 180;
    const r = Math.hypot(W, H) / 2;
    const g = ctx.createLinearGradient(W / 2 - Math.cos(a) * r, H / 2 - Math.sin(a) * r, W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r);
    g.addColorStop(0, bg.c1 || '#5e5ce6'); g.addColorStop(1, bg.c2 || '#0a84ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    grain(ctx, W, H, 0.028, bg.seed || 3); // casse les bandes du dégradé
    return;
  }
  if (type === 'image' && bg.img) {
    const im = bg.img;
    const k = Math.max(W / im.width, H / im.height);
    ctx.save();
    if (bg.blur) ctx.filter = `blur(${Math.round(bg.blur * Math.min(W, H) / 400)}px)`;
    const ex = bg.blur ? Math.min(W, H) * 0.05 : 0;
    ctx.drawImage(im, (W - im.width * k) / 2 - ex, (H - im.height * k) / 2 - ex, im.width * k + ex * 2, im.height * k + ex * 2);
    ctx.restore();
    if (bg.dim) { ctx.fillStyle = `rgba(0,0,0,${bg.dim})`; ctx.fillRect(0, 0, W, H); }
    return;
  }
  if (type === 'magic') {
    const cols = media ? dominantColors(media, 4) : ['#5e5ce6', '#0a84ff', '#bf5af2', '#30d158'];
    const rnd = mulberry(bg.seed || 7);
    ctx.fillStyle = bg.dark === false ? '#f4f4f8' : '#0c0c12';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.filter = `blur(${Math.round(Math.min(W, H) / 12)}px)`;
    for (let i = 0; i < 6; i++) {
      const c = cols[i % cols.length];
      const x = rnd() * W; const y = rnd() * H; const rad = (0.35 + rnd() * 0.45) * Math.max(W, H);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, hexA(c, 0.6)); g.addColorStop(1, hexA(c, 0));
      ctx.fillStyle = g; ctx.fillRect(-W * 0.1, -H * 0.1, W * 1.2, H * 1.2);
    }
    ctx.restore();
    return;
  }
  paintPreset(ctx, W, H, bg.preset || 'glass', bg.seed || 1);
}

function paintPreset(ctx, W, H, p, seed) {
  const rnd = mulberry(seed * 977 + p.length * 131);
  const blob = (x, y, r, c, a = 0.8) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, hexA(c, a)); g.addColorStop(1, hexA(c, 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); };
  if (p === 'glass') { ctx.save(); ctx.scale(W / 402, H / 874); paintGlass(ctx, 402, 874, '#bccbd7'); ctx.restore(); return; }
  if (p === 'fluid') { ctx.save(); ctx.scale(W / 402, H / 874); paintFluid(ctx, 402, 874, '#5d5688'); ctx.restore(); return; }
  const M = Math.max(W, H);
  if (p === 'cosmic') {
    ctx.fillStyle = '#05060f'; ctx.fillRect(0, 0, W, H);
    blob(W * 0.25, H * 0.3, M * 0.6, '#3b1d8f', 0.7); blob(W * 0.8, H * 0.75, M * 0.55, '#0b4f8a', 0.6); blob(W * 0.6, H * 0.2, M * 0.3, '#b0207a', 0.35);
    for (let i = 0; i < 260; i++) { const a = rnd(); ctx.fillStyle = `rgba(255,255,255,${0.2 + a * 0.8})`; const s = a > 0.97 ? 2.2 : 1.1; ctx.fillRect(rnd() * W, rnd() * H, s * M / 1400, s * M / 1400); }
  } else if (p === 'mystic') {
    ctx.fillStyle = '#120a1f'; ctx.fillRect(0, 0, W, H);
    blob(W * 0.2, H * 0.8, M * 0.7, '#6d28d9', 0.75); blob(W * 0.85, H * 0.2, M * 0.6, '#0d9488', 0.6); blob(W * 0.55, H * 0.55, M * 0.35, '#db2777', 0.35);
  } else if (p === 'abstract') {
    ctx.fillStyle = '#f5efe6'; ctx.fillRect(0, 0, W, H);
    const cols = ['#ff6b4a', '#ffc145', '#2e86ab', '#1b998b', '#e84393'];
    for (let i = 0; i < 7; i++) { ctx.fillStyle = hexA(cols[i % cols.length], 0.85); ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, (0.08 + rnd() * 0.25) * M, 0, Math.PI * 2); ctx.fill(); }
  } else if (p === 'aurora') {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#031a26'); g.addColorStop(1, '#0b2c2a'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.filter = `blur(${Math.round(M / 30)}px)`;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath(); ctx.moveTo(0, H * (0.3 + k * 0.15));
      for (let x = 0; x <= W; x += W / 12) ctx.lineTo(x, H * (0.3 + k * 0.15) + Math.sin(x / W * 6 + k * 2 + rnd()) * H * 0.08);
      ctx.lineTo(W, 0); ctx.lineTo(0, 0); ctx.closePath();
      ctx.fillStyle = hexA(['#22d3a6', '#7c3aed', '#38bdf8'][k], 0.35); ctx.fill();
    }
    ctx.restore();
  } else if (p === 'sunset') {
    // Crépuscule chaud et doux (pêche → rose poudré), sans le saut violet criard.
    const g = ctx.createLinearGradient(0, 0, W * 0.25, H); g.addColorStop(0, '#ffd9bf'); g.addColorStop(0.55, '#f3a88f'); g.addColorStop(1, '#b98aa0'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    blob(W * 0.72, H * 0.26, M * 0.4, '#fff1dc', 0.45);
  } else if (p === 'paper') {
    ctx.fillStyle = '#efeae2'; ctx.fillRect(0, 0, W, H);
    blob(W * 0.1, H * 0.1, M * 0.6, '#ffffff', 0.6); blob(W * 0.9, H * 0.9, M * 0.6, '#d8cfc2', 0.5);
  } else if (p === 'desk') {
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#2b2f36'); g.addColorStop(1, '#14161a'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    blob(W * 0.3, H * 0.25, M * 0.55, '#4b5563', 0.5);
  } else if (p === 'mint') {
    // Menthe douce et aérée, moins acide que le vert citron d'origine.
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#d7f0e3'); g.addColorStop(1, '#a9d8c6'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    blob(W * 0.8, H * 0.2, M * 0.45, '#ffffff', 0.5);
  } else { ctx.fillStyle = '#e9e9ee'; ctx.fillRect(0, 0, W, H); }
  // Grain léger : fini « papier » et absence de bandes de dégradé.
  grain(ctx, W, H, 0.035, seed);
}

export function grain(ctx, W, H, amount, seed = 3) {
  if (!amount) return;
  const s = 256; const c = document.createElement('canvas'); c.width = s; c.height = s;
  const g = c.getContext('2d'); const d = g.createImageData(s, s); const rnd = mulberry(seed * 31 + 5);
  for (let i = 0; i < d.data.length; i += 4) { const v = rnd() * 255; d.data[i] = v; d.data[i + 1] = v; d.data[i + 2] = v; d.data[i + 3] = 255 * amount * 2.2; }
  g.putImageData(d, 0, 0);
  ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = ctx.createPattern(c, 'repeat'); ctx.fillRect(0, 0, W, H); ctx.restore();
}

function paintOverlay(ctx, W, H, kind, seed = 1) {
  if (!kind || kind === 'none') return;
  const M = Math.max(W, H);
  ctx.save();
  if (kind === 'shadow') {
    // Ombre de fenêtre / feuillage : bandes douces en diagonale.
    ctx.globalCompositeOperation = 'multiply';
    ctx.filter = `blur(${Math.round(M / 70)}px)`;
    ctx.translate(W / 2, H / 2); ctx.rotate(-0.55); ctx.translate(-M, -M);
    for (let i = 0; i < 9; i++) { ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(0, i * M * 0.26, M * 2, M * 0.1); }
  } else if (kind === 'shapes') {
    const rnd = mulberry(seed * 53 + 9);
    for (let i = 0; i < 5; i++) {
      const x = rnd() * W; const y = rnd() * H; const r = (0.05 + rnd() * 0.11) * M;
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(0.6, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0.04)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

// ============================================================================ éléments (appareil, navigateur, écran)
function fitImage(img, w, h, zoom = 1, align = 'top') {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
  if (!img) {
    // Emplacement vide : invite à déposer une capture.
    const gr = g.createLinearGradient(0, 0, c.width, c.height); gr.addColorStop(0, '#eef0f6'); gr.addColorStop(1, '#dfe3ee');
    g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#8a90a2'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `600 ${Math.round(Math.min(c.width, c.height) / 12)}px system-ui, sans-serif`;
    g.fillText('Dépose une capture', c.width / 2, c.height / 2);
    return c;
  }
  const iw = img.videoWidth || img.naturalWidth || img.width; const ih = img.videoHeight || img.naturalHeight || img.height;
  const k = Math.max(c.width / iw, c.height / ih) * zoom;
  const dw = iw * k; const dh = ih * k;
  const y = align === 'center' ? (c.height - dh) / 2 : align === 'bottom' ? c.height - dh : 0;
  g.drawImage(img, (c.width - dw) / 2, y, dw, dh);
  return c;
}

const radiusPx = (slot, w, h) => {
  const r = slot.radius ?? 'curved';
  const m = Math.min(w, h);
  if (typeof r === 'number') return (r / 100) * m * 0.5;
  return r === 'sharp' ? 0 : r === 'round' ? m * 0.09 : m * 0.035;
};

/* Élément « à plat » (avant inclinaison), à l'échelle k. */
export function renderFlat(slot, media, k = 1) {
  const kind = slot.kind || 'device';
  let c; let g;
  if (kind === 'device') {
    const dev = getDevice(slot.device || 'iphone-18-pro') || getDevice('iphone-18-pro');
    const L = layoutDevice(dev, undefined, { framesOn: true, statusBar: slot.statusBar !== false, skin: false, color: slot.color || null, land: Boolean(slot.land) });
    const M = Math.round(Math.max(L.TW, L.TH) * 0.03);
    c = document.createElement('canvas');
    c.width = Math.ceil((L.TW + M * 2) * k); c.height = Math.ceil((L.TH + M * 2) * k);
    g = c.getContext('2d');
    g.scale(k, k); g.translate(M, M);
    const img = fitImage(media, L.vp.w * Math.min(3, k * 2), L.vp.h * Math.min(3, k * 2), slot.zoom || 1, slot.align || 'top');
    drawComposite(g, L, { image: img, px: k, sbBg: slot.sbBg || '#ffffff', sbFg: slot.sbFg || '#000000', shadow: false });
  } else if (kind === 'browser') {
    const iw = media ? (media.videoWidth || media.naturalWidth || media.width) : 1440;
    const ih = media ? (media.videoHeight || media.naturalHeight || media.height) : 900;
    const W0 = 1440; const vh = Math.round(W0 * Math.min(1.25, Math.max(0.5, ih / iw)));
    const bar = 44; const R = radiusPx(slot, W0, vh + bar) || 0;
    c = document.createElement('canvas'); c.width = Math.ceil(W0 * k); c.height = Math.ceil((vh + bar) * k);
    g = c.getContext('2d'); g.scale(k, k);
    const dark = slot.browserTheme === 'dark';
    rr(g, 0, 0, W0, vh + bar, Math.max(R, 12)); g.save(); g.clip();
    g.fillStyle = dark ? '#2b2b30' : '#f2f2f5'; g.fillRect(0, 0, W0, bar);
    ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(22 + i * 20, bar / 2, 6.5, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = dark ? '#1c1c20' : '#ffffff'; rr(g, W0 * 0.3, 9, W0 * 0.4, bar - 18, (bar - 18) / 2); g.fill();
    g.fillStyle = dark ? '#a0a0a8' : '#6e6e73'; g.font = '500 14px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(slot.url || 'monsite.com', W0 / 2, bar / 2 + 0.5);
    g.drawImage(fitImage(media, W0, vh, slot.zoom || 1, slot.align || 'top'), 0, bar, W0, vh);
    g.restore();
  } else {
    const iw = media ? (media.videoWidth || media.naturalWidth || media.width) : 1200;
    const ih = media ? (media.videoHeight || media.naturalHeight || media.height) : 800;
    const W0 = Math.min(1600, iw); const H0 = Math.round(W0 * (ih / iw));
    c = document.createElement('canvas'); c.width = Math.ceil(W0 * k); c.height = Math.ceil(H0 * k);
    g = c.getContext('2d'); g.scale(k, k);
    rr(g, 0, 0, W0, H0, radiusPx(slot, W0, H0)); g.save(); g.clip();
    g.drawImage(fitImage(media, W0, H0, slot.zoom || 1, 'center'), 0, 0, W0, H0);
    g.restore();
  }
  return applyStyle(c, slot);
}

// Styles de cadre autour de l'élément : fins et soignés (verre dépoli, encart, contour, bordure).
function applyStyle(src, slot) {
  const st = slot.style || 'default';
  if (st === 'default') return src;
  const m = Math.min(src.width, src.height);
  // Marges fines (les anciens cadres épais paraissaient lourds).
  const pad = Math.round(m * (st === 'outline' ? 0.012 : st === 'border' ? 0.016 : st === 'liquid' ? 0.03 : 0.024));
  const c = document.createElement('canvas'); c.width = src.width + pad * 2; c.height = src.height + pad * 2;
  const g = c.getContext('2d');
  const innerR = radiusPx(slot, src.width, src.height);
  const R = innerR + pad;
  const glass = st === 'glass-light' || st === 'glass-dark' || st === 'liquid';
  if (glass) {
    // Verre dépoli translucide : halo clair en haut, teinte légère, fin liseré lumineux.
    rr(g, 0, 0, c.width, c.height, R);
    const gr = g.createLinearGradient(0, 0, 0, c.height);
    if (st === 'glass-dark') { gr.addColorStop(0, 'rgba(60,62,72,0.6)'); gr.addColorStop(1, 'rgba(18,19,24,0.5)'); } else if (st === 'liquid') { gr.addColorStop(0, 'rgba(255,255,255,0.72)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.28)'); gr.addColorStop(1, 'rgba(255,255,255,0.5)'); } else { gr.addColorStop(0, 'rgba(255,255,255,0.68)'); gr.addColorStop(1, 'rgba(240,242,248,0.42)'); }
    g.fillStyle = gr; g.fill();
    g.lineWidth = Math.max(1, m * 0.0035); g.strokeStyle = st === 'glass-dark' ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.9)'; g.stroke();
    if (st === 'liquid') { g.save(); rr(g, pad * 0.5, pad * 0.5, c.width - pad, c.height * 0.4, R * 0.8); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fill(); g.restore(); }
  } else if (st === 'inset-light' || st === 'inset-dark') {
    rr(g, 0, 0, c.width, c.height, R); g.fillStyle = st === 'inset-dark' ? '#17171b' : '#ffffff'; g.fill();
  } else if (st === 'border') {
    rr(g, 0, 0, c.width, c.height, R); g.fillStyle = slot.borderColor || '#ffffff'; g.fill();
  }
  // L'image est posée avec ses coins déjà arrondis.
  g.save(); rr(g, pad, pad, src.width, src.height, innerR); g.clip(); g.drawImage(src, pad, pad); g.restore();
  if (st === 'outline') { g.lineWidth = Math.max(1.5, m * 0.007); g.strokeStyle = slot.borderColor || 'rgba(255,255,255,0.95)'; rr(g, pad / 2, pad / 2, c.width - pad, c.height - pad, R - pad / 2); g.stroke(); }
  if (st === 'inset-light' || st === 'inset-dark') {
    // Ombre intérieure douce (l'écran paraît encastré).
    g.save(); rr(g, pad, pad, src.width, src.height, innerR); g.clip();
    g.shadowColor = 'rgba(0,0,0,0.3)'; g.shadowBlur = pad * 1.1; g.shadowOffsetY = pad * 0.2; g.lineWidth = pad * 1.4; g.strokeStyle = 'rgba(0,0,0,0.5)';
    rr(g, pad, pad, src.width, src.height, innerR); g.stroke(); g.restore();
  }
  return c;
}

// ============================================================================ perspective
function rotate3(p, rx, ry, rz) {
  let [x, y, z] = p;
  const cz = Math.cos(rz); const sz = Math.sin(rz);
  [x, y] = [x * cz - y * sz, x * sz + y * cz];
  const cx = Math.cos(rx); const sx = Math.sin(rx);
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  const cy = Math.cos(ry); const sy = Math.sin(ry);
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  return [x, y, z];
}

export function projectQuad(cx, cy, hw, hh, rot, f) {
  const r = [rot.x || 0, rot.y || 0, rot.z || 0].map((d) => (d * Math.PI) / 180);
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => {
    const [X, Y, Z] = rotate3([x, y, 0], r[0], r[1], r[2]);
    const s = f / (f + Z);
    return [cx + X * s, cy + Y * s];
  });
}

// Projette un point local (x, y, z) de l'appareil vers l'écran (sert à l'épaisseur du slab).
export function projectPoint(cx, cy, x, y, z, rot, f) {
  const r = [rot.x || 0, rot.y || 0, rot.z || 0].map((d) => (d * Math.PI) / 180);
  const [X, Y, Z] = rotate3([x, y, z], r[0], r[1], r[2]);
  const s = f / (f + Z);
  return [cx + X * s, cy + Y * s];
}

// Homographie carré unité → quadrilatère.
function homography(q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2; const dx2 = x3 - x2; const dy1 = y1 - y2; const dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3; const sy = y0 - y1 + y2 - y3;
  let g = 0; let h = 0;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) { g = (sx * dy2 - dx2 * sy) / den; h = (dx1 * sy - sx * dy1) / den; }
  const a = x1 - x0 + g * x1; const b = x3 - x0 + h * x3; const c = x0;
  const d = y1 - y0 + g * y1; const e = y3 - y0 + h * y3; const ff = y0;
  return (u, v) => { const w = g * u + h * v + 1; return [(a * u + b * v + c) / w, (d * u + e * v + ff) / w]; };
}

function tri(ctx, img, s0, s1, s2, d0, d1, d2) {
  const den = s0[0] * (s1[1] - s2[1]) + s1[0] * (s2[1] - s0[1]) + s2[0] * (s0[1] - s1[1]);
  if (!den) return;
  const a = (d0[0] * (s1[1] - s2[1]) + d1[0] * (s2[1] - s0[1]) + d2[0] * (s0[1] - s1[1])) / den;
  const b = (d0[1] * (s1[1] - s2[1]) + d1[1] * (s2[1] - s0[1]) + d2[1] * (s0[1] - s1[1])) / den;
  const c = (d0[0] * (s2[0] - s1[0]) + d1[0] * (s0[0] - s2[0]) + d2[0] * (s1[0] - s0[0])) / den;
  const d = (d0[1] * (s2[0] - s1[0]) + d1[1] * (s0[0] - s2[0]) + d2[1] * (s1[0] - s0[0])) / den;
  const e = (d0[0] * (s1[0] * s2[1] - s2[0] * s1[1]) + d1[0] * (s2[0] * s0[1] - s0[0] * s2[1]) + d2[0] * (s0[0] * s1[1] - s1[0] * s0[1])) / den;
  const f = (d0[1] * (s1[0] * s2[1] - s2[0] * s1[1]) + d1[1] * (s2[0] * s0[1] - s0[0] * s2[1]) + d2[1] * (s0[0] * s1[1] - s1[0] * s0[1])) / den;
  // Triangle de destination légèrement agrandi : pas de fines lignes entre les morceaux.
  const cx = (d0[0] + d1[0] + d2[0]) / 3; const cy = (d0[1] + d1[1] + d2[1]) / 3;
  const grow = (p) => { const dx = p[0] - cx; const dy = p[1] - cy; const l = Math.hypot(dx, dy) || 1; return [p[0] + (dx / l) * 0.8, p[1] + (dy / l) * 0.8]; };
  const [g0, g1, g2] = [grow(d0), grow(d1), grow(d2)];
  ctx.save();
  ctx.beginPath(); ctx.moveTo(g0[0], g0[1]); ctx.lineTo(g1[0], g1[1]); ctx.lineTo(g2[0], g2[1]); ctx.closePath(); ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

export function drawWarped(ctx, img, quad, n = 16) {
  const H = homography(quad);
  const w = img.width; const h = img.height;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u0 = i / n; const u1 = (i + 1) / n; const v0 = j / n; const v1 = (j + 1) / n;
      const p00 = H(u0, v0); const p10 = H(u1, v0); const p11 = H(u1, v1); const p01 = H(u0, v1);
      const s00 = [u0 * w, v0 * h]; const s10 = [u1 * w, v0 * h]; const s11 = [u1 * w, v1 * h]; const s01 = [u0 * w, v1 * h];
      tri(ctx, img, s00, s10, s11, p00, p10, p11);
      tri(ctx, img, s00, s11, s01, p00, p11, p01);
    }
  }
}

// ============================================================================ animation
export function animated(slot, doc, t) {
  const a = doc.anim || {};
  const d = Math.max(1, a.dur || 6);
  const p = clamp(t / d, 0, 1);
  const o = { ...slot, rx: slot.rx || 0, ry: slot.ry || 0, rz: slot.rz || 0, x: slot.x, y: slot.y, size: slot.size, alpha: 1, scroll: 0 };
  switch (a.preset) {
    case 'tilt': o.ry += Math.sin(p * Math.PI * 2) * 12; o.rx += Math.cos(p * Math.PI * 2) * 5; break;
    case 'zoom': o.size *= 0.86 + ease(p) * 0.2; break;
    case 'float': o.y += Math.sin(p * Math.PI * 2) * 0.02; o.rz += Math.sin(p * Math.PI * 2 + 1) * 1.5; o.ry += Math.sin(p * Math.PI * 2) * 6; break;
    case 'reveal': { const q = ease(clamp(p * 1.6, 0, 1)); o.y += (1 - q) * 0.4; o.rx += (1 - q) * 35; o.alpha = q; break; }
    case 'orbit': o.ry += -28 + ease(p) * 56; break;
    case 'scroll': o.scroll = ease(p); break;
    default: break;
  }
  return o;
}

// ============================================================================ composition complète
const FLAT = new Map();
export function compose(ctx, doc, W, H, { media = new Map(), t = 0, quality = 1, preview = false, selected = null, selectedText = null, hideMockup = false } = {}) {
  const first = doc.slots.map((s) => media.get(s.media)).find(Boolean);
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  const bg = { ...doc.bg, img: doc.bg.type === 'image' ? media.get(doc.bg.image) : null };
  paintBackground(ctx, W, H, bg, { media: first, transparentPreview: preview });
  // Parallaxe : en flottement, le fond glisse légèrement en sens inverse.
  paintOverlay(ctx, W, H, doc.overlay, doc.bg.seed || 1);
  // Perspective marquée, comme une vraie prise de vue (plus la valeur est petite, plus l'effet est fort).
  const f = Math.max(W, H) * 1.3;
  const hits = [];
  const textHits = [];
  const order = doc.slots.map((s, i) => [s, i]).sort((a, b) => (a[0].z || 0) - (b[0].z || 0));
  const layer = document.createElement('canvas'); layer.width = W; layer.height = H;
  const lg = layer.getContext('2d');
  for (const [s0] of order) {
    const s = animated(s0, doc, t);
    let m = media.get(s.media) || null;
    if (hideMockup && m) {
      // « Masquer la maquette » : capture seule, sans cadre.
      const k = Math.min(W / m.width, H / m.height) * 0.9;
      ctx.drawImage(m, (W - m.width * k) / 2, (H - m.height * k) / 2, m.width * k, m.height * k);
      continue;
    }
    if (m && s.scroll && (m.naturalHeight || m.height) > (m.naturalWidth || m.width) * 2.2) {
      // Défilement : la fenêtre de la capture descend le long de la page.
      const iw = m.naturalWidth || m.width; const ih = m.naturalHeight || m.height;
      const vh = Math.round(iw * 2.17); const y = Math.round((ih - vh) * s.scroll);
      const c = document.createElement('canvas'); c.width = iw; c.height = vh; c.getContext('2d').drawImage(m, 0, -y); m = c;
    }
    // Élément à plat mis en cache : seul ce qui change (inclinaison, position, temps) est recalculé.
    const isVideo = m && m.tagName === 'VIDEO';
    const fkey = isVideo ? null : JSON.stringify([s0.kind, s0.device, s0.color, s0.land, s0.style, s0.radius, s0.borderColor, s0.zoom, s0.align, s0.url, s0.browserTheme, s0.statusBar, s0.media, Math.round(quality * 100), s.scroll ? Math.round(s.scroll * 200) : 0]);
    let flat = fkey && FLAT.get(fkey);
    if (!flat) {
      flat = renderFlat({ ...s, align: s.scroll ? 'top' : s.align }, m, quality);
      if (fkey) { FLAT.set(fkey, flat); if (FLAT.size > 24) FLAT.delete(FLAT.keys().next().value); }
    }
    const fw = flat.width; const fh = flat.height;
    const sc = s.size * Math.min(H / fh, (W * 0.96) / fw);
    const hw = (fw * sc) / 2; const hh = (fh * sc) / 2;
    const cx = s.x * W; const cy = s.y * H;
    const quad = projectQuad(cx, cy, hw, hh, { x: s.rx, y: s.ry, z: s.rz }, f);
    lg.clearRect(0, 0, W, H);
    const flatAngles = !s.rx && !s.ry;
    if (flatAngles) {
      lg.save(); lg.translate(cx, cy); lg.rotate((s.rz * Math.PI) / 180); lg.drawImage(flat, -hw, -hh, hw * 2, hh * 2); lg.restore();
    } else drawWarped(lg, flat, quad, preview ? 14 : 28);
    // Reflet de lumière.
    if (s.gloss) {
      lg.save(); lg.globalCompositeOperation = 'source-atop';
      const gr = lg.createLinearGradient(quad[0][0], quad[0][1], quad[2][0], quad[2][1]);
      gr.addColorStop(0, `rgba(255,255,255,${0.45 * s.gloss})`); gr.addColorStop(0.45, 'rgba(255,255,255,0)'); gr.addColorStop(1, `rgba(0,0,0,${0.18 * s.gloss})`);
      lg.fillStyle = gr; lg.fillRect(0, 0, W, H); lg.restore();
    }
    // Décalage de la tranche (épaisseur) selon l'inclinaison — sert aussi à orienter l'ombre.
    const rot3 = { x: s.rx, y: s.ry, z: s.rz };
    const hdL = Math.min(hw, hh) * 0.12;
    const pf = projectPoint(cx, cy, 0, 0, -hdL, rot3, f);
    const pb = projectPoint(cx, cy, 0, 0, hdL, rot3, f);
    const dx = pb[0] - pf[0]; const dy = pb[1] - pf[1];
    // Ombre portée sur la silhouette : deux couches (contact net + diffusion douce) pour un vrai ancrage au sol.
    const sh = s.shadow || { mode: 'spread', opacity: 40 };
    if (sh.mode && sh.mode !== 'none') {
      const op = clamp((sh.opacity ?? 40) / 100, 0, 1) * s.alpha;
      const M = Math.min(W, H);
      const sil = document.createElement('canvas'); sil.width = W; sil.height = H;
      const sg = sil.getContext('2d');
      sg.drawImage(layer, 0, 0); sg.globalCompositeOperation = 'source-in';
      sg.fillStyle = sh.mode === 'adaptive' && m ? dominantColors(m, 1)[0] : '#000000'; sg.fillRect(0, 0, W, H);
      // Direction : vers le bas, légèrement selon l'inclinaison.
      const ox = (dx || 0) * 0.5; const oyBase = M * 0.028;
      // couche diffuse large, couche contact serrée
      const layers = sh.mode === 'hug' ? [[0.016, 0.006, 0.9]] : sh.mode === 'adaptive' ? [[0.09, 0.05, 0.85], [0.03, 0.02, 0.6]] : [[0.075, 0.055, 0.8], [0.022, 0.016, 0.55]];
      for (const [blur, off, a] of layers) {
        ctx.save();
        ctx.globalAlpha = op * a * (sh.mode === 'adaptive' ? 1.1 : 1);
        ctx.filter = `blur(${Math.max(1, Math.round(blur * M))}px)`;
        ctx.drawImage(sil, ox * off * 6, oyBase + off * M);
        ctx.restore();
      }
    }
    // Épaisseur de l'appareil (relief) : la tranche suit la silhouette réelle, décalée selon l'inclinaison.
    if (Math.hypot(dx, dy) > 1.2 && s.kind !== 'screen') {
      const side = document.createElement('canvas'); side.width = W; side.height = H;
      const sgc = side.getContext('2d');
      sgc.drawImage(layer, 0, 0); sgc.globalCompositeOperation = 'source-in';
      // Tranche métallique : plus sombre au fond, légère arête claire côté lumière.
      const edge = s.kind === 'device' ? '#b9bcc4' : '#c9ccd4';
      const gr = sgc.createLinearGradient(0, 0, dx * 40, dy * 40);
      gr.addColorStop(0, shade(edge, -0.52)); gr.addColorStop(0.5, shade(edge, -0.28)); gr.addColorStop(1, shade(edge, -0.08));
      sgc.fillStyle = gr; sgc.fillRect(0, 0, W, H);
      ctx.save(); ctx.globalAlpha = s.alpha;
      const steps = Math.max(6, Math.min(26, Math.round(Math.hypot(dx, dy))));
      for (let st = steps; st >= 1; st--) { const fr = st / steps; ctx.drawImage(side, dx * fr, dy * fr); }
      ctx.restore();
    }
    ctx.save(); ctx.globalAlpha = s.alpha; ctx.drawImage(layer, 0, 0); ctx.restore();
    hits.push({ id: s0.id, quad });
    if (preview && selected === s0.id) {
      ctx.save(); ctx.strokeStyle = '#0a84ff'; ctx.lineWidth = Math.max(2, W / 500); ctx.setLineDash([W / 120, W / 160]);
      ctx.beginPath(); quad.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke(); ctx.restore();
    }
  }
  // Textes.
  for (const tx of doc.texts || []) {
    if (!tx.text) continue;
    const size = (tx.size || 6) / 100 * Math.min(W, H);
    const fam = { sans: 'Inter, "Segoe UI", system-ui, sans-serif', serif: 'Georgia, "Times New Roman", serif', display: '"Arial Black", "Segoe UI Black", Inter, sans-serif', mono: 'Consolas, "SF Mono", monospace', round: '"Nunito", "Segoe UI", system-ui, sans-serif' }[tx.font || 'sans'];
    ctx.save();
    ctx.font = `${tx.weight || 700} ${size}px ${fam}`;
    ctx.fillStyle = tx.color || '#ffffff';
    ctx.textAlign = tx.align || 'center';
    ctx.textBaseline = 'top';
    if (tx.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = size * 0.25; ctx.shadowOffsetY = size * 0.06; }
    const maxW = (tx.maxW || 0.86) * W;
    const lines = [];
    for (const para of String(tx.text).split('\n')) {
      let cur = '';
      for (const w of para.split(/\s+/)) { const tryL = cur ? `${cur} ${w}` : w; if (ctx.measureText(tryL).width > maxW && cur) { lines.push(cur); cur = w; } else cur = tryL; }
      lines.push(cur);
    }
    const x = (tx.x ?? 0.5) * W;
    const y0 = (tx.y ?? 0.08) * H;
    let y = y0;
    let widest = 0;
    for (const l of lines) { ctx.fillText(l, x, y); widest = Math.max(widest, ctx.measureText(l).width); y += size * 1.18; }
    // Rectangle du bloc de texte (pour le sélectionner et le déplacer).
    const blockH = lines.length * size * 1.18;
    const al = tx.align || 'center';
    const bx = al === 'left' ? x : al === 'right' ? x - widest : x - widest / 2;
    textHits.push({ textId: tx.id, x: bx, y: y0, w: widest, h: blockH });
    ctx.restore();
    if (preview && selectedText === tx.id) {
      const p = size * 0.3;
      ctx.save(); ctx.strokeStyle = '#0a84ff'; ctx.lineWidth = Math.max(1.5, W / 700); ctx.setLineDash([W / 150, W / 200]);
      ctx.strokeRect(bx - p, y0 - p, widest + p * 2, blockH + p * 2); ctx.restore();
    }
  }
  // Filigrane (logo).
  const wm = doc.mark;
  if (wm && wm.image && media.get(wm.image)) {
    const im = media.get(wm.image);
    const w = (wm.size || 0.12) * W; const h = w * (im.height / im.width);
    const m = Math.min(W, H) * 0.04;
    const pos = wm.pos || 'br';
    const x = pos.includes('l') ? m : pos.includes('c') ? (W - w) / 2 : W - w - m;
    const y = pos.includes('t') ? m : H - h - m;
    ctx.save(); ctx.globalAlpha = wm.opacity ?? 0.85; ctx.drawImage(im, x, y, w, h); ctx.restore();
  }
  // Effets.
  const fx = doc.fx || {};
  if (fx.vignette) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${fx.vignette})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (fx.noise) grain(ctx, W, H, fx.noise, 11);
  ctx.restore();
  hits.textHits = textHits;
  return hits;
}

export function pointInQuad(x, y, q) {
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const [xi, yi] = q[i]; const [xj, yj] = q[j];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
