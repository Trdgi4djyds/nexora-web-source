/* Scripts exécutés dans la page affichée : technologies, audit, source, ressources. */
(function () {
  // ---------------------------------------------------------------- technologies utilisées par le site
  function detectTech() {
    const out = [];
    const add = (name, category, version) => { if (!out.some((t) => t.name === name)) out.push({ name, category, version: version || '' }); };
    const q = (s) => { try { return document.querySelector(s); } catch { return null; } };
    const scripts = Array.from(document.scripts).map((s) => s.src || '').join(' ');
    const gen = (q('meta[name="generator"]') || {}).content || '';
    const w = window;

    const roots = [document.getElementById('root'), document.getElementById('app'), document.getElementById('__next'), document.body].filter(Boolean);
    const hasReactKey = roots.some((el) => Object.keys(el).some((k) => k.startsWith('__reactContainer') || k.startsWith('__reactFiber')))
      || Array.from(document.body ? document.body.querySelectorAll('*') : []).slice(0, 300).some((el) => Object.keys(el).some((k) => k.startsWith('__reactFiber')));
    if (w.React || hasReactKey || q('[data-reactroot]')) add('React', 'Bibliothèque d\'interface', w.React && w.React.version);
    if (w.__NEXT_DATA__ || w.next || q('#__next') || /\/_next\//.test(scripts)) add('Next.js', 'Framework', w.next && w.next.version);
    if (w.__remixContext) add('Remix', 'Framework');
    if (w.__reactRouterContext) add('React Router', 'Framework');
    if (q('#___gatsby')) add('Gatsby', 'Framework');
    if (w.__NUXT__ || w.useNuxtApp || q('#__nuxt')) add('Nuxt', 'Framework');
    if (w.Vue || q('[data-v-app]') || roots.some((el) => el.__vue_app__)) add('Vue', 'Bibliothèque d\'interface', w.Vue && w.Vue.version);
    const ng = q('[ng-version]');
    if (ng) add('Angular', 'Framework', ng.getAttribute('ng-version'));
    if (q('[class*="svelte-"]')) add('Svelte', 'Bibliothèque d\'interface');
    if (Array.from(document.scripts).some((s) => /__sveltekit/.test(s.textContent || '')) || q('[data-sveltekit-preload-data]')) add('SvelteKit', 'Framework');
    if (q('astro-island') || /astro/i.test(gen)) add('Astro', 'Framework');
    if (w._$HY) add('Solid', 'Bibliothèque d\'interface');
    if (q('[q\\:container]')) add('Qwik', 'Framework');
    if (q('flt-glass-pane') || q('flutter-view') || w._flutter || /flutter/.test(scripts)) add('Flutter (web)', 'Framework');
    if (w.jQuery) add('jQuery', 'Bibliothèque JavaScript', w.jQuery.fn && w.jQuery.fn.jquery);
    if (/wordpress/i.test(gen) || /\/wp-content\//.test(document.documentElement.innerHTML.slice(0, 200000))) add('WordPress', 'Gestion de contenu', (gen.match(/WordPress\s*([\d.]+)/i) || [])[1]);
    if (w.Shopify) add('Shopify', 'Boutique en ligne');
    if (/wix/i.test(gen) || w.wixBiSession) add('Wix', 'Créateur de sites');
    if (document.documentElement.getAttribute('data-wf-site')) add('Webflow', 'Créateur de sites');
    if (/framer/i.test(gen) || q('#__framer-badge-container')) add('Framer', 'Créateur de sites');
    if (/squarespace/i.test(gen) || w.Static && w.Static.SQUARESPACE_CONTEXT) add('Squarespace', 'Créateur de sites');
    if (/figma/i.test(gen) || /figma/.test(scripts)) add('Figma Sites', 'Créateur de sites');
    if (/@vite\/client/.test(scripts)) add('Vite (serveur de développement)', 'Outil de build');
    if (Object.keys(w).some((k) => k.startsWith('webpackChunk'))) add('Webpack', 'Outil de build');

    let cssText = '';
    try {
      for (const sheet of Array.from(document.styleSheets).slice(0, 30)) {
        let rules = [];
        try { rules = sheet.cssRules; } catch { continue; }
        for (let i = 0; i < Math.min(rules.length, 1500); i++) cssText += rules[i].cssText;
        if (cssText.length > 400000) break;
      }
    } catch { /* feuilles inaccessibles */ }
    if (/--tw-/.test(cssText)) add('Tailwind CSS', 'Styles');
    if (/bootstrap/i.test(Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((l) => l.href).join(' ')) || w.bootstrap || /--bs-/.test(cssText)) add('Bootstrap', 'Styles');
    if (q('link[href*="fonts.googleapis.com"]') || /fonts\.googleapis/.test(cssText)) add('Google Fonts', 'Polices');
    if (w.gtag || w.dataLayer || /googletagmanager|google-analytics/.test(scripts)) add('Google Analytics / Tag Manager', 'Mesure d\'audience');
    if (w.fbq) add('Meta Pixel', 'Publicité');
    if (q('link[rel="manifest"]')) add('Application web progressive (manifeste)', 'PWA');
    if (navigator.serviceWorker && navigator.serviceWorker.controller) add('Service worker actif', 'PWA');
    if (gen && !out.some((t) => gen.toLowerCase().includes(t.name.toLowerCase()))) add(gen, 'Générateur');
    return out;
  }

  // ---------------------------------------------------------------- audit de la page
  async function audit() {
    const checks = [];
    const add = (c) => checks.push({ samples: [], count: 0, ...c });
    // En émulation mobile, innerWidth s'élargit au contenu qui déborde : on prend la largeur de l'écran.
    const std = document.compatMode === 'CSS1Compat';
    const vw = std ? document.documentElement.clientWidth : window.innerWidth;
    const vh = std ? document.documentElement.clientHeight : window.innerHeight;
    const touch = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;

    const visible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      const st = getComputedStyle(el);
      return st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05;
    };
    const cssPath = (el) => {
      if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id) && document.querySelectorAll(`#${el.id}`).length === 1) return `#${el.id}`;
      const parts = [];
      while (el && el.nodeType === 1 && el !== document.documentElement && parts.length < 10) {
        const p = el.parentElement;
        if (!p) break;
        const same = Array.prototype.filter.call(p.children, (c) => c.tagName === el.tagName);
        parts.unshift(`${el.tagName.toLowerCase()}${same.length > 1 ? `:nth-of-type(${same.indexOf(el) + 1})` : ''}`);
        if (p.id && /^[a-zA-Z][\w-]*$/.test(p.id)) { parts.unshift(`#${p.id}`); break; }
        el = p;
      }
      return parts.join(' > ');
    };
    const label = (el) => {
      const t = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('alt') || el.getAttribute('title') || el.getAttribute('src') || el.tagName).trim().replace(/\s+/g, ' ');
      return `<${el.tagName.toLowerCase()}> ${t.slice(0, 60)}`;
    };
    const sample = (els, n = 8) => els.slice(0, n).map((el) => ({ selector: cssPath(el), text: label(el) }));
    const all = Array.from(document.body ? document.body.querySelectorAll('*') : []);

    // ----- Affichage sur l'appareil
    const vp = document.querySelector('meta[name="viewport"]');
    if (!vp) add({ id: 'viewport', cat: 'responsive', level: touch ? 'error' : 'warn', title: 'Balise viewport absente', detail: 'Sans <meta name="viewport" content="width=device-width, initial-scale=1">, les téléphones affichent la page en version ordinateur, en tout petit.' });
    else if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/.test(vp.content)) add({ id: 'zoom', cat: 'responsive', level: 'warn', title: 'Zoom bloqué', detail: 'La balise viewport empêche de zoomer, ce qui gêne les personnes malvoyantes.' });
    else add({ id: 'viewport', cat: 'responsive', level: 'pass', title: 'Balise viewport présente' });

    const doc = document.scrollingElement || document.documentElement;
    if (doc.scrollWidth > vw + 1) {
      const over = all.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.right > vw + 1 && r.width > 0 && getComputedStyle(el).position !== 'fixed';
      });
      const top = over.filter((el) => !over.includes(el.parentElement));
      add({
        id: 'overflow', cat: 'responsive', level: 'error', title: `La page déborde de ${doc.scrollWidth - vw} px en largeur`, detail: 'Un ou plusieurs éléments dépassent la largeur de l\'écran : la page défile horizontalement.', count: top.length, samples: sample(top),
      });
    } else add({ id: 'overflow', cat: 'responsive', level: 'pass', title: 'Aucun débordement horizontal' });

    const textEls = all.filter((el) => el.childNodes.length && Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 1));
    const small = textEls.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 12 && visible(el));
    if (small.length) add({ id: 'small-text', cat: 'responsive', level: touch ? 'warn' : 'info', title: `${small.length} texte${small.length > 1 ? 's' : ''} en dessous de 12 px`, detail: 'Les textes trop petits sont difficiles à lire sur téléphone.', count: small.length, samples: sample(small) });

    if (touch) {
      const interactive = Array.from(document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [onclick]')).filter(visible);
      const tiny = interactive.filter((el) => { const r = el.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width < 32 || r.height < 32;
      });
      if (tiny.length) add({ id: 'tap', cat: 'responsive', level: 'warn', title: `${tiny.length} zone${tiny.length > 1 ? 's' : ''} tactile${tiny.length > 1 ? 's' : ''} trop petite${tiny.length > 1 ? 's' : ''}`, detail: 'Boutons et liens de moins de 32 px de côté : difficiles à toucher du doigt (Apple recommande 44 px).', count: tiny.length, samples: sample(tiny) });
      else add({ id: 'tap', cat: 'responsive', level: 'pass', title: 'Zones tactiles de taille correcte' });
    }

    const imgs = Array.from(document.images);
    const wideImgs = imgs.filter((im) => im.getBoundingClientRect().width > vw + 1);
    if (wideImgs.length) add({ id: 'wide-img', cat: 'responsive', level: 'warn', title: `${wideImgs.length} image${wideImgs.length > 1 ? 's' : ''} plus large${wideImgs.length > 1 ? 's' : ''} que l'écran`, detail: 'Ajoute max-width: 100% et height: auto aux images.', count: wideImgs.length, samples: sample(wideImgs) });

    // ----- Accessibilité
    const noAlt = imgs.filter((im) => !im.hasAttribute('alt'));
    if (noAlt.length) add({ id: 'alt', cat: 'a11y', level: 'error', title: `${noAlt.length} image${noAlt.length > 1 ? 's' : ''} sans texte alternatif`, detail: 'Ajoute un attribut alt décrivant l\'image (alt="" si elle est décorative).', count: noAlt.length, samples: sample(noAlt) });
    else if (imgs.length) add({ id: 'alt', cat: 'a11y', level: 'pass', title: 'Toutes les images ont un attribut alt' });

    const accName = (el) => (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || (el.innerText || '').trim() || Array.from(el.querySelectorAll('img[alt],svg title')).map((i) => i.getAttribute('alt') || i.textContent).join('').trim());
    const links = Array.from(document.querySelectorAll('a[href]')).filter(visible).filter((a) => !accName(a));
    if (links.length) add({ id: 'link-name', cat: 'a11y', level: 'error', title: `${links.length} lien${links.length > 1 ? 's' : ''} sans intitulé`, detail: 'Un lecteur d\'écran ne peut pas annoncer ces liens : ajoute un texte ou un aria-label.', count: links.length, samples: sample(links) });
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]')).filter(visible).filter((b) => !accName(b));
    if (buttons.length) add({ id: 'button-name', cat: 'a11y', level: 'error', title: `${buttons.length} bouton${buttons.length > 1 ? 's' : ''} sans intitulé`, detail: 'Ajoute un texte visible ou un aria-label aux boutons qui n\'ont qu\'une icône.', count: buttons.length, samples: sample(buttons) });

    const fields = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea')).filter(visible);
    const unlabeled = fields.filter((f) => !(f.labels && f.labels.length) && !f.getAttribute('aria-label') && !f.getAttribute('aria-labelledby') && !f.getAttribute('title'));
    if (unlabeled.length) add({ id: 'label', cat: 'a11y', level: 'warn', title: `${unlabeled.length} champ${unlabeled.length > 1 ? 's' : ''} de formulaire sans étiquette`, detail: 'Le placeholder ne remplace pas une étiquette : il disparaît dès que l\'on tape.', count: unlabeled.length, samples: sample(unlabeled) });

    if (!document.documentElement.getAttribute('lang')) add({ id: 'lang', cat: 'a11y', level: 'warn', title: 'Langue de la page non déclarée', detail: 'Ajoute lang="fr" sur la balise <html> pour que la synthèse vocale prononce correctement.' });

    const heads = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(visible);
    let prev = 0;
    const skipped = heads.filter((hd) => { const lvl = Number(hd.tagName[1]); const bad = prev && lvl > prev + 1; prev = lvl; return bad; });
    if (skipped.length) add({ id: 'headings', cat: 'a11y', level: 'info', title: 'Niveaux de titres sautés', detail: 'Par exemple un h4 juste après un h2. La hiérarchie des titres aide à la navigation au clavier et au lecteur d\'écran.', count: skipped.length, samples: sample(skipped) });

    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,/]+/).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] == null ? 1 : p[3] }; };
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const bgOf = (el) => {
      let n = el;
      while (n && n.nodeType === 1) {
        const st = getComputedStyle(n);
        if (st.backgroundImage && st.backgroundImage !== 'none') return null;
        const c = parse(st.backgroundColor);
        if (c && c.a > 0.95) return c;
        n = n.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const lowContrast = [];
    for (const el of textEls.slice(0, 600)) {
      if (!visible(el)) continue;
      const st = getComputedStyle(el);
      const fg = parse(st.color);
      const bg = bgOf(el);
      if (!fg || !bg || fg.a < 0.5) continue;
      const l1 = lum(fg); const l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const size = parseFloat(st.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(st.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) lowContrast.push(el);
    }
    if (lowContrast.length) add({ id: 'contrast', cat: 'a11y', level: 'warn', title: `${lowContrast.length} texte${lowContrast.length > 1 ? 's' : ''} peu contrasté${lowContrast.length > 1 ? 's' : ''}`, detail: 'Le contraste entre le texte et le fond est inférieur au minimum WCAG (4,5:1, ou 3:1 pour les grands textes).', count: lowContrast.length, samples: sample(lowContrast) });
    else add({ id: 'contrast', cat: 'a11y', level: 'pass', title: 'Contrastes des textes suffisants' });

    const ids = {};
    for (const el of document.querySelectorAll('[id]')) ids[el.id] = (ids[el.id] || 0) + 1;
    const dup = Object.keys(ids).filter((k) => ids[k] > 1);
    if (dup.length) add({ id: 'dup-id', cat: 'a11y', level: 'info', title: `${dup.length} identifiant${dup.length > 1 ? 's' : ''} en double`, detail: `Chaque id doit être unique : ${dup.slice(0, 6).join(', ')}.`, count: dup.length });

    // ----- Référencement
    const title = document.title.trim();
    if (!title) add({ id: 'title', cat: 'seo', level: 'error', title: 'Titre de page absent', detail: 'Ajoute une balise <title> : c\'est le titre affiché dans Google et dans l\'onglet.' });
    else if (title.length > 65) add({ id: 'title', cat: 'seo', level: 'info', title: `Titre long (${title.length} caractères)`, detail: 'Google coupe généralement les titres au-delà de 60 caractères environ.' });
    else add({ id: 'title', cat: 'seo', level: 'pass', title: `Titre : « ${title} »` });
    const desc = document.querySelector('meta[name="description"]');
    if (!desc || !desc.content.trim()) add({ id: 'description', cat: 'seo', level: 'warn', title: 'Description absente', detail: 'Ajoute <meta name="description"> : c\'est le texte affiché sous le titre dans les résultats de recherche.' });
    else add({ id: 'description', cat: 'seo', level: 'pass', title: 'Description présente' });
    const h1 = document.querySelectorAll('h1').length;
    if (!h1) add({ id: 'h1', cat: 'seo', level: 'warn', title: 'Aucun titre principal (h1)', detail: 'Chaque page devrait avoir un titre h1 qui résume son contenu.' });
    else if (h1 > 1) add({ id: 'h1', cat: 'seo', level: 'info', title: `${h1} titres h1`, detail: 'Un seul h1 par page est recommandé.' });
    if (!document.querySelector('meta[property="og:title"]') || !document.querySelector('meta[property="og:image"]')) add({ id: 'og', cat: 'seo', level: 'info', title: 'Aperçu de partage incomplet', detail: 'Ajoute og:title et og:image pour un bel aperçu sur WhatsApp, Facebook et LinkedIn.' });
    const robots = document.querySelector('meta[name="robots"]');
    if (robots && /noindex/i.test(robots.content)) add({ id: 'noindex', cat: 'seo', level: 'warn', title: 'Page exclue des moteurs de recherche', detail: 'La balise robots contient noindex.' });
    if (!document.querySelector('link[rel~="icon"]')) add({ id: 'favicon', cat: 'seo', level: 'info', title: 'Icône de site (favicon) absente' });

    // ----- Performance
    const nav = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource');
    const fcp = (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime;
    const lcp = await new Promise((resolve) => {
      let last = 0;
      try {
        const po = new PerformanceObserver((list) => { for (const e of list.getEntries()) last = e.startTime; });
        po.observe({ type: 'largest-contentful-paint', buffered: true });
        setTimeout(() => { po.disconnect(); resolve(last || null); }, 250);
      } catch { resolve(null); }
    });
    const cls = await new Promise((resolve) => {
      let total = 0;
      try {
        const po = new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) total += e.value; });
        po.observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => { po.disconnect(); resolve(total); }, 250);
      } catch { resolve(null); }
    });
    const bytes = res.reduce((s, e) => s + (e.transferSize || e.encodedBodySize || 0), nav ? (nav.transferSize || 0) : 0);
    const metrics = {
      fcp: fcp || null, lcp, cls, load: nav ? nav.loadEventEnd - nav.startTime : null, dcl: nav ? nav.domContentLoadedEventEnd - nav.startTime : null,
      bytes, requests: res.length + 1, dom: all.length,
    };
    if (lcp != null) {
      if (lcp > 4000) add({ id: 'lcp', cat: 'perf', level: 'error', title: `Affichage du contenu principal lent (${(lcp / 1000).toFixed(1)} s)`, detail: 'Le plus grand élément visible apparaît après 4 s. Objectif : moins de 2,5 s.' });
      else if (lcp > 2500) add({ id: 'lcp', cat: 'perf', level: 'warn', title: `Contenu principal en ${(lcp / 1000).toFixed(1)} s`, detail: 'Objectif : moins de 2,5 s.' });
      else add({ id: 'lcp', cat: 'perf', level: 'pass', title: `Contenu principal en ${(lcp / 1000).toFixed(1)} s` });
    }
    if (cls != null) {
      if (cls > 0.25) add({ id: 'cls', cat: 'perf', level: 'error', title: `La mise en page saute (CLS ${cls.toFixed(2)})`, detail: 'Des éléments bougent pendant le chargement. Réserve la place des images et des publicités (width et height).' });
      else if (cls > 0.1) add({ id: 'cls', cat: 'perf', level: 'warn', title: `Mise en page instable (CLS ${cls.toFixed(2)})`, detail: 'Objectif : moins de 0,1.' });
      else add({ id: 'cls', cat: 'perf', level: 'pass', title: `Mise en page stable (CLS ${cls.toFixed(2)})` });
    }
    if (bytes > 3e6) add({ id: 'weight', cat: 'perf', level: bytes > 6e6 ? 'error' : 'warn', title: `Page lourde : ${(bytes / 1e6).toFixed(1)} Mo transférés`, detail: 'Sur une connexion 3G, chaque Mo prend plusieurs secondes. Compresse les images et allège les scripts.' });
    const bigImgs = res.filter((e) => e.initiatorType === 'img' && (e.transferSize || e.encodedBodySize) > 300000);
    if (bigImgs.length) add({ id: 'big-img', cat: 'perf', level: 'warn', title: `${bigImgs.length} image${bigImgs.length > 1 ? 's' : ''} de plus de 300 Ko`, detail: 'Convertis-les en WebP ou AVIF et adapte leur taille à l\'écran.', count: bigImgs.length, samples: bigImgs.slice(0, 8).map((e) => ({ selector: `img[src="${new URL(e.name).pathname.split('/').pop()}"]`, text: `${e.name.split('/').pop().slice(0, 50)} (${Math.round((e.transferSize || e.encodedBodySize) / 1024)} Ko)`, url: e.name })) });
    const blocking = Array.from(document.head ? document.head.querySelectorAll('script[src]:not([async]):not([defer]):not([type="module"])') : []);
    if (blocking.length) add({ id: 'blocking', cat: 'perf', level: 'warn', title: `${blocking.length} script${blocking.length > 1 ? 's' : ''} bloquant${blocking.length > 1 ? 's' : ''} l'affichage`, detail: 'Ajoute defer ou async aux scripts du <head>.', count: blocking.length, samples: blocking.slice(0, 6).map((s) => ({ selector: '', text: s.src.split('/').pop() })) });
    if (all.length > 1500) add({ id: 'dom', cat: 'perf', level: all.length > 3000 ? 'warn' : 'info', title: `${all.length} éléments dans la page`, detail: 'Un DOM très grand ralentit l\'affichage et les interactions sur les téléphones modestes.' });
    const lazyMissing = imgs.filter((im) => im.getBoundingClientRect().top > vh * 1.5 && im.loading !== 'lazy');
    if (lazyMissing.length > 2) add({ id: 'lazy', cat: 'perf', level: 'info', title: `${lazyMissing.length} images hors écran chargées immédiatement`, detail: 'Ajoute loading="lazy" aux images situées plus bas dans la page.', count: lazyMissing.length, samples: sample(lazyMissing) });

    // ----- Sécurité et bonnes pratiques
    if (location.protocol === 'http:' && !/^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname)) add({ id: 'https', cat: 'best', level: 'error', title: 'Site non sécurisé (http)', detail: 'Passe le site en HTTPS : les navigateurs l\'affichent « Non sécurisé ».' });
    if (location.protocol === 'https:') {
      const mixed = res.filter((e) => e.name.startsWith('http:'));
      if (mixed.length) add({ id: 'mixed', cat: 'best', level: 'error', title: `${mixed.length} ressource${mixed.length > 1 ? 's' : ''} chargée${mixed.length > 1 ? 's' : ''} en http`, detail: 'Contenu mixte : ces fichiers peuvent être bloqués par le navigateur.', count: mixed.length, samples: mixed.slice(0, 6).map((e) => ({ selector: '', text: e.name })) });
    }
    if (location.protocol === 'https:') add({ id: 'https', cat: 'best', level: 'pass', title: 'Connexion sécurisée (HTTPS)' });
    else if (location.protocol === 'http:' && /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname)) add({ id: 'https', cat: 'best', level: 'pass', title: 'Serveur local : HTTPS non nécessaire' });
    if (!document.doctype) add({ id: 'doctype', cat: 'best', level: 'warn', title: 'Déclaration <!DOCTYPE html> absente', detail: 'Sans elle, le navigateur passe en mode de compatibilité et l\'affichage peut varier.' });
    else add({ id: 'doctype', cat: 'best', level: 'pass', title: 'Déclaration <!DOCTYPE html> présente' });
    if (!/utf-?8/i.test(document.characterSet)) add({ id: 'charset', cat: 'best', level: 'warn', title: `Encodage ${document.characterSet}`, detail: 'Utilise <meta charset="utf-8"> pour que les accents s\'affichent partout.' });
    else add({ id: 'charset', cat: 'best', level: 'pass', title: 'Encodage UTF-8' });
    const blankNoOpener = Array.from(document.querySelectorAll('a[target="_blank"]')).filter((a) => /^https?:/.test(a.href) && new URL(a.href).origin !== location.origin && !/noopener|noreferrer/.test(a.rel));
    if (blankNoOpener.length) add({ id: 'noopener', cat: 'best', level: 'info', title: `${blankNoOpener.length} lien${blankNoOpener.length > 1 ? 's' : ''} externe${blankNoOpener.length > 1 ? 's' : ''} sans rel="noopener"`, count: blankNoOpener.length, samples: sample(blankNoOpener) });
    else add({ id: 'noopener', cat: 'best', level: 'pass', title: 'Liens externes protégés' });

    return { checks, metrics, url: location.href, title: document.title, viewport: { w: vw, h: vh }, touch };
  }

  function pageSource() {
    return fetch(location.href, { cache: 'no-store', credentials: 'include' }).then((r) => r.text()).catch(() => document.documentElement.outerHTML);
  }
  function renderedDom() {
    return `<!DOCTYPE html>\n${document.documentElement.outerHTML}`;
  }
  function resources() {
    const nav = performance.getEntriesByType('navigation')[0];
    const list = performance.getEntriesByType('resource').map((e) => ({
      url: e.name, type: e.initiatorType, size: e.transferSize || e.encodedBodySize || 0, decoded: e.decodedBodySize || 0, duration: Math.round(e.duration),
    }));
    const scripts = Array.from(document.scripts).map((s) => s.src).filter(Boolean);
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((l) => l.href);
    for (const u of scripts.concat(styles)) if (!list.some((r) => r.url === u)) list.push({ url: u, type: scripts.includes(u) ? 'script' : 'link', size: 0, decoded: 0, duration: 0 });
    return { document: { url: location.href, size: nav ? nav.transferSize || nav.encodedBodySize : 0 }, list };
  }
  function fetchText(url) {
    return fetch(url, { cache: 'force-cache' }).then((r) => r.text());
  }

  const call = (fn, ...args) => `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`;

  // Notation d'une catégorie : 100 moins une pénalité par problème.
  function score(checks, cat) {
    const list = checks.filter((c) => c.cat === cat);
    if (!list.length) return null;
    let s = 100;
    for (const c of list) {
      if (c.level === 'error') s -= 18;
      else if (c.level === 'warn') s -= 8;
      else if (c.level === 'info') s -= 2;
    }
    return Math.max(0, Math.min(100, s));
  }

  window.VitrineAudit = {
    js: {
      tech: call(detectTech), audit: call(audit), source: call(pageSource), dom: call(renderedDom), resources: call(resources), fetchText: (u) => call(fetchText, u),
    },
    score,
  };
})();
