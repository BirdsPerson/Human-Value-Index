// PHASE 2 step 4 (docs/CITY_SPEC.md "PHASE 2"): THE SUBURBS, THE AIRPORT and THE EAST LINE. The land,
// the estates round their stations, a park per estate, the starter homes for tier 3 alone, the airport's
// jobs and no homes, the East Line from the Archive, the aircraft (deterministic, never over the core,
// on the airfield or east of it), the departures hall's door to #arrivals.
// node scripts/check-east.mjs
import * as SIM from "../src/city/sim.js";
import * as AIR from "../src/city/airport.js";
import { SUBURB_HOUSES, SUBURB_STARTERS } from "../src/city/eastSim.js";
import { funnelButtons, FUNNEL_OF } from "../src/city/funnels.js";
import { massingOf } from "../src/city/archGeo.js";
import { TIERS } from "../src/figures.js";
import { legacyTier } from "./synth-roster.mjs";

let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("  FAIL", msg); } };
const D = SIM.DISTRICT, P = SIM.PLACES, B = SIM.BUILDING;
const core = { x0: Math.min(...SIM.LOOP_DISTRICTS.map(d => d.rect.x)), x1: Math.max(...SIM.LOOP_DISTRICTS.map(d => d.rect.x + d.rect.w)) };

// ---- the land ------------------------------------------------------------------------------------------
ok(D.suburbs && D.airport && D.suburbs.expansion && D.airport.expansion, "THE SUBURBS and THE AIRPORT are districts off the Loop");
ok(D.suburbs.rect.x > core.x1 + 25 && D.airport.rect.x >= D.suburbs.rect.x + D.suburbs.rect.w, "the Suburbs east of the core (past the nightlife quarters), the Airport east of the Suburbs");
const homes = (d) => D[d].places.filter(id => P[id].kind === "home");
ok(homes("airport").length === 0 && SIM.JOBS.filter(j => j.district === "airport").length >= 5, `the Airport: jobs, no homes (${SIM.JOBS.filter(j => j.district === "airport").map(j => j.title).join(", ")})`);
ok(homes("suburbs").length === SUBURB_HOUSES.length + SUBURB_STARTERS.length, "the Suburbs' homes are its houses and its starter homes");
ok(SUBURB_HOUSES.every(id => SIM.HOMES_BY_BAND[1].includes(id)) && SUBURB_STARTERS.every(id => SIM.HOMES_BY_BAND[2].includes(id)), "houses in the middle band, starter homes in the lowest");
ok(["eastgate", "food-court", "high-school", "clinic"].every(id => P[id]?.district === "suburbs") && ["departures", "control-tower", "hangars", "airport-hotel", "airfield", "security-hall"].every(id => P[id]?.district === "airport"), "a mall, a high school, a clinic; the departures hall, the tower, the hangars, the hotel, the airfield");
// a park per estate: every home within twenty cells of one of the Suburbs' own parks
const parks = ["north-park", "village-green", "south-park"].map(id => B[id].rect);
const gap = (r, q) => Math.hypot(Math.max(0, q.x - (r.x + r.w), r.x - (q.x + q.w)), Math.max(0, q.y - (r.y + r.h), r.y - (q.y + q.h)));
for (const id of homes("suburbs")) ok(Math.min(...parks.map(q => gap(P[id].rect, q))) <= 20, `${id}: a park within twenty cells`);
// family housing for tiers 1-3: houses for 1-2, starter homes for tier 3 alone
{
  const seen = {};
  for (let i = 0; i < 6000; i++) { const sub = { slug: `east-${i}`, ...legacyTier(i) }, h = SIM.homeOf(sub); if (homes("suburbs").includes(h)) (seen[h] ||= new Set()).add(SIM.classOf(sub)); }
  ok(SUBURB_STARTERS.every(id => seen[id] && [...seen[id]].every(t => t === 3)), `the starter homes house tier 3 and nobody else (${SUBURB_STARTERS.map(id => `${id} ${[...(seen[id] || [])].join("")}`).join(", ")})`);
  ok(SUBURB_HOUSES.every(id => seen[id] && [...seen[id]].every(t => t === 1 || t === 2)), "the houses house tiers 1-2");
}

// ---- THE EAST LINE ---------------------------------------------------------------------------------------
{
  const L = SIM.LINE.east;
  ok(L && SIM.linesOn().includes(L) && L.index === SIM.LINES.indexOf(L), "THE EAST LINE is in service, at its own index");
  ok(L.stations.map(s => s.name).join() === "ARCHIVE (EAST LINE),SUBURBS NORTH,SUBURBS MALL,SUBURBS SOUTH,AIRPORT TERMINAL", `its stations, in order (${L.stations.map(s => s.name).join(", ")})`);
  const arc = L.stops.find(s => s.stationId === "east-archive"), loop = SIM.STATIONS.archive;
  ok(Math.min(...L.stops.filter(s => s.stationId === "east-archive").map(s => Math.hypot(s.gate.x - loop.gate.x, s.gate.y - loop.gate.y))) <= 18, "the Archive interchange: within the interchange walk (sim XFER_R, 18 cells) of the Loop's Archive station");
  const air = L.stops.find(s => s.stationId === "airport-terminal"), hall = B["departures-hall"].rect;
  ok(air.gate.y >= hall.y + hall.h - 0.5 && air.gate.x >= hall.x && air.gate.x <= hall.x + hall.w + 4, "AIRPORT TERMINAL at the departures hall's door");
  // the busiest car (the plan builder's counts at 2,000; bench-phase2.mjs measures 5,000)
}

// ---- the aircraft ------------------------------------------------------------------------------------------
{
  const field = B["the-airfield"].rect;
  let west = 0, offField = 0, n = 0, maxAt = 0, curfew = 0, overlap = 0;
  for (let m = 0; m < 3 * 24 * 60; m += 0.5) {
    const T = 24 * 300 + m / 60, ps = AIR.planesAt(T), h = ((T % 24) + 24) % 24;
    n += ps.length; maxAt = Math.max(maxAt, ps.length);
    for (const p of ps) {
      if (p.x < D.airport.rect.x - 1e-9) west++;   // never over the Suburbs or the core
      if (p.alt <= 0.01 && !(p.x >= field.x && p.x <= field.x + field.w && p.y >= field.y && p.y <= field.y + field.h)) offField++;
      if ((h >= 23.5 || h < 4.9) && p.alt <= 0.01 && p.phase !== "at-stand") curfew++;
    }
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) if (Math.abs(ps[i].alt - ps[j].alt) < 1 && Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y) < 5) overlap++;
  }
  ok(n > 0 && west === 0, `the aircraft never cross west of the airport: the approach and the climb-out are east of the field (${west} points west)`);
  ok(offField === 0, `on the ground, always on the airfield (${offField} off it)`);
  ok(curfew === 0, "no movements in the curfew (23:30-05:00)");
  ok(overlap === 0, `no two aircraft in the same place (${overlap})`);
  ok(JSON.stringify(AIR.planesAt(24 * 300 + 9.37)) === JSON.stringify(AIR.planesAt(24 * 300 + 9.37)) && AIR.planesAt(24 * 300 + 9.37).length > 0, "deterministic: the same machine time, the same aircraft");
  ok(AIR.flightBoard(24 * 300 + 9).length === 4 && AIR.flightBoard(24 * 300 + 9).every(r => /^(ARR|DEP)$/.test(r.kind)), "the departures board lists the next movements");
  console.log(`  aircraft: up to ${maxAt} at once, ${AIR.FLIGHTS_A_DAY} arrivals and ${AIR.FLIGHTS_A_DAY} departures a day`);
}

// ---- the door: the departures hall links to #arrivals -----------------------------------------------------
{
  const f = FUNNEL_OF["departures-hall"], btn = funnelButtons("departures-hall");
  ok(f && f.kind === "arrivals" && btn.some(b => b.spec.kind === "arrivals" && b.spec.go === "#arrivals"), "the departures hall offers ARRIVALS (#arrivals)");
}

// ---- the buildings are drawn ---------------------------------------------------------------------------
for (const b of SIM.BUILDINGS.filter(x => x.district === "suburbs" || x.district === "airport")) {
  if (SIM.OPEN_LOTS.has(b.id)) continue;
  const m = massingOf(b);
  ok(m && m.parts.length, `${b.id}: massed (${b.arch})`);
}

const cap = (d) => homes(d).reduce((n, id) => n + P[id].cap, 0);
console.log(`  the Suburbs: ${homes("suburbs").length} estates, ${cap("suburbs")} homes; the city: ${Object.values(P).filter(p => p.kind === "home").reduce((n, p) => n + p.cap, 0)} homes`);
console.log(fails ? `check-east: ${fails} of ${checks} FAILED` : `check-east: ${checks} checks passed`);
process.exit(fails ? 1 : 0);
