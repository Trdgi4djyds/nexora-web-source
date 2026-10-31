/* IA dans NEXORA : connexion des clés (réglages), assistant dans chaque espace, actions toutes faites
 * (expliquer ou corriger le code, rédiger une publicité, une présentation, une fiche Play Store…). */
import { api } from './api.js';
import { S } from './state.js';
import { settings, persist } from './settings.js';
import { $, esc, uid, bus } from './dom.js';
import { icon } from './icons.js';
import { openSheet, closeSheet, toast } from './ui.js';


let status = null;
const listeners = new Map();
api.on('ai:chunk', (m) => { const f = listeners.get(m.id); if (f) f(m.chunk); });

export async function aiStatus(force = false) {
  if (!status || force) {
    const r = await api.invoke('ai:status');
    status = r && !r.error ? r : { providers: {}, active: null };
  }
  return status;
}

export async function aiReady() {
  const st = await aiStatus();
  return Boolean(st.active && st.providers[st.active] && st.providers[st.active].connected);
}

// Envoie une conversation ; onChunk reçoit le texte au fil de l'eau.
export async function aiChat({ messages, system, onChunk, maxTokens, provider, model }) {
  const id = uid();
  let text = '';
  listeners.set(id, (c) => { text += c; if (onChunk) onChunk(c, text); });
  const p = api.invoke('ai:chat', {
    id, messages, system, maxTokens, provider, model,
  });
  const run = { id, cancel: () => api.invoke('ai:cancel', { id }) };
  run.done = p.then((r) => {
    listeners.delete(id);
    if (r && r.error) throw new Error(r.error);
    return r;
  });
  return run;
}

// ------------------------------------------------------------------ réglages
// Fenêtre en deux parties : la liste des fournisseurs (état de chacun) et la fiche du fournisseur choisi,
// en trois étapes (obtenir la clé, la coller, connecter). « Connecter » enregistre, lit les modèles, en
// choisit un, teste et active, en une fois. Sur un petit écran la liste passe au-dessus, en défilement.
const ORDER = ['gemini', 'groq', 'openrouter', 'mistral', 'ollama', 'anthropic', 'openai', 'deepseek', 'custom'];
let pickedProv = null;

function provState(st, p) {
  if (p.connected && st.active === p.id) return ['active', p.lastError ? 'Utilisée · erreur' : 'Utilisée'];
  if (p.connected) return ['on', p.lastError ? 'Erreur' : 'Connectée'];
  return ['off', 'Non configurée'];
}

export async function openAiSettings(focus) {
  let st = await aiStatus(true);
  if (focus) pickedProv = focus;
  if (!pickedProv || !st.providers[pickedProv]) pickedProv = st.active || 'gemini';
  let note = '';
  let noteKind = '';
  const render = () => {
    const P = st.providers;
    const p = P[pickedProv];
    const [cls] = provState(st, p);
    const models = p.models || [];
    return `
    <div class="sheet-head"><span class="sheet-icon">${icon('sparkle', 22)}</span><div><h2>Intelligence artificielle</h2><p>Connecte une ou plusieurs IA avec ta propre clé. L’IA active t’aide dans tous les espaces : code, textes, pages web, applications, scènes 3D et présentations.</p></div></div>
    <div class="ai-set2">
      <nav class="ai-plist" aria-label="Fournisseurs">${ORDER.filter((id) => P[id]).map((id) => { const x = P[id]; const [c, label] = provState(st, x); return `
        <button class="ai-pitem${id === pickedProv ? ' sel' : ''}" data-ai-pick="${id}" ${id === pickedProv ? 'data-autofocus' : ''}><i class="ai-dot ${c}${x.lastError ? ' err' : ''}"></i><span><b>${esc(x.label.split(' (')[0])}</b><small>${esc(x.free || label)}</small></span>${st.active === id && x.connected ? `<em class="ai-use">${icon('check', 11)}</em>` : ''}</button>`; }).join('')}</nav>
      <section class="ai-detail" data-prov="${p.id}">
        <header class="ai-dhead"><div><h3>${esc(p.label)}</h3><p>${esc(p.info || '')}</p></div>${p.free ? `<span class="ai-free">${esc(p.free)}</span>` : ''}</header>
        <ol class="ai-steps">
          ${p.keyless ? `
          <li><b>Installer Ollama</b><span>Gratuit, sur ce PC.</span><button class="btn small" data-ai-link="${esc(p.keyUrl)}">${icon('external', 13)}<span>Télécharger Ollama</span></button></li>
          <li><b>Activer</b><label class="check-row"><input type="checkbox" data-ai-enable ${p.connected ? 'checked' : ''}><span class="box"></span><span>Utiliser les modèles installés dans Ollama</span></label>
            <input class="input" data-ai-base placeholder="http://127.0.0.1:11434/v1" value="${esc(p.baseUrl)}"></li>` : `
          <li><b>Obtenir une clé</b>${p.keyUrl ? `<span>La page du fournisseur s’ouvre dans ton navigateur.</span><button class="btn small" data-ai-link="${esc(p.keyUrl)}">${icon('external', 13)}<span>Ouvrir la page des clés</span></button>` : '<span>Indique l’adresse du service puis sa clé.</span>'}</li>
          <li><b>Coller la clé</b>
            ${p.id === 'custom' ? `<input class="input" data-ai-base placeholder="https://mon-service/v1" value="${esc(p.baseUrl)}">` : ''}
            <input class="input" type="password" data-ai-key placeholder="${p.connected ? 'Clé enregistrée · colle une nouvelle clé pour la remplacer' : 'Colle ta clé API ici'}" autocomplete="off" spellcheck="false"></li>`}
          <li><b>Modèle</b>
            <div class="ai-model2">${models.length ? `<select class="input" data-ai-model><option value="">Choix automatique</option>${models.map((m) => `<option value="${esc(m)}" ${m === p.model ? 'selected' : ''}>${esc(m)}${/:free$/.test(m) ? ' (gratuit)' : ''}</option>`).join('')}</select>` : `<input class="input" data-ai-model placeholder="Choix automatique à la connexion" value="${esc(p.model)}">`}<button class="btn small" data-ai-act="models" title="Lire la liste des modèles du fournisseur">${icon('refreshCw', 13)}</button></div></li>
        </ol>
        <div class="ai-note ${noteKind || (p.lastError ? 'bad' : cls === 'off' ? '' : 'ok')}" data-ai-msg>${note ? esc(note) : p.lastError ? esc(p.lastError) : p.connected ? `${st.active === p.id ? 'IA active' : 'Connectée'} · modèle ${esc(p.model || 'automatique')}` : 'Pas encore connectée.'}</div>
        <div class="ai-dacts">
          <button class="btn primary" data-ai-act="connect">${icon('check', 14)}<span>${p.connected ? 'Enregistrer et tester' : 'Connecter'}</span></button>
          ${p.connected && st.active !== p.id ? `<button class="btn" data-ai-act="use">${icon('sparkle', 14)}<span>Utiliser cette IA</span></button>` : ''}
          <span class="grow"></span>
          ${p.connected ? `<button class="btn" data-ai-act="remove">${icon('trash', 14)}<span>Retirer</span></button>` : ''}
        </div>
      </section>
    </div>
    <div class="sheet-foot"><small class="muted">${st.encrypted ? 'Clés chiffrées par le système, envoyées uniquement au fournisseur choisi.' : 'Chiffrement du système indisponible : les clés restent dans ton dossier utilisateur.'} L’usage payant est facturé par le fournisseur.</small><span class="grow"></span><button class="btn primary" data-sheet="close">Terminé</button></div>`;
  };
  const sheet = openSheet('ai', render(), { wide: true });
  sheet.classList.add('ai-sheet');
  const rerender = () => {
    const list = sheet.querySelector('.ai-plist');
    const lt = list ? list.scrollTop : 0; const ll = list ? list.scrollLeft : 0;
    sheet.innerHTML = render();
    const l2 = sheet.querySelector('.ai-plist'); if (l2) { l2.scrollTop = lt; l2.scrollLeft = ll; }
  };
  sheet.refresh = rerender;
  sheet.onclick = async (e) => {
    const l = e.target.closest('[data-ai-link]');
    if (l) { api.invoke('shell:external', l.dataset.aiLink); return; }
    const pk = e.target.closest('[data-ai-pick]');
    if (pk) { pickedProv = pk.dataset.aiPick; note = ''; noteKind = ''; rerender(); return; }
    const b = e.target.closest('[data-ai-act]');
    if (!b) return;
    const box = sheet.querySelector('[data-prov]');
    const provider = box.dataset.prov;
    const msg = box.querySelector('[data-ai-msg]');
    const key = (box.querySelector('[data-ai-key]') || {}).value || '';
    const model = (box.querySelector('[data-ai-model]') || {}).value;
    const baseUrl = (box.querySelector('[data-ai-base]') || {}).value;
    const enabled = box.querySelector('[data-ai-enable]') ? box.querySelector('[data-ai-enable]').checked : undefined;
    const act = b.dataset.aiAct;
    const busy = (t) => { msg.className = 'ai-note busy'; msg.textContent = t; for (const x of box.querySelectorAll('button')) x.disabled = true; };
    try {
      if (act === 'connect') {
        busy('Connexion : enregistrement, lecture des modèles, test…');
        const r = await api.invoke('ai:connect', {
          provider, key: key || undefined, model: model || undefined, baseUrl, enabled,
        });
        if (r.error) { st = await aiStatus(true); throw new Error(r.error); }
        st = r.status; status = st;
        note = `Ça marche : « ${r.reply} » · modèle ${r.model}. Cette IA est maintenant active.`; noteKind = 'ok';
        rerender(); bus.emit('ai-changed'); return;
      }
      if (act === 'use') { st = await api.invoke('ai:active', { provider }); status = st; note = 'Cette IA est maintenant active.'; noteKind = 'ok'; rerender(); bus.emit('ai-changed'); return; }
      if (act === 'remove') { st = await api.invoke('ai:remove', { provider }); status = st; note = ''; noteKind = ''; rerender(); bus.emit('ai-changed'); return; }
      if (act === 'models') {
        busy('Lecture des modèles…');
        const s1 = await api.invoke('ai:set', {
          provider, key: key || undefined, baseUrl, enabled, model: model || undefined,
        });
        if (s1.error) throw new Error(s1.error);
        const r = await api.invoke('ai:models', { provider });
        if (r.error) throw new Error(r.error);
        st = await aiStatus(true);
        note = `${r.length} modèles disponibles : choisis-en un dans la liste.`; noteKind = 'ok';
        rerender(); return;
      }
    } catch (err) { note = err.message; noteKind = 'bad'; rerender(); }
  };
}

// ------------------------------------------------------------------ contexte de chaque espace
async function pageText(wv) {
  if (!wv) return null;
  try {
    return await wv.executeJavaScript(`(() => {
      const t = (document.body ? document.body.innerText : '').replace(/\\n{3,}/g, '\\n\\n').slice(0, 7000);
      const d = document.querySelector('meta[name="description"]');
      return { url: location.href, title: document.title, description: d ? d.content : '', text: t, lang: document.documentElement.lang || '' };
    })()`, true);
  } catch { return null; }
}

const pageBlock = (p) => (p ? `Page : ${p.url}\nTitre : ${p.title}\nDescription : ${p.description}\nLangue : ${p.lang}\n\nTexte visible :\n${p.text}` : 'Aucune page ouverte.');

// Contexte, invite système et actions toutes faites, selon l'espace.
async function spaceContext(mode = settings.mode) {
  if (mode === 'dev' && S.devLab) {
    const dv = S.devLab;
    const ed = dv.editor;
    const model = ed && ed.getModel();
    const sel = ed && model ? model.getValueInRange(ed.getSelection()) : '';
    const file = dv.active || '';
    const code = model ? model.getValue().slice(0, 16000) : '';
    const lang = model ? model.getLanguageId() : '';
    const root = dv.st.root || '';
    const rel = (f) => (root && f.startsWith(root) ? f.slice(root.length + 1).replace(/\\/g, '/') : f);
    let tree = '';
    if (root) {
      try { if (!dv.allFiles) dv.allFiles = await api.invoke('dev:all-files'); } catch { /* */ }
      const all = (dv.allFiles || []).map(rel);
      tree = `Fichiers du projet (${all.length}) :\n${all.slice(0, 350).join('\n')}${all.length > 350 ? '\n…' : ''}`;
    }
    return {
      label: file ? `Fichier : ${file.split(/[\\/]/).pop()}${sel ? ' (sélection)' : ''}` : (root ? `Projet : ${root.split(/[\\/]/).pop()}` : 'Dev Lab'),
      system: 'Tu es un développeur expert intégré au Dev Lab de NEXORA. Réponds en français, de façon concise. Pour modifier ou créer un fichier, donne le fichier COMPLET dans un bloc dont la première ligne indique le langage puis le chemin relatif au projet, par exemple : ```js src/app.js — l’utilisateur verra la comparaison et choisira d’appliquer. Pour corriger seulement la sélection, donne uniquement le code de remplacement dans un bloc ```langage sans chemin.',
      context: `${root ? `Projet : ${root}\n${tree}\n\n` : ''}${file ? `Fichier ouvert : ${rel(file)} (${lang})\n${sel ? `Sélection :\n\`\`\`${lang}\n${sel}\n\`\`\`\n` : ''}Contenu du fichier :\n\`\`\`${lang} ${rel(file)}\n${code}\n\`\`\`` : 'Aucun fichier ouvert.'}`,
      code: true,
      actions: [
        ['Expliquer', sel ? 'Explique ce que fait la sélection, étape par étape.' : 'Explique ce que fait ce fichier.'],
        ['Corriger', sel ? 'Trouve et corrige les erreurs de la sélection. Donne le code corrigé.' : 'Trouve les bugs de ce fichier et donne le fichier corrigé.'],
        ['Optimiser', 'Améliore la performance et la lisibilité, sans changer le comportement. Donne le code.'],
        ['Commenter', 'Ajoute des commentaires clairs en français. Donne le code commenté.'],
        ['Tests', 'Écris des tests unitaires pour ce code.'],
        ['Responsive', 'Rends cette interface parfaitement responsive (mobile, tablette, ordinateur). Donne le code.'],
        ['Analyser le projet', 'Analyse la structure de ce projet : technologies, organisation, points faibles et 5 améliorations prioritaires.'],
      ],
    };
  }
  if (mode === 'browser' && S.browserLab) {
    const p = await pageText(S.browserLab.wv);
    return {
      label: p ? `Page : ${p.title || p.url}` : 'Browser Lab',
      system: 'Tu es un expert web (SEO, accessibilité, performance, conversion) intégré au Browser Lab de NEXORA. Réponds en français avec des recommandations concrètes et priorisées.',
      context: pageBlock(p),
      actions: [['Audit SEO', 'Fais un audit SEO de cette page : titre, description, titres, contenu, mots-clés. Priorise.'], ['Accessibilité', 'Quels problèmes d’accessibilité probables vois-tu et comment les corriger ?'], ['Conversion', 'Comment augmenter les conversions de cette page (clarté, appels à l’action, confiance) ?'], ['Résumer', 'Résume cette page en 5 points.']],
    };
  }
  if (mode === 'android' && S.android) {
    const c = S.android.cfg;
    const p = S.board && S.board.focused ? await pageText(S.board.focused.wv) : null;
    return {
      label: `Application : ${c.appName || 'sans nom'}`,
      system: 'Tu aides à publier une application Android sur Google Play depuis l’App Builder de NEXORA. Réponds en français.',
      context: `Application : ${c.appName}\nIdentifiant : ${c.appId}\nSite : ${c.source.url || c.source.dir}\nMoteur : ${c.engine}\n\n${pageBlock(p)}`,
      actions: [
        ['Fiche Play Store', 'Rédige la fiche Google Play : titre (30 caractères max), description courte (80 max), description complète (4000 max) avec mots-clés.'],
        ['Écrans d’accueil', 'Propose 3 écrans d’accueil (onboarding). Réponds uniquement par un JSON : [{"title":"…","text":"…"}].', 'onboarding'],
        ['Confidentialité', 'Rédige une politique de confidentialité simple adaptée à cette application.'],
      ],
    };
  }
  if (mode === 'studio' && S.studio) {
    const st = S.studio;
    const p = S.board && S.board.focused ? await pageText(S.board.focused.wv) : null;
    const dir = await import('../studio/director.js');
    const scene = dir.describeScene(st);
    const extra = st.space === 'ad'
      ? [['Rédiger la publicité', 'Rédige une publicité percutante pour les réseaux sociaux. Réponds uniquement par un JSON : {"kicker":"…(3 mots)","title":"…(6 mots max)","subtitle":"…(15 mots max)","cta":"…(2 à 3 mots)"}.', 'ad', true], ['3 variantes', 'Propose 3 variantes de titre et d’accroche, avec des angles différents.', null, true]]
      : st.space === 'deck' ? [['Réécrire les diapositives', `Réécris les textes des ${st.deckState().slides.length} diapositives pour qu’ils soient plus convaincants. Réponds uniquement par un JSON : [{"title":"…","text":"…"}] dans le même ordre.`, 'deck', true]] : [];
    return {
      label: `3D & Motion · ${{ scene: 'scène', ad: 'publicité', deck: 'présentation' }[st.space] || st.space} (l’IA pilote le Studio)`,
      director: true,
      system: dir.directorSystem(),
      context: `Composition actuelle (JSON) :\n${JSON.stringify(scene)}\n\nSite de l’utilisateur :\n${pageBlock(p)}`,
      actions: [
        ['Scène 3D', 'Crée une belle scène 3D de présentation du produit : vide la scène, ajoute les appareils avec le site, un décor, une ambiance, des textes et un mouvement de caméra sur 6 secondes.', 'director'],
        ['Vidéo de lancement', 'Monte une vidéo de lancement de 10 secondes : plusieurs plans successifs (titre, appareils, avantages en formes 2D et textes, appel à l’action), avec transitions et mouvements de caméra.', 'director'],
        ['Ambiance', 'Propose et applique une autre ambiance (fond, lumière) qui met mieux en valeur la composition, sans toucher aux objets.', 'director'],
        ...extra,
      ],
    };
  }
  if (mode === 'studio-old' && S.studio) {
    const st = S.studio;
    const p = S.board && S.board.focused ? await pageText(S.board.focused.wv) : null;
    if (st.space === 'ad') {
      return {
        label: 'Publicité',
        system: 'Tu es concepteur-rédacteur publicitaire. Réponds en français.',
        context: `Marque : ${st.brand().name}\nTextes actuels : ${JSON.stringify(st.adState().copy)}\n\n${pageBlock(p)}`,
        actions: [
          ['Rédiger la publicité', 'Rédige une publicité percutante pour les réseaux sociaux. Réponds uniquement par un JSON : {"kicker":"…(3 mots)","title":"…(6 mots max)","subtitle":"…(15 mots max)","cta":"…(2 à 3 mots)"}.', 'ad'],
          ['3 variantes', 'Propose 3 variantes de titre et d’accroche, avec des angles différents.'],
        ],
      };
    }
    if (st.space === 'deck') {
      const d = st.deckState();
      return {
        label: 'Présentation',
        system: 'Tu es consultant en présentation commerciale. Réponds en français.',
        context: `Diapositives : ${JSON.stringify(d.slides.map((s) => ({ layout: s.layout, title: s.title, text: s.text, points: s.points })))}\n\n${pageBlock(p)}`,
        actions: [['Réécrire les diapositives', `Réécris les textes des ${d.slides.length} diapositives pour qu’ils soient plus convaincants. Réponds uniquement par un JSON : [{"title":"…","text":"…"}] dans le même ordre.`, 'deck']],
      };
    }
    return {
      label: 'Studio 3D', system: 'Tu es directeur artistique 3D. Réponds en français.', context: pageBlock(p), actions: [['Idées de mise en scène', 'Propose 3 mises en scène 3D pour présenter ce site (décor, lumière, animation de caméra).']],
    };
  }
  const p = S.board && S.board.focused ? await pageText(S.board.focused.wv) : null;
  const v = S.board && S.board.focused;
  return {
    label: p ? `Page : ${p.title || p.url}` : 'Responsive Lab',
    system: 'Tu es expert en design responsive et en expérience mobile. Réponds en français, concrètement.',
    context: `${v ? `Appareil : ${v.dev.name}, ${v.L.vp.w} × ${v.L.vp.h} px` : ''}\n${pageBlock(p)}`,
    actions: [['Avis mobile', 'Donne ton avis sur l’expérience mobile de cette page et les corrections prioritaires.'], ['Améliorer les textes', 'Réécris les titres et accroches principaux pour qu’ils soient plus clairs et plus courts.'], ['Idées de conversion', 'Propose 5 améliorations pour convertir davantage.']],
  };
}

// Applique une réponse JSON à l'espace (publicité, présentation, écrans d'accueil).
function applyJson(kind, text) {
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const raw = (m ? m[1] : text).trim();
  const start = raw.search(/[[{]/);
  let data;
  try { data = JSON.parse(raw.slice(start)); } catch { toast("La réponse n'est pas au format attendu : relance la demande.", { kind: 'bad' }); return; }
  if (kind === 'ad' && S.studio) {
    const c = S.studio.adState().copy;
    for (const k of ['kicker', 'title', 'subtitle', 'cta']) if (data[k]) c[k] = String(data[k]);
    persist();
    S.studio.reframeAd({ keepCamera: true });
    S.studio.renderProps();
    S.studio.dirty = true;
    toast('Textes de la publicité remplacés.');
  }
  if (kind === 'deck' && S.studio && Array.isArray(data) && data.length) {
    const d = S.studio.deckState();
    data.forEach((x, i) => { if (d.slides[i]) { if (x.title) d.slides[i].title = x.title; if (x.text) d.slides[i].text = x.text; } });
    persist();
    S.studio.rebuildAllSlides();
    toast('Textes des diapositives remplacés.');
  }
  if (kind === 'onboarding' && S.android && Array.isArray(data)) {
    const c = S.android.cfg;
    c.config.onboarding.enabled = true;
    c.config.onboarding.slides = data.slice(0, 6).map((x) => ({ title: String(x.title || ''), text: String(x.text || ''), image: null }));
    S.android.save();
    S.android.render();
    S.android.renderPreview();
    toast('Écrans d’accueil ajoutés à l’application.');
  }
}

// ------------------------------------------------------------------ assistant
const conv = { messages: [], mode: null };

function md(text) {
  const parts = String(text).split(/```([^\n`]*)\n?([\s\S]*?)(?:```|$)/g);
  let out = '';
  for (let i = 0; i < parts.length; i += 3) {
    const t = esc(parts[i] || '')
      .replace(/^### (.*)$/gm, '<h4>$1</h4>').replace(/^## (.*)$/gm, '<h4>$1</h4>').replace(/^# (.*)$/gm, '<h4>$1</h4>')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^\s*[-*] (.*)$/gm, '<li>$1</li>').replace(/^\s*\d+\. (.*)$/gm, '<li>$1</li>')
      .replace(/\n/g, '<br>');
    out += t;
    if (parts[i + 2] !== undefined) {
      const info = (parts[i + 1] || '').trim().split(/\s+/);
      const lang = /^[\w+#.-]*$/.test(info[0] || '') && !/[\\/]/.test(info[0] || '') ? info.shift() : '';
      const path = (info.join(' ').replace(/^(chemin|fichier|file|path)\s*[:=]\s*/i, '').trim()) || '';
      const dev = settings.mode === 'dev';
      out += `<div class="ai-code" ${path ? `data-path="${esc(path)}"` : ''}><div class="ai-code-bar"><span>${esc(path || lang || 'code')}</span><button data-ai-code="copy">Copier</button>${dev ? `${path ? '<button data-ai-code="apply" class="pri">Comparer et appliquer</button>' : '<button data-ai-code="diff">Comparer au fichier</button><button data-ai-code="insert">Insérer</button><button data-ai-code="replace">Remplacer la sélection</button>'}` : ''}</div><pre><code>${esc(parts[i + 2])}</code></pre></div>`;
    }
  }
  return out;
}

// Le panneau de l'assistant se range à droite et pousse le contenu (il ne recouvre plus les panneaux
// des espaces) ; il se redimensionne par son bord gauche. Sur un écran étroit, il passe par-dessus.
function setDrawerWidth(px) { document.documentElement.style.setProperty('--ai-w', `${Math.round(px)}px`); }
// Écran étroit dans le Dev Lab : l'aperçu se range le temps de l'assistant, pour laisser la place au code.
let previewParked = false;
function parkPreview(on) {
  const dv = S.devLab;
  const btn = document.querySelector('#devlab [data-act="toggle-preview"]');
  if (!dv || !btn) return;
  if (on && settings.mode === 'dev' && window.innerWidth < 1500 && dv.st.preview) { btn.click(); previewParked = true; }
  if (!on && previewParked) { previewParked = false; if (!dv.st.preview) btn.click(); }
}
function closeDrawer() {
  const el = document.querySelector('.ai-drawer');
  if (el) el.remove();
  parkPreview(false);
  document.body.classList.remove('ai-open');
  bus.emit('layout-changed');
  if (S.board) requestAnimationFrame(() => S.board.relayout());
}
export async function toggleAssistant(force) {
  let el = document.querySelector('.ai-drawer');
  if (el && force === false) { closeDrawer(); return; }
  if (el && force !== true) { closeDrawer(); return; }
  if (!el) {
    el = document.createElement('aside');
    el.className = 'ai-drawer glass';
    document.body.appendChild(el);
    bindDrawer(el);
    setDrawerWidth((settings.panels && settings.panels.aiDrawer) || 380);
    const { resizable } = await import('./resize.js');
    resizable(el, {
      key: 'aiDrawer', edge: 'left', min: 300, max: () => Math.max(320, window.innerWidth * 0.55), def: 380, onResize: (px) => setDrawerWidth(px),
    });
    document.body.classList.add('ai-open');
    parkPreview(true);
    bus.emit('layout-changed');
    if (S.board) requestAnimationFrame(() => S.board.relayout());
  }
  await renderDrawer(el);
}
bus.on('ai-changed', () => { const el = document.querySelector('.ai-drawer'); if (el) { aiStatus(true).then(() => renderDrawer(el)); } });

async function renderDrawer(el) {
  const ready = await aiReady();
  const st = await aiStatus();
  if (conv.mode !== settings.mode) { conv.mode = settings.mode; conv.messages = []; }
  const ctx = ready ? await spaceContext() : null;
  el.ctx = ctx;
  const prov = st.active ? st.providers[st.active] : null;
  el.innerHTML = `
    <header class="ai-head">${icon('sparkle', 16)}<b>Assistant IA</b><span class="grow"></span>
      <button class="icon-btn small" data-ai="settings" title="Réglages de l’IA (clés, fournisseurs)">${icon('wrench', 14)}</button>
      <button class="icon-btn small" data-ai="clear" title="Nouvelle conversation">${icon('plus', 14)}</button>
      <button class="icon-btn small" data-ai="close" title="Fermer">${icon('close', 14)}</button></header>
    ${ready ? `<div class="ai-pick">
      <select class="input" data-ai-sel="provider" title="IA utilisée">${Object.values(st.providers).filter((x) => x.connected).map((x) => `<option value="${x.id}" ${x.id === st.active ? 'selected' : ''}>${esc(x.label.split(' (')[0])}</option>`).join('')}</select>
      <select class="input" data-ai-sel="model" title="Modèle">${[...new Set([prov.model, ...(prov.models || [])].filter(Boolean))].map((m) => `<option value="${esc(m)}" ${m === prov.model ? 'selected' : ''}>${esc(m)}${/:free$/.test(m) ? ' (gratuit)' : ''}</option>`).join('') || '<option value="">Automatique</option>'}</select>
    </div>
    <div class="ai-ctx">${icon('info', 12)}<span>${esc(ctx.label)}</span></div>
    <div class="ai-actions">${ctx.actions.map(([l], i) => `<button class="st-chip" data-ai-action="${i}">${esc(l)}</button>`).join('')}</div>
    <div class="ai-log" data-ai-log>${conv.messages.length ? conv.messages.map((m) => `<div class="ai-msg-b ${m.role}">${m.role === 'user' ? esc(m.shown || m.content) : md(m.content)}</div>`).join('') : `<p class="ai-empty">Pose une question, ou choisis une action ci-dessus. L’IA voit : ${esc(ctx.label.toLowerCase())}.</p>`}</div>
    <form class="ai-input" data-ai-form><textarea class="input" rows="2" placeholder="Écris ta demande… (Entrée pour envoyer, Maj+Entrée pour aller à la ligne)" data-ai-q></textarea><button class="btn primary small" type="submit">${icon('forward', 14)}</button></form>`
    : `<div class="ai-setup"><span class="sheet-icon">${icon('sparkle', 22)}</span><h3>Connecte ton IA</h3><p>Ajoute ta clé API (Claude, ChatGPT, Gemini, Mistral, OpenRouter, Groq, DeepSeek) ou utilise Ollama sur ce PC. L’assistant t’aide ensuite dans chaque espace.</p><button class="btn primary" data-ai="settings">${icon('key', 14)}<span>Connecter une IA</span></button></div>`}`;
  const log = el.querySelector('[data-ai-log]');
  if (log) log.scrollTop = log.scrollHeight;
}

function bindDrawer(el) {
  el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-ai]');
    if (a) {
      if (a.dataset.ai === 'close') closeDrawer();
      if (a.dataset.ai === 'clear') { conv.messages = []; renderDrawer(el); }
      if (a.dataset.ai === 'settings') { await openAiSettings(); const bd = $('#sheetBackdrop'); const obs = new MutationObserver(() => { if (bd.hidden) { obs.disconnect(); renderDrawer(el); } }); obs.observe(bd, { attributes: true }); }
      return;
    }
    if (e.target.closest('[data-ai-undo]') && S.studio) { await S.studio.undo(); toast('Changement annulé.'); return; }
    if (e.target.closest('[data-ai-play]') && S.studio) { if (!S.studio.playing) S.studio.togglePlay(); return; }
    const act = e.target.closest('[data-ai-action]');
    if (act) { const [label, prompt, apply] = el.ctx.actions[Number(act.dataset.aiAction)]; send(el, prompt, label, apply); return; }
    const code = e.target.closest('[data-ai-code]');
    if (code) {
      const text = code.closest('.ai-code').querySelector('code').textContent;
      if (code.dataset.aiCode === 'copy') { api.invoke('clipboard:write', text); toast('Code copié.'); return; }
      const dv = S.devLab;
      if ((code.dataset.aiCode === 'apply' || code.dataset.aiCode === 'diff') && dv) {
        const path = code.dataset.aiCode === 'apply' ? code.closest('.ai-code').dataset.path : dv.active;
        if (!path) { toast('Ouvre le fichier à modifier dans l’éditeur.', { kind: 'bad' }); return; }
        try { await dv.proposeEdit(path, text.replace(/\n$/, '') + '\n'); } catch (err) { toast(err.message, { kind: 'bad' }); }
        return;
      }
      if (!dv || !dv.editor || settings.mode !== 'dev') { api.invoke('clipboard:write', text); toast('Code copié (ouvre un fichier dans le Dev Lab pour l’insérer directement).'); return; }
      const ed = dv.editor;
      const sel = ed.getSelection();
      const range = code.dataset.aiCode === 'replace' && !sel.isEmpty() ? sel : (code.dataset.aiCode === 'replace' ? ed.getModel().getFullModelRange() : { startLineNumber: sel.endLineNumber, startColumn: sel.endColumn, endLineNumber: sel.endLineNumber, endColumn: sel.endColumn });
      ed.pushUndoStop();
      ed.executeEdits('ia', [{ range, text }]);
      ed.pushUndoStop();
      ed.focus();
      toast(code.dataset.aiCode === 'replace' ? 'Code remplacé (Ctrl+Z pour annuler).' : 'Code inséré (Ctrl+Z pour annuler).');
    }
  });
  el.addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-ai-sel]');
    if (!sel) return;
    const st = await aiStatus();
    if (sel.dataset.aiSel === 'provider') status = await api.invoke('ai:active', { provider: sel.value });
    else status = await api.invoke('ai:set', { provider: st.active, model: sel.value });
    renderDrawer(el);
  });
  el.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = el.querySelector('[data-ai-q]');
    if (q.value.trim()) send(el, q.value.trim());
  });
  el.addEventListener('keydown', (e) => {
    if (e.target.matches('[data-ai-q]') && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.querySelector('[data-ai-form]').requestSubmit(); }
  });
}

async function send(el, prompt, shown, apply) {
  if (el.busy) return;
  el.busy = true;
  let ctx = el.ctx || await spaceContext();
  // Studio : la composition change à chaque plan exécuté, l'IA reçoit donc son état à chaque demande.
  if (ctx.director) { ctx = await spaceContext(); el.ctx = ctx; }
  const first = conv.messages.length === 0;
  const rawAction = ctx.director && ctx.actions.some((x) => x[1] === prompt && x[3]);
  if (ctx.director && !apply && !rawAction) apply = 'director';
  const content = first || ctx.director ? `${ctx.context}\n\n---\n\n${prompt}` : prompt;
  conv.messages.push({ role: 'user', content, shown: shown || prompt });
  await renderDrawer(el);
  const log = el.querySelector('[data-ai-log]');
  const bubble = document.createElement('div');
  bubble.className = 'ai-msg-b assistant pending';
  bubble.innerHTML = '<span class="ai-dots"><i></i><i></i><i></i></span>';
  log.appendChild(bubble);
  log.scrollTop = log.scrollHeight;
  try {
    const system = rawAction ? 'Tu es concepteur-rédacteur et consultant en présentation. Réponds en français.' : ctx.system;
    // L'historique garde seulement le dernier contexte complet (sinon la conversation grossit trop vite).
    const msgs = conv.messages.map((m, i) => ({ role: m.role, content: ctx.director && m.role === 'user' && i < conv.messages.length - 1 ? (m.shown || m.content) : m.content }));
    const run = await aiChat({
      system, messages: msgs, maxTokens: apply === 'director' ? 6000 : 4096, onChunk: (_c, all) => { bubble.innerHTML = apply === 'director' ? '<span class="ai-dots"><i></i><i></i><i></i></span> <small>L’IA prépare la composition…</small>' : md(all); log.scrollTop = log.scrollHeight; },
    });
    el.cancel = run.cancel;
    const r = await run.done;
    conv.messages.push({ role: 'assistant', content: r.text });
    bubble.classList.remove('pending');
    if (apply === 'director' && S.studio) {
      const dir = await import('../studio/director.js');
      const plan = dir.parsePlan(r.text);
      if (!plan || !Array.isArray(plan.actions)) { bubble.innerHTML = `${md(r.text)}<p class="ai-err">La réponse ne contient pas de plan d’actions : reformule ou relance.</p>`; } else {
        bubble.innerHTML = `<p>${esc(plan.message || 'Composition mise à jour.')}</p><p class="ai-run"><span class="ai-dots"><i></i><i></i><i></i></span> Exécution de ${plan.actions.length} action(s)…</p>`;
        const rep = await dir.runPlan(S.studio, plan);
        const okN = rep.filter((x) => x.ok).length;
        bubble.innerHTML = `<p>${esc(plan.message || 'Composition mise à jour.')}</p><details class="ai-report"><summary>${okN}/${rep.length} actions réalisées</summary><ul>${rep.map((x) => `<li class="${x.ok ? 'ok' : 'ko'}">${esc(x.text)}</li>`).join('')}</ul></details><div class="ai-plan-acts"><button class="btn small" data-ai-undo>${icon('back', 12)}<span>Annuler ce changement</span></button><button class="btn small" data-ai-play>${icon('play', 12)}<span>Lire</span></button></div>`;
      }
    } else {
      bubble.innerHTML = md(r.text);
      if (apply) applyJson(apply, r.text);
    }
  } catch (err) {
    conv.messages.pop();
    bubble.classList.remove('pending');
    bubble.classList.add('error');
    bubble.textContent = err.message;
  } finally { el.busy = false; }
}

// Raccourci pour les autres modules : ouvrir l'assistant avec une demande.
export async function askAssistant(prompt, shown) {
  await toggleAssistant(true);
  const el = document.querySelector('.ai-drawer');
  if (el && (await aiReady())) send(el, prompt, shown);
}

// Lance une action toute faite de l'espace (par son libellé).
export async function runAiAction(label) {
  await toggleAssistant(true);
  const el = document.querySelector('.ai-drawer');
  if (!el || !(await aiReady()) || !el.ctx) return;
  const a = el.ctx.actions.find((x) => x[0] === label) || el.ctx.actions[0];
  send(el, a[1], a[0], a[2]);
}

// ------------------------------------------------------------------ éditeur : complétion et consigne
// Complète le code à la position du curseur (Ctrl+Alt+I) : le texte proposé s'insère, Ctrl+Z l'annule.
export async function completeHere() {
  const dv = S.devLab;
  const ed = dv && dv.editor;
  const model = ed && ed.getModel();
  if (!model) return;
  if (!(await aiReady())) { openAiSettings(); return; }
  const pos = ed.getPosition();
  const before = model.getValueInRange({ startLineNumber: Math.max(1, pos.lineNumber - 120), startColumn: 1, endLineNumber: pos.lineNumber, endColumn: pos.column });
  const after = model.getValueInRange({ startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: Math.min(model.getLineCount(), pos.lineNumber + 40), endColumn: 1e6 });
  const t = toast('L’IA complète le code…', { busy: true, sticky: true });
  try {
    const run = await aiChat({
      system: 'Tu complètes du code. Réponds UNIQUEMENT par le code à insérer à la position <CURSEUR>, sans explication, sans bloc ```, sans répéter le code existant.',
      messages: [{ role: 'user', content: `Langage : ${model.getLanguageId()}\nFichier : ${dv.active}\n\n${before}<CURSEUR>${after}` }],
      maxTokens: 700,
    });
    const r = await run.done;
    const text = r.text.replace(/^```[^\n]*\n?/, '').replace(/\n?```\s*$/, '');
    if (!text.trim()) { toast('L’IA n’a rien proposé à cet endroit.'); return; }
    ed.pushUndoStop();
    ed.executeEdits('ia', [{ range: { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column }, text }]);
    ed.pushUndoStop();
    toast('Code ajouté (Ctrl+Z pour annuler).');
  } catch (err) { toast(err.message, { kind: 'bad' }); } finally { t.close(); }
}

// Modifie la sélection (ou le fichier) selon une consigne (Ctrl+Alt+K), puis montre la comparaison.
export async function editWithInstruction() {
  const dv = S.devLab;
  const ed = dv && dv.editor;
  const model = ed && ed.getModel();
  if (!model) return;
  if (!(await aiReady())) { openAiSettings(); return; }
  const sheet = openSheet('ai-edit', `<div class="sheet-head"><span class="sheet-icon">${icon('sparkle', 22)}</span><div><h2>Modifier avec l’IA</h2><p>${ed.getSelection().isEmpty() ? 'Tout le fichier' : 'La sélection'} sera réécrit(e) selon ta consigne. Tu verras la comparaison avant d’appliquer.</p></div></div>
    <div class="sheet-body"><textarea class="input" rows="3" data-autofocus placeholder="Ex. : ajoute la validation du formulaire, traduis les textes en anglais, passe en async/await…"></textarea></div>
    <div class="sheet-foot"><span class="grow"></span><button class="btn" data-sheet="close">Annuler</button><button class="btn primary" data-go>${icon('sparkle', 14)}<span>Modifier</span></button></div>`);
  const ta = sheet.querySelector('textarea');
  const go = async () => {
    const q = ta.value.trim();
    if (!q) return;
    closeSheet('ai-edit');
    const selR = ed.getSelection();
    const whole = selR.isEmpty();
    const src = whole ? model.getValue() : model.getValueInRange(selR);
    const t = toast('L’IA réécrit le code…', { busy: true, sticky: true });
    try {
      const run = await aiChat({
        system: 'Tu modifies du code selon une consigne. Réponds UNIQUEMENT par le code complet modifié, dans un seul bloc ```langage, sans explication.',
        messages: [{ role: 'user', content: `Consigne : ${q}\nLangage : ${model.getLanguageId()}\n\n\`\`\`\n${src}\n\`\`\`` }],
        maxTokens: 8000,
      });
      const r = await run.done;
      const m = /```[^\n]*\n([\s\S]*?)```/.exec(r.text);
      const out = (m ? m[1] : r.text).replace(/\n$/, '');
      const full = whole ? out : model.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: selR.startLineNumber, endColumn: selR.startColumn }) + out + model.getValueInRange({ startLineNumber: selR.endLineNumber, startColumn: selR.endColumn, endLineNumber: model.getLineCount(), endColumn: 1e6 });
      await dv.proposeEdit(dv.active, full, { label: `IA : ${q.slice(0, 60)}` });
    } catch (err) { toast(err.message, { kind: 'bad' }); } finally { t.close(); }
  };
  sheet.querySelector('[data-go]').onclick = go;
  ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } };
}

// Rafraîchit le contexte quand on change d'espace.
export function aiModeChanged() {
  const el = document.querySelector('.ai-drawer');
  if (el) renderDrawer(el);
}

export { closeSheet as closeAiSheet };
