/* IA du 3D Motion : l'assistant répond par un plan d'actions (JSON) que NEXORA exécute avec les outils du
 * Studio — objets 3D, textes, formes 2D, appareils, lumières, ambiances, caméra, animations, plans du montage,
 * publicité, diapositives. Les demandes suivantes modifient la composition sans tout refaire : les objets
 * gardent un identifiant (« ref ») que l'IA réutilise. Chaque plan est annulable d'un coup (Ctrl+Z). */
import { AMBIANCES, LIGHTS } from './scene.js';
import { DECORS, FINISHES } from './decor.js';
import { VECTOR_SHAPES } from './vector.js';
import { TRANSITIONS } from './media.js';
import { AD_TEMPLATES, AD_FORMATS } from './ads.js';
import { SLIDE_LAYOUTS, newSlide } from './deck.js';
import { DEVICES } from '../devices/catalog.js';
import { settings, persist } from '../core/settings.js';

const round = (v, n = 2) => Math.round(Number(v) * 10 ** n) / 10 ** n;

// Résumé de la composition pour l'IA (sans les images).
export function describeScene(st) {
  const objs = st.order.map((id) => {
    const o = st.objects.get(id);
    const it = o.item;
    const r = o.model.root;
    const x = {
      ref: it.aiRef || id, type: it.type === 'device' ? 'device' : it.kind, name: st.nameFor(it), pos: r.position.toArray().map((v) => round(v, 1)), rot: [r.rotation.x, r.rotation.y, r.rotation.z].map((v) => round((v * 180) / Math.PI, 0)), scale: round(r.scale.x, 2),
    };
    if (it.text) x.text = it.text;
    if (it.color && it.type !== 'device') x.color = it.color;
    if (it.fill) x.fill = it.fill;
    if (it.finish && it.type !== 'device') x.finish = it.finish;
    if (it.deviceId) x.device = it.deviceId;
    if (it.clip) x.clip = { start: round(it.clip.start, 2), end: round(it.clip.end, 2), in: it.clip.tin, out: it.clip.tout };
    if (st.anim.tracks[id]) x.keys = st.anim.tracks[id].length;
    return x;
  });
  const env = st.three.env;
  return {
    space: st.space, duration: st.anim.duration, fps: st.anim.fps, aspect: env.aspect, background: { bg: env.bg, color: env.bgColor, color2: env.bgColor2, light: env.light, floor: env.floor }, cameraKeys: (st.anim.tracks.camera || []).length, objects: objs,
    ad: st.space === 'ad' ? { template: st.adState().tpl, format: st.adState().format, copy: st.adState().copy } : undefined,
    deck: st.space === 'deck' ? { slide: st.deckCur, slides: st.deckState().slides.map((s) => ({ layout: s.layout, title: s.title, text: s.text })) } : undefined,
  };
}

export function directorSystem() {
  const kinds = Object.keys(DECORS).filter((k) => !['image', 'glb', 'video', 'sequence', 'vecteur', 'lumiere'].includes(k));
  const phones = ['iphone-18-pro', 'galaxy-s26-ultra', 'ipad-pro-13', 'macbook-pro-14'].filter((id) => DEVICES.some((d) => d.id === id));
  return `Tu es le directeur artistique et le monteur du « 3D & Motion Studio » de NEXORA. Tu réalises les demandes en pilotant les outils du logiciel.
Réponds TOUJOURS par un seul bloc \`\`\`json contenant {"message":"phrase courte en français pour l'utilisateur","actions":[...]}. Pas d'autre texte.
Unités : centimètres ; le sol est y = 0 ; un téléphone mesure ≈ 15 cm de haut ; une scène fait ≈ 60 cm de large ; la caméra regarde vers -z. Rotations en degrés. Couleurs en #hex.
Pour modifier la composition existante, réutilise les "ref" des objets fournis dans le contexte ; ne recrée pas ce qui existe déjà sauf si on te le demande.
Actions disponibles (champ "do") :
- {"do":"space","name":"scene|deck"} : change d'espace (scène 3D libre, présentation).
- {"do":"clear"} : vide la scène (espace scène uniquement).
- {"do":"ambiance","name":"${Object.keys(AMBIANCES).join('|')}"}
- {"do":"background","bg":"studio|color|gradient","color":"#hex","color2":"#hex","light":"${Object.keys(LIGHTS).join('|')}","floor":"shadow|glossy|none"}
- {"do":"aspect","value":"free|16:9|9:16|1:1|4:5"}
- {"do":"duration","seconds":6}
- {"do":"add","ref":"nom-court","type":"text3d","text":"…","fontSize":6,"depth":1.6,"color":"#hex","finish":"${Object.keys(FINISHES).join('|')}","pos":[x,y,z],"rot":[x,y,z],"scale":1}
- {"do":"add","ref":"…","type":"text","text":"…","fontSize":4,"color":"#hex","pos":[…]} (texte plat, toujours lisible)
- {"do":"add","ref":"…","type":"shape","kind":"${kinds.join('|')}","color":"#hex","finish":"…","pos":[…],"scale":1}
- {"do":"add","ref":"…","type":"vector","shape":"${Object.keys(VECTOR_SHAPES).filter((k) => k !== 'path').join('|')}","w":20,"h":12,"fill":"#hex","fill2":"#hex (dégradé, facultatif)","stroke":"#hex","strokeW":0.4,"radius":2,"pos":[…],"opacity":1} (calque 2D)
- {"do":"add","ref":"…","type":"device","device":"${phones.join('|')}","color":"#hex","pos":[…],"rot":[…]} (affiche le site de l'utilisateur à l'écran)
- {"do":"add","ref":"…","type":"light","light":"point|spot|dir|area|hemi","color":"#hex","intensity":1,"pos":[…]}
- {"do":"update","ref":"…","set":{"text":"…","color":"#hex","fill":"#hex","pos":[…],"rot":[…],"scale":1,"finish":"…","opacity":1,"fontSize":6}}
- {"do":"remove","ref":"…"}
- {"do":"animate","ref":"…","preset":"enter|float|spin|swing|zoom|showcase|scroll|open"} ou {"do":"animate","ref":"…","keys":[{"t":0,"pos":[…],"rot":[…],"scale":1,"ease":"inOut|out|in|linear|back|spring|bounce|elastic"}]}
- {"do":"clip","ref":"…","start":0,"end":3,"in":"${Object.keys(TRANSITIONS).join('|')}","out":"…","fadeIn":0.4,"fadeOut":0.4} : l'objet n'apparaît que pendant ce plan (montage).
- {"do":"sequence","overlap":0.4} : enchaîne tous les plans bout à bout.
- {"do":"camera","move":"orbit|dolly|pullback|crane|pan|reveal","from":0,"to":6} ; {"do":"camera","view":"front|q34|top|low|side"} ; {"do":"frame"} (cadrer tout).
- {"do":"slide","layout":"${Object.keys(SLIDE_LAYOUTS).join('|')}","title":"…","text":"…"} : ajoute une diapositive (espace présentation).
- {"do":"export","kind":"video|image"} : ouvre la fenêtre d'export pour le rendu final.
Conseils : une scène libre avec "clear" puis des "add", une ambiance, des animations et un mouvement de caméra. Garde des textes courts et percutants.`;
}

function findTarget(st, ref) {
  if (!ref) return null;
  const r = String(ref).toLowerCase();
  for (const id of st.order) {
    const it = st.objects.get(id).item;
    if ((it.aiRef && it.aiRef.toLowerCase() === r) || id.toLowerCase() === r) return id;
  }
  for (const id of st.order) {
    const it = st.objects.get(id).item;
    const name = st.nameFor(it).toLowerCase();
    if (name.includes(r) || (it.text && it.text.toLowerCase().includes(r))) return id;
  }
  return null;
}

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const vec = (v, d) => (Array.isArray(v) && v.length === 3 && v.every((x) => Number.isFinite(Number(x))) ? v.map(Number) : d);
const hex = (v, d) => (/^#[0-9a-f]{3,8}$/i.test(String(v || '')) ? v : d);

/* Exécute le plan ; renvoie le compte rendu [{ ok, text }]. */
export async function runPlan(st, plan) {
  const report = [];
  const ok = (text) => report.push({ ok: true, text });
  const ko = (text) => report.push({ ok: false, text });
  const actions = Array.isArray(plan.actions) ? plan.actions.slice(0, 80) : [];
  st.aiBusy = true;
  for (const a of actions) {
    try {
      const d = String(a.do || '').toLowerCase();
      if (d === 'space') { await st.setSpace(['scene', 'deck'].includes(a.name) ? a.name : 'scene'); ok(`Espace : ${a.name}`); continue; }
      if (d === 'clear') { if (st.space === 'scene') { st.clearScene(); ok('Scène vidée'); } else ko('« Vider » n’est possible que dans la scène libre'); continue; }
      if (d === 'ambiance') {
        const am = AMBIANCES[a.name];
        if (!am) { ko(`Ambiance inconnue : ${a.name}`); continue; }
        st.three.applyEnv({ ...st.three.env, rig: 1, lightAngle: 0, lightHeight: 1, warmth: 0, floorColor: '', ...JSON.parse(JSON.stringify(am[1])) }, st.bgImageEl);
        ok(`Ambiance « ${am[0]} »`);
        continue;
      }
      if (d === 'background') {
        const e = { ...st.three.env };
        if (['studio', 'color', 'gradient'].includes(a.bg)) e.bg = a.bg;
        if (a.color) e.bgColor = hex(a.color, e.bgColor);
        if (a.color2) e.bgColor2 = hex(a.color2, e.bgColor2);
        if (LIGHTS[a.light]) e.light = a.light;
        if (['shadow', 'glossy', 'none'].includes(a.floor)) e.floor = a.floor;
        st.three.applyEnv(e, st.bgImageEl);
        ok('Arrière-plan modifié');
        continue;
      }
      if (d === 'aspect') { st.setEnv('aspect', ['free', '16:9', '9:16', '1:1', '4:5'].includes(a.value) ? a.value : 'free', { final: false }); st.resize(); ok(`Format ${a.value}`); continue; }
      if (d === 'duration') { st.setDuration(Math.max(1, Math.min(120, num(a.seconds, 6)))); ok(`Durée : ${st.anim.duration} s`); continue; }
      if (d === 'add') {
        const t = String(a.type || '').toLowerCase();
        const common = { pos: vec(a.pos, undefined), rot: vec(a.rot, undefined), scale: num(a.scale, 1), aiRef: a.ref ? String(a.ref) : undefined };
        if (!common.pos) delete common.pos;
        if (!common.rot) delete common.rot;
        let item = null;
        if (t === 'text3d') item = st.addDecor({ ...common, kind: 'texte3d', text: String(a.text || 'Texte'), font: 'inter', fontSize: num(a.fontSize, 6), depth: num(a.depth, 1.6), bevel: 0.25, color: hex(a.color, '#1d1d1f'), finish: FINISHES[a.finish] ? a.finish : 'brillant' }, { select: false, history: false });
        else if (t === 'text') item = st.addDecor({ ...common, kind: 'texte', text: String(a.text || 'Texte'), fontSize: num(a.fontSize, 4), color: hex(a.color, '#1d1d1f'), weight: 700 }, { select: false, history: false });
        else if (t === 'shape') item = st.addDecor({ ...common, kind: DECORS[a.kind] && !['image', 'glb', 'video', 'sequence'].includes(a.kind) ? a.kind : 'sphere', color: hex(a.color, '#f3f3f6'), finish: FINISHES[a.finish] ? a.finish : 'brillant' }, { select: false, history: false });
        else if (t === 'vector') {
          item = st.addVector({
            ...common, shape: VECTOR_SHAPES[a.shape] && a.shape !== 'path' ? a.shape : 'round', w: num(a.w, 20), h: num(a.h, 12), fill: hex(a.fill, '#0a84ff'), fill2: hex(a.fill2, ''), stroke: hex(a.stroke, ''), strokeW: num(a.strokeW, 0), radius: num(a.radius, 2.4), opacity: num(a.opacity, 1), shadow: num(a.shadow, 0),
          });
        } else if (t === 'device') {
          const id = DEVICES.some((x) => x.id === a.device) ? a.device : 'iphone-18-pro';
          // eslint-disable-next-line no-await-in-loop
          item = await st.addSiteDevice({ deviceId: id, color: hex(a.color, undefined), pos: common.pos || [st.order.length * 12 - 12, 0, 0], rot: common.rot || [0, 0, 0], scale: common.scale });
        } else if (t === 'light') item = st.addDecor({ ...common, kind: 'lumiere', lightType: ['point', 'spot', 'dir', 'area', 'hemi'].includes(a.light) ? a.light : 'point', color: hex(a.color, '#ffffff'), intensity: num(a.intensity, 1), castShadow: !['area', 'hemi'].includes(a.light) }, { select: false, history: false });
        else { ko(`Type d’objet inconnu : ${t}`); continue; }
        if (item && a.ref) item.aiRef = String(a.ref);
        ok(`Ajouté : ${item ? st.nameFor(item) : t}`);
        continue;
      }
      const id = findTarget(st, a.ref || a.target);
      if (d === 'update' || d === 'remove' || d === 'animate' || d === 'clip') {
        if (!id) { ko(`Objet introuvable : ${a.ref || a.target}`); continue; }
        const o = st.objects.get(id);
        const it = o.item;
        if (d === 'remove') { st.remove(id, { history: false }); ok(`Supprimé : ${st.nameFor(it)}`); continue; }
        if (d === 'update') {
          const s = a.set || {};
          for (const k of ['text', 'finish', 'shape']) if (s[k] != null) it[k] = String(s[k]);
          for (const k of ['color', 'fill', 'fill2', 'stroke']) if (s[k] != null) it[k] = hex(s[k], it[k]);
          for (const k of ['fontSize', 'depth', 'opacity', 'w', 'h', 'radius', 'strokeW', 'intensity']) if (s[k] != null) it[k] = num(s[k], it[k]);
          if (s.pos) it.pos = vec(s.pos, it.pos);
          if (s.rot) it.rot = vec(s.rot, it.rot);
          if (s.scale != null) it.scale = num(s.scale, it.scale);
          if (it.type === 'device') { if (s.color) { it.color = hex(s.color, it.color); } }
          st.build(it);
          ok(`Modifié : ${st.nameFor(it)}`);
          continue;
        }
        if (d === 'clip') {
          const c = st.ensureClip(it);
          c.start = Math.max(0, num(a.start, c.start));
          c.end = Math.max(c.start + 0.1, num(a.end, c.end));
          if (TRANSITIONS[a.in]) c.tin = a.in;
          if (TRANSITIONS[a.out]) c.tout = a.out;
          c.fin = num(a.fadeIn, c.fin ?? 0.4);
          c.fout = num(a.fadeOut, c.fout ?? 0.4);
          if (c.end > st.anim.duration) st.setDuration(Math.min(120, Math.ceil(c.end)));
          ok(`Plan ${c.start}–${c.end} s : ${st.nameFor(it)}`);
          continue;
        }
        if (d === 'animate') {
          if (Array.isArray(a.keys) && a.keys.length) {
            const base = st.getState(id);
            st.anim.tracks[id] = a.keys.slice(0, 24).map((k) => ({
              t: Math.max(0, Math.min(st.anim.duration, num(k.t, 0))), ease: k.ease || 'inOut', v: { ...base, ...(k.pos ? { pos: vec(k.pos, base.pos) } : {}), ...(k.rot ? { rot: vec(k.rot, base.rot) } : {}), ...(k.scale != null ? { scale: num(k.scale, base.scale) } : {}) },
            })).sort((x, y) => x.t - y.t);
          } else {
            const prev = st.sel;
            st.sel = id;
            // eslint-disable-next-line no-await-in-loop
            await st.applyAnimPreset(['enter', 'float', 'spin', 'swing', 'zoom', 'showcase', 'scroll', 'open', 'orbit'].includes(a.preset) ? a.preset : 'float');
            st.sel = prev;
          }
          ok(`Animation : ${st.nameFor(it)}`);
          continue;
        }
      }
      if (d === 'sequence') { st.sequenceClips(num(a.overlap, 0.4)); ok('Plans enchaînés'); continue; }
      if (d === 'camera') {
        if (a.move) { st.cameraMove(['orbit', 'dolly', 'pullback', 'crane', 'pan', 'reveal'].includes(a.move) ? a.move : 'orbit', { from: num(a.from, 0), to: num(a.to, st.anim.duration) }); ok(`Caméra : ${a.move}`); } else if (a.view) { st.setView(a.view, false); ok(`Vue : ${a.view}`); } else { st.frameAll(false); ok('Cadrage'); }
        continue;
      }
      if (d === 'frame') { st.frameAll(false); ok('Cadrage'); continue; }
      if (d === 'ad') {
        if (st.space !== 'ad') await st.setSpace('ad');
        const ad = st.adState();
        if (AD_TEMPLATES[a.template]) ad.tpl = a.template;
        if (AD_FORMATS[a.format]) ad.format = a.format;
        if (a.copy) for (const k of ['kicker', 'title', 'subtitle', 'cta']) if (a.copy[k] != null) ad.copy[k] = String(a.copy[k]);
        persist();
        await st.applyAd();
        st.renderSpaceLeft();
        ok(`Publicité « ${(AD_TEMPLATES[ad.tpl] || {}).label || ad.tpl} »`);
        continue;
      }
      if (d === 'slide') {
        if (st.space !== 'deck') await st.setSpace('deck');
        const dk = st.deckState();
        const lay = SLIDE_LAYOUTS[a.layout] ? a.layout : 'cover';
        dk.slides.push(newSlide(lay, { title: String(a.title || ''), text: String(a.text || '') }));
        persist();
        await st.openSlide(dk.slides.length - 1);
        ok(`Diapositive « ${a.title || lay} »`);
        continue;
      }
      if (d === 'export') { if (a.kind === 'image') st.photoSheet(); else st.videoSheet(); ok('Fenêtre d’export ouverte'); continue; }
      ko(`Action inconnue : ${a.do}`);
    } catch (e) { ko(`${a.do} : ${e.message}`); }
  }
  st.aiBusy = false;
  st.applyTime();
  st.renderList();
  st.renderProps();
  st.timeline.render();
  st.resize();
  st.commit();
  settings.studioAiRuns = (settings.studioAiRuns || 0) + 1;
  return report;
}

export function parsePlan(text) {
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const raw = (m ? m[1] : text).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}
