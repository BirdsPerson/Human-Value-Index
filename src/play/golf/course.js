// THE DEPARTMENT LINKS: the eighteen holes of APPLICATION 001, the course THE ASSEMBLY declined
// to build on LOT 0x6F07 (session 001 voted for the farm). civicGeo.js GOLF still holds the
// routing it would have had: six by three, serpentine, each a tee, a green and its flag, the four
// bunkers, the pond. Each hole here is that routing played out at full size, seeded and fixed:
// the same par, yardage, dogleg, hazards and green for every viewer, every round, forever.
// Pure (no DOM): the sim, the renderer and scripts/check-golf.mjs all read it.
//
// Hole coordinates are yards. The tee is at (0, 0); +y runs up the hole toward the green; +x is
// to the golfer's right. The renderer flips y.

import { GOLF } from "../../city/civicGeo.js";
import { FAMOUS } from "./holes/famous.js";

export const COURSE_SEED = 0x6f07;

export function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
// mulberry32 as a pure step: (state) -> [value in 0..1, next state]. The sim keeps the state.
export function rngStep(s) {
  const n = (s + 0x6d2b79f5) >>> 0;
  let t = n;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, n];
}
// A closure RNG for building the course (never inside the sim's turn loop).
export function rngOf(seed) {
  let s = seed >>> 0;
  return () => { const [v, n] = rngStep(s); s = n; return v; };
}
const r2 = (v) => Math.round(v * 100) / 100;

// The par card: four threes, four fives, ten fours, no two threes back to back, shuffled once
// from the course seed. Front nine and back nine each par 36.
function parCard(rand) {
  for (;;) {
    const nine = () => { const a = [3, 3, 5, 5, 4, 4, 4, 4, 4]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const card = [...nine(), ...nine()];
    if (card[0] === 3) continue;
    if (card.some((p, i) => i && p === 3 && card[i - 1] === 3)) continue;
    return card;
  }
}

// Distance from a point to the centre line: -> {d, along (yards from the tee along the line)}
export function lineDist(pts, x, y) {
  let best = Infinity, along = 0, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy, L = Math.sqrt(L2);
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2));
    const d = Math.hypot(x - (ax + t * vx), y - (ay + t * vy));
    if (d < best) { best = d; along = acc + t * L; }
    acc += L;
  }
  return { d: best, along };
}
export const lineLength = (pts) => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
// The point `dist` yards along the centre line.
export function pointAlong(pts, dist) {
  let left = dist;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], L = Math.hypot(bx - ax, by - ay);
    if (left <= L) return [ax + (bx - ax) * left / L, ay + (by - ay) * left / L];
    left -= L;
  }
  return pts[pts.length - 1].slice();
}

function buildHole(n, par, rand) {
  const city = GOLF.holes[n - 1];
  const row = Math.floor((n - 1) / 6);
  // The serpentine routing runs east on rows 0 and 2, west on row 1: the dogleg bends with it.
  const bend = (row % 2 ? -1 : 1) * (rand() < 0.3 ? -1 : 1);
  const len = par === 3 ? 135 + Math.round(rand() * 70) : par === 4 ? 345 + Math.round(rand() * 95) : 480 + Math.round(rand() * 70);
  const gr = par === 3 ? 10 + rand() * 3 : 12 + rand() * 4;
  let pts;
  if (par === 3) pts = [[0, 0], [r2(bend * rand() * 12), len]];
  else if (par === 4) {
    const cy = len * (0.55 + rand() * 0.12), dx = bend * (8 + rand() * 30);
    pts = [[0, 0], [r2(dx * 0.15), r2(cy)], [r2(dx), len]];
  } else {
    const dx1 = bend * (10 + rand() * 25), dx2 = -bend * (rand() * 30);
    pts = [[0, 0], [r2(dx1 * 0.3), r2(len * 0.42)], [r2(dx1), r2(len * 0.74)], [r2(dx1 + dx2), len]];
  }
  const green = { x: pts[pts.length - 1][0], y: pts[pts.length - 1][1], r: r2(gr) };
  const pa = rand() * Math.PI * 2, pr = rand() * gr * 0.6;
  const pin = { x: r2(green.x + Math.cos(pa) * pr), y: r2(green.y + Math.sin(pa) * pr) };
  // The green's lie: a base fall plus a gentle roll across it, so the arrows differ cell by cell.
  const sa = rand() * Math.PI * 2, sm = 0.12 + rand() * 0.38;
  const slope = { bx: r2(Math.cos(sa) * sm), by: r2(Math.sin(sa) * sm), w: r2(0.08 + rand() * 0.18), k: r2(0.15 + rand() * 0.2), ph: r2(rand() * 6.28) };
  const fwHalf = par === 3 ? 0 : r2(14 + rand() * 7);
  const fwStart = par === 3 ? Infinity : Math.round(95 + rand() * 60);
  const corridor = r2(par === 3 ? 38 + rand() * 10 : 48 + rand() * 14);
  const yards = Math.round(lineLength(pts));
  const bunkers = [], water = [], trees = [];
  // The city's own bunkers and pond: a hole whose green sat near one in civicGeo gets it here.
  const near = (p, k) => Math.hypot(p[0] - city.green[0], p[1] - city.green[1]) < k;
  const cityBunker = GOLF.bunkers.some(b => near(b, 2.4));
  const cityPond = near(GOLF.pond, 2.2);
  // greenside bunkers: one to three, never dead in front of the green
  const nb = 1 + Math.floor(rand() * 2) + (cityBunker ? 1 : 0);
  const app = Math.atan2(green.y - pts[pts.length - 2][1], green.x - pts[pts.length - 2][0]);
  for (let i = 0; i < nb; i++) {
    const a = app + Math.PI + (i % 2 ? 1 : -1) * (0.9 + rand() * 1.4);
    const br = 4 + rand() * 3, d = gr + br + 1.5;
    bunkers.push({ x: r2(green.x - Math.cos(a) * d), y: r2(green.y - Math.sin(a) * d), r: r2(br) });
  }
  // fairway bunkers in the drive zone
  if (par > 3) {
    const nf = Math.floor(rand() * 3);
    for (let i = 0; i < nf; i++) {
      const [x, y] = pointAlong(pts, 215 + rand() * 50);
      const side = rand() < 0.5 ? -1 : 1;
      bunkers.push({ x: r2(x + side * (fwHalf + 2 + rand() * 4)), y: r2(y), r: r2(5 + rand() * 3) });
    }
  }
  // water: the city's pond, or a seeded one
  if (cityPond || rand() < 0.28) {
    if (par === 3) {
      const cx = green.x + (rand() - 0.5) * 10, cy = green.y - gr - 16;
      for (let i = 0; i < 3; i++) water.push({ x: r2(cx + (i - 1) * 13), y: r2(cy + (rand() - 0.5) * 4), r: r2(9 + rand() * 3) });
    } else {
      const [x, y] = pointAlong(pts, yards * (0.45 + rand() * 0.2));
      const side = rand() < 0.5 ? -1 : 1;
      for (let i = 0; i < 3; i++) water.push({ x: r2(x + side * (fwHalf + 12 + i * 4)), y: r2(y + (i - 1) * 12), r: r2(9 + rand() * 4) });
    }
  }
  // trees: lines along both edges of the corridor, a few in the dogleg's corner
  for (let s = 20; s < yards + 10; s += 16 + rand() * 12) {
    const [x, y] = pointAlong(pts, s);
    for (const side of [-1, 1]) {
      if (rand() < 0.25) continue;
      trees.push({ x: r2(x + side * (corridor - 4 - rand() * 10)), y: r2(y + (rand() - 0.5) * 8), r: r2(3.5 + rand() * 2.5) });
    }
  }
  if (par > 3) for (let i = 0; i < 3; i++) {
    const [x, y] = pointAlong(pts, yards * (0.5 + i * 0.07));
    const side = pts[2][0] > pts[1][0] ? 1 : -1;   // the inside of the bend
    trees.push({ x: r2(x + side * (fwHalf + 10 + rand() * 8)), y: r2(y), r: r2(4 + rand() * 2) });
  }
  const clear = (t) => Math.hypot(t.x - green.x, t.y - green.y) > gr + t.r + 6 && Math.hypot(t.x, t.y) > 14
    && !bunkers.some(b => Math.hypot(t.x - b.x, t.y - b.y) < b.r + t.r) && !water.some(w => Math.hypot(t.x - w.x, t.y - w.y) < w.r + t.r);
  return {
    n, par, yards, pts, green, pin, slope, fwHalf, fwStart, corridor,
    tee: { x: 0, y: 0, w: 7, h: 5 },
    bunkers, water, trees: trees.filter(clear),
    top: green.y + gr + 24, bottom: -14,
  };
}

export const COURSE = (() => {
  const rand = rngOf(COURSE_SEED);
  const card = parCard(rand);
  return card.map((par, i) => buildHole(i + 1, par, rngOf(fnv(`${COURSE_SEED}|hole|${i + 1}`))));
})();
export const PAR = { front: COURSE.slice(0, 9).reduce((a, h) => a + h.par, 0), back: COURSE.slice(9).reduce((a, h) => a + h.par, 0) };

// What the ball lies on: "water" | "bunker" | "green" | "fringe" | "tee" | "ob" | "trees" | "fairway" | "rough"
export function surfaceAt(h, x, y) {
  if (h.famous) return famousSurface(h, x, y);
  for (const w of h.water) if (Math.hypot(x - w.x, y - w.y) <= w.r) return "water";
  for (const b of h.bunkers) if (Math.hypot(x - b.x, y - b.y) <= b.r) return "bunker";
  const dg = Math.hypot(x - h.green.x, y - h.green.y);
  if (dg <= h.green.r) return "green";
  if (dg <= h.green.r + 2.5) return "fringe";
  if (Math.abs(x - h.tee.x) <= h.tee.w / 2 && Math.abs(y - h.tee.y) <= h.tee.h / 2) return "tee";
  if (y < h.bottom || y > h.top) return "ob";
  const { d } = lineDist(h.pts, x, y);
  if (d > h.corridor) return "ob";
  for (const t of h.trees) if (Math.hypot(x - t.x, y - t.y) <= t.r) return "trees";
  if (d <= h.fwHalf && y >= h.fwStart) return "fairway";
  return "rough";
}
export const treeAt = (h, x, y) => h.trees.some(t => Math.hypot(x - t.x, y - t.y) <= t.r);
// How high the branches reach over a point (0: no tree). The links' trees are all TREE_TOP.
export const TREE_TOP = 11;
export function treeTop(h, x, y) {
  let top = 0;
  for (const t of h.trees) if (Math.hypot(x - t.x, y - t.y) <= t.r) top = Math.max(top, t.h ?? TREE_TOP);
  return top;
}
// The green's fall at a point, yards/s^2 of pull on a rolling ball (downhill). Zero off the green
// and fringe.
export function slopeAt(h, x, y) {
  const s = h.slope, u = x - h.green.x, v = y - h.green.y;
  if (Math.hypot(u, v) > h.green.r + 2.5) return [0, 0];
  return [s.bx + s.w * Math.sin(u * s.k + s.ph), s.by + s.w * Math.cos(v * s.k + s.ph * 0.7)];
}

// ---- THE DEPARTMENT OPEN: famous holes, built from holes/famous.js ---------------------------------
// The centre line in the hole's own frame: -> {along, lat (+ right), d}. Past either end the line
// runs on straight, so "along" keeps counting behind the green and before the tee.
export function frameOf(pts, x, y) {
  let best = Infinity, along = 0, lat = 0, acc = 0;
  const last = pts.length - 1;
  for (let i = 1; i <= last; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const vx = bx - ax, vy = by - ay, L = Math.hypot(vx, vy), ux = vx / L, uy = vy / L;
    const raw = (x - ax) * ux + (y - ay) * uy;
    const t = i === 1 && i === last ? raw : i === 1 ? Math.min(L, raw) : i === last ? Math.max(0, raw) : Math.max(0, Math.min(L, raw));
    const px = ax + ux * t, py = ay + uy * t, d = Math.hypot(x - px, y - py);
    if (d < best) { best = d; along = acc + t; lat = (x - px) * uy - (y - py) * ux; }
    acc += L;
  }
  return { along, lat, d: best };
}
// The point at (along, lat) in the hole's frame.
function framePoint(pts, along, lat) {
  const [x, y] = pointAlong(pts, Math.max(0, Math.min(lineLength(pts) - 0.01, along)));
  const [ux, uy] = headingAt(pts, along);
  const over = along > lineLength(pts) ? along - lineLength(pts) : along < 0 ? along : 0;
  return [x + ux * over + uy * lat, y + uy * over - ux * lat];
}
function headingAt(pts, along) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], L = Math.hypot(bx - ax, by - ay);
    if (along <= acc + L || i === pts.length - 1) return [(bx - ax) / L, (by - ay) / L];
    acc += L;
  }
  return [0, 1];
}
const TREE_KIND = { pine: { r: [3, 1.5], h: 14 }, oak: { r: [4, 2], h: 12 }, cypress: { r: [4, 2], h: 10 }, palm: { r: [2, 1], h: 15 }, gorse: { r: [2, 1], h: 2.5 } };

function buildFamous(n, d) {
  const rand = rngOf(fnv(`open|${d.id}`));
  // the centre line: north from the tee, turning at each knot, exactly d.yards long
  const knots = [...d.bend, [1, 0]];
  const pts = [[0, 0]];
  let head = 0, x = 0, y = 0, prev = 0;
  for (const [at, deg] of knots) {
    const L = (at - prev) * d.yards;
    x += Math.sin(head) * L; y += Math.cos(head) * L;
    pts.push([r2(x), r2(y)]);
    head += (deg * Math.PI) / 180; prev = at;
  }
  const [gx, gy] = pts[pts.length - 1];
  const [gr, [fdeg, fmag], [pdeg, pfr]] = d.green;
  const [ux, uy] = headingAt(pts, d.yards);
  // round the green: 0 short, 90 right, 180 long, 270 left
  const around = (deg, dist) => { const a = (deg * Math.PI) / 180; return [gx - ux * Math.cos(a) * dist + uy * Math.sin(a) * dist, gy - uy * Math.cos(a) * dist - ux * Math.sin(a) * dist]; };
  const green = { x: gx, y: gy, r: gr };
  const [pnx, pny] = around(pdeg, pfr * gr);
  const pin = { x: r2(pnx), y: r2(pny) };
  const [fx, fy] = around(fdeg, 1);
  const fall = [fx - gx, fy - gy];
  const slope = { bx: r2(fall[0] * fmag), by: r2(fall[1] * fmag), w: r2(0.05 + rand() * 0.08), k: r2(0.15 + rand() * 0.2), ph: r2(rand() * 6.28) };
  const bunkers = [], water = [], trees = [], decor = [], z = [];
  for (const hz of d.haz) {
    const [k] = hz;
    if (k === "b") { const [px, py] = framePoint(pts, hz[1], hz[2]); bunkers.push({ x: r2(px), y: r2(py), r: hz[3] }); }
    else if (k === "w") { const [px, py] = framePoint(pts, hz[1], hz[2]); water.push({ x: r2(px), y: r2(py), r: hz[3] }); }
    else if (k === "gb") { const [px, py] = around(hz[1], gr + hz[2] + 1.2); bunkers.push({ x: r2(px), y: r2(py), r: hz[2] }); }
    else if (k === "gw") { const [px, py] = around(hz[1], gr + hz[2] + 3.2); water.push({ x: r2(px), y: r2(py), r: hz[2] }); }
    else if (k === "t") { const [px, py] = framePoint(pts, hz[1], hz[2]); trees.push({ x: r2(px), y: r2(py), r: hz[3], h: 12, k: "cypress", fixed: true }); }
    else if (k === "island") { const [px, py] = around(hz[3], 1); z.push({ k, a0: hz[1], collar: hz[2], dx: px - gx, dy: py - gy, half: hz[4] }); }
    else z.push({ k, a: hz.slice(1) });
  }
  const fw = d.fw ? { from: d.fw[0], w: d.fw[1] } : null;
  const corridor = d.corridor || 50;
  const h = {
    n, par: d.par, yards: d.yards, pts, green, pin, slope,
    fwHalf: fw ? Math.max(...fw.w) : 0, fwStart: fw ? fw.from : Infinity, corridor,
    tee: { x: 0, y: 0, w: 7, h: 5 }, bunkers, water, trees, decor,
    top: Math.max(...pts.map(p => p[1])) + gr + 40, bottom: -14,
    famous: true, id: d.id, name: d.name, after: d.after, note: d.note, scene: d.scene, elev: d.elev || 0, gallery: d.gallery ?? 0,
    fw, z, treeKind: d.trees[0],
  };
  // trees: along both edges of the corridor (the kind and how thick are the hole's), and more
  // behind them for the view (decor: out of bounds, never in play)
  const [kind, dens] = d.trees;
  const tk = TREE_KIND[kind];
  if (tk) for (let s = 10; s < d.yards + 30; s += 12 + rand() * 12) for (const side of [-1, 1]) {
    if (rand() < dens) { const [px, py] = framePoint(pts, s + (rand() - 0.5) * 6, side * (corridor - 3 - rand() * 9)); trees.push({ x: r2(px), y: r2(py), r: r2(tk.r[0] + rand() * tk.r[1]), h: tk.h, k: kind }); }
    if (rand() < dens + 0.2) { const [px, py] = framePoint(pts, s + (rand() - 0.5) * 8, side * (corridor + 4 + rand() * 30)); decor.push({ x: r2(px), y: r2(py), r: r2(tk.r[0] + rand() * tk.r[1]), h: tk.h, k: kind }); }
  }
  const wet = (t) => { const s = surfaceAt({ ...h, trees: [] }, t.x, t.y); return s === "water" || s === "bunker" || s === "green" || s === "fringe" || s === "fairway"; };
  h.trees = trees.filter(t => t.fixed || (Math.hypot(t.x - gx, t.y - gy) > gr + t.r + 6 && Math.hypot(t.x, t.y) > 14 && !wet(t)));
  h.decor = decor.filter(t => { const s = surfaceAt({ ...h, trees: [] }, t.x, t.y); return s !== "water" && Math.hypot(t.x - gx, t.y - gy) > gr + 14; });
  return h;
}
const fwHalfAt = (fw, along, end) => {
  const w = fw.w, f = Math.max(0, Math.min(1, (along - fw.from) / Math.max(1, end - fw.from))) * (w.length - 1), i = Math.floor(f);
  return i >= w.length - 1 ? w[w.length - 1] : w[i] + (w[i + 1] - w[i]) * (f - i);
};
function famousSurface(h, x, y) {
  for (const w of h.water) if (Math.hypot(x - w.x, y - w.y) <= w.r) return "water";
  const g = h.green, dg = Math.hypot(x - g.x, y - g.y), nearGreen = dg <= g.r + 2.5;
  const { along: a, lat: l, d } = frameOf(h.pts, x, y);
  for (const zn of h.z) {
    const q = zn.a;
    if (zn.k === "sea") { if (!nearGreen && a >= q[1] && a <= q[2] && q[0] * l > q[3]) return "water"; }
    else if (zn.k === "cross") { if (!nearGreen && a >= q[0] && a <= q[1] && l >= (q[3] ?? -1e9) && l <= (q[4] ?? 1e9)) return q[2] === "w" ? "water" : "bunker"; }
    else if (zn.k === "island") {
      if (a >= zn.a0 && dg > g.r + 2.5 + zn.collar) {
        // the staff path: a strip out from the green toward zn.dx, zn.dy
        const t = Math.max(0, (x - g.x) * zn.dx + (y - g.y) * zn.dy);
        if (!(t > 0 && Math.hypot(x - g.x - zn.dx * t, y - g.y - zn.dy * t) <= zn.half)) return "water";
      }
    }
  }
  for (const b of h.bunkers) if (Math.hypot(x - b.x, y - b.y) <= b.r) return "bunker";
  for (const zn of h.z) if (zn.k === "pews") { const q = zn.a; if (a >= q[0] && a <= q[1] && l >= q[2] && l <= q[3]) return (a - q[0]) % 9 < 1.6 ? "rough" : "bunker"; }
  if (dg <= g.r) return "green";
  if (nearGreen) return "fringe";
  if (Math.abs(x - h.tee.x) <= h.tee.w / 2 && Math.abs(y - h.tee.y) <= h.tee.h / 2) return "tee";
  if (y < h.bottom || y > h.top || d > h.corridor) return "ob";
  for (const zn of h.z) {
    const q = zn.a;
    if (zn.k === "ob" && a >= q[2] && a <= q[3] && q[0] * l > q[1]) return "ob";
    if (zn.k === "obback" && a > h.yards + g.r + q[0]) return "ob";
  }
  for (const t of h.trees) if (Math.hypot(x - t.x, y - t.y) <= t.r) return "trees";
  if (h.fw && a >= h.fw.from && a <= h.yards - g.r && Math.abs(l) <= fwHalfAt(h.fw, a, h.yards - g.r)) return "fairway";
  return "rough";
}
export { fwHalfAt };

export const OPEN = FAMOUS.map((d, i) => buildFamous(i + 1, d));
export const COURSES = { links: COURSE, open: OPEN };
export const COURSE_NAME = { links: "THE DEPARTMENT LINKS", open: "THE DEPARTMENT OPEN" };
export const parOf = (holes) => ({ front: holes.slice(0, 9).reduce((a, h) => a + h.par, 0), back: holes.slice(9).reduce((a, h) => a + h.par, 0) });
