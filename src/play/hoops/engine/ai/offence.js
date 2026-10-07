// THE COURTS engine, ai/offence.js: the CPU off the ball: spots, cuts, the pick and roll, screens.
// Split from the v4 sim.js unchanged (docs/design/BASKETBALL.md 4.2, stage S1a); pure: imports nothing
// from outside src/play/hoops/engine/.
import { HZ, clamp, C, len, rimOf, distRim, tdir } from "../court.js";
import { goTo } from "../physics.js";
import { rnd, gauss, lv, you, human, holder, say, markerOf, teamOf } from "../state.js";

// The offence's spots, by the five: five out, or four out and one in when the five has a big.
export const FIVE_OUT = [[7.6, 0], [6.0, 4.9], [6.0, -4.9], [1.0, 6.95], [1.0, -6.95]];
export const FOUR_IN = [[7.6, 0], [6.0, 4.9], [6.0, -4.9], [1.0, -6.95], [1.6, 2.3]];
// three a side: the top and both wings, or the top, a wing and a big on the block; one a side: the top
export const THREE_OUT = [[7.6, 0], [5.6, 5.4], [5.6, -5.4]], TWO_IN = [[7.6, 0], [5.8, -5.4], [1.6, 2.3]];
export function spotOf(st, t, i) {
  const team = teamOf(st, t), big = team.find(P => P.arch === "big" && P.i !== 0);
  const [OUT, IN] = st.n >= 5 ? [FIVE_OUT, FOUR_IN] : [THREE_OUT, TWO_IN];
  const s = st.n === 1 ? OUT[0] : big ? (big.i === i ? IN[IN.length - 1] : IN[team.filter(P => P !== big).indexOf(team[i])]) : OUT[i];
  const d = tdir(st, t);
  return [d * (C.rimX - s[0]), C.cy + s[1]];
}
// ---- screens ----------------------------------------------------------------------------------------
// The ball handler calls for a pick: a teammate (the big when there is one) sets it on the side of
// his man the drive will go, holds it, then rolls to the rim (or pops to the arc, a shooter).
export function callPick(st, H) {
  if (st.pick || !holder(st) || holder(st) !== H) return;
  const D = markerOf(st, H);
  if (!D) return;
  let best = null, bs = 1e9;
  for (const Q of st.p) { if (Q.t !== H.t || Q === H) continue; const s = len(Q.x - H.x, Q.y - H.y) - (Q.arch === "big" ? 4 : 0); if (s < bs) { bs = s; best = Q; } }
  if (!best) return;
  st.pick = { s: best.g, h: H.g, d: D.g, ph: "go", t: 0, side: H.y < C.cy ? 1 : -1, x: best.x, y: best.y };
  say(st, "pick", best);
}
export function pickStep(st) {
  const K = st.pick;
  if (!K) return;
  const S = st.p[K.s], H = st.p[K.h], D = st.p[K.d];
  if (st.phase !== "live" || holder(st) !== H) { if (K.ph !== "roll") { K.ph = "roll"; K.t = 0; } }
  K.t++;
  if (K.ph === "go") {
    const rx = rimOf(H), r = len(rx - D.x, C.cy - D.y) || 1;
    K.x = D.x + ((rx - D.x) / r) * 0.15; K.y = D.y + K.side * 0.6;
    if (len(S.x - K.x, S.y - K.y) < 0.35 || K.t > 110) { K.ph = "set"; K.t = 0; K.x = S.x; K.y = S.y; }
  } else if (K.ph === "set") {
    if (K.t > 55 || (holder(st) === H && len(H.x - S.x, H.y - S.y) > 2.6 && K.t > 20)) { K.ph = "roll"; K.t = 0; }
  } else if (K.ph === "roll" && K.t > 80) st.pick = null;
}
// A defender running into a set screen is hung up, unless the defence switches it.
export function screens(st) {
  const K = st.pick;
  if (!K || K.ph !== "set") return;
  const S = st.p[K.s];
  for (const D of st.p) {
    if (D.t === S.t || D.screened > 0 || D.z > 0) continue;
    if (len(D.x - S.x, D.y - S.y) < 0.62 && (D.vx || D.vy)) {
      D.screened = 22;
      say(st, "screened", D, { by: S.g });
      // the switch: the screener's man takes the ball when both can guard it
      const SD = markerOf(st, S), H = st.p[K.h];
      if (SD && st.mark[D.g] === H.g && SD !== D && !human(st, SD) && rnd(st) < 0.15 + 0.6 * Math.min(SD.S.perD, D.S.perD)) {
        st.mark[SD.g] = H.g; st.mark[D.g] = S.g; say(st, "switch", SD);
      }
    }
  }
}

// The receiver of a pass keeps running onto it: to the point it was thrown to, at the pace he had
// (a cutter at his cut's pace), arriving as it does; a pass thrown at a standing man, he steps to it.
export function runOnto(st, P) {
  const b = st.ball;
  if (b.alley && P.cut) { goTo(P, P.cut.x, P.cut.y); P.sprint = true; return; }
  const left = Math.max(1, b.T - b.f), d = len(b.tx - P.x, b.ty - P.y), need = (d / left) * HZ;
  if (b.rv > 0.6 || d > 0.3) { P.sprint = need > P.spd; goTo(P, b.tx, b.ty, clamp(need / P.spd, 0.35, 1)); }
  else goTo(P, b.x, b.y, 0.4);
}
export function offBall(st, P) {
  const K = st.pick, d = P.d, rx = rimOf(P);
  if (K && K.s === P.g) {
    if (K.ph === "go") { goTo(P, K.x, K.y); P.sprint = true; return; }
    if (K.ph === "set") return;
    if (K.ph === "roll") {
      if (P.S.three > 0.6 && P.arch !== "big") { const [sx, sy] = spotOf(st, P.t, P.i); goTo(P, sx, sy); }
      else goTo(P, rx - d * 1.3, C.cy + (P.y > C.cy ? 0.6 : -0.6));
      return;
    }
  }
  if (P.cut && st.frame < P.cut.until) { goTo(P, P.cut.x, P.cut.y); if (len(P.x - P.cut.x, P.y - P.cut.y) < 0.4 && st.frame > P.cut.until - 20) P.cut = null; return; }
  P.cut = null;
  // a backdoor cut when his man is far off him (helping, ball-watching, beaten)
  const M = markerOf(st, P), think = (st.frame + P.g * 7) % 30 === 0;
  if (think && M && st.transT <= 0) {
    const gap = len(M.x - P.x, M.y - P.y), lane = st.p.filter(Q => Q.t !== P.t && distRim(Q, P) < 2.2).length;
    const want = (gap > 2.4 ? 0.12 : 0.015) + (you(st, P.t) ? lv(st).cut : 0);
    if (lane < 2 && distRim(P) > 3 && rnd(st) < want) { P.cut = { x: rx - d * 1.1, y: C.cy + (P.y > C.cy ? 0.9 : -0.9), until: st.frame + 60 }; say(st, "cut", P); return; }
  }
  // spacing: the spot, a little drift so it never stands like a statue; sprint in transition
  if (--P.jt <= 0) { P.jt = 80 + Math.floor(rnd(st) * 80); P.jx = gauss(st) * 0.5; P.jy = gauss(st) * 0.5; }
  const [sx, sy] = spotOf(st, P.t, P.i);
  const far = len(sx - P.x, sy - P.y) > 6;
  P.sprint = far && P.sta > 0.3;
  goTo(P, sx + P.jx, sy + P.jy, far ? 1 : 0.75);
}
