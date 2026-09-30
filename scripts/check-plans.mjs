// Published plans (sim.js setPlan/buildPlan, netlify/lib/plans.js, /api/plan): a plan is
// the day the sim builds, so the city read from it must be the city the sim draws, subject
// for subject, every 15 machine minutes; the builder publishes every day (never skipping
// one, manifest last, idempotent, one builder at a time); the quest checks and the social
// tick read the same pinned plans the browsers do. No network. Run: node scripts/check-plans.mjs
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

globalThis.__blobs = new Map();
globalThis.__race = null;
globalThis.__fail = null;
const blobsSrc = `
let n = 0;
export function getStore({ name }) {
  const m = globalThis.__blobs;
  if (!m.has(name)) m.set(name, new Map());
  const s = m.get(name);
  const fail = (op, k) => { if (globalThis.__fail && globalThis.__fail(name, op, k)) throw new Error("blobs down: " + name + "/" + k); };
  const read = (k, o) => (s.has(k) ? (o?.type === "text" ? JSON.stringify(s.get(k).data) : JSON.parse(JSON.stringify(s.get(k).data))) : null);
  return {
    async get(k, o) { fail("get", k); return read(k, o); },
    async getWithMetadata(k, o) { fail("get", k); return s.has(k) ? { data: read(k, o), etag: s.get(k).etag, metadata: {} } : null; },
    async getMetadata(k) { return s.has(k) ? { etag: s.get(k).etag, metadata: {} } : null; },
    async setJSON(k, v, o = {}) {
      fail("set", k);
      if (globalThis.__race) await globalThis.__race(name, k);
      if (o.onlyIfNew && s.has(k)) return { modified: false };
      if (o.onlyIfMatch && (!s.has(k) || s.get(k).etag !== o.onlyIfMatch)) return { modified: false };
      const etag = "e" + ++n; s.set(k, { data: JSON.parse(JSON.stringify(v)), etag }); return { modified: true, etag };
    },
    async delete(k) { s.delete(k); },
    async list({ prefix = "" } = {}) { return { blobs: [...s.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; },
  };
}`;
registerHooks({ resolve(spec, ctx, next) { return spec === "@netlify/blobs" ? { url: "data:text/javascript," + encodeURIComponent(blobsSrc), shortCircuit: true } : next(spec, ctx); } });
const __err = console.error; console.error = (...a) => { if (process.env.DEBUG_CHECK) __err(...a); };

const SIM = await import("../src/city/sim.js");
const PL = await import("../netlify/lib/plans.js");
const { synthRoster, onFile } = await import("./synth-roster.mjs");
const { QUESTS, locate, meetingAt, contactAt } = await import("../src/quests.js");
const { BUILDINGS } = await import("../src/city/simApi.js");

let checks = 0;
const ok = (c, m) => { checks++; assert.ok(c, m); };
const D = 243;                                   // any machine day; D and D + 1 are planned
const T0 = SIM.CITY_EPOCH + (D - 1) * 24 * 60 * 60 * 1000 / SIM.DEFAULT_SCALE;   // real ms at the start of day D
const STEPS = Array.from({ length: 2 * 24 * 4 }, (_, i) => (D - 1) * 24 + i / 4);   // every 15 machine minutes, 2 days

// Social snapshots the way the tick publishes them: {day: {ver, boosts: {key: {place: frac}}}}.
function snapshotsFor(roster, days) {
  const leisure = Object.keys(SIM.PLACES).filter(id => SIM.PLACES[id].kind === "leisure" || SIM.PLACES[id].kind === "mixed");
  const out = {};
  for (const day of days) {
    const boosts = {};
    roster.forEach((s, i) => { if (i % 3 === day % 3) boosts[SIM.keyOf(s)] = { [leisure[(i * 7 + day) % leisure.length]]: 0.8, [leisure[(i * 3) % leisure.length]]: -0.4 }; });
    out[day] = { ver: `${day}:check`, boosts };
  }
  return out;
}
const roundTrip = (x) => JSON.parse(JSON.stringify(x));
const where = (roster) => roster.map(s => STEPS.map(T => JSON.stringify(SIM.whereAt(s, T))));

// ---- 1. the plan is the sim ------------------------------------------------------------------
// Production-shaped (the live mix: ~430, no stratum or tendencies) and a larger synthetic
// roster that also carries stratum and tendencies; both with friend snapshots on.
for (const [label, roster] of [["production-shaped 430", synthRoster(430)], ["synthetic rich 1500", synthRoster(1500, { seed: 9, rich: true })]]) {
  SIM.clearPlans(); SIM.clearSocialSnapshots();
  SIM.setSocialSnapshots(snapshotsFor(roster, [D - 1, D, D + 1]));
  SIM.setRoster(roster);
  const plans = [D, D + 1].map(d => roundTrip(SIM.buildPlan(d)));   // what /api/plan serves
  ok(plans[0].n === roster.length && Object.keys(plans[0].subjects).length === roster.length, `${label}: every subject is in the plan`);
  ok(plans[0].social[D] === `${D}:check` && plans[0].social[D - 1] === `${D - 1}:check`, `${label}: the plan names the snapshots it was built with`);
  const sim = where(roster);
  const occSim = STEPS.filter((_, i) => i % 8 === 0).map(T => JSON.stringify(SIM.occupancy(roster, T)));
  plans.forEach(p => ok(SIM.setPlan(p, PL.versionOf(p)), `${label}: plan ${p.day} loads`));
  const t = performance.now();
  const viaPlan = where(roster);
  const ms = performance.now() - t;
  let diffs = 0, first = null;
  roster.forEach((s, i) => STEPS.forEach((T, k) => { if (viaPlan[i][k] !== sim[i][k]) { diffs++; first ||= `${s.slug} @${T}\n sim  ${sim[i][k]}\n plan ${viaPlan[i][k]}`; } }));
  assert.equal(diffs, 0, `${label}: whereAt from the plan differs from the sim ${diffs} times; first:\n${first}`);
  checks++;
  const occPlan = STEPS.filter((_, i) => i % 8 === 0).map(T => JSON.stringify(SIM.occupancy(roster, T)));
  assert.deepEqual(occPlan, occSim, `${label}: occupancy from the plan equals the sim`); checks++;
  console.log(`  ${label}: ${roster.length * STEPS.length} whereAt samples identical (plan reads ${ms.toFixed(0)} ms), plan ${(JSON.stringify(plans[0]).length / 1024).toFixed(0)} KB`);
}

// ---- 2. subjects the plan does not hold ---------------------------------------------------------
{
  const roster = synthRoster(300);
  SIM.clearPlans(); SIM.clearSocialSnapshots(); SIM.setRoster(roster);
  const p = roundTrip(SIM.buildPlan(D));
  const before = roster.map(s => STEPS.slice(0, 96).map(T => JSON.stringify(SIM.whereAt(s, T))));
  SIM.setPlan(p, PL.versionOf(p));
  // A referral indexed after the plan was built: placed by the sim, without the capacity
  // allocation (it was never in the claim order), and nobody in the plan moves for it.
  const late = { slug: "late-referral", name: "Late Referral", tier: "TOLERATED GENERALIST", score: 500, kind: "figure", referred: true, warmth: 60, competence: 60 };
  SIM.setRoster([...roster, late]);
  const after = roster.map(s => STEPS.slice(0, 96).map(T => JSON.stringify(SIM.whereAt(s, T))));
  assert.deepEqual(after, before, "a subject missing from the plan moves nobody who is in it"); checks++;
  const a = STEPS.slice(0, 96).map(T => JSON.stringify(SIM.whereAt(late, T)));
  SIM.clearRoster();
  const b = STEPS.slice(0, 96).map(T => JSON.stringify(SIM.whereAt(late, T)));
  assert.deepEqual(a, b, "the late subject is placed the same by every viewer, whatever roster they registered"); checks++;
  // A plan from another format or seed is never loaded.
  ok(!SIM.setPlan({ ...p, format: 99 }, "x") && !SIM.setPlan({ ...p, seed: "OTHER" }, "y") && !SIM.setPlan(null, "z"), "foreign plans are refused");
  ok(!SIM.setPlan(p, PL.versionOf(p)), "loading the same version again is a no-op");
  SIM.clearPlans();
}

// ---- 3. quests read the pinned plan -------------------------------------------------------------
// The server registers only the figures on file (quest.js) and loads the plans for every day
// the report's 90 s look-back touches (plans.js questDays); the browser registers the whole
// census. With the same plans loaded, every quest figure is in the same building, meetings
// convene at the same moments, and a report is judged the same, including right after midnight.
{
  const census = synthRoster(430).filter(s => s.engine || s.kind === "citizen");
  const full = [...onFile(), ...census];
  SIM.clearPlans(); SIM.clearSocialSnapshots();
  SIM.setSocialSnapshots(snapshotsFor(full, [D - 1, D, D + 1]));
  SIM.setRoster(full);
  const plans = [D, D + 1].map(d => roundTrip(SIM.buildPlan(d)));
  const load = (days) => { SIM.clearPlans(); for (const p of plans) if (days.includes(p.day)) SIM.setPlan(p, PL.versionOf(p)); };
  // Browser: whole census + both plans. Server: figures on file + the days questDays names.
  const times = Array.from({ length: 2 * 24 * 12 }, (_, i) => T0 + i * 5 * 1000);   // every 5 machine minutes
  const judge = (t) => QUESTS.map(q => {
    const at = q.kind === "witness" ? meetingAt(q, t) : locate(q, t);
    const b = at?.buildingId || BUILDINGS[0].id;
    return `${q.id}:${at?.buildingId || "-"}:${contactAt(q, b, t)}:${contactAt(q, "hq", t)}`;
  }).join(",");
  load([D, D + 1]); SIM.setRoster(full);
  const browser = times.map(judge);
  let crossing = 0;
  const server = times.map(t => {
    const days = PL.questDays(t);
    if (days.length > 1) crossing++;
    load(days); SIM.setRoster(onFile());
    return judge(t);
  });
  ok(crossing > 0, "some reports look back across midnight (both days are read)");
  const bad = times.filter((_, i) => browser[i] !== server[i]).length;
  assert.equal(bad, 0, `quest judgement differs between server and browser at ${bad} of ${times.length} moments`); checks++;
  // The plan-vs-quest-window check: a report at 00:30 looks back into yesterday; with only
  // today's plan the server would judge yesterday's minutes from the sim instead.
  const t = T0 + 24 * 60 * 1000 + 30 * 1000;   // day D + 1, 00:30
  assert.deepEqual(PL.questDays(t), [D, D + 1]); checks++;
  assert.deepEqual(PL.questDays(T0 + 24 * 60 * 1000 + 200 * 1000), [D + 1], "past the look-back only today is read"); checks++;
  // and every quest is still findable / convenes through the plan (the city's promise to quests)
  load([D, D + 1]); SIM.setRoster(full);
  for (const q of QUESTS.filter(q => q.kind === "find")) {
    let found = 0; for (let s = 0; s < 1440; s++) if (locate(q, T0 + s * 1000).buildingId) found++;
    ok(found / 1440 >= 0.2, `${q.id}: findable ${Math.round(found / 14.4)}% of the day through the plan`);
  }
  SIM.clearPlans();
}

// ---- 4. the social tick reads the same plans ---------------------------------------------------
// Advancing the ledger over planned days gives exactly the state the sim gives (same roster,
// same snapshots), and the state records which plan placed each day.
{
  const SOC = await import("../src/city/social.js");
  const { tick } = await import("../netlify/lib/social-tick.js");
  const roster = synthRoster(200, { seed: 3 });
  const census = roster.filter(s => s.engine || s.kind === "citizen");
  SIM.clearPlans(); SIM.clearSocialSnapshots();
  const start = (D - 12) * 24;
  const seed = SOC.advance(SOC.emptyState(start), roster, (D - 1) * 24);   // up to the start of day D: snapshots through D + 3
  ok(seed.snapshots[D] && seed.snapshots[D + 1], "the ledger has published D and D + 1");
  SIM.setSocialSnapshots(seed.snapshots); SIM.setRoster(roster);
  const plans = [D, D + 1].map(d => roundTrip(SIM.buildPlan(d)));
  SIM.clearSocialSnapshots();
  const nowMs = T0 + 47 * 60 * 1000;   // machine hour 47 of the two days
  const run = async (withPlans) => {
    SIM.clearPlans(); SIM.clearSocialSnapshots();
    const box = { state: structuredClone(seed), pub: null };
    const io = { getState: async () => structuredClone(box.state), putState: async v => { box.state = v; }, putPublic: async v => { box.pub = v; }, census: async () => census };
    if (withPlans) io.plans = async (days) => { const out = {}; for (const p of plans) if (days.includes(p.day)) { SIM.setPlan(p, PL.versionOf(p)); out[p.day] = PL.versionOf(p); } return out; };
    const r = await tick(nowMs, io);
    return { r, state: box.state };
  };
  const a = await run(false), b = await run(true);
  ok(b.r.plans === 2 && a.r.plans === 0, `the tick loaded the plans for its days (${b.r.plans})`);
  ok(b.state.plans[D] === PL.versionOf(plans[0]) && a.state.plans[D] === "sim", "the ledger records which plan placed each day");
  const strip = ({ tick: _t, plans: _p, ...rest }) => JSON.stringify(rest);
  assert.equal(strip(b.state), strip(a.state), "the ledger advanced over the plans equals the ledger advanced by the sim"); checks++;
  SIM.clearPlans();
}

// ---- 5. the builder ------------------------------------------------------------------------------
{
  const { getStore } = await import("@netlify/blobs");
  const store = () => getStore({ name: PL.STORE });
  const reset = () => { globalThis.__blobs = new Map(); globalThis.__race = null; globalThis.__fail = null; };
  const roster = onFile();
  let snaps = {};
  const io = () => PL.planIo(store, { census: async () => roster.slice(10), snapshots: async () => snaps });
  const raw = (k) => globalThis.__blobs.get(PL.STORE)?.get(k)?.data ?? null;
  const man = () => raw(PL.MANIFEST);
  const ms = (day, hour = 0) => SIM.CITY_EPOCH + ((day - 1) * 24 + hour) * 60 * 60 * 1000 / SIM.DEFAULT_SCALE;
  const C = D;

  // First run: today - 1 through today + 3, oldest first; manifest lists each with its blob.
  reset(); snaps = snapshotsFor(roster, [C - 1, C, C + 1, C + 2, C + 3]);
  const r1 = await PL.buildPlans(ms(C, 5), io());
  assert.deepEqual(r1.built.map(b => b.day), [C - 1, C, C + 1, C + 2, C + 3], "backfill: yesterday, today and three ahead"); checks++;
  for (const [d, e] of Object.entries(man().days)) {
    ok(raw(e.key)?.day === Number(d) && e.ver === PL.versionOf(raw(e.key)), `day ${d}: the manifest points at its complete blob`);
    ok(e.social[d] === snaps[d].ver, `day ${d}: built with its published snapshot`);
  }
  // Idempotent: nothing to do on the next run of the same day.
  const r2 = await PL.buildPlans(ms(C, 12), io());
  ok(r2.built.length === 0 && r2.latest === C + 3, "a second run the same day builds nothing");
  // Beyond tomorrow, a day waits for its snapshot; today and tomorrow never wait.
  reset(); snaps = snapshotsFor(roster, [C - 1, C]);
  const r3 = await PL.buildPlans(ms(C, 5), io());
  ok(r3.built.map(b => b.day).join() === [C - 1, C, C + 1].join() && r3.waiting === C + 2, `days past tomorrow wait for their snapshot (built ${r3.built.map(b => b.day)}, waiting ${r3.waiting})`);
  ok(man().days[C + 1].social[C + 1] === "-", "tomorrow built without a snapshot says so");
  // Manifest written last: a failed manifest write leaves the day unlisted (never a listed
  // day without its blob); the next run lists it, from the same blob.
  reset(); snaps = snapshotsFor(roster, [C - 1, C, C + 1, C + 2, C + 3]);
  globalThis.__fail = (name, op, k) => name === PL.STORE && op === "set" && k === PL.MANIFEST;
  await assert.rejects(PL.buildPlans(ms(C, 5), io())); checks++;
  ok(!man() && [...globalThis.__blobs.get(PL.STORE).keys()].some(k => k.includes(`/day/${C - 1}/`)), "the blob landed, the manifest did not list it");
  globalThis.__fail = null;
  const r4 = await PL.buildPlans(ms(C, 5), io());
  ok(r4.built.length === 5 && Object.keys(man().days).length === 5, "the next run publishes every day");
  // A concurrent builder moved the manifest between our read and our write: re-read, keep theirs.
  reset();
  let raced = false;
  globalThis.__race = async (name, k) => {
    if (raced || name !== PL.STORE || k !== PL.MANIFEST) return;
    raced = true; globalThis.__race = null;
    const other = PL.planIo(store, { census: async () => roster.slice(10), snapshots: async () => snaps });
    delete other.lease;   // it slipped in while our lease was held: the etag is the last line of defence
    await PL.buildPlans(ms(C, 5), other, { lookahead: 0, run: "other" });
    globalThis.__race = async () => {};   // re-armed but inert
  };
  const r5 = await PL.buildPlans(ms(C, 5), io(), { run: "me" });
  globalThis.__race = null;
  ok(raced && Object.keys(man().days).length === 5, "a raced manifest write is retried over the other builder's days");
  ok(r5.built.every(b => man().days[b.day].run === "me") && man().days[C - 1].run === "other", "days the other builder published stand");
  // One builder at a time.
  reset();
  await store().setJSON("lease", { run: "someone", until: Date.now() + 60_000 });
  ok((await PL.buildPlans(ms(C, 5), io())).skipped, "a held lease skips the run");
  // The budget: one day per run once it is spent; each day is published as it finishes.
  reset();
  let runs = 0;
  for (;;) { const r = await PL.buildPlans(ms(C, 5), io(), { budgetMs: 0 }); runs++; if (!r.built.length) break; assert.equal(r.built.length, 1); }
  ok(runs === 6 && Object.keys(man().days).length === 5, `a spent budget still publishes one day per run (${runs - 1} runs)`);
  // A failed census builds nothing.
  reset();
  await assert.rejects(PL.buildPlans(ms(C, 5), PL.planIo(store, { census: async () => { throw new Error("census down"); }, snapshots: async () => snaps }))); checks++;
  ok(!man(), "a failed census read publishes nothing");

  // Never skip a day: runs every 10 real minutes (and, separately, only every 60) over 12
  // real hours, snapshots published hourly LAG = 4 days ahead the way the tick does. Every
  // machine day from the first run on gets a plan before it starts, and old days retire.
  for (const every of [10, 60]) {
    reset();
    const seen = new Set();
    let late = 0;
    const startMs = ms(C, 3);
    for (let m = 0; m <= 12 * 60; m += every) {
      const now = startMs + m * 60 * 1000;
      const tickMs = startMs + Math.floor(m / 60) * 60 * 60 * 1000;   // the hourly tick's last run
      const done = SIM.machineClock(tickMs).day - 1;                    // last completed day
      snaps = snapshotsFor(roster, Array.from({ length: 6 }, (_, i) => done + 4 - 5 + i));
      await PL.buildPlans(now, io());
      const today = SIM.machineClock(now).day;
      for (const d of Object.keys(man().days)) seen.add(Number(d));
      if (!man().days[today]) late++;
      ok(Math.min(...Object.keys(man().days).map(Number)) >= today - PL.KEEP_BEHIND, `every ${every} min: old days retire (today ${today}, days ${Object.keys(man().days)}, m ${m})`);
    }
    const lo = Math.min(...seen), hi = Math.max(...seen);
    const gaps = []; for (let d = lo; d <= hi; d++) if (!seen.has(d)) gaps.push(d);
    assert.deepEqual(gaps, [], `every ${every} min: days skipped`); checks++;
    ok(late === 0, `every ${every} min: today always has a plan (${late} misses)`);
    ok(hi >= SIM.machineClock(startMs + 12 * 60 * 60 * 1000).day + 1, `every ${every} min: built ahead of the clock`);
    const blobs = [...globalThis.__blobs.get(PL.STORE).keys()].filter(k => k.includes("/day/"));
    ok(blobs.length === Object.keys(man().days).length, `every ${every} min: retired days' blobs are deleted (${blobs.length} kept)`);
    console.log(`  cadence ${every} min: days ${lo}..${hi} all built, none late`);
  }

  // /api/plan serves the manifest (versions only) and each plan, immutable.
  const fn = (await import("../netlify/functions/plan.js")).default;
  const m = await (await fn(new Request("https://x/api/plan"))).json();
  const [day, ver] = Object.entries(m.days).at(-1);
  ok(m.format === 1 && m.latest === Number(day) && typeof ver === "string", "the manifest lists days and versions");
  const res = await fn(new Request(`https://x/api/plan/${day}/${ver}`));
  ok(res.status === 200 && /immutable/.test(res.headers.get("cache-control")), "a plan is served immutable");
  const body = await res.json();
  ok(PL.versionOf(body) === ver && SIM.setPlan(body, ver), "the served plan is the published version and loads");
  for (const bad of [`/api/plan/${day}/nope`, `/api/plan/${Number(day) + 1}/${ver}`, `/api/plan/${day}`, "/api/plan/../x/y"]) ok((await fn(new Request("https://x" + bad))).status === 404, `${bad}: 404`);
  // loadPlans (quests, the tick) pins what the manifest lists.
  SIM.clearPlans(); PL.forgetManifest();
  const got = await PL.loadPlans([Number(day)], store);
  ok(got[day] === ver && SIM.planOf(Number(day))?.ver === ver, "loadPlans loads the manifest's version");
  SIM.clearPlans();
}
console.log(`check-plans: ${checks} checks passed`);
