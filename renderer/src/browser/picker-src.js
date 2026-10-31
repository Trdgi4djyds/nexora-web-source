/* Script injecté dans la page du Browser Lab : sélection de composants et de sections façon Figma.
 * Survol : contour et étiquette (balise, classe, taille). Clic : sélection (attribut data-vitrine-sel).
 * Clavier : Échap (désélectionner), ↑ ou Maj+Entrée (parent), ↓ ou Entrée (premier enfant), ← → (voisins).
 * Les messages remontent à NEXORA par console.debug('__VT__' + JSON). */
export const PICKER_SRC = String.raw`(function (opts) {
  if (window.__vtPick) { window.__vtPick.on(opts); return 'on'; }
  const ATTR = 'data-vitrine-sel';
  const post = (m) => { try { console.debug('__VT__' + JSON.stringify(m)); } catch (e) { /* page */ } };
  const host = document.createElement('vitrine-picker');
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;display:block';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = '<style>'
    + '.b{position:fixed;box-sizing:border-box;pointer-events:none;border-radius:2px;transition:all .06s ease-out}'
    + '.h{border:1.5px solid #0d99ff;background:rgba(13,153,255,.06)}'
    + '.s{border:2px solid #0d99ff;box-shadow:0 0 0 9999px rgba(0,0,0,.0)}'
    + '.p{border:1px dashed rgba(13,153,255,.7)}'
    + '.m{background:rgba(255,155,40,.18)}.pd{background:rgba(40,200,120,.16)}'
    + '.l{position:fixed;font:600 11px/1 Inter,system-ui,sans-serif;color:#fff;background:#0d99ff;padding:4px 6px;border-radius:4px;white-space:nowrap;pointer-events:none;max-width:60vw;overflow:hidden;text-overflow:ellipsis}'
    + '.l i{font-style:normal;opacity:.75;font-weight:500;margin-left:6px}'
    + '.k{position:fixed;width:7px;height:7px;background:#fff;border:1.5px solid #0d99ff;box-sizing:border-box;border-radius:1px}'
    + '.d{position:fixed;font:600 10px/1 Inter,system-ui,sans-serif;color:#fff;background:#f24822;padding:3px 5px;border-radius:3px}'
    + '</style><div class="b p" id="pp" hidden></div><div class="b h" id="hv" hidden></div><div class="b s" id="sl" hidden></div>'
    + '<div class="b m" id="mt" hidden></div><div class="b m" id="mr" hidden></div><div class="b m" id="mb" hidden></div><div class="b m" id="ml" hidden></div>'
    + '<div class="l" id="lb" hidden></div><div class="k" id="k1" hidden></div><div class="k" id="k2" hidden></div><div class="k" id="k3" hidden></div><div class="k" id="k4" hidden></div><div class="d" id="dz" hidden></div>';
  const $ = (id) => root.getElementById(id);
  document.documentElement.appendChild(host);
  let mode = (opts && opts.mode) || 'element';
  let hover = null;
  let sel = null;
  let active = true;

  const SECTION_TAGS = /^(HEADER|NAV|MAIN|SECTION|FOOTER|ASIDE|ARTICLE|FORM|DIALOG)$/;
  const isSection = (el) => {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (SECTION_TAGS.test(el.tagName)) return true;
    const r = el.getBoundingClientRect();
    const p = el.parentElement;
    if (!p) return false;
    const pr = p.getBoundingClientRect();
    return r.width >= innerWidth * 0.6 && r.height >= 80 && (p === document.body || SECTION_TAGS.test(p.tagName) || pr.width >= innerWidth * 0.9) && r.height < pr.height * 0.95;
  };
  const sectionOf = (el) => { let e = el; while (e && e !== document.body) { if (isSection(e)) return e; e = e.parentElement; } return el; };
  const label = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cls = [...el.classList].filter((c) => !/^(css-|sc-|jsx-|svelte-)/.test(c)).slice(0, 2);
    if (cls.length) s += '.' + cls.join('.');
    return s;
  };
  const compName = (el) => {
    try {
      const k = Object.keys(el).find((x) => x.startsWith('__reactFiber'));
      if (k) {
        let f = el[k];
        while (f) {
          if (typeof f.type === 'function' || (f.type && typeof f.type === 'object' && (f.type.render || f.type.type))) {
            const t = f.type.render || f.type.type || f.type;
            const n = f.type.displayName || t.displayName || t.name;
            if (n && !/^(div|span)$/.test(n)) return { lib: 'React', name: n };
          }
          f = f.return;
        }
      }
      let v = el.__vueParentComponent || (el.__vue__ && el.__vue__.$);
      if (v && v.type) return { lib: 'Vue', name: v.type.name || v.type.__name || (v.type.__file || '').split('/').pop() };
      let e = el;
      while (e) { if (e.tagName && e.tagName.includes('-') && !/^VITRINE/.test(e.tagName)) return { lib: 'Composant web', name: e.tagName.toLowerCase() }; e = e.parentElement; }
    } catch (err) { /* introspection impossible */ }
    return null;
  };
  const cssPath = (el) => {
    if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id) && document.querySelectorAll('#' + el.id).length === 1) return '#' + el.id;
    const parts = [];
    let e = el;
    while (e && e.nodeType === 1 && e !== document.documentElement && parts.length < 8) {
      let p = e.tagName.toLowerCase();
      if (e.id && /^[a-zA-Z][\w-]*$/.test(e.id)) { parts.unshift('#' + e.id); break; }
      const cls = [...e.classList].filter((c) => /^[a-zA-Z_][\w-]*$/.test(c) && !/^(css-|sc-|jsx-)/.test(c)).slice(0, 2);
      if (cls.length) p += '.' + cls.join('.');
      const parent = e.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === e.tagName && (!cls.length || cls.every((x) => c.classList.contains(x))));
        if (same.length > 1) p += ':nth-of-type(' + ([...parent.children].filter((c) => c.tagName === e.tagName).indexOf(e) + 1) + ')';
      }
      parts.unshift(p);
      try { if (document.querySelectorAll(parts.join(' > ')).length === 1) break; } catch (err) { /* sélecteur invalide */ }
      e = parent;
    }
    return parts.join(' > ');
  };
  const place = (box, r) => { box.hidden = false; box.style.left = r.left + 'px'; box.style.top = r.top + 'px'; box.style.width = r.width + 'px'; box.style.height = r.height + 'px'; };
  const info = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const pick = ['display', 'position', 'width', 'height', 'margin', 'padding', 'gap', 'flex-direction', 'justify-content', 'align-items', 'grid-template-columns', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color', 'background-color', 'background-image', 'border', 'border-radius', 'box-shadow', 'opacity', 'z-index', 'overflow', 'transform', 'transition'];
    const styles = {};
    for (const k of pick) { const v = cs.getPropertyValue(k); if (v && !/^(none|normal|auto|0px|rgba\(0, 0, 0, 0\)|visible|static)$/.test(v)) styles[k] = v; }
    const path = [];
    let e = el;
    while (e && e.nodeType === 1 && e !== document.documentElement) { path.unshift({ label: label(e), section: isSection(e) }); e = e.parentElement; }
    const imgs = [...el.querySelectorAll('img, picture source, video, svg')].length + (el.tagName === 'IMG' ? 1 : 0);
    const bgs = [];
    for (const n of [el, ...el.querySelectorAll('*')].slice(0, 400)) { const b = getComputedStyle(n).backgroundImage; if (b && b.startsWith('url(')) bgs.push(b.slice(4, -1).replace(/^"|"$/g, '')); }
    const assets = [...new Set([...[el, ...el.querySelectorAll('img')].filter((x) => x.tagName === 'IMG').map((x) => x.currentSrc || x.src), ...[...el.querySelectorAll('video, source')].map((x) => x.src).filter(Boolean), ...bgs])].filter((u) => u && !u.startsWith('data:')).slice(0, 60);
    return {
      label: label(el), tag: el.tagName.toLowerCase(), id: el.id || '', classes: [...el.classList], selector: cssPath(el), text: (el.innerText || '').trim().slice(0, 160),
      rect: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), width: Math.round(r.width), height: Math.round(r.height) },
      children: el.children.length, descendants: el.querySelectorAll('*').length, role: el.getAttribute('role') || '', ariaLabel: el.getAttribute('aria-label') || '', href: el.href || '', src: el.currentSrc || el.src || '',
      styles, path, section: isSection(el), component: compName(el), media: imgs, assets,
    };
  };
  const drawHover = () => {
    if (!hover || !active) { $('hv').hidden = true; $('lb').hidden = true; for (const id of ['mt', 'mr', 'mb', 'ml']) $(id).hidden = true; return; }
    const r = hover.getBoundingClientRect();
    place($('hv'), r);
    const lb = $('lb');
    lb.hidden = false;
    lb.innerHTML = '';
    lb.textContent = label(hover);
    const dim = document.createElement('i');
    dim.textContent = Math.round(r.width) + ' × ' + Math.round(r.height);
    lb.appendChild(dim);
    const comp = compName(hover);
    if (comp && mode !== 'section') { const c = document.createElement('i'); c.textContent = '⟨' + comp.name + '⟩'; lb.appendChild(c); }
    const top = r.top > 24 ? r.top - 22 : r.bottom + 4;
    lb.style.left = Math.max(2, Math.min(innerWidth - lb.offsetWidth - 2, r.left)) + 'px';
    lb.style.top = top + 'px';
    // Marges (orange) autour de l'élément survolé.
    const cs = getComputedStyle(hover);
    const m = ['Top', 'Right', 'Bottom', 'Left'].map((k) => parseFloat(cs['margin' + k]) || 0);
    const boxes = [['mt', { left: r.left, top: r.top - m[0], width: r.width, height: m[0] }], ['mr', { left: r.right, top: r.top, width: m[1], height: r.height }], ['mb', { left: r.left, top: r.bottom, width: r.width, height: m[2] }], ['ml', { left: r.left - m[3], top: r.top, width: m[3], height: r.height }]];
    for (const [id, b] of boxes) { if (b.width > 0 && b.height > 0) place($(id), b); else $(id).hidden = true; }
  };
  const drawSel = () => {
    const ks = ['k1', 'k2', 'k3', 'k4'];
    if (!sel || !document.contains(sel)) { $('sl').hidden = true; $('pp').hidden = true; $('dz').hidden = true; ks.forEach((k) => { $(k).hidden = true; }); return; }
    const r = sel.getBoundingClientRect();
    place($('sl'), r);
    const pts = [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]];
    ks.forEach((k, i) => { const b = $(k); b.hidden = false; b.style.left = (pts[i][0] - 3.5) + 'px'; b.style.top = (pts[i][1] - 3.5) + 'px'; });
    const dz = $('dz');
    dz.hidden = false;
    dz.textContent = Math.round(r.width) + ' × ' + Math.round(r.height);
    dz.style.left = (r.left + r.width / 2 - dz.offsetWidth / 2) + 'px';
    dz.style.top = Math.min(innerHeight - 18, r.bottom + 6) + 'px';
    const p = sel.parentElement;
    if (p && p !== document.body && p !== document.documentElement) place($('pp'), p.getBoundingClientRect()); else $('pp').hidden = true;
  };
  let raf = 0;
  const redraw = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; drawHover(); drawSel(); }); };
  const target = (e) => {
    let el = e.composedPath ? e.composedPath()[0] : e.target;
    if (!el || el === host || el.nodeType !== 1) el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === host) return null;
    if (el.closest && el.closest('vitrine-picker')) return null;
    return mode === 'section' ? sectionOf(el) : el;
  };
  const choose = (el, scroll) => {
    if (!el || el.nodeType !== 1) return;
    document.querySelectorAll('[' + ATTR + ']').forEach((x) => x.removeAttribute(ATTR));
    sel = el;
    sel.setAttribute(ATTR, '');
    if (scroll) sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    redraw();
    post({ type: 'select', info: info(sel) });
  };
  const onMove = (e) => { if (!active) return; const t = target(e); if (t !== hover) { hover = t; redraw(); } };
  const swallow = (e) => { if (!active) return; e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
  const onClick = (e) => { if (!active) return; swallow(e); const t = target(e); if (t) choose(t); };
  const onKey = (e) => {
    if (!active || !sel) { if (active && e.key === 'Escape') post({ type: 'escape' }); return; }
    let n = null;
    if (e.key === 'Escape') { document.querySelectorAll('[' + ATTR + ']').forEach((x) => x.removeAttribute(ATTR)); sel = null; redraw(); post({ type: 'deselect' }); swallow(e); return; }
    if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) n = sel.parentElement;
    else if (e.key === 'ArrowDown' || e.key === 'Enter') n = sel.firstElementChild;
    else if (e.key === 'ArrowLeft') n = sel.previousElementSibling;
    else if (e.key === 'ArrowRight') n = sel.nextElementSibling;
    if (n && n !== document.documentElement && n !== document.body.parentElement) { swallow(e); choose(n, true); }
  };
  const evOpts = { capture: true, passive: false };
  const listen = () => {
    addEventListener('mousemove', onMove, true);
    for (const t of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick', 'dblclick', 'contextmenu']) addEventListener(t, t === 'click' ? onClick : swallow, evOpts);
    addEventListener('keydown', onKey, true);
    addEventListener('scroll', redraw, true);
    addEventListener('resize', redraw);
  };
  const unlisten = () => {
    removeEventListener('mousemove', onMove, true);
    for (const t of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick', 'dblclick', 'contextmenu']) removeEventListener(t, t === 'click' ? onClick : swallow, evOpts);
    removeEventListener('keydown', onKey, true);
  };
  listen();
  const sections = () => {
    const out = [];
    const seen = new Set();
    const walk = (el, depth) => {
      for (const c of el.children) {
        if (c === host || /^(SCRIPT|STYLE|LINK|META|NOSCRIPT|TEMPLATE)$/.test(c.tagName)) continue;
        const r = c.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) { if (depth < 4) walk(c, depth); continue; }
        if (isSection(c) && !seen.has(c)) {
          seen.add(c);
          const h = c.querySelector('h1, h2, h3');
          out.push({ selector: cssPath(c), label: label(c), title: h ? h.innerText.trim().slice(0, 60) : (c.getAttribute('aria-label') || ''), height: Math.round(r.height), depth });
          if (depth < 2) walk(c, depth + 1);
        } else if (depth < 4) walk(c, depth);
      }
    };
    walk(document.body, 0);
    return out.slice(0, 80);
  };
  window.__vtPick = {
    on(o) { active = true; if (o && o.mode) mode = o.mode; host.style.display = 'block'; unlisten(); listen(); redraw(); },
    off() { active = false; hover = null; unlisten(); redraw(); },
    hide() { active = false; hover = null; unlisten(); document.querySelectorAll('[' + ATTR + ']').forEach((x) => x.removeAttribute(ATTR)); sel = null; host.style.display = 'none'; },
    mode(m) { mode = m; },
    select(s) { try { const el = document.querySelector(s); if (el) choose(el, true); return Boolean(el); } catch (e) { return false; } },
    selectPath(i) { if (!sel) return; const chain = []; let e = sel; while (e && e !== document.documentElement) { chain.unshift(e); e = e.parentElement; } if (chain[i]) choose(chain[i], true); },
    nav(dir) { onKey({ key: dir, shiftKey: false, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} }); },
    sections,
    current() { return sel ? info(sel) : null; },
  };
  return 'ready';
})`;
