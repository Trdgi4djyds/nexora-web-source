/* NEXORA Cloud : session de l'utilisateur, profil, équipes, offre, drapeaux de fonctionnalités, configuration,
 * notifications et annonces en temps réel. Partagé par la version web et l'application Windows. */
import { supa, errText } from './supa.js';
import { IS_WEB, APP_VERSION } from './config.js';

const listeners = new Map();
export const cloud = {
  session: null,
  user: null,
  profile: null,
  orgs: [],
  orgId: null,
  role: null,
  plan: 'free',
  flags: {},
  config: {},
  unread: 0,
  ready: false,
  on(ev, fn) { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev).add(fn); return () => listeners.get(ev).delete(fn); },
  emit(ev, data) { for (const fn of listeners.get(ev) || []) { try { fn(data); } catch (e) { console.warn('[cloud]', ev, e); } } },
  get org() { return this.orgs.find((o) => o.id === this.orgId) || null; },
  get isAdmin() { return Boolean(this.profile && ['admin', 'superadmin'].includes(this.profile.app_role) && this.profile.status === 'active'); },
  get isSuper() { return Boolean(this.profile && this.profile.app_role === 'superadmin'); },
  get canEdit() { return ['owner', 'admin', 'editor'].includes(this.role); },
  get canManage() { return ['owner', 'admin'].includes(this.role); },
  flag(k) { return this.flags[k] !== false; },
};

let channels = [];
let heartbeat = 0;

// ------------------------------------------------------------------ démarrage
export async function initCloud() {
  await loadPublic();
  const { data } = await supa.auth.getSession();
  await setSession(data.session);
  supa.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') cloud.emit('recovery');
    // Différé : on ne rappelle pas Supabase depuis son propre gestionnaire d'événements.
    setTimeout(() => {
      if (event === 'TOKEN_REFRESHED') { cloud.session = session; return; }
      if ((session && session.user && session.user.id) !== (cloud.user && cloud.user.id)) setSession(session);
    }, 0);
  });
  cloud.ready = true;
  cloud.emit('ready');
  return cloud;
}

async function loadPublic() {
  const [flags, config] = await Promise.all([
    supa.from('feature_flags').select('key, enabled').then((r) => r.data || []).catch(() => []),
    supa.from('app_config').select('key, value').then((r) => r.data || []).catch(() => []),
  ]);
  cloud.flags = Object.fromEntries(flags.map((f) => [f.key, f.enabled]));
  cloud.config = Object.fromEntries(config.map((c) => [c.key, c.value]));
}

async function setSession(session) {
  cloud.session = session;
  cloud.user = session ? session.user : null;
  for (const ch of channels) supa.removeChannel(ch);
  channels = [];
  clearInterval(heartbeat);
  if (!cloud.user) {
    Object.assign(cloud, { profile: null, orgs: [], orgId: null, role: null, unread: 0 });
    cloud.emit('auth', null);
    return;
  }
  await loadAccount();
  if (cloud.profile && cloud.profile.status === 'suspended') {
    cloud.emit('suspended');
  }
  subscribe();
  touch();
  heartbeat = setInterval(touch, 120000);
  cloud.emit('auth', cloud.user);
}

export async function loadAccount() {
  const uid = cloud.user.id;
  const [{ data: profile }, { data: members }] = await Promise.all([
    supa.from('profiles').select('*').eq('id', uid).maybeSingle(),
    supa.from('organization_members').select('role, org_id, organizations(id, name, slug, personal, logo_url, owner_id, subscriptions(plan_id, status, current_period_end))').eq('user_id', uid),
  ]);
  cloud.profile = profile;
  cloud.orgs = (members || []).filter((m) => m.organizations).map((m) => {
    const o = m.organizations;
    const sub = Array.isArray(o.subscriptions) ? o.subscriptions[0] : o.subscriptions;
    return { ...o, role: m.role, plan: (sub && sub.plan_id) || 'free', subStatus: sub && sub.status, periodEnd: sub && sub.current_period_end };
  }).sort((a, b) => (b.personal - a.personal) || a.name.localeCompare(b.name));
  const saved = localStorage.getItem(`nexora-org-${uid}`);
  setOrg(cloud.orgs.some((o) => o.id === saved) ? saved : (cloud.orgs[0] && cloud.orgs[0].id), { silent: true });
  await countUnread();
  cloud.emit('account');
}

export function setOrg(id, { silent = false } = {}) {
  cloud.orgId = id || null;
  const o = cloud.org;
  cloud.role = o ? o.role : null;
  cloud.plan = o ? o.plan : 'free';
  if (cloud.user && id) localStorage.setItem(`nexora-org-${cloud.user.id}`, id);
  if (!silent) cloud.emit('org', o);
}

async function countUnread() {
  const { count } = await supa.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  cloud.unread = count || 0;
  cloud.emit('unread', cloud.unread);
}

function touch() {
  const name = IS_WEB ? (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || 'Navigateur' : 'Application Windows';
  supa.rpc('touch_presence', { platform: IS_WEB ? 'web' : 'windows', device_name: String(name).slice(0, 60), app_version: APP_VERSION }).then(() => {}, () => {});
}

// ------------------------------------------------------------------ temps réel
function subscribe() {
  const uid = cloud.user.id;
  const ch = supa.channel(`user:${uid}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, (p) => {
      cloud.unread += 1;
      cloud.emit('unread', cloud.unread);
      cloud.emit('notification', p.new);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` }, (p) => {
      const was = cloud.profile && cloud.profile.status;
      cloud.profile = { ...cloud.profile, ...p.new };
      if (p.new.status === 'suspended' && was !== 'suspended') cloud.emit('suspended');
      cloud.emit('account');
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'organization_members', filter: `user_id=eq.${uid}` }, () => loadAccount())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions' }, () => loadAccount())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'feature_flags' }, (p) => { if (p.new && p.new.key) { cloud.flags[p.new.key] = p.new.enabled; cloud.emit('flags', cloud.flags); } })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_config' }, (p) => { if (p.new && p.new.key) { cloud.config[p.new.key] = p.new.value; cloud.emit('config', cloud.config); } })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => cloud.emit('announcements'))
    .subscribe();
  channels.push(ch);
}

/* Canal temps réel supplémentaire (projets, documents…), refermé à la déconnexion. */
export function channel(name, setup) {
  const ch = setup(supa.channel(name));
  ch.subscribe();
  channels.push(ch);
  return () => { supa.removeChannel(ch); channels = channels.filter((c) => c !== ch); };
}

// ------------------------------------------------------------------ authentification
const redirect = () => (IS_WEB ? `${location.origin}${location.pathname}` : 'https://trdgi4djyds.github.io/nexora/');

export async function signUp({ email, password, fullName }) {
  const { data, error } = await supa.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: redirect() } });
  if (error) throw new Error(errText(error));
  return { needsConfirm: !data.session };
}

export async function signIn({ email, password }) {
  const { error } = await supa.auth.signInWithPassword({ email, password });
  if (error) throw new Error(errText(error));
}

export async function magicLink(email) {
  const { error } = await supa.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect(), shouldCreateUser: false } });
  if (error) throw new Error(errText(error));
}

export async function resetPassword(email) {
  const { error } = await supa.auth.resetPasswordForEmail(email, { redirectTo: `${redirect()}#/reset` });
  if (error) throw new Error(errText(error));
}

export async function updatePassword(password) {
  const { error } = await supa.auth.updateUser({ password });
  if (error) throw new Error(errText(error));
}

export async function updateEmail(email) {
  const { error } = await supa.auth.updateUser({ email }, { emailRedirectTo: redirect() });
  if (error) throw new Error(errText(error));
}

export async function signOut() {
  await supa.auth.signOut().catch(() => {});
  await setSession(null);
}

export async function signOutEverywhere() {
  await supa.auth.signOut({ scope: 'global' }).catch(() => {});
  await setSession(null);
}

export async function updateProfile(patch) {
  const { data, error } = await supa.from('profiles').update(patch).eq('id', cloud.user.id).select().single();
  if (error) throw new Error(errText(error));
  cloud.profile = data;
  cloud.emit('account');
  return data;
}

export async function uploadAvatar(file) {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${cloud.user.id}/avatar-${Date.now()}.${ext}`;
  const { error } = await supa.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type || 'image/png' });
  if (error) throw new Error(errText(error));
  const { data } = supa.storage.from('avatars').getPublicUrl(path);
  return updateProfile({ avatar_url: data.publicUrl });
}

export const initials = (p) => String((p && (p.full_name || p.email)) || '?').trim().split(/\s+|@/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
export const avatarHtml = (p, size = 30) => (p && p.avatar_url
  ? `<img class="nx-av" src="${String(p.avatar_url).replace(/"/g, '')}" alt="" style="width:${size}px;height:${size}px">`
  : `<span class="nx-av" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px;--h:${hueOf(p && (p.id || p.email))}">${initials(p)}</span>`);
function hueOf(s) { let h = 0; for (const c of String(s || 'x')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
