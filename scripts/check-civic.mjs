// The civic fold (src/city/civic.js, docs/CITY_SPEC.md "The civic fold"): per-district mood,
// the league and the council seats, folded once per machine day into the day's summary by the
// plan builder. Holds: the fold is deterministic (same inputs, same block); it chains from
// yesterday (the mood's `was` is yesterday's raw, the season's rosters ride the chain); a
// missing yesterday recomputed from its plan gives the block the chain would have; the
// standings are exactly the sum of the results, every result is the scoreboard's own final,
// every pair meets once a season, the playoffs follow the table; the Assembly's outcome is the
// Council's first act, and moves the mood only once the ground breaks; the block stays the same
// size per district from 430 to 20,000 subjects; the builder writes it into every summary.
// No network. Run: node scripts/check-civic.mjs [--no-20k]
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

globalThis.__blobs = new Map();
const blobsSrc = `
let n = 0;
export function getStore({ name }) {
  const m = globalThis.__blobs;
  if (!m.has(name)) m.set(name, new Map());
  const s = m.get(name);
  const read = (k, o) => (s.has(k) ? (o?.type === "text" ? JSON.stringify(s.get(k).data) : JSON.parse(JSON.stringify(s.get(k).data))) : null);
  return {
    async get(k, o) { return read(k, o); },
    async getWithMetadata(k, o) { return s.has(k) ? { data: read(k, o), etag: s.get(k).etag, metadata: {} } : null; },
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
const C = await import("../src/city/civic.js");
const PL = await import("../netlify/lib/plans.js");
const { synthRoster } = await import("./synth-roster.mjs");

let checks = 0;
const ok = (c, m) => { checks++; assert.ok(c, m); };
const eq = (a, b, m) => { checks++; assert.deepEqual(a, b, m); };
const DIST = SIM.DISTRICTS.map(d => d.id);
const clone = (x) => JSON.parse(JSON.stringify(x));
const peopleOf = (roster) => new Map(roster.map(s => [SIM.keyOf(s), s]));

// A season boundary sits inside the days checked: day 253 is season 10's first day.
const D0 = 250, DAYS = [D0, D0 + 1, D0 + 2, D0 + 3, D0 + 4];
ok(C.seasonOf(252) === 8 && C.seasonOf(253) === 9 && C.seasonStart(9) === 253, "season 10 starts on day 253");

// ---- 1. deterministic, chained, recomputable ---------------------------------------------------
const roster = synthRoster(430);
SIM.clearPlans(); SIM.clearSocialSnapshots(); SIM.setCivic(null);
SIM.setRoster(roster);
const plans = new Map(DAYS.map(d => [d, clone(SIM.buildPlan(d))]));
const people = peopleOf(roster);
const chain = new Map();
let prev = null;
for (const d of DAYS) { prev = C.civicFold(plans.get(d), people, prev); chain.set(d, prev); }
{
  const b = chain.get(D0 + 1);
  // same inputs (a fresh copy of the census, a fresh copy of the plan) -> the same block
  const again = C.civicFold(clone(plans.get(D0 + 1)), peopleOf(clone(roster)), clone(chain.get(D0)));
  eq(again, b, "deterministic: the same plan, census and yesterday fold to the same block");
  eq(clone(b), b, "the block is plain JSON");
  for (const id of DIST) {
    const m = b.districts[id].mood;
    ok(m.was === chain.get(D0).districts[id].mood.raw, `${id}: the mood's yesterday is yesterday's raw`);
    ok(m.s === Math.round(0.6 * m.raw + 0.4 * m.was), `${id}: score = 0.6 today + 0.4 yesterday`);
    ok(m.raw === Math.max(-100, Math.min(100, Object.values(m.f).reduce((a, x) => a + x, 0))), `${id}: raw is the sum of its factors`);
    ok(m.s >= -100 && m.s <= 100, `${id}: mood in range`);
    ok(b.districts[id].seat.status === "VACANT" && b.districts[id].seat.holder === null && b.districts[id].seat.approval === m.s, `${id}: the seat is vacant, approval is the mood`);
  }
  ok(DIST.some(id => b.districts[id].mood.raw !== b.districts[DIST[0]].mood.raw), "the districts do not all feel the same");
  // the rosters ride the chain within a season, and a new season drafts afresh
  for (const id of DIST) eq(chain.get(D0 + 2).districts[id].team.roster, chain.get(D0).districts[id].team.roster, `${id}: the season's roster is carried`);
  ok(chain.get(D0 + 3).league.season === chain.get(D0 + 2).league.season + 1 && chain.get(D0 + 3).league.day === 1, "day 253 opens a new season");
  // Missing yesterday: recomputed from its plan (prev null) gives the chained block.
  for (const d of DAYS.slice(1)) {
    const re = C.civicFold(plans.get(d), people, C.civicFold(plans.get(d - 1), people, null));
    eq(re, chain.get(d), `day ${d}: recomputing a missing yesterday from its plan equals the chain`);
  }
  // A census joining mid-season changes no roster until the next draft (the chain holds them).
  const grown = [...roster, ...synthRoster(600, { seed: 77 }).slice(430)];
  SIM.setRoster(grown);
  const pg = clone(SIM.buildPlan(D0 + 1));
  const bg = C.civicFold(pg, peopleOf(grown), chain.get(D0));
  for (const id of DIST) eq(bg.districts[id].team.roster, chain.get(D0).districts[id].team.roster, `${id}: a mid-season arrival waits for the draft`);
  SIM.setRoster(roster);
}

// ---- 2. the league: the table is the results, the results are the boards --------------------------
{
  const block = chain.get(D0 + 2);   // day 252: the season's last day
  const season = C.seasonOf(D0);
  const rating = Object.fromEntries(DIST.map(id => [id, block.districts[id].team.rating]));
  const all = C.seasonTo(season, C.seasonStart(season + 1), rating);
  const reg = all.filter(m => m.stage === "regular");
  ok(reg.length === C.REGULAR, `a full season plays ${C.REGULAR} league fixtures (got ${reg.length})`);
  const pairs = new Set(reg.map(m => [...m.sides].sort().join("|")));
  ok(pairs.size === C.REGULAR, "every pair of districts meets exactly once");
  for (const id of DIST) ok(reg.filter(m => m.sides.includes(id)).length === DIST.length - 1, `${id} plays every other district`);
  for (const m of all) {
    const fx = C.fixturesOn(m.day).find(f => f.k === m.k);
    ok(fx && fx.placeId === m.placeId && fx.from === m.from, `fixture ${m.k} is on the GAMES timetable`);
    eq(m.score, C.boardFinal(fx), `fixture ${m.k}: the result is the scoreboard's final`);
    if (m.kind !== "hoops") {
      const g = SIM.gameAt(m.placeId, (m.day - 1) * 24 + m.to - 1e-6);
      eq(m.score, g.score, `fixture ${m.k}: the board at the whistle shows the result`);
    }
  }
  // the table entering each day is the sum of every earlier result
  for (const d of [D0, D0 + 1, D0 + 2]) {
    const b = chain.get(d), t = C.tableOf(all.filter(m => m.day < d));
    for (const id of DIST) {
      const x = b.districts[id].team;
      eq([x.p, x.w, x.d, x.l, x.f, x.a, x.pts], [t[id].p, t[id].w, t[id].d, t[id].l, t[id].f, t[id].a, t[id].pts], `day ${d} ${id}: the standings are the sum of the results`);
      ok(x.pts === 3 * x.w + x.d && x.p === x.w + x.d + x.l, `day ${d} ${id}: points and games add up`);
    }
    eq(b.league.table, C.order(t), `day ${d}: the table's order`);
    ok(DIST.reduce((n, id) => n + b.districts[id].team.w, 0) === DIST.reduce((n, id) => n + b.districts[id].team.l, 0), `day ${d}: every win is someone's loss`);
    // the day's matches are the ones the season plays that day; tableAt(24) is tomorrow's table
    eq(b.league.today.map(m => m.k), all.filter(m => m.day === d).map(m => m.k), `day ${d}: today's fixtures`);
    if (C.seasonOf(d + 1) === season) {
      const next = chain.get(d + 1), at = C.tableAt(b, 24);
      for (const r of at) eq([r.pts, r.p, r.form], [next.districts[r.id].team.pts, next.districts[r.id].team.p, next.districts[r.id].team.form], `day ${d} ${r.id}: the table after today's whistles is tomorrow's`);
    }
  }
  // the playoffs: the top four, then the semi-final winners; the champion is the final's winner
  const final = C.order(C.tableOf(reg));
  const semis = all.filter(m => m.stage === "semi"), fin = all.find(m => m.stage === "final");
  ok(semis.length === 2 && fin, "two semi-finals and a final");
  eq(semis.map(m => [...m.sides].sort()), [[final[0], final[3]].sort(), [final[1], final[2]].sort()], "semi-finals: first v fourth, second v third");
  const win = (m) => (m.score[0] > m.score[1] ? m.sides[0] : m.score[1] > m.score[0] ? m.sides[1] : m.tiebreak);
  eq([...fin.sides].sort(), semis.map(win).sort(), "the final is between the semi-final winners");
  ok(chain.get(D0 + 3).league.champion === null, "a new season has no champion yet");
  const last = C.civicFold(plans.get(D0 + 2), people, chain.get(D0 + 1));
  ok(fin.day > D0 + 2 || last.league.champion === win(fin), "the champion is the final's winner once it is played");
  // better teams win more often, but not always
  const better = reg.filter(m => m.score[0] !== m.score[1]).map(m => rating[win(m)] >= rating[m.sides[0] === win(m) ? m.sides[1] : m.sides[0]]);
  ok(better.filter(Boolean).length > better.length / 2 && better.some(x => !x), `ratings count, luck too (${better.filter(Boolean).length}/${better.length} to the stronger side)`);
  // rosters: nine per team, athletes first, from the district's workforce
  for (const id of DIST) {
    const r = block.districts[id].team.roster;
    ok(r.length <= C.ROSTER_N && r.every(([key]) => SIM.assignJob(people.get(key)).district === id), `${id}: the roster is its own workforce`);
  }
  ok(C.teamName("sprawl") === "THE RETURNED" && DIST.every(id => C.TEAMS[id]), "every district has a team name");
}

// ---- 3. the Assembly: the Council's first act; the mood moves when the ground breaks --------------
{
  const closeAt = SIM.CITY_EPOCH + (D0 - 1) * 24 * 60 * 60 * 1000 / SIM.DEFAULT_SCALE + 3600 * 1000 / SIM.DEFAULT_SCALE;   // day D0, 01:00
  SIM.setCivic({ closeAt, winner: "farm" });
  const before = C.civicFold(plans.get(D0 + 3), people, null);
  ok(DIST.every(id => before.districts[id].seat.acts.length === 0 && before.districts[id].mood.f.assembly === 0), "before the ground breaks: no act, no effect (those days may be built before the close)");
  const breakDay = D0 + SIM.LOT_BREAK;
  const plan = clone(plans.get(D0 + 4)); plan.day = breakDay;
  const at = C.civicFold(plan, people, null);
  eq(at.districts.commons.seat.acts, [["A001", D0, "farm"]], "the Assembly's result is the Council's first act");
  ok(DIST.every(id => at.districts[id].seat.acts.length === 1), "recorded in every district's record");
  ok(at.districts.commons.mood.f.assembly > 0 && at.districts.finance.mood.f.assembly < 0, "a farm pleases the Commons and not the Meridian");
  SIM.setCivic({ closeAt, winner: "golf" });
  const g = C.civicFold(plan, people, null);
  ok(g.districts.commons.mood.f.assembly < 0 && g.districts.finance.mood.f.assembly > 0, "a course the reverse");
  SIM.setCivic(null);
}

// ---- 4. the size: per district, not per subject ---------------------------------------------------
const sizes = [];
for (const n of process.argv.includes("--no-20k") ? [430, 5000] : [430, 5000, 20000]) {
  const r = n === 430 ? roster : synthRoster(n, { rich: true });
  SIM.clearPlans(); SIM.setMemoCap(Math.max(200000, n * 60)); SIM.setRoster(r);
  const p = SIM.buildPlan(D0);
  const t = performance.now();
  const b = C.civicFold(p, peopleOf(r), null);
  const ms = performance.now() - t;
  const bytes = JSON.stringify(b).length;
  sizes.push([n, bytes, Math.round(ms)]);
  ok(bytes / DIST.length < 1100, `${n}: ${bytes} bytes, ${Math.round(bytes / DIST.length)} per district`);
}
ok(sizes[sizes.length - 1][1] < sizes[0][1] * 1.4, `the block does not grow with the census (${sizes.map(s => s[1]).join(" / ")} bytes)`);
SIM.setRoster(roster);

// ---- 5. the builder writes it into every summary, chained ---------------------------------------
{
  const { getStore } = await import("@netlify/blobs");
  const store = () => getStore({ name: PL.STORE });
  const census = roster.filter(s => s.engine || s.kind === "citizen");
  const io = () => PL.planIo(store, { census: async () => census, snapshots: async () => ({}), civic: async () => null });
  const ms = (day, hour = 0) => SIM.CITY_EPOCH + ((day - 1) * 24 + hour) * 60 * 60 * 1000 / SIM.DEFAULT_SCALE;
  globalThis.__blobs = new Map();
  const T = D0 + 1;
  await PL.buildPlans(ms(T, 5), io());
  const raw = (k) => globalThis.__blobs.get(PL.STORE)?.get(k)?.data ?? null;
  const m2 = () => raw(PL.MANIFEST2);
  const sum = (d) => raw(PL.partKey(d, m2().days[d].ver, "summary"));
  const days = Object.keys(m2().days).map(Number).sort((a, b) => a - b);
  ok(days.length === 3 && days.every(d => sum(d)?.civic?.v === C.CIVIC_V), `every split day's summary carries its civic block (${days})`);
  for (const d of days.slice(1)) for (const id of DIST) ok(sum(d).civic.districts[id].mood.was === sum(d - 1).civic.districts[id].mood.raw, `day ${d} ${id}: chained from yesterday's summary`);
  ok(days.every(d => JSON.stringify(sum(d).civic).length < 1100 * DIST.length), "the summary's civic block stays small");
  // Yesterday's summary lost, today re-split: recomputed from yesterday's plan, the same block.
  const d = days[2], want = sum(d).civic;
  const s = globalThis.__blobs.get(PL.STORE);
  s.delete(PL.partKey(d - 1, m2().days[d - 1].ver, "summary"));
  for (const k of [...s.keys()]) if (k.startsWith(`f2/day/${d}/`)) s.delete(k);
  const m = s.get(PL.MANIFEST2); delete m.data.days[d];
  await PL.buildPlans(ms(T, 6), io());
  eq(sum(d).civic, want, `day ${d}: re-split without yesterday's summary, the block is the chained one`);
}

console.log(`check-civic: ${checks} checks passed. civic block bytes by roster: ${sizes.map(([n, b, t]) => `${n}: ${b} B (${Math.round(b / DIST.length)}/district, fold ${t} ms)`).join("; ")}`);
