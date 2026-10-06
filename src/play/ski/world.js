// THE MOUNTAIN, skiable (src/play/ski/): the slope world, built from the city's own mountain
// (src/city/mountainGeo.js: the heightfield, the trails and their ratings, the glades, the moguls,
// THE SANDBOX's kickers and rails, THE PIPELINE, the lifts, the lodges, THE GAUNTLET's gates) and the
// river's mountain water (src/city/river.js: THE RETENTION POOL, THE BURNOUT). Deterministic from
// that data: no clock, no random.
//
// UNITS. Metres. A map cell is CELL m across, a storey STOREY m high (64 ft: the board's 4,241 FT
// summit over the 1,165 FT village). X east, Y south (the map's y: negative is north), Z up.
//
// THE ONE RULE FOR THE SIM. Everything the sim reads from here is QUANTISED (q(): to 1/256 m, the
// ground to 1/64 m), and every lookup it calls (heightAt, gradAt, surfaceAt, the trees, the water) is
// plain arithmetic and Math.sqrt on those numbers. mountainGeo.js computes with Math.sin and
// Math.hypot, which may differ in the last bit between engines; the rounding absorbs that, so a run
// re-played on the server (node) lands where it landed in the player's browser.
//
// THE GROUND is sampled lazily, tile by tile (TILE x TILE samples every GS m), and cached: a run
// computes only the ground it crosses; the renderer reads the same tiles.

import { MTN, TRAILS, LIFTS, LODGES, STATIONS, PARK, GATES, RACE_COURSE, PINES, PEAKS, TREELINE, terrainH, h01, lightsOn, weatherOn } from "../../city/mountainGeo.js";
import { TARN, MELT } from "../../city/river.js";
export { lightsOn, weatherOn };

export const CELL = 60, STOREY = 19.5, G = 9.81;
export const q = (v) => Math.round(v * 256) / 256;
const qh = (v) => Math.round(v * 64) / 64;
export const W0 = { x0: q(MTN.x0 * CELL), x1: q(MTN.x1 * CELL), y0: q(MTN.y0 * CELL), y1: q(MTN.y1 * CELL) };
export const toW = (p) => [q(p[0] * CELL), q(p[1] * CELL)];
export const TREELINE_M = TREELINE * STOREY;
const sqrt = Math.sqrt, floor = Math.floor;

// ---- polylines (arithmetic only) ---------------------------------------------------------------------
// pts [[x, y]...] -> {pts, cum (distance along), len}
export function poly(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) { const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1]; cum.push(cum[i - 1] + sqrt(dx * dx + dy * dy)); }
  return { pts, cum, len: cum[cum.length - 1] };
}
// -> [x, y, dx, dy] at distance s along
export function polyAt(P, s) {
  const { pts, cum } = P;
  if (s <= 0) { const d = dirOf(pts[0], pts[1]); return [pts[0][0], pts[0][1], d[0], d[1]]; }
  let lo = 0, hi = pts.length - 1;
  if (s >= P.len) { const d = dirOf(pts[hi - 1], pts[hi]); return [pts[hi][0], pts[hi][1], d[0], d[1]]; }
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi], seg = cum[hi] - cum[lo] || 1, f = (s - cum[lo]) / seg;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, (b[0] - a[0]) / seg, (b[1] - a[1]) / seg];
}
function dirOf(a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], n = sqrt(dx * dx + dy * dy) || 1; return [dx / n, dy / n]; }
// squared distance from p to segment ab, and t along it
function segD2(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1e-9;
  let t = ((px - ax) * vx + (py - ay) * vy) / L2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - ax - vx * t, dy = py - ay - vy * t;
  return [dx * dx + dy * dy, t];
}
// Nearest point on a polyline: -> {d, s}
export function polyNear(P, x, y) {
  let best = Infinity, s = 0;
  for (let i = 1; i < P.pts.length; i++) {
    const a = P.pts[i - 1], b = P.pts[i], [d2, t] = segD2(x, y, a[0], a[1], b[0], b[1]);
    if (d2 < best) { best = d2; s = P.cum[i - 1] + t * (P.cum[i] - P.cum[i - 1]); }
  }
  return { d: sqrt(best), s };
}
// Does segment p0->p1 cross segment a->b? (strict, arithmetic)
export function crosses(p0x, p0y, p1x, p1y, ax, ay, bx, by) {
  const d1 = (bx - ax) * (p0y - ay) - (by - ay) * (p0x - ax), d2 = (bx - ax) * (p1y - ay) - (by - ay) * (p1x - ax);
  if ((d1 > 0) === (d2 > 0) || d1 === d2) return false;
  const e1 = (p1x - p0x) * (ay - p0y) - (p1y - p0y) * (ax - p0x), e2 = (p1x - p0x) * (by - p0y) - (p1y - p0y) * (bx - p0x);
  return (e1 > 0) !== (e2 > 0);
}

// ---- the trails ------------------------------------------------------------------------------------------
const HALF_W = { green: 2.2, blue: 2.4, black: 2.1, double: 1.7 };   // cells (mountainGeo.js TRAIL_W)
export const KIND_NAME = { groomed: "GROOMED", moguls: "MOGULS", glades: "GLADES", park: "TERRAIN PARK", race: "RACE COURSE", cat: "CAT TRACK" };
export const RUNS = TRAILS.map((T, i) => {
  const P = poly(T.pts.map(toW));
  return { i, id: T.id, name: T.name, rating: T.rating, kind: T.kind, from: T.from, to: T.to, hw: q((HALF_W[T.rating] * CELL) / 2), ...P };
});
export const RUN = Object.fromEntries(RUNS.map(r => [r.id, r]));
// the segments, bucketed (BK m) for the surface lookup
const BK = 120, SEGS = new Map();
for (const R of RUNS) for (let i = 1; i < R.pts.length; i++) {
  const a = R.pts[i - 1], b = R.pts[i], pad = R.hw + 30;
  for (let bx = floor((Math.min(a[0], b[0]) - pad) / BK); bx <= floor((Math.max(a[0], b[0]) + pad) / BK); bx++)
    for (let by = floor((Math.min(a[1], b[1]) - pad) / BK); by <= floor((Math.max(a[1], b[1]) + pad) / BK); by++) {
      const k = bx * 4096 + by;
      if (!SEGS.has(k)) SEGS.set(k, []);
      SEGS.get(k).push([R.i, a[0], a[1], b[0], b[1]]);
    }
}
// The trail at a point -> [index | -1, edge (metres inside the edge; negative outside, -30 at most)]
export function trailAt(x, y) {
  const L = SEGS.get(floor(x / BK) * 4096 + floor(y / BK));
  let bi = -1, be = -30;
  if (!L) return [bi, be];
  for (const [i, ax, ay, bx, by] of L) {
    const [d2] = segD2(x, y, ax, ay, bx, by), hw = RUNS[i].hw;
    if (d2 > (hw + 30) * (hw + 30)) continue;
    const e = hw - sqrt(d2);
    if (e > be) { be = e; bi = i; }
  }
  return [be > 0 ? bi : -1, be];
}
// Lit at night (mountainGeo lights the lower lifts' trails)
const LIT = new Set(["compliance", "orientation", "quarterly-targets", "sandbox", "grace-period", "cool-down"]);

// ---- the park, the pipe, the big air ---------------------------------------------------------------------
// A kicker: lip at (x, y), facing d; ramp L long rising to H; a table T long at 0.9 H; a landing D long.
const mkKicker = (id, x, y, d, H, L, T, D, w, name) => ({ id, name, x: q(x), y: q(y), dx: q(d[0]), dy: q(d[1]), H, L, T, D, w });
export const KICKERS = PARK.features.filter(f => f.kind === "kicker").map((f, i) => { const [x, y] = toW([f.x, f.y]); return mkKicker(`k${i + 1}`, x, y, dirOf([0, 0], f.d), 2.2, 9, 7, 9, 9, ["THE ONBOARDING", "THE PROBATION", "THE REVIEW"][i]); });
// THE BIG AIR: one big kicker on QUARTERLY TARGETS' long even pitch (a blue, by the park)
export const BIG_AIR_AT = { run: "quarterly-targets", s: 700 };
{
  const R = RUN[BIG_AIR_AT.run], [x, y, dx, dy] = polyAt(R, BIG_AIR_AT.s);
  KICKERS.push(mkKicker("big", x, y, [dx, dy], 4.4, 15, 14, 20, 15, "THE BIG AIR"));
}
export const BIG_AIR = KICKERS[KICKERS.length - 1];
export const RAILS = PARK.features.filter(f => f.kind === "rail").map((f, i) => {
  const [x, y] = toW([f.x, f.y]), d = dirOf([0, 0], f.d), half = 13;
  const ax = q(x - d[0] * half), ay = q(y - d[1] * half), bx = q(x + d[0] * half), by = q(y + d[1] * half);
  return { id: `r${i + 1}`, name: ["THE PAPER RAIL", "THE RED TAPE", "THE PAYROLL BOX"][i], kind: i === 2 ? "box" : "rail", ax, ay, bx, by, dx: q(d[0]), dy: q(d[1]), len: half * 2, top: 0.9, col: f.col };
});
// THE PIPELINE: dug into the slope; flat bottom 2F wide, walls of radius R, decks beyond
const PA = toW(PARK.pipe.a), PB = toW(PARK.pipe.b);
export const PIPE = (() => {
  const dx = PB[0] - PA[0], dy = PB[1] - PA[1], len = sqrt(dx * dx + dy * dy);
  return { name: "THE PIPELINE", ax: PA[0], ay: PA[1], dx: q(dx / len), dy: q(dy / len), len: q(len), F: 4, R: 5.2, deck: 4, ramp: 28 };
})();
const PIPE_HW = PIPE.F + PIPE.R + PIPE.deck;
// local frame: s along the pipe, t across (+ to the pipe's right)
export const pipeLocal = (x, y) => { const rx = x - PIPE.ax, ry = y - PIPE.ay; return [rx * PIPE.dx + ry * PIPE.dy, rx * -PIPE.dy + ry * PIPE.dx]; };
function pipeDepth(s, t) {
  if (s < -2 || s > PIPE.len + 2) return 0;
  const at = t < 0 ? -t : t;
  if (at >= PIPE.F + PIPE.R) return 0;
  const end = Math.min(1, Math.max(0, Math.min(s / PIPE.ramp, (PIPE.len - s) / PIPE.ramp)));
  const D = PIPE.R * end;
  if (at <= PIPE.F) return -D;
  const u = at - PIPE.F, R = PIPE.R, cap = R * 0.985;
  // a quarter circle up the wall (capped near vertical), then straight to the deck
  const w = u < cap ? R - sqrt(R * R - u * u) : (R - sqrt(R * R - cap * cap)) + (u - cap) * ((R - (R - sqrt(R * R - cap * cap))) / (R - cap));
  return -D + Math.min(D, w * end);
}
export const inPipe = (x, y) => { const [s, t] = pipeLocal(x, y); return s > 0 && s < PIPE.len && t > -PIPE_HW && t < PIPE_HW; };
function kickerH(K, x, y) {
  const rx = x - K.x, ry = y - K.y, s = rx * K.dx + ry * K.dy, t = rx * -K.dy + ry * K.dx, at = t < 0 ? -t : t, hw = K.w / 2;
  if (s < -K.L || s > K.T + K.D || at > hw + 3) return 0;
  let h;
  if (s <= 0) { const u = (s + K.L) / K.L; h = K.H * u * u; }
  else if (s <= K.T) h = K.H * 0.9;
  else h = K.H * 0.9 * (1 - (s - K.T) / K.D);
  return at <= hw ? h : h * (1 - (at - hw) / 3);
}
function railRampH(Rl, x, y) {
  const rx = x - Rl.ax, ry = y - Rl.ay, s = rx * Rl.dx + ry * Rl.dy, t = rx * -Rl.dy + ry * Rl.dx, at = t < 0 ? -t : t;
  if (s < -6 || s > 0 || at > 2) return 0;
  const h = Rl.top * ((s + 6) / 6);
  return at <= 1 ? h : h * (2 - at);
}

// ---- the ground, by tiles -------------------------------------------------------------------------------
export const GS = 15, TILE = 32;
const NX = Math.ceil((W0.x1 - W0.x0) / GS) + 1, NY = Math.ceil((W0.y1 - W0.y0) / GS) + 1;
const TX = Math.ceil(NX / TILE), TY = Math.ceil(NY / TILE);
const TILES = new Array(TX * TY).fill(null);
// a tile: h (base ground, 1/64 m), trail (index+1, 0 none), edge (m, clamped), mog (moguls weight 0..1), lit
function tile(tx, ty) {
  const k = ty * TX + tx;
  let T = TILES[k];
  if (T) return T;
  const n = TILE * TILE, h = new Float64Array(n), trail = new Uint8Array(n), edge = new Int8Array(n), mog = new Float32Array(n), lit = new Uint8Array(n);
  for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) {
    const gx = tx * TILE + i, gy = ty * TILE + j, x = W0.x0 + gx * GS, y = W0.y0 + gy * GS, o = j * TILE + i;
    h[o] = qh(terrainH(x / CELL, y / CELL) * STOREY);
    const [ti, e] = trailAt(x, y);
    trail[o] = ti + 1;
    edge[o] = Math.max(-30, Math.min(120, Math.round(e)));
    if (ti >= 0) {
      const R = RUNS[ti];
      if (R.kind === "moguls") mog[o] = Math.min(1, Math.max(0, (e - 4) / 14));
      if (LIT.has(R.id)) lit[o] = 1;
    }
  }
  T = TILES[k] = { h, trail, edge, mog, lit };
  return T;
}
function sample(gx, gy) {
  gx = gx < 0 ? 0 : gx >= NX ? NX - 1 : gx; gy = gy < 0 ? 0 : gy >= NY ? NY - 1 : gy;
  const T = tile(floor(gx / TILE), floor(gy / TILE));
  return [T, (gy % TILE) * TILE + (gx % TILE)];
}
// The base ground (no moguls, no park): bilinear over the samples.
export function baseH(x, y) {
  const fx = (x - W0.x0) / GS, fy = (y - W0.y0) / GS, gx = floor(fx), gy = floor(fy), u = fx - gx, v = fy - gy;
  const [A, a] = sample(gx, gy), [B, b] = sample(gx + 1, gy), [C, c] = sample(gx, gy + 1), [D, d] = sample(gx + 1, gy + 1);
  return (A.h[a] * (1 - u) + B.h[b] * u) * (1 - v) + (C.h[c] * (1 - u) + D.h[d] * u) * v;
}
function mogW(x, y) {
  const fx = (x - W0.x0) / GS, fy = (y - W0.y0) / GS, gx = floor(fx), gy = floor(fy), u = fx - gx, v = fy - gy;
  const [A, a] = sample(gx, gy), [B, b] = sample(gx + 1, gy), [C, c] = sample(gx, gy + 1), [D, d] = sample(gx + 1, gy + 1);
  return (A.mog[a] * (1 - u) + B.mog[b] * u) * (1 - v) + (C.mog[c] * (1 - u) + D.mog[d] * u) * v;
}
// Moguls: a staggered field of bumps, MOG_L apart, MOG_A high (arithmetic: a squared parabola per axis)
export const MOG_L = 7, MOG_A = 0.85;
export function mogulBump(x, y) {
  const fy = y / MOG_L, row = floor(fy), py = fy - row, fx = x / MOG_L + (row & 1 ? 0.5 : 0), px = fx - floor(fx);
  const wx = 4 * px * (1 - px), wy = 4 * py * (1 - py);
  return wx * wx * wy * wy;
}
const KB = KICKERS.map(K => { const r = K.L + K.T + K.D + K.w; return [K.x - r, K.x + r, K.y - r, K.y + r]; });
const PIPE_BB = (() => { const ex = PIPE.ax + PIPE.dx * PIPE.len, ey = PIPE.ay + PIPE.dy * PIPE.len, p = PIPE_HW + 2; return [Math.min(PIPE.ax, ex) - p, Math.max(PIPE.ax, ex) + p, Math.min(PIPE.ay, ey) - p, Math.max(PIPE.ay, ey) + p]; })();
// The features on top of the ground: moguls, kickers, the pipe, the rails' ramps.
export function featH(x, y) {
  let f = 0;
  const mw = mogW(x, y);
  if (mw > 0.001) f += mw * MOG_A * mogulBump(x, y);
  for (let i = 0; i < KICKERS.length; i++) { const b = KB[i]; if (x > b[0] && x < b[1] && y > b[2] && y < b[3]) f += kickerH(KICKERS[i], x, y); }
  if (x > PIPE_BB[0] && x < PIPE_BB[1] && y > PIPE_BB[2] && y < PIPE_BB[3]) { const [s, t] = pipeLocal(x, y); f += pipeDepth(s, t); }
  for (const Rl of RAILS) f += railRampH(Rl, x, y);
  return f;
}
export const heightAt = (x, y) => baseH(x, y) + featH(x, y);
// The gradient (m/m), by central differences over E m.
const E = 0.6;
export function gradAt(x, y) {
  return [(heightAt(x + E, y) - heightAt(x - E, y)) / (2 * E), (heightAt(x, y + E) - heightAt(x, y - E)) / (2 * E)];
}
// The gradient behind a rider moving (vx, vy): one-sided, from where they came (so a lip's edge,
// just ahead, does not bend the ramp they are still on)
export function gradBack(x, y, vx, vy) {
  const h = heightAt(x, y), sx = vx >= 0 ? 1 : -1, sy = vy >= 0 ? 1 : -1;
  return [(h - heightAt(x - sx * E, y)) / (sx * E), (h - heightAt(x, y - sy * E)) / (sy * E)];
}
// The fall line, broadly (the base ground over +-span m): for the camera
export function fallAt(x, y, span = 45) {
  const gx = (baseH(x + span, y) - baseH(x - span, y)) / (2 * span), gy = (baseH(x, y + span) - baseH(x, y - span)) / (2 * span);
  return [-gx, -gy, sqrt(gx * gx + gy * gy)];
}
// The surface at a point -> {trail (RUNS index | -1), edge, lit}: nearest sample
export function surfaceAt(x, y) {
  const [T, o] = sample(Math.round((x - W0.x0) / GS), Math.round((y - W0.y0) / GS));
  return { trail: T.trail[o] - 1, edge: T.edge[o], lit: T.lit[o] === 1 };
}
// For the renderer: the sample grid (base ground and surface) at integer indices
export const GRID = { NX, NY, GS, x0: W0.x0, y0: W0.y0 };
export function gridIndex(gx, gy) { gx = gx < 0 ? 0 : gx >= NX ? NX - 1 : gx; gy = gy < 0 ? 0 : gy >= NY ? NY - 1 : gy; return [tile(floor(gx / TILE), floor(gy / TILE)), (gy % TILE) * TILE + (gx % TILE)]; }

// ---- the water: THE RETENTION POOL and THE BURNOUT --------------------------------------------------------
export const POOL = { name: TARN.name, x: q(TARN.x * CELL), y: q(TARN.y * CELL), rx: q(TARN.rx * CELL), ry: q(TARN.ry * CELL) };
export const BURNOUT = { name: MELT.name, ...poly(MELT.pts.map(p => toW([p.x, p.y]))), w: MELT.pts.map(p => q((p.w * CELL) / 2)) };
export function waterAt(x, y) {
  const ex = (x - POOL.x) / POOL.rx, ey = (y - POOL.y) / POOL.ry;
  if (ex * ex + ey * ey < 1) return "pool";
  const P = BURNOUT.pts;
  for (let i = 1; i < P.length; i++) {
    const [d2] = segD2(x, y, P[i - 1][0], P[i - 1][1], P[i][0], P[i][1]), w = (BURNOUT.w[i - 1] + BURNOUT.w[i]) / 2 * 0.6;
    if (d2 < w * w) return "stream";
  }
  return null;
}

// ---- the trees ---------------------------------------------------------------------------------------------
// The city's pines (mountainGeo.js PINES: one per ~80 m below the tree line) each stand for a stand of
// trees: up to five around it, none on a groomed trail; in the glades the pine itself, alone.
const TB = 60;
export const TREES = [];
export const TREE_BUCKETS = new Map();
{
  let n = 0;
  for (const [px, py, , s] of PINES) {
    const cx = px * CELL, cy = py * CELL, k = n++;
    const [ti] = trailAt(cx, cy);
    const glade = ti >= 0 && RUNS[ti].kind === "glades";
    const count = glade ? 1 : 4 + floor(h01(`ski|stand|${k}`) * 5);
    for (let j = 0; j < count; j++) {
      const ox = j ? (h01(`ski|tx|${k}|${j}`) - 0.5) * 70 : 0, oy = j ? (h01(`ski|ty|${k}|${j}`) - 0.5) * 70 : 0;
      const x = q(cx + ox), y = q(cy + oy);
      const [tj, e] = trailAt(x, y);
      if (tj >= 0 && RUNS[tj].kind !== "glades" && e > -2) continue;
      if (tj >= 0 && RUNS[tj].kind === "glades" && j) continue;
      if (waterAt(x, y)) continue;
      const t = { x, y, r: 1.6, s: q(s * (0.8 + h01(`ski|ts|${k}|${j}`) * 0.5)) };
      TREES.push(t);
      const bk = floor(x / TB) * 4096 + floor(y / TB);
      if (!TREE_BUCKETS.has(bk)) TREE_BUCKETS.set(bk, []);
      TREE_BUCKETS.get(bk).push(t);
    }
  }
}
// THE GLADES are trees whatever the height (the city's pines stop at its tree line): a stand every
// ~24 m through the trail, about a third of the spots
for (const R of RUNS) {
  if (R.kind !== "glades") continue;
  for (let s = 30; s < R.len - 20; s += 24) {
    const [cx, cy, dx, dy] = polyAt(R, s);
    for (let o = -R.hw + 8; o <= R.hw - 8; o += 24) {
      const k = `${R.id}|${s}|${o}`;
      if (h01(`ski|glade|${k}`) > 0.36) continue;
      const jx = (h01(`ski|gx|${k}`) - 0.5) * 16, jy = (h01(`ski|gy|${k}`) - 0.5) * 16;
      const x = q(cx - dy * o + jx), y = q(cy + dx * o + jy), [tj] = trailAt(x, y);
      if (tj >= 0 && RUNS[tj].kind !== "glades") continue;
      const t = { x, y, r: 1.6, s: q(0.75 + h01(`ski|gs|${k}`) * 0.5) };
      TREES.push(t);
      const bk = floor(x / TB) * 4096 + floor(y / TB);
      if (!TREE_BUCKETS.has(bk)) TREE_BUCKETS.set(bk, []);
      TREE_BUCKETS.get(bk).push(t);
    }
  }
}
export function treesNear(x, y) {
  const out = [], bx = floor(x / TB), by = floor(y / TB);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const L = TREE_BUCKETS.get((bx + i) * 4096 + by + j); if (L) for (const t of L) out.push(t); }
  return out;
}

// ---- the lifts, the lodges, the stations ---------------------------------------------------------------------
// In-game the lifts run brisk (the city's 120-170 cells a machine hour, as 13-18 m/s) and a held A
// runs the ride on at six times that.
export const LIFT_FF = 6;
export const LIFTS_W = LIFTS.map(L => {
  const [ax, ay] = toW(L.a), [bx, by] = toW(L.b), dx = bx - ax, dy = by - ay, len = q(sqrt(dx * dx + dy * dy));
  const d = [q(dx / len), q(dy / len)], speed = q((L.speed / 150) * 16), spacing = q(L.spacing * CELL);
  // the line: where a rider queues (in front of the foot station) and is put off at the top
  const load = [q(ax - d[0] * 0.9 * CELL), q(ay - d[1] * 0.9 * CELL)];
  // put off where the first trail from this lift's top begins (else just below the top station)
  const T0 = RUNS.find(R => R.from === L.id);
  const off = T0 ? (() => { const [x, y] = polyAt(T0, 8); return [q(x), q(y)]; })() : [q(bx - d[0] * 0.55 * CELL), q(by - d[1] * 0.55 * CELL)];
  return { id: L.id, name: L.name, sub: L.sub, kind: L.kind, ax, ay, bx, by, d, n: [q(L.n[0]), q(L.n[1])], len, speed, spacing, seats: L.seats, load, off, towers: L.towers.map(k => q(k)), rope: L.rope * STOREY * 0.55, gap: q(L.gap * CELL * 0.35) };
});
export const LIFT_W = Object.fromEntries(LIFTS_W.map(L => [L.id, L]));
export const LOAD_R = 22;
// A car every `spacing` m: the wait at the foot from tick t, and the ride, in ticks (60 Hz)
export const liftPeriod = (L) => Math.round((L.spacing / L.speed) * 60);
export const liftRideTicks = (L) => Math.round((L.len / L.speed) * 60);
export const liftWait = (L, t) => { const P = liftPeriod(L), ph = t % P; return ph === 0 ? 0 : P - ph; };

const boxW = (B, extra = {}) => ({ x0: q(B.x0 * CELL), y0: q(B.y0 * CELL), x1: q(B.x1 * CELL), y1: q(B.y1 * CELL), base: qh(B.base * STOREY), h: B.h * STOREY * 0.45, ...extra });
export const LODGES_W = Object.values(LODGES).map(B => boxW(B, { id: B.id, name: B.name, roof: B.roof, wall: B.wall }));
export const STATIONS_W = STATIONS.map(B => boxW(B, { id: `${B.lift}-${B.end}`, lift: B.lift, end: B.end, kind: B.kind, roof: B.kind === "gondola" ? "#334155" : "#475569", wall: "#64748b" }));
// at the foot: THE BASE LODGE's deck and the ski shop (Shaun White's, LICENCE 0001: nothing on sale yet)
export const BASE_LINE = q(-22.4 * CELL);
export const SHOP = { id: "shop", name: "SHAUN WHITE // BOARDS AND SKIS", note: "NOTHING ON SALE YET. THE SHELVES ARE BEING APPROVED.", x0: q(29 * CELL), y0: q(-22.6 * CELL), x1: q(31.2 * CELL), y1: q(-21.6 * CELL), base: 0, h: 5, roof: "#0f172a", wall: "#b45309" };
export const BASE_LODGE = { id: "base", name: "THE BASE LODGE", x0: q(42.6 * CELL), y0: q(-22.2 * CELL), x1: q(50 * CELL), y1: q(-21.2 * CELL), base: 0, h: 9, roof: "#7c2d12", wall: "#8a5a36" };
export const BLOCKS = [...LODGES_W, ...STATIONS_W, SHOP, BASE_LODGE];
// lift towers: obstacles (r m) under the rope
export const TOWERS = LIFTS_W.flatMap(L => L.towers.map(k => ({ x: q(L.ax + (L.bx - L.ax) * k), y: q(L.ay + (L.by - L.ay) * k), r: 1.4, lift: L.id })));

// ---- the race course ------------------------------------------------------------------------------------------
export const COURSE = RUN["the-gauntlet"];
// THE GAUNTLET's gates as the city sets them (mountainGeo.js GATES, giant slalom spacing), each a pair
// of poles across the line (cross between them), and a slalom set: twice as many, tighter.
// (the city's gates stand 33 m off the line, a speed event's set; the skiable set keeps them on the
// same side at the same places, 15 m off: the giant slalom a human can make)
export const GS_GATES = GATES.map((g, i) => { const [x0, y0] = toW([g.x, g.y]), near = polyNear(COURSE, x0, y0), [cx, cy] = polyAt(COURSE, near.s), x = q(cx + (x0 - cx) * 0.45), y = q(cy + (y0 - cy) * 0.45), n = [q(g.n[0]), q(g.n[1])], hw = 10; return { i, x, y, ax: q(x - n[0] * hw), ay: q(y - n[1] * hw), bx: q(x + n[0] * hw), by: q(y + n[1] * hw), col: g.col }; });
export const SL_GATES = (() => {
  const out = [];
  for (let s = 120, i = 0; s < COURSE.len - 50; s += 50, i++) {
    const [x, y, dx, dy] = polyAt(COURSE, s), side = i % 2 ? 1 : -1, o = 16 * side, cx = x - dy * o, cy = y + dx * o, hw = 7;
    out.push({ i, x: q(cx), y: q(cy), ax: q(cx + dy * hw), ay: q(cy - dx * hw), bx: q(cx - dy * hw), by: q(cy + dx * hw), col: i % 2 ? "#2563eb" : "#dc2626" });
  }
  return out;
})();
// the start hut: the course's high point in its first 120 m
export const RACE_START = (() => { let best = -1e9, bs = 0; for (let s = 0; s <= 120; s += 5) { const [x, y] = polyAt(COURSE, s), h = baseH(x, y); if (h > best) { best = h; bs = s; } } const [x, y, dx, dy] = polyAt(COURSE, bs); return [q(x), q(y), q(dx), q(dy)]; })();
void RACE_COURSE;

// ---- places to fast-travel to (found by passing near them) -----------------------------------------------------
// {id, name, kind, x, y}: the base, every lift's foot and top, the lodges, every trail's head, the peaks, the pool
export const POIS = (() => {
  const out = [{ id: "base", name: "THE BASE (THE VILLAGE'S FOOT)", kind: "base", x: q(36 * CELL), y: q(-23.2 * CELL) }];
  for (const L of LIFTS_W) {
    out.push({ id: `${L.id}@a`, name: `${L.name}: THE FOOT`, kind: "lift", lift: L.id, x: L.load[0], y: L.load[1] });
    out.push({ id: `${L.id}@b`, name: `${L.name}: THE TOP`, kind: "top", lift: L.id, x: L.off[0], y: L.off[1] });
  }
  for (const B of LODGES_W.filter(b => b.id !== "patrol")) out.push({ id: `lodge:${B.id}`, name: B.name, kind: "lodge", x: q((B.x0 + B.x1) / 2), y: q(B.y1 + 25) });
  for (const R of RUNS) { const [x, y] = polyAt(R, 20); out.push({ id: `trail:${R.id}`, name: R.name, kind: "trail", rating: R.rating, x: q(x), y: q(y) }); }
  for (const P of PEAKS) { const [x, y] = toW([P.x, P.y]); out.push({ id: `peak:${P.id}`, name: P.name, kind: "peak", x, y: q(y + 30) }); }
  out.push({ id: "pool", name: POOL.name, kind: "water", x: q(POOL.x + POOL.rx + 40), y: POOL.y });
  return out;
})();
export const POI = Object.fromEntries(POIS.map(p => [p.id, p]));
export const FIND_R = 85;

// ---- LOST PROPERTY: eight files the Department mislaid on the mountain ---------------------------------------------
export const FILES = [
  ["THE SUMMIT PATROL'S MISSING LOG", 41.6, -88.4],
  ["THE POOL'S DISCHARGE PERMIT", 3.2, -66.4],
  ["A PERFORMANCE REVIEW, UNREAD", 27.2, -76.6],
  ["THE REDACTED PAGE", 72.4, -66.2],
  ["THE MID-MOUNTAIN LODGE'S COCOA RATION", 33.4, -66.2],
  ["A RESIGNATION, UNSIGNED", 19.2, -84.4],
  ["THE PIPELINE'S PERMIT", 27.2, -31.2],
  ["THE NORTH FACE INCIDENT REPORT", 52, -100],
].map(([name, cx, cy], i) => { const [x, y] = toW([cx, cy]); return { i, name, x, y }; });
export const FILE_R = 9;

// Build every ground tile ahead of play (a few at a time, so the page stays responsive): the far view
// and the map read the whole mountain. -> a promise; onProgress(0..1)
export function warmTiles(onProgress = () => {}, budgetMs = 12) {
  return new Promise(resolve => {
    let k = 0;
    const run = () => {
      const t0 = Date.now();
      while (k < TX * TY && Date.now() - t0 < budgetMs) { tile(k % TX, Math.floor(k / TX)); k++; }
      onProgress(k / (TX * TY));
      if (k < TX * TY) setTimeout(run, 0); else resolve();
    };
    run();
  });
}
