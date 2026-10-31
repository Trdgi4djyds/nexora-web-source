/* Version web : espaces qui ont besoin de l'ordinateur (navigateurs pilotés, terminal, compilation Android). */
import { icon } from '../core/icons.js';
import { esc } from '../core/dom.js';
import { settings } from '../core/settings.js';

const INFO = {
  browser: ['Browser Lab', 'globe', 'Analyse réseau, éléments, tests automatiques et aspirateur de site pilotent un vrai navigateur sur ton ordinateur.'],
  dev: ['Dev Lab', 'code', 'Éditeur de code, terminal, Git et serveur de développement travaillent directement dans les dossiers de ton ordinateur.'],
  android: ['App Builder', 'android', 'La fabrication des applications Android (APK, AAB) et iPhone utilise les outils installés sur ton ordinateur.'],
};

export async function openDesktopOnly(el) {
  const [name, ic, why] = INFO[settings.mode] || INFO.dev;
  let url = '';
  try { const { cloud } = await import('../cloud/session.js'); url = cloud.config.desktop_download_url || ''; } catch { /* hors ligne */ }
  el.innerHTML = `<div class="nx-desk"><span class="nx-desk-ic">${icon(ic, 30)}</span><h2>${esc(name)}</h2><p>${esc(why)}</p>
    <p class="nx-muted">Cet espace fonctionne dans l’application Windows NEXORA, connectée au même compte : tes projets, designs et scènes y sont déjà synchronisés.</p>
    ${url ? `<a class="btn primary" href="${esc(url)}" target="_blank" rel="noopener">${icon('download', 14)}<span>Télécharger NEXORA pour Windows</span></a>` : ''}</div>`;
  return { pause() {}, resume() {} };
}
