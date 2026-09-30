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

import { PLACES, assignJob, fieldsOf } from "./sim.js";
import { roleOf } from "./props.js";
import { COAST_LOTS } from "./coastGeo.js";
import { VENUE_LOTS } from "./venueGeo.js";

// The Bowl (a gridiron inside a stadium) and the estate pitch joined the recreation ground
// on 2026-09-29: "we need a soccer field, though, too, and a football field."
export const PARK_PLACES = ["ball-field", "courts", "rec-park", "stadium", "pitch"];
export const PARK_LOTS = { "the-diamond": "ball-field", "the-courts": "courts", "rec-ground": "rec-park", "the-bowl": "stadium", "the-pitch": "pitch" };

// Who plays. A footballer or an athlete on shift at their own ground plays (they fill the
// field as a visitor would, not the officials' posts); sporting visitors are placed before
// the rest, so the field fills with the people who would be on it. -> {role, pri}
const PLAYER_JOBS = new Set(["competitive-athlete", "club-footballer"]);
const SPORTY = ["sport", "soccer", "gridiron", "coaching"];
const SPORT_MEMO = new WeakMap();
const sporty = (s) => {
  if (!s || typeof s !== "object") return false;
  let v = SPORT_MEMO.get(s);
  if (v === undefined) { const f = fieldsOf(s); v = SPORTY.some(k => f[k]); SPORT_MEMO.set(s, v); }
  return v;
};
export function fieldRole(s, w) {
  const role = roleOf(w);
  if (role === "staff") return PLAYER_JOBS.has(assignJob(s).jobId) ? { role: "patron", pri: -2 } : { role, pri: 0 };
  return { role, pri: sporty(s) ? -1 : 0 };
}
const rect = (id) => PLACES[id].rect;
// How far a building's drawn footprint sits in from its lot (CityIso.buildGeo): blocks
// stand back from the street; the recreation ground runs almost to the kerb.
export const insetOf = (b) => (PARK_LOTS[b.id] || COAST_LOTS[b.id] || VENUE_LOTS[b.id] ? [0.15, 0.15] : [Math.min(1.6, b.rect.w * 0.14), Math.min(1.6, b.rect.h * 0.14)]);
// team: 0 | 1 on a player (the colour under their feet); gk: a keeper's own colour.
const A = (id, x, y, kind, act, role, look = null, extra = {}) => ({ id, x, y, h: 0, kind, act, role, look, ring: null, ...extra });

// ---- the Diamond ----------------------------------------------------------------------
// A corner ballpark (Scott, 2026-09-29: "arranged in the corner so that you can have seating
// behind the wall also. The first-base foul line should be against the basketball court fence
// and the park"). Home plate sits in the south-west corner of the lot; the first-base line
// runs east along the south edge (the Courts' fence, then the Recreation Ground), the
// third-base line north up the west edge, and the outfield fans out towards the far
// (north-east) corner. The wall is an arc; the free corner beyond it holds the outfield
// bleachers and, above them, the scoreboard. A grandstand wraps behind the plate along both
// lines, the dugouts in front of it.
// pt(r, a): r cells from home, a radians off centre field (+ towards first base).
// off(dx, dy): an offset in the plate's own frame (dx towards the first-base side, dy back
// towards the backstop), as the diamond was drawn when centre field was straight up the map.
const F = rect("ball-field");
const HOME = [F.x + 3.0, F.y + F.h - 2.4];
const CF = Math.PI / 4;           // centre field's bearing, from north (-y) towards east
const pt = (r, a) => [HOME[0] + r * Math.sin(a + CF), HOME[1] - r * Math.cos(a + CF)];
const CS = Math.cos(CF), SN = Math.sin(CF);
const off = (dx, dy, c = HOME) => [c[0] + dx * CS - dy * SN, c[1] + dx * SN + dy * CS];
const BASE = 2.9;                 // home to first, cells
const Q = Math.PI / 4;
const FENCE_R = HOME[1] - F.y - 0.35;   // home to the wall: the left-field pole just inside the lot's north edge
const TIER = [0.12, 0.3, 0.48];   // bleacher tier tops, storeys
export const DIAMOND = (() => {
  const first = pt(BASE, Q), second = pt(BASE * Math.SQRT2, 0), third = pt(BASE, -Q), mound = pt(BASE * 0.68, 0);
  const arc = (r, a0, a1, n = 24, c = HOME) => Array.from({ length: n + 1 }, (_, k) => { const a = a0 + (a1 - a0) * k / n + CF; return [c[0] + r * Math.sin(a), c[1] - r * Math.cos(a)]; });
  const box = (c, x0, y0, x1, y1) => [off(x0, y0, c), off(x1, y0, c), off(x1, y1, c), off(x0, y1, c)];
  // infield dirt: out from home along both lines, round the grass edge (an arc about the mound)
  const dirtR = BASE * 1.08;
  const dirt = [HOME, pt(BASE * 1.18, Q), ...arc(dirtR, Q + 0.18, -Q - 0.18, 20, mound), pt(BASE * 1.18, -Q)];
  const grassIn = [first, second, third, HOME].map(p => [mound[0] + (p[0] - mound[0]) * 0.8, mound[1] + (p[1] - mound[1]) * 0.8]);
  // mowing stripes: bands square to the line from home to centre field
  const stripes = [], n = 9, step = FENCE_R / n;
  for (let k = 0; k < n; k += 2) stripes.push(box(HOME, -FENCE_R * 1.5, -k * step, FENCE_R * 1.5, -(k + 1) * step));

  // The grandstand behind the plate: three tiers stepping back from the field along both lines
  // and round the corner. A segment is one tier over about a cell of the stand, drawn as its own
  // prism (so the painter's order holds along it) carrying the one seat on it.
  const W = HOME[0] - 1.0, S = HOME[1] + 1.0, D = 0.4;   // the stands' front edges: west (third base) and south (first base)
  const stands = [];
  const seg = (foot, t, seat) => stands.push({ foot, top: TIER[t], t, seat, c: foot.reduce((m, p) => [m[0] + p[0] / foot.length, m[1] + p[1] / foot.length], [0, 0]) });
  const southEnd = F.x + 8.8, northEnd = F.y + 3.8;
  const ns = Math.round((southEnd - W) / 1.0), nw = Math.round((S - northEnd) / 1.0);
  for (let t = 0; t < 3; t++) {
    for (let k = 0; k < ns; k++) {   // first-base side: along x, stepping south towards the Courts
      const x0 = W + (southEnd - W) * k / ns, x1 = W + (southEnd - W) * (k + 1) / ns;
      seg([[x0, S + t * D], [x1, S + t * D], [x1, S + (t + 1) * D], [x0, S + (t + 1) * D]], t, `hs${t}${k}`);
    }
    for (let k = 0; k < nw; k++) {   // third-base side: along y, stepping west
      const y1 = S - (S - northEnd) * k / nw, y0 = S - (S - northEnd) * (k + 1) / nw;
      seg([[W - (t + 1) * D, y0], [W - t * D, y0], [W - t * D, y1], [W - (t + 1) * D, y1]], t, `hw${t}${k}`);
    }
  }
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {   // the corner: a tier is as far back as its farther side
    const x1 = W - i * D, y0 = S + j * D;
    seg([[x1 - D, y0], [x1, y0], [x1, y0 + D], [x1 - D, y0 + D]], Math.max(i, j), null);
  }
  // The outfield bleachers: three tiers stepping up and away beyond the wall, each running
  // from where it meets the lot's north edge round to just past the right-field pole.
  const ob0 = FENCE_R + 0.35, OD = 0.8, aEnd = Q + 0.09;
  for (let t = 0; t < 3; t++) {
    const r0 = ob0 + t * OD, r1 = r0 + OD, rm = (r0 + r1) / 2;
    const aStart = Math.acos((HOME[1] - F.y - 0.25) / r1) - CF;
    const nseg = Math.max(1, Math.round((aEnd - aStart) * rm / 1.0));
    for (let k = 0; k < nseg; k++) {
      const a0 = aStart + (aEnd - aStart) * k / nseg, a1 = aStart + (aEnd - aStart) * (k + 1) / nseg;
      seg([pt(r0, a0), pt(r1, a0), pt(r1, a1), pt(r0, a1)], t, `of${t}${k}`);
    }
  }
  // dugouts in front of the grandstand: first base's along the line, third base's up its line.
  // foot: [along0, along1] x [depth0 (field side), depth1 (back)]; n: towards the field.
  const dugouts = [
    { side: 1, axis: "x", a0: HOME[0] + 1.05, a1: HOME[0] + 2.85, d0: S - 0.62, d1: S - 0.05, n: [0, -1] },
    { side: -1, axis: "y", a0: HOME[1] - 4.4, a1: HOME[1] - 2.6, d0: W + 0.62, d1: W + 0.05, n: [1, 0] },
  ];
  // the scoreboard, above and behind the outfield bleachers, square to centre field... nearly:
  // it faces home from the lot's far corner
  const toFar = Math.atan2(F.x + F.w - HOME[0], HOME[1] - F.y) - CF;
  const bc = pt(ob0 + 3 * OD + 1.25, toFar), half = 1.45;
  // n: the board's face, towards home; a -> b runs left to right as seen from the plate
  const L = Math.hypot(HOME[0] - bc[0], HOME[1] - bc[1]), nrm = [(HOME[0] - bc[0]) / L, (HOME[1] - bc[1]) / L], left = [-nrm[1], nrm[0]];
  const board = { c: bc, n: nrm, a: [bc[0] + left[0] * half, bc[1] + left[1] * half], b: [bc[0] - left[0] * half, bc[1] - left[1] * half] };
  // the league's STANDINGS board (src/city/civic.js), beside the scoreboard on its left, same facing
  const sc = [bc[0] + left[0] * (2 * half + 0.3), bc[1] + left[1] * (2 * half + 0.3)];
  const standings = { c: sc, n: nrm, a: [sc[0] + left[0] * half, sc[1] + left[1] * half], b: [sc[0] - left[0] * half, sc[1] - left[1] * half] };
  const backstop = [[W + 0.05, HOME[1] - 1.7], [W + 0.05, HOME[1] - 0.85], [W + 0.05, S - 0.05], [HOME[0] + 0.85, S - 0.05], [HOME[0] + 1.0, S - 0.05]];
  return {
    lot: F, home: HOME, first, second, third, mound, base: BASE, fenceR: FENCE_R, cf: CF, pt, off,
    fence: arc(FENCE_R, -Q, Q, 28), track: arc(FENCE_R - 0.5, -Q, Q, 28), outfield: [HOME, ...arc(FENCE_R, -Q, Q, 28)],
    dirt, grassIn, foul: [[HOME, pt(FENCE_R, Q)], [HOME, pt(FENCE_R, -Q)]], poles: [pt(FENCE_R, Q), pt(FENCE_R, -Q)],
    backstop, stands, dugouts, stripes,
    plate: [off(-0.13, -0.1), off(0.13, -0.1), off(0.13, 0.02), off(0, 0.13), off(-0.13, 0.02)],
    boxes: [-1, 1].map(s => box(HOME, s * 0.22 - 0.14, -0.3, s * 0.22 + 0.14, 0.3)),
    rubber: box(mound, -0.12, -0.03, 0.12, 0.03),
    bases: [first, second, third].map(b => box(b, -0.12, -0.12, 0.12, 0.12)),
    lights: [[F.x + 0.45, F.y + 0.45], [F.x + F.w - 0.45, F.y + 0.45], [F.x + 0.35, F.y + F.h - 0.35], [F.x + F.w - 0.45, F.y + F.h - 0.45]],
    board, standings,
    arc,
  };
})();

function diamondAnchors() {
  const D = DIAMOND, H = D.home, M = D.mound, W = H[0] - 1.0, S = H[1] + 1.0;
  const out = [
    A("pitcher", M[0], M[1], "stand", "pitch", "patron", H),
    A("catcher", ...off(0, 0.5), "stand", "catch", "patron", M),
    A("batter", ...off(0.55, 0.05), "stand", "bat", "patron", M),
    A("first", ...pt(BASE * 1.2, 0.62), "stand", "ready", "patron", H),
    A("short", ...pt(BASE * 1.5, -0.3), "stand", "ready", "patron", H),
    A("second", ...pt(BASE * 1.5, 0.3), "stand", "ready", "patron", H),
    A("third", ...pt(BASE * 1.2, -0.62), "stand", "ready", "patron", H),
    A("centre", ...pt(FENCE_R - 1.5, 0), "stand", "ready", "patron", H),
    A("left", ...pt(FENCE_R - 2.0, -0.5), "stand", "ready", "patron", H),
    A("right", ...pt(FENCE_R - 2.0, 0.5), "stand", "ready", "patron", H),
    A("on-deck", W + 0.5, H[1] - 1.3, "stand", "bat", "patron", M),
    A("umpire", ...off(0, 0.95), "station", "umpire", "staff", M),
    A("grounds", W + 0.45, D.lot.y + 3.2, "stand", "rake", "staff", null),
  ];
  // then the benches and the crowd, filling together: a player on each bench, a fan behind the
  // plate, a fan beyond the wall; front rows first, nearest the plate (or dead centre) first
  const dug = [];
  for (const d of D.dugouts) for (let k = 0; k < 3; k++) {
    const a = d.a0 + 0.4 + k * 0.5, dp = (d.d0 + d.d1) / 2 + (d.d1 - d.d0) * 0.05;
    const [x, y] = d.axis === "x" ? [a, dp] : [dp, a];
    dug.push(A(`dug${d.side}${k}`, x, y, "seat", "watch", "any", [x + d.n[0] * 3, y + d.n[1] * 3]));
  }
  const seatOf = (s, k) => {
    const cheer = k % 4 === 1;
    return A(s.seat, s.c[0], s.c[1], cheer ? "stand" : "seat", cheer ? "cheer" : "watch", "any", s.seat.startsWith("of") ? pt(BASE, 0) : M, { h: s.top });
  };
  const byTier = (pre) => D.stands.filter(s => s.seat && s.seat.startsWith(pre));
  const home = [...byTier("hs"), ...byTier("hw")].sort((p, q) => p.t - q.t || Math.hypot(p.c[0] - H[0], p.c[1] - H[1]) - Math.hypot(q.c[0] - H[0], q.c[1] - H[1])).map(seatOf);
  const cf = pt(FENCE_R, 0);
  const outer = byTier("of").sort((p, q) => p.t - q.t || Math.hypot(p.c[0] - cf[0], p.c[1] - cf[1]) - Math.hypot(q.c[0] - cf[0], q.c[1] - cf[1])).map(seatOf);
  for (let i = 0; i < Math.max(dug.length, home.length, outer.length); i++) for (const l of [dug, home, outer]) if (l[i]) out.push(l[i]);
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
  // no trees along the top-left edge: it is the Diamond's first-base grandstand, and they would hide it
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
  // the groundskeeper rakes the east lawn: the north-east one holds the chess tables (src/chess/park.js)
  out.push(A("keeper", G.x + G.w - 1.2, cy + 0.65, "stand", "rake", "staff", null));
  return out;
}

// ---- the Bowl: a gridiron inside a stadium ------------------------------------------------
// Stands on all four sides (three tiers stepping up and away from the field), the field
// between them: 120 yards end line to end line along x, 53 1/3 across, end zones in each
// team's colour, a line every ten yards, goalposts on the end lines, a bench on each
// sideline, the chain crew on the north one. The offense (THE ENFORCERS) goes east from
// its own 35; the defense (THE ASSETS) waits across the line of scrimmage.
const S = rect("stadium");
export const BOWL = (() => {
  const x0 = S.x + 0.2, x1 = S.x + S.w - 0.2, y0 = S.y + 0.2, y1 = S.y + S.h - 0.2, D = 1.35, tier = 0.45;
  const cx = S.x + S.w / 2, cy = S.y + S.h / 2, len = 8.4, ten = len / 12, wid = len * 53.333 / 120;
  const field = { x0: cx - len / 2, x1: cx + len / 2, y0: cy - wid / 2, y1: cy + wid / 2 };
  const goal = [field.x0 + ten, field.x1 - ten];
  const stand = (side, a0, a1, b0, b1, axis) => ({ side, a0, a1, b0, b1, axis, tiers: 3, tier, tops: [0.1, 0.26, 0.42] });
  return {
    lot: S, cx, cy, ten, field, goal, los: goal[0] + 3.5 * ten,
    floor: { x0: x0 + D, x1: x1 - D, y0: y0 + D, y1: y1 - D },
    // axis "y": the stand runs along x and steps up away from the field in y (north: -y)
    stands: [stand("north", x0, x1, y0 + D, y0, "y"), stand("south", x0, x1, y1 - D, y1, "y"), stand("west", y0 + D, y1 - D, x0 + D, x0, "x"), stand("east", y0 + D, y1 - D, x1 - D, x1, "x")],
    posts: [[field.x0, cy], [field.x1, cy]], postW: 0.24, bar: 0.5, upright: 1.35,
    benches: [{ y: y0 + D + 0.3, x0: cx - 2, x1: cx + 2 }, { y: y1 - D - 0.3, x0: cx - 2, x1: cx + 2 }],
    lights: [[S.x + 0.1, S.y + 0.1], [S.x + S.w - 0.1, S.y + 0.1], [S.x + 0.1, S.y + S.h - 0.1], [S.x + S.w - 0.1, S.y + S.h - 0.1]],
    board: { x0: cx - 1.5, x1: cx + 1.5, y: S.y + 0.25 },
    net: { x: field.x1 - 0.15, y: y0 + D + 0.85 },
  };
})();

function bowlAnchors() {
  const B = BOWL, L = B.los, cy = B.cy, out = [];
  const east = (x, y) => [x + 1, y], west = (x, y) => [x - 1, y];
  const off = (id, x, y, act) => A(id, x, y, "stand", act, "patron", east(x, y), { team: 0 });
  const def = (id, x, y, act) => A(id, x, y, "stand", act, "patron", west(x, y), { team: 1 });
  // the order people fill them: a passing drill first (quarterback, center, receiver), then the lines
  // (spread along the field as far as the play allows: at street zoom a player is most of a cell wide)
  const players = [
    off("qb", L - 0.95, cy, "throw"), off("c", L - 0.2, cy, "snap"), off("wr1", L - 0.2, cy - 1.5, "receive"),
    def("dl2", L + 0.45, cy - 0.24, "stance"), def("lb2", L + 1.45, cy, "wrap"), def("cb1", L + 0.6, cy - 1.5, "wrap"),
    off("rb", L - 1.75, cy, "carry"), off("lg", L - 0.2, cy - 0.45, "stance"), off("rg", L - 0.2, cy + 0.45, "stance"),
    def("dl3", L + 0.45, cy + 0.24, "stance"), off("lt", L - 0.2, cy - 0.9, "stance"), off("rt", L - 0.2, cy + 0.9, "stance"),
    def("dl1", L + 0.45, cy - 0.72, "stance"), def("dl4", L + 0.45, cy + 0.72, "stance"), off("te", L - 0.2, cy + 1.35, "stance"),
    def("lb1", L + 1.45, cy - 0.75, "wrap"), def("lb3", L + 1.45, cy + 0.75, "wrap"), off("slot", L - 0.8, cy - 1.05, "receive"),
    off("wr2", L - 0.8, cy + 1.6, "receive"), def("cb2", L + 0.6, cy + 1.6, "wrap"), def("s1", L + 2.6, cy - 0.65, "wrap"), def("s2", L + 2.6, cy + 0.65, "wrap"),
  ];
  out.push(...players.slice(0, 16));
  // the officials and the chain crew; the groundskeeper; the kicker at his net; the cheer squad
  out.push(
    A("ref", L - 2.3, cy + 0.6, "station", "signal", "staff", east(L, cy)), A("ump", L + 2.0, cy - 0.35, "station", "signal", "staff", west(L, cy)),
    A("linesman", L, B.field.y1 + 0.4, "station", "signal", "staff", [L, cy]), A("backjudge", L + 3.4, cy, "station", "signal", "staff", west(L, cy)),
    A("chainA", L - 0.45, B.field.y0 - 0.5, "station", "chain", "staff", [L, cy]), A("box", L, B.field.y0 - 0.17, "station", "chain", "staff", [L, cy]),
    A("chainB", L + 0.45, B.field.y0 - 0.5, "station", "chain", "staff", [L, cy]),
    A("grounds", B.floor.x0 + 0.45, B.floor.y0 + 0.55, "stand", "rake", "staff", null),
    A("kicker", B.net.x - 0.75, B.net.y, "stand", "kick", "patron", [B.net.x, B.net.y], { team: 0 }),
  );
  for (const [k, x] of [[0, B.floor.x0 + 0.55], [1, B.floor.x0 + 1.15], [2, B.floor.x1 - 1.15], [3, B.floor.x1 - 0.55]]) out.push(A(`cheer${k}`, x, B.field.y1 + 0.9, "stand", "cheer", "patron", [x, cy]));
  // the benches: six a side
  B.benches.forEach((b, i) => { for (let k = 0; k < 6; k++) { const x = b.x0 + 0.3 + k * 0.68; out.push(A(`bench${i}${k}`, x, b.y, "seat", "watch", "any", [x, cy], { team: i ? 0 : 1 })); } });
  // the stands, front rows first, all four sides filling together. A game day is a crowd as
  // well as a game: sixteen take the field, then the long sides' front rows, then the rest of
  // the teams (the sporting are placed first, parkGeo.fieldRole, so they are the ones playing)
  const seats = [];
  for (let t = 0; t < 3; t++) for (const st of B.stands) {
    const along = st.a1 - st.a0, n = st.axis === "y" ? 11 : 4, step = along / n;
    const depth = st.b0 + (st.b1 - st.b0) * ((t + 0.5) / 3);
    for (let k = 0; k < n; k++) {
      const a = st.a0 + step * (k + 0.5), cheer = (t + k) % 5 === 2;
      const [x, y] = st.axis === "y" ? [a, depth] : [depth, a];
      seats.push(A(`st${st.side[0]}${t}${k}`, x, y, cheer ? "stand" : "seat", cheer ? "cheer" : "watch", "patron", [B.cx, B.cy], { h: st.tops[t] }));
    }
  }
  const front = seats.filter(a => /^st[ns]0/.test(a.id));
  const kicker = out.findIndex(a => a.id === "kicker");
  out.splice(kicker, 0, ...front, ...players.slice(16));
  out.push(...seats.filter(a => !front.includes(a)));
  return out;
}

// ---- the estate pitch ----------------------------------------------------------------------
// Full-size markings on a municipal pitch, its length along x: halfway line and centre
// circle, penalty and goal areas, spots and arcs, goals with nets, corner flags. Dugouts on
// the north touchline, a rail and a standing crowd on the south one, a small terrace behind
// the east goal, the scoreboard behind the west. Seven a side: SPRAWL UNITED (west goal,
// attacking east) and RECLAMATION ATHLETIC.
const T = rect("pitch");
export const PITCH = (() => {
  const cx = T.x + T.w / 2, cy = T.y + T.h / 2, len = 14.6, wid = 9.4;
  const p = { x0: cx - len / 2, x1: cx + len / 2, y0: cy - wid / 2, y1: cy + wid / 2 };
  const m = len / 105;   // cells per metre along the pitch
  return {
    lot: T, cx, cy, p, m,
    box: { d: 2.4, hw: 2.9 }, six: { d: 1.0, hw: 1.8 }, spot: 11 * m, circleR: 9.15 * m,
    goalHW: 1.2, goalH: 1.0, netD: 0.55,
    flags: [[p.x0, p.y0], [p.x1, p.y0], [p.x0, p.y1], [p.x1, p.y1]],
    dugouts: [{ x0: cx - 3.5, x1: cx - 1.0, y0: T.y + 0.15, y1: p.y0 - 0.45 }, { x0: cx + 1.0, x1: cx + 3.5, y0: T.y + 0.15, y1: p.y0 - 0.45 }],
    rail: { y: p.y1 + 0.35, x0: p.x0, x1: p.x1 },
    terrace: { x0: p.x1 + 1.5, x1: p.x1 + 1.5 + 3 * 1.0, y0: cy - 3.3, y1: cy + 3.3, tiers: 3, tops: [0.1, 0.27, 0.44] },
    board: { x: p.x0 - 2.9, y0: cy - 1.3, y1: cy + 1.3 },
    lights: [[T.x + 0.2, T.y + 0.2], [T.x + T.w - 0.2, T.y + 0.2], [T.x + 0.2, T.y + T.h - 0.2], [T.x + T.w - 0.2, T.y + T.h - 0.2]],
  };
})();

function pitchAnchors() {
  const P = PITCH, cx = P.cx, cy = P.cy, out = [];
  const eastGoal = [P.p.x1, cy], westGoal = [P.p.x0, cy];
  const a = (id, x, y, act, look) => A(id, x, y, "stand", act, "patron", look, { team: 0 });
  const b = (id, x, y, act, look) => A(id, x, y, "stand", act, "patron", look, { team: 1 });
  // the order people fill them: two on the ball, a forward and a defender, the keepers, then the rest
  out.push(
    a("a-m2", cx - 0.6, cy + 0.4, "footwork", eastGoal), b("b-m2", cx + 1.1, cy + 2.0, "mark", westGoal),
    a("a-f1", cx + 2.9, cy - 0.9, "header", eastGoal), b("b-d1", cx + 4.1, cy - 1.6, "header", westGoal),
    A("a-gk", P.p.x0 + 0.55, cy, "stand", "keeper", "patron", eastGoal, { team: 0, gk: true }), A("b-gk", P.p.x1 - 0.55, cy, "stand", "keeper", "patron", westGoal, { team: 1, gk: true }),
    a("a-m1", cx - 1.3, cy - 3.2, "chase", eastGoal), b("b-m1", cx + 1.5, cy - 2.4, "chase", westGoal),
    a("a-d1", cx - 4.1, cy - 2.2, "mark", eastGoal), b("b-f1", cx - 3.1, cy - 0.4, "chase", westGoal),
    a("a-d2", cx - 4.1, cy + 2.2, "mark", eastGoal), b("b-d2", cx + 3.9, cy + 1.9, "mark", westGoal),
    a("a-m3", cx - 1.7, cy + 3.4, "kickball", eastGoal), b("b-m3", cx + 2.1, cy + 3.8, "chase", westGoal),
  );
  // the referee, the assistants on opposite touchlines and halves, the groundskeeper
  out.push(
    A("ref", cx + 0.4, cy - 1.2, "station", "whistle", "staff", [cx - 0.6, cy + 0.4]),
    A("ar1", cx + 3.8, P.p.y0 - 0.2, "station", "flag", "staff", [cx + 3.8, cy]), A("ar2", cx - 3.8, P.p.y1 + 0.2, "station", "flag", "staff", [cx - 3.8, cy]),
    A("grounds", P.lot.x + 1.3, P.lot.y + 0.9, "stand", "rake", "staff", null),
  );
  // the dugouts, then the crowd on the rail and the terrace, filling together
  P.dugouts.forEach((d, i) => { for (let k = 0; k < 3; k++) { const x = d.x0 + 0.55 + k * 0.7; out.push(A(`dug${i}${k}`, x, (d.y0 + d.y1) / 2 + 0.1, "seat", "watch", "any", [x, cy], { team: i })); } });
  const rail = [], terr = [];
  for (let k = 0; k < 18; k++) { const x = P.rail.x0 + 0.45 + k * ((P.rail.x1 - P.rail.x0 - 0.9) / 17); rail.push(A(`rail${k}`, x, P.rail.y + 0.4, "stand", k % 3 === 1 ? "cheer" : "view", "patron", [x, cy])); }
  const tr = P.terrace, n = 7, step = (tr.y1 - tr.y0) / n;
  for (let t = 0; t < tr.tiers; t++) for (let k = 0; k < n; k++) {
    const x = tr.x0 + (t + 0.5) * ((tr.x1 - tr.x0) / tr.tiers), y = tr.y0 + (k + 0.5) * step, cheer = (t + k) % 4 === 1;
    terr.push(A(`ter${t}${k}`, x, y, cheer ? "stand" : "seat", cheer ? "cheer" : "watch", "patron", [cx, cy], { h: tr.tops[t] }));
  }
  for (let i = 0; i < Math.max(rail.length, terr.length); i++) { if (rail[i]) out.push(rail[i]); if (terr[i]) out.push(terr[i]); }
  return out;
}

export const PARK_ANCHORS = { "ball-field": diamondAnchors(), courts: courtAnchors(), "rec-park": recAnchors(), stadium: bowlAnchors(), pitch: pitchAnchors() };

// A stroller's spot on their loop at time t (seconds): one lap in ~40 s, from their own
// start round the ring, the pace a touch different per person. -> {x, y, dx, dy}
export function ringAt(a, t, ph) {
  const g = a.ring, th = (a.id === "walk1" ? Math.PI : a.id === "walk2" ? -Math.PI / 2 : 0) + ph * 6.283 + t * (0.14 + ph * 0.04);
  return { x: g.cx + g.r * Math.cos(th), y: g.cy + g.r * Math.sin(th), dx: -Math.sin(th), dy: Math.cos(th) };
}

export { PITCH_S, SHOT_S } from "./poses.js";
