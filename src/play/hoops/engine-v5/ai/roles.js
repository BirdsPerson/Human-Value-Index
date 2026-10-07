// THE COURTS engine, ai/roles.js (v5): who brings the ball up, who throws it in, where each man spaces.
// Pure: imports nothing from outside src/play/hoops/engine/ (docs/design/BASKETBALL.md 4.5).
//   BH1   the highest 0.6 handle + 0.4 pass + a position bonus (PG +8, SG +4) across all five: the ball
//         handler, never the centre by default; BH2 the next
//   INB   the inbounder after a make: a big who is not a handler, else the lowest handle
//   slot  the spot each man fills in the half court: BH1 the top, BH2 a wing, a big the block
const POS_BONUS = { PG: 8, SG: 4 };
export const handleScore = (P) => 0.6 * P.R.handle + 0.4 * P.R.pass + (POS_BONUS[P.pos] || 0);
export const isBig = (P) => P.pos === "C" || P.pos === "PF" || P.arch === "big";
export function assignRoles(st) {
  st.roles = [0, 1].map(t => {
    const team = st.p.filter(P => P.t === t), by = [...team].sort((a, b) => handleScore(b) - handleScore(a) || a.i - b.i);
    const bh1 = by[0].g, bh2 = (by[1] || by[0]).g;
    const rest = team.filter(P => P.g !== bh1 && P.g !== bh2);
    const bigs = rest.filter(isBig).sort((a, b) => b.h - a.h || a.i - b.i);
    const inb = (bigs[0] || [...rest].sort((a, b) => a.R.handle - b.R.handle || a.i - b.i)[0] || by[by.length - 1]).g;
    // the half-court slots: the top, a wing, then the rest in roster order; the tallest non-handler
    // big (when the five has one) takes the inside spot (the last)
    const big = team.length >= 3 ? rest.filter(P => P.arch === "big" || P.pos === "C").sort((a, b) => b.h - a.h || a.i - b.i)[0] : null;
    const order = [bh1, ...(team.length > 1 ? [bh2] : []), ...rest.filter(P => P !== big).map(P => P.g), ...(big ? [big.g] : [])];
    return { bh1, bh2, inb, big: big ? big.g : -1, order };
  });
  st.slot = new Array(st.p.length).fill(0);
  for (const R of st.roles) R.order.forEach((g, k) => { st.slot[g] = k; });
}
export const isHandler = (st, P) => st.roles[P.t].bh1 === P.g || st.roles[P.t].bh2 === P.g;
