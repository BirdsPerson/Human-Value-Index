// Emergent relationships (src/city/social.js): determinism, bounds, symmetry, the
// friend-feedback actually clustering people, narration never putting words in anyone's
// mouth, and the city's other promises (quest meetings, room capacity) still holding
// once friends start pulling each other around. Scaling step 6: the per-subject bound
// (K), the ledger in 64 pair buckets (fold per bucket == one fold; sector windows ==
// the one-file plan == whereAt), the bucketed store (checkpoints, resume, lease, CAS,
// orphans, migration from the one-blob ledger). No network. Run: node scripts/check-social.mjs
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// @netlify/blobs in memory (the /api/social function reads the default store).
globalThis.__blobs = new Map();
const blobsSrc = `
let n = 0;
export function getStore({ name }) {
  const m = globalThis.__blobs;
  if (!m.has(name)) m.set(name, new Map());
  const s = m.get(name);
  const read = (k) => (s.has(k) ? JSON.parse(JSON.stringify(s.get(k).data)) : null);
  return {
    async get(k) { return read(k); },
    async getWithMetadata(k) { return s.has(k) ? { data: read(k), etag: s.get(k).etag, metadata: {} } : null; },
    async getMetadata(k) { return s.has(k) ? { etag: s.get(k).etag, metadata: {} } : null; },
    async setJSON(k, v, o = {}) {
      if (o.onlyIfNew && s.has(k)) return { modified: false };
      if (o.onlyIfMatch && (!s.has(k) || s.get(k).etag !== o.onlyIfMatch)) return { modified: false };
      const etag = "e" + ++n; s.set(k, { data: JSON.parse(JSON.stringify(v)), etag }); return { modified: true, etag };
    },
    async delete(k) { s.delete(k); },
    async list({ prefix = "" } = {}) { return { blobs: [...s.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; },
  };
}`;
registerHooks({ resolve(spec, ctx, next) { return spec === "@netlify/blobs" ? { url: "data:text/javascript," + encodeURIComponent(blobsSrc), shortCircuit: true } : next(spec, ctx); } });

const SIM = await import("../src/city/sim.js");
const SOC = await import("../src/city/social.js");
const { baseRoster } = await import("../src/city/roster.js");
const { QUESTS, locate, meetingAt } = await import("../src/quests.js");
const { BUILDING } = await import("../src/city/simApi.js");

const roster = baseRoster();
// A few citizens, judged on the public axes only (no breakdown is ever read for them).
for (let i = 0; i < 6; i++) roster.push({ name: `Subject Q${i}`, slug: `citizen-q${i}`, kind: "citizen", score: 500 + i * 40, tier: "TOLERATED GENERALIST", warmth: 40 + i * 8, competence: 70 - i * 5 });

const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);            // the quest check's window starts here
const H0 = Math.floor(SIM.machineClock(T0).mt);
const START = (Math.floor(H0 / 24) - 30) * 24;        // 30 machine days before, on a day boundary
const END = H0 + 14 * 24 + 24;                        // through the 14-day quest window

// ---- determinism: one run == many chunks == input order shuffled ------------------------
SIM.clearSocialSnapshots();
const one = SOC.advance(SOC.emptyState(START), roster, START + 24 * 12);
SIM.clearSocialSnapshots();
const chunked = SOC.emptyState(START);
for (let h = START; h < START + 24 * 12; h += 37) SOC.advance(chunked, [...roster].reverse(), Math.min(h + 37, START + 24 * 12));
assert.equal(JSON.stringify(one), JSON.stringify(chunked), "same state whether advanced at once or in chunks, in any roster order");

// ---- the full run -------------------------------------------------------------------------
SIM.clearSocialSnapshots();
const t0 = Date.now();
// keepSnapshots: the checks below need every day of the quest window's snapshot; the
// deployed tick keeps the default (bounded) number.
const state = SOC.advance(SOC.emptyState(START), roster, END, { keepSnapshots: 64 });
const ms = Date.now() - t0;
assert.ok(ms < 20000, `44 machine days advance in ${ms} ms (the scheduled function has ~30 s)`);

// ---- bounds and symmetry ------------------------------------------------------------------
// Right after a day boundary nobody holds more than K pairs (between boundaries, at most one
// machine day of new pairs over); a small K makes the bound bite at this roster size.
const degrees = (st) => { const d = new Map(); for (const [pk] of SOC.allPairs(st)) for (const k of pk.split("|")) d.set(k, (d.get(k) || 0) + 1); return d; };
{
  SIM.clearSocialSnapshots();
  const small = SOC.advance(SOC.emptyState(START), roster, START + 24 * 8, { k: 6 });
  const deg = degrees(small), max = Math.max(...deg.values());
  assert.ok(max <= 6, `per-subject bound: at most K pairs each after a day boundary (max ${max})`);
  SIM.clearSocialSnapshots();
  const loose = SOC.advance(SOC.emptyState(START), roster, START + 24 * 8, { k: 1e9 });
  assert.ok(Math.max(...degrees(loose).values()) > 6, "and without it some subjects hold more (the bound is what bit)");
  SIM.clearSocialSnapshots(); SIM.setSocialSnapshots(state.snapshots);   // the full run's city again, for the checks below
}
// A pair survives only if BOTH sides keep it. a keeps a|b (its second best of two) but b's
// best two are b|c and b|d: a|b goes, and so a holds one pair, b two.
{
  const st = SOC.emptyState(0);
  const put = (x, y, aff, last = 0, recent = 0) => { const pk = SOC.pairKey(x, y); st.buckets[SOC.bucketOf(pk)].pairs[pk] = [aff, 5, last, null, recent]; };
  put("a", "b", 20); put("a", "e", 50); put("b", "c", 40); put("b", "d", 35);
  put("x", "y", 10, 90, 4); put("x", "z", 17, 0, 0); put("x", "w", 16);   // x: y ranks 10 + 2 x 4 = 18 this week, above z (17)
  const dropped = SOC.prunePerSubject(st, 100, 2);
  const has = (x, y) => Boolean(SOC.pairOf(st, SOC.pairKey(x, y)));
  assert.ok(!has("a", "b") && has("a", "e") && has("b", "c") && has("b", "d"), "a pair survives only if both sides keep it");
  assert.ok(has("x", "y") && has("x", "z") && !has("x", "w"), "this week's meetings count in the ranking");
  assert.equal(dropped, 2);
  put("x", "w", 16);
  SOC.prunePerSubject(st, 100 + SOC.WEEK, 2);
  assert.ok(!has("x", "y") && has("x", "z") && has("x", "w"), "last week's meetings do not");
}
{
  const deg = degrees(state);
  let over = 0; for (const n of deg.values()) if (n > SOC.K) over++;
  const endDay = Math.floor(END / 24) * 24;   // END is mid-day: new pairs since the boundary may exceed K
  assert.ok(over <= deg.size * 0.2, `few subjects over K mid-day (${over}/${deg.size}; boundary at ${endDay})`);
}
for (const b of state.buckets) assert.ok(b.events.length <= SOC.BUCKET_EVENTS, "event log bounded per bucket");
assert.equal(state.buckets.length, SOC.BUCKETS);
for (const [i, b] of state.buckets.entries()) for (const pk of Object.keys(b.pairs)) assert.equal(SOC.bucketOf(pk), i, `${pk} filed in its own bucket`);
for (const [i, b] of state.buckets.entries()) for (const e of b.events) assert.equal(SOC.bucketOf(SOC.pairKey(e.a, e.b)), i, "events filed with their pair");
assert.ok(Object.keys(one.snapshots).length <= SOC.KEEP_SNAPSHOTS, "snapshots bounded (default keep)");
for (const [pk, rec] of SOC.allPairs(state)) {
  const [a, b] = pk.split("|");
  assert.ok(a < b, `${pk}: pair keys are sorted, so a|b and b|a are one record`);
  assert.ok(rec[0] >= -100 && rec[0] <= 100, `${pk}: affinity bounded`);
}
for (let i = 0; i < 40; i++) {
  const a = roster[(i * 7) % roster.length], b = roster[(i * 13 + 5) % roster.length];
  assert.equal(SOC.compat(a, b), SOC.compat(b, a), "compatibility is symmetric");
  assert.ok(Math.abs(SOC.compat(a, b)) <= 1, "compatibility bounded");
}
const pub = SOC.publish(state, END);
assert.ok(pub.friends.length > 5, `friendships form on their own (${pub.friends.length})`);
assert.ok(pub.friends.every(p => p.affinity >= SOC.T.friends) && pub.rivals.every(p => p.affinity <= SOC.T.rivals), "published levels match thresholds");

// ---- feedback clusters people -------------------------------------------------------------
// Over the last 10 days: friends share a leisure spot (the feedback only moves leisure) more often with the snapshots applied than
// the same people do with them cleared.
const friends = SOC.allPairs(state).filter(([, r]) => r[0] >= SOC.T.friends).map(([pk]) => pk.split("|"));
const byKey = new Map(roster.map(s => [SIM.keyOf(s), s]));
function coLocated() {
  let n = 0;
  for (let h = END - 24 * 10; h < END; h += 1) {
    for (const [a, b] of friends) {
      const wa = SIM.whereAt(byKey.get(a), h + 0.5), wb = SIM.whereAt(byKey.get(b), h + 0.5);
      if (wa.activity === "leisure" && wb.activity === "leisure" && wa.placeId === wb.placeId) n++;
    }
  }
  return n;
}
const withBias = coLocated();
const snaps = { ...state.snapshots };
SIM.clearSocialSnapshots();
const without = coLocated();
SIM.setSocialSnapshots(snaps);
assert.ok(withBias > without * 1.15, `friends co-locate more with the feedback on (${withBias} vs ${without} friend-hours)`);

// ---- narration: actions only, never words --------------------------------------------------
const SPEECH = /\b(SAID|SAYS|SAYING|TOLD|TELLS|ASKED|REPLIED|CLAIMED|WHISPERED|SHOUTED)\b|["“”]/;
for (const [kind, lines] of Object.entries(SOC.TEMPLATE_LINES)) for (const l of lines) assert.ok(!SPEECH.test(l), `${kind}: "${l}" puts words in someone's mouth`);
for (const e of SOC.allEvents(state)) assert.ok(!SPEECH.test(e.text), `event narrates speech: ${e.text}`);

// ---- gossip does not repeat itself -----------------------------------------------------------
// One pair meets once an hour at most, and "again" about the same pair is news once in
// three machine days, not every hour it happens (the feed read as a loop: 2026-09-29).
{
  const seen = new Map(), kinds = {};
  for (const e of SOC.allEvents(state)) {
    kinds[e.kind] = (kinds[e.kind] || 0) + 1;
    const k = `${e.a}|${e.b}`, prev = seen.get(k);
    if (e.kind === "again" && prev != null) assert.ok(e.h - prev >= 72, `${k}: "again" ${e.h - prev} machine hours after their last event`);
    assert.ok(prev == null || e.h > prev, `${k}: two events in machine hour ${e.h}`);
    seen.set(k, e.h);
  }
  for (const e of SOC.allEvents(state)) if (e.kind === "again" && SIM.PLACES[e.placeId]?.kind === "work") assert.ok(!/SHARED A TABLE/.test(e.text), `work room narrated as a table: ${e.text}`);
}

// ---- the city's other promises still hold with friends pulling people around -------------
// The quest window (T0 .. T0 + 14 machine days) now has published snapshots for most days.
const covered = Array.from({ length: 14 }, (_, i) => Math.floor(H0 / 24) + 1 + i).filter(d => snaps[d]).length;
for (const q of QUESTS.filter(q => q.kind === "find")) {
  let found = 0;
  for (let s = 0; s < 1440; s++) if (locate(q, T0 + s * 1000).buildingId) found++;
  assert.ok(found / 1440 >= 0.2, `${q.id}: still findable ${Math.round(found / 14.4)}% of the day with relationships on`);
}
for (const q of QUESTS.filter(q => q.kind === "witness")) {
  let met = 0; const days = new Set();
  for (let s = 0; s < 1440 * 14; s += 5) if (meetingAt(q, T0 + s * 1000)) { met++; days.add(Math.floor(s / 1440)); }
  assert.ok(met / (288 * 14) >= 0.15, `${q.id}: still convenes ${Math.round(met / 2.88 / 14)}% of the time with relationships on`);
  assert.ok(days.size >= 14 * 0.6, `${q.id}: still meets on ${days.size} of 14 days`);
}
// Room capacity: averages under capacity, peaks under twice it (check-city's rule).
const sums = {}, peaks = {};
let samples = 0;
for (let h = END - 24 * 7; h < END; h += 0.5) {
  const occ = SIM.occupancy(roster, h);
  samples++;
  for (const [id, n] of Object.entries(occ.places)) { sums[id] = (sums[id] || 0) + n; peaks[id] = Math.max(peaks[id] || 0, n); }
}
for (const [id, p] of Object.entries(SIM.PLACES)) {
  if (!sums[id]) continue;
  assert.ok(sums[id] / samples <= p.cap, `${id}: average occupancy ${(sums[id] / samples).toFixed(1)} within capacity ${p.cap}`);
  assert.ok((peaks[id] || 0) < p.cap * 2, `${id}: peak ${peaks[id]} under twice capacity ${p.cap}`);
}
BUILDING;   // (imported for parity with check-quests' view of the city)

// ---- withdrawn subjects leave the ledger ------------------------------------------------
// A file withdrawn by the Department (e.g. the wrong Frank Weiss) drops out of the census;
// the next advance must drop its pairs, events, name and boosts, and so must /api/social.
{
  const gone = [...new Set(SOC.allEvents(state).flatMap(e => [e.a, e.b]))].find(k => k.startsWith("citizen-q"))
    || SOC.allPairs(state).flatMap(([pk]) => pk.split("|")).find(k => k.startsWith("citizen-q"));
  assert.ok(gone, "a test citizen made at least one relationship to withdraw");
  const st = structuredClone(state);
  SOC.advance(st, roster.filter(s => SIM.keyOf(s) !== gone), st.hour + 48);
  const blob = JSON.stringify(st);
  assert.ok(!blob.includes(`"${gone}"`) && !blob.includes(`${gone}|`) && !blob.includes(`|${gone}"`), `${gone}: withdrawn subject gone from the stored state`);
  const p2 = SOC.publish(st, st.hour);
  assert.ok(!JSON.stringify(p2).includes(gone), `${gone}: withdrawn subject gone from the published ledger`);
  assert.ok(SOC.pairCount(st) > 0, "everyone else keeps their relationships");

  // The tick end to end, with a fake store: withdrawal drops them from bySubject too; a
  // failed census read writes nothing (a hiccup must never pass for an empty city).
  const { tick } = await import("../netlify/functions/social-tick.js");
  const store = { state: structuredClone(state), pub: null };
  const extra = roster.filter(s => s.kind === "citizen");
  const io = (census) => ({ getState: async () => structuredClone(store.state), putState: async v => { store.state = v; }, putPublic: async v => { store.pub = v; }, census });
  const nowMs = T0 + 60 * 60 * 1000;   // an hour of real time past the state's clock region
  store.state.hour = Math.floor(SIM.machineClock(nowMs).mt) - 5;
  await tick(nowMs, io(async () => extra.filter(s => SIM.keyOf(s) !== gone)));
  assert.ok(!JSON.stringify(store.pub).includes(gone) && !JSON.stringify(store.state).includes(`"${gone}"`), `${gone}: tick drops the withdrawn subject everywhere`);
  assert.ok(Object.keys(store.pub.bySubject).length > 0, "the tick still publishes everyone else");
  const before = JSON.stringify(store.state);
  await assert.rejects(tick(nowMs + 60_000, io(async () => { throw new Error("blobs down"); })));
  assert.equal(JSON.stringify(store.state), before, "a failed census leaves the ledger untouched");
}

// ties from the record: seeded once when both are on file, never over existing history
{
  const st = SOC.emptyState(100);
  st.names = { "samuel-beckett": "Samuel Beckett", "andre-the-giant": "André the Giant" };
  SOC.seedTies(st, new Set(["samuel-beckett"]));
  assert.equal(SOC.pairCount(st), 0, "no tie until both are on file");
  SOC.seedTies(st, new Set(["samuel-beckett", "andre-the-giant"]));
  const pk = SOC.pairKey("samuel-beckett", "andre-the-giant");
  assert.equal(SOC.pairOf(st, pk)[0], 45); assert.equal(SOC.allEvents(st).length, 1);
  assert.match(SOC.allEvents(st)[0].text, /CRICKET/);
  SOC.pairOf(st, pk)[0] = -20;   // the sim moved them; a later tick must not reset it
  SOC.seedTies(st, new Set(["samuel-beckett", "andre-the-giant"]));
  assert.equal(SOC.pairOf(st, pk)[0], -20); assert.equal(SOC.allEvents(st).length, 1);
}

// ---- chunking stays exact past the per-subject bound --------------------------------------------
// The bound is enforced at day boundaries, so where a call ends (the tick's wall-clock budget)
// never changes the city, even once pruning bites.
{
  const cap = { k: 4 };
  SIM.clearSocialSnapshots();
  const a = SOC.advance(SOC.emptyState(START), roster, START + 24 * 6, cap);
  SIM.clearSocialSnapshots();
  const b = SOC.emptyState(START);
  for (let h = START; h < START + 24 * 6; h += 5) SOC.advance(b, roster, Math.min(h + 5, START + 24 * 6), cap);
  SIM.clearSocialSnapshots();
  const c = SOC.advance(SOC.emptyState(START), roster, START + 24 * 6, { k: 1e9 });
  assert.ok(SOC.pairCount(a) < SOC.pairCount(c), `the bound bit (${SOC.pairCount(a)} pairs vs ${SOC.pairCount(c)} unbounded)`);
  assert.equal(JSON.stringify(a), JSON.stringify(b), "same state in one run or in 5-hour chunks with the per-subject bound biting");
}

// ---- publishAll == publishSubject for everyone (one grouping pass, not N scans) -----------------
{
  const keys = [...roster.map(s => s.slug), "nobody-here"];
  const all = SOC.publishAll(state, keys);
  let n = 0;
  for (const k of keys) {
    const one = SOC.publishSubject(state, k);
    if (!one.relations.length && !one.events.length) { assert.ok(!(k in all), `${k}: nothing to publish, left out`); continue; }
    n++;
    assert.deepEqual(all[k], { relations: one.relations, events: one.events }, `${k}: publishAll matches publishSubject`);
  }
  assert.ok(n > 10, `publishAll covered ${n} subjects`);
}

// ---- the tick: checkpoints, resume, lease, conditional writes, buckets ----------------------------
{
  const { tick, CHUNK_HOURS, TickConflict } = await import("../netlify/lib/social-tick.js");
  const { tickIo, tickSecret, tickAuthorized, TICK_HEADER, HEAD, subjectKey } = await import("../netlify/lib/social-store.js");
  // An in-memory Blobs store with etags and conditional writes (the parts tickIo uses).
  function fakeStore() {
    const m = new Map(); let n = 0; const log = [];
    return {
      m, log,
      async get(k) { return m.has(k) ? JSON.parse(m.get(k).v) : null; },
      async getWithMetadata(k) { return m.has(k) ? { data: JSON.parse(m.get(k).v), etag: m.get(k).etag, metadata: {} } : null; },
      async getMetadata(k) { return m.has(k) ? { etag: m.get(k).etag, metadata: {} } : null; },
      async setJSON(k, v, o = {}) {
        if (o.onlyIfNew && m.has(k)) return { modified: false };
        if (o.onlyIfMatch && (!m.has(k) || m.get(k).etag !== o.onlyIfMatch)) return { modified: false };
        const etag = `"e${++n}"`; m.set(k, { v: JSON.stringify(v), etag }); log.push(k); return { modified: true, etag };
      },
      async delete(k) { m.delete(k); },
      async list({ prefix = "" } = {}) { return { blobs: [...m.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; },
      read(k) { return m.has(k) ? JSON.parse(m.get(k).v) : null; },
    };
  }
  // The ledger as the store holds it: the header and the 64 buckets it names.
  const ledger = (f) => { const h = f.read(HEAD); if (!h) return null; const { at: _a, buckets, ...head } = h; return { ...head, buckets: buckets.map(k => f.read(k)) }; };
  const census = async () => roster.filter(s => s.kind === "citizen");
  const nowMs = T0 + 3 * 60 * 60 * 1000;
  const nowHour = Math.floor(SIM.machineClock(nowMs).mt);
  const seedV1 = SOC.toV1(state);   // the production ledger before step 6: one blob
  seedV1.hour = nowHour - 61;       // an hour and a bit behind: ~11 chunks
  const strip = (st) => { const { tick: _t, ...rest } = st; return JSON.stringify(rest); };
  const fresh = () => { const f = fakeStore(); f.m.set("state", { v: JSON.stringify(seedV1), etag: '"e0"' }); return f; };

  // Migration: the first run finds no header, converts the one-blob ledger with nothing lost,
  // and commits the header; the one-blob copy is rewritten at the end (rollback).
  {
    const conv = SOC.fromV1(structuredClone(seedV1));
    assert.equal(SOC.pairCount(conv), Object.keys(seedV1.pairs).length, "migration keeps every pair");
    for (const [pk, rec] of Object.entries(seedV1.pairs)) assert.deepEqual(SOC.pairOf(conv, pk).slice(0, 5), rec.slice(0, 5), `${pk}: same record after migration`);
    const back = SOC.toV1(conv);
    assert.deepEqual(Object.keys(back.pairs).sort(), Object.keys(seedV1.pairs).sort(), "and back");
    assert.equal(SOC.allEvents(conv).length, Math.min(seedV1.events.length, SOC.allEvents(conv).length));
    const lastEv = SOC.allEvents(conv).at(-1);
    assert.equal(SOC.pairOf(conv, SOC.pairKey(lastEv.a, lastEv.b))?.[5] ?? lastEv.h, lastEv.h, "each pair notes its latest event");
  }

  // One uninterrupted run.
  SIM.clearSocialSnapshots();
  const f1 = fresh();
  const r1 = await tick(nowMs, tickIo(() => f1, census));
  assert.equal(r1.hour, nowHour, "the run reaches the current machine hour");
  assert.equal(r1.migrated?.pairs, Object.keys(seedV1.pairs).length, "the run migrated the one-blob ledger");
  assert.ok(r1.chunks >= 10 && r1.chunks <= 12, `~${CHUNK_HOURS}h chunks (${r1.chunks})`);
  assert.equal(f1.log.filter(k => k === HEAD).length, r1.chunks, "one checkpoint (header) per chunk");
  const s1 = ledger(f1);
  assert.equal(s1.v, 2); assert.equal(s1.buckets.length, SOC.BUCKETS);
  assert.deepEqual(s1.rosters.at(-1).slice(0, 2), [nowHour - 61, nowHour], "the roster version is recorded for the processed range");
  assert.equal(s1.rosters.at(-1)[2], SIM.rosterVersion());
  assert.ok(s1.tick?.run && s1.tick.chunk === r1.chunks, "the state carries the checkpoint (run, chunk)");
  assert.ok(!("names" in f1.read(HEAD)), "names are not stored (the census has them)");
  assert.equal(f1.read("lease").until, 0, "the lease is released");
  assert.ok(f1.read("public").at && Object.keys(f1.read("public").bySubject).length, "public written (with bySubject for old clients)");
  const live = new Set(f1.read(HEAD).buckets);
  assert.equal([...f1.m.keys()].filter(k => k.startsWith("rel/b/") && !live.has(k)).length, 0, "superseded bucket blobs swept at the end of the run");
  assert.equal(f1.read("state").v, 1, "the one-blob rollback copy is rewritten");
  assert.equal(f1.read("state").hour, nowHour, "at the ledger's hour");
  assert.equal(JSON.stringify(SOC.fromV1(f1.read("state")).buckets.map(b => Object.keys(b.pairs).sort())), JSON.stringify(s1.buckets.map(b => Object.keys(b.pairs).sort())), "holding the same pairs");
  // the per-subject shards (/api/social/<slug>) hold exactly the public view's subjects
  const shardSubjects = {};
  for (let i = 0; i < SOC.SUBJECT_SHARDS; i++) for (const [k, v] of Object.entries(f1.read(subjectKey(i))?.subjects || {})) { assert.equal(SOC.subjectShard(k), i); shardSubjects[k] = v; }
  const pubS = f1.read("public").bySubject;
  assert.deepEqual(Object.keys(shardSubjects).sort(), Object.keys(pubS).sort(), "every subject in its shard");
  for (const [k, v] of Object.entries(pubS)) assert.deepEqual(v.relations, shardSubjects[k].relations.slice(0, 8), `${k}: shard == public`);

  // Budget of 0: one chunk per invocation, the run resumes from each checkpoint. Same city.
  SIM.clearSocialSnapshots();
  const f2 = fresh();
  let runs = 0;
  for (;;) { const r = await tick(nowMs, tickIo(() => f2, census), { budgetMs: 0 }); runs++; if (r.hour >= nowHour) break; assert.equal(r.chunks, 1); }
  assert.equal(runs, r1.chunks, "resumed once per chunk");
  assert.equal(strip(ledger(f2)), strip(s1), "checkpoint + resume gives the identical state");
  assert.equal(JSON.stringify({ ...f2.read("public"), at: 0 }), JSON.stringify({ ...f1.read("public"), at: 0 }), "and the identical public ledger");

  // checkpointMs: fewer checkpoints (the last chunk always lands), the same city.
  SIM.clearSocialSnapshots();
  const f2b = fresh();
  let fake = 0;
  const r2b = await tick(nowMs, tickIo(() => f2b, census), { checkpointMs: 5, clock: () => (fake += 1) });
  assert.ok(f2b.log.filter(k => k === HEAD).length < r2b.chunks, `checkpoints thinned (${f2b.log.filter(k => k === HEAD).length} for ${r2b.chunks} chunks)`);
  assert.equal(strip(ledger(f2b)), strip(s1), "and the same ledger");

  // A checkpoint writes only the buckets that changed: saving an unchanged ledger writes the header alone.
  {
    const f = fresh(), io = tickIo(() => f, census);
    const { state: st } = await io.load();
    let e = await io.save(st, null);
    const n0 = f.log.length;
    e = await io.save(st, e);
    assert.deepEqual(f.log.slice(n0), [HEAD], "an unchanged ledger rewrites no bucket");
    const pk = Object.keys(st.buckets[5].pairs)[0] || SOC.pairKey("zz-a", "zz-b");
    st.buckets[SOC.bucketOf(pk)].pairs[pk] = [1, 1, 1, null, 1];
    const n1 = f.log.length;
    await io.save(st, e);
    assert.equal(f.log.slice(n1).filter(k => k.startsWith("rel/b/")).length, 1, "one changed pair rewrites one bucket");
  }

  // Killed mid-run (the 4th checkpoint never lands): three chunks kept, the next run finishes it.
  SIM.clearSocialSnapshots();
  const f3 = fresh();
  const io3 = tickIo(() => f3, census);
  let saves = 0; const save = io3.save;
  io3.save = async (st, e) => { if (++saves === 4) throw new Error("killed"); return save(st, e); };
  await assert.rejects(tick(nowMs, io3), /killed/);
  assert.equal(ledger(f3).hour, (Math.floor((nowHour - 61) / CHUNK_HOURS) + 3) * CHUNK_HOURS, "a killed run loses at most the chunk in flight");
  assert.equal(f3.read("public"), null, "a killed run publishes nothing");
  assert.equal(f3.read("lease").until, 0, "and still releases its lease");
  await tick(nowMs, tickIo(() => f3, census));
  assert.equal(strip(ledger(f3)), strip(s1), "resuming after a kill gives the identical state");

  // Killed between its buckets and its header: the buckets are orphans the header never
  // names; the next run reads the last committed ledger, finishes it identically, sweeps them.
  SIM.clearSocialSnapshots();
  const f3b = fresh();
  const realSet = f3b.setJSON.bind(f3b);
  let heads = 0;
  f3b.setJSON = async (k, v, o) => { if (k === HEAD && ++heads === 3) throw new Error("killed before the header"); return realSet(k, v, o); };
  await assert.rejects(tick(nowMs, tickIo(() => f3b, census)), /killed before the header/);
  const orphans = [...f3b.m.keys()].filter(k => k.startsWith("rel/b/") && !new Set(f3b.read(HEAD).buckets).has(k));
  assert.ok(orphans.length > 0, `a torn checkpoint leaves orphan buckets (${orphans.length}), never a torn ledger`);
  f3b.setJSON = realSet;
  await tick(nowMs, tickIo(() => f3b, census));
  assert.equal(strip(ledger(f3b)), strip(s1), "the next run gives the identical state");
  assert.ok(orphans.every(k => !f3b.m.has(k)), "and sweeps the orphans");

  // A bucket the header names is unreadable: the run stops before writing anything.
  {
    const f = fakeStore();
    for (const [k, v] of f1.m) f.m.set(k, v);
    f.m.delete(f.read(HEAD).buckets[7]);
    const before = f.read(HEAD);
    await assert.rejects(tick(nowMs + 3600_000, tickIo(() => f, census)), /unreadable/);
    assert.deepEqual(f.read(HEAD), before, "a missing bucket writes nothing");
  }

  // Another worker holds the lease: nothing is read or written.
  const f4 = fresh();
  f4.m.set("lease", { v: JSON.stringify({ run: "other", until: Date.now() + 60_000 }), etag: '"L"' });
  const r4 = await tick(nowMs, tickIo(() => f4, census));
  assert.ok(r4.skipped, "a held lease skips the run");
  assert.equal(f4.read(HEAD), null, "ledger untouched under someone else's lease");
  assert.equal(f4.read("public"), null);
  // An expired lease is taken over.
  f4.m.set("lease", { v: JSON.stringify({ run: "other", until: Date.now() - 1 }), etag: '"L2"' });
  assert.equal((await tick(nowMs, tickIo(() => f4, census))).hour, nowHour, "an expired lease is taken over");

  // CAS: a stale worker (its lease lapsed, or the Mac's social-seed) committed a header after
  // this run read it. The next checkpoint is refused, the run stops, and the other write stands.
  const f5 = fakeStore();
  for (const [k, v] of f1.m) f5.m.set(k, v);
  const io5 = tickIo(() => f5, census);
  const load = io5.load;
  io5.load = async () => { const r = await load(); await f5.setJSON(HEAD, { ...f5.read(HEAD), marker: "newer" }); return r; };
  const pub5 = f5.read("public");
  await assert.rejects(tick(nowMs + 3600_000, io5), (e) => e instanceof TickConflict, "a moved ledger is a conflict");
  assert.equal(f5.read(HEAD).marker, "newer", "the newer ledger is never rolled back");
  assert.deepEqual(f5.read("public"), pub5, "and nothing is published from the stale run");
  // No header yet: the first write is create-only (two first runs can't both seed the city).
  const f6 = fakeStore();
  const io6 = tickIo(() => f6, census);
  io6.load = async () => { await f6.setJSON(HEAD, { marker: "first", buckets: [] }); return { state: null, etag: null }; };
  await assert.rejects(tick(nowMs, io6), TickConflict);
  assert.equal(f6.read(HEAD).marker, "first");

  // The chain: the hourly trigger calls the background worker with the shared secret; the
  // worker refuses anyone without it and otherwise runs the tick.
  assert.equal(tickSecret({}), null, "no secret configured -> none");
  const derived = tickSecret({ ANTHROPIC_API_KEY: "k" });
  assert.match(derived, /^[0-9a-f]{64}$/); assert.ok(!derived.includes("k") || derived !== "k", "derived, not the key itself");
  assert.equal(tickSecret({ HVI_TICK_SECRET: "s", ANTHROPIC_API_KEY: "k" }), "s", "HVI_TICK_SECRET wins");
  const env0 = { ...process.env };
  process.env.ANTHROPIC_API_KEY = "test-key"; delete process.env.HVI_TICK_SECRET;
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return new Response(null, { status: 202 }); };
  const quiet = [console.log, console.warn]; console.log = console.warn = () => {};
  try {
    const trigger = (await import("../netlify/functions/social-tick.js")).default;
    await trigger(new Request("https://x/.netlify/functions/social-tick", { method: "POST", body: "{}" }), { site: { url: "https://hvi.test" } });
    assert.equal(calls.length, 1); assert.equal(calls[0].url, "https://hvi.test/.netlify/functions/social-tick-background");
    const hdr = calls[0].init.headers[TICK_HEADER];
    assert.equal(hdr, tickSecret(), "the trigger sends the shared secret");
    const worker = (await import("../netlify/functions/social-tick-background.js")).default;
    const f7 = fakeStore();   // the worker runs at the real clock: start 10 machine hours behind it
    f7.m.set("state", { v: JSON.stringify({ ...seedV1, hour: Math.floor(SIM.machineClock(Date.now()).mt) - 10 }), etag: '"w0"' });
    await worker(new Request("https://hvi.test/.netlify/functions/social-tick-background", { method: "POST" }), {}, tickIo(() => f7, census));
    assert.equal(f7.read("public"), null, "no secret header: the worker does nothing");
    await worker(new Request("https://hvi.test/.netlify/functions/social-tick-background", { method: "POST", headers: { [TICK_HEADER]: "0".repeat(64) } }), {}, tickIo(() => f7, census));
    assert.equal(f7.read("public"), null, "wrong secret: nothing");
    assert.ok(!tickAuthorized(new Request("https://x", { headers: { [TICK_HEADER]: "short" } })));
    SIM.clearSocialSnapshots();
    await worker(new Request("https://hvi.test/.netlify/functions/social-tick-background", { method: "POST", headers: { [TICK_HEADER]: hdr } }), {}, tickIo(() => f7, census));
    assert.ok(f7.read("public")?.at, "trigger -> worker -> public ledger written");
    assert.ok(f7.read(HEAD).hour >= Math.floor(SIM.machineClock(Date.now()).mt) - 1 && f7.read(HEAD).tick?.run, "and the ledger checkpointed");
  } finally {
    globalThis.fetch = realFetch; [console.log, console.warn] = quiet;
    for (const k of ["ANTHROPIC_API_KEY", "HVI_TICK_SECRET"]) { if (k in env0) process.env[k] = env0[k]; else delete process.env[k]; }
  }
}

// ---- sharded == monolith ------------------------------------------------------------------------
// The tick reads presence per SECTOR from the published windows (plans.js format 2) and folds
// per pair bucket; the reference reads whereAt for every subject every hour from the one-file
// plan and folds in one pass. Same roster, same plans, several machine days, a census that
// also holds subjects the plans never saw: the same ledger, pair for pair and event for event.
let shardedDays = 0;
{
  const PL = await import("../netlify/lib/plans.js");
  const SPLIT = await import("../src/city/planSplit.js");
  const { synthRoster } = await import("./synth-roster.mjs");
  const big = synthRoster(700, { seed: 11 });
  const late = Array.from({ length: 12 }, (_, i) => ({ name: `Late Q${i}`, slug: `late-q${i}`, kind: "citizen", score: 480 + i * 20, tier: "TOLERATED GENERALIST", warmth: 45 + i * 3, competence: 60 - i * 2 }));
  const census = [...big, ...late];   // the late files were indexed after the plans were built
  const D0 = Math.floor(H0 / 24) + 1, DAYS = 3;
  SIM.clearPlans(); SIM.clearSocialSnapshots();
  const seedSt = SOC.advance(SOC.emptyState((D0 - 6) * 24), census, (D0 - 1) * 24);   // a ledger with history, snapshots through D0 + 3
  SIM.setSocialSnapshots(seedSt.snapshots); SIM.setRoster(big);
  const box = new Map(), days = {};
  const io = { putPart: async (k, v) => { box.set(k, JSON.parse(JSON.stringify(v))); } };
  const f1 = [];
  for (let d = D0; d < D0 + DAYS; d++) {
    const plan = JSON.parse(JSON.stringify(SIM.buildPlan(d))), ver = PL.versionOf(plan);
    f1.push([plan, ver]);
    days[d] = await PL.publishSplit(io, plan, ver, big, "check", Date.now, 150);   // small parts: windows in several files
  }
  box.set(PL.MANIFEST2, { format: 2, days });
  const fake = () => ({ get: async (k) => (box.has(k) ? JSON.parse(JSON.stringify(box.get(k))) : null) });
  PL.forgetManifest();
  const end = (D0 - 1 + DAYS) * 24;
  // whereAt at the half hour, every subject, every hour: the reference presence
  const whereAtPresence = (day, h0, h1, people, out) => {
    for (let h = h0; h < h1; h++) for (const x of people) {
      const w = SIM.whereAt(x, h + 0.5);
      if (!w || w.activity === "commute" || w.activity === "home" || !SOC.ENCOUNTER_BASE[SIM.PLACES[w.placeId]?.kind]) continue;
      const k = `${h}|${w.placeId}`; (out.get(k) || out.set(k, []).get(k)).push(SIM.keyOf(x));
    }
    return out;
  };
  const run = async (mode) => {
    SIM.clearPlans(); SIM.clearSocialSnapshots();
    const st = structuredClone(seedSt);
    if (mode !== "sectors") for (const [p, v] of f1) SIM.setPlan(p, v);
    if (mode === "whereAt") return SOC.advance(st, census, end, { presence: whereAtPresence });
    if (mode === "schedule") return SOC.advance(st, census, end);
    let files = 0;
    while (st.hour < end) {
      const day = Math.floor(st.hour / 24) + 1, w = Math.floor((st.hour % 24) / SIM.WINDOW_H);
      const win = await PL.loadWindows(day, w, fake);
      assert.ok(win && win.ver === days[day].ver, `window ${day}/${w} loaded`);
      files += win.files.length;
      SOC.advance(st, census, st.hour + SIM.WINDOW_H, { presence: SOC.sectorPresence(win) });
    }
    assert.ok(files > DAYS * 4 * SPLIT.SECTORS.length, `windows read in parts (${files} files)`);
    assert.equal(SIM.planOf(D0), null, "the sector source leaves no plan loaded behind");
    return st;
  };
  const mono = await run("whereAt"), sched = await run("schedule"), shard = await run("sectors");
  assert.ok(SOC.allPairs(mono).length > SOC.allPairs(seedSt).length * 0.5 && SOC.allEvents(mono).length > SOC.allEvents(seedSt).length, "the days made news");
  const lateMet = SOC.allPairs(mono).filter(([pk, r]) => pk.includes("late-q") && r[2] >= (D0 - 1) * 24).length;
  assert.ok(lateMet > 0, `subjects the plans never saw still meet people (${lateMet} pairs)`);
  assert.equal(JSON.stringify(sched), JSON.stringify(mono), "presence from segments == whereAt at every half hour");
  assert.equal(JSON.stringify(shard), JSON.stringify(mono), `sharded (sector windows, per-bucket fold) == monolith (whereAt, one fold) over ${DAYS} machine days`);
  shardedDays = DAYS;
  // Folding buckets in any order gives the same ledger (each meeting touches only its pair).
  SIM.clearPlans(); for (const [p, v] of f1) SIM.setPlan(p, v);
  const byKey = new Map(census.map(x => [SIM.keyOf(x), x]));
  const st1 = structuredClone(mono), st2 = structuredClone(mono);
  for (const x of census) st1.names[SIM.keyOf(x)] = st2.names[SIM.keyOf(x)] = "n";
  const met = SOC.meetingsOf(SOC.simPresence(D0 + 2, end - 24, end - 18, census), st1.seed);
  SOC.foldBuckets(st1, met, byKey);
  for (let b = SOC.BUCKETS - 1; b >= 0; b--) SOC.foldBucket(st2.buckets[b], met.filter(m => SOC.bucketOf(m[2]) === b), byKey, st2.names, st2.seed);
  assert.ok(met.length > 50, `${met.length} meetings`);
  assert.equal(JSON.stringify(st2), JSON.stringify(st1), "buckets folded in reverse order == in order");
  SIM.clearPlans(); SIM.clearSocialSnapshots();
}

console.log(`social ok: ${SOC.pairCount(state)} pairs, ${pub.counts.friends} friendships, ${pub.counts.rivals} rivalries; ` +
  `friend co-location ${withBias} vs ${without} without feedback; quest window covered ${covered}/14 days; sharded == monolith over ${shardedDays} days; ${ms} ms`);
