/* Dessin 2D des appareils (affichage, photos, vidéos) à partir de la géométrie physique. */
import { skinImages } from './skins.js';
import { rotateForLandscape } from './geometry.js';

// ------------------------------------------------------------------ couleurs
export function parseColor(c) {
  if (!c) return [255, 255, 255, 1];
  const s = String(c).trim();
  let m = s.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1];
  }
  m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0] || 0, p[1] || 0, p[2] || 0, p[3] == null ? 1 : p[3]];
  }
  return [255, 255, 255, 1];
}
export function luminance(c) {
  const [r, g, b] = parseColor(c).map((v, i) => (i < 3 ? v / 255 : v));
  const f = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function shade(c, amt) {
  const [r, g, b] = parseColor(c);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  return `rgb(${Math.round((t - r) * p + r)},${Math.round((t - g) * p + g)},${Math.round((t - b) * p + b)})`;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  const rad = Array.isArray(r) ? r.map((v) => Math.max(0, Math.min(v, w / 2, h / 2))) : Math.max(0, Math.min(r || 0, w / 2, h / 2));
  ctx.roundRect(x, y, w, h, rad);
}

function metalGradient(ctx, x, y, w, h, color, dir = 'diag') {
  const g = dir === 'h' ? ctx.createLinearGradient(x, 0, x + w, 0) : dir === 'v' ? ctx.createLinearGradient(0, y, 0, y + h) : ctx.createLinearGradient(x, y, x + w, y + h);
  const light = luminance(color) > 0.5;
  g.addColorStop(0, shade(color, light ? 0.25 : 0.38));
  g.addColorStop(0.3, color);
  g.addColorStop(0.62, shade(color, light ? -0.16 : -0.12));
  g.addColorStop(1, shade(color, light ? 0.12 : 0.24));
  return g;
}

function cylinder(ctx, x, y, w, h, color, horizontal) {
  const g = horizontal ? ctx.createLinearGradient(0, y, 0, y + h) : ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, shade(color, -0.34));
  g.addColorStop(0.35, shade(color, 0.3));
  g.addColorStop(0.55, shade(color, 0.05));
  g.addColorStop(1, shade(color, -0.4));
  return g;
}

// ------------------------------------------------------------------ rendu fidèle (iPhone 18 Pro, Galaxy S26 Ultra)
// Rectangle aux coins continus (courbure progressive, comme les appareils Apple et Samsung récents).
function smoothRect(ctx, x, y, w, h, radii, k = 1) {
  const r = (Array.isArray(radii) ? radii : [radii, radii, radii, radii]).map((v) => Math.max(0, Math.min(v * k, w / 2, h / 2)));
  const c = 0.58; // poignées : un peu plus tendues qu'un quart de cercle
  ctx.beginPath();
  ctx.moveTo(x + r[0], y);
  ctx.lineTo(x + w - r[1], y);
  ctx.bezierCurveTo(x + w - r[1] * (1 - c), y, x + w, y + r[1] * (1 - c), x + w, y + r[1]);
  ctx.lineTo(x + w, y + h - r[2]);
  ctx.bezierCurveTo(x + w, y + h - r[2] * (1 - c), x + w - r[2] * (1 - c), y + h, x + w - r[2], y + h);
  ctx.lineTo(x + r[3], y + h);
  ctx.bezierCurveTo(x + r[3] * (1 - c), y + h, x, y + h - r[3] * (1 - c), x, y + h - r[3]);
  ctx.lineTo(x, y + r[0]);
  ctx.bezierCurveTo(x, y + r[0] * (1 - c), x + r[0] * (1 - c), y, x + r[0], y);
  ctx.closePath();
}

// Cadre métallique vu de face : bande éclairée en haut à gauche, plus sombre en bas à droite.
function frameFill(ctx, b, color, maker) {
  const light = luminance(color) > 0.55;
  const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w * 0.7, b.y + b.h);
  if (maker === 'apple') {
    // Aluminium anodisé satiné : reflets doux.
    g.addColorStop(0, shade(color, light ? 0.28 : 0.45));
    g.addColorStop(0.18, shade(color, light ? 0.06 : 0.16));
    g.addColorStop(0.5, color);
    g.addColorStop(0.82, shade(color, light ? -0.16 : -0.18));
    g.addColorStop(1, shade(color, light ? 0.04 : 0.1));
  } else {
    // Titane brossé : reflet plus franc et plus froid.
    g.addColorStop(0, shade(color, light ? 0.32 : 0.55));
    g.addColorStop(0.12, shade(color, light ? -0.05 : 0.08));
    g.addColorStop(0.45, shade(color, light ? 0.1 : 0.28));
    g.addColorStop(0.7, shade(color, light ? -0.18 : -0.12));
    g.addColorStop(1, shade(color, light ? 0.12 : 0.3));
  }
  return g;
}

function drawHifi(ctx, L, { px, shadow, screenFill }) {
  const b = L.body;
  const color = L.color;
  const maker = L.hifi;
  const k = L.k;
  const light = luminance(color) > 0.55;
  // Boutons (sous le cadre) : métal assorti, Camera Control en saphir affleurant.
  for (const p of L.parts) {
    if (p.kind !== 'btn') continue;
    const vert = p.edge === 'left' || p.edge === 'right';
    rr(ctx, p.x, p.y, p.w, p.h, Math.min(p.w, p.h) / 2.2);
    if (p.flush && maker === 'apple') {
      const g = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
      g.addColorStop(0, '#1c1e22'); g.addColorStop(0.5, '#3a3e46'); g.addColorStop(1, '#15161a');
      ctx.fillStyle = g;
    } else {
      const g = vert ? ctx.createLinearGradient(p.x, 0, p.x + p.w, 0) : ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
      const out = p.edge === 'left' || p.edge === 'top';
      g.addColorStop(out ? 0 : 1, shade(color, light ? -0.3 : -0.25));
      g.addColorStop(0.45, shade(color, light ? 0.18 : 0.4));
      g.addColorStop(out ? 1 : 0, shade(color, light ? -0.05 : 0.05));
      ctx.fillStyle = g;
    }
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
  // Ombre de contact et ombre portée.
  if (shadow) {
    ctx.save();
    ctx.shadowColor = 'rgba(15,18,28,0.20)';
    ctx.shadowBlur = b.h * 0.06 * px;
    ctx.shadowOffsetY = b.h * 0.028 * px;
    smoothRect(ctx, b.x, b.y, b.w, b.h, b.r, 1.06);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowColor = 'rgba(15,18,28,0.18)';
    ctx.shadowBlur = b.h * 0.012 * px;
    ctx.shadowOffsetY = b.h * 0.004 * px;
    ctx.fill();
    ctx.restore();
  }
  // Cadre.
  smoothRect(ctx, b.x, b.y, b.w, b.h, b.r, 1.06);
  ctx.fillStyle = frameFill(ctx, b, color, maker);
  ctx.fill();
  // Arête extérieure fine et sombre, puis chanfrein brillant juste à l'intérieur.
  ctx.lineWidth = Math.max(0.6, 0.12 * k);
  ctx.strokeStyle = 'rgba(0,0,0,0.38)';
  ctx.stroke();
  const ch = Math.max(0.8, 0.22 * k);
  smoothRect(ctx, b.x + ch, b.y + ch, b.w - ch * 2, b.h - ch * 2, b.r.map((r) => Math.max(0, r - ch)));
  const hl = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
  hl.addColorStop(0, `rgba(255,255,255,${light ? 0.75 : 0.5})`);
  hl.addColorStop(0.35, 'rgba(255,255,255,0.12)');
  hl.addColorStop(0.65, 'rgba(255,255,255,0.05)');
  hl.addColorStop(1, `rgba(255,255,255,${light ? 0.45 : 0.28})`);
  ctx.strokeStyle = hl;
  ctx.lineWidth = Math.max(0.7, 0.16 * k);
  ctx.stroke();
  // Joint entre le cadre et la vitre.
  const rim = b.rim;
  const innerR = b.r.map((r) => Math.max(0, r - rim));
  smoothRect(ctx, b.x + rim - 0.6, b.y + rim - 0.6, b.w - rim * 2 + 1.2, b.h - rim * 2 + 1.2, innerR.map((r) => r + 0.6));
  ctx.fillStyle = maker === 'apple' ? shade(color, light ? -0.55 : -0.35) : '#0b0b0d';
  ctx.fill();
  // Vitre avant (bordure noire très fine).
  smoothRect(ctx, b.x + rim, b.y + rim, b.w - rim * 2, b.h - rim * 2, innerR);
  ctx.fillStyle = L.bezelColor;
  ctx.fill();
  // Arrondi de la vitre (2,5D) : liseré clair au bord.
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = Math.max(0.5, 0.1 * k);
  ctx.stroke();
  // Reflet du verre sur la bordure seulement.
  ctx.save();
  smoothRect(ctx, b.x + rim, b.y + rim, b.w - rim * 2, b.h - rim * 2, innerR);
  ctx.clip();
  const sh = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h * 0.55);
  sh.addColorStop(0, 'rgba(255,255,255,0.10)');
  sh.addColorStop(0.3, 'rgba(255,255,255,0.03)');
  sh.addColorStop(0.31, 'rgba(255,255,255,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.restore();
  // Écouteur : fente au ras du cadre, en haut.
  const ew = (maker === 'apple' ? 12 : 10) * k;
  const eh = Math.max(1, 0.38 * k);
  rr(ctx, b.x + b.w / 2 - ew / 2, b.y + rim + 0.25 * k, ew, eh, eh / 2);
  ctx.fillStyle = 'rgba(55,58,64,0.9)';
  ctx.fill();
  // Écran éteint.
  const s = L.screenP;
  if (screenFill) {
    rr(ctx, s.x, s.y, s.w, s.h, L.srP);
    ctx.fillStyle = screenFill;
    ctx.fill();
  }
}

// ------------------------------------------------------------------ appareil
/*
 * Dessine l'appareil dans la boîte TW × TH (orientation courante). px : pixels réels par pixel CSS.
 */
export function drawDevice(ctx, L, { px = 1, shadow = true, screenFill = '#000' } = {}) {
  ctx.save();
  if (L.land) rotateForLandscape(ctx, L.PW);
  const b = L.body;
  const color = L.color;

  if (L.skin) {
    drawSkin(ctx, L, { px, shadow, screenFill });
    ctx.restore();
    return;
  }

  if (!L.framesOn) {
    if (shadow) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.22)';
      ctx.shadowBlur = 40 * px;
      ctx.shadowOffsetY = 18 * px;
      rr(ctx, b.x, b.y, b.w, b.h, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  if (L.hifi) {
    drawHifi(ctx, L, { px, shadow, screenFill });
    ctx.restore();
    return;
  }

  // Socles et pieds (derrière le corps).
  for (const e of L.extra) drawExtra(ctx, e, L, px, shadow);

  // Boutons, charnières (derrière le cerclage).
  for (const p of L.parts) {
    if (p.kind === 'btn') {
      rr(ctx, p.x, p.y, p.w, p.h, Math.min(p.w, p.h) / 2.4);
      ctx.fillStyle = cylinder(ctx, p.x, p.y, p.w, p.h, color, p.edge === 'top' || p.edge === 'bottom');
      ctx.fill();
    } else if (p.kind === 'spine') {
      const horiz = p.edge === 'top';
      rr(ctx, p.x, p.y, p.w, p.h, horiz ? [p.h * 0.9, p.h * 0.9, 0, 0] : [p.w * 0.9, 0, 0, p.w * 0.9]);
      ctx.fillStyle = cylinder(ctx, p.x, p.y, p.w, p.h, shade(color, -0.08), horiz);
      ctx.fill();
    } else if (p.kind === 'hingecap') {
      rr(ctx, p.x, p.y, p.w, p.h, Math.min(p.w, p.h) / 2);
      ctx.fillStyle = shade(color, -0.3);
      ctx.fill();
    } else if (p.kind === 'grip') {
      // Manette : bord extérieur arrondi, couleur propre (Joy-Con) ou celle de l'appareil.
      const c = p.color || shade(color, -0.04);
      ctx.save();
      if (shadow) { ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 30 * px; ctx.shadowOffsetY = 14 * px; }
      rr(ctx, p.x, p.y, p.w, p.h, p.edge === 'left' ? [p.r, 0, 0, p.r] : [0, p.r, p.r, 0]);
      const g = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
      g.addColorStop(p.edge === 'left' ? 0 : 1, shade(c, -0.18));
      g.addColorStop(0.5, shade(c, 0.06));
      g.addColorStop(p.edge === 'left' ? 1 : 0, shade(c, -0.05));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    } else if (p.kind === 'crown') {
      rr(ctx, p.x, p.y, p.w, p.h, Math.min(p.w, p.h) * 0.3);
      ctx.fillStyle = cylinder(ctx, p.x, p.y, p.w, p.h, color, false);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 0.6;
      for (let y = p.y + 1.5; y < p.y + p.h - 1; y += 1.6) { ctx.beginPath(); ctx.moveTo(p.x + p.w * 0.45, y); ctx.lineTo(p.x + p.w, y); ctx.stroke(); }
    }
  }

  // Cerclage avec ombre portée.
  ctx.save();
  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = Math.min(60, b.h * 0.07) * px;
    ctx.shadowOffsetY = Math.min(28, b.h * 0.035) * px;
  }
  rr(ctx, b.x, b.y, b.w, b.h, b.r);
  if (L.form === 'panel') {
    // Fenêtre flottante d'un casque (verre dépoli).
    ctx.fillStyle = luminance(color) > 0.5 ? 'rgba(236,240,246,0.72)' : 'rgba(58,61,68,0.72)';
  } else {
    ctx.fillStyle = metalGradient(ctx, b.x, b.y, b.w, b.h, ['tv', 'monitor', 'laptop', 'car', 'kiosk'].includes(L.form) ? shade(color, -0.05) : color);
  }
  ctx.fill();
  ctx.restore();
  // Reflet fin sur la tranche.
  rr(ctx, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, b.r);
  ctx.strokeStyle = luminance(color) > 0.5 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Vitre (ou cadre) intérieure.
  const rim = b.rim;
  const innerR = b.r.map((r) => Math.max(0, r - rim));
  rr(ctx, b.x + rim, b.y + rim, b.w - rim * 2, b.h - rim * 2, innerR);
  ctx.fillStyle = L.bezelColor;
  ctx.fill();
  if (rim > 0) {
    rr(ctx, b.x + rim + 0.5, b.y + rim + 0.5, b.w - rim * 2 - 1, b.h - rim * 2 - 1, innerR);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Coutures du cadre au niveau de la charnière.
  for (const p of L.parts) {
    if (p.kind !== 'seam') continue;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = Math.max(0.8, L.k * 0.35);
    ctx.beginPath();
    if (p.dir === 'v') {
      ctx.moveTo(p.x, b.y); ctx.lineTo(p.x, b.y + rim + 1.2);
      ctx.moveTo(p.x, b.y + b.h - rim - 1.2); ctx.lineTo(p.x, b.y + b.h);
    } else {
      ctx.moveTo(b.x, p.y); ctx.lineTo(b.x + rim + 1.2, p.y);
      ctx.moveTo(b.x + b.w - rim - 1.2, p.y); ctx.lineTo(b.x + b.w, p.y);
    }
    ctx.stroke();
  }

  // Détails de la vitre.
  for (const g of L.glass) drawGlass(ctx, g, L);

  // Écran éteint (sous la page).
  const s = L.screenP;
  if (screenFill) {
    rr(ctx, s.x, s.y, s.w, s.h, L.srP);
    ctx.fillStyle = screenFill;
    ctx.fill();
  }
  ctx.restore();
}

// Cadre officiel : image du fabricant, écran éteint dessous.
function drawSkin(ctx, L, { px, shadow, screenFill }) {
  const { v, kx, ky } = L.skin;
  const im = skinImages(v);
  const s = L.screenP;
  const b = L.body;
  if (screenFill) {
    ctx.fillStyle = screenFill;
    rr(ctx, s.x, s.y, s.w, s.h, L.srP);
    ctx.fill();
  }
  if (!im.back) {
    // Image en cours de chargement : silhouette sombre en attendant.
    rr(ctx, b.x + 2, b.y + 2, b.w - 4, b.h - 4, Math.min(b.w, b.h) * 0.08);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();
    return;
  }
  ctx.save();
  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = Math.min(60, b.h * 0.06) * px;
    ctx.shadowOffsetY = Math.min(26, b.h * 0.03) * px;
  }
  ctx.imageSmoothingQuality = 'high';
  if (v.rot) {
    // Image du cadre tournée d'un quart de tour vers la gauche.
    ctx.translate(b.x + v.bg.y * kx, b.y + (v.srcCanvas[0] - v.bg.x) * ky);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(im.back, 0, 0, im.back.naturalWidth * ky, im.back.naturalHeight * kx);
  } else {
    ctx.drawImage(im.back, b.x + v.bg.x * kx, b.y + v.bg.y * ky, im.back.naturalWidth * kx, im.back.naturalHeight * ky);
  }
  ctx.restore();
}

function drawGlass(ctx, g, L) {
  if (g.kind === 'cam') {
    const cg = ctx.createRadialGradient(g.cx - g.d * 0.12, g.cy - g.d * 0.12, 0, g.cx, g.cy, g.d / 2);
    cg.addColorStop(0, '#2b3650');
    cg.addColorStop(0.6, '#07080a');
    cg.addColorStop(1, '#1a1c20');
    ctx.beginPath();
    ctx.arc(g.cx, g.cy, g.d / 2, 0, Math.PI * 2);
    ctx.fillStyle = cg;
    ctx.fill();
  } else if (g.kind === 'speaker' || g.kind === 'earpiece') {
    rr(ctx, g.cx - g.w / 2, g.cy - g.h / 2, g.w, g.h, g.h / 2);
    ctx.fillStyle = g.kind === 'earpiece' ? 'rgba(40,42,46,0.9)' : '#17191d';
    ctx.fill();
  } else if (g.kind === 'home') {
    ctx.beginPath();
    ctx.arc(g.cx, g.cy, g.d / 2 - 1, 0, Math.PI * 2);
    ctx.strokeStyle = '#2c2e33';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (g.kind === 'chin') {
    rr(ctx, g.x, g.y, g.w, g.h, [0, 0, L.body.r[2], L.body.r[3]]);
    ctx.fillStyle = metalGradient(ctx, g.x, g.y, g.w, g.h, L.color, 'v');
    ctx.fill();
  } else if (g.kind === 'sensor') {
    rr(ctx, g.cx - g.w / 2, g.cy - g.h / 2, g.w, g.h, g.h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
  } else if (g.kind === 'led') {
    rr(ctx, g.cx - g.w / 2, g.cy - g.h / 2, g.w, g.h, g.h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(g.cx + g.w * 0.6, g.cy, g.h * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,60,40,0.55)';
    ctx.fill();
  } else if (g.kind === 'lens') {
    drawLens(ctx, g.cx, g.cy, g.d);
  } else if (g.kind === 'ctl-stick') {
    const cg = ctx.createRadialGradient(g.cx - g.d * 0.1, g.cy - g.d * 0.14, g.d * 0.05, g.cx, g.cy, g.d / 2);
    cg.addColorStop(0, '#4a4c52');
    cg.addColorStop(0.75, '#1d1e22');
    cg.addColorStop(1, '#0c0c0e');
    ctx.beginPath(); ctx.arc(g.cx, g.cy, g.d / 2, 0, Math.PI * 2); ctx.fillStyle = cg; ctx.fill();
    ctx.beginPath(); ctx.arc(g.cx, g.cy, g.d * 0.32, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = g.d * 0.05; ctx.stroke();
  } else if (g.kind === 'ctl-dpad' || g.kind === 'ctl-abxy') {
    const r = g.d * 0.16;
    const o = g.d * 0.33;
    const pts = [[0, -o], [o, 0], [0, o], [-o, 0]];
    for (const [dx, dy] of pts) {
      ctx.beginPath();
      if (g.kind === 'ctl-abxy') ctx.arc(g.cx + dx, g.cy + dy, r, 0, Math.PI * 2);
      else ctx.rect(g.cx + dx - r, g.cy + dy - r, r * 2, r * 2);
      ctx.fillStyle = '#18191c';
      ctx.fill();
    }
    if (g.kind === 'ctl-dpad') { ctx.fillStyle = '#18191c'; ctx.fillRect(g.cx - r, g.cy - r, r * 2, r * 2); }
  } else if (g.kind === 'ctl-pad') {
    rr(ctx, g.cx - g.w / 2, g.cy - g.h / 2, g.w, g.h, Math.min(g.w, g.h) * 0.18);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();
  } else if (g.kind === 'ctl-btn' || g.kind === 'ctl-dot') {
    ctx.beginPath(); ctx.arc(g.cx, g.cy, g.d / 2, 0, Math.PI * 2);
    ctx.fillStyle = g.kind === 'ctl-dot' ? 'rgba(255,255,255,0.18)' : '#1b1c1f';
    ctx.fill();
  } else if (g.kind === 'slot') {
    rr(ctx, g.cx - g.w / 2, g.cy - g.h / 2, g.w, g.h, g.h / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();
  } else if (g.kind === 'keypad') {
    const cw = g.w / g.cols;
    const ch = g.h / g.rows;
    for (let r = 0; r < g.rows; r += 1) {
      for (let c = 0; c < g.cols; c += 1) {
        rr(ctx, g.x + c * cw + cw * 0.1, g.y + r * ch + ch * 0.12, cw * 0.8, ch * 0.76, Math.min(cw, ch) * 0.18);
        ctx.fillStyle = r === g.rows - 1 && g.cols > 2 ? ['#c4362c', '#d6a72a', '#2f9a4c'][c] || '#2a2b2f' : '#2a2b2f';
        ctx.fill();
      }
    }
  } else if (g.kind === 'grill') {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    const step = Math.max(2.2, g.h / 4);
    for (let y = g.y + step / 2; y < g.y + g.h; y += step) {
      for (let x = g.x + step / 2; x < g.x + g.w; x += step) { ctx.beginPath(); ctx.arc(x, y, step * 0.22, 0, Math.PI * 2); ctx.fill(); }
    }
  }
}

function drawExtra(ctx, e, L, px, shadow) {
  const m = L.color;
  ctx.save();
  if (e.kind === 'base') {
    if (shadow) { ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 30 * px; ctx.shadowOffsetY = 14 * px; }
    const g = ctx.createLinearGradient(0, e.y, 0, e.y + e.h);
    g.addColorStop(0, shade(m, 0.4));
    g.addColorStop(0.35, shade(m, 0.05));
    g.addColorStop(1, shade(m, -0.4));
    rr(ctx, e.x, e.y, e.w, e.h, [2, 2, e.h * 0.9, e.h * 0.9]);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    rr(ctx, e.x + e.w * 0.42, e.y, e.w * 0.16, e.h * 0.38, [0, 0, e.h * 0.4, e.h * 0.4]);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fill();
  } else if (e.kind === 'neck' || e.kind === 'blade') {
    const g = ctx.createLinearGradient(e.x, 0, e.x + e.w, 0);
    g.addColorStop(0, shade(m, -0.22));
    g.addColorStop(0.5, shade(m, 0.22));
    g.addColorStop(1, shade(m, -0.22));
    ctx.beginPath();
    const inset = e.kind === 'blade' ? e.w * 0.04 : e.w * 0.12;
    ctx.moveTo(e.x + inset, e.y);
    ctx.lineTo(e.x + e.w - inset, e.y);
    ctx.lineTo(e.x + e.w, e.y + e.h);
    ctx.lineTo(e.x, e.y + e.h);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
  } else if (e.kind === 'foot' || e.kind === 'plate') {
    if (shadow) { ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 24 * px; ctx.shadowOffsetY = 10 * px; }
    const g = ctx.createLinearGradient(0, e.y, 0, e.y + e.h);
    g.addColorStop(0, shade(m, 0.32));
    g.addColorStop(1, shade(m, -0.32));
    rr(ctx, e.x, e.y, e.w, e.h, e.kind === 'plate' ? [3, 3, e.h / 2, e.h / 2] : [e.h * 0.6, e.h * 0.6, e.h * 0.3, e.h * 0.3]);
    ctx.fillStyle = g;
    ctx.fill();
  } else if (e.kind === 'strap') {
    // Bracelet de montre (repli vers l'arrière vers les bords de l'image).
    const c = e.color || shade(m, -0.12);
    const g = ctx.createLinearGradient(0, e.y, 0, e.y + e.h);
    if (e.edge === 'top') { g.addColorStop(0, shade(c, -0.35)); g.addColorStop(1, shade(c, 0.04)); } else { g.addColorStop(0, shade(c, 0.04)); g.addColorStop(1, shade(c, -0.35)); }
    rr(ctx, e.x, e.y, e.w, e.h, e.edge === 'top' ? [e.w * 0.12, e.w * 0.12, 0, 0] : [0, 0, e.w * 0.12, e.w * 0.12]);
    ctx.fillStyle = g;
    ctx.fill();
  } else if (e.kind === 'grabber') {
    rr(ctx, e.x, e.y, e.w, e.h, e.h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(e.x + e.w + e.h * 2.2, e.y + e.h / 2, e.h * 0.8, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.kind === 'fabric') {
    if (shadow) { ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 30 * px; ctx.shadowOffsetY = 14 * px; }
    rr(ctx, e.x, e.y, e.w, e.h, [e.w * 0.08, e.w * 0.08, e.w * 0.14, e.w * 0.14]);
    const g = ctx.createLinearGradient(0, e.y, 0, e.y + e.h);
    g.addColorStop(0, shade(e.color, 0.06));
    g.addColorStop(1, shade(e.color, -0.22));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let y = e.y + 3; y < e.y + e.h; y += 3) ctx.fillRect(e.x, y, e.w, 1);
  } else if (e.kind === 'dash') {
    if (shadow) { ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 40 * px; ctx.shadowOffsetY = 18 * px; }
    ctx.beginPath();
    ctx.moveTo(e.x + e.w * 0.08, e.y);
    ctx.quadraticCurveTo(e.x + e.w / 2, e.y - e.h * 0.12, e.x + e.w * 0.92, e.y);
    ctx.quadraticCurveTo(e.x + e.w, e.y + e.h * 0.5, e.x + e.w * 0.96, e.y + e.h);
    ctx.lineTo(e.x + e.w * 0.04, e.y + e.h);
    ctx.quadraticCurveTo(e.x, e.y + e.h * 0.5, e.x + e.w * 0.08, e.y);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, e.y, 0, e.y + e.h);
    g.addColorStop(0, shade(e.color, 0.12));
    g.addColorStop(1, shade(e.color, -0.3));
    ctx.fillStyle = g;
    ctx.fill();
  } else if (e.kind === 'box') {
    if (shadow) { ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 30 * px; ctx.shadowOffsetY = 12 * px; }
    rr(ctx, e.x, e.y, e.w, e.h, e.style === 'mini' ? Math.min(e.w, e.h) * 0.18 : 4);
    ctx.fillStyle = metalGradient(ctx, e.x, e.y, e.w, e.h, shade(m, -0.08), 'v');
    ctx.fill();
    ctx.shadowColor = 'transparent';
    if (e.style !== 'mini') {
      // Façade : bouton et aérations.
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      for (let y = e.y + e.h * 0.18; y < e.y + e.h * 0.9; y += Math.max(3, e.h * 0.03)) ctx.fillRect(e.x + e.w * 0.18, y, e.w * 0.64, 1);
      ctx.beginPath(); ctx.arc(e.x + e.w / 2, e.y + e.h * 0.08, Math.max(2, e.w * 0.05), 0, Math.PI * 2); ctx.fillStyle = 'rgba(120,200,255,0.7)'; ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(e.x + e.w * 0.85, e.y + e.h * 0.6, Math.max(1.5, e.h * 0.08), 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
    }
  } else if (e.kind === 'leg') {
    if (shadow) { ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 16 * px; ctx.shadowOffsetY = 6 * px; }
    ctx.beginPath();
    ctx.moveTo(e.x + e.w * 0.45, e.y);
    ctx.lineTo(e.x + e.w * 0.55, e.y);
    ctx.lineTo(e.x + e.w, e.y + e.h);
    ctx.lineTo(e.x, e.y + e.h);
    ctx.closePath();
    const g = ctx.createLinearGradient(e.x, 0, e.x + e.w, 0);
    g.addColorStop(0, shade(m, -0.1));
    g.addColorStop(0.5, shade(m, 0.25));
    g.addColorStop(1, shade(m, -0.1));
    ctx.fillStyle = g;
    ctx.fill();
  }
  ctx.restore();
}

export function drawLens(ctx, cx, cy, size) {
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  const ring = ctx.createLinearGradient(cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2);
  ring.addColorStop(0, '#5a5d63');
  ring.addColorStop(0.5, '#25272b');
  ring.addColorStop(1, '#4a4d52');
  ctx.fillStyle = ring;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = '#050607';
  ctx.fill();
  const lg = ctx.createRadialGradient(cx - size * 0.1, cy - size * 0.1, 0, cx, cy, size * 0.24);
  lg.addColorStop(0, '#46577c');
  lg.addColorStop(0.55, '#141a26');
  lg.addColorStop(1, '#07090d');
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.24, 0, Math.PI * 2);
  ctx.fillStyle = lg;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - size * 0.09, cy - size * 0.09, size * 0.05, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();
}

// ------------------------------------------------------------------ éléments sur la page
/* Repère de l'écran (W × H, orientation courante). */
export function drawOverlays(ctx, L) {
  ctx.save();
  if (L.land) rotateForLandscape(ctx, L.W0);
  const W0 = L.W0;
  const H0 = L.H0;
  if (L.skin) {
    // Coins arrondis, caméra et capteurs : calque du fabricant posé sur la page.
    const im = skinImages(L.skin.v);
    if (im.mask) {
      ctx.imageSmoothingQuality = 'high';
      if (L.skin.v.rot) {
        ctx.save();
        ctx.translate(0, H0);
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(im.mask, 0, 0, H0, W0);
        ctx.restore();
      } else ctx.drawImage(im.mask, 0, 0, W0, H0);
    }
  }
  for (const o of L.overlays) {
    if (o.kind === 'island') {
      rr(ctx, o.x, o.y, o.w, o.h, Math.min(o.w, o.h) / 2);
      ctx.fillStyle = '#000';
      ctx.fill();
      if (L.hifi) {
        // Caméra avant visible dans l'île (reflet bleuté).
        const r = o.h * 0.24;
        const cx = o.x + o.w - o.h / 2;
        const cy = o.y + o.h / 2;
        const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
        g.addColorStop(0, '#2a3553'); g.addColorStop(0.55, '#0b0d14'); g.addColorStop(1, '#050507');
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
        ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.18, 0, Math.PI * 2); ctx.fillStyle = 'rgba(120,150,220,0.35)'; ctx.fill();
      }
    } else if (o.kind === 'notch') {
      rr(ctx, o.x, o.y, o.w, o.h, o.radii || 0);
      ctx.fillStyle = L.bezelColor;
      ctx.fill();
    } else if (o.kind === 'drop') {
      ctx.beginPath();
      ctx.moveTo(o.x - 6, 0);
      ctx.bezierCurveTo(o.x, 0, o.x, o.h, o.x + o.w / 2, o.h);
      ctx.bezierCurveTo(o.x + o.w, o.h, o.x + o.w, 0, o.x + o.w + 6, 0);
      ctx.closePath();
      ctx.fillStyle = L.bezelColor;
      ctx.fill();
    } else if (o.kind === 'mac-notch') {
      rr(ctx, o.x, o.y - 8, o.w, o.h + 8, [0, 0, 10, 10]);
      ctx.fillStyle = '#000';
      ctx.fill();
    } else if (o.kind === 'punch') {
      ctx.beginPath();
      ctx.arc(o.cx, o.cy, o.d / 2 + 1.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(o.cx, o.cy, o.d / 2, 0, Math.PI * 2);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(o.cx - o.d * 0.12, o.cy - o.d * 0.12, o.d * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(70,90,140,0.55)';
      ctx.fill();
    } else if (o.kind === 'udc') {
      ctx.beginPath();
      ctx.arc(o.cx, o.cy, o.d / 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.07)';
      ctx.fill();
    } else if (o.kind === 'lens') {
      ctx.beginPath();
      ctx.arc(o.cx, o.cy, o.d / 2 + o.d * 0.09, 0, Math.PI * 2);
      ctx.fillStyle = '#000';
      ctx.fill();
      drawLens(ctx, o.cx, o.cy, o.d);
    } else if (o.kind === 'flash') {
      ctx.beginPath();
      ctx.arc(o.cx, o.cy, o.d / 2 + 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#000';
      ctx.fill();
      const fg = ctx.createRadialGradient(o.cx, o.cy, 0, o.cx, o.cy, o.d / 2);
      fg.addColorStop(0, '#fff8de');
      fg.addColorStop(1, '#c9b98c');
      ctx.beginPath();
      ctx.arc(o.cx, o.cy, o.d / 2, 0, Math.PI * 2);
      ctx.fillStyle = fg;
      ctx.fill();
    } else if (o.kind === 'crease') {
      const a = o.soft ? 0.45 : 1;
      if (o.dir === 'h') {
        const y = H0 * o.at;
        const g = ctx.createLinearGradient(0, y - 8, 0, y + 8);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.38, `rgba(0,0,0,${0.06 * a})`);
        g.addColorStop(0.5, `rgba(255,255,255,${0.14 * a})`);
        g.addColorStop(0.62, `rgba(0,0,0,${0.06 * a})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, y - 8, W0, 16);
      } else {
        const x = W0 * o.at;
        const g = ctx.createLinearGradient(x - 8, 0, x + 8, 0);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.38, `rgba(0,0,0,${0.06 * a})`);
        g.addColorStop(0.5, `rgba(255,255,255,${0.14 * a})`);
        g.addColorStop(0.62, `rgba(0,0,0,${0.06 * a})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 8, 0, 16, H0);
      }
    } else if (o.kind === 'bezelbar') {
      ctx.fillStyle = L.bezelColor;
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(o.x + o.w / 2 - 0.5, o.y, 1, o.h);
    } else if (o.kind === 'hinge') {
      const g = ctx.createLinearGradient(o.x, 0, o.x + o.w, 0);
      if (o.framesOn) {
        g.addColorStop(0, '#c9c9c4');
        g.addColorStop(0.3, '#8d8d88');
        g.addColorStop(0.5, '#b9b9b3');
        g.addColorStop(0.7, '#8d8d88');
        g.addColorStop(1, '#c9c9c4');
      } else {
        g.addColorStop(0, '#2c2c2e');
        g.addColorStop(1, '#2c2c2e');
      }
      ctx.fillStyle = g;
      ctx.fillRect(o.x, o.y, o.w, o.h);
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------------ barre d'état
export function drawStatusBar(ctx, L, bg, fg) {
  if (!L.sb) return;
  const { W } = L;
  const h = L.sb.h;
  const kind = L.sb.kind;
  ctx.save();
  ctx.fillStyle = bg || '#ffffff';
  ctx.fillRect(0, 0, W, h);
  ctx.fillStyle = fg;
  ctx.strokeStyle = fg;
  const font = (size, weight) => `${weight} ${size}px Inter, "Segoe UI", system-ui, sans-serif`;
  ctx.textBaseline = 'middle';

  if (kind === 'macos') {
    ctx.font = font(13, 600);
    ctx.textAlign = 'left';
    ctx.fillText('Navigateur', 18, h / 2 + 1);
    ctx.font = font(13, 400);
    let x = 110;
    for (const t of ['Fichier', 'Édition', 'Présentation', 'Historique', 'Fenêtre']) { ctx.fillText(t, x, h / 2 + 1); x += ctx.measureText(t).width + 18; }
    ctx.textAlign = 'right';
    ctx.font = font(13, 500);
    ctx.fillText('mer. 9:41', W - 18, h / 2 + 1);
    ctx.restore();
    return;
  }

  const ios = kind.startsWith('ios');
  let cy;
  let timeX;
  let iconsRight;
  let iconScale = 1;
  if (kind === 'ios') { cy = h / 2 + 2; timeX = W * 0.17; iconsRight = W - W * 0.09; }
  else if (kind === 'ios-wide') { cy = h / 2 + 1; timeX = 46; iconsRight = W - 24; }
  else if (kind === 'ios-classic') { cy = h / 2; timeX = W / 2; iconsRight = W - 8; iconScale = 0.72; }
  else if (kind === 'tablet') { cy = h / 2 + 1; timeX = 30; iconsRight = W - 20; iconScale = 0.8; }
  else { cy = h / 2 + 1; timeX = 22; iconsRight = W - 18; iconScale = 0.82; }

  // Caméra en haut à droite (iPhone Duo fermé…) : les icônes passent à sa gauche.
  if (!L.land) {
    for (const o of L.overlays) {
      if ((o.kind === 'punch' || o.kind === 'island') && (o.cy ?? o.y) < h * 1.4) {
        const left = o.kind === 'punch' ? o.cx - o.d / 2 : o.x;
        if (left > W * 0.6 && left - 10 < iconsRight) iconsRight = left - 10;
      }
    }
  }
  if (ios && kind !== 'ios-classic') {
    ctx.font = font(kind === 'ios' ? 17 : 15, 600);
    ctx.textAlign = 'center';
    ctx.fillText('9:41', timeX, cy);
  } else if (kind === 'ios-classic') {
    ctx.font = font(12, 600);
    ctx.textAlign = 'center';
    ctx.fillText('9:41', timeX, cy);
  } else if (kind === 'tablet') {
    ctx.font = font(13, 600);
    ctx.textAlign = 'left';
    ctx.fillText('9:41', timeX - 10, cy);
  } else {
    ctx.font = font(13.5, 500);
    ctx.textAlign = 'left';
    ctx.fillText('12:30', timeX - 6, cy);
  }

  ctx.translate(iconsRight, cy);
  ctx.scale(iconScale, iconScale);
  ctx.globalAlpha = 0.4;
  rr(ctx, -27, -6.5, 24.5, 13, 4);
  ctx.lineWidth = 1;
  ctx.stroke();
  rr(ctx, -2, -2.2, 2, 4.4, [0, 1.5, 1.5, 0]);
  ctx.fill();
  ctx.globalAlpha = 1;
  rr(ctx, -25, -4.5, 17, 9, 2.5);
  ctx.fill();
  ctx.lineWidth = 2.1;
  ctx.lineCap = 'round';
  const wx = -40;
  const wy = 5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(wx, wy, 3.2 + i * 3.9, -Math.PI * 0.75, -Math.PI * 0.25);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(wx, wy - 0.5, 1.4, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    const bh = 4 + i * 2.6;
    rr(ctx, -72 + i * 5, 5.5 - bh, 3.2, bh, 1);
    ctx.fill();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ composition complète
/* Appareil + page + barre d'état + éléments + touchers, dans la boîte TW × TH. */
export function drawComposite(ctx, L, {
  image, px = 1, sbBg, sbFg, touch, shadow = true,
} = {}) {
  drawDevice(ctx, L, { px, shadow, screenFill: '#ffffff' });
  const s = L.screen;
  ctx.save();
  ctx.translate(s.x, s.y);
  rr(ctx, 0, 0, L.W, L.H, L.sr);
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, L.W, L.H);
  if (image) ctx.drawImage(image, L.vp.x, L.vp.y, L.vp.w, L.vp.h);
  if (L.sb) drawStatusBar(ctx, L, sbBg, sbFg);
  drawOverlays(ctx, L);
  if (touch && touch.visible) {
    ctx.beginPath();
    ctx.arc(touch.x, L.vp.y + touch.y, 22, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${0.55 * touch.alpha})`;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(0,0,0,${0.25 * touch.alpha})`;
    ctx.stroke();
  }
  ctx.restore();
}
