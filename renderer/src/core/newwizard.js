/* Assistant « Nouveau » (Ctrl+N) : nouvelle planche, session, projet, application ou scène, selon l'espace. */
import { api } from './api.js';
import { S } from './state.js';
import { settings, persist } from './settings.js';
import { $, esc } from './dom.js';
import { icon } from './icons.js';
import { openSheet, closeSheet, toast } from './ui.js';

const BOARDS = {
  iphone: ['iPhone seul', 'phone', ['iphone-18-pro']],
  android: ['Android seul', 'android', ['galaxy-s25-ultra']],
  duo: ['iPhone et Android', 'multi', ['iphone-18-pro', 'galaxy-s25-ultra']],
  trio: ['Téléphone, tablette, ordinateur', 'layers', ['iphone-18-pro', 'ipad-pro-11', 'macbook-pro-14']],
  afrique: ['Téléphones populaires en Afrique', 'phone', ['tecno-spark', 'infinix-hot', 'redmi-note-13', 'galaxy-s25']],
  pliables: ['Pliables', 'fold', ['galaxy-z-fold8', 'galaxy-z-flip8', 'pixel-10-pro-fold']],
  tablettes: ['Tablettes', 'tablet', ['ipad-pro-11', 'galaxy-tab-s10', 'ipad-mini']],
  bureau: ['Ordinateurs', 'laptop', ['macbook-air-13', 'surface-laptop-15', 'imac-24']],
  tv: ['Télévision et téléphone', 'tv', ['tv-65-webos', 'iphone-18-pro']],
  montres: ['Montres connectées', 'watch', ['apple-watch-46', 'galaxy-watch-44', 'pixel-watch-45']],
};

const APPS = {
  site: ['Site web en application', 'globe', 'Le site dans une WebView, avec écran de démarrage et navigation native.', {}],
  pwa: ['PWA en Trusted Web Activity', 'star', 'Chrome affiche le site en plein écran, sans barre d’adresse.', { engine: 'twa' }],
  local: ['Projet local (hors ligne)', 'folder', 'Les fichiers du site sont inclus dans l’APK : fonctionne sans Internet.', { source: { kind: 'dir' } }],
  shop: ['Boutique en ligne', 'cart', 'Onglets Accueil, Catalogue, Panier, Compte et bouton WhatsApp.', {
    accent: '#ff7a00',
    config: {
      tabs: [{ label: 'Accueil', icon: 'home', url: '/' }, { label: 'Catalogue', icon: 'search', url: '/boutique' }, { label: 'Panier', icon: 'cart', url: '/panier' }, { label: 'Compte', icon: 'user', url: '/mon-compte' }], fab: { enabled: true, icon: 'chat', action: 'whatsapp', value: '', position: 'right' }, pullToRefresh: true,
    },
  }],
  media: ['Média ou blog', 'text', 'Onglets de rubriques, page hors ligne soignée, partage.', {
    config: { tabs: [{ label: 'À la une', icon: 'home', url: '/' }, { label: 'Rubriques', icon: 'menu', url: '/rubriques' }, { label: 'Recherche', icon: 'search', url: '/?s=' }], offlinePage: true, pullToRefresh: true },
  }],
  business: ['Entreprise ou service', 'shield', 'Menu latéral, présentation en 3 écrans au premier lancement.', {
    config: {
      menu: { enabled: true, title: '', items: [{ label: 'Accueil', icon: 'home', url: '/' }, { label: 'Services', icon: 'star', url: '/services' }, { label: 'Contact', icon: 'chat', url: '/contact' }] },
      onboarding: { enabled: true, slides: [{ title: 'Bienvenue', text: 'Découvre nos services en quelques secondes.' }, { title: 'Simple', text: 'Tout est accessible depuis le menu.' }, { title: 'Toujours là', text: 'Active les notifications pour ne rien manquer.' }] },
    },
  }],
  kiosk: ['Borne ou caisse', 'kiosk', 'Plein écran, paysage, écran toujours allumé, sans zoom.', {
    orientation: 'landscape', config: { fullscreen: true, keepAwake: true, zoom: false, pullToRefresh: false, progressBar: false },
  }],
  tv: ['Application TV (Android TV)', 'tv', 'Lanceur Android TV, paysage, navigation à la télécommande.', { tv: true, orientation: 'landscape', config: { fullscreen: true, pullToRefresh: false } }],
};

const STUDIO = {
  empty: ['Scène vide', 'cube', 'Fond studio, aucun objet'],
  board: ['Appareils de la planche', 'multi', 'Avec leur page, couleur et orientation'],
  duo: ['Deux téléphones', 'multi', 'Côte à côte, fond dégradé'],
  trio: ['Trois appareils', 'layers', 'Tablette, téléphone et pliable'],
  hero: ['Téléphone en vedette', 'star', 'Sur un podium'],
  foldopen: ['Pliable qui s’ouvre', 'fold', 'Animation incluse, éclairage contrasté'],
  laptopphone: ['Ordinateur et téléphone', 'laptop', 'Bureau et mobile'],
  flat: ['Vue de dessus', 'grid', 'Posés à plat'],
  deck: ['Présentation', 'present', 'Diapositives générées depuis le site'],
};

const BROWSER = {
  tab: ['Nouvelle page', 'globe', 'Ouvre une adresse avec les outils de développement'],
  mobile: ['Test mobile', 'phone', 'Écran Android 412 × 915, réseau 4G'],
  clean: ['Session propre', 'trash', 'Efface cookies, cache et stockage avant d’ouvrir la page'],
  slow: ['Connexion lente', 'sync', 'Réseau 3G lent pour mesurer le chargement'],
};

function tiles(map, attr, cur) {
  return `<div class="nw-grid">${Object.entries(map).map(([k, [label, ic, hint]], i) => `<button class="nw-tile${(cur ? cur === k : i === 0) ? ' on' : ''}" data-${attr}="${k}">${icon(ic, 20)}<b>${esc(label)}</b>${hint && typeof hint === 'string' ? `<small>${esc(hint)}</small>` : ''}</button>`).join('')}</div>`;
}

const currentUrl = () => (S.board && S.board.focused && S.board.focused.url) || '';

export function openNewWizard(mode = settings.mode) {
  if (mode === 'dev') { if (S.devLab) S.devLab.newProject(); return; }
  const head = {
    preview: ['Nouvelle planche', 'Choisis les appareils et, si tu veux, le site à afficher.'],
    browser: ['Nouvelle session', 'Une page à inspecter, avec les réglages de test.'],
    android: ['Nouvelle application', 'Pars d’un modèle : tous les réglages restent modifiables ensuite.'],
    studio: ['Nouvelle scène', 'Une mise en scène 3D, des maquettes ou une présentation.'],
  }[mode];
  if (!head) return;
  const body = {
    preview: `${tiles(Object.fromEntries(Object.entries(BOARDS).map(([k, [l, ic, d]]) => [k, [l, ic, `${d.length} appareil${d.length > 1 ? 's' : ''}`]])), 'nw')}
      <label class="field"><span>Site à afficher (facultatif)</span><input class="input" data-url placeholder="https://monsite.com" value="${esc(currentUrl())}"></label>
      <button class="btn small" data-x="poses">${icon('wand', 14)}<span>Mise en scène 2D des maquettes…</span></button>`,
    browser: `${tiles(BROWSER, 'nw')}<label class="field"><span>Adresse</span><input class="input" data-url placeholder="https://monsite.com" value="${esc(currentUrl())}"></label>`,
    android: `${tiles(APPS, 'nw')}<label class="field"><span>Adresse du site</span><input class="input" data-url placeholder="https://monsite.com" value="${esc(currentUrl())}"></label>`,
    studio: tiles(STUDIO, 'nw'),
  }[mode];
  const sheet = openSheet('new', `
    <div class="sheet-head"><span class="sheet-icon">${icon('plus', 22)}</span><div><h2>${head[0]}</h2><p>${head[1]}</p></div></div>
    <div class="sheet-body nw-body">${body}</div>
    <div class="sheet-foot"><span class="grow"></span><button class="btn" data-sheet="close">Annuler</button><button class="btn primary" data-x="ok">Créer</button></div>`, { wide: true });
  let pick = $('.nw-tile.on', sheet) ? $('.nw-tile.on', sheet).dataset.nw : null;
  sheet.onclick = async (e) => {
    const t = e.target.closest('[data-nw]');
    if (t) {
      pick = t.dataset.nw;
      for (const b of sheet.querySelectorAll('[data-nw]')) b.classList.toggle('on', b === t);
      if (e.detail === 2) sheet.querySelector('[data-x="ok"]').click();
      return;
    }
    const x = e.target.closest('[data-x]');
    if (!x) return;
    if (x.dataset.x === 'poses') { closeSheet('new'); (await import('../viewer/poses.js')).openPoses(); return; }
    const url = ($('[data-url]', sheet) || {}).value?.trim() || '';
    closeSheet('new');
    try { await create(mode, pick, url); } catch (err) { console.error(err); toast(err.message || String(err), { kind: 'bad' }); }
  };
}

async function create(mode, k, url) {
  if (mode === 'preview') {
    const b = S.board;
    const devs = BOARDS[k][2];
    b.setLayout(devs.length > 1 ? 'multi' : 'single');
    while (b.list.length > 1) b.removeView(b.list[b.list.length - 1].uid);
    const first = b.list[0];
    if (first.cfg.deviceId !== devs[0]) { first.setDevice(devs[0]); b.emit('focus', first); }
    for (const d of devs.slice(1)) b.addDevice(d);
    if (url) { const { openUrl } = await import('../viewer/sources.js'); await openUrl(url); }
    toast(`Planche « ${BOARDS[k][0]} » prête`);
  }
  if (mode === 'browser') {
    const bl = S.browserLab;
    if (!bl) return;
    if (k === 'clean') { await api.invoke('lab:clear-session'); toast('Cookies, cache et stockage effacés.'); }
    if (k === 'mobile') { bl.st.viewport = 'android'; bl.st.throttle = '4g'; }
    if (k === 'slow') { bl.st.throttle = '3g'; }
    if (k === 'tab') { bl.st.viewport = 'fill'; bl.st.throttle = 'none'; }
    persist();
    for (const k2 of ['viewport', 'throttle']) { const sel = bl.el.querySelector(`[data-set="${k2}"]`); if (sel) sel.value = bl.st[k2]; }
    if (bl.wcId) {
      await bl.applyViewport();
      api.invoke('lab:net-throttle', { wcId: bl.wcId, preset: bl.st.throttle }).catch(() => {});
    }
    if (url) bl.navigate(url);
  }
  if (mode === 'android') {
    const ab = S.android;
    if (!ab) return;
    const patch = JSON.parse(JSON.stringify(APPS[k][3]));
    if (url && k !== 'local') {
      patch.source = { ...(patch.source || {}), kind: 'url', url: /^https?:/i.test(url) ? url : `https://${url}` };
      try { const h = new URL(patch.source.url).hostname.replace(/^www\./, ''); if (!/^[\d.]+$|^localhost$/.test(h)) patch.appName = h.split('.')[0].replace(/^./, (c) => c.toUpperCase()); } catch { /* adresse incomplète */ }
    }
    ab.newApp(patch);
    toast(`Application « ${APPS[k][0]} » créée : vérifie les réglages puis génère l’APK.`);
  }
  if (mode === 'studio') {
    const st = S.studio;
    if (!st) return;
    if (k === 'ad' || k === 'deck') { await st.setSpace(k); return; }
    if (st.space !== 'scene') await st.setSpace('scene');
    if (k === 'empty') {
      st.clearScene();
      st.three.applyEnv({ bg: 'studio', bgColor: '#eceef3', floor: 'shadow', light: 'studio' }, null);
      st.select(null);
      st.renderList();
      st.timeline.render();
      st.commit();
    } else if (k === 'board') await st.importBoard();
    else await st.scenePreset(k);
    st.frameAll(true);
  }
}
