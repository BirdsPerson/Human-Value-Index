// Offline self-check for the referral logic: name validation, the Wikipedia gate
// (stubbed fetch), slug/dedupe against the figures on file, and the quota math.
//   node scripts/check-refer.mjs
import assert from "node:assert/strict";
import { nameError, cleanName, titleSlug, onFileFigure, classifySummary, resolveWikipedia, monthKey, remainingThisMonth, PER_CASE_MONTHLY, REJECT, FIGURE_QIDS, placeReferral, ageFrom } from "../netlify/lib/refer.js";
import { FAMOUS_FIGURES, slugify } from "../src/figures.js";

// --- names
for (const ok of ["Dolly Parton", "keanu reeves", "Pelé", "O.J. Simpson", "Martin Luther King Jr.", "Kim Jong-un", "Sinéad O’Connor", "Björk"]) assert.equal(nameError(ok), null, ok);
for (const bad of ["", "   ", null, 42, "x".repeat(81), "<script>", "Robert'); DROP TABLE", "1234", "@elonmusk", "https://x.com"]) assert.ok(nameError(bad), String(bad));
assert.equal(cleanName("  dolly    parton "), "dolly parton");

// --- slugs and dedupe
assert.equal(titleSlug("Prince (musician)"), "prince");
assert.equal(titleSlug("Joe Jackson (manager)"), "joe-jackson");
assert.equal(titleSlug("Nikola Jokić"), "nikola-jokic");
assert.equal(titleSlug("Dolly Parton"), "dolly-parton");
// Every figure on file is found under its own name, and under the Wikipedia titles that differ.
for (const f of FAMOUS_FIGURES) assert.equal(onFileFigure(slugify(f.name))?.name, f.name, f.name);
for (const [title, name] of [["John F. Kennedy", "JFK"], ["Vladimir Putin", "Putin"], ["Elizabeth II", "Queen Elizabeth II"],
  ["Diana, Princess of Wales", "Princess Diana"], ["O. J. Simpson", "O.J. Simpson"], ["Keanu Reeves", "Keanu Reeves"], ["Kim Jong Un", "Kim Jong-un"]]) {
  assert.equal(onFileFigure(titleSlug(title))?.name, name, title);
}
assert.equal(onFileFigure("dolly-parton"), null);

// --- Wikipedia classification
assert.deepEqual(classifySummary(null), { ok: false, reason: "none" });
assert.equal(classifySummary({ title: "Paris", type: "standard" }, ["Q515", "Q5119"]).reason, "notHuman");
assert.equal(classifySummary({ title: "John Smith", type: "disambiguation" }, []).reason, "ambiguous");
assert.equal(classifySummary({ title: "Sherlock Holmes", type: "standard" }, ["Q15632617"]).reason, "notHuman");
const dolly = classifySummary({ title: "Dolly Parton", type: "standard", description: "American singer", extract: "x".repeat(5000), wikibase_item: "Q180453" }, ["Q5"]);
assert.equal(dolly.ok, true);
assert.equal(dolly.extract.length, 1500);

// --- resolveWikipedia end to end with a stubbed fetch
function stub(routes) {
  const calls = [];
  const f = async (url, opts) => {
    calls.push(url);
    assert.match(opts.headers["User-Agent"], /HumanValueIndex/);
    const hit = routes.find(([re]) => re.test(url));
    if (!hit) return { ok: false, status: 404, json: async () => null };
    const [, body, status = 200] = hit;
    return { ok: status < 400, status, json: async () => body };
  };
  f.calls = calls;
  return f;
}
let f = stub([
  [/list=search/, { query: { search: [{ title: "Dolly Parton" }] } }],
  [/page\/summary\/Dolly_Parton/, { title: "Dolly Parton", type: "standard", description: "American singer-songwriter", extract: "Dolly Rebecca Parton…", wikibase_item: "Q180453" }],
  [/wbgetclaims.*Q180453/, { claims: { P31: [{ mainsnak: { datavalue: { value: { id: "Q5" } } } }] } }],
]);
let r = await resolveWikipedia("dolly parton", f);
assert.equal(r.ok, true); assert.equal(r.title, "Dolly Parton"); assert.equal(f.calls.length, 5);
assert.equal(r.living, true, "no death claim on record = living");

// death on record -> not living; born under 18 years ago and living -> refused as a minor
const P = (prop, snaks) => ({ claims: { [prop]: snaks.map(mainsnak => ({ mainsnak })) } });
const time = t => ({ datavalue: { value: { time: t } } });
f = stub([
  [/list=search/, { query: { search: [{ title: "Prince (musician)" }] } }],
  [/page\/summary\/Prince_\(musician\)/, { title: "Prince (musician)", type: "standard", wikibase_item: "Q7542" }],
  [/Q7542&property=P31/, P("P31", [{ datavalue: { value: { id: "Q5" } } }])],
  [/Q7542&property=P570/, P("P570", [time("+2016-04-21T00:00:00Z")])],
]);
r = await resolveWikipedia("prince", f);
assert.equal(r.ok, true); assert.equal(r.living, false);
const kid = new Date(); kid.setUTCFullYear(kid.getUTCFullYear() - 12);
assert.equal(classifySummary({ title: "A Child Actor", type: "standard" }, ["Q5"], { born: "+" + kid.toISOString().slice(0, 10) + "T00:00:00Z", died: false }).reason, "minor");
assert.equal(classifySummary({ title: "An Adult", type: "standard" }, ["Q5"], { born: "+1960-01-01T00:00:00Z", died: false }).ok, true);
assert.equal(ageFrom("+2000-09-25T00:00:00Z", new Date("2018-09-24T12:00:00Z")), 17, "birthday not reached yet");
assert.equal(ageFrom("+2000-09-24T00:00:00Z", new Date("2018-09-24T12:00:00Z")), 18);
assert.equal(ageFrom("unknown"), null);
assert.ok(REJECT.minor && REJECT.victim && REJECT.pending_case && REJECT.withdrawn);

// dedupe by person: every figure on file has an id; a namesake gets its own slug
for (const f of FAMOUS_FIGURES) assert.match(FIGURE_QIDS[f.name] || "", /^Q\d+$/, `qid for ${f.name}`);
const none = async () => null;
assert.equal((await placeReferral({ title: "Joe Jackson (talent manager)", wikidata: "Q361297" }, none)).onFile?.name, "Joe Jackson");
assert.deepEqual(await placeReferral({ title: "Joe Jackson (musician)", wikidata: "Q1349079" }, none), { slug: "joe-jackson-musician" });
assert.deepEqual(await placeReferral({ title: "Michael Jackson (writer)", wikidata: "Q6831558" }, none), { slug: "michael-jackson-writer" });
const evans = { slug: "chris-evans", wikidata: "Q178348" };
const held = async s => (s === "chris-evans" ? evans : null);
assert.equal((await placeReferral({ title: "Chris Evans (actor)", wikidata: "Q178348" }, held)).existing, evans, "same person: already on file");
assert.deepEqual(await placeReferral({ title: "Chris Evans (presenter)", wikidata: "Q2964710" }, held), { slug: "chris-evans-presenter" });
assert.deepEqual(await placeReferral({ title: "Dolly Parton", wikidata: "Q180453" }, none), { slug: "dolly-parton" });
assert.deepEqual(await placeReferral({ title: "Index", wikidata: "Q1" }, none), { slug: "index-q1" }, "the store's index key is never a slug");

f = stub([[/list=search/, { query: { search: [] } }]]);
assert.deepEqual(await resolveWikipedia("asdfqwer", f), { ok: false, reason: "none" });

f = stub([
  [/list=search/, { query: { search: [{ title: "Paris" }] } }],
  [/page\/summary\/Paris/, { title: "Paris", type: "standard", wikibase_item: "Q90" }],
  [/wbgetclaims.*Q90/, { claims: { P31: [{ mainsnak: { datavalue: { value: { id: "Q515" } } } }] } }],
]);
assert.equal((await resolveWikipedia("Paris", f)).reason, "notHuman");

f = stub([[/list=search/, {}, 500]]);
assert.equal((await resolveWikipedia("anyone", f)).reason, "lookup");
assert.ok(REJECT.lookup && REJECT.none && REJECT.notHuman && REJECT.ambiguous);

// --- quota math
assert.equal(monthKey(new Date("2026-09-24T23:59:59Z")), "2026-09");
assert.equal(monthKey(new Date("2026-10-01T00:00:00Z")), "2026-10");
assert.equal(PER_CASE_MONTHLY, 3);
assert.equal(remainingThisMonth(0), 3);
assert.equal(remainingThisMonth(2), 1);
assert.equal(remainingThisMonth(3), 0);
assert.equal(remainingThisMonth(7), 0);
assert.equal(remainingThisMonth(undefined), 3);

console.log("check-refer ok");
