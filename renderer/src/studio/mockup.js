/* Studio › Maquettes : captures d'écran mises en valeur dans de vrais appareils, un navigateur ou en carte,
 * sur un fond travaillé, avec inclinaison 3D, ombres, textes, logo, effets et animation ; export image ou vidéo
 * aux formats des réseaux sociaux et des boutiques d'applications. */
import { api } from '../core/api.js';
import { S } from '../core/state.js';
import { $, esc, uid } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { settings, persist } from '../core/settings.js';
import { toast, showPopover, hidePopover } from '../core/ui.js';
import { DEVICES } from '../devices/catalog.js';
import { saveCanvas, saveBytes } from '../capture/export.js';
import {
  MK_FORMATS, MK_PRESETS, MK_STYLES, MK_LAYOUTS, MK_ANIMS, compose, pointInQuad,
} from './mockup-render.js';

// ------------------------------------------------------------------ médias (IndexedDB : les captures restent hors des réglages)
let dbP = null;
const db = () => dbP || (dbP = new Promise((res, rej) => { const r = indexedDB.open('vitrine-maquettes', 1); r.onupgradeneeded = () => r.result.createObjectStore('media'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
const idbPut = async (k, blob) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('media', 'readwrite'); t.objectStore('media').put(blob, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); };
const idbGet = async (k) => { const d = await db(); return new Promise((res) => { const t = d.transaction('media', 'readonly').objectStore('media').get(k); t.onsuccess = () => res(t.result || null); t.onerror = () => res(null); }); };

const TEMPLATES = {
  launch: ['Lancement produit', 'sparkle', { format: 'wide', layout: 'tilt', bg: { type: 'magic', seed: 4 }, texts: [{ text: 'Ton nouveau produit', size: 7.5, y: 0.07, color: '#ffffff', weight: 800 }] }],
  app: ['Application mobile', 'phone', { format: 'wide', layout: 'trio', bg: { type: 'gradient', c1: '#5e5ce6', c2: '#0a84ff', angle: 135 }, texts: [{ text: 'Disponible sur Android', size: 5, y: 0.05, color: '#ffffff' }] }],
  web: ['Site web', 'globe', { format: 'wide', layout: 'web', bg: { type: 'preset', preset: 'desk' }, overlay: 'shadow', texts: [] }],
  story: ['Story', 'film', { format: 'story', layout: 'single', bg: { type: 'preset', preset: 'aurora' }, texts: [{ text: 'Nouveau', size: 9, y: 0.06, weight: 800 }, { text: 'Découvre-le maintenant', size: 4.2, y: 0.88, weight: 500 }] }],
  store: ['Capture App Store', 'star', { format: 'appstore', layout: 'single', bg: { type: 'gradient', c1: '#ffb499', c2: '#8f5b86', angle: 160 }, texts: [{ text: 'Commande en 2 minutes', size: 7.2, y: 0.05, weight: 800 }] }],
  banner: ['Bannière Play Store', 'android', { format: 'play', layout: 'hero', bg: { type: 'preset', preset: 'sunset' }, texts: [] }],
  minimal: ['Épuré', 'frame', { format: 'square', layout: 'single', bg: { type: 'solid', color: '#f2f2f7' }, shadow: { mode: 'hug', opacity: 35 }, texts: [] }],
  iso: ['Vue de dessus', 'layers', { format: 'square', layout: 'flat', bg: { type: 'preset', preset: 'mint' }, texts: [] }],
};

function newDoc(name = 'Maquette 1') {
  return {
    id: uid(), name, format: 'wide', w: 1920, h: 1080, layout: 'tilt',
    bg: { type: 'solid', preset: 'glass', seed: 1, c1: '#eef1f6', c2: '#dfe4ee', angle: 135, color: '#eef1f6', blur: 0, dim: 0 },
    overlay: 'none', fx: { noise: 0, vignette: 0 },
    slots: [{ id: uid(), kind: 'device', device: 'iphone-18-pro', x: 0.52, y: 0.54, size: 0.84, rx: 10, ry: -22, rz: -4, style: 'default', radius: 'curved', shadow: { mode: 'spread', opacity: 40 }, gloss: 0, zoom: 1 }],
    texts: [], mark: { image: null, pos: 'br', size: 0.12, opacity: 0.85 }, anim: { preset: 'none', dur: 6 },
  };
}

const DEVICE_GROUPS = [['Téléphones', ['iphone', 'samsung', 'pixel', 'xiaomi', 'moto', 'huawei', 'transsion', 'bbk', 'foldable']], ['Tablettes', ['tablet']], ['Ordinateurs', ['pc', 'desktop']]];

export class MockupEditor {
  constructor(studio) {
    this.st = studio;
    this.media = new Map();
    this.sel = null;
    this.selText = null;
    this.hist = [];
    this.fut = [];
    this.playing = false;
    this.t = 0;
    this.hide = false;
  }

  get docs() { if (!Array.isArray(settings.studioMockups) || !settings.studioMockups.length) settings.studioMockups = [newDoc()]; return settings.studioMockups; }
  get doc() { return this.docs.find((d) => d.id === settings.studioMockupCur) || this.docs[0]; }

  // ------------------------------------------------------------------ entrée / sortie de l'espace
  get mode() { return settings.studioMockupMode === 'libre' ? 'libre' : 'scene'; }

  async enter() {
    const view = this.st.$.view;
    const st = this.st.el.querySelector('.st');
    if (this.mode === 'scene') {
      // Mise en scène : les maquettes du Responsive Lab (cadres réels), posées, animées, en scène photo.
      if (this.stage) this.stage.hidden = true;
      st.classList.remove('mk-on');
      st.classList.add('ps-on');
      const ps = await import('../viewer/poses.js');
      const emb = view.querySelector(':scope > .ps-embed');
      if (emb) emb.hidden = false;
      await ps.mountPoses(view, { onEmpty: async () => { const { setMode } = await import('../viewer/toolbar.js'); setMode('home'); } });
      return;
    }
    st.classList.remove('ps-on');
    const emb = view.querySelector(':scope > .ps-embed');
    if (emb) emb.hidden = true;
    if (!this.stage) {
      this.stage = document.createElement('div');
      this.stage.className = 'mk-stage';
      this.stage.innerHTML = `<canvas class="mk-canvas"></canvas>
        <div class="mk-bar glass">
          <button class="dock-btn small" data-mk="undo" title="Annuler (Ctrl+Z)">${icon('back', 16)}</button>
          <button class="dock-btn small" data-mk="redo" title="Rétablir (Ctrl+Maj+Z)">${icon('forward', 16)}</button>
          <span class="dock-sep"></span>
          <button class="dock-btn small" data-mk="add" title="Ajouter un emplacement">${icon('plus', 16)}</button>
          <button class="dock-btn small" data-mk="hide" title="Masquer la maquette (capture seule)">${icon('eye', 16)}</button>
          <button class="dock-btn small" data-mk="play" title="Aperçu de l’animation">${icon('play', 16)}</button>
          <span class="dock-sep"></span>
          <button class="dock-btn small" data-mk="png" title="Exporter l’image">${icon('camera', 16)}</button>
          <button class="dock-btn small" data-mk="video" title="Exporter la vidéo animée">${icon('film', 16)}</button>
        </div>
        <p class="mk-tip">Dépose ou colle (Ctrl+V) une capture sur un appareil · glisse pour déplacer · Maj + glisser pour incliner · molette pour la taille</p>`;
      view.append(this.stage);
      this.canvas = $('.mk-canvas', this.stage);
      this.bind();
    }
    this.stage.hidden = false;
    this.st.el.querySelector('.st').classList.add('mk-on');
    await this.loadMedia();
    this.ro = this.ro || new ResizeObserver(() => this.draw());
    this.ro.observe(view);
    this.draw();
  }

  leave() {
    if (this.stage) this.stage.hidden = true;
    this.playing = false;
    const st = this.st.el.querySelector('.st');
    st.classList.remove('mk-on', 'ps-on');
    const emb = this.st.$.view.querySelector(':scope > .ps-embed');
    if (emb) emb.hidden = true;
    import('../viewer/poses.js').then((ps) => ps.pausePoses());
    if (this.ro) this.ro.disconnect();
  }

  async loadMedia() {
    const keys = new Set();
    for (const d of this.docs) { for (const s of d.slots) if (s.media) keys.add(s.media); if (d.bg.image) keys.add(d.bg.image); if (d.mark && d.mark.image) keys.add(d.mark.image); }
    for (const k of keys) {
      if (this.media.has(k)) continue;
      // eslint-disable-next-line no-await-in-loop
      const blob = await idbGet(k);
      if (!blob) continue;
      // eslint-disable-next-line no-await-in-loop
      const el = await this.blobToMedia(blob);
      if (el) this.media.set(k, el);
    }
  }

  async blobToMedia(blob) {
    const url = URL.createObjectURL(blob);
    if (/^video\//.test(blob.type)) {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.src = url;
      await new Promise((r) => { v.onloadeddata = r; v.onerror = r; });
      v.width = v.videoWidth; v.height = v.videoHeight;
      return v.videoWidth ? v : null;
    }
    const im = new Image();
    im.src = url;
    try { await im.decode(); } catch { return null; }
    return im;
  }

  async addMediaBlob(blob) {
    const key = `m_${uid()}${Date.now().toString(36)}`;
    await idbPut(key, blob);
    const el = await this.blobToMedia(blob);
    if (!el) { toast('Ce fichier n’a pas pu être lu (image ou vidéo attendue).', { kind: 'bad' }); return null; }
    this.media.set(key, el);
    return key;
  }

  // ------------------------------------------------------------------ historique
  snapshot() { this.hist.push(JSON.stringify(this.doc)); if (this.hist.length > 60) this.hist.shift(); this.fut = []; }
  commit() { persist(); this.draw(); }
  change(fn) { this.snapshot(); fn(this.doc); this.commit(); }
  restore(json) { const d = JSON.parse(json); const i = this.docs.findIndex((x) => x.id === d.id); if (i >= 0) this.docs[i] = d; persist(); this.renderAll(); }
  undo() { if (!this.hist.length) return; this.fut.push(JSON.stringify(this.doc)); this.restore(this.hist.pop()); }
  redo() { if (!this.fut.length) return; this.hist.push(JSON.stringify(this.doc)); this.restore(this.fut.pop()); }

  renderAll() { this.st.renderSpaceLeft(); this.st.renderProps(); this.draw(); }

  // ------------------------------------------------------------------ dessin
  draw() {
    if (!this.canvas || this.stage.hidden) return;
    const d = this.doc;
    const [, fw, fh] = MK_FORMATS[d.format] || MK_FORMATS.wide;
    const W = d.format === 'custom' ? d.w : fw; const H = d.format === 'custom' ? d.h : fh;
    const box = this.stage.getBoundingClientRect();
    const avW = Math.max(100, box.width - 48); const avH = Math.max(100, box.height - 110);
    const k = Math.min(avW / W, avH / H);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(W * k * dpr); const ph = Math.round(H * k * dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) { this.canvas.width = pw; this.canvas.height = ph; }
    this.canvas.style.width = `${Math.round(W * k)}px`;
    this.canvas.style.height = `${Math.round(H * k)}px`;
    const ctx = this.canvas.getContext('2d');
    this.scale = pw / W;
    ctx.save();
    ctx.scale(pw / W, ph / H);
    try {
      this.hits = compose(ctx, d, W, H, {
        media: this.media, t: this.t, quality: Math.min(1.2, (pw / W) * 1.6), preview: true, selected: this.playing ? null : this.sel, selectedText: this.playing ? null : this.selText, hideMockup: this.hide,
      });
    } catch (err) { console.error(err); }
    ctx.restore();
    this.W = W; this.H = H;
  }

  // ------------------------------------------------------------------ interactions sur la maquette
  bind() {
    const cv = this.canvas;
    const pt = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * this.W, ((e.clientY - r.top) / r.height) * this.H]; };
    const hitAt = (x, y) => { for (let i = (this.hits || []).length - 1; i >= 0; i--) if (pointInQuad(x, y, this.hits[i].quad)) return this.hits[i].id; return null; };
    const textAt = (x, y) => { const th = (this.hits && this.hits.textHits) || []; for (let i = th.length - 1; i >= 0; i--) { const t = th[i]; const p = this.H * 0.02; if (x >= t.x - p && x <= t.x + t.w + p && y >= t.y - p && y <= t.y + t.h + p) return t.textId; } return null; };
    let drag = null;
    cv.addEventListener('pointerdown', (e) => {
      const [x, y] = pt(e);
      // Les textes sont au-dessus : on les attrape en priorité.
      const tid = textAt(x, y);
      if (tid) {
        this.selText = tid; this.sel = null; this.st.renderProps(); this.draw();
        const tx = this.doc.texts.find((q) => q.id === tid);
        this.snapshot();
        drag = { tx, x0: x, y0: y, sx: tx.x ?? 0.5, sy: tx.y ?? 0.08 };
        cv.setPointerCapture(e.pointerId);
        return;
      }
      this.selText = null;
      const id = hitAt(x, y);
      this.sel = id;
      this.st.renderProps();
      this.draw();
      if (!id) return;
      const s = this.doc.slots.find((q) => q.id === id);
      this.snapshot();
      drag = { s, x0: x, y0: y, sx: s.x, sy: s.y, rx: s.rx || 0, ry: s.ry || 0, tilt: e.shiftKey };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const [x, y] = pt(e);
      if (drag.tx) { drag.tx.x = Math.max(0, Math.min(1, drag.sx + (x - drag.x0) / this.W)); drag.tx.y = Math.max(0, Math.min(0.97, drag.sy + (y - drag.y0) / this.H)); this.draw(); return; }
      if (drag.tilt) { drag.s.ry = Math.max(-75, Math.min(75, drag.ry + ((x - drag.x0) / this.W) * 120)); drag.s.rx = Math.max(-75, Math.min(75, drag.rx - ((y - drag.y0) / this.H) * 120)); } else { drag.s.x = drag.sx + (x - drag.x0) / this.W; drag.s.y = drag.sy + (y - drag.y0) / this.H; }
      this.draw();
    });
    const end = () => { if (drag) { drag = null; persist(); this.st.renderProps(); } };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', (e) => {
      const s = this.doc.slots.find((q) => q.id === this.sel);
      if (!s) return;
      e.preventDefault();
      s.size = Math.max(0.1, Math.min(2.2, s.size * (e.deltaY < 0 ? 1.04 : 0.96)));
      this.draw(); clearTimeout(this.wheelT); this.wheelT = setTimeout(() => { persist(); this.st.renderProps(); }, 300);
    }, { passive: false });
    // Dépôt de fichiers : sur l'emplacement visé, sinon sur l'emplacement choisi, sinon le premier vide.
    this.stage.addEventListener('dragover', (e) => { e.preventDefault(); this.stage.classList.add('drop'); });
    this.stage.addEventListener('dragleave', () => this.stage.classList.remove('drop'));
    this.stage.addEventListener('drop', async (e) => {
      e.preventDefault(); this.stage.classList.remove('drop');
      const files = [...(e.dataTransfer.files || [])].filter((f) => /^(image|video)\//.test(f.type));
      if (!files.length) return;
      const [x, y] = pt(e);
      await this.placeFiles(files, hitAt(x, y));
    });
    document.addEventListener('paste', async (e) => {
      if (this.stage.hidden || settings.mode !== 'studio' || this.st.space !== 'mockup') return;
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const f = [...(e.clipboardData && e.clipboardData.files || [])].find((x) => /^(image|video)\//.test(x.type));
      if (!f) return;
      e.preventDefault();
      await this.placeFiles([f], this.sel);
    });
    this.stage.addEventListener('click', (e) => { const b = e.target.closest('[data-mk]'); if (b) this.action(b.dataset.mk, b); });
  }

  async placeFiles(files, targetId) {
    const d = this.doc;
    this.snapshot();
    let i = 0;
    for (const f of files) {
      // eslint-disable-next-line no-await-in-loop
      const key = await this.addMediaBlob(f);
      if (!key) continue;
      let s = (i === 0 && targetId && d.slots.find((q) => q.id === targetId)) || d.slots.find((q) => !q.media);
      if (!s) { s = { ...JSON.parse(JSON.stringify(d.slots[d.slots.length - 1] || newDoc().slots[0])), id: uid(), x: 0.5 + 0.05 * i, y: 0.5 }; d.slots.push(s); }
      s.media = key;
      // Capture d'ordinateur dans un téléphone : on propose le bon support automatiquement.
      const m = this.media.get(key);
      if (s.kind === 'device' && m && m.width / m.height > 1.2) { const dev = DEVICES.find((x) => x.id === s.device); if (dev && dev.w < 600) s.kind = 'browser'; }
      this.sel = s.id;
      i += 1;
    }
    persist();
    this.renderAll();
    toast(i > 1 ? `${i} captures placées.` : 'Capture placée.');
  }

  // ------------------------------------------------------------------ actions
  async action(a, btn) {
    const d = this.doc;
    if (a === 'undo') this.undo();
    else if (a === 'redo') this.redo();
    else if (a === 'hide') { this.hide = !this.hide; btn.classList.toggle('on', this.hide); this.draw(); }
    else if (a === 'add') this.change((doc) => { const base = doc.slots.find((q) => q.id === this.sel) || doc.slots[doc.slots.length - 1] || newDoc().slots[0]; const s = { ...JSON.parse(JSON.stringify(base)), id: uid(), media: null, x: Math.min(0.85, base.x + 0.12), z: (base.z || 0) + 1 }; doc.slots.push(s); this.sel = s.id; this.renderAll(); });
    else if (a === 'play') this.togglePlay(btn);
    else if (a === 'png') await this.exportImage();
    else if (a === 'batch') { for (const f of ['square', 'portrait', 'story', 'wide']) await this.exportImage({ format: f }); }
    else if (a === 'video') await this.exportVideo();
    void d;
  }

  togglePlay(btn) {
    if (this.playing) { this.playing = false; this.t = 0; this.draw(); if (btn) btn.innerHTML = icon('play', 16); return; }
    if (!this.doc.anim || this.doc.anim.preset === 'none') { toast('Choisis d’abord une animation (panneau de droite › Animation).'); return; }
    this.playing = true;
    if (btn) btn.innerHTML = icon('pause', 16);
    const t0 = performance.now();
    const loop = () => {
      if (!this.playing) return;
      const dur = this.doc.anim.dur || 6;
      this.t = ((performance.now() - t0) / 1000) % dur;
      for (const m of this.media.values()) if (m.tagName === 'VIDEO' && m.paused) m.play().catch(() => {});
      this.draw();
      requestAnimationFrame(loop);
    };
    loop();
  }

  size() {
    const d = this.doc;
    const [, fw, fh] = MK_FORMATS[d.format] || MK_FORMATS.wide;
    return d.format === 'custom' ? [d.w, d.h] : [fw, fh];
  }

  // L'export travaille sur une copie figée : on peut continuer à modifier la maquette pendant ce temps.
  async exportImage({ format } = {}) {
    const d = JSON.parse(JSON.stringify(this.doc));
    if (format) d.format = format;
    const ex = settings.mkExport || { format: 'png', scale: 1 };
    const [fw0, fh0] = [(MK_FORMATS[d.format] || MK_FORMATS.wide)[1], (MK_FORMATS[d.format] || MK_FORMATS.wide)[2]];
    const [W, H] = d.format === 'custom' ? [d.w, d.h] : [fw0, fh0];
    const sc = Math.max(1, Math.min(4, Number(ex.scale) || 1, 8192 / Math.max(W, H)));
    const c = document.createElement('canvas'); c.width = Math.round(W * sc); c.height = Math.round(H * sc);
    const ctx = c.getContext('2d');
    const busy = toast('Rendu de la maquette…', { busy: true, sticky: true });
    try {
      await new Promise((r) => setTimeout(r, 30));
      ctx.scale(sc, sc);
      compose(ctx, d, W, H, { media: this.media, t: d.anim && d.anim.preset !== 'none' ? (d.anim.dur || 6) * 0.5 : 0, quality: Math.min(3, sc * 1.6) });
      const file = await saveCanvas(c, { format: ex.format || 'png', name: `Maquette ${d.name}${format ? ` ${(MK_FORMATS[format] || [''])[0]}` : ''}`, project: S.source ? S.source.name : 'Studio', background: '#ffffff' });
      if (file) toast(`Image enregistrée : ${c.width} × ${c.height}.`, { action: 'Afficher', onAction: () => api.invoke('shell:reveal', file) });
    } finally { busy.close(); }
  }

  async exportVideo() {
    const d = JSON.parse(JSON.stringify(this.doc));
    if (!d.anim || d.anim.preset === 'none') { toast('Choisis une animation (panneau de droite › Animation) pour exporter une vidéo.', { kind: 'bad' }); return; }
    const [W0, H0] = this.size();
    const k = Math.min(1, 1920 / Math.max(W0, H0));
    const W = Math.round(W0 * k / 2) * 2; const H = Math.round(H0 * k / 2) * 2;
    const enc = await import('../capture/encoder.js');
    const {
      Output, Mp4OutputFormat, BufferTarget, CanvasSource, QUALITY_VERY_HIGH, canEncodeVideo,
    } = enc;
    if (!(await canEncodeVideo('avc', { width: W, height: H }))) { toast('Ce PC ne sait pas encoder de vidéo à cette taille.', { kind: 'bad' }); return; }
    const fps = 30; const dur = d.anim.dur || 6; const total = Math.round(dur * fps);
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const octx = out.getContext('2d');
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const source = new CanvasSource(out, { codec: 'avc', quality: QUALITY_VERY_HIGH, keyFrameInterval: 2 });
    output.addVideoTrack(source, { frameRate: fps });
    await output.start();
    const busy = toast('Export de la vidéo : 0 %', { busy: true, sticky: true });
    const wasPlaying = this.playing; this.playing = false;
    try {
      for (let i = 0; i < total; i++) {
        const t = i / fps;
        for (const m of this.media.values()) {
          if (m.tagName === 'VIDEO' && m.duration) {
            m.pause(); m.currentTime = t % m.duration;
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) => { const f = () => { m.removeEventListener('seeked', f); r(); }; m.addEventListener('seeked', f); setTimeout(r, 400); });
          }
        }
        octx.setTransform(k, 0, 0, k, 0, 0);
        compose(octx, d, W0, H0, { media: this.media, t, quality: 1.3 });
        // eslint-disable-next-line no-await-in-loop
        await source.add(t, 1 / fps);
        if (i % 6 === 0) { busy.update(`Export de la vidéo : ${Math.round((i / total) * 100)} %`); await new Promise((r) => setTimeout(r, 0)); }
      }
      source.close();
      await output.finalize();
      const file = await saveBytes(new Uint8Array(output.target.buffer), { kind: 'video', project: S.source ? S.source.name : 'Studio', name: `Maquette ${d.name}`, ext: 'mp4' });
      toast(`Vidéo enregistrée : ${W} × ${H}, ${dur} s.`, { action: 'Afficher', onAction: () => api.invoke('shell:reveal', file) });
    } catch (err) {
      console.error(err);
      toast('La vidéo n’a pas pu être exportée.', { kind: 'bad' });
    } finally { busy.close(); if (wasPlaying) this.togglePlay(); }
  }

  // Capture du site ouvert à la taille de l'appareil choisi (ou en ordinateur pour un navigateur).
  async captureSite(slot) {
    const url = this.st.siteUrl ? this.st.siteUrl() : (S.source && S.source.url);
    if (!url) { toast('Ouvre d’abord un site (Accueil ou Responsive Lab).', { kind: 'bad' }); return; }
    const dev = DEVICES.find((x) => x.id === slot.device);
    const desktop = slot.kind !== 'device' || !dev || dev.w >= 1000;
    const w = desktop ? 1440 : dev.w; const h = desktop ? 900 : dev.h;
    const t = toast('Capture du site…', { busy: true, sticky: true });
    try {
      const r = await api.invoke('lab:snap-url', { url, width: w, height: h, dpr: desktop ? 1 : 2, mobile: !desktop, full: Boolean(slot.full), maxHeight: 7000, wait: 900 });
      const blob = await (await fetch(r.data)).blob();
      const key = await this.addMediaBlob(blob);
      if (!key) return;
      this.change(() => { slot.media = key; if (slot.kind === 'browser') { try { slot.url = new URL(url).host; } catch { /* adresse */ } } });
      this.st.renderProps();
    } catch (err) { toast(err.message || 'Capture impossible.', { kind: 'bad' }); } finally { t.close(); }
  }

  applyLayout(name, doc = this.doc) {
    const L = MK_LAYOUTS[name];
    if (!L) return;
    const old = doc.slots;
    doc.layout = name;
    doc.slots = L[1].map((g, i) => {
      const prev = old[i] || old[0] || newDoc().slots[0];
      return {
        ...prev, id: (old[i] && old[i].id) || uid(), media: old[i] ? old[i].media : null, rx: 0, ry: 0, rz: 0, z: 0, ...g, kind: g.kind || (prev.kind === 'browser' && !g.kind && name !== 'web' ? prev.kind : prev.kind || 'device'), device: g.device || prev.device || 'iphone-18-pro',
      };
    });
    if (name === 'web') doc.slots[0].kind = 'browser';
    if (name === 'grid') doc.slots.forEach((s) => { s.kind = 'screen'; });
    if (['single', 'tilt', 'flat', 'duo', 'trio', 'cascade'].includes(name)) doc.slots.forEach((s) => { if (s.kind === 'screen') s.kind = 'device'; });
  }

  applyTemplate(key) {
    const [, , tpl] = TEMPLATES[key];
    this.change((d) => {
      d.format = tpl.format;
      this.applyLayout(tpl.layout, d);
      d.bg = { ...d.bg, ...tpl.bg };
      d.overlay = tpl.overlay || 'none';
      d.texts = (tpl.texts || []).map((t) => ({ id: uid(), font: 'sans', color: '#ffffff', weight: 700, align: 'center', x: 0.5, shadow: true, ...t }));
      if (tpl.shadow) d.slots.forEach((s) => { s.shadow = { ...tpl.shadow }; });
    });
    this.renderAll();
  }

  // ------------------------------------------------------------------ panneau de gauche
  modeHtml() {
    return `<div class="seg wide mk-modes">${[['scene', 'Mise en scène', 'wand'], ['libre', 'Composition libre', 'frame']].map(([k, l, ic]) => `<button class="${this.mode === k ? 'on' : ''}" data-mkmode="${k}">${icon(ic, 13)}<span>${l}</span></button>`).join('')}</div>`;
  }

  sceneLeftHtml() {
    const board = S.board;
    const views = board ? board.list.filter((v) => v.url) : [];
    const ps = this.psMod;
    const cur = ps ? ps.currentPhotoScene() : 'studio';
    return `${this.modeHtml()}
      <div class="st-head st-head-row"><span>Appareils</span><button class="icon-btn small" data-mkps="recapture" title="Reprendre les captures">${icon('refreshCw', 14)}</button></div>
      <div class="mk-devs">${views.length ? views.map((v) => `<div class="mk-dev">${icon(/tablet|ipad|tab/i.test(v.cfg.deviceId) ? 'tablet' : /mac|pc|desktop|laptop/i.test(v.cfg.deviceId) ? 'laptop' : 'phone', 14)}<span>${esc(board.describe(v))}</span></div>`).join('') : '<p class="mk-note">Aucun site ouvert.</p>'}</div>
      <div class="st-btns"><button class="btn small" data-mkps="lab">${icon('multi', 13)}<span>Changer les appareils</span></button></div>
      <div class="st-head">Scènes photo réalistes</div>
      <div class="ps-scenes mk-scenes">${ps ? Object.entries(ps.PHOTO_SCENES).map(([k, [l]]) => `<button class="ps-scene${cur === k ? ' on' : ''}" data-mkscene="${k}" title="${esc(l)}"><i style="${ps.photoSceneThumb(k)}"></i><span>${esc(l)}</span></button>`).join('') : ''}</div>
      <p class="mk-note">Les maquettes reprennent exactement les appareils, cadres et couleurs du Responsive Lab.</p>`;
  }

  leftHtml() {
    if (this.mode === 'scene') {
      if (!this.psMod) import('../viewer/poses.js').then((m) => { this.psMod = m; this.st.renderSpaceLeft(); });
      return this.sceneLeftHtml();
    }
    const d = this.doc;
    return `${this.modeHtml()}
      <div class="st-head st-head-row"><span>Maquettes</span><button class="icon-btn small" data-mkl="new" title="Nouvelle maquette">${icon('plus', 14)}</button></div>
      <div class="st-decks">${this.docs.map((x) => `<button class="st-deck${x.id === d.id ? ' on' : ''}" data-mkl-open="${esc(x.id)}"><span class="st-deck-th">${icon('image', 14)}</span><span class="st-deck-t"><b>${esc(x.name)}</b><small>${esc((MK_FORMATS[x.format] || MK_FORMATS.wide)[0])} · ${x.slots.length} élément${x.slots.length > 1 ? 's' : ''}</small></span></button>`).join('')}</div>
      <div class="st-btns"><button class="btn small" data-mkl="rename" title="Renommer">${icon('text', 13)}</button><button class="btn small" data-mkl="dup" title="Dupliquer">${icon('copy', 13)}</button><button class="btn small" data-mkl="del" title="Supprimer" ${this.docs.length < 2 ? 'disabled' : ''}>${icon('trash', 13)}</button></div>
      <div class="st-head">Modèles prêts à l’emploi</div>
      <div class="mk-tpls">${Object.entries(TEMPLATES).map(([k, [l, ic]]) => `<button class="mk-tpl" data-mkl-tpl="${k}">${icon(ic, 15)}<span>${esc(l)}</span></button>`).join('')}</div>
      <div class="st-head">Mise en page</div>
      <div class="mk-lays">${Object.entries(MK_LAYOUTS).map(([k, [l, slots]]) => `<button class="mk-lay${d.layout === k ? ' on' : ''}" data-mkl-lay="${k}" title="${esc(l)}">${this.layoutIcon(slots)}<span>${esc(l)}</span></button>`).join('')}</div>
      <div class="st-head">Format</div>
      <div class="mk-formats">${Object.entries(MK_FORMATS).map(([k, [l, w, h]]) => `<button class="mk-fmt${d.format === k ? ' on' : ''}" data-mkl-fmt="${k}" title="${esc(l)}${k === 'custom' ? '' : ` · ${w} × ${h}`}"><i style="aspect-ratio:${w}/${h}"></i><span>${esc(l)}</span></button>`).join('')}</div>
      ${d.format === 'custom' ? `<div class="mk-row"><label class="field"><span>Largeur</span><input class="input" type="number" min="200" max="8000" data-mkf="w" value="${d.w}"></label><label class="field"><span>Hauteur</span><input class="input" type="number" min="200" max="8000" data-mkf="h" value="${d.h}"></label></div>` : ''}`;
  }

  layoutIcon(slots) {
    return `<svg viewBox="0 0 40 26" class="mk-layico">${slots.map((s) => { const w = 8 * s.size * (s.kind === 'browser' || s.device === 'macbook-pro-14' ? 2.2 : s.kind === 'screen' ? 1.6 : 1); const h = 16 * s.size * (s.kind === 'browser' || s.device === 'macbook-pro-14' ? 0.75 : s.kind === 'screen' ? 0.6 : 1); return `<rect x="${(s.x * 40 - w / 2).toFixed(1)}" y="${(s.y * 26 - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1.6" transform="rotate(${(s.rz || 0) + (s.ry || 0) * -0.25} ${s.x * 40} ${s.y * 26})"/>`; }).join('')}</svg>`;
  }

  async onLeftClick(e) {
    const t = (sel) => e.target.closest(sel);
    let b;
    if ((b = t('[data-mkmode]'))) {
      if (b.dataset.mkmode === this.mode) return true;
      this.leave();
      settings.studioMockupMode = b.dataset.mkmode;
      persist();
      await this.enter();
      this.st.renderSpaceLeft(); this.st.renderProps(); this.st.resize();
      return true;
    }
    if ((b = t('[data-mkscene]'))) { const ps = await import('../viewer/poses.js'); await ps.applyPhotoScene(b.dataset.mkscene); this.st.renderSpaceLeft(); return true; }
    if ((b = t('[data-mkps]'))) {
      if (b.dataset.mkps === 'recapture') { const ps = await import('../viewer/poses.js'); if (ps.posesStage()) await ps.recapturePoses(); else await this.enter(); this.st.renderSpaceLeft(); }
      if (b.dataset.mkps === 'lab') { const { setMode } = await import('../viewer/toolbar.js'); setMode('preview'); }
      return true;
    }
    if ((b = t('[data-mkl-open]'))) { settings.studioMockupCur = b.dataset.mklOpen; this.sel = null; this.hist = []; this.fut = []; persist(); await this.loadMedia(); this.renderAll(); return true; }
    if ((b = t('[data-mkl-tpl]'))) { this.applyTemplate(b.dataset.mklTpl); toast(`Modèle « ${TEMPLATES[b.dataset.mklTpl][0]} » appliqué. Dépose tes captures sur les appareils.`); return true; }
    if ((b = t('[data-mkl-lay]'))) { this.change((d) => this.applyLayout(b.dataset.mklLay, d)); this.renderAll(); return true; }
    if ((b = t('[data-mkl-fmt]'))) { this.change((d) => { d.format = b.dataset.mklFmt; }); this.renderAll(); return true; }
    if ((b = t('[data-mkl]'))) {
      const a = b.dataset.mkl;
      if (a === 'new') { const n = newDoc(`Maquette ${this.docs.length + 1}`); this.docs.push(n); settings.studioMockupCur = n.id; }
      if (a === 'dup') { const n = { ...JSON.parse(JSON.stringify(this.doc)), id: uid(), name: `${this.doc.name} (copie)` }; this.docs.push(n); settings.studioMockupCur = n.id; }
      if (a === 'del' && this.docs.length > 1) { const i = this.docs.indexOf(this.doc); this.docs.splice(i, 1); settings.studioMockupCur = this.docs[Math.max(0, i - 1)].id; }
      if (a === 'rename') {
        const row = t('.st-btns') && this.st.$.spaceLeft.querySelector('.st-deck.on .st-deck-t');
        if (row) {
          row.innerHTML = `<input class="input small" value="${esc(this.doc.name)}">`;
          const inp = row.querySelector('input'); inp.focus(); inp.select();
          const done = () => { if (inp.value.trim()) { this.doc.name = inp.value.trim(); persist(); } this.st.renderSpaceLeft(); };
          inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') done(); if (ev.key === 'Escape') this.st.renderSpaceLeft(); });
          inp.addEventListener('blur', done);
          return true;
        }
      }
      persist(); this.sel = null; this.renderAll();
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ panneau de droite
  slider(k, label, v, min, max, step = 1, unit = '') { return `<label class="st-field mk-sl"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-mkp="${k}"><b>${Math.round(v * 100) / 100}${unit}</b></label>`; }
  segm(k, v, opts) { return `<div class="seg wide small mk-seg">${Object.entries(opts).map(([key, l]) => `<button class="${String(v) === key ? 'on' : ''}" data-mkp="${k}" data-v="${key}">${l}</button>`).join('')}</div>`; }

  propsHtml() {
    if (this.mode === 'scene') return '';
    const d = this.doc;
    const s = d.slots.find((q) => q.id === this.sel);
    if (s) return this.slotHtml(s);
    const bg = d.bg;
    const ex = settings.mkExport || { format: 'png', scale: 1 };
    return `
      <div class="st-sec"><div class="st-sec-h">${icon('image', 14)}<b>Fond</b></div>
        ${this.segm('bg.type', bg.type, { preset: 'Collection', gradient: 'Dégradé', solid: 'Uni', magic: 'Magique', image: 'Image', transparent: 'Transparent' })}
        ${bg.type === 'preset' ? `<div class="mk-presets">${Object.entries(MK_PRESETS).map(([k, l]) => `<button class="mk-pre${bg.preset === k ? ' on' : ''}" data-mkp="bg.preset" data-v="${k}"><i class="mk-pre-${k}"></i><span>${l}</span></button>`).join('')}</div><button class="btn small" data-mkp="bg.seed" data-v="shuffle">${icon('sync', 13)}<span>Autre variante</span></button>` : ''}
        ${bg.type === 'gradient' ? `<div class="mk-row"><label class="st-field"><span>Couleur 1</span><input type="color" data-mkp="bg.c1" value="${esc(bg.c1)}"></label><label class="st-field"><span>Couleur 2</span><input type="color" data-mkp="bg.c2" value="${esc(bg.c2)}"></label></div>${this.slider('bg.angle', 'Angle', bg.angle ?? 135, 0, 360, 5, '°')}` : ''}
        ${bg.type === 'solid' ? `<label class="st-field"><span>Couleur</span><input type="color" data-mkp="bg.color" value="${esc(bg.color)}"></label>` : ''}
        ${bg.type === 'magic' ? `<p class="pop-note">Couleurs tirées de ta capture.</p>${this.segm('bg.dark', bg.dark === false ? 'false' : 'true', { true: 'Sombre', false: 'Clair' })}<button class="btn small" data-mkp="bg.seed" data-v="shuffle">${icon('sync', 13)}<span>Autre variante</span></button>` : ''}
        ${bg.type === 'image' ? `<button class="btn small" data-mka="bg-image">${icon('upload', 13)}<span>${bg.image ? 'Changer l’image…' : 'Choisir une image…'}</span></button>${this.slider('bg.blur', 'Flou', bg.blur || 0, 0, 40, 1)}${this.slider('bg.dim', 'Assombrir', bg.dim || 0, 0, 0.8, 0.05)}` : ''}
      </div>
      <div class="st-sec"><div class="st-sec-h">${icon('sparkle', 14)}<b>Superposition et effets</b></div>
        ${this.segm('overlay', d.overlay || 'none', { none: 'Aucune', shadow: 'Ombre', shapes: 'Formes' })}
        ${this.slider('fx.noise', 'Grain', d.fx.noise || 0, 0, 0.3, 0.01)}
        ${this.slider('fx.vignette', 'Vignette', d.fx.vignette || 0, 0, 0.8, 0.05)}
      </div>
      <div class="st-sec"><div class="st-sec-h">${icon('text', 14)}<b>Textes</b><span class="st-sec-tools"><button class="icon-btn small" data-mka="text-ai" title="Rédiger un titre, un sous-titre et un appel à l’action avec l’IA">${icon('sparkle', 13)}</button><button class="icon-btn small" data-mka="text-add" title="Ajouter un texte">${icon('plus', 13)}</button></span></div>
        ${(d.texts || []).map((tx, i) => `<div class="mk-text">
          <textarea class="input" rows="2" data-mkt="${i}.text" placeholder="Texte">${esc(tx.text)}</textarea>
          <div class="mk-row"><select class="input" data-mkt="${i}.font">${Object.entries({ sans: 'Moderne', display: 'Impact', serif: 'Élégant', round: 'Arrondi', mono: 'Code' }).map(([k, l]) => `<option value="${k}" ${tx.font === k ? 'selected' : ''}>${l}</option>`).join('')}</select><input type="color" data-mkt="${i}.color" value="${esc(tx.color || '#ffffff')}"><select class="input" data-mkt="${i}.weight">${[400, 500, 700, 800].map((w) => `<option value="${w}" ${Number(tx.weight) === w ? 'selected' : ''}>${{ 400: 'Normal', 500: 'Moyen', 700: 'Gras', 800: 'Très gras' }[w]}</option>`).join('')}</select></div>
          <label class="st-field mk-sl"><span>Taille</span><input type="range" min="2" max="14" step="0.2" value="${tx.size || 6}" data-mkt="${i}.size"><b>${tx.size || 6}</b></label>
          <label class="st-field mk-sl"><span>Hauteur</span><input type="range" min="0" max="0.95" step="0.01" value="${tx.y ?? 0.08}" data-mkt="${i}.y"><b>${Math.round((tx.y ?? 0.08) * 100)} %</b></label>
          <div class="mk-row">${['left', 'center', 'right'].map((al) => `<button class="btn small${(tx.align || 'center') === al ? ' primary' : ''}" data-mkt-al="${i}" data-v="${al}">${{ left: 'Gauche', center: 'Centre', right: 'Droite' }[al]}</button>`).join('')}<button class="icon-btn small" data-mkt-del="${i}" title="Supprimer">${icon('trash', 13)}</button></div>
        </div>`).join('') || '<p class="pop-note">Ajoute un titre ou un slogan au-dessus des appareils.</p>'}
      </div>
      <div class="st-sec"><div class="st-sec-h">${icon('star', 14)}<b>Logo (filigrane)</b></div>
        <button class="btn small" data-mka="mark">${icon('upload', 13)}<span>${d.mark.image ? 'Changer le logo…' : 'Ajouter ton logo…'}</span></button>
        ${d.mark.image ? `${this.segm('mark.pos', d.mark.pos || 'br', { tl: '↖', tc: '↑', tr: '↗', bl: '↙', bc: '↓', br: '↘' })}${this.slider('mark.size', 'Taille', d.mark.size || 0.12, 0.04, 0.4, 0.01)}${this.slider('mark.opacity', 'Opacité', d.mark.opacity ?? 0.85, 0.1, 1, 0.05)}<button class="btn small" data-mka="mark-del">${icon('trash', 13)}<span>Retirer</span></button>` : ''}
      </div>
      <div class="st-sec"><div class="st-sec-h">${icon('play', 14)}<b>Animation (vidéo)</b></div>
        <select class="input" data-mkp="anim.preset">${Object.entries(MK_ANIMS).map(([k, l]) => `<option value="${k}" ${d.anim.preset === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        ${this.slider('anim.dur', 'Durée', d.anim.dur || 6, 2, 20, 1, ' s')}
        <p class="pop-note">« Défilement de l’écran » fait descendre une capture de page entière dans l’appareil.</p>
      </div>
      <div class="st-sec"><div class="st-sec-h">${icon('download', 14)}<b>Export</b></div>
        ${this.segm('ex.format', ex.format || 'png', { png: 'PNG', jpg: 'JPEG', webp: 'WebP', pdf: 'PDF' })}
        ${this.segm('ex.scale', String(ex.scale || 1), { 1: '1×', 2: '2×', 3: '3×', 4: '4×' })}
        <div class="mk-row"><button class="btn small primary" data-mk-ex="png">${icon('camera', 13)}<span>Exporter l’image</span></button><button class="btn small" data-mk-ex="video">${icon('film', 13)}<span>Vidéo MP4</span></button></div>
        <button class="btn small wide" data-mk-ex="batch">${icon('layers', 13)}<span>Tous les formats réseaux (4 images)</span></button>
        <p class="pop-note">Astuce : clique sur un appareil de la maquette pour régler son cadre, son inclinaison et son ombre.</p>
      </div>`;
  }

  slotHtml(s) {
    const groups = DEVICE_GROUPS.map(([l, cats]) => `<optgroup label="${l}">${DEVICES.filter((x) => cats.includes(x.category) && !x.hidden).map((x) => `<option value="${esc(x.id)}" ${x.id === s.device ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>`).join('');
    const dev = DEVICES.find((x) => x.id === s.device);
    const sh = s.shadow || { mode: 'spread', opacity: 40 };
    return `
      <div class="st-sec"><div class="st-sec-h">${icon('image', 14)}<b>Capture</b><button class="icon-btn small" data-mka="desel" title="Retour aux réglages de la maquette">${icon('close', 13)}</button></div>
        <div class="mk-row"><button class="btn small primary" data-mka="media">${icon('upload', 13)}<span>Importer…</span></button><button class="btn small" data-mka="capture" title="Capture le site ouvert à la taille de cet appareil">${icon('camera', 13)}<span>Capturer le site</span></button></div>
        <label class="check-row"><input type="checkbox" data-mkp="s.full" ${s.full ? 'checked' : ''}><span class="box"></span><span>Page entière (pour le défilement)</span></label>
        ${s.media ? `${this.slider('s.zoom', 'Zoom dans l’écran', s.zoom || 1, 1, 3, 0.05, '×')}${this.segm('s.align', s.align || 'top', { top: 'Haut', center: 'Centre', bottom: 'Bas' })}<button class="btn small" data-mka="media-del">${icon('trash', 13)}<span>Retirer la capture</span></button>` : '<p class="pop-note">Ou dépose / colle une image directement sur l’appareil.</p>'}
      </div>
      <div class="st-sec"><div class="st-sec-h">${icon('phone', 14)}<b>Support</b></div>
        ${this.segm('s.kind', s.kind || 'device', { device: 'Appareil', browser: 'Navigateur', screen: 'Écran seul' })}
        ${(s.kind || 'device') === 'device' ? `<select class="input" data-mkp="s.device">${groups}</select>
          ${dev && dev.colors && dev.colors.length ? `<div class="mk-colors">${dev.colors.slice(0, 8).map(([n, hex]) => `<button class="st-color${(s.color || dev.colors[0][1]) === hex ? ' on' : ''}" style="--c:${esc(hex)}" data-mkp="s.color" data-v="${esc(hex)}" title="${esc(n)}"></button>`).join('')}</div>` : ''}
          <label class="check-row"><input type="checkbox" data-mkp="s.land" ${s.land ? 'checked' : ''}><span class="box"></span><span>Paysage</span></label>` : ''}
        ${s.kind === 'browser' ? `${this.segm('s.browserTheme', s.browserTheme || 'light', { light: 'Clair', dark: 'Sombre' })}<label class="st-field"><span>Adresse affichée</span><input class="input" data-mkp="s.url" value="${esc(s.url || '')}" placeholder="monsite.com"></label>` : ''}
      </div>
      <div class="st-sec"><div class="st-sec-h">${icon('frame', 14)}<b>Cadre</b></div>
        <div class="mk-styles">${Object.entries(MK_STYLES).map(([k, l]) => `<button class="mk-style${(s.style || 'default') === k ? ' on' : ''}" data-mkp="s.style" data-v="${k}"><i class="mk-st-${k}"></i><span>${l}</span></button>`).join('')}</div>
        ${s.kind !== 'device' ? `${this.segm('s.radius', typeof s.radius === 'number' ? 'custom' : (s.radius || 'curved'), { sharp: 'Net', curved: 'Courbe', round: 'Rond', custom: 'Réglé' })}${typeof s.radius === 'number' ? this.slider('s.radiusN', 'Arrondi', s.radius, 0, 40, 1) : ''}` : ''}
        ${['outline', 'border'].includes(s.style) ? `<label class="st-field"><span>Couleur du cadre</span><input type="color" data-mkp="s.borderColor" value="${esc(s.borderColor || '#ffffff')}"></label>` : ''}
      </div>
      <div class="st-sec"><div class="st-sec-h">${icon('light', 14)}<b>Ombre et lumière</b></div>
        ${this.segm('s.shadow.mode', sh.mode, { none: 'Aucune', spread: 'Diffuse', hug: 'Proche', adaptive: 'Couleur' })}
        ${sh.mode !== 'none' ? this.slider('s.shadow.opacity', 'Intensité', sh.opacity ?? 40, 0, 100, 1) : ''}
        ${this.slider('s.gloss', 'Reflet', s.gloss || 0, 0, 1, 0.05)}
      </div>
      <div class="st-sec"><div class="st-sec-h">${icon('rotate', 14)}<b>Inclinaison 3D</b></div>
        <div class="mk-row mk-wrap">${Object.entries({ flat: ['À plat', 0, 0, 0], left: ['Gauche', 8, 24, 2], right: ['Droite', 8, -24, -2], top: ['Dessus', 48, 0, -32], iso: ['Isométrique', 35, -30, -12] }).map(([k, [l]]) => `<button class="btn small" data-mk-tilt="${k}">${l}</button>`).join('')}</div>
        ${this.slider('s.rx', 'Haut / bas', s.rx || 0, -75, 75, 1, '°')}
        ${this.slider('s.ry', 'Gauche / droite', s.ry || 0, -75, 75, 1, '°')}
        ${this.slider('s.rz', 'Rotation', s.rz || 0, -180, 180, 1, '°')}
      </div>
      <div class="st-sec"><div class="st-sec-h">${icon('move', 14)}<b>Position</b></div>
        ${this.slider('s.size', 'Taille', s.size, 0.1, 2.2, 0.01)}
        ${this.slider('s.x', 'Horizontal', s.x, -0.2, 1.2, 0.005)}
        ${this.slider('s.y', 'Vertical', s.y, -0.2, 1.2, 0.005)}
        <div class="mk-row"><button class="btn small" data-mka="front">${icon('chevronUp', 13)}<span>Devant</span></button><button class="btn small" data-mka="back">${icon('chevronDown', 13)}<span>Derrière</span></button><button class="btn small" data-mka="slot-del">${icon('trash', 13)}<span>Supprimer</span></button></div>
      </div>`;
  }

  setPath(k, v) {
    const d = this.doc;
    const s = d.slots.find((q) => q.id === this.sel);
    if (k.startsWith('ex.')) { settings.mkExport = { ...(settings.mkExport || { format: 'png', scale: 1 }), [k.slice(3)]: v }; persist(); return; }
    let target = d; let path = k;
    if (k.startsWith('s.')) { target = s; path = k.slice(2); }
    if (!target) return;
    if (path === 'radiusN') { target.radius = Number(v); return; }
    if (path === 'radius' && v === 'custom') { target.radius = 20; return; }
    const ks = path.split('.');
    let o = target;
    for (let i = 0; i < ks.length - 1; i++) { o[ks[i]] = o[ks[i]] || {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = v;
  }

  async onPropsEvent(e) {
    const t = e.target;
    const d = this.doc;
    const s = d.slots.find((q) => q.id === this.sel);
    if (e.type === 'click') {
      const tilt = t.closest('[data-mk-tilt]');
      if (tilt && s) { const p = { flat: [0, 0, 0], left: [8, 24, 2], right: [8, -24, -2], top: [48, 0, -32], iso: [35, -30, -12] }[tilt.dataset.mkTilt]; this.change(() => { [s.rx, s.ry, s.rz] = p; }); this.st.renderProps(); return; }
      const exb = t.closest('[data-mk-ex]');
      if (exb) { await this.action(exb.dataset.mkEx); return; }
      const al = t.closest('[data-mkt-al]');
      if (al) { this.change(() => { d.texts[Number(al.dataset.mktAl)].align = al.dataset.v; }); this.st.renderProps(); return; }
      const del = t.closest('[data-mkt-del]');
      if (del) { this.change(() => { d.texts.splice(Number(del.dataset.mktDel), 1); }); this.st.renderProps(); return; }
      const a = t.closest('[data-mka]');
      if (a) { await this.propAction(a.dataset.mka, s); return; }
      const b = t.closest('button[data-mkp]');
      if (b) {
        const k = b.dataset.mkp; let v = b.dataset.v;
        if (k === 'bg.seed') { this.change(() => { d.bg.seed = Math.floor(Math.random() * 1e6); }); return; }
        if (k === 'bg.dark') v = v !== 'false';
        if (k === 'ex.scale') v = Number(v);
        this.snapshot(); this.setPath(k, v); this.commit(); this.st.renderProps();
      }
      return;
    }
    // input / change
    if (t.matches('[data-mkf]')) { this.snapshot(); d[t.dataset.mkf] = Math.max(200, Math.min(8000, Number(t.value) || 1000)); this.commit(); return; }
    if (t.matches('[data-mkt]')) {
      const [i, key] = t.dataset.mkt.split('.');
      if (e.type === 'change' || t.type === 'range' || t.tagName === 'TEXTAREA') {
        d.texts[Number(i)][key] = t.type === 'range' ? Number(t.value) : t.value;
        if (t.type === 'range' && t.nextElementSibling) t.nextElementSibling.textContent = key === 'y' ? `${Math.round(t.value * 100)} %` : t.value;
        this.draw(); clearTimeout(this.pt); this.pt = setTimeout(() => persist(), 400);
      }
      return;
    }
    if (t.matches('[data-mkp]')) {
      const k = t.dataset.mkp;
      let v = t.type === 'checkbox' ? t.checked : t.type === 'range' ? Number(t.value) : t.value;
      if (k === 'anim.preset' && v !== 'none' && !this.playing) setTimeout(() => this.togglePlay($('[data-mk="play"]', this.stage)), 50);
      if (e.type === 'change' || t.type !== 'range') this.snapshot();
      this.setPath(k, v);
      if (t.type === 'range' && t.nextElementSibling) t.nextElementSibling.textContent = `${Math.round(v * 100) / 100}${/r[xyz]$/.test(k) ? '°' : k === 'anim.dur' ? ' s' : k === 's.zoom' ? '×' : ''}`;
      this.draw();
      if (e.type === 'change') { persist(); if (t.type !== 'range' && t.tagName !== 'INPUT') this.st.renderProps(); else if (['s.kind', 's.device', 'bg.type'].includes(k)) this.st.renderProps(); }
      void v;
    }
  }

  async pickFile(title, video = false) {
    const f = await api.invoke('dialog:open-file', { title, filters: [{ name: video ? 'Images et vidéos' : 'Images', extensions: video ? ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'mp4', 'webm', 'mov'] : ['png', 'jpg', 'jpeg', 'webp', 'svg'] }], asDataUrl: true, maxBytes: 250e6 });
    if (!f || !f.dataUrl) return null;
    const blob = await (await fetch(f.dataUrl)).blob();
    return this.addMediaBlob(blob);
  }

  async propAction(a, s) {
    const d = this.doc;
    if (a === 'desel') { this.sel = null; this.st.renderProps(); this.draw(); return; }
    if (a === 'media' && s) { const k = await this.pickFile('Capture d’écran ou vidéo', true); if (k) { this.change(() => { s.media = k; }); this.st.renderProps(); } return; }
    if (a === 'capture' && s) { await this.captureSite(s); return; }
    if (a === 'media-del' && s) { this.change(() => { s.media = null; }); this.st.renderProps(); return; }
    if (a === 'slot-del' && s) { this.change(() => { d.slots = d.slots.filter((q) => q.id !== s.id); }); this.sel = null; this.renderAll(); return; }
    if (a === 'front' && s) { this.change(() => { s.z = Math.max(...d.slots.map((q) => q.z || 0)) + 1; }); return; }
    if (a === 'back' && s) { this.change(() => { s.z = Math.min(...d.slots.map((q) => q.z || 0)) - 1; }); return; }
    if (a === 'bg-image') { const k = await this.pickFile('Image de fond'); if (k) { this.change(() => { d.bg.image = k; }); this.st.renderProps(); } return; }
    if (a === 'mark') { const k = await this.pickFile('Ton logo (PNG transparent conseillé)'); if (k) { this.change(() => { d.mark.image = k; }); this.st.renderProps(); } return; }
    if (a === 'mark-del') { this.change(() => { d.mark.image = null; }); this.st.renderProps(); return; }
    if (a === 'text-add') { this.change(() => { d.texts.push({ id: uid(), text: 'Ton titre ici', font: 'sans', size: 6, weight: 800, color: '#ffffff', align: 'center', x: 0.5, y: 0.06 + 0.1 * d.texts.length, shadow: true }); }); this.st.renderProps(); }
    if (a === 'text-ai') { await this.aiText(d); return; }
  }

  // Rédige un titre, un sous-titre et un appel à l'action avec l'IA, puis les ajoute comme blocs de texte.
  async aiText(d) {
    const ai = await import('../core/ai.js');
    if (!(await ai.aiReady())) { toast('Configure d’abord une IA (bouton IA en haut à droite).'); ai.openAiSettings(); return; }
    const ctx = (() => { try { return S.board && S.board.focused && S.board.focused.cfg ? new URL(S.board.focused.cfg.url).host : ''; } catch { return ''; } })();
    const brief = window.prompt('Que met en avant ce visuel ? (produit, offre, ton)', ctx ? `Le site ${ctx}` : '');
    if (brief === null) return;
    const t = toast('L’IA rédige…', { busy: true, sticky: true });
    const system = 'Tu es un concepteur-rédacteur publicitaire. On te décrit un produit ou une application à mettre en avant sur un visuel marketing. Réponds UNIQUEMENT par un objet JSON {"headline":"…","subtitle":"…","cta":"…"} : un titre accrocheur (max 6 mots), un sous-titre (max 12 mots), un appel à l’action court (max 4 mots). En français, sans emoji, sans texte hors du JSON.';
    try {
      let acc = '';
      await ai.aiChat({ messages: [{ role: 'user', content: brief || 'Une application mobile moderne' }], system, maxTokens: 300, onChunk: (x) => { acc += x; } });
      const m = acc.match(/\{[\s\S]*\}/);
      const j = m ? JSON.parse(m[0]) : {};
      if (!j.headline && !j.subtitle && !j.cta) throw new Error('Réponse de l’IA illisible.');
      this.change(() => {
        const add = (text, size, weight, y) => d.texts.push({ id: uid(), text: String(text).slice(0, 120), font: 'display', size, weight, color: '#ffffff', align: 'center', x: 0.5, y, shadow: true });
        if (j.headline) add(j.headline, 8, 800, 0.06);
        if (j.subtitle) add(j.subtitle, 4.2, 500, 0.2);
        if (j.cta) add(j.cta, 4.6, 700, 0.84);
      });
      this.st.renderProps();
      toast('Titre, sous-titre et appel à l’action ajoutés.');
    } catch (e) { toast(e.message || 'La rédaction a échoué.', { kind: 'bad' }); } finally { t.close(); }
  }

  onKey(e) {
    if (this.mode === 'scene') return true;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return true; }
    if (mod && k === 'y') { e.preventDefault(); this.redo(); return true; }
    if (k === 'delete' || k === 'backspace') {
      if (this.selText) { e.preventDefault(); this.change((d) => { d.texts = d.texts.filter((q) => q.id !== this.selText); }); this.selText = null; this.st.renderProps(); return true; }
      if (this.sel) { e.preventDefault(); this.propAction('slot-del', this.doc.slots.find((q) => q.id === this.sel)); return true; }
    }
    if (k === 'escape' && (this.sel || this.selText)) { this.sel = null; this.selText = null; this.st.renderProps(); this.draw(); return true; }
    return true;
  }
}

void hidePopover; void showPopover;
