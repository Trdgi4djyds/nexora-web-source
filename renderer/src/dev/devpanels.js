/* Panneaux du Dev Lab : Git, GitHub, terminaux, aperçu en direct et partage. */
import { api } from '../core/api.js';
import { $, $$, esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast } from '../core/ui.js';
import { uaFor } from '../viewer/emulation.js';
import { settings } from '../core/settings.js';
import { S } from '../core/state.js';
import { Ansi } from './ansi.js';

const rel = (root, p) => (p.startsWith(root) ? p.slice(root.length + 1) : p);
const ago = (t) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
};

// =========================================================================== Git
export class GitPanel {
  constructor(dev) {
    this.dev = dev;
    this.st = null;
    this.log = [];
    this.busy = false;
    api.on('git:progress', (p) => this.onProgress(p));
  }

  async refresh() {
    const root = this.dev.st.root;
    if (!root) return;
    try { this.st = await api.invoke('git:status', { dir: root }); } catch (e) { this.st = { repo: false, error: e.message }; }
    this.dev.gitFiles = new Map();
    if (this.st.repo) for (const f of this.st.files) this.dev.gitFiles.set(`${root}${api.platform === 'win32' ? '\\' : '/'}${f.file.split('/').join(api.platform === 'win32' ? '\\' : '/')}`, f.status);
    const badge = $('.dk-badge', this.dev.el);
    if (badge) { badge.hidden = !(this.st.repo && this.st.files.length); badge.textContent = this.st.repo ? this.st.files.length : ''; }
    $('.dk-st-branch', this.dev.el).innerHTML = this.st.repo ? `${icon('sync', 12)} ${esc(this.st.branch || 'main')}${this.st.ahead ? ` · ${this.st.ahead} ↑` : ''}${this.st.behind ? ` · ${this.st.behind} ↓` : ''}` : '';
    if (this.dev.st.side === 'git') this.render(this.dev.$.side);
    else if (this.dev.st.side === 'files') this.dev.renderFiles();
  }

  refreshSoon() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refresh(), 700);
  }

  onProgress(p) {
    const box = $('.dk-gprog', this.dev.el);
    if (box) box.textContent = `${p.label || ''}${p.phase ? ` · ${p.phase}` : ''}${p.total ? ` ${Math.round((p.loaded / p.total) * 100)} %` : ''}`;
  }

  async render(el) {
    const root = this.dev.st.root;
    if (!root) { el.innerHTML = '<div class="dk-side-empty"><p>Ouvre un projet pour gérer ses versions avec Git.</p></div>'; return; }
    if (!this.st) { el.innerHTML = '<div class="bl-loading"><span class="spinner small"></span></div>'; await this.refresh(); return; }
    const st = this.st;
    if (!st.repo) {
      el.innerHTML = `<div class="dk-side-empty"><p>Ce dossier n’est pas encore suivi par Git.</p><p class="bl-hint">Git garde l’historique de chaque version de ton code et permet de le publier sur GitHub. Aucun logiciel à installer.</p><button class="btn small primary" data-git="init">${icon('plus', 13)}<span>Activer Git</span></button></div>`;
      el.onclick = (e) => this.onClick(e);
      return;
    }
    if (!this.log.length || this.logFor !== root) { this.log = await api.invoke('git:log', { dir: root }); this.logFor = root; }
    const locals = st.branches || [];
    el.innerHTML = `
      <div class="dk-side-head">
        <span class="dk-branchpick">${icon('sync', 13)}<select class="dk-branch-sel" data-git-branch title="Changer de branche">
          ${locals.map((b) => `<option value="${esc(b)}" ${b === st.branch ? 'selected' : ''}>${esc(b)}</option>`).join('')}
          <option value="__new">＋ Nouvelle branche…</option>
        </select></span>
        <span><button class="icon-btn small" data-git="fetch" title="Vérifier les mises à jour sur GitHub">${icon('refreshCw', 13)}</button></span>
      </div>
      <div class="dk-git-box">
        <textarea class="input" rows="3" data-git-msg placeholder="Décris tes changements (ex. : Ajout de la page contact)"></textarea>
        <button class="btn small primary wide" data-git="commit" ${st.files.length ? '' : 'disabled'}>${icon('check', 13)}<span>Valider ${st.files.length} changement${st.files.length > 1 ? 's' : ''}</span></button>
        <div class="dk-git-row">
          <button class="btn small" data-git="push" ${st.remote ? '' : 'disabled'} title="${st.remote ? esc(st.remote) : 'Aucun dépôt distant : publie le projet depuis l’onglet GitHub'}">${icon('upload', 13)}<span>Envoyer${st.ahead ? ` (${st.ahead})` : ''}</span></button>
          <button class="btn small" data-git="pull" ${st.remote ? '' : 'disabled'} ${st.behind ? 'data-hl="1"' : ''}>${icon('download', 13)}<span>Récupérer${st.behind ? ` (${st.behind})` : ''}</span></button>
        </div>
        <div class="dk-gprog bl-hint"></div>
        ${st.behind ? `<p class="bl-hint">${st.behind} nouveau${st.behind > 1 ? 'x' : ''} commit${st.behind > 1 ? 's' : ''} sur GitHub à récupérer.</p>` : ''}
        ${st.remote ? `<p class="bl-hint">Dépôt : <a data-ext="${esc(st.remote.replace(/\.git$/, ''))}">${esc(st.remote.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, ''))}</a></p>` : '<p class="bl-hint">Pas encore sur GitHub : utilise « Publier sur GitHub ».</p>'}
      </div>
      <div class="dk-sub">Changements</div>
      <div class="dk-changes">${st.files.map((f) => `<div class="dk-ch" data-diff="${esc(f.file)}"><i class="dk-git ${f.status === 'nouveau' ? 'new' : f.status === 'supprimé' ? 'del' : 'mod'}">${f.status === 'nouveau' ? 'U' : f.status === 'supprimé' ? 'D' : 'M'}</i><span title="${esc(f.file)}">${esc(f.file.split('/').pop())}<small>${esc(f.file.split('/').slice(0, -1).join('/'))}</small></span>${f.status !== 'nouveau' ? `<button class="icon-btn small" data-git="discard" data-file="${esc(f.file)}" title="Annuler les changements">${icon('restart', 12)}</button>` : ''}</div>`).join('') || '<p class="bl-hint" style="padding:6px 10px">Aucun changement depuis la dernière validation.</p>'}</div>
      <div class="dk-sub">Historique</div>
      <div class="dk-log">${this.log.map((c) => `<div class="dk-commit"><b>${esc(c.message.split('\n')[0])}</b><small>${esc(c.author)} · ${ago(c.date)} · ${c.oid.slice(0, 7)}</small></div>`).join('') || '<p class="bl-hint" style="padding:6px 10px">Aucune version validée.</p>'}</div>`;
    el.onclick = (e) => this.onClick(e);
    el.onchange = (e) => this.onBranchChange(e);
  }

  async onBranchChange(e) {
    const sel = e.target.closest('[data-git-branch]');
    if (!sel || this.busy) return;
    const dir = this.dev.st.root;
    const v = sel.value;
    this.busy = true;
    try {
      if (v === '__new') {
        const name = (window.prompt('Nom de la nouvelle branche :', '') || '').trim().replace(/\s+/g, '-');
        if (!name) return;
        await api.invoke('git:checkout', { dir, branch: name, create: true });
        toast(`Branche « ${name} » créée.`);
      } else if (v !== this.st.branch) {
        if (this.st.files.length && !window.confirm('Des changements ne sont pas validés. Changer de branche quand même ?')) return;
        await api.invoke('git:checkout', { dir, branch: v });
        toast(`Sur la branche « ${v} ».`);
      }
      this.log = [];
    } catch (err) { toast(err.message, { kind: 'bad' }); } finally {
      this.busy = false;
      await this.refresh();
      if (this.dev.st.side === 'files') this.dev.renderFiles();
    }
  }

  async onClick(e) {
    const ext = e.target.closest('[data-ext]');
    if (ext) { api.invoke('shell:external', ext.dataset.ext); return; }
    const d = e.target.closest('[data-diff]');
    if (d && !e.target.closest('button')) {
      const root = this.dev.st.root;
      const file = `${root}${api.platform === 'win32' ? '\\' : '/'}${d.dataset.diff.split('/').join(api.platform === 'win32' ? '\\' : '/')}`;
      const f = this.st.files.find((x) => x.file === d.dataset.diff);
      if (f && f.status === 'modifié') this.dev.showDiff(file);
      else if (f && f.status !== 'supprimé') this.dev.openFile(file);
      return;
    }
    const b = e.target.closest('[data-git]');
    if (!b || this.busy) return;
    const dir = this.dev.st.root;
    this.busy = true;
    b.disabled = true;
    try {
      switch (b.dataset.git) {
        case 'init': await api.invoke('git:init', { dir }); toast('Git activé pour ce projet.'); break;
        case 'refresh': break;
        case 'commit': {
          await this.dev.saveAll();
          const msg = $('[data-git-msg]', this.dev.el).value.trim() || 'Mise à jour';
          await api.invoke('git:commit', { dir, message: msg });
          this.log = [];
          toast('Version validée.');
          break;
        }
        case 'push': await api.invoke('git:push', { dir }); toast('Code envoyé sur GitHub.'); break;
        case 'pull': await api.invoke('git:pull', { dir }); this.log = []; toast('Dernières modifications récupérées.'); break;
        case 'fetch': {
          if (!this.st.remote) { toast('Ce projet n’est pas encore sur GitHub.'); break; }
          const r = await api.invoke('git:fetch', { dir });
          toast(r && r.behind ? `${r.behind} commit(s) à récupérer.` : 'À jour avec GitHub.');
          break;
        }
        case 'discard':
          if (window.confirm(`Annuler les changements de ${b.dataset.file} ? Ils seront perdus.`)) await api.invoke('git:discard', { dir, file: b.dataset.file });
          break;
        default: break;
      }
    } catch (err) { toast(err.message, { kind: 'bad' }); } finally {
      this.busy = false;
      await this.refresh();
    }
  }
}

// =========================================================================== GitHub
export class GitHubPanel {
  constructor(dev) {
    this.dev = dev;
    this.me = undefined;
    this.repos = null;
    this.view = 'home';
    this.filter = '';
    this.repoTab = 'overview';
    this.repoData = {};
    this.repoFor = null;
  }

  async ensureMe() {
    if (this.me !== undefined) return this.me;
    const m = await api.invoke('git:me');
    this.me = m && !m.error ? m : null;
    return this.me;
  }

  showClone() { this.view = 'clone'; this.render(this.dev.$.side); }
  showPublish() { this.view = 'publish'; this.render(this.dev.$.side); }

  async render(el) {
    this.el = el;
    el.onclick = (e) => this.onClick(e);
    await this.ensureMe();
    if (this.dev.st.side !== 'github') return;
    const me = this.me;
    const head = `<div class="dk-side-head"><b>${icon('globe', 13)} GitHub</b>${me ? `<span class="dk-gh-me"><img src="${esc(me.avatar)}" alt="">${esc(me.login)}</span>` : ''}</div>`;
    if (!me) {
      el.innerHTML = `${head}<div class="dk-gh">
        <p>Connecte ton compte pour publier tes projets, envoyer tes changements et récupérer tes dépôts privés.</p>
        <ol class="dk-steps"><li>Crée un jeton d’accès sur GitHub (droit <b>repo</b>).<button class="link-btn small" data-ext="https://github.com/settings/tokens/new?scopes=repo,workflow&description=NEXORA">${icon('external', 12)}<span>Créer le jeton</span></button></li><li>Colle-le ci-dessous : il est chiffré par le trousseau de ton ordinateur.</li></ol>
        <input class="input mono" type="password" data-gh-token placeholder="ghp_… ou github_pat_…" spellcheck="false">
        <button class="btn small primary wide" data-gh="connect">Connecter</button>
        <div class="dk-sub">Sans compte</div>
        <p class="bl-hint">Tu peux aussi télécharger un dépôt public :</p>
        ${this.cloneForm()}
      </div>`;
      return;
    }
    if (this.view === 'publish') { el.innerHTML = head + this.publishHtml(); return; }
    if (this.view === 'clone') {
      if (!this.repos) {
        el.innerHTML = `${head}<div class="bl-loading"><span class="spinner small"></span> Lecture de tes dépôts…</div>`;
        try { this.repos = await api.invoke('git:repos'); } catch (e) { this.repos = []; toast(e.message, { kind: 'bad' }); }
        if (this.dev.st.side !== 'github' || this.view !== 'clone') return;
      }
      const q = this.filter.toLowerCase();
      const list = this.repos.filter((r) => !q || r.full.toLowerCase().includes(q));
      el.innerHTML = `${head}<div class="dk-gh">
        <button class="link-btn small" data-gh="home">${icon('chevronLeft', 12)}<span>Retour</span></button>
        ${this.cloneForm()}
        <div class="dk-sub">Mes dépôts (${this.repos.length})</div>
        <input class="input" data-gh-filter placeholder="Filtrer" value="${esc(this.filter)}">
        <div class="dk-repos">${list.slice(0, 200).map((r) => `<div class="dk-repo"><span><b>${esc(r.name)}</b>${r.private ? '<em>privé</em>' : ''}<small>${esc(r.description || r.full)}${r.language ? ` · ${esc(r.language)}` : ''} · ${ago(new Date(r.updated).getTime())}</small></span>
          <span class="dk-repo-act"><button class="btn small" data-clone="${esc(r.clone)}" data-name="${esc(r.name)}" title="Cloner (avec l’historique Git)">${icon('download', 12)}</button><button class="btn small" data-zip="${esc(r.full)}" data-ref="${esc(r.branch)}" title="Télécharger les fichiers (ZIP)">ZIP</button></span></div>`).join('')}</div>
      </div>`;
      const f = $('[data-gh-filter]', el);
      f.addEventListener('input', () => { this.filter = f.value; clearTimeout(this.ft); this.ft = setTimeout(() => { this.render(el); const i = $('[data-gh-filter]', el); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 200); });
      return;
    }
    if (this.view === 'repo') { el.innerHTML = head + this.repoHtml(); this.loadRepoTab(); return; }
    const linked = this.dev.git && this.dev.git.st && this.dev.git.st.full;
    el.innerHTML = `${head}<div class="dk-gh">
      <div class="dk-gh-cards">
        ${linked ? `<button class="dk-gh-card wide" data-gh="repo">${icon('globe', 18)}<b>Gérer « ${esc(linked.split('/')[1])} »</b><small>Pull requests, issues, Actions, versions et réglages du dépôt</small></button>` : ''}
        <button class="dk-gh-card" data-gh="publish" ${this.dev.st.root ? '' : 'disabled'}>${icon('upload', 18)}<b>${linked ? 'Envoyer les changements' : 'Publier ce projet'}</b><small>${linked ? 'Valider et envoyer sur GitHub' : 'Créer le dépôt GitHub et envoyer le code, avec GitHub Pages en option'}</small></button>
        <button class="dk-gh-card" data-gh="clone">${icon('download', 18)}<b>Récupérer un dépôt</b><small>Cloner ou télécharger un de tes dépôts, ou une adresse GitHub</small></button>
      </div>
      <p class="bl-hint">Connecté en tant que <b>${esc(me.name)}</b>. Les validations sont signées avec ton adresse privée GitHub (${esc(me.email)}).</p>
      <button class="link-btn small" data-gh="logout">${icon('close', 12)}<span>Déconnecter ce compte</span></button>
    </div>`;
  }

  // ------------------------------------------------- gestion d'un dépôt ouvert
  repoFull() { return this.dev.git && this.dev.git.st ? this.dev.git.st.full : null; }

  repoHtml() {
    const full = this.repoFull();
    if (!full) return `<div class="dk-gh"><button class="link-btn small" data-gh="home">${icon('chevronLeft', 12)}<span>Retour</span></button><p class="bl-hint">Ce projet n’est pas relié à un dépôt GitHub.</p></div>`;
    const tab = this.repoTab || 'overview';
    const tabs = [['overview', 'Aperçu', 'info'], ['pulls', 'Pull requests', 'layers'], ['issues', 'Issues', 'warn'], ['actions', 'Actions', 'bolt'], ['releases', 'Versions', 'rocket']];
    return `<div class="dk-gh dk-repo-mgr">
      <div class="dk-repo-top"><button class="link-btn small" data-gh="home">${icon('chevronLeft', 12)}<span>Retour</span></button><a class="dk-repo-full" data-ext="https://github.com/${esc(full)}">${esc(full)} ${icon('external', 11)}</a></div>
      <div class="dk-repo-tabs">${tabs.map(([k, label, ic]) => `<button class="dk-rt ${k === tab ? 'on' : ''}" data-rt="${k}">${icon(ic, 13)}<span>${label}</span></button>`).join('')}</div>
      <div class="dk-repo-body"><div class="bl-loading"><span class="spinner small"></span></div></div>
    </div>`;
  }

  async loadRepoTab(force) {
    const full = this.repoFull();
    if (!full || this.view !== 'repo') return;
    if (this.repoFor !== full) { this.repoData = {}; this.repoFor = full; }
    const tab = this.repoTab || 'overview';
    const body = $('.dk-repo-body', this.el);
    if (!body) return;
    this.repoData = this.repoData || {};
    try {
      if (tab === 'overview') {
        if (force || !this.repoData.info) this.repoData.info = await api.invoke('gh:repo', { full });
        body.innerHTML = this.overviewHtml(this.repoData.info);
      } else if (tab === 'pulls') {
        if (force || !this.repoData.pulls) this.repoData.pulls = await api.invoke('gh:pulls', { full, state: 'open' });
        body.innerHTML = this.pullsHtml(this.repoData.pulls);
      } else if (tab === 'issues') {
        if (force || !this.repoData.issues) this.repoData.issues = await api.invoke('gh:issues', { full, state: 'open' });
        body.innerHTML = this.issuesHtml(this.repoData.issues);
      } else if (tab === 'actions') {
        if (force || !this.repoData.runs) this.repoData.runs = await api.invoke('gh:runs', { full });
        body.innerHTML = this.actionsHtml(this.repoData.runs);
      } else if (tab === 'releases') {
        if (force || !this.repoData.releases) this.repoData.releases = await api.invoke('gh:releases', { full });
        body.innerHTML = this.releasesHtml(this.repoData.releases);
      }
    } catch (e) {
      if (this.view === 'repo') body.innerHTML = `<p class="bl-hint bad" style="padding:8px 10px">${esc(e.message)}</p>`;
    }
  }

  overviewHtml(r) {
    const stat = (n, label) => `<div class="dk-stat"><b>${n}</b><small>${label}</small></div>`;
    return `<div class="dk-repo-sec">
      <div class="dk-stats">${stat(r.stars, '★ étoiles')}${stat(r.forks, 'forks')}${stat(r.issues, 'ouverts')}${stat(r.watchers || 0, 'abonnés')}</div>
      <label class="field"><span>Description</span><input class="input" data-repo="description" value="${esc(r.description)}" placeholder="Décris le projet"></label>
      <label class="field"><span>Site (homepage)</span><input class="input" data-repo="homepage" value="${esc(r.homepage)}" placeholder="https://…"></label>
      <label class="field"><span>Sujets (séparés par des virgules)</span><input class="input" data-repo="topics" value="${esc((r.topics || []).join(', '))}" placeholder="flutter, benin, e-commerce"></label>
      <button class="btn small primary" data-gh="repo-save">${icon('check', 13)}<span>Enregistrer</span></button>
      <div class="dk-sub">Réglages</div>
      <label class="tog-row"><span class="tog-text"><span>Dépôt privé</span><small>${r.private ? 'Visible seulement par toi et les invités' : 'Public : visible par tous'}</small></span><input type="checkbox" data-repo="private" ${r.private ? 'checked' : ''} data-gh="repo-visibility"><span class="tog"></span></label>
      <p class="bl-hint">Branche par défaut : <b>${esc(r.branch)}</b>${r.license ? ` · licence ${esc(r.license)}` : ''}${r.language ? ` · ${esc(r.language)}` : ''}</p>
    </div>`;
  }

  pullsHtml(list) {
    return `<div class="dk-repo-sec">
      <button class="btn small primary wide" data-gh="pr-new">${icon('plus', 13)}<span>Nouvelle pull request</span></button>
      <div class="dk-ritems">${list.length ? list.map((p) => `<a class="dk-ritem" data-ext="${esc(p.url)}"><i class="dk-dot ${p.draft ? 'draft' : 'open'}"></i><span><b>${esc(p.title)}</b><small>#${p.number} · ${esc(p.head)} → ${esc(p.base)} · ${esc(p.author)} · ${ago(new Date(p.updated).getTime())}</small></span></a>`).join('') : '<p class="bl-hint" style="padding:8px 10px">Aucune pull request ouverte.</p>'}</div>
    </div>`;
  }

  issuesHtml(list) {
    return `<div class="dk-repo-sec">
      <button class="btn small primary wide" data-gh="issue-new">${icon('plus', 13)}<span>Nouvelle issue</span></button>
      <div class="dk-ritems">${list.length ? list.map((i) => `<div class="dk-ritem"><a data-ext="${esc(i.url)}" class="dk-ritem-main"><i class="dk-dot open"></i><span><b>${esc(i.title)}</b><small>#${i.number} · ${esc(i.author)} · ${ago(new Date(i.updated).getTime())}${i.comments ? ` · ${i.comments} 💬` : ''}${i.labels.length ? ` · ${i.labels.map(esc).join(', ')}` : ''}</small></span></a><button class="icon-btn small" data-gh="issue-close" data-num="${i.number}" title="Fermer l’issue">${icon('check', 12)}</button></div>`).join('') : '<p class="bl-hint" style="padding:8px 10px">Aucune issue ouverte.</p>'}</div>
    </div>`;
  }

  actionsHtml(list) {
    const dot = (w) => (w.status !== 'completed' ? 'run' : w.conclusion === 'success' ? 'ok' : w.conclusion === 'failure' ? 'fail' : 'skip');
    return `<div class="dk-repo-sec">
      <div class="dk-row-wrap"><button class="btn small" data-gh="wf-pages">${icon('globe', 13)}<span>Workflow Pages</span></button><button class="btn small" data-gh="wf-node">${icon('bolt', 13)}<span>Workflow Node CI</span></button></div>
      <p class="bl-hint">Ajoute un fichier de workflow prêt à l’emploi dans <code>.github/workflows</code>, validé localement. Envoie ensuite pour le déclencher sur GitHub.</p>
      <div class="dk-sub">Exécutions récentes</div>
      <div class="dk-ritems">${list.length ? list.map((w) => `<a class="dk-ritem" data-ext="${esc(w.url)}"><i class="dk-dot ${dot(w)}"></i><span><b>${esc(w.title || w.name)}</b><small>#${w.number} · ${esc(w.branch)} · ${esc(w.event)} · ${ago(new Date(w.created).getTime())}</small></span></a>`).join('') : '<p class="bl-hint" style="padding:8px 10px">Aucune exécution. Ajoute un workflow puis envoie ton code.</p>'}</div>
    </div>`;
  }

  releasesHtml(list) {
    return `<div class="dk-repo-sec">
      <button class="btn small primary wide" data-gh="rel-new">${icon('plus', 13)}<span>Nouvelle version</span></button>
      <div class="dk-ritems">${list.length ? list.map((r) => `<a class="dk-ritem" data-ext="${esc(r.url)}"><i class="dk-dot ${r.prerelease ? 'draft' : 'ok'}"></i><span><b>${esc(r.name)}</b><small>${esc(r.tag)}${r.prerelease ? ' · préversion' : ''} · ${r.published ? ago(new Date(r.published).getTime()) : 'brouillon'}</small></span></a>`).join('') : '<p class="bl-hint" style="padding:8px 10px">Aucune version publiée.</p>'}</div>
    </div>`;
  }

  cloneForm() {
    return `<div class="dk-clone"><input class="input mono" data-gh-url placeholder="https://github.com/utilisateur/projet" spellcheck="false"><div class="dk-git-row"><button class="btn small" data-gh="clone-url">${icon('download', 12)}<span>Cloner</span></button><button class="btn small" data-gh="zip-url">ZIP</button></div></div>`;
  }

  publishHtml() {
    const root = this.dev.st.root;
    const name = root ? root.split(/[\\/]/).pop().replace(/[^A-Za-z0-9._-]+/g, '-') : '';
    const gs = this.dev.git.st;
    return `<div class="dk-gh">
      <button class="link-btn small" data-gh="home">${icon('chevronLeft', 12)}<span>Retour</span></button>
      ${gs && gs.remote ? `<p class="bl-hint">Ce projet est déjà relié à <b>${esc(gs.remote.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, ''))}</b> : la publication envoie les nouveaux changements.</p>` : ''}
      <label class="field"><span>Nom du dépôt</span><input class="input" data-pub="name" value="${esc(name)}"></label>
      <label class="field"><span>Description</span><input class="input" data-pub="description" placeholder="Facultatif"></label>
      <label class="field"><span>Message de validation</span><input class="input" data-pub="message" value="Première version"></label>
      <label class="tog-row"><span class="tog-text"><span>Dépôt privé</span><small>Visible seulement par toi et les personnes invitées</small></span><input type="checkbox" data-pub="isPrivate" checked><span class="tog"></span></label>
      <label class="tog-row"><span class="tog-text"><span>Mettre en ligne avec GitHub Pages</span><small>Site statique gratuit sur ${esc((this.me && this.me.login) || 'compte')}.github.io (dépôt public, ou compte payant pour un dépôt privé)</small></span><input type="checkbox" data-pub="pages"><span class="tog"></span></label>
      <button class="btn small primary wide" data-gh="do-publish">${icon('upload', 13)}<span>Publier sur GitHub</span></button>
      <div class="dk-gprog bl-hint"></div>
      <div class="dk-pub-res"></div>
    </div>`;
  }

  async parent() {
    const d = await api.invoke('dev:pick-folder', { title: 'Où enregistrer le projet ?', create: true });
    return d;
  }

  // Actions propres à la gestion d'un dépôt (renvoie true si l'action a été prise en charge).
  async onRepoAction(g) {
    const act = g.dataset.gh;
    const REPO_ACTS = ['repo', 'repo-save', 'repo-visibility', 'pr-new', 'issue-new', 'issue-close', 'wf-pages', 'wf-node', 'rel-new'];
    if (!REPO_ACTS.includes(act)) return false;
    if (act === 'repo') { this.view = 'repo'; this.repoTab = 'overview'; this.render(this.el); return true; }
    const full = this.repoFull();
    if (!full) { toast('Ce projet n’est pas relié à un dépôt GitHub.', { kind: 'bad' }); return true; }
    const dir = this.dev.st.root;
    try {
      if (act === 'repo-save') {
        const v = (k) => $(`[data-repo="${k}"]`, this.el);
        await api.invoke('gh:update-repo', { full, body: { description: v('description').value.trim(), homepage: v('homepage').value.trim() } });
        await api.invoke('gh:set-topics', { full, names: v('topics').value.split(',').map((s) => s.trim()).filter(Boolean) });
        toast('Dépôt mis à jour.');
        this.loadRepoTab(true);
      } else if (act === 'repo-visibility') {
        const makePrivate = g.checked;
        if (!window.confirm(makePrivate ? 'Rendre ce dépôt privé ?' : 'Rendre ce dépôt public ? Tout le monde pourra le voir.')) { g.checked = !makePrivate; return true; }
        await api.invoke('gh:update-repo', { full, body: { private: makePrivate } });
        toast(makePrivate ? 'Dépôt rendu privé.' : 'Dépôt rendu public.');
        this.loadRepoTab(true);
      } else if (act === 'pr-new') {
        if (!this.repoData.info) this.repoData.info = await api.invoke('gh:repo', { full });
        const base = this.repoData.info.branch;
        const head = this.dev.git && this.dev.git.st ? this.dev.git.st.branch : null;
        if (!head) { toast('Branche courante inconnue.', { kind: 'bad' }); return true; }
        if (head === base) { toast(`Tu es sur « ${base} ». Crée une branche et envoie-la avant d’ouvrir une pull request.`, { kind: 'bad' }); return true; }
        const title = (window.prompt(`Titre de la pull request (${head} → ${base}) :`, '') || '').trim();
        if (!title) return true;
        const body = window.prompt('Description (facultative) :', '') || '';
        g.disabled = true;
        const r = await api.invoke('gh:create-pull', { full, title, head, base, body });
        toast(`Pull request #${r.number} créée.`);
        this.repoData.pulls = null; this.loadRepoTab(true);
      } else if (act === 'issue-new') {
        const title = (window.prompt('Titre de l’issue :', '') || '').trim();
        if (!title) return true;
        const body = window.prompt('Description (facultative) :', '') || '';
        g.disabled = true;
        const r = await api.invoke('gh:create-issue', { full, title, body });
        toast(`Issue #${r.number} créée.`);
        this.repoData.issues = null; this.loadRepoTab(true);
      } else if (act === 'issue-close') {
        await api.invoke('gh:close-issue', { full, number: Number(g.dataset.num) });
        toast(`Issue #${g.dataset.num} fermée.`);
        this.repoData.issues = null; this.loadRepoTab(true);
      } else if (act === 'wf-pages' || act === 'wf-node') {
        const kind = act === 'wf-pages' ? 'pages' : 'node';
        const r = await api.invoke('gh:add-workflow', { dir, kind });
        toast(`Workflow ajouté (${r.file}). Envoie ton code pour le déclencher.`);
        if (this.dev.git) { this.dev.git.log = []; this.dev.git.refresh(); }
      } else if (act === 'rel-new') {
        const tag = (window.prompt('Numéro de version (ex. v1.0.0) :', 'v1.0.0') || '').trim();
        if (!tag) return true;
        const name = window.prompt('Titre de la version :', tag) || tag;
        const body = window.prompt('Notes de version (facultatif) :', '') || '';
        g.disabled = true;
        const r = await api.invoke('gh:create-release', { full, tag, name, body });
        toast(`Version ${r.tag_name} publiée.`);
        this.repoData.releases = null; this.loadRepoTab(true);
      }
    } catch (err) { toast(err.message, { kind: 'bad' }); } finally { g.disabled = false; }
    return true;
  }

  async onClick(e) {
    const ext = e.target.closest('[data-ext]');
    if (ext) { api.invoke('shell:external', ext.dataset.ext); return; }
    const rt = e.target.closest('[data-rt]');
    if (rt) { this.repoTab = rt.dataset.rt; for (const b of $$('.dk-rt', this.el)) b.classList.toggle('on', b === rt); $('.dk-repo-body', this.el).innerHTML = '<div class="bl-loading"><span class="spinner small"></span></div>'; this.loadRepoTab(); return; }
    const clone = e.target.closest('[data-clone]');
    const zip = e.target.closest('[data-zip]');
    const g = e.target.closest('[data-gh]');
    try {
      if (g && (await this.onRepoAction(g))) return;
      if (clone || zip) {
        const parent = await this.parent();
        if (!parent) return;
        toast(clone ? 'Clonage du dépôt…' : 'Téléchargement…', { busy: true });
        const r = clone ? await api.invoke('git:clone', { url: clone.dataset.clone, parent, name: clone.dataset.name }) : await api.invoke('git:download-zip', { full: zip.dataset.zip, ref: zip.dataset.ref, parent });
        toast('Projet récupéré.');
        await this.dev.openFolder(r.dir);
        this.dev.setSide('files');
        return;
      }
      if (!g) return;
      switch (g.dataset.gh) {
        case 'connect': {
          const t = $('[data-gh-token]', this.el).value.trim();
          if (!t) return;
          g.disabled = true;
          this.me = await api.invoke('git:connect', { token: t });
          toast(`Connecté à GitHub : ${this.me.login}`);
          this.render(this.el);
          break;
        }
        case 'logout': await api.invoke('git:forget'); this.me = null; this.repos = null; this.render(this.el); break;
        case 'home': this.view = 'home'; this.render(this.el); break;
        case 'publish': this.view = 'publish'; this.render(this.el); break;
        case 'clone': this.view = 'clone'; this.render(this.el); break;
        case 'clone-url': case 'zip-url': {
          const url = $('[data-gh-url]', this.el).value.trim();
          const m = /github\.com[/:]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:[/#?].*)?$/.exec(url);
          if (!m) { toast('Adresse GitHub invalide.', { kind: 'bad' }); return; }
          const parent = await this.parent();
          if (!parent) return;
          toast('Récupération du dépôt…', { busy: true });
          const r = g.dataset.gh === 'clone-url' ? await api.invoke('git:clone', { url: `https://github.com/${m[1]}/${m[2]}.git`, parent, name: m[2] }) : await api.invoke('git:download-zip', { full: `${m[1]}/${m[2]}`, parent });
          toast('Projet récupéré.');
          await this.dev.openFolder(r.dir);
          this.dev.setSide('files');
          break;
        }
        case 'do-publish': {
          const v = (k) => $(`[data-pub="${k}"]`, this.el);
          g.disabled = true;
          await this.dev.saveAll();
          const r = await api.invoke('git:publish', {
            dir: this.dev.st.root, name: v('name').value.trim(), description: v('description').value.trim(), isPrivate: v('isPrivate').checked, pages: v('pages').checked, message: v('message').value.trim(),
          });
          g.disabled = false;
          $('.dk-pub-res', this.el).innerHTML = `<div class="dk-pub-ok">${icon('pass', 16)}<b>Publié</b>
            <button class="link-btn small" data-ext="${esc(r.url)}">${icon('external', 12)}<span>${esc(r.full)}</span></button>
            ${r.pages && typeof r.pages === 'string' ? `<button class="link-btn small" data-ext="${esc(r.pages)}">${icon('globe', 12)}<span>${esc(r.pages)}</span></button><small>Le site est en ligne après une à deux minutes.</small>` : ''}
            ${r.pages && r.pages.error ? `<small class="bad">GitHub Pages : ${esc(r.pages.error)}</small>` : ''}</div>`;
          this.dev.git.log = [];
          this.dev.git.refresh();
          break;
        }
        default: break;
      }
    } catch (err) {
      if (g) g.disabled = false;
      toast(err.message, { kind: 'bad' });
    }
  }
}

// =========================================================================== terminaux
export class TerminalPanel {
  constructor(dev, el) {
    this.dev = dev;
    this.el = el;
    this.terms = new Map(); // id → { name, lines, ansi, cwd, busy, onDone, onUrl }
    this.active = null;
    this.cwd = null;
    el.innerHTML = `
      <div class="tm-head"><div class="tm-tabs"></div><span class="dk-sp"></span>
        <button class="icon-btn small" data-tm="new" title="Nouveau terminal">${icon('plus', 13)}</button>
        <button class="icon-btn small" data-tm="stop" title="Arrêter la commande en cours">${icon('stop', 12)}</button>
        <button class="icon-btn small" data-tm="clear" title="Effacer">${icon('trash', 12)}</button></div>
      <div class="tm-out"></div>
      <form class="tm-form"><span class="tm-cwd"></span><input class="tm-in" spellcheck="false" placeholder="Commande (npm install, git status…)"></form>`;
    this.$out = $('.tm-out', el);
    this.$in = $('.tm-in', el);
    this.hist = [];
    this.hi = -1;
    $('.tm-form', el).addEventListener('submit', (e) => { e.preventDefault(); this.submit(); });
    this.$in.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' && this.hist.length) { e.preventDefault(); this.hi = Math.min(this.hist.length - 1, this.hi + 1); this.$in.value = this.hist[this.hist.length - 1 - this.hi]; }
      if (e.key === 'ArrowDown') { e.preventDefault(); this.hi = Math.max(-1, this.hi - 1); this.$in.value = this.hi < 0 ? '' : this.hist[this.hist.length - 1 - this.hi]; }
      if (e.key === 'c' && e.ctrlKey && !this.$in.selectionEnd) { e.preventDefault(); this.stop(); }
    });
    el.addEventListener('click', (e) => this.onClick(e));
    api.on('dev:term', (m) => this.onData(m));
  }

  setCwd(dir) { this.cwd = dir; if (!this.terms.size) this.open(dir); }

  async open(cwd, name) {
    const r = await api.invoke('dev:term-open', { cwd: cwd || this.cwd });
    this.terms.set(r.id, {
      name: name || `${r.shell} ${this.terms.size + 1}`, lines: [''], ansi: new Ansi(), cwd: r.cwd, busy: false,
    });
    this.active = r.id;
    this.renderTabs();
    this.paint();
    return r.id;
  }

  run(id, command, { onDone, onUrl, quiet } = {}) {
    const t = this.terms.get(id);
    if (!t) return;
    t.onDone = onDone;
    t.onUrl = onUrl;
    if (!quiet) this.append(id, `\u001b[38;5;246m${t.cwd}>\u001b[0m \u001b[1m${command}\u001b[0m\n`);
    t.busy = true;
    api.invoke('dev:term-write', { id, line: command });
    this.renderTabs();
  }

  submit() {
    const v = this.$in.value;
    if (!this.active) return;
    const t = this.terms.get(this.active);
    this.$in.value = '';
    this.hi = -1;
    if (t.busy) { this.append(this.active, `${v}\n`); api.invoke('dev:term-input', { id: this.active, text: v }); return; }
    if (!v.trim()) return;
    this.hist.push(v);
    if (/^(cls|clear)$/i.test(v.trim())) { t.lines = ['']; this.paint(); return; }
    this.run(this.active, v);
  }

  append(id, text) {
    const t = this.terms.get(id);
    if (!t) return;
    const html = t.ansi.html(text);
    const parts = html.split('\n');
    parts.forEach((p, i) => {
      if (i > 0) t.lines.push('');
      const cr = p.lastIndexOf('\r');
      if (cr >= 0) t.lines[t.lines.length - 1] = p.slice(cr + 1);
      else t.lines[t.lines.length - 1] += p;
    });
    if (t.lines.length > 4000) t.lines.splice(0, t.lines.length - 4000);
    if (id === this.active && !this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.paint(); });
  }

  onData(m) {
    const t = this.terms.get(m.id);
    if (!t) return;
    if (m.data) this.append(m.id, m.data);
    if (m.cwd) t.cwd = m.cwd;
    if (m.url && t.onUrl) t.onUrl(m.url);
    if (m.done) {
      t.busy = false;
      const cb = t.onDone;
      t.onDone = null;
      if (cb) cb();
      this.renderTabs();
    }
    if (m.exit != null) { this.append(m.id, `\n\u001b[33m(terminal fermé : ${m.exit})\u001b[0m\n`); t.busy = false; this.renderTabs(); }
    if (m.id === this.active) $('.tm-cwd', this.el).textContent = `${t.cwd}>`;
  }

  paint() {
    const t = this.terms.get(this.active);
    if (!t) { this.$out.innerHTML = ''; return; }
    const atBottom = this.$out.scrollHeight - this.$out.scrollTop - this.$out.clientHeight < 30;
    this.$out.innerHTML = t.lines.slice(-1500).map((l) => `<div>${l || '&nbsp;'}</div>`).join('');
    if (atBottom) this.$out.scrollTop = this.$out.scrollHeight;
    $('.tm-cwd', this.el).textContent = `${t.cwd}>`;
  }

  renderTabs() {
    $('.tm-tabs', this.el).innerHTML = [...this.terms].map(([id, t]) => `<button class="${id === this.active ? 'on' : ''}" data-tmtab="${id}">${t.busy ? '<i class="tm-busy"></i>' : icon('terminal', 12)}<span>${esc(t.name)}</span><i data-tmclose="${id}">${icon('close', 10)}</i></button>`).join('');
  }

  async stop() {
    if (this.active) await api.invoke('dev:term-stop', { id: this.active });
  }

  async onClick(e) {
    const link = e.target.closest('[data-term-link]');
    if (link) { this.dev.preview.load(link.dataset.termLink); return; }
    const cl = e.target.closest('[data-tmclose]');
    if (cl) {
      e.stopPropagation();
      await api.invoke('dev:term-close', { id: cl.dataset.tmclose });
      this.terms.delete(cl.dataset.tmclose);
      if (this.active === cl.dataset.tmclose) this.active = [...this.terms.keys()].pop() || null;
      if (this.dev.preview.termId === cl.dataset.tmclose) this.dev.preview.stopped();
      this.renderTabs();
      this.paint();
      return;
    }
    const tab = e.target.closest('[data-tmtab]');
    if (tab) { this.active = tab.dataset.tmtab; this.renderTabs(); this.paint(); return; }
    const b = e.target.closest('[data-tm]');
    if (!b) { if (!window.getSelection().toString()) this.$in.focus(); return; }
    if (b.dataset.tm === 'new') this.open(this.dev.st.root);
    if (b.dataset.tm === 'stop') this.stop();
    if (b.dataset.tm === 'clear' && this.active) { this.terms.get(this.active).lines = ['']; this.paint(); }
  }
}

// =========================================================================== aperçu et partage
const SIZES = {
  fill: ['Ajusté', 0], mobile: ['Mobile', 390], tablet: ['Tablette', 820], laptop: ['Ordinateur', 1280],
};

export class PreviewPanel {
  constructor(dev, el) {
    this.dev = dev;
    this.el = el;
    this.url = null;
    this.running = false;
    this.size = 'fill';
    el.innerHTML = `
      <div class="pv-bar">
        <button class="icon-btn small" data-pv="reload" title="Recharger">${icon('reload', 14)}</button>
        <input class="pv-url" spellcheck="false" placeholder="Adresse de l’aperçu">
        <select class="input pv-size">${Object.entries(SIZES).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select>
        <button class="icon-btn small" data-pv="browser" title="Analyser dans le Browser Lab">${icon('globe', 14)}</button>
        <button class="icon-btn small" data-pv="responsive" title="Voir sur tous les appareils (Responsive Lab)">${icon('multi', 14)}</button>
      </div>
      <div class="pv-share" hidden></div>
      <div class="pv-view"><div class="pv-empty">${icon('play', 22)}<p>Lance le projet pour le voir ici. Chaque enregistrement met l’aperçu à jour.</p></div></div>`;
    this.$view = $('.pv-view', el);
    this.$url = $('.pv-url', el);
    this.$url.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.load(this.$url.value); });
    $('.pv-size', el).addEventListener('change', (e) => { this.size = e.target.value; this.layout(); });
    el.addEventListener('click', (e) => this.onClick(e));
    api.on('dev:reload', (m) => { if (this.wv && m.dir === this.staticDir) this.wv.reload(); });
    api.on('tunnel:state', (m) => { if (m.id === this.shareId && m.state === 'off') { this.publicUrl = null; this.renderShare(); } });
    new ResizeObserver(() => this.layout()).observe(this.$view);
  }

  projectChanged() {
    if (this.running) return;
    this.url = null;
    this.$view.innerHTML = `<div class="pv-empty">${icon('play', 22)}<p>Lance le projet pour le voir ici. Chaque enregistrement met l’aperçu à jour.</p></div>`;
    this.wv = null;
  }

  async toggleRun() {
    if (this.running) { await this.stop(); return; }
    const dir = this.dev.st.root;
    const a = this.dev.analysis || await api.invoke('dev:analyze', dir);
    this.dev.analysis = a;
    if (a.unsupported && !a.static) { toast(`${a.unsupported.title} : ${a.unsupported.message}`, { kind: 'bad' }); return; }
    if (this.dev.$.preview.hidden) $('[data-act="toggle-preview"]', this.dev.el).click();
    this.running = true;
    this.dev.updateRunButton();
    // Le projet tourne déjà pour les autres espaces : on réutilise son serveur au lieu d'en lancer un second.
    if (S.source && S.source.dir === dir && S.baseUrl) { this.reused = true; this.load(S.baseUrl); return; }
    if (a.static || !a.command) {
      this.staticDir = a.staticDir || dir;
      const url = await api.invoke('dev:static-start', { dir: this.staticDir });
      this.load(url);
      return;
    }
    if (this.dev.$.bottom.hidden) $('[data-act="toggle-bottom"]', this.dev.el).click();
    const id = await this.dev.terminal.open(dir, 'Serveur');
    this.termId = id;
    const cmd = [...(a.install || []), a.command].join(' && ');
    this.$view.innerHTML = `<div class="pv-empty"><span class="spinner"></span><p>Démarrage du serveur…<br><code>${esc(cmd)}</code></p></div>`;
    this.dev.terminal.run(id, cmd, {
      onUrl: (u) => { if (!this.url || !this.wv) this.load(u); },
      onDone: () => this.stopped(),
    });
  }

  stopped() {
    this.running = false;
    this.termId = null;
    this.dev.updateRunButton();
  }

  async stop() {
    this.reused = false;
    if (this.termId) { await api.invoke('dev:term-stop', { id: this.termId }); }
    if (this.staticDir) { await api.invoke('dev:static-stop', { dir: this.staticDir }); this.staticDir = null; }
    if (this.shareId) { api.invoke('tunnel:stop', { id: this.shareId }); this.publicUrl = null; }
    this.serverUrl = null;
    this.stopped();
    this.projectChanged();
  }

  load(url) {
    if (!url) return;
    this.url = url;
    try { if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(url).hostname)) this.serverUrl = url; } catch { /* adresse */ }
    this.$url.value = url;
    if (!this.wv) {
      this.$view.innerHTML = '';
      const wv = document.createElement('webview');
      wv.className = 'pv-wv';
      wv.setAttribute('partition', 'persist:vitrine');
      wv.src = url;
      wv.addEventListener('did-navigate', (e) => { this.$url.value = e.url; });
      wv.addEventListener('dom-ready', () => {
        try { wv.send('vitrine-config', { dragScroll: this.size === 'mobile', touch: false, pointer: false, syncClicks: false, syncNav: false }); } catch { /* ignore */ }
        this.wcId = wv.getWebContentsId();
        this.layout();
      });
      wv.addEventListener('did-fail-load', (e) => { if (e.isMainFrame && e.errorCode === -102) setTimeout(() => { try { wv.reload(); } catch { /* fermée */ } }, 1500); });
      this.wv = wv;
      this.$view.append(wv);
    } else {
      try { this.wv.loadURL(url).catch(() => {}); } catch { this.wv.src = url; }
    }
    this.layout();
    this.renderShare();
  }

  layout() {
    const wv = this.wv;
    if (!wv) return;
    const box = this.$view.getBoundingClientRect();
    const w = SIZES[this.size][1];
    if (!w) {
      wv.style.width = '100%';
      wv.style.height = '100%';
      wv.style.transform = '';
      wv.style.left = '0';
      if (this.wcId && this.emulated) { api.invoke('lab:emu-clear', { wcId: this.wcId }).catch(() => {}); this.emulated = false; }
      return;
    }
    const k = Math.min(1, box.width / w);
    const h = box.height / k;
    wv.style.width = `${w}px`;
    wv.style.height = `${h}px`;
    wv.style.transform = `scale(${k})`;
    wv.style.left = `${Math.max(0, (box.width - w * k) / 2)}px`;
    if (this.wcId) {
      const mobile = w < 900;
      const ua = uaFor({ os: mobile ? 'android' : 'windows' });
      api.invoke('device:emulate', {
        wcId: this.wcId, emu: { width: w, height: Math.round(h), dpr: mobile ? 2 : 1, mobile, touch: mobile, ua: ua.ua, uaMeta: ua.uaMeta, scale: 1 }, env: settings.env,
      }).catch(() => {});
      this.emulated = true;
    }
  }

  // ------------------------------------------------------------------ partage
  openShare() {
    const box = $('.pv-share', this.el);
    if (this.dev.$.preview.hidden) $('[data-act="toggle-preview"]', this.dev.el).click();
    box.hidden = !box.hidden;
    if (!box.hidden) this.renderShare();
  }

  async renderShare() {
    const box = $('.pv-share', this.el);
    if (box.hidden) return;
    const list = await api.invoke('tunnel:list');
    const name = (this.localName || (this.dev.st.root || 'site').split(/[\\/]/).pop()).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'site';
    const tld = this.tld || 'nexora';
    const origin = (u) => { try { return new URL(u).origin; } catch { return ''; } };
    const mine = list.names.filter((n) => origin(n.target) === origin(this.serverUrl || this.url));
    box.innerHTML = `
      <div class="pv-sh-sec"><b>${icon('globe', 13)} Lien public</b>
        ${!this.url ? '<p class="bl-hint">Lance d’abord le projet.</p>' : this.publicUrl ? `<div class="pv-link"><code>${esc(this.publicUrl)}</code><button class="icon-btn small" data-copy="${esc(this.publicUrl)}">${icon('copy', 12)}</button><button class="icon-btn small" data-ext="${esc(this.publicUrl)}">${icon('external', 12)}</button></div><div class="pv-qr"></div><p class="bl-hint">Accessible depuis n’importe quel téléphone ou ordinateur, tant que NEXORA reste ouvert. Le lien change à chaque partage.</p><button class="btn small" data-pv="share-stop">${icon('stop', 11)}<span>Arrêter le partage</span></button>`
    : list.cloudflared ? `<p class="bl-hint">Crée une adresse https accessible sur Internet (gratuit, sans compte).</p><button class="btn small primary" data-pv="share-start">${icon('link', 12)}<span>Créer le lien</span></button>`
      : `<p class="bl-hint">Nécessite un module gratuit (≈ 35 Mo, téléchargé une seule fois).</p><button class="btn small primary" data-pv="share-install">${icon('download', 12)}<span>Installer et créer le lien</span></button><div class="pv-prog bl-hint"></div>`}
      </div>
      <div class="pv-sh-sec"><b>${icon('link', 13)} Adresse personnalisée</b>
        <div class="pv-name"><span>http://</span><input class="input" data-pv-name value="${esc(name)}"><select class="input" data-pv-tld>${['nexora', 'com', 'local', 'test', 'app'].map((t) => `<option value="${t}" ${t === tld ? 'selected' : ''}>.${t}</option>`).join('')}</select><button class="btn small" data-pv="name-set" ${this.url ? '' : 'disabled'}>Créer</button></div>
        ${mine.map((n) => `<div class="pv-link"><code>${esc(n.url)}</code><button class="icon-btn small" data-copy="${esc(n.url)}">${icon('copy', 12)}</button><button class="icon-btn small" data-pv="name-open" data-url="${esc(n.url)}" title="Ouvrir dans le Browser Lab">${icon('globe', 12)}</button><button class="icon-btn small" data-pv="name-del" data-host="${esc(n.host)}">${icon('close', 12)}</button></div>`).join('')}
        <p class="bl-hint">Fonctionne dans NEXORA (Responsive Lab, Browser Lab, App Builder) sans droits administrateur. ${tld === 'com' ? 'Un nom en .com remplace le vrai site du même nom, seulement sur cet ordinateur.' : ''}</p>
        ${mine.length ? `<button class="link-btn small" data-pv="system">${icon('shield', 12)}<span>Rendre ces adresses accessibles dans tous les navigateurs du PC (administrateur)</span></button>` : ''}
      </div>`;
    if (this.publicUrl) this.qr($('.pv-qr', box), this.publicUrl);
  }

  async qr(el, text) {
    try {
      const { default: qrcode } = await import('qrcode-generator');
      const q = qrcode(0, 'M');
      q.addData(text);
      q.make();
      el.innerHTML = q.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
    } catch { el.innerHTML = ''; }
  }

  async onClick(e) {
    const ext = e.target.closest('[data-ext]');
    if (ext) { api.invoke('shell:external', ext.dataset.ext); return; }
    const b = e.target.closest('[data-pv]');
    if (!b) return;
    try {
      switch (b.dataset.pv) {
        case 'reload': if (this.wv) this.wv.reload(); break;
        case 'browser': case 'name-open': {
          const url = b.dataset.url || this.url;
          if (!url) break;
          const { setMode } = await import('../viewer/toolbar.js');
          await setMode('browser');
          const { S } = await import('../core/state.js');
          if (S.browserLab) S.browserLab.navigate(url);
          break;
        }
        case 'responsive': {
          if (!this.url) break;
          const { setMode } = await import('../viewer/toolbar.js');
          const { openUrl } = await import('../viewer/sources.js');
          await setMode('preview');
          openUrl(this.url);
          break;
        }
        case 'share-install': {
          b.disabled = true;
          const off = api.on('tunnel:progress', (p) => { const pr = $('.pv-prog', this.el); if (pr) pr.textContent = `Téléchargement… ${Math.round(p.progress * 100)} %`; });
          try { await api.invoke('tunnel:install'); } finally { off(); }
        }
        // fallthrough : création du lien juste après l'installation
        case 'share-start': {
          b.disabled = true;
          const t = toast('Création du lien public…', { busy: true, sticky: true });
          this.shareId = this.shareId || `dev-${Date.now()}`;
          try {
            const local = new URL(this.serverUrl || this.url);
            this.publicUrl = await api.invoke('tunnel:start', { id: this.shareId, target: `${local.protocol}//${local.host}` });
            t.close();
            toast('Lien public créé.');
          } catch (err) { t.close(); throw err; }
          this.renderShare();
          break;
        }
        case 'share-stop': await api.invoke('tunnel:stop', { id: this.shareId }); this.publicUrl = null; this.renderShare(); break;
        case 'name-set': {
          const n = $('[data-pv-name]', this.el).value.trim().toLowerCase();
          this.tld = $('[data-pv-tld]', this.el).value;
          this.localName = n;
          const local = new URL(this.serverUrl || this.url);
          const url = await api.invoke('tunnel:name-set', { host: `${n}.${this.tld}`, target: `${local.protocol}//${local.host}` });
          toast(`Adresse créée : ${url}`);
          this.renderShare();
          break;
        }
        case 'name-del': await api.invoke('tunnel:name-remove', { host: b.dataset.host }); this.renderShare(); break;
        case 'system': {
          const list = await api.invoke('tunnel:list');
          await api.invoke('tunnel:system', { hosts: list.names.map((n) => n.host) });
          toast('Adresses actives dans tous les navigateurs de cet ordinateur.');
          break;
        }
        default: break;
      }
    } catch (err) { b.disabled = false; toast(err.message, { kind: 'bad' }); }
  }
}

export { rel, $$ };
