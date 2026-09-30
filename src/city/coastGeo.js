// THE COAST and THE HEIGHTS as the iso view builds them (Scott 2026-09-30: "keep building the
// city outward... mountain and ski resort type stuff, maybe a resort area like a beach area").
// Pure, like parkGeo.js and civicGeo.js: every line, prop and ANCHOR in map cells from the sim's
// lots, so scripts/check-coast.mjs can hold everything on its own ground and nobody on anybody.
//
// The open ground: the beach (towels, umbrellas, lifeguard towers, a volleyball net, the
// shallows), the boardwalk (planks, stalls, benches, the wheel), the pier (a deck on piles into
// the sea, rods over both rails), the break (waves, surfers). The mountain: THE SLOPES (a snow
// field rising to a ridge, pistes, pines, the chairlift) and the upper-slope parcel beside it,
// one terrain across both. The resort parcels wait for THE ASSEMBLY's session 002.
//
// Anchors are {id, x, y, h, kind, act, role, look, path?}: a `path` anchor moves (a skier down a
// piste, a chair up the lift, a surfer on a wave): its place at time t is pathAt(anchor, t).

import { PLACES, SPURS } from "./sim.js";

export const COAST_LOTS = {
  "the-beach": "beach", "the-boardwalk": "boardwalk", "the-pier": "pier", "the-break": "surf", "lot-shore": "shore-lot",
  "the-slopes": "slopes", "lot-summit": "summit-lot",
};
export const COAST_PLACES = Object.values(COAST_LOTS);
const rect = (id) => PLACES[id].rect;
const A = (id, x, y, kind, act, role = "patron", extra = {}) => ({ id, x, y, h: 0, kind, act, role, look: null, ring: null, ...extra });
const frac = (v) => ((v % 1) + 1) % 1;

// ---- the sea -------------------------------------------------------------------------------------
// The coast's southern rows are water from SEA_Y (the beach's edge) to the district's end.
export const SEA_Y = 86;
export const SEA = { x0: -3, x1: 112, y0: SEA_Y, y1: 93 };

// ---- the mountain ------------------------------------------------------------------------------
// One terrain over the slopes and the parcel beside them: flat at the village's back (y -11),
// rising to a ridge (RIDGE of the way north), two peaks, then falling away on the far side to
// the district's north edge. Heights in storeys.
export const TERRAIN = { x0: 9, x1: 100, y0: -30.5, y1: -11 };
export const RIDGE = 0.8;
export const RIDGE_Y = TERRAIN.y1 - RIDGE * (TERRAIN.y1 - TERRAIN.y0);
export function terrainH(x, y) {
  const T = TERRAIN;
  if (x < T.x0 || x > T.x1 || y < T.y0 || y > T.y1) return 0;
  const s = Math.min(1, Math.max(0, (T.y1 - y) / (T.y1 - T.y0)));
  const bump = 2.6 * Math.exp(-((x - 30) ** 2) / 70) + 3.2 * Math.exp(-((x - 79) ** 2) / 90);
  const up = Math.min(1, s / RIDGE), f = s <= RIDGE ? Math.pow(up, 1.3) : 1 - 0.9 * Math.pow((s - RIDGE) / (1 - RIDGE), 0.9);
  return f * (5.2 + 1.1 * Math.sin(x * 0.19) + 0.5 * Math.sin(x * 0.53 + 1.3) + bump * up);
}
export const TERRAIN_MAX = 10;
export const onTerrain = (x, y) => x >= TERRAIN.x0 && x <= TERRAIN.x1 && y >= TERRAIN.y0 && y <= TERRAIN.y1;

// ---- THE BEACH ------------------------------------------------------------------------------------
const Bc = rect("beach");
export const BEACH = (() => {
  const x0 = Bc.x, x1 = Bc.x + Bc.w, y0 = Bc.y, y1 = Bc.y + Bc.h;
  const towers = [x0 + 11, x0 + 31, x0 + 51].map(x => ({ x, y: y0 + 1.6, h: 1.25 }));
  const net = { x: x0 + 21, y0: y0 + 1.0, y1: y0 + 3.2 };
  const towels = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 14; c++) {
    const x = x0 + 2.2 + c * 4.3 + (r % 2) * 1.6, y = y0 + 3.7 + r * 0.9;
    if (x > x1 - 1.2) continue;
    if (Math.abs(x - net.x) < 2.4 && y < net.y1 + 0.9) continue;
    towels.push({ x, y, col: ["#ef4444", "#3b82f6", "#facc15", "#f472b6", "#22c55e", "#f97316"][(r * 5 + c) % 6] });
  }
  const umbrellas = towels.filter((_, i) => i % 3 === 1).map(t => ({ x: t.x + 0.55, y: t.y - 0.25 }));
  return { lot: Bc, towers, net, towels, umbrellas };
})();
function beachAnchors() {
  const out = [];
  for (const t of BEACH.towers) out.push(A(`tower${t.x}`, t.x, t.y, "stand", "view", "staff", { h: t.h, look: [t.x, SEA_Y + 2] }));
  const n = BEACH.net;
  [[-1.1, 0.3], [-1.1, 1.7], [1.1, 0.5], [1.1, 1.9]].forEach(([dx, dy], i) => out.push(A(`volley${i}`, n.x + dx, n.y0 + dy, "stand", i % 2 ? "jump" : "throw", "patron", { look: [n.x, n.y0 + dy] })));
  BEACH.towels.forEach((t, i) => out.push(A(`towel${i}`, t.x, t.y, "stand", i % 4 === 3 ? "read" : "sleep", "patron", { towel: t.col })));
  // the shallows: swimmers up to the waist
  for (let i = 0; out.length < PLACES.beach.cap; i++) out.push(A(`swim${i}`, Bc.x + 3.5 + (i * 7.9) % (Bc.w - 7), SEA_Y + 0.8 + (i % 3) * 0.55, "stand", "view", "patron", { swim: true, look: [Bc.x + 3.5 + (i * 7.9) % (Bc.w - 7), SEA_Y - 2] }));
  return out;
}

// ---- THE BOARDWALK ----------------------------------------------------------------------------------
const Bw = rect("boardwalk");
export const BOARDWALK = (() => {
  const x0 = Bw.x, y0 = Bw.y, y1 = Bw.y + Bw.h;
  const stalls = [0, 1, 2, 3, 4, 5].map(i => ({ x: x0 + 5 + i * 10, y: y0 + 0.55, kind: ["ICE CREAM", "HOT DOGS", "SOUVENIRS", "LEMONADE", "TAFFY", "BAIT"][i] }));
  const benches = Array.from({ length: 8 }, (_, i) => ({ x: x0 + 4.3 + i * 8.2, y: y1 - 0.45 }));
  const lamps = Array.from({ length: 9 }, (_, i) => [x0 + 1 + i * 8.2, y1 - 0.2]);
  const wheel = { x: x0 + Bw.w - 3.2, y: y0 + 1.3, r: 2.4 };   // THE WHEEL, at the pier end
  return { lot: Bw, stalls, benches, lamps, wheel };
})();
function boardwalkAnchors() {
  const out = [];
  for (const s of BOARDWALK.stalls) out.push(A(`stall${s.x}`, s.x, s.y + 0.75, "stand", "sell", "staff", { look: [s.x, Bw.y + Bw.h] }));
  for (const b of BOARDWALK.benches) out.push(A(`bench${b.x}`, b.x, b.y - 0.02, "seat", b.x % 2 < 1 ? "eat" : "sit", "patron", { look: [b.x, SEA_Y] }));
  for (let i = 0; out.length < PLACES.boardwalk.cap; i++) {
    const x = Bw.x + 2.6 + (i * 4.07) % (Bw.w - 9), y = Bw.y + 1.8 + (i % 2) * 0.4;
    out.push(A(`walk${i}`, x, y, "stand", ["view", "talk", "drink", "cheer"][i % 4], "patron"));
  }
  return out;
}

// ---- THE PIER ---------------------------------------------------------------------------------------
const Pr = rect("pier");
export const PIER = (() => {
  const x0 = Pr.x + 0.8, x1 = Pr.x + Pr.w - 0.8, y0 = Pr.y + 0.1, y1 = Pr.y + Pr.h - 0.3;
  const piles = [];
  for (let y = SEA_Y + 0.6; y < y1; y += 1.6) piles.push([x0 + 0.1, y], [x1 - 0.1, y]);
  return { lot: Pr, deck: { x0, x1, y0, y1, h: 0.35 }, piles, kiosk: { x: (x0 + x1) / 2, y: y0 + 0.7 }, lamps: [[x0 + 0.1, y0 + 3], [x1 - 0.1, y0 + 6], [x0 + 0.1, y1 - 0.4]] };
})();
function pierAnchors() {
  const D = PIER.deck, out = [];
  out.push(A("warden", PIER.kiosk.x + 0.6, PIER.kiosk.y + 0.5, "stand", "guard", "staff", { h: D.h, look: [PIER.kiosk.x, D.y1] }));
  for (let i = 0; i < 7; i++) for (const side of [0, 1]) {
    const x = side ? D.x1 - 0.3 : D.x0 + 0.3, y = D.y0 + 2.2 + i * 1.15;
    out.push(A(`rod${side}${i}`, x, y, "stand", "view", "patron", { h: D.h, rod: side ? 1 : -1, look: [side ? x + 3 : x - 3, y] }));
  }
  for (let i = 0; out.length < PLACES.pier.cap; i++) out.push(A(`pier${i}`, (D.x0 + D.x1) / 2 + (i % 2 ? 0.35 : -0.35), D.y0 + 2.8 + i * 1.6, "stand", i % 2 ? "talk" : "view", "patron", { h: D.h }));
  return out;
}

// ---- THE BREAK ----------------------------------------------------------------------------------------
const Sf = rect("surf");
export const BREAK = { lot: Sf, waves: [0, 1, 2].map(k => Sf.y + 0.9 + k * 1.1) };
function surfAnchors() {
  const out = [A("instructor", Sf.x + 1.4, Sf.y + 0.7, "stand", "shout", "staff", { swim: true, look: [Sf.x + 6, Sf.y + 2] })];
  for (let i = 0; out.length < PLACES.surf.cap; i++) {
    const lane = i % 3, x = Sf.x + 3 + ((i * 6.3) % (Sf.w - 8));
    // a surfer rides in along their wave, drifting shoreward, and paddles back out
    out.push(A(`surfer${i}`, x, BREAK.waves[lane], "stand", "view", "patron", { surf: true, path: { kind: "wave", x, y0: BREAK.waves[lane] + 0.9, y1: BREAK.waves[lane] - 0.6, drift: 2.2, period: 11 + (i % 5), phase: (i * 0.37) % 1 } }));
  }
  return out;
}

// ---- THE SLOPES --------------------------------------------------------------------------------------
const Sl = rect("slopes");
// The chairlift up the west side; three pistes down: green (the easy one, winding), blue, black.
const TOP = RIDGE_Y + 0.4;   // the pistes start just below the ridge
export const LIFT = { x: Sl.x + 6.5, y0: Sl.y + Sl.h - 0.8, y1: TOP, gap: 0.3, spacing: 1.6, speed: 0.55 };   // speed: cells a real second
export const PISTES = [
  { id: "green", col: "#4ade80", pts: [[Sl.x + 9, TOP + 0.2], [Sl.x + 15, TOP + 3], [Sl.x + 11, TOP + 6.5], [Sl.x + 17, TOP + 10.5], [Sl.x + 13, Sl.y + Sl.h - 1.2]] },
  { id: "blue", col: "#3b82f6", pts: [[Sl.x + 22, TOP + 0.1], [Sl.x + 27, TOP + 4], [Sl.x + 24, TOP + 9], [Sl.x + 29, Sl.y + Sl.h - 1.2]] },
  { id: "black", col: "#111827", pts: [[Sl.x + 37, TOP + 0.1], [Sl.x + 39, TOP + 5], [Sl.x + 36, TOP + 10], [Sl.x + 40, Sl.y + Sl.h - 1.2]] },
];
export const SLOPE_HUTS = { base: { x: LIFT.x + 1.4, y: LIFT.y0 - 0.2 }, top: { x: LIFT.x + 1.4, y: LIFT.y1 + 0.3 }, patrol: { x: Sl.x + 20, y: TOP + 0.3 } };
const segLen = (pts) => { let n = 0; for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return n; };
export function alongPts(pts, k) {
  let want = segLen(pts) * Math.min(1, Math.max(0, k));
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], d = Math.hypot(bx - ax, by - ay);
    if (want <= d || i === pts.length - 1) { const f = d ? Math.min(1, want / d) : 1; return [ax + (bx - ax) * f, ay + (by - ay) * f, (bx - ax) / (d || 1), (by - ay) / (d || 1)]; }
    want -= d;
  }
  return [...pts[pts.length - 1], 0, 1];
}
// Distance from a point to a piste's line (for grooming the snow and keeping the pines off it).
export function offPiste(x, y) {
  let best = Infinity;
  for (const p of PISTES) for (let i = 1; i < p.pts.length; i++) {
    const [ax, ay] = p.pts[i - 1], [bx, by] = p.pts[i], vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
    best = Math.min(best, Math.hypot(x - ax - vx * t, y - ay - vy * t));
  }
  return best;
}
// The pines: on the slopes and the parcel, off the pistes, clear of the lift line.
export const PINES = (() => {
  const out = [];
  for (let i = 0; i < 420; i++) {
    const x = TERRAIN.x0 + 0.8 + frac(i * 0.6180339 + 0.21) * (TERRAIN.x1 - TERRAIN.x0 - 1.6), y = TERRAIN.y0 + 1.2 + frac(i * 0.7548776 + 0.43) * (TERRAIN.y1 - TERRAIN.y0 - 2.4);
    const t = (TERRAIN.y1 - y) / (TERRAIN.y1 - TERRAIN.y0);
    if (t > 0.8 || offPiste(x, y) < 1.6 || Math.abs(x - LIFT.x) < 1.3) continue;
    if (frac(i * 0.4142) > 0.55 + 0.3 * (1 - t)) continue;   // thinner towards the top
    out.push([x, y]);
  }
  return out;
})();
function slopesAnchors() {
  const out = [];
  const H = SLOPE_HUTS;
  out.push(A("liftop-base", H.base.x - 0.2, H.base.y + 0.7, "stand", "signal", "staff", { look: [LIFT.x, LIFT.y0] }));
  out.push(A("liftop-top", H.top.x - 0.2, H.top.y + 0.8, "stand", "signal", "staff", { look: [LIFT.x, LIFT.y1] }));
  out.push(A("patrol0", H.patrol.x + 1.2, H.patrol.y + 0.9, "stand", "view", "staff", { look: [H.patrol.x + 3, H.patrol.y + 6] }));
  out.push(A("patrol1", H.patrol.x - 1.0, H.patrol.y + 1.0, "stand", "whistle", "staff", { look: [H.patrol.x, H.patrol.y + 6] }));
  out.push(A("instructor", Sl.x + 20, Sl.y + Sl.h - 1.3, "stand", "coach", "staff", { look: [Sl.x + 22, Sl.y + Sl.h - 1.3] }));
  // skiers: twelve on each piste, spread down it, at their own pace
  PISTES.forEach((p, pi) => { for (let k = 0; k < 12; k++) out.push(A(`ski${p.id}${k}`, p.pts[0][0], p.pts[0][1], "stand", "view", "patron", { ski: true, path: { kind: "piste", piste: pi, period: 26 + pi * 4 + (k % 4) * 3, phase: frac(k / 12 + pi * 0.11) } })); });
  // riders on the chairs, going up
  for (let k = 0; k < 12; k++) out.push(A(`chair${k}`, LIFT.x - LIFT.gap, LIFT.y0, "seat", "sit", "patron", { chair: k, path: { kind: "lift", slot: k * 2 } }));
  // the queue at the bottom, and the learners with the instructor
  for (let k = 0; out.length < PLACES.slopes.cap; k++) out.push(A(`queue${k}`, LIFT.x - 1.3 - (k % 3) * 0.6, LIFT.y0 + 0.2 - Math.floor(k / 3) * 0.55, "stand", k % 2 ? "cheer" : "view", "patron", { look: [LIFT.x, LIFT.y0 - 2] }));
  return out;
}
// The lift's loop: chairs spaced along the cable, up the west side, down the east.
export function liftChair(slot, t) {
  const L = LIFT, len = L.y0 - L.y1, lap = 2 * len, n = Math.floor(lap / L.spacing);
  const s = ((slot / n) * lap + t * L.speed) % lap;
  return s < len ? { x: L.x - L.gap, y: L.y0 - s, up: true } : { x: L.x + L.gap, y: L.y1 + (s - len), up: false };
}
export const liftChairs = () => Math.floor((2 * (LIFT.y0 - LIFT.y1)) / LIFT.spacing);
// Where a moving anchor is at time t (real seconds; 0 = at rest). -> [x, y, h, dx, dy]
export function pathAt(a, t) {
  const p = a.path;
  if (!p) return [a.x, a.y, a.h || 0, 0, 1];
  if (p.kind === "piste") {
    const k = frac(t / p.period + p.phase), pts = PISTES[p.piste].pts;
    const [x, y, dx, dy] = alongPts(pts, k), wig = Math.sin(k * 40 + p.phase * 9) * 0.45;
    const X = x - dy * wig, Y = y + dx * wig;
    return [X, Y, terrainH(X, Y), dx, dy];
  }
  if (p.kind === "lift") { const c = liftChair(p.slot, t); return [c.x, c.y, terrainH(c.x, c.y) + 1.05, 0, c.up ? -1 : 1]; }
  if (p.kind === "wave") {
    const k = frac(t / p.period + p.phase), ride = k < 0.6, f = ride ? k / 0.6 : (k - 0.6) / 0.4;
    const y = ride ? p.y0 + (p.y1 - p.y0) * f : p.y1 + (p.y0 - p.y1) * f, x = p.x + (ride ? f : 1 - f) * p.drift;
    return [x, y, 0, ride ? 1 : -1, 0, ride];
  }
  return [a.x, a.y, 0, 0, 1];
}

// ---- the resort parcels (THE ASSEMBLY, session 002) ------------------------------------------------------
const Sh = rect("shore-lot"), Su = rect("summit-lot");
export const SHORE = { lot: Sh, sign: { a: [Sh.x + 0.8, Sh.y + Sh.h - 0.5], b: [Sh.x + 4.6, Sh.y + Sh.h - 0.5], h0: 0.45, h1: 1.5 }, grass: Array.from({ length: 30 }, (_, i) => [Sh.x + 0.6 + frac(i * 0.618 + 0.1) * (Sh.w - 1.2), Sh.y + 0.6 + frac(i * 0.382 + 0.7) * (Sh.h - 1.2)]) };
export const SUMMIT = { lot: Su, sign: { a: [Su.x + 3, Su.y + Su.h - 0.6], b: [Su.x + 7, Su.y + Su.h - 0.6], h0: 0.45, h1: 1.5 } };

export const COAST_ANCHORS = { beach: beachAnchors(), boardwalk: boardwalkAnchors(), pier: pierAnchors(), surf: surfAnchors(), slopes: slopesAnchors(), "shore-lot": [], "summit-lot": [] };

// ---- the spurs as the painter sees them ----------------------------------------------------------------
// The track is flat on the ground (drawn with the ground); the two shelters stand, as boxes.
export const SHELTER = { hw: 0.75, hd: 0.45, h: 1.2 };
export const SPUR_STOPS = Object.values(SPURS).flatMap(sp => [
  { id: `${sp.id}-stop`, spur: sp, at: sp.stopAt, name: sp.stop, end: "stop" },
  { id: `${sp.id}-term`, spur: sp, at: sp.termAt, name: sp.terminal, end: "term" },
]).map(st => {
  // the shelter stands across the end of the track (a buffer stop you can wait under)
  const pts = st.spur.pts, [ex, ey] = st.end === "stop" ? pts[0] : pts[pts.length - 1], [nx, ny] = st.end === "stop" ? pts[1] : pts[pts.length - 2];
  const dx = Math.sign(ex - nx), dy = Math.sign(ey - ny), cx = ex + dx * 0.8, cy = ey + dy * 0.8;
  const hx = dx ? SHELTER.hd : SHELTER.hw, hy = dx ? SHELTER.hw : SHELTER.hd;
  return { ...st, dir: [dx, dy], box: { x0: cx - hx, y0: cy - hy, x1: cx + hx, y1: cy + hy }, c: [cx, cy] };
});
