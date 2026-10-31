/* Conversion des couleurs de terminal (séquences ANSI) en HTML. */
import { esc } from '../core/dom.js';

const BASIC = ['#3a3a3c', '#e5484d', '#30a46c', '#d6a20a', '#3e7bfa', '#b05ad8', '#12a5b0', '#c7c7cc'];
const BRIGHT = ['#8e8e93', '#ff6369', '#4cc38a', '#f5c518', '#70a1ff', '#d18bf0', '#3dd6e0', '#ffffff'];

function c256(n) {
  if (n < 8) return BASIC[n];
  if (n < 16) return BRIGHT[n - 8];
  if (n >= 232) { const v = 8 + (n - 232) * 10; return `rgb(${v},${v},${v})`; }
  const i = n - 16;
  const r = Math.floor(i / 36);
  const g = Math.floor((i % 36) / 6);
  const b = i % 6;
  const k = (x) => (x ? 55 + x * 40 : 0);
  return `rgb(${k(r)},${k(g)},${k(b)})`;
}

export class Ansi {
  constructor() { this.reset(); }

  reset() { this.st = { fg: null, bg: null, bold: false, dim: false, italic: false, underline: false }; }

  style() {
    const s = this.st;
    const css = [];
    if (s.fg) css.push(`color:${s.fg}`);
    if (s.bg) css.push(`background:${s.bg}`);
    if (s.bold) css.push('font-weight:700');
    if (s.dim) css.push('opacity:.65');
    if (s.italic) css.push('font-style:italic');
    if (s.underline) css.push('text-decoration:underline');
    return css.join(';');
  }

  sgr(codes) {
    const c = codes.length ? codes : [0];
    for (let i = 0; i < c.length; i += 1) {
      const n = c[i];
      if (n === 0) this.reset();
      else if (n === 1) this.st.bold = true;
      else if (n === 2) this.st.dim = true;
      else if (n === 3) this.st.italic = true;
      else if (n === 4) this.st.underline = true;
      else if (n === 22) { this.st.bold = false; this.st.dim = false; } else if (n === 23) this.st.italic = false;
      else if (n === 24) this.st.underline = false;
      else if (n >= 30 && n <= 37) this.st.fg = BASIC[n - 30];
      else if (n >= 90 && n <= 97) this.st.fg = BRIGHT[n - 90];
      else if (n === 39) this.st.fg = null;
      else if (n >= 40 && n <= 47) this.st.bg = BASIC[n - 40];
      else if (n >= 100 && n <= 107) this.st.bg = BRIGHT[n - 100];
      else if (n === 49) this.st.bg = null;
      else if ((n === 38 || n === 48) && c[i + 1] === 5) { this.st[n === 38 ? 'fg' : 'bg'] = c256(c[i + 2]); i += 2; } else if ((n === 38 || n === 48) && c[i + 1] === 2) { this.st[n === 38 ? 'fg' : 'bg'] = `rgb(${c[i + 2]},${c[i + 3]},${c[i + 4]})`; i += 4; }
    }
  }

  /** Texte brut du terminal → HTML (liens cliquables, styles conservés d'un appel à l'autre). */
  html(text) {
    let out = '';
    const re = /\u001b\[([0-9;?]*)([A-Za-z])|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\r(?!\n)/g;
    let last = 0;
    let m;
    const push = (t) => {
      if (!t) return;
      let h = esc(t).replace(/(https?:\/\/[^\s<>"')]+)/g, '<a data-term-link="$1">$1</a>');
      const st = this.style();
      if (st) h = `<span style="${st}">${h}</span>`;
      out += h;
    };
    while ((m = re.exec(text))) {
      push(text.slice(last, m.index));
      last = re.lastIndex;
      if (m[2] === 'm') this.sgr(m[1].split(';').filter((x) => x !== '').map(Number));
      else if (m[0] === '\r') out += '\r';
    }
    push(text.slice(last));
    return out;
  }
}
