/* Maintenance : sauvegarde et restauration, mises à jour de NEXORA, mode léger, journaux d'assistance. */
import { api } from './api.js';
import { $, esc } from './dom.js';
import { icon } from './icons.js';
import { settings, persist } from './settings.js';
import { toast, openSheet, closeSheet, toggle } from './ui.js';
import { applyTheme } from './theme.js';

const weakPc = () => (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;

export function openMaintenance() {
  const sheet = openSheet('maint', `
    <div class="sheet-head"><span class="sheet-icon">${icon('wrench', 22)}</span><div><h2>Maintenance et sauvegarde</h2><p>Garde une copie de ton travail, mets NEXORA à jour et adapte-la à ton ordinateur.</p></div></div>
    <div class="sheet-body mt-grid">
      <section class="mt-card">
        <h3>${icon('download', 16)} Sauvegarder</h3>
        <p>Un seul fichier protégé par mot de passe : tes applications, scènes, présentations et réglages, <b>et les clés de signature de tes applications</b> (indispensables pour publier leurs mises à jour sur le Play Store).</p>
        <p class="mt-note">Non inclus, par sécurité : clés d’IA, connexion GitHub, clés des comptes de service. Tu les saisiras à nouveau.</p>
        <label class="field"><span>Mot de passe de la sauvegarde</span><input class="input" type="password" data-bk="p1" autocomplete="new-password" placeholder="6 caractères minimum"></label>
        <label class="field"><span>Confirmer</span><input class="input" type="password" data-bk="p2" autocomplete="new-password"></label>
        <button class="btn primary" data-mt="backup">${icon('download', 14)}<span>Créer la sauvegarde…</span></button>
      </section>
      <section class="mt-card">
        <h3>${icon('upload', 16)} Restaurer</h3>
        <p>Sur ce PC ou un nouveau : choisis le fichier de sauvegarde et son mot de passe. Les réglages actuels sont gardés de côté ; une clé de signature déjà présente n’est jamais remplacée.</p>
        <label class="field"><span>Mot de passe de la sauvegarde</span><input class="input" type="password" data-bk="r1" autocomplete="current-password"></label>
        <button class="btn" data-mt="restore">${icon('upload', 14)}<span>Restaurer une sauvegarde…</span></button>
      </section>
      <section class="mt-card">
        <h3>${icon('restart', 16)} Mises à jour de NEXORA</h3>
        <p>NEXORA vérifie la dernière version publiée sur ton dépôt GitHub (rubrique Releases), la télécharge et l’installe en gardant tous tes réglages.</p>
        <label class="field"><span>Dépôt des versions (propriétaire/nom)</span><input class="input" data-mt-repo value="${esc(settings.updateRepo || '')}" placeholder="mon-compte/nexora" spellcheck="false"></label>
        ${toggle('updateAuto', 'Vérifier au démarrage', 'Une fois par jour, sans rien installer sans ton accord.', settings.updateAuto !== false)}
        <div class="mt-row"><button class="btn" data-mt="check">${icon('search', 14)}<span>Vérifier maintenant</span></button><span class="mt-upd"></span></div>
      </section>
      <section class="mt-card">
        <h3>${icon('bolt', 16)} Performance</h3>
        ${toggle('lite', 'Mode léger', 'Pour les petits ordinateurs : moins d’effets visuels, rendu 3D allégé, aperçus moins gourmands.', Boolean(settings.lite))}
        ${weakPc() && !settings.lite ? '<p class="mt-note">Cet ordinateur a peu de mémoire ou de processeurs : le mode léger est conseillé.</p>' : ''}
        <h3 class="mt-sub">${icon('info', 16)} Assistance</h3>
        <p>En cas de problème, le détail technique est enregistré dans les journaux de NEXORA. Tu peux les ouvrir pour les transmettre.</p>
        <button class="btn" data-mt="logs">${icon('folderOpen', 14)}<span>Ouvrir les journaux</span></button>
      </section>
    </div>
    <div class="sheet-foot"><span class="grow"></span><button class="btn primary" data-sheet="close">Terminé</button></div>`, { wide: true, refresh: () => openMaintenance() });
  const v = (k) => ($(`[data-bk="${k}"]`, sheet) || {}).value || '';
  sheet.onchange = (e) => {
    const t = e.target.dataset.toggle;
    if (t === 'lite') { settings.lite = e.target.checked; persist(); applyTheme(); toast(settings.lite ? 'Mode léger activé. Le Studio 3D l’applique à sa prochaine ouverture.' : 'Mode léger désactivé.'); }
    if (t === 'updateAuto') { settings.updateAuto = e.target.checked; persist(); }
    if (e.target.matches('[data-mt-repo]')) { settings.updateRepo = e.target.value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$|\/$/g, ''); persist(); }
  };
  sheet.onclick = async (e) => {
    const b = e.target.closest('[data-mt]');
    if (!b) return;
    const a = b.dataset.mt;
    try {
      if (a === 'backup') {
        if (v('p1').length < 6) { toast('Choisis un mot de passe d’au moins 6 caractères.', { kind: 'bad' }); return; }
        if (v('p1') !== v('p2')) { toast('Les deux mots de passe ne sont pas identiques.', { kind: 'bad' }); return; }
        persist();
        const r = await api.invoke('backup:create', { password: v('p1') });
        if (r) toast(`Sauvegarde créée : ${r.apps} application(s), ${r.keys} clé(s) de signature. Garde bien son mot de passe : il est impossible de le retrouver.`, { action: 'Afficher', onAction: () => api.invoke('android:reveal', r.file) });
      } else if (a === 'restore') {
        if (!v('r1')) { toast('Indique le mot de passe de la sauvegarde.', { kind: 'bad' }); return; }
        const r = await api.invoke('backup:restore', { password: v('r1') });
        if (r && r.ok) { toast(`Sauvegarde restaurée (${r.keys} clé(s) ajoutée(s)). NEXORA redémarre l’interface…`); setTimeout(() => location.reload(), 1600); }
      } else if (a === 'check') {
        await checkUpdates({ manual: true, out: $('.mt-upd', sheet) });
      } else if (a === 'logs') {
        await api.invoke('support:open-logs');
      }
    } catch (err) { toast(err.message || String(err), { kind: 'bad' }); }
  };
}

export async function checkUpdates({ manual = false, out = null } = {}) {
  const repo = settings.updateRepo;
  if (!repo) { if (manual) toast('Indique d’abord le dépôt GitHub où tu publies les versions de NEXORA.', { kind: 'bad' }); return; }
  if (out) out.textContent = 'Vérification…';
  const r = await api.invoke('update:check', { repo });
  settings.updateChecked = Date.now(); persist();
  if (!r.available) { if (out) out.textContent = `À jour (version ${r.current}).`; if (manual) toast(`NEXORA est à jour (version ${r.current}).`); return; }
  if (out) out.textContent = `Version ${r.version} disponible.`;
  toast(`NEXORA ${r.version} est disponible (tu as la ${r.current}).`, {
    sticky: true,
    action: 'Installer',
    onAction: async () => {
      const t = toast('Téléchargement de la mise à jour…', { busy: true, sticky: true });
      const off = api.on('update:progress', (p) => t.update(`Téléchargement de la mise à jour… ${Math.round((p.progress || 0) * 100)} %`));
      try { await api.invoke('update:install'); } catch (err) { toast(err.message, { kind: 'bad' }); } finally { if (off) off(); t.close(); }
    },
  });
}

// Au démarrage : une vérification par jour au plus, seulement si un dépôt est configuré.
export function updatesOnStart() {
  if (!settings.updateRepo || settings.updateAuto === false) return;
  if (Date.now() - (settings.updateChecked || 0) < 20 * 3600e3) return;
  setTimeout(() => checkUpdates().catch(() => {}), 15000);
}
