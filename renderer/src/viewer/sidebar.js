/* Barre latérale : source (lien ou projet) et liste des appareils. */
import { api } from '../core/api.js';
import { S } from '../core/state.js';
import { settings, persist } from '../core/settings.js';
import { $, $$, esc, bus } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, openSheet, closeSheet } from '../core/ui.js';
import { CATEGORIES, DEVICES, resolveState } from '../devices/catalog.js';
import {
  looksLikeUrl, openUrl, pickProject, closeSource, startProject,
} from './sources.js';
import { MAX_DEVICES } from './board.js';
import { skinFor } from '../devices/skins.js';

const STATUS_LABEL = {
  idle: 'Prêt', checking: 'Vérification des outils…', installing: 'Installation…', starting: 'Démarrage…', running: 'En ligne', stopped: 'Arrêté', error: 'Erreur', 'missing-sdk': 'Outil manquant', 'needs-web': 'Version web absente', unsupported: 'Non affichable',
};
function statusDot(st) {
  return {
    running: 'ok', checking: 'busy', installing: 'busy', starting: 'busy', error: 'bad', 'missing-sdk': 'bad', unsupported: 'bad', 'needs-web': 'warn',
  }[st] || 'idle';
}

const allDevices = () => DEVICES.concat(settings.custom || []);

export function renderSource() {
  const panel = $('#sourcePanel');
  const src = S.source;
  if (!src) {
    panel.innerHTML = `
      <form class="link-field" data-form="link">
        <span class="lf-ico">${icon('link', 15)}</span>
        <input id="sideLink" placeholder="Colle un lien" spellcheck="false" aria-label="Lien du site">
        <button type="button" class="lf-paste" data-act="paste" title="Coller depuis le presse-papiers" aria-label="Coller">${icon('paste', 15)}</button>
      </form>
      <button class="btn wide" data-act="pick">${icon('folder', 16)}<span>Ouvrir un dossier de projet</span></button>`;
    return;
  }
  if (src.mode === 'url') {
    panel.innerHTML = `
      <div class="src-card">
        <div class="src-row"><span class="src-icon globe">${icon('globe', 16)}</span><div class="src-text"><div class="src-name">${esc(src.name)}</div><div class="src-sub" title="${esc(src.url)}">${esc(src.url)}</div></div><button class="icon-btn small" data-act="close" title="Fermer" aria-label="Fermer">${icon('close', 14)}</button></div>
      </div>`;
    return;
  }
  const a = src.analysis || {};
  const st = S.server.status;
  const busy = ['checking', 'installing', 'starting'].includes(st);
  const scripts = Object.keys(a.scripts || {});
  panel.innerHTML = `
    <div class="src-card">
      <div class="src-row"><span class="src-icon">${icon('folder', 16)}</span><div class="src-text"><div class="src-name">${esc(src.name)}</div><div class="src-sub" title="${esc(src.dir)}">${esc(a.label || '')}${a.pm ? ` · ${esc(a.pm)}` : ''}</div></div><button class="icon-btn small" data-act="close" title="Fermer le projet" aria-label="Fermer le projet">${icon('close', 14)}</button></div>
      <div class="src-status"><span class="dot ${statusDot(st)}"></span><span>${esc(STATUS_LABEL[st] || st)}</span>${S.server.url ? `<button class="link-btn small" data-act="external" title="Ouvrir dans le navigateur">${esc(S.server.url.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</button>` : ''}</div>
      ${scripts.length > 1 ? `<label class="field"><span>Script</span><select class="input" data-field="script">${scripts.map((s) => `<option value="${esc(s)}" ${s === src.script ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>` : ''}
      <div class="btn-row">
        ${st === 'running' || busy
    ? `<button class="btn" data-act="restart">${icon('restart', 15)}<span>Redémarrer</span></button><button class="btn" data-act="stop">${icon('stop', 13)}<span>Arrêter</span></button>`
    : `<button class="btn primary" data-act="start">${icon('play', 14)}<span>Démarrer</span></button>`}
      </div>
      ${(a.staticDirs || []).filter((d) => d !== 'public').map((d) => `<button class="link-btn small" data-static="${esc(d)}">Servir le dossier ${esc(d)}/</button>`).join('')}
    </div>`;
}

function dims(dev) {
  const st = resolveState(dev, null);
  return `${st.approx ? '≈ ' : ''}${st.w}×${st.h}`;
}

const hasSkin = (d) => (d.states || [{ id: null }]).some((st) => Boolean(skinFor(d, resolveState(d, st.id))));

export function renderDeviceList() {
  const list = $('#deviceList');
  const q = S.search.trim().toLowerCase();
  const multi = settings.layout === 'multi';
  const onBoard = new Set(settings.devices.map((d) => d.deviceId));
  const focusedDev = (settings.devices.find((d) => d.uid === settings.focused) || settings.devices[0]).deviceId;
  const html = CATEGORIES.map((cat) => {
    const items = allDevices().filter((d) => (d.category === cat.id || (d.alsoIn || []).includes(cat.id)) && (!q || d.name.toLowerCase().includes(q) || cat.label.toLowerCase().includes(q)));
    if (!items.length && (cat.id !== 'custom' || q)) return '';
    const collapsed = !q && settings.collapsed[cat.id];
    return `<section class="grp${collapsed ? ' collapsed' : ''}">
      <button class="grp-head" data-grp="${cat.id}" aria-expanded="${!collapsed}">
        <span class="grp-icon" style="--c:${cat.color}">${icon(cat.glyph, 13)}</span>
        <span class="grp-label">${esc(cat.label)}</span>
        <span class="grp-chev">${icon('chevronDown', 12)}</span>
      </button>
      <div class="grp-body" role="listbox" aria-label="${esc(cat.label)}" ${multi ? 'aria-multiselectable="true"' : ''}>
        ${items.map((d) => {
    const sel = multi ? onBoard.has(d.id) : d.id === focusedDev;
    return `
          <button class="dev-row${sel ? ' selected' : ''}${multi ? ' multi' : ''}" role="option" aria-selected="${sel}" data-dev="${esc(d.id)}">
            ${multi ? `<span class="dr-check">${sel ? icon('check', 11) : ''}</span>` : ''}
            <span class="dr-name">${esc(d.name)}</span>${hasSkin(d) ? '<span class="dr-off" title="Cadre officiel du fabricant"></span>' : ''}
            ${d.states ? `<span class="dr-badge">${d.states.length === 2 ? `${esc(d.states[0].label)} · ${esc(d.states[1].label)}` : `${d.states.length} modes`}</span>` : `<span class="dr-dims">${esc(dims(d))}</span>`}
            ${d.category === 'custom' ? `<span class="dr-del" data-del="${esc(d.id)}" title="Supprimer" aria-label="Supprimer ${esc(d.name)}">${icon('close', 12)}</span>` : ''}
          </button>`;
  }).join('')}
        ${cat.id === 'custom' ? `<button class="dev-row add" data-act="add-device">${icon('plus', 14)}<span class="dr-name">Ajouter un appareil</span></button>` : ''}
      </div>
    </section>`;
  }).join('');
  list.innerHTML = html || '<p class="empty-note">Aucun appareil ne correspond à cette recherche.</p>';
  const selected = $('.dev-row.selected', list);
  if (selected && !list.dataset.scrolled) { selected.scrollIntoView({ block: 'center' }); list.dataset.scrolled = '1'; }
}

export function initSidebar() {
  const panel = $('#sourcePanel');
  panel.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act],[data-static]');
    if (!t) return;
    if (t.dataset.static) { startProject({ staticDir: t.dataset.static }); return; }
    switch (t.dataset.act) {
      case 'pick': pickProject(); break;
      case 'paste': {
        const txt = (await api.invoke('clipboard:read')).trim();
        $('#sideLink').value = txt;
        if (looksLikeUrl(txt)) openUrl(txt); else toast('Le presse-papiers ne contient pas de lien.', { kind: 'bad' });
        break;
      }
      case 'close': closeSource(); break;
      case 'start': case 'restart': startProject(); break;
      case 'stop': api.invoke('project:stop'); break;
      case 'external': api.invoke('shell:external', S.board.focused.url || S.server.url); break;
      default: break;
    }
  });
  panel.addEventListener('submit', (e) => { e.preventDefault(); openUrl($('#sideLink').value); });
  panel.addEventListener('change', (e) => { if (e.target.dataset.field === 'script') S.source.script = e.target.value; });
  panel.addEventListener('paste', (e) => {
    if (e.target.id !== 'sideLink') return;
    const txt = e.clipboardData.getData('text');
    if (looksLikeUrl(txt)) { e.preventDefault(); e.target.value = txt.trim(); openUrl(txt); }
  });

  const list = $('#deviceList');
  list.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      const id = del.dataset.del;
      settings.custom = settings.custom.filter((d) => d.id !== id);
      for (const v of S.board.list) if (v.cfg.deviceId === id) v.setDevice(DEVICES[0].id);
      persist();
      renderDeviceList();
      return;
    }
    const grp = e.target.closest('[data-grp]');
    if (grp) { settings.collapsed[grp.dataset.grp] = !settings.collapsed[grp.dataset.grp]; persist(); renderDeviceList(); return; }
    if (e.target.closest('[data-act="add-device"]')) { openCustomDevice(); return; }
    const r = e.target.closest('[data-dev]');
    if (!r) return;
    if (settings.layout === 'multi' && !settings.devices.some((d) => d.deviceId === r.dataset.dev) && settings.devices.length >= MAX_DEVICES) {
      toast(`La planche contient déjà ${MAX_DEVICES} appareils. Retires-en un pour en ajouter un autre.`, { kind: 'bad' });
      return;
    }
    S.board.selectDevice(r.dataset.dev);
    renderDeviceList();
  });
  list.addEventListener('keydown', (e) => {
    if (settings.layout === 'multi' || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    const rows = $$('.dev-row[data-dev]', list);
    const cur = S.board.focused.cfg.deviceId;
    const i = rows.findIndex((r) => r.dataset.dev === cur);
    const next = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (!next) return;
    e.preventDefault();
    const id = next.dataset.dev;
    S.board.selectDevice(id);
    renderDeviceList();
    const row = $(`.dev-row[data-dev="${id}"]`, list);
    if (row) { row.focus(); row.scrollIntoView({ block: 'nearest' }); }
  });
  $('#deviceSearch').addEventListener('input', (e) => { S.search = e.target.value; renderDeviceList(); });
  bus.on('source', renderSource);
  bus.on('board-changed', renderDeviceList);
  bus.on('skins-changed', renderDeviceList);
  document.addEventListener('submit', (e) => {
    if (e.target.closest('.device-form')) { e.preventDefault(); saveCustomDevice(); }
  });
}

// ------------------------------------------------------------------ appareil personnalisé
function openCustomDevice() {
  openSheet('device', `
    <form class="device-form">
      <div class="sheet-head"><span class="sheet-icon">${icon('plus', 22)}</span><div><h2>Ajouter un appareil</h2><p>Les dimensions sont en pixels CSS, appareil tenu droit. La densité correspond au devicePixelRatio. La diagonale sert à dessiner un cadre aux bonnes proportions.</p></div></div>
      <div class="sheet-body form-grid">
        <label class="field full"><span>Nom</span><input class="input" name="name" placeholder="Tecno Camon 40 Pro" required maxlength="60" data-autofocus></label>
        <label class="field"><span>Largeur</span><input class="input" name="w" type="number" min="120" max="5000" value="393" required></label>
        <label class="field"><span>Hauteur</span><input class="input" name="h" type="number" min="120" max="5000" value="873" required></label>
        <label class="field"><span>Densité</span><input class="input" name="dpr" type="number" min="1" max="5" step="0.025" value="2.75" required></label>
        <label class="field"><span>Diagonale (pouces)</span><input class="input" name="diag" type="number" min="1" max="120" step="0.01" value="6.7"></label>
        <label class="field full"><span>Type</span><select class="input" name="kind">
          <option value="android">Téléphone Android</option><option value="ios">iPhone</option><option value="android-tablet">Tablette Android</option><option value="ipados">iPad</option><option value="windows">Ordinateur</option><option value="tv">Téléviseur</option>
        </select></label>
        <label class="check-row full"><input type="checkbox" name="foldable"><span class="box"></span><span>Appareil pliable : ajouter un état « Ouvert »</span></label>
        <div class="fold-fields full" hidden>
          <label class="field"><span>Largeur ouvert</span><input class="input" name="ow" type="number" min="120" max="5000" value="750"></label>
          <label class="field"><span>Hauteur ouvert</span><input class="input" name="oh" type="number" min="120" max="5000" value="832"></label>
        </div>
      </div>
      <div class="sheet-foot"><span class="grow"></span><button type="button" class="btn" data-sheet="close">Annuler</button><button type="submit" class="btn primary">Ajouter</button></div>
    </form>`);
  const form = $('#sheet .device-form');
  form.foldable.addEventListener('change', () => { $('.fold-fields', form).hidden = !form.foldable.checked; });
}

function saveCustomDevice() {
  const form = $('#sheet .device-form');
  if (!form || !form.reportValidity()) return;
  const kind = form.kind.value;
  const frame = {
    ios: 'island', android: 'punch', 'android-tablet': 'tablet', ipados: 'tablet', windows: 'monitor', tv: 'tv',
  }[kind];
  const w = Math.round(form.w.value);
  const hh = Math.round(form.h.value);
  const dpr = Number(form.dpr.value) || 1;
  const diag = Number(form.diag.value) || null;
  const fixed = kind === 'windows' || kind === 'tv';
  const p = diag ? { diag, px: [Math.round(w * dpr), Math.round(hh * dpr)], form: fixed ? (kind === 'tv' ? 'tv' : 'monitor') : (frame === 'tablet' ? 'tablet' : 'phone') } : null;
  if (p && frame === 'island') Object.assign(p, { sr: 9, cut: { t: 'island', css: true, w: 124, h: 36, y: 11 } });
  if (p && frame === 'punch') Object.assign(p, { sr: 6.4, cut: { t: 'punch', d: 3.3, y: 4.1 } });
  if (p && frame === 'tablet') Object.assign(p, { sr: 4, bezelCam: true, bz: [8, 8, 8, 8] });
  if (p && fixed) Object.assign(p, { sr: 0, br: 3, bz: kind === 'tv' ? [7, 7, 10, 7] : [7, 7, 14, 7], stand: kind === 'tv' ? { kind: 'feet', h: 60, at: [0.12, 0.88] } : { kind: 'column', h: 120, foot: [220, 170] } });
  const dev = {
    id: `custom-${Date.now().toString(36)}`, name: form.name.value.trim().slice(0, 60), category: 'custom', os: kind, w, h: hh, dpr, frame, fixed, colors: [['Noir', '#2a2b2f'], ['Argent', '#c9ccd1']],
  };
  if (p) dev.p = p;
  if (form.foldable.checked) {
    const ow = Math.round(form.ow.value);
    const oh = Math.round(form.oh.value);
    dev.fold = { kind: 'book' };
    dev.states = [
      { id: 'closed', label: 'Fermé', w, h: hh, frame: kind === 'ios' ? 'island' : 'fold-cover', p: p ? { ...p, hinge: 'left' } : undefined },
      { id: 'open', label: 'Ouvert', w: ow, h: oh, frame: 'fold-open', p: diag ? { diag: diag * 1.3, px: [ow * dpr, oh * dpr], sr: 4, cut: { t: 'punch', d: 3.3, cx: 0.75, y: 4.4 }, hinge: 'v', crease: 'v' } : undefined },
    ];
    dev.defaultState = 'open';
    delete dev.p;
  }
  settings.custom = [...(settings.custom || []), dev];
  settings.collapsed.custom = false;
  closeSheet();
  S.board.selectDevice(dev.id);
  renderDeviceList();
  toast(`${dev.name} ajouté à « Mes appareils »`);
}
