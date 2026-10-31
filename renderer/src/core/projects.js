/* Projets NEXORA : un projet réunit le site (adresse) ou le dossier de code, ses applications, ses
 * présentations et publicités, et sa surveillance. Ouvrir un projet aligne tous les espaces dessus. */
import { S } from './state.js';
import { bus, uid } from './dom.js';
import { settings, persist } from './settings.js';
import { samePath } from './sync.js';

const host = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return ''; } };

export function projects() {
  if (!Array.isArray(settings.projects)) settings.projects = [];
  return settings.projects;
}

export const currentProject = () => projects().find((p) => p.id === settings.projectCur) || null;

export function findProject({ url, dir } = {}) {
  return projects().find((p) => (dir && p.dir && samePath(p.dir, dir)) || (url && p.url && host(p.url) === host(url) && host(url))) || null;
}

/* Projet correspondant au site / dossier ouvert ; créé s'il n'existe pas. */
export function projectForSource(src = S.source) {
  if (!src) return null;
  const url = src.mode === 'project' ? '' : src.url;
  const dir = src.mode === 'project' ? src.dir : '';
  let p = findProject({ url, dir });
  if (!p) {
    p = { id: uid(), name: src.name || host(url) || 'Projet', url: url || '', dir: dir || '', apps: [], created: Date.now() };
    projects().unshift(p);
  }
  if (dir && !p.dir) p.dir = dir;
  if (url && !p.url) p.url = url;
  p.opened = Date.now();
  settings.projectCur = p.id;
  persist();
  bus.emit('projects');
  return p;
}

export function linkApp(appCfgId, src = S.source) {
  const p = src ? projectForSource(src) : currentProject();
  if (!p || !appCfgId) return;
  if (!p.apps.includes(appCfgId)) { p.apps.push(appCfgId); persist(); bus.emit('projects'); }
}

export function updateProject(id, patch) {
  const p = projects().find((x) => x.id === id);
  if (!p) return;
  Object.assign(p, patch);
  persist();
  bus.emit('projects');
}

export function removeProject(id) {
  settings.projects = projects().filter((x) => x.id !== id);
  if (settings.projectCur === id) settings.projectCur = null;
  persist();
  bus.emit('projects');
}

/* Ouvre un projet : son site ou son dossier dans le Responsive Lab, puis les autres espaces s'y alignent. */
export async function openProject(p) {
  const src = await import('../viewer/sources.js');
  settings.projectCur = p.id;
  p.opened = Date.now();
  persist();
  if (p.dir) await src.openProjectDir(p.dir);
  else if (p.url) await src.openUrl(p.url);
}

export function initProjects() {
  bus.on('source', () => { if (S.source && (S.source.url || S.source.dir)) projectForSource(); });
}
