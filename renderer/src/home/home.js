/* Accueil : tableau de bord des projets (site, code, applications, scènes, surveillance) et accès rapide aux espaces. */
import { S } from '../core/state.js';
import { $, esc, bus } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { settings, persist } from '../core/settings.js';
import { toast, showPopover, hidePopover } from '../core/ui.js';
import {
  projects, currentProject, openProject, removeProject, updateProject,
} from '../core/projects.js';

const host = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return ''; } };
const base = (d) => String(d || '').split(/[\\/]/).filter(Boolean).pop() || d;
const ago = (t) => {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'à l’instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return d < 31 ? `il y a ${d} j` : new Date(t).toLocaleDateString('fr-FR');
};
const HUES = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff375f', '#64d2ff', '#5e5ce6', '#ffd60a'];
const hueOf = (s) => HUES[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];

const SPACES = [
  ['preview', 'multi', 'Responsive Lab', 'Le site dans de vrais appareils : téléphones, tablettes, ordinateurs, captures et vidéos.'],
  ['browser', 'globe', 'Browser Lab', 'Analyse d’une page : composants, réseau, audit, tests automatiques, surveillance.'],
  ['dev', 'code', 'Dev Lab', 'Le code du projet : éditeur, terminal, Git, aperçu en direct et lien de partage.'],
  ['android', 'android', 'App Builder', 'Une application Android à partir du site, prête pour le Play Store.'],
  ['studio', 'cube', '3D & Motion', 'Maquettes, scènes 3D animées et présentations du projet.'],
  ['design', 'palette', 'NEX-DESIGN', 'Design 2D façon Figma, Illustrator et Photoshop, avec tes objets 3D en calques.'],
  ['security', 'shield', 'Sécurité', 'Audit de sécurité de ton site : en-têtes, TLS, cookies, fichiers exposés.'],
];

class Home {
  constructor(el) {
    this.el = el;
    this.q = '';
    // Les sites et dossiers récents deviennent des projets la première fois.
    if (!settings.projectsSeeded) {
      for (const r of (settings.recent || []).slice().reverse()) {
        const exists = projects().some((p) => (r.dir && p.dir === r.dir) || (r.url && host(p.url) === host(r.url)));
        if (!exists) projects().unshift({ id: Math.random().toString(36).slice(2, 9), name: r.name || host(r.url) || base(r.dir), url: r.url || '', dir: r.dir || '', apps: [], created: r.at || Date.now(), opened: r.at || 0 });
      }
      settings.projectsSeeded = true;
      persist();
    }
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('input', (e) => { if (e.target.matches('[data-h-search]')) { this.q = e.target.value.toLowerCase(); this.renderGrid(); } });
    this.el.addEventListener('submit', (e) => { e.preventDefault(); this.openTyped(); });
    bus.on('projects', () => { if (!this.el.hidden) this.renderGrid(); });
    this.render();
  }

  resume() { this.render(); }

  // Indicateurs du tableau de bord (projets, applications, surveillance, créations du Studio).
  stats() {
    const ps = projects();
    const week = Date.now() - 7 * 864e5;
    const apps = (settings.android && settings.android.apps) || [];
    const built = apps.filter((a) => a.lastBuild).sort((x, y) => (y.lastBuild.at || 0) - (x.lastBuild.at || 0));
    const mons = (settings.monitors || []).filter((m) => m.enabled !== false);
    const down = mons.filter((m) => m.state === 'down').length;
    const slow = mons.filter((m) => m.state === 'slow').length;
    const up = mons.filter((m) => m.state === 'up').length;
    const decks = (settings.studioDecks || []).length;
    return [
      ['preview', 'pink', 'folder', 'Projets', ps.length, `${ps.filter((p) => (p.opened || 0) > week).length} ouvert(s) cette semaine`],
      ['android', 'blue', 'android', 'Applications', apps.filter((a) => a.appName || a.source).length || apps.length, built[0] ? `Dernière : ${esc(built[0].appName || 'app')} v${esc(built[0].lastBuild.version || '')} ${ago(built[0].lastBuild.at)}` : 'Aucune construction pour l’instant'],
      ['security', down ? 'red' : 'mint', down ? 'warn' : 'shield', 'Sites surveillés', mons.length, mons.length ? `${up} en ligne${slow ? ` · ${slow} lent(s)` : ''}${down ? ` · ${down} hors ligne` : ''}` : 'Active la supervision pour être alerté'],
      ['studio', 'yellow', 'present', 'Présentations', decks, decks ? 'Dans le Studio 3D & Motion' : 'Génère-en une depuis ton site'],
    ];
  }

  statsHtml() {
    return this.stats().map(([sp, tone, ic, label, n, sub]) => `
          <button class="hm-stat ${tone}" data-h-space="${sp}"><span class="hm-stat-top"><span class="hm-stat-ic">${icon(ic, 16)}</span>${label}${icon('forward', 13)}</span><b>${n}</b><small>${sub}</small></button>`).join('');
  }

  render() {
    const h = new Date().getHours();
    const hello = h < 5 || h >= 18 ? 'Bonsoir' : 'Bonjour';
    const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    this.el.innerHTML = `
      <div class="hm">
        <header class="hm-hero">
          <div class="hm-hello">
            <small>${esc(date.charAt(0).toUpperCase() + date.slice(1))}</small>
            <h1>${hello} 👋<br>Que construis-tu aujourd’hui ?</h1>
            <p>Un projet réunit ton site ou ton code, ses applications, ses visuels et sa surveillance. Ouvre-le : tous les espaces s’y alignent.</p>
            <form class="hm-open"><span>${icon('link', 15)}</span><input class="input" data-h-url placeholder="Colle le lien d’un site (monsite.com)" spellcheck="false"><button class="btn primary">${icon('forward', 14)}<span>Ouvrir</span></button></form>
          </div>
          <div class="hm-quick">
            <button class="hm-qa" data-h="folder"><span class="hm-qa-ic q1">${icon('folderOpen', 22)}</span><b>Dossier de code</b><small>Ouvrir un projet existant</small></button>
            <button class="hm-qa" data-h="new"><span class="hm-qa-ic q2">${icon('plus', 22)}</span><b>Nouveau</b><small>Projet, app, scène, présentation</small></button>
            <button class="hm-qa" data-h-space="android"><span class="hm-qa-ic q3">${icon('android', 22)}</span><b>Application</b><small>Android et iPhone</small></button>
          </div>
        </header>
        <section class="hm-stats">${this.statsHtml()}</section>
        <div class="hm-sechead"><h2 class="hm-h2">Tes projets</h2></div>
        <div class="hm-bar">
          <label class="hm-search">${icon('search', 14)}<input class="input" data-h-search placeholder="Rechercher un projet" spellcheck="false"></label>
          <button class="btn" data-h="folder">${icon('folderOpen', 14)}<span>Ouvrir un dossier de code…</span></button>
          <button class="btn" data-h="new">${icon('plus', 14)}<span>Nouveau…</span></button>
        </div>
        <section class="hm-grid"></section>
        <h2 class="hm-h2">Les espaces de NEXORA</h2>
        <section class="hm-spaces">${SPACES.map(([k, ic, l, d], i) => `<button class="hm-space" data-h-space="${k}" data-space="${k}"><span class="hm-space-ic">${icon(ic, 20)}</span><b>${l}</b><small>${d}</small><kbd>Ctrl+${i + 1}</kbd></button>`).join('')}</section>
        <p class="hm-foot"><button class="link-btn" data-h="tour">${icon('present', 13)} Revoir la visite guidée</button></p>
      </div>`;
    this.renderGrid();
  }

  card(p) {
    const apps = (settings.android && settings.android.apps || []).filter((a) => p.apps.includes(a.id) || (p.url && a.source && a.source.url && host(a.source.url) === host(p.url)) || (p.dir && a.source && a.source.dir === p.dir));
    const app = apps.find((a) => a.icon && a.icon.image) || apps[0];
    const mon = (settings.monitors || []).find((m) => m.project === p.id);
    const decks = (settings.studioDecks || []).filter((d) => d.url && p.url && host(d.url) === host(p.url));
    const cur = currentProject() && currentProject().id === p.id;
    const logo = p.logo || (app && app.icon && app.icon.image);
    const chips = [
      p.url ? `<span class="hm-chip">${icon('globe', 11)}${esc(host(p.url))}</span>` : '',
      p.dir ? `<span class="hm-chip" title="${esc(p.dir)}">${icon('folder', 11)}${esc(base(p.dir))}</span>` : '',
      apps.length ? `<span class="hm-chip">${icon('android', 11)}${apps.length} app${apps.length > 1 ? 's' : ''}${app && app.lastBuild ? ` · v${esc(app.lastBuild.version || '')} ${ago(app.lastBuild.at)}` : ''}</span>` : '',
      decks.length ? `<span class="hm-chip">${icon('present', 11)}${decks.length} présentation${decks.length > 1 ? 's' : ''}</span>` : '',
      mon ? `<span class="hm-chip mon ${esc(mon.state || 'unknown')}">${icon('pass', 11)}${mon.state === 'down' ? 'Hors ligne' : mon.state === 'slow' ? 'Lent' : mon.state === 'up' ? 'En ligne' : 'Surveillé'}</span>` : '',
    ].filter(Boolean).join('');
    return `<article class="hm-card${cur ? ' cur' : ''}" data-h-proj="${esc(p.id)}">
      <div class="hm-card-top">
        <span class="hm-logo" style="--c:${hueOf(p.name)}">${logo ? `<img src="${logo}" alt="">` : esc((p.name || '?').trim().charAt(0).toUpperCase())}</span>
        <div class="hm-card-t"><b>${esc(p.name)}</b><small>${cur ? 'Projet ouvert' : p.opened ? `Ouvert ${ago(p.opened)}` : 'Jamais ouvert'}</small></div>
        <button class="icon-btn small" data-h-more title="Plus d’actions" aria-haspopup="true">${icon('chevronDown', 14)}</button>
      </div>
      <div class="hm-chips">${chips}</div>
      <div class="hm-acts">
        <button class="btn small primary" data-h-go="preview">${icon('multi', 13)}<span>Ouvrir</span></button>
        <button class="btn small" data-h-go="browser" title="Analyser dans le Browser Lab">${icon('globe', 13)}</button>
        ${p.dir ? `<button class="btn small" data-h-go="dev" title="Code dans le Dev Lab">${icon('code', 13)}</button>` : ''}
        <button class="btn small" data-h-go="android" title="Application dans l’App Builder">${icon('android', 13)}</button>
        <button class="btn small" data-h-go="studio" title="Visuels dans le Studio">${icon('cube', 13)}</button>
      </div>
    </article>`;
  }

  renderGrid() {
    const grid = $('.hm-grid', this.el);
    if (!grid) return;
    const st = $('.hm-stats', this.el);
    if (st) st.innerHTML = this.statsHtml();
    const list = projects().filter((p) => !this.q || `${p.name} ${p.url} ${p.dir}`.toLowerCase().includes(this.q)).sort((a, b) => (Math.max(b.opened || 0, b.created || 0)) - (Math.max(a.opened || 0, a.created || 0)));
    grid.innerHTML = list.length ? list.map((p) => this.card(p)).join('') : `<div class="hm-empty">${icon('folder', 28)}<b>${this.q ? 'Aucun projet ne correspond.' : 'Aucun projet pour l’instant.'}</b><p>Colle le lien d’un site ci-dessus, ou ouvre un dossier de code : il apparaîtra ici avec tout ce que tu crées pour lui.</p></div>`;
  }

  async openTyped() {
    const v = $('[data-h-url]', this.el).value.trim();
    if (!v) return;
    const src = await import('../viewer/sources.js');
    if (await src.openUrl(v)) { const { setMode } = await import('../viewer/toolbar.js'); setMode('preview'); }
  }

  async onClick(e) {
    const { setMode } = await import('../viewer/toolbar.js');
    const sp = e.target.closest('[data-h-space]');
    if (sp) { setMode(sp.dataset.hSpace); return; }
    const h = e.target.closest('[data-h]');
    if (h) {
      if (h.dataset.h === 'folder') { const src = await import('../viewer/sources.js'); await src.pickProject(); setMode('preview'); }
      if (h.dataset.h === 'new') import('../core/newwizard.js').then((m) => m.openNewWizard());
      if (h.dataset.h === 'tour') import('../core/tour.js').then((m) => m.startTour({ force: true })).catch(() => toast('Visite guidée indisponible.'));
      return;
    }
    const card = e.target.closest('[data-h-proj]');
    if (!card) return;
    const p = projects().find((x) => x.id === card.dataset.hProj);
    if (!p) return;
    const more = e.target.closest('[data-h-more]');
    if (more) { this.moreMenu(more, p); return; }
    const go = e.target.closest('[data-h-go]');
    if (go || e.target.closest('.hm-card-top')) {
      const t = toast(`Ouverture de « ${p.name} »…`, { busy: true, sticky: true });
      try { await openProject(p); } finally { t.close(); }
      setMode(go ? go.dataset.hGo : 'preview');
    }
  }

  moreMenu(anchor, p) {
    const pop = showPopover(anchor, `<div class="pop-title">${esc(p.name)}</div>
      <button class="menu-item" data-pm="rename">${icon('text', 14)}<span>Renommer</span></button>
      <button class="menu-item" data-pm="logo">${icon('image', 14)}<span>Changer le logo…</span></button>
      <button class="menu-item" data-pm="url">${icon('link', 14)}<span>Adresse en ligne du projet…</span></button>
      <button class="menu-item danger" data-pm="remove">${icon('trash', 14)}<span>Retirer de la liste</span></button>
      <p class="pop-note">Retirer ne supprime aucun fichier, application ni réglage.</p>`, { width: 260 });
    if (!pop) return;
    pop.onclick = async (e) => {
      const b = e.target.closest('[data-pm]');
      if (!b) return;
      hidePopover();
      if (b.dataset.pm === 'rename') this.inlineEdit(p, 'name', 'Nom du projet');
      if (b.dataset.pm === 'url') this.inlineEdit(p, 'url', 'Adresse en ligne (https://…)');
      if (b.dataset.pm === 'remove') { removeProject(p.id); toast(`« ${p.name} » retiré de la liste.`); }
      if (b.dataset.pm === 'logo') {
        const { api } = await import('../core/api.js');
        const f = await api.invoke('dialog:open-file', { title: 'Logo du projet', filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }], asDataUrl: true, maxBytes: 5e6 });
        if (f && f.dataUrl) updateProject(p.id, { logo: f.dataUrl });
      }
    };
  }

  // Modification sur place (pas de fenêtre système) : le titre de la carte devient un champ.
  inlineEdit(p, key, label) {
    const card = $(`[data-h-proj="${CSS.escape(p.id)}"]`, this.el);
    const t = card && $('.hm-card-t', card);
    if (!t) return;
    t.innerHTML = `<input class="input small" aria-label="${esc(label)}" placeholder="${esc(label)}" value="${esc(p[key] || '')}">`;
    const inp = $('input', t);
    inp.focus(); inp.select();
    const done = (ok) => { if (ok && inp.value.trim()) updateProject(p.id, { [key]: inp.value.trim() }); else this.renderGrid(); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
    inp.addEventListener('blur', () => done(true));
  }
}

export function openHome(el) {
  if (!S.home) S.home = new Home(el);
  else S.home.resume();
  return S.home;
}
