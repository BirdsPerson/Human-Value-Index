// DRIVE YOURSELF (2026-09-30). The viewer's own citizen leaves its schedule, in this
// browser only, and walks where the viewer steers it. Pure: no DOM, testable in node
// (scripts/check-control.mjs). The drawing and the camera are controlIso.js; the input
// widgets (legend, touch stick, buttons) are ControlLayer.jsx; the Gamepad API is gamepad.js.
//
// What this is NOT: the sim. The plan, the census, the quest check, every other viewer:
// they all still see the scheduled self, at its job, on its train. The controlled avatar is
// a client-side overlay (its state lives here and in localStorage), and the census drawn in
// this browser leaves the scheduled self out while it is on, so there is only one of you.
//
// Frames: map cells (x east, y south), as sim.js. Inside a building the avatar is on a floor
// (index into b.floors) at fx, 0..1 across the whole floor (its rooms side by side, as the
// cutaway draws them); the LIFT is at the west wall (fx < LIFT_X), the EXIT at the east end
// of the ground floor.

import { BUILDINGS, BUILDING, OPEN_LOTS, STATIONS, STOPS, PLACES, linesOn } from "./sim.js";
import { RIVER_BLOCKS } from "./river.js";   // THE ATTRITION: from its day nobody walks on the water (the bridges are gaps)
import { massingOf } from "./archGeo.js";
import { PARK_LOTS } from "./parkGeo.js";
import { PLAT_IN, PLAT_OUT, STAIR_W, STAIR_L } from "./loopGeo.js";
import { stopGeo } from "./lineGeo.js";
import { rot, BOUNDS, mod4 } from "./iso.js";

export const WALK_SPEED = 3.2;     // cells per real second (sim walkers do ~1: you are keen)
export const RUN_SPEED = 6.4;
export const FLOOR_SPEED = 0.34;   // fractions of a floor per second, inside
export const RADIUS = 0.22;        // the avatar's footprint, cells
export const DOOR_REACH = 1.25;    // how close to a door E opens it
export const PERSON_REACH = 1.1;   // how close to someone E opens their file
export const STATION_REACH = 1.6;  // how close to the stairs E climbs them
export const BENCH_REACH = 0.9;
export const LIFT_X = 0.06, EXIT_X = 0.965;
export const LIFT_COOLDOWN = 0.32; // seconds per floor
export const BUMP_ENTER = 0.4;     // seconds leaning on a door before you are through it
export const KERB = 0.4;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const HQ = new Set(["hq"]);

// ---- geometry ----------------------------------------------------------------------------
// Solid: every building with a massed body (archGeo.js), at its body box (stoops and awnings
// included). Open lots and grounds (the Green, the Diamond, the Bowl) are walked onto.
let SOLIDS = null;
export function solids() {
  if (SOLIDS) return SOLIDS;
  SOLIDS = [];
  for (const b of BUILDINGS) {
    if (OPEN_LOTS.has(b.id)) continue;
    const m = massingOf(b);
    if (!m) continue;
    const o = m.solid || m.box;   // the monolith on the line: its concourse (the trains run under the tower)
    SOLIDS.push({ id: b.id, x0: o.x0, y0: o.y0, x1: o.x1, y1: o.y1 });
    if (m.solid) for (const p of m.parts) if (p.seg === "pylon") SOLIDS.push({ id: b.id, x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1 });
  }
  return SOLIDS;
}
let RIVER_LIVE = false;
export function setRiverLive(on) { RIVER_LIVE = !!on; }
export function solidAt(x, y, r = RADIUS) {
  for (const o of solids()) if (x > o.x0 - r && x < o.x1 + r && y > o.y0 - r && y < o.y1 + r) return o;
  // the water: a step into it stops at the bank (no radius: the bank is walked right up to)
  if (RIVER_LIVE) for (const o of RIVER_BLOCKS) if (x > o.x0 && x < o.x1 && y > o.y0 && y < o.y1) return o;
  return null;
}
const inBounds = (x, y) => [clamp(x, BOUNDS.x0 + 0.5, BOUNDS.x1 - 0.5), clamp(y, BOUNDS.y0 + 0.5, BOUNDS.y1 - 0.5)];

// One step on the street, sliding along walls (x, then y). -> {x, y, bump: solid | null}
export function moveOnStreet(x, y, dx, dy) {
  let nx = x + dx, ny = y + dy, bump = solidAt(nx, ny);
  // already inside a body (a stale save, a spawn on a wall): walk out freely
  if (bump && solidAt(x, y) === bump) bump = null;
  if (bump) {
    if (!solidAt(nx, y)) ny = y;
    else if (!solidAt(x, ny)) nx = x;
    else { nx = x; ny = y; }
  }
  [nx, ny] = inBounds(nx, ny);
  return { x: nx, y: ny, bump };
}

// The nearest free point to (x, y): a spawn inside a wall steps out to the pavement.
export function freeSpot(x, y) {
  if (!solidAt(x, y)) return inBounds(x, y);
  for (let r = 0.25; r < 12; r += 0.25) for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (!solidAt(px, py)) return inBounds(px, py);
  }
  return inBounds(x, y);
}

// "Up" on the screen is up, whatever quarter the city is turned to. Screen direction
// (sx right, sy down) -> unit map direction. The iso projection is screen x = u - v,
// y = (u + v) / 2, so (du, dv) = ((sx + 2 sy) / 2, (2 sy - sx) / 2), then un-turned.
export function screenToMapDir(sx, sy, r) {
  if (!sx && !sy) return [0, 0];
  let du = (sx + 2 * sy) / 2, dv = (2 * sy - sx) / 2;
  const n = Math.hypot(du, dv) || 1;
  du /= n; dv /= n;
  return vecRot(du, dv, 4 - mod4(r));
}
// THIRD PERSON (controlIso.js, streetScene.js): the street-level camera behind your citizen.
// yaw 0 looks north (map -y); forward is (sin yaw, -cos yaw), right (cos yaw, sin yaw), as
// streetKit.toCam has it. A stick (screen x right, y down) -> a unit map direction: up is
// forward, into the screen, whatever way the camera faces.
export function camToMapDir(sx, sy, yaw) {
  if (!sx && !sy) return [0, 0];
  const f = -sy, s = sx, n = Math.hypot(f, s) || 1;
  return [(Math.sin(yaw) * f + Math.cos(yaw) * s) / n, (-Math.cos(yaw) * f + Math.sin(yaw) * s) / n];
}
// The yaw that looks along a map direction, and the yaw that looks "screen up" at an iso turn
export const yawOf = (dx, dy) => Math.atan2(dx, -dy);
export const yawOfIso = (r) => { const [dx, dy] = screenToMapDir(0, -1, r); return yawOf(dx, dy); };
// The shortest turn from a to b, in (-PI, PI]
export const angleTo = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d <= -Math.PI) d += 2 * Math.PI; return d; };
// dist / h: the camera's place behind and above the feet (cells); feet: where the feet sit on
// screen (a fraction of its height); far: the draw distance (a phone draws less).
export const CHASE = { dist: 6.2, h: 2.7, minH: 2.1, maxH: 6, orbit: 2.6, follow: 1.6, feet: 0.84, farPhone: 40, farDesk: 64 };
// How far behind (x, y), looking along yaw, the camera can sit before a building's body is in
// the way: it comes in, never through the wall.
export function chaseDist(x, y, yaw, dist = CHASE.dist) {
  const sx = -Math.sin(yaw), sy = Math.cos(yaw), S = solids();
  for (let d = 0.6; d <= dist; d += 0.2) {
    const px = x + sx * d, py = y + sy * d;
    if (S.some(o => px > o.x0 - 0.15 && px < o.x1 + 0.15 && py > o.y0 - 0.15 && py < o.y1 + 0.15)) return Math.max(1.6, d - 0.35);
  }
  return dist;
}
// The chase camera {x, y, yaw, h} behind a point (x, y) at ground height z (cells). Brought in
// by a wall, it rises too (a boom), and looks down over your shoulder rather than into your back.
export function chaseCam(x, y, z, yaw, h = CHASE.h, dist = chaseDist(x, y, yaw)) {
  return { x: x - Math.sin(yaw) * dist, y: y + Math.cos(yaw) * dist, yaw, h: z + h + Math.max(0, CHASE.dist - dist) * 0.5 };
}
// The forward lean of a driven stick: the camera eases round toward where you walk, never
// when you walk back at it (no spinning), and not while the right stick holds it.
export function followYaw(yaw, dir, mag, dt, k = CHASE.follow) {
  if (!mag) return yaw;
  const d = angleTo(yaw, yawOf(dir[0], dir[1]));
  if (Math.abs(d) > Math.PI * 0.7) return yaw;
  return yaw + d * Math.min(1, dt * k * mag);
}

// A vector turned r quarters (iso.rot without the centre).
export function vecRot(dx, dy, r) {
  const [a, b] = rot(dx, dy, r), [c, d] = rot(0, 0, r);
  return [a - c, b - d];
}
// Which way a map direction points on screen (sign of screen x): the sprite's facing.
export function screenXOf(dx, dy, r) {
  const [a, b] = vecRot(dx, dy, r);
  return a - b;
}

// A building's front door: a map point just outside it and the way out (normal). null for
// open ground (a lot, a field, the Bowl), which is entered by walking onto it.
const DOOR_T = { brownstone: 0.24, neon: 0.3, hospital: 0.3, datahall: 0.12 };
const DOORS = new Map();
export function doorOf(b) {
  if (!b) return null;
  if (DOORS.has(b.id)) return DOORS.get(b.id);
  let d = null;
  const m = OPEN_LOTS.has(b.id) ? null : massingOf(b);
  if (m) {
    const p = m.entry ? null : m.parts.find(q => q.k === "box" && q.door);
    const t = DOOR_T[m.style] ?? 0.5, off = m.style === "brownstone" ? 0.75 : 0.45;
    if (p) {
      const F = { s: [[p.x0, p.y1], [p.x1, p.y1], [0, 1]], e: [[p.x1, p.y1], [p.x1, p.y0], [1, 0]], n: [[p.x1, p.y0], [p.x0, p.y0], [0, -1]], w: [[p.x0, p.y0], [p.x0, p.y1], [-1, 0]] }[p.door];
      const [a, c, n] = F;
      d = { x: a[0] + (c[0] - a[0]) * t + n[0] * off, y: a[1] + (c[1] - a[1]) * t + n[1] * off, nx: n[0], ny: n[1] };
    } else if (m.entry) {
      d = { x: m.entry.x, y: m.entry.y, nx: m.entry.nx ?? 0, ny: m.entry.ny ?? 1 };   // the estate's street mouth (eastGeo.js)
    } else {
      // no drawn door (the vault, the reactor, the tanks): the middle of the south face
      d = { x: (m.box.x0 + m.box.x1) / 2, y: m.box.y1 + off, nx: 0, ny: 1 };
    }
    // a stoop or an awning may cover the door point: step it out to the pavement
    const o = solids().find(q => q.id === b.id);
    if (o) for (let k = 0; k < 12 && x_in(o, d.x, d.y); k++) { d.x += d.nx * 0.15; d.y += d.ny * 0.15; }
  }
  DOORS.set(b.id, d);
  return d;
}
const x_in = (o, x, y) => x > o.x0 - RADIUS && x < o.x1 + RADIUS && y > o.y0 - RADIUS && y < o.y1 + RADIUS;

// Open ground underfoot (a lot, a field, the Bowl): its building, or null.
export function groundAt(x, y) {
  for (const b of BUILDINGS) {
    if (!OPEN_LOTS.has(b.id) && !PARK_LOTS[b.id]) continue;
    const r = b.rect;
    if (x > r.x + KERB && x < r.x + r.w - KERB && y > r.y + KERB && y < r.y + r.h - KERB) return b;
  }
  return null;
}
// The nearest door within reach -> {b, d, dist} | null.
export function doorNear(x, y, reach = DOOR_REACH) {
  let best = null;
  for (const b of BUILDINGS) {
    const d = doorOf(b);
    if (!d) continue;
    const k = Math.hypot(d.x - x, d.y - y);
    if (k <= reach && (!best || k < best.dist)) best = { b, d, dist: k };
  }
  return best;
}
export const isClassified = (b) => Boolean(b && (HQ.has(b.id) || b.districtId === "hq"));

// Benches in the yards (archGeo yard props): somewhere to sit on the street.
let BENCHES = null;
export function benches() {
  if (BENCHES) return BENCHES;
  BENCHES = [];
  for (const b of BUILDINGS) {
    const m = OPEN_LOTS.has(b.id) ? null : massingOf(b);
    if (m) for (const p of m.yard) if (p.k === "bench") BENCHES.push({ id: `${b.id}:${p.i}`, x: p.x, y: p.y, along: p.along || "x" });
  }
  return BENCHES;
}
export function benchNear(x, y, reach = BENCH_REACH) {
  let best = null, bd = Infinity;
  for (const s of benches()) { const k = Math.hypot(s.x - x, s.y - y); if (k <= reach && k < bd) { best = s; bd = k; } }
  return best;
}

// ---- inside: floors, rooms, the lift -------------------------------------------------------
export const floorsWithRooms = (b) => b.floors.filter(f => f.places.length);
// Where you come in: the ground floor (level 0), else the nearest level to it that has rooms.
export function entryFloor(b) {
  const fs = floorsWithRooms(b);
  if (!fs.length) return null;
  return fs.slice().sort((a, c) => Math.abs(a.level) - Math.abs(c.level) || c.level - a.level)[0].index;
}
// The next floor with rooms above (dir 1) or below (dir -1) floor index fi, or null.
export function nextFloor(b, fi, dir) {
  const cur = b.floors[fi];
  const fs = floorsWithRooms(b).filter(f => (dir > 0 ? f.level > cur.level : f.level < cur.level));
  if (!fs.length) return null;
  fs.sort((a, c) => (dir > 0 ? a.level - c.level : c.level - a.level));
  return fs[0].index;
}
// The room at fx on floor fi -> {placeId, k, n, lx (0..1 across the room)}.
export function roomAt(b, fi, fx) {
  const f = b.floors[fi], n = f.places.length;
  const k = clamp(Math.floor(fx * n), 0, n - 1);
  return { placeId: f.places[k], k, n, lx: fx * n - k };
}
// fx of the middle of a room (a spawn inside, from the schedule).
export function fxOfRoom(b, fi, placeId) {
  const f = b.floors[fi], n = f.places.length, k = Math.max(0, f.places.indexOf(placeId));
  return (k + 0.5) / n;
}
export const isExitFloor = (b, fi) => fi === entryFloor(b);

// The nearest free seat in a room (props.roomPlan anchors, px from the room's left edge),
// within maxPx of px. taken: anchor indices someone sits at. -> anchor index | null.
export const SEAT_KINDS = new Set(["seat"]);
export function nearestSeat(anchors, taken, px, maxPx) {
  let best = null, bd = Infinity;
  for (const a of anchors) {
    if (!SEAT_KINDS.has(a.kind) || taken.has(a.i)) continue;
    const d = Math.abs(a.x - px);
    if (d <= maxPx && d < bd) { best = a.i; bd = d; }
  }
  return best;
}

// ---- the Loop -------------------------------------------------------------------------------
const SG = new Map();
// Every line's stops (PHASE 2): the Loop's stations and each line's platforms, one per track.
export const stationGeoOf = (id) => { let g = SG.get(id); if (!g && STOPS[id]) { g = stopGeo(STOPS[id]); SG.set(id, g); } return g; };
const STOP_IDS = linesOn().flatMap(l => l.stops.map(st => st.id));
// The foot of a station's stairs, where the street meets the flight.
export function stairFoot(id) {
  const g = stationGeoOf(id);
  const [x, y] = g.at((g.sd || 1) * (0.2 + STAIR_L + 0.3), PLAT_OUT + STAIR_W / 2);
  return { x, y };
}
// A station whose stairs (or gate) are within reach -> station id | null.
export function stationNear(x, y, reach = STATION_REACH) {
  let best = null, bd = Infinity;
  for (const id of STOP_IDS) {
    const f = stairFoot(id), g = STOPS[id].gate;
    const k = Math.min(Math.hypot(f.x - x, f.y - y), Math.hypot(g.x - x, g.y - y));
    if (k <= reach && k < bd) { best = id; bd = k; }
  }
  return best;
}
// On the platform: (al along the track, la out from the centreline) <-> map.
export const PLAT_LA = [PLAT_IN + 0.2, PLAT_OUT - 0.12];
export function platformPoint(id, al, la) { const [x, y] = stationGeoOf(id).at(al, la); return { x, y }; }
export function platformStep(id, al, la, dx, dy) {
  const g = stationGeoOf(id);
  const nal = clamp(al + dx * g.d[0] + dy * g.d[1], -g.hl + 0.4, g.hl - 0.4);
  const nla = clamp(la + dx * g.n[0] + dy * g.n[1], PLAT_LA[0], PLAT_LA[1]);
  return { al: nal, la: nla };
}
// The train standing at a station (trainsAt rows), or null.
export const trainIn = (trains, stationId) => trains.find(t => t.dwell && t.stationId === stationId) || null;
// The car nearest a map point: its index.
export function nearestCar(train, x, y) {
  let best = 0, bd = Infinity;
  train.cars.forEach((c, i) => { const p = c.pose || c; const k = Math.hypot(p.x - x, p.y - y); if (k < bd) { bd = k; best = i; } });
  return best;
}

// ---- input ------------------------------------------------------------------------------------
// The keyboard: a set of held keys (lower case e.key) -> screen vector and run.
export function keysVector(keys) {
  const x = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
  const y = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
  const n = Math.hypot(x, y) || 1;
  return { x: x / n, y: y / n, run: keys.has("shift") };
}
// A thumbstick (touch or pad): the offset from its centre, radius, dead zone (fraction) ->
// {x, y, mag}: clamped to the unit circle, rescaled so the dead zone's edge is zero.
export function stickVector(dx, dy, radius, dead = 0.15) {
  const r = Math.hypot(dx, dy) / Math.max(1, radius);
  if (r <= dead) return { x: 0, y: 0, mag: 0 };
  const mag = Math.min(1, (r - dead) / (1 - dead));
  const k = mag / (r || 1) / Math.max(1, radius);
  return { x: dx * k, y: dy * k, mag };
}
export const RUN_AT = 0.92;   // a stick pushed this far is running

// ---- the state, and keeping it for the session ---------------------------------------------
// st = { key (the self's slug), mode: street | inside | seated-street | platform | riding,
//   x, y, face (1 right / -1 left on screen), moving, bId, floor, fx, seat, bench,
//   stationId, al, la, waiting, trainId, car, boardedAt, alightNext, view ("iso" | "third"), t (saved at) }
export const STORE_KEY = "hvi-control";
export const STORE_TTL = 6 * 3600 * 1000;
const FIELDS = ["key", "view", "mode", "x", "y", "face", "bId", "floor", "fx", "seat", "bench", "stationId", "al", "la", "waiting", "trainId", "car", "boardedAt", "alightNext"];
export function saveControl(st, storage = safeStorage()) {
  try {
    if (!storage) return false;
    if (!st) { storage.removeItem(STORE_KEY); return true; }
    const o = { t: Date.now() };
    for (const k of FIELDS) if (st[k] !== undefined) o[k] = st[k];
    storage.setItem(STORE_KEY, JSON.stringify(o));
    return true;
  } catch { return false; }
}
export function loadControl(key, storage = safeStorage(), now = Date.now()) {
  try {
    const o = JSON.parse(storage?.getItem(STORE_KEY) || "null");
    if (!o || o.key !== key || !(now - (o.t || 0) < STORE_TTL)) return null;
    if (o.mode === "inside" && !BUILDING[o.bId]?.floors[o.floor]) return null;
    if ((o.mode === "platform" || o.mode === "riding") && !STOPS[o.stationId] && !o.trainId) return null;
    return o;
  } catch { return null; }
}
function safeStorage() { try { return globalThis.localStorage || null; } catch { return null; } }

// Where the scheduled self is -> a starting state (findTarget's modes: find.js).
export function stateFromTarget(key, t) {
  if (t.mode === "riding") return { key, mode: "riding", trainId: t.trainId, car: t.car, x: t.x, y: t.y, face: -1, boardedAt: null, alightNext: false };
  if (t.mode === "platform") return { key, mode: "platform", stationId: t.stationId, al: 0, la: (PLAT_LA[0] + PLAT_LA[1]) / 2, face: -1 };
  if (t.mode === "inside" && BUILDING[t.buildingId]?.floors[t.floor]?.places.length) {
    const b = BUILDING[t.buildingId];
    return { key, mode: "inside", bId: b.id, floor: t.floor, fx: fxOfRoom(b, t.floor, t.placeId), face: -1 };
  }
  // the street, or HQ (classified: you are let out at its door)
  const d = t.mode === "classified" ? doorOf(BUILDING.hq) : null;
  const [x, y] = freeSpot(d ? d.x : t.x, d ? d.y : t.y);
  return { key, mode: "street", x, y, face: -1 };
}

// Leaving a building: out of its front door (or the middle of an open lot's south edge).
export function exitPoint(b) {
  const d = doorOf(b);
  if (d) return freeSpot(d.x + d.nx * 0.3, d.y + d.ny * 0.3);
  return freeSpot(b.pos.x, b.rect.y + b.rect.h - KERB - 0.2);
}

// One tick of the controlled self, for everything that needs no drawing. v: {x, y} screen
// vector (up is -y), run, r: the quarter turn, dt seconds. Mutates and returns st, plus
// {bump} on the street (the solid leaned on, for the door-lean entry).
// yaw (THIRD PERSON, below): the stick is read against the chase camera, not the iso turn.
export function stepStreet(st, v, run, r, dt, yaw = null) {
  const mag = Math.min(1, Math.hypot(v.x, v.y));
  st.moving = mag > 0.01;
  if (!st.moving) return null;
  const [dx, dy] = yaw == null ? screenToMapDir(v.x, v.y, r) : camToMapDir(v.x, v.y, yaw);
  const sp = (run ? RUN_SPEED : WALK_SPEED) * mag * dt;
  const m = moveOnStreet(st.x, st.y, dx * sp, dy * sp);
  st.x = m.x; st.y = m.y;
  if (Math.abs(v.x) > 0.05) st.face = v.x > 0 ? 1 : -1;
  return m.bump;
}
// Inside: left and right walk the floor; up and down walk to the lift and ride it.
// -> "exit" when walked out of the ground floor's east door, else null.
export function stepInside(st, v, run, dt, b) {
  st.liftT = Math.max(0, (st.liftT || 0) - dt);
  const sp = FLOOR_SPEED * (run ? 1.8 : 1) * dt;
  st.moving = false;
  if (Math.abs(v.y) > 0.5) {
    if (st.fx > LIFT_X) { st.fx = Math.max(LIFT_X * 0.5, st.fx - sp * 1.4); st.face = -1; st.moving = true; }
    else if (!st.liftT) {
      const nf = nextFloor(b, st.floor, v.y < 0 ? 1 : -1);
      if (nf != null) { st.floor = nf; st.liftT = LIFT_COOLDOWN; }
    }
    return null;
  }
  if (Math.abs(v.x) > 0.05) {
    st.fx = clamp(st.fx + v.x * sp, 0.01, 0.995);
    st.face = v.x > 0 ? 1 : -1; st.moving = true;
    if (st.fx >= EXIT_X && v.x > 0 && isExitFloor(b, st.floor)) return "exit";
  }
  return null;
}

// ---- the live control, shared by the view, the widgets and the page -------------------------
// One per page. input: what the widgets feed (held keys, the touch stick, taps on the touch
// buttons); ui: what the widgets show (mode, the E prompt, the input in use). Listeners are
// told when ui changes (a few times a second at most, never per frame).
export const CTL = {
  st: null,                       // the state above while in control, else null
  self: null,                     // the self being driven
  request: false,                 // when "take control" was asked for before the view was ready (ms), or false
  input: { keys: new Set(), stick: { x: 0, y: 0, mag: 0 }, taps: { act: 0, back: 0, release: 0, view: 0 }, source: "keys", pad: null },
  ui: null,                       // {mode, prompt, where, source, family, note}
  subs: new Set(),
};
export const controlOn = () => Boolean(CTL.st);
export function publishUi(ui) {
  const a = CTL.ui, same = a && ui && a.mode === ui.mode && a.view === ui.view && a.prompt === ui.prompt && a.where === ui.where && a.source === ui.source && a.family === ui.family && a.note === ui.note && a.back === ui.back;
  if (same || (!a && !ui)) return;
  CTL.ui = ui;
  for (const f of CTL.subs) { try { f(ui); } catch { /* a widget gone */ } }
}
// Start (or ENTER THE SUBSTRATE) with no file of yours in this browser: ControlLayer.NoFileNote
// says why, with LOG IN / GET EVALUATED, instead of nothing happening. (caseFile.jsx's key.)
export function noFile() {
  let caseId = null;
  try { caseId = localStorage.getItem("hvi-case-id") || null; } catch { /* private mode */ }
  try { window.dispatchEvent(new CustomEvent("hvi-drive-nofile", { detail: { caseId } })); } catch { /* no window */ }
}
export function subscribeControl(f) { CTL.subs.add(f); return () => CTL.subs.delete(f); }
// The building the controlled self stands in (for the quest panels), or null.
export const controlBuildingId = () => (CTL.st && CTL.st.mode === "inside" ? CTL.st.bId : null);
