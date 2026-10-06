// City v2 3D view checks (src/city/city3d.js). Pure node, no DOM.
//   node scripts/check-city3d.mjs
import { FAMOUS_FIGURES, slugify } from "../src/figures.js";
import { whereAt, machineClock, DISTRICTS, PLACES } from "../src/city/sim.js";
import {
  BUILDINGS, BUILDING, PLACE_HOME, STATIONS, LIVE_BUILDINGS, LIVE_TRAINS, locate, trains, carArc, loopAt, LOOP_LENGTH,
  buildScene, viewFor, P, depthOf, panTarget, pointInPoly, hull, subjectPoint, buildingHref, parseCityRoute,
  floorHeight, levelOf, toWorld, REST3D, clampPitch3, PITCH_MIN, PITCH_MAX, carDepth, SEG, CAR_LEN, LOOP_H, floorLabel,
} from "../src/city/city3d.js";

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log(`  FAIL ${m}`); } return c; };
console.log(`sim exports: BUILDINGS ${LIVE_BUILDINGS ? "live" : "STUB"}, trainsAt ${LIVE_TRAINS ? "live" : "STUB"}`);

console.log("== buildings");
ok(BUILDINGS.length >= DISTRICTS.length, `at least one building per district (${BUILDINGS.length})`);
for (const d of DISTRICTS) ok(BUILDINGS.some(b => b.districtId === d.id), `district ${d.id} has a building`);
for (const b of BUILDINGS) {
  ok(b.floors.length >= 1 && b.floors.length <= (b.id === "the-surfside" ? 8 : 6), `${b.id} has 1-6 floors (${b.floors.length}; the Shore Plaza 8)`);
  ok(b.rect.w > 0 && b.rect.h > 0, `${b.id} has a footprint`);
  const d = DISTRICTS.find(x => x.id === b.districtId).rect;
  ok(b.rect.x >= d.x - 0.01 && b.rect.y >= d.y - 0.01 && b.rect.x + b.rect.w <= d.x + d.w + 0.01 && b.rect.y + b.rect.h <= d.y + d.h + 0.01, `${b.id} sits inside ${b.districtId}`);
}
for (const pid in PLACES) ok(PLACE_HOME[pid] && BUILDING[PLACE_HOME[pid].buildingId], `place ${pid} belongs to a building`);
ok(BUILDING["hq-tower"] ? BUILDING["hq-tower"].floors.length === 6 : BUILDINGS.some(b => b.districtId === "hq" && b.floors.length === 6), "HQ is the six-floor building");
ok(STATIONS.length === DISTRICTS.filter(d => !d.expansion).length, `one station per Loop district (${STATIONS.length}); the Coast and the Heights ride a spur`);

console.log("== subjects land on a floor of their building");
const roster = FAMOUS_FIGURES.map(f => ({ ...f, slug: slugify(f.name) }));
let placed = 0, transit = 0;
for (const h of [3, 8, 10.2, 15.6, 22]) {
  for (const s of roster) {
    const w = whereAt(s, h);
    const loc = locate(s, w);
    const pt = subjectPoint(s, w, loc, () => 0, () => null);
    ok(pt.every(Number.isFinite), `${s.name} at ${h} has a finite point`);
    if (loc) {
      placed++;
      const b = BUILDING[loc.buildingId];
      ok(b.floors.some(f => f.index === loc.floor), `${s.name} floor ${loc.floor} exists in ${b.id}`);
      ok(Math.abs(pt[1] - floorHeight(levelOf(b, loc.floor))) < 0.01, `${s.name} stands on floor ${loc.floor}`);
      const [x0, , z0] = toWorld(b.rect.x, b.rect.y), [x1, , z1] = toWorld(b.rect.x + b.rect.w, b.rect.y + b.rect.h);
      ok(pt[0] >= x0 - 1e-6 && pt[0] <= x1 + 1e-6 && pt[2] <= z0 + 1e-6 && pt[2] >= z1 - 1e-6, `${s.name} inside ${b.id} footprint`);
    } else transit++;
  }
}
ok(placed > 0, `subjects placed in buildings (${placed}), in transit (${transit})`);

console.log("== trains");
const t0 = trains(10), t1 = trains(10 + 1 / 60);
ok(t0.length >= 2, `at least two trains (${t0.length})`);
ok(t0.every(t => t.cars >= 3 && t.cars <= 4), "3-4 cars each");
ok(t0.every(t => t.s >= 0 && t.s < LOOP_LENGTH), "arc positions on the ring");
ok(JSON.stringify(trains(10)) === JSON.stringify(t0), "deterministic from the machine clock");
ok(t0.some((t, i) => Math.abs(t.s - t1[i].s) > 0.01), "trains move between machine minutes");
// riders sit in their car: the point the view draws them at is that car's centre
{
  let riders = 0, far = 0;
  for (let h = 6.5; h < 9.5 && riders < 40; h += 0.02) {
    const tr = trains(h);
    for (const s of roster) {
      const w = whereAt(s, h);
      if (w.leg !== "ride" || w.trainId == null) continue;
      if (w.line && w.line !== "loop") continue;   // the 3D view draws the Loop's trains; a rider on another line is drawn at its whereAt point, up on the deck
      riders++;
      const t = tr.find(x => x.id === w.trainId);
      if (!ok(t, `${s.name} rides a train that exists (${w.trainId})`)) continue;
      const c = loopAt(carArc(t, w.car || 0));
      if (Math.hypot(c.x - w.x, c.y - w.y) > 0.6) far++;
    }
  }
  console.log(`  riders checked: ${riders}`);
  if (LIVE_TRAINS) { ok(riders > 0, `found riders (${riders})`); ok(far === 0, `every rider is on their car (${far} off)`); }
}
const c0 = loopAt(carArc(t0[0], 0)), c3 = loopAt(carArc(t0[0], 3));
ok(Math.hypot(c0.x - c3.x, c0.y - c3.y) > 4, "cars are spread along the ring");

console.log("== projection and ordering");
const scene = buildScene();
const v = viewFor({ ...REST3D, tx: 0, tz: 0 }, 400, 320);
const pts = scene.districts.flatMap(d => d.quad.map(q => P(q, v)));
const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x));
const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y));
ok(minX > -20 && maxX < 420 && minY > -20 && maxY < 340, `whole city on a 400px canvas at rest (${minX.toFixed(0)}..${maxX.toFixed(0)} x ${minY.toFixed(0)}..${maxY.toFixed(0)})`);
ok(maxX - minX > 250, `and it fills the width (${(maxX - minX).toFixed(0)}px)`);
// from above: a higher floor projects higher on screen than the one below it
const b = scene.buildings.find(x => x.storeys >= 3);
const lo = P([b.centre[0], floorHeight(0), b.centre[2]], v), hi = P([b.centre[0], floorHeight(2), b.centre[2]], v);
ok(hi.y < lo.y, "upper floors draw above lower ones");
// the far edge of the city (map top) is farther than the near edge at yaw 0
const v0 = viewFor({ yaw: 0, pitch: -0.7, zoom: 1 }, 400, 320);
ok(depthOf(toWorld(50, 0), v0) > depthOf(toWorld(50, 58), v0), "map top is the far side at yaw 0");
ok(P(toWorld(50, 0), v0).y < P(toWorld(50, 58), v0).y, "far side draws higher on screen (looking down)");
ok(clampPitch3(5) === PITCH_MAX && clampPitch3(-5) === PITCH_MIN, "pitch clamps");
// panning: dragging right moves the city right (the point under the finger follows it)
const cam = { ...REST3D, tx: 0, tz: 0 };
const probe = toWorld(40, 30);
const before = P(probe, viewFor(cam, 400, 320));
const moved = panTarget(cam, 30, 20, viewFor(cam, 400, 320));
const after = P(probe, viewFor(moved, 400, 320));
ok(Math.abs(after.x - before.x - 30) < 6 && Math.abs(after.y - before.y - 20) < 8, `pan follows the finger (dx ${(after.x - before.x).toFixed(1)}, dy ${(after.y - before.y).toFixed(1)})`);

console.log("== hit tests and routes");
const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
ok(pointInPoly(5, 5, sq) && !pointInPoly(11, 5, sq), "pointInPoly");
ok(hull([...sq, { x: 5, y: 5 }]).length === 4, "hull drops interior points");
ok(buildingHref("works", "foundry-bldg", 2, "?at=10:00") === "#city/works/foundry-bldg?at=10%3A00&floor=2", `buildingHref keeps the query (${buildingHref("works", "foundry-bldg", 2, "?at=10:00")})`);
const r = parseCityRoute("#city/works/foundry-bldg?at=10:00&floor=2");
ok(r.districtId === "works" && r.buildingId === "foundry-bldg" && r.floor === 2, "parseCityRoute");
ok(parseCityRoute("#city").districtId === null, "parseCityRoute bare");

console.log("== the Loop paints in the right order");
{
  // A car must paint after (nearer than) every rail piece under it, at any turn of the city.
  const sc = buildScene();
  let frames = 0, over = 0;
  for (const yaw of [-2.4, -1.2, -0.42, 0.7, 1.9]) {
    const vk = viewFor({ ...REST3D, yaw, tx: 0, tz: 0 }, 1280, 900);
    const segD = sc.segs.map(sg => depthOf(sg.mid, vk));
    for (let i = 0; i < 100; i++) {
      for (const t of trains(10 + i * 0.013)) for (let c = 0; c < t.cars; c++) {
        const sArc = carArc(t, c), M = loopAt(sArc), d = carDepth(sArc, segD, depthOf(toWorld(M.x, M.y, LOOP_H), vk));
        frames++;
        for (let u = -CAR_LEN / 2; u <= CAR_LEN / 2 + 1e-9; u += CAR_LEN / 8) {
          const a = ((((sArc + u) % LOOP_LENGTH) + LOOP_LENGTH) % LOOP_LENGTH), j = Math.floor(a / SEG) % sc.segs.length;
          if (segD[j] <= d) { over++; break; }
        }
      }
    }
  }
  ok(over === 0, `no rail piece paints over a car (${over} of ${frames} car frames)`);
}
console.log("== commuters climb to the deck (no height jumps)");
{
  // Sampled every six machine seconds, a commuter's height never jumps: the stairs take
  // them between the street and the Loop's deck.
  let worst = 0, who = "";
  for (const s of roster.slice(0, 40)) {
    let prev = null;
    for (let m = 0; m < 24 * 600; m++) {
      const t = 24 * 30 + m / 600, w = whereAt(s, t);
      if (w.activity !== "commute" || w.leg === "ride") { prev = null; continue; }
      const y = subjectPoint(s, w, null, () => 0, () => null)[1];
      if (prev != null && Math.abs(y - prev) > worst) { worst = Math.abs(y - prev); who = `${s.name} h${(t % 24).toFixed(2)} ${w.sub}`; }
      prev = y;
    }
  }
  ok(worst < LOOP_H * 0.25, `largest height step in six machine seconds: ${(worst / LOOP_H).toFixed(3)} of the deck height (${who})`);
}
{
  const hq = BUILDINGS.find(b => b.districtId === "hq");
  ok(/CLASSIFIED/.test(floorLabel(hq, hq.floors[0], 5)), "HQ floors are never counted in public");
  ok(floorLabel(BUILDINGS.find(b => b.districtId === "campus"), BUILDINGS.find(b => b.districtId === "campus").floors[0], 3, true).length <= 12, "narrow floor labels are code and count only");
}

console.log("== frame budget (node, geometry only)");
const big = [];
for (let i = 0; big.length < 400; i++) { const f = roster[i % roster.length]; big.push({ ...f, slug: `${f.slug}-c${i}`, name: `${f.name} #${i}` }); }
const mt = machineClock(Date.now()).mt;
const ws = big.map(s => whereAt(s, mt));
const T0 = performance.now();
const N = 120;
for (let k = 0; k < N; k++) {
  const vk = viewFor({ ...REST3D, yaw: REST3D.yaw + k * 0.01, tx: 0, tz: 0 }, 400, 320);
  const items = [];
  for (const bb of scene.buildings) for (let f = 0; f <= bb.storeys; f++) for (const q of bb.base) P([q[0], floorHeight(f), q[2]], vk);
  for (const sg of scene.segs) items.push(depthOf(sg.a, vk));
  for (let i = 0; i < big.length; i++) { const p = subjectPoint(big[i], ws[i], locate(big[i], ws[i]), () => 0, () => null); items.push(P(p, vk).depth); }
  items.sort((a, c) => a - c);
}
const per = (performance.now() - T0) / N;
ok(per < 4, `projection + sort for 400 subjects: ${per.toFixed(2)} ms/frame (budget 4)`);

console.log(fails ? `\n${fails} FAILED` : "\nALL CHECKS PASSED");
process.exit(fails ? 1 : 0);
