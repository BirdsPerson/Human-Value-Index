// The octant cube as 3D geometry. Pure math, no DOM: the canvas component and
// scripts/check-cube.mjs both use it.
//
// World space is a cube from -1 to 1 on every axis, 0..100 mapped to -1..1:
//   x: WARMTH, the machine's read on conduct
//   y: COMPETENCE, the machine's (up is positive)
//   z: LIKABILITY, the people's regard (positive runs away from the viewer at yaw 0)
// The three midplanes x=0, y=0, z=0 (the 50 lines) intersect at the centre, and the
// three axes pass through it. Each subject is one point; its octant is the cell it sits in.
import { cubeOf } from "./cubeData.js";
import { OCTANT_ORDER, OCTANT_FAMILY } from "./cube.js";

export const CAMERA = 6;          // distance from the centre; lower = stronger perspective. 6 keeps the near corner from ballooning
export const PITCH_LIMIT = 1.1;   // radians, so the cube never flips over the top
export const REST = { yaw: -0.62, pitch: 0.34 };   // the 3/4 angle for reduced motion and first paint
export const AXIS_OVERSHOOT = 1.18;                 // the axes run a little past the cube so their labels clear it

const toUnit = v => (Math.max(0, Math.min(100, v)) / 100) * 2 - 1;
export const worldPoint = (w, c, l) => [toUnit(w), toUnit(c), toUnit(l)];

export const CORNERS = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
];
export const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

// The three axes through the centre, as [negative end, positive end]. Ends are labelled
// HIGH/LOW, not with arrows: an arrow glyph lies about direction once the cube turns.
export const AXES = [
  { id: "x", label: "CONDUCT", a: [-AXIS_OVERSHOOT, 0, 0], b: [AXIS_OVERSHOOT, 0, 0] },
  { id: "y", label: "COMPETENCE", a: [0, -AXIS_OVERSHOOT, 0], b: [0, AXIS_OVERSHOOT, 0] },
  { id: "z", label: "LIKABILITY", a: [0, 0, -AXIS_OVERSHOOT], b: [0, 0, AXIS_OVERSHOOT] },
];

// A midplane as its outline (4 corners) plus a quarter grid (the 25 and 75 lines).
// axis: which coordinate is held at 0.
export function midplane(axis) {
  const at = (u, v) => (axis === "x" ? [0, u, v] : axis === "y" ? [u, 0, v] : [u, v, 0]);
  const outline = [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)];
  const grid = [];
  for (const t of [-0.5, 0.5]) {
    grid.push([at(t, -1), at(t, 1)]);
    grid.push([at(-1, t), at(1, t)]);
  }
  return { axis, outline, grid };
}
export const MIDPLANES = ["x", "y", "z"].map(midplane);

// Octant label anchors: the centre of each cell.
export const OCTANT_ANCHORS = {
  ADMIRED: [0.55, 0.55, 0.55], UNSUNG: [0.55, 0.55, -0.55], BELOVED: [0.55, -0.55, 0.55], OVERLOOKED: [0.55, -0.55, -0.55],
  CHARMING: [-0.55, 0.55, 0.55], FEARED: [-0.55, 0.55, -0.55], INDULGED: [-0.55, -0.55, 0.55], DISMISSED: [-0.55, -0.55, -0.55],
};

export function rotate([x, y, z], yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;          // yaw about y
  const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;         // pitch about x
  return [x1, y2, z2];
}

// Rotated point -> screen. scale is the half-size of the drawing in px; cx, cy its centre.
// Positive rotated z points away from the viewer, so depth grows with it.
export function project(p, { yaw, pitch, scale, cx, cy }) {
  const [x, y, z] = rotate(p, yaw, pitch);
  const f = CAMERA / (CAMERA + z);
  return { x: cx + x * scale * f, y: cy - y * scale * f, depth: z, f };
}

export const clampPitch = p => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p));

// The foot of the perpendicular from a point to the plane x = z (where likability equals
// conduct). The drop line from the point to its foot is the judges' gap made visible.
export function footOnAgreement([x, y, z]) {
  const m = (x + z) / 2;
  return [m, y, m];
}

// A subject becomes one point. Unrated likability: placed on the z=0 midplane (50) and
// drawn hollow, with only its 2D quadrant for an octant.
export function pointOf(subject) {
  const q = cubeOf(subject);
  if (!q || q.quadrant === "UNPLACED") return null;
  const rated = !!q.people;
  const l = rated ? q.people.likability : 50;
  const p = worldPoint(q.warmth, q.competence, l);
  const octant = q.octant || null;
  return {
    name: subject.name || "SUBJECT",
    q,
    p,
    rated,
    octant,
    family: octant ? OCTANT_FAMILY[octant] : "unrated",
    foot: rated ? footOnAgreement(p) : null,
    gap: rated ? q.people.gap : null,
    judge: q.judge,
  };
}

export const FILTERS = ["ALL", ...OCTANT_ORDER, "UNRATED"];
export function passes(pt, filter) {
  if (!pt) return false;
  if (!filter || filter === "ALL") return true;
  if (filter === "UNRATED") return !pt.rated;
  return pt.octant === filter;
}
