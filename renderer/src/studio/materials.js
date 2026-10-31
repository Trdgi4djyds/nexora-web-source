/* Matières du Studio : finitions prêtes à l'emploi, réglages avancés et textures procédurales. */
import * as T from './three.js';

export const FINISHES = {
  mat: 'Mat', satin: 'Satiné', brillant: 'Brillant', metal: 'Métal', chrome: 'Chrome', or: 'Or', verre: 'Verre', depoli: 'Verre dépoli',
  caoutchouc: 'Caoutchouc', ceramique: 'Céramique', argile: 'Argile', velours: 'Velours', holo: 'Holographique', neon: 'Néon', toon: 'Dessin',
};

export const TEXTURES = {
  none: 'Aucune', marbre: 'Marbre', bois: 'Bois', beton: 'Béton', grille: 'Grille', damier: 'Damier', rayures: 'Rayures', points: 'Pois', bruit: 'Grain', degrade: 'Dégradé', image: 'Image…',
};

// Valeurs avancées modifiables (curseurs de l'inspecteur).
export const MAT_KEYS = {
  roughness: ['Rugosité', 0, 1, 0.01],
  metalness: ['Métal', 0, 1, 0.01],
  clearcoat: ['Vernis', 0, 1, 0.01],
  transmission: ['Transparence', 0, 1, 0.01],
  opacity: ['Opacité', 0.05, 1, 0.01],
  emissive: ['Lumière propre', 0, 6, 0.05],
  iridescence: ['Irisation', 0, 1, 0.01],
  sheen: ['Reflet velours', 0, 1, 0.01],
};

export function finishMaterial(color, finish = 'satin', mat = null, maps = null) {
  const c = new T.Color(color);
  let m;
  switch (finish) {
    case 'mat': m = new T.MeshPhysicalMaterial({ color: c, roughness: 0.88, metalness: 0 }); break;
    case 'brillant': m = new T.MeshPhysicalMaterial({ color: c, roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 }); break;
    case 'metal': m = new T.MeshPhysicalMaterial({ color: c, roughness: 0.28, metalness: 1 }); break;
    case 'chrome': m = new T.MeshPhysicalMaterial({ color: c.clone().lerp(new T.Color('#ffffff'), 0.6), roughness: 0.03, metalness: 1 }); break;
    case 'or': m = new T.MeshPhysicalMaterial({ color: new T.Color('#e6b85c').lerp(c, 0.15), roughness: 0.22, metalness: 1, clearcoat: 0.4 }); break;
    case 'verre': m = new T.MeshPhysicalMaterial({ color: c, roughness: 0.03, metalness: 0, transmission: 1, thickness: 2.5, ior: 1.45, transparent: true }); break;
    case 'depoli': m = new T.MeshPhysicalMaterial({ color: c, roughness: 0.42, metalness: 0, transmission: 1, thickness: 3, ior: 1.4, transparent: true }); break;
    case 'caoutchouc': m = new T.MeshPhysicalMaterial({ color: c, roughness: 0.7, metalness: 0, sheen: 0.4, sheenRoughness: 0.8, sheenColor: new T.Color('#ffffff') }); break;
    case 'ceramique': m = new T.MeshPhysicalMaterial({ color: c, roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12, specularIntensity: 0.8 }); break;
    case 'argile': m = new T.MeshPhysicalMaterial({ color: c, roughness: 1, metalness: 0 }); break;
    case 'velours': m = new T.MeshPhysicalMaterial({ color: c, roughness: 0.95, metalness: 0, sheen: 1, sheenRoughness: 0.35, sheenColor: c.clone().lerp(new T.Color('#ffffff'), 0.55) }); break;
    case 'holo': m = new T.MeshPhysicalMaterial({ color: c.clone().lerp(new T.Color('#ffffff'), 0.5), roughness: 0.12, metalness: 0.85, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [100, 800] }); break;
    case 'neon': m = new T.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.4, roughness: 0.4, metalness: 0, toneMapped: false }); break;
    case 'toon': {
      const g = new Uint8Array([70, 150, 255]);
      const grad = new T.DataTexture(g, 3, 1, T.RedFormat);
      grad.minFilter = T.NearestFilter; grad.magFilter = T.NearestFilter; grad.needsUpdate = true;
      m = new T.MeshToonMaterial({ color: c, gradientMap: grad });
      break;
    }
    default: m = new T.MeshPhysicalMaterial({ color: c, roughness: 0.45, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4 });
  }
  if (mat) applyMatOverrides(m, mat, c);
  if (maps && maps.map) {
    m.map = maps.map;
    if (maps.bump && 'bumpMap' in m) { m.bumpMap = maps.bump; m.bumpScale = maps.bumpScale ?? 0.6; }
    if (maps.rough && 'roughnessMap' in m) m.roughnessMap = maps.rough;
    // La texture porte la couleur : la teinte de base reste blanche si la texture est en couleurs.
    if (maps.colored) m.color.set('#ffffff');
    m.needsUpdate = true;
  }
  return m;
}

export function applyMatOverrides(m, mat, base) {
  const has = (k) => mat[k] != null && mat[k] !== '';
  if (has('roughness') && 'roughness' in m) m.roughness = mat.roughness;
  if (has('metalness') && 'metalness' in m) m.metalness = mat.metalness;
  if (has('clearcoat') && 'clearcoat' in m) m.clearcoat = mat.clearcoat;
  if (has('transmission') && 'transmission' in m) { m.transmission = mat.transmission; if (mat.transmission > 0) { m.transparent = true; m.thickness = m.thickness || 2; } }
  if (has('iridescence') && 'iridescence' in m) m.iridescence = mat.iridescence;
  if (has('sheen') && 'sheen' in m) { m.sheen = mat.sheen; m.sheenColor = base.clone().lerp(new T.Color('#ffffff'), 0.5); }
  if (has('opacity')) { m.opacity = mat.opacity; m.transparent = mat.opacity < 1 || m.transparent; if (mat.opacity < 1) m.depthWrite = mat.opacity > 0.6; }
  if (has('emissive') && 'emissive' in m) {
    m.emissive = new T.Color(mat.emissiveColor || base);
    m.emissiveIntensity = mat.emissive;
    if (mat.emissive > 1.5) m.toneMapped = false;
  }
  if (mat.wire) m.wireframe = true;
  if (mat.flat) m.flatShading = true;
  m.needsUpdate = true;
}

// ------------------------------------------------------------------ textures procédurales
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

// Bruit de valeur lissé, répétable (pour marbre, bois, béton).
function valueNoise(size, cells, seed) {
  const r = rng(seed);
  const g = [];
  for (let i = 0; i < cells * cells; i++) g.push(r());
  const at = (x, y) => g[((y + cells) % cells) * cells + ((x + cells) % cells)];
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells; const fy = (y / size) * cells;
      const ix = Math.floor(fx); const iy = Math.floor(fy);
      const tx = fx - ix; const ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx); const sy = ty * ty * (3 - 2 * ty);
      const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
      const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
      out[y * size + x] = a + (b - a) * sy;
    }
  }
  return out;
}

function fbm(size, seed, octaves = 5, base = 4) {
  const out = new Float32Array(size * size);
  let amp = 0.5; let tot = 0;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(size, base * 2 ** o, seed + o * 101);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

const cache = new Map();

// Rend { map, bump, colored } pour une texture procédurale ; les canevas sont mis en cache.
export function proceduralMaps(kind, { color = '#ffffff', color2 = '#1d1d1f', scale = 1 } = {}) {
  if (!kind || kind === 'none' || kind === 'image') return null;
  const key = `${kind}|${color}|${color2}`;
  let entry = cache.get(key);
  if (!entry) {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d');
    const A = new T.Color(color); const B = new T.Color(color2);
    const img = ctx.createImageData(S, S);
    const bump = document.createElement('canvas');
    bump.width = S; bump.height = S;
    const bctx = bump.getContext('2d');
    const bimg = bctx.createImageData(S, S);
    const put = (i, t, h = t) => {
      const r = A.r + (B.r - A.r) * t; const g = A.g + (B.g - A.g) * t; const b = A.b + (B.b - A.b) * t;
      img.data[i * 4] = Math.round(T.MathUtils.clamp(r, 0, 1) ** (1 / 2.2) * 255);
      img.data[i * 4 + 1] = Math.round(T.MathUtils.clamp(g, 0, 1) ** (1 / 2.2) * 255);
      img.data[i * 4 + 2] = Math.round(T.MathUtils.clamp(b, 0, 1) ** (1 / 2.2) * 255);
      img.data[i * 4 + 3] = 255;
      const hv = Math.round(T.MathUtils.clamp(h, 0, 1) * 255);
      bimg.data[i * 4] = hv; bimg.data[i * 4 + 1] = hv; bimg.data[i * 4 + 2] = hv; bimg.data[i * 4 + 3] = 255;
    };
    if (kind === 'marbre') {
      const n = fbm(S, 7, 6, 3);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const i = y * S + x;
        const v = Math.abs(Math.sin((x / S) * Math.PI * 4 + n[i] * 9));
        const vein = (1 - v) ** 4;
        const fine = (1 - Math.abs(Math.sin((y / S) * Math.PI * 9 + n[i] * 14))) ** 12;
        put(i, Math.min(1, vein * 0.75 + fine * 0.35 + n[i] * 0.08), 1 - vein);
      }
    } else if (kind === 'bois') {
      const n = fbm(S, 3, 4, 2);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const i = y * S + x;
        const d = Math.hypot((x / S - 0.5) * 0.4, (y / S) * 0.05) * 60 + n[i] * 8;
        const ring = (Math.sin(d * Math.PI) + 1) / 2;
        put(i, 0.15 + ring ** 3 * 0.55 + n[i] * 0.15, ring);
      }
    } else if (kind === 'beton' || kind === 'bruit') {
      const n = fbm(S, 11, kind === 'beton' ? 6 : 3, kind === 'beton' ? 8 : 64);
      const r = rng(5);
      for (let i = 0; i < S * S; i++) {
        const pit = kind === 'beton' && r() > 0.997 ? 0.6 : 0;
        put(i, Math.min(1, (n[i] - 0.3) * (kind === 'beton' ? 0.55 : 0.8) + pit), 1 - n[i] - pit);
      }
    } else {
      ctx.fillStyle = color; ctx.fillRect(0, 0, S, S);
      bctx.fillStyle = '#fff'; bctx.fillRect(0, 0, S, S);
      const both = (fn) => { ctx.fillStyle = color2; bctx.fillStyle = '#000'; fn(ctx); fn(bctx); };
      if (kind === 'grille') both((x) => { for (let i = 0; i <= 8; i++) { x.fillRect((i * S) / 8 - 3, 0, 6, S); x.fillRect(0, (i * S) / 8 - 3, S, 6); } });
      if (kind === 'damier') both((x) => { for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) if ((i + j) % 2) x.fillRect((i * S) / 8, (j * S) / 8, S / 8, S / 8); });
      if (kind === 'rayures') both((x) => { for (let i = 0; i < 8; i++) x.fillRect((i * S) / 8, 0, S / 16, S); });
      if (kind === 'points') both((x) => { for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { x.beginPath(); x.arc((i + 0.5 + (j % 2) * 0.5) * (S / 8), (j + 0.5) * (S / 8), S / 40, 0, Math.PI * 2); x.fill(); } });
      if (kind === 'degrade') {
        const g = ctx.createLinearGradient(0, 0, 0, S); g.addColorStop(0, color); g.addColorStop(1, color2); ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
        bctx.fillStyle = '#808080'; bctx.fillRect(0, 0, S, S);
      }
    }
    if (['marbre', 'bois', 'beton', 'bruit'].includes(kind)) { ctx.putImageData(img, 0, 0); bctx.putImageData(bimg, 0, 0); }
    entry = { c, bump };
    cache.set(key, entry);
  }
  const map = new T.CanvasTexture(entry.c);
  map.colorSpace = T.SRGBColorSpace;
  const bump = new T.CanvasTexture(entry.bump);
  for (const t of [map, bump]) {
    t.wrapS = T.RepeatWrapping; t.wrapT = t.wrapS;
    t.repeat.set(scale, scale);
    t.anisotropy = 8;
    if (kind === 'degrade') { t.wrapS = T.ClampToEdgeWrapping; t.wrapT = T.ClampToEdgeWrapping; t.repeat.set(1, 1); }
  }
  return {
    map, bump, colored: true, bumpScale: kind === 'beton' || kind === 'bois' ? 1.2 : 0.4,
  };
}

export function imageMaps(img, scale = 1) {
  const map = new T.Texture(img);
  map.colorSpace = T.SRGBColorSpace;
  map.wrapS = T.RepeatWrapping; map.wrapT = T.RepeatWrapping;
  map.repeat.set(scale, scale);
  map.anisotropy = 8;
  map.needsUpdate = true;
  return { map, colored: true };
}

// Coordonnées de texture « triplanaires » simplifiées : projette les UV depuis les positions,
// pour que les formes sans UV (extrusions, fusions) reçoivent une texture sans étirement.
export function boxUv(geo, k = 0.08) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  if (!p || !n) return geo;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)); const ay = Math.abs(n.getY(i)); const az = Math.abs(n.getZ(i));
    let u; let v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); } else if (ay >= az) { u = p.getX(i); v = p.getZ(i); } else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * k; uv[i * 2 + 1] = v * k;
  }
  geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
  return geo;
}
