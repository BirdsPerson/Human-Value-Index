// FOURTH AND LONG: the sound. Square-wave blips in the 8-bit manner and the shared crowd
// (../crowdAudio.js), under this cabinet's own mute, kept in this browser. Nothing plays before the
// first gesture (unlock opens the context).
import { makeCrowd } from "../crowdAudio.js";
const KEY = "hvi-tecmo-muted";
let ac = null;
export const isMuted = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
export const setMuted = (m) => { try { localStorage.setItem(KEY, m ? "1" : "0"); } catch { /* the tab remembers */ } };
const CROWD = makeCrowd({ ctx: () => ac, muted: isMuted, volume: 0.4 });
function ctx() {
  if (ac) return ac;
  try { const C = window.AudioContext || window.webkitAudioContext; ac = C ? new C() : null; } catch { ac = null; }
  return ac;
}
export function unlock() { const a = ctx(); if (a && a.state === "suspended") a.resume().then(() => CROWD.warm()).catch(() => {}); else if (a) CROWD.warm(); }
export function close() { CROWD.stop(); }
function blip(freq, dur, type = "square", vol = 0.05, slide = 0, at = 0) {
  const a = ctx();
  if (!a || a.state !== "running") return;
  const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.linearRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
const CROWD_ON = { td: "roar", bighit: "ooh", int: "groan", good: "cheer", break: "ooh", safety: "cheer", final: "warm" };
export function play(evs, muted) {
  if (muted || !evs.length) return;
  for (const { k } of evs) {
    if (k === "cursor") blip(880, 0.03, "square", 0.025);
    else if (k === "lock") { blip(660, 0.05, "square", 0.04); blip(990, 0.06, "square", 0.04, 0, 0.05); }
    else if (k === "snap" || k === "hand") blip(196, 0.06, "square", 0.05, -40);
    else if (k === "throw" || k === "kick") blip(392, 0.12, "triangle", 0.06, 400);
    else if (k === "catch") blip(523, 0.05, "square", 0.04);
    else if (k === "grab") blip(110, 0.06, "square", 0.05);
    else if (k === "mash") blip(330 + Math.random() * 60, 0.025, "square", 0.02);
    else if (k === "break") { blip(523, 0.06, "square", 0.05); blip(784, 0.08, "square", 0.05, 0, 0.06); }
    else if (k === "bighit") { blip(70, 0.22, "square", 0.09, -40); blip(140, 0.1, "sawtooth", 0.05, -90, 0.02); }
    else if (k === "dive") blip(260, 0.08, "triangle", 0.03, -120);
    else if (k === "whistle" || k === "oob" || k === "inc") blip(1760, 0.14, "square", 0.025);
    else if (k === "read") [880, 660, 440].forEach((f, i) => blip(f, 0.07, "square", 0.04, 0, i * 0.07));
    else if (k === "int") blip(330, 0.3, "sawtooth", 0.05, -220);
    else if (k === "td") [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => blip(f, 0.12, "square", 0.05, 0, 0.12 * i));
    else if (k === "good") [784, 1047].forEach((f, i) => blip(f, 0.12, "square", 0.05, 0, 0.12 * i));
    else if (k === "nogood") blip(220, 0.35, "triangle", 0.05, -80);
    else if (k === "first") blip(988, 0.08, "square", 0.04);
    else if (k === "quarter" || k === "final") blip(147, 0.6, "square", 0.05);
    if (CROWD_ON[k]) CROWD.play(CROWD_ON[k]);
  }
}
