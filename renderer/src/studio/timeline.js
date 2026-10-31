/* Animation par images clés : données, interpolation et frise chronologique. */
import { esc, clamp } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { showPopover, hidePopover } from '../core/ui.js';

export const EASES = {
  inOut: ['Douce', (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)],
  out: ['Décélération', (t) => 1 - (1 - t) ** 3],
  in: ['Accélération', (t) => t * t * t],
  linear: ['Linéaire', (t) => t],
  back: ['Rebond léger', (t) => { const c1 = 1.4; const c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; }],
  expo: ['Expo (très doux)', (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t))],
  spring: ['Ressort', (t) => 1 - Math.cos(t * Math.PI * 4.5) * Math.exp(-t * 6)],
  elastic: ['Élastique', (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1)],
  bounce: ['Rebonds', (t) => {
    const n = 7.5625; const d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) { const u = t - 1.5 / d; return n * u * u + 0.75; }
    if (t < 2.5 / d) { const u = t - 2.25 / d; return n * u * u + 0.9375; }
    const u = t - 2.625 / d; return n * u * u + 0.984375;
  }],
  hold: ['Instantanée', (t) => (t < 1 ? 0 : 1)],
};

const lerp = (a, b, f) => a + (b - a) * f;
function mix(a, b, f) {
  if (Array.isArray(a) && Array.isArray(b)) return a.map((x, i) => lerp(x, b[i] ?? x, f));
  if (typeof a === 'number' && typeof b === 'number') return lerp(a, b, f);
  return f < 0.5 ? a : b;
}

export function newAnimation() {
  return { duration: 5, fps: 30, tracks: {} };
}

// Valeur de chaque propriété au temps t (null si l'objet n'est pas animé).
export function evaluate(anim, id, t) {
  const keys = anim.tracks[id];
  if (!keys || !keys.length) return null;
  if (t <= keys[0].t) return { ...keys[0].v };
  const last = keys[keys.length - 1];
  if (t >= last.t) return { ...last.v };
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t < t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const span = Math.max(1e-6, b.t - a.t);
  const ease = (EASES[b.ease] || EASES.inOut)[1];
  const f = ease(clamp((t - a.t) / span, 0, 1));
  const out = {};
  for (const k of new Set([...Object.keys(a.v), ...Object.keys(b.v)])) {
    out[k] = a.v[k] === undefined ? b.v[k] : b.v[k] === undefined ? a.v[k] : mix(a.v[k], b.v[k], f);
  }
  return out;
}

// Ajoute ou met à jour la clé au temps t (à une image près).
export function upsertKey(anim, id, t, v, ease) {
  const keys = (anim.tracks[id] = anim.tracks[id] || []);
  const tol = 0.5 / anim.fps;
  const k = keys.find((x) => Math.abs(x.t - t) <= tol);
  if (k) { k.v = { ...v }; if (ease) k.ease = ease; return k; }
  const key = { t: Math.round(t * anim.fps) / anim.fps, ease: ease || 'inOut', v: { ...v } };
  keys.push(key);
  keys.sort((a, b) => a.t - b.t);
  return key;
}

export function removeKey(anim, id, key) {
  const keys = anim.tracks[id];
  if (!keys) return;
  const i = keys.indexOf(key);
  if (i >= 0) keys.splice(i, 1);
  if (!keys.length) delete anim.tracks[id];
}

export const fmtSec = (t) => `${t.toFixed(2).replace('.', ',')} s`;

/* Frise : rangées par objet, règle graduée, tête de lecture, clés déplaçables.
 * host : { anim, time, playing, rows() → [{ id, name, icon }], selectedId, selectedKey,
 *          setTime(t), togglePlay(), toStart(), addKey(), clearAnimation(), onKeySelect(id, key),
 *          onKeysChanged(), openPresets(anchor), setDuration(s), setFps(n) } */
export class TimelineUI {
  constructor(el, host) {
    this.el = el;
    this.host = host;
    this.drag = null;
    el.innerHTML = `
      <div class="tl-bar">
        <button class="tl-btn" data-tl="start" title="Début (Origine)">${icon('back', 15)}</button>
        <button class="tl-btn play" data-tl="play" title="Lire (Espace)">${icon('play', 15)}</button>
        <span class="tl-time"><b data-tl-time>0,00 s</b> / <input class="tl-dur" type="number" min="0.5" max="120" step="0.5" value="5" title="Durée de l'animation (secondes)"> s</span>
        <div class="seg mini tl-fps" role="radiogroup"><button data-fps="30">30 i/s</button><button data-fps="60">60 i/s</button></div>
        <span class="grow"></span>
        <button class="btn small" data-tl="key" title="Enregistrer la position de l'objet sélectionné à cet instant (K)">${icon('keyframe', 14)}<span>Ajouter une clé</span></button>
        <button class="btn small" data-tl="presets" aria-haspopup="true">${icon('sparkle', 14)}<span>Animations toutes faites</span></button>
        <button class="tl-btn" data-tl="clear" title="Effacer toute l'animation">${icon('trash', 15)}</button>
      </div>
      <div class="tl-body">
        <div class="tl-names"></div>
        <div class="tl-area"><div class="tl-ruler"></div><div class="tl-rows"></div><div class="tl-head"><span></span></div></div>
      </div>`;
    this.$ = {
      time: el.querySelector('[data-tl-time]'), dur: el.querySelector('.tl-dur'), names: el.querySelector('.tl-names'), area: el.querySelector('.tl-area'), ruler: el.querySelector('.tl-ruler'), rows: el.querySelector('.tl-rows'), head: el.querySelector('.tl-head'), play: el.querySelector('[data-tl="play"]'),
    };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tl]');
      if (b) {
        const a = b.dataset.tl;
        if (a === 'start') host.toStart();
        if (a === 'play') host.togglePlay();
        if (a === 'key') host.addKey();
        if (a === 'presets') host.openPresets(b);
        if (a === 'clear') host.clearAnimation();
        return;
      }
      const f = e.target.closest('[data-fps]');
      if (f) host.setFps(Number(f.dataset.fps));
      const n = e.target.closest('[data-row]');
      if (n && e.target.closest('.tl-names')) host.onRowSelect(n.dataset.row);
    });
    this.$.dur.addEventListener('change', () => host.setDuration(clamp(Number(this.$.dur.value) || 5, 0.5, 120)));
    this.$.area.addEventListener('pointerdown', (e) => this.pointerDown(e));
    this.$.area.addEventListener('dblclick', (e) => {
      const d = e.target.closest('[data-key]');
      if (d) this.easeMenu(d);
    });
    new ResizeObserver(() => this.render()).observe(this.$.area);
  }

  x2t(clientX) {
    const r = this.$.rows.getBoundingClientRect();
    return clamp((clientX - r.left) / Math.max(1, r.width), 0, 1) * this.host.anim.duration;
  }

  pointerDown(e) {
    const host = this.host;
    const d = e.target.closest('[data-key]');
    const cl = e.target.closest('[data-clip]');
    this.$.area.setPointerCapture(e.pointerId);
    if (!d && cl && host.clipOf) {
      // Plan : bords (début, fin) ou bloc entier.
      const id = cl.dataset.clip;
      const c = host.clipOf(id);
      const edge = e.target.closest('[data-edge]');
      this.drag = {
        kind: 'clip', id, c, edge: edge ? edge.dataset.edge : 'move', t0: this.x2t(e.clientX), s0: c.start, e0: c.end, moved: false,
      };
      if (id !== host.selectedId) host.onRowSelect(id);
    } else if (d) {
      const id = d.dataset.id;
      const key = host.anim.tracks[id][Number(d.dataset.key)];
      host.onKeySelect(id, key);
      this.drag = { kind: 'key', id, key, x: e.clientX, moved: false };
    } else {
      this.drag = { kind: 'scrub' };
      host.setTime(this.snap(this.x2t(e.clientX)));
    }
    const move = (ev) => {
      if (!this.drag) return;
      if (this.drag.kind === 'scrub') host.setTime(this.snap(this.x2t(ev.clientX)));
      else if (this.drag.kind === 'clip') {
        const g = this.drag;
        const dt = this.snap(this.x2t(ev.clientX)) - this.snap(g.t0);
        const D = host.anim.duration;
        g.moved = true;
        if (g.edge === 'l') g.c.start = clamp(g.s0 + dt, 0, g.c.end - 0.1);
        else if (g.edge === 'r') g.c.end = clamp(g.e0 + dt, g.c.start + 0.1, D);
        else { const len = g.e0 - g.s0; g.c.start = clamp(g.s0 + dt, 0, D - len); g.c.end = g.c.start + len; }
        if (host.onClipDrag) host.onClipDrag(g.id);
        this.render();
      } else {
        if (!this.drag.moved && Math.abs(ev.clientX - this.drag.x) < 3) return;
        this.drag.moved = true;
        this.drag.key.t = this.snap(this.x2t(ev.clientX));
        host.anim.tracks[this.drag.id].sort((a, b) => a.t - b.t);
        host.setTime(this.drag.key.t);
        this.render();
      }
    };
    const up = () => {
      if (this.drag && this.drag.kind === 'key' && this.drag.moved) host.onKeysChanged();
      if (this.drag && this.drag.kind === 'clip' && this.drag.moved && host.onClipChanged) host.onClipChanged(this.drag.id);
      this.drag = null;
      this.$.area.removeEventListener('pointermove', move);
      this.$.area.removeEventListener('pointerup', up);
    };
    this.$.area.addEventListener('pointermove', move);
    this.$.area.addEventListener('pointerup', up);
  }

  snap(t) { const f = this.host.anim.fps; return Math.round(t * f) / f; }

  easeMenu(d) {
    const host = this.host;
    const id = d.dataset.id;
    const key = host.anim.tracks[id][Number(d.dataset.key)];
    const pop = showPopover(d, `<div class="pop-title">Transition vers cette clé</div><div class="color-list">${Object.entries(EASES).map(([k, [label]]) => `<button class="color-row${key.ease === k ? ' on' : ''}" data-ease="${k}"><span class="ease-ico">${easeSvg(k)}</span><span>${label}</span>${key.ease === k ? icon('check', 14) : ''}</button>`).join('')}</div>
      <button class="btn small wide" data-del-key>${icon('trash', 13)}<span>Supprimer la clé</span></button>`, { align: 'center', above: true, width: 240 });
    if (!pop) return;
    pop.onclick = (e) => {
      const b = e.target.closest('[data-ease]');
      if (b) { key.ease = b.dataset.ease; hidePopover(); host.onKeysChanged(); return; }
      if (e.target.closest('[data-del-key]')) { removeKey(host.anim, id, key); hidePopover(); host.onKeysChanged(); }
    };
  }

  render() {
    const host = this.host;
    const anim = host.anim;
    const rows = host.rows();
    this.$.dur.value = String(anim.duration);
    for (const b of this.el.querySelectorAll('[data-fps]')) b.classList.toggle('on', Number(b.dataset.fps) === anim.fps);
    this.$.play.innerHTML = icon(host.playing ? 'pause' : 'play', 15);
    this.$.play.classList.toggle('on', host.playing);
    this.$.names.innerHTML = rows.map((r) => `<button class="tl-name${r.id === host.selectedId ? ' on' : ''}" data-row="${esc(r.id)}">${icon(r.icon, 13)}<span>${esc(r.name)}</span></button>`).join('');
    // Règle : graduations adaptées à la durée.
    const d = anim.duration;
    const step = d <= 3 ? 0.25 : d <= 8 ? 0.5 : d <= 20 ? 1 : d <= 60 ? 5 : 10;
    let ticks = '';
    for (let t = 0; t <= d + 1e-6; t += step) {
      const major = Math.abs(t - Math.round(t)) < 1e-6;
      ticks += `<span class="tick${major ? ' major' : ''}" style="left:${(t / d) * 100}%">${major ? `<em>${Math.round(t)} s</em>` : ''}</span>`;
    }
    this.$.ruler.innerHTML = ticks;
    this.$.rows.innerHTML = rows.map((r) => {
      const keys = anim.tracks[r.id] || [];
      const bar = keys.length > 1 ? `<span class="tl-span" style="left:${(keys[0].t / d) * 100}%;width:${((keys[keys.length - 1].t - keys[0].t) / d) * 100}%"></span>` : '';
      const c = host.clipOf ? host.clipOf(r.id) : null;
      const clip = c ? `<span class="tl-clip${r.media ? ' media' : ''}" data-clip="${esc(r.id)}" style="left:${(c.start / d) * 100}%;width:${(Math.max(0, c.end - c.start) / d) * 100}%" title="Plan : ${fmtSec(c.start)} → ${fmtSec(c.end)} (glisser pour déplacer, bords pour ajuster)"><i data-edge="l"></i>${c.fin ? `<em class="tin" style="width:${(c.fin / Math.max(0.01, c.end - c.start)) * 100}%"></em>` : ''}${c.fout ? `<em class="tout" style="width:${(c.fout / Math.max(0.01, c.end - c.start)) * 100}%"></em>` : ''}<b>${esc(r.name)}</b><i data-edge="r"></i></span>` : '';
      return `<div class="tl-row${r.id === host.selectedId ? ' on' : ''}">${clip}${bar}${keys.map((k, i) => `<span class="tl-key${host.selectedKey === k ? ' on' : ''}" data-id="${esc(r.id)}" data-key="${i}" style="left:${(k.t / d) * 100}%" title="${fmtSec(k.t)} · ${(EASES[k.ease] || EASES.inOut)[0]} (double-clic : transition)"></span>`).join('')}</div>`;
    }).join('');
    this.updateHead();
  }

  updateHead() {
    const host = this.host;
    const f = host.time / host.anim.duration;
    this.$.head.style.left = `${14 + clamp(f, 0, 1) * this.$.rows.clientWidth}px`;
    this.$.time.textContent = fmtSec(host.time);
  }
}

function easeSvg(k) {
  const f = (EASES[k] || EASES.inOut)[1];
  let d = 'M2 18';
  for (let i = 1; i <= 16; i++) { const t = i / 16; d += ` L${2 + t * 16} ${18 - f(t) * 16}`; }
  return `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}
