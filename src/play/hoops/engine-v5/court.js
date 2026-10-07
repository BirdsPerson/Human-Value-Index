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

// ---- v5: the lines a man with the ball is held inside, the frontcourt, the lane ------------------------
// the frontcourt of team t (the half it attacks): always on a half court
export const inFront = (st, t, x, k = 0.15) => (st.half ? true : tdir(st, t) * x > k);
// the lane at the rim a side attacks (from the end line to the free-throw line)
export const inLaneOf = (x, y, d) => Math.abs(y - C.cy) < C.laneHW && d * x > C.hx - 5.79 && d * x <= C.hx;
// A throw-in spot from where the ball went out (or a violation happened inside): always behind a line.
// Over a sideline: there, 0.5 m out; over an end line: 0.5 m behind it, clear of the basket's support;
// inside the court (a violation): the nearer sideline, level with the spot.
export function outSpot(x, y) {
  const X = clamp(x, -C.hx + 1.0, C.hx - 1.0);
  if (y < 0) return [X, -0.5];
  if (y > C.w) return [X, C.w + 0.5];
  if (Math.abs(x) > C.hx) { const s = y < C.cy ? -1 : 1, dy = Math.abs(y - C.cy) < 2.6 ? 2.6 : Math.abs(y - C.cy); return [Math.sign(x) * (C.hx + 0.5), clamp(C.cy + s * dy, 0.6, C.w - 0.6)]; }
  return [clamp(x, -C.hx + 1.5, C.hx - 1.5), y < C.cy ? -0.5 : C.w + 0.5];
}
