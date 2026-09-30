// STREET view math (src/city/streetKit.js): projection, near clipping, the tour path,
// collisions and wall facing. node scripts/check-street.mjs
import * as K from "../src/city/streetKit.js";
import * as A from "../src/city/streetArch.js";
import { rot, STOREY, DECK } from "../src/city/iso.js";
import { BUILDINGS } from "../src/city/sim.js";
import { massingOf } from "../src/city/archGeo.js";

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } };

// projection: a point straight ahead at eye height lands on the horizon, centre screen
const view = K.viewFor(800, 500);
const cam = { x: 10, y: 20, yaw: 0, h: K.EYE_H };
const ahead = K.project(K.toCam(cam, 10, 10, K.EYE_H), view);
ok(ahead && Math.abs(ahead.x - 400) < 1e-6 && Math.abs(ahead.y - view.horizon) < 1e-6, "a point ahead at eye height is on the horizon, centre screen");
const ground = K.project(K.toCam(cam, 10, 10, 0), view);
ok(ground.y > view.horizon, "the ground ahead is below the horizon");
const east = K.project(K.toCam(cam, 12, 10, K.EYE_H), view);
ok(east.x > 400, "east is to the right when facing north");
ok(K.project(K.toCam(cam, 10, 30, 0), view) === null, "a point behind the camera does not project");
// turning 90 degrees clockwise faces east
const camE = { ...cam, yaw: Math.PI / 2 };
const p = K.toCam(camE, 20, 20, K.EYE_H);
ok(p.f > 9.99 && Math.abs(p.s) < 1e-9, "yaw +90deg looks east");

// near clipping keeps every vertex in front of the camera and cuts at NEAR
const clipped = K.clipNear([{ s: -1, f: -2, z: 0 }, { s: 1, f: -2, z: 0 }, { s: 1, f: 5, z: 0 }, { s: -1, f: 5, z: 0 }]);
ok(clipped.length === 4 && clipped.every(q => q.f >= K.NEAR - 1e-9), "clipNear cuts a wall that crosses the camera");
ok(K.clipSeg({ s: 0, f: -1, z: 0 }, { s: 0, f: -2, z: 0 }) === null, "a segment fully behind is dropped");

// the auto-tour never walks through a building, and stays in the world
let hits = 0;
for (let t = 0; t < K.RING_L / K.TOUR_SPEED; t += 0.25) {
  const pose = K.tourPose(t);
  if (K.buildingAt(pose.x, pose.y, 0.2)) hits++;
  ok(pose.x >= K.BOUNDS.x0 && pose.x <= K.BOUNDS.x1 && pose.y >= K.BOUNDS.y0 && pose.y <= K.BOUNDS.y1, "tour stays in bounds");
}
ok(hits === 0, `the tour path clears every building (${hits} hits)`);

// arc arithmetic: the short way round
ok(Math.abs(K.arcDelta(10, 20) - 10) < 1e-9 && Math.abs(K.arcDelta(20, 10) + 10) < 1e-9, "arcDelta is signed and short");
ok(Math.abs(K.arcDelta(1, K.RING_L - 1) + 2) < 1e-9, "arcDelta wraps the ring");

// walls: of a box, exactly two face a camera standing off one corner
const r = { x: 0, y: 0, w: 4, h: 2 };
const facing = K.wallsOf(r).filter(w => K.wallFaces(w, 6, 5));
ok(facing.length === 2 && facing.some(w => w.n[0] === 1) && facing.some(w => w.n[1] === 1), "two walls (east and south) face a camera to the south-east");

// every building has a positive height; open lots are low; people on the Loop are up on the deck
ok(K.STREET_BUILDINGS.length > 20 && K.STREET_BUILDINGS.every(b => b.height > 0), "every building stands");
ok(K.STREET_BUILDINGS.filter(b => b.outdoor).every(b => b.height < 1), "open lots are low");
ok(K.heightOf({ activity: "commute", sub: "riding" }) > K.LOOP_H - 0.01, "riders are on the deck");
ok(K.heightOf({ activity: "work" }) === 0 && !K.onStreet({ activity: "work", placeId: "reactor" }), "workers indoors are not on the street");
ok(K.onStreet({ activity: "leisure", placeId: "park" }), "the park is in the open");

// ---- the city's drawers at street level (streetArch.js) ----
// heights follow the city view
ok(K.FLOOR_H === STOREY && Math.abs(K.LOOP_H - DECK * STOREY) < 1e-9 && A.SH === STOREY, "a storey and the Loop's deck are the city view's");
// quarterFor puts the camera at +u+v, so archDraw's "nearer = larger u + v" holds from the street
for (const [dx, dy] of [[5, 3], [-4, 6], [-7, -2], [3, -8], [0.5, 9], [-9, 0.2]]) {
  const r = A.quarterFor(dx, dy), [u0, v0] = rot(50, 30, r), [u1, v1] = rot(50 + dx, 30 + dy, r);
  ok((u1 + v1) - (u0 + v0) > 0, `quarterFor(${dx},${dy}) turns the camera towards the viewer`);
}
// the kit: faces towards the camera show, faces away or wholly behind it do not
const fake = { beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() { this.n++; }, stroke() {}, n: 0 };
const camA = { x: 10, y: 20, yaw: 0, h: K.EYE_H };
const G = A.streetKitG(fake, camA, K.viewFor(800, 500));
ok(G.facing([8, 10], [12, 10], [10, 5]) > 0, "a south face ahead of a north-facing camera shows");
ok(G.facing([8, 10], [12, 10], [10, 15]) === 0, "its back does not");
ok(G.facing([8, 30], [12, 30], [10, 35]) === 0, "a face wholly behind the camera does not");
// tops: a roof above the eye is hidden behind its walls; a slab below it, or a thin one, shows
const top = (x0, y0, x1, y1, h) => [G.Q(x0, y0, h), G.Q(x1, y0, h), G.Q(x1, y1, h), G.Q(x0, y1, h)];
ok(!A.topVisible(top(8, 8, 12, 12, 4), camA.x, camA.y, camA.h), "a flat roof above the eye is hidden");
ok(A.topVisible(top(8, 8, 12, 12, 0.2), camA.x, camA.y, camA.h), "a low slab is seen from above");
ok(A.topVisible(top(8, 8, 12, 8.3, 4), camA.x, camA.y, camA.h), "a thin slab (a balcony) still shows");
ok(A.topVisible([G.Q(8, 10, 0), G.Q(12, 10, 0), G.Q(12, 10, 3), G.Q(8, 10, 3)], camA.x, camA.y, camA.h), "walls pass the top test");
// scale: G.z is px per cell at the depth of the last point projected
G.Q(10, 10, 0); const z10 = G.z; G.Q(10, 0, 0);
ok(Math.abs(z10 / G.z - 2) < 1e-6, "G.z halves at twice the depth");
// every building the street stands has a massing or is open ground/a field
ok(BUILDINGS.every(b => massingOf(b) || K.STREET_BUILDING[b.id]), "every building is drawable from the street");

console.log(fails ? `check-street: ${fails} FAILED` : "check-street: ok");
process.exit(fails ? 1 : 0);
