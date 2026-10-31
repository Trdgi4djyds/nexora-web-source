/* Synchronisation des espaces sur le projet / site ouvert.
 * Le « projet courant » est celui du Responsive Lab (S.source). Chaque espace s'y aligne :
 *  - Browser Lab : ouvre l'adresse du site (sans écraser une navigation faite à la main ensuite) ;
 *  - Dev Lab : ouvre le dossier du projet (projets de l'ordinateur) ;
 *  - App Builder : propose / applique le site ou le dossier comme source de l'application ;
 *  - Studio 3D & Motion : utilise le site pour les appareils, la publicité et la présentation.
 * Et dans l'autre sens, un dossier ouvert dans le Dev Lab devient le projet courant des autres espaces. */
import { S } from './state.js';
import { bus } from './dom.js';
import { settings } from './settings.js';

export const sourceKey = () => (S.source ? (S.source.dir || S.source.url || '') : '');
export const currentSiteUrl = () => S.baseUrl || (S.source && S.source.url) || '';

const synced = {};
// Chemins comparés sans tenir compte des séparateurs, de la casse (Windows) ni d'une barre finale.
export const samePath = (a, b) => Boolean(a && b) && String(a).replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase() === String(b).replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase();
const origin = (u) => { try { return new URL(u).origin; } catch { return ''; } };

export async function syncSpace(mode = settings.mode) {
  const k = sourceKey();
  if (!k) return;
  const url = currentSiteUrl();
  try {
    if (mode === 'browser' && S.browserLab && url) {
      const tag = `${k}|${url}`;
      if (synced.browser !== tag) {
        synced.browser = tag;
        if (origin(S.browserLab.url || S.browserLab.st.url) !== origin(url)) S.browserLab.navigate(url);
      }
    } else if (mode === 'dev' && S.devLab && S.source.dir && !adopting) {
      if (synced.dev !== k) {
        synced.dev = k;
        if (!samePath(S.devLab.st.root, S.source.dir)) await S.devLab.openFolder(S.source.dir, { fromSync: true });
      }
    } else if (mode === 'android' && S.android && S.android.syncSource) {
      const tag = `${k}|${url}`;
      if (synced.android !== tag) { synced.android = tag; S.android.syncSource(S.source, url); }
    } else if (mode === 'studio' && S.studio && S.studio.syncSource && url) {
      const tag = `${k}|${url}`;
      if (synced.studio !== tag) { synced.studio = tag; S.studio.syncSource(url); }
    }
  } catch (err) { console.warn('[sync]', err); }
}

// Un dossier ouvert dans le Dev Lab devient le projet courant de tous les espaces.
export async function adoptDevFolder(dir) {
  if (!dir || (S.source && samePath(S.source.dir, dir))) return;
  synced.dev = dir;
  adopting = true;
  try {
    const { openProjectDir } = await import('../viewer/sources.js');
    await openProjectDir(dir);
  } finally {
    adopting = false;
    synced.dev = sourceKey();
  }
}
let adopting = false;

export function initSync() {
  bus.on('source', () => syncSpace());
  bus.on('mode', (m) => syncSpace(m));
}
