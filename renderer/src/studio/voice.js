/* Voix-off et sous-titres des vidéos du Studio : le texte est lu par une voix de Windows (gratuite, hors ligne),
 * mélangé à la musique, et découpé en sous-titres synchronisés, incrustés dans la vidéo et exportables en .srt. */
import { api } from '../core/api.js';
import { $, esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { settings, persist } from '../core/settings.js';
import { toast, openSheet, closeSheet } from '../core/ui.js';
import { decodeMusic } from './music.js';

const fmtSrt = (t) => { const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000); const m = Math.floor(ms / 60000) % 60; const s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };

/* Découpe en phrases courtes (≤ 2 lignes de sous-titre), chacune avec son temps, proportionnel à sa longueur. */
export function cues(text, duration, lead = 0.25) {
  const parts = String(text).replace(/\s+/g, ' ').trim().split(/(?<=[.!?…;:])\s+/).flatMap((p) => {
    if (p.length <= 84) return [p];
    const out = []; let cur = '';
    for (const w of p.split(' ')) { if ((`${cur} ${w}`).trim().length > 70 && cur) { out.push(cur); cur = w; } else cur = `${cur} ${w}`.trim(); }
    if (cur) out.push(cur);
    return out;
  }).filter(Boolean);
  const total = parts.reduce((a, p) => a + p.length + 6, 0) || 1;
  const span = Math.max(0.5, duration - lead - 0.1);
  let t = lead;
  return parts.map((p) => { const d = ((p.length + 6) / total) * span; const c = { start: t, end: t + d, text: p }; t += d; return c; });
}

export function drawSubtitles(ctx, subs, t, W, H, style = {}) {
  if (!subs || !subs.length) return;
  const c = subs.find((s) => t >= s.start && t < s.end);
  if (!c) return;
  const size = Math.round(Math.min(W, H) * (style.size || 0.045));
  ctx.save();
  ctx.font = `700 ${size}px Inter, "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const words = c.text.split(' '); const lines = []; let cur = '';
  for (const w of words) { const tryL = cur ? `${cur} ${w}` : w; if (ctx.measureText(tryL).width > W * 0.82 && cur) { lines.push(cur); cur = w; } else cur = tryL; }
  lines.push(cur);
  const lh = size * 1.25; const y0 = H * (style.y || 0.86) - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => {
    const y = y0 + i * lh; const w = ctx.measureText(l).width;
    if (style.box !== false) { ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.beginPath(); ctx.roundRect(W / 2 - w / 2 - size * 0.45, y - lh / 2, w + size * 0.9, lh, size * 0.3); ctx.fill(); }
    ctx.fillStyle = '#ffffff';
    if (style.box === false) { ctx.lineWidth = size * 0.16; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round'; ctx.strokeText(l, W / 2, y); }
    ctx.fillText(l, W / 2, y);
  });
  ctx.restore();
}

export function installVoice(Studio) {
  const P = Studio.prototype;

  P.voiceCard = function voiceCard() {
    const v = this.voice;
    return `<section class="st-card"><div class="st-field"><span>Voix-off et sous-titres</span></div>
      ${v ? `<div class="st-music">${icon('chat', 16)}<span>${esc(v.voiceName || 'Voix-off')}<small>${Math.round(v.buffer.duration)} s · ${this.subtitles ? this.subtitles.length : 0} sous-titre(s)</small></span><button class="icon-btn small" data-music="voice" title="Modifier">${icon('text', 13)}</button><button class="icon-btn small" data-music="voice-rm" title="Retirer">${icon('trash', 13)}</button></div>
        <label class="check-row"><input type="checkbox" data-subs="on" ${this.subsOn !== false ? 'checked' : ''}><span class="box"></span><span>Incruster les sous-titres dans la vidéo</span></label>
        <button class="btn small wide" data-music="srt">${icon('download', 13)}<span>Exporter les sous-titres (.srt)</span></button>`
    : `<button class="btn small wide" data-music="voice">${icon('chat', 13)}<span>Ajouter une voix-off…</span></button><p class="pop-note">Écris le texte : une voix de Windows le lit, les sous-titres sont créés et synchronisés automatiquement.</p>`}
    </section>`;
  };

  P.openVoice = async function openVoice() {
    const sheet = openSheet('voice', `
      <div class="sheet-head"><span class="sheet-icon">${icon('chat', 22)}</span><div><h2>Voix-off</h2><p>1. Écris ce que la voix doit dire. 2. Choisis une voix. 3. Écoute, puis ajoute-la à la vidéo : elle est mélangée à la musique et les sous-titres sont créés.</p></div></div>
      <div class="sheet-body">
        <label class="field"><span>Texte de la voix-off</span><textarea class="input" rows="7" data-v="text" placeholder="Découvre Marché Dantokpa : commande en deux minutes, livraison partout à Cotonou.">${esc((this.voice && this.voice.text) || settings.voiceText || '')}</textarea></label>
        <div class="ab-grid2"><label class="field"><span>Voix</span><select class="input" data-v="voice"><option value="">Chargement des voix…</option></select></label>
        <label class="field"><span>Vitesse</span><input type="range" min="-5" max="5" step="1" value="${settings.voiceRate ?? 0}" data-v="rate"></label></div>
        <p class="pop-note" data-v-note>Les voix proviennent de Windows (Paramètres › Heure et langue › Voix pour en ajouter). Durée estimée : <b data-v-dur>—</b></p>
      </div>
      <div class="sheet-foot"><button class="btn" data-v-act="listen">${icon('play', 14)}<span>Écouter</span></button><span class="grow"></span><button class="btn" data-sheet="close">Annuler</button><button class="btn primary" data-v-act="apply">${icon('check', 14)}<span>Ajouter à la vidéo</span></button></div>`);
    const sel = $('[data-v="voice"]', sheet);
    const txt = $('[data-v="text"]', sheet);
    const est = () => { const n = txt.value.trim().split(/\s+/).filter(Boolean).length; $('[data-v-dur]', sheet).textContent = n ? `≈ ${Math.max(1, Math.round(n / 2.6))} s` : '—'; };
    txt.addEventListener('input', est); est();
    try {
      const r = await api.invoke('tts:voices');
      if (!r.ok || !r.voices.length) { sel.innerHTML = '<option value="">Aucune voix disponible</option>'; $('[data-v-note]', sheet).textContent = r.error || 'Aucune voix n’est installée sur ce PC.'; } else {
        const fr = r.voices.filter((v) => /^fr/i.test(v.lang));
        const list = [...fr, ...r.voices.filter((v) => !/^fr/i.test(v.lang))];
        sel.innerHTML = list.map((v) => `<option value="${esc(v.name)}" ${v.name === settings.voiceName ? 'selected' : ''}>${esc(v.name.replace(/^Microsoft\s+/, '').replace(/\s+Desktop$/, ''))} — ${esc(v.lang)}${v.gender === 'Female' ? ', femme' : v.gender === 'Male' ? ', homme' : ''}</option>`).join('');
      }
    } catch (e) { sel.innerHTML = '<option value="">Voix indisponibles</option>'; }
    const synth = async () => {
      settings.voiceText = txt.value; settings.voiceName = sel.value; settings.voiceRate = Number($('[data-v="rate"]', sheet).value); persist();
      const bytes = await api.invoke('tts:speak', { text: txt.value, voice: sel.value, rate: settings.voiceRate });
      return decodeMusic(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    };
    sheet.onclick = async (e) => {
      const b = e.target.closest('[data-v-act]');
      if (!b) return;
      b.disabled = true;
      const t = toast(b.dataset.vAct === 'listen' ? 'Préparation de l’écoute…' : 'Création de la voix-off…', { busy: true, sticky: true });
      try {
        const buf = await synth();
        if (b.dataset.vAct === 'listen') {
          const ac = new AudioContext(); const src = ac.createBufferSource(); src.buffer = buf; src.connect(ac.destination); src.start();
        } else {
          await this.applyVoice(buf, txt.value, sel.selectedOptions[0] ? sel.selectedOptions[0].textContent.split(' — ')[0] : 'Voix-off');
          closeSheet('voice');
        }
      } catch (err) { toast(err.message || String(err), { kind: 'bad' }); } finally { t.close(); b.disabled = false; }
    };
  };

  P.applyVoice = async function applyVoice(buffer, text, voiceName) {
    this.voice = { buffer, text, voiceName };
    if (!this.musicBase && this.music && !this.music.isMix) this.musicBase = this.music;
    const base = this.musicBase;
    const lead = 0.3;
    const len = Math.max(buffer.duration + lead + 0.6, base ? Math.min(base.buffer.duration, buffer.duration + 3) : 0);
    const sr = 48000;
    const oc = new OfflineAudioContext(2, Math.ceil(len * sr), sr);
    if (base) {
      const m = oc.createBufferSource(); m.buffer = base.buffer;
      const g = oc.createGain(); g.gain.value = (base.volume ?? 0.8) * 0.35; // la musique baisse sous la voix
      m.connect(g).connect(oc.destination); m.start(0, base.offset || 0);
    }
    const v = oc.createBufferSource(); v.buffer = buffer; v.connect(oc.destination); v.start(lead);
    const mixed = await oc.startRendering();
    this.music = { name: base ? `${base.name} + voix-off` : 'Voix-off', buffer: mixed, volume: 1, offset: 0, fadeIn: 0, fadeOut: 0.6, loop: false, isMix: true };
    this.subtitles = cues(text, buffer.duration + lead, lead);
    if (this.anim.duration < len) this.setDuration(Math.min(120, Math.ceil(len)));
    this.renderProps();
    this.dirty = true;
    toast(`Voix-off ajoutée (${Math.round(buffer.duration)} s) avec ${this.subtitles.length} sous-titre(s).`);
  };

  P.voiceAction = async function voiceAction(a) {
    if (a === 'voice') { await this.openVoice(); return true; }
    if (a === 'voice-rm') { this.voice = null; this.subtitles = null; this.music = this.musicBase || null; this.musicBase = null; this.renderProps(); return true; }
    if (a === 'srt' && this.subtitles) {
      const srt = this.subtitles.map((c, i) => `${i + 1}\n${fmtSrt(c.start)} --> ${fmtSrt(c.end)}\n${c.text}\n`).join('\n');
      const f = await api.invoke('lab:save-text', { name: 'Sous-titres.srt', text: srt, filters: [{ name: 'Sous-titres', extensions: ['srt'] }] });
      if (f) toast('Sous-titres enregistrés.', { action: 'Afficher', onAction: () => api.invoke('lab:reveal', f) });
      return true;
    }
    return false;
  };

  // Sous-titres incrustés : dans l'aperçu et dans chaque image exportée, quel que soit l'espace.
  const paint = P.paintOverlay;
  P.paintOverlay = function paintOverlayWithSubs(canvas, t, still) {
    const out = paint.call(this, canvas, t, still);
    if (this.subtitles && this.subsOn !== false) drawSubtitles(canvas.getContext('2d'), this.subtitles, t, canvas.width, canvas.height);
    return out;
  };
  const draw = P.drawOverlay;
  P.drawOverlay = function drawOverlayWithSubs() {
    draw.call(this);
    const c = this.$.overlay;
    if (!c || !this.subtitles || this.subsOn === false) return;
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawSubtitles(ctx, this.subtitles, this.time, c.width, c.height);
  };
}
