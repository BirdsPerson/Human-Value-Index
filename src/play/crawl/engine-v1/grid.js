// The tile grid as plain arrays (JSON-safe: never typed arrays, never -0), the walk tests, BFS with a
// fixed neighbour order, line of sight by fixed-step sampling (no trig), and axis-separated movement.

export const T = { WALL: 0, FLOOR: 1, DOOR: 2, LOCKED: 3, STAIRS: 4, LIFT: 5, HATCH: 6, CAB: 7 };
export const passable = (t) => t !== T.WALL && t !== T.LOCKED && t !== T.CAB;
export const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const N8 = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];

export function makeGrid(w, h) {
  const n = w * h, t = new Array(n), room = new Array(n);
  for (let i = 0; i < n; i++) { t[i] = T.WALL; room[i] = -1; }
  return { w, h, t, room };
}
export const idx = (g, x, y) => y * g.w + x;
export const inside = (g, x, y) => x >= 0 && y >= 0 && x < g.w && y < g.h;
export const tileAt = (g, x, y) => (inside(g, x, y) ? g.t[y * g.w + x] : T.WALL);
export const solidAt = (g, x, y) => !passable(tileAt(g, Math.floor(x), Math.floor(y)));

// Breadth-first distances from one tile (or several) over tiles `ok(t, i)` allows: a plain array, -1 unreachable.
export function bfs(g, from, ok = passable) {
  const n = g.w * g.h, d = new Array(n);
  for (let i = 0; i < n; i++) d[i] = -1;
  const q = [];
  for (const s of Array.isArray(from) ? from : [from]) if (s >= 0 && d[s] < 0) { d[s] = 0; q.push(s); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % g.w, y = (i - x) / g.w;
    for (let k = 0; k < 4; k++) {
      const nx = x + N4[k][0], ny = y + N4[k][1];
      if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
      const j = ny * g.w + nx;
      if (d[j] >= 0 || !ok(g.t[j], j)) continue;
      d[j] = d[i] + 1; q.push(j);
    }
  }
  return d;
}

// Line of sight between two points (tile units): no solid tile on the segment, sampled every 0.25 tile.
export function los(g, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy), n = Math.ceil(len / 0.25);
  for (let k = 1; k < n; k++) { const f = k / n; if (solidAt(g, x0 + dx * f, y0 + dy * f)) return false; }
  return true;
}

// Does a box of half-size r centred at (x, y) overlap a solid tile?
export function boxHits(g, x, y, r) {
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r - 1e-6), y0 = Math.floor(y - r), y1 = Math.floor(y + r - 1e-6);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (!passable(tileAt(g, tx, ty))) return true;
  return false;
}
// Move e by (dx, dy), x then y, stopping at walls. A move blocked at a corner, with the tile ahead on
// the mover's own row (or column) open, slides it toward that row's middle instead: doorways are one
// tile wide and nobody should have to line up to the pixel. -> true if it was blocked on either axis.
export function moveBox(g, e, dx, dy) {
  let hit = false;
  if (dx) {
    const nx = e.x + dx;
    if (!boxHits(g, nx, e.y, e.r)) e.x = nx;
    else {
      hit = true;
      const sx = dx > 0 ? Math.floor(e.x + e.r + dx) - e.r - 0.001 : Math.floor(e.x - e.r + dx) + 1 + e.r + 0.001;
      if ((dx > 0 ? sx > e.x : sx < e.x) && !boxHits(g, sx, e.y, e.r)) e.x = sx;
      else if (!dy) slide(g, e, Math.floor(e.x + (dx > 0 ? e.r + 0.5 : -e.r - 0.5)), Math.floor(e.y), dx < 0 ? -dx : dx, 1);
    }
  }
  if (dy) {
    const ny = e.y + dy;
    if (!boxHits(g, e.x, ny, e.r)) e.y = ny;
    else {
      hit = true;
      const sy = dy > 0 ? Math.floor(e.y + e.r + dy) - e.r - 0.001 : Math.floor(e.y - e.r + dy) + 1 + e.r + 0.001;
      if ((dy > 0 ? sy > e.y : sy < e.y) && !boxHits(g, e.x, sy, e.r)) e.y = sy;
      else if (!dx) slide(g, e, Math.floor(e.x), Math.floor(e.y + (dy > 0 ? e.r + 0.5 : -e.r - 0.5)), dy < 0 ? -dy : dy, 0);
    }
  }
  return hit;
}
// the corner slide: the tile ahead (tx, ty) open -> step across toward the middle of the mover's row/column
function slide(g, e, tx, ty, sp, alongY) {
  if (!passable(tileAt(g, tx, ty))) return;
  if (alongY) { const c = Math.floor(e.y) + 0.5, d = c - e.y; if (d > 1e-6 || d < -1e-6) { const s = d > 0 ? (d < sp ? d : sp) : (-d < sp ? d : -sp); if (!boxHits(g, e.x, e.y + s, e.r)) e.y += s; } }
  else { const c = Math.floor(e.x) + 0.5, d = c - e.x; if (d > 1e-6 || d < -1e-6) { const s = d > 0 ? (d < sp ? d : sp) : (-d < sp ? d : -sp); if (!boxHits(g, e.x + s, e.y, e.r)) e.x += s; } }
}
