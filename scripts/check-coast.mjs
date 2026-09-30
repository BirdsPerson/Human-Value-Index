// THE COAST and THE HEIGHTS (docs/CITY_SPEC.md "The city built outward"): the expansion
// districts on their own ground, the spurs that reach them, their people's places, and what
// they do to the crowding. node scripts/check-coast.mjs
import * as SIM from "../src/city/sim.js";
import { rot, rotRect } from "../src/city/iso.js";
import { isoItems } from "../src/city/archGeo.js";
import { loopPieces } from "../src/city/loopGeo.js";
import * as G from "../src/city/coastGeo.js";
import { synthRoster } from "./synth-roster.mjs";
import { civicFold } from "../src/city/civic.js";

let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("  FAIL", msg); } };
const over = (a, b) => a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;

// ---- the land ----------------------------------------------------------------------------------
const EXP = SIM.DISTRICTS.filter(d => d.expansion);
ok(EXP.map(d => d.id).join() === "coast,heights" && SIM.DISTRICTS.slice(-2).every(d => d.expansion), "two expansion districts, appended after the ten (a sector is a district, in order)");
for (const d of SIM.DISTRICTS) for (const e of SIM.DISTRICTS) if (d !== e) ok(!over(d.rect, e.rect), `${d.id} and ${e.id} do not overlap`);
ok(SIM.DISTRICT.coast.rect.y >= Math.max(...SIM.LOOP_DISTRICTS.map(d => d.rect.y + d.rect.h)) + 2, "the Coast lies south of everything, past a street");
ok(SIM.DISTRICT.heights.rect.y + SIM.DISTRICT.heights.rect.h <= Math.min(...SIM.LOOP_DISTRICTS.map(d => d.rect.y)) - 2, "the Heights lie north of everything, past a street");
for (const d of EXP) {
  const r = d.rect;
  for (const b of SIM.BUILDINGS.filter(x => x.district === d.id)) ok(b.rect.x >= r.x && b.rect.y >= r.y && b.rect.x + b.rect.w <= r.x + r.w && b.rect.y + b.rect.h <= r.y + r.h, `${b.id} inside ${d.id}`);
  const kinds = new Set(d.places.map(p => SIM.PLACES[p].kind));
  ok(kinds.has("home") && (kinds.has("leisure") || kinds.has("mixed")), `${d.id}: homes and public places`);
  ok(SIM.JOBS.filter(j => j.district === d.id).length >= 3, `${d.id}: jobs (${SIM.JOBS.filter(j => j.district === d.id).map(j => j.title).join(", ")})`);
  const homes = d.places.filter(p => SIM.PLACES[p].kind === "home");
  ok([0, 1, 2].every(band => homes.some(h => SIM.HOMES_BY_BAND[band].includes(h))), `${d.id}: housing for every tier band`);
}
ok(["beach", "boardwalk", "pier", "surf"].every(p => SIM.PLACES[p]?.district === "coast") && ["slopes", "base-lodge"].every(p => SIM.PLACES[p]?.district === "heights"), "the beach, boardwalk, pier and surf; the slopes and the lodge");
ok(["lifeguard", "boardwalk-vendor", "pier-warden", "surf-instructor", "ski-patrol", "lift-operator", "ski-instructor", "lodge-cook"].every(j => SIM.JOB[j]), "lifeguards, vendors, pier wardens, surf and ski instructors, ski patrol, lift operators, lodge cooks");

// ---- the spurs ------------------------------------------------------------------------------------
{
  // open ground (a field, the Street, the foothills' cleared right of way) may be crossed; a building may not
  const blocks = SIM.BUILDINGS.filter(b => !SIM.OPEN_LOTS.has(b.id)).map(b => ({ id: b.id, x: b.rect.x + 0.3, y: b.rect.y + 0.3, w: b.rect.w - 0.6, h: b.rect.h - 0.6 }));
  for (const sp of Object.values(SIM.SPURS)) {
    ok(SIM.STATIONS[sp.hub] && SIM.DISTRICT[sp.districtId].hub === sp.hub, `${sp.name}: from ${sp.hub}'s station`);
    const d = SIM.DISTRICT[sp.districtId].rect, [tx, ty] = sp.pts[sp.pts.length - 1];
    ok(tx > d.x && tx < d.x + d.w && ty > d.y && ty < d.y + d.h, `${sp.name}: its terminal is in ${sp.districtId}`);
    ok(Math.hypot(sp.pts[0][0] - SIM.STATIONS[sp.hub].gate.x, sp.pts[0][1] - SIM.STATIONS[sp.hub].gate.y) < 10, `${sp.name}: its stop is a short walk from the station's gate`);
    let hit = "";
    for (let i = 1; i < sp.pts.length; i++) for (let k = 0; k <= 60; k++) {
      const x = sp.pts[i - 1][0] + (sp.pts[i][0] - sp.pts[i - 1][0]) * k / 60, y = sp.pts[i - 1][1] + (sp.pts[i][1] - sp.pts[i - 1][1]) * k / 60;
      for (const b of blocks) if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) hit ||= b.id;
    }
    ok(!hit, `${sp.name}: the track crosses no building (${hit || "clear"})`);
    ok(sp.hours > 0 && sp.hours < 0.25, `${sp.name}: ${(sp.hours * 60).toFixed(1)} machine minutes end to end`);
  }
  // the track never runs under the Loop's deck or through a station, at any quarter turn
  for (let r = 0; r < 4; r++) {
    const deck = loopPieces(r);
    let clash = "";
    for (const sp of Object.values(SIM.SPURS)) for (let i = 1; i < sp.pts.length; i++) for (let k = 0; k <= 40; k++) {
      const [x, y] = [sp.pts[i - 1][0] + (sp.pts[i][0] - sp.pts[i - 1][0]) * k / 40, sp.pts[i - 1][1] + (sp.pts[i][1] - sp.pts[i - 1][1]) * k / 40], [u, v] = rot(x, y, r);
      for (const p of deck) if (u > p.x0 + 0.05 && u < p.x1 - 0.05 && v > p.y0 + 0.05 && v < p.y1 - 0.05) clash ||= `${sp.id} under ${p.kind}`;
    }
    ok(!clash, `r=${r}: the spurs keep clear of the viaduct and its stations (${clash || "clear"})`);
  }
  // a trip to and from each expansion district rides its spur, and only the Loop between hubs
  const figures = synthRoster(80).slice(0, 80);
  let pods = 0, trips = 0;
  for (const s of figures) for (let day = 30; day < 33; day++) for (const g of SIM.schedule(s, day)) {
    if (g.activity !== "commute" || (g.span && (g.span[0] !== g.from || g.span[1] !== g.to))) continue;   // a trip cut at midnight: its other half is tomorrow's
    const a = SIM.PLACES[g.fromPlaceId].district, b = SIM.PLACES[g.placeId].district;
    if (a === b || (!SIM.SPURS[a] && !SIM.SPURS[b])) continue;
    trips++;
    for (let t = g.from; t < g.to; t += 1 / 60) { const w = SIM.whereAt(s, (day - 1) * 24 + t); if (w.leg === "pod") { pods++; break; } }
  }
  ok(trips > 0 && pods === trips, `every trip to or from the Coast or the Heights rides a pod (${pods}/${trips})`);
}

// ---- the ground: anchors on their own lots, apart, enough of them -------------------------------------
{
  for (const [lot, pid] of Object.entries(G.COAST_LOTS)) {
    const as = G.COAST_ANCHORS[pid], R = SIM.PLACES[pid].rect, cap = SIM.PLACES[pid].cap;
    if (SIM.RESORT_PARCELS.has(pid)) { ok(as.length === 0, `${pid}: a vacant parcel has no places to stand`); continue; }
    ok(as.length >= cap, `${pid}: ${as.length} places for a capacity of ${cap}`);
    ok(new Set(as.map(a => a.id)).size === as.length, `${pid}: anchor ids unique`);
    const inLot = (x, y) => x > R.x && x < R.x + R.w && y > R.y && y < R.y + R.h;
    const wet = (x, y) => pid === "beach" && x > R.x && x < R.x + R.w && y >= G.SEA_Y && y < G.SEA_Y + 3;   // the shallows
    let off = 0, close = 0;
    for (const t of [0, 3.7, 11.2]) {
      const at = as.map(a => G.pathAt(a, t));
      at.forEach(([x, y]) => { if (!inLot(x, y) && !wet(x, y)) off++; });
      for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) if (Math.hypot(at[i][0] - at[j][0], at[i][1] - at[j][1]) < 0.25 && !(as[i].path?.kind === "lift" && as[j].path?.kind === "lift")) close++;
    }
    ok(off === 0, `${pid}: everyone on their own ground, moving or not (${off} off)`);
    ok(close <= (pid === "slopes" ? 6 : 0), `${pid}: nobody stands on anybody (${close} too close)`);
    ok(as.some(a => a.role === "staff"), `${pid}: a post for its staff`);
  }
  // the chairs climb one side and come down the other; the pistes and the lift stay on the slopes
  const ups = Array.from({ length: G.liftChairs() }, (_, k) => G.liftChair(k, 5)).filter(c => c.up).length;
  ok(ups > 3 && ups < G.liftChairs() - 3, `the lift: chairs up one side, down the other (${ups} of ${G.liftChairs()} going up)`);
  const S = SIM.PLACES.slopes.rect, inS = ([x, y]) => x > S.x && x < S.x + S.w && y > S.y && y < S.y + S.h;
  ok(G.PISTES.every(p => p.pts.every(inS)) && inS([G.LIFT.x, G.LIFT.y0]) && inS([G.LIFT.x, G.LIFT.y1]), "the pistes and the lift are on the slopes");
  ok(G.PISTES.every(p => p.pts.every((q, i) => i === 0 || G.terrainH(...q) < G.terrainH(...p.pts[i - 1]) + 1e-9)), "every piste runs downhill");
  // the terrain: flat at the village, rising to the ridge, never past its box
  let maxH = 0, bad = 0;
  for (let x = G.TERRAIN.x0; x <= G.TERRAIN.x1; x += 0.5) {
    ok(G.terrainH(x, G.TERRAIN.y1) < 1e-9, `terrain flat at the foot (x ${x})`);
    for (let y = G.TERRAIN.y1; y >= G.RIDGE_Y; y -= 0.5) { const h = G.terrainH(x, y); maxH = Math.max(maxH, h); if (y < G.TERRAIN.y1 && h < G.terrainH(x, y + 0.5) - 1e-9) bad++; }
    ok(G.terrainH(x, G.TERRAIN.y0 + 0.01) < G.terrainH(x, G.RIDGE_Y) && G.terrainH(x, G.TERRAIN.y0 + 0.01) > 0, `the far side falls away from the ridge (x ${x})`);
  }
  ok(maxH > 5 && maxH <= G.TERRAIN_MAX, `the mountain rises (${maxH.toFixed(1)} storeys, box ${G.TERRAIN_MAX})`);
  ok(bad === 0, `the mountain climbs all the way to the ridge (${bad} dips)`);
  ok(G.PINES.length > 80 && G.PINES.every(([x, y]) => G.onTerrain(x, y) && G.offPiste(x, y) >= 1.6), `pines on the mountain, off the pistes (${G.PINES.length})`);
  // the shelters stand clear of every building and the Loop, at every turn
  for (let r = 0; r < 4; r++) {
    const items = [...isoItems(r).filter(i => i.kind === "b" || i.kind === "y"), ...loopPieces(r)];
    let clash = "";
    for (const st of G.SPUR_STOPS) {
      const R = rotRect({ x: st.box.x0, y: st.box.y0, w: st.box.x1 - st.box.x0, h: st.box.y1 - st.box.y0 }, r);
      for (const it of items) if (R.x0 < it.x1 - 1e-9 && it.x0 < R.x1 - 1e-9 && R.y0 < it.y1 - 1e-9 && it.y0 < R.y1 - 1e-9) clash ||= `${st.id} x ${it.id || it.kind}`;
    }
    ok(!clash, `r=${r}: the spur shelters overlap nothing (${clash || "clear"})`);
  }
}

// ---- the crowding: the city built outward relieves the old one -----------------------------------------
// Measured with scripts/bench-crowding.mjs on the same roster and day before the expansion
// (2026-09-30, at N=2000, machine day 289): the ten districts' crowding factors summed to -95.
{
  const roster = synthRoster(2000), DAY = 289;
  SIM.setMemoCap(1e7);
  SIM.setRoster(roster);
  const plan = SIM.buildPlan(DAY);
  const people = new Map(roster.map(s => [SIM.keyOf(s), s]));
  const block = civicFold(plan, people, null);
  const old = SIM.LOOP_DISTRICTS.reduce((n, d) => n + block.districts[d.id].mood.f.crowd, 0);
  const homes = Object.values(plan.subjects).map(row => SIM.PLACES[plan.places[row[0]]].district);
  const out = homes.filter(d => d === "coast" || d === "heights").length / homes.length;
  console.log(`  crowding at N=2000, day ${DAY}: the ten districts ${old} (was -95 before the expansion); ${Math.round(out * 100)}% now live on the Coast or in the Heights`);
  ok(old > -80, `the ten districts are less crowded than before the expansion (${old} > -80; was -95)`);
  ok(out > 0.2, `the expansion houses a real share of the city (${Math.round(out * 100)}%)`);
  ok(["coast", "heights"].every(id => block.districts[id]?.mood && block.districts[id].seat), "the civic fold has a mood and a seat for each expansion district");
  const visits = Object.values(plan.subjects).reduce((n, row) => n + row.slice(1).filter(e => e.length > 1 && ["beach", "boardwalk", "pier", "surf", "slopes", "base-lodge"].includes(plan.places[e[1]]) && e[2] === 2).length, 0);
  ok(visits > 50, `people visit the beach, the boardwalk, the pier, the surf, the slopes and the lodge (${visits} visits)`);
  ok(!Object.values(plan.subjects).some(row => row.slice(1).some(e => e.length > 1 && SIM.RESORT_PARCELS.has(plan.places[e[1]]))), "nobody sets foot on a resort parcel before session 002 builds on it");
  SIM.clearRoster();
}

// ---- the resort parcels: session 002 builds them, on the clock --------------------------------------
{
  const G2 = await import("../src/city/coastGeo.js");
  for (const [pid, faces] of Object.entries(G2.PARCEL_ANCHORS)) {
    const R = SIM.PLACES[pid].rect;
    for (const [face, as] of Object.entries(faces)) {
      if (face === "vacant") { ok(as.length === 0, `${pid}: nobody on the vacant parcel`); continue; }
      ok(as.length >= SIM.PLACES[pid].cap, `${pid} ${face}: ${as.length} places for ${SIM.PLACES[pid].cap}`);
      let off = 0, close = 0;
      for (const t of [0, 7.3, 21.9]) {
        const at = as.map(a => G2.pathAt(a, t));
        at.forEach(([x, y]) => { if (!(x > R.x && x < R.x + R.w && y > R.y && y < R.y + R.h)) off++; });
        for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) if (Math.hypot(at[i][0] - at[j][0], at[i][1] - at[j][1]) < 0.25 && !(as[i].path && as[j].path)) close++;
      }
      ok(off === 0, `${pid} ${face}: everyone on the parcel (${off} off)`);
      ok(close === 0, `${pid} ${face}: nobody on anybody (${close})`);
      ok(as.some(a => a.role === "staff") || face === "site", `${pid} ${face}: a post for its staff`);
    }
  }
  // the phases, from session 002's recorded close
  const closeAt = Date.UTC(2026, 9, 6, 9, 48, 53), cd = SIM.machineClock(closeAt).day;
  SIM.setCivic({ closeAt: closeAt - 3 * 86400000, winner: "farm", resorts: { closeAt, winners: { coast: "beach-resort", heights: "mountain-lodge" } } });
  const phases = [];
  for (let d = cd - 1; d <= cd + SIM.LOT_BREAK + SIM.LOT_BUILD + 1; d++) phases.push([d, SIM.resortPhase("shore-lot", (d - 1) * 24 + 12), SIM.resortPhase("summit-lot", (d - 1) * 24 + 12)]);
  ok(phases.every(([d, a, b]) => a.phase === b.phase && (d < cd + SIM.LOT_BREAK ? a.phase === "approved" : d < cd + SIM.LOT_BREAK + SIM.LOT_BUILD ? a.phase === "site" : a.phase === "built")), "both parcels: approved, then a site, then built, on 001's timings from 002's close");
  ok(SIM.resortPhase("shore-lot", (cd + 12) * 24).winner === "beach-resort" && SIM.resortPhase("summit-lot", (cd + 12) * 24).winner === "mountain-lodge", "what is built is what won");
  ok(!SIM.parcelOpen("shore-lot", cd + 1) && SIM.parcelOpen("shore-lot", cd + SIM.LOT_BREAK + 1) && SIM.resortOpenOn("summit-lot", cd + 30) === "mountain-lodge", "nobody visits before the ground breaks; the crew, then the visitors");
  const roster = synthRoster(900);
  SIM.setMemoCap(1e7); SIM.setRoster(roster);
  const visits = (day) => { const plan = SIM.buildPlan(day); return Object.values(plan.subjects).reduce((n, row) => n + row.slice(1).filter(e => e.length > 1 && SIM.RESORT_PARCELS.has(plan.places[e[1]]) && e[2] === 2).length, 0); };
  const before = visits(cd + 1), site = visits(cd + SIM.LOT_BREAK + 1), built = visits(cd + SIM.LOT_BREAK + SIM.LOT_BUILD + 2);
  ok(before === 0 && site > 0 && built > 0, `the parcels take visitors only once the ground breaks (${before}, site ${site}, built ${built})`);
  SIM.clearRoster(); SIM.setCivic(null);
  ok(SIM.resortPhase("shore-lot", 5000).phase === "vacant", "no outcome on record: the parcels stay vacant");
}

console.log(fails ? `check-coast: ${fails} of ${checks} FAILED` : `check-coast: ${checks} checks passed`);
process.exit(fails ? 1 : 0);
