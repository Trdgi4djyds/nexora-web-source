/* Formes 3D du Studio : primitives, formes décoratives, texte en relief et icônes en tube. */
import opentype from 'opentype.js';
import * as T from './three.js';
import { ICONS } from '../core/icons.js';

export const FONTS3D = {
  inter: ['Inter', 'fonts/3d/inter-latin-800-normal.woff'],
  interLight: ['Inter fin', 'fonts/3d/inter-latin-400-normal.woff'],
  grotesk: ['Space Grotesk', 'fonts/3d/space-grotesk-latin-700-normal.woff'],
  playfair: ['Playfair (empattements)', 'fonts/3d/playfair-display-latin-700-normal.woff'],
  fredoka: ['Fredoka (arrondie)', 'fonts/3d/fredoka-latin-600-normal.woff'],
};

const fonts = new Map();

export async function loadFont3d(key = 'inter') {
  const k = FONTS3D[key] ? key : 'inter';
  if (fonts.has(k)) return fonts.get(k);
  const p = (async () => {
    const res = await fetch(FONTS3D[k][1]);
    if (!res.ok) throw new Error(`police introuvable : ${FONTS3D[k][1]}`);
    return opentype.parse(await res.arrayBuffer());
  })();
  fonts.set(k, p);
  try { return await p; } catch (e) { fonts.delete(k); throw e; }
}

export function fontReady(key) {
  const p = fonts.get(FONTS3D[key] ? key : 'inter');
  return p && p.done ? p.font : null;
}

// Charge la police puis la mémorise pour un accès synchrone (construction des maillages).
export async function preloadFont3d(key) {
  const f = await loadFont3d(key);
  const p = fonts.get(FONTS3D[key] ? key : 'inter');
  p.done = true; p.font = f;
  return f;
}

function shapesFromSvgPath(d) {
  const data = new T.SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`);
  const out = [];
  for (const p of data.paths) out.push(...T.SVGLoader.createShapes(p));
  return out;
}

// Texte en relief : le contour de chaque lettre est extrudé et biseauté. Unité : cm.
export function textGeometry(font, text, {
  size = 6, depth = 1.6, bevel = 0.25, align = 'center', lineHeight = 1.15, letterSpacing = 0,
} = {}) {
  const lines = String(text || ' ').split('\n');
  const upm = font.unitsPerEm;
  const geos = [];
  let maxW = 0;
  const widths = lines.map((l) => font.getAdvanceWidth(l, size, { kerning: true, letterSpacing }));
  maxW = Math.max(...widths, 0.01);
  lines.forEach((line, li) => {
    if (!line.trim()) return;
    const x0 = align === 'left' ? 0 : align === 'right' ? maxW - widths[li] : (maxW - widths[li]) / 2;
    const path = font.getPath(line, x0, li * size * lineHeight, size, { kerning: true, letterSpacing });
    // On inverse l'axe vertical (polices : y vers le bas) pour écrire dans le repère 3D.
    let d = '';
    for (const c of path.commands) {
      if (c.type === 'M') d += `M${c.x} ${-c.y}`;
      else if (c.type === 'L') d += `L${c.x} ${-c.y}`;
      else if (c.type === 'Q') d += `Q${c.x1} ${-c.y1} ${c.x} ${-c.y}`;
      else if (c.type === 'C') d += `C${c.x1} ${-c.y1} ${c.x2} ${-c.y2} ${c.x} ${-c.y}`;
      else if (c.type === 'Z') d += 'Z';
    }
    if (!d) return;
    const shapes = shapesFromSvgPath(d);
    if (!shapes.length) return;
    const b = Math.min(bevel, depth / 2, size * 0.06);
    const g = new T.ExtrudeGeometry(shapes, {
      depth, curveSegments: 10, bevelEnabled: b > 0.001, bevelThickness: b, bevelSize: b * 0.8, bevelSegments: 4,
    });
    geos.push(g);
  });
  void upm;
  if (!geos.length) return new T.BoxGeometry(0.01, 0.01, 0.01);
  const g = geos.length === 1 ? geos[0] : T.mergeGeometries(geos.map((x) => x.toNonIndexed()), false);
  g.computeBoundingBox();
  const bb = g.boundingBox;
  // Posé au sol, centré en X et en profondeur.
  g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  g.computeVertexNormals();
  return g;
}

// Courbe brisée (segments droits) pour les tubes.
class Polyline extends T.Curve {
  constructor(pts) {
    super();
    this.pts = pts;
    this.lens = [0];
    for (let i = 1; i < pts.length; i++) this.lens.push(this.lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
    this.total = this.lens[this.lens.length - 1] || 1;
  }

  getPoint(t, out = new T.Vector3()) {
    const d = t * this.total;
    let i = 1;
    while (i < this.lens.length - 1 && this.lens[i] < d) i++;
    const a = this.pts[i - 1]; const b = this.pts[i] || a;
    const seg = (this.lens[i] - this.lens[i - 1]) || 1;
    return out.copy(a).lerp(b, T.MathUtils.clamp((d - this.lens[i - 1]) / seg, 0, 1));
  }
}

// Icône de l'interface en tubes arrondis (comme un néon). Unité : cm, hauteur ≈ size.
export function iconGeometry(name, { size = 10, thickness = 1 } = {}) {
  const body = ICONS[name];
  if (!body) return new T.SphereGeometry(size / 2, 32, 16);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000">${body}</svg>`;
  const data = new T.SVGLoader().parse(svg);
  const k = size / 24;
  const r = (thickness * 0.8 * k);
  const geos = [];
  for (const p of data.paths) {
    for (const sp of p.subPaths) {
      const pts2 = sp.getPoints(24);
      const pts = [];
      for (const v of pts2) {
        const q = new T.Vector3((v.x - 12) * k, (24 - v.y) * k, 0);
        if (!pts.length || pts[pts.length - 1].distanceTo(q) > 1e-4) pts.push(q);
      }
      if (pts.length < 2) {
        if (pts.length === 1) { const s = new T.SphereGeometry(r * 1.2, 16, 12); s.translate(pts[0].x, pts[0].y, 0); geos.push(s); }
        continue;
      }
      const closed = pts[0].distanceTo(pts[pts.length - 1]) < 1e-3;
      const curve = new Polyline(pts);
      const segs = Math.max(8, Math.min(400, Math.round(curve.total / (r * 0.6))));
      geos.push(new T.TubeGeometry(curve, segs, r, 14, false));
      // Bouts et angles arrondis.
      const joints = closed ? [] : [pts[0], pts[pts.length - 1]];
      for (let i = 1; i < pts.length - 1; i++) {
        const a = pts[i].clone().sub(pts[i - 1]).normalize();
        const b = pts[i + 1].clone().sub(pts[i]).normalize();
        if (a.dot(b) < 0.9) joints.push(pts[i]);
      }
      if (closed && pts.length > 2) {
        const a = pts[pts.length - 1].clone().sub(pts[pts.length - 2]).normalize();
        const b = pts[1].clone().sub(pts[0]).normalize();
        if (a.dot(b) < 0.9) joints.push(pts[0]);
      }
      for (const j of joints) { const s = new T.SphereGeometry(r, 14, 10); s.translate(j.x, j.y, j.z); geos.push(s); }
    }
  }
  if (!geos.length) return new T.SphereGeometry(size / 2, 32, 16);
  const g = T.mergeGeometries(geos.map((x) => { const n = x.index ? x.toNonIndexed() : x; n.deleteAttribute('uv'); return n; }), false);
  g.computeBoundingBox();
  g.translate(-(g.boundingBox.min.x + g.boundingBox.max.x) / 2, -g.boundingBox.min.y + r, 0);
  return g;
}

export const ICON3D_CHOICES = ['star', 'heart', 'bolt', 'cart', 'bell', 'chat', 'camera', 'music', 'play', 'gift', 'phone', 'globe', 'lock', 'cloud', 'sparkle', 'rocket', 'check', 'mail', 'user', 'home', 'search', 'gamepad', 'car', 'watch']
  .filter((n) => ICONS[n]);

function starShape(points = 5, outer = 5, inner = 2.2) {
  const s = new T.Shape();
  for (let i = 0; i <= points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? inner : outer;
    const x = Math.cos(a) * r; const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  return s;
}

function heartShape(k = 1) {
  const s = new T.Shape();
  s.moveTo(0, -4.6 * k);
  s.bezierCurveTo(-1.2 * k, -3.4 * k, -6 * k, -0.6 * k, -6 * k, 2.4 * k);
  s.bezierCurveTo(-6 * k, 5.2 * k, -2.6 * k, 6.6 * k, 0, 3.8 * k);
  s.bezierCurveTo(2.6 * k, 6.6 * k, 6 * k, 5.2 * k, 6 * k, 2.4 * k);
  s.bezierCurveTo(6 * k, -0.6 * k, 1.2 * k, -3.4 * k, 0, -4.6 * k);
  return s;
}

function arrowShape() {
  const s = new T.Shape();
  s.moveTo(-6, -1.4); s.lineTo(1.5, -1.4); s.lineTo(1.5, -3.6); s.lineTo(6.5, 0); s.lineTo(1.5, 3.6); s.lineTo(1.5, 1.4); s.lineTo(-6, 1.4); s.closePath();
  return s;
}

function bubbleShape() {
  const s = new T.Shape();
  const w = 12; const h = 7.5; const r = 2.4;
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(-1.5, -h / 2); s.lineTo(-3.4, -h / 2 - 2.6); s.lineTo(1, -h / 2);
  s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}

const extrude = (shape, depth = 2.4, bevel = 0.5) => new T.ExtrudeGeometry(shape, {
  depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 5, curveSegments: 32,
});

function blobGeometry(seed = 1, amount = 0.32) {
  const g = new T.IcosahedronGeometry(5, 24);
  const p = g.attributes.position;
  const v = new T.Vector3();
  const s = seed * 1.7;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = Math.sin(v.x * 2.1 + s) * Math.cos(v.y * 2.6 - s * 0.6) + Math.sin(v.z * 3.1 + s * 1.3) * 0.6 + Math.sin((v.x + v.y) * 4.2 + s) * 0.25;
    v.multiplyScalar(5 * (1 + n * amount * 0.5));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function cloudGeometry() {
  const parts = [[0, 0, 0, 4], [-4.4, -1, 0.4, 3], [4.2, -0.8, 0, 3.2], [1.6, 2.4, -0.4, 3.2], [-2, 1.8, 0.6, 2.6], [7.2, -1.8, 0, 2], [-7, -2, 0, 1.8]];
  return T.mergeGeometries(parts.map(([x, y, z, r]) => { const s = new T.SphereGeometry(r, 40, 28); s.translate(x, y, z); return s; }), false);
}

function spiralGeometry(turns = 3.5, radius = 4, height = 12, tube = 0.7) {
  const pts = [];
  const N = Math.round(turns * 64);
  for (let i = 0; i <= N; i++) {
    const t = i / N; const a = t * turns * Math.PI * 2;
    pts.push(new T.Vector3(Math.cos(a) * radius, t * height, Math.sin(a) * radius));
  }
  return new T.TubeGeometry(new T.CatmullRomCurve3(pts), N * 2, tube, 20, false);
}

// Géométrie et hauteur de pose (y du centre) des formes simples.
export function shapeGeometry(kind, it = {}) {
  switch (kind) {
    case 'sphere': return [new T.SphereGeometry(5, 96, 64), 5];
    case 'demisphere': return [new T.SphereGeometry(6, 96, 48, 0, Math.PI * 2, 0, Math.PI / 2), 0];
    case 'tore': { const g = new T.TorusGeometry(5, 1.8, 64, 160); return [g, 6.8]; }
    case 'noeud': return [new T.TorusKnotGeometry(4, 1.3, 320, 40, it.p || 2, it.q || 3), 6.5];
    case 'cone': return [new T.ConeGeometry(4.5, 10, 96), 5];
    case 'cylindre': return [new T.CylinderGeometry(4, 4, 10, 96), 5];
    case 'pyramide': return [new T.ConeGeometry(5.6, 8.5, 4), 4.25];
    case 'prisme': return [new T.CylinderGeometry(4.4, 4.4, 10, 3), 5];
    case 'gemme': { const g = new T.OctahedronGeometry(5, 0); g.scale(1, 1.35, 1); return [g, 6.75]; }
    case 'diamant': { const g = new T.DodecahedronGeometry(5, 0); return [g, 5]; }
    case 'plan': { const g = new T.PlaneGeometry(20, 20); g.rotateX(-Math.PI / 2); return [g, 0.02]; }
    case 'panneau': return [new T.RoundedBoxGeometry(24, 15, 0.8, 4, 0.4), 7.5];
    case 'blob': return [blobGeometry(it.seed || 1, it.amount ?? 0.32), 5.5];
    case 'nuage': return [cloudGeometry(), 4];
    case 'spirale': return [spiralGeometry(), 0.7];
    case 'etoile': { const g = extrude(starShape()); g.center(); return [g, 5]; }
    case 'coeur': { const g = extrude(heartShape()); g.center(); return [g, 5.4]; }
    case 'fleche': { const g = extrude(arrowShape(), 2, 0.4); g.center(); return [g, 4]; }
    case 'bulle': { const g = extrude(bubbleShape(), 1.6, 0.5); g.center(); return [g, 6.5]; }
    case 'pilule': { const g = new T.CapsuleGeometry(2.6, 6, 16, 64); g.rotateZ(Math.PI / 2); return [g, 2.6]; }
    case 'cube': return [new T.RoundedBoxGeometry(8, 8, 8, 5, 1.2), 4];
    default: return null;
  }
}

// Confettis et particules : maillage instancié, réparti au hasard (répétable) autour de l'origine.
export function confettiMesh(it, material) {
  const n = Math.round(it.count || 120);
  const spread = it.spread || 30;
  const shape = it.shape || 'mix';
  const geos = {
    carre: new T.BoxGeometry(0.9, 0.05, 0.6),
    rond: new T.SphereGeometry(0.42, 12, 8),
    etoile: (() => { const g = new T.ExtrudeGeometry(starShape(5, 0.6, 0.27), { depth: 0.12, bevelEnabled: false }); g.center(); return g; })(),
  };
  const group = new T.Group();
  const palette = (it.palette || ['#ff6b6b', '#ffd60a', '#34c759', '#64d2ff', '#5e5ce6', '#bf5af2']).map((c) => new T.Color(c));
  let s = (it.seed || 7) * 9301;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const kinds = shape === 'mix' ? ['carre', 'rond', 'etoile'] : [shape];
  for (const k of kinds) {
    const count = Math.round(n / kinds.length);
    const mesh = new T.InstancedMesh(geos[k], material, count);
    const m = new T.Matrix4(); const q = new T.Quaternion(); const e = new T.Euler(); const p = new T.Vector3(); const sc = new T.Vector3();
    for (let i = 0; i < count; i++) {
      p.set((rnd() - 0.5) * spread, rnd() * spread * 0.7, (rnd() - 0.5) * spread * 0.6);
      e.set(rnd() * 6.3, rnd() * 6.3, rnd() * 6.3);
      q.setFromEuler(e);
      const z = 0.7 + rnd() * 0.8;
      sc.set(z, z, z);
      m.compose(p, q, sc);
      mesh.setMatrixAt(i, m);
      if (it.colorful !== false) mesh.setColorAt(i, palette[Math.floor(rnd() * palette.length)]);
    }
    mesh.castShadow = true;
    group.add(mesh);
  }
  return { group, geos: Object.values(geos) };
}
