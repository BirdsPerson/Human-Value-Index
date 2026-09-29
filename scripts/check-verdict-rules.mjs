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

// An "unattributed" claim counts as failed: the rewrite is used, never the original.
const fc = summarizeFactCheck({ claims: [{ claim: "a", status: "supported" }, { claim: "b", status: "unattributed" }], verdict: "rewritten" }, "original");
assert.equal(fc.verdict, "rewritten");
assert.deepEqual(fc.removed, ["unattributed: b"]);
const noRewrite = summarizeFactCheck({ claims: [{ claim: "b", status: "unattributed" }] }, "original");
assert.equal(noRewrite.verdict, null, "an unattributed allegation with no rewrite is withheld, not published");

console.log("verdict rules: living-subject allegation rules reach every scorer and the fact-check");
