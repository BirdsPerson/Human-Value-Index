// Case-by-case harm reviews (Scott 2026-09-26): the per-subject override, its survival
// through every rescore path, section-aware fact-check sources, and the pending flag.
import assert from "node:assert/strict";
import { computeScore, effectivelyGated, normalizeAssessment, needsHarmReview, validHarmReview, harmGated } from "../netlify/lib/intake.js";
import { selectSource, splitSections, keywordsOf, factCheckUser } from "../netlify/lib/factCheck.js";
import { publicFigure, isHeadOfStateOrGov } from "../netlify/lib/refer.js";
import { figureIndexEntry } from "../netlify/lib/store.js";
import * as L from "./calibration-lib.mjs";
import { readFileSync } from "node:fs";
import { sectionText, replaceSection } from "./harm-reviews.mjs";

const CAL = JSON.parse(readFileSync(new URL("../netlify/lib/calibration.json", import.meta.url)));
const obama = { care: 68, alignment: 62, utility: 78, adaptability: 72, legacy: 78, network: 92, physical: 60, threat: 90, redundancy: 45 };
const sev = { kind: "killing", scale: "dozens", role: "directed", duration: "years", accountability: "never_held" };
const UNGATE = { decision: "ungate", note: "Official military action as head of state.", by: "scott", at: "2026-09-26T00:00:00Z" };

// ---- the override ------------------------------------------------------------------
assert.ok(harmGated(obama), "fixture is gated by the automatic rule");
const gated = computeScore(obama, sev);
const ungated = computeScore(obama, sev, UNGATE);
assert.ok(gated < 100, "without a review the gate holds");
assert.ok(ungated > 500, "ungate: the breakdown stands as scored");
assert.equal(effectivelyGated(obama, UNGATE), false);
assert.equal(effectivelyGated(obama, null), true);
// ungate also drops the serious-harm cap (threat 80-89 would cap at 499)
const serious = { ...obama, threat: 82 };
assert.ok(computeScore(serious) <= CAL.harmGate.seriousCap, "serious-harm cap applies normally");
assert.ok(computeScore(serious, null, UNGATE) > CAL.harmGate.seriousCap, "ungate lifts the serious-harm cap");
// gate forces the gate on a file the automatic rule would pass
const clean = { ...obama, threat: 20 };
assert.ok(computeScore(clean) > 500);
assert.equal(computeScore(clean, sev, { decision: "gate", note: "x" }), computeScore(obama, sev), "gate forces the graded bottom");
assert.equal(effectivelyGated(clean, { decision: "gate" }), true);
// junk reviews are ignored
assert.equal(validHarmReview({ decision: "maybe" }), null);
assert.equal(computeScore(obama, sev, { decision: "maybe" }), gated);
// the calibration scorer agrees with the live one, review included
for (const r of [null, UNGATE, { decision: "gate" }]) {
  for (const b of [obama, serious, clean]) assert.equal(L.scoreWith(CAL, b, sev, r), computeScore(b, sev, r), "calibration scorer drift");
}
assert.equal(L.gatedWith(CAL, obama, UNGATE), false);

// ---- normalizeAssessment: ungate skips the threat floor ---------------------------
const raw = { breakdown: { ...obama, threat: 55 }, documented_harm: "killing", era_context: "modern", harm_severity: sev, harm_official_capacity: true, verdict: "v" };
const floored = normalizeAssessment(raw);
assert.equal(floored.breakdown.threat, 90, "the killing floor raises threat");
assert.ok(floored.score < 100);
assert.equal(floored.harm.official, true, "official capacity is recorded");
const reviewed = normalizeAssessment(raw, { harmReview: UNGATE });
assert.equal(reviewed.breakdown.threat, 55, "ungate: the model's own threat reading stands");
assert.equal(reviewed.score, computeScore(reviewed.breakdown, reviewed.harm.severity, UNGATE));
assert.ok(reviewed.score > 500);

// ---- survives the rescore library (stubbed Claude) ---------------------------------
{
  const realFetch = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "test";
  let seenNote = null;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("anthropic")) {
      const body = JSON.parse(init.body);
      seenNote = body.messages[0].content;
      return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ ...raw, verdict: "Drone program documented; legality contested. Acknowledged." }) }], stop_reason: "end_turn" }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  };
  try {
    const { rescoreOne } = await import("./rescore-lib.mjs");
    const r = await rescoreOne({ name: "Barack Obama", harmReview: UNGATE, note: "mention the drone program" }, { runs: 3, check: false });
    assert.deepEqual(r.harmReview, UNGATE, "the review rides along on the result");
    assert.ok(r.score > 500, "rescore keeps the subject ungated");
    assert.equal(r.breakdown.threat, 55);
    assert.ok(r.runScores.every(s => s > 500));
    assert.match(seenNote, /DEPARTMENT NOTE: mention the drone program/);
    const plain = await rescoreOne({ name: "Barack Obama" }, { runs: 1, check: false });
    assert.ok(plain.score < 100, "without the review the same reading is gated");
  } finally { globalThis.fetch = realFetch; }
}

// ---- the pending flag ---------------------------------------------------------------
const harm = { documented: "killing", era: "modern", band: "killing", severity: sev, official: false };
assert.equal(needsHarmReview({ breakdown: obama, harm, headOfState: true }), true, "head of state, gated through killing");
assert.equal(needsHarmReview({ breakdown: obama, harm: { ...harm, official: true }, headOfState: null }), true, "model flags official capacity");
assert.equal(needsHarmReview({ breakdown: obama, harm, headOfState: false }), false, "a private killer is not a harm review");
assert.equal(needsHarmReview({ breakdown: clean, harm, headOfState: true }), false, "not gated, nothing to review");
assert.equal(needsHarmReview({ breakdown: obama, harm, headOfState: true, harmReview: UNGATE }), false, "already decided");
assert.equal(needsHarmReview({ breakdown: obama, harm: { ...harm, band: "violent_abuse" }, headOfState: true }), false, "abuse is not state force");
{
  let asked = null;
  const ok = await isHeadOfStateOrGov("Q76", async url => { asked = decodeURIComponent(String(url)); return new Response(JSON.stringify({ boolean: true }), { status: 200 }); });
  assert.equal(ok, true);
  assert.match(asked, /wdt:P39/); assert.match(asked, /Q48352/); assert.match(asked, /Q2285706/);
  assert.equal(await isHeadOfStateOrGov("not-a-qid", async () => { throw new Error("no"); }), null);
  assert.equal(await isHeadOfStateOrGov("Q1", async () => { throw new Error("down"); }), null, "lookup failure is null, not false");
}
// index + public card carry the review; the pending flag stays internal
const card = { slug: "barack-obama", name: "Barack Obama", score: 660, tier: "TOLERATED GENERALIST", breakdown: obama, verdict: "v", verdictStatus: "published", harmReview: UNGATE, harmReviewPending: false };
const entry = figureIndexEntry(card);
assert.deepEqual(entry.harmReview, UNGATE);
assert.equal(entry.harmReviewPending, false);
assert.deepEqual(figureIndexEntry({ ...card, harmReview: null, harmReviewPending: true }).harmReviewPending, true);
const pub = publicFigure(card);
assert.deepEqual(pub.harmReview, { decision: "ungate", note: UNGATE.note });
assert.equal("harmReviewPending" in pub, false);
assert.equal(publicFigure({ ...card, harmReview: null }).harmReview, null);

// ---- desk section -----------------------------------------------------------------
{
  const cards = [
    { name: "Some President", score: 40, harm: { band: "killing" }, harmReviewPending: true },
    { name: "Barack Obama", score: 660, harmReview: UNGATE },
    { name: "Private Killer", score: 30, harmReviewPending: false },
  ];
  const figs = [{ name: "Putin", score: 5, harm: { band: "mass_atrocity" } }, { name: "Mao Zedong", score: 0, harm: { band: "mass_atrocity" } }];
  const sec = sectionText(cards, figs);
  assert.match(sec, /^## Harm reviews\n/);
  assert.match(sec, /Some President: gated at 40, band killing/);
  assert.doesNotMatch(sec, /Private Killer/);
  assert.match(sec, /Barack Obama: ungate/);
  assert.match(sec, /Putin 5 \(mass_atrocity\)/);
  const md = "# R\n\n## Shipped\n\n- a\n\n## Harm reviews\n\nold\n\n## Findings\n\n- f\n";
  const once = replaceSection(md, sec);
  assert.equal(replaceSection(once, sec), once, "idempotent");
  assert.equal((once.match(/## Harm reviews/g) || []).length, 1);
  assert.match(once, /## Findings/);
  assert.match(replaceSection("# R\n", sec), /## Harm reviews/);
  assert.doesNotMatch(sectionText([], figs), /Decide/);
}

// ---- section-aware fact-check source ----------------------------------------------
{
  const intro = "Barack Obama is an American politician who served as the 44th president.\n";
  const art = intro + "filler ".repeat(4000) + "\n== Early life ==\n" + "childhood ".repeat(3500) +
    "\n== Presidency ==\n" + "policy ".repeat(4000) + "\n=== Drone strikes ===\nThe administration expanded drone strikes; a 2011 strike killed Anwar al-Awlaki, a U.S. citizen.\n" +
    "\n== Legacy ==\n" + "legacy ".repeat(3000);
  assert.ok(art.length > 90000);
  const verdict = "Record includes drone strike operations, including the strike that killed al-Awlaki.";
  const src = selectSource(art, verdict, 30000);
  assert.ok(src.length <= 30000);
  assert.ok(src.startsWith("Barack Obama is"), "the intro leads");
  assert.match(src, /al-Awlaki/, "the relevant late section is included");
  assert.equal(art.slice(0, 30000).includes("al-Awlaki"), false, "a plain first-30k slice would have missed it");
  assert.equal(selectSource("short text", verdict, 30000), "short text", "short sources pass whole");
  assert.equal(splitSections("a\n== B ==\nb\n=== C ===\nc").map(x => x.heading).join(","), ",B,C");
  assert.ok(keywordsOf(verdict).includes("drone"));
  assert.ok(!keywordsOf("the Department acknowledged").includes("department"));
  assert.match(factCheckUser({ name: "X", deceased: false, source: art, verdict }), /al-Awlaki/);
}

console.log("check-harmreview: ok");
