/* Calques 2D posés sur le rendu 3D : titres, listes, bouton d'appel à l'action, pastille de prix, logo,
 * code QR, voiles de lisibilité. Mêmes calques pour l'aperçu, les images, les vidéos et les présentations.
 *
 * Unités : positions en fraction de la largeur / hauteur ; tailles en « u » = 1 % du plus petit côté.
 * Animation d'entrée par calque : anim (fade, up, down, left, right, scale, pop, zoom, blur, words, type, wipe, none), delay, dur (s).
 * Styles de texte : fill 'gradient' (+ gradient [a, b]), highlight (surligneur), outline (contour), glow (néon). */

const FONTS = {
  display: "'Inter', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'Cascadia Code', Consolas, monospace",
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeBack = (t) => { const c1 = 1.5; const c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };

function rr(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, k);
}

export function fontOf(l, u) {
  return `${l.italic ? 'italic ' : ''}${l.weight || 600} ${Math.max(1, (l.size || 4) * u)}px ${FONTS[l.font] || FONTS.body}`;
}

// Découpe un texte en lignes qui tiennent dans maxW (les retours à la ligne du texte sont gardés).
export function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const tryL = `${line} ${words[i]}`;
      if (ctx.measureText(tryL).width <= maxW) line = tryL; else { out.push(line); line = words[i]; }
    }
    out.push(line);
  }
  return out;
}

function progress(l, t, still) {
  if (still || !l.anim || l.anim === 'none') return 1;
  return clamp01((t - (l.delay || 0)) / Math.max(0.01, l.dur || 0.7));
}

// Transformation d'entrée : alpha, décalage, échelle.
function enter(l, p, u) {
  const e = l.anim === 'scale' ? easeBack(p) : easeOut(p);
  const d = (l.dist ?? 6) * u;
  const st = { alpha: clamp01(p * 1.6), dx: 0, dy: 0, k: 1 };
  if (l.anim === 'up') st.dy = (1 - e) * d;
  if (l.anim === 'down') st.dy = -(1 - e) * d;
  if (l.anim === 'left') st.dx = (1 - e) * d;
  if (l.anim === 'right') st.dx = -(1 - e) * d;
  if (l.anim === 'scale') st.k = 0.6 + 0.4 * e;
  if (l.anim === 'pop') { st.k = Math.max(0.01, easeBack(p) * 1.0); st.alpha = clamp01(p * 3); }
  if (l.anim === 'zoom') { st.k = 1.35 - 0.35 * e; }
  if (l.anim === 'blur') { st.blur = (1 - e) * 2.2 * u; st.dy = (1 - e) * d * 0.4; }
  if (l.anim === 'words') st.alpha = p > 0 ? 1 : 0;
  if (l.anim === 'type' || l.anim === 'wipe') st.alpha = p > 0 ? 1 : 0;
  return st;
}

/* Boîte d'un calque (pour l'alignement) : x selon align, y selon valign. */
function anchor(l, w, h, bw, bh) {
  const x0 = (l.x ?? 0.5) * w;
  const y0 = (l.y ?? 0.5) * h;
  const x = l.align === 'center' ? x0 - bw / 2 : l.align === 'right' ? x0 - bw : x0;
  const y = l.valign === 'middle' ? y0 - bh / 2 : l.valign === 'bottom' ? y0 - bh : y0;
  return { x, y };
}

function drawText(ctx, l, w, h, u, p) {
  ctx.font = fontOf(l, u);
  const maxW = (l.maxW || 0.8) * w;
  let text = l.upper ? String(l.text || '').toUpperCase() : String(l.text || '');
  if (!text.trim()) return null;
  if (l.anim === 'type' && p < 1) text = text.slice(0, Math.round(text.length * p));
  const lines = wrap(ctx, text, maxW).slice(0, l.maxLines || 6);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const shownWords = l.anim === 'words' && p < 1 ? p * wordCount : Infinity;
  const size = (l.size || 4) * u;
  const lh = size * (l.lineHeight || 1.15);
  const bw = Math.min(maxW, Math.max(...lines.map((s) => ctx.measureText(s).width), 1));
  const bh = lh * lines.length;
  const { x, y } = anchor(l, w, h, bw, bh);
  if (l.letterSpacing) ctx.letterSpacing = `${l.letterSpacing * size}px`;
  ctx.fillStyle = l.color || '#111';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = l.align === 'center' ? 'center' : l.align === 'right' ? 'right' : 'left';
  const ax = l.align === 'center' ? x + bw / 2 : l.align === 'right' ? x + bw : x;
  // Surligneur : un bandeau arrondi derrière chaque ligne.
  if (l.highlight) {
    ctx.save();
    ctx.fillStyle = l.highlight;
    lines.forEach((s, i) => {
      const lw = ctx.measureText(s).width;
      const lx = ctx.textAlign === 'center' ? ax - lw / 2 : ctx.textAlign === 'right' ? ax - lw : ax;
      rr(ctx, lx - size * 0.22, y + lh * i + size * 0.08, lw + size * 0.44, size * 1.06, size * 0.18);
      ctx.fill();
    });
    ctx.restore();
  }
  if (l.fill === 'gradient' && Array.isArray(l.gradient)) {
    const g = ctx.createLinearGradient(x, y, x + bw, y + bh);
    l.gradient.forEach((c, i) => g.addColorStop(i / Math.max(1, l.gradient.length - 1), c));
    ctx.fillStyle = g;
  }
  if (l.shadow) { ctx.shadowColor = l.shadow; ctx.shadowBlur = size * 0.35; ctx.shadowOffsetY = size * 0.06; }
  if (l.glow) { ctx.shadowColor = l.glow; ctx.shadowBlur = size * 0.6; ctx.shadowOffsetY = 0; }
  let wi = 0;
  lines.forEach((s, i) => {
    const ly = y + lh * i + size * 0.92;
    if (shownWords !== Infinity) {
      // Mot à mot : chaque mot apparaît à son tour, en fondu.
      const words = s.split(' ');
      const full = ctx.measureText(s).width;
      let cx = ctx.textAlign === 'center' ? ax - full / 2 : ctx.textAlign === 'right' ? ax - full : ax;
      const keepAlign = ctx.textAlign;
      ctx.textAlign = 'left';
      const a0 = ctx.globalAlpha;
      for (const wd of words) {
        const k = clamp01(shownWords - wi);
        ctx.globalAlpha = a0 * k;
        if (k > 0) ctx.fillText(wd, cx, ly + (1 - k) * size * 0.25);
        cx += ctx.measureText(`${wd} `).width;
        wi += 1;
      }
      ctx.globalAlpha = a0;
      ctx.textAlign = keepAlign;
      return;
    }
    if (l.outline) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1, size * (l.outlineW || 0.06));
      ctx.strokeStyle = l.outline;
      ctx.strokeText(s, ax, ly);
      if (!l.outlineOnly) ctx.fillText(s, ax, ly);
    } else ctx.fillText(s, ax, ly);
  });
  ctx.letterSpacing = '0px';
  ctx.shadowColor = 'transparent';
  if (l.underline) {
    ctx.fillStyle = l.underline;
    ctx.fillRect(x, y + bh + size * 0.25, Math.min(bw, size * 2.4), Math.max(2, size * 0.09));
  }
  return { x, y, w: bw, h: bh };
}

function drawList(ctx, l, w, h, u, t, still) {
  const items = (l.items || []).filter((s) => String(s).trim());
  if (!items.length) return;
  ctx.font = fontOf(l, u);
  const size = (l.size || 3) * u;
  const lh = size * (l.lineHeight || 1.25);
  const gap = (l.gap ?? 1.6) * u;
  const maxW = (l.maxW || 0.5) * w;
  const indent = size * 1.25;
  const blocks = items.map((s) => wrap(ctx, s, maxW - indent));
  const bh = blocks.reduce((a, b) => a + b.length * lh, 0) + gap * (blocks.length - 1);
  const { x, y } = anchor(l, w, h, maxW, bh);
  let cy = y;
  blocks.forEach((lines, i) => {
    const li = { ...l, delay: (l.delay || 0) + i * (l.stagger ?? 0.12) };
    const p = progress(li, t, still);
    const st = enter(li, p, u);
    ctx.save();
    ctx.globalAlpha *= st.alpha;
    ctx.translate(st.dx, st.dy);
    ctx.fillStyle = l.bullet || l.color || '#111';
    ctx.beginPath();
    if (l.marker === 'check') {
      ctx.lineWidth = Math.max(1.5, size * 0.12);
      ctx.strokeStyle = l.bullet || l.color;
      ctx.lineCap = 'round';
      ctx.moveTo(x + size * 0.1, cy + size * 0.55);
      ctx.lineTo(x + size * 0.38, cy + size * 0.8);
      ctx.lineTo(x + size * 0.85, cy + size * 0.25);
      ctx.stroke();
    } else if (l.marker === 'num') {
      ctx.font = fontOf({ ...l, weight: 700 }, u);
      ctx.fillText(String(i + 1).padStart(2, '0'), x, cy + size * 0.92);
      ctx.font = fontOf(l, u);
    } else {
      ctx.arc(x + size * 0.32, cy + size * 0.56, size * 0.17, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = l.color || '#111';
    ctx.textAlign = 'left';
    lines.forEach((s, j) => ctx.fillText(s, x + indent * (l.marker === 'num' ? 1.4 : 1), cy + lh * j + size * 0.92));
    ctx.restore();
    cy += lines.length * lh + gap;
  });
}

function drawCta(ctx, l, w, h, u) {
  if (!String(l.text || '').trim()) return;
  ctx.font = fontOf({ ...l, weight: l.weight || 650 }, u);
  const size = (l.size || 3) * u;
  const tw = ctx.measureText(l.text).width;
  const bw = tw + size * 2.2;
  const bh = size * 2.4;
  const { x, y } = anchor(l, w, h, bw, bh);
  ctx.shadowColor = l.glow || 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = size * 0.8;
  ctx.shadowOffsetY = size * 0.25;
  rr(ctx, x, y, bw, bh, l.radius ?? bh / 2);
  ctx.fillStyle = l.bg || '#111';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = l.color || '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(l.text, x + bw / 2, y + bh / 2 + size * 0.36);
}

function drawBadge(ctx, l, w, h, u) {
  if (!String(l.text || '').trim()) return;
  const d = (l.size || 14) * u;
  const { x, y } = anchor(l, w, h, d, d);
  ctx.save();
  ctx.translate(x + d / 2, y + d / 2);
  ctx.rotate(((l.tilt ?? -10) * Math.PI) / 180);
  ctx.shadowColor = 'rgba(0,0,0,0.22)';
  ctx.shadowBlur = d * 0.12;
  ctx.shadowOffsetY = d * 0.04;
  ctx.beginPath();
  if (l.shape === 'star') {
    const n = 14;
    for (let i = 0; i < n * 2; i++) {
      const r = (i % 2 ? 0.43 : 0.5) * d;
      const a = (i / (n * 2)) * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
  } else ctx.arc(0, 0, d / 2, 0, Math.PI * 2);
  ctx.fillStyle = l.bg || '#ff3b30';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = l.color || '#fff';
  ctx.textAlign = 'center';
  const main = String(l.text);
  const sub = String(l.sub || '');
  let fs = d * (main.length > 5 ? 0.22 : 0.3);
  ctx.font = `800 ${fs}px ${FONTS.display}`;
  while (ctx.measureText(main).width > d * 0.78 && fs > 6) { fs -= 1; ctx.font = `800 ${fs}px ${FONTS.display}`; }
  ctx.fillText(main, 0, sub ? fs * 0.2 : fs * 0.36);
  if (sub) {
    ctx.font = `600 ${d * 0.1}px ${FONTS.body}`;
    ctx.fillText(sub, 0, fs * 0.2 + d * 0.16);
  }
  ctx.restore();
}

// Autocollants : ruban d'angle, étiquette, pastille allongée, cercle.
function drawSticker(ctx, l, w, h, u) {
  const text = String(l.text || '').trim();
  if (!text) return;
  const size = (l.size || 3.2) * u;
  ctx.font = `800 ${size}px ${FONTS.display}`;
  const tw = ctx.measureText(text.toUpperCase()).width;
  ctx.save();
  ctx.fillStyle = l.bg || '#ff3b30';
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = size * 0.6;
  ctx.shadowOffsetY = size * 0.15;
  if (l.shape === 'ribbon') {
    // Bandeau en travers d'un angle de l'image.
    const corner = l.corner || 'tr';
    const band = size * 2.1;
    const off = size * 4.2;
    const L = Math.max(tw + size * 6, off * 3.4);
    const cx = corner.includes('r') ? w - off : off;
    const cy = corner.includes('b') ? h - off : off;
    ctx.translate(cx, cy);
    ctx.rotate((corner === 'tr' || corner === 'bl' ? 45 : -45) * Math.PI / 180);
    ctx.fillRect(-L / 2, -band / 2, L, band);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = l.color || '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(text.toUpperCase(), 0, size * 0.36);
    ctx.restore();
    return;
  }
  const pad = size * 0.9;
  const bw = tw + pad * 2 + (l.shape === 'tag' ? size * 1.4 : 0);
  const bh = size * 2.2;
  const circle = l.shape === 'circle';
  const d = Math.max(bw, bh) * (circle ? 1 : 0);
  const { x, y } = anchor(l, w, h, circle ? d : bw, circle ? d : bh);
  ctx.translate(x + (circle ? d : bw) / 2, y + (circle ? d : bh) / 2);
  ctx.rotate(((l.tilt ?? (l.shape === 'tag' ? -6 : 0)) * Math.PI) / 180);
  ctx.beginPath();
  if (circle) ctx.arc(0, 0, d / 2, 0, Math.PI * 2);
  else if (l.shape === 'tag') {
    const hx = -bw / 2; const k = bh / 2;
    ctx.moveTo(hx, 0); ctx.lineTo(hx + k, -k); ctx.lineTo(bw / 2 - size * 0.3, -k); ctx.quadraticCurveTo(bw / 2, -k, bw / 2, -k + size * 0.3);
    ctx.lineTo(bw / 2, k - size * 0.3); ctx.quadraticCurveTo(bw / 2, k, bw / 2 - size * 0.3, k); ctx.lineTo(hx + k, k); ctx.closePath();
  } else ctx.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  if (l.shape === 'tag') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(-bw / 2 + bh * 0.55, 0, size * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.fillStyle = l.color || '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(text.toUpperCase(), l.shape === 'tag' ? size * 0.5 : 0, size * 0.36);
  ctx.restore();
}

// Prix : ancien prix barré, prix actuel en grand, précision (« /mois »).
function priceBox(ctx, l, u) {
  const size = (l.size || 7) * u;
  ctx.font = `800 ${size}px ${FONTS.display}`;
  const pw = ctx.measureText(String(l.price || '')).width;
  ctx.font = `600 ${size * 0.42}px ${FONTS.body}`;
  const nw = l.note ? ctx.measureText(` ${l.note}`).width : 0;
  const ow = l.old ? ctx.measureText(String(l.old)).width : 0;
  return { size, w: Math.max(pw + nw, ow), h: size * (l.old ? 1.55 : 1.05), pw, nw, ow };
}

function drawPrice(ctx, l, w, h, u) {
  if (!String(l.price || '').trim()) return;
  const b = priceBox(ctx, l, u);
  const { x, y } = anchor(l, w, h, b.w, b.h);
  const left = l.align === 'center' ? x + (b.w - b.pw - b.nw) / 2 : l.align === 'right' ? x + b.w - b.pw - b.nw : x;
  let cy = y;
  ctx.textAlign = 'left';
  if (l.old) {
    ctx.font = `600 ${b.size * 0.42}px ${FONTS.body}`;
    ctx.fillStyle = l.oldColor || l.color || '#111';
    ctx.globalAlpha *= 0.62;
    const ox = l.align === 'center' ? x + (b.w - b.ow) / 2 : l.align === 'right' ? x + b.w - b.ow : x;
    ctx.fillText(String(l.old), ox, cy + b.size * 0.4);
    ctx.fillRect(ox - b.size * 0.03, cy + b.size * 0.26, b.ow + b.size * 0.06, Math.max(1.5, b.size * 0.045));
    ctx.globalAlpha /= 0.62;
    cy += b.size * 0.52;
  }
  ctx.font = `800 ${b.size}px ${FONTS.display}`;
  ctx.fillStyle = l.accent || l.color || '#111';
  if (l.glow) { ctx.shadowColor = l.glow; ctx.shadowBlur = b.size * 0.4; }
  ctx.fillText(String(l.price), left, cy + b.size * 0.9);
  ctx.shadowColor = 'transparent';
  if (l.note) {
    ctx.font = `600 ${b.size * 0.42}px ${FONTS.body}`;
    ctx.fillStyle = l.color || '#111';
    ctx.fillText(` ${l.note}`, left + b.pw, cy + b.size * 0.9);
  }
}

// Code promo : cadre en pointillés, libellé et code en chasse fixe.
function codeBox(ctx, l, u) {
  const size = (l.size || 3.6) * u;
  ctx.font = `700 ${size}px ${FONTS.mono}`;
  const cw = ctx.measureText(String(l.code || '')).width;
  ctx.font = `600 ${size * 0.62}px ${FONTS.body}`;
  const lw = l.label ? ctx.measureText(String(l.label).toUpperCase()).width : 0;
  return { size, w: Math.max(cw, lw) + size * 2, h: size * (l.label ? 3.1 : 2.2), cw, lw };
}

function drawCode(ctx, l, w, h, u) {
  if (!String(l.code || '').trim()) return;
  const b = codeBox(ctx, l, u);
  const { x, y } = anchor(l, w, h, b.w, b.h);
  ctx.save();
  rr(ctx, x, y, b.w, b.h, b.size * 0.5);
  ctx.fillStyle = l.bg || 'rgba(255,255,255,0.9)';
  ctx.fill();
  ctx.setLineDash([b.size * 0.35, b.size * 0.25]);
  ctx.lineWidth = Math.max(1.5, b.size * 0.08);
  ctx.strokeStyle = l.accent || '#111';
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.textAlign = 'center';
  let cy = y + b.size * 0.55;
  if (l.label) {
    ctx.font = `600 ${b.size * 0.62}px ${FONTS.body}`;
    ctx.fillStyle = l.color || '#111';
    ctx.globalAlpha *= 0.7;
    ctx.fillText(String(l.label).toUpperCase(), x + b.w / 2, cy + b.size * 0.5);
    ctx.globalAlpha /= 0.7;
    cy += b.size * 0.9;
  }
  ctx.font = `700 ${b.size}px ${FONTS.mono}`;
  ctx.fillStyle = l.accent || '#111';
  ctx.fillText(String(l.code), x + b.w / 2, cy + b.size * 0.95);
  ctx.restore();
}

// Carte de date (événement) : en-tête coloré avec le mois, jour en grand, libellé dessous.
function drawDateCard(ctx, l, w, h, u) {
  if (!String(l.day || '').trim()) return;
  const s = (l.size || 16) * u;
  const cw = s; const ch = s * 1.08;
  const { x, y } = anchor(l, w, h, cw, ch + (l.label ? s * 0.3 : 0));
  ctx.save();
  ctx.translate(x + cw / 2, y + ch / 2);
  ctx.rotate(((l.tilt ?? 4) * Math.PI) / 180);
  ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = s * 0.12; ctx.shadowOffsetY = s * 0.04;
  rr(ctx, -cw / 2, -ch / 2, cw, ch, s * 0.14);
  ctx.fillStyle = l.bg || '#ffffff';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.save(); rr(ctx, -cw / 2, -ch / 2, cw, ch, s * 0.14); ctx.clip();
  ctx.fillStyle = l.accent || '#ff3b30';
  ctx.fillRect(-cw / 2, -ch / 2, cw, ch * 0.28);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${s * 0.15}px ${FONTS.body}`;
  ctx.fillText(String(l.month || '').toUpperCase(), 0, -ch / 2 + ch * 0.19);
  ctx.fillStyle = l.color || '#111';
  ctx.font = `800 ${s * 0.5}px ${FONTS.display}`;
  ctx.fillText(String(l.day), 0, ch * 0.28);
  ctx.restore();
  if (l.label) {
    ctx.font = `600 ${s * 0.13}px ${FONTS.body}`;
    ctx.fillStyle = l.labelColor || l.color || '#111';
    ctx.textAlign = 'center';
    ctx.fillText(String(l.label), x + cw / 2, y + ch + s * 0.22);
  }
}

// Écran de fin : panneau plein cadre (logo, titre, bouton, lien) à la fin de la vidéo.
function drawEndcard(ctx, l, w, h, u, images, p) {
  const e = easeOut(p);
  ctx.save();
  ctx.globalAlpha *= clamp01(p * 1.4);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, l.bg || '#111');
  g.addColorStop(1, l.bg2 || l.bg || '#111');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const k = 0.92 + 0.08 * e;
  ctx.translate(w / 2, h / 2); ctx.scale(k, k); ctx.translate(-w / 2, -h / 2);
  const img = l.image && images[l.image];
  let cy = h * 0.5 - (img ? 14 * u : 4 * u);
  if (img) {
    const ih = 16 * u;
    const iw = ih * ((img.naturalWidth || img.width) / (img.naturalHeight || img.height || 1));
    ctx.save(); rr(ctx, w / 2 - iw / 2, cy - ih, iw, ih, ih * 0.22); ctx.clip(); ctx.drawImage(img, w / 2 - iw / 2, cy - ih, iw, ih); ctx.restore();
    cy += 5 * u;
  }
  if (l.title) {
    ctx.font = `800 ${7 * u}px ${FONTS[l.font] || FONTS.display}`;
    ctx.fillStyle = l.color || '#fff';
    ctx.textAlign = 'center';
    const lines = wrap(ctx, l.title, w * 0.8).slice(0, 2);
    lines.forEach((s, i) => ctx.fillText(s, w / 2, cy + 6.5 * u + i * 8 * u));
    cy += 8 * u * lines.length + 3 * u;
  }
  if (l.cta) drawCta(ctx, { text: l.cta, size: 3.4, bg: l.ctaBg || '#fff', color: l.ctaInk || '#111', x: 0.5, y: cy / h, align: 'center', valign: 'top' }, w, h, u);
  if (l.url) {
    ctx.font = `600 ${2.6 * u}px ${FONTS.body}`;
    ctx.fillStyle = l.color || '#fff';
    ctx.globalAlpha *= 0.75;
    ctx.textAlign = 'center';
    ctx.fillText(l.url, w / 2, h - 6 * u);
  }
  ctx.restore();
}

// Zones sûres des Stories (repère d'édition, jamais exporté).
function drawSafe(ctx, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,59,48,0.10)';
  ctx.fillRect(0, 0, w, h * 0.14);
  ctx.fillRect(0, h * 0.8, w, h * 0.2);
  ctx.fillRect(w * 0.86, h * 0.14, w * 0.14, h * 0.66);
  ctx.strokeStyle = 'rgba(255,59,48,0.55)';
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 1;
  ctx.strokeRect(w * 0.06, h * 0.14, w * 0.8, h * 0.66);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,59,48,0.85)';
  ctx.font = `600 ${Math.max(10, w * 0.022)}px ${FONTS.body}`;
  ctx.textAlign = 'center';
  ctx.fillText('Zone couverte par l’interface du réseau', w / 2, h * 0.08);
  ctx.fillText('Légende et boutons du réseau', w / 2, h * 0.9);
  ctx.restore();
}

function drawImage(ctx, l, w, h, u, images) {
  const img = images[l.image];
  if (!img) return;
  const ih = (l.size || 8) * u;
  const iw = ih * ((img.naturalWidth || img.width) / (img.naturalHeight || img.height || 1));
  const { x, y } = anchor(l, w, h, iw, ih);
  if (l.round) { ctx.save(); rr(ctx, x, y, iw, ih, ih * 0.22); ctx.clip(); }
  ctx.drawImage(img, x, y, iw, ih);
  if (l.round) ctx.restore();
}

function drawQr(ctx, l, w, h, u, qr) {
  if (!qr || !l.text) return;
  const s = (l.size || 16) * u;
  const { x, y } = anchor(l, w, h, s, s);
  const m = qr(l.text);
  if (!m) return;
  const n = m.length;
  const pad = s * 0.08;
  rr(ctx, x, y, s, s, s * 0.08);
  ctx.fillStyle = l.bg || '#fff';
  ctx.fill();
  const c = (s - pad * 2) / n;
  ctx.fillStyle = l.color || '#111';
  for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) if (m[r][q]) ctx.fillRect(x + pad + q * c, y + pad + r * c, Math.ceil(c), Math.ceil(c));
}

function drawScrim(ctx, l, w, h) {
  const x0 = (l.x0 ?? 0) * w;
  const y0 = (l.y0 ?? 0) * h;
  const x1 = (l.x1 ?? 1) * w;
  const y1 = (l.y1 ?? 1) * h;
  const g = l.dir === 'h' ? ctx.createLinearGradient(x0, 0, x1, 0) : ctx.createLinearGradient(0, y0, 0, y1);
  const c = l.color || '#000';
  const rgba = (a) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(c);
    if (!m) return c;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  g.addColorStop(0, rgba(l.from ?? 0));
  g.addColorStop(1, rgba(l.to ?? 0.6));
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
}

function drawRect(ctx, l, w, h, u) {
  const bw = (l.w || 0.1) * w;
  const bh = l.hu ? l.hu * u : (l.h || 0.01) * h;
  const { x, y } = anchor(l, w, h, bw, bh);
  rr(ctx, x, y, bw, bh, (l.radius || 0) * u);
  ctx.fillStyle = l.color || '#111';
  ctx.fill();
}

// Hauteur d'un calque (pour empiler les calques d'une pile).
function measure(ctx, l, w, h, u) {
  const size = (l.size || 4) * u;
  if (l.type === 'text') {
    if (!String(l.text || '').trim()) return 0;
    ctx.font = fontOf(l, u);
    const lines = wrap(ctx, l.upper ? String(l.text).toUpperCase() : l.text, (l.maxW || 0.8) * w).slice(0, l.maxLines || 6);
    return size * (l.lineHeight || 1.15) * lines.length + (l.underline ? size * 0.4 : 0);
  }
  if (l.type === 'list') {
    const items = (l.items || []).filter((x) => String(x).trim());
    if (!items.length) return 0;
    ctx.font = fontOf(l, u);
    const lh = (l.size || 3) * u * (l.lineHeight || 1.25);
    const n = items.reduce((a, it) => a + wrap(ctx, it, (l.maxW || 0.5) * w - (l.size || 3) * u * 1.25).length, 0);
    return n * lh + (l.gap ?? 1.6) * u * (items.length - 1);
  }
  if (l.type === 'cta') return String(l.text || '').trim() ? (l.size || 3) * u * 2.4 : 0;
  if (l.type === 'image') return l.image ? (l.size || 8) * u : 0;
  if (l.type === 'qr') return l.text ? (l.size || 16) * u : 0;
  if (l.type === 'rect') return l.hu ? l.hu * u : (l.h || 0.01) * h;
  if (l.type === 'space') return (l.size || 2) * u;
  if (l.type === 'price') return String(l.price || '').trim() ? priceBox(ctx, l, u).h : 0;
  if (l.type === 'code') return String(l.code || '').trim() ? codeBox(ctx, l, u).h : 0;
  if (l.type === 'sticker') return String(l.text || '').trim() && l.shape !== 'ribbon' ? (l.size || 3.2) * u * 2.2 : 0;
  return 0;
}

/* Pile : les calques sont posés les uns sous les autres, l'ensemble aligné comme un seul bloc. */
function drawStack(ctx, l, opts, u) {
  const { w, h } = opts;
  const items = (l.items || []).filter((c) => c && !c.hidden);
  const hs = items.map((c) => measure(ctx, { maxW: l.maxW, ...c }, w, h, u));
  const gap = (l.gap ?? 2.2) * u;
  const shown = items.map((c, i) => [c, hs[i]]).filter(([, hh]) => hh > 0);
  const total = shown.reduce((a, [, hh]) => a + hh, 0) + gap * Math.max(0, shown.length - 1);
  const y0 = (l.y ?? 0.5) * h;
  let y = l.valign === 'middle' ? y0 - total / 2 : l.valign === 'bottom' ? y0 - total : y0;
  shown.forEach(([c, hh], i) => {
    const child = {
      anim: l.anim, dur: l.dur, dist: l.dist, ...c, x: l.x, y: y / h, align: l.align, valign: 'top', maxW: c.maxW || l.maxW, delay: (c.delay ?? ((l.delay || 0) + i * (l.stagger ?? 0.14))),
    };
    if (['cta', 'image', 'qr', 'rect', 'price', 'code', 'sticker'].includes(c.type)) child.x = l.x;
    drawLayers(ctx, [child], opts);
    y += hh + gap;
  });
}

/* Dessine les calques au temps t. opts : { w, h, t, images: { clé: Image }, qr: (texte) → matrice, still } */
export function drawLayers(ctx, layers, opts) {
  const { w, h } = opts;
  const t = opts.t || 0;
  const u = Math.min(w, h) / 100;
  for (const l of layers || []) {
    if (!l || l.hidden) continue;
    if (l.type === 'stack') { drawStack(ctx, l, opts, u); continue; }
    if (l.type === 'safe') { if (opts.guides) drawSafe(ctx, w, h); continue; }
    if (l.type === 'endcard') {
      if (opts.still) continue;
      const pe = clamp01((t - (l.delay || 0)) / Math.max(0.01, l.dur || 0.6));
      if (pe > 0) drawEndcard(ctx, l, w, h, u, opts.images || {}, pe);
      continue;
    }
    const p = progress(l, t, opts.still);
    if (p <= 0 && l.anim !== 'none' && l.type !== 'scrim') continue;
    const st = l.type === 'scrim' ? { alpha: opts.still ? 1 : clamp01(t / 0.4 + 1), dx: 0, dy: 0, k: 1 } : enter(l, p, u);
    ctx.save();
    ctx.globalAlpha = st.alpha * (l.opacity ?? 1);
    if (l.anim === 'wipe' && p < 1) { ctx.beginPath(); ctx.rect(0, 0, w * ((l.x ?? 0) + (l.maxW || 1) * easeOut(p)), h); ctx.clip(); }
    if (st.k !== 1) {
      const cx = (l.x ?? 0.5) * w;
      const cy = (l.y ?? 0.5) * h;
      ctx.translate(cx, cy);
      ctx.scale(st.k, st.k);
      ctx.translate(-cx, -cy);
    }
    ctx.translate(st.dx, st.dy);
    if (st.blur) ctx.filter = `blur(${st.blur.toFixed(1)}px)`;
    switch (l.type) {
      case 'text': drawText(ctx, l, w, h, u, p); break;
      case 'list': drawList(ctx, l, w, h, u, t, opts.still); break;
      case 'cta': drawCta(ctx, l, w, h, u); break;
      case 'badge': drawBadge(ctx, l, w, h, u); break;
      case 'image': drawImage(ctx, l, w, h, u, opts.images || {}); break;
      case 'qr': drawQr(ctx, l, w, h, u, opts.qr); break;
      case 'scrim': drawScrim(ctx, l, w, h); break;
      case 'rect': drawRect(ctx, l, w, h, u); break;
      case 'sticker': drawSticker(ctx, l, w, h, u); break;
      case 'price': drawPrice(ctx, l, w, h, u); break;
      case 'code': drawCode(ctx, l, w, h, u); break;
      case 'date': drawDateCard(ctx, l, w, h, u); break;
      default: break;
    }
    ctx.restore();
  }
}

// Durée des animations d'entrée (pour caler la vidéo).
export function layersDuration(layers) {
  let d = 0;
  for (const l of layers || []) {
    if (!l || !l.anim || l.anim === 'none') continue;
    if (l.type === 'stack') { d = Math.max(d, (l.delay || 0) + (l.items || []).length * (l.stagger ?? 0.14) + layersDuration(l.items)); continue; }
    if (l.type === 'endcard' || l.type === 'safe') continue;
    const n = l.type === 'list' ? Math.max(0, (l.items || []).length - 1) * (l.stagger ?? 0.12) : 0;
    d = Math.max(d, (l.delay || 0) + (l.dur || 0.7) + n);
  }
  return d;
}

// Matrice d'un code QR (qrcode-generator, chargé à la demande).
let qrLib = null;
export async function loadQr() {
  if (!qrLib) qrLib = (await import('qrcode-generator')).default;
  const cache = new Map();
  return (text) => {
    if (cache.has(text)) return cache.get(text);
    try {
      const q = qrLib(0, 'M');
      q.addData(String(text));
      q.make();
      const n = q.getModuleCount();
      const m = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (__, c) => q.isDark(r, c)));
      cache.set(text, m);
      return m;
    } catch { return null; }
  };
}
