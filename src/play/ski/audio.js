// THE MOUNTAIN, skiable: the sound. Synthesised here (nothing to download or license): the wind with
// the speed, the edge's hiss in a carve, a thump at a pop, a landing, a wipeout; the gates' and the
// lift's beeps; the crowd (../crowdAudio.js) at a medal or a big trick. One mute, remembered; nothing
// plays before the page's first gesture.
import { makeCrowd } from "../crowdAudio.js";

const KEY = "hvi-ski-mute";
let ctx = null, muted = (() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } })();
let wind = null, hiss = null, crowd = null;
export const isMuted = () => muted;
export function setMuted(m) { muted = m; try { localStorage.setItem(KEY, m ? "1" : "0"); } catch { /* */ } if (m) quiet(); }
export function unlock() {
  try {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; ctx = new AC(); crowd = makeCrowd({ ctx: () => ctx, muted: () => muted }); }
    if (ctx.state === "suspended") ctx.resume();
  } catch { /* no audio */ }
}
function noise(sec = 2) { const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0); let lp = 0; for (let i = 0; i < d.length; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.5; d[i] = lp; } return b; }
function loop(type, f, q) {
  const src = ctx.createBufferSource(); src.buffer = noise(); src.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(fl).connect(g).connect(ctx.destination); src.start();
  return { g, fl };
}
function quiet() { if (wind) wind.g.gain.value = 0; if (hiss) hiss.g.gain.value = 0; }
// every frame: speed m/s, slip m/s (sideways), on the ground?
export function bed(speed, slip, ground) {
  if (!ctx || muted) return;
  if (!wind) { wind = loop("lowpass", 500, 0.7); hiss = loop("bandpass", 3200, 1.4); }
  const t = ctx.currentTime;
  wind.g.gain.setTargetAtTime(Math.min(0.22, speed * speed * 0.00022), t, 0.1);
  wind.fl.frequency.setTargetAtTime(300 + speed * 28, t, 0.1);
  hiss.g.gain.setTargetAtTime(ground ? Math.min(0.12, slip * 0.018 + speed * 0.0016) : 0, t, 0.06);
}
function tone(f, dur, type = "square", vol = 0.06, slide = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
}
function thud(vol = 0.3, f = 900) { const s = ctx.createBufferSource(); s.buffer = noise(0.25); const fl = ctx.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = f; const g = ctx.createGain(), t = ctx.currentTime; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); s.connect(fl).connect(g).connect(ctx.destination); s.start(); }
// the sim's events, as they happen
export function play(evs) {
  if (!ctx || muted) return;
  for (const e of evs) {
    switch (e[0]) {
      case "pop": thud(0.12, 1400); break;
      case "land": thud(Math.min(0.35, 0.08 + e[1] * 0.025), 700); break;
      case "crash": thud(0.4, 500); thud(0.25, 2400); break;
      case "trick": tone(660, 0.09); setTimeout(() => !muted && tone(990, 0.12), 80); if (e[2] >= 800) crowd?.play("cheer"); break;
      case "gate": tone(1320, 0.06, "triangle", 0.07); break;
      case "miss": tone(220, 0.25, "sawtooth", 0.05, -80); break;
      case "checkpoint": tone(880, 0.1, "triangle", 0.07); break;
      case "go": tone(880, 0.25, "square", 0.06); break;
      case "board": case "unload": tone(160, 0.12, "triangle", 0.08); break;
      case "grind": tone(2400, 0.05, "sawtooth", 0.02); break;
      case "file": [784, 988, 1175, 1568].forEach((f, i) => setTimeout(() => !muted && tone(f, 0.12, "triangle", 0.06), i * 70)); break;
      case "found": tone(523, 0.08, "triangle", 0.04); break;
      case "finish": { const m = e[1]?.medal || 0; [523, 659, 784, 1047].slice(0, 2 + m).forEach((f, i) => setTimeout(() => !muted && tone(f, 0.16, "square", 0.05), i * 110)); if (m >= 2) crowd?.play(m === 3 ? "roar" : "cheer"); else if (e[1]?.why) crowd?.play("groan"); break; }
      default: break;
    }
  }
}
export function countBeep(n) { if (ctx && !muted) tone(n ? 440 : 880, 0.15, "square", 0.05); }
