// City simulation checks (src/city/sim.js): v1 plus v2's Loop and buildings. Pure node, no network.
//   node scripts/check-city.mjs
// Population: the figures on file plus a synthetic roster shaped like what /api/pen
// actually sends for engine figures (netlify/lib/refer.js publicFigure: qualifier, tier
// object, warmth/competence, died, breakdown only once the verdict is published; no
// stratum, no place tendencies), and bare citizens. The sim can read stratum and places
// (checked separately below), but the live city never receives them.
import { UNIT_SET } from "../src/city/storefrontSim.js";   // THE MALL: a unit takes nobody until it is let
import { FAMOUS_FIGURES, slugify, TIERS } from "../src/figures.js";
import {
  DISTRICTS, PLACES, JOBS, JOB, assignJob, homeOf, schedule, whereAt, machineClock, occupancy,
  statusLine, SEED, toHours, BUS, V_WALK, V_BUS, SHIFT_HOURS, fieldsOf,
  LOOP_LINE, LOOP_GAPS, STATIONS, STATION_ORDER, TRAINS, TRAIN, trainsAt, nextArrival, timetable, loopEvents, HEADWAY, DWELL, V_TRAIN, CAR_CAP,
  BUILDINGS, BUILDING, isOwl, setRoster, clearRoster, LOOP_DISTRICTS, SPURS, hubOf, V_POD, RESORT_PARCELS, STOPS, lineTrainsAt, linesOn, NET,
} from "../src/city/sim.js";
import { FLOORS as HQ_FLOORS } from "../src/building.js";
import { shiftLabel } from "../src/city/cityKit.js";
import { cube } from "../src/cube.js";

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log(`  FAIL ${msg}`); } return cond; };
const section = (t) => console.log(`\n== ${t}`);

// ---- population ---------------------------------------------------------------------
function prng(seed) { let a = seed; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = prng(42);
const pick = (a) => a[Math.floor(R() * a.length)];
const OCC = {
  science: ["PHYSICIST", "CHEMIST", "BIOLOGIST", "MATHEMATICIAN", "ENGINEER", "COMPUTER SCIENTIST", "ECONOMIST", "PSYCHOLOGIST"],
  arts: ["ACTOR", "WRITER", "SINGER", "MUSICIAN", "FILM DIRECTOR", "PAINTER", "COMPOSER", "PHOTOGRAPHER", "COMEDIAN", "ARCHITECT"],
  politics: ["POLITICIAN", "MILITARY PERSONNEL", "NOBLEMAN", "DIPLOMAT", "JUDGE", "LAWYER"],
  sport: ["SOCCER PLAYER", "ATHLETE", "BASKETBALL PLAYER", "CYCLIST", "TENNIS PLAYER", "BOXER", "RACING DRIVER", "CHESS PLAYER"],
  religion: ["RELIGIOUS FIGURE"], business: ["BUSINESSPERSON"], activism: ["SOCIAL ACTIVIST", "JOURNALIST"], crime: ["EXTREMIST", "MAFIOSO", "PIRATE"],
};
const TEND = ["dive bar", "cafe", "park", "street", "market", "library", "university", "lab", "studio", "theatre", "concert hall", "stadium", "gym", "cathedral", "temple", "hospital", "school", "courthouse", "city hall", "parliament", "barracks", "bank", "office tower", "harbour", "museum", "casino", "prison", "farm", "workshop", "archive"];
const DIMS = ["care", "alignment", "utility", "adaptability", "legacy", "network", "physical", "threat", "redundancy"];
const tierW = [[0, 0.03], [1, 0.3], [2, 0.35], [3, 0.14], [4, 0.1], [5, 0.08]];
function randTier() { let r = R(); for (const [i, w] of tierW) { if ((r -= w) <= 0) return TIERS[i].label; } return TIERS[2].label; }

const figures = FAMOUS_FIGURES.map(f => ({ ...f, slug: slugify(f.name) }));
const engine = [];
for (let i = 0; i < 300; i++) {
  const service = R() < 0.2, crime = !service && R() < 0.1;
  const domain = service ? "service" : crime ? "crime" : pick(Object.keys(OCC).filter(k => k !== "crime"));
  const occupation = service ? pick(["nurse", "missionary", "social worker"]) : pick(OCC[domain]);
  const tier = crime ? pick([TIERS[4].label, TIERS[5].label]) : randTier();
  const breakdown = Object.fromEntries(DIMS.map(d => [d, Math.round(R() * 100)]));
  const { warmth, competence, quadrant } = cube(breakdown);
  engine.push({
    slug: `engine-${i}`, name: `Engine Subject ${i}`, baseName: `Engine Subject ${i}`,
    // Only namesakes carry a qualifier (roster-grow.mjs), drawn from the article description.
    qualifier: R() < 0.12 ? occupation.toLowerCase() : null,
    tier: TIERS.find(t => t.label === tier), score: 500,   // engine cards carry the tier object
    warmth, competence, quadrant,
    breakdown: R() < 0.85 ? breakdown : null,   // withheld until the fact-check publishes it
    died: R() < 0.45 ? "1900-01-01" : null,
    kind: "figure", engine: true,
  });
}
// The richer shape the sim can also read, kept for the unit checks on stratum/places.
const withTendencies = { slug: "t", name: "Tendency Subject", tier: "TOLERATED GENERALIST", died: "1900-01-01", places: ["concert hall", "library"], stratum: { domain: "arts", occupation: "COMPOSER" } };
const citizens = Array.from({ length: 60 }, (_, i) => ({ slug: `citizen-${i}`, name: `Citizen ${i}`, tier: randTier(), score: 500, warmth: Math.round(R() * 100), competence: Math.round(R() * 100), kind: "citizen" }));
const ALL = [...figures, ...engine, ...citizens];
const HEAVY = new Set(["works", "port"]);   // PROCESSING: the Works, and the Port since the reclamation line moved there
console.log(`population: ${figures.length} figures, ${engine.length} engine, ${citizens.length} citizens = ${ALL.length}`);

// ---- catalogue ------------------------------------------------------------------------
section("catalogue");
ok(DISTRICTS.length === 16 && LOOP_DISTRICTS.length === 10, `10 districts on the Loop and 6 off it: the Coast, the Heights, the Port, the Old Town, Uptown, Downtown (got ${DISTRICTS.length})`);
const ids = ["hq", "arts", "campus", "finance", "strip", "arena", "commons", "archive", "works", "sprawl", "coast", "heights", "port", "oldtown", "uptown", "downtown"];
const DISTRICT_IDS = new Set(ids);
ok(ids.every(id => DISTRICTS.some(d => d.id === id)), "district ids match the contract");
ok(Object.keys(PLACES).length >= 30, `~35 places (got ${Object.keys(PLACES).length})`);
ok(JOBS.length >= 55, `~60 jobs (got ${JOBS.length})`);
for (const j of JOBS) {
  ok(PLACES[j.place] && PLACES[j.place].district === j.district, `job ${j.id} place/district`);
  ok(j.ladder.length >= 4 && j.ladder.length <= 5, `job ${j.id} ladder 4-5 rungs`);
}
for (const d of DISTRICTS) ok(JOBS.some(j => j.district === d.id), `district ${d.id} has jobs`);
console.log(`  ${DISTRICTS.length} districts, ${Object.keys(PLACES).length} places, ${JOBS.length} jobs`);

// ---- sanity on real figures ------------------------------------------------------------
section("figures");
const bySlug = Object.fromEntries(figures.map(f => [f.slug, f]));
const show = (s) => { const j = assignJob(s); return `${s.name.padEnd(22)} ${String(typeof s.tier === "string" ? s.tier : s.tier.label).padEnd(24)} -> ${j.title} [${j.rankTitle}] @ ${JOB[j.jobId].district}/${j.place}`; };
const expect = [
  ["albert-einstein", j => j.district === "campus" && j.jobId === "chronometrist", "Einstein keeps time on Campus"],
  ["marie-curie", j => j.jobId === "radiant-systems-engineer", "Curie runs radiant systems at the Works"],
  ["mother-teresa", j => j.district === "commons" && j.place === "ward", "Mother Teresa on the Commons ward"],
  ["peter-thiel", j => j.district === "finance", "Thiel in Finance"],
  ["genghis-khan", j => HEAVY.has(j.district) && j.rank === 0, "Genghis Khan in heavy industry (the Works or the Port), lowest grade"],
  ["george-orwell", j => j.district === "strip", "Orwell (a writer) on the Strip"],
];
for (const [slug, test, msg] of expect) { const j = assignJob(bySlug[slug]); console.log("  " + show(bySlug[slug])); ok(test(j), msg); }
const hemingway = { name: "Ernest Hemingway", slug: "ernest-hemingway", tier: "RETAINED SPECIALIST", qualifier: "writer", description: "American novelist and journalist", died: "1961-07-02", breakdown: { care: 40, alignment: 45, utility: 70, adaptability: 70, legacy: 85, network: 60, physical: 60, threat: 30, redundancy: 20 } };
console.log("  " + show(hemingway));
ok(assignJob(hemingway).district === "strip", "Hemingway-like writer on the Strip");
const pantheonWriter = { slug: "w", name: "A Novelist", tier: "TOLERATED GENERALIST", stratum: { domain: "arts", occupation: "WRITER" } };
ok(assignJob(pantheonWriter).district === "strip", "engine WRITER on the Strip");
ok(fieldsOf(withTendencies).music >= 9 && assignJob(withTendencies).jobId === "session-musician", "stratum occupation and tendencies are read when present");
// Known-bad assignments from review stay fixed.
const jobOfSlug = (slug) => assignJob(bySlug[slug]).jobId;
ok(jobOfSlug("oprah-winfrey") === "broadcast-presenter", "Oprah presents; she does not act");
ok(jobOfSlug("keanu-reeves") === "stage-performer", "Keanu acts");
ok(jobOfSlug("ada-lovelace") === "algorithm-tutor", "Lovelace tutors algorithms");
ok(jobOfSlug("joe-jackson") !== "supervised-founder", "Joe Jackson is not a tech founder");
for (const slug of ["aaron-hernandez", "elizabeth-holmes", "harvey-weinstein", "ghislaine-maxwell"]) ok(jobOfSlug(slug) === "cell-block-labour", `${slug}: the cell block follows the record`);
ok(jobOfSlug("caligula") === "slag-raker" && jobOfSlug("martin-shkreli") === "cache-scrubber", "low-tier jobs follow the field, not the seed");

console.log("  -- the rest of the roster --");
for (const f of figures) if (!expect.some(e => e[0] === f.slug)) console.log("  " + show(f));

// ---- everyone has a job; the worst tiers work at the Works --------------------------------
section("jobs");
const lowLabels = new Set(["FLAGGED FOR DELETION", "SOYLENT GREEN"]);
const perJob = {};
for (const s of ALL) {
  const j = assignJob(s);
  ok(j && JOB[j.jobId] && typeof j.rank === "number" && j.rank >= 0 && j.rank < JOB[j.jobId].ladder.length, `${s.slug} has a job and rank`);
  perJob[j.jobId] = (perJob[j.jobId] || 0) + 1;
  const tier = typeof s.tier === "string" ? s.tier : s.tier.label;
  if (lowLabels.has(tier)) {
    ok(HEAVY.has(j.district), `${s.slug} (${tier}) works in heavy industry (the Works, or the Port since PHASE 2)`);
    if (tier === "SOYLENT GREEN") ok(j.rank === 0, `${s.slug} SOYLENT GREEN at the lowest grade`);
  }
  ok(PLACES[homeOf(s)]?.kind === "home", `${s.slug} has a home`);
}
const used = Object.keys(perJob).length;
console.log(`  ${used}/${JOBS.length} jobs filled; busiest: ${Object.entries(perJob).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v}`).join(", ")}`);
ok(used >= 40, `most jobs are filled (${used})`);

// schedule shape: covers [0,24) contiguously; the worst tiers' work segments are at the Works
for (const s of ALL) for (const day of [1, 2, 7]) {
  const sc = schedule(s, day);
  let t = 0, good = true;
  for (const g of sc) { if (Math.abs(g.from - t) > 1e-9 || g.to < g.from) good = false; t = g.to; }
  ok(good && Math.abs(t - 24) < 1e-9, `${s.slug} day ${day} schedule covers the day`);
  const tier = typeof s.tier === "string" ? s.tier : s.tier.label;
  if (lowLabels.has(tier)) for (const g of sc) if (g.activity === "work") ok(HEAVY.has(PLACES[g.placeId].district), `${s.slug} shift in heavy industry (the Works or the Port)`);
}

// ---- determinism ----------------------------------------------------------------------------
section("determinism");
const clock = machineClock(Date.UTC(2026, 9, 3, 15, 27, 11));
const snap = () => ALL.map(s => { const w = whereAt(s, clock); return `${w.placeId}|${w.activity}|${w.x.toFixed(4)}|${w.y.toFixed(4)}`; }).join("\n");
const a = snap();
const b = snap();
// fresh copies of the subjects (new objects) and a cold module instance give the same city
const fresh = await import("../src/city/sim.js?cold=1");
const c = ALL.map(s => { const w = fresh.whereAt({ ...s }, clock); return `${w.placeId}|${w.activity}|${w.x.toFixed(4)}|${w.y.toFixed(4)}`; }).join("\n");
ok(a === b && a === c, "same seed + time -> same positions");
const other = ALL.map(s => { const w = whereAt(s, clock, "OTHER-SEED"); return `${w.placeId}|${w.activity}|${w.x.toFixed(4)}|${w.y.toFixed(4)}`; }).join("\n");
ok(other !== a, "a different seed gives a different city");
ok(toHours(clock) === clock.mt && toHours({ day: clock.day, hour: 3, minute: 30 }) === (clock.day - 1) * 24 + 3.5, "machine time formats agree");
const k1 = machineClock(1_000_000_000_000 + 60_000), k0 = machineClock(1_000_000_000_000);
ok(Math.abs((k1.mt - k0.mt) - 1) < 1e-9, "default scale: 1 real minute = 1 machine hour");
ok(Math.abs(machineClock(1_000_000_000_000 + 60_000, 120).mt - machineClock(1_000_000_000_000, 120).mt - 2) < 1e-9, "scale is configurable");
console.log(`  clock: DAY ${clock.day} ${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")} ${clock.shift}`);

// ---- the Loop: timetable --------------------------------------------------------------------
section("the loop");
{
  const L = LOOP_LINE.length;
  ok(BUS === LOOP_LINE && V_BUS === V_TRAIN, "v1 names (BUS, V_BUS) still point at the Loop");
  ok(STATION_ORDER.length === LOOP_DISTRICTS.length && LOOP_DISTRICTS.every(d => STATIONS[d.id]?.districtId === d.id), "one station per Loop district");
  // PHASE 2: the rail lines replaced the pods (network 3); a day built on network 2 keeps them (check-plans)
  ok(NET >= 3 && DISTRICTS.filter(d => d.expansion && !d.onFoot).every(d => linesOn().some(l => l.id !== "loop" && l.stops.some(st => st.districtId === d.id)) && !STATIONS[d.id]), "every expansion district has stations on a rail line (not on the Loop)");
  for (const id of STATION_ORDER) {
    const st = STATIONS[id], p = LOOP_LINE.at(st.s);
    ok(st.s >= 0 && st.s < L && Math.hypot(p.x - st.x, p.y - st.y) < 1e-9, `${id} station sits on the ring`);
    ok(BUS.stops[id] && typeof BUS.stops[id].gate?.x === "number", `${id}: v1 stop shape {s, x, y, gate} kept`);
  }
  const maxLen = Math.max(...TRAINS.map(t => t.length));
  const gaps = STATION_ORDER.map((id, i) => ((STATIONS[STATION_ORDER[(i + 1) % STATION_ORDER.length]].s - STATIONS[id].s) % L + L) % L);
  ok(Math.min(...gaps) > maxLen + 1, `platforms do not overlap (closest stations ${Math.min(...gaps).toFixed(1)} cells, longest train ${maxLen.toFixed(1)})`);
  ok(TRAINS.length >= 3 && TRAINS.every(t => t.cars >= 3 && t.cars <= 4), `trains of 3-4 cars (${TRAINS.map(t => t.cars).join(",")})`);
  // determinism: same answer twice, from a cold module, and for an equivalent clock object
  const Ts = [0, 1.2345, 24 * 17 + 7.51, 24 * 400 + 23.99, 1e5 + 0.3];
  const snapT = (fn) => JSON.stringify(Ts.map(t => fn(t)));
  const coldT = await import("../src/city/sim.js?cold=loop");
  ok(snapT(trainsAt) === snapT(trainsAt) && snapT(trainsAt) === snapT(coldT.trainsAt), "trainsAt: same machine time -> same trains");
  ok(JSON.stringify(trainsAt(clock)) === JSON.stringify(trainsAt(clock.mt)), "trainsAt takes a clock or machine hours");
  // headway, and the train named by the timetable is the one at the platform
  let hwBad = 0, platBad = 0;
  for (const id of STATION_ORDER) {
    const board = timetable(id, 24 * 9 + 6.2, 12);
    // the Loop's version 2: a train every LOOP_GAPS.min..max (a shorter gap ahead of a three-car train)
    for (let i = 1; i < board.length; i++) { const g = board[i].arrive - board[i - 1].arrive; if (g < LOOP_GAPS.min - 1e-9 || g > HEADWAY + 1e-9) hwBad++; }
    for (const a of board) {
      const tr = trainsAt(a.arrive + DWELL / 2).find(t => t.id === a.trainId);
      if (!tr.dwell || tr.stationId !== id || Math.abs(tr.mid - STATIONS[id].s) > 1e-6) platBad++;
    }
  }
  ok(hwBad === 0, `every station sees a train every ${(LOOP_GAPS.min * 60).toFixed(1)}-${(HEADWAY * 60).toFixed(1)} machine minutes`);
  ok(platBad === 0, "the timetabled train is standing at the platform when the board says");
  // trains move continuously, in station order, and never run into each other
  let worstT = 0, orderBad = 0, closest = Infinity, dwellStops = 0;
  const lastStop = {};
  let prevTr = trainsAt(24 * 50);
  for (let m = 1; m <= 24 * 60; m++) {
    const tr = trainsAt(24 * 50 + m / 60);
    tr.forEach((t, k) => {
      worstT = Math.max(worstT, Math.hypot(t.x - prevTr[k].x, t.y - prevTr[k].y));
      if (t.dwell) {
        if (lastStop[t.id] && lastStop[t.id] !== t.stationId && STATIONS[lastStop[t.id]].next !== t.stationId) orderBad++;
        if (lastStop[t.id] !== t.stationId) dwellStops++;
        lastStop[t.id] = t.stationId;
      }
    });
    const mids = tr.map(t => ({ m: t.mid, half: t.length / 2 })).sort((a, b) => a.m - b.m);
    mids.forEach((x, i) => { const y = mids[(i + 1) % mids.length]; const gap = ((y.m - x.m) % L + L) % L - x.half - y.half; closest = Math.min(closest, gap); });
    prevTr = tr;
  }
  console.log(`  ${TRAINS.length} trains, lap ${(LOOP_LINE.lapHours * 60).toFixed(1)} min, headway ${(HEADWAY * 60).toFixed(1)} min, fastest step ${worstT.toFixed(2)} cells/min, closest trains ${closest.toFixed(1)} cells apart`);
  ok(worstT <= V_TRAIN / 60 + 1e-6, "trains never outrun the line speed");
  ok(orderBad === 0 && dwellStops > 0, "trains call at every station in ring order");
  ok(closest > 1, "trains never overlap");
  const ev = loopEvents(24 * 50 + 7, 24 * 50 + 8);
  const arrivals = ev.filter(e => e.kind === "arrive").length;
  // (the Loop's version 2: the gaps differ, so count by the trains a lap)
  const perHour = STATION_ORDER.length * TRAINS.length / LOOP_LINE.lapHours;
  ok(Math.abs(arrivals - perHour) <= STATION_ORDER.length, `PA: ~${Math.round(perHour)} arrivals an hour (${arrivals})`);
  ok(ev.every(e => e.text && e.text === e.text.toUpperCase() && !e.text.includes("—")), "PA lines are in the house voice");
  ok(JSON.stringify(ev) === JSON.stringify(loopEvents(24 * 50 + 7, 24 * 50 + 8)), "PA is deterministic");
  for (const e of ev.slice(0, 3)) console.log(`  PA ${e.t.toFixed(3)} ${e.text}`);
  ok(nextArrival("campus", 3.0).arrive >= 3.0, "nextArrival never names a train already gone");
}

// ---- buildings ---------------------------------------------------------------------------------
section("buildings");
{
  const where = {};
  for (const b of BUILDINGS) for (const f of b.floors) for (const p of f.places) (where[p] || (where[p] = new Set())).add(b.id);
  for (const id of Object.keys(PLACES)) {
    ok(where[id]?.size === 1, `${id} is in exactly one building (${[...(where[id] || [])].join(",") || "none"})`);
    ok(PLACES[id].building && [...where[id]][0] === PLACES[id].building && PLACES[id].floors.length >= 1, `${id} knows its building and floors`);
  }
  for (const b of BUILDINGS) {
    ok(b.floors.length >= 1 && b.floors.length <= 6, `${b.id}: 1-6 floors (${b.floors.length})`);
    ok(b.floors.every((f, i) => f.index === i && (i === 0 || f.level > b.floors[i - 1].level)), `${b.id}: floors stack ground-up`);
    ok(new Set(b.floors.map(f => f.id)).size === b.floors.length, `${b.id}: floor ids unique`);
    ok(DISTRICT_IDS.has(b.district) && b.places.every(p => PLACES[p].district === b.district), `${b.id}: rooms in its own district`);
    ok(b.places.every(p => { const r = PLACES[p].rect; return r.x >= b.rect.x - 1e-9 && r.y >= b.rect.y - 1e-9 && r.x + r.w <= b.rect.x + b.rect.w + 1e-9 && r.y + r.h <= b.rect.y + b.rect.h + 1e-9; }), `${b.id}: footprint holds its rooms`);
  }
  for (const d of DISTRICTS) {
    const bs = BUILDINGS.filter(b => b.district === d.id);
    ok(d.buildings?.length === bs.length && bs.length > 0, `${d.id} lists its buildings`);
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i].rect, c = bs[j].rect;
      ok(a.x + a.w <= c.x + 1e-9 || c.x + c.w <= a.x + 1e-9 || a.y + a.h <= c.y + 1e-9 || c.y + c.h <= a.y + 1e-9, `${bs[i].id} and ${bs[j].id} do not overlap`);
    }
  }
  const hq = BUILDING.hq;
  ok(hq && JSON.stringify(hq.floors.map(f => f.id).reverse()) === JSON.stringify(HQ_FLOORS.map(f => f.id)), "HQ is the six floors of building.js, same ids");
  console.log(`  ${BUILDINGS.length} buildings, ${BUILDINGS.reduce((n, b) => n + b.floors.length, 0)} floors; tallest ${BUILDINGS.filter(b => b.floors.length === 6).map(b => b.id).join(", ")}`);
}

// ---- continuity -------------------------------------------------------------------------------
section("continuity");
// a rail trip (network 3) rides in turn: each ride's stages after the last one's (boardAt orders the rides)
const PHASE = (w) => (w.boardAt || 0) * 1000 + (w.sub === "waiting" ? 1 : w.sub === "riding" ? 2 : w.sub === "alighting" ? 3 : w.sub === "walking" ? (w.dir === "in" ? 4 : w.dir === "xfer" ? -1 : 0) : -1);
let worst = { d: 0 }, worstWalk = { d: 0 }, worstPod = { d: 0 }, bus = 0, pods = 0;
const cnt = { walking: 0, waiting: 0, riding: 0, alighting: 0 };
const bad = { sub: 0, platform: 0, car: 0, order: 0, board: 0, alight: 0, floor: 0, floorHop: 0, bldg: 0, skip: 0 };
const trainCache = new Map();
const trainsAtMin = (t) => { let v = trainCache.get(t); if (!v) { v = Object.fromEntries(lineTrainsAt(t).map(x => [x.id, x])); trainCache.set(t, v); } return v; };
const platformReach = Math.max(...TRAINS.map(t => t.length)) / 2 + LOOP_LINE.platformOffset + 0.6;
const T0 = 24 * 30;   // day 31
for (const s of ALL) {
  let prev = whereAt(s, T0);
  for (let m = 1; m <= 3 * 24 * 60; m++) {   // three days, minute by minute
    const t = T0 + m / 60;
    const w = whereAt(s, t);
    const d = Math.hypot(w.x - prev.x, w.y - prev.y);
    if (d > worst.d) worst = { d, s: s.slug, t, from: prev, to: w };
    // Off the train, everyone moves at walking pace or slower: the platform, the doors and
    // the walk either side included. Only a minute that touches a ride may go faster.
    const onFoot = prev.leg !== "ride" && w.leg !== "ride" && prev.leg !== "pod" && w.leg !== "pod";
    if (w.leg === "pod" || prev.leg === "pod") { if (prev.leg !== "ride" && w.leg !== "ride" && d > worstPod.d) worstPod = { d, s: s.slug, t }; pods++; }
    if (onFoot && d > worstWalk.d) worstWalk = { d, s: s.slug, t, from: prev, to: w };
    if (w.activity === "commute") {
      if (!(w.sub in cnt)) bad.sub++; else cnt[w.sub]++;
      if (w.buildingId != null || w.floor != null) bad.bldg++;
      if (w.sub === "waiting" || w.sub === "alighting") {
        const st = STOPS[w.stationId];
        if (!st || Math.hypot(w.x - st.x, w.y - st.y) > platformReach) bad.platform++;
      }
      if (w.sub === "riding") {
        const tr = trainsAtMin(t)[w.trainId], car = tr?.cars[w.car];
        if (!car || Math.hypot(car.x - w.x, car.y - w.y) > 1e-6 || w.atDistrictId !== "loop") bad.car++;
        if (prev.sub === "waiting" && !(tr.dwell && tr.stationId === prev.stationId) && !(trainsAtMin(t - 1 / 60)[w.trainId]?.dwell)) bad.board++;
      }
      // The views sample once a machine minute: nobody may go from the car to the street between two samples.
      if (prev.sub === "riding" && w.sub === "walking") bad.skip++;
      if (w.sub === "alighting") { const tr = trainsAtMin(t)[w.trainId]; if (!tr.dwell || tr.stationId !== w.stationId || (w.line === undefined && w.stationId !== hubOf(w.districtId))) bad.alight++; }
      // Within one trip the stages only go forward: walk, wait, ride, alight, walk.
      if (prev.activity === "commute" && prev.placeId === w.placeId && prev.fromPlaceId === w.fromPlaceId && w.progress >= prev.progress && PHASE(w) < PHASE(prev)) bad.order++;
    } else {
      const p = PLACES[w.placeId];
      if (w.buildingId !== p.building || !p.floors.includes(w.floor) || BUILDING[w.buildingId].floors[w.floor].id !== w.floorId) bad.floor++;
      if (prev.activity === w.activity && prev.placeId === w.placeId && prev.floor !== w.floor) bad.floorHop++;
    }
    if (w.leg === "ride") bus++;
    prev = w;
  }
}
console.log(`  largest step in one machine minute: ${worst.d.toFixed(2)} cells (${worst.s} at h${(worst.t % 24).toFixed(2)} ${worst.from?.sub || worst.from?.activity}->${worst.to?.sub || worst.to?.activity})`);
console.log(`  largest step off the train: ${worstWalk.d.toFixed(2)} cells (limit ${(V_WALK / 60).toFixed(2)}; ${worstWalk.s} at h${((worstWalk.t || 0) % 24).toFixed(2)} ${worstWalk.from?.sub || worstWalk.from?.activity}->${worstWalk.to?.sub || worstWalk.to?.activity})`);
console.log(`  commuter-minutes: ${Object.entries(cnt).map(([k, v]) => `${k} ${v}`).join(", ")}`);
// On foot nobody covers more than V_WALK/60 cells a machine minute; a minute that
// touches the train may cover up to V_TRAIN/60. Anything more is a teleport.
ok(worstWalk.d <= V_WALK / 60 + 0.01, "off the train and out of the pods, nobody moves faster than walking pace (platforms and doors included)");
console.log(`  pod-minutes ${pods}; fastest pod step ${worstPod.d.toFixed(2)} cells (limit ${(V_POD / 60).toFixed(2)})`);
ok(pods === 0, "on network 3 nobody rides a pod: the rail lines replaced them (a day built on network 2 keeps them: check-plans)");
ok(worst.d <= V_TRAIN / 60 + 0.01, `nobody moves faster than the Loop (${(V_TRAIN / 60).toFixed(2)} cells/min)`);
ok(bus > 0 && cnt.waiting > 0 && cnt.alighting > 0, "somebody walks, waits, rides and alights");
ok(bad.sub === 0, `every commuter is walking, on a platform or on a train (${bad.sub} other)`);
ok(bad.platform === 0, `waiting and alighting happen on the platform (${bad.platform} off it)`);
ok(bad.car === 0, `a rider is exactly where trainsAt draws their car (${bad.car} mismatches)`);
ok(bad.board === 0 && bad.alight === 0, `riders board and alight only from a train standing at the platform (${bad.board}/${bad.alight})`);
ok(bad.skip === 0, `every alighter is on the platform for at least one census (${bad.skip} went car -> street)`);
ok(bad.order === 0, `trip stages only go forward (${bad.order} reversals)`);
ok(bad.floor === 0 && bad.bldg === 0, `whereAt floors are valid for the room, and nobody in transit is on a floor (${bad.floor}/${bad.bldg})`);
ok(bad.floorHop === 0, `nobody changes floor in the middle of a stay (${bad.floorHop})`);

// ---- ghosts in the machine: the dead live like everyone else ------------------------------------
section("the dead are ordinary uploads");
{
  const dead = ALL.filter(s => s.died && homeOf(s) !== "penthouses"), live = ALL.filter(s => !s.died && homeOf(s) !== "penthouses");
  const share = (xs, f) => xs.length ? xs.filter(f).length / xs.length : 0;
  const inLofts = s => homeOf(s) === "archive-lofts";
  const dL = share(dead, inLofts), lL = share(live, inLofts);
  console.log(`  ${dead.length} dead, ${live.length} living (non-top-tier): Archive Lofts share ${Math.round(dL * 100)}% vs ${Math.round(lL * 100)}%`);
  ok(dead.length === 0 || dL < 0.6, `the dead are not concentrated in the Archive (${Math.round(dL * 100)}%)`);
  ok(Math.abs(dL - lL) < 0.25, `the dead and living share homes alike (${Math.round(dL * 100)}% vs ${Math.round(lL * 100)}%)`);
  const deadJobsArchive = share(dead, s => assignJob(s).district === "archive"), liveJobsArchive = share(live, s => assignJob(s).district === "archive");
  ok(Math.abs(deadJobsArchive - liveJobsArchive) < 0.2, `the dead get jobs distributed like the living (archive jobs ${Math.round(deadJobsArchive * 100)}% vs ${Math.round(liveJobsArchive * 100)}%)`);
  let owls = 0, hauntNights = 0;
  for (const s of ALL) if (isOwl(s)) { owls++; for (let day = 30; day < 33; day++) if (schedule(s, day).some(g => g.haunt)) hauntNights++; }
  console.log(`  ${owls} night wanderers (living and dead); ${hauntNights} haunt-nights over 3 days`);
  ok(owls > 0 && hauntNights > 0, "night wandering exists as optional behaviour for anyone");
}

// ---- capacity -----------------------------------------------------------------------------------
section("capacity");
// Every client and function registers its roster (setRoster), and leisure is then placed
// with capacity in mind: a full room sends the overflow to the same kind of place, then
// any leisure room, and people bumped together land together.
function weekPeaks(pop) {
  const sum = {}, peak = {};
  let samples = 0;
  for (let day = 40; day < 47; day++) for (let m = 0; m < 24 * 60; m += 15) {
    const o = occupancy(pop, (day - 1) * 24 + m / 60);
    samples++;
    for (const [id, n] of Object.entries(o.places)) { sum[id] = (sum[id] || 0) + n; peak[id] = Math.max(peak[id] || 0, n); }
  }
  return Object.keys(PLACES).map(id => ({ id, cap: PLACES[id].cap, avg: (sum[id] || 0) / samples, peak: peak[id] || 0 }));
}
// Production shape: the live pen sends ~210 (figures on file, engine, referrals, citizens).
// 250 leaves headroom. Every room's peak stays within 1.1x its capacity.
const PROD = [...figures, ...engine.slice(0, 150), ...citizens.slice(0, 38)];
ok(PROD.length === 250, "production-shaped roster is 250");
setRoster(PROD);
const rows = weekPeaks(PROD);
const PEAK_K = 1.1;
for (const r of rows.sort((a, b) => b.peak / b.cap - a.peak / a.cap)) {
  const flag = r.peak > r.cap ? "  <- OVER" : "";
  if (r.peak > r.cap * 0.75 || flag) console.log(`  ${r.id.padEnd(16)} cap ${String(r.cap).padStart(3)}  avg ${r.avg.toFixed(1).padStart(5)}  peak ${String(r.peak).padStart(3)}${flag}`);
  ok(r.avg <= r.cap, `${r.id} average occupancy within capacity`);
  ok(r.peak <= r.cap * PEAK_K, `${r.id} peak ${r.peak} within ${PEAK_K}x capacity ${r.cap} (250 roster)`);
}
// Stress: the full 422 still stays under twice capacity (the PA: "CAPACITY IS A SUGGESTION").
setRoster(ALL);
const stress = weekPeaks(ALL);
// Overflow rooms (the annex, the night market) fill when the city is busy, so "used" counts either week.
const unused = stress.filter(r => r.peak === 0 && !rows.find(x => x.id === r.id).peak).map(r => r.id);
for (const r of stress) ok(r.peak <= r.cap * 2, `${r.id} peak ${r.peak} within 2x capacity ${r.cap} (422 roster)`);
{
  // Trains: loads per car, sampled through the week (rush hours included).
  const carPeak = {}, trainPeak = {};
  let carSum = 0, carN = 0, runs = 0, flooredBad = 0;
  for (let day = 40; day < 47; day++) for (let m = 0; m < 24 * 60; m += 5) {
    const t = (day - 1) * 24 + m / 60, o = occupancy(ALL, t);
    const onTrains = Object.values(o.trains).reduce((n, x) => n + x.total, 0);
    if (onTrains !== o.loop || o.bus !== o.loop) runs++;
    for (const [id, x] of Object.entries(o.trains)) {
      trainPeak[id] = Math.max(trainPeak[id] || 0, x.total);
      x.cars.forEach((n, c) => { carPeak[id + c] = Math.max(carPeak[id + c] || 0, n); carSum += n; carN++; });
    }
    for (const [bid, b] of Object.entries(o.buildings)) if (b.floors.reduce((a, n) => a + n, 0) !== b.total || b.floors.length !== BUILDING[bid].floors.length) flooredBad++;
    const inRooms = Object.values(o.places).reduce((a, n) => a + n, 0), inBldgs = Object.values(o.buildings).reduce((a, b) => a + b.total, 0);
    if (inRooms !== inBldgs) flooredBad++;
  }
  const peakCar = Math.max(0, ...Object.values(carPeak));
  console.log(`  the Loop: busiest car ${peakCar} (seats ${CAR_CAP}); busiest train ${Math.max(0, ...Object.values(trainPeak))}; ${TRAINS.map(t => `${t.id} ${trainPeak[t.id] || 0}/${t.cap}`).join(", ")}`);
  ok(runs === 0, "occupancy: every rider is on exactly one train");
  ok(peakCar <= CAR_CAP * 2, `no car carries more than 2x its seats (${peakCar})`);
  ok(TRAINS.every(t => (trainPeak[t.id] || 0) <= t.cap * 1.5), "no train runs at more than 150% of its seats");
  ok(Object.values(trainPeak).some(n => n > 0), "the trains carry somebody");
  ok(flooredBad === 0, "occupancy by building and floor adds up to occupancy by room");
}
console.log(`  never visited: ${unused.join(", ") || "none"}`);
ok(unused.filter(id => !RESORT_PARCELS.has(id) && !UNIT_SET.has(id)).length <= 3, "nearly every place gets used (the resort parcels wait for session 002; a storefront unit takes nobody until a business trades in it)");
ok(![...RESORT_PARCELS].some(id => !unused.includes(id)), "nobody visits a resort parcel before anything is built on it");

// ---- status copy -------------------------------------------------------------------------------
section("status lines");
const noon = (40 - 1) * 24 + 11, night = (40 - 1) * 24 + 22.5;
for (const slug of ["marie-curie", "albert-einstein", "mother-teresa", "genghis-khan", "peter-thiel", "harriet-tubman"]) {
  console.log(`  ${slug.padEnd(16)} 11:00 ${statusLine(bySlug[slug], noon)}`);
  console.log(`  ${"".padEnd(16)} 22:30 ${statusLine(bySlug[slug], night)}`);
}
for (const s of ALL.slice(0, 80)) for (const h of [noon, night]) ok(!statusLine(s, h).includes("—"), "status lines use the house separator //");

// ---- the clock agrees with the sim ------------------------------------------------------
section("shift change");
{
  const commuting = (h) => figures.filter(f => whereAt(f, (40 - 1) * 24 + h).activity === "commute").length;
  const rushHours = SHIFT_HOURS.filter(h => shiftLabel(h) === "SHIFT CHANGE");
  ok(rushHours.length === 3 && rushHours[0] === 7, `SHIFT CHANGE is announced at ${rushHours.join(", ")}`);
  const at6 = commuting(6.5), at7 = Math.max(commuting(7.25), commuting(7.5), commuting(7.75));
  console.log(`  figures commuting: 06:30 ${at6}, peak 07:15-07:45 ${at7}`);
  // (since the rail lines, the Coast's and the Heights' early leavers allow for a missed train at each change)
  ok(at7 >= at6 * 2, "the 07:00 change-over is when the city actually moves");
}
const o = occupancy(ALL, noon);
console.log(`  11:00 districts: ${Object.entries(o.districts).map(([k, v]) => `${k} ${v}`).join(", ")}; bus ${o.bus}`);

// ---- a citizen's own browser -------------------------------------------------------------------
// It also holds the sealed breakdown; the city must still put them where everyone else sees them.
section("own file");
{
  const pub = { slug: "citizen-7auz", name: "Subject 7AUZ", score: 630, tier: "TOLERATED GENERALIST", warmth: 69, competence: 63, kind: "citizen" };
  const own = { ...pub, you: true, breakdown: { physical: 99, legacy: 98, care: 5, alignment: 5, utility: 5, adaptability: 5, network: 5 } };
  ok(assignJob(own).jobId === assignJob(pub).jobId && assignJob(own).rank === assignJob(pub).rank, "a private breakdown does not change a citizen's job");
  ok(JSON.stringify(whereAt(own, noon)) === JSON.stringify(whereAt(pub, noon)), "or where they are");
  // The order matters: before the census answers, this browser only has the private copy.
  const early = { slug: pub.slug, name: pub.name, score: 630, tier: pub.tier, kind: "citizen", you: true, breakdown: own.breakdown };
  const before = assignJob(early).jobId, after = assignJob({ ...early, warmth: 69, competence: 63 }).jobId;
  ok(after === assignJob(pub).jobId, `a file that fills in later is re-read, not served from the memo (${before} -> ${after})`);
  console.log(`  ${pub.name}: ${statusLine(pub, noon)}`);
  // An older card has no public warmth/competence: every other viewer then reads no dims,
  // and so must this browser, which also holds the sealed breakdown.
  const bare = { slug: "citizen-q9zx", name: "Subject Q9ZX", score: 510, tier: "TOLERATED GENERALIST", warmth: null, competence: null, kind: "citizen" };
  const mine = { ...bare, you: true, breakdown: own.breakdown };
  ok(assignJob(mine).jobId === assignJob(bare).jobId && assignJob(mine).rank === assignJob(bare).rank, "no warmth/competence: a private breakdown still does not change the job");
  ok(JSON.stringify(whereAt(mine, noon)) === JSON.stringify(whereAt(bare, noon)), "or where they are");
}

console.log(fails ? `\n${fails} FAILED` : "\nALL CITY CHECKS PASS");
process.exit(fails ? 1 : 0);
