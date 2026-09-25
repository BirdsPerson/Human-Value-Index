// Pure-math checks for the octant cube (src/cube3d.js, octantOf in src/cube.js). No DOM.
import assert from "node:assert/strict";
import { CORNERS, EDGES, AXES, MIDPLANES, worldPoint, rotate, project, clampPitch, PITCH_LIMIT, pointOf, passes, FILTERS, footOnAgreement, CAMERA } from "../src/cube3d.js";
import { octantOf, OCTANTS, OCTANT_ORDER, OCTANT_LINES, OCTANT_FAMILY } from "../src/cube.js";
import { FAMOUS_FIGURES } from "../src/figures.js";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// geometry: 8 corners, 12 edges of length 2
assert.equal(CORNERS.length, 8);
assert.equal(EDGES.length, 12);
for (const [i, j] of EDGES) close(len(CORNERS[i], CORNERS[j]), 2);

// value mapping: 0 -> -1, 50 -> 0 (the centre), 100 -> 1, clamped
assert.deepEqual(worldPoint(0, 100, 50), [-1, 1, 0]);
assert.deepEqual(worldPoint(50, 50, 50), [0, 0, 0]);
assert.deepEqual(worldPoint(-20, 140, 100), [-1, 1, 1]);

// rotation keeps every edge length, at any angle
for (const [yaw, pitch] of [[0, 0], [0.7, -0.4], [-2.1, 1.0], [3.3, 0.2]]) {
  for (const [i, j] of EDGES) close(len(rotate(CORNERS[i], yaw, pitch), rotate(CORNERS[j], yaw, pitch)), 2, 1e-9);
}

// the centre (50,50,50) projects to the screen centre from any angle
const view = { yaw: 0, pitch: 0, scale: 100, cx: 200, cy: 150 };
for (const [yaw, pitch] of [[0, 0], [1.2, -0.5], [-0.62, 0.34], [2.9, 1.0]]) {
  const c = project(worldPoint(50, 50, 50), { ...view, yaw, pitch });
  close(c.x, 200); close(c.y, 150);
}
// head-on, a point on the near face lands at centre + x*scale*f, y flipped
const pt = project(worldPoint(100, 100, 0), view);
const f = CAMERA / (CAMERA - 1);
close(pt.x, 200 + 100 * f); close(pt.y, 150 - 100 * f); close(pt.depth, -1);

// the three axes pass through the centre and are mutually perpendicular under rotation;
// both ends of each axis are equidistant from the centre, and their midpoint IS the centre
assert.equal(AXES.length, 3);
for (const [yaw, pitch] of [[0, 0], [0.9, 0.4], [-1.7, -0.8]]) {
  const dirs = AXES.map(ax => {
    const a = rotate(ax.a, yaw, pitch), b = rotate(ax.b, yaw, pitch);
    for (let k = 0; k < 3; k++) close((a[k] + b[k]) / 2, 0, 1e-9);
    return [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  });
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  close(dot(dirs[0], dirs[1]), 0, 1e-9); close(dot(dirs[1], dirs[2]), 0, 1e-9); close(dot(dirs[0], dirs[2]), 0, 1e-9);
}
// the three midplanes each hold one coordinate at 0 and all contain the centre
assert.equal(MIDPLANES.length, 3);
for (const m of MIDPLANES) {
  const k = { x: 0, y: 1, z: 2 }[m.axis];
  for (const c of m.outline) assert.equal(c[k], 0);
  const mid = m.outline.reduce((s, c) => [s[0] + c[0] / 4, s[1] + c[1] / 4, s[2] + c[2] / 4], [0, 0, 0]);
  for (const v of mid) close(v, 0);
}

// octantOf over all 8 corners of the value cube, and the split sits at 50
const expect = {
  "100,100,100": "ADMIRED", "100,100,0": "UNSUNG", "100,0,100": "BELOVED", "100,0,0": "OVERLOOKED",
  "0,100,100": "CHARMING", "0,100,0": "FEARED", "0,0,100": "INDULGED", "0,0,0": "DISMISSED",
};
for (const [k, v] of Object.entries(expect)) { const [w, c, l] = k.split(",").map(Number); assert.equal(octantOf(w, c, l), v, k); }
assert.equal(octantOf(50, 50, 50), "ADMIRED");
assert.equal(octantOf(49, 50, 50), "CHARMING");
assert.equal(Object.keys(OCTANTS).length, 8);
for (const o of OCTANT_ORDER) { assert.ok(OCTANT_LINES[o], o); assert.ok(OCTANT_FAMILY[o], o); }

// JFK: conduct 43, competence 60, likability 69 -> CHARMING, with a positive gap
// A CHARMING fixture: JFK's pre-rescore reading (conduct 43, competence 60) with his
// YouGov likability. Fixed here so a roster rescore can't silently change what this tests.
const jfkNow = FAMOUS_FIGURES.find(x => x.name === "JFK");
const jfk = { name: "JFK", people: jfkNow.people, breakdown: { care: 32, alignment: 48, utility: 62, adaptability: 55, legacy: 62, network: 78, physical: 45, threat: 35, redundancy: 50 } };
const pj = pointOf(jfk);
assert.ok(pj && pj.rated);
assert.equal(pj.q.warmth, 43); assert.equal(pj.q.competence, 60); assert.equal(pj.q.people.likability, 69);
assert.equal(pj.octant, "CHARMING");
assert.equal(pj.gap, 26);
assert.deepEqual(pj.p, worldPoint(43, 60, 69));
// the drop line lands on the plane where likability equals conduct, at the same competence
assert.equal(pj.foot[0], pj.foot[2]); assert.equal(pj.foot[1], pj.p[1]);
close(len(pj.p, pj.foot), Math.abs(pj.p[2] - pj.p[0]) / Math.SQRT2);
assert.deepEqual(footOnAgreement([0.2, 0.1, 0.2]), [0.2, 0.1, 0.2]);

// unrated: placed on the likability midplane (50 -> z 0), no octant, only the quadrant
const none = FAMOUS_FIGURES.find(x => !x.people && typeof x.warmth === "number");
const pn = pointOf(none);
assert.ok(pn && !pn.rated);
assert.equal(pn.p[2], 0);
assert.equal(pn.octant, null);
assert.equal(pn.family, "unrated");
assert.equal(pn.foot, null);
assert.ok(passes(pn, "UNRATED") && !passes(pn, "DISMISSED"));

// an unplaceable subject yields nothing; a breakdown-only subject is unrated
assert.equal(pointOf({ name: "x" }), null);
const pb = pointOf({ name: "b", breakdown: { care: 70, alignment: 60, threat: 10, utility: 60, adaptability: 60, legacy: 50, network: 50, redundancy: 40, physical: 50 } });
assert.ok(pb && !pb.rated && pb.p[2] === 0);

// every roster figure builds a point; the octant filters plus UNRATED partition the roster
const pts = FAMOUS_FIGURES.map(pointOf).filter(Boolean);
assert.equal(pts.length, FAMOUS_FIGURES.length);
assert.deepEqual(FILTERS, ["ALL", ...OCTANT_ORDER, "UNRATED"]);
const counts = Object.fromEntries(FILTERS.slice(1).map(fl => [fl, pts.filter(p => passes(p, fl)).length]));
assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), pts.length, "octants + unrated cover every figure exactly once");
assert.equal(pts.filter(p => passes(p, "ALL")).length, pts.length);
// ratified iff conduct and likability sit on the same side of 50
for (const p of pts.filter(p => p.rated)) assert.equal(p.judge, (p.q.warmth >= 50) === (p.q.people.likability >= 50) ? "RATIFIED" : "CONTESTED", p.name);

// pitch clamps
assert.equal(clampPitch(5), PITCH_LIMIT);
assert.equal(clampPitch(-5), -PITCH_LIMIT);

console.log(`check-cube ok (${pts.length} points; ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")})`);
