// THE COURTS engine, ai/defence.js: the CPU on defence: the mark, help, the closeout, reach-ins.
// Split from the v4 sim.js unchanged (docs/design/BASKETBALL.md 4.2, stage S1a); pure: imports nothing
// from outside src/play/hoops/engine/.
import { C, len, rimOf, distRim, inFront } from "../court.js";
import { goTo } from "../physics.js";
import { giveBall, foulCall, pressing, PICK_UP } from "../rules/index.js";
import { rnd, lv, you, holder, say, markerOf } from "../state.js";

export function stealTry(st, P) {
  const H = holder(st);
  P.cool = 50;
  const b = st.ball;
  if (!H || H.t === P.t || H.act?.kind === "dunk" || len(b.x - P.x, b.y - P.y) > 0.95) { say(st, "reach", P); return; }
  // behind or beside the dribbler is a reach-in more often than a steal
  const hv = len(H.vx, H.vy), behind = hv > 0.5 && ((P.x - H.x) * H.vx + (P.y - H.y) * H.vy) / hv < -0.2;
  let p = 0.07 + 0.16 * P.S.steal - 0.09 * H.S.handle + (P.intense ? 0.03 : 0) + (H.act?.kind === "move" ? 0.03 : 0);
  if (you(st, P.t)) p += lv(st).steal;
  else if (you(st, H.t)) p *= lv(st).cpuSteal;
  const u = rnd(st);
  if (u < p) { const from = H; H.act = null; P.cool = 0; st.tov[from.t]++; giveBall(st, P); say(st, "steal", P, { victim: from.g }); return; }
  const pf = (0.05 + 0.14 * (1 - P.S.steal) + (behind ? 0.12 : 0)) * (you(st, P.t) ? lv(st).foul : 1);
  if (u < p + pf * (1 - p)) { foulCall(st, P, H, "reach"); return; }
  say(st, "reach", P);
}

// The defender's place: between his man and the basket, closer to the man with the ball, sagging
// into the lane off a man far from it. v5, the pick-up point (no press unless his coach calls it):
// the man on the ball is picked up about a metre outside the arc (PICK_UP); above it his defender
// shadows him 1-3.5 m off and never further out than half court; the others wait inside the pick-up
// line, goal-side. v4 put every defender a metre or two goal-side of his man anywhere on the floor:
// a permanent full-court press.
export function markSpot(st, P) {
  const M = st.p[st.mark[P.g]], b = st.ball, rx = M.d * C.rimX;
  const hasBall = b.st === "held" && b.own === M.g, press = pressing(st, P.t);
  const far = len(M.x - b.x, M.y - b.y);
  const r = len(rx - M.x, C.cy - M.y) || 1;
  let gap = hasBall ? 1.0 : 1.6;
  if (hasBall && !press && r > PICK_UP + 1.2) gap = Math.min(1.0 + (r - PICK_UP - 1.2), 3.5);
  gap = Math.min(gap, r * 0.6);
  let tx = M.x + ((rx - M.x) / r) * gap, ty = M.y + ((C.cy - M.y) / r) * gap;
  if (!hasBall && far > 6) { tx += (rx - M.d * 3 - tx) * 0.35; ty += (C.cy - ty) * 0.35; }
  if (!press && !st.half) {
    const tr = len(rx - tx, C.cy - ty), cap = PICK_UP + (hasBall ? 4.5 : 1.5);
    if (tr > cap) { const q = cap / tr; tx = rx + (tx - rx) * q; ty = C.cy + (ty - C.cy) * q; }
  }
  return [tx, ty];
}
// is the man with the ball picked up (inside the pick-up line, or his side is pressed)?
export const pickedUp = (st, D, H) => pressing(st, D.t) || st.half || distRim(H) < PICK_UP + 1;
// Help: the ball is going to the rim past its man; the defender whose own man matters least steps in.
export function helpStep(st) {
  st.help = -1;
  const H = holder(st);
  if (!H || st.phase !== "live") return;
  const r = distRim(H);
  if (r > 6) return;
  const D = markerOf(st, H);
  const beaten = !D || D.stumble > 0 || D.screened > 0 || distRim(D, H) > r + 0.3;
  if (!beaten) return;
  const rx = rimOf(H), px = H.x + (rx - H.x) * 0.35, py = H.y + (C.cy - H.y) * 0.35;
  let best = null, bs = 1e9;
  for (const Q of st.p) {
    if (Q.t === H.t || Q === D || Q.stumble > 0) continue;
    const M = st.p[st.mark[Q.g]], s = len(Q.x - px, Q.y - py) - 0.4 * len(M.x - H.x, M.y - H.y) * 0.3 - (Q.arch === "big" ? 1.2 : 0);
    if (s < bs) { bs = s; best = Q; }
  }
  if (best) { st.help = best.g; st.helpAt = [px, py]; }
}

export function onDefence(st, P) {
  const H = holder(st), M = st.p[st.mark[P.g]];
  // a help man in the path of a hard drive plants his feet for the charge, now and then
  if (P.charge > 0) { P.vx = 0; P.vy = 0; return; }
  if (H && H.t !== P.t && st.help === P.g && len(H.vx, H.vy) > 4 && len(H.x - P.x, H.y - P.y) < 2.2 && distRim(P, H) > C.ra + 0.2 && rnd(st) < 0.03 * (0.5 + P.S.intD)) { P.charge = 30; P.still = 12; return; }
  if (st.help === P.g && st.helpAt) { const k = H && you(st, H.t) ? lv(st).help : 1; goTo(P, st.helpAt[0], st.helpAt[1], k); P.sprint = k >= 1; P.hands = 10; return; }
  // v5, no press: a defender caught near the ball in the handler's backcourt (a crasher after the board,
  // a man running back past him) gets out of the way, back toward his own basket
  if (H && H.t !== P.t && st.phase === "live" && !st.half && !pressing(st, P.t) && !inFront(st, H.t, H.x, -1) && len(H.x - P.x, H.y - P.y) < 2.5) {
    const rx = M.d * C.rimX; P.sprint = P.sta > 0.2; goTo(P, rx - M.d * PICK_UP, P.y + (P.y - H.y) * 0.5);
    return;
  }
  let [tx, ty] = markSpot(st, P);
  if (P.close > 0 && H === M && pickedUp(st, P, H)) {
    // the closeout: sprint at the catch, stop short with a hand up
    const dd = len(M.x - P.x, M.y - P.y);
    if (dd > 1.0) { P.sprint = true; } else P.hands = 20;
  }
  const back = st.transT > 0 && len(tx - P.x, ty - P.y) > 4;
  if (back) P.sprint = P.sta > 0.2;
  goTo(P, tx, ty);
  if (H === M && len(H.x - P.x, H.y - P.y) < 1.4 && pickedUp(st, P, H)) { P.intense = P.sta > 0.35; P.hands = Math.max(P.hands, 2); }
  if (H && H.t !== P.t && P.cool <= 0 && st.phase === "live" && len(H.x - P.x, H.y - P.y) < 1.15) {
    let p = 0.001 * (0.3 + P.S.steal);
    if (you(st, H.t)) p *= lv(st).cpuSteal;
    if (rnd(st) < p) stealTry(st, P);
  }
}
