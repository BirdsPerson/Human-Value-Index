// Blips: square and noise through WebAudio, made on demand (no files). Muted is kept per browser.
const KEY = "hvi-golf-mute";
let ac = null, muted = (() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } })();
export const isMuted = () => muted;
export function setMuted(m) { muted = Boolean(m); try { localStorage.setItem(KEY, muted ? "1" : "0"); } catch { /* the tab remembers */ } }
function ctx() {
  if (ac) return ac;
  try { const C = window.AudioContext || window.webkitAudioContext; ac = C ? new C() : null; } catch { ac = null; }
  return ac;
}
export function unlock() { const a = ctx(); if (a && a.state === "suspended") a.resume().catch(() => {}); }
function tone(freq, dur, { type = "square", vol = 0.06, at = 0, slide = 0 } = {}) {
  const a = ctx(); if (!a || muted) return;
  const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, { vol = 0.08, at = 0, hi = false } = {}) {
  const a = ctx(); if (!a || muted) return;
  const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  let s = 1;
  for (let i = 0; i < n; i++) { s = (s * 16807) % 2147483647; d[i] = ((s / 2147483647) * 2 - 1) * (1 - i / n); }
  const src = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
  f.type = hi ? "highpass" : "lowpass"; f.frequency.value = hi ? 2000 : 900;
  src.buffer = buf; g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination); src.start(a.currentTime + at);
}
export function play(ev) {
  switch (ev) {
    case "swing": tone(440, 0.04); break;
    case "tick": tone(660, 0.04); break;
    case "hit": noise(0.06, { hi: true, vol: 0.12 }); tone(880, 0.05, { at: 0.01 }); break;
    case "shank": noise(0.1, { vol: 0.14 }); tone(220, 0.15, { slide: -80 }); break;
    case "land": noise(0.05, { vol: 0.06 }); break;
    case "tree": noise(0.12, { vol: 0.1 }); tone(180, 0.08, { type: "triangle" }); break;
    case "splash": noise(0.35, { vol: 0.12 }); break;
    case "ob": tone(196, 0.12); tone(147, 0.2, { at: 0.13 }); break;
    case "cup": [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.08, { at: i * 0.07, type: "square", vol: 0.05 })); break;
    case "club": tone(990, 0.03, { vol: 0.04 }); break;
    case "hole": tone(392, 0.07, { vol: 0.04 }); tone(523, 0.1, { at: 0.08, vol: 0.04 }); break;
    case "done": [392, 523, 659, 523, 784].forEach((f, i) => tone(f, 0.1, { at: i * 0.1, vol: 0.05 })); break;
    default: break;
  }
}
