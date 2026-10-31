/* Barre d'outils : les espaces de NEXORA, navigation et adresse de l'appareil sélectionné. */
import { api } from '../core/api.js';
import { S } from '../core/state.js';
import { settings, persist } from '../core/settings.js';
import { $, bus, esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import {
  toast, showPopover, hidePopover, seg, toggle, openSheet, closeSheet, currentSheet,
} from '../core/ui.js';
import {
  ACCENTS, UI_DEFAULTS, isDark, applyTheme,
} from '../core/theme.js';
import { looksLikeUrl, normalizeUrl, openUrl } from './sources.js';

// Espaces : [identifiant, nom, icône, module chargé à la demande, élément, fonction d'ouverture, nom court, description]
export const MODES = [
  ['home', 'Accueil', 'home', () => import('../home/home.js'), '#home', 'openHome', 'Accueil', 'Tableau de bord de tes projets'],
  ['preview', 'Responsive Lab', 'multi', null, null, null, 'Responsive', 'Ton site sur de vrais appareils'],
  ['browser', 'Browser Lab', 'globe', () => import('../browser/browserlab.js'), '#browserlab', 'openBrowserLab', 'Browser', 'Analyse, réseau, audit et tests'],
  ['dev', 'Dev Lab', 'code', () => import('../dev/devlab.js'), '#devlab', 'openDevLab', 'Dev', 'Code, terminal, Git et aperçu'],
  ['android', 'App Builder', 'android', () => import('../android/android.js'), '#android', 'openAndroid', 'Apps', 'Application Android et iPhone'],
  ['studio', '3D & Motion', 'cube', () => import('../studio/studio.js'), '#studio', 'openStudio', 'Studio', 'Scènes 3D, maquettes, présentations'],
  ['design', 'NEX-DESIGN', 'palette', () => import('../design/design.js'), '#design', 'openDesign', 'Design', 'Design 2D, illustration, retouche et calques 3D'],
  ['security', 'Sécurité', 'shield', () => import('../security/security.js'), '#security', 'openSecurity', 'Sécurité', 'Audit, supervision et alertes'],
];

// Titre de la barre d'outils : espace ouvert et projet en cours.
export function updateTitle(mode = settings.mode) {
  const def = MODES.find((m) => m[0] === mode);
  const el = $('#tbTitle');
  if (!el || !def) return;
  const proj = S.source ? (S.source.name || S.source.url || '') : '';
  el.querySelector('b').textContent = def[1];
  const ic = $('#tbIcon');
  if (ic) { ic.innerHTML = icon(def[2], 16); ic.dataset.space = mode; }
  el.querySelector('small').textContent = proj ? `${def[7]} · ${proj}` : def[7];
}
const SPACE_STATE = { home: 'home', browser: 'browserLab', dev: 'devLab', android: 'android', studio: 'studio', design: 'design', security: 'security' };

const input = () => $('#addressInput');

export function updateAddress() {
  const v = S.board && S.board.focused;
  const url = v ? v.url : null;
  const can = Boolean(v && v.ready && url);
  let back = false;
  let fwd = false;
  try { back = can && v.wv.canGoBack(); fwd = can && v.wv.canGoForward(); } catch { /* webview pas prête */ }
  $('#btnBack').disabled = !back;
  $('#btnForward').disabled = !fwd;
  const loading = Boolean(v && v.loading);
  $('#btnReload').innerHTML = icon(loading ? 'stopLoad' : 'reload');
  $('#btnReload').disabled = !url;
  let ic = 'link';
  if (S.source && S.source.mode === 'project') ic = 'folder';
  else if (url && url.startsWith('https:')) ic = 'lock';
  else if (url) ic = 'globe';
  $('#addrIcon').innerHTML = icon(ic, 14);
  $('#addressForm').classList.toggle('loading', loading);
  const multi = S.board && S.board.multi && S.board.views.size > 1;
  $('#addrDevice').hidden = !multi;
  if (multi && v) $('#addrDevice').innerHTML = `<span class="ad-dot" style="--c:${esc(v.cfg.color || '#8e8e93')}"></span>${esc(v.dev.name)}`;
  const el = input();
  if (document.activeElement === el) return;
  if (!url) { el.value = ''; return; }
  try {
    const cur = new URL(url);
    if (S.source && S.source.mode === 'project' && S.baseUrl && cur.origin === new URL(S.baseUrl).origin) el.value = cur.pathname + cur.search + cur.hash;
    else el.value = cur.href.replace(/\/$/, '');
  } catch { el.value = url; }
}

function go(url) {
  const board = S.board;
  if (board.multi && settings.sync.nav) board.loadAll(url);
  else board.focused.load(url);
}

export function toggleSidebar(force) {
  settings.sidebar = force ?? !settings.sidebar;
  persist();
  document.body.classList.toggle('no-sidebar', !settings.sidebar);
  requestAnimationFrame(() => { S.board.relayout(); bus.emit('layout-changed'); });
}

// ------------------------------------------------------------------ panneaux latéraux de chaque espace
// Bouton « panneau gauche » et « panneau droit » de la barre d'outils, Ctrl+Alt+← / Ctrl+Alt+→ (et Ctrl+B / Ctrl+I) :
// masquer ou restaurer les panneaux de l'espace ouvert. L'état est retenu par espace.
const PANELS = {
  browser: [null, '#browserlab .bl-panel'],
  dev: ['#devlab .dk-sidepane', '#devlab .dk-preview'],
  android: ['#android .ab-nav', '#android .ab-side'],
  studio: ['#studio .st-left', '#studio .st-right'],
  design: ['#design .dz-left', '#design .dz-right'],
};
export function panelHidden(mode, side) { return Boolean(settings.hidePanels && settings.hidePanels[mode] && settings.hidePanels[mode][side]); }
export function applyPanels(mode = settings.mode) {
  const def = PANELS[mode];
  if (def) {
    ['left', 'right'].forEach((side, i) => {
      const sel = def[i];
      if (!sel || (mode === 'dev' && side === 'right')) return;
      const el = document.querySelector(sel);
      if (el) el.classList.toggle('pane-hidden', panelHidden(mode, side));
    });
  }
  const l = $('#btnSidebar'); const r = $('#btnPanelRight');
  if (l) l.classList.toggle('on', mode === 'preview' ? settings.sidebar : Boolean(def && def[0]) && !panelHidden(mode, 'left'));
  if (l) l.disabled = mode !== 'preview' && !(def && def[0]);
  if (r) { r.classList.toggle('on', Boolean(def && def[1]) && (mode === 'dev' ? Boolean(S.devLab && S.devLab.st.preview) : !panelHidden(mode, 'right'))); r.disabled = !(def && def[1]); }
}
export function togglePanel(side, force) {
  const mode = settings.mode;
  if (mode === 'preview') { if (side === 'left') { toggleSidebar(force); applyPanels(mode); } else import('../inspector/inspector.js').then((m) => m.toggleInspector(force)); return; }
  const def = PANELS[mode];
  if (!def || !def[side === 'left' ? 0 : 1]) return;
  if (mode === 'dev' && side === 'right') {
    const b = document.querySelector('#devlab [data-act="toggle-preview"]');
    if (b) b.click();
    requestAnimationFrame(() => applyPanels(mode));
    return;
  }
  settings.hidePanels = settings.hidePanels || {};
  const cur = settings.hidePanels[mode] || {};
  cur[side] = force !== undefined ? !force : !cur[side];
  settings.hidePanels[mode] = cur;
  persist();
  applyPanels(mode);
  bus.emit('layout-changed');
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

// ------------------------------------------------------------------ modes
let modeSeq = 0;
export async function setMode(mode) {
  if (!MODES.some((m) => m[0] === mode)) mode = 'preview';
  const seq = ++modeSeq;
  settings.mode = mode;
  persist();
  document.body.dataset.mode = mode;
  for (const b of document.querySelectorAll('#modeSeg [data-mode]')) {
    b.classList.toggle('on', b.dataset.mode === mode);
    b.setAttribute('aria-selected', String(b.dataset.mode === mode));
  }
  // Le Responsive Lab reste affiché sous les autres espaces : ses pages continuent de tourner
  // (le Studio en capture les écrans, le Browser Lab peut reprendre la page ouverte).
  for (const m of MODES) if (m[4]) $(m[4]).hidden = mode !== m[0];
  hidePopover();
  // Rien ne reste ouvert d'un espace à l'autre : fenêtres, menus et mise en scène 2D se ferment.
  if (currentSheet()) closeSheet();
  if (mode !== 'preview') { const ps = document.querySelector('.poses [data-ps="close"]'); if (ps) ps.click(); }
  if (mode === 'preview') requestAnimationFrame(() => S.board.relayout());
  for (const [id, , , , , ] of MODES) {
    const inst = S[SPACE_STATE[id]];
    if (id !== mode && inst && inst.pause) inst.pause();
  }
  const def = MODES.find((m) => m[0] === mode);
  if (def[3]) {
    const first = !S[SPACE_STATE[mode]];
    const busy = first && mode === 'studio' ? toast('Ouverture du Studio 3D…', { busy: true, sticky: true }) : null;
    try {
      const m = await def[3]();
      await m[def[5]]($(def[4]));
    } catch (err) {
      console.error(err);
      toast(`${def[1]} n'a pas pu s'ouvrir.`, { kind: 'bad' });
    }
    if (busy) busy.close();
  }
  // Un autre espace a été demandé pendant l'ouverture de celui-ci : c'est lui qui gagne.
  if (seq !== modeSeq) return;
  applyPanels(mode);
  updateTitle(mode);
  bus.emit('mode', mode);
}

// ------------------------------------------------------------------ apparence
export function openAppearance(anchor) {
  const pop = showPopover(anchor, `
    <div class="pop-title">Apparence</div>
    ${seg('appTheme', settings.appTheme, { light: `${icon('sun', 15)}<span>Clair</span>`, dark: `${icon('moon', 15)}<span>Sombre</span>`, system: `${icon('auto', 15)}<span>Auto</span>` })}
    <div class="pop-sub">Couleur d'accentuation</div>
    <div class="swatches">${Object.entries(ACCENTS).map(([k, v]) => `<button class="swatch${settings.accent === k ? ' on' : ''}" style="--c:${isDark() ? v[1] : v[0]}" data-accent="${k}" title="${v[2]}" aria-label="${v[2]}"></button>`).join('')}</div>
    <div class="pop-sub">Affichage des appareils</div>
    ${toggle('displayHD', 'Écrans en haute définition', "La page est dessinée à la définition réelle de l'appareil : texte net, photos et vidéos en pleine définition", settings.displayHD)}
    ${toggle('framesOn', "Cadre de l'appareil", '', settings.framesOn)}
    ${toggle('statusBar', "Barre d'état", 'Heure, réseau et batterie en haut de l\'écran', settings.statusBar)}
    <button class="btn wide" data-ui-more>${icon('wrench', 14)}<span>Personnaliser l'interface…</span></button>
    <button class="btn wide" data-tools>${icon('download', 14)}<span>NEX-OUTILS…</span></button>
    <button class="btn wide" data-maint>${icon('shield', 14)}<span>Sauvegarde, mises à jour, mode léger…</span></button>`, { width: 320 });
  if (!pop) return;
  pop.onclick = (e) => {
    if (e.target.closest('[data-ui-more]')) { hidePopover(); openUiSheet(); return; }
    if (e.target.closest('[data-tools]')) { hidePopover(); import('../core/setup.js').then((m) => m.openSetup()); return; }
    if (e.target.closest('[data-maint]')) { hidePopover(); import('../core/maintenance.js').then((m) => m.openMaintenance()); return; }
    const s = e.target.closest('[data-set="appTheme"]');
    if (s) { settings.appTheme = s.dataset.val; persist(); applyTheme(); hidePopover(); openAppearance(anchor); return; }
    const a = e.target.closest('[data-accent]');
    if (a) { settings.accent = a.dataset.accent; persist(); applyTheme(); hidePopover(); openAppearance(anchor); }
  };
  pop.onchange = async (e) => {
    const t = e.target.closest('[data-toggle]');
    if (!t) return;
    settings[t.dataset.toggle] = t.checked;
    persist();
    await S.board.refreshAll();
    bus.emit('board-changed');
  };
}

// Échelle de l'interface : 100 % = taille d'origine ; paliers réduits pour les petits écrans.
export const UI_SCALES = [0.7, 0.8, 0.85, 0.95, 1, 1.1, 1.25];
export function setUiScale(v) {
  settings.ui = { ...UI_DEFAULTS, ...(settings.ui || {}) };
  settings.ui.scale = v;
  persist();
  applyTheme();
  toast(`Échelle de l’interface : ${Math.round(v * 100)} %`);
}
export function stepUiScale(dir) {
  const cur = (settings.ui && settings.ui.scale) || 1;
  let i = UI_SCALES.findIndex((v) => Math.abs(v - cur) < 0.001);
  if (i < 0) i = UI_SCALES.indexOf(1);
  if (dir === 0) setUiScale(1);
  else setUiScale(UI_SCALES[Math.max(0, Math.min(UI_SCALES.length - 1, i + dir))]);
}

// Réglages complets de l'interface (densité, taille, arrondis, transparence, animations, police, fond).
export function openUiSheet() {
  settings.ui = { ...UI_DEFAULTS, ...(settings.ui || {}) };
  const u = settings.ui;
  const chips = (k, map) => `<div class="st-chips">${Object.entries(map).map(([v, l]) => `<button class="st-chip${String(u[k]) === String(v) ? ' on' : ''}" data-ui="${k}" data-val="${esc(v)}">${l}</button>`).join('')}</div>`;
  const row = (label, html, hint = '') => `<div class="ui-row"><div><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</div>${html}</div>`;
  const render = () => `
    <div class="sheet-head"><span class="sheet-icon">${icon('palette', 22)}</span><div><h2>Personnaliser l'interface</h2><p>Les changements s'appliquent tout de suite, dans tous les espaces.</p></div></div>
    <div class="sheet-body ui-body">
      ${row('Thème', seg('appTheme', settings.appTheme, { light: `${icon('sun', 15)}<span>Clair</span>`, dark: `${icon('moon', 15)}<span>Sombre</span>`, system: `${icon('auto', 15)}<span>Auto</span>` }))}
      ${row("Couleur d'accentuation", `<div class="swatches">${Object.entries(ACCENTS).map(([k, v]) => `<button class="swatch${settings.accent === k ? ' on' : ''}" style="--c:${isDark() ? v[1] : v[0]}" data-accent="${k}" title="${v[2]}"></button>`).join('')}<label class="swatch custom${settings.accent === 'custom' ? ' on' : ''}" style="--c:${esc(u.accentCustom)}" title="Couleur personnalisée"><input type="color" value="${esc(u.accentCustom)}" data-ui-accent></label></div>`)}
      ${row('Échelle de l’interface', `<div class="st-chips ui-scales">${UI_SCALES.map((v) => `<button class="st-chip${Math.abs(u.scale - v) < 0.001 ? ' on' : ''}" data-ui-scale-set="${v}">${Math.round(v * 100)} %</button>`).join('')}</div>`, 'Tout le logiciel : panneaux, menus, fenêtres, outils (Ctrl+Alt+− / Ctrl+Alt+= / Ctrl+Alt+0)')}
      ${row('Densité', chips('density', { compact: 'Compacte', normal: 'Normale', comfy: 'Aérée' }), 'Espacement des listes, barres et panneaux')}
      ${row('Arrondis', chips('radius', { square: 'Nets', normal: 'Normaux', round: 'Très arrondis' }))}
      ${row('Transparence', chips('glass', { solid: 'Opaque', normal: 'Verre', clear: 'Verre léger' }), 'Effet « Liquid Glass » des barres flottantes')}
      ${row('Animations', chips('motion', { normal: 'Normales', reduced: 'Réduites', none: 'Aucune' }))}
      ${row('Police', chips('font', { inter: 'Inter', system: 'Système', rounded: 'Arrondie', serif: 'Classique', mono: 'Code' }))}
      ${row('Fond de la scène', chips('stage', { default: 'Par défaut', plain: 'Uni', cool: 'Froid', warm: 'Chaud', mint: 'Menthe', dusk: 'Crépuscule', dark: 'Sombre' }), 'Derrière les appareils du Responsive Lab')}
      ${row('Contraste renforcé', `<label class="check-row"><input type="checkbox" data-ui-check="contrast" ${u.contrast ? 'checked' : ''}><span class="box"></span><span>Séparateurs et textes secondaires plus marqués</span></label>`)}
      ${row('Libellés des onglets', `<label class="check-row"><input type="checkbox" data-ui-check="labels" ${u.labels ? 'checked' : ''}><span class="box"></span><span>Afficher les noms des espaces (sinon icônes seules)</span></label>`)}
    </div>
    <div class="sheet-foot"><button class="btn" data-ui-reset>Réglages d'origine</button><span class="grow"></span><button class="btn primary" data-sheet="close">Terminé</button></div>`;
  const sheet = openSheet('ui', render(), { wide: true });
  const rerender = () => { const top = sheet.querySelector('.sheet-body').scrollTop; sheet.innerHTML = render(); sheet.querySelector('.sheet-body').scrollTop = top; };
  sheet.refresh = rerender;
  sheet.onclick = (e) => {
    const sc = e.target.closest('[data-ui-scale-set]');
    if (sc) { setUiScale(Number(sc.dataset.uiScaleSet)); rerender(); return; }
    const c = e.target.closest('[data-ui]');
    if (c) { u[c.dataset.ui] = c.dataset.val; persist(); applyTheme(); rerender(); return; }
    const t = e.target.closest('[data-set="appTheme"]');
    if (t) { settings.appTheme = t.dataset.val; persist(); applyTheme(); rerender(); return; }
    const a = e.target.closest('[data-accent]');
    if (a) { settings.accent = a.dataset.accent; persist(); applyTheme(); rerender(); return; }
    if (e.target.closest('[data-ui-reset]')) { settings.ui = { ...UI_DEFAULTS }; settings.accent = 'nexora'; persist(); applyTheme(); closeSheet('ui'); openUiSheet(); }
  };
  sheet.oninput = (e) => {
    if (e.target.matches('[data-ui-scale]')) { u.scale = Number(e.target.value); sheet.querySelector('[data-ui-scale-val]').textContent = `${Math.round(u.scale * 100)} %`; }
  };
  sheet.onchange = (e) => {
    const t = e.target;
    if (t.matches('[data-ui-scale]')) { persist(); applyTheme(); }
    if (t.matches('[data-ui-accent]')) { u.accentCustom = t.value; settings.accent = 'custom'; persist(); applyTheme(); rerender(); }
    if (t.dataset.uiCheck) { u[t.dataset.uiCheck] = t.checked; persist(); applyTheme(); }
  };
}

// ------------------------------------------------------------------ initialisation
export function initToolbar() {
  $('#modeSeg').innerHTML = MODES.map(([id, label, ic, , , , short], i) => `${i === 1 ? '<span class="rail-sep"></span>' : ''}<button role="tab" data-mode="${id}" class="${settings.mode === id ? 'on' : ''}" aria-selected="${settings.mode === id}" title="${label}${i ? ` (Ctrl+${i})` : ''}"><span class="rail-ic">${icon(ic, 19)}</span><span class="rail-lb">${short}</span></button>`).join('');
  $('#btnSidebar').innerHTML = icon('sidebar');
  $('#btnBack').innerHTML = icon('back');
  $('#btnForward').innerHTML = icon('forward');
  $('#btnReload').innerHTML = icon('reload');
  $('#btnAppearance').innerHTML = `<span class="rail-ic">${icon('palette', 19)}</span><span class="rail-lb">Réglages</span>`;
  $('#btnNew').innerHTML = `<span class="rail-ic">${icon('plus', 19)}</span><span class="rail-lb">Nouveau</span>`;
  $('#btnNew').addEventListener('click', () => import('../core/newwizard.js').then((m) => m.openNewWizard()));
  $('#btnAI').innerHTML = `<span class="rail-ic">${icon('sparkle', 19)}</span><span class="rail-lb">IA</span>`;
  $('#btnGo').innerHTML = `${icon('search', 15)}<span>Rechercher ou aller à…</span><kbd>Ctrl K</kbd>`;
  $('#btnRefresh').innerHTML = icon('refreshCw', 17);
  $('#btnRefresh').addEventListener('click', () => import('../core/refresh.js').then((m) => m.refresh(settings.mode, 'space')));
  bus.on('source', () => updateTitle());
  updateTitle();
  $('#btnGo').addEventListener('click', () => import('../core/palette.js').then((m) => m.openPalette()));
  $('#btnAI').addEventListener('click', () => import('../core/ai.js').then((m) => m.toggleAssistant()));
  bus.on('mode', () => { if (document.querySelector('.ai-drawer')) import('../core/ai.js').then((m) => m.aiModeChanged()); });
  $('#btnInspector').innerHTML = `${icon('inspector')}<span class="err-dot"></span>`;

  $('#modeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]');
    if (b) setMode(b.dataset.mode);
  });
  const el = input();
  el.addEventListener('focus', () => {
    const v = S.board.focused;
    if (v && v.url && S.source && S.source.mode === 'url') el.value = v.url;
    setTimeout(() => el.select(), 0);
  });
  el.addEventListener('blur', () => setTimeout(updateAddress, 100));
  $('#addressForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = el.value.trim();
    if (!v) return;
    el.blur();
    if (S.source && S.baseUrl && /^[/?#]/.test(v)) {
      try { go(new URL(v, S.baseUrl).href); } catch { toast("Cette adresse n'est pas valide.", { kind: 'bad' }); }
      return;
    }
    if (looksLikeUrl(v)) {
      try {
        const u = normalizeUrl(v);
        if (S.source && S.baseUrl && new URL(u).origin === new URL(S.baseUrl).origin) { go(u); return; }
      } catch { /* adresse invalide */ }
      openUrl(v);
      return;
    }
    if (S.source && S.baseUrl) { try { go(new URL(`/${v}`, S.baseUrl).href); } catch { /* ignore */ } return; }
    toast("Colle le lien complet d'un site, par exemple https://monsite.com", { kind: 'bad' });
  });
  $('#btnBack').addEventListener('click', () => { const v = S.board.focused; if (v.wv.canGoBack()) v.wv.goBack(); });
  $('#btnForward').addEventListener('click', () => { const v = S.board.focused; if (v.wv.canGoForward()) v.wv.goForward(); });
  $('#btnReload').addEventListener('click', () => {
    const v = S.board.focused;
    if (v.loading) v.wv.stop();
    else if (S.board.multi && settings.sync.nav) S.board.reloadAll();
    else v.reload();
  });
  $('#btnSidebar').addEventListener('click', () => togglePanel('left'));
  $('#btnPanelRight').innerHTML = icon('sidebarRight');
  $('#btnPanelRight').addEventListener('click', () => togglePanel('right'));
  $('#btnAppearance').addEventListener('click', (e) => openAppearance(e.currentTarget));

  const board = S.board;
  for (const ev of ['focus', 'navigate', 'view-loading', 'view-ready', 'changed']) board.on(ev, () => updateAddress());
  bus.on('source', updateAddress);
}

export function reloadFocused() {
  if (S.board.multi && settings.sync.nav) S.board.reloadAll();
  else S.board.focused.reload();
}

export const addressInput = input;
export { api };
