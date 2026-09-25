// Pure-math checks for the 3D two-judge cube (src/cube3d.js). No DOM.
import assert from "node:assert/strict";
import { CORNERS, EDGES, worldPoint, rotate, project, clampPitch, PITCH_LIMIT, segmentOf, passes, distToSegment, MACHINE_Z, PEOPLE_Z, STUB, CAMERA } from "../src/cube3d.js";
import { FAMOUS_FIGURES } from "../src/figures.js";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// geometry: 8 corners, 12 edges of length 2
assert.equal(CORNERS.length, 8);
assert.equal(EDGES.length, 12);
for (const [i, j] of EDGES) close(len(CORNERS[i], CORNERS[j]), 2);

// value mapping: 0 -> -1, 50 -> 0, 100 -> 1, clamped
assert.deepEqual(worldPoint(0, 100, MACHINE_Z), [-1, 1, -1]);
assert.deepEqual(worldPoint(50, 50, PEOPLE_Z), [0, 0, 1]);
assert.deepEqual(worldPoint(-20, 140, 0), [-1, 1, 0]);

// rotation keeps every edge length, at any angle
for (const [yaw, pitch] of [[0, 0], [0.7, -0.4], [-2.1, 1.0], [3.3, 0.2]]) {
  for (const [i, j] of EDGES) close(len(rotate(CORNERS[i], yaw, pitch), rotate(CORNERS[j], yaw, pitch)), 2, 1e-9);
}

// projection: head-on, a front-face point lands at centre + x*scale*f, y flipped, depth = z
const view = { yaw: 0, pitch: 0, scale: 100, cx: 200, cy: 150 };
const pt = project(worldPoint(100, 100, MACHINE_Z), view);
const f = CAMERA / (CAMERA - 1);
close(pt.x, 200 + 100 * f); close(pt.y, 150 - 100 * f); close(pt.depth, -1);
// the front face is nearer (bigger) than the back face head-on
assert.ok(project([1, 1, MACHINE_Z], view).f > project([1, 1, PEOPLE_Z], view).f);
// the centre projects to the centre from any angle
const c = project([0, 0, 0], { ...view, yaw: 1.2, pitch: -0.5 });
close(c.x, 200); close(c.y, 150);

// pitch clamps
assert.equal(clampPitch(5), PITCH_LIMIT);
assert.equal(clampPitch(-5), -PITCH_LIMIT);
assert.equal(clampPitch(0.3), 0.3);

// segments: a figure with people data spans machine face -> people face at the same competence
const jfk = FAMOUS_FIGURES.find(x => x.name === "JFK");
const sj = segmentOf(jfk);
assert.ok(sj && sj.p, "JFK has a people point");
assert.equal(sj.m[2], MACHINE_Z); assert.equal(sj.p[2], PEOPLE_Z);
assert.equal(sj.m[1], sj.p[1], "shared competence");
assert.ok(sj.p[0] > sj.m[0], "JFK's likability exceeds his conduct");
assert.equal(sj.judge, "CONTESTED");
assert.equal(sj.stub, null);

// people-less subject: the machine dot and a short stub toward the people face, no p
const none = FAMOUS_FIGURES.find(x => !x.people && typeof x.warmth === "number");
const sn = segmentOf(none);
assert.ok(sn && !sn.p && sn.stub);
close(sn.stub[2], MACHINE_Z + STUB);
assert.equal(sn.stub[0], sn.m[0]); assert.equal(sn.stub[1], sn.m[1]);
assert.equal(sn.judge, "UNRATIFIED");

// an unplaceable subject yields nothing; a breakdown-only subject derives its cube
assert.equal(segmentOf({ name: "x" }), null);
const sb = segmentOf({ name: "b", breakdown: { care: 70, alignment: 60, threat: 10, utility: 60, adaptability: 60, legacy: 50, network: 50, redundancy: 40, physical: 50 } });
assert.ok(sb && sb.m[2] === MACHINE_Z && !sb.p);

// every roster figure builds a segment, and the filters partition sensibly
const segs = FAMOUS_FIGURES.map(segmentOf).filter(Boolean);
assert.equal(segs.length, FAMOUS_FIGURES.length);
assert.equal(segs.filter(s => passes(s, "ALL")).length, segs.length);
const byJudge = ["RATIFIED", "CONTESTED"].map(j => segs.filter(s => passes(s, j)).length);
assert.equal(byJudge[0] + byJudge[1], segs.filter(s => s.p).length, "every rated figure is ratified or contested");
assert.ok(segs.filter(s => passes(s, "DISMISSED")).every(s => s.q.quadrant === "DISMISSED"));

// hit-testing distance
close(distToSegment(5, 5, 0, 0, 10, 0), 5);
close(distToSegment(-3, 4, 0, 0, 10, 0), 5);
close(distToSegment(0, 0, 0, 0, 0, 0), 0);

console.log(`check-cube ok (${segs.length} segments, ${byJudge[0]} ratified, ${byJudge[1]} contested)`);
