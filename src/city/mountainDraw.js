// THE MOUNTAIN in the iso view (CityIso.jsx, through coastDraw.js): each band of the mountain
// (THE SLOPES, the resort parcel's ground, THE UPPER MOUNTAIN, THE MID-MOUNTAIN LODGE's band, THE
// SUMMIT LODGE's band) paints its own share of the one terrain back to front by u + v, with
// everything standing on it: the pines below the tree line, the groomed trails cut through them,
// the lift lines, towers, ropes and every chair and cabin, the lodges and the stations, the race
// course's gates, the park, the snow guns, the grooming cats, and whoever is on the mountain.
// So a ridge hides what is behind it at every quarter turn, and the whole mountain stands to the
// summit at every zoom.
//
// Level of detail: far = the ground's colours (forest, snow, rock, the trails as white ribbons),
// the lifts as lines, people as dots; mid = pines, towers, chairs, cabins, the lodges, small
// sprites; near = signs and trail markers, corduroy, moguls, the gates, faces, the patrol's cross.
// Light: a sun fixed in the world (from the south-south-west), so the faces keep their shade as
// the city turns; the snow goes blue at night, the lodges' windows and the night-skiing lights
// come on, the cats' headlamps sweep the trails.

import { rot, unrot, STOREY } from "./iso.js";
import { SPRITE_W, SPRITE_H, statureOf } from "../sprites.js";
import { sheetFor, miniFor } from "./spriteBank.js";
import { FAMILY_COLOR, familyOf } from "./cityKit.js";
import { drawPose, phaseOf } from "./poses.js";
import { projected } from "./venueDraw.js";
import { racerName, fmt, RACER } from "./race.js";
import { riverShown, wetAt } from "./river.js";   // THE ATTRITION: no pine stands in THE BURNOUT or THE RETENTION POOL
import {
  MTN, SLOPES_TOP, terrainH, slopeAt, TREELINE, LIFTS, liftCar, liftOpen, ropeH, LODGES, STATIONS, PEAKS, feetAt, maxIn, onPad,
  TRAILS, TRAIL, PINES, RATING, GATES, PARK, GUNS, catAt, CATS, trailStatus, RACE_COURSE, BOARDS, lightsOn, snowmaking, racerAt,
} from "./mountainGeo.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const frac = (v) => ((v % 1) + 1) % 1;
const cache = new Map();
function shade(hex, f) {
  const k = hex + Math.round(f * 64);
  let v = cache.get(k);
  if (v) return v;
  const n = parseInt(hex.slice(1), 16), c = (s) => clamp(Math.round(((n >> s) & 255) * Math.round(f * 64) / 64), 0, 255);
  v = `rgb(${c(16)},${c(8)},${c(0)})`;
  cache.set(k, v);
  return v;
}
function mix(a, b, t) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16), m = (s) => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t);
  return `#${((m(16) << 16) | (m(8) << 8) | m(0)).toString(16).padStart(6, "0")}`;
}
const rectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

// The ground's palette by day (night: the snow blue, the forest near black).
const C = {
  snow: "#e6edf2", snowN: "#7f93ab", piste: "#f7fafc", pisteN: "#93a8c2", rock: "#80848c", rockN: "#3b4250",
  forest: "#55705e", forestN: "#1c2a26", treeA: "#1e4a2f", treeB: "#255a37", treeC: "#2f6b3f", treeN: "#0f2219", trunk: "#4a3222",
};
// The world's sun (map x, y): from the south-south-west. A face whose downhill points at it is lit.
const SUN = [-0.45, 0.89];
const lightOf = (gx, gy) => clamp(0.92 + 0.16 * clamp(-(gx * SUN[0] + gy * SUN[1]), -2.4, 2.4), 0.66, 1.14);

// The ground cell's colour: rock where it is steep or banded above the tree line, forest below it,
// snow above; a groomed trail brighter (the ribbons are drawn over it).
const TRAIL_W = { green: 2.2, blue: 2.4, black: 2.1, double: 1.7 };
// What stands on (or by) a trail is painted after the trail's pieces under it: they sort by the
// front of their footprint, so a skier's own depth is pushed on by about a trail's width.
const ON_TRAIL = 1.9;
function groundCol(x, y, h, gx, gy, steep, night) {
  const band = h > TREELINE - 4 && Math.sin(h * 1.15 + x * 0.09 - y * 0.05) > 0.62;
  if ((steep > 2.4 || (band && steep > 1.1) || (h > 38 && steep > 1.9)) && !onPad(x, y)) return night ? C.rockN : C.rock;
  const edge = TREELINE + (Math.sin(x * 0.41 + y * 0.23) + Math.sin(x * 0.13 - y * 0.37)) * 1.6;
  if (h < edge && h > 0.6 && y < MTN.y1 - 2.2) return night ? C.forestN : mix(C.forest, C.snow, clamp((h - edge + 4) / 6, 0, 0.75));
  return night ? C.snowN : C.snow;
}

// The district's flanks beside THE SLOPES and the parcel (x -4..9 and 100..111, up to the village's
// back): the mountain's foot, flat snow, laid with the district floor (flat, so it never covers anything).
export function drawMountainApron(G, night) {
  const col = night ? C.snowN : C.snow;
  for (const [x0, x1] of [[MTN.x0, 9], [100, MTN.x1]]) G.poly(rectPts(x0, SLOPES_TOP, x1, MTN.y1).map(p => G.Q(p[0], p[1], 0)), shade(col, 0.97));
}

// ---- the painter --------------------------------------------------------------------------------
// K: {G, lod, night, hour, mt, t, put(x, y, draw, bias)}; rect: the band's lot.
export function drawMountainBand(G, rect, lod, mt, crowd, opts = {}) {
  const hour = ((mt % 24) + 24) % 24, night = hour >= 19 || hour < 6.5;
  const items = [], c = G.ctx;
  const inRect = (x, y) => x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
  const put = (x, y, draw, bias = 0) => { const [u, v] = rot(x, y, G.r); items.push({ k: u + v + bias, draw }); };
  const clear = riverShown(mt) ? (opts.clear ? (x, y) => opts.clear(x, y) || wetPine(x, y) : wetPine) : opts.clear || null;
  const K = { G, lod, night, hour, mt, t: G.t || 0, put, inRect, nf: night ? 0.62 : 1, clear, crowd, rect };
  const W = G.w, H = G.h, pad = 30;
  const vis = (sx, sy) => sx > -pad && sx < W + pad && sy > -pad * 4 && sy < H + pad * 2;

  // the ground, cell by cell
  const step = lod === "far" ? 2.6 : lod === "mid" ? 1.5 : 1.0;
  const { nx, ny, sx, sy, hs, cells } = gridOf(rect, step);
  const grid = (i, j) => hs[j * (nx + 1) + i];
  const z = G.z, pisteCol = night ? C.pisteN : C.piste;
  // only the cells the screen can show (the band's highest ground lifts its foot into view from below)
  const V = visibleBox(G, rect, pad);
  K.vis = V;
  const i0 = Math.max(0, Math.floor((V.x0 - rect.x) / sx) - 1), i1 = Math.min(nx - 1, Math.ceil((V.x1 - rect.x) / sx) + 1);
  const j0 = Math.max(0, Math.floor((V.y0 - rect.y) / sy) - 1), j1 = Math.min(ny - 1, Math.ceil((V.y1 - rect.y) / sy) + 1);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const x0 = rect.x + i * sx, x1 = x0 + sx, y0 = rect.y + j * sy, y1 = y0 + sy;
    const h00 = grid(i, j), h10 = grid(i + 1, j), h11 = grid(i + 1, j + 1), h01 = grid(i, j + 1);
    const A = G.Q(x0, y0, h00), B = G.Q(x1, y0, h10), Cc = G.Q(x1, y1, h11), D = G.Q(x0, y1, h01);
    if (Math.max(A[0], B[0], Cc[0], D[0]) < -pad || Math.min(A[0], B[0], Cc[0], D[0]) > W + pad || Math.max(A[1], B[1], Cc[1], D[1]) < -pad || Math.min(A[1], B[1], Cc[1], D[1]) > H + pad) continue;
    const gx = ((h10 + h11) - (h00 + h01)) / (2 * sx), gy = ((h01 + h11) - (h00 + h10)) / (2 * sy), steep = Math.hypot(gx, gy);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hc = (h00 + h10 + h11 + h01) / 4;
    const col = groundCol(cx, cy, hc, gx, gy, steep, night), f = lightOf(gx, gy) * (0.97 + 0.06 * frac(Math.sin(cx * 12.9898 + cy * 78.233) * 43758.5453));
    const fill = shade(col, f);
    put(cx, cy, () => {
      // pushed out half a pixel from its middle, so neighbouring cells meet without a seam
      const mx = (A[0] + B[0] + Cc[0] + D[0]) / 4, my = (A[1] + B[1] + Cc[1] + D[1]) / 4, o = (P) => { const dx = P[0] - mx, dy = P[1] - my, n = Math.hypot(dx, dy) || 1; return [P[0] + dx / n * 0.6, P[1] + dy / n * 0.6]; };
      const a = o(A), b = o(B), cc = o(Cc), d = o(D);
      c.fillStyle = fill; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(cc[0], cc[1]); c.lineTo(d[0], d[1]); c.closePath(); c.fill();
    }, -0.3);
  }
  // the trails: each piece painted after every cell of ground under it (so the ground there never
  // covers it), before the ground in front of it
  const seenPiece = new Set();
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const runs = cells[j * nx + i];
    if (!runs) continue;
    for (const [T, k] of runs) {
      const id = `${T.id}|${k}`;
      if (seenPiece.has(id)) continue;
      seenPiece.add(id);
      const [ax, ay] = T.pts[k - 1], [bx, by] = T.pts[k], mx = (ax + bx) / 2, my = (ay + by) / 2;
      if (!inRect(mx, my)) continue;
      const hw = (T.w || TRAIL_W[T.rating]) / 2 + sx * 0.5;
      let top = -Infinity;
      for (const [px, py] of [[ax - hw, ay - hw], [ax + hw, ay + hw], [bx - hw, by - hw], [bx + hw, by + hw], [ax + hw, ay - hw], [bx - hw, by + hw]]) { const [u, v] = rot(px, py, G.r); top = Math.max(top, u + v); }
      const [gx, gy] = slopeAt(mx, my, 0.6), f = lightOf(gx, gy);
      items.push({ k: top - 0.3 + 0.01, draw: () => ribbon(K, T, k, f, z, pisteCol) });
    }
  }
  // the outer edges of the mountain, where they face the viewer: a cut of rock
  const edges = [];
  if (rect.x <= MTN.x0 + 1e-6) edges.push([[rect.x, rect.y + rect.h], [rect.x, rect.y], [rect.x + 1, rect.y + rect.h / 2]]);
  if (rect.x + rect.w >= MTN.x1 - 1e-6) edges.push([[rect.x + rect.w, rect.y], [rect.x + rect.w, rect.y + rect.h], [rect.x + rect.w - 1, rect.y + rect.h / 2]]);
  if (rect.y <= MTN.y0 + 1e-6) edges.push([[rect.x, rect.y], [rect.x + rect.w, rect.y], [rect.x + rect.w / 2, rect.y + 1]]);
  for (const [a, b, inside] of edges) {
    const f = G.facing(a, b, inside);
    if (!f) continue;
    const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) {
      const p = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], q = [a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n];
      const hp = terrainH(p[0] + (inside[0] - p[0]) * 1e-3, p[1] + (inside[1] - p[1]) * 1e-3), hq = terrainH(q[0] + (inside[0] - q[0]) * 1e-3, q[1] + (inside[1] - q[1]) * 1e-3);
      if (hp < 0.05 && hq < 0.05) continue;
      put((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, () => G.poly([G.Q(p[0], p[1], hp), G.Q(q[0], q[1], hq), G.Q(q[0], q[1], 0), G.Q(p[0], p[1], 0)], shade(night ? C.rockN : "#5a5e66", f)), 0.3);
    }
  }

  pines(K);
  lifts(K);
  lodges(K, crowd);
  if (lod !== "far") { race(K); park(K); guns(K); signs(K); }
  cats(K);
  people(K, crowd);
  for (const e of opts.extra || []) put(e.x, e.y, e.draw, e.bias || 0);
  if (opts.items) items.push(...opts.items);   // what the lot itself put in (the parcel's face, the Alpine Line)

  items.sort((a, b) => a.k - b.k);
  for (const it of items) it.draw();
}

// The map box (x0..y1) of a band the screen can show at the camera G.cam: the screen rect turned back
// onto the ground, stretched below by the band's highest ground (a high point stands up into view).
const TOPS = new Map();
function visibleBox(G, rect, pad) {
  const cam = G.cam;
  if (!cam) return { x0: rect.x, y0: rect.y, x1: rect.x + rect.w, y1: rect.y + rect.h };
  const key = `${rect.x}|${rect.y}`;
  let top = TOPS.get(key);
  if (top === undefined) { top = maxIn(rect, 1.5) + 4; TOPS.set(key, top); }
  const z = cam.z, A0 = (-pad - cam.ox) / z, A1 = (G.w + pad - cam.ox) / z, B0 = 2 * (-pad - cam.oy) / z, B1 = 2 * (G.h + pad - cam.oy) / z + 2 * top * STOREY;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [A, B] of [[A0, B0], [A1, B0], [A1, B1], [A0, B1]]) { const [x, y] = unrot((A + B) / 2, (B - A) / 2, cam.r); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}
// THE ATTRITION: the pines in the water or on its banks (looked up once)
let WET_PINES = null;
const wetPine = (x, y) => x < 17 && y > -92 && y < -44 && (WET_PINES ||= new Set(PINES.filter(p => wetAt(p[0], p[1], 0.8)).map(p => `${p[0]}|${p[1]}`))).has(`${x}|${y}`);
// The pines in buckets of 6 cells, so a band at close range walks only those near the screen.
const PB = 6, PINE_BUCKETS = new Map();
for (const p of PINES) { const k = `${Math.floor(p[0] / PB)}|${Math.floor(p[1] / PB)}`; (PINE_BUCKETS.get(k) || PINE_BUCKETS.set(k, []).get(k)).push(p); }
function pinesNear(V, rect) {
  const out = [], x0 = Math.max(V.x0, rect.x), x1 = Math.min(V.x1, rect.x + rect.w), y0 = Math.max(V.y0, rect.y), y1 = Math.min(V.y1, rect.y + rect.h);
  for (let bx = Math.floor(x0 / PB); bx <= Math.floor(x1 / PB); bx++) for (let by = Math.floor(y0 / PB); by <= Math.floor(y1 / PB); by++) { const b = PINE_BUCKETS.get(`${bx}|${by}`); if (b) out.push(b); }
  return out;
}
// The lifts' cars at a machine moment, once for every band.
let CARS = { mt: NaN, list: null };
function carsAt(mt) {
  if (CARS.mt === mt) return CARS.list;
  CARS = { mt, list: LIFTS.map(L => Array.from({ length: L.cars }, (_, i) => liftCar(L, i, mt))) };
  return CARS.list;
}

// ---- the trails: groomed ribbons through the forest -------------------------------------------------
// A band's ground grid at a step (cached: the terrain never changes), and for each cell the trail
// pieces that cross it (a piece is the stretch between two of a trail's points).
const GRIDS = new Map();
function gridOf(rect, step) {
  const key = `${rect.x}|${rect.y}|${rect.w}|${rect.h}|${step}`;
  let g = GRIDS.get(key);
  if (g) return g;
  const nx = Math.max(1, Math.round(rect.w / step)), ny = Math.max(1, Math.round(rect.h / step)), sx = rect.w / nx, sy = rect.h / ny;
  const hs = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) hs[j * (nx + 1) + i] = terrainH(rect.x + i * sx, rect.y + j * sy);
  const cells = new Array(nx * ny).fill(null);
  for (const T of TRAILS) {
    const hw = (T.w || TRAIL_W[T.rating]) / 2 + 0.2;
    for (let k = 1; k < T.pts.length; k++) {
      const [ax, ay] = T.pts[k - 1], [bx, by] = T.pts[k];
      const i0 = Math.floor((Math.min(ax, bx) - hw - rect.x) / sx), i1 = Math.floor((Math.max(ax, bx) + hw - rect.x) / sx);
      const j0 = Math.floor((Math.min(ay, by) - hw - rect.y) / sy), j1 = Math.floor((Math.max(ay, by) + hw - rect.y) / sy);
      for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) for (let j = Math.max(0, j0); j <= Math.min(ny - 1, j1); j++) (cells[j * nx + i] ||= []).push([T, k]);
    }
  }
  g = { nx, ny, sx, sy, hs, cells };
  GRIDS.set(key, g);
  return g;
}
function ribbon(K, T, i, f, z, pisteCol) {
  const { G, lod, night } = K, c = G.ctx;
  const w = (T.w || TRAIL_W[T.rating]) * z * (T.kind === "glades" ? 0.8 : 1);
  const [ax, ay] = T.pts[i - 1], [bx, by] = T.pts[i];
  const A = G.Q(ax, ay, T.hs[i - 1] + 0.02), B = G.Q(bx, by, T.hs[i] + 0.02);
  const col = T.kind === "glades" ? (night ? "#7d8ea3" : "#dce5ec") : pisteCol;
  c.lineCap = "round";
  // above the tree line a trail is snow on snow: a groomed edge, a shade darker, picks it out
  if (T.hs[i] > TREELINE - 6) { c.strokeStyle = shade(night ? C.snowN : "#c3cfda", f); c.lineWidth = Math.max(1.6, w * 0.74); c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke(); }
  c.strokeStyle = shade(col, Math.min(1.12, f * 1.03)); c.lineWidth = Math.max(1.2, w * 0.62);
  c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
  if (lod === "far") return;
  // the trail's colour, faint down its middle (the map's code on the snow)
  if (lod === "mid" || i % 2) { c.strokeStyle = RATING[T.rating].ink; c.globalAlpha = lod === "near" ? 0.22 : 0.32; c.lineWidth = Math.max(1, z * 0.12); c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke(); c.globalAlpha = 1; }
  if (lod === "near" && T.kind !== "glades" && T.kind !== "moguls") {
    // corduroy across the trail
    c.strokeStyle = night ? "rgba(40,55,75,0.25)" : "rgba(120,140,165,0.2)"; c.lineWidth = 1;
    const nxp = -(B[1] - A[1]), nyp = B[0] - A[0], nl = Math.hypot(nxp, nyp) || 1, ux = nxp / nl, uy = nyp / nl, hw = w * 0.28;
    for (let k = 0.15; k < 1; k += 0.3) { const px = A[0] + (B[0] - A[0]) * k, py = A[1] + (B[1] - A[1]) * k; c.beginPath(); c.moveTo(px - ux * hw, py - uy * hw); c.lineTo(px + ux * hw, py + uy * hw); c.stroke(); }
  }
  if (lod === "near" && T.kind === "moguls") {
    c.fillStyle = night ? "rgba(60,75,95,0.45)" : "rgba(150,168,190,0.5)";
    for (let k = 0; k < 3; k++) { const q = frac(k * 0.37 + i * 0.21), px = A[0] + (B[0] - A[0]) * q + (k - 1) * w * 0.12, py = A[1] + (B[1] - A[1]) * q; c.beginPath(); c.ellipse(px, py, z * 0.18, z * 0.08, 0, 0, Math.PI * 2); c.fill(); }
  }
}

// ---- the pines -------------------------------------------------------------------------------------------
function pines(K) {
  const { G, lod, night, put, inRect } = K, c = G.ctx;
  if (lod === "far") {
    // the forest's texture: a dark tuft for one pine in three
    const col = night ? C.treeN : C.treeA, z = G.z;
    for (const bucket of pinesNear(K.vis, K.rect)) for (let i = 0; i < bucket.length; i += 3) {
      const [x, y, h, s] = bucket[i];
      if (!inRect(x, y) || K.clear?.(x, y)) continue;
      const [a, b] = G.Q(x, y, h + 0.45 * s);
      if (a < -10 || a > G.w + 10 || b < -10 || b > G.h + 10) continue;
      put(x, y, () => { const w = Math.max(1.2, z * 0.5 * s); c.fillStyle = col; c.beginPath(); c.moveTo(a, b - w * 1.5); c.lineTo(a - w, b + w * 0.5); c.lineTo(a + w, b + w * 0.5); c.closePath(); c.fill(); }, 0.01);
    }
    return;
  }
  const z = G.z, cols = night ? [C.treeN, C.treeN, "#1b3326"] : [C.treeA, C.treeB, C.treeC];
  const tiers = lod === "near" ? 3 : 2;
  for (const bucket of pinesNear(K.vis, K.rect)) for (const [x, y, h, s] of bucket) {
    if (!inRect(x, y) || K.clear?.(x, y)) continue;
    const [mx, my] = G.Q(x, y, h);
    if (mx < -20 || mx > G.w + 20 || my < -10 || my > G.h + 40) continue;
    put(x, y, () => {
      if (lod === "near") { const T = G.Q(x, y, h + 0.25 * s); c.strokeStyle = C.trunk; c.lineWidth = Math.max(1, z * 0.08); c.beginPath(); c.moveTo(mx, my); c.lineTo(T[0], T[1]); c.stroke(); }
      for (let k = 0; k < tiers; k++) {
        const hb = h + 0.18 * s + k * 0.42 * s, w = (0.5 - k * 0.13) * s * z * 1.3, [ax, ay] = G.Q(x, y, hb + 0.72 * s), [bx, by] = G.Q(x, y, hb);
        c.fillStyle = cols[k]; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx - w, by); c.lineTo(bx + w, by); c.closePath(); c.fill();
      }
      if (!night && h > TREELINE - 9) { const [ax, ay] = G.Q(x, y, h + 0.18 * s + (tiers - 1) * 0.42 * s + 0.72 * s); c.fillStyle = "rgba(240,245,250,0.85)"; c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax - z * 0.12 * s, ay + z * 0.3 * s); c.lineTo(ax + z * 0.12 * s, ay + z * 0.3 * s); c.closePath(); c.fill(); }
    }, 0.02);
  }
}

// ---- the lifts: towers, the haul rope, every chair and cabin ----------------------------------------------
function lifts(K) {
  const { G, lod, night, put, inRect, mt } = K, c = G.ctx, z = G.z;
  for (const L of LIFTS) {
    const open = liftOpen(L, K.hour), gond = L.kind === "gondola";
    const P = (k, side) => [L.a[0] + (L.b[0] - L.a[0]) * k + L.n[0] * L.gap * side, L.a[1] + (L.b[1] - L.a[1]) * k + L.n[1] * L.gap * side];
    // the rope, both sides, in short lengths (so a ridge between hides it)
    const n = Math.max(4, Math.round(L.len / (lod === "far" ? 3 : 1.2)));
    for (const side of [1, -1]) for (let i = 0; i < n; i++) {
      const k0 = i / n, k1 = (i + 1) / n, p0 = P(k0, side), p1 = P(k1, side), m = P((k0 + k1) / 2, side);
      if (!inRect(m[0], m[1])) continue;
      put(m[0], m[1], () => { const A = G.Q(p0[0], p0[1], ropeH(L, k0)), B = G.Q(p1[0], p1[1], ropeH(L, k1)); c.strokeStyle = night ? "rgba(20,24,30,0.9)" : "rgba(40,46,56,0.85)"; c.lineWidth = lod === "far" ? 1 : Math.max(1, z * 0.05); c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke(); }, 0.35);
    }
    if (lod === "far") continue;
    // towers: a mast and a crossarm
    for (const k of L.towers) {
      const [x, y] = P(k, 0);
      if (!inRect(x, y)) continue;
      put(x, y, () => {
        const g = terrainH(x, y), top = ropeH(L, k) + 0.1, A = G.Q(x, y, g), B = G.Q(x, y, top);
        c.strokeStyle = "#5b6470"; c.lineWidth = Math.max(1.5, z * (gond ? 0.16 : 0.11)); c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
        const l = G.Q(x + L.n[0] * (L.gap + 0.12), y + L.n[1] * (L.gap + 0.12), top), r = G.Q(x - L.n[0] * (L.gap + 0.12), y - L.n[1] * (L.gap + 0.12), top);
        c.lineWidth = Math.max(1, z * 0.08); c.beginPath(); c.moveTo(l[0], l[1]); c.lineTo(r[0], r[1]); c.stroke();
      }, 0.3);
    }
    // the cars (riders are drawn in theirs by people())
    const cars = carsAt(mt)[LIFTS.indexOf(L)];
    for (let i = 0; i < L.cars; i++) {
      const car = cars[i];
      if (!inRect(car.x, car.y)) continue;
      put(car.x, car.y, () => (gond ? cabin(K, car, L) : chair(K, car, L)), 0.25);
    }
    void open;
  }
  // the stations at each end
  for (const S of STATIONS) {
    if (!inRect(S.cx, S.cy) || lod === "far") continue;
    put(S.cx, S.cy, () => {
      const g = S.kind === "gondola";
      G.prism(rectPts(S.x0, S.y0, S.x1, S.y1), S.base, S.base + S.h, g ? "#6b7280" : "#7a5232", 1.1);
      G.prism(rectPts(S.x0 - 0.15, S.y0 - 0.15, S.x1 + 0.15, S.y1 + 0.15), S.base + S.h, S.base + S.h + 0.14, K.night ? "#8fa2b6" : "#e8eef2", 1.25);
      if (g && S.end === "a" && K.lod === "near") { const [mx, my] = G.Q(S.cx, S.y1, S.base + S.h * 0.55); label(K, "THE ASCENT", mx, my, "#fde68a"); }
    }, 0.15);
  }
}
function chair(K, car, L) {
  const { G } = K, c = G.ctx, z = G.z;
  const A = G.Q(car.x, car.y, car.h + 0.95), B = G.Q(car.x, car.y, car.h + 0.05);
  c.strokeStyle = "#374151"; c.lineWidth = 1; c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
  const hw = 0.12 + 0.1 * L.seats, d = L.d;
  G.poly([G.Q(car.x - d[1] * hw - d[0] * 0.13, car.y + d[0] * hw - d[1] * 0.13, car.h), G.Q(car.x + d[1] * hw - d[0] * 0.13, car.y - d[0] * hw - d[1] * 0.13, car.h), G.Q(car.x + d[1] * hw + d[0] * 0.13, car.y - d[0] * hw + d[1] * 0.13, car.h), G.Q(car.x - d[1] * hw + d[0] * 0.13, car.y + d[0] * hw + d[1] * 0.13, car.h)], "#1f2937");
  void z;
}
function cabin(K, car, L) {
  const { G, night } = K, c = G.ctx, z = G.z;
  const top = car.h + 1.05, A = G.Q(car.x, car.y, top), B = G.Q(car.x, car.y, car.h + 0.62);
  c.strokeStyle = "#374151"; c.lineWidth = Math.max(1, z * 0.05); c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
  const w = 0.42, d = 0.3, foot = [[car.x - w, car.y - d], [car.x + w, car.y - d], [car.x + w, car.y + d], [car.x - w, car.y + d]];
  G.prism(foot, car.h, car.h + 0.62, "#b91c1c", 1.2);
  if (K.lod === "near") {
    const [mx, my] = G.Q(car.x, car.y + d, car.h + 0.38);
    c.fillStyle = night ? "rgba(253,230,138,0.85)" : "rgba(186,230,253,0.85)"; c.fillRect(mx - z * 0.28, my - z * 0.18, z * 0.56, z * 0.28);
  }
}

// ---- the lodges ----------------------------------------------------------------------------------------
function lodges(K, crowd) {
  const { G, lod, night, put, inRect } = K, c = G.ctx, z = G.z;
  for (const L of Object.values(LODGES)) {
    if (!inRect(L.cx, L.cy)) continue;
    const lit = night || K.hour < 8 || K.hour >= 16.5;
    put(L.cx, L.cy, () => {
      // the platform under it (the slope evened), then the walls, the windows, the roof
      const foot = rectPts(L.x0, L.y0, L.x1, L.y1);
      G.prism(rectPts(L.x0 - 0.3, L.y0 - 0.3, L.x1 + 0.3, L.y1 + 0.3), L.lo - 0.3, L.base, "#55585e", 1.1);
      G.prism(foot, L.base, L.base + L.h, L.wall, 1.0);
      if (lod !== "far") {
        // windows on the two long sides, warm when lit and occupied
        const occ = crowd?.lodges?.[L.building] || 0, warm = lit && occ > 0;
        for (const [ya, side] of [[L.y1, 1], [L.y0, -1]]) {
          if (!G.facing([L.x0, ya], [L.x1, ya], [L.cx, L.cy])) continue;
          const n = Math.max(2, Math.round((L.x1 - L.x0) / 0.9));
          for (let k = 0; k < n; k++) {
            const x = L.x0 + (k + 0.5) * (L.x1 - L.x0) / n;
            for (let f = 0; f < Math.max(1, Math.floor(L.h / 1.2)); f++) {
              const p = G.Q(x, ya + side * 0.01, L.base + 0.35 + f * 1.15);
              c.fillStyle = warm && (k + f) % 3 !== 1 ? "#fbbf24" : L.glass ? "#7dd3fc" : night ? "#1f2937" : "#9ec5dd";
              c.fillRect(p[0] - z * 0.16, p[1] - z * 0.42, z * 0.32, z * 0.42);
            }
          }
        }
      }
      // the roof: a pitch along x, snow on it
      const rh = L.h + Math.min(1.8, (L.y1 - L.y0) * 0.45), ridge = [[L.x0 - 0.2, L.cy], [L.x1 + 0.2, L.cy]];
      const roofCol = night ? "#a3b5c8" : "#eef3f6";
      for (const [ya, yb] of [[L.y0 - 0.25, L.cy], [L.y1 + 0.25, L.cy]]) {
        const quad = [G.Q(L.x0 - 0.2, ya, L.base + L.h), G.Q(L.x1 + 0.2, ya, L.base + L.h), G.Q(ridge[1][0], yb, L.base + rh), G.Q(ridge[0][0], yb, L.base + rh)];
        G.poly(quad, shade(roofCol, ya < L.cy ? 0.86 : 1.02));
      }
      for (const xa of [L.x0 - 0.2, L.x1 + 0.2]) {
        if (!G.facing([xa, L.y0], [xa, L.y1], [L.cx, L.cy])) continue;
        G.poly([G.Q(xa, L.y0 - 0.25, L.base + L.h), G.Q(xa, L.y1 + 0.25, L.base + L.h), G.Q(xa, L.cy, L.base + rh)], shade(L.wall, 0.92));
      }
      if (L.cross && lod === "near") { const [mx, my] = G.Q(L.cx, L.y1 + 0.02, L.base + L.h * 0.55); c.fillStyle = "#f5f5f5"; c.fillRect(mx - z * 0.07, my - z * 0.24, z * 0.14, z * 0.48); c.fillRect(mx - z * 0.24, my - z * 0.07, z * 0.48, z * 0.14); }
      if (L.id === "summit") {
        // the summit's mast and its beacon
        const mx = L.x1 + 0.8, my = L.y0 + 0.4, g = terrainH(mx, my), A = G.Q(mx, my, g), B = G.Q(mx, my, g + 4.2);
        c.strokeStyle = "#9ca3af"; c.lineWidth = Math.max(1, z * 0.09); c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
        c.fillStyle = (Math.floor((K.t || 0) * 1.2) % 2 || !K.t) ? "#ef4444" : "#7f1d1d"; c.beginPath(); c.arc(B[0], B[1], Math.max(1.5, z * 0.14), 0, Math.PI * 2); c.fill();
      }
    }, 0.4);
  }
  // the summit's marker: a cairn and its board (elevation)
  const S = PEAKS[0];
  if (inRect(S.x, S.y) && lod !== "far") put(S.x, S.y, () => {
    const A = G.Q(S.x, S.y, S.h), B = G.Q(S.x, S.y, S.h + 1.3);
    c.strokeStyle = "#374151"; c.lineWidth = Math.max(1, z * 0.08); c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
    if (lod === "near") label(K, `${S.name} // ${feetAt(S.h).toLocaleString("en-US")} FT`, B[0], B[1] - 2, "#fef3c7");
  }, 0.5);
}

// ---- the race course, the park, the guns, the cats, the signs ----------------------------------------
function race(K) {
  const { G, lod, put, inRect } = K, c = G.ctx, z = G.z;
  for (const g of GATES) {
    if (!inRect(g.x, g.y)) continue;
    put(g.x, g.y, () => {
      const h = terrainH(g.x, g.y);
      for (const o of [-0.35, 0.35]) {
        const x = g.x + g.n[0] * o, y = g.y + g.n[1] * o, A = G.Q(x, y, h), B = G.Q(x, y, h + 0.75);
        c.strokeStyle = g.col; c.lineWidth = Math.max(1, z * 0.07); c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
      }
      if (lod === "near") { const A = G.Q(g.x - g.n[0] * 0.35, g.y - g.n[1] * 0.35, h + 0.72), B = G.Q(g.x + g.n[0] * 0.35, g.y + g.n[1] * 0.35, h + 0.72), A2 = G.Q(g.x - g.n[0] * 0.35, g.y - g.n[1] * 0.35, h + 0.45), B2 = G.Q(g.x + g.n[0] * 0.35, g.y + g.n[1] * 0.35, h + 0.45); c.fillStyle = g.col; c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.lineTo(B2[0], B2[1]); c.lineTo(A2[0], A2[1]); c.closePath(); c.fill(); }
    }, ON_TRAIL);
  }
  // the start house and the finish arch
  const R = RACE_COURSE;
  for (const [p, what] of [[R.start, "start"], [R.finish, "finish"]]) {
    if (!inRect(p[0], p[1])) continue;
    put(p[0], p[1], () => {
      const h = terrainH(p[0], p[1]);
      if (what === "start") { G.prism(rectPts(p[0] - 0.6, p[1] - 0.9, p[0] + 0.6, p[1] - 0.1), h - 0.1, h + 1.1, "#b91c1c", 1.15); return; }
      const n = R.finishN;
      const a = [p[0] + n[0] * 1.4, p[1] + n[1] * 1.4], b = [p[0] - n[0] * 1.4, p[1] - n[1] * 1.4];
      for (const q of [a, b]) { const A = G.Q(q[0], q[1], terrainH(q[0], q[1])), B = G.Q(q[0], q[1], terrainH(q[0], q[1]) + 1.5); c.strokeStyle = "#111827"; c.lineWidth = Math.max(1.5, z * 0.12); c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke(); }
      const A = G.Q(a[0], a[1], terrainH(a[0], a[1]) + 1.5), B = G.Q(b[0], b[1], terrainH(b[0], b[1]) + 1.5), A2 = G.Q(a[0], a[1], terrainH(a[0], a[1]) + 1.15), B2 = G.Q(b[0], b[1], terrainH(b[0], b[1]) + 1.15);
      c.fillStyle = "#dc2626"; c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.lineTo(B2[0], B2[1]); c.lineTo(A2[0], A2[1]); c.closePath(); c.fill();
      if (lod === "near") label(K, "FINISH // THE GAUNTLET", (A[0] + B[0]) / 2, Math.min(A[1], B[1]) - 3, "#fef3c7");
    }, ON_TRAIL);
  }
}
function park(K) {
  const { G, lod, night, put, inRect } = K, c = G.ctx, z = G.z;
  for (const f of PARK.features) {
    if (!inRect(f.x, f.y)) continue;
    put(f.x, f.y, () => {
      const h = terrainH(f.x, f.y), d = f.d;
      if (f.kind === "kicker") {
        const w = 0.8, l = 1.1, p = [f.x - d[1] * w, f.y + d[0] * w], q = [f.x + d[1] * w, f.y - d[0] * w];
        const top = h + 0.55, back = [f.x + d[0] * l, f.y + d[1] * l];
        G.poly([G.Q(p[0] - d[0] * l, p[1] - d[1] * l, h), G.Q(q[0] - d[0] * l, q[1] - d[1] * l, h), G.Q(q[0] + d[0] * l, q[1] + d[1] * l, top), G.Q(p[0] + d[0] * l, p[1] + d[1] * l, top)], shade(night ? C.pisteN : "#f1f5f9", 1.05));
        G.poly([G.Q(p[0] + d[0] * l, p[1] + d[1] * l, top), G.Q(q[0] + d[0] * l, q[1] + d[1] * l, top), G.Q(q[0] + d[0] * l, q[1] + d[1] * l, h), G.Q(p[0] + d[0] * l, p[1] + d[1] * l, h)], shade(night ? C.pisteN : "#cbd5e1", 0.9));
        void back;
      } else if (f.kind === "rail") {
        const a = [f.x - d[0] * 1.2, f.y - d[1] * 1.2], b = [f.x + d[0] * 1.2, f.y + d[1] * 1.2];
        const A = G.Q(a[0], a[1], terrainH(a[0], a[1]) + 0.35), B = G.Q(b[0], b[1], terrainH(b[0], b[1]) + 0.35);
        c.strokeStyle = f.col || "#f97316"; c.lineWidth = Math.max(1.5, z * 0.1); c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
      } else if (f.kind === "pipe") {
        // THE PIPELINE: a halfpipe cut down the fall line, its walls lit by day
        const n = 8, hw = 1.3;
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n, a = [f.a[0] + (f.b[0] - f.a[0]) * t0, f.a[1] + (f.b[1] - f.a[1]) * t0], b = [f.a[0] + (f.b[0] - f.a[0]) * t1, f.a[1] + (f.b[1] - f.a[1]) * t1];
          const ha = terrainH(a[0], a[1]), hb = terrainH(b[0], b[1]), nn = f.n;
          for (const s of [-1, 1]) {
            G.poly([G.Q(a[0] + nn[0] * hw * s, a[1] + nn[1] * hw * s, ha + 0.55), G.Q(b[0] + nn[0] * hw * s, b[1] + nn[1] * hw * s, hb + 0.55), G.Q(b[0] + nn[0] * hw * 0.4 * s, b[1] + nn[1] * hw * 0.4 * s, hb - 0.05), G.Q(a[0] + nn[0] * hw * 0.4 * s, a[1] + nn[1] * hw * 0.4 * s, ha - 0.05)], shade(night ? C.pisteN : "#dbe5ee", s > 0 ? 0.92 : 1.06));
          }
        }
        if (lod === "near") { const [mx, my] = G.Q(f.a[0], f.a[1], terrainH(f.a[0], f.a[1]) + 1.2); label(K, "THE PIPELINE", mx, my, "#fef3c7"); }
      }
    }, ON_TRAIL);
  }
}
function guns(K) {
  const { G, put, inRect } = K, c = G.ctx, z = G.z, on = snowmaking(K.mt);
  for (const g of GUNS) {
    if (!inRect(g.x, g.y)) continue;
    put(g.x, g.y, () => {
      const h = terrainH(g.x, g.y), A = G.Q(g.x, g.y, h), B = G.Q(g.x, g.y, h + 0.9);
      c.strokeStyle = "#6b7280"; c.lineWidth = Math.max(1, z * 0.07); c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
      c.fillStyle = "#facc15"; c.fillRect(B[0] - z * 0.14, B[1] - z * 0.14, z * 0.28, z * 0.24);
      if (!on) return;
      // the plume: drifting particles off the fan, downwind
      c.fillStyle = "rgba(245,248,252,0.75)";
      for (let k = 0; k < 9; k++) {
        const q = frac(k / 9 + (K.t || 0) * 0.35 + g.x * 0.13), d = q * 2.4, P = G.Q(g.x + g.w[0] * d, g.y + g.w[1] * d, h + 0.9 + Math.sin(q * 3) * 0.4);
        const r = Math.max(1, z * (0.06 + q * 0.18)); c.beginPath(); c.arc(P[0], P[1] - q * z * 0.4, r, 0, Math.PI * 2); c.fill();
      }
    }, ON_TRAIL);
  }
}
function cats(K) {
  const { G, lod, put, inRect, mt } = K, c = G.ctx, z = G.z;
  for (const cat of CATS) {
    const p = catAt(cat, mt);
    if (!p || !inRect(p.x, p.y)) continue;
    put(p.x, p.y, () => {
      const h = terrainH(p.x, p.y), d = p.d, w = 0.45, l = 0.7;
      const foot = [[p.x - d[0] * l - d[1] * w, p.y - d[1] * l + d[0] * w], [p.x + d[0] * l - d[1] * w, p.y + d[1] * l + d[0] * w], [p.x + d[0] * l + d[1] * w, p.y + d[1] * l - d[0] * w], [p.x - d[0] * l + d[1] * w, p.y - d[1] * l - d[0] * w]];
      if (lod === "far") { const [a, b] = G.Q(p.x, p.y, h); c.fillStyle = "#ef4444"; c.fillRect(a - 1.5, b - 2, 3, 3); }
      else G.prism(foot, h, h + 0.55, "#dc2626", 1.2);
      // the headlamps' pool ahead of it
      const F = G.Q(p.x + d[0] * 2.2, p.y + d[1] * 2.2, terrainH(p.x + d[0] * 2.2, p.y + d[1] * 2.2));
      const g = c.createRadialGradient(F[0], F[1], 0, F[0], F[1], z * 1.8);
      g.addColorStop(0, "rgba(255,247,200,0.55)"); g.addColorStop(1, "rgba(255,247,200,0)");
      c.fillStyle = g; c.beginPath(); c.arc(F[0], F[1], z * 1.8, 0, Math.PI * 2); c.fill();
    }, ON_TRAIL);
  }
}
// Trail signs at each trailhead (near): the rating's mark and the name; the status when closed.
function signs(K) {
  const { G, lod, put, inRect } = K, c = G.ctx, z = G.z;
  for (const T of TRAILS) {
    const [x, y] = T.sign;
    if (!inRect(x, y)) continue;
    put(x, y, () => {
      const h = terrainH(x, y), A = G.Q(x, y, h), B = G.Q(x, y, h + 0.9);
      c.strokeStyle = "#4b5563"; c.lineWidth = Math.max(1, z * 0.06); c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
      mark(c, T.rating, B[0], B[1] - z * 0.15, Math.max(3, z * 0.22));
      if (lod !== "near") return;
      const st = trailStatus(T, K.mt);
      label(K, `${T.name}${st.open ? "" : " // " + st.why}`, B[0] + z * 0.35, B[1] - z * 0.15, st.open ? "#e5e7eb" : "#fca5a5", "left", 0.75);
    }, ON_TRAIL);
  }
  // the boards: the race's results at the finish and at the base
  for (const b of BOARDS) {
    if (!inRect(b.x, b.y)) continue;
    put(b.x, b.y, () => {
      const h = terrainH(b.x, b.y);
      for (const o of [-0.7, 0.7]) { const A = G.Q(b.x + o, b.y, h), B = G.Q(b.x + o, b.y, h + 1.9); c.strokeStyle = "#374151"; c.lineWidth = Math.max(1, z * 0.07); c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke(); }
      G.poly([G.Q(b.x - 0.8, b.y, h + 1.0), G.Q(b.x + 0.8, b.y, h + 1.0), G.Q(b.x + 0.8, b.y, h + 2.0), G.Q(b.x - 0.8, b.y, h + 2.0)], "#111827");
      if (lod === "near") board(K, b, G.Q(b.x - 0.75, b.y, h + 1.95), G.Q(b.x + 0.75, b.y, h + 1.95), G.Q(b.x - 0.75, b.y, h + 1.05));
    }, ON_TRAIL);
  }
}
// The results board: the race on now (or the last one), its top three; the trail count otherwise.
function board(K, b, A, B, D) {
  const c = K.G.ctx, R = K.crowd?.race || null, last = K.crowd?.lastRace || null;
  const rows = [];
  if (R && R.phase !== "before") { rows.push(`${R.race.name}${R.phase === "on" && R.cur ? ` // RUN ${R.cur.run}` : " // FINAL"}`); for (const x of R.board.slice(0, 3)) rows.push(`${x.place || "-"} ${racerName(x.slug).split(" ").pop()} ${fmt(x.total ?? x.t1)}`); }
  else if (last) { rows.push(`LAST: ${last.name}`); for (const x of last.results.slice(0, 3)) rows.push(`${x.place || "-"} ${racerName(x.slug).split(" ").pop()} ${fmt(x.total)}`); }
  else rows.push("THE GAUNTLET", "SATURDAYS 13:00", "TIMED. RANKED.");
  const w = Math.hypot(B[0] - A[0], B[1] - A[1]), hgt = Math.abs(D[1] - A[1]), fs = Math.floor(Math.min(hgt / (rows.length * 1.25), w / 15));
  if (fs < 5) return;
  c.save(); c.font = `${fs}px "Fira Mono", monospace`; c.textBaseline = "top"; c.textAlign = "left";
  const x0 = Math.min(A[0], B[0]) + fs * 0.4, y0 = Math.min(A[1], B[1]) + fs * 0.3;
  rows.forEach((t, i) => { c.fillStyle = i ? "#fde68a" : "#f87171"; c.fillText(t.slice(0, 16), x0, y0 + i * fs * 1.2); });
  c.restore();
}
// A rating's mark: green circle, blue square, black diamond, double black.
export function mark(c, rating, x, y, s) {
  c.save();
  c.fillStyle = RATING[rating].ink; c.strokeStyle = "#f8fafc"; c.lineWidth = 1;
  if (rating === "green") { c.beginPath(); c.arc(x, y, s, 0, Math.PI * 2); c.fill(); c.stroke(); }
  else if (rating === "blue") { c.fillRect(x - s, y - s, s * 2, s * 2); c.strokeRect(x - s, y - s, s * 2, s * 2); }
  else {
    const dd = rating === "double" ? [-s * 1.05, s * 1.05] : [0];
    for (const o of dd) { c.beginPath(); c.moveTo(x + o, y - s * 1.2); c.lineTo(x + o + s, y); c.lineTo(x + o, y + s * 1.2); c.lineTo(x + o - s, y); c.closePath(); c.fill(); c.stroke(); }
  }
  c.restore();
}
function label(K, text, x, y, col, align = "center", scale = 1) {
  const c = K.G.ctx, fs = Math.max(7, Math.min(13, Math.round(K.G.z * 0.32 * scale)));
  c.save(); c.font = `bold ${fs}px "Fira Mono", monospace`; c.textAlign = align; c.textBaseline = "bottom";
  const w = c.measureText(text).width, x0 = align === "left" ? x : x - w / 2;
  c.fillStyle = "rgba(10,14,18,0.78)"; c.fillRect(x0 - 3, y - fs - 2, w + 6, fs + 4);
  c.fillStyle = col; c.fillText(text, x, y); c.restore();
}

// ---- the people on the mountain ----------------------------------------------------------------------------
// crowd.skiers: [{s, key, at: {x, y, h, d, mode, act, board, trail, lift}}] from skiersIn (mountainGeo.js),
// computed once a frame for the whole mountain; each band draws those standing on it.
function people(K, crowd) {
  const { G, put, inRect } = K;
  for (const p of crowd?.skiers || []) {
    const a = p.at;
    if (!inRect(a.x, a.y)) continue;
    put(a.x, a.y, () => { try { skier(K, p); } catch { /* a sprite not ready never stops the frame */ } }, a.mode === "lift" ? 0.26 : ON_TRAIL);
  }
  // THE WEEKEND RACE: the racer on the course (race.js), drawn from their record (projected)
  const R = crowd?.race, cur = R?.phase === "on" ? R.cur : null;
  if (cur) {
    const a = racerAt(cur.f, cur.dnf), r = RACER[cur.slug];
    if (inRect(a.x, a.y)) put(a.x, a.y, () => skier(K, { s: projected(cur.slug, r[1], G.lookup), key: cur.slug, at: { ...a, board: r[2] === "BOARD", act: a.act === "ski" && r[2] === "BOARD" ? "snowboard" : a.act }, bib: cur.bib }), ON_TRAIL);
  }
}
const SUIT = ["#ef4444", "#1d4ed8", "#facc15", "#10b981", "#f97316", "#a855f7", "#0f172a", "#ec4899"];
function skier(K, p) {
  const { G, lod } = K, c = G.ctx, a = p.at, s = p.s;
  const [sx, sy] = G.Q(a.x, a.y, a.h);
  if (sx < -40 || sx > G.w + 40 || sy < -60 || sy > G.h + 40) return;
  const suit = p.patrol ? "#b91c1c" : SUIT[(phaseOf(p.key) * SUIT.length) | 0];
  if (lod === "far") { c.fillStyle = p.patrol ? "#ef4444" : FAMILY_COLOR[familyOf(s).family] || suit; c.fillRect(Math.round(sx) - 1, Math.round(sy) - 2, 2, 2); return; }
  const hh0 = G.z * STOREY * 0.95, k = statureOf(s), hpx = hh0 * k;
  let box;
  const face = a.d ? (G.Q(a.x + a.d[0], a.y + a.d[1], a.h)[0] > sx ? 1 : -1) : 1;
  if (a.mode === "lift" && a.cabin) return;   // inside a cabin: the windows show them
  if (lod === "mid" || hpx < 18) {
    const m = miniFor(s), sc = hpx / (SPRITE_H / 2);
    try { c.drawImage(m, Math.round(sx - (SPRITE_W / 4) * sc), Math.round(sy - hpx), Math.round((SPRITE_W / 2) * sc), Math.round(hpx)); } catch { /* not decoded yet */ }
    box = [sx - hpx * 0.3, sy - hpx, sx + hpx * 0.3, sy];
  } else {
    const act = a.act || (a.mode === "lift" ? "sit" : "stand");
    box = drawPose(c, sheetFor(s), { kind: a.mode === "lift" ? "seat" : "stand", act, face, walk: null }, act, sx, sy, hh0, K.t, phaseOf(p.key), k);
  }
  if (a.mode === "ski" && lod === "mid") {
    // skis or a board under the mini sprite, along the line of travel
    const d = a.d || [0, 1];
    if (a.board) { const [bx, by] = G.Q(a.x, a.y, a.h + 0.01); c.fillStyle = suit; c.beginPath(); c.ellipse(bx, by, hpx * 0.32, hpx * 0.08, 0, 0, Math.PI * 2); c.fill(); }
    else { const A0 = G.Q(a.x - d[0] * 0.4, a.y - d[1] * 0.4, a.h + 0.01), A1 = G.Q(a.x + d[0] * 0.4, a.y + d[1] * 0.4, a.h + 0.01); c.strokeStyle = suit; c.lineWidth = Math.max(1, G.z * 0.07); c.beginPath(); c.moveTo(A0[0], A0[1]); c.lineTo(A1[0], A1[1]); c.stroke(); }
  }
  if (p.bib && box) { const cx = (box[0] + box[2]) / 2, cy = box[1] + (box[3] - box[1]) * 0.42, fs = Math.max(6, Math.round((box[3] - box[1]) * 0.18)); c.fillStyle = "#f8fafc"; c.fillRect(cx - fs * 0.8, cy - fs * 0.6, fs * 1.6, fs * 1.1); c.fillStyle = "#b91c1c"; c.font = `bold ${fs}px "Fira Mono", monospace`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(String(p.bib), cx, cy); }
  if (p.patrol && box) { const cx = (box[0] + box[2]) / 2, cy = box[1] + (box[3] - box[1]) * 0.35, r = Math.max(2, (box[2] - box[0]) * 0.18); c.fillStyle = "#f8fafc"; c.fillRect(cx - r, cy - r * 0.35, r * 2, r * 0.7); c.fillRect(cx - r * 0.35, cy - r, r * 0.7, r * 2); }
  if (!s.crowd && box) G.hits.push({ kind: "p", s, box });
}
export { lightsOn };
