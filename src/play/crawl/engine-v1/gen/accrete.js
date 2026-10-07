// Brogue's accretion: slide a room until it fits snugly (one wall between it and everything else),
// punch a door to the room it was slid against. Then loops by band, then lakes (none in band 1).
import { T, N4, N8 } from "../grid.js";
import { draw, drawInt, chance, shuffle } from "../rng.js";
import { hasCell } from "./rooms.js";
import { routeOf } from "./verify.js";

// B: the builder {g, rooms: [{id, kind, cells: [tile]}], doors: [{i, a, b}]}
export function place(B, r, m, target, kind, attempts = 40) {
  const { g } = B, W = g.w, H = g.h, tr = B.rooms[target];
  const sites = [];
  for (const c of tr.cells) {
    const cx = c % W, cy = (c - cx) / W;
    for (let d = 0; d < 4; d++) {
      const wx = cx + N4[d][0], wy = cy + N4[d][1], nx = wx + N4[d][0], ny = wy + N4[d][1];
      if (wx < 1 || wy < 1 || wx > W - 2 || wy > H - 2 || nx < 1 || ny < 1 || nx > W - 2 || ny > H - 2) continue;
      const wi = wy * W + wx, ni = ny * W + nx;
      if (g.t[wi] !== T.WALL || g.room[wi] >= 0 || g.room[ni] >= 0) continue;
      sites.push([wi, d, nx, ny]);
    }
  }
  if (!sites.length) return -1;
  for (let a = 0; a < attempts; a++) {
    const [wi, d, nx, ny] = sites[Math.floor(draw(r) * sites.length)];
    const ddx = N4[d][0], ddy = N4[d][1];
    const edge = m.cells.filter(([x, y]) => !hasCell(m, x - ddx, y - ddy));
    const [mx, my] = edge[Math.floor(draw(r) * edge.length)];
    const ox = nx - mx, oy = ny - my;
    let fits = true;
    for (const [x0, y0] of m.cells) {
      const x = x0 + ox, y = y0 + oy;
      if (x < 1 || y < 1 || x > W - 2 || y > H - 2) { fits = false; break; }
      for (let k = -1; k < 8 && fits; k++) {
        const qx = k < 0 ? x : x + N8[k][0], qy = k < 0 ? y : y + N8[k][1];
        const qi = qy * W + qx;
        if (g.room[qi] >= 0 || g.t[qi] !== T.WALL) fits = false;
      }
      if (!fits) break;
    }
    if (!fits) continue;
    const id = B.rooms.length, cells = [];
    for (const [x0, y0] of m.cells) { const i = (y0 + oy) * W + (x0 + ox); g.t[i] = T.FLOOR; g.room[i] = id; cells.push(i); }
    g.t[wi] = T.DOOR;
    B.doors.push({ i: wi, a: target, b: id });
    const feat = m.feature ? (m.feature[1] + oy) * W + (m.feature[0] + ox) : -1;
    B.rooms.push({ id, kind, cells, feat });
    return id;
  }
  return -1;
}

// Side rooms against any room, to the plan's count.
export function accreteSide(B, r, plan, mk) {
  let tries = 0;
  while (B.rooms.length < plan.rooms && tries < plan.rooms * 12) {
    tries++;
    const target = drawInt(r, 0, B.rooms.length - 1), kind = mk.kind(r);
    place(B, r, mk.make(kind, r), target, kind, 12);
  }
}

// Loops: a door between two rooms one wall apart that are far apart on the graph, with the band's
// probability, never shortening the route below the band's path minimum.
export function addLoops(B, r, plan, arrival, descent) {
  const { g } = B, W = g.w, H = g.h, pairs = new Map();
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (g.t[i] !== T.WALL) continue;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const a = g.room[i - dy * W - dx], b = g.room[i + dy * W + dx];
      if (a < 0 || b < 0 || a === b) continue;
      if (g.t[i - dx * W - dy] !== T.WALL || g.t[i + dx * W + dy] !== T.WALL) continue;   // the perpendicular neighbours are wall
      const key = a < b ? a * 64 + b : b * 64 + a;
      if (!pairs.has(key)) pairs.set(key, [i, a, b]);
    }
  }
  const list = shuffle(r, [...pairs.values()]);
  let added = 0;
  for (const [i, a, b] of list) {
    if (!chance(r, plan.band.loops)) continue;
    if (graphDist(B, a, b) < 3) continue;
    g.t[i] = T.DOOR; B.doors.push({ i, a, b, loop: true });
    if (routeOf(B, arrival, descent).length < plan.band.path[0]) { g.t[i] = T.WALL; B.doors.pop(); continue; }
    added++;
  }
  return added;
}

export function graphDist(B, a, b) {
  const d = new Array(B.rooms.length).fill(-1), q = [a]; d[a] = 0;
  for (let h = 0; h < q.length; h++) { const x = q[h]; if (x === b) return d[x]; for (const D of B.doors) { if (D.locked) continue; const y = D.a === x ? D.b : D.b === x ? D.a : -1; if (y >= 0 && d[y] < 0) { d[y] = d[x] + 1; q.push(y); } } }
  return d[b] < 0 ? 999 : d[b];
}

// Lakes: water blobs placed only where the rest stays connected. Band 1 has none (water: 0); D2.
export function addLakes() { return 0; }
