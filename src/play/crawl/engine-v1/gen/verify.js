// The in-sim guarantees the checks also assert: the shortest arrival-to-descent route on the finished
// room graph (locked doors closed) and its length; every room tagged by its distance off that route.
import { T, bfs, passable } from "../grid.js";

export function routeOf(B, from, to) {
  const n = B.rooms.length, prev = new Array(n).fill(-1), seen = new Array(n).fill(false), q = [from]; seen[from] = true;
  for (let h = 0; h < q.length; h++) {
    const x = q[h]; if (x === to) break;
    for (const D of B.doors) { if (D.locked) continue; const y = D.a === x ? D.b : D.b === x ? D.a : -1; if (y >= 0 && !seen[y]) { seen[y] = true; prev[y] = x; q.push(y); } }
  }
  if (!seen[to]) return [];
  const path = []; for (let x = to; x >= 0; x = prev[x]) path.push(x);
  return path.reverse();
}
export function offRoute(B, route) {
  const d = new Array(B.rooms.length).fill(-1), q = [];
  for (const x of route) { d[x] = 0; q.push(x); }
  for (let h = 0; h < q.length; h++) { const x = q[h]; for (const D of B.doors) { const y = D.a === x ? D.b : D.b === x ? D.a : -1; if (y >= 0 && d[y] < 0) { d[y] = d[x] + 1; q.push(y); } } }
  return d;
}
// The floor's own check: the descent tile reachable on foot from the arrival with every locked door
// shut, and the route within the band's range. -> {ok, route, steps}
export function verifyFloor(fl) {
  const g = fl.g, d = bfs(g, fl.arrival.i, (t) => passable(t));
  const steps = d[fl.descent.i];
  const okRange = fl.routeLen >= fl.band.path[0] && fl.routeLen <= fl.band.path[1];
  return { ok: steps > 0 && okRange && g.t[fl.descent.i] === (fl.lift ? T.LIFT : T.STAIRS), steps, routeLen: fl.routeLen };
}
