/* Tests automatiques (développement) : VITRINE_AUTOTEST='{"out":"…","url":"…","steps":["…"]}'. */
import { api } from './core/api.js';
import { S } from './core/state.js';
import { settings, persist } from './core/settings.js';
import { $, sleep, nextFrame } from './core/dom.js';
import { Point } from 'fabric';
import { hidePopover, closeSheet, currentSheet } from './core/ui.js';
import { applyTheme } from './core/theme.js';
import { openUrl, openProjectDir, closeSource } from './viewer/sources.js';
import { setMode, openAppearance } from './viewer/toolbar.js';
import { renderDock, togglePresent } from './viewer/dock.js';
import { openInspector, toggleInspector } from './inspector/inspector.js';
import { takePhoto, openPhotoMenu } from './capture/photo.js';
import { startRecording, stopRecording } from './capture/recorder.js';

async function waitFor(fn, timeout = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (fn()) return true;
    // eslint-disable-next-line no-await-in-loop
    await sleep(200);
  }
  return false;
}

export async function runAutotest(spec) {
  const cfg = JSON.parse(spec);
  const log = (m) => api.invoke('autotest:log', m);
  if (!(cfg.steps || []).includes('tour')) settings.tourDone = true;
  window.__dbg = log;
  const snap = async (name) => { await nextFrame(); await sleep(400); await api.invoke('autotest:snap', `${cfg.out}/${name}.png`); };
  const board = () => S.board;
  const settle = async () => { await sleep(300); await waitFor(() => board().list.every((v) => !v.loading), 20000); await sleep(1100); };
  const steps = cfg.steps || ['all'];
  const want = (s) => steps.includes('all') || steps.includes(s);
  const vv = (v) => v.wv.executeJavaScript('`zoom=${visualViewport.scale.toFixed(3)} largeur=${document.documentElement.clientWidth} haut=${Math.round(visualViewport.pageTop)}`').catch((e) => String(e));
  const single = async (id, state) => {
    const b = board();
    if (b.multi) b.setLayout('single');
    const v = b.focused;
    if (v.cfg.deviceId !== id) await v.setDevice(id);
    if (state) await v.setState(state);
    return v;
  };
  const click = (sel) => { const el = $(sel); if (el) el.click(); return el; };
  await sleep(900);

  if (want('welcome')) await snap('01-accueil');
  if (want('simdev')) {
    await setMode('android'); await waitFor(() => S.android, 20000); await sleep(1500);
    const ab = S.android;
    const sel = () => document.querySelector('#android [data-ab-dev]');
    log(`simdev android : ${sel().querySelectorAll('option').length} appareils, groupes=${[...sel().querySelectorAll('optgroup')].map((g) => g.label).join(' / ')}`);
    ab.preview = 'home'; ab.renderPreview(); await sleep(800);
    await snap('simdev-logo');
    for (const id of ['galaxy-z-fold8', 'galaxy-tab-s10', 'iphone-se']) {
      const o = sel().querySelector(`option[value="${id}"]`);
      if (!o) { log(`simdev ${id} absent`); continue; }
      sel().value = id; sel().dispatchEvent(new Event('change', { bubbles: true })); await sleep(1200);
      const stSel = document.querySelector('#android [data-ab-state]');
      if (stSel && stSel.querySelector('option[value="open"]')) { stSel.value = 'open'; stSel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(1000); }
      log(`simdev ${id} : état=${stSel ? stSel.value : '—'} écran=${ab.phoneL && `${Math.round(ab.phoneL.W)}x${Math.round(ab.phoneL.H)}`}`);
      ab.preview = 'app'; ab.renderPreview(); await sleep(900);
      await snap(`simdev-${id}`);
    }
    document.querySelector('#android [data-set="abOs"][data-val="ios"]').click(); await sleep(1000);
    log(`simdev ios : ${sel().querySelectorAll('option').length} appareils, groupes=${[...sel().querySelectorAll('optgroup')].map((g) => g.label).join(' / ')}`);
    document.querySelector('#android [data-set="abOs"][data-val="android"]').click(); await sleep(600);
    await setMode('preview');
  }
  if (want('overflow')) {
    // Débordements : textes coupés sans points de suspension, éléments qui sortent de leur panneau.
    if (!S.source && cfg.url) { await openUrl(cfg.url); await settle(); }
    const PANEL = '.sidebar, .inspector, .toolbar, .rail, .bl-panel, .bl-bar, .dk-top, .dk-side, .dk-center, .dk-preview, .ab-nav, .ab-main, .ab-side, .st-side, .st-timeline, .st-toolbar, .sec, .hm, .dock, .popover, .sheet, .ab-card, .hm-card, .hm-stat, .hm-qa, .hm-space';
    const scan = (label) => {
      const bad = [];
      const els = document.querySelectorAll('button, .btn, label, h1, h2, h3, b, small, span, .seg > *, .st-chip, .ab-sec, .hm-chip, a, kbd, .field > span');
      for (const el of els) {
        if (!el.offsetParent || el.closest('[hidden]')) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const cs = getComputedStyle(el);
        const clipsNicely = cs.textOverflow === 'ellipsis' || (cs.overflow === 'hidden' && cs.whiteSpace === 'nowrap');
        const own = el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll' && !clipsNicely && el.clientWidth > 0 && cs.display !== 'inline';
        const panel = el.parentElement && el.parentElement.closest(PANEL);
        let out = false;
        if (panel) { const p = panel.getBoundingClientRect(); const pcs = getComputedStyle(panel); const scrolls = /(auto|scroll)/.test(pcs.overflowX) || /(auto|scroll)/.test(pcs.overflow); if (!scrolls) out = r.right > p.right + 2 || r.left < p.left - 2; }
        const win = r.right > window.innerWidth + 1;
        if (own || out || win) {
          const txt = (el.textContent || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
          bad.push(`${own ? 'texte' : out ? 'sort' : 'fenêtre'}:${el.tagName.toLowerCase()}.${String(el.className || '').split(' ')[0]}「${txt}」`);
        }
      }
      log(`overflow ${label} : ${bad.length}${bad.length ? ` → ${[...new Set(bad)].slice(0, 14).join(' ; ')}` : ''}`);
    };
    for (const [w, h] of [[1100, 700], [1440, 860]]) {
      await api.invoke('autotest:resize', { w, h }); await sleep(900);
      for (const m of ['home', 'preview', 'browser', 'dev', 'android', 'studio', 'design', 'security']) {
        await setMode(m);
        if (m === 'studio') await waitFor(() => S.studio && S.studio.ready, 30000);
        await sleep(m === 'studio' ? 2200 : 1200);
        scan(`${w} ${m}`);
        if (w === 1100) await snap(`of-${w}-${m}`);
        if (m === 'android' && S.android) {
          for (const sec of ['icon', 'look', 'orient', 'push', 'publish', 'store']) { S.android.section = sec; S.android.renderNav(); S.android.renderForm(); await sleep(500); scan(`${w} android/${sec}`); }
          S.android.section = 'source'; S.android.renderNav(); S.android.renderForm();
        }
        if (m === 'studio' && S.studio) {
          for (const sp of ['mockup', 'deck', 'scene']) { await S.studio.setSpace(sp); await sleep(1200); scan(`${w} studio/${sp}`); if (w === 1100) await snap(`of-${w}-studio-${sp}`); }
        }
      }
    }
    await api.invoke('autotest:resize', { w: 1520, h: 940 });
    await setMode('preview');
  }
  if (want('sync2')) {
    const url = new URL('sync.html', cfg.url).href;
    await openUrl(url); await settle();
    const b = board();
    await single('iphone-17');
    b.setLayout('multi');
    b.addDevice('galaxy-s25-ultra');
    b.addDevice('macbook-pro-14');
    await settle();
    settings.sync = { nav: true, scroll: true, clicks: true, input: true }; b.configureAll(); await sleep(800);
    const [a] = b.list;
    const js = (v, code) => v.wv.executeJavaScript(code).catch((e) => `ERR ${e.message}`);
    const topEl = 'JSON.stringify((() => { const vv = visualViewport; const el = document.elementFromPoint(vv.width / 2, 10); const s = el && el.closest("section"); return { top: s ? s.id : (el ? el.tagName : null), y: Math.round(vv.pageTop) }; })())';
    log(`sync2 appareils : ${b.list.map((v) => v.dev.name).join(' | ')}`);
    // Défilement : le meneur va à la section 5 ; les autres doivent montrer la même section en haut.
    b.setFocus(a.uid); a.activeAt = Date.now();
    await js(a, 'document.getElementById("s5").scrollIntoView({block:"start"}); window.scrollBy(0, 40); true');
    await sleep(1400);
    log(`sync2 défilement : ${(await Promise.all(b.list.map((v) => js(v, topEl)))).join(' | ')}`);
    await snap('sync2-scroll');
    // Clic sur un menu qui s'ouvre au « pointerdown » : doit s'ouvrir partout (vrai clic).
    await js(a, 'scrollTo(0,0); true'); await sleep(700);
    a.activeAt = Date.now();
    const r = JSON.parse(await js(a, 'JSON.stringify(document.getElementById("menuBtn").getBoundingClientRect())'));
    a.clickAt(r.x + r.width / 2, r.y + r.height / 2); a.syncClicking = 0; a.activeAt = Date.now();
    await sleep(2000);
    log(`sync2 clic : ${(await Promise.all(b.list.map((v) => js(v, '`menu=${document.getElementById("menu").classList.contains("open")} clics=${document.getElementById("cnt").textContent}`')))).join(' | ')}`);
    // Saisie : texte, case à cocher ; mot de passe jamais copié.
    a.activeAt = Date.now();
    await js(a, '(() => { const i = document.getElementById("name"); i.focus(); return true; })()');
    a.wv.focus(); a.wv.sendInputEvent({ type: 'char', keyCode: 'A' }); a.wv.insertText('mina'); a.activeAt = Date.now();
    await sleep(900);
    await js(a, '(() => { document.getElementById("pw").focus(); return true; })()'); a.wv.insertText('secret'); await sleep(700);
    log(`sync2 saisie : ${(await Promise.all(b.list.map((v) => js(v, '`nom=${document.getElementById("name").value} mdp=${document.getElementById("pw").value ? "copié" : "vide"}`')))).join(' | ')}`);
    // Navigation monopage : sans rechargement chez les autres.
    a.activeAt = Date.now();
    const r2 = JSON.parse(await js(a, 'JSON.stringify(document.getElementById("go2").getBoundingClientRect())'));
    const loaded = await Promise.all(b.list.map((v) => js(v, 'window.loadedAt')));
    settings.sync.clicks = false; b.configureAll(); await sleep(300);
    a.clickAt(r2.x + r2.width / 2, r2.y + r2.height / 2); a.syncClicking = 0; a.activeAt = Date.now();
    await sleep(2000);
    const after = await Promise.all(b.list.map((v) => js(v, '`${location.hash}|${window.loadedAt}`')));
    log(`sync2 navigation : ${after.map((x, i) => `${x.split('|')[0]} ${x.split('|')[1] === String(loaded[i]) ? 'sans rechargement' : 'rechargé'}`).join(' | ')}`);
    await snap('sync2-end');
    settings.sync = { nav: true, scroll: true, clicks: true, input: true };
    b.setLayout('single'); await openUrl(cfg.url); await settle();
  }
  if (want('capdbg')) {
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    const v = await single('iphone-17'); await settle();
    for (const [i, d] of [[1, 0], [2, 1500], [3, 4000]]) {
      await sleep(d);
      log(`capdbg ${i} ${await vv(v)} K=${v.K}`);
      const t0 = performance.now();
      let c; try { c = await v.capturePage(); } catch (e) { log(`capdbg ${i} ÉCHEC ${e.message} ${Math.round(performance.now() - t0)} ms`); continue; }
      log(`capdbg ${i} ok ${c.width}x${c.height} ${Math.round(performance.now() - t0)} ms`);
      const b = await new Promise((r) => c.toBlob(r, 'image/png'));
      await api.invoke('capture:save', { kind: 'photo', project: 'dbg', name: `dbg${i}`, ext: 'png', data: new Uint8Array(await b.arrayBuffer()) });
    }
    await snap('capdbg-screen');
    openPhotoMenu($('#dock [data-act="photo"]') || $('#dock'));
    await sleep(500); await snap('capdbg-photomenu'); hidePopover();
    await startRecording(); await sleep(1500); await snap('capdbg-recpill');
    log(`capdbg vidéo : ${await stopRecording()}`);
  }
  if (want('orient')) {
    await setMode('android'); await waitFor(() => S.android, 20000); await sleep(1500);
    const ab = S.android;
    ab.section = 'orient'; ab.renderNav(); ab.renderForm(); await sleep(600);
    log(`orient section : tuiles=${document.querySelectorAll('#android .ab-ot').length} actuelle=${ab.cfg.orientation}`);
    await snap('orient-auto');
    const pick = async (v) => { const r = document.querySelector(`#android .ab-ot input[value="${v}"]`); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); await sleep(1200); };
    await pick('landscape');
    const ph = document.querySelector('#android .ab-phone');
    log(`orient paysage : cfg=${ab.cfg.orientation} twa=${ab.cfg.twa.orientation} aperçu paysage=${ph.classList.contains('land')} retournement=${Boolean(document.querySelector('#android [data-toggle="k:orientFlip"]'))}`);
    await snap('orient-paysage');
    await pick('portrait');
    log(`orient portrait : twa=${ab.cfg.twa.orientation} aperçu paysage=${document.querySelector('#android .ab-phone').classList.contains('land')} bouton rotation désactivé=${document.querySelector('#android [data-ab-rotate]').disabled}`);
    await pick('unspecified');
    document.querySelector('#android [data-ab-rotate]').click(); await sleep(1000);
    log(`orient auto + rotation aperçu : paysage=${document.querySelector('#android .ab-phone').classList.contains('land')}`);
    await snap('orient-auto-rot');
    document.querySelector('#android [data-ab-rotate]').click(); await sleep(600);
    ab.set('orientTablet', 'unspecified', { rerender: false }); ab.set('orientFlip', true, { rerender: false });
    await pick('portrait');
    const spec = await ab.spec().catch((e) => ({ err: e.message }));
    log(`orient spec : ${JSON.stringify(spec.err ? spec : { o: spec.orientation, flip: spec.orientFlip, tab: spec.orientTablet, js: spec.orientJs })}`);
    ab.section = 'identity'; ab.renderNav(); ab.renderForm(); await sleep(400);
    log(`orient identité : lien=${Boolean(document.querySelector('#android .ab-form [data-sec="orient"]'))}`);
    await setMode('preview');
  }
  if (want('aidrawer')) {
    for (const m of ['home', 'studio']) {
      await setMode(m); if (m === 'studio') await waitFor(() => S.studio && S.studio.ready, 30000); await sleep(800);
      const ai = await import('./core/ai.js'); ai.toggleAssistant(); await sleep(900); await snap(`aidrawer-${m}`); ai.toggleAssistant(); await sleep(400);
    }
    openAppearance($('#btnAppearance')); await sleep(400); await snap('appearance-pop'); hidePopover();
  }

  if (want('refresh')) {
    // Rafraîchissement : bouton de l'espace + boutons ⟳ de chaque panneau, dans tous les espaces.
    const rf = await import('./core/refresh.js');
    if (!S.source && cfg.url) { await openUrl(cfg.url); await settle(); }
    const errs = [];
    window.addEventListener('error', (e) => errs.push(e.message));
    window.addEventListener('unhandledrejection', (e) => errs.push(String(e.reason && e.reason.message || e.reason)));
    for (const m of ['home', 'preview', 'browser', 'dev', 'android', 'studio', 'design', 'security']) {
      await setMode(m);
      if (m === 'studio') await waitFor(() => S.studio && S.studio.ready, 30000);
      if (m === 'preview') openInspector('infos');
      await sleep(m === 'studio' ? 2000 : 1200);
      const pane = m === 'preview' ? document.querySelector('#app') : document.querySelector(`#${{ home: 'home', browser: 'browserlab', dev: 'devlab', android: 'android', studio: 'studio', design: 'design', security: 'security' }[m]}`);
      const btns = [...pane.querySelectorAll('.rf-btn')].filter((b) => b.dataset.rf.startsWith(`${m}:`) && b.offsetParent);
      const scopes = [...new Set(btns.map((b) => b.dataset.rf.split(':')[1]))];
      for (const b of btns) { b.click(); await waitFor(() => !b.classList.contains('spinning'), 20000); await sleep(250); }
      await rf.refresh(m, 'space');
      await sleep(m === 'studio' ? 1500 : 700);
      const again = [...pane.querySelectorAll('.rf-btn')].filter((b) => b.dataset.rf.startsWith(`${m}:`) && b.offsetParent).length;
      log(`refresh ${m} : boutons=${btns.length} portées=${scopes.join('/')} après=${again} erreurs=${errs.length}`);
      await snap(`rf-${m}`);
      if (m === 'preview') toggleInspector(false);
    }
    openAppearance($('#btnAppearance')); await sleep(300);
    const ui = document.querySelector('#popover [data-ui-more]'); if (ui) ui.click(); await sleep(500);
    const sb = document.querySelector('#sheet .rf-btn'); log(`refresh fenêtre réglages : bouton=${Boolean(sb)}`);
    if (sb) { sb.click(); await sleep(500); log(`refresh fenêtre réglages après : bouton=${Boolean(document.querySelector('#sheet .rf-btn'))}`); }
    await snap('rf-sheet');
    closeSheet();
    log(`refresh erreurs : ${errs.slice(0, 5).join(' | ') || 'aucune'}`);
    await setMode('preview');
  }

  if (want('tourui')) {
    // Tour visuel de tous les espaces, en clair puis en sombre.
    if (!S.source && cfg.url) { await openUrl(cfg.url); await settle(); }
    for (const th of ['light', 'dark']) {
      settings.appTheme = th; applyTheme();
      for (const m of ['home', 'preview', 'browser', 'dev', 'android', 'studio', 'design', 'security']) {
        await setMode(m);
        if (m === 'studio') await waitFor(() => S.studio && S.studio.ready, 30000);
        await sleep(m === 'studio' ? 2500 : 1400);
        await snap(`ui-${th}-${m}`);
      }
      if (cfg.inspect) { await setMode('preview'); openInspector('infos'); await sleep(900); await snap(`ui-${th}-inspector`); toggleInspector(false); }
    }
    settings.appTheme = 'light'; applyTheme();
    await setMode('preview');
  }

  if (want('single')) {
    await openUrl(cfg.url);
    await settle();
    let v = await single('iphone-17');
    await settle();
    log(`iPhone 17 : K=${v.K} ${await vv(v)}`);
    await snap('02-iphone-17');
    for (const [id, st, name] of [
      ['galaxy-z-fold8', 'open', '03-fold8-ouvert'], ['galaxy-z-fold8', 'closed', '04-fold8-ferme'],
      ['galaxy-z-flip8', 'closed', '05-flip8-ferme'], ['galaxy-z-flip8', 'open', '06-flip8-ouvert'],
      ['iphone-duo', 'closed', '07-duo-ferme'], ['iphone-duo', 'open', '08-duo-ouvert'],
      ['galaxy-z-trifold', null, '09-trifold'], ['tv-65-webos', null, '10-tv-65'], ['macbook-pro-14', null, '11-macbook'],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      v = await single(id, st);
      // eslint-disable-next-line no-await-in-loop
      await settle();
      // eslint-disable-next-line no-await-in-loop
      log(`${name} : ${v.L.vp.w}×${v.L.vp.h} K=${v.K} ${await vv(v)}`);
      // eslint-disable-next-line no-await-in-loop
      await snap(name);
    }
    v = await single('iphone-17');
    await v.rotate();
    await settle();
    await snap('12-iphone-paysage');
    await v.rotate();
    v.setColor('#e8c9a8');
    await snap('13-iphone-couleur');
    v.setColor(null);
  }

  if (want('skins')) {
    // Cadres officiels (Pixel, Wear OS, Automotive, TV) et nouvelles formes dessinées.
    await openUrl(cfg.url);
    await settle();
    const list = cfg.devices || [
      ['pixel-9', null], ['pixel-10-pro-fold', 'open'], ['pixel-10-pro-fold', 'closed'], ['pixel-fold', 'open'], ['pixel-tablet', null],
      ['galaxy-watch-44', null], ['pixel-watch-41', null], ['apple-watch-46', null], ['huawei-watch-gt', null], ['wear-rect', null],
      ['tv-43-googletv', null], ['aaos-landscape', null], ['aaos-portrait', null], ['carplay', null], ['tesla-3', null],
      ['switch', null], ['steam-deck', null], ['legion-go', null], ['ps5', null], ['vision-pro', null], ['meta-quest', null],
      ['echo-show-8', null], ['nest-hub', null], ['kindle-paperwhite', null], ['kiosk-order', null], ['pos-keypad', null], ['photo-frame', null],
      ['pc-tower-24', null], ['dual-24', null], ['triple-24', null], ['galaxy-s26-ultra', null], ['galaxy-s24-ultra', null],
    ];
    for (const [id, st] of list) {
      // eslint-disable-next-line no-await-in-loop
      const v = await single(id, st);
      // eslint-disable-next-line no-await-in-loop
      await settle();
      // eslint-disable-next-line no-await-in-loop
      log(`skin ${id}${st ? `/${st}` : ''} : ${v.L.skin ? `officiel ${v.L.skin.v.path}` : 'dessiné'} ${v.L.vp.w}×${v.L.vp.h} K=${v.K.toFixed(3)}`);
      // eslint-disable-next-line no-await-in-loop
      await snap(`skin-${id}${st ? `-${st}` : ''}`);
    }
    const { openSkins } = await import('./viewer/skinsheet.js');
    openSkins();
    await snap('skin-feuille');
    closeSheet();
    if (cfg.photo) {
      await single('pixel-9');
      await settle();
      settings.photo.format = 'png';
      log(`photo pixel 9 : ${await takePhoto('mockup')}`);
      await single('galaxy-watch-44');
      await settle();
      log(`photo montre : ${await takePhoto('mockup')}`);
    }
  }

  if (want('ui')) {
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    openAppearance($('#btnAppearance')); await sleep(400); await snap('20-apparence'); hidePopover();
    openPhotoMenu($('[data-dock="photo"]')); await sleep(400); await snap('21-menu-photo'); hidePopover();
    click('[data-dock="video"]'); await sleep(400); await snap('22-menu-video'); hidePopover();
    click('[data-dock="color"]'); await sleep(400); await snap('23-menu-couleur'); hidePopover();
    settings.appTheme = 'dark'; applyTheme(); await sleep(300);
    openInspector('infos'); await sleep(1200); await snap('24-sombre-infos');
    openInspector('audit'); await waitFor(() => S.audit && !S.audit.running, 15000); await sleep(400); await snap('25-audit');
    toggleInspector(false);
    settings.appTheme = 'light'; applyTheme();
  }

  if (want('multi')) {
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    const b = board();
    await single('iphone-17');
    b.setLayout('multi');
    b.addDevice('galaxy-s25-ultra');
    b.addDevice('galaxy-z-fold8', { state: 'open' });
    await settle();
    await snap('30-planche-3');
    const [a, c2, c3] = b.list;
    c2.setColor('#8fb3d9');
    c3.setColor('#2b2b2f');
    // Navigation synchronisée
    b.setFocus(a.uid);
    a.load(new URL('promo.html', cfg.url).href);
    await settle();
    log(`navigation synchronisée : ${b.list.map((v) => v.url.split('/').pop()).join(' | ')}`);
    // Défilement synchronisé
    a.load(cfg.url);
    await settle();
    log(`retour à l'accueil : ${b.list.map((v) => v.url).join(' | ')}`);
    a.activeAt = Date.now();
    a.scrollTo('y', 600);
    await sleep(1200);
    log(`défilement synchronisé : ${(await Promise.all(b.list.map((v) => v.wv.executeJavaScript('Math.round(visualViewport.pageTop) + "/" + (document.documentElement.scrollHeight - innerHeight)')))).join(' | ')}`);
    log(`détail : ${(await Promise.all(b.list.map((v) => v.wv.executeJavaScript('JSON.stringify({pt:Math.round(visualViewport.pageTop),sy:Math.round(scrollY),ih:innerHeight,iw:innerWidth,vh:Math.round(visualViewport.height),vw:Math.round(visualViewport.width),sh:document.documentElement.scrollHeight,sc:visualViewport.scale.toFixed(3)})')))).join(' | ')}`);
    await snap('31-planche-sync');
    // Navigation séparée
    settings.sync.nav = false;
    settings.sync.scroll = false;
    b.configureAll();
    c2.load(new URL('ok.html', cfg.url).href);
    await settle();
    log(`navigation séparée : ${b.list.map((v) => v.url.split('/').pop()).join(' | ')}`);
    settings.sync.nav = true;
    settings.sync.scroll = true;
    settings.boardScale = 'height';
    b.relayout();
    renderDock();
    await sleep(500);
    await snap('32-planche-hauteur');
    settings.boardScale = 'real';
    b.relayout();
    for (const fmt of ['png', 'jpg']) {
      settings.photo.format = fmt;
      // eslint-disable-next-line no-await-in-loop
      log(`photo planche ${fmt} : ${await takePhoto('board')}`);
    }
    b.setLayout('single');
    await settle();
  }

  if (want('capture')) {
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    await single('iphone-17');
    await settle();
    for (const fmt of ['png', 'jpg', 'webp', 'pdf']) {
      settings.photo.format = fmt;
      settings.photo.bg = fmt === 'png' ? 'transparent' : 'light';
      // eslint-disable-next-line no-await-in-loop
      log(`maquette ${fmt} : ${await takePhoto('mockup')}`);
    }
    settings.photo.format = 'png';
    log(`écran png : ${await takePhoto('screen')}`);
    log(`page entière png : ${await takePhoto('full')}`);
    settings.photo.format = 'pdf';
    settings.photo.pdfPages = 'a4';
    log(`page entière pdf A4 : ${await takePhoto('full')}`);
    settings.photo.format = 'png';
    await single('galaxy-z-flip8', 'closed');
    await settle();
    log(`flip fermé maquette : ${await takePhoto('mockup')}`);
    await single('macbook-pro-14');
    await settle();
    log(`macbook page entière : ${await takePhoto('full')}`);
    await single('iphone-17');
    await settle();
  }

  if (want('video')) {
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    const v = await single('iphone-17');
    await settle();
    for (const [framed, size] of [[true, '1080'], [false, 'native']]) {
      settings.video.framed = framed;
      settings.video.size = size;
      // eslint-disable-next-line no-await-in-loop
      await startRecording();
      for (let i = 0; i < 16; i++) {
        v.scrollTo('y', i * 70);
        // eslint-disable-next-line no-await-in-loop
        await sleep(180);
      }
      // eslint-disable-next-line no-await-in-loop
      log(`vidéo ${framed ? 'cadre' : 'écran'} ${size} : ${await stopRecording()}`);
      v.scrollTo('y', 0);
    }
    settings.video.framed = true;
    settings.video.size = '1080';
  }

  if (want('present')) {
    togglePresent(true);
    await sleep(1200);
    await snap('40-presentation');
    togglePresent(false);
    await sleep(400);
  }

  if (want('studio')) {
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    await setMode('studio');
    await waitFor(() => S.studio && S.studio.ready, 30000);
    await sleep(1500);
    await snap('50-studio');
    if (S.studio.autotest) await S.studio.autotest({ log, snap, sleep });
    await setMode('preview');
  }

  if (steps.includes('editor')) {
    // Studio éditeur noir et blanc : barre du bas, menus, extrusion, modificateurs, rendu final.
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    await setMode('studio');
    await waitFor(() => S.studio && S.studio.ready, 30000);
    const st = S.studio;
    await st.setSpace('scene');
    await sleep(1800);
    await snap('ed-01-scene');
    const R = (q) => { const el = document.querySelector(q); return el ? el.getBoundingClientRect() : null; };
    log(`env=${JSON.stringify(st.three.env)} cyclo=${st.three.cyclo.material.color.getHexString()} vis=${st.three.cyclo.visible} env=${st.three.cyclo.material.envMapIntensity}`);
    log(`dock=${JSON.stringify(R('#stDock'))} render=${JSON.stringify(R('.st-render'))} axes=${Boolean(st.viewHelper)} grille=${st.editorGrid && st.editorGrid.visible}`);
    document.querySelector('[data-ed="add"]').click(); await sleep(500); await snap('ed-02-add'); hidePopover();
    st.togglePrompt(true); await sleep(300); await snap('ed-03-prompt'); st.togglePrompt(false);
    const first = st.order.find((x) => st.objects.get(x).item.type === 'device');
    if (first) {
      st.select(first); await sleep(300);
      const c = st.$.canvas.getBoundingClientRect();
      st.contextMenu(c.left + c.width / 2, c.top + c.height / 2); await sleep(400); await snap('ed-04-context'); hidePopover();
    }
    // Forme 2D extrudée avec biseau et torsion.
    const it = { kind: 'vecteur', shape: 'star', w: 24, h: 24, fill: '#ffffff', extrude: 8, bevel3d: 1.2, finish: 'chrome', mods: { twist: 90, taper: 0.3 }, pos: [0, 14, 22] };
    try { st.addDecor(it); } catch (e) { log(`addDecor: ${e.message}`); }
    await sleep(1200);
    st._propsKey = null; st.renderProps(); await sleep(1500);
    st._propsKey = null; st.renderProps(); await sleep(400);
    log(`vignettes=${Object.keys(st._finishThumbs || {}).length} fin=${document.querySelectorAll('.st-fin img').length}`);
    await snap('ed-05-extrude');
    // Vue de face via le widget d'axes.
    st.frameAll(false); await sleep(400);
    await snap('ed-06-frame');
    st.editorVisible(false);
    for (const q of ['view', 'high', 'final']) {
      const t0 = performance.now();
      const c = await st.three.renderTo(1280, 720, { ...({ view: {}, high: { samples: 4 }, final: { samples: 16, scale: 1.5, hiShadows: true } })[q] });
      log(`rendu ${q}: ${Math.round(performance.now() - t0)} ms ${c.width}x${c.height}`);
      const url = c.toDataURL('image/png');
      await api.invoke('autotest:log', `img ${q} ${url.length}`);
      const a = new Image(); a.src = url; await a.decode();
      const ov = document.createElement('div'); ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;display:grid;place-items:center'; a.style.cssText = 'max-width:100%;max-height:100%'; ov.append(a); document.body.append(ov);
      await snap(`ed-07-render-${q}`); ov.remove();
    }
    st.editorVisible(true);
    for (const w of [1100, 1440]) { await api.invoke('autotest:resize', { w, h: 900 }); await sleep(900); await snap(`ed-09-w${w}`); }
    st.renderSheet(); await sleep(600); await snap('ed-08-sheet'); closeSheet();
    await setMode('preview');
  }

  if (steps.includes('dzui')) {
    // NEX-DESIGN : outils pilotés à la souris (rectangle, plume, crayon, texte), menus et raccourcis.
    await setMode('design');
    await waitFor(() => S.design && S.design.ready, 30000);
    const d = S.design; const c = d.canvas;
    await d.docAction('new', document.querySelector('[data-dz="docs"]'));
    await sleep(300);
    document.querySelector('#popover [data-fmt="story"]')?.click();
    await sleep(1200);
    log(`dzui doc : ${d.doc.name} ${d.page.w}x${d.page.h} objets=${c.getObjects().length}`);
    const el = c.upperCanvasEl;
    const r = el.getBoundingClientRect();
    const scr = (x, y) => { const v = c.viewportTransform; return { clientX: r.left + x * v[0] + v[4], clientY: r.top + y * v[3] + v[5] }; };
    const fire = (type, x, y, target = el) => { const p = scr(x, y); target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, ...p })); };
    const drag = async (pts) => { fire('mousedown', ...pts[0]); for (const p of pts.slice(1)) { fire('mousemove', ...p, document); fire('mousemove', ...p); await sleep(16); } const l = pts[pts.length - 1]; fire('mouseup', ...l, document); await sleep(60); };
    d.setTool('rect');
    await drag([[100, 200], [300, 350], [600, 500]]);
    const rc = c.getActiveObject();
    log(`dzui rectangle : ${rc && rc.type} ${rc ? `${Math.round(rc.getScaledWidth())}x${Math.round(rc.getScaledHeight())}` : ''} outil=${d.tool}`);
    d.setTool('pen');
    for (const [x, y] of [[150, 700], [500, 650], [800, 900]]) await drag([[x, y], [x + 1, y]]);
    await drag([[900, 1200], [1000, 1300]]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(200);
    const pen = c.getActiveObject();
    log(`dzui plume : ${pen && pen.type} nom=${pen && pen.name} segments=${pen && pen.path ? pen.path.length : 0}`);
    d.setTool('pencil');
    await drag([[200, 1400], [260, 1450], [330, 1420], [400, 1500], [480, 1460], [560, 1520]]);
    log(`dzui crayon : ${c.getObjects().filter((o) => o.name === 'Trait').length} trait(s)`);
    d.setTool('ellipse');
    await drag([[600, 1500], [800, 1700]]);
    d.setTool('text');
    fire('mousedown', 100, 1750); fire('mouseup', 100, 1750, document);
    await sleep(200);
    const tx = c.getActiveObject();
    log(`dzui texte : ${tx && tx.type} édition=${tx && tx.isEditing}`);
    if (tx && tx.exitEditing) tx.exitEditing();
    c.discardActiveObject();
    // Raccourcis : tout sélectionner, grouper, dupliquer, annuler.
    const key = (k, o = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...o }));
    key('Escape'); key('v');
    key('a', { ctrlKey: true }); await sleep(100);
    const nSel = d.sel().length;
    key('g', { ctrlKey: true }); await sleep(200);
    const grp = c.getActiveObject();
    key('d', { ctrlKey: true }); await sleep(400);
    log(`dzui raccourcis : sélection=${nSel} groupe=${grp && grp.type} total=${c.getObjects().length}`);
    key('z', { ctrlKey: true }); await sleep(600); key('z', { ctrlKey: true }); await sleep(600);
    log(`dzui annuler ×2 : total=${c.getObjects().length}`);
    d.fit(); c.requestRenderAll(); await sleep(300);
    await snap('dzui-01');
    // Menus : objet 3D, zoom, documents, format, clic droit, couleur.
    d.setTool('three'); await sleep(300); await snap('dzui-02-menu3d'); hidePopover();
    document.querySelector('[data-dz="docs"]').click(); await sleep(500); await snap('dzui-03-docs'); hidePopover();
    const one = c.getObjects().find((o) => o.id !== '__board');
    c.setActiveObject(one); d.renderProps(); await sleep(200);
    const swb = document.querySelector('#dzProps [data-color]'); if (swb) swb.click(); await sleep(300); await snap('dzui-04-couleur'); hidePopover();
    d.contextMenu({ e: { clientX: 700, clientY: 400 }, target: one }); await sleep(300); await snap('dzui-05-menu'); hidePopover();
    d.exportSheet(); await sleep(400); await snap('dzui-06-export'); closeSheet();
    settings.appTheme = 'dark'; applyTheme(); await sleep(500); d.fit(); await snap('dzui-07-sombre'); settings.appTheme = 'light'; applyTheme(); await sleep(300);
    for (const w of [1100]) { await api.invoke('autotest:resize', { w, h: 900 }); await sleep(900); await snap(`dzui-08-w${w}`); }
    await api.invoke('autotest:resize', { w: 1520, h: 940 });
    await setMode('preview');
  }

  if (steps.includes('d3')) {
    const L = await import('./design/layer3d.js');
    const wrap = document.createElement('div'); wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff;display:flex;flex-wrap:wrap;gap:6px;padding:6px';
    document.body.append(wrap);
    for (const [rx, ry] of [[-12, 28], [-40, 98], [60, 0], [0, 90], [-80, 45]]) {
      const cv = await L.renderSpec('t1', { kind: 'decor', shape: 'tore', finish: 'chrome', color: '#ffffff', rx, ry }, {}, 300, 300);
      cv.style.cssText = 'width:300px;height:300px;outline:1px solid #ccc'; wrap.append(cv);
    }
    await snap('d3-tores');
    wrap.remove();
  }

  if (steps.includes('design')) {
    // NEX-DESIGN : formes, texte, dégradé, image et retouche, booléens, calques 3D, masque, export, documents.
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    await setMode('design');
    await waitFor(() => S.design && S.design.ready, 30000);
    const d = S.design;
    await sleep(600);
    await snap('dz-01-vide');
    const c = d.canvas;
    const n0 = c.getObjects().length;
    d.quickShape('rect'); const rect = c.getActiveObject();
    rect.set({ left: 80, top: 80 }); rect.setCoords();
    d.setFillKind('linear');
    d.quickShape('star'); const star = c.getActiveObject(); star.set({ left: 300, top: 120, fill: '#ffcc00' }); star.setCoords();
    d.quickShape('ellipse'); const ell = c.getActiveObject(); ell.set({ left: 380, top: 200, fill: '#ff2d55' }); ell.setCoords();
    log(`bornes étoile ${JSON.stringify(star.getBoundingRect())} ellipse ${JSON.stringify(ell.getBoundingRect())}`);
    d.selectList([star, ell]); d.bool('union');
    log(`union bornes ${JSON.stringify(c.getActiveObject().getBoundingRect())} d=${String(c.getActiveObject().path.slice(0, 2).map((x) => x.join(' ')))}`);
    const uni = c.getActiveObject();
    log(`design formes : objets=${c.getObjects().length - n0} union=${uni && uni.type} nom=${uni && uni.name}`);
    const t = d.addText(new Point(80, 760), { text: 'NEX-DESIGN', size: 110, weight: 800, noEdit: true, width: 900 });
    t.set('fill', '#111111');
    // Image générée (dégradé) puis retouche.
    const g = document.createElement('canvas'); g.width = 600; g.height = 400; const gx = g.getContext('2d'); const gr = gx.createLinearGradient(0, 0, 600, 400); gr.addColorStop(0, '#22d3ee'); gr.addColorStop(1, '#a855f7'); gx.fillStyle = gr; gx.fillRect(0, 0, 600, 400); gx.fillStyle = '#fff'; gx.font = 'bold 80px sans-serif'; gx.fillText('Photo', 160, 230);
    const img = await d.addImage(g.toDataURL('image/png'), 'Photo test');
    img.set({ left: 560, top: 520, scaleX: 0.7, scaleY: 0.7 }); img.setCoords();
    img.fx = { contrast: 0.2, saturation: 0.3, vintage: true }; d.applyFx(img);
    // Masque : ellipse au-dessus de l'image.
    const m = new (await import('fabric')).Ellipse({ left: 600, top: 540, rx: 180, ry: 120, fill: '#000' }); m.id = 'mask1'; c.add(m);
    d.selectList([img, m]); await d.mask();
    log(`design image : filtres=${img.filters.length} masque=${Boolean(img.clipPath)}`);
    // Calques 3D.
    const t0 = performance.now();
    const s1 = await d.add3d({ kind: 'decor', shape: 'tore', finish: 'chrome', color: '#ffffff' });
    s1.set({ left: 620, top: 40 }); s1.setCoords();
    const s2 = await d.add3d({ kind: 'text', text: 'NEXORA', color: '#6a4cff', finish: 'brillant', rx: -10, ry: 20 });
    s2.set({ left: 60, top: 380, scaleX: s2.scaleX * 1.4, scaleY: s2.scaleY * 1.4 }); s2.setCoords();
    await d.addDevice3d();
    const dev = c.getActiveObject();
    if (dev && dev.type === 'layer3d') { dev.set({ left: 760, top: 300 }); dev.setCoords(); }
    log(`design 3D : ${c.getObjects().filter((o) => o.type === 'layer3d').length} calque(s) en ${Math.round(performance.now() - t0)} ms, appareil=${dev && dev.spec && dev.spec.kind}`);
    c.discardActiveObject(); c.requestRenderAll();
    await sleep(500);
    await snap('dz-02-compo');
    // Rotation 3D à la souris (simulée) : nouvelle vue.
    d.setOrbit(s1); s1.spec.ry += 70; s1.spec.rx = -40; await (await import('./design/layer3d.js')).refreshLayer(s1, d.doc.assets); c.setActiveObject(s1); c.requestRenderAll();
    await sleep(400);
    await snap('dz-03-orbite-props');
    d.setOrbit(null);
    c.setActiveObject(t); d.renderProps(); await sleep(300); await snap('dz-04-texte-props');
    c.setActiveObject(img); d.renderProps(); await sleep(300); await snap('dz-05-image-props');
    c.setActiveObject(rect); d.renderProps(); await sleep(300); await snap('dz-06-rect-props');
    // Historique.
    const before = c.getObjects().length;
    d.remove(); await sleep(300);
    await d.undo(); await sleep(1500);
    log(`design annuler : avant=${before} après suppression puis annulation=${c.getObjects().length} 3D rendus=${c.getObjects().filter((o) => o.type === 'layer3d' && o.width > 10).length}`);
    // Panneaux.
    for (const tab of ['pages', 'assets', 'layers']) { d.leftTab = tab; d.renderLeft(); await sleep(250); await snap(`dz-07-${tab}`); }
    // Export.
    const files = [];
    for (const format of ['png', 'svg', 'pdf']) { const r = await d.exportPages({ format, scale: '1', transparent: false }); files.push(`${format}:${r[0] ? r[0].split('/').pop() : 'ÉCHEC'}`); }
    log(`design export : ${files.join(' | ')}`);
    // Enregistrement et réouverture.
    await d.save();
    const { getDoc } = await import('./design/store.js');
    const back = await getDoc(d.doc.id);
    log(`design enregistré : pages=${back.pages.length} objets=${back.pages[0].json.objects.length} assets=${Object.keys(back.assets).length} aperçu=${Boolean(back.thumb)}`);
    // Nouvelle page.
    await d.pageAction('dup'); await sleep(800);
    log(`design pages : ${d.doc.pages.length} active=${d.pageIdx} objets=${c.getObjects().length}`);
    await snap('dz-08-page2');
    for (const w of [1100]) { await api.invoke('autotest:resize', { w, h: 900 }); await sleep(900); await snap(`dz-09-w${w}`); }
    await api.invoke('autotest:resize', { w: 1520, h: 940 });
    await setMode('preview');
  }

  if (steps.includes('maquettes')) {
    // Studio › Maquettes : mise en scène des appareils du Responsive Lab + scènes photo réalistes.
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    await setMode('studio');
    await waitFor(() => S.studio && S.studio.ready, 30000);
    const st = S.studio;
    settings.studioMockupMode = 'scene';
    await st.setSpace('mockup');
    const ps = await import('./viewer/poses.js');
    await waitFor(() => ps.posesStage() && ps.posesStage().items.length, 30000);
    await sleep(800);
    log(`maquettes : ${ps.posesStage() ? ps.posesStage().items.length : 0} appareil(s)`);
    await snap('mq-01-scene');
    for (const k of ['bureau', 'marbre', 'atelier', 'nuit']) {
      const t0 = performance.now();
      await ps.applyPhotoScene(k); await sleep(500);
      log(`scène ${k} : ${Math.round(performance.now() - t0)} ms`);
      await snap(`mq-02-${k}`);
    }
    const t0 = performance.now();
    const file = await ps.posesStage().root.querySelector('[data-ps="png"]').click();
    void file;
    await sleep(4000);
    log(`export image lancé (${Math.round(performance.now() - t0)} ms)`);
    await ps.applyPhotoScene('studio');
    settings.studioMockupMode = 'libre';
    st.mockup.leave(); await st.mockup.enter(); st.renderSpaceLeft(); st.renderProps();
    await sleep(800);
    await snap('mq-03-libre');
    settings.studioMockupMode = 'scene';
    await st.setSpace('scene');
    await sleep(600);
    await snap('mq-04-retour-scene');
    await setMode('preview');
  }

  if (want('ident')) {
    // Reconnaissance d'identité d'un site (App Builder).
    await setMode('android'); await sleep(1500);
    const ab = S.android;
    ab.act_app_new();
    for (const u of [cfg.url.replace(/\/$/, '') + '/brand.html', cfg.url.replace(/\/$/, '') + '/pwa.html']) {
      ab.set('source.kind', 'url'); ab.set('source.url', u, { rerender: true });
      const r = await ab.act_detect(null, { force: true, quiet: true });
      const id = r.identity || {};
      log(`ident ${u.split('/').pop()} : nom=${ab.cfg.appName} court=${ab.cfg.twa.launcherName} id=${ab.cfg.appId} marque=${id.brand} theme=${id.theme} fond=${id.background} langue=${id.lang} logos=${(id.logos || []).map((l) => l.kind + ':' + l.size).join(',')} icone=${Boolean(ab.cfg.icon.image)} iconBg=${ab.cfg.icon.bg} fab=${ab.cfg.config.fab.value} nav=${(id.nav || []).map((x) => x.label).join('/')}`);
      ab.section = 'identity'; ab.renderNav(); ab.renderForm(); await sleep(800);
      await snap(`ident-${u.split('/').pop().replace('.html', '')}`);
    }
    await setMode('preview');
  }

  if (want('sync')) {
    // Synchronisation des espaces sur le projet / site ouvert.
    const A = cfg.url.replace(/\/$/, '') + '/brand.html';
    const B = 'http://localhost:4599/ok.html';
    await openUrl(A); await settle();
    await setMode('browser'); await waitFor(() => S.browserLab, 20000); await sleep(2500);
    log(`sync browser : ${S.browserLab.url}`);
    await setMode('android'); await waitFor(() => S.android, 20000); await sleep(1500);
    const ab = S.android;
    log(`sync android : app=${ab.cfg.appName || '—'} source=${ab.cfg.source.url} barre=${Boolean(document.querySelector('.ab-syncbar'))}`);
    await setMode('preview'); await openUrl(B); await settle();
    await setMode('browser'); await sleep(2500);
    log(`sync browser après changement : ${S.browserLab.url}`);
    await setMode('android'); await sleep(1500);
    log(`sync android après changement : source=${ab.cfg.source.url} barre=${Boolean(document.querySelector('.ab-syncbar'))}`);
    await snap('sync-android');
    const bar = document.querySelector('.ab-syncbar [data-sync="new"]');
    if (bar) { bar.click(); await sleep(4000); }
    log(`sync android nouvelle app : ${ab.cfg.appName} source=${ab.cfg.source.url} apps=${settings.android.apps.length}`);
    // Projet local : le Dev Lab ouvre le même dossier.
    await setMode('preview');
    await openProjectDir('/home/claude/t-site'); await sleep(4000);
    await setMode('dev'); await waitFor(() => S.devLab, 30000); await sleep(4000);
    log(`sync dev : racine=${S.devLab.st.root}`);
    await snap('sync-dev');
    await setMode('studio'); await waitFor(() => S.studio && S.studio.ready, 40000); await sleep(2000);
    log(`sync studio : site=${S.studio.siteUrl()}`);
    await setMode('preview');
  }

  if (want('maint')) {
    const m = await import('./core/maintenance.js');
    m.openMaintenance(); await sleep(600); await snap('maint-sheet'); closeSheet();
    try { await api.invoke('android:test-run', { serial: 'x', apk: '/nope.apk', appId: 'a.b' }); } catch (e) { log(`maint erreur propre : ${e.message}`); }
    await setMode('android'); await sleep(1500); S.android.section = 'publish'; S.android.renderNav(); S.android.renderForm(); await sleep(400);
    await S.android.act_devices(); await sleep(300); await snap('maint-usb');
    log(`maint aide USB : ${Boolean(document.querySelector('.ab-usbhelp'))}`);
    await setMode('preview');
  }

  if (want('home')) {
    await setMode('home'); await waitFor(() => S.home, 10000); await sleep(800);
    log(`home : projets=${document.querySelectorAll('.hm-card').length} espaces=${document.querySelectorAll('.hm-space').length}`);
    await snap('home');
    const c = document.querySelector('.hm-card [data-h-go="preview"]');
    if (c) { c.click(); await sleep(4000); log(`home ouverture : mode=${settings.mode} source=${S.source && (S.source.url || S.source.dir)}`); }
    await setMode('home'); await sleep(600); await snap('home-cur');
    await setMode('preview');
  }

  if (want('tour')) {
    settings.tourDone = false;
    const t = await import('./core/tour.js');
    t.startTour({ force: true }); await sleep(1500);
    for (let k = 0; k < 17; k++) {
      await waitFor(() => document.querySelector('.tour-card h3'), 30000);
      const n = document.querySelector('.tour-n'); const h = document.querySelector('.tour-card h3');
      log(`tour ${n ? n.textContent : '?'} : ${h ? h.textContent : '?'} spot=${document.querySelector('.tour-spot').style.display !== 'none'}`);
      if ([0, 2, 7, 11, 13].includes(k)) await snap(`tour-${k}`);
      const nb = document.querySelector('.tour-card [data-t="next"]'); if (!nb) break;
      nb.click(); await sleep(k > 5 ? 2500 : 900);
    }
    await setMode('preview');
  }

  if (want('mockup')) {
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    await setMode('studio'); await waitFor(() => S.studio && S.studio.ready, 40000); await sleep(1000);
    const st = S.studio;
    settings.studioMockupMode = 'libre';
    await st.setSpace('mockup'); await sleep(800);
    const mk = st.mockup;
    const shot = await api.invoke('media:url', `${cfg.media}/seq/f001.png`);
    const blob = await (await fetch(shot)).blob();
    await mk.placeFiles([new File([blob], 'capture.png', { type: 'image/png' })], null);
    await sleep(500); await snap('mk-1-defaut');
    for (const [tpl, n] of [['launch', 2], ['app', 3], ['web', 4], ['story', 5], ['iso', 6]]) {
      mk.applyTemplate(tpl); await sleep(700);
      // Toutes les cases reçoivent la capture pour juger le rendu.
      for (const sl of mk.doc.slots) if (!sl.media) sl.media = mk.doc.slots.find((q) => q.media) ? mk.doc.slots.find((q) => q.media).media : null;
      mk.draw(); await sleep(300); await snap(`mk-${n}-${tpl}`);
    }
    mk.applyTemplate('launch'); await sleep(500);
    mk.sel = mk.doc.slots[0].id; st.renderProps(); mk.draw(); await sleep(400); await snap('mk-7-reglages');
    mk.sel = null; st.renderProps(); await sleep(200);
    log(`mockup : maquettes=${mk.docs.length} éléments=${mk.doc.slots.length} sections réglages=${document.querySelectorAll('#stProps .st-sec').length} boutonTexteIA=${!!document.querySelector('[data-mka="text-ai"]')}`);
    mk.doc.slots[0].style = 'glass-light'; mk.doc.slots[0].shadow = { mode: 'adaptive', opacity: 60 }; mk.doc.slots[0].gloss = 0.5; mk.draw(); await sleep(300); await snap('mk-8-verre');
    mk.sel = null; st.renderProps();
    const t0 = performance.now();
    await mk.exportImage(); log(`mockup image exportée en ${Math.round(performance.now() - t0)} ms`);
    mk.doc.anim = { preset: 'tilt', dur: 2 };
    const t1 = performance.now();
    await mk.exportVideo(); log(`mockup vidéo exportée en ${Math.round(performance.now() - t1)} ms`);
    mk.undo(); mk.undo(); log(`mockup annuler : ok`);
    await st.setSpace('scene'); await sleep(1200);
    log(`mockup retour scène : espace=${st.space} scène visible=${!document.querySelector('#studio .st-frame').closest('.st').classList.contains('mk-on')}`);
    await setMode('preview');
  }

  if (want('voice')) {
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    await setMode('studio'); await waitFor(() => S.studio && S.studio.ready, 40000); await sleep(800);
    const st = S.studio; await st.setSpace('ad'); await sleep(3000);
    const oc = new OfflineAudioContext(1, 48000 * 4, 48000); const o = oc.createOscillator(); o.connect(oc.destination); o.start(); const buf = await oc.startRendering();
    await st.applyVoice(buf, 'Découvre Marché Dantokpa. Commande en deux minutes, livraison partout à Cotonou ! Les meilleurs prix de gros, chaque jour.', 'Test');
    st.time = 1.2; st.applyTime(); st.drawOverlay(); await sleep(400); await snap('voice-subs');
    log(`voix : sous-titres=${st.subtitles.length} musique=${st.music && st.music.name} durée=${st.anim.duration} cartes=${document.querySelectorAll('#stProps [data-music="srt"]').length}`);
    await setMode('preview');
  }

  if (want('lot4')) {
    await setMode('android'); await waitFor(() => S.android, 20000); await sleep(1500);
    const ab = S.android;
    for (const sec of ['notifs', 'remote', 'store']) { ab.section = sec; ab.renderNav(); ab.renderForm(); await sleep(500); await snap(`lot4-${sec}`); }
    ab.cfg.remote.announcement = { ...ab.cfg.remote.announcement, enabled: true, title: 'Bienvenue', text: 'Nouvelle version' };
    ab.cfg.remote.minVersionCode = 3;
    log(`lot4 json distant : ${ab.remoteJson().replace(/\s+/g, ' ')}`);
    const sp = await ab.spec(); log(`lot4 spec remote=${JSON.stringify(sp.remote)} config ok=${Boolean(sp.config && 'linkRules' in sp.config)}`);
    try { await api.invoke('android:play-check', { appId: 'com.x.y' }); } catch (e) { log(`lot4 play sans clé : ${e.message}`); }
    await setMode('preview');
  }

  if (want('notif')) {
    await setMode('android'); await waitFor(() => S.android, 20000); await sleep(1200);
    const ab = S.android;
    for (const sec of ['events', 'push', 'notifs']) { ab.section = sec; ab.renderNav(); ab.renderForm(); await sleep(500); await snap(`notif-${sec}`); }
    // Les deux options doivent se retrouver dans la configuration de l'application générée.
    ab.cfg.config.events = { enabled: true, network: true, download: true, update: true, channel: 'Activité' };
    ab.cfg.push = { ...ab.cfg.push, enabled: true };
    const sp = await ab.spec();
    log(`notif events dans cfg=${JSON.stringify(sp.config.events)} push=${sp.push ? sp.push.enabled : '?'}`);
    await setMode('preview');
  }

  if (want('ghpanel')) {
    await setMode('dev'); await waitFor(() => S.devLab, 20000); await sleep(1000);
    const dev = S.devLab;
    if (cfg.devDir) { await dev.openFolder(cfg.devDir); await sleep(600); }
    // Fixtures : on rend directement les vues du dépôt pour vérifier l'affichage sans réseau ni jeton.
    const info = { full: 'abraham/demo', name: 'demo', description: 'Boutique de démonstration', private: true, homepage: '', branch: 'main', stars: 12, forks: 3, issues: 4, watchers: 2, language: 'JavaScript', license: 'MIT', topics: ['benin', 'e-commerce'] };
    const pulls = [{ number: 7, title: 'Nouveau tunnel de paiement', state: 'open', draft: false, url: '#', head: 'feature-paiement', base: 'main', author: 'abraham', updated: new Date().toISOString(), comments: 2 }];
    const issues = [{ number: 11, title: 'Le panier se vide au rechargement', state: 'open', url: '#', author: 'cliente', updated: new Date().toISOString(), comments: 1, labels: ['bug'] }];
    const runs = [{ id: 1, name: 'CI', title: 'Ajout paiement', status: 'completed', conclusion: 'success', branch: 'main', event: 'push', url: '#', number: 42, created: new Date().toISOString() }, { id: 2, name: 'CI', title: 'WIP', status: 'in_progress', conclusion: null, branch: 'feature-paiement', event: 'pull_request', url: '#', number: 43, created: new Date().toISOString() }];
    const releases = [{ id: 1, tag: 'v1.0.0', name: 'Première version', draft: false, prerelease: false, url: '#', published: new Date().toISOString(), author: 'abraham' }];
    const gh = dev.github;
    gh.me = { login: 'abraham', name: 'Abraham', avatar: '', email: 'x@users.noreply.github.com' };
    dev.git.st = { repo: true, branch: 'feature-paiement', branches: ['main', 'feature-paiement'], remote: 'https://github.com/abraham/demo.git', full: 'abraham/demo', files: [], ahead: 2, behind: 1 };
    gh.el = dev.$.side; gh.view = 'repo';
    dev.setSide('github'); await sleep(300);
    const bodyFor = { overview: () => gh.overviewHtml(info), pulls: () => gh.pullsHtml(pulls), issues: () => gh.issuesHtml(issues), actions: () => gh.actionsHtml(runs), releases: () => gh.releasesHtml(releases) };
    for (const t of ['overview', 'pulls', 'issues', 'actions', 'releases']) {
      gh.repoTab = t;
      dev.$.side.innerHTML = `<div class="dk-side-head"><b>${'GitHub'}</b></div>${gh.repoHtml()}`;
      dev.$.side.querySelector('.dk-repo-body').innerHTML = bodyFor[t]();
      await sleep(350);
      await snap(`ghpanel-${t}`);
    }
    log(`ghpanel rendu : onglets=overview/pulls/issues/actions/releases full=${gh.repoFull()}`);
    await setMode('preview');
  }

  if (want('inspai')) {
    await setMode('android'); await waitFor(() => S.android, 20000); await sleep(1000);
    const ab = S.android;
    ab.cfg.source.kind = 'url'; ab.cfg.source.url = cfg.url;
    ab.section = 'pwa'; ab.renderNav(); ab.renderForm(); await sleep(300);
    await ab.act_pwa_inspect();
    await sleep(600);
    const hasAi = !!document.querySelector('[data-act="pwa-ai"]');
    log(`inspai rapport=${!!ab.cfg.pwa.report} carte IA présente=${hasAi}`);
    // Simule une réponse IA pour vérifier le rendu (sans appel réseau).
    const out = document.querySelector('.ab-ai-out');
    if (out) {
      const { renderMd } = await import('./core/md.js');
      out.hidden = false;
      out.innerHTML = `<div class="ab-ai-md">${renderMd('## Ajouter un manifest\nAjoute dans le `<head>` :\n```html\n<link rel="manifest" href="/manifest.json">\n```\n- **name** et **short_name**\n- une icône 512×512')}</div>`;
    }
    await snap('inspai-report');
    await setMode('preview');
  }

  if (want('pwagen')) {
    await openProjectDir('/home/claude/t-site'); await settle();
    await setMode('android'); await waitFor(() => S.android, 20000); await sleep(1200);
    const ab = S.android;
    ab.cfg.source.kind = 'project'; ab.cfg.source.dir = '/home/claude/t-site'; ab.set('appName', 'Boutique'); ab.set('appId', 'com.vitrine.boutique');
    ab.section = 'pwa'; ab.renderNav(); ab.renderForm(); await sleep(500);
    const m = ab.pwaManifest();
    log(`pwagen manifest : name=${m.name} desc=${(m.description||'').slice(0,20)} display_override=${!!m.display_override} edge=${!!m.edge_side_panel} icons=${m.icons.length}`);
    const r = await api.invoke('android:pwa-inject', { dir: '/home/claude/t-site', manifest: m, strategy: 'offline', version: '1', icons: {}, offline: { name: 'Boutique' } });
    log(`pwagen copie : dest=${r.dest.split('/').pop()} racine=${r.root.split('/').pop()} pages=${r.pages} type=${r.framework}`);
    await setMode('preview');
  }

  if (want('backs')) {
    // Rendu réel des dos d'appareils (module photo, matières) sur fond studio clair.
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    await setMode('studio'); await waitFor(() => S.studio && S.studio.ready, 40000); await sleep(800);
    const st = S.studio;
    await st.setSpace('scene'); await sleep(500);
    for (const id of [...st.order]) st.remove(id, { history: false });
    const { AMBIANCES } = await import('./studio/scene.js');
    const sets = cfg.backSets || [['iphone-18-pro', 'galaxy-s26-ultra', 'pixel-10-pro', 'tecno-camon']];
    let k = 0;
    for (const set of sets) {
      for (const id of [...st.order]) st.remove(id, { history: false });
      set.forEach((devId, i) => { st.addDevice({ deviceId: devId, pos: [(i - (set.length - 1) / 2) * 9.5, 0, 0], rot: [0, 205, 0] }, { select: false, history: false }); });
      st.three.applyEnv({ ...st.three.env, ...AMBIANCES.apple[1] }, st.bgImageEl);
      st.frameAll(false, null);
      await sleep(1200);
      st.dirty = true; await sleep(800);
      await snap(`backs-${k += 1}`);
    }
    log(`backs : ${sets.flat().length} appareil(s) rendus de dos`);
    await setMode('preview');
  }

  if (want('cams')) {
    // Diagnostic : chaque téléphone/tablette a-t-il des objectifs au dos, visibles (non enfoncés) ?
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    await setMode('studio'); await waitFor(() => S.studio && S.studio.ready, 40000); await sleep(800);
    const { DeviceModel } = await import('./studio/models.js');
    const { DEVICES } = await import('./devices/catalog.js');
    const T = await import('./studio/three.js');
    const PHONES = ['iphone', 'samsung', 'pixel', 'xiaomi', 'huawei', 'bbk', 'transsion', 'moto', 'generic', 'foldable', 'tablet'];
    const bad = [];
    let ok = 0;
    for (const d of DEVICES.filter((x) => PHONES.includes(x.category) && !x.hidden)) {
      let m;
      try { m = new DeviceModel({ deviceId: d.id }, { renderer: S.studio.three.renderer, custom: [] }); } catch (e) { bad.push(`${d.id} : erreur ${e.message}`); continue; }
      m.root.updateMatrixWorld(true);
      const all = new T.Box3().setFromObject(m.root);
      const lb = new T.Box3();
      let n = 0;
      m.root.traverse((o) => { if (o.isMesh && o.material && o.material.iridescence > 0) { n += 1; lb.expandByObject(o); } });
      const lenses = Math.round(n);
      const depth = all.max.z - all.min.z;
      const recessed = lenses && (lb.min.z - all.min.z) > depth * 0.08; // une autre pièce dépasse nettement les objectifs
      if (!lenses) bad.push(`${d.id} (${d.name}) : AUCUN objectif`);
      else if (recessed) bad.push(`${d.id} (${d.name}) : objectifs enfoncés de ${((lb.min.z - all.min.z) / depth * 100).toFixed(0)} %`);
      else ok += 1;
      if (m.dispose) m.dispose();
    }
    log(`cams : ${ok} appareil(s) corrects, ${bad.length} problème(s)`);
    for (const b of bad) log(`  ✗ ${b}`);
    await setMode('preview');
  }

  if (want('secerr')) {
    await setMode('security'); await waitFor(() => S.security, 10000); await sleep(600);
    const sc = S.security;
    const url = cfg.errUrl || cfg.url;
    document.querySelector('[data-sec-url]').value = url;
    await sc.scan();
    const pe = sc.pageErr;
    log(`secerr audit : note=${sc.report && sc.report.score} | erreurs JS=${pe && pe.errors.length} avertissements=${pe && pe.warnings.length} ressources en échec=${pe && pe.failed.length} chargement=${pe && pe.loadMs} ms`);
    if (pe) { for (const e of pe.errors) log(`  JS : ${e.message.slice(0, 90)}`); for (const f of pe.failed) log(`  échec : ${f.status} ${f.url.split('/').pop()}`); }
    log(`secerr bloc santé affiché=${!!document.querySelector('.sec-health')}`);
    await sleep(400); await snap('secerr-audit');
    // Supervision : site avec « Erreurs de la page »
    sc.switchTab('supervision'); await sleep(500);
    sc.mon.endpoints = [{ id: 'errtest', name: 'Page à erreurs', url, intervalSec: 30, thresholdMs: 2000, enabled: true, watchErrors: true }];
    sc.mon = await api.invoke('mon:set-endpoints', sc.mon.endpoints);
    await sc.renderMonitor();
    const rep = await api.invoke('mon:check-errors', 'errtest');
    log(`secerr supervision : relevé JS=${rep && rep.errors.length} échecs=${rep && rep.failed.length}`);
    await sc.renderMonitor();
    await sc.monAction('errors|0'); await sleep(600);
    log(`secerr panneau=${!!document.querySelector('.mon-errpanel:not([hidden]) .mon-erow')} direct=${!!document.querySelector('.mon-live')} badge=${(document.querySelector('.mon-err') || {}).textContent || '—'}`);
    await snap('secerr-supervision');
    await setMode('preview');
  }

  if (want('sec')) {
    await setMode('security'); await waitFor(() => S.security, 10000); await sleep(600);
    const sc = S.security;
    document.querySelector('[data-sec-url]').value = cfg.url;
    const r = await api.invoke('sec:scan', { url: cfg.url });
    log(`sec : note=${r.score} critiques=${r.counts.critical} eleves=${r.counts.high} moyens=${r.counts.medium} faibles=${r.counts.low} constats=${r.findings.length}`);
    for (const f of r.findings.slice(0, 8)) log(`  - [${f.sev}] ${f.cat} : ${f.title}`);
    sc.report = r; sc.renderReport(); await sleep(500); await snap('sec-report');
    // Supervision
    sc.switchTab('supervision'); await sleep(600);
    await sc.monAction('add-current'); await sleep(2500);
    const sum = await api.invoke('mon:summary');
    log(`mon : sites=${sum.length} premier=${sum[0] && sum[0].name} up=${sum[0] && sum[0].last && sum[0].last.up} ms=${sum[0] && sum[0].last && sum[0].last.ms}`);
    await snap('sec-supervision');
    const te = await api.invoke('mon:test-alert', 'telegram');
    log(`mon test telegram sans config : ok=${te.ok} err=${(te.error||'').slice(0,40)}`);
    await setMode('preview');
  }

  if (want('dup')) {
    // Doublons : ouverture rapide des espaces, puis comptage des instances et des fenêtres.
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    document.querySelector('#modeSeg [data-mode="studio"]').click();
    document.querySelector('#modeSeg [data-mode="studio"]').click();
    await sleep(200);
    document.querySelector('#modeSeg [data-mode="android"]').click();
    document.querySelector('#modeSeg [data-mode="studio"]').click();
    await waitFor(() => S.studio && S.studio.ready, 40000); await sleep(3000);
    log(`dup : studios=${document.querySelectorAll('#studio .st').length} timelines=${document.querySelectorAll('#studio .tl-bar').length} camnav=${document.querySelectorAll('.st-camnav').length}`);
    // Clic sur « Importer » : nombre de menus ouverts.
    let opens = 0;
    const pop = document.querySelector('#popover');
    const mo = new MutationObserver(() => { opens += 1; });
    mo.observe(pop, { attributes: true, attributeFilter: ['hidden'] });
    document.querySelector('#studio [data-st="import"]').click(); await sleep(400);
    log(`dup : changements du menu Importer=${opens} visible=${!pop.hidden}`);
    hidePopover();
    for (const sp of ['mockup', 'deck', 'scene', 'mockup']) { document.querySelector(`#studio button[data-space="${sp}"]`).click(); await sleep(150); log(`dup : clic ${sp} → espace=${S.studio.space} voulu=${S.studio._spaceWant} occupé=${Boolean(S.studio._spaceBusy)}`); }
    await sleep(8000);
    log(`dup : espace=${S.studio.space} boutons espaces=${document.querySelectorAll('#studio button[data-space].on').length}`);
    // Publicité : clic sur un autre modèle et un autre format → doivent être pris en compte.
    const tpls = [...document.querySelectorAll('#studio [data-tpl]')];
    const tgt = tpls.find((b) => !b.classList.contains('on'));
    if (tgt) { tgt.click(); await sleep(6000); }
    log(`dup : modèle pub demandé=${tgt && tgt.dataset.tpl} actif=${S.studio.adState().tpl}`);
    const fm = [...document.querySelectorAll('#studio [data-format]')].find((b) => !b.classList.contains('on'));
    if (fm) { fm.click(); await sleep(5000); }
    log(`dup : format demandé=${fm && fm.dataset.format} actif=${S.studio.adState().format}`);
    await snap('dup-ad');
    // Présentation : ajout d'une diapositive puis navigation entre diapositives.
    document.querySelector('#studio button[data-space="deck"]').click(); await sleep(6000);
    const nBefore = S.studio.deckState().slides.length;
    await S.studio.deckAction('dup', null); await sleep(4000);
    const slides = [...document.querySelectorAll('#studio [data-slide]')];
    log(`dup : diapositives ${nBefore} -> ${slides.length}`);
    slides[0].click(); await sleep(3000);
    const a0 = S.studio.deckCur;
    const sl2 = [...document.querySelectorAll('#studio [data-slide]')]; sl2[sl2.length - 1].click(); await sleep(4000);
    document.querySelector('#studio [data-slide="1"]')?.click(); await sleep(3500);
    log(`dup : puis diapositive 2 -> ${S.studio.deckCur}`);
    log(`dup : navigation diapositives ${a0} -> ${S.studio.deckCur}`);
    await snap('dup-deck');
    // Double-clic sur Exporter : un seul menu/feuille.
    const ex = document.querySelector('#studio [data-st="video"]');
    if (ex) { ex.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); ex.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 })); await sleep(500); log(`dup : export double-clic popover visible=${!pop.hidden} feuille=${!document.querySelector('#sheetBackdrop').hidden}`); hidePopover(); closeSheet(); }
    await setMode('preview');
  }

  if (want('lot3')) {
    const MD = cfg.media;
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    await setMode('studio'); await waitFor(() => S.studio && S.studio.ready, 30000); await sleep(800);
    const st = S.studio;
    await st.setSpace('scene'); st.clearScene(); st.setDuration(8);
    // Calques 2D.
    const v1 = st.addVector({ shape: 'round', fill: '#0a84ff', fill2: '#bf5af2', w: 24, h: 12, pos: [-14, 10, 4], shadow: 1 });
    st.addVector({ shape: 'star', fill: '#ffd60a', stroke: '#1d1d1f', strokeW: 0.4, w: 10, h: 10, pos: [14, 14, 4] });
    st.addVector({ shape: 'arrow', fill: '#34c759', w: 18, h: 7, pos: [0, 26, 2] });
    // Vidéo et séquence d'images.
    const url = await api.invoke('media:url', `${MD}/clip.mp4`);
    log(`lot3 url vidéo : ${Boolean(url)}`);
    const vid = await st.addMediaFiles('video', [{ path: `${MD}/clip.mp4`, name: 'clip.mp4', url }]);
    const seqFiles = [];
    for (let i = 1; i <= 12; i++) { const p = `${MD}/seq/f${String(i).padStart(3, '0')}.png`; seqFiles.push({ path: p, url: await api.invoke('media:url', p) }); }
    const seq = await st.addMediaFiles('sequence', seqFiles);
    log(`lot3 vidéo : ${vid ? `${vid.kind} plan ${vid.clip.start}-${vid.clip.end.toFixed(2)}` : 'ÉCHEC'} séquence : ${seq ? seq.mediaPaths.length : 'ÉCHEC'}`);
    if (vid) { const o = st.objects.get(vid.id); o.item.pos = [0, 4, -6]; st.applyItemTransform(o); }
    if (seq) { const o = st.objects.get(seq.id); o.item.pos = [22, 2, 0]; o.item.height = 10; st.build(o.item); o.item.clip.start = 2; o.item.clip.end = 6; }
    // Plan sur la forme : visible de 1 à 5 s.
    const vit = st.objects.get(v1.id).item; vit.clip = { start: 1, end: 5, tin: 'slideL', tout: 'fade', fin: 0.6, fout: 0.6 };
    st.frameAll(false);
    for (const t of [0.2, 1.3, 3, 5.6]) {
      st.setTime(t);
      // eslint-disable-next-line no-await-in-loop
      const w = st.applyClips({ exact: true }); if (w) await w;
      // eslint-disable-next-line no-await-in-loop
      await sleep(300);
      const vo = vid && st.objects.get(vid.id);
      log(`lot3 t=${t} forme visible=${st.objects.get(v1.id).model.root.visible} vidéo=${vo ? vo.item.videoEl.currentTime.toFixed(2) : '-'} séquence image=${seq ? st.objects.get(seq.id).seqFrame : '-'}`);
    }
    st.setTime(3); await sleep(500); await snap('91-lot3-calques-medias');
    st.select(v1.id); await sleep(300); await snap('91-lot3-props-forme');
    if (vid) { st.select(vid.id); await sleep(300); await snap('91-lot3-props-video'); }
    // Caméra : boutons et mouvement.
    const before = st.three.camera.position.toArray().map((x) => x.toFixed(1)).join(',');
    document.querySelector('.st-camnav [data-cn="left"]').click(); document.querySelector('.st-camnav [data-cn="in"]').click();
    log(`lot3 caméra : ${before} → ${st.three.camera.position.toArray().map((x) => x.toFixed(1)).join(',')}`);
    st.cameraMove('orbit');
    log(`lot3 trajectoire : ${(st.anim.tracks.camera || []).length} clés`);
    // Export vidéo court (images des vidéos à l'image près).
    st.setDuration(3);
    const t0 = performance.now();
    const file = await st.exportVideo({ vsize: '720', vformat: 'mp4' }).catch((e) => `erreur ${e.message}`);
    log(`lot3 export : ${file} en ${Math.round(performance.now() - t0)} ms`);
    st.setDuration(8);
    // Présentations multiples et navigation entre diapositives.
    await st.setSpace('deck');
    await st.deckAction('new-deck');
    const dk = st.deckState();
    dk.slides.push(...['stats', 'contact'].map((l) => ({ ...dk.slides[0], id: `t${l}`, layout: l, title: `Diapo ${l}`, scene: null, thumb: null })));
    await st.openSlide(0);
    st.openSlide(1); st.openSlide(2); await st.openSlide(1);
    log(`lot3 présentations : ${st.decks().length}, ouverte « ${dk.name} », diapositive ${st.deckCur}`);
    const first = st.decks()[0].id;
    await st.openDeck(first);
    log(`lot3 retour : « ${st.deckState().name} » diapositive ${st.deckCur}`);
    await sleep(600); await snap('92-lot3-presentations');
    // IA qui pilote le Studio.
    await api.invoke('ai:connect', { provider: 'custom', key: 'cle-de-test', baseUrl: 'http://127.0.0.1:8799/v1' });
    const ai = await import('./core/ai.js');
    await ai.aiStatus(true);
    await ai.askAssistant('Crée-moi une publicité animée pour présenter ce produit');
    await waitFor(() => document.querySelector('.ai-drawer .ai-report'), 60000).catch(() => {});
    const rep = document.querySelector('.ai-drawer .ai-report summary');
    log(`lot3 IA : ${rep ? rep.textContent : 'pas de compte rendu'} ; espace=${st.space} objets=${st.order.length} durée=${st.anim.duration}`);
    await sleep(800); await snap('93-lot3-ia');
    await ai.toggleAssistant(false);
    await api.invoke('ai:remove', { provider: 'custom' });
    await setMode('preview');
  }

  if (want('setup')) {
    const su = await import('./core/setup.js');
    delete settings.setup;
    await su.openSetup(); await sleep(1500); await snap('84-outils');
    const run = su.runSetup(['tunnel']); await sleep(1200); await snap('84-outils-encours');
    await run; await sleep(600);
    const l = await api.invoke('tunnel:list');
    log(`setup : cloudflared=${l.cloudflared} reste=${JSON.stringify(settings.setup.pending)}`);
    await snap('84-outils-fin');
    document.querySelector('[data-su-act="later"]')?.click();
  }

  if (want('barfidelity')) {
    await setMode('android'); await waitFor(() => S.android, 20000); await sleep(1200);
    const ab = S.android;
    Object.assign(ab.cfg, { appName: 'Thème', engine: 'webview' });
    ab.cfg.source.kind = 'url'; ab.cfg.source.url = cfg.url; ab.cfg.config.statusMode = 'auto'; ab.cfg.config.navMode = 'auto'; ab.cfg.config.tabs = [];
    ab.save();
    ab.section = 'look'; ab.renderNav(); ab.renderForm(); ab.preview = 'app'; ab.renderPreview();
    await waitFor(() => ab.autoTop, 15000); await sleep(1500);
    log(`barfidelity autoTop=${ab.autoTop} autoBottom=${ab.autoBottom} (attendu haut≈#6d28d9/#9333ea, bas≈#4c1d95)`);
    await snap('bar-fidelity');
    await setMode('preview');
  }

  if (want('push')) {
    await setMode('android'); await waitFor(() => S.android, 20000); await sleep(1500);
    const ab = S.android;
    const appId = 'com.vitrine.boutiquetest';
    const gs = JSON.stringify({
      project_info: { project_number: '123456789012', project_id: 'vitrine-test', storage_bucket: 'vitrine-test.appspot.com' },
      client: [{ client_info: { mobilesdk_app_id: '1:123456789012:android:abcdef0123456789', android_client_info: { package_name: appId } }, api_key: [{ current_key: 'AIzaSyTEST-not-a-real-key-000000000000' }] }],
      configuration_version: '1',
    });
    Object.assign(ab.cfg, { appName: 'Test Push', appId });
    ab.cfg.source.kind = 'url'; ab.cfg.source.url = 'https://example.com/'; ab.cfg.engine = 'webview';
    const parsed = await api.invoke('android:push-parse', { text: gs, appId });
    log(`push parse : ok=${parsed.ok} projet=${parsed.projectId}`);
    const bad = await api.invoke('android:push-parse', { text: gs, appId: 'com.autre.app' });
    log(`push parse mauvais id : ${bad.ok} « ${String(bad.error).slice(0, 70)} »`);
    Object.assign(ab.cfg.push, { enabled: true, googleServices: gs, project: { id: 'vitrine-test', sender: '123456789012', app: appId }, topicsText: 'all, promos' });
    ab.save();
    ab.section = 'push'; ab.renderNav(); ab.renderForm(); ab.preview = 'app'; ab.renderPreview();
    await sleep(1500);
    await snap('88-push-section');
    const t0 = performance.now();
    try {
      const r = await ab.build();
      log(`push build ok apk=${r.apkSize} en ${Math.round(performance.now() - t0)} ms → ${r.apk}`);
    } catch (e) { log(`push build FAIL ${e.message}`); }
    await snap('89-push-build');
    await setMode('preview');
  }

  if (want('abphone')) {
    await setMode('android'); await waitFor(() => S.android, 20000); await sleep(1200);
    const ab = S.android;
    ab.cfg.source.kind = 'url'; ab.cfg.source.url = cfg.url; ab.save();
    for (const os of ['ios', 'android']) {
      document.querySelector(`[data-set="abOs"][data-val="${os}"]`).click(); await sleep(700);
      for (const pv of ['home', 'splash', 'app']) {
        document.querySelector(`[data-set="abPrev"][data-val="${pv}"]`).click(); await sleep(pv === 'app' ? 3500 : 900);
        await snap(`85-ab-${os}-${pv}`);
      }
      const L = ab.phoneL;
      log(`abphone ${os} : ${L.dev.name} écran ${L.W}x${L.H} échelle ${ab.phoneScale.toFixed(3)} icône ${Math.round(document.querySelector('.ab-screen .ab-hi img, .ab-screen .ab-gl')?.getBoundingClientRect().width || 0)}px`);
    }
    // Simulation de lancement (image au milieu de l'animation).
    document.querySelector('[data-set="abPrev"][data-val="home"]').click(); await sleep(800);
    const p = ab.act_launch_sim(); await sleep(420); await snap('86-ab-lancement'); await p;
    // Panneau étroit.
    const side = document.querySelector('.ab-side'); side.style.width = '300px'; await sleep(700); await snap('87-ab-etroit');
    side.style.width = ''; await sleep(300);
    await setMode('preview');
  }

  if (want('lot1')) {
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    const ai = await import('./core/ai.js');
    const tb = await import('./viewer/toolbar.js');
    // 1. Connexion en une étape.
    const c = await api.invoke('ai:connect', { provider: 'custom', key: 'cle-de-test', baseUrl: 'http://127.0.0.1:8799/v1' });
    log(`lot1 connexion : ok=${c.ok} modèle=${c.model} modèles=${(c.models || []).length} active=${c.status && c.status.active}`);
    const bad = await api.invoke('ai:connect', { provider: 'openai', key: 'sk-faux', baseUrl: 'http://127.0.0.1:1/v1' });
    log(`lot1 erreur lisible : ${String(bad.error).slice(0, 90)}`);
    await api.invoke('ai:remove', { provider: 'openai' });
    await api.invoke('ai:active', { provider: 'custom' });
    await ai.openAiSettings('custom'); await sleep(500); await snap('95-ia-reglages'); closeSheet();
    // 2. Dev Lab : assistant rangé à droite, comparaison, application, complétion.
    await setMode('dev'); await waitFor(() => S.devLab, 10000);
    const dv = S.devLab;
    const r = await api.invoke('dev:new-project', { parent: `${cfg.out}/devproj`, name: `l1-${Date.now() % 100000}`, template: 'html' });
    await dv.openFolder(r.dir);
    const sep = r.dir.includes('\\') ? '\\' : '/';
    const main = `${r.dir}${sep}js${sep}main.js`;
    await dv.openFile(main);
    await waitFor(() => dv.editor, 20000);
    await ai.toggleAssistant(true); await sleep(400);
    const cw = $('.content').getBoundingClientRect().width;
    log(`lot1 tiroir : contenu=${Math.round(cw)} fenêtre=${window.innerWidth} sélecteurs=${document.querySelectorAll('.ai-drawer [data-ai-sel]').length}`);
    await ai.runAiAction('Corriger');
    await waitFor(() => document.querySelector('.ai-drawer .ai-msg-b.assistant:not(.pending) [data-ai-code="diff"]'), 20000).catch(() => {});
    document.querySelector('.ai-drawer [data-ai-code="diff"]').click();
    await waitFor(() => !dv.$.diffbar.hidden, 10000).catch(() => {});
    await sleep(800); await snap('96-ia-comparaison');
    dv.$.diffbar.querySelector('[data-ai-diff="apply"]').click(); await sleep(400);
    log(`lot1 appliqué : ${dv.editor.getModel().getValue().includes('items.reduce')}`);
    // Nouveau fichier proposé avec un chemin.
    await ai.askAssistant('CRÉE-FICHIER aide');
    await waitFor(() => document.querySelector('.ai-drawer [data-ai-code="apply"]'), 20000).catch(() => {});
    document.querySelector('.ai-drawer [data-ai-code="apply"]').click();
    await waitFor(() => !dv.$.diffbar.hidden, 10000).catch(() => {});
    dv.$.diffbar.querySelector('[data-ai-diff="apply"]').click(); await sleep(1500);
    const rd = await api.invoke('dev:read', { file: `${r.dir}${sep}js${sep}aide.js` }).catch((e) => ({ text: `err ${e.message}` }));
    log(`lot1 nouveau fichier : ${String(rd.text).trim()}`);
    await dv.openFile(main);
    dv.editor.setPosition({ lineNumber: 1, column: 1 });
    await ai.completeHere(); await sleep(300);
    log(`lot1 complétion : ${dv.editor.getModel().getValue().startsWith('console.log("complété')}`);
    // 3. Panneaux gauche / droite.
    await setMode('studio'); await waitFor(() => S.studio && S.studio.ready, 30000);
    tb.togglePanel('left'); tb.togglePanel('right'); await sleep(500);
    log(`lot1 panneaux studio masqués : ${document.querySelector('#studio .st-left').classList.contains('pane-hidden')} ${document.querySelector('#studio .st-right').classList.contains('pane-hidden')}`);
    await snap('97-studio-panneaux');
    tb.togglePanel('left'); tb.togglePanel('right'); await sleep(300);
    await ai.toggleAssistant(false);
    // 4. Échelle de l'interface.
    for (const v of [0.85, 0.7]) { tb.setUiScale(v); await sleep(700); await snap(`98-echelle-${Math.round(v * 100)}`); }
    tb.setUiScale(1); await sleep(500);
    log(`lot1 échelle : ${settings.ui.scale}`);
    await setMode('preview');
  }

  if (want('small')) {
    // Petits écrans : chaque espace et les principales fenêtres, à la taille de la fenêtre de test.
    const tag = `${window.innerWidth}x${window.innerHeight}`;
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    await setMode('preview'); await sleep(800); await snap(`90-${tag}-responsive`);
    const tb = await import('./viewer/toolbar.js');
    tb.openUiSheet(); await sleep(500); await snap(`90-${tag}-interface`); closeSheet();
    openAppearance($('#btnAppearance')); await sleep(400); await snap(`90-${tag}-apparence`); hidePopover();
    const ai = await import('./core/ai.js');
    await ai.openAiSettings(); await sleep(500); await snap(`90-${tag}-ia`); closeSheet();
    await setMode('browser'); await waitFor(() => S.browserLab, 20000); await sleep(1500); await snap(`90-${tag}-browser`);
    await setMode('dev'); await waitFor(() => S.devLab, 10000); await sleep(1200);
    if (cfg.devDir) { await S.devLab.openFolder(cfg.devDir); await sleep(800); }
    await ai.toggleAssistant(true); await sleep(500); await snap(`90-${tag}-dev`); await ai.toggleAssistant(false);
    await setMode('android'); await waitFor(() => S.android, 20000); await sleep(1500); await snap(`90-${tag}-app`);
    await setMode('studio'); await waitFor(() => S.studio && S.studio.ready, 30000); await sleep(1500);
    for (const sp of ['scene', 'ad', 'deck']) { await S.studio.setSpace(sp); await sleep(900); await snap(`90-${tag}-studio-${sp}`); }
    await S.studio.setSpace('scene');
    await setMode('preview');
  }

  if (want('toggles')) {
    // Audit : chaque interrupteur, segment et puce doit changer un réglage ou un état.
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    const bad = [];
    let total = 0;
    const sig = () => {
      let st = '';
      try { st += S.studio ? JSON.stringify(S.studio.serialize()) : ''; } catch { /* */ }
      try { st += S.android ? JSON.stringify(S.android.cfg) + S.android.os : ''; } catch { /* */ }
      return JSON.stringify(settings) + st + document.documentElement.className + (document.documentElement.getAttribute('style') || '');
    };
    const SEL = 'input[type=checkbox], [data-set][data-val], [data-ui][data-val], .st-chip[data-val]';
    const visible = (el) => el && el.offsetParent !== null && !el.disabled && !el.closest('[hidden]');
    const audit = async (label, open, rootSel) => {
      try { await audit0(label, open, rootSel); } catch (e) { log(`toggle audit ${label} ERREUR ${e.message}`); hidePopover(); closeSheet(); }
    };
    const audit0 = async (label, open, rootSel) => {
      await open(); await sleep(350);
      log(`audit ${label} : ${document.querySelector(rootSel) ? document.querySelector(rootSel).querySelectorAll(SEL).length : 'absent'}`);
      const root = () => document.querySelector(rootSel);
      const n = root() ? root().querySelectorAll(SEL).length : 0;
      for (let i = 0; i < n; i++) {
        if (!root() || !visible(root())) { await open(); await sleep(300); }
        const el = root() && root().querySelectorAll(SEL)[i];
        if (!el || !visible(el)) continue;
        if (el.type !== 'checkbox' && (el.classList.contains('on') || el.getAttribute('aria-checked') === 'true')) continue;
        if (el.dataset.k === 'outputs.apk' || el.dataset.actCheck) continue;
        const name = `${label} › ${el.dataset.toggle || el.dataset.set || el.dataset.ui || el.dataset.k || el.className}=${el.dataset.val || ''}`;
        total += 1;
        const before = sig();
        el.click();
        await sleep(280);
        const after = sig();
        if (before === after) bad.push(name);
        if (el.type === 'checkbox') {
          if (!root() || !visible(root())) { await open(); await sleep(300); }
          const again = root() && root().querySelectorAll(SEL)[i];
          if (again && again.type === 'checkbox') { again.click(); await sleep(200); }
        }
      }
      hidePopover(); closeSheet();
      await sleep(200);
    };
    await setMode('preview'); await sleep(500);
    await audit('Apparence', () => openAppearance($('#btnAppearance')), '#popover');
    await audit('Interface', async () => { const m = await import('./viewer/toolbar.js'); m.openUiSheet(); }, '#sheet');
    S.board.setLayout('multi'); await sleep(1200); renderDock();
    await audit('Dock sync', async () => { if ($('#popover').hidden) $('#dock [data-dock="sync"]').click(); }, '#popover');
    S.board.setLayout('single'); await sleep(800); renderDock();
    for (const d of ['photo', 'video']) {
      // eslint-disable-next-line no-loop-func
      await audit(`Dock ${d}`, async () => { if ($('#popover').hidden) $(`#dock [data-dock="${d}"]`).click(); }, '#popover');
    }
    await audit('Inspecteur', async () => { openInspector('infos'); }, '#insBody');
    const sk = await import('./viewer/skinsheet.js');
    await audit('Cadres', async () => { sk.openSkins(); }, '#sheet');
    toggleInspector(false);
    const pm = await import('./viewer/poses.js');
    await pm.openPoses(); await sleep(1500);
    await audit('Poses', async () => {}, '#psSide');
    document.querySelector('.poses [data-ps="close"]')?.click(); await sleep(300);
    await setMode('browser'); await waitFor(() => S.browserLab, 20000); await sleep(1500);
    for (const t of ['elements', 'network', 'audit', 'tests', 'scrape', 'console']) {
      // eslint-disable-next-line no-loop-func
      await audit(`Browser ${t}`, async () => { document.querySelector(`.bl-tabs [data-tab="${t}"]`).click(); await sleep(500); }, `.bl-pane[data-pane="${t}"]`);
    }
    await setMode('android'); await waitFor(() => S.android, 20000); await sleep(800);
    await audit('App OS', async () => {}, '.ab-prev-head');
    for (const b of [...document.querySelectorAll('.ab-sec')].map((x) => x.dataset.sec)) {
      // eslint-disable-next-line no-loop-func
      await audit(`App ${b}`, async () => { document.querySelector(`.ab-sec[data-sec="${b}"]`).click(); await sleep(200); }, '.ab-form');
    }
    await setMode('studio'); await waitFor(() => S.studio && S.studio.ready, 30000);
    for (const sp of ['scene', 'ad', 'deck']) {
      await S.studio.setSpace(sp); await sleep(600);
      // eslint-disable-next-line no-loop-func
      await audit(`Studio ${sp}`, async () => {}, '#stProps');
    }
    const first = S.studio.order && S.studio.order[0];
    if (first) { await S.studio.setSpace('scene'); S.studio.select(first); await sleep(400); await audit(`Studio objet ${first}`, async () => {}, '#stProps'); }
    log(`toggles : ${total} testés, ${bad.length} sans effet`);
    for (const x of bad) log(`toggle sans effet : ${x}`);
    await setMode('preview');
  }

  if (want('ai')) {
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    const ai = await import('./core/ai.js');
    log(`ia set : ${JSON.stringify((await api.invoke('ai:set', { provider: 'custom', key: 'cle-de-test', model: 'mock-1', baseUrl: 'http://127.0.0.1:8799/v1' })).active)}`);
    await api.invoke('ai:active', { provider: 'custom' });
    log(`ia modèles : ${JSON.stringify(await api.invoke('ai:models', { provider: 'custom' }))}`);
    log(`ia test : ${JSON.stringify(await api.invoke('ai:test', { provider: 'custom' }))}`);
    const st = await api.invoke('ai:status');
    log(`ia clé masquée=${st.providers.custom.hint} chiffrée=${st.encrypted}`);
    await ai.openAiSettings(); await sleep(400); await snap('75-ia-reglages'); closeSheet();
    await ai.aiStatus(true);
    // Dev Lab : corriger le fichier ouvert puis insérer le code.
    await setMode('dev'); await waitFor(() => S.devLab, 10000);
    const dv = S.devLab;
    const r = await api.invoke('dev:new-project', { parent: `${cfg.out}/devproj`, name: `ia-${Date.now() % 100000}`, template: 'html' });
    await dv.openFolder(r.dir);
    const sep = r.dir.includes('\\') ? '\\' : '/';
    await dv.openFile(`${r.dir}${sep}js${sep}main.js`);
    await waitFor(() => dv.editor, 20000);
    await ai.runAiAction('Corriger');
    await waitFor(() => document.querySelector('.ai-drawer .ai-msg-b.assistant:not(.pending) .ai-code'), 20000).catch(() => {});
    await sleep(400);
    await snap('76-ia-dev');
    const before = dv.editor.getModel().getValue().length;
    document.querySelector('.ai-drawer [data-ai-code="insert"]').click();
    log(`ia insertion : ${dv.editor.getModel().getValue().length > before}`);
    // Publicité : textes rédigés et appliqués.
    await setMode('studio'); await waitFor(() => S.studio && S.studio.ready, 30000);
    await S.studio.setSpace('ad');
    await ai.runAiAction('Rédiger la publicité');
    await waitFor(() => S.studio.adState().copy.title === 'Le marché dans ta poche', 20000).catch(() => {});
    log(`ia publicité : titre=${S.studio.adState().copy.title}`);
    await sleep(600);
    await snap('77-ia-pub');
    document.querySelector('.ai-drawer [data-ai="close"]').click();
    await api.invoke('ai:remove', { provider: 'custom' });
    await S.studio.setSpace('scene');
  }

  if (want('devshot')) {
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    await setMode('preview');
    for (const id of ['iphone-18-pro', 'galaxy-s26-ultra']) {
      // eslint-disable-next-line no-await-in-loop
      await single(id); await settle(); await sleep(1200);
      // eslint-disable-next-line no-await-in-loop
      await snap(`70-face-${id}`);
      board().focused.blank(); await sleep(2500);
      // eslint-disable-next-line no-await-in-loop
      await snap(`70-vide-${id}`);
      { const v = board().focused; log(`vide ${id} : url=${v.url} wv=${(v.wv.getURL() || '').slice(0, 15)}`); }
      board().focused.load(cfg.url); await settle(); await sleep(800);
      // eslint-disable-next-line no-await-in-loop
      log(`maquette ${id} : ${await takePhoto('mockup')}`);
    }
    await setMode('studio'); await waitFor(() => S.studio && S.studio.ready, 30000); await sleep(800);
    const st = S.studio;
    if (st.space !== 'scene') await st.setSpace('scene');
    for (const id of ['iphone-18-pro', 'galaxy-s26-ultra']) {
      for (const [rot, n] of [[[0, 0, 0], 'avant'], [[0, 180, 0], 'dos'], [[0, 35, 0], 'trois-quarts'], [[0, 150, 0], 'dos-34']]) {
        st.clearScene();
        st.anim.tracks = {};
        // eslint-disable-next-line no-await-in-loop
        const it = await st.addDevice({ deviceId: id, main: { src: 'wallpaper' } }, { select: false, history: false });
        st.applyState(it.id, { rot }); st.recordEdit(it.id);
        st.three.applyEnv({ ...st.three.env, bg: 'studio', bgColor: '#eceef3', floor: 'shadow', light: 'studio', fx: null, fog: null }, null);
        st.setView('front', false);
        // eslint-disable-next-line no-await-in-loop
        await sleep(700);
        // eslint-disable-next-line no-await-in-loop
        await snap(`71-3d-${id}-${n}`);
      }
    }
  }

  if (want('new4')) {
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    const { openNewWizard } = await import('./core/newwizard.js');
    const pickOk = async (k) => { const t = document.querySelector(`#sheet [data-nw="${k}"]`); if (t) t.click(); await sleep(150); document.querySelector('#sheet [data-x="ok"]').click(); await sleep(400); };
    await setMode('preview');
    openNewWizard('preview'); await sleep(400); await snap('60-nouveau-planche');
    await pickOk('trio'); await settle(); await sleep(1200);
    log(`nouveau planche : ${board().list.map((v) => v.cfg.deviceId).join(', ')}`);
    await snap('61-planche-trio');
    await setMode('android'); await waitFor(() => S.android, 20000); await sleep(800);
    openNewWizard('android'); await sleep(400); await snap('62-nouveau-app');
    await pickOk('shop'); await sleep(800);
    log(`nouveau app : onglets=${S.android.cfg.config.tabs.length} fab=${S.android.cfg.config.fab.enabled} nom=${S.android.cfg.appName}`);
    await setMode('studio'); await waitFor(() => S.studio && S.studio.ready, 30000); await sleep(800);
    openNewWizard('studio'); await sleep(400); await snap('63-nouveau-scene');
    await pickOk('trio'); await sleep(1500);
    log(`nouveau scène : ${S.studio.order.length} objets`);
    await setMode('browser'); await waitFor(() => S.browserLab, 20000); await sleep(600);
    openNewWizard('browser'); await sleep(400); await snap('64-nouveau-session');
    await pickOk('mobile'); await sleep(1500);
    log(`nouveau session : viewport=${S.browserLab.st.viewport} réseau=${S.browserLab.st.throttle}`);
    S.browserLab.st.viewport = 'fill'; S.browserLab.st.throttle = 'none';
    await setMode('preview');
    const { openUiSheet } = await import('./viewer/toolbar.js');
    const { applyTheme } = await import('./core/theme.js');
    openUiSheet(); await sleep(400); await snap('65-personnaliser');
    closeSheet();
    settings.ui = { ...(settings.ui || {}), density: 'compact', radius: 'round', stage: 'dusk', font: 'rounded', glass: 'solid' };
    settings.appTheme = 'dark'; settings.accent = 'mint';
    applyTheme(); await sleep(800); await snap('66-interface-sombre-compacte');
    settings.ui = { ...settings.ui, density: 'comfy', radius: 'square', stage: 'warm', font: 'inter', glass: 'normal', labels: false, scale: 1.1 };
    settings.appTheme = 'light'; settings.accent = 'custom'; settings.ui.accentCustom = '#e4572e';
    applyTheme(); await sleep(800); await snap('67-interface-aeree');
    settings.ui = {}; settings.appTheme = 'light'; settings.accent = 'blue';
    applyTheme(); persist();
  }

  if (want('poses')) {
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    await setMode('preview');
    const b = board();
    await single('iphone-17');
    b.setLayout('multi');
    while (b.list.length > 1) b.removeView(b.list[b.list.length - 1].uid);
    b.addDevice('galaxy-s25-ultra');
    b.addDevice('ipad-pro-11');
    await settle();
    await waitFor(() => b.list.every((v) => v.url && v.ready), 30000).catch(() => {});
    await sleep(1500);
    const { autotestPoses } = await import('./viewer/poses.js');
    await autotestPoses({ log, snap });
  }

  if (want('studio4')) {
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    await setMode('studio');
    await waitFor(() => S.studio && S.studio.ready, 30000);
    await sleep(800);
    await S.studio.autotest4({ log, snap });
    await setMode('preview');
  }

  if (want('ads4')) {
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    await setMode('studio');
    await waitFor(() => S.studio && S.studio.ready, 30000);
    await sleep(800);
    await S.studio.autotestAds4({ log, snap, url: cfg.url });
    await snap('89-pub-fin');
    await setMode('preview');
  }

  if (want('spaces')) {
    // Studio de publicité et générateur de présentations.
    if (!S.source) { await openUrl(cfg.url); await settle(); }
    await setMode('studio');
    await waitFor(() => S.studio && S.studio.ready, 30000);
    await sleep(800);
    await S.studio.autotestSpaces({ log, snap, url: cfg.url });
    await setMode('preview');
  }

  if (want('android')) {
    await setMode('android');
    await sleep(1200);
    await snap('60-android');
    if (S.android && S.android.autotest) await S.android.autotest({ log, snap, sleep, cfg, url: cfg.url });
    await setMode('preview');
  }

  if (want('browser')) {
    await setMode('browser');
    await waitFor(() => S.browserLab, 10000);
    const bl = S.browserLab;
    bl.navigate(cfg.url);
    await waitFor(() => bl.wcId && !bl.loading, 20000);
    await sleep(1500);
    await snap('80-browser');
    // Sélection d'une section puis du code.
    await bl.togglePick('section');
    await sleep(500);
    const secs = await bl.pickCall('sections()');
    log(`browser sections=${secs ? secs.length : 'null'}`);
    if (secs && secs[1]) await bl.pickCall(`select(${JSON.stringify(secs[1].selector)})`);
    await sleep(2500);
    await snap('81-browser-section-code');
    const ep = bl.panels.get('elements');
    if (ep && ep.code && !ep.code.error) {
      log(`browser code rules=${ep.code.rules.length} vars=${ep.code.vars.length} htmlLen=${ep.html.length}`);
      for (const f of ['css', 'jsx', 'file']) {
        ep.format = f;
        ep.renderBody();
        await sleep(300);
        await snap(`82-browser-code-${f}`);
      }
    } else log(`browser code FAIL ${ep && ep.code ? ep.code.error : 'none'}`);
    await bl.togglePick('section');
    await bl.openTab('network');
    bl.wv.reload();
    await sleep(3500);
    await snap('83-browser-network');
    const np = bl.panels.get('network');
    log(`browser net entries=${np ? np.entries.size : 0}`);
    if (np) { np.view = 'summary'; np.paint(); await sleep(300); await snap('84-browser-network-summary'); np.view = 'list'; }
    await bl.openTab('audit');
    const ap = bl.panels.get('audit');
    await ap.run();
    await sleep(500);
    await snap('85-browser-audit');
    log(`browser audit checks=${ap.result ? ap.result.checks.length : 0}`);
    await bl.openTab('tests');
    const tp = bl.panels.get('tests');
    tp.t.maxPages = 3;
    tp.t.viewports = ['desktop', 'mobile'];
    await tp.start('explore');
    await waitFor(() => !tp.job, 90000);
    await sleep(400);
    await snap('86-browser-tests');
    log(`browser tests pages=${tp.results.length} errors=${tp.summary ? tp.summary.errors : '?'} broken=${tp.summary ? tp.summary.broken.length : '?'}`);
    tp.t.mode = 'scenario';
    tp.render();
    const scn = { id: 'x1', name: 'Ajout au panier', viewport: 'mobile', steps: [{ action: 'goto', value: cfg.url }, { action: 'assertText', value: 'Produit 1' }, { action: 'click', selector: 'text=Ajouter' }, { action: 'assertNoErrors' }, { action: 'screenshot' }] };
    bl.st.scenarios = [scn];
    tp.current = 'x1';
    tp.renderBody();
    await tp.start('scenario');
    await waitFor(() => !tp.job, 60000);
    await sleep(300);
    await snap('87-browser-scenario');
    log(`browser scenario steps=${(tp.stepResults || []).filter(Boolean).map((r) => (r.ok ? 'ok' : `KO:${r.error}`)).join(',')}`);
    await bl.openTab('scrape');
    const sp = bl.panels.get('scrape');
    sp.o.maxPages = 6;
    sp.o.delay = 0;
    const r = await api.invoke('lab:scrape-start', { url: bl.url, options: { ...sp.o } });
    sp.job = r;
    sp.report = null;
    sp.render();
    await waitFor(() => sp.report, 120000);
    await sleep(600);
    await snap('88-browser-scrape-ask');
    closeSheet();
    log(`browser scrape pages=${sp.report.pages.length} files=${sp.report.files} bytes=${sp.report.bytes} sources=${sp.report.sources} dir=${sp.report.dir}`);
    sp.render();
    await snap('89-browser-scrape');
    await bl.openTab('console');
    const cp = bl.panels.get('console');
    await cp.exec('document.title');
    await cp.exec('[...document.querySelectorAll("h2")].length');
    await sleep(300);
    await snap('90-browser-console');
    await bl.openTab('devtools');
    await sleep(3500);
    await snap('91-browser-devtools');
    bl.st.viewport = 'iphone';
    await bl.applyViewport();
    await bl.openTab('elements');
    await sleep(1500);
    await snap('92-browser-mobile');
    bl.st.viewport = 'fill';
    await bl.applyViewport();
    await setMode('preview');
  }

  if (want('dev4')) {
    await setMode('dev');
    await waitFor(() => S.devLab, 10000);
    const dv = S.devLab;
    await sleep(600);
    const r = await api.invoke('dev:new-project', { parent: `${cfg.out}/devproj`, name: `site4-${Date.now() % 100000}`, template: 'html' });
    await dv.openFolder(r.dir);
    const sep = r.dir.includes('\\') ? '\\' : '/';
    await dv.openFile(`${r.dir}${sep}js${sep}main.js`);
    await waitFor(() => dv.editor, 20000);
    // Prettier
    const m = dv.files.get(`${r.dir}${sep}js${sep}main.js`).model;
    m.setValue('const   a = {b:1,c:[1,2,3]}\nfunction f( x ){return x*2}\n');
    await dv.format();
    log(`dev4 prettier=${JSON.stringify(m.getValue())}`);
    // Extensions Open VSX : recherche et installation d'un thème.
    dv.setSide('ext');
    await sleep(4000);
    await snap('97-dev-extensions');
    const found = await api.invoke('dev:ext-search', { query: 'dracula', size: 5 });
    log(`dev4 recherche : ${Array.isArray(found) ? found.map((e) => e.id).join(', ') : found.error}`);
    const ex = Array.isArray(found) && found.find((e) => /dracula/i.test(e.id));
    if (ex) {
      const ins = await api.invoke('dev:ext-install', { namespace: ex.namespace, name: ex.name });
      log(`dev4 installé : ${ins.error || `${ins.id} thèmes=${ins.themes.length}`}`);
      const res = await dv.reloadExtensions();
      log(`dev4 thèmes chargés : ${dv.extThemes.map((t) => t.label).join(', ')} extraits=${res && res.snippets}`);
      if (dv.extThemes[0]) { dv.ed.theme = dv.extThemes[0].id; dv.applyEditorSettings(); }
      await dv.openFile(`${r.dir}${sep}index.html`);
      await sleep(1500);
      await snap('98-dev-theme-extension');
    }
    const sn = await api.invoke('dev:ext-search', { query: 'es7 react snippets', size: 3 });
    const sx = Array.isArray(sn) && sn[0];
    if (sx) { const i2 = await api.invoke('dev:ext-install', { namespace: sx.namespace, name: sx.name }); const rr = await dv.reloadExtensions(); log(`dev4 extraits : ${i2.error || i2.id} → ${rr && rr.snippets} extraits`); }
    await dv.editorSettings();
    await sleep(500);
    await snap('99-dev-reglages');
    closeSheet();
    dv.ed.theme = 'auto'; dv.applyEditorSettings();
    // Mode VS Code (la licence est acceptée pour le test).
    if (cfg.vscode) {
      await api.invoke('dev:vscode-accept');
      await dv.setMode('vscode');
      const wv = dv.$.vscode.querySelector('webview');
      log(`dev4 vscode url=${dv.vsUrl}`);
      await waitFor(() => !dv.$.vscode.querySelector('.dk-vs-loading'), 240000).catch(() => {});
      await sleep(15000);
      await snap('99b-dev-vscode');
      const wv2 = dv.$.vscode.querySelector('webview') || wv;
      const title = wv2 ? await wv2.executeJavaScript('document.title').catch(() => '?') : '?';
      const wm = wv2 ? await wv2.executeJavaScript(`(() => { const e = document.querySelector('.editor-group-watermark .letterpress'); return e ? getComputedStyle(e).backgroundImage.slice(0, 60) : 'absent'; })()`).catch((e) => `err ${e.message}`) : '?';
      log(`dev4 vscode filigrane=${wm}`);
      log(`dev4 vscode titre=${title}`);
      await dv.setMode('vitrine');
    }
  }

  if (want('dev')) {
    await setMode('dev');
    await waitFor(() => S.devLab, 10000);
    const dv = S.devLab;
    await sleep(800);
    await snap('93-dev-welcome');
    const r = await api.invoke('dev:new-project', { parent: `${cfg.out}/devproj`, name: `mon-site-${Date.now() % 100000}`, template: 'html' });
    await dv.openFolder(r.dir);
    await sleep(800);
    const sep = r.dir.includes('\\') ? '\\' : '/';
    await dv.openFile(`${r.dir}${sep}index.html`);
    await waitFor(() => dv.editor, 20000);
    await sleep(1500);
    await snap('94-dev-editor');
    const m = dv.files.get(`${r.dir}${sep}index.html`).model;
    m.pushEditOperations([], [{ range: new window.monaco.Range(13, 1, 13, 1), text: '    <p class="vt-test">Modifié dans le Dev Lab</p>\n' }], () => null);
    await sleep(1800);
    const saved = await api.invoke('dev:read', { file: `${r.dir}${sep}index.html` });
    log(`dev autosave=${saved.text.includes('Modifié dans le Dev Lab')}`);
    await dv.preview.toggleRun();
    await waitFor(() => dv.preview.wcId, 15000);
    await sleep(1500);
    await snap('95-dev-run');
    const tid = dv.terminal.active;
    dv.terminal.run(tid, 'node -v && echo bonjour-vitrine');
    await sleep(2500);
    const out = dv.terminal.terms.get(tid).lines.join('\n');
    log(`dev terminal ok=${/bonjour-vitrine/.test(out)} node=${(/v\d+\.\d+/.exec(out) || [''])[0]}`);
    await snap('96-dev-terminal');
    await api.invoke('git:init', { dir: r.dir });
    await api.invoke('git:commit', { dir: r.dir, message: 'Première version' });
    m.pushEditOperations([], [{ range: new window.monaco.Range(1, 1, 1, 1), text: '<!-- changement -->\n' }], () => null);
    await sleep(1800);
    dv.git.log = [];
    await dv.git.refresh();
    dv.setSide('git');
    await sleep(800);
    await snap('97-dev-git');
    log(`dev git files=${dv.git.st.files.length} branch=${dv.git.st.branch} log=${dv.git.log.length}`);
    await dv.showDiff(`${r.dir}${sep}index.html`);
    await sleep(1200);
    await snap('98-dev-diff');
    dv.closeDiff();
    dv.preview.openShare();
    await sleep(400);
    const url = await api.invoke('tunnel:name-set', { host: 'mon-site.vitrine', target: new URL(dv.preview.url).origin });
    dv.preview.renderShare();
    await sleep(600);
    await snap('99-dev-share');
    dv.preview.load(url);
    await sleep(2500);
    await snap('99b-dev-vitrine-domain');
    log(`dev local domain loaded=${dv.preview.$url.value}`);
    dv.setSide('github');
    await sleep(1500);
    await snap('99c-dev-github');
    dv.quickOpen();
    await sleep(800);
    await snap('99d-dev-quickopen');
    closeSheet();
    await dv.preview.toggleRun();
    await setMode('preview');
  }

  if (want('project') && cfg.project) {
    await openProjectDir(cfg.project);
    await waitFor(() => S.server.status === 'running' && board().focused.url, 90000);
    await settle();
    settings.codeTab = 'files';
    openInspector('code');
    await sleep(2500);
    await snap('70-projet-fichiers');
    toggleInspector(false);
    await closeSource();
  }

  if (want('flutter') && cfg.flutter) {
    await openProjectDir(cfg.flutter);
    await waitFor(() => currentSheet() === 'sdk' || currentSheet() === 'web', 30000);
    await sleep(700);
    await snap('71-flutter-manquant');
    closeSheet();
    await closeSource();
  }

  settings.appTheme = 'light';
  settings.inspector = false;
  settings.mode = 'preview';
  settings.layout = 'single';
  persist();
  await sleep(600);
  api.invoke('autotest:quit');
}
