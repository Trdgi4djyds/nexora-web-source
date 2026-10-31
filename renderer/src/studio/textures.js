/* Textures du Studio : façade des appareils, barre d'état, fonds d'écran, clavier, textes, arrière-plans. */
import {
  drawDevice, drawOverlays, drawStatusBar, shade, luminance,
} from '../devices/frames2d.js';
import { paintLockScreen, wallpaperStyle } from '../devices/wallpapers.js';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w));
  c.height = Math.max(2, Math.round(h));
  return c;
}

// Façade de l'appareil (vitre, bordures, capteurs) dessinée par le moteur 2D, sur la surface du corps.
export function frontTexture(Lp, maxSide = 3072) {
  const b = Lp.body;
  const px = Math.min(6, maxSide / Math.max(b.w, b.h));
  const c = makeCanvas(b.w * px, b.h * px);
  const ctx = c.getContext('2d');
  ctx.setTransform(px, 0, 0, px, -b.x * px, -b.y * px);
  drawDevice(ctx, Lp, { px, shadow: false, screenFill: '#000' });
  return c;
}

// Barre d'état et éléments par-dessus la page (île, poinçon, pli), dans le sens d'affichage.
export function overlayTexture(Lv, { bg = '#ffffff', fg = '#000000', statusBar = true, maxSide = 3072 } = {}) {
  const px = Math.min(4, maxSide / Math.max(Lv.W, Lv.H));
  const c = makeCanvas(Lv.W * px, Lv.H * px);
  const ctx = c.getContext('2d');
  ctx.setTransform(px, 0, 0, px, 0, 0);
  if (statusBar && Lv.sb) drawStatusBar(ctx, Lv, bg, fg);
  drawOverlays(ctx, Lv);
  return c;
}

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Écran de verrouillage : utilisé quand aucune page n'est affichée sur un écran.
export function wallpaperTexture(Lv, { colors = ['#5e5ce6', '#0a84ff', '#64d2ff'], dark = false } = {}) {
  const px = Math.min(3, 2400 / Math.max(Lv.W, Lv.H));
  const W = Lv.W;
  const H = Lv.H;
  const c = makeCanvas(W * px, H * px);
  const ctx = c.getContext('2d');
  ctx.setTransform(px, 0, 0, px, 0, 0);
  // Téléphones iOS et Android : écran de verrouillage dessiné dans l'esprit du système, teinté par la couleur.
  if (Lv.dev && wallpaperStyle(Lv.dev) !== 'default' && Lv.form === 'phone') {
    paintLockScreen(ctx, W, H, { dev: Lv.dev, color: Lv.color });
    return c;
  }
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, dark ? shade(colors[0], -0.45) : colors[0]);
  g.addColorStop(0.55, dark ? shade(colors[1], -0.5) : colors[1]);
  g.addColorStop(1, dark ? shade(colors[2], -0.55) : colors[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Formes douces façon fond d'écran système.
  const blob = (x, y, r, col, a) => {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, col.replace(')', `,${a})`).replace('rgb(', 'rgba('));
    rg.addColorStop(1, col.replace(')', ',0)').replace('rgb(', 'rgba('));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  };
  blob(W * 0.15, H * 0.75, Math.max(W, H) * 0.55, 'rgb(255,120,190)', 0.55);
  blob(W * 0.9, H * 0.2, Math.max(W, H) * 0.5, 'rgb(120,240,255)', 0.4);
  const d = new Date(2026, 8, 9, 9, 41);
  const tall = H >= W;
  const unit = Math.min(W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.textAlign = 'center';
  ctx.font = `600 ${unit * 0.055}px Inter, system-ui, sans-serif`;
  const dateTxt = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  ctx.fillText(dateTxt.charAt(0).toUpperCase() + dateTxt.slice(1), W / 2, tall ? H * 0.135 : H * 0.2);
  ctx.font = `700 ${unit * (tall ? 0.26 : 0.22)}px Inter, system-ui, sans-serif`;
  ctx.fillText('9:41', W / 2, tall ? H * 0.135 + unit * 0.27 : H * 0.2 + unit * 0.24);
  return c;
}

// Dessus de la base d'un ordinateur portable : clavier et pavé tactile (repère : largeur × profondeur, avant en bas).
export function keyboardTexture(wmm, dmm, color, maxSide = 2048) {
  const px = maxSide / Math.max(wmm, dmm);
  const c = makeCanvas(wmm * px, dmm * px);
  const ctx = c.getContext('2d');
  ctx.scale(px, px);
  const g = ctx.createLinearGradient(0, 0, 0, dmm);
  g.addColorStop(0, shade(color, 0.03));
  g.addColorStop(1, shade(color, -0.04));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, wmm, dmm);
  const kbW = wmm * 0.88;
  const kbX = (wmm - kbW) / 2;
  const kbY = dmm * 0.08;
  const kbH = dmm * 0.43;
  // Cuvette du clavier
  ctx.fillStyle = shade(color, -0.12);
  roundRect(ctx, kbX - 2, kbY - 2, kbW + 4, kbH + 4, 3);
  ctx.fill();
  const rows = [14, 14, 14, 13, 12, 9];
  const keyColor = luminance(color) > 0.45 ? '#1d1d20' : '#111113';
  const gap = kbW * 0.006;
  const rowH = (kbH - gap * 5.5) / 5.5;
  let y = kbY;
  rows.forEach((n, ri) => {
    const h = ri === 0 ? rowH * 0.5 : rowH;
    const kw = (kbW - gap * (n - 1)) / n;
    let x = kbX;
    for (let i = 0; i < n; i++) {
      let w = kw;
      if (ri === 5 && i === 4) w = kw * 5 + gap * 4; // barre d'espace
      if (ri === 5 && i > 4) { x += 0; }
      ctx.fillStyle = keyColor;
      roundRect(ctx, x, y, w, h, Math.min(1.2, h * 0.18));
      ctx.fill();
      x += w + gap;
      if (x > kbX + kbW) break;
    }
    y += h + gap;
  });
  // Pavé tactile
  const tpW = wmm * 0.42;
  const tpH = dmm * 0.36;
  ctx.fillStyle = shade(color, 0.025);
  roundRect(ctx, (wmm - tpW) / 2, dmm * 0.57, tpW, tpH, 4);
  ctx.fill();
  ctx.strokeStyle = shade(color, -0.1);
  ctx.lineWidth = 0.35;
  ctx.stroke();
  return c;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// Texte en 3D (plan) : police de l'interface, rendu net.
export function textTexture({
  text = 'Texte', color = '#1d1d1f', weight = 700, size = 120, align = 'center', font = 'Inter',
} = {}) {
  const lines = String(text || ' ').split('\n');
  const probe = makeCanvas(4, 4).getContext('2d');
  probe.font = `${weight} ${size}px ${font}, system-ui, sans-serif`;
  const widths = lines.map((l) => probe.measureText(l || ' ').width);
  const lh = size * 1.12;
  const w = Math.ceil(Math.max(...widths) + size * 0.3);
  const h = Math.ceil(lh * lines.length + size * 0.25);
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.font = probe.font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = align;
  const ax = align === 'left' ? size * 0.15 : align === 'right' ? w - size * 0.15 : w / 2;
  lines.forEach((l, i) => ctx.fillText(l, ax, size * 0.98 + i * lh));
  return c;
}

// Arrière-plan en dégradé (linéaire vertical ou radial).
// Tramage anti-banding : ajoute un bruit triangulaire (±amp niveaux) qui casse les bandes d'un
// dégradé sans le salir ni changer ses couleurs. Réutilisable par les fonds de maquettes.
export function ditherCanvas(ctx, w, h, amp = 2.2) {
  let img;
  try { img = ctx.getImageData(0, 0, w, h); } catch { return; } // canvas « sali » : on saute
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() + Math.random() - 1) * amp; // TPDF ~ ±amp
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

export function gradientTexture(a, b, kind = 'linear', w = 1024, h = 1024) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const g = kind === 'radial' ? ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.5, Math.max(w, h) * 0.78) : ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ditherCanvas(ctx, c.width, c.height);
  return c;
}
