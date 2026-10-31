/* Éléments d'interface partagés : notifications, popovers, feuilles, commandes segmentées. */
import { $, esc } from './dom.js';
import { icon } from './icons.js';
import { api } from './api.js';

// ------------------------------------------------------------------ notifications
export function toast(text, opts = {}) {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = `toast${opts.kind === 'bad' ? ' bad' : ''}`;
  t.innerHTML = `${opts.busy ? '<span class="spinner small"></span>' : icon(opts.kind === 'bad' ? 'warn' : 'pass', 16, 'lvl')}<span class="tt">${esc(text)}</span>${opts.action ? `<button class="toast-act">${esc(opts.action)}</button>` : ''}<button class="toast-x" aria-label="Fermer">${icon('close', 12)}</button>`;
  if (opts.action) $('.toast-act', t).onclick = () => { opts.onAction(); t.remove(); };
  $('.toast-x', t).onclick = () => t.remove();
  box.append(t);
  const life = opts.sticky ? 0 : (opts.ms || (opts.kind === 'bad' ? 9000 : 5500));
  if (life) {
    setTimeout(() => t.classList.add('out'), life);
    setTimeout(() => t.remove(), life + 400);
  }
  return {
    el: t,
    update(txt) { $('.tt', t).textContent = txt; },
    close() { t.classList.add('out'); setTimeout(() => t.remove(), 350); },
  };
}

// ------------------------------------------------------------------ popovers
let popAnchor = null;
let popClose = null;
export function showPopover(anchor, html, { align = 'end', above = false, width, onClose } = {}) {
  const pop = $('#popover');
  if (popAnchor === anchor && !pop.hidden) { hidePopover(); return null; }
  hidePopover();
  // Le popover est réutilisé : on retire les gestionnaires du menu précédent.
  pop.onclick = null; pop.onchange = null; pop.oninput = null; pop.onkeydown = null; pop.onsubmit = null;
  pop.innerHTML = html;
  pop.style.width = width ? `${width}px` : '';
  pop.hidden = false;
  popAnchor = anchor;
  popClose = onClose || null;
  anchor.classList.add('open');
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth;
  const ph = pop.offsetHeight;
  // Ancré dans le rail de gauche : le menu s'ouvre à droite du bouton.
  if (anchor.closest && anchor.closest('.rail')) {
    pop.style.left = `${Math.min(window.innerWidth - pw - 10, r.right + 12)}px`;
    pop.style.top = `${Math.max(10, Math.min(window.innerHeight - ph - 10, r.bottom - ph))}px`;
    return pop;
  }
  const left = align === 'center' ? r.left + r.width / 2 - pw / 2 : align === 'start' ? r.left : r.right - pw;
  pop.style.left = `${Math.max(10, Math.min(window.innerWidth - pw - 10, left))}px`;
  let top = above ? r.top - ph - 12 : r.bottom + 8;
  if (top + ph > window.innerHeight - 10) top = Math.max(10, r.top - ph - 12);
  pop.style.top = `${Math.max(10, top)}px`;
  return pop;
}
export function hidePopover() {
  const pop = $('#popover');
  if (pop.hidden) return;
  pop.hidden = true;
  if (popAnchor) popAnchor.classList.remove('open');
  popAnchor = null;
  if (popClose) { const f = popClose; popClose = null; f(); }
}
export function popoverAnchor() { return popAnchor; }
document.addEventListener('mousedown', (e) => {
  const pop = $('#popover');
  if (pop && !pop.hidden && !pop.contains(e.target) && popAnchor && !popAnchor.contains(e.target)) hidePopover();
});

// ------------------------------------------------------------------ feuilles modales
let sheetKind = null;
let sheetOnClose = null;
export function openSheet(kind, html, { wide = false, onClose, refresh } = {}) {
  const backdrop = $('#sheetBackdrop');
  const sheet = $('#sheet');
  sheetKind = kind;
  sheetOnClose = onClose || null;
  sheet.classList.toggle('wide', wide);
  // La feuille est réutilisée : les gestionnaires de la fenêtre précédente ne doivent pas rester actifs.
  sheet.onclick = null; sheet.onchange = null; sheet.oninput = null; sheet.onkeydown = null; sheet.onsubmit = null;
  // Fenêtre capable de se redessiner : un bouton ⟳ apparaît dans son en-tête.
  sheet.refresh = refresh || null;
  sheet.innerHTML = html;
  backdrop.hidden = false;
  requestAnimationFrame(() => backdrop.classList.add('open'));
  const first = $('[data-autofocus]', sheet) || $('button', sheet);
  if (first) first.focus();
  return sheet;
}
export function closeSheet(kind) {
  if (kind && sheetKind !== kind) return;
  const backdrop = $('#sheetBackdrop');
  backdrop.classList.remove('open');
  backdrop.hidden = true;
  sheetKind = null;
  if (sheetOnClose) { const f = sheetOnClose; sheetOnClose = null; f(); }
}
export const currentSheet = () => sheetKind;

// ------------------------------------------------------------------ commandes
export function seg(name, value, options, cls = 'wide') {
  return `<div class="seg ${cls}" role="radiogroup">${Object.entries(options).map(([k, label]) => `<button role="radio" aria-checked="${String(k) === String(value)}" class="${String(k) === String(value) ? 'on' : ''}" data-set="${name}" data-val="${k}">${label}</button>`).join('')}</div>`;
}
export function toggle(name, label, hint, on) {
  return `<label class="tog-row"><span class="tog-text"><span>${esc(label)}</span>${hint ? `<small>${esc(hint)}</small>` : ''}</span><input type="checkbox" data-toggle="${name}" ${on ? 'checked' : ''}><span class="tog" aria-hidden="true"></span></label>`;
}
export function refreshSeg(btn) {
  for (const b of btn.parentElement.children) { b.classList.toggle('on', b === btn); b.setAttribute('aria-checked', String(b === btn)); }
}
export function stepsHtml(steps) {
  if (!steps || !steps.length) return '';
  return `<ol class="steps">${steps.map((st) => `
    <li><p>${esc(st.text)}</p>
      ${st.cmd ? `<div class="cmd"><code>${esc(st.cmd)}</code><button class="cmd-copy" data-copy="${esc(st.cmd)}" title="Copier la commande" aria-label="Copier la commande">${icon('copy', 15)}</button></div>` : ''}
      ${st.url ? `<button class="link-btn" data-external="${esc(st.url)}">${icon('external', 14)}<span>${esc(st.label || st.url)}</span></button>` : ''}
    </li>`).join('')}</ol>`;
}

// Boutons « copier » et liens externes, partout dans l'interface.
document.addEventListener('click', async (e) => {
  const copy = e.target.closest('[data-copy]');
  if (copy) {
    await api.invoke('clipboard:write', copy.dataset.copy);
    const prev = copy.innerHTML;
    copy.classList.add('done');
    copy.innerHTML = icon('check', 15);
    setTimeout(() => { copy.classList.remove('done'); copy.innerHTML = prev; }, 1400);
    return;
  }
  const ext = e.target.closest('[data-external]');
  if (ext) api.invoke('shell:external', ext.dataset.external);
});

// Rangées qui défilent horizontalement (barres d'outils, listes de puces) : la molette verticale les fait
// défiler sur le côté, sans devoir fermer ce qui est ouvert. Le pavé tactile et le doigt fonctionnent déjà.
document.addEventListener('wheel', (e) => {
  if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || !e.deltaY) return;
  let el = e.target instanceof Element ? e.target : null;
  for (let i = 0; el && i < 8; i++, el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 2 && el.scrollHeight <= el.clientHeight + 2) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === 'auto' || ox === 'scroll') {
        const max = el.scrollWidth - el.clientWidth;
        if ((e.deltaY > 0 && el.scrollLeft < max) || (e.deltaY < 0 && el.scrollLeft > 0)) {
          el.scrollLeft += e.deltaY;
          e.preventDefault();
        }
        return;
      }
    }
    if (el.scrollHeight > el.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(el).overflowY)) return;
  }
}, { passive: false });
