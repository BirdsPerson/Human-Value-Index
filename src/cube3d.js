import { displayName } from "./figures.js";
// The cubrant cube as 3D geometry. Pure math, no DOM: the canvas component and
// scripts/check-cube.mjs both use it.
//
// World space is a cube from -1 to 1 on every axis, 0..100 mapped to -1..1:
//   x: CONDUCT, the machine's read on intent
//   y: COMPETENCE, the machine's read on ability (up is positive)
//   z: SCARCITY, how hard the unit is to replace (positive runs away from the viewer at yaw 0)
// The three midplanes sit at the roster CENTRES (method v4; 62/70/57 today, not 50) and cross at
// the centre point; the three axes pass through it. Each subject is one point; its cubrant is the
// cell it sits in.
import { cubeOf } from "./cubeData.js";
import { CENTRE, CUBRANT_ORDER, CUBRANT_SIGNS, CUBRANT_FAMILY } from "./cube.js";

export const CAMERA = 6;          // distance from the centre; lower = stronger perspective. 6 keeps the near corner from ballooning
export const PITCH_LIMIT = 1.1;   // radians, so the cube never flips over the top
export const REST = { yaw: -0.62, pitch: 0.34 };   // the 3/4 angle for reduced motion and first paint
export const AXIS_OVERSHOOT = 1.18;                 // the axes run a little past the cube so their labels clear it

const toUnit = v => (Math.max(0, Math.min(100, v)) / 100) * 2 - 1;
export const worldPoint = (w, c, l) => [toUnit(w), toUnit(c), toUnit(l)];
// The centre point in world space: where the midplanes cross.
export const centreWorld = (centre = CENTRE) => worldPoint(centre.conduct, centre.competence, centre.scarcity);

export const CORNERS = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
];
export const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

// The three axes through the centre point, as [negative end, positive end]. Ends are labelled
// HIGH/LOW, not with arrows: an arrow glyph lies about direction once the cube turns.
export function axes(centre = CENTRE) {
  const [cx, cy, cz] = centreWorld(centre);
  return [
    { id: "x", label: "CONDUCT", a: [-AXIS_OVERSHOOT, cy, cz], b: [AXIS_OVERSHOOT, cy, cz] },
    { id: "y", label: "COMPETENCE", a: [cx, -AXIS_OVERSHOOT, cz], b: [cx, AXIS_OVERSHOOT, cz] },
    { id: "z", label: "SCARCITY", a: [cx, cy, -AXIS_OVERSHOOT], b: [cx, cy, AXIS_OVERSHOOT] },
  ];
}
export const AXES = axes();

// A midplane as its outline (4 corners) plus a grid at the 25 and 75 lines of the other two
// axes. axis: which coordinate is held at the centre.
export function midplane(axis, centre = CENTRE) {
  const [cx, cy, cz] = centreWorld(centre);
  const at = (u, v) => (axis === "x" ? [cx, u, v] : axis === "y" ? [u, cy, v] : [u, v, cz]);
  const outline = [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)];
  const grid = [];
  for (const t of [-0.5, 0.5]) {
    grid.push([at(t, -1), at(t, 1)]);
    grid.push([at(-1, t), at(1, t)]);
  }
  return { axis, outline, grid };
}
export const MIDPLANES = ["x", "y", "z"].map(a => midplane(a));

// The eight cells as boxes: [min, max] corners in world space, from the centre point to the
// cube's faces. Drawn faintly in their family colour behind the points.
export function cells(centre = CENTRE) {
  const c = centreWorld(centre);
  return CUBRANT_ORDER.map(name => {
    const s = CUBRANT_SIGNS[name];
    const lo = [0, 1, 2].map(k => (s[k] === "+" ? c[k] : -1)), hi = [0, 1, 2].map(k => (s[k] === "+" ? 1 : c[k]));
    const mid = [0, 1, 2].map(k => (lo[k] + hi[k]) / 2);
    return { name, family: CUBRANT_FAMILY[name], lo, hi, mid, corners: boxCorners(lo, hi) };
  });
}
function boxCorners(lo, hi) {
  return CORNERS.map(([x, y, z]) => [x < 0 ? lo[0] : hi[0], y < 0 ? lo[1] : hi[1], z < 0 ? lo[2] : hi[2]]);
}
export const CELLS = cells();
// Cubrant label anchors: the centre of each cell.
export const CUBRANT_ANCHORS = Object.fromEntries(CELLS.map(c => [c.name, c.mid]));

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

// A subject becomes one point. A file without its third axis yet (CUBRANT PENDING) sits on the
// scarcity midplane and draws hollow, with no cell.
export function pointOf(subject) {
  const q = cubeOf(subject);
  if (!q || q.quadrant === "UNPLACED") return null;
  const placed = typeof q.scarcity === "number";
  const p = worldPoint(q.warmth, q.competence, placed ? q.scarcity : CENTRE.scarcity);
  return {
    name: displayName(subject) || "SUBJECT",
    // enough of the subject to draw its file photo in the tooltip
    photo: { name: subject.name, slug: subject.slug, score: subject.score, sprite: subject.sprite, avatar: subject.avatar, kind: subject.kind, you: subject.you },
    q,
    p,
    placed,
    cubrant: placed ? q.cubrant : null,
    family: placed ? q.family : "pending",
    rated: !!q.people,
    gap: q.people ? q.people.gap : null,
    judge: q.judge,
  };
}

export const FILTERS = ["ALL", ...CUBRANT_ORDER, "PENDING"];
export function passes(pt, filter) {
  if (!pt) return false;
  if (!filter || filter === "ALL") return true;
  if (filter === "PENDING") return !pt.placed;
  return pt.cubrant === filter;
}
