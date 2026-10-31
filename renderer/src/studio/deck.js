/* Générateur de présentations commerciales : diapositives 16:9 composées d'une mise en scène 3D (recettes
 * du studio de publicité) et de textes ; génération automatique à partir du site ; export PDF, PowerPoint,
 * vidéo et images. */
import { uid } from '../core/dom.js';
import { mixHex, onColor, lum } from './ads.js';

export const SLIDE_LAYOUTS = {
  cover: { label: 'Couverture', icon: 'star', recipe: 'hero' },
  screens: { label: 'Tous les écrans', icon: 'multi', recipe: 'multi' },
  mobile: { label: 'Mobile', icon: 'phone', recipe: 'phoneScroll' },
  desktop: { label: 'Ordinateur', icon: 'laptop', recipe: 'laptop' },
  features: { label: 'Points forts', icon: 'check', recipe: 'minimal' },
  statement: { label: 'Message clé', icon: 'text', recipe: 'flat' },
  contact: { label: 'Contact', icon: 'link', recipe: 'minimal' },
};

export function newSlide(layout = 'cover', patch = {}) {
  return {
    id: uid(), layout, kicker: '', title: '', text: '', bullets: [], dur: 5, ...patch,
  };
}

/* Zone 3D et calques d'une diapositive (16:9). */
export function slideLayout(slide, { brand, style, logo, index = 0, total = 1 }) {
  const ink = style.ink || brand.ink;
  const sub = mixHex(ink, style.dark ? '#000000' : '#ffffff', 0.3);
  const accent = style.dark && lum(brand.primary) < 0.2 ? '#ffffff' : brand.primary;
  const font = brand.font === 'serif' ? 'serif' : 'display';
  const T = (text, size, extra = {}) => ({
    type: 'text', text, size, color: ink, weight: 750, font, lineHeight: 1.06, letterSpacing: -0.02, anim: 'up', ...extra,
  });
  const kick = (text) => ({ type: 'text', text, size: 2.5, weight: 700, color: accent, upper: true, letterSpacing: 0.1, anim: 'up' });
  const body = (text, extra = {}) => ({ type: 'text', text, size: 3.1, weight: 430, color: sub, lineHeight: 1.38, anim: 'up', maxLines: 6, ...extra });
  const bullets = (items, extra = {}) => ({ type: 'list', items, size: 3.0, weight: 520, color: ink, bullet: accent, marker: 'check', gap: 1.8, anim: 'left', stagger: 0.14, ...extra });
  const layers = [];
  let region;
  const L = slide.layout;
  if (L === 'cover') {
    region = { cx: 0.7, cy: 0.55, rw: 0.55, rh: 0.86 };
    layers.push({
      type: 'stack', x: 0.075, y: 0.5, valign: 'middle', align: 'left', maxW: 0.46, gap: 2.4, delay: 0.2, items: [kick(slide.kicker), T(slide.title, 8.6, { weight: 800, maxLines: 4 }), body(slide.text)],
    });
  } else if (L === 'screens') {
    region = { cx: 0.5, cy: 0.64, rw: 0.92, rh: 0.66 };
    layers.push({
      type: 'stack', x: 0.5, y: 0.08, valign: 'top', align: 'center', maxW: 0.8, gap: 1.8, delay: 0.2, items: [kick(slide.kicker), T(slide.title, 6.2, { maxLines: 2 }), body(slide.text, { maxLines: 2 })],
    });
  } else if (L === 'mobile') {
    region = { cx: 0.29, cy: 0.52, rw: 0.4, rh: 0.78 };
    layers.push({
      type: 'stack', x: 0.53, y: 0.5, valign: 'middle', align: 'left', maxW: 0.4, gap: 2.2, delay: 0.2, items: [kick(slide.kicker), T(slide.title, 6.4, { maxLines: 3 }), body(slide.text), bullets(slide.bullets, { maxW: 0.4 })],
    });
  } else if (L === 'desktop') {
    region = { cx: 0.62, cy: 0.56, rw: 0.66, rh: 0.84 };
    layers.push({
      type: 'stack', x: 0.07, y: 0.5, valign: 'middle', align: 'left', maxW: 0.3, gap: 2.2, delay: 0.2, items: [kick(slide.kicker), T(slide.title, 5.6, { maxLines: 4 }), body(slide.text, { size: 2.8 }), bullets(slide.bullets, { maxW: 0.3, size: 2.7 })],
    });
  } else if (L === 'features') {
    region = { cx: 0.76, cy: 0.52, rw: 0.34, rh: 0.78 };
    layers.push({
      type: 'stack', x: 0.07, y: 0.5, valign: 'middle', align: 'left', maxW: 0.56, gap: 2.6, delay: 0.2, items: [kick(slide.kicker), T(slide.title, 6.2, { maxLines: 2 }), bullets(slide.bullets, { maxW: 0.56, size: 3.3 })],
    });
  } else if (L === 'statement') {
    region = { cx: 0.5, cy: 0.5, rw: 1, rh: 1 };
    layers.push({ type: 'scrim', y0: 0, y1: 1, color: style.dark ? '#000000' : brand.bg, from: 0.72, to: 0.72 });
    layers.push({
      type: 'stack', x: 0.5, y: 0.5, valign: 'middle', align: 'center', maxW: 0.74, gap: 2.4, delay: 0.2, items: [kick(slide.kicker), T(slide.title, 8.4, { weight: 800, maxLines: 4, underline: accent }), body(slide.text, { size: 3.4 })],
    });
  } else {
    // Contact
    region = { cx: 0.23, cy: 0.52, rw: 0.32, rh: 0.76 };
    const url = String(slide.url || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    layers.push({
      type: 'stack', x: 0.46, y: 0.5, valign: 'middle', align: 'left', maxW: 0.32, gap: 2.4, delay: 0.2,
      items: [kick(slide.kicker), T(slide.title, 6.4, { maxLines: 3 }), body(slide.text), { type: 'cta', text: url || slide.cta || '', size: 2.9, bg: accent, color: onColor(accent), anim: 'scale', dur: 0.5 }],
    });
    if (slide.url) layers.push({ type: 'qr', text: slide.url, size: 24, x: 0.93, y: 0.5, align: 'right', valign: 'middle', color: '#111111', bg: '#ffffff', anim: 'scale', delay: 0.8, dur: 0.5 });
  }
  if (logo && L !== 'cover') layers.push({ type: 'image', image: 'logo', size: 4.6, x: 0.955, y: 0.06, align: 'right', valign: 'top', anim: 'fade', delay: 0.1, round: true });
  if (logo && L === 'cover') layers.push({ type: 'image', image: 'logo', size: 7.2, x: 0.075, y: 0.08, align: 'left', valign: 'top', anim: 'fade', delay: 0.05, round: true });
  // Pied de page : nom de la marque et numéro.
  if (total > 1 && L !== 'cover') {
    layers.push({ type: 'text', text: brand.name || '', size: 1.8, weight: 600, color: sub, x: 0.07, y: 0.955, valign: 'bottom', anim: 'none' });
    layers.push({ type: 'text', text: `${index + 1} / ${total}`, size: 1.8, weight: 600, color: sub, x: 0.955, y: 0.955, align: 'right', valign: 'bottom', anim: 'none' });
  }
  return { region, layers };
}

const short = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const dot = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return dot > n * 0.5 ? cut.slice(0, dot + 1) : `${cut.replace(/\s+\S*$/, '')}…`;
};

/* Plan de présentation à partir des informations du site (titre, description, sections). Tous les textes
 * viennent du site ; les intitulés génériques sont modifiables. */
export function planFromSite(info, url) {
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } })();
  const name = info.siteName || (info.title || '').split(/\s[|–—-]\s/)[0] || host;
  const secs = (info.sections || []).filter((s) => s.title && s.title.length > 2);
  const withText = secs.filter((s) => s.text && s.text.length > 30);
  const slides = [];
  slides.push(newSlide('cover', { kicker: name, title: short(info.h1 || info.title || name, 90), text: short(info.description, 180) }));
  slides.push(newSlide('screens', { kicker: 'Sur tous les écrans', title: `${name} sur ordinateur, tablette et mobile`, text: host }));
  if (withText[0]) slides.push(newSlide('mobile', { kicker: 'Sur mobile', title: short(withText[0].title, 70), text: short(withText[0].text, 200) }));
  if (withText[1]) slides.push(newSlide('desktop', { kicker: 'Sur ordinateur', title: short(withText[1].title, 70), text: short(withText[1].text, 200) }));
  if (secs.length >= 3) slides.push(newSlide('features', { kicker: name, title: 'Au programme', bullets: secs.slice(0, 5).map((s) => short(s.title, 60)) }));
  if (info.description && slides.length < 6) slides.push(newSlide('statement', { kicker: name, title: short(info.description, 110), text: '' }));
  slides.push(newSlide('contact', {
    kicker: 'Contact', title: `Rendez-vous sur ${host}`, text: info.description ? '' : name, url,
  }));
  return { name, slides };
}

/* ------------------------------------------------------------------ PowerPoint
 * Fichier .pptx minimal (Office Open XML) : une image plein cadre par diapositive, le texte de la diapositive
 * dans les notes de l'orateur. Archive ZIP sans compression (les images JPEG le sont déjà). */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function zipStore(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let off = 0;
  for (const [name, data0] of files) {
    const data = typeof data0 === 'string' ? enc.encode(data0) : data0;
    const nb = enc.encode(name);
    const crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
    h.setUint16(26, nb.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), nb, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nb);
    off += 30 + nb.length + data.length;
  }
  const csize = central.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

const xe = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildPptx(slides, { title = 'Présentation', author = 'NEXORA' } = {}) {
  const N = slides.length;
  const W = 12192000;
  const H = 6858000;
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const files = [];
  const slideIds = slides.map((_, i) => i + 1);
  files.push(['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
<Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
${slideIds.map((i) => `<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/notesSlides/notesSlide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`).join('')}
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`]);
  files.push(['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`]);
  files.push(['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xe(title)}</dc:title><dc:creator>${xe(author)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`]);
  files.push(['docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>NEXORA</Application><Slides>${N}</Slides></Properties>`]);
  files.push(['ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst><p:sldIdLst>${slideIds.map((i) => `<p:sldId id="${255 + i}" r:id="rId${10 + i}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`]);
  files.push(['ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="notesMasters/notesMaster1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>${slideIds.map((i) => `<Relationship Id="rId${10 + i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i}.xml"/>`).join('')}</Relationships>`]);
  const theme = (n) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="NEXORA${n}"><a:themeElements><a:clrScheme name="NEXORA"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F1F1F"/></a:dk2><a:lt2><a:srgbClr val="EEEEEE"/></a:lt2><a:accent1><a:srgbClr val="5B5BF0"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="4472C4"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="NEXORA"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="NEXORA"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
  files.push(['ppt/theme/theme1.xml', theme(1)]);
  files.push(['ppt/theme/theme2.xml', theme(2)]);
  const spTree = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
  files.push(['ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${spTree}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`]);
  files.push(['ppt/slideMasters/_rels/slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`]);
  files.push(['ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Vide"><p:spTree>${spTree}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`]);
  files.push(['ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`]);
  files.push(['ppt/notesMasters/notesMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notesMaster ${NS}><p:cSld><p:spTree>${spTree}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:notesMaster>`]);
  files.push(['ppt/notesMasters/_rels/notesMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme2.xml"/></Relationships>`]);
  slides.forEach((s, k) => {
    const i = k + 1;
    files.push([`ppt/slides/slide${i}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${NS}><p:cSld><p:spTree>${spTree}<p:pic><p:nvPicPr><p:cNvPr id="2" name="${xe(s.title || `Diapositive ${i}`)}" descr="${xe([s.title, s.text].filter(Boolean).join(' — '))}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${W}" cy="${H}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${s.dur ? `<p:transition spd="med"><p:fade/></p:transition>` : ''}</p:sld>`]);
    files.push([`ppt/slides/_rels/slide${i}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${i}.jpeg"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${i}.xml"/></Relationships>`]);
    const notes = [s.title, s.text, ...(s.bullets || []).map((b) => `• ${b}`), s.url].filter(Boolean);
    files.push([`ppt/notesSlides/notesSlide${i}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes ${NS}><p:cSld><p:spTree>${spTree}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4343400"/><a:ext cx="5486400" cy="4114800"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${(notes.length ? notes : ['']).map((n) => `<a:p><a:r><a:rPr lang="fr-FR"/><a:t>${xe(n)}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`]);
    files.push([`ppt/notesSlides/_rels/notesSlide${i}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide${i}.xml"/></Relationships>`]);
    files.push([`ppt/media/image${i}.jpeg`, s.jpeg]);
  });
  return zipStore(files);
}
