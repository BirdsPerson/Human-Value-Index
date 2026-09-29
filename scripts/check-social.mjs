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

console.log(`social ok: ${Object.keys(state.pairs).length} pairs, ${pub.counts.friends} friendships, ${pub.counts.rivals} rivalries; ` +
  `friend co-location ${withBias} vs ${without} without feedback; quest window covered ${covered}/14 days; ${ms} ms`);
