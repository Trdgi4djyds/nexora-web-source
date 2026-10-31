/* Formes vectorielles du Studio (calques 2D) : rectangle, rectangle arrondi, ellipse, étoile, polygone,
 * flèche, ligne, éclat, bulle, tracé SVG. Dessinées à haute définition sur un canevas (remplissage uni ou
 * dégradé, contour, ombre), puis posées dans la scène comme un panneau : nettes à toutes les tailles. */

export const VECTOR_SHAPES = {
  rect: ['Rectangle', 'frame'], round: ['Rectangle arrondi', 'frame'], ellipse: ['Ellipse', 'sphere'], triangle: ['Triangle', 'spot'],
  star: ['Étoile', 'star'], polygon: ['Polygone', 'shapes'], burst: ['Éclat (badge)', 'sparkle'], arrow: ['Flèche', 'forward'],
  line: ['Ligne', 'ruler'], bubble: ['Bulle', 'chat'], heart: ['Cœur', 'heart'], path: ['Tracé SVG', 'shapes'],
};

export const VECTOR_DEFAULTS = {
  shape: 'round', w: 20, h: 12, radius: 2.4, points: 5, inner: 0.45, sides: 6, fill: '#0a84ff', fill2: '', gradAngle: 90, stroke: '', strokeW: 0, shadow: 0, opacity: 1, d: '',
};

export function tracePath(g, it, W, H) {
  const s = it.shape || 'round';
  const cx = W / 2; const cy = H / 2;
  g.beginPath();
  if (s === 'rect') g.rect(0, 0, W, H);
  else if (s === 'round') g.roundRect(0, 0, W, H, Math.min(W, H) / 2 * Math.min(1, (it.radius ?? 2.4) / (Math.min(it.w || 20, it.h || 12) / 2)));
  else if (s === 'ellipse') g.ellipse(cx, cy, W / 2, H / 2, 0, 0, Math.PI * 2);
  else if (s === 'triangle') { g.moveTo(cx, 0); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); }
  else if (s === 'star' || s === 'burst') {
    const n = Math.max(3, Math.round(s === 'burst' ? (it.points || 16) : (it.points || 5)));
    const inner = s === 'burst' ? (it.inner ?? 0.82) : (it.inner ?? 0.45);
    for (let i = 0; i < n * 2; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / n;
      const r = i % 2 ? inner : 1;
      const x = cx + Math.cos(a) * (W / 2) * r; const y = cy + Math.sin(a) * (H / 2) * r;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
  } else if (s === 'polygon') {
    const n = Math.max(3, Math.round(it.sides || 6));
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const x = cx + Math.cos(a) * (W / 2); const y = cy + Math.sin(a) * (H / 2);
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
  } else if (s === 'arrow') {
    const t = H * 0.36; const head = Math.min(W * 0.45, H * 1.1);
    g.moveTo(0, cy - t / 2); g.lineTo(W - head, cy - t / 2); g.lineTo(W - head, 0); g.lineTo(W, cy); g.lineTo(W - head, H); g.lineTo(W - head, cy + t / 2); g.lineTo(0, cy + t / 2); g.closePath();
  } else if (s === 'line') { g.moveTo(0, cy); g.lineTo(W, cy); }
  else if (s === 'bubble') {
    const r = Math.min(W, H * 0.8) * 0.22; const bh = H * 0.78;
    g.roundRect(0, 0, W, bh, r);
    g.moveTo(W * 0.22, bh - 1); g.lineTo(W * 0.16, H); g.lineTo(W * 0.38, bh - 1); g.closePath();
  } else if (s === 'heart') {
    g.moveTo(cx, H * 0.95);
    g.bezierCurveTo(W * -0.1, H * 0.55, W * 0.12, H * -0.08, cx, H * 0.26);
    g.bezierCurveTo(W * 0.88, H * -0.08, W * 1.1, H * 0.55, cx, H * 0.95);
    g.closePath();
  } else if (s === 'path' && it.d) {
    // Tracé SVG ramené au cadre de la forme (viewBox mémorisée lors de l'import).
    const vb = it.vb || [0, 0, 100, 100];
    g.save();
    g.scale(W / vb[2], H / vb[3]);
    g.translate(-vb[0], -vb[1]);
    const p = new Path2D(it.d);
    g.restore();
    return { path: p, vb };
  } else g.rect(0, 0, W, H);
  return null;
}

/* Canevas de la forme : { canvas, w, h } (w, h en unités de la scène). */
export function vectorCanvas(item) {
  const it = { ...VECTOR_DEFAULTS, ...item };
  const w = Math.max(0.5, it.w);
  const h = Math.max(it.shape === 'line' ? 0.2 : 0.5, it.shape === 'line' ? Math.max(0.2, (it.strokeW || 0.6) * 1.2) : it.h);
  const k = Math.min(64, 2048 / Math.max(w, h));
  const sw = (it.shape === 'line' ? Math.max(0.2, it.strokeW || 0.6) : (it.strokeW || 0)) * k;
  const pad = Math.ceil(sw + (it.shadow || 0) * k * 1.5 + 2);
  const W = Math.round(w * k); const H = Math.round(h * k);
  const c = document.createElement('canvas');
  c.width = W + pad * 2; c.height = H + pad * 2;
  const g = c.getContext('2d');
  g.translate(pad, pad);
  let fill = it.fill || 'transparent';
  if (it.fill && it.fill2) {
    const a = ((it.gradAngle ?? 90) * Math.PI) / 180;
    const dx = Math.cos(a) * W / 2; const dy = Math.sin(a) * H / 2;
    const gr = g.createLinearGradient(W / 2 - dx, H / 2 - dy, W / 2 + dx, H / 2 + dy);
    gr.addColorStop(0, it.fill); gr.addColorStop(1, it.fill2);
    fill = gr;
  }
  if (it.shadow) { g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = it.shadow * k; g.shadowOffsetY = it.shadow * k * 0.35; }
  const sp = tracePath(g, it, W, H);
  if (sp) {
    g.save(); g.scale(W / sp.vb[2], H / sp.vb[3]); g.translate(-sp.vb[0], -sp.vb[1]);
    if (it.fill) { g.fillStyle = fill; g.fill(sp.path); }
    if (sw > 0 && it.stroke) { g.shadowColor = 'transparent'; g.strokeStyle = it.stroke; g.lineWidth = sw / (W / sp.vb[2]); g.stroke(sp.path); }
    g.restore();
  } else if (it.shape === 'line') {
    g.strokeStyle = it.stroke || it.fill || '#1d1d1f'; g.lineWidth = sw; g.lineCap = 'round'; g.stroke();
  } else {
    if (it.fill) { g.fillStyle = fill; g.fill(); }
    if (sw > 0 && it.stroke) { g.shadowColor = 'transparent'; g.strokeStyle = it.stroke; g.lineWidth = sw; g.lineJoin = 'round'; g.stroke(); }
  }
  // Taille réelle du panneau, marge comprise (la forme garde ses dimensions w × h).
  return { canvas: c, w: c.width / k, h: c.height / k };
}

/* Lecture d'un fichier SVG : premier tracé (ou tous réunis) et sa viewBox. */
export function parseSvg(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return null;
  let vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some((x) => !Number.isFinite(x))) vb = [0, 0, Number(svg.getAttribute('width')) || 100, Number(svg.getAttribute('height')) || 100];
  const paths = [...doc.querySelectorAll('path')].map((p) => p.getAttribute('d')).filter(Boolean);
  if (!paths.length) return null;
  const fillEl = doc.querySelector('path[fill]:not([fill="none"])');
  return { d: paths.join(' '), vb, fill: fillEl ? fillEl.getAttribute('fill') : null };
}
