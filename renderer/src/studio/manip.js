/* Studio : manipulation façon Spline — sélection multiple, groupes, verrouillage, magnétisme, alignement,
   répartition, pose au sol, copier-coller, déplacement au clavier, renommage et réorganisation des calques. */
import * as T from './three.js';
import { settings, persist } from '../core/settings.js';
import { uid, esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, showPopover, hidePopover } from '../core/ui.js';

const rad2deg = T.MathUtils.radToDeg;
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

export const SNAP_DEFAULT = {
  on: false, move: 1, rot: 15, scale: 0.05,
};

export function installManip(Studio) {
  const P = Studio.prototype;

  P.initManip = function initManip() {
    this.multi = new Set();
    this.pivot = new T.Object3D();
    this.pivot.name = 'pivot';
    this.three.scene.add(this.pivot);
    this.selGroup = new T.Group();
    this.selGroup.name = 'sélection';
    this.three.scene.add(this.selGroup);
    this.snap = { ...SNAP_DEFAULT, ...(settings.studioSnap || {}) };
    this.applySnap();
    this.gizmo.addEventListener('mouseDown', () => this.beginMultiDrag());
  };

  // Identifiants sélectionnés (l'objet principal en premier).
  P.selection = function selection() {
    if (this.multi && this.multi.size > 1) return [this.sel, ...[...this.multi].filter((x) => x !== this.sel)].filter((x) => this.objects.has(x));
    return this.sel && this.sel !== 'camera' && this.objects.has(this.sel) ? [this.sel] : [];
  };

  P.editorVisible = function editorVisible(v) {
    this.gizmo.getHelper().visible = v;
    if (this.selGroup) this.selGroup.visible = v;
    this.three.setEditorHelpers(v);
  };

  P.applySnap = function applySnap() {
    const s = this.snap;
    this.gizmo.setTranslationSnap(s.on ? s.move : null);
    this.gizmo.setRotationSnap(s.on ? T.MathUtils.degToRad(s.rot) : null);
    this.gizmo.setScaleSnap(s.on ? s.scale : null);
    const b = this.el.querySelector('[data-st="snap"]');
    if (b) b.classList.toggle('on', s.on);
  };

  P.snapMenu = function snapMenu(anchor) {
    const s = this.snap;
    const opt = (k, vals, unit) => `<div class="seg small" data-snapk="${k}">${vals.map((v) => `<button data-v="${v}" class="${Number(s[k]) === v ? 'on' : ''}">${v}${unit}</button>`).join('')}</div>`;
    const pop = showPopover(anchor, `<div class="pop-title">Magnétisme</div>
      <label class="check-row"><input type="checkbox" data-snap-on ${s.on ? 'checked' : ''}><span class="box"></span><span>Aligner sur la grille pendant les manipulations</span></label>
      <div class="st-field"><span>Déplacement</span>${opt('move', [0.5, 1, 2, 5], ' cm')}</div>
      <div class="st-field"><span>Rotation</span>${opt('rot', [5, 15, 45, 90], '°')}</div>
      <div class="st-field"><span>Taille</span>${opt('scale', [0.05, 0.1, 0.25], '')}</div>
      <p class="pop-note">Raccourci : <b>Maj</b> enfoncée pendant un glissement inverse le magnétisme.</p>`, { align: 'center', width: 300 });
    if (!pop) return;
    pop.onchange = (e) => { if (e.target.matches('[data-snap-on]')) { s.on = e.target.checked; this.saveSnap(); } };
    pop.onclick = (e) => {
      const b = e.target.closest('[data-snapk] [data-v]');
      if (!b) return;
      s[b.parentElement.dataset.snapk] = Number(b.dataset.v);
      s.on = true;
      for (const x of b.parentElement.children) x.classList.toggle('on', x === b);
      const cb = pop.querySelector('[data-snap-on]'); if (cb) cb.checked = true;
      this.saveSnap();
    };
  };

  P.saveSnap = function saveSnap() {
    settings.studioSnap = { ...this.snap };
    persist();
    this.applySnap();
  };

  P.toggleSpace = function toggleSpace() {
    const next = this.gizmo.space === 'local' ? 'world' : 'local';
    this.gizmo.setSpace(next);
    const b = this.el.querySelector('[data-st="space"]');
    if (b) { b.classList.toggle('on', next === 'local'); b.title = next === 'local' ? 'Axes de l’objet (cliquer pour les axes de la scène)' : 'Axes de la scène (cliquer pour les axes de l’objet)'; }
    toast(next === 'local' ? 'Manipulation selon les axes de l’objet' : 'Manipulation selon les axes de la scène');
  };

  // ------------------------------------------------------------------ sélection
  P.selectMany = function selectMany(ids, primary = ids[0]) {
    const list = ids.filter((x) => this.objects.has(x));
    if (list.length <= 1) { this.multi.clear(); this.select(list[0] || null); return; }
    this.multi = new Set(list);
    this.sel = list.includes(primary) ? primary : list[0];
    this.selectedKey = null;
    this.attachGizmo();
    this.renderList();
    this.renderProps();
    this.timeline.render();
    this.dirty = true;
  };

  P.toggleInSelection = function toggleInSelection(id) {
    const cur = new Set(this.selection());
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    const ids = [...cur];
    this.selectMany(ids, cur.has(id) ? id : ids[0]);
  };

  P.groupMembers = function groupMembers(id) {
    const o = this.objects.get(id);
    const g = o && o.item.group;
    if (!g) return [id];
    return this.order.filter((x) => this.objects.get(x).item.group === g);
  };

  P.attachGizmo = function attachGizmo() {
    const ids = this.selection().filter((x) => { const it = this.objects.get(x).item; return !it.hidden && !it.locked; });
    this.updateSelBoxes();
    if (this.playing) { this.gizmo.detach(); return; }
    if (ids.length > 1) {
      const box = new T.Box3();
      for (const id of ids) box.expandByObject(this.objects.get(id).model.root);
      this.pivot.position.copy(box.getCenter(new T.Vector3()));
      this.pivot.position.y = box.min.y;
      this.pivot.rotation.set(0, 0, 0);
      this.pivot.scale.set(1, 1, 1);
      this.pivot.updateMatrixWorld(true);
      this.gizmo.attach(this.pivot);
      this.beginMultiDrag();
    } else if (ids.length === 1) this.gizmo.attach(this.objects.get(ids[0]).model.root);
    else this.gizmo.detach();
  };

  P.beginMultiDrag = function beginMultiDrag() {
    if (this.gizmo.object !== this.pivot) return;
    this.pivot.updateMatrixWorld(true);
    this.dragStart = {
      inv: this.pivot.matrixWorld.clone().invert(),
      items: this.selection().filter((x) => !this.objects.get(x).item.locked).map((id) => { const r = this.objects.get(id).model.root; r.updateMatrix(); return [id, r.matrix.clone()]; }),
    };
  };

  // Le pivot commun a bougé : chaque objet suit la même transformation.
  P.onPivotChange = function onPivotChange() {
    if (!this.dragStart) this.beginMultiDrag();
    this.pivot.updateMatrixWorld(true);
    const D = this.pivot.matrixWorld.clone().multiply(this.dragStart.inv);
    const p = new T.Vector3(); const q = new T.Quaternion(); const s = new T.Vector3();
    for (const [id, M0] of this.dragStart.items) {
      const o = this.objects.get(id);
      const M = D.clone().multiply(M0);
      M.decompose(p, q, s);
      const r = o.model.root;
      r.position.copy(p);
      r.quaternion.copy(q);
      r.scale.setScalar((s.x + s.y + s.z) / 3);
      this.recordEdit(id);
    }
    this.updateSelBoxes();
  };

  P.updateSelBoxes = function updateSelBoxes() {
    if (!this.selGroup) return;
    for (const c of [...this.selGroup.children]) { this.selGroup.remove(c); if (c.geometry) c.geometry.dispose(); }
    const ids = this.selection();
    if (ids.length < 2) return;
    for (const id of ids) {
      const o = this.objects.get(id);
      if (o.item.hidden) continue;
      const h = new T.BoxHelper(o.model.root, id === this.sel ? 0x0a84ff : 0x64d2ff);
      h.material.depthTest = false;
      h.material.transparent = true;
      h.material.opacity = 0.85;
      h.renderOrder = 999;
      this.selGroup.add(h);
    }
  };

  // ------------------------------------------------------------------ verrouillage, groupes, renommage
  P.toggleLock = function toggleLock(id) {
    const o = this.objects.get(id);
    if (!o) return;
    o.item.locked = !o.item.locked;
    this.attachGizmo();
    this.renderList();
    this.renderProps();
    this.commit();
    toast(o.item.locked ? `${this.nameFor(o.item)} est verrouillé : il ne bouge plus et ne se sélectionne plus dans la vue` : `${this.nameFor(o.item)} est déverrouillé`);
  };

  P.groupSelection = function groupSelection() {
    const ids = this.selection();
    if (ids.length < 2) { toast('Sélectionne au moins deux objets (Maj + clic) pour les grouper.'); return; }
    const g = uid();
    for (const id of ids) this.objects.get(id).item.group = g;
    this.renderList();
    this.renderProps();
    this.commit();
    toast(`${ids.length} objets groupés : un clic dans la vue sélectionne tout le groupe (Alt + clic pour un seul objet)`);
  };

  P.ungroupSelection = function ungroupSelection() {
    const ids = this.selection();
    let n = 0;
    for (const id of ids) { const it = this.objects.get(id).item; if (it.group) { delete it.group; n += 1; } }
    if (!n) return;
    this.renderList();
    this.renderProps();
    this.commit();
    toast('Groupe dissocié');
  };

  P.renameRow = function renameRow(row) {
    const id = row.dataset.obj;
    const o = this.objects.get(id);
    const nameEl = row.querySelector('.st-name');
    if (!o || !nameEl) return;
    const inp = document.createElement('input');
    inp.className = 'input st-rename';
    inp.value = this.nameFor(o.item);
    nameEl.replaceWith(inp);
    inp.focus();
    inp.select();
    const done = (ok) => {
      if (inp.dataset.done) return;
      inp.dataset.done = '1';
      if (ok) { const v = inp.value.trim(); if (v) o.item.name = v.slice(0, 60); else delete o.item.name; this.commit(); }
      this.renderList();
      this.renderProps();
      this.timeline.render();
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); e.stopPropagation(); });
    inp.addEventListener('blur', () => done(true));
  };

  // Glisser-déposer dans la liste pour réordonner les calques.
  P.bindListDrag = function bindListDrag() {
    const L = this.$.list;
    let dragId = null;
    L.addEventListener('dragstart', (e) => {
      const r = e.target.closest('[data-obj]');
      if (!r) return;
      dragId = r.dataset.obj;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
      r.classList.add('dragging');
    });
    L.addEventListener('dragover', (e) => {
      if (!dragId) return;
      e.preventDefault();
      const r = e.target.closest('[data-obj]');
      for (const x of L.querySelectorAll('.drop-before,.drop-after')) x.classList.remove('drop-before', 'drop-after');
      if (r && r.dataset.obj !== dragId) {
        const b = r.getBoundingClientRect();
        r.classList.add(e.clientY < b.top + b.height / 2 ? 'drop-before' : 'drop-after');
      }
    });
    L.addEventListener('drop', (e) => {
      if (!dragId) return;
      e.preventDefault();
      const r = e.target.closest('[data-obj]');
      if (r && r.dataset.obj !== dragId) {
        const b = r.getBoundingClientRect();
        const after = e.clientY >= b.top + b.height / 2;
        const order = this.order.filter((x) => x !== dragId);
        const i = order.indexOf(r.dataset.obj) + (after ? 1 : 0);
        order.splice(i, 0, dragId);
        this.order = order;
        this.commit();
      }
      dragId = null;
      this.renderList();
      this.timeline.render();
    });
    L.addEventListener('dragend', () => { dragId = null; this.renderList(); });
  };

  // ------------------------------------------------------------------ alignement, répartition, pose
  P.boxOf = function boxOf(id) {
    const o = this.objects.get(id);
    const b = new T.Box3();
    o.model.root.updateMatrixWorld(true);
    o.model.root.traverse((m) => {
      if (!m.isMesh || m.userData.editorOnly || !m.geometry) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      b.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));
    });
    if (b.isEmpty()) b.setFromCenterAndSize(o.model.root.position.clone(), new T.Vector3(1, 1, 1));
    return b;
  };

  P.moveBy = function moveBy(id, d) {
    const o = this.objects.get(id);
    if (!o || o.item.locked) return;
    o.model.root.position.add(d);
    this.recordEdit(id);
  };

  P.align = function align(axis, where) {
    const ids = this.selection();
    if (ids.length < 2 && !(axis === 'y' && where === 'floor')) { toast('Sélectionne plusieurs objets (Maj + clic) pour les aligner.'); return; }
    const A = { x: 'x', y: 'y', z: 'z' }[axis];
    const all = new T.Box3();
    const boxes = ids.map((id) => { const b = this.boxOf(id); all.union(b); return [id, b]; });
    for (const [id, b] of boxes) {
      let target;
      if (where === 'min') target = all.min[A] - b.min[A];
      else if (where === 'max') target = all.max[A] - b.max[A];
      else if (where === 'floor') target = -b.min.y;
      else target = (all.min[A] + all.max[A]) / 2 - (b.min[A] + b.max[A]) / 2;
      const d = new T.Vector3(); d[A] = target;
      this.moveBy(id, d);
    }
    this.afterBulkMove();
  };

  P.distribute = function distribute(axis) {
    const ids = this.selection();
    if (ids.length < 3) { toast('Sélectionne au moins trois objets pour les répartir.'); return; }
    const A = axis;
    const boxes = ids.map((id) => [id, this.boxOf(id)]).sort((a, b) => a[1].min[A] - b[1].min[A]);
    const first = boxes[0][1]; const last = boxes[boxes.length - 1][1];
    const sizes = boxes.reduce((s, [, b]) => s + (b.max[A] - b.min[A]), 0);
    const gap = (last.max[A] - first.min[A] - sizes) / (boxes.length - 1);
    let cur = first.max[A] + gap;
    for (let i = 1; i < boxes.length - 1; i++) {
      const [id, b] = boxes[i];
      const d = new T.Vector3(); d[A] = cur - b.min[A];
      this.moveBy(id, d);
      cur += (b.max[A] - b.min[A]) + gap;
    }
    this.afterBulkMove();
  };

  // Pose chaque objet sélectionné sur ce qui se trouve en dessous (un socle, un autre objet) ou sur le sol.
  P.dropToSupport = function dropToSupport() {
    const ids = this.selection();
    if (!ids.length) return;
    for (const id of ids) {
      const b = this.boxOf(id);
      let top = 0;
      for (const other of this.order) {
        if (ids.includes(other)) continue;
        const it = this.objects.get(other).item;
        if (it.hidden || it.kind === 'mur' || it.kind === 'lumiere') continue;
        const ob = this.boxOf(other);
        const overlap = ob.max.x > b.min.x && ob.min.x < b.max.x && ob.max.z > b.min.z && ob.min.z < b.max.z;
        if (overlap && ob.max.y <= (b.min.y + b.max.y) / 2 + 0.01 && ob.max.y > top) top = ob.max.y;
      }
      this.moveBy(id, new T.Vector3(0, top - b.min.y, 0));
    }
    this.afterBulkMove();
  };

  P.afterBulkMove = function afterBulkMove() {
    this.attachGizmo();
    this.renderPropsValues();
    this.three.fitShadow();
    this.dirty = true;
    this.commitSoon();
  };

  P.commitSoon = function commitSoon() {
    clearTimeout(this.commitTimer);
    this.commitTimer = setTimeout(() => this.commit(), 350);
  };

  P.focusSelection = function focusSelection() {
    const ids = this.selection();
    if (!ids.length) { this.frameAll(true); return; }
    const box = new T.Box3();
    for (const id of ids) box.union(this.boxOf(id));
    this.frameAll(true, null, { box, pad: 1.6 });
  };

  P.selectAll = function selectAll() {
    const ids = this.order.filter((x) => { const it = this.objects.get(x).item; return !it.hidden && !it.locked; });
    this.selectMany(ids, ids[0]);
  };

  // ------------------------------------------------------------------ copier, coller, clavier
  P.copySelection = function copySelection() {
    const ids = this.selection();
    if (!ids.length) return;
    this.clip = ids.map((id) => {
      const it = { ...this.objects.get(id).item };
      delete it.imageEl; delete it.texImageEl;
      return { item: JSON.parse(JSON.stringify(it)), pages: ['main', 'cover'].map((k) => [k, this.pages.get(`${id}:${k}`)]).filter(([, p]) => p) };
    });
    toast(`${ids.length > 1 ? `${ids.length} objets copiés` : 'Objet copié'} (Ctrl+V pour coller)`);
  };

  P.paste = async function paste() {
    if (!this.clip || !this.clip.length) return;
    const groups = new Map();
    const made = [];
    for (const { item, pages } of this.clip) {
      const copy = JSON.parse(JSON.stringify(item));
      copy.id = uid();
      copy.pos = [copy.pos[0] + 5, copy.pos[1], copy.pos[2] + 3];
      if (copy.group) { if (!groups.has(copy.group)) groups.set(copy.group, uid()); copy.group = groups.get(copy.group); }
      if (copy.name) copy.name = `${copy.name} (copie)`;
      for (const [k, p] of pages) this.pages.set(`${copy.id}:${k}`, p);
      // eslint-disable-next-line no-await-in-loop
      if (copy.type === 'device') await this.addDevice(copy, { place: false, select: false, history: false });
      else this.addDecor(copy, { select: false, history: false });
      made.push(copy.id);
    }
    // Les prochains collages se décalent encore.
    for (const c of this.clip) c.item.pos = [c.item.pos[0] + 5, c.item.pos[1], c.item.pos[2] + 3];
    this.selectMany(made, made[0]);
    this.commit();
  };

  P.duplicateSelection = async function duplicateSelection() {
    const ids = this.selection();
    if (ids.length <= 1) { if (this.sel) await this.duplicate(this.sel); return; }
    const keep = this.clip;
    this.copySelection();
    await this.paste();
    this.clip = keep;
  };

  P.removeSelection = function removeSelection() {
    const ids = this.selection().filter((x) => !this.objects.get(x).item.locked);
    if (!ids.length) return;
    this.multi.clear();
    for (const id of ids) this.remove(id, { history: false });
    this.commit();
  };

  // Flèches : déplacement ; Maj ×10, Alt ×0,1 ; Page haut/bas : hauteur.
  P.nudge = function nudge(e) {
    const ids = this.selection();
    if (!ids.length) return false;
    const map = {
      arrowleft: [-1, 0, 0], arrowright: [1, 0, 0], arrowup: [0, 0, -1], arrowdown: [0, 0, 1], pageup: [0, 1, 0], pagedown: [0, -1, 0],
    };
    const v = map[e.key.toLowerCase()];
    if (!v) return false;
    const k = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    // Les flèches suivent l'orientation de la caméra (gauche/droite de l'écran).
    const cam = this.three.camera;
    const fwd = new T.Vector3(); cam.getWorldDirection(fwd); fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    const right = new T.Vector3().crossVectors(fwd, new T.Vector3(0, 1, 0)).normalize();
    // Arrondi à l'axe dominant pour garder des déplacements nets.
    const snapAxis = (w) => (Math.abs(w.x) > Math.abs(w.z) ? new T.Vector3(Math.sign(w.x), 0, 0) : new T.Vector3(0, 0, Math.sign(w.z)));
    const d = new T.Vector3()
      .addScaledVector(snapAxis(right), v[0])
      .addScaledVector(snapAxis(fwd), -v[2])
      .add(new T.Vector3(0, v[1], 0))
      .multiplyScalar(k);
    for (const id of ids) this.moveBy(id, d);
    this.afterBulkMove();
    return true;
  };

  // ------------------------------------------------------------------ panneau de la sélection multiple
  P.multiProps = function multiProps() {
    const ids = this.selection();
    const grouped = ids.every((x) => this.objects.get(x).item.group) && new Set(ids.map((x) => this.objects.get(x).item.group)).size === 1;
    const b = (a, ic, label, title = label) => `<button class="btn small" data-mp="${a}" title="${esc(title)}">${icon(ic, 13)}<span>${label}</span></button>`;
    return `<div class="st-head">${ids.length} objets sélectionnés</div>
      <section class="st-card">
        <div class="st-field"><span>Aligner (sur la sélection)</span></div>
        <div class="st-btns">${b('ax-min', 'alignH', 'Gauche')}${b('ax-center', 'alignH', 'Centre X')}${b('ax-max', 'alignH', 'Droite')}</div>
        <div class="st-btns">${b('az-min', 'alignV', 'Arrière')}${b('az-center', 'alignV', 'Centre Z')}${b('az-max', 'alignV', 'Avant')}</div>
        <div class="st-btns">${b('ay-floor', 'floor', 'Au sol')}${b('ay-min', 'alignV', 'Bas commun')}${b('ay-center', 'alignV', 'Milieu Y')}</div>
        <div class="st-field"><span>Répartir à intervalles égaux</span></div>
        <div class="st-btns">${b('dx', 'distribute', 'En largeur')}${b('dz', 'distribute', 'En profondeur')}${b('dy', 'distribute', 'En hauteur')}</div>
      </section>
      <section class="st-card">
        <div class="st-btns">${grouped ? b('ungroup', 'group', 'Dissocier', 'Ctrl+Maj+G') : b('group', 'group', 'Grouper', 'Ctrl+G')}${b('drop', 'floor', 'Poser', 'Pose chaque objet sur ce qui est en dessous')}${b('focus', 'target', 'Centrer la vue')}</div>
        <div class="st-btns">${b('dup', 'copy', 'Dupliquer')}${b('key', 'keyframe', 'Clé pour tous')}${b('del', 'trash', 'Supprimer')}</div>
        <p class="pop-note">Déplace, pivote ou agrandis l'ensemble avec les poignées. Flèches du clavier : déplacer (Maj ×10, Alt ×0,1), Page haut/bas : hauteur.</p>
      </section>`;
  };

  P.onMultiClick = async function onMultiClick(e) {
    const b = e.target.closest('[data-mp]');
    if (!b) return false;
    const a = b.dataset.mp;
    const m = /^a([xyz])-(\w+)$/.exec(a);
    if (m) this.align(m[1], m[2]);
    const d = /^d([xyz])$/.exec(a);
    if (d) this.distribute(d[1]);
    if (a === 'group') this.groupSelection();
    if (a === 'ungroup') this.ungroupSelection();
    if (a === 'drop') this.dropToSupport();
    if (a === 'focus') this.focusSelection();
    if (a === 'dup') await this.duplicateSelection();
    if (a === 'del') this.removeSelection();
    if (a === 'key') {
      for (const id of this.selection()) this.addKeyQuiet(id);
      this.timeline.render();
      this.commit();
      toast('Clé enregistrée pour chaque objet sélectionné');
    }
    return true;
  };

  P.selectionState = function selectionState() {
    return this.selection().map((id) => ({ id, ...this.getState(id) }));
  };

  void round; void rad2deg; void hidePopover;
}
