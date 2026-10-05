// PHASE 2 step 5 (docs/CITY_SPEC.md "PHASE 2 step 5"): THE FARMLAND, THE ENGINE, the West Line's second
// version, THE ENGINE SHUTTLE, THE COMMUNITY FARM (session 001's winner, full size) and LOT 0x6F07 as
// its companion garden. node scripts/check-growth.mjs
import * as SIM from "../src/city/sim.js";
import { FARM_HOMES, ENGINE_HOMES } from "../src/city/farmSim.js";
import { PREFECT } from "../src/city/prefectData.js";
import { massingOf } from "../src/city/archGeo.js";
import { CIVIC_ANCHORS, faceOf } from "../src/city/civicGeo.js";

let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("  FAIL", msg); } };
const D = SIM.DISTRICT, P = SIM.PLACES, B = SIM.BUILDING;
const over = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// ---- the land ------------------------------------------------------------------------------------------
ok(D.farmland?.expansion && D.engine?.expansion && SIM.DISTRICTS.slice(-2).map(d => d.id).join() === "farmland,engine", "THE FARMLAND and THE ENGINE appended after the Suburbs and the Airport (a sector is a district, in order)");
ok(D.farmland.rect.x + D.farmland.rect.w <= D.oldtown.rect.x + D.oldtown.rect.w && D.farmland.rect.y + D.farmland.rect.h <= D.oldtown.rect.y, "the Farmland north-west, behind the Old Town");
ok(D.engine.rect.x >= D.strip.rect.x + D.strip.rect.w && D.engine.rect.y + D.engine.rect.h <= 0, "the Engine north-east, past the Strip");
// the Heights (THE MOUNTAIN) keeps its terrain: neither district overlaps it, nor its mountain
for (const id of ["farmland", "engine"]) ok(!over(D[id].rect, D.heights.rect), `${id} clear of the Heights`);
const homes = (d) => D[d].places.filter(id => P[id].kind === "home");
ok(FARM_HOMES[1].every(id => SIM.HOMES_BY_BAND[1].includes(id)) && FARM_HOMES[2].every(id => SIM.HOMES_BY_BAND[2].includes(id)), "the Farmland: Grange Row and the manor in the middle band, the cottages in the lowest");
ok([0, 1, 2].every(b => ENGINE_HOMES[b].every(id => SIM.HOMES_BY_BAND[b].includes(id))), "the Engine: a tower for each band");
ok(["the-fields", "the-orchards", "the-dairy", "grain-elevator", "farmers-market", "community-farm"].every(id => P[id]?.district === "farmland"), "fields, orchards, the dairy, the grain elevator, the market, the community farm");
ok(["research-park", "annex-hall", "engine-offices", "cache-farm"].every(id => P[id]?.district === "engine"), "the research park, the university annex, the offices, the data hall");
// the data hall moved from the Works, its id kept; a day published before reads it with the Works
ok(SIM.MOVED_FROM["cache-farm"] === "works" && B["cache-farm"].district === "engine" && B["tool-library"]?.district === "works", "CACHE FARM moved to the Engine (ids kept, MOVED_FROM); the tool library keeps the Works' cell");
ok(SIM.JOBS.filter(j => j.district === "farmland").length >= 5 && SIM.JOBS.filter(j => j.district === "engine").length >= 5, `jobs: the Farmland ${SIM.JOBS.filter(j => j.district === "farmland").length}, the Engine ${SIM.JOBS.filter(j => j.district === "engine").length}`);
for (const b of SIM.BUILDINGS.filter(x => x.district === "farmland" || x.district === "engine")) if (!SIM.OPEN_LOTS.has(b.id)) ok(massingOf(b)?.parts.length, `${b.id}: massed (${b.arch})`);
// the prefects of the two new districts take their seats
ok(PREFECT.farmland?.code === "FRM-19" && PREFECT.engine?.code === "ENG-20", "FRM-19 THE GRANGE INSPECTOR and ENG-20 THE HELPDESK are live");

// ---- the lines ------------------------------------------------------------------------------------------
{
  const v1 = SIM.LINE.west, v2 = SIM.LINE.west2, E = SIM.LINE.engine;
  ok(SIM.NET === 8 && SIM.linesOn().includes(v2) && !SIM.linesOn().includes(v1) && v1.nets.join() === "4,5,6,7" && v1.retired === 8, "the West Line's version 2 in service on network 8; version 1 kept for days published on networks 4-7");
  ok(v2.index === 7 && v2.version === 2 && v2.trains.every(t => !v1.trains.some(u => u.id === t.id)), `version 2 at its own index, its trains numbered on (${v2.trains.map(t => t.id).join(",")})`);
  ok(v1.stations.every((st, i) => v2.stations[i].id === st.id) && v2.stations.at(-1).id === "farmland-market", "version 2 keeps version 1's stations and runs on to FARMLAND MARKET");
  ok(E && SIM.linesOn().includes(E) && E.stations.map(s => s.name).join() === "STRIP (ENGINE SHUTTLE),ENGINE CAMPUS,ENGINE TOWERS", "THE ENGINE SHUTTLE: the Strip, ENGINE CAMPUS, ENGINE TOWERS");
  const strip = SIM.STATIONS.strip.gate, g = Math.min(...E.stops.filter(s => s.stationId === "engine-strip").map(s => Math.hypot(s.gate.x - strip.x, s.gate.y - strip.y)));
  ok(g <= 18, `the Strip interchange within the interchange walk of the Loop's Strip station (${g.toFixed(1)} cells)`);
  const fm = v2.stops.find(s => s.stationId === "farmland-market"), mk = B["farmers-market"].rect;
  ok(Math.hypot(fm.gate.x - (mk.x + mk.w), fm.gate.y - (mk.y + mk.h / 2)) < 16, "FARMLAND MARKET beside the market town");
}

// ---- THE COMMUNITY FARM ---------------------------------------------------------------------------------
{
  const fp = SIM.FARM_PARCEL, day0 = fp.breakDay;
  SIM.setCivic(null);
  ok(SIM.farmParcelPhase((day0 + 9) * 24).phase === "vacant" && !SIM.parcelOpen("community-farm", day0 + 9), "no result on record: the parcel waits, nobody visits");
  SIM.setCivic({ closeAt: Date.UTC(2026, 9, 1), winner: "farm" });   // session 001's result: the farm (long before the parcel)
  const at = (d) => SIM.farmParcelPhase((d - 1) * 24 + 12);
  ok(at(day0 - 1).phase === "approved" && at(day0).phase === "site" && at(day0 + SIM.LOT_BUILD - 1).phase === "site" && at(day0 + SIM.LOT_BUILD).phase === "built", `approved, then a site for ${SIM.LOT_BUILD} machine days from day ${day0}, then the farm (LOT 0x6F07's timing)`);
  ok(!SIM.parcelOpen("community-farm", day0 - 1) && SIM.parcelOpen("community-farm", day0) && SIM.parcelOpen("community-farm", day0 + SIM.LOT_BUILD), "visitors only once the site opens");
  const lot = (d) => SIM.lotPhase((d - 1) * 24 + 12);
  ok(lot(day0 + SIM.LOT_BUILD - 1).garden !== true && lot(day0 + SIM.LOT_BUILD).garden === true, "LOT 0x6F07 becomes the community garden the day the full-size farm opens");
  ok(faceOf(at(day0), "community-farm") === "bigsite" && faceOf(at(day0 + SIM.LOT_BUILD), "community-farm") === "bigfarm" && faceOf(lot(day0 + SIM.LOT_BUILD)) === "garden", "the faces: the site and the farm full size, the garden on the Commons' lot");
  ok(CIVIC_ANCHORS.bigfarm.length >= P["community-farm"].cap && CIVIC_ANCHORS.garden.length >= P["dev-lot"].cap, `room for everyone: the farm ${CIVIC_ANCHORS.bigfarm.length}, the garden ${CIVIC_ANCHORS.garden.length}`);
  ok(P["community-farm"].rect.w * P["community-farm"].rect.h >= 4 * P["dev-lot"].rect.w * P["dev-lot"].rect.h, "full size: at least four times LOT 0x6F07");
  SIM.setCivic({ closeAt: Date.UTC(2026, 9, 1), winner: "golf" });
  ok(SIM.farmParcelPhase((day0 + 9) * 24).phase === "vacant" && SIM.lotPhase((day0 + 9) * 24).garden !== true, "had the course won, the parcel stays reserved and the Commons keeps the course");
  SIM.setCivic(null);
}

const cap = (d) => homes(d).reduce((n, id) => n + P[id].cap, 0);
console.log(`  the Farmland: ${cap("farmland")} homes; the Engine: ${cap("engine")} homes; the city: ${Object.values(P).filter(p => p.kind === "home").reduce((n, p) => n + p.cap, 0)} homes`);
console.log(fails ? `check-growth: ${fails} of ${checks} FAILED` : `check-growth: ${checks} checks passed`);
process.exit(fails ? 1 : 0);
