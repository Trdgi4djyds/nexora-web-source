/* Dock flottant sous les appareils : mode de l'appareil, rotation, zoom, planche, photo, vidéo. */
import { api } from '../core/api.js';
import { S } from '../core/state.js';
import { settings, persist } from '../core/settings.js';
import { $, esc, bus } from '../core/dom.js';
import { icon } from '../core/icons.js';
import {
  showPopover, hidePopover, seg, toggle, refreshSeg,
} from '../core/ui.js';
import { defaultColor } from '../devices/catalog.js';
import { openPhotoMenu } from '../capture/photo.js';
import { startRecording, stopRecording } from '../capture/recorder.js';

const ZOOM_STEPS = [0.05, 0.08, 0.1, 0.125, 0.15, 0.2, 0.25, 0.33, 0.4, 0.5, 0.6, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 2, 2.5, 3];
const fmt = (n) => String(Math.round(n * 1000) / 1000).replace('.', ',');

export function renderDock() {
  const dock = $('#dock');
  const board = S.board;
  const v = board.focused;
  if (!v) return;
  const dev = v.dev;
  const st = v.stateInfo;
  const L = v.L;
  const land = v.cfg.land;
  const multi = board.multi;
  const color = v.cfg.color || defaultColor(dev);
  const states = dev.states ? `<div class="seg" role="radiogroup" aria-label="Mode de l'appareil">${dev.states.map((s) => `<button role="radio" aria-checked="${s.id === st.id}" class="${s.id === st.id ? 'on' : ''}" data-state="${esc(s.id)}">${esc(s.label)}</button>`).join('')}</div><span class="dock-sep"></span>` : '';
  const rec = Boolean(S.recorder);
  const zoomLabel = multi ? (settings.zoom === 'fit' ? 'Ajusté' : `${Math.round(settings.zoom * 100)} %`) : `${Math.round((board.scaleValue || 1) * 100)} %`;
  dock.innerHTML = `
    <div class="seg layout-seg" role="radiogroup" aria-label="Disposition">
      <button role="radio" class="${multi ? '' : 'on'}" data-dock="single" title="Un appareil">${icon('single', 15)}</button>
      <button role="radio" class="${multi ? 'on' : ''}" data-dock="multi" title="Plusieurs appareils côte à côte">${icon('multi', 15)}</button>
    </div>
    <span class="dock-sep"></span>
    <div class="dock-dev"><span class="dd-name">${esc(dev.name)}</span><span class="dd-dims">${L.vp.w} × ${L.vp.h}${st.approx ? ' ≈' : ''} · @${fmt(L.dpr)}x</span></div>
    <button class="dock-swatch" data-dock="color" title="Couleur de la maquette" style="--c:${esc(color)}"></button>
    <span class="dock-sep"></span>
    ${states}
    <button class="dock-btn${land ? ' on' : ''}" data-dock="rotate" ${dev.fixed ? 'disabled' : ''} title="Pivoter (Ctrl+Maj+T)" aria-label="Pivoter" aria-pressed="${land}">${icon('rotate')}</button>
    <button class="dock-btn${settings.dragScroll ? ' on' : ''}" data-dock="drag" title="Faire défiler la page en la glissant à la souris" aria-label="Glisser pour défiler" aria-pressed="${settings.dragScroll}">${icon('hand')}</button>
    ${multi ? `<button class="dock-btn${settings.sync.nav || settings.sync.scroll ? ' on' : ''}" data-dock="sync" title="Synchroniser la navigation, le défilement et les clics" aria-haspopup="true">${icon('sync')}</button>` : ''}
    <span class="dock-sep"></span>
    <div class="zoom"><button class="dock-btn small" data-dock="zoom-out" title="Réduire (Ctrl+-)" aria-label="Réduire">${icon('minus', 15)}</button><button class="zoom-value" data-dock="zoom-100" title="${multi ? 'Taille de la planche' : 'Taille réelle'}">${zoomLabel}</button><button class="dock-btn small" data-dock="zoom-in" title="Agrandir (Ctrl++)" aria-label="Agrandir">${icon('plus', 15)}</button><button class="zoom-fit${settings.zoom === 'fit' ? ' on' : ''}" data-dock="fit" title="Ajuster à la fenêtre (Ctrl+0)">Ajuster</button></div>
    ${multi ? `<button class="zoom-fit${settings.boardScale === 'real' ? ' on' : ''}" data-dock="realscale" title="Échelle réelle : les appareils gardent leurs tailles relatives">${icon('ruler', 14)}<span>Échelle réelle</span></button>` : ''}
    <span class="dock-sep"></span>
    <button class="dock-btn" data-dock="photo" title="Photo (Ctrl+Maj+S)" aria-label="Photo" aria-haspopup="true">${icon('camera')}</button>
    <button class="dock-btn" data-dock="poses" title="Mise en scène 2D : poses et animations des maquettes" aria-label="Mise en scène 2D">${icon('wand')}</button>
    <button class="dock-btn${rec ? ' recording' : ''}" data-dock="video" title="${rec ? "Arrêter l'enregistrement" : 'Vidéo (Ctrl+Maj+R)'}" aria-label="Vidéo" aria-haspopup="true">${icon(rec ? 'stop' : 'video')}</button>
    <button class="dock-btn" data-dock="present" title="${S.presenting ? 'Quitter la présentation (Échap)' : 'Présentation plein écran (F11)'}" aria-label="Présentation">${icon(S.presenting ? 'unpresent' : 'present')}</button>`;
}

export function stepZoom(dir) {
  const board = S.board;
  const cur = board.multi ? (settings.zoom === 'fit' ? 1 : settings.zoom) : board.scaleValue || 1;
  const next = dir > 0 ? ZOOM_STEPS.find((s) => s > cur + 0.001) : [...ZOOM_STEPS].reverse().find((s) => s < cur - 0.001);
  board.setZoom(next || cur);
  renderDock();
}

export function togglePresent(force) {
  S.presenting = force ?? !S.presenting;
  S.board.presenting = S.presenting;
  document.body.classList.toggle('presenting', S.presenting);
  api.invoke('window:fullscreen', S.presenting);
  renderDock();
  setTimeout(() => S.board.relayout(), 60);
  setTimeout(() => S.board.relayout(), 450);
}

function openColorMenu(anchor) {
  const v = S.board.focused;
  const dev = v.dev;
  const cur = v.cfg.color || defaultColor(dev);
  const pop = showPopover(anchor, `
    <div class="pop-title">Couleur de ${esc(dev.name)}</div>
    <div class="color-list">${(dev.colors || []).map(([name, hex]) => `<button class="color-row${hex === cur ? ' on' : ''}" data-color="${esc(hex)}"><span class="cr-dot" style="--c:${esc(hex)}"></span><span>${esc(name)}</span>${hex === cur ? icon('check', 14) : ''}</button>`).join('')}</div>
    <label class="color-custom"><span>Couleur personnalisée</span><input type="color" value="${esc(cur)}" data-custom-color></label>`, { align: 'center', above: true, width: 280 });
  if (!pop) return;
  pop.onclick = (e) => {
    const c = e.target.closest('[data-color]');
    if (c) { v.setColor(c.dataset.color); hidePopover(); renderDock(); }
  };
  pop.oninput = (e) => {
    if (e.target.matches('[data-custom-color]')) { v.setColor(e.target.value); renderDock(); }
  };
}

function openSyncMenu(anchor) {
  const s = settings.sync;
  const pop = showPopover(anchor, `
    <div class="pop-title">Synchroniser les appareils</div>
    ${toggle('nav', 'Navigation', 'Changer de page sur un appareil change la page sur tous les autres', s.nav)}
    ${toggle('scroll', 'Défilement', 'Les appareils défilent ensemble et gardent le même contenu en haut de l’écran', s.scroll)}
    ${toggle('clicks', 'Clics', 'Un clic sur un bouton, un menu ou un lien est rejoué comme un vrai clic sur les autres appareils', s.clicks)}
    ${toggle('input', 'Saisie', 'Le texte tapé dans un formulaire apparaît aussi sur les autres appareils (jamais les mots de passe)', s.input !== false)}
    <p class="pop-note">Sans synchronisation, chaque appareil se navigue séparément. La barre d'adresse agit sur l'appareil sélectionné.</p>`, { align: 'center', above: true, width: 320 });
  if (!pop) return;
  pop.onchange = (e) => {
    const t = e.target.closest('[data-toggle]');
    if (!t) return;
    s[t.dataset.toggle] = t.checked;
    persist();
    S.board.configureAll();
    renderDock();
  };
}

function openVideoMenu(anchor) {
  const p = settings.video;
  const pop = showPopover(anchor, `
    <div class="pop-title">Vidéo</div>
    ${seg('video.framed', p.framed ? '1' : '0', { 1: 'Avec le cadre', 0: 'Écran seul' })}
    <div class="pop-sub">Taille</div>
    ${seg('video.size', p.size, p.framed ? {
    720: '720p', 1080: '1080p', 1440: '1440p', 2160: '4K',
  } : {
    720: '720p', 1080: '1080p', 1440: '1440p', native: 'Native',
  })}
    <div class="pop-sub">Images par seconde</div>
    ${seg('video.fps', String(p.fps), { 30: '30 i/s', 60: '60 i/s' })}
    <div class="pop-sub">Format</div>
    ${seg('video.format', p.format, { mp4: 'MP4 (H.264)', webm: 'WebM (VP9)' })}
    ${p.framed ? `<div class="pop-sub">Fond</div>${seg('video.bg', p.bg, {
    light: 'Clair', dark: 'Sombre', accent: 'Dégradé', image: 'Image',
  })}` : ''}
    ${toggle('showTouches', 'Afficher les touchers', 'Un rond suit tes clics et tes glissements', settings.showTouches)}
    <p class="pop-note">Fais défiler et navigue dans la page pendant l'enregistrement. L'image de la page est prise à la définition de l'écran.</p>
    <button class="btn primary wide" data-record>${icon('record', 14)}<span>Démarrer l'enregistrement</span></button>`, { align: 'center', above: true, width: 340 });
  if (!pop) return;
  pop.onclick = (e) => {
    const s = e.target.closest('[data-set^="video."]');
    if (s) {
      const key = s.dataset.set.slice(6);
      p[key] = key === 'framed' ? s.dataset.val === '1' : key === 'fps' ? Number(s.dataset.val) : s.dataset.val;
      if (key === 'framed' && !p.framed && p.size === '2160') p.size = 'native';
      if (key === 'framed' && p.framed && p.size === 'native') p.size = '1080';
      persist();
      refreshSeg(s);
      if (key === 'framed') { hidePopover(); openVideoMenu(anchor); }
      return;
    }
    if (e.target.closest('[data-record]')) { hidePopover(); startRecording({ bg: p.bg === 'image' ? 'image' : p.bg }); }
  };
  pop.onchange = (e) => {
    if (e.target.matches('[data-toggle="showTouches"]')) { settings.showTouches = e.target.checked; persist(); }
  };
}

export function initDock() {
  const dock = $('#dock');
  dock.addEventListener('click', (e) => {
    const st = e.target.closest('[data-state]');
    const v = S.board.focused;
    if (st) { v.setState(st.dataset.state); return; }
    const b = e.target.closest('[data-dock]');
    if (!b) return;
    switch (b.dataset.dock) {
      case 'single': S.board.setLayout('single'); bus.emit('board-changed'); break;
      case 'multi': S.board.setLayout('multi'); bus.emit('board-changed'); break;
      case 'color': openColorMenu(b); break;
      case 'rotate': v.rotate(); break;
      case 'drag': settings.dragScroll = !settings.dragScroll; persist(); S.board.configureAll(); renderDock(); break;
      case 'sync': openSyncMenu(b); break;
      case 'zoom-out': stepZoom(-1); break;
      case 'zoom-in': stepZoom(1); break;
      case 'zoom-100': S.board.setZoom(1); renderDock(); break;
      case 'fit': S.board.setZoom('fit'); renderDock(); break;
      case 'realscale': settings.boardScale = settings.boardScale === 'real' ? 'height' : 'real'; persist(); S.board.relayout(); renderDock(); break;
      case 'photo': openPhotoMenu(b); break;
      case 'poses': import('./poses.js').then((m) => m.openPoses()); break;
      case 'video': if (S.recorder) stopRecording(); else openVideoMenu(b); break;
      case 'present': togglePresent(); break;
      default: break;
    }
  });
  S.board.on('focus', () => { renderDock(); bus.emit('board-changed'); });
  S.board.on('changed', () => renderDock());
  S.board.on('relayout', () => {
    const z = $('#dock .zoom-value');
    if (z && !S.board.multi) z.textContent = `${Math.round((S.board.scaleValue || 1) * 100)} %`;
  });
  S.board.on('recording', () => renderDock());
  api.on('window:fullscreen', (on) => { if (!on && S.presenting) togglePresent(false); });
}
