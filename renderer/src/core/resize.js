/* Panneaux redimensionnables : une poignée sur le bord, largeur enregistrée, double-clic pour revenir
 * à la largeur d'origine. */
import { settings, persist } from './settings.js';
import { bus } from './dom.js';

/**
 * panel : élément à redimensionner (sa largeur est fixée en style).
 * edge  : 'right' (poignée à droite, la largeur augmente vers la droite) ou 'left'.
 * axis  : 'x' (largeur) ou 'y' (hauteur, poignée en haut ou en bas avec edge 'top' / 'bottom').
 */
export function resizable(panel, {
  key, edge = 'right', min = 160, max = 720, def = null, onResize = null,
} = {}) {
  if (!panel || panel.querySelector(':scope > .rz-handle')) return null;
  const vertical = edge === 'top' || edge === 'bottom';
  const handle = document.createElement('div');
  handle.className = `rz-handle rz-${edge}`;
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', vertical ? 'horizontal' : 'vertical');
  handle.title = 'Glisser pour redimensionner · double-clic : taille d’origine';
  if (getComputedStyle(panel).position === 'static') panel.style.position = 'relative';
  panel.append(handle);
  const prop = vertical ? 'height' : 'width';
  const initial = def || panel.getBoundingClientRect()[prop] || min;
  const clampV = (v) => Math.max(min, Math.min(typeof max === 'function' ? max() : max, v));
  const apply = (v, save) => {
    const px = Math.round(clampV(v));
    panel.style[prop] = `${px}px`;
    panel.style.flex = '0 0 auto';
    if (save) {
      settings.panels = { ...(settings.panels || {}), [key]: px };
      persist();
    }
    if (onResize) onResize(px);
    bus.emit('layout-changed');
  };
  const saved = settings.panels && settings.panels[key];
  if (saved) apply(saved, false);

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const start = vertical ? e.clientY : e.clientX;
    const startSize = panel.getBoundingClientRect()[prop];
    const sign = edge === 'right' || edge === 'bottom' ? 1 : -1;
    document.body.classList.add(vertical ? 'rz-dragging-y' : 'rz-dragging');
    let raf = 0;
    let last = startSize;
    const move = (ev) => {
      last = startSize + sign * ((vertical ? ev.clientY : ev.clientX) - start);
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; apply(last, false); });
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      document.body.classList.remove('rz-dragging', 'rz-dragging-y');
      apply(last, true);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
  handle.addEventListener('dblclick', () => {
    panel.style[prop] = '';
    panel.style.flex = '';
    settings.panels = { ...(settings.panels || {}) };
    delete settings.panels[key];
    persist();
    if (def) apply(def, false);
    else if (onResize) onResize(initial);
    bus.emit('layout-changed');
  });
  return { handle, set: (v) => apply(v, true) };
}
