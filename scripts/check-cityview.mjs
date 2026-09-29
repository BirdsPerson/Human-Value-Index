// City view (isometric overview + building cutaway) checks. Pure node, no DOM.
//   node scripts/check-cityview.mjs
import { PLACES, BUILDINGS, JOBS, whereAt } from "../src/city/sim.js";
import { FAMOUS_FIGURES, slugify, TIERS } from "../src/figures.js";
import { poseOf } from "../src/city/poses.js";
import { rot, unrot, project, unproject, screenToMap, depthOrder, slotFor, lodFor, LOD_MID, LOD_NEAR, mod4 } from "../src/city/iso.js";
import { ROOM_TYPE, DRAWN_TYPES, PLANNED_TYPES, PROP, anchorsFor, roomPlan, typeOf, assignAnchors, roleOf, actAt, isNight, LEISURE_ACTS } from "../src/city/props.js";

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


// 6. Anchor typing: every anchor says what it is, who it is for and what they do there;
//    furniture named by a plan exists; walkers keep inside their own module.
const KINDS = new Set(["seat", "station", "stand", "bed", "counter"]), ROLES = new Set(["staff", "patron", "rest", "any"]);
for (const t of new Set(Object.values(ROOM_TYPE))) ok(PLANNED_TYPES.includes(t), `room type ${t} has a plan`);
for (const type of PLANNED_TYPES) for (const [w, h, sw] of [[300, 120, 32], [916, 120, 32], [470, 188, 43], [320, 80, 34], [60, 30, 32]]) {
  const plan = roomPlan(type, w, h, sw);
  ok(plan.anchors.length >= 1, `${type} ${w}x${h} plan has an anchor`);
  for (const row of plan.rows) {
    if (row.span) ok(!!PROP[row.span.prop] && row.span.x0 >= 0 && row.span.x1 <= w, `${type}: row span ${row.span.prop} drawn and inside`);
    let last = -Infinity;
    for (const it of row.items) {
      ok(it.x0 >= last - 1e-6, `${type} ${w}x${h} modules in order`); last = it.x1;
      ok(it.x0 >= -1e-6 && it.x1 <= w + 1e-6, `${type} ${w}x${h} module inside the room`);
      if (it.prop) ok(!!PROP[it.prop], `${type}: prop ${it.prop} is drawn`);
      const a = it.a;
      if (!a) continue;
      ok(KINDS.has(a.kind), `${type} anchor kind ${a.kind}`);
      ok(ROLES.has(a.role), `${type} anchor role ${a.role}`);
      ok(typeof a.act === "string" && a.act.length > 0, `${type} anchor has an act`);
      ok(["sit", "stand", "walk", "lie"].includes(poseOf(a, actAt(a, 3))) && ["sit", "stand", "walk", "lie"].includes(poseOf(a, actAt(a, 12))), `${type} ${a.act} has a pose`);
      const half = sw * a.s / 2, lo = a.walk ? a.walk[0] : a.x, hi = a.walk ? a.walk[1] : a.x;
      // the whole footprint (every point of a walk) stays inside the module: nobody overlaps
      if (it.x1 - it.x0 >= sw * a.s - 1e-6) ok(lo - half >= it.x0 - 1e-6 && hi + half <= it.x1 + 1e-6, `${type} ${w}x${h} ${a.act} stays in its module`);
    }
  }
}
// Every job's room has stations for its staff; every home has beds; bars keep a bartender.
for (const j of JOBS) ok(roomPlan(typeOf(j.place), 916, 120, 32).anchors.some(a => a.role === "staff" || a.role === "any"), `job ${j.id}: ${j.place} has staff stations`);
for (const id of Object.keys(PLACES)) if (PLACES[id].kind === "home") ok(roomPlan(typeOf(id), 916, 120, 32).anchors.some(a => a.kind === "bed"), `home ${id} has bunks`);
ok(roomPlan("bar", 300, 50, 32).anchors.some(a => a.role === "staff" && a.act === "pour"), "a shallow bar keeps its bartender");

// 7. Capacity: in the building view (one row per floor, 1440 wide) every room has exactly one
//    place for each of its floor's share of capacity: a full room looks full. (District tiles show a whole place in one box and
//    badge the rest: +K.) HQ is not shown.
for (const b of BUILDINGS) if (b.id !== "hq") for (const f of b.floors) for (const pid of f.places) {
  const per = Math.round(PLACES[pid].cap / PLACES[pid].floors.length);
  const w = (980 - 46) / f.places.length - 18;
  const n = roomPlan(typeOf(pid), w, 120, 32, per).anchors.length;
  ok(n === per, `${b.id} ${f.code} ${pid}: ${n} places for the floor's ${per}`);
}

// 8. Assignment, in the abstract: one person per anchor, staff first to stations, visitors
//    never behind the counter, overflow only when nothing suitable is free, and a newcomer
//    moves nobody already seated.
{
  const plan = roomPlan("bar", 460, 150, 32);
  const staffN = plan.anchors.filter(a => a.role === "staff").length;
  const ppl = [...Array(3)].map((_, i) => ({ key: `s${i}`, role: "staff" })).concat([...Array(40)].map((_, i) => ({ key: `p${i}`, role: "patron" })));
  const { at, overflow } = assignAnchors(plan.anchors, ppl);
  ok(new Set(at.values()).size === at.size, "no two people share an anchor");
  ok(at.size + overflow.length === ppl.length, "everyone is placed or overflow");
  for (const [k, i] of at) if (k.startsWith("p")) ok(plan.anchors[i].role !== "staff", `patron ${k} not behind the counter`);
  for (const [k, i] of at) if (k.startsWith("s")) ok(plan.anchors[i].role === "staff", `bartender ${k} at a staff station`);
  const patronSeats = plan.anchors.filter(a => a.role !== "staff").length;
  ok(overflow.length === 40 - patronSeats, `overflow is exactly the patrons without a seat (${overflow.length})`);
  ok(staffN >= 3, "the bar has room for its shift");
  const few = ppl.filter(p => p.key < "p5" || p.key.startsWith("s"));
  const a1 = assignAnchors(plan.anchors, few).at;
  const a2 = assignAnchors(plan.anchors, few.concat([{ key: "p00new", role: "patron" }]), a1).at;
  for (const [k, i] of a1) ok(a2.get(k) === i, `newcomer moves nobody (${k})`);
  const hab = roomPlan("hab", 916, 120, 32);
  const beds = hab.anchors.filter(a => a.kind === "bed").length;
  const res = [...Array(beds)].map((_, i) => ({ key: `r${i}`, role: "rest" }));
  const night = assignAnchors(hab.anchors, res, null, 2).at;
  ok([...night.values()].every(i => hab.anchors[i].kind === "bed"), "at night residents are in their bunks");
  const day = assignAnchors(hab.anchors, res, night, 14).at;
  ok([...day.values()].length === beds, "by day the same residents are all placed");
  ok(actAt(hab.anchors.find(a => a.kind === "bed"), 2) === "sleep" && actAt(hab.anchors.find(a => a.kind === "bed"), 14) === "rest", "bunks sleep at night, are sat on by day");
  ok(isNight(23) && isNight(3) && !isNight(12), "night is 22:00-07:00");
}

// 9. Activity assignment against the live sim: a production-shaped roster through whereAt at
//    four hours; per room, on the building view's plan: workers on shift at stations (as far
//    as the room has stations), visitors in seats, residents in bunks at night.
{
  const pop = FAMOUS_FIGURES.map(f => ({ ...f, slug: slugify(f.name) }))
    .concat([...Array(160)].map((_, i) => ({ slug: `citizen-${i}`, name: `Citizen ${i}`, tier: TIERS[(i * 7) % TIERS.length].label, score: 500, warmth: (i * 37) % 100, competence: (i * 53) % 100, kind: "citizen" })));
  let placed = 0, staffAtStation = 0, staffTotal = 0, restNight = 0, restInBed = 0, seatedVisitors = 0, visitors = 0;
  for (const hour of [3, 10, 15, 21]) {
    const mt = 24 * 3 + hour + 0.25;
    const rooms = new Map();
    for (const s of pop) {
      const w = whereAt(s, mt);
      if (w.activity === "commute" || !w.buildingId || w.buildingId === "hq") continue;
      const k = `${w.buildingId}|${w.floor}|${w.placeId}`;
      (rooms.get(k) || rooms.set(k, []).get(k)).push({ key: s.slug, role: roleOf(w) });
    }
    for (const [k, people] of rooms) {
      const [bid, fl, pid] = k.split("|");
      const nPlaces = BUILDINGS.find(b => b.id === bid).floors[+fl].places.length;
      const plan = roomPlan(typeOf(pid), (980 - 46) / nPlaces - 18, 120, 32, Math.round(PLACES[pid].cap / PLACES[pid].floors.length));
      const { at, overflow } = assignAnchors(plan.anchors, people, null, hour);
      ok(new Set(at.values()).size === at.size, `${k} @${hour}: one per anchor`);
      placed += at.size;
      // a work anchor: the staff's own, or an open one that is a station or a stand (an easel, a
      // typewriter, the pitch), not a seat or a bunk
      const work = (a) => a.role === "staff" || (a.role === "any" && a.kind !== "seat" && a.kind !== "bed");
      const stations = plan.anchors.filter(work).length;
      const staff = people.filter(p => p.role === "staff");
      staffTotal += staff.length;
      const onSt = staff.filter(p => at.has(p.key) && work(plan.anchors[at.get(p.key)])).length;
      ok(onSt === Math.min(staff.length, stations), `${k} @${hour}: workers take the stations (${onSt}/${staff.length}, ${stations} stations)`);
      // and every placed worker is working: no worker on shift runs a leisure loop
      const working = staff.filter(p => at.has(p.key) && !LEISURE_ACTS.has(actAt(plan.anchors[at.get(p.key)], hour, "staff", plan.type))).length;
      ok(working === staff.filter(p => at.has(p.key)).length, `${k} @${hour}: every worker on shift is working`);
      staffAtStation += working;
      for (const p of people) if (p.role === "patron" && at.has(p.key)) { visitors++; const a = plan.anchors[at.get(p.key)]; ok(a.role !== "staff", `${k}: visitor not at a staff station`); if (a.kind === "seat" || a.kind === "bed") seatedVisitors++; }
      if (isNight(hour)) for (const p of people) if (p.role === "rest") { restNight++; if (at.has(p.key) && plan.anchors[at.get(p.key)].kind === "bed") restInBed++; }
      ok(overflow.length <= Math.max(0, people.length - plan.anchors.filter(a => a.role !== "staff").length), `${k} @${hour}: overflow only when full`);
    }
  }
  ok(placed > 100, `the sim puts people in rooms (${placed})`);
  ok(staffAtStation / staffTotal > 0.95, `workers on shift working (placed and on a job loop): ${staffAtStation}/${staffTotal}`);
  ok(restNight === 0 || restInBed / restNight > 0.95, `residents asleep at night: ${restInBed}/${restNight}`);
  console.log(`  activity: ${staffAtStation}/${staffTotal} workers working, ${seatedVisitors}/${visitors} visitors seated, ${restInBed}/${restNight} residents in bunks at night`);
}

// 10. Nobody walks through a building they are not going into or coming out of
// (2026-09-29: 12.6% of walking samples were inside a third building). Footpaths go
// round the blocks, through the streets.
{
  const SIM = await import("../src/city/sim.js");
  const { baseRoster } = await import("../src/city/roster.js");
  const roster = baseRoster();
  SIM.setRoster(roster);
  const solid = SIM.BUILDINGS.filter(b => !SIM.OPEN_LOTS.has(b.id)).map(b => ({ id: b.id, x0: b.rect.x + 0.4, y0: b.rect.y + 0.4, x1: b.rect.x + b.rect.w - 0.4, y1: b.rect.y + b.rect.h - 0.4 }));
  const T0 = 24 * 40;
  let n = 0, bad = 0, eg = "";
  for (let m = 0; m < 24 * 60; m += 3) for (const sub of roster) {
    const w = SIM.whereAt(sub, T0 + m / 60);
    if (w.activity !== "commute" || w.sub !== "walking") continue;
    n++;
    const own = new Set([SIM.PLACES[w.placeId]?.building, SIM.PLACES[w.fromPlaceId]?.building]);
    const hit = solid.find(o => !own.has(o.id) && w.x > o.x0 && w.x < o.x1 && w.y > o.y0 && w.y < o.y1);
    if (hit) { bad++; if (!eg) eg = `${SIM.keyOf(sub)} ${w.fromPlaceId}->${w.placeId} inside ${hit.id}`; }
  }
  ok(n > 100 && bad === 0, `walkers stay out of third buildings (${bad} of ${n} samples${eg ? `, e.g. ${eg}` : ""})`);
  const p = SIM.footpath({ x: 0, y: 4.5 }, { x: 26, y: 4.5 });
  ok(p.length > 2, "a walk across Arts goes round the studio block, not through it");
}

// 11. The city page must not scroll itself (2026-09-29: ChipStrip called scrollIntoView on
// every render and dragged #city down to the ledger once a second).
{
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../src/ui/components.jsx", import.meta.url), "utf8");
  const chip = src.slice(src.indexOf("export function ChipStrip"), src.indexOf("// Meter:"));
  ok(!/scrollIntoView/.test(chip.replace(/\/\/.*$/gm, "")), "ChipStrip scrolls only itself, never the page");
  const iso = fs.readFileSync(new URL("../src/city/CityIso.jsx", import.meta.url), "utf8");
  ok(!/drawTrains\(/.test(iso), "train cars are slotted by depth, not painted over the buildings afterwards");
}

console.log(fails ? `check-cityview: ${fails} FAILED` : "check-cityview: ok");
process.exit(fails ? 1 : 0);
