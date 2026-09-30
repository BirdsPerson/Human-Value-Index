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
const DIST = SIM.LOOP_DISTRICTS.map(d => d.id);   // the league's ten
const ALL = SIM.DISTRICTS.map(d => d.id);          // every district has a mood and a seat
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
  ok(Object.keys(b.districts).length === ALL.length && SIM.DISTRICTS.filter(d => d.expansion).every(d => b.districts[d.id].mood && b.districts[d.id].seat && b.districts[d.id].team.pos === null && !b.league.table.includes(d.id)), "the Coast and the Heights have a mood and a seat, and sit outside the league (drawn before they were built)");
  for (const id of ALL) {
    const m = b.districts[id].mood;
    ok(m.was === chain.get(D0).districts[id].mood.raw, `${id}: the mood's yesterday is yesterday's raw`);
    ok(m.s === (Math.round(0.6 * m.raw + 0.4 * m.was) || 0), `${id}: score = 0.6 today + 0.4 yesterday`);
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

// ---- 3b. THE DRAFT: league-wide from season 12, reverse order, snake, balanced ------------------------
{
  ok(C.seasonStart(C.DRAFT_FROM) === 309 && C.DRAFT_FROM === 11, "the first league-wide draft opens season 12, machine day 309");
  const E0 = 307, EDAYS = [307, 308, 309, 310, 336, 337];
  SIM.clearPlans(); SIM.setRoster(roster);
  const P2 = new Map(EDAYS.map(d => [d, clone(SIM.buildPlan(d))]));
  const ch = new Map();
  let pv = null;
  for (const d of EDAYS) { pv = C.civicFold(P2.get(d), people, ch.has(d - 1) ? ch.get(d - 1) : null); ch.set(d, pv); }
  const n = DIST.length, subjects = Object.keys(P2.get(309).subjects).map(k => people.get(k));
  // season 11 still plays the old draft: its workforce, not mid-season
  for (const id of DIST) ok(ch.get(308).districts[id].team.roster.every(([k]) => SIM.assignJob(people.get(k)).district === id), `${id}: season 11 keeps its workforce roster (no mid-season draft)`);
  ok(!ch.get(308).league.draft, "no draft record before season 12");
  const b = ch.get(309), dr = b.league.draft, last = ch.get(308).league;
  ok(dr && dr.season === 12 && b.league.day === 1, "draft day: season 12, day 1");
  // the order: last season's table reversed, the champion last
  const wantOrder = C.draftOrder(last.table, last.champion);
  eq(dr.order, wantOrder, "the draft order is the reverse of last season's table");
  if (last.champion) ok(dr.order[n - 1] === last.champion, "the champion picks last");
  const rest = dr.order.filter(id => id !== last.champion);
  eq(rest, [...last.table].reverse().filter(id => id !== last.champion), "the worst team picks first");
  // the snake: every pick the best left, in snake order (a capped trade swaps one round's picks)
  const pool = C.draftPool(subjects);
  ok(pool.length === n * C.ROSTER_N, `the pool is ${n} x ${C.ROSTER_N}`);
  const tradedRounds = new Map(dr.trades.map(([r, a, x]) => [`${r}|${a}`, x]).concat(dr.trades.map(([r, a, x]) => [`${r}|${x}`, a])));
  for (let r = 0; r < C.ROSTER_N; r++) for (let p = 0; p < n; p++) {
    const team = C.snakeTeam(dr.order, r, p);
    ok(team === dr.order[r % 2 ? n - 1 - p : p], "snake: odd rounds run in reverse");
    const holder = tradedRounds.get(`${r}|${team}`) || team;
    eq(b.districts[holder].team.roster[r][0], pool[r * n + p].key, `round ${r + 1} pick ${p + 1}: ${team} takes the best player left`);
  }
  const keys = DIST.flatMap(id => b.districts[id].team.roster.map(x => x[0]));
  ok(new Set(keys).size === keys.length && keys.length === n * C.ROSTER_N, "every player drafted once, nine per team");
  ok(pool.filter(x => x.g === 2).every(x => keys.includes(x.key)), "athletes go first: every athlete on record is drafted");
  ok(DIST.some(id => b.districts[id].team.roster.some(([k]) => SIM.assignJob(people.get(k)).district !== id)), "a player plays for the team that drafted them, not where they work");
  // deterministic, and a broken chain drafts the same league (from the season number and the census)
  eq(C.civicFold(clone(P2.get(309)), peopleOf(clone(roster)), clone(ch.get(308))), b, "draft day is deterministic");
  eq(C.civicFold(P2.get(309), people, null).districts.arts.team.roster, b.districts.arts.team.roster, "draft day without yesterday: the same draft");
  for (const id of DIST) eq(C.civicFold(P2.get(310), people, null).districts[id].team.roster, ch.get(310).districts[id].team.roster, `${id}: mid-season without yesterday, the same drafted roster`);
  eq(ch.get(310).league.draft, dr, "the draft record rides the chain all season");
  // season 13 drafts again, from season 12's end; the chain and the recompute agree
  const b13 = ch.get(337);
  ok(b13.league.draft.season === 13, "season 13 has its own draft");
  eq(C.civicFold(P2.get(337), people, null).league.draft, b13.league.draft, "season 13's draft from the census alone equals the chain's");
  // balance: the rating spread across teams, before (the workforce) and after (the draft)
  const spread = (r) => { const m = DIST.map(id => C.teamRating(r[id])); return Math.max(...m) - Math.min(...m); };
  const before = spread(C.workforceDraft(subjects)), after = spread(Object.fromEntries(DIST.map(id => [id, b.districts[id].team.roster])));
  ok(after < before && after <= C.CAP_GAP + 1, `the draft balances the league: spread ${before} -> ${after}`);
  globalThis.__draftSpread = [before, after];
  // the results are still the scoreboards' finals; the standings still the sum of the results
  const rating = Object.fromEntries(DIST.map(id => [id, b.districts[id].team.rating]));
  const all = C.seasonTo(C.seasonOf(309), 311, rating);
  for (const m of all) eq(m.score, C.boardFinal(C.fixturesOn(m.day).find(f => f.k === m.k)), `season 12 fixture ${m.k}: the scoreboard's final`);
  const t = C.tableOf(all.filter(m => m.day < 310));
  for (const id of DIST) ok(ch.get(310).districts[id].team.pts === t[id].pts, `${id}: season 12 standings are the sum of its results`);
  // THE COMMISSIONER'S CAP: a pool with a few stars leaves the snake a gap; trades close it
  const stars = Array.from({ length: n * C.ROSTER_N }, (_, i) => ({ key: `p${String(i).padStart(3, "0")}`, name: `P${i}`, r: i < 3 ? 99 : Math.max(20, 70 - i), g: 2 }));
  const snakeOnly = (() => { const ros = Object.fromEntries(DIST.map(id => [id, []])); let i = 0; for (let r = 0; r < C.ROSTER_N; r++) for (let p = 0; p < n; p++) ros[C.snakeTeam(DIST, r, p)].push([stars[i].key, "", stars[i++].r]); return ros; })();
  const mean = (l) => l.reduce((x, p) => x + p[2], 0) / l.length;
  const gap = (ros) => Math.max(...DIST.map(id => mean(ros[id]))) - Math.min(...DIST.map(id => mean(ros[id])));
  const capped = C.snakeDraft(stars, DIST);
  ok(gap(snakeOnly) > C.CAP_GAP && capped.trades.length > 0 && capped.trades.length <= C.MAX_TRADES, `the cap trades when the snake leaves a gap (${gap(snakeOnly).toFixed(1)} -> ${gap(capped.rosters).toFixed(1)}, ${capped.trades.length} trades)`);
  ok(gap(capped.rosters) < gap(snakeOnly), "every trade narrows the gap");
  for (const [r, a, x] of capped.trades) ok(capped.rosters[a][r][2] <= capped.rosters[x][r][2], "a trade sends the stronger team's pick of a round to the weaker");
  globalThis.__capDemo = [gap(snakeOnly), gap(capped.rosters), capped.trades.length];
}

// ---- 3c. COUNCIL ELECTIONS: the slate, the Substrate, the ballots, the seats ----------------------------
{
  const K = await import("../src/city/council.js");
  const EL = await import("../netlify/lib/elections.js");
  const { FAMOUS_FIGURES, slugify } = await import("../src/figures.js");
  SIM.setRoster(roster);
  const sl = K.slate(roster), sl2 = K.slate(clone(roster));
  eq(sl, sl2, "the slate is deterministic");
  const all = DIST.flatMap(id => sl[id].map(c => c.key));
  ok(new Set(all).size === all.length, "nobody stands in two races");
  for (const id of DIST) {
    ok(sl[id].length >= K.MIN_CANDIDATES && sl[id].length <= K.MAX_CANDIDATES, `${id}: ${sl[id].length} candidates (2-3)`);
    for (const c of sl[id]) {
      const s = people.get(c.key);
      ok(K.mayStand(s), `${c.key}: a figure on file, never a citizen, local official or real candidate`);
      const SIMjob = SIM.assignJob(s).district, home = SIM.PLACES[SIM.homeOf(s)].district;
      ok(SIMjob === id || home === id, `${c.key}: works or lives in ${id}`);
    }
  }
  ok(DIST.some(id => sl[id].some(c => c.field)), "the driven stand first (politics, activism, business)");
  ok(all.some(k => SIM.isDead(people.get(k))) && all.some(k => !SIM.isDead(people.get(k))), "living and dead both stand");
  // no quotes for the living, anywhere: living candidates carry no platform, and nothing filed
  // for anyone puts words in their mouth; platforms are only for the dead
  const quoteRe = /["“”«»]|\b(SAYS|SAID|STATES|STATED|PROMISES|PROMISED|VOWS|VOWED|DECLARES|DECLARED)\b/i;
  for (const c of DIST.flatMap(id => sl[id])) {
    if (c.living) ok(c.platform === null, `${c.key}: a living candidate has no platform, only filings`);
    for (const line of c.filing) ok(!quoteRe.test(line), `${c.key}: the filing quotes nobody`);
    if (c.platform) ok(!/["“”]/.test(c.platform), `${c.key}: a platform is a reconstruction, not a quotation`);
  }
  const fam = new Map(FAMOUS_FIGURES.map(f => [slugify(f.name), f]));
  for (const [k, line] of Object.entries(K.PLATFORMS)) {
    const s = people.get(k) || fam.get(k);
    ok(!s || SIM.isDead(s), `${k}: platforms are only for the dead`);
    ok(typeof line === "string" && line.length < 160 && !/["“”]/.test(line), `${k}: one short line, no quotation marks`);
  }
  const EC = await import("../src/elections/content.js");
  for (const line of [...EC.NOTICE, ...EC.RULES, EC.BLURB, EC.CHAIR.closed, EC.CHAIR.none, EC.CHAIR.open(10), ...Object.values(EC.WRITEIN).map(x => (typeof x === "function" ? x("Subject ABCD") : x)), EC.SEAT.elected("Subject ABCD", "The Works"), EC.SEAT.term(1, 2, true), EC.SEAT.confirm, EC.SEAT.done("X")]) ok(!/[“”]|\\"/.test(line) && !line.includes('"'), "no quotation marks on the page");
  const cand = K.candidateOf({ name: "Living Test", slug: "living-test", kind: "figure", score: 500, qualifier: "politician" }, "hq");
  ok(cand.living && cand.platform === null, "a living candidate never speaks, even one with a written line elsewhere");
  // the Substrate: deterministic, advisory
  const npc = K.substrateVotes(roster, sl);
  eq(K.substrateVotes(clone(roster), sl), npc, "the Substrate's votes are deterministic");
  for (const id of DIST) ok(npc[id].votes.reduce((a, x) => a + x, 0) + npc[id].abstain === npc[id].voters, `${id}: every registered figure votes or abstains`);
  ok(DIST.some(id => npc[id].voters > 0), "the Substrate votes");

  // ballots in memory: players decide, one per case per race
  const { getStore } = await import("@netlify/blobs");
  globalThis.__blobs = new Map();
  const store = getStore({ name: EL.STORE });
  const cases = new Map(), lim = new Map();
  const io = {
    store, census: async () => roster,
    getCase: async (id) => cases.get(id) || null,
    hitLimit: async (key, max) => { const x = (lim.get(key) || 0) + 1; if (x > max) return { ok: false }; lim.set(key, x); return { ok: true }; },
  };
  const t0 = Date.UTC(2026, 9, 1);
  for (let i = 0; i < 400; i++) cases.set(`HVI-T${String(i).padStart(7, "0")}`, { history: [{ score: 1 }] });
  cases.set("HVI-UNASSESS", { history: [] });
  const v0 = await EL.publicView(io, t0);
  ok(v0.state === "open" && v0.cycle === 1 && v0.closeAt - v0.openAt === K.ELECTION_MS, "the first GET opens cycle 1 for three real days");
  eq(v0.races.hq.candidates, K.slate(roster).hq, "the stored slate is the census's");
  eq(v0.races.hq.npc, K.substrateVotes(roster, K.slate(roster)).hq, "the stored advisory vote is the Substrate's");
  const cast = (i, district, candidate, extra = {}) => EL.castBallot(io, { caseId: `HVI-T${String(i).padStart(7, "0")}`, district, candidate, ip: `ip${Math.floor(i / 4)}`, device: (i.toString(16).padStart(2, "0") + "a".repeat(30)), now: t0 + 1000, ...extra });
  // the race the Substrate leans one way; the players vote the other way
  const race = DIST.find(id => sl[id].length >= 2 && npc[id].votes.some(x => x > 0));
  const nPick = K.substratePick(npc[race]), other = nPick === 0 ? 1 : 0;
  let r = await cast(0, race, sl[race][other].key);
  ok(r.status === 200 && r.body.mine[race] === other, "a ballot is cast");
  r = await cast(0, race, sl[race][other].key);
  ok(r.status === 200 && r.body.unchanged, "the same ballot again changes nothing");
  r = await cast(0, race, sl[race][nPick].key);
  ok(r.status === 200 && r.body.changed, "a ballot can be changed");
  r = await cast(0, race, sl[race][other].key);
  let t = await EL.readTally(store, 1, race);
  ok(Object.keys(t.seen).length === 1 && EL.countsOf(t.seen, sl[race].length).voters === 1, "one ballot per case per race, however often it changes");
  const racesOf = (await store.get(EL.KEYS.voter(1, EL.voterKey("HVI-T0000000")), { type: "json" })).b;
  ok(Object.keys(racesOf).length === 1, "the file's ballot is keyed by race");
  const second = DIST.find(id => id !== race && sl[id].length);
  r = await cast(0, second, sl[second][0].key);
  ok(r.status === 200 && Object.keys(r.body.mine).length === 2, "one ballot in each race: a second race takes its own");
  r = await EL.castBallot(io, { caseId: "HVI-UNASSESS", district: race, candidate: sl[race][0].key, ip: "ipx", now: t0 + 1000 });
  ok(r.status === 403, "an unassessed file does not vote");
  r = await cast(1, race, "someone-else");
  ok(r.status === 400, "a name not on the slate is not a candidate (write-ins go through the picker)");
  r = await cast(1, "nowhere", sl[race][0].key);
  ok(r.status === 400, "no such race");
  // limits: four files per address, two per device
  const ipCase = (i) => EL.castBallot(io, { caseId: `HVI-T${String(i).padStart(7, "0")}`, district: race, candidate: sl[race][other].key, ip: "shared", device: null, now: t0 + 1000 });
  const outs = [];
  for (const i of [100, 101, 102, 103, 104]) outs.push((await ipCase(i)).status);
  eq(outs, [200, 200, 200, 200, 429], "four files per address");
  const devCase = (i) => EL.castBallot(io, { caseId: `HVI-T${String(i).padStart(7, "0")}`, district: race, candidate: sl[race][other].key, ip: `solo${i}`, device: "f".repeat(32), now: t0 + 1000 });
  eq([(await devCase(110)).status, (await devCase(111)).status, (await devCase(112)).status], [200, 200, 429], "two files per device");
  // withdraw: the tally drops it, and a file with no ballot left gives its place back
  r = await ipCase(103);
  r = await EL.castBallot(io, { caseId: "HVI-T0000103", district: race, candidate: null, ip: "shared", device: null, now: t0 + 1000 });
  ok(r.status === 200 && r.body.withdrawn && !(race in r.body.mine), "a ballot can be withdrawn");
  ok((await ipCase(104)).status === 200, "a withdrawn file's place on its address goes back");
  // concurrent ballots: the tally equals the ballots
  const conc = await Promise.all(Array.from({ length: 120 }, (_, k) => cast(200 + k, race, sl[race][other].key)));
  ok(conc.every(x => x.status === 200), "120 concurrent ballots all land");
  await EL.heal(store, 1, { now: t0 + 2000 });
  t = await EL.readTally(store, 1, race);
  const counted = EL.countsOf(t.seen, sl[race].length);
  ok(counted.voters === 1 + 4 + 2 + 120 && counted.votes[other] === counted.voters, `the tally equals the ballots (${counted.voters})`);
  // the close: players decide; a race nobody voted in adopts the Substrate's preference
  const closeAt = v0.closeAt;
  r = await cast(300, race, sl[race][other].key, { now: closeAt + 1 });
  ok(r.status === 403 && r.body.closed, "closed after the deadline");
  const res = await EL.finalize(store, await store.get(EL.KEYS.meta(1), { type: "json" }), closeAt + 5);
  ok(res.races[race].by === "players" && res.races[race].winner === other && other !== nPick, "players decide, against the Substrate's lean");
  const quiet = DIST.find(id => id !== race && id !== second && sl[id].length);
  ok(res.races[quiet].by === "substrate" && res.races[quiet].winner === K.substratePick(npc[quiet]) && res.races[quiet].notice === K.ADOPTED, "no players: the Substrate's preference is adopted, with the notice");
  eq(await EL.finalize(store, await store.get(EL.KEYS.meta(1), { type: "json" }), closeAt + 9999), res, "the result is decided once");
  eq(K.decideRace([2, 2, 0], 4, { votes: [1, 9, 0] }), { winner: 1, by: "players", tie: true }, "a players' tie goes to the Substrate's lean");
  // the seats: held from SEAT_LAG machine days after the close, for a term, then the next cycle
  const rec = await EL.seatRecord(store, closeAt + 10);
  ok(rec.length === 1 && rec[0].seats[race].key === sl[race][other].key, "the seat record carries the winners");
  const sd = K.seatDayOf(closeAt);
  C.setSeats(rec);
  SIM.clearPlans(); SIM.setRoster(roster);
  const pBefore = clone(SIM.buildPlan(sd - 1)), pAt = clone(SIM.buildPlan(sd));
  const before = C.civicFold(pBefore, people, null), at = C.civicFold(pAt, people, null);
  ok(DIST.every(id => before.districts[id].seat.status === "VACANT"), "vacant until the winners are sworn in (days built before the close stay true)");
  const seat = at.districts[race].seat;
  ok(seat.status === "HELD" && seat.holder === sl[race][other].key && seat.by === "players" && seat.approval === at.districts[race].mood.s, "the seat is held; approval is the mood");
  eq(seat.term, [sd, sd + K.TERM_DAYS - 1], `a term is ${K.TERM_DAYS} machine days (${K.TERM_SEASONS} seasons, 7 real days)`);
  ok(at.districts[quiet].seat.by === "substrate", "a substrate seat is marked as such");
  ok(Math.abs(K.TERM_MS - 7 * 24 * 3600 * 1000) < 1, "a term is exactly one real week");
  // the next cycle: opens a term after the first, the incumbent stands again, closes as the term ends
  const v2 = await EL.publicView(io, v0.openAt + K.TERM_MS + 1000);
  ok(v2.cycle === 2 && v2.state === "open" && v2.races[race].candidates.some(c => c.key === sl[race][other].key && c.incumbent), "re-election: cycle 2 opens a term later, the incumbent stands");
  ok(K.seatDayOf(v2.closeAt) === sd + K.TERM_DAYS, "the next council is sworn in the day the term ends");
  C.setSeats([]);
}

// ---- 3d. WRITE-INS: the picker's scope, the exclusions, one ballot per race, the board, the winner ------
{
  const K = await import("../src/city/council.js");
  const EL = await import("../netlify/lib/elections.js");
  const IN = await import("../netlify/lib/intake.js");
  const { getStore } = await import("@netlify/blobs");
  SIM.setRoster(roster);
  const sl = K.slate(roster), npc = K.substrateVotes(roster, sl);
  const onSlate = new Set(DIST.flatMap(id => sl[id].map(c => c.key)));
  // the exclusions: figures from the pool, each given one reason to be closed
  const base = roster.filter(s => K.mayStand(s) && !onSlate.has(SIM.keyOf(s)) && !s.died && s.breakdown && !IN.effectivelyGated(s.breakdown) && !IN.seriousHarm(s.breakdown));
  const flags = {
    gated: { harmReview: { decision: "gate", note: "" } }, pending: { harmReviewPending: true }, serious: { breakdown: { ...base[0].breakdown, threat: 95 } },
    withheld: { underReview: true, breakdown: null }, candidate: { candidate: true }, official: { localOfficial: true }, nodangle: { noDangle: true }, closed: {},
  };
  const bad = Object.fromEntries(Object.entries(flags).map(([why, f], i) => [why, { ...base[i + 1], ...f }]));
  ok(IN.seriousHarm(bad.serious.breakdown), "the serious-cap stand-in is serious harm");
  const badKeys = new Set(Object.values(bad).map(s => SIM.keyOf(s)));
  const roster2 = roster.map(s => Object.values(bad).find(b => SIM.keyOf(b) === SIM.keyOf(s)) || s);
  const closed = new Set([SIM.keyOf(bad.closed)]);
  const meta = { cycle: 1, slate: sl };
  const pool = EL.writeinPool(roster2, meta, closed);
  const citizens = roster2.filter(s => s.kind === "citizen").map(s => SIM.keyOf(s));
  for (const id of DIST) {
    for (const s of pool.byDistrict[id]) {
      const k = SIM.keyOf(s);
      ok(EL.districtsOf(s).includes(id), `${k}: in ${id}'s picker because it lives or works there`);
      ok(!onSlate.has(k) && !badKeys.has(k) && s.kind !== "citizen", `${k}: not on a slate, not closed, not a citizen`);
    }
  }
  ok(DIST.every(id => pool.byDistrict[id].length > 0), "every race has write-ins to pick from");
  for (const [why, s] of Object.entries(bad)) {
    const k = SIM.keyOf(s);
    for (const id of EL.districtsOf(s)) {
      ok(EL.writeinFor(pool, id, k) === null, `${why}: refused as a write-in in its own district`);
      ok(!EL.writeinSearch(pool, id, s.name).some(h => h.key === k), `${why}: never offered by the picker`);
    }
  }
  const other = citizens[0];
  ok(DIST.every(id => EL.writeinFor(pool, id, other) === null), "another player's citizen is never a write-in");
  ok(DIST.every(id => EL.writeinFor(pool, id, sl[id][0].key) === null), "a listed candidate is not a write-in (they are on the ballot)");
  // search: type-ahead, accents off, scoped to the race
  const accented = roster2.find(s => /[^\x00-\x7f]/.test(s.name) && pool.byDistrict[EL.districtsOf(s)[0]]?.includes(s));
  if (accented) {
    const id = EL.districtsOf(accented)[0], plain = accented.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    ok(EL.writeinSearch(pool, id, plain.slice(0, 4)).some(h => h.key === SIM.keyOf(accented)), `accent-insensitive type-ahead: ${plain.slice(0, 4)} finds ${accented.name}`);
  }
  const outside = DIST.find(id => !pool.byDistrict[id].some(s => SIM.keyOf(s) === SIM.keyOf(pool.byDistrict.hq[0] || {})));
  const hq0 = pool.byDistrict.hq[0];
  if (hq0 && outside) ok(EL.writeinFor(pool, outside, SIM.keyOf(hq0)) === null && !EL.writeinSearch(pool, outside, hq0.name).some(h => h.key === SIM.keyOf(hq0)), "the picker is scoped to the race's district");
  // yourself: a player may run, where its citizen lives or works; a harm-flagged file may not
  const SELF = "HVI-W000ABCD", rec = { history: [{ score: 520, tier: "ORDINARY", breakdown: base[0].breakdown }] };
  const me = EL.selfWriteIn(pool, SELF, rec);
  ok(me && me.key === "citizen-abcd" && me.name === "Subject ABCD" && me.districts.length >= 1, "your own citizen: SUBJECT and its tag");
  const home = me.districts[0], away = DIST.find(id => !me.districts.includes(id));
  ok(EL.writeinFor(pool, home, me.key, me)?.key === me.key && EL.writeinSearch(pool, home, "subject abcd", me)[0]?.self, "yourself: offered and accepted where you live or work");
  ok(!away || EL.writeinFor(pool, away, me.key, me) === null, "yourself: not in a district you neither live nor work in");
  ok(EL.selfWriteIn(pool, SELF, { history: [{ breakdown: bad.serious.breakdown }] }) === null && EL.selfWriteIn(pool, SELF, { history: [] }) === null, "yourself: never with a harm finding, never unassessed");

  // ballots in memory
  globalThis.__blobs = new Map();
  const store = getStore({ name: EL.STORE });
  const cases = new Map(), lim = new Map();
  const io = {
    store, census: async () => roster2, writeins: async () => pool,
    getCase: async (id) => cases.get(id) || null,
    hitLimit: async (key, max) => { const x = (lim.get(key) || 0) + 1; if (x > max) return { ok: false }; lim.set(key, x); return { ok: true }; },
  };
  const t0 = Date.UTC(2026, 10, 1);
  const cid = (i) => `HVI-X${String(i).padStart(7, "0")}`;
  for (let i = 0; i < 60; i++) cases.set(cid(i), { history: [{ score: 500, tier: "ORDINARY" }] });
  cases.set(SELF, rec);
  const v0 = await EL.publicView(io, t0);
  const race = DIST.find(id => id !== home && sl[id].length && pool.byDistrict[id].length >= 2), cands = v0.races[race].candidates;
  const figs = pool.byDistrict[race].map(s => SIM.keyOf(s));
  const [wA, wB] = figs;
  const vote = (i, o, district = race) => EL.castBallot(io, { caseId: typeof i === "string" ? i : cid(i), district, ip: `wip${i}`, device: null, now: t0 + 1000, candidate: null, ...o });
  // live cycle untouched: a ballot in the old shape counts as it did
  eq(EL.countsOf({ a: [1, 0], b: [2, 1], c: [3, -1] }, 2), { votes: [1, 1], voters: 2, writeins: {} }, "old tallies count the same");
  let r = await vote(0, { candidate: cands[0].key });
  ok(r.status === 200 && r.body.mine[race] === 0, "a listed ballot");
  r = await vote(0, { writein: wA });
  ok(r.status === 200 && r.body.changed && r.body.mine[race] === wA && r.body.mineWrite[race].key === wA, "changed to a write-in: the same ballot");
  r = await vote(0, { writein: wA });
  ok(r.status === 200 && r.body.unchanged, "the same write-in again changes nothing");
  let t = await EL.readTally(store, 1, race);
  let c = EL.countsOf(t.seen, cands.length);
  ok(Object.keys(t.seen).length === 1 && c.voters === 1 && c.writeins[wA] === 1 && c.votes.every(x => x === 0), "one ballot per race per case, listed or write-in");
  r = await vote(0, { candidate: cands[0].key, writein: wA });
  ok(r.status === 400, "one name per ballot");
  r = await vote(1, { writein: SIM.keyOf(bad.gated) });
  ok(r.status === 400 && r.body.error === EL.WRITEIN_REFUSED, "a closed file: refused, neutrally");
  r = await vote(1, { writein: other });
  ok(r.status === 400 && r.body.error === EL.WRITEIN_REFUSED, "another player's citizen: refused, the same words");
  r = await vote(1, { writein: "free text name" });
  ok(r.status === 400 && r.body.error === EL.WRITEIN_REFUSED, "free text is not a subject");
  r = await vote(1, { writein: cands[1].key });
  ok(r.status === 200 && r.body.mine[race] === 1, "a write-in of a listed candidate is a vote for them");
  // the board: named at WRITEIN_SHOW ballots, a number below
  await vote(2, { writein: wA });
  let v = await EL.publicView(io, t0 + 2000);
  ok(v.races[race].writeins.length === 0 && v.races[race].writeinOther === 2, "below the threshold: counted, shown only as a number");
  await vote(3, { writein: wA });
  v = await EL.publicView(io, t0 + 3000);
  const wa = v.races[race].writeins.find(w => w.key === wA);
  ok(wa && wa.votes === 3 && v.races[race].writeinOther === 0 && v.races[race].voters === 4, `at ${EL.WRITEIN_SHOW} ballots it joins the board`);
  ok(wa.living ? wa.platform === null : true, "a living write-in has no statement");
  ok(!JSON.stringify(v).includes('"seen"') && !JSON.stringify(v).includes('"order"'), "the public view carries no voter list and no hidden ranking");
  // withdraw a write-in: the tally drops it
  r = await vote(3, { writein: null });
  ok(r.status === 200 && r.body.withdrawn && !(race in r.body.mine), "a write-in ballot can be withdrawn");
  await vote(3, { writein: wA });
  await vote(14, { writein: wB });
  // yourself: only your own file can write your citizen in (other players' files are closed)
  r = await vote(SELF, { writein: me.key }, home);
  ok(r.status === 200 && r.body.mine[home] === me.key, "a player writes itself in");
  r = await vote(15, { writein: me.key }, home);
  ok(r.status === 400 && r.body.error === EL.WRITEIN_REFUSED, "nobody else can write a player's citizen in");
  // a quiet race with only a write-in ballot: players still decide (the Substrate never writes in)
  const quiet = DIST.find(id => id !== race && id !== home && sl[id].length && pool.byDistrict[id].length);
  const qk = SIM.keyOf(pool.byDistrict[quiet][0]);
  r = await EL.castBallot(io, { caseId: cid(20), district: quiet, writein: qk, ip: "q", device: null, now: t0 + 1000 });
  ok(r.status === 200, "a lone write-in ballot");
  const silent = DIST.find(id => id !== race && id !== quiet && id !== home && sl[id].length);
  // the winner
  eq(K.decideRace([1, 0], 3, { votes: [5, 1] }, { x: 2 }), { winner: "x", by: "players", tie: false }, "a write-in with the most ballots wins");
  eq(K.decideRace([2, 0], 4, { votes: [0, 9] }, { x: 2 }), { winner: 0, by: "players", tie: true }, "a tie with a write-in goes to the Substrate's lean (a write-in has none)");
  eq(K.decideRace([0, 0], 0, { votes: [1, 7] }, {}), { winner: 1, by: "substrate", tie: false }, "no player ballots: the Substrate's preference among the listed");
  eq(K.rankRace([0, 0], 0, { votes: [1, 7] }, { x: 4 }), [1, 0], "the Substrate's ranking ignores write-ins");
  const meta1 = await store.get(EL.KEYS.meta(1), { type: "json" });
  const res = await EL.finalize(store, meta1, v0.closeAt + 5);
  const rb = res.races[race];
  ok(rb.writein && rb.key === wA && rb.winner === null && rb.by === "players" && rb.writeins[0].key === wA && rb.writeinOther === 1, "a write-in with the most ballots wins; the one below the threshold stays a number");
  const rr = res.races[home];
  ok(rr.writein && rr.key === me.key && rr.winner === null && rr.by === "players", "the player's citizen wins as a write-in");
  ok(rr.name === "Subject ABCD" && rr.order[0][0] === me.key, "the winner is SUBJECT and its tag");
  ok(res.races[quiet].by === "players" && res.races[quiet].key === qk, "a race with only write-in ballots is decided by the players");
  ok(res.races[silent].by === "substrate" && res.races[silent].key === sl[silent][K.substratePick(npc[silent])].key, "a race with no ballots: the Substrate's pick among the listed");
  const vr = await EL.publicView(io, v0.closeAt + 10);
  const blob = JSON.stringify(vr) + JSON.stringify(await EL.seatRecord(store, v0.closeAt + 10));
  ok(!blob.includes(SELF) && !blob.includes(SELF.slice(4)) && !blob.includes(EL.voterKey(SELF)), "the citizen winner never shows its case number or voter key");
  ok(vr.races[home].result.key === me.key && !("order" in vr.races[home].result), "the public result names the winner, not the ranking");
  let rec1 = await EL.seatRecord(store, v0.closeAt + 10);
  ok(rec1[0].seats[home].key === me.key && rec1[0].seats[home].name === "Subject ABCD", "the seat record seats the citizen");
  const sd = K.seatDayOf(v0.closeAt);
  C.setSeats(rec1); SIM.clearPlans(); SIM.setRoster(roster2);
  const at = C.civicFold(clone(SIM.buildPlan(sd)), peopleOf(roster2), null);
  ok(at.districts[home].seat.holder === me.key && at.districts[home].seat.status === "HELD" && at.districts[home].seat.name === "Subject ABCD", "the citizen holds the seat (sash and chamber read seat.holder)");
  eq(at.districts[home].seat.term, [sd, sd + K.TERM_DAYS - 1], "the same term as anyone");
  // MY FILE: the seat is yours; declining hands it to the runner-up
  let mine = await EL.mySeats(store, SELF, v0.closeAt + 10);
  ok(mine.length === 1 && mine[0].district === home && mine[0].name === "Subject ABCD" && !mine[0].sworn, "MY FILE shows the seat won");
  ok((await EL.resignSeat(io, { caseId: cid(0), cycle: 1, district: home, ip: "z", now: v0.closeAt + 20 })).status === 403, "only the holder may decline");
  r = await EL.resignSeat(io, { caseId: SELF, cycle: 1, district: home, ip: "z", now: v0.closeAt + 20 });
  ok(r.status === 200 && r.body.successor, "declined");
  rec1 = await EL.seatRecord(store, v0.closeAt + 30);
  ok(rec1[0].seats[home].key === rr.order[1][0] && rec1[0].seats[home].key !== me.key, `the runner-up takes the seat (${rec1[0].seats[home].name})`);
  const vd = await EL.publicView(io, v0.closeAt + 30);
  ok(vd.races[home].result.declined && vd.races[home].result.key === rr.order[1][0], "the page says the seat was declined");
  ok((await EL.mySeats(store, SELF, v0.closeAt + 30)).length === 0, "the seat leaves MY FILE");
  C.setSeats([]);
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

console.log(`check-civic: ${checks} checks passed. draft spread ${globalThis.__draftSpread?.join(" -> ")} (cap demo ${globalThis.__capDemo?.map(x => typeof x === "number" ? +x.toFixed(1) : x).join(" -> ")}). civic block bytes by roster: ${sizes.map(([n, b, t]) => `${n}: ${b} B (${Math.round(b / DIST.length)}/district, fold ${t} ms)`).join("; ")}`);
