/* Studio façon éditeur 3D (noir et blanc) :
 * - vue 3D plein cadre sur grille, panneaux flottants, barre d'outils du bas (menu « Ajouter », outils rapides),
 *   barre de demande à l'IA, bouton « Rendu » ;
 * - grille de travail (repères au sol, absente des exports) et widget d'axes cliquable (X, Y, Z) ;
 * - menu du clic droit sur un objet (vue et liste des calques) ;
 * - grille visuelle des matières (vignettes rendues) ;
 * - rendu final haute qualité (sur-échantillonnage et accumulation d'images décalées). */
import * as T from './three.js';
import { settings, persist } from '../core/settings.js';
import { $, esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import {
  showPopover, hidePopover, toast,
} from '../core/ui.js';
import { finishMaterial, FINISHES } from './materials.js';

// Fond par défaut du Studio : noir profond, sol en ombre (le blanc des objets ressort).
export const DARK_ENV = {
  bg: 'studio', bgColor: '#0a0a0c', bgColor2: '#050506', floor: 'shadow', light: 'studio', exposure: 1, fog: null,
};

// ------------------------------------------------------------------ grille de travail
function gridMaterial() {
  return new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new T.Color('#ffffff') }, uFade: { value: 140 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform vec3 uColor; uniform float uFade; varying vec3 vW;
      float line(float v, float s){ float g = abs(fract(v / s - 0.5) - 0.5) / fwidth(v / s); return 1.0 - min(g, 1.0); }
      void main(){
        float minor = max(line(vW.x, 5.0), line(vW.z, 5.0)) * 0.10;
        float major = max(line(vW.x, 25.0), line(vW.z, 25.0)) * 0.22;
        float d = length(vW.xz);
        float fade = 1.0 - smoothstep(uFade * 0.35, uFade, d);
        float a = max(minor, major) * fade;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
}

export function installEditor(Studio) {
  const P = Studio.prototype;

  P.initEditor = function initEditor() {
    const view = this.$.view;
    const st = this.el.querySelector('.st');
    st.classList.add('st-editor');

    // Grille au sol (édition seulement).
    const grid = new T.Mesh(new T.PlaneGeometry(400, 400, 1, 1), gridMaterial());
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = 0.03;
    grid.renderOrder = -1;
    grid.userData.editorGrid = true;
    this.three.scene.add(grid);
    this.editorGrid = grid;
    const three = this.three;
    const origHelpers = three.setEditorHelpers.bind(three);
    three.setEditorHelpers = (v) => { origHelpers(v); grid.visible = v && settings.studioGrid !== false; };
    grid.visible = settings.studioGrid !== false;

    // Widget d'axes (cliquer sur un axe aligne la vue).
    try {
      this.viewHelper = new T.ViewHelper(this.three.camera, this.$.canvas);
    } catch (err) { console.warn('[axes]', err); this.viewHelper = null; }
    this.$.canvas.addEventListener('pointerup', (e) => {
      if (!this.viewHelper || e.button !== 0) return;
      this.placeViewHelper();
      if (this.viewHelper.handleClick(e)) { e.stopImmediatePropagation(); this.dirty = true; }
    }, true);

    // Barre du bas, bouton Rendu, demande à l'IA.
    view.insertAdjacentHTML('beforeend', `
      <div class="st-dock" id="stDock">
        <button class="st-dk add" data-ed="add" title="Ajouter (A)" aria-haspopup="true">${icon('plus', 18)}</button>
        <span class="st-dk-sep"></span>
        <button class="st-dk" data-st="add-device" title="Appareil">${icon('phone', 17)}</button>
        <button class="st-dk" data-st="add-decor" title="Forme 3D" aria-haspopup="true">${icon('cube', 17)}</button>
        <button class="st-dk" data-st="add-text" title="Texte" aria-haspopup="true">${icon('text', 17)}</button>
        <button class="st-dk" data-st="add-vector" title="Forme 2D (extrudable)" aria-haspopup="true">${icon('shapes', 17)}</button>
        <button class="st-dk" data-st="add-light" title="Lumière" aria-haspopup="true">${icon('bulb', 17)}</button>
        <button class="st-dk" data-st="import" title="Importer (image, modèle 3D, vidéo)" aria-haspopup="true">${icon('upload', 17)}</button>
        <span class="st-dk-sep"></span>
        <button class="st-dk${settings.studioGrid !== false ? ' on' : ''}" data-ed="grid" title="Grille de travail (G)">${icon('grid', 17)}</button>
        <button class="st-dk" data-ed="ai" title="Demander à l’IA">${icon('sparkle', 17)}</button>
      </div>
      <form class="st-prompt" id="stPrompt" hidden>
        <span class="st-prompt-ic">${icon('sparkle', 15)}</span>
        <input class="st-prompt-in" placeholder="Décris ce que tu veux : « deux téléphones sur un podium en verre, lumière néon »" spellcheck="false">
        <button class="st-prompt-go" title="Envoyer">${icon('forward', 15)}</button>
      </form>`);
    const tb = this.el.querySelector('.st-toolbar');
    if (tb) tb.insertAdjacentHTML('beforeend', `<button class="st-render" data-ed="render" title="Rendu final haute qualité (image)">${icon('sparkle', 14)}<span>Rendu</span></button>`);
    view.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ed]');
      if (!b) return;
      const a = b.dataset.ed;
      if (a === 'add') this.addMenu(b);
      if (a === 'grid') this.toggleGrid();
      if (a === 'ai') this.togglePrompt();
      if (a === 'render') this.renderSheet();
    });
    $('#stPrompt', this.el).addEventListener('submit', (e) => { e.preventDefault(); this.sendPrompt(); });

    // Menu du clic droit : dans la vue (sans glisser) et sur la liste des calques.
    let down = null;
    this.$.canvas.addEventListener('pointerdown', (e) => { if (e.button === 2) down = { x: e.clientX, y: e.clientY, t: Date.now() }; });
    this.$.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      this.pick({ clientX: e.clientX, clientY: e.clientY, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false });
      this.contextMenu(e.clientX, e.clientY);
    });
    this.$.list.addEventListener('contextmenu', (e) => {
      const r = e.target.closest('[data-obj]');
      if (!r) return;
      e.preventDefault();
      if (!(this.multi && this.multi.has(r.dataset.obj))) this.select(r.dataset.obj);
      this.contextMenu(e.clientX, e.clientY);
    });
    document.addEventListener('keydown', (e) => {
      if (!this.visible || settings.mode !== 'studio' || this.space === 'mockup') return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === ']' || e.key === '[')) {
        const ids = this.selection();
        if (ids.length) { e.preventDefault(); this.reorder(ids, e.key === ']' ? (e.shiftKey ? 'front' : 'forward') : (e.shiftKey ? 'back' : 'backward')); }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'g' || e.key === 'G') { e.preventDefault(); this.toggleGrid(); }
      if (e.key === 'a' || e.key === 'A') { e.preventDefault(); this.addMenu($('[data-ed="add"]', this.el)); }
    });

    // Panneaux flottants : la frise se place entre eux.
    const left = this.el.querySelector('.st-left');
    const right = this.el.querySelector('.st-right');
    const sync = () => {
      const lw = left && !left.classList.contains('pane-hidden') && left.offsetParent ? left.offsetWidth + 16 : 0;
      const rw = right && !right.classList.contains('pane-hidden') && right.offsetParent ? right.offsetWidth + 16 : 0;
      st.style.setProperty('--stl', `${lw}px`);
      st.style.setProperty('--str', `${rw}px`);
      this.dirty = true;
    };
    const ro = new ResizeObserver(sync);
    if (left) ro.observe(left);
    if (right) ro.observe(right);
    new MutationObserver(sync).observe(st, { subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    sync();

    // Studio noir et blanc : une scène encore sur l'ancien fond clair par défaut passe au fond noir (une fois).
    if (!settings.studioDarkV2) {
      const env = this.three.env || {};
      if ((env.bg === 'studio' && /^#ece?ef3$/i.test(env.bgColor || '')) || !env.bg) {
        this.three.applyEnv({ ...env, ...DARK_ENV });
        if (settings.studio && settings.studio.env) Object.assign(settings.studio.env, DARK_ENV);
      }
      settings.studioDarkV2 = true;
      persist();
      this.dirty = true;
    }
  };

  // Widget d'axes : coin haut droit de la vue, à gauche du panneau de droite.
  P.placeViewHelper = function placeViewHelper() {
    const vh = this.viewHelper;
    if (!vh) return;
    const cr = this.$.canvas.getBoundingClientRect();
    const right = this.el.querySelector('.st-right');
    let rgt = 14;
    if (right && right.offsetParent && !right.classList.contains('pane-hidden')) {
      const rr = right.getBoundingClientRect();
      if (rr.left < cr.right) rgt = Math.max(14, cr.right - rr.left + 14);
    }
    vh.location.top = 64;
    vh.location.right = rgt;
    vh.location.bottom = null;
    vh.location.left = null;
  };

  // Appelé après chaque image de la vue (pas pendant les exports).
  P.afterViewRender = function afterViewRender(dt) {
    const vh = this.viewHelper;
    if (!vh || this.space === 'mockup') return;
    if (vh.animating) { vh.update(dt || 0.016); this.dirty = true; }
    vh.center.copy(this.controls.target);
    this.placeViewHelper();
    const r = this.three.renderer;
    const ac = r.autoClear;
    r.autoClear = false;
    try { vh.render(r); } catch { /* contexte perdu */ }
    r.autoClear = ac;
  };

  P.toggleGrid = function toggleGrid() {
    settings.studioGrid = settings.studioGrid === false;
    persist();
    this.editorGrid.visible = settings.studioGrid !== false;
    const b = $('[data-ed="grid"]', this.el);
    if (b) b.classList.toggle('on', settings.studioGrid !== false);
    this.dirty = true;
  };

  // ------------------------------------------------------------------ menu « Ajouter »
  P.addMenu = function addMenu(anchor) {
    if (!anchor) return;
    const items = [
      ['add-device', 'phone', 'Appareil', 'Téléphone, tablette, ordinateur avec ton site'],
      ['add-decor', 'cube', 'Forme 3D', 'Podium, sphère, cube, socle, tore…'],
      ['add-text', 'text', 'Texte', 'Texte plat, en relief 3D, icône'],
      ['add-vector', 'shapes', 'Forme 2D', 'Rectangle, étoile, flèche… extrudable en volume'],
      ['add-light', 'bulb', 'Lumière', 'Ampoule, projecteur, soleil, panneau'],
      ['import', 'upload', 'Importer', 'Image, modèle 3D (.glb), vidéo, SVG'],
    ];
    const pop = showPopover(anchor, `<div class="pop-title">Ajouter</div>${items.map(([k, ic, l, d]) => `<button class="menu-item st-addi" data-add="${k}">${icon(ic, 16)}<span><b>${l}</b><small>${d}</small></span></button>`).join('')}`, { align: 'center', above: true, width: 300 });
    if (!pop) return;
    pop.onclick = (e) => {
      const b = e.target.closest('[data-add]');
      if (!b) return;
      hidePopover();
      const a = b.dataset.add;
      // Les sous-menus s'ouvrent à partir du même bouton.
      const fake = $(`[data-st="${a}"]`, $('#stDock', this.el)) || anchor;
      setTimeout(() => fake.click(), 0);
    };
  };

  // ------------------------------------------------------------------ IA
  P.togglePrompt = function togglePrompt(force) {
    const f = $('#stPrompt', this.el);
    f.hidden = force != null ? !force : !f.hidden;
    const b = $('[data-ed="ai"]', this.el);
    if (b) b.classList.toggle('on', !f.hidden);
    if (!f.hidden) $('.st-prompt-in', f).focus();
  };

  P.sendPrompt = async function sendPrompt() {
    const inp = $('.st-prompt-in', this.el);
    const text = inp.value.trim();
    if (!text) return;
    inp.value = '';
    try {
      const ai = await import('../core/ai.js');
      await ai.askAssistant(text);
    } catch (err) { toast(`L’IA n’a pas pu être jointe : ${err.message || err}`, { kind: 'bad' }); }
  };

  // ------------------------------------------------------------------ clic droit
  P.contextMenu = function contextMenu(x, y) {
    const sel = this.selection();
    const id = this.sel && this.sel !== 'camera' ? this.sel : null;
    const o = id ? this.objects.get(id) : null;
    const anchor = document.createElement('div');
    Object.assign(anchor.style, { position: 'fixed', left: `${x}px`, top: `${y}px`, width: '1px', height: '1px' });
    document.body.append(anchor);
    const row = (k, ic, l, kbd = '', dis = false) => `<button class="menu-item st-cm" data-cm="${k}" ${dis ? 'disabled' : ''}>${icon(ic, 15)}<span>${l}</span>${kbd ? `<kbd>${kbd}</kbd>` : ''}</button>`;
    const grouped = o && o.item.group;
    const html = !o ? `<div class="pop-title">Scène</div>
        ${row('add', 'plus', 'Ajouter…', 'A')}${row('frame', 'target', 'Cadrer toute la scène', 'F')}${row('paste', 'copy', 'Coller', 'Ctrl+V', !(this.clip && this.clip.length))}${row('grid', 'grid', settings.studioGrid !== false ? 'Masquer la grille' : 'Afficher la grille', 'G')}${row('render', 'sparkle', 'Rendu final…')}`
      : `<div class="pop-title">${esc(sel.length > 1 ? `${sel.length} objets` : this.nameFor(o.item))}</div>
        ${row('rename', 'text', 'Renommer', 'Double-clic', sel.length > 1)}
        ${row('dup', 'copy', 'Dupliquer', 'Ctrl+D')}
        ${row('copy', 'copy', 'Copier', 'Ctrl+C')}
        <div class="menu-sep"></div>
        ${row('forward', 'forward', 'Avancer d’un plan', 'Ctrl+]')}
        ${row('backward', 'back', 'Reculer d’un plan', 'Ctrl+[')}
        ${row('front', 'layers', 'Mettre au premier plan')}
        ${row('back', 'layers', 'Mettre à l’arrière-plan')}
        <div class="menu-sep"></div>
        ${sel.length > 1 ? row('group', 'grid', 'Grouper', 'Ctrl+G') : ''}${grouped ? row('ungroup', 'grid', 'Dégrouper', 'Ctrl+Maj+G') : ''}
        ${row('focus', 'target', 'Cadrer la sélection', '.')}
        ${row('drop', 'floor', 'Poser au sol', 'P')}
        ${row('hide', o.item.hidden ? 'eye' : 'eyeOff', o.item.hidden ? 'Afficher' : 'Masquer', 'H')}
        ${row('lock', o.item.locked ? 'unlock' : 'lock', o.item.locked ? 'Déverrouiller' : 'Verrouiller', 'Ctrl+L')}
        <div class="menu-sep"></div>
        ${row('del', 'trash', 'Supprimer', 'Suppr')}`;
    const pop = showPopover(anchor, html, { align: 'start', width: 250, onClose: () => anchor.remove() });
    if (!pop) { anchor.remove(); return; }
    pop.onclick = async (e) => {
      const b = e.target.closest('[data-cm]');
      if (!b || b.disabled) return;
      hidePopover();
      const a = b.dataset.cm;
      const ids = this.selection();
      if (a === 'add') this.addMenu($('[data-ed="add"]', this.el));
      if (a === 'frame') this.frameAll(true);
      if (a === 'grid') this.toggleGrid();
      if (a === 'render') this.renderSheet();
      if (a === 'paste') await this.paste();
      if (!o) return;
      if (a === 'rename') { const r = this.$.list.querySelector(`[data-obj="${CSS.escape(id)}"]`); if (r) this.renameRow(r); }
      if (a === 'dup') await this.duplicateSelection();
      if (a === 'copy') this.copySelection();
      if (['forward', 'backward', 'front', 'back'].includes(a)) this.reorder(ids, a);
      if (a === 'group') this.groupSelection();
      if (a === 'ungroup') this.ungroupSelection();
      if (a === 'focus') this.focusSelection();
      if (a === 'drop') this.dropToSupport();
      if (a === 'hide') for (const x of ids) this.toggleVisible(x);
      if (a === 'lock') for (const x of ids) this.toggleLock(x);
      if (a === 'del') this.removeSelection();
    };
  };

  /* Ordre des calques : position dans la liste et ordre d'affichage des calques 2D. */
  P.reorder = function reorder(ids, how) {
    const order = this.order.slice();
    const set = new Set(ids);
    if (how === 'front') this.order = [...order.filter((x) => !set.has(x)), ...order.filter((x) => set.has(x))];
    else if (how === 'back') this.order = [...order.filter((x) => set.has(x)), ...order.filter((x) => !set.has(x))];
    else {
      const step = how === 'forward' ? 1 : -1;
      const list = how === 'forward' ? [...ids].reverse() : ids;
      for (const x of list) {
        const i = this.order.indexOf(x);
        const j = i + step;
        if (i < 0 || j < 0 || j >= this.order.length || set.has(this.order[j])) continue;
        [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
      }
    }
    // Les calques 2D (formes, images, vidéos) suivent l'ordre de la liste.
    this.order.forEach((x, i) => {
      const ob = this.objects.get(x);
      if (ob && ['vecteur', 'image', 'video', 'sequence', 'texte'].includes(ob.item.kind)) {
        ob.item.layer = i;
        if (ob.model && ob.model.root) ob.model.root.traverse((m) => { if (m.isMesh) m.renderOrder = i; });
      }
    });
    this.renderList();
    this.commit();
    this.dirty = true;
  };

  // ------------------------------------------------------------------ matières en vignettes
  P.finishThumbs = function finishThumbs() {
    if (this._finishThumbs) return this._finishThumbs;
    if (this._finishThumbsPending) return null;
    this._finishThumbsPending = true;
    setTimeout(() => {
      try {
        const size = 96;
        const r = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        r.setSize(size, size, false);
        r.setPixelRatio(1);
        r.outputColorSpace = T.SRGBColorSpace;
        r.toneMapping = T.NeutralToneMapping;
        const scene = new T.Scene();
        const pm = new T.PMREMGenerator(r);
        scene.environment = pm.fromScene(new T.RoomEnvironment(), 0.04).texture;
        const cam = new T.PerspectiveCamera(30, 1, 0.1, 50);
        cam.position.set(0, 0, 4.1);
        const key = new T.DirectionalLight('#ffffff', 2);
        key.position.set(2, 3, 4);
        scene.add(key, new T.AmbientLight('#ffffff', 0.25));
        const geo = new T.SphereGeometry(1, 64, 48);
        const out = {};
        for (const k of Object.keys(FINISHES)) {
          const m = finishMaterial(k === 'or' ? '#ffffff' : '#d8d8dc', k);
          const mesh = new T.Mesh(geo, m);
          scene.add(mesh);
          r.render(scene, cam);
          out[k] = r.domElement.toDataURL('image/png');
          scene.remove(mesh);
          m.dispose();
        }
        geo.dispose();
        pm.dispose();
        r.dispose();
        r.forceContextLoss();
        this._finishThumbs = out;
        if (this.sel) { this._propsKey = null; this.renderProps(); }
      } catch (err) { console.warn('[vignettes]', err); this._finishThumbs = {}; }
    }, 30);
    return null;
  };

  P.finishGrid = function finishGrid(cur) {
    const th = this.finishThumbs() || {};
    return `<div class="st-finishes">${Object.entries(FINISHES).map(([k, l]) => `<button class="st-fin${cur === k ? ' on' : ''}" data-dset="finish" data-val="${k}" title="${esc(l)}">${th[k] ? `<img src="${th[k]}" alt="">` : '<i></i>'}<span>${esc(l)}</span></button>`).join('')}</div>`;
  };

  // ------------------------------------------------------------------ rendu final
  P.renderSheet = function renderSheet() {
    const ex = this.exportSettings();
    ex.quality = 'final';
    persist();
    this.photoSheet();
  };
}
