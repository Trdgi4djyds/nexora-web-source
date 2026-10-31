/* Studio : médias (vidéos, séquences d'images), calques 2D vectoriels et montage.
 *
 * Montage : chaque objet peut être limité à un « plan » (début, fin) avec une transition d'entrée et de sortie
 * (fondu, glissement, zoom). Les vidéos et séquences suivent la frise : leur image dépend du temps du plan,
 * à l'image près pendant l'export. Les plans se règlent dans le panneau de l'objet ou directement sur la frise. */
import * as T from './three.js';
import { api } from '../core/api.js';
import { settings, persist } from '../core/settings.js';
import { esc, uid, clamp } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, showPopover, hidePopover } from '../core/ui.js';
import { VECTOR_SHAPES, VECTOR_DEFAULTS, parseSvg } from './vector.js';

export const TRANSITIONS = {
  none: 'Aucune', fade: 'Fondu', slideL: 'Glisse depuis la gauche', slideR: 'Glisse depuis la droite', slideU: 'Monte', slideD: 'Descend', zoom: 'Zoom', pop: 'Apparition élastique',
};

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const back = (t) => { const c1 = 1.6; const c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };

function waitEvent(el, ev, ms = 3000) {
  return new Promise((res) => {
    const t = setTimeout(res, ms);
    el.addEventListener(ev, () => { clearTimeout(t); res(); }, { once: true });
  });
}

export function installMedia(Studio) {
  const P = Studio.prototype;

  // ================================================================== médias
  P.mediaStore = function mediaStore() { if (!this.media) this.media = new Map(); return this.media; };

  P.registerVideo = async function registerVideo(file, id = uid()) {
    const url = file.url || await api.invoke('media:url', file.path);
    if (!url) throw new Error(`Vidéo introuvable : ${file.path}`);
    const el = document.createElement('video');
    el.src = url;
    el.muted = true;
    el.playsInline = true;
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    el.loop = false;
    await waitEvent(el, 'loadeddata', 8000);
    if (!el.videoWidth) throw new Error('Cette vidéo ne peut pas être lue (format non pris en charge : essaie MP4 H.264 ou WebM).');
    const m = {
      kind: 'video', el, url, path: file.path, name: file.name, duration: el.duration || 0, aspect: el.videoWidth / el.videoHeight,
    };
    this.mediaStore().set(id, m);
    return id;
  };

  P.registerSequence = async function registerSequence(files, id = uid()) {
    const frames = [];
    for (const f of files) {
      // eslint-disable-next-line no-await-in-loop
      const url = f.url || await api.invoke('media:url', f.path);
      if (!url) continue;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      // eslint-disable-next-line no-await-in-loop
      try { await img.decode(); frames.push(img); } catch { /* image illisible */ }
    }
    if (!frames.length) throw new Error('Aucune image lisible dans cette séquence.');
    this.mediaStore().set(id, {
      kind: 'seq', frames, paths: files.map((f) => f.path), aspect: frames[0].naturalWidth / frames[0].naturalHeight,
    });
    return id;
  };

  // Rattache l'élément vidéo / les images à l'objet avant sa construction (rechargement compris).
  P.attachMedia = async function attachMedia(item) {
    const store = this.mediaStore();
    if (item.kind === 'video') {
      if (!store.has(item.mediaId) && item.mediaPath) { try { await this.registerVideo({ path: item.mediaPath, name: item.mediaName }, item.mediaId); } catch (e) { console.warn(e); } }
      const m = store.get(item.mediaId);
      item.videoEl = m ? m.el : null;
      if (m) item.aspect = m.aspect;
    }
    if (item.kind === 'sequence') {
      if (!store.has(item.mediaId) && item.mediaPaths && item.mediaPaths.length) { try { await this.registerSequence(item.mediaPaths.map((p) => ({ path: p })), item.mediaId); } catch (e) { console.warn(e); } }
      const m = store.get(item.mediaId);
      item.seqFrames = m ? m.frames : null;
      if (m) item.aspect = m.aspect;
    }
  };

  P.importMedia = async function importMedia(kind) {
    const files = await api.invoke('media:pick', { kind });
    if (!files || !files.length) return null;
    return this.addMediaFiles(kind, files);
  };

  P.addMediaFiles = async function addMediaFiles(kind, files) {
    const t = toast(kind === 'video' ? 'Ouverture de la vidéo…' : `Lecture de ${files.length} image(s)…`, { busy: true, sticky: true });
    try {
      let item;
      if (kind === 'video') {
        const id = await this.registerVideo(files[0]);
        const m = this.mediaStore().get(id);
        // Le plan commence à la tête de lecture ; la frise s'allonge si la vidéo dépasse.
        const start = this.time || 0;
        const len = Math.min(m.duration || 5, 600);
        if (start + len > this.anim.duration) this.setDuration(Math.min(600, Math.ceil(start + len)));
        item = this.addDecor({
          kind: 'video', mediaId: id, mediaPath: m.path, mediaName: m.name, aspect: m.aspect, height: 18, color: '#ffffff', clip: { start, end: start + len, trim: 0, tin: 'fade', tout: 'fade', fin: 0.4, fout: 0.4 },
        });
        toast(`${m.name} : ${len.toFixed(1).replace('.', ',')} s ajoutées à la frise.`);
      } else {
        const id = await this.registerSequence(files);
        const m = this.mediaStore().get(id);
        const fps = 12;
        const start = this.time || 0;
        const len = m.frames.length / fps;
        if (start + len > this.anim.duration) this.setDuration(Math.min(600, Math.ceil(start + len)));
        item = this.addDecor({
          kind: 'sequence', mediaId: id, mediaPaths: m.paths, aspect: m.aspect, fps, loop: false, height: 18, color: '#ffffff', clip: { start, end: start + len, tin: 'fade', tout: 'fade', fin: 0.3, fout: 0.3 },
        });
        toast(`Séquence de ${m.frames.length} images (${fps} i/s).`);
      }
      this.applyTime();
      this.timeline.render();
      return item;
    } catch (e) { toast(e.message, { kind: 'bad' }); return null; } finally { t.close(); }
  };

  // ================================================================== calques 2D
  P.vectorMenu = function vectorMenu(anchor) {
    const pop = showPopover(anchor, `<div class="pop-title">Formes 2D (vectorielles)</div><div class="decor-grid">${Object.entries(VECTOR_SHAPES).map(([k, [l, ic]]) => `<button class="decor-tile" data-vs="${k}">${icon(ic, 20)}<span>${esc(l)}</span></button>`).join('')}</div><p class="pop-note">Remplissage uni ou dégradé, contour, ombre et arrondis : nettes à toutes les tailles, dans la scène, la publicité ou une diapositive.</p>`, { align: 'start', width: 330 });
    if (!pop) return;
    pop.onclick = async (e) => {
      const b = e.target.closest('[data-vs]');
      if (!b) return;
      hidePopover();
      const shape = b.dataset.vs;
      if (shape === 'path') { await this.importSvgShape(); return; }
      this.addVector({ shape });
    };
  };

  P.addVector = function addVector(spec = {}) {
    const shape = spec.shape || 'round';
    const dims = {
      ellipse: [14, 14], star: [14, 14], polygon: [14, 14], burst: [14, 14], heart: [14, 13], arrow: [22, 9], line: [24, 0.6], triangle: [14, 12], bubble: [20, 14],
    }[shape] || [20, 12];
    const b = this.contentBox();
    const pos = spec.pos || (b.isEmpty() ? [0, 6, 2] : [Math.round((b.min.x + b.max.x) / 2), Math.round(b.max.y * 0.5), Math.round(b.max.z + 4)]);
    return this.addDecor({
      ...VECTOR_DEFAULTS, w: dims[0], h: dims[1], ...spec, kind: 'vecteur', shape, pos, color: spec.fill || VECTOR_DEFAULTS.fill, fill: spec.fill || VECTOR_DEFAULTS.fill, strokeW: shape === 'line' ? 0.6 : (spec.strokeW || 0), stroke: shape === 'line' ? (spec.stroke || '#1d1d1f') : (spec.stroke || ''),
    });
  };

  P.importSvgShape = async function importSvgShape() {
    const f = await api.invoke('dialog:open-file', { title: 'Importer un tracé SVG', filters: [{ name: 'SVG', extensions: ['svg'] }], asText: true });
    if (!f || !f.text) return;
    const svg = parseSvg(f.text);
    if (!svg) { toast('Aucun tracé (path) dans ce fichier SVG. Utilise « Importer › Image » pour un SVG complexe.', { kind: 'bad' }); return; }
    const ar = svg.vb[2] / svg.vb[3];
    this.addVector({
      shape: 'path', d: svg.d, vb: svg.vb, w: ar >= 1 ? 16 : 16 * ar, h: ar >= 1 ? 16 / ar : 16, fill: svg.fill && /^#|rgb/.test(svg.fill) ? svg.fill : '#1d1d1f',
    });
  };

  // ================================================================== montage : plans et transitions
  // Facteurs du plan à l'instant t : visibilité, opacité, décalage, échelle.
  P.clipState = function clipState(it, t) {
    const c = it.clip;
    if (!c) return { on: true, fade: 1, dx: 0, dy: 0, k: 1, local: t };
    if (t < c.start - 1e-6 || t > c.end + 1e-6) return { on: false, fade: 0, dx: 0, dy: 0, k: 1, local: 0 };
    const fin = Math.max(0, c.fin ?? 0.4); const fout = Math.max(0, c.fout ?? 0.4);
    const pin = fin > 0 ? clamp((t - c.start) / fin, 0, 1) : 1;
    const pout = fout > 0 ? clamp((c.end - t) / fout, 0, 1) : 1;
    const out = { on: true, fade: 1, dx: 0, dy: 0, k: 1, local: t - c.start };
    const apply = (kind, p, dir) => {
      if (p >= 1 || kind === 'none' || !kind) return;
      const e = ease(p);
      const dist = 12 * (1 - e);
      if (kind === 'fade') out.fade *= e;
      if (kind === 'slideL') { out.dx -= dist * dir; out.fade *= Math.min(1, e * 1.6); }
      if (kind === 'slideR') { out.dx += dist * dir; out.fade *= Math.min(1, e * 1.6); }
      if (kind === 'slideU') { out.dy -= dist * dir; out.fade *= Math.min(1, e * 1.6); }
      if (kind === 'slideD') { out.dy += dist * dir; out.fade *= Math.min(1, e * 1.6); }
      if (kind === 'zoom') { out.k *= 0.6 + 0.4 * e; out.fade *= e; }
      if (kind === 'pop') { out.k *= Math.max(0.01, back(p)); out.fade *= Math.min(1, p * 3); }
    };
    apply(c.tin || 'fade', pin, 1);
    apply(c.tout || 'fade', pout, -1);
    return out;
  };

  // Appliqué après les images clés : plans, fondus, image des vidéos et séquences.
  P.applyClips = function applyClips({ exact = false } = {}) {
    const t = this.time;
    const waits = [];
    for (const id of this.order) {
      const o = this.objects.get(id);
      if (!o) continue;
      const it = o.item;
      const media = it.kind === 'video' || it.kind === 'sequence';
      if (!it.clip && !media && (it.opacity ?? 1) >= 1 && o.fadeApplied == null) continue;
      const cs = this.clipState(it, t);
      const r = o.model.root;
      const visible = !it.hidden && cs.on;
      r.visible = visible;
      if (it.clip) {
        if (!this.anim.tracks[id]) { r.position.fromArray(it.pos); r.scale.setScalar(it.scale || 1); }
        if (cs.dx || cs.dy) { r.position.x += cs.dx; r.position.y += cs.dy; }
        if (cs.k !== 1) r.scale.multiplyScalar(cs.k);
      }
      if (o.model.setFade) { o.model.setFade(cs.fade); o.fadeApplied = cs.fade; }
      if (it.kind === 'video' && it.videoEl) {
        const v = it.videoEl;
        const dur = v.duration || 0;
        let lt = cs.local * (it.speed || 1) + (it.clip ? (it.clip.trim || 0) : 0);
        if (it.loop && dur) lt %= dur; else lt = Math.min(lt, Math.max(0, dur - 0.04));
        if (!visible) { if (!v.paused) v.pause(); continue; }
        if (exact) {
          if (Math.abs(v.currentTime - lt) > 0.5 / (this.anim.fps || 30)) { v.currentTime = lt; waits.push(waitEvent(v, 'seeked', 4000)); }
        } else if (this.playing) {
          v.playbackRate = it.speed || 1;
          if (v.paused) { v.currentTime = lt; v.play().catch(() => {}); } else if (Math.abs(v.currentTime - lt) > 0.35) v.currentTime = lt;
        } else {
          if (!v.paused) v.pause();
          if (Math.abs(v.currentTime - lt) > 0.05) v.currentTime = lt;
        }
      }
      if (it.kind === 'sequence' && it.seqFrames && o.model.mediaTex) {
        const n = it.seqFrames.length;
        let f = Math.floor(cs.local * (it.fps || 12));
        f = it.loop ? ((f % n) + n) % n : clamp(f, 0, n - 1);
        if (o.seqFrame !== f) { o.seqFrame = f; o.model.mediaTex.image = it.seqFrames[f]; o.model.mediaTex.needsUpdate = true; }
      }
    }
    this.dirty = true;
    return waits.length ? Promise.all(waits) : null;
  };

  // Arrête les vidéos (lecture arrêtée, espace quitté).
  P.pauseMedia = function pauseMedia() {
    for (const m of this.mediaStore().values()) if (m.kind === 'video' && !m.el.paused) m.el.pause();
  };

  // Plan par défaut quand on active le montage sur un objet : toute la durée.
  P.ensureClip = function ensureClip(it) {
    if (!it.clip) it.clip = { start: 0, end: this.anim.duration, tin: 'fade', tout: 'fade', fin: 0.4, fout: 0.4, trim: 0 };
    return it.clip;
  };

  // Enchaîne les plans sélectionnés (ou tous les plans) bout à bout, avec un chevauchement pour les transitions.
  P.sequenceClips = function sequenceClips(overlap = 0.4) {
    const items = this.order.map((id) => this.objects.get(id).item).filter((it) => it.clip);
    if (!items.length) { toast('Aucun plan à enchaîner : active « Plan » sur des objets.'); return; }
    items.sort((a, b) => a.clip.start - b.clip.start);
    let t = 0;
    for (const it of items) {
      const len = Math.max(0.2, it.clip.end - it.clip.start);
      it.clip.start = Math.max(0, t);
      it.clip.end = it.clip.start + len;
      t = it.clip.end - overlap;
    }
    const end = items[items.length - 1].clip.end;
    if (end > this.anim.duration) this.setDuration(Math.ceil(end));
    this.applyTime();
    this.timeline.render();
    this.renderProps();
    this.commit();
    toast(`${items.length} plans enchaînés (${end.toFixed(1).replace('.', ',')} s).`);
  };

  // ================================================================== caméra : contrôles à l'écran
  P.camNav = function camNav(action) {
    const cam = this.three.camera;
    const tg = this.controls.target;
    const off = cam.position.clone().sub(tg);
    const sph = new T.Spherical().setFromVector3(off);
    const step = Math.PI / 16;
    if (action === 'left') sph.theta -= step;
    if (action === 'right') sph.theta += step;
    if (action === 'up') sph.phi = clamp(sph.phi - step, 0.05, Math.PI - 0.05);
    if (action === 'down') sph.phi = clamp(sph.phi + step, 0.05, Math.PI - 0.05);
    if (action === 'in') sph.radius *= 0.85;
    if (action === 'out') sph.radius /= 0.85;
    if (action === 'panL' || action === 'panR' || action === 'panU' || action === 'panD') {
      const right = new T.Vector3().setFromMatrixColumn(cam.matrix, 0);
      const up = new T.Vector3().setFromMatrixColumn(cam.matrix, 1);
      const d = sph.radius * 0.08;
      const v = action === 'panL' ? right.multiplyScalar(-d) : action === 'panR' ? right.multiplyScalar(d) : action === 'panU' ? up.multiplyScalar(d) : up.multiplyScalar(-d);
      cam.position.add(v); tg.add(v);
    } else {
      off.setFromSpherical(sph);
      cam.position.copy(tg).add(off);
    }
    cam.lookAt(tg);
    this.controls.update();
    this.recordCameraIfAnimated();
    this.dirty = true;
  };

  P.renderCamNav = function renderCamNav() {
    if (!this.$.frame || this.$.frame.parentElement.querySelector('.st-camnav')) return;
    const box = document.createElement('div');
    box.className = `st-camnav glass${settings.camNavFolded ? ' folded' : ''}`;
    box.innerHTML = `
      <button class="cn-fold" data-cn="fold" title="Réduire / afficher la navigation caméra">${icon('camera', 13)}</button>
      <div class="cn-pad" title="Tourner autour de la scène">
        <button data-cn="up" title="Monter">${icon('chevronUp', 13)}</button>
        <button data-cn="left" title="Tourner à gauche">${icon('chevronLeft', 13)}</button>
        <button data-cn="frame" title="Tout cadrer (F)">${icon('target', 13)}</button>
        <button data-cn="right" title="Tourner à droite">${icon('chevronRight', 13)}</button>
        <button data-cn="down" title="Descendre">${icon('chevronDown', 13)}</button>
      </div>
      <div class="cn-col">
        <button data-cn="in" title="Zoom avant">${icon('plus', 13)}</button>
        <button data-cn="out" title="Zoom arrière">${icon('minus', 13)}</button>
      </div>
      <div class="cn-col">
        <button data-cn="panU" title="Déplacer la vue vers le haut">${icon('move', 13)}</button>
        <button data-cn="views" title="Points de vue (face, dessus, côté, trois-quarts)" aria-haspopup="true">${icon('eye', 13)}</button>
        <button data-cn="key" title="Enregistrer la caméra à cet instant (trajectoire)">${icon('keyframe', 13)}</button>
        <button data-cn="moves" title="Mouvements de caméra tout faits" aria-haspopup="true">${icon('video', 13)}</button>
      </div>`;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cn]');
      if (!b) return;
      const a = b.dataset.cn;
      if (a === 'fold') { settings.camNavFolded = !settings.camNavFolded; box.classList.toggle('folded', settings.camNavFolded); persist(); return; }
      if (a === 'frame') this.frameAll(true);
      else if (a === 'views') this.viewsMenu(b);
      else if (a === 'key') this.addKey('camera');
      else if (a === 'moves') this.cameraMovesMenu(b);
      else this.camNav(a);
    });
    // Maintien du bouton : le mouvement continue.
    let rep = null;
    box.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-cn]');
      if (!b || ['fold', 'frame', 'views', 'key', 'moves'].includes(b.dataset.cn)) return;
      clearInterval(rep);
      const a = b.dataset.cn;
      rep = setTimeout(() => { rep = setInterval(() => this.camNav(a), 60); }, 350);
      const stop = () => { clearTimeout(rep); clearInterval(rep); window.removeEventListener('pointerup', stop); };
      window.addEventListener('pointerup', stop);
    });
    this.$.frame.parentElement.append(box);
  };

  P.cameraMovesMenu = function cameraMovesMenu(anchor) {
    const MOVES = {
      orbit: ['Orbite', 'La caméra tourne autour de la scène'], dolly: ['Travelling avant', 'S’approche lentement du sujet'], pullback: ['Travelling arrière', 'Recule pour révéler la scène'], crane: ['Grue', 'Monte en regardant le sujet'], pan: ['Panoramique', 'Glisse de gauche à droite'], reveal: ['Révélation', 'Part de dessus et descend face au sujet'],
    };
    const pop = showPopover(anchor, `<div class="pop-title">Mouvements de caméra</div>${Object.entries(MOVES).map(([k, [l, h]]) => `<button class="menu-item" data-mv="${k}">${icon('video', 15)}<span><b>${l}</b><small>${h}</small></span></button>`).join('')}<p class="pop-note">Crée les images clés de la caméra sur toute la durée ; ajuste-les ensuite sur la frise.</p>`, { align: 'end', above: true, width: 300 });
    if (!pop) return;
    pop.onclick = (e) => { const b = e.target.closest('[data-mv]'); if (b) { hidePopover(); this.cameraMove(b.dataset.mv); } };
  };

  // Trajectoire de caméra : clés de début et de fin (et intermédiaires) autour de la position actuelle.
  P.cameraMove = function cameraMove(kind, { from = 0, to = this.anim.duration } = {}) {
    const cam = this.three.camera;
    const tg = this.controls.target.clone();
    const off = cam.position.clone().sub(tg);
    const sph = new T.Spherical().setFromVector3(off);
    const at = (s, target = tg) => ({ cpos: new T.Vector3().setFromSpherical(s).add(target).toArray().map((v) => Math.round(v * 1000) / 1000), ctarget: target.toArray(), fov: cam.fov });
    const keys = [];
    const S0 = sph.clone();
    if (kind === 'orbit') { for (let i = 0; i <= 4; i++) { const s = S0.clone(); s.theta += (-0.5 + i / 4) * 0.9; keys.push([i / 4, at(s), 'linear']); } }
    if (kind === 'dolly') { const a = S0.clone(); const b = S0.clone(); b.radius *= 0.72; keys.push([0, at(a)], [1, at(b), 'inOut']); }
    if (kind === 'pullback') { const a = S0.clone(); a.radius *= 0.65; keys.push([0, at(a)], [1, at(S0), 'out']); }
    if (kind === 'crane') { const a = S0.clone(); a.phi = clamp(a.phi + 0.35, 0.1, Math.PI - 0.1); const b = S0.clone(); b.phi = clamp(b.phi - 0.25, 0.1, Math.PI - 0.1); keys.push([0, at(a)], [1, at(b), 'inOut']); }
    if (kind === 'pan') {
      const right = new T.Vector3().setFromMatrixColumn(cam.matrix, 0).multiplyScalar(sph.radius * 0.35);
      keys.push([0, at(S0, tg.clone().sub(right))], [1, at(S0, tg.clone().add(right)), 'inOut']);
    }
    if (kind === 'reveal') { const a = S0.clone(); a.phi = 0.12; a.radius *= 1.2; keys.push([0, at(a)], [1, at(S0), 'out']); }
    this.anim.tracks.camera = (this.anim.tracks.camera || []).filter((k) => k.t < from - 1e-6 || k.t > to + 1e-6);
    for (const [f, v, ez] of keys) {
      const t = from + (to - from) * f;
      this.anim.tracks.camera.push({ t: Math.round(t * this.anim.fps) / this.anim.fps, ease: ez || 'inOut', v });
    }
    this.anim.tracks.camera.sort((a, b) => a.t - b.t);
    this.applyTime();
    this.timeline.render();
    this.commit();
    toast('Mouvement de caméra créé : lecture (Espace) pour le voir.');
  };
}

export { VECTOR_SHAPES, VECTOR_DEFAULTS };
