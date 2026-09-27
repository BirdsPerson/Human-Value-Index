// The Substrate in three dimensions, built from flat planes: a ground plate with the
// district outlines, every building as a stack of floor rectangles, the Loop as a raised
// ring with stations and trains, subjects as dots on the plane they stand on.
// Pure math, no DOM: City3D.jsx draws it, scripts/check-city3d.mjs tests it in node.
//
// Projection is the cube's (src/cube3d.js rotate/project): the same yaw-then-pitch turn
// and the same weak perspective. World space, like the cube: x right, y up, z away from
// the viewer at yaw 0. One world unit is SPAN sim cells; the city's middle sits at the
// origin, so the whole Substrate spans about -1..1 on x.
//
// Sim contract (docs/CITY_SPEC.md, City v2): BUILDINGS, trainsAt(mt), and whereAt with
// {buildingId, floor} and commute sub-states (leg: walk | wait | ride, trainId, car).
// Until sim.js exports them, the stubs below stand in under the same names. Every read
// goes through the normalisers, so the switch is automatic when the real ones land.

import * as SIM from "./sim.js";
import { rotate, project, CAMERA } from "../cube3d.js";
import { FLOORS as HQ_FLOORS } from "../building.js";

// ---- world scale -------------------------------------------------------------------
export const SPAN = 55;            // sim cells per world unit
export const FLOOR_H = 2.1 / SPAN; // one storey, in world units (about two cells)
export const LOOP_H = 2.6 * FLOOR_H;   // the Loop's deck, above the low buildings
export const EXPLODE_GAP = 3.2;    // extra storeys of air between floors when a building opens
export const ZOOM_MIN = 0.7, ZOOM_MAX = 9;
export const PITCH_MIN = -1.45, PITCH_MAX = -0.18;   // always from above, never flat on the ground
export const REST3D = { yaw: -0.42, pitch: -0.72, zoom: 1 };
export const clampPitch3 = (p) => Math.max(PITCH_MIN, Math.min(PITCH_MAX, p));
export const clampZoom = (z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

const DISTRICTS = SIM.DISTRICTS;
const DISTRICT = Object.fromEntries(DISTRICTS.map(d => [d.id, d]));
const PLACES = SIM.PLACES;

const bounds = (() => {
  const xs = DISTRICTS.flatMap(d => [d.rect.x, d.rect.x + d.rect.w]), ys = DISTRICTS.flatMap(d => [d.rect.y, d.rect.y + d.rect.h]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
})();
export const CENTRE = { x: (bounds.x0 + bounds.x1) / 2, y: (bounds.y0 + bounds.y1) / 2 };

// A sim point (cells, y down the map) at height h -> world [x, y, z]. The top of the map
// is the far side at yaw 0, so the 3D view opens looking the way the 2D map reads.
export const toWorld = (x, y, h = 0) => [(x - CENTRE.x) / SPAN, h, (CENTRE.y - y) / SPAN];
export const rectCorners = (r, h = 0) => [toWorld(r.x, r.y, h), toWorld(r.x + r.w, r.y, h), toWorld(r.x + r.w, r.y + r.h, h), toWorld(r.x, r.y + r.h, h)];

// ---- hashing (same avalanche as sim.js, local so this file stands alone) ---------------
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
const h01 = (s) => fnv(s) / 4294967296;
const keyOf = (s) => SIM.keyOf ? SIM.keyOf(s) : (s?.slug || s?.name || "unfiled");

// ---- the Loop ----------------------------------------------------------------------
// The sim may rename the ring when the bus becomes a train; take whichever it exports.
const RING = SIM.LOOP_LINE || SIM.LOOP || SIM.TRAIN || SIM.BUS;
export const LOOP_LENGTH = RING.length;
export const LAP_HOURS = RING.lapHours || 0.75;
export const loopAt = (s) => RING.at(s);

// One station per district: from the sim's STATIONS when it has them, else the bus stops.
export const STATIONS = (() => {
  const src = SIM.STATIONS || RING.stations || RING.stops || {};
  const list = Array.isArray(src) ? src : Object.entries(src).map(([id, v]) => ({ districtId: id, ...v }));
  return list.map(st => {
    const districtId = st.districtId || st.district || st.id;
    const d = DISTRICT[districtId];
    const at = typeof st.s === "number" ? loopAt(st.s) : { x: st.x, y: st.y };
    return { id: st.id || districtId, districtId, s: st.s, n: st.n, x: at.x, y: at.y, name: st.name || (d ? `${d.name.replace(/^THE /, "")} STATION` : String(districtId).toUpperCase()), addr: st.addr || d?.addr || "" };
  }).filter(st => Number.isFinite(st.x));
})();

// ---- buildings ---------------------------------------------------------------------
// Normalised: { id, districtId, name, rect (cells), floors: [{index, name, places}], stub }
// Floor 0 is the ground; floors stack upward.
const HQ_ORDER = ["penthouses", "exec-suite", "ops-floor", "assembly-hall", "tribunal"];   // top down, the rest below

function stubBuildings() {
  const out = [];
  for (const d of DISTRICTS) {
    if (d.id === "hq") {
      // HQ is the existing six-floor building (src/building.js), one tower mid-district.
      const r = d.rect, w = r.w * 0.42, h = r.h * 0.5;
      const rect = { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2 + 1, w, h };
      const n = HQ_FLOORS.length;
      const floors = HQ_FLOORS.map((f, i) => ({ index: n - 1 - i, name: f.name, code: f.code, places: [] })).sort((a, b) => a.index - b.index);
      HQ_ORDER.forEach((pid, i) => { if (PLACES[pid]) floors[n - 1 - i].places.push(pid); });
      out.push({ id: "hq-tower", districtId: "hq", name: "DEPARTMENT HEADQUARTERS", rect, floors, stub: true });
      continue;
    }
    for (const pid of d.places) {
      const p = PLACES[pid];
      if (!p?.rect) continue;
      const n = Math.max(1, Math.min(6, Math.ceil(p.cap / (p.kind === "home" ? 24 : 10))));
      const inset = Math.min(0.9, p.rect.w * 0.12, p.rect.h * 0.2);
      const rect = { x: p.rect.x + inset, y: p.rect.y + inset, w: p.rect.w - 2 * inset, h: p.rect.h - 2 * inset };
      const floors = Array.from({ length: n }, (_, i) => ({ index: i, name: n === 1 ? p.name : i === 0 ? `${p.name} // GROUND` : `${p.name} // LEVEL ${i}`, places: [pid] }));
      out.push({ id: `${pid}-bldg`, districtId: d.id, name: p.name, rect, floors, stub: true });
    }
  }
  return out;
}

function normBuilding(b) {
  const districtId = b.districtId || b.district;
  const placeIds = b.places || (Array.isArray(b.floors) ? b.floors.flatMap(f => f.places || f.rooms || []) : []);
  let rect = b.rect || b.footprint || null;
  if (!rect) {
    const rs = placeIds.map(id => PLACES[id]?.rect).filter(Boolean);
    if (rs.length) {
      const x0 = Math.min(...rs.map(r => r.x)), y0 = Math.min(...rs.map(r => r.y));
      const x1 = Math.max(...rs.map(r => r.x + r.w)), y1 = Math.max(...rs.map(r => r.y + r.h));
      rect = { x: x0 + 0.6, y: y0 + 0.6, w: Math.max(1, x1 - x0 - 1.2), h: Math.max(1, y1 - y0 - 1.2) };
    } else if (DISTRICT[districtId]) {
      const r = DISTRICT[districtId].rect;
      rect = { x: r.x + r.w * 0.3, y: r.y + r.h * 0.3, w: r.w * 0.4, h: r.h * 0.4 };
    }
  }
  const fl = Array.isArray(b.floors)
    ? b.floors.map((f, i) => (typeof f === "object" ? { index: f.index ?? f.floor ?? i, level: f.level ?? f.index ?? i, name: f.name || `LEVEL ${i}`, code: f.code, places: f.places || f.rooms || [] } : { index: i, level: i, name: `LEVEL ${i}`, places: [] }))
    : Array.from({ length: Math.max(1, b.floors || 1) }, (_, i) => ({ index: i, level: i, name: `LEVEL ${i}`, places: i === 0 ? placeIds : [] }));
  fl.sort((a, b2) => a.index - b2.index);
  // a little street between neighbours, so two buildings never share a wall line
  if (rect && !b.inset) { const k = Math.min(0.6, rect.w * 0.12, rect.h * 0.12); rect = { x: rect.x + k, y: rect.y + k, w: rect.w - 2 * k, h: rect.h - 2 * k }; }
  return finishBuilding({ id: b.id, districtId, name: b.name || String(b.id).toUpperCase(), addr: b.addr, rect, floors: fl, stub: false });
}

// Levels are storeys against the street: G = 0, basements below it (HQ keeps B1-B3).
function finishBuilding(b) {
  for (const f of b.floors) if (f.level == null) f.level = f.index;
  b.levels = Object.fromEntries(b.floors.map(f => [f.index, f.level]));
  b.topLevel = Math.max(...b.floors.map(f => f.level));
  b.bottomLevel = Math.min(...b.floors.map(f => f.level));
  return b;
}
export const levelOf = (b, index) => b.levels[index] ?? index;

export const LIVE_BUILDINGS = !!SIM.BUILDINGS;
export const LIVE_TRAINS = typeof SIM.trainsAt === "function";
export const BUILDINGS = (() => {
  const src = SIM.BUILDINGS;
  if (!src) return stubBuildings().map(finishBuilding);
  const list = Array.isArray(src) ? src : Object.entries(src).map(([id, v]) => ({ id, ...v }));
  return list.map(normBuilding).filter(b => b.rect && DISTRICT[b.districtId]);
})();
export const BUILDING = Object.fromEntries(BUILDINGS.map(b => [b.id, b]));

// place -> {buildingId, floors: [indices]}
export const PLACE_HOME = (() => {
  const m = {};
  for (const b of BUILDINGS) for (const f of b.floors) for (const pid of f.places) {
    const e = m[pid] || (m[pid] = { buildingId: b.id, floors: [] });
    if (e.buildingId === b.id) e.floors.push(f.index);
  }
  // Places the catalogue forgot: the tallest building of their district takes them in.
  for (const pid in PLACES) if (!m[pid]) {
    const b = BUILDINGS.filter(x => x.districtId === PLACES[pid].district).sort((a, c) => c.floors.length - a.floors.length)[0];
    if (b) m[pid] = { buildingId: b.id, floors: [b.floors[0].index] };
  }
  return m;
})();

// Where a subject is, as a building and a floor. The sim's answer when it gives one.
export function locate(s, w) {
  if (!w) return null;
  if (w.buildingId && BUILDING[w.buildingId]) return { buildingId: w.buildingId, floor: w.floor ?? BUILDING[w.buildingId].floors[0].index };
  if (w.activity === "commute") return null;
  const home = PLACE_HOME[w.placeId];
  if (!home) return null;
  const fl = home.floors.length === 1 ? home.floors[0] : home.floors[Math.floor(h01(`${keyOf(s)}|flr|${w.placeId}`) * home.floors.length)];
  return { buildingId: home.buildingId, floor: fl };
}

// ---- trains ------------------------------------------------------------------------
export const TRAIN_CARS = 4;
export const CAR_LEN = 2.4;   // cells
export const CAR_GAP = 0.5;
const STUB_TRAINS = 3;

// -> [{ id, s, cars }] with s the head's arc position (cells along the ring, clockwise).
export function trains(mt) {
  const L = LOOP_LENGTH;
  if (LIVE_TRAINS) {
    const raw = SIM.trainsAt(mt) || [];
    return raw.map((t, i) => {
      let s = t.s ?? t.pos ?? t.arc;
      if (typeof s !== "number" && Number.isFinite(t.x)) s = nearestArc(t.x, t.y);
      const carS = Array.isArray(t.cars) && t.cars.every(c => typeof c?.s === "number") ? t.cars.map(c => c.s) : null;
      return { id: t.id ?? `L${i + 1}`, s: ((s % L) + L) % L, cars: Array.isArray(t.cars) ? t.cars.length : (t.cars || TRAIN_CARS), carS, dwell: !!(t.dwell || t.atStation || t.stationId), stationId: t.stationId || null };
    });
  }
  const T = typeof mt === "number" ? mt : SIM.toHours(mt);
  return Array.from({ length: STUB_TRAINS }, (_, i) => ({ id: `L${i + 1}`, s: ((((T / LAP_HOURS) + i / STUB_TRAINS) % 1) + 1) % 1 * L, cars: TRAIN_CARS, dwell: false }));
}
// Arc position of each car's centre (car 0 leads).
export const carArc = (t, k) => (t.carS ? t.carS[k] : t.s - k * (CAR_LEN + CAR_GAP) - CAR_LEN / 2);

const ARC_SAMPLES = (() => { const a = []; for (let s = 0; s < LOOP_LENGTH; s += 0.5) a.push([s, loopAt(s)]); return a; })();
export function nearestArc(x, y) {
  let best = 0, bd = Infinity;
  for (const [s, p] of ARC_SAMPLES) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = s; } }
  return best;
}

// ---- scene -------------------------------------------------------------------------
// The ring is drawn in SEG-cell pieces, each depth-sorted by its midpoint.
export const SEG = 3;
const SEG_N = Math.ceil(LOOP_LENGTH / SEG);
// A car spans arcs [s - CAR_LEN/2, s + CAR_LEN/2]: it must paint after every rail piece
// under it, so it sorts just nearer than the nearest of them (and never behind its own middle).
// (Start, middle and end: the ring's last piece is shorter than a car.)
const segAt = (s) => Math.floor(((((s % LOOP_LENGTH) + LOOP_LENGTH) % LOOP_LENGTH)) / SEG) % SEG_N;
export function carDepth(s, segDepth, midDepth) {
  return Math.min(segDepth[segAt(s - CAR_LEN / 2)], segDepth[segAt(s)], segDepth[segAt(s + CAR_LEN / 2)], midDepth) - 1e-4;
}
// Height of a floor at level i when the building is opened by e (0 closed .. 1 fully apart).
export const floorHeight = (i, e = 0) => i * FLOOR_H * (1 + e * EXPLODE_GAP);

// The static pieces, in world coordinates. Built once.
export function buildScene() {
  const pad = 2.5;
  const ground = rectCorners({ x: bounds.x0 - pad - 2, y: bounds.y0 - pad - 3, w: bounds.x1 - bounds.x0 + 2 * pad + 4, h: bounds.y1 - bounds.y0 + 2 * pad + 6 });
  const districts = DISTRICTS.map(d => ({
    id: d.id, name: d.name, addr: d.addr, quad: rectCorners(d.rect),
    centre: toWorld(d.rect.x + d.rect.w / 2, d.rect.y + d.rect.h / 2),
    label: toWorld(d.rect.x + 1, d.rect.y + 1),
  }));
  const buildings = BUILDINGS.map(b => ({
    ...b,
    base: rectCorners(b.rect),
    centre: toWorld(b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2),
    storeys: b.floors.length,
  }));
  // The ring in short pieces, so each can be depth-sorted against the buildings.
  const segs = [];
  for (let s = 0; s < LOOP_LENGTH; s += SEG) {
    const a = loopAt(s), b = loopAt(Math.min(LOOP_LENGTH, s + SEG)), m = loopAt(Math.min(LOOP_LENGTH, s + SEG / 2));
    segs.push({ s, a: toWorld(a.x, a.y, LOOP_H), b: toWorld(b.x, b.y, LOOP_H), mid: toWorld(m.x, m.y, LOOP_H), pillar: Math.round(s / SEG) % 3 === 0 ? toWorld(a.x, a.y, 0) : null });
  }
  // Platforms run along the track on the district's side (st.n), a train's length long.
  const stations = STATIONS.map(st => {
    const s = typeof st.s === "number" ? st.s : nearestArc(st.x, st.y);
    const a = loopAt(s - 6), b = loopAt(s + 6);
    const n = st.n || { x: 0, y: 0 };
    const off = (p, k) => toWorld(p.x + n.x * k, p.y + n.y * k, LOOP_H);
    const platform = n.x || n.y ? [off(a, 0.35), off(b, 0.35), off(b, 1.55), off(a, 1.55)]
      : [toWorld(st.x - 2, st.y - 0.9, LOOP_H), toWorld(st.x + 2, st.y - 0.9, LOOP_H), toWorld(st.x + 2, st.y + 0.9, LOOP_H), toWorld(st.x - 2, st.y + 0.9, LOOP_H)];
    return { ...st, at: toWorld(st.x + n.x, st.y + n.y, LOOP_H), foot: toWorld(st.x + n.x, st.y + n.y, 0), platform };
  });
  return { ground, districts, buildings, segs, stations };
}

// ---- camera ------------------------------------------------------------------------
// view: { yaw, pitch, zoom, tx, tz, w, h }. -> the object cube3d.project wants, plus the
// target offset the city applies first (the camera orbits its target, not the origin).
export function viewFor(cam, w, h) {
  const base = Math.min(w * 0.43, h * 0.82);
  return { yaw: cam.yaw, pitch: cam.pitch, scale: base * cam.zoom, cx: w / 2, cy: h * 0.5, tx: cam.tx || 0, tz: cam.tz || 0, ty: cam.ty || 0 };
}
export function P(p, v) {
  return project([p[0] - v.tx, p[1] - v.ty, p[2] - v.tz], v);
}
// Depth of a world point in the camera's frame (bigger = farther), for painter's sorting.
export const depthOf = (p, v) => rotate([p[0] - v.tx, p[1] - v.ty, p[2] - v.tz], v.yaw, v.pitch)[2];

// Drag on screen -> move the target along the ground, so the city follows the finger.
export function panTarget(cam, dx, dy, v) {
  const k = 1 / v.scale;
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  const sp = Math.max(0.25, Math.abs(Math.sin(cam.pitch)));
  // screen right is world (cos yaw, 0, sin yaw); screen up on the ground is (-sin yaw, 0, cos yaw) / sin pitch
  const rx = -dx * k, fz = dy * k / sp;
  return { ...cam, tx: clampT((cam.tx || 0) + rx * cy - fz * sy), tz: clampT((cam.tz || 0) + rx * sy + fz * cy) };
}
const clampT = (t) => Math.max(-1.2, Math.min(1.2, t));

// Glide a value toward a target, frame-rate independent.
export const ease = (a, b, dt, rate = 6) => a + (b - a) * (1 - Math.exp(-rate * dt));

// ---- hit testing -------------------------------------------------------------------
export function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y + 1e-12) + a.x) inside = !inside;
  }
  return inside;
}
// Monotone chain; pts [{x, y}] -> hull in order.
export function hull(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// Where a subject stands, in world space. loc from locate(); w from whereAt.
// opened: (buildingId) -> explode factor. carPos: (trainId, car) -> world point or null.
export function subjectPoint(s, w, loc, opened, carPos) {
  if (loc) {
    const b = BUILDING[loc.buildingId], r = b.rect;
    // the sim's own spot when it lies in the footprint, else a stable one of our own
    const inX = w.x > r.x && w.x < r.x + r.w, inY = w.y > r.y && w.y < r.y + r.h;
    const k = keyOf(s);
    const x = inX ? w.x : r.x + r.w * (0.15 + 0.7 * h01(`${k}|bx|${b.id}`));
    const y = inY ? w.y : r.y + r.h * (0.15 + 0.7 * h01(`${k}|by|${b.id}`));
    return toWorld(x, y, floorHeight(levelOf(b, loc.floor), opened(b.id)) + 0.0015);
  }
  if (w.activity === "commute") {
    if (w.leg === "ride" && w.trainId != null) { const p = carPos(w.trainId, w.car || 0); if (p) return p; }
    const up = w.leg === "ride" || w.leg === "wait" || w.leg === "board" || w.leg === "alight" || w.atDistrictId === "bus" || w.atDistrictId === "loop";
    // on the stairs between the street and the deck: part of the way up
    const climb = !up && w.climb > 0 ? Math.min(1, w.climb) : 0;
    return toWorld(w.x, w.y, up ? LOOP_H + 0.002 : 0.001 + climb * (LOOP_H + 0.001));
  }
  return toWorld(w.x ?? CENTRE.x, w.y ?? CENTRE.y, 0.001);
}

// ---- routes ------------------------------------------------------------------------
// #city/<district>/<building>?floor=N, keeping whatever else was in the query (dev ?at=).
export function buildingHref(districtId, buildingId, floor, query = "") {
  const q = new URLSearchParams((query || "").replace(/^\?/, ""));
  if (floor == null) q.delete("floor"); else q.set("floor", String(floor));
  const qs = q.toString();
  return `#city/${districtId}/${buildingId}${qs ? "?" + qs : ""}`;
}
// "#city/works/foundry-bldg?floor=2&at=10:00" -> { districtId, buildingId, floor, query }
export function parseCityRoute(route = "") {
  const r = String(route).replace(/^#/, "");
  const [path, qs = ""] = r.split("?");
  const parts = path.split("/");
  const q = new URLSearchParams(qs);
  const f = q.get("floor");
  return { districtId: parts[1] || null, buildingId: parts[2] || null, floor: f != null && f !== "" && Number.isFinite(+f) ? +f : null, query: qs ? "?" + qs : "" };
}

// ---- copy --------------------------------------------------------------------------
// HQ keeps its own books: its floors are named, never counted (see BuildingView).
export const CLASSIFIED = (b) => b?.id === "hq" || b?.id === "hq-tower";
export const floorCode = (f) => f.code || (f.index === 0 ? "G" : `${f.index}F`);
export function floorLabel(b, f, n, short = false) {
  const count = CLASSIFIED(b) ? "CLASSIFIED" : short ? String(n) : `${n} PRESENT`;
  return short ? `${floorCode(f)} // ${count}` : `${floorCode(f)} ${f.name.replace(`${b.name} // `, "")} // ${count}`;
}
export const EMPTY_FLOOR = "VACANT. THE LIGHTS STAY ON. THE DEPARTMENT IS WATCHING THE EMPTINESS.";
export { CAMERA };
