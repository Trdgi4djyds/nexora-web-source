/* Enregistrement des images : PNG, JPG, WebP ou PDF. */
import { api } from '../core/api.js';
import { canvasToBlob, blobToBytes } from '../core/dom.js';

export const FORMATS = {
  png: { label: 'PNG', ext: 'png', mime: 'image/png', alpha: true },
  jpg: { label: 'JPG', ext: 'jpg', mime: 'image/jpeg', alpha: false },
  webp: { label: 'WebP', ext: 'webp', mime: 'image/webp', alpha: true },
  pdf: { label: 'PDF', ext: 'pdf', mime: 'application/pdf', alpha: false },
};

function flatten(canvas, color = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = canvas.width;
  c.height = canvas.height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(canvas, 0, 0);
  return c;
}

function isOpaque(canvas) {
  // Réduction en 24 × 24 : un seul pixel partiellement transparent suffit à garder le PNG dans le PDF.
  const c = document.createElement('canvas');
  c.width = 24;
  c.height = 24;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, 24, 24);
  const d = ctx.getImageData(0, 0, 24, 24).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return false;
  return true;
}

/* PDF : une page à la taille de l'image, ou découpage en pages A4 pour les pages longues. */
export async function canvasToPdf(canvas, { pages = 'single', title = 'NEXORA' } = {}) {
  const { PDFDocument } = await import('./pdf.js');
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator('NEXORA');
  doc.setProducer('NEXORA');
  const pxToPt = 0.75;
  const parts = [];
  if (pages === 'a4' && canvas.height > canvas.width * 1.5) {
    const sliceH = Math.round(canvas.width * (297 / 210));
    for (let y = 0; y < canvas.height; y += sliceH) {
      const h = Math.min(sliceH, canvas.height - y);
      const c = document.createElement('canvas');
      c.width = canvas.width;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, h);
      ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      parts.push({ c, full: sliceH });
    }
  } else parts.push({ c: canvas, full: canvas.height });
  const opaque = isOpaque(canvas);
  for (const { c, full } of parts) {
    const blob = await canvasToBlob(opaque ? c : c, opaque ? 'image/jpeg' : 'image/png', 0.94);
    const bytes = await blobToBytes(blob);
    const img = opaque ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
    // Pages A4 : largeur de 595 pt, image à l'échelle ; sinon page à la taille de l'image.
    if (pages === 'a4' && parts.length > 1) {
      const w = 595.28;
      const k = w / c.width;
      const page = doc.addPage([w, full * k]);
      page.drawImage(img, { x: 0, y: full * k - c.height * k, width: w, height: c.height * k });
    } else {
      const page = doc.addPage([c.width * pxToPt, c.height * pxToPt]);
      page.drawImage(img, { x: 0, y: 0, width: c.width * pxToPt, height: c.height * pxToPt });
    }
  }
  return doc.save();
}

/*
 * Enregistre un canvas. opts : { format, name, project, saveAs, background (couleur pour JPG/PDF), pdfPages }
 * Renvoie le chemin du fichier, ou null si l'enregistrement a été annulé.
 */
export async function saveCanvas(canvas, opts) {
  const f = FORMATS[opts.format] || FORMATS.png;
  let data;
  if (f.ext === 'pdf') {
    const src = isOpaque(canvas) ? canvas : flatten(canvas, opts.background || '#ffffff');
    data = await canvasToPdf(src, { pages: opts.pdfPages || 'single', title: opts.name });
  } else {
    const src = f.alpha ? canvas : flatten(canvas, opts.background || '#ffffff');
    const blob = await canvasToBlob(src, f.mime, f.ext === 'png' ? undefined : 0.95);
    if (!blob) throw new Error("L'image est trop grande pour ce format.");
    data = await blobToBytes(blob);
  }
  return api.invoke('capture:save', {
    kind: 'photo', project: opts.project, name: opts.name, ext: f.ext, data, saveAs: Boolean(opts.saveAs),
  });
}

export async function saveBytes(data, opts) {
  return api.invoke('capture:save', {
    kind: opts.kind || 'photo', project: opts.project, name: opts.name, ext: opts.ext, data, saveAs: Boolean(opts.saveAs),
  });
}
