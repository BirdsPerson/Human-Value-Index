// THE COURTS, playable: the sound. WebAudio blips and a noise-band crowd, made on the first gesture
// (browsers keep audio closed until then). Muted is kept in this browser.
//
// The crowd: the shared crowd module (src/play/crowdAudio.js, golf's and tennis's) is used when it
// is in the build (import.meta.glob finds it, or finds nothing and the build still passes); until
// then a swell of filtered noise stands in: a cheer on dunks, threes and blocks, a groan on airballs.
const KEY = "hvi-hoops-muted";
let ac = null;
export const isMuted = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
export const setMuted = (m) => { try { localStorage.setItem(KEY, m ? "1" : "0"); } catch { /* the tab remembers */ } };

const SHARED = import.meta.glob("../crowdAudio.js");
let shared = null;
const sharedLoad = SHARED["../crowdAudio.js"];
if (sharedLoad) sharedLoad().then(m => { shared = m; }).catch(() => { shared = null; });

function ctx() {
  if (ac) return ac;
  try { const C = window.AudioContext || window.webkitAudioContext; ac = C ? new C() : null; } catch { ac = null; }
  return ac;
}
export function unlock() { const a = ctx(); if (a && a.state === "suspended") a.resume().catch(() => {}); shared?.unlock?.(); }

function blip(freq, dur, type = "square", vol = 0.05, slide = 0, at = 0) {
  const a = ctx();
  if (!a || a.state !== "running") return;
  const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function swell(dur, { vol = 0.07, lo = 500, hi = 2400, at = 0 } = {}) {
  const a = ctx();
  if (!a || a.state !== "running") return;
  const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  let s = 7;
  for (let i = 0; i < n; i++) { s = (s * 16807) % 2147483647; const e = i / n; d[i] = ((s / 2147483647) * 2 - 1) * Math.min(1, e * 6) * (1 - e); }
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  f.type = "bandpass"; f.frequency.value = (lo + hi) / 2; f.Q.value = 0.6; g.gain.value = vol;
  src.buffer = buf; src.connect(f).connect(g).connect(a.destination); src.start(a.currentTime + at);
}
// The crowd's answer: "cheer" | "groan" | "stand".
export function crowd(kind, muted) {
  if (muted || !kind) return;
  if (shared) {
    const fn = shared[kind] || shared.react || shared.play;
    if (typeof fn === "function") { try { fn === shared[kind] ? fn() : fn(kind); return; } catch { /* fall through to ours */ } }
  }
  if (kind === "cheer") swell(1.4, { vol: 0.09, lo: 700, hi: 3000 });
  else if (kind === "stand") swell(0.8, { vol: 0.05 });
  else if (kind === "groan") { swell(1.1, { vol: 0.07, lo: 180, hi: 600 }); blip(196, 0.5, "triangle", 0.04, -60, 0.05); }
}

// The sim's events for a step -> sounds.
export function play(ev, muted) {
  if (muted || !ev.length) return;
  for (const e of ev) {
    if (e === "pass") blip(660, 0.04, "square", 0.04, -120);
    else if (e === "shoot" || e === "shoot3") blip(520, 0.06, "triangle", 0.05, 260);
    else if (e === "bounce") blip(150, 0.04, "triangle", 0.08);
    else if (e === "swish") blip(1400, 0.09, "triangle", 0.03, -600);
    else if (e === "slam") { blip(90, 0.18, "square", 0.08, -40); blip(220, 0.1, "sawtooth", 0.04, -100, 0.02); }
    else if (e === "miss" || e === "rimout") blip(300, 0.08, "square", 0.05, -120);
    else if (e === "block" || e === "steal" || e === "intercept") blip(880, 0.06, "square", 0.05, -400);
    else if (e === "buzzer") blip(110, 0.6, "sawtooth", 0.06);
    else if (e === "shotclock") blip(130, 0.45, "sawtooth", 0.05);
    else if (e === "toss" || e === "inbound") blip(1800, 0.05, "square", 0.025);   // the whistle
    else if (e === "two" || e === "three" || e === "dunk") { blip(660, 0.07, "square", 0.04); blip(990, 0.1, "square", 0.04, 0, 0.08); }
    else if (e === "over") [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.12, "square", 0.05, 0, 0.12 * i + 0.2));
  }
}
