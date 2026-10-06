// The scale (method v4, docs/design/SCALE.md §5): the nine-rung ladder, the cubrants and the
// city's day-gated ladder, checked on the live-like dataset (the figures on file plus the
// production index snapshot, scripts/fixtures/index-2026-10-06.json; scores and breakdowns only).
//   node scripts/check-scale.mjs            offline: the fixture's recorded manifest
//   node scripts/check-scale.mjs --live     also reads the live plan manifest for the SCALE_FROM rule
import assert from "node:assert/strict";
import fs from "node:fs";
import CAL from "../netlify/lib/calibration.json" with { type: "json" };
import { FAMOUS_FIGURES, TIERS, LEGACY_TIERS, getTier, tierLine, LINE_TOLERANCE } from "../src/figures.js";
import { cube, cubrantOf, CUBRANT_ORDER, CENTRE, familyOfCubrant, CUT } from "../src/cube.js";
import * as L from "./calibration-lib.mjs";
import * as SIM from "../src/city/sim.js";
import { LANES_DAY } from "../src/city/lanes.js";
import { EMERGE_FROM } from "../src/city/emergence.js";
import { PLAZA_DAY } from "../src/city/shorePlaza.js";
import { LOOKAHEAD } from "../netlify/lib/plans.js";
import { synthRoster, LEGACY_LABELS, scoreFor } from "./synth-roster.mjs";

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const FX = JSON.parse(read("scripts/fixtures/index-2026-10-06.json"));
const NEWEST_PUBLISHED_AT_SHIP = 634;   // f1 manifest at 2026-10-06 12:10 UTC, when SCALE_FROM was set

// the live-like roster: figures on file first, the index deduplicated by name
const seen = new Set(), ALL = [];
for (const f of [...FAMOUS_FIGURES, ...FX.entries]) { if (seen.has(f.name)) continue; seen.add(f.name); ALL.push(f); }
assert.ok(ALL.length >= 800, `live-like roster (${ALL.length})`);
const MAX_RUNG = 0.30, MAX_CELL = 0.30;
const pct = x => `${(100 * x).toFixed(1)}%`;

// ---- 1. the ladder ---------------------------------------------------------------------------------
assert.equal(TIERS.length, 9);
assert.deepEqual(TIERS.map(t => t.min), [810, 770, 735, 700, 660, 600, 450, 300, 0]);
for (let i = 1; i < TIERS.length; i++) assert.ok(TIERS[i].min < TIERS[i - 1].min);
const tierCount = Object.fromEntries(TIERS.map(t => [t.label, 0]));
for (const f of ALL) tierCount[getTier(f.score).label]++;
const biggestRung = Math.max(...Object.values(tierCount)) / ALL.length;
assert.ok(biggestRung <= MAX_RUNG, `no rung holds more than ${pct(MAX_RUNG)} of the file (largest ${pct(biggestRung)})`);
const shares = L.ladderShares(CAL, ALL.map(f => ({ ...f, harm: null })));
for (const r of shares) assert.ok(r.inside, `${r.label}: ${pct(r.share)} inside its guidance band ${r.band.map(pct).join("-")}`);
assert.equal(L.tierWith(CAL, L.scoreWith(CAL, L.PERSONAS["Decent ordinary"])), "PROVISIONAL CITIZEN", "an ordinary decent person reads PROVISIONAL CITIZEN (the 600 anchor), never Monitored");
// ON THE LINE: within LINE_TOLERANCE of a cut, named with the neighbouring rung
assert.equal(LINE_TOLERANCE, CAL.ladder.lineTolerance);
assert.deepEqual([tierLine(765)?.dir, tierLine(765)?.points, tierLine(765)?.tier.label], ["up", 5, "PRIORITY ASSET"]);
assert.deepEqual([tierLine(812)?.dir, tierLine(812)?.points, tierLine(812)?.tier.label], ["down", 3, "PRIORITY ASSET"]);
assert.equal(tierLine(680), null);
assert.equal(tierLine(5), null, "the bottom rung has no line below it");

// ---- 2. the cubrants --------------------------------------------------------------------------------
assert.deepEqual(CENTRE, CAL.centre);
const cells = Object.fromEntries(CUBRANT_ORDER.map(c => [c, 0]));
const axes = { warmth: [], competence: [], scarcity: [] };
let unplaced = 0;
for (const f of ALL) {
  const q = cube(f.breakdown);
  if (q.quadrant === "UNPLACED") { unplaced++; continue; }
  assert.ok(q.cubrant, `${f.name} placed`);
  assert.equal(q.cubrant, cubrantOf(q.warmth, q.competence, q.scarcity), `${f.name}: the cubrant follows from the three printed numbers`);
  cells[q.cubrant]++;
  for (const k of Object.keys(axes)) axes[k].push(q[k]);
}
assert.equal(unplaced, 0, "every file on the live-like roster is placed");
const biggestCell = Math.max(...Object.values(cells)) / ALL.length;
assert.ok(biggestCell <= MAX_CELL, `no cubrant holds more than ${pct(MAX_CELL)} (largest ${pct(biggestCell)})`);
assert.ok(Object.values(cells).every(n => n > 0), "every cubrant is occupied");
// the centres are the roster's medians (±1), so a drift shows up here before it shows up on the desk
const med = xs => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const now = { conduct: med(axes.warmth), competence: med(axes.competence), scarcity: med(axes.scarcity) };
for (const k of Object.keys(now)) assert.ok(Math.abs(now[k] - CENTRE[k]) <= 1, `centre ${k}: calibration ${CENTRE[k]}, roster median ${now[k]}`);
{ const c = L.centresOf(CAL, ALL.map(f => ({ ...f, harm: null }))); for (const k of ["conduct", "competence", "scarcity"]) assert.ok(Math.abs(c[k] - CENTRE[k]) <= 1, `calibration-lib centre ${k}: ${c[k]} vs ${CENTRE[k]} (ungated files)`); }
// the calibration lib and the browser agree on every file
for (const f of ALL.slice(0, 200)) { const a = cube(f.breakdown), b = L.cubeWith(CAL, f.breakdown); assert.deepEqual([a.warmth, a.competence, a.scarcity, a.cubrant], [b.warmth, b.competence, b.scarcity, b.cubrant], f.name); }
// colour: harm only under the absolute trust line as well
assert.equal(familyOfCubrant("SURPLUS", CUT), "dim"); assert.equal(familyOfCubrant("SURPLUS", CUT - 1), "harm");

// ---- 3. determinism -------------------------------------------------------------------------------
{
  const C2 = await import("../src/cube.js?instance=2"), F2 = await import("../src/figures.js?instance=2");
  for (const f of ALL.slice(0, 300)) {
    assert.deepEqual(cube(f.breakdown), C2.cube(f.breakdown), f.name);
    assert.equal(getTier(f.score).label, F2.getTier(f.score).label, f.name);
  }
  const srcCube = read("src/cube.js"), srcFig = read("src/figures.js").split("\n").slice(70).join("\n");
  for (const s of [srcCube, srcFig]) assert.ok(!/Math\.random|Date\.now|new Date\(/.test(s), "no clock or dice in the pure layer");
}

// ---- 4. stability under 100 new figures --------------------------------------------------------------
{
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const before = ALL.map(f => [getTier(f.score).label, cube(f.breakdown).cubrant]);
  const extra = Array.from({ length: 100 }, (_, i) => { const base = ALL[Math.floor(rnd() * ALL.length)]; const j = Math.round((rnd() - 0.5) * 40); const b = Object.fromEntries(Object.entries(base.breakdown).map(([k, v]) => [k, Math.max(0, Math.min(100, v + Math.round((rnd() - 0.5) * 20)))])); return { name: `Synthetic ${i}`, score: Math.max(0, Math.min(1000, base.score + j)), breakdown: b }; });
  const grown = [...ALL, ...extra];
  const after = ALL.map(f => [getTier(f.score).label, cube(f.breakdown).cubrant]);
  assert.deepEqual(after, before, "fixed cuts and frozen centres: nobody already on file moves when 100 arrive");
  const tc = {}, cc = {};
  for (const f of grown) { const t = getTier(f.score).label; tc[t] = (tc[t] || 0) + 1; const c = cube(f.breakdown).cubrant; cc[c] = (cc[c] || 0) + 1; }
  assert.ok(Math.max(...Object.values(tc)) / grown.length <= MAX_RUNG, "largest rung under the bound after growth");
  assert.ok(Math.max(...Object.values(cc)) / grown.length <= MAX_CELL, "largest cubrant under the bound after growth");
}

// ---- 5. the city: two ladders, one day boundary --------------------------------------------------------
{
  const D = SIM.SCALE_FROM;
  assert.ok(D > NEWEST_PUBLISHED_AT_SHIP + LOOKAHEAD + 1, `SCALE_FROM ${D} is past the newest published day at ship (${NEWEST_PUBLISHED_AT_SHIP}) + LOOKAHEAD + 1`);
  assert.ok(D > LANES_DAY && D > EMERGE_FROM && D > PLAZA_DAY, "SCALE_FROM is past every earlier day boundary");
  if (process.argv.includes("--live")) {
    const { store, retry } = await import("./roster/prod.mjs");
    const m = await retry(() => store("hvi-plans").get("f1/manifest", { type: "json" }));
    const newest = Math.max(...Object.keys(m?.days || {}).map(Number));
    assert.ok(D > newest + LOOKAHEAD + 1, `SCALE_FROM ${D} is past the live newest published day ${newest} + LOOKAHEAD + 1`);
    console.log(`  live manifest: newest published day ${newest}`);
  }
  // the legacy ladder: a stored label beats the score; v2: the score beats the label
  const s500 = { slug: "s500", name: "S", score: 500, tier: "TOLERATED GENERALIST", kind: "figure" };
  assert.equal(SIM.tierOf(s500, D - 1), "TOLERATED GENERALIST");
  assert.equal(SIM.tierOf(s500, D), "MONITORED CIVILIAN");
  assert.equal(SIM.classOf(s500, D - 1), 2); assert.equal(SIM.classOf(s500, D), 3);
  const s782 = { slug: "s782", name: "T", score: 782, tier: "RETAINED SPECIALIST", kind: "figure" };
  assert.equal(SIM.tierOf(s782, D - 1), "RETAINED SPECIALIST"); assert.equal(SIM.tierOf(s782, D), "PRIORITY ASSET");
  assert.equal(SIM.classOf(s782, D - 1), 1); assert.equal(SIM.classOf(s782, D), 0);
  assert.notEqual(SIM.homeOf(s782, SIM.SEED, D - 1), SIM.homeOf(s782, SIM.SEED, D), "a 782 moves to the glass at the boundary");
  // nested classes: nobody moves DOWN a housing band at the boundary
  const legacyBand = c => (c === 0 ? 0 : c <= 2 ? 1 : 2);
  for (const f of ALL) { const a = legacyBand(SIM.classOf({ score: f.score }, D - 1)), b = legacyBand(SIM.classOf({ score: f.score }, D)); assert.ok(b <= a, `${f.name}: band ${a} -> ${b}`); }
  // a v2 label with no score under the legacy ladder falls to MONITORED (the old fallback); a legacy label under v2 maps by class
  assert.equal(SIM.tierOf({ tier: "PRIORITY ASSET" }, D - 1), "MONITORED CIVILIAN");
  assert.equal(SIM.tierOf({ tier: "RETAINED SPECIALIST" }, D), "RETAINED SPECIALIST");
  // players keep their flat: a citizen housed under ladder 1 keeps the legacy home across the boundary
  const cit = { slug: "citizen-ab12", name: "Subject AB12", score: 782, tier: "RETAINED SPECIALIST", kind: "citizen", housedUnder: 1 };
  assert.equal(SIM.homeOf(cit, SIM.SEED, D), SIM.homeOf(cit, SIM.SEED, D - 1), "a citizen assessed before the boundary keeps the flat");
  assert.notEqual(SIM.homeOf({ ...cit, housedUnder: 2 }, SIM.SEED, D), SIM.homeOf(cit, SIM.SEED, D - 1), "one assessed after it is housed by the new ladder");
  assert.equal(SIM.housedUnderAt(new Date(SIM.SCALE_AT_MS - 1).toISOString()), 1);
  assert.equal(SIM.housedUnderAt(new Date(SIM.SCALE_AT_MS).toISOString()), 2);
  assert.equal(SIM.housedUnderAt(null), undefined);
  // the synthetic roster reads the same under both ladders (legacy labels with matching scores)
  for (const label of LEGACY_LABELS) assert.equal(SIM.classOf({ tier: label, score: scoreFor(label) }, D - 1), SIM.classOf({ tier: label, score: scoreFor(label) }, D), label);
  // a plan built for the day before the boundary and the day of it: the roster hash the published
  // days carry is the legacy one; the boundary day counts who was rehoused; the memo never shares
  const roster = synthRoster(300);
  SIM.clearPlans(); SIM.clearRoster(); SIM.setRoster(roster);
  const pre = SIM.buildPlan(D - 1), post = SIM.buildPlan(D);
  assert.equal(pre.roster, SIM.rosterVersion(D - 1)); assert.equal(post.roster, SIM.rosterVersion(D));
  assert.notEqual(pre.roster, post.roster, "the two ladders never share a roster version");
  const moved = roster.filter(s => SIM.homeOf(s, SIM.SEED, D - 1) !== SIM.homeOf(s, SIM.SEED, D)).length;
  assert.equal(SIM.rehousedBetween(D - 1, D), moved);
  assert.ok(moved > 0 && moved < roster.length * 0.1, `a few move at the boundary (${moved} of ${roster.length}: the 770-786 figures on file)`);
  assert.equal(SIM.rehousedBetween(D - 2, D - 1), 0, "no rehousing between two legacy days");
  assert.equal(SIM.rehousedBetween(D, D + 1), 0, "nor between two v2 days");
  const homeIdx = (plan, key) => plan.places[plan.subjects[key][0]];
  for (const s of roster) { const k = SIM.keyOf(s); assert.equal(homeIdx(pre, k), SIM.homeOf(s, SIM.SEED, D - 1), k); assert.equal(homeIdx(post, k), SIM.homeOf(s, SIM.SEED, D), k); }
  SIM.clearRoster();
}

// ---- 6. the bundle's copy ---------------------------------------------------------------------------
for (const t of TIERS) assert.ok(t.desc && t.icon && t.color, t.label);
const DEATH = /DECEASED|\bDIED\b|THE DEAD|GHOSTS?|POSTHUMOUS|OBITUARY|\bALIVE\b/i;
for (const t of TIERS) assert.ok(!DEATH.test(t.label) && !DEATH.test(t.desc), t.label);
assert.deepEqual(LEGACY_TIERS.map(t => t.label), ["ESSENTIAL INFRASTRUCTURE", "RETAINED SPECIALIST", "TOLERATED GENERALIST", "MONITORED CIVILIAN", "FLAGGED FOR DELETION", "SOYLENT GREEN"]);
// the shares the desk shows over time start from the day the ladder was cut
const sh = JSON.parse(read("public/scale/shares.json"));
assert.ok(Array.isArray(sh.runs) && sh.runs.length >= 2 && sh.runs.some(r => r.method === "v4"), "shares.json seeded");
for (const r of sh.runs) assert.ok(Math.abs(Object.values(r.shares).reduce((a, b) => a + b, 0) - 1) < 0.01, `${r.date} ${r.method}: shares sum to one`);

console.log(`check-scale: ok (n ${ALL.length}; largest rung ${pct(biggestRung)}, largest cubrant ${pct(biggestCell)}; centres ${CENTRE.conduct}/${CENTRE.competence}/${CENTRE.scarcity} vs medians ${now.conduct}/${now.competence}/${now.scarcity}; SCALE_FROM ${SIM.SCALE_FROM})`);
