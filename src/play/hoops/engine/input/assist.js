// THE COURTS engine, input/assist.js (v5): the help the hands get (docs/design/BASKETBALL.md 4.8).
//   line awareness  the man you steer with the ball, inside 0.5 m of a line with the stick over it, slows
//                   to a walk and stops 0.1 m inside; he steps out only by holding the stick over it with
//                   RT (sprint) for 8 frames, on purpose. Dribble moves never carry anyone over a line.
//                   The lines are the sidelines and end lines, the half line on a half court, and the
//                   half line on the full court once his side is in the frontcourt and over-and-back is
//                   called on him (the CPU is always held to it).
//   icons           the letters over your teammates are assigned at tip-off by roster slot; when the man
//                   you steer changes, his letter goes to the man you steered before: a swap of two.
// Pure: imports nothing from outside src/play/hoops/engine/.
import { C } from "../court.js";
import { BTN } from "./intents.js";
import { called } from "../rules/index.js";
import { say } from "../state.js";

export const LINE_NEAR = 0.5, LINE_IN = 0.1, LINE_MEAN = 8;
// [x0, x1, y0, y1]: the lines the man with the ball is held inside
export function linesOf(st, P) {
  let x0 = st.half ? 0 : -C.hx, x1 = C.hx;
  if (!st.half && st.ps && st.ps.t === P.t && st.ps.fc && called(st, P.t, "backcourt")) { if (P.d > 0) x0 = 0; else x1 = 0; }
  return [x0, x1, 0, C.w];
}
// the stick's velocity (already set) near a line: the outward part slows to a walk
export function lineSlow(st, P, m) {
  const [x0, x1, y0, y1] = linesOf(st, P);
  const out = (P.x - x0 < LINE_NEAR && P.vx < 0) || (x1 - P.x < LINE_NEAR && P.vx > 0) || (P.y - y0 < LINE_NEAR && P.vy < 0) || (y1 - P.y < LINE_NEAR && P.vy > 0);
  P.lineOut = out && m & BTN.RT ? (P.lineOut || 0) + 1 : 0;
  if (!out || P.lineOut >= LINE_MEAN) return;
  if ((P.x - x0 < LINE_NEAR && P.vx < 0) || (x1 - P.x < LINE_NEAR && P.vx > 0)) P.vx *= 0.3;
  if ((P.y - y0 < LINE_NEAR && P.vy < 0) || (y1 - P.y < LINE_NEAR && P.vy > 0)) P.vy *= 0.3;
  if (st.frame - st.lineAt > 30) say(st, "line", P);
  st.lineAt = st.frame;
}
// after the step: 0.1 m inside, unless he meant it
export function lineHold(st, P) {
  if ((P.lineOut || 0) >= LINE_MEAN) return;
  const [x0, x1, y0, y1] = linesOf(st, P);
  if (P.x < x0 + LINE_IN) P.x = x0 + LINE_IN; else if (P.x > x1 - LINE_IN) P.x = x1 - LINE_IN;
  if (P.y < y0 + LINE_IN) P.y = y0 + LINE_IN; else if (P.y > y1 - LINE_IN) P.y = y1 - LINE_IN;
}
// a dribble move's velocity: nothing outward within 0.6 m of a line
export function moveClip(st, P) {
  const [x0, x1, y0, y1] = linesOf(st, P), k = 0.6;
  if ((P.x - x0 < k && P.vx < 0) || (x1 - P.x < k && P.vx > 0)) P.vx = 0;
  if ((P.y - y0 < k && P.vy < 0) || (y1 - P.y < k && P.vy > 0)) P.vy = 0;
}
// the stable icons: the man you steer now gives his letter to the one you steered before
export function iconSwap(st) {
  if (!st.icon || st.n < 2) return;
  if (st.ctl !== st.iconAt) { const L = st.icon[st.ctl]; st.icon[st.ctl] = ""; st.icon[st.iconAt] = L || st.icon[st.iconAt]; st.iconAt = st.ctl; }
}
export const iconsFor = (st, P) => st.p.filter(Q => Q.t === P.t && Q !== P && st.icon[Q.i]).map(Q => ({ g: Q.g, b: st.icon[Q.i] }));
