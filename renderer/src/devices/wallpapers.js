/* Fonds d'écran originaux de NEXORA (dessinés, libres de droits) : « Verre » dans l'esprit des iPhone récents,
 * « Fluide » dans l'esprit de One UI. Teintes tirées de la couleur de l'appareil. Écran de verrouillage assorti. */
import { shade, luminance, parseColor } from './frames2d.js';

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function hsl(hex) {
  const c = parseColor(hex);
  const r = c[0] / 255; const g = c[1] / 255; const b = c[2] / 255;
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
  let h = 0; let s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}
const hslStr = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%, ${a})`;

// Teinte de base : couleur de l'appareil ; les appareils noirs ou blancs prennent un bleu profond.
function baseHue(color, fallback) {
  const c = hsl(color || '#5b6cff');
  return c.s < 0.12 ? fallback : c.h;
}

function grain(ctx, W, H, amount = 0.035) {
  const n = 1400;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${amount})` : `rgba(0,0,0,${amount})`;
    ctx.fillRect(rnd() * W, rnd() * H, 1.2, 1.2);
  }
}

// « Verre » : rubans translucides superposés, lumière douce venue du haut.
export function paintGlass(ctx, W, H, color) {
  const h0 = baseHue(color, 212);
  const dark = luminance(color || '#888') < 0.25;
  const bg = ctx.createLinearGradient(0, 0, W * 0.3, H);
  bg.addColorStop(0, hslStr(h0 + 8, 0.55, dark ? 0.16 : 0.72));
  bg.addColorStop(0.55, hslStr(h0, 0.6, dark ? 0.1 : 0.52));
  bg.addColorStop(1, hslStr(h0 - 18, 0.65, dark ? 0.05 : 0.28));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const ribbon = (y0, amp, thick, hue, a, tilt) => {
    ctx.save();
    ctx.translate(W / 2, y0);
    ctx.rotate(tilt);
    const g = ctx.createLinearGradient(0, -thick, 0, thick);
    g.addColorStop(0, hslStr(hue, 0.7, 0.85, 0));
    g.addColorStop(0.35, hslStr(hue, 0.75, 0.82, a));
    g.addColorStop(0.5, hslStr(hue + 10, 0.9, 0.95, a * 1.3));
    g.addColorStop(0.65, hslStr(hue, 0.7, 0.6, a));
    g.addColorStop(1, hslStr(hue, 0.6, 0.4, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    const w = W * 1.8;
    ctx.moveTo(-w / 2, -thick);
    ctx.bezierCurveTo(-w * 0.15, -thick - amp, w * 0.15, -thick + amp, w / 2, -thick);
    ctx.lineTo(w / 2, thick);
    ctx.bezierCurveTo(w * 0.15, thick + amp, -w * 0.15, thick - amp, -w / 2, thick);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  ribbon(H * 0.42, H * 0.12, H * 0.09, h0 + 20, dark ? 0.35 : 0.5, -0.35);
  ribbon(H * 0.58, H * 0.15, H * 0.12, h0 - 10, dark ? 0.3 : 0.42, -0.28);
  ribbon(H * 0.74, H * 0.1, H * 0.08, h0 + 40, dark ? 0.28 : 0.38, -0.42);
  ribbon(H * 0.3, H * 0.08, H * 0.05, h0 + 60, 0.22, -0.5);
  // Halo lumineux.
  const lg = ctx.createRadialGradient(W * 0.3, H * 0.18, 0, W * 0.3, H * 0.18, H * 0.55);
  lg.addColorStop(0, 'rgba(255,255,255,0.35)');
  lg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, 0.025);
}

// « Fluide » : formes organiques fondues, profondeur et reflets.
export function paintFluid(ctx, W, H, color) {
  const h0 = baseHue(color, 255);
  const dark = luminance(color || '#888') < 0.3;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, hslStr(h0 - 20, 0.5, dark ? 0.1 : 0.18));
  bg.addColorStop(1, hslStr(h0 + 10, 0.55, dark ? 0.04 : 0.1));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const blob = (x, y, r, hue, l, a) => {
    const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.05, x, y, r);
    g.addColorStop(0, hslStr(hue, 0.85, Math.min(0.92, l + 0.25), a));
    g.addColorStop(0.45, hslStr(hue, 0.8, l, a * 0.9));
    g.addColorStop(1, hslStr(hue, 0.8, l * 0.6, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 1.15, 0.3, 0, Math.PI * 2);
    ctx.fill();
  };
  blob(W * 0.85, H * 0.28, W * 0.75, h0 + 25, 0.55, 0.9);
  blob(W * 0.1, H * 0.6, W * 0.85, h0 - 25, 0.45, 0.85);
  blob(W * 0.7, H * 0.85, W * 0.7, h0 + 55, 0.5, 0.8);
  blob(W * 0.35, H * 0.35, W * 0.35, h0 + 90, 0.62, 0.55);
  // Voile qui fond les formes ensemble.
  ctx.fillStyle = hslStr(h0, 0.4, 0.5, 0.08);
  ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, 0.03);
}

export function wallpaperStyle(dev) {
  if (!dev) return 'default';
  if (dev.os === 'ios') return 'glass';
  if (dev.os === 'android') return 'fluid';
  return 'default';
}

// Écran de verrouillage complet (fond, date, heure) à la taille W × H (pixels CSS).
export function paintLockScreen(ctx, W, H, { dev, color, clock = true } = {}) {
  const style = wallpaperStyle(dev);
  if (style === 'fluid') paintFluid(ctx, W, H, color); else paintGlass(ctx, W, H, color);
  if (!clock) return;
  const d = new Date(2026, 8, 9, 9, 41);
  const unit = Math.min(W, H);
  const tall = H >= W;
  const date = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const Date1 = date.charAt(0).toUpperCase() + date.slice(1);
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = unit * 0.02;
  ctx.textAlign = 'center';
  if (style === 'fluid') {
    // One UI : grande heure fine, date dessous.
    ctx.font = `300 ${unit * (tall ? 0.3 : 0.22)}px Inter, system-ui, sans-serif`;
    ctx.fillText('12:30', W / 2, tall ? H * 0.2 : H * 0.32);
    ctx.font = `500 ${unit * 0.048}px Inter, system-ui, sans-serif`;
    ctx.fillText(Date1, W / 2, (tall ? H * 0.2 : H * 0.32) + unit * 0.085);
  } else {
    // iOS : date au-dessus, heure très grasse et arrondie.
    ctx.font = `600 ${unit * 0.05}px Inter, system-ui, sans-serif`;
    ctx.fillText(Date1, W / 2, tall ? H * 0.13 : H * 0.2);
    ctx.font = `800 ${unit * (tall ? 0.29 : 0.22)}px Inter, system-ui, sans-serif`;
    ctx.fillText('9:41', W / 2, (tall ? H * 0.13 : H * 0.2) + unit * (tall ? 0.29 : 0.23));
    // Lampe et appareil photo en bas.
    if (tall) {
      ctx.shadowColor = 'transparent';
      for (const x of [W * 0.16, W * 0.84]) {
        ctx.beginPath(); ctx.arc(x, H * 0.92, unit * 0.065, 0, Math.PI * 2); ctx.fillStyle = 'rgba(30,30,40,0.35)'; ctx.fill();
      }
    }
  }
  // Barre d'accueil (iOS) ou icônes rapides (One UI).
  ctx.shadowColor = 'transparent';
  if (tall) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const bw = unit * 0.34;
    ctx.beginPath();
    ctx.roundRect(W / 2 - bw / 2, H - unit * 0.035, bw, unit * 0.012, unit * 0.006);
    ctx.fill();
  }
  ctx.restore();
}

export function lockScreenDataUrl(dev, color, W, H, scale = 2) {
  const c = document.createElement('canvas');
  c.width = Math.round(W * scale); c.height = Math.round(H * scale);
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  paintLockScreen(ctx, W, H, { dev, color });
  return c.toDataURL('image/jpeg', 0.9);
}

export const wallpaperShade = shade;
