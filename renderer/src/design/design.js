/* NEX-DESIGN : espace de design 2D (mise en page façon Figma, dessin vectoriel façon Illustrator, retouche
 * d'images façon Photoshop) où les objets 3D du Studio s'importent comme des calques.
 * Moteur : Fabric.js (objets, sélection, transformations, texte, filtres d'image) ; paper.js pour les
 * opérations booléennes ; three.js pour les calques 3D. */
import {
  Canvas, Rect, Ellipse, Triangle, Polygon, Path, Line, Textbox, FabricImage, Group, ActiveSelection, Point, PencilBrush,
  FabricObject, InteractiveFabricObject, loadSVGFromString, util,
} from 'fabric';
import { S } from '../core/state.js';
import { settings, persist } from '../core/settings.js';
import { $, esc, uid } from '../core/dom.js';
import { icon } from '../core/icons.js';
import {
  toast, showPopover, hidePopover, openSheet, closeSheet,
} from '../core/ui.js';
import { api } from '../core/api.js';
import { saveCanvas, saveBytes } from '../capture/export.js';
import {
  Layer3D, refreshLayer, SHAPES3D, DEFAULT_SPEC, disposeLayer, renderSpec,
} from './layer3d.js';
import { booleanOp, toPath, BOOL_OPS } from './boolean.js';
import {
  FORMATS, newDoc, newPage, listDocs, getDoc, putDoc, deleteDoc, exportNexd, importNexd,
} from './store.js';
import { installProps, setFormatsRef } from './props.js';

// Origine en haut à gauche (X et Y affichés comme dans Figma) et poignées soignées.
FabricObject.ownDefaults.originX = 'left';
FabricObject.ownDefaults.originY = 'top';
Object.assign(InteractiveFabricObject.ownDefaults, {
  transparentCorners: false, cornerColor: '#ffffff', cornerStrokeColor: '#6a4cff', borderColor: '#6a4cff', cornerSize: 9, cornerStyle: 'rect', borderScaleFactor: 1.5, padding: 0,
});
FabricObject.customProperties = ['id', 'name', 'locked', 'radius', 'shapeKind', 'starPoints', 'starInner', 'fillKind', 'gradAngle', 'fx'];

export const FONTS = [
  ['Inter', 'NX Inter'], ['Space Grotesk', 'NX Space Grotesk'], ['Fredoka', 'NX Fredoka'], ['Playfair Display', 'NX Playfair'],
  ['Segoe UI', 'Segoe UI'], ['Arial', 'Arial'], ['Helvetica', 'Helvetica'], ['Verdana', 'Verdana'], ['Tahoma', 'Tahoma'], ['Trebuchet MS', 'Trebuchet MS'],
  ['Georgia', 'Georgia'], ['Times New Roman', 'Times New Roman'], ['Garamond', 'Garamond'], ['Courier New', 'Courier New'], ['Consolas', 'Consolas'],
  ['Impact', 'Impact'], ['Comic Sans MS', 'Comic Sans MS'], ['Bahnschrift', 'Bahnschrift'], ['Cambria', 'Cambria'], ['Calibri', 'Calibri'],
];

const TOOLS = [
  ['select', 'move', 'Sélection', 'V'], ['hand', 'hand', 'Main (déplacer la vue)', 'H'],
  ['rect', 'frame', 'Rectangle', 'R'], ['ellipse', 'sphere', 'Ellipse', 'O'], ['polygon', 'shapes', 'Polygone et étoile', 'Y'], ['line', 'minus', 'Ligne et flèche', 'L'],
  ['pen', 'pen', 'Plume (courbes de Bézier)', 'P'], ['pencil', 'pencil', 'Crayon (main levée)', 'B'], ['text', 'text', 'Texte', 'T'],
  ['image', 'image', 'Image', 'I'], ['three', 'cube', 'Objet 3D', '3'],
];

const SNAP = 6;
const THUMBS3D = new Map();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v) => Math.round(v * 100) / 100;

class Design {
  constructor(el) {
    this.el = el;
    this.tool = 'select';
    this.hist = [];
    this.fut = [];
    this.loading = false;
    this.clip = null;
    this.leftTab = settings.designLeftTab || 'layers';
    this.init();
  }

  // ================================================================== interface
  async init() {
    this.el.innerHTML = `
      <div class="dz">
        <aside class="dz-left" id="dzLeft">
          <div class="dz-doc"><button class="dz-docname" data-dz="docs" title="Documents">${icon('palette', 15)}<span id="dzDocName">Document</span>${icon('chevronDown', 12)}</button><span class="dz-people" id="dzPeople"></span><span class="dz-cloud" id="dzCloud" data-st="off">${icon('cloud', 14)}</span></div>
          <div class="seg wide dz-tabs">${[['layers', 'Calques'], ['pages', 'Pages'], ['assets', 'Ressources']].map(([k, l]) => `<button data-dz-tab="${k}" class="${this.leftTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <div class="dz-left-body" id="dzLeftBody"></div>
        </aside>
        <div class="dz-main">
          <div class="dz-toolbar glass" id="dzTools">
            ${TOOLS.map(([k, ic, l, kb]) => `<button class="dz-tool${k === 'select' ? ' on' : ''}" data-tool="${k}" title="${esc(l)} (${kb})">${icon(ic, 17)}</button>`).join('')}
            <span class="dz-sep"></span>
            <button class="dz-tool" data-dz="undo" title="Annuler (Ctrl+Z)">${icon('back', 16)}</button>
            <button class="dz-tool" data-dz="redo" title="Rétablir (Ctrl+Maj+Z)">${icon('forward', 16)}</button>
            <span class="dz-sep"></span>
            <button class="dz-zoom" data-dz="zoom" title="Zoom (Maj+1 : tout voir, Maj+0 : 100 %)"><span id="dzZoom">100 %</span>${icon('chevronDown', 11)}</button>
            <button class="dz-export" data-dz="export" title="Exporter (Ctrl+E)">${icon('download', 14)}<span>Exporter</span></button>
          </div>
          <div class="dz-stage" id="dzStage"><canvas id="dzCanvas"></canvas><div class="dz-hint" id="dzHint" hidden></div></div>
        </div>
        <aside class="dz-right" id="dzProps"></aside>
      </div>`;
    this.$ = {
      left: $('#dzLeftBody', this.el), props: $('#dzProps', this.el), stage: $('#dzStage', this.el), tools: $('#dzTools', this.el), zoom: $('#dzZoom', this.el), hint: $('#dzHint', this.el),
    };
    await this.loadFonts();
    const c = new Canvas($('#dzCanvas', this.el), {
      preserveObjectStacking: true, stopContextMenu: true, fireRightClick: true, selectionColor: 'rgba(106,76,255,0.08)', selectionBorderColor: '#6a4cff', selectionLineWidth: 1, backgroundColor: '',
      targetFindTolerance: 4, enableRetinaScaling: true, uniformScaling: true,
    });
    this.canvas = c;
    this.bindCanvas();
    this.bindUi();
    this.bindProps();
    new ResizeObserver(() => this.resize()).observe(this.$.stage);
    await this.openLastDoc();
    this.resize();
    this.fit();
    this.ready = true;
  }

  async loadFonts() {
    const faces = [['NX Inter', 'fonts/3d/inter-latin-400-normal.woff', 400], ['NX Inter', 'fonts/3d/inter-latin-800-normal.woff', 800], ['NX Space Grotesk', 'fonts/3d/space-grotesk-latin-700-normal.woff', 700],
      ['NX Fredoka', 'fonts/3d/fredoka-latin-600-normal.woff', 600], ['NX Playfair', 'fonts/3d/playfair-display-latin-700-normal.woff', 700]];
    await Promise.all(faces.map(async ([fam, url, w]) => {
      try { const f = new FontFace(fam, `url(${url})`, { weight: String(w) }); await f.load(); document.fonts.add(f); } catch { /* police indisponible */ }
    }));
  }

  resume() { this.visible = true; this.resize(); }

  pause() { this.visible = false; this.save(); }

  resize() {
    const r = this.$.stage.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) return;
    const c = this.canvas;
    const w = Math.floor(r.width); const h = Math.floor(r.height);
    // Le point au centre de la vue reste au centre quand la fenêtre change de taille.
    if (c.width && c.height && (c.width !== w || c.height !== h)) {
      const v = c.viewportTransform.slice();
      v[4] += (w - c.width) / 2; v[5] += (h - c.height) / 2;
      c.setViewportTransform(v);
    }
    c.setDimensions({ width: w, height: h });
    c.requestRenderAll();
  }

  // ================================================================== documents et pages
  async openLastDoc() {
    let doc = settings.designDoc ? await getDoc(settings.designDoc).catch(() => null) : null;
    if (!doc) {
      const list = await listDocs();
      doc = list[0] ? await getDoc(list[0].id) : null;
    }
    if (!doc) { doc = newDoc('Mon premier design', 'post'); await putDoc(doc); }
    await this.openDoc(doc);
  }

  async openDoc(doc) {
    if (this.doc) await this.save();
    this.doc = doc;
    settings.designDoc = doc.id;
    persist();
    $('#dzDocName', this.el).textContent = doc.name;
    await this.openPage(Math.min(doc.cur || 0, doc.pages.length - 1), { save: false });
    this.watchCloud(doc);
  }

  get page() { return this.doc.pages[this.pageIdx]; }

  async openPage(i, { save = true } = {}) {
    if (save && this.page) this.capturePage();
    this.pageIdx = i;
    this.doc.cur = i;
    this.hist = [];
    this.fut = [];
    await this.loadPage(this.page);
    this.pushHistory();
    this.fit();
    this.renderLeft();
    this.renderProps();
  }

  // Le cadre de la page : fond, taille, et repère de toute la mise en page (non sélectionnable).
  makeBoard(p) {
    const b = new Rect({
      left: 0, top: 0, width: p.w, height: p.h, fill: p.bg || '#ffffff', selectable: false, evented: false, hoverCursor: 'default', objectCaching: false,
      shadow: { color: 'rgba(0,0,0,0.18)', blur: 30, offsetX: 0, offsetY: 6 },
    });
    b.id = '__board';
    b.excludeFromExport = true;
    return b;
  }

  get board() { return this.canvas.getObjects().find((o) => o.id === '__board'); }

  async loadPage(p, json = p.json) {
    this.loading = true;
    const c = this.canvas;
    c.discardActiveObject();
    for (const o of c.getObjects()) if (o.type === 'layer3d') disposeLayer(o.id);
    c.clear();
    c.backgroundColor = '';
    if (json) {
      await c.loadFromJSON(json);
      c.backgroundColor = '';
    }
    c.insertAt(0, this.makeBoard(p));
    for (const o of c.getObjects()) { if (!o.id) o.id = uid(); this.applyLock(o); }
    this.loading = false;
    c.requestRenderAll();
    await this.refresh3d();
  }

  // Page courante → JSON (sans le cadre).
  pageJson() {
    const json = this.canvas.toObject();
    json.objects = (json.objects || []).filter((o) => o.id !== '__board');
    delete json.background;
    return json;
  }

  capturePage() { if (this.page && this.canvas) this.page.json = this.pageJson(); }

  // Enregistrement automatique (un peu après chaque modification).
  scheduleSave() {
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => this.save(), 900);
  }

  async save() {
    if (!this.doc || !this.canvas) return;
    clearTimeout(this.saveT);
    this.capturePage();
    try { this.doc.thumb = this.thumb(); } catch { /* aperçu impossible */ }
    await putDoc(this.doc).catch((e) => console.warn('[design] enregistrement', e));
    this.scheduleCloud();
  }

  // ------------------------------------------------------------------ NEXORA Cloud (équipe, temps réel)
  async cloudMod() {
    if (!this.cloudP) this.cloudP = Promise.all([import('../cloud/sync.js'), import('../cloud/session.js')]).then(([a, b]) => ({ ...a, ...b })).catch(() => null);
    return this.cloudP;
  }

  scheduleCloud() {
    clearTimeout(this.cloudT);
    this.cloudT = setTimeout(async () => {
      const m = await this.cloudMod();
      if (!m || !m.designCloud.enabled() || !this.doc) return;
      try {
        const r = await m.designCloud.upload(this.doc);
        if (r) { this.doc.cloudVersion = r.version; m.designCloud.announceSaved(this.doc.id, r.version); this.setCloudState('ok'); }
      } catch (err) { this.setCloudState('err', err.message); }
    }, 2500);
    this.setCloudState('pending');
  }

  setCloudState(st, msg = '') {
    const el = $('#dzCloud', this.el);
    if (!el) return;
    el.dataset.st = st;
    el.title = st === 'ok' ? 'Enregistré dans NEXORA Cloud' : st === 'pending' ? 'Enregistrement dans le cloud…' : st === 'err' ? `Cloud : ${msg}` : 'Hors ligne (enregistré sur cet appareil)';
  }

  async watchCloud(doc) {
    if (this.unPresence) { this.unPresence(); this.unPresence = null; }
    const m = await this.cloudMod();
    if (!m || !m.designCloud.enabled()) { this.setCloudState('off'); return; }
    this.setCloudState('ok');
    this.unPresence = m.designCloud.presence(doc.id, (people) => {
      const box = $('#dzPeople', this.el);
      if (box) box.innerHTML = people.slice(0, 4).map((p) => `<span class="dz-person" title="${esc(p.name)} regarde ce document">${m.avatarHtml({ full_name: p.name, avatar_url: p.avatar, id: p.id }, 24)}</span>`).join('');
    });
    if (!this.remoteBound) {
      this.remoteBound = true;
      const { bus } = await import('../core/dom.js');
      bus.on('design-saved-remote', (p) => {
        if (!this.doc || p.localId !== this.doc.id || (m.cloud.user && p.by === m.cloud.user.id)) return;
        toast(`${p.name || 'Un coéquipier'} a modifié ce document.`, { action: 'Recharger', onAction: () => this.reloadFromCloud() });
      });
    }
  }

  async reloadFromCloud() {
    const m = await this.cloudMod();
    if (!m) return;
    const rows = await m.designCloud.list();
    const row = rows.find((r) => r.local_id === this.doc.id);
    if (!row) return;
    const d = await m.designCloud.download(row);
    await putDoc(d);
    this.doc = null;
    await this.openDoc(d);
    toast('Document rechargé depuis le cloud.');
  }

  async openCloudDoc(row) {
    const m = await this.cloudMod();
    const busy = toast('Téléchargement du document…', { busy: true, sticky: true });
    try {
      const d = await m.designCloud.download(row);
      await putDoc(d);
      await this.openDoc(d);
    } catch (err) { toast(`Le document n’a pas pu être ouvert : ${err.message}`, { kind: 'bad' }); } finally { busy.close(); }
  }

  thumb() {
    const p = this.page;
    const el = this.renderPage(Math.min(1, 240 / Math.max(p.w, p.h)));
    return el.toDataURL('image/jpeg', 0.7);
  }

  // ================================================================== rendu de la page (export)
  renderPage(scale = 1, { transparent = false } = {}) {
    const c = this.canvas;
    const p = this.page;
    const vp = c.viewportTransform;
    const z = c.getZoom();
    const active = c.getActiveObject();
    const guides = this.guides;
    this.guides = null;
    const el = c.toCanvasElement(scale / z, {
      left: vp[4], top: vp[5], width: p.w * z + 2 * z / scale, height: p.h * z + 2 * z / scale, filter: (o) => (transparent ? o.id !== '__board' : true) && o.visible !== false,
    });
    this.guides = guides;
    void active;
    // Taille exacte (sans arrondi flottant) ; le fond est remis net sous le cadre (qui porte une ombre décorative).
    const out = document.createElement('canvas');
    out.width = Math.round(p.w * scale); out.height = Math.round(p.h * scale);
    const g = out.getContext('2d');
    if (!transparent) { g.fillStyle = p.bg || '#ffffff'; g.fillRect(0, 0, out.width, out.height); }
    g.drawImage(el, 0, 0, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  // ================================================================== vue : zoom et déplacement
  fit() {
    const c = this.canvas;
    const p = this.page;
    if (!p || !c.width) return;
    const z = Math.min((c.width - 80) / p.w, (c.height - 80) / p.h, 4);
    c.setViewportTransform([z, 0, 0, z, (c.width - p.w * z) / 2, (c.height - p.h * z) / 2]);
    this.afterZoom();
  }

  zoomTo(z, at = null) {
    const c = this.canvas;
    const pt = at || new Point(c.width / 2, c.height / 2);
    c.zoomToPoint(pt, clamp(z, 0.02, 64));
    this.afterZoom();
  }

  zoomBy(f) { this.zoomTo(this.canvas.getZoom() * f); }

  afterZoom() {
    this.$.zoom.textContent = `${Math.round(this.canvas.getZoom() * 100)} %`;
    // Les calques 3D se recalculent à la nouvelle définition (après le zoom).
    clearTimeout(this.zT);
    this.zT = setTimeout(() => this.refresh3d({ onlyBlurry: true }), 350);
    this.canvas.requestRenderAll();
  }

  // ================================================================== événements du canevas
  bindCanvas() {
    const c = this.canvas;
    c.on('mouse:wheel', (opt) => {
      const e = opt.e;
      e.preventDefault();
      e.stopPropagation();
      if (e.ctrlKey || e.metaKey) {
        const z = c.getZoom() * 0.999 ** e.deltaY;
        this.zoomTo(z, new Point(e.offsetX, e.offsetY));
      } else {
        const vpt = c.viewportTransform.slice();
        vpt[4] -= e.shiftKey ? e.deltaY : e.deltaX;
        vpt[5] -= e.shiftKey ? 0 : e.deltaY;
        c.setViewportTransform(vpt);
        c.requestRenderAll();
      }
    });
    c.on('mouse:down', (opt) => this.onDown(opt));
    c.on('mouse:move', (opt) => this.onMove(opt));
    c.on('mouse:up', (opt) => this.onUp(opt));
    c.on('mouse:dblclick', (opt) => this.onDbl(opt));
    c.on('object:moving', (opt) => this.snapMove(opt.target));
    c.on('object:scaling', (opt) => { if (opt.target.type === 'layer3d') opt.target.needsRender = true; });
    c.on('object:modified', (opt) => {
      this.guides = null;
      const t = opt.target;
      const list = t && t.type === 'activeselection' ? t.getObjects() : [t];
      for (const o of list) if (o && o.type === 'layer3d' && o.needsRender) refreshLayer(o, this.doc.assets).then(() => c.requestRenderAll());
      // Rectangles : le rayon des coins reste constant quand on étire.
      for (const o of list) if (o && o.type === 'rect' && (o.scaleX !== 1 || o.scaleY !== 1) && o.id !== '__board') { o.set({ width: o.width * o.scaleX, height: o.height * o.scaleY, scaleX: 1, scaleY: 1 }); o.setCoords(); }
      this.changed();
    });
    c.on('object:added', (opt) => { if (!this.loading && opt.target && opt.target.id !== '__board') { if (!opt.target.id) opt.target.id = uid(); this.changed(); } });
    c.on('object:removed', () => { if (!this.loading) this.changed(); });
    c.on('path:created', (opt) => { opt.path.id = uid(); opt.path.name = 'Trait'; opt.path.strokeUniform = true; this.changed(); });
    c.on('text:changed', () => this.changedSoon());
    c.on('selection:created', () => this.onSelect());
    c.on('selection:updated', () => this.onSelect());
    c.on('selection:cleared', () => this.onSelect());
    c.on('after:render', ({ ctx }) => this.drawGuides(ctx));
  }

  onSelect() {
    if (this.orbit && this.canvas.getActiveObject() !== this.orbit) this.setOrbit(null);
    this.renderProps();
    this.markLayers();
  }

  scene(opt) { return this.canvas.getScenePoint(opt.e); }

  onDown(opt) {
    const e = opt.e;
    const c = this.canvas;
    // Déplacement de la vue : outil Main, barre d'espace maintenue, ou bouton du milieu.
    if (this.tool === 'hand' || this.space || e.button === 1) {
      this.pan = { x: e.clientX, y: e.clientY, vpt: c.viewportTransform.slice() };
      c.selection = false;
      c.setCursor('grabbing');
      return;
    }
    if (e.button === 2) { this.contextMenu(opt); return; }
    // Calque 3D en mode orbite : glisser fait pivoter l'objet.
    if (this.orbit && opt.target === this.orbit) {
      this.orbitDrag = { x: e.clientX, y: e.clientY, rx: this.orbit.spec.rx, ry: this.orbit.spec.ry };
      this.orbit.lockMovementX = true; this.orbit.lockMovementY = true;
      return;
    }
    const p = this.scene(opt);
    if (['rect', 'ellipse', 'polygon', 'line'].includes(this.tool)) { this.startShape(p); return; }
    if (this.tool === 'text') { this.addText(p); return; }
    if (this.tool === 'pen') { this.penDown(p, e); }
  }

  onMove(opt) {
    const e = opt.e;
    const c = this.canvas;
    if (this.pan) {
      const vpt = this.pan.vpt.slice();
      vpt[4] += e.clientX - this.pan.x;
      vpt[5] += e.clientY - this.pan.y;
      c.setViewportTransform(vpt);
      c.requestRenderAll();
      return;
    }
    if (this.orbitDrag) {
      const o = this.orbit;
      o.spec.ry = this.orbitDrag.ry + (e.clientX - this.orbitDrag.x) * 0.5;
      o.spec.rx = clamp(this.orbitDrag.rx + (e.clientY - this.orbitDrag.y) * 0.5, -89, 89);
      this.render3dSoon(o, true);
      return;
    }
    if (this.drawing) { this.dragShape(this.scene(opt), e); return; }
    if (this.tool === 'pen' && this.pen) this.penMove(this.scene(opt), e);
  }

  onUp() {
    const c = this.canvas;
    if (this.pan) { this.pan = null; c.selection = this.tool === 'select'; c.setCursor(this.tool === 'hand' || this.space ? 'grab' : 'default'); return; }
    if (this.orbitDrag) {
      this.orbitDrag = null;
      const o = this.orbit;
      o.lockMovementX = false; o.lockMovementY = false;
      refreshLayer(o, this.doc.assets).then(() => { c.requestRenderAll(); this.renderProps(); this.changed(); });
      return;
    }
    if (this.drawing) this.endShape();
    if (this.tool === 'pen' && this.pen) this.penUp();
    if (this.guides) { this.guides = null; c.requestRenderAll(); }
  }

  onDbl(opt) {
    const t = opt.target;
    if (this.tool === 'pen' && this.pen) { this.finishPen(false); return; }
    if (t && t.type === 'layer3d') { this.setOrbit(this.orbit === t ? null : t); }
  }

  setOrbit(layer) {
    this.orbit = layer;
    this.$.hint.hidden = !layer;
    if (layer) this.$.hint.innerHTML = `${icon('rotate3d', 14)}<span>Rotation 3D : glisse sur l’objet pour le faire pivoter · double-clic ou Échap pour terminer</span>`;
    this.canvas.requestRenderAll();
  }

  // Rendu d'un calque 3D sans saturer : une image à la fois (aperçu rapide pendant le geste).
  render3dSoon(layer, fast = false) {
    this.pending3d = { layer, fast };
    if (this.rendering3d) return;
    const run = async () => {
      const job = this.pending3d;
      this.pending3d = null;
      if (!job) { this.rendering3d = false; return; }
      this.rendering3d = true;
      try { await refreshLayer(job.layer, this.doc.assets, { fast: job.fast }); this.canvas.requestRenderAll(); } catch (e) { console.warn('[3d]', e); }
      run();
    };
    run();
  }

  async refresh3d({ onlyBlurry = false } = {}) {
    const z = this.canvas.getZoom();
    for (const o of this.canvas.getObjects()) {
      if (o.type !== 'layer3d') continue;
      // Trop flou pour le zoom actuel : on recalcule.
      if (onlyBlurry && !o.needsRender && o.scaleX * z <= 0.75) continue;
      // eslint-disable-next-line no-await-in-loop
      try { await refreshLayer(o, this.doc.assets); } catch (e) { console.warn('[3d]', e); }
    }
    this.canvas.requestRenderAll();
  }

  // ================================================================== magnétisme et repères
  snapMove(t) {
    if (settings.designSnap === false) return;
    const c = this.canvas;
    const z = c.getZoom();
    const th = SNAP / z;
    const r = t.getBoundingRect();
    const xs = [r.left, r.left + r.width / 2, r.left + r.width];
    const ys = [r.top, r.top + r.height / 2, r.top + r.height];
    const tx = []; const ty = [];
    const p = this.page;
    tx.push(0, p.w / 2, p.w); ty.push(0, p.h / 2, p.h);
    const moving = new Set(t.type === 'activeselection' ? t.getObjects() : [t]);
    for (const o of c.getObjects()) {
      if (moving.has(o) || o.id === '__board' || !o.visible) continue;
      const b = o.getBoundingRect();
      tx.push(b.left, b.left + b.width / 2, b.left + b.width);
      ty.push(b.top, b.top + b.height / 2, b.top + b.height);
    }
    let best = null; let dx = 0; let bestY = null; let dy = 0;
    for (const x of xs) for (const v of tx) { const d = v - x; if (Math.abs(d) < th && (best === null || Math.abs(d) < Math.abs(dx))) { best = v; dx = d; } }
    for (const y of ys) for (const v of ty) { const d = v - y; if (Math.abs(d) < th && (bestY === null || Math.abs(d) < Math.abs(dy))) { bestY = v; dy = d; } }
    if (best !== null) t.left += dx;
    if (bestY !== null) t.top += dy;
    t.setCoords();
    this.guides = { x: best, y: bestY };
  }

  drawGuides(ctx) {
    const g = this.guides;
    if (!g || (g.x === null && g.y === null)) return;
    const vpt = this.canvas.viewportTransform;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = this.canvas.getRetinaScaling();
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#ff2d78';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    if (g.x !== null) { const x = g.x * vpt[0] + vpt[4]; ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, this.canvas.height); ctx.stroke(); }
    if (g.y !== null) { const y = g.y * vpt[3] + vpt[5]; ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(this.canvas.width, y + 0.5); ctx.stroke(); }
    ctx.restore();
  }

  // ================================================================== outils
  setTool(t) {
    if (this.pen && t !== 'pen') this.finishPen(false);
    if (t === 'image') { this.importImage(); return; }
    if (t === 'three') { this.menu3d($('[data-tool="three"]', this.el)); return; }
    this.tool = t;
    const c = this.canvas;
    c.isDrawingMode = t === 'pencil';
    if (t === 'pencil') {
      const b = new PencilBrush(c);
      b.color = settings.designPencilColor || '#1d1d1f';
      b.width = settings.designPencilWidth || 6;
      b.decimate = 2;
      c.freeDrawingBrush = b;
    }
    c.selection = t === 'select';
    c.defaultCursor = t === 'hand' ? 'grab' : ['rect', 'ellipse', 'polygon', 'line', 'pen', 'text'].includes(t) ? 'crosshair' : 'default';
    for (const o of c.getObjects()) if (o.id !== '__board' && !o.locked) o.selectable = t === 'select';
    for (const b of this.el.querySelectorAll('[data-tool]')) b.classList.toggle('on', b.dataset.tool === t);
    if (t !== 'select') c.discardActiveObject();
    c.requestRenderAll();
    this.renderProps();
  }

  shapeStyle() {
    const st = settings.designStyle || {};
    return {
      fill: st.fill || '#6a4cff', stroke: st.stroke || null, strokeWidth: st.strokeWidth ?? 0, strokeUniform: true, strokeLineJoin: 'round', strokeLineCap: 'round',
    };
  }

  startShape(p) {
    const c = this.canvas;
    let o;
    const base = { left: p.x, top: p.y, ...this.shapeStyle() };
    if (this.tool === 'rect') { o = new Rect({ ...base, width: 1, height: 1, rx: 0, ry: 0 }); o.name = 'Rectangle'; }
    if (this.tool === 'ellipse') { o = new Ellipse({ ...base, rx: 0.5, ry: 0.5 }); o.name = 'Ellipse'; }
    if (this.tool === 'polygon') {
      const pts = settings.designStar ? starPoints(settings.designStarPoints || 5, 0.45) : polyPoints(settings.designPolySides || 6);
      o = new Polygon(pts.map(([x, y]) => ({ x: x * 50, y: y * 50 })), { ...base });
      o.name = settings.designStar ? 'Étoile' : 'Polygone';
      o.shapeKind = settings.designStar ? 'star' : 'poly';
    }
    if (this.tool === 'line') {
      o = new Line([p.x, p.y, p.x, p.y], { stroke: (settings.designStyle || {}).stroke || '#1d1d1f', strokeWidth: (settings.designStyle || {}).lineWidth || 4, strokeLineCap: 'round', strokeUniform: true });
      o.name = 'Ligne';
    }
    o.id = uid();
    this.loading = true;
    c.add(o);
    this.loading = false;
    this.drawing = { o, p0: p };
  }

  dragShape(p, e) {
    const { o, p0 } = this.drawing;
    let w = p.x - p0.x; let h = p.y - p0.y;
    if (e.shiftKey && o.type !== 'line') { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
    if (o.type === 'line') {
      let x2 = p.x; let y2 = p.y;
      if (e.shiftKey) { const a = Math.round(Math.atan2(y2 - p0.y, x2 - p0.x) / (Math.PI / 4)) * (Math.PI / 4); const d = Math.hypot(x2 - p0.x, y2 - p0.y); x2 = p0.x + Math.cos(a) * d; y2 = p0.y + Math.sin(a) * d; }
      o.set({ x2, y2 });
    } else if (o.type === 'ellipse') {
      o.set({ left: Math.min(p0.x, p0.x + w), top: Math.min(p0.y, p0.y + h), rx: Math.abs(w) / 2, ry: Math.abs(h) / 2 });
    } else if (o.type === 'polygon') {
      const bw = o.width; const bh = o.height;
      o.set({ left: Math.min(p0.x, p0.x + w), top: Math.min(p0.y, p0.y + h), scaleX: Math.max(0.01, Math.abs(w) / bw), scaleY: Math.max(0.01, Math.abs(h) / bh) });
    } else {
      o.set({ left: Math.min(p0.x, p0.x + w), top: Math.min(p0.y, p0.y + h), width: Math.abs(w), height: Math.abs(h) });
    }
    o.setCoords();
    this.canvas.requestRenderAll();
  }

  endShape() {
    const { o } = this.drawing;
    this.drawing = null;
    const c = this.canvas;
    const tiny = o.type === 'line' ? Math.hypot(o.x2 - o.x1, o.y2 - o.y1) < 2 : o.getScaledWidth() < 3 && o.getScaledHeight() < 3;
    if (tiny) {
      // Simple clic : forme de taille standard.
      const s = 160 / c.getZoom();
      if (o.type === 'line') o.set({ x2: o.x1 + s, y2: o.y1 });
      else if (o.type === 'ellipse') o.set({ rx: s / 2, ry: s / 2 });
      else if (o.type === 'polygon') o.set({ scaleX: s / o.width, scaleY: s / o.height });
      else o.set({ width: s, height: s });
    }
    o.setCoords();
    this.setTool('select');
    c.setActiveObject(o);
    this.changed();
  }

  addText(p, opts = {}) {
    const c = this.canvas;
    const st = settings.designText || {};
    const t = new Textbox(opts.text || 'Ton texte', {
      left: p.x, top: p.y, width: opts.width || Math.max(240, 400 / c.getZoom()), fontFamily: opts.font || st.font || 'NX Inter', fontSize: opts.size || st.size || 64, fontWeight: opts.weight || st.weight || 800,
      fill: opts.color || st.color || '#1d1d1f', lineHeight: 1.1, charSpacing: opts.spacing || 0, textAlign: opts.align || 'left', splitByGrapheme: false,
    });
    t.id = uid();
    t.name = opts.name || 'Texte';
    c.add(t);
    this.setTool('select');
    c.setActiveObject(t);
    if (!opts.noEdit) { t.enterEditing(); t.selectAll(); }
    c.requestRenderAll();
    return t;
  }

  // ------------------------------------------------------------------ plume (courbes de Bézier)
  penDown(p, e) {
    if (!this.pen) this.pen = { pts: [] };
    const pts = this.pen.pts;
    // Clic sur le premier point : on ferme la forme.
    if (pts.length > 2) {
      const f = pts[0];
      if (Math.hypot(f.x - p.x, f.y - p.y) < 8 / this.canvas.getZoom()) { this.finishPen(true); return; }
    }
    pts.push({ x: p.x, y: p.y, hx: 0, hy: 0 });
    this.pen.drag = true;
    void e;
    this.drawPen(p);
  }

  penMove(p) {
    const pts = this.pen.pts;
    if (this.pen.drag && pts.length) {
      const a = pts[pts.length - 1];
      a.hx = p.x - a.x; a.hy = p.y - a.y;
    }
    this.drawPen(p);
  }

  penUp() { if (this.pen) this.pen.drag = false; }

  penD(pts, close) {
    if (!pts.length) return '';
    let d = `M ${round(pts[0].x)} ${round(pts[0].y)}`;
    const seg = (a, b) => ` C ${round(a.x + a.hx)} ${round(a.y + a.hy)} ${round(b.x - b.hx)} ${round(b.y - b.hy)} ${round(b.x)} ${round(b.y)}`;
    for (let i = 1; i < pts.length; i++) d += seg(pts[i - 1], pts[i]);
    if (close && pts.length > 2) d += `${seg(pts[pts.length - 1], pts[0])} Z`;
    return d;
  }

  drawPen(cursor) {
    const c = this.canvas;
    c.requestRenderAll();
    const ctx = c.contextTop;
    c.clearContext(ctx);
    const pts = this.pen.pts;
    if (!pts.length) return;
    const v = c.viewportTransform;
    ctx.save();
    const dpr = c.getRetinaScaling();
    ctx.setTransform(v[0] * dpr, 0, 0, v[3] * dpr, v[4] * dpr, v[5] * dpr);
    const z = c.getZoom();
    ctx.lineWidth = 1.5 / z;
    ctx.strokeStyle = '#6a4cff';
    ctx.stroke(new Path2D(this.penD(cursor && !this.pen.drag ? [...pts, { x: cursor.x, y: cursor.y, hx: 0, hy: 0 }] : pts, false)));
    for (const a of pts) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(a.x - 3.5 / z, a.y - 3.5 / z, 7 / z, 7 / z);
      ctx.strokeRect(a.x - 3.5 / z, a.y - 3.5 / z, 7 / z, 7 / z);
      if (a.hx || a.hy) {
        ctx.beginPath(); ctx.moveTo(a.x - a.hx, a.y - a.hy); ctx.lineTo(a.x + a.hx, a.y + a.hy); ctx.stroke();
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(a.x + s * a.hx, a.y + s * a.hy, 3 / z, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      }
    }
    ctx.restore();
  }

  finishPen(close) {
    const pen = this.pen;
    this.pen = null;
    const c = this.canvas;
    c.clearContext(c.contextTop);
    if (!pen || pen.pts.length < 2) { c.requestRenderAll(); return; }
    const st = this.shapeStyle();
    const path = new Path(this.penD(pen.pts, close), {
      fill: close ? st.fill : '', stroke: close ? st.stroke : (st.stroke || '#1d1d1f'), strokeWidth: close ? st.strokeWidth : Math.max(3, st.strokeWidth || 3), strokeUniform: true, strokeLineCap: 'round', strokeLineJoin: 'round',
    });
    path.id = uid();
    path.name = close ? 'Forme' : 'Tracé';
    c.add(path);
    this.setTool('select');
    c.setActiveObject(path);
  }

  // ================================================================== images, SVG, fichiers
  async importImage() {
    const f = await api.invoke('dialog:open-file', { title: 'Importer une image', filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'bmp'] }], asDataUrl: true });
    if (!f || !f.dataUrl) return;
    if (/\.svg$/i.test(f.name)) { await this.addSvg(atob(f.dataUrl.split(',')[1]), f.name); return; }
    await this.addImage(f.dataUrl, f.name);
  }

  async addImage(src, name = 'Image', at = null) {
    const img = await FabricImage.fromURL(src);
    const p = this.page;
    const k = Math.min(1, (p.w * 0.7) / img.width, (p.h * 0.7) / img.height);
    img.set({ scaleX: k, scaleY: k });
    const ctr = at || new Point(p.w / 2, p.h / 2);
    img.set({ left: ctr.x - (img.width * k) / 2, top: ctr.y - (img.height * k) / 2 });
    img.id = uid();
    img.name = name.replace(/\.[a-z0-9]+$/i, '');
    this.canvas.add(img);
    this.setTool('select');
    this.canvas.setActiveObject(img);
    return img;
  }

  async addSvg(text, name = 'Illustration') {
    const { objects, options } = await loadSVGFromString(text);
    const list = objects.filter(Boolean);
    if (!list.length) { toast('Ce fichier SVG ne contient aucune forme lisible.', { kind: 'bad' }); return; }
    const g = util.groupSVGElements(list, options);
    const p = this.page;
    const k = Math.min(1, (p.w * 0.6) / g.width, (p.h * 0.6) / g.height);
    g.set({ scaleX: k, scaleY: k, left: p.w / 2 - (g.width * k) / 2, top: p.h / 2 - (g.height * k) / 2 });
    g.id = uid();
    g.name = name.replace(/\.svg$/i, '');
    this.canvas.add(g);
    this.canvas.setActiveObject(g);
  }

  async onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const files = [...(e.dataTransfer.files || [])];
    const at = this.canvas.getScenePoint(e);
    for (const file of files) {
      // eslint-disable-next-line no-await-in-loop
      await this.addFile(file, at);
    }
  }

  async addFile(file, at = null) {
    const name = file.name || 'Image';
    if (/\.(glb|gltf)$/i.test(name)) { await this.add3d({ kind: 'glb' }, { bytes: new Uint8Array(await file.arrayBuffer()), name }); return; }
    if (/svg/.test(file.type) || /\.svg$/i.test(name)) { await this.addSvg(await file.text(), name); return; }
    if (/^image\//.test(file.type)) {
      const url = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
      await this.addImage(url, name, at);
    }
  }

  // ================================================================== calques 3D
  menu3d(anchor) {
    const shapes = Object.entries(SHAPES3D);
    const pop = showPopover(anchor, `<div class="pop-title">Ajouter un objet 3D</div>
      <div class="dz-3dgrid">${shapes.map(([k, l]) => `<button class="dz-3d" data-3d="decor:${k}">${icon(k.includes('sphere') || k === 'tore' || k === 'anneau' ? 'sphere' : k === 'etoile' ? 'star' : k === 'coeur' ? 'heart' : 'cube', 18)}<span>${esc(l)}</span></button>`).join('')}</div>
      <div class="menu-sep"></div>
      <button class="menu-item" data-3d="text">${icon('text', 15)}<span>Texte en relief 3D</span></button>
      <button class="menu-item" data-3d="icon">${icon('star', 15)}<span>Icône 3D</span></button>
      <button class="menu-item" data-3d="device">${icon('phone', 15)}<span>Appareil avec ton site (Responsive Lab)</span></button>
      <button class="menu-item" data-3d="glb">${icon('upload', 15)}<span>Importer un modèle 3D (.glb, .gltf)…</span></button>
      <button class="menu-item" data-3d="studio">${icon('cube', 15)}<span>Image de la scène du Studio 3D</span></button>`, { width: 330, align: 'start' });
    if (!pop) return;
    this.paint3dThumbs(pop);
    pop.onclick = async (e) => {
      const b = e.target.closest('[data-3d]');
      if (!b) return;
      hidePopover();
      const [k, shape] = b.dataset['3d'].split(':');
      try {
        if (k === 'decor') await this.add3d({ kind: 'decor', shape, finish: ['etoile', 'coeur', 'noeud', 'tore', 'anneau'].includes(shape) ? 'chrome' : 'satin', color: shape === 'sphere' ? '#ffffff' : '#6a4cff' });
        if (k === 'text') await this.add3d({ kind: 'text', text: 'NEXORA', color: '#ffffff', finish: 'chrome', rx: -8, ry: 18 });
        if (k === 'icon') await this.add3d({ kind: 'icon', icon: 'heart', color: '#ff2d55', finish: 'brillant' });
        if (k === 'device') await this.addDevice3d();
        if (k === 'glb') {
          const f = await api.invoke('dialog:open-file', { title: 'Modèle 3D', filters: [{ name: 'Modèles 3D', extensions: ['glb', 'gltf'] }], asBytes: true });
          if (f && f.data) await this.add3d({ kind: 'glb' }, { bytes: f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data), name: f.name });
        }
        if (k === 'studio') await this.addStudioShot();
      } catch (err) {
        console.error(err);
        toast(`L’objet 3D n’a pas pu être créé : ${err.message || err}`, { kind: 'bad' });
      }
    };
  }

  // Vignettes réelles des formes 3D (rendues une fois, puis gardées en mémoire).
  async paint3dThumbs(root) {
    for (const b of root.querySelectorAll('[data-3d^="decor:"], [data-q3]')) {
      const k = b.dataset.q3 || b.dataset['3d'].split(':')[1];
      if (!THUMBS3D.has(k)) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const cv = await renderSpec(`thumb:${k}`, { kind: 'decor', shape: k, finish: 'chrome', color: '#ffffff', shadow: 0, rx: -18, ry: 32 }, {}, 120, 120);
          disposeLayer(`thumb:${k}`);
          THUMBS3D.set(k, cv.toDataURL('image/png'));
        } catch { THUMBS3D.set(k, null); }
      }
      const url = THUMBS3D.get(k);
      if (url && b.isConnected) { const ic = b.querySelector('svg, img'); if (ic) ic.outerHTML = `<img class="dz-3dth" src="${url}" alt="">`; }
      if (!root.isConnected) return;
    }
  }

  addAsset(type, data, name) {
    const id = uid();
    this.doc.assets[id] = { type, data, name };
    return id;
  }

  async add3d(spec, { bytes = null, name = '' } = {}) {
    const s = { ...DEFAULT_SPEC, ...spec };
    if (bytes) {
      let b = '';
      for (let i = 0; i < bytes.length; i += 0x8000) b += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      s.asset = this.addAsset('glb', `data:model/gltf-binary;base64,${btoa(b)}`, name);
    }
    const p = this.page;
    const size = Math.min(p.w, p.h) * 0.5;
    const busy = toast('Rendu de l’objet 3D…', { busy: true, sticky: true });
    try {
      const l = new Layer3D(null, { spec: s, left: p.w / 2 - size / 2, top: p.h / 2 - size / 2, width: size, height: size });
      l.id = uid();
      l.name = s.kind === 'decor' ? `3D · ${SHAPES3D[s.shape] || s.shape}` : s.kind === 'text' ? `3D · ${s.text}` : s.kind === 'device' ? '3D · Appareil' : s.kind === 'glb' ? `3D · ${name.replace(/\.(glb|gltf)$/i, '') || 'Modèle'}` : s.kind === 'image3d' ? '3D · Scène du Studio' : '3D · Icône';
      await refreshLayer(l, this.doc.assets);
      this.canvas.add(l);
      this.setTool('select');
      this.canvas.setActiveObject(l);
      this.canvas.requestRenderAll();
      toast('Objet 3D ajouté : double-clic dessus pour le faire pivoter.', { ms: 3500 });
      return l;
    } finally { busy.close(); }
  }

  async boardShots() {
    const board = S.board;
    const views = board ? board.list.filter((v) => v.url) : [];
    const out = [];
    for (const v of views) {
      // eslint-disable-next-line no-await-in-loop
      const page = await v.capturePage().catch(() => null);
      if (page) out.push({ v, page, name: board.describe(v), deviceId: v.cfg.deviceId });
    }
    return out;
  }

  async addDevice3d() {
    const shots = await this.boardShots();
    if (!shots.length) { toast('Ouvre d’abord ton site dans le Responsive Lab : ses appareils deviennent des objets 3D ici.', { kind: 'bad' }); return; }
    const pick = shots.find((s) => !/mac|pc|desktop|laptop|imac/i.test(s.deviceId)) || shots[0];
    const screen = this.addAsset('image', pick.page.toDataURL('image/jpeg', 0.92), pick.name);
    await this.add3d({ kind: 'device', deviceId: pick.deviceId, screen, finish: 'satin', rx: -8, ry: -24, shadow: 0.3 });
  }

  async addStudioShot() {
    const st = S.studio;
    if (!st || !st.ready) { toast('Ouvre d’abord le Studio 3D pour composer une scène.', { kind: 'bad' }); return; }
    st.editorVisible(false);
    const c = st.three.renderTo(1600, 1200, { transparent: true });
    st.editorVisible(true);
    const asset = this.addAsset('image', c.toDataURL('image/png'), 'Scène du Studio');
    // La scène entière arrive comme une image détourée (fond transparent).
    await this.addImage(this.doc.assets[asset].data, 'Scène du Studio');
  }

  // ================================================================== édition
  sel() { return this.canvas.getActiveObjects().filter((o) => o.id !== '__board'); }

  applyLock(o) {
    if (o.id === '__board') return;
    const l = Boolean(o.locked);
    o.set({ selectable: !l && this.tool === 'select', evented: !l, lockMovementX: l, lockMovementY: l });
  }

  async duplicate() {
    const c = this.canvas;
    const list = this.sel();
    if (!list.length) return;
    c.discardActiveObject();
    const made = [];
    for (const o of list) {
      // eslint-disable-next-line no-await-in-loop
      const k = await o.clone(FabricObject.customProperties);
      k.set({ left: o.left + 20, top: o.top + 20 });
      k.id = uid();
      k.name = `${o.name || this.typeName(o)} (copie)`;
      if (k.type === 'layer3d') { k.spec = JSON.parse(JSON.stringify(o.spec)); k.setElement(o.getElement()); }
      c.add(k);
      made.push(k);
    }
    this.selectList(made);
  }

  selectList(list) {
    const c = this.canvas;
    c.discardActiveObject();
    if (list.length === 1) c.setActiveObject(list[0]);
    else if (list.length > 1) c.setActiveObject(new ActiveSelection(list, { canvas: c }));
    c.requestRenderAll();
  }

  async copy() {
    const list = this.sel();
    if (!list.length) return;
    this.clip = list.map((o) => ({ json: o.toObject(FabricObject.customProperties), el: o.type === 'layer3d' ? o.getElement() : null }));
  }

  async paste() {
    if (!this.clip) return;
    const objs = await util.enlivenObjects(this.clip.map((x) => x.json));
    const c = this.canvas;
    objs.forEach((o, i) => {
      o.id = uid();
      o.set({ left: o.left + 24, top: o.top + 24 });
      if (o.type === 'layer3d' && this.clip[i].el) o.setElement(this.clip[i].el);
      c.add(o);
    });
    for (const x of this.clip) { x.json.left += 24; x.json.top += 24; }
    this.selectList(objs);
  }

  remove() {
    const c = this.canvas;
    const list = this.sel().filter((o) => !o.locked);
    if (!list.length) return;
    c.discardActiveObject();
    for (const o of list) { if (o.type === 'layer3d') disposeLayer(o.id); c.remove(o); }
    c.requestRenderAll();
  }

  group() {
    const c = this.canvas;
    const list = this.sel();
    if (list.length < 2) return;
    c.discardActiveObject();
    const order = c.getObjects();
    list.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const at = order.indexOf(list[0]);
    this.loading = true;
    for (const o of list) c.remove(o);
    const g = new Group(list, { subTargetCheck: false, interactive: false });
    g.id = uid();
    g.name = 'Groupe';
    c.insertAt(at, g);
    this.loading = false;
    c.setActiveObject(g);
    this.changed();
  }

  ungroup() {
    const c = this.canvas;
    const g = c.getActiveObject();
    if (!g || g.type !== 'group') return;
    const at = c.getObjects().indexOf(g);
    this.loading = true;
    const items = g.removeAll();
    c.remove(g);
    items.forEach((o, i) => { if (!o.id) o.id = uid(); c.insertAt(at + i, o); });
    this.loading = false;
    this.selectList(items);
    this.changed();
  }

  arrange(how) {
    const c = this.canvas;
    const list = this.sel();
    if (!list.length) return;
    const ordered = how === 'front' || how === 'forward' ? list : [...list].reverse();
    for (const o of ordered) {
      if (how === 'front') c.bringObjectToFront(o);
      if (how === 'back') c.sendObjectToBack(o);
      if (how === 'forward') c.bringObjectForward(o);
      if (how === 'backward') c.sendObjectBackwards(o);
    }
    // Le cadre de la page reste toujours tout au fond.
    const b = this.board;
    if (b) c.sendObjectToBack(b);
    c.requestRenderAll();
    this.changed();
  }

  // Aligner par rapport à la sélection (plusieurs calques) ou à la page (un seul).
  align(where) {
    const c = this.canvas;
    const list = this.sel();
    if (!list.length) return;
    const a = c.getActiveObject();
    const multi = list.length > 1;
    if (multi) c.discardActiveObject();
    const ref = multi ? boundsOf(list) : { left: 0, top: 0, width: this.page.w, height: this.page.h };
    for (const o of list) {
      const r = o.getBoundingRect();
      let dx = 0; let dy = 0;
      if (where === 'left') dx = ref.left - r.left;
      if (where === 'hcenter') dx = ref.left + ref.width / 2 - (r.left + r.width / 2);
      if (where === 'right') dx = ref.left + ref.width - (r.left + r.width);
      if (where === 'top') dy = ref.top - r.top;
      if (where === 'vcenter') dy = ref.top + ref.height / 2 - (r.top + r.height / 2);
      if (where === 'bottom') dy = ref.top + ref.height - (r.top + r.height);
      o.set({ left: o.left + dx, top: o.top + dy });
      o.setCoords();
    }
    if (multi) this.selectList(list);
    else c.setActiveObject(a);
    c.requestRenderAll();
    this.changed();
  }

  distribute(axis) {
    const c = this.canvas;
    const list = this.sel();
    if (list.length < 3) return;
    c.discardActiveObject();
    const key = axis === 'h' ? 'left' : 'top';
    const size = axis === 'h' ? 'width' : 'height';
    const items = list.map((o) => ({ o, r: o.getBoundingRect() })).sort((x, y) => x.r[key] - y.r[key]);
    const first = items[0].r; const last = items[items.length - 1].r;
    const total = items.reduce((s, x) => s + x.r[size], 0);
    const gap = (last[key] + last[size] - first[key] - total) / (items.length - 1);
    let pos = first[key];
    for (const { o, r } of items) { o.set({ [key]: o[key] + (pos - r[key]) }); o.setCoords(); pos += r[size] + gap; }
    this.selectList(list);
    this.changed();
  }

  flip(axis) {
    for (const o of this.sel()) o.set(axis === 'x' ? { flipX: !o.flipX } : { flipY: !o.flipY });
    this.canvas.requestRenderAll();
    this.changed();
  }

  bool(op) {
    const c = this.canvas;
    const order = c.getObjects();
    const list = this.sel().sort((a, b) => order.indexOf(a) - order.indexOf(b));
    let res;
    try { res = booleanOp(list, op); } catch (e) { console.error(e); }
    if (!res) { toast('Sélectionne au moins deux formes (pas de texte, d’image ni d’objet 3D).', { kind: 'bad' }); return; }
    const at = order.indexOf(list[0]);
    c.discardActiveObject();
    this.loading = true;
    for (const o of list) c.remove(o);
    res.id = uid();
    res.name = BOOL_OPS[op][0];
    c.insertAt(at, res);
    this.loading = false;
    c.setActiveObject(res);
    this.changed();
  }

  outline() {
    const c = this.canvas;
    const o = c.getActiveObject();
    const p = o && toPath(o);
    if (!p) { toast('Cette forme ne peut pas être convertie en tracé.', { kind: 'bad' }); return; }
    const at = c.getObjects().indexOf(o);
    this.loading = true;
    c.remove(o);
    p.id = uid(); p.name = `${o.name || this.typeName(o)} (tracé)`;
    c.insertAt(at, p);
    this.loading = false;
    c.setActiveObject(p);
    this.changed();
  }

  // Masque : le calque du dessus découpe celui du dessous (comme un masque d'écrêtage).
  async mask() {
    const c = this.canvas;
    const order = c.getObjects();
    const list = this.sel().sort((a, b) => order.indexOf(a) - order.indexOf(b));
    if (list.length !== 2) { toast('Sélectionne deux calques : la forme du dessus sert de masque.', { kind: 'bad' }); return; }
    const [base, shape] = list;
    c.discardActiveObject();
    const clip = await shape.clone();
    clip.absolutePositioned = true;
    clip.set({ fill: '#000', stroke: null, shadow: null, opacity: 1 });
    base.clipPath = clip;
    base.dirty = true;
    c.remove(shape);
    c.setActiveObject(base);
    c.requestRenderAll();
    this.changed();
  }

  unmask() {
    const o = this.canvas.getActiveObject();
    if (!o || !o.clipPath) return;
    o.clipPath = undefined;
    o.dirty = true;
    this.canvas.requestRenderAll();
    this.changed();
  }

  nudge(dx, dy) {
    const a = this.canvas.getActiveObject();
    if (!a || a.locked) return;
    a.set({ left: a.left + dx, top: a.top + dy });
    a.setCoords();
    this.canvas.requestRenderAll();
    this.changedSoon();
    this.renderProps();
  }

  typeName(o) {
    return ({
      rect: 'Rectangle', ellipse: 'Ellipse', circle: 'Cercle', triangle: 'Triangle', polygon: 'Polygone', line: 'Ligne', path: 'Tracé', textbox: 'Texte', 'i-text': 'Texte', text: 'Texte', image: 'Image', group: 'Groupe', layer3d: 'Objet 3D', activeselection: 'Sélection',
    })[o.type] || 'Calque';
  }

  // ================================================================== historique
  changed() {
    if (this.loading) return;
    clearTimeout(this.histT);
    this.histT = setTimeout(() => this.pushHistory(), 120);
    this.scheduleSave();
    this.renderLayersSoon();
    this.renderProps();
  }

  changedSoon() {
    clearTimeout(this.softT);
    this.softT = setTimeout(() => this.changed(), 400);
  }

  pushHistory() {
    const snap = JSON.stringify({ json: this.pageJson(), w: this.page.w, h: this.page.h, bg: this.page.bg });
    if (this.hist[this.hist.length - 1] === snap) return;
    this.hist.push(snap);
    if (this.hist.length > 80) this.hist.shift();
    this.fut = [];
  }

  async undo() {
    if (this.hist.length < 2) return;
    this.fut.push(this.hist.pop());
    await this.restore(this.hist[this.hist.length - 1]);
  }

  async redo() {
    if (!this.fut.length) return;
    const s = this.fut.pop();
    this.hist.push(s);
    await this.restore(s);
  }

  async restore(snap) {
    const d = JSON.parse(snap);
    Object.assign(this.page, { w: d.w, h: d.h, bg: d.bg });
    await this.loadPage(this.page, d.json);
    this.page.json = d.json;
    this.scheduleSave();
    this.renderLeft();
    this.renderProps();
  }

  // ================================================================== panneau de gauche
  renderLeft() {
    for (const b of this.el.querySelectorAll('[data-dz-tab]')) b.classList.toggle('on', b.dataset.dzTab === this.leftTab);
    if (this.leftTab === 'pages') this.renderPages();
    else if (this.leftTab === 'assets') this.renderAssets();
    else this.renderLayers();
  }

  renderLayersSoon() {
    if (this.leftTab !== 'layers') return;
    cancelAnimationFrame(this.layRaf);
    this.layRaf = requestAnimationFrame(() => this.renderLayers());
  }

  layerIcon(o) {
    return ({
      rect: 'frame', ellipse: 'sphere', polygon: 'shapes', line: 'minus', path: 'pen', textbox: 'text', image: 'image', group: 'layers', layer3d: 'cube',
    })[o.type] || 'shapes';
  }

  renderLayers() {
    const objs = this.canvas.getObjects().filter((o) => o.id !== '__board').reverse();
    const active = new Set(this.sel());
    const row = (o, depth = 0) => `<div class="dz-layer${active.has(o) ? ' on' : ''}${o.visible === false ? ' off' : ''}" data-layer="${esc(o.id)}" style="--d:${depth}" draggable="${depth ? 'false' : 'true'}">
        <span class="dz-l-ic">${icon(this.layerIcon(o), 14)}</span><span class="dz-l-name">${esc(o.name || this.typeName(o))}</span>${o.clipPath ? `<span class="dz-l-tag" title="Masqué">${icon('frame', 11)}</span>` : ''}
        <button class="icon-btn small" data-lact="lock" title="${o.locked ? 'Déverrouiller' : 'Verrouiller'}">${icon(o.locked ? 'lock' : 'unlock', 13)}</button>
        <button class="icon-btn small" data-lact="vis" title="${o.visible === false ? 'Afficher' : 'Masquer'}">${icon(o.visible === false ? 'eyeOff' : 'eye', 13)}</button>
      </div>${o.type === 'group' ? o.getObjects().slice().reverse().map((x) => { if (!x.id) x.id = uid(); return row(x, depth + 1); }).join('') : ''}`;
    this.$.left.innerHTML = objs.length ? `<div class="dz-layers">${objs.map((o) => row(o)).join('')}</div>` : `<div class="dz-empty">${icon('layers', 22)}<p>La page est vide.</p><small>Choisis un outil en haut (rectangle, texte, plume, objet 3D…) ou dépose une image ici.</small></div>`;
  }

  markLayers() {
    if (this.leftTab !== 'layers') return;
    const ids = new Set(this.sel().map((o) => o.id));
    for (const r of this.$.left.querySelectorAll('[data-layer]')) r.classList.toggle('on', ids.has(r.dataset.layer));
  }

  findById(id) {
    let hit = null;
    const walk = (list) => { for (const o of list) { if (o.id === id) hit = o; if (o.type === 'group') walk(o.getObjects()); } };
    walk(this.canvas.getObjects());
    return hit;
  }

  renderPages() {
    const d = this.doc;
    this.$.left.innerHTML = `
      <div class="dz-pages">${d.pages.map((p, i) => `<div class="dz-page${i === this.pageIdx ? ' on' : ''}" data-page="${i}">
        <span class="dz-page-th"><i style="aspect-ratio:${p.w}/${p.h};background:${esc(p.bg || '#fff')}"></i></span>
        <span class="dz-page-t"><b>${esc(p.name)}</b><small>${p.w} × ${p.h}</small></span></div>`).join('')}</div>
      <div class="st-btns"><button class="btn small" data-pg="add">${icon('plus', 13)}<span>Page</span></button><button class="btn small" data-pg="dup" title="Dupliquer">${icon('copy', 13)}</button><button class="btn small" data-pg="rename" title="Renommer">${icon('text', 13)}</button><button class="btn small" data-pg="del" title="Supprimer" ${d.pages.length < 2 ? 'disabled' : ''}>${icon('trash', 13)}</button></div>`;
  }

  renderAssets() {
    const assets = Object.entries(this.doc.assets).filter(([, a]) => a.type === 'image');
    this.$.left.innerHTML = `
      <div class="st-head">Formes</div>
      <div class="dz-quick">${[['rect', 'frame', 'Rectangle'], ['ellipse', 'sphere', 'Ellipse'], ['tri', 'shapes', 'Triangle'], ['star', 'star', 'Étoile'], ['hex', 'shapes', 'Hexagone'], ['arrow', 'forward', 'Flèche'], ['heart', 'heart', 'Cœur'], ['bubble', 'chat', 'Bulle']].map(([k, ic, l]) => `<button class="dz-q" data-qa="${k}" title="${l}">${icon(ic, 18)}<span>${l}</span></button>`).join('')}</div>
      <div class="st-head">Textes</div>
      <div class="dz-texts">${[['title', 'Titre', 'NX Inter', 96, 800], ['sub', 'Sous-titre', 'NX Space Grotesk', 48, 700], ['body', 'Paragraphe', 'NX Inter', 28, 400], ['serif', 'Élégant', 'NX Playfair', 72, 700], ['fun', 'Arrondi', 'NX Fredoka', 64, 600]].map(([k, l, f, s, w]) => `<button class="dz-tx" data-qt="${k}" style="font-family:'${f}';font-weight:${w}">${l}</button>`).join('')}</div>
      <div class="st-head">Objets 3D</div>
      <div class="dz-3dgrid small">${['sphere', 'cube', 'tore', 'noeud', 'etoile', 'coeur', 'gemme', 'blob', 'capsule'].map((k) => `<button class="dz-3d" data-q3="${k}">${icon(k === 'etoile' ? 'star' : k === 'coeur' ? 'heart' : k === 'cube' ? 'cube' : 'sphere', 16)}<span>${esc(SHAPES3D[k])}</span></button>`).join('')}</div>
      <div class="st-btns" data-q3th><button class="btn small" data-q3m="1">${icon('cube', 13)}<span>Tous les objets 3D…</span></button></div>
      <div class="st-head">Captures du Responsive Lab</div>
      <div class="st-btns"><button class="btn small" data-qcap="1">${icon('camera', 13)}<span>Ajouter les écrans des appareils</span></button></div>
      ${assets.length ? `<div class="st-head">Images du document</div><div class="dz-assets">${assets.map(([id, a]) => `<button class="dz-asset" data-qimg="${esc(id)}" title="${esc(a.name || '')}"><img src="${a.data}" alt=""></button>`).join('')}</div>` : ''}`;
    this.paint3dThumbs(this.$.left);
  }

  async onLeftClick(e) {
    const t = (s) => e.target.closest(s);
    let b;
    if ((b = t('[data-dz-tab]'))) { this.leftTab = b.dataset.dzTab; settings.designLeftTab = this.leftTab; persist(); this.renderLeft(); return; }
    if ((b = t('[data-lact]'))) {
      const o = this.findById(b.closest('[data-layer]').dataset.layer);
      if (!o) return;
      if (b.dataset.lact === 'vis') { o.visible = o.visible === false; if (!o.visible) this.canvas.discardActiveObject(); }
      if (b.dataset.lact === 'lock') { o.locked = !o.locked; this.applyLock(o); if (o.locked) this.canvas.discardActiveObject(); }
      this.canvas.requestRenderAll();
      this.changed();
      this.renderLayers();
      return;
    }
    if ((b = t('[data-layer]'))) {
      const o = this.findById(b.dataset.layer);
      if (!o || o.group) { if (o && o.group) this.canvas.setActiveObject(o.group); this.canvas.requestRenderAll(); return; }
      if (e.shiftKey || e.ctrlKey || e.metaKey) this.selectList([...new Set([...this.sel(), o])]);
      else { this.canvas.discardActiveObject(); if (o.visible !== false) this.canvas.setActiveObject(o); }
      this.canvas.requestRenderAll();
      this.renderProps();
      this.markLayers();
      return;
    }
    if ((b = t('[data-page]'))) { if (Number(b.dataset.page) !== this.pageIdx) await this.openPage(Number(b.dataset.page)); return; }
    if ((b = t('[data-pg]'))) { await this.pageAction(b.dataset.pg, b); return; }
    if ((b = t('[data-qa]'))) { this.quickShape(b.dataset.qa); return; }
    if ((b = t('[data-qt]'))) {
      const [, l, f, s, w] = [['title', 'Titre', 'NX Inter', 96, 800], ['sub', 'Sous-titre', 'NX Space Grotesk', 48, 700], ['body', 'Paragraphe', 'NX Inter', 28, 400], ['serif', 'Élégant', 'NX Playfair', 72, 700], ['fun', 'Arrondi', 'NX Fredoka', 64, 600]].find((x) => x[0] === b.dataset.qt);
      const p = this.page;
      this.addText(new Point(p.w * 0.1, p.h * 0.1), {
        text: b.dataset.qt === 'body' ? 'Écris ici un paragraphe : NEX-DESIGN met en forme tes visuels.' : l, font: f, size: s * (p.w / 1080), weight: w, width: p.w * 0.8, name: l, noEdit: true,
      });
      return;
    }
    if ((b = t('[data-q3]'))) { await this.add3d({ kind: 'decor', shape: b.dataset.q3, finish: ['etoile', 'coeur', 'noeud', 'tore'].includes(b.dataset.q3) ? 'chrome' : 'satin', color: b.dataset.q3 === 'sphere' ? '#ffffff' : '#6a4cff' }); return; }
    if ((b = t('[data-q3m]'))) { this.menu3d(b); return; }
    if ((b = t('[data-qcap]'))) {
      const shots = await this.boardShots();
      if (!shots.length) { toast('Ouvre d’abord ton site dans le Responsive Lab.', { kind: 'bad' }); return; }
      for (const s of shots) {
        const id = this.addAsset('image', s.page.toDataURL('image/jpeg', 0.9), s.name);
        // eslint-disable-next-line no-await-in-loop
        await this.addImage(this.doc.assets[id].data, s.name);
      }
      this.renderAssets();
      return;
    }
    if ((b = t('[data-qimg]'))) { const a = this.doc.assets[b.dataset.qimg]; if (a) await this.addImage(a.data, a.name || 'Image'); }
  }

  quickShape(k) {
    const p = this.page;
    const s = Math.min(p.w, p.h) * 0.3;
    const st = this.shapeStyle();
    const pos = { left: p.w / 2 - s / 2, top: p.h / 2 - s / 2 };
    let o;
    const poly = (pts, name) => { const g = new Polygon(pts.map(([x, y]) => ({ x: x * s, y: y * s })), { ...st, ...pos }); g.name = name; return g; };
    if (k === 'rect') { o = new Rect({ ...st, ...pos, width: s, height: s, rx: s * 0.12, ry: s * 0.12 }); o.name = 'Rectangle'; o.radius = s * 0.12; }
    if (k === 'ellipse') { o = new Ellipse({ ...st, ...pos, rx: s / 2, ry: s / 2 }); o.name = 'Ellipse'; }
    if (k === 'tri') o = poly([[0.5, 0], [1, 1], [0, 1]], 'Triangle');
    if (k === 'star') { o = poly(starPoints(5, 0.45).map(([x, y]) => [(x + 1) / 2, (y + 1) / 2]), 'Étoile'); o.shapeKind = 'star'; }
    if (k === 'hex') o = poly(polyPoints(6).map(([x, y]) => [(x + 1) / 2, (y + 1) / 2]), 'Hexagone');
    if (k === 'arrow') o = poly([[0, 0.35], [0.6, 0.35], [0.6, 0.1], [1, 0.5], [0.6, 0.9], [0.6, 0.65], [0, 0.65]], 'Flèche');
    if (k === 'heart') { o = new Path('M 50 88 C 20 66 4 50 4 30 C 4 16 15 6 28 6 C 38 6 46 12 50 20 C 54 12 62 6 72 6 C 85 6 96 16 96 30 C 96 50 80 66 50 88 Z', { ...st }); o.scaleToWidth(s); o.set(pos); o.name = 'Cœur'; }
    if (k === 'bubble') { o = new Path('M 10 6 H 90 Q 96 6 96 12 V 62 Q 96 68 90 68 H 40 L 22 86 L 24 68 H 10 Q 4 68 4 62 V 12 Q 4 6 10 6 Z', { ...st }); o.scaleToWidth(s); o.set(pos); o.name = 'Bulle'; }
    if (!o) return;
    o.id = uid();
    this.canvas.add(o);
    this.setTool('select');
    this.canvas.setActiveObject(o);
  }

  async pageAction(a, btn) {
    const d = this.doc;
    if (a === 'add') { this.formatMenu(btn, async (k) => { this.capturePage(); d.pages.push(newPage(`Page ${d.pages.length + 1}`, k)); await this.openPage(d.pages.length - 1, { save: false }); this.save(); }); return; }
    if (a === 'dup') { this.capturePage(); const p = JSON.parse(JSON.stringify(this.page)); p.id = uid(); p.name = `${p.name} (copie)`; d.pages.splice(this.pageIdx + 1, 0, p); await this.openPage(this.pageIdx + 1, { save: false }); this.save(); }
    if (a === 'del' && d.pages.length > 1) { d.pages.splice(this.pageIdx, 1); this.pageIdx = Math.max(0, this.pageIdx - 1); await this.openPage(this.pageIdx, { save: false }); this.save(); }
    if (a === 'rename') {
      const row = this.$.left.querySelector('.dz-page.on .dz-page-t b');
      if (!row) return;
      row.innerHTML = `<input class="input small" value="${esc(this.page.name)}">`;
      const inp = row.querySelector('input'); inp.focus(); inp.select();
      const done = () => { if (inp.value.trim()) this.page.name = inp.value.trim(); this.save(); this.renderPages(); };
      inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') done(); if (ev.key === 'Escape') this.renderPages(); ev.stopPropagation(); });
      inp.addEventListener('blur', done);
    }
  }

  formatMenu(anchor, onPick) {
    const pop = showPopover(anchor, `<div class="pop-title">Format de la page</div>${Object.entries(FORMATS).map(([k, [l, w, h]]) => `<button class="menu-item dz-fmt" data-fmt="${k}"><i style="aspect-ratio:${w}/${h}"></i><span>${esc(l)}</span><small>${w} × ${h}</small></button>`).join('')}`, { width: 290, align: 'start' });
    if (!pop) return;
    pop.onclick = (e) => { const b = e.target.closest('[data-fmt]'); if (b) { hidePopover(); onPick(b.dataset.fmt); } };
  }

  // ================================================================== documents
  async docsMenu(anchor) {
    const list = await listDocs();
    const m = await this.cloudMod();
    let cloudOnly = [];
    if (m && m.designCloud.enabled()) {
      const rows = await m.designCloud.list().catch(() => []);
      const local = new Set(list.map((d) => d.id));
      cloudOnly = rows.filter((r) => !local.has(r.local_id));
      this.cloudRows = rows;
    }
    const pop = showPopover(anchor, `<div class="pop-title">Documents NEX-DESIGN</div>
      <div class="dz-docs">${list.map((d) => `<button class="dz-docrow${d.id === this.doc.id ? ' on' : ''}" data-doc="${esc(d.id)}"><span class="dz-doc-th">${d.thumb ? `<img src="${d.thumb}" alt="">` : icon('palette', 14)}</span><span><b>${esc(d.name)}</b><small>${d.pages} page${d.pages > 1 ? 's' : ''} · ${new Date(d.updated).toLocaleDateString('fr-FR')}</small></span></button>`).join('')}</div>
      ${cloudOnly.length ? `<div class="pop-sub">Dans le cloud de l’équipe</div><div class="dz-docs">${cloudOnly.map((d) => `<button class="dz-docrow" data-cdoc="${esc(d.id)}"><span class="dz-doc-th">${d.thumb ? `<img src="${d.thumb}" alt="">` : icon('cloud', 14)}</span><span><b>${esc(d.name)}</b><small>${d.pages_count} page${d.pages_count > 1 ? 's' : ''} · ${new Date(d.updated_at).toLocaleDateString('fr-FR')}</small></span></button>`).join('')}</div>` : ''}
      <div class="menu-sep"></div>
      <button class="menu-item" data-dact="new">${icon('plus', 14)}<span>Nouveau document…</span></button>
      ${m && m.designCloud.enabled() ? `<button class="menu-item" data-dact="share">${icon('link', 14)}<span>Copier un lien de partage (lecture seule)</span></button>` : ''}
      <button class="menu-item" data-dact="rename">${icon('text', 14)}<span>Renommer</span></button>
      <button class="menu-item" data-dact="dup">${icon('copy', 14)}<span>Dupliquer</span></button>
      <button class="menu-item" data-dact="open">${icon('folderOpen', 14)}<span>Ouvrir un fichier .nexd…</span></button>
      <button class="menu-item" data-dact="save">${icon('download', 14)}<span>Enregistrer en fichier .nexd…</span></button>
      <button class="menu-item" data-dact="del" ${list.length < 2 ? 'disabled' : ''}>${icon('trash', 14)}<span>Supprimer ce document</span></button>`, { width: 320, align: 'start' });
    if (!pop) return;
    pop.onclick = async (e) => {
      const cd = e.target.closest('[data-cdoc]');
      if (cd) { hidePopover(); await this.save(); await this.openCloudDoc(this.cloudRows.find((x) => x.id === cd.dataset.cdoc)); return; }
      const r = e.target.closest('[data-doc]');
      if (r) { hidePopover(); if (r.dataset.doc !== this.doc.id) { await this.save(); await this.openDoc(await getDoc(r.dataset.doc)); } return; }
      const b = e.target.closest('[data-dact]');
      if (!b || b.disabled) return;
      hidePopover();
      await this.docAction(b.dataset.dact, anchor);
    };
  }

  async docAction(a, anchor) {
    if (a === 'new') {
      this.formatMenu(anchor, async (k) => { await this.save(); const d = newDoc(`Design ${new Date().toLocaleDateString('fr-FR')}`, k); await putDoc(d); await this.openDoc(d); });
      return;
    }
    if (a === 'rename') {
      const lab = $('#dzDocName', this.el);
      lab.innerHTML = `<input class="input small" value="${esc(this.doc.name)}">`;
      const inp = lab.querySelector('input'); inp.focus(); inp.select();
      const done = () => { if (inp.value.trim()) this.doc.name = inp.value.trim(); lab.textContent = this.doc.name; this.save(); };
      inp.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') inp.blur(); if (ev.key === 'Escape') { inp.value = this.doc.name; inp.blur(); } });
      inp.addEventListener('click', (ev) => ev.stopPropagation());
      inp.addEventListener('blur', done);
      return;
    }
    if (a === 'dup') { await this.save(); const d = JSON.parse(JSON.stringify(this.doc)); d.id = uid(); d.name = `${d.name} (copie)`; await putDoc(d); await this.openDoc(d); }
    if (a === 'del') { const id = this.doc.id; this.doc = null; await deleteDoc(id); const m = await this.cloudMod(); if (m) await m.designCloud.remove(id).catch(() => {}); await this.openLastDoc(); }
    if (a === 'share') {
      const m = await this.cloudMod();
      await this.save();
      clearTimeout(this.cloudT);
      try {
        await m.designCloud.upload(this.doc);
        const token = await m.designCloud.share(this.doc.id);
        const base = window.__NEXORA_WEB__ ? `${location.origin}${location.pathname}` : (m.cloud.config.web_url || '');
        const link = base ? `${base}#/share/${token}` : token;
        await api.invoke('clipboard:write', link);
        toast(base ? 'Lien de partage copié : toute personne qui l’a peut voir ce design.' : `Code de partage copié : ${token}`);
      } catch (err) { toast(err.message, { kind: 'bad' }); }
    }
    if (a === 'save') {
      await this.save();
      const file = await saveBytes(exportNexd(this.doc), { kind: 'photo', project: 'NEX-DESIGN', name: this.doc.name, ext: 'nexd', saveAs: true });
      if (file) toast('Document enregistré.', { action: 'Afficher', onAction: () => api.invoke('shell:reveal', file) });
    }
    if (a === 'open') {
      const f = await api.invoke('dialog:open-file', { title: 'Ouvrir un document NEX-DESIGN', filters: [{ name: 'NEX-DESIGN', extensions: ['nexd'] }], asBytes: true });
      if (!f || !f.data) return;
      try { const d = importNexd(f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data)); await putDoc(d); await this.openDoc(d); } catch (err) { toast(err.message, { kind: 'bad' }); }
    }
  }

  // ================================================================== export
  exportSheet() {
    const ex = settings.designExport = {
      format: 'png', scale: '2', transparent: false, ...(settings.designExport || {}),
    };
    const sheet = openSheet('design-export', `
      <div class="sheet-head"><span class="sheet-icon">${icon('download', 22)}</span><div><h2>Exporter la page</h2><p>« ${esc(this.page.name)} » · ${this.page.w} × ${this.page.h} px</p></div></div>
      <div class="sheet-body">
        <div class="field-label">Format</div><div class="seg wide">${Object.entries({ png: 'PNG', jpg: 'JPG', webp: 'WebP', svg: 'SVG (vectoriel)', pdf: 'PDF' }).map(([k, l]) => `<button class="${ex.format === k ? 'on' : ''}" data-exf="${k}">${l}</button>`).join('')}</div>
        <div class="field-label">Taille</div><div class="seg wide">${['1', '2', '3', '4'].map((k) => `<button class="${ex.scale === k ? 'on' : ''}" data-exs="${k}">×${k}</button>`).join('')}</div>
        <label class="check-row" style="margin-top:12px"><input type="checkbox" data-ext ${ex.transparent ? 'checked' : ''}><span class="box"></span><span>Fond transparent (PNG, WebP, SVG)</span></label>
        ${this.doc.pages.length > 1 ? '<label class="check-row"><input type="checkbox" data-exall><span class="box"></span><span>Toutes les pages (un fichier par page ; un seul PDF de plusieurs pages)</span></label>' : ''}
        <p class="sheet-note" data-exdim></p>
      </div>
      <div class="sheet-foot"><span class="grow"></span><button class="btn" data-sheet="close">Annuler</button><button class="btn primary" data-exgo>${icon('download', 14)}<span>Exporter</span></button></div>`);
    const dim = () => { $('[data-exdim]', sheet).textContent = ex.format === 'svg' ? 'Vectoriel : net à toutes les tailles (les images et objets 3D restent des images).' : `${this.page.w * Number(ex.scale)} × ${this.page.h * Number(ex.scale)} pixels`; };
    dim();
    sheet.onclick = async (e) => {
      const f = e.target.closest('[data-exf]');
      if (f) { ex.format = f.dataset.exf; for (const x of f.parentElement.children) x.classList.toggle('on', x === f); dim(); persist(); return; }
      const s = e.target.closest('[data-exs]');
      if (s) { ex.scale = s.dataset.exs; for (const x of s.parentElement.children) x.classList.toggle('on', x === s); dim(); persist(); return; }
      if (e.target.closest('[data-exgo]')) {
        const all = $('[data-exall]', sheet) && $('[data-exall]', sheet).checked;
        closeSheet();
        await this.exportPages(ex, all);
      }
    };
    sheet.onchange = (e) => { if (e.target.matches('[data-ext]')) { ex.transparent = e.target.checked; persist(); } };
  }

  async exportPages(ex, all = false) {
    const idxs = all ? this.doc.pages.map((_, i) => i) : [this.pageIdx];
    const start = this.pageIdx;
    const busy = toast('Export en cours…', { busy: true, sticky: true });
    const files = [];
    try {
      this.canvas.discardActiveObject();
      if (ex.format === 'pdf' && idxs.length > 1) {
        const { PDFDocument } = await import('pdf-lib');
        const pdf = await PDFDocument.create();
        for (const i of idxs) {
          // eslint-disable-next-line no-await-in-loop
          if (i !== this.pageIdx) await this.openPage(i);
          // eslint-disable-next-line no-await-in-loop
          const el = await this.exportCanvas(Number(ex.scale), false);
          // eslint-disable-next-line no-await-in-loop
          const png = await pdf.embedPng(await (await new Promise((r) => el.toBlob(r, 'image/png'))).arrayBuffer());
          const pg = pdf.addPage([this.page.w * 0.75, this.page.h * 0.75]);
          pg.drawImage(png, { x: 0, y: 0, width: this.page.w * 0.75, height: this.page.h * 0.75 });
        }
        files.push(await saveBytes(await pdf.save(), { kind: 'photo', project: 'NEX-DESIGN', name: this.doc.name, ext: 'pdf' }));
      } else {
        for (const i of idxs) {
          // eslint-disable-next-line no-await-in-loop
          if (i !== this.pageIdx) await this.openPage(i);
          const name = `${this.doc.name} - ${this.page.name}`;
          if (ex.format === 'svg') {
            const svg = this.toSvg(ex.transparent);
            // eslint-disable-next-line no-await-in-loop
            files.push(await saveBytes(new TextEncoder().encode(svg), { kind: 'photo', project: 'NEX-DESIGN', name, ext: 'svg' }));
          } else {
            // eslint-disable-next-line no-await-in-loop
            const el = await this.exportCanvas(Number(ex.scale), ex.transparent && ex.format !== 'jpg' && ex.format !== 'pdf');
            // eslint-disable-next-line no-await-in-loop
            files.push(await saveCanvas(el, { format: ex.format, name, project: 'NEX-DESIGN', background: this.page.bg }));
          }
        }
      }
      if (this.pageIdx !== start) await this.openPage(start);
      busy.close();
      const ok = files.filter(Boolean);
      if (ok.length) { S.lastFile = ok[0]; toast(ok.length > 1 ? `${ok.length} fichiers exportés.` : 'Page exportée.', { action: 'Afficher', onAction: () => api.invoke('shell:reveal', ok[0]) }); }
      return ok;
    } catch (err) {
      busy.close();
      console.error(err);
      toast(`L’export a échoué : ${err.message || err}`, { kind: 'bad' });
      return [];
    }
  }

  // Les calques 3D sont recalculés à la définition de l'export avant le rendu.
  async exportCanvas(scale, transparent) {
    const z = this.canvas.getZoom();
    for (const o of this.canvas.getObjects()) {
      if (o.type !== 'layer3d') continue;
      const need = o.width * o.scaleX * scale;
      // eslint-disable-next-line no-await-in-loop
      if (o.width < need * 0.95) await refreshLayer(o, this.doc.assets, { scale: Math.min(4, scale) });
    }
    void z;
    return this.renderPage(scale, { transparent });
  }

  toSvg(transparent) {
    const p = this.page;
    const c = this.canvas;
    const vpt = c.viewportTransform.slice();
    c.setViewportTransform([1, 0, 0, 1, 0, 0]);
    let svg = c.toSVG({ viewBox: { x: 0, y: 0, width: p.w, height: p.h }, width: p.w, height: p.h, suppressPreamble: false });
    c.setViewportTransform(vpt);
    if (!transparent) svg = svg.replace(/(<svg[^>]*>)/, `$1<rect width="${p.w}" height="${p.h}" fill="${esc(p.bg || '#ffffff')}"/>`);
    return svg;
  }

  // ================================================================== menus
  zoomMenu(anchor) {
    const pop = showPopover(anchor, `<div class="pop-title">Zoom</div>
      ${[['fit', 'Tout voir', 'Maj+1'], ['100', '100 %', 'Maj+0'], ['200', '200 %', ''], ['50', '50 %', ''], ['in', 'Zoom avant', 'Ctrl+='], ['out', 'Zoom arrière', 'Ctrl+-']].map(([k, l, kb]) => `<button class="menu-item st-cm" data-zm="${k}"><span>${l}</span>${kb ? `<kbd>${kb}</kbd>` : ''}</button>`).join('')}
      <div class="menu-sep"></div>
      <label class="check-row" style="padding:4px 10px"><input type="checkbox" data-snap ${settings.designSnap !== false ? 'checked' : ''}><span class="box"></span><span>Magnétisme et repères</span></label>`, { width: 220 });
    if (!pop) return;
    pop.onclick = (e) => {
      const b = e.target.closest('[data-zm]');
      if (!b) return;
      hidePopover();
      const k = b.dataset.zm;
      if (k === 'fit') this.fit(); else if (k === 'in') this.zoomBy(1.25); else if (k === 'out') this.zoomBy(0.8); else this.zoomTo(Number(k) / 100);
    };
    pop.onchange = (e) => { if (e.target.matches('[data-snap]')) { settings.designSnap = e.target.checked; persist(); } };
  }

  contextMenu(opt) {
    const c = this.canvas;
    const t = opt.target && opt.target.id !== '__board' ? opt.target : null;
    if (t && !this.sel().includes(t)) c.setActiveObject(t);
    const list = this.sel();
    const anchor = document.createElement('div');
    Object.assign(anchor.style, { position: 'fixed', left: `${opt.e.clientX}px`, top: `${opt.e.clientY}px`, width: '1px', height: '1px' });
    document.body.append(anchor);
    const row = (k, ic, l, kb = '', dis = false) => `<button class="menu-item st-cm" data-cx="${k}" ${dis ? 'disabled' : ''}>${icon(ic, 15)}<span>${l}</span>${kb ? `<kbd>${kb}</kbd>` : ''}</button>`;
    const html = list.length ? `
      ${row('copy', 'copy', 'Copier', 'Ctrl+C')}${row('dup', 'copy', 'Dupliquer', 'Ctrl+D')}${row('paste', 'paste', 'Coller', 'Ctrl+V', !this.clip)}
      <div class="menu-sep"></div>
      ${row('front', 'layers', 'Premier plan', 'Ctrl+Maj+]')}${row('forward', 'chevronUp', 'Avancer', 'Ctrl+]')}${row('backward', 'chevronDown', 'Reculer', 'Ctrl+[')}${row('back', 'layers', 'Arrière-plan', 'Ctrl+Maj+[')}
      <div class="menu-sep"></div>
      ${list.length > 1 ? row('group', 'group', 'Grouper', 'Ctrl+G') : ''}${list.length === 1 && list[0].type === 'group' ? row('ungroup', 'group', 'Dégrouper', 'Ctrl+Maj+G') : ''}
      ${list.length === 2 ? row('mask', 'frame', 'Masquer avec la forme du dessus') : ''}${list.length === 1 && list[0].clipPath ? row('unmask', 'frame', 'Retirer le masque') : ''}
      ${list.length === 1 && list[0].type === 'layer3d' ? row('orbit', 'rotate3d', 'Faire pivoter en 3D', 'Double-clic') : ''}
      ${row('flipx', 'alignH', 'Retourner horizontalement', 'Maj+H')}${row('flipy', 'alignV', 'Retourner verticalement', 'Maj+V')}
      <div class="menu-sep"></div>
      ${row('lock', 'lock', 'Verrouiller')}${row('hide', 'eyeOff', 'Masquer', 'Ctrl+Maj+H')}${row('del', 'trash', 'Supprimer', 'Suppr')}`
      : `${row('paste', 'paste', 'Coller', 'Ctrl+V', !this.clip)}${row('all', 'grid', 'Tout sélectionner', 'Ctrl+A')}${row('fit', 'target', 'Tout voir', 'Maj+1')}${row('bg', 'palette', 'Couleur de fond de la page…')}`;
    const pop = showPopover(anchor, html, { width: 250, align: 'start', onClose: () => anchor.remove() });
    if (!pop) { anchor.remove(); return; }
    pop.onclick = async (e) => {
      const b = e.target.closest('[data-cx]');
      if (!b || b.disabled) return;
      hidePopover();
      await this.command(b.dataset.cx);
    };
  }

  async command(k) {
    const c = this.canvas;
    switch (k) {
      case 'copy': await this.copy(); break;
      case 'dup': await this.duplicate(); break;
      case 'paste': await this.paste(); break;
      case 'front': case 'back': case 'forward': case 'backward': this.arrange(k); break;
      case 'group': this.group(); break;
      case 'ungroup': this.ungroup(); break;
      case 'mask': await this.mask(); break;
      case 'unmask': this.unmask(); break;
      case 'orbit': this.setOrbit(c.getActiveObject()); break;
      case 'flipx': this.flip('x'); break;
      case 'flipy': this.flip('y'); break;
      case 'lock': for (const o of this.sel()) { o.locked = true; this.applyLock(o); } c.discardActiveObject(); this.changed(); break;
      case 'hide': for (const o of this.sel()) o.visible = false; c.discardActiveObject(); this.changed(); break;
      case 'del': this.remove(); break;
      case 'all': this.selectList(c.getObjects().filter((o) => o.id !== '__board' && !o.locked && o.visible !== false)); break;
      case 'fit': this.fit(); break;
      case 'bg': this.renderProps(); break;
      default: break;
    }
    c.requestRenderAll();
  }

  // Raccourcis Ctrl+… réservés par NEXORA, réutilisés ici.
  shortcut(a) {
    const o = this.canvas.getActiveObject();
    if (a === 'zoom-in') { this.zoomBy(1.25); return true; }
    if (a === 'zoom-out') { this.zoomBy(0.8); return true; }
    if (a === 'fit') { this.fit(); return true; }
    if (a === 'sidebar' && o && o.type === 'textbox') { o.set('fontWeight', Number(o.fontWeight) >= 700 ? 400 : 800); this.canvas.requestRenderAll(); this.changed(); return true; }
    if (a === 'inspector' && o && o.type === 'textbox') { o.set('fontStyle', o.fontStyle === 'italic' ? 'normal' : 'italic'); this.canvas.requestRenderAll(); this.changed(); return true; }
    return false;
  }

  // ================================================================== clavier et souris (interface)
  bindUi() {
    this.el.addEventListener('click', async (e) => {
      const tb = e.target.closest('[data-tool]');
      if (tb) { this.setTool(tb.dataset.tool); return; }
      const b = e.target.closest('[data-dz]');
      if (b) {
        const a = b.dataset.dz;
        if (a === 'undo') await this.undo();
        if (a === 'redo') await this.redo();
        if (a === 'zoom') this.zoomMenu(b);
        if (a === 'export') this.exportSheet();
        if (a === 'docs') await this.docsMenu(b);
      }
    });
    $('#dzLeft', this.el).addEventListener('click', (e) => this.onLeftClick(e));
    this.bindLayerDrag();
    this.$.stage.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
    this.$.stage.addEventListener('drop', (e) => this.onDrop(e));
    // Coller une image depuis le presse-papiers.
    document.addEventListener('paste', async (e) => {
      if (settings.mode !== 'design' || this.typing(e)) return;
      const items = [...(e.clipboardData ? e.clipboardData.items : [])];
      const img = items.find((i) => i.kind === 'file' && /^image\//.test(i.type));
      if (img) { e.preventDefault(); await this.addFile(img.getAsFile()); }
    });
    document.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('keyup', (e) => {
      if (e.key === ' ' && this.space) { this.space = false; this.canvas.setCursor(this.tool === 'hand' ? 'grab' : 'default'); this.canvas.defaultCursor = this.tool === 'hand' ? 'grab' : 'default'; }
    });
  }

  typing(e) {
    const t = e.target;
    const a = this.canvas && this.canvas.getActiveObject();
    return (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) || (a && a.isEditing);
  }

  async onKey(e) {
    if (settings.mode !== 'design' || !this.ready || this.typing(e) || !$('#sheetBackdrop').hidden) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (e.key === ' ' && !this.space) { this.space = true; this.canvas.defaultCursor = 'grab'; this.canvas.setCursor('grab'); e.preventDefault(); return; }
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) await this.redo(); else await this.undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); await this.redo(); return; }
    if (mod && k === 'c') { e.preventDefault(); await this.copy(); return; }
    if (mod && k === 'x') { e.preventDefault(); await this.copy(); this.remove(); return; }
    if (mod && k === 'v') { if (this.clip) { e.preventDefault(); await this.paste(); } return; }
    if (mod && k === 'd') { e.preventDefault(); await this.duplicate(); return; }
    if (mod && k === 'a') { e.preventDefault(); await this.command('all'); return; }
    if (mod && k === 'g') { e.preventDefault(); if (e.shiftKey) this.ungroup(); else this.group(); return; }
    if (mod && k === 'e') { e.preventDefault(); this.exportSheet(); return; }
    if (mod && (e.key === ']' || e.key === '}')) { e.preventDefault(); this.arrange(e.shiftKey ? 'front' : 'forward'); return; }
    if (mod && (e.key === '[' || e.key === '{')) { e.preventDefault(); this.arrange(e.shiftKey ? 'back' : 'backward'); return; }
    if (mod && e.shiftKey && k === 'h') { e.preventDefault(); await this.command('hide'); return; }
    if (mod) return;
    if (e.shiftKey && e.key === '!') { this.fit(); return; }
    if (e.shiftKey && (e.code === 'Digit1')) { e.preventDefault(); this.fit(); return; }
    if (e.shiftKey && (e.code === 'Digit0')) { e.preventDefault(); this.zoomTo(1); return; }
    if (e.shiftKey && k === 'h') { this.flip('x'); return; }
    if (e.shiftKey && k === 'v') { this.flip('y'); return; }
    if (e.key === 'Escape') {
      if (this.pen) { this.finishPen(false); return; }
      if (this.orbit) { this.setOrbit(null); return; }
      if (this.tool !== 'select') { this.setTool('select'); return; }
      this.canvas.discardActiveObject(); this.canvas.requestRenderAll(); return;
    }
    if (e.key === 'Enter' && this.pen) { this.finishPen(false); return; }
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); this.remove(); return; }
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowLeft') { e.preventDefault(); this.nudge(-step, 0); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); this.nudge(step, 0); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); this.nudge(0, -step); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); this.nudge(0, step); return; }
    const map = {
      v: 'select', h: 'hand', r: 'rect', o: 'ellipse', y: 'polygon', l: 'line', p: 'pen', b: 'pencil', t: 'text', i: 'image', 3: 'three',
    };
    if (map[k] && !e.shiftKey) { e.preventDefault(); this.setTool(map[k]); }
  }

  // Réordonner les calques en les glissant dans la liste.
  bindLayerDrag() {
    const left = this.$.left;
    let drag = null;
    left.addEventListener('dragstart', (e) => { const r = e.target.closest('[data-layer]'); if (!r) return; drag = r.dataset.layer; e.dataTransfer.effectAllowed = 'move'; r.classList.add('dragging'); });
    left.addEventListener('dragover', (e) => { if (!drag) return; e.preventDefault(); const r = e.target.closest('[data-layer]'); for (const x of left.querySelectorAll('.drop')) x.classList.remove('drop'); if (r) r.classList.add('drop'); });
    left.addEventListener('dragend', () => { drag = null; for (const x of left.querySelectorAll('.drop, .dragging')) x.classList.remove('drop', 'dragging'); });
    left.addEventListener('drop', (e) => {
      if (!drag) return;
      e.preventDefault();
      const r = e.target.closest('[data-layer]');
      const src = this.findById(drag);
      const dst = r && this.findById(r.dataset.layer);
      drag = null;
      if (!src || !dst || src === dst || src.group || dst.group) { this.renderLayers(); return; }
      const c = this.canvas;
      const objs = c.getObjects();
      // La liste est affichée du dessus vers le dessous : déposer sur un calque place au-dessus de lui.
      const to = objs.indexOf(dst);
      c.moveObjectTo(src, objs.indexOf(src) < to ? to : to + 1);
      if (this.board) c.sendObjectToBack(this.board);
      c.requestRenderAll();
      this.changed();
    });
  }

  docColors() {
    const set = new Set();
    for (const o of this.canvas.getObjects()) {
      for (const v of [o.fill, o.stroke]) if (typeof v === 'string' && v && v !== 'transparent') set.add(v.toLowerCase());
    }
    if (this.page) set.add((this.page.bg || '#ffffff').toLowerCase());
    return [...set].slice(0, 16);
  }
}

// ------------------------------------------------------------------ utilitaires
function boundsOf(list) {
  let l = Infinity; let t = Infinity; let r = -Infinity; let b = -Infinity;
  for (const o of list) { const x = o.getBoundingRect(); l = Math.min(l, x.left); t = Math.min(t, x.top); r = Math.max(r, x.left + x.width); b = Math.max(b, x.top + x.height); }
  return { left: l, top: t, width: r - l, height: b - t };
}

export function polyPoints(n) {
  return Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [Math.cos(a), Math.sin(a)]; });
}

export function starPoints(n, inner = 0.45) {
  return Array.from({ length: n * 2 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / n; const r = i % 2 ? inner : 1; return [Math.cos(a) * r, Math.sin(a) * r]; });
}

installProps(Design);
setFormatsRef(FORMATS);
Design.FONTS = FONTS;

export function openDesign(el) {
  if (!S.design) S.design = new Design(el);
  else S.design.resume();
  S.design.visible = true;
  return S.design;
}

export { Design };
void Triangle;
