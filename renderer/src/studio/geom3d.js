/* Géométrie d'éditeur 3D :
 * - extrusion d'une forme 2D (Forme 2D du Studio) en volume, avec biseau et retrait intérieur ;
 * - modificateurs non destructifs appliqués à un objet : courbure, torsion, effilement, subdivision.
 * Les modificateurs travaillent sur une copie des maillages : l'objet d'origine reste intact et les
 * réglages peuvent être changés ou remis à zéro à tout moment. */
import * as T from './three.js';
import { tracePath, VECTOR_DEFAULTS } from './vector.js';

// ------------------------------------------------------------------ forme 2D → contours three.js
/* Adaptateur « canevas 2D » qui enregistre le tracé de la forme sous forme de contours three.js
 * (axe Y vers le haut, centré). Mêmes tracés que le dessin à plat : la forme extrudée est identique. */
class ShapeRecorder {
  constructor(W, H) { this.W = W; this.H = H; this.shapes = []; this.cur = null; }
  p(x, y) { return [x - this.W / 2, this.H / 2 - y]; }
  beginPath() { this.cur = null; }
  start() { this.cur = new T.Shape(); this.shapes.push(this.cur); return this.cur; }
  moveTo(x, y) { const s = this.start(); s.moveTo(...this.p(x, y)); }
  lineTo(x, y) { if (!this.cur) this.moveTo(x, y); else this.cur.lineTo(...this.p(x, y)); }
  bezierCurveTo(a, b, c, d, x, y) { this.cur.bezierCurveTo(...this.p(a, b), ...this.p(c, d), ...this.p(x, y)); }
  quadraticCurveTo(a, b, x, y) { this.cur.quadraticCurveTo(...this.p(a, b), ...this.p(x, y)); }
  closePath() { if (this.cur) this.cur.closePath(); }
  rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
  roundRect(x, y, w, h, r) {
    const rr = Math.max(0, Math.min(Array.isArray(r) ? r[0] : r || 0, w / 2, h / 2));
    if (!rr) { this.rect(x, y, w, h); return; }
    this.moveTo(x + rr, y);
    this.lineTo(x + w - rr, y); this.quadraticCurveTo(x + w, y, x + w, y + rr);
    this.lineTo(x + w, y + h - rr); this.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    this.lineTo(x + rr, y + h); this.quadraticCurveTo(x, y + h, x, y + h - rr);
    this.lineTo(x, y + rr); this.quadraticCurveTo(x, y, x + rr, y);
    this.closePath();
  }
  ellipse(cx, cy, rx, ry) {
    const s = this.start();
    const [x, y] = this.p(cx, cy);
    s.absellipse(x, y, rx, ry, 0, Math.PI * 2, false, 0);
  }
  save() {} restore() {} scale() {} translate() {}
}

/* Contours d'une Forme 2D (dimensions w × h en cm), prêts à extruder ; null pour une ligne. */
export function vectorShapes(item) {
  const it = { ...VECTOR_DEFAULTS, ...item };
  if (it.shape === 'line') return null;
  const W = Math.max(0.5, it.w);
  const H = Math.max(0.5, it.h);
  if (it.shape === 'path' && it.d) {
    const vb = it.vb || [0, 0, 100, 100];
    const data = new T.SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}"><path d="${String(it.d).replace(/"/g, '')}"/></svg>`);
    const out = [];
    const sx = W / vb[2]; const sy = H / vb[3];
    for (const p of data.paths) {
      for (const sh of T.SVGLoader.createShapes(p)) {
        const pts = sh.extractPoints(24);
        const conv = (v) => new T.Vector2((v.x - vb[0]) * sx - W / 2, H / 2 - (v.y - vb[1]) * sy);
        const s = new T.Shape(pts.shape.map(conv));
        for (const hole of pts.holes) s.holes.push(new T.Path(hole.map(conv)));
        out.push(s);
      }
    }
    return out.length ? out : null;
  }
  const rec = new ShapeRecorder(W, H);
  tracePath(rec, it, W, H);
  return rec.shapes.length ? rec.shapes : null;
}

/* Volume de la forme : profondeur (extrusion), biseau (arrondi des arêtes) et retrait intérieur. */
export function extrudeVector(item) {
  const shapes = vectorShapes(item);
  if (!shapes) return null;
  const depth = Math.max(0.05, Number(item.extrude) || 2);
  const bevel = Math.max(0, Math.min(Number(item.bevel3d) || 0, depth, Math.min(item.w || 20, item.h || 12) / 3));
  const inset = Math.max(0, Number(item.inset) || 0);
  const geo = new T.ExtrudeGeometry(shapes, {
    depth,
    curveSegments: 32,
    bevelEnabled: bevel > 0 || inset > 0,
    bevelThickness: bevel > 0 ? bevel : 0.001,
    bevelSize: bevel > 0 ? bevel * 0.85 : 0.001,
    bevelOffset: -inset - (bevel > 0 ? bevel * 0.85 : 0),
    bevelSegments: bevel > 0 ? 6 : 1,
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

// ------------------------------------------------------------------ modificateurs
export const MODIFIERS = {
  bend: ['Courbure', -180, 180, 1, '°'],
  twist: ['Torsion', -360, 360, 1, '°'],
  taper: ['Effilement', -0.9, 0.9, 0.01, '%'],
  bulge: ['Gonflement', -0.6, 0.6, 0.01, '%'],
  subdiv: ['Subdivision', 0, 3, 1, ''],
};
export const hasModifiers = (m) => Boolean(m && Object.keys(MODIFIERS).some((k) => Number(m[k])));

// Découpe chaque triangle en 4 (maillage plus fin pour des déformations régulières).
function subdivideOnce(geo) {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const names = Object.keys(src.attributes);
  const n = src.attributes.position.count;
  const out = {};
  for (const name of names) out[name] = new Float32Array((n / 3) * 12 * src.attributes[name].itemSize);
  for (let t = 0; t < n; t += 3) {
    for (const name of names) {
      const a = src.attributes[name];
      const s = a.itemSize;
      const v = (i) => Array.from({ length: s }, (_, c) => a.array[(t + i) * s + c]);
      const mid = (p, q) => p.map((x, c) => (x + q[c]) / 2);
      const A = v(0); const B = v(1); const C = v(2);
      const AB = mid(A, B); const BC = mid(B, C); const CA = mid(C, A);
      const tris = [[A, AB, CA], [AB, B, BC], [CA, BC, C], [AB, BC, CA]];
      let o = (t / 3) * 12 * s;
      for (const tri of tris) for (const p of tri) { out[name].set(p, o); o += s; }
    }
  }
  const g = new T.BufferGeometry();
  for (const name of names) g.setAttribute(name, new T.BufferAttribute(out[name], src.attributes[name].itemSize));
  return g;
}

/* Applique les modificateurs à tous les maillages de root (repère de l'objet, axe vertical = Y). */
export function applyModifiers(root, mods, track = (x) => x) {
  if (!hasModifiers(mods)) return;
  root.updateMatrixWorld(true);
  const inv = new T.Matrix4().copy(root.matrixWorld).invert();
  const meshes = [];
  root.traverse((m) => { if (m.isMesh && !m.userData.editorOnly && m.geometry && m.geometry.attributes.position) meshes.push(m); });
  if (!meshes.length) return;
  // Boîte de l'objet dans son propre repère.
  const box = new T.Box3();
  const rels = new Map();
  for (const m of meshes) {
    const rel = new T.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    rels.set(m, rel);
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    box.union(m.geometry.boundingBox.clone().applyMatrix4(rel));
  }
  const min = box.min; const size = box.getSize(new T.Vector3());
  const H = Math.max(size.y, 1e-3);
  const cx = (box.min.x + box.max.x) / 2; const cz = (box.min.z + box.max.z) / 2;
  const bend = ((Number(mods.bend) || 0) * Math.PI) / 180;
  const twist = ((Number(mods.twist) || 0) * Math.PI) / 180;
  const taper = Number(mods.taper) || 0;
  const bulge = Number(mods.bulge) || 0;
  const deforms = Math.abs(bend) > 1e-4 || Math.abs(twist) > 1e-4 || Math.abs(taper) > 1e-4 || Math.abs(bulge) > 1e-4;
  const v = new T.Vector3();
  for (const m of meshes) {
    let geo = m.geometry.clone();
    // Maillage assez fin pour une déformation régulière (limité pour garder la vue fluide).
    let level = Math.round(Number(mods.subdiv) || 0);
    if (deforms) {
      const tris = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      while (level < 4 && tris * 4 ** (level + 1) < 60000) level += 1;
    }
    for (let i = 0; i < level; i++) {
      if ((geo.index ? geo.index.count : geo.attributes.position.count) / 3 > 150000) break;
      geo = subdivideOnce(geo);
    }
    if (level) geo = T.mergeVertices ? T.mergeVertices(geo, 1e-5) : geo;
    const rel = rels.get(m);
    const relInv = rel.clone().invert();
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(rel);
      const t = (v.y - min.y) / H;
      let dx = v.x - cx; let dz = v.z - cz;
      // Effilement (haut plus fin ou plus large) et gonflement (milieu plus large).
      const k = (1 - taper * t) * (1 + bulge * Math.sin(Math.PI * t));
      dx *= k; dz *= k;
      // Torsion autour de l'axe vertical.
      if (twist) { const a = twist * t; const c = Math.cos(a); const s = Math.sin(a); const nx = dx * c - dz * s; dz = dx * s + dz * c; dx = nx; }
      let x = cx + dx; let y = v.y; const z = cz + dz;
      // Courbure : l'objet s'enroule dans le plan X-Y autour d'un centre placé à droite.
      if (Math.abs(bend) > 1e-4) {
        const R = H / bend;
        const phi = t * bend;
        const r = R - dx;
        x = cx + R - r * Math.cos(phi);
        y = min.y + r * Math.sin(phi);
      }
      v.set(x, y, z).applyMatrix4(relInv);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    m.geometry = track(geo);
  }
}
