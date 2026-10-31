/* NEXORA Cloud : synchronisation.
 * - Réglages et créations personnelles (Studio, maquettes, présentations, préférences) ↔ user_settings.
 * - Projets ↔ table projects de l'équipe active (temps réel : les coéquipiers voient les changements).
 * - Documents NEX-DESIGN ↔ table design_documents + fichier dans le stockage (temps réel + présence). */
import { supa, errText } from './supa.js';
import { cloud, channel } from './session.js';
import { settings, persist, persistHooks } from '../core/settings.js';
import { bus } from '../core/dom.js';
import { toast } from '../core/ui.js';

// Réglages propres à cet appareil (jamais envoyés) : mise en page, chemins locaux, état de l'interface.
const LOCAL_ONLY = new Set(['mode', 'devices', 'focused', 'layout', 'zoom', 'sidebar', 'inspector', 'inspectorTab', 'consoleTab', 'codeTab', 'panels', 'hidePanels', 'captureDir',
  'recent', 'devLab', 'browserLab', 'designDoc', 'projectCur', 'tourDone', 'cloudAt', 'cloudSettingsAt', 'collapsed', 'android', 'projects', 'uiScale', 'setupDone', 'setup', 'push']);
const state = { pushingSettings: 0, applying: false, projectsT: 0, unsub: [], started: false };

export function startSync() {
  if (state.started) return;
  state.started = true;
  persistHooks.push(() => { if (!state.applying) scheduleSettingsPush(); });
  bus.on('projects', () => { if (!state.applying) scheduleProjectsPush(); });
  cloud.on('auth', (u) => { if (u) onLogin(); else onLogout(); });
  cloud.on('org', () => { pullProjects().then(subscribeOrg); });
  if (cloud.user) onLogin();
}

async function onLogin() {
  if (!cloud.flag('desktop_sync') && !window.__NEXORA_WEB__) return;
  await pullSettings().catch((e) => console.warn('[sync] réglages', e));
  await pullProjects().catch((e) => console.warn('[sync] projets', e));
  subscribeOrg();
}

function onLogout() {
  for (const u of state.unsub) u();
  state.unsub = [];
}

// ------------------------------------------------------------------ réglages
function cloudSettings() {
  const out = {};
  for (const [k, v] of Object.entries(settings)) if (!LOCAL_ONLY.has(k)) out[k] = v;
  return out;
}

async function pullSettings() {
  const { data } = await supa.from('user_settings').select('data, updated_at').eq('user_id', cloud.user.id).maybeSingle();
  if (!data) return;
  const remoteAt = Date.parse(data.updated_at) || 0;
  const remote = data.data || {};
  if (Object.keys(remote).length && remoteAt > (settings.cloudSettingsAt || 0)) {
    state.applying = true;
    for (const [k, v] of Object.entries(remote)) if (!LOCAL_ONLY.has(k)) settings[k] = v;
    settings.cloudSettingsAt = remoteAt;
    persist();
    setTimeout(() => { state.applying = false; }, 600);
    bus.emit('settings-synced');
  } else if (!Object.keys(remote).length) scheduleSettingsPush();
}

function scheduleSettingsPush() {
  if (!cloud.user) return;
  clearTimeout(state.pushingSettings);
  state.pushingSettings = setTimeout(pushSettings, 2500);
}

async function pushSettings() {
  if (!cloud.user) return;
  const { data, error } = await supa.from('user_settings').upsert({ user_id: cloud.user.id, data: cloudSettings() }).select('updated_at').single();
  if (!error && data) { settings.cloudSettingsAt = Date.parse(data.updated_at) || Date.now(); }
}

// ------------------------------------------------------------------ projets
const projectRow = (p) => ({
  org_id: cloud.orgId, name: String(p.name || 'Projet').slice(0, 120), url: p.url || null, kind: p.dir ? 'folder' : 'site', local_key: p.id,
  description: p.description || '', color: p.color || null, settings: { ...p, dir: undefined }, pinned: Boolean(p.pinned),
});

export async function pullProjects() {
  if (!cloud.user || !cloud.orgId) return;
  const { data, error } = await supa.from('projects').select('*').eq('org_id', cloud.orgId).eq('archived', false).order('updated_at', { ascending: false });
  if (error) throw error;
  if (!Array.isArray(settings.projects)) settings.projects = [];
  const local = settings.projects;
  const byKey = new Map(local.map((p) => [p.id, p]));
  state.applying = true;
  for (const row of data) {
    const key = row.local_key || row.id;
    const cur = byKey.get(key);
    const remote = { ...(row.settings || {}), id: key, name: row.name, url: row.url || '', cloudId: row.id, cloudAt: Date.parse(row.updated_at) };
    if (!cur) local.push({ apps: [], created: Date.parse(row.created_at), ...remote, dir: '' });
    else if (!cur.cloudAt || remote.cloudAt > cur.cloudAt) Object.assign(cur, { ...remote, dir: cur.dir || '' });
  }
  // Projets supprimés ailleurs : retirés ici aussi (ceux jamais envoyés restent et partiront au prochain envoi).
  const ids = new Set(data.map((r) => r.id));
  settings.projects = local.filter((p) => !p.cloudId || ids.has(p.cloudId) || p.cloudOrg !== cloud.orgId);
  persist();
  bus.emit('projects');
  setTimeout(() => { state.applying = false; }, 400);
  scheduleProjectsPush();
}

function scheduleProjectsPush() {
  if (!cloud.user || !cloud.orgId || !cloud.canEdit) return;
  clearTimeout(state.projectsT);
  state.projectsT = setTimeout(pushProjects, 1500);
}

async function pushProjects() {
  const list = Array.isArray(settings.projects) ? settings.projects : [];
  const mine = list.filter((p) => !p.cloudOrg || p.cloudOrg === cloud.orgId);
  const rows = mine.map(projectRow);
  if (rows.length) {
    const { data, error } = await supa.from('projects').upsert(rows, { onConflict: 'org_id,local_key' }).select('id, local_key, updated_at');
    if (error) { console.warn('[sync] projets', errText(error)); return; }
    for (const r of data) { const p = list.find((x) => x.id === r.local_key); if (p) { p.cloudId = r.id; p.cloudOrg = cloud.orgId; p.cloudAt = Date.parse(r.updated_at); } }
  }
  // Projets retirés localement : archivés dans le cloud.
  const keys = mine.map((p) => p.id);
  const q = supa.from('projects').update({ archived: true }).eq('org_id', cloud.orgId).eq('archived', false).not('local_key', 'is', null);
  await (keys.length ? q.not('local_key', 'in', `(${keys.map((k) => `"${k}"`).join(',')})`) : q);
}

function subscribeOrg() {
  for (const u of state.unsub) u();
  state.unsub = [];
  if (!cloud.user || !cloud.orgId) return;
  const org = cloud.orgId;
  let t = 0;
  state.unsub.push(channel(`org:${org}`, (ch) => ch
    .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `org_id=eq.${org}` }, (p) => {
      if (p.new && p.new.updated_at && Date.parse(p.new.updated_at) <= (settings.projects || []).reduce((m, x) => Math.max(m, x.cloudAt || 0), 0) && p.eventType !== 'DELETE') return;
      clearTimeout(t); t = setTimeout(() => pullProjects().catch(() => {}), 500);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'design_documents', filter: `org_id=eq.${org}` }, (p) => bus.emit('cloud-design', p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'studio_items', filter: `org_id=eq.${org}` }, (p) => bus.emit('cloud-studio', p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'monitors', filter: `org_id=eq.${org}` }, (p) => bus.emit('cloud-monitor', p))));
}

// ------------------------------------------------------------------ documents NEX-DESIGN
export const designCloud = {
  enabled() { return Boolean(cloud.user && cloud.orgId && cloud.flag('design')); },

  async list() {
    if (!this.enabled()) return [];
    const { data } = await supa.from('design_documents').select('id, name, thumb, pages_count, updated_at, local_id, version, updated_by, storage_path').eq('org_id', cloud.orgId).is('deleted_at', null).order('updated_at', { ascending: false });
    return data || [];
  },

  async upload(doc) {
    if (!this.enabled() || !cloud.canEdit) return null;
    const blob = new Blob([JSON.stringify(doc)], { type: 'application/json' });
    const path = `${cloud.orgId}/designs/${doc.id}.json`;
    const up = await supa.storage.from('design-files').upload(path, blob, { upsert: true, contentType: 'application/json' });
    if (up.error) throw new Error(errText(up.error));
    const row = {
      org_id: cloud.orgId, local_id: doc.id, name: String(doc.name || 'Sans titre').slice(0, 160), pages_count: doc.pages.length, thumb: doc.thumb || null, storage_path: path, size_bytes: blob.size,
    };
    const { data, error } = await supa.from('design_documents').upsert(row, { onConflict: 'org_id,local_id' }).select('id, version, updated_at').single();
    if (error) throw new Error(errText(error));
    return data;
  },

  async download(row) {
    const { data, error } = await supa.storage.from('design-files').download(row.storage_path);
    if (error) throw new Error(errText(error));
    return JSON.parse(await data.text());
  },

  async remove(localId) {
    if (!this.enabled()) return;
    await supa.from('design_documents').update({ deleted_at: new Date().toISOString() }).eq('org_id', cloud.orgId).eq('local_id', localId);
  },

  async share(localId) {
    const { data: d } = await supa.from('design_documents').select('id').eq('org_id', cloud.orgId).eq('local_id', localId).maybeSingle();
    if (!d) throw new Error('Enregistre d’abord le document dans le cloud.');
    const { data, error } = await supa.from('share_links').insert({ org_id: cloud.orgId, target_type: 'design', target_id: d.id }).select('token').single();
    if (error) throw new Error(errText(error));
    return data.token;
  },

  // Présence : qui regarde ce document en ce moment.
  presence(localId, onChange) {
    if (!this.enabled() || !cloud.flag('realtime_presence')) return () => {};
    const me = { id: cloud.user.id, name: (cloud.profile && cloud.profile.full_name) || cloud.user.email, avatar: cloud.profile && cloud.profile.avatar_url };
    const ch = supa.channel(`design:${cloud.orgId}:${localId}`, { config: { presence: { key: cloud.user.id } } });
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState();
      onChange(Object.values(st).map((arr) => arr[0]).filter((p) => p && p.id !== me.id));
    });
    ch.on('broadcast', { event: 'saved' }, (m) => bus.emit('design-saved-remote', m.payload));
    ch.subscribe((status) => { if (status === 'SUBSCRIBED') ch.track(me); });
    this.ch = ch;
    return () => { supa.removeChannel(ch); if (this.ch === ch) this.ch = null; };
  },

  announceSaved(localId, version) {
    if (this.ch) this.ch.send({ type: 'broadcast', event: 'saved', payload: { localId, version, by: cloud.user.id, name: cloud.profile && cloud.profile.full_name } });
  },
};

export function syncError(err) { toast(`Synchronisation : ${errText(err)}`, { kind: 'bad' }); }
