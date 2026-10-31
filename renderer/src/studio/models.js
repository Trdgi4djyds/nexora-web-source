/* Modèles 3D des appareils, construits à partir de leurs mesures réelles (mm).
 * La façade (vitre, bordures, île, poinçon) reprend exactement le dessin 2D de NEXORA ; le corps,
 * la tranche, le dos, les modules photo, les boutons, les charnières, les socles sont en volume.
 * Unités du modèle : millimètres (le groupe racine est mis à l'échelle 1/10 : 1 unité de scène = 1 cm).
 */
import * as T from './three.js';
import { getDevice, defaultColor } from '../devices/catalog.js';
import { layoutDevice, DISPLAY_FORMS } from '../devices/geometry.js';
import { shade, luminance } from '../devices/frames2d.js';
import {
  frontTexture, overlayTexture, wallpaperTexture, keyboardTexture,
} from './textures.js';

const EPS = 0.05;
const clampR = (r, w, h) => Math.max(0, Math.min(r, w / 2 - 0.01, h / 2 - 0.01));

// Rectangle arrondi (repère y vers le haut) ; rayons [haut-gauche, haut-droit, bas-droit, bas-gauche].
export function rrShape(x, y, w, h, r = [0, 0, 0, 0]) {
  const [tl, tr, br, bl] = r.map((v) => clampR(v, w, h));
  const s = new T.Shape();
  s.moveTo(x + bl, y);
  s.lineTo(x + w - br, y);
  if (br) s.absarc(x + w - br, y + br, br, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - tr);
  if (tr) s.absarc(x + w - tr, y + h - tr, tr, 0, Math.PI / 2, false);
  s.lineTo(x + tl, y + h);
  if (tl) s.absarc(x + tl, y + h - tl, tl, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + bl);
  if (bl) s.absarc(x + bl, y + bl, bl, Math.PI, Math.PI * 1.5, false);
  return s;
}

/* Plan découpé selon une forme. map(x, y) → [x, y] transforme les positions (miroir possible),
 * uv(x, y) → [u, v] ; back : la face regarde vers -z. */
function planeGeo(shape, { z = 0, back = false, uv = null, map = null } = {}) {
  const g = new T.ShapeGeometry(shape, 24);
  const pos = g.attributes.position;
  const uvA = g.attributes.uv;
  const nrm = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    if (uv) { const [u, v] = uv(x, y); uvA.setXY(i, u, v); }
    if (map) { const [mx, my] = map(x, y); pos.setXY(i, mx, my); }
    pos.setZ(i, z);
    nrm.setXYZ(i, 0, 0, back ? -1 : 1);
  }
  // Une symétrie (miroir) inverse déjà le sens des triangles ; sinon on l'inverse pour une face arrière.
  const mirrored = map ? (() => {
    const [ax, ay] = map(0, 0); const [bx, by] = map(1, 0); const [cx, cy] = map(0, 1);
    return ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) < 0;
  })() : false;
  if (back !== mirrored) {
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  }
  pos.needsUpdate = true;
  return g;
}

function slabGeo(x0, y0, w, h, radii, depth, { bevel = 0.9, z0 = -depth / 2 } = {}) {
  const bs = Math.min(bevel, depth * 0.3, w * 0.1, h * 0.1);
  const bt = Math.min(bevel * 1.1, depth * 0.32);
  const shape = rrShape(x0 + bs, y0 + bs, w - bs * 2, h - bs * 2, radii.map((r) => Math.max(0, r - bs)));
  const d = Math.max(0.05, depth - bt * 2);
  const g = new T.ExtrudeGeometry(shape, {
    depth: d, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelSegments: 5, curveSegments: 18,
  });
  g.translate(0, 0, z0 + bt);
  return { geo: g, inset: bs };
}

function canvasTexture(canvas, renderer) {
  const t = new T.CanvasTexture(canvas);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 8;
  t.generateMipmaps = true;
  t.minFilter = T.LinearMipmapLinearFilter;
  return t;
}

// ------------------------------------------------------------------ matériaux
function materials(color, form, P = {}) {
  const metalFrame = form !== 'tv' && form !== 'monitor';
  const light = luminance(color) > 0.6;
  // Réalisme : une base douce (verre dépoli) + une fine couche de vernis NETTE (clearcoatRoughness bas).
  // C'est ce reflet net par-dessus qui fait « verre » et non « plastique ».
  return {
    frame: new T.MeshPhysicalMaterial({
      color: new T.Color(color), metalness: metalFrame ? (P.hifi === 'apple' ? 0.8 : 0.9) : 0.35, roughness: metalFrame ? (P.hifi === 'apple' ? 0.3 : P.hifi === 'samsung' ? 0.22 : 0.26) : 0.55, clearcoat: 0.4, clearcoatRoughness: 0.12, envMapIntensity: 1.45,
    }),
    back: new T.MeshPhysicalMaterial(P.uniformBack ? {
      // Verre dépoli teinté dans la masse, assorti au cadre (iPhone 17/18 Pro).
      color: new T.Color(shade(color, light ? -0.03 : 0.02)), metalness: 0.12, roughness: 0.46, clearcoat: 0.45, clearcoatRoughness: 0.1, sheen: 0.3, sheenRoughness: 0.55, sheenColor: new T.Color(shade(color, 0.3)), envMapIntensity: 1.3, specularIntensity: 0.9,
    } : P.hifi === 'samsung' ? {
      // Verre satiné Gorilla Glass (Galaxy S Ultra).
      color: new T.Color(shade(color, light ? -0.02 : 0.04)), metalness: 0.08, roughness: 0.3, clearcoat: 0.75, clearcoatRoughness: 0.06, envMapIntensity: 1.4, specularIntensity: 1,
    } : {
      // Verre dépoli (la plupart des téléphones récents) : base douce + vernis net.
      color: new T.Color(shade(color, light ? -0.02 : 0.03)), metalness: form === 'laptop' ? 0.75 : 0.05, roughness: form === 'laptop' ? 0.38 : 0.38, clearcoat: form === 'laptop' ? 0.1 : 0.6, clearcoatRoughness: form === 'laptop' ? 0.3 : 0.07, envMapIntensity: 1.35, specularIntensity: 0.9,
    }),
    // Bagues d'objectifs : métal poli, reflets vifs sur les arêtes.
    lensRing: new T.MeshPhysicalMaterial({ color: new T.Color(shade(color, light ? -0.18 : 0.16)), metalness: 1, roughness: 0.14, envMapIntensity: 1.7 }),
    lensGlass: new T.MeshPhysicalMaterial({
      // Traitement antireflet : reflets bleu-vert-violet (couche mince plus fine, sans dominante rouge).
      color: new T.Color('#090b13'), metalness: 0.25, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.01, iridescence: 0.7, iridescenceIOR: 1.5, iridescenceThicknessRange: [120, 380], envMapIntensity: 2,
    }),
    lensInner: new T.MeshPhysicalMaterial({ color: new T.Color('#16204a'), metalness: 0.7, roughness: 0.12, envMapIntensity: 1.6 }),
    flash: new T.MeshPhysicalMaterial({ color: new T.Color('#f6eed6'), roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05, emissive: new T.Color('#2a2414') }),
    bump: new T.MeshPhysicalMaterial(P.uniformBack ? {
      // Plateau aluminium anodisé (iPhone 17/18 Pro) : métal satiné, se détache du verre dépoli du dos.
      color: new T.Color(shade(color, light ? -0.06 : 0.09)), metalness: 0.65, roughness: 0.26, clearcoat: 0.7, clearcoatRoughness: 0.06, envMapIntensity: 1.6,
    } : {
      // Bloc photo en verre brillant sur dos dépoli : le contraste de brillance révèle le relief.
      color: new T.Color(shade(color, light ? -0.07 : 0.08)), metalness: 0.15, roughness: 0.07, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.8,
    }),
    sensor: new T.MeshPhysicalMaterial({ color: new T.Color('#0d0e12'), metalness: 0.3, roughness: 0.25, clearcoat: 1 }),
    dark: new T.MeshStandardMaterial({ color: new T.Color('#121214'), roughness: 0.6, metalness: 0.2 }),
  };
}

function frontMaterial(tex) {
  return new T.MeshPhysicalMaterial({
    map: tex, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04,
  });
}
function screenMaterial(tex) {
  return new T.MeshPhysicalMaterial({
    color: 0x000000, emissive: 0xffffff, emissiveMap: tex, roughness: 0.08, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.03, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
}
function overlayMaterial(tex) {
  return new T.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}

// ------------------------------------------------------------------ module photo (dos)
/* Place le module photo sur le dos d'un panneau [x0,x1]×[y0,y1] (repère du corps, vu de face :
 * le module, en haut à gauche vu de dos, est en haut à droite vu de face). */
function cameraModule(spec, panel, bd, M, scale = 1) {
  const g = new T.Group();
  const W = (panel.x1 - panel.x0) * scale;
  const zb = -bd / 2;
  const right = panel.x1;
  const top = panel.y1;
  const lens = (cx, cy, d, h = 1.4) => {
    const ring = new T.Mesh(new T.CylinderGeometry(d / 2, d / 2 * 1.02, h, 48), M.lensRing);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(cx, cy, zb - h / 2);
    g.add(ring);
    const glass = new T.Mesh(new T.CylinderGeometry(d * 0.39, d * 0.39, h + 0.12, 48), M.lensGlass);
    glass.rotation.x = Math.PI / 2;
    glass.position.set(cx, cy, zb - h / 2 - 0.06);
    g.add(glass);
    const inner = new T.Mesh(new T.CircleGeometry(d * 0.17, 32), M.lensInner);
    inner.position.set(cx, cy, zb - h - 0.13);
    inner.rotation.y = Math.PI;
    g.add(inner);
  };
  const flash = (cx, cy, d) => {
    const f = new T.Mesh(new T.CylinderGeometry(d / 2, d / 2, 0.5, 32), M.flash);
    f.rotation.x = Math.PI / 2;
    f.position.set(cx, cy, zb - 0.25);
    g.add(f);
  };
  // Les blocs photo réels dépassent de 2 à 4 mm : relief accentué et arêtes arrondies qui accrochent la lumière.
  const RELIEF = 1.6;
  const plateau = (cx, cy, w, h, r, depth0) => {
    const depth = depth0 * RELIEF;
    const bt = Math.min(0.55, depth * 0.3);
    const s = rrShape(-w / 2, -h / 2, w, h, [r, r, r, r]);
    const geo = new T.ExtrudeGeometry(s, {
      depth: Math.max(0.05, depth - 2 * bt), bevelEnabled: true, bevelThickness: bt, bevelSize: bt, bevelSegments: 6, curveSegments: 32,
    });
    const m = new T.Mesh(geo, M.bump);
    m.position.set(cx, cy, zb - depth + bt);
    g.add(m);
    return zb - depth;
  };
  const t = (spec && spec.t) || 'single';
  const n = (spec && spec.n) || (t === 'single' ? 1 : 2);
  const m = W * 0.075;
  if (t === 'square' || t === 'diag2') {
    const s = W * (n >= 3 ? 0.5 : n === 2 ? 0.4 : 0.3);
    const cx = right - m - s / 2;
    const cy = top - m - s / 2;
    const zTop = plateau(cx, cy, s, s, s * 0.27, 1.3);
    const d = s * (n >= 3 ? 0.42 : 0.4);
    const off = s * 0.24;
    const pts = n >= 4 ? [[-off, off], [off, off], [-off, -off], [off, -off]] : n === 3 ? [[off, off], [off, -off], [-off, 0]] : n === 2 ? [[off, off], [-off, -off]] : [[0, 0]];
    for (const [px, py] of pts) lensAt(cx + px, cy + py, d, zTop);
    flash(cx - off, cy + off * (n === 3 ? 1 : -1), s * 0.1);
  } else if (t === 'plateau') {
    const h = W * 0.36;
    const w = W - m * 0.6;
    const cx = (panel.x0 + panel.x1) / 2;
    const cy = top - m * 0.4 - h / 2;
    const zTop = plateau(cx, cy, w, h, h * 0.3, 1.1);
    const d = h * 0.38;
    const lx = right - m - h * 0.45;
    if (n >= 3) { lensAt(lx, cy + h * 0.22, d, zTop); lensAt(lx, cy - h * 0.22, d, zTop); lensAt(lx - h * 0.4, cy, d, zTop); } else lensAt(lx, cy, d, zTop);
    flash(panel.x0 + m + h * 0.3, cy + h * 0.15, h * 0.1);
  } else if (t === 'plateau18') {
    // iPhone 18 Pro : plateau sur toute la largeur, trois objectifs en triangle, flash, LiDAR et micro à l'opposé.
    const h = W * 0.4;
    const w = W - m * 0.3;
    const cx = (panel.x0 + panel.x1) / 2;
    const cy = top - m * 0.25 - h / 2;
    const zTop = plateau(cx, cy, w, h, h * 0.32, 1.25);
    const d = h * 0.4;
    const lx = right - m * 0.7 - h * 0.42;
    lensAt(lx, cy + h * 0.23, d, zTop, 1.25);
    lensAt(lx, cy - h * 0.23, d, zTop, 1.25);
    lensAt(lx - h * 0.42, cy, d, zTop, 1.25);
    const fx = panel.x0 + m * 0.7 + h * 0.3;
    flashOn(fx, cy + h * 0.24, h * 0.12, zTop);
    sensorOn(fx, cy - h * 0.2, h * 0.13, zTop);
    sensorOn(fx + h * 0.32, cy + h * 0.02, h * 0.04, zTop);
  } else if (t === 's26u') {
    // Galaxy S26 Ultra : îlot vertical en relief (trois objectifs), quatrième objectif, flash et laser à côté.
    const w = W * 0.21;
    const h = w * 3 + w * 0.1;
    const cx = right - m * 0.9 - w / 2;
    const cy = top - m * 0.9 - h / 2;
    const zTop = plateau(cx, cy, w, h, w / 2, 1.05);
    const d = w * 0.82;
    for (let i = 0; i < 3; i++) lensAt(cx, cy + h / 2 - w * 0.55 - i * w * 1.0, d, zTop, 1.15);
    const x2 = cx - w * 1.05;
    lens(x2, cy - h * 0.18, w * 0.62, 1.2);
    flash(x2, cy + h * 0.32, w * 0.2);
    const laser = new T.Mesh(new T.CylinderGeometry(w * 0.09, w * 0.09, 0.4, 24), M.sensor);
    laser.rotation.x = Math.PI / 2;
    laser.position.set(x2, cy + h * 0.14, zb - 0.2);
    g.add(laser);
  } else if (t === 'bump-h') {
    const h = W * 0.27;
    const w = W - m * 1.2;
    const cx = (panel.x0 + panel.x1) / 2;
    const cy = top - m * 0.7 - h / 2;
    const zTop = plateau(cx, cy, w, h, h / 2, 1.2);
    const d = h * 0.62;
    lensAt(right - m - h * 0.6, cy, d, zTop);
    if (n >= 2) lensAt(right - m - h * 1.45, cy, d, zTop);
    flash(panel.x0 + m + h * 0.7, cy, h * 0.16);
  } else if (t === 'visor') {
    const h = W * 0.19;
    const cx = (panel.x0 + panel.x1) / 2;
    const cy = top - (panel.y1 - panel.y0) * 0.11;
    const zTop = plateau(cx, cy, W + 0.4, h, h / 2, 2.2);
    const d = h * 0.62;
    for (let i = 0; i < n; i++) lensAt(right - W * 0.18 - i * d * 1.25, cy, d, zTop);
    flash(panel.x0 + W * 0.3, cy, h * 0.18);
  } else if (t === 'pill-v') {
    const w = W * 0.19;
    const h = w * (n * 0.92 + 0.18);
    const cx = right - m - w / 2;
    const cy = top - m - h / 2;
    const zTop = plateau(cx, cy, w, h, w / 2, 1.0);
    const d = w * 0.74;
    for (let i = 0; i < n; i++) lensAt(cx, cy + h / 2 - w * 0.55 - i * w * 0.92, d, zTop);
    flash(cx - w * 0.9, cy + h / 2 - w * 0.45, w * 0.22);
  } else if (t === 'round') {
    const d0 = W * 0.52;
    const cx = (panel.x0 + panel.x1) / 2;
    const cy = top - m * 1.2 - d0 / 2;
    const ring = new T.Mesh(new T.CylinderGeometry(d0 / 2, d0 / 2, 1.6, 72), M.lensRing);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(cx, cy, zb - 0.8);
    g.add(ring);
    const zTop = zb - 1.6;
    const d = d0 * 0.32;
    const off = d0 * 0.2;
    const pts = n >= 4 ? [[-off, off], [off, off], [-off, -off], [off, -off]] : n === 3 ? [[0, off], [-off, -off * 0.7], [off, -off * 0.7]] : [[-off * 0.7, 0], [off * 0.7, 0]];
    for (const [px, py] of pts) lensAt(cx + px, cy + py, d, zTop);
    flash(cx + d0 * 0.62, cy, d0 * 0.08);
  } else if (t === 'lenses-v') {
    const d = W * 0.17;
    const cx = right - m - d / 2;
    for (let i = 0; i < n; i++) lens(cx, top - m - d / 2 - i * d * 1.22, d, 1.3);
    flash(cx - d * 0.95, top - m - d * 0.4, d * 0.28);
  } else {
    const d = W * 0.16;
    lens(right - m - d / 2, top - m - d / 2, d, 1.2);
    flash(right - m - d * 1.5, top - m - d * 0.3, d * 0.3);
  }
  function flashOn(cx, cy, dd, zTop) {
    const f = new T.Mesh(new T.CylinderGeometry(dd / 2, dd / 2, 0.3, 32), M.flash);
    f.rotation.x = Math.PI / 2;
    f.position.set(cx, cy, zTop - 0.1);
    g.add(f);
  }
  function sensorOn(cx, cy, dd, zTop) {
    const f = new T.Mesh(new T.CylinderGeometry(dd / 2, dd / 2, 0.3, 32), M.sensor);
    f.rotation.x = Math.PI / 2;
    f.position.set(cx, cy, zTop - 0.1);
    g.add(f);
  }
  function lensAt(cx, cy, d, zTop, hh = 0.9) {
    const h = hh;
    const ring = new T.Mesh(new T.CylinderGeometry(d / 2, d / 2, h, 48), M.lensRing);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(cx, cy, zTop - h / 2 + 0.05);
    g.add(ring);
    const glass = new T.Mesh(new T.CylinderGeometry(d * 0.43, d * 0.43, h + 0.1, 48), M.lensGlass);
    glass.rotation.x = Math.PI / 2;
    glass.position.set(cx, cy, zTop - h / 2);
    g.add(glass);
    const inner = new T.Mesh(new T.CircleGeometry(d * 0.19, 32), M.lensInner);
    inner.position.set(cx, cy, zTop - h - 0.08);
    inner.rotation.y = Math.PI;
    g.add(inner);
  }
  return g;
}

// ------------------------------------------------------------------ appareil
const FOLD_HINGES = ['v', 'h', 'gap'];
function foldStates(dev) {
  if (!dev.states || !dev.fold) return null;
  const isOpen = (s) => s.p && (FOLD_HINGES.includes(s.p.hinge) || Array.isArray(s.p.hinge));
  const open = dev.states.filter(isOpen).sort((a, b) => b.w * b.h - a.w * a.h)[0];
  const cover = dev.states.find((s) => s.p && (s.p.hinge === 'left' || s.p.hinge === 'top'));
  return open ? { open, cover } : null;
}

export function deviceInfo(deviceId, custom) {
  const dev = getDevice(deviceId, custom);
  const fs = foldStates(dev);
  return {
    dev,
    foldable: Boolean(fs),
    foldKind: fs ? dev.fold.kind : null,
    hasCover: Boolean(fs && fs.cover && ['book', 'flip', 'tri'].includes(dev.fold.kind)),
    laptop: (dev.p && dev.p.form === 'laptop') || false,
    openState: fs ? fs.open.id : null,
    coverState: fs && fs.cover ? fs.cover.id : null,
  };
}

/* item : { deviceId, state, land, color, fold (0 ouvert → 180 fermé), lid (degrés), main, cover }
 * main / cover : { canvas, cssW, cssH, sbBg, sbFg } ou null (fond d'écran). */
export class DeviceModel {
  constructor(item, { renderer, custom = [] } = {}) {
    this.item = item;
    this.renderer = renderer;
    this.custom = custom;
    this.root = new T.Group();
    this.root.name = 'appareil';
    this.mm = new T.Group();
    this.mm.scale.setScalar(0.1);
    this.root.add(this.mm);
    this.disposables = [];
    this.hinges = [];
    this.screens = [];
    this.build();
  }

  track(o) { this.disposables.push(o); return o; }

  build() {
    const { item } = this;
    const dev = getDevice(item.deviceId, this.custom);
    this.dev = dev;
    const color = item.color || defaultColor(dev);
    const fs = foldStates(dev);
    this.foldKind = fs ? dev.fold.kind : null;
    const geomState = fs ? fs.open.id : item.state;
    const land = Boolean(item.land) && !fs && !dev.fixed;
    const Lp = layoutDevice(dev, geomState, { land: false, framesOn: true, statusBar: true, color, skin: false });
    const Lv = land ? layoutDevice(dev, geomState, { land: true, framesOn: true, statusBar: true, color, skin: false }) : Lp;
    const Lc = fs && fs.cover ? layoutDevice(dev, fs.cover.id, { land: false, framesOn: true, statusBar: true, color, skin: false }) : null;
    this.Lp = Lp;
    this.Lv = Lv;
    this.Lc = Lc;
    this.land = land;
    const M = materials(color, Lp.form, Lp.phys ? Lp.phys.P : {});
    this.M = M;
    Object.values(M).forEach((m) => this.track(m));
    if (Lp.form === 'laptop') this.buildLaptop(Lp, M);
    else if (DISPLAY_FORMS.includes(Lp.form)) this.buildDisplay(Lp, M);
    else this.buildSlab(Lp, Lv, Lc, M, fs);
    this.setFold(item.fold ?? (fs && item.state === (fs.cover && fs.cover.id) ? 180 : 0));
    this.setLid(item.lid ?? 108);
    this.updateBounds();
  }

  // Écran (page, fond d'écran) d'un panneau : texture de page et calque de la barre d'état.
  screenLayer(Lv, src, kind) {
    const page = src && src.canvas ? src : null;
    const canvas = page ? page.canvas : wallpaperTexture(Lv, { dark: false });
    const tex = this.track(canvasTexture(canvas, this.renderer));
    tex.wrapS = T.ClampToEdgeWrapping;
    tex.wrapT = T.ClampToEdgeWrapping;
    const ov = this.track(canvasTexture(overlayTexture(Lv, {
      bg: page ? page.sbBg : '#000', fg: page ? page.sbFg : '#fff', statusBar: true,
    }), this.renderer));
    if (!page) {
      // Fond d'écran : barre d'état claire sur fond transparent (le dessin la remplit sinon).
      const c = overlayTexture(Lv, { bg: 'rgba(0,0,0,0)', fg: '#ffffff', statusBar: true });
      ov.image = c;
      ov.needsUpdate = true;
    }
    const screen = {
      kind, tex, ov, Lv, page, scroll: 0,
      mat: this.track(screenMaterial(tex)), ovMat: this.track(overlayMaterial(ov)),
    };
    this.applyScroll(screen);
    this.screens.push(screen);
    return screen;
  }

  // Fenêtre de la page visible à l'écran (défilement de 0 à 1).
  applyScroll(s) {
    const Lv = s.Lv;
    const W = Lv.W;
    const H = Lv.H;
    if (!s.page) { s.tex.repeat.set(1, 1); s.tex.offset.set(0, 0); return; }
    const cssW = s.page.cssW || W;
    const cssH = s.page.cssH || (H - (Lv.sb ? Lv.sb.h : 0));
    const sbh = Lv.sb ? Lv.sb.h : 0;
    const max = Math.max(0, cssH - (H - sbh));
    const y = max * Math.max(0, Math.min(1, s.scroll));
    s.tex.repeat.set(W / cssW, H / cssH);
    s.tex.offset.set(0, 1 - (H - sbh + y) / cssH);
  }

  setScroll(v, kind = 'main') {
    for (const s of this.screens) if (s.kind === kind) { s.scroll = v; this.applyScroll(s); }
    this.item[kind === 'main' ? 'scroll' : 'coverScroll'] = v;
  }

  // Coordonnées d'affichage (u, v) d'un point de l'écran (mm, repère du corps).
  static viewUV(Lp, Lv, land, screenRect) {
    const k = Lp.k;
    return (x, y) => {
      const xc = (x - screenRect.x0) * k;
      const yc = (screenRect.y1 - y) * k;
      let vx = xc;
      let vy = yc;
      if (land) { vx = yc; vy = Lp.W0 - xc; }
      return [vx / Lv.W, 1 - vy / Lv.H];
    };
  }

  buildSlab(Lp, Lv, Lc, M, fs) {
    const ph = Lp.phys;
    const { bw, bh, bd } = ph;
    const bodyX0 = -bw / 2;
    const bodyY1 = bh / 2;
    const k = Lp.k;
    const scr = {
      x0: bodyX0 + ph.sx, x1: bodyX0 + ph.sx + ph.sw, y1: bodyY1 - ph.sy, y0: bodyY1 - ph.sy - ph.sh,
    };
    const P = ph.P;
    const hingeSpec = P.hinge;
    const vCuts = [];
    const hCuts = [];
    if (hingeSpec === 'v') vCuts.push(scr.x0 + ph.sw * 0.5);
    else if (hingeSpec === 'gap') vCuts.push(0);
    else if (Array.isArray(hingeSpec)) for (const f of hingeSpec) vCuts.push(scr.x0 + ph.sw * f);
    else if (hingeSpec === 'h') hCuts.push(scr.y1 - ph.sh * 0.5);
    const xs = [bodyX0, ...vCuts, -bodyX0];
    const ys = [-bodyY1, ...hCuts.sort((a, b) => a - b), bodyY1];
    const br = ph.br; // [tl, tr, br, bl] en mm
    const sr = ph.sr;
    const frontTex = this.track(canvasTexture(frontTexture(Lp), this.renderer));
    const frontMat = this.track(frontMaterial(frontTex));
    const main = this.screenLayer(Lv, this.item.main, 'main');
    const uvMain = DeviceModel.viewUV(Lp, Lv, this.land, scr);
    const panels = [];
    for (let yi = 0; yi < ys.length - 1; yi++) {
      for (let xi = 0; xi < xs.length - 1; xi++) {
        const x0 = xs[xi];
        const x1 = xs[xi + 1];
        const y0 = ys[yi];
        const y1 = ys[yi + 1];
        const isL = xi === 0;
        const isR = xi === xs.length - 2;
        const isB = yi === 0;
        const isT = yi === ys.length - 2;
        const radii = [isL && isT ? br[0] : 0, isR && isT ? br[1] : 0, isR && isB ? br[2] : 0, isL && isB ? br[3] : 0];
        const group = new T.Group();
        const slab = slabGeo(x0, y0, x1 - x0, y1 - y0, radii, bd);
        this.track(slab.geo);
        const body = new T.Mesh(slab.geo, M.frame);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);
        const bs = slab.inset;
        // Faces avant et arrière : retrait de la tranche sur les bords extérieurs seulement.
        const fx0 = x0 + (isL ? bs : 0);
        const fx1 = x1 - (isR ? bs : 0);
        const fy0 = y0 + (isB ? bs : 0);
        const fy1 = y1 - (isT ? bs : 0);
        const fr = radii.map((r) => Math.max(0, r - bs));
        const face = rrShape(fx0, fy0, fx1 - fx0, fy1 - fy0, fr);
        const frontGeo = this.track(planeGeo(face, { z: bd / 2 + EPS, uv: (x, y) => [(x - bodyX0) / bw, (y + bodyY1) / bh] }));
        group.add(new T.Mesh(frontGeo, frontMat));
        const backGeo = this.track(planeGeo(face, { z: -bd / 2 - EPS, back: true }));
        const backMesh = new T.Mesh(backGeo, M.back);
        backMesh.castShadow = true;
        group.add(backMesh);
        // Écran de ce panneau.
        const sx0 = Math.max(scr.x0, x0);
        const sx1 = Math.min(scr.x1, x1);
        const sy0 = Math.max(scr.y0, y0);
        const sy1 = Math.min(scr.y1, y1);
        if (sx1 - sx0 > 0.5 && sy1 - sy0 > 0.5) {
          const sradii = [
            sx0 === scr.x0 && sy1 === scr.y1 ? sr[0] : 0, sx1 === scr.x1 && sy1 === scr.y1 ? sr[1] : 0,
            sx1 === scr.x1 && sy0 === scr.y0 ? sr[2] : 0, sx0 === scr.x0 && sy0 === scr.y0 ? sr[3] : 0,
          ];
          const sShape = rrShape(sx0, sy0, sx1 - sx0, sy1 - sy0, sradii);
          group.add(new T.Mesh(this.track(planeGeo(sShape, { z: bd / 2 + EPS * 2, uv: uvMain })), main.mat));
          group.add(new T.Mesh(this.track(planeGeo(sShape, { z: bd / 2 + EPS * 3, uv: uvMain })), main.ovMat));
        }
        panels.push({
          group, x0, x1, y0, y1, xi, yi, backMesh,
        });
      }
    }
    // Boutons sur les tranches.
    for (const p of Lp.parts) {
      if (p.kind !== 'btn') continue;
      const yTop = bodyY1 - (p.y - Lp.body.y) / k;
      const xL = bodyX0 + (p.x - Lp.body.x) / k;
      const w = p.w / k;
      const h = p.h / k;
      const out = 0.75;
      let geo;
      let pos;
      if (p.edge === 'left' || p.edge === 'right') {
        geo = new T.CapsuleGeometry(Math.min(1.1, bd * 0.18), Math.max(0.1, h - 2.2), 6, 16);
        pos = [p.edge === 'left' ? bodyX0 - out + 0.9 : -bodyX0 + out - 0.9, yTop - h / 2, 0];
      } else {
        geo = new T.CapsuleGeometry(Math.min(1.1, bd * 0.18), Math.max(0.1, w - 2.2), 6, 16);
        geo.rotateZ(Math.PI / 2);
        pos = [xL + w / 2, p.edge === 'top' ? bodyY1 + out - 0.9 : -bodyY1 - out + 0.9, 0];
      }
      geo.scale(1, 1, 1.7);
      this.track(geo);
      const btn = new T.Mesh(geo, M.frame);
      btn.castShadow = true;
      btn.position.set(...pos);
      const owner = panels.find((pn) => pos[0] >= pn.x0 - 3 && pos[0] <= pn.x1 + 3 && pos[1] >= pn.y0 - 3 && pos[1] <= pn.y1 + 3) || panels[panels.length - 1];
      owner.group.add(btn);
    }
    // Volets mobiles des pliables et pivots.
    const kind = this.foldKind;
    const hingeCyl = (x, y, len, vertical) => {
      const cyl = new T.Mesh(this.track(new T.CylinderGeometry(bd * 0.48, bd * 0.48, len, 32)), M.frame);
      if (!vertical) cyl.rotation.z = Math.PI / 2;
      cyl.position.set(x, y, 0);
      return cyl;
    };
    if (kind && panels.length > 1) {
      if (hCuts.length) {
        // Clapet : le volet du haut se rabat devant celui du bas.
        const top = panels.find((p) => p.yi === 1);
        const yh = hCuts[0];
        this.wrapPivot(top, 0, yh, bd / 2, 'x', 1);
        this.mm.add(panels[0].group);
        this.mm.add(hingeCyl(0, yh, bw * 0.92, false));
        if (Lc) this.coverFace(top, Lc, M, { kind: 'flip', yh, panelW: bw, panelH: bh / 2 + yh * 0 + (bodyY1 - yh), bd });
      } else if (kind === 'z' && vCuts.length === 2) {
        this.mm.add(panels[1].group);
        this.wrapPivot(panels[0], vCuts[0], 0, bd / 2, 'y', 1);
        this.wrapPivot(panels[2], vCuts[1], 0, -bd / 2, 'y', 1);
      } else if (kind === 'tri' && vCuts.length === 2) {
        this.mm.add(panels[1].group);
        this.wrapPivot(panels[2], vCuts[1], 0, bd / 2, 'y', -1);
        this.wrapPivot(panels[0], vCuts[0], 0, bd, 'y', 1);
        if (Lc) this.coverFace(panels[0], Lc, M, { kind: 'book', xh: vCuts[0], panelW: vCuts[0] - bodyX0, bd });
      } else {
        // Livre : le volet de gauche (écran externe au dos) se rabat devant celui de droite.
        const right = panels[panels.length - 1];
        this.mm.add(right.group);
        for (let i = panels.length - 2; i >= 0; i--) this.wrapPivot(panels[i], vCuts[i], 0, bd / 2, 'y', 1);
        if (Lc && this.dev.fold.kind !== 'dual') this.coverFace(panels[0], Lc, M, { kind: 'book', xh: vCuts[0], panelW: vCuts[0] - bodyX0, bd });
      }
    } else {
      for (const p of panels) this.mm.add(p.group);
    }
    // Module photo au dos.
    const camSpec = (fs && fs.cover && fs.cover.p && fs.cover.p.cam) || P.cam || (Lp.form === 'tablet' ? { t: 'single' } : { t: 'lenses-v', n: 2 });
    if (kind !== 'flip' && kind !== 'z') {
      const camPanel = kind === 'book' || kind === 'tri' || kind === 'dual' ? panels[panels.length - 1] : panels[0];
      const panelRect = { x0: camPanel.x0, x1: camPanel.x1, y0: camPanel.y0, y1: camPanel.y1 };
      if (kind === 'dual') { /* Surface Duo : un seul capteur */ }
      const cam = cameraModule(camSpec, panelRect, bd, M);
      cam.traverse((o) => { if (o.isMesh) { o.castShadow = true; this.track(o.geometry); } });
      camPanel.group.add(cam);
    } else if (kind === 'z') {
      const cam = cameraModule(camSpec, { x0: panels[0].x0, x1: panels[0].x1, y0: panels[0].y0, y1: panels[0].y1 }, bd, M);
      cam.traverse((o) => { if (o.isMesh) this.track(o.geometry); });
      panels[0].group.add(cam);
    }
    if (this.land) this.mm.rotation.z = Math.PI / 2;
    this.panels = panels;
  }

  // Place un panneau dans un pivot (charnière) ; sign : sens de rotation.
  wrapPivot(panel, px, py, pz, axis, sign) {
    const pivot = new T.Group();
    pivot.position.set(px, py, pz);
    panel.group.position.set(-px, -py, -pz);
    pivot.add(panel.group);
    this.mm.add(pivot);
    this.hinges.push({ pivot, axis, sign });
  }

  /* Écran externe au dos du volet qui se rabat : façade 2D de l'état fermé, page ou fond d'écran,
   * objectifs en relief (clapets). */
  coverFace(panel, Lc, M, spec) {
    const ph = Lc.phys;
    const bwc = ph.bw;
    const bhc = ph.bh;
    const pw = panel.x1 - panel.x0;
    const phh = panel.y1 - panel.y0;
    // (X, Y) : repère du corps fermé, origine en haut à gauche, Y vers le bas → (x, y) du volet ouvert.
    let toLocal;
    if (spec.kind === 'book') {
      const sx = pw / bwc;
      const sy = phh / bhc;
      toLocal = (X, Y) => [spec.xh - X * sx, panel.y1 - Y * sy];
    } else {
      const sx = pw / bwc;
      const sy = phh / bhc;
      toLocal = (X, Y) => [panel.x0 + X * sx, spec.yh + Y * sy];
    }
    const z = -spec.bd / 2 - EPS * 2;
    // Façade fermée (vitre et bordures) : forme du corps fermé.
    const ftex = this.track(canvasTexture(frontTexture(Lc), this.renderer));
    const fmat = this.track(frontMaterial(ftex));
    const inset = 0.7;
    const faceShape = rrShape(inset, -bhc + inset, bwc - inset * 2, bhc - inset * 2, ph.br.map((r) => Math.max(0, r - inset)));
    const fgeo = this.track(planeGeo(faceShape, { z, back: true, uv: (X, Yu) => [X / bwc, (Yu + bhc) / bhc], map: (X, Yu) => toLocal(X, -Yu) }));
    panel.group.add(new T.Mesh(fgeo, fmat));
    panel.backMesh.visible = false;
    // Écran externe.
    const cover = this.screenLayer(Lc, this.item.cover, 'cover');
    const scr = { x0: ph.sx, y1: -ph.sy };
    const sShape = rrShape(ph.sx, -ph.sy - ph.sh, ph.sw, ph.sh, ph.sr);
    const uv = (X, Yu) => {
      const xc = (X - scr.x0) * Lc.k;
      const yc = (scr.y1 - Yu) * Lc.k;
      return [xc / Lc.W, 1 - yc / Lc.H];
    };
    panel.group.add(new T.Mesh(this.track(planeGeo(sShape, {
      z: z - EPS, back: true, uv, map: (X, Yu) => toLocal(X, -Yu),
    })), cover.mat));
    panel.group.add(new T.Mesh(this.track(planeGeo(sShape, {
      z: z - EPS * 2, back: true, uv, map: (X, Yu) => toLocal(X, -Yu),
    })), cover.ovMat));
    // Objectifs en relief sur l'écran externe des clapets.
    const lenses = [];
    for (const gl of Lc.glass) if (gl.kind === 'lens') lenses.push({ X: (gl.cx - Lc.body.x) / Lc.k, Y: (gl.cy - Lc.body.y) / Lc.k, d: gl.d / Lc.k });
    for (const o of Lc.overlays) if (o.kind === 'lens') lenses.push({ X: ph.sx + o.cx / Lc.k, Y: ph.sy + o.cy / Lc.k, d: o.d / Lc.k });
    for (const l of lenses) {
      const [x, y] = toLocal(l.X, l.Y);
      const h = 1.3;
      const ring = new T.Mesh(this.track(new T.CylinderGeometry(l.d / 2 * 1.08, l.d / 2 * 1.08, h, 48)), M.lensRing);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, y, z - h / 2);
      ring.castShadow = true;
      panel.group.add(ring);
      const glass = new T.Mesh(this.track(new T.CylinderGeometry(l.d * 0.4, l.d * 0.4, h + 0.1, 48)), M.lensGlass);
      glass.rotation.x = Math.PI / 2;
      glass.position.set(x, y, z - h / 2 - 0.05);
      panel.group.add(glass);
    }
  }

  buildLaptop(Lp, M) {
    const ph = Lp.phys;
    const { bw, bh } = ph;
    const lidT = Math.min(ph.bd || 6, 7);
    const base = ph.P.base || { w: bw, d: bh * 1.03, h: 15 };
    const k = Lp.k;
    // Base : bloc arrondi, clavier sur le dessus.
    const baseGeo = this.track(new T.RoundedBoxGeometry(base.w, base.h, base.d, 4, Math.min(base.h * 0.45, 6)));
    const baseMesh = new T.Mesh(baseGeo, M.back);
    baseMesh.position.set(0, -base.h / 2, 0);
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    this.mm.add(baseMesh);
    const kb = this.track(canvasTexture(keyboardTexture(base.w, base.d, this.item.color || defaultColor(this.dev)), this.renderer));
    const kbMat = this.track(new T.MeshPhysicalMaterial({ map: kb, metalness: 0.55, roughness: 0.42 }));
    const top = new T.Mesh(this.track(new T.PlaneGeometry(base.w * 0.97, base.d * 0.97)), kbMat);
    top.rotation.x = -Math.PI / 2;
    top.position.set(0, EPS, 0);
    top.receiveShadow = true;
    this.mm.add(top);
    // Écran (couvercle) : pivote autour de l'arête arrière de la base.
    const lid = new T.Group();
    const slab = slabGeo(-bw / 2, 0, bw, bh, ph.br, lidT, { bevel: 0.8, z0: -lidT });
    this.track(slab.geo);
    const lidMesh = new T.Mesh(slab.geo, M.back);
    lidMesh.castShadow = true;
    lid.add(lidMesh);
    const bs = slab.inset;
    const face = rrShape(-bw / 2 + bs, bs, bw - bs * 2, bh - bs * 2, ph.br.map((r) => Math.max(0, r - bs)));
    const frontTex = this.track(canvasTexture(frontTexture(Lp), this.renderer));
    lid.add(new T.Mesh(this.track(planeGeo(face, { z: EPS, uv: (x, y) => [(x + bw / 2) / bw, y / bh] })), this.track(frontMaterial(frontTex))));
    const main = this.screenLayer(Lp, this.item.main, 'main');
    const scr = {
      x0: -bw / 2 + ph.sx, x1: -bw / 2 + ph.sx + ph.sw, y1: bh - ph.sy, y0: bh - ph.sy - ph.sh,
    };
    const uv = DeviceModel.viewUV(Lp, Lp, false, scr);
    const sShape = rrShape(scr.x0, scr.y0, ph.sw, ph.sh, ph.sr);
    lid.add(new T.Mesh(this.track(planeGeo(sShape, { z: EPS * 2, uv })), main.mat));
    lid.add(new T.Mesh(this.track(planeGeo(sShape, { z: EPS * 3, uv })), main.ovMat));
    const pivot = new T.Group();
    pivot.position.set(0, 0, -base.d / 2 + 2.5);
    pivot.add(lid);
    this.mm.add(pivot);
    this.lidPivot = pivot;
    void k;
  }

  buildDisplay(Lp, M) {
    const ph = Lp.phys;
    const { bw, bh } = ph;
    const bd = Math.max(5, Math.min(ph.bd || 20, 60));
    const k = Lp.k;
    const panel = new T.Group();
    const slab = slabGeo(-bw / 2, -bh / 2, bw, bh, ph.br, bd, { bevel: Math.min(2, bd * 0.2) });
    this.track(slab.geo);
    const body = new T.Mesh(slab.geo, M.frame);
    body.castShadow = true;
    panel.add(body);
    const bs = slab.inset;
    const face = rrShape(-bw / 2 + bs, -bh / 2 + bs, bw - bs * 2, bh - bs * 2, ph.br.map((r) => Math.max(0, r - bs)));
    const frontTex = this.track(canvasTexture(frontTexture(Lp), this.renderer));
    panel.add(new T.Mesh(this.track(planeGeo(face, { z: bd / 2 + EPS, uv: (x, y) => [(x + bw / 2) / bw, (y + bh / 2) / bh] })), this.track(frontMaterial(frontTex))));
    const back = new T.Mesh(this.track(planeGeo(face, { z: -bd / 2 - EPS, back: true })), M.back);
    panel.add(back);
    const main = this.screenLayer(Lp, this.item.main, 'main');
    const scr = {
      x0: -bw / 2 + ph.sx, x1: -bw / 2 + ph.sx + ph.sw, y1: bh / 2 - ph.sy, y0: bh / 2 - ph.sy - ph.sh,
    };
    const uv = DeviceModel.viewUV(Lp, Lp, false, scr);
    const sShape = rrShape(scr.x0, scr.y0, ph.sw, ph.sh, ph.sr);
    panel.add(new T.Mesh(this.track(planeGeo(sShape, { z: bd / 2 + EPS * 2, uv })), main.mat));
    panel.add(new T.Mesh(this.track(planeGeo(sShape, { z: bd / 2 + EPS * 3, uv })), main.ovMat));
    // Bosse arrière (électronique) pour les écrans épais.
    if (Lp.form !== 'aio') {
      const hump = new T.Mesh(this.track(new T.RoundedBoxGeometry(bw * 0.62, bh * 0.55, bd * 0.9, 3, Math.min(10, bd * 0.4))), M.back);
      hump.position.set(0, -bh * 0.08, -bd * 0.5);
      hump.castShadow = true;
      panel.add(hump);
    }
    this.mm.add(panel);
    // Pied, socle, colonne.
    const stand = ph.P.stand;
    const metal = M.frame;
    const by = (y) => bh / 2 - (y - Lp.body.y) / k;
    for (const e of Lp.extra) {
      const w = e.w / k;
      const h = e.h / k;
      const cx = -bw / 2 + (e.x - Lp.body.x) / k + w / 2;
      const yTop = by(e.y);
      let geo;
      let pos;
      if (e.kind === 'neck') {
        const top = Lp.form === 'tv' ? yTop + 2 : 0;
        const hh = top - (yTop - h);
        geo = new T.RoundedBoxGeometry(w, hh, 24, 3, 6);
        pos = [cx, top - hh / 2, -bd / 2 - 14];
      } else if (e.kind === 'foot') {
        const d = stand && stand.foot ? stand.foot[1] : 180;
        geo = new T.RoundedBoxGeometry(w, Math.max(6, h * 0.6), d, 4, Math.min(6, h * 0.3));
        pos = [cx, yTop - Math.max(6, h * 0.6) / 2, -bd / 2 - d * 0.3];
      } else if (e.kind === 'blade') {
        geo = new T.RoundedBoxGeometry(w, h + bh * 0.25, 5, 3, 2);
        pos = [cx, yTop - h / 2 + bh * 0.12, -bd / 2 - 10];
      } else if (e.kind === 'plate') {
        geo = new T.RoundedBoxGeometry(w, Math.max(6, h), w * 0.48, 4, 3);
        pos = [cx, yTop - Math.max(6, h) / 2, -bd * 0.2];
      } else if (e.kind === 'leg') {
        geo = new T.RoundedBoxGeometry(Math.max(10, w * 0.18), h + 6, 230, 3, 4);
        pos = [cx, yTop - h / 2 + 2, 10];
      } else continue;
      this.track(geo);
      const m = new T.Mesh(geo, e.kind === 'leg' || e.kind === 'plate' || e.kind === 'foot' ? metal : M.back);
      m.position.set(...pos);
      if (e.kind === 'blade') m.rotation.x = -0.12;
      m.castShadow = true;
      m.receiveShadow = true;
      this.mm.add(m);
    }
  }

  // ------------------------------------------------------------------ animation des charnières
  setFold(a) {
    const v = Math.max(0, Math.min(180, Number(a) || 0));
    this.item.fold = v;
    const r = T.MathUtils.degToRad(v);
    for (const h of this.hinges) {
      h.pivot.rotation.set(0, 0, 0);
      if (h.axis === 'y') h.pivot.rotation.y = r * h.sign;
      else h.pivot.rotation.x = r * h.sign;
    }
  }

  setLid(a) {
    if (!this.lidPivot) return;
    const v = Math.max(0, Math.min(150, Number(a) || 0));
    this.item.lid = v;
    this.lidPivot.rotation.x = T.MathUtils.degToRad(90 - v);
  }

  updateBounds() {
    this.root.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(this.mm);
    this.bounds = box;
    return box;
  }

  // Remplace l'image d'un écran (sans reconstruire le modèle).
  setPage(kind, src) {
    const s = this.screens.find((x) => x.kind === kind);
    if (!s) return false;
    const next = this.track(canvasTexture(src && src.canvas ? src.canvas : wallpaperTexture(s.Lv), this.renderer));
    next.wrapS = T.ClampToEdgeWrapping;
    next.wrapT = T.ClampToEdgeWrapping;
    s.tex = next;
    s.page = src && src.canvas ? src : null;
    s.mat.emissiveMap = next;
    s.mat.needsUpdate = true;
    const c = overlayTexture(s.Lv, { bg: s.page ? s.page.sbBg : 'rgba(0,0,0,0)', fg: s.page ? s.page.sbFg : '#fff' });
    s.ov.image = c;
    s.ov.needsUpdate = true;
    this.applyScroll(s);
    return true;
  }

  dispose() {
    for (const d of this.disposables) { try { d.dispose(); } catch { /* déjà libéré */ } }
    this.disposables = [];
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}
