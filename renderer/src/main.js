/* Point d'entrée de l'interface de NEXORA. */
import { api } from './core/api.js';
import { S } from './core/state.js';
import { settings, loadSettings, persist } from './core/settings.js';
import { $, bus } from './core/dom.js';
import { icon } from './core/icons.js';
import {
  toast, hidePopover, closeSheet, currentSheet,
} from './core/ui.js';
import { applyTheme } from './core/theme.js';
import { initSync } from './core/sync.js';
import { initProjects } from './core/projects.js';
import { initPalette } from './core/palette.js';
import { Board, MAX_DEVICES } from './viewer/board.js';
import {
  initSources, looksLikeUrl, openUrl, openProjectDir, pickProject, updateMessage,
} from './viewer/sources.js';
import { initSidebar, renderSource, renderDeviceList } from './viewer/sidebar.js';
import {
  initToolbar, updateAddress, toggleSidebar, setMode, reloadFocused, addressInput, MODES,
} from './viewer/toolbar.js';
import { resizable } from './core/resize.js';
import { loadSkins } from './devices/skins.js';
import { initSkinSheet } from './viewer/skinsheet.js';
import {
  initDock, renderDock, stepZoom, togglePresent,
} from './viewer/dock.js';
import { initWelcome, renderWelcome } from './viewer/welcome.js';
import {
  initInspector, toggleInspector, openInspector, renderInspector,
} from './inspector/inspector.js';
import { takePhoto } from './capture/photo.js';
import { initRefresh, refresh } from './core/refresh.js';
import { startRecording, stopRecording } from './capture/recorder.js';

// Garde-fou global contre les clics multiples : le 2e clic d'un double-clic sur un bouton (et tout clic
// sur un bouton dont la tâche est en cours, aria-busy) est ignoré. Les boutons qui doivent pouvoir être
// répétés vite (zoom, pas à pas, navigation) restent libres.
const REPEATABLE = /zoom|step|nudge|prev|next|up|down|plus|minus|inc|dec|undo|redo|frame|play|seek/i;
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('button, [role="button"], .btn');
  if (!b) return;
  if (b.getAttribute('aria-busy') === 'true') { e.stopImmediatePropagation(); e.preventDefault(); return; }
  if (e.detail > 1 && !b.closest('[data-multi], .tl, .st-timeline, .seg, .st-camnav, .dock') && !REPEATABLE.test(`${b.dataset.act || ''} ${b.dataset.st || ''} ${b.dataset.a || ''} ${b.id || ''} ${b.className || ''}`)) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
}, true);

// Texte coupé (points de suspension) : son contenu complet apparaît en info-bulle au survol.
document.addEventListener('mouseover', (e) => {
  const el = e.target.closest && e.target.closest('button, .btn, label, a, b, small, span, h2, h3, .st-name, option');
  if (!el || el.title || el.dataset.noAutoTitle != null) return;
  const hiddenLabel = el.matches('button, .btn') && [...el.children].some((c) => c.tagName === 'SPAN' && c.textContent.trim() && getComputedStyle(c).display === 'none');
  if (hiddenLabel || el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2) {
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
    if (t && t.length < 300) el.title = t;
  }
}, { passive: true });

async function boot() {
  await loadSettings();
  await loadSkins();
  document.body.classList.add(`os-${api.platform}`);
  document.body.classList.toggle('no-sidebar', !settings.sidebar);
  applyTheme();
  $('.search-ico').innerHTML = icon('search', 14);

  const board = new Board({ stage: $('#stage'), container: $('#board') });
  S.board = board;
  board.auditJs = window.VitrineAudit ? window.VitrineAudit.js : null;
  // Cadres officiels : redessin quand une image arrive, nouvelle mise en page quand la liste change.
  bus.on('skin-ready', () => { for (const v of board.views.values()) v.draw(); });
  bus.on('skins-changed', () => { for (const v of board.views.values()) v.applyLayout(); board.relayout(); });
  // Barre latérale et inspecteur redimensionnables.
  resizable($('#sidebar'), { key: 'sidebar', edge: 'right', min: 220, max: 440 });
  resizable($('#inspector'), { key: 'inspector', edge: 'left', min: 300, max: () => Math.max(320, window.innerWidth * 0.55) });
  let relayoutRaf = 0;
  bus.on('layout-changed', () => {
    if (relayoutRaf || settings.mode !== 'preview') return;
    relayoutRaf = requestAnimationFrame(() => { relayoutRaf = 0; S.board.relayout(); });
  });
  board.on('limit', () => toast(`La planche contient déjà ${MAX_DEVICES} appareils. Retires-en un pour en ajouter un autre.`, { kind: 'bad' }));
  board.on('layout', () => { renderDeviceList(); updateAddress(); });
  board.on('changed', () => renderDeviceList());

  initSources();
  initSync();
  initProjects();
  initPalette();
  import('./core/tour.js').then((m) => m.tourOnStart()).catch(() => {});
  if (!window.__NEXORA_WEB__) import('./core/maintenance.js').then((m) => m.updatesOnStart()).catch(() => {});
  initSidebar();
  initSkinSheet();
  initToolbar();
  initDock();
  initInspector();
  initWelcome();
  initRefresh();

  renderWelcome();
  renderSource();
  renderDeviceList();
  updateAddress();
  updateMessage();
  renderDock();
  if (settings.inspector) renderInspector();
  board.relayout();
  if (document.fonts) document.fonts.ready.then(() => { for (const v of board.list) v.draw(); });
  // Sans site ouvert, NEXORA s'ouvre sur l'Accueil (tes projets).
  setMode(!S.source && (!settings.mode || settings.mode === 'preview') ? 'home' : settings.mode);
  bindGlobal();

  // NEXORA Cloud : compte, synchronisation et administration (la version web les démarre elle-même).
  if (!window.__NEXORA_WEB__) {
    Promise.all([import('./cloud/session.js'), import('./cloud/ui.js'), import('./cloud/sync.js')])
      .then(async ([s, ui, sy]) => { ui.initCloudUi(); sy.startSync(); await s.initCloud(); })
      .catch((err) => console.warn('[cloud]', err));
  }
  const info = await api.invoke('app:info');
  if (info.autotest) {
    const m = await import('./autotest.js');
    m.runAutotest(info.autotest).catch((err) => { api.invoke('autotest:log', `ERREUR ${err.stack || err}`); api.invoke('autotest:quit'); });
  } else {
    // Premier lancement : préparation de tous les outils (ou reprise d'une préparation interrompue).
    if (!window.__NEXORA_WEB__) setTimeout(() => import('./core/setup.js').then((m) => m.setupOnStart()).catch(() => {}), 900);
  }
}

function bindGlobal() {
  // Coller un lien n'importe où dans la fenêtre l'ouvre directement.
  document.addEventListener('paste', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (settings.mode !== 'preview') return;
    const txt = e.clipboardData.getData('text');
    if (looksLikeUrl(txt)) { e.preventDefault(); openUrl(txt); }
  });

  // Glisser-déposer d'un dossier de projet ou d'un lien.
  const dropzone = $('#dropzone');
  let depth = 0;
  const accepts = () => settings.mode === 'preview';
  window.addEventListener('dragenter', (e) => { if (!e.dataTransfer || !accepts()) return; depth++; dropzone.hidden = false; });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) dropzone.hidden = true; });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    dropzone.hidden = true;
    if (!accepts()) return;
    const file = e.dataTransfer.files[0];
    if (file) { const p = api.pathForFile(file); if (p) { openProjectDir(p); return; } }
    const link = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '').split('\n')[0];
    if (looksLikeUrl(link)) openUrl(link);
  });

  // Raccourcis (transmis par le processus principal, y compris depuis la page affichée).
  api.on('shortcut', (a) => {
    const board = S.board;
    const preview = settings.mode === 'preview';
    switch (a) {
      case 'space-1': case 'space-2': case 'space-3': case 'space-4': case 'space-5': case 'space-6': case 'space-7': setMode(MODES.filter((m) => m[0] !== 'home')[Number(a.slice(6)) - 1][0]); break;
      case 'reload': reloadFocused(); break;
      case 'refresh': refresh(settings.mode, 'space'); break;
      case 'open': pickProject(); break;
      case 'new': import('./core/newwizard.js').then((m) => m.openNewWizard()); break;
      case 'ai': import('./core/ai.js').then((m) => m.toggleAssistant()); break;
      case 'zoom-in': case 'zoom-out': case 'fit': case 'sidebar': case 'inspector':
        if (settings.mode === 'design' && S.design && S.design.shortcut(a)) break;
        if (a === 'zoom-in' && preview) stepZoom(1);
        if (a === 'zoom-out' && preview) stepZoom(-1);
        if (a === 'fit' && preview) { board.setZoom('fit'); renderDock(); }
        if (a === 'inspector') { if (preview) toggleInspector(); else import('./viewer/toolbar.js').then((m) => m.togglePanel('right')); }
        if (a === 'sidebar') { if (preview) toggleSidebar(); else import('./viewer/toolbar.js').then((m) => m.togglePanel('left')); }
        break;
      case 'focus-address': addressInput().focus(); break;
      case 'focus-search': if (!settings.sidebar) toggleSidebar(true); $('#deviceSearch').focus(); break;
      case 'console': openInspector('console'); break;
      case 'panel-left': import('./viewer/toolbar.js').then((m) => m.togglePanel('left')); break;
      case 'panel-right': import('./viewer/toolbar.js').then((m) => m.togglePanel('right')); break;
      case 'ui-zoom-in': import('./viewer/toolbar.js').then((m) => m.stepUiScale(1)); break;
      case 'ui-zoom-out': import('./viewer/toolbar.js').then((m) => m.stepUiScale(-1)); break;
      case 'ui-zoom-reset': import('./viewer/toolbar.js').then((m) => m.stepUiScale(0)); break;
      case 'photo': if (preview) takePhoto(); break;
      case 'record': if (S.recorder) stopRecording(); else if (preview) startRecording(); break;
      case 'present': if (preview) togglePresent(); break;
      case 'exit-present': if (S.presenting) togglePresent(false); break;
      case 'rotate': board.focused.rotate(); break;
      case 'fold': board.focused.cycleState(); break;
      default: break;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#popover').hidden) hidePopover();
    else if (currentSheet()) closeSheet();
    else if (S.presenting) togglePresent(false);
  });
  window.addEventListener('beforeunload', () => persist());
  bus.on('theme', () => { for (const v of S.board.list) v.draw(); });
}

boot().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:auto 12px 12px;z-index:99;background:#fff;color:#c00;padding:12px;border-radius:8px;white-space:pre-wrap">${String(err && err.stack ? err.stack : err).replace(/</g, '&lt;')}</pre>`);
});
