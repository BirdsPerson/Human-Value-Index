// THE ATTRITION in the iso view (CityIso.jsx; the data: river.js). The flat water (the main stem from
// the edge of the world to the sea, THE BURNOUT where it leaves the mountain), its banks, the road and
// foot bridges, the riverside path, the pocket parks: drawn into the city's cached ground layer (redrawn
// only when the camera moves). Over it, each frame, the flow: short light dashes drifting downstream
// (still under reduced motion). The lots that paint their own ground over the river (THE FOOTHILLS, THE
// BEACH) and the mountain's bands (painted cell by cell, back to front) draw their own reach of it as
// extras in their own pass: the foothills' reach and the trail bridge, the estuary on the sand, and on
// the mountain THE BURNOUT draped on the terrain (falls and rapids) and THE RETENTION POOL on its bench.
// The viaducts carry their own spans (CityIso: a truss over the water, no pier in it).

import { rot } from "./iso.js";
import { BUILDING } from "./sim.js";
import { terrainH, MTN, SLOPES_TOP } from "./mountainGeo.js";
import { MAIN, MELT, TARN, ESTUARY, BRIDGES, PARKS, PATH, FISHING_SPOTS, NAME, MOTTO, SEA_Y, railBridgeAt, pointAt } from "./river.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const frac = (v) => ((v % 1) + 1) % 1;
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16), c = (s) => clamp(Math.round(((n >> s) & 255) * f), 0, 255);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
};
const mix = (a, b, k) => {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16), c = (s) => Math.round(((A >> s) & 255) * (1 - k) + ((B >> s) & 255) * k);
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, "0")}`;
};
export const WATER = { river: "#2f7397", deep: "#255f80", sea: "#1f5f86", foam: "#e8f4f8", stone: "#5b646c", earth: "#4a3f2c", rock: "#6f767e", deck: "#5d6267", kerb: "#a2a9ae", timber: "#7a5a3a", steel: "#3d4d57", path: "#3a403b" };

// The mountain's bands (painted by the mountain): x from its west edge, north of THE SLOPES' top.
const inBands = (x, y) => x >= MTN.x0 && y < SLOPES_TOP;
// The lots that paint over the ground: THE FOOTHILLS and THE BEACH (their own reach is their extra).
export const FOOTHILLS_LOT = BUILDING["the-foothills"].rect;
export const BEACH_LOT = BUILDING["the-beach"].rect;

// ---- the reaches: the courses cut into chunks of a few samples (a chunk is culled, filled, hit) ----------
const CH = 14;
function chunks(C, keep) {
  const out = [];
  let run = [];
  C.pts.forEach((p, i) => {
    if (keep(p)) { run.push(i); if (run.length >= CH) { out.push(run); run = [i]; } }
    else { if (run.length > 1) out.push(run); run = []; }
  });
  if (run.length > 1) out.push(run);
  return out.map(ix => ({ C, i0: ix[0], i1: ix[ix.length - 1] }));
}
// flat: everything but THE BURNOUT's reach on the mountain (a sample counts while its water reaches past the band's edge)
const FLAT = [...chunks(MAIN, () => true), ...chunks(MELT, p => !inBands(p.x - p.w / 2, p.y))];
const MOUNT = chunks(MELT, p => inBands(p.x + p.w / 2, p.y));

// A chunk's outline at `grow` past the water's edge, at the ground's height (h(x, y)).
function outline(K, ch, grow = 0, h = () => 0.004) {
  const P = ch.C.pts, L = [], R = [];
  for (let i = ch.i0; i <= ch.i1; i++) {
    const p = P[i], k = p.w / 2 + grow, nx = -p.dy * k, ny = p.dx * k;
    L.push(K.Q(p.x + nx, p.y + ny, h(p.x + nx, p.y + ny)));
    R.push(K.Q(p.x - nx, p.y - ny, h(p.x - nx, p.y - ny)));
  }
  return [...L, ...R.reverse()];
}
const box = (pts) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
const seen = (K, b, pad = 40) => b[2] > -pad && b[0] < K.w + pad && b[3] > -pad && b[1] < K.h + pad;
function fill(K, pts, col) {
  const c = K.ctx;
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath(); c.fillStyle = col; c.fill();
}
// the water's colour along the way: the river, deepening into the estuary and the sea's own blue
function waterCol(p, nf) {
  const k = clamp((p.y - ESTUARY.y0 + 2) / (SEA_Y - ESTUARY.y0 + 4), 0, 1);
  return shade(mix(WATER.river, WATER.sea, k), nf);
}
const bankOf = (p) => (p.y > SEA_Y - 8 ? null : p.y > -3.8 ? WATER.stone : p.y > -14 ? WATER.earth : WATER.rock);

// ---- the cached ground: water, banks, bridges, the path, the parks ---------------------------------------
// K: {ctx, Q(x, y, h), z, r, w, h}. Into the ground layer, under the grid's lines.
export function drawRiverGround(K, lod, night) {
  const nf = night ? 0.5 : 1, c = K.ctx;
  const hits = [];
  // the banks first (a kerb of stone in the city, earth in the woods, rock on the mountain), then the water
  for (const ch of FLAT) {
    const mid = ch.C.pts[(ch.i0 + ch.i1) >> 1];
    const water = outline(K, ch), b = box(water);
    if (!seen(K, b)) continue;
    const bank = bankOf(mid);
    if (bank && lod !== "far") fill(K, outline(K, ch, mid.y > -3.8 ? 0.16 : 0.28), shade(bank, nf * 0.9));
    fill(K, water, waterCol(mid, nf));
    hits.push({ id: ch.C === MELT ? MELT.id : mid.y >= ESTUARY.y0 ? ESTUARY.id : MAIN.id, hull: water, at: [mid.x, mid.y, 0] });
  }
  // the sandbars at the mouth (the estuary's on the sand are the beach's)
  for (const B of ESTUARY.bars) if (B.y >= SEA_Y - 0.6) bar(K, B, nf);
  if (lod !== "far") {
    // the riverside path: a paved strip along the bank
    c.lineCap = "round"; c.lineJoin = "round";
    for (const seg of PATH) {
      c.strokeStyle = shade(WATER.path, night ? 0.85 : 1); c.lineWidth = Math.max(1.5, K.z * 0.7);
      c.beginPath(); seg.forEach(([x, y], i) => { const [a, b2] = K.Q(x, y, 0.005); if (i) c.lineTo(a, b2); else c.moveTo(a, b2); }); c.stroke();
    }
    for (const P of PARKS) park(K, P, lod, night);
  }
  for (const B of BRIDGES) if (B.kind === "road" || B.kind === "foot") bridge(K, B, lod, night);
  return hits;
}
function bar(K, B, nf) {
  const pts = Array.from({ length: 14 }, (_, k) => { const a = (k / 14) * Math.PI * 2; return K.Q(B.x + Math.cos(a) * B.rx, B.y + Math.sin(a) * B.ry, 0.006); });
  fill(K, pts, shade("#cdb88a", nf));
}
// A bridge across the water: its deck (B.deck cells along the river, the span across it), kerbs and
// railings, the abutments on the banks. Road: concrete; foot: steel; trail: timber.
function bridge(K, B, lod, night) {
  const nf = night ? 0.55 : 1, c = K.ctx;
  const ax = B.dx, ay = B.dy, nx = -B.dy, ny = B.dx, hd = B.deck / 2, hs = B.span / 2;
  const H = B.kind === "road" ? 0.1 : 0.14;
  const at = (u, v, h) => K.Q(B.x + ax * u + nx * v, B.y + ay * u + ny * v, h);
  const deck = B.kind === "road" ? WATER.deck : B.kind === "trail" ? WATER.timber : "#6b6f73";
  // the deck's edge where it faces the viewer, then the deck
  fill(K, [at(-hd, -hs, H), at(hd, -hs, H), at(hd, hs, H), at(-hd, hs, H)], shade(deck, nf * 1.05));
  for (const s of [-1, 1]) fill(K, [at(s * hd, -hs, H), at(s * hd, hs, H), at(s * hd, hs, 0), at(s * hd, -hs, 0)], shade(deck, nf * 0.7));
  if (lod === "far") return;
  // the abutments: a step of stone at each bank
  for (const s of [-1, 1]) fill(K, [at(-hd - 0.1, s * hs, H), at(hd + 0.1, s * hs, H), at(hd + 0.1, s * (hs - 0.3), H), at(-hd - 0.1, s * (hs - 0.3), H)], shade(WATER.kerb, nf * 0.8));
  // railings along both edges (posts and a rail; a road bridge's are a parapet)
  c.strokeStyle = shade(B.kind === "road" ? WATER.kerb : B.kind === "trail" ? "#9a7550" : "#9aa7b0", nf); c.lineWidth = Math.max(1, K.z * 0.05);
  for (const s of [-1, 1]) {
    const top = H + (B.kind === "road" ? 0.18 : 0.32);
    const A = at(s * (hd - 0.05), -hs, top), Bq = at(s * (hd - 0.05), hs, top);
    c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(Bq[0], Bq[1]); c.stroke();
    if (lod === "near" || B.kind !== "road") {
      const n = Math.max(2, Math.round(B.span / 0.6));
      c.beginPath();
      for (let k = 0; k <= n; k++) { const v = -hs + (2 * hs * k) / n, p = at(s * (hd - 0.05), v, H), q = at(s * (hd - 0.05), v, top); c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]); }
      c.stroke();
    }
  }
  if (B.kind === "road" && lod === "near") {
    // the centre line
    c.strokeStyle = night ? "rgba(250,204,21,0.35)" : "rgba(250,204,21,0.6)"; c.lineWidth = 1;
    const A = at(0, -hs + 0.3, H + 0.002), Bq = at(0, hs - 0.3, H + 0.002);
    c.setLineDash([3, 3]); c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(Bq[0], Bq[1]); c.stroke(); c.setLineDash([]);
  }
}
function park(K, P, lod, night) {
  const nf = night ? 0.55 : 1, c = K.ctx;
  fill(K, [K.Q(P.x0, P.y0, 0.004), K.Q(P.x1, P.y0, 0.004), K.Q(P.x1, P.y1, 0.004), K.Q(P.x0, P.y1, 0.004)], shade("#1c4a26", nf));
  const prism = (x0, y0, x1, y1, h0, h1, col) => {
    fill(K, [K.Q(x0, y1, h0), K.Q(x1, y1, h0), K.Q(x1, y1, h1), K.Q(x0, y1, h1)], shade(col, nf * 0.8));
    fill(K, [K.Q(x1, y0, h0), K.Q(x1, y1, h0), K.Q(x1, y1, h1), K.Q(x1, y0, h1)], shade(col, nf * 0.7));
    fill(K, [K.Q(x0, y0, h1), K.Q(x1, y0, h1), K.Q(x1, y1, h1), K.Q(x0, y1, h1)], shade(col, nf));
  };
  for (const [x, y, face] of P.benches) {
    const vert = face === "e" || face === "w";
    if (vert) { prism(x - 0.12, y - 0.45, x + 0.12, y + 0.45, 0.18, 0.24, "#7a5232"); prism(x + (face === "e" ? -0.18 : 0.12), y - 0.45, x + (face === "e" ? -0.12 : 0.18), y + 0.45, 0, 0.5, "#6a4428"); }
    else { prism(x - 0.45, y - 0.12, x + 0.45, y + 0.12, 0.18, 0.24, "#7a5232"); }
  }
  for (const [x, y] of P.trees) {
    const [ax, ay] = K.Q(x, y, 0), [tx, ty] = K.Q(x, y, 0.9), r = Math.max(2, K.z * 0.6);
    c.strokeStyle = shade("#4a3222", nf); c.lineWidth = Math.max(1, K.z * 0.1); c.beginPath(); c.moveTo(ax, ay); c.lineTo(tx, ty); c.stroke();
    c.fillStyle = shade("#2f6b3e", nf); c.beginPath(); c.ellipse(tx, ty - r * 0.4, r, r * 0.85, 0, 0, Math.PI * 2); c.fill();
  }
  if (P.lamp) {
    const [x, y] = P.lamp, [ax, ay] = K.Q(x, y, 0), [tx, ty] = K.Q(x, y, 1.3);
    c.strokeStyle = "#3a3f44"; c.lineWidth = Math.max(1, K.z * 0.06); c.beginPath(); c.moveTo(ax, ay); c.lineTo(tx, ty); c.stroke();
    c.fillStyle = night ? "#fde68a" : "#9aa0a4"; c.fillRect(tx - 2, ty - 1, 4, 3);
    if (night) { const g = c.createRadialGradient(tx, ty, 0, tx, ty, K.z * 1.4); g.addColorStop(0, "rgba(253,230,138,0.3)"); g.addColorStop(1, "rgba(253,230,138,0)"); c.fillStyle = g; c.beginPath(); c.arc(tx, ty, K.z * 1.4, 0, Math.PI * 2); c.fill(); }
  }
}

// ---- the flow: every frame, over the cached ground ------------------------------------------------------
// Light dashes in three lanes drifting downstream (faster where it falls); none on a bridge's deck or
// under a lot that paints over the river (its own extra carries them). t = 0: still.
const SPANS = BRIDGES.filter(b => b.kind === "road" || b.kind === "foot").map(b => [b.s - b.deck / 2 - 0.3, b.s + b.deck / 2 + 0.3]);
const covered = (p) => (p.x >= FOOTHILLS_LOT.x && p.x <= FOOTHILLS_LOT.x + FOOTHILLS_LOT.w && p.y >= FOOTHILLS_LOT.y && p.y <= FOOTHILLS_LOT.y + FOOTHILLS_LOT.h)
  || (p.x >= BEACH_LOT.x && p.x <= BEACH_LOT.x + BEACH_LOT.w + 0.6 && p.y >= BEACH_LOT.y && p.y < SEA_Y) || (p.y >= 88 && p.y <= 91.2);
export function drawRiverFlow(K, lod, t, night) {
  if (lod === "far") return;
  const c = K.ctx;
  c.lineCap = "round";
  c.lineWidth = Math.max(1, K.z * 0.08);
  for (const ch of FLAT) {
    if (ch.C !== MAIN) continue;
    const P = ch.C.pts, a = P[ch.i0], b = P[ch.i1];
    if (b.s - a.s > 50) continue;   // the run off the edge of the world
    const [sx0, sy0] = K.Q(a.x, a.y, 0), [sx1, sy1] = K.Q(b.x, b.y, 0);
    if (!seen(K, [Math.min(sx0, sx1), Math.min(sy0, sy1), Math.max(sx0, sx1), Math.max(sy0, sy1)], 30)) continue;
    flow(K, ch.C, a.s, b.s, t, 1.1, 2.4, night, (p) => !covered(p));
  }
}
// dashes along [s0, s1] of course C: every `gap` cells, `v` cells a second; keep(p) filters
function flow(K, C, s0, s1, t, v, gap, night, keep, h = () => 0.008) {
  const c = K.ctx, ph = (t * v) % gap;
  c.strokeStyle = night ? "rgba(190,220,240,0.22)" : "rgba(232,244,248,0.45)";
  c.beginPath();
  for (let lane = -1; lane <= 1; lane++) {
    const off = lane * 0.28, lag = lane * 0.7;
    for (let s = Math.floor(s0 / gap) * gap + ph + lag; s < s1; s += gap) {
      if (s < s0) continue;
      if (SPANS.some(([a, b]) => s > a && s < b)) continue;
      const p = pointAt(C, s), q = pointAt(C, s + 0.55);
      if (!keep(p)) continue;
      const k = p.w * off, nx = -p.dy * k, ny = p.dx * k;
      const A = K.Q(p.x + nx, p.y + ny, h(p.x, p.y)), B = K.Q(q.x + nx, q.y + ny, h(q.x, q.y));
      c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]);
    }
  }
  c.stroke();
}

// ---- the lots' own reaches ------------------------------------------------------------------------------
// THE FOOTHILLS and THE BEACH paint their ground over the river: their extra (drawn first among their
// items) puts it back, clipped to the lot, with the trail bridge and the estuary's sandbars and flow.
// the stretch of the main stem each lot covers (arclength)
const sRange = (L, y1) => { const s = MAIN.pts.filter(p => p.x >= L.x - 1 && p.x <= L.x + L.w + 1 && p.y >= L.y - 1 && p.y <= y1 + 1).map(p => p.s); return [Math.min(...s), Math.max(...s)]; };
const LOT_S = { foothills: sRange(FOOTHILLS_LOT, FOOTHILLS_LOT.y + FOOTHILLS_LOT.h), beach: sRange(BEACH_LOT, SEA_Y) };
export function lotRiver(K, lot, lod, t, night) {
  const c = K.ctx, nf = night ? 0.5 : 1;
  const L = lot === "foothills" ? FOOTHILLS_LOT : BEACH_LOT;
  c.save();
  const clip = [K.Q(L.x, L.y, 0), K.Q(L.x + L.w, L.y, 0), K.Q(L.x + L.w, L.y + L.h, 0), K.Q(L.x, L.y + L.h, 0)];
  c.beginPath(); clip.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.clip();
  for (const ch of FLAT) {
    if (ch.C !== MAIN) continue;
    const mid = ch.C.pts[(ch.i0 + ch.i1) >> 1];
    if (lot === "foothills" ? !(mid.y > L.y - 3 && mid.y < L.y + L.h + 3) : !(mid.y > L.y - 3 && mid.y < SEA_Y + 2)) continue;
    const water = outline(K, ch, 0, () => 0.014);
    if (!seen(K, box(water))) continue;
    const bank = bankOf(mid);
    if (bank && lod !== "far") fill(K, outline(K, ch, 0.28, () => 0.013), shade(bank, nf * 0.9));
    fill(K, water, waterCol(mid, nf));
  }
  if (lot === "beach") for (const B of ESTUARY.bars) bar(K, { ...B }, nf);
  if (lod !== "far") flow(K, MAIN, LOT_S[lot][0], LOT_S[lot][1], t, 1.1, 2.4, night, (p) => p.x >= L.x && p.x <= L.x + L.w && p.y >= L.y && p.y <= L.y + L.h, () => 0.016);
  c.restore();
  if (lot === "foothills") for (const B of BRIDGES) if (B.kind === "trail") bridge(K, B, lod, night);
}

// ---- THE BURNOUT and THE RETENTION POOL on the mountain ---------------------------------------------
// Pieces for the band's back-to-front pass: each drawn after the ground under it (its key is its
// front-most corner's, as the trails' are). -> [{k, draw}] for the band `rect` at turn r.
export function mountainRiver(K, rect, lod, t, night) {
  const out = [], nf = night ? 0.62 : 1, c = K.ctx;
  const inRect = (x, y) => x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
  const tarnH = TARN_H;
  // painted after every cell of ground under it (cells are up to 2.6 cells a side, far): the front-most
  // corner pushed out by half a cell, as the trails' are
  const pad = lod === "far" ? 1.3 : lod === "mid" ? 0.75 : 0.5;
  const key = (pts) => Math.max(...pts.map(([x, y]) => { const [u, v] = rot(x, y, K.r); return u + v; })) + 2 * pad - 0.3 + 0.012;
  for (const pc of MOUNT_PIECES) {
    if (!inRect(pc.mx, pc.my)) continue;
    const { a, b, ha, hb, drop, corners, bank, white, i } = pc;
    out.push({ k: key(corners), draw: () => {
      const S = corners.map(([x, y, h]) => K.Q(x, y, h));
      if (!seen(K, box(S))) return;
      // the bank (rock), the water: white where it falls
      fill(K, bank.map(([x, y, h]) => K.Q(x, y, h)), shade(WATER.rock, nf * 0.85));
      fill(K, S, shade(mix(WATER.river, WATER.foam, white * 0.7), nf));
      K.hits?.push({ kind: "river", id: MELT.id, hull: S, at: [pc.mx, pc.my, (ha + hb) / 2] });
      if (lod === "far") return;
      // rapids and falls: foam streaks that run with the water
      const n = 1 + Math.round(white * 3), sp = t * (1.5 + drop * 2.5), lift = pc.lift + 0.01;
      c.strokeStyle = night ? "rgba(200,225,240,0.5)" : "rgba(248,252,255,0.85)"; c.lineWidth = Math.max(1, K.z * (0.06 + white * 0.05));
      c.beginPath();
      for (let k = 0; k < n; k++) {
        const f = frac(k / n + sp * 0.35 + i * 0.37), g = Math.min(1, f + 0.35 + white * 0.3), lane = ((k * 0.618 + i * 0.29) % 1 - 0.5) * 0.6 * a.w;
        const A = K.Q(a.x + (b.x - a.x) * f - a.dy * lane, a.y + (b.y - a.y) * f + a.dx * lane, ha + (hb - ha) * f + lift), B = K.Q(a.x + (b.x - a.x) * g - a.dy * lane, a.y + (b.y - a.y) * g + a.dx * lane, ha + (hb - ha) * g + lift);
        c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]);
      }
      c.stroke();
      // a fall: spray standing off the drop
      if (drop > 1.05 && lod === "near") {
        const [mx, my] = K.Q(pc.mx, pc.my, (ha + hb) / 2 + pc.lift + 0.25);
        c.fillStyle = night ? "rgba(200,225,240,0.18)" : "rgba(255,255,255,0.35)";
        c.beginPath(); c.ellipse(mx, my, K.z * 0.55, K.z * 0.3, 0, 0, Math.PI * 2); c.fill();
      }
    } });
  }
  // THE RETENTION POOL: flat water on its bench, a rim of rock, the outflow's lip
  if (inRect(TARN.x, TARN.y)) {
    const ring = (rx, ry, h) => Array.from({ length: 28 }, (_, k) => { const a = (k / 28) * Math.PI * 2; return K.Q(TARN.x + Math.cos(a) * rx, TARN.y + Math.sin(a) * ry, h); });
    const ext = [[TARN.x - TARN.rx - 0.4, TARN.y - TARN.ry - 0.4], [TARN.x + TARN.rx + 0.4, TARN.y + TARN.ry + 0.4], [TARN.x + TARN.rx + 0.4, TARN.y - TARN.ry - 0.4], [TARN.x - TARN.rx - 0.4, TARN.y + TARN.ry + 0.4]];
    out.push({ k: key(ext), draw: () => {
      const rim = ring(TARN.rx + 0.35, TARN.ry + 0.3, tarnH + 0.03), water = ring(TARN.rx, TARN.ry, tarnH + 0.06);
      if (!seen(K, box(rim))) return;
      fill(K, rim, shade("#6f767e", nf * 0.9));
      fill(K, water, shade(WATER.deep, nf));
      fill(K, ring(TARN.rx * 0.62, TARN.ry * 0.55, tarnH + 0.065), shade(WATER.river, nf));
      K.hits?.push({ kind: "river", id: TARN.id, hull: water, at: [TARN.x, TARN.y, tarnH] });
      if (lod === "far") return;
      // the surface: slow rings drifting out from where THE BURNOUT falls in
      c.strokeStyle = night ? "rgba(190,220,240,0.25)" : "rgba(232,244,248,0.5)"; c.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        const f = frac(t * 0.18 + k / 3), [cx, cy] = K.Q(TARN.x + 0.9, TARN.y - 1.1, tarnH + 0.07);
        c.globalAlpha = 1 - f; c.beginPath(); c.ellipse(cx, cy, K.z * (0.3 + f * 1.4), K.z * (0.15 + f * 0.7), 0, 0, Math.PI * 2); c.stroke();
      }
      c.globalAlpha = 1;
    } });
  }
  return out;
}

// THE BURNOUT's pieces on the mountain, worked out once (the ground never moves): the water's quad and
// its bank's at the ground's height, how fast it drops (white where it falls)
const TARN_H = terrainH(TARN.x, TARN.y);
const MOUNT_PIECES = MOUNT.flatMap(ch => {
  const P = MELT.pts, out = [];
  for (let i = ch.i0 + 1; i <= ch.i1; i++) {
    const a = P[i - 1], b = P[i];
    const inTarn = (p) => ((p.x - TARN.x) / TARN.rx) ** 2 + ((p.y - TARN.y) / TARN.ry) ** 2 < 0.8;
    if (inTarn(a) && inTarn(b)) continue;
    const ha = terrainH(a.x, a.y), hb = terrainH(b.x, b.y), drop = (ha - hb) / Math.max(0.05, b.s - a.s), lift = 0.06 + 0.04 * drop;
    const side = (p, sg, k) => { const x = p.x - p.dy * k * sg, y = p.y + p.dx * k * sg; return [x, y, terrainH(x, y)]; };
    const corners = [[a, 1], [b, 1], [b, -1], [a, -1]].map(([p, sg]) => { const q = side(p, sg, p.w / 2); q[2] += lift; return q; });
    const bank = [[a, 1], [b, 1], [b, -1], [a, -1]].map(([p, sg]) => { const q = side(p, sg, p.w / 2 + 0.22); q[2] += lift * 0.5; return q; });
    out.push({ i, a, b, ha, hb, drop, lift, corners, bank, white: clamp((drop - 0.45) / 0.9, 0, 1), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 });
  }
  return out;
});

// ---- the viaducts' spans over the water --------------------------------------------------------------
// pts: a deck's centreline (map points), hw: its half-width, z: the deck's top (storeys). Where it is over
// a rail bridge's water: a through truss on both edges (steel: chords, posts, diagonals).
export function drawGirders(K, pts, hw, z, lod, night) {
  const c = K.ctx, col = night ? "#2a343b" : WATER.steel, top = z + 0.5, bot = z - 0.12;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(L / 0.25));
    let k0 = -1, k1 = -1;
    for (let k = 0; k <= n; k++) { const f = k / n, x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f; if (railBridgeAt(x, y, 0.2)) { if (k0 < 0) k0 = k; k1 = k; } }
    if (k0 < 0 || k1 <= k0) continue;
    const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], p = [-d[1], d[0]];
    const at = (f, s, h) => K.Q(a[0] + (b[0] - a[0]) * f + p[0] * hw * s, a[1] + (b[1] - a[1]) * f + p[1] * hw * s, h);
    const f0 = k0 / n, f1 = k1 / n;
    c.strokeStyle = col; c.lineWidth = Math.max(1, K.z * 0.07);
    for (const s of [-1, 1]) {
      c.beginPath();
      const A = at(f0, s, top), B = at(f1, s, top), C0 = at(f0, s, bot), C1 = at(f1, s, bot);
      c.moveTo(C0[0], C0[1]); c.lineTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.lineTo(C1[0], C1[1]);
      if (lod !== "far") {
        const m = Math.max(2, Math.round(((f1 - f0) * L) / 0.45));
        for (let k = 0; k < m; k++) {
          const g0 = f0 + (f1 - f0) * (k / m), g1 = f0 + (f1 - f0) * ((k + 1) / m);
          const P0 = at(g0, s, bot), P1 = at(g1, s, top), Pv = at(g1, s, bot);
          c.moveTo(P0[0], P0[1]); c.lineTo(P1[0], P1[1]); c.moveTo(Pv[0], Pv[1]); c.lineTo(P1[0], P1[1]);
        }
      }
      c.stroke();
    }
  }
}

// ---- the fishing spots (a float on the water, near), and the names for hover ----------------------------
export function drawSpots(K, lod, t, night, hits) {
  if (lod !== "near") return;
  const c = K.ctx;
  for (const f of FISHING_SPOTS) {
    if (f.water === "lake" || f.y < -40.5 && f.x >= MTN.x0) continue;   // the pool is the mountain's to paint
    const bob = Math.sin(t * 2.2 + f.x) * 0.05;
    const [x, y] = K.Q(f.x, f.y, 0.06 + bob);
    if (x < -20 || y < -20 || x > K.w + 20 || y > K.h + 20) continue;
    const r = Math.max(2, K.z * 0.16);
    c.strokeStyle = night ? "rgba(190,220,240,0.35)" : "rgba(232,244,248,0.7)"; c.lineWidth = 1;
    const f2 = frac(t * 0.4 + f.x * 0.1);
    c.globalAlpha = 1 - f2; c.beginPath(); c.ellipse(x, y + r * 0.6, r * (1 + f2 * 3), r * (0.5 + f2 * 1.5), 0, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
    c.fillStyle = "#ef4444"; c.beginPath(); c.arc(x, y - r * 0.4, r * 0.7, Math.PI, 0); c.fill();
    c.fillStyle = "#f5f5f4"; c.beginPath(); c.arc(x, y - r * 0.4, r * 0.7, 0, Math.PI); c.fill();
    hits?.push({ kind: "spot", id: f.id, box: [x - r * 3, y - r * 3, x + r * 3, y + r * 2], at: [f.x, f.y, 0.1] });
  }
}
// The names the views show on hover or select (labels-only-on-hover).
export const REACH_NAME = { attrition: NAME, burnout: MELT.name, "retention-pool": TARN.name, outplacement: ESTUARY.name };
export const REACH_LINE = { attrition: MOTTO, burnout: MELT.sub, "retention-pool": TARN.sub, outplacement: ESTUARY.sub };
export const spotName = (id) => { const f = FISHING_SPOTS.find(s => s.id === id); return f ? `${f.name} // FISHING` : null; };
