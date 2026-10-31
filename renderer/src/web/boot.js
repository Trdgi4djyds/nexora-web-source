/* Point d'entrée de la version web de NEXORA (SaaS) : pont navigateur, session NEXORA Cloud, page publique,
 * puis l'application elle-même (mêmes espaces que la version Windows), synchronisée avec le cloud. */
// Le pont navigateur (shim.js) et le cadre <webview> (webview.js) sont chargés avant ce module (assets/pre.js).
import { initCloud, cloud } from '../cloud/session.js';
import { callFn } from '../cloud/supa.js';

window.__nxCloud = { cloud, callFn };

const landingRoot = () => document.getElementById('nxLanding');
let appStarted = false;

async function startApp() {
  if (appStarted) return;
  appStarted = true;
  landingRoot().hidden = true;
  document.getElementById('app').hidden = false;
  const tb = await import('../viewer/toolbar.js');
  for (const m of tb.MODES) {
    if (['browser', 'dev', 'android'].includes(m[0])) { m[3] = () => import('./desktop-only.js'); m[5] = 'openDesktopOnly'; }
  }
  await import('../main.js');
  const [{ initCloudUi, openAuthSheet, openAccount }, { startSync }] = await Promise.all([import('../cloud/ui.js'), import('../cloud/sync.js')]);
  initCloudUi();
  startSync();
  route({ openAuthSheet, openAccount });
  window.addEventListener('hashchange', () => route({ openAuthSheet, openAccount }));
  cloud.on('recovery', () => openAuthSheet('reset'));
}

async function route({ openAuthSheet, openAccount }) {
  const h = location.hash;
  if (h.startsWith('#/admin')) { const m = await import('../cloud/admin.js'); setTimeout(() => m.openAdmin(), 600); }
  else if (h.startsWith('#/reset')) openAuthSheet('reset');
  else if (h.startsWith('#/support/')) openAccount('support', h.split('/')[2]);
  else if (h.startsWith('#/monitors')) openAccount('monitors');
  else if (h.startsWith('#/invite/')) {
    const { supa, errText } = await import('../cloud/supa.js');
    const { toast } = await import('../core/ui.js');
    const { error } = await supa.rpc('accept_invitation', { invite_token: h.split('/')[2] });
    toast(error ? errText(error) : 'Bienvenue dans l’équipe !', { kind: error ? 'bad' : undefined });
    if (!error) { const s = await import('../cloud/session.js'); await s.loadAccount(); }
    history.replaceState(null, '', '#/');
  }
}

async function boot() {
  await initCloud();
  const h = location.hash;
  if (h.startsWith('#/share/')) { const m = await import('./landing.js'); landingRoot().hidden = false; await m.showShare(landingRoot(), h.split('/')[2]); return; }
  if (cloud.user) { await startApp(); return; }
  // Lien d'invitation ouvert sans compte : on le garde pour après l'inscription.
  if (h.startsWith('#/invite/')) sessionStorage.setItem('nexora-invite', h);
  const m = await import('./landing.js');
  landingRoot().hidden = false;
  await m.showLanding(landingRoot(), h.startsWith('#/invite/') ? 'signup' : 'login');
  cloud.on('auth', (u) => {
    if (!u) return;
    const inv = sessionStorage.getItem('nexora-invite');
    if (inv) { sessionStorage.removeItem('nexora-invite'); location.hash = inv; }
    startApp();
  });
}

boot().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:auto 12px 12px;z-index:99;background:#fff;color:#c00;padding:12px;border-radius:8px;white-space:pre-wrap">${String(err && err.stack ? err.stack : err).replace(/</g, '&lt;')}</pre>`);
});
