/* Scène 3D du Studio : rendu, caméra, environnement, arrière-plans, sol, éclairages. */
import * as T from './three.js';
import { gradientTexture } from './textures.js';

export const BACKGROUNDS = {
  studio: 'Studio', color: 'Couleur', gradient: 'Dégradé', image: 'Image', env: 'Pièce', transparent: 'Transparent',
};
export const FLOORS = { shadow: 'Ombre', glossy: 'Brillant', none: 'Aucun' };
export const LIGHTS = {
  studio: 'Studio', doux: 'Doux', contraste: 'Contrasté', coucher: 'Golden hour', neon: 'Néon',
};
export const ASPECTS = {
  free: 'Libre', '16:9': '16:9', '9:16': '9:16', '1:1': '1:1', '4:5': '4:5',
};

export const DEFAULT_ENV = {
  bg: 'studio', bgColor: '#0a0a0c', bgColor2: '#050506', floor: 'shadow', light: 'studio', envIntensity: 1, shadow: 0.28, exposure: 1, aspect: 'free',
  rig: 1, lightAngle: 0, lightHeight: 1, warmth: 0, floorColor: '', floorRough: 0.14, fog: null, fx: null,
};

export const FOGS = { none: 'Aucun', linear: 'Léger', exp: 'Dense' };

// Ambiances : arrière-plan, sol, éclairage, brouillard et effets réglés d'un coup.
export const AMBIANCES = {
  apple: ['Studio clair', { bg: 'studio', bgColor: '#f2f3f6', floor: 'shadow', light: 'doux', exposure: 1.05, fog: null, fx: { vignette: true, vignetteAmount: 0.25 } }],
  noir: ['Nuit élégante', { bg: 'gradient', bgColor: '#23262f', bgColor2: '#07080b', floor: 'glossy', light: 'contraste', exposure: 1, fog: { mode: 'exp', color: '#07080b', density: 0.25 }, fx: { vignette: true, vignetteAmount: 0.6 } }],
  neon: ['Néon', { bg: 'color', bgColor: '#0b0718', floor: 'glossy', light: 'neon', exposure: 1.1, fog: { mode: 'exp', color: '#0b0718', density: 0.3 }, fx: { bloom: true, bloomStrength: 0.7, bloomRadius: 0.3, bloomThreshold: 1.05, vignette: true, vignetteAmount: 0.5 } }],
  sunset: ['Golden hour', { bg: 'gradient', bgColor: '#ffd8b0', bgColor2: '#e58a6a', floor: 'shadow', light: 'coucher', exposure: 1.05, fog: { mode: 'linear', color: '#f3c3a0', density: 0.3 }, fx: { bloom: true, bloomStrength: 0.35, bloomRadius: 0.25, bloomThreshold: 1.05, grain: true, grainAmount: 0.15 } }],
  pastel: ['Pastel', { bg: 'studio', bgColor: '#f6e6f1', floor: 'shadow', light: 'doux', exposure: 1.08, fog: null, fx: null }],
  menthe: ['Menthe', { bg: 'studio', bgColor: '#dcefe7', floor: 'shadow', light: 'studio', exposure: 1.02, fog: null, fx: { vignette: true, vignetteAmount: 0.2 } }],
  brume: ['Brume', { bg: 'color', bgColor: '#dfe3ea', floor: 'shadow', light: 'doux', exposure: 1, fog: { mode: 'exp', color: '#dfe3ea', density: 0.45 }, fx: null }],
  cinema: ['Cinéma', { bg: 'gradient', bgColor: '#2c3340', bgColor2: '#0d0f14', floor: 'glossy', light: 'contraste', exposure: 0.95, fog: { mode: 'linear', color: '#0d0f14', density: 0.4 }, fx: { vignette: true, vignetteAmount: 0.75, grain: true, grainAmount: 0.3, bloom: true, bloomStrength: 0.3, bloomRadius: 0.2, bloomThreshold: 1.05 } }],
  piece: ['Pièce réelle', { bg: 'env', floor: 'shadow', light: 'studio', exposure: 1, fog: null, fx: null }],
};

// Fond « cyclorama » : sol qui remonte en arrondi vers un mur, sans arête visible.
function cycloramaGeometry() {
  const prof = [];
  const R = 70;
  for (let z = 260; z > -60; z -= 20) prof.push([0, z]);
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * (Math.PI / 2);
    prof.push([R - Math.cos(a) * R, -60 - Math.sin(a) * R]);
  }
  for (let y = R + 20; y <= 420; y += 40) prof.push([y, -60 - R]);
  const W = 900;
  const nx = 2;
  const pos = [];
  const idx = [];
  for (let j = 0; j < prof.length; j++) {
    for (let i = 0; i <= nx; i++) pos.push(-W / 2 + (W * i) / nx, prof[j][0], prof[j][1]);
  }
  for (let j = 0; j < prof.length - 1; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Reflet réel sur le sol brillant : miroir atténué, légèrement flou, qui s'efface avec la distance.
const FloorReflectShader = {
  name: 'VitrineFloorReflect',
  uniforms: {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, opacity: { value: 0.35 }, blur: { value: 1.5 }, fade: { value: 90 }, texel: { value: 1 / 1024 },
  },
  vertexShader: `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4( position, 1.0 );
      vWorld = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float opacity;
    uniform float blur;
    uniform float fade;
    uniform float texel;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <logdepthbuf_pars_fragment>
    void main() {
      #include <logdepthbuf_fragment>
      vec2 uv = vUv.xy / vUv.w;
      float d = blur * texel;
      vec4 c = texture2D( tDiffuse, uv ) * 0.36;
      c += texture2D( tDiffuse, uv + vec2( d, 0.0 ) ) * 0.16;
      c += texture2D( tDiffuse, uv - vec2( d, 0.0 ) ) * 0.16;
      c += texture2D( tDiffuse, uv + vec2( 0.0, d ) ) * 0.16;
      c += texture2D( tDiffuse, uv - vec2( 0.0, d ) ) * 0.16;
      float f = 1.0 - smoothstep( fade * 0.15, fade, length( vWorld.xz ) );
      gl_FragColor = vec4( c.rgb * color, opacity * f );
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

// Boîtes à lumière ajoutées à l'environnement de reflets : deux bandes verticales sur les côtés (filets
// lumineux sur les arêtes) et un grand panneau au plafond. Rien derrière la caméra : pas d'éblouissement
// sur les écrans vus de face.
function addStudioSoftboxes(scene) {
  const lightMat = (k) => { const m = new T.MeshBasicMaterial({ side: T.DoubleSide }); m.color.setScalar(k); return m; };
  const strip = (x, z) => {
    const m = new T.Mesh(new T.PlaneGeometry(1.6, 17), lightMat(32));
    m.position.set(x, 9, z);
    m.lookAt(0, 6, 0);
    scene.add(m);
  };
  strip(-12.5, 4);
  strip(12, 4);
  const top = new T.Mesh(new T.PlaneGeometry(13, 7), lightMat(6));
  top.position.set(0, 24, 3);
  top.lookAt(0, 0, 3);
  scene.add(top);
  const rim = new T.Mesh(new T.PlaneGeometry(10, 4), lightMat(6));
  rim.position.set(0, 10, -12);
  rim.lookAt(0, 6, 0);
  scene.add(rim);
}

export class StudioScene {
  constructor(canvas) {
    this.canvas = canvas;
    const r = new T.WebGLRenderer({
      canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance',
    });
    r.outputColorSpace = T.SRGBColorSpace;
    r.toneMapping = T.NeutralToneMapping;
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = !document.body.classList.contains('lite');
    r.shadowMap.type = T.PCFSoftShadowMap; // ombres douces (moins crénelées) sur toute la scène
    r.setPixelRatio(document.body.classList.contains('lite') ? 1 : Math.min(2, window.devicePixelRatio || 1));
    this.renderer = r;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(32, 1, 0.5, 3000);
    this.camera.position.set(0, 14, 62);
    this.content = new T.Group();
    this.content.name = 'contenu';
    this.scene.add(this.content);

    const pm = new T.PMREMGenerator(r);
    // Pièce neutre + boîtes à lumière de studio photo : ce sont leurs reflets nets (filets clairs sur les
    // cadres métal, dégradés sur le verre) qui donnent l'aspect « vraie photo produit » au lieu du plastique.
    const room = new T.RoomEnvironment();
    addStudioSoftboxes(room);
    this.envTex = pm.fromScene(room, 0.04).texture;
    pm.dispose();
    this.scene.environment = this.envTex;

    // Lumières
    this.key = new T.DirectionalLight(0xffffff, 2.4);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.03;
    this.key.shadow.radius = 4;
    this.scene.add(this.key, this.key.target);
    this.fill = new T.DirectionalLight(0xdfe8ff, 0.6);
    this.rim = new T.DirectionalLight(0xffffff, 1);
    this.scene.add(this.fill, this.rim);
    this.p1 = new T.PointLight(0xff2d95, 0, 0, 2);
    this.p2 = new T.PointLight(0x00e5ff, 0, 0, 2);
    this.scene.add(this.p1, this.p2);

    // Sol et fond
    this.shadowFloor = new T.Mesh(new T.PlaneGeometry(1200, 1200), new T.ShadowMaterial({ opacity: 0.28 }));
    this.shadowFloor.rotation.x = -Math.PI / 2;
    this.shadowFloor.receiveShadow = true;
    this.scene.add(this.shadowFloor);
    this.glossFloor = new T.Mesh(new T.CircleGeometry(600, 96), new T.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0, specularIntensity: 0.4, envMapIntensity: 0.5 }));
    this.glossFloor.rotation.x = -Math.PI / 2;
    this.glossFloor.position.y = -0.02;
    this.glossFloor.receiveShadow = true;
    this.scene.add(this.glossFloor);
    this.reflector = new T.Reflector(new T.CircleGeometry(600, 96), {
      clipBias: 0.003, textureWidth: 1024, textureHeight: 1024, color: 0xffffff, shader: FloorReflectShader, multisample: 4,
    });
    this.reflector.rotation.x = -Math.PI / 2;
    this.reflector.position.y = -0.01;
    this.reflector.material.transparent = true;
    this.reflector.material.depthWrite = false;
    this.reflector.renderOrder = -1;
    this.reflector.visible = false;
    this.scene.add(this.reflector);
    this.cyclo = new T.Mesh(cycloramaGeometry(), new T.MeshPhysicalMaterial({ color: 0xeceef3, roughness: 0.92, metalness: 0, specularIntensity: 1 }));
    this.cyclo.receiveShadow = true;
    this.cyclo.position.y = -0.03;
    this.scene.add(this.cyclo);
    this.bgTexture = null;
    this.bgImage = null;
    this.env = { ...DEFAULT_ENV };
    this.fx = null;
    this.fog = { mode: 'none' };
    this.size = { w: 1, h: 1 };
  }

  setSize(w, h) {
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.fitBackgroundImage(w / Math.max(1, h));
  }

  applyEnv(env, bgImage) {
    this.env = { ...DEFAULT_ENV, ...env };
    const e = this.env;
    const r = this.renderer;
    r.toneMappingExposure = e.exposure;
    this.scene.environmentIntensity = e.envIntensity * ({
      studio: 0.9, doux: 1.25, contraste: 0.45, coucher: 0.6, neon: 0.35,
    }[e.light] || 1);
    if (this.bgTexture) { this.bgTexture.dispose(); this.bgTexture = null; }
    this.scene.background = null;
    this.scene.backgroundBlurriness = 0;
    r.setClearColor(0x000000, 0);
    this.cyclo.visible = false;
    const bgCol = new T.Color(e.bgColor);
    if (e.bg === 'studio') {
      this.cyclo.visible = true;
      this.cyclo.material.color.set(e.bgColor);
      // Fond sombre : le décor reflète moins l'éclairage d'ambiance, pour rester vraiment noir.
      const lum = bgCol.r * 0.2126 + bgCol.g * 0.7152 + bgCol.b * 0.0722;
      this.cyclo.material.specularIntensity = lum < 0.02 ? 0.4 : lum < 0.1 ? 0.65 : 1;
      this.scene.background = bgCol;
    } else if (e.bg === 'color') {
      this.scene.background = bgCol;
    } else if (e.bg === 'gradient') {
      this.bgTexture = new T.CanvasTexture(gradientTexture(e.bgColor, e.bgColor2, 'radial'));
      this.bgTexture.colorSpace = T.SRGBColorSpace;
      this.scene.background = this.bgTexture;
    } else if (e.bg === 'image' && bgImage) {
      this.bgImage = bgImage;
      this.bgTexture = new T.Texture(bgImage);
      this.bgTexture.colorSpace = T.SRGBColorSpace;
      this.bgTexture.needsUpdate = true;
      this.scene.background = this.bgTexture;
      this.fitBackgroundImage(this.size.w / Math.max(1, this.size.h));
    } else if (e.bg === 'env') {
      this.scene.background = this.envTex;
      this.scene.backgroundBlurriness = 0.55;
      this.scene.backgroundIntensity = 0.9;
    }
    // Sol
    this.shadowFloor.visible = e.floor !== 'none' && !(e.bg === 'studio' && e.floor === 'shadow');
    this.shadowFloor.material.opacity = e.shadow;
    this.glossFloor.visible = e.floor === 'glossy';
    this.glossFloor.material.color.set(e.bg === 'gradient' ? e.bgColor2 : e.bg === 'studio' || e.bg === 'color' ? e.bgColor : '#e9e9ee');
    if (e.floor === 'glossy') this.shadowFloor.visible = true;
    // Le cyclorama reçoit lui-même l'ombre ; son intensité suit le réglage.
    this.cyclo.material.needsUpdate = true;
    if (e.floorColor) this.glossFloor.material.color.set(e.floorColor);
    // Sol brillant : la rugosité règle à la fois le flou et la force du reflet réel.
    const fr = e.floorRough ?? 0.14;
    this.glossFloor.material.roughness = 0.2 + fr * 0.6;
    this.reflector.visible = e.floor === 'glossy';
    const u = this.reflector.material.uniforms;
    u.opacity.value = (e.reflect ?? 0.5) * (1 - fr * 0.85);
    u.blur.value = 0.5 + fr * 9;
    this.applyLights(e.light);
    // Réglages fins de l'éclairage de base : intensité, orientation, hauteur, chaleur.
    const k = e.rig ?? 1;
    for (const l of [this.key, this.fill, this.rim, this.p1, this.p2]) l.intensity *= k;
    if (e.warmth) {
      const warm = new T.Color(e.warmth > 0 ? '#ffb070' : '#7fb0ff');
      for (const l of [this.key, this.rim]) l.color.lerp(warm, Math.abs(e.warmth) * 0.6);
    }
    if (e.lightAngle || (e.lightHeight ?? 1) !== 1) {
      const a = T.MathUtils.degToRad(e.lightAngle || 0);
      for (const l of [this.key, this.fill, this.rim, this.p1, this.p2]) {
        const p = l.position;
        const x = p.x * Math.cos(a) + p.z * Math.sin(a);
        const z = -p.x * Math.sin(a) + p.z * Math.cos(a);
        p.set(x, p.y * (e.lightHeight ?? 1), z);
      }
      this.keyDir = this.key.position.clone().normalize();
      this.fitShadow();
    }
    this.applyFog(e.fog);
    this.applyEffects(e.fx);
  }

  // Masque ou affiche les repères d'édition (lumières) avant un export.
  setEditorHelpers(visible) {
    this.content.traverse((o) => { if (o.userData.editorOnly) o.visible = visible; });
  }

  applyLights(name) {
    const set = (l, color, intensity, pos) => { l.color.set(color); l.intensity = intensity; if (pos) l.position.set(...pos); };
    this.p1.intensity = 0;
    this.p2.intensity = 0;
    switch (name) {
      case 'doux':
        set(this.key, '#ffffff', 1.3, [20, 60, 35]); set(this.fill, '#eef2ff', 0.7, [-35, 25, 25]); set(this.rim, '#ffffff', 0.5, [0, 30, -40]);
        this.key.shadow.radius = 8;
        break;
      case 'contraste':
        set(this.key, '#ffffff', 3.2, [38, 42, 14]); set(this.fill, '#dfe8ff', 0.15, [-30, 15, 15]); set(this.rim, '#ffffff', 2.4, [-22, 28, -38]);
        this.key.shadow.radius = 2;
        break;
      case 'coucher':
        set(this.key, '#ffb26b', 2.8, [45, 16, 22]); set(this.fill, '#6f8cff', 0.7, [-35, 18, 15]); set(this.rim, '#ffd7a8', 1.2, [-10, 25, -40]);
        this.key.shadow.radius = 3;
        break;
      case 'neon':
        set(this.key, '#ffffff', 0.7, [15, 50, 30]); set(this.fill, '#ffffff', 0, [0, 0, 1]); set(this.rim, '#8f7bff', 1.6, [0, 25, -40]);
        this.p1.position.set(-32, 16, 16); this.p1.intensity = 2200;
        this.p2.position.set(32, 16, 16); this.p2.intensity = 2200;
        this.key.shadow.radius = 4;
        break;
      default:
        set(this.key, '#ffffff', 2.4, [25, 45, 30]); set(this.fill, '#dfe8ff', 0.6, [-30, 20, 12]); set(this.rim, '#ffffff', 1.0, [0, 30, -40]);
        this.key.shadow.radius = 4;
    }
    this.keyDir = this.key.position.clone().normalize();
    this.fitShadow();
  }

  // Cadre l'ombre portée sur les objets de la scène.
  fitShadow() {
    const box = new T.Box3();
    this.content.updateMatrixWorld(true);
    this.content.traverse((o) => {
      if (!o.isMesh || o.userData.editorOnly || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
    });
    if (box.isEmpty()) return;
    const c = box.getCenter(new T.Vector3());
    const s = box.getSize(new T.Vector3());
    const r = Math.max(s.x, s.y, s.z) * 0.9 + 10;
    const cam = this.key.shadow.camera;
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
    cam.near = 1; cam.far = 600;
    cam.updateProjectionMatrix();
    const dir = (this.keyDir || new T.Vector3(0.4, 0.75, 0.5).normalize()).clone();
    this.key.target.position.copy(c);
    this.key.position.copy(c.clone().add(dir.multiplyScalar(220)));
  }

  fitBackgroundImage(aspect) {
    const t = this.bgTexture;
    if (!t || !this.bgImage || this.env.bg !== 'image') return;
    const ia = (this.bgImage.naturalWidth || this.bgImage.width) / (this.bgImage.naturalHeight || this.bgImage.height);
    if (aspect > ia) { t.repeat.set(1, ia / aspect); t.offset.set(0, (1 - ia / aspect) / 2); } else { t.repeat.set(aspect / ia, 1); t.offset.set((1 - aspect / ia) / 2, 0); }
  }

  // Brouillard : none | linear | exp ; couleur ; densité (0..1).
  applyFog(f) {
    this.fog = { mode: 'none', color: '#eceef3', density: 0.25, ...(f || {}) };
    const F = this.fog;
    if (F.mode === 'linear') this.scene.fog = new T.Fog(F.color, 40 + (1 - F.density) * 160, 160 + (1 - F.density) * 600);
    else if (F.mode === 'exp') this.scene.fog = new T.FogExp2(F.color, 0.001 + F.density * 0.012);
    else this.scene.fog = null;
  }

  // Effets : halo lumineux (bloom), vignettage, grain.
  applyEffects(fx) {
    this.fx = {
      bloom: false, bloomStrength: 0.6, bloomRadius: 0.4, bloomThreshold: 1, vignette: false, vignetteAmount: 0.5, grain: false, grainAmount: 0.25, ...(fx || {}),
    };
    if (this.composer) {
      this.bloomPass.enabled = this.fx.bloom;
      this.bloomPass.strength = this.fx.bloomStrength;
      this.bloomPass.radius = this.fx.bloomRadius;
      this.bloomPass.threshold = this.fx.bloomThreshold;
      this.vignettePass.enabled = this.fx.vignette;
      this.vignettePass.uniforms.darkness.value = 0.4 + this.fx.vignetteAmount * 1.4;
      this.vignettePass.uniforms.offset.value = 1.05 - this.fx.vignetteAmount * 0.2;
      this.filmPass.enabled = this.fx.grain;
      if (this.filmPass.uniforms && this.filmPass.uniforms.intensity) this.filmPass.uniforms.intensity.value = this.fx.grainAmount * 0.45;
    }
  }

  get effectsOn() { return Boolean(this.fx && (this.fx.bloom || this.fx.vignette || this.fx.grain)); }

  ensureComposer() {
    if (this.composer) return;
    const r = this.renderer;
    const size = r.getSize(new T.Vector2());
    const rt = new T.WebGLRenderTarget(size.x * r.getPixelRatio(), size.y * r.getPixelRatio(), { type: T.HalfFloatType, samples: 4 });
    this.composer = new T.EffectComposer(r, rt);
    this.renderPass = new T.RenderPass(this.scene, this.camera);
    this.bloomPass = new T.UnrealBloomPass(new T.Vector2(size.x, size.y), 0.6, 0.4, 1);
    this.vignettePass = new T.ShaderPass(T.VignetteShader);
    this.filmPass = new T.FilmPass(0.25, false);
    this.outputPass = new T.OutputPass();
    for (const p of [this.renderPass, this.bloomPass, this.filmPass, this.outputPass, this.vignettePass]) this.composer.addPass(p);
    this.applyEffects(this.fx);
  }

  // Dessine une image (avec les effets s'ils sont activés), à la taille actuelle du moteur de rendu.
  draw() {
    if (!this.effectsOn) { this.renderer.render(this.scene, this.camera); return; }
    this.ensureComposer();
    const r = this.renderer;
    const size = r.getSize(new T.Vector2());
    const pr = r.getPixelRatio();
    const key = `${size.x}x${size.y}@${pr}`;
    if (this.composerKey !== key) { this.composer.setPixelRatio(pr); this.composer.setSize(size.x, size.y); this.composerKey = key; }
    this.composer.render();
  }

  render() { this.draw(); }

  /* Rendu hors écran à une taille donnée ; renvoie un canvas 2D. */
  /* Rendu hors écran à une taille donnée ; renvoie un canvas 2D.
   * samples > 1 : accumulation d'images décalées d'une fraction de pixel (anticrénelage et ombres adoucies) ;
   * scale > 1 : sur-échantillonnage puis réduction ; hiShadows : carte d'ombre 4096 le temps du rendu.
   * Avec samples = 1 et scale = 1, le rendu est synchrone (canvas renvoyé directement). */
  renderTo(w, h, opts = {}) {
    const { samples = 1, scale = 1 } = opts;
    if (samples <= 1 && scale <= 1 && !opts.hiShadows) return this.renderOnce(w, h, opts);
    return this.renderFinal(w, h, opts);
  }

  async renderFinal(w, h, { transparent = false, samples = 8, scale = 1, hiShadows = false } = {}) {
    const max = Math.min(8192, (this.renderer.capabilities && this.renderer.capabilities.maxTextureSize) || 8192);
    const k = Math.max(1, Math.min(scale, max / Math.max(w, h)));
    const W = Math.round(w * k); const H = Math.round(h * k);
    const sh = this.key.shadow;
    const prevMap = sh.mapSize.x;
    const prevRadius = sh.radius;
    if (hiShadows && prevMap < 4096) {
      sh.mapSize.set(4096, 4096);
      if (sh.map) { sh.map.dispose(); sh.map = null; }
      sh.radius = Math.max(prevRadius, 3);
    }
    const acc = document.createElement('canvas');
    acc.width = W; acc.height = H;
    const ctx = acc.getContext('2d');
    // Décalages de Halton (2, 3) : répartis uniformément dans le pixel.
    const halton = (i, b) => { let f = 1; let r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
    const cam = this.camera;
    try {
      for (let i = 0; i < samples; i++) {
        const jx = samples > 1 ? halton(i + 1, 2) - 0.5 : 0;
        const jy = samples > 1 ? halton(i + 1, 3) - 0.5 : 0;
        cam.setViewOffset(W, H, jx, jy, W, H);
        const c = this.renderOnce(W, H, { transparent });
        ctx.globalAlpha = 1 / (i + 1);
        ctx.globalCompositeOperation = transparent && i === 0 ? 'copy' : 'source-over';
        if (transparent && i > 0) {
          // Moyenne correcte avec la transparence : mélange pondéré sur un calque.
          const tmp = document.createElement('canvas');
          tmp.width = W; tmp.height = H;
          const t = tmp.getContext('2d');
          t.globalAlpha = 1 - 1 / (i + 1); t.drawImage(acc, 0, 0);
          t.globalAlpha = 1 / (i + 1); t.drawImage(c, 0, 0);
          ctx.globalCompositeOperation = 'copy'; ctx.globalAlpha = 1; ctx.drawImage(tmp, 0, 0);
        } else ctx.drawImage(c, 0, 0);
        // Laisse respirer l'interface entre deux passes.
        if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      cam.clearViewOffset();
      cam.updateProjectionMatrix();
      if (hiShadows && prevMap < 4096) {
        sh.mapSize.set(prevMap, prevMap);
        if (sh.map) { sh.map.dispose(); sh.map = null; }
        sh.radius = prevRadius;
      }
    }
    if (W === w && H === h) return acc;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const o = out.getContext('2d');
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = 'high';
    o.drawImage(acc, 0, 0, w, h);
    return out;
  }

  renderOnce(w, h, { transparent = false } = {}) {
    const r = this.renderer;
    const prev = { pr: r.getPixelRatio(), size: r.getSize(new T.Vector2()), aspect: this.camera.aspect };
    const bg = this.scene.background;
    const vis = [this.cyclo.visible, this.glossFloor.visible, this.shadowFloor.visible, this.reflector.visible];
    if (transparent) {
      // Fond transparent : on garde seulement l'ombre portée au sol.
      this.scene.background = null;
      this.cyclo.visible = false;
      this.glossFloor.visible = false;
      this.reflector.visible = false;
      this.shadowFloor.visible = this.env.floor !== 'none';
      r.setClearColor(0, 0);
    }
    this.setEditorHelpers(false);
    r.setPixelRatio(1);
    r.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fitBackgroundImage(w / h);
    if (transparent) r.render(this.scene, this.camera); else this.draw();
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d').drawImage(r.domElement, 0, 0);
    if (transparent) { this.scene.background = bg; [this.cyclo.visible, this.glossFloor.visible, this.shadowFloor.visible, this.reflector.visible] = vis; }
    this.setEditorHelpers(true);
    r.setPixelRatio(prev.pr);
    r.setSize(prev.size.x, prev.size.y, false);
    this.camera.aspect = prev.aspect;
    this.camera.updateProjectionMatrix();
    this.fitBackgroundImage(prev.aspect);
    return out;
  }
}
