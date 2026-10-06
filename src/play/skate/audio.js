// THE PARK, skateable: the sound. Synthesised (nothing to download): the wheels' roll with the speed, the
// pop, the landing, the grind's scrape, a bail, the chime of a banked combo, a letter. One mute,
// remembered; nothing plays before the page's first gesture.
const KEY = "hvi-skate-mute";
let ctx = null, roll = null, scrape = null, muted = (() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } })();
export const isMuted = () => muted;
export function setMuted(m) { muted = m; try { localStorage.setItem(KEY, m ? "1" : "0"); } catch { /* */ } if (m) bed(0, false); }
export function unlock() {
  try {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; ctx = new AC(); }
    if (ctx.state === "suspended") ctx.resume();
  } catch { /* no audio */ }
}
function noiseLoop(type, f, q) {
  const n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = b; src.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(fl).connect(g).connect(ctx.destination); src.start();
  return { g, fl };
}
// every frame: speed (tiles a tick), rolling on the ground?, grinding?
export function bed(speed, ground, grind = false) {
  if (!ctx) return;
  if (!roll) { roll = noiseLoop("lowpass", 260, 0.8); scrape = noiseLoop("bandpass", 2400, 2.5); }
  const t = ctx.currentTime, on = !muted;
  roll.g.gain.setTargetAtTime(on && ground ? Math.min(0.2, speed * 1.4) : 0, t, 0.05);
  roll.fl.frequency.setTargetAtTime(180 + speed * 1600, t, 0.08);
  scrape.g.gain.setTargetAtTime(on && grind ? 0.07 : 0, t, 0.03);
}
function tone(f, dur, type = "square", vol = 0.05, slide = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
}
function thud(vol = 0.2, f = 90) { tone(f, 0.12, "sine", vol, -50); tone(f * 2.2, 0.05, "triangle", vol * 0.4); }
// the sim's events, as they come
export function play(evs) {
  if (!ctx || muted || !evs?.length) return;
  for (const e of evs) {
    switch (e[0]) {
      case "ollie": tone(180, 0.06, "triangle", 0.12, 120); thud(0.08, 140); break;
      case "launch": tone(220, 0.08, "triangle", 0.05, 60); break;
      case "land": e[1] === 2 ? null : thud(0.22, 80); break;
      case "grind": tone(1600, 0.05, "square", 0.03); break;
      case "bail": thud(0.35, 60); tone(140, 0.3, "sawtooth", 0.05, -90); break;
      case "bank": if (e[1] > 0) { tone(660, 0.08, "square", 0.04); setTimeout(() => !muted && tone(990, 0.12, "square", 0.04), 70); } break;
      case "letter": tone(880, 0.06, "square", 0.05); setTimeout(() => !muted && tone(1320, 0.1, "square", 0.05), 60); break;
      case "tape": [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => !muted && tone(f, 0.12, "square", 0.05), i * 80)); break;
      case "goal": [784, 988, 1175].forEach((f, i) => setTimeout(() => !muted && tone(f, 0.14, "triangle", 0.07), i * 90)); break;
      case "end": tone(392, 0.5, "square", 0.05, -100); break;
      case "bump": if (e[1] > 0.05) thud(0.1, 110); break;
      default: break;
    }
  }
}
