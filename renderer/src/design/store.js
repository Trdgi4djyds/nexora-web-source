/* NEX-DESIGN › enregistrement : les documents vivent dans la base locale de NEXORA (IndexedDB), avec leurs
 * ressources (images, modèles 3D). Un document s'exporte aussi en fichier .nexd (JSON autonome) pour le partager. */
import { uid } from '../core/dom.js';

let dbP = null;
const db = () => dbP || (dbP = new Promise((res, rej) => {
  const r = indexedDB.open('nexora-design', 1);
  r.onupgradeneeded = () => { r.result.createObjectStore('docs', { keyPath: 'id' }); };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
}));

const tx = async (mode, fn) => {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction('docs', mode);
    const st = t.objectStore('docs');
    const req = fn(st);
    t.oncomplete = () => res(req && 'result' in req ? req.result : undefined);
    t.onerror = () => rej(t.error);
  });
};

export const FORMATS = {
  post: ['Publication carrée', 1080, 1080],
  portrait: ['Publication portrait', 1080, 1350],
  story: ['Story / Reel', 1080, 1920],
  hd: ['Écran 16:9', 1920, 1080],
  yt: ['Miniature YouTube', 1280, 720],
  banner: ['Bannière web', 1440, 480],
  og: ['Partage de lien', 1200, 630],
  logo: ['Logo', 1000, 1000],
  a4: ['Affiche A4', 2480, 3508],
  flyer: ['Flyer A5', 1748, 2480],
  card: ['Carte de visite', 1050, 600],
  phone: ['Écran de téléphone', 1206, 2622],
  desktop: ['Écran d’ordinateur', 1440, 1024],
};

export function newPage(name = 'Page 1', format = 'post', extra = {}) {
  const [, w, h] = FORMATS[format] || FORMATS.post;
  return {
    id: uid(), name, w, h, bg: '#ffffff', json: null, ...extra,
  };
}

export function newDoc(name = 'Sans titre', format = 'post') {
  return {
    id: uid(), name, pages: [newPage('Page 1', format)], assets: {}, updated: Date.now(), thumb: null, cur: 0,
  };
}

export async function listDocs() {
  const all = await tx('readonly', (st) => st.getAll()).catch(() => []);
  return (all || []).map((d) => ({
    id: d.id, name: d.name, updated: d.updated, thumb: d.thumb, pages: d.pages.length,
  })).sort((a, b) => b.updated - a.updated);
}

export const getDoc = (id) => tx('readonly', (st) => st.get(id));
export const putDoc = (doc) => tx('readwrite', (st) => st.put({ ...doc, updated: Date.now() }));
export const deleteDoc = (id) => tx('readwrite', (st) => st.delete(id));

export function exportNexd(doc) {
  return new TextEncoder().encode(JSON.stringify({ format: 'nexd', version: 1, doc }));
}

export function importNexd(bytes) {
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!data || data.format !== 'nexd' || !data.doc || !Array.isArray(data.doc.pages)) throw new Error('Ce fichier n’est pas un document NEX-DESIGN.');
  return { ...data.doc, id: uid(), updated: Date.now() };
}
