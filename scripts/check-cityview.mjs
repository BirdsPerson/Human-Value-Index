// City view (isometric overview + building cutaway) checks. Pure node, no DOM.
//   node scripts/check-cityview.mjs
import { PLACES, BUILDINGS, JOBS, whereAt } from "../src/city/sim.js";
import { FAMOUS_FIGURES, slugify, TIERS } from "../src/figures.js";
import { poseOf, fitStature } from "../src/city/poses.js";
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

// The Loop in the iso view (2026-09-29, "the train kind of looks like shit"): a viaduct with
// rounded corners, articulated cars placed by their bogies, a station at every district.
// Cars stay on the deck through the corners, keep their count and spacing, never overlap,
// and are painted after the track under them but before any building in front of them.
{
  const SIM = await import("../src/city/sim.js");
  const G = await import("../src/city/loopGeo.js");
  const { COAST_LOTS, SPUR_STOPS } = await import("../src/city/coastGeo.js");
  const { slotForBox, DECK } = await import("../src/city/iso.js");
  const pitch = SIM.LOOP_LINE.carLen + SIM.LOOP_LINE.carGap;
  const sat = (A, B) => {   // convex quads overlap (separating axis), strictly
    for (const P of [A, B]) for (let i = 0; i < 4; i++) {
      const [ax, ay] = P[i], [bx, by] = P[(i + 1) % 4], nx = by - ay, ny = ax - bx;
      const pa = A.map(([x, y]) => x * nx + y * ny), pb = B.map(([x, y]) => x * nx + y * ny);
      if (Math.max(...pa) <= Math.min(...pb) + 1e-9 || Math.max(...pb) <= Math.min(...pa) + 1e-9) return false;
    }
    return true;
  };
  const lapH = SIM.LOOP_LINE.lapHours, T0 = 24 * 40;
  let off = 0, worst = 0, spacing = 0, overlap = 0, heading = 0, count = 0, inCorner = 0, samples = 0;
  const cornerNear = (x, y) => G.CORNERS.some(c => Math.hypot(x - c.x, y - c.y) < G.CORNER_ZONE + G.BOGIE + 0.01);
  const snaps = [];
  for (let i = 0; i < 600; i++) {
    const mt = T0 + (i / 600) * lapH;
    const trains = G.trainPoses(SIM.trainsAt(mt));
    snaps.push(trains);
    for (const t of trains) {
      if (t.cars.length !== SIM.TRAIN[t.id].cars || t.cars.length < 3 || t.cars.length > 4) count++;
      t.cars.forEach((c, k) => {
        samples++;
        const q = G.carCorners(c.pose);
        const edgeMids = q.map((p, j) => [(p[0] + q[(j + 1) % 4][0]) / 2, (p[1] + q[(j + 1) % 4][1]) / 2]);
        for (const [x, y] of [...q, ...edgeMids]) { const d = G.offTrack(x, y); worst = Math.max(worst, d); if (d > G.DECK_HW + 1e-6) off++; }
        if (cornerNear(c.pose.x, c.pose.y)) inCorner++;
        const tan = G.pathAt(c.s);
        if (tan.dx * c.pose.dx + tan.dy * c.pose.dy < 0.85) heading++;
        if (k) {
          const p = t.cars[k - 1].pose, d = Math.hypot(p.x - c.pose.x, p.y - c.pose.y);
          const straight = !cornerNear(p.x, p.y) && !cornerNear(c.pose.x, c.pose.y);
          if (straight ? Math.abs(d - pitch) > 1e-6 : d < 0.75 * pitch || d > pitch + 1e-6) spacing++;
          if (sat(G.carCorners(p), q)) overlap++;
        }
      });
    }
  }
  ok(count === 0, `every train keeps its 3-4 cars (${count} bad)`);
  ok(inCorner > 50, `the lap sample takes cars through the corners (${inCorner} car-samples)`);
  ok(off === 0, `car bodies stay on the deck through corners (${off} corners off; worst ${worst.toFixed(3)} of ${G.DECK_HW})`);
  ok(heading === 0, `cars point along the track (${heading} of ${samples} off)`);
  ok(spacing === 0, `car spacing = the sim's pitch on straights, at least 3/4 of it round a bend (${spacing} bad)`);
  ok(overlap === 0, `coupled cars never overlap (${overlap})`);
  const longest = Math.max(...SIM.TRAINS.map(t => t.length));
  ok(2 * G.PLAT_HL >= longest, `platforms (${2 * G.PLAT_HL}) take the longest train (${longest.toFixed(1)})`);

  // Painter's order against the buildings, all four quarter turns.
  const { rotRect, depthOrder } = await import("../src/city/iso.js");
  for (let r = 0; r < 4; r++) {
    // CityIso.buildGeo's footprints: each body and each yard prop (archGeo.isoItems)
    const { isoItems } = await import("../src/city/archGeo.js");
    const items = isoItems(r).map(it => ({ kind: it.kind, id: it.id, x0: it.x0, y0: it.y0, x1: it.x1, y1: it.y1 }));
    const loop = G.loopPieces(r);
    items.push(...loop);
    const inside = (a, b) => a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.y0 < b.y1 - 1e-9 && b.y0 < a.y1 - 1e-9;
    let clash = "";
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      if ((items[i].kind === "b" || items[i].kind === "y") && (items[j].kind === "b" || items[j].kind === "y")) continue;   // the architecture section checks these
      if (inside(items[i], items[j]) && !clash) clash = `${items[i].kind}${items[i].id || ""} x ${items[j].kind}${items[j].id || ""}`;
    }
    ok(!clash, `r=${r}: viaduct, corners and stations overlap no building or each other (${clash || "none"})`);
    ok(loop.filter(it => it.kind === "st").length === Object.keys(SIM.STATIONS).length, `r=${r}: a station item per STATIONS entry`);
    const order = depthOrder(items), pos = new Map(order.map((i, k) => [i, k]));
    let bad = "";
    for (const trains of snaps.filter((_, i) => i % 5 === 0)) for (const t of trains) for (const c of t.cars) {
      const B = G.carBox(c.pose, r);
      const slot = slotForBox(B, DECK + 0.05, items, order);
      items.forEach((b, i) => {
        const k = pos.get(i);
        if (b.kind === "b") {
          // only pairs whose screen columns (u - v) overlap can cover each other
          if (Math.min(B.x1 - B.y0, b.x1 - b.y0) - Math.max(B.x0 - B.y1, b.x0 - b.y1) <= 1e-6) return;
          const front = B.x1 <= b.x0 || B.y1 <= b.y0, behind = b.x1 <= B.x0 || b.y1 <= B.y0;
          if (front && !behind && k <= slot && !bad) bad = `${t.id} car ${c.index} over ${b.id} in front`;
          if (behind && !front && k > slot && !bad) bad = `${t.id} car ${c.index} under ${b.id} behind`;
        } else if (b.deck && inside(B, b) && k > slot && !bad) bad = `${t.id} car ${c.index} under the deck it rides`;
      });
    }
    ok(!bad, `r=${r}: cars paint after their deck, never over a building in front (${bad || "ok"})`);
  }
}

// Stature: every in-world figure is drawn to scale (sprites.statureOf), never through a
// room's ceiling; portraits and thumbnails stay uniform.
{
  const andre = { name: "André the Giant", height: 224, sex: "m" };
  ok(near(fitStature(andre, 200, 40), 224 / 176), "fitStature: André full height where the room allows");
  ok(fitStature(andre, 44, 40) < 224 / 176 && fitStature(andre, 44, 40) >= 1 && (44 - 2) / 40 >= fitStature(andre, 44, 40) - 1e-9, "fitStature: capped under the ceiling, never below 1");
  ok(near(fitStature({ height: 152 }, 10, 40), 152 / 176), "fitStature: short people are never capped");
  ok(fitStature({ kind: "citizen" }, 30, 40) === 1, "fitStature: citizens 1.0");
  const { readFileSync } = await import("node:fs");
  const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
  for (const f of ["Pen.jsx", "city/CityIso.jsx", "city/RoomStage.jsx", "city/Street.jsx", "city/CityMap.jsx", "city/City3D.jsx"])
    ok(/statureOf|fitStature/.test(src(f)), `${f} draws subjects to scale`);
  ok(!/statureOf|fitStature/.test(src("FilePhoto.jsx")) && !/statureOf/.test(src("city/cityUi.jsx")), "portraits and thumbnails stay uniform");
}

// The recreation ground (2026-09-29, "a baseball diamond and basketball courts, like a
// park"): three open lots in the Arena with a place for everyone on them. Every anchor is
// typed, on its own ground, clear of the others and of every building and the Loop; there
// are at least as many as the place holds; the staff have their posts; the fixtures keep
// score sensibly and the PA announces each one's start and finish. Since "we need a soccer
// field, though, too, and a football field": the Bowl's gridiron (the stadium, a building
// open to the sky) and the estate pitch (an open lot in the Sprawl) are checked the same way.
{
  const SIM = await import("../src/city/sim.js");
  const PG = await import("../src/city/parkGeo.js");
  const G = await import("../src/city/loopGeo.js");
  const { COAST_LOTS, SPUR_STOPS } = await import("../src/city/coastGeo.js");
  const lots = Object.keys(PG.PARK_LOTS);
  const HOME = { "the-diamond": "arena", "the-courts": "arena", "rec-ground": "arena", "the-bowl": "arena", "the-pitch": "sprawl" };
  for (const id of lots) {
    const b = SIM.BUILDING[id];
    ok(b && (SIM.OPEN_LOTS.has(id) || id === "the-bowl") && b.district === HOME[id], `${id}: ${id === "the-bowl" ? "the stadium" : "an open lot"} in ${HOME[id]}`);
    for (const o of SIM.BUILDINGS) if (o.id !== id) {
      const r = b.rect, q = o.rect;
      ok(!(r.x < q.x + q.w - 1e-9 && q.x < r.x + r.w - 1e-9 && r.y < q.y + q.h - 1e-9 && q.y < r.y + r.h - 1e-9), `${id} does not overlap ${o.id}`);
    }
    for (let r = 0; r < 4; r++) {
      const { rotRect } = await import("../src/city/iso.js");
      const R = rotRect(b.rect, r);
      const hit = G.loopPieces(r).find(it => it.x0 < R.x1 && R.x0 < it.x1 && it.y0 < R.y1 && R.y0 < it.y1);
      ok(!hit, `${id} r=${r}: clear of the viaduct, piers, stations and stairs (${hit ? hit.kind : "clear"})`);
    }
  }
  const solid = SIM.BUILDINGS.filter(b => !SIM.OPEN_LOTS.has(b.id));
  const ISO_ACTS = { shoot: "jump", dribble: "hustle", stroll: "amble" };
  for (const pid of PG.PARK_PLACES) {
    const P = SIM.PLACES[pid], R = P.rect, as = PG.PARK_ANCHORS[pid], own = P.building;
    ok(as.length >= P.cap, `${pid}: ${as.length} places on the ground for a capacity of ${P.cap}`);
    ok(new Set(as.map(a => a.id)).size === as.length, `${pid}: anchor ids unique`);
    ok(as.some(a => a.role === "staff"), `${pid}: a post for the staff`);
    for (const j of JOBS.filter(j => j.place === pid)) ok(as.some(a => a.role === "staff"), `job ${j.id} has a post at ${pid}`);
    for (const a of as) {
      ok(KINDS.has(a.kind) && ROLES.has(a.role), `${pid} ${a.id}: kind ${a.kind}, role ${a.role}`);
      for (const act of [a.act, ISO_ACTS[a.act]].filter(Boolean)) ok(["sit", "stand", "walk", "lie"].includes(poseOf(a, act)), `${pid} ${a.id}: ${act} has a pose`);
      const pts = a.ring ? [0, 1, 2, 3].map(k => [a.ring.cx + a.ring.r * Math.cos(k * Math.PI / 2), a.ring.cy + a.ring.r * Math.sin(k * Math.PI / 2)]) : [[a.x, a.y]];
      for (const [x, y] of pts) {
        ok(x > R.x + 0.1 && x < R.x + R.w - 0.1 && y > R.y + 0.1 && y < R.y + R.h - 0.1, `${pid} ${a.id}: on its own ground (${x.toFixed(2)}, ${y.toFixed(2)})`);
        ok(!solid.some(o => o.id !== own && x > o.rect.x && x < o.rect.x + o.rect.w && y > o.rect.y && y < o.rect.y + o.rect.h), `${pid} ${a.id}: not inside another building`);
      }
    }
    // nobody stands on anybody: fixed anchors at the same height keep a body's width apart
    const fixed = as.filter(a => !a.ring);
    let close = "";
    for (let i = 0; i < fixed.length; i++) for (let j = i + 1; j < fixed.length; j++) {
      const A = fixed[i], B = fixed[j];
      if (Math.abs(A.h - B.h) < 0.05 && Math.hypot(A.x - B.x, A.y - B.y) < 0.44 && !close) close = `${A.id}/${B.id}`;
    }
    ok(!close, `${pid}: anchors keep apart (${close || "ok"})`);
    // ordered fill: with three people on the diamond it is a battery and a batter, not three outfielders
    if (pid === "ball-field") {
      const three = [0, 1, 2].map(i => ({ key: `p${i}`, role: "patron" }));
      const { at } = assignAnchors(as, three, null, 18, true);
      ok([...at.values()].map(i => as[i].id).sort().join() === "batter,catcher,pitcher", "three on the diamond: pitcher, catcher, batter");
      const ump = assignAnchors(as, [{ key: "u", role: "staff" }], null, 18, true).at.get("u");
      ok(as[ump].id === "umpire", "the umpire takes the plate");
      // a corner ballpark ("the first-base foul line should be against the basketball court
      // fence and the park"): home plate in a corner of the lot, the first-base line along the
      // edge shared with the Courts and the Recreation Ground, the third-base line along the
      // other edge, seats beyond the outfield wall, the scoreboard behind them
      const D = PG.DIAMOND, [hx, hy] = D.home, corners = [[R.x, R.y], [R.x + R.w, R.y], [R.x, R.y + R.h], [R.x + R.w, R.y + R.h]];
      const near = corners.map(c => Math.hypot(c[0] - hx, c[1] - hy)).sort((a, b) => a - b);
      ok(near[0] < 4.2 && near[1] > 2 * near[0], `home plate sits at a lot corner (${near[0].toFixed(2)} cells from it)`);
      const [, fb] = D.foul[0], [, tb] = D.foul[1], south = R.y + R.h;
      const C = SIM.PLACES.courts.rect, G2 = SIM.PLACES["rec-park"].rect;
      ok(Math.abs(fb[1] - hy) < 1e-6 && fb[0] > hx && south - hy < 2.6, `the first-base line runs east along the south edge, ${(south - hy).toFixed(2)} cells in`);
      ok(C.y === south && G2.y === south && C.x <= hx && G2.x + G2.w >= fb[0], "that edge is the Courts' fence and the Recreation Ground");
      ok(Math.abs(tb[0] - hx) < 1e-6 && tb[1] < hy && hx - R.x < 3.2 && tb[1] > R.y, "the third-base line runs north along the west edge, inside the lot");
      const beyond = as.filter(a => a.id.startsWith("of") && Math.hypot(a.x - hx, a.y - hy) > D.fenceR + 0.3);
      ok(beyond.length >= 20 && beyond.length === as.filter(a => a.id.startsWith("of")).length, `${beyond.length} seats in the outfield bleachers, all beyond the wall`);
      ok(Math.hypot(D.board.c[0] - hx, D.board.c[1] - hy) > Math.max(...beyond.map(a => Math.hypot(a.x - hx, a.y - hy))), "the scoreboard stands behind the outfield bleachers");
      ok(D.stands.every(s => s.foot.every(([x, y]) => x > R.x + 0.1 && x < R.x + R.w - 0.1 && y > R.y + 0.1 && y < R.y + R.h - 0.1)), "every stand inside the lot");
      const fill = [...assignAnchors(as, [...Array(P.cap)].map((_, i) => ({ key: `f${i}`, role: "any" })), null, 18.5, true).at.values()].map(i => as[i].id);
      ok(fill.some(id => id.startsWith("of")) && fill.some(id => id.startsWith("hs") || id.startsWith("hw")), `a full house has fans behind the plate and beyond the wall (${fill.filter(id => id.startsWith("of")).length} out there)`);
    }
    // the gridiron and the pitch: every player on the field in a side's colour, facing the play;
    // a few people make a drill, not a crowd in the stands
    if (pid === "stadium" || pid === "pitch") {
      const F = pid === "stadium" ? PG.BOWL.field : PG.PITCH.p;
      const players = as.filter(a => a.team != null && a.kind === "stand" && !["kicker"].includes(a.id));
      ok(players.length === (pid === "stadium" ? 22 : 14), `${pid}: ${players.length} players on the field (${pid === "stadium" ? "eleven" : "seven"} a side)`);
      ok(players.every(a => a.x > F.x0 && a.x < F.x1 && a.y > F.y0 && a.y < F.y1 && a.look), `${pid}: every player inside the lines, facing somewhere`);
      ok([0, 1].every(t => players.filter(a => a.team === t).length === players.length / 2), `${pid}: two even sides`);
      const few = [0, 1, 2].map(i => ({ key: `p${i}`, role: "patron" }));
      const got = [...assignAnchors(as, few.slice(0, pid === "stadium" ? 3 : 2), null, 15, true).at.values()].map(i => as[i].id).sort().join();
      ok(got === (pid === "stadium" ? "c,qb,wr1" : "a-m2,b-m2"), `${pid}: the first few make a drill (${got})`);
      const ref = assignAnchors(as, [{ key: "r", role: "staff" }], null, 15, true).at.get("r");
      ok(as[ref].id === "ref", `${pid}: the referee takes the referee's post`);
      // a sporting visitor takes the field before a spectator who got there first by key
      const two = assignAnchors(as, [{ key: "a", role: "patron" }, { key: "z", role: "patron", pri: -1 }], null, 15, true).at;
      ok(two.get("z") === 0, `${pid}: the sporting are placed first`);
      ok(as.filter(a => a.role === "staff").length >= 3, `${pid}: officials' posts (${as.filter(a => a.role === "staff").map(a => a.id).join(", ")})`);
    }
  }
  // who plays: a footballer on shift at the pitch plays; a referee on shift keeps their post
  {
    const pele = { slug: "pele-test", name: "Test Footballer", qualifier: "brazilian footballer", tier: "RETAINED SPECIALIST", warmth: 60, competence: 70 };
    const job = SIM.assignJob(pele);
    ok(job.jobId === "club-footballer", `a footballer is drafted to the estate pitch (${job.jobId})`);
    const fr = PG.fieldRole(pele, { activity: "work", placeId: "pitch" });
    ok(fr.role === "patron" && fr.pri === -2, "a footballer on shift plays, first");
    ok(SIM.fieldsOf({ qualifier: "american football player" }).gridiron && !SIM.fieldsOf({ qualifier: "american football player" }).soccer, "American football reads as gridiron, not soccer");
    ok(SIM.fieldsOf({ qualifier: "english footballer" }).soccer, "a footballer reads as soccer");
    ok(PG.fieldRole({ slug: "x", name: "X", qualifier: "judge" }, { activity: "leisure" }).pri === 0, "a non-sporting visitor waits their turn");
  }
  // the fixtures
  const wk = 24 * 7 * 30;
  let games = 0, bad = "";
  for (let h = 0; h < 24 * 7; h += 0.05) for (const pid of Object.keys(SIM.GAMES)) {
    const g = SIM.gameAt(pid, wk + h);
    if (!g) continue;
    games++;
    if (g.kind === "ball" && !(g.inning >= 1 && g.inning <= 9 && g.score.every(n => n >= 0 && n < 40))) bad = `${pid} ${h}`;
    if (g.kind === "hoops" && !(g.score[0] <= 21 && g.score[1] <= g.score[0])) bad = `${pid} ${h}`;
    if (g.kind === "gridiron" && !g.practice && !(g.quarter >= 1 && g.quarter <= 4 && g.score.every(n => n >= 0 && n <= 70) && g.down >= 1 && g.down <= 4)) bad = `${pid} ${h}`;
    if (g.kind === "gridiron" && g.practice && g.score !== null) bad = `${pid} practice keeps score at ${h}`;
    if (g.kind === "soccer" && !(g.minute >= 1 && g.minute <= 91 && g.score.every(n => n >= 0 && n <= 10))) bad = `${pid} ${h}`;
    if (!(typeof g.label === "string" && g.label.length <= 14 && g.label === g.label.toUpperCase())) bad = `${pid} label ${g.label}`;
    const later = SIM.gameAt(pid, wk + h + 0.04);
    if (later && later.score && g.score && later.kind !== "hoops" && later.day === g.day && later.from === g.from && (later.score[0] < g.score[0] || later.score[1] < g.score[1])) bad = `${pid} a score came off the board at ${h}`;
  }
  ok(games > 100 && !bad, `fixtures keep score (${bad || games + " samples"})`);
  const evs = SIM.gameEvents(wk, wk + 24 * 7), ends = evs.filter(e => e.kind !== "score");
  const want = Object.values(SIM.GAMES).reduce((n, list) => n + list.reduce((m, g) => m + g.days.length * 2, 0), 0);
  ok(ends.length === want && evs.every(e => /[A-Z]/.test(e.text) && e.text === e.text.toUpperCase()), `the PA calls every first pitch, kickoff and final whistle (${ends.length} of ${want})`);
  // every score the PA calls is a change on the board, and every change on the board is called
  let calls = "";
  for (const pid of ["stadium", "pitch"]) {
    const mine = evs.filter(e => e.kind === "score" && e.placeId === pid);
    let changes = 0;
    for (let h = 0; h < 24 * 7; h += 0.01) { const a = SIM.gameAt(pid, wk + h), b = SIM.gameAt(pid, wk + h + 0.01); if (a?.score && b?.score && a.from === b.from && a.day === b.day && a.score.join() !== b.score.join()) changes++; }
    for (const e of mine) { const a = SIM.gameAt(pid, e.t - 1e-4), b = SIM.gameAt(pid, e.t + 1e-4); if (!(a && b && a.score.join() !== b.score.join())) calls = `${pid} called a score at ${(e.t - wk).toFixed(2)} that did not change the board`; }
    if (!calls && mine.length !== changes) calls = `${pid}: ${mine.length} calls for ${changes} changes`;
  }
  ok(!calls, `the PA calls every touchdown, field goal and goal (${calls || "ok"})`);
  const weekend = ["stadium", "pitch"].map(pid => [...Array(7)].filter((_, d) => [6, 7].includes(d + 1) && SIM.gameAt(pid, wk + d * 24 + 18)).length);
  ok(weekend.every(n => n >= 1), `the Bowl and the pitch each have a weekend fixture on at 18:00 (${weekend.join(", ")} days)`);
  const fixture = [...Array(7)].map((_, d) => SIM.gameAt("ball-field", wk + d * 24 + 18.5)).filter(Boolean).length;
  ok(fixture >= 2, `the Diamond has an evening fixture on ${fixture} days a week`);
  console.log(`  recreation ground: ${PG.PARK_PLACES.map(id => `${id} ${PG.PARK_ANCHORS[id].length} anchors`).join(", ")}; ${games} fixture samples, ${evs.length} PA calls a week`);
}

// Architecture (the building design pass, 2026-09-29: "different buildings that look
// differently, like big low-income housing projects versus high-income high-rises"). Every
// building has a style with a massing and a drawer; housing follows the tier of the people
// who live there; bodies and yard props stay in their lots, off the pavement, off each other
// and off the Loop at every quarter turn; stacked parts paint bottom first.
{
  const SIM = await import("../src/city/sim.js");
  const A = await import("../src/city/archGeo.js");
  const { DRAWN_STYLES, DRAWN_PROPS } = await import("../src/city/archDraw.js");
  const { rot, rotRect } = await import("../src/city/iso.js");
  const G = await import("../src/city/loopGeo.js");
  const { COAST_LOTS, SPUR_STOPS } = await import("../src/city/coastGeo.js");
  for (const b of SIM.BUILDINGS) {
    ok(b.arch && A.STYLES[b.arch], `${b.id}: has a style (${b.arch})`);
    if (A.GROUND_STYLES.has(b.arch)) { ok(SIM.OPEN_LOTS.has(b.id) || b.id === "the-bowl" || COAST_LOTS[b.id], `${b.id}: a ground style is open ground (or the Coast's and the Heights' own, coastGeo.js)`); continue; }
    const m = A.massingOf(b);
    ok(m && m.parts.length > 0, `${b.id}: ${b.arch} has a massing`);
    ok(DRAWN_STYLES.has(b.arch), `${b.id}: ${b.arch} has a drawer`);
    if (!m) continue;
    const L = b.rect, K = A.KERB - 1e-9;
    const inLot = (o) => o.x0 >= L.x + K && o.y0 >= L.y + K && o.x1 <= L.x + L.w - K && o.y1 <= L.y + L.h - K;
    ok(inLot(m.box), `${b.id}: the body (and its stoops, canopies, awnings) stays off the pavement`);
    for (const g of m.ground) ok(g.x0 >= L.x - 1e-9 && g.y0 >= L.y - 1e-9 && g.x1 <= L.x + L.w + 1e-9 && g.y1 <= L.y + L.h + 1e-9, `${b.id}: ground ${g.k} inside the lot`);
    const over = (a, c) => a.x0 < c.x1 - 1e-9 && c.x0 < a.x1 - 1e-9 && a.y0 < c.y1 - 1e-9 && c.y0 < a.y1 - 1e-9;
    for (const p of m.yard) {
      ok(DRAWN_PROPS.has(p.k), `${b.id}: yard prop ${p.k} has a drawer`);
      ok(inLot(p), `${b.id}: ${p.k}${p.i} stays off the pavement`);
      ok(!over(p, m.box), `${b.id}: ${p.k}${p.i} stands clear of the body`);
      for (const q of m.yard) if (q.i > p.i) ok(!over(p, q), `${b.id}: ${p.k}${p.i} and ${q.k}${q.i} do not overlap`);
    }
    // a part stacked on another paints after it, at every turn
    for (let r = 0; r < 4; r++) {
      const ord = A.partOrder(m.parts, rot, r), pos = new Map(ord.map((i, k) => [i, k]));
      m.parts.forEach((p, i) => m.parts.forEach((q, j) => { if (i !== j && over(p, q) && p.h1 <= q.h0 + 1e-9) ok(pos.get(i) < pos.get(j), `${b.id} r=${r}: part ${i} under part ${j} paints first`); }));
    }
  }
  // no two boxes in the iso view overlap: bodies, props and the viaduct, all four turns
  for (let r = 0; r < 4; r++) {
    const items = [...A.isoItems(r), ...G.loopPieces(r), ...SPUR_STOPS.map(st => ({ kind: "b", id: st.id, ...rotRect({ x: st.box.x0, y: st.box.y0, w: st.box.x1 - st.box.x0, h: st.box.y1 - st.box.y0 }, r) }))];
    let clash = "";
    const over = (a, c) => a.x0 < c.x1 - 1e-9 && c.x0 < a.x1 - 1e-9 && a.y0 < c.y1 - 1e-9 && c.y0 < a.y1 - 1e-9;
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      if (items[i].kind !== "b" && items[i].kind !== "y" && items[j].kind !== "b" && items[j].kind !== "y") continue;   // track vs track: checked above
      if (over(items[i], items[j]) && !clash) clash = `${items[i].id || items[i].kind} x ${items[j].id || items[j].kind}`;
    }
    ok(!clash, `r=${r}: no building, yard prop or piece of the Loop overlaps another (${clash || "none"})`);
  }
  // housing follows tier: everyone's home is in a housing style whose band holds their tier
  const pop = [...FAMOUS_FIGURES.map(f => ({ ...f, slug: slugify(f.name) })),
    ...Array.from({ length: 600 }, (_, i) => ({ slug: `h-${i}`, name: `H ${i}`, tier: TIERS[i % TIERS.length].label, died: i % 3 === 0 ? "1900-01-01" : null }))];
  let bad = "";
  const seen = {};
  for (const s of pop) {
    const home = SIM.homeOf(s), b = SIM.BUILDING[SIM.PLACES[home].building], t = SIM.TIER_ORDER.indexOf(SIM.tierOf(s));
    const band = SIM.HOUSING_TIERS[b.arch];
    if (!band || !band.includes(t)) bad ||= `${s.slug} (${SIM.tierOf(s)}) lives in ${b.id} (${b.arch})`;
    (seen[b.arch] ||= new Set()).add(t);
  }
  ok(!bad, `housing follows the tier of its residents (${bad || "all " + pop.length}): ${Object.entries(seen).map(([k, v]) => `${k} ${[...v].sort().join("")}`).join(", ")}`);
  for (const [style, band] of Object.entries(SIM.HOUSING_TIERS)) ok(band.every(t => seen[style]?.has(t)), `${style}: every tier of its band lives there`);
  for (const p of Object.values(SIM.PLACES)) if (p.kind === "home") ok(SIM.HOUSING_TIERS[SIM.BUILDING[p.building].arch], `home ${p.id} is in a housing style`);
  ok(SIM.BUILDING.hq.arch === "monolith" && SIM.BUILDING["the-meridian"].arch === "glass" && SIM.BUILDING["hab-a"].arch === "projects", "HQ is the monolith, the top tier's glass tower, the projects");
  console.log(`  architecture: ${new Set(SIM.BUILDINGS.map(b => b.arch)).size} styles over ${SIM.BUILDINGS.length} buildings, ${SIM.BUILDINGS.reduce((n, b) => n + (A.massingOf(b)?.yard.length || 0), 0)} yard props`);
}

console.log(fails ? `check-cityview: ${fails} FAILED` : "check-cityview: ok");
process.exit(fails ? 1 : 0);
