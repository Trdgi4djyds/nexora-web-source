/* Panneau Audit avancé : performance (signaux web essentiels, poids, cascade réseau, compression, cache,
 * formats d'image, code inutilisé), référencement (balises, données structurées, robots.txt, sitemap),
 * accessibilité, responsive et bonnes pratiques. Rapport exportable. */
import { api } from '../core/api.js';
import {
  $, esc, fmtBytes, fmtMs, sleep,
} from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast } from '../core/ui.js';

const CATS = {
  perf: 'Performance', a11y: 'Accessibilité', seo: 'Référencement', responsive: 'Responsive', best: 'Bonnes pratiques',
};

// Contrôles supplémentaires exécutés dans la page.
const EXTRA = String.raw`(() => {
  const out = [];
  const add = (c) => out.push({ samples: [], count: 0, ...c });
  const cssPath = (el) => { const parts = []; while (el && el.nodeType === 1 && el !== document.documentElement && parts.length < 8) { const p = el.parentElement; if (!p) break; const same = [...p.children].filter((c) => c.tagName === el.tagName); parts.unshift(el.tagName.toLowerCase() + (same.length > 1 ? ':nth-of-type(' + (same.indexOf(el) + 1) + ')' : '')); if (p.id) { parts.unshift('#' + p.id); break; } el = p; } return parts.join(' > '); };
  const sample = (els, f) => els.slice(0, 8).map((el) => ({ selector: cssPath(el), text: f ? f(el) : '<' + el.tagName.toLowerCase() + '> ' + (el.innerText || el.getAttribute('src') || '').trim().slice(0, 60) }));
  const dpr = devicePixelRatio || 1;
  // Images surdimensionnées par rapport à leur taille d'affichage.
  const imgs = [...document.images].filter((i) => i.complete && i.naturalWidth > 0);
  const over = imgs.filter((i) => { const r = i.getBoundingClientRect(); return r.width > 20 && i.naturalWidth > r.width * dpr * 1.6 && i.naturalWidth - r.width * dpr > 300; });
  if (over.length) add({ id: 'img-size', cat: 'perf', level: 'warn', title: over.length + ' image' + (over.length > 1 ? 's' : '') + ' bien plus grande' + (over.length > 1 ? 's' : '') + ' que leur affichage', detail: 'Fournis des tailles adaptées avec srcset et sizes : le navigateur télécharge des pixels inutiles.', count: over.length, samples: sample(over, (i) => (i.currentSrc || i.src).split('/').pop().slice(0, 40) + ' : ' + i.naturalWidth + ' px pour ' + Math.round(i.getBoundingClientRect().width * dpr) + ' px') });
  const noDim = imgs.filter((i) => !i.getAttribute('width') && !i.getAttribute('height') && !getComputedStyle(i).aspectRatio.includes('/'));
  if (noDim.length > 2) add({ id: 'img-dim', cat: 'perf', level: 'info', title: noDim.length + ' images sans dimensions déclarées', detail: 'Ajoute width et height (ou aspect-ratio) pour éviter les sauts de mise en page.', count: noDim.length, samples: sample(noDim) });
  const lcpImg = imgs.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
  if (lcpImg && lcpImg.getBoundingClientRect().top < innerHeight && lcpImg.loading === 'lazy') add({ id: 'lcp-lazy', cat: 'perf', level: 'warn', title: 'La grande image du haut de page est chargée en différé', detail: 'Retire loading="lazy" et ajoute fetchpriority="high" à l’image principale visible au chargement.', samples: sample([lcpImg]) });
  // Polices.
  let swapMissing = 0;
  try { for (const s of document.styleSheets) { let rules; try { rules = s.cssRules; } catch (e) { continue; } for (const r of rules) if (r.type === 5 && !/swap|optional|fallback/.test(r.style.getPropertyValue('font-display'))) swapMissing += 1; } } catch (e) { /* feuilles inaccessibles */ }
  if (swapMissing) add({ id: 'font-display', cat: 'perf', level: 'info', title: swapMissing + ' police' + (swapMissing > 1 ? 's' : '') + ' sans font-display', detail: 'Ajoute font-display: swap pour afficher le texte immédiatement avec une police de secours.' });
  const preconnect = [...document.querySelectorAll('link[rel="preconnect"], link[rel="dns-prefetch"]')].length;
  // Référencement avancé.
  const canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) add({ id: 'canonical', cat: 'seo', level: 'info', title: 'Adresse canonique absente', detail: 'Ajoute <link rel="canonical"> pour éviter le contenu dupliqué (adresses avec paramètres, www/non-www).' });
  else add({ id: 'canonical', cat: 'seo', level: 'pass', title: 'Adresse canonique : ' + canonical.href });
  const ld = [...document.querySelectorAll('script[type="application/ld+json"]')];
  const types = [];
  let ldBad = 0;
  for (const s of ld) { try { const j = JSON.parse(s.textContent); (Array.isArray(j) ? j : j['@graph'] || [j]).forEach((x) => x && x['@type'] && types.push([].concat(x['@type']).join('/'))); } catch (e) { ldBad += 1; } }
  if (ldBad) add({ id: 'ld-json', cat: 'seo', level: 'error', title: ldBad + ' bloc' + (ldBad > 1 ? 's' : '') + ' de données structurées invalide' + (ldBad > 1 ? 's' : ''), detail: 'Le JSON-LD ne peut pas être lu par Google : vérifie la syntaxe.' });
  else if (types.length) add({ id: 'ld-json', cat: 'seo', level: 'pass', title: 'Données structurées : ' + [...new Set(types)].slice(0, 6).join(', ') });
  else add({ id: 'ld-json', cat: 'seo', level: 'info', title: 'Aucune donnée structurée (schema.org)', detail: 'Organisation, Produit, Article, FAQ… permettent des résultats enrichis dans Google.' });
  const tw = document.querySelector('meta[name="twitter:card"]');
  if (!tw) add({ id: 'twitter', cat: 'seo', level: 'info', title: 'Carte X/Twitter absente', detail: 'Ajoute <meta name="twitter:card" content="summary_large_image">.' });
  const hreflang = document.querySelectorAll('link[rel="alternate"][hreflang]').length;
  const words = (document.body.innerText || '').split(/\s+/).filter((w) => w.length > 1).length;
  if (words < 200) add({ id: 'thin', cat: 'seo', level: 'info', title: 'Peu de texte (' + words + ' mots)', detail: 'Les pages avec très peu de texte sont moins bien comprises par les moteurs de recherche.' });
  const internal = [...document.querySelectorAll('a[href]')].filter((a) => a.host === location.host).length;
  const external = [...document.querySelectorAll('a[href]')].filter((a) => /^https?:/.test(a.href) && a.host !== location.host).length;
  const emptyHref = [...document.querySelectorAll('a')].filter((a) => !a.getAttribute('href') || a.getAttribute('href') === '#' || /^javascript:/i.test(a.getAttribute('href')));
  if (emptyHref.length > 2) add({ id: 'fake-links', cat: 'seo', level: 'info', title: emptyHref.length + ' liens sans destination', detail: 'Les liens href="#" ou javascript: ne sont pas suivis par les moteurs : utilise des boutons pour les actions.', count: emptyHref.length, samples: sample(emptyHref) });
  const outline = [...document.querySelectorAll('h1, h2, h3')].slice(0, 30).map((h) => ({ level: Number(h.tagName[1]), text: (h.innerText || '').trim().slice(0, 80) }));
  // Accessibilité avancée.
  const landmarks = ['main', 'nav', 'header', 'footer'].filter((t) => document.querySelector(t + ', [role="' + ({ main: 'main', nav: 'navigation', header: 'banner', footer: 'contentinfo' })[t] + '"]'));
  if (!landmarks.includes('main')) add({ id: 'main', cat: 'a11y', level: 'warn', title: 'Zone principale <main> absente', detail: 'Les lecteurs d’écran s’en servent pour aller directement au contenu.' });
  const skip = [...document.querySelectorAll('a[href^="#"]')].slice(0, 3).some((a) => /contenu|content|main|skip|aller/i.test(a.innerText || a.getAttribute('aria-label') || ''));
  if (!skip) add({ id: 'skip', cat: 'a11y', level: 'info', title: 'Lien d’évitement absent', detail: 'Un lien « Aller au contenu » en début de page aide la navigation au clavier.' });
  const posTab = [...document.querySelectorAll('[tabindex]')].filter((e) => Number(e.getAttribute('tabindex')) > 0);
  if (posTab.length) add({ id: 'tabindex', cat: 'a11y', level: 'warn', title: posTab.length + ' tabindex positif' + (posTab.length > 1 ? 's' : ''), detail: 'Un tabindex supérieur à 0 casse l’ordre naturel de navigation au clavier.', count: posTab.length, samples: sample(posTab) });
  const autoplay = [...document.querySelectorAll('video[autoplay]:not([muted]), audio[autoplay]')];
  if (autoplay.length) add({ id: 'autoplay', cat: 'a11y', level: 'warn', title: 'Son en lecture automatique', detail: 'Les médias qui jouent du son tout seuls gênent les utilisateurs de lecteurs d’écran.', count: autoplay.length, samples: sample(autoplay) });
  const outlineNone = [...document.querySelectorAll('a, button, input, select, textarea')].slice(0, 200).filter((e) => { const s = getComputedStyle(e); return s.outlineStyle === 'none' && s.boxShadow === 'none'; }).length;
  // Bonnes pratiques.
  const passive = [...document.querySelectorAll('input[type="password"]')].filter((i) => location.protocol !== 'https:' && !/^(localhost|127\.)/.test(location.hostname));
  if (passive.length) add({ id: 'pwd-http', cat: 'best', level: 'error', title: 'Mot de passe saisi sur une page non sécurisée', detail: 'Les champs mot de passe doivent être sur une page HTTPS.' });
  const deprecated = [...document.querySelectorAll('font, center, marquee, blink, frameset')];
  if (deprecated.length) add({ id: 'deprecated', cat: 'best', level: 'info', title: deprecated.length + ' balise' + (deprecated.length > 1 ? 's' : '') + ' obsolète' + (deprecated.length > 1 ? 's' : ''), count: deprecated.length, samples: sample(deprecated) });
  const manifest = document.querySelector('link[rel="manifest"]');
  const theme = document.querySelector('meta[name="theme-color"]');
  if (!manifest) add({ id: 'manifest', cat: 'best', level: 'info', title: 'Pas de manifeste d’application web', detail: 'Un manifest.json permet l’installation sur l’écran d’accueil (PWA).' });
  if (!theme) add({ id: 'theme-color', cat: 'responsive', level: 'info', title: 'Couleur de thème absente', detail: 'Ajoute <meta name="theme-color"> : Chrome mobile colore sa barre d’adresse.' });
  return { checks: out, seo: { canonical: canonical ? canonical.href : '', ldTypes: [...new Set(types)], hreflang, words, internal, external, outline, robots: (document.querySelector('meta[name="robots"]') || {}).content || '', og: { title: (document.querySelector('meta[property="og:title"]') || {}).content || '', description: (document.querySelector('meta[property="og:description"]') || {}).content || '', image: (document.querySelector('meta[property="og:image"]') || {}).content || '' }, description: (document.querySelector('meta[name="description"]') || {}).content || '', title: document.title }, a11y: { landmarks, outlineNone }, preconnect };
})()`;

const LEVEL_ORDER = {
  error: 0, warn: 1, info: 2, pass: 3,
};

export default class AuditPanel {
  constructor(lab, el) {
    this.lab = lab;
    this.el = el;
    this.result = null;
    this.reload = true;
    this.render();
    el.addEventListener('click', (e) => this.onClick(e));
    lab.on('navigate', (u, inPage) => { if (!inPage && this.result) { this.result.stale = true; this.renderHead(); } });
  }

  activate() {}

  render() {
    this.el.innerHTML = `
      <div class="au">
        <div class="au-bar">
          <button class="btn primary small" data-act="run">${icon('audit', 14)}<span>Lancer l’audit</span></button>
          <label class="el-check"><input type="checkbox" data-opt="reload" ${this.reload ? 'checked' : ''}> Recharger la page (mesures complètes)</label>
          <span class="au-spacer"></span>
          <button class="btn small" data-act="coverage" title="Code JavaScript et CSS téléchargé mais jamais utilisé">${icon('code', 13)}<span>Code inutilisé</span></button>
          <button class="btn small" data-act="export" ${this.result ? '' : 'disabled'}>${icon('download', 13)}<span>Rapport</span></button>
        </div>
        <div class="au-head"></div>
        <div class="au-body"><div class="bl-empty-panel"><p class="bl-hint">${icon('audit', 15)} Audit complet de la page affichée, à la taille choisie dans la barre (ordinateur ou mobile) : vitesse, poids, compression, cache, images, référencement, accessibilité, responsive et sécurité.</p></div></div>
      </div>`;
  }

  async run() {
    const lab = this.lab;
    if (!lab.wv || !lab.wcId) { toast('Ouvre d’abord une page.', { kind: 'bad' }); return; }
    const body = $('.au-body', this.el);
    body.innerHTML = '<div class="bl-loading"><span class="spinner small"></span> Analyse en cours…</div>';
    await api.invoke('lab:net-start', { wcId: lab.wcId, preserve: false }).catch(() => {});
    if (this.reload) {
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 30000);
        lab.wv.addEventListener('did-stop-loading', () => { clearTimeout(t); resolve(); }, { once: true });
        lab.wv.reload();
      });
      await sleep(2500);
    }
    const js = window.VitrineAudit ? window.VitrineAudit.js : null;
    const base = js ? await lab.wv.executeJavaScript(js.audit).catch(() => null) : null;
    const extra = await lab.wv.executeJavaScript(EXTRA).catch(() => null);
    const facts = (await api.invoke('lab:net-facts', { wcId: lab.wcId }).catch(() => null)) || [];
    const origin = (() => { try { return new URL(lab.url).origin; } catch { return ''; } })();
    const [robots, sitemap] = origin ? await Promise.all([api.invoke('lab:fetch', { url: `${origin}/robots.txt` }), api.invoke('lab:fetch', { url: `${origin}/sitemap.xml`, method: 'GET', max: 4000 })]) : [null, null];
    const checks = [...(base ? base.checks : []), ...(extra ? extra.checks : []), ...this.netChecks(facts, origin, robots, sitemap)];
    const metrics = base ? base.metrics : {};
    const doc = facts.find((f) => f.type === 'doc');
    if (doc && doc.timing) metrics.ttfb = doc.timing.receiveHeadersEnd - doc.timing.sendStart;
    this.result = {
      url: lab.url, title: lab.title, date: new Date(), checks: checks.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]), metrics, seo: extra ? extra.seo : null, facts, viewport: lab.st.viewport, robots, sitemap,
    };
    this.renderHead();
    this.renderBody();
    $('[data-act="export"]', this.el).disabled = false;
  }

  netChecks(facts, origin, robots, sitemap) {
    const out = [];
    const add = (c) => out.push({ samples: [], count: 0, ...c });
    const files = facts.filter((f) => f.status && f.status < 400 && !f.failed);
    if (!files.length) {
      add({ id: 'net', cat: 'perf', level: 'info', title: 'Mesures réseau indisponibles', detail: 'Coche « Recharger la page » pour analyser toutes les requêtes.' });
      return out;
    }
    const host = (u) => { try { return new URL(u).host; } catch { return ''; } };
    const own = origin ? new URL(origin).host.replace(/^www\./, '') : '';
    const first = (u) => { const h = host(u).replace(/^www\./, ''); return h === own || h.endsWith(`.${own}`); };
    const textual = files.filter((f) => /text|javascript|json|xml|svg|css/.test(f.mime || '') && f.decoded > 1500 && !f.fromCache);
    const uncompressed = textual.filter((f) => !f.encoding && f.encoded > f.decoded * 0.9);
    if (uncompressed.length) add({ id: 'compress', cat: 'perf', level: 'warn', title: `${uncompressed.length} fichier${uncompressed.length > 1 ? 's' : ''} texte non compressé${uncompressed.length > 1 ? 's' : ''}`, detail: 'Active gzip ou Brotli sur le serveur : HTML, CSS et JavaScript pèsent 3 à 5 fois moins.', count: uncompressed.length, samples: uncompressed.slice(0, 8).map((f) => ({ text: `${f.url.split('/').pop().slice(0, 50)} (${fmtBytes(f.decoded)})`, url: f.url })) });
    else add({ id: 'compress', cat: 'perf', level: 'pass', title: 'Fichiers texte compressés' });
    const statics = files.filter((f) => ['css', 'js', 'img', 'font', 'media'].includes(f.type) && first(f.url));
    const noCache = statics.filter((f) => !/max-age=[1-9]|immutable/.test(f.cache) && !f.expires);
    if (noCache.length > 2) add({ id: 'cache', cat: 'perf', level: 'warn', title: `${noCache.length} fichiers sans durée de cache`, detail: 'Ajoute Cache-Control: max-age (et des noms de fichiers versionnés) : les visites suivantes seront instantanées.', count: noCache.length, samples: noCache.slice(0, 8).map((f) => ({ text: f.url.split('/').pop().slice(0, 60), url: f.url })) });
    else if (statics.length) add({ id: 'cache', cat: 'perf', level: 'pass', title: 'Durées de cache définies' });
    const old = files.filter((f) => /^http\/1/i.test(f.protocol || '') && first(f.url));
    if (old.length > 5) add({ id: 'http2', cat: 'perf', level: 'info', title: `${old.length} requêtes en HTTP/1.1`, detail: 'HTTP/2 ou HTTP/3 chargent les fichiers en parallèle sur une seule connexion.' });
    const legacyImg = files.filter((f) => /image\/(jpeg|png|gif)/.test(f.mime || '') && f.encoded > 100000);
    if (legacyImg.length) add({ id: 'img-format', cat: 'perf', level: 'warn', title: `${legacyImg.length} image${legacyImg.length > 1 ? 's' : ''} lourde${legacyImg.length > 1 ? 's' : ''} en JPEG/PNG/GIF`, detail: 'En WebP ou AVIF, elles pèseraient 30 à 70 % de moins.', count: legacyImg.length, samples: legacyImg.slice(0, 8).map((f) => ({ text: `${f.url.split('/').pop().slice(0, 50)} (${fmtBytes(f.encoded)})`, url: f.url })) });
    const oldFonts = files.filter((f) => f.type === 'font' && !/woff2/.test(`${f.mime} ${f.url}`));
    if (oldFonts.length) add({ id: 'woff2', cat: 'perf', level: 'info', title: `${oldFonts.length} police${oldFonts.length > 1 ? 's' : ''} hors WOFF2`, detail: 'Le format WOFF2 est le plus léger et lu par tous les navigateurs actuels.' });
    const third = files.filter((f) => !first(f.url));
    const thirdBytes = third.reduce((a, f) => a + (f.encoded || 0), 0);
    const total = files.reduce((a, f) => a + (f.encoded || 0), 0);
    if (third.length && thirdBytes > total * 0.4 && thirdBytes > 300000) add({ id: 'third', cat: 'perf', level: 'warn', title: `Services tiers : ${fmtBytes(thirdBytes)} (${Math.round((thirdBytes / total) * 100)} % du poids)`, detail: 'Publicité, statistiques, chat, réseaux sociaux… Charge-les après l’affichage ou à la demande.', count: new Set(third.map((f) => host(f.url))).size, samples: [...new Set(third.map((f) => host(f.url)))].slice(0, 8).map((h) => ({ text: h })) });
    const failed = facts.filter((f) => f.failed || f.status >= 400);
    if (failed.length) add({ id: 'failed', cat: 'best', level: 'error', title: `${failed.length} requête${failed.length > 1 ? 's' : ''} en échec`, detail: 'Fichiers introuvables (404) ou erreurs serveur : ils ralentissent la page et peuvent casser des fonctions.', count: failed.length, samples: failed.slice(0, 8).map((f) => ({ text: `${f.status || 'échec'} · ${f.url}`, url: f.url })) });
    const redirects = facts.filter((f) => f.status >= 300 && f.status < 400);
    if (redirects.length) add({ id: 'redirects', cat: 'perf', level: redirects.some((r) => r.type === 'doc') ? 'warn' : 'info', title: `${redirects.length} redirection${redirects.length > 1 ? 's' : ''}`, detail: 'Chaque redirection ajoute un aller-retour réseau. Utilise directement l’adresse finale.', samples: redirects.slice(0, 6).map((f) => ({ text: `${f.status} · ${f.url}` })) });
    const doc = facts.find((f) => f.type === 'doc');
    if (doc && doc.timing) {
      const ttfb = doc.timing.receiveHeadersEnd - doc.timing.sendStart;
      add({ id: 'ttfb', cat: 'perf', level: ttfb > 1800 ? 'error' : ttfb > 800 ? 'warn' : 'pass', title: `Réponse du serveur : ${fmtMs(ttfb)}`, detail: ttfb > 800 ? 'Le serveur met du temps à répondre : cache de pages, base de données, hébergement plus rapide ou CDN.' : '' });
    }
    const js = files.filter((f) => f.type === 'js').reduce((a, f) => a + (f.decoded || 0), 0);
    if (js > 1.5e6) add({ id: 'js-weight', cat: 'perf', level: js > 3e6 ? 'error' : 'warn', title: `${fmtBytes(js)} de JavaScript`, detail: 'Le JavaScript est la ressource la plus coûteuse pour les téléphones : découpe le code et charge-le à la demande. Utilise « Code inutilisé » pour mesurer.' });
    if (robots) {
      if (robots.status === 200) add({ id: 'robots', cat: 'seo', level: /disallow:\s*\/\s*$/im.test(robots.text) && /user-agent:\s*\*/i.test(robots.text) ? 'error' : 'pass', title: /disallow:\s*\/\s*$/im.test(robots.text) ? 'robots.txt bloque tout le site' : 'robots.txt présent' });
      else add({ id: 'robots', cat: 'seo', level: 'info', title: 'robots.txt absent', detail: `${origin}/robots.txt renvoie ${robots.status || 'une erreur'}.` });
    }
    if (sitemap) add({ id: 'sitemap', cat: 'seo', level: sitemap.status === 200 && /<(urlset|sitemapindex)/.test(sitemap.text) ? 'pass' : 'info', title: sitemap.status === 200 && /<(urlset|sitemapindex)/.test(sitemap.text) ? 'Plan du site (sitemap.xml) présent' : 'Plan du site (sitemap.xml) absent', detail: sitemap.status === 200 ? '' : 'Un sitemap aide Google à découvrir toutes les pages.' });
    return out;
  }

  score(cat) {
    const list = this.result.checks.filter((c) => c.cat === cat);
    if (!list.length) return null;
    if (window.VitrineAudit && window.VitrineAudit.score) return window.VitrineAudit.score(list, cat);
    return 100;
  }

  renderHead() {
    const head = $('.au-head', this.el);
    const r = this.result;
    if (!r) { head.innerHTML = ''; return; }
    const ring = (v) => {
      const c = v == null ? 'var(--text-3)' : v >= 90 ? 'var(--ok)' : v >= 50 ? 'var(--warn)' : 'var(--bad)';
      return `<svg viewBox="0 0 36 36" width="54" height="54"><circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--fill)" stroke-width="3"/><circle cx="18" cy="18" r="15.5" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${((v || 0) / 100) * 97.4} 97.4" transform="rotate(-90 18 18)"/><text x="18" y="22" text-anchor="middle" font-size="10" font-weight="700" fill="${c}">${v == null ? '–' : v}</text></svg>`;
    };
    const m = r.metrics || {};
    const tile = (label, v, good, bad, fmt) => {
      const lvl = v == null ? '' : v <= good ? 'ok' : v <= bad ? 'warn' : 'bad';
      return `<div class="au-m ${lvl}"><span>${label}</span><b>${v == null ? '—' : fmt(v)}</b></div>`;
    };
    head.innerHTML = `
      ${r.stale ? `<p class="bl-hint warn">${icon('warn', 13)} La page a changé depuis cet audit.</p>` : ''}
      <div class="au-scores">${Object.entries(CATS).map(([k, l]) => `<button class="au-score" data-cat="${k}">${ring(this.score(k))}<span>${l}</span></button>`).join('')}</div>
      <div class="au-metrics">
        ${tile('Premier affichage', m.fcp, 1800, 3000, fmtMs)}
        ${tile('Contenu principal (LCP)', m.lcp, 2500, 4000, fmtMs)}
        ${tile('Stabilité (CLS)', m.cls, 0.1, 0.25, (v) => v.toFixed(2).replace('.', ','))}
        ${tile('Réponse serveur', m.ttfb, 800, 1800, fmtMs)}
        ${tile('Chargement complet', m.load, 3000, 6000, fmtMs)}
        ${tile('Poids transféré', m.bytes, 1.5e6, 4e6, fmtBytes)}
        ${tile('Requêtes', m.requests, 60, 120, String)}
        ${tile('Éléments', m.dom, 1500, 3000, String)}
      </div>`;
  }

  renderBody(filter) {
    const body = $('.au-body', this.el);
    const r = this.result;
    const sev = { error: 'error', warn: 'warn', info: 'info', pass: 'pass' };
    const groups = Object.entries(CATS).filter(([k]) => !filter || k === filter);
    body.innerHTML = groups.map(([k, label]) => {
      const list = r.checks.filter((c) => c.cat === k);
      if (!list.length) return '';
      const issues = list.filter((c) => c.level !== 'pass');
      const passes = list.filter((c) => c.level === 'pass');
      return `<section class="au-cat" id="au-${k}"><h3>${label}<small>${issues.length} point${issues.length > 1 ? 's' : ''} à améliorer</small></h3>
        ${issues.map((c) => `<details class="au-check ${c.level}"><summary>${icon(sev[c.level] === 'pass' ? 'pass' : c.level === 'error' ? 'error' : c.level === 'warn' ? 'warn' : 'info', 15)}<span>${esc(c.title)}</span>${c.count > 1 ? `<em>${c.count}</em>` : ''}</summary>
          ${c.detail ? `<p>${esc(c.detail)}</p>` : ''}
          ${c.samples && c.samples.length ? `<ul>${c.samples.map((s) => `<li>${s.selector ? `<button class="link-btn small" data-show="${esc(s.selector)}">${icon('target', 12)}<span>${esc(s.text || s.selector)}</span></button>` : `<span title="${esc(s.url || '')}">${esc(s.text || s.url || '')}</span>`}</li>`).join('')}</ul>` : ''}</details>`).join('')}
        ${passes.length ? `<details class="au-passes"><summary>${passes.length} contrôle${passes.length > 1 ? 's' : ''} réussi${passes.length > 1 ? 's' : ''}</summary>${passes.map((c) => `<div class="au-pass">${icon('pass', 13)}<span>${esc(c.title)}</span></div>`).join('')}</details>` : ''}
      </section>`;
    }).join('') + (r.seo && (!filter || filter === 'seo') ? this.seoHtml(r.seo) : '');
  }

  seoHtml(s) {
    let host = '';
    try { host = new URL(this.result.url).host; } catch { /* adresse */ }
    return `<section class="au-cat"><h3>Aperçu dans Google et sur les réseaux</h3>
      <div class="au-serp"><small>${esc(host)}</small><b>${esc(s.title || '(sans titre)')}</b><p>${esc(s.description || 'Aucune description : Google choisira un extrait de la page.')}</p></div>
      ${s.og.image ? `<div class="au-og"><img src="${esc(s.og.image)}" alt=""><div><small>${esc(host)}</small><b>${esc(s.og.title || s.title)}</b><p>${esc(s.og.description || s.description)}</p></div></div>` : ''}
      <div class="au-facts"><span>${s.words} mots</span><span>${s.internal} liens internes</span><span>${s.external} liens externes</span>${s.hreflang ? `<span>${s.hreflang} langues (hreflang)</span>` : ''}${s.ldTypes.length ? `<span>schema.org : ${esc(s.ldTypes.join(', '))}</span>` : ''}</div>
      ${s.outline.length ? `<div class="au-outline">${s.outline.map((o) => `<div style="--l:${o.level}"><em>h${o.level}</em>${esc(o.text)}</div>`).join('')}</div>` : ''}
    </section>`;
  }

  async coverage(btn) {
    const lab = this.lab;
    if (!lab.wcId) return;
    btn.disabled = true;
    const body = $('.au-body', this.el);
    body.innerHTML = '<div class="bl-loading"><span class="spinner small"></span> Rechargement et mesure du code utilisé…</div>';
    try {
      const list = await api.invoke('lab:coverage', { wcId: lab.wcId });
      const tot = list.reduce((a, x) => a + x.total, 0);
      const unused = list.reduce((a, x) => a + (x.total - x.used), 0);
      body.innerHTML = `<section class="au-cat"><h3>Code inutilisé au chargement<small>${fmtBytes(unused)} sur ${fmtBytes(tot)} (${tot ? Math.round((unused / tot) * 100) : 0} %)</small></h3>
        <p class="bl-hint">Code téléchargé mais jamais exécuté (JavaScript) ou jamais appliqué (CSS) pendant le chargement. Il peut servir plus tard (clic, autre page), mais c’est un bon candidat au découpage et au chargement à la demande.</p>
        <div class="au-cov">${list.slice(0, 80).map((x) => `<div class="au-cov-row"><span class="t">${x.type.toUpperCase()}</span><span class="u" title="${esc(x.url)}">${esc(x.url.split('/').pop().split('?')[0] || x.url)}</span><span class="n">${fmtBytes(x.total - x.used)} inutilisés</span><span class="bar"><i style="width:${((x.used / x.total) * 100).toFixed(1)}%"></i></span><b>${Math.round(((x.total - x.used) / x.total) * 100)} %</b></div>`).join('')}</div></section>`;
    } catch (e) {
      body.innerHTML = `<p class="bl-err">${esc(e.message)}</p>`;
    } finally { btn.disabled = false; }
  }

  report() {
    const r = this.result;
    const rows = r.checks.map((c) => `<tr class="${c.level}"><td>${CATS[c.cat] || c.cat}</td><td>${{ error: 'Erreur', warn: 'À améliorer', info: 'Conseil', pass: 'OK' }[c.level]}</td><td><b>${esc(c.title)}</b>${c.detail ? `<br><small>${esc(c.detail)}</small>` : ''}</td></tr>`).join('');
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Audit · ${esc(r.url)}</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:980px;margin:32px auto;padding:0 16px;color:#1d1d1f}h1{font-size:22px}table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #eee;padding:8px;vertical-align:top}tr.error td:nth-child(2){color:#d70015}tr.warn td:nth-child(2){color:#b25000}tr.pass td:nth-child(2){color:#248a3d}small{color:#666}.s{display:flex;gap:16px;margin:16px 0}.s div{padding:10px 14px;border-radius:10px;background:#f5f5f7}</style></head><body>
      <h1>Audit de ${esc(r.title || r.url)}</h1><p>${esc(r.url)} · ${r.date.toLocaleString('fr-FR')} · NEX-AUDIT</p>
      <div class="s">${Object.entries(CATS).map(([k, l]) => `<div>${l}<br><b>${this.score(k) ?? '–'}</b></div>`).join('')}</div>
      <table>${rows}</table></body></html>`;
  }

  async onClick(e) {
    const a = e.target.closest('[data-act]');
    if (a) {
      if (a.dataset.act === 'run') { a.disabled = true; try { await this.run(); } catch (err) { toast(err.message, { kind: 'bad' }); } finally { a.disabled = false; } }
      if (a.dataset.act === 'coverage') this.coverage(a);
      if (a.dataset.act === 'export' && this.result) {
        let name = 'audit';
        try { name = `audit-${new URL(this.result.url).host}`; } catch { /* nom par défaut */ }
        const f = await api.invoke('lab:save-text', { name: `${name}.html`, text: this.report(), filters: [{ name: 'Rapport HTML', extensions: ['html'] }] });
        if (f) toast('Rapport enregistré.', { action: 'Ouvrir', onAction: () => api.invoke('lab:open-path', f) });
      }
      return;
    }
    if (e.target.matches('[data-opt="reload"]')) { this.reload = e.target.checked; return; }
    const cat = e.target.closest('[data-cat]');
    if (cat && this.result) { this.renderBody(this.filter === cat.dataset.cat ? null : cat.dataset.cat); this.filter = this.filter === cat.dataset.cat ? null : cat.dataset.cat; return; }
    const show = e.target.closest('[data-show]');
    if (show && this.lab.wv) {
      this.lab.wv.executeJavaScript(`(() => { const el = document.querySelector(${JSON.stringify(show.dataset.show)}); if (!el) return false; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); const o = el.style.outline; const oo = el.style.outlineOffset; el.style.outline = '3px solid #ff3b30'; el.style.outlineOffset = '2px'; setTimeout(() => { el.style.outline = o; el.style.outlineOffset = oo; }, 2200); return true; })()`).catch(() => {});
    }
  }
}
