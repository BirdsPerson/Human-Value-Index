// Founders and prophets of the world's faiths are not assessed or depicted (netlify/lib/excluded.js).
import assert from "node:assert/strict";
import { EXCLUDED_QIDS, EXCLUDED_LINE, isExcludedQid, backstopFrom, backstopQuery, excludedAmong, BACKSTOP_BORN_BEFORE } from "../netlify/lib/excluded.js";
import { skipByPolicy } from "./roster/candidates.mjs";

// the denylist
for (const q of ["Q9458", "Q302", "Q9077", "Q9181", "Q9441", "Q83322", "Q35811", "Q9333", "Q101054", "Q104273", "Q9422"]) assert.ok(isExcludedQid(q), q);
assert.equal(EXCLUDED_QIDS.Q9458, "Muhammad");
assert.match(EXCLUDED_LINE, /sealed by policy/);
// clergy, saints, reformers, scholars: not excluded
for (const q of ["Q30547" /* Mother Teresa */, "Q42013" /* not a prophet */, "Q43409", "Q4604" /* Confucius */]) assert.ok(!isExcludedQid(q), q);

// the backstop: prophet / founder-of-religion born before the cutoff, or undated
const b = (q, born) => ({ item: { value: `http://www.wikidata.org/entity/${q}` }, ...(born ? { born: { value: born } } : {}) });
const set = backstopFrom([b("Q1", "-0600-01-01T00:00:00Z"), b("Q2", "1817-11-12T00:00:00Z"), b("Q3"), b("Q4", "1959-08-17T00:00:00Z"), { item: { value: "junk" } }]);
assert.deepEqual([...set].sort(), ["Q1", "Q2", "Q3"], "modern self-styled prophets and cult leaders are still assessed");
assert.equal(BACKSTOP_BORN_BEFORE, 1850);
assert.match(backstopQuery(["Q1", "bad"]), /wd:Q42857/); assert.doesNotMatch(backstopQuery(["Q1", "bad"]), /wd:bad/);

// excludedAmong: denylist without a lookup; backstop from SPARQL; a failed lookup excludes nothing extra
let sparql = 0;
const stub = hits => async url => { sparql++; return { ok: true, json: async () => ({ results: { bindings: hits } }) }; };
assert.deepEqual([...(await excludedAmong(["Q9458"], stub([])))], ["Q9458"]); assert.equal(sparql, 0, "denylist needs no lookup");
assert.deepEqual([...(await excludedAmong(["Q777", "Q30547"], stub([b("Q777", "1200-01-01T00:00:00Z")])))], ["Q777"]);
assert.deepEqual([...(await excludedAmong(["Q30547"], stub([])))], [], "Mother Teresa is not excluded");
assert.deepEqual([...(await excludedAmong(["Q888"], async () => { throw new Error("down"); }))], []);

// the roster engine never drafts them
assert.equal(await skipByPolicy("Q302", stub([])), true);
assert.equal(await skipByPolicy("Q30547", stub([])), false);
console.log("check-excluded ok");
