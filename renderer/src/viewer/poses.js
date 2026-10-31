/* Responsive Lab : mise en scène 2D des maquettes — poses (face, inclinée, isométrique, à plat, cascade,
   éventail…), animations toutes faites (entrée, flottement, orbite, défilement de la page…), ombres
   réelles, reflet, arrière-plans, export image et vidéo (avec musique). Rendu avec three.js : les
   maquettes sont des cartes plates (cadres officiels compris) posées dans l'espace. */
import { api } from '../core/api.js';
import { S } from '../core/state.js';
import { settings, persist } from '../core/settings.js';
import { esc, sleep, fmtTime } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast } from '../core/ui.js';
import { drawComposite } from '../devices/frames2d.js';
import { preloadSkin } from '../devices/skins.js';
import { fillBackground, BACKGROUNDS } from '../capture/photo.js';
import { saveCanvas, saveBytes } from '../capture/export.js';

let T = null;
const deg = (d) => (d * Math.PI) / 180;

export const POSES = {
  face: ['Face', 'single'],
  gauche: ['Tourné à gauche', 'rotate3d'],
  droite: ['Tourné à droite', 'rotate3d'],
  hero: ['Perspective', 'star'],
  flottant: ['Flottant', 'cloud'],
  iso: ['Isométrique', 'cube'],
  aplat: ['Posé à plat', 'grid'],
  cascade: ['Cascade', 'layers'],
  eventail: ['Éventail', 'shapes'],
  vedette: ['Vedette et satellites', 'target'],
  profondeur: ['Profondeur', 'distribute'],
  escalier: ['Escalier', 'floor'],
  grille: ['Mur de maquettes', 'multi'],
};

export const ANIMS = {
  none: 'Aucune', entree: 'Entrée par le bas', apparition: 'Apparition', flottement: 'Flottement', balancement: 'Balancement',
  pivot: 'Pivot révélateur', rotation: 'Tour complet', orbite: 'Orbite de la caméra', zoom: 'Zoom avant', defilement: 'Défilement de la page', carrousel: 'Carrousel',
};

const FORMATS = { '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1], '4:5': [4, 5], '4:3': [4, 3] };

const DEFAULTS = {
  pose: 'hero', anim: 'flottement', all: true, format: '16:9', bg: 'light', bgColor: '#e8e8ee', fov: 28, rx: 0, ry: 0, rz: 0, spacing: 1, zoom: 1,
  shadow: 0.14, soft: 0.75, lift: 1, lightAngle: -30, reflect: false, reflectAmount: 0.25, duration: 6, fps: 30, vsize: '1080', isize: '2160', vformat: 'mp4', corner: 0,
  surface: 'none', gobo: 'none', goboAmount: 0.35, dof: 0, grain: 0, vignette: 0, photo: 'studio',
};

// ------------------------------------------------------------------ scènes photo réalistes
/* Surfaces (textures générées, aucune photo) et motifs d'ombre de lumière naturelle (store, fenêtre,
 * feuillage), profondeur de champ et grain : les maquettes semblent photographiées sur une vraie table. */
export const SURFACES = {
  none: 'Aucune', bois: 'Bois clair', noyer: 'Noyer', marbre: 'Marbre', beton: 'Béton', lin: 'Lin', papier: 'Papier', ardoise: 'Ardoise', sable: 'Sable',
};
export const GOBOS = { none: 'Aucune', store: 'Store', fenetre: 'Fenêtre', feuillage: 'Feuillage' };
export const PHOTO_SCENES = {
  studio: ['Studio épuré', 'frame', { surface: 'none', gobo: 'none', dof: 0, grain: 0, vignette: 0, bg: 'light', pose: 'hero', shadow: 0.14, soft: 0.75 }],
  bureau: ['Bureau en bois', 'grid', { surface: 'bois', gobo: 'store', goboAmount: 0.38, dof: 0.35, grain: 0.18, vignette: 0.25, pose: 'aplat', shadow: 0.42, soft: 0.45, lightAngle: -35 }],
  marbre: ['Marbre et feuillage', 'sparkle', { surface: 'marbre', gobo: 'feuillage', goboAmount: 0.42, dof: 0.25, grain: 0.12, vignette: 0.2, pose: 'aplat', shadow: 0.38, soft: 0.55, lightAngle: 25 }],
  atelier: ['Mur de béton', 'cube', { surface: 'beton', gobo: 'fenetre', goboAmount: 0.4, dof: 0.15, grain: 0.22, vignette: 0.35, pose: 'hero', shadow: 0.5, soft: 0.4, lightAngle: -40 }],
  lin: ['Lin naturel', 'layers', { surface: 'lin', gobo: 'none', dof: 0.4, grain: 0.15, vignette: 0.2, pose: 'iso', shadow: 0.36, soft: 0.7, lightAngle: -20 }],
  nuit: ['Ardoise, soir', 'target', { surface: 'ardoise', gobo: 'store', goboAmount: 0.5, dof: 0.3, grain: 0.25, vignette: 0.5, pose: 'aplat', shadow: 0.55, soft: 0.35, lightAngle: 40 }],
  papier: ['Papier et cascade', 'shapes', { surface: 'papier', gobo: 'feuillage', goboAmount: 0.3, dof: 0.2, grain: 0.1, vignette: 0.15, pose: 'cascade', shadow: 0.34, soft: 0.6, lightAngle: -25 }],
  plage: ['Sable chaud', 'cloud', { surface: 'sable', gobo: 'feuillage', goboAmount: 0.45, dof: 0.3, grain: 0.2, vignette: 0.25, pose: 'escalier', shadow: 0.5, soft: 0.5, lightAngle: 30 }],
};

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// Bruit de valeur lissé (tuile répétable), base des textures.
function valueNoise(N, cells, seed) {
  const r = rng(seed);
  const g = Array.from({ length: cells * cells }, () => r());
  const at = (x, y) => g[((y % cells + cells) % cells) * cells + ((x % cells + cells) % cells)];
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const fx = (x / N) * cells; const fy = (y / N) * cells;
      const x0 = Math.floor(fx); const y0 = Math.floor(fy);
      const sx = fx - x0; const sy = fy - y0;
      const u = sx * sx * (3 - 2 * sx); const v = sy * sy * (3 - 2 * sy);
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * u;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * u;
      out[y * N + x] = a + (b - a) * v;
    }
  }
  return out;
}
function fbm(N, seed, oct = [[4, 0.5], [8, 0.25], [16, 0.15], [48, 0.1]]) {
  const out = new Float32Array(N * N);
  oct.forEach(([c, w], i) => { const n = valueNoise(N, c, seed + i * 17); for (let k = 0; k < out.length; k++) out[k] += n[k] * w; });
  return out;
}
const surfCache = new Map();
export function surfaceCanvas(kind) {
  if (surfCache.has(kind)) return surfCache.get(kind);
  const N = 512;
  const c = document.createElement('canvas'); c.width = N; c.height = N;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(N, N);
  const d = img.data;
  const mix = (a, b, t) => a + (b - a) * t;
  const put = (i, r, g, b) => { d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; };
  const n = fbm(N, kind.length * 31 + 7);
  const fine = valueNoise(N, 128, 99);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x; const v = n[i]; const f = fine[i];
      if (kind === 'bois' || kind === 'noyer') {
        // Veines longues : anneaux déformés par le bruit.
        const ring = Math.sin((y / N) * 70 + v * 9 + Math.sin((x / N) * 6.28) * 0.6) * 0.5 + 0.5;
        const t = Math.pow(ring, 2.2) * 0.55 + f * 0.25 + v * 0.2;
        const [a, b] = kind === 'noyer' ? [[92, 60, 40], [58, 36, 24]] : [[214, 182, 140], [176, 136, 92]];
        put(i, mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t));
      } else if (kind === 'marbre') {
        const vein = Math.abs(Math.sin((x / N + y / N) * 9 + v * 11));
        const t = Math.pow(1 - vein, 9) * 0.55 + f * 0.05;
        put(i, mix(244, 150, t), mix(243, 150, t), mix(240, 156, t));
      } else if (kind === 'beton') {
        const t = v * 0.55 + f * 0.35 + (rng(i)() < 0.004 ? 0.4 : 0);
        put(i, mix(196, 140, t), mix(194, 138, t), mix(190, 136, t));
      } else if (kind === 'lin') {
        const weave = (Math.sin(x * 1.9) * 0.5 + 0.5) * 0.5 + (Math.sin(y * 1.9) * 0.5 + 0.5) * 0.5;
        const t = weave * 0.25 + v * 0.35 + f * 0.25;
        put(i, mix(226, 196, t), mix(218, 186, t), mix(204, 170, t));
      } else if (kind === 'papier') {
        const t = v * 0.25 + f * 0.35;
        put(i, mix(248, 228, t), mix(246, 225, t), mix(241, 218, t));
      } else if (kind === 'ardoise') {
        const t = v * 0.5 + f * 0.4;
        put(i, mix(46, 26, t), mix(48, 28, t), mix(52, 31, t));
      } else {
        const t = v * 0.4 + f * 0.45;
        put(i, mix(232, 204, t), mix(214, 182, t), mix(186, 150, t));
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  surfCache.set(kind, c);
  return c;
}

// Motif d'ombre projetée par la lumière naturelle (blanc = lumière, sombre = ombre), flouté selon la douceur.
const goboCache = new Map();
function goboCanvas(kind, w, h, angle, soft) {
  const key = `${kind}|${w}x${h}|${angle}|${soft.toFixed(2)}`;
  if (goboCache.has(key)) return goboCache.get(key);
  if (goboCache.size > 6) goboCache.clear();
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  const blur = Math.max(1, Math.round(Math.min(w, h) * (0.004 + soft * 0.02)));
  g.filter = `blur(${blur}px)`;
  g.translate(w / 2, h / 2);
  g.rotate(deg(angle * 0.6 - 18));
  const D = Math.hypot(w, h);
  g.fillStyle = '#000';
  const r = rng(kind.length * 13 + 5);
  if (kind === 'store') {
    const step = D / 16;
    for (let y = -D / 2; y < D / 2; y += step) g.fillRect(-D / 2, y, D, step * 0.42);
  } else if (kind === 'fenetre') {
    const cw = D * 0.34; const ch = D * 0.3; const bar = D * 0.022;
    g.fillRect(-D / 2, -D / 2, D, D);
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#fff';
    for (const [x, y] of [[-cw - bar / 2, -ch - bar / 2], [bar / 2, -ch - bar / 2], [-cw - bar / 2, bar / 2], [bar / 2, bar / 2]]) g.fillRect(x + D * 0.08, y - D * 0.06, cw, ch);
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = '#fff'; g.fillRect(-D / 2, -D / 2, D, D);
    g.globalCompositeOperation = 'source-over';
  } else {
    // Feuillage : feuilles allongées réparties sur un côté de l'image.
    for (let i = 0; i < 70; i++) {
      const x = (r() - 0.15) * D * 0.7; const y = (r() - 0.5) * D * 0.9;
      const lw = D * (0.035 + r() * 0.05); const lh = lw * (0.35 + r() * 0.2);
      g.save(); g.translate(x, y); g.rotate(r() * Math.PI);
      g.beginPath(); g.ellipse(0, 0, lw, lh, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    g.lineWidth = D * 0.006;
    g.strokeStyle = '#000';
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(-D * 0.1 + r() * D * 0.2, -D / 2); g.quadraticCurveTo(r() * D * 0.3, 0, -D * 0.05 + r() * D * 0.4, D / 2); g.stroke(); }
  }
  goboCache.set(key, c);
  return c;
}

let grainTile = null;
function grainCanvas() {
  if (grainTile) return grainTile;
  grainTile = document.createElement('canvas'); grainTile.width = 256; grainTile.height = 256;
  const g = grainTile.getContext('2d');
  const im = g.createImageData(256, 256);
  const r = rng(77);
  for (let i = 0; i < 256 * 256; i++) { const v = 128 + (r() - 0.5) * 120; im.data[i * 4] = v; im.data[i * 4 + 1] = v; im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
  g.putImageData(im, 0, 0);
  return grainTile;
}

/* Effets photo appliqués à l'image rendue : profondeur de champ (flou haut et bas), lumière naturelle,
 * vignettage et grain. Les zones transparentes restent transparentes. */
export function photoPost(ctx, src, w, h, c, focus = null) {
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  const tmp = (fill) => { const t = document.createElement('canvas'); t.width = w; t.height = h; const g = t.getContext('2d'); fill(g); return t; };
  if (c.dof > 0.01) {
    const blur = Math.max(1, Math.round(c.dof * Math.min(w, h) * 0.014));
    const b = tmp((g) => {
      g.filter = `blur(${blur}px)`; g.drawImage(src, 0, 0, w, h); g.filter = 'none';
      g.globalCompositeOperation = 'destination-in';
      // Zone nette : les maquettes elles-mêmes (projetées à l'écran), le flou croît au-dessus et au-dessous.
      const top = focus ? Math.max(0, Math.min(0.9, focus[0])) : 0.3;
      const bot = focus ? Math.min(1, Math.max(top + 0.1, focus[1])) : 0.7;
      const gr = g.createLinearGradient(0, 0, 0, h);
      const stop = (x, a) => gr.addColorStop(Math.max(0, Math.min(1, x)), `rgba(0,0,0,${a})`);
      if (top > 0.02) { stop(0, 1); stop(Math.max(0.001, top - 0.18), 1); }
      stop(top + 0.02, 0); stop(Math.max(top + 0.03, bot - 0.02), 0);
      if (bot < 0.98) { stop(Math.min(0.999, bot + 0.18), 1); stop(1, 1); }
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    ctx.drawImage(b, 0, 0);
  }
  const shade = (paint) => {
    // Calque d'ombre limité aux pixels de l'image, puis multiplié.
    const t = tmp((g) => { paint(g); g.globalCompositeOperation = 'destination-in'; g.drawImage(src, 0, 0, w, h); });
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(t, 0, 0); ctx.restore();
  };
  if (c.gobo && c.gobo !== 'none' && c.goboAmount > 0) {
    const pat = goboCanvas(c.gobo, Math.round(w), Math.round(h), c.lightAngle || 0, c.soft ?? 0.5);
    shade((g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.globalAlpha = Math.min(0.85, c.goboAmount); g.drawImage(pat, 0, 0); g.globalAlpha = 1; });
  }
  if (c.vignette > 0.01) {
    shade((g) => {
      const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.6);
      gr.addColorStop(0, '#fff'); gr.addColorStop(1, `rgb(${Math.round(255 * (1 - c.vignette * 0.75))},${Math.round(255 * (1 - c.vignette * 0.75))},${Math.round(255 * (1 - c.vignette * 0.72))})`);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
  }
  if (c.grain > 0.01) {
    const t = tmp((g) => { g.fillStyle = g.createPattern(grainCanvas(), 'repeat'); g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'destination-in'; g.drawImage(src, 0, 0, w, h); });
    ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = Math.min(0.6, c.grain * 0.55); ctx.drawImage(t, 0, 0); ctx.restore();
  }
}


const easeOut = (t) => 1 - (1 - t) ** 3;
const easeBack = (t) => { const c1 = 1.5; const c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function cfg() {
  const c = settings.poses || (settings.poses = {});
  for (const [k, v] of Object.entries(DEFAULTS)) if (c[k] === undefined) c[k] = v;
  // 4.1 : ombres plus légères par défaut (on ne touche pas un réglage choisi à la main).
  if (!c.v41) { if (c.shadow === 0.32) c.shadow = 0.14; if (c.soft === 0.6) c.soft = 0.75; c.v41 = true; }
  return c;
}

// Dispositions : position (unités = hauteur de la plus grande maquette), rotation (degrés), échelle.
function layoutFor(pose, items, c) {
  const n = items.length;
  const H = Math.max(...items.map((it) => it.h));
  const gap = 0.14 * H * c.spacing;
  const row = () => {
    const total = items.reduce((a, it) => a + it.w, 0) + gap * (n - 1);
    let x = -total / 2;
    return items.map((it) => { const cx = x + it.w / 2; x += it.w + gap; return cx; });
  };
  const xs = row();
  const out = items.map((it, i) => ({ pos: [xs[i], it.h / 2, 0], rot: [0, 0, 0], s: 1 }));
  let ground = 'wall';
  let view = [0, 0.05, 1];
  const mid = (i) => i - (n - 1) / 2;
  switch (pose) {
    case 'gauche': out.forEach((o) => { o.rot = [0, 28, 0]; }); view = [-0.15, 0.08, 1]; break;
    case 'droite': out.forEach((o) => { o.rot = [0, -28, 0]; }); view = [0.15, 0.08, 1]; break;
    case 'hero': out.forEach((o, i) => { o.rot = [-9, -24, 1.5]; o.pos[2] = -Math.abs(mid(i)) * 0.15 * H; }); view = [0.25, 0.22, 1]; break;
    case 'flottant': out.forEach((o, i) => { o.rot = [-12, -20, 5 - i * 2]; o.pos[1] += (i % 2 ? -0.05 : 0.05) * H; o.pos[2] = 0.25 * H * c.lift; }); view = [0.2, 0.15, 1]; break;
    case 'iso':
    case 'aplat':
    case 'escalier': {
      ground = 'floor';
      const k = pose === 'escalier' ? 0.55 : 1;
      out.forEach((o, i) => {
        o.rot = [-90, 0, pose === 'aplat' ? (i % 2 ? 7 : -6) : 0];
        o.pos = [xs[i] * k, 0.004 * H + (pose === 'escalier' ? i * 0.12 * H : 0), pose === 'escalier' ? -i * 0.35 * H : (pose === 'aplat' ? (i % 2 ? 0.06 : -0.05) * H : 0)];
      });
      view = pose === 'aplat' ? [0.0001, 1, 0.02] : [0.85, 0.95, 1];
      break;
    }
    case 'cascade': out.forEach((o, i) => { const f = mid(i); o.pos = [f * items[i].w * 0.5, items[i].h / 2 - f * 0.06 * H, i * 0.12 * H]; o.rot = [-5, -16, 0]; }); view = [0.25, 0.12, 1]; break;
    case 'eventail': {
      const R = H * 1.6;
      out.forEach((o, i) => { const a = deg(mid(i) * 13 * c.spacing); o.pos = [Math.sin(a) * R, Math.cos(a) * R - R + items[i].h / 2, i * 0.01 * H]; o.rot = [0, 0, -mid(i) * 13 * c.spacing]; });
      break;
    }
    case 'vedette': {
      const main = items.findIndex((it) => it.focused);
      const order = [main >= 0 ? main : 0, ...items.map((_, i) => i).filter((i) => i !== (main >= 0 ? main : 0))];
      order.forEach((idx, k) => {
        const o = out[idx];
        if (k === 0) { o.pos = [0, items[idx].h / 2, 0.2 * H]; o.rot = [-6, -14, 0]; return; }
        const side = k % 2 ? -1 : 1;
        const lvl = Math.ceil(k / 2);
        o.s = 0.72;
        o.pos = [side * (items[order[0]].w / 2 + items[idx].w * 0.36 + (lvl - 1) * items[idx].w * 0.55) * c.spacing, items[idx].h * 0.72 / 2 + 0.05 * H, -0.3 * H * lvl];
        o.rot = [-4, -side * 22, 0];
      });
      view = [0.1, 0.12, 1];
      break;
    }
    case 'profondeur': out.forEach((o, i) => { o.pos = [mid(i) * 0.45 * H * c.spacing, items[i].h / 2, -i * 0.45 * H * c.spacing]; o.rot = [0, -38, 0]; }); view = [0.35, 0.12, 1]; break;
    case 'grille': {
      const cols = Math.ceil(Math.sqrt(n * 1.6));
      const cw = Math.max(...items.map((it) => it.w)) + gap;
      const rh = H + gap;
      const rows = Math.ceil(n / cols);
      out.forEach((o, i) => { const r = Math.floor(i / cols); const q = i % cols; o.pos = [(q - (Math.min(cols, n) - 1) / 2) * cw, (rows - 1 - r) * rh + items[i].h / 2, 0]; });
      break;
    }
    default: break;
  }
  // Réglages fins : rotation supplémentaire commune.
  for (const o of out) { o.rot = [o.rot[0] + (ground === 'floor' ? 0 : c.rx), o.rot[1] + (ground === 'floor' ? 0 : c.ry), o.rot[2] + c.rz]; }
  if (ground === 'floor') view = [view[0] + c.ry / 90, view[1], view[2] + c.rx / 90];
  return { out, ground, view };
}

class PoseStage {
  constructor(root) {
    this.root = root;
    this.items = [];
    this.time = 0;
    this.playing = false;
  }

  async init() {
    T = T || await import('../studio/three.js');
    const canvas = this.root.querySelector('#psCanvas');
    const r = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.outputColorSpace = T.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = T.VSMShadowMap;
    this.renderer = r;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(28, 16 / 9, 0.01, 1000);
    this.light = new T.DirectionalLight(0xffffff, 1);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    this.light.shadow.bias = -0.0005;
    this.scene.add(this.light, this.light.target);
    this.receiver = new T.Mesh(new T.PlaneGeometry(400, 400), new T.ShadowMaterial({ opacity: 0.3 }));
    this.receiver.receiveShadow = true;
    this.scene.add(this.receiver);
    this.group = new T.Group();
    this.scene.add(this.group);
    // Lumières douces pour l'épaisseur des appareils (les écrans eux-mêmes ne sont pas éclairés).
    this.hemi = new T.HemisphereLight(0xffffff, 0xb8bcc8, 1.1);
    this.scene.add(this.hemi);
    this.out = this.root.querySelector('#psOut');
    this.shadowMat = this.receiver.material;
    const pm = new T.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new T.RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
  }

  // Corps de l'appareil : une tranche arrondie extrudée derrière la carte, aux cotes réelles (épaisseur en mm).
  slabFor(it) {
    const L = it.L;
    const b = L.body;
    const form = L.form || 'phone';
    if (!b || !b.w || L.skin || !['phone', 'tablet', 'watch', 'handheld'].includes(form)) return null;
    const u = it.h / L.TH;
    const mm = (L.phys && L.phys.bd) || (form === 'tablet' ? 6.5 : form === 'watch' ? 10 : 8.2);
    const D = Math.max(0.006, mm * L.k * u);
    const w = b.w * u;
    const h = b.h * u;
    const rr = Array.isArray(b.r) ? b.r : [b.r || 0, b.r || 0, b.r || 0, b.r || 0];
    const bev = Math.min(D * 0.42, w * 0.05);
    const R = Math.max(0.0005, Math.min(rr[0] * u, w / 2, h / 2) - bev);
    const ww = w - 2 * bev; const hh = h - 2 * bev;
    const sh = new T.Shape();
    sh.moveTo(-ww / 2 + R, -hh / 2);
    sh.lineTo(ww / 2 - R, -hh / 2); sh.quadraticCurveTo(ww / 2, -hh / 2, ww / 2, -hh / 2 + R);
    sh.lineTo(ww / 2, hh / 2 - R); sh.quadraticCurveTo(ww / 2, hh / 2, ww / 2 - R, hh / 2);
    sh.lineTo(-ww / 2 + R, hh / 2); sh.quadraticCurveTo(-ww / 2, hh / 2, -ww / 2, hh / 2 - R);
    sh.lineTo(-ww / 2, -hh / 2 + R); sh.quadraticCurveTo(-ww / 2, -hh / 2, -ww / 2 + R, -hh / 2);
    const geo = new T.ExtrudeGeometry(sh, {
      depth: Math.max(0.0005, D - 2 * bev), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 5, curveSegments: 18,
    });
    const col = new T.Color(L.color || '#8e8e93');
    const mat = new T.MeshStandardMaterial({ color: col, metalness: 0.62, roughness: 0.3 });
    const m = new T.Mesh(geo, mat);
    // Centre du corps dans la carte (pixels → unités), face avant juste derrière l'écran.
    const cx = (b.x + b.w / 2 - L.TW / 2) * u;
    const cy = (L.TH / 2 - (b.y + b.h / 2)) * u;
    m.position.set(cx, cy, -D + bev - 0.0006);
    m.castShadow = true;
    return m;
  }

  // Capture des maquettes de la planche (avec cadres officiels) et, pour le défilement, des pages entières.
  async capture(all, wantFull) {
    const board = S.board;
    const views = all ? board.list : [board.focused && board.focused.url ? board.focused : board.list.find((v) => v.url)];
    const items = [];
    for (const v of views) {
      if (!v || !v.url) continue;
      const L = v.layoutFor({ framesOn: true });
      // eslint-disable-next-line no-await-in-loop
      if (L.skin) await preloadSkin(L.skin.v);
      let page = null;
      // Une capture peut échouer si la page se recharge : on réessaie une fois, puis on passe à l'appareil suivant.
      for (let attempt = 0; attempt < 2 && !page; attempt++) {
        // eslint-disable-next-line no-await-in-loop
        try { page = await v.capturePage(); } catch (e) { console.warn('capture', e); await sleep(900); }
      }
      if (!page) continue;
      let full = null;
      // eslint-disable-next-line no-await-in-loop
      if (wantFull) { try { full = await v.capturePage({ fullPage: true, maxSide: 12000 }); } catch { full = null; } }
      const k = Math.min(3, 2400 / Math.max(L.TW, L.TH));
      const c = document.createElement('canvas');
      c.width = Math.round(L.TW * k);
      c.height = Math.round(L.TH * k);
      const it = {
        v, L, k, page, full, canvas: c, colors: v.statusColors(), focused: v === board.focused, name: board.describe(v),
      };
      this.paintItem(it, 0);
      items.push(it);
    }
    if (!items.length) throw new Error('capture');
    // Tailles relatives : hauteurs en pixels CSS du cadre, ramenées à une unité.
    const Hmax = Math.max(...items.map((it) => it.L.TH), 1);
    for (const it of items) { it.h = it.L.TH / Hmax; it.w = it.L.TW / Hmax; }
    return items;
  }

  paintItem(it, scroll) {
    const ctx = it.canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, it.canvas.width, it.canvas.height);
    ctx.setTransform(it.k, 0, 0, it.k, 0, 0);
    let image = it.page;
    if (scroll > 0 && it.full) {
      const ratio = it.full.width / it.L.vp.w;
      const sh = Math.min(it.full.height, Math.round(it.L.vp.h * ratio));
      const sy = Math.round((it.full.height - sh) * scroll);
      if (!it.slice) { it.slice = document.createElement('canvas'); }
      it.slice.width = it.full.width;
      it.slice.height = sh;
      it.slice.getContext('2d').drawImage(it.full, 0, sy, it.full.width, sh, 0, 0, it.full.width, sh);
      image = it.slice;
    }
    drawComposite(ctx, it.L, {
      image, px: it.k, sbBg: it.colors.bg, sbFg: it.colors.fg, shadow: false,
    });
    if (it.tex) it.tex.needsUpdate = true;
  }

  build(items) {
    for (const o of [...this.group.children]) this.group.remove(o);
    for (const it of this.items) { if (it.tex) it.tex.dispose(); }
    this.items = items;
    for (const it of items) {
      const tex = new T.CanvasTexture(it.canvas);
      tex.colorSpace = T.SRGBColorSpace;
      tex.anisotropy = 8;
      it.tex = tex;
      const geo = new T.PlaneGeometry(it.w, it.h);
      const mat = new T.MeshBasicMaterial({ map: tex, transparent: true, side: T.DoubleSide, toneMapped: false });
      const mesh = new T.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.customDepthMaterial = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map: tex, alphaTest: 0.5 });
      const holder = new T.Group();
      holder.add(mesh);
      const slab = this.slabFor(it);
      if (slab) { holder.add(slab); it.slab = slab; mesh.castShadow = false; }
      // Reflet : copie retournée, atténuée.
      const refl = new T.Mesh(geo, new T.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.25, side: T.DoubleSide, toneMapped: false, alphaMap: this.fadeTex() }));
      refl.scale.y = -1;
      refl.visible = false;
      it.mesh = mesh;
      it.refl = refl;
      it.holder = holder;
      this.group.add(holder, refl);
    }
  }

  fadeTex() {
    if (this._fade) return this._fade;
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const g = c.getContext('2d').createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#000'); g.addColorStop(0.55, '#000'); g.addColorStop(1, '#fff');
    const ctx = c.getContext('2d'); ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
    this._fade = new T.CanvasTexture(c);
    return this._fade;
  }

  // Applique la disposition et le réglage de la caméra (pose finale = image fixe).
  arrange(c) {
    const L = layoutFor(c.pose, this.items, c);
    this.base = L;
    const H = 1;
    // Récepteur d'ombre : mur derrière, ou sol dessous.
    const box = new T.Box3();
    this.items.forEach((it, i) => { this.place(it, L.out[i], {}); it.holder.updateMatrixWorld(true); box.expandByObject(it.holder); });
    this.box = box;
    if (L.ground === 'floor') {
      this.receiver.rotation.set(-Math.PI / 2, 0, 0);
      this.receiver.position.set(0, -0.001, 0);
    } else {
      this.receiver.rotation.set(0, 0, 0);
      this.receiver.position.set(0, 0, box.min.z - 0.16 * H * c.lift - 0.02);
    }
    this.applySurface(c, L.ground);
    // Lumière : au-dessus, devant, tournée selon le réglage.
    const ctr = box.getCenter(new T.Vector3());
    const a = deg(c.lightAngle);
    const dir = L.ground === 'floor' ? new T.Vector3(Math.sin(a) * 0.5, 1, Math.cos(a) * 0.5) : new T.Vector3(Math.sin(a) * 0.6, 0.9, 1.1);
    this.light.position.copy(ctr).add(dir.normalize().multiplyScalar(20));
    this.light.target.position.copy(ctr);
    const sc = this.light.shadow.camera;
    const R = Math.max(box.getSize(new T.Vector3()).length(), 1) * 1.5;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 0.1; sc.far = 60;
    sc.updateProjectionMatrix();
    this.light.shadow.radius = 2 + c.soft * 22;
    this.light.shadow.blurSamples = 8 + Math.round(c.soft * 8);
    this.light.shadow.needsUpdate = true;
    // Reflet (poses debout seulement).
    const floorY = box.min.y;
    this.items.forEach((it) => {
      it.refl.visible = Boolean(c.reflect) && L.ground === 'wall';
      it.refl.material.opacity = c.reflectAmount;
      it.floorY = floorY;
    });
    this.fitCamera(c);
  }

  place(it, o, { dy = 0, drx = 0, dry = 0, drz = 0, ds = 1, alpha = 1, dx = 0 } = {}) {
    it.holder.position.set(o.pos[0] + dx, o.pos[1] + dy, o.pos[2]);
    it.holder.rotation.set(deg(o.rot[0] + drx), deg(o.rot[1] + dry), deg(o.rot[2] + drz), 'YXZ');
    it.holder.scale.setScalar(o.s * ds);
    // Poses à plat : une maquette inclinée par l'animation ne doit jamais traverser la table.
    if (this.base && this.base.ground === 'floor') {
      it.holder.updateMatrixWorld(true);
      const b = (this._lb || (this._lb = new T.Box3())).setFromObject(it.holder);
      const floor = 0.002;
      if (b.min.y < floor) it.holder.position.y += floor - b.min.y;
    }
    it.mesh.material.opacity = alpha;
    if (it.slab) { it.slab.material.transparent = alpha < 1; it.slab.material.opacity = alpha; }
    if (it.refl.visible) {
      it.refl.position.set(o.pos[0] + dx, 2 * (it.floorY ?? 0) - (o.pos[1] + dy), o.pos[2]);
      it.refl.rotation.set(-deg(o.rot[0] + drx), deg(o.rot[1] + dry), -deg(o.rot[2] + drz), 'YXZ');
      it.refl.scale.set(o.s * ds, -o.s * ds, o.s * ds);
      it.refl.material.opacity = (this.cfgRef ? this.cfgRef.reflectAmount : 0.25) * alpha;
    }
  }

  fitCamera(c) {
    const cam = this.camera;
    cam.fov = c.fov;
    const box = this.box;
    const ctr = box.getCenter(new T.Vector3());
    const size = box.getSize(new T.Vector3());
    const dir = new T.Vector3(...this.base.view).normalize();
    // Distance : on recule jusqu'à ce que les huit coins de la boîte tiennent dans le cadre.
    const corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new T.Vector3(x, y, z));
    let d = Math.max(size.length(), 0.5);
    const pad = 1.22 / c.zoom;
    for (let i = 0; i < 40; i++) {
      cam.position.copy(ctr).addScaledVector(dir, d);
      cam.up.set(0, 1, 0);
      if (Math.abs(dir.y) > 0.99) cam.up.set(0, 0, -1);
      cam.lookAt(ctr);
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
      let m = 0;
      for (const p of corners) { const q = p.clone().project(cam); m = Math.max(m, Math.abs(q.x), Math.abs(q.y)); }
      const target = 1 / pad;
      if (Math.abs(m - target) < 0.005) break;
      d *= m / target;
    }
    this.camBase = { pos: cam.position.clone(), target: ctr.clone(), d, dir };
  }

  setSize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  async background(c, w, h) {
    if (c.bg === 'transparent') { this.scene.background = null; this.renderer.setClearColor(0, 0); return; }
    const key = `${c.bg}|${c.bgColor}|${w}x${h}|${settings.photo.bgImage ? settings.photo.bgImage.length : 0}`;
    if (this.bgKey === key) return;
    const cv = document.createElement('canvas');
    cv.width = Math.max(2, Math.round(w)); cv.height = Math.max(2, Math.round(h));
    const prev = { bg: settings.photo.bg, col: settings.photo.bgColor };
    settings.photo.bgColor = c.bgColor;
    await fillBackground(cv.getContext('2d'), cv.width, cv.height, c.bg);
    settings.photo.bgColor = prev.col;
    if (this.bgTex) this.bgTex.dispose();
    this.bgTex = new T.CanvasTexture(cv);
    this.bgTex.colorSpace = T.SRGBColorSpace;
    this.scene.background = this.bgTex;
    this.bgKey = key;
  }

  // Animation au temps t (secondes).
  apply(c, t) {
    this.cfgRef = c;
    const D = c.duration;
    const f = clamp01(t / D);
    const n = this.items.length;
    const cam = this.camera;
    cam.position.copy(this.camBase.pos);
    cam.lookAt(this.camBase.target);
    this.items.forEach((it, i) => {
      const o = this.base.out[i];
      const H = it.h;
      const m = {};
      const st = n > 1 ? i * 0.12 : 0;
      switch (c.anim) {
        case 'entree': { const p = clamp01((t - st - 0.1) / 1.1); m.dy = -(1 - easeBack(p)) * H * 0.8; m.alpha = clamp01(p * 2.5); m.drx = -(1 - easeOut(p)) * 14; break; }
        case 'apparition': { const p = clamp01((t - st * 1.5 - 0.1) / 0.9); m.ds = 0.82 + 0.18 * easeBack(p); m.alpha = clamp01(p * 2); break; }
        case 'flottement': { const w = Math.sin(f * Math.PI * 2 + i * 1.3); m.dy = w * H * 0.025; m.drx = Math.cos(f * Math.PI * 2 + i) * 2; m.drz = w * 1.5; break; }
        case 'balancement': m.dry = Math.sin(f * Math.PI * 2 + i * 0.6) * 10; break;
        case 'pivot': m.dry = -35 + 35 * inOut(clamp01((t - st) / (D * 0.7))); break;
        case 'rotation': m.dry = 360 * inOut(clamp01((t - st) / (D * 0.85))); break;
        case 'carrousel': { const total = this.box.getSize(new T.Vector3()).x + H * 0.4; m.dx = ((f * total + (o.pos[0] - this.box.min.x)) % total) - (o.pos[0] - this.box.min.x); break; }
        default: break;
      }
      this.place(it, o, m);
      if (c.anim === 'defilement' && it.full) this.paintItem(it, inOut(clamp01((t - 0.4) / (D - 0.9))));
    });
    if (c.anim === 'orbite') {
      const ang = deg(-14 + 28 * inOut(f));
      const off = this.camBase.pos.clone().sub(this.camBase.target).applyAxisAngle(new T.Vector3(0, 1, 0), ang);
      cam.position.copy(this.camBase.target).add(off);
      cam.lookAt(this.camBase.target);
    }
    if (c.anim === 'zoom') {
      const k = 1.18 - 0.26 * inOut(f);
      cam.position.copy(this.camBase.target).addScaledVector(this.camBase.dir, this.camBase.d * k);
      cam.lookAt(this.camBase.target);
    }
  }

  // Surface réelle (table, mur) sous les maquettes, ou simple ombre portée sur le fond.
  applySurface(c, ground) {
    const kind = c.surface && c.surface !== 'none' && SURFACES[c.surface] ? c.surface : null;
    if (!kind) {
      this.receiver.material = this.shadowMat;
      this.shadowMat.opacity = c.shadow;
      this.light.intensity = 1;
      this.hemi.intensity = 1.1;
      this.scene.environmentIntensity = 0.55;
      return;
    }
    if (!this.surfMats) this.surfMats = new Map();
    let m = this.surfMats.get(kind);
    if (!m) {
      const tex = new T.CanvasTexture(surfaceCanvas(kind));
      tex.colorSpace = T.SRGBColorSpace;
      tex.wrapS = T.RepeatWrapping; tex.wrapT = T.RepeatWrapping;
      tex.anisotropy = 8;
      m = new T.MeshStandardMaterial({ map: tex, roughness: kind === 'marbre' ? 0.35 : kind === 'ardoise' ? 0.6 : 0.85, metalness: 0 });
      this.surfMats.set(kind, m);
    }
    // Échelle de la texture : environ deux hauteurs de maquette par motif.
    const reps = 400 / (ground === 'floor' ? 1.6 : 2.2);
    m.map.repeat.set(reps, reps);
    m.map.needsUpdate = true;
    this.receiver.material = m;
    // Lumière plus directionnelle : des ombres franches comme au soleil.
    this.light.intensity = 1.2 + c.shadow * 3.2;
    this.hemi.intensity = Math.max(0.25, 1 - c.shadow * 0.9);
    this.scene.environmentIntensity = 0.35;
  }

  get hasPost() { const c = this.cfgRef || {}; return (c.dof > 0.01) || (c.gobo && c.gobo !== 'none' && c.goboAmount > 0) || c.vignette > 0.01 || c.grain > 0.01; }

  draw() { this.renderer.render(this.scene, this.camera); }

  // Aperçu : rendu 3D puis effets photo dans le canevas visible.
  render() {
    this.draw();
    const out = this.out;
    if (!out) return;
    const src = this.renderer.domElement;
    if (out.width !== src.width || out.height !== src.height) { out.width = src.width; out.height = src.height; }
    photoPost(out.getContext('2d'), src, out.width, out.height, this.cfgRef || cfg(), this.focusBand());
  }

  // Bande verticale occupée par les maquettes à l'écran (0 = haut, 1 = bas), pour la profondeur de champ.
  focusBand() {
    if (!this.items.length) return null;
    this.camera.updateMatrixWorld();
    let lo = 1; let hi = 0;
    const v = new T.Vector3();
    const box = new T.Box3();
    for (const it of this.items) {
      box.setFromObject(it.mesh);
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        v.set(x, y, z).project(this.camera);
        const f = (1 - v.y) / 2;
        lo = Math.min(lo, f); hi = Math.max(hi, f);
      }
    }
    return [lo, hi];
  }

  // Export : image finale à la taille du moteur de rendu, avec les effets.
  composeTo(ctx, w, h, c) {
    photoPost(ctx, this.renderer.domElement, w, h, c, this.focusBand());
  }
}

// ------------------------------------------------------------------ interface
let stage = null;
let raf = 0;

export async function openPoses() {
  const board = S.board;
  if (!board || !board.list.some((v) => v.url)) { toast("Ouvre d'abord un site ou un projet dans le Responsive Lab.", { kind: 'bad' }); return null; }
  const c = cfg();
  document.querySelector('.poses')?.remove();
  const root = document.createElement('div');
  root.className = 'poses';
  root.innerHTML = `
    <div class="ps-win glass">
      <header class="ps-head"><span class="sheet-icon">${icon('wand', 20)}</span><div><h2>Mise en scène 2D</h2><p>Les maquettes de la planche, posées et animées. Images et vidéos prêtes à publier.</p></div><span class="grow"></span><button class="icon-btn" data-ps="close" title="Fermer (Échap)">${icon('close', 16)}</button></header>
      <div class="ps-body">
        <div class="ps-view"><div class="ps-frame" id="psFrame"><canvas id="psCanvas"></canvas><canvas id="psOut"></canvas></div>
          <div class="ps-bar glass"><button class="dock-btn small" data-ps="play" title="Lire (Espace)">${icon('play', 16)}</button><input type="range" min="0" max="1" step="0.001" value="0" data-ps-time><span class="ps-t" data-ps-tlabel>0,0 s</span></div>
          <div class="ps-busy" id="psBusy" hidden></div>
        </div>
        <aside class="ps-side" id="psSide"></aside>
      </div>
    </div>`;
  document.body.appendChild(root);
  const busy = toast('Préparation des maquettes…', { busy: true, sticky: true });
  try {
    stage = new PoseStage(root);
    await stage.init();
    stage.build(await stage.capture(c.all, c.anim === 'defilement'));
  } catch (err) {
    console.error(err);
    busy.close();
    root.remove();
    toast("Les maquettes n'ont pas pu être capturées. Attends la fin du chargement de la page puis réessaie.", { kind: 'bad' });
    return null;
  }
  busy.close();
  renderSide(root);
  bind(root);
  await refresh(root, { rearrange: true });
  return stage;
}

/* Version intégrée (Studio › Maquettes) : même mise en scène, posée dans un conteneur de l'interface. */
export async function mountPoses(host, { onEmpty } = {}) {
  const old = host.querySelector(':scope > .ps-embed');
  if (old && stage && stage.root === old) { await refresh(old); return stage; }
  if (old) old.remove();
  document.querySelector('.poses:not(.ps-embed)')?.remove();
  if (stage) { play(stage.root, false); try { stage.renderer.dispose(); } catch { /* ignore */ } stage = null; }
  const board = S.board;
  const root = document.createElement('div');
  root.className = 'poses ps-embed';
  host.append(root);
  if (!board || !board.list.some((v) => v.url)) {
    root.innerHTML = `<div class="ps-empty"><span class="ps-empty-ic">${icon('phone', 26)}</span><h3>Aucun site dans les appareils</h3><p>Les maquettes viennent du Responsive Lab : ouvre ton site, choisis tes téléphones, tablettes et ordinateurs, puis reviens ici.</p><button class="btn primary" data-ps-empty>${icon('globe', 14)}<span>Ouvrir un site</span></button></div>`;
    root.querySelector('[data-ps-empty]').onclick = () => onEmpty && onEmpty();
    return null;
  }
  const c = cfg();
  root.innerHTML = `
    <div class="ps-body">
      <div class="ps-view"><div class="ps-frame" id="psFrame"><canvas id="psCanvas"></canvas><canvas id="psOut"></canvas></div>
        <div class="ps-bar glass"><button class="dock-btn small" data-ps="play" title="Lire (Espace)">${icon('play', 16)}</button><input type="range" min="0" max="1" step="0.001" value="0" data-ps-time><span class="ps-t" data-ps-tlabel>0,0 s</span><span class="dock-sep"></span><button class="dock-btn small" data-ps="recapture" title="Reprendre les captures des appareils">${icon('refreshCw', 15)}</button><button class="dock-btn small" data-ps="png" title="Exporter l’image">${icon('camera', 15)}</button><button class="dock-btn small" data-ps="video" title="Exporter la vidéo">${icon('film', 15)}</button></div>
        <div class="ps-busy" id="psBusy" hidden></div>
      </div>
      <aside class="ps-side" id="psSide"></aside>
    </div>`;
  root.querySelector('#psBusy').hidden = false;
  root.querySelector('#psBusy').innerHTML = '<div class="st-busy-card glass"><div class="spinner"></div><b>Capture des maquettes…</b><span>Les appareils du Responsive Lab</span></div>';
  try {
    stage = new PoseStage(root);
    await stage.init();
    stage.build(await stage.capture(c.all, c.anim === 'defilement'));
  } catch (err) {
    console.error(err);
    stage = null;
    root.innerHTML = `<div class="ps-empty"><span class="ps-empty-ic">${icon('warn', 26)}</span><h3>Capture impossible pour l’instant</h3><p>Attends la fin du chargement de la page dans le Responsive Lab, puis réessaie.</p><button class="btn primary" data-ps-retry>${icon('refreshCw', 14)}<span>Réessayer</span></button></div>`;
    root.querySelector('[data-ps-retry]').onclick = () => { root.remove(); mountPoses(host, { onEmpty }); };
    return null;
  }
  root.querySelector('#psBusy').hidden = true;
  renderSide(root);
  bind(root);
  await refresh(root, { rearrange: true });
  return stage;
}

export function pausePoses() {
  if (stage && stage.root.classList.contains('ps-embed')) play(stage.root, false);
}

export async function recapturePoses() {
  if (!stage) return;
  const c = cfg();
  const busy = toast('Capture des maquettes…', { busy: true, sticky: true });
  try { stage.build(await stage.capture(c.all, c.anim === 'defilement')); } finally { busy.close(); }
  renderSide(stage.root);
  await refresh(stage.root, { rearrange: true });
}

export function posesStage() { return stage; }

export async function applyPhotoScene(k) {
  if (!PHOTO_SCENES[k]) return;
  const c = cfg();
  Object.assign(c, PHOTO_SCENES[k][2]);
  c.photo = k;
  persist();
  if (stage && stage.root.isConnected) { renderSide(stage.root); await refresh(stage.root, { rearrange: true }); }
}

export function photoSceneThumb(k) { return sceneThumb(k); }
export function currentPhotoScene() { return cfg().photo; }

function renderSide(root) {
  const c = cfg();
  const chip = (key, cur, map) => `<div class="st-chips">${Object.entries(map).map(([k, l]) => `<button class="st-chip${String(cur) === String(k) ? ' on' : ''}" data-pset="${key}" data-val="${esc(k)}">${esc(Array.isArray(l) ? l[0] : l)}</button>`).join('')}</div>`;
  const range = (label, key, min, max, step, fmt) => `<div class="st-field"><span>${label}<b data-pval="${key}">${fmt(c[key])}</b></span><input type="range" min="${min}" max="${max}" step="${step}" value="${c[key]}" data-prange="${key}"></div>`;
  const pct = (v) => `${Math.round(v * 100)} %`;
  const dg = (v) => `${v}°`;
  const n = S.board.list.filter((v) => v.url).length;
  root.querySelector('#psSide').innerHTML = `
    <section class="st-card"><div class="st-field"><span>Pose</span></div>
      <div class="ps-poses">${Object.entries(POSES).map(([k, [l, ic]]) => `<button class="ps-pose${c.pose === k ? ' on' : ''}" data-pset="pose" data-val="${k}">${icon(ic, 18)}<span>${esc(l)}</span></button>`).join('')}</div>
      ${n > 1 ? `<div class="st-field"><span>Maquettes</span>${chip('all', c.all ? '1' : '0', { 1: `Toute la planche (${n})`, 0: "L'appareil actif" })}</div>` : ''}
    </section>
    <section class="st-card"><div class="st-field"><span>Scène photo réaliste</span></div>
      ${root.classList.contains('ps-embed') ? '' : `<div class="ps-scenes">${Object.entries(PHOTO_SCENES).map(([k, [l]]) => `<button class="ps-scene${c.photo === k ? ' on' : ''}" data-ps-scene="${k}" title="${esc(l)}"><i style="${sceneThumb(k)}"></i><span>${esc(l)}</span></button>`).join('')}</div>`}
      <div class="st-field"><span>Surface</span>${chip('surface', c.surface, SURFACES)}</div>
      <div class="st-field"><span>Lumière naturelle</span>${chip('gobo', c.gobo, GOBOS)}</div>
      ${c.gobo !== 'none' ? range('Force des ombres de lumière', 'goboAmount', 0.05, 0.8, 0.01, pct) : ''}
      ${range('Profondeur de champ', 'dof', 0, 1, 0.01, pct)}${range('Vignettage', 'vignette', 0, 1, 0.01, pct)}${range('Grain photo', 'grain', 0, 1, 0.01, pct)}
    </section>
    <section class="st-card"><div class="st-field"><span>Animation</span></div>${chip('anim', c.anim, ANIMS)}
      ${range('Durée', 'duration', 2, 20, 0.5, (v) => `${v} s`)}
    </section>
    <section class="st-card"><div class="st-field"><span>Réglages</span></div>
      ${range('Inclinaison avant', 'rx', -40, 40, 1, dg)}${range('Rotation', 'ry', -60, 60, 1, dg)}${range('Penché', 'rz', -30, 30, 1, dg)}
      ${range('Perspective', 'fov', 6, 60, 1, (v) => (v < 12 ? 'à plat' : v > 40 ? 'forte' : `${v}°`))}
      ${range('Espacement', 'spacing', 0.3, 2.5, 0.05, pct)}${range('Taille dans le cadre', 'zoom', 0.5, 1.6, 0.01, pct)}
    </section>
    <section class="st-card"><div class="st-field"><span>Ombre et reflet</span></div>
      ${range('Ombre', 'shadow', 0, 0.8, 0.01, pct)}${range('Douceur', 'soft', 0, 1, 0.01, pct)}${range('Décollement', 'lift', 0.1, 3, 0.05, pct)}${range('Direction de la lumière', 'lightAngle', -90, 90, 1, dg)}
      <label class="check-row"><input type="checkbox" data-pcheck="reflect" ${c.reflect ? 'checked' : ''}><span class="box"></span><span>Reflet au sol (poses debout)</span></label>
      ${c.reflect ? range('Force du reflet', 'reflectAmount', 0.05, 0.6, 0.01, pct) : ''}
    </section>
    <section class="st-card"><div class="st-field"><span>Arrière-plan</span></div>
      <div class="bg-swatches">${Object.entries(BACKGROUNDS).filter(([k]) => k !== 'image' || settings.photo.bgImage).map(([k, l]) => `<button class="bg-sw bg-${k}${c.bg === k ? ' on' : ''}" data-pset="bg" data-val="${k}" title="${l}" style="${k === 'color' ? `--c:${esc(c.bgColor)}` : k === 'image' ? `background-image:url('${esc(settings.photo.bgImage)}')` : ''}"></button>`).join('')}<label class="st-color custom" style="--c:${esc(c.bgColor)}" title="Couleur"><input type="color" value="${esc(c.bgColor)}" data-pcolor></label></div>
      <div class="st-field"><span>Format</span>${chip('format', c.format, Object.fromEntries(Object.keys(FORMATS).map((k) => [k, k])))}</div>
    </section>
    <section class="st-card"><div class="st-field"><span>Exporter</span></div>
      <div class="st-field"><span>Image</span>${chip('isize', c.isize, { 1080: '1080 px', 2160: '4K', 4320: '8K' })}</div>
      <div class="st-field"><span>Vidéo</span>${chip('vsize', c.vsize, { 720: '720p', 1080: '1080p', 2160: '4K' })}${chip('vformat', c.vformat, { mp4: 'MP4', webm: 'WebM' })}</div>
      <div class="st-btns"><button class="btn small primary" data-ps="png">${icon('camera', 13)}<span>Image PNG</span></button><button class="btn small primary" data-ps="video">${icon('film', 13)}<span>Vidéo</span></button></div>
      <div class="st-music">${icon('music', 15)}<span>${stage && stage.music ? `${esc(stage.music.name)}<small>${fmtTime(stage.music.buffer.duration * 1000)}</small>` : 'Sans musique<small>MP3, WAV, M4A, OGG</small>'}</span><button class="btn small" data-ps="music">${stage && stage.music ? 'Retirer' : 'Ajouter'}</button></div>
    </section>`;
}

const thumbs = new Map();
function sceneThumb(k) {
  const surf = PHOTO_SCENES[k][2].surface;
  if (!surf || surf === 'none') return 'background:linear-gradient(160deg,#f4f4f6,#d9dbe2)';
  if (!thumbs.has(surf)) {
    const c = document.createElement('canvas'); c.width = 96; c.height = 64;
    c.getContext('2d').drawImage(surfaceCanvas(surf), 0, 0, 192, 128, 0, 0, 96, 64);
    thumbs.set(surf, c.toDataURL('image/jpeg', 0.8));
  }
  return `background-image:url('${thumbs.get(surf)}');background-size:cover`;
}

function outSize(c, long) {
  const [a, b] = FORMATS[c.format] || FORMATS['16:9'];
  return a >= b ? { w: long, h: Math.round((long * b) / a / 2) * 2 } : { w: Math.round((long * a) / b / 2) * 2, h: long };
}

async function refresh(root, { rearrange = false } = {}) {
  const c = cfg();
  const view = root.querySelector('.ps-view');
  const frame = root.querySelector('#psFrame');
  const r = view.getBoundingClientRect();
  const [a, b] = FORMATS[c.format] || FORMATS['16:9'];
  let w = r.width - 40;
  let h = r.height - 90;
  if (w / h > a / b) w = h * (a / b); else h = w / (a / b);
  frame.style.width = `${Math.floor(w)}px`;
  frame.style.height = `${Math.floor(h)}px`;
  frame.classList.toggle('transparent', c.bg === 'transparent');
  const pr = Math.min(2, window.devicePixelRatio || 1);
  stage.renderer.setPixelRatio(pr);
  stage.setSize(Math.floor(w), Math.floor(h));
  if (rearrange) stage.arrange(c);
  else stage.fitCamera(c);
  await stage.background(c, w * pr, h * pr);
  stage.apply(c, stage.playing ? stage.time : (c.anim === 'none' ? 0 : still(c)));
  stage.render();
}

// Instant affiché quand la lecture est arrêtée : pose finale (après l'entrée).
function still(c) {
  if (['entree', 'apparition'].includes(c.anim)) return Math.min(c.duration, 2.2);
  if (c.anim === 'pivot' || c.anim === 'rotation') return c.duration;
  return stage.time || 0;
}

function play(root, on) {
  stage.playing = on ?? !stage.playing;
  const btn = root.querySelector('[data-ps="play"]');
  if (btn) btn.innerHTML = icon(stage.playing ? 'pause' : 'play', 16);
  cancelAnimationFrame(raf);
  if (!stage.playing) return;
  let last = performance.now();
  const c = cfg();
  const tick = (now) => {
    if (!stage || !stage.playing) return;
    stage.time = (stage.time + (now - last) / 1000) % c.duration;
    last = now;
    stage.apply(c, stage.time);
    stage.render();
    const s = root.querySelector('[data-ps-time]');
    if (s) s.value = stage.time / c.duration;
    const lab = root.querySelector('[data-ps-tlabel]');
    if (lab) lab.textContent = `${stage.time.toFixed(1).replace('.', ',')} s`;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

function close(root) {
  play(root, false);
  if (stage) { try { stage.renderer.dispose(); } catch { /* ignore */ } }
  stage = null;
  root.remove();
  document.removeEventListener('keydown', root._key);
}

function bind(root) {
  const ro = new ResizeObserver(() => { if (stage) refresh(root); });
  ro.observe(root.querySelector('.ps-view'));
  root._key = (e) => {
    if (!root.isConnected || !root.offsetParent) return;
    if (e.key === 'Escape' && !root.classList.contains('ps-embed')) close(root);
    if (e.key === ' ' && e.target.tagName !== 'INPUT') { e.preventDefault(); play(root); }
  };
  document.addEventListener('keydown', root._key);
  root.addEventListener('click', async (e) => {
    const c = cfg();
    const set = e.target.closest('[data-pset]');
    if (set) {
      const k = set.dataset.pset;
      let v = set.dataset.val;
      if (k === 'all') v = v === '1';
      const recapture = (k === 'all' && v !== c.all) || (k === 'anim' && v === 'defilement' && !stage.items.some((it) => it.full));
      c[k] = v;
      persist();
      if (recapture) {
        const busy = toast('Capture des maquettes…', { busy: true, sticky: true });
        try { stage.build(await stage.capture(c.all, c.anim === 'defilement')); } finally { busy.close(); }
      }
      if (!stage || !root.isConnected) return;
      if (k === 'anim') { stage.time = 0; }
      renderSide(root);
      await refresh(root, { rearrange: true });
      if (k === 'anim' && v !== 'none') play(root, true);
      return;
    }
    const sc = e.target.closest('[data-ps-scene]');
    if (sc) {
      Object.assign(c, PHOTO_SCENES[sc.dataset.psScene][2]);
      c.photo = sc.dataset.psScene;
      persist();
      renderSide(root);
      await refresh(root, { rearrange: true });
      return;
    }
    const b = e.target.closest('[data-ps]');
    if (!b) return;
    const a = b.dataset.ps;
    if (a === 'close') close(root);
    if (a === 'play') play(root);
    if (a === 'recapture') await recapturePoses();
    if (a === 'png') await exportImage(root);
    if (a === 'video') await exportVideo(root);
    if (a === 'music') {
      if (stage.music) stage.music = null;
      else {
        const f = await api.invoke('dialog:open-file', { title: 'Musique de la vidéo', filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'] }], asBytes: true });
        if (f && f.data) {
          try {
            const { decodeMusic } = await import('../studio/music.js');
            const buffer = await decodeMusic(f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data));
            stage.music = { name: f.name || 'Musique', buffer, volume: 0.8, offset: 0, fadeIn: 0.3, fadeOut: 1.2 };
          } catch { toast("Ce fichier audio n'a pas pu être lu.", { kind: 'bad' }); }
        }
      }
      renderSide(root);
    }
  });
  root.addEventListener('input', (e) => {
    const t = e.target;
    const c = cfg();
    if (t.dataset.prange) {
      const k = t.dataset.prange;
      c[k] = Number(t.value);
      const lab = root.querySelector(`[data-pval="${k}"]`);
      if (lab) {
        const v = c[k];
        lab.textContent = ['rx', 'ry', 'rz', 'lightAngle'].includes(k) ? `${v}°` : k === 'duration' ? `${v} s` : k === 'fov' ? (v < 12 ? 'à plat' : v > 40 ? 'forte' : `${v}°`) : `${Math.round(v * 100)} %`;
      }
      refresh(root, { rearrange: !['duration', 'fov', 'zoom', 'dof', 'grain', 'vignette', 'goboAmount'].includes(k) });
    }
    if (t.dataset.psTime !== undefined) {
      play(root, false);
      stage.time = Number(t.value) * c.duration;
      stage.apply(c, stage.time);
      stage.render();
      root.querySelector('[data-ps-tlabel]').textContent = `${stage.time.toFixed(1).replace('.', ',')} s`;
    }
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    const c = cfg();
    if (t.dataset.prange) persist();
    if (t.dataset.pcheck) { c[t.dataset.pcheck] = t.checked; persist(); renderSide(root); refresh(root, { rearrange: true }); }
    if (t.dataset.pcolor !== undefined) { c.bgColor = t.value; c.bg = 'color'; persist(); renderSide(root); refresh(root); }
  });
}

function exportName() {
  const c = cfg();
  return `Mise en scène ${POSES[c.pose][0]} ${c.format.replace(':', 'x')}`;
}

// Rend une image à la taille demandée sans toucher à l'aperçu.
async function renderAt(c, w, h, t) {
  const r = stage.renderer;
  const prev = { pr: r.getPixelRatio(), size: r.getSize(new T.Vector2()) };
  r.setPixelRatio(1);
  stage.setSize(w, h);
  stage.fitCamera(c);
  await stage.background(c, w, h);
  stage.cfgRef = c;
  stage.apply(c, t);
  stage.draw();
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  stage.composeTo(out.getContext('2d'), w, h, c);
  r.setPixelRatio(prev.pr);
  stage.setSize(prev.size.x, prev.size.y);
  return out;
}

async function exportImage(root) {
  const c = cfg();
  play(root, false);
  const { w, h } = outSize(c, Number(c.isize));
  const busy = toast(`Rendu ${w} × ${h}…`, { busy: true, sticky: true });
  try {
    const canvas = await renderAt(c, w, h, c.anim === 'none' ? 0 : still(c));
    const file = await saveCanvas(canvas, {
      format: 'png', name: exportName(), project: S.source ? S.source.name : 'Responsive Lab', saveAs: false, background: '#ffffff', pdfPages: 'single',
    });
    busy.close();
    await refresh(root);
    if (file) { S.lastFile = file; toast(`Image enregistrée : ${w} × ${h} px`, { action: 'Afficher', onAction: () => api.invoke('shell:reveal', file) }); }
    return file;
  } catch (err) {
    busy.close();
    console.error(err);
    toast("L'image n'a pas pu être exportée.", { kind: 'bad' });
    return null;
  }
}

async function exportVideo(root) {
  const c = cfg();
  play(root, false);
  const long = Number(c.vsize) === 720 ? 1280 : Number(c.vsize) === 2160 ? 3840 : 1920;
  const { w, h } = outSize(c, long);
  const enc = await import('../capture/encoder.js');
  const { attachMusicTrack } = await import('../studio/music.js');
  let codec = c.vformat === 'webm' ? 'vp9' : 'avc';
  if (!(await enc.canEncodeVideo(codec, { width: w, height: h }))) codec = codec === 'avc' ? 'vp9' : 'avc';
  if (!(await enc.canEncodeVideo(codec, { width: w, height: h }))) { toast("Ce PC ne sait pas encoder de vidéo à cette taille. Choisis une définition plus petite.", { kind: 'bad' }); return null; }
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d');
  const output = new enc.Output({ format: codec === 'avc' ? new enc.Mp4OutputFormat({ fastStart: 'in-memory' }) : new enc.WebMOutputFormat(), target: new enc.BufferTarget() });
  const source = new enc.CanvasSource(out, { codec, quality: enc.QUALITY_VERY_HIGH, keyFrameInterval: 2 });
  const fps = c.fps || 30;
  output.addVideoTrack(source, { frameRate: fps });
  const feed = await attachMusicTrack(enc, output, stage.music, c.duration, codec);
  await output.start();
  if (feed) await feed();
  const busyEl = root.querySelector('#psBusy');
  busyEl.hidden = false;
  let cancel = false;
  busyEl.innerHTML = `<div class="st-busy-card glass"><div class="spinner"></div><b>Export de la vidéo</b><span data-prog>0 %</span><div class="st-prog"><i></i></div><button class="btn small" data-cancel>Annuler</button></div>`;
  busyEl.querySelector('[data-cancel]').onclick = () => { cancel = true; };
  const r = stage.renderer;
  const prev = { pr: r.getPixelRatio(), size: r.getSize(new T.Vector2()) };
  r.setPixelRatio(1);
  stage.setSize(w, h);
  stage.fitCamera(c);
  await stage.background(c, w, h);
  const total = Math.round(c.duration * fps);
  try {
    for (let i = 0; i < total && !cancel; i++) {
      stage.apply(c, i / fps);
      stage.draw();
      stage.composeTo(octx, w, h, c);
      // eslint-disable-next-line no-await-in-loop
      await source.add(i / fps, 1 / fps);
      if (i % 4 === 0) {
        const p = Math.round(((i + 1) / total) * 100);
        busyEl.querySelector('[data-prog]').textContent = `${p} % · ${i + 1} / ${total} images`;
        busyEl.querySelector('.st-prog i').style.width = `${p}%`;
        // eslint-disable-next-line no-await-in-loop
        await sleep(0);
      }
    }
    if (cancel) { await output.cancel(); toast('Export de la vidéo annulé.'); return null; }
    source.close();
    await output.finalize();
    const file = await saveBytes(new Uint8Array(output.target.buffer), {
      kind: 'video', project: S.source ? S.source.name : 'Responsive Lab', name: exportName(), ext: codec === 'avc' ? 'mp4' : 'webm',
    });
    if (file) { S.lastFile = file; toast(`Vidéo enregistrée : ${w} × ${h}, ${c.duration} s`, { action: 'Afficher', onAction: () => api.invoke('shell:reveal', file) }); }
    return file;
  } catch (err) {
    console.error(err);
    toast("La vidéo n'a pas pu être exportée.", { kind: 'bad' });
    return null;
  } finally {
    busyEl.hidden = true;
    r.setPixelRatio(prev.pr);
    stage.setSize(prev.size.x, prev.size.y);
    await refresh(root);
  }
}

// Tests automatiques : chaque pose, quelques animations, exports.
export async function autotestPoses({ log, snap }) {
  const c = cfg();
  c.all = true; c.anim = 'none';
  const st = await openPoses();
  if (!st) { log('poses : échec de l’ouverture'); return; }
  const root = document.querySelector('.poses');
  log(`poses : ${st.items.length} maquette(s) ${st.items.map((it) => { const d = it.page.getContext('2d').getImageData(it.page.width / 2, it.page.height / 4, 1, 1).data; return `${it.page.width}x${it.page.height} rgb(${d[0]},${d[1]},${d[2]})`; }).join(', ')}`);
  for (const p of Object.keys(POSES)) {
    c.pose = p;
    renderSide(root);
    // eslint-disable-next-line no-await-in-loop
    await refresh(root, { rearrange: true });
    // eslint-disable-next-line no-await-in-loop
    await sleep(250);
    // eslint-disable-next-line no-await-in-loop
    await snap(`40-pose-${p}`);
  }
  c.pose = 'hero'; c.reflect = true; c.bg = 'dark';
  renderSide(root);
  await refresh(root, { rearrange: true });
  await snap('41-pose-reflet');
  c.reflect = false; c.bg = 'light';
  for (const a of ['entree', 'defilement', 'orbite']) {
    c.anim = a;
    if (a === 'defilement') st.build(await st.capture(c.all, true));
    // eslint-disable-next-line no-await-in-loop
    await refresh(root, { rearrange: true });
    st.apply(c, c.duration * 0.35);
    st.render();
    // eslint-disable-next-line no-await-in-loop
    await snap(`42-anim-${a}`);
  }
  log(`poses image : ${await exportImage(root)}`);
  c.duration = 2;
  log(`poses vidéo : ${await exportVideo(root)}`);
  c.duration = 6; c.anim = 'flottement';
  persist();
  close(root);
}
