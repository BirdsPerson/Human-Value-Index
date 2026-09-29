// The Loop as the iso view builds it: a concrete viaduct round the ring with rounded
// corners, a platform + canopy + stairs at every station, and each train as articulated
// cars riding the deck. Pure (no DOM), so the geometry is checked in node
// (scripts/check-cityview.mjs).
//
// The sim's track (sim.loopAt) turns its corners square; that is fine for where a rider
// is, not for a car body. Here the ring is drawn with a radius-R curve at each corner and
// a car's arc position s is carried onto it (the curve takes the same 2R of arc as the
// square corner it replaces), so the timetable is the sim's to the minute and the cars
// still bend round. A car is placed by its two bogies: centre between them, heading along
// the chord.

import { LOOP_LINE, STATIONS } from "./sim.js";
import { rot, DECK } from "./iso.js";

export const CORNER_R = 2;          // cells, the curve's radius on the centreline
export const DECK_HW = 0.65;        // deck half-width (cells)
export const CAR_HW = 0.38;         // car body half-width
export const CAR_HL = LOOP_LINE.carLen / 2 - 0.08;   // body half-length (a gap for the coupler)
export const BOGIE = 0.85;          // bogie centres, +- from the car's middle along the arc
export const PLAT_IN = DECK_HW, PLAT_OUT = 1.3;       // platform, lateral from the centreline
export const PLAT_HL = 6;           // platform half-length (a 4-car train is 11.1 cells)
export const STAIR_W = 0.75, STAIR_L = 3;             // stairs beside the platform, down along the track
export const PIECE = 3;             // straight deck pieces at most this long (for the painter)

const RING = LOOP_LINE.loop, L = LOOP_LINE.length;
const mod = (v, m) => ((v % m) + m) % m;

// Corners clockwise from the top-left (arc 0); din/dout: travel direction in and out.
const CORNERS = [
  { s: 0, x: RING.x, y: RING.y, din: [0, -1], dout: [1, 0] },
  { s: RING.w, x: RING.x + RING.w, y: RING.y, din: [1, 0], dout: [0, 1] },
  { s: RING.w + RING.h, x: RING.x + RING.w, y: RING.y + RING.h, din: [0, 1], dout: [-1, 0] },
  { s: 2 * RING.w + RING.h, x: RING.x, y: RING.y + RING.h, din: [-1, 0], dout: [0, -1] },
].map(c => ({ ...c, cx: c.x - CORNER_R * c.din[0] + CORNER_R * c.dout[0], cy: c.y - CORNER_R * c.din[1] + CORNER_R * c.dout[1] }));
export { CORNERS };

// Map point + unit heading on the drawn centreline at arc s. Round each corner the drawn
// line is shorter than the sim's square one, so the sim's arc within CORNER_ZONE of a
// corner is spread evenly over the drawn straight-curve-straight there: cars slow a touch
// through the bend (never bunching into each other) and are exactly where the sim has
// them everywhere else, platforms included.
export const CORNER_ZONE = 6;
const ARC = CORNER_R * Math.PI / 2, RUN = CORNER_ZONE - CORNER_R, ZONE_LEN = 2 * RUN + ARC;
export function pathAt(s) {
  s = mod(s, L);
  for (const c of CORNERS) {
    let d = s - c.s;
    if (d > L / 2) d -= L; else if (d < -L / 2) d += L;
    if (Math.abs(d) < CORNER_ZONE) {
      const g = ((d + CORNER_ZONE) / (2 * CORNER_ZONE)) * ZONE_LEN;
      if (g < RUN) { const k = CORNER_ZONE - g; return { x: c.x - c.din[0] * k, y: c.y - c.din[1] * k, dx: c.din[0], dy: c.din[1] }; }
      if (g > RUN + ARC) { const k = CORNER_R + g - RUN - ARC; return { x: c.x + c.dout[0] * k, y: c.y + c.dout[1] * k, dx: c.dout[0], dy: c.dout[1] }; }
      const th = (g - RUN) / CORNER_R, co = Math.cos(th), si = Math.sin(th);
      return {
        x: c.cx + CORNER_R * (-c.dout[0] * co + c.din[0] * si), y: c.cy + CORNER_R * (-c.dout[1] * co + c.din[1] * si),
        dx: c.dout[0] * si + c.din[0] * co, dy: c.dout[1] * si + c.din[1] * co,
      };
    }
  }
  const p = LOOP_LINE.at(s), q = LOOP_LINE.at(s + 0.01);
  const dx = q.x - p.x, dy = q.y - p.y, n = Math.hypot(dx, dy) || 1;
  return { x: p.x, y: p.y, dx: dx / n, dy: dy / n };
}

// A car at arc s (its middle): centre and heading in map cells.
export function carPose(s) {
  const a = pathAt(s - BOGIE), b = pathAt(s + BOGIE);
  const dx = b.x - a.x, dy = b.y - a.y, n = Math.hypot(dx, dy) || 1;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, dx: dx / n, dy: dy / n };
}
// Its four footprint corners (front-left, front-right, back-right, back-left; map cells).
export function carCorners(p, hl = CAR_HL, hw = CAR_HW) {
  const px = -p.dy, py = p.dx;
  return [
    [p.x + p.dx * hl + px * hw, p.y + p.dy * hl + py * hw], [p.x + p.dx * hl - px * hw, p.y + p.dy * hl - py * hw],
    [p.x - p.dx * hl - px * hw, p.y - p.dy * hl - py * hw], [p.x - p.dx * hl + px * hw, p.y - p.dy * hl + py * hw],
  ];
}

// Distance from a map point to the drawn centreline (straights between the curves + arcs).
export function offTrack(x, y) {
  const r = RING, R = CORNER_R;
  const seg = (ax, ay, bx, by) => {
    const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(x - ax - vx * t, y - ay - vy * t);
  };
  let d = Math.min(
    seg(r.x + R, r.y, r.x + r.w - R, r.y), seg(r.x + r.w, r.y + R, r.x + r.w, r.y + r.h - R),
    seg(r.x + R, r.y + r.h, r.x + r.w - R, r.y + r.h), seg(r.x, r.y + R, r.x, r.y + r.h - R),
  );
  for (const c of CORNERS) {
    // only the quarter of the circle facing the corner
    const ox = c.x - c.cx, oy = c.y - c.cy, vx = x - c.cx, vy = y - c.cy;
    if (vx * Math.sign(ox) >= 0 && vy * Math.sign(oy) >= 0) d = Math.min(d, Math.abs(Math.hypot(vx, vy) - R));
  }
  return d;
}
export const onDeck = (x, y, eps = 1e-6) => offTrack(x, y) <= DECK_HW + eps;

// Every train at a machine time as cars with poses: [{id, dwell, stationId, cars: [{index, s, lead, tail, pose}]}].
export function trainPoses(trains) {
  return trains.map(t => ({
    ...t,
    cars: t.cars.map((c, i) => ({ ...c, lead: i === 0, tail: i === t.cars.length - 1, pose: carPose(c.s) })),
  }));
}

// ---- pieces for the painter, in rotated cells for quarter turn r -------------------------
// Straight deck pieces (axis-aligned boxes), the four curved corner pieces (their bounding
// squares), and one station item per STATIONS entry (platform, canopy, stairs). Boxes
// touch but never overlap, so depthOrder can order every pair that matters.
const rr = (x, y, r) => rot(x, y, r);
function boxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [u, v] of pts) { if (u < x0) x0 = u; if (u > x1) x1 = u; if (v < y0) y0 = v; if (v > y1) y1 = v; }
  return { x0, y0, x1, y1 };
}
// Straight pieces in map cells: [{a:[x,y], b:[x,y], d:[dx,dy]}] (a -> b in travel direction).
export const STRAIGHTS = (() => {
  const out = [], R = CORNER_R;
  CORNERS.forEach((c, i) => {
    const n = CORNERS[(i + 1) % 4];
    const ax = c.x + c.dout[0] * R, ay = c.y + c.dout[1] * R, bx = n.x - n.din[0] * R, by = n.y - n.din[1] * R;
    const len = Math.hypot(bx - ax, by - ay), k = Math.ceil(len / PIECE);
    for (let j = 0; j < k; j++) {
      const t0 = j / k, t1 = (j + 1) / k;
      out.push({ a: [ax + (bx - ax) * t0, ay + (by - ay) * t0], b: [ax + (bx - ax) * t1, ay + (by - ay) * t1], d: c.dout, edge: i, j, len: len / k });
    }
  });
  return out;
})();

// A station's layout in map cells: platform rectangle and stairs, on the district side.
export function stationGeo(st) {
  const t = pathAt(st.s), n = [st.n.x, st.n.y], d = [t.dx, t.dy];
  const at = (along, lat) => [st.x + d[0] * along + n[0] * lat, st.y + d[1] * along + n[1] * lat];
  const lot = [at(-PLAT_HL, PLAT_IN), at(PLAT_HL, PLAT_IN), at(PLAT_HL, PLAT_OUT), at(-PLAT_HL, PLAT_OUT)];
  const stairs = [at(0.2, PLAT_OUT), at(0.2 + STAIR_L, PLAT_OUT), at(0.2 + STAIR_L, PLAT_OUT + STAIR_W), at(0.2, PLAT_OUT + STAIR_W)];
  return { st, d, n, at, lot, stairs, all: [...lot, ...stairs] };
}

export function loopPieces(r) {
  const items = [];
  for (const p of STRAIGHTS) {
    const px = -p.d[1], py = p.d[0];
    const pts = [[p.a[0] + px * DECK_HW, p.a[1] + py * DECK_HW], [p.a[0] - px * DECK_HW, p.a[1] - py * DECK_HW], [p.b[0] + px * DECK_HW, p.b[1] + py * DECK_HW], [p.b[0] - px * DECK_HW, p.b[1] - py * DECK_HW]].map(([x, y]) => rr(x, y, r));
    // a pillar under every other piece, and under the first of each edge
    items.push({ kind: "t", deck: true, top: DECK - 0.01, map: p, pillar: p.j % 2 === 0, ...boxOf(pts) });
  }
  CORNERS.forEach((c, i) => {
    const R = CORNER_R + DECK_HW;
    const pts = [[c.cx, c.cy], [c.cx + (c.x - c.cx) / CORNER_R * R, c.cy], [c.cx, c.cy + (c.y - c.cy) / CORNER_R * R], [c.cx + (c.x - c.cx) / CORNER_R * R, c.cy + (c.y - c.cy) / CORNER_R * R]].map(([x, y]) => rr(x, y, r));
    items.push({ kind: "k", deck: true, top: DECK - 0.01, corner: c, index: i, ...boxOf(pts) });
  });
  for (const st of Object.values(STATIONS)) {
    const g = stationGeo(st);
    items.push({ kind: "st", deck: true, top: DECK - 0.01, geo: g, ...boxOf(g.all.map(([x, y]) => rr(x, y, r))) });
  }
  return items;
}

// A car's bounding box in rotated cells (for slotting it into the painter's order).
// ahead: stretch the box forward (the lead car's headlight pool on the deck).
export function carBox(pose, r, ahead = 0) {
  const pts = carCorners(pose).map(([x, y]) => rr(x, y, r));
  if (ahead) pts.push(rr(pose.x + pose.dx * (CAR_HL + ahead), pose.y + pose.dy * (CAR_HL + ahead), r));
  return boxOf(pts);
}

