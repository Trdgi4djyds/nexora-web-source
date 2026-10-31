/* NEXORA › tableau de bord d'administration de la plateforme (rôles admin / superadmin).
 * Vue d'ensemble, utilisateurs, équipes et offres, contenus, supervision, audits, support, annonces,
 * diffusion, fonctionnalités, configuration et journal d'audit. Tout passe par les règles RLS et les RPC
 * réservées aux administrateurs ; les actions sur les comptes Auth passent par la fonction admin-users. */
import { supa, errText, callFn } from './supa.js';
import { cloud, avatarHtml } from './session.js';
import {
  ago, fmtDate, fmtDateTime, money, ticketStatus,
} from './ui.js';
import { esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast } from '../core/ui.js';

const SECTIONS = [
  ['overview', 'Vue d’ensemble', 'grid'], ['users', 'Utilisateurs', 'user'], ['orgs', 'Équipes et offres', 'group'], ['content', 'Contenus', 'layers'],
  ['monitors', 'Supervision', 'sync'], ['scans', 'Audits de sécurité', 'shield'], ['support', 'Support', 'chat'], ['announce', 'Annonces', 'bell'],
  ['plans', 'Offres', 'star'], ['flags', 'Fonctionnalités', 'wand'], ['config', 'Configuration', 'wrench'], ['audit', 'Journal d’audit', 'audit'],
];
let root = null;
let section = 'overview';
let arg = null;

export function openAdmin(sec = 'overview') {
  if (!cloud.isAdmin) { toast('Réservé aux administrateurs.', { kind: 'bad' }); return; }
  root?.remove();
  root = document.createElement('div');
  root.className = 'nxa';
  root.innerHTML = `<aside class="nxa-nav"><div class="nxa-brand"><img src="logo.png" alt=""><div><b>NEXORA</b><small>Administration</small></div></div>
    ${SECTIONS.map(([k, l, ic]) => `<button data-sec="${k}">${icon(ic, 15)}<span>${l}</span></button>`).join('')}
    <span class="grow"></span><button data-sec="close">${icon('close', 15)}<span>Fermer</span></button></aside>
    <main class="nxa-main"><header class="nxa-head"><h1 id="nxaTitle"></h1><span class="grow"></span><button class="btn small" data-a="reload">${icon('refreshCw', 13)}<span>Actualiser</span></button></header><div class="nxa-body" id="nxaBody"></div></main>`;
  document.body.append(root);
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('submit', onSubmit);
  document.addEventListener('keydown', esc_, true);
  go(sec);
}

function esc_(e) { if (e.key === 'Escape' && root && !document.querySelector('#popover:not([hidden])')) close(); }
function close() { root?.remove(); root = null; document.removeEventListener('keydown', esc_, true); if (window.__NEXORA_WEB__ && location.hash.startsWith('#/admin')) history.replaceState(null, '', '#/'); }

async function go(sec, a = null) {
  section = sec; arg = a;
  for (const b of root.querySelectorAll('[data-sec]')) b.classList.toggle('on', b.dataset.sec === sec);
  root.querySelector('#nxaTitle').textContent = SECTIONS.find((s) => s[0] === sec)[1];
  const body = root.querySelector('#nxaBody');
  body.innerHTML = '<div class="nx-loading"><span class="spinner"></span></div>';
  try { body.innerHTML = await R[sec](a); } catch (err) { body.innerHTML = `<p class="nx-alert">${esc(errText(err))}</p>`; }
}

const kpi = (label, v, sub = '', tone = '') => `<div class="nxa-kpi ${tone}"><small>${label}</small><b>${v}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
const table = (cols, rows) => `<div class="nxa-table"><table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${cols.length}" class="nx-muted">Aucune donnée.</td></tr>`}</tbody></table></div>`;
const search = (v = '') => `<form class="nxa-search" data-f="search"><input class="input" name="q" value="${esc(v)}" placeholder="Rechercher…"><button class="btn small">Rechercher</button></form>`;

function chart(series, keys) {
  const W = 760; const H = 200; const P = 28;
  const max = Math.max(1, ...series.flatMap((d) => keys.map(([k]) => Number(d[k]) || 0)));
  const x = (i) => P + (i * (W - P * 2)) / Math.max(1, series.length - 1);
  const y = (v) => H - P - ((H - P * 2) * v) / max;
  const lines = keys.map(([k, , c]) => `<polyline fill="none" stroke="${c}" stroke-width="2.4" stroke-linejoin="round" points="${series.map((d, i) => `${x(i)},${y(Number(d[k]) || 0)}`).join(' ')}"/>`).join('');
  const labels = series.map((d, i) => (i % Math.ceil(series.length / 7) === 0 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${new Date(d.day).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</text>` : '')).join('');
  return `<div class="nxa-chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="${P}" x2="${W - P}" y1="${H - P}" y2="${H - P}" class="ax"/>${lines}${labels}<text x="4" y="${P}" class="mx">${max}</text></svg>
    <div class="nxa-legend">${keys.map(([, l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div></div>`;
}

const R = {
  async overview() {
    const [{ data: s, error }, { data: ts }] = await Promise.all([supa.rpc('admin_stats'), supa.rpc('admin_timeseries', { days: 30 })]);
    if (error) throw error;
    const plans = Object.entries(s.plans || {}).map(([k, v]) => `<span class="nx-tag">${esc(k)} : ${v}</span>`).join(' ');
    return `<div class="nxa-kpis">
      ${kpi('Utilisateurs', s.users, `+${s.users_new_30d} sur 30 jours`)}${kpi('Actifs (7 j)', s.users_active_7d)}${kpi('Équipes', s.teams, `${s.organizations} espaces au total`)}
      ${kpi('Revenu mensuel', money(s.mrr_cents) === 'Gratuit' ? '0 €' : money(s.mrr_cents), `${s.paid_orgs} espace(s) payant(s)`, 'good')}
      ${kpi('Projets', s.projects)}${kpi('Designs', s.designs, `${s.studio_items} créations Studio`)}${kpi('Stockage', `${s.storage_mb} Mo`)}
      ${kpi('Tickets ouverts', s.tickets_open, '', s.tickets_open ? 'warn' : '')}${kpi('Sites en panne', s.monitors_down, `${s.monitors} surveillés`, s.monitors_down ? 'bad' : '')}${kpi('Comptes suspendus', s.users_suspended)}
    </div>
    <h3>Activité des 30 derniers jours</h3>${chart(ts || [], [['signups', 'Inscriptions', '#6a4cff'], ['projects', 'Projets', '#06b6d4'], ['designs', 'Designs', '#d946ef'], ['tickets', 'Tickets', '#f59e0b']])}
    <div class="nxa-two"><div><h3>Offres</h3><p>${plans || '—'}</p></div><div><h3>Appareils (30 j)</h3><p>${Object.entries(s.devices || {}).map(([k, v]) => `<span class="nx-tag">${k === 'web' ? 'Web' : 'Windows'} : ${v}</span>`).join(' ') || '—'}</p></div></div>`;
  },

  async users(q = '') {
    const { data, error } = await supa.rpc('admin_users', { search: q || '', page: 0, page_size: 100 });
    if (error) throw error;
    let auth = {};
    try { auth = (await callFn('admin-users', { action: 'auth-info', ids: data.map((u) => u.id) })).users || {}; } catch { /* fonction indisponible */ }
    return `${search(q)}<div class="nxa-toolbar"><form class="nxa-inline" data-f="create-user"><input class="input" name="name" placeholder="Nom"><input class="input" name="email" type="email" placeholder="E-mail" required><input class="input" name="password" type="password" placeholder="Mot de passe (8+)" minlength="8" required><button class="btn small primary">Créer un compte</button></form></div>
      ${table(['Utilisateur', 'Rôle', 'Statut', 'Inscrit', 'Dernière activité', 'Contenus', ''], data.map((u) => {
    const a = auth[u.id] || {};
    return `<tr><td><div class="nxa-user">${avatarHtml(u, 28)}<div><b>${esc(u.full_name || '—')}</b><small>${esc(u.email || '')}${a.confirmed_at === null ? ' · e-mail non confirmé' : ''}</small></div></div></td>
      <td><select class="input small" data-role="${u.id}" ${u.id === cloud.user.id ? 'disabled' : ''}>${['user', 'admin', 'superadmin'].map((r) => `<option value="${r}" ${u.app_role === r ? 'selected' : ''} ${r === 'superadmin' && !cloud.isSuper ? 'disabled' : ''}>${r === 'user' ? 'Utilisateur' : r === 'admin' ? 'Admin' : 'Super-admin'}</option>`).join('')}</select></td>
      <td><span class="nx-tag ${u.status === 'suspended' ? 'bad' : 'ok'}">${u.status === 'suspended' ? 'Suspendu' : 'Actif'}</span></td>
      <td>${fmtDate(u.created_at)}</td><td>${ago(u.last_seen_at || a.last_sign_in_at)}</td><td>${u.projects} proj. · ${u.designs} designs · ${u.orgs} équipes</td>
      <td class="nxa-act">${u.id === cloud.user.id ? '' : `<button class="btn small" data-u="${u.status === 'suspended' ? 'unban' : 'ban'}" data-id="${u.id}">${u.status === 'suspended' ? 'Réactiver' : 'Suspendre'}</button><button class="btn small" data-u="reset" data-id="${u.id}">Mot de passe</button>${cloud.isSuper ? `<button class="icon-btn small" data-u="delete" data-id="${u.id}" title="Supprimer définitivement">${icon('trash', 13)}</button>` : ''}`}</td></tr>`;
  }))}<p class="nx-muted small">${data[0] ? data[0].total : 0} utilisateur(s).</p>`;
  },

  async orgs(q = '') {
    const [{ data, error }, { data: plans }] = await Promise.all([supa.rpc('admin_orgs', { search: q || '' }), supa.from('plans').select('id, name').order('sort')]);
    if (error) throw error;
    return `${search(q)}${table(['Espace', 'Propriétaire', 'Offre', 'Statut', 'Membres', 'Contenus', 'Créé'], data.map((o) => `<tr><td><b>${esc(o.name)}</b>${o.personal ? ' <small class="nx-muted">personnel</small>' : ''}</td><td>${esc(o.owner_email || '—')}</td>
      <td><select class="input small" data-plan="${o.id}">${plans.map((p) => `<option value="${p.id}" ${o.plan_id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></td>
      <td><select class="input small" data-substatus="${o.id}" data-cur-plan="${o.plan_id}">${['active', 'trialing', 'past_due', 'canceled'].map((s) => `<option ${o.sub_status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td>${o.members}</td><td>${o.projects} proj. · ${o.designs} designs</td><td>${fmtDate(o.created_at)}</td></tr>`))}`;
  },

  async content() {
    const [{ data: projects }, { data: designs }, { data: studio }] = await Promise.all([
      supa.from('projects').select('id, name, url, created_at, organizations(name)').order('created_at', { ascending: false }).limit(100),
      supa.from('design_documents').select('id, name, pages_count, thumb, updated_at, deleted_at, organizations(name)').order('updated_at', { ascending: false }).limit(100),
      supa.from('studio_items').select('id, name, kind, updated_at, organizations(name)').order('updated_at', { ascending: false }).limit(50),
    ]);
    return `<h3>Projets</h3>${table(['Nom', 'Adresse', 'Espace', 'Créé', ''], (projects || []).map((p) => `<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.url || '—')}</td><td>${esc(p.organizations && p.organizations.name)}</td><td>${fmtDate(p.created_at)}</td><td><button class="icon-btn small" data-del="projects" data-id="${p.id}">${icon('trash', 13)}</button></td></tr>`))}
      <h3>Documents NEX-DESIGN</h3>${table(['', 'Nom', 'Pages', 'Espace', 'Modifié', ''], (designs || []).map((d) => `<tr><td>${d.thumb ? `<img class="nxa-th" src="${d.thumb}" alt="">` : ''}</td><td><b>${esc(d.name)}</b>${d.deleted_at ? ' <small class="nx-tag bad">supprimé</small>' : ''}</td><td>${d.pages_count}</td><td>${esc(d.organizations && d.organizations.name)}</td><td>${ago(d.updated_at)}</td><td><button class="icon-btn small" data-del="design_documents" data-id="${d.id}">${icon('trash', 13)}</button></td></tr>`))}
      <h3>Créations du Studio</h3>${table(['Nom', 'Type', 'Espace', 'Modifié'], (studio || []).map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.kind)}</td><td>${esc(s.organizations && s.organizations.name)}</td><td>${ago(s.updated_at)}</td></tr>`))}`;
  },

  async monitors() {
    const { data } = await supa.from('monitors').select('*, organizations(name)').order('last_status');
    return table(['', 'Site', 'Espace', 'Fréquence', 'Dernière vérification', 'Latence', 'Actif'], (data || []).map((m) => `<tr><td><span class="nx-dot ${m.last_status}"></span></td><td><b>${esc(m.name || m.url)}</b><br><small>${esc(m.url)}</small>${m.last_error ? `<br><small class="bad">${esc(m.last_error)}</small>` : ''}</td><td>${esc(m.organizations && m.organizations.name)}</td><td>${m.interval_minutes} min</td><td>${ago(m.last_checked_at)}</td><td>${m.last_latency_ms ?? '—'} ms</td><td><input type="checkbox" data-mon="${m.id}" ${m.active ? 'checked' : ''}></td></tr>`));
  },

  async scans() {
    const { data } = await supa.from('security_scans').select('id, url, score, grade, created_at, findings, organizations(name)').order('created_at', { ascending: false }).limit(100);
    return table(['Site', 'Note', 'Constats', 'Espace', 'Date'], (data || []).map((s) => `<tr><td>${esc(s.url)}</td><td><b class="nxa-grade g${esc(s.grade)}">${esc(s.grade || '?')}</b> ${s.score}/100</td><td>${(s.findings || []).filter((f) => ['critical', 'high'].includes(f.sev)).length} graves · ${(s.findings || []).length} au total</td><td>${esc(s.organizations && s.organizations.name)}</td><td>${fmtDateTime(s.created_at)}</td></tr>`));
  },

  async support(id) {
    if (id) {
      const [{ data: t }, { data: msgs }] = await Promise.all([
        supa.from('support_tickets').select('*, profiles!support_tickets_user_id_fkey(full_name, email)').eq('id', id).single(),
        supa.from('ticket_messages').select('*, profiles(full_name, avatar_url, id)').eq('ticket_id', id).order('created_at'),
      ]);
      return `<button class="link-btn" data-sec="support">${icon('back', 13)} Tous les tickets</button>
        <div class="nxa-ticket"><h2>${esc(t.subject)}</h2><p class="nx-muted">${esc(t.profiles && t.profiles.full_name)} · ${esc(t.profiles && t.profiles.email)} · ${esc(t.category)} · ouvert ${ago(t.created_at)}</p>
        <div class="nxa-inline"><select class="input small" data-tstatus="${t.id}">${['open', 'pending', 'resolved', 'closed'].map((s) => `<option value="${s}" ${t.status === s ? 'selected' : ''}>${ticketStatus(s)}</option>`).join('')}</select>
        <select class="input small" data-tprio="${t.id}">${['low', 'normal', 'high', 'urgent'].map((s) => `<option ${t.priority === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <button class="btn small" data-assign="${t.id}">${t.assigned_to === cloud.user.id ? 'Assigné à moi' : 'M’assigner'}</button></div>
        <div class="nx-thread">${(msgs || []).map((m) => `<div class="nx-msg-b${m.internal ? ' internal' : ''}${m.author_id === t.user_id ? '' : ' me'}">${avatarHtml(m.profiles, 26)}<div><small>${esc((m.profiles && m.profiles.full_name) || '—')} · ${fmtDateTime(m.created_at)}${m.internal ? ' · note interne' : ''}</small><p>${esc(m.body)}</p></div></div>`).join('')}</div>
        <form class="nx-form" data-f="reply" data-id="${t.id}"><textarea class="input" name="body" rows="3" required placeholder="Réponse au client…"></textarea><div class="nx-actions"><label class="check-row small"><input type="checkbox" name="internal"><span class="box"></span><span>Note interne (invisible pour le client)</span></label><button class="btn primary">Envoyer</button></div></form></div>`;
    }
    const { data } = await supa.from('support_tickets').select('*, profiles!support_tickets_user_id_fkey(full_name, email)').order('updated_at', { ascending: false }).limit(200);
    return table(['Sujet', 'Client', 'Catégorie', 'Priorité', 'Statut', 'Mis à jour'], (data || []).map((t) => `<tr class="click" data-ticket="${t.id}"><td><b>${esc(t.subject)}</b></td><td>${esc(t.profiles && (t.profiles.full_name || t.profiles.email))}</td><td>${esc(t.category)}</td><td><span class="nx-tag ${t.priority === 'urgent' || t.priority === 'high' ? 'bad' : ''}">${esc(t.priority)}</span></td><td>${ticketStatus(t.status)}</td><td>${ago(t.updated_at)}</td></tr>`));
  },

  async announce() {
    const { data } = await supa.from('announcements').select('*').order('created_at', { ascending: false });
    return `<form class="nx-form" data-f="announce"><div class="nx-grid2"><label class="nx-field"><span>Titre</span><input class="input" name="title" required maxlength="120"></label>
      <label class="nx-field"><span>Niveau</span><select class="input" name="level"><option value="info">Information</option><option value="success">Nouveauté</option><option value="warning">Attention</option><option value="critical">Critique</option></select></label></div>
      <label class="nx-field"><span>Message</span><textarea class="input" name="body" rows="2" maxlength="600"></textarea></label>
      <div class="nx-grid2"><label class="nx-field"><span>Public</span><select class="input" name="audience"><option value="all">Tout le monde</option><option value="free">Offre Gratuite</option><option value="pro">Offre Pro</option><option value="team">Offre Équipe</option><option value="admins">Administrateurs</option></select></label>
      <label class="nx-field"><span>Fin (facultatif)</span><input class="input" type="datetime-local" name="ends_at"></label></div>
      <div class="nx-actions"><button class="btn primary">Publier l’annonce</button></div></form>
      <h3>Message direct dans le centre de notifications</h3>
      <form class="nx-form nxa-inline" data-f="broadcast"><input class="input" name="title" placeholder="Titre" required><input class="input" name="body" placeholder="Message" required><select class="input" name="audience"><option value="all">Tout le monde</option><option value="free">Gratuit</option><option value="pro">Pro</option><option value="team">Équipe</option><option value="admins">Admins</option></select><button class="btn">Envoyer</button></form>
      <h3>Annonces</h3>${table(['Titre', 'Niveau', 'Public', 'Période', 'Active', ''], (data || []).map((a) => `<tr><td><b>${esc(a.title)}</b><br><small>${esc(a.body)}</small></td><td>${esc(a.level)}</td><td>${esc(a.audience)}</td><td>${fmtDate(a.starts_at)} → ${a.ends_at ? fmtDate(a.ends_at) : '∞'}</td><td><input type="checkbox" data-ann="${a.id}" ${a.active ? 'checked' : ''}></td><td><button class="icon-btn small" data-del="announcements" data-id="${a.id}">${icon('trash', 13)}</button></td></tr>`))}`;
  },

  async plans() {
    const { data } = await supa.from('plans').select('*').order('sort');
    return `<p class="nx-muted">Prix en centimes. Limites : -1 = illimité.</p>${(data || []).map((p) => `<form class="nx-form nxa-plan" data-f="plan" data-id="${p.id}">
      <div class="nx-grid2"><label class="nx-field"><span>Nom (${esc(p.id)})</span><input class="input" name="name" value="${esc(p.name)}"></label><label class="nx-field"><span>Description</span><input class="input" name="description" value="${esc(p.description)}"></label>
      <label class="nx-field"><span>Prix mensuel</span><input class="input" type="number" name="price_month_cents" value="${p.price_month_cents}"></label><label class="nx-field"><span>Prix annuel</span><input class="input" type="number" name="price_year_cents" value="${p.price_year_cents}"></label></div>
      <label class="nx-field"><span>Limites (JSON)</span><textarea class="input code" name="limits" rows="2">${esc(JSON.stringify(p.limits))}</textarea></label>
      <label class="nx-field"><span>Avantages (JSON)</span><textarea class="input code" name="features" rows="2">${esc(JSON.stringify(p.features))}</textarea></label>
      <div class="nx-actions"><label class="check-row small"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}><span class="box"></span><span>Proposée</span></label><button class="btn primary">Enregistrer</button></div></form>`).join('')}`;
  },

  async flags() {
    const { data } = await supa.from('feature_flags').select('*').order('key');
    return table(['Fonctionnalité', 'Description', 'Active', 'Déploiement'], (data || []).map((f) => `<tr><td><code>${esc(f.key)}</code></td><td>${esc(f.description)}</td><td><input type="checkbox" data-flag="${esc(f.key)}" ${f.enabled ? 'checked' : ''}></td><td><input class="input small" type="number" min="0" max="100" data-rollout="${esc(f.key)}" value="${f.rollout}" style="width:70px"> %</td></tr>`));
  },

  async config() {
    const { data } = await supa.from('app_config').select('*').order('key');
    if (!cloud.isSuper) return '<p class="nx-alert">Réservé aux super-administrateurs.</p>';
    return `${(data || []).map((c) => `<form class="nx-form" data-f="config" data-key="${esc(c.key)}"><label class="nx-field"><span><code>${esc(c.key)}</code> — ${esc(c.description)}</span><textarea class="input code" name="value" rows="${String(JSON.stringify(c.value)).length > 60 ? 3 : 1}">${esc(JSON.stringify(c.value))}</textarea></label><div class="nx-actions"><small class="nx-muted">Modifié ${ago(c.updated_at)}</small><button class="btn small primary">Enregistrer</button></div></form>`).join('')}
      <form class="nx-form nxa-inline" data-f="config-new"><input class="input" name="key" placeholder="nouvelle_cle" pattern="[a-z0-9_]+" required><input class="input" name="value" placeholder='"valeur" (JSON)' required><button class="btn">Ajouter</button></form>`;
  },

  async audit() {
    const { data } = await supa.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(300);
    const ids = [...new Set((data || []).map((l) => l.actor_id).filter(Boolean))];
    const { data: people } = ids.length ? await supa.from('profiles').select('id, full_name, email').in('id', ids) : { data: [] };
    const who = new Map((people || []).map((p) => [p.id, p.full_name || p.email]));
    return table(['Date', 'Auteur', 'Action', 'Objet', 'Détails'], (data || []).map((l) => `<tr><td>${fmtDateTime(l.created_at)}</td><td>${esc(l.actor_id ? who.get(l.actor_id) || l.actor_id.slice(0, 8) : 'système')}</td><td><span class="nx-tag">${esc(l.action)}</span></td><td>${esc(l.entity)}</td><td><small>${esc(Object.entries(l.meta || {}).map(([k, v]) => `${k}: ${v}`).join(' · '))}</small></td></tr>`));
  },
};

async function onClick(e) {
  const t = (s) => e.target.closest(s);
  let b;
  try {
    if ((b = t('[data-sec]'))) { if (b.dataset.sec === 'close') close(); else go(b.dataset.sec); return; }
    if ((b = t('[data-a="reload"]'))) { go(section, arg); return; }
    if ((b = t('[data-ticket]'))) { go('support', b.dataset.ticket); return; }
    if ((b = t('[data-u]'))) {
      const a = b.dataset.u;
      if (a === 'delete' && !b.dataset.ok) { b.dataset.ok = '1'; b.classList.add('danger'); toast('Clique encore pour supprimer définitivement ce compte.'); return; }
      const redirect = window.__NEXORA_WEB__ ? `${location.origin}${location.pathname}#/reset` : undefined;
      await callFn('admin-users', { action: a, user_id: b.dataset.id, redirect });
      toast({ ban: 'Compte suspendu.', unban: 'Compte réactivé.', reset: 'E-mail de réinitialisation envoyé.', delete: 'Compte supprimé.' }[a]);
      go(section, arg);
      return;
    }
    if ((b = t('[data-del]'))) {
      if (!b.dataset.ok) { b.dataset.ok = '1'; b.classList.add('danger'); return; }
      const { error } = await supa.from(b.dataset.del).delete().eq('id', b.dataset.id);
      if (error) throw error;
      go(section, arg);
      return;
    }
    if ((b = t('[data-assign]'))) { const { error } = await supa.from('support_tickets').update({ assigned_to: cloud.user.id }).eq('id', b.dataset.assign); if (error) throw error; go('support', b.dataset.assign); }
  } catch (err) { toast(errText(err), { kind: 'bad' }); }
}

async function onChange(e) {
  const el = e.target;
  try {
    let r = null;
    if (el.dataset.role) r = await supa.rpc('admin_set_role', { target: el.dataset.role, new_role: el.value });
    else if (el.dataset.plan) r = await supa.rpc('admin_set_plan', { org: el.dataset.plan, plan: el.value, sub_status: 'active' });
    else if (el.dataset.substatus) r = await supa.rpc('admin_set_plan', { org: el.dataset.substatus, plan: el.dataset.curPlan, sub_status: el.value });
    else if (el.dataset.mon) r = await supa.from('monitors').update({ active: el.checked }).eq('id', el.dataset.mon);
    else if (el.dataset.ann) r = await supa.from('announcements').update({ active: el.checked }).eq('id', el.dataset.ann);
    else if (el.dataset.flag) r = await supa.from('feature_flags').update({ enabled: el.checked, updated_by: cloud.user.id }).eq('key', el.dataset.flag);
    else if (el.dataset.rollout) r = await supa.from('feature_flags').update({ rollout: Number(el.value) }).eq('key', el.dataset.rollout);
    else if (el.dataset.tstatus) r = await supa.from('support_tickets').update({ status: el.value }).eq('id', el.dataset.tstatus);
    else if (el.dataset.tprio) r = await supa.from('support_tickets').update({ priority: el.value }).eq('id', el.dataset.tprio);
    else return;
    if (r && r.error) throw r.error;
    toast('Enregistré.', { ms: 1500 });
  } catch (err) { toast(errText(err), { kind: 'bad' }); go(section, arg); }
}

async function onSubmit(e) {
  const f = e.target.closest('form[data-f]');
  if (!f) return;
  e.preventDefault();
  const v = Object.fromEntries(new FormData(f).entries());
  try {
    let r = null;
    switch (f.dataset.f) {
      case 'search': go(section, v.q.trim()); return;
      case 'create-user': await callFn('admin-users', { action: 'create', email: v.email.trim(), password: v.password, full_name: v.name.trim() }); toast('Compte créé (e-mail déjà confirmé).'); go('users'); return;
      case 'reply': r = await supa.from('ticket_messages').insert({ ticket_id: f.dataset.id, author_id: cloud.user.id, body: v.body.trim(), internal: Boolean(v.internal) }); break;
      case 'announce': r = await supa.from('announcements').insert({ title: v.title.trim(), body: v.body.trim(), level: v.level, audience: v.audience, ends_at: v.ends_at ? new Date(v.ends_at).toISOString() : null, created_by: cloud.user.id }); break;
      case 'broadcast': { const x = await supa.rpc('admin_broadcast', { title: v.title.trim(), body: v.body.trim(), audience: v.audience }); if (x.error) throw x.error; toast(`Message envoyé à ${x.data} personne(s).`); f.reset(); return; }
      case 'plan': r = await supa.from('plans').update({ name: v.name, description: v.description, price_month_cents: Number(v.price_month_cents) || 0, price_year_cents: Number(v.price_year_cents) || 0, limits: JSON.parse(v.limits), features: JSON.parse(v.features), active: Boolean(v.active) }).eq('id', f.dataset.id); break;
      case 'config': r = await supa.from('app_config').update({ value: JSON.parse(v.value), updated_by: cloud.user.id }).eq('key', f.dataset.key); break;
      case 'config-new': r = await supa.from('app_config').insert({ key: v.key.trim(), value: JSON.parse(v.value), updated_by: cloud.user.id }); break;
      default: return;
    }
    if (r && r.error) throw r.error;
    toast('Enregistré.', { ms: 1500 });
    go(section, arg);
  } catch (err) { toast(err instanceof SyntaxError ? 'JSON invalide.' : errText(err), { kind: 'bad' }); }
}
