/* Vidéo HD de la maquette.
 * Les images de la page arrivent du protocole DevTools à la définition de l'écran, sont composées
 * avec le cadre dans un canvas, puis encodées en H.264 (MP4) ou VP9 (WebM) par WebCodecs.
 */
import { api } from '../core/api.js';
import { S } from '../core/state.js';
import { settings } from '../core/settings.js';
import { $, fmtTime } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast } from '../core/ui.js';
import { preloadSkin } from '../devices/skins.js';
import {
  drawDevice, drawOverlays, drawStatusBar,
} from '../devices/frames2d.js';
import { fillBackground } from './photo.js';
import { saveBytes } from './export.js';

const LONG_SIDE = {
  720: 1280, 1080: 1920, 1440: 2560, 2160: 3840,
};
const even = (v) => Math.max(2, Math.round(v / 2) * 2);

function clipRounded(ctx, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, r.map((v) => Math.min(v, w / 2, h / 2)));
  ctx.clip();
}

export class Recorder {
  constructor(view, opts = {}) {
    this.view = view;
    this.framed = opts.framed ?? settings.video.framed;
    this.bg = opts.bg ?? settings.video.bg;
    this.fps = Number(opts.fps ?? settings.video.fps) || 30;
    this.size = String(opts.size ?? settings.video.size);
    this.format = opts.format ?? settings.video.format;
    this.showTouches = opts.showTouches ?? settings.showTouches;
    this.running = false;
    this.encoded = 0;
  }

  layout() {
    const L = this.view.layoutFor({ framesOn: this.framed ? true : settings.framesOn });
    if (this.framed) {
      const margin = Math.round(Math.max(L.TW, L.TH) * 0.08);
      const boxW = L.TW + margin * 2;
      const boxH = L.TH + margin * 2;
      const long = LONG_SIDE[this.size] || 1920;
      const k = long / Math.max(boxW, boxH);
      return {
        L, margin, k, width: even(boxW * k), height: even(boxH * k),
      };
    }
    // Écran seul : définition native (ou limitée au format choisi).
    const native = Math.max(L.W, L.H) * L.dpr;
    const long = this.size === 'native' ? native : Math.min(native, LONG_SIDE[this.size] || 1920);
    const k = long / Math.max(L.W, L.H);
    return {
      L, margin: 0, k, width: even(L.W * k), height: even(L.H * k),
    };
  }

  /* Enregistrement en deux temps, sans perte d'image :
   * 1. pendant l'enregistrement, on garde chaque image de la page (JPEG du protocole DevTools) avec son heure
   *    exacte, ainsi que les appuis (cercles de toucher) et les couleurs de la barre d'état ;
   * 2. un encodeur rejoue cette chronologie à cadence fixe (1/fps) : chaque image de la vidéo montre la page
   *    telle qu'elle était à cet instant. Il travaille en arrière-plan pendant l'enregistrement et termine à
   *    l'arrêt ; s'il est plus lent que le temps réel, la vidéo n'est pas saccadée, la finalisation dure juste
   *    un peu plus longtemps. */
  async start() {
    const view = this.view;
    if (!view.ready || !view.url) throw new Error("Ouvre d'abord un site ou un projet.");
    this.lay = this.layout();
    const { L, k } = this.lay;
    if (L.skin) await preloadSkin(L.skin.v);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.lay.width;
    this.canvas.height = this.lay.height;
    this.ctx = this.canvas.getContext('2d');

    // Couche fixe : arrière-plan et appareil (dessinée une seule fois).
    if (this.framed) {
      this.staticLayer = document.createElement('canvas');
      this.staticLayer.width = this.lay.width;
      this.staticLayer.height = this.lay.height;
      const sctx = this.staticLayer.getContext('2d');
      await fillBackground(sctx, this.lay.width, this.lay.height, this.bg === 'accent' ? 'accent' : this.bg);
      sctx.setTransform(k, 0, 0, k, this.lay.margin * k, this.lay.margin * k);
      drawDevice(sctx, L, { px: k, shadow: true, screenFill: '#fff' });
    }
    this.overlayLayer = document.createElement('canvas');
    this.overlayLayer.width = Math.ceil(L.W * k);
    this.overlayLayer.height = Math.ceil(L.H * k);
    const octx = this.overlayLayer.getContext('2d');
    octx.setTransform(k, 0, 0, k, 0, 0);
    drawOverlays(octx, L);

    // Encodeur : H.264 dans un MP4, sinon VP9 dans un WebM (bibliothèque chargée à la demande).
    const {
      Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, CanvasSource, QUALITY_VERY_HIGH, canEncodeVideo,
    } = await import('./encoder.js');
    let codec = this.format === 'webm' ? 'vp9' : 'avc';
    if (!(await canEncodeVideo(codec, { width: this.lay.width, height: this.lay.height }))) codec = codec === 'avc' ? 'vp9' : 'avc';
    if (!(await canEncodeVideo(codec, { width: this.lay.width, height: this.lay.height }))) throw new Error("Ce PC ne sait pas encoder de vidéo à cette taille. Choisis une taille plus petite.");
    this.ext = codec === 'avc' ? 'mp4' : 'webm';
    this.output = new Output({
      format: codec === 'avc' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
      target: new BufferTarget(),
    });
    this.source = new CanvasSource(this.canvas, { codec, quality: QUALITY_VERY_HIGH, keyFrameInterval: 2 });
    this.output.addVideoTrack(this.source, { frameRate: this.fps });
    await this.output.start();

    // Chronologie : images de la page, appuis, couleurs de la barre d'état.
    this.timeline = [];
    this.touches = [];
    this.decoded = { i: -1, bmp: null };
    // Première image : la page telle qu'elle est maintenant (le flux DevTools n'envoie rien tant que rien ne bouge).
    try {
      const first = await view.capturePage();
      const blob = await new Promise((r) => first.toBlob(r, 'image/jpeg', 0.92));
      if (blob) this.timeline.push({ t: 0, blob, sb: view.statusColors() });
    } catch { /* la première image du flux prendra le relais */ }
    this.started = performance.now();
    this.off = api.on('screencast:frame', (f) => {
      if (f.wcId !== view.wcId || !this.running) return;
      try {
        const bin = Uint8Array.from(atob(f.data), (ch) => ch.charCodeAt(0));
        this.timeline.push({ t: (performance.now() - this.started) / 1000, blob: new Blob([bin], { type: 'image/jpeg' }), sb: view.statusColors() });
      } catch { /* image incomplète */ }
    });
    this.offPointer = view.on('pointer', (p) => this.pointer(p));
    await api.invoke('screencast:start', {
      wcId: view.wcId, maxWidth: Math.ceil(L.vp.w * k * 1.05), maxHeight: Math.ceil(L.vp.h * k * 1.05), quality: 92,
    });
    view.recording = true;
    view.configurePage();
    this.running = true;
    this.encoded = 0;
    this.tick = setInterval(() => { if (this.onTick) this.onTick(performance.now() - this.started); }, 250);
    this.pump = this.encodeUntil(() => (this.running ? (performance.now() - this.started) / 1000 - 0.3 : this.endT));
  }

  pointer(p) {
    if (!this.showTouches || !this.running) return;
    this.touches.push({ t: (performance.now() - this.started) / 1000, type: p.type, x: p.x, y: p.y });
  }

  // Cercle de toucher à l'instant t : visible pendant l'appui, puis s'efface en 0,25 s.
  touchAt(t) {
    let last = null;
    for (const e of this.touches) { if (e.t > t) break; last = e; }
    if (!last) return null;
    if (last.type === 'down' || last.type === 'move') return { x: last.x, y: last.y, alpha: 1 };
    let prev = null;
    for (const e of this.touches) { if (e.t > last.t) break; if (e.type !== 'up' && e.type !== 'cancel') prev = e; }
    const a = 1 - (t - last.t) / 0.25;
    return a > 0 && prev ? { x: prev.x, y: prev.y, alpha: a } : null;
  }

  async frameAt(t) {
    const tl = this.timeline;
    let i = -1;
    for (let j = 0; j < tl.length; j++) { if (tl[j].t <= t) i = j; else break; }
    if (i < 0) i = tl.length ? 0 : -1;
    if (i < 0) return { bmp: null, sb: null };
    if (this.decoded.i !== i) {
      try {
        const bmp = await createImageBitmap(tl[i].blob);
        if (this.decoded.bmp && this.decoded.bmp.close) this.decoded.bmp.close();
        this.decoded = { i, bmp };
      } catch { /* image illisible : on garde la précédente */ }
      // Les images déjà dépassées ne serviront plus : mémoire libérée.
      for (let j = 0; j < i; j++) tl[j].blob = null;
    }
    return { bmp: this.decoded.bmp, sb: tl[i].sb };
  }

  draw(bmp, sb, touch) {
    const { ctx, lay } = this;
    const { L, k, margin } = lay;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.framed) ctx.drawImage(this.staticLayer, 0, 0);
    else { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, lay.width, lay.height); }
    ctx.save();
    const ox = this.framed ? (margin + L.screen.x) * k : 0;
    const oy = this.framed ? (margin + L.screen.y) * k : 0;
    ctx.setTransform(k, 0, 0, k, ox, oy);
    clipRounded(ctx, L.W, L.H, this.framed ? L.sr : [0, 0, 0, 0]);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, L.W, L.H);
    if (bmp) ctx.drawImage(bmp, L.vp.x, L.vp.y, L.vp.w, L.vp.h);
    if (L.sb) { const c = sb || this.view.statusColors(); drawStatusBar(ctx, L, c.bg, c.fg); }
    ctx.setTransform(1, 0, 0, 1, ox, oy);
    ctx.drawImage(this.overlayLayer, 0, 0);
    ctx.setTransform(k, 0, 0, k, ox, oy);
    if (touch) {
      ctx.beginPath();
      ctx.arc(L.vp.x + touch.x, L.vp.y + touch.y, 22, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.55 * touch.alpha})`;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(0,0,0,${0.25 * touch.alpha})`;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Encode les images de la vidéo jusqu'à l'instant limit() (en secondes), à cadence fixe.
  async encodeUntil(limit) {
    for (;;) {
      const t = this.encoded / this.fps;
      const lim = limit();
      if (lim == null || t > lim) {
        if (!this.running) return;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 40));
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const { bmp, sb } = await this.frameAt(t);
      this.draw(bmp, sb, this.touchAt(t));
      // eslint-disable-next-line no-await-in-loop
      await this.source.add(t, 1 / this.fps);
      this.encoded += 1;
      if (!this.running && this.onProgress) this.onProgress(Math.min(1, t / Math.max(this.endT, 0.001)));
    }
  }

  async stop() {
    this.endT = (performance.now() - this.started) / 1000;
    this.running = false;
    clearInterval(this.tick);
    if (this.off) this.off();
    if (this.offPointer) this.offPointer();
    this.view.recording = false;
    this.view.configurePage();
    await api.invoke('screencast:stop', { wcId: this.view.wcId }).catch(() => {});
    // L'encodeur rattrape les images restantes (toutes, sans en sauter).
    await this.pump;
    const last = Math.ceil(this.endT * this.fps);
    while (this.encoded < Math.max(1, last)) {
      const t = this.encoded / this.fps;
      // eslint-disable-next-line no-await-in-loop
      const { bmp, sb } = await this.frameAt(t);
      this.draw(bmp, sb, this.touchAt(t));
      // eslint-disable-next-line no-await-in-loop
      await this.source.add(t, 1 / this.fps);
      this.encoded += 1;
      if (this.onProgress) this.onProgress(Math.min(1, t / Math.max(this.endT, 0.001)));
    }
    this.source.close();
    await this.output.finalize();
    if (this.decoded.bmp && this.decoded.bmp.close) this.decoded.bmp.close();
    this.timeline = [];
    return { data: new Uint8Array(this.output.target.buffer), ext: this.ext, duration: (this.encoded / this.fps) * 1000, width: this.lay.width, height: this.lay.height, frames: this.encoded };
  }
}

// ------------------------------------------------------------------ commandes
export async function startRecording(opts = {}) {
  if (S.recorder) return;
  const view = S.board.focused;
  const rec = new Recorder(view, opts);
  const pill = $('#recPill');
  rec.onTick = (ms) => { const t = $('.rp-time', pill); if (t) t.textContent = fmtTime(ms); if (ms > 600000) stopRecording(); };
  try {
    S.recorder = rec;
    await rec.start();
  } catch (err) {
    S.recorder = null;
    toast(err.message || "L'enregistrement n'a pas pu démarrer.", { kind: 'bad' });
    return;
  }
  rec.stopAndSave = () => stopRecording();
  document.body.classList.add('recording');
  pill.hidden = false;
  pill.innerHTML = `<span class="rp-dot"></span><span>Enregistrement ${rec.lay.width} × ${rec.lay.height}</span><span class="rp-time">0:00</span><button class="rp-stop" title="Arrêter (Ctrl+Maj+R)">${icon('stop', 12)}<span>Arrêter</span></button>`;
  pill.querySelector('.rp-stop').onclick = () => stopRecording();
  S.board.emit('recording', true);
}

export async function stopRecording() {
  const rec = S.recorder;
  if (!rec) return null;
  S.recorder = null;
  const pill = $('#recPill');
  pill.hidden = true;
  document.body.classList.remove('recording');
  S.board.emit('recording', false);
  const busy = toast('Finalisation de la vidéo…', { busy: true, sticky: true });
  rec.onProgress = (p) => busy.update(`Finalisation de la vidéo… ${Math.round(p * 100)} %`);
  try {
    const out = await rec.stop();
    const file = await saveBytes(out.data, {
      kind: 'video', project: S.source ? S.source.name : 'Sans projet', name: S.board.describe(rec.view), ext: out.ext,
    });
    busy.close();
    S.lastFile = file;
    toast(`Vidéo enregistrée : ${out.ext.toUpperCase()} ${out.width} × ${out.height}, ${fmtTime(out.duration)}`, { action: 'Afficher', onAction: () => api.invoke('shell:reveal', file) });
    return file;
  } catch (err) {
    busy.close();
    console.error(err);
    toast("La vidéo n'a pas pu être enregistrée.", { kind: 'bad' });
    return null;
  }
}
