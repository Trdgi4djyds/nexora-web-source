/* Panneau Tests : exploration automatique du site (toutes les pages, ordinateur et mobile) et scénarios
 * de navigation enregistrés ou écrits à la main, rejoués automatiquement, exportables pour Playwright. */
import { api } from '../core/api.js';
import { $, esc, uid } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { seg, toast } from '../core/ui.js';

const ACTIONS = {
  goto: 'Aller à', click: 'Cliquer', type: 'Saisir', select: 'Choisir', press: 'Touche', wait: 'Attendre', scroll: 'Défiler', assertText: 'Vérifier le texte', assertNoText: 'Vérifier l’absence', assertUrl: 'Vérifier l’adresse', assertVisible: 'Vérifier visible', assertTitle: 'Vérifier le titre', assertNoErrors: 'Aucune erreur JS', screenshot: 'Capture',
};
const NEEDS = {
  goto: ['value'], click: ['selector'], type: ['selector', 'value'], select: ['selector', 'value'], press: ['value'], wait: ['selector?', 'value?'], scroll: ['selector?'], assertText: ['value'], assertNoText: ['value'], assertUrl: ['value'], assertVisible: ['selector'], assertTitle: ['value'], assertNoErrors: [], screenshot: [],
};
const VPS = {
  desktop: 'Ordinateur', laptop: 'Portable', tablet: 'Tablette', mobile: 'Mobile',
};

const RECORDER = String.raw`(() => {
  if (window.__vtRec) { window.__vtRec.on = true; return; }
  const post = (step) => { try { console.debug('__VT__' + JSON.stringify({ type: 'rec', step })); } catch (e) { /* page */ } };
  const uniqueText = (el) => {
    const t = (el.innerText || el.value || '').trim().replace(/\s+/g, ' ');
    if (!t || t.length > 40) return null;
    const same = [...document.querySelectorAll(el.tagName)].filter((x) => (x.innerText || x.value || '').trim().replace(/\s+/g, ' ') === t);
    return same.length === 1 ? 'text=' + t : null;
  };
  const sel = (el) => {
    for (const a of ['data-testid', 'data-test', 'data-cy', 'id', 'name', 'aria-label']) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && /^[\w -]+$/.test(v)) { const s = a === 'id' ? '#' + v : '[' + a + '="' + v + '"]'; try { if (document.querySelectorAll(s).length === 1) return s; } catch (e) { /* invalide */ } }
    }
    const t = /^(A|BUTTON|LABEL|SUMMARY)$/.test(el.tagName) || el.getAttribute('role') === 'button' ? uniqueText(el) : null;
    if (t) return t;
    const parts = [];
    let e = el;
    while (e && e.nodeType === 1 && e !== document.body && parts.length < 6) {
      const p = e.parentElement;
      const cls = [...e.classList].filter((c) => /^[a-zA-Z][\w-]*$/.test(c) && !/^(css-|sc-|jsx-)/.test(c)).slice(0, 1);
      let s = e.tagName.toLowerCase() + (cls.length ? '.' + cls[0] : '');
      if (p) { const same = [...p.children].filter((c) => c.tagName === e.tagName); if (same.length > 1) s += ':nth-of-type(' + (same.indexOf(e) + 1) + ')'; }
      parts.unshift(s);
      try { if (document.querySelectorAll(parts.join(' > ')).length === 1) return parts.join(' > '); } catch (err) { /* invalide */ }
      e = p;
    }
    return parts.join(' > ');
  };
  window.__vtRec = { on: true };
  addEventListener('click', (e) => {
    if (!window.__vtRec.on || !e.isTrusted) return;
    let el = e.target.closest('a, button, [role=button], input[type=submit], input[type=button], input[type=checkbox], input[type=radio], label, summary, select, [onclick]') || e.target;
    if (/^(INPUT|TEXTAREA)$/.test(el.tagName) && !/^(submit|button|checkbox|radio)$/.test(el.type)) return;
    post({ action: 'click', selector: sel(el) });
  }, true);
  addEventListener('change', (e) => {
    if (!window.__vtRec.on || !e.isTrusted) return;
    const el = e.target;
    if (el.tagName === 'SELECT') post({ action: 'select', selector: sel(el), value: el.value });
    else if (/^(INPUT|TEXTAREA)$/.test(el.tagName) && !/^(checkbox|radio|submit|button|file)$/.test(el.type)) post({ action: 'type', selector: sel(el), value: el.type === 'password' ? '' : el.value, secret: el.type === 'password' });
  }, true);
  addEventListener('keydown', (e) => { if (window.__vtRec.on && e.isTrusted && e.key === 'Enter' && /^(INPUT)$/.test(e.target.tagName)) { e.target.dispatchEvent(new Event('change', { bubbles: true })); post({ action: 'press', value: 'Enter' }); } }, true);
})()`;

export default class TestsPanel {
  constructor(lab, el) {
    this.lab = lab;
    this.el = el;
    lab.st.tests = {
      mode: 'explore', maxPages: 25, viewports: ['desktop', 'mobile'], checkLinks: true, screenshots: true, ...(lab.st.tests || {}),
    };
    lab.st.scenarios = lab.st.scenarios || [];
    this.t = lab.st.tests;
    this.job = null;
    this.results = [];
    this.summary = null;
    this.onlyIssues = false;
    this.current = lab.st.scenarios[0] ? lab.st.scenarios[0].id : null;
    this.recording = false;
    this.secrets = new WeakMap();
    this.render();
    el.addEventListener('click', (e) => this.onClick(e));
    el.addEventListener('change', (e) => this.onChange(e));
    el.addEventListener('input', (e) => this.onInput(e));
    api.on('lab:test', (m) => this.onEvent(m));
    lab.on('picker', (m) => this.onPicker(m));
    lab.on('ready', () => { if (this.recording) this.injectRecorder(); });
    lab.on('navigate', (url, inPage) => { if (this.recording && !inPage) this.addStep({ action: 'goto', value: url }, true); });
  }

  activate() {}
  deactivate() {}

  get scn() { return this.lab.st.scenarios.find((s) => s.id === this.current); }

  render() {
    this.el.innerHTML = `
      <div class="ts">
        <div class="ts-mode">${seg('tsMode', this.t.mode, { explore: 'Exploration du site', scenario: 'Scénarios' })}</div>
        <div class="ts-body"></div>
      </div>`;
    this.renderBody();
  }

  renderBody() {
    const body = $('.ts-body', this.el);
    if (this.t.mode === 'explore') body.innerHTML = this.exploreHtml();
    else body.innerHTML = this.scenarioHtml();
  }

  // ------------------------------------------------------------------ exploration
  exploreHtml() {
    const running = this.job && this.job.kind === 'explore';
    return `
      <div class="ts-opts">
        <label class="field"><span>Pages par taille d’écran</span><input class="input" type="number" min="1" max="500" data-t="maxPages" value="${this.t.maxPages}"></label>
        <div class="field"><span>Tailles d’écran</span><div class="ts-vps">${Object.entries(VPS).map(([k, v]) => `<label class="ab-chip"><input type="checkbox" data-vp="${k}" ${this.t.viewports.includes(k) ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div></div>
        <label class="el-check"><input type="checkbox" data-t="checkLinks" ${this.t.checkLinks ? 'checked' : ''}> Vérifier tous les liens (liens morts)</label>
        <label class="el-check"><input type="checkbox" data-t="screenshots" ${this.t.screenshots ? 'checked' : ''}> Miniature de chaque page</label>
      </div>
      <div class="ts-run">
        ${running ? `<button class="btn small" data-act="cancel">${icon('stop', 12)}<span>Arrêter</span></button>` : `<button class="btn primary small" data-act="explore">${icon('play', 12)}<span>Explorer le site</span></button>`}
        <span class="ts-progress"></span>
      </div>
      ${this.summary || this.results.length ? this.resultsHtml() : `<p class="bl-hint">Ouvre chaque page interne du site (à partir de la page affichée), sur les tailles d’écran choisies, et relève : erreurs HTTP et JavaScript, requêtes en échec, images cassées, liens morts, débordement horizontal sur mobile, titres et descriptions manquants, lenteurs.</p>`}`;
  }

  resultsHtml() {
    const s = this.summary;
    const list = this.onlyIssues ? this.results.filter((r) => r.issues.some((x) => x.level !== 'info')) : this.results;
    return `
      ${s ? `<div class="ts-sum">
        <div><b>${s.pages}</b><span>pages testées</span></div>
        <div class="${s.errors ? 'bad' : 'ok'}"><b>${s.errors}</b><span>erreurs</span></div>
        <div class="${s.warnings ? 'warn' : 'ok'}"><b>${s.warnings}</b><span>alertes</span></div>
        <div class="${s.broken.length ? 'bad' : 'ok'}"><b>${s.broken.length}</b><span>liens morts</span></div>
        <div><b>${(s.avgMs / 1000).toFixed(1).replace('.', ',')} s</b><span>chargement moyen</span></div>
      </div>` : ''}
      ${s && s.broken.length ? `<details class="ts-broken" open><summary>Liens morts (${s.broken.length})</summary>${s.broken.map((b) => `<div class="ts-b"><span class="bad">${b.status === -1 ? 'injoignable' : b.status}</span><span title="${esc(b.url)}">${esc(b.url)}</span><small>sur ${b.from.map((f) => esc(new URL(f).pathname)).join(', ')}</small></div>`).join('')}</details>` : ''}
      <div class="ts-filter"><label class="el-check"><input type="checkbox" data-act="only" ${this.onlyIssues ? 'checked' : ''}> Seulement les pages à problème</label><button class="btn small" data-act="export-tests">${icon('download', 12)}<span>Rapport</span></button></div>
      <div class="ts-pages">${list.map((r, i) => `
        <details class="ts-page ${r.issues.some((x) => x.level === 'error') ? 'bad' : r.issues.some((x) => x.level === 'warn') ? 'warn' : 'ok'}">
          <summary>${r.thumb ? `<img src="data:image/jpeg;base64,${r.thumb}" alt="">` : '<i class="ts-noimg"></i>'}<span class="ts-p-main"><b>${esc((() => { try { return new URL(r.url).pathname; } catch { return r.url; } })())}</b><small>${esc(r.info.title || '')}</small></span>
            <span class="ts-p-meta"><em>${VPS[r.viewport] || r.viewport}</em><span>${r.status || '—'}</span><span>${(r.ms / 1000).toFixed(1).replace('.', ',')} s</span>${r.issues.filter((x) => x.level !== 'info').length ? `<span class="n">${r.issues.filter((x) => x.level !== 'info').length}</span>` : ''}</span></summary>
          <ul>${r.issues.map((x) => `<li class="${x.level}">${icon(x.level === 'error' ? 'error' : x.level === 'warn' ? 'warn' : 'info', 13)}<span>${esc(x.text)}</span></li>`).join('') || `<li class="pass">${icon('pass', 13)}<span>Aucun problème détecté</span></li>`}</ul>
          <div class="ts-p-act"><button class="btn small" data-open="${esc(r.url)}" data-i="${i}">Ouvrir dans le Browser Lab</button></div>
        </details>`).join('')}</div>`;
  }

  // ------------------------------------------------------------------ scénarios
  scenarioHtml() {
    const list = this.lab.st.scenarios;
    const s = this.scn;
    const running = this.job && this.job.kind === 'scenario';
    return `
      <div class="ts-scn-bar">
        <select class="input" data-scn-pick>${list.map((x) => `<option value="${x.id}" ${x.id === this.current ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}${list.length ? '' : '<option>Aucun scénario</option>'}</select>
        <button class="icon-btn small" data-act="scn-new" title="Nouveau scénario">${icon('plus', 14)}</button>
        ${s ? `<button class="icon-btn small" data-act="scn-del" title="Supprimer">${icon('trash', 13)}</button>` : ''}
      </div>
      ${s ? `
        <div class="ts-scn-head">
          <input class="input" data-scn="name" value="${esc(s.name)}">
          <select class="input" data-scn="viewport">${Object.entries(VPS).map(([k, v]) => `<option value="${k}" ${s.viewport === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        </div>
        <div class="ts-run">
          ${this.recording ? `<button class="btn small rec" data-act="rec-stop">${icon('stop', 12)}<span>Arrêter l’enregistrement</span></button>` : `<button class="btn small" data-act="rec">${icon('record', 12)}<span>Enregistrer mes actions</span></button>`}
          ${running ? `<button class="btn small" data-act="cancel">${icon('stop', 12)}<span>Arrêter</span></button>` : `<button class="btn primary small" data-act="scn-run" ${s.steps.length ? '' : 'disabled'}>${icon('play', 12)}<span>Rejouer</span></button>`}
          <button class="btn small" data-act="playwright" ${s.steps.length ? '' : 'disabled'} title="Exporter en script de test automatisé (.spec.ts)">${icon('code', 12)}<span>Exporter le test</span></button>
        </div>
        ${this.recording ? `<p class="bl-hint rec">${icon('record', 12)} Navigue dans la page : chaque clic, saisie et page visitée devient une étape. Ajoute ensuite des vérifications.</p>` : ''}
        <ol class="ts-steps">${s.steps.map((st, i) => this.stepHtml(st, i)).join('')}</ol>
        <div class="ts-add">
          <select class="input" data-add-action>${Object.entries(ACTIONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          <button class="btn small" data-act="step-add">${icon('plus', 12)}<span>Ajouter une étape</span></button>
        </div>
        <div class="ts-scn-res"></div>` : `<p class="bl-hint">Un scénario est une suite d’étapes (ouvrir une page, cliquer, saisir, vérifier un texte…) rejouée automatiquement dans une fenêtre cachée. Crée-en un, puis enregistre tes actions dans la page.</p>`}`;
  }

  stepHtml(st, i) {
    const needs = NEEDS[st.action] || [];
    const res = this.stepResults && this.stepResults[i];
    return `<li class="ts-step ${res ? (res.ok ? 'ok' : 'bad') : ''}">
      <select class="input" data-step="${i}" data-f="action">${Object.entries(ACTIONS).map(([k, v]) => `<option value="${k}" ${st.action === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      ${needs.some((n) => n.startsWith('selector')) ? `<span class="ts-sel"><input class="input mono" data-step="${i}" data-f="selector" value="${esc(st.selector || '')}" placeholder="Sélecteur CSS ou text=Libellé"><button class="icon-btn small" data-act="step-pick" data-i="${i}" title="Choisir dans la page">${icon('target', 12)}</button></span>` : ''}
      ${needs.some((n) => n.startsWith('value')) ? `<input class="input" data-step="${i}" data-f="value" value="${esc(st.value || '')}" placeholder="${st.action === 'goto' ? 'Adresse ou /chemin' : st.action === 'wait' ? 'Durée (ms)' : st.action === 'press' ? 'Enter, Escape, Tab…' : st.secret ? 'Mot de passe (non enregistré)' : 'Valeur'}" ${st.secret ? 'type="password"' : ''}>` : ''}
      <span class="ts-step-act"><button class="icon-btn small" data-act="step-up" data-i="${i}">${icon('chevronDown', 12, 'up')}</button><button class="icon-btn small" data-act="step-del" data-i="${i}">${icon('close', 12)}</button></span>
      ${res && !res.ok ? `<div class="ts-err">${esc(res.error || 'Échec')}${res.thumb ? `<img src="data:image/jpeg;base64,${res.thumb}" alt="">` : ''}</div>` : ''}
      ${res && res.ok && res.thumb ? `<div class="ts-ok"><img src="data:image/jpeg;base64,${res.thumb}" alt=""></div>` : ''}
    </li>`;
  }

  addStep(step, fromRec) {
    const s = this.scn;
    if (!s) return;
    const last = s.steps[s.steps.length - 1];
    if (fromRec && last && last.action === step.action && step.action === 'type' && last.selector === step.selector) last.value = step.value;
    else if (fromRec && step.action === 'goto' && last && last.action === 'click') { /* navigation due au clic : rien à ajouter */ } else s.steps.push(step);
    this.lab.save();
    if (this.t.mode === 'scenario') this.renderBody();
  }

  async injectRecorder() {
    if (this.lab.wv) await this.lab.wv.executeJavaScript(RECORDER).catch(() => {});
  }

  onPicker(m) {
    if (m.type === 'rec' && this.recording) { this.addStep(m.step, true); return; }
    if (m.type === 'select' && this.pickFor != null) {
      const s = this.scn;
      if (s && s.steps[this.pickFor]) { s.steps[this.pickFor].selector = m.info.selector; this.lab.save(); }
      this.pickFor = null;
      this.lab.togglePick('element');
      this.lab.openTab('tests');
      this.renderBody();
    }
  }

  playwright() {
    const s = this.scn;
    const q = (v) => JSON.stringify(v || '');
    const loc = (sel) => (sel && sel.startsWith('text=') ? `page.getByText(${q(sel.slice(5))}).first()` : `page.locator(${q(sel)}).first()`);
    const vp = { desktop: [1440, 900], laptop: [1280, 800], tablet: [820, 1180], mobile: [390, 844] }[s.viewport || 'desktop'];
    const lines = s.steps.map((st) => {
      switch (st.action) {
        case 'goto': return `  await page.goto(${q(st.value)});`;
        case 'click': return `  await ${loc(st.selector)}.click();`;
        case 'type': return `  await ${loc(st.selector)}.fill(${st.secret ? 'process.env.MOT_DE_PASSE' : q(st.value)});`;
        case 'select': return `  await ${loc(st.selector)}.selectOption(${q(st.value)});`;
        case 'press': return `  await page.keyboard.press(${q(st.value || 'Enter')});`;
        case 'wait': return st.selector ? `  await ${loc(st.selector)}.waitFor();` : `  await page.waitForTimeout(${Number(st.value) || 1000});`;
        case 'scroll': return st.selector ? `  await ${loc(st.selector)}.scrollIntoViewIfNeeded();` : '  await page.mouse.wheel(0, 800);';
        case 'assertText': return `  await expect(page.locator('body')).toContainText(${q(st.value)});`;
        case 'assertNoText': return `  await expect(page.locator('body')).not.toContainText(${q(st.value)});`;
        case 'assertUrl': return `  await expect(page).toHaveURL(new RegExp(${q(String(st.value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))}));`;
        case 'assertVisible': return `  await expect(${loc(st.selector)}).toBeVisible();`;
        case 'assertTitle': return `  await expect(page).toHaveTitle(new RegExp(${q(String(st.value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))}, 'i'));`;
        case 'assertNoErrors': return '  expect(erreurs).toEqual([]);';
        case 'screenshot': return `  await page.screenshot({ path: ${q(`${s.name}-${Date.now()}.png`)}, fullPage: true });`;
        default: return '';
      }
    });
    return `// Généré par NEX-BROWSER : npx playwright test
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: ${vp[0]}, height: ${vp[1]} }${s.viewport === 'mobile' || s.viewport === 'tablet' ? ', isMobile: true, hasTouch: true' : ''} });

test(${q(s.name)}, async ({ page }) => {
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
${lines.join('\n')}
});
`;
  }

  // ------------------------------------------------------------------ exécution
  async start(kind) {
    const url = this.lab.url;
    if (!url) { toast('Ouvre d’abord une page.', { kind: 'bad' }); return; }
    if (kind === 'explore') {
      this.results = [];
      this.summary = null;
      const r = await api.invoke('lab:test-start', {
        url, kind: 'explore', options: { maxPages: Number(this.t.maxPages) || 25, viewports: this.t.viewports.length ? this.t.viewports : ['desktop'], checkLinks: this.t.checkLinks, screenshots: this.t.screenshots },
      });
      this.job = { id: r.id, kind };
    } else {
      const s = this.scn;
      const steps = s.steps.map((st) => (st.secret ? { ...st, value: this.secrets.get(st) || '' } : st));
      if (!steps.length || steps[0].action !== 'goto') steps.unshift({ action: 'goto', value: url });
      this.stepResults = [];
      const r = await api.invoke('lab:test-start', { url, kind: 'scenario', steps, viewport: s.viewport || 'desktop' });
      this.job = { id: r.id, kind, offset: steps.length - s.steps.length };
    }
    this.renderBody();
  }

  onEvent(m) {
    if (!this.job || m.id !== this.job.id) return;
    const prog = $('.ts-progress', this.el);
    if (m.phase === 'page' && prog) prog.textContent = `${VPS[m.viewport] || ''} · page ${m.done} / ${m.total} · ${m.url}`;
    if (m.phase === 'links' && prog) prog.textContent = `Vérification des liens ${m.done} / ${m.total}`;
    if (m.phase === 'result') {
      this.results.push(m.result);
      const box = $('.ts-pages', this.el);
      if (box || !this.summary) this.renderBody();
    }
    if (m.phase === 'step') {
      const i = m.result.i - (this.job.offset || 0);
      if (i >= 0) { this.stepResults[i] = m.result; this.renderBody(); }
    }
    if (m.phase === 'done') {
      if (this.job.kind === 'explore') this.summary = m.summary;
      else toast(m.summary.ok ? 'Scénario réussi.' : 'Le scénario a échoué : voir l’étape en rouge.', { kind: m.summary.ok ? '' : 'bad' });
      this.job = null;
      this.renderBody();
    }
    if (m.phase === 'error') {
      toast(m.error, { kind: 'bad' });
      this.job = null;
      this.renderBody();
    }
  }

  async onClick(e) {
    const sg = e.target.closest('[data-set="tsMode"]');
    if (sg) { this.t.mode = sg.dataset.val; this.lab.save(); this.render(); return; }
    const open = e.target.closest('[data-open]');
    if (open) { this.lab.navigate(open.dataset.open); return; }
    if (e.target.matches('[data-act="only"]')) { this.onlyIssues = e.target.checked; this.renderBody(); return; }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const s = this.scn;
    const i = Number(a.dataset.i);
    try {
      switch (a.dataset.act) {
        case 'explore': await this.start('explore'); break;
        case 'scn-run': await this.start('scenario'); break;
        case 'cancel': if (this.job) api.invoke('lab:test-cancel', { id: this.job.id }); break;
        case 'scn-new': {
          const n = { id: uid(), name: `Scénario ${this.lab.st.scenarios.length + 1}`, viewport: 'desktop', steps: this.lab.url ? [{ action: 'goto', value: this.lab.url }] : [] };
          this.lab.st.scenarios.push(n);
          this.current = n.id;
          this.lab.save();
          this.renderBody();
          break;
        }
        case 'scn-del':
          this.lab.st.scenarios = this.lab.st.scenarios.filter((x) => x.id !== this.current);
          this.current = this.lab.st.scenarios[0] ? this.lab.st.scenarios[0].id : null;
          this.lab.save();
          this.renderBody();
          break;
        case 'rec':
          this.recording = true;
          if (s && !s.steps.length && this.lab.url) s.steps.push({ action: 'goto', value: this.lab.url });
          await this.injectRecorder();
          this.renderBody();
          break;
        case 'rec-stop':
          this.recording = false;
          if (this.lab.wv) this.lab.wv.executeJavaScript('window.__vtRec && (window.__vtRec.on = false)').catch(() => {});
          this.renderBody();
          break;
        case 'step-add': {
          const action = $('[data-add-action]', this.el).value;
          s.steps.push({ action, selector: '', value: action === 'goto' ? (this.lab.url || '') : '' });
          this.lab.save();
          this.renderBody();
          break;
        }
        case 'step-del': s.steps.splice(i, 1); this.lab.save(); this.renderBody(); break;
        case 'step-up': if (i > 0) { [s.steps[i - 1], s.steps[i]] = [s.steps[i], s.steps[i - 1]]; this.lab.save(); this.renderBody(); } break;
        case 'step-pick':
          this.pickFor = i;
          if (!(this.lab.st.pick && this.lab.st.pickMode === 'element')) await this.lab.togglePick('element');
          this.lab.openTab('tests');
          toast('Clique sur l’élément dans la page.');
          break;
        case 'playwright': {
          const f = await api.invoke('lab:save-text', { name: `${s.name.replace(/[<>:"/\\|?*]+/g, '-')}.spec.ts`, text: this.playwright(), filters: [{ name: 'Script de test', extensions: ['ts', 'js'] }] });
          if (f) toast('Script de test enregistré.', { action: 'Afficher', onAction: () => api.invoke('lab:reveal', f) });
          break;
        }
        case 'export-tests': {
          const f = await api.invoke('lab:save-text', { name: 'tests-navigation.json', text: JSON.stringify({ summary: this.summary, results: this.results.map(({ thumb, ...r }) => r) }, null, 2), filters: [{ name: 'JSON', extensions: ['json'] }] });
          if (f) toast('Rapport enregistré.');
          break;
        }
        default: break;
      }
    } catch (err) { toast(err.message, { kind: 'bad' }); }
  }

  onChange(e) {
    const t = e.target;
    if (t.dataset.vp) {
      const set = new Set(this.t.viewports);
      if (t.checked) set.add(t.dataset.vp); else set.delete(t.dataset.vp);
      this.t.viewports = Object.keys(VPS).filter((k) => set.has(k));
      this.lab.save();
      return;
    }
    if (t.dataset.t) { this.t[t.dataset.t] = t.type === 'checkbox' ? t.checked : t.value; this.lab.save(); return; }
    if (t.dataset.scnPick !== undefined) { this.current = t.value; this.stepResults = null; this.renderBody(); return; }
    if (t.dataset.scn) { this.scn[t.dataset.scn] = t.value; this.lab.save(); return; }
    if (t.dataset.step != null && t.dataset.f === 'action') { this.scn.steps[Number(t.dataset.step)].action = t.value; this.lab.save(); this.renderBody(); }
  }

  onInput(e) {
    const t = e.target;
    if (t.dataset.step != null && t.dataset.f !== 'action') {
      const st = this.scn.steps[Number(t.dataset.step)];
      // Les mots de passe restent en mémoire, jamais dans les réglages enregistrés.
      if (st.secret && t.dataset.f === 'value') { this.secrets.set(st, t.value); return; }
      st[t.dataset.f] = t.value;
      this.lab.save();
    }
  }
}
