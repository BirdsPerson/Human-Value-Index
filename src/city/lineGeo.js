// THE LINES as the iso view builds them (PHASE 2): each shuttle's double-track viaduct along its
// centreline (straight pieces, round corners), a platform per stop with its canopy and stairs,
// and its trains as cars placed by their bogies. The Loop keeps its own (loopGeo.js); this
// module speaks for every line, the Loop included, where a view needs one answer (a stop's
// platform, a train's car poses). Pure (no DOM), checked in node (scripts/check-cityview.mjs).
//
// Heights: the deck stands DECK storeys over the line's ground (`base`: zero, except up the
// mountain). Pieces over the mountain's lots are painted by the mountain itself (coastDraw.js,
// cell by cell back to front), so a ridge hides what is behind it at every quarter turn.

import { LINES, LOOP, linesOn, NET, STOPS } from "./sim.js";
import { rot, DECK } from "./iso.js";
import { TRACK, EDGE } from "./lines.js";
import { stationGeo, carPose as loopCarPose, trainPoses as loopTrainPoses } from "./loopGeo.js";
import { terrainH, onTerrain, TERRAIN } from "./coastGeo.js";

export const PLAT_HL = 4.8;          // a line's platform half-length (its trains are 3 cars, 8.2 cells; a line may set its own, platHL)
const PLAT_HL_DEFAULT = PLAT_HL;
export const PLAT_IN = EDGE, PLAT_OUT = 1.3, STAIR_W = 0.75, STAIR_L = 3;
export const BOGIE = 0.85;
export const PIECE = 3;
export const HW = TRACK + EDGE;      // the double deck's half-width

const mod = (v, m) => ((v % m) + m) % m;
const SHUTTLES = LINES.filter(l => l !== LOOP);

// The ground under a line at u (sampled once: the mountain's profile is a running maximum).
const BASE = new Map(SHUTTLES.map(l => {
  const n = Math.ceil(l.L / 0.5), a = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) a[i] = l.base(Math.min(l.L, i * 0.5));
  return [l.id, a];
}));
export function baseAt(line, u) {
  if (line === LOOP) return 0;
  const a = BASE.get(line.id), x = Math.max(0, Math.min(line.L, u)) / 0.5, i = Math.min(a.length - 2, Math.floor(x)), f = x - i;
  return a[i] + (a[i + 1] - a[i]) * f;
}
// On the mountain's lots (painted with the terrain): the slopes and the summit parcel.
export const onMountain = (x, y) => onTerrain(x, y) && y < TERRAIN.y1 - 1e-6;

// A car of a line at arc s (its middle): centre, heading, and the deck height under it.
export function lineCarPose(line, s) {
  if (line === LOOP) return { ...loopCarPose(s), z: 0 };
  const a = line.at(s - BOGIE), b = line.at(s + BOGIE);
  const dx = b.x - a.x, dy = b.y - a.y, n = Math.hypot(dx, dy) || 1;
  const u = line.at(s).u;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, dx: dx / n, dy: dy / n, z: baseAt(line, u), u };
}
// Every train of every line (sim.lineTrainsAt rows) as cars with poses.
export function linePoses(trains) {
  return trains.map(t => {
    if (!t.line || t.line === "loop") { const [p] = loopTrainPoses([t]); return { ...p, line: "loop", cars: p.cars.map(c => ({ ...c, pose: { ...c.pose, z: 0 } })) }; }
    const line = LINES.find(l => l.id === t.line);
    return { ...t, cars: t.cars.map((c, i) => ({ ...c, lead: i === 0, tail: i === t.cars.length - 1, pose: lineCarPose(line, c.s) })) };
  });
}

// A stop's platform, canopy and stairs in map cells (the Loop's from loopGeo.stationGeo), with
// the heights: z the deck's ground, foot the ground at the foot of the stairs.
const SG = new Map();
export function stopGeo(stop) {
  let g = SG.get(stop.id);
  if (g) return g;
  if (stop.lineId === "loop") g = { ...stationGeo(stop), hl: 6, pin: 0.65, pout: 1.3, z: 0, foot: 0 };
  else {
    const n = [stop.n.x, stop.n.y], d = [stop.d.x, stop.d.y], PLAT_HL = LINES[stop.line].platHL || PLAT_HL_DEFAULT;
    const at = (along, lat) => [stop.x + d[0] * along + n[0] * lat, stop.y + d[1] * along + n[1] * lat];
    const sd = stop.sd || 1;   // the stairs' way along the platform (toward the stub's end, at a terminal)
    const lot = [at(-PLAT_HL, PLAT_IN), at(PLAT_HL, PLAT_IN), at(PLAT_HL, PLAT_OUT), at(-PLAT_HL, PLAT_OUT)];
    const stairs = [at(sd * 0.2, PLAT_OUT), at(sd * (0.2 + STAIR_L), PLAT_OUT), at(sd * (0.2 + STAIR_L), PLAT_OUT + STAIR_W), at(sd * 0.2, PLAT_OUT + STAIR_W)];
    const [fx, fy] = at(sd * (0.2 + STAIR_L), PLAT_OUT + STAIR_W / 2);
    g = { st: stop, d, n, at, lot, stairs, all: [...lot, ...stairs], hl: PLAT_HL, pin: PLAT_IN, pout: PLAT_OUT, sd, z: stop.base || 0, foot: onTerrain(fx, fy) ? terrainH(fx, fy) : 0, line: stop.lineId, color: LINES[stop.line].color };
  }
  SG.set(stop.id, g);
  return g;
}

// Distance from a map point to a line's nearest track (either one, the taper included), and
// whether a point is on its deck.
export function offLine(line, x, y) {
  let best = Infinity;
  for (let s = 0; s < line.length; s += 0.2) { const p = line.at(s); best = Math.min(best, Math.hypot(p.x - x, p.y - y)); }
  return best;
}
export function onLineDeck(line, x, y, eps = 1e-6) {
  // the deck: within its half-width of the centreline at the nearest u
  let bu = 0, bd = Infinity;
  for (let u = 0; u <= line.L; u += 0.1) { const c = line.centre.at(u), d = Math.hypot(c.x - x, c.y - y); if (d < bd) { bd = d; bu = u; } }
  return bd <= line.lat(bu) + EDGE + eps;
}

// ---- pieces for the painter, in rotated cells for quarter turn r ------------------------------
// Straight deck pieces (a -> b in the outbound direction, with the deck's half-width and the
// ground at each end), a corner piece per round corner (its bounding square), a stop item per
// stop. Each carries `line`; `mtn` marks one painted by the mountain.
function boxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [u, v] of pts) { if (u < x0) x0 = u; if (u > x1) x1 = u; if (v < y0) y0 = v; if (v > y1) y1 = v; }
  return { x0, y0, x1, y1 };
}
const STRAIGHTS = new Map(SHUTTLES.map(line => {
  const out = [];
  for (const [si, st] of line.centre.straights.entries()) {
    const len = st.u1 - st.u0;
    // cut at most PIECE long, and where the ground changes lot (on or off the mountain)
    const cuts = [0];
    const k = Math.ceil(len / PIECE);
    for (let j = 1; j < k; j++) cuts.push(len * j / k);
    // the mountain's lots begin at the terrain's southern edge: a piece never straddles it
    if (st.d[1]) { const q = (TERRAIN.y1 - st.a[1]) / st.d[1]; if (q > 1e-6 && q < len - 1e-6) cuts.push(q); }
    cuts.push(len);
    const cs = [...new Set(cuts.map(c => Math.round(c * 1e6) / 1e6))].sort((a, b) => a - b);
    for (let j = 0; j + 1 < cs.length; j++) {
      const ua = st.u0 + cs[j], ub = st.u0 + cs[j + 1];
      if (ub - ua < 1e-6) continue;
      const A = line.centre.at(ua), B = line.centre.at(ub);
      out.push({ line: line.id, straight: si, j, a: [A.x, A.y], b: [B.x, B.y], d: st.d, ua, ub, len: ub - ua,
        hwA: line.lat(ua) + EDGE, hwB: line.lat(ub) + EDGE, latA: line.lat(ua), latB: line.lat(ub), zA: baseAt(line, ua), zB: baseAt(line, ub) });
    }
  }
  // a pier under every other piece (and never on a stub end's first)
  out.forEach((p, i) => { p.pillar = i % 2 === 0; const m = [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2]; p.mtn = onMountain(m[0], m[1]); });
  return [line.id, out];
}));
export const lineStraights = (lineId) => STRAIGHTS.get(lineId) || [];

export function linePieces(r, net = NET) {
  const items = [];
  const rr = (x, y) => rot(x, y, r);
  for (const line of linesOn(net)) {
    if (line === LOOP) continue;
    for (const p of STRAIGHTS.get(line.id)) {
      const px = -p.d[1], py = p.d[0];
      const pts = [[p.a[0] + px * p.hwA, p.a[1] + py * p.hwA], [p.a[0] - px * p.hwA, p.a[1] - py * p.hwA], [p.b[0] + px * p.hwB, p.b[1] + py * p.hwB], [p.b[0] - px * p.hwB, p.b[1] - py * p.hwB]].map(([x, y]) => rr(x, y));
      items.push({ kind: "lt", line, map: p, deck: true, over: true, mtn: p.mtn, top: DECK + Math.max(p.zA, p.zB) - 0.01, id: `${line.id}:t${p.straight}.${p.j}`, ...boxOf(pts) });
    }
    line.centre.corners.forEach((c, i) => {
      const Ro = c.R + HW;
      const sx = Math.sign(c.x - c.cx), sy = Math.sign(c.y - c.cy);
      const pts = [[c.cx, c.cy], [c.cx + sx * Ro, c.cy], [c.cx, c.cy + sy * Ro], [c.cx + sx * Ro, c.cy + sy * Ro]].map(([x, y]) => rr(x, y));
      items.push({ kind: "lk", line, corner: c, index: i, deck: true, over: true, mtn: false, top: DECK - 0.01, id: `${line.id}:k${i}`, ...boxOf(pts) });
    });
    for (const st of line.stops) {
      const g = stopGeo(st);
      const [cx, cy] = g.at(0, (PLAT_IN + PLAT_OUT) / 2);
      items.push({ kind: "ls", line, geo: g, deck: true, over: true, mtn: onMountain(cx, cy), top: DECK + g.z - 0.01, id: st.id, ...boxOf(g.all.map(([x, y]) => rr(x, y))) });
    }
  }
  return items;
}

// A car's bounding box in rotated cells (for slotting it into the painter's order).
export function lineCarBox(pose, r, hl, hw, ahead = 0) {
  const px = -pose.dy, py = pose.dx;
  const pts = [[pose.x + pose.dx * hl + px * hw, pose.y + pose.dy * hl + py * hw], [pose.x + pose.dx * hl - px * hw, pose.y + pose.dy * hl - py * hw], [pose.x - pose.dx * hl - px * hw, pose.y - pose.dy * hl - py * hw], [pose.x - pose.dx * hl + px * hw, pose.y - pose.dy * hl + py * hw]];
  if (ahead) pts.push([pose.x + pose.dx * (hl + ahead), pose.y + pose.dy * (hl + ahead)]);
  return boxOf(pts.map(([x, y]) => rot(x, y, r)));
}
// the stop a platform point belongs to, for STOPS lookups by the views
export const stopById = (id) => STOPS[id] || null;
export { mod };
