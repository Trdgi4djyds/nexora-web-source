/* « Aller à… » (Ctrl+K) : toutes les sections, fenêtres et projets de NEXORA, à portée de clavier. */
import { S } from './state.js';
import { $, esc } from './dom.js';
import { icon } from './icons.js';
import { settings } from './settings.js';

const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
let box = null;

async function commands() {
  const { setMode, openAppearance, openUiSheet } = await import('../viewer/toolbar.js');
  const go = (m) => () => setMode(m);
  const ab = (sec) => async () => { await setMode('android'); if (S.android) { S.android.section = sec; S.android.renderNav(); S.android.renderForm(); S.android.renderPreview(); } };
  const bl = (tab) => async () => { await setMode('browser'); if (S.browserLab) S.browserLab.openTab(tab); };
  const st = (sp) => async () => { await setMode('studio'); if (S.studio) await S.studio.setSpace(sp); };
  const list = [
    ['home', 'Accueil — tes projets', 'Espace', go('home')],
    ['multi', 'Responsive Lab', 'Espace', go('preview')],
    ['globe', 'Browser Lab', 'Espace', go('browser')],
    ['code', 'Dev Lab', 'Espace', go('dev')],
    ['android', 'App Builder', 'Espace', go('android')],
    ['cube', '3D & Motion Studio', 'Espace', go('studio')],
    ['palette', 'NEX-DESIGN (design 2D)', 'Espace', go('design')],
    ['shield', 'Sécurité du site', 'Espace', go('security')],
  ];
  try {
    const { SECTIONS } = await import('../android/android.js');
    for (const [k, l, ic, h] of SECTIONS) list.push([ic, `App Builder › ${l}`, h, ab(k)]);
  } catch { /* App Builder indisponible */ }
  for (const [k, l, ic] of [['elements', 'Éléments', 'target'], ['network', 'Réseau', 'sync'], ['audit', 'Audit', 'audit'], ['tests', 'Tests', 'pass'], ['scrape', 'Aspirateur', 'download'], ['console', 'Console', 'terminal']]) list.push([ic, `Browser Lab › ${l}`, 'Analyse de page', bl(k)]);
  for (const [k, l, ic] of [['scene', 'Scène 3D', 'cube'], ['mockup', 'Maquettes', 'image'], ['deck', 'Présentation', 'present']]) list.push([ic, `Studio › ${l}`, '3D & Motion', st(k)]);
  list.push(
    ['palette', 'Apparence', 'Thème, couleur, affichage des appareils', () => openAppearance($('#btnAppearance'))],
    ['wrench', 'Personnaliser l’interface', 'Échelle, arrondis, densité', () => openUiSheet()],
    ['download', 'NEX-OUTILS', 'Préparer ou mettre à jour les outils', () => import('./setup.js').then((m) => m.openSetup())],
    ['shield', 'Sauvegarde, mises à jour, mode léger', 'Maintenance', () => import('./maintenance.js').then((m) => m.openMaintenance())],
    ['sparkle', 'Réglages de l’IA', 'Clés et modèles', () => import('./ai.js').then((m) => m.openAiSettings())],
    ['plus', 'Nouveau…', 'Planche, projet, application, scène', () => import('./newwizard.js').then((m) => m.openNewWizard())],
    ['present', 'Visite guidée', 'Présentation de chaque espace', () => import('./tour.js').then((m) => m.startTour({ force: true }))],
  );
  try {
    const { projects, openProject } = await import('./projects.js');
    for (const p of projects()) list.push(['folder', `Projet : ${p.name}`, p.url || p.dir || '', async () => { await openProject(p); setMode('preview'); }]);
  } catch { /* aucun projet */ }
  return list;
}

export async function openPalette() {
  if (box) { close(); return; }
  const all = await commands();
  box = document.createElement('div');
  box.className = 'pal-back';
  box.innerHTML = `<div class="pal glass" role="dialog" aria-label="Aller à"><label class="pal-in">${icon('search', 16)}<input placeholder="Aller à… (section, fenêtre, projet)" spellcheck="false"></label><div class="pal-list" role="listbox"></div><div class="pal-foot"><span>↑↓ choisir</span><span>Entrée ouvrir</span><span>Échap fermer</span></div></div>`;
  document.body.append(box);
  const inp = $('input', box);
  const listEl = $('.pal-list', box);
  let shown = [];
  let sel = 0;
  const render = () => {
    const q = norm(inp.value.trim());
    shown = (q ? all.filter((c) => norm(`${c[1]} ${c[2]}`).includes(q)) : all).slice(0, 60);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    listEl.innerHTML = shown.length ? shown.map((c, i) => `<button class="pal-item${i === sel ? ' on' : ''}" data-i="${i}" role="option">${icon(c[0], 15)}<span><b>${esc(c[1])}</b>${c[2] ? `<small>${esc(c[2])}</small>` : ''}</span></button>`).join('') : '<p class="pal-none">Rien ne correspond.</p>';
    const on = $('.pal-item.on', listEl);
    if (on) on.scrollIntoView({ block: 'nearest' });
  };
  const run = (i) => { const c = shown[i]; close(); if (c) Promise.resolve(c[3]()).catch(() => {}); };
  inp.addEventListener('input', () => { sel = 0; render(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(shown.length - 1, sel + 1); render(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
    if (e.key === 'Enter') { run(sel); e.preventDefault(); }
    if (e.key === 'Escape') { close(); e.preventDefault(); }
  });
  listEl.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) run(Number(b.dataset.i)); });
  box.addEventListener('mousedown', (e) => { if (e.target === box) close(); });
  render();
  inp.focus();
  void settings;
}

function close() { if (box) { box.remove(); box = null; } }

export function initPalette() {
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
      // L'éditeur de code garde son propre Ctrl+K.
      if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.monaco-editor')) return;
      e.preventDefault();
      openPalette();
    }
  }, true);
}
