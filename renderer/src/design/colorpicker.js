/* NEX-DESIGN › sélecteur de couleur : carré saturation/luminosité, teinte, opacité, saisie hexadécimale,
 * pipette (n'importe quel pixel de l'écran), couleurs du document et nuancier. */
import { showPopover, hidePopover } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { esc } from '../core/dom.js';

export const PRESETS = [
  '#000000', '#1d1d1f', '#3a3a3c', '#8e8e93', '#d1d1d6', '#f2f2f7', '#ffffff',
  '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#30b0c7', '#007aff', '#5856d6', '#af52de', '#ff2d55',
  '#6a4cff', '#0f172a', '#1e3a8a', '#065f46', '#7c2d12', '#fde68a', '#fbcfe8',
];

export function parseColor(c) {
  const s = String(c || '').trim();
  let m = s.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
  }
  m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const [r, g, b, a] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: r || 0, g: g || 0, b: b || 0, a: Number.isFinite(a) ? a : 1 };
  }
  return { r: 0, g: 0, b: 0, a: s === 'transparent' || !s ? 0 : 1 };
}

const hex2 = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
export function toHex({ r, g, b }) { return `#${hex2(r)}${hex2(g)}${hex2(b)}`; }
export function toCss({ r, g, b, a }) { return a >= 0.999 ? toHex({ r, g, b }) : `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${Math.round(a * 1000) / 1000})`; }

function rgb2hsv({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}
function hsv2rgb({ h, s, v }) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return { r: f(5) * 255, g: f(3) * 255, b: f(1) * 255 };
}

/* Ouvre le sélecteur sous `anchor`. onInput : pendant le réglage ; onChange : à la fin d'un geste. */
export function openColorPicker(anchor, value, { onInput, onChange, docColors = [], title = 'Couleur' } = {}) {
  const c0 = parseColor(value);
  let hsv = rgb2hsv(c0);
  let alpha = c0.a;
  const pop = showPopover(anchor, `
    <div class="cp">
      <div class="cp-head"><b>${esc(title)}</b>${window.EyeDropper ? `<button class="icon-btn small" data-cp="eye" title="Pipette : prendre une couleur à l’écran">${icon('target', 14)}</button>` : ''}</div>
      <div class="cp-sv"><canvas width="232" height="150"></canvas><i class="cp-dot"></i></div>
      <div class="cp-slider cp-hue"><i></i></div>
      <div class="cp-slider cp-alpha"><span></span><i></i></div>
      <div class="cp-row"><span class="cp-prev"><i></i></span><input class="input small cp-hex" spellcheck="false" maxlength="9"><input class="input small cp-a" type="number" min="0" max="100" step="1"><span class="cp-pct">%</span></div>
      ${docColors.length ? `<div class="cp-sub">Couleurs du document</div><div class="cp-sw">${docColors.slice(0, 16).map((c) => `<button style="--c:${esc(c)}" data-cp-c="${esc(c)}" title="${esc(c)}"></button>`).join('')}</div>` : ''}
      <div class="cp-sub">Nuancier</div><div class="cp-sw">${PRESETS.map((c) => `<button style="--c:${c}" data-cp-c="${c}" title="${c}"></button>`).join('')}</div>
    </div>`, { width: 260, align: 'start' });
  if (!pop) return;
  const cv = pop.querySelector('.cp-sv canvas');
  const ctx = cv.getContext('2d');
  const dot = pop.querySelector('.cp-dot');
  const hue = pop.querySelector('.cp-hue');
  const alp = pop.querySelector('.cp-alpha');
  const hex = pop.querySelector('.cp-hex');
  const ain = pop.querySelector('.cp-a');
  const prev = pop.querySelector('.cp-prev i');
  const current = () => ({ ...hsv2rgb(hsv), a: alpha });
  const paintSv = () => {
    const W = cv.width; const H = cv.height;
    ctx.fillStyle = toHex(hsv2rgb({ h: hsv.h, s: 1, v: 1 }));
    ctx.fillRect(0, 0, W, H);
    const gw = ctx.createLinearGradient(0, 0, W, 0); gw.addColorStop(0, '#fff'); gw.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gw; ctx.fillRect(0, 0, W, H);
    const gb = ctx.createLinearGradient(0, 0, 0, H); gb.addColorStop(0, 'rgba(0,0,0,0)'); gb.addColorStop(1, '#000');
    ctx.fillStyle = gb; ctx.fillRect(0, 0, W, H);
  };
  const sync = (from) => {
    const c = current();
    dot.style.left = `${hsv.s * 100}%`; dot.style.top = `${(1 - hsv.v) * 100}%`;
    dot.style.background = toHex(c);
    hue.querySelector('i').style.left = `${(hsv.h / 360) * 100}%`;
    alp.querySelector('i').style.left = `${alpha * 100}%`;
    alp.style.setProperty('--c', toHex(c));
    prev.style.background = toCss(c);
    if (from !== 'hex') hex.value = toHex(c).toUpperCase();
    if (from !== 'a') ain.value = Math.round(alpha * 100);
  };
  const emit = (final) => { const v = toCss(current()); if (onInput) onInput(v); if (final && onChange) onChange(v); };
  const drag = (el, fn) => {
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      const move = (ev) => { const r = el.getBoundingClientRect(); fn(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height))); sync(); emit(false); };
      move(e);
      const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); emit(true); };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    });
  };
  drag(pop.querySelector('.cp-sv'), (x, y) => { hsv.s = x; hsv.v = 1 - y; });
  drag(hue, (x) => { hsv.h = x * 359.9; paintSv(); });
  drag(alp, (x) => { alpha = x; });
  hex.addEventListener('input', () => {
    if (!/^#?[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex.value.trim())) return;
    const c = parseColor(hex.value.trim().startsWith('#') ? hex.value.trim() : `#${hex.value.trim()}`);
    hsv = rgb2hsv(c); if (hex.value.trim().replace('#', '').length === 8) alpha = c.a;
    paintSv(); sync('hex'); emit(true);
  });
  ain.addEventListener('input', () => { alpha = Math.max(0, Math.min(100, Number(ain.value) || 0)) / 100; sync('a'); emit(true); });
  pop.onclick = async (e) => {
    const sw = e.target.closest('[data-cp-c]');
    if (sw) { const c = parseColor(sw.dataset.cpC); hsv = rgb2hsv(c); alpha = c.a; paintSv(); sync(); emit(true); return; }
    if (e.target.closest('[data-cp="eye"]')) {
      try {
        const r = await new window.EyeDropper().open();
        const c = parseColor(r.sRGBHex); hsv = rgb2hsv(c); paintSv(); sync(); emit(true);
      } catch { /* annulé */ }
    }
  };
  paintSv();
  sync();
  return { close: hidePopover };
}
