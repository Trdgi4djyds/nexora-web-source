/* Panneau Éléments : composant ou section sélectionné dans la page, son code (HTML, CSS, JSX, fichier
 * autonome), ses styles et ses ressources. */
import { api } from '../core/api.js';
import { $, esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { seg, toast } from '../core/ui.js';
import {
  formatHtml, buildCss, toJsx, standalone, toComponentName,
} from './codegen.js';

const FORMATS = { html: 'HTML', css: 'CSS', jsx: 'React (JSX)', file: 'Fichier autonome' };

function highlight(code, lang) {
  const hl = window.hljs;
  if (!hl || code.length > 400000) return esc(code);
  try { return hl.highlight(code, { language: lang === 'jsx' ? 'javascript' : lang === 'file' ? 'xml' : lang === 'html' ? 'xml' : lang }).value; } catch { return esc(code); }
}

export default class ElementsPanel {
  constructor(lab, el) {
    this.lab = lab;
    this.el = el;
    this.info = null;
    this.code = null;
    this.format = 'html';
    this.sub = 'code';
    this.inherited = true;
    this.render();
    lab.on('picker', (m) => this.onPicker(m));
    lab.on('navigate', (url, inPage) => { if (!inPage) { this.info = null; this.code = null; this.sections = null; this.render(); } });
    lab.on('ready', () => { if (this.active && !this.info) this.loadSections(); });
    el.addEventListener('click', (e) => this.onClick(e));
  }

  activate() { this.active = true; if (!this.info) this.loadSections(); }
  deactivate() { this.active = false; }

  async loadSections() {
    if (!this.lab.wv) return;
    if (!(await this.lab.pickCall('sections()'))) await this.lab.injectPicker().then(() => (this.lab.st.pick ? null : this.lab.pickCall('off()')));
    this.sections = (await this.lab.pickCall('sections()')) || [];
    if (!this.info) this.render();
  }

  onPicker(m) {
    if (m.type === 'select') {
      this.info = m.info;
      this.code = null;
      this.render();
      this.loadCode();
    } else if (m.type === 'deselect') {
      this.info = null;
      this.render();
    } else if (m.type === 'escape') this.lab.togglePick(this.lab.st.pickMode);
  }

  async loadCode() {
    const token = (this.token = (this.token || 0) + 1);
    try {
      const code = await api.invoke('lab:el-code', { wcId: this.lab.wcId, maxNodes: 800 });
      if (token !== this.token) return;
      this.code = code;
      this.html = formatHtml(code.html);
      this.css = buildCss(code, { inherited: this.inherited });
    } catch (e) {
      this.code = { error: e.message };
    }
    this.renderBody();
  }

  name() {
    const i = this.info;
    if (!i) return 'Composant';
    return i.component ? i.component.name : toComponentName(i.classes[0] || i.id || i.tag);
  }

  text() {
    if (!this.code || this.code.error) return '';
    switch (this.format) {
      case 'css': return this.css;
      case 'jsx': return toJsx(this.html, this.name());
      case 'file': return standalone(this.code, this.html, this.css, this.name());
      default: return this.html;
    }
  }

  render() {
    const i = this.info;
    if (!i) {
      const secs = this.sections || [];
      this.el.innerHTML = `
        <div class="bl-empty-panel">
          <p class="bl-hint">${icon('target', 15)} Active <b>Composant</b> ou <b>Section</b> dans la barre, puis clique dans la page. <kbd>↑</kbd> parent, <kbd>↓</kbd> enfant, <kbd>←</kbd> <kbd>→</kbd> voisins, <kbd>Échap</kbd> pour désélectionner.</p>
          ${secs.length ? `<div class="bl-sub-title">Sections de la page</div><div class="bl-sections">${secs.map((s) => `<button data-sec="${esc(s.selector)}" style="--d:${s.depth}"><span>${esc(s.title || s.label)}</span><small>${esc(s.label)} · ${s.height} px</small></button>`).join('')}</div>` : ''}
        </div>`;
      return;
    }
    this.el.innerHTML = `
      <div class="el-head">
        <div class="el-path">${i.path.map((p, n) => `<button data-path="${n}" class="${n === i.path.length - 1 ? 'on' : ''} ${p.section ? 'sec' : ''}">${esc(p.label)}</button>`).join('<span>›</span>')}</div>
        <div class="el-title">
          <div><b>${esc(i.label)}</b>${i.component ? `<span class="pill">${esc(i.component.lib)} · ${esc(i.component.name)}</span>` : ''}${i.section ? '<span class="pill">section</span>' : ''}</div>
          <div class="el-nav">
            <button class="icon-btn small" data-nav="ArrowUp" title="Parent (↑)">${icon('chevronDown', 13, 'up')}</button>
            <button class="icon-btn small" data-nav="ArrowDown" title="Premier enfant (↓)">${icon('chevronDown', 13)}</button>
            <button class="icon-btn small" data-nav="ArrowLeft" title="Précédent (←)">${icon('chevronLeft', 13)}</button>
            <button class="icon-btn small" data-nav="ArrowRight" title="Suivant (→)">${icon('chevronRight', 13)}</button>
          </div>
        </div>
        <div class="el-meta"><span>${i.rect.width} × ${i.rect.height}</span><span>x ${i.rect.x} · y ${i.rect.y}</span><span>${i.descendants} élément${i.descendants > 1 ? 's' : ''}</span>${i.media ? `<span>${i.media} média${i.media > 1 ? 's' : ''}</span>` : ''}</div>
        <code class="el-sel" title="Sélecteur CSS">${esc(i.selector)}</code>
      </div>
      <div class="el-subtabs">${seg('elSub', this.sub, { code: 'Code', styles: 'Styles', assets: `Ressources${i.assets.length ? ` (${i.assets.length})` : ''}` })}</div>
      <div class="el-body"></div>`;
    this.renderBody();
  }

  renderBody() {
    const body = $('.el-body', this.el);
    if (!body || !this.info) return;
    if (this.sub === 'styles') { body.innerHTML = this.stylesHtml(); return; }
    if (this.sub === 'assets') { body.innerHTML = this.assetsHtml(); return; }
    if (!this.code) { body.innerHTML = `<div class="bl-loading"><span class="spinner small"></span> Lecture du code et des styles…</div>`; return; }
    if (this.code.error) { body.innerHTML = `<p class="bl-err">${esc(this.code.error)}</p>`; return; }
    const txt = this.text();
    const lang = this.format;
    body.innerHTML = `
      <div class="el-fmt">${seg('elFmt', this.format, FORMATS)}</div>
      <div class="el-actions">
        <button class="btn small" data-act="copy">${icon('copy', 13)}<span>Copier</span></button>
        <button class="btn small" data-act="save">${icon('download', 13)}<span>Enregistrer</span></button>
        <button class="btn small" data-act="shot">${icon('camera', 13)}<span>Image PNG</span></button>
        ${this.format === 'css' || this.format === 'file' ? `<label class="el-check"><input type="checkbox" data-inh ${this.inherited ? 'checked' : ''}> Styles hérités</label>` : ''}
      </div>
      <p class="bl-hint">${this.code.rules.length} règle${this.code.rules.length > 1 ? 's' : ''} CSS · ${this.code.vars.length} variable${this.code.vars.length > 1 ? 's' : ''} · ${this.code.fontFaces.length} police${this.code.fontFaces.length > 1 ? 's' : ''} · ${this.code.keyframes.length} animation${this.code.keyframes.length > 1 ? 's' : ''}${this.code.truncated ? ' · composant très grand : styles des 800 premiers éléments' : ''}</p>
      <pre class="el-code hljs"><code>${highlight(txt, lang)}</code></pre>`;
  }

  stylesHtml() {
    const s = this.info.styles;
    const swatch = (v) => (/^(rgb|#|hsl)/.test(v) ? `<i class="sw" style="background:${esc(v)}"></i>` : '');
    const m = (s.margin || '0').split(' ');
    const p = (s.padding || '0').split(' ');
    const q = (arr, i) => arr[i] ?? arr[i % 2] ?? arr[0];
    return `
      <div class="el-box">
        <div class="bx-m"><span class="t">${esc(q(m, 0))}</span><span class="r">${esc(q(m, 1))}</span><span class="b">${esc(q(m, 2))}</span><span class="l">${esc(q(m, 3))}</span><em>marge</em>
          <div class="bx-p"><span class="t">${esc(q(p, 0))}</span><span class="r">${esc(q(p, 1))}</span><span class="b">${esc(q(p, 2))}</span><span class="l">${esc(q(p, 3))}</span><em>intérieur</em>
            <div class="bx-c">${this.info.rect.width} × ${this.info.rect.height}</div></div></div>
      </div>
      <table class="el-styles">${Object.entries(s).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${swatch(v)}<span>${esc(v)}</span></td></tr>`).join('')}</table>`;
  }

  assetsHtml() {
    const a = this.info.assets;
    if (!a.length) return '<p class="bl-hint">Aucune image ni vidéo dans cet élément.</p>';
    return `<div class="el-assets">${a.map((u) => `<div class="el-asset">${/\.(mp4|webm|mov)(\?|$)/i.test(u) ? icon('video', 22) : `<img src="${esc(u)}" alt="" loading="lazy">`}<span title="${esc(u)}">${esc(u.split('/').pop().split('?')[0] || u)}</span><button class="icon-btn small" data-copy="${esc(u)}" title="Copier l’adresse">${icon('copy', 12)}</button></div>`).join('')}</div>`;
  }

  async onClick(e) {
    const sec = e.target.closest('[data-sec]');
    if (sec) {
      if (!this.lab.st.pick) await this.lab.togglePick('section');
      await this.lab.pickCall(`select(${JSON.stringify(sec.dataset.sec)})`);
      return;
    }
    const pth = e.target.closest('[data-path]');
    if (pth) { this.lab.pickCall(`selectPath(${Number(pth.dataset.path)})`); return; }
    const nav = e.target.closest('[data-nav]');
    if (nav) { this.lab.pickCall(`nav(${JSON.stringify(nav.dataset.nav)})`); return; }
    const sg = e.target.closest('[data-set]');
    if (sg) {
      if (sg.dataset.set === 'elSub') { this.sub = sg.dataset.val; this.render(); }
      if (sg.dataset.set === 'elFmt') { this.format = sg.dataset.val; this.renderBody(); }
      return;
    }
    if (e.target.matches('[data-inh]')) {
      this.inherited = e.target.checked;
      if (this.code && !this.code.error) this.css = buildCss(this.code, { inherited: this.inherited });
      this.renderBody();
      return;
    }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    try {
      if (act.dataset.act === 'copy') {
        await api.invoke('clipboard:write', this.text());
        toast('Code copié.');
      } else if (act.dataset.act === 'save') {
        const ext = { html: 'html', css: 'css', jsx: 'jsx', file: 'html' }[this.format];
        const f = await api.invoke('lab:save-text', { name: `${this.name()}.${ext}`, text: this.text(), filters: [{ name: FORMATS[this.format], extensions: [ext] }] });
        if (f) toast('Fichier enregistré.', { action: 'Afficher', onAction: () => api.invoke('lab:reveal', f) });
      } else if (act.dataset.act === 'shot') {
        const r = await api.invoke('lab:el-shot', { wcId: this.lab.wcId, scale: 2 });
        const f = await api.invoke('capture:save', { kind: 'photo', project: 'Browser Lab', name: this.name(), ext: 'png', data: r.data });
        if (f) toast(`Image ${r.width} × ${r.height} enregistrée.`, { action: 'Afficher', onAction: () => api.invoke('shell:reveal', f) });
      }
    } catch (err) { toast(err.message, { kind: 'bad' }); }
  }
}

