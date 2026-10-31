/* NEXORA Cloud : interface du compte (bouton du rail, connexion, centre du compte, équipes, offre, supervision,
 * notifications, support), commune à la version web et à l'application Windows. */
import { supa, errText, callFn } from './supa.js';
import {
  cloud, signIn, signUp, resetPassword, updatePassword, signOut, signOutEverywhere, updateProfile, uploadAvatar, updateEmail, setOrg, loadAccount, avatarHtml, magicLink,
} from './session.js';
import { IS_WEB } from './config.js';
import { $, esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import {
  toast, showPopover, hidePopover, openSheet, closeSheet,
} from '../core/ui.js';

const ROLES = {
  owner: 'Propriétaire', admin: 'Administrateur', editor: 'Éditeur', viewer: 'Lecteur',
};
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const ago = (d) => {
  if (!d) return 'jamais';
  const s = Math.round((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
};
const money = (cents, cur = 'EUR') => (cents ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(cents / 100) : 'Gratuit');
export { fmtDate, fmtDateTime, money, ROLES };

// ================================================================== formulaires de connexion (web et application)
export function authFormHtml(mode = 'login') {
  const signupClosed = cloud.config.signups_enabled === false;
  if (mode === 'signup') {
    return `<form class="nx-auth" data-auth="signup">
      <h2>Crée ton compte NEXORA</h2>
      <p class="nx-muted">Gratuit, sans carte bancaire. Tes projets, designs et scènes te suivent sur le web et sur Windows.</p>
      ${signupClosed ? '<p class="nx-alert">Les inscriptions sont momentanément fermées.</p>' : ''}
      <label class="nx-field"><span>Nom complet</span><input class="input" name="name" autocomplete="name" required maxlength="80" data-autofocus></label>
      <label class="nx-field"><span>Adresse e-mail</span><input class="input" name="email" type="email" autocomplete="email" required></label>
      <label class="nx-field"><span>Mot de passe <small>(8 caractères minimum)</small></span><input class="input" name="password" type="password" autocomplete="new-password" minlength="8" required></label>
      <label class="check-row small"><input type="checkbox" name="terms" required><span class="box"></span><span>J’accepte les conditions d’utilisation et la politique de confidentialité.</span></label>
      <button class="btn primary wide nx-submit" ${signupClosed ? 'disabled' : ''}>Créer mon compte</button>
      <p class="nx-switch">Déjà inscrit ? <button type="button" class="link-btn" data-auth-go="login">Se connecter</button></p>
      <p class="nx-msg" data-msg></p>
    </form>`;
  }
  if (mode === 'forgot') {
    return `<form class="nx-auth" data-auth="forgot">
      <h2>Mot de passe oublié</h2>
      <p class="nx-muted">Tu vas recevoir un lien pour choisir un nouveau mot de passe.</p>
      <label class="nx-field"><span>Adresse e-mail</span><input class="input" name="email" type="email" autocomplete="email" required data-autofocus></label>
      <button class="btn primary wide nx-submit">Envoyer le lien</button>
      <p class="nx-switch"><button type="button" class="link-btn" data-auth-go="login">Retour à la connexion</button></p>
      <p class="nx-msg" data-msg></p>
    </form>`;
  }
  if (mode === 'reset') {
    return `<form class="nx-auth" data-auth="reset">
      <h2>Nouveau mot de passe</h2>
      <label class="nx-field"><span>Nouveau mot de passe</span><input class="input" name="password" type="password" autocomplete="new-password" minlength="8" required data-autofocus></label>
      <label class="nx-field"><span>Confirmation</span><input class="input" name="password2" type="password" autocomplete="new-password" minlength="8" required></label>
      <button class="btn primary wide nx-submit">Enregistrer</button>
      <p class="nx-msg" data-msg></p>
    </form>`;
  }
  return `<form class="nx-auth" data-auth="login">
    <h2>Connexion</h2>
    <p class="nx-muted">Retrouve tes projets, designs et scènes 3D.</p>
    <label class="nx-field"><span>Adresse e-mail</span><input class="input" name="email" type="email" autocomplete="email" required data-autofocus></label>
    <label class="nx-field"><span>Mot de passe</span><input class="input" name="password" type="password" autocomplete="current-password" required></label>
    <div class="nx-row-between"><button type="button" class="link-btn" data-auth-go="forgot">Mot de passe oublié ?</button><button type="button" class="link-btn" data-auth-magic>Recevoir un lien de connexion</button></div>
    <button class="btn primary wide nx-submit">Se connecter</button>
    <p class="nx-switch">Pas encore de compte ? <button type="button" class="link-btn" data-auth-go="signup">Créer un compte</button></p>
    <p class="nx-msg" data-msg></p>
  </form>`;
}

/* Gestion des formulaires dans un conteneur ; onDone() après connexion réussie. */
export function bindAuth(root, { onDone = () => {}, render } = {}) {
  const show = (mode) => { if (render) render(mode); else root.innerHTML = authFormHtml(mode); const f = root.querySelector('[data-autofocus]'); if (f) f.focus(); };
  root.addEventListener('click', async (e) => {
    const go = e.target.closest('[data-auth-go]');
    if (go) { e.preventDefault(); show(go.dataset.authGo); return; }
    if (e.target.closest('[data-auth-magic]')) {
      const form = root.querySelector('form');
      const email = form.email.value.trim();
      const msg = form.querySelector('[data-msg]');
      if (!email) { msg.className = 'nx-msg bad'; msg.textContent = 'Saisis d’abord ton adresse e-mail.'; return; }
      try { await magicLink(email); msg.className = 'nx-msg ok'; msg.textContent = 'Lien envoyé : ouvre ta boîte e-mail.'; } catch (err) { msg.className = 'nx-msg bad'; msg.textContent = err.message; }
    }
  });
  root.addEventListener('submit', async (e) => {
    const form = e.target.closest('form[data-auth]');
    if (!form) return;
    e.preventDefault();
    const msg = form.querySelector('[data-msg]');
    const btn = form.querySelector('.nx-submit');
    const done = (text, ok) => { msg.className = `nx-msg ${ok ? 'ok' : 'bad'}`; msg.textContent = text; };
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    try {
      const kind = form.dataset.auth;
      if (kind === 'login') { await signIn({ email: form.email.value.trim(), password: form.password.value }); onDone(); }
      if (kind === 'signup') {
        const r = await signUp({ email: form.email.value.trim(), password: form.password.value, fullName: form.name.value.trim() });
        if (r.needsConfirm) { form.innerHTML = `<div class="nx-sent">${icon('mail', 34)}<h2>Vérifie ta boîte e-mail</h2><p>Nous avons envoyé un lien de confirmation à <b>${esc(form.email.value.trim())}</b>. Clique dessus pour activer ton compte.</p><button type="button" class="btn" data-auth-go="login">Retour à la connexion</button></div>`; return; }
        onDone();
      }
      if (kind === 'forgot') { await resetPassword(form.email.value.trim()); done('Si un compte existe pour cette adresse, un lien vient d’être envoyé.', true); }
      if (kind === 'reset') {
        if (form.password.value !== form.password2.value) { done('Les deux mots de passe ne correspondent pas.', false); return; }
        await updatePassword(form.password.value);
        done('Mot de passe modifié.', true);
        setTimeout(onDone, 800);
      }
    } catch (err) { done(errText(err), false); } finally { btn.disabled = false; btn.removeAttribute('aria-busy'); }
  });
  show(root.dataset.mode || 'login');
}

export function openAuthSheet(mode = 'login') {
  const sheet = openSheet('cloud-auth', `<div class="sheet-body nx-auth-sheet" data-mode="${mode}"></div><div class="sheet-foot"><span class="nx-muted small">${icon('lock', 12)} Connexion sécurisée NEXORA Cloud</span><span class="grow"></span><button class="btn" data-sheet="close">Fermer</button></div>`);
  bindAuth($('.nx-auth-sheet', sheet), { onDone: () => { closeSheet('cloud-auth'); toast('Connecté à NEXORA Cloud : synchronisation activée.'); } });
}

// ================================================================== bouton du compte dans le rail
export function initCloudUi() {
  const foot = $('.rail-foot');
  if (foot && !$('#btnAccount')) {
    foot.insertAdjacentHTML('afterbegin', `<button class="rail-btn rail-acct" id="btnAccount" title="Compte NEXORA Cloud" aria-label="Compte"><span class="rail-acct-av"></span><span class="rail-label">Compte</span><i class="nx-badge" hidden></i></button>`);
    $('#btnAccount').addEventListener('click', (e) => { if (!cloud.user) openAuthSheet(); else accountMenu(e.currentTarget); });
  }
  const paint = () => {
    const b = $('#btnAccount');
    if (!b) return;
    b.querySelector('.rail-acct-av').innerHTML = cloud.user ? avatarHtml(cloud.profile || { email: cloud.user.email, id: cloud.user.id }, 30) : icon('cloud', 18);
    b.querySelector('.rail-label').textContent = cloud.user ? 'Compte' : 'Connexion';
    const badge = b.querySelector('.nx-badge');
    badge.hidden = !cloud.unread;
    badge.textContent = cloud.unread > 9 ? '9+' : String(cloud.unread);
  };
  for (const ev of ['auth', 'account', 'unread']) cloud.on(ev, paint);
  paint();
  cloud.on('notification', (n) => toast(n.title, { action: n.link ? 'Voir' : undefined, onAction: () => openAccount('notifications') }));
  cloud.on('suspended', () => {
    toast('Ton compte a été suspendu par un administrateur. Contacte le support.', { kind: 'bad', sticky: true });
    if (IS_WEB) setTimeout(() => signOut().then(() => location.reload()), 2500);
  });
  cloud.on('announcements', () => showAnnouncements());
  cloud.on('config', () => paintMaintenance());
  cloud.on('auth', () => { showAnnouncements(); paintMaintenance(); });
  showAnnouncements();
  paintMaintenance();
}

function accountMenu(anchor) {
  const p = cloud.profile || {};
  const pop = showPopover(anchor, `
    <div class="nx-me">${avatarHtml(p, 38)}<div><b>${esc(p.full_name || cloud.user.email)}</b><small>${esc(cloud.user.email)}</small></div></div>
    ${cloud.orgs.length > 1 ? `<div class="pop-sub">Équipe active</div>${cloud.orgs.map((o) => `<button class="menu-item${o.id === cloud.orgId ? ' on' : ''}" data-org="${o.id}">${icon(o.personal ? 'user' : 'group', 14)}<span>${esc(o.name)}</span><small>${esc(o.plan)}</small></button>`).join('')}<div class="menu-sep"></div>` : `<div class="nx-plan-chip">${icon('star', 12)} Offre ${esc(planName(cloud.plan))}</div>`}
    <button class="menu-item" data-acc="profile">${icon('user', 14)}<span>Mon compte</span></button>
    <button class="menu-item" data-acc="notifications">${icon('bell', 14)}<span>Notifications</span>${cloud.unread ? `<b class="nx-count">${cloud.unread}</b>` : ''}</button>
    <button class="menu-item" data-acc="teams">${icon('group', 14)}<span>Équipe et membres</span></button>
    <button class="menu-item" data-acc="monitors">${icon('sync', 14)}<span>Supervision cloud</span></button>
    <button class="menu-item" data-acc="plan">${icon('star', 14)}<span>Offre et usage</span></button>
    <button class="menu-item" data-acc="support">${icon('chat', 14)}<span>Support</span></button>
    ${cloud.isAdmin ? `<div class="menu-sep"></div><button class="menu-item nx-admin-item" data-acc="admin">${icon('shield', 14)}<span>Administration</span></button>` : ''}
    <div class="menu-sep"></div>
    <button class="menu-item" data-acc="logout">${icon('external', 14)}<span>Se déconnecter</span></button>`, { width: 290, align: 'start' });
  if (!pop) return;
  pop.onclick = async (e) => {
    const o = e.target.closest('[data-org]');
    if (o) { hidePopover(); setOrg(o.dataset.org); toast(`Équipe active : ${cloud.org.name}`); return; }
    const b = e.target.closest('[data-acc]');
    if (!b) return;
    hidePopover();
    const a = b.dataset.acc;
    if (a === 'logout') { await signOut(); toast('Déconnecté.'); if (IS_WEB) location.hash = '#/'; return; }
    if (a === 'admin') { const m = await import('./admin.js'); m.openAdmin(); return; }
    openAccount(a);
  };
}

const planName = (id) => ({ free: 'Gratuit', pro: 'Pro', team: 'Équipe', enterprise: 'Entreprise' })[id] || id;

// ================================================================== annonces et maintenance
async function showAnnouncements() {
  document.querySelector('.nx-banner')?.remove();
  if (!cloud.user) return;
  const { data } = await supa.from('announcements').select('*').order('created_at', { ascending: false }).limit(5);
  const { data: reads } = await supa.from('announcement_reads').select('announcement_id');
  const seen = new Set((reads || []).map((r) => r.announcement_id));
  const a = (data || []).find((x) => !seen.has(x.id) && (x.audience === 'all' || x.audience === cloud.plan || (x.audience === 'admins' && cloud.isAdmin)));
  if (!a) return;
  document.body.insertAdjacentHTML('beforeend', `<div class="nx-banner lvl-${esc(a.level)}" role="status">${icon(a.level === 'critical' || a.level === 'warning' ? 'warn' : 'bell', 16)}<div><b>${esc(a.title)}</b><span>${esc(a.body)}</span></div><button class="icon-btn small" aria-label="Fermer">${icon('close', 13)}</button></div>`);
  document.querySelector('.nx-banner button').onclick = async () => {
    document.querySelector('.nx-banner')?.remove();
    await supa.from('announcement_reads').upsert({ announcement_id: a.id, user_id: cloud.user.id });
    showAnnouncements();
  };
}

function paintMaintenance() {
  const m = cloud.config.maintenance;
  document.querySelector('.nx-maint')?.remove();
  if (m && m.enabled && !cloud.isAdmin) document.body.insertAdjacentHTML('beforeend', `<div class="nx-maint">${icon('wrench', 15)}<span>${esc(m.message || 'Maintenance en cours.')}</span></div>`);
}

// ================================================================== centre du compte
const TABS = [
  ['profile', 'Profil', 'user'], ['security', 'Sécurité', 'lock'], ['teams', 'Équipe', 'group'], ['plan', 'Offre et usage', 'star'],
  ['monitors', 'Supervision', 'sync'], ['notifications', 'Notifications', 'bell'], ['support', 'Support', 'chat'],
];

export async function openAccount(tab = 'profile', arg = null) {
  if (!cloud.user) { openAuthSheet(); return; }
  const sheet = openSheet('cloud-account', `
    <div class="sheet-head"><span class="sheet-icon">${icon('cloud', 22)}</span><div><h2>Mon compte NEXORA</h2><p>${esc(cloud.user.email)} · ${esc(cloud.org ? cloud.org.name : '')}</p></div></div>
    <div class="nx-acc"><nav class="nx-acc-nav">${TABS.map(([k, l, ic]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${icon(ic, 15)}<span>${l}</span>${k === 'notifications' && cloud.unread ? `<b class="nx-count">${cloud.unread}</b>` : ''}</button>`).join('')}</nav><div class="nx-acc-body" id="nxAccBody"><div class="nx-loading"><span class="spinner"></span></div></div></div>
    <div class="sheet-foot"><span class="grow"></span><button class="btn" data-sheet="close">Fermer</button></div>`, { wide: true, refresh: () => renderTab(tab, arg) });
  sheet.onclick = async (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; arg = null; for (const b of sheet.querySelectorAll('[data-tab]')) b.classList.toggle('on', b === t); await renderTab(tab); return; }
    await onAccountClick(e, (nt, na) => { tab = nt; arg = na; for (const x of sheet.querySelectorAll('[data-tab]')) x.classList.toggle('on', x.dataset.tab === nt); return renderTab(nt, na); });
  };
  sheet.onsubmit = (e) => onAccountSubmit(e, () => renderTab(tab, arg));
  sheet.onchange = (e) => onAccountChange(e, () => renderTab(tab, arg));
  await renderTab(tab, arg);
}

async function renderTab(tab, arg) {
  const body = $('#nxAccBody');
  if (!body) return;
  try {
    body.innerHTML = await TAB_RENDER[tab](arg);
  } catch (err) {
    body.innerHTML = `<p class="nx-alert">${esc(errText(err))}</p>`;
  }
}

const TAB_RENDER = {
  async profile() {
    const p = cloud.profile || {};
    return `<form class="nx-form" data-form="profile">
      <div class="nx-av-row">${avatarHtml(p, 64)}<div><label class="btn small">${icon('upload', 13)}<span>Changer la photo</span><input type="file" accept="image/*" data-avatar hidden></label><small class="nx-muted">PNG ou JPG, 5 Mo maximum.</small></div></div>
      <div class="nx-grid2">
        <label class="nx-field"><span>Nom complet</span><input class="input" name="full_name" value="${esc(p.full_name || '')}" maxlength="80"></label>
        <label class="nx-field"><span>Entreprise</span><input class="input" name="company" value="${esc(p.company || '')}" maxlength="80"></label>
        <label class="nx-field"><span>Fonction</span><input class="input" name="job_title" value="${esc(p.job_title || '')}" maxlength="80"></label>
        <label class="nx-field"><span>Fuseau horaire</span><input class="input" name="timezone" value="${esc(p.timezone || '')}" maxlength="60"></label>
      </div>
      <div class="nx-actions"><button class="btn primary">Enregistrer</button></div>
    </form>
    <form class="nx-form" data-form="email">
      <h3>Adresse e-mail</h3>
      <div class="nx-inline"><input class="input" name="email" type="email" value="${esc(cloud.user.email)}" required><button class="btn">Changer</button></div>
      <small class="nx-muted">Un lien de confirmation est envoyé à la nouvelle adresse.</small>
    </form>
    <div class="nx-kv"><span>Compte créé</span><b>${fmtDate(p.created_at)}</b><span>Rôle sur la plateforme</span><b>${esc(p.app_role === 'superadmin' ? 'Super-administrateur' : p.app_role === 'admin' ? 'Administrateur' : 'Utilisateur')}</b></div>`;
  },

  async security() {
    const { data: devices } = await supa.from('devices').select('*').order('last_seen_at', { ascending: false });
    return `<form class="nx-form" data-form="password">
      <h3>Mot de passe</h3>
      <div class="nx-grid2"><label class="nx-field"><span>Nouveau mot de passe</span><input class="input" type="password" name="password" minlength="8" required autocomplete="new-password"></label>
      <label class="nx-field"><span>Confirmation</span><input class="input" type="password" name="password2" minlength="8" required autocomplete="new-password"></label></div>
      <div class="nx-actions"><button class="btn primary">Changer le mot de passe</button></div>
    </form>
    <h3>Appareils connectés</h3>
    <div class="nx-list">${(devices || []).map((d) => `<div class="nx-li">${icon(d.platform === 'web' ? 'globe' : 'laptop', 16)}<div><b>${esc(d.platform === 'web' ? 'Navigateur' : 'Application Windows')}${d.name ? ` · ${esc(d.name)}` : ''}</b><small>Dernière activité ${ago(d.last_seen_at)}${d.app_version ? ` · v${esc(d.app_version)}` : ''}</small></div></div>`).join('') || '<p class="nx-muted">Aucun appareil.</p>'}</div>
    <div class="nx-actions"><button class="btn" data-acc-act="logout-all">${icon('lock', 13)}<span>Se déconnecter partout</span></button></div>
    <div class="nx-danger"><h3>Zone sensible</h3><p>Supprimer ton compte efface ton profil, ton espace personnel et ses contenus. Les équipes partagées sont confiées à un autre membre.</p>
      <div class="nx-inline"><input class="input" data-del-confirm placeholder="Tape SUPPRIMER pour confirmer"><button class="btn danger" data-acc-act="delete-account">Supprimer mon compte</button></div></div>`;
  },

  async teams() {
    const org = cloud.org;
    const [{ data: members }, { data: invites }, { data: mine }] = await Promise.all([
      supa.from('organization_members').select('role, created_at, user_id, profiles(id, full_name, email, avatar_url, last_seen_at)').eq('org_id', org.id).order('created_at'),
      cloud.canManage ? supa.from('invitations').select('*').eq('org_id', org.id).eq('status', 'pending').order('created_at', { ascending: false }) : { data: [] },
      supa.rpc('my_invitations'),
    ]);
    const owner = cloud.role === 'owner';
    return `${(mine || []).length ? `<div class="nx-callout">${icon('mail', 16)}<div><b>Invitations reçues</b>${mine.map((i) => `<div class="nx-li tight"><span>${esc(i.invited_by_name || 'Quelqu’un')} t’invite dans <b>${esc(i.org_name)}</b> (${ROLES[i.role]})</span><button class="btn small primary" data-accept="${esc(i.token)}">Rejoindre</button></div>`).join('')}</div></div>` : ''}
    <div class="nx-org-head">
      <div><h3>${esc(org.name)}</h3><small class="nx-muted">${org.personal ? 'Espace personnel' : 'Équipe'} · offre ${esc(planName(org.plan))} · ton rôle : ${ROLES[cloud.role]}</small></div>
      <div class="nx-actions"><button class="btn small" data-acc-act="new-team">${icon('plus', 13)}<span>Nouvelle équipe</span></button></div>
    </div>
    ${cloud.canManage && !org.personal ? `<form class="nx-form nx-inline" data-form="rename-team"><input class="input" name="name" value="${esc(org.name)}" maxlength="80"><button class="btn">Renommer</button></form>` : ''}
    <h3>Membres (${(members || []).length})</h3>
    <div class="nx-list">${(members || []).map((m) => `<div class="nx-li">${avatarHtml(m.profiles, 32)}<div><b>${esc((m.profiles && m.profiles.full_name) || '—')}${m.user_id === cloud.user.id ? ' <small class="nx-tag">toi</small>' : ''}</b><small>${esc((m.profiles && m.profiles.email) || '')} · actif ${ago(m.profiles && m.profiles.last_seen_at)}</small></div>
      ${cloud.canManage && m.user_id !== cloud.user.id ? `<select class="input small" data-member-role="${m.user_id}">${Object.entries(ROLES).filter(([k]) => owner || k !== 'owner').map(([k, l]) => `<option value="${k}" ${m.role === k ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="icon-btn small" data-member-remove="${m.user_id}" title="Retirer de l’équipe">${icon('trash', 13)}</button>` : `<span class="nx-tag">${ROLES[m.role]}</span>`}</div>`).join('')}</div>
    ${cloud.canManage ? `<h3>Inviter quelqu’un</h3>
    <form class="nx-form nx-inline" data-form="invite"><input class="input" name="email" type="email" placeholder="adresse@exemple.com" required><select class="input" name="role"><option value="editor">Éditeur</option><option value="viewer">Lecteur</option><option value="admin">Administrateur</option></select><button class="btn primary">Inviter</button></form>
    ${(invites || []).length ? `<div class="nx-list">${invites.map((i) => `<div class="nx-li">${icon('mail', 15)}<div><b>${esc(i.email)}</b><small>${ROLES[i.role]} · expire le ${fmtDate(i.expires_at)}</small></div><button class="btn small" data-copy-invite="${esc(i.token)}">Copier le lien</button><button class="icon-btn small" data-invite-revoke="${i.id}" title="Annuler l’invitation">${icon('close', 13)}</button></div>`).join('')}</div>` : ''}` : ''}
    ${!org.personal ? `<div class="nx-actions"><button class="btn" data-acc-act="leave-team">Quitter l’équipe</button>${owner ? '<button class="btn danger" data-acc-act="delete-team">Supprimer l’équipe</button>' : ''}</div>` : ''}`;
  },

  async plan() {
    const [{ data: quota }, { data: plans }] = await Promise.all([supa.rpc('org_quota', { org: cloud.orgId }), supa.from('plans').select('*').eq('active', true).order('sort')]);
    const lim = (quota && quota.limits) || {};
    const use = (quota && quota.usage) || {};
    const bar = (k, label) => {
      const max = Number(lim[k]);
      const v = Number(use[k] || 0);
      const pct = max > 0 ? Math.min(100, (v / max) * 100) : 0;
      return `<div class="nx-quota"><span>${label}</span><b>${v}${max > 0 ? ` / ${max}` : max === -1 ? ' / illimité' : ''}</b><i><em style="width:${pct}%" class="${pct > 90 ? 'hot' : ''}"></em></i></div>`;
    };
    return `<div class="nx-plan-now">${icon('star', 18)}<div><b>Offre ${esc(planName(quota.plan))}</b><small>${esc(cloud.org.name)}${cloud.org.periodEnd ? ` · jusqu’au ${fmtDate(cloud.org.periodEnd)}` : ''}</small></div></div>
      <div class="nx-quotas">${bar('projects', 'Projets')}${bar('designs', 'Documents NEX-DESIGN')}${bar('members', 'Membres')}${bar('monitors', 'Moniteurs')}${bar('storage_mb', 'Stockage (Mo)')}</div>
      <h3>Offres</h3>
      <div class="nx-plans">${(plans || []).map((p) => `<div class="nx-plan${p.id === quota.plan ? ' on' : ''}"><b>${esc(p.name)}</b><span class="nx-price">${p.id === 'enterprise' ? 'Sur devis' : money(p.price_month_cents, p.currency)}${p.price_month_cents ? '<small>/mois</small>' : ''}</span><small>${esc(p.description)}</small><ul>${(p.features || []).map((f) => `<li>${icon('check', 12)}${esc(f)}</li>`).join('')}</ul>${p.id === quota.plan ? '<span class="nx-tag">Offre actuelle</span>' : `<button class="btn small" data-plan-ask="${esc(p.id)}">Choisir</button>`}</div>`).join('')}</div>
      <p class="nx-muted small">Le changement d’offre est traité par l’équipe NEXORA : ta demande arrive au support et ton offre est activée sous 24 h.</p>`;
  },

  async monitors() {
    const { data: mons } = await supa.from('monitors').select('*').eq('org_id', cloud.orgId).order('created_at');
    const ids = (mons || []).map((m) => m.id);
    const { data: checks } = ids.length ? await supa.from('monitor_checks').select('monitor_id, ok, latency_ms, checked_at').in('monitor_id', ids).order('checked_at', { ascending: false }).limit(400) : { data: [] };
    const by = new Map();
    for (const c of checks || []) { if (!by.has(c.monitor_id)) by.set(c.monitor_id, []); if (by.get(c.monitor_id).length < 40) by.get(c.monitor_id).push(c); }
    const spark = (list = []) => `<span class="nx-spark">${list.slice().reverse().map((c) => `<i class="${c.ok ? 'ok' : 'ko'}" style="height:${Math.max(18, Math.min(100, (c.latency_ms || 0) / 20))}%" title="${fmtDateTime(c.checked_at)} · ${c.ok ? `${c.latency_ms} ms` : 'en échec'}"></i>`).join('')}</span>`;
    const uptime = (list = []) => (list.length ? `${Math.round((list.filter((c) => c.ok).length / list.length) * 1000) / 10} %` : '—');
    return `<p class="nx-muted">Les serveurs NEXORA vérifient tes sites jour et nuit, même quand ton ordinateur est éteint. Tu es prévenu dès qu’un site tombe ou revient.</p>
      ${cloud.canEdit ? `<form class="nx-form nx-inline" data-form="monitor"><input class="input" name="url" type="url" placeholder="https://monsite.com" required><input class="input" name="name" placeholder="Nom (facultatif)" maxlength="60"><select class="input" name="interval"><option value="5">Toutes les 5 min</option><option value="1">Chaque minute</option><option value="15">Toutes les 15 min</option><option value="60">Toutes les heures</option></select><button class="btn primary">Ajouter</button></form>` : ''}
      <div class="nx-list">${(mons || []).map((m) => `<div class="nx-li nx-mon"><span class="nx-dot ${m.last_status}"></span><div><b>${esc(m.name || m.url)}</b><small>${esc(m.url)} · ${m.last_status === 'up' ? `en ligne · ${m.last_latency_ms} ms` : m.last_status === 'down' ? `injoignable${m.last_error ? ` · ${esc(m.last_error)}` : ''}` : 'en attente de la première vérification'} · disponibilité ${uptime(by.get(m.id))}</small></div>${spark(by.get(m.id))}
        ${cloud.canEdit ? `<label class="tog-row mini"><input type="checkbox" data-mon-active="${m.id}" ${m.active ? 'checked' : ''}><span class="tog"></span></label><button class="icon-btn small" data-mon-del="${m.id}" title="Supprimer">${icon('trash', 13)}</button>` : ''}</div>`).join('') || '<p class="nx-muted">Aucun site surveillé pour l’instant.</p>'}</div>`;
  },

  async notifications() {
    const { data } = await supa.from('notifications').select('*').order('created_at', { ascending: false }).limit(80);
    return `<div class="nx-actions left"><button class="btn small" data-acc-act="read-all">${icon('check', 13)}<span>Tout marquer comme lu</span></button><button class="btn small" data-acc-act="clear-read">Effacer les notifications lues</button></div>
      <div class="nx-list">${(data || []).map((n) => `<div class="nx-li nx-notif${n.read_at ? '' : ' unread'}" data-notif="${n.id}">${icon(n.kind === 'monitor' ? 'sync' : n.kind === 'support' ? 'chat' : n.kind === 'comment' ? 'chat' : n.kind === 'billing' ? 'star' : 'bell', 16)}<div><b>${esc(n.title)}</b><small>${esc(n.body)}</small><small class="nx-muted">${ago(n.created_at)}</small></div></div>`).join('') || '<p class="nx-muted">Aucune notification.</p>'}</div>`;
  },

  async support(ticketId) {
    if (ticketId) return ticketView(ticketId);
    const { data } = await supa.from('support_tickets').select('*').eq('user_id', cloud.user.id).order('updated_at', { ascending: false });
    return `<form class="nx-form" data-form="ticket">
      <h3>Nouvelle demande</h3>
      <div class="nx-grid2"><label class="nx-field"><span>Sujet</span><input class="input" name="subject" required minlength="3" maxlength="200"></label>
      <label class="nx-field"><span>Catégorie</span><select class="input" name="category"><option value="question">Question</option><option value="bug">Problème / bug</option><option value="billing">Offre et facturation</option><option value="feature">Idée de fonctionnalité</option><option value="account">Mon compte</option><option value="other">Autre</option></select></label></div>
      <label class="nx-field"><span>Message</span><textarea class="input" name="body" rows="4" required maxlength="8000"></textarea></label>
      <div class="nx-actions"><button class="btn primary">Envoyer</button></div>
    </form>
    <h3>Mes demandes</h3>
    <div class="nx-list">${(data || []).map((t) => `<div class="nx-li click" data-ticket="${t.id}">${icon('chat', 15)}<div><b>${esc(t.subject)}</b><small>${ticketStatus(t.status)} · mis à jour ${ago(t.updated_at)}</small></div>${icon('chevronRight', 14)}</div>`).join('') || '<p class="nx-muted">Aucune demande.</p>'}</div>`;
  },
};

export const ticketStatus = (s) => ({
  open: '🟢 Ouverte', pending: '🟡 Réponse du support', resolved: '✅ Résolue', closed: '⚪ Fermée',
})[s] || s;

async function ticketView(id) {
  const [{ data: t }, { data: msgs }] = await Promise.all([
    supa.from('support_tickets').select('*').eq('id', id).single(),
    supa.from('ticket_messages').select('*, profiles(full_name, avatar_url, id)').eq('ticket_id', id).order('created_at'),
  ]);
  return `<button class="link-btn" data-tab-back="support">${icon('back', 13)} Mes demandes</button>
    <div class="nx-ticket-head"><h3>${esc(t.subject)}</h3><span class="nx-tag">${ticketStatus(t.status)}</span></div>
    <div class="nx-thread">${(msgs || []).map((m) => `<div class="nx-msg-b${m.author_id === cloud.user.id ? ' me' : ''}">${avatarHtml(m.profiles, 26)}<div><small>${esc((m.profiles && m.profiles.full_name) || 'Support NEXORA')} · ${fmtDateTime(m.created_at)}</small><p>${esc(m.body)}</p></div></div>`).join('')}</div>
    ${t.status !== 'closed' ? `<form class="nx-form" data-form="reply" data-ticket-id="${t.id}"><textarea class="input" name="body" rows="3" required placeholder="Ta réponse…"></textarea><div class="nx-actions"><button class="btn" type="button" data-close-ticket="${t.id}">Fermer la demande</button><button class="btn primary">Répondre</button></div></form>` : ''}`;
}

// ------------------------------------------------------------------ actions du centre du compte
async function onAccountClick(e, go) {
  const t = (s) => e.target.closest(s);
  let b;
  try {
    if ((b = t('[data-acc-act]'))) {
      const a = b.dataset.accAct;
      if (a === 'logout-all') { await signOutEverywhere(); closeSheet(); toast('Déconnecté de tous les appareils.'); if (IS_WEB) location.reload(); }
      if (a === 'delete-account') {
        const v = $('[data-del-confirm]').value.trim();
        if (v !== 'SUPPRIMER') { toast('Tape SUPPRIMER pour confirmer.', { kind: 'bad' }); return; }
        const { error } = await supa.rpc('delete_my_account');
        if (error) throw error;
        await signOut();
        closeSheet();
        toast('Ton compte a été supprimé.');
        if (IS_WEB) location.reload();
      }
      if (a === 'new-team') {
        await go('teams');
        const body = $('#nxAccBody');
        body.insertAdjacentHTML('afterbegin', '<form class="nx-form nx-inline nx-new-team" data-form="new-team"><input class="input" name="name" placeholder="Nom de la nouvelle équipe" required maxlength="80" data-autofocus><button class="btn primary">Créer</button></form>');
        setTimeout(() => { const i = body.querySelector('.nx-new-team input'); if (i) i.focus(); }, 50);
      }
      if (a === 'leave-team') {
        const { error } = await supa.rpc('leave_organization', { org: cloud.orgId });
        if (error) throw error;
        await loadAccount();
        go('teams');
      }
      if (a === 'delete-team') {
        if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.textContent = 'Confirmer la suppression'; return; }
        const { error } = await supa.from('organizations').delete().eq('id', cloud.orgId);
        if (error) throw error;
        await loadAccount();
        go('teams');
        toast('Équipe supprimée.');
      }
      if (a === 'read-all') { await supa.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null); cloud.unread = 0; cloud.emit('unread', 0); go('notifications'); }
      if (a === 'clear-read') { await supa.from('notifications').delete().not('read_at', 'is', null); go('notifications'); }
      return;
    }
    if ((b = t('[data-accept]'))) { const { error } = await supa.rpc('accept_invitation', { invite_token: b.dataset.accept }); if (error) throw error; await loadAccount(); toast('Bienvenue dans l’équipe !'); go('teams'); return; }
    if ((b = t('[data-member-remove]'))) { const { error } = await supa.from('organization_members').delete().eq('org_id', cloud.orgId).eq('user_id', b.dataset.memberRemove); if (error) throw error; go('teams'); return; }
    if ((b = t('[data-invite-revoke]'))) { await supa.from('invitations').update({ status: 'revoked' }).eq('id', b.dataset.inviteRevoke); go('teams'); return; }
    if ((b = t('[data-copy-invite]'))) { await copy(inviteLink(b.dataset.copyInvite)); toast('Lien d’invitation copié.'); return; }
    if ((b = t('[data-plan-ask]'))) {
      const plan = b.dataset.planAsk;
      const { data: tk, error } = await supa.from('support_tickets').insert({ user_id: cloud.user.id, org_id: cloud.orgId, subject: `Passage à l’offre ${planName(plan)}`, category: 'billing' }).select().single();
      if (error) throw error;
      await supa.from('ticket_messages').insert({ ticket_id: tk.id, author_id: cloud.user.id, body: `Je souhaite passer l’espace « ${cloud.org.name} » à l’offre ${planName(plan)}.` });
      toast('Demande envoyée : l’équipe NEXORA te répond rapidement.');
      go('support', tk.id);
      return;
    }
    if ((b = t('[data-mon-del]'))) { await supa.from('monitors').delete().eq('id', b.dataset.monDel); go('monitors'); return; }
    if ((b = t('[data-notif]'))) { await supa.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', b.dataset.notif).is('read_at', null); b.classList.remove('unread'); cloud.unread = Math.max(0, cloud.unread - 1); cloud.emit('unread', cloud.unread); return; }
    if ((b = t('[data-ticket]'))) { go('support', b.dataset.ticket); return; }
    if ((b = t('[data-tab-back]'))) { go(b.dataset.tabBack); return; }
    if ((b = t('[data-close-ticket]'))) { await supa.from('support_tickets').update({ status: 'closed' }).eq('id', b.dataset.closeTicket); go('support', b.dataset.closeTicket); }
  } catch (err) { toast(errText(err), { kind: 'bad' }); }
}

async function onAccountChange(e, again) {
  const t = e.target;
  try {
    if (t.matches('[data-avatar]') && t.files[0]) { await uploadAvatar(t.files[0]); toast('Photo mise à jour.'); again(); }
    if (t.matches('[data-member-role]')) { const { error } = await supa.from('organization_members').update({ role: t.value }).eq('org_id', cloud.orgId).eq('user_id', t.dataset.memberRole); if (error) throw error; toast('Rôle modifié.'); }
    if (t.matches('[data-mon-active]')) await supa.from('monitors').update({ active: t.checked }).eq('id', t.dataset.monActive);
  } catch (err) { toast(errText(err), { kind: 'bad' }); again(); }
}

async function onAccountSubmit(e, again) {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const v = Object.fromEntries(new FormData(f).entries());
  const btn = f.querySelector('button:not([type=button])');
  if (btn) btn.disabled = true;
  try {
    switch (f.dataset.form) {
      case 'profile': await updateProfile({ full_name: v.full_name.trim(), company: v.company.trim() || null, job_title: v.job_title.trim() || null, timezone: v.timezone.trim() || 'Africa/Porto-Novo' }); toast('Profil enregistré.'); break;
      case 'email': if (v.email.trim() !== cloud.user.email) { await updateEmail(v.email.trim()); toast('Confirme le changement grâce au lien envoyé par e-mail.'); } break;
      case 'password': if (v.password !== v.password2) throw new Error('Les deux mots de passe ne correspondent pas.'); await updatePassword(v.password); toast('Mot de passe modifié.'); f.reset(); break;
      case 'new-team': {
        const { data, error } = await supa.from('organizations').insert({ name: v.name.trim() }).select('id').single();
        if (error) throw error;
        await loadAccount();
        setOrg(data.id);
        toast(`Équipe « ${v.name.trim()} » créée.`);
        again();
        break;
      }
      case 'rename-team': { const { error } = await supa.from('organizations').update({ name: v.name.trim() }).eq('id', cloud.orgId); if (error) throw error; await loadAccount(); toast('Équipe renommée.'); again(); break; }
      case 'invite': {
        const email = v.email.trim().toLowerCase();
        const { data, error } = await supa.from('invitations').insert({ org_id: cloud.orgId, email, role: v.role, invited_by: cloud.user.id }).select('token').single();
        if (error) throw error;
        let sent = false;
        try { const r = await callFn('org-invite', { token: data.token, redirect: inviteLink(data.token) }); sent = Boolean(r && r.sent); } catch { /* e-mail facultatif */ }
        await copy(inviteLink(data.token));
        toast(sent ? `Invitation envoyée à ${email} (lien aussi copié).` : `Invitation créée : le lien est copié, envoie-le à ${email}.`);
        again();
        break;
      }
      case 'monitor': {
        const { error } = await supa.from('monitors').insert({ org_id: cloud.orgId, url: v.url.trim(), name: v.name.trim(), interval_minutes: Number(v.interval) || 5, created_by: cloud.user.id });
        if (error) throw error;
        toast('Site ajouté : première vérification dans la minute.');
        again();
        break;
      }
      case 'ticket': {
        const { data: tk, error } = await supa.from('support_tickets').insert({ user_id: cloud.user.id, org_id: cloud.orgId, subject: v.subject.trim(), category: v.category }).select().single();
        if (error) throw error;
        const r = await supa.from('ticket_messages').insert({ ticket_id: tk.id, author_id: cloud.user.id, body: v.body.trim() });
        if (r.error) throw r.error;
        toast('Demande envoyée au support.');
        again();
        break;
      }
      case 'reply': {
        const r = await supa.from('ticket_messages').insert({ ticket_id: f.dataset.ticketId, author_id: cloud.user.id, body: v.body.trim() });
        if (r.error) throw r.error;
        again();
        break;
      }
      default: break;
    }
  } catch (err) { toast(errText(err), { kind: 'bad' }); } finally { if (btn) btn.disabled = false; }
}

export function inviteLink(token) {
  const base = IS_WEB ? `${location.origin}${location.pathname}` : (cloud.config.web_url || '');
  return base ? `${base}#/invite/${token}` : token;
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); } catch { const { api } = await import('../core/api.js'); await api.invoke('clipboard:write', text).catch(() => {}); }
}
