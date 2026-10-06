// THE MOUNTAIN as the iso view builds it (Scott 2026-09-30: "mountains can be very tall;
// Killington is over 4,000 feet; many trails that wind and intersect, some much more difficult;
// some have slalom gates for competition; a lodge at the bottom; render the whole mountain up to
// the top; at least one lodge up there too"). Pure: the terrain, the trails, the lifts, the lodges,
// the race course's gates, the park, the guns and the cats, every skier's place at a machine
// moment. No DOM; scripts/check-mountain.mjs holds it together.
//
// SCALE. A storey is the city's (iso.STOREY): the Meridian is 14 of them. The summit stands 48
// storeys over the village (PEAK PERFORMANCE, 4,241 FT on the board; the village 1,165 FT: 3,076 FT
// of vertical, 64 feet a storey), the east peak 39, the west shoulder 30. The tree line is at 30.
//
// THE GROUND. One heightfield over the Heights' north (x 9-100, y -113 to -21): flat at the
// village's back, a gentle apron (THE SLOPES: the learners' ground), then the massif: a crest from
// the west shoulder (THE GLASS CEILING) over the summit (PEAK PERFORMANCE) and a col to the east
// peak (MIDDLE MANAGEMENT), three spurs running south off it, the bowl under the summit and the col,
// gullies across the faces, the north face falling away behind. The Alpine Line climbs a cut valley
// up x 54.5 to its SUMMIT station (its deck, its stations and its timetable are the PHASE 2 agent's
// and untouched: the ground under the deck stays under it, sim.js ALPINE_CREST).
//
// Coordinates are map cells; y is negative to the north; heights in storeys.

import { SEED, HEIGHTS_DY, weekdayOf } from "./sim.js";
import { MTN_Y, MOUNTAIN_SPOTS } from "./mountainSim.js";

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
export const h01 = (s) => fnv(s) / 4294967296;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const frac = (v) => ((v % 1) + 1) % 1;

// ---- the terrain --------------------------------------------------------------------------------
export const MTN = { x0: MTN_Y.west, x1: MTN_Y.east, y0: MTN_Y.top, y1: -11 + HEIGHTS_DY };
// THE SLOPES and the resort parcel keep the village's columns (x 9-100); above them the bands run
// wider, so the massif's flanks fall away naturally to the west and the east.
export const FRONT = { x0: 9, x1: 100 };
export const BASE_Y = MTN.y1;               // the foot: the village's back row (-21)
export const SLOPES_TOP = MTN_Y.slopesTop;  // THE SLOPES' north edge (-40.5)
export const TREELINE = 30;                 // storeys: pines below, snow and rock above
export const FT = { base: 1165, perStorey: 64 };
export const feetAt = (h) => Math.round((FT.base + h * FT.perStorey) / 10) * 10;
// The crest and the spurs: [x, y, h] skeletons; the ground falls away from them at 0.9 storeys a cell.
const SPINES = [
  [[13, -71, 11], [19, -82, 30], [31, -89, 39], [46, -93, 48], [62, -90, 36], [79, -88, 41], [89, -82, 27], [95, -74, 12]],
  [[46, -93, 48], [45, -84, 41], [42, -71, 30], [38, -58, 19], [35, -47, 10]],
  [[79, -88, 41], [80, -76, 29], [78, -61, 17], [75, -49, 9]],
  [[19, -82, 30], [22, -70, 23], [24, -62, 20], [18, -50, 9]],
];
export const RIDGES = SPINES;
const SEGS = SPINES.flatMap(p => p.slice(1).map((b, i) => [p[i], b]));
// the hollows: the bowl under the summit and the col, the west cirque
const BOWLS = [[60, -76, 9, 4.5], [31, -77, 6, 2.5]];
export const PEAKS = [
  { id: "summit", name: "PEAK PERFORMANCE", x: 46, y: -93 },
  { id: "east", name: "MIDDLE MANAGEMENT", x: 79, y: -88 },
  { id: "west", name: "THE GLASS CEILING", x: 19, y: -82 },
];
let RIDGE_D = 0;   // the last mass() call's distance to the nearest ridge line (the gullies fade near a crest)
function mass(x, y) {
  let m = -1e9, dm = Infinity;
  for (const [a, b] of SEGS) {
    const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy;
    const t = clamp(((x - a[0]) * vx + (y - a[1]) * vy) / L2, 0, 1);
    const d = Math.hypot(x - a[0] - vx * t, y - a[1] - vy * t), h = a[2] + (b[2] - a[2]) * t;
    if (h - 0.9 * d > m) m = h - 0.9 * d;
    if (d < dm) dm = d;
  }
  RIDGE_D = dm;
  return m;
}
// THE ALPINE LINE's cut (sim.js: the deck rises from y -21 over ALPINE_RAMP 9 rows to ALPINE_CREST,
// level on to the SUMMIT terminal at y -39.8): the ground under the deck at most CUT below its base.
export const ALPINE = { x: 54.5, crest: 3.9, ramp: 9, end: -39.8, cut: 0.35 };
const alpineBase = (y) => ALPINE.crest * clamp((BASE_Y - y) / ALPINE.ramp, 0, 1);
function cutCap(x, y) {
  const dx = Math.abs(x - ALPINE.x);
  if (dx > 14 || y < ALPINE.end - 9) return Infinity;
  return alpineBase(y) - ALPINE.cut + Math.max(0, dx - 2.6) * 0.75 + Math.max(0, ALPINE.end - 1.6 - y) * 1.6;
}
function rawH(x, y) {
  const d = BASE_Y - y;
  // the apron: the slopes' gentle rise, the mountain's broad base under the massif, falling away behind it
  const apron = 5 * smooth(0, 19, d) + 0.16 * Math.min(Math.max(0, d - 19), 50) * (1 - smooth(76, 102, d));
  let m = Math.max(0, mass(x, y) - apron + 2) * smooth(13, 26, d);
  for (const [bx, by, r, dep] of BOWLS) { const q = Math.hypot((x - bx) / r, (y - by) / (r * 0.8)); if (q < 1) m -= dep * (1 - q * q) * (1 - q * q) * smooth(0, 8, m); }
  const n = Math.sin(x * 0.37 + y * 0.11) * Math.sin(y * 0.29 - x * 0.07) + 0.45 * Math.sin(x * 0.83 - y * 0.61);
  m += n * Math.min(1.8, Math.max(0, m) * 0.07) * smooth(0.6, 4, RIDGE_D);
  let h = apron + Math.max(0, m);
  // the edges: the massif eases down to nothing at the district's edge (wide flanks above the slopes)
  const s = smooth(-40.2, -48, y), xL = FRONT.x0 + (MTN.x0 - FRONT.x0) * s, xR = FRONT.x1 + (MTN.x1 - FRONT.x1) * s, w = 11 + 9 * s;
  h *= Math.min(smooth(xL - 0.5, xL + w, x), smooth(xR + 0.5, xR - w, x), smooth(MTN.y0 - 0.5, MTN.y0 + 22, y));
  return Math.min(h, cutCap(x, y));
}
// The graded sites: the ground levelled (a bench cut and filled) under the lodges, the gondola's
// stations and THE UPPER BASE. [cx, cy, rx, ry]: level inside, eased back to the slope over 3 cells.
// (and THE RETENTION POOL, the river's mountain lake: river.js TARN, its water at the bench's level)
const PADS = [[46.6, -86.4, 6.8, 3], [30.2, -64.4, 4.8, 3], [46.4, -45.8, 6, 2.8, 6.8], [5.4, -69.4, 3.0, 2.1]].map(([x, y, rx, ry, h]) => ({ x, y, rx, ry, h: h ?? rawH(x, y) }));
const EASE = 2.5;
// Is a point on a graded site or its banks? (the banks are cut snow, not rock)
export const onPad = (x, y) => PADS.some(P => Math.hypot((x - P.x) / P.rx, (y - P.y) / P.ry) < 1 + (EASE + 0.8) / Math.min(P.rx, P.ry));
export function terrainH(x, y) {
  if (x < MTN.x0 || x > MTN.x1 || y < MTN.y0 || y > MTN.y1) return 0;
  let h = rawH(x, y);
  for (const P of PADS) {
    const q = Math.hypot((x - P.x) / P.rx, (y - P.y) / P.ry);
    const out = 1 + EASE / Math.min(P.rx, P.ry);
    if (q < out) { const w = 1 - smooth(1, out, q); h = h + (P.h - h) * w; }
  }
  return Math.max(0, h);
}
export const onMountain = (x, y) => x >= MTN.x0 && x <= MTN.x1 && y >= MTN.y0 && y <= MTN.y1;
// The gradient (storeys a cell) and how steep it is.
export function slopeAt(x, y, e = 0.35) {
  const gx = (terrainH(x + e, y) - terrainH(x - e, y)) / (2 * e), gy = (terrainH(x, y + e) - terrainH(x, y - e)) / (2 * e);
  return [gx, gy, Math.hypot(gx, gy)];
}
for (const p of PEAKS) p.h = terrainH(p.x, p.y);
export const SUMMIT_H = PEAKS[0].h;
// The highest ground in a rect (the tap box of a band; the camera's fit).
export function maxIn(r, step = 1) {
  let m = 0;
  for (let x = r.x; x <= r.x + r.w + 1e-9; x += step) for (let y = r.y; y <= r.y + r.h + 1e-9; y += step) m = Math.max(m, terrainH(Math.min(x, r.x + r.w), Math.min(y, r.y + r.h)));
  return m;
}

// ---- polylines ------------------------------------------------------------------------------------
export const segLen = (pts) => { let n = 0; for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return n; };
// -> [x, y, dx, dy] at fraction k of the way along
export function along(pts, k, L = segLen(pts)) {
  let want = L * clamp(k, 0, 1);
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], d = Math.hypot(bx - ax, by - ay);
    if (want <= d || i === pts.length - 1) { const f = d ? clamp(want / d, 0, 1) : 1; return [ax + (bx - ax) * f, ay + (by - ay) * f, (bx - ax) / (d || 1), (by - ay) / (d || 1)]; }
    want -= d;
  }
  return [...pts[pts.length - 1], 0, 1];
}
export function distTo(x, y, pts) {
  let best = Infinity, at = 0, run = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1e-9, t = clamp(((x - ax) * vx + (y - ay) * vy) / L2, 0, 1);
    const d = Math.hypot(x - ax - vx * t, y - ay - vy * t), l = Math.sqrt(L2);
    if (d < best) { best = d; at = run + t * l; }
    run += l;
  }
  return [best, at];
}
// A Catmull-Rom through the control points, sampled every ~0.6 cells.
function spline(ctrl, step = 0.6) {
  const P = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]], out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

// ---- the lifts ------------------------------------------------------------------------------------
// A lift runs straight from its foot (a) to its top (b): chairs (or cabins) up one side of the
// haul rope, down the other, spaced `spacing` cells, at `speed` cells a machine hour. The rope rides
// `rope` storeys over the ground on towers every few cells. Open hours by kind (lights on the
// lower lifts for night skiing).
export const LIFTS = [
  { id: "ascent", name: "THE ASCENT", sub: "GONDOLA TO THE SUMMIT, BY THE UPPER BASE", kind: "gondola", a: [41, -23.6], b: [51.4, -86], mid: 0.343, speed: 170, spacing: 3.4, rope: 2.6, gap: 0.45, seats: 8, open: [8.5, 16.5] },
  { id: "induction", name: "THE INDUCTION", sub: "THE LEARNERS' CHAIR", kind: "chair", a: [14.5, -23.6], b: [16, -37.2], speed: 120, spacing: 1.6, rope: 1.4, gap: 0.3, seats: 2, open: [8.5, 21] },
  { id: "compliance", name: "THE COMPLIANCE EXPRESS", sub: "QUAD TO THE MID-MOUNTAIN LODGE", kind: "chair", a: [27, -23.6], b: [26.2, -62.4], speed: 150, spacing: 1.7, rope: 1.5, gap: 0.32, seats: 4, open: [8.5, 21] },
  { id: "gate", name: "THE STARTING GATE", sub: "THE RACE COURSE'S CHAIR", kind: "chair", a: [35.6, -45.2], b: [34.2, -57.4], speed: 120, spacing: 1.6, rope: 1.4, gap: 0.3, seats: 2, open: [8.5, 16.5] },
  { id: "promotion", name: "THE PROMOTION", sub: "QUAD TO MIDDLE MANAGEMENT", kind: "chair", a: [47.4, -46.2], b: [78, -84.4], speed: 150, spacing: 1.7, rope: 1.6, gap: 0.32, seats: 4, open: [8.5, 16.5] },
  { id: "escalation", name: "THE ESCALATION", sub: "OUT OF THE BOWL TO THE COL", kind: "chair", a: [59.6, -73.8], b: [61, -90.6], speed: 130, spacing: 1.7, rope: 1.6, gap: 0.3, seats: 3, open: [8.5, 16] },
  { id: "headcount", name: "THE HEADCOUNT", sub: "TO THE GLASS CEILING", kind: "chair", a: [21.6, -67.2], b: [19.6, -80.2], speed: 120, spacing: 1.6, rope: 1.5, gap: 0.3, seats: 2, open: [8.5, 16] },
];
for (const L of LIFTS) {
  const dx = L.b[0] - L.a[0], dy = L.b[1] - L.a[1], len = Math.hypot(dx, dy);
  Object.assign(L, { len, d: [dx / len, dy / len], n: [-dy / len, dx / len] });
  L.loop = 2 * len;
  L.cars = Math.floor(L.loop / L.spacing);
  const nt = Math.max(2, Math.round(len / (L.kind === "gondola" ? 5 : 3.4)));
  L.towers = Array.from({ length: nt - 1 }, (_, i) => (i + 1) / nt);
}
export const LIFT = Object.fromEntries(LIFTS.map(L => [L.id, L]));
export const liftOpen = (L, hour) => hour >= L.open[0] && hour < L.open[1];
// The rope's height over the ground at fraction k of the line (towers carry it; the ends sit in the stations).
export function ropeH(L, k) {
  if (!L.ropeT) L.ropeT = Array.from({ length: 129 }, (_, i) => terrainH(L.a[0] + (L.b[0] - L.a[0]) * i / 128, L.a[1] + (L.b[1] - L.a[1]) * i / 128) + L.rope);
  const q = clamp(k, 0, 1) * 128, i = Math.min(127, Math.floor(q)), f = q - i;
  return L.ropeT[i] + (L.ropeT[i + 1] - L.ropeT[i]) * f;
}
// Car i of a lift at machine time mt: where on the loop (up the n side, down the other).
// A stopped lift (out of hours) parks its cars where they were at closing.
export function liftCar(L, i, mt) {
  const hour = ((mt % 24) + 24) % 24, day = Math.floor(mt / 24);
  const run = liftOpen(L, hour) ? mt : hour >= L.open[1] ? day * 24 + L.open[1] : (day - 1) * 24 + L.open[1];
  const s = frac((i / L.cars) + (run * L.speed) / L.loop) * L.loop;
  const up = s < L.len, k = up ? s / L.len : 1 - (s - L.len) / L.len, side = up ? 1 : -1;
  const x = L.a[0] + (L.b[0] - L.a[0]) * k + L.n[0] * L.gap * side, y = L.a[1] + (L.b[1] - L.a[1]) * k + L.n[1] * L.gap * side;
  return { x, y, k, up, h: ropeH(L, k) - (L.kind === "gondola" ? 1.05 : 0.95) };
}
// A rider boarding at machine time t rides the next car up: -> {at (boarding time), dur}
export function liftRide(L, t) {
  const per = L.spacing / L.speed;   // a car every `per` machine hours
  const ph = frac((t * L.speed) / L.loop * L.cars);   // where the cars are in their spacing
  const wait = (1 - ph) * per;
  return { at: t + (ph ? wait : 0), dur: L.len / L.speed };
}

// ---- the lodges and the stations -------------------------------------------------------------------
// Boxes in map cells standing on the ground's mean height under them (a platform evens the slope).
// THE BASE LODGE is the village's own building (sim.js the-lodge); its deck, the ticket office and
// the results board stand at the foot of the slopes.
const box = (cx, cy, w, d, h, extra = {}) => ({ x0: cx - w / 2, y0: cy - d / 2, x1: cx + w / 2, y1: cy + d / 2, cx, cy, h, ...extra });
export const LODGES = {
  mid: box(30.2, -64.6, 6.4, 3.4, 2.6, { id: "mid", name: "THE MID-MOUNTAIN LODGE", building: "the-mid-lodge", roof: "#7c2d12", wall: "#8a5a36", deck: "s" }),
  summit: box(47.2, -86.4, 7.2, 3.2, 3.2, { id: "summit", name: "THE SUMMIT LODGE", building: "the-summit-lodge", roof: "#334155", wall: "#6b4a2e", deck: "s", glass: true }),
  patrol: box(41.6, -86.6, 2.2, 1.6, 1.2, { id: "patrol", name: "SUMMIT PATROL", building: "the-summit-lodge", roof: "#b91c1c", wall: "#7f1d1d", cross: true }),
};
for (const L of Object.values(LODGES)) {
  let s = 0, n = 0, lo = Infinity, hi = 0;
  for (let x = L.x0; x <= L.x1 + 1e-9; x += (L.x1 - L.x0) / 4) for (let y = L.y0; y <= L.y1 + 1e-9; y += (L.y1 - L.y0) / 4) { const h = terrainH(x, y); s += h; n++; lo = Math.min(lo, h); hi = Math.max(hi, h); }
  L.base = s / n; L.lo = lo; L.hi = hi;
}
// The lifts' stations: a hut at each end (the gondola's a hall), set on the ground's mean.
export const STATIONS = LIFTS.flatMap(L => [...(L.mid ? ["mid"] : []), "a", "b"].map(end => {
  if (end === "mid") {
    const cx = L.a[0] + (L.b[0] - L.a[0]) * L.mid, cy = L.a[1] + (L.b[1] - L.a[1]) * L.mid, B = box(cx, cy, 2.4, 2.4, 1.5, { lift: L.id, end, kind: L.kind });
    B.base = Math.max(terrainH(B.x0, B.y0), terrainH(B.x1, B.y0), terrainH(B.x0, B.y1), terrainH(B.x1, B.y1), terrainH(cx, cy)) - 0.15;
    return B;
  }
  const [x, y] = L[end], back = end === "a" ? -1 : 1, g = L.kind === "gondola";
  const cx = x + L.d[0] * back * (g ? 1.1 : 0.7), cy = y + L.d[1] * back * (g ? 1.1 : 0.7);
  const w = g ? 2.6 : 1.5, d = g ? 2.2 : 1.1, B = box(cx, cy, w, d, g ? 1.6 : 0.9, { lift: L.id, end, kind: L.kind });
  B.base = Math.max(terrainH(B.x0, B.y0), terrainH(B.x1, B.y0), terrainH(B.x0, B.y1), terrainH(B.x1, B.y1), terrainH(cx, cy)) - 0.15;
  return B;
}));

// ---- the trails ----------------------------------------------------------------------------------
// Rated as the resorts rate them: GREEN CIRCLE, BLUE SQUARE, BLACK DIAMOND, DOUBLE BLACK. Named by
// the Department. Each runs from a lift's top (or off another trail) down to a lift's foot, the
// base, or into another trail; `ctrl` are its control points (a Catmull-Rom through them, so the
// greens wind). kind: groomed | moguls | glades (through the pines, thinned) | park | race | cat.
export const RATING = {
  green: { name: "GREEN CIRCLE", short: "EASIEST", ink: "#16a34a", skill: 0 },
  blue: { name: "BLUE SQUARE", short: "MORE DIFFICULT", ink: "#2563eb", skill: 40 },
  black: { name: "BLACK DIAMOND", short: "MOST DIFFICULT", ink: "#111827", skill: 62 },
  double: { name: "DOUBLE BLACK DIAMOND", short: "EXPERTS ONLY", ink: "#000000", skill: 78 },
};
export const RATINGS = ["green", "blue", "black", "double"];
const TRAIL_DEFS = [
  // the greens: the learners' and the long way down
  { id: "compliance", name: "COMPLIANCE", rating: "green", kind: "groomed", from: "compliance", to: "base", ctrl: [[25.4, -61.5], [22.8, -57.8], [24.6, -53.6], [22.4, -49.6], [24.2, -45.4], [20.4, -41.6], [22.4, -35.6], [19, -30.6], [21.2, -26.6], [20.4, -23.8]] },
  { id: "orientation", name: "ORIENTATION", rating: "green", kind: "groomed", from: "induction", to: "base", ctrl: [[15.4, -36.4], [11.8, -32.5], [15.6, -29], [12.2, -26], [13, -23.8]] },
  { id: "paper-trail", name: "THE PAPER TRAIL", rating: "green", kind: "cat", from: "ascent", to: "trail:compliance", ctrl: [[50.6, -84.6], [55.5, -84], [52, -81.5], [43.5, -80.5], [37, -76.5], [33.5, -70.5], [27.5, -66.5], [24.2, -60.5]] },
  { id: "grace-period", name: "THE GRACE PERIOD", rating: "green", kind: "groomed", from: "promotion@a", to: "base", ctrl: [[48.2, -45.2], [50, -40.6], [46.8, -35.6], [48.6, -30], [45.6, -23.8]] },
  { id: "cool-down", name: "THE COOL-DOWN", rating: "green", kind: "groomed", from: "race", to: "base", ctrl: [[39.2, -45.6], [40.4, -41.5], [37.8, -37], [39.6, -31], [37.8, -23.8]] },
  // the blues
  { id: "performance-review", name: "THE PERFORMANCE REVIEW", rating: "blue", kind: "groomed", from: "ascent", to: "headcount@a", ctrl: [[48.8, -84.8], [44, -83.6], [40.6, -82.4], [36.4, -80.4], [31.4, -78.4], [27, -74.2], [23.6, -68.6]] },
  { id: "quarterly-targets", name: "QUARTERLY TARGETS", rating: "blue", kind: "groomed", from: "compliance", to: "base", ctrl: [[27.4, -61.8], [31.6, -57], [29, -51.5], [32.4, -46], [29.6, -40.5], [33.6, -34], [31.8, -28.5], [34, -23.8]] },
  { id: "mandatory-fun", name: "MANDATORY FUN", rating: "blue", kind: "groomed", from: "promotion", to: "escalation@a", ctrl: [[76.6, -83.6], [72.5, -79.5], [70, -76], [65, -73.6], [60.8, -73.2]] },
  { id: "open-door", name: "OPEN DOOR POLICY", rating: "blue", kind: "groomed", from: "escalation@a", to: "promotion@a", ctrl: [[60.4, -72.6], [63.8, -66.5], [61.2, -60.5], [63.6, -54.6], [58.6, -49.6], [52.6, -47.4], [48.8, -46.6]] },
  { id: "core-competency", name: "CORE COMPETENCY", rating: "blue", kind: "groomed", from: "headcount", to: "headcount@a", ctrl: [[20.4, -79.4], [21.6, -77.6], [24.6, -75.2], [24, -71.4], [22.6, -68.6]] },
  { id: "long-memo", name: "THE LONG MEMO", rating: "blue", kind: "groomed", from: "escalation", to: "escalation@a", ctrl: [[62.4, -89.6], [67.6, -85.4], [66, -79.5], [62.6, -76], [60.6, -74.6]] },
  { id: "sandbox", name: "THE SANDBOX (TERRAIN PARK)", rating: "blue", kind: "park", from: "induction", to: "base", ctrl: [[16.8, -36.2], [19.6, -32.2], [20.4, -28], [21.6, -23.8]] },
  // the blacks
  { id: "the-audit", name: "THE AUDIT", rating: "black", kind: "groomed", from: "ascent", to: "gate", ctrl: [[49.2, -84.4], [46.4, -82.6], [45.4, -80.4], [43.6, -76], [41.6, -68.5], [38.6, -61.5], [37, -58]] },
  { id: "hostile-takeover", name: "HOSTILE TAKEOVER", rating: "black", kind: "moguls", from: "promotion", to: "promotion@a", ctrl: [[78.8, -83.2], [80.6, -76], [78.6, -67], [74.6, -58], [68.6, -51.6], [60, -48.6], [49, -47.2]] },
  { id: "downsizing", name: "DOWNSIZING", rating: "black", kind: "groomed", from: "escalation", to: "escalation@a", ctrl: [[60.2, -89.4], [58.2, -85.6], [57.6, -80.4], [58.8, -75.2]] },
  { id: "zero-tolerance", name: "ZERO TOLERANCE", rating: "black", kind: "moguls", from: "headcount", to: "trail:orientation", ctrl: [[19, -79.6], [17.4, -75.8], [14.8, -71], [13.2, -65.4], [12.6, -58], [13.4, -50], [12.4, -42], [12.6, -36]] },
  { id: "redacted-woods", name: "THE REDACTED WOODS", rating: "black", kind: "glades", from: "promotion", to: "trail:open-door", ctrl: [[77.4, -84], [74, -77], [73.6, -68.5], [69.6, -61], [63.4, -57.6]] },
  { id: "the-gauntlet", name: "THE GAUNTLET (RACE COURSE)", rating: "black", kind: "race", from: "gate", to: "race", ctrl: [[35.8, -57.6], [37.4, -54.6], [36.6, -51.6], [38.4, -48.8], [39.4, -46.4]] },
  // the double blacks
  { id: "termination-glades", name: "TERMINATION GLADES", rating: "double", kind: "glades", from: "promotion", to: "promotion@a", ctrl: [[79.2, -84.6], [86, -78], [89, -68], [85.6, -58], [77.6, -51], [67.2, -47.6], [58, -46.2], [49.2, -45.8]] },
  { id: "exit-interview", name: "EXIT INTERVIEW", rating: "double", kind: "groomed", from: "ascent", to: "escalation@a", ctrl: [[50.6, -84.8], [52.4, -81.6], [53.4, -77.8], [56, -75.2], [58.6, -74.4]] },
  { id: "non-compliance", name: "NON-COMPLIANCE CHUTES", rating: "double", kind: "moguls", from: "headcount", to: "trail:zero-tolerance", ctrl: [[18.8, -81.4], [15.6, -80], [13.2, -77.4], [11.6, -72.6], [11.6, -66.4], [12.6, -61.6]] },
];
// THE GAUNTLET's start and finish (the race course: race.js times it, the gates are below).
export const RACE_COURSE = { start: [35.8, -57.6], finish: [39.4, -46.4] };
export const TRAILS = [];
for (const D of TRAIL_DEFS) {
  const ctrl = D.ctrl.map(p => p.slice());
  const pts = spline(ctrl);
  TRAILS.push({ ...D, pts, len: segLen(pts) });
}
export const TRAIL = Object.fromEntries(TRAILS.map(T => [T.id, T]));
// (each trail's ground heights, once: the painter and the skiers read them)
// Where each trail ends: a lift's foot, the base, or another trail (snapped to its nearest point).
for (const T of TRAILS) {
  if (T.to.startsWith("trail:")) {
    const U = TRAIL[T.to.slice(6)], [x, y] = T.pts[T.pts.length - 1], [, at] = distTo(x, y, U.pts);
    T.join = { trail: U.id, at };
    const q = along(U.pts, at / U.len, U.len);
    T.pts[T.pts.length - 1] = [q[0], q[1]];
    T.len = segLen(T.pts);
  }
  const [sx, sy, dx, dy] = along(T.pts, 0.04, T.len);
  T.sign = [sx - dy * 1.6, sy + dx * 1.6];
  T.hs = T.pts.map(([x, y]) => terrainH(x, y));
}
// The lifts' towers stand between the trails: a tower that would stand on one moves along the
// line to clear ground (or is left out).
for (const L of LIFTS) {
  const clearAt = (k) => { const x = L.a[0] + (L.b[0] - L.a[0]) * k, y = L.a[1] + (L.b[1] - L.a[1]) * k; return TRAILS.every(T => distTo(x, y, T.pts)[0] > TRAIL_W(T) / 2 + 0.5); };
  L.towers = L.towers.map(k => { for (const d of [0, 0.015, -0.015, 0.03, -0.03, 0.045, -0.045, 0.06, -0.06]) if (k + d > 0.04 && k + d < 0.96 && clearAt(k + d)) return k + d; return null; }).filter(k => k != null);
}
// The race course's gates: alternating red and blue down THE GAUNTLET, every 2.1 cells.
export const GATES = (() => {
  const T = TRAIL["the-gauntlet"], out = [];
  for (let s = 1.8, i = 0; s < T.len - 1.4; s += 2.1, i++) {
    const [x, y, dx, dy] = along(T.pts, s / T.len, T.len), side = i % 2 ? 1 : -1;
    out.push({ i, x: x - dy * 0.55 * side, y: y + dx * 0.55 * side, n: [-dy, dx], col: i % 2 ? "#2563eb" : "#dc2626" });
  }
  return out;
})();
{ const T = TRAIL["the-gauntlet"], [, , dx, dy] = along(T.pts, 0.99, T.len); RACE_COURSE.finishN = [-dy, dx]; RACE_COURSE.len = T.len; RACE_COURSE.drop = terrainH(...RACE_COURSE.start) - terrainH(...RACE_COURSE.finish); }
// THE SANDBOX: kickers and rails down the park trail, THE PIPELINE beside it.
export const PARK = (() => {
  const T = TRAIL.sandbox, features = [];
  [0.18, 0.42, 0.66].forEach((k, i) => { const [x, y, dx, dy] = along(T.pts, k, T.len); features.push({ kind: "kicker", x: x - dy * 0.3, y: y + dx * 0.3, d: [dx, dy] }); void i; });
  [0.3, 0.55, 0.8].forEach((k, i) => { const [x, y, dx, dy] = along(T.pts, k, T.len), o = i % 2 ? 0.8 : -0.8; features.push({ kind: "rail", x: x - dy * o, y: y + dx * o, d: [dx, dy], col: ["#f97316", "#22d3ee", "#facc15"][i] }); });
  const a = [24.4, -35.4], b = [25, -26.6], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  features.push({ kind: "pipe", x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, a, b, n: [-(b[1] - a[1]) / len, (b[0] - a[0]) / len], d: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] });
  return { trail: "sandbox", features, pipe: { a, b } };
})();
// The snow guns: along the lower trails, blowing at night and in the early morning.
export const GUNS = (() => {
  const out = [];
  for (const [id, ks] of [["compliance", [0.55, 0.7, 0.85]], ["quarterly-targets", [0.5, 0.68, 0.86]], ["grace-period", [0.3, 0.6, 0.85]], ["orientation", [0.4, 0.8]]]) {
    const T = TRAIL[id];
    for (const k of ks) { const [x, y, dx, dy] = along(T.pts, k, T.len), o = (TRAIL_W(T) / 2 + 0.5) * (k * 10 % 2 < 1 ? 1 : -1); out.push({ x: x - dy * o, y: y + dx * o, w: [dy * Math.sign(o), -dx * Math.sign(o)].map(v => v * 0.7 + 0.3 * (v > 0 ? 1 : -1) * 0.2), trail: id }); }
  }
  return out;
})();
function TRAIL_W(T) { return T.w || { green: 2.2, blue: 2.4, black: 2.1, double: 1.7 }[T.rating]; }
// The results boards: at the finish, and at the foot by the gondola.
export const BOARDS = [{ id: "finish", x: 44.2, y: -46.6 }, { id: "base", x: 36.2, y: -22.6 }];

// The pines: a jittered grid below the tree line (thinner near it), off the groomed trails (thinned
// in the glades), the lift lines, the stations, the lodges, the park, the Alpine Line's cut, the base.
const nearTrail = (x, y) => {
  let best = Infinity, glade = false;
  for (const T of TRAILS) {
    const [d] = distTo(x, y, T.pts), w = TRAIL_W(T) / 2 + 0.55;
    if (d - w < best) { best = d - w; glade = T.kind === "glades"; }
  }
  return [best, glade];
};
export const PINES = (() => {
  const out = [], S = 1.35;
  for (let gx = MTN.x0 + 0.6; gx < MTN.x1 - 0.4; gx += S) for (let gy = MTN.y0 + 0.6; gy < MTN.y1 - 2.4; gy += S) {
    const x = gx + (h01(`pine|${gx}|${gy}|x`) - 0.5) * S * 0.9, y = gy + (h01(`pine|${gx}|${gy}|y`) - 0.5) * S * 0.9;
    const h = terrainH(x, y), edge = TREELINE + (Math.sin(x * 0.41 + y * 0.23) + Math.sin(x * 0.13 - y * 0.37)) * 1.6;
    if (h >= edge || h < 0.3) continue;
    const r = h01(`pine|${gx}|${gy}|k`);
    if (r > 0.92 - Math.max(0, (h - edge + 6) / 6) * 0.6) continue;   // thinner towards the tree line
    const [, , st] = slopeAt(x, y);
    if (st > 2.3) continue;   // not on the rock
    const [dt, glade] = nearTrail(x, y);
    if (dt < 0 && !(glade && r < 0.3)) continue;
    if (LIFTS.some(L => { const [d, at] = distTo(x, y, [L.a, L.b]); return d < (L.kind === "gondola" ? 1.6 : 1.1) && at > -1; })) continue;
    if (STATIONS.some(B => x > B.x0 - 1 && x < B.x1 + 1 && y > B.y0 - 1 && y < B.y1 + 1)) continue;
    if (Object.values(LODGES).some(B => x > B.x0 - 1.8 && x < B.x1 + 1.8 && y > B.y0 - 1.8 && y < B.y1 + 1.8)) continue;
    if (Math.abs(x - ALPINE.x) < 3.2 && y > ALPINE.end - 2) continue;
    if (Math.hypot(x - (PARK.pipe.a[0] + PARK.pipe.b[0]) / 2, (y - (PARK.pipe.a[1] + PARK.pipe.b[1]) / 2) * 0.45) < 2.6) continue;
    if (BOARDS.some(b => Math.hypot(x - b.x, y - b.y) < 1.6)) continue;
    if (Object.values(MOUNTAIN_SPOTS).some(R => x > R.x - 0.8 && x < R.x + R.w + 0.8 && y > R.y - 0.8 && y < R.y + R.h + 0.8)) continue;
    out.push([x, y, h, 0.75 + h01(`pine|${gx}|${gy}|s`) * 0.5]);
  }
  return out;
})();

// ---- weather, hours and status ------------------------------------------------------------------------
// A machine day's weather, the same for every viewer: CLEAR, FRESH SNOW, WIND (the gondola and the
// summit chairs on hold), WHITEOUT (the upper mountain closed), COLD (the guns run all night).
export const WEATHERS = ["CLEAR", "CLEAR", "FRESH SNOW", "CLEAR", "WIND", "COLD", "FRESH SNOW", "CLEAR", "WHITEOUT", "COLD"];
export const weatherOn = (day) => WEATHERS[fnv(`${SEED}|mtnwx|${day}`) % WEATHERS.length];
const UPPER = new Set(["ascent", "escalation", "headcount", "promotion"]);
const WIND_HOLD = new Set(["ascent", "escalation", "headcount"]);
// Is a lift running at machine time mt? -> {open, why}
export function liftStatus(L, mt) {
  const day = Math.floor(mt / 24) + 1, hour = ((mt % 24) + 24) % 24, wx = weatherOn(day);
  if (!liftOpen(L, hour)) return { open: false, why: hour < L.open[0] ? `OPENS ${String(Math.floor(L.open[0])).padStart(2, "0")}:${String(Math.round((L.open[0] % 1) * 60)).padStart(2, "0")}` : "CLOSED FOR THE NIGHT" };
  if (wx === "WIND" && WIND_HOLD.has(L.id)) return { open: false, why: "WIND HOLD" };
  if (wx === "WHITEOUT" && UPPER.has(L.id)) return { open: false, why: "WHITEOUT" };
  return { open: true, why: "OPEN" };
}
// A trail is open when the lift that feeds it runs (night: groomed, except under the lights).
export function trailStatus(T, mt) {
  const hour = ((mt % 24) + 24) % 24;
  const L = T.from === "race" ? LIFT.gate : LIFT[T.from.split("@")[0]] || (T.from.startsWith("trail:") ? null : null);
  if (L) { const st = liftStatus(L, mt); if (!st.open) return { open: false, why: st.why === "CLOSED FOR THE NIGHT" && (hour >= 21 || hour < 7) ? "GROOMING" : st.why }; }
  if (T.kind === "race" && raceDay(mt)) return { open: true, why: "RACE IN PROGRESS" };
  return { open: true, why: "OPEN" };
}
export const lightsOn = (mt) => { const h = ((mt % 24) + 24) % 24; return h >= 16.5 && h < 21; };
export const snowmaking = (mt) => { const day = Math.floor(mt / 24) + 1, h = ((mt % 24) + 24) % 24; return (h >= 21.5 || h < 8) && (weatherOn(day) === "COLD" || h < 5 || h >= 23); };
// The race window (race.js has the race itself): Saturdays 13:00-15:00.
export const RACE_HOURS = [13, 15];
export const raceDay = (mt) => { const day = Math.floor(mt / 24) + 1, h = ((mt % 24) + 24) % 24; return weekdayOf(day) === 6 && h >= RACE_HOURS[0] - 0.5 && h < RACE_HOURS[1]; };

// ---- the grooming cats -----------------------------------------------------------------------------------
// Three cats work the trails from 21:30 to 06:30, each down its own round, up the cat track.
export const CATS = [
  { id: 0, trails: ["compliance", "quarterly-targets", "orientation"] },
  { id: 1, trails: ["paper-trail", "performance-review", "core-competency"] },
  { id: 2, trails: ["grace-period", "open-door", "mandatory-fun", "long-memo"] },
];
export function catAt(cat, mt) {
  const h = ((mt % 24) + 24) % 24, on = h >= 21.5 ? h - 21.5 : h < 6.5 ? h + 2.5 : -1;
  if (on < 0) return null;
  const legs = cat.trails.map(id => TRAIL[id]), total = legs.reduce((n, T) => n + 2 * T.len, 0), speed = 45;   // cells a machine hour
  let s = (on * speed + cat.id * 37) % total;
  for (const T of legs) {
    if (s < 2 * T.len) {
      const up = s >= T.len, k = up ? 1 - (s - T.len) / T.len : s / T.len, [x, y, dx, dy] = along(T.pts, k, T.len), o = (up ? 0.6 : -0.6);
      return { x: x - dy * o, y: y + dx * o, d: up ? [-dx, -dy] : [dx, dy], trail: T.id };
    }
    s -= 2 * T.len;
  }
  return null;
}

// ---- the network: lifts up, trails down -------------------------------------------------------------------
// Nodes: "base" (the village's foot: every lift starting there, every trail ending there), each lift's
// foot ("<id>@a") and top ("<id>"), the race's finish ("race"), and where a trail joins another
// ("<trail>#<cells along>"). Edges: a lift (foot to top), a trail's stretch between two of its nodes.
function nodePos(n) {
  if (n === "race") return RACE_COURSE.finish;
  if (n.includes("~mid")) { const L = LIFT[n.split("~")[0]]; return [L.a[0] + (L.b[0] - L.a[0]) * L.mid, L.a[1] + (L.b[1] - L.a[1]) * L.mid]; }
  if (n.includes("#")) { const [id, at] = n.split("#"), T = TRAIL[id], q = along(T.pts, +at / T.len, T.len); return [q[0], q[1]]; }
  const [id, end] = n.split("@"), L = LIFT[id];
  return end === "a" ? L.a : L.b;
}
const BASE_LIFTS = new Set(LIFTS.filter(L => L.a[1] > BASE_Y - 3).map(L => L.id));
const nodeOf = (ref) => (ref === "base" ? "base" : ref.startsWith("trail:") ? null : ref.endsWith("@a") && BASE_LIFTS.has(ref.slice(0, -2)) ? "base" : ref);
export const NET = (() => {
  const cuts = new Map(TRAILS.map(T => [T.id, [[0, nodeOf(T.from)], [T.len, nodeOf(T.to)]]]));
  for (const T of TRAILS) if (T.join) { const n = `${T.join.trail}#${T.join.at.toFixed(1)}`; cuts.get(T.join.trail).push([T.join.at, n]); cuts.get(T.id)[1][1] = n; }
  const edges = [];
  for (const L of LIFTS) {
    const foot = BASE_LIFTS.has(L.id) ? "base" : `${L.id}@a`;
    if (L.mid) { edges.push({ kind: "lift", id: L.id, from: foot, to: `${L.id}~mid`, k0: 0, k1: L.mid, len: L.len * L.mid }, { kind: "lift", id: L.id, from: `${L.id}~mid`, to: L.id, k0: L.mid, k1: 1, len: L.len * (1 - L.mid) }); }
    else edges.push({ kind: "lift", id: L.id, from: foot, to: L.id, k0: 0, k1: 1, len: L.len });
  }
  for (const T of TRAILS) {
    const cs = cuts.get(T.id).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < cs.length; i++) edges.push({ kind: "ski", id: T.id, from: cs[i - 1][1], to: cs[i][1], s0: cs[i - 1][0], s1: cs[i][0], len: cs[i][0] - cs[i - 1][0], rating: T.rating });
  }
  const nodes = [...new Set(edges.flatMap(e => [e.from, e.to]))];
  // THE UPPER BASE: the gondola's mid-station, the Promotion's foot, the race's finish and the
  // Starting Gate's foot stand together; a short walk between any two (on skis, by the board)
  const pos = new Map(nodes.filter(n => n !== "base").map(n => [n, nodePos(n)]));
  for (const [a, pa] of pos) for (const [b, pb] of pos) if (a !== b && Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) < 9 && !(a.startsWith(b.split(/[@~#]/)[0]) && b.startsWith(a.split(/[@~#]/)[0]))) edges.push({ kind: "walk", from: a, to: b, a: pa, b: pb, len: Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) });
  return { edges, nodes, pos };
})();
const SKI_V = { green: 230, blue: 270, black: 300, double: 310 };   // cells a machine hour, an average skier
export const V_WALK = 60;
const edgeDur = (e, skill) => (e.kind === "lift" ? e.len / LIFT[e.id].speed : e.kind === "walk" ? e.len / V_WALK + 0.01 : e.len / (SKI_V[e.rating] * (0.7 + skill / 200)));
// Shortest path by time over the edges a skier may take (`ok`), from a node to a node.
function shortest(from, to, ok, skill) {
  const D = new Map([[from, 0]]), prev = new Map(), done = new Set();
  for (;;) {
    let u = null;
    for (const [n, d] of D) if (!done.has(n) && (u === null || d < D.get(u))) u = n;
    if (u === null) return null;
    if (u === to) break;
    done.add(u);
    for (const e of NET.edges) if (e.from === u && ok(e)) { const d = D.get(u) + edgeDur(e, skill); if (d < (D.get(e.to) ?? Infinity)) { D.set(e.to, d); prev.set(e.to, e); } }
  }
  const path = [];
  for (let n = to; n !== from; n = prev.get(n).from) path.unshift(prev.get(n));
  return path;
}
const MAX_IDX = (max) => RATINGS.indexOf(max);
// A route that skis trail T (all of it) from the base and back: lifts and trails within `max`.
const ROUTES = new Map();
export function routeFor(trailId, max, home = "base") {
  const k = `${trailId}|${max}|${home}`;
  if (ROUTES.has(k)) return ROUTES.get(k);
  const T = TRAIL[trailId], mi = MAX_IDX(max);
  const ok = (e) => e.kind === "lift" || RATINGS.indexOf(e.rating) <= mi;
  const mine = NET.edges.filter(e => e.kind === "ski" && e.id === trailId).sort((a, b) => a.s0 - b.s0);
  const up = shortest(home, mine[0].from, ok, 50), down = shortest(mine[mine.length - 1].to, home, ok, 50);
  const r = up && down ? [...up, ...mine, ...down] : null;
  ROUTES.set(k, r);
  void T;
  return r;
}

// ---- who skis what -------------------------------------------------------------------------------------
// Skiers and boarders on file (the census of 2026-09-30, and the names the Department would know):
// they ride the hardest terrain. A rating from the record: physical, adaptability, competence.
export const SKI_ON_FILE = { "shaun-white": "board", "tenzing-norgay": "ski", "lindsey-vonn": "ski", "mikaela-shiffrin": "ski", "bode-miller": "ski", "chloe-kim": "board", "ted-ligety": "ski", "alberto-tomba": "ski", "jean-claude-killy": "ski", "picabo-street": "ski", "tony-hawk": "board", "bob-burnquist": "board" };
const keyOf = (s) => s?.slug || String(s?.baseName || s?.name || "unfiled").toLowerCase().replace(/[^a-z0-9]+/g, "-");
export function skiSkill(s) {
  const b = s?.breakdown || {}, k = keyOf(s);
  const phys = typeof b.physical === "number" ? b.physical : 45, adapt = typeof b.adaptability === "number" ? b.adaptability : 50, comp = typeof s?.competence === "number" ? s.competence : 50;
  const bonus = SKI_ON_FILE[k] ? 20 : 0;
  return clamp(Math.round(0.4 * phys + 0.3 * adapt + 0.3 * comp + bonus + (h01(`${SEED}|skill|${k}`) - 0.5) * 16), 5, 99);
}
export const maxRating = (skill) => (skill >= 78 ? "double" : skill >= 62 ? "black" : skill >= 40 ? "blue" : "green");
export const ridesBoard = (s) => { const k = keyOf(s); return SKI_ON_FILE[k] ? SKI_ON_FILE[k] === "board" : h01(`${SEED}|board|${k}`) < 0.28; };
// Which trails a place's skiers aim for: THE SLOPES' the lower mountain, THE UPPER MOUNTAIN's the rest,
// THE RACE COURSE's the course (and its way home).
const LOWER = new Set(["orientation", "sandbox", "compliance", "quarterly-targets", "cool-down"]);
const placeTrails = (placeId) => TRAILS.filter(T => (placeId === "slopes" ? LOWER.has(T.id) : placeId === "race-course" ? T.id === "the-gauntlet" : !LOWER.has(T.id) || T.id === "quarterly-targets"));
// A place's skiers start and finish their runs at home: THE SLOPES' at the village's foot, the
// upper mountain's and the race course's at THE UPPER BASE (the gondola's mid-station).
export const HOME = { slopes: "base", "upper-mountain": "ascent~mid", "race-course": "race" };
const routeOpen = (r, mt) => r && r.every(e => e.kind !== "lift" || liftStatus(LIFT[e.id], mt).open);
function pickTrail(key, placeId, max, i, mt) {
  const mi = MAX_IDX(max), home = HOME[placeId] || "base";
  const open = placeTrails(placeId).filter(T => RATINGS.indexOf(T.rating) <= mi && trailStatus(T, mt).open && routeOpen(routeFor(T.id, max, home), mt));
  if (!open.length) return null;
  let tot = 0;
  const w = open.map(T => { const g = mi - RATINGS.indexOf(T.rating); const x = g === 0 ? 3 : g === 1 ? 2 : 1; tot += x; return x; });
  let r = h01(`${SEED}|run|${key}|${i}`) * tot;
  for (let j = 0; j < open.length; j++) if ((r -= w[j]) < 0) return open[j];
  return open[open.length - 1];
}

// A skier's cycles: from the start of the machine day (plus their own offset), each cycle a walk to
// the first lift, the queue, the ride, the trails down, picked by hash among the open trails within
// their rating, home again. -> {x, y, h, d, mode: walk|queue|lift|ski|stand, act, board, trail, lift}
const CYC = new Map();
function buildCycle(key, placeId, skill, i, t0, pos) {
  const max = maxRating(skill), T = pickTrail(key, placeId, max, i, t0);
  if (!T) return { t0, t1: t0 + 0.25, idle: true, pos };
  const route = routeFor(T.id, max, HOME[placeId] || "base"), legs = [];
  let t = t0, at = pos;
  const walkTo = (b) => { const wd = Math.hypot(b[0] - at[0], b[1] - at[1]) / V_WALK; if (wd > 0.003) { legs.push({ kind: "walk", a: at, b, t0: t, t1: t + wd }); t += wd; } at = b; };
  for (const e of route) {
    if (e.kind === "walk") { walkTo(e.b); continue; }
    if (e.kind === "lift") {
      const L = LIFT[e.id], p = [L.a[0] + (L.b[0] - L.a[0]) * e.k0, L.a[1] + (L.b[1] - L.a[1]) * e.k0], foot = e.k0 ? [p[0] + L.n[0] * 1.6, p[1] + L.n[1] * 1.6] : [L.a[0] - L.d[0] * 1.2, L.a[1] - L.d[1] * 1.2];
      walkTo(foot);
      const q = 0.01 + h01(`${SEED}|queue|${key}|${i}|${e.id}`) * 0.04, ride = liftRide(L, t + q - (e.k0 * L.len) / L.speed);
      const board = ride.at + (e.k0 * L.len) / L.speed;
      legs.push({ kind: "queue", at: foot, lift: L.id, t0: t, t1: board });
      legs.push({ kind: "lift", lift: L.id, k0: e.k0, k1: e.k1, t0: board, t1: board + e.len / L.speed });
      t = board + e.len / L.speed + 0.008;
      at = [L.a[0] + (L.b[0] - L.a[0]) * e.k1, L.a[1] + (L.b[1] - L.a[1]) * e.k1];
      continue;
    }
    const Tr = TRAIL[e.id], v = SKI_V[e.rating] * (0.7 + skill / 200) * (0.9 + h01(`${SEED}|pace|${key}|${i}`) * 0.2), dur = e.len / v;
    const st = along(Tr.pts, e.s0 / Tr.len, Tr.len);
    walkTo([st[0], st[1]]);
    const leg = { kind: "ski", trail: Tr.id, s0: e.s0, s1: e.s1, t0: t, t1: t + dur };
    const gap = RATING[e.rating].skill + 16 - skill;
    if (gap > 0 && h01(`${SEED}|fall|${key}|${i}|${e.id}`) < clamp(gap / 45, 0.03, 0.45)) { leg.fall = 0.25 + h01(`${SEED}|fallat|${key}|${i}|${e.id}`) * 0.5; leg.t1 += 0.03; }
    legs.push(leg);
    t = leg.t1;
    const q = along(Tr.pts, e.s1 / Tr.len, Tr.len); at = [q[0], q[1]];
  }
  return { t0, t1: t, legs, trail: T.id, pos: at };
}
export function skierAt(s, placeId, mt, spot) {
  const key = keyOf(s), skill = skiSkill(s), day = Math.floor(mt / 24);
  let c = CYC.get(key);
  const t00 = day * 24 + h01(`${SEED}|cyc0|${key}`) * 0.4;
  if (!c || c.day !== day || c.place !== placeId || mt < c.list[0].t0) { c = { day, place: placeId, list: [buildCycle(key, placeId, skill, 0, t00, spot)] }; CYC.set(key, c); }
  while (c.list[c.list.length - 1].t1 <= mt) { const L = c.list[c.list.length - 1]; c.list.push(buildCycle(key, placeId, skill, c.list.length, L.t1, L.pos)); if (c.list.length > 400) break; }
  let cy = c.list[c.list.length - 1];
  for (let i = c.list.length - 1; i >= 0; i--) if (c.list[i].t0 <= mt) { cy = c.list[i]; break; }
  const board = ridesBoard(s);
  if (cy.idle) { const [x, y] = cy.pos; return { x, y, h: terrainH(x, y), mode: "stand", act: "drink", board }; }
  const leg = cy.legs.find(l => mt >= l.t0 && mt < l.t1) || cy.legs[cy.legs.length - 1];
  const f = clamp((mt - leg.t0) / Math.max(1e-9, leg.t1 - leg.t0), 0, 1);
  if (leg.kind === "walk") { const x = leg.a[0] + (leg.b[0] - leg.a[0]) * f, y = leg.a[1] + (leg.b[1] - leg.a[1]) * f, n = Math.hypot(leg.b[0] - leg.a[0], leg.b[1] - leg.a[1]) || 1; return { x, y, h: terrainH(x, y), d: [(leg.b[0] - leg.a[0]) / n, (leg.b[1] - leg.a[1]) / n], mode: "walk", act: null, board }; }
  if (leg.kind === "queue") { const L = LIFT[leg.lift], o = (h01(`${SEED}|qpos|${key}`) - 0.5) * 1.6, x = leg.at[0] - L.d[1] * o - L.d[0] * 0.3, y = leg.at[1] + L.d[0] * o - L.d[1] * 0.3; return { x, y, h: terrainH(x, y), d: L.d, mode: "queue", act: board ? "snowboard" : "ski", board, lift: L.id }; }
  if (leg.kind === "lift") {
    const L = LIFT[leg.lift], k = leg.k0 + (leg.k1 - leg.k0) * f, x = L.a[0] + (L.b[0] - L.a[0]) * k + L.n[0] * L.gap, y = L.a[1] + (L.b[1] - L.a[1]) * k + L.n[1] * L.gap;
    return { x, y, h: ropeH(L, k) - (L.kind === "gondola" ? 1.05 : 0.95) + 0.05, d: L.d, mode: "lift", act: "sit", board, lift: L.id, cabin: L.kind === "gondola" };
  }
  const T = TRAIL[leg.trail], fall = leg.fall != null, tf = fall ? 0.03 / (leg.t1 - leg.t0) : 0;
  let k = f;
  let act = board ? "snowboard" : "ski";
  if (fall) { const a = leg.fall, b = a + tf; if (f >= a && f < b) { k = a; act = "stumble"; } else k = f < a ? f / (1 - tf) : (f - tf) / (1 - tf); }
  const s0 = leg.s0 + (leg.s1 - leg.s0) * k, [x, y, dx, dy] = along(T.pts, s0 / T.len, T.len);
  // the turns: a skier swings across the trail, wider on the greens, tighter through the gates
  const wig = Math.sin(s0 * (T.kind === "race" ? 1.5 : 0.9) + h01(`${SEED}|wig|${key}`) * 6) * (TRAIL_W(T) / 2 - 0.35) * (T.kind === "race" ? 0.5 : 0.75);
  const X = x - dy * wig, Y = y + dx * wig;
  return { x: X, y: Y, h: terrainH(X, Y), d: [dx, dy], mode: "ski", act, board, trail: T.id, fallen: act === "stumble" };
}
// Everyone on the mountain at mt: crowd = {placeId: [{s, w}]} -> [{s, key, at, patrol}]
export const SKI_PLACES = ["slopes", "upper-mountain", "race-course"];
const PATROL_JOBS = new Set(["ski-patrol", "summit-patrol"]);
// race: raceAt(mt) (race.js) or null. On a race afternoon the race course's visitors line the
// course and the racer on it is drawn by the view (projected), so a racer here is left out.
export function skiersIn(crowd, mt, jobOf = null, race = null) {
  const out = [], racing = race && race.phase !== "done" ? race.cur?.slug : null, lining = race ? raceLine() : null;
  for (const placeId of SKI_PLACES) for (const o of crowd[placeId] || []) {
    const s = o.s, key = keyOf(s), job = jobOf ? jobOf(s) : null, staff = o.w?.activity === "work";
    if (racing && key === racing) continue;
    if (lining && placeId === "race-course" && !staff) {
      const i = fnv(`${SEED}|line|${key}`) % lining.length, [x, y] = lining[i], j = (h01(`${SEED}|linej|${key}`) - 0.5) * 0.5;
      out.push({ s, key, at: { x: x + j, y: y + j * 0.4, h: terrainH(x + j, y + j * 0.4), mode: "stand", act: fnv(`${SEED}|cheer|${key}`) % 3 ? "cheer" : "view", look: RACE_COURSE.finish } });
      continue;
    }
    if (staff && !PATROL_JOBS.has(job)) {
      // lift crews, instructors, officials: at their posts by the lifts' feet and tops
      const posts = placeId === "race-course" ? [RACE_COURSE.start, RACE_COURSE.finish] : placeId === "slopes" ? [LIFT.induction.a, LIFT.compliance.a, LIFT.ascent.a, LIFT.induction.b, LIFT.compliance.b] : [LIFT.promotion.a, LIFT.escalation.a, LIFT.headcount.a, LIFT.ascent.b, LIFT.promotion.b];
      const p = posts[fnv(`${SEED}|post|${key}`) % posts.length], o2 = (h01(`${SEED}|postx|${key}`) - 0.5) * 2.4, x = p[0] + 1.2 + o2 * 0.3, y = p[1] + 0.9 + o2 * 0.2;
      out.push({ s, key, at: { x, y, h: terrainH(x, y), mode: "stand", act: placeId === "race-course" ? "whistle" : "signal" } });
      continue;
    }
    const spot = [o.w?.x ?? LIFT.ascent.a[0], o.w?.y ?? BASE_Y - 1.5];
    out.push({ s, key, at: skierAt(s, staff ? "upper-mountain" : placeId, mt, spot), patrol: staff });
  }
  return out;
}

// Where the race's spectators stand: along both sides of THE GAUNTLET's lower half and round the finish.
let LINE = null;
function raceLine() {
  if (LINE) return LINE;
  const T = TRAIL["the-gauntlet"], out = [];
  for (let k = 0.45; k <= 0.98; k += 0.035) for (const side of [-1, 1]) { const [x, y, dx, dy] = along(T.pts, k, T.len), o = side * (TRAIL_W(T) / 2 + 0.8); out.push([x - dy * o, y + dx * o]); }
  const [fx, fy] = RACE_COURSE.finish, n = RACE_COURSE.finishN;
  for (let k = -3; k <= 3; k++) out.push([fx + n[0] * k * 0.7 + 1.2, fy + n[1] * k * 0.7 + 1.1]);
  return (LINE = out);
}
// The racer on THE GAUNTLET at fraction f of a run: through the gates, tight turns, a straddle near the end for a DNF.
export function racerAt(f, dnf = false) {
  const T = TRAIL["the-gauntlet"], k = dnf ? Math.min(f, 0.72) : f, s = k * T.len, [x, y, dx, dy] = along(T.pts, k, T.len);
  const wig = Math.sin(s * (2 * Math.PI / 4.2) + 1.2) * 0.55, X = x - dy * wig, Y = y + dx * wig;
  return { x: X, y: Y, h: terrainH(X, Y), d: [dx, dy], mode: dnf && f > 0.72 ? "stand" : "ski", act: dnf && f > 0.72 ? "stumble" : "ski" };
}
// Where the iso view writes each band's name: by its lodge, its base, its parcel sign. [x, y, h]
export const LABEL_AT = {
  "the-slopes": [30, -27, terrainH(30, -27) + 1.6],
  "the-upper-mountain": [43, -48.5, terrainH(43, -48.5) + 2.4],
  "the-mid-lodge": [LODGES.mid.cx, LODGES.mid.cy, LODGES.mid.base + LODGES.mid.h + 2.6],
  "the-summit-lodge": [LODGES.summit.cx, LODGES.summit.cy, LODGES.summit.base + LODGES.summit.h + 3],
};
// The camera's fit: the mountain's high points (iso.cityExtent adds their rise).
export const EXTENT_PTS = (() => {
  const out = [];
  for (let x = MTN.x0; x <= MTN.x1; x += 4) for (let y = MTN.y0; y <= MTN.y1; y += 4) { const h = terrainH(x, y); if (h > 6) out.push([x, y, h + 1]); }
  for (const p of PEAKS) out.push([p.x, p.y, p.h + 5]);
  return out;
})();
