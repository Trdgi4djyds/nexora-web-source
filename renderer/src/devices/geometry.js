/* Géométrie d'un appareil, calculée à partir de ses mesures physiques (mm).
 * Une seule géométrie sert à l'affichage, aux photos, aux vidéos et aux modèles 3D.
 *
 * Repère « portrait » : l'appareil tenu droit. En paysage, tout tourne de 90° vers la gauche
 * (le haut de l'appareil passe à gauche), comme sur un vrai téléphone.
 */
import { resolveState, defaultColor } from './catalog.js';
import { skinFor } from './skins.js';

const MM_PER_CSS_160 = 25.4 / 160; // un pixel CSS Android ≈ 1/160 de pouce

// Hauteur de la barre d'état par type d'écran (pixels CSS).
const STATUS = {
  island: { kind: 'ios', h: 54 },
  'island-fold': { kind: 'ios-wide', h: 40 },
  notch: { kind: 'ios', h: 47 },
  home: { kind: 'ios-classic', h: 20 },
  punch: { kind: 'android', h: 30 },
  'punch-square': { kind: 'android', h: 30 },
  drop: { kind: 'android', h: 28 },
  slim: { kind: 'android', h: 24 },
  'fold-open': { kind: 'android', h: 30 },
  'fold-cover': { kind: 'android', h: 30 },
  'flip-open': { kind: 'android', h: 30 },
  tablet: { kind: 'tablet', h: 24 },
  macos: { kind: 'macos', h: 32 },
};

const FORM_DEFAULTS = {
  phone: { rim: 0.75, bezel: 2.2, bezelColor: '#050506' },
  dual: { rim: 0.6, bezel: 2.8, bezelColor: '#f2f2ef' },
  tablet: { rim: 0.6, bezel: 8, bezelColor: '#0a0a0b' },
  laptop: { rim: 0, bezel: 8, bezelColor: '#0b0b0d' },
  monitor: { rim: 0, bezel: 7, bezelColor: '#0c0c0e' },
  aio: { rim: 0, bezel: 14, bezelColor: '#f4f4f2' },
  tv: { rim: 0, bezel: 6, bezelColor: '#08080a' },
  watch: { rim: 1.1, bezel: 3, bezelColor: '#000000' },
  handheld: { rim: 0.6, bezel: 6, bezelColor: '#0a0a0b' },
  panel: { rim: 0, bezel: 2.5, bezelColor: 'rgba(250,251,253,0.55)' },
  car: { rim: 0, bezel: 5, bezelColor: '#060607' },
  speaker: { rim: 0, bezel: 9, bezelColor: '#0b0b0c' },
  kiosk: { rim: 0, bezel: 14, bezelColor: '#0b0b0c' },
  terminal: { rim: 0.6, bezel: 4, bezelColor: '#060607' },
};
// Formes posées comme un écran (socles, pieds, montage) : modèle 3D d'écran.
export const DISPLAY_FORMS = ['monitor', 'tv', 'aio', 'car', 'speaker', 'kiosk', 'panel'];

const arr4 = (v, d = 0) => (Array.isArray(v) ? v.slice(0, 4) : [v ?? d, v ?? d, v ?? d, v ?? d]);

// Mesures d'un appareil sans fiche physique (appareils personnalisés).
function synthesize(dev, st) {
  const frame = st.frame || dev.frame || 'punch';
  const tablet = ['tablet'].includes(frame) || /tablet|ipados/.test(dev.os || '');
  const desk = ['laptop', 'monitor', 'tv'].includes(frame) || dev.os === 'windows' || dev.os === 'macos';
  const sw = st.w * MM_PER_CSS_160 * (tablet ? 1.05 : 1);
  const sh = st.h * MM_PER_CSS_160 * (tablet ? 1.05 : 1);
  if (desk) {
    const f = frame === 'tv' ? 'tv' : frame === 'monitor' ? 'monitor' : 'laptop';
    const bz = f === 'laptop' ? [9, 8, 18, 8] : f === 'tv' ? [7, 7, 10, 7] : [7, 7, 14, 7];
    const scale = st.w > 1500 ? 0.22 : 0.26;
    return {
      form: f, sw: st.w * scale, sh: st.h * scale, bz, sr: 0, br: f === 'laptop' ? [7, 7, 1.5, 1.5] : 3,
      base: f === 'laptop' ? { w: st.w * scale + 20, d: 230, h: 14 } : null,
      stand: f === 'monitor' ? { kind: 'column', h: 120, foot: [220, 170] } : f === 'tv' ? { kind: 'feet', h: 60, at: [0.12, 0.88] } : null,
    };
  }
  const base = {
    sw, sh, form: tablet ? 'tablet' : 'phone', sr: tablet ? 4 : 6.4,
  };
  if (frame === 'island') return { ...base, sr: 9, cut: { t: 'island', css: true, w: 124, h: 36, y: 11 } };
  if (frame === 'notch') return { ...base, sr: 8, cut: { t: 'notch', css: true, w: 160, h: 31 } };
  if (frame === 'drop') return { ...base, sr: 5, bz: [2.6, 2.6, 4.8, 2.6], cut: { t: 'drop', css: true, w: 30, h: 24 } };
  if (frame === 'tablet') return { ...base, form: 'tablet', bz: [8, 8, 8, 8], bezelCam: true, sr: 4 };
  if (frame === 'fold-open') return { ...base, sr: 3.8, cut: { t: 'punch', d: 3.3, cx: 0.75, y: 4.4 }, hinge: 'v', crease: 'v' };
  if (frame === 'flip-open') return { ...base, sr: 7, cut: { t: 'punch', d: 3.3, y: 4.1 }, hinge: 'h', crease: 'h' };
  if (frame === 'fold-cover') return { ...base, sr: 4.4, cut: { t: 'punch', d: 3.3, y: 4.1 }, hinge: 'left' };
  return { ...base, cut: { t: 'punch', d: 3.3, y: 4.1 } };
}

// Valeur en pixels CSS : fraction de la largeur (0 < v ≤ 1), depuis la fin (v < 0) ou en mm.
function pos(v, size, k, fallback) {
  if (v == null) return fallback;
  if (v > 0 && v <= 1) return v * size;
  if (v < 0) return size + v * k;
  return v * k;
}

/*
 * dev : appareil du catalogue, stateId : état (fermé/ouvert…),
 * opts : { land, framesOn, statusBar, color }
 */
export function layoutDevice(dev, stateId, opts = {}) {
  const st = resolveState(dev, stateId);
  const land = Boolean(opts.land) && !dev.fixed;
  const framesOn = opts.framesOn !== false;
  const P = { ...(st.p || synthesize(dev, st)) };
  const form = P.form || (['laptop', 'monitor', 'tv'].includes(st.frame) ? st.frame : (st.frame === 'tablet' ? 'tablet' : 'phone'));
  const FD = FORM_DEFAULTS[form] || FORM_DEFAULTS.phone;

  // Écran : mesures physiques et échelle (pixels CSS par mm).
  const W0 = st.w;
  const H0 = st.h;
  let swmm;
  let shmm;
  if (P.diag && P.px) {
    const hyp = Math.hypot(P.px[0], P.px[1]);
    swmm = (P.diag * 25.4 * P.px[0]) / hyp;
    shmm = (P.diag * 25.4 * P.px[1]) / hyp;
  } else {
    swmm = P.sw || W0 * MM_PER_CSS_160;
    shmm = P.sh || H0 * MM_PER_CSS_160;
  }
  const k = W0 / swmm;
  const shAdj = H0 / k; // hauteur réelle de la zone CSS (peut différer légèrement de la dalle)

  // Corps et position de l'écran (mm).
  let bw;
  let bh;
  let sx;
  let sy;
  const bd = P.b ? P.b[2] : (form === 'tablet' ? 6.5 : form === 'phone' ? 8 : 10);
  if (P.b) {
    [bw, bh] = P.b;
    if (P.bz) {
      sx = P.bz[3];
      sy = P.bz[0];
      // Si les marges ne collent pas exactement aux mesures, on garde la taille du corps.
      if (sx + swmm > bw - 0.6) sx = Math.max(0.6, (bw - swmm) / 2);
      if (sy + shAdj > bh - 0.6) sy = Math.max(0.6, (bh - shAdj) / 2);
    } else {
      sx = (bw - swmm) / 2;
      sy = (bh - shAdj) / 2;
    }
    const minB = form === 'phone' ? 1.2 : 2;
    if (sx < minB || bw - sx - swmm < minB) { bw = Math.max(bw, swmm + minB * 2); sx = (bw - swmm) / 2; }
    if (sy < minB || bh - sy - shAdj < minB) { bh = Math.max(bh, shAdj + minB * 2); sy = (bh - shAdj) / 2; }
  } else {
    const bz = P.bz || [FD.bezel, FD.bezel, FD.bezel, FD.bezel];
    bw = swmm + bz[1] + bz[3];
    bh = shAdj + bz[0] + bz[2];
    sx = bz[3];
    sy = bz[0];
  }
  if (!framesOn) {
    bw = swmm;
    bh = shAdj;
    sx = 0;
    sy = 0;
  }
  // Cadre officiel (image du fabricant) : sa géométrie remplace celle du cadre dessiné.
  const skin = framesOn && opts.skin !== false ? skinFor(dev, st) : null;
  if (skin) {
    return layoutSkin({
      dev, st, land, opts, P, form, W0, H0, skin, k: W0 / swmm, swmm, shAdj, bd,
    });
  }

  // Rayons (mm puis CSS).
  const srmm = framesOn ? arr4(P.sr, 0) : [0, 0, 0, 0];
  const bezelMin = Math.min(sx, sy, bw - sx - swmm, bh - sy - shAdj);
  const brmm = framesOn ? (P.br != null ? arr4(P.br) : srmm.map((r) => (r > 0 ? r + bezelMin : 2))) : [0, 0, 0, 0];
  const rimmm = framesOn ? (P.rim ?? FD.rim) : 0;

  // Dimensions CSS en portrait.
  const BW = bw * k;
  const BH = bh * k;
  const SX = sx * k;
  const SY = sy * k;
  const sr = srmm.map((r) => r * k);
  const br = brmm.map((r) => r * k);
  const rim = rimmm * k;
  const color = opts.color || defaultColor(dev);
  const bezelColor = P.bezelColor || FD.bezelColor;

  // Éléments autour du corps : boutons, charnières, socles (repère du corps, portrait).
  const parts = [];
  const btnDepth = framesOn ? Math.max(1.2, 0.85 * k) : 0;
  if (framesOn && P.btn) {
    for (const [edge, a, b, kind] of P.btn) {
      const d = kind === 'flush' ? btnDepth * 0.5 : btnDepth;
      if (edge === 'left') parts.push({ kind: 'btn', x: -d, y: BH * a, w: d + rim, h: BH * (b - a), edge, flush: kind === 'flush' });
      else if (edge === 'right') parts.push({ kind: 'btn', x: BW - rim, y: BH * a, w: d + rim, h: BH * (b - a), edge, flush: kind === 'flush' });
      else if (edge === 'top') parts.push({ kind: 'btn', x: BW * a, y: -d, w: BW * (b - a), h: d + rim, edge });
      else if (edge === 'bottom') parts.push({ kind: 'btn', x: BW * a, y: BH - rim, w: BW * (b - a), h: d + rim, edge });
    }
  }
  if (framesOn && P.grips) {
    // Manettes de console (Joy-Con, Legion Go) de part et d'autre de l'écran.
    const gw = P.grips.w * k;
    const rr0 = Math.min(gw * 0.95, BH * 0.45);
    parts.push({ kind: 'grip', edge: 'left', x: -gw, y: 0, w: gw + rim + 1, h: BH, r: rr0, color: P.grips.colors ? P.grips.colors[0] : null });
    parts.push({ kind: 'grip', edge: 'right', x: BW - rim - 1, y: 0, w: gw + rim + 1, h: BH, r: rr0, color: P.grips.colors ? P.grips.colors[1] : null });
  }
  if (framesOn && P.crown) parts.push({ kind: 'crown', edge: 'right', x: BW - rim, y: BH * P.crown[0] - P.crown[1] * k / 2, w: (P.crown[2] || 2.2) * k + rim, h: P.crown[1] * k });
  const hinge = framesOn ? P.hinge : null;
  if (hinge === 'left') parts.push({ kind: 'spine', edge: 'left', x: -1.5 * k, y: br[0] * 0.35, w: 1.5 * k + rim, h: BH - br[0] * 0.35 - br[3] * 0.35 });
  if (hinge === 'top') parts.push({ kind: 'spine', edge: 'top', x: br[0] * 0.25, y: -3.0 * k, w: BW - br[0] * 0.5, h: 3.0 * k + rim });
  const hingeMarks = [];
  if (hinge === 'v') hingeMarks.push({ dir: 'v', at: 0.5 });
  if (hinge === 'h') hingeMarks.push({ dir: 'h', at: 0.5 });
  if (Array.isArray(hinge)) for (const f of hinge) hingeMarks.push({ dir: 'v', at: f });
  for (const m of hingeMarks) {
    const len = 3.2 * k;
    if (m.dir === 'v') {
      const x = SX + W0 * m.at;
      parts.push({ kind: 'hingecap', x: x - len / 2, y: -0.7 * k, w: len, h: 0.7 * k + rim, edge: 'top' });
      parts.push({ kind: 'hingecap', x: x - len / 2, y: BH - rim, w: len, h: 0.7 * k + rim, edge: 'bottom' });
      parts.push({ kind: 'seam', dir: 'v', x, y: 0, len: BH });
    } else {
      const y = SY + H0 * m.at;
      parts.push({ kind: 'hingecap', x: -0.7 * k, y: y - len / 2, w: 0.7 * k + rim, h: len, edge: 'left' });
      parts.push({ kind: 'hingecap', x: BW - rim, y: y - len / 2, w: 0.7 * k + rim, h: len, edge: 'right' });
      parts.push({ kind: 'seam', dir: 'h', x: 0, y, len: BW });
    }
  }

  // Détails sur la vitre (repère du corps).
  const glass = [];
  if (framesOn) {
    if (st.frame === 'home') {
      glass.push({ kind: 'cam', cx: BW / 2 - 9 * k, cy: SY / 2, d: 2.6 * k });
      glass.push({ kind: 'speaker', cx: BW / 2, cy: SY / 2, w: 10 * k, h: 1.1 * k });
      glass.push({ kind: 'home', cx: BW / 2, cy: BH - (BH - SY - H0) / 2, d: 10.6 * k });
    } else if (st.frame === 'slim') {
      glass.push({ kind: 'speaker', cx: BW / 2, cy: SY / 2, w: 9 * k, h: 0.9 * k });
      glass.push({ kind: 'cam', cx: BW / 2 + 9 * k, cy: SY / 2, d: 2.2 * k });
    } else if (form === 'phone' && st.frame !== 'flip-mini' && !String(st.frame).startsWith('flip-cover')) {
      glass.push({ kind: 'earpiece', cx: BW / 2, cy: Math.max(rim + 0.5 * k, SY * 0.45), w: Math.min(11 * k, W0 * 0.12), h: 0.45 * k });
    }
    if (P.bezelCam) {
      const by = form === 'aio' || form === 'monitor' ? SY / 2 : SY / 2;
      glass.push({ kind: 'cam', cx: BW / 2, cy: by, d: Math.max(2.2 * k, 3) });
    }
    if (P.cutInBezel) glass.push({ kind: 'cam', cx: pos(P.cutInBezel.cx, BW, k, BW / 2), cy: SY / 2, d: P.cutInBezel.d * k });
    if (form === 'aio') glass.push({ kind: 'chin', x: 0, y: SY + H0 + 4 * k, w: BW, h: BH - (SY + H0 + 4 * k) });
    if (form === 'tv' && P.chin === 'sensor') glass.push({ kind: 'sensor', cx: BW / 2, cy: SY + H0 + (BH - SY - H0) / 2, w: 22 * k, h: 1.6 * k });
    if (form === 'tv' && P.chin === 'logo') glass.push({ kind: 'led', cx: BW / 2, cy: SY + H0 + (BH - SY - H0) / 2, w: 26 * k, h: 2.2 * k });
    if (P.controls) {
      // Commandes de console : position en mm depuis le coin haut gauche du corps (right : depuis le bord droit).
      for (const c of P.controls) {
        const cx = c.right ? BW + c.x * k : c.x * k;
        glass.push({ kind: `ctl-${c.t}`, cx, cy: c.y * k, d: (c.d || 10) * k, w: (c.w || 0) * k, h: (c.h || 0) * k });
      }
    }
    if (P.slot) glass.push({ kind: 'slot', cx: BW / 2, cy: P.slot.y * k, w: P.slot.w * k, h: 0.9 * k });
    if (P.keypad) glass.push({ kind: 'keypad', x: (BW - P.keypad.w * k) / 2, y: P.keypad.y * k, w: P.keypad.w * k, h: P.keypad.h * k, rows: P.keypad.rows || 4, cols: P.keypad.cols || 3 });
    if (P.speakerGrill) glass.push({ kind: 'grill', x: (BW - P.speakerGrill.w * k) / 2, y: P.speakerGrill.y * k, w: P.speakerGrill.w * k, h: P.speakerGrill.h * k });
    if (P.lens && P.lensSpace === 'body') {
      for (const l of P.lens) glass.push({ kind: 'lens', cx: pos(l.cx, BW, k), cy: pos(l.cy, BH, k), d: l.d * k });
    }
  }

  // Éléments dessinés par-dessus la page (repère de l'écran, portrait).
  const overlays = [];
  const cut = framesOn ? P.cut : null;
  if (cut) {
    const unit = cut.css ? 1 : k;
    if (cut.t === 'island') {
      const w = cut.w * unit;
      const h = cut.h * unit;
      overlays.push({ kind: 'island', x: pos(cut.cx, W0, k, W0 / 2) - w / 2, y: cut.y * unit, w, h });
    } else if (cut.t === 'notch') {
      const w = cut.w * unit;
      overlays.push({ kind: 'notch', x: (W0 - w) / 2, y: 0, w, h: cut.h * unit, radii: [0, 0, 20, 20] });
    } else if (cut.t === 'drop') {
      const w = cut.w * unit;
      overlays.push({ kind: 'drop', x: (W0 - w) / 2, y: 0, w, h: cut.h * unit });
    } else if (cut.t === 'punch' || cut.t === 'udc') {
      const d = cut.d * k;
      overlays.push({ kind: cut.t, cx: pos(cut.cx, W0, k, W0 / 2), cy: cut.y * k + d / 2, d });
    }
  }
  if (framesOn && P.lens && P.lensSpace !== 'body') {
    for (const l of P.lens) overlays.push({ kind: 'lens', cx: pos(l.cx, W0, k), cy: pos(l.cy, H0, k), d: l.d * k });
    if (P.flash) overlays.push({ kind: 'flash', cx: pos(P.flash.cx, W0, k), cy: pos(P.flash.cy, H0, k), d: P.flash.d * k });
  }
  if (framesOn && P.notch) overlays.push({ kind: 'mac-notch', x: W0 / 2 - 100, y: 0, w: 200, h: 32 });
  const creases = P.crease ? (Array.isArray(P.crease) ? P.crease.map((at) => ({ dir: 'v', at })) : [{ dir: P.crease === 'h' ? 'h' : 'v', at: 0.5, soft: P.crease === 'soft' }]) : [];
  if (framesOn) for (const c of creases) overlays.push({ kind: 'crease', ...c });
  if (st.hingeMask) overlays.push({ kind: 'hinge', x: st.hingeMask.offset, y: 0, w: st.hingeMask.mask, h: H0, framesOn });
  if (framesOn && P.splits > 1) {
    // Plusieurs écrans côte à côte : la page s'étend sur tous, les bords des dalles la coupent.
    const gap = (P.gap ?? 14) * k;
    for (let i = 1; i < P.splits; i += 1) overlays.push({ kind: 'bezelbar', x: (W0 * i) / P.splits - gap / 2, y: 0, w: gap, h: H0 });
  }

  // Socles, pieds, base (sous le corps).
  const extra = [];
  if (framesOn && form === 'laptop' && P.base) {
    const wB = P.base.w * k;
    const hB = Math.max(P.base.h * k, 10);
    extra.push({ kind: 'base', x: (BW - wB) / 2 - wB * 0.04, y: BH, w: wB * 1.08, h: hB });
  }
  if (framesOn && P.stand) {
    const s = P.stand;
    if (s.kind === 'column') {
      extra.push({ kind: 'neck', x: BW / 2 - 28 * k, y: BH, w: 56 * k, h: s.h * k });
      extra.push({ kind: 'foot', x: BW / 2 - (s.foot[0] * k) / 2, y: BH + s.h * k - 3 * k, w: s.foot[0] * k, h: 12 * k });
    } else if (s.kind === 'blade') {
      extra.push({ kind: 'blade', x: BW / 2 - (s.foot[0] * k) / 2, y: BH, w: s.foot[0] * k, h: s.h * k });
      extra.push({ kind: 'foot', x: BW / 2 - (s.foot[0] * 1.04 * k) / 2, y: BH + s.h * k - 2 * k, w: s.foot[0] * 1.04 * k, h: 6 * k });
    } else if (s.kind === 'pedestal') {
      extra.push({ kind: 'neck', x: BW / 2 - 60 * k, y: BH - 2 * k, w: 120 * k, h: s.h * k * 0.8 });
      extra.push({ kind: 'plate', x: BW / 2 - (s.w * k) / 2, y: BH + s.h * k * 0.8 - 4 * k, w: s.w * k, h: 9 * k });
    } else if (s.kind === 'feet') {
      for (const at of s.at) extra.push({ kind: 'leg', x: BW * at - 40 * k, y: BH - 4 * k, w: 80 * k, h: s.h * k });
    } else if (s.kind === 'columns') {
      for (const at of s.at) {
        extra.push({ kind: 'neck', x: BW * at - 26 * k, y: BH, w: 52 * k, h: s.h * k });
        extra.push({ kind: 'foot', x: BW * at - (s.foot[0] * k) / 2, y: BH + s.h * k - 3 * k, w: s.foot[0] * k, h: 11 * k });
      }
    } else if (s.kind === 'kiosk') {
      extra.push({ kind: 'neck', x: BW / 2 - (s.w * k) / 2, y: BH - 2 * k, w: s.w * k, h: s.h * k });
      extra.push({ kind: 'plate', x: BW / 2 - (s.foot * k) / 2, y: BH + s.h * k - 10 * k, w: s.foot * k, h: 14 * k });
    } else if (s.kind === 'fabric') {
      // Enceinte en tissu sous l'écran (Echo Show, Nest Hub).
      const fw = (s.w || bw * 0.9) * k;
      extra.push({ kind: 'fabric', x: (BW - fw) / 2, y: BH * (s.from ?? 0.55), w: fw, h: BH * (1 - (s.from ?? 0.55)) + s.h * k, color: s.color || '#d9d6d0' });
    } else if (s.kind === 'easel') {
      // Cadre photo posé sur son chevalet.
      extra.push({ kind: 'neck', x: BW * 0.62, y: BH * 0.45, w: 14 * k, h: BH * 0.55 + s.h * k });
    } else if (s.kind === 'dash') {
      // Tableau de bord derrière l'écran de la voiture.
      extra.push({ kind: 'dash', x: -BW * 0.18, y: BH * 0.35, w: BW * 1.36, h: BH * 0.65 + s.h * k, color: s.color || '#26272b' });
    }
  }
  if (framesOn && P.strap) {
    const sw2 = P.strap.w * k;
    const sl = P.strap.len * k;
    extra.push({ kind: 'strap', edge: 'top', x: (BW - sw2) / 2, y: -sl + 2 * k, w: sw2, h: sl, color: P.strap.color });
    extra.push({ kind: 'strap', edge: 'bottom', x: (BW - sw2) / 2, y: BH - 2 * k, w: sw2, h: sl, color: P.strap.color });
  }
  if (framesOn && P.grabber) extra.push({ kind: 'grabber', x: BW / 2 - BW * 0.06, y: BH + 9 * k, w: BW * 0.12, h: 4.5 * k });
  if (framesOn && P.box) {
    // Unité centrale à droite de l'écran (tour, station de travail, mini-PC).
    const bxw = P.box.w * k;
    const bxh = P.box.h * k;
    const floor = P.stand ? BH + P.stand.h * k + 9 * k : BH;
    extra.push({ kind: 'box', style: P.box.t, x: BW + 40 * k, y: floor - bxh, w: bxw, h: bxh });
  }

  // Boîte totale (portrait) : corps + débords (boutons, charnières, socles).
  let minX = 0;
  let minY = 0;
  let maxX = BW;
  let maxY = BH;
  for (const p of parts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x + (p.w || 0)); maxY = Math.max(maxY, p.y + (p.h || 0)); }
  for (const e of extra) { minX = Math.min(minX, e.x); minY = Math.min(minY, e.y); maxX = Math.max(maxX, e.x + e.w); maxY = Math.max(maxY, e.y + e.h); }
  const pad = framesOn ? 2 : 0;
  const ox = -minX + pad;
  const oy = -minY + pad;
  const PW = maxX - minX + pad * 2;
  const PH = maxY - minY + pad * 2;

  // Barre d'état.
  let sb = null;
  if (opts.statusBar) {
    const spec = P.notch ? STATUS.macos : STATUS[st.frame];
    if (spec && !(land && spec.kind !== 'tablet' && spec.kind !== 'macos')) sb = { ...spec };
  }

  // Passage en paysage.
  const W = land ? H0 : W0;
  const H = land ? W0 : H0;
  const TW = land ? PH : PW;
  const TH = land ? PW : PH;
  const sxP = ox + SX;
  const syP = oy + SY;
  const screen = land ? { x: syP, y: PW - sxP - W0, w: W, h: H } : { x: sxP, y: syP, w: W, h: H };
  const srView = land ? [sr[1], sr[2], sr[3], sr[0]] : sr;
  const sbh = sb ? sb.h : 0;

  let hingeFeature = null;
  if (st.hingeMask) hingeFeature = { orientation: land ? 'horizontal' : 'vertical', offset: st.hingeMask.offset, mask: st.hingeMask.mask };

  return {
    dev, st, land, framesOn, form, k, dpr: st.dpr, color, bezelColor, hifi: framesOn ? P.hifi || null : null,
    W, H, W0, H0, TW, TH, PW, PH,
    body: { x: ox, y: oy, w: BW, h: BH, r: br, rim },
    screen, screenP: { x: sxP, y: syP, w: W0, h: H0 }, sr: srView, srP: sr,
    parts: parts.map((p) => ({ ...p, x: p.x + ox, y: p.y + oy })),
    glass: glass.map((g) => ({ ...g, x: g.x != null ? g.x + ox : undefined, y: g.y != null ? g.y + oy : undefined, cx: g.cx != null ? g.cx + ox : undefined, cy: g.cy != null ? g.cy + oy : undefined })),
    extra: extra.map((e) => ({ ...e, x: e.x + ox, y: e.y + oy })),
    overlays, sb, vp: { x: 0, y: sbh, w: W, h: H - sbh }, hingeFeature,
    phys: {
      form, bw, bh, bd, sw: swmm, sh: shAdj, sx, sy, br: brmm, sr: srmm, rim: rimmm, k, P, frame: st.frame,
    },
  };
}

function layoutSkin({
  dev, st, land, opts, P, form, W0, H0, skin, k, swmm, shAdj, bd,
}) {
  const kx = W0 / skin.display.w;
  const ky = H0 / skin.display.h;
  const BW = skin.canvas[0] * kx;
  const BH = skin.canvas[1] * ky;
  const pad = 2;
  const ox = pad;
  const oy = pad;
  const PW = BW + pad * 2;
  const PH = BH + pad * 2;
  const SX = skin.display.x * kx;
  const SY = skin.display.y * ky;
  // Coins de l'écran : rayon déclaré par le cadre (le calque du fabricant les recouvre aussi) ;
  // pour une montre ronde, le cercle complet.
  let r = skin.display.r ? skin.display.r * kx : 0;
  if (form === 'watch' && P.sr) r = Math.max(r, Math.min(P.sr * k, W0 / 2));
  const sr = [r, r, r, r];
  const overlays = [];
  const creases = P.crease ? (Array.isArray(P.crease) ? P.crease.map((at) => ({ dir: 'v', at })) : [{ dir: P.crease === 'h' ? 'h' : 'v', at: 0.5, soft: P.crease === 'soft' }]) : [];
  for (const c of creases) overlays.push({ kind: 'crease', ...c });
  if (st.hingeMask) overlays.push({ kind: 'hinge', x: st.hingeMask.offset, y: 0, w: st.hingeMask.mask, h: H0, framesOn: true });
  let sb = null;
  if (opts.statusBar) {
    const spec = STATUS[st.frame] || (form === 'phone' ? STATUS.punch : null);
    if (spec && !(land && spec.kind !== 'tablet')) sb = { ...spec };
  }
  const W = land ? H0 : W0;
  const H = land ? W0 : H0;
  const sxP = ox + SX;
  const syP = oy + SY;
  const screen = land ? { x: syP, y: PW - sxP - W0, w: W, h: H } : { x: sxP, y: syP, w: W, h: H };
  const sbh = sb ? sb.h : 0;
  return {
    dev, st, land, framesOn: true, form, k, dpr: st.dpr, color: opts.color || defaultColor(dev), bezelColor: '#000000',
    W, H, W0, H0, TW: land ? PH : PW, TH: land ? PW : PH, PW, PH,
    body: { x: ox, y: oy, w: BW, h: BH, r: [0, 0, 0, 0], rim: 0 },
    screen, screenP: { x: sxP, y: syP, w: W0, h: H0 }, sr: land ? [sr[1], sr[2], sr[3], sr[0]] : sr, srP: sr,
    parts: [], glass: [], extra: [], overlays, sb, vp: { x: 0, y: sbh, w: W, h: H - sbh },
    hingeFeature: st.hingeMask ? { orientation: land ? 'horizontal' : 'vertical', offset: st.hingeMask.offset, mask: st.hingeMask.mask } : null,
    skin: { v: skin, kx, ky },
    phys: {
      form, bw: BW / k, bh: BH / k, bd, sw: swmm, sh: shAdj, sx: SX / k, sy: SY / k, br: [0, 0, 0, 0], sr: sr.map((x) => x / k), rim: 0, k, P, frame: st.frame,
    },
  };
}

// Applique la rotation portrait → paysage au contexte de dessin (boîte de taille PW en portrait).
export function rotateForLandscape(ctx, size) {
  ctx.transform(0, -1, 1, 0, 0, size);
}

// Hauteur du bandeau de la barre d'état qui réduit la zone de la page.
export function statusHeight(L) {
  return L.sb ? L.sb.h : 0;
}
