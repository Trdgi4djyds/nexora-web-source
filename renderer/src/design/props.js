/* NEX-DESIGN › panneau des propriétés : page, transformation, remplissage (uni, dégradés), contour, texte,
 * effets (ombre, flou, mode de fusion), retouche d'image (filtres) et réglages des calques 3D. */
import { Gradient, Shadow, Polygon, filters as F } from 'fabric';
import { settings, persist } from '../core/settings.js';
import { esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { openColorPicker } from './colorpicker.js';
import { SHAPES3D } from './layer3d.js';
import { FINISHES } from '../studio/materials.js';
import { BOOL_OPS, canBoolean } from './boolean.js';

const BLENDS = {
  'source-over': 'Normal', multiply: 'Produit', screen: 'Superposition claire (écran)', overlay: 'Incrustation', darken: 'Obscurcir', lighten: 'Éclaircir',
  'color-dodge': 'Densité couleur −', 'color-burn': 'Densité couleur +', 'hard-light': 'Lumière crue', 'soft-light': 'Lumière tamisée', difference: 'Différence', exclusion: 'Exclusion',
  hue: 'Teinte', saturation: 'Saturation', color: 'Couleur', luminosity: 'Luminosité',
};
const WEIGHTS = {
  300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extrabold', 900: 'Black',
};
const FX = {
  brightness: ['Luminosité', -1, 1, 0.01], contrast: ['Contraste', -1, 1, 0.01], saturation: ['Saturation', -1, 1, 0.01], vibrance: ['Vibrance', -1, 1, 0.01],
  hue: ['Teinte', -1, 1, 0.01], gamma: ['Gamma', 0.2, 2.2, 0.01], blur: ['Flou', 0, 1, 0.01], noise: ['Grain', 0, 400, 1], pixelate: ['Pixelisation', 1, 40, 1],
};
const FX_TOGGLES = {
  grayscale: 'Noir et blanc', sepia: 'Sépia', invert: 'Négatif', vintage: 'Vintage', kodachrome: 'Kodachrome', polaroid: 'Polaroïd', sharpen: 'Netteté',
};
const PRESET_FX = {
  none: ['Original', {}], vivid: ['Éclatant', { saturation: 0.25, contrast: 0.12, vibrance: 0.3 }], soft: ['Doux', { contrast: -0.12, brightness: 0.05, saturation: -0.1 }],
  noir: ['Noir et blanc', { grayscale: true, contrast: 0.18 }], film: ['Pellicule', { vintage: true, noise: 60 }], cold: ['Froid', { hue: -0.08, saturation: -0.05, brightness: 0.03 }],
  warm: ['Chaud', { hue: 0.05, saturation: 0.15 }], drama: ['Dramatique', { contrast: 0.35, brightness: -0.08, saturation: -0.2 }],
};

const fmt = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');
const num = (k, label, v, { step = 1, min = -1e6, max = 1e6, unit = '' } = {}) => `<label class="dz-num"><span>${label}</span><input type="number" data-p="${k}" value="${Math.round(v * 100) / 100}" step="${step}" min="${min}" max="${max}">${unit ? `<i>${unit}</i>` : ''}</label>`;
const range = (k, label, v, min, max, step, shown) => `<div class="st-field"><span>${label}<b data-pv="${k}">${shown ?? fmt(v)}</b></span><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-p="${k}"></div>`;
const sw = (k, c, title = '') => `<button class="dz-sw${!c || c === 'transparent' ? ' none' : ''}" data-color="${k}" style="--c:${esc(c || 'transparent')}" title="${esc(title || c || 'Aucune')}"></button>`;
const segm = (k, cur, opts) => `<div class="seg wide small dz-seg">${Object.entries(opts).map(([v, l]) => `<button class="${String(cur) === v ? 'on' : ''}" data-ps="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
const card = (title, body, extra = '') => `<section class="dz-card"><div class="dz-card-h"><span>${title}</span>${extra}</div>${body}</section>`;

function gradOf(o) { return o.fill && typeof o.fill === 'object' && o.fill.colorStops ? o.fill : null; }

function makeGradient(kind, stops, angle = 90) {
  const a = (angle * Math.PI) / 180;
  const coords = kind === 'radial'
    ? { x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5, r1: 0, r2: 0.5 }
    : { x1: 0.5 - Math.cos(a) / 2, y1: 0.5 - Math.sin(a) / 2, x2: 0.5 + Math.cos(a) / 2, y2: 0.5 + Math.sin(a) / 2 };
  return new Gradient({ type: kind, gradientUnits: 'percentage', coords, colorStops: stops.map((s) => ({ offset: s.offset, color: s.color })) });
}

function buildFilters(fx = {}) {
  const out = [];
  if (fx.brightness) out.push(new F.Brightness({ brightness: fx.brightness }));
  if (fx.contrast) out.push(new F.Contrast({ contrast: fx.contrast }));
  if (fx.saturation) out.push(new F.Saturation({ saturation: fx.saturation }));
  if (fx.vibrance) out.push(new F.Vibrance({ vibrance: fx.vibrance }));
  if (fx.hue) out.push(new F.HueRotation({ rotation: fx.hue }));
  if (fx.gamma && fx.gamma !== 1) out.push(new F.Gamma({ gamma: [fx.gamma, fx.gamma, fx.gamma] }));
  if (fx.grayscale) out.push(new F.Grayscale());
  if (fx.sepia) out.push(new F.Sepia());
  if (fx.invert) out.push(new F.Invert());
  if (fx.vintage) out.push(new F.Vintage());
  if (fx.kodachrome) out.push(new F.Kodachrome());
  if (fx.polaroid) out.push(new F.Polaroid());
  if (fx.sharpen) out.push(new F.Convolute({ matrix: [0, -1, 0, -1, 5, -1, 0, -1, 0] }));
  if (fx.noise) out.push(new F.Noise({ noise: fx.noise }));
  if (fx.pixelate && fx.pixelate > 1) out.push(new F.Pixelate({ blocksize: fx.pixelate }));
  if (fx.blur) out.push(new F.Blur({ blur: fx.blur }));
  return out;
}

export function installProps(Design) {
  const P = Design.prototype;

  P.renderProps = function renderProps() {
    cancelAnimationFrame(this.propRaf);
    this.propRaf = requestAnimationFrame(() => this.paintProps());
  };

  P.paintProps = function paintProps() {
    const el = this.$.props;
    if (!el || !this.page) return;
    // Pendant la saisie dans un champ, on ne redessine pas le panneau (le curseur resterait perdu).
    if (el.contains(document.activeElement) && document.activeElement.matches('input[type=number], input[type=text], select')) { this.refreshNums(); return; }
    const list = this.sel();
    const a = this.canvas.getActiveObject();
    el.innerHTML = list.length && a ? this.objProps(a, list) : this.pageProps();
  };

  // Valeurs de position et taille mises à jour sans tout redessiner.
  P.refreshNums = function refreshNums() {
    const a = this.canvas.getActiveObject();
    if (!a) return;
    const r = a.getBoundingRect();
    const vals = { x: r.left, y: r.top, w: a.getScaledWidth(), h: a.getScaledHeight(), angle: a.angle || 0 };
    for (const [k, v] of Object.entries(vals)) { const i = this.$.props.querySelector(`[data-p="${k}"]`); if (i && i !== document.activeElement) i.value = Math.round(v * 100) / 100; }
  };

  P.pageProps = function pageProps() {
    const p = this.page;
    const tool = this.tool;
    let toolCard = '';
    if (tool === 'pencil') {
      toolCard = card('Crayon', `<div class="dz-row">${sw('pencil', settings.designPencilColor || '#1d1d1f', 'Couleur du trait')}${range('pencilW', 'Épaisseur', settings.designPencilWidth || 6, 1, 80, 1, `${settings.designPencilWidth || 6} px`)}</div>`);
    } else if (tool === 'polygon') {
      toolCard = card('Polygone', `${segm('star', settings.designStar ? '1' : '0', { 0: 'Polygone', 1: 'Étoile' })}${settings.designStar ? range('starN', 'Branches', settings.designStarPoints || 5, 3, 24, 1, String(settings.designStarPoints || 5)) : range('polyN', 'Côtés', settings.designPolySides || 6, 3, 24, 1, String(settings.designPolySides || 6))}`);
    }
    const st = settings.designStyle || {};
    return `${toolCard}
      ${card('Page', `
        <div class="dz-grid2">${num('pw', 'L', p.w, { min: 16, max: 16000, unit: 'px' })}${num('ph', 'H', p.h, { min: 16, max: 16000, unit: 'px' })}</div>
        <div class="st-btns"><button class="btn small" data-pa="format">${icon('frame', 13)}<span>Changer de format…</span></button><button class="btn small" data-pa="swap" title="Pivoter (portrait ↔ paysage)">${icon('rotate', 13)}</button></div>
        <div class="dz-row"><span class="dz-lab">Fond</span>${sw('pagebg', p.bg || '#ffffff')}<input class="input small dz-hex" data-p="pagebg" value="${esc(p.bg || '#ffffff')}"></div>`)}
      ${card('Style des nouvelles formes', `<div class="dz-row"><span class="dz-lab">Remplissage</span>${sw('deffill', st.fill || '#6a4cff')}<span class="dz-lab">Contour</span>${sw('defstroke', st.stroke || '')}</div>`)}
      ${card('Raccourcis', `<div class="dz-keys">
        <span><kbd>V</kbd> Sélection</span><span><kbd>R</kbd> Rectangle</span><span><kbd>O</kbd> Ellipse</span><span><kbd>P</kbd> Plume</span><span><kbd>T</kbd> Texte</span><span><kbd>3</kbd> Objet 3D</span>
        <span><kbd>Espace</kbd> Déplacer la vue</span><span><kbd>Ctrl</kbd>+molette Zoom</span><span><kbd>Maj+1</kbd> Tout voir</span><span><kbd>Ctrl+G</kbd> Grouper</span></div>`)}`;
  };

  P.objProps = function objProps(a, list) {
    const multi = list.length > 1;
    const o = multi ? null : a;
    const r = a.getBoundingRect();
    const t = o ? o.type : 'activeselection';
    const isText = t === 'textbox';
    const isImg = t === 'image';
    const is3d = t === 'layer3d';
    const isLine = t === 'line';
    const head = `<div class="dz-ph"><span class="dz-ph-ic">${icon(o ? this.layerIcon(o) : 'layers', 16)}</span><input class="dz-ph-name" data-p="name" value="${esc(o ? (o.name || this.typeName(o)) : `${list.length} calques`)}" ${o ? '' : 'disabled'}></div>`;
    const align = `<div class="dz-icons">
      ${[['left', 'Aligner à gauche', 'M4 3v18M8 7h12v4H8zM8 13h7v4H8z'], ['hcenter', 'Centrer horizontalement', 'M12 3v18M6 7h12v4H6zM8.5 13h7v4h-7z'], ['right', 'Aligner à droite', 'M20 3v18M4 7h12v4H4zM9 13h7v4H9z'],
    ['top', 'Aligner en haut', 'M3 4h18M7 8h4v12H7zM13 8h4v7h-4z'], ['vcenter', 'Centrer verticalement', 'M3 12h18M7 6h4v12H7zM13 8.5h4v7h-4z'], ['bottom', 'Aligner en bas', 'M3 20h18M7 4h4v12H7zM13 9h4v7h-4z']]
    .map(([k, l, d]) => `<button class="dz-ib" data-pa="align:${k}" title="${l}${multi ? '' : ' (par rapport à la page)'}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="${d}"/></svg></button>`).join('')}
      ${list.length > 2 ? `<button class="dz-ib" data-pa="dist:h" title="Répartir horizontalement">${icon('distribute', 15)}</button><button class="dz-ib" data-pa="dist:v" title="Répartir verticalement"><span style="display:grid;transform:rotate(90deg)">${icon('distribute', 15)}</span></button>` : ''}
    </div>`;
    const bools = multi && list.filter(canBoolean).length >= 2 ? `<div class="dz-icons">${Object.entries(BOOL_OPS).map(([k, [l]]) => `<button class="dz-ib wide" data-pa="bool:${k}" title="${l}">${boolIcon(k)}<span>${l}</span></button>`).join('')}</div>` : '';
    const actions = `<div class="dz-icons">
      <button class="dz-ib" data-pa="dup" title="Dupliquer (Ctrl+D)">${icon('copy', 15)}</button>
      <button class="dz-ib" data-pa="arr:forward" title="Avancer (Ctrl+])">${icon('chevronUp', 15)}</button><button class="dz-ib" data-pa="arr:backward" title="Reculer (Ctrl+[)">${icon('chevronDown', 15)}</button>
      <button class="dz-ib" data-pa="flipx" title="Retourner horizontalement">${icon('alignH', 15)}</button><button class="dz-ib" data-pa="flipy" title="Retourner verticalement">${icon('alignV', 15)}</button>
      ${multi ? `<button class="dz-ib" data-pa="group" title="Grouper (Ctrl+G)">${icon('group', 15)}</button>` : ''}${o && t === 'group' ? `<button class="dz-ib" data-pa="ungroup" title="Dégrouper (Ctrl+Maj+G)">${icon('group', 15)}</button>` : ''}
      ${list.length === 2 ? `<button class="dz-ib" data-pa="mask" title="Masquer : la forme du dessus découpe le calque du dessous">${icon('frame', 15)}</button>` : ''}${o && o.clipPath ? `<button class="dz-ib on" data-pa="unmask" title="Retirer le masque">${icon('frame', 15)}</button>` : ''}
      ${o && canBoolean(o) && ['rect', 'ellipse', 'polygon', 'group', 'triangle'].includes(t) ? `<button class="dz-ib" data-pa="outline" title="Convertir en tracé modifiable">${icon('wand', 15)}</button>` : ''}
      <button class="dz-ib danger" data-pa="del" title="Supprimer (Suppr)">${icon('trash', 15)}</button>
    </div>`;
    const tr = card('Disposition', `
      <div class="dz-grid2">${num('x', 'X', r.left)}${num('y', 'Y', r.top)}${num('w', 'L', a.getScaledWidth(), { min: 1 })}${num('h', 'H', a.getScaledHeight(), { min: 1 })}</div>
      <div class="dz-grid2">${num('angle', '↻', a.angle || 0, { unit: '°' })}${o && t === 'rect' ? num('radius', '◜', o.rx || 0, { min: 0, unit: 'px' }) : ''}</div>
      <label class="check-row small"><input type="checkbox" data-pc="ratio" ${settings.designRatio !== false ? 'checked' : ''}><span class="box"></span><span>Garder les proportions</span></label>`);
    const op = Math.round((o ? o.opacity : 1) * 100);
    const layerCard = card('Calque', `
      ${range('opacity', 'Opacité', op, 0, 100, 1, `${op} %`)}
      <div class="st-field"><span>Mode de fusion</span><select class="input small" data-p="blend">${Object.entries(BLENDS).map(([k, l]) => `<option value="${k}" ${(o ? o.globalCompositeOperation || 'source-over' : 'source-over') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`);
    let fill = '';
    if (!isImg && !is3d && !isLine && t !== 'group') {
      const g = o ? gradOf(o) : null;
      const kind = !o ? 'solid' : g ? g.type : (!o.fill || o.fill === 'transparent' ? 'none' : 'solid');
      const stops = g ? g.colorStops : null;
      fill = card(isText ? 'Couleur du texte' : 'Remplissage', `
        ${isText ? '' : segm('fillkind', kind, { none: 'Aucun', solid: 'Uni', linear: 'Linéaire', radial: 'Radial' })}
        ${kind === 'solid' || isText ? `<div class="dz-row">${sw('fill', o ? (typeof o.fill === 'string' ? o.fill : '#000000') : '#6a4cff')}<input class="input small dz-hex" data-p="fillhex" value="${esc(o && typeof o.fill === 'string' ? o.fill : '')}"></div>` : ''}
        ${(kind === 'linear' || kind === 'radial') && stops ? `<div class="dz-grad" style="--g:linear-gradient(90deg, ${stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ')})"><i></i></div>
          <div class="dz-row">${stops.map((s, i) => sw(`stop:${i}`, s.color, `Couleur ${i + 1}`)).join('')}<button class="icon-btn small" data-pa="gradswap" title="Inverser">${icon('sync', 13)}</button><button class="icon-btn small" data-pa="gradadd" title="Ajouter une couleur">${icon('plus', 13)}</button></div>
          ${kind === 'linear' ? range('gangle', 'Angle', o.gradAngle ?? 90, 0, 360, 1, `${o.gradAngle ?? 90}°`) : ''}` : ''}`);
    }
    let stroke = '';
    if (!isImg && !is3d && t !== 'group') {
      const sc = o ? o.stroke : null;
      const swd = o ? o.strokeWidth || 0 : 0;
      const dash = o && o.strokeDashArray ? (o.strokeDashArray[0] > swd * 1.5 ? 'dash' : 'dot') : 'solid';
      stroke = card('Contour', `
        <div class="dz-row">${sw('stroke', sc || '', 'Couleur du contour')}<input class="input small dz-hex" data-p="strokehex" value="${esc(sc || '')}" placeholder="aucun">${num('sw', '', swd, { min: 0, max: 400, unit: 'px', step: 0.5 })}</div>
        ${segm('dash', dash, { solid: 'Plein', dash: 'Tirets', dot: 'Points' })}
        ${isLine ? segm('cap', o.strokeLineCap || 'round', { butt: 'Net', round: 'Arrondi', square: 'Carré' }) : ''}`);
    }
    let text = '';
    if (isText) {
      const fam = o.fontFamily || 'NX Inter';
      text = card('Texte', `
        <div class="st-field"><span>Police</span><select class="input small" data-p="font">${this.fontsHtml(fam)}</select></div>
        <div class="dz-grid2"><div class="st-field"><span>Graisse</span><select class="input small" data-p="weight">${Object.entries(WEIGHTS).map(([k, l]) => `<option value="${k}" ${String(o.fontWeight) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>${num('fsize', 'Taille', o.fontSize, { min: 1, max: 2000, unit: 'px' })}</div>
        <div class="dz-grid2">${num('lh', 'Interligne', o.lineHeight, { step: 0.05, min: 0.5, max: 4 })}${num('ls', 'Interlettre', o.charSpacing / 10, { step: 1, min: -50, max: 200, unit: '%' })}</div>
        ${segm('talign', o.textAlign || 'left', { left: 'Gauche', center: 'Centre', right: 'Droite', justify: 'Justifié' })}
        <div class="dz-icons">
          <button class="dz-ib${o.fontStyle === 'italic' ? ' on' : ''}" data-pa="italic" title="Italique"><i style="font-family:Georgia;font-size:15px">I</i></button>
          <button class="dz-ib${o.underline ? ' on' : ''}" data-pa="underline" title="Souligné"><u>U</u></button>
          <button class="dz-ib${o.linethrough ? ' on' : ''}" data-pa="strike" title="Barré"><s>S</s></button>
          <button class="dz-ib" data-pa="upper" title="MAJUSCULES">AA</button><button class="dz-ib" data-pa="lower" title="minuscules">aa</button>
        </div>`);
    }
    const sh = o && o.shadow;
    const effects = card('Effets', `
      <label class="check-row small"><input type="checkbox" data-pc="shadow" ${sh ? 'checked' : ''}><span class="box"></span><span>Ombre portée</span></label>
      ${sh ? `<div class="dz-row">${sw('shadow', sh.color, 'Couleur de l’ombre')}</div><div class="dz-grid2">${num('shx', 'X', sh.offsetX)}${num('shy', 'Y', sh.offsetY)}${num('shb', 'Flou', sh.blur, { min: 0 })}</div>` : ''}`);
    let image = '';
    if (isImg) {
      const fx = o.fx || {};
      image = card('Retouche', `
        <div class="dz-presets">${Object.entries(PRESET_FX).map(([k, [l]]) => `<button class="st-chip" data-pa="fxp:${k}">${l}</button>`).join('')}</div>
        ${Object.entries(FX).map(([k, [l, mn, mx, stp]]) => range(`fx:${k}`, l, fx[k] ?? (k === 'gamma' ? 1 : k === 'pixelate' ? 1 : 0), mn, mx, stp)).join('')}
        <div class="dz-presets">${Object.entries(FX_TOGGLES).map(([k, l]) => `<button class="st-chip${fx[k] ? ' on' : ''}" data-pa="fxt:${k}">${l}</button>`).join('')}</div>
        <div class="st-btns"><button class="btn small" data-pa="fxreset">${icon('restart', 13)}<span>Réinitialiser</span></button><button class="btn small" data-pa="replace">${icon('image', 13)}<span>Remplacer l’image…</span></button></div>`);
    }
    let three = '';
    if (is3d) three = this.props3d(o);
    let poly = '';
    if (o && t === 'polygon' && o.shapeKind === 'star') {
      poly = card('Étoile', `${range('starN', 'Branches', o.starPoints || 5, 3, 24, 1, String(o.starPoints || 5))}${range('starI', 'Creux', Math.round((o.starInner || 0.45) * 100), 10, 95, 1, `${Math.round((o.starInner || 0.45) * 100)} %`)}`);
    }
    return `${head}${align}${bools}${actions}${three}${tr}${poly}${fill}${stroke}${text}${image}${multi ? '' : effects}${layerCard}`;
  };

  P.fontsHtml = function fontsHtml(cur) {
    const known = this.constructor.FONTS || [];
    const list = known.some(([, f]) => f === cur) ? known : [[cur.replace(/^NX /, ''), cur], ...known];
    return list.map(([l, f]) => `<option value="${esc(f)}" ${f === cur ? 'selected' : ''} style="font-family:'${esc(f)}'">${esc(l)}</option>`).join('');
  };

  P.props3d = function props3d(o) {
    const s = o.spec;
    const src = s.kind === 'decor' ? `<div class="st-field"><span>Forme</span><select class="input small" data-p3="shape">${Object.entries(SHAPES3D).map(([k, l]) => `<option value="${k}" ${s.shape === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`
      : s.kind === 'text' ? `<div class="st-field"><span>Texte en relief</span><input class="input small" data-p3="text" value="${esc(s.text)}"></div>
        <div class="st-field"><span>Police</span><select class="input small" data-p3="font">${[['inter', 'Inter'], ['grotesk', 'Space Grotesk'], ['playfair', 'Playfair'], ['fredoka', 'Fredoka']].map(([k, l]) => `<option value="${k}" ${s.font === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`
        : s.kind === 'icon' ? `<div class="st-field"><span>Icône</span><select class="input small" data-p3="icon">${['star', 'heart', 'bolt', 'cart', 'bell', 'chat', 'camera', 'music', 'play', 'gift', 'phone', 'globe'].map((k) => `<option value="${k}" ${s.icon === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>`
          : s.kind === 'device' ? '<div class="st-btns"><button class="btn small" data-pa="3dscreen">Changer l’écran (capture ou image)…</button></div>' : '';
    const fin = Object.entries(FINISHES);
    return card(`Objet 3D <small class="dz-badge">${s.kind === 'device' ? 'Appareil' : s.kind === 'glb' ? 'Modèle' : s.kind === 'text' ? 'Texte' : s.kind === 'icon' ? 'Icône' : 'Forme'}</small>`, `
      <div class="st-btns"><button class="btn small${this.orbit === o ? ' primary' : ''}" data-pa="orbit">${icon('rotate3d', 13)}<span>${this.orbit === o ? 'Rotation à la souris : active' : 'Faire pivoter à la souris'}</span></button></div>
      ${src}
      ${s.kind !== 'glb' && s.kind !== 'device' ? `<div class="dz-row"><span class="dz-lab">Couleur</span>${sw('3dcolor', s.color)}</div>
      <div class="st-field"><span>Matière</span><div class="dz-fins">${fin.map(([k, l]) => `<button class="st-chip${s.finish === k ? ' on' : ''}" data-p3c="finish" data-v="${k}">${esc(l)}</button>`).join('')}</div></div>` : ''}
      ${range('3d:rx', 'Inclinaison (X)', s.rx, -90, 90, 1, `${Math.round(s.rx)}°`)}${range('3d:ry', 'Rotation (Y)', ((s.ry % 360) + 360) % 360, 0, 360, 1, `${Math.round(((s.ry % 360) + 360) % 360)}°`)}${range('3d:rz', 'Roulis (Z)', s.rz, -180, 180, 1, `${Math.round(s.rz)}°`)}
      ${range('3d:fov', 'Perspective', s.fov, 8, 70, 1, `${s.fov}°`)}
      ${range('3d:light', 'Direction de la lumière', s.light, -180, 180, 1, `${s.light}°`)}${range('3d:intensity', 'Intensité', s.intensity, 0.2, 2.5, 0.05, `${Math.round(s.intensity * 100)} %`)}
      ${range('3d:ambient', 'Lumière d’ambiance', s.ambient, 0, 2.5, 0.05, `${Math.round(s.ambient * 100)} %`)}${range('3d:shadow', 'Ombre au sol', s.shadow, 0, 0.9, 0.01, `${Math.round(s.shadow * 100)} %`)}
      ${s.kind === 'decor' || s.kind === 'text' ? `${range('3d:twist', 'Torsion', (s.mods && s.mods.twist) || 0, -360, 360, 5, `${(s.mods && s.mods.twist) || 0}°`)}${range('3d:bend', 'Courbure', (s.mods && s.mods.bend) || 0, -180, 180, 5, `${(s.mods && s.mods.bend) || 0}°`)}` : ''}
      <div class="st-btns"><button class="btn small" data-pa="3dreset">${icon('restart', 13)}<span>Vue par défaut</span></button></div>`);
  };

  // ------------------------------------------------------------------ application des réglages
  P.forEachSel = function forEachSel(fn) {
    for (const o of this.sel()) fn(o);
    this.canvas.requestRenderAll();
  };

  P.setFillKind = function setFillKind(kind) {
    this.forEachSel((o) => {
      const g = gradOf(o);
      const base = typeof o.fill === 'string' && o.fill ? o.fill : '#6a4cff';
      if (kind === 'none') o.set('fill', '');
      else if (kind === 'solid') o.set('fill', g ? g.colorStops[0].color : base);
      else {
        const stops = g ? g.colorStops : [{ offset: 0, color: base }, { offset: 1, color: '#ff2d78' }];
        o.set('fill', makeGradient(kind, stops, o.gradAngle ?? 90));
      }
      o.fillKind = kind;
      o.dirty = true;
    });
  };

  P.applyFx = function applyFx(o) {
    o.filters = buildFilters(o.fx);
    o.applyFilters();
    o.dirty = true;
  };

  P.onPropInput = function onPropInput(e, final) {
    const t = e.target;
    const k = t.dataset.p || t.dataset.p3;
    if (!k) return;
    const c = this.canvas;
    const a = c.getActiveObject();
    const v = t.type === 'number' || t.type === 'range' ? Number(t.value) : t.value;
    const lab = this.$.props.querySelector(`[data-pv="${k}"]`);
    // Page
    if (k === 'pw' || k === 'ph') { if (!final || !(v > 0)) return; this.page[k === 'pw' ? 'w' : 'h'] = Math.round(v); this.updateBoard(); return; }
    if (k === 'pagebg') { if (/^#[0-9a-f]{6}$/i.test(v)) { this.page.bg = v; this.updateBoard(); } return; }
    if (k === 'pencilW') { settings.designPencilWidth = v; if (lab) lab.textContent = `${v} px`; if (c.freeDrawingBrush) c.freeDrawingBrush.width = v; persist(); return; }
    if (k === 'starN' && !a) { settings.designStarPoints = v; if (lab) lab.textContent = v; persist(); return; }
    if (k === 'polyN') { settings.designPolySides = v; if (lab) lab.textContent = v; persist(); return; }
    if (!a) return;
    if (t.dataset.p3 || k.startsWith('3d:')) { this.on3dInput(a, t.dataset.p3 || k.slice(3), v, final, lab); return; }
    if (k === 'name') { if (final) { a.name = v; this.renderLayers(); this.scheduleSave(); } return; }
    if (k === 'x' || k === 'y') { const r = a.getBoundingRect(); a.set(k === 'x' ? { left: a.left + (v - r.left) } : { top: a.top + (v - r.top) }); }
    if (k === 'w' || k === 'h') {
      if (!(v > 0)) return;
      const ratio = settings.designRatio !== false;
      const cur = k === 'w' ? a.getScaledWidth() : a.getScaledHeight();
      const f = v / cur;
      if (a.type === 'rect' && !ratio) a.set(k === 'w' ? { width: a.width * f } : { height: a.height * f });
      else if (ratio) a.set({ scaleX: a.scaleX * f, scaleY: a.scaleY * f });
      else a.set(k === 'w' ? { scaleX: a.scaleX * f } : { scaleY: a.scaleY * f });
      if (a.type === 'layer3d') a.needsRender = true;
    }
    if (k === 'angle') a.rotate(v);
    if (k === 'radius') a.set({ rx: Math.max(0, v), ry: Math.max(0, v) });
    if (k === 'opacity') { this.forEachSel((o) => o.set('opacity', v / 100)); if (lab) lab.textContent = `${v} %`; }
    if (k === 'blend') this.forEachSel((o) => o.set('globalCompositeOperation', v));
    if (k === 'fillhex' && /^#[0-9a-f]{6}$/i.test(v)) this.forEachSel((o) => o.set('fill', v));
    if (k === 'strokehex') { if (!v) this.forEachSel((o) => o.set('stroke', null)); else if (/^#[0-9a-f]{6}$/i.test(v)) this.forEachSel((o) => o.set({ stroke: v, strokeWidth: o.strokeWidth || 2 })); }
    if (k === 'sw') this.forEachSel((o) => { o.set({ strokeWidth: v, strokeUniform: true }); if (v && !o.stroke) o.set('stroke', '#1d1d1f'); if (o.strokeDashArray) o.set('strokeDashArray', o.strokeDashArray[0] > (o.strokeWidth || 1) * 1.5 ? [v * 3, v * 2] : [0.1, v * 2]); });
    if (k === 'gangle') {
      this.forEachSel((o) => { const g = gradOf(o); if (g && g.type === 'linear') { o.gradAngle = v; o.set('fill', makeGradient('linear', g.colorStops, v)); } });
      if (lab) lab.textContent = `${v}°`;
    }
    if (k === 'font') { this.forEachSel((o) => { if (o.type === 'textbox') o.set('fontFamily', v); }); document.fonts.load(`20px "${v}"`).then(() => { this.forEachSel((o) => { if (o.type === 'textbox') { o.initDimensions?.(); o.dirty = true; } }); }); }
    if (k === 'weight') this.forEachSel((o) => o.set('fontWeight', Number(v)));
    if (k === 'fsize' && v > 0) this.forEachSel((o) => o.set('fontSize', v));
    if (k === 'lh' && v > 0) this.forEachSel((o) => o.set('lineHeight', v));
    if (k === 'ls') this.forEachSel((o) => o.set('charSpacing', v * 10));
    if (k === 'shx' || k === 'shy' || k === 'shb') {
      const sh = a.shadow;
      if (sh) { sh[{ shx: 'offsetX', shy: 'offsetY', shb: 'blur' }[k]] = v; a.dirty = true; }
    }
    if (k === 'starN' || k === 'starI') {
      const n = k === 'starN' ? v : a.starPoints || 5;
      const inner = k === 'starI' ? v / 100 : a.starInner || 0.45;
      this.reshapeStar(a, n, inner);
      if (lab) lab.textContent = k === 'starN' ? String(v) : `${v} %`;
    }
    if (k.startsWith('fx:')) {
      const f = k.slice(3);
      a.fx = { ...(a.fx || {}), [f]: v };
      if (lab) lab.textContent = fmt(v);
      if (final || !this._fxBusy) { this._fxBusy = true; requestAnimationFrame(() => { this.applyFx(a); this._fxBusy = false; c.requestRenderAll(); }); }
    }
    if (a.type === 'textbox') a.initDimensions?.();
    a.setCoords();
    c.requestRenderAll();
    if (final) {
      if (a.type === 'layer3d' && a.needsRender) this.render3dSoon(a);
      this.changed();
    } else this.refreshNums();
  };

  P.reshapeStar = function reshapeStar(a, n, inner) {
    const r = a.getBoundingRect();
    const pts = Array.from({ length: n * 2 }, (_, i) => { const ang = -Math.PI / 2 + (i * Math.PI) / n; const rr = i % 2 ? inner : 1; return { x: Math.cos(ang) * rr * 50, y: Math.sin(ang) * rr * 50 }; });
    const np = new Polygon(pts, {
      fill: a.fill, stroke: a.stroke, strokeWidth: a.strokeWidth, opacity: a.opacity, shadow: a.shadow, angle: 0, strokeUniform: true,
    });
    np.set({ scaleX: r.width / np.width, scaleY: r.height / np.height, left: r.left, top: r.top });
    Object.assign(np, {
      id: a.id, name: a.name, shapeKind: 'star', starPoints: n, starInner: inner,
    });
    const c = this.canvas;
    const at = c.getObjects().indexOf(a);
    this.loading = true;
    c.remove(a);
    c.insertAt(at, np);
    this.loading = false;
    c.setActiveObject(np);
  };

  P.on3dInput = function on3dInput(a, k, v, final, lab) {
    const s = a.spec;
    if (k === 'twist' || k === 'bend') {
      s.mods = { ...(s.mods || {}), [k]: v };
      if (lab) lab.textContent = `${v}°`;
      if (final) this.render3dSoon(a);
      if (final) this.changed();
      return;
    }
    if (['shape', 'text', 'font', 'icon'].includes(k)) {
      if (!final && k === 'text') return;
      s[k] = v;
      if (k === 'shape') a.name = `3D · ${SHAPES3D[v] || v}`;
      if (k === 'text') a.name = `3D · ${v}`;
      this.render3dSoon(a);
      this.changed();
      this.renderLayers();
      return;
    }
    s[k] = v;
    if (lab) lab.textContent = k === 'intensity' || k === 'ambient' || k === 'shadow' ? `${Math.round(v * 100)} %` : `${Math.round(v)}°`;
    this.render3dSoon(a, !final);
    if (final) this.changed();
  };

  P.updateBoard = function updateBoard() {
    const b = this.board;
    const p = this.page;
    if (b) { b.set({ width: p.w, height: p.h, fill: p.bg || '#ffffff' }); b.setCoords(); }
    this.canvas.requestRenderAll();
    this.changed();
  };

  P.onPropClick = async function onPropClick(e) {
    const c = this.canvas;
    const a = c.getActiveObject();
    const swb = e.target.closest('[data-color]');
    if (swb) { this.pickColor(swb); return; }
    const ps = e.target.closest('[data-ps]');
    if (ps) {
      const k = ps.dataset.ps; const v = ps.dataset.v;
      if (k === 'fillkind') this.setFillKind(v);
      if (k === 'dash') this.forEachSel((o) => { const w = o.strokeWidth || 2; o.set('strokeDashArray', v === 'solid' ? null : v === 'dash' ? [w * 3, w * 2] : [0.1, w * 2]); if (v === 'dot') o.set('strokeLineCap', 'round'); });
      if (k === 'cap') this.forEachSel((o) => o.set('strokeLineCap', v));
      if (k === 'talign') this.forEachSel((o) => o.set('textAlign', v));
      if (k === 'star') { settings.designStar = v === '1'; persist(); }
      this.changed();
      this.renderProps();
      return;
    }
    const p3c = e.target.closest('[data-p3c]');
    if (p3c && a && a.type === 'layer3d') { a.spec[p3c.dataset.p3c] = p3c.dataset.v; this.render3dSoon(a); this.changed(); this.renderProps(); return; }
    const b = e.target.closest('[data-pa]');
    if (!b) return;
    const [act, arg] = b.dataset.pa.split(':');
    switch (act) {
      case 'format': this.formatMenu(b, (k) => { const [, w, h] = FORMATS_REF()[k]; Object.assign(this.page, { w, h }); this.updateBoard(); this.fit(); this.renderProps(); }); return;
      case 'swap': { const p = this.page; [p.w, p.h] = [p.h, p.w]; this.updateBoard(); this.fit(); this.renderProps(); return; }
      case 'align': this.align(arg); return;
      case 'dist': this.distribute(arg); return;
      case 'bool': this.bool(arg); return;
      case 'dup': await this.duplicate(); return;
      case 'arr': this.arrange(arg); return;
      case 'flipx': this.flip('x'); return;
      case 'flipy': this.flip('y'); return;
      case 'group': this.group(); return;
      case 'ungroup': this.ungroup(); return;
      case 'mask': await this.mask(); return;
      case 'unmask': this.unmask(); return;
      case 'outline': this.outline(); return;
      case 'del': this.remove(); return;
      case 'italic': this.forEachSel((o) => o.set('fontStyle', o.fontStyle === 'italic' ? 'normal' : 'italic')); break;
      case 'underline': this.forEachSel((o) => o.set('underline', !o.underline)); break;
      case 'strike': this.forEachSel((o) => o.set('linethrough', !o.linethrough)); break;
      case 'upper': this.forEachSel((o) => { if (o.text) o.set('text', o.text.toUpperCase()); }); break;
      case 'lower': this.forEachSel((o) => { if (o.text) o.set('text', o.text.toLowerCase()); }); break;
      case 'gradswap': this.forEachSel((o) => { const g = gradOf(o); if (g) o.set('fill', makeGradient(g.type, g.colorStops.map((s) => ({ offset: 1 - s.offset, color: s.color })).reverse(), o.gradAngle ?? 90)); }); break;
      case 'gradadd': this.forEachSel((o) => { const g = gradOf(o); if (g && g.colorStops.length < 5) { const st = [...g.colorStops].sort((x, y) => x.offset - y.offset); const n = st.length + 1; o.set('fill', makeGradient(g.type, [...st.map((s, i) => ({ offset: i / (n - 1), color: s.color })), { offset: 1, color: '#ffcc00' }].sort((x, y) => x.offset - y.offset), o.gradAngle ?? 90)); } }); break;
      case 'fxp': if (a && a.type === 'image') { a.fx = { ...PRESET_FX[arg][1] }; this.applyFx(a); } break;
      case 'fxt': if (a && a.type === 'image') { a.fx = { ...(a.fx || {}), [arg]: !(a.fx && a.fx[arg]) }; this.applyFx(a); } break;
      case 'fxreset': if (a && a.type === 'image') { a.fx = {}; this.applyFx(a); } break;
      case 'replace': if (a && a.type === 'image') await this.replaceImage(a); break;
      case 'orbit': this.setOrbit(this.orbit === a ? null : a); this.renderProps(); return;
      case '3dreset': if (a && a.type === 'layer3d') { Object.assign(a.spec, { rx: -12, ry: 28, rz: 0, fov: 30, light: 35, intensity: 1, ambient: 1 }); this.render3dSoon(a); } break;
      case '3dscreen': if (a && a.type === 'layer3d') await this.pickScreen(a, b); return;
      default: break;
    }
    c.requestRenderAll();
    this.changed();
    this.renderProps();
  };

  P.onPropCheck = function onPropCheck(e) {
    const t = e.target;
    const k = t.dataset.pc;
    if (!k) return false;
    if (k === 'ratio') { settings.designRatio = t.checked; persist(); return true; }
    if (k === 'shadow') {
      this.forEachSel((o) => o.set('shadow', t.checked ? new Shadow({ color: 'rgba(0,0,0,0.3)', blur: 30, offsetX: 0, offsetY: 14 }) : null));
      this.changed();
      this.renderProps();
    }
    return true;
  };

  P.pickColor = function pickColor(btn) {
    const k = btn.dataset.color;
    const c = this.canvas;
    const a = c.getActiveObject();
    const st = settings.designStyle || (settings.designStyle = {});
    let cur = getComputedStyle(btn).getPropertyValue('--c').trim();
    const apply = (v) => {
      btn.style.setProperty('--c', v);
      btn.classList.toggle('none', false);
      if (k === 'pagebg') { this.page.bg = v; const b = this.board; if (b) b.set('fill', v); }
      else if (k === 'pencil') { settings.designPencilColor = v; if (c.freeDrawingBrush) c.freeDrawingBrush.color = v; }
      else if (k === 'deffill') st.fill = v;
      else if (k === 'defstroke') { st.stroke = v; st.strokeWidth = st.strokeWidth || 2; }
      else if (k === 'fill') this.forEachSel((o) => { o.set('fill', v); o.fillKind = 'solid'; });
      else if (k === 'stroke') this.forEachSel((o) => o.set({ stroke: v, strokeWidth: o.strokeWidth || 2, strokeUniform: true }));
      else if (k === 'shadow' && a && a.shadow) { a.shadow.color = v; a.dirty = true; }
      else if (k === '3dcolor' && a && a.type === 'layer3d') { a.spec.color = v; this.render3dSoon(a, true); }
      else if (k.startsWith('stop:')) {
        const i = Number(k.slice(5));
        this.forEachSel((o) => { const g = gradOf(o); if (g) { const stops = g.colorStops.map((s, j) => ({ offset: s.offset, color: j === i ? v : s.color })); o.set('fill', makeGradient(g.type, stops, o.gradAngle ?? 90)); } });
      }
      c.requestRenderAll();
    };
    if (cur === 'transparent') cur = '#000000';
    openColorPicker(btn, cur, {
      onInput: apply,
      onChange: () => {
        if (k === '3dcolor' && a && a.type === 'layer3d') this.render3dSoon(a);
        persist();
        if (['pencil', 'deffill', 'defstroke'].includes(k)) return;
        this.changed();
      },
      docColors: this.docColors(),
      title: { fill: 'Remplissage', stroke: 'Contour', pagebg: 'Fond de la page', shadow: 'Ombre', '3dcolor': 'Couleur de l’objet 3D' }[k] || 'Couleur',
    });
  };

  P.replaceImage = async function replaceImage(a) {
    const { api } = await import('../core/api.js');
    const f = await api.invoke('dialog:open-file', { title: 'Remplacer l’image', filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'] }], asDataUrl: true });
    if (!f || !f.dataUrl) return;
    const w = a.getScaledWidth();
    await a.setSrc(f.dataUrl);
    a.scaleToWidth(w);
    if (a.fx) this.applyFx(a);
  };

  P.pickScreen = async function pickScreen(a, anchor) {
    const shots = await this.boardShots();
    const { showPopover, hidePopover } = await import('../core/ui.js');
    const pop = showPopover(anchor, `<div class="pop-title">Écran de l’appareil</div>
      ${shots.map((s, i) => `<button class="menu-item" data-shot="${i}">${icon('phone', 14)}<span>${esc(s.name)}</span></button>`).join('') || '<p class="mk-note" style="padding:6px 10px">Aucun site ouvert dans le Responsive Lab.</p>'}
      <div class="menu-sep"></div><button class="menu-item" data-shot="file">${icon('image', 14)}<span>Choisir une image…</span></button>`, { width: 280, align: 'start' });
    if (!pop) return;
    pop.onclick = async (e) => {
      const b = e.target.closest('[data-shot]');
      if (!b) return;
      hidePopover();
      let data = null; let name = '';
      if (b.dataset.shot === 'file') {
        const { api } = await import('../core/api.js');
        const f = await api.invoke('dialog:open-file', { title: 'Image de l’écran', filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }], asDataUrl: true });
        if (f && f.dataUrl) { data = f.dataUrl; name = f.name; }
      } else {
        const s = shots[Number(b.dataset.shot)];
        data = s.page.toDataURL('image/jpeg', 0.92); name = s.name;
        a.spec.deviceId = s.deviceId;
      }
      if (!data) return;
      a.spec.screen = this.addAsset('image', data, name);
      this.render3dSoon(a);
      this.changed();
    };
  };

  P.bindProps = function bindProps() {
    const el = this.$.props;
    el.addEventListener('input', (e) => { if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT') return; this.onPropInput(e, false); });
    el.addEventListener('change', (e) => { if (e.target.type === 'checkbox') { this.onPropCheck(e); return; } this.onPropInput(e, true); });
    el.addEventListener('click', (e) => this.onPropClick(e));
    el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  };
}

let formatsRef = null;
function FORMATS_REF() { return formatsRef; }
export function setFormatsRef(f) { formatsRef = f; }

function boolIcon(k) {
  const d = {
    union: '<path d="M4 4h10v6h6v10H10v-6H4z" fill="currentColor"/>',
    subtract: '<path d="M4 4h10v6H10v4H4z" fill="currentColor"/><path d="M10 10h10v10H10z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2"/>',
    intersect: '<path d="M4 4h10v10H4z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 10h10v10H10z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 10h4v4h-4z" fill="currentColor"/>',
    exclude: '<path d="M4 4h10v6h-4v4H4zM14 10h6v10H10v-6h4z" fill="currentColor"/>',
  }[k];
  return `<svg viewBox="0 0 24 24" width="16" height="16">${d}</svg>`;
}
