// THE COURTS engine, moves.js: dribble moves: crossovers, hesitations, stepbacks, spins, ankles and lost balls.
// Split from the v4 sim.js unchanged (docs/design/BASKETBALL.md 4.2, stage S1a); pure: imports nothing
// from outside src/play/hoops/engine/.
import { clamp, C, len, rimOf } from "./court.js";
import { rnd, lv, human, say } from "./state.js";
import { moveClip } from "./input/assist.js";

// ---- dribble moves ------------------------------------------------------------------------------------
// kind: cross | btl (between the legs) | btb (behind the back) | hesi | stepback | spin | drive.
// side: +1 / -1 across the court (y). The nearest defender may lose his ankles; a handler who
// overdoes it, or has no handle, may lose the ball.
export const MOVE_LEN = { cross: 12, btl: 14, btb: 12, hesi: 16, stepback: 12, spin: 20, drive: 4 };
export function startMove(st, P, kind, side = 0) {
  if (P.act || P.z > 0 || P.moveCool > 0 || P.post) return false;
  if (!side) side = P.y < C.cy ? 1 : -1;
  P.act = { kind: "move", m: kind, f: 0, side, n: MOVE_LEN[kind] };
  P.moveCool = MOVE_LEN[kind] + 8; P.heat += 1; P.lastMove = st.frame;
  say(st, kind, P);
  return true;
}
export function moveStep(st, P) {
  const a = P.act, d = P.d, rx = rimOf(P), r = len(rx - P.x, C.cy - P.y) || 1, ux = (rx - P.x) / r, uy = (C.cy - P.y) / r;
  a.f++;
  const sp = P.spd;
  let vx = 0, vy = 0;
  if (a.m === "cross" || a.m === "btl" || a.m === "btb") { vy = a.side * sp * 0.62; vx = ux * sp * (a.m === "btb" ? 0.6 : 0.25); }
  else if (a.m === "hesi") { if (a.f > 10) { vx = ux * sp; vy = uy * sp; } }
  else if (a.m === "stepback") { if (a.f <= 9) { vx = -ux * 4.2; vy = -uy * 4.2; } }
  else if (a.m === "spin") { const k = a.f < 10 ? 1 : 0.6; vx = ux * sp * 0.75 * k; vy = (uy * 0.5 + a.side * 0.75) * sp * k; }
  P.vx = vx; P.vy = vy; P.face = d;
  moveClip(st, P);   // v5: a move never carries him over a line (a corner crossover went out 20 of 20 in v4)
  if (a.f === 6) {
    // the nearest defender in front: ankles, a poke, or nothing
    let D = null, dd = 1.9;
    for (const Q of st.p) { if (Q.t === P.t || Q.stumble > 0 || Q.z > 0) continue; const k = len(Q.x - P.x, Q.y - P.y); if (k < dd) { dd = k; D = Q; } }
    if (D) {
      const bonus = { cross: 0, btl: 0.03, btb: 0.04, hesi: 0.04, stepback: 0.07, spin: 0.06 }[a.m] || 0;
      const lean = D.vy * a.side < -0.5 ? 0.15 : 0;   // he was going the other way
      let p = clamp(0.008 + 0.3 * (P.S.handle - D.S.perD) + bonus * 0.5 + lean * 0.5 - 0.04 * Math.max(0, P.heat - 2), 0, 0.5) * (D.intense ? 0.7 : 1);
      if (human(st, P)) p += lv(st).ankle;
      const u = rnd(st);
      if (u < p) { D.stumble = u < p * 0.3 ? 80 : 45; D.act = null; D.vx = 0; D.vy = 0; say(st, "ankles", D, { by: P.g, fall: D.stumble > 50 }); }
      else {
        const lose = (Math.max(0, 0.035 * (P.heat - 2)) + 0.05 * (1 - P.S.handle) * (dd < 1 ? 1 : 0.4)) * (human(st, P) ? lv(st).lose : 1);
        if (rnd(st) < lose) { lostBall(st, P, D); return; }
      }
    }
  }
  if (a.f >= a.n) {
    P.act = null;
    if (a.m === "stepback") P.sb = 30;
    else P.burst = a.m === "drive" ? 36 : a.m === "hesi" ? 26 : 20;
  }
}
export function lostBall(st, P, D) {
  const b = st.ball;
  P.act = null; st.tov[P.t]++;
  Object.assign(b, { st: "loose", own: -1, f: 0, rim: false, fouled: null, x: P.x, y: P.y, z: 0.6, vx: (D.x - P.x) * 2 + (rnd(st) - 0.5) * 2, vy: (D.y - P.y) * 2 + (rnd(st) - 0.5) * 2, vz: 1.2 });
  st.lastTouch = P.t;
  say(st, "lostball", P, { by: D.g });
}
