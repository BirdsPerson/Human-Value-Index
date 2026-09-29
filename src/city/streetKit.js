// STREET view math: a camera standing in the Substrate, looking along the streets.
// Pure (no DOM): the renderer in Street.jsx and scripts/check-street.mjs both use it.
//
// World units are sim cells (x east, y south on the map), z up. Buildings stand as boxes
// whose walls are flat 2D planes; people and signs are billboards that face the camera.

import * as SIM from "./sim.js";
import { BUILDINGS as B3D, levelOf } from "./city3d.js";

export const FLOOR_H = 2.4;        // one storey, in cells
export const LOOP_H = 5.4;         // the Loop's deck: above the two-storey line
export const PERSON_H = 1.9;       // a subject, head to feet
export const EYE_H = 2.4;          // camera height on foot (a low drone at shoulder height)
export const RIDE_H = LOOP_H + 1.3;
export const NEAR = 0.25;          // near plane, cells
export const FAR = 78;             // beyond this nothing is drawn; fog ends here
export const FOV = 1.25;           // horizontal field of view, radians (~72 degrees)
export const WALK_SPEED = 5;       // cells per second on foot
export const TOUR_SPEED = 2.2;     // cells per second on the auto-tour
export const TURN_SPEED = 1.9;     // radians per second
export const RIDE_SPEED = 22;      // cells per second aboard the Loop

// Places whose occupants stand in the open, visible from the street.
export const OUTDOOR = new Set(["park", "the-street", "the-plaza", "allotment", "market", "docks", "ball-field", "courts", "rec-park"]);

// ---- the world ------------------------------------------------------------------
export const BOUNDS = (() => {
  const ds = SIM.DISTRICTS;
  const x0 = Math.min(...ds.map(d => d.rect.x)), y0 = Math.min(...ds.map(d => d.rect.y));
  const x1 = Math.max(...ds.map(d => d.rect.x + d.rect.w)), y1 = Math.max(...ds.map(d => d.rect.y + d.rect.h));
  return { x0: x0 - 4, y0: y0 - 4, x1: x1 + 4, y1: y1 + 4 };
})();

// Buildings as standing boxes: rect (cells) and a height from their storeys above street.
export const STREET_BUILDINGS = B3D.map(b => {
  const above = Math.max(1, (b.topLevel ?? 0) + 1);
  const places = b.floors.flatMap(f => f.places || []);
  const outdoor = places.length > 0 && places.every(p => OUTDOOR.has(p));
  return { id: b.id, districtId: b.districtId, name: b.name, rect: b.rect, storeys: above, height: outdoor ? 0.55 : above * FLOOR_H, outdoor, floors: b.floors };
});
export const STREET_BUILDING = Object.fromEntries(STREET_BUILDINGS.map(b => [b.id, b]));
const B3D_BY_ID = Object.fromEntries(B3D.map(b => [b.id, b]));

// The four walls of an axis-aligned box, each with its outward normal. Walls are listed
// so that "a" -> "b" runs clockwise seen from above (the outside is on the left).
export function wallsOf(r) {
  const x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
  return [
    { a: [x0, y0], b: [x1, y0], n: [0, -1], len: r.w },   // north face
    { a: [x1, y0], b: [x1, y1], n: [1, 0], len: r.h },    // east
    { a: [x1, y1], b: [x0, y1], n: [0, 1], len: r.w },    // south
    { a: [x0, y1], b: [x0, y0], n: [-1, 0], len: r.h },   // west
  ];
}

// A wall faces the camera when the camera is on its outward side.
export const wallFaces = (w, cx, cy) => (cx - (w.a[0] + w.b[0]) / 2) * w.n[0] + (cy - (w.a[1] + w.b[1]) / 2) * w.n[1] > 0;

// ---- the camera -----------------------------------------------------------------
// yaw 0 looks north (up the map, -y); positive yaw turns clockwise (toward east).
export const forwardOf = (yaw) => [Math.sin(yaw), -Math.cos(yaw)];
export const rightOf = (yaw) => [Math.cos(yaw), Math.sin(yaw)];

// World point -> camera space {s (right), f (forward), z (up, relative to the eye)}.
export function toCam(cam, x, y, z = 0) {
  const dx = x - cam.x, dy = y - cam.y;
  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
  return { s: dx * cy + dy * sy, f: dx * sy - dy * cy, z: z - cam.h };
}

// Camera space -> screen. view: {w, h, focal, horizon}. Behind the near plane: null.
export function project(p, view) {
  if (p.f < NEAR) return null;
  return { x: view.w / 2 + (p.s / p.f) * view.focal, y: view.horizon - (p.z / p.f) * view.focal, f: p.f };
}
export function viewFor(w, h, pitchPx = 0) {
  const focal = (w / 2) / Math.tan(FOV / 2);
  return { w, h, focal, horizon: Math.round(h * 0.42) + pitchPx };
}

// Clip a camera-space polygon against the near plane (Sutherland-Hodgman, one plane).
export function clipNear(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ain = a.f >= NEAR, bin = b.f >= NEAR;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (NEAR - a.f) / (b.f - a.f);
      out.push({ s: a.s + (b.s - a.s) * t, f: NEAR, z: a.z + (b.z - a.z) * t });
    }
  }
  return out;
}
// A segment clipped the same way: [a, b] or null.
export function clipSeg(a, b) {
  const ain = a.f >= NEAR, bin = b.f >= NEAR;
  if (!ain && !bin) return null;
  if (ain && bin) return [a, b];
  const t = (NEAR - a.f) / (b.f - a.f);
  const m = { s: a.s + (b.s - a.s) * t, f: NEAR, z: a.z + (b.z - a.z) * t };
  return ain ? [a, m] : [m, b];
}

// Fog: full strength near, fading to nothing at FAR.
export const fogAt = (f) => Math.max(0, Math.min(1, 1 - (f - 14) / (FAR - 14)));

// Is a camera-space point inside the horizontal field of view (with a margin)?
export const inFov = (p, margin = 0.15) => p.f > NEAR && Math.abs(p.s / p.f) < Math.tan(FOV / 2) + margin;

// ---- the Loop -------------------------------------------------------------------
export const RING = SIM.LOOP_LINE;
export const RING_L = RING.length;
export const ringAt = (s) => RING.at(((s % RING_L) + RING_L) % RING_L);
export function ringTangent(s) {
  const a = ringAt(s - 0.5), b = ringAt(s + 0.5);
  return Math.atan2(b.x - a.x, -(b.y - a.y));   // yaw pointing along the ring, clockwise
}
// Nearest arc position on the ring to a point.
export function nearestArc(x, y) {
  let best = 0, bd = Infinity;
  for (let s = 0; s < RING_L; s += 0.5) { const p = ringAt(s); const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = s; } }
  return best;
}
// The shorter way round from s0 to s1 (signed arc length).
export function arcDelta(s0, s1) {
  let d = ((s1 - s0) % RING_L + RING_L) % RING_L;
  if (d > RING_L / 2) d -= RING_L;
  return d;
}

// The auto-tour walks the streets under the Loop, looking slightly inward so buildings
// on the inner side stay in frame. t is seconds; the tour is the same for every viewer.
export function tourPose(t) {
  const s = t * TOUR_SPEED;
  const p = ringAt(s);
  const yaw = ringTangent(s) + 0.28 * Math.sin(t / 9);
  return { x: p.x, y: p.y, yaw, s };
}

// ---- where people stand ---------------------------------------------------------
// Visible from the street: anyone in transit (walking, on a platform, aboard a train)
// and anyone at an outdoor place. Everyone else is behind a lit window.
export function onStreet(w) {
  if (!w) return false;
  if (w.activity === "commute") return true;
  return OUTDOOR.has(w.placeId);
}
export function heightOf(w) {
  if (!w || w.activity !== "commute") return 0;
  if (w.sub === "riding") return LOOP_H + 0.15;
  if (w.sub === "waiting" || w.sub === "alighting") return LOOP_H;
  if (typeof w.climb === "number") return w.climb * LOOP_H;
  return 0;
}

// ---- collisions -----------------------------------------------------------------
// The building (not an open lot) whose footprint contains the point, grown by pad.
export function buildingAt(x, y, pad = 0.25) {
  for (const b of STREET_BUILDINGS) {
    if (b.outdoor) continue;
    const r = b.rect;
    if (x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad) return b;
  }
  return null;
}
export const clampToWorld = (x, y) => [Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, x)), Math.max(BOUNDS.y0, Math.min(BOUNDS.y1, y))];
export function districtAt(x, y) {
  for (const d of SIM.DISTRICTS) { const r = d.rect; if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return d; }
  return null;
}
// Compass heading for the HUD.
export function compass(yaw) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const a = ((yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return dirs[Math.round(a / (Math.PI / 4)) % 8];
}

// Per-building, per-storey head counts from the census (lit windows).
export function occupancyByFloor(list, locate) {
  const out = {};
  for (const { s, w } of list) {
    if (!w || w.activity === "commute") continue;
    const loc = locate(s, w);
    if (!loc) continue;
    const b = STREET_BUILDING[loc.buildingId];
    if (!b) continue;
    const lvl = Math.max(0, levelOf(B3D_BY_ID[b.id], loc.floor));
    const m = out[b.id] || (out[b.id] = {});
    m[lvl] = (m[lvl] || 0) + 1;
  }
  return out;
}
