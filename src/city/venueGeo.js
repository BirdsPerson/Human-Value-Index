// THE MASTER PLAN's venues as the iso view builds them (docs/planning/MASTER_PLAN.md,
// 2026-09-30): THE PIT (a boxing ring and an MMA octagon under the sky, arena seating on four
// sides, the locker rooms, the forecourt with the fight board) and THE TENNIS CLUB (four courts
// in a fence, the clubhouse and its terrace), plus the Dept of Planning's massing (archGeo's
// rules, merged there like the funnels). Pure, like parkGeo.js: every line, prop and ANCHOR in
// map cells from the sim's lots, so scripts/check-planner.mjs can hold it all to its ground.
//
// Anchors are parkGeo's {id, x, y, h, kind, act, role, look, ring, ...}, listed in fill order.
// The fighters in a bout and the finalists of the club fixture are drawn by PROJECTION (pit.js,
// tennis.js): they are not anchors, and the sim keeps them at their own schedule.

import { PLACES, fieldsOf } from "./sim.js";
import { roleOf } from "./props.js";

const rect = (id) => PLACES[id].rect;
const A = (id, x, y, kind, act, role, look = null, extra = {}) => ({ id, x, y, h: 0, kind, act, role, look, ring: null, ...extra });
export const VENUE_LOTS = { "the-pit": "pit", "tennis-club": "tennis" };
export const VENUE_PLACES = Object.values(VENUE_LOTS);

// Who takes the floor first: at the Pit a fighter (combat on the record) spars, at the club a
// tennis player plays; everyone else fills the seats. -> {role, pri}
const PRI_FIELDS = { pit: ["combat"], tennis: ["tennis", "sport"] };
const MEMO = new WeakMap();
export function venueRole(pid, s, w) {
  const role = roleOf(w);
  if (role === "staff") return { role, pri: 0 };
  let f = MEMO.get(s);
  if (!f && s && typeof s === "object") { f = fieldsOf(s); MEMO.set(s, f); }
  return { role, pri: f && PRI_FIELDS[pid].some(k => f[k] >= 5) ? -1 : 0 };
}

// ---- THE PIT --------------------------------------------------------------------------------------
const Pl = rect("pit");
export const PIT_TIERS = [0.14, 0.32, 0.5];   // tier tops, storeys
export const PIT = (() => {
  const L = Pl, x0 = L.x, y0 = L.y, x1 = L.x + L.w, y1 = L.y + L.h;
  const floor = { x0: x0 + 3.4, y0: y0 + 3.0, x1: x1 - 3.4, y1: y1 - 4.4 };
  const cyf = (floor.y0 + floor.y1) / 2;
  const ring = { cx: floor.x0 + 4.8, cy: cyf, hs: 1.8, h: 0.22, posts: 0.85, ropes: [0.42, 0.58, 0.74] };
  const oct = { cx: floor.x1 - 4.2, cy: cyf, r: 2.15, h: 0.12, fence: 0.82 };
  oct.pts = Array.from({ length: 8 }, (_, k) => { const a = Math.PI / 8 + (k / 8) * Math.PI * 2; return [oct.cx + oct.r * Math.cos(a), oct.cy + oct.r * Math.sin(a)]; });
  const D = 0.85;   // a tier's depth
  // the stands: three tiers stepping up and away from the floor, in segments of about 1.5 cells
  // (so the painter's order holds along them), a seat per segment per tier
  const segs = [];
  const side = (name, axis, a0, a1, b0, dir) => {   // axis: the direction the stand runs along
    const n = Math.max(1, Math.round((a1 - a0) / 1.45)), step = (a1 - a0) / n;
    for (let t = 0; t < 3; t++) for (let k = 0; k < n; k++) {
      const s0 = a0 + k * step, s1 = s0 + step, d0 = b0 + dir * t * D, d1 = b0 + dir * (t + 1) * D;
      const [e0, e1] = [Math.min(d0, d1), Math.max(d0, d1)];
      const foot = axis === "x" ? [[s0, e0], [s1, e0], [s1, e1], [s0, e1]] : [[e0, s0], [e1, s0], [e1, s1], [e0, s1]];
      const c = axis === "x" ? [(s0 + s1) / 2, (e0 + e1) / 2] : [(e0 + e1) / 2, (s0 + s1) / 2];
      segs.push({ side: name, t, k, foot, c, top: PIT_TIERS[t], seat: `st${name}${t}${k}` });
    }
  };
  side("n", "x", x0 + 0.4, x1 - 0.4, floor.y0, -1);
  side("w", "y", floor.y0, floor.y1, floor.x0, -1);
  side("e", "y", floor.y0, floor.y1, floor.x1, 1);
  const locker = { x0: x0 + 0.4, y0: floor.y1 + 0.2, x1: x0 + 7.2, y1: y1 - 0.4, h: 1.3 };
  side("s", "x", locker.x1 + 0.9, x1 - 0.4, floor.y1, 1);
  const tunnel = { x: (locker.x1 + locker.x1 + 0.9) / 2, y0: floor.y1, y1: floor.y1 + 3 * D };
  const judges = { x0: (ring.cx + ring.hs + oct.cx - oct.r) / 2 - 0.9, x1: (ring.cx + ring.hs + oct.cx - oct.r) / 2 + 0.9, y0: floor.y0 + 0.5, y1: floor.y0 + 0.95, h: 0.32 };
  const board = { a: [x1 - 7.5, y1 - 0.55], b: [x1 - 1.5, y1 - 0.55], h0: 0.5, h1: 1.7 };   // THE PIT // TONIGHT, on the forecourt, facing the street
  const lights = [[x0 + 0.25, y0 + 0.25], [x1 - 0.25, y0 + 0.25], [x0 + 0.25, floor.y1 + 0.1], [x1 - 0.25, floor.y1 + 0.1]];
  const trees = [[locker.x1 + 1.6, y1 - 0.5], [x1 - 9, y1 - 0.5]];
  // the fighters' marks: two in the ring, two in the octagon (drawn by projection in a bout)
  const marks = { ring: [[ring.cx - 0.8, ring.cy], [ring.cx + 0.8, ring.cy]], octagon: [[oct.cx - 0.8, oct.cy], [oct.cx + 0.8, oct.cy]] };
  return { lot: L, floor, ring, oct, segs, locker, tunnel, judges, board, lights, trees, marks };
})();

function pitAnchors() {
  const P = PIT, R = P.ring, O = P.oct, out = [];
  const toRing = [R.cx, R.cy], toOct = [O.cx, O.cy], mid = [(R.cx + O.cx) / 2, P.floor.y0 + 1];
  // the officials: a referee in each, the announcer at the apron
  out.push(A("ref-ring", R.cx, R.cy - 0.9, "station", "signal", "staff", toRing, { h: R.h }));
  out.push(A("ref-oct", O.cx, O.cy - 1.0, "station", "signal", "staff", toOct, { h: O.h }));
  out.push(A("announcer", R.cx + R.hs + 0.55, R.cy + R.hs + 0.35, "station", "point", "staff", toRing));
  // the judges' table, three seats; the corners (a stool in each)
  for (let k = 0; k < 3; k++) out.push(A(`judge${k}`, P.judges.x0 + 0.3 + k * 0.6, P.judges.y0 - 0.15, "seat", "watch", "any", mid, { h: 0 }));
  out.push(A("corner-red", R.cx - R.hs - 0.45, R.cy - R.hs - 0.25, "seat", "watch", "any", toRing));
  out.push(A("corner-blue", R.cx + R.hs + 0.45, R.cy - R.hs - 0.25, "seat", "watch", "any", toRing));
  // sparring when there is no bout (fighters on the record first); in a bout they step out to the apron
  const alt = (k) => [P.floor.x0 + 0.6 + k * 0.7, P.floor.y1 - 0.4];
  out.push(A("spar-r0", R.cx - 0.7, R.cy + 0.55, "stand", "spar", "patron", [R.cx + 0.7, R.cy + 0.55], { h: R.h, venue: "ring", alt: alt(0) }));
  out.push(A("spar-r1", R.cx + 0.7, R.cy + 0.55, "stand", "spar", "patron", [R.cx - 0.7, R.cy + 0.55], { h: R.h, venue: "ring", alt: alt(1) }));
  out.push(A("spar-o0", O.cx - 0.7, O.cy + 0.6, "stand", "grapple", "patron", [O.cx + 0.7, O.cy + 0.6], { h: O.h, venue: "octagon", alt: alt(2) }));
  out.push(A("spar-o1", O.cx + 0.7, O.cy + 0.6, "stand", "grapple", "patron", [O.cx - 0.7, O.cy + 0.6], { h: O.h, venue: "octagon", alt: alt(3) }));
  // the crowd: front rows all round, then the next tier, then the back
  for (let t = 0; t < 3; t++) {
    const row = P.segs.filter(s => s.t === t);
    const order = row.slice().sort((a, b) => a.k - b.k || a.side.localeCompare(b.side));
    for (const s of order) {
      const cheer = (s.k + t) % 4 === 1;
      out.push(A(s.seat, s.c[0], s.c[1], cheer ? "stand" : "seat", cheer ? "cheer" : "watch", "patron", [(R.cx + O.cx) / 2, R.cy], { h: s.top }));
    }
  }
  return out;
}

// ---- THE TENNIS CLUB --------------------------------------------------------------------------------
// Four courts side by side, their length north-south, in one chain-link enclosure; the show court
// (court 3, beside the clubhouse) keeps the club fixture's finalists (tennis.js, by projection).
// The clubhouse (a pavilion with a terrace of seats) stands in the east end of the lot.
const Tl = rect("tennis");
export const TENNIS = (() => {
  const L = Tl, x0 = L.x + 0.4, y0 = L.y + 0.4, y1 = L.y + L.h - 0.4;
  const cw = 3.55, gap = 0.3, n = 4;
  const surf = ["#3f7d3a", "#b5562f", "#2f5f8f", "#2f5f8f"];   // grass, clay, hard, hard (the show court)
  const courts = Array.from({ length: n }, (_, k) => {
    const cx0 = x0 + 0.25 + k * (cw + gap), cx1 = cx0 + cw, cx = (cx0 + cx1) / 2, cy = (y0 + y1) / 2;
    // the lines: doubles 2.6 x 5.66 cells (10.97 x 23.77 m at ~4.2 m a cell), singles 1.96 wide, service 1.53 from the net
    const hw = 1.3, hs = 0.98, hl = 2.83, sv = 1.53;
    return { k, x0: cx0, x1: cx1, y0: y0 + 0.2, y1: y1 - 0.2, cx, cy, hw, hs, hl, sv, surface: surf[k], show: k === n - 1 };
  });
  const fence = { x0, y0, x1: courts[n - 1].x1 + 0.25, y1 };
  const club = { x0: fence.x1 + 0.6, y0: L.y + 0.8, x1: L.x + L.w - 0.4, y1: L.y + 4.6, h: 1.6 };
  const terrace = { x0: club.x0, y0: club.y1 + 0.3, x1: club.x1, y1: y1 };
  const chair = { x: courts[n - 1].cx + courts[n - 1].hw + 0.45, y: courts[n - 1].cy, h: 0.6 };   // the umpire's chair at the show court's net
  const gate = [(courts[1].x1 + courts[2].x0) / 2, fence.y1];
  return { lot: L, courts, fence, club, terrace, chair, gate };
})();

function tennisAnchors() {
  const T = TENNIS, out = [];
  // courts 0-2: a rally each, the club's regulars (tennis players first); the show court is the fixture's
  for (const c of T.courts.filter(c => !c.show)) {
    out.push(A(`c${c.k}n`, c.cx + (c.k % 2 ? 0.35 : -0.35), c.cy - c.hl + 0.25, "stand", "tennis", "patron", [c.cx, c.cy + 1], { court: c.k }));
    out.push(A(`c${c.k}s`, c.cx + (c.k % 2 ? -0.35 : 0.35), c.cy + c.hl - 0.25, "stand", "tennis", "patron", [c.cx, c.cy - 1], { court: c.k }));
  }
  // the pro on court 0's sideline, a line judge at the show court's chair
  out.push(A("pro", T.courts[0].x0 + 0.2, T.courts[0].cy + 0.9, "stand", "coach", "staff", [T.courts[0].cx, T.courts[0].cy + 2]));
  out.push(A("umpire", T.chair.x, T.chair.y, "station", "watch", "staff", [T.courts[3].cx, T.courts[3].cy], { h: T.chair.h }));
  // benches between the courts (the gaps), then the terrace: two rows of tables
  for (let k = 0; k < 3; k++) { const x = (T.courts[k].x1 + T.courts[k + 1].x0) / 2, y = T.courts[k].cy + (k % 2 ? 1.2 : -1.2); out.push(A(`bench${k}`, x, y, "seat", "watch", "patron", [T.courts[k].cx, y])); }
  const R = T.terrace;
  for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) {
    const x = R.x0 + 0.5 + k * ((R.x1 - R.x0 - 1) / 5), y = R.y0 + 0.5 + r * 1.2;
    out.push(A(`terrace${r}${k}`, x, y, "seat", k % 3 === 1 ? "drink" : "watch", "patron", [T.courts[3].cx, T.courts[3].cy]));
  }
  return out;
}

export const VENUE_ANCHORS = { pit: pitAnchors(), tennis: tennisAnchors() };

// ---- THE ESTATE GARDENS (open ground, CityIso's lot drawing): the trees along its paths -----------------
const Eg = rect("estate-gardens");
export const GARDEN_TREES = (() => {
  const out = [];
  for (let i = 0; i < 18; i++) {
    const x = Eg.x + 0.8 + ((i * 0.6180339 + 0.2) % 1) * (Eg.w - 1.6), y = Eg.y + 0.8 + ((i * 0.7548776 + 0.5) % 1) * (Eg.h - 1.6);
    if (Math.abs(y - (Eg.y + Eg.h / 2)) < 0.7) continue;   // the path along the middle
    out.push([x, y]);
  }
  return out;
})();

// ---- the Dept of Planning's massing (archGeo.js merges it) ------------------------------------------
// A long white modernist slab (the drawing office, the counter, the public gallery), a flagpole,
// planters, the notice board of planning applications on the pavement, and on the plaza beside it
// THE PANORAMA: the whole city as a model on a stone plinth (the Queens Museum's Panorama of the
// City of New York was built for Robert Moses' 1964 World's Fair).
export const VENUE_STYLES = { planning: { family: "civic", name: "CIVIC OFFICE" } };
export const VENUE_OUT_FRONT = { planning: 0.2 };
export function venueMass({ box, pt, bx, gr }) {
  return {
    planning: () => ({
      rise: 3.6,
      parts: [box(0.8, 0.8, 12.6, 4.4, 0, 3, "white", { win: "planning", door: "s", sign: "DEPT OF PLANNING", pilotis: true }),
        box(3.2, 1.6, 10.2, 3.6, 3, 3.5, "white", { win: "none" })],
      ground: [gr("paving", 13.3, 0.6, 22.6, 7.4), gr("paving", 0.6, 4.8, 12.8, 7.4)],
      yard: [bx("panorama", 14.2, 1.4, 21.8, 5.6), pt("flag", 13.6, 6.9, 0.06), pt("noticeboard", 3.2, 6.6, 0.3), pt("planter", 6.6, 6.7, 0.3), pt("planter", 9.4, 6.7, 0.3), pt("bench", 17.5, 6.8, 0.15, { along: "x" }), pt("tree", 22.1, 6.9, 0.2)],
    }),
  };
}
export const VENUE_PROPS = ["panorama", "noticeboard"];
