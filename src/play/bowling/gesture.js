// THE LANES, the mouse, the finger and the pad's right stick, read as a throw. Pure (no DOM, no clock of
// its own): the caller hands in samples and gets back the numbers of ONE throw event, which is what the
// game logs ({t: "throw", x, a, mph, r, foul}); a replay never needs the samples.
//
// MOUSE / TOUCH. Press anywhere on the lane, PULL BACK (drag down: the backswing), then FLICK FORWARD
// (up) past where you pressed. The flick's direction off straight up moves the line (a little: the
// arrow is the aim, the flick the release), its speed is the ball's speed, and the curl at the end of
// it (the wrist, turning the hand over) is the hook: a flick that bends left at the finish hooks left
// for a right-hander (right for a lefty), one that runs straight gives the house's modest hook, and one
// that bends the other way backs the ball up. A flick far too hard charges the line: a foul.
// RIGHT STICK. Pull back, then push forward: the time from the bottom of the backswing to full forward
// is the speed; where the stick leans sideways as it goes through is the hook.

import { speedOf } from "./sim.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const PULL_MIN = 18;     // px of backswing before a flick counts
export const PUSH_PAST = 10;    // px past the press point that releases the ball
export const FOUL_POWER = 0.985;

// power from the flick's speed (px per ms on the 480-wide picture): 1 px/ms is a firm throw
export const powerOfFlick = (v) => 1.06 * (1 - Math.exp(-v / 1.25));

// The swing so far (for the HUD): -> {stage: 0 none | 1 back | 2 through, pull, power}
export function liveFlick(S) {
  if (S.length < 2) return { stage: 0, pull: 0, power: 0 };
  const y0 = S[0].y;
  let ib = 0;
  for (let i = 1; i < S.length; i++) if (S[i].y > S[ib].y) ib = i;
  const pull = S[ib].y - y0, last = S[S.length - 1];
  if (pull < PULL_MIN || ib === S.length - 1 || last.y >= S[ib].y - 2) return { stage: pull > 4 ? 1 : 0, pull, power: 0 };
  const T = Math.max(8, last.t - S[ib].t), d = Math.hypot(last.x - S[ib].x, S[ib].y - last.y);
  return { stage: 2, pull, power: powerOfFlick(d / T) };
}

// The finished flick -> {kind: "throw", dx (line), v (px/ms), curl (-1..1), power} | {kind: "pending"} |
// {kind: "cancel"}. done: the pointer was let go.
export function readFlick(S, done = false) {
  if (S.length < 2) return { kind: done ? "cancel" : "pending" };
  const x0 = S[0].x, y0 = S[0].y;
  let ib = 0;
  for (let i = 1; i < S.length; i++) if (S[i].y > S[ib].y) ib = i;
  const pull = S[ib].y - y0;
  if (pull < PULL_MIN) return { kind: done ? "cancel" : "pending" };
  let ie = -1;
  for (let i = ib + 1; i < S.length; i++) if (S[i].y <= y0 - PUSH_PAST) { ie = i; break; }
  if (ie < 0) {
    if (!done) return { kind: "pending" };
    // let go on the way up but short of the line: a soft throw if it went most of the way
    const last = S[S.length - 1];
    if (S[ib].y - last.y < pull * 0.7) return { kind: "cancel" };
    ie = S.length - 1;
  }
  const b = S[ib], e = S[ie];
  const T = Math.max(8, e.t - b.t), dy = b.y - e.y, dx = e.x - b.x;
  const v = Math.hypot(dx, dy) / T;
  // the curl: the turn between the first two thirds of the stroke and its last third (up is +y here)
  const m = S[Math.max(ib + 1, Math.floor(ib + (ie - ib) * 0.66))] || e;
  const ax = m.x - b.x, ay = b.y - m.y, cx = e.x - m.x, cy = m.y - e.y;
  const la = Math.hypot(ax, ay), lc = Math.hypot(cx, cy);
  const curl = la > 2 && lc > 2 ? clamp((ax * cy - ay * cx) / (la * lc), -1, 1) : 0;
  return { kind: "throw", dx: clamp(dx / Math.max(1, dy), -1, 1), v, curl, power: powerOfFlick(v), ms: T };
}

// A read flick (or the pad's swing) -> the throw event the game logs.
// base: {x, aim, weight, hand, easy}
export function throwOf(f, base) {
  const hand = base.hand === -1 ? -1 : 1;
  const r0 = base.easy ? 0 : 0.3;
  const r = clamp(r0 + f.curl * hand * 1.6, -0.5, 1);
  const a = clamp(base.aim + f.dx * 0.018, -0.08, 0.08);
  const power = Math.min(f.power, 1.12);
  return { t: "throw", x: base.x, a: Math.round(a * 1e6) / 1e6, mph: Math.round(speedOf(power, base.weight) * 100) / 100, r: Math.round(r * 1000) / 1000, foul: power > FOUL_POWER };
}

// THE RIGHT STICK. Fed one sample a frame ({x, y} after the dead zone; y down is +): -> null while
// swinging, or a flick-shaped read {kind: "throw", dx: 0, v, curl, power} once pushed through.
export function createStickSwing() {
  let stage = 0, tBack = 0, t = 0, side = 0;
  return {
    feed(s) {
      t++;
      if (stage === 0 && s.y > 0.6) { stage = 1; }
      if (stage === 1) { if (s.y > 0.6) tBack = t; else if (s.y < 0.3 && s.y > -0.85) { stage = 2; side = 0; } }
      if (stage === 2) {
        side = side * 0.6 + s.x * 0.4;
        if (s.y > 0.6) { stage = 1; tBack = t; }
        else if (s.y <= -0.85) {
          stage = 0;
          const frames = Math.max(1, t - tBack);
          const power = clamp(1.05 - (frames - 2) * 0.045, 0.25, 1.1);
          // the stick leaning left as it goes through turns the hand over: hook left
          return { kind: "throw", dx: 0, v: 0, curl: clamp(-side, -1, 1) * 0.6, power };
        }
      }
      if (stage === 0 && Math.abs(s.y) < 0.2) { tBack = 0; }
      return null;
    },
    stage: () => stage,
    reset() { stage = 0; },
  };
}
