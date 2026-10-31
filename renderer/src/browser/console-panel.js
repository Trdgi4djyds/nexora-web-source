/* Panneau Console : messages de la page (journal, avertissements, erreurs) et ligne de commande
 * JavaScript exécutée dans la page, avec historique. */
import { $, esc } from '../core/dom.js';
import { icon } from '../core/icons.js';

const LV = { 0: 'log', 1: 'info', 2: 'warn', 3: 'error' };
const LEVEL_NAMES = {
  all: 'Tout', error: 'Erreurs', warn: 'Avertissements', log: 'Journal',
};

function fmt(v, depth = 0) {
  if (v === undefined) return '<span class="cn-u">undefined</span>';
  if (v === null) return '<span class="cn-u">null</span>';
  if (typeof v === 'string') return depth ? `<span class="cn-s">"${esc(v)}"</span>` : esc(v);
  if (typeof v === 'number' || typeof v === 'boolean') return `<span class="cn-n">${v}</span>`;
  try { return `<span class="cn-o">${esc(JSON.stringify(v, null, 2).slice(0, 20000))}</span>`; } catch { return esc(String(v)); }
}

export default class ConsolePanel {
  constructor(lab, el) {
    this.lab = lab;
    this.el = el;
    this.items = [];
    this.level = 'all';
    this.history = lab.st.history || [];
    this.hi = -1;
    this.render();
    lab.on('console', (m) => this.add({ level: LV[m.level] || 'log', text: m.message, source: m.source, line: m.line }));
    lab.on('navigate', (url, inPage) => { if (!inPage) this.add({ level: 'nav', text: `Navigation vers ${url}` }); });
    el.addEventListener('click', (e) => this.onClick(e));
  }

  activate() { const i = $('.cn-in', this.el); if (i) i.focus(); }

  render() {
    this.el.innerHTML = `
      <div class="cn">
        <div class="cn-bar">
          <button class="icon-btn small" data-act="clear" title="Effacer">${icon('trash', 13)}</button>
          <div class="nt-types">${Object.entries(LEVEL_NAMES).map(([k, v]) => `<button data-lv="${k}" class="${k === this.level ? 'on' : ''}">${v}</button>`).join('')}</div>
          <span class="cn-count"></span>
        </div>
        <div class="cn-list"></div>
        <form class="cn-form"><span>›</span><textarea class="cn-in mono" rows="1" spellcheck="false" placeholder="Code JavaScript exécuté dans la page (Entrée pour lancer, Maj+Entrée pour une nouvelle ligne)"></textarea></form>
      </div>`;
    const input = $('.cn-in', this.el);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.exec(input.value); input.value = ''; input.rows = 1; return; }
      if (e.key === 'ArrowUp' && !input.value.includes('\n') && this.history.length) { e.preventDefault(); this.hi = Math.min(this.history.length - 1, this.hi + 1); input.value = this.history[this.history.length - 1 - this.hi]; }
      if (e.key === 'ArrowDown' && !input.value.includes('\n')) { e.preventDefault(); this.hi = Math.max(-1, this.hi - 1); input.value = this.hi < 0 ? '' : this.history[this.history.length - 1 - this.hi]; }
    });
    input.addEventListener('input', () => { input.rows = Math.min(8, input.value.split('\n').length); });
    this.paint();
  }

  add(it) {
    this.items.push({ ...it, time: new Date() });
    if (this.items.length > 2000) this.items.splice(0, this.items.length - 2000);
    if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.paint(); });
  }

  paint() {
    const list = $('.cn-list', this.el);
    if (!list) return;
    const shown = this.items.filter((i) => this.level === 'all' || i.level === this.level || (this.level === 'log' && ['log', 'info', 'result', 'input'].includes(i.level)));
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    list.innerHTML = shown.slice(-800).map((i) => `<div class="cn-row ${i.level}">${i.level === 'input' ? '<b>›</b>' : i.level === 'result' ? '<b>‹</b>' : i.level === 'error' ? icon('error', 12) : i.level === 'warn' ? icon('warn', 12) : '<b></b>'}<pre>${i.html || esc(i.text)}</pre>${i.source ? `<small title="${esc(i.source)}">${esc(i.source.split('/').pop().split('?')[0])}${i.line ? `:${i.line}` : ''}</small>` : ''}</div>`).join('');
    if (atBottom) list.scrollTop = list.scrollHeight;
    const errs = this.items.filter((i) => i.level === 'error').length;
    const warns = this.items.filter((i) => i.level === 'warn').length;
    $('.cn-count', this.el).innerHTML = `${errs ? `<span class="bad">${errs} erreur${errs > 1 ? 's' : ''}</span>` : ''}${warns ? `<span class="warn">${warns} avert.</span>` : ''}`;
  }

  async exec(code) {
    if (!code.trim() || !this.lab.wv) return;
    this.history.push(code);
    if (this.history.length > 100) this.history.shift();
    this.lab.st.history = this.history;
    this.lab.save();
    this.hi = -1;
    this.add({ level: 'input', text: code });
    try {
      const v = await this.lab.wv.executeJavaScript(`(async () => { try { const r = await (0, eval)(${JSON.stringify(code)}); if (r instanceof Node) return { __node: r.outerHTML ? r.outerHTML.slice(0, 2000) : String(r) }; return r; } catch (e) { return { __error: String(e && e.stack || e) }; } })()`, true);
      if (v && v.__error) this.add({ level: 'error', text: v.__error });
      else if (v && v.__node) this.add({ level: 'result', html: `<span class="cn-o">${esc(v.__node)}</span>` });
      else this.add({ level: 'result', html: fmt(v, 1) });
    } catch (e) { this.add({ level: 'error', text: e.message }); }
  }

  onClick(e) {
    const lv = e.target.closest('[data-lv]');
    if (lv) { this.level = lv.dataset.lv; for (const b of lv.parentElement.children) b.classList.toggle('on', b === lv); this.paint(); return; }
    if (e.target.closest('[data-act="clear"]')) { this.items = []; this.paint(); }
  }
}
