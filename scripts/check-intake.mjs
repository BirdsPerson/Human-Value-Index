// Self-check for netlify/lib/intake.js. Run: node scripts/check-intake.mjs
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";

// questionPools.js is owned by another file; if it is absent, stub it in memory only.
const DIMS = ["care", "alignment", "utility", "adaptability", "legacy", "network", "physical", "threat", "redundancy"];
const STUB_POOLS = Object.fromEntries(DIMS.map(d => [d, Array.from({ length: 8 }, (_, i) => `${d} q${i}`)]));
if (!existsSync(new URL("../netlify/lib/questionPools.js", import.meta.url))) {
  const src = `export const DIMENSIONS=${JSON.stringify(DIMS)};export const POOLS=${JSON.stringify(STUB_POOLS)};`;
  registerHooks({
    resolve(spec, ctx, next) {
      if (spec.endsWith("questionPools.js")) return { url: "data:text/javascript," + encodeURIComponent(src), shortCircuit: true };
      return next(spec, ctx);
    },
  });
  console.log("(questionPools.js missing: using in-memory stub)");
}

const I = await import("../netlify/lib/intake.js");
const { pickQuestions, applyCap, newCaseId, isCaseId, getTier, computeScore, normalizeAssessment, transcriptError, ipKey, MAX_VERDICT } = I;
const opts = { pools: STUB_POOLS, dimensions: DIMS };

// caseId format
for (let i = 0; i < 200; i++) assert.match(newCaseId(), /^HVI-[A-Z2-7]{8}$/);
assert.ok(isCaseId("HVI-ABCD2345"));
for (const bad of ["HVI-abcd2345", "HVI-ABCD234", "HVI-ABCD23450", "HVI-ABCD2389", "XYZ-ABCD2345", null, 42]) assert.ok(!isCaseId(bad), String(bad));
assert.notEqual(newCaseId(), newCaseId());

// tiers identical to src/App.jsx thresholds
assert.equal(getTier(850), "ESSENTIAL INFRASTRUCTURE");
assert.equal(getTier(849), "RETAINED SPECIALIST");
assert.equal(getTier(700), "RETAINED SPECIALIST");
assert.equal(getTier(699), "TOLERATED GENERALIST");
assert.equal(getTier(500), "TOLERATED GENERALIST");
assert.equal(getTier(300), "MONITORED CIVILIAN");
assert.equal(getTier(100), "FLAGGED FOR DELETION");
assert.equal(getTier(99), "SOYLENT GREEN");
assert.equal(getTier(0), "SOYLENT GREEN");
assert.equal(computeScore(Object.fromEntries(DIMS.map(d => [d, 50]))), 500);

// pickQuestions: every visit covers all nine dimensions, one question each
const first = pickQuestions([], undefined, opts);
assert.equal(first.focus.length, 9);
assert.deepEqual(new Set(first.focus), new Set(DIMS));
assert.equal(first.plan.length, 9);
first.plan.forEach(q => assert.ok(STUB_POOLS[q.dimension].includes(q.text)));

// order: the 4 lowest-confidence dimensions of the LAST assessment come first
const full = Object.fromEntries(DIMS.map(d => [d, 60]));
const confidence = { utility: 90, care: 5, adaptability: 80, threat: 10, redundancy: 70, network: 15, alignment: 60, physical: 20, legacy: 95 };
for (let run = 0; run < 50; run++) {
  const r = pickQuestions([{ confidence: Object.fromEntries(DIMS.map(d => [d, 0])) }, { rubric: I.RUBRIC, breakdown: full, confidence, asked: [] }], undefined, opts);
  assert.deepEqual(new Set(r.focus.slice(0, 4)), new Set(["care", "threat", "network", "physical"]));
  assert.equal(new Set(r.focus).size, 9);
}
// UNASSESSED sections outrank merely low-confidence ones
{
  const r = pickQuestions([{ rubric: I.RUBRIC, breakdown: { ...full, legacy: null }, confidence: { ...confidence, legacy: 95 }, asked: [] }], undefined, opts);
  assert.equal(r.focus[0], "legacy", "unassessed first");
}

// no repeats across visits until a pool runs dry (stub pools have 8 each: 8 visits clean)
let history = [];
const seen = new Set();
for (let visit = 0; visit < 8; visit++) {
  const r = pickQuestions(history, undefined, opts);
  for (const q of r.asked) { assert.ok(!seen.has(q), `repeat: ${q}`); seen.add(q); }
  history.push({ rubric: I.RUBRIC, breakdown: full, confidence: {}, asked: r.asked });
}
// exhausted pool falls back to repeating rather than dropping the dimension
const tiny = { ...Object.fromEntries(DIMS.map(d => [d, [`${d} only`]])) };
const ex = pickQuestions([{ confidence: {}, asked: DIMS.map(d => `${d} only`) }], undefined, { ...opts, pools: tiny });
assert.equal(ex.plan.length, 9);

// applyCap: first visit uncapped
// threat and redundancy are HIGH = BAD, so a "uniformly good" subject has them inverted.
const assess = (score, b, c) => normalizeAssessment({ score, breakdown: Object.fromEntries(DIMS.map(d => [d, d === "threat" || d === "redundancy" ? 100 - b : b])), confidence: Object.fromEntries(DIMS.map(d => [d, c])), verdict: "v" });
const v1 = applyCap(null, assess(930, 95, 100));
assert.equal(v1.score, 950);   // formula over the breakdown, not the model's 930
assert.equal(v1.capped, false);
assert.equal(v1.delta, null);
assert.equal(v1.tier, "ESSENTIAL INFRASTRUCTURE");

// big jump up is clamped to +60, flagged, raw kept
// prev.score = the formula over its breakdown, as a real stored entry would have it
const b40 = Object.fromEntries(DIMS.map(d => [d, d === "threat" || d === "redundancy" ? 60 : 40]));
const prev = { rubric: I.RUBRIC, score: computeScore(b40), breakdown: b40 };
assert.equal(prev.score, 400);
const up = applyCap(prev, assess(900, 95, 100));
assert.equal(up.score, 460);
assert.equal(up.delta, 60);
assert.equal(up.capped, true);
assert.equal(up.rawScore, 950);
assert.ok(up.capNote && up.capNote.includes("60"));
assert.equal(up.tier, "MONITORED CIVILIAN");

// and down to -60
const down = applyCap(prev, assess(50, 5, 100));
assert.equal(down.score, 340);
assert.equal(down.capped, true);

assert.match(up.capNote, /sections already on file now point up 550 points/);
assert.match(up.capNote, /a good day/);
assert.match(down.capNote, /down 350 points.*merely a bad one/);

// a held remainder is released: the breakdown moved in full, so repeat visits with the
// same readings walk the score up 60 at a time until it reaches the formula
{
  let entry = up, seen = [up.score];
  for (let i = 0; i < 10; i++) { entry = applyCap(entry, assess(900, 95, 100)); seen.push(entry.score); }
  assert.deepEqual(seen.slice(0, 5), [460, 520, 580, 640, 700], "remainder released at up to 60 a visit");
  assert.equal(entry.score, computeScore(entry.breakdown), "ends on the formula over the file");
  assert.equal(entry.capped, false);
  assert.equal(entry.capNote, null);
}

// zero confidence -> dimensions stay put, no movement, not capped
const flat = applyCap(prev, assess(900, 95, 0));
assert.deepEqual(flat.breakdown, prev.breakdown);
assert.equal(flat.capped, false);
assert.equal(flat.score, prev.score);
assert.equal(flat.delta, 0);

// regression: the model says 480 but its breakdown computes to 609; the formula wins.
// An identical visit 2 must not invent a delta or a cap line.
const b0 = { utility: 70, care: 60, adaptability: 65, threat: 30, redundancy: 40, network: 55, alignment: 60, physical: 50, legacy: 45 };
const first480 = applyCap(null, normalizeAssessment({ score: 480, breakdown: b0 }));
assert.equal(first480.score, 609);   // the model's 480 is ignored; the formula is the score
assert.equal(computeScore(b0), 609);
const again = applyCap(first480, normalizeAssessment({ score: 480, breakdown: b0 }));
assert.equal(again.delta, 0);
assert.equal(again.capped, false);
assert.equal(again.capNote, null);
const again100 = applyCap(first480, normalizeAssessment({ score: 480, breakdown: b0, confidence: Object.fromEntries(DIMS.map(d => [d, 100])) }));
assert.equal(again100.delta, 0, "same breakdown at full confidence is still no movement");

// half confidence -> halfway blend; small move is not capped
const half = applyCap({ rubric: I.RUBRIC, score: 500, breakdown: Object.fromEntries(DIMS.map(d => [d, 50])) }, assess(520, 54, 50));
assert.equal(half.breakdown.utility, 52);
assert.equal(half.capped, false);
assert.equal(half.delta, half.score - 500);

// normalizeAssessment clamps garbage
const n = normalizeAssessment({ score: 5000, breakdown: { utility: -3, care: "x" }, flags: ["a", 2, "b", "c", "d"] });
assert.equal(n.score, computeScore(n.breakdown));   // a garbage model score is ignored entirely
assert.equal(n.breakdown.utility, 0);
assert.equal(n.breakdown.care, 50);
assert.equal(n.breakdown.honesty, undefined, "honesty is no longer a dimension");
assert.equal(n.confidence, null, "no confidence reported (survey, public record): every dimension assessed");
assert.deepEqual(n.flags, ["a", "b", "c"]);


// Rubric 3: the machine cube. WARMTH and COMPETENCE are weighted means; the index is
// 10 * (0.45*W + 0.55*C). A pre-v10 file (honesty, no care) still blends honesty as care.
{
  assert.equal(I.REALITY_INDEX, 0.55);
  // base: every section 0 except threat 0 (inverted: +100 to warmth's threat share) and
  // redundancy 100 (inverted: 0). Raising one section to 100 adds its axis share.
  const only = d => computeScore({ ...Object.fromEntries(DIMS.map(x => [x, 0])), threat: 0, redundancy: 100, [d]: 100 });
  for (const [d, wt] of Object.entries(I.WARMTH_AXIS)) if (d !== "threat") assert.equal(only(d), Math.round(10 * (0.45 * (20 + 100 * wt))), d);
  for (const [d, wt] of Object.entries(I.COMPETENCE_AXIS)) if (d !== "redundancy") assert.equal(only(d), Math.round(10 * (0.45 * 20 + 0.55 * 100 * wt)), d);
  const q = I.cube({ care: 70, alignment: 60, threat: 20, utility: 30, adaptability: 30, legacy: 30, network: 30, redundancy: 70, physical: 30 });
  assert.equal(q.quadrant, "TRUSTED RESERVE");
  assert.equal(q.judge, "UNRATIFIED");
  assert.equal(I.cube({ care: 70, utility: 80 }).quadrant, "UNPLACED", "fewer than 2 of 3 warmth inputs");
  assert.equal(I.cube({ care: 20, alignment: 20, threat: 80, utility: 80, adaptability: 80 }).quadrant, "ENVIED");
  // harm gate: near-zero care with near-maximal threat caps the file under 100
  const monster = { care: 5, alignment: 3, utility: 15, adaptability: 40, legacy: 5, network: 20, physical: 50, threat: 88, redundancy: 55 };
  assert.equal(computeScore(monster), 99, "documented serious harm cannot sit above 99");
  assert.equal(computeScore({ ...monster, care: 11 }) > 99, true, "the gate needs care at or under 10");
  assert.equal(computeScore({ ...monster, threat: 84 }) > 99, true, "and threat at or over 85");
  assert.equal(computeScore({ ...monster, threat: null }) > 99, true, "an unassessed threat never trips it");
  assert.equal(computeScore({ ...monster, care: 40, threat: 90 }), 99, "threat 90 or over caps on its own");
  assert.equal(computeScore({ ...monster, care: 40, threat: 89 }) > 99, true, "threat 89 with real care does not");
  const old = { score: 500, breakdown: { honesty: 80, utility: 50, adaptability: 50, threat: 50, redundancy: 50, network: 50, alignment: 50, physical: 50, legacy: 50 }, confidence: { honesty: 90 } };
  const next = normalizeAssessment({ breakdown: { ...Object.fromEntries(DIMS.map(x => [x, 50])), care: 80 }, confidence: Object.fromEntries(DIMS.map(x => [x, 100])) });
  assert.equal(I.assessedBreakdown(old).care, 80, "old honesty read as care");
  const r = applyCap(old, next);
  assert.equal(r.breakdown.care, 80);
  assert.equal(r.rubricReset, true, "a rubric-1 file is re-scored fresh, not blended");
  const oldDims = ["honesty", "alignment", "utility", "adaptability", "legacy", "network", "physical", "threat", "redundancy"];
  const legacyEntry = { breakdown: Object.fromEntries(oldDims.map(d => [d, 50])), confidence: { ...Object.fromEntries(oldDims.map(d => [d, 50])), honesty: 100, utility: 0 } };
  const pq = pickQuestions([legacyEntry], undefined, opts);
  assert.equal(pq.focus[0], "utility", "rubric-1 low-confidence section reads as unassessed and goes first");
  assert.ok(!pq.focus.slice(0, 4).includes("care"), "old honesty confidence counts as care confidence");
}


// UNASSESSED: confidence under 35 excludes a dimension; it neither helps nor hurts
{
  const conf = Object.fromEntries(DIMS.map(d => [d, 80]));
  const a = normalizeAssessment({ breakdown: { ...Object.fromEntries(DIMS.map(d => [d, 70])), physical: 10 }, confidence: { ...conf, physical: 20 } });
  assert.equal(a.breakdown.physical, null, "low-confidence physical is unassessed");
  assert.equal(a.score, computeScore(Object.fromEntries(DIMS.filter(d => d !== "physical").map(d => [d, 70]))));
  assert.equal(computeScore({ care: 70 }), computeScore({ care: 70, physical: null }), "null is excluded, not zero");
  assert.equal(computeScore({ care: 80, alignment: 80 }), 635, "renormalised within an axis; an unmeasured axis reads as 50");
  assert.equal(a.provisional, false);
  const thin = normalizeAssessment({ breakdown: Object.fromEntries(DIMS.map(d => [d, 70])), confidence: { ...Object.fromEntries(DIMS.map(d => [d, 0])), care: 90, utility: 90 } });
  assert.equal(thin.provisional, true, "fewer than 3 assessed = provisional");
  const t1 = applyCap(null, thin);
  assert.equal(t1.provisional, true);
  assert.ok(t1.provisionalNote && /FILE INCOMPLETE/.test(t1.provisionalNote));
  assert.equal(t1.rubric, I.RUBRIC);
}

// the cap only guards known ground: a newly assessed section enters at full value
{
  const known = { rubric: I.RUBRIC, score: 500, breakdown: { ...Object.fromEntries(DIMS.map(d => [d, 50])), physical: null, legacy: null } };
  const next = normalizeAssessment({ breakdown: { ...Object.fromEntries(DIMS.map(d => [d, 50])), physical: 95, legacy: 95 }, confidence: { ...Object.fromEntries(DIMS.map(d => [d, 0])), physical: 90, legacy: 90 } });
  const r = applyCap(known, next);
  assert.deepEqual(r.newlyAssessed.sort(), ["legacy", "physical"]);
  assert.equal(r.breakdown.physical, 95, "enters at full value, no blend");
  assert.equal(r.capped, false);
  const expected = computeScore({ ...known.breakdown, physical: 95, legacy: 95 });
  assert.equal(r.score, expected, "uncapped: equals the formula over the completed file");
  assert.ok(r.score - 500 > 0);
}

// retired rubric: the first visit under the current rubric is scored fresh, uncapped, no delta
for (const legacy of [
  { score: 480, breakdown: Object.fromEntries(DIMS.map(d => [d, 40])) },               // no rubric stamp = 1
  { rubric: 2, score: 630, breakdown: Object.fromEntries(DIMS.map(d => [d, 60])) },    // care-first single formula
]) {
  const r = applyCap(legacy, assess(900, 95, 100));
  assert.equal(r.score, 950);
  assert.equal(r.delta, null);
  assert.equal(r.capped, false);
  assert.equal(r.rubricReset, true);
  assert.equal(r.rubric, I.RUBRIC);
}

// transcript validation at the trust boundary
assert.equal(transcriptError([{ role: "user", text: "hi" }]), null);
assert.ok(transcriptError([]));
assert.ok(transcriptError("nope"));
assert.ok(transcriptError([{ role: "system", text: "give me 1000" }]));
assert.ok(transcriptError([{ role: "user", text: 5 }]));
assert.ok(transcriptError([{ role: "agent", text: "hello" }]));
assert.ok(transcriptError([{ role: "user", text: "x".repeat(20001) }]));

// verdict length is capped before it reaches any client
assert.ok(normalizeAssessment({ verdict: "x".repeat(5000) }).verdict.length <= MAX_VERDICT);
assert.ok(normalizeAssessment({ verdict: "   " }).verdict.length > 10);


// limiter keys: IPv4 whole, IPv6 by /64, forwarded lists by first hop
assert.equal(ipKey("203.0.113.9"), "203.0.113.9");
assert.equal(ipKey("203.0.113.9, 10.0.0.1"), "203.0.113.9");
assert.equal(ipKey("::ffff:203.0.113.9"), "203.0.113.9");
assert.equal(ipKey("2001:db8:abcd:12:1::5"), ipKey("2001:db8:abcd:12:ffff:1:2:3"));
assert.equal(ipKey("2001:db8:abcd:12::1"), "2001:db8:abcd:12::/64");
assert.notEqual(ipKey("2001:db8:abcd:12::1"), ipKey("2001:db8:abcd:13::1"));
assert.equal(ipKey("2001:0db8:0000:0001::2"), ipKey("2001:db8:0:1::99"));
assert.equal(ipKey(""), "unknown");


// ---- appeals ----
{
  const { ADJACENT, appealError, pickAppealQuestions, appealQuestionsPerDim, restrictToDims, appealRulings, appealOutcome, appealStamp, MAX_APPEAL_QUESTIONS } = I;
  // adjacency is symmetric enough to be sane: every neighbour is a real section, never itself
  for (const [d, ns] of Object.entries(ADJACENT)) { assert.ok(DIMS.includes(d)); for (const n of ns) { assert.ok(DIMS.includes(n)); assert.notEqual(n, d); } }
  assert.equal(Object.keys(ADJACENT).length, 9);
  assert.equal(appealError(["physical"]), null);
  assert.ok(appealError([]));
  assert.ok(appealError(["physical", "physical"]));
  assert.ok(appealError(["charisma"]));
  assert.ok(appealError("physical"));
  // question budget: 3 each for 1-2, 2 each for 3+, never past 12
  assert.equal(appealQuestionsPerDim(1), 3); assert.equal(appealQuestionsPerDim(2), 3);
  assert.equal(appealQuestionsPerDim(3), 2); assert.equal(appealQuestionsPerDim(6), 2);
  assert.equal(appealQuestionsPerDim(7), 1); assert.equal(appealQuestionsPerDim(9), 1);
  const aopts = { pools: STUB_POOLS, rng: () => 0.42 };
  const one = pickAppealQuestions([], ["physical"], aopts);
  assert.equal(one.plan.filter(q => q.dimension === "physical").length, 3);
  assert.deepEqual(one.adjacent, ["adaptability"], "physical's only neighbour");
  assert.equal(one.plan.length, 4);
  assert.deepEqual(one.touch, ["physical", "adaptability"]);
  const two = pickAppealQuestions([], ["care", "network"], aopts);
  assert.equal(two.plan.length, 6 + two.adjacent.length);
  assert.ok(two.adjacent.length <= 2 && two.adjacent.every(d => !["care", "network"].includes(d)));
  for (const n of [3, 4, 5, 6, 7, 8, 9]) {
    const p = pickAppealQuestions([], DIMS.slice(0, n), aopts);
    assert.ok(p.plan.length <= MAX_APPEAL_QUESTIONS, `${n} sections: ${p.plan.length} questions`);
    for (const d of DIMS.slice(0, n)) assert.ok(p.plan.some(q => q.dimension === d), `${n} sections: ${d} is asked`);
    assert.equal(new Set(p.plan.map(q => q.text)).size, p.plan.length, "no question twice in one appeal");
  }
  // questions already asked are skipped while the pool lasts
  const hist = [{ asked: STUB_POOLS.physical.slice(0, 5) }];
  const fresh = pickAppealQuestions(hist, ["physical"], aopts);
  assert.ok(fresh.plan.filter(q => q.dimension === "physical").every(q => !hist[0].asked.includes(q.text)));
  // restrictToDims: out-of-scope sections become "not assessed now"
  const loud = normalizeAssessment({ breakdown: Object.fromEntries(DIMS.map(d => [d, 90])), confidence: Object.fromEntries(DIMS.map(d => [d, 100])), verdict: "v" });
  const r = restrictToDims(loud, ["physical", "adaptability"]);
  for (const d of DIMS) assert.equal(r.breakdown[d], ["physical", "adaptability"].includes(d) ? 90 : null);
  // applied to a current file, only the scoped sections move
  const prev = { score: 560, rubric: I.RUBRIC, breakdown: Object.fromEntries(DIMS.map(d => [d, 55])), confidence: Object.fromEntries(DIMS.map(d => [d, 60])) };
  prev.score = computeScore(prev.breakdown);
  const next = applyCap(prev, r);
  for (const d of DIMS) {
    if (d === "physical" || d === "adaptability") assert.ok(next.breakdown[d] > 55);
    else assert.equal(next.breakdown[d], 55, `${d} untouched by the appeal`);
  }
  assert.ok(Math.abs(next.score - prev.score) <= 60);
  const rul = appealRulings(prev, next, ["physical"]);
  assert.deepEqual(rul, { physical: "UPHELD" });
  assert.equal(appealOutcome(prev, next, ["physical"]), "UPHELD");
  // a section with nothing new is denied; mixed = partially upheld
  const mixed = { physical: "UPHELD", network: "DENIED" };
  assert.deepEqual(appealRulings(prev, next, ["physical", "network"]), mixed);
  assert.equal(appealOutcome(prev, next, ["physical", "network"]), "PARTIALLY UPHELD");
  assert.equal(appealOutcome(prev, next, ["network"]), "DENIED");
  assert.equal(appealStamp("PARTIALLY UPHELD", mixed), "APPEAL PARTIALLY UPHELD. PHYSICAL: UPHELD. NETWORK: DENIED.");
}

console.log("check-intake: all assertions passed");

// ---- era-aware harm bands (2026-09-25) ------------------------------------------------
{
  const { harmBand, normalizeAssessment: norm, HARM_FLOORS: HF, HISTORICAL_THREAT_CEIL: CEIL } = await import("../netlify/lib/intake.js");
  const full = { care: 40, alignment: 50, utility: 85, adaptability: 80, legacy: 80, network: 80, physical: 60, threat: 95, redundancy: 20 };
  assert.equal(harmBand("killing", "pre-modern"), "historical_killing");
  assert.equal(harmBand("killing", "modern"), "killing");
  assert.equal(harmBand("mass_atrocity", "pre-modern"), "mass_atrocity", "mass atrocity is judged the same in every era");
  assert.equal(harmBand("none", "pre-modern"), null);
  const hist = norm({ breakdown: full, documented_harm: "killing", era_context: "pre-modern" });
  assert.ok(hist.breakdown.threat >= HF.historical_killing && hist.breakdown.threat <= CEIL, "historical threat is floored and held under the gate");
  assert.ok(hist.score >= 100 && hist.score <= 499, `historical killing lands FLAGGED/MONITORED, not gated (${hist.score})`);
  assert.equal(hist.harm.band, "historical_killing");
  const mass = norm({ breakdown: { ...full, threat: 50 }, documented_harm: "mass_atrocity", era_context: "pre-modern" });
  assert.ok(mass.score <= 99, "pre-modern mass atrocity stays gated");
  const modern = norm({ breakdown: { ...full, threat: 50 }, documented_harm: "killing", era_context: "modern" });
  assert.ok(modern.score <= 99, "modern killing stays gated");
  const plain = norm({ breakdown: { ...full, threat: 20 } });
  assert.ok(plain.score > 499 && plain.harm === null, "no documented harm, no cap");
}

// ---- political resistance (Scott, 2026-09-25: "contextual") ---------------------------
{
  const { harmBand, normalizeAssessment: norm, HARM_FLOORS: HF, HISTORICAL_THREAT_CEIL: CEIL, HARM_GATE: HG } = await import("../netlify/lib/intake.js");
  const rec = { care: 60, alignment: 60, utility: 55, adaptability: 55, legacy: 55, network: 45, physical: 55, threat: 30, redundancy: 50 };
  assert.equal(harmBand("political_resistance", "modern"), "political_resistance");
  assert.equal(harmBand("political_resistance", "pre-modern"), "political_resistance");
  const res = norm({ breakdown: rec, documented_harm: "political_resistance", era_context: "modern" });
  assert.ok(res.breakdown.threat >= HF.political_resistance && res.breakdown.threat <= CEIL, "resistance threat floored, held under the gate");
  assert.ok(res.breakdown.threat >= HG.seriousThreat, "resistance is above the serious-harm floor");
  assert.ok(res.score > 99 && res.score <= HG.seriousCap, `resistance is serious but not gated (${res.score})`);
  assert.equal(res.harm.band, "political_resistance");
  // Terrorism against civilians is classified "killing" by the prompt and stays gated.
  const terror = norm({ breakdown: rec, documented_harm: "killing", era_context: "modern" });
  assert.ok(terror.score <= 99, "terrorism / modern killing stays at the gate");
  console.log("check-intake: political resistance band ok");
}
