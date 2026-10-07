// THE COURTS engine, ai/rebound.js: the glass: box out, crash, get back.
// Split from the v4 sim.js unchanged (docs/design/BASKETBALL.md 4.2, stage S1a); pure: imports nothing
// from outside src/play/hoops/engine/.
import { markSpot } from "./defence.js";
import { spotOf } from "./offence.js";
import { C, len, rimOf } from "../court.js";
import { goTo, hop } from "../physics.js";

// Crash the glass: while the shot is up, the defence boxes out its men; the two nearest the ball on
// each side go for it, a big crashes, the rest get back or space out.
export function rebound(st, P) {
  const b = st.ball, sh = b.st === "shot";
  const bx = sh ? b.x + (st.p[b.from].d * C.rimX - b.x) * 0.8 : b.x, by = sh ? b.y + (C.cy - b.y) * 0.8 : b.y;
  if (sh && st.poss !== P.t && b.f < b.T - 3) {
    const M = st.p[st.mark[P.g]], rx = rimOf(M), r = len(rx - M.x, C.cy - M.y) || 1;
    if (r < 7) { goTo(P, M.x + ((rx - M.x) / r) * 0.55, M.y + ((C.cy - M.y) / r) * 0.55); P.boxing = 30; return; }
  }
  const mine = st.p.filter(Q => Q.t === P.t).map(Q => [len(Q.x - bx, Q.y - by) - (Q.arch === "big" ? 1 : 0), Q.g]).sort((a, c) => a[0] - c[0] || a[1] - c[1]);
  const rank = mine.findIndex(([, g]) => g === P.g);
  if (rank < 2 && (st.poss !== P.t || rank === 0 || P.arch === "big")) {
    goTo(P, bx, by);
    if (b.st === "loose" && b.vz < 0 && b.z > 2.0 && b.z < 3.4 && len(b.x - P.x, b.y - P.y) < 1.2) hop(P);
    return;
  }
  if (st.poss === P.t) { const [sx, sy] = spotOf(st, P.t, P.i); goTo(P, sx, sy, 0.7); } else { const [tx, ty] = markSpot(st, P); goTo(P, tx, ty, 0.8); }
}
