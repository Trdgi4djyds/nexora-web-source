/* Visite guidée : au premier lancement (et sur demande), chaque espace et chaque section importante est
 * présentée par un bloc explicatif posé à côté de l'élément concerné, mis en lumière. */
import { $, esc } from './dom.js';
import { icon } from './icons.js';
import { settings, persist } from './settings.js';

const STEPS = [
  { title: 'Bienvenue dans NEXORA', text: 'NEXORA t’aide à <b>montrer, tester, développer, transformer en application et promouvoir</b> tes sites. Cette visite dure deux minutes : elle te présente chaque espace et ce que tu peux y faire. Tu peux la quitter à tout moment et la revoir depuis l’Accueil.', icon: 'sparkle' },
  { mode: 'home', sel: '#modeSeg', title: 'Les espaces', text: 'Dans le rail de gauche, tu passes d’un espace à l’autre (ou <b>Ctrl+1 à Ctrl+5</b>). L’icône de la maison ramène à l’<b>Accueil</b>. Tous les espaces travaillent sur le <b>même projet</b> : ouvre un site une fois, il est partout.' },
  { mode: 'home', sel: '.hm-grid', title: 'Accueil : tes projets', text: 'Chaque site ou dossier de code que tu ouvres devient un <b>projet</b>, avec ses applications, présentations et sa surveillance. Le bouton <b>Ouvrir</b> l’affiche dans les appareils ; les petits boutons l’ouvrent directement dans un autre espace.' },
  { mode: 'home', sel: '.hm-open', title: 'Ouvrir un site', text: 'Colle simplement l’adresse d’un site (par exemple <b>monsite.com</b>) puis <b>Ouvrir</b>. Pour un projet de ton ordinateur, utilise <b>Ouvrir un dossier de code</b> : NEXORA le démarre tout seul.' },
  { mode: 'home', sel: '#btnGo', title: 'Aller à… (Ctrl+K)', text: 'Le chemin le plus court vers n’importe quelle section, fenêtre ou projet : tape quelques lettres (« push », « maquette », « sauvegarde »…) puis Entrée.' },
  { mode: 'home', sel: '#btnNew', title: 'Nouveau', text: 'Crée en un clic une planche d’appareils, un projet, une application, une scène ou une présentation à partir d’un modèle.' },
  { mode: 'home', sel: '#btnAI', title: 'Assistant IA', text: 'Branche ta propre IA (plusieurs offres gratuites sont proposées). Elle corrige ton code, rédige tes textes et peut monter une scène animée à ta place dans le Studio.' },
  { mode: 'preview', sel: '#sidebar', title: 'Responsive Lab : les appareils', text: 'Ton site dans de vrais téléphones, tablettes et ordinateurs. Coche les appareils à afficher dans la liste ; chaque écran a sa vraie taille et son vrai comportement.' },
  { mode: 'preview', sel: '#dock', title: 'Captures et vidéos', text: 'En bas : synchroniser le défilement, faire une <b>photo</b> des appareils, enregistrer une <b>vidéo</b>, ou présenter en plein écran. L’inspecteur (à droite) signale les erreurs de la page.' },
  { mode: 'browser', sel: '.bl-tabs', title: 'Browser Lab : analyser une page', text: '<b>Éléments</b> (sélection façon Figma), <b>Réseau</b>, <b>Audit</b> (vitesse, référencement, accessibilité), <b>Tests</b> automatiques, <b>Aspirateur</b> de site et <b>Surveillance</b> avec alertes.' },
  { mode: 'dev', sel: '#devlab', title: 'Dev Lab : le code', text: 'Éditeur, terminal, Git et GitHub, aperçu en direct à chaque enregistrement, et lien de partage pour montrer ton travail sur Internet. Le dossier ouvert ici devient le projet de tous les espaces.' },
  { mode: 'android', sel: '.ab-nav', title: 'App Builder : ton application', text: 'Les sections se suivent de haut en bas : <b>Source</b> (NEXORA reconnaît tout seul nom, logo et couleurs du site), identité, icône, apparence, navigation, fonctions natives, <b>notifications</b>, puis signature.' },
  { mode: 'android', sel: '.ab-side', title: 'Aperçu et construction', text: 'L’aperçu montre l’application dans un vrai téléphone, à taille réelle. <b>Construire</b> crée l’APK (et l’AAB du Play Store). Branche un téléphone en USB pour l’<b>installer et la tester</b> en un clic.' },
  { mode: 'studio', sel: '.st-spaces', title: '3D & Motion Studio', text: '<b>Scène 3D</b> façon éditeur noir et blanc (menu <b>+ Ajouter</b> en bas, clic droit sur un objet, bouton <b>Rendu</b> pour une image finale), <b>Maquettes</b> (les appareils du Responsive Lab posés et animés, en scène photo réaliste) et <b>Présentation</b> générée à partir du site.' },
  { mode: 'studio', sel: '.tl, .st-timeline', title: 'Animation et montage', text: 'La frise sert à animer : images clés, plans avec transitions, vidéos, musique. L’export produit une image, une vidéo ou un fichier 3D.' },
  { mode: 'design', sel: '#dzTools', title: 'NEX-DESIGN : le design 2D', text: 'Mise en page, dessin vectoriel (plume, formes, opérations booléennes), texte et retouche d’images, comme Figma, Illustrator et Photoshop réunis. Les <b>objets 3D</b> (formes, texte en relief, ton site dans un téléphone, modèles .glb) s’ajoutent comme des calques : double-clic pour les faire pivoter.' },
  { mode: 'home', sel: '#btnAppearance', title: 'Réglages', text: 'Thème clair ou sombre, couleur, taille de l’interface, <b>sauvegarde</b> de ton travail, <b>mises à jour</b> et <b>mode léger</b> pour les petits ordinateurs.' },
  { title: 'C’est parti !', text: 'Commence par coller le lien de ton site dans l’Accueil. Tu peux revoir cette visite à tout moment : <b>Accueil › Revoir la visite guidée</b>, ou <b>Ctrl+K › Visite guidée</b>.', icon: 'pass' },
];

let ui = null;

export async function startTour({ force = false } = {}) {
  if (!force && settings.tourDone) return;
  if (ui) return;
  const { setMode } = await import('../viewer/toolbar.js');
  let i = 0;
  ui = document.createElement('div');
  ui.className = 'tour';
  ui.innerHTML = '<div class="tour-spot"></div><div class="tour-card" role="dialog" aria-live="polite"></div>';
  document.body.append(ui);
  const spot = $('.tour-spot', ui);
  const card = $('.tour-card', ui);
  const end = () => { settings.tourDone = true; persist(); window.removeEventListener('resize', place); if (ui) ui.remove(); ui = null; };
  let target = null;
  const place = () => {
    const r = target ? target.getBoundingClientRect() : null;
    if (r && r.width && r.height) {
      const pad = 6;
      Object.assign(spot.style, { display: 'block', left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
      const cw = card.offsetWidth; const ch = card.offsetHeight;
      const W = window.innerWidth; const H = window.innerHeight;
      let x; let y;
      if (r.bottom + ch + 24 < H) { y = r.bottom + 16; x = r.left; } else if (r.right + cw + 24 < W) { x = r.right + 16; y = r.top; } else if (r.left - cw - 24 > 0) { x = r.left - cw - 16; y = r.top; } else { y = Math.max(16, r.top - ch - 16); x = r.left; }
      card.style.left = `${Math.max(16, Math.min(W - cw - 16, x))}px`;
      card.style.top = `${Math.max(16, Math.min(H - ch - 16, y))}px`;
      card.classList.remove('center');
    } else {
      spot.style.display = 'none';
      card.classList.add('center');
      card.style.left = ''; card.style.top = '';
    }
  };
  const show = async () => {
    const s = STEPS[i];
    if (s.mode && document.body.dataset.mode !== s.mode) { card.innerHTML = '<p class="tour-wait"><span class="spinner small"></span></p>'; await setMode(s.mode); await new Promise((r) => setTimeout(r, 500)); }
    if (!ui) return;
    target = s.sel ? s.sel.split(',').map((q) => document.querySelector(q.trim())).find((el) => el && el.getBoundingClientRect().width) : null;
    card.innerHTML = `
      <div class="tour-top">${s.icon ? `<span class="tour-ic">${icon(s.icon, 18)}</span>` : ''}<span class="tour-n">Étape ${i + 1} sur ${STEPS.length}</span></div>
      <h3>${esc(s.title)}</h3><p>${s.text}</p>
      <div class="tour-dots">${STEPS.map((_, k) => `<i class="${k === i ? 'on' : k < i ? 'done' : ''}"></i>`).join('')}</div>
      <div class="tour-foot"><button class="btn small" data-t="skip">${i === STEPS.length - 1 ? 'Fermer' : 'Passer la visite'}</button><span class="grow"></span>
        ${i ? '<button class="btn small" data-t="prev">Précédent</button>' : ''}
        <button class="btn small primary" data-t="next">${i === STEPS.length - 1 ? 'Terminer' : 'Suivant'}</button></div>`;
    place();
    requestAnimationFrame(place);
    const nb = $('[data-t="next"]', card); if (nb) nb.focus();
  };
  card.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    if (b.dataset.t === 'skip') { end(); return; }
    if (b.dataset.t === 'prev') { i = Math.max(0, i - 1); show(); return; }
    if (i >= STEPS.length - 1) { end(); setMode('home'); return; }
    i += 1; show();
  });
  ui.addEventListener('keydown', (e) => { if (e.key === 'Escape') end(); if (e.key === 'ArrowRight') $('[data-t="next"]', card).click(); if (e.key === 'ArrowLeft' && i) { i -= 1; show(); } });
  window.addEventListener('resize', place);
  show();
}

// Premier lancement : la visite démarre une fois la fenêtre de préparation des outils fermée.
export function tourOnStart() {
  if (settings.tourDone) return;
  const wait = () => {
    const bd = document.querySelector('#sheetBackdrop');
    if (bd && !bd.hidden) { setTimeout(wait, 1500); return; }
    startTour();
  };
  setTimeout(wait, 2500);
}
