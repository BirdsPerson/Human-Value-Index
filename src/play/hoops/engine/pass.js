// THE COURTS engine, pass.js: passes: the human's target, the lead, the flight's set-up, the lane, the alley-oop's man.
// Split from the v4 sim.js unchanged (docs/design/BASKETBALL.md 4.2, stage S1a); pure: imports nothing
// from outside src/play/hoops/engine/.
import { HZ, clamp, C, len, rimOf, distRim } from "./court.js";
import { BTN } from "./input/intents.js";
import { aim } from "./physics.js";
import { rnd, lv, you, human, say, markerOf } from "./state.js";

// ---- passes, steals --------------------------------------------------------------------------------
export function passTarget(st, P, m) {
  const dx = (m & BTN.RIGHT ? 1 : 0) - (m & BTN.LEFT ? 1 : 0), dy = (m & BTN.UP ? 1 : 0) - (m & BTN.DOWN ? 1 : 0);
  let best = null, bs = -1e9;
  for (const Q of st.p) {
    if (Q.t !== P.t || Q === P) continue;
    const ox = Q.x - P.x, oy = Q.y - P.y, dd = len(ox, oy) || 0.01;
    const s = dx || dy ? (ox * dx + oy * dy) / (dd * len(dx, dy)) * 10 - dd * 0.15 : -dd;
    if (s > bs) { bs = s; best = Q; }
  }
  return best;
}
// The pass's speed (m/s along the floor), by type and distance: a longer pass is thrown harder, a
// better passer throws it crisper; a bounce pass is a little slower, a lob much slower.
export function passSpeed(P, kind, dist) {
  const s = clamp(8.5 + 0.5 * dist, 9, 15.5) * (0.9 + 0.1 * P.k + 0.06 * P.S.pass);
  return kind === "bounce" ? s * 0.8 : kind === "lob" ? s * 0.58 : s;
}
// The lead: when a receiver at (qx, qy) running at (vx, vy) meets a ball thrown from (px, py) at
// speed sp: the positive root of |q + v t - p| = sp t. -> seconds.
export function leadTime(px, py, qx, qy, vx, vy, sp) {
  const dx = qx - px, dy = qy - py, a = vx * vx + vy * vy - sp * sp, b = 2 * (dx * vx + dy * vy), c = dx * dx + dy * dy;
  const plain = len(dx, dy) / sp;
  if (a > -1e-6) return plain;   // he outruns the ball: throw it at him
  const disc = b * b - 4 * a * c;
  if (disc < 0) return plain;
  const r = Math.sqrt(disc), t1 = (-b - r) / (2 * a), t2 = (-b + r) / (2 * a);
  const t = t1 > 0 && t2 > 0 ? Math.min(t1, t2) : t1 > 0 ? t1 : t2 > 0 ? t2 : plain;
  return Math.min(t, 1.8);
}
// kind: "chest" | "bounce" (off the floor two-thirds of the way: slower, harder to pick off) | "lob"
// (over the top; an alley-oop to a dunker going to the rim). Every pass leads its man: it is thrown to
// where he will be (his running velocity and the pass's speed), short of the end of his cut and inside
// the lines, and he keeps running onto it.
export function passTo(st, P, Q, kind = "chest", forceAlley = false) {
  const b = st.ball, x0 = P.x + P.face * 0.3, y0 = P.y;
  const vx = Q.ax || 0, vy = Q.ay || 0, rv = len(vx, vy);
  let sp = passSpeed(P, kind, len(Q.x - x0, Q.y - y0));
  let t = rv > 0.6 ? leadTime(x0, y0, Q.x, Q.y, vx, vy, sp) : len(Q.x - x0, Q.y - y0) / sp;
  let tx = Q.x + vx * t, ty = Q.y + vy * t, tz = kind === "bounce" ? 0.85 : 1.2;
  // a cutter stops at the end of his cut: no further than that
  if (Q.cut && rv > 0.6) { const left = len(Q.cut.x - Q.x, Q.cut.y - Q.y); if (rv * t > left) { tx = Q.cut.x; ty = Q.cut.y; } }
  tx = clamp(tx, st.half ? 0.6 : -C.hx + 0.4, C.hx - 0.5); ty = clamp(ty, 0.4, C.w - 0.4);
  const qr = distRim(Q);
  const going = (vx * (rimOf(Q) - Q.x) + vy * (C.cy - Q.y)) > 0 || Boolean(Q.cut);
  const alley = kind === "lob" && Q.dunker && qr < (forceAlley ? 7 : 5.5) && (going || forceAlley);
  if (alley) { const d = Q.d; tx = d * (C.rimX - 0.7); ty = C.cy + (Q.y - C.cy) * 0.2; tz = 3.3; Q.cut = { x: tx, y: ty, until: st.frame + 90 }; }
  else if (kind === "lob") tz = 2.1;
  const dist = len(tx - x0, ty - y0);
  const T = Math.max(kind === "lob" ? (alley ? 34 : 28) : kind === "bounce" ? 12 : 6, Math.round((dist / sp) * HZ));
  Object.assign(b, { st: "pass", own: -1, from: P.g, to: Q.g, f: 0, x: x0, y: y0, z: 1.3, pass: kind, alley, T, tx, ty, tz, rv, leg: 1, tried: 0 });
  if (kind === "bounce") { const k = 0.64, T1 = Math.max(4, Math.round(T * k)); b.T1 = T1; aim(b, x0 + (tx - x0) * k, y0 + (ty - y0) * k, 0, T1); }
  else aim(b, tx, ty, tz, T);
  P.hold = 0; P.passF = st.frame; st.lastTouch = P.t;
  if (Q.t === 0 && !st.cfg.auto) st.ctl = Q.i;
  // give and go: the passer cuts to the rim when his man is behind him or asleep
  const M = markerOf(st, P);
  if (!alley && M && !human(st, P) && (st.frame & 1) === 0 && rnd(st) < 0.35 + (you(st, P.t) ? lv(st).cut * 1.5 : 0)) { const d = P.d; P.cut = { x: d * (C.rimX - 1.2), y: C.cy + (P.y > C.cy ? 0.8 : -0.8), until: st.frame + 70 }; }
  say(st, alley ? "lob" : "pass", P, { to: Q.g });
}
export function laneClear(st, P, Q) {
  const ax = Q.x - P.x, ay = Q.y - P.y, L2 = ax * ax + ay * ay || 1;
  for (const O of st.p) {
    if (O.t === P.t) continue;
    const u = clamp(((O.x - P.x) * ax + (O.y - P.y) * ay) / L2, 0, 1), px = P.x + ax * u - O.x, py = P.y + ay * u - O.y;
    if (px * px + py * py < 0.8 * 0.8) return false;
  }
  return true;
}

// The alley-oop's man: the teammate nearest the rim who is going there, a dunker first.
export const OOP_TAP = 12;   // frames for the second tap of Y
export function oopTarget(st, P) {
  let best = null, bs = 1e9;
  for (const Q of st.p) {
    if (Q.t !== P.t || Q === P) continue;
    const r = distRim(Q);
    if (r > 8) continue;
    const going = ((Q.ax || 0) * (rimOf(Q) - Q.x) + (Q.ay || 0) * (C.cy - Q.y)) > 0;
    const sc = r - (Q.cut ? 1.5 : 0) - (going ? 1 : 0) - (Q.dunker ? 1.5 : 0);
    if (sc < bs) { bs = sc; best = Q; }
  }
  return best;
}
