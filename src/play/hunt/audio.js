// THE HUNT's sounds: square, triangle and noise through WebAudio, made on demand (no files). Muted is
// kept per browser. The rifle is a burst of low noise; the bolt a pair of clicks.
const KEY = "hvi-hunt-mute";
let ac = null, muted = (() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } })();
export const isMuted = () => muted;
export function setMuted(m) { muted = Boolean(m); try { localStorage.setItem(KEY, muted ? "1" : "0"); } catch { /* the tab remembers */ } }
function ctx() {
  if (ac) return ac;
  try { const C = window.AudioContext || window.webkitAudioContext; ac = C ? new C() : null; } catch { ac = null; }
  return ac;
}
export function unlock() { const a = ctx(); if (a && a.state === "suspended") a.resume().catch(() => {}); }
function tone(freq, dur, { type = "square", vol = 0.05, at = 0, slide = 0 } = {}) {
  const a = ctx(); if (!a || muted) return;
  const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.linearRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, { vol = 0.1, at = 0, hz = 900, hi = false } = {}) {
  const a = ctx(); if (!a || muted) return;
  const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  let s = 7;
  for (let i = 0; i < n; i++) { s = (s * 16807) % 2147483647; d[i] = ((s / 2147483647) * 2 - 1) * Math.pow(1 - i / n, 2); }
  const src = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
  f.type = hi ? "highpass" : "lowpass"; f.frequency.value = hz;
  src.buffer = buf; g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination); src.start(a.currentTime + at);
}
export function play(ev) {
  switch (ev) {
    case "shot": noise(0.32, { vol: 0.22, hz: 700 }); tone(90, 0.12, { type: "triangle", vol: 0.12, slide: -40 }); break;
    case "hit": tone(330, 0.06, { vol: 0.04, at: 0.08 }); break;
    case "vital": [523, 784].forEach((f, i) => tone(f, 0.07, { at: 0.08 + i * 0.06, vol: 0.05 })); break;
    case "head": [659, 988].forEach((f, i) => tone(f, 0.07, { at: 0.08 + i * 0.06, vol: 0.05 })); break;
    case "female": tone(140, 0.3, { vol: 0.08, at: 0.06 }); tone(110, 0.3, { vol: 0.08, at: 0.2 }); break;
    case "critter": tone(880, 0.05, { at: 0.06 }); break;
    case "bird": tone(1046, 0.05, { at: 0.04, vol: 0.04 }); break;
    case "gold": [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.08, { at: 0.04 + i * 0.07, vol: 0.05 })); break;
    case "thud": noise(0.06, { vol: 0.08, hz: 400 }); break;
    case "click": tone(1600, 0.02, { vol: 0.04 }); break;
    case "reload": noise(0.05, { vol: 0.08, hi: true, hz: 2500 }); break;
    case "racked": noise(0.04, { vol: 0.1, hi: true, hz: 2000 }); noise(0.05, { vol: 0.1, hi: true, hz: 1500, at: 0.08 }); break;
    case "bolt": noise(0.05, { vol: 0.03, hz: 300 }); break;
    case "stage": [392, 494, 587].forEach((f, i) => tone(f, 0.09, { at: i * 0.1, vol: 0.04 })); break;
    case "bonus": [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.07, { at: i * 0.07, vol: 0.04 })); break;
    case "clear": [587, 784].forEach((f, i) => tone(f, 0.1, { at: i * 0.1, vol: 0.04 })); break;
    case "revoked": [220, 196, 165].forEach((f, i) => tone(f, 0.18, { at: i * 0.18, vol: 0.06 })); break;
    case "done": [392, 523, 659, 784].forEach((f, i) => tone(f, 0.12, { at: i * 0.11, vol: 0.05 })); break;
    default: break;
  }
}
