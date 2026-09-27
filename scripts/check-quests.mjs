// Side quests -> vouches: catalog rules, the pure quest rules, and /api/quest end to end
// with an in-memory Blobs store. No network. Run: node scripts/check-quests.mjs
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

globalThis.__blobs = new Map();
const blobsSrc = `
let n = 0;
export function getStore({ name }) {
  const m = globalThis.__blobs;
  if (!m.has(name)) m.set(name, new Map());
  const s = m.get(name);
  const read = k => (s.has(k) ? JSON.parse(JSON.stringify(s.get(k).data)) : null);
  return {
    async get(k) { return read(k); },
    async getWithMetadata(k) { return s.has(k) ? { data: read(k), etag: s.get(k).etag, metadata: {} } : null; },
    async setJSON(k, v, o = {}) {
      if (o.onlyIfNew && s.has(k)) return { modified: false };
      if (o.onlyIfMatch && (!s.has(k) || s.get(k).etag !== o.onlyIfMatch)) return { modified: false };
      const etag = "e" + ++n; s.set(k, { data: JSON.parse(JSON.stringify(v)), etag }); return { modified: true, etag };
    },
    async list({ prefix = "" } = {}) { return { blobs: [...s.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; },
  };
}`;
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === "@netlify/blobs") return { url: "data:text/javascript," + encodeURIComponent(blobsSrc), shortCircuit: true };
    return next(spec, ctx);
  },
});
console.error = console.warn = () => {};
globalThis.fetch = async () => { throw new Error("quests must not call the network"); };

const { QUESTS, QUEST, questFigure, locate, contactAt } = await import("../src/quests.js");
const { applyQuest, questState, COMPLETIONS_PER_DAY, MIN_ELAPSED_MS } = await import("../netlify/lib/quests.js");
const { getTier } = await import("../src/figures.js");
const quest = (await import("../netlify/functions/quest.js")).default;
const { BUILDING } = await import("../src/city/simApi.js");

// ---- catalog ----------------------------------------------------------------------
const RUBRIC = ["care", "alignment", "utility", "adaptability", "legacy", "network", "physical"];
const dims = new Set();
for (const q of QUESTS) {
  const f = questFigure(q);
  assert.ok(f, `${q.id}: figure ${q.figure} on file`);
  assert.ok(f.died, `${q.id}: living figures never speak, so never offer quests`);
  assert.ok(f.score >= 400 && !/SOYLENT/.test(getTier(f.score).label), `${q.id}: no gated or low-tier figure hands out vouches`);
  assert.ok(RUBRIC.includes(q.dim), `${q.id}: vouches in a scored, positive category (${q.dim})`);
  assert.ok(!dims.has(q.dim), `${q.id}: one quest per category, so a category holds at most one vouch`);
  dims.add(q.dim);
  assert.ok(q.line.length > 20 && q.line.length < 200, `${q.id}: a line, not an essay`);
}
// Every giver can actually be found: in a public building for a real share of a machine day
// (24 real minutes), and the contact test agrees with locate.
const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const sightings = {};
for (const q of QUESTS) {
  let found = 0;
  for (let s = 0; s < 1440; s++) {
    const l = locate(q, T0 + s * 1000);
    if (l.buildingId) {
      found++;
      assert.ok(BUILDING[l.buildingId] && l.districtId !== "hq", `${q.id}: never "found" inside HQ`);
      if (!sightings[q.id]) sightings[q.id] = { t: T0 + s * 1000, b: l.buildingId };
    }
  }
  assert.ok(found / 1440 >= 0.2, `${q.id}: findable ${Math.round(found / 14.4)}% of the day (want >= 20%)`);
}

// ---- rules ------------------------------------------------------------------------
const q = QUESTS[0], seen = sightings[q.id];
const at = seen.t;
const scored = { caseId: "HVI-TESTAAAA", history: [{ score: 600, at: "x" }] };
assert.equal(applyQuest({ history: [] }, { action: "accept", questId: q.id }, at).status, 403, "unassessed: refused");
assert.equal(applyQuest({ history: [{ score: 600, voided: true }] }, { action: "accept", questId: q.id }, at).status, 403, "voided file only: refused");
assert.equal(applyQuest(scored, { action: "accept", questId: "nope" }, at).status, 400);
assert.equal(applyQuest(scored, { action: "fly", questId: q.id }, at).status, 400);
let r = applyQuest(scored, { action: "accept", questId: q.id }, at - MIN_ELAPSED_MS - 5000);
assert.ok(r.record?.quests.active, "accept");
let rec = r.record;
assert.equal(applyQuest(rec, { action: "accept", questId: q.id }, at).status, 409, "no double accept");
assert.equal(applyQuest(rec, { action: "accept", questId: QUESTS[1].id }, at).status, 409, "one at a time");
assert.equal(applyQuest(rec, { action: "complete", questId: QUESTS[1].id, buildingId: seen.b }, at).status, 409, "complete what you hold only");
const other = Object.keys(BUILDING).find(b => b !== seen.b && b !== "hq");
assert.equal(applyQuest(rec, { action: "complete", questId: q.id, buildingId: other }, at).status, 409, "wrong building refused");
assert.equal(applyQuest(rec, { action: "complete", questId: q.id }, at).status, 409, "no building refused");
const early = applyQuest(scored, { action: "accept", questId: q.id }, at).record;
assert.equal(applyQuest(early, { action: "complete", questId: q.id, buildingId: seen.b }, at + 1000).status, 425, "instant report refused");
assert.ok(contactAt(q, seen.b, at), "contact test sees the sighting");
assert.ok(contactAt(q, seen.b, at + 60 * 1000), "90 s of slack for a report in flight");
r = applyQuest(rec, { action: "complete", questId: q.id, buildingId: seen.b }, at);
assert.ok(r.vouch && r.vouch.dim === q.dim && r.vouch.figure === q.figure, "vouch issued in the figure's category");
rec = r.record;
let st = questState(rec, at);
assert.deepEqual(st.done, [q.id]);
assert.equal(st.active, null);
assert.equal(st.vouches.length, 1);
assert.equal(applyQuest(rec, { action: "accept", questId: q.id }, at).status, 409, "a figure vouches once");
// abandon
r = applyQuest(rec, { action: "accept", questId: QUESTS[1].id }, at);
assert.equal(applyQuest(r.record, { action: "abandon", questId: QUESTS[2].id }, at).status, 409);
assert.equal(questState(applyQuest(r.record, { action: "abandon", questId: QUESTS[1].id }, at).record).active, null, "abandon");
// daily cap: fake that today's quota is spent
const spent = { ...rec, quests: { active: { id: QUESTS[1].id, at: new Date(at - 120000).toISOString() }, done: Array.from({ length: COMPLETIONS_PER_DAY }, (_, i) => ({ id: `x${i}`, at: new Date(at).toISOString() })) } };
assert.equal(applyQuest(spent, { action: "complete", questId: QUESTS[1].id, buildingId: "any" }, at).status, 429, "daily cap");
// the rules never touch the score
assert.deepEqual(rec.history, scored.history, "a vouch does not move the number (yet)");

// ---- /api/quest end to end ----------------------------------------------------------
const cases = () => globalThis.__blobs.get("hvi-cases");
const call = (method, body, qs = "") => quest(new Request(`http://localhost/api/quest${qs}`, {
  method, headers: { "Content-Type": "application/json", origin: "http://localhost" }, body: method === "POST" ? JSON.stringify(body) : undefined,
}), { ip: "10.0.0.1" });
const realNow = Date.now;
Date.now = () => at - 120000;
let res = await call("GET", null, "?caseId=HVI-TESTAAAA");
assert.equal(res.status, 404, "no file");
const { getStore } = await import("@netlify/blobs");
await getStore({ name: "hvi-cases" }).setJSON("HVI-TESTAAAA", scored);
res = await call("GET", null, "?caseId=hvi-testaaaa");
assert.equal(res.status, 200);
assert.equal((await res.json()).eligible, true);
assert.equal((await call("POST", { caseId: "nope", action: "accept", questId: q.id })).status, 400);
res = await call("POST", { caseId: "HVI-TESTAAAA", action: "accept", questId: q.id });
assert.equal(res.status, 200, "accept over HTTP");
assert.equal((await res.json()).active.id, q.id);
Date.now = () => at;
res = await call("POST", { caseId: "HVI-TESTAAAA", action: "complete", questId: q.id, buildingId: other });
assert.equal(res.status, 409);
assert.match((await res.json()).error, /census/);
res = await call("POST", { caseId: "HVI-TESTAAAA", action: "complete", questId: q.id, buildingId: seen.b });
assert.equal(res.status, 200, "complete over HTTP");
const body = await res.json();
assert.equal(body.vouch.dim, q.dim);
assert.equal(cases().get("HVI-TESTAAAA").data.vouches.length, 1, "vouch stored on the case");
assert.equal(cases().get("HVI-TESTAAAA").data.history[0].score, 600, "score untouched");
const foreign = await quest(new Request("http://localhost/api/quest", { method: "POST", headers: { origin: "https://evil.example" }, body: "{}" }), {});
assert.equal(foreign.status, 403, "foreign origin refused");
// per-IP meter
let last;
for (let i = 0; i < 70; i++) last = await call("GET", null, "?caseId=HVI-TESTAAAA");
assert.equal(last.status, 429, "per-IP hourly meter");
Date.now = realNow;

console.log(`check-quests: ok (${QUESTS.length} quests, ${dims.size} categories, rules + /api/quest)`);
