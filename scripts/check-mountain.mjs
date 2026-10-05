// THE MOUNTAIN (docs/CITY_SPEC.md "THE MOUNTAIN"): the terrain to the summit, the trails, the lifts,
// the lodges, the skiers, the painter's order at the four quarter turns, and the race.
// node scripts/check-mountain.mjs
import * as SIM from "../src/city/sim.js";
import * as M from "../src/city/mountainGeo.js";
import { MTN_Y, MOUNTAIN_SPOTS } from "../src/city/mountainSim.js";
import { isoItems } from "../src/city/archGeo.js";
import { depthOrder, rot, hiddenByTerrain } from "../src/city/iso.js";
import { massingOf } from "../src/city/archGeo.js";
import { LINES } from "../src/city/sim.js";
import { baseAt } from "../src/city/lineGeo.js";
import { COAST_LOTS, MOUNTAIN_LOT_PLACES } from "../src/city/coastGeo.js";

let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("  FAIL", msg); } };
const segX = (a, b, c, d) => {   // do segments ab and cd cross?
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};
const PARCEL = SIM.BUILDING["lot-summit"].rect;
const inR = (x, y, r, m = 0) => x > r.x - m && x < r.x + r.w + m && y > r.y - m && y < r.y + r.h + m;

// ---- the terrain: a real mountain, to the summit ---------------------------------------------------
{
  const meridian = massingOf(SIM.BUILDING["the-meridian"]).rise;
  let top = 0, at = null;
  for (let x = M.MTN.x0; x <= M.MTN.x1; x += 0.5) for (let y = M.MTN.y0; y <= M.MTN.y1; y += 0.5) { const h = M.terrainH(x, y); if (h > top) { top = h; at = [x, y]; } }
  const S = M.PEAKS[0];
  ok(Math.abs(top - S.h) < 0.6 && Math.hypot(at[0] - S.x, at[1] - S.y) < 3, `the summit (${S.name}) is the mountain's highest ground (${S.h.toFixed(1)} storeys at ${S.x},${S.y}; the grid's top ${top.toFixed(1)} at ${at})`);
  ok(S.h >= 3 * meridian, `the summit stands ${S.h.toFixed(1)} storeys, over three times THE MERIDIAN (${meridian})`);
  ok(M.feetAt(S.h) > 4000 && M.feetAt(S.h) - M.feetAt(0) > 2900, `the board reads ${M.feetAt(S.h)} FT at the top, ${M.feetAt(S.h) - M.feetAt(0)} FT of vertical`);
  ok(M.PEAKS[1].h > 0.75 * S.h && M.PEAKS[2].h > 0.55 * S.h, `a second peak (${M.PEAKS[1].name} ${M.PEAKS[1].h.toFixed(1)}) and a shoulder (${M.PEAKS[2].name} ${M.PEAKS[2].h.toFixed(1)})`);
  // monotone to the summit along the ridges: each spur climbs from its foot to the crest, the crest
  // from its west end to the summit and from its east end to the east peak
  const climb = (pts, name) => {
    let worst = 0, last = -Infinity;
    for (let i = 1; i < pts.length; i++) for (let k = 0; k <= 20; k++) {
      const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k / 20, y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k / 20, h = M.terrainH(x, y);
      worst = Math.max(worst, last - h); last = Math.max(last, h);
    }
    ok(worst < 0.35, `${name}: the ridge climbs all the way (worst dip ${worst.toFixed(2)} storeys)`);
  };
  const [crest, ...spurs] = M.RIDGES;
  const si = crest.findIndex(p => p[0] === S.x && p[1] === S.y), ei = crest.findIndex(p => p[0] === M.PEAKS[1].x && p[1] === M.PEAKS[1].y);
  climb(crest.slice(0, si + 1), "the crest from the west to the summit");
  climb(crest.slice(ei).reverse(), "the crest from the east to MIDDLE MANAGEMENT");
  spurs.forEach((p, i) => climb([...p].reverse(), `spur ${i + 1}`));
  // the village's foot is flat; the north face falls away behind the summit
  ok([...Array(19)].every((_, i) => M.terrainH(M.MTN.x0 + i * 5, M.MTN.y1) < 0.05), "flat at the village's back");
  ok(M.terrainH(S.x, M.MTN.y0 + 1) < S.h * 0.3, "the north face falls away behind the summit");
  // a tree line, snow above it, the lodges' benches level
  ok(M.PINES.length > 900 && M.PINES.every(([x, y, h]) => h < M.TREELINE + 4 && M.onMountain(x, y)), `${M.PINES.length} pines, all below the tree line (${M.TREELINE})`);
  for (const L of Object.values(M.LODGES)) ok(L.hi - L.lo < 0.6, `${L.name}: stands on level ground (${L.lo.toFixed(1)}-${L.hi.toFixed(1)})`);
  ok(M.LODGES.summit.base > 0.75 * S.h && M.LODGES.mid.base > 0.35 * S.h && M.LODGES.mid.base < 0.6 * S.h, `the summit lodge near the top (${M.LODGES.summit.base.toFixed(1)}), the mid-mountain lodge halfway (${M.LODGES.mid.base.toFixed(1)})`);
  // THE ALPINE LINE (the PHASE 2 agent's): its deck stays over the ground all the way to its SUMMIT
  const A = LINES.find(l => l.id === "alpine");
  let under = 0, worst = -9;
  for (let u = 0; u <= A.L; u += 0.25) { const c = A.centre.at(u); if (c.y > M.BASE_Y) continue; for (const o of [-1.2, 0, 1.2]) { const g = M.terrainH(c.x + o, c.y), b = baseAt(A, u); worst = Math.max(worst, g - b); if (g > Math.max(0, b - 0.2) + 1e-6) under++; } }
  ok(under === 0, `the Alpine Line's deck clears the mountain all the way up (closest ${(-worst).toFixed(2)} storeys over the ground)`);
  ok(M.ALPINE.crest === Math.max(...Array.from({ length: Math.ceil(A.L * 4) }, (_, i) => baseAt(A, i / 4))).toFixed(1) * 1, "the cut's crest is the line's own");
}

// ---- the lots: the bands, the district, the places --------------------------------------------------
{
  const H = SIM.DISTRICT.heights.rect, bands = ["the-slopes", "the-upper-mountain", "the-mid-lodge", "the-summit-lodge"];
  ok(H.y <= M.MTN.y0 && H.y + H.h >= -3, `THE HEIGHTS runs from the summit's north face (${H.y}) to the foothills`);
  for (const id of bands) { const b = SIM.BUILDING[id]; ok(b && COAST_LOTS[id] && MOUNTAIN_LOT_PLACES.has(COAST_LOTS[id]), `${id}: a band of the mountain, painted with the terrain`); }
  ok(SIM.BUILDING["the-upper-mountain"].rect.y + SIM.BUILDING["the-upper-mountain"].rect.h === MTN_Y.slopesTop && SIM.BUILDING["the-summit-lodge"].rect.y === M.MTN.y0, "the bands run from THE SLOPES' top to the north face, edge to edge");
  for (const id of ["upper-mountain", "race-course", "mid-lodge", "summit-lodge", "summit-patrol"]) {
    const p = SIM.PLACES[id];
    ok(p && p.district === "heights" && p.cap > 0 && SIM.BUILDING[p.building], `${id}: a place in the Heights (cap ${p?.cap}, in ${p?.building})`);
    const r = MOUNTAIN_SPOTS[id];
    ok(r && inR(r.x + r.w / 2, r.y + r.h / 2, SIM.BUILDING[p.building].rect), `${id}: its people arrive on their own band`);
  }
  ok(["summit-patrol", "summit-bartender", "summit-cook", "mid-lodge-cook", "groomer", "snowmaker", "race-official"].every(j => SIM.JOB[j]), "jobs: the summit patrol, the summit's bartender and cook, the mid-mountain cook, the night groomers, the snowmakers, the race officials");
  ok(SIM.BUILDING["the-summit-lodge"].floors.length === 3 && SIM.BUILDING["the-mid-lodge"].floors.length === 2, "the lodges are buildings with floors: their cutaways open");
  ok(SIM.RESORT_PARCELS.has("summit-lot") && SIM.BUILDING["lot-summit"].rect.w === 41, "PARCEL 0xBE06 stays the Assembly's, its lot as it was");
}

// ---- the trails --------------------------------------------------------------------------------------
{
  const T = M.TRAILS;
  ok(T.length >= 15 && T.length <= 25, `${T.length} trails`);
  for (const r of M.RATINGS) ok(T.filter(t => t.rating === r).length >= 3, `${M.RATING[r].name}: ${T.filter(t => t.rating === r).map(t => t.name).join(", ")}`);
  ok(T.some(t => t.kind === "glades") && T.some(t => t.kind === "park") && T.some(t => t.kind === "race") && T.some(t => t.kind === "moguls"), "glades through the trees, a terrain park, moguls, a race course");
  ok(new Set(T.map(t => t.id)).size === T.length && new Set(T.map(t => t.name)).size === T.length, "ids and names unique");
  let crossings = 0;
  for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
    let hit = false;
    for (let a = 1; a < T[i].pts.length && !hit; a++) for (let b = 1; b < T[j].pts.length && !hit; b++) if (segX(T[i].pts[a - 1], T[i].pts[a], T[j].pts[b - 1], T[j].pts[b])) hit = true;
    if (hit) crossings++;
  }
  ok(crossings >= 4, `the trails wind and cross (${crossings} crossings), and ${T.filter(t => t.join).length} run into another`);
  for (const t of T) {
    ok(t.pts.every(([x, y]) => M.onMountain(x, y) && x > M.MTN.x0 + 1 && x < M.MTN.x1 - 1 && y < M.MTN.y1 + 0.5), `${t.id}: on the mountain`);
    ok(!t.pts.some(([x, y]) => inR(x, y, PARCEL, -0.5)), `${t.id}: off PARCEL 0xBE06 (session 002 decides it)`);
    const h0 = M.terrainH(...t.pts[0]), h1 = M.terrainH(...t.pts[t.pts.length - 1]);
    let climb = 0;
    for (let i = 0; i < t.pts.length; i++) for (let j = i + 1; j < t.pts.length && Math.hypot(t.pts[j][0] - t.pts[i][0], t.pts[j][1] - t.pts[i][1]) < 4; j++) climb = Math.max(climb, M.terrainH(...t.pts[j]) - M.terrainH(...t.pts[i]));
    ok(h0 - h1 > 2 && climb < 1.2, `${t.id}: runs downhill (${h0.toFixed(1)} -> ${h1.toFixed(1)}; worst climb ${climb.toFixed(2)})`);
    // it starts at its lift's top (or the race's finish) and ends at a lift's foot, the base, or another trail
    const from = t.from === "race" ? M.RACE_COURSE.finish : t.from.endsWith("@a") ? M.LIFT[t.from.slice(0, -2)].a : M.LIFT[t.from].b;
    ok(Math.hypot(t.pts[0][0] - from[0], t.pts[0][1] - from[1]) < 3.2, `${t.id}: starts at ${t.from}`);
    const end = t.pts[t.pts.length - 1];
    const to = t.to === "base" ? null : t.to === "race" ? M.RACE_COURSE.finish : t.to.startsWith("trail:") ? null : t.to.endsWith("@a") ? M.LIFT[t.to.slice(0, -2)].a : M.LIFT[t.to].b;
    if (t.to === "base") ok(end[1] > M.BASE_Y - 3.5, `${t.id}: ends at the base`);
    else if (to) ok(Math.hypot(end[0] - to[0], end[1] - to[1]) < 3.2, `${t.id}: ends at ${t.to}`);
    else ok(t.join && M.distTo(end[0], end[1], M.TRAIL[t.join.trail].pts)[0] < 1e-6, `${t.id}: runs into ${t.to.slice(6)}`);
  }
  // every trail reachable from the base, and home again, for a skier rated for it
  for (const t of T) {
    const r = M.routeFor(t.id, t.rating, "base");
    ok(r && r.some(e => e.kind === "ski" && e.id === t.id) && r.filter(e => e.kind === "ski").every(e => M.RATINGS.indexOf(e.rating) <= M.RATINGS.indexOf(t.rating)), `${t.id}: reachable from the base and home again within ${t.rating}`);
  }
  ok(M.GATES.length >= 5 && M.GATES.every(g => M.distTo(g.x, g.y, M.TRAIL["the-gauntlet"].pts)[0] < 1), `THE GAUNTLET: ${M.GATES.length} gates down the course, alternating`);
  ok(M.RACE_COURSE.drop > 6 && M.RACE_COURSE.len > 10, `the race course drops ${M.RACE_COURSE.drop.toFixed(1)} storeys over ${M.RACE_COURSE.len.toFixed(1)} cells`);
}

// ---- the lifts -----------------------------------------------------------------------------------------
{
  const L = M.LIFTS, solid = SIM.BUILDINGS.filter(b => !COAST_LOTS[b.id] && !SIM.OPEN_LOTS.has(b.id));
  ok(L.length >= 5 && L.filter(l => l.kind === "gondola").length === 1 && M.LIFT.ascent.b[1] < -85, `${L.length} lifts, THE ASCENT a gondola to the summit`);
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) ok(!segX(L[i].a, L[i].b, L[j].a, L[j].b), `${L[i].id} and ${L[j].id} do not cross`);
  for (const l of L) {
    ok(M.onMountain(...l.a) && M.onMountain(...l.b) && M.terrainH(...l.b) > M.terrainH(...l.a) + 3, `${l.id}: climbs the mountain`);
    ok(!solid.some(b => [0, 0.25, 0.5, 0.75, 1].some(k => inR(l.a[0] + (l.b[0] - l.a[0]) * k, l.a[1] + (l.b[1] - l.a[1]) * k, b.rect))), `${l.id}: clear of every building`);
    ok(![...Array(41)].some((_, k) => { const x = l.a[0] + (l.b[0] - l.a[0]) * k / 40, y = l.a[1] + (l.b[1] - l.a[1]) * k / 40; return inR(x, y, PARCEL, -0.3) || (Math.abs(x - M.ALPINE.x) < 3.5 && y > M.ALPINE.end - 2); }), `${l.id}: off the parcel and clear of the Alpine Line`);
    let low = 9;
    for (let k = 0; k <= 1; k += 0.01) low = Math.min(low, M.ropeH(l, k) - M.terrainH(l.a[0] + (l.b[0] - l.a[0]) * k, l.a[1] + (l.b[1] - l.a[1]) * k));
    ok(low > 1.2, `${l.id}: the rope rides over the ground (lowest ${low.toFixed(2)} storeys)`);
    for (const k of l.towers) { const x = l.a[0] + (l.b[0] - l.a[0]) * k, y = l.a[1] + (l.b[1] - l.a[1]) * k; ok(M.TRAILS.every(t => M.distTo(x, y, t.pts)[0] > 0.7), `${l.id}: tower at ${(k * 100).toFixed(0)}% off the trails`); }
    const ups = Array.from({ length: l.cars }, (_, i) => M.liftCar(l, i, 300 * 24 + 11)).filter(c => c.up).length;
    ok(Math.abs(ups - l.cars / 2) <= 1.5, `${l.id}: cars up one side, down the other (${ups} of ${l.cars} going up)`);
  }
  for (const S of M.STATIONS) ok(M.TRAILS.every(t => M.distTo(S.cx, S.cy, t.pts)[0] > 0.9 || t.from.includes(S.lift) || t.to.includes(S.lift)) && !solid.some(b => inR(S.cx, S.cy, b.rect)), `${S.lift} ${S.end} station: clear of other trails and buildings`);
}

// ---- the skiers: deterministic, on the trails and the chairs ----------------------------------------------------
{
  const people = [
    { slug: "shaun-white", breakdown: { physical: 88, adaptability: 72 }, competence: 68 },
    { slug: "a-learner", breakdown: { physical: 30, adaptability: 35 }, competence: 40 },
    { slug: "a-regular", breakdown: { physical: 60, adaptability: 60 }, competence: 60 },
  ];
  ok(M.maxRating(M.skiSkill(people[0])) === "double" && M.ridesBoard(people[0]), "Shaun White rides the double blacks, on a board");
  ok(M.maxRating(M.skiSkill(people[1])) === "green", "a learner keeps to the greens");
  let offTrail = 0, offLift = 0, n = 0, hard = 0, falls = 0;
  for (const s of people) for (const place of ["slopes", "upper-mountain", "race-course"]) for (let t = 9; t < 16; t += 0.013) {
    const mt = 305 * 24 + t, a = M.skierAt(s, place, mt, [44, -45]), b = M.skierAt(s, place, mt, [44, -45]);
    n++;
    if (a.x !== b.x || a.y !== b.y || a.mode !== b.mode) { offTrail += 1000; continue; }
    if (a.mode === "ski") { const tr = M.TRAIL[a.trail]; if (M.distTo(a.x, a.y, tr.pts)[0] > 1.4) offTrail++; if (M.RATINGS.indexOf(tr.rating) > M.RATINGS.indexOf(M.maxRating(M.skiSkill(s)))) hard++; if (a.fallen) falls++; }
    if (a.mode === "lift") { const L = M.LIFT[a.lift], [d] = M.distTo(a.x, a.y, [L.a, L.b]); if (d > L.gap + 0.05) offLift++; const near = Math.min(...Array.from({ length: L.cars }, (_, i) => { const c = M.liftCar(L, i, mt); return Math.hypot(c.x - a.x, c.y - a.y); })); if (near > 0.4) offLift++; }
    if (!M.onMountain(a.x, a.y)) offTrail++;
  }
  ok(offTrail === 0, `skiers stay on their trails, the same for every viewer (${offTrail} off of ${n})`);
  ok(offLift === 0, `riders sit on a chair or in a cabin (${offLift} off)`);
  ok(hard === 0, "nobody skis a trail above their rating");
  console.log(`  ${falls} stumbles sampled (non-graphic)`);
  // the lifts close at night; the cats groom and the guns blow
  const night = 305 * 24 + 23;
  ok(M.LIFTS.every(L => !M.liftStatus(L, night).open) && M.CATS.some(c => M.catAt(c, night)) && M.CATS.every(c => !M.catAt(c, 305 * 24 + 12)), "at night the lifts stop and the cats groom; by day the cats are parked");
  ok(M.TRAILS.every(t => !M.trailStatus(t, night).open), "the trails close at night (grooming)");
  const wx = new Set(Array.from({ length: 40 }, (_, i) => M.weatherOn(300 + i)));
  ok(wx.has("WIND") && wx.has("CLEAR") && wx.has("FRESH SNOW"), `the weather turns over the days (${[...wx].join(", ")})`);
}

// ---- the painter: the bands back to front at every quarter turn ----------------------------------------
{
  for (let r = 0; r < 4; r++) {
    const items = isoItems(r), order = depthOrder(items), pos = new Map(order.map((k, i) => [items[k].id, i]));
    const bands = ["the-summit-lodge", "the-mid-lodge", "the-upper-mountain", "the-slopes", "lot-summit"].map(id => items.find(it => it.id === id));
    let bad = 0;
    for (const a of bands) for (const b of bands) if (a !== b && (a.x1 <= b.x0 + 1e-6 || a.y1 <= b.y0 + 1e-6) && !(b.x1 <= a.x0 + 1e-6 || b.y1 <= a.y0 + 1e-6) && pos.get(a.id) > pos.get(b.id)) bad++;
    ok(bad === 0, `r=${r}: the mountain's bands paint back to front (${bad} out of order)`);
    // the village in front of the mountain paints after it; behind it, before it
    const lodge = items.find(it => it.id === "the-lodge"), up = items.find(it => it.id === "the-upper-mountain");
    const front = lodge.x0 >= up.x1 - 1e-6 || lodge.y0 >= up.y1 - 1e-6;
    ok(front ? pos.get("the-lodge") > pos.get("the-upper-mountain") : pos.get("the-lodge") < pos.get("the-upper-mountain"), `r=${r}: the base lodge ${front ? "after" : "before"} the upper mountain`);
    // the bands stand as tall as their ground (the tap box)
    ok(bands.every(b => b.h >= M.maxIn(SIM.BUILDING[b.id].rect)), `r=${r}: every band's box stands over its highest ground`);
    // the summit is never hidden; a lodge on the far side of the crest is, from behind
    ok(!hiddenByTerrain(M.PEAKS[0].x, M.PEAKS[0].y, M.PEAKS[0].h + 1, r), `r=${r}: the summit is in view`);
  }
  // a quad of ground nearer the viewer paints after one behind it (the band's own order: u + v)
  const keyAt = (x, y, r) => { const [u, v] = rot(x, y, r); return u + v; };
  ok([0, 1, 2, 3].every(r => [[40, -60], [70, -90]].every(([x, y]) => keyAt(x, y + 1, r) !== keyAt(x, y, r))), "the ground's cells have a depth at every turn");
}

// ---- THE WEEKEND RACE: the calendar, the field, the times, deterministic --------------------------------------
{
  const R = await import("../src/city/race.js");
  const days = Array.from({ length: 28 }, (_, i) => 309 + i), races = days.map(d => R.raceOn(d)).filter(Boolean);
  ok(races.length === 4 && races.every(r => SIM.weekdayOf(r.day) === 6), `a race every Saturday (${races.map(r => r.day).join(", ")})`);
  ok(new Set(races.map(r => r.kind)).size === 2, "slalom one week, giant slalom the next");
  ok(R.RACERS.length >= 8 && R.RACERS[0][0] === "shaun-white" && R.RACERS.every(r => r[3] >= 60 && r[3] <= 99), "the field: the skiers and boarders on file first, then the athletes the Department enters");
  for (const r of races) {
    const again = JSON.stringify(R.raceOn(r.day)), fresh = await import(`../src/city/race.js?again=${r.day}`);
    ok(JSON.stringify(fresh.raceOn(r.day)) === again, `day ${r.day}: the same race for every viewer (computed twice, from scratch)`);
    const fin = r.results.filter(x => x.place);
    ok(fin.length >= 3 && fin.every((x, i) => i === 0 || x.total >= fin[i - 1].total) && fin.every(x => Math.abs(x.total - x.t1 - x.t2) < 0.011), `day ${r.day}: ${r.name}, ${fin.length} finishers ranked by their two runs (${R.racerName(fin[0].slug)} ${R.fmt(fin[0].total)})`);
    ok(r.starts.length === r.run1.length + r.run2.length && r.starts.every((s, i) => i === 0 || s.at > r.starts[i - 1].at) && r.starts[r.starts.length - 1].at + R.DESCENT <= (r.day - 1) * 24 + 15, `day ${r.day}: every start inside 13:00-15:00, one at a time`);
    const mid = r.starts[3].at + R.DESCENT / 2, on = R.raceAt(mid);
    ok(on.phase === "on" && on.cur.slug === r.starts[3].slug && Math.abs(on.cur.f - 0.5) < 1e-6, `day ${r.day}: raceAt puts the fourth starter halfway down at the right moment`);
    const ev = R.raceEvents((r.day - 1) * 24 + 12.9, (r.day - 1) * 24 + 15.1);
    ok(ev.length >= r.starts.length * 2 && ev[ev.length - 1].text.startsWith("THE WEEKEND RACE:"), `day ${r.day}: the PA calls every start and finish, then the result (${ev.length} calls)`);
    let off = 0;
    for (let f = 0; f <= 1; f += 0.02) { const a = M.racerAt(f, false); if (M.distTo(a.x, a.y, M.TRAIL["the-gauntlet"].pts)[0] > 1.2) off++; }
    ok(off === 0, `day ${r.day}: the racer stays on the course through the gates`);
  }
  const wins = new Set(races.flatMap(r => r.results.filter(x => x.place === 1).map(x => x.slug)));
  const st = R.standings(335 * 24 + 23);
  ok(st[0].pts === Math.max(...st.map(x => x.pts)) && st.reduce((n, x) => n + x.races, 0) === races.reduce((n, r) => n + r.results.length, 0), `THE MOUNTAIN STANDINGS: the season's points, ${R.racerName(st[0].slug)} leads with ${st[0].pts} (winners this season: ${[...wins].map(R.racerName).join(", ")})`);
  ok(R.CUP_HOOK.from === null && R.raceTop3(335 * 24 + 23).length === 3, "the Cup's hook: the top three held, nothing scored until the Department says (no published table changes)");
}

console.log(`check-mountain: ${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
