// City v1 simulation checks (src/city/sim.js). Pure node, no network.
//   node scripts/check-city.mjs
// Population: the figures on file plus a synthetic roster shaped like what /api/pen
// actually sends for engine figures (netlify/lib/refer.js publicFigure: qualifier, tier
// object, warmth/competence, died, breakdown only once the verdict is published; no
// stratum, no place tendencies), and bare citizens. The sim can read stratum and places
// (checked separately below), but the live city never receives them.
import { FAMOUS_FIGURES, slugify, TIERS } from "../src/figures.js";
import {
  DISTRICTS, PLACES, JOBS, JOB, assignJob, homeOf, schedule, whereAt, machineClock, occupancy,
  statusLine, SEED, toHours, BUS, V_WALK, V_BUS, SHIFT_HOURS, fieldsOf,
} from "../src/city/sim.js";
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
console.log(`population: ${figures.length} figures, ${engine.length} engine, ${citizens.length} citizens = ${ALL.length}`);

// ---- catalogue ------------------------------------------------------------------------
section("catalogue");
ok(DISTRICTS.length === 10, `10 districts (got ${DISTRICTS.length})`);
const ids = ["hq", "arts", "campus", "finance", "strip", "arena", "commons", "archive", "works", "sprawl"];
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
  ["genghis-khan", j => j.district === "works" && j.rank === 0, "Genghis Khan at the Works, lowest grade"],
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
    ok(j.district === "works", `${s.slug} (${tier}) works at the Works`);
    if (tier === "SOYLENT GREEN") ok(j.rank === 0, `${s.slug} SOYLENT GREEN at the lowest grade`);
  }
  ok(PLACES[homeOf(s)]?.kind === "home", `${s.slug} has a home`);
  if (s.died) ok(homeOf(s) === "crypt-dorms", `${s.slug} (deceased) lives in the Archive`);
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
  if (lowLabels.has(tier)) for (const g of sc) if (g.activity === "work") ok(PLACES[g.placeId].district === "works", `${s.slug} shift at the Works`);
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

// ---- continuity -------------------------------------------------------------------------------
section("continuity");
let worst = { d: 0 }, worstWalk = { d: 0 }, bus = 0;
const T0 = 24 * 30;   // day 31
for (const s of ALL) {
  let prev = whereAt(s, T0);
  for (let m = 1; m <= 3 * 24 * 60; m++) {   // three days, minute by minute
    const t = T0 + m / 60;
    const w = whereAt(s, t);
    const d = Math.hypot(w.x - prev.x, w.y - prev.y);
    if (d > worst.d) worst = { d, s: s.slug, t, from: prev, to: w };
    // Both samples on foot or standing, and not two ends of one commute (a ride shorter
    // than a minute can sit between two walking samples).
    const onFoot = prev.leg !== "ride" && w.leg !== "ride" && !(prev.activity === "commute" && w.activity === "commute");
    if (onFoot && d > worstWalk.d) worstWalk = { d, s: s.slug, t };
    if (w.leg === "ride") bus++;
    prev = w;
  }
}
console.log(`  largest step in one machine minute: ${worst.d.toFixed(2)} cells (${worst.s} at h${(worst.t % 24).toFixed(2)} ${worst.from?.activity}->${worst.to?.activity})`);
console.log(`  largest step off the bus: ${worstWalk.d.toFixed(2)} cells (limit ${(V_WALK / 60).toFixed(2)}; ${worstWalk.s} at h${((worstWalk.t || 0) % 24).toFixed(2)})`);
// On foot nobody covers more than V_WALK/60 cells a machine minute; a minute that
// touches the bus may cover up to V_BUS/60. Anything more is a teleport.
ok(worstWalk.d <= V_WALK / 60 + 0.01, "off the bus, nobody moves faster than walking pace");
ok(worst.d <= V_BUS / 60 + 0.01, `nobody moves faster than the bus (${(V_BUS / 60).toFixed(2)} cells/min)`);
ok(bus > 0, "somebody rides the bus");

// ---- the dead at night --------------------------------------------------------------------------
section("the dead");
const dead = ALL.filter(s => s.died);
let haunted = 0;
for (const s of dead) for (let day = 30; day < 37; day++) {
  for (const h of [1.5, 2.5, 3.5, 4.5, 5.2]) {
    const w = whereAt(s, (day - 1) * 24 + h);
    ok(w.districtId === "archive" && w.activity === "home", `${s.slug} in the Archive at day ${day} ${h}h (got ${w.activity}@${w.placeId})`);
  }
  if (schedule(s, day).some(g => g.haunt)) haunted++;
}
console.log(`  ${dead.length} deceased; ${haunted}/${dead.length * 7} nights spent haunting a tendency`);
ok(haunted > dead.length * 3, "the dead go out haunting on most nights");

// ---- capacity -----------------------------------------------------------------------------------
section("capacity");
const sum = {}, peak = {};
let samples = 0;
for (let day = 40; day < 47; day++) for (let m = 0; m < 24 * 60; m += 15) {
  const o = occupancy(ALL, (day - 1) * 24 + m / 60);
  samples++;
  for (const [id, n] of Object.entries(o.places)) { sum[id] = (sum[id] || 0) + n; peak[id] = Math.max(peak[id] || 0, n); }
}
const rows = Object.keys(PLACES).map(id => ({ id, cap: PLACES[id].cap, avg: (sum[id] || 0) / samples, peak: peak[id] || 0 }));
// Overflow is intended, within reason: the PA says so ("CAPACITY IS A SUGGESTION") and
// the directory shows it in red. A room at more than twice its capacity is a bug.
const PEAK_K = 2;
for (const r of rows.sort((a, b) => b.avg / b.cap - a.avg / a.cap)) {
  const flag = r.avg > r.cap ? "  <- OVER" : r.peak > r.cap * 1.5 ? "  (peak high)" : "";
  if (r.avg > r.cap * 0.5 || flag) console.log(`  ${r.id.padEnd(16)} cap ${String(r.cap).padStart(3)}  avg ${r.avg.toFixed(1).padStart(5)}  peak ${String(r.peak).padStart(3)}${flag}`);
  ok(r.avg <= r.cap, `${r.id} average occupancy within capacity`);
  ok(r.peak <= r.cap * PEAK_K, `${r.id} peak ${r.peak} within ${PEAK_K}x capacity ${r.cap}`);
}
const unused = rows.filter(r => r.peak === 0).map(r => r.id);
console.log(`  never visited: ${unused.join(", ") || "none"}`);
ok(unused.length <= 3, "nearly every place gets used");

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
  ok(at7 > at6 * 2, "the 07:00 change-over is when the city actually moves");
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
