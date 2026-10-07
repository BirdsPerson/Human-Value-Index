// THE SUB-BASEMENTS' sounds: square, triangle and noise through WebAudio, made on demand (no files).
// Muted is kept per browser.
const KEY = "hvi-crawl-mute";
let ac = null, muted = (() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } })();
export const isMuted = () => muted;
export function setMuted(m) { muted = Boolean(m); try { localStorage.setItem(KEY, muted ? "1" : "0"); } catch { /* the tab remembers */ } }
function ctx() { if (ac) return ac; try { const C = window.AudioContext || window.webkitAudioContext; ac = C ? new C() : null; } catch { ac = null; } return ac; }
export function unlock() { const a = ctx(); if (a && a.state === "suspended") a.resume().catch(() => {}); }
function tone(freq, dur, { type = "square", vol = 0.04, at = 0, slide = 0 } = {}) {
  const a = ctx(); if (!a || muted) return;
  const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.linearRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, { vol = 0.08, at = 0, hz = 900, hi = false } = {}) {
  const a = ctx(); if (!a || muted) return;
  const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  let s = 7; for (let i = 0; i < n; i++) { s = (s * 16807) % 2147483647; d[i] = ((s / 2147483647) * 2 - 1) * (1 - i / n) * (1 - i / n); }
  const src = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
  f.type = hi ? "highpass" : "lowpass"; f.frequency.value = hz; src.buffer = buf; g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination); src.start(a.currentTime + at);
}
let lastAt = {};
export function play(ev) {
  const now = Date.now(); if (lastAt[ev.t] && now - lastAt[ev.t] < 40) return; lastAt[ev.t] = now;
  switch (ev.t) {
    case "swing": noise(0.06, { vol: 0.05, hz: 2400, hi: true }); break;
    case "hit": tone(ev.what === "cab" ? 140 : 220, 0.07, { vol: 0.06, slide: -80 }); noise(0.05, { vol: 0.06, hz: 1200 }); break;
    case "break": noise(0.18, { vol: 0.1, hz: 700 }); tone(90, 0.12, { type: "triangle", vol: 0.08 }); break;
    case "kill": tone(330, 0.05, { vol: 0.04 }); tone(165, 0.1, { vol: 0.04, at: 0.04 }); break;
    case "staple": tone(1400, 0.03, { vol: 0.03 }); break;
    case "roll": noise(0.12, { vol: 0.04, hz: 500 }); break;
    case "hurt": tone(110, 0.18, { vol: 0.08, slide: -40 }); noise(0.1, { vol: 0.07, hz: 600 }); break;
    case "evade": tone(880, 0.04, { vol: 0.03, type: "triangle" }); break;
    case "tele": tone(ev.what === "file-cart" ? 196 : 392, 0.08, { vol: 0.03, type: "triangle" }); break;
    case "charge": noise(0.25, { vol: 0.06, hz: 300 }); break;
    case "thud": noise(0.2, { vol: 0.1, hz: 200 }); break;
    case "shoot": tone(160, 0.08, { vol: 0.04, slide: -60 }); break;
    case "pickup": (ev.item === "bounty" ? [988] : ev.item === "keycard" ? [659, 988] : [523, 784]).forEach((f, i) => tone(f, 0.06, { vol: 0.035, at: i * 0.06 })); break;
    case "hatch.open": [392, 523, 659].forEach((f, i) => tone(f, 0.09, { at: i * 0.08, vol: 0.04 })); break;
    case "descend": tone(330, 0.3, { type: "triangle", vol: 0.05, slide: -200 }); break;
    case "door.open": tone(262, 0.08, { vol: 0.04 }); tone(392, 0.12, { vol: 0.04, at: 0.08 }); break;
    case "locked": case "sealed": tone(98, 0.15, { vol: 0.05 }); break;
    case "stalker.arrive": tone(62, 0.9, { type: "sawtooth", vol: 0.07, slide: 20 }); noise(0.5, { vol: 0.08, hz: 160 }); break;
    case "audit": tone(55, 0.4, { type: "sawtooth", vol: 0.09 }); tone(1046, 0.1, { vol: 0.04, at: 0.1 }); break;
    case "clank": tone(1200, 0.05, { vol: 0.03, type: "triangle" }); break;
    case "lift.reached": [523, 659, 784].forEach((f, i) => tone(f, 0.1, { at: i * 0.09, vol: 0.04, type: "triangle" })); break;
    case "lift.called": [784, 659, 523, 784].forEach((f, i) => tone(f, 0.14, { at: i * 0.15, vol: 0.04, type: "triangle" })); break;
    case "lost": tone(196, 0.5, { type: "triangle", vol: 0.06, slide: -120 }); break;
    case "spawn": tone(600, 0.04, { vol: 0.02 }); break;
    case "infested.cleared": [523, 784].forEach((f, i) => tone(f, 0.1, { at: i * 0.1, vol: 0.04 })); break;
    case "shift.warn": tone(440, 0.2, { vol: 0.05 }); tone(440, 0.2, { vol: 0.05, at: 0.3 }); break;
    case "use": tone(ev.item === "coffee" ? 523 : 1046, 0.12, { vol: 0.04, type: "triangle" }); break;
    default:
  }
}
