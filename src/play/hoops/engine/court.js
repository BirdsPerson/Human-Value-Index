// THE COURTS engine, court.js: the floor: the clock rate, the lines, the rims, the three-point test, in bounds.
// Split from the v4 sim.js unchanged (docs/design/BASKETBALL.md 4.2, stage S1a); pure: imports nothing
// from outside src/play/hoops/engine/.

export const HZ = 60;
export const DT = 1 / HZ, G = 9.8;
export const COURT = { hx: 14.325, w: 15.24, cy: 7.62, rimX: 12.75, rimZ: 3.05, rimR: 0.23, boardX: 13.125, three: 7.24, corner: 6.71, cornerX: 10.055, laneHW: 2.44, ftX: 8.535, circle: 1.8, ra: 1.22 };
// the check: the top of the key, past the arc
export const TOP_SPOT = [COURT.rimX - 8.3, COURT.cy];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const C = COURT;
export const dirOf = (t) => (t === 0 ? 1 : -1);

export const len = (x, y) => Math.sqrt(x * x + y * y);
// A three from (x, y) at the basket team-direction d attacks: past the arc, or in a corner past
// the straight line 6.71 m from the basket.
export function isThree(x, y, d) {
  const dx = d * C.rimX - x, dy = C.cy - y;
  if (d * x > C.cornerX) return Math.abs(dy) > C.corner;
  return len(dx, dy) > C.three;
}

// the rim a player's side attacks (both sides attack +x on a half court), and his distance from it
export const rimOf = (P) => P.d * C.rimX;
export const distRim = (P, Ref = P) => len(rimOf(Ref) - P.x, C.cy - P.y);
export const tdir = (st, t) => (st.half ? 1 : dirOf(t));
// ---- the rules ------------------------------------------------------------------------------------
export const inBounds = (st, x, y) => (st.half ? x >= 0 && x <= C.hx : Math.abs(x) <= C.hx) && y >= 0 && y <= C.w;
