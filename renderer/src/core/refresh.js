/* Rafraîchissement : chaque espace et chaque panneau peut être rechargé sans redémarrer NEXORA.
   - Bouton « Rafraîchir l'espace » de la barre d'outils (F5).
   - Petit bouton ⟳ ajouté automatiquement dans l'en-tête de chaque panneau (liste des appareils,
     inspecteur, onglets du Browser Lab, volets du Dev Lab, sections de l'App Builder, panneaux du
     Studio, Sécurité, Accueil, fenêtres). */
import { S } from './state.js';
import { settings } from './settings.js';
import { $, bus } from './dom.js';
import { icon } from './icons.js';
import { toast } from './ui.js';

const LABELS = {
  design: 'NEX-DESIGN', home: 'Accueil', preview: 'Responsive Lab', browser: 'Browser Lab', dev: 'Dev Lab', android: 'App Builder', studio: '3D & Motion', security: 'Sécurité',
};

// [sélecteur de l'en-tête où placer le bouton, espace, portée, libellé]
const TARGETS = [
  ['#sidebar .side-top', 'preview', 'devices', 'la liste des appareils'],
  ['#inspector .ins-tabs', 'preview', 'inspector', "l'inspecteur"],
  ['#home .hm-bar', 'home', 'projects', 'les projets'],
  ['#browserlab .bl-tabs', 'browser', 'panel', 'ce panneau'],
  ['#devlab .dk-side-head', 'dev', 'side', 'ce volet'],
  ['#devlab .dk-side-empty', 'dev', 'side', 'ce volet'],
  ['#devlab .dk-tabs', 'dev', 'tabs', 'les fichiers ouverts'],
  ['#devlab .pv-bar', 'dev', 'preview', "l'aperçu"],
  ['#android .ab-apps', 'android', 'nav', 'les applications'],
  ['#android .ab-head', 'android', 'form', 'cette section'],
  ['#android .ab-prev-head', 'android', 'preview', "l'aperçu du téléphone"],
  ['#studio #stObjHead', 'studio', 'left', 'le panneau de gauche'],
  ['#studio .st-space-left > .st-head:first-child', 'studio', 'left', 'le panneau de gauche'],
  ['#studio #stProps .st-head', 'studio', 'right', 'le panneau des réglages', 'first'],
  ['#studio .st-toolbar', 'studio', 'view', 'la vue'],
  ['#studio .tl-bar', 'studio', 'timeline', 'la timeline'],
  ['#design .dz-doc', 'design', 'space', 'NEX-DESIGN'],
  ['#security .sec-head', 'security', 'body', 'ce panneau'],
  ['#security .mon-sites .mon-h-act', 'security', 'monitor', 'la supervision'],
  ['#sheet .sheet-head', 'sheet', 'sheet', 'cette fenêtre', 'sheet'],
  ['.su-card .su-head', 'setup', 'setup', 'l’état des outils'],
];

const btnHtml = (mode, scope, what) => `<button type="button" class="rf-btn" data-rf="${mode}:${scope}" title="Rafraîchir ${what}" aria-label="Rafraîchir ${what}">${icon('refreshCw', 13)}</button>`;

function inject() {
  for (const [sel, mode, scope, what, flag] of TARGETS) {
    if (flag === 'sheet' && !($('#sheet') && $('#sheet').refresh)) continue;
    const hosts = flag === 'first' ? [document.querySelector(sel)].filter(Boolean) : document.querySelectorAll(sel);
    for (const host of hosts) {
      if (host.querySelector(':scope > .rf-btn')) continue;
      host.insertAdjacentHTML('beforeend', btnHtml(mode, scope, what));
      host.classList.add('rf-host');
    }
  }
}

// ------------------------------------------------------------------ actions par espace
async function refreshPreview(scope) {
  const sb = await import('../viewer/sidebar.js');
  if (scope === 'devices' || scope === 'space') { sb.renderSource(); sb.renderDeviceList(); }
  if (scope === 'inspector' || scope === 'space') {
    const ins = await import('../inspector/inspector.js');
    if (settings.inspector) {
      if (settings.inspectorTab === 'audit') await ins.runAudit();
      else if (settings.inspectorTab === 'code') ins.refreshCode();
      ins.renderInspector();
    }
  }
  if (scope === 'space') {
    if (S.board && S.board.views.size) S.board.reloadAll();
    const dock = await import('../viewer/dock.js');
    dock.renderDock();
    const wel = await import('../viewer/welcome.js');
    wel.renderWelcome();
    const tb = await import('../viewer/toolbar.js');
    tb.updateAddress();
    if (S.board) S.board.relayout();
  }
}

async function refreshHome() {
  if (S.home) S.home.render();
}

async function refreshBrowser(scope) {
  const b = S.browserLab;
  if (!b) return;
  if (scope === 'space' && b.wv) { try { b.wv.reload(); } catch { /* page fermée */ } }
  const k = b.st.tab;
  if (k === 'devtools') { const pane = $(`[data-pane="devtools"]`, b.el); if (pane) b.openDevtools(pane); return; }
  const p = b.panels.get(k);
  if (!p) { await b.openTab(k); return; }
  if (k === 'elements' && p.loadSections) { p.info = null; await p.loadSections(); return; }
  if (p.refresh) await p.refresh();
  else if (p.render) p.render();
  else if (p.paint) p.paint();
  if (p.activate) p.activate();
}

async function refreshDev(scope) {
  const d = S.devLab;
  if (!d) return;
  if (scope === 'side' || scope === 'space') {
    if (d.st.side === 'files' && d.st.root) await d.openFolder(d.st.root, { restore: true });
    else if (d.st.side === 'git' && d.git) await d.git.refresh();
    else if (d.st.side === 'github' && d.github && d.github.loadRepoTab) { d.renderSide(); }
    else d.renderSide();
  }
  if (scope === 'tabs' || scope === 'space') { if (d.renderTabs) d.renderTabs(); if (d.layoutEditor) d.layoutEditor(); }
  if (scope === 'preview' || scope === 'space') {
    const pv = d.preview;
    if (pv && pv.wv) { try { pv.wv.reload(); } catch { /* fermée */ } }
    if (pv) pv.layout();
  }
  if (scope === 'space' && d.git && d.st.root && d.st.side !== 'git') await d.git.refresh().catch(() => {});
}

async function refreshAndroid(scope) {
  const a = S.android;
  if (!a) return;
  if (scope === 'nav') { a.renderApps(); a.renderNav(); return; }
  if (scope === 'form') { a.renderForm(); return; }
  if (scope === 'preview') { a.phoneKey = null; a.renderDevRow(); a.renderPreview(); a.layoutPhone(); return; }
  a.render();
  a.renderPreview();
  await Promise.all([a.refreshTools(), a.refreshKey()]).catch(() => {});
}

async function refreshStudio(scope) {
  const s = S.studio;
  if (!s || !s.ready) return;
  const all = scope === 'space';
  if (scope === 'left' || all) { s.renderList(); s.renderPresets(); s.renderSpaceLeft(); }
  if (scope === 'right' || all) { s._propsKey = null; s.renderProps(); }
  if (scope === 'timeline' || all) { if (s.timeline) s.timeline.render(); }
  if (scope === 'view' || all) {
    if (s.space === 'mockup' && s.mockup) s.mockup.draw();
    s.resize();
    s.dirty = true;
  }
  // Rafraîchir tout l'espace reprend aussi les captures du site dans les écrans des appareils.
  if (all && s.space === 'scene' && s.siteUrl && s.siteUrl() && s.refreshSiteScreens) await s.refreshSiteScreens().catch(() => {});
}

async function refreshSecurity(scope) {
  const s = S.security;
  if (!s) return;
  if (s.tab === 'supervision' || scope === 'monitor') { await s.renderMonitor(); return; }
  if (scope === 'space' && s.report && !s.scanning) { await s.scan(); return; }
  if (s.report) s.renderReport(); else s.render();
}

async function refreshDesign() {
  const d = S.design;
  if (!d || !d.ready) return;
  d.resize();
  d.renderLeft();
  d.renderProps();
  await d.refresh3d();
}

async function refreshSheet() {
  const sh = $('#sheet');
  if (sh && typeof sh.refresh === 'function') await sh.refresh();
}

async function refreshSetupSheet() {
  const m = await import('./setup.js');
  await m.refreshSetup();
}

const BY_MODE = {
  preview: refreshPreview, home: refreshHome, browser: refreshBrowser, dev: refreshDev, android: refreshAndroid, studio: refreshStudio, design: refreshDesign, security: refreshSecurity, sheet: refreshSheet, setup: refreshSetupSheet,
};

let busy = false;
export async function refresh(mode = settings.mode, scope = 'space', btn = null) {
  if (busy) return;
  const fn = BY_MODE[mode];
  if (!fn) return;
  busy = true;
  const spinners = [btn, scope === 'space' ? $('#btnRefresh') : null].filter(Boolean);
  for (const b of spinners) b.classList.add('spinning');
  const t0 = Date.now();
  try {
    await fn(scope);
    bus.emit('refreshed', { mode, scope });
    if (scope === 'space') toast(`${LABELS[mode] || 'Espace'} rafraîchi`, { ms: 1400 });
  } catch (err) {
    console.error(err);
    toast(`Le rafraîchissement n'a pas abouti : ${err.message || err}`, { kind: 'bad' });
  } finally {
    // Rotation visible au moins un tour, même si c'est instantané.
    setTimeout(() => { for (const b of spinners) b.classList.remove('spinning'); }, Math.max(0, 550 - (Date.now() - t0)));
    busy = false;
    requestAnimationFrame(inject);
  }
}

export function initRefresh() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.rf-btn[data-rf]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const [mode, scope] = b.dataset.rf.split(':');
    refresh(mode, scope, b);
  }, true);
  let raf = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; inject(); }); };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  inject();
}
