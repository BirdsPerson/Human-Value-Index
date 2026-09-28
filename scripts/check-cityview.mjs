// City view (isometric overview + building cutaway) checks. Pure node, no DOM.
//   node scripts/check-cityview.mjs
import { PLACES } from "../src/city/sim.js";
import { rot, unrot, project, unproject, screenToMap, depthOrder, slotFor, lodFor, LOD_MID, LOD_NEAR, mod4 } from "../src/city/iso.js";
import { ROOM_TYPE, DRAWN_TYPES, anchorsFor, typeOf } from "../src/city/props.js";

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log(`  FAIL ${m}`); } return c; };
const near = (a, b) => Math.abs(a - b) < 1e-9;

// 1. Projection round-trips at every quarter turn.
for (let r = 0; r < 4; r++) {
  const cam = { z: 7.3, ox: 311, oy: -42, r };
  for (const [x, y] of [[0, 0], [12.5, -3], [40, 27.25], [-8, 61]]) {
    const [u, v] = rot(x, y, r);
    const [bu, bv] = unrot(u, v, r);
    ok(near(bu, x) && near(bv, y), `rot/unrot r=${r} (${x},${y})`);
    const [sx, sy] = project(u, v, 0, cam);
    const [pu, pv] = unproject(sx, sy, cam);
    ok(near(pu, u) && near(pv, v), `project/unproject r=${r} (${x},${y})`);
    const [mx, my] = screenToMap(sx, sy, cam);
    ok(near(mx, x) && near(my, y), `screenToMap r=${r} (${x},${y})`);
  }
  ok(mod4(r + 4) === r && mod4(r - 4) === r, `mod4 ${r}`);
}
// four quarter turns = identity; one turn moves things
{ let p = [3, 9]; for (let i = 0; i < 4; i++) p = rot(p[0], p[1], 1); const [x, y] = rot(3, 9, 1);
  ok(near(p[0], 3) && near(p[1], 9), "rot x4 = identity"); ok(!(near(x, 3) && near(y, 9)), "rot x1 moves"); }

// 2. Depth order: behind boxes draw first, at every rotation of a fixed layout.
const layout = [
  { x: 0, y: 0, w: 4, h: 4 }, { x: 6, y: 0, w: 3, h: 8 }, { x: 0, y: 6, w: 5, h: 2 },
  { x: 10, y: 10, w: 2, h: 2 }, { x: 2, y: 11, w: 6, h: 3 }, { x: 13, y: 1, w: 2, h: 12 },
];
for (let r = 0; r < 4; r++) {
  const boxes = layout.map(b => {
    const [a, c] = rot(b.x, b.y, r), [d, e] = rot(b.x + b.w, b.y + b.h, r);
    return { x0: Math.min(a, d), y0: Math.min(c, e), x1: Math.max(a, d), y1: Math.max(c, e) };
  });
  const order = depthOrder(boxes), pos = new Map(order.map((i, k) => [i, k]));
  ok(order.length === boxes.length && new Set(order).size === boxes.length, `depthOrder permutation r=${r}`);
  for (let i = 0; i < boxes.length; i++) for (let j = 0; j < boxes.length; j++) {
    const A = boxes[i], B = boxes[j];
    const behind = (a, b) => a.x1 <= b.x0 || a.y1 <= b.y0;
    if (i !== j && behind(A, B) && !behind(B, A)) ok(pos.get(i) < pos.get(j), `r=${r} box ${i} before ${j}`);
  }
  // a point in front of everything slots last; behind everything slots first
  ok(slotFor(1e3, 1e3, boxes, order) === order.length - 1, `slotFor front r=${r}`);
  ok(slotFor(-1e3, -1e3, boxes, order) === -1, `slotFor back r=${r}`);
}

// 3. LOD thresholds.
ok(lodFor(LOD_MID - 0.01) === "far" && lodFor(LOD_MID) === "mid", "LOD far/mid edge");
ok(lodFor(LOD_NEAR - 0.01) === "mid" && lodFor(LOD_NEAR) === "near", "LOD mid/near edge");
ok(lodFor(0.5) === "far" && lodFor(40) === "near", "LOD extremes");

// 4. Anchors never overlap (same row: spacing >= scaled sprite width) and stay in the room.
for (const type of new Set(Object.values(ROOM_TYPE))) for (const [w, h, sw] of [[120, 60, 24], [460, 150, 32], [300, 40, 32], [900, 190, 48], [60, 30, 32]]) {
  const as = anchorsFor(type, w, h, sw);
  ok(as.length >= 1, `${type} ${w}x${h} has an anchor`);
  for (const back of [true, false]) {
    const row = as.filter(a => a.back === back).sort((a, b) => a.x - b.x);
    for (let k = 1; k < row.length; k++) ok(row[k].x - row[k - 1].x >= sw * row[k].s - 1e-9, `${type} ${w}x${h} ${back ? "back" : "front"} overlap`);
    for (const a of row) ok(a.y <= h && a.y > 0, `${type} ${w}x${h} anchor y in room`);
    if (row.length > 1) for (const a of row) ok(a.x - sw * a.s / 2 >= -1e-9 && a.x + sw * a.s / 2 <= w + 1e-9, `${type} ${w}x${h} anchor x in room`);
  }
}

// 5. Prop coverage: every place maps to a room type, every room type is drawn.
const drawn = new Set(DRAWN_TYPES);
for (const id of Object.keys(PLACES)) {
  ok(id in ROOM_TYPE, `place ${id} has a ROOM_TYPE`);
  ok(drawn.has(typeOf(id)), `place ${id} type ${typeOf(id)} is drawn`);
}
for (const t of new Set(Object.values(ROOM_TYPE))) ok(drawn.has(t), `room type ${t} has a drawer`);
ok(new Set(Object.values(ROOM_TYPE)).size >= 20, "at least 20 distinct room types");

console.log(fails ? `check-cityview: ${fails} FAILED` : "check-cityview: ok");
process.exit(fails ? 1 : 0);
