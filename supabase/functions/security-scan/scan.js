// Port de src/security.js (application NEXORA) pour Supabase Edge Functions (Deno).
/* Audit de sécurité défensif d'un site : analyse en lecture seule (aucune attaque, aucune injection) des
 * en-têtes HTTP, du TLS, des cookies, du contenu de la page et de la présence de fichiers sensibles exposés.
 * Même approche que securityheaders.com, Mozilla Observatory ou l'analyse passive d'OWASP ZAP. Destiné à
 * vérifier et renforcer TES propres sites. Renvoie des constats classés par gravité, avec l'explication et la
 * correction à appliquer. */
import tls from 'node:tls';

const SEV = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

function headersToObj(h) {
  const o = {};
  if (!h) return o;
  if (typeof h.forEach === 'function') h.forEach((v, k) => { o[k.toLowerCase()] = v; });
  else for (const k of Object.keys(h)) o[k.toLowerCase()] = h[k];
  return o;
}

// Certificat TLS : validité, autorité, expiration (connexion en lecture seule).
function tlsInfo(host, port = 443, timeout = 8000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (!done) { done = true; try { socket.end(); } catch { /* fermé */ } resolve(r); } };
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout }, () => {
      const cert = socket.getPeerCertificate();
      const authorized = socket.authorized;
      const proto = socket.getProtocol();
      const days = cert && cert.valid_to ? Math.round((new Date(cert.valid_to) - Date.now()) / 86400000) : null;
      finish({
        ok: true, authorized, authorizationError: socket.authorizationError ? String(socket.authorizationError) : '', protocol: proto, daysLeft: days, issuer: cert && cert.issuer ? (cert.issuer.O || cert.issuer.CN || '') : '', validTo: cert && cert.valid_to, subject: cert && cert.subject ? (cert.subject.CN || '') : '',
      });
    });
    socket.on('error', (e) => finish({ ok: false, error: String(e.message || e) }));
    socket.on('timeout', () => finish({ ok: false, error: 'délai dépassé' }));
  });
}

const SENSITIVE = [
  ['/.env', 'critical', 'Fichier de configuration .env', 'Variables d’environnement (mots de passe, clés d’API) accessibles publiquement.'],
  ['/.git/config', 'critical', 'Dépôt Git exposé (.git)', 'Tout le code source et son historique peuvent être téléchargés.'],
  ['/.git/HEAD', 'critical', 'Dépôt Git exposé (.git/HEAD)', 'Le dépôt Git est accessible : code source récupérable.'],
  ['/.svn/entries', 'high', 'Dépôt SVN exposé', 'Code source récupérable via .svn.'],
  ['/wp-config.php.bak', 'critical', 'Sauvegarde de configuration WordPress', 'Identifiants de base de données exposés.'],
  ['/config.php.bak', 'high', 'Sauvegarde de configuration', 'Un fichier de configuration de secours est accessible.'],
  ['/.env.local', 'critical', 'Fichier .env.local', 'Secrets de développement exposés.'],
  ['/backup.zip', 'high', 'Archive de sauvegarde', 'Une sauvegarde complète du site est téléchargeable.'],
  ['/backup.sql', 'critical', 'Export de base de données', 'Une base de données SQL est téléchargeable.'],
  ['/dump.sql', 'critical', 'Export de base de données', 'Une base de données SQL est téléchargeable.'],
  ['/.DS_Store', 'low', 'Fichier .DS_Store', 'Révèle la liste des fichiers du dossier (macOS).'],
  ['/phpinfo.php', 'medium', 'phpinfo() exposé', 'Révèle la configuration complète du serveur PHP.'],
  ['/server-status', 'medium', 'Apache server-status', 'État et requêtes du serveur exposés.'],
  ['/.well-known/security.txt', 'info', 'security.txt présent', 'Bon point : un contact sécurité est publié.', true],
  ['/robots.txt', 'info', 'robots.txt', 'Présent (information).', true],
];

async function probe(fetchImpl, base, pathname, { len = 400, method = 'GET', headers } = {}) {
  try {
    const u = new URL(pathname, base).href;
    const r = await fetchImpl(u, { method, redirect: 'manual', headers });
    const body = r.status === 200 || r.status >= 400 ? (await r.text().catch(() => '')).slice(0, len) : '';
    return { status: r.status, body, headers: headersToObj(r.headers) };
  } catch { return { status: 0, body: '', headers: {} }; }
}

// Le serveur accepte-t-il encore une poignée de main TLS 1.0 / 1.1 ? (vérification de configuration, sans
// échange de données). Une impossibilité côté client donne « non » : jamais de faux positif.
function acceptsOldTls(host, port = 443) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; try { s.destroy(); } catch { /* */ } resolve(v); } };
    let s;
    try {
      s = tls.connect({
        host, port, servername: host, rejectUnauthorized: false, minVersion: 'TLSv1', maxVersion: 'TLSv1.1', ciphers: 'DEFAULT@SECLEVEL=0', timeout: 6000,
      }, () => fin(s.getProtocol()));
    } catch { resolve(null); return; }
    s.on('error', () => fin(null)); s.on('timeout', () => fin(null));
  });
}

// Pages d'erreur qui trahissent un mode « debug » laissé actif en production.
const DEBUG_MARKERS = /Traceback \(most recent call last\)|Stack trace:|Whoops, looks like something went wrong|DEBUG = True|Django Version|Laravel\b.*Exception|at Object\.<anonymous>|Exception in thread|Fatal error<\/b>:|Warning<\/b>:.*on line|ASP\.NET.*Version Information|SQLSTATE\[/i;

const ADMIN_PATHS = [
  ['/phpmyadmin/', 'medium', 'phpMyAdmin accessible publiquement', 'L’interface de gestion de la base de données est joignable depuis Internet.'],
  ['/adminer.php', 'medium', 'Adminer accessible publiquement', 'Un outil de gestion de base de données est joignable depuis Internet.'],
  ['/wp-login.php', 'info', 'Page de connexion WordPress publique', 'Cible fréquente des tentatives de connexion automatisées.'],
  ['/administrator/', 'info', 'Administration Joomla publique', 'Interface d’administration joignable depuis Internet.'],
  ['/admin/', 'info', 'Page /admin publique', 'Une interface d’administration semble joignable depuis Internet.'],
];

async function scan(url, { fetchImpl, page = null, onStep = () => {} } = {}) {
  const findings = [];
  const add = (sev, cat, title, detail, fix) => findings.push({
    sev, cat, title, detail, fix: fix || '',
  });
  let u;
  try { u = new URL(url); } catch { throw new Error('Adresse du site invalide.'); }
  const isLocal = /^(localhost|127\.|\[::1\]|0\.0\.0\.0|\d+\.\d+\.\d+\.\d+)/.test(u.hostname) || u.hostname.endsWith('.local') || u.hostname.endsWith('.vitrine') || u.hostname.endsWith('.nexora');
  const https = u.protocol === 'https:';
  let pageScripts = [];

  onStep({ label: 'Lecture des en-têtes', progress: 0.1 });
  let res;
  let H = {};
  try {
    res = await fetchImpl(u.href, { method: 'GET', redirect: 'follow' });
    H = headersToObj(res.headers);
  } catch (e) { throw new Error(`Le site n’a pas répondu : ${e.message || e}`); }

  // --- Transport (HTTPS / TLS) ---
  if (!https && !isLocal) add('high', 'Transport', 'Site en HTTP (non chiffré)', 'Les échanges ne sont pas chiffrés : mots de passe et données circulent en clair.', 'Installe un certificat TLS (Let’s Encrypt, gratuit) et force la redirection de http vers https.');
  if (https) {
    onStep({ label: 'Vérification du certificat', progress: 0.2 });
    const t = await tlsInfo(u.hostname, u.port ? Number(u.port) : 443);
    if (!t.ok) add('medium', 'Transport', 'Certificat TLS non vérifiable', t.error || '', 'Vérifie que le certificat est valide et bien installé.');
    else {
      if (!t.authorized) add('high', 'Transport', 'Certificat non fiable', t.authorizationError || 'Le certificat n’est pas validé par une autorité reconnue.', 'Utilise un certificat signé par une autorité reconnue (Let’s Encrypt).');
      if (t.daysLeft != null && t.daysLeft < 0) add('critical', 'Transport', 'Certificat expiré', `Expiré depuis ${-t.daysLeft} jour(s).`, 'Renouvelle le certificat immédiatement.');
      else if (t.daysLeft != null && t.daysLeft < 15) add('medium', 'Transport', 'Certificat bientôt expiré', `Expire dans ${t.daysLeft} jour(s).`, 'Renouvelle le certificat (automatise avec certbot).');
      if (t.protocol && /TLSv1(\.0|\.1)?$/.test(t.protocol)) add('medium', 'Transport', `Ancien protocole ${t.protocol}`, 'Une version ancienne de TLS est acceptée.', 'N’autorise que TLS 1.2 et TLS 1.3.');
      findings.tls = t;
    }
  }
  if (https && !isLocal) {
    const hsts = H['strict-transport-security'];
    if (!hsts) add('medium', 'En-têtes', 'HSTS absent (Strict-Transport-Security)', 'Le navigateur n’est pas forcé d’utiliser https.', 'Ajoute l’en-tête : Strict-Transport-Security: max-age=31536000; includeSubDomains');
    else if (!/max-age=\s*(\d+)/.test(hsts) || Number(/max-age=\s*(\d+)/.exec(hsts)[1]) < 15768000) add('low', 'En-têtes', 'HSTS avec une durée courte', `max-age trop faible : ${hsts}`, 'Mets max-age à au moins 31536000 (1 an).');
  }

  // --- En-têtes de sécurité (OWASP Secure Headers) ---
  onStep({ label: 'Analyse des en-têtes de sécurité', progress: 0.35 });
  const csp = H['content-security-policy'];
  if (!csp) add('high', 'En-têtes', 'Content-Security-Policy absente', 'Aucune politique de contenu : pas de protection contre les injections de scripts (XSS).', 'Ajoute une Content-Security-Policy. Commence par : default-src \'self\'; puis affine.');
  else {
    if (/unsafe-inline/.test(csp) && /script-src|default-src/.test(csp)) add('medium', 'En-têtes', 'CSP avec \'unsafe-inline\'', 'La politique autorise les scripts en ligne, ce qui réduit fortement la protection XSS.', 'Retire \'unsafe-inline\' des scripts (utilise des nonces ou des hash).');
    if (!/frame-ancestors/.test(csp) && !H['x-frame-options']) add('medium', 'En-têtes', 'Pas de protection contre le cadrage (clickjacking)', 'La page peut être intégrée dans un autre site via une iframe.', 'Ajoute frame-ancestors \'none\' à la CSP, ou X-Frame-Options: DENY.');
  }
  if (!H['x-content-type-options']) add('low', 'En-têtes', 'X-Content-Type-Options absent', 'Le navigateur peut deviner le type des fichiers (risque de confusion).', 'Ajoute : X-Content-Type-Options: nosniff');
  if (!H['x-frame-options'] && (!csp || !/frame-ancestors/.test(csp))) add('medium', 'En-têtes', 'X-Frame-Options absent', 'Risque de clickjacking (voir ci-dessus).', 'Ajoute : X-Frame-Options: DENY (ou SAMEORIGIN).');
  if (!H['referrer-policy']) add('low', 'En-têtes', 'Referrer-Policy absente', 'L’adresse complète de tes pages peut fuiter vers les sites externes.', 'Ajoute : Referrer-Policy: strict-origin-when-cross-origin');
  if (!H['permissions-policy']) add('low', 'En-têtes', 'Permissions-Policy absente', 'Les fonctions sensibles (caméra, micro, géolocalisation) ne sont pas restreintes.', 'Ajoute une Permissions-Policy, ex. : camera=(), microphone=(), geolocation=()');
  if (H['x-powered-by']) add('low', 'Divulgation', `Technologie révélée (X-Powered-By: ${H['x-powered-by']})`, 'Le serveur révèle la technologie employée, utile à un attaquant.', 'Supprime l’en-tête X-Powered-By.');
  if (H.server && /\d/.test(H.server)) add('low', 'Divulgation', `Version du serveur révélée (${H.server})`, 'La version exacte du serveur facilite la recherche de failles connues.', 'Masque la version du serveur (ServerTokens Prod sur Apache, server_tokens off sur nginx).');

  // --- Cookies ---
  const sc = (res.headers && typeof res.headers.getSetCookie === 'function') ? res.headers.getSetCookie() : (H['set-cookie'] ? [H['set-cookie']] : []);
  for (const c of sc) {
    const name = (c.split('=')[0] || '').trim();
    const flags = c.toLowerCase();
    const miss = [];
    if (https && !/;\s*secure/.test(flags)) miss.push('Secure');
    if (!/;\s*httponly/.test(flags)) miss.push('HttpOnly');
    if (!/;\s*samesite/.test(flags)) miss.push('SameSite');
    if (miss.length) add(miss.includes('HttpOnly') ? 'medium' : 'low', 'Cookies', `Cookie « ${name} » : attribut(s) manquant(s) ${miss.join(', ')}`, 'Un cookie mal protégé peut être volé (XSS) ou envoyé en clair.', `Ajoute les attributs ${miss.join(', ')} à ce cookie.`);
  }

  // --- Contenu de la page (via le navigateur si disponible) ---
  if (page) {
    onStep({ label: 'Analyse du contenu de la page', progress: 0.55 });
    try {
      const info = await page.executeJavaScript(`(function(){
        const out = { mixed: [], extScripts: [], ownScripts: [], forms: [], generator: '' };
        const g = document.querySelector('meta[name="generator"]'); if (g) out.generator = g.content || '';
        const abs = (u) => { try { return new URL(u, location.href); } catch { return null; } };
        for (const el of document.querySelectorAll('script[src],link[href],img[src],iframe[src]')) {
          const v = el.getAttribute('src') || el.getAttribute('href'); if (!v) continue;
          const a = abs(v); if (a && location.protocol === 'https:' && a.protocol === 'http:') out.mixed.push(a.href);
          if (el.tagName === 'SCRIPT' && a && a.host !== location.host) out.extScripts.push({ src: a.href, host: a.host, sri: el.hasAttribute('integrity') });
          if (el.tagName === 'SCRIPT' && a && a.host === location.host && /\.m?js(\?|$)/.test(a.pathname + a.search)) out.ownScripts.push(a.pathname);
        }
        for (const f of document.querySelectorAll('form')) { const a = f.getAttribute('action')||''; const aa = abs(a||location.href); out.forms.push({ method:(f.getAttribute('method')||'get').toLowerCase(), action: aa?aa.href:'', http: aa && aa.protocol==='http:' }); }
        return out;
      })()`).catch(() => null);
      if (info) {
        if (info.mixed.length) add('high', 'Contenu', `${info.mixed.length} ressource(s) en HTTP sur une page HTTPS (contenu mixte)`, 'Des fichiers chargés en clair cassent la sécurité de la page.', 'Charge toutes les ressources en https.');
        const noSri = info.extScripts.filter((s) => !s.sri);
        if (noSri.length) add('low', 'Contenu', `${noSri.length} script(s) externe(s) sans intégrité (SRI)`, 'Si le serveur externe est compromis, du code malveillant s’exécute sur ton site.', 'Ajoute l’attribut integrity (SRI) aux scripts externes, ou héberge-les toi-même.');
        if (info.forms.some((f) => f.http)) add('high', 'Contenu', 'Formulaire envoyé en HTTP', 'Des données de formulaire partent en clair.', 'Change l’action du formulaire pour une adresse https.');
        if (info.generator) add('info', 'Divulgation', `Technologie révélée (meta generator: ${info.generator})`, 'La page indique l’outil qui l’a générée.', 'Supprime la balise meta generator si ce n’est pas nécessaire.');
        const hosts = [...new Set(info.extScripts.map((s) => s.host))];
        if (hosts.length) add('info', 'Contenu', `${hosts.length} fournisseur(s) de scripts externes`, `Scripts chargés depuis : ${hosts.slice(0, 8).join(', ')}${hosts.length > 8 ? '…' : ''}. Chacun peut exécuter du code sur ton site.`, 'Garde uniquement les fournisseurs indispensables et protège-les par SRI ou une CSP.');
        pageScripts = [...new Set(info.ownScripts)].slice(0, 5);
      }
    } catch { /* page non analysable */ }
  }

  // --- Tests de sécurité avancés (lecture seule, aucun envoi de données malveillantes) ---
  onStep({ label: 'Tests avancés : redirection, CORS, méthodes, TLS', progress: 0.62 });
  if (https && !isLocal) {
    const h = await probe(fetchImpl, `http://${u.host}`, '/');
    const loc = h.headers.location || '';
    if (h.status === 200) add('medium', 'Transport', 'Le site reste accessible en HTTP', 'La version non chiffrée répond directement au lieu de rediriger vers https.', 'Ajoute une redirection permanente (301) de http vers https.');
    else if (h.status >= 300 && h.status < 400 && !/^https:/i.test(loc)) add('low', 'Transport', 'Redirection HTTP vers une adresse non chiffrée', `Redirige vers ${loc || '?'}.`, 'Fais pointer la redirection directement vers https.');
    const old = await acceptsOldTls(u.hostname, Number(u.port) || 443);
    if (old) add('medium', 'Transport', `Ancien protocole accepté (${old})`, 'Le serveur accepte encore TLS 1.0/1.1, abandonnés par les navigateurs et vulnérables.', 'Désactive TLS 1.0 et 1.1 : ssl_protocols TLSv1.2 TLSv1.3; (nginx) ou SSLProtocol -all +TLSv1.2 +TLSv1.3 (Apache).');
  }
  // CORS : une origine inventée est-elle renvoyée telle quelle ?
  const fake = 'https://nexora-cors-check.invalid';
  const c = await probe(fetchImpl, u.origin, u.pathname || '/', { headers: { Origin: fake } });
  const acao = c.headers['access-control-allow-origin'] || '';
  const acac = /true/i.test(c.headers['access-control-allow-credentials'] || '');
  if (acao === fake) add(acac ? 'high' : 'medium', 'En-têtes', `CORS accepte n’importe quelle origine${acac ? ' avec identifiants' : ''}`, acac ? 'Un autre site peut lire les réponses de ton site au nom de l’utilisateur connecté (vol de données).' : 'Le serveur renvoie l’origine reçue sans la vérifier.', 'N’autorise que tes propres domaines dans Access-Control-Allow-Origin (liste blanche).');
  else if (acao === '*' && acac) add('low', 'En-têtes', 'CORS « * » combiné aux identifiants', 'Configuration incohérente : les navigateurs la refusent, mais elle signale une politique trop large.', 'Remplace « * » par la liste de tes domaines.');
  // Méthodes annoncées (requête OPTIONS, aucune écriture).
  const o = await probe(fetchImpl, u.origin, '/', { method: 'OPTIONS' });
  const allow = `${o.headers.allow || ''},${o.headers['access-control-allow-methods'] || ''}`.toUpperCase();
  if (/\bTRACE\b/.test(allow)) add('medium', 'Configuration', 'Méthode TRACE activée', 'Permet de renvoyer les en-têtes de la requête (Cross-Site Tracing).', 'Désactive TRACE : TraceEnable off (Apache) ; nginx la refuse par défaut.');
  const write = ['PUT', 'DELETE', 'PATCH'].filter((m) => new RegExp(`\\b${m}\\b`).test(allow));
  if (write.length && o.headers.allow) add('low', 'Configuration', `Méthodes d’écriture annoncées à la racine (${write.join(', ')})`, 'La racine du site déclare accepter des méthodes de modification.', 'Limite ces méthodes aux seules routes d’API qui en ont besoin, avec authentification.');
  // Page d'erreur : une adresse inexistante révèle-t-elle des détails techniques ?
  onStep({ label: 'Tests avancés : pages d’erreur et sources', progress: 0.68 });
  const e404 = await probe(fetchImpl, u.origin, `/nexora-check-${Date.now().toString(36)}`, { len: 6000 });
  if (DEBUG_MARKERS.test(e404.body)) add('medium', 'Divulgation', 'Pages d’erreur détaillées (mode debug)', 'Une erreur affiche des détails internes (pile d’appels, versions, requêtes SQL) utiles à un attaquant.', 'Désactive le mode debug en production et affiche une page d’erreur générique.');
  // Source maps : le code source d'origine est-il téléchargeable ?
  for (const p of pageScripts) {
    // eslint-disable-next-line no-await-in-loop
    const m = await probe(fetchImpl, u.origin, `${p}.map`, { len: 300 });
    if (m.status === 200 && /"sources"\s*:|"mappings"\s*:/.test(m.body)) {
      add('medium', 'Divulgation', 'Source maps publiques (code source lisible)', `${p}.map est téléchargeable : le code d’origine, commentaires compris, est lisible.`, 'Ne publie pas les fichiers .map en production (ou restreins-en l’accès).');
      break;
    }
  }
  // Interfaces d'administration joignables publiquement.
  for (const [p, sev, title, detail] of ADMIN_PATHS) {
    // eslint-disable-next-line no-await-in-loop
    const a = await probe(fetchImpl, u.origin, p, { len: 2000 });
    if (a.status === 200 && /<form|password|mot de passe|login|connexion/i.test(a.body)) add(sev, 'Exposition', title, detail, 'Restreins l’accès (liste d’adresses IP, VPN ou authentification forte à deux facteurs).');
  }

  // --- Fichiers sensibles exposés (requêtes GET en lecture seule) ---
  onStep({ label: 'Recherche de fichiers sensibles exposés', progress: 0.72 });
  let done = 0;
  for (const [p, sev, title, detail, good] of SENSITIVE) {
    // eslint-disable-next-line no-await-in-loop
    const r = await probe(fetchImpl, u.origin, p);
    done += 1;
    onStep({ label: 'Recherche de fichiers sensibles exposés', progress: 0.72 + 0.2 * (done / SENSITIVE.length) });
    const present = r.status === 200;
    if (good) { if (present && sev === 'info') add('info', 'Bonnes pratiques', title, detail); continue; }
    // Git/env : confirmer que c'est bien le fichier (éviter une page d'erreur 200).
    if (present) {
      if (p.includes('.git') && !/ref:|^[0-9a-f]{7,}/m.test(r.body) && !/\[core\]|repositoryformatversion/.test(r.body)) continue;
      if (p === '/.env' && !/=|^[A-Z_]+=/m.test(r.body)) continue;
      add(sev, 'Fichiers exposés', `${title} accessible (${p})`, detail, `Bloque l’accès à ${p} (règle serveur) et retire ce fichier de la racine publique.`);
    }
  }

  // --- Directory listing ---
  const dir = await probe(fetchImpl, u.origin, '/');
  if (/<title>Index of \/|Directory listing for/i.test(dir.body)) add('medium', 'Fichiers exposés', 'Listing de répertoire activé', 'Les visiteurs peuvent parcourir l’arborescence des fichiers.', 'Désactive le listing (Options -Indexes sur Apache, autoindex off sur nginx).');

  findings.sort((a, b) => SEV[b.sev] - SEV[a.sev]);
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.sev] += 1;
  // Note /100 : pénalités par gravité.
  let score = 100 - (counts.critical * 25 + counts.high * 12 + counts.medium * 6 + counts.low * 2);
  score = Math.max(0, Math.min(100, score));
  onStep({ label: 'Terminé', progress: 1 });
  return {
    url: u.href, host: u.hostname, isLocal, https, score, counts, findings: findings.slice(), tls: findings.tls || null, at: Date.now(),
  };
}

export { scan };
