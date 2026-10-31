/* Version web : page d'accueil publique (présentation, offres) et connexion / inscription. */
import { supa } from '../cloud/supa.js';
import { authFormHtml, bindAuth, money } from '../cloud/ui.js';
import { icon } from '../core/icons.js';
import { esc } from '../core/dom.js';

const FEATURES = [
  ['multi', 'Responsive Lab', 'Ton site dans de vrais téléphones, tablettes et ordinateurs, côte à côte, à la bonne taille.'],
  ['palette', 'NEX-DESIGN', 'Design 2D façon Figma, Illustrator et Photoshop, avec des objets 3D en calques.'],
  ['cube', '3D & Motion Studio', 'Scènes 3D, maquettes photo réalistes, présentations et vidéos de tes produits.'],
  ['shield', 'Sécurité', 'Audit défensif de tes sites : en-têtes, TLS, cookies, fichiers exposés.'],
  ['sync', 'Supervision', 'Tes sites vérifiés jour et nuit, alerte immédiate en cas de panne.'],
  ['group', 'Équipes', 'Rôles, invitations, projets partagés et collaboration en temps réel.'],
];

export async function showLanding(root, mode = 'login') {
  const { data: plans } = await supa.from('plans').select('*').eq('active', true).order('sort');
  root.innerHTML = `
    <div class="lp">
      <header class="lp-top"><div class="lp-brand"><img src="logo.png" alt=""><b>NEXORA</b></div><nav><a href="#features">Fonctionnalités</a><a href="#pricing">Offres</a><button class="btn small" data-lp="login">Connexion</button><button class="btn small primary" data-lp="signup">Essayer gratuitement</button></nav></header>
      <section class="lp-hero">
        <div class="lp-hero-text">
          <span class="lp-kicker">${icon('sparkle', 13)} La plateforme tout-en-un des créateurs du web</span>
          <h1>Montre, teste, conçois et surveille tes sites <em>au même endroit</em>.</h1>
          <p>Responsive Lab, design 2D avec objets 3D, studio de maquettes, audit de sécurité et supervision : NEXORA réunit tout, dans ton navigateur et sur Windows, avec ton équipe.</p>
          <div class="lp-cta"><button class="btn primary" data-lp="signup">Créer mon compte gratuit</button><button class="btn" data-lp="login">J’ai déjà un compte</button></div>
        </div>
        <div class="lp-auth" id="lpAuth" data-mode="${esc(mode)}"></div>
      </section>
      <section class="lp-features" id="features">${FEATURES.map(([ic, t, d]) => `<div class="lp-feat"><span>${icon(ic, 22)}</span><b>${esc(t)}</b><p>${esc(d)}</p></div>`).join('')}</section>
      <section class="lp-pricing" id="pricing"><h2>Des offres simples</h2><div class="nx-plans">${(plans || []).map((p) => `<div class="nx-plan${p.id === 'pro' ? ' on' : ''}"><b>${esc(p.name)}</b><span class="nx-price">${p.id === 'enterprise' ? 'Sur devis' : money(p.price_month_cents, p.currency)}${p.price_month_cents ? '<small>/mois</small>' : ''}</span><small>${esc(p.description)}</small><ul>${(p.features || []).map((f) => `<li>${icon('check', 12)}${esc(f)}</li>`).join('')}</ul><button class="btn small${p.id === 'pro' ? ' primary' : ''}" data-lp="signup">Commencer</button></div>`).join('')}</div></section>
      <footer class="lp-foot"><span>© ${new Date().getFullYear()} NEXORA</span><span>Application Windows et version web, un seul compte.</span></footer>
    </div>`;
  const auth = root.querySelector('#lpAuth');
  bindAuth(auth, { onDone: () => {} });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lp]');
    if (!b) return;
    auth.innerHTML = authFormHtml(b.dataset.lp);
    auth.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const f = auth.querySelector('[data-autofocus]'); if (f) f.focus();
  });
}

/* Page publique d'un design partagé (lecture seule, sans compte). */
export async function showShare(root, token) {
  const { data } = await supa.rpc('get_shared', { share_token: token });
  root.innerHTML = `<div class="lp lp-share"><header class="lp-top"><div class="lp-brand"><img src="logo.png" alt=""><b>NEXORA</b></div><nav><a class="btn small primary" href="#/">Créer mon compte</a></nav></header>
    ${data ? `<section class="lp-shared"><h1>${esc(data.name)}</h1><p class="nx-muted">${data.type === 'design' ? `Design NEX-DESIGN · ${data.pages} page(s)` : esc(data.type)} · partagé avec toi</p>${data.thumb ? `<img src="${data.thumb}" alt="">` : ''}</section>` : '<section class="lp-shared"><h1>Lien invalide ou expiré</h1></section>'}</div>`;
}
