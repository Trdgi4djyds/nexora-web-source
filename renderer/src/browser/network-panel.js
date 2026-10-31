/* Panneau Réseau : toutes les requêtes avec cascade détaillée (DNS, connexion, TLS, attente, téléchargement),
 * filtres, tiers, blocage d'adresses, débit simulé, détails (en-têtes, aperçu, temps), synthèse par domaine
 * et par type, export HAR. */
import { api } from '../core/api.js';
import {
  $, esc, fmtBytes, fmtMs,
} from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast } from '../core/ui.js';

const TYPES = {
  all: 'Tout', doc: 'Doc', css: 'CSS', js: 'JS', img: 'Images', font: 'Polices', fetch: 'Fetch/XHR', media: 'Médias', ws: 'WS', other: 'Autres',
};
const COLORS = {
  queue: '#c7c7cc', dns: '#2fb6c8', connect: '#f2994a', ssl: '#b47cff', send: '#7aa7ff', wait: '#34c759', receive: '#0a84ff',
};
const MAX_ROWS = 1500;

const hostOf = (u) => { try { return new URL(u).host; } catch { return ''; } };
const nameOf = (u) => {
  try {
    const x = new URL(u);
    if (x.protocol === 'data:') return u.slice(0, 40);
    const last = x.pathname.split('/').filter(Boolean).pop() || x.host;
    return decodeURIComponent(last) + (x.search ? x.search.slice(0, 40) : '');
  } catch { return u.slice(0, 60); }
};

function phases(e) {
  const t = e.timing;
  const total = e.end && e.start ? (e.end - e.start) * 1000 : null;
  if (!t) return { total, parts: total ? [['wait', 0, total]] : [] };
  const base = (t.requestTime - e.start) * 1000;
  const seg = (k, a, b) => (t[a] >= 0 && t[b] >= 0 && t[b] > t[a] ? [k, base + t[a], t[b] - t[a]] : null);
  const parts = [
    ['queue', 0, Math.max(0, base + Math.max(0, [t.dnsStart, t.connectStart, t.sendStart].find((x) => x >= 0) || 0))],
    seg('dns', 'dnsStart', 'dnsEnd'),
    seg('connect', 'connectStart', 'sslStart') || seg('connect', 'connectStart', 'connectEnd'),
    seg('ssl', 'sslStart', 'sslEnd'),
    seg('send', 'sendStart', 'sendEnd'),
    t.receiveHeadersEnd > t.sendEnd ? ['wait', base + t.sendEnd, t.receiveHeadersEnd - t.sendEnd] : null,
    total ? ['receive', base + t.receiveHeadersEnd, Math.max(0, total - base - t.receiveHeadersEnd)] : null,
  ].filter((x) => x && x[2] > 0);
  return { total, parts };
}

export default class NetworkPanel {
  constructor(lab, el) {
    this.lab = lab;
    this.el = el;
    this.entries = new Map();
    this.page = {};
    this.filter = { type: 'all', text: '', party: 'all' };
    this.view = 'list';
    this.selected = null;
    this.preserve = false;
    this.cacheOff = Boolean(lab.st.cacheOff);
    this.blocked = lab.st.blocked || '';
    this.render();
    api.on('lab:net', (m) => this.onNet(m));
    lab.on('attach', () => this.start());
    el.addEventListener('click', (e) => this.onClick(e));
    el.addEventListener('input', (e) => this.onInput(e));
    if (lab.wcId) this.start();
  }

  activate() { this.active = true; this.paint(); }
  deactivate() { this.active = false; }

  async start() {
    if (!this.lab.wcId) return;
    this.wcId = this.lab.wcId;
    this.entries.clear();
    await api.invoke('lab:net-start', { wcId: this.wcId, preserve: this.preserve }).catch(() => {});
    if (this.cacheOff) api.invoke('lab:net-cache', { wcId: this.wcId, disabled: true }).catch(() => {});
    if (this.blocked) api.invoke('lab:net-block', { wcId: this.wcId, patterns: this.blocked.split(/[\s,]+/) }).catch(() => {});
    this.paint();
  }

  onNet(m) {
    if (m.wcId !== this.wcId) return;
    if (m.reset) { this.entries.clear(); this.selected = null; }
    for (const e of m.upserts || []) this.entries.set(e.id, { ...(this.entries.get(e.id) || {}), ...e });
    if (m.page) this.page = { ...this.page, ...m.page };
    if (this.active && !this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.paint(); });
  }

  render() {
    this.el.innerHTML = `
      <div class="nt">
        <div class="nt-bar">
          <button class="icon-btn small" data-act="clear" title="Effacer">${icon('trash', 13)}</button>
          <label class="nt-check"><input type="checkbox" data-opt="preserve"> Conserver</label>
          <label class="nt-check"><input type="checkbox" data-opt="cache" ${this.cacheOff ? 'checked' : ''}> Sans cache</label>
          <input class="input nt-search" placeholder="Filtrer (adresse, type, -exclure)" spellcheck="false">
          <select class="input nt-party" data-opt="party"><option value="all">Tous domaines</option><option value="first">Ce site</option><option value="third">Tiers</option></select>
          <button class="btn small" data-act="view">${icon('layers', 13)}<span>Synthèse</span></button>
          <button class="btn small" data-act="har">${icon('download', 13)}<span>HAR</span></button>
        </div>
        <div class="nt-types">${Object.entries(TYPES).map(([k, v]) => `<button data-type="${k}" class="${k === 'all' ? 'on' : ''}">${v}</button>`).join('')}</div>
        <div class="nt-main"><div class="nt-list"></div><div class="nt-detail" hidden></div></div>
        <div class="nt-sum"></div>
        <details class="nt-more"><summary>Bloquer des adresses</summary><input class="input mono" data-opt="block" placeholder="*.doubleclick.net, *analytics*, https://cdn.site.com/lourd.js" value="${esc(this.blocked)}"><small class="bl-hint">Simule l’absence d’un script ou d’un service tiers. Motifs séparés par des virgules.</small></details>
      </div>`;
  }

  rows() {
    const origin = (() => { try { return new URL(this.lab.url).host.replace(/^www\./, ''); } catch { return ''; } })();
    const words = this.filter.text.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let list = [...this.entries.values()].sort((a, b) => (a.start || 0) - (b.start || 0));
    if (this.filter.type !== 'all') list = list.filter((e) => e.type === this.filter.type);
    if (this.filter.party !== 'all') list = list.filter((e) => { const h = hostOf(e.url).replace(/^www\./, ''); const first = h === origin || h.endsWith(`.${origin}`); return this.filter.party === 'first' ? first : !first; });
    for (const w of words) {
      if (w.startsWith('-') && w.length > 1) list = list.filter((e) => !e.url.toLowerCase().includes(w.slice(1)));
      else if (/^status:\d/.test(w)) list = list.filter((e) => String(e.status || '').startsWith(w.slice(7)));
      else list = list.filter((e) => e.url.toLowerCase().includes(w) || (e.mime || '').includes(w));
    }
    return list;
  }

  paint() {
    if (!this.el.isConnected) return;
    const list = this.rows();
    const all = [...this.entries.values()];
    const t0 = Math.min(...all.map((e) => e.start || Infinity));
    const tEnd = Math.max(...all.map((e) => e.end || e.start || 0), this.page.load || 0);
    const span = Math.max(0.05, (tEnd - t0) * 1000);
    const box = $('.nt-list', this.el);
    if (this.view === 'summary') { box.innerHTML = this.summaryHtml(all); this.paintSum(all, t0); return; }
    const pct = (ms) => `${Math.max(0, Math.min(100, (ms / span) * 100)).toFixed(3)}%`;
    const line = (ts, cls) => (ts && Number.isFinite(t0) ? `<i class="nt-line ${cls}" style="left:${pct((ts - t0) * 1000)}"></i>` : '');
    const shown = list.slice(-MAX_ROWS);
    box.innerHTML = `
      <table class="nt-table">
        <thead><tr><th>Nom</th><th>Statut</th><th>Type</th><th>Taille</th><th>Durée</th><th class="nt-wf-h">Cascade${line(this.page.dcl, 'dcl')}${line(this.page.load, 'load')}</th></tr></thead>
        <tbody>${shown.map((e) => {
    const ph = phases(e);
    const off = ((e.start - t0) * 1000) || 0;
    const bad = e.failed || e.status >= 400;
    const size = e.fromMemory ? '(mémoire)' : e.fromCache ? '(cache)' : e.fromSW ? '(service worker)' : e.encoded ? fmtBytes(e.encoded) : '—';
    return `<tr data-id="${esc(e.id)}" class="${bad ? 'bad' : ''} ${this.selected === e.id ? 'sel' : ''}">
            <td class="nt-name" title="${esc(e.url)}"><b>${esc(nameOf(e.url))}</b><small>${esc(hostOf(e.url))}</small></td>
            <td>${e.failed ? `<span class="bad">${esc(e.canceled ? 'annulée' : e.blocked ? 'bloquée' : 'échec')}</span>` : e.status ? `<span class="${e.status >= 400 ? 'bad' : e.status >= 300 ? 'warn' : ''}">${e.status}</span>` : '<span class="muted">…</span>'}</td>
            <td>${esc(e.type)}</td>
            <td title="${e.decoded ? `${fmtBytes(e.decoded)} décompressés` : ''}">${size}</td>
            <td>${ph.total != null ? fmtMs(ph.total) : '…'}</td>
            <td class="nt-wf"><div class="nt-bar-wrap" style="left:${pct(off)};width:${pct(ph.total || 1)}">${ph.parts.map(([k, a, d]) => `<i style="left:${((a / (ph.total || 1)) * 100).toFixed(2)}%;width:${Math.max(0.5, (d / (ph.total || 1)) * 100).toFixed(2)}%;background:${COLORS[k]}"></i>`).join('')}</div></td>
          </tr>`;
  }).join('')}</tbody>
      </table>${list.length > MAX_ROWS ? `<p class="bl-hint">${list.length - MAX_ROWS} requêtes plus anciennes masquées.</p>` : ''}${!list.length ? `<p class="bl-hint nt-empty">${this.entries.size ? 'Aucune requête ne correspond au filtre.' : 'Recharge la page pour voir toutes ses requêtes.'}</p>` : ''}`;
    this.paintSum(all, t0, list);
  }

  paintSum(all, t0, list) {
    const sum = $('.nt-sum', this.el);
    const transferred = all.reduce((a, e) => a + (e.fromCache || e.fromMemory ? 0 : e.encoded || 0), 0);
    const res = all.reduce((a, e) => a + (e.decoded || 0), 0);
    const fin = Math.max(...all.map((e) => e.end || 0));
    sum.innerHTML = `<span>${list && list.length !== all.length ? `${list.length} / ` : ''}${all.length} requêtes</span><span>${fmtBytes(transferred)} transférés</span><span>${fmtBytes(res)} de ressources</span>${Number.isFinite(t0) && fin ? `<span>Terminé : ${fmtMs((fin - t0) * 1000)}</span>` : ''}${this.page.dcl && Number.isFinite(t0) ? `<span class="dcl">DOMContentLoaded : ${fmtMs((this.page.dcl - t0) * 1000)}</span>` : ''}${this.page.load && Number.isFinite(t0) ? `<span class="load">Chargement : ${fmtMs((this.page.load - t0) * 1000)}</span>` : ''}`;
  }

  summaryHtml(all) {
    const by = (key) => {
      const m = new Map();
      for (const e of all) {
        const k = key(e);
        const v = m.get(k) || { n: 0, bytes: 0, ms: 0 };
        v.n += 1;
        v.bytes += e.fromCache || e.fromMemory ? 0 : e.encoded || 0;
        v.ms += e.end && e.start ? (e.end - e.start) * 1000 : 0;
        m.set(k, v);
      }
      return [...m].sort((a, b) => b[1].bytes - a[1].bytes);
    };
    const max = (rows) => Math.max(1, ...rows.map((r) => r[1].bytes));
    const table = (title, rows, label) => `<div class="nt-agg"><h4>${title}</h4>${rows.slice(0, 25).map(([k, v]) => `<div class="nt-agg-row"><span title="${esc(k)}">${esc(label ? label(k) : k)}</span><em>${v.n}</em><b>${fmtBytes(v.bytes)}</b><i style="width:${((v.bytes / max(rows)) * 100).toFixed(1)}%"></i></div>`).join('')}</div>`;
    const failed = all.filter((e) => e.failed || e.status >= 400);
    const slow = all.filter((e) => e.end && e.start).sort((a, b) => (b.end - b.start) - (a.end - a.start)).slice(0, 8);
    const big = all.slice().sort((a, b) => (b.encoded || 0) - (a.encoded || 0)).slice(0, 8);
    return `<div class="nt-summary">
      ${table('Par type', by((e) => e.type), (k) => TYPES[k] || k)}
      ${table('Par domaine', by((e) => hostOf(e.url) || '(autre)'))}
      <div class="nt-agg"><h4>Les plus lourdes</h4>${big.map((e) => `<div class="nt-agg-row"><span title="${esc(e.url)}">${esc(nameOf(e.url))}</span><em>${esc(e.type)}</em><b>${fmtBytes(e.encoded || 0)}</b></div>`).join('')}</div>
      <div class="nt-agg"><h4>Les plus lentes</h4>${slow.map((e) => `<div class="nt-agg-row"><span title="${esc(e.url)}">${esc(nameOf(e.url))}</span><em>${esc(e.type)}</em><b>${fmtMs((e.end - e.start) * 1000)}</b></div>`).join('')}</div>
      ${failed.length ? `<div class="nt-agg bad"><h4>En échec (${failed.length})</h4>${failed.slice(0, 30).map((e) => `<div class="nt-agg-row"><span title="${esc(e.url)}">${esc(e.url)}</span><b>${e.status || esc(e.errorText || 'échec')}</b></div>`).join('')}</div>` : ''}
      <div class="nt-legend">${Object.entries({ queue: 'Attente', dns: 'DNS', connect: 'Connexion', ssl: 'TLS', send: 'Envoi', wait: 'Réponse du serveur (TTFB)', receive: 'Téléchargement' }).map(([k, v]) => `<span><i style="background:${COLORS[k]}"></i>${v}</span>`).join('')}</div>
    </div>`;
  }

  async showDetail(id) {
    this.selected = id;
    const box = $('.nt-detail', this.el);
    box.hidden = false;
    const d = await api.invoke('lab:net-detail', { wcId: this.wcId, id });
    if (!d) { box.hidden = true; return; }
    const ph = phases(d);
    const hdr = (h) => Object.entries(h || {}).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `<div class="nt-h"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('') || '<p class="bl-hint">Aucun.</p>';
    box.innerHTML = `
      <div class="nt-d-head"><b title="${esc(d.url)}">${esc(nameOf(d.url))}</b><button class="icon-btn small" data-act="close-detail">${icon('close', 12)}</button></div>
      <div class="nt-d-body">
        <section><h4>Général</h4>
          <div class="nt-h"><b>Adresse</b><span>${esc(d.url)}</span></div>
          <div class="nt-h"><b>Méthode</b><span>${esc(d.method || '')}</span></div>
          <div class="nt-h"><b>Statut</b><span>${d.failed ? esc(d.errorText || 'échec') : `${d.status || '…'} ${esc(d.statusText || '')}`}</span></div>
          <div class="nt-h"><b>Protocole</b><span>${esc(d.protocol || '—')}</span></div>
          <div class="nt-h"><b>Adresse IP</b><span>${esc(d.remoteIP || '—')}${d.remotePort ? `:${d.remotePort}` : ''}</span></div>
          <div class="nt-h"><b>Priorité</b><span>${esc(d.priority || '—')}</span></div>
          <div class="nt-h"><b>Transféré</b><span>${fmtBytes(d.encoded || 0)} (${fmtBytes(d.decoded || 0)} décompressés)</span></div>
          ${d.initiator ? `<div class="nt-h"><b>Initiateur</b><span>${esc(d.initiator.type)}${d.initiator.url ? ` · ${esc(d.initiator.url)}${d.initiator.line != null ? `:${d.initiator.line + 1}` : ''}` : ''}</span></div>` : ''}
          ${d.redirectTo ? `<div class="nt-h"><b>Redirigé vers</b><span>${esc(d.redirectTo)}</span></div>` : ''}
        </section>
        <section><h4>Temps</h4><div class="nt-timing">${ph.parts.map(([k, , dur]) => `<div><span>${{ queue: 'Attente', dns: 'DNS', connect: 'Connexion', ssl: 'TLS', send: 'Envoi', wait: 'Réponse du serveur', receive: 'Téléchargement' }[k]}</span><i style="width:${Math.max(2, (dur / (ph.total || 1)) * 100)}%;background:${COLORS[k]}"></i><b>${fmtMs(dur)}</b></div>`).join('')}<div class="tot"><span>Total</span><b>${ph.total != null ? fmtMs(ph.total) : '…'}</b></div></div></section>
        <section><h4>En-têtes de la réponse</h4>${hdr(d.resHeaders)}</section>
        <section><h4>En-têtes de la requête</h4>${hdr(d.reqHeaders)}</section>
        ${d.postData ? `<section><h4>Données envoyées</h4><pre class="nt-pre">${esc(d.postData.slice(0, 20000))}</pre></section>` : ''}
        <section class="nt-preview"><h4>Réponse <button class="btn small" data-act="body" data-id="${esc(id)}">Afficher</button></h4><div class="nt-body"></div></section>
      </div>`;
    this.paint();
  }

  async showBody(id) {
    const box = $('.nt-body', this.el);
    box.innerHTML = '<span class="spinner small"></span>';
    const r = await api.invoke('lab:net-body', { wcId: this.wcId, id });
    const e = this.entries.get(id) || {};
    if (!r || r.error) { box.innerHTML = `<p class="bl-hint">${esc((r && r.error) || 'Corps indisponible (redirection, réponse vide ou effacée de la mémoire).')}</p>`; return; }
    if (/^image\//.test(e.mime || '')) {
      box.innerHTML = `<img class="nt-img" src="data:${esc(e.mime)};base64,${r.base64Encoded ? r.body : btoa(unescape(encodeURIComponent(r.body)))}" alt="">`;
      return;
    }
    let text = r.base64Encoded ? (() => { try { return decodeURIComponent(escape(atob(r.body))); } catch { return `(${Math.round((r.body.length * 3) / 4)} octets binaires)`; } })() : r.body;
    if (/json/.test(e.mime || '')) { try { text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* JSON invalide */ } }
    box.innerHTML = `<pre class="nt-pre">${esc(text.slice(0, 200000))}${text.length > 200000 ? '\n…' : ''}</pre>`;
  }

  async onClick(e) {
    const t = e.target.closest('[data-type]');
    if (t) {
      this.filter.type = t.dataset.type;
      for (const b of t.parentElement.children) b.classList.toggle('on', b === t);
      this.paint();
      return;
    }
    const row = e.target.closest('tr[data-id]');
    if (row) { this.showDetail(row.dataset.id); return; }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    switch (a.dataset.act) {
      case 'clear': this.entries.clear(); this.page = {}; api.invoke('lab:net-clear', { wcId: this.wcId }); this.paint(); break;
      case 'view': this.view = this.view === 'list' ? 'summary' : 'list'; a.classList.toggle('on', this.view === 'summary'); this.paint(); break;
      case 'har': {
        try {
          const f = await api.invoke('lab:net-har', { wcId: this.wcId, name: hostOf(this.lab.url) || 'reseau' });
          if (f) toast('Fichier HAR enregistré.', { action: 'Afficher', onAction: () => api.invoke('lab:reveal', f) });
        } catch (err) { toast(err.message, { kind: 'bad' }); }
        break;
      }
      case 'close-detail': $('.nt-detail', this.el).hidden = true; this.selected = null; this.paint(); break;
      case 'body': this.showBody(a.dataset.id); break;
      default: break;
    }
  }

  onInput(e) {
    const t = e.target;
    if (t.classList.contains('nt-search')) { this.filter.text = t.value; this.paint(); return; }
    const o = t.dataset.opt;
    if (o === 'party') { this.filter.party = t.value; this.paint(); }
    if (o === 'preserve') { this.preserve = t.checked; api.invoke('lab:net-preserve', { wcId: this.wcId, on: t.checked }); }
    if (o === 'cache') { this.cacheOff = t.checked; this.lab.st.cacheOff = t.checked; this.lab.save(); api.invoke('lab:net-cache', { wcId: this.wcId, disabled: t.checked }); }
    if (o === 'block') {
      clearTimeout(this.blockTimer);
      this.blockTimer = setTimeout(() => {
        this.blocked = t.value;
        this.lab.st.blocked = t.value;
        this.lab.save();
        api.invoke('lab:net-block', { wcId: this.wcId, patterns: t.value.split(/[\s,]+/).filter(Boolean) });
      }, 500);
    }
  }
}
