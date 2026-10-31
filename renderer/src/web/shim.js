/* Version web : remplace le pont vers le processus principal de l'application Windows (window.vitrine).
 * Ce qui existe dans un navigateur est fait ici (fichiers, presse-papiers, téléchargements, réglages) ou par
 * NEXORA Cloud (audit de sécurité, informations de site) ; le reste répond « disponible dans l'application ». */
const DESKTOP = 'Cette fonction a besoin de l’application Windows NEXORA (accès à ton ordinateur).';
const listeners = new Map();
const SETTINGS_KEY = 'nexora-web-settings';

function pickFile({ filters, multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = multiple;
    const ext = (filters || []).flatMap((f) => f.extensions || []).filter((e) => e !== '*');
    if (ext.length) input.accept = ext.map((e) => `.${e}`).join(',');
    input.onchange = () => resolve([...input.files]);
    window.addEventListener('focus', () => setTimeout(() => { if (!input.files.length) resolve([]); }, 800), { once: true });
    input.click();
  });
}
const readAs = (file, how) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r[how](file); });

function download(data, name, mime = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([typeof data === 'string' ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0)) : data], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  return name;
}

const stamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '.');
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm', svg: 'image/svg+xml', json: 'application/json', glb: 'model/gltf-binary', nexd: 'application/json', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };

// Fonctions NEXORA Cloud, fournies par l'application une fois chargée (même session).
async function fn(name, body) {
  if (!window.__nxCloud) throw new Error('Connexion à NEXORA Cloud requise.');
  return window.__nxCloud.callFn(name, body);
}

const HANDLERS = {
  'settings:load': () => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; } },
  'settings:save': (data) => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...data, displayHD: false })); } catch { /* stockage plein */ } return true; },
  'app:info': () => ({ version: '1.0.0', platform: 'web', autotest: null }),
  'system:dark': () => matchMedia('(prefers-color-scheme: dark)').matches,
  'skins:list': () => ({ bundled: [], user: [] }),
  'clipboard:write': async (t) => { await navigator.clipboard.writeText(String(t)); return true; },
  'clipboard:read': () => navigator.clipboard.readText(),
  'shell:external': (u) => { window.open(u, '_blank', 'noopener'); return true; },
  'shell:open': (u) => { window.open(u, '_blank', 'noopener'); return true; },
  'shell:reveal': () => true,
  'window:titlebar': () => true,
  'window:zoom': () => true,
  'window:fullscreen': (on) => { if (on) document.documentElement.requestFullscreen?.(); else if (document.fullscreenElement) document.exitFullscreen(); return true; },
  'device:emulate': () => true,
  'device:set-scale': () => true,
  'device:env': () => true,
  'url:check': async (u) => { try { const r = await fn('site-info', { url: u }); return { ok: r.ok, status: r.status }; } catch (e) { return { ok: false, error: e.message }; } },
  'sec:scan': async ({ url }) => {
    return fn('security-scan', { url, org_id: window.__nxCloud && window.__nxCloud.cloud.orgId });
  },
  'dialog:open-file': async ({ filters, asDataUrl, asBytes, asText } = {}) => {
    const [file] = await pickFile({ filters });
    if (!file) return null;
    const out = { path: file.name, name: file.name, size: file.size, file };
    if (asDataUrl) out.dataUrl = await readAs(file, 'readAsDataURL');
    if (asBytes) out.data = new Uint8Array(await readAs(file, 'readAsArrayBuffer'));
    if (asText) out.text = await readAs(file, 'readAsText');
    return out;
  },
  'media:pick': async ({ kind = 'video' } = {}) => {
    const files = await pickFile({ multiple: kind !== 'video', filters: [{ extensions: kind === 'video' ? ['mp4', 'webm', 'mov', 'm4v'] : ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] });
    return files.length ? files.map((f) => ({ path: URL.createObjectURL(f), name: f.name })) : null;
  },
  'media:url': (p) => p,
  'capture:save': ({ name, ext, data }) => download(data, `${name} ${stamp()}.${ext}`, MIME[ext]),
  'tts:voices': () => ({ ok: true, voices: (speechSynthesis.getVoices() || []).filter((v) => /^fr/i.test(v.lang)).map((v) => ({ name: v.name, lang: v.lang })) }),
  'ai:status': () => ({ providers: {}, active: null }),
  'autotest:log': (m) => { console.log('[autotest]', m); return true; },
};

window.__NEXORA_WEB__ = true;
window.vitrine = {
  platform: 'web',
  chromeVersion: (navigator.userAgent.match(/Chrome\/([\d.]+)/) || [])[1] || '140.0.0.0',
  async invoke(channel, ...args) {
    const h = HANDLERS[channel];
    if (h) return h(...args);
    // Lectures sans effet : réponse vide plutôt qu'une erreur (les écrans s'affichent normalement).
    if (/:(list|status|summary|tools|info|latest|repos|me|templates|config|voices|devices|key-info|notif-list|play-status|vscode-status|ext-list|system)$/.test(channel)) return null;
    throw new Error(DESKTOP);
  },
  on(channel, cb) {
    if (!listeners.has(channel)) listeners.set(channel, new Set());
    listeners.get(channel).add(cb);
    return () => listeners.get(channel).delete(cb);
  },
  pathForFile: () => '',
};
