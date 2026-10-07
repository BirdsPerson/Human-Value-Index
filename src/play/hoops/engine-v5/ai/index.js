// THE COURTS engine, ai/index.js: the CPU's think, per player per frame.
// Split from the v4 sim.js unchanged (docs/design/BASKETBALL.md 4.2, stage S1a); pure: imports nothing
// from outside src/play/hoops/engine/.
import { carrier } from "./carrier.js";
import { onDefence } from "./defence.js";
import { offBall, runOnto, throwInMove } from "./offence.js";
import { rebound } from "./rebound.js";
import { goTo, hop } from "../physics.js";

export function cpuThink(st, P) {
  const b = st.ball;
  P.vx = 0; P.vy = 0; P.sprint = false; P.intense = false;
  if (P.stumble > 0) return;
  if (P.act && P.act.kind !== "follow") return;
  if (st.phase === "dead" || st.phase === "ft") { const r = st.reset?.[P.g]; if (r) goTo(P, r[0], r[1], 0.85); return; }
  if (st.phase === "tip") return;
  if (st.phase === "throwin") { if (!throwInMove(st, P)) onDefence(st, P); return; }
  if (P.jumpAt >= 0 && st.frame >= P.jumpAt) { P.jumpAt = -1; hop(P); return; }
  if (b.st === "held" && b.own === P.g) { carrier(st, P); return; }
  const off = st.poss === P.t;
  if (b.st === "pass" && b.to === P.g) { runOnto(st, P); return; }
  if (b.st === "loose" || (b.st === "shot" && b.kind !== "dunk")) { rebound(st, P); return; }
  if (off) offBall(st, P);
  else onDefence(st, P);
}
