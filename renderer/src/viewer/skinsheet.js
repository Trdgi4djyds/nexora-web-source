/* Feuille « Cadres officiels » : cadres fournis (Google, licence Apache 2.0), cadres Samsung à importer depuis
 * Samsung Developers avec le compte Samsung de l'utilisateur, import d'un cadre d'émulateur (.zip). */
import { api } from '../core/api.js';
import { settings, persist } from '../core/settings.js';
import { $, esc, bus } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { openSheet, toggle, toast, currentSheet } from '../core/ui.js';
import { bundledSkins, userSkins } from '../devices/skins.js';

const SAMSUNG = [['z', 'Galaxy Z (Fold, Flip, TriFold)'], ['s', 'Galaxy S'], ['a', 'Galaxy A'], ['tab', 'Galaxy Tab'], ['watch', 'Galaxy Watch']];
const LABEL = (n) => n.replace(/_/g, ' ').replace(/\b(pixel|wearos|automotive|tv)\b/g, (m) => ({ pixel: 'Pixel', wearos: 'Wear OS', automotive: 'Automotive', tv: 'TV' }[m])).replace(/\bxl\b/g, 'XL').replace(/\bpro\b/g, 'Pro').replace(/\bfold\b/g, 'Fold');
const log = [];

function body() {
  const b = bundledSkins();
  const u = Object.values(userSkins());
  return `
    <div class="sheet-head"><span class="sheet-icon">${icon('frame', 22)}</span><div><h2>Cadres officiels</h2>
      <p>Images des fabricants, aux mesures exactes de l'écran. Quand un cadre officiel existe pour un appareil, il remplace le cadre dessiné (pastille verte dans la liste).</p></div></div>
    <div class="sheet-body sk-body">
      ${toggle('officialFrames', 'Utiliser les cadres officiels', 'Sinon, tous les appareils gardent le cadre dessiné par NEXORA.', settings.officialFrames !== false)}
      <section class="sk-sec">
        <h3>Samsung Galaxy</h3>
        <p class="sk-note">Samsung publie ses cadres sur Samsung Developers, réservés aux personnes connectées avec un compte Samsung (gratuit). Ouvre une gamme, connecte-toi, puis clique sur « Download » : chaque cadre téléchargé est importé tout seul.</p>
        <div class="sk-row" style="margin-top:8px">${SAMSUNG.map(([k, l]) => `<button class="btn" data-samsung="${k}">${icon('download', 14)}<span>${esc(l)}</span></button>`).join('')}</div>
        ${log.length ? `<div class="sk-log" style="margin-top:8px">${log.map((l) => `<div class="${l.cls}">${esc(l.text)}</div>`).join('')}</div>` : ''}
      </section>
      <section class="sk-sec">
        <h3>Cadres importés (${u.length})</h3>
        ${u.length ? `<div class="sk-grid">${u.map((s) => `<div class="sk-chip"><span title="${esc(s.name)}">${esc(s.name)}</span><small>${Object.keys(s.variants).length} vue${Object.keys(s.variants).length > 1 ? 's' : ''}</small><button class="icon-btn small" data-rm="${esc(s.id)}" title="Retirer" aria-label="Retirer ${esc(s.name)}">${icon('trash', 13)}</button></div>`).join('')}</div>` : '<p class="sk-note">Aucun pour l’instant.</p>'}
        <div class="sk-row" style="margin-top:8px"><button class="btn" data-act="import">${icon('upload', 14)}<span>Importer un cadre (.zip)</span></button></div>
      </section>
      <section class="sk-sec">
        <h3>Fournis avec NEXORA (${Object.keys(b).length})</h3>
        <div class="sk-grid">${Object.entries(b).map(([n, s]) => `<div class="sk-chip"><span>${esc(LABEL(n))}</span><small>${Object.keys(s.variants).length > 1 ? `${Object.keys(s.variants).length} vues` : 'Google'}</small></div>`).join('')}</div>
        <p class="sk-note" style="margin-top:6px">Cadres d'Android Studio (Android Open Source Project, licence Apache 2.0) : Pixel, Pixel Fold, Pixel Tablet, Wear OS, Android Automotive, Google TV.</p>
      </section>
    </div>
    <div class="sheet-foot"><span class="grow"></span><button class="btn primary" data-sheet="close">Terminé</button></div>`;
}

function refresh() {
  if (currentSheet() !== 'skins') return;
  const sh = $('#sheet');
  const top = $('.sheet-body', sh)?.scrollTop || 0;
  sh.innerHTML = body();
  const sb = $('.sheet-body', sh);
  if (sb) sb.scrollTop = top;
}

export function openSkins() {
  const sh = openSheet('skins', body(), { wide: true, refresh: () => refresh() });
  if (sh.dataset.skinsWired) return;
  sh.dataset.skinsWired = '1';
  sh.addEventListener('change', (e) => {
    if (currentSheet() !== 'skins' || e.target.dataset.toggle !== 'officialFrames') return;
    settings.officialFrames = e.target.checked;
    persist();
    bus.emit('skins-changed');
  });
  sh.addEventListener('click', async (e) => {
    if (currentSheet() !== 'skins') return;
    const t = e.target.closest('[data-samsung],[data-rm],[data-act]');
    if (!t) return;
    if (t.dataset.samsung) api.invoke('skins:samsung', { page: t.dataset.samsung });
    else if (t.dataset.rm) { await api.invoke('skins:remove', t.dataset.rm); }
    else if (t.dataset.act === 'import') {
      try {
        const r = await api.invoke('skins:import');
        if (r && r.length) toast(`${r.length} cadre${r.length > 1 ? 's' : ''} importé${r.length > 1 ? 's' : ''}.`);
      } catch (err) { toast(err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), { kind: 'bad' }); }
    }
  });
}

export function initSkinSheet() {
  const btn = $('#skinsBtn');
  if (btn) { btn.innerHTML = icon('frame', 15); btn.addEventListener('click', openSkins); }
  api.on('skins:progress', (p) => {
    const text = p.state === 'imported' ? `Importé : ${p.name} (${p.variants} vue${p.variants > 1 ? 's' : ''})` : p.state === 'start' ? `Téléchargement : ${p.name}…` : `Échec : ${p.name}${p.error ? ` — ${p.error}` : ''}`;
    log.unshift({ text, cls: p.state === 'imported' ? 'ok' : p.state === 'failed' ? 'bad' : '' });
    log.length = Math.min(log.length, 12);
    if (p.state === 'imported') toast(`Cadre officiel importé : ${p.name}`);
    refresh();
  });
  bus.on('skins-changed', refresh);
}
