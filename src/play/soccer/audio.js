// THE ESTATE PITCH, playable: the sound. WebAudio blips (the whistle, the boot, the net), the shared
// crowd (../crowdAudio.js: roars, oohs, groans, applause) and the terrace's own chant: a slow clap
// that quickens and a low "oh-oh" under it, synthesised here, every so often while the ball is live.
// Made on the first gesture (browsers keep audio closed until then). Mute is kept in this browser.
import { makeCrowd } from "../crowdAudio.js";
const KEY = "hvi-soccer-muted";
let ac = null;
export const isMuted = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
export const setMuted = (m) => { try { localStorage.setItem(KEY, m ? "1" : "0"); } catch { /* the tab remembers */ } };
const CROWD = makeCrowd({ ctx: () => ac, muted: isMuted, volume: 0.45 });

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
// The referee's whistle: a warble; n blasts (three for full time).
function whistle(n = 1, long = false) {
  const a = ctx();
  if (!a || a.state !== "running") return;
  for (let i = 0; i < n; i++) {
    const t = a.currentTime + i * (long ? 0.5 : 0.28), d = long && i === n - 1 ? 0.7 : 0.22;
    const o = a.createOscillator(), lfo = a.createOscillator(), lg = a.createGain(), g = a.createGain();
    o.type = "sine"; o.frequency.value = 2900; lfo.frequency.value = 38; lg.gain.value = 180;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.045, t + 0.02); g.gain.setValueAtTime(0.045, t + d - 0.04); g.gain.linearRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(a.destination); o.start(t); lfo.start(t); o.stop(t + d + 0.02); lfo.stop(t + d + 0.02);
  }
}
// The chant: eight claps slowing to a hold, then quickening, and two low sung notes under each pair.
function noiseBurst(a, t, dur, vol, hp = 900) {
  const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = buf; f.type = "highpass"; f.frequency.value = hp; g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination); s.start(t);
}
export function chant(muted) {
  const a = ctx();
  if (muted || !a || a.state !== "running") return;
  const beats = [0, 0.5, 1.0, 1.5, 2.25, 2.6, 2.95, 3.3, 3.65, 4.0];
  for (const b of beats) for (let k = 0; k < 6; k++) noiseBurst(a, a.currentTime + b + k * 0.012, 0.05, 0.05);
  for (const [b, f] of [[0, 147], [0.5, 165], [1.0, 147], [1.5, 131]]) {
    const t = a.currentTime + b, o = a.createOscillator(), o2 = a.createOscillator(), g = a.createGain(), flt = a.createBiquadFilter();
    o.type = "sawtooth"; o2.type = "sawtooth"; o.frequency.value = f; o2.frequency.value = f * 1.006;
    flt.type = "bandpass"; flt.frequency.value = 600; flt.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.018, t + 0.08); g.gain.linearRampToValueAtTime(0.0001, t + 0.45);
    o.connect(flt); o2.connect(flt); flt.connect(g).connect(a.destination); o.start(t); o2.start(t); o.stop(t + 0.5); o2.stop(t + 0.5);
  }
}
// The crowd's answer to a call (calls.js crowdFor): roar | cheer | ooh | groan | polite | thin.
export function crowd(kind, muted) { if (!muted && kind) CROWD.play(kind); }

// The sim's events for a step -> sounds.
const KICKS = new Set(["pass", "through", "lob", "cross", "clear", "throwin", "fkshot"]);
export function play(ev, muted) {
  if (muted || !ev.length) return;
  for (const e of ev) {
    if (KICKS.has(e)) blip(170, 0.05, "triangle", 0.09, -60);
    else if (e === "shot" || e === "header") { blip(120, 0.07, "triangle", 0.12, -50); blip(900, 0.03, "square", 0.02); }
    else if (e === "goal" || e === "owngoal") { blip(220, 0.12, "triangle", 0.08, -100); whistle(1); }
    else if (e === "post" || e === "bar") { blip(1250, 0.25, "square", 0.04, -40); blip(1870, 0.2, "square", 0.025); }
    else if (e === "save" || e === "catch" || e === "claim") blip(200, 0.06, "square", 0.05, -80);
    else if (e === "tackle" || e === "slide" || e === "shoulder" || e === "block" || e === "wall") blip(140, 0.06, "square", 0.06, -60);
    else if (e === "foul" || e === "penfoul" || e === "offside") whistle(1);
    else if (e === "kickoff" || e === "secondhalf" || e === "extratime") whistle(1);
    else if (e === "halftime" || e === "etbreak" || e === "fulltime-level") whistle(2, true);
    else if (e === "final") whistle(3, true);
    else if (e === "switch") blip(1500, 0.03, "square", 0.015);
    else if (e === "stepover" || e === "ballroll" || e === "roulette" || e === "heelflick" || e === "fakeshot") blip(700, 0.05, "triangle", 0.04, 300);
  }
}
