// THE BOWL, playable: the sound. WebAudio blips and the shared crowd (../crowdAudio.js, the courts'
// and the club's), under this page's mute, kept in this browser. Nothing plays before the first
// gesture (unlock opens the context).
import { makeCrowd } from "../crowdAudio.js";
const KEY = "hvi-football-muted";
let ac = null;
export const isMuted = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
export const setMuted = (m) => { try { localStorage.setItem(KEY, m ? "1" : "0"); } catch { /* the tab remembers */ } };
const CROWD = makeCrowd({ ctx: () => ac, muted: isMuted });
function ctx() {
  if (ac) return ac;
  try { const C = window.AudioContext || window.webkitAudioContext; ac = C ? new C() : null; } catch { ac = null; }
  return ac;
}
export function unlock() { const a = ctx(); if (a && a.state === "suspended") a.resume().then(() => CROWD.warm()).catch(() => {}); else if (a) CROWD.warm(); }
function blip(freq, dur, type = "square", vol = 0.05, slide = 0, at = 0) {
  const a = ctx();
  if (!a || a.state !== "running") return;
  const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
export function crowd(kind, muted) { if (!muted && kind) CROWD.play(kind); }
export function play(ev, muted) {
  if (muted || !ev.length) return;
  for (const e of ev) {
    if (e === "snap") blip(220, 0.05, "square", 0.04, -60);
    else if (e === "throw" || e === "lob") blip(520, 0.07, "triangle", 0.05, e === "lob" ? 120 : 300);
    else if (e === "catch" || e === "contested") blip(330, 0.05, "square", 0.04);
    else if (e === "w_down" || e === "w_oob") blip(1800, 0.12, "square", 0.025);   // the whistle
    else if (e === "w_inc") { blip(1800, 0.08, "square", 0.025); blip(1800, 0.08, "square", 0.025, 0, 0.12); }
    else if (e === "bighit" || e === "truck") { blip(80, 0.16, "square", 0.08, -30); blip(160, 0.08, "sawtooth", 0.04, -80, 0.02); }
    else if (e === "juke" || e === "spin") blip(700, 0.05, "triangle", 0.03, -200);
    else if (e === "kick" || e === "punt" || e === "kickoff") blip(120, 0.1, "square", 0.07, -50);
    else if (e === "flag") blip(990, 0.15, "square", 0.03, -300);
    else if (e === "td") [523, 659, 784, 1047, 784, 1047].forEach((f, i) => blip(f, 0.11, "square", 0.05, 0, 0.11 * i));
    else if (e === "int" || e === "fumble") blip(300, 0.25, "sawtooth", 0.05, -200);
    else if (e === "quarter" || e === "final") blip(110, 0.7, "sawtooth", 0.06);
  }
}
