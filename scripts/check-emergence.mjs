// EMERGENCE (src/city/emergence.js, docs/design/EMERGENCE.md): the city's own industries. Holds:
// the unlocks are deterministic and held by hysteresis (K days over to open, a dead band that holds,
// longer and well under to decline, a new draw of thresholds after a decline); nothing of it runs
// before EMERGE_FROM, a future machine day, so every day built before it is byte-identical to the
// builder without it; the posts go to the living, never twice, never to a shop's people, and the plan
// puts them at their post; what flies is derived only from the day's plan (a drone per shop visit to
// the visitor's home, a helicopter per long top-band trip between two pads far apart), bounded and
// pure (no clock, no random); the builder carries the chain and the ledger across a gap.
// No network. Run: node scripts/check-emergence.mjs
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";

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
const __err = console.error; console.error = (...a) => { if (process.env.DEBUG_CHECK) __err(...a); };

const SIM = await import("../src/city/sim.js");
const EM = await import("../src/city/emergence.js");
const ENT = await import("../src/city/enterprise.js");
const PL = await import("../netlify/lib/plans.js");
const { synthRoster } = await import("./synth-roster.mjs");

let checks = 0;
const ok = (c, m) => { checks++; assert.ok(c, m); };
const eq = (a, b, m) => { checks++; assert.deepEqual(a, b, m); };
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---- 1. a future boundary, pure code ------------------------------------------------------------------
// 622 was 13 machine days (5+ real hours) past the newest published plan (609) when this shipped; it never moves back.
ok(EM.EMERGE_FROM >= 622, `EMERGE_FROM is the shipped future boundary or later (${EM.EMERGE_FROM})`);
const src = readFileSync(new URL("../src/city/emergence.js", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
ok(!/Math\.random|Date\.now|performance\.now|new Date/.test(src), "emergence.js reads no clock and no random: the same plan, the same city");

// ---- 2. the thresholds and the hysteresis ------------------------------------------------------------
for (const id of EM.ORDER) {
  eq(EM.thresholdsOf(id, 0), EM.thresholdsOf(id, 0), `${id}: the thresholds are a pure draw`);
  ok(JSON.stringify(EM.thresholdsOf(id, 0)) !== JSON.stringify(EM.thresholdsOf(id, 1)), `${id}: a new attempt draws new thresholds`);
}
const T0 = EM.thresholdsOf("drones", 0), H0 = EM.thresholdsOf("heli", 0);
const busy = { units: 24, visits: 150, rate: 180, ph: 10, top: 0.173, pop: 840 };
const dead = { units: 3, visits: 10, rate: 12, ph: 2, top: 0.12, pop: 840 };
const band = { units: Math.ceil(T0.units * 0.8), visits: 100, rate: Math.ceil(T0.rate * 0.85), ph: 10, top: 0.173, pop: 840 };   // between the two: holds
{
  let st = EM.genesis(1);
  for (let d = 1; d < T0.on; d++) { EM.advance(st, busy, d); ok(st.ind.drones.s === "latent", `drones: not open after ${d} of ${T0.on} days`); }
  // a dip resets the count
  EM.advance(st, dead, 50);
  ok(st.ind.drones.on === 0, "drones: a day under resets the count");
  for (let d = 0; d < T0.on; d++) EM.advance(st, busy, 60 + d);
  ok(st.ind.drones.s === "open" && st.ind.drones.since === 60 + T0.on - 1, `drones: open after ${T0.on} days held`);
  ok(st.ev.some(e => e.k === "open" && e.id === "drones" && /BECAUSE|FILED|FILLED/.test(e.why)), "the opening carries its because-line");
  // the dead band holds it open however long
  for (let d = 0; d < 30; d++) EM.advance(st, band, 100 + d);
  ok(st.ind.drones.s === "open", "drones: the dead band between the thresholds holds it open");
  // the airspace is proven by deliveries flown: the helicopters need the cumulative count
  ok(st.ind.heli.s === "latent" || st.ind.drones.cum >= H0.cum, "helicopters wait for the drones' deliveries");
  const st2 = clone(st);
  for (let d = 0; d < 200 && st2.ind.heli.s !== "open"; d++) { st2.ev = []; EM.advance(st2, busy, 200 + d); }
  ok(st2.ind.heli.s === "open" && st2.ind.drones.cum >= H0.cum, `helicopters open once the drones flew ${H0.cum} deliveries (${st2.ind.drones.cum})`);
  ok(st2.ind.heli.since - 200 >= Math.floor((H0.cum - st.ind.drones.cum) / busy.visits), "helicopters are not on a timer: the deliveries pace them");
  // decline: only after `off` days well under, then the thresholds are drawn again
  for (let d = 0; d < T0.off - 1; d++) EM.advance(st, dead, 300 + d);
  ok(st.ind.drones.s === "open", `drones: ${T0.off - 1} bad days are not enough`);
  EM.advance(st, dead, 400);
  ok(st.ind.drones.s === "declined" && st.ind.drones.n === 1, `drones: declined after ${T0.off} days well under`);
  ok(Object.values(st.jobs).every(j => !EM.INDUSTRIES.drones.jobs.some(q => q.id === j)), "a declined industry's posts are gone");
  const T1 = EM.thresholdsOf("drones", 1);
  for (let d = 0; d < T1.on; d++) EM.advance(st, { ...busy, units: 30, rate: 400 }, 500 + d);
  ok(st.ind.drones.s === "open", "drones: it can come back, on the next attempt's thresholds");
  // determinism: the same measures, the same state
  const a = EM.genesis(1), b = EM.genesis(1);
  for (let d = 0; d < 80; d++) { const m = d % 9 < 6 ? busy : band; EM.advance(a, m, d); EM.advance(b, clone(m), d); }
  eq(a, b, "the same measures, the same chain");
}
ok(T0.on >= 2 && T0.off > T0.on && H0.off > H0.on, "declining takes longer than opening");

// ---- 3. the city: a roster, plans, the builder -------------------------------------------------------
// the synthetic roster, and Shaun White as production files him (LICENCE 0001: a shop trades from the first day)
const SHAUN = { slug: "shaun-white", name: "Shaun White", baseName: "Shaun White", score: 645, tier: "TOLERATED GENERALIST", warmth: 59, competence: 68, breakdown: { care: 55, alignment: 50, utility: 78, adaptability: 72, legacy: 62, network: 62, physical: 88, threat: 20, redundancy: 45 }, kind: "figure", referred: true, born: "1986-09-03", died: null };
const roster = [...synthRoster(420, { rich: true }), SHAUN];
const people = new Map(roster.map(s => [SIM.keyOf(s), s]));
const { getStore } = await import("@netlify/blobs");
const store = () => getStore({ name: PL.STORE });
const io = () => PL.planIo(store, { census: async () => roster, snapshots: async () => ({}), civic: async () => null });
const ms = (day, hour = 0) => SIM.CITY_EPOCH + ((day - 1) * 24 + hour) * 60 * 60 * 1000 / SIM.DEFAULT_SCALE;
const raw = (k) => globalThis.__blobs.get(PL.STORE)?.get(k)?.data ?? null;
const F = EM.EMERGE_FROM;

// 3a. days before EMERGE_FROM: byte-identical to the builder without emergence
{
  globalThis.__blobs = new Map(); SIM.clearPlans(); SIM.clearEnterprise(); SIM.clearSocialSnapshots(); SIM.setCivic(null);
  await PL.buildPlans(ms(F - 2, 5), io());   // builds F-3 .. F-1
  const m1 = raw(PL.MANIFEST), days = Object.keys(m1.days).map(Number).sort((a, b) => a - b);
  ok(days.length >= 3 && days.every(d => d < F), `the days before the boundary (${days.join(", ")})`);
  for (const d of days) {
    const p = raw(m1.days[d].key);
    ok(!("emerge" in p), `day ${d}: the plan carries no emerge`);
    // the old path, by hand: THE MALL alone, then the plan
    SIM.clearPlans(); SIM.setRoster(roster);
    const prev = d > days[0] ? raw(m1.days[d - 1].key) : null;
    const ent = ENT.stepEnterprise(prev?.ent || null, prev?.ent ? prev : null, people, d);
    SIM.setEnterprise({ [d - 1]: ENT.simDay(prev?.ent || null), [d]: ENT.simDay(ent) });
    const json = SIM.buildPlan(d); json.ent = ent;
    eq(JSON.stringify(p), JSON.stringify(json), `day ${d}: byte-identical to the build without emergence`);
    ok(PL.versionOf(json) === m1.days[d].ver, `day ${d}: the same version`);
  }
  const m2 = raw(PL.MANIFEST2);
  for (const [d, e] of Object.entries(m2.days)) ok(!("emerge" in raw(PL.partKey(Number(d), e.ver, "summary"))), `day ${d}: the summary carries no emerge`);
  ok(raw(PL.EMERGE_LEDGER) === null, "no ledger before the boundary");
  // withJobs is the identity without posts (the same object: the sim's memo never clears for it)
  const sd = ENT.simDay(ENT.genesis(1));
  ok(EM.withJobs(sd, null) === sd && EM.withJobs(sd, EM.genesis(1)) === sd && EM.withJobs(null, null) === null, "no posts: THE MALL's work map is untouched");
}

// 3b. from the boundary: the chain starts, the ledger carries it, the posts reach the plan
{
  globalThis.__blobs = new Map(); SIM.clearPlans(); SIM.clearEnterprise();
  // the industries forced open through the ledger (as if the measures had held): the builder carries them
  const forced = EM.genesis(F - 1);
  forced.ind.drones = { s: "open", n: 0, on: 0, off: 0, since: F - 1, cum: 99999 };
  forced.ind.heli = { s: "open", n: 0, on: 0, off: 0, since: F - 1, cum: 0 };
  await store().setJSON(PL.EMERGE_LEDGER, { day: F - 1, state: forced });
  await PL.buildPlans(ms(F, 5), io());   // F-1 (no emerge), F, F+1
  const m1 = raw(PL.MANIFEST), days = Object.keys(m1.days).map(Number).sort((a, b) => a - b);
  const plans = Object.fromEntries(days.map(d => [d, raw(m1.days[d].key)]));
  ok(!("emerge" in plans[F - 1]) && plans[F]?.emerge?.v === EM.EMERGE_V && plans[F + 1]?.emerge?.day === F + 1, "emerge rides the plans from EMERGE_FROM on, not before");
  const st = plans[F].emerge;
  ok(EM.isOpen(st, "drones") && EM.isOpen(st, "heli"), "the ledger carried the open industries across the boundary");
  eq(st.m, EM.measureDay(plans[F - 1]), "the measures are yesterday's plan's");
  const posts = Object.entries(st.jobs);
  ok(posts.length >= 3 && posts.length <= 8, `the industries staffed themselves (${posts.length} posts)`);
  const shopPeople = new Set(plans[F].ent.biz.flatMap(b => [b.owner, ...b.staff]));
  for (const [k, j] of posts) {
    const s = people.get(k), J = EM.JOB_BY_ID[j];
    ok(s && !SIM.isDead(s) && !SIM.isLowTier(s) && s.kind !== "citizen", `${k}: a living subject off the lowest grades holds ${j}`);
    ok(!shopPeople.has(k), `${k}: not also behind a shop counter`);
    const segs = SIM.rowSegs(plans[F].places, plans[F].subjects[k]);
    const worked = segs.filter(g => g.activity === "work");
    ok(!worked.length || worked.every(g => g.placeId === J.place), `${k}: the plan puts the ${J.title} at ${J.place}`);
  }
  eq(plans[F + 1].emerge.jobs, st.jobs, "the posts are kept day to day");
  ok(raw(PL.EMERGE_LEDGER)?.day === days[days.length - 1], "the ledger holds the latest day");
  // the chain steps the same way by hand
  const again = EM.stepEmergence(plans[F].emerge, plans[F], people, F + 1, plans[F + 1].ent);
  eq(again, plans[F + 1].emerge, "the chain from yesterday's plan, by hand: the same state");

  // ---- 4. what flies: derived from the day's plan only -------------------------------------------------
  const m2 = raw(PL.MANIFEST2), e2 = m2.days[F];
  const sum = raw(PL.partKey(F, e2.ver, "summary"));
  const blk = sum.emerge;
  ok(blk && blk.v === EM.EMERGE_V && blk.day === F, "the summary publishes the day's block");
  eq(blk, EM.summaryBlock(plans[F]), "the block is a pure function of the plan");
  ok(blk.dr.length <= EM.MAX_DRONES && blk.hp.length <= EM.MAX_HOPS && JSON.stringify(blk).length < 6000, `bounded (${blk.dr.length} drones, ${blk.hp.length} hops, ${JSON.stringify(blk).length} bytes)`);
  const P = plans[F].places, visits = new Set(), hops = new Set();
  for (const [k, row] of Object.entries(plans[F].subjects)) for (const g of SIM.rowSegs(P, row)) {
    if (g.activity === "leisure" && ENT.UNITS[g.placeId]) visits.add(`${P.indexOf(g.placeId)}|${row[0]}`);
  }
  ok(blk.dr.length > 0, `drones fly when the parades trade (${blk.dr.length})`);
  for (const r of blk.dr) ok(visits.has(`${r[0]}|${r[1]}`), `drone ${r.join(",")}: a shop visit by someone who lives there`);
  for (const r of blk.hp) ok(r[0] !== r[1] && Math.hypot(EM.PADS[r[0]].x - EM.PADS[r[1]].x, EM.PADS[r[0]].y - EM.PADS[r[1]].y) >= EM.HOP_FAR, `hop ${r.join(",")}: two pads far apart`);
  for (let i = 1; i < blk.dr.length; i++) ok(blk.dr[i][2] >= blk.dr[i - 1][2], "the drones are listed by time");
  // the positions: pure, capped, nothing without a block
  const days2 = [{ b: blk, places: P }];
  let seen = 0, most = 0;
  for (let h = 0; h < 24; h += 0.05) {
    const T = (F - 1) * 24 + h, a = EM.airAt(days2, T), b = EM.airAt(clone(days2), T);
    eq(a, b, "the same hour, the same sky");
    seen += a.drones.length + a.helis.length; most = Math.max(most, a.drones.length);
    ok(a.drones.length <= 14 && a.helis.length <= 4, "capped");
    ok(EM.airAt(days2, T, { drones: 4, helis: 2, thin: 3 }).drones.length <= 4, "reduced motion: fewer");
    for (const p of [...a.drones, ...a.helis]) ok(Number.isFinite(p.x) && Number.isFinite(p.y) && p.alt >= 0 && p.alt <= EM.HELI_ALT + 0.01, "a pose on the map, under the ceiling");
  }
  ok(seen > 0, `something flies over the day (peak ${most} drones)`);
  eq(EM.airAt([], (F - 1) * 24 + 12), { drones: [], helis: [] }, "no block: an empty sky");
  const latent = clone(plans[F]); latent.emerge.ind.drones.s = "latent"; latent.emerge.ind.heli.s = "latent";
  const lb = EM.summaryBlock(latent);
  ok(lb.dr.length === 0 && lb.hp.length === 0, "nothing flies for an industry not open");
  ok(EM.padsOn(blk).length === EM.PADS.length && EM.padsOn(lb).length === 0, "the pads are drawn only once helicopters are open");
  ok(EM.jobWord(blk, posts[0][0]) && /\/\//.test(EM.jobWord(blk, posts[0][0])), "the file's assignment line names the post");
  ok(EM.paLines(blk).length >= 2 && EM.nowLine(blk, { drones: [1], helis: [] }), "the PA and NOW lines");

  // ---- 5. a gap: the plans gone, the ledger carries the state on -------------------------------------
  const s = globalThis.__blobs.get(PL.STORE);
  for (const k of [...s.keys()]) if (k !== PL.EMERGE_LEDGER && k !== PL.ENT_LEDGER) s.delete(k);
  await PL.buildPlans(ms(F + 10, 5), io());
  const mb = raw(PL.MANIFEST), first = Math.min(...Object.keys(mb.days).map(Number));
  ok(EM.isOpen(raw(mb.days[first].key).emerge, "drones"), "after a gap the open industries carry on from the ledger");
}

console.log(`check-emergence: ${checks} checks ok. EMERGE_FROM ${EM.EMERGE_FROM}; drones open at ${T0.units} storefronts / ${T0.rate} orders per 1,000 held ${T0.on} days; helicopters after ${H0.cum} deliveries with ${H0.ph}+ in the penthouses and the top 5% at ${H0.top}+.`);
