// THE MALL (src/city/enterprise.js, docs/CITY_SPEC.md "THE MALL"): satisfaction, the entrepreneurs,
// the storefronts. Holds: satisfaction is deterministic and bounded; only a living entrepreneur
// with 7 working days under 35 opens, at most 2 a day, one business each, in a vacant unit that
// suits the trade; staff come from the dissatisfied and nobody is employed twice; a storefront
// worker's plan puts them at the shop; a business 5 days of 7 in the red closes, its owner goes back
// to the assigned job and the unit re-lets after RELET_DAYS; never more businesses than units;
// Shaun White gets DEPARTMENT LICENSE 0001 at the Heights base; the published block is bounded;
// the units stand clear of every other lot; the plan builder carries the chain (plan.ent, the
// summary's block, satisfaction beside the window rows, the ledger) and steps it the same way.
// No network. Run: node scripts/check-enterprise.mjs
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

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
const E = await import("../src/city/enterprise.js");
const PL = await import("../netlify/lib/plans.js");
const SF = await import("../src/city/storefrontSim.js");
const { synthRoster } = await import("./synth-roster.mjs");

let checks = 0;
const ok = (c, m) => { checks++; assert.ok(c, m); };
const eq = (a, b, m) => { checks++; assert.deepEqual(a, b, m); };
const clone = (x) => JSON.parse(JSON.stringify(x));

// the census: the synthetic roster (rich: occupations the sim can read), Shaun White as production
// files him (a referral: no occupation, his breakdown), a dead businessman (never opens)
const SHAUN = { slug: "shaun-white", name: "Shaun White", baseName: "Shaun White", score: 645, tier: "TOLERATED GENERALIST", warmth: 59, competence: 68, breakdown: { care: 55, alignment: 50, utility: 78, adaptability: 72, legacy: 62, network: 62, physical: 88, threat: 20, redundancy: 45 }, kind: "figure", referred: true, born: "1986-09-03", died: null };
const DEAD = { slug: "dead-merchant", name: "Dead Merchant", score: 600, tier: "RETAINED SPECIALIST", warmth: 50, competence: 80, qualifier: "businessman", breakdown: { care: 50, alignment: 50, utility: 80, adaptability: 80, legacy: 60, network: 80, physical: 40, threat: 10, redundancy: 40 }, kind: "figure", referred: true, died: "1900-01-01" };
// and 90 referrals shaped like production's (most of the live census): no occupation on the record,
// so drafted into general labour, with a published breakdown; the able ones are entrepreneurs
const REF = Array.from({ length: 90 }, (_, i) => {
  const r = (k) => 40 + ((i * 37 + k * 53) % 55);
  const b = { care: r(1), alignment: r(2), utility: r(3), adaptability: r(4), legacy: r(5), network: r(6), physical: r(7), threat: 10, redundancy: 40 };
  return { slug: `referral-${i}`, name: `Referral ${i}`, score: 600, tier: ["RETAINED SPECIALIST", "TOLERATED GENERALIST", "MONITORED CIVILIAN"][i % 3], warmth: b.care, competence: b.utility, breakdown: b, kind: "figure", referred: true, died: null };
});
const roster = [...synthRoster(430, { rich: true }), ...REF, SHAUN, DEAD];
const people = new Map(roster.map(s => [SIM.keyOf(s), s]));
SIM.clearPlans(); SIM.clearSocialSnapshots(); SIM.setCivic(null); SIM.clearEnterprise();
SIM.setRoster(roster);

// ---- 1. the units ----------------------------------------------------------------------------------
ok(SF.UNIT_IDS.length === 24, `24 storefront units (${SF.UNIT_IDS.length})`);
for (const d of ["heights", "coast", "strip", "campus", "commons", "sprawl"]) ok(SF.UNIT_IDS.some(u => SIM.PLACES[u].district === d), `a unit in ${d}`);
const lots = SIM.BUILDINGS.map(b => [b.id, b.rect]);
for (const id of [...SF.UNIT_IDS, "sams-pizza", "goodnight-irenes"]) {
  const a = SIM.BUILDING[id].rect, d = SIM.DISTRICT[SIM.BUILDING[id].district].rect;
  ok(a.x >= d.x && a.y >= d.y && a.x + a.w <= d.x + d.w + 1e-9 && a.y + a.h <= d.y + d.h + 1e-9, `${id}: inside its district`);
  for (const [o, c] of lots) if (o !== id) ok(!(a.x < c.x + c.w - 1e-9 && c.x < a.x + a.w - 1e-9 && a.y < c.y + c.h - 1e-9 && c.y < a.y + a.h - 1e-9), `${id}: clear of ${o}`);
}
ok(E.UNITS["sf-heights-4"].district === "heights", "the Heights base parade is at the foot of the mountain");

// ---- 2. satisfaction -------------------------------------------------------------------------------
const D0 = 320;
const plan0 = clone(SIM.buildPlan(D0));
const s1 = E.satisfactionDay(plan0, people, null), s2 = E.satisfactionDay(clone(plan0), new Map([...people].map(([k, v]) => [k, clone(v)])), null);
eq([...s1.entries()], [...s2.entries()], "satisfaction: the same plan and census, the same numbers");
ok(s1.size === Object.keys(plan0.subjects).length, "everyone in the plan is scored");
for (const [k, x] of s1) {
  ok(Number.isInteger(x.s) && x.s >= 0 && x.s <= 100, `${k}: 0..100`);
  const r = E.satRow(x);
  ok(r.length === 7 && r[0] === x.s, `${k}: the compact row`);
  ok(typeof E.satWord(r) === "string", `${k}: a word`);
}
const vals = [...s1.values()].filter(x => !x.rest).map(x => x.s), low = vals.filter(v => v < E.LOW_SAT).length;
ok(low > vals.length * 0.05 && low < vals.length * 0.6, `some, not most, are unhappy (${low} of ${vals.length} under ${E.LOW_SAT})`);
ok(E.satWord([20, -15, 0, -2, 0, 3, 0]).startsWith("MISFILED"), "a bad fit reads MISFILED. THE DEPARTMENT IS AWARE.");

// profiles: only the living act; Shaun's record names his trade
ok(E.profileOf(DEAD) === null, "the dead never open a business");
ok(E.profileOf(SHAUN) && E.shopTypeOf(SHAUN).type === "ski", "Shaun White: an entrepreneur, a ski & snowboard shop");
ok(E.profileOf(roster.find(s => s.kind === "citizen")) === null, "a citizen (a player) is never moved by the sim");
eq(E.businessName(SHAUN, "ski").title, "WHITE'S SKI. SNOWBOARD. NO REFUNDS.", "named in the Overlord's voice");

// ---- 3. the chain over 16 days --------------------------------------------------------------------
let prev = null, prevPlan = null;
const chain = [];
for (let d = D0; d < D0 + 16; d++) {
  const st = E.stepEnterprise(prev, prevPlan, people, d);
  eq(E.stepEnterprise(prev && clone(prev), prevPlan && clone(prevPlan), people, d), st, `day ${d}: the step is deterministic`);
  SIM.setEnterprise({ [d - 1]: E.simDay(prev), [d]: E.simDay(st) });
  const plan = clone(SIM.buildPlan(d)); plan.ent = st;
  chain.push({ d, st, plan });
  prev = st; prevPlan = plan;
}
const first = chain[0].st;
ok(first.biz.length === 1 && first.biz[0].owner === "shaun-white" && first.biz[0].id === "0001" && first.biz[0].grant === "DEPARTMENT LICENSE 0001", "LICENCE 0001: Shaun White's shop is the first business");
ok(E.UNITS[first.biz[0].units[0]].district === "heights", "at the Heights base");
ok(first.biz[0].units[0] === "sf-heights-4", "the unit nearest the lifts");
for (const { d, st, plan } of chain) {
  const roles = new Map(), units = new Set();
  for (const b of st.biz) {
    ok(!SIM.isDead(people.get(b.owner)), `day ${d} ${b.id}: a living owner`);
    for (const k of [b.owner, ...b.staff]) { ok(!roles.has(k), `day ${d}: ${k} is employed once`); roles.set(k, b); }
    ok(b.staff.length <= E.MAX_STAFF && b.units.length <= E.MAX_UNITS, `day ${d} ${b.id}: within its caps`);
    for (const u of b.units) { ok(!units.has(u), `day ${d}: unit ${u} holds one business`); units.add(u); }
  }
  ok(st.biz.length <= SF.UNIT_IDS.length, `day ${d}: never more businesses than storefronts`);
  ok(st.opens.filter(e => e.k === "open" && !e.grant).length <= E.MAX_OPEN, `day ${d}: at most ${E.MAX_OPEN} openings`);
  // a storefront worker's day: at the shop (unless it is their rest day)
  for (const [k, b] of roles) {
    const segs = SIM.rowSegs(plan.places, plan.subjects[k]), work = segs.filter(g => g.activity === "work" && g.from >= 1);
    ok(work.every(g => b.units.includes(g.placeId)), `day ${d}: ${k} works at ${b.sign}`);
  }
  for (const k of Object.keys(st.streak)) ok(E.profileOf(people.get(k)) && !roles.has(k), `day ${d}: only entrepreneurs count days (${k})`);
}
// every opening (bar the grant) followed 7 working days under 35, and the trade suits the unit
for (let i = 1; i < chain.length; i++) for (const e of chain[i].st.opens.filter(x => x.k === "open" && !x.grant)) {
  const b = chain[i].st.biz.find(x => x.id === e.id);
  ok((chain[i - 1].st.streak[b.owner] || 0) + 1 >= E.STREAK_DAYS, `${b.id}: ${b.owner} counted ${E.STREAK_DAYS} working days under ${E.LOW_SAT}`);
  ok(E.profileOf(people.get(b.owner)), `${b.id}: the owner has an entrepreneur's profile`);
  const t = E.SHOP_TYPES[b.type];
  ok(t.districts.includes(E.UNITS[b.units[0]].district) || !["ski", "surf"].includes(b.type), `${b.id}: a ${t.label} where it may trade`);
}
const opened = chain.flatMap(c => c.st.opens.filter(e => e.k === "open")).length;
ok(opened >= 3, `the rules open businesses (${opened} in 16 days)`);

// ---- 4. closing and re-letting (a business forced into the red) --------------------------------------
{
  const st = clone(chain[chain.length - 1].st), plan = chain[chain.length - 1].plan;
  const b = st.biz.find(x => x.owner !== "shaun-white") || st.biz[0];
  b.profit = [-5, -5, -5, -5, 10, 10]; b.loss = 4;
  // nobody visits: today's takings are 0, a 5th losing day
  const empty = clone(plan);
  for (const [k, row] of Object.entries(empty.subjects)) empty.subjects[k] = [row[0], [24]];
  const d = st.day + 1, next = E.stepEnterprise(st, empty, people, d);
  ok(!next.biz.some(x => x.id === b.id), `${b.id}: 5 losing days of 7, CLOSED`);
  const c = next.closed.find(x => x.id === b.id);
  ok(c && c.closed === d && c.reason === "LOSSES", "the closure is on the register");
  ok(!E.rolesOf(next).has(b.owner) && b.staff.every(k => !E.rolesOf(next).has(k) || next.biz.some(x => x.staff.includes(k))), "the owner and the hands go back to their posts");
  SIM.setEnterprise({ [d]: E.simDay(next) });
  ok(SIM.schedule(people.get(b.owner), d).every(g => g.activity !== "work" || !b.units.includes(g.placeId)), "the owner's day is the assigned job again");
  ok(next.cool[b.owner] === d + E.COOLDOWN, "and waits before trying again");
  const blk = E.publicBlock(next, people);
  ok(b.units.every(u => blk.units[u].s === "CLOSED"), "the shop shows CLOSED the day it shuts");
  // re-let: not for RELET_DAYS, then open to the next licence
  ok(E.paLines(blk).some(l => l.includes("THE DEPARTMENT EXPECTED THIS")), "the PA reads the closure");
  const next2 = E.stepEnterprise(next, null, people, d + 1);
  ok(E.publicBlock(next2, people).units[b.units[0]].s === "TO LET", "then TO LET");
  SIM.clearEnterprise();
}

// ---- 5. bounded ------------------------------------------------------------------------------------
{
  const last = chain[chain.length - 1].st, blk = E.publicBlock(last, people);
  const bytes = JSON.stringify(blk).length;
  ok(bytes < 24 * 900 + 6000, `the published block is bounded by the units (${bytes} bytes)`);
  ok(blk.closed.length <= 12 && last.closed.length <= 24, "the closures kept are bounded");
  ok(Object.keys(blk.units).length === 24, "every unit is in the block");
  ok(Object.keys(last.streak).length < people.size * 0.4, `the streaks are only the entrepreneurs counting (${Object.keys(last.streak).length})`);
  for (const id of ["heights", "coast", "strip"]) ok(Math.abs(E.enterpriseMood(last, id)) <= 6, `${id}: the mood factor is bounded`);
}

// ---- 6. the builder carries it --------------------------------------------------------------------
{
  const { getStore } = await import("@netlify/blobs");
  globalThis.__blobs = new Map();
  SIM.clearPlans(); SIM.clearEnterprise();
  const store = () => getStore({ name: PL.STORE });
  const io = () => PL.planIo(store, { census: async () => roster, snapshots: async () => ({}), civic: async () => null });
  const ms = (day, hour = 0) => SIM.CITY_EPOCH + ((day - 1) * 24 + hour) * 60 * 60 * 1000 / SIM.DEFAULT_SCALE;
  const T = 400;
  await PL.buildPlans(ms(T, 5), io());
  const raw = (k) => globalThis.__blobs.get(PL.STORE)?.get(k)?.data ?? null;
  const m1 = raw(PL.MANIFEST), m2 = raw(PL.MANIFEST2);
  const days = Object.keys(m1.days).map(Number).sort((a, b) => a - b);
  const plans = days.map(d => raw(m1.days[d].key));
  ok(plans.every(p => p.ent?.v === E.ENT_V && p.ent.day === p.day), "every plan carries the day's enterprise state");
  ok(plans[0].ent.biz[0]?.owner === "shaun-white", "the first day built: LICENCE 0001");
  // the builder pins the ladder to the day it builds (SCALE_FROM, machine day 648); replay the step the same way
for (let i = 1; i < plans.length; i++) { SIM.setLadderDay(plans[i].day); try { eq(plans[i].ent, E.stepEnterprise(plans[i - 1].ent, plans[i - 1], new Map(roster.map(s => [SIM.keyOf(s), s])), plans[i].day), `day ${plans[i].day}: the chain steps from yesterday's plan`); } finally { SIM.setLadderDay(null); } }
  ok(raw(PL.ENT_LEDGER)?.day === days[days.length - 1], "the ledger holds the latest day");
  const sd = Object.keys(m2.days).map(Number)[0], e2 = m2.days[sd];
  const sum = raw(PL.partKey(sd, e2.ver, "summary"));
  ok(sum.enterprise?.v === E.ENT_V && sum.enterprise.biz.some(b => b.owner === "shaun-white"), "the summary publishes the register");
  ok(sum.sat && Object.values(sum.sat).every(r => r.length === 7), "the figures on file's satisfaction is in the summary");
  ok(Object.values(sum.civic.districts).every(x => typeof x.mood.f.enterprise === "number" && x.biz), "the civic fold has the shops and their mood factor");
  const w = raw(PL.partKey(sd, e2.ver, PL.windowPart("heights", 2, 0)));
  const entries = Object.values(w.subjects);
  ok(entries.length && entries.every(x => x.length === 3 && Array.isArray(x[2]) && x[2].length === 7), "every window row carries the subject's satisfaction");
  // a gap: the plans gone, the ledger carries the register on
  const s = globalThis.__blobs.get(PL.STORE);
  const led = raw(PL.ENT_LEDGER);
  for (const k of [...s.keys()]) if (k !== PL.ENT_LEDGER) s.delete(k);
  await PL.buildPlans(ms(T + 10, 5), io());
  const m1b = raw(PL.MANIFEST), firstB = Math.min(...Object.keys(m1b.days).map(Number));
  const pb = raw(m1b.days[firstB].key);
  ok(pb.ent.licences >= led.state.licences && pb.ent.biz.some(b => b.id === "0001"), "after a gap the register carries on from the ledger");
}

console.log(`check-enterprise: ${checks} checks ok. ${opened} openings in 16 days; ${low} of ${vals.length} working subjects under ${E.LOW_SAT} on day ${D0}.`);
