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
  ok(b.r.sources.plan > 0 && b.r.sources.sim === 0 && a.r.sources.plan === 0, `the tick read the plans for its days (${JSON.stringify(b.r.sources)})`);
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
    const blobs = [...globalThis.__blobs.get(PL.STORE).keys()].filter(k => k.startsWith("f1/day/"));
    ok(blobs.length === Object.keys(man().days).length, `every ${every} min: retired days' blobs are deleted (${blobs.length} kept)`);
    const m2 = raw(PL.MANIFEST2);
    const groups = new Set([...globalThis.__blobs.get(PL.STORE).keys()].filter(k => k.startsWith("f2/day/")).map(k => k.split("/").slice(2, 4).join("/")));
    ok(m2 && Object.keys(m2.days).length === Object.keys(man().days).length && groups.size === Object.keys(m2.days).length, `every ${every} min: every planned day is split, retired splits deleted (${groups.size} kept)`);
    ok(Object.entries(m2.days).every(([d, e]) => e.ver === man().days[d].ver), `every ${every} min: a day's split carries its plan's version`);
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
  // loadOnFile (quests, scaling step 6): the figures on file's rows from the day's summary put
  // every quest figure exactly where the one-file plan does; a day not split reads the plan.
  const dayN = Number(day), qt = Array.from({ length: 24 * 12 }, (_, i) => (dayN - 1) * 24 + i / 12);
  const figs = [...new Set(QUESTS.flatMap(q => [q.figure, q.with]).filter(Boolean))];
  const fig = new Map(onFile().map(x => [SIM.keyOf(x), x]));
  ok(figs.every(k => fig.has(k)), "every quest figure (and partner) is on file");
  SIM.setRoster(onFile());
  const at = () => figs.map(k => qt.map(t => JSON.stringify(SIM.whereAt(fig.get(k), t))).join()).join();
  const viaPlan = at();
  SIM.clearPlans(); PL.forgetManifest();
  const got2 = await PL.loadOnFile([dayN], store);
  ok(got2[day] === ver && SIM.planOf(dayN)?.onFile && !SIM.planOf(dayN)?.full, "loadOnFile loads the day's on-file rows, not the plan");
  ok(at() === viaPlan, "quest figures from the summary == from the one-file plan, every 5 machine minutes");
  const m2 = raw(PL.MANIFEST2);
  const unsplit = Object.keys(man().days).map(Number).find(d => !m2?.days?.[d]);
  if (unsplit) { SIM.clearPlans(); const g3 = await PL.loadOnFile([unsplit], store); ok(SIM.planOf(unsplit)?.full && g3[unsplit], "a day not split: the one-file plan"); }
  SIM.clearPlans(); SIM.clearRoster();
}
// ---- 7. the sector split (scaling step 4: planSplit.js, planClient.js, crowd.js) -------------------
// The split IS the plan: every (sector, window) file reassembles to the whole day; one file
// alone places everyone in it exactly as the whole plan does for its six hours; a subject's
// segments are in every sector they touch; the summary is the plan's own occupancy; the crowd
// fills exactly what the browser does not hold; the find index points into the right files.
{
  const SPLIT = await import("../src/city/planSplit.js");
  const CROWD = await import("../src/city/crowd.js");
  const { roomIn, atDistrict } = await import("../src/city/simApi.js");
  for (const [label, roster] of [["production-shaped 430", synthRoster(430)], ["synthetic rich 1500", synthRoster(1500, { seed: 9, rich: true })]]) {
    SIM.clearPlans(); SIM.clearSocialSnapshots();
    SIM.setSocialSnapshots(snapshotsFor(roster, [D - 1, D, D + 1]));
    SIM.setRoster(roster);
    const people = new Map(roster.map(x => [SIM.keyOf(x), x]));
    const plan = roundTrip(SIM.buildPlan(D)), ver = PL.versionOf(plan);
    SIM.clearPlans(); SIM.setPlan(plan, ver);
    const split = roundTrip(SPLIT.splitDay(plan, ver, people));
    const T = Array.from({ length: 24 * 4 }, (_, i) => (D - 1) * 24 + i / 4);
    const full = new Map(roster.map(x => [SIM.keyOf(x), T.map(t => JSON.stringify(SIM.whereAt(x, t)))]));
    const fullSegs = new Map(roster.map(x => [SIM.keyOf(x), SIM.schedule(x, D)]));
    // occupancy the way the city counts it, at every summary sample
    const samples = Array.from({ length: SPLIT.SAMPLES }, (_, k) => (D - 1) * 24 + k * SPLIT.STEP);
    const occ = samples.map(t => SIM.occupancy(roster, t));
    const held = samples.map(t => roster.map(x => ({ s: x, w: SIM.whereAt(x, t) })));
    const bld = samples.map((t, k) => { const b = {}; for (const { s: x, w } of held[k]) { const r = roomIn(w, x); if (r) b[r.buildingId] = (b[r.buildingId] || 0) + 1; } return b; });
    const dist = samples.map((t, k) => { const d = {}; for (const { w } of held[k]) if (w.sub !== "riding") d[atDistrict(w)] = (d[atDistrict(w)] || 0) + 1; return d; });

    // a. every file loaded: the whole day, identical
    SIM.clearPlans();
    for (const id of SPLIT.SECTORS) for (const f of split.windows[id]) SIM.addPlanRows(D, ver, f.places, Object.fromEntries(Object.entries(f.subjects).map(([k, v]) => [k, v[1]])));
    let diffs = 0, first = null, uncovered = 0;
    for (const x of roster) {
      const k = SIM.keyOf(x), want = full.get(k);
      T.forEach((t, i) => {
        if (!SIM.covers(x, t)) uncovered++;
        const got = JSON.stringify(SIM.whereAt(x, t));
        if (got !== want[i]) { diffs++; first ||= `${k} @${t}\n full  ${want[i]}\n split ${got}`; }
      });
    }
    assert.equal(uncovered, 0, `${label}: the windows reassembled cover every subject all day`); checks++;
    assert.equal(diffs, 0, `${label}: whereAt from the reassembled windows differs ${diffs} times; first:\n${first}`); checks++;

    // b. one file alone places everyone in it, for its whole window, as the whole plan does
    let alone = 0, aloneBad = null;
    for (const id of SPLIT.SECTORS) for (const f of split.windows[id]) {
      SIM.clearPlans();
      SIM.addPlanRows(D, ver, f.places, Object.fromEntries(Object.entries(f.subjects).map(([k, v]) => [k, v[1]])));
      const lo = f.window * SIM.WINDOW_H * 4, hi = lo + SIM.WINDOW_H * 4;
      for (const k of Object.keys(f.subjects)) {
        const x = people.get(k), want = full.get(k);
        for (let i = lo; i < hi; i++) {
          alone++;
          if (!SIM.covers(x, T[i]) || JSON.stringify(SIM.whereAt(x, T[i])) !== want[i]) aloneBad ||= `${id}/${f.window} ${k} @${T[i]}`;
        }
      }
    }
    assert.equal(aloneBad, null, `${label}: a lone window places its subjects as the plan does (first miss ${aloneBad})`); checks++;

    // c. every segment is in every sector it touches, in each window it overlaps
    let missing = null, touched = 0;
    for (const [k, segs] of fullSegs) for (const g of segs) for (let w = 0; w < SIM.WINDOWS; w++) {
      if (!(g.from < (w + 1) * SIM.WINDOW_H && g.to > w * SIM.WINDOW_H)) continue;
      for (const d of SIM.segDistricts(g)) {
        touched++;
        const e = split.windows[d][w].subjects[k];
        if (!e) { missing ||= `${k} ${d}/${w} (not listed)`; continue; }
        SIM.clearPlans(); SIM.addPlanRows(D, ver, plan.places, { [k]: e[1] });
        const have = SIM.schedule(people.get(k), D);
        if (!have.some(h => h.from === g.from && h.to === g.to && h.placeId === g.placeId && h.activity === g.activity)) missing ||= `${k} ${d}/${w} (segment ${g.from}-${g.to} ${g.placeId})`;
      }
    }
    assert.equal(missing, null, `${label}: a subject's segments are in every sector they touch (${touched} checked; first miss ${missing})`); checks++;
    // and a file lists nobody who has no segment in its sector and window
    let stray = null;
    for (const id of SPLIT.SECTORS) for (const f of split.windows[id]) for (const k of Object.keys(f.subjects)) {
      if (!fullSegs.get(k).some(g => g.from < (f.window + 1) * SIM.WINDOW_H && g.to > f.window * SIM.WINDOW_H && SIM.segDistricts(g).includes(id))) stray ||= `${k} in ${id}/${f.window}`;
    }
    assert.equal(stray, null, `${label}: nobody is listed where they never are (${stray})`); checks++;
    const recs = Object.values(split.windows.sprawl[1].subjects).map(v => v[0]).filter(Boolean);
    ok(recs.every(r => !("breakdown" in r) && !("stratum" in r) && !("places" in r) && Array.isArray(r.cj)), `${label}: display records carry the job, not the sim's inputs`);
    ok(recs.every(r => SIM.assignJob(r).jobId === SIM.assignJob(people.get(r.slug)).jobId), `${label}: the record's job is the one the sim assigns`);

    // d. the summary is the plan's occupancy, sample by sample
    const sm = split.summary, at = (m, id, k) => sm[m]?.[id]?.[k] || 0;
    let bad = null;
    samples.forEach((t, k) => {
      const o = occ[k];
      for (const [id, n] of Object.entries(o.places)) if (at("p", id, k) !== n) bad ||= `place ${id} @${k}: ${at("p", id, k)} vs ${n}`;
      for (const id of Object.keys(sm.p)) if ((o.places[id] || 0) !== at("p", id, k)) bad ||= `place ${id} @${k}`;
      for (const [id, n] of Object.entries(o.stations)) if (at("st", id, k) !== n) bad ||= `station ${id} @${k}`;
      for (const [id, tr] of Object.entries(o.trains)) if (JSON.stringify(sm.car[id]?.[k]) !== JSON.stringify(tr.cars)) bad ||= `train ${id} @${k}`;
      if (sm.loop[k] !== o.loop) bad ||= `loop @${k}`;
      for (const [id, n] of Object.entries(bld[k])) if (at("b", id, k) !== n) bad ||= `building ${id} @${k}`;
      for (const [id, n] of Object.entries(dist[k])) if (at("d", id, k) !== n) bad ||= `district ${id} @${k}`;
      if (Object.values(o.subs).reduce((a, b) => a + b, 0) - (o.subs.riding || 0) !== Object.values(sm.wk).reduce((a, x) => a + x[k], 0) + Object.values(sm.st).reduce((a, x) => a + x[k], 0)) bad ||= `walkers + platforms @${k}`;
    });
    assert.equal(bad, null, `${label}: summary counts equal the plan's occupancy (${bad})`); checks++;
    ok(sm.n === roster.length && Object.values(sm.fam).reduce((a, b) => a + b, 0) === roster.length, `${label}: the summary counts the whole roster`);
    ok(Object.keys(sm.onFile).length === onFile().length && Object.entries(sm.onFile).every(([k, r]) => JSON.stringify(r) === JSON.stringify(plan.subjects[k])), `${label}: the figures on file ride in the summary, whole day`);

    // e. the crowd fills what the browser does not hold: nothing loaded -> the summary (capped);
    // everyone held -> nobody; every district loaded -> nobody
    const none = new Set(), all = new Set(SPLIT.SECTORS);
    let crowdBad = null;
    samples.forEach((t, k) => {
      const h = k * SPLIT.STEP;
      const c0 = CROWD.crowdAt(sm, h, none, []);
      const byPlace = {};
      for (const { w } of c0) if (w.activity !== "commute") byPlace[w.placeId] = (byPlace[w.placeId] || 0) + 1;
      for (const [id, n] of Object.entries(occ[k].places)) if ((byPlace[id] || 0) !== Math.min(n, Math.ceil(SIM.PLACES[id].cap * 1.25))) crowdBad ||= `empty browser, ${id} @${k}: ${byPlace[id]} vs ${n}`;
      const riders = c0.filter(e => e.w.sub === "riding").length;
      if (riders !== occ[k].loop && Object.values(occ[k].trains).every(tr => tr.cars.every(n => n <= SIM.CAR_CAP * 2))) crowdBad ||= `riders @${k}`;
      if (CROWD.crowdAt(sm, h, none, held[k]).length) crowdBad ||= `everyone held, crowd @${k}`;
      if (CROWD.crowdAt(sm, h, all, []).length) crowdBad ||= `every district loaded, crowd @${k}`;
    });
    assert.equal(crowdBad, null, `${label}: the crowd is the summary less what the browser holds (${crowdBad})`); checks++;
    const one = CROWD.crowdAt(sm, 18.25, none, []);
    ok(one.every(e => e.s.crowd && e.s.slug.startsWith("~") && JSON.stringify(CROWD.crowdAt(sm, 18.25, none, []).find(x => x.s === e.s)?.w) === JSON.stringify(e.w)), `${label}: stand-ins keep their identity and place from tick to tick`);

    // f. the find index points into the files the subject is in
    let findBad = null;
    for (const [k, name, , at4] of split.find.subjects) {
      if (!name) findBad ||= `${k}: no name`;
      [...at4].forEach((ch, w) => { const id = split.find.sectors[parseInt(ch, 36)]; if (ch === "-" || !split.windows[id][w].subjects[k]) findBad ||= `${k} window ${w}`; });
    }
    ok(split.find.subjects.length === roster.length && !findBad, `${label}: the find index names everyone and points at a file holding them (${findBad})`);
    const sizes = SPLIT.SECTORS.flatMap(id => split.windows[id].map(f => JSON.stringify(f).length));
    console.log(`  ${label}: split identical; summary ${(JSON.stringify(sm).length / 1024).toFixed(0)} KB, windows ${(Math.min(...sizes) / 1024).toFixed(0)}-${(Math.max(...sizes) / 1024).toFixed(0)} KB, find ${(JSON.stringify(split.find).length / 1024).toFixed(0)} KB`);
  }
  SIM.clearPlans(); SIM.clearSocialSnapshots(); SIM.clearRoster();

  // The builder publishes the split; /api/plan serves it; /api/find answers from it.
  const { getStore } = await import("@netlify/blobs");
  globalThis.__blobs = new Map();
  const store = () => getStore({ name: PL.STORE });
  const roster = onFile();
  const census = [...roster.slice(10), { slug: "citizen-7f3a", name: "Subject 7F3A", score: 540, tier: "TOLERATED GENERALIST", kind: "citizen", warmth: 60, competence: 55, quadrant: "ADMIRED" }];
  const io = PL.planIo(store, { census: async () => census, snapshots: async () => ({}) });
  const nowMs = T0 + 5 * 60 * 1000;
  const r = await PL.buildPlans(nowMs, io, { lookahead: 1 });
  ok(r.split.map(x => x.day).join() === r.built.map(x => x.day).join(), `every built day is split in the same run (${r.split.map(x => x.day)})`);
  const raw = (k) => globalThis.__blobs.get(PL.STORE)?.get(k)?.data ?? null;
  const m2 = raw(PL.MANIFEST2), e = m2.days[D];
  ok(e && e.ver === raw(PL.MANIFEST).days[D].ver && Object.keys(e.files).length === SIM.DISTRICTS.length && e.files.sprawl.length === 4 && e.files.coast?.length === 4 && e.files.heights?.length === 4, "the f2 manifest lists every sector's four windows under the plan's version");
  for (const id of SPLIT.SECTORS) for (let w = 0; w < 4; w++) ok(raw(PL.partKey(D, e.ver, PL.windowPart(id, w, 0)))?.sector === id && e.files[id][w][2] === 1, `window ${id}/${w} published`);
  ok(JSON.stringify(raw(PL.partKey(D, e.ver, "summary")).parts.sprawl) === "[1,1,1,1]", "the summary says how many parts each window has");
  // a day built before the split existed is split from its f1 blob, identically
  const f2day = raw(PL.partKey(D, e.ver, PL.windowPart("arts", 2, 0)));
  for (const k of [...globalThis.__blobs.get(PL.STORE).keys()]) if (k.startsWith("f2/")) globalThis.__blobs.get(PL.STORE).delete(k);
  const r2 = await PL.buildPlans(nowMs, io, { lookahead: 1 });
  ok(r2.built.length === 0 && r2.split.length === r.split.length, "an unsplit day already planned is split from its published plan");
  ok(JSON.stringify(raw(PL.partKey(D, e.ver, PL.windowPart("arts", 2, 0)))) === JSON.stringify(f2day), "and splits the same");
  // a dense window is published in parts that partition it, and /api/find reads the right one
  {
    const big = synthRoster(1500, { seed: 5 });
    const box = new Map(), io2 = { putPart: async (k, v) => { box.set(k, roundTrip(v)); } };
    SIM.clearPlans(); SIM.setRoster(big);
    const p1 = roundTrip(SIM.buildPlan(D)), v1 = PL.versionOf(p1);
    SIM.clearRoster();
    const saved = PL.PART_MAX;
    const entry = await PL.publishSplit(io2, p1, v1, big, "x", () => nowMs, 100);
    const whole = (() => { SIM.setPlan(p1, v1); try { return SPLIT.splitDay(p1, v1, new Map(big.map(x => [SIM.keyOf(x), x]))); } finally { SIM.dropPlan(D); } })();
    let partsOk = true, multi = 0;
    for (const id of SPLIT.SECTORS) for (let w = 0; w < 4; w++) {
      const P = entry.files[id][w][2], got = {};
      if (P > 1) multi++;
      for (let q = 0; q < P; q++) { const f = box.get(PL.partKey(D, v1, PL.windowPart(id, w, q))); for (const [k, v] of Object.entries(f.subjects)) { if (k in got || PL.partOf(k, P) !== q) partsOk = false; got[k] = v; } }
      if (JSON.stringify(Object.keys(got).sort()) !== JSON.stringify(Object.keys(whole.windows[id][w].subjects).sort())) partsOk = false;
    }
    ok(partsOk && multi > 0 && saved === PL.PART_MAX, `parts partition each window (${multi} windows split in parts)`);
  }

  const fn = (await import("../netlify/functions/plan.js")).default;
  const m = await (await fn(new Request("https://x/api/plan"))).json();
  ok(m.sectors?.[D] === e.ver && m.days[D] === e.ver, "/api/plan lists the split days");
  const sres = await fn(new Request(`https://x/api/plan/${D}/${e.ver}/summary`));
  const sum = await sres.json();
  ok(sres.status === 200 && /immutable/.test(sres.headers.get("cache-control")) && sum.kind === "summary" && sum.day === D, "the summary is served immutable");
  const wres = await fn(new Request(`https://x/api/plan/${D}/${e.ver}/commons/1/0`));
  const win = await wres.json();
  ok(wres.status === 200 && win.sector === "commons" && win.window === 1, "a sector window is served");
  ok((await fn(new Request(`https://x/api/plan/${D}/${e.ver}/commons/1`))).status === 200, "part 0 is also the window's bare path");
  ok((await fn(new Request(`https://x/api/plan/${D}/${e.ver}/commons/1/1`))).status === 404, "a part that does not exist: 404");
  for (const bad of [`/api/plan/${D}/${e.ver}/nowhere/1`, `/api/plan/${D}/${e.ver}/arts/4`, `/api/plan/${D}/${e.ver}/sumary`, `/api/plan/${D}/${e.ver}/arts/1/x`]) ok((await fn(new Request("https://x" + bad))).status === 404, `${bad}: 404`);
  // what a browser does with them: the summary's figures on file, then one window
  SIM.clearPlans();
  SIM.addPlanRows(D, e.ver, sum.places, sum.onFile, { n: sum.n });
  const fig = roster[0];
  ok(SIM.covers(fig, (D - 1) * 24 + 13.3), "the summary alone places the figures on file all day");
  SIM.addPlanRows(D, e.ver, win.places, Object.fromEntries(Object.entries(win.subjects).map(([k, v]) => [k, v[1]])));
  const someone = Object.keys(win.subjects).find(k => !sum.onFile[k]);
  ok(!someone || SIM.covers({ slug: someone }, (D - 1) * 24 + 7), "a window places its own subjects in its hours");

  const find = (await import("../netlify/functions/find.js")).default;
  const realNow = Date.now;
  Date.now = () => nowMs;
  try {
    PL.forgetManifest();
    const f1 = await (await find(new Request("https://x/api/find?q=subject 7f3a"))).json();
    ok(f1.hits?.[0]?.key === "citizen-7f3a" && f1.hits[0].rec?.cj && Array.isArray(f1.hits[0].row), `/api/find finds a citizen by name, with its record and row (${JSON.stringify(f1.hits?.[0]?.key)})`);
    SIM.clearPlans();
    SIM.addPlanRows(f1.day, f1.ver, sum.places, { [f1.hits[0].key]: f1.hits[0].row });
    ok(SIM.covers({ slug: "citizen-7f3a" }, SIM.machineClock(nowMs).mt), "the row it returns covers now");
    const f2 = await (await find(new Request(`https://x/api/find?slug=${SIM.keyOf(fig)}&day=${D}&w=3`))).json();
    ok(f2.hits.length === 1 && f2.hits[0].rec === 0 && f2.w === 3, "by slug, any window; a figure on file comes back without a record (the bundle has it)");
    ok((await find(new Request("https://x/api/find?q=zzzzqqq"))).status === 200, "no match is an empty answer");
    ok((await find(new Request("https://x/api/find"))).status === 400, "nothing asked: 400");
    ok((await find(new Request(`https://x/api/find?slug=x&day=${D + 40}`))).status === 404, "a day not split: 404 (the browser searches its own census)");
  } finally { Date.now = realNow; }
  SIM.clearPlans();
}
// ---- 6. the stall alarm (scripts/plan-health.mjs, run by the referral-sprites job) -------------
{
  const { health, withSection } = await import("./plan-health.mjs");
  const now = T0 + 5 * 60 * 1000;   // day D
  ok((await health(async () => ({ latest: D + 2, sectors: { [D + 1]: "v", [D + 2]: "v" } }), now)).ok, "built and split ahead: healthy");
  ok(!(await health(async () => ({ latest: D + 2, sectors: { [D]: "v" } }), now)).ok, "built but not split ahead: stalled");
  ok(!(await health(async () => ({ latest: D }), now)).ok, "tomorrow missing: stalled");
  ok(!(await health(async () => ({ latest: null, days: {} }), now)).ok, "empty manifest: stalled");
  ok(!(await health(async () => { throw new Error("HTTP 503"); }, now)).ok, "unreadable manifest: stalled");
  const rep = "# Report\n\n## Needs you\n- a\n  b\n\n## Shipped\n- x\n";
  const one = withSection(rep, "- stalled\n  detail");
  const two = withSection(one, "- stalled again\n  detail");
  ok(two.split("## City plans stalled").length === 2 && two.includes("stalled again") && !two.includes("- stalled\n"), "the section is replaced in place, never appended twice");
  ok(withSection(two, null).trim() === rep.trim(), "recovery removes the section and leaves the rest untouched");
  ok(withSection(rep, null) === rep, "healthy with no section: the report is not rewritten");
}
// ---- 7. the lines (PHASE 2): the Loop is line 0, and a day built before a line keeps its trains -
{
  const { readFileSync } = await import("node:fs");
  const { createHash } = await import("node:crypto");
  ok(SIM.LINES[0] === SIM.LOOP && SIM.LOOP.id === "loop" && SIM.LINES.every((l, i) => l.index === i), "the Loop is line 0; every line sits at its own index (plans name lines by index)");
  ok(Object.keys(SIM.STATIONS).every(id => SIM.STOPS[id] === SIM.STATIONS[id] && SIM.STOPS[id].lineId === "loop"), "the Loop's stations are its stops");
  const mts = Array.from({ length: 300 }, (_, i) => (D - 1) * 24 + i * 0.137);
  ok(mts.every(mt => JSON.stringify(SIM.lineTrainsAt(mt).filter(t => t.line === "loop").map(({ line, ...t }) => t)) === JSON.stringify(SIM.trainsAt(mt))), "every line's trains include the Loop's, exactly trainsAt's");
  ok(mts.every(mt => Object.keys(SIM.STATIONS).every(id => JSON.stringify(SIM.nextArrivalAt(id, mt)) === JSON.stringify(SIM.nextArrival(id, mt)))), "a Loop stop's next train is the Loop's own timetable");
  // a day published on network 2 (the Loop and the pods, commit 44f1b9c) and one on network 3 (the
  // Shore Line's first version and the Alpine Line, commit 5218e14), read by this code: every
  // rider's train, car and place aboard each machine minute; every waiting and alighting subject's
  // train, car, platform and boarding time once per trip (how long they stand there follows the
  // ground they walked, which a layout may move). Adding a line never changes a published train.
  // and one on network 5 (the Loop's version 1: five trains; commit b54a241): the Loop's version 2 runs
  // version 1's five where they always ran and adds trains between them, so its riders never move
  for (const [file, label] of [["net2-plan-day300.json", "network 2 (the pods)"], ["net3-plan-day300.json", "network 3 (the Shore Line v1, the Alpine Line)"], ["net5-plan-day300.json", "network 5 (the Loop's version 1)"], ["net6-plan-day300.json", "network 6 (the Loop's version 2, before the East Line; commit 3d6a2c0)"]]) {
    const fx = JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8"));
    SIM.clearPlans(); SIM.clearRoster(); SIM.clearSocialSnapshots();
    ok(SIM.setPlan(fx.plan, `fixture-${file}`), `a day built on ${label} loads`);
    const rows = [];
    for (const k of Object.keys(fx.plan.subjects)) { const seen = new Set(); for (let i = 0; i < 24 * 60; i++) {
      const w = SIM.whereAt({ slug: k }, (fx.plan.day - 1) * 24 + i / 60);
      if (w.sub === "riding") rows.push([k, i, "r", w.trainId, w.car, +w.x.toFixed(6), +w.y.toFixed(6)]);
      else if (w.sub === "waiting" || w.sub === "alighting") { const t = `${w.sub[0]}|${w.trainId}|${w.car}|${w.stationId}|${w.boardAt}`; if (!seen.has(t)) { seen.add(t); rows.push([k, w.sub[0], w.trainId, w.car, w.stationId, w.boardAt]); } }
    } }
    ok(rows.length === fx.rows && createHash("sha256").update(JSON.stringify(rows)).digest("hex") === fx.fingerprint, `a day built on ${label} keeps every train, car and platform (${rows.length} rows, fingerprint ${fx.fingerprint.slice(0, 12)})`);
  }
  // THE LOOP'S VERSION 2: version 1's five trains keep their ids, cars and timetable to the last bit;
  // the new ones run between them, every platform sees a train LOOP_SPLIT times as often
  {
    const V1 = [4, 3, 4, 4, 3], H1 = SIM.LOOP_LINE.lapHours / V1.length;
    ok(SIM.LOOP_VERSION === 2 && SIM.TRAINS.slice(0, 5).every((t, k) => t.id === `L${k + 1}` && t.cars === V1[k]), "the Loop's version 1 trains keep their ids (L1-L5), indices and cars");
    ok(SIM.TRAINS.length > 5 && SIM.TRAINS.slice(5).every((t, k) => t.id === `L${k + 6}`), `version 2 adds trains L6-L${SIM.TRAINS.length}`);
    // the old timetable, as version 1 computed it: train k's middle at T (ARR, DWELL and the speed unchanged)
    let moved = 0;
    for (let i = 0; i < 2000; i++) {
      const T = (D - 1) * 24 + i * 0.0123, now = SIM.trainsAt(T);
      for (let k = 0; k < 5; k++) {
        const tau = ((T - k * H1) % SIM.LOOP_LINE.lapHours + SIM.LOOP_LINE.lapHours) % SIM.LOOP_LINE.lapHours;
        const st = SIM.LOOP.stops.reduce((a, s, j) => (SIM.LOOP.ARR[j] <= tau ? j : a), 0), stop = SIM.LOOP.stops[st], dt = tau - SIM.LOOP.ARR[st];
        const mid = dt < SIM.DWELL ? stop.s : stop.s + (dt - SIM.DWELL) * SIM.V_TRAIN, m = ((mid % SIM.LOOP_LINE.length) + SIM.LOOP_LINE.length) % SIM.LOOP_LINE.length;
        if (Math.abs(now[k].mid - m) > 1e-9) moved++;
      }
    }
    ok(moved === 0, `version 1's five trains run exactly version 1's timetable (${moved} of 10,000 positions moved)`);
    const gaps = [];
    for (const id of SIM.STATION_ORDER) { const b = SIM.timetable(id, (D - 1) * 24 + 7, SIM.TRAINS.length + 1); for (let i = 1; i < b.length; i++) gaps.push(b[i].arrive - b[i - 1].arrive); }
    ok(gaps.every(g => g >= SIM.LOOP_GAPS.min - 1e-9 && g <= SIM.HEADWAY + 1e-9) && SIM.HEADWAY < H1 / 2.5, `every station sees a train every ${(SIM.LOOP_GAPS.min * 60).toFixed(2)}-${(SIM.HEADWAY * 60).toFixed(2)} machine minutes (version 1: ${(H1 * 60).toFixed(2)})`);
    // no train reaches a platform before the one ahead has cleared it
    let tight = Infinity;
    for (let m = 0; m < 24 * 60; m += 0.25) { const tr = SIM.trainsAt((D - 1) * 24 + m / 60).map(t => ({ m: t.mid, h: t.length / 2 })).sort((a, b) => a.m - b.m); tr.forEach((x, i) => { const y = tr[(i + 1) % tr.length]; tight = Math.min(tight, ((y.m - x.m) % SIM.LOOP_LINE.length + SIM.LOOP_LINE.length) % SIM.LOOP_LINE.length - x.h - y.h); }); }
    ok(tight > 0.5, `the Loop's trains never close up (closest ${tight.toFixed(2)} cells apart)`);
    const seen = new Set(); for (const id of SIM.STATION_ORDER) for (const a of SIM.timetable(id, (D - 1) * 24 + 7, SIM.TRAINS.length)) seen.add(a.trainId);
    ok(seen.size === SIM.TRAINS.length, "every train calls at every station in a lap");
  }
  SIM.clearPlans();
}
console.log(`check-plans: ${checks} checks passed`);
