// THE LANES, heard. All synthesised here (no samples): the ball's rumble down the boards (filtered
// noise, louder with speed), the pins' crash (a burst of short hollow knocks: maple on maple), the
// kickbacks' thump, the gutter's rattle, the pinsetter's sweep, and the shared crowd (crowdAudio.js)
// for strikes, splits and the 7-10. Muted is kept in this browser. Nothing plays before a gesture.
import { makeCrowd } from "../crowdAudio.js";
const KEY = "hvi-bowling-muted";
let ac = null, rumble = null;
export const isMuted = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
export const setMuted = (m) => { try { localStorage.setItem(KEY, m ? "1" : "0"); } catch { /* the tab remembers */ } if (m) stopRoll(); };

function ctx() {
  if (ac) return ac;
  try { const C = window.AudioContext || window.webkitAudioContext; ac = C ? new C() : null; } catch { ac = null; }
  return ac;
}
const CROWD = makeCrowd({ ctx: () => ac, muted: isMuted, volume: 0.35 });
export function unlock() { const a = ctx(); if (a && a.state === "suspended") a.resume().catch(() => {}); }
const live = () => { const a = ctx(); return a && a.state === "running" && !isMuted() ? a : null; };

let noiseBuf = null;
function noise(a) {
  if (noiseBuf && noiseBuf.sampleRate === a.sampleRate) return noiseBuf;
  noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let s = 7;
  for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
  return noiseBuf;
}
// one knock: a short band of noise through a resonant filter (a pin's hollow body)
function knock(a, at, freq, vol, dur = 0.07) {
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = noise(a); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = 9;
  const t = a.currentTime + at;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination); src.start(t, Math.random() * 1.5, dur + 0.02);
}

export function startRoll() {
  const a = live(); if (!a || rumble) return;
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = noise(a); src.loop = true; f.type = "lowpass"; f.frequency.value = 140; f.Q.value = 2;
  g.gain.value = 0.0001; src.connect(f).connect(g).connect(a.destination); src.start();
  rumble = { src, f, g };
}
export function rollLevel(speed01, y01) {
  if (!rumble || !ac) return;
  const t = ac.currentTime;
  rumble.g.gain.setTargetAtTime(0.02 + 0.28 * speed01 * (0.6 + 0.4 * y01), t, 0.05);
  rumble.f.frequency.setTargetAtTime(110 + 90 * speed01, t, 0.1);
}
export function stopRoll() {
  if (!rumble || !ac) { rumble = null; return; }
  const r = rumble; rumble = null;
  try { r.g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.08); r.src.stop(ac.currentTime + 0.4); } catch { /* stopped */ }
}

// The sim's events for a step -> sounds. counts: how many pin knocks this step (a crash is many)
export function play(events, extra = {}) {
  const a = live(); if (!a || !events.length) return;
  let hits = 0, pins = 0, kicks = 0;
  for (const e of events) {
    if (e === "hit" || e === "first") hits++;
    else if (e === "pin" || e === "clack") pins++;
    else if (e === "kick") kicks++;
    else if (e === "release") { knock(a, 0, 180, 0.25, 0.12); startRoll(); }
    else if (e === "gutter") { for (let i = 0; i < 4; i++) knock(a, i * 0.05, 300 + i * 40, 0.08, 0.06); }
    else if (e === "bumper") knock(a, 0, 420, 0.25, 0.1);
    else if (e === "pit" || e === "pitsoft") { stopRoll(); knock(a, 0.05, 90, e === "pit" ? 0.5 : 0.25, 0.25); }
    else if (e === "tick") knock(a, 0, 1800, 0.08, 0.03);
  }
  // the crash: the ball's first contact loud and low, the pins' knocks scattered after it
  const n = Math.min(10, hits * 2 + pins);
  for (let i = 0; i < n; i++) knock(a, Math.random() * 0.05, 700 + Math.random() * 900, (hits ? 0.42 : 0.28) / (1 + i * 0.15), 0.05 + Math.random() * 0.05);
  if (hits) knock(a, 0, 260, 0.5, 0.14);
  for (let i = 0; i < kicks; i++) knock(a, i * 0.02, 160, 0.2, 0.1);
}
// the result of a ball -> the house
export function verdict(kind, extra = {}) {
  if (isMuted()) return;
  if (kind === "strike") CROWD.play(extra.turkey ? "roar" : "cheer");
  else if (kind === "spare") CROWD.play(extra.split ? "cheer" : "warm");
  else if (kind === "split") CROWD.play(extra.sevenTen ? "aww" : "ooh");
  else if (kind === "gutter") CROWD.play("groan");
  else if (kind === "foul") { const a = live(); if (a) { knock(a, 0, 1200, 0.3, 0.3); knock(a, 0.3, 900, 0.3, 0.4); } }
  else if (kind === "over") CROWD.play("polite");
  else if (kind === "sweep") { const a = live(); if (a) for (let i = 0; i < 6; i++) knock(a, 0.1 + i * 0.07, 120 + i * 10, 0.06, 0.12); }
}
