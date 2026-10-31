/* Espaces du Studio : « Scène 3D » (mise en scène libre), « Publicité » (formats des réseaux sociaux,
 * modèles animés, textes et marque) et « Présentation » (diapositives commerciales générées à partir du
 * site, export PDF, PowerPoint, vidéo et images). Méthodes ajoutées à la classe Studio. */
import * as T from './three.js';
import { attachMusicTrack } from './music.js';
import { api } from '../core/api.js';
import { S } from '../core/state.js';
import { settings, persist } from '../core/settings.js';
import {
  $, esc, sleep, loadImage, fmtTime, uid,
} from '../core/dom.js';
import { icon } from '../core/icons.js';
import {
  toast, seg, showPopover, hidePopover,
} from '../core/ui.js';
import { getDevice, resolveState } from '../devices/catalog.js';
import { drawLayers, loadQr, layersDuration } from './overlay.js';
import {
  AD_FORMATS, AD_TEMPLATES, RECIPES, DEFAULT_BRAND, DEFAULT_COPY, TEXT_POS, TEXT_STYLES, TEXT_ANIMS, STICKER_SHAPES, adLayout, shapeOf, lum, mixHex,
} from './ads.js';
import {
  SLIDE_LAYOUTS, newSlide, slideLayout, planFromSite, buildPptx,
} from './deck.js';
import { newAnimation } from './timeline.js';
import { saveCanvas, saveBytes } from '../capture/export.js';

// L'espace « Publicité » a été retiré du Studio : une ancienne préférence « ad » rouvre la scène 3D.
const SPACES = { scene: ['Scène 3D', 'cube'], mockup: ['Maquettes', 'image'], deck: ['Présentation', 'present'] };
const DEVICE_SLOTS = {
  phone: ['Téléphone', 'iphone-18-pro'], phone2: ['Second téléphone', 'galaxy-s26-ultra'], laptop: ['Ordinateur', 'macbook-pro-14'], tablet: ['Tablette', 'ipad-pro-11'], fold: ['Pliable', 'galaxy-z-fold7'],
};

function cssColorToHex(c) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(String(c || ''));
  if (m) {
    if (m[4] !== undefined && Number(m[4]) < 0.5) return null;
    return `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
  }
  return /^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : null;
}

export function installSpaces(Studio) {
  const P = Studio.prototype;

  // ================================================================== état
  // Les réglages sont complétés sur place : les références gardées par l'interface restent valables.
  P.adState = function adState() {
    const a = settings.studioAd || (settings.studioAd = {});
    if (!a.tpl) a.tpl = 'launch';
    if (!a.format) a.format = 'story';
    if (!a.pos) a.pos = 'auto';
    a.copy = Object.assign(a.copy || {}, Object.fromEntries(Object.entries(DEFAULT_COPY).filter(([k]) => !(a.copy && k in a.copy))));
    a.devices = a.devices || {};
    for (const [k, v] of Object.entries(DEVICE_SLOTS)) if (!a.devices[k]) a.devices[k] = v[1];
    return a;
  };
  P.brand = function brand() {
    const b = settings.studioBrand || (settings.studioBrand = {});
    for (const [k, v] of Object.entries(DEFAULT_BRAND)) if (b[k] === undefined) b[k] = v;
    return b;
  };
  // Plusieurs présentations : liste dans settings.studioDecks, la présentation ouverte dans studioDeckCur.
  P.decks = function decks() {
    if (!Array.isArray(settings.studioDecks)) {
      const old = settings.studioDeck && typeof settings.studioDeck === 'object' ? settings.studioDeck : {};
      settings.studioDecks = [{ id: uid(), name: old.name || 'Présentation 1', ...old }];
      settings.studioDeckCur = settings.studioDecks[0].id;
      delete settings.studioDeck;
    }
    if (!settings.studioDecks.length) settings.studioDecks.push({ id: uid(), name: 'Présentation 1' });
    if (!settings.studioDecks.some((x) => x.id === settings.studioDeckCur)) settings.studioDeckCur = settings.studioDecks[0].id;
    return settings.studioDecks;
  };
  P.deckState = function deckState() {
    const list = this.decks();
    const d = list.find((x) => x.id === settings.studioDeckCur) || list[0];
    if (!d.id) d.id = uid();
    if (!Array.isArray(d.slides)) d.slides = [];
    if (d.url === undefined) d.url = '';
    if (!d.name) d.name = `Présentation ${list.indexOf(d) + 1}`;
    if (d.cur === undefined) d.cur = 0;
    return d;
  };

  // ================================================================== interface
  P.initSpaces = async function initSpaces() {
    this.space = 'scene';
    this.framing = null;
    this.urlCache = this.urlCache || new Map();
    const left = $('.st-left', this.el);
    left.insertAdjacentHTML('afterbegin', `<div class="st-spaces seg wide" role="tablist">${Object.entries(SPACES).map(([k, [l, ic]]) => `<button role="tab" data-space="${k}">${icon(ic, 14)}<span>${l}</span></button>`).join('')}</div><div class="st-space-left" id="stSpaceLeft"></div>`);
    for (const el of left.querySelectorAll('.st-add, #stPresets')) el.classList.add('only-scene');
    const heads = left.querySelectorAll('.st-head');
    if (heads[0]) heads[0].id = 'stObjHead';
    if (heads[1]) heads[1].classList.add('only-scene');
    this.$.spaceLeft = $('#stSpaceLeft', this.el);
    this.$.frame.insertAdjacentHTML('beforeend', '<canvas class="st-overlay" id="stOverlay"></canvas>');
    this.$.overlay = $('#stOverlay', this.el);
    left.addEventListener('click', (e) => this.onSpaceLeftClick(e));
    left.addEventListener('change', (e) => { if (this.space === 'mockup' && this.mockup && e.target.matches('[data-mkf]')) { this.mockup.onPropsEvent(e); this.renderSpaceLeft(); } });
    left.addEventListener('change', (e) => this.onSpaceLeftChange(e));
    this.qr = await loadQr();
    await this.loadLogo();
    const want = settings.studioSpace || 'scene';
    await this.setSpace(want, { initial: true });
  };

  P.loadLogo = async function loadLogo() {
    const b = this.brand();
    this.logoImg = b.logo ? await loadImage(b.logo).catch(() => null) : null;
  };

  P.setSpace = async function setSpace(space, { initial = false } = {}) {
    if (!SPACES[space]) space = 'scene';
    if (!initial && space === this.space) return;
    // Sauvegarde de la scène de l'espace quitté.
    if (!initial && this.space !== 'mockup') this.stashSpace();
    if (this.space === 'mockup' && this.mockup) this.mockup.leave();
    this.space = space;
    settings.studioSpace = space;
    persist();
    this.el.querySelector('.st').dataset.space = space;
    for (const b of this.el.querySelectorAll('button[data-space]')) { b.classList.toggle('on', b.dataset.space === space); b.setAttribute('aria-selected', String(b.dataset.space === space)); }
    $('#stObjHead', this.el).textContent = space === 'scene' ? 'Scène' : 'Objets de la scène';
    if (space === 'scene') {
      this.framing = null;
      this.applyFraming();
      if (!initial && settings.studio && settings.studio.objects) await this.load(settings.studio, { fromSettings: true });
      // Les appareils de la scène se calent sur le site ouvert (hôte différent → nouvelle capture).
      const u = this.siteUrl();
      const host = (x) => { try { return new URL(x).host; } catch { return ''; } };
      if (u && this.order && this.order.some((id) => { const it = this.objects.get(id).item; return it.type === 'device' && it.main && it.main.src === 'url' && host(it.main.url) !== host(u); })) { this._syncedUrl = u; this.refreshSiteScreens(); }
    } else if (space === 'ad') {
      const a = this.adState();
      if (a.scene && a.scene.objects && a.scene.objects.length) { await this.load(a.scene); await this.ensurePages(); this.reframeAd({ keepCamera: true }); } else await this.applyAd();
    } else if (space === 'mockup') {
      if (!this.mockup) { const { MockupEditor } = await import('./mockup.js'); this.mockup = new MockupEditor(this); }
      await this.mockup.enter();
    } else if (space === 'deck') {
      const d = this.deckState();
      if (!d.slides.length) d.slides = [newSlide('cover', { kicker: 'Présentation', title: 'Titre de la présentation', text: 'Ajoute le lien du site puis « Générer depuis le site ».' })];
      this.deckCur = null;
      await this.openSlide(Math.min(d.cur || 0, d.slides.length - 1), { save: false });
    }
    this.renderSpaceLeft();
    this.renderProps();
    this.resize();
    this.dirty = true;
  };

  // Garde la scène de l'espace courant (sans les captures).
  P.stashSpace = function stashSpace() {
    const data = this.serialize();
    if (this.space === 'scene') settings.studio = data;
    else if (this.space === 'ad') this.adState().scene = data;
    else if (this.space === 'deck' && this.deckCur != null) {
      const s = this.deckState().slides[this.deckCur];
      if (s) s.scene = data;
    }
    persist();
  };

  P.renderSpaceLeft = function renderSpaceLeft() {
    const el = this.$.spaceLeft;
    if (this.space === 'mockup' && this.mockup) { el.innerHTML = this.mockup.leftHtml(); return; }
    if (this.space === 'ad') {
      const a = this.adState();
      el.innerHTML = `
        <div class="st-head">Modèles</div>
        <div class="st-tpls">${Object.entries(AD_TEMPLATES).map(([k, t]) => `<button class="st-tpl${a.tpl === k ? ' on' : ''}" data-tpl="${k}"><span class="st-tpl-ico">${icon(t.icon, 16)}</span><span><b>${esc(t.label)}</b><small>${esc(t.hint)}</small></span></button>`).join('')}</div>
        <div class="st-head">Format</div>
        <div class="st-formats">${Object.entries(AD_FORMATS).map(([k, f]) => `<button class="st-format${a.format === k ? ' on' : ''}" data-format="${k}" title="${esc(f.label)}"><i style="aspect-ratio:${f.aspect.replace(':', '/')}"></i><span>${f.short}</span></button>`).join('')}</div>
        <div class="st-head">Appareils</div>
        <div class="st-slots">${Object.entries(DEVICE_SLOTS).map(([k, [l]]) => `<button class="st-slot" data-slot="${k}"><span>${esc(l)}</span><b>${esc(getDevice(a.devices[k], settings.custom).name.split(' / ')[0])}</b></button>`).join('')}</div>`;
    } else if (this.space === 'deck') {
      const d = this.deckState();
      const list = this.decks();
      el.innerHTML = `
        <div class="st-head st-head-row"><span>Présentations</span><button class="icon-btn small" data-deck="new-deck" title="Nouvelle présentation">${icon('plus', 14)}</button></div>
        <div class="st-decks">${list.map((x) => `<button class="st-deck${x.id === d.id ? ' on' : ''}" data-deck-open="${esc(x.id)}" title="${esc(x.name)}"><span class="st-deck-th">${x.slides && x.slides[0] && x.slides[0].thumb ? `<img src="${x.slides[0].thumb}" alt="">` : icon('present', 14)}</span><span class="st-deck-t"><b>${esc(x.name)}</b><small>${(x.slides || []).length} diapositive${(x.slides || []).length > 1 ? 's' : ''}</small></span></button>`).join('')}</div>
        <div class="st-btns"><button class="btn small" data-deck="rename-deck" title="Renommer">${icon('text', 13)}</button><button class="btn small" data-deck="dup-deck" title="Dupliquer la présentation">${icon('copy', 13)}</button><button class="btn small" data-deck="del-deck" title="Supprimer la présentation" ${list.length < 2 ? 'disabled' : ''}>${icon('trash', 13)}</button></div>
        <div class="st-head st-head-row"><span>Diapositives</span><button class="icon-btn small" data-deck="add" title="Ajouter une diapositive" aria-haspopup="true">${icon('plus', 14)}</button></div>
        <div class="st-slides">${d.slides.map((s, i) => `<div class="st-slide${i === this.deckCur ? ' on' : ''}" data-slide="${i}" draggable="true">
          <span class="st-slide-n">${i + 1}</span>
          <span class="st-slide-th">${s.thumb ? `<img src="${s.thumb}" alt="">` : `<i>${icon((SLIDE_LAYOUTS[s.layout] || {}).icon || 'image', 16)}</i>`}</span>
          <span class="st-slide-t">${esc(s.title || SLIDE_LAYOUTS[s.layout].label)}</span>
        </div>`).join('')}</div>
        <div class="st-btns"><button class="btn small" data-deck="up" title="Monter">${icon('back', 13)}</button><button class="btn small" data-deck="down" title="Descendre">${icon('forward', 13)}</button><button class="btn small" data-deck="dup" title="Dupliquer">${icon('copy', 13)}</button><button class="btn small" data-deck="del" title="Supprimer">${icon('trash', 13)}</button></div>`;
    } else el.innerHTML = '';
  };

  P.onSpaceLeftClick = async function onSpaceLeftClick(e) {
    const sp = e.target.closest('button[data-space]');
    if (sp) { await this.setSpace(sp.dataset.space); return; }
    if (this.space === 'mockup' && this.mockup && await this.mockup.onLeftClick(e)) return;
    const tpl = e.target.closest('[data-tpl]');
    if (tpl) { this.adState().tpl = tpl.dataset.tpl; persist(); await this.applyAd(); this.renderSpaceLeft(); return; }
    const fm = e.target.closest('[data-format]');
    if (fm) { this.adState().format = fm.dataset.format; persist(); await this.applyAd(); this.renderSpaceLeft(); return; }
    const slot = e.target.closest('[data-slot]');
    if (slot) {
      const a = this.adState();
      this.pickDevice(async (id) => { a.devices[slot.dataset.slot] = id; persist(); this.renderSpaceLeft(); await this.applyAd(); }, a.devices[slot.dataset.slot]);
      return;
    }
    const sl = e.target.closest('[data-slide]');
    if (sl) { await this.openSlide(Number(sl.dataset.slide)); return; }
    const dko = e.target.closest('[data-deck-open]');
    if (dko) { await this.openDeck(dko.dataset.deckOpen); return; }
    const dk = e.target.closest('[data-deck]');
    if (dk) await this.deckAction(dk.dataset.deck, dk);
  };

  // Ouvre une autre présentation : la diapositive en cours est enregistrée, puis la présentation choisie s'affiche.
  P.openDeck = async function openDeck(id) {
    if (id === settings.studioDeckCur) return;
    const cur = this.deckState();
    if (this.deckCur != null && cur.slides[this.deckCur]) {
      cur.slides[this.deckCur].scene = this.serialize();
      cur.slides[this.deckCur].thumb = await this.slideThumb(this.deckCur);
    }
    settings.studioDeckCur = id;
    const d = this.deckState();
    if (!d.slides.length) d.slides = [newSlide('cover', { kicker: 'Présentation', title: d.name, text: 'Ajoute le lien du site puis « Générer depuis le site ».' })];
    this.deckCur = null;
    persist();
    await this.openSlide(Math.min(d.cur || 0, d.slides.length - 1), { save: false });
    this.renderSpaceLeft();
    this.renderProps();
  };

  P.onSpaceLeftChange = function onSpaceLeftChange() {};

  // ================================================================== cadrage : la 3D occupe une zone de l'image
  P.setFraming = function setFraming(region) {
    this.framing = region ? { ...region } : null;
    this.applyFraming();
  };
  P.applyFraming = function applyFraming() {
    const cam = this.three.camera;
    const f = this.framing;
    if (f) cam.setViewOffset(1, 1, 0.5 - f.cx, 0.5 - f.cy, 1, 1); else cam.clearViewOffset();
    cam.updateProjectionMatrix();
    this.dirty = true;
  };

  // ================================================================== captures du site à la définition de chaque appareil
  P.siteUrl = function siteUrl() {
    if (this.space === 'deck' && this.deckState().url) return this.deckState().url;
    const a = this.adState();
    if (a.copy.url) return a.copy.url;
    const v = S.board && S.board.focused;
    return (v && v.url) || (S.source && S.source.url) || '';
  };

  // Projet / site ouvert dans NEXORA : la publicité et la présentation suivent le nouveau site (sauf lien
  // saisi à la main pour un autre site), et on propose de régénérer avec ses captures.
  P.syncSource = function syncSource(url) {
    const host = (u) => { try { return new URL(u).host; } catch { return ''; } };
    const prev = this._syncedUrl;
    this._syncedUrl = url;
    if (!prev || host(prev) === host(url)) return;
    const a = this.adState();
    const d = this.deckState();
    let changed = false;
    if (a.copy.url && host(a.copy.url) === host(prev)) { a.copy.url = ''; changed = true; }
    if (d.url && host(d.url) === host(prev)) { d.url = ''; changed = true; }
    this.urlCache && this.urlCache.clear && this.urlCache.clear();
    persist();
    const stale = this.order.some((id) => { const it = this.objects.get(id).item; return it.type === 'device' && it.main && it.main.src === 'url' && host(it.main.url) !== host(url); });
    // Scène 3D : les appareils qui montraient l'ancien site se mettent à jour tout seuls vers le site ouvert.
    if (this.space === 'scene' && stale && url) { this.refreshSiteScreens(); return; }
    if (this.space === 'ad' || this.space === 'deck' || changed) {
      this.renderProps();
      toast(`Studio : site ouvert « ${host(url)} ».`, {
        action: this.space === 'deck' ? 'Régénérer la présentation' : 'Régénérer la publicité',
        onAction: () => (this.space === 'deck' ? this.generateDeck() : this.applyAd()),
      });
    }
  };

  P.snapPage = async function snapPage(deviceId, state, land, url, full) {
    const dev = getDevice(deviceId, settings.custom);
    const st = resolveState(dev, state);
    const w = land ? st.h : st.w;
    const h = land ? st.w : st.h;
    const mobile = !['windows', 'macos', 'chromeos', 'linux', 'tv', 'console'].includes(dev.os) && w < 1000;
    const dpr = w >= 1000 ? 1 : Math.min(2, st.dpr || 2);
    const key = `${url}|${w}x${h}@${dpr}|${mobile}|${full}`;
    // La scène enregistrée peut être rechargée avant l'initialisation des espaces.
    if (!this.urlCache) this.urlCache = new Map();
    if (!this.urlCache.has(key)) {
      this.urlCache.set(key, (async () => {
        const r = await api.invoke('lab:snap-url', {
          url, width: w, height: h, dpr, mobile, full, maxHeight: mobile ? 7000 : 6000, wait: 900, info: !this.siteInfo,
        });
        if (r.info && !this.siteInfo) this.siteInfo = r.info;
        const img = await loadImage(r.data);
        const max = Math.min(16384, this.three.renderer.capabilities.maxTextureSize || 8192);
        let c = document.createElement('canvas');
        const k = Math.min(1, max / img.width, max / img.height);
        c.width = Math.floor(img.width * k);
        c.height = Math.floor(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const bg = cssColorToHex(r.statusBg) || '#ffffff';
        if (!c.width) c = null;
        return {
          canvas: c, cssW: r.cssW, cssH: r.cssH, sbBg: bg, sbFg: lum(bg) > 0.45 ? '#000000' : '#ffffff',
        };
      })().catch((err) => { this.urlCache.delete(key); throw err; }));
    }
    return this.urlCache.get(key);
  };

  P.addSiteDevice = async function addSiteDevice(spec, { full = false } = {}) {
    const url = this.siteUrl();
    const it = await this.addDevice({ ...spec, main: url ? { src: 'url', url, full } : { src: 'wallpaper' } }, { select: false, place: false, history: false });
    if (url) await this.fillUrlScreen(it.id);
    return it;
  };

  P.fillUrlScreen = async function fillUrlScreen(id) {
    const o = this.objects.get(id);
    if (!o || !o.item.main || o.item.main.src !== 'url') return false;
    try {
      const page = await this.snapPage(o.item.deviceId, o.item.state, o.item.land, o.item.main.url, Boolean(o.item.main.full));
      // L'appareil a pu être supprimé (scène vidée, autre modèle…) pendant la capture.
      if (!page.canvas || this.objects.get(id) !== o || !o.model) return false;
      this.pages.set(`${id}:main`, page);
      if (!o.model.setPage('main', page)) this.build(o.item);
      this.dirty = true;
      return true;
    } catch (err) {
      console.error(String(err && err.stack ? err.stack : err).slice(0, 600));
      return false;
    }
  };

  // Écrans des appareils qui affichaient l'ancien site : ils passent au site ouvert et sont recapturés.
  P.refreshSiteScreens = async function refreshSiteScreens() {
    const url = this.siteUrl();
    if (!url) return;
    const prevHost = (u) => { try { return new URL(u).host; } catch { return ''; } };
    const ids = this.order.filter((id) => { const it = this.objects.get(id).item; return it.type === 'device' && it.main && it.main.src === 'url' && prevHost(it.main.url) !== prevHost(url); });
    if (!ids.length) { toast('Les appareils affichent déjà ce site.'); return; }
    const busy = toast('Capture du site pour les appareils…', { busy: true, sticky: true });
    try {
      for (const id of ids) { this.objects.get(id).item.main.url = url; this.pages.delete(`${id}:main`); await this.fillUrlScreen(id); }
    } finally { busy.close(); }
    this.stashSpace && this.stashSpace();
  };

  // Captures manquantes (après un redémarrage, ou une scène ouverte) : on les refait.
  P.ensurePages = async function ensurePages() {
    const todo = this.order.filter((id) => { const it = this.objects.get(id).item; return it.type === 'device' && it.main && it.main.src === 'url' && !this.pages.has(`${id}:main`); });
    if (!todo.length) return;
    const busy = toast('Capture du site pour les appareils…', { busy: true, sticky: true });
    try { for (const id of todo) await this.fillUrlScreen(id); } finally { busy.close(); }
  };

  // ================================================================== calques 2D
  P.overlayLayers = function overlayLayers() {
    if (this.space === 'ad') return this.adBuild().layers;
    if (this.space === 'deck') {
      const d = this.deckState();
      const s = d.slides[this.deckCur];
      return s ? this.slideBuild(s, this.deckCur).layers : [];
    }
    return [];
  };

  P.overlayOpts = function overlayOpts(w, h, t, still) {
    return {
      w, h, t, still, images: this.logoImg ? { logo: this.logoImg } : {}, qr: this.qr,
    };
  };

  P.drawOverlay = function drawOverlay() {
    const c = this.$.overlay;
    if (!c) return;
    const layers = this.space === 'scene' ? null : this.overlayLayers();
    const pr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.three.size.w;
    const h = this.three.size.h;
    if (c.width !== Math.round(w * pr) || c.height !== Math.round(h * pr)) { c.width = Math.round(w * pr); c.height = Math.round(h * pr); }
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    if (!layers || !layers.length) return;
    ctx.scale(pr, pr);
    // Pendant l'édition, les textes restent visibles ; ils s'animent à la lecture.
    drawLayers(ctx, layers, { ...this.overlayOpts(w, h, this.time, !this.playing && this.time === 0 ? true : !this.playing), guides: true });
  };

  // Calques posés sur un rendu (export).
  P.paintOverlay = function paintOverlay(canvas, t, still) {
    if (this.space === 'scene') return canvas;
    const layers = this.overlayLayers();
    if (!layers.length) return canvas;
    const ctx = canvas.getContext('2d');
    drawLayers(ctx, layers, this.overlayOpts(canvas.width, canvas.height, t, still));
    return canvas;
  };

  // ================================================================== publicité
  P.adBuild = function adBuild() {
    const a = this.adState();
    const fmt = AD_FORMATS[a.format] || AD_FORMATS.story;
    return adLayout({
      shape: shapeOf(fmt.aspect),
      pos: a.pos,
      copy: a.copy,
      brand: this.brand(),
      style: this.adStyle || a.style || {},
      logo: Boolean(this.logoImg),
      fx: {
        textStyle: a.textStyle || 'auto', textAnim: a.textAnim || 'auto', endcard: Boolean(a.endcard), safe: a.safe !== false, duration: this.anim.duration,
      },
    });
  };

  P.recipeContext = function recipeContext() {
    const a = this.adState();
    const ph2 = getDevice(a.devices.phone2, settings.custom);
    return { brand: this.brand(), devices: a.devices, altColor: ph2.colors && ph2.colors[1] ? ph2.colors[1][1] : null };
  };

  P.clearScene = function clearScene() {
    for (const id of [...this.order]) this.remove(id, { history: false });
    this.anim = newAnimation();
  };

  P.applyAd = async function applyAd() {
    const a = this.adState();
    const tpl = AD_TEMPLATES[a.tpl] || AD_TEMPLATES.launch;
    const fmt = AD_FORMATS[a.format] || AD_FORMATS.story;
    const busy = toast('Mise en scène…', { busy: true, sticky: true });
    try {
      if (this.playing) this.togglePlay();
      // Les réglages d'ambiance d'un modèle précédent (effets, brouillard, reflets) sont remis à zéro.
      this.three.applyEnv({
        ...this.three.env, aspect: fmt.aspect, fx: null, fog: null, rig: 1, lightAngle: 0, lightHeight: 1, warmth: 0, reflect: 0.5, floorRough: 0.14, floorColor: '', exposure: 1, envIntensity: 1,
      }, this.bgImageEl);
      this.resize();
      this.clearScene();
      // Exemples de textes du modèle (prix, code, date…) dans les champs encore vides.
      if (a.sampledFor !== a.tpl) {
        // Les exemples du modèle précédent restés tels quels sont retirés.
        const prevTpl = AD_TEMPLATES[a.sampledFor];
        if (prevTpl && prevTpl.sample) for (const [k, v] of Object.entries(prevTpl.sample)) if (a.copy[k] === v) a.copy[k] = DEFAULT_COPY[k] ?? '';
        if (tpl.sample) for (const [k, v] of Object.entries(tpl.sample)) if (!a.copy[k] || a.copy[k] === DEFAULT_COPY[k]) a.copy[k] = v;
        a.sampledFor = a.tpl;
      }
      this.anim.duration = a.endcard ? 7.5 : 6;
      const style = await RECIPES[tpl.recipe](this, this.recipeContext());
      this.adStyle = style;
      a.style = style;
      this.time = 0;
      this.applyTime();
      this.reframeAd();
      this.select(null);
      this.renderList();
      this.timeline.render();
      this.commit();
    } finally { busy.close(); }
  };

  // Recadre la 3D dans la zone laissée libre par les textes (et refait l'orbite de la caméra).
  P.reframeAd = function reframeAd({ keepCamera = false } = {}) {
    const style = this.adStyle || this.adState().style || {};
    this.adStyle = style;
    const { region } = this.adBuild();
    this.setFraming(region);
    if (keepCamera) return;
    // Cadrage sur la pose finale (les appareils entrent dans le champ au début de l'animation).
    delete this.anim.tracks.camera;
    this.time = this.anim.duration * 0.7;
    this.applyTime();
    if (style.view === 'top') this.setView('top', false); else this.frameAll(false, new T.Vector3(0.18, 0.3, 1), { devicesOnly: true, pad: 1.18 });
    if (style.orbit) this.cameraPreset('orbit', style.orbit);
    this.time = 0;
    this.applyTime();
    this.timeline.render();
  };

  P.adProps = function adProps() {
    const a = this.adState();
    const c = a.copy;
    const f = (k, label, ph, area) => `<label class="st-field"><span>${label}</span>${area ? `<textarea class="input st-text" rows="2" data-copy="${k}" placeholder="${esc(ph)}">${esc(c[k] || '')}</textarea>` : `<input class="input" data-copy="${k}" value="${esc(c[k] || '')}" placeholder="${esc(ph)}">`}</label>`;
    const tpl = a.tpl;
    const opt = (k, label, on) => `<label class="check-row"><input type="checkbox" data-adopt="${k}" ${on ? 'checked' : ''}><span class="box"></span><span>${label}</span></label>`;
    return `<div class="st-head">Publicité</div>
      <section class="st-card">
        <div class="st-btns"><button class="btn small" data-adx="fill">${icon('globe', 13)}<span>Remplir depuis le site</span></button><button class="btn small primary" data-adx="ai">${icon('sparkle', 13)}<span>Rédiger avec l'IA</span></button></div>
        ${f('kicker', 'Accroche', 'Nouveau')}
        ${f('title', 'Titre', 'Votre application, partout', true)}
        ${f('subtitle', 'Texte', 'Une phrase qui donne envie', true)}
        ${f('cta', "Bouton d'action", 'Télécharger')}
        ${f('url', 'Lien du site', 'https://…')}
        <div class="st-field"><span>Position du texte</span>${seg('ad.pos', a.pos, TEXT_POS)}</div>
      </section>
      <section class="st-card">
        <div class="st-field"><span>Style du titre</span>${this.chips('ad.textStyle', a.textStyle || 'auto', { auto: 'Du modèle', ...TEXT_STYLES }, 'data-set')}</div>
        <div class="st-field"><span>Animation des textes</span>${this.chips('ad.textAnim', a.textAnim || 'auto', { auto: 'Du modèle', ...TEXT_ANIMS }, 'data-set')}</div>
      </section>
      <details class="st-card st-adv"${c.price || c.code || c.day || c.sticker || c.badge ? ' open' : ''}><summary>${icon('cart', 13)}<span>Offre : prix, code, date, autocollant</span></summary>
        <div class="st-two">${f('price', 'Prix', '9,99 €')}${f('oldPrice', 'Ancien prix (barré)', '14,99 €')}</div>
        ${f('priceNote', 'Précision du prix', '/mois, TTC, dès…')}
        <div class="st-two">${f('badge', 'Pastille', '-30 %')}${f('badgeSub', 'Sous la pastille', "jusqu'à dimanche")}</div>
        <div class="st-two">${f('code', 'Code promo', 'BIENVENUE20')}${f('codeLabel', 'Libellé du code', 'Code promo')}</div>
        <div class="st-two">${f('day', 'Jour', '12')}${f('month', 'Mois', 'nov.')}</div>
        ${f('dateLabel', "Heure et lieu de l'événement", '19 h · Paris')}
        ${f('sticker', 'Autocollant', 'Offre limitée')}
        <div class="st-field"><span>Forme de l'autocollant</span>${this.chips('ad.stickerShape', c.stickerShape || 'ribbon', STICKER_SHAPES, 'data-set')}</div>
        ${tpl === 'compare' ? `<div class="st-two">${f('before', 'Étiquette de gauche', 'Avant')}${f('after', 'Étiquette de droite', 'Après')}</div>` : ''}
        <p class="pop-note">Laisse un champ vide pour ne pas l'afficher.</p>
      </details>
      <section class="st-card">
        ${opt('endcard', "Écran de fin (logo, bouton, lien) dans les vidéos", a.endcard)}
        ${opt('safe', 'Afficher les zones couvertes par les réseaux (Story)', a.safe !== false)}
      </section>
      ${this.brandCard()}
      <section class="st-card">
        <div class="st-field"><span>Exporter la publicité</span></div>
        <div class="st-btns"><button class="btn small primary" data-st="photo">${icon('camera', 13)}<span>Image</span></button><button class="btn small primary" data-st="video">${icon('film', 13)}<span>Vidéo</span></button></div>
        <button class="btn small wide" data-adx="pack">${icon('layers', 13)}<span>Pack réseaux sociaux (4 formats)</span></button>
        <p class="pop-note">Le pack enregistre l'image et la vidéo de chaque format : Story 9:16, portrait 4:5, carré 1:1 et 16:9. La musique choisie plus bas est ajoutée aux vidéos.</p>
      </section>`;
  };

  // Rejoue les animations des textes (sans bouger la 3D) pour voir le style choisi.
  P.previewTextAnim = function previewTextAnim() {
    if (!this.playing) { this.time = 0; this.applyTime(); this.timeline.updateHead(); this.togglePlay(); }
  };

  P.brandCard = function brandCard() {
    const b = this.brand();
    const col = (k, l) => `<label class="st-brand-col" title="${l}"><input type="color" value="${esc(b[k])}" data-brand="${k}"><span style="--c:${esc(b[k])}"></span><small>${l}</small></label>`;
    return `<section class="st-card">
      <div class="st-field"><span>Marque</span></div>
      <input class="input" data-brand="name" value="${esc(b.name || '')}" placeholder="Nom de la marque">
      <div class="st-brand-logo">${this.logoImg ? `<img src="${esc(b.logo)}" alt="Logo">` : `<i>${icon('image', 18)}</i>`}<button class="btn small" data-adx="logo">${this.logoImg ? 'Changer le logo' : 'Ajouter un logo'}</button>${this.logoImg ? `<button class="icon-btn small" data-adx="logo-rm" title="Retirer le logo">${icon('trash', 13)}</button>` : ''}</div>
      <div class="st-brand-cols">${col('primary', 'Principale')}${col('ink', 'Texte')}${col('bg', 'Fond')}${col('bg2', 'Fond 2')}</div>
      <div class="st-field"><span>Typographie</span>${seg('brand.font', b.font, { display: 'Moderne', serif: 'Élégante' })}</div>
    </section>`;
  };

  // Remplit textes, couleurs et logo à partir du site.
  P.fillFromSite = async function fillFromSite(url) {
    const u = url || this.siteUrl();
    if (!u) { toast("Ouvre d'abord un site dans le Responsive Lab, ou colle son lien dans « Lien du site ».", { kind: 'bad' }); return null; }
    const busy = toast('Lecture du site…', { busy: true, sticky: true });
    try {
      const r = await api.invoke('lab:snap-url', {
        url: u, width: 1440, height: 900, dpr: 1, info: true, wait: 900,
      });
      const info = r.info || {};
      this.siteInfo = info;
      const b = this.brand();
      const accent = cssColorToHex(info.themeColor) || cssColorToHex(info.accent);
      if (accent && lum(accent) < 0.9 && lum(accent) > 0.01) {
        b.primary = accent;
        b.bg = mixHex(accent, '#ffffff', 0.9);
        b.bg2 = mixHex(accent, '#ffffff', 0.7);
      }
      if (info.siteName || info.title) b.name = info.siteName || String(info.title).split(/\s[|–—-]\s/)[0];
      if (info.logoData) { b.logo = info.logoData; await this.loadLogo(); }
      persist();
      return info;
    } catch (err) {
      console.error(err);
      toast("Le site n'a pas pu être lu.", { kind: 'bad' });
      return null;
    } finally { busy.close(); }
  };

  P.spaceInput = function spaceInput(e, final) {
    const t = e.target;
    if (t.dataset.adopt) {
      if (!final) return true;
      const a = this.adState();
      a[t.dataset.adopt] = t.checked;
      persist();
      if (t.dataset.adopt === 'endcard') {
        // L'écran de fin allonge la vidéo de 1,5 s : l'animation garde ses proportions.
        this.setDuration(t.checked ? 7.5 : 6);
        if (t.checked) { this.time = this.anim.duration - 0.6; this.applyTime(); this.drawOverlay(); this.timeline.updateHead(); }
      }
      this.dirty = true;
      return true;
    }
    if (t.dataset.copy) {
      this.adState().copy[t.dataset.copy] = t.value;
      this.dirty = true;
      if (final) {
        persist();
        if (t.dataset.copy === 'url') { this.urlCache.clear(); this.applyAd(); }
        if (['price', 'code'].includes(t.dataset.copy)) this.reframeAd({ keepCamera: true });
      }
      return true;
    }
    if (t.dataset.brand) {
      const b = this.brand();
      b[t.dataset.brand] = t.value;
      const sw = t.parentElement && t.parentElement.querySelector('span');
      if (sw) sw.style.setProperty('--c', t.value);
      this.dirty = true;
      if (final) {
        persist();
        if (['bg', 'bg2', 'primary'].includes(t.dataset.brand)) {
          if (this.space === 'ad') this.applyAd();
          else if (this.space === 'deck') this.restyleSlide();
        }
      }
      return true;
    }
    if (t.dataset.sf) {
      const s = this.deckState().slides[this.deckCur];
      if (!s) return true;
      const k = t.dataset.sf;
      if (k === 'bullets') s.bullets = t.value.split('\n').map((x) => x.trim()).filter(Boolean);
      else if (k === 'dur') { s.dur = Number(t.value); const lab = this.$.props.querySelector('[data-val="dur"]'); if (lab) lab.textContent = `${s.dur} s`; this.anim.duration = s.dur; this.timeline.render(); } else s[k] = t.value;
      this.dirty = true;
      if (final) { persist(); this.renderSpaceLeft(); }
      return true;
    }
    if (t.dataset.deckf) {
      this.deckState()[t.dataset.deckf] = t.value;
      if (final) persist();
      return true;
    }
    return false;
  };

  P.spaceClick = async function spaceClick(e) {
    const s = e.target.closest('[data-set]');
    if (s && /^(ad|brand|slide)\./.test(s.dataset.set)) {
      const [ns, k] = s.dataset.set.split('.');
      const v = s.dataset.val;
      for (const x of s.parentElement.children) x.classList.toggle('on', x === s);
      if (ns === 'ad') {
        if (k === 'stickerShape') this.adState().copy[k] = v; else this.adState()[k] = v;
        persist();
        if (k === 'pos') this.reframeAd(); else this.dirty = true;
        this.commit();
        if (!this.playing && (k === 'textAnim')) this.previewTextAnim();
      }
      if (ns === 'brand') { this.brand()[k] = v; persist(); this.dirty = true; }
      if (ns === 'slide') {
        const sl = this.deckState().slides[this.deckCur];
        if (sl && sl.layout !== v) { sl.layout = v; persist(); await this.rebuildSlide(this.deckCur); this.renderSpaceLeft(); this.renderProps(); }
      }
      return true;
    }
    const b = e.target.closest('[data-adx]');
    if (!b) return false;
    const a = b.dataset.adx;
    if (a === 'fill') {
      const info = await this.fillFromSite();
      if (info) {
        const c = this.adState().copy;
        const host = (() => { try { return new URL(info.url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
        c.title = (info.h1 || info.title || c.title).slice(0, 80);
        c.subtitle = (info.description || c.subtitle).slice(0, 160);
        c.kicker = (this.brand().name || host || c.kicker).slice(0, 30);
        if (info.cta) c.cta = info.cta;
        c.url = c.url || info.url;
        persist();
        await this.applyAd();
        this.renderProps();
      }
    }
    if (a === 'logo') {
      const f = await api.invoke('dialog:open-file', { title: 'Logo', filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }], asDataUrl: true });
      if (f && f.dataUrl) { this.brand().logo = f.dataUrl; persist(); await this.loadLogo(); this.renderProps(); this.dirty = true; }
    }
    if (a === 'logo-rm') { this.brand().logo = ''; persist(); this.logoImg = null; this.renderProps(); this.dirty = true; }
    if (a === 'ai') (await import('../core/ai.js')).runAiAction('Rédiger la publicité');
    if (a === 'deck-ai') (await import('../core/ai.js')).runAiAction('Réécrire les diapositives');
    if (a === 'pack') await this.exportPack();
    if (a === 'gen') await this.generateDeck();
    if (a === 'restyle') await this.rebuildAllSlides();
    if (a === 'pdf') await this.exportDeck('pdf');
    if (a === 'pptx') await this.exportDeck('pptx');
    if (a === 'dvideo') await this.exportDeckVideo();
    if (a === 'png') await this.exportDeck('png');
    return true;
  };

  // Pack : image et vidéo de chaque format.
  P.exportPack = async function exportPack({ video = true, size = '1080' } = {}) {
    const a = this.adState();
    const prev = a.format;
    const out = [];
    try {
      for (const k of Object.keys(AD_FORMATS)) {
        a.format = k;
        // eslint-disable-next-line no-await-in-loop
        await this.applyAd();
        // eslint-disable-next-line no-await-in-loop
        await sleep(200);
        // eslint-disable-next-line no-await-in-loop
        out.push(await this.exportImage({ format: 'png', size, transparent: false }));
        // eslint-disable-next-line no-await-in-loop
        if (video) out.push(await this.exportVideo({ vformat: 'mp4', vsize: size }));
      }
    } finally {
      a.format = prev;
      await this.applyAd();
      this.renderSpaceLeft();
    }
    toast(`Pack réseaux sociaux : ${out.filter(Boolean).length} fichiers enregistrés`, { action: 'Afficher', onAction: () => api.invoke('shell:reveal', out.filter(Boolean).pop()) });
    return out;
  };

  // ================================================================== présentation
  P.slideBuild = function slideBuild(s, i) {
    const d = this.deckState();
    return slideLayout({ ...s, url: s.url || (s.layout === 'contact' ? d.url : '') }, {
      brand: this.brand(), style: s.style || {}, logo: Boolean(this.logoImg), index: i, total: d.slides.length,
    });
  };

  P.openSlide = async function openSlide(i, { save = true } = {}) {
    const d = this.deckState();
    if (!d.slides[i]) return;
    if (save && this.deckCur != null && d.slides[this.deckCur]) {
      const cur = d.slides[this.deckCur];
      cur.scene = this.serialize();
      cur.thumb = await this.slideThumb(this.deckCur);
    }
    if (this.playing) this.togglePlay();
    this.deckCur = i;
    d.cur = i;
    const s = d.slides[i];
    this.three.applyEnv({ ...this.three.env, aspect: '16:9' }, this.bgImageEl);
    this.resize();
    if (s.scene && s.scene.objects && s.scene.objects.length) {
      await this.load({ ...s.scene, env: { ...s.scene.env, aspect: '16:9' } });
      await this.ensurePages();
      this.setFraming(this.slideBuild(s, i).region);
    } else await this.rebuildSlide(i);
    this.anim.duration = s.dur || 5;
    this.time = 0;
    this.applyTime();
    persist();
    this.renderSpaceLeft();
    this.renderProps();
    this.timeline.render();
    this.dirty = true;
  };

  // Recompose la scène 3D d'une diapositive selon sa mise en page (et la marque).
  P.rebuildSlide = async function rebuildSlide(i) {
    const d = this.deckState();
    const s = d.slides[i];
    const lay = SLIDE_LAYOUTS[s.layout] || SLIDE_LAYOUTS.cover;
    const busy = toast('Mise en scène de la diapositive…', { busy: true, sticky: true });
    try {
      this.clearScene();
      this.anim.duration = s.dur || 5;
      this.three.applyEnv({ ...this.three.env, aspect: '16:9' }, this.bgImageEl);
      const style = await RECIPES[lay.recipe](this, this.recipeContext());
      s.style = style;
      this.setFraming(this.slideBuild(s, i).region);
      this.time = this.anim.duration * 0.7;
      this.applyTime();
      if (style.view === 'top') this.setView('top', false); else this.frameAll(false, new T.Vector3(0.2, 0.28, 1), { devicesOnly: true, pad: 1.3 });
      if (style.orbit) this.cameraPreset('orbit', Math.min(style.orbit, 12));
      this.time = 0;
      this.applyTime();
      s.scene = this.serialize();
      this.renderList();
      this.timeline.render();
    } finally { busy.close(); }
  };

  P.restyleSlide = async function restyleSlide() {
    if (this.deckCur == null) return;
    await this.rebuildSlide(this.deckCur);
    this.deckState().slides[this.deckCur].thumb = await this.slideThumb(this.deckCur);
    this.renderSpaceLeft();
  };

  P.rebuildAllSlides = async function rebuildAllSlides() {
    const d = this.deckState();
    for (let i = 0; i < d.slides.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      await this.rebuildSlide(i);
      // eslint-disable-next-line no-await-in-loop
      d.slides[i].thumb = await this.slideThumb(i);
    }
    this.deckCur = null;
    await this.openSlide(0, { save: false });
  };

  P.slideThumb = async function slideThumb(i) {
    const s = this.deckState().slides[i];
    if (!s) return '';
    this.editorVisible(false);
    const c = this.three.renderTo(384, 216);
    this.editorVisible(true);
    drawLayers(c.getContext('2d'), this.slideBuild(s, i).layers, this.overlayOpts(384, 216, 99, true));
    return c.toDataURL('image/jpeg', 0.72);
  };

  P.deckProps = function deckProps() {
    const d = this.deckState();
    const s = d.slides[this.deckCur];
    if (!s) return '';
    const f = (k, label, ph, area) => `<label class="st-field"><span>${label}</span>${area ? `<textarea class="input st-text" rows="${area}" data-sf="${k}" placeholder="${esc(ph)}">${esc(k === 'bullets' ? (s.bullets || []).join('\n') : s[k] || '')}</textarea>` : `<input class="input" data-sf="${k}" value="${esc(s[k] || '')}" placeholder="${esc(ph)}">`}</label>`;
    const L = s.layout;
    return `<div class="st-head">Présentation</div>
      <section class="st-card">
        <label class="st-field"><span>Lien du site</span><input class="input" data-deckf="url" value="${esc(d.url || '')}" placeholder="${esc(this.siteUrl() || 'https://…')}"></label>
        <button class="btn small wide primary" data-adx="gen">${icon('sparkle', 13)}<span>Générer depuis le site</span></button>
        <button class="btn small wide" data-adx="deck-ai">${icon('sparkle', 13)}<span>Réécrire les textes avec l'IA</span></button>
        <p class="pop-note">Crée les diapositives à partir du titre, de la description et des sections du site, avec des captures à la définition de chaque appareil.</p>
      </section>
      <section class="st-card">
        <div class="st-field"><span>Diapositive ${this.deckCur + 1} — mise en page</span><div class="st-layouts">${Object.entries(SLIDE_LAYOUTS).map(([k, l]) => `<button class="st-layout${L === k ? ' on' : ''}" data-set="slide.layout" data-val="${k}">${icon(l.icon, 14)}<span>${l.label}</span></button>`).join('')}</div></div>
        ${f('kicker', 'Surtitre', 'Nom, rubrique…')}
        ${f('title', 'Titre', 'Le message principal', 2)}
        ${L !== 'features' ? f('text', 'Texte', 'Une ou deux phrases', 3) : ''}
        ${['mobile', 'desktop', 'features'].includes(L) ? f('bullets', 'Points (un par ligne)', 'Livraison rapide\nPaiement mobile', 4) : ''}
        ${L === 'contact' ? f('url', 'Lien (code QR)', d.url || 'https://…') : ''}
        ${this.rangeRow('Durée (vidéo)', 'dur', s.dur || 5, 2, 15, 0.5, (v) => `${v} s`).replace('data-range="dur"', 'data-sf="dur"')}
      </section>
      ${this.brandCard()}
      <section class="st-card">
        <button class="btn small wide" data-adx="restyle">${icon('palette', 13)}<span>Appliquer la marque à toutes les diapositives</span></button>
        <div class="st-field"><span>Exporter la présentation</span></div>
        <div class="st-btns"><button class="btn small primary" data-adx="pdf">${icon('pdf', 13)}<span>PDF</span></button><button class="btn small primary" data-adx="pptx">${icon('present', 13)}<span>PowerPoint</span></button><button class="btn small primary" data-adx="dvideo">${icon('film', 13)}<span>Vidéo</span></button><button class="btn small" data-adx="png">${icon('image', 13)}<span>Images</span></button></div>
        <p class="pop-note">Diapositives en 1920 × 1080. PowerPoint : une image par diapositive, les textes dans les notes de l'orateur.</p>
      </section>`;
  };

  P.deckAction = async function deckAction(a, anchor) {
    const d = this.deckState();
    const i = this.deckCur ?? 0;
    if (a === 'new-deck' || a === 'dup-deck') {
      if (this.deckCur != null && d.slides[this.deckCur]) d.slides[this.deckCur].scene = this.serialize();
      const list = this.decks();
      const nd = a === 'dup-deck' ? { ...JSON.parse(JSON.stringify(d)), id: uid(), name: `${d.name} (copie)` } : { id: uid(), name: `Présentation ${list.length + 1}`, slides: [], url: d.url };
      list.push(nd);
      persist();
      await this.openDeck(nd.id);
      toast(a === 'dup-deck' ? 'Présentation dupliquée.' : 'Nouvelle présentation créée.');
      return;
    }
    if (a === 'rename-deck') {
      const pop = showPopover(anchor, `<div class="pop-title">Nom de la présentation</div><input class="input" data-deck-name value="${esc(d.name)}"><button class="btn primary small wide" data-ok>Renommer</button>`, { align: 'start', width: 260 });
      if (!pop) return;
      const inp = pop.querySelector('[data-deck-name]');
      inp.focus(); inp.select();
      const ok = () => { const v = inp.value.trim(); if (v) { d.name = v; persist(); this.renderSpaceLeft(); } hidePopover(); };
      pop.querySelector('[data-ok]').onclick = ok;
      inp.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
      return;
    }
    if (a === 'del-deck') {
      const list = this.decks();
      if (list.length < 2) return;
      const idx = list.findIndex((x) => x.id === d.id);
      list.splice(idx, 1);
      settings.studioDeckCur = list[Math.max(0, idx - 1)].id;
      this.deckCur = null;
      persist();
      const nd = this.deckState();
      if (!nd.slides.length) nd.slides = [newSlide('cover', { title: nd.name })];
      await this.openSlide(Math.min(nd.cur || 0, nd.slides.length - 1), { save: false });
      toast(`Présentation « ${d.name} » supprimée.`);
      return;
    }
    if (a === 'add') {
      const pop = showPopover(anchor, `<div class="pop-title">Nouvelle diapositive</div>${Object.entries(SLIDE_LAYOUTS).map(([k, l]) => `<button class="menu-item" data-newslide="${k}">${icon(l.icon, 16)}<span><b>${l.label}</b></span></button>`).join('')}`, { align: 'start', width: 240 });
      if (pop) {
        pop.onclick = async (e) => {
          const b = e.target.closest('[data-newslide]');
          if (!b) return;
          hidePopover();
          const L = b.dataset.newslide;
          d.slides.splice(i + 1, 0, newSlide(L, { title: SLIDE_LAYOUTS[L].label, url: L === 'contact' ? d.url : '' }));
          persist();
          await this.openSlide(i + 1);
        };
      }
      return;
    }
    if (a === 'del') {
      if (d.slides.length <= 1) { toast('La présentation doit garder au moins une diapositive.'); return; }
      d.slides.splice(i, 1);
      this.deckCur = null;
      persist();
      await this.openSlide(Math.min(i, d.slides.length - 1), { save: false });
      return;
    }
    if (a === 'dup') {
      d.slides[i].scene = this.serialize();
      const copy = JSON.parse(JSON.stringify(d.slides[i]));
      copy.id = `${copy.id}-c${Date.now()}`;
      d.slides.splice(i + 1, 0, copy);
      persist();
      await this.openSlide(i + 1);
      return;
    }
    if (a === 'up' || a === 'down') {
      const j = a === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= d.slides.length) return;
      d.slides[i].scene = this.serialize();
      [d.slides[i], d.slides[j]] = [d.slides[j], d.slides[i]];
      this.deckCur = j;
      d.cur = j;
      persist();
      this.renderSpaceLeft();
      this.dirty = true;
    }
  };

  P.generateDeck = async function generateDeck() {
    const d = this.deckState();
    const url = d.url || this.siteUrl();
    if (!url) { toast("Colle le lien du site dans « Lien du site », ou ouvre-le dans le Responsive Lab.", { kind: 'bad' }); return; }
    d.url = url;
    this.urlCache.clear();
    this.siteInfo = null;
    const info = await this.fillFromSite(url);
    if (!info) return;
    const plan = planFromSite(info, url);
    d.name = plan.name;
    d.slides = plan.slides;
    this.deckCur = null;
    persist();
    for (let i = 0; i < d.slides.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      await this.rebuildSlide(i);
      // eslint-disable-next-line no-await-in-loop
      d.slides[i].thumb = await this.slideThumb(i);
    }
    await this.openSlide(0, { save: false });
    toast(`Présentation générée : ${d.slides.length} diapositives`);
  };

  // Rendu complet d'une diapositive (3D + calques) à une taille donnée.
  P.renderSlide = async function renderSlide(i, w, h, t = 99, still = true) {
    await this.openSlide(i);
    if (t !== 99) { this.time = Math.min(t, this.anim.duration); this.applyTime(); }
    this.editorVisible(false);
    const c = this.three.renderTo(w, h);
    this.editorVisible(true);
    drawLayers(c.getContext('2d'), this.slideBuild(this.deckState().slides[i], i).layers, this.overlayOpts(w, h, t, still));
    return c;
  };

  P.exportDeck = async function exportDeck(kind) {
    const d = this.deckState();
    const n = d.slides.length;
    const start = this.deckCur ?? 0;
    const busy = toast(`Export de la présentation (${n} diapositives)…`, { busy: true, sticky: true });
    const name = `Présentation ${d.name || 'NEXORA'}`;
    try {
      const shots = [];
      for (let i = 0; i < n; i++) {
        // eslint-disable-next-line no-await-in-loop
        const c = await this.renderSlide(i, 1920, 1080, this.deckState().slides[i].dur * 0.75, true);
        shots.push(c);
      }
      let file = null;
      if (kind === 'png') {
        for (let i = 0; i < n; i++) {
          // eslint-disable-next-line no-await-in-loop
          file = await saveCanvas(shots[i], { format: 'png', name: `${name} ${String(i + 1).padStart(2, '0')}`, project: d.name || 'Studio' });
        }
      } else {
        const jpegs = [];
        for (const c of shots) {
          // eslint-disable-next-line no-await-in-loop
          const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
          // eslint-disable-next-line no-await-in-loop
          jpegs.push(new Uint8Array(await blob.arrayBuffer()));
        }
        let data;
        if (kind === 'pdf') {
          const { PDFDocument } = await import('../capture/pdf.js');
          const doc = await PDFDocument.create();
          doc.setTitle(name);
          doc.setCreator('NEXORA');
          for (const j of jpegs) {
            // eslint-disable-next-line no-await-in-loop
            const img = await doc.embedJpg(j);
            const page = doc.addPage([960, 540]);
            page.drawImage(img, { x: 0, y: 0, width: 960, height: 540 });
          }
          data = await doc.save();
        } else {
          data = buildPptx(d.slides.map((s, i) => ({ ...s, url: s.url || (s.layout === 'contact' ? d.url : ''), jpeg: jpegs[i] })), { title: name });
        }
        file = await saveBytes(data, { kind: 'photo', project: d.name || 'Studio', name, ext: kind });
      }
      busy.close();
      if (file) toast(`Présentation enregistrée (${kind === 'png' ? `${n} images PNG` : kind.toUpperCase()})`, { action: 'Afficher', onAction: () => api.invoke('shell:reveal', file) });
      return file;
    } catch (err) {
      busy.close();
      console.error(err);
      toast(`La présentation n'a pas pu être exportée${err && err.message ? ` : ${err.message}` : ''}`, { kind: 'bad' });
      return null;
    } finally {
      await this.openSlide(start);
    }
  };

  // Vidéo de la présentation : chaque diapositive joue son animation, fondu enchaîné entre elles.
  P.exportDeckVideo = async function exportDeckVideo({ vsize = '1080' } = {}) {
    const d = this.deckState();
    const start = this.deckCur ?? 0;
    const size = vsize === '720' ? { w: 1280, h: 720 } : vsize === '2160' ? { w: 3840, h: 2160 } : { w: 1920, h: 1080 };
    const fps = 30;
    const {
      Output, Mp4OutputFormat, BufferTarget, CanvasSource, QUALITY_VERY_HIGH, canEncodeVideo,
    } = await import('../capture/encoder.js');
    let codec = 'avc';
    if (!(await canEncodeVideo(codec, { width: size.w, height: size.h }))) codec = 'vp9';
    const out = document.createElement('canvas');
    out.width = size.w;
    out.height = size.h;
    const octx = out.getContext('2d');
    const { WebMOutputFormat } = await import('../capture/encoder.js');
    const output = new Output({ format: codec === 'avc' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target: new BufferTarget() });
    const source = new CanvasSource(out, { codec, quality: QUALITY_VERY_HIGH, keyFrameInterval: 2 });
    output.addVideoTrack(source, { frameRate: fps });
    const totalDur = d.slides.reduce((a, s) => a + Math.round((s.dur || 5) * fps), 0) / fps;
    const feedMusic = await attachMusicTrack(await import('../capture/encoder.js'), output, this.music, totalDur, codec);
    await output.start();
    if (feedMusic) await feedMusic();
    const busyEl = this.$.busy;
    busyEl.hidden = false;
    let cancel = false;
    busyEl.innerHTML = `<div class="st-busy-card glass"><div class="spinner"></div><b>Vidéo de la présentation</b><span data-prog>0 %</span><div class="st-prog"><i></i></div><button class="btn small" data-cancel>Annuler</button></div>`;
    busyEl.querySelector('[data-cancel]').onclick = () => { cancel = true; };
    const total = d.slides.reduce((a, s) => a + Math.round((s.dur || 5) * fps), 0);
    const r = this.three.renderer;
    const cam = this.three.camera;
    const FADE = Math.round(0.5 * fps);
    let prev = null;
    let frame = 0;
    const t0 = performance.now();
    try {
      for (let i = 0; i < d.slides.length && !cancel; i++) {
        // eslint-disable-next-line no-await-in-loop
        await this.openSlide(i);
        const s = d.slides[i];
        const layers = this.slideBuild(s, i).layers;
        const nF = Math.round((s.dur || 5) * fps);
        this.exporting = true;
        this.editorVisible(false);
        const keep = { pr: r.getPixelRatio(), size: r.getSize(new T.Vector2()), aspect: cam.aspect };
        r.setPixelRatio(1);
        r.setSize(size.w, size.h, false);
        cam.aspect = size.w / size.h;
        cam.updateProjectionMatrix();
        for (let f = 0; f < nF && !cancel; f++) {
          const t = f / fps;
          this.time = Math.min(t, this.anim.duration);
          this.applyTime();
          this.three.draw();
          octx.globalAlpha = 1;
          octx.drawImage(r.domElement, 0, 0);
          drawLayers(octx, layers, this.overlayOpts(size.w, size.h, t, false));
          if (prev && f < FADE) { octx.globalAlpha = 1 - f / FADE; octx.drawImage(prev, 0, 0); octx.globalAlpha = 1; }
          // eslint-disable-next-line no-await-in-loop
          await source.add(frame / fps, 1 / fps);
          frame += 1;
          if (frame % 4 === 0) {
            const p = Math.round((frame / total) * 100);
            busyEl.querySelector('[data-prog]').textContent = `${p} % · diapositive ${i + 1} / ${d.slides.length}`;
            busyEl.querySelector('.st-prog i').style.width = `${p}%`;
            // eslint-disable-next-line no-await-in-loop
            await new Promise((res) => setTimeout(res, 0));
          }
        }
        prev = document.createElement('canvas');
        prev.width = size.w;
        prev.height = size.h;
        prev.getContext('2d').drawImage(out, 0, 0);
        r.setPixelRatio(keep.pr);
        r.setSize(keep.size.x, keep.size.y, false);
        cam.aspect = keep.aspect;
        cam.updateProjectionMatrix();
        this.editorVisible(true);
        this.exporting = false;
      }
      if (cancel) { await output.cancel(); toast('Export annulé.'); return null; }
      source.close();
      await output.finalize();
      const file = await saveBytes(new Uint8Array(output.target.buffer), {
        kind: 'video', project: d.name || 'Studio', name: `Présentation ${d.name || 'NEXORA'}`, ext: codec === 'avc' ? 'mp4' : 'webm',
      });
      toast(`Vidéo de la présentation : ${size.w} × ${size.h}, ${fmtTime((frame / fps) * 1000)}, rendue en ${Math.round((performance.now() - t0) / 1000)} s`, { action: 'Afficher', onAction: () => api.invoke('shell:reveal', file) });
      return file;
    } catch (err) {
      console.error(err);
      toast("La vidéo n'a pas pu être exportée.", { kind: 'bad' });
      return null;
    } finally {
      this.exporting = false;
      this.editorVisible(true);
      busyEl.hidden = true;
      await this.openSlide(start);
      this.loop();
    }
  };

  // ================================================================== tests automatiques
  P.autotestAds4 = async function autotestAds4({ log, snap, url }) {
    const a = this.adState();
    await this.setSpace('ad');
    a.copy.url = url;
    if (!a.copy.title || a.copy.title === DEFAULT_COPY.title) await this.fillFromSite(url);
    const runs = [
      ['product', 'story', 'highlight', 'pop'], ['fan', 'wide', 'auto', 'words'], ['neon', 'story', 'auto', 'blur'], ['pastel', 'post', 'outline', 'up'],
      ['luxe', 'portrait', 'auto', 'fade'], ['event', 'wide', 'gradient', 'zoom'], ['coupon', 'story', 'auto', 'pop'], ['float', 'portrait', 'auto', 'words'], ['compare', 'post', 'auto', 'up'],
    ];
    for (const [tpl, fmt, ts, ta] of runs) {
      a.tpl = tpl; a.format = fmt; a.textStyle = ts; a.textAnim = ta;
      // eslint-disable-next-line no-await-in-loop
      await this.applyAd();
      this.renderSpaceLeft();
      this.renderProps();
      this.setTime(this.anim.duration * 0.75);
      // eslint-disable-next-line no-await-in-loop
      await sleep(700);
      // eslint-disable-next-line no-await-in-loop
      await snap(`87-pub-${tpl}-${fmt}`);
    }
    // Animation des textes en cours (mot à mot) et écran de fin.
    a.tpl = 'neon'; a.format = 'story'; a.textAnim = 'words'; a.endcard = true; a.copy.sticker = 'Nouveau';
    await this.applyAd();
    this.setTime(0.9);
    await sleep(300);
    await snap('88-pub-mot-a-mot');
    this.setTime(this.anim.duration - 0.3);
    this.playing = true; this.drawOverlay(); this.playing = false;
    await sleep(200);
    this.$.overlay && this.drawOverlay();
    // Musique synthétique (accord de 3 s) pour vérifier la piste audio.
    const ac = new AudioContext();
    const buf = ac.createBuffer(2, ac.sampleRate * 3, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < d.length; i++) { const t = i / ac.sampleRate; d[i] = 0.2 * (Math.sin(2 * Math.PI * 261.6 * t) + Math.sin(2 * Math.PI * 329.6 * t) + Math.sin(2 * Math.PI * 392 * t)) / 3; } }
    this.music = { name: 'Accord de test', buffer: buf, volume: 0.8, offset: 0, fadeIn: 0.3, fadeOut: 1 };
    this.renderProps();
    this.anim.duration = 3;
    log(`pub4 vidéo avec musique : ${await this.exportVideo({ vformat: 'mp4', vsize: '720' })}`);
    this.music = null;
    a.endcard = false; a.textAnim = 'auto'; a.textStyle = 'auto'; a.copy.sticker = '';
    persist();
  };

  P.autotestSpaces = async function autotestSpaces({ log, snap, url }) {
    const a = this.adState();
    a.copy = {
      ...a.copy, url, kicker: '', title: '', subtitle: '', cta: 'Commander', badge: '-20 %', badgeSub: 'cette semaine',
    };
    await this.setSpace('ad');
    const info = await this.fillFromSite(url);
    log(`pub : site lu ${info ? `« ${info.title} », ${info.sections.length} sections, logo ${info.logoData ? 'oui' : 'non'}` : 'non'}`);
    const c = a.copy;
    c.title = info ? (info.h1 || info.title) : 'Titre';
    c.subtitle = info ? info.description : '';
    c.kicker = this.brand().name || 'Nouveau';
    persist();
    for (const [tpl, fmt] of [['launch', 'story'], ['promo', 'post'], ['multi', 'wide'], ['web', 'portrait'], ['fold', 'story'], ['minimal', 'wide']]) {
      a.tpl = tpl;
      a.format = fmt;
      // eslint-disable-next-line no-await-in-loop
      await this.applyAd();
      this.renderSpaceLeft();
      this.renderProps();
      this.setTime(this.anim.duration * 0.7);
      // eslint-disable-next-line no-await-in-loop
      await sleep(500);
      // eslint-disable-next-line no-await-in-loop
      await snap(`80-pub-${tpl}-${fmt}`);
    }
    a.tpl = 'launch';
    a.format = 'story';
    await this.applyAd();
    log(`pub image : ${await this.exportImage({ format: 'png', size: '1080', transparent: false })}`);
    this.anim.duration = 2.5;
    log(`pub vidéo : ${await this.exportVideo({ vformat: 'mp4', vsize: '720' })}`);
    await this.setSpace('deck');
    this.deckState().url = url;
    await this.generateDeck();
    const d = this.deckState();
    log(`présentation : ${d.slides.length} diapositives (${d.slides.map((s) => s.layout).join(', ')})`);
    for (let i = 0; i < d.slides.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      await this.openSlide(i);
      this.setTime(this.anim.duration * 0.8);
      // eslint-disable-next-line no-await-in-loop
      await sleep(400);
      // eslint-disable-next-line no-await-in-loop
      await snap(`81-diapo-${String(i + 1).padStart(2, '0')}-${d.slides[i].layout}`);
    }
    log(`présentation pdf : ${await this.exportDeck('pdf')}`);
    log(`présentation pptx : ${await this.exportDeck('pptx')}`);
    for (const s of d.slides) s.dur = 1.2;
    log(`présentation vidéo : ${await this.exportDeckVideo({ vsize: '720' })}`);
    for (const s of d.slides) s.dur = 5;
    persist();
    await this.setSpace('scene');
    void layersDuration;
  };

  // Une mise en scène à la fois : un clic rapide sur un autre modèle attend la fin de la précédente
  // (sinon la nouvelle efface les objets que l'ancienne est encore en train d'animer).
  // openSlide aussi : sinon deux ouvertures se mélangent et l'affichage reste sur la première diapositive.
  // File « dernier gagnant » avec garde-fou : une opération bloquée (image qui ne charge pas, capture
  // figée…) ne fige plus l'espace — au-delà de 8 s la suivante passe ; et une rafale de clics n'exécute
  // que la dernière demande en attente (les intermédiaires sont ignorées).
  const queued = (f, key) => function q(...args) {
    const st = this[key] || (this[key] = { tail: Promise.resolve(), gen: 0 });
    const gen = ++st.gen;
    const prev = st.tail;
    const guard = Promise.race([prev, new Promise((r) => setTimeout(r, 8000))]);
    const p = guard.then(() => (gen === st.gen || args[1]?.force ? f.apply(this, args) : undefined));
    st.tail = p.catch((err) => console.warn('[studio]', err));
    return p;
  };
  P.openSlide = queued(P.openSlide, '_slideQ');
  P.applyAd = queued(P.applyAd, '_sceneQ');
  P.rebuildSlide = queued(P.rebuildSlide, '_sceneQ');

  // Changement d'espace : un seul à la fois, le dernier demandé gagne.
  {
    const f = P.setSpace;
    P.setSpace = async function guardedSetSpace(space, opts = {}) {
      this._spaceWant = space;
      const t0 = Date.now();
      while (this._spaceBusy && Date.now() - t0 < 25000) {
        try { await this._spaceBusy; } catch { /* suite */ }
        if (this._spaceWant !== space) return;
      }
      if (this._spaceWant !== space) return;
      const run = f.call(this, space, opts);
      const mine = Promise.race([run, new Promise((r) => setTimeout(r, 25000))]).catch(() => {});
      this._spaceBusy = mine;
      try { return await run; } finally { if (this._spaceBusy === mine) this._spaceBusy = null; }
    };
  }
}
