/* Inspecteur : infos de l'appareil, code source, audit et console de l'appareil sélectionné. */
import { api, IS_WIN } from '../core/api.js';
import { S } from '../core/state.js';
import { settings, persist } from '../core/settings.js';
import {
  $, esc, bus, fmtNum, fmtBytes, fmtMs,
} from '../core/dom.js';
import { icon } from '../core/icons.js';
import {
  toast, seg, toggle, refreshSeg,
} from '../core/ui.js';
import { OS_LABEL } from '../viewer/emulation.js';

const AUDIT = window.VitrineAudit;
const TABS = [['infos', 'Infos', 'info'], ['code', 'Code', 'code'], ['audit', 'Audit', 'audit'], ['console', 'Console', 'terminal']];
const el = () => $('#inspector');
const view = () => S.board.focused;

S.code = {
  tree: null, expanded: {}, file: null, fileData: null, html: null, dom: null, resources: null, pageFiles: [], resUrl: null, resText: null,
};

export function resetPageData() {
  S.audit = null;
  S.code.html = null;
  S.code.dom = null;
  S.code.resources = null;
}

export function toggleInspector(force) {
  settings.inspector = force ?? !settings.inspector;
  persist();
  el().hidden = !settings.inspector;
  $('#btnInspector').classList.toggle('on', settings.inspector);
  if (settings.inspector) renderInspector();
  requestAnimationFrame(() => S.board.relayout());
}

export function openInspector(tab, sub) {
  settings.inspectorTab = tab;
  if (tab === 'console' && sub) settings.consoleTab = sub;
  toggleInspector(true);
  if (tab === 'code') refreshCode();
}

export function renderInspectorIfOpen(tab) {
  if (!settings.inspector) return;
  if (tab && settings.inspectorTab !== tab) return;
  renderInspector();
}

function errorCount() {
  const v = view();
  if (!v) return 0;
  return v.console.filter((c) => c.level === 'error').length + v.net.length;
}

export function updateInspectorBadge() {
  const n = errorCount();
  $('#btnInspector').classList.toggle('has-errors', n > 0);
  const b = $('.ins-tab[data-tab="console"] .badge', el());
  if (b) b.textContent = n ? String(n) : '';
}

export function renderInspector() {
  const tab = settings.inspectorTab;
  const n = errorCount();
  const prev = $('#insBody', el());
  const keep = prev && prev.dataset.tab === tab ? prev.scrollTop : 0;
  el().innerHTML = `
    <div class="ins-tabs" role="tablist">${TABS.map(([id, label, ic]) => `<button class="ins-tab${tab === id ? ' on' : ''}" role="tab" aria-selected="${tab === id}" data-tab="${id}">${icon(ic, 15)}<span>${label}</span>${id === 'console' ? `<span class="badge">${n || ''}</span>` : ''}</button>`).join('')}</div>
    <div class="ins-body" id="insBody" data-tab="${tab}"></div>`;
  const body = $('#insBody');
  if (tab === 'infos') renderInfos(body);
  else if (tab === 'code') renderCode(body);
  else if (tab === 'audit') renderAudit(body);
  else renderConsole(body);
  if (keep && tab !== 'console') body.scrollTop = keep;
}

// ------------------------------------------------------------------ infos
const kv = (label, value) => `<div class="kv"><span class="k">${esc(label)}</span><span class="v">${value}</span></div>`;

function renderInfos(body) {
  const v = view();
  const dev = v.dev;
  const st = v.stateInfo;
  const L = v.L;
  const ua = v.ua;
  const env = settings.env;
  const tech = v.tech;
  body.innerHTML = `
    <section class="card">
      <h3>${esc(dev.name)}${st.label ? ` <span class="muted">${esc(st.label)}</span>` : ''}</h3>
      ${kv("Zone d'affichage", `${L.vp.w} × ${L.vp.h} px CSS${st.approx ? ' <span class="approx" title="Estimation à partir de la définition de l\'écran">≈</span>' : ''}`)}
      ${kv('Écran', `${L.W} × ${L.H} px CSS`)}
      ${kv('Densité', `@${fmtNum(L.dpr)}x`)}
      ${kv('Définition', `${Math.round(L.W * L.dpr)} × ${Math.round(L.H * L.dpr)} pixels`)}
      ${L.phys ? kv('Dimensions', `${fmtNum(L.phys.bw, 1)} × ${fmtNum(L.phys.bh, 1)} × ${fmtNum(L.phys.bd, 1)} mm`) : ''}
      ${kv('Affichage', settings.displayHD && v.K > 1.01 ? `Haute définition (×${fmtNum(v.K, 2)})` : 'Standard')}
      ${kv('Système', esc(OS_LABEL[dev.os] || dev.os))}
      ${kv('Orientation', L.land ? 'Paysage' : (dev.fixed ? 'Fixe' : 'Portrait'))}
      ${kv('Tactile', ua.touch ? 'Oui' : 'Non')}
      <div class="ua"><code>${esc(ua.ua)}</code><button class="icon-btn small" data-copy-ua title="Copier le user agent" aria-label="Copier le user agent">${icon('copy', 14)}</button></div>
    </section>
    <section class="card">
      <h3>Page</h3>
      ${v.url ? `
        ${kv('Titre', esc(v.title || '—'))}
        ${kv('Adresse', `<span class="break">${esc(v.url)}</span>`)}
        <div class="k-block"><span class="k">Technologies détectées</span>${tech ? (tech.length ? `<div class="chips">${tech.map((t) => `<span class="chip" title="${esc(t.category)}">${esc(t.name)}${t.version ? ` <small>${esc(t.version)}</small>` : ''}</span>`).join('')}</div>` : '<p class="muted">Aucune technologie reconnue.</p>') : '<p class="muted">Analyse en cours…</p>'}</div>
        <button class="btn small" data-devtools>${icon('wrench', 14)}<span>Outils de développement Chrome</span></button>`
    : '<p class="muted">Aucune page affichée.</p>'}
    </section>
    <section class="card">
      <h3>Environnement de la page</h3>
      <div class="field-label">Thème demandé à la page</div>
      ${seg('pageTheme', env.pageTheme, { system: 'Système', light: 'Clair', dark: 'Sombre' })}
      <div class="field-label">Réseau</div>
      ${seg('network', env.network, {
    none: 'Illimité', '4g': '4G', '3g': '3G', '3g-slow': '3G lente', offline: 'Hors ligne',
  })}
      <div class="field-label">Processeur</div>
      ${seg('cpu', env.cpu, { 1: 'Normal', 4: 'Lent ×4', 6: 'Très lent ×6' })}
      ${toggle('reducedMotion', 'Réduire les animations', '', env.reducedMotion)}
    </section>
    <section class="card">
      <h3>Maquette</h3>
      ${toggle('displayHD', 'Écran en haute définition', "Page dessinée à la définition réelle de l'appareil", settings.displayHD)}
      ${toggle('framesOn', "Afficher le cadre de l'appareil", '', settings.framesOn)}
      ${toggle('statusBar', "Barre d'état", "Heure, réseau et batterie en haut de l'écran, comme sur le vrai appareil", settings.statusBar)}
      ${toggle('dragScroll', 'Glisser pour défiler', 'La souris fait défiler la page comme un doigt', settings.dragScroll)}
    </section>`;
}

async function applyEnvAll() {
  await Promise.all(S.board.list.filter((v) => v.wcId).map((v) => api.invoke('device:env', { wcId: v.wcId, env: settings.env })));
}

// ------------------------------------------------------------------ code source
const LANG = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', tsx: 'typescript', mts: 'typescript', json: 'json', css: 'css', scss: 'scss', sass: 'scss', less: 'css', html: 'xml', htm: 'xml', vue: 'xml', svelte: 'xml', astro: 'xml', xml: 'xml', svg: 'xml', md: 'markdown', mdx: 'markdown', py: 'python', php: 'php', rb: 'ruby', go: 'go', cs: 'csharp', cshtml: 'xml', razor: 'xml', dart: 'dart', yaml: 'yaml', yml: 'yaml', toml: 'ini', ini: 'ini', env: 'ini', sh: 'bash', kt: 'kotlin', swift: 'swift', java: 'java', gradle: 'java',
};
const extOf = (p) => { const m = String(p).toLowerCase().match(/\.([a-z0-9]+)(?:[?#].*)?$/); return m ? m[1] : ''; };
function highlight(text, lang) {
  if (!window.hljs || text.length > 300000) return esc(text);
  try {
    return lang && window.hljs.getLanguage(lang) ? window.hljs.highlight(text, { language: lang, ignoreIllegals: true }).value : window.hljs.highlightAuto(text.slice(0, 100000)).value;
  } catch { return esc(text); }
}
function codeBlock(text, lang) {
  const lines = text.split('\n').length;
  const gutter = Array.from({ length: Math.min(lines, 50000) }, (_x, i) => i + 1).join('\n');
  return `<div class="code"><pre class="gutter" aria-hidden="true">${gutter}</pre><pre class="src"><code class="hljs">${highlight(text, lang)}</code></pre></div>`;
}
function prettyHtml(html) {
  const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', '!doctype']);
  const out = [];
  let depth = 0;
  let raw = null;
  const tokens = html.replace(/>\s+</g, '><').split(/(<[^>]+>)/).filter((t) => t.trim());
  for (const t of tokens) {
    if (raw) {
      if (new RegExp(`^</${raw}`, 'i').test(t)) { raw = null; depth = Math.max(0, depth - 1); out.push(`${'  '.repeat(depth)}${t}`); } else out.push(`${'  '.repeat(depth)}${t.trim().slice(0, 4000)}`);
      continue;
    }
    const m = t.match(/^<\/?\s*([a-zA-Z!][\w:-]*)/);
    if (t.startsWith('</')) { depth = Math.max(0, depth - 1); out.push(`${'  '.repeat(depth)}${t}`); }
    else if (m && t.startsWith('<')) {
      out.push(`${'  '.repeat(depth)}${t}`);
      const tag = m[1].toLowerCase();
      if (!VOID.has(tag) && !t.endsWith('/>') && !t.startsWith('<!--')) { depth++; if (tag === 'script' || tag === 'style') raw = tag; }
    } else out.push(`${'  '.repeat(depth)}${t.trim()}`);
    if (out.length > 30000) break;
  }
  return out.join('\n');
}
const flatFiles = (nodes, acc = []) => { for (const n of nodes || []) { if (n.dir) flatFiles(n.children, acc); else acc.push(n); } return acc; };
const rel = (p) => (S.source && S.source.dir && p.startsWith(S.source.dir) ? p.slice(S.source.dir.length + 1) : p);

async function computePageFiles() {
  const v = view();
  if (!S.source || S.source.mode !== 'project' || !S.baseUrl || !v.ready || !S.code.tree) return [];
  const dir = S.source.dir;
  const files = flatFiles(S.code.tree);
  const results = new Map();
  const add = (p, reason) => { if (!results.has(p)) results.set(p, reason); };
  try {
    const res = await v.wv.executeJavaScript(AUDIT.js.resources);
    const origin = new URL(S.baseUrl).origin;
    const candidates = [];
    for (const r of res.list) {
      let u;
      try { u = new URL(r.url); } catch { continue; }
      if (u.origin !== origin) continue;
      let p = decodeURIComponent(u.pathname);
      if (/\/node_modules\/|\/\.vite\/|^\/@(?!fs)|^\/__/.test(p)) continue;
      if (!/\.(jsx?|tsx?|vue|svelte|astro|css|scss|sass|less|mdx?|dart)$/i.test(p)) continue;
      if (p.startsWith('/@fs/')) p = p.slice(4).replace(/^\/([A-Za-z]:)/, '$1');
      else p = dir + p;
      candidates.push(IS_WIN ? p.replace(/\//g, '\\') : p);
    }
    const exists = candidates.length ? await api.invoke('fs:exists', candidates) : [];
    candidates.forEach((p, i) => { if (exists[i]) add(p, 'Chargé par la page'); });
  } catch { /* page en cours de chargement */ }
  let route = '/';
  try { route = new URL(v.url).pathname; } catch { /* racine */ }
  const segs = route.split('/').filter(Boolean);
  const last = (segs[segs.length - 1] || '').toLowerCase().replace(/\.[a-z]+$/, '');
  const routePath = segs.join('/').toLowerCase();
  const names = last ? [last, `${last}page`, `${last}screen`, `${last}view`] : ['index', 'home', 'homepage', 'homescreen', 'app', 'main'];
  for (const f of files) {
    const lower = f.name.toLowerCase();
    if (!/\.(jsx?|tsx?|vue|svelte|astro|dart|php|py|rb|cshtml|razor|html|mdx?)$/.test(lower)) continue;
    const r = rel(f.path).replace(/\\/g, '/').toLowerCase();
    const baseName = lower.replace(/\.[^.]+$/, '');
    const flat = baseName.replace(/[-_]/g, '');
    const inRouteDir = /(^|\/)(app|pages|routes|views|screens)\//.test(r) && (routePath ? r.includes(`/${routePath}/`) : /(^|\/)(app|pages|routes)\/(page|index|\+page|_index)\.[a-z]+$/.test(r));
    if ((inRouteDir && /^(page|index|\+page|_index|route)$/.test(baseName)) || names.includes(flat)) add(f.path, 'Correspond à la route');
  }
  if (S.source.analysis && S.source.analysis.kind === 'flutter') {
    const mainDart = files.find((f) => rel(f.path).replace(/\\/g, '/') === 'lib/main.dart');
    if (mainDart) add(mainDart.path, "Point d'entrée Flutter");
  }
  return [...results.entries()].map(([p, reason]) => ({ path: p, reason })).slice(0, 40);
}

let codeTimer = null;
export function refreshCode() {
  clearTimeout(codeTimer);
  codeTimer = setTimeout(async () => {
    if (!settings.inspector || settings.inspectorTab !== 'code') return;
    const v = view();
    const isProject = S.source && S.source.mode === 'project';
    let tab = settings.codeTab;
    if (!isProject && tab === 'files') tab = 'html';
    if (isProject && !S.code.tree) S.code.tree = await api.invoke('fs:tree', S.source.dir);
    if (tab === 'files') S.code.pageFiles = await computePageFiles();
    else if (tab === 'html' && v.ready && v.url) S.code.html = await v.wv.executeJavaScript(AUDIT.js.source).catch(() => null);
    else if (tab === 'dom' && v.ready && v.url) S.code.dom = await v.wv.executeJavaScript(AUDIT.js.dom).catch(() => null);
    else if (tab === 'res' && v.ready && v.url) S.code.resources = await v.wv.executeJavaScript(AUDIT.js.resources).catch(() => null);
    if (settings.inspectorTab === 'code') renderInspector();
  }, 250);
}

function treeHtml(nodes, depth = 0) {
  return nodes.map((n) => {
    if (n.dir) {
      const open = S.code.expanded[n.path];
      return `<div class="tree-dir${open ? ' open' : ''}"><button class="tree-row" data-tree="${esc(n.path)}" style="--d:${depth}">${icon('chevronRight', 11, 'chev')}${icon('folder', 14)}<span>${esc(n.name)}</span></button>${open ? `<div>${treeHtml(n.children, depth + 1)}</div>` : ''}</div>`;
    }
    return `<button class="tree-row file${S.code.file === n.path ? ' on' : ''}" data-file="${esc(n.path)}" style="--d:${depth}">${icon('file', 13)}<span>${esc(n.name)}</span></button>`;
  }).join('');
}

function renderCode(body) {
  const v = view();
  const isProject = S.source && S.source.mode === 'project';
  let tab = settings.codeTab;
  if (!isProject && tab === 'files') tab = 'html';
  const tabs = isProject ? {
    files: 'Fichiers', html: 'HTML', dom: 'DOM', res: 'Ressources',
  } : { html: 'HTML source', dom: 'DOM rendu', res: 'Ressources' };
  let content = '';
  if (!v.url && !isProject) content = '<p class="muted pad">Ouvre une page pour voir son code source.</p>';
  else if (S.code.file && tab === 'files') {
    const d = S.code.fileData;
    content = `<div class="viewer-head"><button class="icon-btn small" data-code="back" title="Retour" aria-label="Retour">${icon('back', 14)}</button><span class="vh-path" title="${esc(S.code.file)}">${esc(rel(S.code.file))}</span><button class="btn small" data-code="editor">${icon('external', 13)}<span>Ouvrir dans l'éditeur</span></button></div>
      ${!d ? '<p class="muted pad">Chargement…</p>' : d.error ? `<p class="muted pad">${esc(d.error)}</p>` : d.image ? `<div class="img-preview"><img src="${d.image}" alt=""></div>` : codeBlock(d.text, LANG[extOf(S.code.file)])}`;
  } else if (S.code.resUrl && tab === 'res') {
    content = `<div class="viewer-head"><button class="icon-btn small" data-code="res-back" title="Retour" aria-label="Retour">${icon('back', 14)}</button><span class="vh-path" title="${esc(S.code.resUrl)}">${esc(S.code.resUrl.split('?')[0].split('/').pop() || S.code.resUrl)}</span></div>
      ${S.code.resText == null ? '<p class="muted pad">Chargement…</p>' : codeBlock(S.code.resText, LANG[extOf(S.code.resUrl)] || 'javascript')}`;
  } else if (tab === 'files') {
    const pf = S.code.pageFiles || [];
    content = `
      <div class="code-section"><div class="cs-title">Fichiers de cette page</div>
        ${pf.length ? pf.map((f) => `<button class="file-row" data-file="${esc(f.path)}">${icon('file', 14)}<span class="fr-name">${esc(rel(f.path))}</span><span class="fr-reason">${esc(f.reason)}</span></button>`).join('') : `<p class="muted">${S.baseUrl ? "Aucun fichier source identifié pour cette page. Parcours l'arborescence ci-dessous." : 'Disponible quand le serveur du projet est en ligne.'}</p>`}
      </div>
      <div class="code-section"><div class="cs-title">Tous les fichiers</div><div class="tree">${S.code.tree ? treeHtml(S.code.tree) : '<p class="muted">Chargement…</p>'}</div></div>`;
  } else if (tab === 'html') {
    content = S.code.html == null ? '<p class="muted pad">Chargement…</p>' : codeBlock(S.code.html, 'xml');
  } else if (tab === 'dom') {
    content = S.code.dom == null ? '<p class="muted pad">Chargement…</p>' : codeBlock(prettyHtml(S.code.dom), 'xml');
  } else if (tab === 'res') {
    const r = S.code.resources;
    if (!r) content = '<p class="muted pad">Chargement…</p>';
    else {
      const groups = {};
      for (const it of r.list) {
        const g = {
          script: 'Scripts', link: 'Styles', css: 'Styles', img: 'Images', fetch: 'Requêtes', xmlhttprequest: 'Requêtes', font: 'Polices',
        }[it.type] || 'Autres';
        (groups[g] = groups[g] || []).push(it);
      }
      const total = r.list.reduce((s, x) => s + x.size, r.document.size || 0);
      content = `<p class="res-total">${r.list.length + 1} fichiers, ${fmtBytes(total)} transférés</p>${Object.entries(groups).map(([g, items]) => `
        <div class="code-section"><div class="cs-title">${esc(g)} <span class="muted">${items.length}</span></div>
          ${items.map((it) => { const viewable = /\.(m?js|css|json|svg|txt|map|html?)(\?|$)/i.test(it.url) || it.type === 'script' || it.type === 'link'; return `<button class="file-row" ${viewable ? `data-res="${esc(it.url)}"` : 'disabled'} title="${esc(it.url)}">${icon('file', 14)}<span class="fr-name">${esc(decodeURIComponent((it.url.split('?')[0].split('/').pop() || it.url).slice(0, 80)))}</span><span class="fr-reason">${it.size ? fmtBytes(it.size) : ''}</span></button>`; }).join('')}
        </div>`).join('')}`;
    }
  }
  body.innerHTML = `<div class="code-tabs">${seg('codeTab', tab, tabs)}</div><div class="code-body">${content}</div>`;
}

async function handleCodeClick(e) {
  const v = view();
  const tr = e.target.closest('[data-tree]');
  if (tr) { S.code.expanded[tr.dataset.tree] = !S.code.expanded[tr.dataset.tree]; renderInspector(); return; }
  const f = e.target.closest('[data-file]');
  if (f) {
    S.code.file = f.dataset.file;
    S.code.fileData = null;
    renderInspector();
    S.code.fileData = await api.invoke('fs:read', S.code.file);
    renderInspector();
    return;
  }
  const r = e.target.closest('[data-res]');
  if (r) {
    S.code.resUrl = r.dataset.res;
    S.code.resText = null;
    renderInspector();
    S.code.resText = await v.wv.executeJavaScript(AUDIT.js.fetchText(S.code.resUrl)).catch((err) => `// Lecture impossible : ${err.message || err}`);
    renderInspector();
    return;
  }
  const c = e.target.closest('[data-code]');
  if (!c) return;
  if (c.dataset.code === 'back') { S.code.file = null; renderInspector(); }
  if (c.dataset.code === 'res-back') { S.code.resUrl = null; renderInspector(); }
  if (c.dataset.code === 'editor') {
    const how = await api.invoke('editor:open', { file: S.code.file });
    toast(how === 'vscode' ? 'Fichier ouvert dans VS Code' : "Fichier ouvert avec l'application par défaut");
  }
}

// ------------------------------------------------------------------ audit
const CAT_LABEL = {
  errors: 'Erreurs', responsive: "Affichage sur l'appareil", a11y: 'Accessibilité', seo: 'Référencement', perf: 'Performance', best: 'Sécurité et bonnes pratiques',
};

export async function runAudit() {
  const v = view();
  if (!v.ready || !v.url) return;
  S.audit = { running: true, uid: v.uid };
  renderInspectorIfOpen('audit');
  try {
    const r = await v.wv.executeJavaScript(AUDIT.js.audit);
    const errs = v.console.filter((c) => c.level === 'error');
    const checks = r.checks.slice();
    if (errs.length) {
      checks.unshift({
        id: 'js', cat: 'errors', level: 'error', title: `${errs.length} erreur${errs.length > 1 ? 's' : ''} JavaScript`, detail: 'Erreurs affichées dans la console de la page.', count: errs.length, samples: errs.slice(0, 8).map((x) => ({ text: `${x.message.slice(0, 140)}${x.source ? ` (${String(x.source).split('/').pop()}:${x.line})` : ''}` })),
      });
    } else checks.unshift({ id: 'js', cat: 'errors', level: 'pass', title: 'Aucune erreur JavaScript' });
    if (v.net.length) {
      checks.unshift({
        id: 'net', cat: 'errors', level: 'error', title: `${v.net.length} requête${v.net.length > 1 ? 's' : ''} en échec`, detail: "Fichiers ou appels qui ont renvoyé une erreur (404, 500…) ou n'ont pas abouti.", count: v.net.length, samples: v.net.slice(0, 10).map((x) => ({ text: `${x.status ? `${x.status} ` : ''}${x.error || x.statusText || ''} ${x.url}`.trim() })),
      });
    } else checks.unshift({ id: 'net', cat: 'errors', level: 'pass', title: 'Toutes les requêtes ont abouti' });
    S.audit = {
      ...r, checks, at: Date.now(), uid: v.uid, device: v.dev.name,
    };
  } catch (err) {
    S.audit = { failed: String(err.message || err), uid: v.uid };
  }
  renderInspectorIfOpen('audit');
}

function ring(score, label) {
  const val = score == null ? 0 : score;
  const color = score == null ? 'var(--fill)' : val >= 90 ? 'var(--ok)' : val >= 50 ? 'var(--warn)' : 'var(--bad)';
  const c = 2 * Math.PI * 17;
  return `<div class="ring" title="${esc(label)}"><svg viewBox="0 0 40 40" width="48" height="48"><circle cx="20" cy="20" r="17" fill="none" stroke="var(--fill)" stroke-width="3.5"/><circle cx="20" cy="20" r="17" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${(c * val) / 100} ${c}" transform="rotate(-90 20 20)"/></svg><span class="ring-v">${score == null ? '—' : val}</span><span class="ring-l">${esc(label)}</span></div>`;
}

function renderAudit(body) {
  const v = view();
  let a = S.audit;
  if (a && a.uid !== v.uid) { S.audit = null; a = null; }
  if (!v.url) { body.innerHTML = "<p class=\"muted pad\">Ouvre une page pour l'analyser.</p>"; return; }
  if (!a || a.running) {
    body.innerHTML = `<div class="audit-wait"><div class="spinner"></div><p>Analyse de la page sur ${esc(v.dev.name)}…</p></div>`;
    if (!a) runAudit();
    return;
  }
  if (a.failed) { body.innerHTML = `<p class="muted pad">L'analyse a échoué : ${esc(a.failed)}</p><button class="btn" data-audit="run">Relancer</button>`; return; }
  const cats = ['responsive', 'a11y', 'seo', 'perf', 'best'];
  const names = {
    responsive: 'Affichage', a11y: 'Accessibilité', seo: 'SEO', perf: 'Vitesse', best: 'Pratiques',
  };
  const m = a.metrics || {};
  const order = {
    error: 0, warn: 1, info: 2, pass: 3,
  };
  const sections = ['errors', ...cats].map((cat) => {
    const items = a.checks.filter((c) => c.cat === cat).sort((x, y) => order[x.level] - order[y.level]);
    if (!items.length) return '';
    return `<section class="audit-cat"><h4>${esc(CAT_LABEL[cat])}</h4>${items.map((c) => `
      <details class="check ${c.level}" ${c.level === 'error' ? 'open' : ''}>
        <summary>${icon({
    error: 'error', warn: 'warn', info: 'info', pass: 'pass',
  }[c.level], 16, 'lvl')}<span>${esc(c.title)}</span></summary>
        ${c.detail ? `<p>${esc(c.detail)}</p>` : ''}
        ${c.samples && c.samples.length ? `<ul class="samples">${c.samples.map((smp) => `<li>${smp.selector ? `<button class="sample" data-highlight="${esc(smp.selector)}" title="Montrer dans la page">${esc(smp.text)}</button>` : `<span class="sample static">${esc(smp.text)}</span>`}</li>`).join('')}</ul>` : ''}
      </details>`).join('')}</section>`;
  }).join('');
  body.innerHTML = `
    <div class="audit-head"><div><b>${esc(a.device || v.dev.name)}</b><span class="muted">${a.viewport.w} × ${a.viewport.h} px, analysé à ${new Date(a.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span></div><button class="btn small" data-audit="run">${icon('reload', 14)}<span>Relancer</span></button></div>
    <div class="rings">${cats.map((c) => ring(AUDIT.score(a.checks, c), names[c])).join('')}</div>
    <div class="metrics">
      <div><span>Premier affichage</span><b>${fmtMs(m.fcp)}</b></div>
      <div><span>Contenu principal</span><b>${fmtMs(m.lcp)}</b></div>
      <div><span>Stabilité (CLS)</span><b>${m.cls == null ? '—' : m.cls.toFixed(3).replace('.', ',')}</b></div>
      <div><span>Chargement complet</span><b>${fmtMs(m.load > 0 ? m.load : null)}</b></div>
      <div><span>Poids transféré</span><b>${fmtBytes(m.bytes || 0)}</b></div>
      <div><span>Requêtes</span><b>${m.requests || 0}</b></div>
    </div>
    ${sections}`;
}

function handleAuditClick(e) {
  if (e.target.closest('[data-audit="run"]')) { runAudit(); return; }
  const hl = e.target.closest('[data-highlight]');
  const v = view();
  if (hl && v.ready) v.wv.send('vitrine-highlight', hl.dataset.highlight);
}

// ------------------------------------------------------------------ console
let consoleTimer = null;
export function scheduleConsole() {
  if (consoleTimer) return;
  consoleTimer = setTimeout(() => { consoleTimer = null; if (settings.inspector && settings.inspectorTab === 'console') renderConsoleBody(); }, 120);
}

function renderConsole(body) {
  const tab = settings.consoleTab;
  const errs = errorCount();
  body.innerHTML = `
    <div class="console-head">${seg('consoleTab', tab, { page: `Page${errs ? ` (${errs})` : ''}`, server: 'Serveur' })}<button class="btn small" data-console="clear">Effacer</button></div>
    <div class="console-body" id="consoleBody"></div>`;
  renderConsoleBody();
}

function renderConsoleBody() {
  const box = $('#consoleBody');
  if (!box) return;
  const v = view();
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  if (settings.consoleTab === 'server') {
    box.innerHTML = S.serverLog.length ? S.serverLog.map((l) => `<div class="log ${l.stream}">${esc(l.line) || '&nbsp;'}</div>`).join('') : `<p class="muted pad">${S.source && S.source.mode === 'project' ? 'Les messages du serveur de développement s\'afficheront ici.' : 'Ouvre un dossier de projet pour voir les messages de son serveur.'}</p>`;
  } else {
    const items = v.console.map((c) => ({ ...c })).concat(v.net.map((n) => ({
      level: 'error', message: `${n.status ? `${n.status} ${n.statusText || ''}` : n.error || 'Échec'} : ${n.url}`, at: n.at,
    }))).sort((x, y) => x.at - y.at);
    box.innerHTML = items.length ? items.map((c) => `<div class="log lvl-${esc(c.level)}">${c.level === 'error' ? icon('error', 13, 'lvl') : c.level === 'warning' ? icon('warn', 13, 'lvl') : '<span class="lvl-pad"></span>'}<span class="msg">${esc(c.message)}</span>${c.source ? `<span class="src">${esc(String(c.source).split('/').pop().slice(0, 40))}:${c.line}</span>` : ''}</div>`).join('') : "<p class=\"muted pad\">console.log, avertissements, erreurs et requêtes en échec de la page s'afficheront ici.</p>";
  }
  if (atBottom || !box.dataset.init) { box.scrollTop = box.scrollHeight; box.dataset.init = '1'; }
}

function handleConsoleClick(e) {
  if (!e.target.closest('[data-console="clear"]')) return;
  const v = view();
  if (settings.consoleTab === 'server') S.serverLog = []; else { v.console = []; v.net = []; }
  updateInspectorBadge();
  renderInspector();
}

// ------------------------------------------------------------------ initialisation
export function initInspector() {
  const ins = el();
  ins.hidden = !settings.inspector;
  $('#btnInspector').classList.toggle('on', settings.inspector);
  $('#btnInspector').addEventListener('click', () => toggleInspector());
  ins.addEventListener('click', async (e) => {
    const t = e.target.closest('.ins-tab[data-tab]');
    if (t) {
      settings.inspectorTab = t.dataset.tab;
      persist();
      renderInspector();
      if (t.dataset.tab === 'code') refreshCode();
      return;
    }
    const s = e.target.closest('#insBody [data-set]');
    if (s) {
      const key = s.dataset.set;
      if (['pageTheme', 'network', 'cpu'].includes(key)) {
        settings.env[key] = key === 'cpu' ? Number(s.dataset.val) : s.dataset.val;
        persist();
        refreshSeg(s);
        await applyEnvAll();
      }
      if (key === 'codeTab') { settings.codeTab = s.dataset.val; persist(); S.code.file = null; S.code.resUrl = null; renderInspector(); refreshCode(); }
      if (key === 'consoleTab') { settings.consoleTab = s.dataset.val; persist(); renderInspector(); }
      return;
    }
    if (e.target.closest('[data-copy-ua]')) { api.invoke('clipboard:write', view().ua.ua); toast('User agent copié'); return; }
    if (e.target.closest('[data-devtools]')) { const v = view(); if (v.wcId) api.invoke('device:devtools', { wcId: v.wcId, title: v.dev.name }); return; }
    handleCodeClick(e);
    handleAuditClick(e);
    handleConsoleClick(e);
  });
  ins.addEventListener('change', async (e) => {
    const t = e.target.closest('[data-toggle]');
    if (!t) return;
    const key = t.dataset.toggle;
    if (key === 'reducedMotion') {
      settings.env.reducedMotion = t.checked;
      persist();
      await applyEnvAll();
      return;
    }
    settings[key] = t.checked;
    persist();
    if (key === 'framesOn' || key === 'statusBar' || key === 'displayHD') { await S.board.refreshAll(); bus.emit('board-changed'); }
    if (key === 'dragScroll') { S.board.configureAll(); bus.emit('board-changed'); }
  });

  const board = S.board;
  board.on('focus', () => { resetPageData(); updateInspectorBadge(); renderInspectorIfOpen(); });
  board.on('navigate', (v, url, inPage) => {
    if (v !== board.focused) return;
    if (!inPage) { resetPageData(); renderInspectorIfOpen(); updateInspectorBadge(); }
    if (settings.inspector && settings.inspectorTab === 'code') refreshCode();
  });
  board.on('view-loading', (v, loading) => {
    if (v === board.focused && !loading && settings.inspector && settings.inspectorTab === 'code') refreshCode();
  });
  board.on('view-title', (v) => { if (v === board.focused) renderInspectorIfOpen('infos'); });
  board.on('view-tech', (v) => { if (v === board.focused) renderInspectorIfOpen('infos'); });
  board.on('view-console', (v) => {
    if (v !== board.focused) return;
    updateInspectorBadge();
    if (settings.inspector && settings.inspectorTab === 'console') scheduleConsole();
  });
  board.on('changed', (v) => { if (v === board.focused) renderInspectorIfOpen('infos'); });
  bus.on('server-log', () => { if (settings.consoleTab === 'server') scheduleConsole(); });
  bus.on('open-inspector', (tab, sub) => openInspector(tab, sub));
  bus.on('source', () => { S.code.tree = null; S.code.file = null; S.code.pageFiles = []; renderInspectorIfOpen(); });
  api.on('device:net', (n) => { const v = board.findView(n.wcId); if (v) v.addNetError(n); });
}
