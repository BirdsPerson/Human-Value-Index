// THE COURTS, playable: the sound. WebAudio blips and a noise-band crowd, made on the first gesture
// (browsers keep audio closed until then). Muted is kept in this browser.
//
// The crowd: the shared crowd module (../crowdAudio.js, golf's and tennis's), under this page's
// mute: a roar for a dunk or a shot at the buzzer, cheers for threes and blocks, polite applause
// for an ordinary basket, a gasp when it rims out, a groan for an airball or the shot clock.
import { makeCrowd } from "../crowdAudio.js";
const KEY = "hvi-hoops-muted";
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
// The crowd's answer. mood: calls.js crowdFor ("cheer" | "stand" | "groan"); k: the event; buzzer:
// the ball was in the air at the buzzer.
const KIND = { dunk: "roar", three: "cheer", block: "cheer", two: "polite", steal: "thin", intercept: "thin", rimout: "ooh", airball: "groan", shotclock: "groan", ankles: "roar", alleyoop: "roar", ftmade: "polite", ftmiss: "aww" };
// A boo: low voices on an "oo", sliding down (the shared crowd has none; made here, cheaply).
function boo() {
  const a = ctx();
  if (!a || a.state !== "running") return;
  const t = a.currentTime, f = a.createBiquadFilter(), g = a.createGain();
  f.type = "lowpass"; f.frequency.value = 420;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
  f.connect(g).connect(a.destination);
  for (let i = 0; i < 9; i++) {
    const o = a.createOscillator(), f0 = 105 + i * 13;
    o.type = "sawtooth"; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 0.82, t + 1.4);
    o.connect(f); o.start(t + i * 0.02); o.stop(t + 1.55);
  }
}
export function crowd(mood, muted, k = null, buzzer = false) {
  if (muted || !mood) return;
  if (mood === "boo") { CROWD.play("quiet"); boo(); return; }
  if (mood === "hush") { CROWD.play("quiet"); return; }
  const kind = buzzer && (k === "two" || k === "three" || k === "dunk") ? "roar" : KIND[k] || { cheer: "cheer", stand: "polite", groan: "groan" }[mood];
  if (kind) CROWD.play(kind);
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
    else if (e === "toss" || e === "inbound" || e === "shootfoul" || e === "reachfoul" || e === "blockfoul" || e === "charge" || e === "loosefoul") blip(1800, 0.05, "square", 0.025);   // the whistle
    else if (e === "andone") CROWD.play("roar");
    else if (e === "ftset") CROWD.play("quiet");   // the hush at the line
    else if (e === "ftmade") blip(1200, 0.07, "triangle", 0.03, -400);
    else if (e === "two" || e === "three" || e === "dunk") { blip(660, 0.07, "square", 0.04); blip(990, 0.1, "square", 0.04, 0, 0.08); }
    else if (e === "over") [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.12, "square", 0.05, 0, 0.12 * i + 0.2));
  }
}
