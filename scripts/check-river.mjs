// THE ATTRITION (docs/CITY_SPEC.md "THE ATTRITION"; src/city/river.js): the river is continuous from
// beyond the edge of the world and high on the mountain to the sea; it never overlaps a building, a
// station or a lodge; every rail line and street it crosses has a bridge, and walkers cross it there
// and nowhere else; the days published before its day are byte for byte what the code before it
// built; its layout version takes effect at its day; every fishing spot is on its water.
// node scripts/check-river.mjs
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as SIM from "../src/city/sim.js";
import * as R from "../src/city/river.js";
import * as M from "../src/city/mountainGeo.js";
import * as G from "../src/city/coastGeo.js";
import { stopGeo } from "../src/city/lineGeo.js";
import { stationGeo } from "../src/city/loopGeo.js";
import { BOUNDS } from "../src/city/iso.js";
import * as FD from "../src/play/fish/data.js";
import { synthRoster } from "./synth-roster.mjs";

let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("  FAIL", msg); } else if (process.env.VERBOSE) console.log("  ok", msg); };
const hyp = Math.hypot;
const inRect = (r, x, y, e = 1e-6) => x > r.x + e && x < r.x + r.w - e && y > r.y + e && y < r.y + r.h - e;
const inPoly = (x, y, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const { MAIN, MELT, TARN, RIVER_DAY } = R;
const inWorld = (p) => p.y > BOUNDS.y0 - 1 && p.y < R.SEA_Y + 4;

// ---- 1. continuous: from beyond the edge, and from high on the mountain, to the sea ---------------------
{
  const P = MAIN.pts;
  ok(P[0].y < BOUNDS.y0 - 1000 && Math.abs(P[0].x - P[1].x) < 1e-9, `the main stem comes in from far past the edge of the world (y ${P[0].y}, the world's edge ${BOUNDS.y0}): one straight run off the grid`);
  ok(P.slice(2).every((p, i) => hyp(p.x - P[i + 1].x, p.y - P[i + 1].y) <= 0.5 + 1e-6), "sampled without a gap every half cell from there to the sea");
  ok(P[P.length - 1].y > G.SEA.y0 + 3 && R.SEA_Y === G.SEA_Y, "it ends out in the sea (river.js SEA_Y is coastGeo's)");
  const wAt = (y) => R.nearest(MAIN, R.pointAt(MAIN, MAIN.pts.find(p => p.y >= y && p.x > 40).s).x, y).w;
  ok(P.every(p => p.w > 0.9) && P[P.length - 1].w > 8 && wAt(97) > wAt(92) && wAt(92) > wAt(84) && wAt(84) > Math.max(...P.filter(p => p.y > -3 && p.y < 74).map(p => p.w)), `it widens towards the coast (${[84, 92, 97].map(y => wAt(y).toFixed(1)).join(", ")} cells at rows 84, 92, 97; at most ${Math.max(...P.filter(p => p.y > -3 && p.y < 74).map(p => p.w))} in the city)`);
  const Q = MELT.pts, hs = Q.map(p => M.terrainH(p.x, p.y));
  ok(Q.slice(1).every((p, i) => hyp(p.x - Q[i].x, p.y - Q[i].y) <= 0.5 + 1e-6), "THE BURNOUT is sampled without a gap");
  ok(hs[0] >= 20, `THE BURNOUT rises high on the mountain (${hs[0].toFixed(1)} storeys, ${M.feetAt(hs[0])} FT)`);
  ok(hs.every((h, i) => i === 0 || h <= hs[i - 1] + 0.05), "it runs downhill all the way");
  const drops = Q.slice(1).map((p, i) => (hs[i] - hs[i + 1]) / Math.max(1e-6, p.s - Q[i].s));
  ok(Math.max(...drops) > 1.05, `falls on the way down (steepest ${Math.max(...drops).toFixed(2)} storeys a cell)`);
  const end = Q[Q.length - 1], n = R.nearest(MAIN, end.x, end.y);
  ok(n.d <= n.w / 2, "it joins the main stem (THE MERGER)");
  ok(Q.some(p => ((p.x - TARN.x) / TARN.rx) ** 2 + ((p.y - TARN.y) / TARN.ry) ** 2 < 0.2), "it runs through THE RETENTION POOL");
  const t0 = M.terrainH(TARN.x, TARN.y);
  ok([[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]].every(([a, b]) => Math.abs(M.terrainH(TARN.x + a * TARN.rx, TARN.y + b * TARN.ry) - t0) < 0.05), `THE RETENTION POOL lies flat on its bench (${t0.toFixed(1)} storeys)`);
  ok(MAIN.pts.filter(p => p.y < -21 && inWorld(p)).every(p => M.terrainH(p.x, p.y) < 0.05), "the main stem keeps to the flat at the mountain's foot");
}

// ---- 2. never over a building, a station, a lodge -----------------------------------------------------
// The river crosses landscape, never a lot: the mountain's bands, THE FOOTHILLS (the forest belt), the
// sand, and the boardwalk (its deck is the bridge).
const LANDSCAPE = new Set(["the-upper-mountain", "the-mid-lodge", "the-summit-lodge", "the-foothills", "the-beach", "the-boardwalk"]);
const waterPts = [];
for (const C of R.COURSES) for (const p of C.pts) if (inWorld(p)) for (const k of [-0.48, -0.25, 0, 0.25, 0.48]) waterPts.push([p.x - p.dy * p.w * k, p.y + p.dx * p.w * k, C.id]);
for (let a = 0; a < 24; a++) for (const f of [0.5, 0.98]) waterPts.push([TARN.x + Math.cos(a / 24 * 2 * Math.PI) * TARN.rx * f, TARN.y + Math.sin(a / 24 * 2 * Math.PI) * TARN.ry * f, "pool"]);
{
  const hit = new Map();
  for (const [x, y] of waterPts) for (const b of SIM.BUILDINGS) if (y < R.SEA_Y && !LANDSCAPE.has(b.id) && inRect(b.rect, x, y)) hit.set(b.id, (hit.get(b.id) || 0) + 1);
  ok(!hit.size, `the water overlaps no building's lot (out in the sea, where it is the sea, the pier stands in it as it did) (${[...hit].map(([k, v]) => `${k} ${v}`).join(", ") || "none"})`);
  const stations = [...SIM.STATION_ORDER.map(id => ({ id, poly: [stationGeo(SIM.STATIONS[id]).lot, stationGeo(SIM.STATIONS[id]).stairs] })),
    ...SIM.linesOn(SIM.NET).filter(l => l !== SIM.LOOP).flatMap(l => l.stops.map(st => { const g = stopGeo(st); return { id: st.id, poly: [g.all.slice(0, 4), g.all.slice(4, 8)] }; }))];
  const wet = stations.filter(s => waterPts.some(([x, y]) => s.poly.some(p => p.length >= 3 && inPoly(x, y, p))));
  ok(!wet.length, `no platform or stair stands in the water (${wet.map(s => s.id).join(", ") || "none"})`);
  const lodges = [...Object.values(M.LODGES), ...M.STATIONS];
  ok(!lodges.some(B => waterPts.some(([x, y]) => x > B.x0 && x < B.x1 && y > B.y0 && y < B.y1)), "no lodge or lift station on the mountain stands in the water");
  ok(!M.TRAILS.some(T => T.pts.some(([x, y]) => R.wetAt(x, y, 0.3))), "no ski trail runs into the water");
  // the riverside: the path and the parks dry, on open ground
  const dryOpen = (x, y) => !R.wetAt(x, y, 0.05) && !SIM.BUILDINGS.some(b => !LANDSCAPE.has(b.id) && inRect(b.rect, x, y));
  ok(R.PATH.every(seg => { for (let k = 0; k <= 40; k++) { const x = seg[0][0] + (seg[1][0] - seg[0][0]) * k / 40, y = seg[0][1] + (seg[1][1] - seg[0][1]) * k / 40; if (!dryOpen(x, y)) return false; } return true; }), "the riverside path runs dry, beside the water, clear of every lot");
  ok(R.PARKS.every(P => [[P.x0, P.y0], [P.x1, P.y0], [P.x1, P.y1], [P.x0, P.y1], ...P.benches, ...P.trees].every(([x, y]) => dryOpen(x, y))), "the pocket parks and their benches stand on dry leftover ground");
}

// ---- 3. bridges: every rail line and street it crosses, and walkers cross only there -----------------------
{
  // rail: wherever a line's centreline is over the water, a rail bridge
  const crossings = [];
  for (const line of SIM.linesOn(SIM.NET)) for (let s = 0; s < line.length; s += 0.2) {
    const p = line.at(s); if (!p) continue;
    const n = R.nearest(MAIN, p.x, p.y);
    if (n.d <= n.w / 2 && !crossings.some(c => hyp(c.x - p.x, c.y - p.y) < 3)) crossings.push({ line: line.id, x: p.x, y: p.y });
  }
  const rail = R.BRIDGES.filter(b => b.kind === "rail");
  ok(crossings.length >= 3 && crossings.every(c => rail.some(b => hyp(b.x - c.x, b.y - c.y) < 2)), `every rail crossing has a rail bridge (${crossings.map(c => `${c.line} at ${c.x.toFixed(1)},${c.y.toFixed(1)}`).join("; ")})`);
  ok(rail.every(b => crossings.some(c => hyp(b.x - c.x, b.y - c.y) < 2)), "and every rail bridge carries a line");
  // the streets between the rows of districts: wherever the course crosses one, a road or foot bridge in it
  const STREETS = [["the street under the Heights", -3.5, 0], ["the Loop's north street", 12, 20], ["the Loop's south street", 39, 46], ["the Shore Line's street", 73.5, 80.5]];
  for (const [name, y0, y1] of STREETS) {
    const inside = MAIN.pts.filter(p => p.y > y0 && p.y < y1 && p.x > 0 && p.x < 110);
    if (!inside.length) continue;
    const b = R.BRIDGES.filter(x => x.walk && x.y > y0 && x.y < y1);
    ok(b.length >= 1, `${name}: carried across (${b.map(x => x.name).join(", ")})`);
  }
  const trail = G.FOOTHILLS.trail;
  let tx = null;
  for (let i = 1; i < trail.length && !tx; i++) for (let k = 0; k <= 200; k++) { const x = trail[i - 1][0] + (trail[i][0] - trail[i - 1][0]) * k / 200, y = trail[i - 1][1] + (trail[i][1] - trail[i - 1][1]) * k / 200; if (R.nearest(MAIN, x, y).d < 0.1) { tx = [x, y]; break; } }
  ok(tx && R.BRIDGES.some(b => b.kind === "trail" && hyp(b.x - tx[0], b.y - tx[1]) < 0.6), "the foothills' trail crosses on THE TRAIL BRIDGE");
  ok(R.BRIDGES.some(b => b.kind === "boardwalk" && inRect(G.BOARDWALK.lot, b.x, b.y)), "the boardwalk's deck carries it over the river (THE BOARDWALK)");
  // the water is a wall to walkers but at the bridges: every wet point is inside a block, or on a bridge's deck
  const decks = R.BRIDGES.filter(b => b.walk);
  const onDeck = (x, y) => decks.some(b => { const u = (x - b.x) * b.dx + (y - b.y) * b.dy, v = -(x - b.x) * b.dy + (y - b.y) * b.dx; return Math.abs(u) <= b.deck / 2 + 0.05 && Math.abs(v) <= b.span / 2 + 0.05; });
  let open = 0, eg = "";
  for (const p of MAIN.pts) {
    if (p.y < -100 || p.y >= R.SEA_Y) continue;
    for (const k of [-0.45, -0.2, 0, 0.2, 0.45]) {
      const x = p.x - p.dy * p.w * k, y = p.y + p.dx * p.w * k;
      if (!R.RIVER_BLOCKS.some(o => x > o.x0 && x < o.x1 && y > o.y0 && y < o.y1) && !onDeck(x, y)) { open++; eg ||= `${x.toFixed(2)},${y.toFixed(2)}`; }
    }
  }
  ok(open === 0, `the walking blocks cover the water but the bridges' decks (${open} open${eg ? `, e.g. ${eg}` : ""})`);
  // every walking bridge is walked straight across on the river's ground; on the old ground nothing changed
  const len = (pts) => pts.reduce((n, p, i) => n + (i ? hyp(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0);
  for (const b of decks) {
    const o = b.span / 2 + 0.6, A = { x: b.x - b.dy * o, y: b.y + b.dx * o }, B = { x: b.x + b.dy * o, y: b.y - b.dx * o };
    ok(len(SIM.onGround(RIVER_DAY, () => SIM.footpath(A, B))) < 2 * o + 0.5, `${b.name}: walked straight across`);
  }
  // no bank cut off: from either bank of the river, every 3 cells through the city, the other bank is reachable over a bridge
  let worst = 0, wEg = "";
  const solid = (p) => SIM.footBlocks(1).some(o => p.x > o.x0 && p.x < o.x1 && p.y > o.y0 && p.y < o.y1);
  for (let s = R.nearest(MAIN, 5, -12).s; s < R.nearest(MAIN, 55.2, 87).s; s += 3) {
    const p = R.pointAt(MAIN, s), o = p.w / 2 + 0.7;
    const A = { x: p.x - p.dy * o, y: p.y + p.dx * o }, B = { x: p.x + p.dy * o, y: p.y - p.dx * o };
    if (solid(A) || solid(B)) continue;
    const d = len(SIM.onGround(RIVER_DAY, () => SIM.footpath(A, B))) - 2 * o;
    if (d > worst) { worst = d; wEg = `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }
  }
  ok(worst < 40, `no bank is cut off: the longest way round to the other bank is ${worst.toFixed(1)} cells (at ${wEg})`);
  ok(SIM.footBlocks(0).length + R.RIVER_BLOCKS.length === SIM.footBlocks(1).length && SIM.footBlocks(0).every(o => !String(o.id).startsWith("river:")), "the old ground has no water in it; the river's ground is the old one plus the water");
}

// ---- 4. the day boundary: published days unchanged, the new layout from RIVER_DAY ---------------------------
{
  const fx = JSON.parse(readFileSync(new URL("./fixtures/river-pre.json", import.meta.url), "utf8"));
  ok(fx.riverDay === RIVER_DAY, `the fixture was built for this RIVER_DAY (${fx.riverDay}, ${RIVER_DAY})`);
  SIM.clearPlans();
  const roster = synthRoster(fx.n); SIM.setRoster(roster);
  const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
  const whereSha = (day) => { const out = []; for (const s of roster) for (let m = 0; m < 1440; m += 30) { const w = SIM.whereAt(s, (day - 1) * 24 + m / 60); out.push(`${w.placeId}|${w.sub || ""}|${w.x.toFixed(5)}|${w.y.toFixed(5)}`); } return sha(out.join("\n")); };
  for (const d of Object.keys(fx.plans).map(Number)) {
    const plan = SIM.buildPlan(d), j = JSON.stringify(plan);
    if (d < RIVER_DAY) {
      ok(sha(j) === fx.plans[d] && plan.layout === 6, `day ${d} (before the river): its plan is byte for byte what ${fx.commit} built (layout 6)`);
      ok(whereSha(d) === fx.where[d], `day ${d}: everyone is where ${fx.commit} put them, every half hour`);
    } else {
      ok(sha(j) !== fx.plans[d] && plan.layout === 7 && SIM.layoutOn(d) === SIM.LAYOUT_VERSION, `day ${d} (the river's day): built on layout 7, a new plan`);
      // the plan read back places everyone where the sim does, and nobody walks on the water but over a bridge
      const rows = plan.subjects;
      SIM.setPlan(plan, "river-check");
      let same = 0, n = 0, wet = 0, weg = "", walkers = 0;
      const decks = R.BRIDGES.filter(b => b.walk);
      const onDeck = (x, y) => decks.some(b => { const u = (x - b.x) * b.dx + (y - b.y) * b.dy, v = -(x - b.x) * b.dy + (y - b.y) * b.dx; return Math.abs(u) <= b.deck / 2 + 0.1 && Math.abs(v) <= b.span / 2 + 0.1; });
      const walls = new Map();
      for (const s of roster) for (let m = 0; m < 1440; m += 5) {
        const T = (d - 1) * 24 + m / 60, w = SIM.whereAt(s, T);
        if (w.sub === "walking" && w.leg === "walk" && w.climb == null) {
          walkers++;
          if (w.y < R.SEA_Y && R.wetAt(w.x, w.y, -0.08) && !onDeck(w.x, w.y)) { wet++; weg ||= `${SIM.keyOf(s)} at ${w.x.toFixed(2)},${w.y.toFixed(2)}`; }
        }
        if (m % 60 === 0) walls.set(`${SIM.keyOf(s)}|${m}`, w);
      }
      SIM.clearPlans();
      for (const s of roster) for (let m = 0; m < 1440; m += 60) { const a = walls.get(`${SIM.keyOf(s)}|${m}`), b = SIM.whereAt(s, (d - 1) * 24 + m / 60); n++; if (a.placeId === b.placeId && Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) same++; }
      ok(same === n, `day ${d}: the published plan places everyone where the sim does (${same} of ${n})`);
      ok(walkers > 500 && wet === 0, `day ${d}: nobody walks on the water but over a bridge (${wet} of ${walkers} walking samples${weg ? `, e.g. ${weg}` : ""})`);
      ok(Object.keys(rows).length === roster.length, "everyone is in it");
    }
  }
  // across the boundary: nobody jumps at midnight into the river's day
  let jump = 0, jeg = "";
  for (const s of roster) {
    let prev = null;
    for (let m = -60; m <= 60; m++) {
      const w = SIM.whereAt(s, (RIVER_DAY - 1) * 24 + m / 60);
      if (prev && w.sub !== "riding" && prev.sub !== "riding") { const d = hyp(w.x - prev.x, w.y - prev.y); if (d > jump) { jump = d; jeg = `${SIM.keyOf(s)} at ${m} min`; } }
      prev = w;
    }
  }
  ok(jump < 9, `across midnight into day ${RIVER_DAY} the largest move in a machine minute is ${jump.toFixed(1)} cells (${jeg}; a pod at speed is 6)`);
  ok(SIM.layoutOn(RIVER_DAY - 1) === 6 && SIM.layoutOn(RIVER_DAY) === 7 && SIM.LAYOUT_VERSION === 7, "layout 6 before the river's day, 7 from it");
  ok(!R.riverShown((RIVER_DAY - 1) * 24 - 0.001) && R.riverShown((RIVER_DAY - 1) * 24), "the views draw the river from 00:00 of its day, not a minute before");
}

// ---- 5. the fishing spots ----------------------------------------------------------------------------------
{
  const F = R.FISHING_SPOTS;
  ok(new Set(F.map(f => f.id)).size === F.length && F.every(f => /^[a-z-]+$/.test(f.id) && /^THE [A-Z' -]+$/.test(f.name)), "every spot has its own id and a name");
  ok(["ocean", "river", "lake", "estuary"].every(w => F.some(f => f.water === w)), "ocean, river, lake and estuary water");
  const river = F.filter(f => f.water === "river");
  ok(river.length >= 3 && river.length <= 5, `three to five riverbank spots (${river.map(f => f.name).join(", ")})`);
  for (const f of F) {
    ok(R.waterAt(f.x, f.y) === f.water, `${f.name}: on ${f.water} water (${R.waterAt(f.x, f.y)})`);
    const [sx, sy] = f.stand;
    const dry = f.id === "pier" ? (sx > G.PIER.deck.x0 && sx < G.PIER.deck.x1 && sy > G.PIER.deck.y0 && sy < G.PIER.deck.y1) : !R.wetAt(sx, sy, 0.05) && !SIM.footBlocks(0).some(o => sx > o.x0 && sx < o.x1 && sy > o.y0 && sy < o.y1);
    ok(dry && hyp(sx - f.x, sy - f.y) < 4, `${f.name}: the angler stands dry within a cast`);
    ok(f.place === null || SIM.PLACES[f.place], `${f.name}: its place is on file`);
  }
  ok(["pier", "estuary", "river", "lake"].every(id => R.FISHING_SPOT[id]) && F.every(f => FD.SPOT[f.id]?.water === f.water), "the fishing game reads them (its old ids kept: pier, estuary, river, lake)");
}

// ---- 6. the names (labels only on hover or a tap) -------------------------------------------------------------
ok(R.NAME === "THE ATTRITION" && R.MELT.name && R.TARN.name && R.ESTUARY.name, "named: THE ATTRITION, THE BURNOUT, THE RETENTION POOL, THE OUTPLACEMENT");
ok(R.BRIDGES.every(b => /^THE /.test(b.name)), "every bridge is named");

console.log(`check-river: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
