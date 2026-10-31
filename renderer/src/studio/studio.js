/* Studio 3D : mise en scène des appareils, décors, animation par images clés, export image et vidéo. */
import { installEditor } from './editor.js';
import { resizable } from '../core/resize.js';
import * as T from './three.js';
import { api } from '../core/api.js';
import { S } from '../core/state.js';
import { settings, persist } from '../core/settings.js';
import {
  $, esc, uid, clamp, sleep, loadImage, fmtTime,
} from '../core/dom.js';
import { icon } from '../core/icons.js';
import {
  toast, showPopover, hidePopover, seg, openSheet, closeSheet,
} from '../core/ui.js';
import { CATEGORIES, DEVICES, getDevice, defaultColor } from '../devices/catalog.js';
import { DeviceModel, deviceInfo } from './models.js';
import {
  DecorModel, DECORS, FINISHES, DECOR_GROUPS, LIGHT_TYPES,
} from './decor.js';
import { TEXTURES, MAT_KEYS } from './materials.js';
import { MODIFIERS, hasModifiers } from './geom3d.js';
import { FONTS3D, ICON3D_CHOICES, preloadFont3d } from './shapes3d.js';
import { installManip } from './manip.js';
import { decodeMusic, attachMusicTrack } from './music.js';
import {
  TimelineUI, newAnimation, evaluate, upsertKey, fmtSec,
} from './timeline.js';
import {
  StudioScene, BACKGROUNDS, FLOORS, LIGHTS, ASPECTS, DEFAULT_ENV, AMBIANCES, FOGS,
} from './scene.js';
import { saveCanvas, saveBytes, FORMATS } from '../capture/export.js';
import { installVoice } from './voice.js';
import { installSpaces } from './spaces.js';
import { installMedia, TRANSITIONS, VECTOR_SHAPES } from './media.js';

const deg = T.MathUtils.degToRad;
const rad2deg = T.MathUtils.radToDeg;
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const IMG_SIZES = {
  view: "Taille de l'aperçu ×2", 1080: '1080 px (côté court)', 2160: '4K (2160 px)', 4320: '8K (4320 px)',
};
const VIDEO_SIZES = { 720: '720p', 1080: '1080p', 1440: '1440p', 2160: '4K' };
const POSES = {
  face: ['Face', [0, 0, 0]], q34l: ['Trois-quarts gauche', [0, 32, 0]], q34r: ['Trois-quarts droite', [0, -32, 0]], profil: ['Profil', [0, 82, 0]],
  dos: ['Dos', [0, 180, 0]], incline: ['Incliné', [-14, -22, 4]], plat: ['Posé à plat', [-90, 0, 0]], flottant: ['Flottant', [8, -24, -8]],
};
const VIEWS = {
  front: ['Face', [0, 0.32, 1]], q34: ['Trois-quarts', [0.75, 0.42, 0.95]], top: ['Dessus', [0, 1.6, 0.25]], low: ['Contre-plongée', [0.35, -0.05, 1]], side: ['Côté', [1, 0.3, 0.05]],
};

let opening = null;
export async function openStudio(el) {
  // Un seul Studio, même si l'espace est ouvert plusieurs fois pendant son démarrage (sinon chaque clic,
  // chaque raccourci et chaque fenêtre seraient traités deux fois).
  if (!S.studio && opening) { await opening; }
  if (!S.studio) {
    const st = new Studio(el);
    let done;
    opening = new Promise((r) => { done = r; });
    try {
      await st.init();
    } catch (err) {
      opening = null; done();
      console.error(err);
      el.innerHTML = `<div class="st-error"><span class="sheet-icon warn">${icon('warn', 22)}</span><h2>Le Studio 3D ne peut pas démarrer</h2><p>La carte graphique de ce PC ne permet pas l'affichage 3D (WebGL 2), ou son pilote est trop ancien. Mets à jour le pilote graphique (Intel, AMD ou NVIDIA) puis relance NEXORA.</p><p class="muted">${esc(err && err.message ? err.message : String(err))}</p></div>`;
      return null;
    }
    S.studio = st;
    opening = null;
    done();
  }
  S.studio.resume();
  return S.studio;
}

class Studio {
  constructor(el) {
    this.el = el;
    this.objects = new Map();
    this.order = [];
    this.sel = null;
    this.selectedKey = null;
    this.time = 0;
    this.playing = false;
    this.pages = new Map();
    this.images = new Map();
    this.gltfs = new Map();
    this.history = [];
    this.future = [];
    this.dirty = true;
    this.visible = false;
    this.ready = false;
    this.exporting = false;
  }

  // ================================================================== interface
  async init() {
    const el = this.el;
    el.innerHTML = `
      <div class="st">
        <aside class="st-side st-left">
          <div class="st-head">Scène</div>
          <div class="st-add">
            <button class="btn small" data-st="add-device">${icon('phone', 14)}<span>Appareil</span></button>
            <button class="btn small" data-st="add-decor" aria-haspopup="true">${icon('cube', 14)}<span>Décor</span></button>
            <button class="btn small" data-st="add-text" aria-haspopup="true">${icon('text', 14)}<span>Texte</span></button>
            <button class="btn small" data-st="add-vector" aria-haspopup="true">${icon('shapes', 14)}<span>Forme 2D</span></button>
            <button class="btn small" data-st="add-light" aria-haspopup="true">${icon('bulb', 14)}<span>Lumière</span></button>
            <button class="btn small" data-st="import" aria-haspopup="true">${icon('upload', 14)}<span>Importer</span></button>
          </div>
          <div class="st-list" id="stList"></div>
          <div class="st-head">Mises en scène</div>
          <div class="st-presets" id="stPresets"></div>
        </aside>
        <div class="st-main">
          <div class="st-view" id="stView">
            <div class="st-frame" id="stFrame"><canvas id="stCanvas"></canvas></div>
            <div class="st-toolbar glass">
              <div class="seg" id="stTools">
                <button data-tool="translate" class="on" title="Déplacer (W)">${icon('move', 15)}</button>
                <button data-tool="rotate" title="Pivoter (E)">${icon('rotate3d', 15)}</button>
                <button data-tool="scale" title="Taille (R)">${icon('scale', 15)}</button>
              </div>
              <button class="dock-btn small" data-st="space" title="Axes de la scène (cliquer pour les axes de l’objet)">${icon('globe', 16)}</button>
              <button class="dock-btn small" data-st="snap" title="Magnétisme" aria-haspopup="true">${icon('magnet', 16)}</button>
              <span class="dock-sep"></span>
              <button class="dock-btn small" data-st="views" title="Points de vue" aria-haspopup="true">${icon('eye', 16)}</button>
              <button class="dock-btn small" data-st="frame" title="Cadrer la scène (F) · la sélection (.)">${icon('target', 16)}</button>
              <button class="dock-btn small" data-st="undo" title="Annuler (Ctrl+Z)">${icon('back', 16)}</button>
              <button class="dock-btn small" data-st="redo" title="Rétablir (Ctrl+Maj+Z)">${icon('forward', 16)}</button>
              <span class="dock-sep"></span>
              <button class="dock-btn small" data-st="photo" title="Exporter une image">${icon('camera', 16)}</button>
              <button class="dock-btn small" data-st="video" title="Exporter une vidéo">${icon('film', 16)}</button>
            </div>
            <div class="st-busy" id="stBusy" hidden></div>
          </div>
          <div class="st-timeline" id="stTimeline"></div>
        </div>
        <aside class="st-side st-right" id="stProps"></aside>
      </div>`;
    this.$ = {
      list: $('#stList', el), presets: $('#stPresets', el), view: $('#stView', el), frame: $('#stFrame', el), canvas: $('#stCanvas', el), props: $('#stProps', el), busy: $('#stBusy', el), tools: $('#stTools', el),
    };
    this.three = new StudioScene(this.$.canvas);
    const { camera, renderer } = this.three;
    this.controls = new T.OrbitControls(camera, this.$.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 9, 0);
    this.controls.minDistance = 4;
    this.controls.maxDistance = 900;
    this.controls.addEventListener('change', () => { this.dirty = true; });
    this.controls.addEventListener('end', () => this.saveSoon());
    this.gizmo = new T.TransformControls(camera, this.$.canvas);
    this.gizmo.setSize(0.85);
    this.three.scene.add(this.gizmo.getHelper());
    this.gizmo.addEventListener('dragging-changed', (e) => {
      this.controls.enabled = !e.value;
      if (!e.value) this.commit();
    });
    this.gizmo.addEventListener('objectChange', () => this.onGizmoChange());
    this.initManip();
    this.gizmo.addEventListener('change', () => { this.dirty = true; });
    void renderer;

    this.timeline = new TimelineUI($('#stTimeline', el), this);
    this.bindUi();
    this.bindListDrag();
    new ResizeObserver(() => this.resize()).observe(this.$.view);
    resizable($('.st-left', el), { key: 'studioLeft', edge: 'right', min: 200, max: 420 });
    resizable(this.$.props, { key: 'studioRight', edge: 'left', min: 250, max: 520 });
    resizable($('#stTimeline', el), { key: 'studioTimeline', edge: 'top', min: 110, max: () => Math.max(160, window.innerHeight * 0.5) });

    // Scène enregistrée, sinon les appareils de l'aperçu.
    const saved = settings.studio;
    if (saved && Array.isArray(saved.objects) && saved.objects.length) await this.load(saved, { fromSettings: true });
    else await this.importBoard({ initial: true });
    this.pushHistory();
    this.renderPresets();
    await this.initSpaces();
    this.initEditor();
    this.renderCamNav();
    this.ready = true;
    this.loop();
  }

  resume() {
    this.visible = true;
    this.dirty = true;
    this.resize();
    if (!this.raf) this.loop();
  }

  pause() {
    this.visible = false;
    if (this.playing) this.togglePlay();
    this.pauseMedia();
  }

  resize() {
    const r = this.$.view.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    const env = this.three.env;
    let w = r.width;
    let h = r.height;
    const a = env.aspect && env.aspect !== 'free' ? env.aspect.split(':').map(Number) : null;
    if (a) {
      const ar = a[0] / a[1];
      if (w / h > ar) w = h * ar; else h = w / ar;
      w = Math.floor(w - 24);
      h = Math.floor(h - 24 * (h / w));
    }
    this.$.frame.style.width = `${Math.floor(w)}px`;
    this.$.frame.style.height = `${Math.floor(h)}px`;
    this.$.frame.classList.toggle('framed', Boolean(a));
    this.$.frame.classList.toggle('transparent', env.bg === 'transparent');
    this.three.setSize(Math.floor(w), Math.floor(h));
    this.dirty = true;
  }

  loop() {
    this.raf = requestAnimationFrame((now) => {
      this.raf = null;
      if (!this.visible || this.exporting) return;
      const dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 0;
      this.lastNow = now;
      if (this.playing) {
        this.time += dt;
        if (this.time > this.anim.duration) this.time = 0;
        this.applyTime();
        this.timeline.updateHead();
      }
      const moved = this.controls.update();
      if ((moved || this.dirty || this.playing) && this.space !== 'mockup') {
        this.dirty = false;
        this.three.render();
        if (this.afterViewRender) this.afterViewRender(dt);
        this.drawOverlay();
      }
      this.loop();
    });
  }

  bindUi() {
    const el = this.el;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-st]');
      if (!b) return;
      const a = b.dataset.st;
      if (a === 'add-device') this.pickDevice((id) => this.addDevice({ deviceId: id }));
      if (a === 'add-decor') this.decorMenu(b);
      if (a === 'add-text') this.textMenu(b);
      if (a === 'add-vector') this.vectorMenu(b);
      if (a === 'add-light') this.lightMenu(b);
      if (a === 'snap') this.snapMenu(b);
      if (a === 'space') this.toggleSpace();
      if (a === 'import') this.importMenu(b);
      if (a === 'views') this.viewsMenu(b);
      if (a === 'frame') this.frameAll(true);
      if (a === 'undo') this.undo();
      if (a === 'redo') this.redo();
      if (a === 'photo') this.photoSheet();
      if (a === 'video') this.videoSheet();
    });
    this.$.tools.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tool]');
      if (b) this.setTool(b.dataset.tool);
    });
    this.$.list.addEventListener('click', (e) => {
      const r = e.target.closest('[data-obj]');
      if (!r) return;
      const id = r.dataset.obj;
      if (e.target.closest('[data-vis]')) { this.toggleVisible(id); return; }
      if (e.target.closest('[data-lock]')) { this.toggleLock(id); return; }
      if (e.target.closest('[data-del]')) { this.remove(id); return; }
      if (e.shiftKey || e.ctrlKey || e.metaKey) { this.toggleInSelection(id); return; }
      this.select(id);
    });
    this.$.list.addEventListener('dblclick', (e) => {
      const r = e.target.closest('[data-obj]');
      if (r && !e.target.closest('button')) this.renameRow(r);
    });
    this.$.presets.addEventListener('click', (e) => {
      const b = e.target.closest('[data-scene]');
      if (b) this.scenePreset(b.dataset.scene);
    });
    // Sélection par clic dans la vue (sans glisser).
    let down = null;
    this.$.canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    this.$.canvas.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || this.gizmo.dragging) return;
      this.pick(e);
    });
    this.$.canvas.addEventListener('dblclick', () => { if (this.sel) this.focusSelection(); });
    // Espace Maquettes : ses réglages ont leur propre logique (capturée avant celle de la scène 3D).
    for (const ev of ['input', 'change', 'click']) this.$.props.addEventListener(ev, (e) => { if (this.space === 'mockup' && this.mockup) { e.stopImmediatePropagation(); this.mockup.onPropsEvent(e); } }, true);
    this.$.props.addEventListener('input', (e) => this.onPropInput(e, false));
    this.$.props.addEventListener('change', (e) => this.onPropInput(e, true));
    this.$.props.addEventListener('click', (e) => this.onPropClick(e));
    document.addEventListener('keydown', (e) => {
      if (!this.visible || settings.mode !== 'studio') return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (this.space === 'mockup' && this.mockup) { this.mockup.onKey(e); return; }
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); this.redo(); return; }
      if (mod && k === 'd') { e.preventDefault(); this.duplicateSelection(); return; }
      if (mod && k === 'c') { e.preventDefault(); this.copySelection(); return; }
      if (mod && k === 'v') { e.preventDefault(); this.paste(); return; }
      if (mod && k === 'a') { e.preventDefault(); this.selectAll(); return; }
      if (mod && k === 'g') { e.preventDefault(); if (e.shiftKey) this.ungroupSelection(); else this.groupSelection(); return; }
      if (mod && k === 'l') { e.preventDefault(); for (const id of this.selection()) this.toggleLock(id); return; }
      if (mod) return;
      if (this.nudge(e)) { e.preventDefault(); return; }
      if (k === 'w') this.setTool('translate');
      else if (k === 'e') this.setTool('rotate');
      else if (k === 'r') this.setTool('scale');
      else if (k === 'f') this.frameAll(true);
      else if (k === '.' || k === 'decimal') this.focusSelection();
      else if (k === 'q') this.toggleSpace();
      else if (k === 'p') this.dropToSupport();
      else if (k === 'h' && this.sel && this.sel !== 'camera') this.toggleVisible(this.sel);
      else if (k === 'k') this.addKey();
      else if (k === ' ') { e.preventDefault(); this.togglePlay(); }
      else if (k === 'home') this.toStart();
      else if ((k === 'pagedown' || k === 'pageup') && this.space === 'deck') {
        // Diapositive suivante / précédente.
        e.preventDefault();
        const d = this.deckState();
        const j = Math.max(0, Math.min(d.slides.length - 1, (this.deckCur ?? 0) + (k === 'pagedown' ? 1 : -1)));
        if (j !== this.deckCur) this.openSlide(j);
      }
      else if (k === 'delete' || k === 'backspace') { if (this.selectedKey) this.deleteSelectedKey(); else if (this.selection().length > 1) this.removeSelection(); else if (this.sel && this.sel !== 'camera' && !(this.objects.get(this.sel) || { item: {} }).item.locked) this.remove(this.sel); }
      else if (k === 'escape') this.select(null);
    });
    // Maj enfoncée pendant une manipulation : magnétisme inversé.
    const flipSnap = (on) => {
      if (!this.visible || !this.gizmo.dragging) return;
      const s = this.snap;
      const active = on ? !s.on : s.on;
      this.gizmo.setTranslationSnap(active ? s.move : null);
      this.gizmo.setRotationSnap(active ? T.MathUtils.degToRad(s.rot) : null);
      this.gizmo.setScaleSnap(active ? s.scale : null);
    };
    document.addEventListener('keydown', (e) => { if (e.key === 'Shift') flipSnap(true); });
    document.addEventListener('keyup', (e) => { if (e.key === 'Shift') { flipSnap(false); if (this.snap) this.applySnap(); } });
  }

  setTool(mode) {
    this.gizmo.setMode(mode);
    for (const b of this.$.tools.children) b.classList.toggle('on', b.dataset.tool === mode);
  }

  // ================================================================== objets
  get anim() { return this._anim || (this._anim = newAnimation()); }
  set anim(a) { this._anim = a; }

  nameFor(item) {
    if (item.name) return item.name;
    if (item.kind === 'texte3d') return `Texte 3D « ${String(item.text || '').split('\n')[0].slice(0, 16)} »`;
    if (item.kind === 'lumiere') return (LIGHT_TYPES[item.lightType || 'point'] || ['Lumière'])[0];
    if (item.kind === 'icone3d') return `Icône 3D (${item.icon || 'star'})`;
    if (item.type === 'device') return getDevice(item.deviceId, settings.custom).name.split(' / ')[0];
    if (item.kind === 'texte') return `Texte « ${String(item.text || '').split('\n')[0].slice(0, 18)} »`;
    if (item.kind === 'vecteur') return (VECTOR_SHAPES[item.shape || 'round'] || ['Forme 2D'])[0];
    if (item.kind === 'video') return `Vidéo ${item.mediaName ? `« ${String(item.mediaName).slice(0, 18)} »` : ''}`.trim();
    return (DECORS[item.kind] || { label: 'Objet' }).label;
  }

  async addDevice(spec, { select = true, place = true, history = true } = {}) {
    const dev = getDevice(spec.deviceId, settings.custom);
    const info = deviceInfo(spec.deviceId, settings.custom);
    const item = {
      id: spec.id || uid(), type: 'device', deviceId: dev.id, state: spec.state ?? null, land: Boolean(spec.land), color: spec.color || null,
      fold: spec.fold ?? (info.foldable && spec.state && spec.state === info.coverState ? 180 : 0), lid: spec.lid ?? 108, scroll: spec.scroll || 0, coverScroll: spec.coverScroll || 0,
      main: spec.main || { src: 'wallpaper' }, cover: spec.cover || { src: 'wallpaper' },
      pos: spec.pos || [0, 0, 0], rot: spec.rot || [0, 0, 0], scale: spec.scale || 1, hidden: Boolean(spec.hidden),
    };
    this.build(item);
    if (place && !spec.pos) this.placeNext(item.id);
    if (select) this.select(item.id);
    this.renderList();
    if (history) this.commit();
    return item;
  }

  addDecor(spec, { select = true, history = true } = {}) {
    const item = {
      ...spec,
      id: spec.id || uid(), type: 'decor', kind: spec.kind, color: spec.color || (spec.kind === 'mur' ? '#e9ebf0' : spec.kind === 'lumiere' ? '#ffffff' : '#f3f3f6'), finish: spec.finish || 'satin',
      pos: spec.pos || [0, 0, 0], rot: spec.rot || [0, 0, 0], scale: spec.scale || 1, hidden: Boolean(spec.hidden),
    };
    delete item.imageEl;
    delete item.texImageEl;
    delete item.videoEl;
    delete item.seqFrames;
    if (item.kind === 'lumiere' && !spec.pos) {
      // La lumière se place au-dessus et devant la scène, tournée vers son centre.
      const b = this.contentBox();
      const c = b.isEmpty() ? new T.Vector3(0, 8, 0) : b.getCenter(new T.Vector3());
      const s = b.isEmpty() ? 20 : Math.max(10, b.getSize(new T.Vector3()).length() * 0.5);
      const side = (this.order.filter((x) => this.objects.get(x).item.kind === 'lumiere').length % 2 ? -1 : 1);
      const p = item.lightType === 'hemi' ? new T.Vector3(c.x, c.y + s * 1.4, c.z) : new T.Vector3(c.x + side * s * 0.9, c.y + s * 0.9, c.z + s * 0.9);
      const o = new T.Object3D(); o.position.copy(p); o.lookAt(c);
      item.pos = p.toArray().map((v) => round(v, 2));
      item.rot = [rad2deg(o.rotation.x), rad2deg(o.rotation.y), rad2deg(o.rotation.z)].map((v) => round(v, 2));
    }
    if (!spec.pos && ['sphere', 'cube', 'tore', 'noeud', 'gemme', 'diamant', 'blob', 'etoile', 'coeur', 'icone3d', 'cone', 'pyramide', 'cylindre', 'demisphere', 'prisme', 'nuage', 'spirale', 'fleche', 'bulle', 'pilule', 'capsule'].includes(item.kind)) {
      // Les formes se posent à côté de la scène existante plutôt qu'au milieu des appareils.
      const b = this.contentBox();
      if (!b.isEmpty()) item.pos = [round(b.max.x + 8, 1), 0, round((b.min.z + b.max.z) / 2 + 4, 1)];
    }
    if (item.kind === 'texte3d' && !spec.pos) {
      const b = this.contentBox();
      item.pos = [b.isEmpty() ? 0 : round((b.min.x + b.max.x) / 2, 2), b.isEmpty() ? 0 : round(b.max.y + 2, 2), b.isEmpty() ? 0 : round(b.min.z - 2, 2)];
    }
    if (item.kind === 'texte' && !spec.pos) {
      const b = this.contentBox();
      item.pos = [b.isEmpty() ? 0 : (b.min.x + b.max.x) / 2, b.isEmpty() ? 22 : b.max.y + 3, 0];
    }
    if ((item.kind === 'podium' || item.kind === 'podium2' || item.kind === 'socle') && !spec.pos) {
      const devs = this.order.filter((i) => this.objects.get(i).item.type === 'device');
      if (devs.length) {
        const b = this.contentBox();
        item.pos = [(b.min.x + b.max.x) / 2, 0, 0];
        const lift = item.kind === 'podium' ? 2.6 : item.kind === 'podium2' ? 4.4 : 7;
        for (const id of devs) { const o = this.objects.get(id); o.item.pos[1] = Math.max(o.item.pos[1], lift); this.applyItemTransform(o); }
      }
    }
    this.build(item);
    if (select) this.select(item.id);
    this.renderList();
    if (history) this.commit();
    return item;
  }

  pageFor(item, kind) {
    const src = item[kind];
    if (!src || src.src === 'wallpaper') return null;
    if (src.src === 'image') return this.images.get(src.imageId) || null;
    return this.pages.get(`${item.id}:${kind}`) || null;
  }

  build(item) {
    const prev = this.objects.get(item.id);
    if (prev && prev.model) prev.model.dispose();
    let model;
    if (item.type === 'device') {
      model = new DeviceModel({
        deviceId: item.deviceId, state: item.state, land: item.land, color: item.color, fold: item.fold, lid: item.lid,
        main: this.pageFor(item, 'main'), cover: this.pageFor(item, 'cover'),
      }, { renderer: this.three.renderer, custom: settings.custom });
      model.setScroll(item.scroll || 0, 'main');
      model.setScroll(item.coverScroll || 0, 'cover');
      // L'appareil repose au sol : on décale le modèle pour que son point le plus bas soit à y = 0.
      const box = model.updateBounds();
      model.mm.position.y -= box.isEmpty() ? 0 : box.min.y;
    } else {
      if (item.kind === 'image') item.imageEl = this.images.get(item.imageId) ? this.images.get(item.imageId).img : null;
      if (item.kind === 'video' || item.kind === 'sequence') {
        const m = this.mediaStore().get(item.mediaId);
        item.videoEl = m && m.kind === 'video' ? m.el : null;
        item.seqFrames = m && m.kind === 'seq' ? m.frames : null;
        if (m) item.aspect = m.aspect;
      }
      const texImg = item.tex && item.tex.kind === 'image' ? this.images.get(item.tex.imageId) : null;
      item.texImageEl = texImg ? texImg.img : null;
      model = new DecorModel(item, {
        renderer: this.three.renderer,
        gltf: item.glbId ? this.gltfs.get(item.glbId) : null,
        onChange: () => { this.three.fitShadow(); this.attachGizmo(); this.dirty = true; },
      });
    }
    model.root.userData.objId = item.id;
    this.three.content.add(model.root);
    const obj = { id: item.id, item, model };
    this.objects.set(item.id, obj);
    if (!this.order.includes(item.id)) this.order.push(item.id);
    this.applyItemTransform(obj);
    model.root.visible = !item.hidden;
    if (this.sel === item.id || (this.multi && this.multi.has(item.id))) this.attachGizmo();
    this.three.fitShadow();
    this.dirty = true;
    return obj;
  }

  applyItemTransform(obj) {
    const { item, model } = obj;
    model.root.position.fromArray(item.pos);
    model.root.rotation.set(deg(item.rot[0]), deg(item.rot[1]), deg(item.rot[2]));
    model.root.scale.setScalar(item.scale || 1);
    this.dirty = true;
  }

  // Place un nouvel appareil à droite des autres.
  placeNext(id) {
    const obj = this.objects.get(id);
    const others = this.order.filter((i) => i !== id && this.objects.get(i).item.type === 'device' && !this.objects.get(i).item.hidden);
    if (!others.length) { obj.item.pos = [0, 0, 0]; this.applyItemTransform(obj); return; }
    const box = new T.Box3();
    for (const o of others) box.expandByObject(this.objects.get(o).model.root);
    const own = new T.Box3().setFromObject(obj.model.root);
    const w = own.max.x - own.min.x;
    const gap = Math.max(3, w * 0.25);
    obj.item.pos = [box.max.x + gap + w / 2 - (own.min.x + own.max.x) / 2 + obj.item.pos[0], 0, 0];
    this.applyItemTransform(obj);
    // Recentre l'ensemble.
    const all = this.contentBox();
    const cx = (all.min.x + all.max.x) / 2;
    for (const o of this.order) {
      const oo = this.objects.get(o);
      if (oo.item.type !== 'device') continue;
      oo.item.pos[0] -= cx;
      this.applyItemTransform(oo);
    }
  }

  contentBox() {
    const box = new T.Box3();
    for (const id of this.order) {
      const o = this.objects.get(id);
      if (o.item.hidden || (o.item.type === 'decor' && (o.item.kind === 'mur' || o.item.kind === 'lumiere' || o.item.kind === 'plan'))) continue;
      box.union(this.boxOf(id));
    }
    return box;
  }

  remove(id, { history = true } = {}) {
    const o = this.objects.get(id);
    if (!o) return;
    if (this.multi && this.multi.has(id)) { this.multi.delete(id); if (this.multi.size < 2) this.multi.clear(); }
    if (this.sel === id) this.select(null);
    o.model.dispose();
    this.objects.delete(id);
    this.order = this.order.filter((x) => x !== id);
    delete this.anim.tracks[id];
    this.renderList();
    this.timeline.render();
    this.dirty = true;
    if (history) this.commit();
  }

  async duplicate(id) {
    const o = this.objects.get(id);
    if (!o) return;
    const copy = JSON.parse(JSON.stringify({ ...o.item, imageEl: undefined, texImageEl: undefined }));
    if (copy.name) copy.name = `${copy.name} (copie)`;
    copy.id = uid();
    copy.pos = [o.item.pos[0] + 6, o.item.pos[1], o.item.pos[2] + 2];
    for (const k of ['main', 'cover']) { const p = this.pages.get(`${id}:${k}`); if (p) this.pages.set(`${copy.id}:${k}`, p); }
    if (copy.type === 'device') await this.addDevice(copy, { place: false });
    else this.addDecor(copy);
  }

  toggleVisible(id) {
    const o = this.objects.get(id);
    o.item.hidden = !o.item.hidden;
    o.model.root.visible = !o.item.hidden;
    if (o.item.hidden && this.sel === id) this.select(null);
    this.renderList();
    this.dirty = true;
    this.commit();
  }

  select(id) {
    this.sel = id && (this.objects.has(id) || id === 'camera') ? id : null;
    this.selectedKey = null;
    if (this.multi) this.multi.clear();
    this.attachGizmo();
    this.renderList();
    this.renderProps();
    this.timeline.render();
    this.dirty = true;
  }

  pick(e) {
    const r = this.$.canvas.getBoundingClientRect();
    const p = new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new T.Raycaster();
    ray.setFromCamera(p, this.three.camera);
    const hits = ray.intersectObjects(this.three.content.children, true);
    for (const h of hits) {
      let n = h.object;
      while (n && !n.userData.objId) n = n.parent;
      if (n) {
        const o = this.objects.get(n.userData.objId);
        if (!o || o.item.locked) continue;
        if (o.item.kind === 'mur' && hits.length > 1 && hits.some((x) => x !== h)) continue;
        if (h.object.userData.editorOnly && o.item.kind !== 'lumiere') continue;
        const id = n.userData.objId;
        if (e.shiftKey || e.ctrlKey || e.metaKey) { for (const g of e.altKey ? [id] : this.groupMembers(id)) this.toggleInSelection(g); return; }
        const members = e.altKey ? [id] : this.groupMembers(id);
        if (members.length > 1) this.selectMany(members, id); else this.select(id);
        return;
      }
    }
    if (!(e.shiftKey || e.ctrlKey)) this.select(null);
  }

  // ================================================================== états, clés, lecture
  getState(id) {
    if (id === 'camera') {
      const c = this.three.camera;
      return { cpos: c.position.toArray().map((v) => round(v, 3)), ctarget: this.controls.target.toArray().map((v) => round(v, 3)), fov: round(c.fov, 2) };
    }
    const o = this.objects.get(id);
    if (!o) return { pos: [0, 0, 0], rot: [0, 0, 0], scale: 1 };
    const r = o.model.root;
    const st = {
      pos: r.position.toArray().map((v) => round(v, 3)), rot: [rad2deg(r.rotation.x), rad2deg(r.rotation.y), rad2deg(r.rotation.z)].map((v) => round(v, 2)), scale: round(r.scale.x, 4),
    };
    if (o.item.type === 'device') {
      const info = deviceInfo(o.item.deviceId, settings.custom);
      if (info.foldable) st.fold = o.item.fold;
      if (info.laptop) st.lid = o.item.lid;
      st.scroll = o.item.scroll || 0;
      if (info.hasCover) st.coverScroll = o.item.coverScroll || 0;
    }
    return st;
  }

  applyState(id, v) {
    if (!v) return;
    if (id === 'camera') {
      if (v.cpos) this.three.camera.position.fromArray(v.cpos);
      if (v.ctarget) this.controls.target.fromArray(v.ctarget);
      if (v.fov) { this.three.camera.fov = v.fov; this.three.camera.updateProjectionMatrix(); }
      this.three.camera.lookAt(this.controls.target);
      return;
    }
    const o = this.objects.get(id);
    if (!o) return;
    const r = o.model.root;
    if (v.pos) r.position.fromArray(v.pos);
    if (v.rot) r.rotation.set(deg(v.rot[0]), deg(v.rot[1]), deg(v.rot[2]));
    if (v.scale != null) r.scale.setScalar(v.scale);
    if (o.item.type === 'device') {
      if (v.fold != null) { o.item.fold = v.fold; o.model.setFold(v.fold); }
      if (v.lid != null) { o.item.lid = v.lid; o.model.setLid(v.lid); }
      if (v.scroll != null) { o.item.scroll = v.scroll; o.model.setScroll(v.scroll, 'main'); }
      if (v.coverScroll != null) { o.item.coverScroll = v.coverScroll; o.model.setScroll(v.coverScroll, 'cover'); }
    }
  }

  applyTime() {
    for (const id of Object.keys(this.anim.tracks)) this.applyState(id, evaluate(this.anim, id, this.time));
    this.applyClips();
    this.dirty = true;
  }

  setTime(t) {
    this.time = clamp(t, 0, this.anim.duration);
    this.applyTime();
    this.timeline.updateHead();
    if (this.sel) this.renderPropsValues();
  }

  togglePlay() {
    this.playing = !this.playing;
    this.lastNow = null;
    this.gizmo.enabled = !this.playing;
    this.controls.enabled = !this.playing;
    this.attachGizmo();
    if (this.playing && this.time >= this.anim.duration - 1e-3) this.time = 0;
    if (!this.playing) { this.pauseMedia(); this.applyClips(); }
    this.timeline.render();
    if (!this.raf) this.loop();
  }

  toStart() { this.setTime(0); }

  rows() {
    const rows = this.order.map((id) => {
      const it = this.objects.get(id).item;
      return {
        id, name: this.nameFor(it), icon: it.type === 'device' ? 'phone' : (DECORS[it.kind] || {}).icon || 'cube', media: it.kind === 'video' || it.kind === 'sequence',
      };
    });
    rows.push({ id: 'camera', name: 'Caméra', icon: 'video' });
    return rows;
  }

  get selectedId() { return this.sel; }

  // Plans du montage, pour la frise.
  clipOf(id) { const o = this.objects.get(id); return o && o.item.clip ? o.item.clip : null; }

  onClipDrag() { this.applyTime(); }

  onClipChanged(id) { this.applyTime(); if (id === this.sel) this.renderProps(); this.commit(); }

  addKey(id = this.sel || 'camera') {
    if (id !== 'camera' && !this.objects.has(id)) return;
    upsertKey(this.anim, id, this.time, this.getState(id));
    this.timeline.render();
    this.commit();
    toast(`Clé enregistrée à ${fmtSec(this.time)} pour ${id === 'camera' ? 'la caméra' : this.nameFor(this.objects.get(id).item)}`);
  }

  addKeyQuiet(id) { if (id === 'camera' || this.objects.has(id)) upsertKey(this.anim, id, this.time, this.getState(id)); }

  onKeySelect(id, key) {
    this.selectedKey = key;
    if (id !== this.sel) { this.sel = id; const o = this.objects.get(id); if (o) this.gizmo.attach(o.model.root); else this.gizmo.detach(); this.renderList(); this.renderProps(); }
    this.timeline.render();
  }

  onRowSelect(id) { this.select(id); }

  deleteSelectedKey() {
    const k = this.selectedKey;
    if (!k) return;
    for (const [id, keys] of Object.entries(this.anim.tracks)) {
      const i = keys.indexOf(k);
      if (i >= 0) { keys.splice(i, 1); if (!keys.length) delete this.anim.tracks[id]; }
    }
    this.selectedKey = null;
    this.onKeysChanged();
  }

  onKeysChanged() { this.applyTime(); this.timeline.render(); this.commit(); }

  setDuration(s) {
    const old = this.anim.duration;
    this.anim.duration = s;
    // Les clés gardent leur place relative.
    for (const keys of Object.values(this.anim.tracks)) for (const k of keys) k.t = round((k.t / old) * s, 4);
    this.time = Math.min(this.time, s);
    this.timeline.render();
    this.commit();
  }

  setFps(n) { this.anim.fps = n; this.timeline.render(); this.commit(); }

  clearAnimation() {
    if (!Object.keys(this.anim.tracks).length) return;
    this.anim.tracks = {};
    this.timeline.render();
    this.commit();
    toast("L'animation a été effacée. Les objets gardent leur position actuelle.");
  }

  // Modification d'un objet : met à jour l'état de base et, s'il est animé, sa clé à l'instant courant.
  recordEdit(id) {
    if (id !== 'camera') {
      const o = this.objects.get(id);
      const st = this.getState(id);
      o.item.pos = st.pos;
      o.item.rot = st.rot;
      o.item.scale = st.scale;
    }
    if (this.anim.tracks[id]) { upsertKey(this.anim, id, this.time, this.getState(id)); this.timeline.render(); }
  }

  onGizmoChange() {
    if (this.gizmo.object === this.pivot) { this.onPivotChange(); this.dirty = true; return; }
    if (!this.sel) return;
    this.recordEdit(this.sel);
    this.renderPropsValues();
    this.dirty = true;
  }

  // ================================================================== historique et enregistrement
  serialize({ withData = false } = {}) {
    const objects = this.order.map((id) => {
      const it = { ...this.objects.get(id).item };
      delete it.imageEl;
      delete it.texImageEl;
      delete it.videoEl;
      delete it.seqFrames;
      return JSON.parse(JSON.stringify(it));
    });
    const c = this.three.camera;
    const out = {
      version: 1, env: { ...this.three.env }, anim: JSON.parse(JSON.stringify(this.anim)), objects, camera: {
        pos: c.position.toArray(), target: this.controls.target.toArray(), fov: c.fov, framing: this.framing || null,
      },
    };
    if (withData) {
      out.pages = {};
      for (const [k, p] of this.pages) {
        if (!this.objects.has(k.split(':')[0])) continue;
        out.pages[k] = {
          dataUrl: p.canvas.toDataURL('image/jpeg', 0.92), cssW: p.cssW, cssH: p.cssH, sbBg: p.sbBg, sbFg: p.sbFg,
        };
      }
      out.images = {};
      for (const [k, im] of this.images) out.images[k] = { dataUrl: im.dataUrl, cssW: im.cssW, cssH: im.cssH };
      out.glbs = {};
      for (const [k, g] of this.gltfs) if (g.bytesB64) out.glbs[k] = g.bytesB64;
      if (this.bgImageData) out.bgImage = this.bgImageData;
    }
    return out;
  }

  async load(data, { fromSettings = false } = {}) {
    for (const id of [...this.order]) this.remove(id, { history: false });
    this.anim = data.anim ? { ...newAnimation(), ...data.anim } : newAnimation();
    if (data.pages) {
      for (const [k, p] of Object.entries(data.pages)) {
        // eslint-disable-next-line no-await-in-loop
        const img = await loadImage(p.dataUrl);
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        this.pages.set(k, { ...p, canvas: c });
      }
    }
    if (data.images) {
      for (const [k, im] of Object.entries(data.images)) {
        // eslint-disable-next-line no-await-in-loop
        await this.registerImage(im.dataUrl, k);
      }
    }
    if (data.glbs) {
      for (const [k, b64] of Object.entries(data.glbs)) {
        // eslint-disable-next-line no-await-in-loop
        try { await this.registerGlb(Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)), k); } catch { /* modèle illisible */ }
      }
    }
    if (data.bgImage) await this.setBgImage(data.bgImage, { silent: true });
    this.three.applyEnv(data.env || DEFAULT_ENV, this.bgImageEl);
    for (const it of data.objects || []) {
      if (it.type === 'device') {
        // eslint-disable-next-line no-await-in-loop
        await this.addDevice(it, { select: false, place: false, history: false });
      } else if (!(it.kind === 'glb' && !this.gltfs.has(it.glbId)) && !(it.kind === 'image' && !this.images.has(it.imageId))) {
        // eslint-disable-next-line no-await-in-loop
        if (it.kind === 'video' || it.kind === 'sequence') await this.attachMedia(it);
        this.addDecor(it, { select: false, history: false });
      }
    }
    if (data.camera) {
      this.three.camera.position.fromArray(data.camera.pos);
      this.controls.target.fromArray(data.camera.target);
      this.three.camera.fov = data.camera.fov || 32;
      this.framing = data.camera.framing || null;
      this.applyFraming();
    }
    if (fromSettings) await this.refreshLinkedScreens({ quiet: true });
    this.time = 0;
    this.applyTime();
    this.select(null);
    this.renderList();
    this.timeline.render();
    this.resize();
  }

  commit() {
    this.pushHistory();
    this.saveSoon();
  }

  pushHistory() {
    const snap = JSON.stringify(this.serialize());
    if (this.history[this.history.length - 1] === snap) return;
    this.history.push(snap);
    if (this.history.length > 40) this.history.shift();
    this.future = [];
  }

  async undo() {
    if (this.history.length < 2) return;
    this.future.push(this.history.pop());
    await this.restore(this.history[this.history.length - 1]);
  }

  async redo() {
    if (!this.future.length) return;
    const s = this.future.pop();
    this.history.push(s);
    await this.restore(s);
  }

  async restore(snap) {
    const data = JSON.parse(snap);
    const sel = this.sel;
    const t = this.time;
    for (const id of [...this.order]) this.remove(id, { history: false });
    this.anim = data.anim;
    this.three.applyEnv(data.env, this.bgImageEl);
    for (const it of data.objects) {
      // eslint-disable-next-line no-await-in-loop
      if (it.type === 'device') await this.addDevice(it, { select: false, place: false, history: false });
      else this.addDecor(it, { select: false, history: false });
    }
    this.time = t;
    this.applyTime();
    const multi = this.multi ? [...this.multi].filter((x) => this.objects.has(x)) : [];
    if (multi.length > 1) this.selectMany(multi, sel); else this.select(this.objects.has(sel) ? sel : null);
    this.saveSoon();
  }

  saveSoon() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      if (!this.space || this.space === 'scene') settings.studio = this.serialize();
      else this.stashSpace();
      persist();
    }, 500);
  }

  // ================================================================== écrans (pages de l'aperçu, images)
  /* Capture la page d'un appareil de l'aperçu. full : toute la hauteur de la page (pour le défilement). */
  async capturePage(view, full) {
    const canvas = await view.capturePage({ fullPage: full });
    const max = Math.min(16384, this.three.renderer.capabilities.maxTextureSize || 8192);
    let c = canvas;
    if (c.width > max || c.height > max) {
      const k = Math.min(max / c.width, max / c.height);
      const r = document.createElement('canvas');
      r.width = Math.floor(c.width * k);
      r.height = Math.floor(c.height * k);
      r.getContext('2d').drawImage(c, 0, 0, r.width, r.height);
      c = r;
    }
    const col = view.statusColors();
    return {
      canvas: c, cssW: canvas.cssWidth || view.L.vp.w, cssH: canvas.cssHeight || view.L.vp.h, sbBg: col.bg, sbFg: col.fg,
    };
  }

  findView(uidv) { return S.board ? S.board.views.get(uidv) : null; }

  async refreshScreen(id, kind, { quiet = false } = {}) {
    const o = this.objects.get(id);
    if (!o) return false;
    const src = o.item[kind];
    if (src && src.src === 'url' && kind === 'main') return this.fillUrlScreen(id);
    if (!src || src.src !== 'view') return false;
    const v = this.findView(src.viewUid);
    if (!v || !v.ready || !v.url) { if (!quiet) toast("L'appareil de l'aperçu n'affiche pas de page.", { kind: 'bad' }); return false; }
    const busy = quiet ? null : toast(src.full ? 'Capture de la page entière…' : "Capture de l'écran…", { busy: true, sticky: true });
    try {
      const page = await this.capturePage(v, Boolean(src.full));
      this.pages.set(`${id}:${kind}`, page);
      if (!o.model.setPage(kind, page)) this.build(o.item);
      this.dirty = true;
      return true;
    } catch (err) {
      console.error(err);
      if (!quiet) toast("La page n'a pas pu être capturée. Attends la fin du chargement puis réessaie.", { kind: 'bad' });
      return false;
    } finally { if (busy) busy.close(); }
  }

  async refreshLinkedScreens({ quiet = false } = {}) {
    for (const id of this.order) {
      const it = this.objects.get(id).item;
      if (it.type !== 'device') continue;
      // eslint-disable-next-line no-await-in-loop
      for (const k of ['main', 'cover']) if (it[k] && (it[k].src === 'view' || (k === 'main' && it[k].src === 'url'))) await this.refreshScreen(id, k, { quiet });
    }
  }

  async registerImage(dataUrl, id = uid()) {
    const img = await loadImage(dataUrl);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    this.images.set(id, {
      img, dataUrl, canvas: c, cssW: img.naturalWidth, cssH: img.naturalHeight, sbBg: '#000', sbFg: '#fff',
    });
    return id;
  }

  async registerGlb(bytes, id = uid()) {
    const loader = new T.GLTFLoader();
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const gltf = await loader.parseAsync(buf, '');
    let b64 = '';
    if (bytes.length < 40e6) {
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      b64 = btoa(s);
    }
    gltf.bytesB64 = b64;
    this.gltfs.set(id, gltf);
    return id;
  }

  async setBgImage(dataUrl, { silent = false } = {}) {
    this.bgImageData = dataUrl;
    this.bgImageEl = await loadImage(dataUrl);
    if (!silent) { this.three.applyEnv({ ...this.three.env, bg: 'image' }, this.bgImageEl); this.dirty = true; this.commit(); this.renderProps(); }
  }

  // Ajoute les appareils de la planche de l'aperçu, avec leur page, leur couleur et leur position.
  async importBoard({ initial = false } = {}) {
    const views = S.board ? S.board.list : [];
    const busy = views.some((v) => v.url) ? toast("Import des appareils de l'aperçu…", { busy: true, sticky: true }) : null;
    try {
      for (const v of views) {
        const info = deviceInfo(v.cfg.deviceId, settings.custom);
        const st = v.stateInfo;
        const onCover = info.foldable && st.id === info.coverState;
        const linked = { src: 'view', viewUid: v.uid, full: false };
        // eslint-disable-next-line no-await-in-loop
        const item = await this.addDevice({
          deviceId: v.cfg.deviceId, state: st.id, land: v.cfg.land, color: v.cfg.color,
          fold: info.foldable ? (onCover ? 180 : 0) : 0, main: onCover ? { src: 'wallpaper' } : linked, cover: onCover ? linked : { src: 'wallpaper' },
        }, { select: false, history: false });
        // eslint-disable-next-line no-await-in-loop
        if (v.url) await this.refreshScreen(item.id, onCover ? 'cover' : 'main', { quiet: true });
      }
      if (!views.length) await this.addDevice({ deviceId: 'iphone-18-pro' }, { select: false, history: false });
    } finally { if (busy) busy.close(); }
    if (initial) {
      this.three.applyEnv(DEFAULT_ENV);
      this.addDecor({ kind: 'podium', color: '#ffffff', finish: 'satin' }, { select: false, history: false });
    }
    this.frameAll(false);
    this.renderList();
    this.renderProps();
    this.timeline.render();
    if (!initial) this.commit();
  }

  // ================================================================== caméra
  frameAll(animate = false, direction = null, opts = {}) {
    let box = opts.box || this.contentBox();
    if (opts.devicesOnly) {
      // Cadrage sur les appareils seuls (le décor peut déborder du cadre).
      const db = new T.Box3();
      for (const id of this.order) { const o = this.objects.get(id); if (o.item.type === 'device' && !o.item.hidden) db.expandByObject(o.model.root); }
      if (!db.isEmpty()) box = db;
    }
    const pad = opts.pad || 1.25;
    if (box.isEmpty()) return;
    const c = box.getCenter(new T.Vector3());
    const s = box.getSize(new T.Vector3());
    const cam = this.three.camera;
    const fov = deg(cam.fov);
    const aspect = cam.aspect || 1;
    const rw = this.framing ? this.framing.rw : 1;
    const rh = this.framing ? this.framing.rh : 1;
    const fitH = (s.y * pad) / (2 * Math.tan(fov / 2) * rh);
    const fitW = (s.x * pad) / (2 * Math.tan(fov / 2) * aspect * rw);
    const dist = Math.max(fitH, fitW, s.z * 2, 10) + s.z / 2;
    const dir = direction ? direction.clone().normalize() : cam.position.clone().sub(this.controls.target).normalize();
    if (!Number.isFinite(dir.x) || dir.lengthSq() < 0.5) dir.set(0, 0.25, 1).normalize();
    const to = c.clone().add(dir.multiplyScalar(dist));
    this.moveCamera(to, c, animate);
  }

  moveCamera(pos, target, animate) {
    const cam = this.three.camera;
    if (!animate) { cam.position.copy(pos); this.controls.target.copy(target); this.controls.update(); this.dirty = true; this.recordCameraIfAnimated(); return; }
    const p0 = cam.position.clone();
    const t0 = this.controls.target.clone();
    const start = performance.now();
    const step = (now) => {
      const f = Math.min(1, (now - start) / 450);
      const e = 1 - (1 - f) ** 3;
      cam.position.lerpVectors(p0, pos, e);
      this.controls.target.lerpVectors(t0, target, e);
      this.controls.update();
      this.dirty = true;
      if (f < 1) requestAnimationFrame(step); else this.recordCameraIfAnimated();
    };
    requestAnimationFrame(step);
  }

  recordCameraIfAnimated() {
    if (this.anim.tracks.camera) { upsertKey(this.anim, 'camera', this.time, this.getState('camera')); this.timeline.render(); }
    this.saveSoon();
  }

  setView(name, animate = true) {
    const v = VIEWS[name];
    if (!v) return;
    this.frameAll(animate, new T.Vector3(...v[1]));
  }

  // ================================================================== menus
  viewsMenu(anchor) {
    const pop = showPopover(anchor, `<div class="pop-title">Points de vue</div><div class="color-list">${Object.entries(VIEWS).map(([k, v]) => `<button class="color-row" data-view="${k}">${icon('eye', 14)}<span>${v[0]}</span></button>`).join('')}</div>`, { align: 'center', width: 220 });
    if (pop) pop.onclick = (e) => { const b = e.target.closest('[data-view]'); if (b) { hidePopover(); this.setView(b.dataset.view); } };
  }

  decorMenu(anchor) {
    const groups = ['socles', 'formes', 'deco'];
    const html = groups.map((g) => {
      const kinds = Object.entries(DECORS).filter(([, d]) => d.group === g);
      return `<div class="pop-sub">${DECOR_GROUPS[g]}</div><div class="decor-grid">${kinds.map(([k, d]) => `<button class="decor-tile" data-decor="${k}">${icon(d.icon, 20)}<span>${d.label}</span></button>`).join('')}</div>`;
    }).join('');
    const pop = showPopover(anchor, `<div class="pop-title">Ajouter un objet</div><div class="pop-scroll">${html}</div>`, { align: 'start', width: 340 });
    if (pop) pop.onclick = (e) => { const b = e.target.closest('[data-decor]'); if (b) { hidePopover(); this.addShape(b.dataset.decor); } };
  }

  addShape(kind) {
    const preset = {
      noeud: { finish: 'chrome', color: '#d9dde6' },
      gemme: { finish: 'verre', color: '#b9a4ff' },
      diamant: { finish: 'holo', color: '#e8ecff', mat: { flat: true } },
      blob: { finish: 'brillant', color: '#ff8fb1' },
      nuage: { finish: 'mat', color: '#ffffff' },
      spirale: { finish: 'neon', color: '#64d2ff' },
      etoile: { finish: 'or', color: '#ffd60a' },
      coeur: { finish: 'brillant', color: '#ff4d6d' },
      bulle: { finish: 'satin', color: '#0a84ff' },
      confettis: { finish: 'brillant', color: '#ffffff', count: 140, spread: 34, pos: [0, 2, 0] },
      tore: { finish: 'brillant', color: '#5e5ce6' },
      sphere: { finish: 'brillant', color: '#f3f3f6' },
      pilule: { finish: 'caoutchouc', color: '#34c759' },
    }[kind] || {};
    return this.addDecor({ kind, ...preset });
  }

  textMenu(anchor) {
    const pop = showPopover(anchor, `<div class="pop-title">Ajouter du texte</div>
      <button class="menu-item" data-tx="3d">${icon('text', 16)}<span><b>Texte en relief</b><small>Lettres extrudées et biseautées, matière au choix (chrome, verre, néon…)</small></span></button>
      <button class="menu-item" data-tx="flat">${icon('text', 16)}<span><b>Texte plat</b><small>Un panneau de texte net, toujours lisible</small></span></button>
      <div class="pop-sub">Icône en relief</div>
      <div class="decor-grid icons">${ICON3D_CHOICES.map((n) => `<button class="decor-tile" data-ic="${n}" title="${n}">${icon(n, 20)}</button>`).join('')}</div>`, { align: 'start', width: 330 });
    if (!pop) return;
    pop.onclick = (e) => {
      const t = e.target.closest('[data-tx]');
      const ic = e.target.closest('[data-ic]');
      if (!t && !ic) return;
      hidePopover();
      if (t && t.dataset.tx === 'flat') this.addDecor({ kind: 'texte', text: 'Votre application', color: '#1d1d1f', fontSize: 4 });
      else if (t) this.addDecor({ kind: 'texte3d', text: 'NEXORA', font: 'inter', fontSize: 6, depth: 1.6, bevel: 0.25, color: '#1d1d1f', finish: 'brillant' });
      else this.addDecor({ kind: 'icone3d', icon: ic.dataset.ic, size: 10, thickness: 1.1, color: '#0a84ff', finish: 'brillant' });
    };
  }

  lightMenu(anchor) {
    const hints = {
      point: 'Éclaire dans toutes les directions, comme une ampoule', spot: 'Un faisceau orientable avec ombres nettes', dir: 'Lumière parallèle et lointaine, ombres franches', area: 'Lumière douce de studio (softbox), sans ombre portée', hemi: 'Teinte le haut et le bas de la scène',
    };
    const pop = showPopover(anchor, `<div class="pop-title">Ajouter une lumière</div>${Object.entries(LIGHT_TYPES).map(([k, [label, ic]]) => `<button class="menu-item" data-lt="${k}">${icon(ic, 16)}<span><b>${label}</b><small>${hints[k]}</small></span></button>`).join('')}
      <p class="pop-note">Les repères des lumières n'apparaissent pas dans les images et vidéos exportées.</p>`, { align: 'start', width: 330 });
    if (!pop) return;
    pop.onclick = (e) => {
      const b = e.target.closest('[data-lt]');
      if (!b) return;
      hidePopover();
      const lt = b.dataset.lt;
      this.addDecor({ kind: 'lumiere', lightType: lt, color: lt === 'hemi' ? '#cfe3ff' : '#ffffff', intensity: 1, angle: 28, penumbra: 0.45, width: 24, height: 14, castShadow: lt !== 'area' && lt !== 'hemi' });
    };
  }

  importMenu(anchor) {
    const pop = showPopover(anchor, `<div class="pop-title">Importer</div>
      <button class="menu-item" data-imp="board">${icon('multi', 16)}<span><b>Appareils de l'aperçu</b><small>Avec leur page, leur couleur et leur orientation</small></span></button>
      <button class="menu-item" data-imp="glb">${icon('cube', 16)}<span><b>Modèle 3D (.glb, .gltf)</b><small>Décor ou appareil sous licence ; un maillage nommé « screen » reçoit la page</small></span></button>
      <button class="menu-item" data-imp="image">${icon('image', 16)}<span><b>Image</b><small>Logo, illustration, capture : un panneau dans la scène</small></span></button>
      <button class="menu-item" data-imp="video">${icon('video', 16)}<span><b>Vidéo</b><small>MP4, WebM, MOV : un plan sur la frise, à l'image près dans l'export</small></span></button>
      <button class="menu-item" data-imp="sequence">${icon('layers', 16)}<span><b>Séquence d’images</b><small>Plusieurs images jouées à la suite (animation image par image)</small></span></button>
      <button class="menu-item" data-imp="svg">${icon('shapes', 16)}<span><b>Tracé SVG</b><small>Logo ou pictogramme vectoriel, recolorable</small></span></button>
      <button class="menu-item" data-imp="project">${icon('folderOpen', 16)}<span><b>Projet Studio (.nexora3d)</b><small>Scène, animation et images enregistrées</small></span></button>`, { align: 'start', width: 340 });
    if (!pop) return;
    pop.onclick = async (e) => {
      const b = e.target.closest('[data-imp]');
      if (!b) return;
      hidePopover();
      const k = b.dataset.imp;
      if (k === 'board') await this.importBoard();
      if (k === 'glb') {
        const f = await api.invoke('dialog:open-file', { title: 'Importer un modèle 3D', filters: [{ name: 'Modèles 3D', extensions: ['glb', 'gltf'] }], asBytes: true });
        if (!f || f.error) { if (f && f.error) toast('Ce fichier est trop volumineux.', { kind: 'bad' }); return; }
        try {
          const id = await this.registerGlb(f.data);
          const item = this.addDecor({ kind: 'glb', glbId: id, color: '#ffffff' });
          const o = this.objects.get(item.id);
          const scr = o.model.screenMesh();
          const sel = S.board && S.board.focused;
          if (scr && sel && sel.url) {
            const page = await this.capturePage(sel, false);
            const tex = new T.CanvasTexture(page.canvas);
            tex.colorSpace = T.SRGBColorSpace;
            tex.flipY = false;
            scr.material = new T.MeshBasicMaterial({ map: tex, toneMapped: false });
            this.dirty = true;
          }
          toast(`${f.name} importé${scr ? ' : la page est affichée sur son écran' : ''}`);
        } catch (err) { console.error(err); toast("Ce modèle 3D n'a pas pu être lu.", { kind: 'bad' }); }
      }
      if (k === 'image') {
        const f = await api.invoke('dialog:open-file', { title: 'Importer une image', filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }], asDataUrl: true });
        if (!f || !f.dataUrl) return;
        const id = await this.registerImage(f.dataUrl);
        this.addDecor({ kind: 'image', imageId: id, height: 18 });
      }
      if (k === 'project') this.openProject();
      if (k === 'video' || k === 'sequence') await this.importMedia(k);
      if (k === 'svg') await this.importSvgShape();
    };
  }

  pickDevice(onPick, current) {
    const all = DEVICES.concat(settings.custom || []);
    const sheet = openSheet('studio-device', `
      <div class="sheet-head"><span class="sheet-icon">${icon('phone', 22)}</span><div><h2>Choisir un appareil</h2><p>Le modèle 3D est construit à partir des dimensions réelles de l'appareil : corps, écran, modules photo, charnières.</p></div></div>
      <div class="sheet-body picker-body">
        <div class="side-search"><span class="search-ico">${icon('search', 14)}</span><input type="search" placeholder="Rechercher un appareil" data-picker-search data-autofocus></div>
        <div class="picker-list" data-picker-list></div>
      </div>
      <div class="sheet-foot"><span class="grow"></span><button class="btn" data-sheet="close">Annuler</button></div>`, { wide: true });
    const list = $('[data-picker-list]', sheet);
    const render = (q = '') => {
      const s = q.trim().toLowerCase();
      list.innerHTML = CATEGORIES.map((cat) => {
        const items = all.filter((d) => (d.category === cat.id || (d.alsoIn || []).includes(cat.id)) && (!s || d.name.toLowerCase().includes(s)));
        if (!items.length) return '';
        return `<section><h4><span class="grp-icon" style="--c:${cat.color}">${icon(cat.glyph, 12)}</span>${esc(cat.label)}</h4><div class="picker-grid">${items.map((d) => `<button class="picker-item${d.id === current ? ' on' : ''}" data-pick="${esc(d.id)}"><span class="pi-dot" style="--c:${esc(defaultColor(d))}"></span><span>${esc(d.name)}</span></button>`).join('')}</div></section>`;
      }).join('');
    };
    render();
    $('[data-picker-search]', sheet).addEventListener('input', (e) => render(e.target.value));
    list.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      closeSheet();
      onPick(b.dataset.pick);
    });
  }

  // ================================================================== mises en scène et animations toutes faites
  renderPresets() {
    const P = [
      ['duo', 'Deux téléphones côte à côte', 'multi'],
      ['trio', 'Trois appareils en présentoir', 'layers'],
      ['foldopen', 'Pliable qui s\'ouvre', 'fold'],
      ['laptopphone', 'Ordinateur et téléphone', 'laptop'],
      ['hero', 'Téléphone en vedette', 'star'],
      ['flat', 'Posés à plat, vue de dessus', 'grid'],
    ];
    this.$.presets.innerHTML = P.map(([k, label, ic]) => `<button class="st-preset" data-scene="${k}">${icon(ic, 15)}<span>${label}</span></button>`).join('');
  }

  async scenePreset(name) {
    const devices = this.order.map((id) => this.objects.get(id)).filter((o) => o.item.type === 'device');
    const firstPage = devices.find((o) => this.pages.has(`${o.id}:main`));
    const linkFrom = (o) => (o ? { ...o.item.main } : { src: 'wallpaper' });
    const copyPage = (fromId, toId) => { const p = this.pages.get(`${fromId}:main`); if (p) this.pages.set(`${toId}:main`, p); };
    for (const id of [...this.order]) this.remove(id, { history: false });
    this.anim = newAnimation();
    const add = async (spec) => {
      const it = await this.addDevice({ ...spec, main: spec.main || linkFrom(firstPage) }, { select: false, place: false, history: false });
      if (firstPage && !spec.noPage) copyPage(firstPage.id, it.id);
      if (firstPage && !spec.noPage) this.build(it);
      return it;
    };
    if (name === 'duo') {
      this.three.applyEnv({ ...this.three.env, bg: 'gradient', bgColor: '#f6f2ff', bgColor2: '#d9d4f2', floor: 'shadow', light: 'studio' });
      await add({ deviceId: 'iphone-18-pro', pos: [-5.2, 0, 0], rot: [0, 18, 0], color: '#2b2c2f' });
      await add({ deviceId: 'galaxy-s25-ultra', pos: [5.4, 0, 0], rot: [0, -18, 0], color: '#8d8f93' });
    } else if (name === 'trio') {
      this.three.applyEnv({ ...this.three.env, bg: 'studio', bgColor: '#eef0f4', floor: 'shadow', light: 'doux' });
      await add({ deviceId: 'ipad-pro-11', pos: [0, 0, -8], rot: [0, 0, 0] });
      await add({ deviceId: 'iphone-18-pro', pos: [-17, 0, 3], rot: [0, 22, 0] });
      await add({ deviceId: 'galaxy-z-fold8', pos: [18, 0, 3], rot: [0, -24, 0], state: 'open' });
    } else if (name === 'foldopen') {
      this.three.applyEnv({ ...this.three.env, bg: 'gradient', bgColor: '#20232c', bgColor2: '#0b0c10', floor: 'glossy', light: 'contraste' });
      const it = await add({ deviceId: 'galaxy-z-fold8', state: 'open', fold: 150, pos: [0, 0, 0], rot: [0, -20, 0] });
      upsertKey(this.anim, it.id, 0, { pos: [0, 0, 0], rot: [0, -38, 0], scale: 1, fold: 170 });
      upsertKey(this.anim, it.id, 3, { pos: [0, 0, 0], rot: [0, 0, 0], scale: 1, fold: 0 });
      upsertKey(this.anim, it.id, 5, { pos: [0, 0, 0], rot: [0, 8, 0], scale: 1, fold: 0 });
    } else if (name === 'laptopphone') {
      this.three.applyEnv({ ...this.three.env, bg: 'studio', bgColor: '#e9ecf2', floor: 'shadow', light: 'studio' });
      await add({ deviceId: 'macbook-pro-14', pos: [-4, 0, -6], rot: [0, 12, 0] });
      await add({ deviceId: 'iphone-18-pro', pos: [17, 0, 6], rot: [0, -20, 0] });
    } else if (name === 'hero') {
      this.three.applyEnv({ ...this.three.env, bg: 'gradient', bgColor: '#fff1e6', bgColor2: '#ffc9a8', floor: 'shadow', light: 'coucher' });
      this.addDecor({ kind: 'podium2', color: '#ffffff' }, { select: false, history: false });
      await add({ deviceId: 'iphone-18-pro', pos: [0, 4.4, 0], rot: [0, -16, 0], color: '#6b2834' });
      this.addDecor({ kind: 'spheres', color: '#ff9f6b', finish: 'brillant', pos: [0, 0, -4] }, { select: false, history: false });
    } else if (name === 'flat') {
      this.three.applyEnv({ ...this.three.env, bg: 'color', bgColor: '#f3f4f7', floor: 'shadow', light: 'doux' });
      await add({ deviceId: 'iphone-18-pro', pos: [-6, 0.9, 0], rot: [-90, 0, 8] });
      await add({ deviceId: 'pixel-9-pro', pos: [6, 0.9, 0], rot: [-90, 0, -8] });
    }
    this.time = 0;
    this.applyTime();
    if (name === 'flat') this.setView('top', false); else this.frameAll(false);
    this.select(null);
    this.renderList();
    this.timeline.render();
    this.resize();
    this.commit();
  }

  openPresets(anchor) {
    const o = this.sel && this.sel !== 'camera' ? this.objects.get(this.sel) : null;
    const info = o && o.item.type === 'device' ? deviceInfo(o.item.deviceId, settings.custom) : null;
    const A = [
      ['spin', 'Rotation 360°', "L'objet fait un tour complet", Boolean(o)],
      ['swing', 'Balancement', 'Pivote doucement de gauche à droite', Boolean(o)],
      ['enter', 'Entrée par le bas', "L'objet arrive et se pose", Boolean(o)],
      ['float', 'Flottement', 'Lévite et respire', Boolean(o)],
      ['open', 'Ouverture', 'Le pliable ou l\'ordinateur s\'ouvre', Boolean(info && (info.foldable || info.laptop))],
      ['scroll', 'Défilement de la page', 'La page défile sur l\'écran (capture de la page entière)', Boolean(info)],
      ['orbit', 'Orbite de la caméra', 'La caméra tourne autour de la scène', true],
      ['zoom', 'Zoom avant', 'La caméra s\'approche', true],
      ['showcase', 'Présentation complète', 'Entrée, ouverture, défilement et orbite', true],
    ];
    const pop = showPopover(anchor, `<div class="pop-title">Animations toutes faites</div><p class="pop-note">${o ? `Pour : <b>${esc(this.nameFor(o.item))}</b>.` : 'Sélectionne un objet pour les animations d\'objet.'} Les clés existantes de l'objet sont remplacées.</p>
      ${A.map(([k, label, hint, ok]) => `<button class="menu-item" data-anim="${k}" ${ok ? '' : 'disabled'}>${icon(k === 'orbit' || k === 'zoom' ? 'video' : 'sparkle', 16)}<span><b>${label}</b><small>${hint}</small></span></button>`).join('')}`, { align: 'end', above: true, width: 330 });
    if (!pop) return;
    pop.onclick = async (e) => {
      const b = e.target.closest('[data-anim]');
      if (!b || b.disabled) return;
      hidePopover();
      await this.applyAnimPreset(b.dataset.anim);
    };
  }

  async applyAnimPreset(name) {
    const a = this.anim;
    const D = a.duration;
    const id = this.sel && this.sel !== 'camera' ? this.sel : null;
    const base = id ? this.getState(id) : null;
    const set = (t, patch, ease) => upsertKey(a, id, t, { ...base, ...patch }, ease);
    if (id && ['spin', 'swing', 'enter', 'float', 'open', 'scroll'].includes(name)) delete a.tracks[id];
    if (name === 'spin') { set(0, { rot: [base.rot[0], base.rot[1], base.rot[2]] }); set(D, { rot: [base.rot[0], base.rot[1] + 360, base.rot[2]] }, 'inOut'); }
    if (name === 'swing') { set(0, { rot: [base.rot[0], base.rot[1] - 22, base.rot[2]] }); set(D / 2, { rot: [base.rot[0], base.rot[1] + 22, base.rot[2]] }); set(D, { rot: [base.rot[0], base.rot[1] - 22, base.rot[2]] }); }
    if (name === 'enter') { set(0, { pos: [base.pos[0], base.pos[1] - 14, base.pos[2] + 6], rot: [base.rot[0] + 24, base.rot[1] - 30, base.rot[2]] }); set(D * 0.45, {}, 'back'); set(D, {}); }
    if (name === 'float') { set(0, {}); set(D / 2, { pos: [base.pos[0], base.pos[1] + 1.6, base.pos[2]], rot: [base.rot[0] + 4, base.rot[1] + 6, base.rot[2] - 2] }); set(D, {}); }
    if (name === 'open') {
      const info = deviceInfo(this.objects.get(id).item.deviceId, settings.custom);
      if (info.laptop) { set(0, { lid: 0 }); set(D * 0.6, { lid: 108 }, 'out'); set(D, { lid: 108 }); } else { set(0, { fold: 178 }); set(D * 0.6, { fold: 0 }, 'inOut'); set(D, { fold: 0 }); }
    }
    if (name === 'scroll') {
      await this.ensureFullPage(id);
      const st = this.getState(id);
      upsertKey(a, id, 0, { ...st, scroll: 0 });
      upsertKey(a, id, D * 0.12, { ...st, scroll: 0 });
      upsertKey(a, id, D * 0.88, { ...st, scroll: 1 }, 'inOut');
      upsertKey(a, id, D, { ...st, scroll: 1 });
    }
    if (name === 'orbit' || name === 'zoom') this.cameraPreset(name);
    if (name === 'showcase') {
      for (const oid of this.order) {
        const o = this.objects.get(oid);
        if (o.item.type !== 'device' || o.item.hidden) continue;
        const info = deviceInfo(o.item.deviceId, settings.custom);
        // eslint-disable-next-line no-await-in-loop
        await this.ensureFullPage(oid);
        const st = this.getState(oid);
        delete a.tracks[oid];
        const k0 = { ...st, pos: [st.pos[0], st.pos[1] - 12, st.pos[2] + 4], rot: [st.rot[0] + 18, st.rot[1] - 26, st.rot[2]], scroll: 0 };
        if (info.foldable) k0.fold = 175;
        if (info.laptop) k0.lid = 0;
        upsertKey(a, oid, 0, k0);
        upsertKey(a, oid, D * 0.3, { ...st, scroll: 0, ...(info.foldable ? { fold: 0 } : {}), ...(info.laptop ? { lid: 108 } : {}) }, 'out');
        upsertKey(a, oid, D * 0.9, { ...st, scroll: 1, ...(info.foldable ? { fold: 0 } : {}), ...(info.laptop ? { lid: 108 } : {}) }, 'inOut');
        upsertKey(a, oid, D, { ...st, scroll: 1, ...(info.foldable ? { fold: 0 } : {}), ...(info.laptop ? { lid: 108 } : {}) });
      }
      this.cameraPreset('orbit', 40);
    }
    this.time = 0;
    this.applyTime();
    this.timeline.render();
    this.commit();
    if (!this.playing) this.togglePlay();
  }

  cameraPreset(name, amount) {
    const a = this.anim;
    const D = a.duration;
    const st = this.getState('camera');
    delete a.tracks.camera;
    const t = new T.Vector3(...st.ctarget);
    const p = new T.Vector3(...st.cpos);
    const off = p.clone().sub(t);
    if (name === 'orbit') {
      const ang = deg(amount || 60);
      const keys = 4;
      for (let i = 0; i <= keys; i++) {
        const f = i / keys;
        const o = off.clone().applyAxisAngle(new T.Vector3(0, 1, 0), -ang / 2 + ang * f);
        upsertKey(a, 'camera', D * f, { cpos: t.clone().add(o).toArray(), ctarget: t.toArray(), fov: st.fov }, i === 0 ? 'inOut' : 'linear');
      }
      a.tracks.camera[a.tracks.camera.length - 1].ease = 'out';
    } else {
      upsertKey(a, 'camera', 0, { cpos: t.clone().add(off.clone().multiplyScalar(1.55)).toArray(), ctarget: t.toArray(), fov: st.fov });
      upsertKey(a, 'camera', D, { cpos: t.clone().add(off.clone().multiplyScalar(0.9)).toArray(), ctarget: t.toArray(), fov: st.fov }, 'inOut');
    }
  }

  async ensureFullPage(id) {
    const o = this.objects.get(id);
    if (!o || o.item.type !== 'device') return;
    const src = o.item.main;
    if (src && src.src === 'view' && !src.full) {
      src.full = true;
      await this.refreshScreen(id, 'main');
    } else if (!src || src.src !== 'view') {
      const v = S.board && S.board.focused;
      if (v && v.url) { o.item.main = { src: 'view', viewUid: v.uid, full: true }; await this.refreshScreen(id, 'main'); }
    }
  }

  // ================================================================== liste et propriétés
  renderList() {
    const groupIndex = new Map();
    for (const id of this.order) { const g = this.objects.get(id).item.group; if (g && !groupIndex.has(g)) groupIndex.set(g, groupIndex.size + 1); }
    this.$.list.innerHTML = this.order.map((id) => {
      const it = this.objects.get(id).item;
      const ic = it.type === 'device' ? 'phone' : it.kind === 'lumiere' ? (LIGHT_TYPES[it.lightType || 'point'] || [0, 'bulb'])[1] : (DECORS[it.kind] || {}).icon || 'cube';
      const animated = Boolean(this.anim.tracks[id]);
      const inSel = this.sel === id || (this.multi && this.multi.has(id));
      const gi = it.group ? groupIndex.get(it.group) : 0;
      return `<div class="st-row${inSel ? ' on' : ''}${this.sel === id && this.multi && this.multi.size > 1 ? ' primary' : ''}${it.hidden ? ' off' : ''}${it.locked ? ' locked' : ''}" data-obj="${esc(id)}" draggable="true" title="Double-clic : renommer · Maj + clic : ajouter à la sélection · glisser : réordonner">
        ${it.group ? `<span class="st-grp" style="--g:${gi}" title="Groupe ${gi}"></span>` : ''}
        ${it.type === 'device' ? `<span class="st-dot" style="--c:${esc(it.color || defaultColor(getDevice(it.deviceId, settings.custom)))}"></span>` : `<span class="st-ico"${it.kind === 'lumiere' ? ` style="color:${esc(it.color || '#fff')}"` : ''}>${icon(ic, 14)}</span>`}
        <span class="st-name">${esc(this.nameFor(it))}</span>
        ${animated ? `<span class="st-anim" title="Animé">${icon('keyframe', 11)}</span>` : ''}
        <button class="icon-btn small${it.locked ? ' on' : ''}" data-lock title="${it.locked ? 'Déverrouiller' : 'Verrouiller (Ctrl+L)'}">${icon(it.locked ? 'lock' : 'unlock', 13)}</button>
        <button class="icon-btn small" data-vis title="${it.hidden ? 'Afficher' : 'Masquer (H)'}">${icon(it.hidden ? 'eyeOff' : 'eye', 13)}</button>
        <button class="icon-btn small" data-del title="Supprimer">${icon('trash', 13)}</button>
      </div>`;
    }).join('') || '<p class="empty-note">Ajoute un appareil pour commencer.</p>';
  }

  numRow(label, key, vals, step = 0.1, unit = '') {
    return `<div class="st-field"><span>${label}</span><div class="st-nums">${vals.map((v, i) => `<label><em>${'XYZ'[i]}</em><input type="number" step="${step}" value="${round(v, 2)}" data-num="${key}" data-i="${i}"></label>`).join('')}${unit ? `<i>${unit}</i>` : ''}</div></div>`;
  }

  rangeRow(label, key, value, min, max, step, fmt = (v) => v) {
    return `<div class="st-field"><span>${label}<b data-val="${key}">${fmt(value)}</b></span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-range="${key}"></div>`;
  }

  sourceSelect(kind, src) {
    const views = S.board ? S.board.list : [];
    const val = src.src === 'view' ? `view:${src.viewUid}` : src.src;
    const site = kind === 'main' ? (src.src === 'url' ? src.url : this.siteUrl()) : '';
    return `<select class="input" data-src="${kind}">
      ${site ? `<option value="url" ${val === 'url' ? 'selected' : ''}>Site à la taille de l’appareil : ${esc(site.replace(/^https?:\/\//, '').slice(0, 32))}</option>` : ''}
      ${views.map((v) => `<option value="view:${esc(v.uid)}" ${val === `view:${v.uid}` ? 'selected' : ''}>Aperçu : ${esc(v.dev.name.split(' / ')[0])}${v.url ? '' : ' (aucune page)'}</option>`).join('')}
      <option value="image" ${val === 'image' ? 'selected' : ''}>Image…</option>
      <option value="wallpaper" ${val === 'wallpaper' ? 'selected' : ''}>Écran de verrouillage</option>
    </select>`;
  }

  // Re-rendu du panneau sans perdre la position de défilement ni les sections dépliées (même sélection).
  renderProps() {
    const P = this.$.props;
    const key = `${this.space}|${this.sel}`;
    const same = this._propsKey === key;
    const top = P.scrollTop;
    const open = same ? [...P.querySelectorAll('details')].map((d) => d.open) : null;
    this.renderProps0();
    this._propsKey = key;
    if (same) {
      const ds = [...P.querySelectorAll('details')];
      if (open && ds.length === open.length) ds.forEach((d, i) => { d.open = open[i]; });
      P.scrollTop = top;
    }
  }

  renderProps0() {
    const P = this.$.props;
    const id = this.sel;
    if (this.space === 'mockup' && this.mockup) { P.innerHTML = this.mockup.propsHtml(); return; }
    if (!id) {
      const head = this.space === 'ad' ? this.adProps() : this.space === 'deck' ? this.deckProps() : '';
      P.innerHTML = head + this.sceneProps();
      return;
    }
    if (id === 'camera') {
      const c = this.three.camera;
      P.innerHTML = `<div class="st-head">Caméra</div>
        <section class="st-card">${this.rangeRow('Champ de vision', 'fov', round(c.fov, 1), 12, 75, 0.5, (v) => `${v}°`)}
        <p class="pop-note">Fais tourner la vue à la souris (clic gauche), décale-la (clic droit), zoome à la molette. Clique sur « Ajouter une clé » pour enregistrer ce cadrage à cet instant.</p>
        <div class="st-btns">${Object.entries(VIEWS).map(([k, v]) => `<button class="btn small" data-view="${k}">${v[0]}</button>`).join('')}</div></section>`;
      return;
    }
    if (this.selection().length > 1) { P.innerHTML = this.multiProps(); return; }
    const o = this.objects.get(id);
    const it = o.item;
    const st = this.getState(id);
    let html = `<div class="st-head">${esc(this.nameFor(it))}${it.locked ? ` <button class="btn small" data-prop="unlock">${icon('unlock', 12)}<span>Déverrouiller</span></button>` : ''}</div>`;
    if (it.type === 'device') {
      const dev = getDevice(it.deviceId, settings.custom);
      const info = deviceInfo(it.deviceId, settings.custom);
      const color = it.color || defaultColor(dev);
      html += `<section class="st-card">
        <button class="btn small wide" data-prop="replace">${icon('phone', 14)}<span>Changer d'appareil</span></button>
        <div class="st-field"><span>Couleur</span><div class="st-colors">${(dev.colors || []).map(([n, hex]) => `<button class="st-color${hex === color ? ' on' : ''}" style="--c:${esc(hex)}" data-color="${esc(hex)}" title="${esc(n)}"></button>`).join('')}<label class="st-color custom" title="Couleur personnalisée"><input type="color" value="${esc(color)}" data-custom-color></label></div></div>
        ${!info.foldable && !dev.fixed ? `<div class="st-field"><span>Orientation de l'écran</span>${seg('land', it.land ? '1' : '0', { 0: 'Portrait', 1: 'Paysage' })}</div>` : ''}
        ${info.foldable ? this.rangeRow('Pliage', 'fold', round(it.fold, 0), 0, 180, 1, (v) => (Number(v) <= 0 ? 'Ouvert' : Number(v) >= 180 ? 'Fermé' : `${v}°`)) : ''}
        ${info.laptop ? this.rangeRow("Ouverture de l'écran", 'lid', round(it.lid, 0), 0, 135, 1, (v) => `${v}°`) : ''}
      </section>
      <section class="st-card">
        <div class="st-field"><span>${info.hasCover ? 'Écran principal (intérieur)' : 'Écran'}</span>${this.sourceSelect('main', it.main)}</div>
        ${it.main.src === 'view' || it.main.src === 'url' ? `<label class="check-row"><input type="checkbox" data-full ${it.main.full ? 'checked' : ''}><span class="box"></span><span>Page entière (pour le défilement)</span></label>` : ''}
        <div class="st-btns"><button class="btn small" data-prop="refresh">${icon('refreshCw', 13)}<span>Actualiser l'écran</span></button></div>
        ${this.rangeRow('Défilement de la page', 'scroll', round(it.scroll || 0, 3), 0, 1, 0.001, (v) => `${Math.round(v * 100)} %`)}
        ${info.hasCover ? `<div class="st-field"><span>Écran externe</span>${this.sourceSelect('cover', it.cover)}</div>` : ''}
      </section>`;
    } else html += this.decorProps(it);
    html += `<section class="st-card">
      ${this.numRow('Position', 'pos', st.pos, 0.5, 'cm')}
      ${this.numRow('Rotation', 'rot', st.rot, 1, '°')}
      ${this.rangeRow('Taille', 'scale', st.scale, 0.1, 4, 0.01, (v) => `${Math.round(v * 100)} %`)}
      ${it.type === 'device' ? `<div class="st-field"><span>Poses rapides</span><div class="st-btns">${Object.entries(POSES).map(([k, p]) => `<button class="btn small" data-pose="${k}">${p[0]}</button>`).join('')}</div></div>` : ''}
      <div class="st-btns"><button class="btn small" data-prop="drop" title="Pose l'objet sur ce qui est en dessous (P)">${icon('floor', 13)}<span>Poser</span></button><button class="btn small" data-prop="center" title="Ramène l'objet au centre de la scène">${icon('target', 13)}<span>Centrer</span></button><button class="btn small" data-prop="reset-rot">${icon('rotate3d', 13)}<span>Redresser</span></button><button class="btn small" data-prop="focus" title="Centrer la vue sur l'objet (.)">${icon('eye', 13)}<span>Voir</span></button></div>
    </section>
    ${this.clipCard(it)}
    <div class="st-btns"><button class="btn small" data-prop="key">${icon('keyframe', 13)}<span>Ajouter une clé</span></button><button class="btn small" data-prop="dup">${icon('copy', 13)}<span>Dupliquer</span></button><button class="btn small" data-prop="lock">${icon(it.locked ? 'unlock' : 'lock', 13)}<span>${it.locked ? 'Déverrouiller' : 'Verrouiller'}</span></button><button class="btn small" data-prop="del">${icon('trash', 13)}<span>Supprimer</span></button></div>`;
    P.innerHTML = html;
  }

  // Montage : apparition de l'objet sur une partie de la frise, avec ses transitions.
  clipCard(it) {
    const c = it.clip;
    const sec = (v) => `${Number(v).toFixed(1).replace('.', ',')} s`;
    const D = this.anim.duration;
    return `<details class="st-card st-adv"${c ? ' open' : ''}><summary>${icon('film', 13)}<span>Plan (montage)</span></summary>
      ${this.dCheck('Visible seulement pendant un plan', 'clipOn', Boolean(c))}
      ${c ? `${this.dRange('Début', 'clip.start', c.start, 0, D, 0.05, sec)}${this.dRange('Fin', 'clip.end', c.end, 0, D, 0.05, sec)}
        ${it.kind === 'video' ? this.dRange('Début dans la vidéo', 'clip.trim', c.trim || 0, 0, Math.max(1, (this.mediaStore().get(it.mediaId) || {}).duration || 30), 0.05, sec) : ''}
        <div class="st-field"><span>Entrée</span><select class="input" data-dsel="clip.tin">${Object.entries(TRANSITIONS).map(([k, l]) => `<option value="${k}" ${(c.tin || 'fade') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        ${this.dRange('Durée de l’entrée', 'clip.fin', c.fin ?? 0.4, 0, 3, 0.05, sec)}
        <div class="st-field"><span>Sortie</span><select class="input" data-dsel="clip.tout">${Object.entries(TRANSITIONS).map(([k, l]) => `<option value="${k}" ${(c.tout || 'fade') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        ${this.dRange('Durée de la sortie', 'clip.fout', c.fout ?? 0.4, 0, 3, 0.05, sec)}
        <div class="st-btns"><button class="btn small" data-mt="clip-start">Commencer ici</button><button class="btn small" data-mt="clip-end">Finir ici</button><button class="btn small" data-mt="clip-seq" title="Met les plans bout à bout, avec un fondu enchaîné">${icon('film', 13)}<span>Enchaîner les plans</span></button></div>` : '<p class="pop-note">Active le plan pour faire apparaître et disparaître l’objet au bon moment (montage vidéo, diaporama, publicité).</p>'}
    </details>`;
  }

  async mediaAction(a) {
    const id = this.sel;
    const o = id && this.objects.get(id);
    if (!o) return;
    const it = o.item;
    if (a === 'clip-start' || a === 'clip-end') {
      const c = this.ensureClip(it);
      if (a === 'clip-start') { const len = c.end - c.start; c.start = this.time; c.end = Math.min(this.anim.duration, Math.max(c.start + 0.2, c.start + len)); } else c.end = Math.max(c.start + 0.1, this.time);
    }
    if (a === 'clip-seq') { this.sequenceClips(); return; }
    if (a === 'video-len') {
      const m = this.mediaStore().get(it.mediaId);
      const c = this.ensureClip(it);
      const len = it.kind === 'video' ? ((m && m.duration) || 5) / (it.speed || 1) - (c.trim || 0) : (it.mediaPaths || []).length / (it.fps || 12);
      c.end = c.start + Math.max(0.2, len);
      if (c.end > this.anim.duration) this.setDuration(Math.min(600, Math.ceil(c.end)));
    }
    if (a === 'relink') {
      const f = await api.invoke('media:pick', { kind: 'video' });
      if (!f || !f.length) return;
      try { const mid = await this.registerVideo(f[0]); const m = this.mediaStore().get(mid); Object.assign(it, { mediaId: mid, mediaPath: m.path, mediaName: m.name, aspect: m.aspect }); this.build(it); } catch (e) { toast(e.message, { kind: 'bad' }); return; }
    }
    if (a === 'front' || a === 'back') {
      const layers = this.order.map((x) => this.objects.get(x).item.layer || 0);
      it.layer = a === 'front' ? Math.max(0, ...layers) + 1 : Math.min(0, ...layers) - 1;
      this.build(it);
    }
    this.applyTime();
    this.timeline.render();
    this.renderProps();
    this.commit();
  }

  dRange(label, key, value, min, max, step, fmt = (v) => v) {
    return `<div class="st-field"><span>${label}<b data-dval="${key}">${fmt(value)}</b></span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-drange="${key}"></div>`;
  }

  dCheck(label, key, on) {
    return `<label class="check-row"><input type="checkbox" data-dcheck="${key}" ${on ? 'checked' : ''}><span class="box"></span><span>${label}</span></label>`;
  }

  chips(key, cur, map, attr = 'data-dset') {
    return `<div class="st-chips">${Object.entries(map).map(([k, l]) => `<button class="st-chip${String(cur) === k ? ' on' : ''}" ${attr}="${key}" data-val="${esc(k)}">${esc(l)}</button>`).join('')}</div>`;
  }

  colorRow(label, key, cur, palette) {
    return `<div class="st-field"><span>${label}</span><div class="st-colors">${palette.map((c) => `<button class="st-color${(cur || '').toLowerCase() === c ? ' on' : ''}" style="--c:${c}" data-dcolor="${key}" data-val="${c}"></button>`).join('')}<label class="st-color custom" style="--c:${esc(cur || '#ffffff')}"><input type="color" value="${esc(cur || '#ffffff')}" data-dcolor-in="${key}"></label></div></div>`;
  }

  // Propriétés d'un décor : forme, texte, lumière, matière et texture.
  decorProps(it) {
    const PAL = ['#ffffff', '#f2f2f5', '#1d1d1f', '#ff6b6b', '#ff4d6d', '#ffb86b', '#ffd60a', '#34c759', '#64d2ff', '#0a84ff', '#5e5ce6', '#bf5af2'];
    const pct = (v) => `${Math.round(v * 100)} %`;
    const cm = (v) => `${v} cm`;
    let h = '<section class="st-card">';
    if (it.kind === 'lumiere') {
      const lt = it.lightType || 'point';
      h += `<div class="st-field"><span>Type</span>${this.chips('lightType', lt, Object.fromEntries(Object.entries(LIGHT_TYPES).map(([k, v]) => [k, v[0]])))}</div>
        ${this.colorRow(lt === 'hemi' ? 'Couleur du ciel' : 'Couleur', 'color', it.color, ['#ffffff', '#fff1d6', '#ffd29a', '#ffb070', '#cfe3ff', '#8fb8ff', '#ff2d95', '#00e5ff', '#bf5af2', '#34c759'])}
        ${lt === 'hemi' ? this.colorRow('Couleur du sol', 'color2', it.color2 || '#d9c7b0', ['#d9c7b0', '#a08060', '#3a2f28', '#2b3a2f', '#20232c']) : ''}
        ${this.dRange('Intensité', 'intensity', it.intensity ?? 1, 0, 6, 0.05, pct)}
        ${lt === 'spot' ? `${this.dRange('Ouverture du faisceau', 'angle', it.angle || 28, 4, 80, 1, (v) => `${v}°`)}${this.dRange('Bord adouci', 'penumbra', it.penumbra ?? 0.45, 0, 1, 0.01, pct)}` : ''}
        ${lt === 'point' || lt === 'spot' ? this.dRange('Portée', 'distance', it.distance || 0, 0, 400, 5, (v) => (Number(v) ? `${v} cm` : 'Illimitée')) : ''}
        ${lt === 'area' ? `${this.dRange('Largeur', 'width', it.width || 24, 2, 120, 1, cm)}${this.dRange('Hauteur', 'height', it.height || 14, 2, 120, 1, cm)}${this.dCheck('Panneau visible dans les exports', 'visiblePanel', it.visiblePanel)}` : ''}
        ${lt === 'spot' || lt === 'dir' || lt === 'point' ? this.dCheck('Projette des ombres', 'castShadow', it.castShadow !== false) : ''}
        <div class="st-btns"><button class="btn small" data-prop="aim">${icon('target', 13)}<span>Viser le centre de la scène</span></button></div>
        <p class="pop-note">Déplace la lumière avec les poignées ; pour un projecteur, pivote-la pour orienter le faisceau.</p></section>`;
      return h;
    }
    if (it.kind === 'texte') {
      h += `<div class="st-field"><span>Texte</span><textarea class="input st-text" rows="2" data-text>${esc(it.text || '')}</textarea></div>${this.rangeRow('Taille du texte', 'fontSize', it.fontSize || 4, 1, 20, 0.5, cm)}${seg('weight', String(it.weight || 700), { 400: 'Normal', 600: 'Demi-gras', 800: 'Gras' })}`;
    }
    if (it.kind === 'texte3d') {
      h += `<div class="st-field"><span>Texte</span><textarea class="input st-text" rows="2" data-text>${esc(it.text || '')}</textarea></div>
        <div class="st-field"><span>Police</span><select class="input" data-dsel="font">${Object.entries(FONTS3D).map(([k, [l]]) => `<option value="${k}" ${it.font === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        ${this.dRange('Taille des lettres', 'fontSize', it.fontSize || 6, 1, 40, 0.5, cm)}
        ${this.dRange('Épaisseur', 'depth', it.depth ?? 1.6, 0.05, 12, 0.05, cm)}
        ${this.dRange('Biseau', 'bevel', it.bevel ?? 0.25, 0, 1.5, 0.01, cm)}
        ${this.dRange('Espacement', 'spacing', it.spacing || 0, -0.1, 0.5, 0.01, (v) => `${Math.round(v * 100)}`)}
        <div class="st-field"><span>Alignement</span>${this.chips('align', it.align || 'center', { left: 'Gauche', center: 'Centré', right: 'Droite' })}</div>`;
    }
    if (it.kind === 'icone3d') {
      h += `<div class="st-field"><span>Icône</span><div class="decor-grid icons">${ICON3D_CHOICES.map((n) => `<button class="decor-tile${it.icon === n ? ' on' : ''}" data-dset="icon" data-val="${n}" title="${n}">${icon(n, 18)}</button>`).join('')}</div></div>
        ${this.dRange('Taille', 'size', it.size || 10, 2, 60, 0.5, cm)}${this.dRange('Épaisseur du trait', 'thickness', it.thickness || 1, 0.3, 3, 0.05, (v) => `${v}`)}`;
    }
    if (it.kind === 'confettis') {
      h += `${this.dRange('Nombre', 'count', it.count || 120, 10, 600, 10, (v) => v)}${this.dRange('Étendue', 'spread', it.spread || 30, 5, 120, 1, cm)}
        <div class="st-field"><span>Forme</span>${this.chips('shape', it.shape || 'mix', { mix: 'Mélange', carre: 'Rubans', rond: 'Billes', etoile: 'Étoiles' })}</div>
        ${this.dCheck('Couleurs variées', 'colorful', it.colorful !== false)}
        <div class="st-btns"><button class="btn small" data-prop="reseed">${icon('sync', 13)}<span>Mélanger</span></button></div>`;
    }
    if (it.kind === 'blob') h += `${this.dRange('Relief', 'amount', it.amount ?? 0.32, 0, 1, 0.01, pct)}<div class="st-btns"><button class="btn small" data-prop="reseed">${icon('sync', 13)}<span>Autre forme</span></button></div>`;
    if (it.kind === 'cube') h += this.dRange('Arrondi', 'round', it.round ?? 1.2, 0, 3.9, 0.05, cm);
    if (it.kind === 'noeud') h += `<div class="st-field"><span>Variante</span>${this.chips('pq', `${it.p || 2},${it.q || 3}`, { '2,3': 'Trèfle', '3,5': 'Étoile', '2,5': 'Couronne', '3,7': 'Fleur' })}</div>`;
    if (it.kind === 'glb') h += this.dCheck('Remplacer les matières du modèle', 'recolor', it.recolor);
    if (it.kind === 'vecteur') {
      const sh = it.shape || 'round';
      h += `<div class="st-field"><span>Forme</span><select class="input" data-dsel="shape">${Object.entries(VECTOR_SHAPES).filter(([k]) => k !== 'path' || sh === 'path').map(([k, [l]]) => `<option value="${k}" ${sh === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        ${this.dRange('Largeur', 'w', it.w || 20, 0.5, 120, 0.5, cm)}${sh !== 'line' ? this.dRange('Hauteur', 'h', it.h || 12, 0.5, 120, 0.5, cm) : ''}
        ${sh === 'round' ? this.dRange('Arrondi des coins', 'radius', it.radius ?? 2.4, 0, 30, 0.1, cm) : ''}
        ${sh === 'star' || sh === 'burst' ? `${this.dRange('Branches', 'points', it.points || (sh === 'burst' ? 16 : 5), 3, 40, 1, (v) => v)}${this.dRange('Creux', 'inner', it.inner ?? (sh === 'burst' ? 0.82 : 0.45), 0.1, 0.98, 0.01, pct)}` : ''}
        ${sh === 'polygon' ? this.dRange('Côtés', 'sides', it.sides || 6, 3, 16, 1, (v) => v) : ''}
        ${sh !== 'line' ? this.colorRow('Remplissage', 'fill', it.fill, PAL) : ''}
        ${sh !== 'line' ? `${this.colorRow('Dégradé vers', 'fill2', it.fill2 || '', ['', '#ffffff', '#1d1d1f', '#ff2d95', '#ffd60a', '#64d2ff', '#5e5ce6', '#34c759'])}${it.fill2 ? this.dRange('Angle du dégradé', 'gradAngle', it.gradAngle ?? 90, 0, 360, 5, (v) => `${v}°`) : ''}` : ''}
        ${this.colorRow('Contour', 'stroke', it.stroke || '', ['', '#ffffff', '#1d1d1f', '#0a84ff', '#ff4d6d', '#ffd60a'])}
        ${it.stroke || sh === 'line' ? this.dRange('Épaisseur du contour', 'strokeW', it.strokeW || 0.6, 0.1, 6, 0.1, cm) : ''}
        ${this.dRange('Ombre portée', 'shadow', it.shadow || 0, 0, 6, 0.1, cm)}`;
    }
    if (it.kind === 'video') {
      const m = this.mediaStore().get(it.mediaId);
      h += `<div class="st-field"><span>Vidéo</span><b class="st-mname">${esc(it.mediaName || (m && m.name) || 'vidéo')}${m ? ` · ${(m.duration || 0).toFixed(1).replace('.', ',')} s` : ' · introuvable'}</b></div>
        ${this.dRange('Hauteur', 'height', it.height || 18, 2, 120, 0.5, cm)}
        ${this.dRange('Coins arrondis', 'radius', it.radius || 0, 0, 10, 0.1, cm)}
        ${this.dRange('Vitesse', 'speed', it.speed || 1, 0.25, 3, 0.05, (v) => `×${v}`)}
        ${this.dCheck('En boucle', 'loop', it.loop)}
        <div class="st-btns"><button class="btn small" data-mt="video-len">${icon('film', 13)}<span>Plan = durée de la vidéo</span></button><button class="btn small" data-mt="relink">${icon('folderOpen', 13)}<span>Remplacer le fichier</span></button></div>`;
    }
    if (it.kind === 'sequence') {
      h += `<div class="st-field"><span>Séquence</span><b class="st-mname">${(it.mediaPaths || []).length} images</b></div>
        ${this.dRange('Hauteur', 'height', it.height || 18, 2, 120, 0.5, cm)}
        ${this.dRange('Images par seconde', 'fps', it.fps || 12, 1, 60, 1, (v) => `${v} i/s`)}
        ${this.dCheck('En boucle', 'loop', it.loop)}
        <div class="st-btns"><button class="btn small" data-mt="video-len">${icon('film', 13)}<span>Plan = durée de la séquence</span></button></div>`;
    }
    if (['vecteur', 'video', 'sequence', 'image', 'texte'].includes(it.kind)) {
      h += `${this.dRange('Opacité', 'opacity', it.opacity ?? 1, 0, 1, 0.01, pct)}
        <div class="st-field"><span>Calque</span><div class="st-btns"><button class="btn small" data-mt="front" title="Devant les autres calques 2D">${icon('layers', 13)}<span>Premier plan</span></button><button class="btn small" data-mt="back" title="Derrière les autres calques 2D">${icon('layers', 13)}<span>Arrière-plan</span></button></div></div>`;
    }
    const solidVector = it.kind === 'vecteur' && Number(it.extrude) > 0 && it.shape !== 'line';
    if (it.kind === 'vecteur' && it.shape !== 'line') {
      h += `<div class="st-sub">${icon('cube', 13)}<span>Volume</span></div>
        ${this.dRange('Extrusion (profondeur)', 'extrude', Number(it.extrude) || 0, 0, 40, 0.1, (v) => (Number(v) ? `${v} cm` : 'À plat'))}
        ${solidVector ? `${this.dRange('Biseau (arêtes arrondies)', 'bevel3d', Number(it.bevel3d) || 0, 0, 6, 0.05, cm)}${this.dRange('Retrait intérieur', 'inset', Number(it.inset) || 0, 0, 6, 0.05, cm)}<div class="st-field"><span>Matière</span>${this.finishGrid(it.finish || 'satin')}</div>` : ''}`;
    }
    const matOk = !['texte', 'image', 'vecteur', 'video', 'sequence'].includes(it.kind) && (it.kind !== 'glb' || it.recolor);
    if (!['image', 'vecteur', 'video', 'sequence'].includes(it.kind) && (it.kind !== 'glb' || it.recolor)) h += this.colorRow('Couleur', 'color', it.color, PAL);
    if (matOk) h += `<div class="st-field"><span>Matière</span>${this.finishGrid(it.finish || 'satin')}</div>`;
    h += '</section>';
    // Modificateurs non destructifs (volumes uniquement).
    if (!['lumiere', 'texte', 'image', 'video', 'sequence', 'confettis'].includes(it.kind) && (it.kind !== 'vecteur' || solidVector)) {
      const md = it.mods || {};
      const on = hasModifiers(md);
      h += `<details class="st-card st-adv st-mods"${on ? ' open' : ''}><summary>${icon('wave', 13)}<span>Modificateurs</span>${on ? '<i class="st-badge">actifs</i>' : ''}</summary>
        ${Object.entries(MODIFIERS).map(([k, [l, mn, mx, stp, u]]) => this.dRange(l, `mods.${k}`, Number(md[k]) || 0, mn, mx, stp, (v) => (u === '%' ? `${Math.round(v * 100)} %` : u === '°' ? `${v}°` : (Number(v) ? `${v} niveau${v > 1 ? 'x' : ''}` : 'Aucune')))).join('')}
        <p class="pop-note">Ils déforment une copie de l’objet : l’original reste intact. Remets un curseur à zéro pour annuler son effet.</p>
        <div class="st-btns"><button class="btn small" data-prop="mods-reset">${icon('refreshCw', 13)}<span>Retirer les modificateurs</span></button></div>
      </details>`;
    }
    if (matOk || solidVector) {
      const m = it.mat || {};
      const tx = it.tex || {};
      h += `<details class="st-card st-adv"${m.open || (tx.kind && tx.kind !== 'none') ? ' open' : ''}><summary>${icon('palette', 13)}<span>Matière avancée et texture</span></summary>
        ${Object.entries(MAT_KEYS).map(([k, [l, mn, mx, stp]]) => this.matRange(l, k, m[k], mn, mx, stp)).join('')}
        ${m.emissive ? this.colorRow('Couleur de la lumière propre', 'mat.emissiveColor', m.emissiveColor || it.color, ['#ffffff', '#ffd60a', '#ff2d95', '#00e5ff', '#34c759', '#bf5af2']) : ''}
        ${this.dCheck('Facettes visibles', 'mat.flat', m.flat)}${this.dCheck('Fil de fer', 'mat.wire', m.wire)}${this.dCheck('Projette une ombre', 'shadowOn', !it.noShadow)}
        <div class="st-field"><span>Texture</span>${this.chips('tex.kind', tx.kind || 'none', TEXTURES)}</div>
        ${tx.kind && tx.kind !== 'none' ? `${tx.kind !== 'image' ? this.colorRow('Seconde couleur', 'tex.color2', tx.color2 || '#1d1d1f', ['#1d1d1f', '#ffffff', '#8a8f98', '#c8a27a', '#5e5ce6', '#ff6b6b']) : ''}${this.dRange('Répétition', 'tex.scale', tx.scale || 1, 0.25, 12, 0.25, (v) => `×${v}`)}` : ''}
        <div class="st-btns"><button class="btn small" data-prop="mat-reset">${icon('refreshCw', 13)}<span>Réinitialiser la matière</span></button></div>
      </details>`;
    }
    return h;
  }

  matRange(label, key, value, min, max, step) {
    const set = value != null && value !== '';
    const v = set ? value : (key === 'opacity' ? 1 : min);
    return `<div class="st-field${set ? '' : ' unset'}"><span>${label}<b data-dval="mat.${key}">${set ? (key === 'emissive' ? v : `${Math.round(v * 100)} %`) : 'auto'}</b></span><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-drange="mat.${key}"></div>`;
  }

  // Lecture et écriture d'un champ (éventuellement imbriqué : « mat.roughness », « tex.kind »).
  getField(it, key) { const [a, b] = key.split('.'); return b ? (it[a] || {})[b] : it[a]; }

  setField(it, key, v) {
    const [a, b] = key.split('.');
    if (b) { it[a] = { ...(it[a] || {}), [b]: v }; } else it[a] = v;
  }

  // Met à jour les champs numériques sans reconstruire le panneau (pendant un glissement).
  renderPropsValues() {
    const id = this.sel;
    if (!id || id === 'camera' || !this.objects.has(id)) return;
    const st = this.getState(id);
    for (const inp of this.$.props.querySelectorAll('[data-num]')) {
      if (document.activeElement === inp) continue;
      inp.value = round(st[inp.dataset.num][Number(inp.dataset.i)], 2);
    }
    for (const r of this.$.props.querySelectorAll('[data-range]')) {
      const k = r.dataset.range;
      const v = k === 'scale' ? st.scale : this.objects.get(id).item[k];
      if (v != null && document.activeElement !== r) r.value = v;
    }
  }

  musicCard() {
    return this.musicCard0() + this.voiceCard();
  }

  musicCard0() {
    const m = this.music && this.music.isMix ? this.musicBase : this.music;
    if (!m) return `<section class="st-card"><div class="st-field"><span>Musique des vidéos</span></div><button class="btn small wide" data-music="add">${icon('music', 13)}<span>Ajouter une musique…</span></button><p class="pop-note">MP3, WAV, M4A, OGG ou FLAC. Utilise une musique dont tu as les droits.</p></section>`;
    return `<section class="st-card"><div class="st-field"><span>Musique des vidéos</span></div>
      <div class="st-music">${icon('music', 16)}<span>${esc(m.name)}<small>${fmtTime(m.buffer.duration * 1000)}</small></span><button class="icon-btn small" data-music="play" title="Écouter">${icon(this.musicPlaying ? 'pause' : 'play', 13)}</button><button class="icon-btn small" data-music="rm" title="Retirer">${icon('trash', 13)}</button></div>
      ${this.mRange('Volume', 'volume', m.volume, 0, 1.5, 0.01, (v) => `${Math.round(v * 100)} %`)}
      ${this.mRange('Début dans la musique', 'offset', m.offset, 0, Math.max(0, Math.floor(m.buffer.duration - 1)), 0.5, (v) => fmtTime(v * 1000))}
      ${this.mRange('Fondu de fin', 'fadeOut', m.fadeOut, 0, 4, 0.1, (v) => `${v} s`)}
    </section>`;
  }

  mRange(label, key, value, min, max, step, fmt) {
    return `<div class="st-field"><span>${label}<b data-mval="${key}">${fmt(value)}</b></span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-mrange="${key}"></div>`;
  }

  async musicAction(a) {
    if (await this.voiceAction(a)) return;
    if (a === 'add') {
      const f = await api.invoke('dialog:open-file', { title: 'Musique de la vidéo', filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'flac', 'webm'] }], asBytes: true });
      if (!f || !f.data) { if (f && f.error) toast('Ce fichier est trop volumineux.', { kind: 'bad' }); return; }
      try {
        const bytes = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
        const buffer = await decodeMusic(bytes);
        this.music = {
          name: f.name || 'Musique', bytes, buffer, volume: 0.8, offset: 0, fadeIn: 0.3, fadeOut: 1.2,
        };
        toast(`Musique ajoutée : ${f.name} (${fmtTime(buffer.duration * 1000)})`);
        if (this.voice) { this.musicBase = this.music; await this.applyVoice(this.voice.buffer, this.voice.text, this.voice.voiceName); }
      } catch (err) { console.error(err); toast("Ce fichier audio n'a pas pu être lu.", { kind: 'bad' }); }
    }
    if (a === 'rm') { this.stopMusicPreview(); this.music = null; this.musicBase = null; if (this.voice) await this.applyVoice(this.voice.buffer, this.voice.text, this.voice.voiceName); }
    if (a === 'play' && this.music) {
      if (this.musicPlaying) this.stopMusicPreview();
      else {
        const { renderTrack } = await import('./music.js');
        const buf = await renderTrack(this.music.buffer, Math.min(this.anim.duration, this.music.buffer.duration), this.music);
        const ac = new AudioContext();
        const src = ac.createBufferSource();
        src.buffer = buf;
        src.connect(ac.destination);
        src.onended = () => { this.stopMusicPreview(); this.renderProps(); };
        src.start();
        this.musicPlaying = { ac, src };
      }
    }
    this.renderProps();
  }

  stopMusicPreview() {
    if (!this.musicPlaying) return;
    try { this.musicPlaying.src.stop(); this.musicPlaying.ac.close(); } catch { /* déjà arrêtée */ }
    this.musicPlaying = null;
  }

  eRange(label, key, value, min, max, step, fmt = (v) => v) {
    return `<div class="st-field"><span>${label}<b data-eval="${key}">${fmt(value)}</b></span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-erange="${key}"></div>`;
  }

  eCheck(label, key, on) {
    return `<label class="check-row"><input type="checkbox" data-echeck="${key}" ${on ? 'checked' : ''}><span class="box"></span><span>${label}</span></label>`;
  }

  // Modifie un réglage de l'environnement (éventuellement imbriqué : « fx.bloom », « fog.mode »).
  setEnv(key, v, { rerender = false, final = true } = {}) {
    const e = JSON.parse(JSON.stringify(this.three.env));
    const [a, b] = key.split('.');
    if (b) e[a] = { ...(e[a] || {}), [b]: v }; else e[a] = v;
    if (a === 'fog' && b === 'mode' && v !== 'none' && !e.fog.color) e.fog.color = e.bgColor;
    this.three.applyEnv(e, this.bgImageEl);
    this.dirty = true;
    if (rerender) this.renderProps();
    if (final) this.commit();
  }

  sceneProps() {
    const e = this.three.env;
    const swatch = (k, label) => `<button class="bg-sw st-bg st-bg-${k}${e.bg === k ? ' on' : ''}" data-bg="${k}" title="${label}" style="${k === 'color' || k === 'studio' ? `--c:${esc(e.bgColor)}` : k === 'gradient' ? `--c:${esc(e.bgColor)};--c2:${esc(e.bgColor2)}` : k === 'image' && this.bgImageData ? `background-image:url('${this.bgImageData}')` : ''}"></button>`;
    const ex = settings.studioExport || {};
    return `<div class="st-head">${!this.space || this.space === 'scene' ? 'Scène' : 'Décor et lumière'}</div>
      <section class="st-card">
        ${!this.space || this.space === 'scene' ? `<div class="st-field"><span>Format de l'image</span>${seg('aspect', e.aspect, ASPECTS)}</div>` : ''}
        <div class="st-field"><span>Arrière-plan</span><div class="bg-swatches">${Object.entries(BACKGROUNDS).map(([k, l]) => swatch(k, l)).join('')}</div></div>
        ${['studio', 'color', 'gradient'].includes(e.bg) ? `<div class="st-field"><span>Couleurs du fond</span><div class="st-colors"><label class="st-color custom" style="--c:${esc(e.bgColor)}"><input type="color" value="${esc(e.bgColor)}" data-env-color="bgColor"></label>${e.bg === 'gradient' ? `<label class="st-color custom" style="--c:${esc(e.bgColor2)}"><input type="color" value="${esc(e.bgColor2)}" data-env-color="bgColor2"></label>` : ''}${['#ffffff', '#eceef3', '#f6efe6', '#e7f0ea', '#e8e6f6', '#1d1d20', '#0b0c10'].map((c) => `<button class="st-color" style="--c:${c}" data-env-pick="${c}"></button>`).join('')}</div></div>` : ''}
        <div class="st-field"><span>Sol</span>${seg('floor', e.floor, FLOORS)}</div>
      </section>
      <section class="st-card">
        <div class="st-field"><span>Éclairage</span><div class="st-btns">${Object.entries(LIGHTS).map(([k, l]) => `<button class="btn small${e.light === k ? ' primary' : ''}" data-light="${k}">${l}</button>`).join('')}</div></div>
        ${this.rangeRow('Lumière ambiante', 'envIntensity', e.envIntensity, 0, 2.5, 0.05, (v) => `${Math.round(v * 100)} %`)}
        ${this.rangeRow('Ombre', 'shadow', e.shadow, 0, 0.8, 0.01, (v) => `${Math.round(v * 100)} %`)}
        ${this.rangeRow('Exposition', 'exposure', e.exposure, 0.4, 2, 0.01, (v) => `${Math.round(v * 100)} %`)}
        <details class="st-adv"${e.rig !== 1 || e.lightAngle || e.warmth || (e.lightHeight ?? 1) !== 1 ? ' open' : ''}><summary>${icon('light', 13)}<span>Réglages fins des lumières</span></summary>
          ${this.eRange('Projecteurs de base', 'rig', e.rig ?? 1, 0, 2, 0.05, (v) => `${Math.round(v * 100)} %`)}
          ${this.eRange('Orientation', 'lightAngle', e.lightAngle || 0, -180, 180, 1, (v) => `${v}°`)}
          ${this.eRange('Hauteur', 'lightHeight', e.lightHeight ?? 1, 0.2, 2.5, 0.05, (v) => `${Math.round(v * 100)} %`)}
          ${this.eRange('Température', 'warmth', e.warmth || 0, -1, 1, 0.05, (v) => (Number(v) > 0 ? `chaude ${Math.round(v * 100)}` : Number(v) < 0 ? `froide ${Math.round(-v * 100)}` : 'neutre'))}
          <p class="pop-note">Ajoute tes propres lumières (ampoule, projecteur, panneau) avec le bouton « Lumière » ; baisse les projecteurs de base pour n'utiliser que les tiennes.</p>
        </details>
      </section>
      <section class="st-card">
        <div class="st-field"><span>Ambiances toutes faites</span></div>
        <div class="st-amb">${Object.entries(AMBIANCES).map(([k, [l, a]]) => `<button class="st-amb-b" data-amb="${k}" style="--a:${esc(a.bgColor || '#888')};--b:${esc(a.bgColor2 || a.bgColor || '#888')}"><i></i><span>${esc(l)}</span></button>`).join('')}</div>
      </section>
      <section class="st-card">
        <div class="st-field"><span>Brouillard</span>${this.chips('fog.mode', (e.fog && e.fog.mode) || 'none', FOGS, 'data-eset')}</div>
        ${e.fog && e.fog.mode && e.fog.mode !== 'none' ? `${this.eRange('Densité', 'fog.density', e.fog.density ?? 0.25, 0, 1, 0.01, (v) => `${Math.round(v * 100)} %`)}<div class="st-field"><span>Couleur du brouillard</span><div class="st-colors"><button class="btn small" data-eset="fog.color" data-val="${esc(e.bgColor)}">Comme le fond</button><label class="st-color custom" style="--c:${esc(e.fog.color || e.bgColor)}"><input type="color" value="${esc(e.fog.color || e.bgColor)}" data-ecolor="fog.color"></label></div></div>` : ''}
        <div class="st-field"><span>Effets de rendu</span></div>
        ${this.eCheck('Halo lumineux (bloom)', 'fx.bloom', e.fx && e.fx.bloom)}
        ${e.fx && e.fx.bloom ? `${this.eRange('Force du halo', 'fx.bloomStrength', e.fx.bloomStrength ?? 0.6, 0, 3, 0.05, (v) => `${Math.round(v * 100)} %`)}${this.eRange('Diffusion', 'fx.bloomRadius', e.fx.bloomRadius ?? 0.4, 0, 1, 0.01, (v) => `${Math.round(v * 100)} %`)}${this.eRange('Seuil (ce qui brille)', 'fx.bloomThreshold', e.fx.bloomThreshold ?? 1, 0, 1.5, 0.01, (v) => `${Math.round(v * 100)} %`)}` : ''}
        ${this.eCheck('Vignettage', 'fx.vignette', e.fx && e.fx.vignette)}
        ${e.fx && e.fx.vignette ? this.eRange('Assombrissement des bords', 'fx.vignetteAmount', e.fx.vignetteAmount ?? 0.5, 0, 1, 0.01, (v) => `${Math.round(v * 100)} %`) : ''}
        ${this.eCheck('Grain de film', 'fx.grain', e.fx && e.fx.grain)}
        ${e.fx && e.fx.grain ? this.eRange('Intensité du grain', 'fx.grainAmount', e.fx.grainAmount ?? 0.25, 0, 1, 0.01, (v) => `${Math.round(v * 100)} %`) : ''}
        ${e.floor === 'glossy' ? `${this.eRange('Force du reflet', 'reflect', e.reflect ?? 0.5, 0, 1, 0.01, (v) => `${Math.round(v * 100)} %`)}${this.eRange('Flou du reflet', 'floorRough', e.floorRough ?? 0.14, 0, 1, 0.01, (v) => `${Math.round(v * 100)} %`)}<div class="st-field"><span>Couleur du sol</span><div class="st-colors"><button class="btn small" data-eset="floorColor" data-val="">Auto</button><label class="st-color custom" style="--c:${esc(e.floorColor || e.bgColor)}"><input type="color" value="${esc(e.floorColor || e.bgColor)}" data-ecolor="floorColor"></label></div></div>` : ''}
        <p class="pop-note">Les effets s'appliquent aussi aux images et vidéos exportées (sauf sur fond transparent).</p>
      </section>
      ${this.musicCard()}
      <section class="st-card">
        <div class="st-field"><span>Exporter</span></div>
        <div class="st-btns"><button class="btn small primary" data-st="photo">${icon('camera', 13)}<span>Image</span></button><button class="btn small primary" data-st="video">${icon('film', 13)}<span>Vidéo</span></button><button class="btn small" data-prop="glb">${icon('cube', 13)}<span>Scène 3D (.glb)</span></button></div>
        <div class="st-btns"><button class="btn small" data-prop="save-project">${icon('download', 13)}<span>Enregistrer le projet</span></button><button class="btn small" data-prop="open-project">${icon('folderOpen', 13)}<span>Ouvrir</span></button></div>
        <p class="pop-note">Dernier export : ${ex.last ? esc(ex.last) : 'aucun'}.</p>
      </section>`;
  }

  async onPropInput(e, final) {
    if (e.target.dataset && e.target.dataset.subs) { this.subsOn = e.target.checked; this.dirty = true; return; }
    const t = e.target;
    if (this.spaceInput(e, final)) return;
    const id = this.sel;
    if (await this.decorInput(t, final)) return;
    if (t.dataset.mrange && this.music) {
      const k = t.dataset.mrange;
      this.music[k] = Number(t.value);
      const lab = this.$.props.querySelector(`[data-mval="${k}"]`);
      if (lab) lab.textContent = k === 'volume' ? `${Math.round(this.music[k] * 100)} %` : k === 'offset' ? fmtTime(this.music[k] * 1000) : `${this.music[k]} s`;
      return;
    }
    if (t.dataset.erange) {
      const k = t.dataset.erange;
      const v = Number(t.value);
      this.setEnv(k, v, { final });
      const lab = this.$.props.querySelector(`[data-eval="${k}"]`);
      if (lab) lab.textContent = k === 'lightAngle' ? `${v}°` : k === 'warmth' ? (v > 0 ? `chaude ${Math.round(v * 100)}` : v < 0 ? `froide ${Math.round(-v * 100)}` : 'neutre') : `${Math.round(v * 100)} %`;
      return;
    }
    if (t.dataset.echeck && final) { this.setEnv(t.dataset.echeck, t.checked, { rerender: true }); return; }
    if (t.dataset.ecolor && final) { this.setEnv(t.dataset.ecolor, t.value, { rerender: true }); return; }
    if (t.dataset.range) {
      const k = t.dataset.range;
      const v = Number(t.value);
      const lab = this.$.props.querySelector(`[data-val="${k}"]`);
      if (!id) {
        this.three.applyEnv({ ...this.three.env, [k]: v }, this.bgImageEl);
        if (lab) lab.textContent = `${Math.round(v * 100)} %`;
        this.dirty = true;
        if (final) this.commit();
        return;
      }
      if (id === 'camera') {
        this.three.camera.fov = v;
        this.three.camera.updateProjectionMatrix();
        if (lab) lab.textContent = `${v}°`;
        this.dirty = true;
        if (final) this.recordCameraIfAnimated();
        return;
      }
      const o = this.objects.get(id);
      if (k === 'scale') { o.model.root.scale.setScalar(v); if (lab) lab.textContent = `${Math.round(v * 100)} %`; }
      if (k === 'fold') { o.item.fold = v; o.model.setFold(v); if (lab) lab.textContent = v <= 0 ? 'Ouvert' : v >= 180 ? 'Fermé' : `${v}°`; }
      if (k === 'lid') { o.item.lid = v; o.model.setLid(v); if (lab) lab.textContent = `${v}°`; }
      if (k === 'scroll') { o.item.scroll = v; o.model.setScroll(v, 'main'); if (lab) lab.textContent = `${Math.round(v * 100)} %`; }
      if (k === 'fontSize') { o.item.fontSize = v; if (lab) lab.textContent = `${v} cm`; if (final) this.build(o.item); }
      this.dirty = true;
      if (final) { this.recordEdit(id); this.commit(); this.renderList(); }
      return;
    }
    if (!final) return;
    if (t.dataset.num && id) {
      const o = this.objects.get(id);
      const st = this.getState(id);
      st[t.dataset.num][Number(t.dataset.i)] = Number(t.value) || 0;
      this.applyState(id, st);
      this.recordEdit(id);
      this.commit();
      return;
    }
    if (t.dataset.customColor !== undefined && id) {
      const o = this.objects.get(id);
      o.item.color = t.value;
      this.build(o.item);
      this.renderList();
      this.commit();
      return;
    }
    if (t.dataset.envColor) {
      this.three.applyEnv({ ...this.three.env, [t.dataset.envColor]: t.value }, this.bgImageEl);
      this.dirty = true;
      this.renderProps();
      this.commit();
      return;
    }
    if (t.dataset.src && id) {
      const o = this.objects.get(id);
      const kind = t.dataset.src;
      const v = t.value;
      if (v.startsWith('view:')) {
        o.item[kind] = { src: 'view', viewUid: v.slice(5), full: o.item[kind].full || false };
        await this.refreshScreen(id, kind);
      } else if (v === 'url' && kind === 'main') {
        const url = this.siteUrl();
        if (url) {
          o.item.main = { src: 'url', url, full: o.item.main.full || false };
          const busy = toast('Capture du site à la taille de l’appareil…', { busy: true, sticky: true });
          try { await this.fillUrlScreen(id); } finally { busy.close(); }
        } else toast("Ouvre d'abord un site dans le Responsive Lab.", { kind: 'bad' });
      } else if (v === 'image') {
        const f = await api.invoke('dialog:open-file', { title: "Image affichée sur l'écran", filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }], asDataUrl: true });
        if (f && f.dataUrl) {
          const imgId = await this.registerImage(f.dataUrl);
          o.item[kind] = { src: 'image', imageId: imgId };
          this.build(o.item);
        }
      } else {
        o.item[kind] = { src: 'wallpaper' };
        this.pages.delete(`${id}:${kind}`);
        this.build(o.item);
      }
      this.renderProps();
      this.commit();
      return;
    }
    if (t.dataset.full !== undefined && id) {
      const o = this.objects.get(id);
      o.item.main.full = t.checked;
      if (o.item.main.src === 'url') await this.fillUrlScreen(id); else await this.refreshScreen(id, 'main');
      this.commit();
      return;
    }
    if (t.dataset.text !== undefined && id) {
      const o = this.objects.get(id);
      o.item.text = t.value;
      this.build(o.item);
      this.renderList();
      this.commit();
    }
  }

  // Champs des décors (data-drange, data-dcheck, data-dsel, data-dcolor-in) ; vrai si traité.
  async decorInput(t, final) {
    const id = this.sel;
    const o = id && id !== 'camera' ? this.objects.get(id) : null;
    if (!o) return false;
    const it = o.item;
    if (t.dataset.drange) {
      const k = t.dataset.drange;
      const v = Number(t.value);
      this.setField(it, k, v);
      const lab = this.$.props.querySelector(`[data-dval="${k}"]`);
      if (lab) {
        const f = {
          opacity: (x) => `${Math.round(x * 100)} %`, inner: (x) => `${Math.round(x * 100)} %`, points: (x) => x, sides: (x) => x, fps: (x) => `${x} i/s`, speed: (x) => `×${x}`, gradAngle: (x) => `${x}°`,
          'clip.start': (x) => `${x.toFixed(1).replace('.', ',')} s`, 'clip.end': (x) => `${x.toFixed(1).replace('.', ',')} s`, 'clip.trim': (x) => `${x.toFixed(1).replace('.', ',')} s`, 'clip.fin': (x) => `${x.toFixed(2).replace('.', ',')} s`, 'clip.fout': (x) => `${x.toFixed(2).replace('.', ',')} s`,
          intensity: (x) => `${Math.round(x * 100)} %`, penumbra: (x) => `${Math.round(x * 100)} %`, angle: (x) => `${x}°`, distance: (x) => (x ? `${x} cm` : 'Illimitée'), count: (x) => x, amount: (x) => `${Math.round(x * 100)} %`, spacing: (x) => `${Math.round(x * 100)}`, thickness: (x) => x, 'tex.scale': (x) => `×${x}`, 'mat.emissive': (x) => x,
        }[k] || (k.startsWith('mat.') ? (x) => `${Math.round(x * 100)} %`
          : ['mods.taper', 'mods.bulge'].includes(k) ? (x) => `${Math.round(x * 100)} %`
            : ['mods.bend', 'mods.twist'].includes(k) ? (x) => `${x}°`
              : k === 'mods.subdiv' ? (x) => (x ? `${x} niveau${x > 1 ? 'x' : ''}` : 'Aucune')
                : k === 'extrude' ? (x) => (x ? `${x} cm` : 'À plat') : (x) => `${x} cm`);
        lab.textContent = f(v);
        const row = t.closest('.st-field'); if (row) row.classList.remove('unset');
      }
      if (k.startsWith('clip.')) {
        // Plan : rien à reconstruire, seulement la frise et l'image courante.
        if (it.clip && it.clip.end < it.clip.start + 0.1) { if (k === 'clip.start') it.clip.end = Math.min(this.anim.duration, it.clip.start + 0.1); else it.clip.start = Math.max(0, it.clip.end - 0.1); }
        this.applyTime(); this.timeline.render();
        if (final) this.commit();
        return true;
      }
      if (k === 'opacity' && o.model.setFade) { o.model.lastFade = null; o.model.setFade(this.clipState(it, this.time).fade); if (final) this.commit(); this.dirty = true; return true; }
      if (final) { this.build(it); this.commit(); this.renderList(); } else if (!this.liveDecor(o, k, v) && !['texte3d', 'confettis', 'icone3d', 'blob'].includes(it.kind)) this.build(it);
      this.dirty = true;
      return true;
    }
    if (!final) return Boolean(t.dataset.dcheck || t.dataset.dsel || t.dataset.dcolorIn);
    if (t.dataset.dcheck) {
      const k = t.dataset.dcheck;
      if (k === 'clipOn') {
        if (t.checked) this.ensureClip(it); else delete it.clip;
        this.applyTime(); this.renderProps(); this.timeline.render(); this.commit();
        return true;
      }
      if (k === 'shadowOn') it.noShadow = !t.checked; else this.setField(it, k, t.checked);
      this.build(it);
      this.renderProps();
      this.commit();
      return true;
    }
    if (t.dataset.dsel) {
      this.setField(it, t.dataset.dsel, t.value);
      if (t.dataset.dsel.startsWith('clip.')) { this.applyTime(); this.commit(); return true; }
      if (t.dataset.dsel === 'shape') { this.build(it); this.renderProps(); this.commit(); return true; }
      if (t.dataset.dsel === 'font') { try { await preloadFont3d(t.value); } catch { toast("La police n'a pas pu être chargée.", { kind: 'bad' }); } }
      this.build(it);
      this.commit();
      return true;
    }
    if (t.dataset.dcolorIn) {
      this.setField(it, t.dataset.dcolorIn, t.value);
      this.build(it);
      this.renderProps();
      this.renderList();
      this.commit();
      return true;
    }
    return false;
  }

  // Réglages appliqués sans reconstruire l'objet (lumières, matière) ; vrai si c'est le cas.
  liveDecor(o, k, v) {
    const L = o.model.light;
    if (L && k === 'intensity') {
      const t = o.item.lightType || 'point';
      L.intensity = v * ({ point: 1600, spot: 4000, dir: 2.2, area: 3.5, hemi: 1.4 }[t] || 1);
      return true;
    }
    if (L && k === 'penumbra' && L.isSpotLight) { L.penumbra = v; return true; }
    if (L && k === 'distance' && 'distance' in L) { L.distance = v; return true; }
    if (k.startsWith('mat.') && o.item.kind !== 'lumiere') {
      const key = k.slice(4);
      o.model.root.traverse((m) => {
        if (!m.isMesh || m.userData.editorOnly || !m.material) return;
        const mat = m.material;
        if (key === 'emissive' && 'emissiveIntensity' in mat) { if (!mat.emissive || mat.emissive.getHex() === 0) mat.emissive = new T.Color(o.item.mat.emissiveColor || o.item.color); mat.emissiveIntensity = v; } else if (key === 'opacity') { mat.opacity = v; mat.transparent = true; } else if (key in mat) mat[key] = v;
        if (key === 'transmission' && v > 0) mat.transparent = true;
        mat.needsUpdate = true;
      });
      return true;
    }
    return false;
  }

  async onPropClick(e) {
    const id = this.sel;
    const mt = e.target.closest('[data-mt]');
    if (mt) { await this.mediaAction(mt.dataset.mt); return; }
    if (await this.spaceClick(e)) return;
    if (await this.onMultiClick(e)) return;
    const mus = e.target.closest('[data-music]');
    if (mus) { await this.musicAction(mus.dataset.music); return; }
    const eset = e.target.closest('[data-eset]');
    if (eset) { this.setEnv(eset.dataset.eset, eset.dataset.val, { rerender: true }); return; }
    const amb = e.target.closest('[data-amb]');
    if (amb) {
      const a = AMBIANCES[amb.dataset.amb][1];
      this.three.applyEnv({ ...this.three.env, rig: 1, lightAngle: 0, lightHeight: 1, warmth: 0, floorColor: '', ...JSON.parse(JSON.stringify(a)) }, this.bgImageEl);
      this.resize();
      this.renderProps();
      this.commit();
      toast(`Ambiance « ${AMBIANCES[amb.dataset.amb][0]} » appliquée`);
      return;
    }
    const dset = e.target.closest('[data-dset]');
    if (dset && id && this.objects.has(id)) {
      const o = this.objects.get(id);
      const k = dset.dataset.dset;
      const v = dset.dataset.val;
      if (k === 'pq') { const [p, q] = v.split(',').map(Number); o.item.p = p; o.item.q = q; } else if (k === 'tex.kind' && v === 'image') {
        const f = await api.invoke('dialog:open-file', { title: 'Image de texture', filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }], asDataUrl: true });
        if (!f || !f.dataUrl) return;
        const imgId = await this.registerImage(f.dataUrl);
        o.item.tex = { ...(o.item.tex || {}), kind: 'image', imageId: imgId };
      } else this.setField(o.item, k, v);
      if (k === 'lightType') { o.item.castShadow = v !== 'area' && v !== 'hemi'; }
      this.build(o.item);
      this.renderProps();
      this.renderList();
      this.commit();
      return;
    }
    const dcol = e.target.closest('[data-dcolor]');
    if (dcol && id && this.objects.has(id)) {
      const o = this.objects.get(id);
      this.setField(o.item, dcol.dataset.dcolor, dcol.dataset.val);
      this.build(o.item);
      this.renderProps();
      this.renderList();
      this.commit();
      return;
    }
    const setBtn = e.target.closest('[data-set]');
    if (setBtn) {
      const k = setBtn.dataset.set;
      const v = setBtn.dataset.val;
      if (!id) {
        this.three.applyEnv({ ...this.three.env, [k]: v }, this.bgImageEl);
        if (k === 'aspect') this.resize();
        this.dirty = true;
        this.renderProps();
        this.commit();
        return;
      }
      const o = this.objects.get(id);
      if (k === 'land') { o.item.land = v === '1'; this.build(o.item); }
      if (k === 'finish') { o.item.finish = v; this.build(o.item); }
      if (k === 'weight') { o.item.weight = Number(v); this.build(o.item); }
      this.renderProps();
      this.commit();
      return;
    }
    const bg = e.target.closest('[data-bg]');
    if (bg) {
      const k = bg.dataset.bg;
      if (k === 'image') {
        const f = await api.invoke('dialog:open-file', { title: "Image d'arrière-plan", filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }], asDataUrl: true });
        if (!f || !f.dataUrl) return;
        await this.setBgImage(f.dataUrl);
        this.resize();
        return;
      }
      this.three.applyEnv({ ...this.three.env, bg: k }, this.bgImageEl);
      this.resize();
      this.renderProps();
      this.commit();
      return;
    }
    const pick = e.target.closest('[data-env-pick]');
    if (pick) { this.three.applyEnv({ ...this.three.env, bgColor: pick.dataset.envPick }, this.bgImageEl); this.dirty = true; this.renderProps(); this.commit(); return; }
    const light = e.target.closest('[data-light]');
    if (light) { this.three.applyEnv({ ...this.three.env, light: light.dataset.light }, this.bgImageEl); this.dirty = true; this.renderProps(); this.commit(); return; }
    const view = e.target.closest('[data-view]');
    if (view) { this.setView(view.dataset.view); return; }
    const col = e.target.closest('[data-color]');
    if (col && id) { const o = this.objects.get(id); o.item.color = col.dataset.color; this.build(o.item); this.renderProps(); this.renderList(); this.commit(); return; }
    const pose = e.target.closest('[data-pose]');
    if (pose && id) {
      const st = this.getState(id);
      st.rot = [...POSES[pose.dataset.pose][1]];
      if (pose.dataset.pose === 'plat') st.pos = [st.pos[0], Math.max(st.pos[1], 0.9), st.pos[2]];
      else if (st.rot[0] === 0 && st.pos[1] < 0.5 && this.getState(id).rot[0] === -90) st.pos[1] = 0;
      this.applyState(id, st);
      this.recordEdit(id);
      this.renderPropsValues();
      this.commit();
      return;
    }
    const b = e.target.closest('[data-prop]');
    if (!b) return;
    const a = b.dataset.prop;
    if (a === 'replace' && id) {
      const o = this.objects.get(id);
      this.pickDevice((dev) => { o.item.deviceId = dev; o.item.color = null; o.item.state = null; o.item.fold = 0; this.build(o.item); this.renderProps(); this.renderList(); this.commit(); }, o.item.deviceId);
    }
    if (a === 'refresh' && id) { await this.refreshScreen(id, 'main'); const it = this.objects.get(id).item; if (it.cover && it.cover.src === 'view') await this.refreshScreen(id, 'cover'); }
    if (a === 'key' && id) this.addKey(id);
    if ((a === 'lock' || a === 'unlock') && id) this.toggleLock(id);
    if (a === 'drop' && id) this.dropToSupport();
    if (a === 'focus' && id) this.focusSelection();
    if (a === 'center' && id) { const b = this.boxOf(id); this.moveBy(id, new T.Vector3(-(b.min.x + b.max.x) / 2, 0, -(b.min.z + b.max.z) / 2)); this.afterBulkMove(); }
    if (a === 'reset-rot' && id) { const st = this.getState(id); st.rot = [0, 0, 0]; this.applyState(id, st); this.recordEdit(id); this.renderPropsValues(); this.commit(); }
    if (a === 'aim' && id) {
      const o = this.objects.get(id);
      const b = this.contentBox();
      const c = b.isEmpty() ? new T.Vector3(0, 6, 0) : b.getCenter(new T.Vector3());
      o.model.root.lookAt(c);
      this.recordEdit(id);
      this.renderPropsValues();
      this.dirty = true;
      this.commit();
    }
    if (a === 'reseed' && id) { const o = this.objects.get(id); o.item.seed = Math.floor(Math.random() * 1000) + 1; this.build(o.item); this.commit(); }
    if (a === 'mods-reset' && id) { const o = this.objects.get(id); delete o.item.mods; this.build(o.item); this.renderProps(); this.commit(); }
    if (a === 'mat-reset' && id) { const o = this.objects.get(id); delete o.item.mat; delete o.item.tex; delete o.item.noShadow; this.build(o.item); this.renderProps(); this.commit(); }
    if (a === 'dup' && id) this.duplicate(id);
    if (a === 'del' && id) this.remove(id);
    if (a === 'glb') this.exportGlb();
    if (a === 'save-project') this.saveProject();
    if (a === 'open-project') this.openProject();
  }

  // ================================================================== export
  exportSize(choice, aspect) {
    const env = this.three.env;
    let ar = this.three.size.w / Math.max(1, this.three.size.h);
    if (env.aspect && env.aspect !== 'free') { const [a, b] = env.aspect.split(':').map(Number); ar = a / b; }
    if (aspect) ar = aspect;
    if (choice === 'view') return { w: Math.round(this.three.size.w * 2), h: Math.round(this.three.size.h * 2) };
    const short = Number(choice) || 1080;
    const even = (v) => Math.round(v / 2) * 2;
    return ar >= 1 ? { w: even(short * ar), h: even(short) } : { w: even(short), h: even(short / ar) };
  }

  photoSheet() {
    const ex = this.exportSettings();
    const sheet = openSheet('studio-photo', `
      <div class="sheet-head"><span class="sheet-icon">${icon('camera', 22)}</span><div><h2>Exporter une image</h2><p>Rendu de la scène telle qu'elle apparaît dans la vue, à l'instant ${fmtSec(this.time)} de l'animation.</p></div></div>
      <div class="sheet-body">
        <div class="field-label">Format</div>${seg('ex.format', ex.format, { png: 'PNG', jpg: 'JPG', webp: 'WebP', pdf: 'PDF' })}
        <div class="field-label">Définition</div>${seg('ex.size', ex.size, IMG_SIZES)}
        <div class="field-label">Qualité</div>${seg('ex.quality', ex.quality, { view: 'Aperçu (instantané)', high: 'Haute (anticrénelage ×4)', final: 'Rendu final (×16, ombres fines)' })}
        <label class="check-row" style="margin-top:12px"><input type="checkbox" data-ex-transparent ${ex.transparent ? 'checked' : ''}><span class="box"></span><span>Fond transparent (PNG, WebP)</span></label>
        <p class="sheet-note" data-ex-dims></p>
      </div>
      <div class="sheet-foot"><span class="grow"></span><button class="btn" data-sheet="close">Annuler</button><button class="btn primary" data-ex-go>${icon('camera', 14)}<span>Exporter</span></button></div>`);
    const dims = () => { const s = this.exportSize(ex.size); $('[data-ex-dims]', sheet).textContent = `${s.w} × ${s.h} pixels`; };
    dims();
    sheet.onclick = async (e) => {
      const s = e.target.closest('[data-set^="ex."]');
      if (s) { ex[s.dataset.set.slice(3)] = s.dataset.val; for (const x of s.parentElement.children) x.classList.toggle('on', x === s); dims(); persist(); return; }
      if (e.target.closest('[data-ex-go]')) { closeSheet(); await this.exportImage(ex); }
    };
    sheet.onchange = (e) => { if (e.target.matches('[data-ex-transparent]')) { ex.transparent = e.target.checked; persist(); } };
  }

  exportSettings() {
    settings.studioExport = {
      format: 'png', size: '2160', quality: 'high', transparent: false, vformat: 'mp4', vsize: '1080', ...(settings.studioExport || {}),
    };
    return settings.studioExport;
  }

  async exportImage(ex) {
    this.exportSettings();
    const { w, h } = this.exportSize(ex.size);
    const busy = toast(`Rendu ${w} × ${h}…`, { busy: true, sticky: true });
    try {
      this.editorVisible(false);
      await sleep(30);
      const transparent = ex.transparent && ex.format !== 'jpg' && ex.format !== 'pdf';
      const q = { view: { samples: 1, scale: 1 }, high: { samples: 4, scale: 1 }, final: { samples: 16, scale: 1.5, hiShadows: true } }[ex.quality] || { samples: 1, scale: 1 };
      if (q.samples > 1) busy.update && busy.update(`Rendu ${w} × ${h} (${ex.quality === 'final' ? 'final' : 'haute qualité'})…`);
      await sleep(20);
      const canvas = this.paintOverlay(await this.three.renderTo(w, h, { transparent, ...q }), this.time, true);
      this.editorVisible(true);
      this.dirty = true;
      const file = await saveCanvas(canvas, {
        format: ex.format, name: this.exportName(), project: S.source ? S.source.name : 'Studio', saveAs: false, background: this.three.env.bgColor || '#ffffff', pdfPages: 'single',
      });
      busy.close();
      if (!file) return null;
      settings.studioExport.last = `${FORMATS[ex.format].label} ${w} × ${h}`;
      persist();
      S.lastFile = file;
      toast(`Image enregistrée : ${FORMATS[ex.format].label}, ${w} × ${h} px`, { action: 'Afficher', onAction: () => api.invoke('shell:reveal', file) });
      return file;
    } catch (err) {
      busy.close();
      this.editorVisible(true);
      console.error(err);
      toast(`L'image n'a pas pu être exportée${err && err.message ? ` : ${err.message}` : ''}`, { kind: 'bad' });
      return null;
    }
  }

  exportName() {
    if (this.space === 'ad') {
      const a = this.adState();
      return `Publicité ${({ story: '9x16', portrait: '4x5', post: '1x1', wide: '16x9' })[a.format] || ''} ${this.sceneName()}`;
    }
    return `Studio ${this.sceneName()}`;
  }

  sceneName() {
    const d = this.order.map((id) => this.objects.get(id).item).filter((i) => i.type === 'device').map((i) => getDevice(i.deviceId, settings.custom).name.split(' / ')[0]);
    return d.slice(0, 3).join(', ') || 'scène';
  }

  videoSheet() {
    const ex = this.exportSettings();
    const animated = Object.keys(this.anim.tracks).length > 0;
    const sheet = openSheet('studio-video', `
      <div class="sheet-head"><span class="sheet-icon">${icon('film', 22)}</span><div><h2>Exporter une vidéo</h2><p>${animated ? `L'animation de ${fmtSec(this.anim.duration)} est calculée image par image, à ${this.anim.fps} images par seconde : la vidéo est fluide même sur un PC modeste.` : "La scène n'est pas animée : ajoute des clés ou une animation toute faite dans la frise du bas. La vidéo montrera sinon une image fixe."}</p></div></div>
      <div class="sheet-body">
        <div class="field-label">Format</div>${seg('ex.vformat', ex.vformat, { mp4: 'MP4 (H.264)', webm: 'WebM (VP9)' })}
        <div class="field-label">Définition</div>${seg('ex.vsize', ex.vsize, VIDEO_SIZES)}
        <p class="sheet-note" data-ex-dims></p>
      </div>
      <div class="sheet-foot"><span class="grow"></span><button class="btn" data-sheet="close">Annuler</button><button class="btn primary" data-ex-go>${icon('film', 14)}<span>Exporter la vidéo</span></button></div>`);
    const dims = () => { const s = this.exportSize(ex.vsize); $('[data-ex-dims]', sheet).textContent = `${s.w} × ${s.h} pixels, ${this.anim.fps} i/s, ${fmtSec(this.anim.duration)} (${Math.round(this.anim.duration * this.anim.fps)} images)`; };
    dims();
    sheet.onclick = async (e) => {
      const s = e.target.closest('[data-set^="ex."]');
      if (s) { ex[s.dataset.set.slice(3)] = s.dataset.val; for (const x of s.parentElement.children) x.classList.toggle('on', x === s); dims(); persist(); return; }
      if (e.target.closest('[data-ex-go]')) { closeSheet(); await this.exportVideo(ex); }
    };
  }

  async exportVideo(ex) {
    this.exportSettings();
    const size = this.exportSize(ex.vsize);
    const fps = this.anim.fps;
    const total = Math.max(1, Math.round(this.anim.duration * fps));
    const r = this.three.renderer;
    const cam = this.three.camera;
    const enc = await import('../capture/encoder.js');
    const {
      Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, CanvasSource, QUALITY_VERY_HIGH, canEncodeVideo,
    } = enc;
    let codec = ex.vformat === 'webm' ? 'vp9' : 'avc';
    if (!(await canEncodeVideo(codec, { width: size.w, height: size.h }))) codec = codec === 'avc' ? 'vp9' : 'avc';
    if (!(await canEncodeVideo(codec, { width: size.w, height: size.h }))) { toast("Ce PC ne sait pas encoder de vidéo à cette taille. Choisis une définition plus petite.", { kind: 'bad' }); return null; }
    const out = document.createElement('canvas');
    out.width = size.w;
    out.height = size.h;
    const octx = out.getContext('2d');
    const output = new Output({ format: codec === 'avc' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target: new BufferTarget() });
    const source = new CanvasSource(out, { codec, quality: QUALITY_VERY_HIGH, keyFrameInterval: 2 });
    output.addVideoTrack(source, { frameRate: fps });
    const feedMusic = await attachMusicTrack(enc, output, this.music, this.anim.duration, codec);
    await output.start();
    if (feedMusic) await feedMusic();
    if (this.playing) this.togglePlay();
    this.exporting = true;
    const busyEl = this.$.busy;
    busyEl.hidden = false;
    let cancel = false;
    busyEl.innerHTML = `<div class="st-busy-card glass"><div class="spinner"></div><b>Export de la vidéo</b><span data-prog>0 %</span><div class="st-prog"><i></i></div><button class="btn small" data-cancel>Annuler</button></div>`;
    busyEl.querySelector('[data-cancel]').onclick = () => { cancel = true; };
    const prev = { pr: r.getPixelRatio(), size: r.getSize(new T.Vector2()), aspect: cam.aspect, t: this.time };
    this.editorVisible(false);
    r.setPixelRatio(1);
    r.setSize(size.w, size.h, false);
    cam.aspect = size.w / size.h;
    cam.updateProjectionMatrix();
    this.three.fitBackgroundImage(cam.aspect);
    const t0 = performance.now();
    try {
      for (let i = 0; i < total && !cancel; i++) {
        this.time = i / fps;
        this.applyTime();
        // eslint-disable-next-line no-await-in-loop
        const seek = this.applyClips({ exact: true });
        // eslint-disable-next-line no-await-in-loop
        if (seek) await seek;
        this.three.draw();
        octx.clearRect(0, 0, size.w, size.h);
        octx.drawImage(r.domElement, 0, 0);
        this.paintOverlay(out, i / fps, false);
        // eslint-disable-next-line no-await-in-loop
        await source.add(i / fps, 1 / fps);
        if (i % 3 === 0) {
          const p = Math.round(((i + 1) / total) * 100);
          busyEl.querySelector('[data-prog]').textContent = `${p} % · ${i + 1} / ${total} images`;
          busyEl.querySelector('.st-prog i').style.width = `${p}%`;
          // eslint-disable-next-line no-await-in-loop
          await new Promise((res) => setTimeout(res, 0));
        }
      }
      if (cancel) { await output.cancel(); toast("Export de la vidéo annulé."); return null; }
      source.close();
      await output.finalize();
      const data = new Uint8Array(output.target.buffer);
      const file = await saveBytes(data, {
        kind: 'video', project: S.source ? S.source.name : 'Studio', name: this.exportName(), ext: codec === 'avc' ? 'mp4' : 'webm',
      });
      settings.studioExport.last = `${codec === 'avc' ? 'MP4' : 'WebM'} ${size.w} × ${size.h}`;
      persist();
      S.lastFile = file;
      toast(`Vidéo enregistrée : ${size.w} × ${size.h}, ${fmtTime(this.anim.duration * 1000)}, rendue en ${Math.round((performance.now() - t0) / 1000)} s`, { action: 'Afficher', onAction: () => api.invoke('shell:reveal', file) });
      return file;
    } catch (err) {
      console.error(err);
      toast("La vidéo n'a pas pu être exportée.", { kind: 'bad' });
      return null;
    } finally {
      r.setPixelRatio(prev.pr);
      r.setSize(prev.size.x, prev.size.y, false);
      cam.aspect = prev.aspect;
      cam.updateProjectionMatrix();
      this.three.fitBackgroundImage(prev.aspect);
      this.editorVisible(true);
      this.exporting = false;
      busyEl.hidden = true;
      this.setTime(prev.t);
      this.dirty = true;
      if (!this.raf) this.loop();
    }
  }

  async exportGlb() {
    const busy = toast('Export de la scène 3D…', { busy: true, sticky: true });
    try {
      const exporter = new T.GLTFExporter();
      this.editorVisible(false);
      let res;
      try { res = await exporter.parseAsync(this.three.content, { binary: true, onlyVisible: true, maxTextureSize: 4096 }); } finally { this.editorVisible(true); }
      const file = await saveBytes(new Uint8Array(res), { kind: 'photo', project: S.source ? S.source.name : 'Studio', name: `Studio ${this.sceneName()}`, ext: 'glb' });
      busy.close();
      toast('Scène 3D enregistrée (.glb) : ouvrable dans Blender, Spline, Womp ou Windows 3D Viewer', { action: 'Afficher', onAction: () => api.invoke('shell:reveal', file) });
    } catch (err) {
      busy.close();
      console.error(err);
      toast("La scène 3D n'a pas pu être exportée.", { kind: 'bad' });
    }
  }

  async saveProject() {
    const data = JSON.stringify(this.serialize({ withData: true }));
    const file = await saveBytes(new TextEncoder().encode(data), {
      kind: 'photo', project: S.source ? S.source.name : 'Studio', name: `Projet Studio ${this.sceneName()}`, ext: 'nexora3d', saveAs: true,
    });
    if (file) toast('Projet enregistré', { action: 'Afficher', onAction: () => api.invoke('shell:reveal', file) });
  }

  async openProject() {
    const f = await api.invoke('dialog:open-file', { title: 'Ouvrir un projet Studio', filters: [{ name: 'Projet NEX-STUDIO', extensions: ['nexora3d', 'vitrine3d', 'json'] }], asBytes: true });
    if (!f || !f.data) return;
    try {
      const data = JSON.parse(new TextDecoder().decode(f.data));
      await this.load(data);
      this.commit();
      toast(`Projet « ${f.name} » ouvert`);
    } catch (err) {
      console.error(err);
      toast("Ce fichier n'est pas un projet Studio valide.", { kind: 'bad' });
    }
  }

  // ================================================================== tests automatiques
  async autotest({ log, snap }) {
    const devs = this.order.filter((id) => this.objects.get(id).item.type === 'device');
    log(`studio : ${this.order.length} objets, ${devs.length} appareils, écrans : ${devs.map((id) => (this.pages.has(`${id}:main`) ? 'page' : this.pages.has(`${id}:cover`) ? 'externe' : 'fond')).join(', ')}`);
    await snap('51-studio-import');
    for (const [name, file] of [['duo', '52-duo'], ['foldopen', '53-pliable'], ['laptopphone', '54-portable'], ['hero', '55-vedette'], ['trio', '56-trio']]) {
      // eslint-disable-next-line no-await-in-loop
      await this.scenePreset(name);
      if (this.playing) this.togglePlay();
      this.setTime(name === 'foldopen' ? 1.4 : 0);
      // eslint-disable-next-line no-await-in-loop
      await sleep(700);
      // eslint-disable-next-line no-await-in-loop
      await snap(file);
    }
    // Pliable en cours de fermeture, vu de dos : écran externe et modules photo.
    await this.scenePreset('foldopen');
    if (this.playing) this.togglePlay();
    const fid = this.order[0];
    this.setTime(0);
    this.anim.tracks = {};
    this.applyState(fid, { rot: [0, 150, 0], fold: 60 });
    this.recordEdit(fid);
    this.frameAll(false);
    await sleep(600);
    await snap('57-pliable-dos');
    await this.scenePreset('duo');
    if (this.playing) this.togglePlay();
    this.select(this.order[0]);
    await this.applyAnimPreset('showcase');
    if (this.playing) this.togglePlay();
    this.setTime(this.anim.duration * 0.6);
    await sleep(600);
    await snap('58-animation');
    const img = await this.exportImage({ format: 'png', size: '1080', transparent: false });
    log(`studio image : ${img}`);
    const imgT = await this.exportImage({ format: 'webp', size: '1080', transparent: true });
    log(`studio image transparente : ${imgT}`);
    this.anim.duration = 2;
    const vid = await this.exportVideo({ vformat: 'mp4', vsize: '720' });
    log(`studio vidéo : ${vid}`);
    await this.exportGlb();
    log('studio glb exporté');
    // Détails des modèles : dos, pliables à mi-course, ordinateur, téléviseur.
    this.anim = newAnimation();
    const shots = [
      ['iphone-17', { rot: [8, 150, 0] }, '60-iphone-dos'],
      ['galaxy-s25-ultra', { rot: [8, 205, 0] }, '61-galaxy-dos'],
      ['pixel-9-pro', { rot: [8, 160, 0] }, '62-pixel-dos'],
      ['galaxy-z-flip8', { rot: [10, 30, 0], fold: 95 }, '63-flip-mi'],
      ['galaxy-z-flip8', { rot: [6, 0, 0], fold: 180, state: 'closed' }, '64-flip-ferme'],
      ['iphone-duo', { rot: [8, 35, 0], fold: 70 }, '65-duo-mi'],
      ['iphone-duo', { rot: [6, 0, 0], fold: 180 }, '66-duo-ferme'],
      ['galaxy-z-fold8', { rot: [6, 0, 0], fold: 180 }, '67-fold-ferme'],
      ['galaxy-z-trifold', { rot: [10, 20, 0], fold: 60 }, '68-trifold'],
      ['macbook-pro-14', { rot: [12, 25, 0] }, '69-macbook'],
      ['tv-65-webos', { rot: [5, 28, 0] }, '70-tv'],
      ['ipad-pro-11', { rot: [8, 160, 0] }, '71-ipad-dos'],
    ];
    for (const [dev, st, file] of shots) {
      for (const id of [...this.order]) this.remove(id, { history: false });
      // eslint-disable-next-line no-await-in-loop
      const it = await this.addDevice({ deviceId: dev, state: st.state, fold: st.fold }, { select: false, history: false });
      this.applyState(it.id, { rot: st.rot, fold: st.fold });
      this.recordEdit(it.id);
      this.setView('front', false);
      // eslint-disable-next-line no-await-in-loop
      await sleep(500);
      // eslint-disable-next-line no-await-in-loop
      await snap(file);
    }
  }
}

Studio.prototype.autotest4 = async function autotest4({ log, snap }) {
  const errs = [];
  const tryStep = async (name, fn) => { try { await fn(); } catch (e) { errs.push(`${name}: ${e.message}`); console.error(e); } };
  await this.scenePreset('hero');
  if (this.playing) this.togglePlay();
  this.anim = newAnimation();
  this.setTime(0);
  // Toutes les formes, en grille.
  const kinds = Object.keys(DECORS).filter((k) => !['image', 'glb', 'lumiere', 'mur', 'texte'].includes(k));
  for (const id of [...this.order]) this.remove(id, { history: false });
  let i = 0;
  for (const k of kinds) {
    // eslint-disable-next-line no-await-in-loop
    await tryStep(k, async () => {
      const it = this.addShape(k);
      const o = this.objects.get(it.id);
      await o.model.ready;
      const b = this.boxOf(it.id);
      const sz = b.getSize(new T.Vector3());
      const col = i % 8; const row = Math.floor(i / 8);
      this.applyState(it.id, { pos: [(col - 3.5) * 30, 0, row * 30 - 45], rot: [0, 0, 0], scale: Math.min(1.6, 22 / Math.max(sz.x, sz.y, sz.z, 1)) });
      this.recordEdit(it.id);
      i += 1;
    });
  }
  this.three.applyEnv({ ...this.three.env, ...AMBIANCES.apple[1] }, this.bgImageEl);
  this.setView('q34', false);
  this.frameAll(false, new T.Vector3(0, 0.9, 1));
  await sleep(900);
  log(`studio4 formes : ${kinds.length} (${kinds.join(',')})`);
  await snap('80-formes');
  // Matières
  for (const id of [...this.order]) this.remove(id, { history: false });
  const fins = Object.keys(FINISHES);
  fins.forEach((f, j) => this.addDecor({ kind: 'sphere', finish: f, color: ['#5e5ce6', '#ff6b6b', '#34c759', '#ffd60a', '#0a84ff'][j % 5], pos: [((j % 5) - 2) * 13, 0, Math.floor(j / 5) * 13 - 13] }, { select: false, history: false }));
  const tx = Object.keys(TEXTURES).filter((k) => k !== 'none' && k !== 'image');
  tx.forEach((k, j) => this.addDecor({ kind: 'cube', finish: 'satin', color: '#e9e4dc', tex: { kind: k, color2: '#3b3f47', scale: 1 }, pos: [(j - (tx.length - 1) / 2) * 11, 0, 30] }, { select: false, history: false }));
  this.three.applyEnv({ ...this.three.env, ...AMBIANCES.apple[1] }, this.bgImageEl);
  this.frameAll(false, new T.Vector3(0, 0.8, 1));
  await sleep(900);
  await snap('81-matieres');
  // Texte 3D, icônes, lumières, ambiance néon avec halo.
  for (const id of [...this.order]) this.remove(id, { history: false });
  await this.addDevice({ deviceId: 'iphone-17', pos: [0, 0, 0], rot: [0, -18, 0] }, { select: false, history: false });
  const t3 = this.addDecor({ kind: 'texte3d', text: 'NEXORA 1.0', font: 'inter', fontSize: 6, depth: 1.8, bevel: 0.3, color: '#ffffff', finish: 'chrome', pos: [0, 18, -6] }, { select: false, history: false });
  await this.objects.get(t3.id).model.ready;
  this.addDecor({ kind: 'icone3d', icon: 'heart', size: 8, color: '#ff2d95', finish: 'neon', pos: [-14, 2, 4] }, { select: false, history: false });
  this.addDecor({ kind: 'icone3d', icon: 'bolt', size: 8, color: '#00e5ff', finish: 'neon', pos: [14, 2, 4] }, { select: false, history: false });
  this.addDecor({ kind: 'podium', color: '#1b1730', finish: 'brillant', pos: [0, 0, 0] }, { select: false, history: false });
  this.addDecor({ kind: 'lumiere', lightType: 'spot', color: '#bf5af2', intensity: 1.4, angle: 26, penumbra: 0.5 }, { select: false, history: false });
  this.addDecor({ kind: 'lumiere', lightType: 'area', color: '#64d2ff', intensity: 1.2, width: 30, height: 10 }, { select: false, history: false });
  this.three.applyEnv({ ...this.three.env, ...AMBIANCES.neon[1] }, this.bgImageEl);
  this.frameAll(false, new T.Vector3(0.3, 0.35, 1));
  await sleep(1200);
  log(`studio4 texte3d : ${this.objects.get(t3.id).model.root.children.length} maillage(s), effets=${this.three.effectsOn}`);
  await snap('82-neon');
  // Sélection multiple, groupe, alignement, répartition, pose, copier-coller, verrou.
  const shapes = this.order.filter((id) => ['icone3d', 'texte3d'].includes(this.objects.get(id).item.kind));
  this.selectMany(shapes);
  log(`studio4 sélection=${this.selection().length} gizmo=${this.gizmo.object === this.pivot ? 'pivot' : 'objet'}`);
  this.align('y', 'floor');
  this.distribute('x');
  this.groupSelection();
  const g = this.objects.get(shapes[0]).item.group;
  this.copySelection();
  await this.paste();
  log(`studio4 groupe=${Boolean(g)} après collage : ${this.order.length} objets, sélection ${this.selection().length}`);
  // Glissement simulé du pivot : tous les objets suivent.
  const before = this.selection().map((id) => this.objects.get(id).model.root.position.x);
  this.beginMultiDrag();
  this.pivot.position.x += 10;
  this.onPivotChange();
  const after = this.selection().map((id) => this.objects.get(id).model.root.position.x);
  log(`studio4 pivot déplace tout : ${after.every((x, j) => Math.abs(x - before[j] - 10) < 1e-3)}`);
  this.toggleLock(this.sel);
  log(`studio4 verrouillé=${this.objects.get(this.sel).item.locked}`);
  this.dropToSupport();
  await this.undo();
  await this.redo();
  this.select(null);
  this.three.applyEnv({ ...this.three.env, ...AMBIANCES.cinema[1] }, this.bgImageEl);
  this.frameAll(false, new T.Vector3(0.3, 0.35, 1));
  await sleep(800);
  await snap('83-cinema');
  const img = await this.exportImage({ format: 'png', size: '1080', transparent: false });
  log(`studio4 export=${img} erreurs=${errs.length ? errs.join(' | ') : 'aucune'}`);
  // Panneaux d'inspecteur.
  const light = this.order.find((id) => this.objects.get(id).item.kind === 'lumiere');
  this.select(light);
  await sleep(200);
  await snap('84-props-lumiere');
  this.select(t3.id);
  const det = this.$.props.querySelector('details.st-adv'); if (det) det.open = true;
  await sleep(200);
  await snap('85-props-texte');
  this.select(null);
  await sleep(200);
  this.$.props.scrollTop = 400;
  await snap('86-props-scene');
};

installSpaces(Studio);
installManip(Studio);
installMedia(Studio);
installVoice(Studio);
installEditor(Studio);

// Un seul export à la fois (image, vidéo, 3D, présentation, pack) : un deuxième clic pendant un export
// en cours ne relance pas une deuxième tâche.
for (const k of ['exportImage', 'exportVideo', 'exportGlb']) {
  const f = Studio.prototype[k];
  if (!f) continue;
  Studio.prototype[k] = async function singleExport(...args) {
    if (this._exporting) { toast('Un export est déjà en cours…'); return null; }
    this._exporting = k;
    try { return await f.apply(this, args); } finally { this._exporting = null; }
  };
}
