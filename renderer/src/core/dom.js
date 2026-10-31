/* Petits utilitaires d'interface. */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
export const noop = () => {};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const uid = () => Math.random().toString(36).slice(2, 9);

export const fmtNum = (n, d = 3) => String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ',');
export const fmtBytes = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(2).replace('.', ',')} Go` : b >= 1e6 ? `${(b / 1e6).toFixed(1).replace('.', ',')} Mo` : b >= 1e3 ? `${Math.round(b / 1e3)} Ko` : `${b} o`);
export const fmtMs = (ms) => (ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(2).replace('.', ',')} s` : `${Math.round(ms)} ms`);
export const fmtTime = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// Émetteur d'événements minimal.
export class Emitter {
  constructor() { this.handlers = new Map(); }
  on(ev, fn) {
    if (!this.handlers.has(ev)) this.handlers.set(ev, new Set());
    this.handlers.get(ev).add(fn);
    return () => this.handlers.get(ev).delete(fn);
  }
  emit(ev, ...args) {
    const set = this.handlers.get(ev);
    if (set) for (const fn of [...set]) { try { fn(...args); } catch (err) { console.error(err); } }
  }
}

export const bus = new Emitter();

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = url;
  });
}
export const loadImageB64 = (b64, mime = 'image/png') => loadImage(`data:${mime};base64,${b64}`);

export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function blobToBytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}
