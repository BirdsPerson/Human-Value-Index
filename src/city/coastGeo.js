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

import { PLACES, SPURS, COAST_DY, HEIGHTS_DY } from "./sim.js";

export const COAST_LOTS = {
  "the-beach": "beach", "the-boardwalk": "boardwalk", "the-pier": "pier", "the-break": "surf", "lot-shore": "shore-lot",
  "the-slopes": "slopes", "lot-summit": "summit-lot",
  "the-foothills": "foothills",   // the master plan's buffer between the CBD and the mountain
};
export const COAST_PLACES = Object.values(COAST_LOTS);
const rect = (id) => PLACES[id].rect;
const A = (id, x, y, kind, act, role = "patron", extra = {}) => ({ id, x, y, h: 0, kind, act, role, look: null, ring: null, ...extra });
const frac = (v) => ((v % 1) + 1) % 1;

// ---- the sea -------------------------------------------------------------------------------------
// The coast's southern rows are water from SEA_Y (the beach's edge) to the district's end.
export const SEA_Y = 86 + COAST_DY;
export const SEA = { x0: -3, x1: 112, y0: SEA_Y, y1: 93 + COAST_DY };

// ---- the mountain ------------------------------------------------------------------------------
// One terrain over the slopes and the parcel beside them: flat at the village's back (y -11),
// rising to a ridge (RIDGE of the way north), two peaks, then falling away on the far side to
// the district's north edge. Heights in storeys.
export const TERRAIN = { x0: 9, x1: 100, y0: -30.5 + HEIGHTS_DY, y1: -11 + HEIGHTS_DY };
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
// A chairlift's loop: chairs spaced along the cable, up the west side, down the east.
export function liftChair(slot, t, L = LIFT) {
  const len = L.y0 - L.y1, lap = 2 * len, n = Math.floor(lap / L.spacing);
  const s = ((slot / n) * lap + t * L.speed) % lap;
  return s < len ? { x: L.x - L.gap, y: L.y0 - s, up: true } : { x: L.x + L.gap, y: L.y1 + (s - len), up: false };
}
export const liftChairs = (L = LIFT) => Math.floor((2 * (L.y0 - L.y1)) / L.spacing);
// Where a moving anchor is at time t (real seconds; 0 = at rest). -> [x, y, h, dx, dy, riding]
export function pathAt(a, t) {
  const p = a.path;
  if (!p) return [a.x, a.y, a.h || 0, 0, 1];
  if (p.kind === "piste" || p.kind === "line") {
    const k = frac(t / p.period + p.phase), pts = p.kind === "piste" ? PISTES[p.piste].pts : p.pts;
    const [x, y, dx, dy] = alongPts(pts, k), wig = Math.sin(k * 40 + p.phase * 9) * (p.wig ?? 0.45);
    const X = x - dy * wig, Y = y + dx * wig;
    return [X, Y, terrainH(X, Y) + (p.h || 0), dx, dy];
  }
  if (p.kind === "lift") { const c = liftChair(p.slot, t, p.lift || LIFT); return [c.x, c.y, terrainH(c.x, c.y) + 1.05, 0, c.up ? -1 : 1]; }
  if (p.kind === "wave") {
    const k = frac(t / p.period + p.phase), ride = k < 0.6, f = ride ? k / 0.6 : (k - 0.6) / 0.4;
    const y = ride ? p.y0 + (p.y1 - p.y0) * f : p.y1 + (p.y0 - p.y1) * f, x = p.x + (ride ? f : 1 - f) * p.drift;
    return [x, y, 0, ride ? 1 : -1, 0, ride];
  }
  if (p.kind === "bob") return [a.x, a.y, a.h || 0, 0, 1];
  return [a.x, a.y, 0, 0, 1];
}

// ---- the resort parcels (THE ASSEMBLY, session 002) ------------------------------------------------------
// Each parcel has a face per phase (sim.resortPhase): vacant (and approved: the sign changes), the
// site (hoarding, a crane, a pit, a crew), and what won. Anchors per face, in fill order.
const Sh = rect("shore-lot"), Su = rect("summit-lot");
export const SHORE = { lot: Sh, sign: { a: [Sh.x + 0.8, Sh.y + Sh.h - 0.5], b: [Sh.x + 4.6, Sh.y + Sh.h - 0.5], h0: 0.45, h1: 1.5 }, grass: Array.from({ length: 30 }, (_, i) => [Sh.x + 0.6 + frac(i * 0.618 + 0.1) * (Sh.w - 1.2), Sh.y + 0.6 + frac(i * 0.382 + 0.7) * (Sh.h - 1.2)]) };
export const SUMMIT = { lot: Su, sign: { a: [Su.x + 3, Su.y + Su.h - 0.6], b: [Su.x + 7, Su.y + Su.h - 0.6], h0: 0.45, h1: 1.5 } };
const sx0 = Sh.x, sy0 = Sh.y, sx1 = Sh.x + Sh.w, sy1 = Sh.y + Sh.h;
const ux0 = Su.x, ux1 = Su.x + Su.w, uy1 = Su.y + Su.h;
// the site on either parcel: a pit, a crane, the site office, the gate
export const PARCEL_SITE = {
  "shore-lot": { lot: Sh, pit: { x0: sx0 + 5, y0: sy0 + 2, x1: sx1 - 8, y1: sy1 - 3.5 }, crane: { x: sx1 - 4, y: sy0 + 1.8, mast: 5, jib: 9, counter: 2 }, cabin: { x0: sx0 + 0.8, y0: sy0 + 0.7, x1: sx0 + 3, y1: sy0 + 1.8, h: 0.75 }, gate: [sx0 + 3.5, sy1 - 0.15] },
  "summit-lot": { lot: Su, pit: { x0: ux0 + 11, y0: uy1 - 5, x1: ux1 - 10, y1: uy1 - 1.2 }, crane: { x: ux1 - 7, y: uy1 - 3.5, mast: 5, jib: 9, counter: 2 }, cabin: { x0: ux0 + 1.5, y0: uy1 - 2.2, x1: ux0 + 3.7, y1: uy1 - 1.1, h: 0.75 }, gate: [ux0 + 5, uy1 - 0.15] },
};
function siteAnchors(pid) {
  const S0 = PARCEL_SITE[pid], P = S0.pit, out = [], hOf = (x, y) => terrainH(x, y);
  const at = (id, x, y, act, extra = {}) => out.push(A(id, x, y, "stand", act, "patron", { h: hOf(x, y), hat: true, ...extra }));
  at("foreman", P.x0 - 1, P.y1 + 0.6, "inspect", { look: [P.x0 + 3, P.y0 + 1] });
  for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) at(`dig${r}${k}`, P.x0 + 1 + k * ((P.x1 - P.x0 - 2) / 5), P.y0 + 0.7 + r * ((P.y1 - P.y0 - 1.4) / 2), r === 1 ? "hammer" : "dig");
  at("craneop", S0.crane.x - 0.7, S0.crane.y + 0.6, "crane");
  const ly1 = S0.lot.y + S0.lot.h;
  for (let k = 0; out.length < 30; k++) at(`haul${k}`, P.x0 + 0.5 + k * 2.2, Math.min(P.y1 + 1.4, ly1 - 0.35) - (k % 2) * 0.45, "haul");
  return out;
}
// THE LOW TIDE RESORT (003): a low hotel in an L, a pool with loungers, a thatched bar, cabanas.
export const BEACH_RESORT = {
  wings: [{ x0: sx0 + 1, y0: sy0 + 0.8, x1: sx0 + 15.5, y1: sy0 + 3.8, h: 3 }, { x0: sx0 + 1, y0: sy0 + 3.8, x1: sx0 + 4.5, y1: sy0 + 7.5, h: 3 }],
  pool: { x0: sx0 + 18.5, y0: sy0 + 1.7, x1: sx0 + 32.5, y1: sy0 + 5.7 },
  bar: { x: sx0 + 10.5, y: sy0 + 7.7, r: 1.2 },
  cabanas: Array.from({ length: 6 }, (_, i) => ({ x: sx0 + 17.5 + i * 3, y: sy1 - 1.2 })),
  palms: [[sx0 + 6.5, sy0 + 5.2], [sx0 + 16.8, sy0 + 2], [sx0 + 34, sy0 + 6.8], [sx0 + 7, sy1 - 1]],
};
function beachResortAnchors() {
  const R = BEACH_RESORT, out = [], P = R.pool;
  out.push(A("bartender0", R.bar.x - 0.35, R.bar.y - 0.1, "stand", "pour", "staff", { look: [R.bar.x, R.bar.y + 2] }));
  out.push(A("bartender1", R.bar.x + 0.35, R.bar.y + 0.1, "stand", "serve", "staff", { look: [R.bar.x, R.bar.y + 2] }));
  for (let k = 0; k < 8; k++) { const a = Math.PI * (0.05 + 0.9 * k / 7); out.push(A(`stool${k}`, R.bar.x + Math.cos(a) * 1.65, R.bar.y + Math.sin(a) * 1.65 * 0.9, "seat", k % 2 ? "drink" : "talk", "patron", { look: [R.bar.x, R.bar.y] })); }
  for (let k = 0; k < 10; k++) out.push(A(`lounger${k}`, P.x0 + 0.7 + k * 1.4, P.y1 + 0.8, "stand", k % 3 === 2 ? "read" : "sleep", "patron", { towel: ["#f97316", "#0ea5e9", "#facc15"][k % 3] }));
  for (let k = 0; k < 6; k++) out.push(A(`pool${k}`, P.x0 + 1.5 + k * 2.1, P.y0 + 1.2 + (k % 2) * 1.5, "stand", "view", "patron", { swim: true, poolH: 0 }));
  for (const [i, c] of R.cabanas.entries()) out.push(A(`cabana${i}`, c.x, c.y, "stand", "sleep", "patron", { towel: "#f5f5f4" }));
  return out;
}
// THE OCEANFRONT TOWERS (004): two towers on a podium, the pool deck between, the promenade.
export const TOWERS = {
  towers: [{ x0: sx0 + 1.5, y0: sy0 + 0.8, x1: sx0 + 8, y1: sy0 + 6, h: 9 }, { x0: sx1 - 8.5, y0: sy0 + 0.8, x1: sx1 - 2, y1: sy0 + 6, h: 9 }],
  podium: { x0: sx0 + 8.5, y0: sy0 + 0.8, x1: sx1 - 9, y1: sy0 + 8, h: 0.8 },
  pool: { x0: sx0 + 11.5, y0: sy0 + 2, x1: sx1 - 12, y1: sy0 + 5.5 },
};
function towersAnchors() {
  const T = TOWERS, P = T.pool, D = T.podium, out = [];
  for (const [i, t] of T.towers.entries()) out.push(A(`doorman${i}`, (t.x0 + t.x1) / 2 + 1.2, t.y1 + 0.5, "stand", "guard", "staff", { look: [(t.x0 + t.x1) / 2, t.y1 + 3] }));
  for (let k = 0; k < 12; k++) out.push(A(`deck${k}`, D.x0 + 0.8 + k * ((D.x1 - D.x0 - 1.6) / 11), P.y1 + 1.3, "stand", k % 4 === 3 ? "read" : "sleep", "patron", { h: D.h, towel: "#e5e7eb" }));
  for (let k = 0; k < 6; k++) out.push(A(`pool${k}`, P.x0 + 1.2 + k * ((P.x1 - P.x0 - 2.4) / 5), P.y0 + 1 + (k % 2) * 1.4, "stand", "view", "patron", { h: D.h, swim: true }));
  for (let k = 0; out.length < 30; k++) out.push(A(`prom${k}`, sx0 + 1.5 + k * 3.3, sy1 - 1.1 - (k % 2) * 0.5, "stand", ["view", "talk", "drink"][k % 3], "patron", { look: [sx0 + 1.5 + k * 3.3, sy1 + 4] }));
  return out;
}
// THE SUMMIT RESORT (005): two more chairlifts, four groomed runs, the luxury lodge at the foot.
const TOP2 = RIDGE_Y + 0.5;
export const LIFTS2 = [
  { x: ux0 + 7, y0: uy1 - 0.8, y1: TOP2, gap: 0.3, spacing: 1.6, speed: 0.6 },
  { x: ux1 - 6, y0: uy1 - 0.8, y1: TOP2, gap: 0.3, spacing: 1.6, speed: 0.6 },
];
export const RUNS2 = [
  [[ux0 + 10, TOP2 + 0.2], [ux0 + 14, TOP2 + 5], [ux0 + 11, TOP2 + 10], [ux0 + 15, uy1 - 1.5]],
  [[ux0 + 19, TOP2 + 0.2], [ux0 + 23, TOP2 + 6], [ux0 + 19, TOP2 + 11], [ux0 + 22, uy1 - 1.5]],
  [[ux0 + 27, TOP2 + 0.2], [ux0 + 25, TOP2 + 5], [ux0 + 29, TOP2 + 10], [ux0 + 27, uy1 - 1.5]],
  [[ux1 - 9, TOP2 + 0.2], [ux1 - 12, TOP2 + 7], [ux1 - 9, TOP2 + 12], [ux1 - 11, uy1 - 1.5]],
];
export const SKI_LODGE = { x0: ux0 + 13, y0: uy1 - 4.3, x1: ux0 + 26, y1: uy1 - 1.6, h: 3.4 };
export const CANNONS = [[ux0 + 12, TOP2 + 4], [ux0 + 24, TOP2 + 3], [ux1 - 14, TOP2 + 5]];
function skiResortAnchors() {
  const L = SKI_LODGE, out = [];
  out.push(A("concierge0", L.x0 + 1, L.y1 + 0.5, "stand", "guard", "staff", { look: [L.x0 + 1, L.y1 + 3] }));
  out.push(A("concierge1", L.x1 - 1, L.y1 + 0.5, "stand", "serve", "staff", { look: [L.x1 - 1, L.y1 + 3] }));
  RUNS2.forEach((pts, ri) => { for (let k = 0; k < 4; k++) out.push(A(`ski${ri}${k}`, pts[0][0], pts[0][1], "stand", "view", "patron", { ski: true, path: { kind: "line", pts, period: 24 + ri * 3 + k * 2, phase: frac(k / 4 + ri * 0.17) } })); });
  LIFTS2.forEach((lift, li) => { for (let k = 0; k < 4; k++) out.push(A(`chair${li}${k}`, lift.x - lift.gap, lift.y0, "seat", "sit", "patron", { path: { kind: "lift", lift, slot: k * 3 + li } })); });
  for (let k = 0; out.length < 32; k++) out.push(A(`terrace${k}`, L.x0 + 3 + k * 1.6, L.y1 + 0.9, "seat", k % 2 ? "drink" : "eat", "patron", { look: [L.x0 + 3 + k * 1.6, L.y0] }));
  return out;
}
// THE HEIGHTS PRESERVE (006): the timber lodge, three trails up through the pines, the lookout.
export const PRESERVE = {
  lodge: { x0: ux0 + 12, y0: uy1 - 3.9, x1: ux0 + 22, y1: uy1 - 1.6, h: 2.2 },
  lookout: { x: ux0 + 21, y: RIDGE_Y + 0.6, h: 2.4 },
  trails: [
    [[ux0 + 13, uy1 - 1.2], [ux0 + 9, uy1 - 6], [ux0 + 15, uy1 - 10], [ux0 + 12, uy1 - 14], [ux0 + 20, RIDGE_Y + 1.4]],
    [[ux0 + 21, uy1 - 1.2], [ux0 + 27, uy1 - 5], [ux0 + 23, uy1 - 11], [ux0 + 22, RIDGE_Y + 1.4]],
    [[ux0 + 22, uy1 - 1.2], [ux1 - 8, uy1 - 7], [ux1 - 12, uy1 - 13], [ux0 + 23, RIDGE_Y + 1.2]],
  ],
};
function preserveAnchors() {
  const P = PRESERVE, L = P.lodge, out = [];
  out.push(A("warden0", L.x0 + 0.8, L.y1 + 0.5, "stand", "guard", "staff", { look: [L.x0, L.y1 + 3] }));
  out.push(A("warden1", P.lookout.x + 0.8, P.lookout.y + 0.3, "stand", "view", "staff", { h: terrainH(P.lookout.x + 0.8, P.lookout.y + 0.3), look: [P.lookout.x, P.lookout.y + 5] }));
  P.trails.forEach((pts, ti) => { for (let k = 0; k < 7; k++) out.push(A(`hike${ti}${k}`, pts[0][0], pts[0][1], "stand", "view", "patron", { hike: true, path: { kind: "line", pts: k % 2 ? pts : [...pts].reverse(), period: 150 + ti * 20 + k * 9, phase: frac(k / 7 + ti * 0.13), wig: 0.08 } })); });
  for (let k = 0; k < 4; k++) { const x = P.lookout.x - 1.6 + k * 1.05, y = P.lookout.y + 1.2; out.push(A(`lookout${k}`, x, y, "stand", k % 2 ? "view" : "talk", "patron", { h: terrainH(x, y), look: [x, y + 6] })); }
  for (let k = 0; out.length < 30; k++) out.push(A(`porch${k}`, L.x0 + 2.4 + k * 1.3, L.y1 + 0.8, "seat", k % 2 ? "drink" : "read", "patron", { look: [L.x0 + 2.4 + k * 1.3, L.y1 + 4] }));
  return out;
}
export const PARCEL_ANCHORS = {
  "shore-lot": { vacant: [], site: siteAnchors("shore-lot"), "beach-resort": beachResortAnchors(), "seaside-towers": towersAnchors() },
  "summit-lot": { vacant: [], site: siteAnchors("summit-lot"), "ski-resort": skiResortAnchors(), "mountain-lodge": preserveAnchors() },
};
// Which face a parcel shows for a resortPhase(): "vacant" | "site" | the winning bid.
export const parcelFace = (p) => (p.phase === "site" ? "site" : p.phase === "built" ? p.winner : "vacant");

// ---- THE FOOTHILLS (the master plan, 2026-09-30) -------------------------------------------------------
// The band between the city and the village: pine forest, a trail winding east to west with a
// bridle loop, benches at the viewpoints, the ranger's post. Flat ground (the mountain rises
// behind the village), the Alpine Line through a cleared right of way.
const Fh = rect("foothills");
const FH_CLEAR = 1.8;   // the spur's right of way: no pines within this of its track
const spurX = SPURS.heights.pts[SPURS.heights.pts.length - 1][0];
export const FOOTHILLS = (() => {
  const x0 = Fh.x, x1 = Fh.x + Fh.w, y0 = Fh.y, y1 = Fh.y + Fh.h, my = (y0 + y1) / 2;
  const trail = [[x0 + 1.5, my + 1.6], [x0 + 12, my - 1.8], [x0 + 24, my + 2.2], [x0 + 36, my - 1.2], [spurX - 3, my + 0.6], [spurX + 3, my + 0.6], [x0 + 58, my - 2], [x0 + 70, my + 1.8], [x0 + 82, my - 1.4], [x1 - 1.5, my + 1.2]];
  const benches = [[x0 + 12.5, my - 2.9], [x0 + 36.5, my - 2.3], [x0 + 58.5, my - 3.1], [x0 + 82.5, my - 2.5]];
  const post = { x: spurX + 5, y: y1 - 1.6 };
  const trees = [];
  for (let i = 0; i < 260; i++) {
    const x = x0 + 0.6 + frac(i * 0.6180339 + 0.37) * (Fh.w - 1.2), y = y0 + 0.6 + frac(i * 0.7548776 + 0.11) * (Fh.h - 1.2);
    if (Math.abs(x - spurX) < FH_CLEAR) continue;
    if (distToLine(x, y, trail) < 1.1) continue;
    if (benches.some(([bx, by]) => Math.hypot(x - bx, y - by) < 1.2) || Math.hypot(x - post.x, y - post.y) < 1.6) continue;
    trees.push([x, y, 0.55 + frac(i * 0.4142) * 0.5]);
  }
  return { lot: Fh, trail, benches, post, trees, clear: FH_CLEAR, spurX };
})();
function distToLine(x, y, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
    best = Math.min(best, Math.hypot(x - ax - vx * t, y - ay - vy * t));
  }
  return best;
}
function foothillsAnchors() {
  const F = FOOTHILLS, out = [];
  out.push(A("ranger", F.post.x + 0.9, F.post.y + 0.2, "stand", "guard", "staff", { look: [F.post.x, F.post.y - 3] }));
  F.benches.forEach(([x, y], i) => { out.push(A(`bench${i}a`, x - 0.35, y + 0.05, "seat", "read", "patron", { look: [x, y + 4] })); out.push(A(`bench${i}b`, x + 0.35, y + 0.05, "seat", "view", "patron", { look: [x, y + 4] })); });
  // walkers on the trail, both ways, at their own pace
  for (let k = 0; out.length < PLACES.foothills.cap; k++) out.push(A(`hike${k}`, F.trail[0][0], F.trail[0][1], "stand", "view", "patron", { hike: true, path: { kind: "line", pts: k % 2 ? F.trail : [...F.trail].reverse(), period: 220 + (k % 5) * 23, phase: frac(k * 0.137), wig: 0.12 } }));
  return out;
}

export const COAST_ANCHORS = { beach: beachAnchors(), boardwalk: boardwalkAnchors(), pier: pierAnchors(), surf: surfAnchors(), slopes: slopesAnchors(), foothills: foothillsAnchors(), "shore-lot": [], "summit-lot": [] };

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
