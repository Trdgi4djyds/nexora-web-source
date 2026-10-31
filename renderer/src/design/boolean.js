/* NEX-DESIGN › opérations booléennes (union, soustraction, intersection, exclusion) et vectorisation des formes.
 * Les calques sont convertis en tracés par paper.js (géométrie exacte, courbes conservées), puis renvoyés en un
 * seul tracé Fabric qui garde le remplissage et le contour du calque du dessous. */
import paper from 'paper/dist/paper-core.js';
import { Path } from 'fabric';

let scope = null;
function ps() {
  if (scope) return scope;
  scope = new paper.PaperScope();
  scope.setup(new scope.Size(1, 1));
  return scope;
}

// Calque Fabric → tracé paper.js en coordonnées de la page.
function toPaper(obj) {
  const p = ps();
  // Forme seule, dans son propre repère (centré), puis transformation Fabric appliquée à la main.
  const inner = obj.toSVG().replace(/^\s*<g[^>]*transform="[^"]*"[^>]*>/, '<g>');
  const item = p.project.importSVG(`<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`, { expandShapes: true, insert: false, applyMatrix: true });
  const paths = item.getItems({ recursive: true, match: (it) => (it instanceof p.Path || it instanceof p.CompoundPath) && !(it.parent instanceof p.CompoundPath) });
  if (!paths.length) return null;
  const [a, b, c, d, e, f] = obj.calcTransformMatrix();
  const M = new p.Matrix(a, b, c, d, e, f);
  const flat = (it) => {
    let m = new p.Matrix();
    for (let q = it.parent; q; q = q.parent) m = q.matrix.appended(m);
    const k = it.clone({ insert: false });
    k.transform(m);
    k.transform(M);
    return k;
  };
  let res = flat(paths[0]);
  for (const q of paths.slice(1)) res = res.unite(flat(q), { insert: false });
  return res;
}

export const BOOL_OPS = {
  union: ['Union', 'unite'], subtract: ['Soustraire', 'subtract'], intersect: ['Intersection', 'intersect'], exclude: ['Exclure', 'exclude'],
};

export const canBoolean = (o) => Boolean(o) && !['textbox', 'itext', 'i-text', 'text', 'layer3d', 'image'].includes(o.type);

/* Applique l'opération aux calques (ordre de la pile : le premier est dessous). Renvoie le nouveau tracé. */
export function booleanOp(objs, op) {
  const list = objs.filter(canBoolean);
  if (list.length < 2) return null;
  const method = BOOL_OPS[op][1];
  let acc = toPaper(list[0]);
  for (const o of list.slice(1)) {
    const b = toPaper(o);
    if (!acc || !b) continue;
    acc = acc[method](b, { insert: false });
  }
  if (!acc || !acc.pathData) return null;
  const base = list[0];
  return new Path(acc.pathData, {
    fill: base.fill, stroke: base.stroke, strokeWidth: base.strokeWidth, opacity: base.opacity, shadow: base.shadow, fillRule: 'evenodd', strokeUniform: true,
  });
}

/* Convertit une forme (rectangle, ellipse, polygone, groupe de formes) en un tracé modifiable. */
export function toPath(obj) {
  if (!canBoolean(obj)) return null;
  const p = toPaper(obj);
  if (!p || !p.pathData) return null;
  return new Path(p.pathData, {
    fill: obj.fill, stroke: obj.stroke, strokeWidth: obj.strokeWidth, opacity: obj.opacity, shadow: obj.shadow, fillRule: 'evenodd', strokeUniform: true,
  });
}
