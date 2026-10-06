// The crowd, heard: shared by THE DEPARTMENT LINKS (golf) and THE TENNIS CLUB. Everything is
// synthesised in this file (no sample files, so nothing to license and nothing to download):
//   applause   hundreds of hand claps (short filtered noise bursts) at random times, thinning out
//   cheer/roar the claps plus a crowd's "ahh" (dozens of buzzy voices through vowel formants) and
//              a whoop or two
//   ooh / aww  the same voices on an "oo" rising and falling, or an "aw" sinking: a gasp, a groan
//   crickets   two crickets chirping in the quiet; maybe one cough
//   bell       a bar bell (golf's nineteenth hole)
// Audio only: it reads nothing from a sim and writes nothing back. Each game passes its own
// AudioContext getter and mute test, so its remembered mute toggle governs the crowd too, and no
// sound plays before the page's first gesture (the game's unlock() opens the context).
//
//   const crowd = makeCrowd({ ctx: () => audioContext, muted: () => bool });
//   crowd.play("polite" | "warm" | "cheer" | "roar" | "ooh" | "groan" | "aww" | "thin" | "crickets" | "cough" | "bell" | "quiet")
// "quiet" stops whatever the crowd is doing (an umpire's QUIET PLEASE).

const BUFS = new Map();   // rendered sounds, per kind and sample rate (a handful of variants each)
let seed = 0x5eed;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed >>> 8) / 16777216; };

// One clap: a sharp attack and a fast decay of bright noise, its own colour.
function clap(d, sr, at, vol) {
  const n = Math.floor(sr * (0.012 + rnd() * 0.02)), i0 = Math.floor(at * sr), k = 0.25 + rnd() * 0.5;
  let lp = 0;
  for (let i = 0; i < n && i0 + i < d.length; i++) {
    const w = rnd() * 2 - 1;
    lp += (w - lp) * k;                       // a little low-pass, different per hand
    const env = i < 24 ? i / 24 : Math.exp(-(i - 24) / (n * 0.28));
    d[i0 + i] += (w - lp * 0.6) * env * vol;
  }
}
// Applause: `people` clapping about `rate` times a second each for `dur`, fading out.
function applause(d, sr, { people, dur, rate = 4, vol = 0.5, start = 0 }) {
  for (let p = 0; p < people; p++) {
    let t = start + rnd() * 0.35;
    const r = rate * (0.75 + rnd() * 0.5), v = vol * (0.4 + rnd() * 0.6), end = start + dur * (0.55 + rnd() * 0.45);
    while (t < end) { clap(d, sr, t, v * (1 - ((t - start) / (dur + 0.4)) ** 2)); t += (1 / r) * (0.85 + rnd() * 0.3); }
  }
}
// Voices: `n` people on a vowel, pitch following `contour(t in 0..1)` (a ratio), loudness `env`.
// A buzzy pulse each (rich in harmonics), so the formant filters downstream make a vowel of it.
function voices(d, sr, { n, dur, start = 0, base = [110, 260], contour = () => 1, env = () => 1, vol = 0.12 }) {
  const N = Math.floor(dur * sr), i0 = Math.floor(start * sr);
  for (let v = 0; v < n; v++) {
    const f0 = base[0] + rnd() * (base[1] - base[0]), vib = 4 + rnd() * 3, vd = 0.012 + rnd() * 0.02, lag = rnd() * 0.12, amp = vol * (0.5 + rnd() * 0.5);
    let ph = rnd();
    for (let i = 0; i < N && i0 + i < d.length; i++) {
      const t = i / sr, u = Math.max(0, Math.min(1, (t - lag) / Math.max(0.05, dur - lag)));
      const f = f0 * contour(u) * (1 + vd * Math.sin(6.283 * vib * t));
      ph += f / sr; ph -= Math.floor(ph);
      const s = ph < 0.18 ? 1 - ph / 0.09 : -0.12;
      d[i0 + i] += s * amp * env(u) * (t < lag ? 0 : 1);
    }
  }
}
function noiseBed(d, sr, { dur, start = 0, vol = 0.05, env = () => 1 }) {
  const N = Math.floor(dur * sr), i0 = Math.floor(start * sr);
  let lp = 0;
  for (let i = 0; i < N && i0 + i < d.length; i++) { lp += ((rnd() * 2 - 1) - lp) * 0.08; d[i0 + i] += lp * vol * env(i / N); }
}
function chirps(d, sr, { dur, f = 4400, every = 0.85, at = 0, vol = 0.05 }) {
  for (let t = at; t < dur; t += every * (0.9 + rnd() * 0.2)) for (let k = 0; k < 3; k++) {
    const s0 = Math.floor((t + k * 0.05) * sr), n = Math.floor(0.03 * sr);
    for (let i = 0; i < n && s0 + i < d.length; i++) d[s0 + i] += Math.sin((6.283 * f * i) / sr) * Math.sin((Math.PI * i) / n) * vol;
  }
}
function cough(d, sr, at, vol = 0.35) {
  for (const [o, len, v] of [[0, 0.11, 1], [0.16, 0.08, 0.6]]) {
    const s0 = Math.floor((at + o) * sr), n = Math.floor(len * sr);
    let lp = 0, bp = 0;
    for (let i = 0; i < n && s0 + i < d.length; i++) {
      lp += ((rnd() * 2 - 1) - lp) * 0.3; bp += (lp - bp) * 0.12;
      d[s0 + i] += (lp - bp) * vol * v * (i < 200 ? i / 200 : Math.exp(-(i - 200) / (n * 0.3)));
    }
  }
}
function bell(d, sr, at = 0, vol = 0.22) {
  const s0 = Math.floor(at * sr);
  for (let i = 0; i < sr * 1.6 && s0 + i < d.length; i++) {
    const t = i / sr, e = Math.exp(-t * 2.4);
    d[s0 + i] += (Math.sin(6.283 * 1318 * t) + 0.5 * Math.sin(6.283 * 3170 * t) * Math.exp(-t * 6) + 0.25 * Math.sin(6.283 * 5290 * t) * Math.exp(-t * 9)) * e * vol;
  }
}

// Each kind: how long, what goes in it, and the vowel its voices go through (formants, Hz).
const KINDS = {
  thin: { dur: 2.2, make: (d, sr) => applause(d, sr, { people: 3, dur: 1.4, rate: 3, vol: 0.5 }) },
  polite: { dur: 3, make: (d, sr) => applause(d, sr, { people: 16, dur: 2.2, rate: 3.6, vol: 0.32 }) },
  warm: { dur: 3.6, make: (d, sr) => { applause(d, sr, { people: 34, dur: 2.8, rate: 4.2, vol: 0.26 }); } },
  cheer: { dur: 4.2, vowel: [750, 1150], make: (d, sr) => { applause(d, sr, { people: 60, dur: 3.4, rate: 4.8, vol: 0.2 }); voices(d, sr, { n: 26, dur: 1.8, start: 0.05, base: [140, 330], contour: (u) => 1 + 0.25 * Math.sin(u * 3), env: (u) => Math.sin(Math.PI * Math.min(1, u * 1.3)), vol: 0.05 }); noiseBed(d, sr, { dur: 2.4, vol: 0.06, env: (u) => 1 - u }); } },
  roar: { dur: 5.2, vowel: [720, 1100], make: (d, sr) => { applause(d, sr, { people: 120, dur: 4.4, rate: 5.2, vol: 0.15 }); voices(d, sr, { n: 46, dur: 2.8, start: 0, base: [130, 360], contour: (u) => 1 + 0.35 * Math.sin(u * 2.4), env: (u) => Math.min(1, u * 5) * (1 - u * 0.6), vol: 0.045 }); voices(d, sr, { n: 4, dur: 0.7, start: 0.4, base: [420, 640], contour: (u) => 1 + 0.5 * u, env: (u) => Math.sin(Math.PI * u), vol: 0.06 }); noiseBed(d, sr, { dur: 3.6, vol: 0.09, env: (u) => Math.min(1, u * 6) * (1 - u) }); } },
  ooh: { dur: 1.9, vowel: [330, 820], make: (d, sr) => voices(d, sr, { n: 34, dur: 1.6, base: [120, 300], contour: (u) => 0.85 + 0.45 * Math.sin(Math.PI * Math.min(1, u * 1.2)), env: (u) => Math.min(1, u * 6) * (1 - u) ** 0.7, vol: 0.08 }) },
  groan: { dur: 2, vowel: [620, 980], make: (d, sr) => voices(d, sr, { n: 34, dur: 1.7, base: [130, 280], contour: (u) => 1.15 - 0.4 * u, env: (u) => Math.min(1, u * 5) * (1 - u) ** 0.8, vol: 0.075 }) },
  crickets: { dur: 3.2, make: (d, sr) => { chirps(d, sr, { dur: 3, f: 4400, every: 0.8, at: 0.2, vol: 0.035 }); chirps(d, sr, { dur: 3, f: 3900, every: 1.1, at: 0.55, vol: 0.025 }); if (rnd() < 0.5) cough(d, sr, 1.6 + rnd() * 0.8, 0.3); } },
  cough: { dur: 0.6, make: (d, sr) => cough(d, sr, 0.02, 0.4) },
  bell: { dur: 1.8, make: (d, sr) => { bell(d, sr, 0); bell(d, sr, 0.28, 0.16); } },
};
KINDS.aww = KINDS.groan;

function render(a, kind) {
  const K = KINDS[kind];
  const key = `${kind}|${a.sampleRate}`;
  let list = BUFS.get(key);
  if (!list) BUFS.set(key, list = []);
  if (list.length < 3) {   // up to three takes of each, so repeats differ
    const n = Math.floor(K.dur * a.sampleRate), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    K.make(d, a.sampleRate);
    let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0.95) for (let i = 0; i < n; i++) d[i] *= 0.95 / peak;
    list.push(buf);
    return buf;
  }
  return list[Math.floor(rnd() * list.length)];
}

export function makeCrowd({ ctx, muted, volume = 0.5 }) {
  let live = [];
  const stop = () => { for (const s of live) { try { s.stop(); } catch { /* already over */ } } live = []; };
  return {
    play(kind) {
      if (kind === "quiet") { stop(); return false; }
      const a = ctx?.();
      if (!a || muted?.() || a.state !== "running" || !KINDS[kind]) return false;
      const K = KINDS[kind], src = a.createBufferSource(), g = a.createGain();
      src.buffer = render(a, kind);
      g.gain.value = volume;
      let out = src;
      if (K.vowel) {
        // the vowel: two formant bands over the voices, the claps passed straight through beside them
        const f1 = a.createBiquadFilter(), f2 = a.createBiquadFilter(), dry = a.createGain(), mix = a.createGain();
        f1.type = "bandpass"; f1.frequency.value = K.vowel[0]; f1.Q.value = 3.5;
        f2.type = "bandpass"; f2.frequency.value = K.vowel[1]; f2.Q.value = 4.5;
        dry.gain.value = 0.55; mix.gain.value = 1.6;
        src.connect(f1).connect(mix); src.connect(f2).connect(mix); src.connect(dry);
        out = a.createGain(); mix.connect(out); dry.connect(out);
      }
      const hp = a.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 90;
      out.connect(hp).connect(g).connect(a.destination);
      src.start();
      live.push(src);
      src.onended = () => { live = live.filter(s => s !== src); };
      return true;
    },
    stop,
    // render one take of each sound in the background (a cheer is a few hundred thousand samples):
    // call once the context is open, so the first roar does not stall a frame
    warm() {
      const a = ctx?.();
      if (!a || warmed.has(a)) return;
      warmed.add(a);
      const kinds = Object.keys(KINDS).filter(k => k !== "aww");
      const next = () => { const k = kinds.shift(); if (!k) return; render(a, k); setTimeout(next, 120); };
      setTimeout(next, 300);
    },
  };
}
const warmed = new WeakSet();
export const CROWD_KINDS = Object.keys(KINDS);
