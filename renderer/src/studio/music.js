/* Musique des vidéos du Studio : décodage du fichier choisi, découpe à la durée de la vidéo,
   volume, fondu d'entrée et de sortie, puis piste audio encodée (AAC en MP4, Opus en WebM). */

let ctx = null;

export async function decodeMusic(bytes) {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return ctx.decodeAudioData(ab);
}

// Rend un extrait de la musique à la durée demandée (en boucle si la musique est plus courte).
export async function renderTrack(buffer, duration, {
  volume = 0.8, offset = 0, fadeIn = 0.3, fadeOut = 1.2, loop = true,
} = {}) {
  const rate = 48000;
  const len = Math.max(1, Math.ceil(duration * rate));
  const off = new OfflineAudioContext(2, len, rate);
  const src = off.createBufferSource();
  src.buffer = buffer;
  src.loop = loop && buffer.duration < duration + offset;
  const g = off.createGain();
  const v = Math.max(0, Math.min(1.5, volume));
  g.gain.setValueAtTime(fadeIn > 0 ? 0 : v, 0);
  if (fadeIn > 0) g.gain.linearRampToValueAtTime(v, Math.min(duration, fadeIn));
  const fo = Math.min(fadeOut, duration / 2);
  if (fo > 0) { g.gain.setValueAtTime(v, Math.max(0, duration - fo)); g.gain.linearRampToValueAtTime(0, duration); }
  src.connect(g).connect(off.destination);
  src.start(0, Math.max(0, Math.min(offset, Math.max(0, buffer.duration - 0.1))));
  return off.startRendering();
}

// Ajoute la piste audio à une sortie mediabunny (avant output.start()) ; renvoie une fonction à appeler après.
export async function attachMusicTrack(enc, output, music, duration, videoCodec) {
  if (!music || !music.buffer) return null;
  const codec = videoCodec === 'avc' ? 'aac' : 'opus';
  let use = codec;
  // WebM n'accepte que l'Opus ; le MP4 accepte l'AAC et l'Opus.
  if (!(await enc.canEncodeAudio(use))) use = videoCodec === 'avc' ? 'opus' : null;
  if (!use || !(await enc.canEncodeAudio(use))) return null;
  const source = new enc.AudioBufferSource({ codec: use, bitrate: 192000 });
  output.addAudioTrack(source);
  return async () => {
    const buf = await renderTrack(music.buffer, duration, music);
    await source.add(buf);
    source.close();
  };
}
