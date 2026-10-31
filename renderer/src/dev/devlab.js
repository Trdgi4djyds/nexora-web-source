/* Dev Lab : environnement de développement intégré. Explorateur de fichiers, éditeur Monaco (celui de
 * VS Code) à onglets, recherche, Git et GitHub, terminaux, lancement du projet, aperçu en direct et
 * liens de partage. */
import { api } from '../core/api.js';
import { S } from '../core/state.js';
import {
  $, $$, esc, bus,
} from '../core/dom.js';
import { icon } from '../core/icons.js';
import { settings, persist } from '../core/settings.js';
import { toast, openSheet, closeSheet } from '../core/ui.js';
import { resizable } from '../core/resize.js';
import { loadMonaco } from './monaco.js';
import {
  EDITOR_DEFAULTS, FONTS, applyExtensions, resolveTheme, editorOptions, formatModel, ExtensionsPanel,
} from './editorplus.js';
import {
  GitPanel, GitHubPanel, TerminalPanel, PreviewPanel,
} from './devpanels.js';

const EXT_COLORS = {
  js: '#e8b600', mjs: '#e8b600', cjs: '#e8b600', jsx: '#22b8cf', ts: '#3178c6', tsx: '#3178c6', vue: '#41b883', svelte: '#ff3e00', html: '#e44d26', htm: '#e44d26', css: '#2965f1', scss: '#cd6799', sass: '#cd6799', less: '#1d365d', json: '#8e8e93', md: '#6e6e73', py: '#3572a5', php: '#777bb4', dart: '#0175c2', rb: '#cc342d', go: '#00add8', rs: '#dea584', java: '#b07219', kt: '#a97bff', swift: '#f05138', svg: '#ffb13b', png: '#a259ff', jpg: '#a259ff', jpeg: '#a259ff', webp: '#a259ff', gif: '#a259ff', yml: '#cb171e', yaml: '#cb171e', env: '#ecd53f', sh: '#4eaa25', bat: '#4eaa25',
};

const sep = () => (api.platform === 'win32' ? '\\' : '/');
const join = (a, b) => (a.endsWith(sep()) ? a + b : a + sep() + b);
const base = (p) => p.split(/[\\/]/).pop();
const dirOf = (p) => p.slice(0, Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')));
const extOf = (p) => (base(p).includes('.') ? base(p).split('.').pop().toLowerCase() : '');

const VD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160"><text x="120" y="118" text-anchor="middle" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="128" font-weight="800" letter-spacing="-6" fill="#8a8a92" fill-opacity="0.32">VD</text></svg>`;
const VD_WATERMARK = `.editor-group-watermark .letterpress, .monaco-workbench .part.editor > .content .editor-group-container > .editor-group-watermark > .letterpress { background-image: url("data:image/svg+xml;utf8,${encodeURIComponent(VD_SVG)}") !important; background-size: contain !important; background-repeat: no-repeat !important; background-position: center !important; }`;

function defaults() {
  return {
    root: null, recent: [], open: [], active: null, side: 'files', bottom: true, preview: true, autoSave: true, wrap: false, minimap: true, fontSize: 13, expanded: [], mode: 'vitrine', editor: null,
  };
}

export class DevLab {
  constructor(el) {
    this.el = el;
    settings.devLab = { ...defaults(), ...(settings.devLab || {}) };
    this.st = settings.devLab;
    // Réglages de l'éditeur (les anciens réglages taille, retour à la ligne et minimap sont repris).
    this.ed = { ...EDITOR_DEFAULTS, fontSize: this.st.fontSize || 13, wrap: Boolean(this.st.wrap), minimap: this.st.minimap !== false, ...(this.st.editor || {}) };
    this.st.editor = this.ed;
    this.extThemes = [];
    this.tree = new Map(); // dossier → enfants
    this.expanded = new Set(this.st.expanded || []);
    this.files = new Map(); // chemin → { model, view, saved, eol, bom }
    this.order = [];
    this.active = null;
    this.gitFiles = new Map();
    this.render();
    window.__vitrineDevOpen = (dir) => this.openFolder(dir);
    api.on('dev:fs', (m) => this.onFsChange(m));
    bus.on('theme', () => { if (this.monaco) this.monaco.editor.setTheme(resolveTheme(this.ed, this.extThemes)); });
    api.on('dev:vscode', (m) => this.onVsCodeEvent(m));
    if (this.st.root) this.openFolder(this.st.root, { restore: true }).catch(() => this.renderWelcome());
    else this.renderWelcome();
  }

  save() {
    this.st.expanded = [...this.expanded].slice(-300);
    persist();
  }

  // ------------------------------------------------------------------ squelette
  render() {
    this.el.innerHTML = `
      <div class="dk">
        <div class="dk-top">
          <button class="dk-proj" data-act="recent" title="Projets récents">${icon('folder', 15)}<b class="dk-proj-name">Aucun projet</b>${icon('chevronDown', 12)}</button>
          <button class="btn small" data-act="open">${icon('folderOpen', 14)}<span>Ouvrir</span></button>
          <button class="btn small" data-act="new">${icon('plus', 14)}<span>Nouveau</span></button>
          <button class="btn small" data-act="clone">${icon('download', 14)}<span>Depuis GitHub</span></button>
          <span class="dk-sp"></span>
          <div class="seg dk-mode" role="radiogroup" title="Éditeur">
            <button data-mode="vitrine" class="${this.st.mode !== 'vscode' ? 'on' : ''}">${icon('code', 13)}<span>Éditeur</span></button>
            <button data-mode="vscode" class="${this.st.mode === 'vscode' ? 'on' : ''}">${icon('layers', 13)}<span>Code Editor</span></button>
          </div>
          <button class="btn small primary" data-act="run" disabled>${icon('play', 12)}<span>Lancer</span></button>
          <button class="btn small" data-act="share" disabled>${icon('link', 14)}<span>Partager</span></button>
          <button class="btn small" data-act="publish" disabled>${icon('upload', 14)}<span>Publier sur GitHub</span></button>
          <span class="dk-tog">
            <button class="icon-btn ${this.st.bottom ? 'on' : ''}" data-act="toggle-bottom" title="Terminal">${icon('terminal', 16)}</button>
            <button class="icon-btn ${this.st.preview ? 'on' : ''}" data-act="toggle-preview" title="Aperçu">${icon('inspector', 16)}</button>
          </span>
        </div>
        <div class="dk-body">
          <aside class="dk-side">
            <div class="dk-acts">
              <button data-side="files" title="Fichiers">${icon('file', 18)}</button>
              <button data-side="search" title="Rechercher (Ctrl+Maj+F)">${icon('search', 18)}</button>
              <button data-side="git" title="Git">${icon('sync', 18)}<i class="dk-badge" hidden></i></button>
              <button data-side="github" title="GitHub">${icon('globe', 18)}</button>
              <button data-side="ext" title="Extensions (Ctrl+Maj+X)">${icon('shapes', 18)}</button>
              <span class="dk-acts-sp"></span>
              <button data-act="palette" title="Palette de commandes (Ctrl+Maj+P)">${icon('terminal', 18)}</button>
              <button data-act="editor-settings" title="Réglages de l'éditeur (Ctrl+,)">${icon('wrench', 18)}</button>
            </div>
            <div class="dk-sidepane"></div>
          </aside>
          <section class="dk-center">
            <div class="dk-tabs"></div>
            <div class="dk-editor"><div class="dk-monaco"></div><div class="dk-welcome"></div><div class="dk-diffbar" hidden></div></div>
            <div class="dk-vscode" hidden></div>
            <div class="dk-bottom" ${this.st.bottom ? '' : 'hidden'}></div>
          </section>
          <aside class="dk-preview" ${this.st.preview ? '' : 'hidden'}></aside>
        </div>
        <div class="dk-status"><span class="dk-st-branch"></span><span class="dk-st-sp"></span><span class="dk-st-pos"></span><span class="dk-st-lang"></span><span class="dk-st-eol"></span><button class="dk-st-btn" data-act="autosave">${this.st.autoSave ? 'Enregistrement auto' : 'Enregistrement manuel'}</button></div>
      </div>`;
    this.$ = {
      side: $('.dk-sidepane', this.el), tabs: $('.dk-tabs', this.el), monacoBox: $('.dk-monaco', this.el), welcome: $('.dk-welcome', this.el), bottom: $('.dk-bottom', this.el), preview: $('.dk-preview', this.el), name: $('.dk-proj-name', this.el), diffbar: $('.dk-diffbar', this.el),
    };
    resizable($('.dk-side', this.el), { key: 'devSide', edge: 'right', min: 190, max: 520, onResize: () => this.layoutEditor() });
    resizable(this.$.preview, { key: 'devPreview', edge: 'left', min: 300, max: () => Math.max(320, window.innerWidth * 0.6), onResize: () => { this.layoutEditor(); if (this.preview) this.preview.layout(); } });
    resizable(this.$.bottom, { key: 'devBottom', edge: 'top', min: 90, max: () => Math.max(120, window.innerHeight * 0.7), onResize: () => this.layoutEditor() });
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('contextmenu', (e) => this.onContext(e));
    this.el.addEventListener('dragover', (e) => { if (this.st.root && e.target.closest('.dk-tree')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    this.el.addEventListener('drop', (e) => this.onDrop(e));
    document.addEventListener('keydown', (e) => this.onKey(e), true);
    new ResizeObserver(() => this.layoutEditor()).observe($('.dk-editor', this.el));
    this.terminal = new TerminalPanel(this, this.$.bottom);
    this.preview = new PreviewPanel(this, this.$.preview);
    this.git = new GitPanel(this);
    this.github = new GitHubPanel(this);
    this.extPanel = new ExtensionsPanel(this);
    this.$.vscode = $('.dk-vscode', this.el);
    this.el.addEventListener('click', (e) => { const m = e.target.closest('button[data-mode]'); if (m) this.setMode(m.dataset.mode); });
    this.setSide(this.st.side);
    if (this.st.mode === 'vscode') setTimeout(() => this.setMode('vscode', { quiet: true }), 0);
  }

  renderWelcome() {
    const rec = (this.st.recent || []).slice(0, 8);
    this.$.welcome.hidden = this.order.length > 0;
    this.$.welcome.innerHTML = `
      <div class="dk-wel">
        <h2>Dev Lab</h2>
        <p>Écris, lance et publie ton site ou ton application, sans quitter NEXORA.</p>
        <div class="dk-wel-acts">
          <button class="dk-wel-card" data-act="open">${icon('folderOpen', 22)}<b>Ouvrir un dossier</b><small>Projet existant sur ton ordinateur</small></button>
          <button class="dk-wel-card" data-act="new">${icon('plus', 22)}<b>Nouveau projet</b><small>HTML, React, Vue, Svelte, Next.js, Astro</small></button>
          <button class="dk-wel-card" data-act="clone">${icon('download', 22)}<b>Depuis GitHub</b><small>Cloner ou télécharger un dépôt</small></button>
        </div>
        ${rec.length ? `<div class="dk-wel-rec"><h3>Récents</h3>${rec.map((r) => `<button data-recent="${esc(r.dir)}">${icon('folder', 14)}<b>${esc(r.name)}</b><small>${esc(r.dir)}</small></button>`).join('')}</div>` : ''}
        ${this.st.root ? `<p class="dk-wel-hint">Choisis un fichier dans l’explorateur · <kbd>Ctrl</kbd> <kbd>P</kbd> pour ouvrir un fichier par son nom</p>` : ''}
      </div>`;
  }

  // ------------------------------------------------------------------ projet
  async openFolder(dir, { restore = false, fromSync = false } = {}) {
    if (!dir) return;
    if (fromSync && this.st.root && (await import('../core/sync.js')).samePath(this.st.root, dir)) return;
    if (this.st.root && this.st.root !== dir) {
      if (!(await this.closeAll())) return;
      api.invoke('dev:unwatch', { dir: this.st.root });
    }
    const r = await api.invoke('dev:open', dir);
    this.st.root = r.root;
    this.st.recent = [{ dir: r.root, name: r.name, date: Date.now() }, ...(this.st.recent || []).filter((x) => x.dir !== r.root)].slice(0, 1000);
    if (!restore) { this.st.open = []; this.st.active = null; this.expanded = new Set([r.root]); }
    this.expanded.add(r.root);
    this.save();
    this.$.name.textContent = r.name;
    for (const b of $$('[data-act="run"], [data-act="share"], [data-act="publish"]', this.el)) b.disabled = false;
    this.tree.clear();
    await this.loadDir(r.root);
    for (const d of [...this.expanded]) if (d !== r.root && d.startsWith(r.root)) await this.loadDir(d).catch(() => this.expanded.delete(d));
    this.renderSide();
    api.invoke('dev:watch', { dir: r.root });
    this.allFiles = null;
    this.analysis = await api.invoke('dev:analyze', r.root).catch(() => null);
    this.updateRunButton();
    this.git.refresh();
    this.terminal.setCwd(r.root);
    this.preview.projectChanged();
    if (!restore && !fromSync) import('../core/sync.js').then((m) => m.adoptDevFolder(r.root)).catch(() => {});
    if (restore) {
      for (const f of this.st.open || []) await this.openFile(f, { silent: true }).catch(() => {});
      if (this.st.active) this.activate(this.st.active);
    }
    this.renderWelcome();
    if (this.st.mode === 'vscode' && this.$.vscode && !this.$.vscode.hidden) this.setMode('vscode', { quiet: true });
  }

  updateRunButton() {
    const b = $('[data-act="run"]', this.el);
    const a = this.analysis;
    b.title = a ? (a.static ? 'Serveur intégré (site statique)' : a.command || a.label) : '';
    $('span', b).textContent = this.preview.running ? 'Arrêter' : 'Lancer';
    b.innerHTML = `${icon(this.preview.running ? 'stop' : 'play', 12)}<span>${this.preview.running ? 'Arrêter' : 'Lancer'}</span>`;
  }

  async loadDir(dir) {
    const list = await api.invoke('dev:list', { dir });
    this.tree.set(dir, list);
    return list;
  }

  // ------------------------------------------------------------------ barre latérale
  setSide(k) {
    this.st.side = k;
    this.save();
    for (const b of $$('[data-side]', this.el)) b.classList.toggle('on', b.dataset.side === k);
    this.renderSide();
  }

  renderSide() {
    const k = this.st.side;
    if (k === 'files') this.renderFiles();
    else if (k === 'search') this.renderSearch();
    else if (k === 'git') this.git.render(this.$.side);
    else if (k === 'github') this.github.render(this.$.side);
    else if (k === 'ext') this.extPanel.render(this.$.side);
  }

  renderFiles() {
    if (!this.st.root) {
      this.$.side.innerHTML = `<div class="dk-side-empty"><p>Aucun dossier ouvert.</p><button class="btn small primary" data-act="open">${icon('folderOpen', 14)}<span>Ouvrir un dossier</span></button></div>`;
      return;
    }
    const rows = [];
    const walk = (dir, depth) => {
      for (const it of this.tree.get(dir) || []) {
        const open = it.dir && this.expanded.has(it.path);
        rows.push({ ...it, depth, open });
        if (open && this.tree.has(it.path)) walk(it.path, depth + 1);
      }
    };
    walk(this.st.root, 0);
    const gitMark = (p) => {
      const g = this.gitFiles.get(p);
      return g ? `<i class="dk-git ${g === 'nouveau' ? 'new' : g === 'supprimé' ? 'del' : 'mod'}">${g === 'nouveau' ? 'U' : g === 'supprimé' ? 'D' : 'M'}</i>` : '';
    };
    this.$.side.innerHTML = `
      <div class="dk-side-head"><b>${esc(base(this.st.root))}</b>
        <span><button class="icon-btn small" data-act="new-file" title="Nouveau fichier">${icon('file', 13)}</button><button class="icon-btn small" data-act="new-folder" title="Nouveau dossier">${icon('folder', 13)}</button><button class="icon-btn small" data-act="refresh" title="Actualiser">${icon('refreshCw', 13)}</button><button class="icon-btn small" data-act="collapse" title="Tout replier">${icon('minus', 13)}</button></span></div>
      <div class="dk-tree" data-dir="${esc(this.st.root)}">${rows.map((r) => `<div class="dk-row ${r.path === this.active ? 'on' : ''} ${r.ignored ? 'dim' : ''}" data-path="${esc(r.path)}" data-dir="${r.dir ? 1 : ''}" style="--d:${r.depth}" draggable="false">
        ${r.dir ? `<span class="dk-chev ${r.open ? 'open' : ''}">${icon('chevronRight', 11)}</span>${icon(r.open ? 'folderOpen' : 'folder', 14)}` : `<span class="dk-chev"></span><i class="dk-dot" style="--c:${EXT_COLORS[extOf(r.path)] || '#a1a1a6'}"></i>`}
        <span class="dk-n">${esc(r.name)}</span>${gitMark(r.path)}</div>`).join('')}</div>`;
  }

  renderSearch() {
    const q = this.searchState || { query: '', regex: false, caseSensitive: false, include: '', results: [] };
    this.searchState = q;
    this.$.side.innerHTML = `
      <div class="dk-search">
        <input class="input" data-search="query" placeholder="Rechercher dans le projet" value="${esc(q.query)}" spellcheck="false">
        <div class="dk-search-opts"><label><input type="checkbox" data-search="caseSensitive" ${q.caseSensitive ? 'checked' : ''}> Aa</label><label><input type="checkbox" data-search="regex" ${q.regex ? 'checked' : ''}> .*</label><input class="input" data-search="include" placeholder="Fichiers : *.js, *.css" value="${esc(q.include)}"></div>
        <div class="dk-search-res">${q.results.length ? `<p class="bl-hint">${q.results.reduce((a, r) => a + r.hits.length, 0)} résultat(s) dans ${q.results.length} fichier(s)</p>` : q.query ? '<p class="bl-hint">Aucun résultat.</p>' : ''}
        ${q.results.map((r) => `<div class="dk-sr"><b data-open-file="${esc(r.file)}">${esc(r.rel)}</b>${r.hits.map((h) => `<button data-open-file="${esc(r.file)}" data-line="${h.line}" data-col="${h.col}"><em>${h.line}</em>${esc(h.text.trim())}</button>`).join('')}</div>`).join('')}</div>
      </div>`;
    const input = $('[data-search="query"]', this.$.side);
    const run = async () => {
      for (const k of ['caseSensitive', 'regex']) q[k] = $(`[data-search="${k}"]`, this.$.side).checked;
      q.include = $('[data-search="include"]', this.$.side).value;
      q.query = input.value;
      if (!q.query.trim()) { q.results = []; this.renderSearch(); return; }
      try { q.results = await api.invoke('dev:search', { query: q.query, opts: { regex: q.regex, caseSensitive: q.caseSensitive, include: q.include } }); } catch (e) { toast(e.message, { kind: 'bad' }); }
      this.renderSearch();
      const i = $('[data-search="query"]', this.$.side);
      i.focus();
      i.setSelectionRange(i.value.length, i.value.length);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    for (const x of $$('[data-search]:not([data-search="query"])', this.$.side)) x.addEventListener('change', run);
    if (!q.query) input.focus();
  }

  // ------------------------------------------------------------------ éditeur
  ensureEditor() {
    if (this.editor) return Promise.resolve(this.editor);
    if (!this.editorPromise) this.editorPromise = this.createEditor().finally(() => { this.editorPromise = null; });
    return this.editorPromise;
  }

  async createEditor() {
    const monaco = await loadMonaco();
    this.monaco = monaco;
    const ext = await applyExtensions(monaco);
    this.extThemes = ext.themes;
    this.editor = monaco.editor.create(this.$.monacoBox, {
      theme: resolveTheme(this.ed, this.extThemes), automaticLayout: false, smoothScrolling: true, guides: { bracketPairs: true, indentation: true }, scrollBeyondLastLine: false, padding: { top: 8 }, linkedEditing: true, formatOnPaste: false, mouseWheelZoom: true, 'semanticHighlighting.enabled': true, suggest: { preview: true }, inlayHints: { enabled: 'on' },
      ...editorOptions(this.ed),
    });
    const K = monaco.KeyMod;
    const C = monaco.KeyCode;
    this.editor.addCommand(K.CtrlCmd | C.KeyS, () => this.saveFile(this.active));
    this.editor.addCommand(K.CtrlCmd | C.KeyP, () => this.quickOpen());
    this.editor.addCommand(K.Alt | C.KeyZ, () => this.toggleWrap());
    this.editor.addCommand(K.CtrlCmd | K.Shift | C.KeyP, () => this.palette());
    this.editor.addCommand(K.Shift | K.Alt | C.KeyF, () => this.format());
    // Commandes de NEXORA dans la palette (F1 ou Ctrl+Maj+P), comme dans VS Code.
    const act = (id, label, run, keys) => this.editor.addAction({
      id: `vitrine.${id}`, label: `NEX : ${label}`, keybindings: keys, run,
    });
    act('save-all', 'Tout enregistrer', () => this.saveAll(), [K.CtrlCmd | K.Shift | C.KeyS]);
    act('format', 'Mettre en forme le document (Prettier)', () => this.format());
    act('run', 'Lancer ou arrêter le projet', () => $('[data-act="run"]', this.el).click());
    act('terminal', 'Afficher ou masquer le terminal', () => $('[data-act="toggle-bottom"]', this.el).click());
    act('preview', "Afficher ou masquer l'aperçu", () => $('[data-act="toggle-preview"]', this.el).click());
    act('search', 'Rechercher dans le projet', () => this.setSide('search'));
    act('git', 'Ouvrir Git', () => this.setSide('git'));
    act('ext', 'Extensions', () => this.setSide('ext'));
    act('settings', "Réglages de l'éditeur", () => this.editorSettings());
    act('vscode', 'Ouvrir le projet dans Code Editor', () => this.setMode('vscode'));
    act('wrap', 'Retour à la ligne automatique', () => this.toggleWrap());
    act('minimap', 'Afficher ou masquer la minimap', () => { this.ed.minimap = !this.ed.minimap; this.applyEditorSettings(); });
    const ai = (label) => import('../core/ai.js').then((m) => m.runAiAction(label));
    for (const [id, label, l2] of [['ai-explain', 'IA : expliquer le code', 'Expliquer'], ['ai-fix', 'IA : corriger le code', 'Corriger'], ['ai-optimize', 'IA : optimiser le code', 'Optimiser'], ['ai-comment', 'IA : commenter le code', 'Commenter'], ['ai-tests', 'IA : écrire des tests', 'Tests']]) {
      this.editor.addAction({
        id: `vitrine.${id}`, label: `NEX-IA ${label}`, contextMenuGroupId: '0_ia', run: () => ai(l2),
      });
    }
    act('ai', 'Assistant IA', () => import('../core/ai.js').then((m) => m.toggleAssistant(true)));
    this.editor.addAction({
      id: 'vitrine.ai-complete', label: 'NEX-IA : compléter le code ici', contextMenuGroupId: '0_ia', keybindings: [K.CtrlCmd | K.Alt | C.KeyI], run: () => import('../core/ai.js').then((m) => m.completeHere()),
    });
    this.editor.addAction({
      id: 'vitrine.ai-ask', label: 'NEX-IA : modifier avec une consigne…', contextMenuGroupId: '0_ia', keybindings: [K.CtrlCmd | K.Alt | C.KeyK], run: () => import('../core/ai.js').then((m) => m.editWithInstruction()),
    });
    act('zoom-in', "Agrandir le texte de l'éditeur", () => { this.ed.fontSize = Math.min(30, this.ed.fontSize + 1); this.applyEditorSettings(); }, [K.CtrlCmd | C.Equal]);
    act('zoom-out', "Réduire le texte de l'éditeur", () => { this.ed.fontSize = Math.max(9, this.ed.fontSize - 1); this.applyEditorSettings(); }, [K.CtrlCmd | C.Minus]);
    this.editor.onDidChangeCursorPosition((e) => { $('.dk-st-pos', this.el).textContent = `Ligne ${e.position.lineNumber}, colonne ${e.position.column}`; });
    this.editor.onDidBlurEditorText(() => { if (this.st.autoSave && this.active) this.saveFile(this.active, { quiet: true }); });
    this.layoutEditor();
    return this.editor;
  }

  palette() {
    if (!this.editor) return;
    this.editor.focus();
    this.editor.trigger('vitrine', 'editor.action.quickCommand', null);
  }

  async format() {
    if (!this.editor) return;
    await formatModel(this.editor, this.monaco, { root: this.st.root, ed: this.ed });
  }

  async reloadExtensions() {
    if (!this.monaco) return null;
    const r = await applyExtensions(this.monaco);
    this.extThemes = r.themes;
    this.applyEditorSettings();
    return r;
  }

  applyEditorSettings() {
    this.st.editor = this.ed;
    this.st.fontSize = this.ed.fontSize;
    this.st.wrap = this.ed.wrap;
    this.st.minimap = this.ed.minimap;
    this.save();
    if (!this.monaco) return;
    this.monaco.editor.setTheme(resolveTheme(this.ed, this.extThemes));
    if (this.editor) this.editor.updateOptions(editorOptions(this.ed));
    for (const m of this.monaco.editor.getModels()) m.updateOptions({ tabSize: this.ed.tabSize, insertSpaces: this.ed.insertSpaces });
  }

  // Réglages de l'éditeur : thème (dont ceux des extensions), police, indentation, affichage.
  async editorSettings() {
    await this.ensureEditor();
    const ed = this.ed;
    const themes = {
      auto: 'NEXORA (suit le thème de l’app)', 'vitrine-light': 'NEXORA clair', 'vitrine-dark': 'NEXORA sombre', vs: 'Visual Studio clair', 'vs-dark': 'Visual Studio sombre', 'hc-black': 'Contraste élevé sombre', 'hc-light': 'Contraste élevé clair',
    };
    for (const t of this.extThemes) themes[t.id] = `${t.label} (extension)`;
    const sel = (k, map) => `<select class="input" data-ed="${k}">${Object.entries(map).map(([v, l]) => `<option value="${esc(v)}" ${String(ed[k]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const num = (k, min, max) => `<input class="input" type="number" min="${min}" max="${max}" data-ed="${k}" value="${esc(ed[k])}">`;
    const chk = (k, label) => `<label class="check-row"><input type="checkbox" data-ed="${k}" ${ed[k] ? 'checked' : ''}><span class="box"></span><span>${label}</span></label>`;
    const sheet = openSheet('dev-editor', `
      <div class="sheet-head"><span class="sheet-icon">${icon('wrench', 22)}</span><div><h2>Réglages de l'éditeur</h2><p>Les thèmes et extraits de code des extensions installées apparaissent ici.</p></div></div>
      <div class="sheet-body dk-edset">
        <label class="field"><span>Thème</span>${sel('theme', themes)}</label>
        <div class="dk-edgrid">
          <label class="field"><span>Police</span>${sel('fontFamily', FONTS)}</label>
          <label class="field"><span>Taille</span>${num('fontSize', 9, 30)}</label>
          <label class="field"><span>Indentation</span>${num('tabSize', 1, 8)}</label>
          <label class="field"><span>Repères verticaux (ex. 80, 120)</span><input class="input" data-ed="rulers" value="${esc(ed.rulers)}" placeholder="aucun"></label>
          <label class="field"><span>Curseur</span>${sel('cursor', { line: 'Barre', block: 'Bloc', underline: 'Souligné', 'line-thin': 'Barre fine' })}</label>
          <label class="field"><span>Clignotement</span>${sel('blinking', {
    smooth: 'Doux', blink: 'Classique', phase: 'Fondu', expand: 'Étirement', solid: 'Fixe',
  })}</label>
          <label class="field"><span>Espaces visibles</span>${sel('whitespace', {
    none: 'Jamais', selection: 'Dans la sélection', boundary: 'En début et fin', all: 'Toujours',
  })}</label>
          <label class="field"><span>Numéros de ligne</span>${sel('lineNumbers', { on: 'Affichés', relative: 'Relatifs', off: 'Masqués' })}</label>
        </div>
        ${chk('insertSpaces', 'Indenter avec des espaces (sinon tabulations)')}
        ${chk('ligatures', 'Ligatures de la police (=>, !==…)')}
        ${chk('wrap', 'Retour à la ligne automatique')}
        ${chk('minimap', 'Minimap')}
        ${chk('stickyScroll', 'En-têtes collants (fonction, classe en cours)')}
        ${chk('bracketColors', 'Parenthèses colorées par niveau')}
        ${chk('smoothCaret', 'Curseur animé')}
        ${chk('prettier', 'Mettre en forme avec Prettier (JS, TS, CSS, HTML, JSON, Markdown, YAML)')}
        ${chk('formatOnSave', 'Mettre en forme à chaque enregistrement')}
      </div>
      <div class="sheet-foot"><button class="btn" data-x="ext">${icon('shapes', 14)}<span>Extensions…</span></button><span class="grow"></span><button class="btn primary" data-sheet="close">Terminé</button></div>`, { wide: true });
    sheet.onchange = (e) => {
      const t = e.target.closest('[data-ed]');
      if (!t) return;
      const k = t.dataset.ed;
      ed[k] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Number(t.value) : t.value;
      this.applyEditorSettings();
    };
    sheet.onclick = (e) => { if (e.target.closest('[data-x="ext"]')) { closeSheet('dev-editor'); this.setSide('ext'); } };
  }

  // ------------------------------------------------------------------ mode VS Code
  async setMode(mode, { quiet = false } = {}) {
    for (const b of $$('button[data-mode]', this.el)) b.classList.toggle('on', b.dataset.mode === mode);
    if (mode !== 'vscode') {
      this.st.mode = 'vitrine';
      this.save();
      this.el.querySelector('.dk').classList.remove('vscode');
      this.$.vscode.hidden = true;
      this.layoutEditor();
      return;
    }
    const ok = await this.ensureVsCode({ quiet });
    if (!ok) { for (const b of $$('button[data-mode]', this.el)) b.classList.toggle('on', b.dataset.mode === 'vitrine'); return; }
    this.st.mode = 'vscode';
    this.save();
    if (this.st.autoSave) await this.saveAll();
    this.el.querySelector('.dk').classList.add('vscode');
    this.$.vscode.hidden = false;
    const r = await api.invoke('dev:vscode-start', { dir: this.st.root });
    if (r.error) {
      this.$.vscode.innerHTML = `<div class="dk-vs-msg"><span class="sheet-icon warn">${icon('warn', 22)}</span><h3>Code Editor n'a pas démarré</h3><pre>${esc(r.error)}</pre><button class="btn" data-mode="vitrine">Revenir à l'éditeur</button></div>`;
      return;
    }
    const want = r.url;
    let wv = this.$.vscode.querySelector('webview');
    if (!wv) {
      this.$.vscode.innerHTML = '<webview partition="persist:vscode" allowpopups></webview><div class="dk-vs-loading"><div class="spinner"></div><b>Démarrage de Code Editor…</b><small>La première fois, Code Editor télécharge son serveur (≈ 60 Mo). Les fois suivantes, il s’ouvre en quelques secondes.</small></div>';
      wv = this.$.vscode.querySelector('webview');
      wv.addEventListener('did-finish-load', () => { const l = this.$.vscode.querySelector('.dk-vs-loading'); if (l) l.remove(); });
      // Filigrane de l'éditeur vide : le monogramme VD de NEXORA.
      wv.addEventListener('dom-ready', () => { wv.insertCSS(VD_WATERMARK).catch(() => {}); });
      wv.src = want;
      this.vsUrl = want;
    } else if (this.vsUrl !== want) { this.vsUrl = want; wv.loadURL(want); }
  }

  // Vérifie que VS Code est disponible (installé ou téléchargé) et que sa licence est acceptée.
  async ensureVsCode({ quiet } = {}) {
    let st = await api.invoke('dev:vscode-status');
    if (st.cli && st.accepted) return true;
    if (quiet && !st.cli) return false;
    return new Promise((resolve) => {
      const sheet = openSheet('vscode', `
        <div class="sheet-head"><span class="sheet-icon">${icon('layers', 22)}</span><div><h2>Code Editor</h2><p>L'éditeur complet du Dev Lab, sur ton projet, avec le Marketplace d'extensions, le terminal, le débogueur et Git. Il repose sur la version web officielle de Visual Studio Code (Microsoft).</p></div></div>
        <div class="sheet-body">
          ${st.installed ? `<p class="dk-vs-found">${icon('check', 14)} Visual Studio Code est installé sur ce PC : Code Editor utilise son outil <code>code-tunnel</code>.</p>` : '<p>NEXORA télécharge l’outil officiel de Microsoft (≈ 15 Mo), une seule fois. Au premier lancement, Code Editor télécharge aussi son serveur (≈ 60 Mo).</p>'}
          <p class="pop-note">Code Editor tourne sur ce PC uniquement (adresse 127.0.0.1, protégée par un jeton secret). En continuant, tu acceptes les <button class="link-btn" data-external="https://aka.ms/vscode-server-license">conditions de licence du serveur VS Code</button> et la <button class="link-btn" data-external="https://privacy.microsoft.com/fr-fr/privacystatement">déclaration de confidentialité de Microsoft</button>. La télémétrie est désactivée.</p>
          <div class="dk-vs-prog" hidden><div class="st-prog"><i></i></div><small data-vs-msg></small></div>
        </div>
        <div class="sheet-foot"><span class="grow"></span><button class="btn" data-x="cancel">Annuler</button><button class="btn primary" data-x="ok">${st.cli ? 'Accepter et ouvrir' : 'Télécharger et ouvrir'}</button></div>`, { onClose: () => resolve(false) });
      sheet.onclick = async (e) => {
        const ext = e.target.closest('[data-external]');
        if (ext) { api.invoke('shell:external', ext.dataset.external); return; }
        const b = e.target.closest('[data-x]');
        if (!b) return;
        if (b.dataset.x === 'cancel') { closeSheet('vscode'); resolve(false); return; }
        b.disabled = true;
        await api.invoke('dev:vscode-accept');
        if (!st.cli) {
          sheet.querySelector('.dk-vs-prog').hidden = false;
          this.vsProgress = sheet;
          const r = await api.invoke('dev:vscode-download');
          this.vsProgress = null;
          if (r.error) { toast(r.error, { kind: 'bad' }); b.disabled = false; return; }
          st = r;
        }
        const keep = sheet; void keep;
        closeSheet('vscode');
        resolve(true);
      };
    });
  }

  onVsCodeEvent(m) {
    const sh = this.vsProgress;
    if (!sh) return;
    const bar = sh.querySelector('.st-prog i');
    const msg = sh.querySelector('[data-vs-msg]');
    if (m.phase === 'download') { if (bar) bar.style.width = `${Math.round(m.progress * 100)}%`; if (msg) msg.textContent = `Téléchargement de Code Editor… ${Math.round(m.progress * 100)} %`; }
    if (m.phase === 'extract' && msg) msg.textContent = 'Installation…';
  }

  layoutEditor() {
    if (!this.editor && !this.diff) return;
    const r = this.$.monacoBox.getBoundingClientRect();
    if (r.width && r.height) (this.diff || this.editor).layout({ width: r.width, height: r.height });
  }

  async openFile(file, { line, col, silent } = {}) {
    if (!this.files.has(file)) {
      const r = await api.invoke('dev:read', { file });
      if (r.binary || r.tooBig) {
        if (/\.(png|jpe?g|gif|webp|svg|avif|ico|bmp)$/i.test(file)) { this.showImage(file, r); return; }
        if (!silent) toast(r.tooBig ? 'Fichier trop volumineux pour l’éditeur.' : 'Fichier binaire : ouvert avec l’application du système.', { action: 'Ouvrir', onAction: () => api.invoke('dev:open-external', file) });
        return;
      }
      const monaco = (await this.ensureEditor()) && this.monaco;
      const uri = monaco.Uri.file(file);
      let model = monaco.editor.getModel(uri);
      if (model) model.setValue(r.text); else model = monaco.editor.createModel(r.text, undefined, uri);
      const entry = {
        model, view: null, saved: model.getAlternativeVersionId(), eol: r.eol, bom: r.bom, mtime: r.mtime,
      };
      model.onDidChangeContent(() => {
        this.renderTabs();
        if (this.st.autoSave) { clearTimeout(entry.timer); entry.timer = setTimeout(() => this.saveFile(file, { quiet: true }), 1200); }
      });
      this.files.set(file, entry);
      this.order.push(file);
    }
    if (!this.st.open.includes(file)) { this.st.open.push(file); this.save(); }
    if (!silent || !this.active) this.activate(file);
    if (line) {
      this.editor.revealLineInCenter(line);
      this.editor.setPosition({ lineNumber: line, column: col || 1 });
      this.editor.focus();
    }
  }

  async showImage(file, r) {
    this.closeDiff();
    this.$.welcome.hidden = false;
    const src = await api.invoke('dev:image', { file }).catch(() => '');
    this.$.welcome.innerHTML = `<div class="dk-img">${src ? `<img src="${src}" alt="">` : '<p>Aperçu indisponible</p>'}<p>${esc(base(file))} · ${Math.round(r.size / 1024)} Ko</p><button class="btn small" data-act="open-ext" data-file="${esc(file)}">Ouvrir avec l’application du système</button></div>`;
  }

  activate(file) {
    const entry = this.files.get(file);
    if (!entry || !this.editor) return;
    this.closeDiff();
    if (this.active && this.files.has(this.active)) this.files.get(this.active).view = this.editor.saveViewState();
    this.active = file;
    this.st.active = file;
    this.save();
    this.editor.setModel(entry.model);
    if (entry.view) this.editor.restoreViewState(entry.view);
    this.editor.focus();
    this.$.welcome.hidden = true;
    this.renderTabs();
    for (const r of $$('.dk-row', this.el)) r.classList.toggle('on', r.dataset.path === file);
    const lang = entry.model.getLanguageId();
    $('.dk-st-lang', this.el).textContent = { javascript: 'JavaScript', typescript: 'TypeScript', html: 'HTML', css: 'CSS', scss: 'SCSS', json: 'JSON', markdown: 'Markdown', python: 'Python', php: 'PHP', dart: 'Dart', plaintext: 'Texte' }[lang] || lang;
    $('.dk-st-eol', this.el).textContent = entry.eol === 'crlf' ? 'CRLF' : 'LF';
    this.layoutEditor();
  }

  dirty(file) {
    const e = this.files.get(file);
    return Boolean(e && e.model.getAlternativeVersionId() !== e.saved);
  }

  renderTabs() {
    this.$.tabs.innerHTML = this.order.map((f) => `<div class="dk-tab ${f === this.active ? 'on' : ''} ${this.dirty(f) ? 'dirty' : ''}" data-tab="${esc(f)}" title="${esc(f)}"><i class="dk-dot" style="--c:${EXT_COLORS[extOf(f)] || '#a1a1a6'}"></i><span>${esc(base(f))}</span><button data-close="${esc(f)}" aria-label="Fermer">${icon('close', 11)}</button></div>`).join('')
      + (this.active ? `<span class="dk-tabs-sp"></span><button class="icon-btn small" data-act="format" title="Mettre en forme le code (Maj+Alt+F)">${icon('sparkle', 13)}</button><button class="icon-btn small" data-act="wrap" title="Retour à la ligne (Alt+Z)">${icon('text', 13)}</button>` : '');
  }

  async saveFile(file, { quiet } = {}) {
    const e = this.files.get(file);
    if (!e || !this.dirty(file)) return;
    clearTimeout(e.timer);
    // Mise en forme à l'enregistrement (manuel seulement : l'enregistrement automatique ne reformate pas pendant la frappe).
    if (this.ed.formatOnSave && !quiet && file === this.active && this.editor) await this.format();
    const version = e.model.getAlternativeVersionId();
    try {
      const r = await api.invoke('dev:write', {
        file, text: e.model.getValue(), eol: e.eol, bom: e.bom,
      });
      e.saved = version;
      e.mtime = r.mtime;
      e.selfWrite = Date.now();
      this.renderTabs();
      if (!quiet) toast('Enregistré.');
      this.git.refreshSoon();
    } catch (err) { toast(`Enregistrement impossible : ${err.message}`, { kind: 'bad' }); }
  }

  async saveAll() {
    for (const f of this.order) if (this.dirty(f)) await this.saveFile(f, { quiet: true });
  }

  async closeFile(file) {
    if (this.dirty(file)) {
      if (this.st.autoSave) await this.saveFile(file, { quiet: true });
      else if (!window.confirm(`Enregistrer les modifications de ${base(file)} avant de fermer ?`)) { /* fermeture sans enregistrer */ } else await this.saveFile(file, { quiet: true });
    }
    const e = this.files.get(file);
    if (e) e.model.dispose();
    this.files.delete(file);
    this.order = this.order.filter((f) => f !== file);
    this.st.open = this.st.open.filter((f) => f !== file);
    if (this.active === file) {
      this.active = null;
      const next = this.order[this.order.length - 1];
      if (next) this.activate(next);
      else { if (this.editor) this.editor.setModel(null); this.renderWelcome(); this.$.welcome.hidden = false; }
    }
    this.save();
    this.renderTabs();
  }

  async closeAll() {
    await this.saveAll();
    for (const f of [...this.order]) await this.closeFile(f);
    return true;
  }

  toggleWrap() {
    this.ed.wrap = !this.ed.wrap;
    this.applyEditorSettings();
  }

  async showDiff(file) {
    const old = await api.invoke('git:head', { dir: this.st.root, file });
    await this.openFile(file);
    const monaco = this.monaco;
    const entry = this.files.get(file);
    if (!entry) return;
    this.closeDiff();
    this.$.monacoBox.style.visibility = 'hidden';
    const box = document.createElement('div');
    box.className = 'dk-diff';
    $('.dk-editor', this.el).append(box);
    this.diffBox = box;
    this.diff = monaco.editor.createDiffEditor(box, { theme: resolveTheme(this.ed, this.extThemes), renderSideBySide: true, automaticLayout: true, readOnly: false, originalEditable: false, ...editorOptions(this.ed) });
    this.diffOrig = monaco.editor.createModel(old ?? '', entry.model.getLanguageId());
    this.diff.setModel({ original: this.diffOrig, modified: entry.model });
    this.$.diffbar.hidden = false;
    this.$.diffbar.innerHTML = `<span>${icon('sync', 13)} ${esc(base(file))} : dernière version validée ↔ version actuelle</span><button class="btn small" data-act="close-diff">Fermer la comparaison</button>`;
  }

  // Proposition de l'IA : comparaison « fichier actuel ↔ proposition », à appliquer ou refuser.
  // Le fichier est créé s'il n'existe pas ; « Appliquer » passe par l'historique (Ctrl+Z annule).
  async proposeEdit(file, text, { label = "Proposition de l'IA" } = {}) {
    const root = this.st.root;
    if (!root) throw new Error('Ouvre d’abord un projet.');
    const sep = root.includes('\\') ? '\\' : '/';
    let abs = file;
    if (!/^([a-zA-Z]:[\\/]|\/)/.test(abs)) abs = `${root}${sep}${file.replace(/^\.?[\\/]/, '').replace(/[\\/]/g, sep)}`;
    let created = false;
    try { await api.invoke('dev:read', { file: abs }); } catch {
      await api.invoke('dev:create', { file: abs });
      created = true;
    }
    await this.openFile(abs);
    const entry = this.files.get(abs);
    if (!entry) throw new Error('Fichier impossible à ouvrir.');
    const monaco = this.monaco;
    this.closeDiff();
    this.$.monacoBox.style.visibility = 'hidden';
    const box = document.createElement('div');
    box.className = 'dk-diff';
    $('.dk-editor', this.el).append(box);
    this.diffBox = box;
    this.diff = monaco.editor.createDiffEditor(box, { theme: resolveTheme(this.ed, this.extThemes), renderSideBySide: box.clientWidth > 760, automaticLayout: true, readOnly: false, originalEditable: false, ...editorOptions(this.ed) });
    this.diffOrig = monaco.editor.createModel(entry.model.getValue(), entry.model.getLanguageId());
    const proposal = monaco.editor.createModel(text, entry.model.getLanguageId());
    this.diffProposal = proposal;
    this.diff.setModel({ original: this.diffOrig, modified: proposal });
    this.$.diffbar.hidden = false;
    this.$.diffbar.innerHTML = `<span>${icon('sparkle', 13)} ${esc(label)} · ${esc(base(abs))}${created ? ' (nouveau fichier)' : ''} : à gauche l’actuel, à droite la proposition (modifiable)</span><span class="grow"></span><button class="btn small" data-ai-diff="reject">Refuser</button><button class="btn small primary" data-ai-diff="apply">${icon('check', 13)}<span>Appliquer</span></button>`;
    this.$.diffbar.onclick = (e) => {
      const b = e.target.closest('[data-ai-diff]');
      if (!b) return;
      const val = proposal.getValue();
      this.$.diffbar.onclick = null;
      this.closeDiff();
      if (b.dataset.aiDiff === 'apply') {
        const ed = this.editor;
        ed.pushUndoStop();
        entry.model.pushEditOperations([], [{ range: entry.model.getFullModelRange(), text: val }], () => null);
        ed.pushUndoStop();
        this.saveFile(abs, { quiet: true });
        toast('Modifications appliquées et enregistrées (Ctrl+Z pour annuler).');
      } else toast('Proposition refusée : le fichier n’a pas changé.');
    };
    return abs;
  }

  closeDiff() {
    // La comparaison disparaît tout de suite ; l'éditeur de comparaison est libéré un peu plus tard
    // (Monaco finit d'initialiser certaines parties après sa création).
    const prop = this.diffProposal; this.diffProposal = null;
    if (!this.diff) { if (prop) setTimeout(() => prop.dispose(), 800); return; }
    const d = this.diff; const o = this.diffOrig; const box = this.diffBox;
    this.diff = null; this.diffOrig = null; this.diffBox = null;
    box.remove();
    setTimeout(() => {
      try { d.setModel(null); } catch { /* déjà vidé */ }
      try { d.dispose(); } catch { /* déjà libéré */ }
      if (o) o.dispose();
      if (prop) prop.dispose();
    }, 800);
    this.$.monacoBox.style.visibility = '';
    this.$.diffbar.hidden = true;
    this.layoutEditor();
  }

  async quickOpen() {
    if (!this.st.root) return;
    if (!this.allFiles) this.allFiles = await api.invoke('dev:all-files');
    const sheet = openSheet('quickopen', `<div class="dk-qo"><input class="input" placeholder="Nom du fichier" data-autofocus spellcheck="false"><div class="dk-qo-list"></div></div>`, { wide: true });
    const input = $('input', sheet);
    const list = $('.dk-qo-list', sheet);
    let sel = 0;
    let shown = [];
    const score = (f, q) => {
      const name = base(f).toLowerCase();
      if (name.startsWith(q)) return 3;
      if (name.includes(q)) return 2;
      let i = 0;
      for (const c of f.toLowerCase()) if (c === q[i]) i += 1;
      return i === q.length ? 1 : 0;
    };
    const paint = () => {
      const q = input.value.trim().toLowerCase();
      shown = (q ? this.allFiles.map((f) => [f, score(f, q)]).filter((x) => x[1]).sort((a, b) => b[1] - a[1] || a[0].length - b[0].length).map((x) => x[0]) : this.allFiles.slice(0, 200)).slice(0, 80);
      sel = Math.min(sel, shown.length - 1);
      list.innerHTML = shown.map((f, i) => `<button class="${i === sel ? 'on' : ''}" data-qo="${esc(f)}"><i class="dk-dot" style="--c:${EXT_COLORS[extOf(f)] || '#a1a1a6'}"></i><b>${esc(base(f))}</b><small>${esc(f)}</small></button>`).join('');
    };
    const go = (rel) => { closeSheet('quickopen'); this.openFile(join(this.st.root, rel)); };
    input.addEventListener('input', () => { sel = 0; paint(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(shown.length - 1, sel + 1); paint(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); paint(); e.preventDefault(); }
      if (e.key === 'Enter' && shown[sel]) go(shown[sel]);
    });
    list.addEventListener('click', (e) => { const b = e.target.closest('[data-qo]'); if (b) go(b.dataset.qo); });
    paint();
  }

  // ------------------------------------------------------------------ fichiers : actions
  async promptName(title, value = '') {
    return new Promise((resolve) => {
      const sheet = openSheet('devname', `<div class="sheet-head"><div><h2>${esc(title)}</h2></div></div><div class="sheet-body dk-namebody"><input class="input" value="${esc(value)}" data-autofocus spellcheck="false"></div><div class="sheet-foot"><span style="flex:1"></span><button class="btn" data-x="0">Annuler</button><button class="btn primary" data-x="1">OK</button></div>`, { onClose: () => resolve(null) });
      const input = $('input', sheet);
      input.focus();
      const dot = value.lastIndexOf('.');
      input.setSelectionRange(0, dot > 0 ? dot : value.length);
      const done = (ok) => { const v = input.value.trim(); closeSheet('devname'); resolve(ok && v ? v : null); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
      sheet.onclick = (e) => { const b = e.target.closest('[data-x]'); if (b) done(b.dataset.x === '1'); };
    });
  }

  targetDir(p) {
    if (!p) return this.st.root;
    const rows = this.tree.get(dirOf(p)) || [];
    const it = rows.find((x) => x.path === p);
    return it && it.dir ? p : dirOf(p);
  }

  async newEntry(isDir, at) {
    const dir = this.targetDir(at);
    const name = await this.promptName(isDir ? 'Nouveau dossier' : 'Nouveau fichier', isDir ? 'dossier' : 'nouveau.html');
    if (!name) return;
    try {
      const p = await api.invoke('dev:create', { file: join(dir, name), dir: isDir });
      this.expanded.add(dir);
      await this.loadDir(dir);
      this.renderSide();
      if (!isDir) this.openFile(p);
    } catch (e) { toast(e.message, { kind: 'bad' }); }
  }

  async renameEntry(p) {
    const name = await this.promptName('Renommer', base(p));
    if (!name || name === base(p)) return;
    try {
      const to = await api.invoke('dev:rename', { from: p, to: join(dirOf(p), name) });
      if (this.files.has(p)) { await this.closeFile(p); this.openFile(to); }
      await this.loadDir(dirOf(p));
      this.renderSide();
    } catch (e) { toast(e.message, { kind: 'bad' }); }
  }

  async trashEntry(p) {
    if (!window.confirm(`Mettre « ${base(p)} » à la corbeille ?`)) return;
    try {
      await api.invoke('dev:trash', { file: p });
      for (const f of [...this.order]) if (f === p || f.startsWith(p + sep())) await this.closeFile(f);
      await this.loadDir(dirOf(p));
      this.renderSide();
    } catch (e) { toast(e.message, { kind: 'bad' }); }
  }

  onContext(e) {
    const row = e.target.closest('.dk-row');
    if (!row) return;
    e.preventDefault();
    const p = row.dataset.path;
    const menu = $('#popover');
    menu.innerHTML = `<div class="dk-menu">
      <button data-m="file">${icon('file', 13)}Nouveau fichier</button><button data-m="folder">${icon('folder', 13)}Nouveau dossier</button><hr>
      <button data-m="rename">${icon('text', 13)}Renommer</button><button data-m="trash">${icon('trash', 13)}Mettre à la corbeille</button><hr>
      <button data-m="copy">${icon('copy', 13)}Copier le chemin</button><button data-m="reveal">${icon('folderOpen', 13)}Afficher dans l’explorateur</button>
      ${row.dataset.dir ? `<button data-m="term">${icon('terminal', 13)}Ouvrir un terminal ici</button>` : ''}</div>`;
    menu.style.width = '230px';
    menu.hidden = false;
    menu.style.left = `${Math.min(window.innerWidth - 240, e.clientX)}px`;
    menu.style.top = `${Math.min(window.innerHeight - menu.offsetHeight - 8, e.clientY)}px`;
    const close = () => { menu.hidden = true; document.removeEventListener('mousedown', outside, true); };
    const outside = (ev) => { if (!menu.contains(ev.target)) close(); };
    setTimeout(() => document.addEventListener('mousedown', outside, true));
    menu.onclick = (ev) => {
      const b = ev.target.closest('[data-m]');
      if (!b) return;
      close();
      ({
        file: () => this.newEntry(false, p), folder: () => this.newEntry(true, p), rename: () => this.renameEntry(p), trash: () => this.trashEntry(p), copy: () => api.invoke('clipboard:write', p), reveal: () => api.invoke('dev:reveal', p), term: () => this.terminal.open(p),
      })[b.dataset.m]();
    };
  }

  async onDrop(e) {
    const tree = e.target.closest('.dk-tree');
    if (!tree || !this.st.root) return;
    e.preventDefault();
    const row = e.target.closest('.dk-row');
    const dest = row ? this.targetDir(row.dataset.path) : this.st.root;
    const sources = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
    if (!sources.length) return;
    try {
      await api.invoke('dev:copy-in', { sources, dest });
      await this.loadDir(dest);
      this.expanded.add(dest);
      this.renderSide();
      toast(`${sources.length} élément(s) ajouté(s).`);
    } catch (err) { toast(err.message, { kind: 'bad' }); }
  }

  async onFsChange(m) {
    if (m.root !== this.st.root) return;
    const dirs = new Set(m.files.map(dirOf));
    for (const d of dirs) if (this.tree.has(d)) await this.loadDir(d).catch(() => this.tree.delete(d));
    this.allFiles = null;
    if (this.st.side === 'files') this.renderSide();
    // Fichier ouvert modifié par un autre programme : rechargé s'il n'a pas de modifications en cours.
    for (const f of m.files) {
      const e = this.files.get(f);
      if (!e || this.dirty(f) || (e.selfWrite && Date.now() - e.selfWrite < 1500)) continue;
      const r = await api.invoke('dev:read', { file: f }).catch(() => null);
      if (r && r.text != null && r.text !== e.model.getValue()) {
        e.model.setValue(r.text);
        e.saved = e.model.getAlternativeVersionId();
        this.renderTabs();
      }
    }
    this.git.refreshSoon();
  }

  // ------------------------------------------------------------------ actions
  async onClick(e) {
    const side = e.target.closest('[data-side]');
    if (side) { this.setSide(side.dataset.side); return; }
    const row = e.target.closest('.dk-row');
    if (row && !e.target.closest('button')) {
      const p = row.dataset.path;
      if (row.dataset.dir) {
        if (this.expanded.has(p)) this.expanded.delete(p);
        else { this.expanded.add(p); if (!this.tree.has(p)) await this.loadDir(p); }
        this.save();
        this.renderFiles();
      } else this.openFile(p);
      return;
    }
    const close = e.target.closest('[data-close]');
    if (close) { e.stopPropagation(); this.closeFile(close.dataset.close); return; }
    const tab = e.target.closest('[data-tab]');
    if (tab) { this.activate(tab.dataset.tab); return; }
    const of = e.target.closest('[data-open-file]');
    if (of) { this.openFile(of.dataset.openFile, { line: Number(of.dataset.line) || undefined, col: Number(of.dataset.col) || undefined }); return; }
    const rec = e.target.closest('[data-recent]');
    if (rec) { this.openFolder(rec.dataset.recent).catch((err) => toast(err.message, { kind: 'bad' })); return; }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    try {
      switch (a.dataset.act) {
        case 'open': { const d = await api.invoke('dev:pick-folder', { title: 'Ouvrir un dossier de projet' }); if (d) await this.openFolder(d); break; }
        case 'new': await this.newProject(); break;
        case 'clone': this.setSide('github'); this.github.showClone(); break;
        case 'recent': this.recentMenu(a); break;
        case 'run': await this.preview.toggleRun(); this.updateRunButton(); break;
        case 'share': this.preview.openShare(a); break;
        case 'publish': this.setSide('github'); this.github.showPublish(); break;
        case 'toggle-bottom': this.st.bottom = !this.st.bottom; this.$.bottom.hidden = !this.st.bottom; a.classList.toggle('on', this.st.bottom); this.save(); this.layoutEditor(); break;
        case 'toggle-preview': this.st.preview = !this.st.preview; this.$.preview.hidden = !this.st.preview; a.classList.toggle('on', this.st.preview); this.save(); this.layoutEditor(); this.preview.layout(); break;
        case 'new-file': this.newEntry(false, this.active); break;
        case 'new-folder': this.newEntry(true, this.active); break;
        case 'refresh': await this.openFolder(this.st.root, { restore: true }); break;
        case 'collapse': this.expanded = new Set([this.st.root]); this.save(); this.renderFiles(); break;
        case 'format': await this.format(); break;
        case 'palette': await this.ensureEditor(); this.palette(); break;
        case 'editor-settings': await this.editorSettings(); break;
        case 'wrap': this.toggleWrap(); break;
        case 'close-diff': this.closeDiff(); break;
        case 'open-ext': api.invoke('dev:open-external', a.dataset.file); break;
        case 'autosave': this.st.autoSave = !this.st.autoSave; this.save(); a.textContent = this.st.autoSave ? 'Enregistrement auto' : 'Enregistrement manuel'; break;
        default: break;
      }
    } catch (err) { toast(err.message, { kind: 'bad' }); }
  }

  recentMenu(anchor) {
    const pop = $('#popover');
    const rec = this.st.recent || [];
    pop.innerHTML = `<div class="dk-menu">${rec.map((r) => `<button data-rec="${esc(r.dir)}">${icon('folder', 13)}<span><b>${esc(r.name)}</b><small>${esc(r.dir)}</small></span></button>`).join('') || '<p class="bl-hint" style="padding:8px">Aucun projet récent.</p>'}</div>`;
    pop.style.width = '320px';
    pop.hidden = false;
    const r = anchor.getBoundingClientRect();
    pop.style.left = `${r.left}px`;
    pop.style.top = `${r.bottom + 6}px`;
    const outside = (ev) => { if (!pop.contains(ev.target)) { pop.hidden = true; document.removeEventListener('mousedown', outside, true); } };
    setTimeout(() => document.addEventListener('mousedown', outside, true));
    pop.onclick = (ev) => { const b = ev.target.closest('[data-rec]'); if (b) { pop.hidden = true; this.openFolder(b.dataset.rec).catch((err) => toast(err.message, { kind: 'bad' })); } };
  }

  async newProject() {
    const templates = await api.invoke('dev:templates');
    const sheet = openSheet('devnew', `
      <div class="sheet-head"><span class="sheet-icon">${icon('plus', 22)}</span><div><h2>Nouveau projet</h2><p>Les modèles React, Vue, Svelte, Next.js et Astro sont créés avec leurs outils officiels (Node.js nécessaire).</p></div></div>
      <div class="sheet-body dk-newbody">
        <label class="field"><span>Nom</span><input class="input" data-n="name" value="mon-site" data-autofocus></label>
        <div class="dk-tpls">${templates.map((t, i) => `<label class="dk-tpl"><input type="radio" name="tpl" value="${t.id}" ${i === 0 ? 'checked' : ''}><span>${esc(t.label)}</span></label>`).join('')}</div>
        <div class="ab-pick"><div><b class="dk-parent">${esc(this.st.parent || 'Documents')}</b><small>Dossier parent</small></div><button class="btn small" data-x="parent">Choisir…</button></div>
      </div>
      <div class="sheet-foot"><span style="flex:1"></span><button class="btn" data-x="cancel">Annuler</button><button class="btn primary" data-x="ok">Créer</button></div>`);
    let parent = this.st.parent || null;
    sheet.onclick = async (e) => {
      const b = e.target.closest('[data-x]');
      if (!b) return;
      if (b.dataset.x === 'cancel') { closeSheet('devnew'); return; }
      if (b.dataset.x === 'parent') {
        const d = await api.invoke('dev:pick-folder', { title: 'Dossier parent', create: true });
        if (d) { parent = d; this.st.parent = d; this.save(); $('.dk-parent', sheet).textContent = d; }
        return;
      }
      if (b.dataset.x === 'ok') {
        if (!parent) {
          const d = await api.invoke('dev:pick-folder', { title: 'Dossier parent', create: true });
          if (!d) return;
          parent = d;
          this.st.parent = d;
        }
        const name = $('[data-n="name"]', sheet).value;
        const template = $('input[name="tpl"]:checked', sheet).value;
        try {
          const r = await api.invoke('dev:new-project', { parent, name, template });
          closeSheet('devnew');
          if (r.command) {
            this.st.bottom = true;
            this.$.bottom.hidden = false;
            toast('Création du projet dans le terminal…');
            const id = await this.terminal.open(r.cwd);
            this.terminal.run(id, r.command, { onDone: () => this.openFolder(r.dir).catch(() => {}) });
          } else await this.openFolder(r.dir);
        } catch (err) { toast(err.message, { kind: 'bad' }); }
      }
    };
  }

  onKey(e) {
    if (settings.mode !== 'dev') return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's' && !this.editor?.hasTextFocus()) { e.preventDefault(); if (e.shiftKey) this.saveAll(); else if (this.active) this.saveFile(this.active); }
    if (mod && e.key.toLowerCase() === 'p' && !e.shiftKey && !this.editor?.hasTextFocus()) { e.preventDefault(); this.quickOpen(); }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); this.setSide('search'); }
    if (mod && e.key === '`') { e.preventDefault(); $('[data-act="toggle-bottom"]', this.el).click(); }
    if (this.st.mode === 'vscode') return;
    if (mod && e.shiftKey && e.key.toLowerCase() === 'p' && !this.editor?.hasTextFocus()) { e.preventDefault(); this.ensureEditor().then(() => this.palette()); }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'x') { e.preventDefault(); this.setSide('ext'); }
    if (mod && e.key === ',') { e.preventDefault(); this.editorSettings(); }
  }

  pause() { if (this.st.autoSave) this.saveAll(); }

  resume() { this.layoutEditor(); this.preview.layout(); }
}

export async function openDevLab(el) {
  if (!S.devLab) S.devLab = new DevLab(el);
  else S.devLab.resume();
  return S.devLab;
}
