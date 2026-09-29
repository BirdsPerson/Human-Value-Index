// Living-subject allegation rules (Scott 2026-09-29, after the defamation-risk review):
// the rule text must reach every system prompt that writes a public-figure verdict, and
// the fact-check must flag unattributed allegations and invented legal events.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SYSTEM_PROMPT } from "../netlify/lib/systemPrompt.js";
import { PUBLIC_RECORD, REFERRAL_ADDENDUM, ENGINE_ADDENDUM, LIVING_SUBJECTS } from "../netlify/lib/publicRecord.js";
import { FACT_CHECK_SYSTEM, summarizeFactCheck } from "../netlify/lib/factCheck.js";

const src = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ---- the rule text ------------------------------------------------------------------
for (const phrase of [
  "LIVING SUBJECTS (STATUS: living)",
  "may be stated as fact ONLY when established by a conviction, a court or regulator finding",
  "a settlement stated as such",
  "the subject's own admission",
  "Otherwise it is an ALLEGATION",
  "never call an allegation \"documented\"",
  "state its latest outcome",
  "Never invent a legal event",
  "omit the sentence entirely",
  "Deceased subjects are unaffected",
]) assert.ok(LIVING_SUBJECTS.includes(phrase), `LIVING_SUBJECTS lost: ${phrase}`);

// The rules are inside the public-record prompt, and the old "never call it disputed"
// rule is scoped so it can't turn an accusation into documented fact.
assert.ok(PUBLIC_RECORD.includes(LIVING_SUBJECTS), "PUBLIC_RECORD must carry LIVING_SUBJECTS");
assert.ok(PUBLIC_RECORD.includes("never accusations of wrongdoing against them"), "documented-observation rule must exclude accusations against the living");
// The dead keep their record: the documented-observation rule and harm classes stand.
for (const phrase of ["Never call a documented observation \"disputed\"", "\"mass_atrocity\"", "\"killing\"", "\"violent_abuse\""])
  assert.ok(PUBLIC_RECORD.includes(phrase), `PUBLIC_RECORD lost: ${phrase}`);

// ---- every scorer sends it ------------------------------------------------------------
// The prompt the scorer actually sends is assembled in these files: each must concatenate
// PUBLIC_RECORD into the system prompt.
const sent = {
  "scripts/rescore-lib.mjs": /SYSTEM_PROMPT \+ PUBLIC_RECORD/,          // rescores, calibration
  "netlify/functions/refer.js": /SYSTEM_PROMPT \+ PUBLIC_RECORD \+ REFERRAL_ADDENDUM/, // /api/refer
  "scripts/roster-grow.mjs": /SYSTEM_PROMPT \+ PUBLIC_RECORD \+ REFERRAL_ADDENDUM \+ ENGINE_ADDENDUM/, // roster engine
};
for (const [file, re] of Object.entries(sent)) assert.match(src(file), re, `${file} no longer sends PUBLIC_RECORD`);
for (const system of [SYSTEM_PROMPT + PUBLIC_RECORD, SYSTEM_PROMPT + PUBLIC_RECORD + REFERRAL_ADDENDUM, SYSTEM_PROMPT + PUBLIC_RECORD + REFERRAL_ADDENDUM + ENGINE_ADDENDUM])
  assert.ok(system.includes("Never invent a legal event") && system.includes("Otherwise it is an ALLEGATION"), "assembled scorer prompt lacks the living-subject rules");

// ---- the fact-check -------------------------------------------------------------------
for (const phrase of ["\"unattributed\": STATUS is living", "A legal event (charge, indictment, lawsuit, arrest, conviction, settlement, allegation, accuser) the source does not mention is \"unsupported\"", "an unsupported legal event about a living person is always removed", "this never applies to an accusation of wrongdoing against a living person"])
  assert.ok(FACT_CHECK_SYSTEM.includes(phrase), `FACT_CHECK_SYSTEM lost: ${phrase}`);
assert.match(src("netlify/lib/factCheck.js"), /system: FACT_CHECK_SYSTEM/, "factCheck() must send FACT_CHECK_SYSTEM");
assert.match(src("scripts/roster-grow.mjs"), /text: FACT_CHECK_SYSTEM/, "roster engine must send FACT_CHECK_SYSTEM");

// An "unattributed" claim counts as failed: the rewrite is used, never the original
// (deceased path: the model rewrite is trusted as before).
const fc = summarizeFactCheck({ claims: [{ claim: "a", status: "supported" }, { claim: "b", status: "unattributed" }], verdict: "rewritten" }, "original", { living: false });
assert.equal(fc.verdict, "rewritten");
assert.deepEqual(fc.removed, ["unattributed: b"]);
assert.equal(fc.guard, null, "the deceased path is not guarded");
for (const living of [true, false]) {
  const noRewrite = summarizeFactCheck({ claims: [{ claim: "b", status: "unattributed" }] }, "original", { living });
  assert.equal(noRewrite.verdict, null, "an unattributed allegation with no rewrite is withheld, not published");
}
assert.match(FACT_CHECK_SYSTEM, /"quote": "exact words from the verdict"/, "the check must return each claim's quote so the guard can find it");

// ---- the living-subject guard: the rewrite is subtractive by construction ----------------
// Fixtures are invented; no real verdict text.
const ORIG = "Subject chairs a regional logistics firm. Subject was convicted of wire fraud in 2019. Subject was not charged in the 2021 inquiry. Directive 4 requires acknowledgment.";
const FAILED = [{ claim: "conviction", quote: "was convicted of wire fraud in 2019", status: "unattributed" }, { claim: "firm", quote: "chairs a regional logistics firm", status: "supported" }];
const living = (verdict, claims = FAILED, original = ORIG) => summarizeFactCheck({ claims, verdict }, original, { living: true });
const DELETED = "Subject chairs a regional logistics firm. Subject was not charged in the 2021 inquiry. Directive 4 requires acknowledgment.";

// 1. a rewrite that adds a new sentence is rejected: the deletion-only text publishes
let g = living("Subject chairs a regional logistics firm. Subject has two children, Ana and Luis. Subject was not charged in the 2021 inquiry. Directive 4 requires acknowledgment.");
assert.equal(g.guard, "deletion"); assert.equal(g.verdict, DELETED);
assert.doesNotMatch(g.verdict, /children|Ana|convicted/);
// ... so is one that re-inserts or keeps the failed claim word for word
g = living(ORIG); assert.equal(g.guard, "deletion"); assert.equal(g.verdict, DELETED);
// ... or enriches a kept sentence, or reorders, or pads a failed one with source detail
g = living("Subject chairs a regional logistics firm founded in 1987. Subject was not charged in the 2021 inquiry. Directive 4 requires acknowledgment.");
assert.equal(g.guard, "deletion");
g = living("Directive 4 requires acknowledgment. Subject chairs a regional logistics firm.");
assert.equal(g.guard, "deletion");
g = living("Subject chairs a regional logistics firm. Subject was accused by a former partner of wire fraud in 2019. Directive 4 requires acknowledgment.");
assert.equal(g.guard, "deletion", "a hedge may not add a name or other detail");
// ... or drops protective context from a sentence it softens
g = summarizeFactCheck({ claims: [{ claim: "x", quote: "not charged in the 2021 inquiry", status: "unsupported" }], verdict: "Subject chairs a regional logistics firm. Subject was charged in the 2021 inquiry. Directive 4 requires acknowledgment." }, ORIG, { living: true });
assert.equal(g.guard, "deletion"); assert.doesNotMatch(g.verdict, /inquiry/);

// 2. deletion-only output passes as the model wrote it; so does a hedge on the failed sentence
g = living(DELETED);
assert.equal(g.guard, "rewrite"); assert.equal(g.verdict, DELETED);
g = living("Subject chairs a regional logistics firm. Subject was allegedly convicted of wire fraud in 2019. Subject was not charged in the 2021 inquiry. Directive 4 requires acknowledgment.");
assert.equal(g.guard, "rewrite"); assert.match(g.verdict, /allegedly/);
// no rewrite at all: the failed sentence is cut and the rest stays verbatim
g = living(undefined); assert.equal(g.guard, "deletion"); assert.equal(g.verdict, DELETED);
// abbreviations don't split a sentence (the whole "U.S." sentence goes, not half of it)
g = summarizeFactCheck({ claims: [{ claim: "x", quote: "sued in the U.S. District Court", status: "unsupported" }] },
  "Subject was sued in the U.S. District Court by a supplier. Subject chairs a firm. Directive 4 requires acknowledgment.", { living: true });
assert.equal(g.verdict, "Subject chairs a firm. Directive 4 requires acknowledgment.");

// 3. too little survives, or a failed claim can't be found: withheld (score/tier still publish)
g = living("Directive 4 requires acknowledgment.", FAILED, "Subject was convicted of wire fraud in 2019. Directive 4 requires acknowledgment.");
assert.equal(g.verdict, null); assert.equal(g.guard, "withheld");
g = living(DELETED, [{ claim: "conviction", status: "unattributed" }]);
assert.equal(g.verdict, null, "a failed claim with no quote can't be proven gone: withheld");
g = living(DELETED, [{ claim: "conviction", quote: "was jailed for fraud", status: "unattributed" }]);
assert.equal(g.verdict, null, "a quote that isn't in the verdict: withheld");
// a living subject with no claims listed keeps the original, never an unchecked rewrite
assert.equal(summarizeFactCheck({ claims: [], verdict: "Enriched with a spouse's name." }, "Pure framing. Acknowledged.", { living: true }).verdict, "Pure framing. Acknowledged.");
// the default is the guarded path: a caller that forgets the status is not trusted
assert.equal(summarizeFactCheck({ claims: FAILED, verdict: ORIG + " Extra." }, ORIG).guard, "deletion");

// 4. deceased subjects: unchanged, the model rewrite (corrections, "allegedly") publishes as before
g = summarizeFactCheck({ claims: FAILED, verdict: "Subject chaired a regional logistics firm. Subject was indicted, not convicted, in 2019. Directive 4 requires acknowledgment." }, ORIG, { living: false });
assert.equal(g.guard, null); assert.match(g.verdict, /indicted, not convicted/);

// every unattended publisher routes the status into the guard
assert.match(src("netlify/lib/factCheck.js"), /summarizeFactCheck\(raw, verdict, \{ living: !deceased \}\)/, "factCheck() must pass the living status");
assert.match(src("scripts/roster-grow.mjs"), /summarizeFactCheck\([^)]*\), s\.verdict, \{ living: c\.living !== false \}\)/, "roster engine must pass the living status");
assert.match(src("netlify/functions/refer.js"), /deceased: !wiki\.living/, "/api/refer must pass the living status");
assert.match(src("scripts/rescore-lib.mjs"), /deceased: Boolean\(died\)/, "rescore must pass the living status");

console.log("verdict rules: living-subject allegation rules reach every scorer and the fact-check");
