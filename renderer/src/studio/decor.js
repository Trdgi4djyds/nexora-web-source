/* Décors du Studio : socles, formes, textes en relief, icônes, particules, lumières, images et modèles importés (.glb). */
import * as T from './three.js';
import { textTexture } from './textures.js';
import { vectorCanvas } from './vector.js';
import { extrudeVector, applyModifiers, hasModifiers } from './geom3d.js';
import {
  FINISHES, finishMaterial, proceduralMaps, imageMaps, boxUv,
} from './materials.js';
import {
  shapeGeometry, textGeometry, iconGeometry, confettiMesh, fontReady, preloadFont3d,
} from './shapes3d.js';

export { FINISHES };

// group : rubrique du menu « Ajouter ».
export const DECORS = {
  podium: { label: 'Podium', icon: 'target', group: 'socles' },
  podium2: { label: 'Podium double', icon: 'layers', group: 'socles' },
  socle: { label: 'Socle', icon: 'cube', group: 'socles' },
  marches: { label: 'Marches', icon: 'layers', group: 'socles' },
  arche: { label: 'Arche', icon: 'sphere', group: 'socles' },
  anneau: { label: 'Anneau', icon: 'sphere', group: 'socles' },
  mur: { label: 'Mur de fond', icon: 'image', group: 'socles' },
  panneau: { label: 'Panneau', icon: 'frame', group: 'socles' },
  plan: { label: 'Plan', icon: 'grid', group: 'socles' },
  sphere: { label: 'Sphère', icon: 'sphere', group: 'formes' },
  demisphere: { label: 'Dôme', icon: 'sphere', group: 'formes' },
  cube: { label: 'Cube', icon: 'cube', group: 'formes' },
  cylindre: { label: 'Cylindre', icon: 'layers', group: 'formes' },
  cone: { label: 'Cône', icon: 'spot', group: 'formes' },
  pyramide: { label: 'Pyramide', icon: 'spot', group: 'formes' },
  prisme: { label: 'Prisme', icon: 'shapes', group: 'formes' },
  tore: { label: 'Tore', icon: 'sphere', group: 'formes' },
  noeud: { label: 'Nœud', icon: 'sync', group: 'formes' },
  capsule: { label: 'Capsule', icon: 'sphere', group: 'formes' },
  pilule: { label: 'Pilule', icon: 'sphere', group: 'formes' },
  spheres: { label: 'Sphères', icon: 'sphere', group: 'formes' },
  gemme: { label: 'Gemme', icon: 'sparkle', group: 'deco' },
  diamant: { label: 'Polyèdre', icon: 'sparkle', group: 'deco' },
  blob: { label: 'Forme organique', icon: 'shapes', group: 'deco' },
  nuage: { label: 'Nuage', icon: 'cloud', group: 'deco' },
  spirale: { label: 'Spirale', icon: 'sync', group: 'deco' },
  etoile: { label: 'Étoile', icon: 'star', group: 'deco' },
  coeur: { label: 'Cœur', icon: 'heart', group: 'deco' },
  fleche: { label: 'Flèche', icon: 'forward', group: 'deco' },
  bulle: { label: 'Bulle', icon: 'chat', group: 'deco' },
  confettis: { label: 'Confettis', icon: 'sparkle', group: 'deco' },
  texte3d: { label: 'Texte 3D', icon: 'text', group: 'texte' },
  texte: { label: 'Texte plat', icon: 'text', group: 'texte' },
  icone3d: { label: 'Icône 3D', icon: 'star', group: 'texte' },
  lumiere: { label: 'Lumière', icon: 'bulb', group: 'lumieres' },
  image: { label: 'Image', icon: 'image', group: 'import' },
  video: { label: 'Vidéo', icon: 'video', group: 'import' },
  sequence: { label: 'Séquence d’images', icon: 'layers', group: 'import' },
  vecteur: { label: 'Forme 2D', icon: 'shapes', group: 'vecteurs' },
  glb: { label: 'Modèle 3D', icon: 'cube', group: 'import' },
};

export const DECOR_GROUPS = {
  socles: 'Socles et fonds', formes: 'Formes', deco: 'Déco', texte: 'Texte et icônes', lumieres: 'Lumières', vecteurs: 'Formes 2D',
};

export const LIGHT_TYPES = {
  point: ['Ampoule', 'bulb'], spot: ['Projecteur', 'spot'], dir: ['Soleil', 'sun'], area: ['Panneau lumineux', 'frame'], hemi: ['Ciel et sol', 'cloud'],
};

let areaReady = false;

function shadowy(o) {
  o.traverse((m) => { if (m.isMesh && !m.userData.editorOnly) { m.castShadow = true; m.receiveShadow = true; } });
  return o;
}

// Éléments visibles seulement pendant l'édition (repères des lumières).
function editorOnly(o) {
  o.traverse((m) => { m.userData.editorOnly = true; m.castShadow = false; m.receiveShadow = false; });
  return o;
}

export class DecorModel {
  constructor(item, { renderer, gltf = null, onChange = null } = {}) {
    this.item = item;
    this.renderer = renderer;
    this.root = new T.Group();
    this.root.name = 'décor';
    this.disposables = [];
    this.gltf = gltf;
    this.onChange = onChange;
    this.ready = Promise.resolve();
    this.build();
  }

  track(o) { this.disposables.push(o); return o; }

  material() {
    const it = this.item;
    const tx = it.tex || {};
    let maps = null;
    if (tx.kind === 'image' && it.texImageEl) maps = imageMaps(it.texImageEl, tx.scale || 1);
    else if (tx.kind && tx.kind !== 'none') maps = proceduralMaps(tx.kind, { color: it.color || '#f2f2f5', color2: tx.color2 || '#1d1d1f', scale: tx.scale || 1 });
    if (maps) for (const k of ['map', 'bump', 'rough']) if (maps[k]) this.track(maps[k]);
    return this.track(finishMaterial(it.color || '#f2f2f5', it.finish, it.mat, maps));
  }

  build() {
    const it = this.item;
    const mat = this.material();
    const textured = it.tex && it.tex.kind && it.tex.kind !== 'none';
    const add = (geo, y = 0, x = 0, z = 0, m = mat) => {
      this.track(geo);
      if (textured && !geo.attributes.uv) boxUv(geo);
      const mesh = new T.Mesh(geo, m);
      mesh.position.set(x, y, z);
      this.root.add(mesh);
      return mesh;
    };
    const simple = shapeGeometry(it.kind, it);
    if (simple && it.kind !== 'cube') {
      const [geo, y] = simple;
      if (textured && ['etoile', 'coeur', 'fleche', 'bulle', 'nuage', 'blob'].includes(it.kind)) boxUv(geo);
      add(geo, y);
    }
    switch (it.kind) {
      case 'podium': add(new T.CylinderGeometry(12, 12.3, 2.6, 128), 1.3); break;
      case 'podium2': add(new T.CylinderGeometry(14, 14.3, 2.2, 128), 1.1); add(new T.CylinderGeometry(9.5, 9.7, 2.2, 128), 3.3); break;
      case 'socle': add(new T.RoundedBoxGeometry(22, 7, 22, 5, 0.9), 3.5); break;
      case 'marches':
        add(new T.RoundedBoxGeometry(34, 3.2, 26, 4, 0.5), 1.6);
        add(new T.RoundedBoxGeometry(26, 3.2, 20, 4, 0.5), 4.8, 0, -2);
        add(new T.RoundedBoxGeometry(18, 3.2, 14, 4, 0.5), 8, 0, -4);
        break;
      case 'arche': add(new T.TorusGeometry(17, 1.4, 48, 160, Math.PI), 0, 0, -6); break;
      case 'anneau': { const m = add(new T.TorusGeometry(9, 0.8, 48, 160), 9.8); m.rotation.y = 0.5; break; }
      case 'spheres':
        add(new T.SphereGeometry(3.2, 64, 48), 3.2, -9, 2);
        add(new T.SphereGeometry(1.9, 64, 48), 1.9, 8.5, 4);
        add(new T.SphereGeometry(1.2, 48, 32), 9, 11, -3);
        break;
      case 'cube': add(new T.RoundedBoxGeometry(8, 8, 8, 5, it.round ?? 1.2), 4); break;
      case 'capsule': { const m = add(new T.CapsuleGeometry(2.4, 7, 12, 48), 2.4); m.rotation.z = Math.PI / 2; break; }
      case 'mur': { const m = add(new T.PlaneGeometry(90, 55), 27.5, 0, -18); m.castShadow = false; break; }
      case 'texte': {
        const c = textTexture({
          text: it.text || 'Votre texte', color: it.color || '#1d1d1f', weight: it.weight || 700, size: 160,
        });
        const tex = this.track(new T.CanvasTexture(c));
        tex.colorSpace = T.SRGBColorSpace;
        tex.anisotropy = 8;
        const h = (it.fontSize || 4) * (c.height / 160);
        const w = h * (c.width / c.height);
        const m = this.track(new T.MeshBasicMaterial({
          map: tex, transparent: true, side: T.DoubleSide, toneMapped: false, depthWrite: false,
        }));
        const mesh = add(new T.PlaneGeometry(w, h), h / 2, 0, 0, m);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        break;
      }
      case 'texte3d': {
        const font = fontReady(it.font || 'inter');
        if (!font) {
          // Police en cours de chargement : le texte apparaît dès qu'elle est prête.
          this.ready = preloadFont3d(it.font || 'inter').then(() => this.rebuild()).catch((e) => console.warn(e));
          break;
        }
        const geo = textGeometry(font, it.text || 'NEXORA', {
          size: it.fontSize || 6, depth: it.depth ?? 1.6, bevel: it.bevel ?? 0.25, align: it.align || 'center', letterSpacing: it.spacing || 0,
        });
        if (textured) boxUv(geo, 0.12);
        add(geo, 0);
        break;
      }
      case 'icone3d': add(iconGeometry(it.icon || 'star', { size: it.size || 10, thickness: it.thickness || 1 }), 0); break;
      case 'confettis': {
        if (it.colorful !== false) mat.color.set('#ffffff');
        const { group, geos } = confettiMesh(it, mat);
        geos.forEach((g) => this.track(g));
        this.root.add(group);
        break;
      }
      case 'lumiere': this.buildLight(); break;
      case 'image': {
        const img = it.imageEl;
        if (!img) break;
        const tex = this.track(new T.Texture(img));
        tex.colorSpace = T.SRGBColorSpace;
        tex.needsUpdate = true;
        const h = it.height || 20;
        const w = h * ((img.naturalWidth || img.width) / (img.naturalHeight || img.height));
        const m = this.track(new T.MeshStandardMaterial({ map: tex, roughness: 0.6, side: T.DoubleSide, transparent: true }));
        add(new T.PlaneGeometry(w, h), h / 2, 0, 0, m);
        break;
      }
      case 'vecteur': {
        // Forme 2D en volume : extrusion, biseau et retrait intérieur, avec la matière choisie.
        if (Number(it.extrude) > 0 && it.shape !== 'line') {
          const geo = extrudeVector(it);
          if (geo) {
            const m = this.track(finishMaterial(it.fill || '#0a84ff', it.finish || 'satin', it.mat, null));
            add(geo, Math.max(0.5, it.h || 12) / 2 + (Number(it.bevel3d) || 0) * 0.85, 0, 0, m);
            break;
          }
        }
        // Forme vectorielle redessinée à haute définition à chaque modification (nette à toutes les tailles).
        const { canvas, w, h } = vectorCanvas(it);
        const tex = this.track(new T.CanvasTexture(canvas));
        tex.colorSpace = T.SRGBColorSpace;
        tex.anisotropy = 8;
        const m = this.track(new T.MeshBasicMaterial({
          map: tex, transparent: true, side: T.DoubleSide, toneMapped: false, depthWrite: false,
        }));
        const mesh = add(new T.PlaneGeometry(w, h), h / 2, 0, 0, m);
        mesh.renderOrder = it.layer || 0;
        break;
      }
      case 'video':
      case 'sequence': {
        // Vidéo ou suite d'images sur un panneau ; l'image affichée suit la frise (voir media.js).
        const src = it.kind === 'video' ? it.videoEl : (it.seqFrames && it.seqFrames[0]);
        const aspect = it.aspect || (src && (src.videoWidth || src.naturalWidth) ? (src.videoWidth || src.naturalWidth) / (src.videoHeight || src.naturalHeight) : 16 / 9);
        let tex;
        if (it.kind === 'video' && it.videoEl) tex = this.track(new T.VideoTexture(it.videoEl));
        else if (src) { tex = this.track(new T.Texture(src)); tex.needsUpdate = true; }
        if (tex) tex.colorSpace = T.SRGBColorSpace;
        this.mediaTex = tex || null;
        const h = it.height || 20;
        const w = h * aspect;
        const m = this.track(new T.MeshBasicMaterial({
          map: tex || null, color: tex ? '#ffffff' : '#20232b', side: T.DoubleSide, toneMapped: false, transparent: true,
        }));
        const mesh = add(new T.PlaneGeometry(w, h, 1, 1), h / 2, 0, 0, m);
        mesh.castShadow = false;
        if (it.radius) {
          // Coins arrondis : masque dessiné.
          const c = document.createElement('canvas');
          c.width = 512; c.height = Math.max(2, Math.round(512 / aspect));
          const g = c.getContext('2d');
          g.fillStyle = '#fff';
          g.beginPath(); g.roundRect(0, 0, c.width, c.height, (it.radius / h) * c.height); g.fill();
          m.alphaMap = this.track(new T.CanvasTexture(c));
        }
        break;
      }
      case 'glb': {
        if (!this.gltf) break;
        const scene = this.gltf.scene.clone(true);
        // Mise à l'échelle : la plus grande dimension vaut 20 cm, posée au sol.
        const box = new T.Box3().setFromObject(scene);
        const size = box.getSize(new T.Vector3());
        const k = 20 / Math.max(size.x, size.y, size.z, 1e-6);
        scene.scale.setScalar(k);
        const box2 = new T.Box3().setFromObject(scene);
        const c = box2.getCenter(new T.Vector3());
        scene.position.set(-c.x, -box2.min.y, -c.z);
        if (it.recolor) scene.traverse((m) => { if (m.isMesh) m.material = mat; });
        this.root.add(scene);
        break;
      }
      default: break;
    }
    const solidVector = it.kind === 'vecteur' && Number(it.extrude) > 0 && it.shape !== 'line';
    // Modificateurs (courbure, torsion, effilement, gonflement, subdivision) : objets en volume uniquement.
    if (hasModifiers(it.mods) && !['lumiere', 'texte', 'image', 'video', 'sequence', 'confettis'].includes(it.kind) && (it.kind !== 'vecteur' || solidVector)) {
      try { applyModifiers(this.root, it.mods, (g) => this.track(g)); } catch (err) { console.warn('[modificateurs]', err); }
    }
    if (it.kind !== 'lumiere') shadowy(this.root);
    if (['texte', 'mur', 'plan', 'video', 'sequence'].includes(it.kind) || (it.kind === 'vecteur' && !solidVector)) this.root.traverse((m) => { if (m.isMesh) m.castShadow = false; });
    if (['video', 'sequence', 'texte'].includes(it.kind) || (it.kind === 'vecteur' && !solidVector)) this.root.traverse((m) => { if (m.isMesh) m.receiveShadow = false; });
    // Opacité de l'objet (et base des fondus du montage).
    this.root.traverse((m) => {
      if (!m.isMesh || m.userData.editorOnly) return;
      for (const mt of [].concat(m.material || [])) { mt.userData.baseOpacity = mt.opacity ?? 1; if ((it.opacity ?? 1) < 1) { mt.transparent = true; mt.opacity = mt.userData.baseOpacity * it.opacity; } }
    });
    if (it.noShadow) this.root.traverse((m) => { if (m.isMesh) m.castShadow = false; });
  }

  // Lumière placée dans la scène ; son repère (ampoule, cône, panneau) n'apparaît pas dans les exports.
  buildLight() {
    const it = this.item;
    const type = it.lightType || 'point';
    const color = new T.Color(it.color || '#ffffff');
    const I = it.intensity ?? ({ point: 1, spot: 1, dir: 1, area: 1, hemi: 1 }[type]);
    let light;
    const glow = this.track(new T.MeshBasicMaterial({ color }));
    const wire = this.track(new T.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.35, toneMapped: false }));
    const helper = new T.Group();
    if (type === 'point') {
      light = new T.PointLight(color, I * 1600, it.distance || 0, 2);
      helper.add(new T.Mesh(this.track(new T.SphereGeometry(0.9, 24, 16)), glow));
    } else if (type === 'spot') {
      light = new T.SpotLight(color, I * 4000, it.distance || 0, T.MathUtils.degToRad(it.angle || 30), it.penumbra ?? 0.4, 2);
      light.target.position.set(0, 0, 10);
      this.root.add(light.target);
      const cone = new T.Mesh(this.track(new T.ConeGeometry(Math.tan(T.MathUtils.degToRad(it.angle || 30)) * 6, 6, 24, 1, true)), wire);
      cone.rotation.x = -Math.PI / 2;
      cone.position.z = 3;
      helper.add(cone, new T.Mesh(this.track(new T.SphereGeometry(0.8, 20, 14)), glow));
    } else if (type === 'dir') {
      light = new T.DirectionalLight(color, I * 2.2);
      light.target.position.set(0, 0, 10);
      this.root.add(light.target);
      const sun = new T.Mesh(this.track(new T.SphereGeometry(1.4, 24, 16)), glow);
      const ray = new T.Mesh(this.track(new T.CylinderGeometry(0.08, 0.08, 8, 6)), wire);
      ray.rotation.x = Math.PI / 2; ray.position.z = 4;
      helper.add(sun, ray);
    } else if (type === 'area') {
      if (!areaReady) { T.RectAreaLightUniformsLib.init(); areaReady = true; }
      const w = it.width || 20; const h = it.height || 12;
      light = new T.RectAreaLight(color, I * 3.5, w, h);
      light.rotation.y = Math.PI; // Le panneau éclaire vers l'avant de l'objet (+Z).
      const panel = new T.Mesh(this.track(new T.PlaneGeometry(w, h)), this.track(new T.MeshBasicMaterial({ color, side: T.DoubleSide, transparent: !it.visiblePanel, opacity: it.visiblePanel ? 1 : 0.4 })));
      helper.add(panel);
      if (it.visiblePanel) { panel.userData.keep = true; }
    } else {
      light = new T.HemisphereLight(color, new T.Color(it.color2 || '#d9c7b0'), I * 1.4);
      helper.add(new T.Mesh(this.track(new T.SphereGeometry(1.4, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2)), glow));
    }
    if (light.shadow && it.castShadow !== false && (type === 'spot' || type === 'dir' || type === 'point')) {
      light.castShadow = true;
      light.shadow.mapSize.set(2048, 2048);
      light.shadow.bias = -0.0004;
      light.shadow.normalBias = 0.03;
      light.shadow.radius = 6;
      if (type === 'dir') {
        const c = light.shadow.camera; c.left = -60; c.right = 60; c.top = 60; c.bottom = -60; c.near = 1; c.far = 400;
      }
    }
    light.userData.studioLight = true;
    this.light = light;
    this.root.add(light);
    editorOnly(helper);
    // Un panneau lumineux peut rester visible à l'export (bandeau de studio).
    helper.traverse((m) => { if (m.userData.keep) m.userData.editorOnly = false; });
    this.root.add(helper);
  }

  // Opacité d'ensemble (fondus du montage) : multiplie l'opacité propre de chaque matière.
  setFade(f) {
    const k = Math.max(0, Math.min(1, f)) * (this.item.opacity ?? 1);
    if (this.lastFade === k) return;
    this.lastFade = k;
    this.root.traverse((m) => {
      if (!m.isMesh || m.userData.editorOnly) return;
      for (const mt of [].concat(m.material || [])) {
        const base = mt.userData.baseOpacity ?? 1;
        mt.transparent = k < 1 || mt.transparent;
        mt.opacity = base * k;
      }
    });
  }

  // Reconstruit les maillages (par exemple quand une police vient d'être chargée).
  rebuild() {
    for (const d of this.disposables) { try { d.dispose(); } catch { /* ignore */ } }
    this.disposables = [];
    for (const c of [...this.root.children]) this.root.remove(c);
    this.build();
    if (this.onChange) this.onChange(this);
  }

  // Écran d'un modèle importé : maillage nommé « screen », « écran » ou « display ».
  screenMesh() {
    let found = null;
    this.root.traverse((o) => { if (!found && o.isMesh && /screen|écran|ecran|display/i.test(o.name || '')) found = o; });
    return found;
  }

  dispose() {
    for (const d of this.disposables) { try { d.dispose(); } catch { /* ignore */ } }
    this.disposables = [];
    if (this.light && this.light.shadow && this.light.shadow.map) this.light.shadow.map.dispose();
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}
