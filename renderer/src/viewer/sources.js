/* Ce qui est affiché : un site en ligne ou un projet de l'ordinateur. */
import { api } from '../core/api.js';
import { S } from '../core/state.js';
import { settings, persist } from '../core/settings.js';
import { bus, esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import {
  toast, openSheet, closeSheet, stepsHtml,
} from '../core/ui.js';

export function looksLikeUrl(v) {
  const s = String(v || '').trim();
  if (!s || /\s/.test(s)) return false;
  return /^https?:\/\//i.test(s) || /^(localhost|127\.0\.0\.1|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/i.test(s) || /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(s);
}
export function normalizeUrl(v) {
  let u = String(v).trim();
  if (!/^https?:\/\//i.test(u)) u = /^(localhost|127\.|\d+\.\d+\.\d+\.\d+)/.test(u) ? `http://${u}` : `https://${u}`;
  return new URL(u).href;
}

function addRecent(entry) {
  const key = entry.dir || entry.url;
  settings.recent = [{ ...entry, at: Date.now() }, ...(settings.recent || []).filter((r) => (r.dir || r.url) !== key)].slice(0, 1000);
  persist();
}

const changed = () => bus.emit('source');

export async function closeSource() {
  if (S.recorder) await S.recorder.stopAndSave();
  if (S.source && S.source.mode === 'project') await api.invoke('project:stop');
  S.source = null;
  S.server = { status: 'idle', url: null, message: '' };
  S.baseUrl = null;
  S.audit = null;
  S.board.setMessage(null);
  S.board.blankAll();
  changed();
}

export async function openUrl(raw) {
  if (!looksLikeUrl(raw)) { toast('Ce lien ne ressemble pas à une adresse de site. Exemple : monsite.com ou https://monsite.com', { kind: 'bad' }); return false; }
  let url;
  try { url = normalizeUrl(raw); } catch { toast("Cette adresse n'est pas valide.", { kind: 'bad' }); return false; }
  if (S.source && S.source.mode === 'project') await api.invoke('project:stop');
  const host = new URL(url).host;
  S.source = { mode: 'url', url, name: host };
  S.server = { status: 'running', url, message: url };
  S.baseUrl = url;
  addRecent({ url, name: host });
  S.board.setMessage(null);
  S.board.loadAll(url);
  changed();
  return true;
}

export async function openProjectDir(dir) {
  const a = await api.invoke('project:analyze', dir);
  if (!a) { toast('Dossier introuvable. Il a peut-être été déplacé.', { kind: 'bad' }); return; }
  await openProject(a);
}

export async function pickProject() {
  const a = await api.invoke('project:pick');
  if (a) openProject(a);
}

export async function openProject(a) {
  if (S.recorder) await S.recorder.stopAndSave();
  if (S.source && S.source.mode === 'project') await api.invoke('project:stop');
  S.source = {
    mode: 'project', name: a.name, dir: a.dir, analysis: a, script: a.script,
  };
  S.baseUrl = null;
  S.serverLog = [];
  S.board.blankAll();
  addRecent({ dir: a.dir, name: a.name, label: a.label });
  S.server = { status: 'checking', url: null, message: '' };
  updateMessage();
  changed();
  if (a.unsupported) {
    S.server = { status: 'unsupported', url: null, message: a.unsupported.message };
    updateMessage();
    changed();
    showUnsupported(a.unsupported);
    return;
  }
  startProject();
}

export function startProject(opts = {}) {
  const src = S.source;
  if (!src || src.mode !== 'project') return;
  S.server = { status: 'checking', url: null, message: '' };
  updateMessage();
  changed();
  api.invoke('project:start', { dir: src.dir, script: src.script, staticDir: opts.staticDir });
}

const MESSAGES = {
  checking: ['Vérification des outils', ''],
  installing: ['Installation', null],
  starting: ['Démarrage du serveur', null],
  'missing-sdk': ['Outil manquant', null],
  'needs-web': ['Version web à ajouter', null],
  unsupported: ['Projet non affichable', null],
  error: ['Le serveur ne répond pas', null],
  stopped: ['Serveur arrêté', 'Clique sur Démarrer pour relancer le projet.'],
  idle: ['Prêt', ''],
};

export function updateMessage() {
  if (!S.source) { S.board.setMessage(S.board.welcome ? { welcome: true } : null); return; }
  if (S.source.mode === 'project' && !S.baseUrl) {
    const st = S.server.status;
    const m = MESSAGES[st] || ['', ''];
    S.board.setMessage({
      title: m[0], body: m[1] == null ? S.server.message : m[1], busy: ['checking', 'installing', 'starting'].includes(st), bad: ['error', 'missing-sdk', 'unsupported'].includes(st),
    });
    return;
  }
  S.board.setMessage(null);
}

export function initSources() {
  api.on('runner:status', (s) => {
    if (!S.source || S.source.mode !== 'project') return;
    const prev = S.baseUrl;
    S.server = { status: s.status, url: s.url || null, message: s.message || '' };
    if (s.status === 'running' && s.url) {
      S.baseUrl = s.url;
      let target = s.url;
      const cur = S.board.currentUrl;
      if (prev && cur) {
        try { const u = new URL(cur); target = new URL(u.pathname + u.search + u.hash, s.url).href; } catch { /* racine */ }
      }
      if (S.source.analysis) S.source.analysis.installNeeded = false;
      closeSheet('sdk');
      S.board.setMessage(null);
      S.board.loadAll(target);
    } else if (['stopped', 'error', 'missing-sdk', 'needs-web', 'unsupported'].includes(s.status)) {
      S.baseUrl = null;
    }
    if (s.status === 'missing-sdk') showMissingSdk(s.missing || []);
    if (s.status === 'needs-web') showNeedsWeb();
    if (s.status === 'unsupported' && s.unsupported) showUnsupported(s.unsupported);
    if (s.status === 'error') toast(s.message || 'Le serveur a rencontré une erreur.', { kind: 'bad', action: 'Voir la console', onAction: () => bus.emit('open-inspector', 'console', 'server') });
    updateMessage();
    changed();
  });
  api.on('runner:log', (entry) => {
    const lines = String(entry.text).split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    for (const line of lines) S.serverLog.push({ stream: entry.stream, line });
    if (S.serverLog.length > 3000) S.serverLog.splice(0, S.serverLog.length - 3000);
    bus.emit('server-log');
  });
  api.on('static:change', () => S.board.reloadAll());

  document.addEventListener('click', (e) => {
    const act = e.target.closest('#sheet [data-sheet]');
    if (!act) return;
    const a = act.dataset.sheet;
    if (a === 'close') closeSheet();
    if (a === 'console') { closeSheet(); bus.emit('open-inspector', 'console', 'server'); }
    if (a === 'recheck') { closeSheet(); startProject(); }
    if (a === 'flutter-web') { closeSheet(); api.invoke('project:flutter-web', S.source.dir); }
  });
}

// ------------------------------------------------------------------ feuilles
function showMissingSdk(missing) {
  if (!missing.length) return;
  const names = missing.map((m) => m.label);
  const title = names.length > 1 ? `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]} ne sont pas installés` : `${names[0]} n'est pas installé`;
  openSheet('sdk', `
    <div class="sheet-head"><span class="sheet-icon warn">${icon('wrench', 22)}</span><div><h2>${esc(title)}</h2><p>NEXORA en a besoin pour lancer ${esc(S.source ? S.source.name : 'ce projet')}${S.source && S.source.analysis ? ` (${esc(S.source.analysis.label)})` : ''}.</p></div></div>
    <div class="sheet-body">
      ${missing.map((m) => `<section class="sdk-block"><h3>Installer ${esc(m.label)}</h3><p class="muted">${esc(m.why)}</p>${stepsHtml(m.steps)}</section>`).join('')}
      <p class="sheet-note">Une fois l'installation terminée, clique sur « Vérifier à nouveau ». NEXORA relit le PATH de Windows : inutile de la redémarrer.</p>
    </div>
    <div class="sheet-foot"><button class="btn" data-sheet="console">Voir la console du serveur</button><span class="grow"></span><button class="btn" data-sheet="close">Fermer</button><button class="btn primary" data-sheet="recheck" data-autofocus>Vérifier à nouveau</button></div>`);
}
function showNeedsWeb() {
  openSheet('web', `
    <div class="sheet-head"><span class="sheet-icon">${icon('globe', 22)}</span><div><h2>Ajouter la version web à ce projet Flutter</h2><p>Le dossier web/ est absent : le projet n'a été créé que pour Android ou iOS.</p></div></div>
    <div class="sheet-body">
      <p>NEXORA peut lancer cette commande dans le dossier du projet. Elle ajoute uniquement le dossier web/ et ne modifie pas ton code Dart.</p>
      <div class="cmd"><code>flutter create --platforms web .</code><button class="cmd-copy" data-copy="flutter create --platforms web ." aria-label="Copier la commande">${icon('copy', 15)}</button></div>
    </div>
    <div class="sheet-foot"><span class="grow"></span><button class="btn" data-sheet="close">Annuler</button><button class="btn primary" data-sheet="flutter-web" data-autofocus>Ajouter la version web</button></div>`);
}
function showUnsupported(u) {
  openSheet('unsupported', `
    <div class="sheet-head"><span class="sheet-icon warn">${icon('info', 22)}</span><div><h2>${esc(u.title)}</h2><p>${esc(u.message)}</p></div></div>
    ${u.steps && u.steps.length ? `<div class="sheet-body">${stepsHtml(u.steps)}</div>` : ''}
    <div class="sheet-foot"><span class="grow"></span><button class="btn primary" data-sheet="close" data-autofocus>Compris</button></div>`);
}
