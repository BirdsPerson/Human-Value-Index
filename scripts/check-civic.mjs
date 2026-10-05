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

// ---- 0. THE SEASON CALENDAR (src/city/seasons.js; Scott 2026-10-05: a season lasts one real month) --
// 28-day seasons before the cutover (published history, untouched); from season 23 (0-based 22, machine
// day 617) every season is 1800 machine days, 30 real days. One definition: civic, leagues, race agree.
{
  const SN = await import("../src/city/seasons.js"), Lg = await import("../src/city/leagues.js"), R = await import("../src/city/race.js");
  ok(SN.LONG_FROM === 22 && SN.seasonStart(22) === 617 && SN.seasonStart(23) === 2417, "season 23 (the first long one) opens machine day 617; season 24 opens day 2417");
  ok(C.seasonOf === SN.seasonOf && Lg.seasonOf === SN.seasonOf && R.seasonOf === SN.seasonOf && C.seasonStart === SN.seasonStart && Lg.seasonStart === SN.seasonStart, "civic, leagues and the mountain read the one season calendar");
  for (let s = 0; s < 40; s++) {
    const len = SN.seasonStart(s + 1) - SN.seasonStart(s);
    ok(len === (s < SN.LONG_FROM ? 28 : 1800) && SN.seasonDays(s) === len, `season ${s + 1} is ${len} machine days (${s < SN.LONG_FROM ? "before" : "from"} the cutover)`);
    ok(SN.seasonOf(SN.seasonStart(s)) === s && SN.seasonOf(SN.seasonStart(s + 1) - 1) === s && (s === 0 || SN.seasonOf(SN.seasonStart(s) - 1) === s - 1), `seasonOf(seasonStart(${s})) === ${s}, and its last day is still season ${s + 1}`);
  }
  for (let d = 1; d < 617; d++) if (SN.seasonOf(d) !== Math.floor((d - 1) / 28)) ok(false, `day ${d}: the short seasons are unchanged`);
  ok(SN.seasonDays(22) * 24 * 3600 * 1000 / SIM.DEFAULT_SCALE === 30 * 86400000, "a long season is 30 real days");
  // a long season's leagues: every regular round, then the playoffs on the season's last scored slots
  const rating = Object.fromEntries(DIST.map((id, i) => [id, 40 + 3 * i]));
  for (const s of [22, 23, 25]) for (const sp of Lg.SPORTS) {
    const s0 = SN.seasonStart(s), s1 = SN.seasonStart(s + 1), all = Lg.sportSeason(sp, s, s1, rating);
    const reg = all.filter(m => m.stage === "regular"), fin = all.filter(m => m.stage === "final");
    let last = s1 - 1; while (!Lg.slotsOn(sp, last).length) last--;
    ok(reg.length === Lg.SPORT[sp].longRounds * 5 && fin.length === 1 && fin[0].day === last && all[all.length - 1] === fin[0], `season ${s + 1} ${sp}: ${Lg.SPORT[sp].longRounds} rounds, the final on day ${last - s0 + 1} of ${s1 - s0}, the season's last league slot`);
    ok(new Set(all.map(m => m.k)).size === Lg.matchdays(sp, s) && all.every(m => m.day >= s0 && m.day < s1), `season ${s + 1} ${sp}: ${Lg.matchdays(sp, s)} matchdays, all inside the season`);
    if (!Lg.SPORT[sp].finalOnly) ok(all.filter(m => m.stage === "semi").length === 2, `season ${s + 1} ${sp}: two semi-finals`);
  }
}

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
  // season 13 opens the per-sport leagues (section 3d); the chain and the recompute agree on its drafts
  const b13 = ch.get(337);
  ok(!b13.league && b13.leagues?.season === 13, "season 13 is the leagues' first season");
  eq(C.civicFold(P2.get(337), people, null).leagues.sports, b13.leagues.sports, "season 13's drafts from the census alone equal the chain's");
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

// ---- 3d. THE LEAGUES (season 13 on): four sports, the ladder, the Pit, the Departmental Cup -------------
{
  const L = await import("../src/city/leagues.js");
  const PIT = await import("../src/city/pit.js"), TENNIS = await import("../src/city/tennis.js");
  const PIT_FIGHTER = (s) => Boolean(PIT.FIGHTER[SIM.keyOf(s)]);
  ok(C.LEAGUES_FROM === 12 && C.seasonStart(C.LEAGUES_FROM) === 337, "the leagues open season 13, machine day 337 (the running season is left as it was drawn)");
  const LDAYS = [335, 336, 337, 338, 339, 340];
  SIM.clearPlans(); SIM.setRoster(roster);
  const P3 = new Map([...LDAYS, 363, 364, 365].map(d => [d, clone(SIM.buildPlan(d))]));
  const ch = new Map();
  let pv = null;
  for (const d of LDAYS) { pv = C.civicFold(P3.get(d), people, pv); ch.set(d, pv); }
  const subjects = Object.keys(P3.get(337).subjects).map(k => people.get(k));
  // the transition: the running season keeps the mixed league to its last day; the leagues from the next
  ok(ch.get(336).league && !ch.get(336).leagues && DIST.every(id => ch.get(336).districts[id].team && !ch.get(336).districts[id].teams), "day 336 (season 12's last): the mixed league, untouched");
  ok(ch.get(337).leagues && !ch.get(337).league && DIST.every(id => ch.get(337).districts[id].teams && !ch.get(337).districts[id].team), "day 337: the leagues, and no mixed league");
  eq(C.civicFold(P3.get(336), people, ch.get(335)), ch.get(336), "the running season folds as it always did");
  const b = ch.get(337), lg = b.leagues;
  ok(lg.season === 13 && lg.day === 1 && L.SPORTS.every(sp => lg.sports[sp].draft.season === 13), "draft day: four drafts, season 13");
  // the first drafts: every league in the reverse of the mixed league's end, the champion last
  const endOld = C.seasonEnd(12 - 1, Object.fromEntries(DIST.map(id => [id, ch.get(336).districts[id].team.roster])));
  // rotated per sport so no district picks first in all four (the Cup would be one district's)
  L.SPORTS.forEach((sp, i) => {
    const t = endOld.table, k = (i * 3) % t.length;
    eq(lg.sports[sp].draft.order, L.draftOrder([...t.slice(k), ...t.slice(0, k)], i === 0 ? endOld.champion : null), `${sp}: the first draft order is the mixed table, rotated for the sport, reversed`);
  });
  ok(new Set(L.SPORTS.map(sp => lg.sports[sp].draft.order[0])).size === L.SPORTS.length, "a different district picks first in every sport");
  // deterministic; the chain and the census alone agree (draft day and mid-season)
  eq(C.civicFold(clone(P3.get(337)), peopleOf(clone(roster)), clone(ch.get(336))), b, "draft day is deterministic");
  for (const d of [337, 338, 340]) eq(C.civicFold(P3.get(d), people, null), C.civicFold(P3.get(d), people, null), `day ${d}: the same block twice`);
  for (const d of [337, 339]) eq(C.civicFold(P3.get(d), people, null).leagues, ch.get(d).leagues, `day ${d}: without yesterday, the same leagues`);
  for (const d of [338, 340]) for (const id of DIST) eq(ch.get(d).districts[id].teams, C.civicFold(P3.get(d), people, C.civicFold(P3.get(d - 1), people, null)).districts[id].teams, `day ${d} ${id}: recomputing yesterday gives the same teams`);
  // the pools: sport-appropriate, exclusive, ten teams' worth each
  const pools = L.sportPools(subjects);
  const inPool = new Map();
  for (const sp of L.SPORTS) {
    ok(pools[sp].length === DIST.length * L.SPORT[sp].n, `${sp}: the pool is ${DIST.length} x ${L.SPORT[sp].n}`);
    for (const x of pools[sp]) { ok(!inPool.has(x.key), `${x.key} is in one pool only`); inPool.set(x.key, sp); }
    for (let i = 1; i < pools[sp].length; i++) ok(pools[sp][i - 1].g >= pools[sp][i].g, `${sp}: specialists, then athletes, then regulars, then the rest`);
  }
  const spec = subjects.filter(s => L.specialtyOf(s));
  ok(spec.length >= 8, `the census has specialists to draft (${spec.length})`);
  for (const s of spec) { const k = SIM.keyOf(s), sp = L.specialtyOf(s); ok(inPool.get(k) === sp && pools[sp].find(x => x.key === k).g === 3, `${k}: drafted into ${sp}, where the record says they play`); }
  ok(subjects.every(s => !(PIT_FIGHTER(s) || L.isTennis(s)) || !inPool.has(SIM.keyOf(s))), "fighters and tennis players keep their own sports");
  // the snakes: every pick the best left (a capped trade swaps one round's picks); nobody twice
  for (const sp of L.SPORTS) {
    const dr = lg.sports[sp].draft, n = DIST.length, N = L.SPORT[sp].n;
    const ros = Object.fromEntries(DIST.map(id => [id, b.districts[id].teams[sp].roster]));
    const swapped = new Map(dr.trades.flatMap(([r, a, x]) => [[`${r}|${a}`, x], [`${r}|${x}`, a]]));
    let good = 0;
    for (let r = 0; r < N; r++) for (let p = 0; p < n; p++) { const team = L.snakeTeam(dr.order, r, p), holder = swapped.get(`${r}|${team}`) || team; if (ros[holder][r][0] === pools[sp][r * n + p].key) good++; }
    ok(good === n * N, `${sp}: all ${n * N} picks in snake order, the best player left`);
    const keys = DIST.flatMap(id => ros[id].map(x => x[0]));
    ok(new Set(keys).size === keys.length && keys.length === n * N, `${sp}: every player drafted once, ${N} a side`);
    ok(dr.trades.length <= L.L_TRADES, `${sp}: at most ${L.L_TRADES} trades`);
    const mean = (l) => l.reduce((x, q) => x + q[2], 0) / l.length;
    const unguarded = L.snakeDraftN(pools[sp], dr.order, N, { maxTrades: 0 }).rosters;
    const gap = (R) => Math.max(...DIST.map(id => mean(R[id]))) - Math.min(...DIST.map(id => mean(R[id])));
    const vr = (R) => { const m = DIST.map(id => mean(R[id])), mu = m.reduce((a, x) => a + x, 0) / m.length; return m.reduce((a, x) => a + (x - mu) ** 2, 0); };
    ok(vr(ros) <= vr(unguarded) + 1e-9 && gap(ros) <= 6, `${sp}: balanced (spread ${gap(unguarded).toFixed(1)} -> ${gap(ros).toFixed(1)}, ${dr.trades.length} trades)`);
    (globalThis.__sportSpread ||= []).push(`${sp} ${gap(unguarded).toFixed(1)}->${gap(ros).toFixed(1)}`);
    const first = L.draftBoard(dr, ros, N)[0];
    ok(first && L.specialtyOf(people.get(first.player[0])) === sp, `${sp}: the first pick plays the sport (${first?.player[1]})`);
    (globalThis.__firstPicks ||= []).push(`${sp}: ${L.draftBoard(dr, ros, N).slice(0, 3).map(p => `${p.player[1]} (${L.teamShort(p.team)})`).join(", ")}`);
  }
  // a whole season: results are the boards, the tables the sum of the results, the playoffs the table
  const full = C.civicFold(P3.get(364), people, null), V = C.leaguesView(full);
  for (const sp of L.SPORTS) {
    const all = V.all[sp], S = L.SPORT[sp], reg = all.filter(m => m.stage === "regular");
    ok(reg.length === S.rounds * DIST.length / 2, `${sp}: ${S.rounds} rounds of five (${reg.length} league matches)`);
    const pairs = new Map();
    for (const m of reg) { const k = [...m.sides].sort().join("|"); pairs.set(k, (pairs.get(k) || 0) + 1); }
    ok([...pairs.values()].every(c => c <= Math.ceil(S.rounds / 9)), `${sp}: no pair meets more often than the rounds allow`);
    for (const id of DIST) ok(reg.filter(m => m.sides.includes(id)).length === S.rounds, `${sp} ${id}: plays every round`);
    for (const m of all) {
      const slot = L.slotsOn(sp, m.day).find(x => x.md === m.k);
      ok(slot && m.placeId === S.venue && (m.kind === "hoops" ? m.from === slot.from + m.j * L.HOOP_LEN : m.from === slot.from), `${sp} ${m.day}.${m.k}.${m.j}: on the GAMES timetable at ${S.ground}`);
      if (m.featured) {
        const g = SIM.gameAt(m.placeId, (m.day - 1) * 24 + m.to - (m.kind === "hoops" ? 1e-4 : 1e-6));
        eq(m.score, g.score, `${sp} ${m.day}.${m.k}.${m.j}: the board at the whistle shows the result`);
      } else eq(m.score, L.matchFinal(m), `${sp} ${m.day}.${m.k}.${m.j}: the closed-door result is its own seed's`);
      if (m.kind === "hoops") ok(m.score[0] === 21 && m.score[1] < 21, `${sp} ${m.day}.${m.j}: first to 21`);
    }
    for (const d of [338, 339, 340]) {
      const blk = ch.get(d);
      const t2 = L.tableOf(C.leaguesView(blk).all[sp].filter(m => m.day < d));
      for (const id of DIST) {
        const x = blk.districts[id].teams[sp];
        eq([x.p, x.w, x.d, x.l, x.f, x.a, x.pts], [t2[id].p, t2[id].w, t2[id].d, t2[id].l, t2[id].f, t2[id].a, t2[id].pts], `day ${d} ${sp} ${id}: the standings are the sum of the results`);
        ok(x.pts === 3 * x.w + x.d && x.p === x.w + x.d + x.l, `day ${d} ${sp} ${id}: points and games add up`);
      }
      ok(DIST.reduce((n, id) => n + blk.districts[id].teams[sp].w, 0) === DIST.reduce((n, id) => n + blk.districts[id].teams[sp].l, 0), `day ${d} ${sp}: every win is someone's loss`);
      if (d < 340) { const at = C.sportTableAt(blk, sp, 24); for (const r of at) eq([r.pts, r.p], [ch.get(d + 1).districts[r.id].teams[sp].pts, ch.get(d + 1).districts[r.id].teams[sp].p], `day ${d} ${sp} ${r.id}: the table after today's whistles is tomorrow's`); }
    }
    const table = L.order(L.tableOf(reg)), semis = all.filter(m => m.stage === "semi"), fin = all.find(m => m.stage === "final");
    ok(fin, `${sp}: a final is played`);
    if (S.finalOnly) eq([...fin.sides].sort(), [table[0], table[1]].sort(), `${sp}: the top two meet in the final`);
    else {
      eq(semis.map(m => [...m.sides].sort()), [[table[0], table[3]].sort(), [table[1], table[2]].sort()], `${sp}: semi-finals 1st v 4th, 2nd v 3rd`);
      eq([...fin.sides].sort(), semis.map(L.winnerOf).sort(), `${sp}: the final is between the semi-final winners`);
    }
    ok(all.filter(m => m.stage !== "regular").every(m => L.winnerOf(m)), `${sp}: the playoffs always have a winner`);
    // box scores: deterministic, every side's scoring sums to its score; season stats sum to the table
    const sk = { baseball: "runs", basketball: "pts", football: "pts", soccer: "goals" }[sp];
    let sums = 0;
    for (const m of all) {
      const bx = L.boxScore(m, V.rosters[sp]);
      eq(bx, L.boxScore(clone(m), clone(V.rosters[sp])), `${sp} ${m.day}.${m.k}.${m.j}: the box score is the same every time`);
      for (const s of [0, 1]) {
        ok(bx.sides[s].reduce((n, x) => n + x[sk], 0) === m.score[s], `${sp} ${m.day}.${m.k}.${m.j} side ${s}: the players' ${sk} sum to the score`);
        if (sp === "baseball") ok(bx.sides[s].reduce((n, x) => n + x.rbi, 0) === m.score[s] && bx.sides[s].every(x => x.hr <= x.h && x.h <= x.ab), `baseball ${m.day}.${m.k}.${m.j}: RBIs sum to the runs; HR <= H <= AB`);
        if (sp === "basketball") ok(bx.sides[s].every(x => x.pts === 2 * (x.fgm - x.tpm) + 3 * x.tpm + x.ftm && x.fgm <= x.fga), `basketball ${m.day}.${m.j}: points are the baskets`);
        if (sp === "football") ok(bx.sides[s][0].passYds === bx.sides[s].reduce((n, x) => n + x.recYds, 0), `football ${m.day}.${m.j}: passing yards are the receiving yards`);
        sums++;
      }
    }
    const st = L.seasonStats(sp, all, V.rosters[sp]);
    for (const id of DIST) { const T = st.teams[id]; ok(T && T[sk] === T.f, `${sp} ${id}: the season's player ${sk} sum to the team's (${T?.f})`); }
    ok(L.leadersOf(sp, st.players).every(c => c.rows.length <= 5), `${sp}: five leaders a category`);
    ok(L.mvpOf(sp, st.players), `${sp}: an MVP`);
    (globalThis.__boxes ||= 0), globalThis.__boxes += sums;
  }
  // the Cup: the formula, and it moves the mood (bounded)
  const cup = C.cupTableAt(full, 24);
  const dist = { ...Object.fromEntries(full.leagues.tennis.seed.map(([k, , , d]) => [k, d])), ...full.leagues.pit.dist };
  const ladder = L.ladderRun(full.leagues.tennis.seed, 12, 364 * 24).ladder, pitRank = L.pitRun(12, 364 * 24).rank.map(x => x.key);
  for (const r of cup) {
    let want = 0;
    for (const sp of L.SPORTS) want += L.positionPoints(sp, V.all[sp])[r.id];
    ladder.slice(0, 3).forEach((k, i) => { if (dist[k] === r.id) want += L.IND_PTS[i]; });
    pitRank.slice(0, 3).forEach((k, i) => { if (dist[k] === r.id) want += L.IND_PTS[i]; });
    ok(r.pts === want && r.pts === Object.values(r.by).reduce((a, x) => a + x, 0), `the Cup: ${r.id} ${r.pts} = its positions in four leagues + the ladder + the Pit`);
  }
  for (const sp of L.SPORTS) { const pp = L.positionPoints(sp, V.all[sp]), fin = V.all[sp].find(m => m.stage === "final"); ok(pp[L.winnerOf(fin)] === 10 && pp[L.loserOf(fin)] === 8, `${sp}: the champion takes 10 Cup points, the runner-up 8`); }
  ok(L.SPORTS.every(sp => Object.values(L.positionPoints(sp, [])).every(x => x === 0)), "no Cup points before a ball is played");
  ok(DIST.every(id => ch.get(337).districts[id].cup.pts === Object.fromEntries(ch.get(337).leagues.cup.table)[id]), "each district's Cup record is the table's");
  for (const d of LDAYS.slice(2)) for (const id of ALL) { const f = ch.get(d).districts[id].mood.f.league; ok(f >= -19 && f <= 19, `day ${d} ${id}: the Cup form's pull on the mood is bounded (${f})`); }
  ok(SIM.DISTRICTS.filter(x => x.expansion).every(x => ch.get(338).districts[x.id].cup.pos === null && !ch.get(338).districts[x.id].teams), "the Coast and the Heights watch the leagues");
  // the ladder and the Pit
  const lr = L.ladderRun(full.leagues.tennis.seed, 12, 365 * 24);
  eq([...lr.ladder].sort(), full.leagues.tennis.seed.map(x => x[0]).sort(), "the ladder keeps its players, reordered");
  ok(lr.matches.every(m => m.a !== m.b) && lr.matches.length > 8, `ladder matches are played (${lr.matches.length})`);
  for (const m of lr.matches.filter(x => x.show)) { const g = TENNIS.tennisAt((m.day - 1) * 24 + m.to + 0.01); ok(g && g.done && g.players[g.winner].key === (m.win === 0 ? m.a : m.b), `day ${m.day}: the show court's winner is the ladder's`); }
  ok(Object.values(lr.stats).reduce((n, x) => n + x.w, 0) === lr.matches.length, "every ladder match has one winner");
  const pr = L.pitRun(12, 365 * 24);
  ok(pr.rank.reduce((n, x) => n + x.w, 0) === pr.rank.reduce((n, x) => n + x.l, 0) && pr.bouts.length === 12, `the Pit ranks the season's four cards (${pr.bouts.length} bouts)`);
  // season 14's drafts come from season 13's own tables; the chain's draft day and the census agree
  const c364 = C.civicFold(P3.get(364), people, C.civicFold(P3.get(363), people, null)), c365 = C.civicFold(P3.get(365), people, c364);
  eq(c365.leagues.sports, C.civicFold(P3.get(365), people, null).leagues.sports, "season 14's drafts: the chain and the census alone agree");
  for (const sp of L.SPORTS) { const e = L.sportEnd(sp, 12, V.rosters[sp]); eq(c365.leagues.sports[sp].draft.order, L.draftOrder(e.table, e.champion), `${sp}: season 14 drafts in the reverse of its own table`); }
  ok(c365.leagues.cup.last?.season === 13 && c365.leagues.cup.last.champion === C.cupTableAt(full, 24)[0].id, `season 14 remembers season 13's Cup (${c365.leagues.cup.last?.champion})`);
  // the size: per district, bounded (the fixtures are recomputed, never stored)
  for (const n of process.argv.includes("--no-20k") ? [430, 5000] : [430, 5000, 20000]) {
    const r = n === 430 ? roster : synthRoster(n, { rich: true });
    SIM.clearPlans(); SIM.setMemoCap(Math.max(200000, n * 60)); SIM.setRoster(r);
    const p = SIM.buildPlan(340);
    const t = performance.now();
    const blk = C.civicFold(p, peopleOf(r), null);
    const ms = performance.now() - t;
    const bytes = JSON.stringify(blk).length;
    (globalThis.__lgSizes ||= []).push([n, bytes, Math.round(ms)]);
    // as the summary's bound below: the league's ten (their teams) and the leagues block within the old
    // bound, every other district (the Coast, the Heights, PHASE 2's, the nightlife quarters) a small
    // record of its own (the two quarters took the census-wide block past 28000: 2026-10-05)
    const others = Object.keys(blk.districts).filter(id => !DIST.includes(id));
    const core = JSON.stringify({ ...blk, districts: Object.fromEntries(DIST.map(id => [id, blk.districts[id]])) }).length;
    const rest = Math.max(0, ...others.map(id => JSON.stringify(blk.districts[id]).length));
    ok(core / DIST.length < 2800 && rest < 520, `leagues, ${n}: ${bytes} bytes; the league's ten ${Math.round(core / DIST.length)} per district, the largest other ${rest}`);
  }
  const zs = globalThis.__lgSizes;
  ok(zs[zs.length - 1][1] < zs[0][1] * 1.3, `the leagues' block does not grow with the census (${zs.map(x => x[1]).join(" / ")} bytes)`);
  SIM.setRoster(roster);
}

// ---- 3e. JOIN THE LEAGUES: players' citizens entered from MY FILE (Scott 2026-10-05) ---------------------
// Honest ratings from the file; entrants in their sports' pools among the athletes, placed by the normal
// draft; deterministic from each season's frozen snapshot (chain and census alone agree); SUBJECT and
// the tag, never a case number; withdraw before the close; the snapshot frozen once per season.
{
  const L = await import("../src/city/leagues.js");
  const LE = await import("../netlify/lib/league-entries.js");
  const { getStore } = await import("@netlify/blobs");
  // -- the rating: the file's formula, a bonus only for athletics on record, nothing inflated
  const nobody = { physical: null, competence: null, adaptability: null, ath: false, named: [] };
  ok(L.entrantRating(nobody, "baseball") === 40, "an unassessed body and no record: the rubric's neutral 50 everywhere, rating 40");
  for (const [p, c, a] of [[0, 0, 0], [60, 55, 60], [100, 100, 100], [35, 80, 20]]) for (const sp of L.ENTRY_SPORTS) {
    const x = { physical: p, competence: c, adaptability: a, ath: false, named: [] };
    ok(L.entrantRating(x, sp) === Math.round(0.45 * p + 0.25 * c + 0.10 * a), `rating ${p}/${c}/${a} ${sp}: 0.45 physical + 0.25 competence + 0.10 adaptability`);
    ok(L.entrantRating({ ...x, ath: true, named: [sp] }, sp) - L.entrantRating(x, sp) === L.ATH_BONUS + L.SPORT_BONUS && L.entrantRating({ ...x, ath: true, named: [] }, sp) - L.entrantRating(x, sp) === L.ATH_BONUS, `${sp}: the athletics bonus is +${L.ATH_BONUS}, +${L.SPORT_BONUS} for the sport named, no more`);
    ok(L.entrantRating({ ...x, ath: false, named: [sp] }, sp) === L.entrantRating(x, sp), `${sp}: naming a sport without athletics on record earns nothing`);
  }
  ok(L.entrantRating({ physical: 100, competence: 100, adaptability: 100, ath: true, named: L.ENTRY_SPORTS }, "soccer") === 87, "the ceiling is 87: below the stars on file");
  ok(L.entrantRating({ physical: 400, competence: -5, adaptability: "99", ath: true, named: [] }, "soccer") === Math.round(0.45 * 100 + 0.25 * 0 + 0.10 * 50) + L.ATH_BONUS, "out-of-range inputs are clamped, junk is neutral");
  const A = L.athleticsOf("I was a multi-sport varsity athlete in high school. Baseball, basketball and football.");
  ok(A.ath && A.named.join() === "baseball,basketball,football", `"multi-sport varsity athlete": athletics, three sports named (${A.named})`);
  ok(!L.athleticsOf("I like soccer on TV and I read a lot.").ath, "liking a sport is not a record");
  ok(L.athleticsOf("I played college soccer").ath && L.athleticsOf("I played college soccer").named.join() === "soccer", "played college soccer: soccer");
  ok(!L.athleticsOf("").ath && !L.athleticsOf(null).ath, "no words, no record");
  const fileOf = (hist) => ({ history: hist });
  const rec = fileOf([
    { at: "2026-10-01T00:00:00Z", competence: 40, breakdown: { physical: 50, adaptability: 40, threat: 5, care: 70 }, transcript: [{ role: "agent", text: "Do you play varsity basketball?" }, { role: "user", text: "No." }] },
    { at: "2026-10-02T00:00:00Z", competence: 58, breakdown: { physical: 62, adaptability: 66, threat: 5, care: 70 }, transcript: [{ role: "agent", text: "Sport?" }, { role: "user", text: "I lettered in baseball and soccer at school." }] },
  ]);
  const inp = LE.inputsOf(rec);
  eq([inp.physical, inp.competence, inp.adaptability, inp.ath, inp.named.join()], [62, 58, 66, true, "baseball,soccer"], "the inputs: the latest assessment, the subject's own words across visits");
  ok(!LE.inputsOf(fileOf([{ at: "x", competence: 50, breakdown: {}, transcript: [{ role: "agent", text: "Were you a varsity athlete? Did you play football?" }] }])).ath, "the officer's questions are not the subject's record");
  eq(LE.ratingsOf(inp, ["baseball", "tennis"]), { baseball: L.entrantRating(inp, "baseball"), tennis: L.entrantRating(inp, "tennis") }, "the stored ratings are the formula's");
  ok(L.entrantRating(inp, "baseball") === Math.round(0.45 * 62 + 0.25 * 58 + 0.10 * 66) + 7 && L.entrantRating(inp, "basketball") === Math.round(0.45 * 62 + 0.25 * 58 + 0.10 * 66) + 4, "a named sport +7, another +4");
  // -- THE ATHLETIC RECORD (admin-set on the case): floors, sport bonuses, track, cap 72, never PRO
  const low = { physical: 40, competence: 40, adaptability: 40, ath: false, named: [] };
  const FLOORS = { none: 0, varsity: 60, standout: 66, college: 72 };
  eq(L.LEVEL_FLOOR, FLOORS, "the floors: varsity 60, varsity standout 66, college 72");
  ok(L.SELF_CAP === 72 && L.PLAYED_BONUS === 3 && L.TRACK_BONUS === 1, "+3 a sport played at the level, +1 for track, cap 72");
  for (const level of ["varsity", "standout", "college"]) for (const sp of L.ENTRY_SPORTS) for (const played of [[], [sp]]) for (const track of [false, true]) {
    const recd = { level, played: L.SPORTS.includes(sp) ? played : [], track };
    const want = Math.min(72, FLOORS[level] + (recd.played.includes(sp) ? 3 : 0) + (track && ["football", "soccer", "basketball"].includes(sp) ? 1 : 0));
    ok(L.recordFloor(recd, sp) === want && L.entrantRating(low, sp, recd) === Math.max(L.fileRating(low, sp), want), `${level} ${sp}${recd.played.length ? " played" : ""}${track ? " track" : ""}: floor ${want}`);
  }
  ok(L.recordFloor({ level: "standout", played: ["baseball"], track: true }, "baseball") === 69, "track does not reach baseball");
  ok(L.recordFloor({ level: "standout", played: [], track: true }, "tennis") === 66 && L.recordFloor({ level: "standout", played: ["soccer"], track: true }, "tennis") === 66, "tennis takes the level's floor only");
  ok(L.entrantRating(low, "soccer", { level: "college", played: ["soccer"], track: true }) === 72, "college + played + track: capped at 72, never past the pros");
  ok(L.entrantRating({ physical: 100, competence: 100, adaptability: 100, ath: true, named: ["soccer"] }, "soccer", { level: "varsity", played: ["soccer"] }) === 87, "a record never lowers what the file earns (the file's own ceiling 87 stands)");
  ok(L.entrantRating({ ...low, ath: true, named: ["basketball"] }, "basketball", { level: "standout", played: ["basketball"], track: true }) === 70, "the interview's bonus and the floor: the higher counts, never the sum");
  ok(L.entrantRating(low, "soccer", null) === L.fileRating(low, "soccer") && L.entrantRating(low, "soccer", { level: "none" }) === L.fileRating(low, "soccer"), "no record: the file alone");
  for (const bad of [{ level: "pro" }, { level: "PRO", played: ["soccer"] }, { level: "olympic" }, { level: "college", played: ["cricket"] }, { level: "college", note: "free text" }, { level: "college", track: "yes" }, "college", [1]]) ok(L.cleanRecord(bad) === null, `not a record: ${JSON.stringify(bad)}`);
  for (const sp of L.ENTRY_SPORTS) ok(L.entrantRating(low, sp, { level: "pro", played: L.SPORTS, track: true }) === L.fileRating(low, sp), `${sp}: a PRO record earns nothing`);
  eq(L.cleanRecord({ level: "none", played: ["soccer"], track: true }), { level: "none", played: [], track: false }, "no level: nothing played, no track");
  eq(Object.fromEntries(L.ENTRY_SPORTS.map(sp => [sp, L.entrantRating({ physical: 52, competence: 50, adaptability: 50, ath: false, named: [] }, sp, { level: "standout", played: ["basketball", "soccer", "baseball"], track: true })])), { baseball: 69, basketball: 70, football: 67, soccer: 70, tennis: 66 }, "a varsity standout in basketball, soccer and baseball who ran track: 69 / 70 / 67 / 70 / 66");
  const withRec = { ...rec, athleticRecord: { level: "standout", played: ["soccer", "basketball"], track: true, by: "operator", at: "x" } };
  eq(LE.inputsOf(withRec).record, { level: "standout", played: ["basketball", "soccer"], track: true }, "inputsOf reads the case's admin-set record");
  eq(LE.inputsOf({ ...rec, athleticRecord: { level: "pro", played: ["soccer"] } }).record, { level: "none", played: [], track: false }, "a PRO record on a case reads as none");
  eq(LE.ratingsOf(LE.inputsOf(withRec), ["soccer", "baseball"]), { soccer: 70, baseball: Math.max(66, L.fileRating(inp, "baseball")) }, "the stored ratings take the record's floor");
  // -- no public path writes it: the record is read from the case, never from a request
  {
    const { readdirSync, readFileSync } = await import("node:fs");
    const dir = new URL("../netlify/functions/", import.meta.url);
    const writers = readdirSync(dir).filter(f => /\.m?js$/.test(f) && /athleticRecord/.test(readFileSync(new URL(f, dir), "utf8")));
    ok(!writers.length, `no function touches athleticRecord (${writers})`);
    ok(!/record/i.test(readFileSync(new URL("leagues.js", dir), "utf8").split("\n").filter(l => /setEntry\(/.test(l)).join("")), "/api/leagues passes no record to setEntry");
  }

  // -- the pools: in the sports entered, among the athletes, at their rating; the census's row gives way
  SIM.clearPlans(); SIM.setRoster(roster);
  const PD = [364, 365, 366, 367, 368, 369];
  const P4 = new Map([363, ...PD].map(d => [d, clone(SIM.buildPlan(d))]));
  const subjects = Object.keys(P4.get(365).subjects).map(k => people.get(k));
  const cz = { slug: "citizen-ab12", name: "Subject AB12", kind: "citizen", tier: "ORDINARY", score: 500, warmth: 50, competence: 50 };
  const ENT = [
    { key: "citizen-ab12", sports: ["baseball", "tennis"], r: { baseball: 55, tennis: 52 } },
    { key: "citizen-zz01", sports: ["basketball", "soccer"], r: { basketball: 61, soccer: 47 } },
    { key: "citizen-zz02", sports: ["football"], r: { football: 38 } },
  ];
  const withCz = [...subjects, cz];
  eq(L.sportPools(subjects, []), L.sportPools(subjects), "no entries: the pools as they always were");
  const pools0 = L.sportPools(withCz), pools = L.sportPools(withCz, ENT);
  for (const sp of L.SPORTS) {
    ok(pools[sp].length === DIST.length * L.SPORT[sp].n, `${sp}: with entrants the pool is still ${DIST.length} x ${L.SPORT[sp].n}`);
    for (const e of ENT) {
      const x = pools[sp].find(p => p.key === e.key);
      if (e.sports.includes(sp)) ok(x && x.g === 2 && x.r === e.r[sp] && x.name === `SUBJECT ${e.key.slice(8).toUpperCase()}`, `${sp}: ${e.key} is in the pool among the athletes at ${e.r[sp]}, as SUBJECT ${e.key.slice(8).toUpperCase()}`);
      else ok(!x, `${sp}: ${e.key} did not enter it`);
    }
    for (let i = 1; i < pools[sp].length; i++) ok(pools[sp][i - 1].g > pools[sp][i].g || (pools[sp][i - 1].g === pools[sp][i].g && pools[sp][i - 1].r >= pools[sp][i].r), `${sp}: the pool's order holds with entrants in it`);
  }
  ok(L.SPORTS.every(sp => pools0[sp].length === pools[sp].length), "the census gives way one-for-one");
  const ent2 = L.entrantsBySport([...ENT, { key: "citizen-ab12", sports: ["soccer"], r: { soccer: 99 } }, { key: "HVI-ABCDEFGH", sports: ["soccer"], r: { soccer: 99 } }, { key: "citizen-zz03", sports: ["baseball", "soccer", "football"], r: { baseball: 70, soccer: 70, football: 70 } }, { key: "citizen-zz04", sports: ["baseball"], r: { baseball: 150 } }]);
  ok(ent2.soccer.filter(x => x.key === "citizen-ab12").length === 0 && !Object.values(ent2).flat().some(x => !/^citizen-[a-z0-9]{4}$/.test(x.key)), "one entry per citizen; a malformed key is dropped");
  ok(ent2.football.every(x => x.key !== "citizen-zz03") && ent2.baseball.some(x => x.key === "citizen-zz03") && ent2.soccer.some(x => x.key === "citizen-zz03"), "at most two sports an entry");
  ok(ent2.baseball.find(x => x.key === "citizen-zz04").r === 99, "a rating is clamped to 99");
  const many = Array.from({ length: 30 }, (_, i) => ({ key: `citizen-m${String(i).padStart(3, "0")}`, sports: ["soccer"], r: { soccer: 30 + i } }));
  ok(L.entrantsBySport(many).soccer.length === L.ENTRANTS_MAX && L.entrantsBySport(many).soccer[0].r === 59, `at most ${L.ENTRANTS_MAX} entrants a league a season, the best-rated`);
  const seed = L.ladderSeed(withCz, ENT), seed0 = L.ladderSeed(withCz);
  eq(seed.slice(0, seed0.length).map(x => x[0]), seed0.filter(x => x[0] !== "citizen-ab12").map(x => x[0]).slice(0, seed0.length), "the ladder's seeded ten are unchanged");
  ok(seed.length === seed0.length + 1 && seed[seed.length - 1][0] === "citizen-ab12" && seed[seed.length - 1][1] === "SUBJECT AB12" && seed[seed.length - 1][2] === 52, "the tennis entrant takes the bottom rung, at their rating");

  // -- the drafts: season 14 (day 365) with entries frozen for it; the chain and the census alone agree
  const c363 = C.civicFold(P4.get(363), people, null);
  const c364 = C.civicFold(P4.get(364), people, c363);
  C.setEntries({});
  const base365 = C.civicFold(P4.get(365), people, c364);
  C.setEntries({ 14: ENT });
  const ch = new Map([[364, c364]]);
  for (const d of PD.slice(1)) ch.set(d, C.civicFold(P4.get(d), people, ch.get(d - 1)));
  const b = ch.get(365);
  for (const e of ENT) for (const sp of L.SPORTS) {
    const on = DIST.filter(id => b.districts[id].teams[sp].roster.some(p => p[0] === e.key));
    ok(on.length === (e.sports.includes(sp) ? 1 : 0), `season 14 ${sp}: ${e.key} ${e.sports.includes(sp) ? "drafted by one team" : "not drafted"}`);
  }
  ok(b.leagues.tennis.seed.some(x => x[0] === "citizen-ab12"), "season 14's ladder has the tennis entrant");
  for (const sp of L.SPORTS) {
    const dr = b.leagues.sports[sp].draft, n = DIST.length, N = L.SPORT[sp].n, pl = L.sportPools(subjects, ENT)[sp];
    const ros = Object.fromEntries(DIST.map(id => [id, b.districts[id].teams[sp].roster]));
    const swapped = new Map(dr.trades.flatMap(([r, a, x]) => [[`${r}|${a}`, x], [`${r}|${x}`, a]]));
    let good = 0;
    for (let r = 0; r < N; r++) for (let p = 0; p < n; p++) { const team = L.snakeTeam(dr.order, r, p), holder = swapped.get(`${r}|${team}`) || team; if (ros[holder][r][0] === pl[r * n + p].key) good++; }
    ok(good === n * N, `${sp}: entrants placed by the normal snake (and the cap): all ${n * N} picks the best left`);
    eq(dr.order, base365.leagues.sports[sp].draft.order, `${sp}: entries change no draft order`);
  }
  eq(C.civicFold(clone(P4.get(365)), peopleOf(clone(roster)), clone(c364)), b, "draft day with entrants is deterministic");
  C.setEntries({ 14: ENT.map(e => ({ ...e, record: { level: "standout", played: ["soccer"], track: true } })) });
  eq(C.civicFold(clone(P4.get(365)), peopleOf(clone(roster)), clone(c364)).leagues.sports, b.leagues.sports, "a snapshot carrying records drafts by its frozen ratings, deterministically");
  C.setEntries({ 14: ENT });
  eq(C.civicFold(P4.get(365), people, null).leagues.sports, b.leagues.sports, "the census alone and the snapshot draw the same drafts");
  for (const d of [366, 368]) for (const id of DIST) eq(C.civicFold(P4.get(d), people, null).districts[id].teams, ch.get(d).districts[id].teams, `day ${d} ${id}: without yesterday, the same teams (entrants included)`);
  C.setEntries({});
  ok(JSON.stringify(C.civicFold(P4.get(365), people, c364).leagues.sports) === JSON.stringify(base365.leagues.sports), "a season with no snapshot drafts as before");
  C.setEntries({ 14: ENT });
  // -- no leaks: SUBJECT and the tag only
  for (const d of PD.slice(1)) { const s = JSON.stringify(ch.get(d)); ok(!/HVI-[A-Z0-9]/.test(s) && !/@/.test(s), `day ${d}: no case number, no email in the block`); }
  ok(DIST.every(id => L.SPORTS.every(sp => b.districts[id].teams[sp].roster.filter(p => /^citizen-/.test(p[0]) && ENT.some(e => e.key === p[0])).every(p => /^SUBJECT [A-Z0-9]{4}$/.test(p[1])))), "entrants on the rosters are SUBJECT and the tag");
  // -- MY FILE's lines: the season's numbers, in the Department's hand
  const b369 = ch.get(369), V = C.leaguesView(b369);
  let lineN = 0;
  for (const e of ENT) {
    const lines = C.entrantLines(b369, e.key, 24);
    eq(lines.map(x => x.sport).sort(), [...e.sports].sort(), `${e.key}: a line for every sport entered`);
    for (const x of lines) {
      ok(/\.$/.test(x.text) && !/undefined|NaN|null/.test(x.text), `${e.key} ${x.sport}: "${x.text}"`);
      if (x.sport !== "tennis") {
        ok(x.text.includes(L.sportTeamName(x.team, x.sport)), `${e.key} ${x.sport}: names the team`);
        const st = L.seasonStats(x.sport, C.decidedAt(b369, x.sport, 24), V.rosters[x.sport]).players[e.key];
        if (x.sport === "baseball" && st?.g && st.pos !== "P") ok(x.text.startsWith(`BATTING ${(st.avg >= 1 ? st.avg.toFixed(3) : st.avg.toFixed(3).replace(/^0/, ""))}`), `the batting line is the season's average (${st.avg})`);
        if (x.sport === "basketball" && st?.g) ok(x.text.startsWith(`${st.ppg.toFixed(1)} POINTS A GAME`), "the basketball line is the season's points a game");
      }
      lineN++;
    }
  }
  ok(C.entrantLines(b369, "citizen-qq99", 24).length === 0, "a citizen on no roster has no lines");
  globalThis.__entrantLines = C.entrantLines(b369, "citizen-ab12", 24).map(x => x.text).join(" | ");
  C.setEntries({});

  // -- the store: enter, change, withdraw before the close, the snapshot frozen once, the API's refusals
  globalThis.__blobs = new Map();
  const store = getStore({ name: LE.STORE });
  const S0 = LE.ENTRIES_FROM;
  const close = LE.closeMs(S0), draft = LE.draftMs(S0);
  ok(close < draft && Math.round((draft - close) / 60000) === 3 * 24, "entries close three machine days (72 real minutes) before draft day");
  ok(SIM.machineClock(close).day === L.seasonStart(S0) - 3 && SIM.machineClock(draft).day === L.seasonStart(S0), `season ${S0 + 1}: entries close day ${L.seasonStart(S0) - 3}, draft day ${L.seasonStart(S0)}`);
  const cases = new Map([
    ["HVI-TESTAB12", rec],
    ["HVI-TESTCD34", fileOf([{ at: "a", competence: 70, breakdown: { physical: 70, adaptability: 50, threat: 0, care: 80 }, transcript: [] }])],
    ["HVI-TESTEF56", fileOf([])],
    ["HVI-TESTGH78", fileOf([{ at: "a", competence: 70, breakdown: { physical: 70, adaptability: 50, threat: 99, care: 0 }, transcript: [] }])],
  ]);
  let lim = 0;
  const io = { store, getCase: async (id) => cases.get(id) || null, hitLimit: async () => ({ ok: ++lim < 1e9 }) };
  const before = close - 30 * 60 * 1000, after = close + 5 * 60 * 1000;
  let r = await LE.setEntry(io, { caseId: "HVI-TESTAB12", sports: ["baseball", "soccer", "tennis"], ip: "1.1.1.1", now: before });
  ok(r.status === 400, "three sports: refused");
  r = await LE.setEntry(io, { caseId: "HVI-TESTAB12", sports: ["cricket"], ip: "1.1.1.1", now: before });
  ok(r.status === 400, "no such sport: refused");
  r = await LE.setEntry(io, { caseId: "HVI-TESTEF56", sports: ["soccer"], ip: "1.1.1.1", now: before });
  ok(r.status === 403, "an unassessed file: refused");
  r = await LE.setEntry(io, { caseId: "HVI-TESTGH78", sports: ["soccer"], ip: "1.1.1.1", now: before });
  ok(r.status === 403, "a file under a harm finding: refused");
  r = await LE.setEntry(io, { caseId: "HVI-TESTAB12", sports: ["Soccer", "baseball"], ip: "1.1.1.1", now: before });
  ok(r.status === 200 && r.body.season === S0 + 1 && r.body.entry.sports.join() === "baseball,soccer" && r.body.entry.r.baseball === L.entrantRating(inp, "baseball"), "entered: baseball and soccer, for the next draft, rated from the file");
  r = await LE.setEntry(io, { caseId: "HVI-TESTAB12", sports: ["soccer", "baseball"], ip: "1.1.1.1", now: before });
  ok(r.status === 200 && r.body.unchanged, "the same entry twice: unchanged");
  r = await LE.setEntry(io, { caseId: "HVI-TESTCD34", sports: ["tennis"], ip: "2.2.2.2", now: before });
  r = await LE.setEntry(io, { caseId: "HVI-TESTCD34", sports: [], ip: "2.2.2.2", now: before + 60000 });
  ok(r.status === 200 && r.body.withdrawn && !r.body.entry, "withdrawn before the close");
  const raw = () => [...globalThis.__blobs.get(LE.STORE).entries()].map(([k, v]) => [k, v.data]);
  ok(!JSON.stringify(raw()).includes("HVI-TEST") && !JSON.stringify(raw()).includes("1.1.1.1"), "the store holds no case number and no address");
  let me = await LE.myEntry(io, "HVI-TESTAB12", before);
  ok(me.status === 200 && me.body.name === "SUBJECT AB12" && me.body.eligible && me.body.entry.sports.join() === "baseball,soccer" && !me.body.drafted.length && me.body.draftDay === L.seasonStart(S0), "MY FILE: the entry, the next draft, not yet drafted");
  // the close: the first write after it freezes the season (the builder may be first; either way, once)
  r = await LE.setEntry(io, { caseId: "HVI-TESTCD34", sports: ["tennis"], ip: "2.2.2.2", now: after });
  ok(r.status === 200 && r.body.season === S0 + 2, "an entry after the close counts for the season after");
  const snap = await store.get(LE.KEYS.snap(S0 + 1), { type: "json" });
  eq(snap.entries.map(e => [e.key, e.sports.join()]), [["citizen-ab12", "baseball,soccer"]], "the season's snapshot: the entries standing at the close (the withdrawn one is out)");
  r = await LE.setEntry(io, { caseId: "HVI-TESTAB12", sports: [], ip: "1.1.1.1", now: after + 60000 });
  ok(r.status === 200 && r.body.season === S0 + 2, "a withdrawal after the close counts from the next season");
  eq((await store.get(LE.KEYS.snap(S0 + 1), { type: "json" })).entries.map(e => e.key), ["citizen-ab12"], "the frozen snapshot never changes");
  me = await LE.myEntry(io, "HVI-TESTAB12", after + 120000);
  ok(!me.body.entry && me.body.drafted.length === 1 && me.body.drafted[0].season === S0 + 1 && me.body.season === S0 + 2, "MY FILE after: withdrawn for the next, still in the frozen draft");
  // the builder: freezes the seasons it folds, reads every snapshot; strict on a bad one
  const rec2 = await LE.entriesRecord(store, [L.seasonStart(S0 + 1)], LE.closeMs(S0 + 1) + 1000);
  ok(Array.isArray(rec2[S0 + 1]) && Array.isArray(rec2[S0 + 2]) && rec2[S0 + 2].map(e => e.key).join() === "citizen-cd34", "the builder freezes the season it folds and reads every snapshot");
  eq(await LE.entriesRecord(store, [100, 200]), rec2, "seasons before the entries opened are never frozen");
  await store.setJSON(LE.KEYS.snap(999), { junk: true });
  let threw = false; try { await LE.entriesRecord(store, []); } catch { threw = true; }
  ok(threw, "an unreadable snapshot builds nothing");
  await store.delete(LE.KEYS.snap(999));
  // the athletic record: set on the case, it re-rates the standing entry (MY FILE) and rides the snapshot
  const S1 = S0 + 2, close1 = LE.closeMs(S1);
  cases.set("HVI-TESTJK22", fileOf([{ at: "a", competence: 50, breakdown: { physical: 52, adaptability: 50, threat: 0, care: 80 }, transcript: [] }]));
  r = await LE.setEntry(io, { caseId: "HVI-TESTJK22", sports: ["basketball", "soccer"], record: { level: "college", played: ["soccer"] }, ip: "4.4.4.4", now: close1 - 3e6 });
  ok(r.status === 200 && r.body.season === S1 + 1 && r.body.entry.r.soccer === L.fileRating(LE.inputsOf(cases.get("HVI-TESTJK22")), "soccer"), "a record in the request is ignored: the public cannot file one");
  me = await LE.myEntry(io, "HVI-TESTJK22", close1 - 2e6);
  ok(me.body.record === null && me.body.entry.r.basketball < 60, "no record on the case: none shown, the file's rating");
  cases.set("HVI-TESTJK22", { ...cases.get("HVI-TESTJK22"), athleticRecord: { level: "standout", played: ["basketball", "soccer", "baseball"], track: true, by: "operator", at: "x" } });
  me = await LE.myEntry(io, "HVI-TESTJK22", close1 - 1e6);
  eq([me.body.record, me.body.entry.r, me.body.preview], [{ level: "standout", played: ["baseball", "basketball", "soccer"], track: true }, { basketball: 70, soccer: 70 }, { baseball: 69, basketball: 70, football: 67, soccer: 70, tennis: 66 }], "the record set on the case: shown, and the standing entry re-rated");
  const snapR = await LE.freezeSeason(store, S1, close1 + 1000);
  eq(snapR.entries.find(e => e.key === "citizen-jk22"), { key: "citizen-jk22", sports: ["basketball", "soccer"], r: { basketball: 70, soccer: 70 }, record: { level: "standout", played: ["baseball", "basketball", "soccer"], track: true } }, "the snapshot carries the record and the ratings it drew");
  cases.set("HVI-TESTJK22", { ...cases.get("HVI-TESTJK22"), athleticRecord: { level: "varsity", played: [], track: false } });
  await LE.myEntry(io, "HVI-TESTJK22", close1 + 2000);
  eq((await store.get(LE.KEYS.snap(S1 + 1), { type: "json" })).entries.find(e => e.key === "citizen-jk22").r, { basketball: 70, soccer: 70 }, "a record changed after the close: the frozen snapshot keeps its ratings");
  ok(!JSON.stringify(raw()).includes("HVI-TEST"), "still no case number in the store");
  // rate limits: revisions per draft, and the address's
  const codes = [];
  for (let i = 0; i < LE.LIMITS.revisions + 2; i++) codes.push((await LE.setEntry(io, { caseId: "HVI-TESTCD34", sports: i % 2 ? ["tennis"] : ["soccer"], ip: "2.2.2.2", now: after + 1e6 + i })).status);
  ok(codes.slice(0, LE.LIMITS.revisions).every(c => c === 200) && codes[LE.LIMITS.revisions] === 429, `${LE.LIMITS.revisions} filings before one draft, then refused (${codes})`);
  const io2 = { ...io, hitLimit: async () => ({ ok: false }) };
  ok((await LE.setEntry(io2, { caseId: "HVI-TESTAB12", sports: ["soccer"], ip: "3.3.3.3", now: after + 2e6 })).status === 429, "the address's hourly limit refuses");
  await LE.dropEntry(store, "HVI-TESTCD34");
  ok(!(await store.get(LE.KEYS.entry(LE.entryKey("HVI-TESTCD34")), { type: "json" })), "a purge or a harm finding drops the entry");
  globalThis.__blobs = new Map();
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

  // CANDIDACY: a player declares where its citizen lives or works; other files may then write it
  // in (as SUBJECT and its tag, no statement); undeclared citizens stay closed; limits; no ids.
  {
    const tags = Array.from({ length: 24 }, (_, i) => `q${String(i).padStart(3, "0")}`);
    const cz = tags.map(t => ({ slug: `citizen-${t}`, name: `Subject ${t.toUpperCase()}`, kind: "citizen", score: 500, tier: "ORDINARY" }));
    const roster3 = [...roster2, ...cz];
    const pool3 = EL.writeinPool(roster3, meta, closed);
    const caseOf = (t) => `HVI-D000${t.toUpperCase()}`;
    const ok1 = { history: [{ score: 500, tier: "ORDINARY", breakdown: base[0].breakdown }] };
    for (const t of tags) cases.set(caseOf(t), ok1);
    // two citizens sharing a race
    const dOf = new Map(cz.map(s => [s.slug, EL.districtsOf(s)]));
    let A = null, B = null, D = null;
    for (const a of cz) {
      for (const b of cz) if (a !== b) { const d = dOf.get(a.slug).find(x => dOf.get(b.slug).includes(x) && sl[x]?.length); if (d) { A = a; B = b; D = d; break; } }
      if (A) break;
    }
    ok(A && B && D, `two citizens share a race (${D})`);
    const U = cz.find(s => s !== A && s !== B && dOf.get(s.slug).includes(D));
    const tagOf = (s) => s.slug.slice(8);
    const cA = caseOf(tagOf(A)), cB = caseOf(tagOf(B));
    globalThis.__blobs = new Map();
    const st = getStore({ name: EL.STORE });
    lim.clear();
    const io3 = { ...io, store: st, census: async () => roster3, writeins: async () => pool3 };
    const T = t0 + 1000;
    await EL.publicView(io3, t0);
    const decl = (caseId, district, o = {}) => EL.declareCandidacy(io3, { caseId, district, ip: "dip-a", device: null, now: T, ...o });
    const ballot = (caseId, writein, o = {}) => EL.castBallot(io3, { caseId, district: D, writein, candidate: null, ip: `b-${caseId}`, device: null, now: T, ...o });
    // the live cycle: a few ballots first, then a snapshot of everything but the candidacy keys
    await ballot(caseOf(tags[20]), null, { candidate: sl[D][0].key, writein: null });
    const liveKeys = () => JSON.stringify([...globalThis.__blobs.get(EL.STORE)].filter(([k]) => !/\/(decl|cands|dip|ddev)/.test(k)).map(([k, v]) => [k, v.data]));
    const snap = liveKeys();
    // not yet declared: nobody else can pick A
    let r = await ballot(cB, A.slug);
    ok(r.status === 400 && r.body.error === EL.WRITEIN_REFUSED, "an undeclared citizen: refused, neutrally");
    ok(!EL.writeinSearch(pool3, D, A.name, EL.selfWriteIn(pool3, cB, ok1), { declared: [] }).some(h => h.key === A.slug), "an undeclared citizen: never offered to others");
    // declare
    r = await decl(cA, D);
    ok(r.status === 200 && r.body.declared.includes(D) && r.body.key === A.slug && r.body.name === `Subject ${tagOf(A).toUpperCase()}`, "a player declares in a race where its citizen lives or works");
    r = await decl(cA, D);
    ok(r.status === 200 && r.body.unchanged, "declaring twice changes nothing");
    const awayA = DIST.find(x => sl[x]?.length && !dOf.get(A.slug).includes(x));
    r = await decl(cA, awayA);
    ok(r.status === 403 && r.body.error === EL.DECLARE_REFUSED, "not where it neither lives nor works: refused, neutrally");
    ok(liveKeys() === snap, "declaring touches no ballot, tally or cycle record");
    let cands = await EL.readCands(st, 1);
    ok(Object.values(cands[D]).includes(A.slug) && Object.keys(cands[D]).every(k => k === EL.voterKey(cA)), "the list of the declared, keyed by voter key");
    // others can find and pick it
    const declared = Object.values(cands[D]);
    const hits = EL.writeinSearch(pool3, D, `subject ${tagOf(A)}`, EL.selfWriteIn(pool3, cB, ok1), { declared });
    ok(hits[0]?.key === A.slug && hits[0].declared && !hits[0].self && hits[0].name === `Subject ${tagOf(A).toUpperCase()}`, "another file finds the declared citizen by tag");
    ok(!EL.writeinSearch(pool3, D, U.name, null, { declared }).some(h => h.key === U.slug), "undeclared citizens stay out of the picker");
    ok(EL.writeinFor(pool3, awayA, A.slug, null, declared) === null, "declared in one race is not a write-in in another");
    r = await ballot(cB, A.slug);
    ok(r.status === 200 && r.body.mine[D] === A.slug && r.body.mineWrite[D].name === `Subject ${tagOf(A).toUpperCase()}`, "another player writes the declared citizen in");
    r = await ballot(cB, U.slug);
    ok(r.status === 400 && r.body.error === EL.WRITEIN_REFUSED, "an undeclared citizen in the same race: still refused");
    // the board: declared shown at the same threshold
    let v = await EL.publicView(io3, T + 10);
    ok(v.races[D].declared === 1 && v.races[D].writeins.length === 0 && v.races[D].writeinOther === 1, "declared: counted; below the threshold the write-in is only a number");
    await ballot(caseOf(tags[21]), A.slug); await ballot(caseOf(tags[22]), A.slug);
    v = await EL.publicView(io3, T + 20);
    const wa = v.races[D].writeins.find(w => w.key === A.slug);
    ok(wa && wa.votes === 3 && wa.declared && wa.living && wa.platform === null, `at ${EL.WRITEIN_SHOW} ballots the declared citizen joins the board, no statement`);
    const my = await EL.myCandidacy(io3, cA, T + 20);
    ok(my.open && my.districts.find(x => x.id === D)?.declared && my.districts.every(x => dOf.get(A.slug).includes(x.id)), "MY FILE lists where it may stand and where it has declared");
    const pub = JSON.stringify(v) + JSON.stringify(my) + JSON.stringify(hits) + JSON.stringify(r.body);
    for (const c of [cA, cB]) ok(!pub.includes(c) && !pub.includes(c.slice(4)) && !pub.includes(EL.voterKey(c)), "no case number or voter key in any response");
    ok(!pub.includes('"by"') || !JSON.stringify(v).includes(EL.voterKey(cA)), "the list of the declared is never served");
    // the harm-found, the unassessed and the off-census cannot declare
    cases.set("HVI-D000HARM", { history: [{ score: 300, breakdown: bad.serious.breakdown }] });
    ok((await decl("HVI-D000HARM", D)).body.error === EL.DECLARE_REFUSED, "a file with a harm finding cannot declare, the same words");
    cases.set("HVI-D000PEND", { history: [{ score: 300, breakdown: base[0].breakdown }], harmReviewPending: true });
    ok((await decl("HVI-D000PEND", D)).body.error === EL.DECLARE_REFUSED, "a harm review pending: refused");
    cases.set("HVI-D000NONE", { history: [] });
    ok((await decl("HVI-D000NONE", D)).status === 403, "an unassessed file cannot declare");
    cases.set("HVI-D000ZZZZ", ok1);
    ok((await decl("HVI-D000ZZZZ", D)).body.error === EL.DECLARE_REFUSED, "a citizen not on the census cannot declare");
    ok((await decl("HVI-D000MISS", D)).status === 404, "no file, no filing");
    // limits: per device, per address, per case per cycle
    const dev = "ab".repeat(16);
    const onDev = cz.filter(s => s !== A && s !== B).slice(0, 3);
    const rd = [];
    for (const s of onDev) rd.push(await decl(caseOf(tagOf(s)), dOf.get(s.slug).find(x => sl[x]?.length), { ip: "dip-dev", device: dev }));
    ok(rd[0].status === 200 && rd[1].status === 200 && rd[2].status === 429, `${EL.LIMITS.casesPerDevice} files declare from one device, no more`);
    const onIp = cz.filter(s => s !== A && s !== B && !onDev.includes(s)).slice(0, EL.LIMITS.casesPerIp + 1);
    const ri = [];
    for (const s of onIp) ri.push(await decl(caseOf(tagOf(s)), dOf.get(s.slug).find(x => sl[x]?.length), { ip: "dip-ip" }));
    ok(ri.slice(0, -1).every(x => x.status === 200) && ri.at(-1).status === 429, `${EL.LIMITS.casesPerIp} files declare from one address, no more`);
    const tog = onIp[0], tc = caseOf(tagOf(tog)), td = dOf.get(tog.slug).find(x => sl[x]?.length);
    let last;
    for (let i = 0; i < EL.LIMITS.declarations; i++) last = await decl(tc, td, { ip: "dip-ip", withdraw: i % 2 === 0 });
    ok(last.status === 429, `${EL.LIMITS.declarations} filings per file per cycle, then no more`);
    ok((await EL.declareCandidacy(io3, { caseId: cA, district: D, ip: "dip-a", device: null, now: v0.closeAt + 1 })).status === 403, "no filings after the close");
    // withdraw: others can no longer pick it; ballots already cast still count; places given back
    r = await decl(cA, D, { withdraw: true });
    ok(r.status === 200 && r.body.withdrawn && !r.body.declared.length, "a candidacy is withdrawn");
    cands = await EL.readCands(st, 1);
    ok(!Object.values(cands[D] || {}).includes(A.slug), "off the list of the declared");
    ok(!(await st.get(EL.KEYS.dip(1, "dip-a"), { type: "json" })).keys.includes(EL.voterKey(cA)), "the address's place is given back");
    r = await ballot(caseOf(tags[23]), A.slug);
    ok(r.status === 400 && r.body.error === EL.WRITEIN_REFUSED, "withdrawn: no new write-ins");
    v = await EL.publicView(io3, T + 30);
    ok(v.races[D].writeins.find(w => w.key === A.slug)?.votes === 3 && !v.races[D].writeins.find(w => w.key === A.slug).declared, "ballots already cast still count");
    // a harm finding withdraws it (intake-score.js)
    await decl(cB, D, { ip: "dip-b" });
    ok(Object.values((await EL.readCands(st, 1))[D]).includes(B.slug), "B declared");
    eq(await EL.dropCandidacy(st, cB, T + 40), [D], "a harm finding drops every candidacy the file holds");
    ok(!Object.values((await EL.readCands(st, 1))[D] || {}).includes(B.slug), "dropped from the list");
    // the live cycle's records: untouched by any of it (the ballots aside)
    await ballot(cB, null, { writein: null }); await ballot(caseOf(tags[21]), null, { writein: null }); await ballot(caseOf(tags[22]), null, { writein: null });
    const t2 = await EL.readTally(st, 1, D);
    ok(EL.countsOf(t2.seen, sl[D].length).writeins[A.slug] === undefined, "the test ballots withdrawn");
    const liveNow = JSON.parse(liveKeys()).filter(([k]) => !/\/(v|t|ip)\//.test(k) && !/\/t\//.test(k));
    const liveThen = JSON.parse(snap).filter(([k]) => !/\/(v|t|ip)\//.test(k) && !/\/t\//.test(k));
    eq(liveNow, liveThen, "declaring and withdrawing leave the cycle's meta, anchor and result as they were");
    SIM.setRoster(roster);
  }
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
  // the league's ten (teams and all) within 1,100 bytes each; every other district's record its own small share
  const core = JSON.stringify({ ...b, districts: Object.fromEntries(DIST.map(id => [id, b.districts[id]])) }).length;
  const rest = Math.max(0, ...Object.keys(b.districts).filter(id => !DIST.includes(id)).map(id => JSON.stringify(b.districts[id]).length));
  ok(core / DIST.length < 1100 && rest < 520, `${n}: ${bytes} bytes; the league's ten ${Math.round(core / DIST.length)} each, the largest other district ${rest}`);
}
ok(sizes[sizes.length - 1][1] < sizes[0][1] * 1.4, `the block does not grow with the census (${sizes.map(s => s[1]).join(" / ")} bytes)`);
SIM.setRoster(roster);

// ---- 5. the builder writes it into every summary, chained ---------------------------------------
{
  const { getStore } = await import("@netlify/blobs");
  const store = () => getStore({ name: PL.STORE });
  const census = roster.filter(s => s.engine || s.kind === "citizen");
  let asked = null;
  const io = () => PL.planIo(store, { census: async () => census, snapshots: async () => ({}), civic: async () => null, entries: async (days) => { asked = days; return { 99: [] }; } });
  const ms = (day, hour = 0) => SIM.CITY_EPOCH + ((day - 1) * 24 + hour) * 60 * 60 * 1000 / SIM.DEFAULT_SCALE;
  globalThis.__blobs = new Map();
  const T = D0 + 1;
  await PL.buildPlans(ms(T, 5), io());
  ok(Array.isArray(asked) && asked.includes(T) && asked.includes(T + PL.LOOKAHEAD) && C.entriesRecord()[99], "the builder reads the league entries for the days it folds, before it folds");
  C.setEntries({});
  const raw = (k) => globalThis.__blobs.get(PL.STORE)?.get(k)?.data ?? null;
  const m2 = () => raw(PL.MANIFEST2);
  const sum = (d) => raw(PL.partKey(d, m2().days[d].ver, "summary"));
  const days = Object.keys(m2().days).map(Number).sort((a, b) => a - b);
  ok(days.length === 3 && days.every(d => sum(d)?.civic?.v === C.CIVIC_V), `every split day's summary carries its civic block (${days})`);
  for (const d of days.slice(1)) for (const id of DIST) ok(sum(d).civic.districts[id].mood.was === sum(d - 1).civic.districts[id].mood.raw, `day ${d} ${id}: chained from yesterday's summary`);
  // the league's ten (their teams included) and the league block within the old bound; every other
  // district (the Coast, the Heights, PHASE 2's: a mood, a seat, a prefect) a small record of its own
  const civ = (d) => sum(d).civic, others = (d) => Object.keys(civ(d).districts).filter(id => !DIST.includes(id));
  const core = (d) => JSON.stringify({ ...civ(d), districts: Object.fromEntries(DIST.map(id => [id, civ(d).districts[id]])) }).length;
  const rest = (d) => Math.max(0, ...others(d).map(id => JSON.stringify(civ(d).districts[id]).length));
  ok(days.every(d => core(d) < 1100 * DIST.length && rest(d) < 520), `the summary's civic block stays small (the league's ten ${days.map(d => Math.round(core(d) / DIST.length)).join(", ")} B each < 1100; the largest other district ${days.map(rest).join(", ")} B < 520)`);
  // Yesterday's summary lost, today re-split: recomputed from yesterday's plan, the same block.
  const d = days[2], want = sum(d).civic;
  const s = globalThis.__blobs.get(PL.STORE);
  s.delete(PL.partKey(d - 1, m2().days[d - 1].ver, "summary"));
  for (const k of [...s.keys()]) if (k.startsWith(`f2/day/${d}/`)) s.delete(k);
  const m = s.get(PL.MANIFEST2); delete m.data.days[d];
  await PL.buildPlans(ms(T, 6), io());
  eq(sum(d).civic, want, `day ${d}: re-split without yesterday's summary, the block is the chained one`);
}

console.log(`check-civic: leagues first picks: ${globalThis.__firstPicks?.join(" | ")}. league spreads ${globalThis.__sportSpread?.join(", ")}. ${globalThis.__boxes} box scores summed. leagues block bytes: ${globalThis.__lgSizes?.map(([n, b, t]) => `${n}: ${b} B (${Math.round(b / DIST.length)}/district, fold ${t} ms)`).join("; ")}`);
console.log(`check-civic: ${checks} checks passed. entrant lines: ${globalThis.__entrantLines}. draft spread ${globalThis.__draftSpread?.join(" -> ")} (cap demo ${globalThis.__capDemo?.map(x => typeof x === "number" ? +x.toFixed(1) : x).join(" -> ")}). civic block bytes by roster: ${sizes.map(([n, b, t]) => `${n}: ${b} B (${Math.round(b / DIST.length)}/district, fold ${t} ms)`).join("; ")}`);
