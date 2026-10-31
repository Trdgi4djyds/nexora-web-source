/* Cadres officiels (format « skin » de l'émulateur Android) : index, correspondance avec le catalogue,
 * chargement des images. Fournis : Pixel, Wear OS, Android Automotive, Google TV. Importés : Samsung… */
import { api } from '../core/api.js';
import { bus } from '../core/dom.js';
import { settings } from '../core/settings.js';

let bundled = {};
let user = {};
const images = new Map(); // url → { img, ready, error }

export async function loadSkins() {
  try { bundled = await (await fetch('vendor/skins/index.json')).json(); } catch { bundled = {}; }
  try { user = (await api.invoke('skins:list')) || {}; } catch { user = {}; }
  api.on('skins:changed', (idx) => { user = idx || {}; bus.emit('skins-changed'); });
}

export const userSkins = () => user;
export const bundledSkins = () => bundled;

const norm = (s) => String(s || '').toLowerCase().replace(/galaxy|samsung|\(.*?\)|[^a-z0-9+]/g, '');

/** Variante de cadre pour un appareil et un état (ou null). */
export function skinFor(dev, st) {
  if (settings.officialFrames === false || !dev || !st) return null;
  const px = st.p && st.p.px;
  const sameWay = (v) => (v.display.w >= v.display.h) === (st.w >= st.h);
  // Cadres importés (Samsung…) d'abord : nom de l'appareil puis définition de l'écran.
  if (dev.skinMatch && px) {
    const keys = [].concat(dev.skinMatch).map(norm);
    // Le nom le plus proche d'abord (« Z Flip7 » avant « Z Flip7 FE »).
    const cands = Object.values(user).map((s) => {
      const n = norm(s.name);
      const k = keys.find((x) => n.includes(x));
      return k ? { s, extra: n.length - k.length } : null;
    }).filter(Boolean).sort((a, b) => a.extra - b.extra);
    for (const { s } of cands) {
      const vs = Object.values(s.variants);
      // La variante dont l'écran a exactement la définition de l'état demandé, sinon la plus proche
      // dans le même sens (à 3 % près).
      const exact = vs.find((x) => x.display.w === px[0] && x.display.h === px[1]);
      const near = exact || vs.filter(sameWay).find((x) => Math.abs(x.display.w / x.display.h - st.w / st.h) < 0.03 && Math.abs(x.display.w - px[0]) / px[0] < 0.08);
      if (near) return { ...near, base: `user-skins/${near.path}`, vendor: s.vendor };
      // Cadre dessiné dans l'autre sens (écran intérieur d'un pliable déclaré en portrait) : tourné d'un quart de tour.
      const turned = vs.find((x) => x.display.w === px[1] && x.display.h === px[0]);
      if (turned) return rotated({ ...turned, base: `user-skins/${turned.path}`, vendor: s.vendor });
    }
  }
  // Cadres fournis (clé explicite du catalogue).
  const spec = dev.skin;
  if (spec) {
    const key = typeof spec === 'string' ? spec : spec[st.id] || spec.default;
    if (key) {
      const [name, ...rest] = key.split('/');
      const s = bundled[name];
      const v = s && s.variants[rest.join('/') || 'default'];
      if (v && sameWay(v)) return { ...v, base: `vendor/skins/${v.path}`, vendor: s.vendor };
    }
  }
  return null;
}

// Variante tournée d'un quart de tour vers la gauche (le haut du cadre passe à gauche).
function rotated(v) {
  const [cw, ch] = v.canvas;
  const d = v.display;
  return {
    ...v,
    rot: true,
    canvas: [ch, cw],
    display: {
      x: d.y, y: cw - d.x - d.w, w: d.h, h: d.w, r: d.r,
    },
    srcCanvas: v.canvas,
  };
}

function load(url) {
  let e = images.get(url);
  if (e) return e;
  const img = new Image();
  e = { img, ready: false, error: false };
  images.set(url, e);
  img.onload = () => { e.ready = true; bus.emit('skin-ready', url); };
  img.onerror = () => { e.error = true; };
  img.src = url;
  return e;
}

/** Images d'une variante : { back, mask, fore } (null tant qu'elles ne sont pas chargées). */
export function skinImages(v) {
  const get = (f) => {
    if (!f) return null;
    const e = load(`${v.base}/${f}`);
    return e.ready ? e.img : null;
  };
  return {
    back: get(v.back), mask: get(v.mask), fore: get(v.fore), pending: Boolean((v.back && !get(v.back)) || (v.mask && !get(v.mask))),
  };
}

/** Précharge les images (avant une capture). */
export function preloadSkin(v) {
  const files = [v.back, v.mask, v.fore].filter(Boolean).map((f) => load(`${v.base}/${f}`));
  return Promise.all(files.map((e) => (e.ready || e.error ? null : new Promise((r) => { e.img.addEventListener('load', r, { once: true }); e.img.addEventListener('error', r, { once: true }); }))));
}
