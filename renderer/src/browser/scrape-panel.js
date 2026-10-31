/* Panneau Aspirateur : copie complète d'un site (toutes les pages, ressources, sources d'origine),
 * puis enregistrement du code source complet (dossier, ZIP) ou ouverture dans le Dev Lab. */
import { api } from '../core/api.js';
import { $, esc, fmtBytes } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { openSheet, closeSheet, toast } from '../core/ui.js';

export default class ScrapePanel {
  constructor(lab, el) {
    this.lab = lab;
    this.el = el;
    lab.st.scrape = {
      maxPages: 200, maxDepth: 6, rendered: true, external: true, sitemap: true, robots: true, scroll: true, sourceMaps: true, subdomains: false, delay: 150, include: '', exclude: '', ...(lab.st.scrape || {}),
    };
    this.o = lab.st.scrape;
    this.job = null;
    this.report = null;
    this.log = [];
    this.render();
    el.addEventListener('click', (e) => this.onClick(e));
    el.addEventListener('change', (e) => this.onChange(e));
    api.on('lab:scrape', (m) => this.onEvent(m));
  }

  activate() {}

  opt(k, label, hint) {
    return `<label class="tog-row"><span class="tog-text"><span>${label}</span>${hint ? `<small>${hint}</small>` : ''}</span><input type="checkbox" data-o="${k}" ${this.o[k] ? 'checked' : ''}><span class="tog"></span></label>`;
  }

  render() {
    const running = Boolean(this.job && !this.report);
    this.el.innerHTML = `
      <div class="sc">
        <div class="sc-head">
          <div><b>Aspirer tout le site</b><p class="bl-hint">Toutes les pages du site, affichées comme dans un navigateur (le JavaScript s’exécute), avec leurs styles, scripts, images, polices et vidéos. Les liens sont réécrits : la copie s’ouvre et fonctionne hors ligne.</p></div>
        </div>
        <div class="sc-start">
          <code class="sc-url">${esc(this.lab.url || 'Aucune page ouverte')}</code>
          ${running ? `<button class="btn small" data-act="cancel">${icon('stop', 12)}<span>Arrêter</span></button>` : `<button class="btn primary small" data-act="start" ${this.lab.url ? '' : 'disabled'}>${icon('download', 13)}<span>Aspirer le site</span></button>`}
        </div>
        ${running || this.report ? this.progressHtml() : ''}
        <details class="sc-opts" ${running || this.report ? '' : 'open'}><summary>Options</summary>
          <div class="ab-grid2"><label class="field"><span>Pages au maximum</span><input class="input" type="number" min="1" max="5000" data-n="maxPages" value="${this.o.maxPages}"></label><label class="field"><span>Profondeur des liens</span><input class="input" type="number" min="0" max="30" data-n="maxDepth" value="${this.o.maxDepth}"></label></div>
          ${this.opt('rendered', 'Pages après exécution du JavaScript', 'Indispensable pour React, Vue, Angular… Le code d’origine envoyé par le serveur est aussi gardé dans _code-serveur/.')}
          ${this.opt('sourceMaps', 'Reconstituer le code source d’origine', 'Si le site publie ses source maps : fichiers React/Vue/TypeScript d’origine dans _sources/.')}
          ${this.opt('external', 'Ressources d’autres domaines (CDN, polices)', 'Rangées dans _externe/ pour que la copie soit complète.')}
          ${this.opt('sitemap', 'Utiliser le plan du site (sitemap.xml)', 'Trouve aussi les pages qui ne sont reliées par aucun lien.')}
          ${this.opt('scroll', 'Faire défiler chaque page', 'Charge les images et contenus qui n’apparaissent qu’au défilement.')}
          ${this.opt('robots', 'Respecter robots.txt', 'Recommandé pour les sites qui ne t’appartiennent pas.')}
          ${this.opt('subdomains', 'Inclure les sous-domaines', '')}
          <div class="ab-grid2"><label class="field"><span>Seulement les adresses contenant</span><input class="input mono" data-s="include" value="${esc(this.o.include)}" placeholder="/blog/*, /produits/*"></label><label class="field"><span>Exclure</span><input class="input mono" data-s="exclude" value="${esc(this.o.exclude)}" placeholder="/panier, *?page=*"></label></div>
          <label class="field"><span>Pause entre deux pages (ms)</span><input class="input" type="number" min="0" max="10000" step="50" data-n="delay" value="${this.o.delay}"></label>
          <p class="bl-hint">${icon('info', 12)} Respecte les droits d’auteur et les conditions d’utilisation des sites : aspire tes propres sites, ou ceux que tu as l’autorisation de copier.</p>
        </details>
      </div>`;
  }

  progressHtml() {
    const p = this.progress || {};
    const r = this.report;
    if (r) {
      return `<div class="sc-done">
        <div class="sc-res-head">${icon(r.cancelled ? 'warn' : 'pass', 18)}<b>${r.cancelled ? 'Aspiration arrêtée' : 'Site aspiré'}</b></div>
        <div class="ts-sum">
          <div><b>${r.pages.length}</b><span>pages</span></div>
          <div><b>${r.files}</b><span>fichiers</span></div>
          <div><b>${fmtBytes(r.bytes)}</b><span>au total</span></div>
          <div><b>${r.sources}</b><span>sources d’origine</span></div>
        </div>
        <div class="sc-types">${Object.entries(r.byType).map(([k, v]) => `<span><b>${v.count}</b> ${esc(k)} · ${fmtBytes(v.bytes)}</span>`).join('')}</div>
        ${this.saved ? `<p class="ok">${icon('pass', 13)} Enregistré dans ${esc(this.saved.dir || this.saved.file)}</p>` : ''}
        <div class="sc-actions">
          <button class="btn primary small" data-act="save">${icon('folder', 13)}<span>Enregistrer le code source</span></button>
          <button class="btn small" data-act="save-choose">${icon('folderOpen', 13)}<span>Choisir le dossier…</span></button>
          <button class="btn small" data-act="zip">${icon('download', 13)}<span>ZIP</span></button>
          ${this.saved && this.saved.dir ? `<button class="btn small" data-act="open-dev">${icon('code', 13)}<span>Ouvrir dans le Dev Lab</span></button><button class="btn small" data-act="reveal">${icon('folderOpen', 13)}<span>Afficher</span></button>` : ''}
        </div>
        <details class="sc-pages"><summary>Pages (${r.pages.length})${r.errors.length ? ` · ${r.errors.length} erreur(s)` : ''}</summary>${r.pages.map((pg) => `<div class="sc-pg"><span class="${pg.status >= 400 ? 'bad' : ''}">${pg.status || '—'}</span><span title="${esc(pg.url)}">${esc((() => { try { return new URL(pg.url).pathname; } catch { return pg.url; } })())}</span><small>${esc(pg.title || '')}</small></div>`).join('')}${r.errors.map((er) => `<div class="sc-pg"><span class="bad">!</span><span>${esc(er.url)}</span><small>${esc(er.error)}</small></div>`).join('')}</details>
      </div>`;
    }
    const pct = p.total ? Math.min(100, (p.done / p.total) * 100) : 4;
    return `<div class="sc-prog"><div class="ab-bar"><i style="width:${pct}%"></i></div>
      <span>${esc(p.message || (p.url ? `Page ${p.done + 1} / ${p.total} · ${p.url}` : 'Démarrage…'))}</span>
      <small>${p.files || 0} fichiers · ${fmtBytes(p.bytes || 0)}</small></div>`;
  }

  onEvent(m) {
    if (!this.job || m.id !== this.job.id) return;
    if (m.phase === 'done') {
      this.report = m.report;
      this.render();
      this.ask();
      return;
    }
    if (m.phase === 'error') {
      toast(`Aspiration impossible : ${m.error}`, { kind: 'bad' });
      this.job = null;
      this.render();
      return;
    }
    this.progress = { ...(this.progress || {}), ...m };
    const box = $('.sc-prog', this.el);
    if (box) box.outerHTML = this.progressHtml();
    else this.render();
  }

  // Une fois fini : demander où enregistrer le code source complet.
  ask() {
    const r = this.report;
    const sheet = openSheet('scrape-save', `
      <div class="sheet-head"><span class="sheet-icon">${icon('download', 22)}</span><div><h2>Enregistrer le code source du site ?</h2><p>${r.pages.length} pages, ${r.files} fichiers, ${fmtBytes(r.bytes)}${r.sources ? `, dont ${r.sources} fichiers source d’origine` : ''}.</p></div></div>
      <div class="sheet-body"><p class="bl-hint">Par défaut : Documents › NEXORA › Sites › ${esc(r.host)}. Le dossier contient la copie navigable (index.html), le code d’origine du serveur (_code-serveur), les sources reconstituées (_sources) et un rapport (vitrine-aspiration.json).</p></div>
      <div class="sheet-foot">
        <button class="btn" data-sh="later">Plus tard</button>
        <button class="btn" data-sh="zip">ZIP…</button>
        <button class="btn" data-sh="choose">Choisir…</button>
        <button class="btn primary" data-sh="save" data-autofocus>Enregistrer</button>
      </div>`);
    sheet.onclick = async (e) => {
      const b = e.target.closest('[data-sh]');
      if (!b) return;
      closeSheet('scrape-save');
      if (b.dataset.sh === 'save') await this.save('default');
      if (b.dataset.sh === 'choose') await this.save('choose');
      if (b.dataset.sh === 'zip') await this.save('zip');
    };
  }

  async save(mode) {
    try {
      const r = await api.invoke('lab:scrape-save', { id: this.job.id, mode });
      if (!r) return;
      this.saved = r;
      this.render();
      toast(r.file ? 'Archive ZIP enregistrée.' : 'Code source du site enregistré.', { action: r.index ? 'Ouvrir la copie' : 'Afficher', onAction: () => (r.index ? api.invoke('lab:open-path', r.index) : api.invoke('lab:reveal', r.file)) });
    } catch (e) { toast(e.message, { kind: 'bad' }); }
  }

  async onClick(e) {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    switch (a.dataset.act) {
      case 'start': {
        this.report = null;
        this.saved = null;
        this.progress = {};
        try {
          const r = await api.invoke('lab:scrape-start', { url: this.lab.url, options: { ...this.o } });
          this.job = r;
        } catch (err) { toast(err.message, { kind: 'bad' }); }
        this.render();
        break;
      }
      case 'cancel': if (this.job) api.invoke('lab:scrape-cancel', { id: this.job.id }); break;
      case 'save': await this.save('default'); break;
      case 'save-choose': await this.save('choose'); break;
      case 'zip': await this.save('zip'); break;
      case 'reveal': if (this.saved) api.invoke('lab:reveal', this.saved.index || this.saved.dir); break;
      case 'open-dev': {
        if (!this.saved || !this.saved.dir) break;
        const { setMode } = await import('../viewer/toolbar.js');
        await setMode('dev');
        if (window.__vitrineDevOpen) window.__vitrineDevOpen(this.saved.dir);
        break;
      }
      default: break;
    }
  }

  onChange(e) {
    const t = e.target;
    if (t.dataset.o) this.o[t.dataset.o] = t.checked;
    else if (t.dataset.n) this.o[t.dataset.n] = Number(t.value);
    else if (t.dataset.s) this.o[t.dataset.s] = t.value;
    else return;
    this.lab.save();
  }
}
