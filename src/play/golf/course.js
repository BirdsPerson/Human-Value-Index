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
// The green's fall at a point, yards/s^2 of pull on a rolling ball (downhill). Zero off the green
// and fringe.
export function slopeAt(h, x, y) {
  const s = h.slope, u = x - h.green.x, v = y - h.green.y;
  if (Math.hypot(u, v) > h.green.r + 2.5) return [0, 0];
  return [s.bx + s.w * Math.sin(u * s.k + s.ph), s.by + s.w * Math.cos(v * s.k + s.ph * 0.7)];
}
