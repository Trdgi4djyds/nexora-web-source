/* Dev Lab : l'éditeur intégré se rapproche de VS Code — palette de commandes, formatage Prettier,
 * réglages de l'éditeur, thèmes et extraits de code (snippets) des extensions VS Code d'Open VSX. */
import { api } from '../core/api.js';
import { esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast } from '../core/ui.js';
import { isDark } from '../core/theme.js';

export const EDITOR_DEFAULTS = {
  theme: 'auto', fontSize: 13, fontFamily: "'Cascadia Code', 'SF Mono', Consolas, Menlo, monospace", ligatures: true, tabSize: 2, insertSpaces: true, wrap: false, minimap: true, rulers: '', whitespace: 'selection', cursor: 'line', blinking: 'smooth', lineNumbers: 'on', stickyScroll: true, bracketColors: true, formatOnSave: false, prettier: true, lineHeight: 0, smoothCaret: true,
};

export const FONTS = {
  "'Cascadia Code', 'SF Mono', Consolas, Menlo, monospace": 'Cascadia Code',
  "Consolas, 'Courier New', monospace": 'Consolas',
  "'JetBrains Mono', 'Cascadia Code', Consolas, monospace": 'JetBrains Mono (si installée)',
  "'Fira Code', 'Cascadia Code', Consolas, monospace": 'Fira Code (si installée)',
  "'SF Mono', Menlo, monospace": 'SF Mono / Menlo',
};

// ------------------------------------------------------------------ thèmes VS Code → Monaco
// Monaco colore avec ses propres jetons : on traduit les portées TextMate les plus courantes.
const SCOPE_MAP = [
  ['comment', ['comment']],
  ['string.regexp', ['regexp']],
  ['string', ['string', 'attribute.value', 'string.html', 'string.yaml']],
  ['constant.numeric', ['number', 'number.hex', 'number.float']],
  ['constant.language', ['keyword.json', 'constant']],
  ['constant', ['constant']],
  ['keyword.operator', ['operator', 'delimiter']],
  ['storage.type', ['keyword']],
  ['storage', ['keyword']],
  ['keyword', ['keyword', 'keyword.flow', 'keyword.json']],
  ['entity.name.tag', ['tag', 'metatag']],
  ['entity.other.attribute-name', ['attribute.name', 'attribute.name.html']],
  ['entity.name.type', ['type', 'type.identifier']],
  ['entity.name.class', ['type.identifier']],
  ['support.type.property-name', ['attribute.name.css', 'string.key.json', 'key']],
  ['support.type', ['type']],
  ['support.class', ['type.identifier']],
  ['entity.name.function', ['function']],
  ['support.function', ['predefined', 'function']],
  ['variable.other.property', ['variable.property']],
  ['variable.parameter', ['variable.parameter']],
  ['variable', ['variable', 'identifier']],
  ['punctuation', ['delimiter', 'delimiter.bracket']],
  ['markup.heading', ['keyword.md']],
  ['markup.bold', ['strong']],
  ['markup.italic', ['emphasis']],
];

const hex = (c) => {
  if (!c || typeof c !== 'string') return null;
  const m = /^#([0-9a-f]{3,8})$/i.exec(c.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
  return h.slice(0, 6);
};

export function toMonacoTheme(t) {
  const dark = /dark|black/i.test(t.uiTheme || '') || (t.colors && t.colors['editor.background'] && lumOf(t.colors['editor.background']) < 0.4);
  const rules = [];
  const seen = new Set();
  for (const tc of t.tokenColors || []) {
    const st = tc.settings || {};
    const scopes = Array.isArray(tc.scope) ? tc.scope : String(tc.scope || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (!scopes.length) continue;
    for (const sc of scopes) {
      for (const [prefix, toks] of SCOPE_MAP) {
        if (sc === prefix || sc.startsWith(`${prefix}.`) || sc.startsWith(`${prefix} `)) {
          for (const token of toks) {
            if (seen.has(token)) continue;
            seen.add(token);
            const r = { token };
            if (hex(st.foreground)) r.foreground = hex(st.foreground);
            if (st.fontStyle) r.fontStyle = st.fontStyle;
            rules.push(r);
          }
          break;
        }
      }
    }
  }
  const colors = {};
  for (const [k, v] of Object.entries(t.colors || {})) if (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v)) colors[k] = v.length === 4 ? `#${v.slice(1).split('').map((x) => x + x).join('')}` : v;
  const fg = colors['editor.foreground'];
  if (fg) rules.unshift({ token: '', foreground: hex(fg) });
  return { base: dark ? 'vs-dark' : (/hc/i.test(t.uiTheme || '') ? 'hc-black' : 'vs'), inherit: true, rules, colors };
}

function lumOf(c) {
  const h = hex(c);
  if (!h) return 1;
  const n = parseInt(h, 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

const themeId = (ext, label) => `ext-${ext}-${label}`.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();

// ------------------------------------------------------------------ installation dans Monaco
let snippetDisposables = [];

export async function applyExtensions(monaco) {
  let c;
  try { c = await api.invoke('dev:ext-contrib'); } catch { return { themes: [] }; }
  const themes = [];
  for (const t of c.themes || []) {
    try {
      const id = themeId(t.ext, t.label);
      monaco.editor.defineTheme(id, toMonacoTheme(t));
      themes.push({ id, label: t.label, ext: t.ext });
    } catch (e) { console.warn('thème ignoré', t.label, e); }
  }
  for (const d of snippetDisposables) d.dispose();
  snippetDisposables = [];
  const byLang = new Map();
  for (const s of c.snippets || []) {
    const langs = String(s.language || '').split(',').map((x) => x.trim()).filter(Boolean);
    for (const l of langs) {
      if (!byLang.has(l)) byLang.set(l, []);
      for (const [name, sn] of Object.entries(s.items || {})) {
        if (!sn || !sn.body) continue;
        for (const prefix of [].concat(sn.prefix || name)) byLang.get(l).push({ name, prefix, body: [].concat(sn.body).join('\n'), description: sn.description || name, ext: s.ext });
      }
    }
  }
  const alias = { javascriptreact: 'javascript', typescriptreact: 'typescript' };
  for (const [lang, items] of byLang) {
    snippetDisposables.push(monaco.languages.registerCompletionItemProvider(alias[lang] || lang, {
      provideCompletionItems(model, pos) {
        const w = model.getWordUntilPosition(pos);
        const range = { startLineNumber: pos.lineNumber, endLineNumber: pos.lineNumber, startColumn: w.startColumn, endColumn: w.endColumn };
        return {
          suggestions: items.map((it) => ({
            label: it.prefix, kind: monaco.languages.CompletionItemKind.Snippet, documentation: `${it.description} — ${it.ext}`, detail: it.name, insertText: it.body, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range,
          })),
        };
      },
    }));
  }
  for (const l of c.languages || []) {
    try {
      const conf = l.configuration || {};
      const known = monaco.languages.getLanguages().some((x) => x.id === l.id);
      if (!known) continue;
      const cfg = {};
      if (conf.comments) cfg.comments = conf.comments;
      if (Array.isArray(conf.brackets)) cfg.brackets = conf.brackets;
      if (Array.isArray(conf.autoClosingPairs)) cfg.autoClosingPairs = conf.autoClosingPairs.map((p) => (Array.isArray(p) ? { open: p[0], close: p[1] } : p));
      if (Array.isArray(conf.surroundingPairs)) cfg.surroundingPairs = conf.surroundingPairs.map((p) => (Array.isArray(p) ? { open: p[0], close: p[1] } : p));
      snippetDisposables.push(monaco.languages.setLanguageConfiguration(l.id, cfg));
    } catch { /* configuration ignorée */ }
  }
  return { themes, snippets: [...byLang.values()].reduce((a, b) => a + b.length, 0) };
}

export function resolveTheme(ed, extThemes) {
  if (ed.theme === 'auto') return isDark() ? 'vitrine-dark' : 'vitrine-light';
  if (['vitrine-light', 'vitrine-dark', 'vs', 'vs-dark', 'hc-black', 'hc-light'].includes(ed.theme)) return ed.theme;
  return (extThemes || []).some((t) => t.id === ed.theme) ? ed.theme : (isDark() ? 'vitrine-dark' : 'vitrine-light');
}

export function editorOptions(ed) {
  return {
    fontSize: ed.fontSize,
    fontFamily: ed.fontFamily,
    fontLigatures: ed.ligatures,
    lineHeight: ed.lineHeight || 0,
    tabSize: ed.tabSize,
    insertSpaces: ed.insertSpaces,
    wordWrap: ed.wrap ? 'on' : 'off',
    minimap: { enabled: ed.minimap },
    rulers: String(ed.rulers || '').split(/[ ,;]+/).map(Number).filter((n) => n > 0),
    renderWhitespace: ed.whitespace,
    cursorStyle: ed.cursor,
    cursorBlinking: ed.blinking,
    cursorSmoothCaretAnimation: ed.smoothCaret ? 'on' : 'off',
    lineNumbers: ed.lineNumbers,
    stickyScroll: { enabled: ed.stickyScroll },
    bracketPairColorization: { enabled: ed.bracketColors },
  };
}

// ------------------------------------------------------------------ Prettier (chargé à la demande)
const PRETTIER_PARSERS = {
  javascript: 'babel', typescript: 'typescript', json: 'json', css: 'css', scss: 'scss', less: 'less', html: 'html', markdown: 'markdown', yaml: 'yaml', vue: 'vue', graphql: 'graphql',
};

let prettierLib = null;
async function prettier() {
  if (!prettierLib) {
    const [core, babel, estree, ts, postcss, html, md, yaml, gql] = await Promise.all([
      import('prettier/standalone'), import('prettier/plugins/babel'), import('prettier/plugins/estree'), import('prettier/plugins/typescript'), import('prettier/plugins/postcss'), import('prettier/plugins/html'), import('prettier/plugins/markdown'), import('prettier/plugins/yaml'), import('prettier/plugins/graphql'),
    ]);
    prettierLib = { format: core.format || core.default.format, plugins: [babel, estree, ts, postcss, html, md, yaml, gql].map((m) => m.default || m) };
  }
  return prettierLib;
}

// Formate le modèle avec Prettier (réglages .prettierrc du projet si présents), sinon le formateur de Monaco.
export async function formatModel(editor, monaco, { root, ed } = {}) {
  const model = editor.getModel();
  if (!model) return false;
  const lang = model.getLanguageId();
  const parser = PRETTIER_PARSERS[lang];
  if (!ed || !ed.prettier || !parser) { await editor.getAction('editor.action.formatDocument').run(); return true; }
  try {
    const p = await prettier();
    let rc = {};
    if (root) {
      for (const name of ['.prettierrc', '.prettierrc.json']) {
        // eslint-disable-next-line no-await-in-loop
        const r = await api.invoke('dev:read', { file: `${root}${api.platform === 'win32' ? '\\' : '/'}${name}` }).catch(() => null);
        if (r && r.text) { try { rc = JSON.parse(r.text); } catch { rc = {}; } break; }
      }
    }
    const text = model.getValue();
    const out = await p.format(text, {
      parser, plugins: p.plugins, tabWidth: ed.tabSize, useTabs: !ed.insertSpaces, singleQuote: true, printWidth: 100, ...rc, filepath: model.uri.path,
    });
    if (out !== text) {
      const sel = editor.getSelections();
      editor.pushUndoStop();
      editor.executeEdits('prettier', [{ range: model.getFullModelRange(), text: out }]);
      editor.pushUndoStop();
      if (sel) editor.setSelections(sel);
    }
    return true;
  } catch (err) {
    toast(`Prettier : ${String(err.message || err).split('\n')[0]}`, { kind: 'bad' });
    return false;
  }
}

// ------------------------------------------------------------------ panneau des extensions
export class ExtensionsPanel {
  constructor(lab) {
    this.lab = lab;
    this.results = null;
    this.installed = [];
    this.q = '';
    this.cat = 'Themes';
  }

  async render(box) {
    this.box = box;
    box.innerHTML = `<div class="dk-pane-head"><b>Extensions</b></div>
      <div class="dk-ext">
        <div class="dk-ext-modes">
          <p class="bl-hint">L'éditeur de NEXORA utilise les <b>thèmes</b>, <b>extraits de code</b> et <b>réglages de langages</b> des extensions VS Code, depuis Open VSX. Pour toutes les extensions (débogueurs, linters, assistants…), ouvre <b>Code Editor</b>.</p>
          <button class="btn small wide" data-ext="vscode">${icon('code', 13)}<span>Ouvrir Code Editor</span></button>
        </div>
        <div class="side-search"><span class="search-ico">${icon('search', 14)}</span><input type="search" placeholder="Rechercher sur Open VSX" data-ext-q value="${esc(this.q)}"></div>
        <div class="st-chips">${Object.entries({ Themes: 'Thèmes', Snippets: 'Extraits de code', 'Programming Languages': 'Langages', '': 'Tout' }).map(([k, l]) => `<button class="st-chip${this.cat === k ? ' on' : ''}" data-ext-cat="${esc(k)}">${l}</button>`).join('')}</div>
        <div class="dk-ext-list" data-ext-list><p class="bl-hint">Chargement…</p></div>
      </div>`;
    box.onclick = (e) => this.onClick(e);
    const inp = box.querySelector('[data-ext-q]');
    inp.onkeydown = (e) => { if (e.key === 'Enter') { this.q = inp.value.trim(); this.load(); } };
    await this.load();
  }

  async load() {
    const list = this.box && this.box.querySelector('[data-ext-list]');
    if (!list) return;
    this.installed = await api.invoke('dev:ext-list');
    list.innerHTML = '<p class="bl-hint">Recherche sur Open VSX…</p>';
    const r = await api.invoke('dev:ext-search', { query: this.q, category: this.q ? '' : this.cat, size: 30 });
    if (r && r.error) { list.innerHTML = `<p class="bl-hint">${esc(r.error)}</p>`; return; }
    this.results = r;
    const inst = this.installed;
    list.innerHTML = `${inst.length ? `<div class="pop-sub">Installées (${inst.length})</div>${inst.map((e) => this.row({ ...e, installed: true, local: true })).join('')}<div class="pop-sub">Open VSX</div>` : ''}${r.map((e) => this.row(e)).join('') || '<p class="bl-hint">Aucun résultat.</p>'}`;
  }

  row(e) {
    const uses = e.local ? [e.themes && e.themes.length ? `${e.themes.length} thème(s)` : '', e.snippets && e.snippets.length ? 'extraits' : '', e.languages && e.languages.length ? 'langages' : ''].filter(Boolean).join(' · ') : '';
    const limited = e.local && !uses ? 'utilisable dans Code Editor' : uses;
    return `<div class="dk-ext-row">
      <span class="dk-ext-ico">${(e.iconData || e.icon || '').startsWith('data:') ? `<img src="${esc(e.iconData || e.icon)}" alt="">` : icon('cube', 18)}</span>
      <span class="dk-ext-txt"><b>${esc(e.title)}</b><small>${esc(e.local ? limited : (e.description || '').slice(0, 110))}</small><i>${esc(e.id)} · ${esc(e.version || '')}${e.downloads ? ` · ${Number(e.downloads).toLocaleString('fr-FR')} téléchargements` : ''}</i></span>
      ${e.installed ? `<button class="btn small" data-ext-rm="${esc(e.id)}">Retirer</button>` : `<button class="btn small primary" data-ext-add="${esc(e.namespace)}|${esc(e.name)}">Installer</button>`}
    </div>`;
  }

  async onClick(e) {
    const cat = e.target.closest('[data-ext-cat]');
    if (cat) { this.cat = cat.dataset.extCat; this.q = ''; this.render(this.box); return; }
    const add = e.target.closest('[data-ext-add]');
    if (add) {
      const [namespace, name] = add.dataset.extAdd.split('|');
      add.disabled = true;
      add.textContent = 'Installation…';
      const r = await api.invoke('dev:ext-install', { namespace, name });
      if (r && r.error) { toast(r.error, { kind: 'bad' }); add.disabled = false; add.textContent = 'Installer'; return; }
      const res = await this.lab.reloadExtensions();
      const what = [r.themes.length ? `${r.themes.length} thème(s)` : '', r.snippets.length ? 'des extraits de code' : '', r.languages.length ? 'des réglages de langage' : ''].filter(Boolean).join(', ');
      toast(what ? `${r.title} installée : ${what}${r.themes.length ? ' (choisis le thème dans les réglages de l’éditeur)' : ''}` : `${r.title} installée. Elle ajoute surtout des fonctions de Visual Studio Code : utilise-la dans Code Editor.`);
      void res;
      if (r.themes.length) { this.lab.ed.theme = themeId(r.id, r.themes[0].label); this.lab.applyEditorSettings(); }
      await this.load();
      return;
    }
    const rm = e.target.closest('[data-ext-rm]');
    if (rm) { await api.invoke('dev:ext-uninstall', rm.dataset.extRm); await this.lab.reloadExtensions(); await this.load(); return; }
    if (e.target.closest('[data-ext="vscode"]')) this.lab.setMode('vscode');
  }
}
