/* Catalogue des appareils.
 *
 * w × h   : zone d'affichage en pixels CSS, appareil tenu dans son sens naturel.
 * dpr     : devicePixelRatio du navigateur sur l'appareil.
 * p       : mesures physiques (millimètres), qui servent aux cadres 2D et aux modèles 3D :
 *   b     : [largeur, hauteur, épaisseur] du corps
 *   diag  : diagonale de l'écran (pouces), px : définition [largeur, hauteur] de la dalle
 *   sr/br : rayon des coins de l'écran / du corps (nombre ou [haut-gauche, haut-droit, bas-droit, bas-gauche])
 *   bz    : marges [haut, droite, bas, gauche] entre le bord du corps et l'écran (sinon : centré)
 *   cut   : encoche, île dynamique, poinçon (mm dans l'écran, ou en px CSS avec css: true)
 *   lens  : caméras visibles sur l'écran externe (pliables à clapet), cx/cy négatifs = depuis la droite/le bas
 *   hinge : charnière visible de face ('left', 'top', 'v', 'h', ou fractions pour les pliables à trois volets)
 *   cam   : module photo au dos (pour la 3D), btn : boutons (fractions le long des tranches)
 * states  : variantes (fermé / ouvert…). fold : façon dont l'appareil se plie (3D).
 * approx  : dimensions CSS déduites de la définition et des réglages d'affichage par défaut.
 *
 * Sources principales : fiches techniques Apple (iPhone 17, 17e, Air, 18 Pro, iPhone Duo),
 * Samsung (Galaxy Z Fold7, Z Flip7, Z Fold8, Z Fold8 Ultra, Z Flip8, Z TriFold, S26), Google,
 * DeviceAtlas et YesViz pour les tailles CSS observées.
 */

export const CATEGORIES = [
  { id: 'iphone', label: 'iPhone', color: '#0a84ff', glyph: 'phone' },
  { id: 'samsung', label: 'Samsung Galaxy', color: '#5e5ce6', glyph: 'phone' },
  { id: 'xiaomi', label: 'Xiaomi, Redmi, POCO', color: '#ff9f0a', glyph: 'phone' },
  { id: 'pixel', label: 'Google Pixel', color: '#30d158', glyph: 'phone' },
  { id: 'transsion', label: 'Tecno, Infinix, itel', color: '#64d2ff', glyph: 'phone' },
  { id: 'bbk', label: 'OPPO, OnePlus, realme, vivo', color: '#34c759', glyph: 'phone' },
  { id: 'huawei', label: 'Huawei, Honor', color: '#ff453a', glyph: 'phone' },
  { id: 'moto', label: 'Motorola, Nokia', color: '#bf5af2', glyph: 'phone' },
  { id: 'generic', label: 'Android générique', color: '#8e8e93', glyph: 'phone' },
  { id: 'foldable', label: 'Pliables et double écran', color: '#ff375f', glyph: 'fold' },
  { id: 'tablet', label: 'Tablettes', color: '#40c8e0', glyph: 'tablet' },
  { id: 'desktop', label: 'Ordinateurs portables', color: '#98989d', glyph: 'laptop' },
  { id: 'pc', label: 'Ordinateurs de bureau', color: '#8e8e93', glyph: 'display' },
  { id: 'bigscreen', label: "Écrans d'ordinateur", color: '#636366', glyph: 'display' },
  { id: 'watch', label: 'Montres connectées', color: '#ff2d55', glyph: 'watch' },
  { id: 'tv', label: 'Téléviseurs et boîtiers TV', color: '#ff6b35', glyph: 'tv' },
  { id: 'xr', label: 'Casques VR et réalité mixte', color: '#5856d6', glyph: 'xr' },
  { id: 'console', label: 'Consoles de jeu', color: '#e5484d', glyph: 'gamepad' },
  { id: 'car', label: 'Écrans de voiture', color: '#30b0c7', glyph: 'car' },
  { id: 'smart', label: 'Liseuses, maison, bornes et affichage', color: '#a2845e', glyph: 'kiosk' },
  { id: 'custom', label: 'Mes appareils', color: '#ffd60a', glyph: 'star' },
];

// Couleurs réelles des gammes (nom, couleur du cadre).
const PAL = {
  iphone18pro: [['Glacier', '#bccbd7'], ['Argent', '#e1e2e4'], ['Noir', '#2a2b2e'], ['Bordeaux', '#5e2330']],
  iphone17pro: [['Argent', '#dcdddf'], ['Orange cosmique', '#d9682c'], ['Bleu intense', '#2f3a52']],
  iphone17: [['Noir', '#2b2b2e'], ['Lavande', '#c6bfdc'], ['Sauge', '#b3c0a9'], ['Bleu brume', '#a6bacf'], ['Blanc', '#eeede9']],
  iphoneAir: [['Noir sidéral', '#2a2a2d'], ['Blanc nuage', '#efeeea'], ['Or clair', '#e5d9bf'], ['Bleu ciel', '#cadcea']],
  iphone16: [['Noir', '#2c2c2f'], ['Blanc', '#eeede9'], ['Rose', '#f2c6cf'], ['Sarcelle', '#8fb9b5'], ['Outremer', '#5b6fc4']],
  iphoneTitane: [['Titane naturel', '#b8b2a7'], ['Titane noir', '#3a393b'], ['Titane blanc', '#e6e4df'], ['Titane sable', '#c4ab8f']],
  iphoneClassic: [['Minuit', '#2d3038'], ['Lumière stellaire', '#ece6dc'], ['Bleu', '#4f6c8d'], ['(PRODUCT)RED', '#b8212f']],
  iphoneSE: [['Minuit', '#2d3038'], ['Lumière stellaire', '#ece6dc'], ['(PRODUCT)RED', '#b8212f']],
  iphone17e: [['Noir', '#2b2b2e'], ['Blanc', '#eeede9'], ['Rose doux', '#efc9cf']],
  iphoneDuo: [['Bleu nuit', '#2c3447'], ['Blanc étoile', '#ebe9e4']],
  fold8: [['Graphite', '#3a3b3f'], ['Crème', '#e6ddcc'], ['Lavande', '#b7aed4'], ['Pistache', '#c5d5b2']],
  fold8u: [['Graphite', '#3a3b3f'], ['Crème', '#e6ddcc'], ['Violet ombré', '#6a6284'], ['Vert ombré', '#5c7064']],
  flip8: [['Graphite', '#3a3b3f'], ['Crème', '#e6ddcc'], ['Rose', '#f0c3ca'], ['Menthe', '#bfe1d1']],
  fold7: [['Noir de jais', '#222326'], ['Bleu ombré', '#2e3f66'], ['Argent ombré', '#aeb1b6'], ['Menthe', '#bfd9cf']],
  flip7: [['Noir de jais', '#222326'], ['Bleu ombré', '#3a4e86'], ['Rouge corail', '#ef6a5d'], ['Menthe', '#bfe3d3']],
  galaxyS: [['Noir', '#25262a'], ['Bleu glacier', '#a9bed2'], ['Argent', '#c9ccd1'], ['Menthe', '#b9d8c8'], ['Violet', '#9f8fbf']],
  galaxyUltra: [['Titane noir', '#2f3033'], ['Titane gris', '#8d8f93'], ['Titane argent', '#c8cacd'], ['Titane bleu', '#5f6f86']],
  galaxyA: [['Bleu nuit', '#26324a'], ['Lilas', '#c8bfe0'], ['Citron', '#e9e6a6'], ['Glace', '#d9e4ea']],
  pixel: [['Obsidienne', '#26272a'], ['Porcelaine', '#ece6dc'], ['Vert sauge', '#b8c7b0'], ['Pervenche', '#a7b4e0']],
  xiaomi: [['Noir', '#232427'], ['Blanc', '#eceae6'], ['Vert', '#93ad9b'], ['Violet', '#a99ac8']],
  generic: [['Noir', '#232427'], ['Bleu', '#2f4a74'], ['Vert', '#4f7a63'], ['Blanc', '#eceae6'], ['Doré', '#d3b98a']],
  moto: [['Vert forêt', '#3f5a47'], ['Orange', '#e07b39'], ['Bleu', '#2e4a73'], ['Rose', '#e8b4bf']],
  huawei: [['Noir', '#232427'], ['Blanc', '#eceae6'], ['Vert', '#5d7a68'], ['Rouge', '#9e2b31']],
  ipad: [['Gris sidéral', '#5b5d63'], ['Argent', '#d7d8db'], ['Bleu', '#8aa4c4'], ['Violet', '#b9aedb']],
  tabletAndroid: [['Graphite', '#45474c'], ['Argent', '#cfd1d4'], ['Bleu', '#6f86a7']],
  mac: [['Minuit', '#2e3440'], ['Lumière stellaire', '#e3dccf'], ['Argent', '#d6d7d9'], ['Bleu ciel', '#b9cbd9'], ['Noir sidéral', '#2b2c2f']],
  pc: [['Gris anthracite', '#3d4046'], ['Argent', '#c7c9cc'], ['Noir', '#202124'], ['Bleu marine', '#2b3a55']],
  monitor: [['Noir', '#1e1f22'], ['Argent', '#cfd1d4'], ['Blanc', '#efefee']],
  imac: [['Bleu', '#8fb0d2'], ['Vert', '#a9c9a4'], ['Rose', '#f1b9b6'], ['Argent', '#d6d7d9'], ['Jaune', '#f2d77e'], ['Orange', '#f2a56f'], ['Violet', '#b8a7d9']],
  tv: [['Noir', '#141518'], ['Titane', '#4a4b4f'], ['Argent', '#b9bbbe'], ['Blanc', '#e9e9e7']],
  galaxyS26: [['Noir cobalt', '#26282d'], ['Blanc', '#ecebe8'], ['Bleu ciel', '#b9cde2'], ['Violet cobalt', '#7b6f9e']],
  galaxyS26u: [['Violet cobalt', '#5d5688'], ['Noir', '#232427'], ['Blanc', '#eceae6'], ['Argent ombré', '#b6b8bc'], ['Bleu ciel', '#b6c9de'], ['Or rose', '#e2c6b9']],
  appleWatch: [['Noir de jais', '#1f1f21'], ['Argent', '#d5d6d8'], ['Or rose', '#e7c9bd']],
  watchUltra: [['Titane naturel', '#b9b4aa'], ['Titane noir', '#2f2f31']],
  wear: [['Graphite', '#2f3034'], ['Argent', '#c9cbce'], ['Or', '#d8c49e']],
  handheld: [['Noir', '#1d1e21'], ['Blanc', '#ecebe8'], ['Gris', '#6b6d72']],
  car: [['Piano noir', '#121316'], ['Gris', '#45474c']],
  smart: [['Anthracite', '#2c2d31'], ['Blanc craie', '#ecebe6'], ['Bleu nuit', '#2b3550'], ['Sable', '#d9cdb8']],
  xr: [['Verre', '#e9edf2'], ['Fumé', '#3a3d44']],
};

// Boutons (fractions de la hauteur ou de la largeur, en portrait).
const BTN = {
  iphonePro: [['left', 0.19, 0.235], ['left', 0.28, 0.37], ['left', 0.39, 0.48], ['right', 0.29, 0.4], ['right', 0.62, 0.73, 'flush']],
  iphone17: [['left', 0.19, 0.235], ['left', 0.28, 0.37], ['left', 0.39, 0.48], ['right', 0.29, 0.4], ['right', 0.62, 0.72, 'flush']],
  iphone: [['left', 0.18, 0.22], ['left', 0.26, 0.34], ['left', 0.37, 0.45], ['right', 0.27, 0.4]],
  iphoneSE: [['left', 0.17, 0.2], ['left', 0.23, 0.29], ['left', 0.31, 0.37], ['right', 0.2, 0.28]],
  samsung: [['right', 0.2, 0.33], ['right', 0.36, 0.43]],
  android: [['right', 0.18, 0.3], ['right', 0.34, 0.41]],
  pixel: [['right', 0.22, 0.28], ['right', 0.32, 0.45]],
  foldCover: [['right', 0.19, 0.3], ['right', 0.33, 0.42]],
  foldOpen: [['right', 0.19, 0.3], ['right', 0.33, 0.42]],
  passCover: [['right', 0.17, 0.32], ['right', 0.36, 0.48]],
  flipOpen: [['right', 0.25, 0.32], ['right', 0.34, 0.39]],
  flipClosed: [['right', 0.48, 0.66], ['right', 0.7, 0.82]],
  duoClosed: [['top', 0.1, 0.22], ['top', 0.25, 0.37], ['right', 0.16, 0.31], ['right', 0.42, 0.55, 'flush']],
  duoOpen: [['top', 0.55, 0.61], ['top', 0.625, 0.685], ['right', 0.16, 0.31], ['right', 0.42, 0.55, 'flush']],
  ipad: [['top', 0.74, 0.86], ['right', 0.08, 0.14], ['right', 0.16, 0.22]],
  tablet: [['top', 0.14, 0.2], ['right', 0.1, 0.18]],
};

// Îles et encoches Apple, en points (identiques sur toute la gamme).
const ISLAND = { t: 'island', css: true, w: 124, h: 36, y: 11 };
const NOTCH = { t: 'notch', css: true, w: 160, h: 31 };
const PUNCH = { t: 'punch', d: 3.3, y: 4.1 };
const DROP = { t: 'drop', css: true, w: 30, h: 24 };

const fold = (closed, open, extra = {}) => ({
  category: 'foldable',
  defaultState: 'open',
  states: [{ id: 'closed', label: 'Fermé', ...closed }, { id: 'open', label: 'Ouvert', ...open }],
  ...extra,
});

export const DEVICES = [
  // ---------------------------------------------------------------- iPhone
  {
    id: 'iphone-se', name: 'iPhone SE (2e et 3e gén.)', category: 'iphone', os: 'ios', w: 375, h: 667, dpr: 2, frame: 'home', colors: PAL.iphoneSE,
    p: { b: [67.3, 138.4, 7.3], diag: 4.7, px: [750, 1334], sr: 0, br: 9.6, btn: BTN.iphoneSE, cam: { t: 'single' } },
  },
  {
    id: 'iphone-13-mini', name: 'iPhone 12 mini / 13 mini', category: 'iphone', os: 'ios', w: 375, h: 812, dpr: 3, frame: 'notch', colors: PAL.iphoneClassic,
    p: { b: [64.2, 131.5, 7.65], diag: 5.4, px: [1080, 2340], sr: 7.3, cut: NOTCH, btn: BTN.iphone, cam: { t: 'diag2' } },
  },
  {
    id: 'iphone-14', name: 'iPhone 12 / 13 / 14 / 16e / 17e', category: 'iphone', os: 'ios', w: 390, h: 844, dpr: 3, frame: 'notch', colors: PAL.iphone17e,
    p: { b: [71.5, 146.7, 7.8], diag: 6.1, px: [1170, 2532], sr: 8.1, cut: NOTCH, btn: BTN.iphone, cam: { t: 'single' } },
  },
  {
    id: 'iphone-14-plus', name: 'iPhone 14 Plus', category: 'iphone', os: 'ios', w: 428, h: 926, dpr: 3, frame: 'notch', colors: PAL.iphoneClassic,
    p: { b: [78.1, 160.8, 7.8], diag: 6.7, px: [1284, 2778], sr: 8.8, cut: NOTCH, btn: BTN.iphone, cam: { t: 'diag2' } },
  },
  {
    id: 'iphone-15', name: 'iPhone 14 Pro / 15 / 16', category: 'iphone', os: 'ios', w: 393, h: 852, dpr: 3, frame: 'island', colors: PAL.iphone16,
    p: { b: [71.6, 147.6, 7.8], diag: 6.1, px: [1179, 2556], sr: 8.4, cut: ISLAND, btn: BTN.iphone17, cam: { t: 'pill-v', n: 2 } },
  },
  {
    id: 'iphone-15-plus', name: 'iPhone 15 Plus / 16 Plus / 15 Pro Max', category: 'iphone', os: 'ios', w: 430, h: 932, dpr: 3, frame: 'island', colors: PAL.iphoneTitane,
    p: { b: [77.8, 160.9, 7.8], diag: 6.7, px: [1290, 2796], sr: 9.1, cut: ISLAND, btn: BTN.iphone17, cam: { t: 'square', n: 3 } },
  },
  {
    // iPhone 18 Pro (septembre 2026) : 150,0 × 71,9 × 8,75 mm, écran 6,3 pouces 2622 × 1206 à 460 ppp, Dynamic Island
    // réduite (Face ID sous l'écran), dos en verre assorti au cadre aluminium, plateau photo sur toute la largeur.
    id: 'iphone-18-pro', name: 'iPhone 18 Pro', category: 'iphone', os: 'ios', w: 402, h: 874, dpr: 3, frame: 'island', colors: PAL.iphone18pro,
    p: {
      b: [71.9, 150.0, 8.75], diag: 6.3, px: [1206, 2622], sr: 8.9, cut: { t: 'island', css: true, w: 98, h: 34, y: 11 }, btn: BTN.iphonePro, cam: { t: 'plateau18', n: 3 }, hifi: 'apple', rim: 0.95, bezelColor: '#030304', uniformBack: true,
    },
  },
  {
    id: 'iphone-17', name: 'iPhone 16 Pro / 17 / 17 Pro', category: 'iphone', os: 'ios', w: 402, h: 874, dpr: 3, frame: 'island', colors: PAL.iphone17pro,
    p: { b: [71.9, 150.0, 8.75], diag: 6.3, px: [1206, 2622], sr: 8.9, cut: ISLAND, btn: BTN.iphonePro, cam: { t: 'plateau', n: 3 } },
  },
  {
    id: 'iphone-air', name: 'iPhone Air', category: 'iphone', os: 'ios', w: 420, h: 912, dpr: 3, frame: 'island', colors: PAL.iphoneAir,
    p: { b: [74.7, 156.2, 5.64], diag: 6.5, px: [1260, 2736], sr: 9.2, cut: ISLAND, btn: BTN.iphonePro, cam: { t: 'plateau', n: 1 } },
  },
  {
    id: 'iphone-17-pro-max', name: 'iPhone 16 Pro Max / 17 Pro Max / 18 Pro Max', category: 'iphone', os: 'ios', w: 440, h: 956, dpr: 3, frame: 'island', colors: PAL.iphone18pro,
    p: { b: [78.0, 163.4, 8.75], diag: 6.9, px: [1320, 2868], sr: 9.6, cut: ISLAND, btn: BTN.iphonePro, cam: { t: 'plateau', n: 3 } },
  },
  {
    // Format « passeport » : charnière à gauche (coins carrés), coins arrondis à droite, caméra ronde en haut à droite.
    id: 'iphone-duo', name: 'iPhone Duo', category: 'iphone', alsoIn: ['foldable'], os: 'ios', dpr: 3, colors: PAL.iphoneDuo,
    fold: { kind: 'book', coverOn: 'left' },
    ...fold(
      {
        w: 466, h: 678, frame: 'island',
        p: {
          b: [84.1, 117.8, 11.3], diag: 5.4, px: [1398, 2034], sr: [3, 8.2, 8.2, 3], br: [3.4, 10.4, 10.4, 3.4], bz: [2.3, 2.6, 2.4, 3.8],
          cut: { t: 'punch', d: 3.6, cx: -7.2, y: 5.4 }, hinge: 'left', btn: BTN.duoClosed, cam: { t: 'bump-h', n: 2 },
        },
      },
      {
        w: 890, h: 626, frame: 'island-fold',
        p: {
          b: [164.6, 117.8, 5.2], diag: 7.6, px: [2670, 1878], sr: 8.2, br: 10.4, cut: null, hinge: 'v', crease: 'soft', btn: BTN.duoOpen,
        },
      },
    ),
  },

  // ---------------------------------------------------------------- Samsung
  {
    id: 'galaxy-s8', name: 'Galaxy S8+', skinMatch: ['Galaxy S8', 'Galaxy S9'], category: 'samsung', os: 'android', w: 360, h: 740, dpr: 4, frame: 'slim', colors: PAL.galaxyS,
    p: { b: [73.4, 159.5, 8.1], diag: 6.2, px: [1440, 2960], sr: 5.5, bz: [9.5, 1.6, 9.5, 1.6], btn: BTN.samsung, cam: { t: 'single' } },
  },
  {
    id: 'galaxy-s20-ultra', name: 'Galaxy S20 Ultra', skinMatch: ['Galaxy S20 Ultra'], category: 'samsung', os: 'android', w: 412, h: 915, dpr: 3.5, frame: 'punch', colors: PAL.galaxyS,
    p: { b: [76.0, 166.9, 8.8], diag: 6.9, px: [1440, 3200], sr: 6.4, cut: PUNCH, btn: BTN.samsung, cam: { t: 'square', n: 4 } },
  },
  {
    id: 'galaxy-s21', name: 'Galaxy S21 / S22', skinMatch: ['Galaxy S21', 'Galaxy S22'], category: 'samsung', os: 'android', w: 360, h: 800, dpr: 3, frame: 'punch', colors: PAL.galaxyS,
    p: { b: [71.2, 151.7, 7.9], diag: 6.2, px: [1080, 2400], sr: 6.6, cut: PUNCH, btn: BTN.samsung, cam: { t: 'lenses-v', n: 3 } },
  },
  {
    // Fiche Samsung : 71,7 × 149,6 × 7,2 mm, 6,3 pouces FHD+, îlot photo à trois objectifs.
    id: 'galaxy-s26', name: 'Galaxy S26', category: 'samsung', os: 'android', w: 360, h: 780, dpr: 3, frame: 'punch', colors: PAL.galaxyS26, skinMatch: 'Galaxy S26',
    p: { b: [71.7, 149.6, 7.2], diag: 6.3, px: [1080, 2340], sr: 7.6, cut: { t: 'punch', d: 3.2, y: 4.0 }, btn: BTN.samsung, cam: { t: 'pill-v', n: 3 } },
  },
  {
    id: 'galaxy-s26-plus', name: 'Galaxy S26+', category: 'samsung', os: 'android', w: 384, h: 832, dpr: 3.75, frame: 'punch', colors: PAL.galaxyS26, skinMatch: ['Galaxy S26+', 'Galaxy S26 Plus'],
    p: { b: [75.8, 158.4, 7.3], diag: 6.7, px: [1440, 3120], sr: 7.8, cut: { t: 'punch', d: 3.2, y: 4.0 }, btn: BTN.samsung, cam: { t: 'pill-v', n: 3 } },
  },
  {
    // Galaxy S26 Ultra (février 2026) : 163,6 × 78,1 × 7,9 mm, écran plat 6,9 pouces 3120 × 1440, coins un peu plus
    // arrondis que le S25 Ultra, îlot photo en relief façon Z Fold7 (trois objectifs) et quatrième objectif à côté, S Pen.
    id: 'galaxy-s26-ultra', name: 'Galaxy S26 Ultra', category: 'samsung', os: 'android', w: 384, h: 832, dpr: 3.75, frame: 'punch', colors: PAL.galaxyS26u, skinMatch: ['Galaxy S26 Ultra', 'S26 Ultra'],
    p: {
      b: [78.1, 163.6, 7.9], diag: 6.9, px: [1440, 3120], sr: 7.4, cut: { t: 'punch', d: 3.0, y: 3.9 }, btn: BTN.samsung, cam: { t: 's26u', n: 4 }, hifi: 'samsung', rim: 0.7, bezelColor: '#020203', spen: true,
    },
  },
  {
    id: 'galaxy-s25', name: 'Galaxy S23 / S24 / S25', category: 'samsung', os: 'android', w: 360, h: 780, dpr: 3, frame: 'punch', colors: PAL.galaxyS, skinMatch: ['Galaxy S25', 'Galaxy S24', 'Galaxy S23'],
    p: { b: [70.5, 146.9, 7.2], diag: 6.2, px: [1080, 2340], sr: 7.4, cut: PUNCH, btn: BTN.samsung, cam: { t: 'lenses-v', n: 3 } },
  },
  {
    id: 'galaxy-s25-plus', name: 'Galaxy S24+ / S25+', category: 'samsung', os: 'android', w: 384, h: 832, dpr: 3.75, frame: 'punch', colors: PAL.galaxyS, skinMatch: ['Galaxy S25+', 'Galaxy S25 Plus', 'Galaxy S24+', 'Galaxy S24 Plus'],
    p: { b: [75.8, 158.4, 7.3], diag: 6.7, px: [1440, 3120], sr: 7.8, cut: PUNCH, btn: BTN.samsung, cam: { t: 'lenses-v', n: 3 } },
  },
  {
    id: 'galaxy-s25-edge', name: 'Galaxy S25 Edge', category: 'samsung', os: 'android', w: 384, h: 832, dpr: 3.75, frame: 'punch', colors: PAL.galaxyUltra, skinMatch: 'Galaxy S25 Edge',
    p: { b: [75.6, 158.2, 5.8], diag: 6.7, px: [1440, 3120], sr: 7.8, cut: PUNCH, btn: BTN.samsung, cam: { t: 'pill-v', n: 2 } },
  },
  {
    // S25 Ultra : coins arrondis, 77,6 × 162,8 × 8,2 mm.
    id: 'galaxy-s25-ultra', name: 'Galaxy S25 Ultra', category: 'samsung', os: 'android', w: 384, h: 832, dpr: 3.75, frame: 'punch', colors: PAL.galaxyUltra, skinMatch: 'Galaxy S25 Ultra',
    p: { b: [77.6, 162.8, 8.2], diag: 6.9, px: [1440, 3120], sr: 6.4, cut: PUNCH, btn: BTN.samsung, cam: { t: 'lenses-v', n: 4 } },
  },
  {
    // S24 Ultra : coins presque droits, 79,0 × 162,3 × 8,6 mm.
    id: 'galaxy-s24-ultra', name: 'Galaxy S22 Ultra / S23 Ultra / S24 Ultra', category: 'samsung', os: 'android', w: 384, h: 824, dpr: 3.75, frame: 'punch-square', colors: PAL.galaxyUltra, skinMatch: ['Galaxy S24 Ultra', 'Galaxy S23 Ultra'],
    p: { b: [79.0, 162.3, 8.6], diag: 6.8, px: [1440, 3088], sr: 2.6, br: 3.6, cut: PUNCH, btn: BTN.samsung, cam: { t: 'lenses-v', n: 4 } },
  },
  {
    id: 'galaxy-a51', name: 'Galaxy A51 / A71', skinMatch: ['Galaxy A51', 'Galaxy A71'], category: 'samsung', os: 'android', w: 412, h: 914, dpr: 2.625, frame: 'punch', colors: PAL.galaxyA,
    p: { b: [73.6, 158.5, 7.9], diag: 6.5, px: [1080, 2400], sr: 6.2, cut: PUNCH, btn: BTN.samsung, cam: { t: 'square', n: 4 } },
  },
  {
    id: 'galaxy-a55', name: 'Galaxy A35 / A55 / A56', skinMatch: ['Galaxy A56', 'Galaxy A55', 'Galaxy A36', 'Galaxy A35'], category: 'samsung', os: 'android', w: 412, h: 892, dpr: 2.625, frame: 'punch', colors: PAL.galaxyA, approx: true,
    p: { b: [77.4, 161.1, 8.2], diag: 6.6, px: [1080, 2340], sr: 6.6, cut: PUNCH, btn: BTN.samsung, cam: { t: 'lenses-v', n: 3 } },
  },
  {
    id: 'galaxy-a15', name: 'Galaxy A15 / A16 / A25', skinMatch: ['Galaxy A16', 'Galaxy A26', 'Galaxy A25', 'Galaxy A15'], category: 'samsung', os: 'android', w: 412, h: 892, dpr: 2.625, frame: 'drop', colors: PAL.galaxyA, approx: true,
    p: { b: [76.8, 160.1, 8.4], diag: 6.5, px: [1080, 2340], sr: 5.8, bz: [2.6, 2.6, 4.6, 2.6], cut: DROP, btn: BTN.samsung, cam: { t: 'lenses-v', n: 3 } },
  },
  {
    id: 'galaxy-a05', name: 'Galaxy A05 / A06 (HD+)', skinMatch: ['Galaxy A06', 'Galaxy A05'], category: 'samsung', os: 'android', w: 360, h: 800, dpr: 2, frame: 'drop', colors: PAL.galaxyA, approx: true,
    p: { b: [78.2, 168.8, 8.8], diag: 6.7, px: [720, 1600], sr: 5.2, bz: [2.8, 2.8, 5.6, 2.8], cut: DROP, btn: BTN.samsung, cam: { t: 'lenses-v', n: 2 } },
  },

  // ---------------------------------------------------------------- Xiaomi
  {
    id: 'redmi-a3', name: 'Redmi A3 / 13C / 14C (HD+)', category: 'xiaomi', os: 'android', w: 360, h: 825, dpr: 2, frame: 'drop', colors: PAL.xiaomi, approx: true,
    p: { b: [76.3, 168.3, 8.3], diag: 6.71, px: [720, 1650], sr: 5, bz: [2.9, 2.6, 5.2, 2.6], cut: DROP, btn: BTN.android, cam: { t: 'round', n: 2 } },
  },
  {
    id: 'redmi-note-13', name: 'Redmi Note 13 / Note 14', category: 'xiaomi', os: 'android', w: 393, h: 873, dpr: 2.75, frame: 'punch', colors: PAL.xiaomi, approx: true,
    p: { b: [75.6, 162.2, 7.97], diag: 6.67, px: [1080, 2400], sr: 6.4, cut: PUNCH, btn: BTN.android, cam: { t: 'square', n: 3 } },
  },
  {
    id: 'redmi-note-14-pro', name: 'Redmi Note 14 Pro / POCO X7 Pro', category: 'xiaomi', os: 'android', w: 407, h: 904, dpr: 3, frame: 'punch', colors: PAL.xiaomi, approx: true,
    p: { b: [74.4, 162.3, 8.2], diag: 6.67, px: [1220, 2712], sr: 6.8, cut: PUNCH, btn: BTN.android, cam: { t: 'square', n: 3 } },
  },
  {
    id: 'xiaomi-15', name: 'Xiaomi 14 / 15', category: 'xiaomi', os: 'android', w: 400, h: 890, dpr: 3, frame: 'punch-square', colors: PAL.xiaomi, approx: true,
    p: { b: [71.2, 152.3, 8.1], diag: 6.36, px: [1200, 2670], sr: 5.6, cut: PUNCH, btn: BTN.android, cam: { t: 'square', n: 3 } },
  },
  {
    id: 'xiaomi-15-ultra', name: 'Xiaomi 14 Ultra / 15 Ultra', category: 'xiaomi', os: 'android', w: 480, h: 1067, dpr: 3, frame: 'punch', colors: PAL.xiaomi, approx: true,
    p: { b: [75.3, 161.3, 9.35], diag: 6.73, px: [1440, 3200], sr: 6.8, cut: PUNCH, btn: BTN.android, cam: { t: 'round', n: 4 } },
  },

  // ---------------------------------------------------------------- Google Pixel
  {
    id: 'pixel-7', name: 'Pixel 7 / 8 / 8a', skin: 'pixel_8', category: 'pixel', os: 'android', w: 412, h: 915, dpr: 2.625, frame: 'punch', colors: PAL.pixel,
    p: { b: [73.2, 155.6, 8.7], diag: 6.3, px: [1080, 2400], sr: 6.8, cut: PUNCH, btn: BTN.pixel, cam: { t: 'visor', n: 2 } },
  },
  {
    id: 'pixel-9', name: 'Pixel 9 / 10 / 11', skin: 'pixel_10', category: 'pixel', os: 'android', w: 412, h: 923, dpr: 2.625, frame: 'punch', colors: PAL.pixel, approx: true,
    p: { b: [72.0, 152.8, 8.5], diag: 6.3, px: [1080, 2424], sr: 7.6, cut: PUNCH, btn: BTN.pixel, cam: { t: 'visor', n: 2 } },
  },
  {
    id: 'pixel-9-pro', name: 'Pixel 9 Pro / 10 Pro / 11 Pro', skin: 'pixel_10_pro', category: 'pixel', os: 'android', w: 427, h: 952, dpr: 3, frame: 'punch', colors: PAL.pixel,
    p: { b: [72.0, 152.8, 8.5], diag: 6.3, px: [1280, 2856], sr: 7.6, cut: PUNCH, btn: BTN.pixel, cam: { t: 'visor', n: 3 } },
  },
  {
    id: 'pixel-9-pro-xl', name: 'Pixel 8 Pro / 9 Pro XL / 10 Pro XL', skin: 'pixel_10_pro_xl', category: 'pixel', os: 'android', w: 448, h: 998, dpr: 3, frame: 'punch', colors: PAL.pixel,
    p: { b: [76.6, 162.8, 8.5], diag: 6.8, px: [1344, 2992], sr: 8, cut: PUNCH, btn: BTN.pixel, cam: { t: 'visor', n: 3 } },
  },

  {
    id: 'pixel-10a', name: 'Pixel 9a / 10a', skin: 'pixel_10a', category: 'pixel', os: 'android', w: 412, h: 923, dpr: 2.625, frame: 'punch', colors: PAL.pixel,
    p: { b: [73.3, 154.7, 8.9], diag: 6.3, px: [1080, 2424], sr: 6.6, cut: PUNCH, btn: BTN.pixel, cam: { t: 'pill-v', n: 2 } },
  },
  {
    id: 'pixel-7a', name: 'Pixel 7a', skin: 'pixel_7a', category: 'pixel', os: 'android', w: 412, h: 915, dpr: 2.625, frame: 'punch', colors: PAL.pixel,
    p: { b: [72.9, 152.0, 9.0], diag: 6.1, px: [1080, 2400], sr: 6.4, cut: PUNCH, btn: BTN.pixel, cam: { t: 'visor', n: 2 } },
  },
  {
    id: 'pixel-7-pro', name: 'Pixel 7 Pro', skin: 'pixel_7_pro', category: 'pixel', os: 'android', w: 412, h: 892, dpr: 3.5, frame: 'punch', colors: PAL.pixel,
    p: { b: [76.6, 162.9, 8.9], diag: 6.7, px: [1440, 3120], sr: 6.8, cut: PUNCH, btn: BTN.pixel, cam: { t: 'visor', n: 3 } },
  },

  // ---------------------------------------------------------------- Tecno, Infinix, itel
  {
    id: 'itel-a70', name: 'itel A70 / A80 / P55', category: 'transsion', os: 'android', w: 360, h: 806, dpr: 2, frame: 'drop', colors: PAL.generic, approx: true,
    p: { b: [75.7, 163.9, 8.6], diag: 6.6, px: [720, 1612], sr: 4.8, bz: [3, 2.7, 5.6, 2.7], cut: DROP, btn: BTN.android, cam: { t: 'square', n: 2 } },
  },
  {
    id: 'tecno-spark', name: 'Tecno Spark 20 / 30 / 40', category: 'transsion', os: 'android', w: 360, h: 806, dpr: 2, frame: 'punch', colors: PAL.generic, approx: true,
    p: { b: [76.6, 165.4, 8.5], diag: 6.6, px: [720, 1612], sr: 5.6, cut: PUNCH, btn: BTN.android, cam: { t: 'square', n: 2 } },
  },
  {
    id: 'tecno-camon', name: 'Tecno Camon 30 / 40', category: 'transsion', os: 'android', w: 393, h: 886, dpr: 2.75, frame: 'punch', colors: PAL.generic, approx: true,
    p: { b: [74.6, 164.6, 7.5], diag: 6.78, px: [1080, 2436], sr: 6.4, cut: PUNCH, btn: BTN.android, cam: { t: 'round', n: 3 } },
  },
  {
    id: 'tecno-pova', name: 'Tecno Pova 6 / 7', category: 'transsion', os: 'android', w: 393, h: 895, dpr: 2.75, frame: 'punch', colors: PAL.generic, approx: true,
    p: { b: [76.3, 165.6, 8.6], diag: 6.78, px: [1080, 2460], sr: 6.2, cut: PUNCH, btn: BTN.android, cam: { t: 'square', n: 3 } },
  },
  {
    id: 'infinix-hot', name: 'Infinix Hot 40 / 50 / 60', category: 'transsion', os: 'android', w: 360, h: 820, dpr: 3, frame: 'punch', colors: PAL.generic, approx: true,
    p: { b: [77.0, 168.6, 8.4], diag: 6.78, px: [1080, 2460], sr: 6.2, cut: PUNCH, btn: BTN.android, cam: { t: 'square', n: 2 } },
  },
  {
    id: 'infinix-note', name: 'Infinix Note 40 / 50', category: 'transsion', os: 'android', w: 393, h: 886, dpr: 2.75, frame: 'punch', colors: PAL.generic, approx: true,
    p: { b: [75.9, 164.3, 7.8], diag: 6.78, px: [1080, 2436], sr: 6.4, cut: PUNCH, btn: BTN.android, cam: { t: 'round', n: 3 } },
  },

  // ---------------------------------------------------------------- OPPO, OnePlus, realme, vivo
  {
    id: 'oppo-a', name: 'OPPO A60 / A79 (HD+)', category: 'bbk', os: 'android', w: 360, h: 802, dpr: 2, frame: 'drop', colors: PAL.generic, approx: true,
    p: { b: [76.0, 165.7, 7.7], diag: 6.67, px: [720, 1604], sr: 5.4, bz: [2.8, 2.6, 5.2, 2.6], cut: DROP, btn: BTN.android, cam: { t: 'lenses-v', n: 2 } },
  },
  {
    id: 'oppo-reno', name: 'OPPO Reno 12 / 13 / 14', category: 'bbk', os: 'android', w: 393, h: 877, dpr: 2.75, frame: 'punch', colors: PAL.generic, approx: true,
    p: { b: [74.3, 162.4, 7.6], diag: 6.7, px: [1080, 2412], sr: 6.6, cut: PUNCH, btn: BTN.android, cam: { t: 'pill-v', n: 3 } },
  },
  {
    id: 'realme-c', name: 'realme C65 / C75', category: 'bbk', os: 'android', w: 360, h: 802, dpr: 2, frame: 'punch', colors: PAL.generic, approx: true,
    p: { b: [76.6, 166.0, 7.8], diag: 6.67, px: [720, 1604], sr: 5.6, cut: PUNCH, btn: BTN.android, cam: { t: 'square', n: 2 } },
  },
  {
    id: 'realme-12', name: 'realme 12 / 13 / 14', category: 'bbk', os: 'android', w: 393, h: 873, dpr: 2.75, frame: 'punch', colors: PAL.generic, approx: true,
    p: { b: [76.1, 165.6, 7.9], diag: 6.72, px: [1080, 2400], sr: 6.2, cut: PUNCH, btn: BTN.android, cam: { t: 'round', n: 2 } },
  },
  {
    id: 'vivo-y', name: 'vivo Y28 / Y29 / Y39', category: 'bbk', os: 'android', w: 360, h: 804, dpr: 2, frame: 'drop', colors: PAL.generic, approx: true,
    p: { b: [76.2, 165.7, 8.1], diag: 6.68, px: [720, 1608], sr: 5.2, bz: [2.8, 2.6, 5.2, 2.6], cut: DROP, btn: BTN.android, cam: { t: 'round', n: 2 } },
  },
  {
    id: 'oneplus-13', name: 'OnePlus 12 / 13 / 15', category: 'bbk', os: 'android', w: 412, h: 905, dpr: 3.5, frame: 'punch', colors: PAL.generic, approx: true,
    p: { b: [76.5, 162.9, 8.5], diag: 6.82, px: [1440, 3168], sr: 6.6, cut: PUNCH, btn: BTN.android, cam: { t: 'square', n: 3 } },
  },
  {
    id: 'oneplus-nord', name: 'OnePlus Nord 4 / Nord 5 / Nord CE', category: 'bbk', os: 'android', w: 412, h: 915, dpr: 2.625, frame: 'punch', colors: PAL.generic, approx: true,
    p: { b: [75.0, 162.6, 8.0], diag: 6.74, px: [1080, 2400], sr: 6.2, cut: PUNCH, btn: BTN.android, cam: { t: 'pill-v', n: 2 } },
  },

  // ---------------------------------------------------------------- Huawei, Honor
  {
    id: 'huawei-p60', name: 'Huawei P60 Pro / Pura 70 / Pura 80', category: 'huawei', os: 'android', w: 407, h: 900, dpr: 3, frame: 'punch', colors: PAL.huawei, approx: true,
    p: { b: [74.5, 161.0, 8.3], diag: 6.67, px: [1220, 2700], sr: 6.4, cut: PUNCH, btn: BTN.android, cam: { t: 'round', n: 3 } },
  },
  {
    id: 'honor-x8', name: 'Honor X8 / X9', category: 'huawei', os: 'android', w: 393, h: 877, dpr: 2.75, frame: 'punch', colors: PAL.huawei, approx: true,
    p: { b: [74.6, 161.0, 7.5], diag: 6.7, px: [1080, 2412], sr: 6.6, cut: PUNCH, btn: BTN.android, cam: { t: 'round', n: 2 } },
  },

  // ---------------------------------------------------------------- Motorola, Nokia
  {
    id: 'moto-g', name: 'Motorola moto g (g54 à g86)', category: 'moto', os: 'android', w: 412, h: 915, dpr: 2.625, frame: 'punch', colors: PAL.moto, approx: true,
    p: { b: [74.4, 161.6, 8.0], diag: 6.67, px: [1080, 2400], sr: 6.2, cut: PUNCH, btn: BTN.android, cam: { t: 'lenses-v', n: 2 } },
  },
  {
    id: 'moto-edge', name: 'Motorola edge 50 / 60', category: 'moto', os: 'android', w: 407, h: 904, dpr: 3, frame: 'punch', colors: PAL.moto, approx: true,
    p: { b: [73.0, 161.1, 7.6], diag: 6.67, px: [1220, 2712], sr: 7.2, cut: PUNCH, btn: BTN.android, cam: { t: 'square', n: 3 } },
  },
  {
    id: 'nokia-g', name: 'Nokia G42 / C32', category: 'moto', os: 'android', w: 360, h: 806, dpr: 2, frame: 'drop', colors: PAL.generic, approx: true,
    p: { b: [75.8, 165.0, 8.6], diag: 6.56, px: [720, 1612], sr: 4.8, bz: [3, 2.8, 5.8, 2.8], cut: DROP, btn: BTN.android, cam: { t: 'lenses-v', n: 2 } },
  },

  // ---------------------------------------------------------------- Android générique
  {
    id: 'android-compact', name: 'Android compact 360 × 640', category: 'generic', os: 'android', w: 360, h: 640, dpr: 3, frame: 'slim', colors: PAL.generic,
    p: { b: [70.8, 143.6, 8.0], diag: 5.2, px: [1080, 1920], sr: 2, bz: [12, 3.2, 12, 3.2], btn: BTN.android, cam: { t: 'single' } },
  },
  {
    id: 'android-standard', name: 'Android standard 360 × 800', category: 'generic', os: 'android', w: 360, h: 800, dpr: 3, frame: 'punch', colors: PAL.generic,
    p: { b: [71.2, 151.7, 7.9], diag: 6.2, px: [1080, 2400], sr: 6.4, cut: PUNCH, btn: BTN.android, cam: { t: 'square', n: 3 } },
  },
  {
    id: 'android-large', name: 'Android grand 412 × 915', category: 'generic', os: 'android', w: 412, h: 915, dpr: 2.625, frame: 'punch', colors: PAL.generic,
    p: { b: [76.0, 163.0, 8.2], diag: 6.7, px: [1080, 2400], sr: 6.4, cut: PUNCH, btn: BTN.android, cam: { t: 'square', n: 3 } },
  },

  // ---------------------------------------------------------------- Pliables : Samsung
  {
    id: 'galaxy-z-fold8-ultra', name: 'Galaxy Z Fold8 Ultra', skinMatch: 'Z Fold8 Ultra', os: 'android', dpr: 2.625, colors: PAL.fold8u,
    fold: { kind: 'book' },
    ...fold(
      { w: 411, h: 960, frame: 'fold-cover', approx: true, p: { b: [72.8, 158.4, 8.9], diag: 6.5, px: [1080, 2520], sr: 4.4, cut: PUNCH, hinge: 'left', btn: BTN.foldCover, cam: { t: 'pill-v', n: 3 } } },
      { w: 859, h: 954, frame: 'fold-open', approx: true, p: { b: [143.2, 158.4, 4.1], diag: 8.0, px: [2256, 2504], sr: 3.8, cut: { t: 'punch', d: 3.3, cx: 0.75, y: 4.4 }, hinge: 'v', crease: 'v', btn: BTN.foldOpen } },
    ),
  },
  {
    // Format « passeport » : plus large et plus court, écran intérieur 4:3 à l'horizontale.
    id: 'galaxy-z-fold8', name: 'Galaxy Z Fold8', skinMatch: 'Z Fold8', os: 'android', dpr: 2.625, colors: PAL.fold8,
    fold: { kind: 'book' },
    ...fold(
      { w: 475, h: 751, frame: 'fold-cover', approx: true, p: { b: [81.9, 123.9, 9.7], diag: 5.5, px: [1248, 1972], sr: 5.2, cut: PUNCH, hinge: 'left', btn: BTN.passCover, cam: { t: 'pill-v', n: 2 } } },
      { w: 933, h: 696, frame: 'fold-open', approx: true, p: { b: [161.4, 123.9, 4.5], diag: 7.6, px: [2448, 1828], sr: 4.2, cut: { t: 'punch', d: 3.3, cx: 0.75, y: 4.2 }, hinge: 'v', crease: 'v', btn: BTN.foldOpen } },
    ),
  },
  {
    id: 'galaxy-z-flip8', name: 'Galaxy Z Flip8', skinMatch: 'Z Flip8', os: 'android', dpr: 3, colors: PAL.flip8,
    fold: { kind: 'flip' },
    ...fold(
      {
        w: 361, h: 399, dpr: 2.625, frame: 'flip-cover-full', approx: true,
        p: {
          b: [75.4, 85.7, 13.1], diag: 4.1, px: [948, 1048], sr: 6.6, br: [5.2, 5.2, 9.4, 9.4], bz: [4.9, 2.7, 3.2, 2.7], hinge: 'top', btn: BTN.flipClosed,
          lens: [{ cx: -8.6, cy: -8.4, d: 11.6 }, { cx: -21.6, cy: -8.4, d: 11.6 }], flash: { cx: -31.2, cy: -8.4, d: 2.6 },
        },
      },
      { w: 360, h: 840, frame: 'flip-open', p: { b: [75.4, 166.9, 6.1], diag: 6.9, px: [1080, 2520], sr: 7.6, cut: PUNCH, hinge: 'h', crease: 'h', btn: BTN.flipOpen } },
    ),
  },
  {
    id: 'galaxy-z-trifold', name: 'Galaxy Z TriFold', skinMatch: ['Z TriFold', 'Z Tri Fold'], os: 'android', dpr: 2.625, colors: PAL.fold8u,
    fold: { kind: 'tri' },
    ...fold(
      { w: 411, h: 960, frame: 'fold-cover', approx: true, p: { b: [75.0, 159.2, 12.9], diag: 6.5, px: [1080, 2520], sr: 4.4, cut: PUNCH, hinge: 'left', btn: BTN.foldCover, cam: { t: 'pill-v', n: 3 } } },
      { w: 823, h: 603, frame: 'fold-open', approx: true, p: { b: [214.1, 159.2, 4.2], diag: 10.0, px: [2160, 1584], sr: 4, cut: { t: 'punch', d: 3.3, cx: 0.833, y: 4.4 }, hinge: [0.333, 0.667], crease: [0.333, 0.667], btn: BTN.foldOpen } },
    ),
  },
  {
    id: 'galaxy-z-fold7', name: 'Galaxy Z Fold7', skinMatch: 'Z Fold7', os: 'android', dpr: 2.625, colors: PAL.fold7,
    fold: { kind: 'book' },
    ...fold(
      { w: 411, h: 960, frame: 'fold-cover', p: { b: [72.8, 158.4, 8.9], diag: 6.5, px: [1080, 2520], sr: 4.4, cut: PUNCH, hinge: 'left', btn: BTN.foldCover, cam: { t: 'pill-v', n: 3 } } },
      { w: 750, h: 832, frame: 'fold-open', p: { b: [143.2, 158.4, 4.2], diag: 8.0, px: [1968, 2184], sr: 3.8, cut: { t: 'punch', d: 3.3, cx: 0.75, y: 4.4 }, hinge: 'v', crease: 'v', btn: BTN.foldOpen } },
    ),
  },
  {
    id: 'galaxy-z-flip7', name: 'Galaxy Z Flip7', skinMatch: 'Z Flip7', os: 'android', dpr: 3, colors: PAL.flip7,
    fold: { kind: 'flip' },
    ...fold(
      {
        w: 361, h: 399, dpr: 2.625, frame: 'flip-cover-full', approx: true,
        p: {
          b: [75.2, 85.5, 13.7], diag: 4.1, px: [948, 1048], sr: 6.6, br: [5.2, 5.2, 9.4, 9.4], bz: [4.9, 2.7, 3.2, 2.7], hinge: 'top', btn: BTN.flipClosed,
          lens: [{ cx: -8.6, cy: -8.4, d: 11.6 }, { cx: -21.6, cy: -8.4, d: 11.6 }], flash: { cx: -31.2, cy: -8.4, d: 2.6 },
        },
      },
      { w: 360, h: 840, frame: 'flip-open', p: { b: [75.2, 166.7, 6.5], diag: 6.9, px: [1080, 2520], sr: 7.6, cut: PUNCH, hinge: 'h', crease: 'h', btn: BTN.flipOpen } },
    ),
  },
  {
    id: 'galaxy-z-fold6', name: 'Galaxy Z Fold6', skinMatch: 'Z Fold6', os: 'android', dpr: 2.625, colors: PAL.fold7,
    fold: { kind: 'book' },
    ...fold(
      { w: 369, h: 905, frame: 'fold-cover', approx: true, p: { b: [68.1, 153.5, 12.1], diag: 6.3, px: [968, 2376], sr: 4.2, cut: PUNCH, hinge: 'left', btn: BTN.foldCover, cam: { t: 'lenses-v', n: 3 } } },
      { w: 707, h: 823, frame: 'fold-open', approx: true, p: { b: [132.6, 153.5, 5.6], diag: 7.6, px: [1856, 2160], sr: 3.6, cut: { t: 'udc', d: 3.6, cx: 0.75, y: 4.6 }, hinge: 'v', crease: 'v', btn: BTN.foldOpen } },
    ),
  },
  {
    id: 'galaxy-z-fold5', name: 'Galaxy Z Fold4 / Fold5', skinMatch: ['Z Fold5', 'Z Fold4'], os: 'android', dpr: 2.625, colors: PAL.fold7,
    fold: { kind: 'book' },
    ...fold(
      { w: 344, h: 882, frame: 'fold-cover', p: { b: [67.1, 154.9, 13.4], diag: 6.2, px: [904, 2316], sr: 4.2, cut: PUNCH, hinge: 'left', btn: BTN.foldCover, cam: { t: 'lenses-v', n: 3 } } },
      { w: 690, h: 829, frame: 'fold-open', approx: true, p: { b: [129.9, 154.9, 6.1], diag: 7.6, px: [1812, 2176], sr: 3.6, cut: { t: 'udc', d: 3.6, cx: 0.75, y: 4.6 }, hinge: 'v', crease: 'v', btn: BTN.foldOpen } },
    ),
  },
  {
    id: 'galaxy-z-fold3', name: 'Galaxy Z Fold3', skinMatch: 'Z Fold3', os: 'android', dpr: 2.625, colors: PAL.fold7,
    fold: { kind: 'book' },
    ...fold(
      { w: 317, h: 864, frame: 'fold-cover', approx: true, p: { b: [67.1, 158.2, 16.0], diag: 6.2, px: [832, 2268], sr: 4, cut: PUNCH, hinge: 'left', btn: BTN.foldCover, cam: { t: 'lenses-v', n: 3 } } },
      { w: 674, h: 841, frame: 'fold-open', approx: true, p: { b: [128.1, 158.2, 6.4], diag: 7.6, px: [1768, 2208], sr: 3.4, cut: { t: 'udc', d: 3.6, cx: 0.75, y: 4.6 }, hinge: 'v', crease: 'v', btn: BTN.foldOpen } },
    ),
  },
  {
    id: 'galaxy-z-flip6', name: 'Galaxy Z Flip5 / Flip6', skinMatch: ['Z Flip7 FE', 'Z Flip6', 'Z Flip5'], os: 'android', dpr: 3, colors: PAL.flip7,
    fold: { kind: 'flip' },
    ...fold(
      {
        w: 360, h: 374, dpr: 2, frame: 'flip-cover', approx: true,
        p: {
          b: [71.9, 85.1, 14.9], diag: 3.4, px: [720, 748], sr: 6.4, br: [5, 5, 9, 9], bz: [6.4, 3.2, 3.6, 3.2], hinge: 'top', btn: BTN.flipClosed,
          lens: [{ cx: 8.4, cy: -8.2, d: 10.6 }, { cx: 20.6, cy: -8.2, d: 10.6 }], flash: { cx: 29.4, cy: -8.2, d: 2.4 },
        },
      },
      { w: 360, h: 880, frame: 'flip-open', p: { b: [71.9, 165.1, 6.9], diag: 6.7, px: [1080, 2640], sr: 7, cut: PUNCH, hinge: 'h', crease: 'h', btn: BTN.flipOpen } },
    ),
  },
  {
    id: 'galaxy-z-flip4', name: 'Galaxy Z Flip3 / Flip4', skinMatch: ['Z Flip4', 'Z Flip3'], os: 'android', dpr: 3, colors: PAL.flip7,
    fold: { kind: 'flip' },
    ...fold(
      {
        // Petit écran horizontal en haut à droite, les deux caméras à sa gauche.
        w: 256, h: 130, dpr: 2, frame: 'flip-mini', approx: true,
        p: {
          b: [71.9, 84.9, 15.9], diag: 1.9, px: [512, 260], sr: 2.6, br: [5, 5, 9, 9], bz: [8.6, 3.2, 54.4, 25.7], hinge: 'top', btn: BTN.flipClosed,
          lens: [{ cx: 7.6, cy: 19.6, d: 9.6 }, { cx: 18.4, cy: 19.6, d: 9.6 }], lensSpace: 'body',
        },
      },
      { w: 360, h: 880, frame: 'flip-open', p: { b: [71.9, 165.2, 6.9], diag: 6.7, px: [1080, 2640], sr: 7, cut: PUNCH, hinge: 'h', crease: 'h', btn: BTN.flipOpen } },
    ),
  },

  // ---------------------------------------------------------------- Pliables : autres marques
  {
    id: 'pixel-10-pro-fold', name: 'Pixel 9 Pro Fold / 10 Pro Fold / 11 Pro Fold', skin: { closed: 'pixel_10_pro_fold/closed', open: 'pixel_10_pro_fold/default' }, os: 'android', dpr: 2.625, colors: PAL.pixel,
    fold: { kind: 'book' },
    ...fold(
      { w: 443, h: 970, dpr: 2.4375, frame: 'fold-cover', approx: true, p: { b: [76.3, 155.2, 10.8], diag: 6.4, px: [1080, 2364], sr: 6.8, cut: PUNCH, hinge: 'left', btn: BTN.pixel, cam: { t: 'visor', n: 3 } } },
      { w: 755, h: 783, dpr: 2.75, frame: 'fold-open', p: { b: [150.4, 155.2, 5.2], diag: 8.0, px: [2076, 2152], sr: 5, cut: { t: 'punch', d: 3.3, cx: -5.6, y: 5.2 }, hinge: 'v', crease: 'v', btn: BTN.pixel } },
    ),
  },
  {
    // Premier Pixel Fold : ouvert, il est plus large que haut.
    id: 'pixel-fold', name: 'Pixel Fold (1re gén.)', skin: { closed: 'pixel_fold/closed', open: 'pixel_fold/default' }, os: 'android', dpr: 2.625, colors: PAL.pixel,
    fold: { kind: 'book' },
    ...fold(
      { w: 411, h: 797, frame: 'fold-cover', approx: true, p: { b: [79.5, 139.7, 12.1], diag: 5.8, px: [1080, 2092], sr: 5.4, cut: PUNCH, hinge: 'left', btn: BTN.pixel, cam: { t: 'visor', n: 3 } } },
      { w: 841, h: 701, frame: 'fold-open', approx: true, p: { b: [158.7, 139.7, 5.8], diag: 7.6, px: [2208, 1840], sr: 3.6, bz: [6.8, 3.2, 6.8, 3.2], cutInBezel: { cx: -9, cy: -3.4, d: 3 }, hinge: 'v', crease: 'v', btn: BTN.pixel } },
    ),
  },
  {
    id: 'oneplus-open', name: 'OnePlus Open', os: 'android', dpr: 2.75, colors: PAL.generic,
    fold: { kind: 'book' },
    ...fold(
      { w: 406, h: 903, frame: 'fold-cover', approx: true, p: { b: [73.3, 153.4, 11.7], diag: 6.31, px: [1116, 2484], sr: 5.6, cut: PUNCH, hinge: 'left', btn: BTN.foldCover, cam: { t: 'round', n: 3 } } },
      { w: 825, h: 887, frame: 'fold-open', approx: true, p: { b: [143.1, 153.4, 5.8], diag: 7.82, px: [2268, 2440], sr: 4.6, cut: { t: 'punch', d: 3.3, cx: 0.86, y: 4.6 }, hinge: 'v', crease: 'v', btn: BTN.foldOpen } },
    ),
  },
  {
    id: 'honor-magic-v', name: 'Honor Magic V3 / V5', os: 'android', dpr: 2.75, colors: PAL.huawei,
    fold: { kind: 'book' },
    ...fold(
      { w: 406, h: 864, frame: 'fold-cover', approx: true, p: { b: [74.3, 156.8, 8.8], diag: 6.43, px: [1116, 2376], sr: 5.4, cut: PUNCH, hinge: 'left', btn: BTN.foldCover, cam: { t: 'round', n: 3 } } },
      { w: 790, h: 855, frame: 'fold-open', approx: true, p: { b: [145.0, 156.8, 4.1], diag: 7.95, px: [2172, 2352], sr: 4.4, cut: { t: 'punch', d: 3.3, cx: 0.75, y: 4.4 }, hinge: 'v', crease: 'v', btn: BTN.foldOpen } },
    ),
  },
  {
    id: 'oppo-find-n5', name: 'OPPO Find N5', os: 'android', dpr: 2.75, colors: PAL.generic,
    fold: { kind: 'book' },
    ...fold(
      { w: 415, h: 951, frame: 'fold-cover', approx: true, p: { b: [74.4, 160.9, 8.93], diag: 6.62, px: [1140, 2616], sr: 5.2, cut: PUNCH, hinge: 'left', btn: BTN.foldCover, cam: { t: 'round', n: 3 } } },
      { w: 817, h: 902, frame: 'fold-open', approx: true, p: { b: [145.6, 160.9, 4.21], diag: 8.12, px: [2248, 2480], sr: 4.4, cut: { t: 'punch', d: 3.3, cx: 0.75, y: 4.4 }, hinge: 'v', crease: 'v', btn: BTN.foldOpen } },
    ),
  },
  {
    id: 'vivo-x-fold5', name: 'vivo X Fold5', os: 'android', dpr: 2.75, colors: PAL.generic,
    fold: { kind: 'book' },
    ...fold(
      { w: 426, h: 999, frame: 'fold-cover', approx: true, p: { b: [72.9, 160.0, 9.2], diag: 6.53, px: [1172, 2748], sr: 5.2, cut: PUNCH, hinge: 'left', btn: BTN.foldCover, cam: { t: 'round', n: 3 } } },
      { w: 800, h: 902, frame: 'fold-open', approx: true, p: { b: [142.4, 160.0, 4.3], diag: 8.03, px: [2200, 2480], sr: 4.4, cut: { t: 'punch', d: 3.3, cx: 0.75, y: 4.4 }, hinge: 'v', crease: 'v', btn: BTN.foldOpen } },
    ),
  },
  {
    id: 'huawei-mate-x6', name: 'Huawei Mate X6', os: 'android', dpr: 3, colors: PAL.huawei,
    fold: { kind: 'book' },
    ...fold(
      { w: 360, h: 813, frame: 'fold-cover', approx: true, p: { b: [73.0, 156.8, 9.9], diag: 6.45, px: [1080, 2440], sr: 5.6, cut: PUNCH, hinge: 'left', btn: BTN.foldCover, cam: { t: 'round', n: 3 } } },
      { w: 747, h: 813, frame: 'fold-open', approx: true, p: { b: [144.7, 156.8, 4.4], diag: 7.93, px: [2240, 2440], sr: 4.4, cut: { t: 'punch', d: 3.3, cx: 0.75, y: 4.4 }, hinge: 'v', crease: 'v', btn: BTN.foldOpen } },
    ),
  },
  {
    // Pliage en Z sur deux charnières : 1, 2 ou 3 volets.
    id: 'huawei-mate-xt', name: 'Huawei Mate XT / XTs (trois volets)', category: 'foldable', os: 'android', dpr: 3, colors: PAL.huawei, defaultState: 'triple',
    fold: { kind: 'z' },
    states: [
      { id: 'single', label: '1 écran', w: 336, h: 744, frame: 'fold-cover', approx: true, p: { b: [73.0, 156.7, 12.8], diag: 6.4, px: [1008, 2232], sr: 4.6, cut: PUNCH, hinge: 'left', btn: BTN.foldCover, cam: { t: 'round', n: 3 } } },
      { id: 'double', label: '2 écrans', w: 683, h: 744, frame: 'fold-open', approx: true, p: { b: [143.0, 156.7, 7.45], diag: 7.9, px: [2048, 2232], sr: 4.6, cut: PUNCH, hinge: 'v', crease: 'v', btn: BTN.foldOpen } },
      { id: 'triple', label: '3 écrans', w: 1061, h: 744, frame: 'fold-open', approx: true, p: { b: [219.0, 156.7, 3.6], diag: 10.2, px: [3184, 2232], sr: 4.6, cut: { t: 'punch', d: 3.3, cx: 0.5, y: 4.4 }, hinge: [0.333, 0.667], crease: [0.333, 0.667], btn: BTN.foldOpen } },
    ],
  },
  {
    id: 'xiaomi-mix-flip', name: 'Xiaomi Mix Flip / Mix Flip 2', os: 'android', dpr: 3, colors: PAL.xiaomi,
    fold: { kind: 'flip' },
    ...fold(
      {
        w: 403, h: 464, frame: 'flip-cover-full', approx: true,
        p: {
          b: [74.0, 86.2, 16.0], diag: 4.01, px: [1208, 1392], sr: 6.4, br: [5, 5, 9, 9], bz: [4.6, 2.4, 2.8, 2.4], hinge: 'top', btn: BTN.flipClosed,
          lens: [{ cx: 8.6, cy: -8.4, d: 11.6 }, { cx: 21.4, cy: -8.4, d: 11.6 }],
        },
      },
      { w: 408, h: 971, frame: 'flip-open', approx: true, p: { b: [74.0, 167.0, 7.8], diag: 6.86, px: [1224, 2912], sr: 7, cut: PUNCH, hinge: 'h', crease: 'h', btn: BTN.flipOpen } },
    ),
  },
  {
    id: 'motorola-razr', name: 'Motorola razr 50 / 60 / razr 2025', os: 'android', dpr: 2.75, colors: PAL.moto,
    fold: { kind: 'flip' },
    ...fold(
      {
        w: 384, h: 388, frame: 'flip-cover-full', approx: true,
        p: {
          b: [74.0, 88.1, 15.9], diag: 3.6, px: [1056, 1066], sr: 6, br: [4.6, 4.6, 9, 9], bz: [7.6, 3.4, 4.2, 3.4], hinge: 'top', btn: BTN.flipClosed,
          lens: [{ cx: 8, cy: -8, d: 10.4 }, { cx: 20, cy: -8, d: 10.4 }],
        },
      },
      { w: 393, h: 960, frame: 'flip-open', approx: true, p: { b: [74.0, 171.3, 7.25], diag: 6.9, px: [1080, 2640], sr: 6.8, cut: PUNCH, hinge: 'h', crease: 'h', btn: BTN.flipOpen } },
    ),
  },
  {
    id: 'motorola-razr-ultra', name: 'Motorola razr 50 ultra / 60 ultra / razr ultra 2025', os: 'android', dpr: 3, colors: PAL.moto,
    fold: { kind: 'flip' },
    ...fold(
      {
        w: 393, h: 463, dpr: 2.75, frame: 'flip-cover-full', approx: true,
        p: {
          b: [74.0, 88.1, 15.7], diag: 4.0, px: [1080, 1272], sr: 6.2, br: [4.6, 4.6, 9, 9], bz: [3.6, 2.4, 2.8, 2.4], hinge: 'top', btn: BTN.flipClosed,
          lens: [{ cx: 8.4, cy: -8.2, d: 11 }, { cx: 20.8, cy: -8.2, d: 11 }],
        },
      },
      { w: 408, h: 997, frame: 'flip-open', approx: true, p: { b: [74.0, 171.5, 7.2], diag: 7.0, px: [1224, 2992], sr: 6.8, cut: PUNCH, hinge: 'h', crease: 'h', btn: BTN.flipOpen } },
    ),
  },
  {
    id: 'surface-duo', name: 'Surface Duo', category: 'foldable', os: 'android', dpr: 2.5, colors: [['Glacier', '#e9e9e6'], ['Obsidienne', '#2c2d30']], defaultState: 'dual',
    fold: { kind: 'dual' },
    states: [
      { id: 'single', label: '1 écran', w: 540, h: 720, frame: 'duo-single', p: { b: [93.3, 145.2, 9.9], diag: 5.6, px: [1350, 1800], sr: 1.2, br: 5, bz: [16.6, 2.8, 16.6, 2.8], form: 'dual', btn: BTN.android, cam: { t: 'single' } } },
      { id: 'dual', label: '2 écrans', w: 1114, h: 720, frame: 'dual', hingeMask: { offset: 540, mask: 34 }, p: { b: [186.9, 145.2, 4.8], diag: 8.1, px: [2784, 1800], sr: 1.2, br: 5, bz: [16.6, 2.8, 16.6, 2.8], form: 'dual', hinge: 'gap', btn: BTN.android } },
    ],
  },

  // ---------------------------------------------------------------- Tablettes
  {
    id: 'android-tablet-8', name: 'Tablette Android 8,7 pouces', category: 'tablet', os: 'android-tablet', w: 600, h: 960, dpr: 2, colors: PAL.tabletAndroid, approx: true,
    p: { b: [126.8, 211.0, 8.0], diag: 8.7, px: [1200, 1920], sr: 3, bz: [8.6, 8.6, 8.6, 8.6], form: 'tablet', bezelCam: true, btn: BTN.tablet, cam: { t: 'single' } },
  },
  {
    id: 'ipad-mini', name: 'iPad mini (A17 Pro)', category: 'tablet', os: 'ipados', w: 744, h: 1133, dpr: 2, colors: PAL.ipad,
    p: { b: [134.8, 195.4, 6.3], diag: 8.3, px: [1488, 2266], sr: 7.4, form: 'tablet', bezelCam: true, btn: BTN.ipad, cam: { t: 'single' } },
  },
  {
    id: 'galaxy-tab-a9', name: 'Galaxy Tab A9+', skinMatch: ['Tab A9+', 'Tab A9 Plus'], category: 'tablet', os: 'android-tablet', w: 800, h: 1280, dpr: 1.5, colors: PAL.tabletAndroid, approx: true,
    p: { b: [168.7, 257.1, 6.9], diag: 11, px: [1200, 1920], sr: 3.4, form: 'tablet', bezelCam: true, btn: BTN.tablet, cam: { t: 'single' } },
  },
  {
    id: 'galaxy-tab-s10', name: 'Galaxy Tab S9 / S10 / S11', skinMatch: ['Tab S11', 'Tab S10', 'Tab S9'], category: 'tablet', os: 'android-tablet', w: 800, h: 1280, dpr: 2, colors: PAL.tabletAndroid, approx: true,
    p: { b: [165.8, 254.3, 6.0], diag: 11, px: [1600, 2560], sr: 4.2, form: 'tablet', bezelCam: true, btn: BTN.tablet, cam: { t: 'lenses-v', n: 2 } },
  },
  {
    id: 'xiaomi-pad', name: 'Xiaomi Pad 7 / Redmi Pad Pro', category: 'tablet', os: 'android-tablet', w: 800, h: 1280, dpr: 2.25, colors: PAL.xiaomi, approx: true,
    p: { b: [166.3, 254.0, 6.2], diag: 11.2, px: [1800, 2880], sr: 4.6, form: 'tablet', bezelCam: true, btn: BTN.tablet, cam: { t: 'square', n: 1 } },
  },
  {
    id: 'pixel-tablet', name: 'Pixel Tablet', skin: 'pixel_tablet', category: 'tablet', os: 'android-tablet', w: 1280, h: 800, dpr: 2, colors: PAL.pixel,
    p: { b: [258.0, 169.0, 8.1], diag: 10.95, px: [2560, 1600], sr: 3, form: 'tablet', bezelCam: true, btn: BTN.tablet, cam: { t: 'single' } },
  },
  {
    id: 'lenovo-tab', name: 'Lenovo Tab M11 / Tab P12', category: 'tablet', os: 'android-tablet', w: 800, h: 1280, dpr: 1.5, colors: PAL.tabletAndroid, approx: true,
    p: { b: [166.2, 255.3, 7.2], diag: 11, px: [1200, 1920], sr: 3.6, form: 'tablet', bezelCam: true, btn: BTN.tablet, cam: { t: 'single' } },
  },
  {
    id: 'huawei-matepad', name: 'Huawei MatePad 11,5 / MatePad Air', category: 'tablet', os: 'android-tablet', w: 800, h: 1222, dpr: 1.8, colors: PAL.huawei, approx: true,
    p: { b: [176.8, 260.0, 7.0], diag: 11.5, px: [1440, 2200], sr: 3.8, form: 'tablet', bezelCam: true, btn: BTN.tablet, cam: { t: 'round', n: 1 } },
  },
  {
    id: 'ipad', name: 'iPad (10e et 11e gén.) / iPad Air 11 pouces', category: 'tablet', os: 'ipados', w: 820, h: 1180, dpr: 2, colors: PAL.ipad,
    p: { b: [179.5, 248.6, 7.0], diag: 10.9, px: [1640, 2360], sr: 8, form: 'tablet', bezelCam: true, btn: BTN.ipad, cam: { t: 'single' } },
  },
  {
    id: 'ipad-pro-11', name: 'iPad Pro 11 pouces (M4, M5)', category: 'tablet', os: 'ipados', w: 834, h: 1210, dpr: 2, colors: PAL.ipad,
    p: { b: [177.5, 249.7, 5.3], diag: 11.1, px: [1668, 2420], sr: 8.4, form: 'tablet', bezelCam: true, btn: BTN.ipad, cam: { t: 'square', n: 2 } },
  },
  {
    id: 'surface-pro', name: 'Surface Pro 7', category: 'tablet', os: 'windows-touch', w: 912, h: 1368, dpr: 2, colors: [['Platine', '#cfd0d2'], ['Noir mat', '#2a2b2e']],
    p: { b: [201.0, 292.0, 8.5], diag: 12.3, px: [1824, 2736], sr: 1.5, form: 'tablet', bezelCam: true, btn: BTN.tablet, cam: { t: 'single' } },
  },
  {
    id: 'ipad-air-13', name: 'iPad Air 13 pouces', category: 'tablet', os: 'ipados', w: 1024, h: 1366, dpr: 2, colors: PAL.ipad,
    p: { b: [214.9, 280.6, 6.1], diag: 13, px: [2048, 2732], sr: 9, form: 'tablet', bezelCam: true, btn: BTN.ipad, cam: { t: 'single' } },
  },
  {
    id: 'ipad-pro-13', name: 'iPad Pro 13 pouces (M4, M5)', category: 'tablet', os: 'ipados', w: 1032, h: 1376, dpr: 2, colors: PAL.ipad,
    p: { b: [215.5, 281.6, 5.1], diag: 13, px: [2064, 2752], sr: 9, form: 'tablet', bezelCam: true, btn: BTN.ipad, cam: { t: 'square', n: 2 } },
  },

  // ---------------------------------------------------------------- Ordinateurs portables
  {
    id: 'laptop-hd', name: 'PC portable 15,6 pouces HD (1366 × 768)', category: 'desktop', os: 'windows', w: 1366, h: 768, dpr: 1, fixed: true, colors: PAL.pc,
    p: { form: 'laptop', b: [359, 233, 7], diag: 15.6, px: [1366, 768], sr: 0, br: [7, 7, 1.5, 1.5], bz: [10, 8.5, 20, 8.5], bezelCam: true, base: { w: 362, d: 240, h: 15 } },
  },
  {
    id: 'laptop-1536', name: 'PC portable Full HD à 125 %', category: 'desktop', os: 'windows', w: 1536, h: 864, dpr: 1.25, fixed: true, colors: PAL.pc,
    p: { form: 'laptop', b: [357, 229, 6.5], diag: 15.6, px: [1920, 1080], sr: 0, br: [7, 7, 1.5, 1.5], bz: [8.4, 7, 16.5, 7], bezelCam: true, base: { w: 360, d: 236, h: 14 } },
  },
  {
    id: 'laptop-1920', name: 'PC portable Full HD à 100 %', category: 'desktop', os: 'windows', w: 1920, h: 1080, dpr: 1, fixed: true, colors: PAL.pc,
    p: { form: 'laptop', b: [357, 229, 6.5], diag: 15.6, px: [1920, 1080], sr: 0, br: [7, 7, 1.5, 1.5], bz: [8.4, 7, 16.5, 7], bezelCam: true, base: { w: 360, d: 236, h: 14 } },
  },
  {
    id: 'macbook-air-13', name: 'MacBook Air 13 pouces', category: 'desktop', os: 'macos', w: 1470, h: 956, dpr: 2, fixed: true, colors: PAL.mac,
    p: { form: 'laptop', b: [304.1, 207, 5], diag: 13.6, px: [2560, 1664], sr: [4, 4, 0, 0], br: [9, 9, 2, 2], bz: [7, 6.2, 9, 6.2], notch: true, base: { w: 304.1, d: 215, h: 11.3 } },
  },
  {
    id: 'macbook-air-15', name: 'MacBook Air 15 pouces', category: 'desktop', os: 'macos', w: 1710, h: 1112, dpr: 2, fixed: true, colors: PAL.mac,
    p: { form: 'laptop', b: [340.4, 229, 5], diag: 15.3, px: [2880, 1864], sr: [4, 4, 0, 0], br: [9, 9, 2, 2], bz: [7, 6.2, 9, 6.2], notch: true, base: { w: 340.4, d: 237.6, h: 11.5 } },
  },
  {
    id: 'macbook-pro-14', name: 'MacBook Pro 14 pouces', category: 'desktop', os: 'macos', w: 1512, h: 982, dpr: 2, fixed: true, colors: [['Noir sidéral', '#2b2c2f'], ['Argent', '#d6d7d9']],
    p: { form: 'laptop', b: [312.6, 214, 6], diag: 14.2, px: [3024, 1964], sr: [4, 4, 0, 0], br: [9, 9, 2, 2], bz: [6.8, 5.6, 10, 5.6], notch: true, base: { w: 312.6, d: 221.2, h: 15.5 } },
  },
  {
    id: 'macbook-pro-16', name: 'MacBook Pro 16 pouces', category: 'desktop', os: 'macos', w: 1728, h: 1117, dpr: 2, fixed: true, colors: [['Noir sidéral', '#2b2c2f'], ['Argent', '#d6d7d9']],
    p: { form: 'laptop', b: [355.7, 241, 6], diag: 16.2, px: [3456, 2234], sr: [4, 4, 0, 0], br: [9, 9, 2, 2], bz: [6.8, 5.8, 10, 5.8], notch: true, base: { w: 355.7, d: 248.1, h: 16.8 } },
  },

  // ---------------------------------------------------------------- Écrans d'ordinateur
  {
    id: 'desktop-fhd', name: 'Écran 24 pouces Full HD', category: 'bigscreen', os: 'windows', w: 1920, h: 1080, dpr: 1, fixed: true, colors: PAL.monitor,
    p: { form: 'monitor', b: [540, 320, 18], diag: 23.8, px: [1920, 1080], sr: 0, br: 4, bz: [6.5, 6.5, 14, 6.5], stand: { kind: 'column', h: 120, foot: [220, 170] } },
  },
  {
    id: 'imac-24', name: 'iMac 24 pouces (4,5K)', category: 'pc', os: 'macos', w: 2240, h: 1260, dpr: 2, fixed: true, colors: PAL.imac,
    p: { form: 'aio', b: [547, 370, 11.5], diag: 23.5, px: [4480, 2520], sr: 0, br: 12, bz: [15, 14, 51, 14], bezelCam: true, stand: { kind: 'blade', h: 95, foot: [150, 147] } },
  },
  {
    id: 'desktop-qhd', name: 'Écran 27 pouces 2K (QHD)', category: 'bigscreen', os: 'windows', w: 2560, h: 1440, dpr: 1, fixed: true, colors: PAL.monitor,
    p: { form: 'monitor', b: [612, 364, 20], diag: 27, px: [2560, 1440], sr: 0, br: 4, bz: [6.5, 6.5, 15, 6.5], stand: { kind: 'column', h: 130, foot: [240, 190] } },
  },
  {
    id: 'studio-display', name: 'Écran 27 pouces 5K', category: 'bigscreen', os: 'macos', w: 2560, h: 1440, dpr: 2, fixed: true, colors: [['Argent', '#d6d7d9']],
    p: { form: 'monitor', b: [623, 362, 30], diag: 27, px: [5120, 2880], sr: 0, br: 10, bz: [13, 13, 13, 13], bezelCam: true, stand: { kind: 'blade', h: 115, foot: [170, 168] } },
  },
  {
    id: 'ultrawide', name: 'Écran ultra-large 34 pouces (21:9)', category: 'bigscreen', os: 'windows', w: 3440, h: 1440, dpr: 1, fixed: true, colors: PAL.monitor,
    p: { form: 'monitor', b: [810, 362, 25], diag: 34, px: [3440, 1440], sr: 0, br: 4, bz: [8, 8, 16, 8], stand: { kind: 'column', h: 135, foot: [300, 220] } },
  },
  {
    id: 'desktop-4k', name: 'Écran 27 pouces 4K', category: 'bigscreen', os: 'windows', w: 3840, h: 2160, dpr: 1, fixed: true, colors: PAL.monitor,
    p: { form: 'monitor', b: [612, 364, 20], diag: 27, px: [3840, 2160], sr: 0, br: 4, bz: [6.5, 6.5, 15, 6.5], stand: { kind: 'column', h: 130, foot: [240, 190] } },
  },

  // ---------------------------------------------------------------- Téléviseurs
  // Les navigateurs des téléviseurs affichent les pages en 1920 × 1080 (Tizen, webOS) ou 960 × 540 (Google TV).
  {
    id: 'tv-43-googletv', name: 'Téléviseur 43 pouces Full HD (Google TV)', skin: 'tv_1080p', category: 'tv', os: 'tv', w: 960, h: 540, dpr: 2, fixed: true, colors: PAL.tv,
    p: { form: 'tv', b: [963, 563, 78], diag: 43, px: [1920, 1080], sr: 0, br: 2, bz: [9, 9, 14, 9], chin: 'logo', stand: { kind: 'feet', h: 62, at: [0.12, 0.88] } },
  },
  {
    id: 'tv-55-tizen', name: 'Téléviseur 55 pouces 4K QLED (Tizen)', category: 'tv', os: 'tv', w: 1920, h: 1080, dpr: 2, fixed: true, colors: PAL.tv,
    p: { form: 'tv', b: [1227, 706, 26], diag: 55, px: [3840, 2160], sr: 0, br: 2, bz: [6, 6, 9, 6], chin: 'sensor', stand: { kind: 'pedestal', h: 72, w: 340 } },
  },
  {
    id: 'tv-65-webos', name: 'Téléviseur 65 pouces 4K OLED (webOS)', category: 'tv', os: 'tv', w: 1920, h: 1080, dpr: 2, fixed: true, colors: PAL.tv,
    p: { form: 'tv', b: [1446, 830, 24], diag: 65, px: [3840, 2160], sr: 0, br: 1.5, bz: [5, 5, 7, 5], chin: 'sensor', stand: { kind: 'pedestal', h: 66, w: 420 } },
  },
  {
    id: 'tv-75-googletv', name: 'Téléviseur 75 pouces 4K (Google TV)', skin: 'tv_4k', category: 'tv', os: 'tv', w: 960, h: 540, dpr: 4, fixed: true, colors: PAL.tv,
    p: { form: 'tv', b: [1673, 963, 60], diag: 75, px: [3840, 2160], sr: 0, br: 2, bz: [8, 8, 13, 8], chin: 'logo', stand: { kind: 'feet', h: 80, at: [0.1, 0.9] } },
  },
  {
    id: 'tv-85-frame', name: 'Téléviseur 85 pouces 4K mural (cadre fin)', category: 'tv', os: 'tv', w: 1920, h: 1080, dpr: 2, fixed: true, colors: PAL.tv,
    p: { form: 'tv', b: [1898, 1088, 25], diag: 85, px: [3840, 2160], sr: 0, br: 1, bz: [4, 4, 4, 4], chin: null, stand: { kind: 'wall' } },
  },
  {
    id: 'tv-googletv-streamer', name: 'Google TV Streamer / Chromecast (téléviseur 55 pouces)', skin: 'tv_4k', category: 'tv', os: 'tv', w: 960, h: 540, dpr: 4, fixed: true, colors: PAL.tv,
    p: { form: 'tv', b: [1227, 706, 26], diag: 55, px: [3840, 2160], sr: 0, br: 2, bz: [6, 6, 9, 6], chin: 'logo', stand: { kind: 'feet', h: 62, at: [0.12, 0.88] } },
  },
  {
    id: 'tv-androidtv', name: 'Android TV (Sony, TCL, Philips…) 50 pouces', skin: 'tv_1080p', category: 'tv', os: 'tv', w: 960, h: 540, dpr: 2, fixed: true, colors: PAL.tv, approx: true,
    p: { form: 'tv', b: [1117, 648, 70], diag: 50, px: [1920, 1080], sr: 0, br: 2, bz: [7, 7, 11, 7], chin: 'logo', stand: { kind: 'feet', h: 66, at: [0.14, 0.86] } },
  },
  {
    id: 'tv-appletv', name: 'Apple TV 4K (téléviseur 55 pouces)', category: 'tv', os: 'tv', w: 1920, h: 1080, dpr: 2, fixed: true, colors: PAL.tv, approx: true,
    p: { form: 'tv', b: [1227, 706, 26], diag: 55, px: [3840, 2160], sr: 0, br: 2, bz: [6, 6, 9, 6], chin: 'sensor', stand: { kind: 'pedestal', h: 72, w: 340 }, box: { t: 'mini', w: 93, h: 31 } },
  },
  {
    id: 'tv-firetv', name: 'Fire TV (Silk) 43 pouces', category: 'tv', os: 'tv', w: 960, h: 540, dpr: 2, fixed: true, colors: PAL.tv, approx: true,
    p: { form: 'tv', b: [963, 563, 78], diag: 43, px: [1920, 1080], sr: 0, br: 2, bz: [9, 9, 14, 9], chin: 'logo', stand: { kind: 'feet', h: 62, at: [0.12, 0.88] } },
  },

  // ---------------------------------------------------------------- Ordinateurs portables (suite)
  {
    id: 'chromebook-11', name: 'Chromebook 11,6 pouces (éducation)', category: 'desktop', os: 'chromeos', w: 1366, h: 768, dpr: 1, fixed: true, colors: PAL.pc, approx: true,
    p: { form: 'laptop', b: [292, 204, 19], diag: 11.6, px: [1366, 768], sr: 0, br: [7, 7, 1.5, 1.5], bz: [12, 10, 26, 10], bezelCam: true, base: { w: 292, d: 204, h: 19 } },
  },
  {
    id: 'chromebook-14', name: 'Chromebook Plus 14 pouces Full HD', category: 'desktop', os: 'chromeos', w: 1536, h: 864, dpr: 1.25, fixed: true, colors: PAL.pc, approx: true,
    p: { form: 'laptop', b: [323, 213, 18], diag: 14, px: [1920, 1080], sr: 0, br: [7, 7, 1.5, 1.5], bz: [9, 7, 22, 7], bezelCam: true, base: { w: 323, d: 220, h: 17 } },
  },
  {
    id: 'surface-laptop-13', name: 'Surface Laptop 13,8 pouces', category: 'desktop', os: 'windows', w: 1536, h: 1024, dpr: 1.5, fixed: true, colors: PAL.mac, approx: true,
    p: { form: 'laptop', b: [301, 220, 5], diag: 13.8, px: [2304, 1536], sr: [3, 3, 0, 0], br: [8, 8, 2, 2], bz: [9, 6.5, 10, 6.5], bezelCam: true, base: { w: 301, d: 220, h: 17.5 } },
  },
  {
    id: 'surface-laptop-15', name: 'Surface Laptop 15 pouces', category: 'desktop', os: 'windows', w: 1664, h: 1109, dpr: 1.5, fixed: true, colors: PAL.mac, approx: true,
    p: { form: 'laptop', b: [329, 239, 5], diag: 15, px: [2496, 1664], sr: [3, 3, 0, 0], br: [8, 8, 2, 2], bz: [9, 6.5, 10, 6.5], bezelCam: true, base: { w: 329, d: 239, h: 18 } },
  },

  // ---------------------------------------------------------------- Ordinateurs de bureau
  {
    id: 'pc-tower-24', name: 'PC de bureau (tour) + écran 24 pouces Full HD', category: 'pc', os: 'windows', w: 1920, h: 1080, dpr: 1, fixed: true, colors: PAL.monitor,
    p: { form: 'monitor', b: [540, 320, 18], diag: 23.8, px: [1920, 1080], sr: 0, br: 4, bz: [6.5, 6.5, 14, 6.5], stand: { kind: 'column', h: 120, foot: [220, 170] }, box: { t: 'tower', w: 200, h: 440 } },
  },
  {
    id: 'aio-24-windows', name: 'Tout-en-un Windows 23,8 pouces Full HD', category: 'pc', os: 'windows', w: 1920, h: 1080, dpr: 1, fixed: true, colors: PAL.pc, approx: true,
    p: { form: 'aio', b: [540, 352, 9], diag: 23.8, px: [1920, 1080], sr: 0, br: 6, bz: [9, 7, 47, 7], bezelCam: true, stand: { kind: 'blade', h: 110, foot: [190, 180] }, bezelColor: '#101012' },
  },
  {
    id: 'aio-27-qhd', name: 'Tout-en-un 27 pouces QHD (125 %)', category: 'pc', os: 'windows', w: 2048, h: 1152, dpr: 1.25, fixed: true, colors: PAL.pc, approx: true,
    p: { form: 'aio', b: [614, 398, 10], diag: 27, px: [2560, 1440], sr: 0, br: 6, bz: [9, 7, 52, 7], bezelCam: true, stand: { kind: 'blade', h: 120, foot: [210, 200] }, bezelColor: '#101012' },
  },
  {
    id: 'workstation-32', name: 'Station de travail + écran 32 pouces 4K (150 %)', category: 'pc', os: 'windows', w: 2560, h: 1440, dpr: 1.5, fixed: true, colors: PAL.monitor,
    p: { form: 'monitor', b: [726, 424, 22], diag: 31.5, px: [3840, 2160], sr: 0, br: 4, bz: [7, 7, 16, 7], stand: { kind: 'column', h: 140, foot: [280, 220] }, box: { t: 'tower', w: 230, h: 520 } },
  },
  {
    id: 'mini-pc-27', name: 'Mini-PC + écran 27 pouces QHD', category: 'pc', os: 'windows', w: 2560, h: 1440, dpr: 1, fixed: true, colors: PAL.monitor,
    p: { form: 'monitor', b: [612, 364, 20], diag: 27, px: [2560, 1440], sr: 0, br: 4, bz: [6.5, 6.5, 15, 6.5], stand: { kind: 'column', h: 130, foot: [240, 190] }, box: { t: 'mini', w: 130, h: 50 } },
  },

  // ---------------------------------------------------------------- Écrans (suite)
  {
    id: 'monitor-19', name: 'Écran 19 pouces (1440 × 900)', category: 'bigscreen', os: 'windows', w: 1440, h: 900, dpr: 1, fixed: true, colors: PAL.monitor,
    p: { form: 'monitor', b: [428, 280, 50], diag: 19, px: [1440, 900], sr: 0, br: 3, bz: [9, 9, 15, 9], stand: { kind: 'column', h: 100, foot: [200, 160] } },
  },
  {
    id: 'monitor-22', name: 'Écran 22 pouces Full HD', category: 'bigscreen', os: 'windows', w: 1920, h: 1080, dpr: 1, fixed: true, colors: PAL.monitor,
    p: { form: 'monitor', b: [500, 296, 40], diag: 21.5, px: [1920, 1080], sr: 0, br: 4, bz: [6.5, 6.5, 14, 6.5], stand: { kind: 'column', h: 110, foot: [200, 160] } },
  },
  {
    id: 'monitor-32-4k', name: 'Écran 32 pouces 4K (150 %)', category: 'bigscreen', os: 'windows', w: 2560, h: 1440, dpr: 1.5, fixed: true, colors: PAL.monitor,
    p: { form: 'monitor', b: [726, 424, 22], diag: 31.5, px: [3840, 2160], sr: 0, br: 4, bz: [7, 7, 16, 7], stand: { kind: 'column', h: 140, foot: [280, 220] } },
  },
  {
    id: 'super-ultrawide', name: 'Écran super ultra-large 49 pouces (32:9)', category: 'bigscreen', os: 'windows', w: 5120, h: 1440, dpr: 1, fixed: true, colors: PAL.monitor,
    p: { form: 'monitor', b: [1212, 364, 30], diag: 49, px: [5120, 1440], sr: 0, br: 5, bz: [8, 8, 18, 8], stand: { kind: 'column', h: 140, foot: [400, 260] } },
  },
  {
    id: 'dual-24', name: 'Double écran 2 × 24 pouces Full HD', category: 'bigscreen', os: 'windows', w: 3840, h: 1080, dpr: 1, fixed: true, colors: PAL.monitor,
    p: { form: 'monitor', sw: 1054, sh: 296.5, px: [3840, 1080], splits: 2, gap: 6, sr: 0, br: 4, bz: [6.5, 6.5, 14, 6.5], stand: { kind: 'columns', h: 120, foot: [220, 170], at: [0.25, 0.75] } },
  },
  {
    id: 'triple-24', name: 'Triple écran 3 × 24 pouces Full HD', category: 'bigscreen', os: 'windows', w: 5760, h: 1080, dpr: 1, fixed: true, colors: PAL.monitor,
    p: { form: 'monitor', sw: 1581, sh: 296.5, px: [5760, 1080], splits: 3, gap: 6, sr: 0, br: 4, bz: [6.5, 6.5, 14, 6.5], stand: { kind: 'columns', h: 120, foot: [220, 170], at: [0.1667, 0.5, 0.8333] } },
  },

  // ---------------------------------------------------------------- Montres
  {
    id: 'apple-watch-46', name: 'Apple Watch Series 10 / 11 (46 mm)', category: 'watch', os: 'watchos', w: 208, h: 248, dpr: 2, fixed: true, frame: 'watch', colors: PAL.appleWatch,
    p: { form: 'watch', b: [39, 46, 9.7], sw: 32.4, sh: 38.6, px: [416, 496], sr: 9.2, br: 11.6, crown: [0.34, 6.6, 2.4], btn: [['right', 0.56, 0.78]], strap: { w: 30, len: 34 } },
  },
  {
    id: 'apple-watch-42', name: 'Apple Watch Series 10 / 11 (42 mm)', category: 'watch', os: 'watchos', w: 187, h: 223, dpr: 2, fixed: true, frame: 'watch', colors: PAL.appleWatch,
    p: { form: 'watch', b: [36, 42, 9.7], sw: 29.1, sh: 34.7, px: [374, 446], sr: 8.4, br: 10.6, crown: [0.34, 6.2, 2.3], btn: [['right', 0.56, 0.78]], strap: { w: 27, len: 31 } },
  },
  {
    id: 'apple-watch-ultra', name: 'Apple Watch Ultra 3 (49 mm)', category: 'watch', os: 'watchos', w: 211, h: 257, dpr: 2, fixed: true, frame: 'watch', colors: PAL.watchUltra, approx: true,
    p: { form: 'watch', b: [44, 49, 12], sw: 31.7, sh: 38.6, px: [422, 514], sr: 6.8, br: 9.4, crown: [0.4, 7.6, 3.2], btn: [['right', 0.62, 0.84], ['left', 0.24, 0.44]], strap: { w: 33, len: 34, color: '#ff8a3d' } },
  },
  {
    id: 'apple-watch-se', name: 'Apple Watch SE (44 mm)', category: 'watch', os: 'watchos', w: 184, h: 224, dpr: 2, fixed: true, frame: 'watch', colors: PAL.appleWatch,
    p: { form: 'watch', b: [38, 44, 10.7], sw: 28.7, sh: 34.9, px: [368, 448], sr: 7.6, br: 10.2, crown: [0.34, 6.2, 2.3], btn: [['right', 0.56, 0.78]], strap: { w: 29, len: 33 } },
  },
  {
    id: 'galaxy-watch-44', name: 'Galaxy Watch8 (44 mm)', skin: 'wearos_xl_round', skinMatch: ['Galaxy Watch8 44', 'Galaxy Watch8'], category: 'watch', os: 'wearos', w: 240, h: 240, dpr: 2, fixed: true, frame: 'watch', colors: PAL.wear,
    p: { form: 'watch', b: [43.7, 46.0, 8.6], diag: 1.47, px: [480, 480], sr: 18.7, br: 21.8, btn: [['right', 0.3, 0.42], ['right', 0.58, 0.7]], strap: { w: 22, len: 34 } },
  },
  {
    id: 'galaxy-watch-40', name: 'Galaxy Watch8 (40 mm)', skin: 'wearos_large_round', skinMatch: ['Galaxy Watch8 40'], category: 'watch', os: 'wearos', w: 219, h: 219, dpr: 2, fixed: true, frame: 'watch', colors: PAL.wear,
    p: { form: 'watch', b: [40.4, 42.7, 8.6], diag: 1.34, px: [438, 438], sr: 17, br: 20.2, btn: [['right', 0.3, 0.42], ['right', 0.58, 0.7]], strap: { w: 20, len: 32 } },
  },
  {
    id: 'galaxy-watch-ultra', name: 'Galaxy Watch Ultra', skinMatch: ['Galaxy Watch Ultra'], category: 'watch', os: 'wearos', w: 240, h: 240, dpr: 2, fixed: true, frame: 'watch', colors: PAL.watchUltra,
    p: { form: 'watch', b: [47.1, 47.4, 12.1], diag: 1.5, px: [480, 480], sr: 19.05, br: 12, btn: [['right', 0.22, 0.34], ['right', 0.66, 0.78], ['left', 0.4, 0.6]], strap: { w: 24, len: 34 } },
  },
  {
    id: 'pixel-watch-45', name: 'Pixel Watch 3 / 4 (45 mm)', skin: 'wearos_large_round', category: 'watch', os: 'wearos', w: 228, h: 228, dpr: 2, fixed: true, frame: 'watch', colors: PAL.wear,
    p: { form: 'watch', b: [45, 45, 12.3], diag: 1.4, px: [456, 456], sr: 17.8, br: 22.5, crown: [0.5, 5.6, 2.6], btn: [['right', 0.18, 0.3]], strap: { w: 24, len: 34 } },
  },
  {
    id: 'pixel-watch-41', name: 'Pixel Watch 3 / 4 (41 mm)', skin: 'wearos_small_round', category: 'watch', os: 'wearos', w: 192, h: 192, dpr: 2, fixed: true, frame: 'watch', colors: PAL.wear,
    p: { form: 'watch', b: [41, 41, 12.3], diag: 1.2, px: [384, 384], sr: 15.2, br: 20.5, crown: [0.5, 5.2, 2.5], btn: [['right', 0.18, 0.3]], strap: { w: 21, len: 32 } },
  },
  {
    id: 'huawei-watch-gt', name: 'Huawei Watch GT 5 (46 mm)', category: 'watch', os: 'harmonyos', w: 233, h: 233, dpr: 2, fixed: true, frame: 'watch', colors: PAL.huawei, approx: true,
    p: { form: 'watch', b: [46, 46, 10.7], diag: 1.43, px: [466, 466], sr: 18.2, br: 23, crown: [0.32, 5.6, 2.8], btn: [['right', 0.62, 0.74]], strap: { w: 22, len: 34 } },
  },
  {
    id: 'huawei-watch-fit', name: 'Huawei Watch Fit 4', category: 'watch', os: 'harmonyos', w: 204, h: 240, dpr: 2, fixed: true, frame: 'watch', colors: PAL.huawei, approx: true,
    p: { form: 'watch', b: [37.7, 44.9, 9.3], diag: 1.82, px: [408, 480], sr: 7, br: 9, crown: [0.36, 5, 2], strap: { w: 26, len: 34 } },
  },
  {
    id: 'xiaomi-watch-s', name: 'Xiaomi Watch S4', category: 'watch', os: 'harmonyos', w: 233, h: 233, dpr: 2, fixed: true, frame: 'watch', colors: PAL.xiaomi, approx: true,
    p: { form: 'watch', b: [47.3, 47.3, 12], diag: 1.43, px: [466, 466], sr: 18.2, br: 23.6, crown: [0.3, 5.6, 2.6], btn: [['right', 0.62, 0.74]], strap: { w: 22, len: 34 } },
  },
  {
    id: 'redmi-watch', name: 'Redmi Watch 5', category: 'watch', os: 'harmonyos', w: 216, h: 257, dpr: 2, fixed: true, frame: 'watch', colors: PAL.xiaomi, approx: true,
    p: { form: 'watch', b: [41.2, 49.1, 11.4], diag: 2.07, px: [432, 514], sr: 7.6, br: 9.6, crown: [0.36, 5, 2], strap: { w: 26, len: 34 } },
  },
  {
    id: 'wear-rect', name: 'Montre Wear OS rectangulaire', skin: 'wearos_rect', category: 'watch', os: 'wearos', w: 201, h: 238, dpr: 2, fixed: true, frame: 'watch', colors: PAL.wear,
    p: { form: 'watch', b: [40, 47, 11], diag: 1.78, px: [402, 476], sr: 6, br: 8.5, crown: [0.4, 5, 2.2], strap: { w: 26, len: 34 } },
  },

  // ---------------------------------------------------------------- Casques
  // Fenêtre du navigateur flottant devant l'utilisateur (définition par défaut du navigateur du casque).
  {
    id: 'meta-quest', name: 'Meta Quest 3 / 3S (navigateur)', category: 'xr', os: 'android', w: 1280, h: 670, dpr: 1.5, fixed: true, colors: PAL.xr, approx: true,
    p: { form: 'panel', sw: 1280 * 0.27, sh: 670 * 0.27, sr: 9, br: 12, bz: [3, 3, 3, 3], grabber: false },
  },
  {
    id: 'vision-pro', name: 'Apple Vision Pro (Safari)', category: 'xr', os: 'visionos', w: 1280, h: 720, dpr: 2, fixed: true, colors: PAL.xr, approx: true,
    p: { form: 'panel', sw: 1280 * 0.27, sh: 720 * 0.27, sr: 13, br: 16, bz: [3, 3, 3, 3], grabber: true },
  },
  {
    id: 'htc-vive', name: 'HTC Vive Focus Vision / XR Elite (navigateur)', category: 'xr', os: 'android', w: 1280, h: 720, dpr: 1.5, fixed: true, colors: PAL.xr, approx: true,
    p: { form: 'panel', sw: 1280 * 0.27, sh: 720 * 0.27, sr: 8, br: 11, bz: [3, 3, 3, 3] },
  },
  {
    id: 'steamvr-desktop', name: 'Valve Index / PS VR2 sur PC (bureau SteamVR)', category: 'xr', os: 'windows', w: 1920, h: 1080, dpr: 1, fixed: true, colors: [['Fumé', '#3a3d44'], ['Verre', '#e9edf2']], approx: true,
    p: { form: 'panel', sw: 1920 * 0.2, sh: 1080 * 0.2, sr: 5, br: 7, bz: [3, 3, 3, 3] },
  },

  // ---------------------------------------------------------------- Consoles
  {
    id: 'switch', name: 'Nintendo Switch (mode portable)', category: 'console', os: 'console', w: 1280, h: 720, dpr: 1, fixed: true, colors: PAL.handheld, approx: true,
    p: {
      form: 'handheld', b: [173, 102, 13.9], diag: 6.2, px: [1280, 720], sr: 0, br: 4, bz: [12.5, 18, 12.5, 18], grips: { w: 34, colors: ['#00b9e8', '#ff4b55'] },
      controls: [{ t: 'stick', x: -17, y: 26, d: 14 }, { t: 'abxy', x: -17, y: 62, d: 20 }, { t: 'abxy', x: 17, right: true, y: 26, d: 20 }, { t: 'stick', x: 17, right: true, y: 62, d: 14 }],
    },
  },
  {
    id: 'switch-oled', name: 'Nintendo Switch OLED (mode portable)', category: 'console', os: 'console', w: 1280, h: 720, dpr: 1, fixed: true, colors: PAL.handheld, approx: true,
    p: {
      form: 'handheld', b: [175, 102, 13.9], diag: 7, px: [1280, 720], sr: 0, br: 4, bz: [9, 10, 9, 10], grips: { w: 34, colors: ['#e8e8e6', '#e8e8e6'] },
      controls: [{ t: 'stick', x: -17, y: 26, d: 14 }, { t: 'abxy', x: -17, y: 62, d: 20 }, { t: 'abxy', x: 17, right: true, y: 26, d: 20 }, { t: 'stick', x: 17, right: true, y: 62, d: 14 }],
    },
  },
  {
    id: 'switch-2', name: 'Nintendo Switch 2 (mode portable)', category: 'console', os: 'console', w: 1280, h: 720, dpr: 1.5, fixed: true, colors: PAL.handheld, approx: true,
    p: {
      form: 'handheld', b: [200, 116, 13.9], diag: 7.9, px: [1920, 1080], sr: 0, br: 4, bz: [9.5, 12, 9.5, 12], grips: { w: 36, colors: ['#2a2b30', '#2a2b30'] },
      controls: [{ t: 'stick', x: -18, y: 30, d: 15 }, { t: 'abxy', x: -18, y: 72, d: 22 }, { t: 'abxy', x: 18, right: true, y: 30, d: 22 }, { t: 'stick', x: 18, right: true, y: 72, d: 15 }],
    },
  },
  {
    id: 'steam-deck', name: 'Steam Deck LCD / OLED', category: 'console', os: 'linux', w: 1280, h: 800, dpr: 1, fixed: true, colors: PAL.handheld,
    p: {
      form: 'handheld', b: [298, 117, 49], diag: 7.4, px: [1280, 800], sr: 0, br: 18, bz: [11, 69, 11, 69],
      controls: [{ t: 'dpad', x: 22, y: 32, d: 22 }, { t: 'stick', x: 48, y: 26, d: 20 }, { t: 'pad', x: 34, y: 82, w: 32, h: 32 }, { t: 'abxy', x: -22, right: true, y: 32, d: 22 }, { t: 'stick', x: -48, right: true, y: 26, d: 20 }, { t: 'pad', x: -34, right: true, y: 82, w: 32, h: 32 }],
    },
  },
  {
    id: 'rog-ally', name: 'ROG Ally / Ally X (Windows, 150 %)', category: 'console', os: 'windows', w: 1280, h: 720, dpr: 1.5, fixed: true, colors: [['Blanc', '#ecebe8'], ['Noir', '#1d1e21']], approx: true,
    p: {
      form: 'handheld', b: [280, 111, 21], diag: 7, px: [1920, 1080], sr: 0, br: 16, bz: [11, 62, 11, 62],
      controls: [{ t: 'stick', x: 28, y: 30, d: 18 }, { t: 'dpad', x: 40, y: 74, d: 22 }, { t: 'abxy', x: -28, right: true, y: 30, d: 24 }, { t: 'stick', x: -42, right: true, y: 74, d: 18 }],
    },
  },
  {
    id: 'legion-go', name: 'Legion Go / Go S (Windows)', category: 'console', os: 'windows', w: 1280, h: 800, dpr: 2, fixed: true, colors: PAL.handheld, approx: true,
    p: {
      form: 'handheld', b: [210, 131, 20], diag: 8.8, px: [2560, 1600], sr: 0, br: 6, bz: [9, 9, 9, 9], grips: { w: 45 },
      controls: [{ t: 'stick', x: -22, y: 32, d: 18 }, { t: 'dpad', x: -22, y: 78, d: 22 }, { t: 'abxy', x: 22, right: true, y: 32, d: 24 }, { t: 'stick', x: 22, right: true, y: 78, d: 18 }],
    },
  },
  {
    id: 'ps5', name: 'PlayStation 5 (téléviseur 55 pouces)', category: 'console', os: 'console', w: 1920, h: 1080, dpr: 1, fixed: true, colors: PAL.tv, approx: true,
    p: { form: 'tv', b: [1227, 706, 26], diag: 55, px: [1920, 1080], sr: 0, br: 2, bz: [6, 6, 9, 6], chin: 'sensor', stand: { kind: 'pedestal', h: 72, w: 340 }, box: { t: 'tower', w: 104, h: 390 } },
  },
  {
    id: 'xbox-series', name: 'Xbox Series X|S (Edge, téléviseur 55 pouces)', category: 'console', os: 'console', w: 1920, h: 1080, dpr: 1, fixed: true, colors: PAL.tv, approx: true,
    p: { form: 'tv', b: [1227, 706, 26], diag: 55, px: [1920, 1080], sr: 0, br: 2, bz: [6, 6, 9, 6], chin: 'sensor', stand: { kind: 'pedestal', h: 72, w: 340 }, box: { t: 'tower', w: 151, h: 301 } },
  },

  // ---------------------------------------------------------------- Voitures
  {
    id: 'aaos-landscape', name: 'Android Automotive (paysage 1080 × 600)', skin: 'automotive_landscape', category: 'car', os: 'android', w: 1080, h: 600, dpr: 1, fixed: true, colors: PAL.car,
    p: { form: 'car', diag: 10.1, px: [1080, 600], sr: 0, br: 6, bz: [6, 6, 6, 6], stand: { kind: 'dash', h: 30 } },
  },
  {
    id: 'aaos-1024', name: 'Android Automotive (1024 × 768)', skin: 'automotive_1024', category: 'car', os: 'android', w: 1024, h: 768, dpr: 1, fixed: true, colors: PAL.car,
    p: { form: 'car', diag: 8, px: [1024, 768], sr: 0, br: 6, bz: [6, 6, 6, 6], stand: { kind: 'dash', h: 30 } },
  },
  {
    id: 'aaos-portrait', name: 'Android Automotive portrait (Volvo, Polestar…)', skin: 'automotive_large_portrait', category: 'car', os: 'android', w: 853, h: 1071, dpr: 1.5, fixed: true, colors: PAL.car,
    p: { form: 'car', diag: 11.2, px: [1280, 1606], sr: 0, br: 6, bz: [6, 6, 6, 6], stand: { kind: 'dash', h: 30 } },
  },
  {
    id: 'aaos-ultrawide', name: 'Android Automotive ultra-large (3904 × 1320)', skin: 'automotive_ultrawide_cutout', category: 'car', os: 'android', w: 1952, h: 660, dpr: 2, fixed: true, colors: PAL.car,
    p: { form: 'car', diag: 27, px: [3904, 1320], sr: 0, br: 8, bz: [6, 6, 6, 6], stand: { kind: 'dash', h: 30 } },
  },
  {
    id: 'carplay', name: 'Apple CarPlay (800 × 480)', category: 'car', os: 'carplay', w: 800, h: 480, dpr: 1, fixed: true, colors: PAL.car, approx: true,
    p: { form: 'car', diag: 7, px: [800, 480], sr: 0, br: 5, bz: [7, 7, 7, 7], stand: { kind: 'dash', h: 30 } },
  },
  {
    id: 'carplay-wide', name: 'Apple CarPlay grand écran (1920 × 720)', category: 'car', os: 'carplay', w: 1280, h: 480, dpr: 1.5, fixed: true, colors: PAL.car, approx: true,
    p: { form: 'car', diag: 12.3, px: [1920, 720], sr: 0, br: 6, bz: [7, 7, 7, 7], stand: { kind: 'dash', h: 30 } },
  },
  {
    id: 'android-auto', name: 'Android Auto (1280 × 720)', category: 'car', os: 'android', w: 1280, h: 720, dpr: 1, fixed: true, colors: PAL.car, approx: true,
    p: { form: 'car', diag: 8, px: [1280, 720], sr: 0, br: 5, bz: [7, 7, 7, 7], stand: { kind: 'dash', h: 30 } },
  },
  {
    id: 'android-auto-wide', name: 'Android Auto grand écran (1920 × 720)', category: 'car', os: 'android', w: 1280, h: 480, dpr: 1.5, fixed: true, colors: PAL.car, approx: true,
    p: { form: 'car', diag: 10.25, px: [1920, 720], sr: 0, br: 6, bz: [7, 7, 7, 7], stand: { kind: 'dash', h: 30 } },
  },
  {
    id: 'tesla-3', name: 'Tesla Model 3 / Y (15,4 pouces)', category: 'car', os: 'linux', w: 1280, h: 800, dpr: 1.5, fixed: true, colors: PAL.car, approx: true,
    p: { form: 'car', diag: 15.4, px: [1920, 1200], sr: 0, br: 7, bz: [7, 7, 7, 7], stand: { kind: 'dash', h: 20 } },
  },
  {
    id: 'tesla-s', name: 'Tesla Model S / X (17 pouces)', category: 'car', os: 'linux', w: 1467, h: 867, dpr: 1.5, fixed: true, colors: PAL.car, approx: true,
    p: { form: 'car', diag: 17, px: [2200, 1300], sr: 0, br: 7, bz: [7, 7, 7, 7], stand: { kind: 'dash', h: 20 } },
  },

  // ---------------------------------------------------------------- Liseuses, maison, bornes, affichage
  {
    id: 'kindle-paperwhite', name: 'Kindle Paperwhite (6,8 pouces)', category: 'smart', os: 'kindle', w: 618, h: 824, dpr: 2, colors: [['Noir', '#1f2023'], ['Jade', '#5f7f74'], ['Framboise', '#a24b5c']], approx: true,
    p: { form: 'tablet', b: [127.6, 176.7, 7.8], diag: 6.8, px: [1236, 1648], sr: 0, br: 6, bz: [12, 9.5, 18, 9.5] },
  },
  {
    id: 'kindle-scribe', name: 'Kindle Scribe (10,2 pouces)', category: 'smart', os: 'kindle', w: 930, h: 1240, dpr: 2, colors: [['Tungstène', '#5a5b5e'], ['Gris', '#8c8e91']], approx: true,
    p: { form: 'tablet', b: [196, 230, 5.4], diag: 10.2, px: [1860, 2480], sr: 0, br: 6, bz: [10.5, 10.6, 10.5, 30] },
  },
  {
    id: 'echo-show-8', name: 'Echo Show 8', category: 'smart', os: 'fireos', w: 1280, h: 800, dpr: 1, fixed: true, colors: PAL.smart, approx: true,
    p: { form: 'speaker', b: [200, 136, 20], diag: 8, px: [1280, 800], sr: 0, br: 9, bz: [12, 12, 17, 12], bezelCam: true, stand: { kind: 'fabric', from: 0.45, h: 6, color: '#3a3b3f' } },
  },
  {
    id: 'echo-show-15', name: 'Echo Show 15 (mural)', category: 'smart', os: 'fireos', w: 1920, h: 1080, dpr: 1, fixed: true, colors: PAL.smart, approx: true,
    p: { form: 'monitor', b: [402, 252, 35], diag: 15.6, px: [1920, 1080], sr: 0, br: 6, bz: [19, 19, 26, 19], bezelCam: true, stand: { kind: 'wall' } },
  },
  {
    id: 'nest-hub', name: 'Google Nest Hub (2e gén.)', category: 'smart', os: 'fuchsia', w: 1024, h: 600, dpr: 1, fixed: true, colors: PAL.smart, approx: true,
    p: { form: 'speaker', b: [177.4, 120, 8], diag: 7, px: [1024, 600], sr: 0, br: 7, bz: [11, 11, 20, 11], bezelColor: '#f2f2ef', stand: { kind: 'fabric', from: 0.7, h: 22, w: 140, color: '#e3e0da' } },
  },
  {
    id: 'nest-hub-max', name: 'Google Nest Hub Max', category: 'smart', os: 'fuchsia', w: 1280, h: 800, dpr: 1, fixed: true, colors: PAL.smart, approx: true,
    p: { form: 'speaker', b: [250, 182, 10], diag: 10, px: [1280, 800], sr: 0, br: 9, bz: [16, 15, 25, 15], bezelCam: true, bezelColor: '#f2f2ef', stand: { kind: 'fabric', from: 0.72, h: 28, w: 200, color: '#e3e0da' } },
  },
  {
    id: 'photo-frame', name: 'Cadre photo numérique 10,1 pouces', category: 'smart', os: 'android', w: 1280, h: 800, dpr: 1, fixed: true, colors: [['Bois clair', '#c9a77c'], ['Noyer', '#6e4b33'], ['Blanc', '#efeeea'], ['Noir', '#1f2023']], approx: true,
    p: { form: 'tablet', b: [262, 180, 18], diag: 10.1, px: [1280, 800], sr: 0, br: 3, bz: [22, 22, 22, 22], bezelColor: '#f6f5f1', stand: { kind: 'easel', h: 10 } },
  },
  {
    id: 'interactive-board', name: 'Tableau interactif 75 pouces 4K', category: 'smart', os: 'android', w: 1920, h: 1080, dpr: 2, fixed: true, colors: PAL.monitor, approx: true,
    p: { form: 'monitor', b: [1720, 1020, 90], diag: 75, px: [3840, 2160], sr: 0, br: 6, bz: [26, 26, 26, 26], speakerGrill: { y: 1005, w: 1200, h: 8 }, stand: { kind: 'wall' } },
  },
  {
    id: 'kiosk-order', name: 'Borne de commande 27 pouces (portrait)', category: 'smart', os: 'android', w: 1080, h: 1920, dpr: 1, fixed: true, colors: PAL.smart, approx: true,
    p: { form: 'kiosk', b: [420, 1000, 60], diag: 27, px: [1080, 1920], sr: 0, br: 14, bz: [30, 32, 360, 32], bezelCam: true, slot: { y: 760, w: 120 }, stand: { kind: 'kiosk', w: 120, h: 640, foot: 460 } },
  },
  {
    id: 'kiosk-totem', name: 'Totem d’affichage 55 pouces (portrait 4K)', category: 'smart', os: 'android', w: 1080, h: 1920, dpr: 2, fixed: true, colors: PAL.smart, approx: true,
    p: { form: 'kiosk', b: [760, 1500, 50], diag: 55, px: [2160, 3840], sr: 0, br: 18, bz: [70, 34, 60, 34], stand: { kind: 'kiosk', w: 560, h: 200, foot: 680 } },
  },
  {
    id: 'signage-55', name: 'Écran d’affichage dynamique 55 pouces (paysage)', category: 'smart', os: 'android', w: 1920, h: 1080, dpr: 2, fixed: true, colors: PAL.monitor, approx: true,
    p: { form: 'monitor', b: [1222, 693, 35], diag: 55, px: [3840, 2160], sr: 0, br: 3, bz: [4, 4, 4, 4], stand: { kind: 'wall' } },
  },
  {
    id: 'pos-smart', name: 'Terminal de paiement Android (5,5 pouces)', category: 'smart', os: 'android', w: 360, h: 720, dpr: 2, colors: [['Noir', '#1d1e21'], ['Blanc', '#ecebe8']], approx: true,
    p: { form: 'terminal', b: [78, 175, 18], diag: 5.5, px: [720, 1440], sr: 2.4, br: 9, bz: [14, 4, 36, 4], slot: { y: 4.5, w: 60 }, btn: BTN.android },
  },
  {
    id: 'pos-keypad', name: 'Terminal de paiement à clavier (4 pouces)', category: 'smart', os: 'android', w: 320, h: 533, dpr: 1.5, colors: [['Noir', '#1d1e21'], ['Gris', '#5f6166']], approx: true,
    p: { form: 'terminal', b: [80, 190, 50], diag: 4, px: [480, 800], sr: 1.5, br: 12, bz: [14, 14, 90, 14], slot: { y: 5, w: 58 }, keypad: { y: 112, w: 66, h: 70, rows: 5, cols: 3 } },
  },
];

export const DEFAULT_DEVICE = 'iphone-18-pro';

export function getDevice(id, custom = []) {
  return DEVICES.find((d) => d.id === id) || custom.find((d) => d.id === id) || DEVICES.find((d) => d.id === DEFAULT_DEVICE);
}

// État actuel d'un appareil (fermé, ouvert…), avec la densité héritée de l'appareil.
export function resolveState(dev, stateId) {
  if (!dev.states) {
    return {
      id: null, label: null, w: dev.w, h: dev.h, dpr: dev.dpr, frame: dev.frame, approx: dev.approx, p: dev.p, hingeMask: dev.hingeMask,
    };
  }
  const st = dev.states.find((s) => s.id === stateId) || dev.states.find((s) => s.id === dev.defaultState) || dev.states[0];
  return { ...st, dpr: st.dpr || dev.dpr, approx: st.approx || dev.approx };
}

export function defaultColor(dev) {
  return dev.colors && dev.colors.length ? dev.colors[0][1] : (dev.color || '#3c3d41');
}
