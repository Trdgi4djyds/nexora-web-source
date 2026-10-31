/* Studio de publicité 3D : formats des réseaux sociaux, modèles (mise en scène 3D + textes animés),
 * marque (couleurs, logo, police). Les mêmes recettes de scène servent aux présentations commerciales. */
import { upsertKey } from './timeline.js';

export const AD_FORMATS = {
  story: { label: 'Story, Reels, TikTok', short: '9:16', aspect: '9:16', size: [1080, 1920] },
  portrait: { label: 'Publication portrait', short: '4:5', aspect: '4:5', size: [1080, 1350] },
  post: { label: 'Publication carrée', short: '1:1', aspect: '1:1', size: [1080, 1080] },
  wide: { label: 'Vidéo, bannière, YouTube', short: '16:9', aspect: '16:9', size: [1920, 1080] },
};

export const DEFAULT_BRAND = {
  name: '', primary: '#5b5bf0', ink: '#14151a', bg: '#f3f1ff', bg2: '#d9d4fb', font: 'display', logo: '',
};

export const DEFAULT_COPY = {
  kicker: 'Nouveau', title: 'Votre application, partout', subtitle: 'Rapide, simple et disponible sur tous vos écrans.', cta: 'Découvrir', badge: '', badgeSub: '', url: '',
  price: '', oldPrice: '', priceNote: '', code: '', codeLabel: 'Code promo', day: '', month: '', dateLabel: '', sticker: '', stickerShape: 'ribbon', before: 'Avant', after: 'Après',
};

export const TEXT_POS = { auto: 'Auto', top: 'En haut', bottom: 'En bas', side: 'Sur le côté' };
export const TEXT_STYLES = {
  plain: 'Simple', gradient: 'Dégradé', highlight: 'Surligné', outline: 'Contour', glow: 'Néon',
};
export const TEXT_ANIMS = {
  up: 'Monte', fade: 'Fondu', words: 'Mot à mot', blur: 'Net', pop: 'Rebond', zoom: 'Zoom', type: 'Machine à écrire', wipe: 'Balayage',
};
export const STICKER_SHAPES = {
  ribbon: "Ruban d'angle", tag: 'Étiquette', pill: 'Pastille', circle: 'Rond',
};

// Couleur lisible sur un fond donné.
export function lum(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export const onColor = (bg) => (lum(bg) > 0.42 ? '#14151a' : '#ffffff');
export function mixHex(a, b, f) {
  const pa = parseInt(String(a).replace('#', ''), 16);
  const pb = parseInt(String(b).replace('#', ''), 16);
  const ch = (p, s) => (p >> s) & 255;
  const v = [16, 8, 0].map((s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * f));
  return `#${v.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/* ------------------------------------------------------------------ recettes de scène
 * st : le Studio. Chaque recette vide la scène, pose les appareils (avec la page du site à la définition
 * de chaque appareil), le décor, l'éclairage et l'animation, puis renvoie le style des textes. */
const KEY = (st, id, t, patch, ease) => upsertKey(st.anim, id, t, { ...st.getState(id), ...patch }, ease);

export const RECIPES = {
  async hero(st, c) {
    st.three.applyEnv({ ...st.three.env, bg: 'gradient', bgColor: c.brand.bg, bgColor2: c.brand.bg2, floor: 'shadow', light: 'studio' });
    st.addDecor({ kind: 'podium2', color: '#ffffff', finish: 'satin' }, { select: false, history: false });
    st.addDecor({ kind: 'spheres', color: c.brand.primary, finish: 'brillant', pos: [0, 0, -4] }, { select: false, history: false });
    const p = await st.addSiteDevice({ deviceId: c.devices.phone, pos: [0, 4.4, 0], rot: [0, -16, 0] }, { full: true });
    const D = st.anim.duration;
    KEY(st, p.id, 0, { pos: [0, -6, 5], rot: [14, -40, 0], scroll: 0 });
    KEY(st, p.id, D * 0.3, { pos: [0, 4.4, 0], rot: [0, -16, 0], scroll: 0 }, 'back');
    KEY(st, p.id, D * 0.6, { pos: [0, 4.4, 0], rot: [0, -10, 0], scroll: 0.12 }, 'inOut');
    KEY(st, p.id, D, { pos: [0, 5.2, 0], rot: [0, -20, 0], scroll: 0.32 }, 'inOut');
    return { ink: c.brand.ink, dark: false, orbit: 18 };
  },

  async promo(st, c) {
    const bg = c.brand.primary;
    st.three.applyEnv({ ...st.three.env, bg: 'gradient', bgColor: mixHex(bg, '#ffffff', 0.12), bgColor2: mixHex(bg, '#000000', 0.25), floor: 'none', light: 'contraste' });
    st.addDecor({ kind: 'anneau', color: '#ffffff', finish: 'brillant', pos: [0, 2, -6] }, { select: false, history: false });
    const a = await st.addSiteDevice({ deviceId: c.devices.phone, pos: [-4.2, 3, 0], rot: [0, 24, -8] }, { full: true });
    const b = await st.addSiteDevice({ deviceId: c.devices.phone2 || c.devices.phone, pos: [4.6, 1.4, -2], rot: [0, -26, 9], color: c.altColor }, { full: false });
    const D = st.anim.duration;
    KEY(st, a.id, 0, { pos: [-14, 3, 0], rot: [0, 60, -8] });
    KEY(st, a.id, D * 0.32, { pos: [-4.2, 3, 0], rot: [0, 24, -8] }, 'back');
    KEY(st, a.id, D, { pos: [-4.2, 3.8, 0], rot: [0, 16, -6], scroll: 0.3 }, 'inOut');
    KEY(st, b.id, 0, { pos: [15, 1.4, -2], rot: [0, -60, 9] });
    KEY(st, b.id, D * 0.42, { pos: [4.6, 1.4, -2], rot: [0, -26, 9] }, 'back');
    KEY(st, b.id, D, { pos: [4.6, 2.2, -2], rot: [0, -18, 7] }, 'inOut');
    return { ink: onColor(bg), dark: lum(bg) < 0.42, orbit: 0, badgeBg: '#ffffff', badgeInk: lum(bg) > 0.75 ? '#14151a' : bg };
  },

  async multi(st, c) {
    st.three.applyEnv({ ...st.three.env, bg: 'studio', bgColor: c.brand.bg, floor: 'shadow', light: 'doux' });
    const lap = await st.addSiteDevice({ deviceId: c.devices.laptop, pos: [0, 0, -6], rot: [0, 0, 0], lid: 108 }, { full: true });
    const tab = await st.addSiteDevice({ deviceId: c.devices.tablet, pos: [-22, 0, 4], rot: [0, 24, 0] }, { full: false });
    const ph = await st.addSiteDevice({ deviceId: c.devices.phone, pos: [20, 0, 6], rot: [0, -24, 0] }, { full: true });
    const D = st.anim.duration;
    KEY(st, lap.id, 0, { lid: 0, scroll: 0 });
    KEY(st, lap.id, D * 0.35, { lid: 108, scroll: 0 }, 'out');
    KEY(st, lap.id, D, { lid: 108, scroll: 0.35 }, 'inOut');
    KEY(st, tab.id, 0, { pos: [-30, 0, 4] });
    KEY(st, tab.id, D * 0.4, { pos: [-22, 0, 4] }, 'out');
    KEY(st, ph.id, 0, { pos: [28, 0, 6], scroll: 0 });
    KEY(st, ph.id, D * 0.45, { pos: [20, 0, 6], scroll: 0 }, 'out');
    KEY(st, ph.id, D, { pos: [20, 0, 6], scroll: 0.4 }, 'inOut');
    return { ink: c.brand.ink, dark: lum(c.brand.bg) < 0.42, orbit: 14 };
  },

  async web(st, c) {
    st.three.applyEnv({ ...st.three.env, bg: 'color', bgColor: c.brand.bg, floor: 'shadow', light: 'studio' });
    const lap = await st.addSiteDevice({ deviceId: c.devices.laptop, pos: [-3, 0, -4], rot: [0, 14, 0], lid: 0 }, { full: true });
    const ph = await st.addSiteDevice({ deviceId: c.devices.phone, pos: [17, 0, 6], rot: [0, -22, 0] }, { full: true });
    const D = st.anim.duration;
    KEY(st, lap.id, 0, { lid: 0, scroll: 0 });
    KEY(st, lap.id, D * 0.4, { lid: 108, scroll: 0 }, 'out');
    KEY(st, lap.id, D, { lid: 108, scroll: 0.45 }, 'inOut');
    KEY(st, ph.id, 0, { pos: [17, -12, 10], rot: [20, -40, 0], scroll: 0 });
    KEY(st, ph.id, D * 0.5, { pos: [17, 0, 6], rot: [0, -22, 0], scroll: 0 }, 'back');
    KEY(st, ph.id, D, { scroll: 0.4 }, 'inOut');
    return { ink: c.brand.ink, dark: lum(c.brand.bg) < 0.42, orbit: 12 };
  },

  async fold(st, c) {
    st.three.applyEnv({ ...st.three.env, bg: 'gradient', bgColor: '#20232c', bgColor2: '#07080b', floor: 'shadow', light: 'neon' });
    const f = await st.addSiteDevice({ deviceId: c.devices.fold, state: 'open', fold: 0, pos: [0, 0, 0], rot: [0, -20, 0] }, { full: true });
    const D = st.anim.duration;
    KEY(st, f.id, 0, { rot: [0, -38, 0], fold: 172, scroll: 0 });
    KEY(st, f.id, D * 0.5, { rot: [0, -6, 0], fold: 0, scroll: 0 }, 'inOut');
    KEY(st, f.id, D, { rot: [0, 6, 0], fold: 0, scroll: 0.3 }, 'inOut');
    return { ink: '#ffffff', dark: true, orbit: 0 };
  },

  async minimal(st, c) {
    st.three.applyEnv({ ...st.three.env, bg: 'color', bgColor: c.brand.bg, floor: 'shadow', light: 'doux' });
    const p = await st.addSiteDevice({ deviceId: c.devices.phone, pos: [0, 0, 0], rot: [0, 0, 0] }, { full: true });
    const D = st.anim.duration;
    KEY(st, p.id, 0, { rot: [0, -12, 0], scroll: 0 });
    KEY(st, p.id, D * 0.15, { rot: [0, -8, 0], scroll: 0 });
    KEY(st, p.id, D, { rot: [0, 8, 0], scroll: 0.55 }, 'inOut');
    return { ink: c.brand.ink, dark: lum(c.brand.bg) < 0.42, orbit: 0 };
  },

  async flat(st, c) {
    st.three.applyEnv({ ...st.three.env, bg: 'color', bgColor: c.brand.bg, floor: 'shadow', light: 'doux' });
    const a = await st.addSiteDevice({ deviceId: c.devices.phone, pos: [-6, 0.9, 0], rot: [-90, 0, 8] }, { full: false });
    const b = await st.addSiteDevice({ deviceId: c.devices.phone2 || c.devices.phone, pos: [6, 0.9, 0], rot: [-90, 0, -8], color: c.altColor }, { full: false });
    const D = st.anim.duration;
    KEY(st, a.id, 0, { rot: [-90, 0, 18] });
    KEY(st, a.id, D, { rot: [-90, 0, 4] }, 'inOut');
    KEY(st, b.id, 0, { rot: [-90, 0, -18] });
    KEY(st, b.id, D, { rot: [-90, 0, -4] }, 'inOut');
    return { ink: c.brand.ink, dark: lum(c.brand.bg) < 0.42, orbit: 0, view: 'top' };
  },

  async laptop(st, c) {
    st.three.applyEnv({ ...st.three.env, bg: 'studio', bgColor: c.brand.bg, floor: 'shadow', light: 'studio' });
    const lap = await st.addSiteDevice({ deviceId: c.devices.laptop, pos: [0, 0, 0], rot: [0, -12, 0], lid: 0 }, { full: true });
    const D = st.anim.duration;
    KEY(st, lap.id, 0, { lid: 20, scroll: 0, rot: [0, -24, 0] });
    KEY(st, lap.id, D * 0.4, { lid: 108, scroll: 0, rot: [0, -12, 0] }, 'out');
    KEY(st, lap.id, D, { lid: 108, scroll: 0.5, rot: [0, -6, 0] }, 'inOut');
    return { ink: c.brand.ink, dark: lum(c.brand.bg) < 0.42, orbit: 10 };
  },

  async phoneScroll(st, c) {
    st.three.applyEnv({ ...st.three.env, bg: 'gradient', bgColor: c.brand.bg, bgColor2: c.brand.bg2, floor: 'shadow', light: 'studio' });
    const p = await st.addSiteDevice({ deviceId: c.devices.phone, pos: [0, 0, 0], rot: [0, 18, 0] }, { full: true });
    const D = st.anim.duration;
    KEY(st, p.id, 0, { rot: [0, 30, 0], scroll: 0 });
    KEY(st, p.id, D * 0.2, { rot: [0, 20, 0], scroll: 0 }, 'out');
    KEY(st, p.id, D, { rot: [0, 10, 0], scroll: 0.6 }, 'inOut');
    return { ink: c.brand.ink, dark: lum(c.brand.bg) < 0.42, orbit: 0 };
  },

  async product(st, c) {
    const P = c.brand.primary;
    st.three.applyEnv({ ...st.three.env, bg: 'gradient', bgColor: mixHex(P, '#ffffff', 0.82), bgColor2: mixHex(P, '#ffffff', 0.55), floor: 'shadow', light: 'doux', fx: { vignette: true, vignetteAmount: 0.2 }, fog: null });
    st.addDecor({ kind: 'socle', color: '#ffffff', finish: 'ceramique', scale: 0.8 }, { select: false, history: false });
    st.addDecor({ kind: 'anneau', color: P, finish: 'brillant', pos: [0, 0, -8], scale: 1.15 }, { select: false, history: false });
    const p = await st.addSiteDevice({ deviceId: c.devices.phone, pos: [0, 5.6, 0], rot: [0, -14, 0] }, { full: true });
    const D = st.anim.duration;
    KEY(st, p.id, 0, { pos: [0, 5.6, 0], rot: [0, -50, 0], scroll: 0 });
    KEY(st, p.id, D * 0.35, { rot: [0, -14, 0], scroll: 0 }, 'expo');
    KEY(st, p.id, D, { rot: [0, 6, 0], scroll: 0.3 }, 'inOut');
    return { ink: c.brand.ink, dark: false, orbit: 12, titleStyle: 'highlight' };
  },

  async fan(st, c) {
    const P = c.brand.primary;
    st.three.applyEnv({ ...st.three.env, bg: 'gradient', bgColor: mixHex(P, '#ffffff', 0.18), bgColor2: mixHex(P, '#000000', 0.35), floor: 'none', light: 'studio', fx: { bloom: false, vignette: true, vignetteAmount: 0.4 }, fog: null });
    const D = st.anim.duration;
    const n = 5;
    for (let i = 0; i < n; i++) {
      const f = i - (n - 1) / 2;
      // eslint-disable-next-line no-await-in-loop
      const ph = await st.addSiteDevice({ deviceId: i % 2 ? (c.devices.phone2 || c.devices.phone) : c.devices.phone, pos: [f * 7.5, Math.abs(f) * -1.2 + 2, -Math.abs(f) * 2.5], rot: [0, -f * 9, -f * 7], color: i % 2 ? c.altColor : null }, { full: i === 2 });
      KEY(st, ph.id, 0, { pos: [0, 0, -6], rot: [0, 0, 0], scroll: 0 });
      KEY(st, ph.id, D * (0.25 + Math.abs(f) * 0.05), { scroll: 0 }, 'back');
      KEY(st, ph.id, D, { pos: [f * 7.5, Math.abs(f) * -1.2 + 2.6, -Math.abs(f) * 2.5], rot: [0, -f * 7, -f * 6], scroll: i === 2 ? 0.25 : 0 }, 'inOut');
    }
    return { ink: onColor(P), dark: lum(P) < 0.42, orbit: 0, titleStyle: 'plain' };
  },

  async neon(st, c) {
    st.three.applyEnv({ ...st.three.env, bg: 'color', bgColor: '#090614', floor: 'glossy', light: 'neon', exposure: 1.05, reflect: 0.55, floorRough: 0.2, fog: { mode: 'exp', color: '#090614', density: 0.25 }, fx: { bloom: true, bloomStrength: 0.8, bloomRadius: 0.35, bloomThreshold: 1.05, vignette: true, vignetteAmount: 0.55 } });
    const p = await st.addSiteDevice({ deviceId: c.devices.phone, pos: [0, 0.4, 0], rot: [0, -16, 0] }, { full: true });
    const a = st.addDecor({ kind: 'icone3d', icon: 'heart', size: 6, thickness: 1.1, color: '#ff2d95', finish: 'neon', pos: [-10, 9, -3], rot: [0, 18, 8] }, { select: false, history: false });
    const b = st.addDecor({ kind: 'icone3d', icon: 'bolt', size: 7, thickness: 1.1, color: '#00e5ff', finish: 'neon', pos: [10, 3, -2], rot: [0, -20, -6] }, { select: false, history: false });
    st.addDecor({ kind: 'anneau', color: c.brand.primary, finish: 'neon', pos: [0, 0, -9], scale: 1.25 }, { select: false, history: false });
    const D = st.anim.duration;
    KEY(st, p.id, 0, { pos: [0, -8, 4], rot: [10, -40, 0], scroll: 0 });
    KEY(st, p.id, D * 0.35, { pos: [0, 0.4, 0], rot: [0, -16, 0], scroll: 0 }, 'expo');
    KEY(st, p.id, D, { rot: [0, -4, 0], scroll: 0.3 }, 'inOut');
    for (const [o, dy] of [[a, 1.6], [b, -1.4]]) {
      const s0 = st.getState(o.id);
      KEY(st, o.id, 0, { ...s0, scale: 0.01 });
      KEY(st, o.id, D * 0.45, { ...s0, scale: 1 }, 'spring');
      KEY(st, o.id, D, { ...s0, pos: [s0.pos[0], s0.pos[1] + dy, s0.pos[2]], rot: [s0.rot[0], s0.rot[1] + 30, s0.rot[2]] }, 'inOut');
    }
    return { ink: '#ffffff', dark: true, orbit: 10, titleStyle: 'glow' };
  },

  async pastel(st, c) {
    const P = c.brand.primary;
    st.three.applyEnv({ ...st.three.env, bg: 'studio', bgColor: mixHex(P, '#ffffff', 0.86), floor: 'shadow', light: 'doux', exposure: 1.06, fog: null, fx: null });
    const p = await st.addSiteDevice({ deviceId: c.devices.phone, pos: [0, 0, 0], rot: [0, -12, 0] }, { full: true });
    const cols = [mixHex(P, '#ffffff', 0.45), '#ffd6e0', '#cdeee0', '#ffe7b8'];
    const blobs = [[-10, 2.5, -4, 0.75], [9.5, 6, -6, 0.55], [7, 1.2, 5, 0.38], [-7, 12, -8, 0.45]].map(([x, y, z, k], i) => st.addDecor({ kind: i === 2 ? 'sphere' : 'blob', seed: i + 2, color: cols[i], finish: 'argile', pos: [x, y, z], scale: k }, { select: false, history: false }));
    const D = st.anim.duration;
    KEY(st, p.id, 0, { rot: [0, -30, 0], scroll: 0 });
    KEY(st, p.id, D * 0.3, { rot: [0, -12, 0], scroll: 0 }, 'expo');
    KEY(st, p.id, D, { rot: [0, 6, 0], scroll: 0.4 }, 'inOut');
    blobs.forEach((b, i) => { const s0 = st.getState(b.id); KEY(st, b.id, 0, { ...s0, pos: [s0.pos[0], s0.pos[1] - 2, s0.pos[2]] }); KEY(st, b.id, D, { ...s0, pos: [s0.pos[0], s0.pos[1] + 1 + i * 0.3, s0.pos[2]], rot: [0, 40, 0] }, 'inOut'); });
    return { ink: c.brand.ink, dark: false, orbit: 0, titleStyle: 'plain' };
  },

  async luxe(st, c) {
    st.three.applyEnv({ ...st.three.env, bg: 'gradient', bgColor: '#2a2520', bgColor2: '#0b0a09', floor: 'glossy', light: 'contraste', exposure: 1.05, reflect: 0.5, floorRough: 0.25, warmth: 0.35, fog: { mode: 'linear', color: '#0b0a09', density: 0.35 }, fx: { vignette: true, vignetteAmount: 0.6, bloom: true, bloomStrength: 0.25, bloomRadius: 0.2, bloomThreshold: 1.05 } });
    st.addDecor({ kind: 'podium', color: '#151311', finish: 'brillant' }, { select: false, history: false });
    const r1 = st.addDecor({ kind: 'tore', color: '#e6b85c', finish: 'or', pos: [-11, 1.8, -5], rot: [70, 0, 20], scale: 0.55 }, { select: false, history: false });
    st.addDecor({ kind: 'sphere', color: '#e6b85c', finish: 'or', pos: [11, 1.5, -3], scale: 0.3 }, { select: false, history: false });
    const p = await st.addSiteDevice({ deviceId: c.devices.phone, pos: [0, 2.6, 0], rot: [0, -18, 0] }, { full: true });
    const D = st.anim.duration;
    KEY(st, p.id, 0, { rot: [0, -45, 0], scroll: 0 });
    KEY(st, p.id, D * 0.4, { rot: [0, -18, 0], scroll: 0 }, 'expo');
    KEY(st, p.id, D, { rot: [0, -4, 0], scroll: 0.25 }, 'inOut');
    const s0 = st.getState(r1.id);
    KEY(st, r1.id, 0, s0);
    KEY(st, r1.id, D, { ...s0, rot: [s0.rot[0], s0.rot[1] + 90, s0.rot[2]] }, 'linear');
    return { ink: '#f4ead8', dark: true, orbit: 14, titleStyle: 'gradient', gradient: ['#f7e3b5', '#c89b4a'], font: 'serif', ctaBg: '#e6b85c', ctaInk: '#1a1611' };
  },

  async event(st, c) {
    const P = c.brand.primary;
    st.three.applyEnv({ ...st.three.env, bg: 'gradient', bgColor: mixHex(P, '#ffffff', 0.25), bgColor2: mixHex(P, '#000000', 0.4), floor: 'none', light: 'studio', fog: null, fx: { vignette: true, vignetteAmount: 0.35 } });
    const lap = await st.addSiteDevice({ deviceId: c.devices.laptop, pos: [0, 0, 0], rot: [0, -14, 0], lid: 0 }, { full: true });
    st.addDecor({ kind: 'confettis', count: 160, spread: 46, pos: [0, 4, -8], color: '#ffffff', finish: 'brillant' }, { select: false, history: false });
    const D = st.anim.duration;
    KEY(st, lap.id, 0, { lid: 10, rot: [0, -30, 0], scroll: 0 });
    KEY(st, lap.id, D * 0.4, { lid: 108, rot: [0, -14, 0], scroll: 0 }, 'expo');
    KEY(st, lap.id, D, { lid: 108, rot: [0, -6, 0], scroll: 0.35 }, 'inOut');
    return { ink: onColor(P), dark: lum(P) < 0.42, orbit: 10, titleStyle: 'plain' };
  },

  async coupon(st, c) {
    const P = c.brand.primary;
    st.three.applyEnv({ ...st.three.env, bg: 'color', bgColor: P, floor: 'none', light: 'studio', fog: null, fx: null });
    const p = await st.addSiteDevice({ deviceId: c.devices.phone, pos: [0, 0, 0], rot: [0, 14, 6] }, { full: true });
    st.addDecor({ kind: 'confettis', count: 120, spread: 40, pos: [0, -4, -10], finish: 'brillant', color: '#ffffff' }, { select: false, history: false });
    const g = st.addDecor({ kind: 'icone3d', icon: 'gift', size: 7, color: '#ffffff', finish: 'brillant', pos: [-9, 9, -2], rot: [0, 24, -10] }, { select: false, history: false });
    const D = st.anim.duration;
    KEY(st, p.id, 0, { pos: [0, -14, 0], rot: [20, 40, 6], scroll: 0 });
    KEY(st, p.id, D * 0.4, { pos: [0, 0, 0], rot: [0, 14, 6], scroll: 0 }, 'spring');
    KEY(st, p.id, D, { rot: [0, 4, 2], scroll: 0.25 }, 'inOut');
    const s0 = st.getState(g.id);
    KEY(st, g.id, 0, { ...s0, scale: 0.01 });
    KEY(st, g.id, D * 0.55, { ...s0, scale: 1 }, 'elastic');
    KEY(st, g.id, D, { ...s0, rot: [s0.rot[0], s0.rot[1] - 30, s0.rot[2]] }, 'inOut');
    return { ink: onColor(P), dark: lum(P) < 0.42, orbit: 0, titleStyle: 'plain', badgeBg: '#ffffff', badgeInk: lum(P) > 0.75 ? '#14151a' : P };
  },

  async float(st, c) {
    const P = c.brand.primary;
    st.three.applyEnv({ ...st.three.env, bg: 'gradient', bgColor: c.brand.bg, bgColor2: c.brand.bg2, floor: 'shadow', light: 'studio', fog: null, fx: null });
    const p = await st.addSiteDevice({ deviceId: c.devices.phone, pos: [0, 6, 0], rot: [6, -20, -4] }, { full: true });
    const sp = [[-8, 12, -3, 0.35, P], [8.5, 4, 2, 0.22, mixHex(P, '#ffffff', 0.4)], [6, 16, -6, 0.16, '#ffffff'], [-6, 2.5, 4, 0.14, mixHex(P, '#000000', 0.2)]]
      .map(([x, y, z, k, col]) => st.addDecor({ kind: 'sphere', color: col, finish: 'brillant', pos: [x, y, z], scale: k }, { select: false, history: false }));
    const D = st.anim.duration;
    KEY(st, p.id, 0, { pos: [0, 5, 0], rot: [8, -26, -5], scroll: 0 });
    KEY(st, p.id, D / 2, { pos: [0, 7.2, 0], rot: [3, -14, -2], scroll: 0.15 }, 'inOut');
    KEY(st, p.id, D, { pos: [0, 5.6, 0], rot: [6, -6, -3], scroll: 0.3 }, 'inOut');
    sp.forEach((o, i) => { const s0 = st.getState(o.id); KEY(st, o.id, 0, s0); KEY(st, o.id, D / 2, { ...s0, pos: [s0.pos[0], s0.pos[1] + (i % 2 ? -1.5 : 1.8), s0.pos[2]] }, 'inOut'); KEY(st, o.id, D, s0, 'inOut'); });
    return { ink: c.brand.ink, dark: lum(c.brand.bg) < 0.42, orbit: 16, titleStyle: 'gradient' };
  },

  async compare(st, c) {
    st.three.applyEnv({ ...st.three.env, bg: 'studio', bgColor: c.brand.bg, floor: 'shadow', light: 'doux', fog: null, fx: null });
    const a = await st.addSiteDevice({ deviceId: c.devices.phone, pos: [-6.5, 0, 0], rot: [0, 14, 0] }, { full: false });
    const b = await st.addSiteDevice({ deviceId: c.devices.phone2 || c.devices.phone, pos: [6.5, 0, 0], rot: [0, -14, 0], color: c.altColor }, { full: true });
    const D = st.anim.duration;
    KEY(st, a.id, 0, { pos: [-6.5, 0, 0], rot: [0, 30, 0] });
    KEY(st, a.id, D * 0.35, { rot: [0, 14, 0] }, 'expo');
    KEY(st, b.id, 0, { pos: [6.5, 0, 0], rot: [0, -30, 0], scroll: 0 });
    KEY(st, b.id, D * 0.45, { rot: [0, -14, 0], scroll: 0 }, 'expo');
    KEY(st, b.id, D, { scroll: 0.35 }, 'inOut');
    return { ink: c.brand.ink, dark: lum(c.brand.bg) < 0.42, orbit: 0, titleStyle: 'plain', compare: true };
  },
};

export const AD_TEMPLATES = {
  launch: { label: "Lancement d'appli", hint: 'Téléphone en vedette sur un podium', recipe: 'hero', icon: 'star' },
  promo: { label: 'Promotion', hint: 'Deux téléphones, pastille de prix', recipe: 'promo', icon: 'sparkle' },
  multi: { label: 'Tous les écrans', hint: 'Ordinateur, tablette et téléphone', recipe: 'multi', icon: 'multi' },
  web: { label: 'Site web', hint: "L'ordinateur s'ouvre, la page défile", recipe: 'web', icon: 'laptop' },
  fold: { label: 'Innovation', hint: 'Pliable qui s’ouvre, éclairage néon', recipe: 'fold', icon: 'fold' },
  minimal: { label: 'Minimal', hint: 'Un téléphone, beaucoup d’espace', recipe: 'minimal', icon: 'phone' },
  flat: { label: 'Vue de dessus', hint: 'Téléphones posés à plat', recipe: 'flat', icon: 'grid' },
  product: { label: 'Produit et prix', hint: 'Sur un socle, ancien prix barré', recipe: 'product', icon: 'cart', sample: { price: '9,99 €', oldPrice: '14,99 €', priceNote: '/mois', sticker: 'Offre', stickerShape: 'tag' } },
  fan: { label: 'Éventail', hint: "Cinq écrans déployés en arc", recipe: 'fan', icon: 'layers' },
  neon: { label: 'Néon', hint: 'Nuit, reflets et icônes lumineuses', recipe: 'neon', icon: 'bolt' },
  pastel: { label: 'Pastel', hint: 'Formes douces en pâte à modeler', recipe: 'pastel', icon: 'shapes' },
  luxe: { label: 'Luxe', hint: 'Or, reflets et typographie élégante', recipe: 'luxe', icon: 'sparkle' },
  event: { label: 'Événement', hint: 'Date, lieu et confettis', recipe: 'event', icon: 'gift', sample: { day: '12', month: 'nov.', dateLabel: '19 h · En ligne', cta: "S'inscrire" } },
  coupon: { label: 'Code promo', hint: 'Code à recopier, confettis', recipe: 'coupon', icon: 'gift', sample: { code: 'BIENVENUE20', badge: '-20 %' } },
  float: { label: 'Lévitation', hint: 'Le téléphone flotte avec des bulles', recipe: 'float', icon: 'cloud' },
  compare: { label: 'Avant / après', hint: 'Deux écrans comparés', recipe: 'compare', icon: 'distribute', sample: { before: 'Avant', after: 'Après' } },
};

export function shapeOf(aspect) {
  const [a, b] = String(aspect || '16:9').split(':').map(Number);
  const r = a / b;
  if (r < 0.7) return 'tall';
  if (r < 0.95) return 'portrait';
  if (r < 1.3) return 'square';
  return 'wide';
}

/* Zone de l'image réservée à la 3D et calques de texte, selon la forme et la position du texte. */
export function adLayout({
  shape, pos = 'auto', copy, brand, style, logo, fx = {},
}) {
  const ink = style.ink || brand.ink;
  const sub = mixHex(ink === '#ffffff' ? '#ffffff' : ink, style.dark ? '#000000' : '#ffffff', 0.28);
  const side = pos === 'side' || (pos === 'auto' && shape === 'wide');
  const bottom = pos === 'bottom';
  const S = {
    tall: { title: 8.4, sub: 3.9, kick: 2.9, cta: 3.4, maxW: 0.86 },
    portrait: { title: 7.6, sub: 3.6, kick: 2.7, cta: 3.2, maxW: 0.84 },
    square: { title: 7.4, sub: 3.5, kick: 2.6, cta: 3.1, maxW: 0.84 },
    wide: { title: 8.4, sub: 3.6, kick: 2.8, cta: 3.3, maxW: 0.4 },
  }[shape];
  const font = brand.font === 'serif' || style.font === 'serif' ? 'serif' : 'display';
  const anim = fx.textAnim && fx.textAnim !== 'auto' ? fx.textAnim : 'up';
  const tStyle = fx.textStyle && fx.textStyle !== 'auto' ? fx.textStyle : (style.titleStyle || 'plain');
  const accent = style.dark && lum(brand.primary) < 0.2 ? '#ffffff' : brand.primary;
  const title = {
    type: 'text', text: copy.title, size: S.title, weight: font === 'serif' ? 600 : 800, font, color: ink, lineHeight: 1.04, letterSpacing: -0.02, anim, maxLines: 4,
  };
  if (tStyle === 'gradient') { title.fill = 'gradient'; title.gradient = style.gradient || [accent, mixHex(accent, style.dark ? '#ffffff' : '#ff4d8d', 0.55)]; }
  if (tStyle === 'highlight') { title.highlight = brand.primary; title.color = onColor(brand.primary); title.lineHeight = 1.18; }
  if (tStyle === 'outline') { title.outline = ink; title.outlineOnly = true; title.outlineW = 0.045; }
  if (tStyle === 'glow') { title.glow = style.dark ? brand.primary : mixHex(brand.primary, '#ffffff', 0.3); title.color = style.dark ? '#ffffff' : ink; }
  const ctaBg = style.ctaBg || (style.dark && lum(brand.primary) < 0.2 ? '#ffffff' : brand.primary);
  const items = [
    { type: 'text', text: copy.kicker, size: S.kick, weight: 700, color: brand.primary === ink ? sub : (style.dark ? '#ffffff' : brand.primary), upper: true, letterSpacing: 0.08, anim: anim === 'words' ? 'up' : anim },
    title,
    { type: 'text', text: copy.subtitle, size: S.sub, weight: 450, color: sub, lineHeight: 1.3, anim: anim === 'type' ? 'fade' : anim, maxLines: 4 },
  ];
  if (copy.price) items.push({ type: 'price', price: copy.price, old: copy.oldPrice, note: copy.priceNote, size: S.title * 0.95, color: ink, accent: style.dark ? '#ffffff' : brand.primary, glow: tStyle === 'glow' ? brand.primary : null, anim: 'pop', dur: 0.6 });
  if (copy.code) items.push({ type: 'code', code: copy.code, label: copy.codeLabel, size: S.cta * 1.05, accent: style.dark ? '#ffffff' : ink, color: style.dark ? '#ffffff' : ink, bg: style.dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)', anim: 'pop', dur: 0.6 });
  items.push({ type: 'space', size: 0.6 });
  items.push({ type: 'cta', text: copy.cta, size: S.cta, bg: ctaBg, color: style.ctaInk || onColor(ctaBg), anim: 'scale', dur: 0.6 });
  let region;
  let stack;
  if (side) {
    region = { cx: 0.73, cy: 0.54, rw: 0.5, rh: 0.8 };
    stack = { type: 'stack', x: 0.07, y: 0.5, valign: 'middle', align: 'left', maxW: S.maxW, items, delay: 0.25, stagger: 0.16 };
  } else if (bottom) {
    region = { cx: 0.5, cy: shape === 'tall' ? 0.33 : 0.35, rw: 0.92, rh: shape === 'tall' ? 0.56 : 0.58 };
    stack = { type: 'stack', x: 0.5, y: shape === 'tall' ? 0.93 : 0.94, valign: 'bottom', align: 'center', maxW: S.maxW, items, delay: 0.25, stagger: 0.16 };
  } else {
    // Le bouton est en bas : la 3D s'arrête au-dessus.
    region = { cx: 0.5, cy: shape === 'tall' ? 0.6 : 0.6, rw: 0.88, rh: shape === 'tall' ? 0.5 : 0.46 };
    stack = { type: 'stack', x: 0.5, y: shape === 'tall' ? 0.075 : 0.07, valign: 'top', align: 'center', maxW: S.maxW, items: items.filter((i) => i.type !== 'cta'), delay: 0.25, stagger: 0.16 };
  }
  // Le prix ou le code prennent de la place dans la pile : la 3D se resserre un peu.
  const extra = (copy.price ? 1 : 0) + (copy.code ? 1 : 0);
  if (extra && !side) { region.rh -= 0.06 * extra; region.cy += bottom ? -0.03 * extra : 0.03 * extra; }
  const layers = [];
  // Voile de lisibilité derrière le texte quand le fond est chargé.
  if (style.scrim) {
    if (side) layers.push({ type: 'scrim', dir: 'h', x0: 0, x1: 0.6, y0: 0, y1: 1, color: style.dark ? '#000000' : '#ffffff', from: 0.55, to: 0 });
    else if (bottom) layers.push({ type: 'scrim', y0: 0.5, y1: 1, color: style.dark ? '#000000' : '#ffffff', from: 0, to: 0.6 });
    else layers.push({ type: 'scrim', y0: 0, y1: 0.45, color: style.dark ? '#000000' : '#ffffff', from: 0.55, to: 0 });
  }
  layers.push(stack);
  // Bouton en bas quand le texte est en haut.
  const ctaItem = items.find((i) => i.type === 'cta');
  if (!side && !bottom && copy.cta) layers.push({ ...ctaItem, x: 0.5, y: shape === 'tall' ? 0.94 : 0.95, align: 'center', valign: 'bottom', delay: 1.1 });
  if (logo) {
    const lp = side ? { x: 0.07, y: 0.07, align: 'left', valign: 'top' } : bottom ? { x: 0.5, y: 0.05, align: 'center', valign: 'top' } : { x: 0.06, y: shape === 'tall' ? 0.94 : 0.95, align: 'left', valign: 'bottom' };
    if (!side && !bottom && copy.cta) Object.assign(lp, { x: 0.5, y: 0.03, align: 'center', valign: 'top' });
    layers.push({ type: 'image', image: 'logo', size: shape === 'wide' ? 7 : 6.2, ...lp, anim: 'fade', delay: 0.1, round: true });
    if (!side && !bottom && copy.cta) {
      // Le logo prend la place du haut : le texte descend un peu.
      stack.y += shape === 'tall' ? 0.04 : 0.06;
      region.cy += 0.02;
    }
  }
  if (copy.url) {
    layers.push({
      type: 'text', text: copy.url.replace(/^https?:\/\//, '').replace(/\/$/, ''), size: 2.3, weight: 600, color: sub, x: side ? 0.07 : 0.5, y: side ? 0.93 : (bottom ? 0.985 : 0.985), align: side ? 'left' : 'center', valign: 'bottom', anim: 'fade', delay: 1.3,
    });
  }
  if (copy.badge) {
    const b = side ? { x: 0.88, y: 0.18 } : bottom ? { x: 0.83, y: 0.1 } : { x: 0.83, y: shape === 'tall' ? 0.5 : 0.48 };
    layers.push({ type: 'badge', text: copy.badge, sub: copy.badgeSub, size: shape === 'wide' ? 17 : 19, bg: style.badgeBg || (style.dark ? '#ffffff' : brand.primary), color: style.badgeInk || (style.dark ? brand.primary : onColor(brand.primary)), shape: 'star', ...b, align: 'center', valign: 'middle', anim: 'scale', delay: 0.9, dur: 0.55 });
  }
  if (copy.sticker) {
    const sh = copy.stickerShape || 'ribbon';
    const sp = sh === 'ribbon' ? { corner: side ? 'tr' : 'tr' } : side ? { x: 0.9, y: 0.12, align: 'right', valign: 'top' } : { x: 0.9, y: region.cy - region.rh / 2 + 0.03, align: 'right', valign: 'top' };
    layers.push({ type: 'sticker', text: copy.sticker, shape: sh, size: shape === 'wide' ? 2.6 : 3.1, bg: style.stickerBg || (style.dark ? brand.primary : mixHex(brand.primary, '#ff3b30', 0.35)), color: '#ffffff', ...sp, anim: 'pop', delay: 0.7, dur: 0.5 });
  }
  if (copy.day) {
    const dp = side ? { x: 0.93, y: 0.82 } : { x: 0.16, y: region.cy + region.rh * 0.22 };
    layers.push({ type: 'date', day: copy.day, month: copy.month, label: copy.dateLabel, size: shape === 'wide' ? 15 : 18, accent: brand.primary, labelColor: ink, ...dp, align: 'center', valign: 'middle', anim: 'pop', delay: 0.8, dur: 0.6 });
  }
  if (style.compare && (copy.before || copy.after)) {
    const y = region.cy - region.rh / 2 + 0.02;
    const off = (shape === 'wide' ? 0.13 : 0.2) * (side ? 0.6 : 1);
    for (const [txt, dx, bg] of [[copy.before, -off, '#8e8e93'], [copy.after, off, brand.primary]]) {
      if (txt) layers.push({ type: 'sticker', shape: 'pill', text: txt, x: region.cx + dx, y, align: 'center', valign: 'top', size: 2.6, bg, color: '#fff', anim: 'pop', delay: 0.6, dur: 0.5 });
    }
  }
  if (fx.safe && shape === 'tall') layers.push({ type: 'safe' });
  if (fx.endcard) {
    layers.push({
      type: 'endcard', delay: Math.max(0.5, (fx.duration || 6) - 1.6), dur: 0.5, bg: style.dark ? '#0c0c10' : brand.primary, bg2: style.dark ? mixHex(brand.primary, '#000000', 0.6) : mixHex(brand.primary, '#000000', 0.35), image: logo ? 'logo' : null, title: brand.name || copy.title, cta: copy.cta, ctaBg: '#ffffff', ctaInk: style.dark ? '#111111' : brand.primary, url: copy.url ? copy.url.replace(/^https?:\/\//, '').replace(/\/$/, '') : '', color: '#ffffff', font,
    });
  }
  return { region, layers };
}
