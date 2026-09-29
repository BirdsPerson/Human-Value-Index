// The recreation ground as the iso view builds it: the Diamond (a ballpark), the Courts
// (two fenced basketball courts) and the Recreation Ground (lawns, paths, a fountain,
// picnic tables). Pure (no DOM): every line, prop and ANCHOR is in map cells, derived
// from the sim's lots, so scripts/check-cityview.mjs can check that everything stays on
// its own ground and nobody stands on anybody else.
//
// An anchor is where one person goes on the open ground, Fallout Shelter style but seen
// from above: {id, x, y, h (storeys off the ground: a bleacher tier), kind, act, role,
// look: [x, y] (who or what they face) | null, ring: {cx, cy, r} (walk this loop) | null}.
// Anchors are listed in the order people fill them (ordered assignment): the battery and
// the batter before the outfield, the players before the stands.

import { PLACES } from "./sim.js";

export const PARK_PLACES = ["ball-field", "courts", "rec-park"];
export const PARK_LOTS = { "the-diamond": "ball-field", "the-courts": "courts", "rec-ground": "rec-park" };
const rect = (id) => PLACES[id].rect;
// How far a building's drawn footprint sits in from its lot (CityIso.buildGeo): blocks
// stand back from the street; the recreation ground runs almost to the kerb.
export const insetOf = (b) => (PARK_LOTS[b.id] ? [0.15, 0.15] : [Math.min(1.6, b.rect.w * 0.14), Math.min(1.6, b.rect.h * 0.14)]);
const A = (id, x, y, kind, act, role, look = null, extra = {}) => ({ id, x, y, h: 0, kind, act, role, look, ring: null, ...extra });

// ---- the Diamond ----------------------------------------------------------------------
// Home plate at the bottom of the lot, centre field straight up the map (-y), the foul
// lines at 45 degrees either side. pt(r, a): r cells from home, a radians off centre field
// (+ towards first base).
const F = rect("ball-field");
const HOME = [F.x + F.w / 2, F.y + F.h - 1.5];
const pt = (r, a) => [HOME[0] + r * Math.sin(a), HOME[1] - r * Math.cos(a)];
const BASE = 2.9;                 // home to first, cells
const Q = Math.PI / 4;
const FENCE_R = 9.2;              // home to the outfield wall
export const DIAMOND = (() => {
  const first = pt(BASE, Q), second = pt(BASE * Math.SQRT2, 0), third = pt(BASE, -Q), mound = pt(BASE * 0.68, 0);
  const arc = (r, a0, a1, n = 24, c = HOME) => Array.from({ length: n + 1 }, (_, k) => { const a = a0 + (a1 - a0) * k / n; return [c[0] + r * Math.sin(a), c[1] - r * Math.cos(a)]; });
  // infield dirt: out from home along both lines, round the grass edge (an arc about the mound)
  const dirtR = BASE * 1.08;
  const dirt = [HOME, pt(BASE * 1.18, Q), ...arc(dirtR, Q + 0.18, -Q - 0.18, 20, mound), pt(BASE * 1.18, -Q)];
  const grassIn = [first, second, third, HOME].map(p => [mound[0] + (p[0] - mound[0]) * 0.8, mound[1] + (p[1] - mound[1]) * 0.8]);
  const bleacher = (side) => {   // side -1: the third-base stand (left), +1: first-base (right)
    const x0 = side < 0 ? F.x + 0.3 : F.x + F.w - 2.7, x1 = x0 + 2.4;
    return { side, x0, x1, y0: HOME[1] - 4, y1: HOME[1] + 0.2, tiers: 3 };
  };
  const dugout = (side) => { const cx = HOME[0] + side * 3.3; return { side, x0: cx - 1, x1: cx + 1, y0: HOME[1] + 0.62, y1: HOME[1] + 1.25 }; };
  return {
    lot: F, home: HOME, first, second, third, mound, base: BASE, fenceR: FENCE_R,
    fence: arc(FENCE_R, -Q, Q, 28), track: arc(FENCE_R - 0.5, -Q, Q, 28), outfield: [HOME, ...arc(FENCE_R, -Q, Q, 28)],
    dirt, grassIn, foul: [[HOME, pt(FENCE_R, Q)], [HOME, pt(FENCE_R, -Q)]], poles: [pt(FENCE_R, Q), pt(FENCE_R, -Q)],
    backstop: arc(1.25, Math.PI - 1.15, Math.PI + 1.15, 10),
    bleachers: [bleacher(-1), bleacher(1)], dugouts: [dugout(-1), dugout(1)],
    lights: [[F.x + 0.45, F.y + 0.45], [F.x + F.w - 0.45, F.y + 0.45], [F.x + 0.45, F.y + F.h - 0.45], [F.x + F.w - 0.45, F.y + F.h - 0.45]],
    board: { x0: F.x + 1.3, x1: F.x + 3.9, y: F.y + 0.9 },
    // the mowing pattern: stripes across the outfield
    stripes: 9,
    arc,
  };
})();

function diamondAnchors() {
  const D = DIAMOND, H = D.home, M = D.mound;
  const out = [
    A("pitcher", M[0], M[1], "stand", "pitch", "patron", H),
    A("catcher", H[0], H[1] + 0.5, "stand", "catch", "patron", M),
    A("batter", H[0] + 0.55, H[1] + 0.05, "stand", "bat", "patron", M),
    A("first", ...pt(BASE * 1.2, 0.62), "stand", "ready", "patron", H),
    A("short", ...pt(BASE * 1.5, -0.3), "stand", "ready", "patron", H),
    A("second", ...pt(BASE * 1.5, 0.3), "stand", "ready", "patron", H),
    A("third", ...pt(BASE * 1.2, -0.62), "stand", "ready", "patron", H),
    A("centre", ...pt(7.6, 0), "stand", "ready", "patron", H),
    A("left", ...pt(7.1, -0.5), "stand", "ready", "patron", H),
    A("right", ...pt(7.1, 0.5), "stand", "ready", "patron", H),
    A("on-deck", H[0] + 1.75, H[1] + 0.55, "stand", "bat", "patron", M),
    A("umpire", H[0], H[1] + 0.95, "station", "umpire", "staff", M),
    A("grounds", H[0] - 2.3, H[1] + 0.1, "stand", "rake", "staff", null),
  ];
  // the dugouts: three on each bench, then the stands (watching, the odd one on their feet)
  for (const d of D.dugouts) for (let k = 0; k < 3; k++) out.push(A(`dug${d.side}${k}`, d.x0 + 0.4 + k * 0.6, d.y0 + 0.4, "seat", "watch", "any", [(d.x0 + d.x1) / 2, H[1] - 3]));
  for (let t = 0; t < 3; t++) for (let k = 0; k < 3; k++) for (const b of D.bleachers) {   // both stands fill together, front row first
    const x = b.side < 0 ? b.x1 - 0.45 - t * 0.75 : b.x0 + 0.45 + t * 0.75;
    const cheer = (t + k) % 4 === 1;
    out.push(A(`bl${b.side}${t}${k}`, x, b.y0 + 0.7 + k * 1.25, cheer ? "stand" : "seat", cheer ? "cheer" : "watch", "any", H, { h: 0.12 + t * 0.2 }));
  }
  return out;
}

// ---- the Courts ------------------------------------------------------------------------
// Two full courts side by side, their length up the map, a bench aisle between them, a
// chain-link fence round the lot. Each court's game runs at one end (A at the top, B at
// the bottom): winners stay on.
const C = rect("courts");
export const COURTS = (() => {
  const fence = { x0: C.x + 0.25, y0: C.y + 0.25, x1: C.x + C.w - 0.25, y1: C.y + C.h - 0.25 };
  const y0 = fence.y0 + 0.3, y1 = fence.y1 - 0.3, cw = (fence.x1 - fence.x0 - 1.2) / 2;
  const court = (k) => {
    const x0 = fence.x0 + 0.2 + k * (cw + 0.8), x1 = x0 + cw, cx = (x0 + x1) / 2;
    return { k, x0, x1, y0, y1, cx, hoops: [[cx, y0 + 0.45], [cx, y1 - 0.45]], end: k === 0 ? 0 : 1 };
  };
  const courts = [court(0), court(1)];
  return { lot: C, fence, courts, aisle: { x0: courts[0].x1, x1: courts[1].x0 }, gate: [(courts[0].x1 + courts[1].x0) / 2, fence.y1] };
})();

function courtAnchors() {
  const out = [], P = [];
  for (const c of COURTS.courts) {
    const [hx, hy] = c.hoops[c.end], dir = c.end === 0 ? 1 : -1;   // +1: the game plays down from the top hoop
    const at = (dx, dy) => [c.cx + dx * (c.x1 - c.x0) / 2, hy + dir * dy];
    P.push([
      A(`sh${c.k}`, ...at(0.45, 1.75), "stand", "shoot", "patron", [hx, hy]),
      A(`dr${c.k}`, ...at(-0.35, 2.6), "stand", "dribble", "patron", [hx, hy]),
      A(`da${c.k}`, ...at(0.25, 1.05), "stand", "defend", "patron", at(0.45, 1.75)),
      A(`db${c.k}`, ...at(-0.45, 1.75), "stand", "defend", "patron", at(-0.35, 2.6)),
      A(`nx${c.k}`, ...at(-0.55, 4.1), "stand", "wait", "patron", [hx, hy]),
    ]);
  }
  // court A's game, then B's, then who has next
  for (let i = 0; i < 4; i++) out.push(P[0][i]);
  for (let i = 0; i < 4; i++) out.push(P[1][i]);
  out.push(P[0][4], P[1][4]);
  const ax = (COURTS.aisle.x0 + COURTS.aisle.x1) / 2, y0 = COURTS.fence.y0;
  out.push(A("ref", ax, y0 + 1.5, "station", "whistle", "staff", [COURTS.courts[0].cx, y0 + 2]));
  for (let k = 0; k < 4; k++) out.push(A(`bench${k}`, ax, y0 + 2.8 + k * 0.85, "seat", "watch", "any", [COURTS.courts[k % 2].cx, y0 + 2.8 + k * 0.85]));
  return out;
}

// ---- the Recreation Ground ---------------------------------------------------------------
const G = rect("rec-park");
export const REC = (() => {
  const cx = G.x + G.w / 2, cy = G.y + G.h / 2;
  // no trees along the top-left edge: that is behind home plate, and they would hide the battery
  const trees = [[G.x + G.w - 0.55, G.y + 0.6], [G.x + G.w - 0.5, G.y + 2.0], [G.x + 0.5, G.y + G.h - 0.5], [G.x + G.w - 0.5, G.y + G.h - 0.5],
    [G.x + 0.45, cy + 1.0], [G.x + G.w - 1.9, G.y + 0.45], [G.x + 3.2, G.y + G.h - 0.45], [G.x + G.w - 0.45, cy + 1.05]];
  const tables = [[G.x + 1.75, G.y + G.h - 1.45], [G.x + G.w - 1.75, G.y + G.h - 1.45]];
  const benches = [[G.x + 1.6, cy - 0.75], [G.x + G.w - 1.6, cy - 0.75]];
  return {
    lot: G, c: [cx, cy], fountainR: 0.72, ringR: 1.45, pathW: 0.42,
    spokes: [[[cx, G.y + 0.1], [cx, cy - 1.45]], [[cx, cy + 1.45], [cx, G.y + G.h - 0.1]], [[G.x + 0.1, cy], [cx - 1.45, cy]], [[cx + 1.45, cy], [G.x + G.w - 0.1, cy]]],
    trees, tables, benches, lamps: [[cx - 1.1, G.y + 0.9], [cx + 1.1, G.y + G.h - 0.9]], blanket: [G.x + 1.45, G.y + 1.45],
  };
})();

function recAnchors() {
  const R = REC, [cx, cy] = R.c, out = [];
  const bench = (b, k, act) => A(`bn${b[0].toFixed(1)}${k}`, b[0] + (k ? 0.35 : -0.35), b[1], "seat", act, "patron", [b[0] + (k ? 0.35 : -0.35), cy + 1]);
  const table = (t, n) => [[-0.35, -0.55], [0.35, -0.55], [-0.35, 0.55], [0.35, 0.55]].slice(0, n).map(([dx, dy], k) => A(`pt${t[0].toFixed(1)}${k}`, t[0] + dx, t[1] + dy, "seat", k % 2 ? "talk" : "eat", "patron", [t[0] + dx, t[1]]));
  const ring = { cx, cy, r: R.ringR };
  out.push(bench(R.benches[0], 0, "read"), bench(R.benches[0], 1, "feed"));
  out.push(A("walk0", cx + R.ringR, cy, "stand", "stroll", "patron", null, { ring }), A("walk1", cx - R.ringR, cy, "stand", "stroll", "patron", null, { ring }));
  out.push(...table(R.tables[0], 4));
  out.push(A("rim0", cx - 0.72, cy + 0.72, "seat", "rest", "patron", [cx, cy]), A("rim1", cx + 0.72, cy - 0.72, "seat", "feed", "patron", [cx, cy]));
  out.push(A("blanket", R.blanket[0], R.blanket[1], "seat", "read", "patron", [cx, cy]));
  out.push(bench(R.benches[1], 0, "talk"), bench(R.benches[1], 1, "rest"));
  out.push(...table(R.tables[1], 4));
  out.push(A("walk2", cx, cy - R.ringR, "stand", "stroll", "patron", null, { ring }));
  out.push(A("keeper", G.x + G.w - 1.1, G.y + 1.5, "stand", "rake", "staff", null));
  return out;
}

export const PARK_ANCHORS = { "ball-field": diamondAnchors(), courts: courtAnchors(), "rec-park": recAnchors() };

// A stroller's spot on their loop at time t (seconds): one lap in ~40 s, from their own
// start round the ring, the pace a touch different per person. -> {x, y, dx, dy}
export function ringAt(a, t, ph) {
  const g = a.ring, th = (a.id === "walk1" ? Math.PI : a.id === "walk2" ? -Math.PI / 2 : 0) + ph * 6.283 + t * (0.14 + ph * 0.04);
  return { x: g.cx + g.r * Math.cos(th), y: g.cy + g.r * Math.sin(th), dx: -Math.sin(th), dy: Math.cos(th) };
}

export { PITCH_S, SHOT_S } from "./poses.js";
