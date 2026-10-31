/* Mise en forme du code d'un composant : HTML indenté, CSS assemblé, conversion en JSX (React). */

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const INLINE = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr', 'label']);
const RAW = new Set(['script', 'style', 'pre', 'textarea']);

const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;');
const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

function parse(html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content;
}

/** HTML indenté (2 espaces), texte et éléments en ligne conservés. */
export function formatHtml(html, { dropScripts = true } = {}) {
  const frag = parse(html);
  const out = [];
  const attrs = (el) => [...el.attributes].map((a) => (a.value === '' && !/^(alt|value|content)$/.test(a.name) ? ` ${a.name}` : ` ${a.name}="${escAttr(a.value)}"`)).join('');
  const onlyInline = (el) => [...el.childNodes].every((n) => n.nodeType === 3 || (n.nodeType === 1 && INLINE.has(n.localName) && onlyInline(n)));
  const inline = (n) => {
    if (n.nodeType === 3) return escText(n.textContent.replace(/\s+/g, ' '));
    if (n.nodeType !== 1) return '';
    const tag = n.localName;
    if (VOID.has(tag)) return `<${tag}${attrs(n)}>`;
    return `<${tag}${attrs(n)}>${[...n.childNodes].map(inline).join('')}</${tag}>`;
  };
  const walk = (n, depth) => {
    const pad = '  '.repeat(depth);
    if (n.nodeType === 3) {
      const t = n.textContent.replace(/\s+/g, ' ').trim();
      if (t) out.push(pad + escText(t));
      return;
    }
    if (n.nodeType === 8) return;
    if (n.nodeType !== 1) return;
    const tag = n.localName;
    if (dropScripts && tag === 'script') return;
    if (VOID.has(tag)) { out.push(`${pad}<${tag}${attrs(n)}>`); return; }
    if (RAW.has(tag)) { out.push(`${pad}<${tag}${attrs(n)}>${tag === 'pre' || tag === 'textarea' ? n.innerHTML : n.textContent.trim()}</${tag}>`); return; }
    if (tag === 'svg' || tag === 'math') { out.push(pad + n.outerHTML.replace(/>\s+</g, '><')); return; }
    if (!n.childNodes.length) { out.push(`${pad}<${tag}${attrs(n)}></${tag}>`); return; }
    if (onlyInline(n)) {
      const line = `${pad}<${tag}${attrs(n)}>${[...n.childNodes].map(inline).join('').trim()}</${tag}>`;
      if (line.length < 160) { out.push(line); return; }
    }
    out.push(`${pad}<${tag}${attrs(n)}>`);
    for (const c of n.childNodes) walk(c, depth + 1);
    out.push(`${pad}</${tag}>`);
  };
  for (const c of frag.childNodes) walk(c, 0);
  return out.join('\n');
}

function wrap(r) {
  let css = `${r.sel}${r.pseudo && !r.sel.includes('::') ? '' : ''} {\n${r.decls.map((d) => `  ${d}`).join('\n')}\n}`;
  const indent = (s) => s.split('\n').map((l) => `  ${l}`).join('\n');
  for (const l of r.layers || []) css = `@layer ${l} {\n${indent(css)}\n}`;
  for (const c of r.container || []) css = `@container ${c} {\n${indent(css)}\n}`;
  for (const s of r.supports || []) css = `@supports ${s} {\n${indent(css)}\n}`;
  for (const m of r.media || []) css = `@media ${m} {\n${indent(css)}\n}`;
  return css;
}

/** CSS complet du composant (variables, polices, héritage, règles, animations). */
export function buildCss(code, { inherited = true, rootClass = 'vt-root' } = {}) {
  const parts = [];
  if (code.vars.length) parts.push(`/* Variables utilisées */\n:root {\n${code.vars.map(([k, v]) => `  ${k}: ${String(v).trim()};`).join('\n')}\n}`);
  if (code.fontFaces.length) parts.push(`/* Polices */\n${code.fontFaces.join('\n\n')}`);
  if (inherited && Object.keys(code.inherited || {}).length) parts.push(`/* Styles hérités de la page (à appliquer au conteneur) */\n.${rootClass} {\n${Object.entries(code.inherited).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`);
  if (code.rules.length) parts.push(code.rules.map(wrap).join('\n\n'));
  if (code.keyframes.length) parts.push(`/* Animations */\n${code.keyframes.join('\n\n')}`);
  return parts.join('\n\n');
}

export function standalone(code, html, css, title) {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escText(title || 'Composant')}</title>
  <style>
${css.split('\n').map((l) => `    ${l}`).join('\n')}
  </style>
</head>
<body>
  <div class="vt-root">
${html.split('\n').map((l) => `    ${l}`).join('\n')}
  </div>
</body>
</html>
`;
}

// ------------------------------------------------------------------ JSX
const ATTR_MAP = {
  class: 'className', for: 'htmlFor', tabindex: 'tabIndex', readonly: 'readOnly', maxlength: 'maxLength', minlength: 'minLength', colspan: 'colSpan', rowspan: 'rowSpan', srcset: 'srcSet', crossorigin: 'crossOrigin', autocomplete: 'autoComplete', autofocus: 'autoFocus', enctype: 'encType', frameborder: 'frameBorder', contenteditable: 'contentEditable', spellcheck: 'spellCheck', playsinline: 'playsInline', novalidate: 'noValidate', datetime: 'dateTime', allowfullscreen: 'allowFullScreen', inputmode: 'inputMode', referrerpolicy: 'referrerPolicy', usemap: 'useMap', 'accept-charset': 'acceptCharset', 'http-equiv': 'httpEquiv', 'xlink:href': 'xlinkHref', 'xml:space': 'xmlSpace', fetchpriority: 'fetchPriority', imagesrcset: 'imageSrcSet', imagesizes: 'imageSizes', formaction: 'formAction', cellpadding: 'cellPadding', cellspacing: 'cellSpacing', hreflang: 'hrefLang', marginheight: 'marginHeight', marginwidth: 'marginWidth',
};
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function styleObj(s) {
  const out = [];
  for (const part of s.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k) continue;
    const key = k.startsWith('--') ? `'${k}'` : camel(k.replace(/^-ms-/, 'ms-'));
    out.push(`${key}: ${JSON.stringify(v).replace(/^"|"$/g, "'").replace(/\\"/g, '"')}`);
  }
  return `{{ ${out.join(', ')} }}`;
}

export function toComponentName(s) {
  const n = String(s || 'Composant').replace(/[#.]/g, ' ').replace(/[^a-zA-Z0-9 ]+/g, ' ').trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('').replace(/^[0-9]+/, '');
  return n || 'Composant';
}

export function toJsx(html, name) {
  const frag = parse(html);
  const lines = [];
  const textJsx = (t) => t.replace(/[{}]/g, (c) => `{'${c}'}`).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const attrs = (el) => [...el.attributes].filter((a) => !/^on/i.test(a.name)).map((a) => {
    const name = ATTR_MAP[a.name] || (a.name.startsWith('data-') || a.name.startsWith('aria-') ? a.name : a.name.includes('-') || a.name.includes(':') ? camel(a.name.replace(':', '-')) : a.name);
    if (a.name === 'style') return ` style=${styleObj(a.value)}`;
    if (a.value === '' && !/^(alt|value|content|href|src)$/.test(a.name)) return ` ${name}`;
    return ` ${name}="${a.value.replace(/"/g, '&quot;')}"`;
  }).join('');
  const walk = (n, depth) => {
    const pad = '  '.repeat(depth);
    if (n.nodeType === 3) {
      const t = n.textContent.replace(/\s+/g, ' ').trim();
      if (t) lines.push(pad + textJsx(t));
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = n.localName === 'svg' ? 'svg' : n.tagName.includes('-') || /[A-Z]/.test(n.tagName) && n.namespaceURI !== 'http://www.w3.org/1999/xhtml' ? n.tagName : n.localName;
    if (tag === 'script' || tag === 'style') return;
    if (VOID.has(tag) || !n.childNodes.length || ![...n.childNodes].some((c) => c.nodeType === 1 || (c.nodeType === 3 && c.textContent.trim()))) { lines.push(`${pad}<${tag}${attrs(n)} />`); return; }
    const kids = [...n.childNodes].filter((c) => c.nodeType === 1 || (c.nodeType === 3 && c.textContent.trim()));
    if (kids.length === 1 && kids[0].nodeType === 3) {
      const line = `${pad}<${tag}${attrs(n)}>${textJsx(kids[0].textContent.replace(/\s+/g, ' ').trim())}</${tag}>`;
      if (line.length < 150) { lines.push(line); return; }
    }
    lines.push(`${pad}<${tag}${attrs(n)}>`);
    for (const c of n.childNodes) walk(c, depth + 1);
    lines.push(`${pad}</${tag}>`);
  };
  const roots = [...frag.childNodes].filter((c) => c.nodeType === 1);
  const multi = roots.length > 1;
  if (multi) lines.push('      <>');
  for (const c of frag.childNodes) walk(c, multi ? 4 : 3);
  if (multi) lines.push('      </>');
  const comp = toComponentName(name);
  return `import './${comp}.css';

export default function ${comp}() {
  return (
${lines.join('\n')}
  );
}
`;
}
