/* Photos : maquette avec cadre, écran seul, page entière, planche de plusieurs appareils. */
import { api } from '../core/api.js';
import { S } from '../core/state.js';
import { settings, persist } from '../core/settings.js';
import { $, esc, loadImage } from '../core/dom.js';
import { icon } from '../core/icons.js';
import {
  toast, showPopover, hidePopover, seg, refreshSeg, toggle,
} from '../core/ui.js';
import { accent } from '../core/theme.js';
import { drawComposite, drawStatusBar } from '../devices/frames2d.js';
import { preloadSkin } from '../devices/skins.js';
import { saveCanvas, FORMATS } from './export.js';

const MAX_SIDE = 9000;

export const BACKGROUNDS = {
  transparent: 'Transparent', light: 'Clair', dark: 'Sombre', accent: 'Dégradé', color: 'Couleur', image: 'Image',
};

let bgImage = null;
async function backgroundImage() {
  const src = settings.photo.bgImage;
  if (!src) return null;
  if (bgImage && bgImage.src === src) return bgImage;
  try { bgImage = await loadImage(src); } catch { bgImage = null; }
  return bgImage;
}

export async function fillBackground(ctx, w, h, bg = settings.photo.bg) {
  if (bg === 'transparent') return;
  let g;
  if (bg === 'dark') { g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2a2a2e'); g.addColorStop(1, '#111113'); }
  else if (bg === 'accent') { g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, accent()); g.addColorStop(1, '#5e5ce6'); }
  else if (bg === 'color') g = settings.photo.bgColor || '#e8e8ee';
  else if (bg === 'image') {
    const img = await backgroundImage();
    if (img) {
      const k = Math.max(w / img.width, h / img.height);
      ctx.drawImage(img, (w - img.width * k) / 2, (h - img.height * k) / 2, img.width * k, img.height * k);
      return;
    }
    g = '#e8e8ee';
  } else { g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#fbfbfd'); g.addColorStop(1, '#e9e9ee'); }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function scaleFor(L, choice) {
  if (choice === 'native') return L.dpr;
  if (choice === '4k') return 3840 / Math.max(L.TW, L.TH);
  return Number(choice) || L.dpr;
}

// Maquette : l'appareil avec son cadre et la page actuelle.
export async function renderMockup(view, { scale = settings.photo.scale, bg = settings.photo.bg, page } = {}) {
  const L = view.layoutFor({ framesOn: true });
  if (L.skin) await preloadSkin(L.skin.v);
  const img = page || await view.capturePage();
  const margin = Math.round(Math.max(L.TW, L.TH) * 0.09);
  let k = scaleFor(L, scale);
  k = Math.min(k, MAX_SIDE / (Math.max(L.TW, L.TH) + margin * 2));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round((L.TW + margin * 2) * k);
  canvas.height = Math.round((L.TH + margin * 2) * k);
  const ctx = canvas.getContext('2d');
  await fillBackground(ctx, canvas.width, canvas.height, bg);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.translate(margin, margin);
  const c = view.statusColors();
  drawComposite(ctx, L, {
    image: img, px: k, sbBg: c.bg, sbFg: c.fg, shadow: true,
  });
  return canvas;
}

// Écran seul, à la définition native de l'appareil, avec la barre d'état.
export async function renderScreen(view) {
  const L = view.L;
  const img = await view.capturePage();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(L.W * L.dpr);
  canvas.height = Math.round(L.H * L.dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, L.W, L.H);
  ctx.drawImage(img, L.vp.x, L.vp.y, L.vp.w, L.vp.h);
  if (L.sb) { const c = view.statusColors(); drawStatusBar(ctx, L, c.bg, c.fg); }
  return canvas;
}

// Planche : tous les appareils côte à côte, à la même échelle qu'à l'écran.
export async function renderBoard(board, { bg = settings.photo.bg, scale = settings.photo.scale } = {}) {
  const views = board.list;
  const items = [];
  for (const v of views) {
    const L = v.layoutFor({ framesOn: true });
    if (L.skin) await preloadSkin(L.skin.v);
    // eslint-disable-next-line no-await-in-loop
    const page = await v.capturePage();
    items.push({ v, L, page });
  }
  const gap = 0.12;
  const disp = items.map((it) => ({ w: it.L.TW * it.v.scale, h: it.L.TH * it.v.scale }));
  const maxH = Math.max(...disp.map((d) => d.h));
  const totalW = disp.reduce((a, d) => a + d.w, 0) + maxH * gap * (items.length - 1);
  const margin = maxH * 0.12;
  // Facteur : chaque écran au moins à sa définition native (choix « native »), dans la limite de 9000 px.
  let F = scale === 'native' ? Math.max(...items.map((it) => it.L.dpr / it.v.scale)) : scale === '4k' ? 3840 / (totalW + margin * 2) : (Number(scale) || 2);
  F = Math.min(F, MAX_SIDE / (totalW + margin * 2), MAX_SIDE / (maxH + margin * 2));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round((totalW + margin * 2) * F);
  canvas.height = Math.round((maxH + margin * 2) * F);
  const ctx = canvas.getContext('2d');
  await fillBackground(ctx, canvas.width, canvas.height, bg);
  let x = margin;
  items.forEach((it, i) => {
    const s = it.v.scale * F;
    ctx.save();
    ctx.setTransform(s, 0, 0, s, x * F, (margin + (maxH - disp[i].h)) * F);
    const c = it.v.statusColors();
    drawComposite(ctx, it.L, {
      image: it.page, px: s, sbBg: c.bg, sbFg: c.fg, shadow: true,
    });
    ctx.restore();
    x += disp[i].w + maxH * gap;
  });
  return canvas;
}

function project() { return S.source ? S.source.name : 'Sans projet'; }

export async function takePhoto(kind = settings.photo.kind, opts = {}) {
  const board = S.board;
  const view = board.focused;
  if (!view.ready || !view.url) { toast("Ouvre d'abord un site ou un projet.", { kind: 'bad' }); return null; }
  const format = opts.format || settings.photo.format;
  const busy = toast('Photo en cours…', { busy: true, sticky: true });
  try {
    let canvas;
    let label;
    if (kind === 'board' && board.multi) { canvas = await renderBoard(board); label = 'planche'; }
    else if (kind === 'screen') { canvas = await renderScreen(view); label = 'écran'; }
    else if (kind === 'full') { canvas = await view.capturePage({ fullPage: true }); label = 'page entière'; }
    else { canvas = await renderMockup(view); label = 'maquette'; }
    const name = kind === 'board' ? `Planche ${board.list.length} appareils` : `${board.describe(view)} ${label}`;
    const file = await saveCanvas(canvas, {
      format, name, project: project(), saveAs: opts.saveAs ?? settings.photo.saveAs, background: settings.photo.bg === 'dark' ? '#18181a' : '#ffffff', pdfPages: kind === 'full' ? settings.photo.pdfPages : 'single',
    });
    busy.close();
    if (!file) return null;
    S.lastFile = file;
    toast(`Photo enregistrée : ${label}, ${FORMATS[format].label}, ${canvas.width} × ${canvas.height} px`, { action: 'Afficher', onAction: () => api.invoke('shell:reveal', file) });
    return file;
  } catch (err) {
    busy.close();
    console.error(err);
    toast(`La photo n'a pas pu être prise${err && err.message && err.message !== 'capture' ? ` : ${err.message}` : '. Attends la fin du chargement de la page puis réessaie.'}`, { kind: 'bad' });
    return null;
  }
}

// ------------------------------------------------------------------ menu
export function openPhotoMenu(anchor) {
  const p = settings.photo;
  const multi = S.board.multi;
  const kinds = {
    mockup: 'Maquette', screen: 'Écran', full: 'Page entière', ...(multi ? { board: 'Planche' } : {}),
  };
  if (!kinds[p.kind]) p.kind = 'mockup';
  const L = S.board.focused.L;
  const framed = p.kind === 'mockup' || p.kind === 'board';
  const pop = showPopover(anchor, `
    <div class="pop-title">Photo</div>
    ${seg('photo.kind', p.kind, kinds)}
    <p class="pop-note" data-photo-hint>${p.kind === 'screen' ? `Résolution native : ${Math.round(L.W * L.dpr)} × ${Math.round(L.H * L.dpr)} px` : p.kind === 'full' ? 'Toute la hauteur de la page. Les images différées sont chargées avant la capture.' : p.kind === 'board' ? 'Tous les appareils de la planche côte à côte.' : "L'appareil avec son cadre."}</p>
    <div class="pop-sub">Format</div>
    ${seg('photo.format', p.format, {
    png: 'PNG', jpg: 'JPG', webp: 'WebP', pdf: 'PDF',
  })}
    ${framed ? `<div class="pop-sub">Définition</div>${seg('photo.scale', p.scale, {
    native: 'Native', 2: '2×', 3: '3×', '4k': '4K',
  })}
    <div class="pop-sub">Arrière-plan</div>
    <div class="bg-swatches">${Object.entries(BACKGROUNDS).map(([k, label]) => `<button class="bg-sw bg-${k}${p.bg === k ? ' on' : ''}" data-bg="${k}" title="${label}" style="${k === 'color' ? `--c:${esc(p.bgColor || '#e8e8ee')}` : k === 'image' && p.bgImage ? `background-image:url('${esc(p.bgImage)}')` : ''}"></button>`).join('')}<input type="color" class="bg-color-input" value="${esc(p.bgColor || '#e8e8ee')}" hidden></div>` : ''}
    ${p.kind === 'full' && p.format === 'pdf' ? `<div class="pop-sub">Pages du PDF</div>${seg('photo.pdfPages', p.pdfPages, { single: 'Une seule page', a4: 'Pages A4' })}` : ''}
    ${toggle('photo.saveAs', "Choisir l'emplacement", 'Sinon, rangée dans Images › NEXORA', p.saveAs)}
    <button class="btn primary wide" data-shoot>${icon('camera', 15)}<span>Prendre la photo</span></button>`, { align: 'center', above: true, width: 330 });
  if (!pop) return;
  pop.onclick = async (e) => {
    const s = e.target.closest('[data-set^="photo."]');
    if (s) {
      const key = s.dataset.set.slice(6);
      p[key] = s.dataset.val;
      persist();
      refreshSeg(s);
      if (key === 'kind' || key === 'format') { hidePopover(); openPhotoMenu(anchor); }
      return;
    }
    const b = e.target.closest('[data-bg]');
    if (b) {
      const k = b.dataset.bg;
      if (k === 'color') { const inp = $('.bg-color-input', pop); inp.click(); }
      if (k === 'image') {
        const file = await api.invoke('dialog:open-file', { title: "Choisir une image d'arrière-plan", filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }], asDataUrl: true });
        if (!file) return;
        p.bgImage = file.dataUrl;
      }
      p.bg = k;
      persist();
      hidePopover();
      openPhotoMenu(anchor);
      return;
    }
    if (e.target.closest('[data-shoot]')) { hidePopover(); takePhoto(); }
  };
  pop.onchange = (e) => {
    if (e.target.classList.contains('bg-color-input')) { p.bgColor = e.target.value; p.bg = 'color'; persist(); hidePopover(); openPhotoMenu(anchor); }
    const t = e.target.closest('[data-toggle="photo.saveAs"]');
    if (t) { p.saveAs = t.checked; persist(); }
  };
}
