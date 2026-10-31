/* Préparation des outils : au premier lancement, NEXORA télécharge et prépare tout ce dont ses espaces ont
 * besoin (outils Android, kit de notifications, Code Editor, partage par lien), pour que chaque outil soit
 * disponible dès qu'on l'ouvre. Chaque élément peut être décoché ; un téléchargement interrompu reprend où il
 * s'était arrêté ; la fenêtre peut passer en arrière-plan ; elle se rouvre depuis Apparence › NEX-OUTILS. */
import { api } from './api.js';
import { settings, persist } from './settings.js';
import { $, esc } from './dom.js';
import { icon } from './icons.js';
import { toast } from './ui.js';

const ITEMS = [
  {
    id: 'android', label: 'Outils Android', space: 'App Builder', ic: 'android', size: '≈ 400 Mo', desc: 'Tout ce qu’il faut pour créer tes applications Android, les publier sur le Play Store et les installer sur un téléphone.',
  },
  {
    id: 'push', label: 'Kit de notifications push', space: 'App Builder', ic: 'bell', size: '≈ 10 Mo', desc: 'Permet à tes applications de recevoir des notifications, même fermées.', needs: 'android',
  },
  {
    id: 'code', label: 'Code Editor', space: 'Dev Lab', ic: 'code', size: '≈ 15 Mo', desc: 'Visual Studio Code dans le Dev Lab (outil officiel de Microsoft ; son serveur, ≈ 60 Mo, se télécharge à la première ouverture).', license: 'https://code.visualstudio.com/license',
  },
  {
    id: 'tunnel', label: 'Partage par lien', space: 'Dev Lab', ic: 'link', size: '≈ 35 Mo', desc: 'Pour partager l’aperçu d’un site local avec un lien public.',
  },
];

const state = {
  running: false, current: null, progress: {}, status: {}, errors: {}, details: {}, hidden: false,
};
let root = null;

function cfg() {
  settings.setup = settings.setup || { done: false, chosen: ITEMS.map((x) => x.id), pending: [] };
  return settings.setup;
}

// État de chaque outil : installé, à installer, partiel.
async function check() {
  const st = {};
  const det = {};
  try {
    const t = await api.invoke('android:tools');
    const missing = [...(t.missing || [])];
    if (!t.platformTools) missing.push('platform-tools');
    if (!t.bundletool) missing.push('bundletool');
    st.android = missing.length ? 'missing' : 'ok';
    det.android = missing.length ? `À installer : ${[...new Set(missing.map((m) => ({ 'build-tools': 'création des applications', platform: 'création des applications', java: 'création des applications', 'platform-tools': 'installation sur téléphone', bundletool: 'format Play Store' }[m] || 'compléments')))].join(', ')}` : 'Prêts';
    state.androidMissing = missing;
  } catch { st.android = 'unknown'; }
  try {
    const p = await api.invoke('android:push-status');
    st.push = p.installed ? 'ok' : 'missing';
    det.push = p.installed ? 'Prêt' : 'À préparer';
  } catch { st.push = 'unknown'; }
  try {
    const v = await api.invoke('dev:vscode-status');
    st.code = v.cli ? 'ok' : 'missing';
    det.code = v.own ? 'Outil de NEXORA installé' : v.installed ? 'Visual Studio Code détecté sur ce PC' : 'À télécharger';
  } catch { st.code = 'unknown'; }
  try {
    const l = await api.invoke('tunnel:list');
    st.tunnel = l.cloudflared ? 'ok' : 'missing';
    det.tunnel = l.cloudflared ? 'Installé' : 'À télécharger';
  } catch { st.tunnel = 'unknown'; }
  state.status = st;
  state.details = det;
  return st;
}

function overall() {
  const sel = cfg().chosen.filter((id) => state.status[id] !== 'ok');
  if (!sel.length) return 1;
  const sum = sel.reduce((a, id) => a + (state.status[id] === 'ok' ? 1 : (state.progress[id] || 0)), 0);
  return sum / sel.length;
}

function render() {
  if (!root) return;
  const c = cfg();
  const allOk = ITEMS.every((x) => state.status[x.id] === 'ok' || !c.chosen.includes(x.id));
  const pct = Math.round(overall() * 100);
  root.querySelector('.su-card').innerHTML = `
    <header class="su-head"><img src="logo.png" alt="" width="40" height="40"><div><h2>${state.running ? 'Veuillez patienter pendant le chargement de l’ensemble de vos outils' : allOk ? 'Tes outils sont prêts' : 'Préparer les outils de NEXORA'}</h2>
      <p>${state.running ? 'NEXORA télécharge et prépare ce dont chaque espace a besoin. Tu peux continuer à travailler : la préparation se poursuit en arrière-plan.' : allOk ? 'Tout est installé : chaque espace est disponible immédiatement.' : 'Une seule fois : chaque outil est ensuite disponible dès que tu ouvres son espace. Décoche ce dont tu n’as pas besoin ; tu pourras l’ajouter plus tard depuis Apparence › NEX-OUTILS.'}</p></div></header>
    <div class="su-bar"><i style="width:${pct}%"></i></div>
    <ul class="su-list">${ITEMS.map((x) => {
    const s = state.status[x.id];
    const ok = s === 'ok';
    const run = state.current === x.id;
    const err = state.errors[x.id];
    const p = Math.round((state.progress[x.id] || 0) * 100);
    return `<li class="su-item ${ok ? 'ok' : ''} ${run ? 'run' : ''} ${err ? 'err' : ''}">
        <label class="su-check">${ok ? `<span class="su-done">${icon('check', 13)}</span>` : `<input type="checkbox" data-su="${x.id}" ${c.chosen.includes(x.id) ? 'checked' : ''} ${state.running ? 'disabled' : ''}><span class="box"></span>`}</label>
        <span class="su-ico">${icon(x.ic, 18)}</span>
        <div class="su-text"><b>${esc(x.label)} <small>${esc(x.space)} · ${esc(x.size)}</small></b><span>${esc(x.desc)}</span>
          <em>${run ? `${esc(state.stepLabel || 'Préparation…')} · ${p} %` : err ? esc(err) : esc(state.details[x.id] || '')}</em>
          ${run ? `<div class="su-ibar"><i style="width:${p}%"></i></div>` : ''}
          ${x.license && !ok ? `<small class="su-lic">En l’installant, tu acceptes la <button class="link-btn" data-external="${x.license}">licence de Visual Studio Code</button> (Microsoft).</small>` : ''}
        </div>
        ${err && !state.running ? `<button class="btn small" data-su-retry="${x.id}">${icon('restart', 13)}<span>Réessayer</span></button>` : ''}
      </li>`;
  }).join('')}</ul>
    <footer class="su-foot">
      ${state.running ? `<button class="btn" data-su-act="bg">${icon('minimize', 14)}<span>Continuer en arrière-plan</span></button><span class="grow"></span><span class="muted">${pct} %</span>`
    : `<button class="btn" data-su-act="later">${allOk ? 'Fermer' : 'Plus tard'}</button><span class="grow"></span>${allOk ? `<button class="btn" data-su-act="check">${icon('refreshCw', 14)}<span>Vérifier les mises à jour</span></button>` : `<button class="btn primary" data-su-act="go">${icon('download', 14)}<span>Tout préparer</span></button>`}`}
    </footer>`;
  updatePill();
}

function updatePill() {
  let pill = document.querySelector('.su-pill');
  if (state.running && state.hidden) {
    if (!pill) {
      pill = document.createElement('button');
      pill.className = 'su-pill glass';
      pill.title = 'Préparation des outils en cours : cliquer pour voir le détail';
      pill.addEventListener('click', () => openSetup());
      document.body.append(pill);
    }
    pill.innerHTML = `<span class="spinner small"></span><span>Outils : ${Math.round(overall() * 100)} %</span>`;
  } else if (pill) pill.remove();
}

function close() {
  if (root) { root.remove(); root = null; }
  state.hidden = state.running;
  updatePill();
}

async function runItem(id) {
  state.current = id;
  state.errors[id] = null;
  state.progress[id] = 0;
  state.stepLabel = 'Démarrage…';
  render();
  const step = (p, label) => { state.progress[id] = Math.max(0, Math.min(1, p || 0)); if (label) state.stepLabel = label; render(); };
  let off = null;
  try {
    if (id === 'android') {
      const parts = state.androidMissing && state.androidMissing.length ? state.androidMissing : [];
      if (!parts.length) return;
      // Licence du SDK Android : acceptée en cochant cet élément (affichée dans l'App Builder).
      const n = parts.length;
      off = api.on('android:progress', (p) => { if (p.part === 'push') return; const i = Math.max(0, parts.indexOf(p.part)); step((i + (p.progress || 0)) / n, p.label); });
      await api.invoke('android:install', parts);
    } else if (id === 'push') {
      if (state.status.android !== 'ok') throw new Error('Il faut d’abord les outils Android.');
      off = api.on('android:progress', (p) => { if (p.part === 'push') step(p.progress, p.label); });
      await api.invoke('android:push-install');
    } else if (id === 'code') {
      off = api.on('dev:vscode', (m) => { if (m.phase === 'download') step((m.progress || 0) * 0.9, 'Téléchargement'); if (m.phase === 'extract') step(0.95, 'Extraction'); });
      await api.invoke('dev:vscode-accept');
      const r = await api.invoke('dev:vscode-download');
      if (r && r.error) throw new Error(r.error);
    } else if (id === 'tunnel') {
      off = api.on('tunnel:progress', (m) => step(m.progress, 'Téléchargement'));
      await api.invoke('tunnel:install');
    }
    state.progress[id] = 1;
  } catch (e) {
    state.errors[id] = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  } finally {
    if (off) off();
  }
}

export async function refreshSetup() { if (!state.running) { await check(); render(); } }

export async function runSetup(ids) {
  if (state.running) return;
  const c = cfg();
  const list = (ids || c.chosen).filter((id) => ITEMS.some((x) => x.id === id));
  c.pending = [...list];
  persist();
  state.running = true;
  render();
  await check();
  for (const x of ITEMS) {
    if (!list.includes(x.id) || state.status[x.id] === 'ok') continue;
    // eslint-disable-next-line no-await-in-loop
    await runItem(x.id);
    // eslint-disable-next-line no-await-in-loop
    await check();
    if (!state.errors[x.id]) { c.pending = c.pending.filter((p) => p !== x.id); persist(); }
  }
  state.running = false;
  state.current = null;
  c.done = true;
  persist();
  render();
  const failed = list.filter((id) => state.errors[id]);
  if (state.hidden || !root) {
    state.hidden = false;
    updatePill();
    if (failed.length) toast(`Préparation des outils : ${failed.length} élément(s) n’ont pas pu être installés.`, { kind: 'bad', action: 'Voir', onAction: () => openSetup() });
    else toast('Tous tes outils sont prêts.');
  }
}

async function checkUpdates() {
  const t = toast('Recherche des mises à jour…', { busy: true, sticky: true });
  try {
    const p = await api.invoke('android:push-latest');
    const updates = [];
    if (p.installed && p.latest && p.latest !== p.version) updates.push(['push', 'nouvelle version du kit de notifications']);
    if (updates.length) {
      state.details.push = `Mise à jour disponible : ${updates[0][1]}`;
      render();
      toast(`Mise à jour disponible : ${updates.map((u) => u[1]).join(', ')}`, { action: 'Installer', onAction: async () => { await api.invoke('android:push-install'); await check(); render(); toast('Kit de notifications mis à jour.'); } });
    } else toast('Tout est à jour.');
  } catch (e) { toast(e.message, { kind: 'bad' }); } finally { t.close(); }
}

export async function openSetup() {
  state.hidden = false;
  if (!root) {
    root = document.createElement('div');
    root.className = 'su-backdrop';
    root.innerHTML = '<div class="su-card glass" role="dialog" aria-modal="true" aria-label="Préparation des outils"></div>';
    document.body.append(root);
    root.addEventListener('change', (e) => {
      const b = e.target.closest('[data-su]');
      if (!b) return;
      const c = cfg();
      const id = b.dataset.su;
      c.chosen = b.checked ? [...new Set([...c.chosen, id])] : c.chosen.filter((x) => x !== id);
      // Le kit de notifications a besoin des outils Android.
      if (id === 'push' && b.checked && !c.chosen.includes('android') && state.status.android !== 'ok') c.chosen.push('android');
      if (id === 'android' && !b.checked) c.chosen = c.chosen.filter((x) => x !== 'push' || state.status.android === 'ok');
      persist();
      render();
    });
    root.addEventListener('click', (e) => {
      const a = e.target.closest('[data-su-act]');
      const r = e.target.closest('[data-su-retry]');
      if (r) { runSetup([r.dataset.suRetry]); return; }
      if (e.target.closest('[data-external]')) return;
      if (!a) return;
      const act = a.dataset.suAct;
      if (act === 'go') runSetup();
      if (act === 'bg') { close(); }
      if (act === 'later') { const c = cfg(); c.done = true; persist(); close(); }
      if (act === 'check') checkUpdates();
    });
  }
  render();
  await check();
  render();
}

/* Au démarrage : premier lancement → fenêtre de préparation ; préparation interrompue → reprise proposée. */
export async function setupOnStart() {
  const c = cfg();
  if (!c.done) { openSetup(); return; }
  if (c.pending && c.pending.length) {
    await check();
    const left = c.pending.filter((id) => state.status[id] !== 'ok');
    if (left.length) toast(`La préparation de ${left.length} outil(s) a été interrompue.`, { sticky: true, action: 'Reprendre', onAction: () => { openSetup(); runSetup(left); } });
    else { c.pending = []; persist(); }
  }
}
