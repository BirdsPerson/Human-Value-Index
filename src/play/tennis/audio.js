// THE TENNIS CLUB, playable: the sound. WebAudio square and triangle blips, made on the first
// gesture (browsers keep audio closed until then). Muted is kept in this browser.
const KEY = "hvi-tennis-muted";
let ac = null;
export const isMuted = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
export const setMuted = (m) => { try { localStorage.setItem(KEY, m ? "1" : "0"); } catch { /* the tab remembers */ } };

function ctx() {
  if (ac) return ac;
  try { const C = window.AudioContext || window.webkitAudioContext; ac = C ? new C() : null; } catch { ac = null; }
  return ac;
}
export function unlock() { const a = ctx(); if (a && a.state === "suspended") a.resume().catch(() => {}); }

function blip(freq, dur, type = "square", vol = 0.06, slide = 0, at = 0) {
  const a = ctx();
  if (!a || a.state !== "running") return;
  const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}

// The sim's events for a step -> sounds.
export function play(ev, muted) {
  if (muted || !ev.length) return;
  for (const e of ev) {
    if (e === "hit") blip(880, 0.05, "square", 0.05, -200);
    else if (e === "smash") blip(1100, 0.08, "square", 0.06, -500);
    else if (e === "bounce") blip(240, 0.04, "triangle", 0.08);
    else if (e === "toss") blip(520, 0.06, "triangle", 0.04, 200);
    else if (e === "net") blip(110, 0.12, "sawtooth", 0.05, -40);
    else if (e === "fault") { blip(330, 0.08, "square", 0.04); blip(247, 0.12, "square", 0.04, 0, 0.09); }
    else if (e === "point") { blip(660, 0.07, "square", 0.04); blip(990, 0.1, "square", 0.04, 0, 0.08); }
    else if (e === "match") { [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.12, "square", 0.05, 0, 0.12 * i + 0.2)); }
  }
}
