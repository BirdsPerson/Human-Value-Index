// Per-entity state machines over per-seat flow fields that live IN the state (st.flow[seat]: a BFS
// distance grid from each player, rebuilt every 10 frames or when a door opens or a cabinet breaks),
// so a snapshot taken at any frame re-plays identically.
import { bfs, los, moveBox, N8, passable } from "../grid.js";

export const FLOW_EVERY = 10;
export function rebuildFlow(st) {
  const g = st.fl.g;
  st.flow = st.seats.map(s => {
    const P = st.ents.find(e => e.id === s.ent);
    if (!P || P.dead) return null;
    return bfs(g, Math.floor(P.y) * g.w + Math.floor(P.x));
  });
  st.flowDirty = false;
}
// the nearest living player -> [P, dist] (seat order breaks ties)
export function nearestPlayer(st, e) {
  let best = null, bd = 1e9;
  for (const P of st.ents) { if (P.k !== "player" || P.dead) continue; const dx = P.x - e.x, dy = P.y - e.y, d = Math.sqrt(dx * dx + dy * dy); if (d < bd) { bd = d; best = P; } }
  return [best, bd];
}
// Aggro, checked every 6 frames per entity (staggered by id): in sight within its range wakes it;
// out of sight 3 s, or 14 tiles from home (the leash), sends it home.
export function senses(st, e, sight) {
  const [P, d] = nearestPlayer(st, e);
  if (!P) { e.s = "idle"; return null; }
  if ((st.frame + e.id) % 6 === 0) {
    const see = d <= (e.s === "chase" ? 14 : sight) && los(st.fl.g, e.x, e.y, P.x, P.y);   // once chasing, it keeps you in sight to the leash
    if (see) { e.seen = 0; if (e.s === "idle" || e.s === "home") { e.s = "chase"; st.ev.push({ t: "alert", x: e.x, y: e.y, what: e.m }); } }
    else e.seen += 6;
    const hx = e.x - e.hx, hy = e.y - e.hy;
    if (e.s === "chase" && (e.seen > 180 || hx * hx + hy * hy > 196)) e.s = "home";
  }
  e.tgt = P.seat;
  return [P, d];
}
// One step along the target seat's flow field (or straight at the player when close and in sight).
export function stepToward(st, e, P, d, speed) {
  const g = st.fl.g;
  if (d < e.r + P.r + 0.05) return true;   // at contact: never stand inside the player
  let tx = P.x, ty = P.y;
  if (!(d < 2.5 && los(g, e.x, e.y, P.x, P.y))) {
    const F = st.flow[P.seat];
    if (F) {
      const x = Math.floor(e.x), y = Math.floor(e.y), i = y * g.w + x;
      let best = -1, bv = F[i] >= 0 ? F[i] : 1e9;
      for (let k = 0; k < 8; k++) {
        const nx = x + N8[k][0], ny = y + N8[k][1], j = ny * g.w + nx;
        if (F[j] < 0 || F[j] >= bv) continue;
        if (k >= 4 && (!passable(g.t[y * g.w + nx]) || !passable(g.t[ny * g.w + x]))) continue;
        best = j; bv = F[j];
      }
      if (best >= 0) { tx = (best % g.w) + 0.5; ty = Math.floor(best / g.w) + 0.5; }
    }
  }
  return moveTo(g, e, tx, ty, speed);
}
export function moveTo(g, e, tx, ty, speed) {
  const dx = tx - e.x, dy = ty - e.y, n = Math.sqrt(dx * dx + dy * dy);
  if (n < 1e-6) return true;
  const s = speed < n ? speed : n;
  e.fx = dx / n; e.fy = dy / n;
  return !moveBox(g, e, e.fx * s, e.fy * s);
}
// Home: back along the straight line if it can, else wait (it is woken again by sight)
export function goHome(st, e, speed) {
  const dx = e.hx - e.x, dy = e.hy - e.y;
  if (dx * dx + dy * dy < 0.04) { e.s = "idle"; return; }
  if (!moveTo(st.fl.g, e, e.hx, e.hy, speed)) e.s = "idle";
}
