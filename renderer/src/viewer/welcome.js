/* Accueil : coller un lien ou ouvrir un projet. */
import { api } from '../core/api.js';
import { S } from '../core/state.js';
import { settings } from '../core/settings.js';
import { $, esc, bus } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast } from '../core/ui.js';
import {
  looksLikeUrl, openUrl, openProjectDir, pickProject, updateMessage,
} from './sources.js';

function timeAgo(t) {
  const d = (Date.now() - t) / 1000;
  if (d < 3600) return `il y a ${Math.max(1, Math.round(d / 60))} min`;
  if (d < 86400) return `il y a ${Math.round(d / 3600)} h`;
  return `il y a ${Math.round(d / 86400)} j`;
}

export function renderWelcome() {
  const el = $('#welcome');
  const hidden = Boolean(S.source);
  const was = S.board.welcome;
  S.board.welcome = !hidden;
  el.hidden = hidden;
  document.body.classList.toggle('welcome-mode', !hidden);
  if (was !== S.board.welcome) { updateMessage(); S.board.relayout(); }
  if (hidden) return;
  const rec = (settings.recent || []).slice(0, 5);
  el.innerHTML = `
    <div class="hero">
      <h1>Colle un lien,<br>obtiens la maquette.</h1>
      <p class="lead">Affiche un site ou un projet dans le cadre d'un vrai iPhone, Samsung, pliable, ordinateur ou téléviseur. Compare plusieurs appareils côte à côte, exporte des photos et des vidéos HD, anime-les en 3D ou transforme le site en application Android.</p>
      <form class="hero-link" data-w="link">
        <span class="hl-ico">${icon('link', 18)}</span>
        <input id="heroLink" placeholder="https://monsite.com" spellcheck="false" aria-label="Lien du site">
        <button type="button" class="btn" data-w="paste">${icon('paste', 15)}<span>Coller</span></button>
        <button type="submit" class="btn primary">Afficher</button>
      </form>
      <div class="hero-or">
        <button class="btn" data-w="pick">${icon('folder', 16)}<span>Ouvrir un dossier de projet</span></button>
        <p class="muted">React, Next.js, Vue, Angular, Svelte, Expo, Flutter, Laravel, Django, Rails, Hugo, .NET… Le framework est détecté et les dépendances sont installées automatiquement.</p>
      </div>
      ${rec.length ? `<div class="recent"><div class="recent-title">Récents</div>${rec.map((r, i) => `<button class="recent-row" data-recent="${i}">${icon(r.dir ? 'folder' : 'globe', 16)}<span class="rr-name">${esc(r.name)}</span><span class="rr-sub">${esc(r.label || (r.url || '').replace(/^https?:\/\//, ''))}</span><span class="rr-time">${timeAgo(r.at)}</span></button>`).join('')}</div>` : ''}
    </div>`;
}

export function initWelcome() {
  const el = $('#welcome');
  el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-w],[data-recent]');
    if (!t) return;
    if (t.dataset.recent != null) {
      const r = settings.recent[Number(t.dataset.recent)];
      if (r && r.dir) openProjectDir(r.dir); else if (r) openUrl(r.url);
      return;
    }
    if (t.dataset.w === 'pick') pickProject();
    if (t.dataset.w === 'paste') {
      const txt = (await api.invoke('clipboard:read')).trim();
      $('#heroLink').value = txt;
      if (looksLikeUrl(txt)) openUrl(txt); else toast('Le presse-papiers ne contient pas de lien.', { kind: 'bad' });
    }
  });
  el.addEventListener('submit', (e) => { e.preventDefault(); openUrl($('#heroLink').value); });
  el.addEventListener('paste', (e) => {
    if (e.target.id !== 'heroLink') return;
    const txt = e.clipboardData.getData('text');
    if (looksLikeUrl(txt)) { e.preventDefault(); e.target.value = txt.trim(); openUrl(txt); }
  });
  bus.on('source', renderWelcome);
}
