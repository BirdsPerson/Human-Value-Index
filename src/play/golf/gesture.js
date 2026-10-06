// THE DEPARTMENT LINKS, the mouse and the finger: a drag on the picture read as a swing. Pure (no
// DOM, no clock of its own): a gesture is the pointer's samples [{x, y, t}] in the canvas's own
// pixels (320x224) and milliseconds. Golf.jsx collects them; the stroke it reads is logged into the
// round as ONE event of computed numbers (sim.js act), so a replay never needs the samples.
//
// A FULL SWING ("drag swing"): press, PULL BACK (drag down) to take the club back (the distance
// pulled is the power, capped at PULL_FULL), then PUSH FORWARD (drag up) back past where the press
// began: the club comes through and the ball is struck at that moment.
//   line    how far the forward stroke drifts off vertical (sideways per pixel up). Right of
//           vertical is a slice for a right-hander, left a hook; a small wobble is a small curve
//           (a dead zone, then a straight ramp)
//   tempo   the forward stroke's time from the bottom to the strike: inside the sweet band is pure
//           contact; slower is FAT (short), quicker is THIN (low, runs)
//   cancel  let go before pushing through and nothing happens: no stroke
// A PUTT: drag back for pace (the meter's marker, the same scale as the two-tap meter), let go to
// putt; drifting sideways while drawing it back pushes or pulls the line a touch.
// A CLICK (no drag) is the classic meter's button: the caller presses A.
// EASY SWING widens the dead zone and the sweet band; the sim also keeps two fifths of a miss.

export const PULL_FULL = 64;      // canvas px pulled for full power
export const PULL_PUTT = 72;      // canvas px pulled for the putter's full pace
export const PULL_MIN = 6;        // less than this and it is not a swing
export const CLICK_MOVE = 4;      // a press that moves less than this and lets go is a click
const SWEET = { lo: 70, hi: 280 }, SWEET_EASY = { lo: 45, hi: 420 };   // ms, bottom to strike
const DEAD = 0.05, DEAD_EASY = 0.1, RAMP = 0.45;                        // drift per px up -> curve
export const PUTT_DRIFT = 0.025;  // radians the putter's line moves at the most

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// The swing so far, for the picture: -> {pull, m (0..1: the meter's marker), stage (1 back, 2
// through), through (struck), drift (px sideways on the way through)}
export function liveSwing(S, putt = false) {
  if (!S.length) return { pull: 0, m: 0, stage: 1, through: false, drift: 0 };
  const y0 = S[0].y;
  let ib = 0;
  for (let i = 1; i < S.length; i++) if (S[i].y >= S[ib].y) ib = i;
  const pull = Math.max(0, S[ib].y - y0), full = putt ? PULL_PUTT : PULL_FULL, power = Math.min(1, pull / full);
  const last = S[S.length - 1], back = last.y >= S[ib].y - 1 || ib === S.length - 1;
  const through = !putt && pull >= PULL_MIN && S.slice(ib).some(p => p.y <= y0);
  if (putt || back) return { pull, m: power, power, stage: 1, through, drift: last.x - S[0].x };
  // on the way through the marker falls back with the club
  return { pull, m: clamp((last.y - y0) / full, 0, 1), power, stage: 2, through, drift: last.x - S[ib].x };
}

// The finished gesture: -> {kind: "click"} | {kind: "cancel"} | {kind: "swing", power, a, contact}
// | {kind: "putt", m, off}. `done`: the pointer was let go (a putt strikes on letting go; a swing
// strikes the moment it pushes through, without waiting).
export function readSwing(S, { putt = false, easy = false, done = true } = {}) {
  if (!S.length) return { kind: "cancel" };
  const x0 = S[0].x, y0 = S[0].y;
  const moved = Math.max(...S.map(p => Math.hypot(p.x - x0, p.y - y0)));
  if (done && moved < CLICK_MOVE) return { kind: "click" };
  let ib = 0;
  for (let i = 1; i < S.length; i++) if (S[i].y >= S[ib].y) ib = i;
  const pull = S[ib].y - y0;
  if (pull < PULL_MIN) return done ? { kind: "cancel" } : { kind: "pending" };
  if (putt) {
    if (!done) return { kind: "pending" };
    const last = S[S.length - 1], drift = (last.x - x0) / Math.max(pull, 12), dz = easy ? 0.16 : 0.08;
    const off = Math.sign(drift) * clamp((Math.abs(drift) - dz) / 0.6, 0, 1) * PUTT_DRIFT;
    return { kind: "putt", m: Math.min(1, pull / PULL_PUTT), off };
  }
  // the strike: the first sample back past the start, the crossing interpolated
  let it = -1;
  for (let i = ib + 1; i < S.length; i++) if (S[i].y <= y0) { it = i; break; }
  if (it < 0) return done ? { kind: "cancel" } : { kind: "pending" };
  const p = S[it - 1], q = S[it], f = p.y === q.y ? 1 : (p.y - y0) / (p.y - q.y);
  const xs = p.x + (q.x - p.x) * f, ts = p.t + (q.t - p.t) * f;
  const b = S[ib], rise = b.y - y0;
  const slope = (xs - b.x) / Math.max(1, rise), dz = easy ? DEAD_EASY : DEAD;
  const a = Math.sign(slope) * clamp((Math.abs(slope) - dz) / RAMP, 0, 1.2);
  const T = ts - b.t, band = easy ? SWEET_EASY : SWEET;
  const contact = T < band.lo ? clamp((band.lo - T) / band.lo, 0, 1) : T > band.hi ? -clamp((T - band.hi) / (band.hi * 1.5), 0, 1) : 0;
  return { kind: "swing", power: Math.min(1, pull / PULL_FULL), a, contact, slope, ms: T };
}

// The words for a stroke (the screen reader, the HUD)
export const contactWord = (c) => (c <= -0.15 ? "FAT" : c >= 0.15 ? "THIN" : "PURE");
export const lineWord = (a) => (a > 0.6 ? "SLICE" : a > 0.12 ? "FADE" : a < -0.6 ? "HOOK" : a < -0.12 ? "DRAW" : "STRAIGHT");

// THE RIGHT STICK (a pad; Scott: like the PGA Tour games' analog swing): the same swing, the stick
// as the hand. Samples [{x, y, t}] are the stick after its dead zone (x right, y DOWN, -1..1) from
// the moment it is pulled. Pull DOWN to take it back (how far = power; held at the bottom = full),
// push UP past STICK_THROUGH to swing through (struck as it crosses); drifting left/right of
// vertical on the way up is the line, the push's time the contact (a thumb is quicker than a
// mouse: its own sweet band). Let the stick sit back at the centre before pushing: called off.
// A putt: pull back for pace, push forward through STICK_PUTT to stroke.
export const STICK_PULL = 0.95, STICK_THROUGH = -0.45, STICK_PUTT = -0.25, STICK_IDLE = 140;
const STICK_SWEET = { lo: 30, hi: 190 }, STICK_SWEET_EASY = { lo: 20, hi: 300 };
export function stickSwing(S, { putt = false, easy = false } = {}) {
  if (!S.length) return { kind: "pending" };
  let ib = 0;
  for (let i = 1; i < S.length; i++) if (S[i].y >= S[ib].y) ib = i;
  const b = S[ib], pull = b.y;
  if (pull < 0.12) return { kind: "pending" };
  const line = putt ? STICK_PUTT : STICK_THROUGH;
  let it = -1, idle = -1;
  for (let i = ib + 1; i < S.length; i++) {
    if (S[i].y <= line) { it = i; break; }
    if (Math.hypot(S[i].x, S[i].y) < 0.05) { if (idle < 0) idle = S[i].t; if (S[i].t - idle >= STICK_IDLE) return { kind: "cancel" }; } else idle = -1;
  }
  if (it < 0) return { kind: "pending" };
  const p = S[it - 1], q = S[it], f = p.y === q.y ? 1 : (p.y - line) / (p.y - q.y);
  const xs = p.x + (q.x - p.x) * f, ts = p.t + (q.t - p.t) * f;
  const power = Math.min(1, pull / STICK_PULL), slope = (xs - b.x) / Math.max(0.2, pull - line);
  if (putt) {
    const dz = easy ? 0.16 : 0.08, off = Math.sign(slope) * clamp((Math.abs(slope) - dz) / 0.6, 0, 1) * PUTT_DRIFT;
    return { kind: "putt", m: power, off };
  }
  const dz = easy ? DEAD_EASY : DEAD;
  const a = Math.sign(slope) * clamp((Math.abs(slope) - dz) / RAMP, 0, 1.2);
  const T = ts - b.t, band = easy ? STICK_SWEET_EASY : STICK_SWEET;
  const contact = T < band.lo ? clamp((band.lo - T) / band.lo, 0, 1) : T > band.hi ? -clamp((T - band.hi) / (band.hi * 1.5), 0, 1) : 0;
  return { kind: "swing", power, a, contact, slope, ms: T };
}
// the stick's swing so far, for the picture (the meter, the golfer's backswing)
export function liveStick(S, putt = false) {
  if (!S.length) return null;
  let ib = 0;
  for (let i = 1; i < S.length; i++) if (S[i].y >= S[ib].y) ib = i;
  const last = S[S.length - 1], power = Math.min(1, S[ib].y / STICK_PULL);
  if (power < 0.05) return null;
  const back = putt || last.y >= S[ib].y - 0.02;
  return { m: back ? power : clamp(last.y / STICK_PULL, 0, 1), power, stage: back ? 1 : 2, pull: power };
}
