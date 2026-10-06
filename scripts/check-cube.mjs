// Pure-math checks for the cubrant cube (src/cube3d.js, cubrantOf in src/cube.js). No DOM.
import assert from "node:assert/strict";
import { CORNERS, EDGES, AXES, MIDPLANES, CELLS, CUBRANT_ANCHORS, worldPoint, centreWorld, rotate, project, clampPitch, PITCH_LIMIT, pointOf, passes, FILTERS, CAMERA } from "../src/cube3d.js";
import { cube, cubrantOf, CUBRANTS, CUBRANT_ORDER, CUBRANT_LINES, CUBRANT_FAMILY, CENTRE, familyOfCubrant, CUT, judged, placeWords } from "../src/cube.js";
import { FAMOUS_FIGURES } from "../src/figures.js";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// geometry: 8 corners, 12 edges of length 2
assert.equal(CORNERS.length, 8);
assert.equal(EDGES.length, 12);
for (const [i, j] of EDGES) close(len(CORNERS[i], CORNERS[j]), 2);

// value mapping: 0 -> -1, 50 -> 0, 100 -> 1, clamped
assert.deepEqual(worldPoint(0, 100, 50), [-1, 1, 0]);
assert.deepEqual(worldPoint(50, 50, 50), [0, 0, 0]);
assert.deepEqual(worldPoint(-20, 140, 100), [-1, 1, 1]);
// the centre point is the calibration's centres, not 50
assert.deepEqual(centreWorld(), worldPoint(CENTRE.conduct, CENTRE.competence, CENTRE.scarcity));
assert.ok(CENTRE.conduct > 50 && CENTRE.competence > 50 && CENTRE.scarcity > 50, "the roster's medians sit above 50 on every axis");

// rotation keeps every edge length, at any angle
for (const [yaw, pitch] of [[0, 0], [0.7, -0.4], [-2.1, 1.0], [3.3, 0.2]]) {
  for (const [i, j] of EDGES) close(len(rotate(CORNERS[i], yaw, pitch), rotate(CORNERS[j], yaw, pitch)), 2, 1e-9);
}

// the world origin (50,50,50) projects to the screen centre from any angle
const view = { yaw: 0, pitch: 0, scale: 100, cx: 200, cy: 150 };
for (const [yaw, pitch] of [[0, 0], [1.2, -0.5], [-0.62, 0.34], [2.9, 1.0]]) {
  const c = project(worldPoint(50, 50, 50), { ...view, yaw, pitch });
  close(c.x, 200); close(c.y, 150);
}
// head-on, a point on the near face lands at centre + x*scale*f, y flipped
const pt = project(worldPoint(100, 100, 0), view);
const f = CAMERA / (CAMERA - 1);
close(pt.x, 200 + 100 * f); close(pt.y, 150 - 100 * f); close(pt.depth, -1);

// the three axes pass through the centre point (each runs the cube's full width along its own
// axis and holds the other two coordinates at the centre) and are mutually perpendicular under rotation
assert.equal(AXES.length, 3);
assert.deepEqual(AXES.map(a => a.label), ["CONDUCT", "COMPETENCE", "SCARCITY"]);
const C0 = centreWorld();
AXES.forEach((ax, k) => { for (let i = 0; i < 3; i++) if (i !== k) { close(ax.a[i], C0[i]); close(ax.b[i], C0[i]); } close(ax.a[k], -ax.b[k]); });
for (const [yaw, pitch] of [[0, 0], [0.9, 0.4], [-1.7, -0.8]]) {
  const dirs = AXES.map(ax => {
    const a = rotate(ax.a, yaw, pitch), b = rotate(ax.b, yaw, pitch);
    return [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  });
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  close(dot(dirs[0], dirs[1]), 0, 1e-9); close(dot(dirs[1], dirs[2]), 0, 1e-9); close(dot(dirs[0], dirs[2]), 0, 1e-9);
}
// the three midplanes each hold one coordinate at the centre and all contain the centre point
assert.equal(MIDPLANES.length, 3);
for (const m of MIDPLANES) {
  const k = { x: 0, y: 1, z: 2 }[m.axis];
  for (const c of m.outline) close(c[k], C0[k]);
  const mid = m.outline.reduce((s, c) => [s[0] + c[0] / 4, s[1] + c[1] / 4, s[2] + c[2] / 4], [0, 0, 0]);
  for (let i = 0; i < 3; i++) if (i !== k) close(mid[i], 0);
}
// the eight cells tile the cube: disjoint boxes whose volumes sum to 8, each touching three outer faces
assert.equal(CELLS.length, 8);
const vol = CELLS.reduce((s, c) => s + (c.hi[0] - c.lo[0]) * (c.hi[1] - c.lo[1]) * (c.hi[2] - c.lo[2]), 0);
close(vol, 8, 1e-9);
for (const c of CELLS) {
  assert.ok([0, 1, 2].every(k => c.lo[k] === -1 || c.hi[k] === 1), `${c.name} reaches the cube's skin on every axis`);
  assert.ok([0, 1, 2].every(k => c.lo[k] === C0[k] || c.hi[k] === C0[k]), `${c.name} is bounded by the centre on every axis`);
  assert.ok(CUBRANT_ANCHORS[c.name], c.name);
}

// cubrantOf over the 8 corners of the value cube, at the centres, and the ">= centre reads +" rule
const expect = {
  "100,100,100": "KEYSTONE", "100,100,0": "DEPENDABLE", "100,0,100": "HEIRLOOM", "100,0,0": "GOOD STANDING",
  "0,100,100": "CONTROLLED ASSET", "0,100,0": "MERCENARY", "0,0,100": "LIABILITY", "0,0,0": "SURPLUS",
};
for (const [k, v] of Object.entries(expect)) { const [w, c, s] = k.split(",").map(Number); assert.equal(cubrantOf(w, c, s), v, k); }
assert.equal(cubrantOf(CENTRE.conduct, CENTRE.competence, CENTRE.scarcity), "KEYSTONE", "at the centres reads high on every axis");
assert.equal(cubrantOf(CENTRE.conduct - 1, CENTRE.competence, CENTRE.scarcity), "CONTROLLED ASSET");
assert.equal(cubrantOf(CENTRE.conduct, CENTRE.competence - 1, CENTRE.scarcity), "HEIRLOOM");
assert.equal(cubrantOf(CENTRE.conduct, CENTRE.competence, CENTRE.scarcity - 1), "DEPENDABLE");
assert.equal(cubrantOf(50, 50, 50), "SURPLUS", "50 is under every centre today");
assert.equal(cubrantOf(null, 50, 50), null);
assert.equal(Object.keys(CUBRANTS).length, 8);
assert.deepEqual(Object.values(CUBRANTS).sort(), [...CUBRANT_ORDER].sort());
for (const o of CUBRANT_ORDER) { assert.ok(CUBRANT_LINES[o], o); assert.ok(CUBRANT_FAMILY[o], o); }
// a cubrant is reproducible from the three rounded numbers the file prints
for (const fg of FAMOUS_FIGURES) { const q = cube(fg.breakdown); assert.equal(q.cubrant, cubrantOf(q.warmth, q.competence, q.scarcity), fg.name); }
// the harm colour is only for files under the absolute trust line as well
assert.equal(familyOfCubrant("SURPLUS", CUT - 1), "harm");
assert.equal(familyOfCubrant("SURPLUS", CUT), "dim");
assert.equal(familyOfCubrant("LIABILITY", 30), "harm");
assert.equal(familyOfCubrant("KEYSTONE", 30), "good");
// no death labels in the names or lines (check-no-death-labels' markers)
const DEATH = /DECEASED|\bDIED\b|THE DEAD|GHOSTS?|POSTHUMOUS|OBITUARY|\bALIVE\b/i;
for (const o of CUBRANT_ORDER) assert.ok(!DEATH.test(o) && !DEATH.test(CUBRANT_LINES[o]), o);

// the People stay the judge: likability vs conduct on the absolute line, never an axis
const tesla = FAMOUS_FIGURES.find(x => x.name === "Nikola Tesla");
const qt = cube(tesla.breakdown);
assert.deepEqual([qt.warmth, qt.competence, qt.scarcity, qt.cubrant], [70, 84, 68, "KEYSTONE"]);
assert.equal(judged(qt, { likability: 72 }).judge, "RATIFIED");
assert.equal(judged(qt, { likability: 40 }).judge, "CONTESTED");
assert.equal(judged(qt, { likability: 40 }).people.gap, -30);
assert.match(placeWords(qt), /CONDUCT ABOVE THE MIDDLE \(70 vs 62\)/);

// a point for a figure: placed, in its cubrant, at its three coordinates
const pj = pointOf(tesla);
assert.ok(pj && pj.placed);
assert.equal(pj.cubrant, "KEYSTONE");
assert.equal(pj.family, "good");
assert.deepEqual(pj.p, worldPoint(70, 84, 68));

// a card with warmth and competence but no scarcity (a citizen's pen card before re-assessment):
// on the scarcity midplane, hollow, no cell, PENDING
const pn = pointOf({ name: "Subject 1A2B", warmth: 60, competence: 55, quadrant: "ADMIRED", kind: "citizen" });
assert.ok(pn && !pn.placed);
close(pn.p[2], worldPoint(0, 0, CENTRE.scarcity)[2]);
assert.equal(pn.cubrant, null);
assert.equal(pn.family, "pending");
assert.ok(passes(pn, "PENDING") && !passes(pn, "SURPLUS"));

// an unplaceable subject yields nothing; a breakdown-only subject is placed
assert.equal(pointOf({ name: "x" }), null);
const pb = pointOf({ name: "b", breakdown: { care: 70, alignment: 60, threat: 10, utility: 60, adaptability: 60, legacy: 50, network: 50, redundancy: 40, physical: 50 } });
assert.ok(pb && pb.placed && pb.cubrant);

// every roster figure builds a point; the cubrant filters plus PENDING partition the roster
const pts = FAMOUS_FIGURES.map(pointOf).filter(Boolean);
assert.equal(pts.length, FAMOUS_FIGURES.length);
assert.deepEqual(FILTERS, ["ALL", ...CUBRANT_ORDER, "PENDING"]);
const counts = Object.fromEntries(FILTERS.slice(1).map(fl => [fl, pts.filter(p => passes(p, fl)).length]));
assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), pts.length, "cubrants + pending cover every figure exactly once");
assert.equal(counts.PENDING, 0, "every figure on file has all three axes");
assert.equal(pts.filter(p => passes(p, "ALL")).length, pts.length);
// ratified iff conduct and likability sit on the same side of the absolute line
for (const p of pts.filter(p => p.rated)) assert.equal(p.judge, (p.q.warmth >= CUT) === (p.q.people.likability >= CUT) ? "RATIFIED" : "CONTESTED", p.name);

// pitch clamps
assert.equal(clampPitch(5), PITCH_LIMIT);
assert.equal(clampPitch(-5), -PITCH_LIMIT);

console.log(`check-cube ok (${pts.length} points; ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")})`);
