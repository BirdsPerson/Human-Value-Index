// The two-judge cube as 3D geometry. Pure math, no DOM: the canvas component and
// scripts/check-cube.mjs both use it.
//
// World space is a cube from -1 to 1 on every axis:
//   x: warmth (machine face) or likability (people face), 0..100 -> -1..1
//   y: competence 0..100 -> -1..1 (up is positive)
//   z: the judge. MACHINE is the front face (z = -1, nearest the viewer at yaw 0),
//      PEOPLE the back face (z = +1).
import { cubeOf } from "./cubeData.js";

export const MACHINE_Z = -1;
export const PEOPLE_Z = 1;
export const CAMERA = 4.2;        // distance from the cube's centre; lower = stronger perspective
export const PITCH_LIMIT = 1.1;   // radians, so the cube never flips over the top
export const REST = { yaw: -0.62, pitch: 0.34 };   // the 3/4 angle for reduced motion and first paint

const toUnit = v => (Math.max(0, Math.min(100, v)) / 100) * 2 - 1;
export const worldPoint = (x100, y100, z) => [toUnit(x100), toUnit(y100), z];

export const CORNERS = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
];
export const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 0],      // machine face
  [4, 5], [5, 6], [6, 7], [7, 4],      // people face
  [0, 4], [1, 5], [2, 6], [3, 7],      // the judge axis
];

// The quadrant cross (the 50 lines) on each face.
export function crossLines(z) {
  return [[[0, -1, z], [0, 1, z]], [[-1, 0, z], [1, 0, z]]];
}

export function rotate([x, y, z], yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;          // yaw about y
  const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;         // pitch about x
  return [x1, y2, z2];
}

// Rotated point -> screen. scale is the half-size of the drawing in px; cx, cy its centre.
// Positive z points away from the viewer, so depth grows with z.
export function project(p, { yaw, pitch, scale, cx, cy }) {
  const [x, y, z] = rotate(p, yaw, pitch);
  const f = CAMERA / (CAMERA + z);
  return { x: cx + x * scale * f, y: cy - y * scale * f, depth: z, f };
}

export const clampPitch = p => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p));

// A subject becomes a segment from its machine point to its people point.
// No people data: the machine dot plus a short stub toward the people face.
export const STUB = 0.35;
export function segmentOf(subject) {
  const q = cubeOf(subject);
  if (!q || q.quadrant === "UNPLACED") return null;
  const m = worldPoint(q.warmth, q.competence, MACHINE_Z);
  const p = q.people ? worldPoint(q.people.likability, q.competence, PEOPLE_Z) : null;
  return {
    name: subject.name || "SUBJECT",
    q,
    m,
    p,
    stub: p ? null : [m[0], m[1], MACHINE_Z + STUB],
    judge: q.judge,
  };
}

export const FILTERS = ["ALL", "CONTESTED", "RATIFIED", "ENVIED", "ADMIRED", "DISMISSED"];
export function passes(seg, filter) {
  if (!seg) return false;
  if (!filter || filter === "ALL") return true;
  if (filter === "CONTESTED" || filter === "RATIFIED") return seg.judge === filter;
  return seg.q.quadrant === filter;
}

// Distance from point to a 2D segment, for hover hit-testing.
export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  const x = ax + t * dx, y = ay + t * dy;
  return Math.hypot(px - x, py - y);
}
