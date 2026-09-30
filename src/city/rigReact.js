// The rig in the city (rig.js does the drawing): which act runs which animation, and the
// REACTIONS the city triggers on a subject for a few seconds: friends meeting wave, rivals
// shrug or turn away, fans cheer a score, the Assembly's benches applaud a result. Anyone
// can call react(sheet, anim, t, seconds); poses.drawPose asks rigPose() first and draws the
// animation when one is due, else its own loops as before.
//
// Timing is the caller's clock (seconds, performance.now based; 0 under reduced motion,
// where nothing reacts and a named animation holds its key pose) plus each subject's
// phase (poses.phaseOf), so a crowd never moves in lockstep.

import { drawRig, ANIMS } from "./rig.js";
import { SPRITE_H as FH } from "../sprites.js";
import { keyOf } from "./sim.js";
import { ensureSocial } from "./socialClient.js";

// Acts (props.js anchors, parkGeo/civicGeo anchors) that are animations. Anything else is
// poses.js's. An anchor may also name one outright: {..., anim: "wave"}.
export const RIG_ACTS = {
  dance: "dance", dance2: "dance2", wave: "wave", clap: "clap", applaud: "clap", point: "point", shrug: "shrug",
  facepalm: "facepalm", stumble: "stumble", swim: "swim", ski: "ski", snowboard: "snowboard", golf: "golf",
  deal: "deal", chips: "chips", arcade: "arcade", phone: "phone", carry: "carry", sittalk: "sittalk", hooray: "cheer",
};

// ---- reactions: sheet -> {anim, t0, t1, turn} ---------------------------------------------
const live = new WeakMap();
// Start an animation on a subject's sheet (spriteBank.sheetFor) for `secs` from time t0.
export function react(sheet, anim, t0, secs = 2.5, turn = false) {
  if (!sheet || !(t0 > 0) || (anim && !ANIMS[anim])) return;
  const cur = live.get(sheet);
  if (cur && cur.t1 > t0 && cur.t0 <= t0) return;   // one at a time: the one under way finishes
  live.set(sheet, { anim, t0, t1: t0 + secs, turn });
}
export function reactionOf(sheet, t) {
  const r = sheet && t > 0 ? live.get(sheet) : null;
  return r && t >= r.t0 && t < r.t1 ? r : null;
}

// drawPose's hook: -> the box drawn, or null (poses.js draws as before).
//   sit: poses.js would sit this anchor; SEAT: its seat's height in sprite rows
export function rigPose(c, sheet, a, act, x, y, hh0, t, ph, k, sit, SEAT) {
  const r = reactionOf(sheet, t);
  const anim = (r && r.anim) || a.anim || RIG_ACTS[act];
  if (!anim && !(r && r.turn)) return null;
  const bp = hh0 / FH, scale = (hh0 * k) / FH;
  let face = a.face || 0;
  if (r && r.turn) face = face === 1 ? -1 : 1;
  const seat = sit || Boolean(ANIMS[anim || "idle"].seat);
  return drawRig(c, sheet, anim || "idle", t, x, y, scale, face, { ph, seat, seatY: seat ? y - SEAT * bp : null });
}

// ---- friends and rivals meeting -----------------------------------------------------------
let ties = null, asked = false;
function tieOf(a, b) {
  if (!ties) {
    if (!asked) {
      asked = true;
      ensureSocial().then(d => {
        if (!d) return;
        const m = new Map();
        for (const f of d.friends || []) m.set(f.a < f.b ? `${f.a}|${f.b}` : `${f.b}|${f.a}`, "friend");
        for (const f of d.rivals || []) m.set(f.a < f.b ? `${f.a}|${f.b}` : `${f.b}|${f.a}`, "rival");
        ties = m;
      }).catch(() => {});
    }
    return null;
  }
  return ties.get(a < b ? `${a}|${b}` : `${b}|${a}`) || null;
}
// test hook: set the ties directly ([["a|b", "friend"|"rival"], ...])
export function setTies(list) { ties = new Map(list); asked = true; }

const seen = new Map();   // scope|pair -> last time seen together
let pruneAt = 0;
const frac = (v) => ((v % 1) + 1) % 1;
// Everyone together in one place this frame: [{s, sheet}]. A pair that was not together a
// moment ago has just met: friends wave (each a beat apart), rivals: one shrugs, the other
// turns away. scope: the room (so the same pair meeting in two rooms is two meetings).
export function greet(scope, people, t) {
  if (!(t > 0) || people.length < 2) return;
  const n = Math.min(people.length, 16);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const A = people[i], B = people[j];
    const ka = keyOf(A.s), kb = keyOf(B.s);
    const rel = tieOf(ka, kb);
    if (!rel) continue;
    const k = `${scope}|${ka < kb ? ka + "|" + kb : kb + "|" + ka}`;
    const last = seen.get(k);
    seen.set(k, t);
    if (last != null && t - last < 8) continue;   // still together: they met already
    const d = frac(phase(ka) * 3.1) * 0.8;
    if (rel === "friend") { react(A.sheet, "wave", t + d, 2.4); react(B.sheet, "wave", t + d + 0.35, 2.4); }
    else { react(A.sheet, "shrug", t + d, 2); react(B.sheet, null, t + d + 0.2, 3, true); }
  }
  if (t > pruneAt) { pruneAt = t + 30; for (const [k, v] of seen) if (t - v > 60) seen.delete(k); }
}
function phase(key) { let h = 2166136261; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; }

// ---- the crowd: scores and results -----------------------------------------------------
const scores = new Map();   // place -> {total, at}
// A fixture's score this frame -> true while its fans should be cheering (4 s after it
// changes; never on first sight, so opening the view mid-game is not a goal).
export function scoreCheer(place, game, t) {
  const total = game && game.score ? game.score[0] + game.score[1] : null;
  const s = scores.get(place);
  if (!s || total == null) { scores.set(place, { total, at: -1e9, key: game ? `${game.day}|${game.from}` : null }); return false; }
  const key = `${game.day}|${game.from}`;
  if (s.key !== key) { s.key = key; s.total = total; s.at = -1e9; return false; }
  if (total > s.total && t > 0) { s.total = total; s.at = t; }
  else if (total < s.total) s.total = total;
  return t > 0 && t - s.at < 4;
}

// THE ASSEMBLY's benches (civicDraw.js): -> the animation for a spectator now, or null.
// A result in (the session closed within two days): the benches applaud in waves, the
// "cheer" seats on their feet; a vote cast while open (the tally goes up): a short clap.
const tallies = { n: null, at: -1e9 };
export function assemblyCrowd(v, act, t, ph, now = Date.now()) {
  if (!(t > 0) || !v || !v.session) return null;
  const s = v.session;
  if (s.state === "closed" && v.result) {
    const since = now - (Number(s.closeAt) || 0);
    if (!(since >= 0 && since < 48 * 3600 * 1000)) return null;
    return frac(t / 11 + ph * 0.25) < 0.4 ? (act === "cheer" ? "cheer" : "clap") : null;
  }
  if (s.state === "open" && v.tally && v.tally.votes) {
    const n = (v.tally.votes.golf || 0) + (v.tally.votes.farm || 0);
    if (tallies.n == null) tallies.n = n;
    else if (n > tallies.n) { tallies.n = n; tallies.at = t; }
    return t - tallies.at < 3 ? "clap" : null;
  }
  return null;
}
