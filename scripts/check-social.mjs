// Emergent relationships (src/city/social.js): determinism, bounds, symmetry, the
// friend-feedback actually clustering people, narration never putting words in anyone's
// mouth, and the city's other promises (quest meetings, room capacity) still holding
// once friends start pulling each other around. No network. Run: node scripts/check-social.mjs
import assert from "node:assert/strict";

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
assert.ok(Object.keys(state.pairs).length <= SOC.MAX_PAIRS, "pair count bounded");
assert.ok(state.events.length <= SOC.MAX_EVENTS, "event log bounded");
assert.ok(Object.keys(one.snapshots).length <= SOC.KEEP_SNAPSHOTS, "snapshots bounded (default keep)");
assert.ok(JSON.stringify(one).length < 2_000_000, "state stays small enough for one blob");
for (const [pk, rec] of Object.entries(state.pairs)) {
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
const friends = Object.entries(state.pairs).filter(([, r]) => r[0] >= SOC.T.friends).map(([pk]) => pk.split("|"));
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
for (const e of state.events) assert.ok(!SPEECH.test(e.text), `event narrates speech: ${e.text}`);

// ---- gossip does not repeat itself -----------------------------------------------------------
// One pair meets once an hour at most, and "again" about the same pair is news once in
// three machine days, not every hour it happens (the feed read as a loop: 2026-09-29).
{
  const seen = new Map(), kinds = {};
  for (const e of state.events) {
    kinds[e.kind] = (kinds[e.kind] || 0) + 1;
    const k = `${e.a}|${e.b}`, prev = seen.get(k);
    if (e.kind === "again" && prev != null) assert.ok(e.h - prev >= 72, `${k}: "again" ${e.h - prev} machine hours after their last event`);
    assert.ok(prev == null || e.h > prev, `${k}: two events in machine hour ${e.h}`);
    seen.set(k, e.h);
  }
  for (const e of state.events) if (e.kind === "again" && SIM.PLACES[e.placeId]?.kind === "work") assert.ok(!/SHARED A TABLE/.test(e.text), `work room narrated as a table: ${e.text}`);
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
  const gone = [...new Set(state.events.flatMap(e => [e.a, e.b]))].find(k => k.startsWith("citizen-q"))
    || Object.keys(state.pairs).flatMap(pk => pk.split("|")).find(k => k.startsWith("citizen-q"));
  assert.ok(gone, "a test citizen made at least one relationship to withdraw");
  const st = structuredClone(state);
  SOC.advance(st, roster.filter(s => SIM.keyOf(s) !== gone), st.hour + 48);
  const blob = JSON.stringify(st);
  assert.ok(!blob.includes(`"${gone}"`) && !blob.includes(`${gone}|`) && !blob.includes(`|${gone}"`), `${gone}: withdrawn subject gone from the stored state`);
  const p2 = SOC.publish(st, st.hour);
  assert.ok(!JSON.stringify(p2).includes(gone), `${gone}: withdrawn subject gone from the published ledger`);
  assert.ok(Object.keys(st.pairs).length > 0, "everyone else keeps their relationships");

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
  assert.equal(Object.keys(st.pairs).length, 0, "no tie until both are on file");
  SOC.seedTies(st, new Set(["samuel-beckett", "andre-the-giant"]));
  const pk = SOC.pairKey("samuel-beckett", "andre-the-giant");
  assert.equal(st.pairs[pk][0], 45); assert.equal(st.events.length, 1);
  assert.match(st.events[0].text, /CRICKET/);
  st.pairs[pk][0] = -20;   // the sim moved them; a later tick must not reset it
  SOC.seedTies(st, new Set(["samuel-beckett", "andre-the-giant"]));
  assert.equal(st.pairs[pk][0], -20); assert.equal(st.events.length, 1);
}

// ---- chunking stays exact past the pair cap ----------------------------------------------------
// The cap is enforced at day boundaries, so where a call ends (the tick's wall-clock budget)
// never changes the city, even once pruning bites (production sits at the cap).
{
  const cap = { maxPairs: 150 };
  SIM.clearSocialSnapshots();
  const a = SOC.advance(SOC.emptyState(START), roster, START + 24 * 6, cap);
  SIM.clearSocialSnapshots();
  const b = SOC.emptyState(START);
  for (let h = START; h < START + 24 * 6; h += 5) SOC.advance(b, roster, Math.min(h + 5, START + 24 * 6), cap);
  assert.equal(Object.keys(a.pairs).length, 150, "the cap bit (the run ends on a day boundary)");
  assert.equal(JSON.stringify(a), JSON.stringify(b), "same state in one run or in 5-hour chunks with the pair cap biting");
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

// ---- the tick: checkpoints, resume, lease, conditional writes ---------------------------------
{
  const { tick, CHUNK_HOURS, TickConflict } = await import("../netlify/lib/social-tick.js");
  const { tickIo, tickSecret, tickAuthorized, TICK_HEADER } = await import("../netlify/lib/social-store.js");
  // An in-memory Blobs store with etags and conditional writes (the parts tickIo uses).
  function fakeStore() {
    const m = new Map(); let n = 0; const log = [];
    return {
      m, log,
      async getWithMetadata(k) { return m.has(k) ? { data: JSON.parse(m.get(k).v), etag: m.get(k).etag, metadata: {} } : null; },
      async getMetadata(k) { return m.has(k) ? { etag: m.get(k).etag, metadata: {} } : null; },
      async setJSON(k, v, o = {}) {
        if (o.onlyIfNew && m.has(k)) return { modified: false };
        if (o.onlyIfMatch && (!m.has(k) || m.get(k).etag !== o.onlyIfMatch)) return { modified: false };
        const etag = `"e${++n}"`; m.set(k, { v: JSON.stringify(v), etag }); log.push(k); return { modified: true, etag };
      },
      read(k) { return m.has(k) ? JSON.parse(m.get(k).v) : null; },
    };
  }
  const census = async () => roster.filter(s => s.kind === "citizen");
  const nowMs = T0 + 3 * 60 * 60 * 1000;
  const nowHour = Math.floor(SIM.machineClock(nowMs).mt);
  const seedState = structuredClone(state);
  seedState.hour = nowHour - 61;   // an hour and a bit behind: ~11 chunks
  const strip = (st) => { const { tick: _t, ...rest } = st; return JSON.stringify(rest); };
  const fresh = () => { const f = fakeStore(); f.m.set("state", { v: JSON.stringify(seedState), etag: '"e0"' }); return f; };

  // One uninterrupted run.
  SIM.clearSocialSnapshots();
  const f1 = fresh();
  const r1 = await tick(nowMs, tickIo(() => f1, census));
  assert.equal(r1.hour, nowHour, "the run reaches the current machine hour");
  assert.ok(r1.chunks >= 10 && r1.chunks <= 12, `~${CHUNK_HOURS}h chunks (${r1.chunks})`);
  assert.equal(f1.log.filter(k => k === "state").length, r1.chunks, "one checkpoint per chunk");
  const s1 = f1.read("state");
  assert.deepEqual(s1.rosters.at(-1).slice(0, 2), [nowHour - 61, nowHour], "the roster version is recorded for the processed range");
  assert.equal(s1.rosters.at(-1)[2], SIM.rosterVersion());
  assert.ok(s1.tick?.run && s1.tick.chunk === r1.chunks, "the state carries the checkpoint (run, chunk)");
  assert.equal(f1.read("lease").until, 0, "the lease is released");
  assert.ok(f1.read("public").at && Object.keys(f1.read("public").bySubject).length, "public written");

  // Budget of 0: one chunk per invocation, the run resumes from each checkpoint. Same city.
  SIM.clearSocialSnapshots();
  const f2 = fresh();
  let runs = 0;
  for (;;) { const r = await tick(nowMs, tickIo(() => f2, census), { budgetMs: 0 }); runs++; if (r.hour >= nowHour) break; assert.equal(r.chunks, 1); }
  assert.equal(runs, r1.chunks, "resumed once per chunk");
  assert.equal(strip(f2.read("state")), strip(s1), "checkpoint + resume gives the identical state");
  assert.equal(JSON.stringify({ ...f2.read("public"), at: 0 }), JSON.stringify({ ...f1.read("public"), at: 0 }), "and the identical public ledger");

  // Killed mid-run (the 4th checkpoint never lands): three chunks kept, the next run finishes it.
  SIM.clearSocialSnapshots();
  const f3 = fresh();
  const io3 = tickIo(() => f3, census);
  let saves = 0; const save = io3.save;
  io3.save = async (st, e) => { if (++saves === 4) throw new Error("killed"); return save(st, e); };
  await assert.rejects(tick(nowMs, io3), /killed/);
  assert.equal(f3.read("state").hour, (Math.floor((nowHour - 61) / CHUNK_HOURS) + 3) * CHUNK_HOURS, "a killed run loses at most the chunk in flight");
  assert.equal(f3.read("public"), null, "a killed run publishes nothing");
  assert.equal(f3.read("lease").until, 0, "and still releases its lease");
  await tick(nowMs, tickIo(() => f3, census));
  assert.equal(strip(f3.read("state")), strip(s1), "resuming after a kill gives the identical state");

  // Another worker holds the lease: nothing is read or written.
  const f4 = fresh();
  f4.m.set("lease", { v: JSON.stringify({ run: "other", until: Date.now() + 60_000 }), etag: '"L"' });
  const r4 = await tick(nowMs, tickIo(() => f4, census));
  assert.ok(r4.skipped, "a held lease skips the run");
  assert.equal(f4.read("state").hour, seedState.hour, "state untouched under someone else's lease");
  assert.equal(f4.read("public"), null);
  // An expired lease is taken over.
  f4.m.set("lease", { v: JSON.stringify({ run: "other", until: Date.now() - 1 }), etag: '"L2"' });
  assert.equal((await tick(nowMs, tickIo(() => f4, census))).hour, nowHour, "an expired lease is taken over");

  // CAS: a stale worker (its lease lapsed, or the Mac's social-seed) wrote the state after this
  // run read it. The next checkpoint is refused, the run stops, and the other write stands.
  const f5 = fresh();
  const io5 = tickIo(() => f5, census);
  const load = io5.load;
  io5.load = async () => { const r = await load(); await f5.setJSON("state", { ...seedState, hour: seedState.hour + 500, marker: "newer" }); return r; };
  await assert.rejects(tick(nowMs, io5), (e) => e instanceof TickConflict, "a moved ledger is a conflict");
  assert.equal(f5.read("state").marker, "newer", "the newer ledger is never rolled back");
  assert.equal(f5.read("public"), null, "and nothing is published from the stale run");
  // No state yet: the first write is create-only (two first runs can't both seed the city).
  const f6 = fakeStore();
  const io6 = tickIo(() => f6, census);
  io6.load = async () => { await f6.setJSON("state", { ...seedState, marker: "first" }); return { state: null, etag: null }; };
  await assert.rejects(tick(nowMs, io6), TickConflict);
  assert.equal(f6.read("state").marker, "first");

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
    f7.m.set("state", { v: JSON.stringify({ ...seedState, hour: Math.floor(SIM.machineClock(Date.now()).mt) - 10 }), etag: '"w0"' });
    await worker(new Request("https://hvi.test/.netlify/functions/social-tick-background", { method: "POST" }), {}, tickIo(() => f7, census));
    assert.equal(f7.read("public"), null, "no secret header: the worker does nothing");
    await worker(new Request("https://hvi.test/.netlify/functions/social-tick-background", { method: "POST", headers: { [TICK_HEADER]: "0".repeat(64) } }), {}, tickIo(() => f7, census));
    assert.equal(f7.read("public"), null, "wrong secret: nothing");
    assert.ok(!tickAuthorized(new Request("https://x", { headers: { [TICK_HEADER]: "short" } })));
    SIM.clearSocialSnapshots();
    await worker(new Request("https://hvi.test/.netlify/functions/social-tick-background", { method: "POST", headers: { [TICK_HEADER]: hdr } }), {}, tickIo(() => f7, census));
    assert.ok(f7.read("public")?.at, "trigger -> worker -> public ledger written");
    assert.ok(f7.read("state").hour >= Math.floor(SIM.machineClock(Date.now()).mt) - 1 && f7.read("state").tick?.run, "and the state checkpointed");
  } finally {
    globalThis.fetch = realFetch; [console.log, console.warn] = quiet;
    for (const k of ["ANTHROPIC_API_KEY", "HVI_TICK_SECRET"]) { if (k in env0) process.env[k] = env0[k]; else delete process.env[k]; }
  }
}

console.log(`social ok: ${Object.keys(state.pairs).length} pairs, ${pub.counts.friends} friendships, ${pub.counts.rivals} rivalries; ` +
  `friend co-location ${withBias} vs ${without} without feedback; quest window covered ${covered}/14 days; ${ms} ms`);
