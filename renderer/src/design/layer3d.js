/* NEX-DESIGN › calques 3D : un objet 3D (forme, texte en relief, appareil avec ton site, modèle .glb, scène du
 * Studio) vit dans la composition 2D comme un calque image. Il est rendu par un moteur three.js unique, hors écran,
 * à la taille affichée (×2 pour rester net au zoom), avec fond transparent, lumière, ombre et matière réglables.
 * On le fait pivoter en 3D directement sur la page (double-clic sur le calque, puis glisser). */
import { FabricImage, classRegistry } from 'fabric';

let T = null;
let engine = null;

export const SHAPES3D = {
  sphere: 'Sphère', cube: 'Cube', cylindre: 'Cylindre', cone: 'Cône', tore: 'Tore', noeud: 'Nœud', capsule: 'Capsule', pilule: 'Pilule',
  pyramide: 'Pyramide', prisme: 'Prisme', demisphere: 'Dôme', gemme: 'Gemme', diamant: 'Polyèdre', blob: 'Forme organique', nuage: 'Nuage',
  spirale: 'Spirale', etoile: 'Étoile', coeur: 'Cœur', fleche: 'Flèche', bulle: 'Bulle', podium: 'Podium', socle: 'Socle', anneau: 'Anneau', arche: 'Arche',
};

export const DEFAULT_SPEC = {
  kind: 'decor', shape: 'sphere', color: '#ffffff', finish: 'chrome', text: 'NEXORA', font: 'inter', icon: 'star',
  deviceId: 'iphone-18-pro', deviceColor: '', screen: null, asset: null,
  rx: -12, ry: 28, rz: 0, fov: 30, light: 35, lightHeight: 1, intensity: 1, ambient: 1, shadow: 0.35, env: 1,
  mods: null, w: 800, h: 800,
};

async function three() {
  if (!T) T = await import('../studio/three.js');
  return T;
}

// Moteur partagé : un seul contexte WebGL pour tous les calques 3D du document.
async function getEngine() {
  if (engine) return engine;
  await three();
  const canvas = document.createElement('canvas');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  const scene = new T.Scene();
  const pm = new T.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new T.RoomEnvironment(), 0.04).texture;
  const camera = new T.PerspectiveCamera(30, 1, 0.1, 5000);
  const key = new T.DirectionalLight('#ffffff', 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 6;
  key.shadow.bias = -0.0004;
  const fill = new T.DirectionalLight('#eef2ff', 0.6);
  const amb = new T.HemisphereLight('#ffffff', '#c9ccd6', 0.5);
  const ground = new T.Mesh(new T.PlaneGeometry(1, 1), new T.ShadowMaterial({ opacity: 0.35 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(key, key.target, fill, amb, ground);
  engine = {
    renderer, scene, camera, key, fill, amb, ground, models: new Map(), gltf: new Map(),
  };
  return engine;
}

function dataUrlToBytes(url) {
  const b = atob(url.split(',')[1] || '');
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function loadGltf(e, asset) {
  if (!asset) return null;
  if (e.gltf.has(asset.id)) return e.gltf.get(asset.id);
  const bytes = dataUrlToBytes(asset.data);
  const gltf = await new Promise((res, rej) => new T.GLTFLoader().parse(bytes.buffer, '', res, rej));
  e.gltf.set(asset.id, gltf);
  return gltf;
}

async function loadImg(src) {
  if (!src) return null;
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

// Clé de construction : ce qui oblige à refaire l'objet (le reste — rotation, lumière — est réglé à chaque rendu).
const buildKey = (s) => JSON.stringify([s.kind, s.shape, s.color, s.finish, s.text, s.font, s.icon, s.deviceId, s.deviceColor, s.screen, s.asset, s.mods]);

async function buildModel(e, id, spec, assets) {
  const key = buildKey(spec);
  const cur = e.models.get(id);
  if (cur && cur.key === key) return cur;
  if (cur) { try { cur.model.dispose(); } catch { /* ignore */ } if (cur.holder.parent) cur.holder.parent.remove(cur.holder); e.models.delete(id); }
  let model;
  if (spec.kind === 'device') {
    const { DeviceModel } = await import('../studio/models.js');
    model = new DeviceModel({ deviceId: spec.deviceId, color: spec.deviceColor || undefined }, { renderer: e.renderer });
    const img = await loadImg(assets[spec.screen] && assets[spec.screen].data).catch(() => null);
    if (img) {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      model.setPage('main', { canvas: c, cssW: c.width, cssH: c.height, sbBg: '#ffffff', sbFg: '#000000' });
    }
  } else if (spec.kind === 'image3d') {
    // Image (ou capture de la scène du Studio) posée sur une carte dans l'espace.
    const img = await loadImg(assets[spec.asset] && assets[spec.asset].data).catch(() => null);
    const root = new T.Group();
    const disp = [];
    if (img) {
      const tex = new T.Texture(img); tex.colorSpace = T.SRGBColorSpace; tex.needsUpdate = true;
      const h = 20; const w = h * (img.naturalWidth / img.naturalHeight);
      const mat = new T.MeshStandardMaterial({ map: tex, roughness: 0.5, transparent: true, side: T.DoubleSide });
      const m = new T.Mesh(new T.PlaneGeometry(w, h), mat);
      m.position.y = h / 2; m.castShadow = true;
      root.add(m);
      disp.push(tex, mat, m.geometry);
    }
    model = { root, dispose() { disp.forEach((d) => d.dispose()); if (root.parent) root.parent.remove(root); } };
  } else {
    const { DecorModel } = await import('../studio/decor.js');
    const gltf = spec.kind === 'glb' ? await loadGltf(e, assets[spec.asset]) : null;
    const kind = spec.kind === 'glb' ? 'glb' : spec.kind === 'text' ? 'texte3d' : spec.kind === 'icon' ? 'icone3d' : spec.shape;
    model = new DecorModel({
      kind, color: spec.color, finish: spec.finish, text: spec.text, font: spec.font, icon: spec.icon, fontSize: 6, depth: 1.8, bevel: 0.3, mods: spec.mods || undefined,
    }, { renderer: e.renderer, gltf });
    await model.ready;
  }
  model.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  const holder = new T.Group();
  holder.add(model.root);
  const entry = { key, model, holder };
  e.models.set(id, entry);
  return entry;
}

/* Rend le calque à w × h pixels ; renvoie un canevas 2D (fond transparent). */
export async function renderSpec(id, spec, assets, w, h) {
  const e = await getEngine();
  const s = { ...DEFAULT_SPEC, ...spec };
  const { model, holder } = await buildModel(e, id, s, assets || {});
  const { scene, camera, renderer, key, fill, amb, ground } = e;
  // Un seul objet dans la scène à la fois.
  for (const x of e.models.values()) if (x.holder !== holder && x.holder.parent === scene) scene.remove(x.holder);
  if (holder.parent !== scene) scene.add(holder);
  const pivot = model.root;
  holder.rotation.set(0, 0, 0);
  holder.position.set(0, 0, 0);
  pivot.position.set(0, 0, 0);
  holder.updateMatrixWorld(true);
  const c0 = new T.Box3().setFromObject(pivot).getCenter(new T.Vector3());
  // Rotation autour du centre de l'objet.
  pivot.position.set(-c0.x, -c0.y, -c0.z);
  holder.rotation.set(T.MathUtils.degToRad(s.rx), T.MathUtils.degToRad(s.ry), T.MathUtils.degToRad(s.rz), 'YXZ');
  holder.position.set(0, 0, 0);
  holder.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(holder);
  const sphere = box.getBoundingSphere(new T.Sphere());
  const R = Math.max(sphere.radius, 0.01);
  // Ombre de contact juste sous l'objet.
  ground.visible = s.shadow > 0.01;
  ground.material.opacity = s.shadow;
  ground.scale.setScalar(R * 8);
  ground.position.set(0, box.min.y - 0.001, 0);
  // Caméra : l'objet remplit le cadre (marge pour l'ombre).
  camera.fov = s.fov;
  camera.aspect = w / h;
  // On recule la caméra jusqu'à ce que les coins de la boîte de l'objet tiennent dans le cadre (marge pour l'ombre).
  const corners = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new T.Vector3(x, y, z));
  const target = 1 / (s.shadow > 0.01 ? 1.22 : 1.06);
  let dist = R / Math.sin(T.MathUtils.degToRad(s.fov) / 2);
  const q = new T.Vector3();
  for (let i = 0; i < 30; i++) {
    camera.position.set(0, R * 0.05, dist);
    camera.near = dist / 100; camera.far = dist * 10;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    let m = 0;
    for (const p of corners) { q.copy(p).project(camera); m = Math.max(m, Math.abs(q.x), Math.abs(q.y)); }
    if (Math.abs(m - target) < 0.004) break;
    dist *= Math.max(0.5, Math.min(2, m / target));
  }
  // Lumière : direction (angle autour de l'objet) et hauteur.
  const a = T.MathUtils.degToRad(s.light);
  const dir = new T.Vector3(Math.sin(a), 0.9 * s.lightHeight, Math.cos(a)).normalize();
  key.position.copy(dir.multiplyScalar(R * 6));
  key.target.position.set(0, 0, 0);
  key.intensity = 2.2 * s.intensity;
  const sc = key.shadow.camera;
  sc.left = -R * 2; sc.right = R * 2; sc.top = R * 2; sc.bottom = -R * 2; sc.near = R * 0.5; sc.far = R * 14;
  sc.updateProjectionMatrix();
  fill.position.set(-key.position.x, R * 2, R * 3);
  fill.intensity = 0.6 * s.ambient;
  amb.intensity = 0.5 * s.ambient;
  scene.environmentIntensity = 0.9 * s.env;
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.render(scene, camera);
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  out.getContext('2d').drawImage(renderer.domElement, 0, 0);
  return out;
}

export function disposeLayer(id) {
  if (!engine) return;
  const cur = engine.models.get(id);
  if (cur) { try { cur.model.dispose(); } catch { /* ignore */ } if (cur.holder.parent) cur.holder.parent.remove(cur.holder); engine.models.delete(id); }
}

// ------------------------------------------------------------------ calque Fabric
const blank = (w = 2, h = 2) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

export class Layer3D extends FabricImage {
  static type = 'Layer3D';

  constructor(element, options = {}) {
    super(element || blank(), options);
    this.spec = { ...DEFAULT_SPEC, ...(options.spec || {}) };
  }

  toObject(props = []) {
    const o = super.toObject([...props, 'spec']);
    // L'image se recalcule à partir de la description : on ne la stocke pas (sauf petit aperçu).
    o.src = '';
    return o;
  }

  static async fromObject(obj) {
    const { spec, src, ...rest } = obj;
    void src;
    const l = new Layer3D(blank(spec ? spec.w : 2, spec ? spec.h : 2), { ...rest, spec });
    l.needsRender = true;
    return l;
  }
}
classRegistry.setClass(Layer3D);

/* Rend le calque à sa taille affichée (×2, plafonné) ; garde sa place et sa taille à l'écran. */
export async function refreshLayer(layer, assets, { fast = false, scale = 0 } = {}) {
  const dispW = layer.width * layer.scaleX;
  const dispH = layer.height * layer.scaleY;
  const k = fast ? 0.75 : Math.max(2, scale || 0);
  const cap = fast ? 900 : scale ? 4096 : 3000;
  let w = Math.max(16, Math.round(dispW * k));
  let h = Math.max(16, Math.round(dispH * k));
  const m = Math.max(w, h);
  if (m > cap) { w = Math.round((w * cap) / m); h = Math.round((h * cap) / m); }
  const c = await renderSpec(layer.id || 'l', layer.spec, assets, w, h);
  const center = layer.getCenterPoint();
  layer.setElement(c);
  layer.set({ width: w, height: h, scaleX: dispW / w, scaleY: dispH / h });
  layer.setPositionByOrigin(center, 'center', 'center');
  layer.spec.w = w; layer.spec.h = h;
  layer.needsRender = false;
  layer.setCoords();
  layer.dirty = true;
  return layer;
}
