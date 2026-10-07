// THE COURTS engine, ai/carrier.js: the CPU with the ball: shoot, drive, pass, move, call a pick.
// Split from the v4 sim.js unchanged (docs/design/BASKETBALL.md 4.2, stage S1a); pure: imports nothing
// from outside src/play/hoops/engine/.
import { callPick } from "./offence.js";
import { clamp, C, len, isThree, distRim } from "../court.js";
import { startMove } from "../moves.js";
import { passTo, laneClear } from "../pass.js";
import { goTo } from "../physics.js";
import { FORMATS } from "../rules/index.js";
import { contestOf, kindAt, shotProb, laneToRim, startShot } from "../shot.js";
import { rnd } from "../state.js";

// The CPU with the ball: drive, pull up, beat its man with a move, call a pick, kick it out to the
// open man or the cutter, throw the lob, beat the shot clock.
export function expect(st, P, x = P.x, y = P.y) {
  const d = P.d, r = len(d * C.rimX - x, C.cy - y), three = isThree(x, y, d), kind = kindAt(r);
  const { c } = contestOf(st, P, x, y);
  if (P.dunker && r < 2.9) return (c < 0.5 ? 0.9 : 0.7) * 2;
  return shotProb(st, P, { kind, r, grade: "SLIGHTLY LATE", c, three }) * (st.half ? (three ? 2 : 1) * 2 : three ? 3 : 2) * 1.05;
}
export function carrier(st, P) {
  const d = P.d, rx = d * C.rimX, r = len(rx - P.x, C.cy - P.y);
  P.hold++;
  let D = null, c = 1e9;
  for (const Q of st.p) if (Q.t !== P.t) { const k = len(Q.x - P.x, Q.y - P.y); if (k < c) { c = k; D = Q; } }
  const thinkNow = P.think-- <= 0;
  if (thinkNow && st.half && st.clear === P.t) {
    // the street: take it back past the arc first (or hit a man already out there)
    P.think = 6;
    const out = st.p.find(Q => Q.t === P.t && Q !== P && isThree(Q.x, Q.y, 1) && laneClear(st, P, Q));
    if (out && P.hold > 12 && rnd(st) < 0.35) { passTo(st, P, out, "chest"); return; }
    const k = (C.three + 1.1) / (r || 1);
    P.plan = { x: Math.max(0.8, rx + (P.x - rx) * k), y: C.cy + (P.y - C.cy) * k };
    P.sprint = false;
  } else if (thinkNow) {
    P.think = 5 + Math.round((1 - P.k) * 8);
    const urgent = st.shot < 120 || (FORMATS[st.cfg.fmt].periods && st.clock < 120 && st.clock > 0);
    if (P.dunker && r < 2.9 && (laneToRim(st, P) || rnd(st) < 0.3)) { startShot(st, P, true); return; }
    if (r < 1.7) { startShot(st, P); return; }
    const ep = expect(st, P);
    if (st.shot < 45) { startShot(st, P); return; }
    if (P.sb > 0) { startShot(st, P); return; }
    // the open man, the cutter, the roller: if the lane to him is clear
    if (P.hold > 14) {
      let best = null, bs = ep + 0.12, lob = false;
      for (const Q of st.p) {
        if (Q.t !== P.t || Q === P) continue;
        let qe = expect(st, Q);
        const qc = contestOf(st, Q).c;
        if (qc < 0.15) qe += 0.2;
        if (Q.cut || (st.pick && st.pick.s === Q.g && st.pick.ph === "roll")) qe += 0.08;
        if (qe > bs && laneClear(st, P, Q)) { bs = qe; best = Q; lob = Q.dunker && Boolean(Q.cut) && distRim(Q) < 5; }
      }
      const pressed = c < 0.8 || st.help >= 0;
      if (best && rnd(st) < (pressed ? 0.5 : 0.17) + (urgent ? 0.1 : 0)) { passTo(st, P, best, lob && rnd(st) < 0.5 ? "lob" : "chest"); return; }
    }
    // catch and shoot: open at the arc, let it go
    if (P.hold > 3 && P.hold < 30 && isThree(P.x, P.y, d) && r < 8.4 && contestOf(st, P).c < 0.3 && ep > 0.9 && rnd(st) < 0.3 + 0.5 * P.S.three) { startShot(st, P); return; }
    if (P.hold > 16 && (ep > 0.98 + 0.08 * (1 - P.k) || (urgent && ep > 0.55)) && rnd(st) < 0.4 + 0.35 * P.k) { startShot(st, P); return; }
    // beat the man in front with a move
    if (D && c < 1.4 && P.moveCool <= 0 && P.heat < 3 && rnd(st) < 0.01 + 0.025 * P.S.handle) {
      const side = (P.y - D.y) > 0 ? 1 : -1;
      const kinds = P.S.three > 0.6 && r > C.three && r < C.three + 1.5 ? ["stepback", "cross", "hesi"] : P.S.handle > 0.6 ? ["cross", "btl", "btb", "spin", "hesi"] : ["cross", "hesi"];
      if (startMove(st, P, kinds[Math.floor(rnd(st) * kinds.length)], side)) return;
    }
    // the pick and roll, now and then
    if (!st.pick && P.hold > 30 && r > 5 && rnd(st) < 0.05) callPick(st, P);
    // where to go: at the rim for a driver; to the arc for a shooter who isn't there yet; around a screen
    if (P.hold <= P.think + 8 || P.drive == null) P.drive = rnd(st) < (P.arch === "big" || P.arch === "slasher" ? 0.45 : 0.15);
    const go = P.drive || P.burst > 0 || (D && D.stumble > 0) || (D && D.screened > 0);
    const wantR = !go && r > C.three - 0.5 ? C.three + 0.4 : 0.8;
    let side = (P.y - C.cy) || (rnd(st) < 0.5 ? -0.5 : 0.5);
    if (D && c < 1.8) side += (P.y - D.y) * 1.5;
    if (st.pick && st.pick.h === P.g && st.pick.ph !== "go") side = -st.pick.side * 1.5;
    const ty = clamp(C.cy + clamp(side, -1, 1) * (r > 5 ? 3.2 : 1.2), 1, C.w - 1);
    P.plan = { x: rx - d * wantR, y: ty };
    P.sprint = st.transT > 0 && r > 9 && P.sta > 0.4;
  }
  if (P.act) return;
  if (st.pick && st.pick.h === P.g && st.pick.ph === "go") { P.vx = 0; P.vy = 0; return; }   // wait for the screen
  const pl = P.plan || { x: rx - d * 1, y: C.cy };
  goTo(P, clamp(pl.x, -C.hx + 0.6, C.hx - 0.6), clamp(pl.y, 0.6, C.w - 0.6), P.sprint ? 1 : 0.85);
}
