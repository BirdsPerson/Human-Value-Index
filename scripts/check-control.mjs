// DRIVE YOURSELF checks (src/city/control.js, src/city/gamepad.js). Pure node, no DOM.
//   node scripts/check-control.mjs
// Collision against the building bodies, door entry (every door reachable from the street,
// leaning on it goes in), the inside (the lift reaches every floor with rooms, the exit
// lets you out), seat snapping, the input mapping (keys, the touch stick, a mocked
// navigator.getGamepads with Xbox / PlayStation / Switch pads), "up is screen up" at every
// quarter turn, the Loop's stairs and platform, and the session store; GAMEPAD BROWSE
// (padBrowse.js): the cursor, the camera, the presses, through the same mocked pads.
import { BUILDINGS, BUILDING, OPEN_LOTS, STATIONS, PLACES } from "../src/city/sim.js";
import { project, rot, mod4 } from "../src/city/iso.js";
import { roomPlan, typeOf } from "../src/city/props.js";
import {
  solids, solidAt, moveOnStreet, freeSpot, screenToMapDir, doorOf, doorNear, groundAt, isClassified,
  entryFloor, nextFloor, roomAt, fxOfRoom, floorsWithRooms, nearestSeat, stairFoot, stationNear, platformPoint, platformStep,
  keysVector, stickVector, stepStreet, stepInside, stateFromTarget, saveControl, loadControl, exitPoint, benches, benchNear,
  trainIn, nearestCar, STORE_KEY, STORE_TTL, LIFT_X, EXIT_X, PLAT_LA, DOOR_REACH,
} from "../src/city/control.js";
import { readPad, pressedSince, deadzone, familyOf, GLYPHS, driveToggle } from "../src/city/gamepad.js";
import { stepCursor, snapTarget, stepPan, zoomFactor, stickStep, nearestInDir, padActions, makePadBrowse, CUR, PAN } from "../src/city/padBrowse.js";
import { trainsAt } from "../src/city/sim.js";

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log(`  FAIL ${m}`); } return c; };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// 1. collision: every massed body is solid, open ground is not, a step into a wall stops or slides
const S = solids();
ok(S.length >= 25, `solids: ${S.length}`);
for (const o of S) ok(solidAt((o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2)?.id === o.id, `solid centre ${o.id}`);
for (const id of OPEN_LOTS) { const b = BUILDING[id]; if (b) ok(!S.some(o => o.id === id), `open lot not solid: ${id}`); }
{
  const o = S.find(q => q.id === "the-dive");
  const x = (o.x0 + o.x1) / 2, y = o.y0 - 0.6;           // on the pavement north of it
  ok(!solidAt(x, y), "pavement north of the dive is free");
  const m = moveOnStreet(x, y, 0, 1.2);                   // straight into its north wall
  ok(m.bump?.id === "the-dive" && m.y <= y + 1e-9, `walk into a wall stops: ${m.y} vs ${y}`);
  const sl = moveOnStreet(x, y, 0.5, 1.2);                // diagonally: slides along it
  ok(near(sl.y, y) && sl.x > x, "diagonal into a wall slides along it");
  const cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2;
  ok(moveOnStreet(cx, cy, 0.3, 0).x > cx, "stuck inside a body: you can walk out");
  const [fx, fy] = freeSpot((o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2);
  ok(!solidAt(fx, fy), "freeSpot steps out of a wall");
}

// 2. up is up: at every quarter turn a screen direction moves the projected point that way
for (let r = 0; r < 4; r++) {
  const cam = { z: 10, ox: 0, oy: 0, r };
  const scr = (x, y) => { const [u, v] = rot(x, y, r); return project(u, v, 0, cam); };
  const x0 = 50, y0 = 30, [sx0, sy0] = scr(x0, y0);
  for (const [ix, iy, name] of [[0, -1, "up"], [0, 1, "down"], [1, 0, "right"], [-1, 0, "left"]]) {
    const [dx, dy] = screenToMapDir(ix, iy, r);
    ok(near(Math.hypot(dx, dy), 1, 1e-9), `r${r} ${name}: unit`);
    const [sx, sy] = scr(x0 + dx, y0 + dy), mx = sx - sx0, my = sy - sy0;
    ok(ix ? Math.sign(mx) === ix && Math.abs(my) < 1e-6 : Math.sign(my) === iy && Math.abs(mx) < 1e-6, `r${r} ${name}: screen (${mx.toFixed(2)}, ${my.toFixed(2)})`);
  }
  ok(mod4(r) === r, "mod4");
}

// 3. doors: every massed building has one, outside its body, and leaning on it goes in
for (const b of BUILDINGS) {
  const d = doorOf(b);
  const massed = S.some(o => o.id === b.id);
  if (!massed) { ok(d === null, `no door for open ground ${b.id}`); continue; }
  if (!ok(d, `door for ${b.id}`)) continue;
  ok(!solidAt(d.x, d.y), `door of ${b.id} is on the pavement (${d.x.toFixed(2)}, ${d.y.toFixed(2)})`);
  ok(doorNear(d.x, d.y)?.b.id === b.id, `doorNear at the door of ${b.id}: ${doorNear(d.x, d.y)?.b.id}`);
  // walk from the door into the building: the first thing leant on is its own wall, in reach
  const st = { mode: "street", x: d.x, y: d.y, face: -1 };
  let bump = null;
  for (let k = 0; k < 20 && !bump; k++) {
    const [ix, iy] = screenFor(-d.nx, -d.ny, 0);
    bump = stepStreet(st, { x: ix, y: iy }, false, 0, 0.05);
  }
  ok(bump?.id === b.id && Math.hypot(st.x - d.x, st.y - d.y) < DOOR_REACH, `leaning on the door of ${b.id}: ${bump?.id}`);
  const [ex, ey] = exitPoint(b);
  ok(!solidAt(ex, ey), `exit point of ${b.id} is free`);
}
ok(isClassified(BUILDING.hq) && !isClassified(BUILDING["the-dive"]), "HQ is classified to you");
// a screen vector that walks map direction (mx, my) at turn r
function screenFor(mx, my, r) {
  let best = null, bd = -Infinity;
  for (let a = 0; a < 64; a++) { const ix = Math.cos(a / 64 * Math.PI * 2), iy = Math.sin(a / 64 * Math.PI * 2); const [dx, dy] = screenToMapDir(ix, iy, r); const dot = dx * mx + dy * my; if (dot > bd) { bd = dot; best = [ix, iy]; } }
  return best;
}
// open ground is entered by walking onto it
for (const id of ["the-green", "the-diamond", "the-bowl", "the-street"]) { const b = BUILDING[id]; ok(groundAt(b.pos.x, b.pos.y)?.id === id, `ground underfoot: ${id}`); }

// 4. inside: the entry floor, the lift to every floor with rooms, the exit
for (const b of BUILDINGS) {
  const fs = floorsWithRooms(b);
  if (!fs.length) continue;
  const e = entryFloor(b);
  ok(e != null && b.floors[e].places.length, `entry floor ${b.id}`);
  // ride the lift to the top, then to the bottom: every floor with rooms is visited
  const seen = new Set([e]);
  for (const dir of [1, -1]) { let f = e; for (let n = nextFloor(b, f, dir); n != null; n = nextFloor(b, f, dir)) { f = n; seen.add(f); } }
  ok(seen.size === fs.length, `lift reaches every floor of ${b.id}: ${seen.size}/${fs.length}`);
  for (const f of fs) for (const pid of f.places) { const fx = fxOfRoom(b, f.index, pid); ok(roomAt(b, f.index, fx).placeId === pid, `roomAt ${b.id} ${f.code} ${pid}`); }
}
{
  const b = BUILDING["reserve-tower"], e = entryFloor(b);
  const st = { mode: "inside", bId: b.id, floor: e, fx: 0.5, face: -1 };
  // up: walks to the lift, then rides
  let t = 0; while (st.floor === e && t < 200) { stepInside(st, { x: 0, y: -1 }, false, 0.05, b); t++; }
  ok(st.fx <= LIFT_X && b.floors[st.floor].level === b.floors[e].level + 1, `lift up one floor: ${b.floors[st.floor].code}`);
  // down to the vault: skips nothing, lands on B1
  for (let k = 0; k < 400; k++) stepInside(st, { x: 0, y: 1 }, false, 0.05, b);
  ok(b.floors[st.floor].code === "B1", `lift down to the vault: ${b.floors[st.floor].code}`);
  // back to the ground floor, walk east: out of the door
  for (let k = 0; k < 400 && st.floor !== e; k++) stepInside(st, { x: 0, y: -1 }, false, 0.05, b);
  let out = null; for (let k = 0; k < 400 && !out; k++) out = stepInside(st, { x: 1, y: 0 }, false, 0.05, b);
  ok(out === "exit" && st.fx >= EXIT_X, "walking east on the ground floor exits");
  const st2 = { mode: "inside", bId: b.id, floor: nextFloor(b, e, 1), fx: 0.5 };
  let out2 = null; for (let k = 0; k < 400; k++) out2 = out2 || stepInside(st2, { x: 1, y: 0 }, false, 0.05, b);
  ok(out2 === null && st2.fx < 1, "walking east upstairs does not exit");
}

// 5. seats: a bar's stools snap, a taken stool is skipped, out of reach is nothing
{
  const plan = roomPlan(typeOf("dive-bar"), 360, 120, 30, 14);
  const seats = plan.anchors.filter(a => a.kind === "seat");
  ok(seats.length >= 3, `the bar has stools: ${seats.length}`);
  const s0 = seats[0];
  ok(nearestSeat(plan.anchors, new Set(), s0.x + 4, 20) === s0.i, "snap to the nearest stool");
  const other = nearestSeat(plan.anchors, new Set([s0.i]), s0.x, 400);
  ok(other != null && other !== s0.i, "a taken stool is skipped");
  ok(nearestSeat(plan.anchors, new Set(), -500, 20) === null, "nothing within reach: no seat");
  for (const pid of ["stadium", "park", "chapel", "casino"]) {
    const p = roomPlan(typeOf(pid), 360, 120, 30, 14);
    ok(p.anchors.some(a => a.kind === "seat"), `somewhere to sit in ${pid}`);
  }
}
ok(benches().length > 0 && benches().every(b => !solidAt(b.x, b.y, 0)), `benches in the yards, none inside a body: ${benches().length}`);
{ const b = benches()[0]; ok(benchNear(b.x + 0.3, b.y)?.id === b.id, "benchNear"); }

// 6. keys and the touch stick
{
  const v = keysVector(new Set(["w", "d", "shift"]));
  ok(near(v.x, Math.SQRT1_2) && near(v.y, -Math.SQRT1_2) && v.run, "keys: W+D = up-right, shift runs");
  const a = keysVector(new Set(["arrowleft"]));
  ok(a.x === -1 && a.y === 0 && !a.run, "keys: left arrow");
  ok(keysVector(new Set()).x === 0 && keysVector(new Set(["w", "s"])).y === 0, "keys: nothing / opposites cancel");
  ok(stickVector(3, 2, 46).mag === 0, "stick: inside the dead zone is still");
  const full = stickVector(0, -200, 46);
  ok(near(full.mag, 1) && near(full.x, 0) && near(full.y, -1), "stick: pushed past the rim clamps to 1, up");
  const half = stickVector(46 * 0.57, 0, 46, 0.14);
  ok(near(half.mag, 0.5, 1e-9) && near(half.x, 0.5, 1e-9), `stick: rescaled past the dead zone: ${half.mag}`);
}

// 7. the gamepad, through a mocked navigator.getGamepads()
const btn = (on) => ({ pressed: on, value: on ? 1 : 0 });
const pad = (id, axes, pressed = [], extra = {}) => ({ id, index: 0, connected: true, mapping: "standard", axes, buttons: Array.from({ length: 17 }, (_, i) => btn(pressed.includes(i))), ...extra });
const nav = (...pads) => ({ getGamepads: () => pads });
{
  ok(readPad(nav()).connected === false && readPad(nav(null, null)).connected === false, "no pad: not connected");
  ok(readPad({ getGamepads() { throw new Error("denied"); } }).connected === false, "a throwing getGamepads is no pad");
  ok(readPad(undefined).connected === false, "no navigator: no pad");
  const x = readPad(nav(null, pad("Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)", [0.1, -0.12])));
  ok(x.connected && x.family === "xbox" && x.mag === 0, "xbox: a resting stick inside the dead zone");
  const up = readPad(nav(pad("045e-02fd-Xbox", [0, -1], [0])));
  ok(near(up.y, -1) && near(up.x, 0) && up.run && up.held.act && !up.held.back, "xbox: stick up at full tilt runs; A (bottom) acts");
  const ps = readPad(nav(pad("DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c)", [0.6, 0], [1, 9, 4])));
  ok(ps.family === "playstation" && ps.held.back && ps.held.start && ps.held.turnL && !ps.held.act && ps.x > 0 && ps.x < 0.6, "playstation: circle backs, options starts, L1 turns; stick rescaled");
  const sw = readPad(nav(pad("Pro Controller (STANDARD GAMEPAD Vendor: 057e)", [0, 0], [1])));
  ok(sw.family === "switch" && sw.held.act && !sw.held.back, "switch: A (right) acts");
  const sw2 = readPad(nav(pad("Nintendo Switch Pro Controller", [0, 0], [0])));
  ok(sw2.held.back && !sw2.held.act, "switch: B (bottom) backs");
  const dp = readPad(nav(pad("generic usb pad", [0, 0], [15, 12])));
  ok(dp.family === "generic" && near(dp.x, Math.SQRT1_2) && near(dp.y, -Math.SQRT1_2) && dp.mag === 1, "d-pad steers up-right at full tilt");
  const gone = readPad(nav(pad("Xbox", [1, 0], [], { connected: false })));
  ok(gone.connected === false, "a disconnected pad is ignored");
  const legacy = readPad(nav({ id: "old pad", axes: [0, 0.9], buttons: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] }));
  ok(legacy.connected && legacy.held.act && legacy.y > 0.8, "non-standard pad, numeric buttons: best effort");
  // edges: a held button is one press
  const p1 = pressedSince(null, { act: true }), p2 = pressedSince({ act: true }, { act: true }), p3 = pressedSince({ act: true }, { act: false, back: true });
  ok(p1.act && !p2.act && !p3.act && p3.back, "pressedSince: edges only");
  const dz = deadzone(0.2, 0);
  ok(dz.mag === 0 && deadzone(1, 1).mag === 1, "dead zone: the edge is zero, the corner clamps");
  ok(familyOf("") === "generic" && GLYPHS.playstation.act === "✕" && GLYPHS.switch.act === "A", "glyphs per family");
}

// 8. the Loop: the stairs are reachable, the platform is clamped, boarding picks a car
for (const id of Object.keys(STATIONS)) {
  const f = stairFoot(id);
  const [x, y] = freeSpot(f.x, f.y);
  ok(stationNear(x, y) === id, `stairs of ${id} within reach of the street`);
  const p = platformStep(id, 0, PLAT_LA[0], 100, 100);
  ok(p.al <= 6 && p.al >= -6 && p.la >= PLAT_LA[0] && p.la <= PLAT_LA[1], `platform clamps ${id}`);
  const q = platformPoint(id, p.al, p.la);
  ok(Number.isFinite(q.x) && Number.isFinite(q.y), "platform point");
}
{
  // find a moment a train stands somewhere
  let mt = 100, tr = null;
  for (let k = 0; k < 2000 && !tr; k++, mt += 0.002) tr = trainsAt(mt).find(t => t.dwell);
  ok(tr && trainIn(trainsAt(mt), tr.stationId)?.id === tr.id, "a standing train is found at its station");
  const c = tr.cars[tr.cars.length - 1];
  ok(nearestCar(tr, c.x, c.y) === tr.cars.length - 1, "nearest car");
}

// 9. where you start: from the schedule's answer
{
  const b = BUILDING["the-dive"];
  const inside = stateFromTarget("citizen-test", { mode: "inside", buildingId: b.id, floor: 0, placeId: b.floors[0].places[0], x: 0, y: 0 });
  ok(inside.mode === "inside" && inside.bId === "the-dive" && roomAt(b, 0, inside.fx).placeId === b.floors[0].places[0], "start inside: in the room the schedule has");
  const st = stateFromTarget("k", { mode: "street", x: b.pos.x, y: b.pos.y });
  ok(st.mode === "street" && !solidAt(st.x, st.y), "start on the street, out of any wall");
  const hq = stateFromTarget("k", { mode: "classified", x: 0, y: 0 });
  ok(hq.mode === "street" && !solidAt(hq.x, hq.y), "HQ: let out at its door");
  ok(stateFromTarget("k", { mode: "riding", trainId: "L1", car: 2, x: 1, y: 1 }).mode === "riding", "start riding");
  ok(stateFromTarget("k", { mode: "platform", stationId: "strip", x: 1, y: 1 }).stationId === "strip", "start on the platform");
}

// 10. the session store: round trip, another self, expiry, a broken storage
{
  const mem = new Map();
  const store = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  const st = { key: "citizen-abcd", mode: "inside", bId: "the-dive", floor: 0, fx: 0.4, seat: { placeId: "dive-bar", i: 2 }, face: 1, moving: true };
  ok(saveControl(st, store) && mem.has(STORE_KEY), "saved");
  const back = loadControl("citizen-abcd", store);
  ok(back && back.mode === "inside" && back.fx === 0.4 && back.seat.i === 2 && back.moving === undefined, "loaded, without per-frame fields");
  ok(loadControl("citizen-zzzz", store) === null, "another self does not inherit it");
  ok(loadControl("citizen-abcd", store, Date.now() + STORE_TTL + 1) === null, "expired after the session");
  mem.set(STORE_KEY, "{not json"); ok(loadControl("citizen-abcd", store) === null, "garbage reads as nothing");
  const bad = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  ok(saveControl(st, bad) === false && loadControl("citizen-abcd", bad) === null, "blocked storage: no crash");
  ok(saveControl(null, store) && !mem.has(STORE_KEY), "release clears it");
  mem.set(STORE_KEY, JSON.stringify({ key: "k", mode: "inside", bId: "nowhere", floor: 0, t: Date.now() }));
  ok(loadControl("k", store) === null, "a building that no longer exists is not resumed");
}
void PLACES;

// 11. GAMEPAD BROWSE (padBrowse.js): the cursor, the camera, what each press means
{
  const P = (axes, pressed = [], id = "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)") => readPad(nav(pad(id, axes, pressed)));
  // the right stick, the triggers and the face buttons, apart
  const r = P([0, 0, 0.9, -0.5], [7, 2, 3, 11]);
  ok(r.rx > 0.5 && r.ry < 0 && r.lmag === 0 && r.held.find && r.held.labels && r.held.rs && r.rt === 1 && r.lt === 0, "right stick, RT, X (find), Y (labels), RS click read apart");
  const sw = P([0, 0], [3, 2], "Pro Controller (STANDARD GAMEPAD Vendor: 057e)");
  ok(sw.held.find && sw.held.labels, "switch: X on top finds, Y on the left labels");
  ok(P([0, 0], [], "pad").lt === 0 && readPad(nav({ ...pad("p", [0, 0]), buttons: Array.from({ length: 17 }, (_, i) => (i === 6 ? { pressed: false, value: 0.05 } : btn(false))) })).lt === 0, "a resting trigger is zero");
  // stick -> cursor, with its dead zone
  const still = P([0.15, -0.1]);
  const c0 = { x: 200, y: 150, t: 0 };
  const c1 = stepCursor(c0, still.lx, still.ly, 1 / 60, { w: 400, h: 300 });
  ok(c1.x === 200 && c1.y === 150, "cursor: a stick inside the dead zone does not move it");
  const push = P([1, 0]);
  let c = c0; for (let k = 0; k < 6; k++) c = stepCursor(c, push.lx, push.ly, 1 / 60, { w: 400, h: 300 });
  const early = c.x - 200;
  ok(early > 0 && c.y === 150, `cursor: pushed right moves right (${early.toFixed(1)} px)`);
  let c2 = { ...c }; const x0 = c2.x; for (let k = 0; k < 6; k++) c2 = { ...c2, ...stepCursor({ ...c2, t: 1 }, push.lx, push.ly, 1 / 60, { w: 4000, h: 300 }) };
  ok(c2.x - x0 > early, "cursor: a held push accelerates");
  const half = P([0.6, 0]);
  const ch = stepCursor({ x: 200, y: 150, t: 1 }, half.lx, half.ly, 0.1, { w: 4000, h: 300 }), cf = stepCursor({ x: 200, y: 150, t: 1 }, 1, 0, 0.1, { w: 4000, h: 300 });
  ok(ch.x - 200 < (cf.x - 200) * 0.5, "cursor: a light push is fine (speed grows with the push squared)");
  const slow = stepCursor({ x: 200, y: 150, t: 1 }, 1, 0, 0.1, { w: 4000, h: 300, over: true });
  ok(near(slow.x - 200, (cf.x - 200) * CUR.friction, 1e-6), "aim assist: slower over a target");
  const sn = stepCursor({ x: 200, y: 150, t: 0 }, 0, 0, 0.1, { w: 400, h: 300, snap: [210, 150] });
  ok(sn.x > 200 && sn.x <= 210, "aim assist: a released cursor settles onto a person near it");
  ok(stepCursor({ x: 200, y: 150 }, 0, 0, 0.1, { w: 400, h: 300, snap: [210, 150], reduced: true }).x === 210, "aim assist under reduced motion: no glide");
  ok(snapTarget(200, 150, [{ x: 215, y: 150 }, { x: 500, y: 500 }])?.[0] === 215 && snapTarget(200, 150, [{ x: 300, y: 150 }]) === null, "snap: only within reach");
  const rim = stepCursor({ x: 395, y: 150, t: 1 }, 1, 0, 0.1, { w: 400, h: 300 });
  ok(rim.x === 400 - CUR.edge && rim.ex === 1, "the rim stops the cursor and pushes the camera");
  // right stick -> camera deltas, eased (none under reduced motion)
  const rs = P([0, 0, 1, 0]);
  let v = { x: 0, y: 0 }; v = stepPan(v, rs.rx, rs.ry, 1 / 60);
  ok(v.x > 0 && v.x < PAN && v.y === 0, `pan eases in: ${v.x.toFixed(0)} px/s`);
  for (let k = 0; k < 60; k++) v = stepPan(v, rs.rx, rs.ry, 1 / 60);
  ok(near(v.x, PAN, 1), "pan reaches full speed");
  ok(stepPan({ x: 0, y: 0 }, rs.rx, rs.ry, 1 / 60, true).x === PAN, "reduced motion: no easing");
  const rdz = P([0, 0, 0.12, 0.1]);
  ok(stepPan({ x: 0, y: 0 }, rdz.rx, rdz.ry, 1 / 60, true).x === 0, "right stick dead zone: no drift");
  let vv = { x: PAN, y: 0 }; for (let k = 0; k < 120; k++) vv = stepPan(vv, 0, 0, 1 / 60);
  ok(vv.x === 0, "pan eases out to a stop");
  ok(zoomFactor(0, 1, 0.1) > 1 && zoomFactor(1, 0, 0.1) < 1 && zoomFactor(0, 0, 0.1) === 1, "RT zooms in, LT out, neither: still");
  // the stick as a d-pad in a cutaway: one step, then repeats
  let st = stickStep({ dir: null, t: 0 }, 0, -1, 1 / 60);
  ok(st.dir === "up", "stick step: up");
  let n = 0; for (let k = 0; k < 60; k++) { st = stickStep(st.rep, 0, -1, 1 / 60); if (st.dir) n++; }
  ok(n >= 3 && n <= 6, `stick step: held a second, it repeats (${n})`);
  ok(stickStep(st.rep, 0, 0, 1 / 60).dir === null, "stick step: let go, nothing");
  // rooms in a grid: right goes right, down goes down
  const grid = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 50 }, { x: 100, y: 50 }];
  ok(nearestInDir(grid[0], grid, "right") === 1 && nearestInDir(grid[0], grid, "down") === 2 && nearestInDir(grid[0], grid, "left") === -1, "nearest in a direction");
  // the presses, by mode (A, B, the bumpers, Start, Select)
  const edges = (pressed, id) => pressedSince(null, P([0, 0], pressed, id).held);
  ok(padActions(edges([0]), "browse").includes("tap"), "browse: A taps");
  ok(padActions(edges([1]), "browse").includes("back"), "browse: B backs");
  ok(padActions(edges([4]), "browse").includes("turnL") && padActions(edges([5]), "browse").includes("turnR"), "browse: LB / RB turn");
  ok(padActions(edges([11]), "browse").includes("fit"), "browse: the right-stick click fits");
  ok(padActions(edges([2]), "browse").includes("find") && padActions(edges([3]), "browse").includes("labels"), "browse: X finds, Y labels");
  ok(padActions(edges([8]), "browse").includes("view"), "browse: Select toggles the map");
  ok(padActions(edges([15]), "browse").includes("next") && padActions(edges([14]), "browse").includes("prev"), "browse: the d-pad steps buildings");
  ok(padActions(edges([0]), "rooms").includes("drill") && padActions(edges([0]), "items").includes("open"), "cutaway: A goes in, then opens");
  ok(padActions(edges([1]), "items").includes("out") && padActions(edges([1]), "rooms").includes("close"), "cutaway: B comes out, then closes");
  ok(padActions(edges([12]), "rooms").includes("move:up"), "cutaway: the d-pad moves between rooms");
  ok(padActions(edges([1]), "card")[0] === "closeCard" && padActions(edges([0]), "card").length === 0, "a card open: only B, to close it");
  ok(padActions(edges([13]), "find")[0] === "findDown" && padActions(edges([0]), "find")[0] === "findPick", "FIND: the d-pad chooses, A picks");
  ok(!padActions(edges([0], "Pro Controller (057e)"), "browse").includes("tap") && padActions(edges([1], "Pro Controller (057e)"), "browse").includes("tap"), "switch: A (right) taps, the bottom button does not");
  // Start toggles DRIVE YOURSELF (controlIso.js reads gamepad.driveToggle)
  ok(driveToggle(edges([9]), { hasSelf: true }) === "take", "Start: take control");
  ok(driveToggle(edges([9]), { hasSelf: false }) === null, "Start without a file: nothing");
  ok(driveToggle(edges([9]), { driving: true }) === "release" && driveToggle(edges([8]), { driving: true }) === "release", "driving: Start or Select releases");
  ok(driveToggle(edges([8]), { hasSelf: true }) === null, "browse: Select does not take control");
  ok(driveToggle(edges([9]), { hasSelf: true, card: true }) === null, "a card open: Start waits");

  // the whole loop through a view's hooks: A then A (name, then open), B back, the camera, the bumpers
  const log = [];
  let held = [], axes = [0, 0, 0, 0], driving = false;
  let pads = () => [pad("Xbox Wireless Controller (045e)", axes, held)];
  const mockNav = { getGamepads: () => pads() };
  const peekOrSel = { peek: null, sel: null };
  const H = {
    nav: mockNav, size: () => [400, 300], driving: () => driving, hasSelf: () => true, reduced: () => false, poke() {}, publish: (ui) => log.push(["ui", ui && ui.mode]), say() {},
    targets: () => [], hover: (x, y) => (x > 180 && x < 260 ? "THE DIVE" : null),
    tap: (x) => { if (x > 180 && x < 260) { if (peekOrSel.peek) { peekOrSel.sel = "the-dive"; peekOrSel.peek = null; } else peekOrSel.peek = "the-dive"; } log.push(["tap"]); },
    back: () => { log.push(["back"]); if (peekOrSel.peek) { peekOrSel.peek = null; return true; } return false; },
    pan: (dx, dy) => log.push(["pan", dx, dy]), zoom: (f) => log.push(["zoom", f]), turn: (d) => log.push(["turn", d]), fit: () => log.push(["fit"]), labels: () => log.push(["labels"]),
    prev: () => null, next: () => [220, 150], other: "MAP",
  };
  const B = makePadBrowse(H);
  let t = 1000;
  const frame = (pressed = [], ax = [0, 0, 0, 0]) => { held = pressed; axes.splice(0, 4, ...ax); t += 16; B.poll(t); };
  frame();
  ok(!B.active(), "a connected pad untouched: no cursor (the mouse keeps the city)");
  frame([], [0.1, 0.05, 0, 0]);
  ok(!B.active(), "a resting stick inside the dead zone does not wake it");
  frame([], [1, 0, 0, 0]);
  ok(B.active() && B.P.x > 200, `the left stick wakes the cursor and moves it right: ${B.P.x.toFixed(1)}`);
  for (let k = 0; k < 4; k++) frame([], [1, 0, 0, 0]);
  frame([0]); frame([]);
  ok(peekOrSel.peek === "the-dive" && !peekOrSel.sel, "A over a building: named, its chip up");
  frame([0]); frame([]);
  ok(peekOrSel.sel === "the-dive", "A again: opened");
  frame([0]); frame([0]); frame([]);
  ok(log.filter(e => e[0] === "tap").length === 3, "a held A is one press");
  peekOrSel.sel = null; peekOrSel.peek = "the-dive";
  frame([1]); frame([]);
  ok(peekOrSel.peek === null && log.some(e => e[0] === "back"), "B: back (the chip goes)");
  log.length = 0;
  frame([], [0, 0, 1, 0]); frame([], [0, 0, 1, 0]);
  const pans = log.filter(e => e[0] === "pan");
  ok(pans.length === 2 && pans.every(e => e[1] < 0 && e[2] === 0) && Math.abs(pans[1][1]) > Math.abs(pans[0][1]), "right stick: the camera pans that way, easing in");
  log.length = 0;
  frame([4]); frame([]); frame([5]); frame([]);
  { // a view mounting under a button still held (Select, through the switch to MAP) does not take it as a press
    const n0 = log.filter(e => e[0] === "labels").length;
    const B2 = makePadBrowse({ ...H, nav: { getGamepads: () => [pad("Xbox (045e)", [0, 0, 0, 0], [3])] } });
    B2.poll(5000); B2.poll(5016);
    ok(log.filter(e => e[0] === "labels").length === n0, "a button held through a view switch is not a press there"); }
  ok(JSON.stringify(log.filter(e => e[0] === "turn").map(e => e[1])) === "[-1,1]", "LB / RB: a quarter turn each way");
  log.length = 0;
  held = []; axes.splice(0, 4, 0, 0, 0, 0);
  pads = () => [{ ...pad("Xbox (045e)", axes, held), buttons: Array.from({ length: 17 }, (_, i) => (i === 7 ? { pressed: true, value: 1 } : btn(false))) }];
  t += 16; B.poll(t);
  ok(log.some(e => e[0] === "zoom" && e[1] > 1), "RT: zoom in");
  pads = () => [pad("Xbox Wireless Controller (045e)", axes, held)];
  log.length = 0;
  frame([15]); frame([]);
  ok(B.P.x === 220 && B.P.y === 150, "d-pad: the cursor jumps to the next building");
  frame([11]); frame([]); frame([3]); frame([]);
  ok(log.some(e => e[0] === "fit") && log.some(e => e[0] === "labels"), "RS click fits; Y toggles labels");
  // driving: the browse stands down, and the cursor is gone
  driving = true; log.length = 0;
  frame([0], [1, 0, 1, 0]); frame([]);
  ok(!B.active() && !log.some(e => e[0] === "tap" || e[0] === "pan"), "driving: the browse stands down");
  driving = false;
  frame([], [1, 0, 0, 0]);
  ok(B.active(), "released: the cursor comes back on the next push");
  // unplugged
  pads = () => [];
  t += 16; B.poll(t);
  ok(!B.active() && log[log.length - 1][0] === "ui" && log[log.length - 1][1] === null, "unplugged: the hint goes");
}

console.log(fails ? `check-control: ${fails} FAILED` : "check-control: ALL PASS");
process.exit(fails ? 1 : 0);
