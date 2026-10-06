// THE DEPARTMENT LINKS: the eighteen holes of APPLICATION 001, the course THE ASSEMBLY declined
// to build on LOT 0x6F07 (session 001 voted for the farm). civicGeo.js GOLF still holds the
// routing it would have had: six by three, serpentine, each a tee, a green and its flag, the four
// bunkers, the pond. Each hole here is that routing played out at full size, seeded and fixed:
// the same par, yardage, dogleg, hazards and green for every viewer, every round, forever.
// Pure (no DOM): the sim, the renderer and scripts/check-golf.mjs all read it.
//
// Hole coordinates are yards. The tee is at (0, 0); +y runs up the hole toward the green; +x is
// to the golfer's right. The renderer flips y.
//
// GEOMETRY VERSION 2 (sim v2). No green is a circle any more:
//   - THE DEPARTMENT OPEN plays on the real overhead shapes of each hole where OpenStreetMap has
//     them (holes/osm.js, made offline by scripts/golf-osm-import.mjs; map data (c) OpenStreetMap
//     contributors, ODbL): the hole's line, green, fairways, bunkers, tees, water, streams, coast.
//   - Where OSM has nothing, and on THE DEPARTMENT LINKS, greens, bunkers and ponds are organic
//     blobs built from the old numbers (a seeded sum of a few harmonics, area kept), and fairway
//     edges wander.
// Every area is a polygon with a bounding box. Version 1 rounds replay on the frozen circle
// geometry in ./v1/course.js.

import { GOLF } from "../../city/civicGeo.js";
import { FAMOUS } from "./holes/famous.js";
import { OSM } from "./holes/osm.js";

export const COURSE_SEED = 0x6f07;
export const GEOMETRY = 2;

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

// ---- polygons ------------------------------------------------------------------------------------
// {pts: [[x, y]...] (open ring), bb: [x0, y0, x1, y1]}
export function poly(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return { pts, bb: [x0, y0, x1, y1] };
}
export function inPoly(P, x, y, pad = 0) {
  const b = P.bb;
  if (x < b[0] - pad || x > b[2] + pad || y < b[1] - pad || y > b[3] + pad) return false;
  const p = P.pts;
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], yi = p[i][1], xj = p[j][0], yj = p[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function segD(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2));
  return Math.hypot(px - ax - t * vx, py - ay - t * vy);
}
// Distance from a point to a polygon's edge (0 inside counts as the distance to the edge too).
export function edgeDist(P, x, y) {
  const p = P.pts;
  let d = Infinity;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) d = Math.min(d, segD(x, y, p[j][0], p[j][1], p[i][0], p[i][1]));
  return d;
}
export function polyLineDist(pts, x, y) {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, segD(x, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  return d;
}
export function areaOf(pts) { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]; return Math.abs(a / 2); }
export function centroidOf(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const f = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]; a += f; cx += (pts[j][0] + pts[i][0]) * f; cy += (pts[j][1] + pts[i][1]) * f; }
  return Math.abs(a) < 1e-9 ? [pts[0][0], pts[0][1]] : [cx / (3 * a), cy / (3 * a)];
}
// An organic blob round (cx, cy) with the area of a circle of radius r: a seeded sum of a few
// harmonics (never a circle), the long axis at `axis` radians, `wob` how far from round.
export function blob(cx, cy, r, seed, { n = 20, wob = 1, axis = null, stretch = 0 } = {}) {
  const rnd = rngOf(seed);
  const a2 = (0.08 + rnd() * 0.12) * wob + stretch, a3 = (0.04 + rnd() * 0.07) * wob, a5 = (0.015 + rnd() * 0.03) * wob;
  const p2 = axis ?? rnd() * Math.PI, p3 = rnd() * 6.283, p5 = rnd() * 6.283;
  const raw = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const k = 1 + a2 * Math.cos(2 * (t - p2)) + a3 * Math.cos(3 * t + p3) + a5 * Math.cos(5 * t + p5);
    raw.push([Math.cos(t) * k, Math.sin(t) * k]);
  }
  const s = r * Math.sqrt(Math.PI / areaOf(raw));
  return poly(raw.map(([x, y]) => [r2(cx + x * s), r2(cy + y * s)]));
}

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

// A pin inside the green, at least `margin` yards from its edge: from the centroid toward (px, py).
function pinIn(G, cx, cy, px, py, margin = 3) {
  for (let k = 1; k >= 0; k -= 0.05) {
    const x = cx + (px - cx) * k, y = cy + (py - cy) * k;
    if (inPoly(G, x, y) && edgeDist(G, x, y) >= margin) return { x: r2(x), y: r2(y) };
  }
  return { x: r2(cx), y: r2(cy) };
}
// The green as the hole uses it: {x, y (centroid), r (a circle of the same area), poly}
function greenOf(G) {
  const [x, y] = centroidOf(G.pts);
  return { x: r2(x), y: r2(y), r: r2(Math.sqrt(areaOf(G.pts) / Math.PI)), poly: G };
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
  const gx = pts[pts.length - 1][0], gy = pts[pts.length - 1][1];
  const pa = rand() * Math.PI * 2, pr = rand() * gr * 0.6;
  const app = Math.atan2(gy - pts[pts.length - 2][1], gx - pts[pts.length - 2][0]);
  const GP = blob(gx, gy, gr, fnv(`links|green|${n}`), { n: 24, axis: app, stretch: 0.1 });
  const green = greenOf(GP);
  const pin = pinIn(GP, gx, gy, gx + Math.cos(pa) * pr, gy + Math.sin(pa) * pr);
  // The green's lie: a base fall plus a gentle roll across it, so the arrows differ cell by cell.
  const sa = rand() * Math.PI * 2, sm = 0.12 + rand() * 0.38;
  const slope = { bx: r2(Math.cos(sa) * sm), by: r2(Math.sin(sa) * sm), w: r2(0.08 + rand() * 0.18), k: r2(0.15 + rand() * 0.2), ph: r2(rand() * 6.28) };
  const fwHalf = par === 3 ? 0 : r2(14 + rand() * 7);
  const fwStart = par === 3 ? Infinity : Math.round(95 + rand() * 60);
  const corridor = r2(par === 3 ? 38 + rand() * 10 : 48 + rand() * 14);
  const yards = Math.round(lineLength(pts));
  const bunkers = [], water = [], trees = [];
  const near = (p, k) => Math.hypot(p[0] - city.green[0], p[1] - city.green[1]) < k;
  const cityBunker = GOLF.bunkers.some(b => near(b, 2.4));
  const cityPond = near(GOLF.pond, 2.2);
  const nb = 1 + Math.floor(rand() * 2) + (cityBunker ? 1 : 0);
  let bi = 0;
  const bunker = (x, y, r) => bunkers.push(blob(x, y, r, fnv(`links|bunker|${n}|${bi++}`), { n: 14, wob: 1.6 }));
  for (let i = 0; i < nb; i++) {
    const a = app + Math.PI + (i % 2 ? 1 : -1) * (0.9 + rand() * 1.4);
    const br = 4 + rand() * 3, d = gr + br + 1.5;
    bunker(green.x - Math.cos(a) * d, green.y - Math.sin(a) * d, br);
  }
  if (par > 3) {
    const nf = Math.floor(rand() * 3);
    for (let i = 0; i < nf; i++) {
      const [x, y] = pointAlong(pts, 215 + rand() * 50);
      const side = rand() < 0.5 ? -1 : 1;
      bunker(x + side * (fwHalf + 2 + rand() * 4), y, 5 + rand() * 3);
    }
  }
  if (cityPond || rand() < 0.28) {
    // the pond: three overlapping blobs read as one shoreline
    const pond = (x, y, r, i) => water.push(blob(x, y, r, fnv(`links|pond|${n}|${i}`), { n: 18, wob: 1.2 }));
    if (par === 3) {
      const cx = gx + (rand() - 0.5) * 10, cy = gy - gr - 16;
      for (let i = 0; i < 3; i++) pond(cx + (i - 1) * 13, cy + (rand() - 0.5) * 4, 9 + rand() * 3, i);
    } else {
      const [x, y] = pointAlong(pts, yards * (0.45 + rand() * 0.2));
      const side = rand() < 0.5 ? -1 : 1;
      for (let i = 0; i < 3; i++) pond(x + side * (fwHalf + 12 + i * 4), y + (i - 1) * 12, 9 + rand() * 4, i);
    }
  }
  for (let s = 20; s < yards + 10; s += 16 + rand() * 12) {
    const [x, y] = pointAlong(pts, s);
    for (const side of [-1, 1]) {
      if (rand() < 0.25) continue;
      trees.push({ x: r2(x + side * (corridor - 4 - rand() * 10)), y: r2(y + (rand() - 0.5) * 8), r: r2(3.5 + rand() * 2.5) });
    }
  }
  if (par > 3) for (let i = 0; i < 3; i++) {
    const [x, y] = pointAlong(pts, yards * (0.5 + i * 0.07));
    const side = pts[2][0] > pts[1][0] ? 1 : -1;
    trees.push({ x: r2(x + side * (fwHalf + 10 + rand() * 8)), y: r2(y), r: r2(4 + rand() * 2) });
  }
  const clear = (t) => Math.hypot(t.x - green.x, t.y - green.y) > gr + t.r + 6 && Math.hypot(t.x, t.y) > 14
    && !bunkers.some(b => inPoly(b, t.x, t.y, t.r)) && !water.some(w => inPoly(w, t.x, t.y, t.r));
  const fw = fwHalf ? { from: fwStart, w: [fwHalf, fwHalf], wob: fnv(`links|fw|${n}`) } : null;
  return {
    n, par, yards, pts, green, pin, slope, fwHalf, fwStart, corridor,
    tee: { x: 0, y: 0, w: 7, h: 5 },
    bunkers, water, trees: trees.filter(clear), fw, z: [], fairways: [], tees: [], streams: [], coast: [],
    top: green.y + gr + 24, bottom: -14, terrain: terrainOf(n * 7919, 0, pts),
  };
}

// The ground away from the green: a gentle seeded swell (and the hole's own rise), yards/s^2 of
// pull on a rolling ball, so a ball runs off a hump on the fairway too. Small next to a green's fall.
function terrainOf(seed, elev, pts) {
  const r = rngOf(seed >>> 0);
  const [ux, uy] = (() => { const a = pts[0], b = pts[pts.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; })();
  return { a1: r2(0.1 + r() * 0.12), k1: r2(0.035 + r() * 0.03), p1: r2(r() * 6.28), a2: r2(0.06 + r() * 0.08), k2: r2(0.06 + r() * 0.05), p2: r2(r() * 6.28), ex: r2(-ux * elev * 0.22), ey: r2(-uy * elev * 0.22) };
}

export const COURSE = (() => {
  const rand = rngOf(COURSE_SEED);
  const card = parCard(rand);
  return card.map((par, i) => buildHole(i + 1, par, rngOf(fnv(`${COURSE_SEED}|hole|${i + 1}`))));
})();
export const PAR = { front: COURSE.slice(0, 9).reduce((a, h) => a + h.par, 0), back: COURSE.slice(9).reduce((a, h) => a + h.par, 0) };

const inAny = (list, x, y) => { for (const P of list) if (inPoly(P, x, y)) return true; return false; };
function greenSurface(h, x, y) {
  const G = h.green.poly;
  if (inPoly(G, x, y)) return "green";
  if (inPoly(G, x, y, 2.5) && edgeDist(G, x, y) <= 2.5) return "fringe";
  return null;
}

// What the ball lies on: "water" | "bunker" | "waste" | "green" | "fringe" | "tee" | "path" | "ob" |
// "trees" | "fairway" | "rough"
export function surfaceAt(h, x, y) {
  if (h.famous) return famousSurface(h, x, y);
  if (inAny(h.water, x, y)) return "water";
  if (inAny(h.bunkers, x, y)) return "bunker";
  const g = greenSurface(h, x, y);
  if (g) return g;
  if (Math.abs(x - h.tee.x) <= h.tee.w / 2 && Math.abs(y - h.tee.y) <= h.tee.h / 2) return "tee";
  if (y < h.bottom || y > h.top) return "ob";
  const { d, along } = lineDist(h.pts, x, y);
  if (d > h.corridor) return "ob";
  for (const t of h.trees) if (Math.hypot(x - t.x, y - t.y) <= t.r) return "trees";
  if (h.fw && along >= h.fw.from - fwRound(h.fw, along, x, y) && d <= fwEdge(h.fw, along, h.yards - h.green.r * 0.6)) return "fairway";
  return "rough";
}
// The fairway's wandering edge (links and drawn holes): half width at `along`, with two slow waves
const fwEdge = (fw, along, end) => {
  const base = fwHalfAt(fw, along, end);
  if (!fw.wob) return base;
  const p = (fw.wob % 628) / 100, q = ((fw.wob >>> 10) % 628) / 100;
  const taper = Math.min(1, Math.max(0, (along - fw.from) / 14), Math.max(0, (end + 6 - along) / 14));
  return base * (1 + 0.11 * Math.sin(along / 21 + p) + 0.05 * Math.sin(along / 7.3 + q)) * Math.sqrt(taper);
};
const fwRound = () => 0;
export const treeAt = (h, x, y) => h.trees.some(t => Math.hypot(x - t.x, y - t.y) <= t.r);
export const TREE_TOP = 11;
export function treeTop(h, x, y) {
  let top = 0;
  for (const t of h.trees) if (Math.hypot(x - t.x, y - t.y) <= t.r) top = Math.max(top, t.h ?? TREE_TOP);
  return top;
}
// The green's fall at a point, yards/s^2 of pull on a rolling ball (downhill): the green's own on
// the green and its fringe (a little gentler than v1's: a ball must be able to stop on it), the
// ground's swell everywhere else.
export function slopeAt(h, x, y) {
  const s = h.slope, u = x - h.green.x, v = y - h.green.y;
  if (inPoly(h.green.poly, x, y, 2.5)) return [0.62 * (s.bx + s.w * Math.sin(u * s.k + s.ph)), 0.62 * (s.by + s.w * Math.cos(v * s.k + s.ph * 0.7))];
  const t = h.terrain;
  return [t.ex + t.a1 * Math.cos(x * t.k1 + t.p1) * Math.sin(y * t.k2 * 0.7 + t.p2), t.ey + t.a2 * Math.sin(y * t.k1 + t.p2) * Math.cos(x * t.k2 + t.p1)];
}

// ---- THE DEPARTMENT OPEN: famous holes, built from holes/famous.js (+ holes/osm.js) ------------------
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
  const O = OSM[d.id] || null;
  let pts;
  if (O) pts = O.line.map(p => p.slice());
  else {
    // the centre line: north from the tee, turning at each knot, exactly d.yards long
    const knots = [...d.bend, [1, 0]];
    pts = [[0, 0]];
    let head = 0, x = 0, y = 0, prev = 0;
    for (const [at, deg] of knots) {
      const L = (at - prev) * d.yards;
      x += Math.sin(head) * L; y += Math.cos(head) * L;
      pts.push([r2(x), r2(y)]);
      head += (deg * Math.PI) / 180; prev = at;
    }
  }
  const yards = d.yards;
  const lineLen = lineLength(pts);
  const [ex, ey] = pts[pts.length - 1];
  const [gr, [fdeg, fmag], [pdeg, pfr]] = d.green;
  const [ux, uy] = headingAt(pts, lineLen);
  // the green: OSM's shape, else an organic one stretched along the approach
  const GP = O ? poly(O.green.map(p => p.slice())) : blob(ex, ey, gr, fnv(`open|green|${d.id}`), { n: 24, axis: Math.atan2(uy, ux), stretch: 0.12 });
  const green = greenOf(GP);
  const gx = green.x, gy = green.y, R = green.r;
  // round the green: 0 short, 90 right, 180 long, 270 left
  const around = (deg, dist) => { const a = (deg * Math.PI) / 180; return [gx - ux * Math.cos(a) * dist + uy * Math.sin(a) * dist, gy - uy * Math.cos(a) * dist - ux * Math.sin(a) * dist]; };
  const [pnx, pny] = around(pdeg, pfr * R);
  const pin = pinIn(GP, gx, gy, pnx, pny, Math.min(3, R * 0.3));
  const [fx, fy] = around(fdeg, 1);
  const fall = [fx - gx, fy - gy];
  const slope = { bx: r2(fall[0] * fmag), by: r2(fall[1] * fmag), w: r2(0.05 + rand() * 0.08), k: r2(0.15 + rand() * 0.2), ph: r2(rand() * 6.28) };
  const bunkers = [], water = [], trees = [], decor = [], z = [];
  const hasW = O && (O.water.length || O.stream.length || O.coast.length), hasB = O && O.bunker.length, hasC = O && O.coast.length;
  let bi = 0;
  for (const hz of d.haz) {
    const [k] = hz;
    // with OSM shapes, the drawn bunkers and ponds give way to the real ones
    if (O && (k === "b" || k === "gb") && hasB) continue;
    if (O && (k === "w" || k === "gw") && hasW) continue;
    if (k === "b") { const [px, py] = framePoint(pts, hz[1], hz[2]); bunkers.push(blob(px, py, hz[3], fnv(`open|b|${d.id}|${bi++}`), { n: 14, wob: 1.6 })); }
    else if (k === "w") { const [px, py] = framePoint(pts, hz[1], hz[2]); water.push(blob(px, py, hz[3], fnv(`open|w|${d.id}|${bi++}`), { n: 18, wob: 1.2 })); }
    else if (k === "gb") { const [px, py] = around(hz[1], R + hz[2] + 1.2); bunkers.push(blob(px, py, hz[2], fnv(`open|gb|${d.id}|${bi++}`), { n: 14, wob: 1.6, axis: (hz[1] * Math.PI) / 180 + Math.atan2(uy, ux) + Math.PI / 2, stretch: 0.25 })); }
    else if (k === "gw") { const [px, py] = around(hz[1], R + hz[2] + 3.2); water.push(blob(px, py, hz[2], fnv(`open|gw|${d.id}|${bi++}`), { n: 16, wob: 1 })); }
    else if (k === "t") { const [px, py] = framePoint(pts, hz[1], hz[2]); trees.push({ x: r2(px), y: r2(py), r: hz[3], h: 12, k: "cypress", fixed: true }); }
    else if (k === "island") { if (hasW) continue; const [px, py] = around(hz[3], 1); z.push({ k, a0: hz[1], collar: hz[2], dx: px - gx, dy: py - gy, half: hz[4] }); }
    else if (k === "sea") { if (!hasC && !hasW) z.push({ k, a: hz.slice(1) }); }
    else if (k === "cross") {
      if (O && hz[3] === "w" && hasW) continue;
      if (O && hz[3] === "b" && hasB) continue;
      z.push({ k, a: hz.slice(1) });
    }
    else if (k === "obback" && d.road) {
      // the Road Hole: a road behind the green (in play, hard and fast), then the wall (out)
      const back = Math.max(...GP.pts.map(p => frameOf(pts, p[0], p[1]).along));
      z.push({ k: "road", a: [back + d.road[0], back + d.road[1]] });
      z.push({ k: "wall", a: [back + d.road[1]] });
    }
    else z.push({ k, a: hz.slice(1) });
  }
  const fw = !O && d.fw ? { from: d.fw[0], w: d.fw[1], wob: fnv(`open|fw|${d.id}`) } : null;
  const corridor = (d.corridor || 50) + (O ? 8 : 0);
  const along = pts.map((p, i) => (i ? lineLength(pts.slice(0, i + 1)) : 0));
  const h = {
    n, par: d.par, yards, pts, green, pin, slope,
    fwHalf: fw ? Math.max(...fw.w) : d.fw ? Math.max(...d.fw[1]) : 0, fwStart: fw ? fw.from : d.fw ? d.fw[0] : Infinity, corridor,
    tee: { x: 0, y: 0, w: 7, h: 5 }, bunkers, water, trees, decor,
    top: Math.max(...pts.map(p => p[1]), ...GP.pts.map(p => p[1])) + 40, bottom: -14,
    famous: true, id: d.id, name: d.name, after: d.after, note: d.note, scene: d.scene, elev: d.elev || 0, gallery: d.gallery ?? 0,
    fw, z, treeKind: d.trees[0], lineLen, osm: Boolean(O),
    fairways: O ? O.fairway.map(p => poly(p)) : [], tees: O ? O.tee.map(p => poly(p)) : [],
    streams: O ? O.stream.map(s => ({ w: s.w, pts: s.pts, bb: poly(s.pts).bb })) : [], coast: O ? O.coast : [],
    terrain: terrainOf(fnv(`terrain|${d.id}`), d.elev || 0, pts),
  };
  void along;
  if (O) { for (const p of O.bunker) bunkers.push(poly(p)); for (const p of O.water) water.push(poly(p)); }
  // trees: along both edges of the corridor (the kind and how thick are the hole's), and more
  // behind them for the view (decor: out of bounds, never in play)
  const [kind, dens] = d.trees;
  const tk = TREE_KIND[kind];
  if (tk) for (let s = 10; s < lineLen + 30; s += 12 + rand() * 12) for (const side of [-1, 1]) {
    if (rand() < dens) { const [px, py] = framePoint(pts, s + (rand() - 0.5) * 6, side * (corridor - 3 - rand() * 9)); trees.push({ x: r2(px), y: r2(py), r: r2(tk.r[0] + rand() * tk.r[1]), h: tk.h, k: kind }); }
    if (rand() < dens + 0.2) { const [px, py] = framePoint(pts, s + (rand() - 0.5) * 8, side * (corridor + 4 + rand() * 30)); decor.push({ x: r2(px), y: r2(py), r: r2(tk.r[0] + rand() * tk.r[1]), h: tk.h, k: kind }); }
  }
  const wet = (t) => { const s = surfaceAt({ ...h, trees: [] }, t.x, t.y); return s === "water" || s === "bunker" || s === "green" || s === "fringe" || s === "fairway" || s === "tee" || s === "path"; };
  h.trees = trees.filter(t => t.fixed || (Math.hypot(t.x - gx, t.y - gy) > R + t.r + 6 && Math.hypot(t.x, t.y) > 14 && !wet(t)));
  h.decor = decor.filter(t => { const s = surfaceAt({ ...h, trees: [] }, t.x, t.y); return s !== "water" && Math.hypot(t.x - gx, t.y - gy) > R + 14; });
  return h;
}
const fwHalfAt = (fw, along, end) => {
  const w = fw.w, f = Math.max(0, Math.min(1, (along - fw.from) / Math.max(1, end - fw.from))) * (w.length - 1), i = Math.floor(f);
  return i >= w.length - 1 ? w[w.length - 1] : w[i] + (w[i + 1] - w[i]) * (f - i);
};
// Which side of a coastline a point is on: OSM draws coastlines with the land on the left, so a
// point to the right of the nearest segment is in the sea.
function seaSide(lines, x, y) {
  let best = Infinity, side = 0;
  for (const L of lines) for (let i = 1; i < L.length; i++) {
    const [ax, ay] = L[i - 1], [bx, by] = L[i];
    const d = segD(x, y, ax, ay, bx, by);
    if (d < best) { best = d; side = (bx - ax) * (y - ay) - (by - ay) * (x - ax); }
  }
  return best < Infinity && side < 0;
}
function famousSurface(h, x, y) {
  if (inAny(h.water, x, y)) return "water";
  for (const s of h.streams) if (x >= s.bb[0] - s.w && x <= s.bb[2] + s.w && y >= s.bb[1] - s.w && y <= s.bb[3] + s.w && polyLineDist(s.pts, x, y) <= s.w / 2) return "water";
  const G = h.green.poly;
  const gs = greenSurface(h, x, y), nearGreen = Boolean(gs);
  if (!nearGreen && h.coast.length && seaSide(h.coast, x, y)) return "water";
  const { along: a, lat: l, d } = frameOf(h.pts, x, y);
  for (const zn of h.z) {
    const q = zn.a;
    if (zn.k === "sea") { if (!nearGreen && a >= q[1] && a <= q[2] && q[0] * l > q[3]) return "water"; }
    else if (zn.k === "cross") { const wv = q[2] === "w" ? 0 : 3.5 * Math.sin(l / 6.5 + q[0]) + 2 * Math.sin(l / 2.9 + q[1]); if (!nearGreen && a >= q[0] + wv && a <= q[1] - wv * 0.7 && l >= (q[3] ?? -1e9) && l <= (q[4] ?? 1e9)) return q[2] === "w" ? "water" : q[2] === "waste" ? "waste" : "bunker"; }
    else if (zn.k === "island") {
      if (a >= zn.a0 && !inPoly(G, x, y, 2.5 + zn.collar) || (a >= zn.a0 && edgeDist(G, x, y) > 2.5 + zn.collar && !inPoly(G, x, y))) {
        const t = Math.max(0, (x - h.green.x) * zn.dx + (y - h.green.y) * zn.dy);
        if (!(t > 0 && Math.hypot(x - h.green.x - zn.dx * t, y - h.green.y - zn.dy * t) <= zn.half)) return "water";
      }
    }
  }
  if (inAny(h.bunkers, x, y)) {
    for (const zn of h.z) if (zn.k === "pews") { const q = zn.a; if (a >= q[0] && a <= q[1] && l >= q[2] && l <= q[3]) return (a - q[0]) % 9 < 1.6 ? "rough" : "bunker"; }
    return "bunker";
  }
  for (const zn of h.z) if (zn.k === "pews") { const q = zn.a; if (a >= q[0] && a <= q[1] && l >= q[2] && l <= q[3]) return (a - q[0]) % 9 < 1.6 ? "rough" : "bunker"; }
  if (gs) return gs;
  if (Math.abs(x - h.tee.x) <= h.tee.w / 2 && Math.abs(y - h.tee.y) <= h.tee.h / 2) return "tee";
  for (const zn of h.z) {
    if (zn.k === "road" && a >= zn.a[0] && a <= zn.a[1] && Math.abs(l) < 60) return "path";
    if (zn.k === "wall" && a > zn.a[0]) return "ob";
  }
  if (y < h.bottom || y > h.top || d > h.corridor) return "ob";
  for (const zn of h.z) {
    const q = zn.a;
    if (zn.k === "ob" && a >= q[2] && a <= q[3] && q[0] * l > q[1]) return "ob";
    if (zn.k === "obback" && a > h.yards + h.green.r + q[0]) return "ob";
  }
  for (const t of h.trees) if (Math.hypot(x - t.x, y - t.y) <= t.r) return "trees";
  if (inAny(h.tees, x, y)) return "tee";
  if (h.osm) { if (inAny(h.fairways, x, y)) return "fairway"; }
  else if (h.fw && a >= h.fw.from && a <= h.yards - h.green.r * 0.6 && Math.abs(l) <= fwEdge(h.fw, a, h.yards - h.green.r * 0.6)) return "fairway";
  return "rough";
}
export { fwHalfAt };

export const OPEN = FAMOUS.map((d, i) => buildFamous(i + 1, d));
export const COURSES = { links: COURSE, open: OPEN };
export const COURSE_NAME = { links: "THE DEPARTMENT LINKS", open: "THE DEPARTMENT OPEN" };
export const parOf = (holes) => ({ front: holes.slice(0, 9).reduce((a, h) => a + h.par, 0), back: holes.slice(9).reduce((a, h) => a + h.par, 0) });
