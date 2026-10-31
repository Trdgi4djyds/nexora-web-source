/* Espace Sécurité : audit défensif de TON site (lecture seule). Analyse les en-têtes, le TLS, les cookies,
 * le contenu et les fichiers sensibles exposés, classe les constats par gravité et propose la correction —
 * avec l'aide de l'IA configurée pour générer la configuration serveur (nginx, Apache, Node…). */
import { api } from '../core/api.js';
import { S } from '../core/state.js';
import { $, esc, bus } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { settings, persist } from '../core/settings.js';
import { toast } from '../core/ui.js';

// Serveurs d'envoi courants : un choix remplit le serveur et le port.
const SMTP_PRESETS = {
  custom: { label: 'Fournisseur : autre (saisie manuelle)' },
  gmail: { label: 'Gmail', host: 'smtp.gmail.com', port: 587 },
  outlook: { label: 'Outlook / Hotmail / Microsoft 365', host: 'smtp.office365.com', port: 587 },
  yahoo: { label: 'Yahoo Mail', host: 'smtp.mail.yahoo.com', port: 465 },
  zoho: { label: 'Zoho Mail', host: 'smtp.zoho.com', port: 465 },
  ovh: { label: 'OVH', host: 'ssl0.ovh.net', port: 465 },
  hostinger: { label: 'Hostinger', host: 'smtp.hostinger.com', port: 465 },
  brevo: { label: 'Brevo (Sendinblue)', host: 'smtp-relay.brevo.com', port: 587 },
};

const SEV = {
  critical: ['Critique', '#ff3b30'], high: ['Élevé', '#ff6b00'], medium: ['Moyen', '#ff9f0a'], low: ['Faible', '#ffd60a'], info: ['Info', '#8e8e93'],
};
const CATS = ['Transport', 'En-têtes', 'Cookies', 'Contenu', 'Fichiers exposés', 'Divulgation', 'Bonnes pratiques'];

class Security {
  constructor(el) {
    this.el = el;
    this.report = null;
    this.scanning = false;
    this.tab = 'audit';
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('submit', (e) => { e.preventDefault(); if (this.tab === 'audit') this.scan(); });
    this.el.addEventListener('change', (e) => this.onChange(e));
    bus.on('source', () => { if (!this.el.hidden && this.tab === 'audit' && !this.report) this.renderInput(); });
    api.on('mon:update', () => { if (this.tab === 'supervision' && !this.el.hidden) this.refreshMonitor(); });
    api.on('mon:errors', () => { if (this.tab === 'supervision' && !this.el.hidden) this.refreshMonitor(); });
    // « il y a N s » reste juste entre deux mesures.
    setInterval(() => { if (this.tab === 'supervision' && !this.el.hidden) this.refreshMonitor(); }, 15000);
    this.render();
  }

  resume() { if (this.tab === 'audit' && !this.report) this.renderInput(); else if (this.tab === 'supervision') this.renderMonitor(); }

  siteUrl() { return S.baseUrl || (S.source && S.source.url) || (settings.secLastUrl || ''); }

  render() {
    this.el.innerHTML = `<div class="sec">
      <header class="sec-head">
        <div><h1>${icon('shield', 22)} Sécurité &amp; supervision</h1><p>Pour <b>tes propres sites</b> : audit de sécurité en lecture seule, et surveillance en continu avec alertes. Aucune attaque — NEXORA lit comme un visiteur et t’explique quoi corriger.</p></div>
      </header>
      <div class="seg wide sec-tabs">
        <button data-sec-tab="audit" class="${this.tab === 'audit' ? 'on' : ''}">${icon('shield', 14)}<span>Audit de sécurité</span></button>
        <button data-sec-tab="supervision" class="${this.tab === 'supervision' ? 'on' : ''}">${icon('bolt', 14)}<span>Supervision &amp; alertes</span></button>
      </div>
      <form class="sec-bar" ${this.tab === 'supervision' ? 'hidden' : ''}><span class="sec-ico">${icon('globe', 15)}</span><input class="input" data-sec-url placeholder="https://ton-site.com" spellcheck="false"><button class="btn primary" data-sec="scan">${icon('search', 14)}<span>Analyser</span></button></form>
      <div class="sec-body"></div>
    </div>`;
    if (this.tab === 'audit') this.renderInput(); else this.renderMonitor();
  }

  switchTab(t) { this.tab = t; this.render(); }

  renderInput() {
    const inp = $('[data-sec-url]', this.el);
    if (inp && document.activeElement !== inp) inp.value = this.siteUrl();
    if (this.report) { this.renderReport(); return; }
    $('.sec-body', this.el).innerHTML = `<div class="sec-empty">${icon('shield', 34)}
      <b>Vérifie la sécurité de ton site</b>
      <p>Colle l’adresse de ton site (ou ouvre-le dans le Responsive Lab) puis clique sur Analyser. NEXORA vérifie une trentaine de points de sécurité et te donne, pour chacun, l’explication et la correction à appliquer sur ton serveur.</p>
      <div class="sec-chips">${['En-têtes de sécurité', 'Certificat TLS', 'Cookies', 'Contenu mixte', 'Fichiers .env / .git exposés', 'Clickjacking', 'Divulgation de version'].map((x) => `<span>${esc(x)}</span>`).join('')}</div>
    </div>`;
  }

  async scan() {
    if (this.scanning) return;
    let url = ($('[data-sec-url]', this.el).value || '').trim();
    if (!url) { toast('Indique l’adresse de ton site.', { kind: 'bad' }); return; }
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    settings.secLastUrl = url; persist();
    this.scanning = true;
    const body = $('.sec-body', this.el);
    body.innerHTML = `<div class="sec-prog"><div class="spinner"></div><b data-sec-step>Analyse en cours…</b><div class="st-prog"><i></i></div></div>`;
    const off = api.on('sec:progress', (p) => { const b = $('[data-sec-step]', this.el); if (b) b.textContent = p.label; const i = $('.sec-prog .st-prog i', this.el); if (i) i.style.width = `${Math.round((p.progress || 0) * 100)}%`; });
    try {
      // Analyse de sécurité et relevé des erreurs de la page, en parallèle.
      const [rep, pe] = await Promise.all([api.invoke('sec:scan', { url }), api.invoke('sec:page-errors', { url }).catch(() => null)]);
      this.report = rep;
      this.pageErr = pe;
      this.renderReport();
      this.renderPageHealth();
    } catch (e) { body.innerHTML = `<div class="sec-empty"><b class="bad">${esc(e.message || String(e))}</b><p>Vérifie l’adresse, ou que le site est bien en ligne.</p></div>`; } finally { off(); this.scanning = false; }
  }

  // Santé de la page : erreurs JavaScript, ressources en échec, temps de chargement.
  renderPageHealth() {
    const r = this.pageErr;
    const sum = $('.sec-summary', this.el);
    if (!r || !sum) return;
    const nErr = r.errors.length + r.failed.length + (r.mainFail ? 1 : 0) + (r.crashed ? 1 : 0);
    const html = `<section class="sec-health ${nErr ? 'bad' : 'ok'}">
      <div class="sec-health-h">${icon(nErr ? 'warn' : 'pass', 16)}<b>Santé de la page</b>
        <span class="sec-badge" style="--c:${nErr ? '#ff3b30' : '#30d158'}">${r.errors.length} erreur(s) JS</span>
        <span class="sec-badge" style="--c:${r.failed.length ? '#ff9f0a' : '#30d158'}">${r.failed.length} ressource(s) en échec</span>
        <span class="sec-badge" style="--c:#8e8e93">chargée en ${Math.round(r.loadMs / 100) / 10} s</span></div>
      <div class="sec-health-list">${this.errPanelHtml(r, -1).replace(/<div class="mon-errhead">[\s\S]*?<\/div>/, '')}</div>
      <p class="pop-note">Pour être prévenu dès qu’une erreur apparaît, ajoute ce site dans « Supervision » et coche « Erreurs de la page ».</p>
    </section>`;
    sum.insertAdjacentHTML('afterend', html);
  }

  ring(score) {
    const col = score >= 85 ? '#30d158' : score >= 60 ? '#ff9f0a' : '#ff3b30';
    return `<div class="sec-ring" style="--p:${score};--c:${col}"><span>${score}<small>/100</small></span></div>`;
  }

  renderReport() {
    const r = this.report;
    const body = $('.sec-body', this.el);
    const grade = r.score >= 90 ? 'A' : r.score >= 80 ? 'B' : r.score >= 65 ? 'C' : r.score >= 50 ? 'D' : r.score >= 30 ? 'E' : 'F';
    const byCat = {};
    for (const f of r.findings) (byCat[f.cat] = byCat[f.cat] || []).push(f);
    const counts = r.counts;
    body.innerHTML = `
      <div class="sec-summary">
        ${this.ring(r.score)}
        <div class="sec-sum-txt">
          <h2>Note ${grade} · ${r.host}${r.isLocal ? ' <small>(local)</small>' : ''}</h2>
          <div class="sec-counts">${['critical', 'high', 'medium', 'low', 'info'].map((s) => counts[s] ? `<span class="sec-badge" style="--c:${SEV[s][1]}">${counts[s]} ${SEV[s][0].toLowerCase()}</span>` : '').join('')}${r.findings.filter((f) => f.sev !== 'info').length === 0 ? '<span class="sec-badge" style="--c:#30d158">Aucun problème</span>' : ''}</div>
          <div class="sec-actions"><button class="btn small" data-sec="rescan">${icon('sync', 13)}<span>Réanalyser</span></button><button class="btn small" data-sec="ai-all">${icon('sparkle', 13)}<span>Tout corriger avec l’IA</span></button><button class="btn small" data-sec="export">${icon('download', 13)}<span>Rapport</span></button></div>
        </div>
      </div>
      <div class="sec-list">
        ${CATS.filter((c) => byCat[c]).map((c) => `<div class="sec-cat"><h3>${esc(c)} <small>${byCat[c].length}</small></h3>${byCat[c].map((f, i) => this.findingHtml(c, i, f)).join('')}</div>`).join('')}
      </div>`;
  }

  findingHtml(cat, i, f) {
    const id = `${cat}:${i}`;
    return `<div class="sec-find ${f.sev}" data-find="${esc(id)}">
      <div class="sec-find-h"><span class="sec-sev" style="--c:${SEV[f.sev][1]}">${SEV[f.sev][0]}</span><b>${esc(f.title)}</b></div>
      <p>${esc(f.detail)}</p>
      ${f.fix ? `<div class="sec-fix">${icon('wrench', 13)}<span><b>Correction :</b> ${esc(f.fix)}</span></div>` : ''}
      ${f.sev !== 'info' ? `<div class="sec-find-act"><button class="btn small" data-sec-ai="${esc(id)}">${icon('sparkle', 12)}<span>Config serveur avec l’IA</span></button></div><div class="sec-ai-out" hidden></div>` : ''}
    </div>`;
  }

  findingByKey(key) {
    const [cat, i] = key.split(':');
    return this.report.findings.filter((f) => f.cat === cat)[Number(i)];
  }

  async onClick(e) {
    const tab = e.target.closest('[data-sec-tab]');
    if (tab) { this.switchTab(tab.dataset.secTab); return; }
    const b = e.target.closest('[data-sec]');
    if (b) {
      if (b.dataset.sec === 'scan' || b.dataset.sec === 'rescan') this.scan();
      if (b.dataset.sec === 'export') this.export();
      if (b.dataset.sec === 'ai-all') this.aiFix(null, b);
      return;
    }
    const ai = e.target.closest('[data-sec-ai]');
    if (ai) { this.aiFix(ai.dataset.secAi, ai); return; }
    const mo = e.target.closest('[data-mon]');
    if (mo) this.monAction(mo.dataset.mon, mo);
  }

  // Lit tous les champs des canaux depuis le formulaire (aucune saisie perdue avant « Tester »).
  readChannels() {
    const ch = { ...(this.mon.channels || {}) };
    for (const inp of this.el.querySelectorAll('[data-mon-ch]')) {
      const [grp, key] = inp.dataset.monCh.split('|');
      ch[grp] = { ...(ch[grp] || {}), [key]: inp.value.trim() };
    }
    this.mon.channels = ch;
    return ch;
  }

  onChange(e) {
    const pre = e.target.closest('[data-mon-preset]');
    if (pre) {
      const p = SMTP_PRESETS[pre.value];
      if (p && p.host) {
        this.el.querySelector('[data-mon-ch="email|host"]').value = p.host;
        this.el.querySelector('[data-mon-ch="email|port"]').value = String(p.port);
        api.invoke('mon:set-channels', this.readChannels());
      }
      return;
    }
    const f = e.target.closest('[data-mon-ep]');
    if (f) { const [i, key] = f.dataset.monEp.split('|'); this.mon.endpoints[Number(i)][key] = f.type === 'checkbox' ? f.checked : (f.type === 'number' ? Number(f.value) : f.value); this.saveEndpoints(); return; }
    const c = e.target.closest('[data-mon-ch]');
    if (c) { const [grp, key] = c.dataset.monCh.split('|'); this.mon.channels[grp] = this.mon.channels[grp] || {}; this.mon.channels[grp][key] = f && f.type === 'checkbox' ? f.checked : c.value.trim(); api.invoke('mon:set-channels', this.mon.channels); }
  }

  // ------------------------------------------------------------------ supervision
  async renderMonitor() {
    if (!this.mon) this.mon = (await api.invoke('mon:config')) || { endpoints: [], channels: {} };
    const sum = await api.invoke('mon:summary');
    const ch = this.mon.channels || {};
    const chStatus = (g) => (g === 'telegram' ? (ch.telegram && ch.telegram.token && ch.telegram.chatId) : g === 'email' ? (ch.email && ch.email.host && ch.email.to) : (ch.whatsapp && ch.whatsapp.phone && ch.whatsapp.apikey));
    const body = $('.sec-body', this.el);
    const cur = this.siteUrl();
    body.innerHTML = `
      <section class="mon-sites">
        <div class="mon-h"><b>Sites surveillés</b>${sum.some((s) => s.enabled !== false) ? '<span class="mon-live" title="Les mesures arrivent en direct"><i></i>En direct · <b></b></span>' : ''}<div class="mon-h-act">${cur ? `<button class="btn small" data-mon="add-current">${icon('plus', 13)}<span>Ajouter le site ouvert</span></button>` : ''}<button class="btn small" data-mon="add">${icon('plus', 13)}<span>Ajouter…</span></button></div></div>
        ${sum.length ? sum.map((s, i) => this.epCard(s, i)).join('') : '<p class="sec-mon-empty">Ajoute un site pour le surveiller en continu : disponibilité, temps de réponse et expiration du certificat, avec des alertes.</p>'}
      </section>
      <section class="mon-alerts">
        <div class="mon-h"><b>Alertes</b><small>Envoyées quand un site tombe, ralentit ou que son certificat expire. NEXORA doit rester ouverte.</small></div>
        <div class="mon-ch">
          <div class="mon-ch-card ${chStatus('telegram') ? 'on' : ''}">
            <div class="mon-ch-h">${icon('chat', 15)}<b>Telegram</b>${chStatus('telegram') ? `<span class="ab-okchip">${icon('check', 11)} prêt</span>` : ''}</div>
            <input class="input" data-mon-ch="telegram|token" value="${esc(ch.telegram && ch.telegram.token || '')}" placeholder="Jeton du bot : 123456789:AAH…" spellcheck="false">
            <input class="input" data-mon-ch="telegram|chatId" value="${esc(ch.telegram && ch.telegram.chatId || '')}" placeholder="Ton identifiant : 123456789" spellcheck="false">
            <button class="btn small" data-mon="test-telegram">${icon('bell', 12)}<span>Tester</span></button>
            <div class="mon-ch-res" data-res="telegram"></div>
            <ol class="mon-steps"><li>Dans Telegram, écris à <b>@BotFather</b> : <code>/newbot</code> → copie le jeton.</li><li>Ouvre ton nouveau bot et appuie sur <b>Démarrer</b>.</li><li>Écris à <b>@userinfobot</b> → copie ton identifiant (nombre).</li></ol>
          </div>
          <div class="mon-ch-card ${chStatus('email') ? 'on' : ''}">
            <div class="mon-ch-h">${icon('mail', 15)}<b>E-mail</b>${chStatus('email') ? `<span class="ab-okchip">${icon('check', 11)} prêt</span>` : ''}</div>
            <select class="input" data-mon-preset>${Object.entries(SMTP_PRESETS).map(([k, p]) => `<option value="${k}" ${ch.email && ch.email.host === p.host ? 'selected' : ''}>${p.label}</option>`).join('')}</select>
            <div class="mon-grid2"><input class="input" data-mon-ch="email|host" value="${esc(ch.email && ch.email.host || '')}" placeholder="Serveur SMTP" spellcheck="false"><input class="input" data-mon-ch="email|port" value="${esc(ch.email && ch.email.port || '587')}" placeholder="Port (587 ou 465)"></div>
            <div class="mon-grid2"><input class="input" data-mon-ch="email|user" value="${esc(ch.email && ch.email.user || '')}" placeholder="Ton adresse e-mail" spellcheck="false"><input class="input" type="password" data-mon-ch="email|pass" value="${esc(ch.email && ch.email.pass || '')}" placeholder="Mot de passe d’application"></div>
            <input class="input" data-mon-ch="email|to" value="${esc(ch.email && ch.email.to || '')}" placeholder="Destinataire(s), séparés par des virgules" spellcheck="false">
            <button class="btn small" data-mon="test-email">${icon('bell', 12)}<span>Tester</span></button>
            <div class="mon-ch-res" data-res="email"></div>
            <p class="pop-note">Gmail, Outlook, Yahoo refusent ton mot de passe habituel : crée un <b>mot de passe d’application</b>. <button class="link-btn small" data-external="https://myaccount.google.com/apppasswords">Gmail</button></p>
          </div>
          <div class="mon-ch-card ${chStatus('whatsapp') ? 'on' : ''}">
            <div class="mon-ch-h">${icon('chat', 15)}<b>WhatsApp</b>${chStatus('whatsapp') ? `<span class="ab-okchip">${icon('check', 11)} prêt</span>` : ''}</div>
            <input class="input" data-mon-ch="whatsapp|phone" value="${esc(ch.whatsapp && ch.whatsapp.phone || '')}" placeholder="Ton numéro : +229 97 00 00 00">
            <input class="input" data-mon-ch="whatsapp|apikey" value="${esc(ch.whatsapp && ch.whatsapp.apikey || '')}" placeholder="Clé API WhatsApp" spellcheck="false">
            <button class="btn small" data-mon="test-whatsapp">${icon('bell', 12)}<span>Tester</span></button>
            <div class="mon-ch-res" data-res="whatsapp"></div>
            <ol class="mon-steps"><li>Ajoute le contact du service d’alerte gratuit et envoie-lui « I allow callmebot to send me messages ».</li><li>Tu reçois ta clé par WhatsApp en une à deux minutes. <button class="link-btn small" data-external="https://callmebot.com/blog/free-api-whatsapp-messages">Numéro du service</button></li></ol>
          </div>
        </div>
      </section>
      <section class="mon-load">
        <div class="mon-h"><b>Test de charge</b><small>Simule des visiteurs simultanés pour mesurer la tenue de ton site.</small></div>
        <div class="mon-load-ctl">
          <label class="field"><span>Adresse</span><input class="input" data-lt="url" value="${esc(cur)}" placeholder="https://ton-site.com"></label>
          <label class="field"><span>Visiteurs simultanés</span><input class="input" type="number" data-lt="vus" value="10" min="1" max="500"></label>
          <label class="field"><span>Durée</span><select class="input" data-lt="duration"><option value="20s">20 s</option><option value="30s" selected>30 s</option><option value="1m">1 min</option><option value="3m">3 min</option></select></label>
          <button class="btn primary" data-mon="loadtest">${icon('bolt', 14)}<span>Lancer</span></button>
        </div>
        <div class="mon-load-out"></div>
      </section>
      <section class="mon-export">
        <div class="mon-h"><b>Supervision avancée (serveur)</b><small>Un tableau de bord à héberger toi-même pour suivre tes sites en continu.</small></div>
        <p class="pop-note">NEXORA génère une configuration prête à déployer, avec un fichier d’instructions pas à pas pour la lancer sur ton serveur.</p>
        <button class="btn small" data-mon="export-stack">${icon('download', 13)}<span>Générer la configuration de supervision</span></button>
      </section>`;
  }

  sparkHtml(s) {
    const arr = s.spark || [];
    const max = Math.max(1, ...arr.filter((x) => x > 0));
    return arr.map((v) => { const h = v < 0 ? 100 : Math.max(8, Math.round((v / max) * 100)); return `<i style="height:${h}%;background:${v < 0 ? '#ff3b30' : 'var(--accent)'}"></i>`; }).join('');
  }

  errBadge(s) {
    if (!s.watchErrors) return '';
    if (!s.errors) return `<span class="mon-err wait" title="Première vérification des erreurs en attente">${icon('warn', 11)} …</span>`;
    const n = s.errors.js + s.errors.failed;
    return `<button class="mon-err ${n ? 'bad' : 'ok'}" data-mon="errors|${s.__i}" title="Erreurs JavaScript et ressources en échec (dernier relevé)">${icon(n ? 'warn' : 'check', 11)} ${n ? `${s.errors.js} JS · ${s.errors.failed} échec(s)` : '0 erreur'}</button>`;
  }

  lastAgo(s) {
    if (!s.last || !s.last.at) return '';
    const sec = Math.round((Date.now() - s.last.at) / 1000);
    return sec < 60 ? `il y a ${sec} s` : `il y a ${Math.round(sec / 60)} min`;
  }

  epCard(s, i) {
    s.__i = i;
    const up = s.last ? s.last.up : null;
    const dot = up == null ? '#8e8e93' : up ? '#30d158' : '#ff3b30';
    const spark = this.sparkHtml(s);
    return `<div class="mon-ep">
      <div class="mon-ep-top">
        <span class="mon-dot" style="background:${dot}"></span>
        <div class="mon-ep-id"><input class="mon-name" data-mon-ep="${i}|name" value="${esc(s.name || '')}" placeholder="Nom"><input class="mon-url" data-mon-ep="${i}|url" value="${esc(s.url || '')}" placeholder="https://…"></div>
        <div class="mon-ep-stat">
          <span title="Disponibilité">${s.uptime != null ? `${s.uptime}%` : '—'}</span>
          <span title="Temps de réponse moyen">${s.avg != null ? `${s.avg} ms` : '—'}</span>
          ${s.certDays != null ? `<span title="Expiration du certificat" class="${s.certDays < 15 ? 'bad' : ''}">${icon('lock', 11)} ${s.certDays} j</span>` : ''}
          <span class="mon-errslot">${this.errBadge(s)}</span>
          <span class="mon-ago" title="Dernière vérification">${this.lastAgo(s)}</span>
        </div>
        <label class="mon-sw" title="Activer"><input type="checkbox" data-mon-ep="${i}|enabled" ${s.enabled !== false ? 'checked' : ''}><span></span></label>
        <button class="icon-btn small" data-mon="check|${i}" title="Vérifier maintenant">${icon('sync', 13)}</button>
        <button class="icon-btn small" data-mon="del|${i}" title="Retirer">${icon('trash', 13)}</button>
      </div>
      <div class="mon-spark">${spark || '<span class="pop-note">Pas encore de mesure</span>'}</div>
      <div class="mon-ep-opt">
        <label>Intervalle <select class="input" data-mon-ep="${i}|intervalSec"><option value="30" ${s.intervalSec == 30 ? 'selected' : ''}>30 s (temps réel)</option><option value="60" ${s.intervalSec == 60 ? 'selected' : ''}>1 min</option><option value="300" ${!s.intervalSec || s.intervalSec == 300 ? 'selected' : ''}>5 min</option><option value="900" ${s.intervalSec == 900 ? 'selected' : ''}>15 min</option></select></label>
        <label>Seuil lenteur (ms) <input class="input" type="number" data-mon-ep="${i}|thresholdMs" value="${s.thresholdMs || 2000}" min="200" step="100"></label>
        <label>Mot-clé attendu <input class="input" data-mon-ep="${i}|keyword" value="${esc(s.keyword || '')}" placeholder="(facultatif)"></label>
        <label class="mon-chk" title="Charge la page dans un navigateur caché (au plus toutes les 5 min) et relève les erreurs JavaScript et les ressources en échec"><input type="checkbox" data-mon-ep="${i}|watchErrors" ${s.watchErrors ? 'checked' : ''}> Erreurs de la page</label>
        ${s.last && !s.last.up ? `<span class="mon-reason">${esc(s.last.reason || '')}</span>` : ''}
      </div>
      <div class="mon-errpanel" data-errpanel="${i}" hidden></div>
    </div>`;
  }

  // Détail des erreurs relevées sur la page (JavaScript, avertissements, ressources en échec).
  errPanelHtml(r, i) {
    if (!r) return '<p class="pop-note">Aucun relevé pour l’instant.</p>';
    const when = new Date(r.at).toLocaleTimeString('fr-FR');
    const row = (cls, ic, main, sub) => `<div class="mon-erow ${cls}">${icon(ic, 12)}<div><b>${esc(main)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div></div>`;
    const short = (u) => { try { const x = new URL(u); return x.pathname.length > 1 ? x.pathname : x.host; } catch { return u; } };
    return `<div class="mon-errhead"><b>Relevé de ${when}</b><span>chargement ${Math.round(r.loadMs / 100) / 10} s</span><button class="btn small" data-mon="errcheck|${i}">${icon('sync', 12)}<span>Revérifier</span></button></div>
      ${r.mainFail ? row('bad', 'warn', 'La page n’a pas pu se charger', r.mainFail) : ''}
      ${r.crashed ? row('bad', 'warn', 'La page a planté', String(r.crashed)) : ''}
      ${r.errors.map((e) => row('bad', 'warn', e.message, `${e.source ? short(e.source) : ''}${e.line ? `:${e.line}` : ''}${e.count > 1 ? ` · ×${e.count}` : ''}`)).join('')}
      ${r.failed.map((f) => row('bad', 'warn', `${f.status ? `HTTP ${f.status}` : f.error} — ${short(f.url)}`, f.type || '')).join('')}
      ${r.warnings.slice(0, 8).map((e) => row('warn', 'info', e.message, e.source ? short(e.source) : '')).join('')}
      ${!r.mainFail && !r.crashed && !r.errors.length && !r.failed.length ? row('ok', 'check', 'Aucune erreur JavaScript ni ressource en échec', r.warnings.length ? `${r.warnings.length} avertissement(s) mineur(s)` : '') : ''}`;
  }

  async refreshMonitor() {
    if (this.tab !== 'supervision') return;
    const sum = await api.invoke('mon:summary');
    // Mise à jour légère : seulement les pastilles et stats (sans reconstruire les champs en cours d'édition).
    sum.forEach((s, i) => {
      const card = this.el.querySelectorAll('.mon-ep')[i];
      if (!card) return;
      const up = s.last ? s.last.up : null;
      const dot = card.querySelector('.mon-dot'); if (dot) dot.style.background = up == null ? '#8e8e93' : up ? '#30d158' : '#ff3b30';
      const stats = card.querySelectorAll('.mon-ep-stat span');
      if (stats[0]) stats[0].textContent = s.uptime != null ? `${s.uptime}%` : '—';
      if (stats[1]) stats[1].textContent = s.avg != null ? `${s.avg} ms` : '—';
      s.__i = i;
      const sp = card.querySelector('.mon-spark'); if (sp && s.spark && s.spark.length) sp.innerHTML = this.sparkHtml(s);
      const es = card.querySelector('.mon-errslot'); if (es) es.innerHTML = this.errBadge(s);
      const ag = card.querySelector('.mon-ago'); if (ag) ag.textContent = this.lastAgo(s);
    });
    const live = this.el.querySelector('.mon-live b'); if (live) live.textContent = new Date().toLocaleTimeString('fr-FR');
  }

  saveEndpoints() { clearTimeout(this._saveT); this._saveT = setTimeout(() => api.invoke('mon:set-endpoints', this.mon.endpoints).then((c) => { this.mon = c; }), 500); }

  async monAction(a, btn) {
    const [cmd, arg] = a.split('|');
    if (cmd === 'add' || cmd === 'add-current') {
      const url = cmd === 'add-current' ? this.siteUrl() : '';
      this.mon.endpoints.push({ id: Math.random().toString(36).slice(2, 9), name: url ? (() => { try { return new URL(url).host; } catch { return 'Site'; } })() : 'Nouveau site', url, intervalSec: 300, thresholdMs: 2000, enabled: true });
      this.mon = await api.invoke('mon:set-endpoints', this.mon.endpoints);
      this.renderMonitor();
    } else if (cmd === 'del') {
      this.mon.endpoints.splice(Number(arg), 1);
      this.mon = await api.invoke('mon:set-endpoints', this.mon.endpoints);
      this.renderMonitor();
    } else if (cmd === 'check') {
      await api.invoke('mon:check-now', this.mon.endpoints[Number(arg)].id);
      this.renderMonitor();
    } else if (cmd === 'errors' || cmd === 'errcheck') {
      const i = Number(arg);
      const panel = this.el.querySelector(`[data-errpanel="${i}"]`);
      if (!panel) return;
      if (cmd === 'errors' && !panel.hidden) { panel.hidden = true; return; }
      panel.hidden = false;
      const id = this.mon.endpoints[i].id;
      let r = cmd === 'errors' ? await api.invoke('mon:errors', id) : null;
      if (!r) {
        panel.innerHTML = '<div class="sec-ai-load"><span class="spinner small"></span> Chargement de la page et relevé des erreurs…</div>';
        r = await api.invoke('mon:check-errors', id).catch((err) => { panel.innerHTML = `<p class="bad">${esc(err.message)}</p>`; return undefined; });
        if (r === undefined) return;
      }
      panel.innerHTML = this.errPanelHtml(r, i);
      this.refreshMonitor();
    } else if (cmd.startsWith('test-')) {
      const chan = cmd.slice(5);
      await api.invoke('mon:set-channels', this.readChannels());
      const res = this.el.querySelector(`[data-res="${chan}"]`);
      if (res) { res.className = 'mon-ch-res busy'; res.innerHTML = '<span class="spinner small"></span> Envoi du test…'; }
      if (btn) btn.disabled = true;
      let r;
      try { r = await api.invoke('mon:test-alert', chan); } catch (err) { r = { ok: false, error: err.message }; } finally { if (btn) btn.disabled = false; }
      if (res) {
        res.className = `mon-ch-res ${r.ok ? 'ok' : 'bad'}`;
        res.innerHTML = r.ok ? `${icon('check', 12)} ${esc(r.note || 'Message de test envoyé : vérifie sa réception.')}` : `${icon('warn', 12)} ${esc(r.error)}`;
      } else toast(r.ok ? 'Alerte de test envoyée ✓' : `Échec : ${r.error}`, { kind: r.ok ? undefined : 'bad' });
    } else if (cmd === 'loadtest') {
      await this.loadTest(btn);
    } else if (cmd === 'export-stack') {
      const d = await api.invoke('mon:export-stack', { targets: this.mon.endpoints.map((e) => e.url).filter(Boolean) });
      if (d) toast('Configuration générée. Ouvre le fichier d’instructions (LISEZ-MOI) du dossier.');
    }
  }

  async loadTest(btn) {
    const url = $('[data-lt="url"]', this.el).value.trim();
    if (!url) { toast('Indique l’adresse à tester.', { kind: 'bad' }); return; }
    const vus = Number($('[data-lt="vus"]', this.el).value) || 10;
    const duration = $('[data-lt="duration"]', this.el).value;
    const out = $('.mon-load-out', this.el);
    out.innerHTML = `<div class="sec-ai-load"><span class="spinner small"></span> <span data-lt-step>Préparation du test de charge…</span></div>`;
    const off = api.on('mon:loadtest-progress', (p) => { const s = $('[data-lt-step]', this.el); if (s) s.textContent = p.label; });
    btn.disabled = true;
    try {
      const r = await api.invoke('mon:loadtest', { url: /^https?:/.test(url) ? url : `https://${url}`, vus, duration });
      out.innerHTML = `<div class="mon-load-res">
        <div class="mon-stat"><b>${r.rps}</b><small>requêtes/s</small></div>
        <div class="mon-stat"><b>${r.p95} ms</b><small>temps de réponse (p95)</small></div>
        <div class="mon-stat"><b>${r.avg} ms</b><small>moyen</small></div>
        <div class="mon-stat ${r.failRate > 1 ? 'bad' : ''}"><b>${r.failRate}%</b><small>erreurs</small></div>
        <div class="mon-stat"><b>${r.requests}</b><small>requêtes</small></div>
      </div><p class="pop-note">${r.failRate < 1 && r.p95 < 1000 ? 'Ton site tient bien la charge testée.' : r.failRate >= 5 ? 'Beaucoup d’erreurs : le site sature à cette charge.' : 'Temps de réponse élevé sous charge : pense à un cache ou à plus de ressources serveur.'}</p>`;
    } catch (e) { out.innerHTML = `<p class="bad">${esc(e.message || String(e))}</p>`; } finally { off(); btn.disabled = false; }
  }

  async aiFix(key, btn) {
    const ai = await import('../core/ai.js');
    if (!(await ai.aiReady())) { toast('Configure d’abord une IA (bouton IA en haut).'); ai.openAiSettings(); return; }
    const r = this.report;
    const items = key ? [this.findingByKey(key)] : r.findings.filter((f) => f.sev !== 'info');
    if (!items.length) return;
    const out = key ? btn.closest('.sec-find').querySelector('.sec-ai-out') : null;
    const target = out || (() => { const d = document.createElement('div'); d.className = 'sec-ai-global'; $('.sec-summary', this.el).after(d); return d; })();
    target.hidden = false;
    target.innerHTML = `<div class="sec-ai-load"><span class="spinner small"></span> L’IA prépare la configuration…</div>`;
    const list = items.map((f) => `- [${f.sev}] ${f.title} : ${f.detail} (correction attendue : ${f.fix})`).join('\n');
    const system = 'Tu es un expert en sécurité web. On te donne les résultats d’un audit de sécurité d’un site. Donne la configuration serveur CONCRÈTE pour corriger chaque point, pour nginx ET Apache (.htaccess), et l’équivalent pour Node/Express quand c’est pertinent. Sois direct, en blocs de code copiables, en français, sans bla-bla. N’invente pas de failles : corrige uniquement les points listés.';
    const prompt = `Site : ${r.host}\nPoints à corriger :\n${list}`;
    let acc = '';
    try {
      await ai.aiChat({ messages: [{ role: 'user', content: prompt }], system, onChunk: (t) => { acc += t; target.innerHTML = `<div class="sec-ai-md">${renderMd(acc)}</div>`; } });
      target.innerHTML = `<div class="sec-ai-md">${renderMd(acc)}</div><div class="sec-find-act"><button class="btn small" data-copy="${esc(acc)}">${icon('copy', 12)}<span>Copier</span></button></div>`;
    } catch (err) { target.innerHTML = `<p class="bad">${esc(err.message || String(err))}</p>`; }
  }

  async export() {
    const r = this.report;
    const lines = [`Audit de sécurité — ${r.host}`, `Date : ${new Date(r.at).toLocaleString('fr-FR')}`, `Note : ${r.score}/100`, ''];
    for (const f of r.findings) lines.push(`[${f.sev.toUpperCase()}] ${f.cat} — ${f.title}\n  ${f.detail}\n  Correction : ${f.fix}\n`);
    const f = await api.invoke('lab:save-text', { name: `Securite ${r.host}.txt`, text: lines.join('\n'), filters: [{ name: 'Texte', extensions: ['txt'] }] });
    if (f) toast('Rapport enregistré.', { action: 'Afficher', onAction: () => api.invoke('lab:reveal', f) });
  }

  pause() {}
}

// Mini-rendu Markdown (titres, code, listes, gras) pour la réponse de l'IA.
function renderMd(t) {
  const blocks = t.split(/```/);
  return blocks.map((b, i) => {
    if (i % 2) { const nl = b.indexOf('\n'); return `<pre class="sec-code">${esc(nl > 0 && nl < 20 ? b.slice(nl + 1) : b)}</pre>`; }
    return esc(b)
      .replace(/^### (.*)$/gm, '<h4>$1</h4>').replace(/^## (.*)$/gm, '<h3>$1</h3>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/^[-*] (.*)$/gm, '• $1')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }).join('');
}

export function openSecurity(el) {
  if (!S.security) S.security = new Security(el);
  else S.security.resume();
  return S.security;
}
