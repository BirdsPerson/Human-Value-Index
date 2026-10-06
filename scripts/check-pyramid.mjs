// THE LEAGUE PYRAMID (docs/design/PYRAMID.md; src/city/leagues.js, src/city/civic.js). Holds:
//   (a) season 23's days fold byte-for-byte as before the pyramid (scripts/fixtures/leagues-s23-prechange.json,
//       built from origin/main 1189674 before any edit: the chain and the census-only recompute);
//   (b) at 1,000 and 5,000 subjects every division has exactly ten clubs, every club is in one division a
//       sport, every rostered player is on one roster, D is what the census says;
//   (c) the top flight's mean rating is the highest and every band's mean is above the band below;
//   (d) season 24's end is applied exactly to season 25's divisions (three down: the table's last three;
//       three up: the top two and the promotion playoff's winner), and the census-only recompute of
//       season 25's draft day agrees with the chain;
//   (e) the Cup sums every division at its weight, over every district with a club;
//   (f) an entrant's first standing is one below the band of their rating (never the top flight); a
//       promoted club's entrant rises; a relegated club's falls; a withdrawn-and-refiled entry starts over;
//   (g) the paper's section carries the divisions, the games' leagueFrom reads them and the difficulty
//       hook defaults EASY below the top flight;
//   (h) the fold of a late season-24 day, the draft day and the browser's view are inside the budgets.
// No network. Run: node scripts/check-pyramid.mjs [--quick]
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const quick = process.argv.includes("--quick");
const SIM = await import("../src/city/sim.js");
const C = await import("../src/city/civic.js");
const L = await import("../src/city/leagues.js");
const { synthRoster } = await import("../scripts/synth-roster.mjs");
const { sportsSection } = await import("../netlify/lib/paper-sports.js");
const RS = await import("../src/play/soccer/roster.js");
const RH = await import("../src/play/hoops/roster.js");
const RF = await import("../src/play/football/roster.js");

let checks = 0;
const ok = (c, m) => { checks++; assert.ok(c, m); };
const eq = (a, b, m) => { checks++; assert.deepEqual(a, b, m); };
const sha = (x) => createHash("sha256").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex");
const clone = (x) => JSON.parse(JSON.stringify(x));
const peopleOf = (roster) => new Map(roster.map(s => [SIM.keyOf(s), s]));
const mean = (xs) => xs.reduce((n, x) => n + x, 0) / Math.max(1, xs.length);
const DIST = SIM.LOOP_DISTRICTS.map(d => d.id);
const S24 = L.PYRAMID_FROM, D24 = L.seasonStart(S24), D25 = L.seasonStart(S24 + 1);
ok(S24 === 23 && D24 === 2417 && D25 === 4217, "the pyramid opens season 24, machine day 2417; season 25 opens day 4217");

// ---- (a) season 23 byte-identical to the pre-change fixture ---------------------------------------------
{
  const fx = JSON.parse(readFileSync(new URL("./fixtures/leagues-s23-prechange.json", import.meta.url), "utf8"));
  const roster = synthRoster(430, { seed: 42 }); SIM.setRoster(roster); SIM.clearPlans();
  const people = peopleOf(roster);
  const DAYS = Object.keys(fx.days).map(Number).sort((a, b) => a - b);
  const plans = new Map(DAYS.map(d => [d, clone(SIM.buildPlan(d))]));
  let prev = null;
  for (const d of DAYS) {
    const want = fx.days[d], chained = prev && prev.day === d - 1 ? prev : null;
    const b = C.civicFold(plans.get(d), people, chained), alone = C.civicFold(plans.get(d), people, null);
    ok(sha(b.leagues) === want.leagues && sha(Object.fromEntries(Object.keys(b.districts).map(id => [id, b.districts[id].teams || null]))) === want.teams, `day ${d} (season ${want.season}): the leagues block and every team record are byte-identical to the pre-change fixture`);
    ok(sha(alone.leagues) === want.aloneLeagues, `day ${d}: the census-only recompute is byte-identical too`);
    if (sha(plans.get(d)) === want.plan) ok(sha(b) === want.block && sha(alone) === want.alone, `day ${d}: the whole block is byte-identical (same plan)`);
    ok(!b.leagues.pyramid && Object.values(b.districts).every(x => !x.teams || Object.values(x.teams).every(t => t.div === undefined && t.club === undefined)), `day ${d}: no pyramid key before season 24`);
    prev = b;
  }
}

// ---- the pyramid at a census: seasons 24 and 25, chained from season 23's last day -----------------------
function run(n, seed = 42, entries = null) {
  const roster = synthRoster(n, { seed }); SIM.setRoster(roster); SIM.clearPlans();
  if (entries) C.setEntries(entries); else C.setEntries({});
  const people = peopleOf(roster);
  const DAYS = [D24 - 1, D24, D24 + 1, D24 + 600, D25 - 1, D25, D25 + 1];
  const plans = new Map(DAYS.map(d => [d, clone(SIM.buildPlan(d))]));
  const blocks = new Map(), ms = new Map();
  let prev = null;
  for (const d of DAYS) {
    const t0 = performance.now();
    const b = C.civicFold(plans.get(d), people, prev && prev.day === d - 1 ? prev : null);
    ms.set(d, performance.now() - t0);
    blocks.set(d, b); prev = b;
  }
  return { roster, people, plans, blocks, ms };
}
const E = L.eligibleCount;
for (const n of quick ? [1000] : [1000, 5000]) {
  const { roster, people, plans, blocks, ms } = run(n);
  const b23 = blocks.get(D24 - 1), b24 = blocks.get(D24), b24b = blocks.get(D24 + 600), b24e = blocks.get(D25 - 1), b25 = blocks.get(D25);
  const subjects = Object.keys(plans.get(D24).subjects).map(k => people.get(k));
  const D = L.divisionsFor(E(subjects));
  ok(!b23.leagues.pyramid && b24.leagues.pyramid?.v === L.PYRAMID_V && b24.leagues.pyramid.divs === D, `${n}: season 23's last day has no pyramid; season 24's first day founds one with D = ${D} (eligible ${E(subjects)})`);
  ok(D === Math.min(L.DIV_MAX, Math.floor(E(subjects) / 360)) && D >= 2, `${n}: D is one band of 360 eligible figures each, capped at ${L.DIV_MAX}`);
  const roster0 = roster.slice(); const withCz = [...roster0, ...Array.from({ length: 50 }, (_, i) => ({ slug: `citizen-z${i}`, name: `Citizen Z${i}`, kind: "citizen", score: 500, tier: "TOLERATED GENERALIST" }))];
  ok(E(withCz) === E(roster0), `${n}: citizens (and so entries) never change the division count`);
  // (b) sizes and membership
  for (const b of [b24, b24b, b25]) for (const sp of L.SPORTS) {
    const py = b.leagues.pyramid, divs = py.clubs[sp];
    ok(divs.length === D && divs.every(ids => ids.length === L.DIV_N), `${n} day ${b.day} ${sp}: ${D} divisions of ${L.DIV_N} clubs`);
    const all = divs.flat();
    ok(new Set(all).size === all.length, `${n} day ${b.day} ${sp}: every club in one division`);
    const players = all.flatMap(c => C.clubRoster(b, c, sp).map(p => p[0]));
    ok(new Set(players).size === players.length && players.length === all.length * L.SPORT[sp].n, `${n} day ${b.day} ${sp}: ${players.length} rostered players, each on one roster, ${L.SPORT[sp].n} a side`);
    for (const c of all) { const t = L.clubTier(c) === 1 ? b.districts[c]?.teams?.[sp] : b.leagues.reserves?.[c]?.teams?.[sp]; ok(t && t.club === c && t.div === divs.findIndex(ids => ids.includes(c)) && t.roster.length === L.SPORT[sp].n, `${n} day ${b.day} ${sp}: ${c}'s record carries its club and division`); }
    // (c) the bands' strength
    const means = divs.map(ids => mean(ids.flatMap(c => C.clubRoster(b, c, sp).map(p => p[2]))));
    for (let k = 1; k < D; k++) ok(means[k - 1] > means[k], `${n} day ${b.day} ${sp}: ${L.divShort(k - 1)} (${means[k - 1].toFixed(1)}) is stronger than ${L.divShort(k)} (${means[k].toFixed(1)})`);
    if (b === b24) (globalThis.__bands ||= []).push(`${n} ${sp}: ${means.map(x => x.toFixed(1)).join(" > ")}`);
  }
  // every player once across the four sports
  { const everyone = L.SPORTS.flatMap(sp => b24.leagues.pyramid.clubs[sp].flat().flatMap(c => C.clubRoster(b24, c, sp).map(p => p[0]))); ok(new Set(everyone).size === everyone.length, `${n}: nobody plays two sports`); }
  // season 24: the Loop is the Premier, the expansion districts the Championship (the founding)
  for (const sp of L.SPORTS) {
    eq([...b24.leagues.pyramid.clubs[sp][0]].sort(), [...DIST].sort(), `${n} ${sp}: season 24's Premier Division is the Loop's ten`);
    eq([...b24.leagues.pyramid.clubs[sp][1]].sort(), Object.keys(L.EXPANSION_CLUBS).sort(), `${n} ${sp}: season 24's Championship is the ten expansion districts' clubs`);
    eq(b24.leagues.pyramid.moves[sp], { up: [], down: [] }, `${n} ${sp}: no exchange in the founding season`);
    eq(b24.leagues.sports[sp].draft, b24.leagues.sports[sp].divs[0].draft, `${n} ${sp}: the Premier's draft is the sport's draft (the old key)`);
    const e23 = L.sportEnd(sp, S24 - 1, Object.fromEntries(DIST.map(id => [id, C.clubRoster(b23, id, sp)])));
    eq(b24.leagues.sports[sp].draft.order, L.draftOrder(e23.table, e23.champion), `${n} ${sp}: the Premier drafts in the reverse of season 23's table, the champion last`);
  }
  // (d) season 24's end -> season 25's divisions
  for (const sp of L.SPORTS) {
    const c24 = b24.leagues.pyramid.clubs[sp], c25 = b25.leagues.pyramid.clubs[sp], mv = b25.leagues.pyramid.moves[sp];
    const ends = c24.map((ids, k) => L.sportEnd(sp, S24, Object.fromEntries(ids.map(id => [id, C.clubRoster(b24e, id, sp)])), ids, k));
    for (let k = 0; k + 1 < Math.min(c24.length, c25.length); k++) {
      const down = ends[k].table.slice(-L.UP_N), want = ends[k + 1].up;
      ok(down.every(c => c25[k + 1].includes(c) && !c25[k].includes(c)), `${n} ${sp}: ${L.divShort(k)}'s last three (${down.join(", ")}) are in ${L.divShort(k + 1)} in season 25`);
      // who came up: three clubs of the division below; the two automatic places and the playoff winner
      // unless a reserve side would join a lower-tier club of its district (the next in the table instead)
      const came = c25[k].filter(c => c24[k + 1].includes(c));
      ok(came.length === L.UP_N && came.every(c => !c25[k + 1].includes(c)), `${n} ${sp}: three clubs came up from ${L.divShort(k + 1)} into ${L.divShort(k)} (${came.join(", ")})`);
      const home = c25[k].filter(c => !came.includes(c));
      const blocked = (c) => L.clubTier(c) > 1 && home.some(h => L.clubDistrict(h) === L.clubDistrict(c) && L.clubTier(h) < L.clubTier(c));
      for (const c of want) ok(blocked(c) ? !came.includes(c) : came.includes(c), `${n} ${sp}: ${c} (${want.indexOf(c) < 2 ? "automatic" : "playoff winner"}) ${blocked(c) ? "is a reserve blocked by its first team and stays down" : "goes up"}`);
      const extra = came.filter(c => !want.includes(c)), belowDown = ends[k + 1].table.slice(-L.UP_N);
      ok(extra.every(c => !belowDown.includes(c) && !blocked(c)), `${n} ${sp}: a replacement for a blocked reserve comes from the table, not the relegation zone`);
      ok(down.every(c => mv.down.includes(c)) && came.every(c => mv.up.includes(c)), `${n} ${sp}: the moves are recorded in the block`);
      // the playoff winner is the promotion final's winner, 3rd..6th only
      const V = C.leaguesView(b24e), fin = V.div(sp, k + 1).all.find(m => m.stage === "final");
      ok(fin && L.winnerOf(fin) === want[2] && ends[k + 1].table.slice(2, L.SPORT[sp].finalOnly ? 4 : 6).includes(want[2]), `${n} ${sp}: ${L.divShort(k + 1)}'s third place up is the promotion final's winner, from the playoff places`);
      ok(ends[k + 1].table.slice(0, 2).every(c => want.includes(c)), `${n} ${sp}: the top two are the automatic places`);
    }
    for (let k = 0; k < c24.length; k++) {
      const left = c24[k].filter(c => !c25[k]?.includes(c));
      ok(left.every(c => (k + 1 < c25.length && c25[k + 1].includes(c)) || (k > 0 && c25[k - 1].includes(c))), `${n} ${sp}: whoever left ${L.divShort(k)} moved one division (${left.join(", ") || "nobody"})`);
    }
  }
  // the chain and the census-only recompute agree on season 25's draft
  const alone25 = C.civicFold(plans.get(D25), people, null);
  eq(alone25.leagues, b25.leagues, `${n}: season 25's draft day from the census alone equals the chain's`);
  eq(C.civicFold(clone(plans.get(D25)), peopleOf(clone(roster)), clone(b24e)), b25, `${n}: season 25's draft day is deterministic`);
  // (e) the Cup over every division
  {
    const h = 24, cup = C.cupTableAt(b24e, h), districts = C.cupDistricts(b24e);
    ok(cup.length === districts.length && districts.length === 20, `${n}: twenty districts in the Cup`);
    for (const r of cup) {
      let want = 0;
      for (const sp of L.SPORTS) b24e.leagues.pyramid.clubs[sp].forEach((ids, k) => { const p = L.positionPoints(sp, C.decidedAt(b24e, sp, h, k), ids, k); for (const c of ids) if (L.clubDistrict(c) === r.id) want += p[c]; });
      ok(r.pts >= want && Object.values(r.by).reduce((a, x) => a + x, 0) === r.pts, `${n}: ${r.id}'s Cup points sum its clubs in every division (${want} from the leagues) plus the individuals`);
    }
    const champ = cup.find(r => r.id === b24e.leagues.sports.soccer.divs[1].table[0]);
    ok(champ, "the Championship's soccer leader is a Cup district");
    ok(b24e.districts.coast.cup.pos != null && b24e.districts.coast.teams?.soccer?.div === 1, `${n}: the Coast is in the Cup with a Championship club`);
    const lower = L.positionPoints("soccer", C.decidedAt(b24e, "soccer", h, 1), b24e.leagues.pyramid.clubs.soccer[1], 1);
    ok(Math.max(...Object.values(lower)) === 5, `${n}: the Championship pays 5 to its first place`);
  }
  // (h) budgets (this Mac; the function is ~9x slower: the budgets leave that room)
  const late = ms.get(D25 - 1), draft = ms.get(D25);
  ok(late < 1500, `${n}: the fold of season 24's last day took ${Math.round(late)} ms (< 1500)`);
  ok(draft < 6000, `${n}: season 25's draft day fold took ${Math.round(draft)} ms (< 6000)`);
  { const t0 = performance.now(); const b = clone(b24e); const V = C.leaguesView(b); for (const sp of L.SPORTS) for (let k = 0; k < V.pyramid.divs; k++) C.sportTableAt(b, sp, 20, k); C.cupTableAt(b, 20); const t = performance.now() - t0; ok(t < 800, `${n}: a browser's view of every division on the season's last day took ${Math.round(t)} ms (< 800)`); (globalThis.__times ||= []).push(`${n}: late fold ${Math.round(late)} ms, draft ${Math.round(draft)} ms, view ${Math.round(t)} ms, block ${JSON.stringify(b24e).length} B`); }
  ok(JSON.stringify(b24e).length < 160000, `${n}: the block stays under 160 KB (${JSON.stringify(b24e).length} B)`);
  // (g) the paper and the games read the pyramid
  {
    const T = (D25 - 2) * 24 + 23, sec = sportsSection(b24e, T, T - 24);
    ok(sec.leagues.every(lg => lg.division === L.divName(0) && lg.divisions.length === D - 1 && lg.divisions[0].name === L.divName(1) && lg.divisions[0].leader && lg.divisions[0].drop.length === L.UP_N), `${n}: the paper's sports section carries every lower division with its leader and drop zone`);
    ok(sec.cup.rows.length === 20, `${n}: the paper's Cup lists twenty districts`);
    const sec25 = sportsSection(b25, D25 * 24 + 1, D25 * 24), heads = sec25.headlines.filter(h => h.kind === "pyramid");
    ok(heads.length === L.SPORTS.length && heads.every(h => /PROMOTED/.test(h.text) && /RELEGATED/.test(h.text)), `${n}: the boundary edition headlines promotion and relegation in every sport`);
    const sum = { day: b24e.day, civic: b24e };
    for (const [R, sp, n0] of [[RS, "soccer", 11], [RH, "basketball", 5], [RF, "football", 11]]) {
      const lg = R.leagueFrom(sum);
      ok(lg && lg.divisions.length === D && Object.keys(lg.teams).length === D * L.DIV_N && Object.values(lg.teams).every(t => t.length === n0), `${n} ${sp}: the game reads ${D * L.DIV_N} clubs in ${D} divisions`);
      ok(R.difficultyOf(lg, 0).cpu === 1 && !R.difficultyOf(lg, 0).easy && R.difficultyOf(lg, D - 1).cpu === 0 && R.difficultyOf(lg, D - 1).easy, `${n} ${sp}: the top flight is the hardest, the bottom division easy`);
      ok(R.defaultLevelIndex(lg, 0, 6) === 5 && R.defaultLevelIndex(lg, D - 1, 6) === 0 && R.defaultLevelIndex(lg, D - 1, 4) === 0 && R.defaultLevelIndex(lg, 0, 3) === 2, `${n} ${sp}: the default level maps the division onto the game's ladder`);
      const [h0, a0] = R.playNowPair(lg, null);
      ok(R.divisionOf(lg, h0) === D - 1 && R.divisionOf(lg, a0) === D - 1, `${n} ${sp}: PLAY NOW for a visitor is a bottom-division fixture`);
      const top = lg.divisions[0][0];
      ok(R.divisionOf(lg, top) === 0 && R.difficultyOf(lg, R.divisionOf(lg, top)).name === L.divName(0), `${n} ${sp}: a Premier club maps to the Premier Division`);
      eq(R.DIV_NAMES, L.DIV_NAMES, `${sp}: the game names the divisions as the league does`);
      for (const id of Object.keys(L.EXPANSION_CLUBS)) ok(R.teamShort(id) === L.teamShort(id), `${sp}: ${id}'s club is named as the league names it (${R.teamShort(id)})`);
      ok(R.teamShort("arts-2") === L.teamShort("arts-2") && R.kitOf("arts-2")[0] === R.kitOf("arts")[1], `${sp}: reserves are named and kitted as the league says`);
      // without the pyramid: one division, the old pairing
      const old = R.leagueFrom({ day: b23.day, civic: b23 });
      ok(old && !old.divisions && R.divisionsOf(old).length === 1 && R.difficultyOf(old, 0).cpu === 1 && R.playNowPair(old, null)[0] === "hq", `${n} ${sp}: a season-23 block reads as one division, PLAY NOW as before`);
    }
  }
}
// ---- (f) the entrants' standings ------------------------------------------------------------------------
{
  const n = 1000, S = S24 + 1;   // entries in seasons 24 and 25 (the snapshot keys are 1-based)
  const since = "2026-10-06T00:00:00.000Z";
  const E24 = [{ key: "citizen-ab12", sports: ["soccer", "basketball"], r: { soccer: 70, basketball: 69 }, since }, { key: "citizen-cd34", sports: ["soccer"], r: { soccer: 48 }, since }];
  const { roster, people, plans, blocks } = run(n, 42, { [S24 + 1]: E24, [S + 1]: E24 });
  const b24 = blocks.get(D24), b24e = blocks.get(D25 - 1), b25 = blocks.get(D25), py24 = b24.leagues.pyramid, py25 = b25.leagues.pyramid;
  const D = py24.divs;
  for (const sp of ["soccer", "basketball"]) {
    const st = py24.standing["citizen-ab12"]?.[sp];
    ok(st && st.k === Math.min(D - 1, 1) && st.since === since, `${sp}: a first entry rated ~70 (the top band) starts one below the top flight (${L.divName(st?.k)})`);
    const club = py24.clubs[sp][st.k].find(c => C.clubRoster(b24, c, sp).some(p => p[0] === "citizen-ab12"));
    ok(club, `${sp}: the entrant is on a ${L.divName(st.k)} roster (${club})`);
  }
  ok(py24.standing["citizen-cd34"].soccer.k === D - 1, "a first entry rated 48 starts in the bottom division");
  ok(!L.SPORTS.some(sp => py24.clubs[sp][0].some(c => C.clubRoster(b24, c, sp).some(p => E24.some(e => e.key === p[0])))), "no first entry lands in the top flight");
  // season 25: the standing moves with the club, or with scouting
  for (const key of ["citizen-ab12", "citizen-cd34"]) {
    const sp = "soccer", st24 = py24.standing[key][sp], st25 = py25.standing[key][sp];
    const club = py24.clubs[sp][st24.k].find(c => C.clubRoster(b24, c, sp).some(p => p[0] === key));
    const mv = py25.moves[sp], up = mv.up.includes(club), down = mv.down.includes(club);
    const stats = L.seasonStats(sp, C.leaguesView(b24e).div(sp, st24.k).all, C.leaguesView(b24e).div(sp, st24.k).rosters);
    const top3 = Object.values(stats.players).map(x => [L.MVP_VALUE[sp](x), x]).sort((a, b) => b[0] - a[0] || b[1].r - a[1].r || (a[1].key < b[1].key ? -1 : 1)).slice(0, 3).map(x => x[1].key);
    const scouted = top3.includes(key);
    const want = up || scouted ? Math.max(0, st24.k - 1) : down ? Math.min(D - 1, st24.k + 1) : st24.k;
    ok(st25 && st25.k === want, `${key}: standing ${st24.k} -> ${st25.k} (club ${club}: ${up ? "promoted" : down ? "relegated" : "stayed"}${scouted ? ", scouted" : ""}; wanted ${want})`);
    if (st24.k === D - 1 && down && !scouted) ok(st25.stuck === true, `${key}: relegated with nowhere to go is marked stuck`);
    (globalThis.__standings ||= []).push(`${key}: ${L.divShort(st24.k)} -> ${L.divShort(st25.k)} (${up ? "up with the club" : down ? "down with the club" : "stayed"}${scouted ? ", scouted" : ""})`);
  }
  // a re-filed entry (another since) starts over
  const refiled = [{ ...E24[0], since: "2026-11-06T00:00:00.000Z" }, E24[1]];
  C.setEntries({ [S24 + 1]: E24, [S + 1]: refiled }); SIM.setRoster(roster); SIM.clearPlans();
  const b25r = C.civicFold(plans.get(D25), people, b24e);
  ok(b25r.leagues.pyramid.standing["citizen-ab12"].soccer.k === Math.min(D - 1, 1) && b25r.leagues.pyramid.standing["citizen-ab12"].soccer.since === refiled[0].since, "a re-filed entry starts over by the first-entry rule");
  // the census alone agrees with the chain, entries and all
  C.setEntries({ [S24 + 1]: E24, [S + 1]: E24 });
  eq(C.civicFold(plans.get(D25), people, null).leagues.pyramid.standing, py25.standing, "standings from the census alone equal the chain's");
  // twenty places a band, the oldest first; the twenty-first waits
  const many = Array.from({ length: 23 }, (_, i) => ({ key: `citizen-q${String(i).padStart(3, "0")}`, sports: ["soccer"], r: { soccer: 48 }, since: `2026-10-0${1 + (i % 9)}T00:00:0${i % 10}.000Z` }));
  const pools = L.pyramidPools(roster.filter(s => !/^citizen-/.test(SIM.keyOf(s))), many, D, () => null);
  const placed = pools.soccer.bands[D - 1].filter(x => /^citizen-q/.test(x.key)).map(x => x.key);
  ok(placed.length === L.ENTRANTS_MAX && pools.soccer.waiting.length === 3, `the bottom band takes ${L.ENTRANTS_MAX} entrants; ${pools.soccer.waiting.length} wait`);
  const bySince = [...many].sort((a, b) => (a.since < b.since ? -1 : 1)).slice(0, L.ENTRANTS_MAX).map(x => x.key).sort();
  eq(placed.sort(), bySince, "the oldest entries take the places");
  ok(pools.soccer.bands.every(b => b.length === L.DIV_N * 11), "every band keeps its size with entrants in it");
  C.setEntries({});
}
// ---- the pyramid's pure rules -------------------------------------------------------------------------------
{
  // nextDivisions: a founded division, an exchange, a dissolved one, the reserve rule
  const ids = (p, k) => Array.from({ length: 10 }, (_, i) => `${p}${k}${i}`);
  const A = ids("a", 0), B = ids("b", 1);
  const end = (t, upFrom = 2) => ({ table: t, up: [t[0], t[1], t[upFrom]], down: t.slice(-3) });
  const f = L.nextDivisions(null, { soccer: [end(A)], baseball: [end(A)], basketball: [end(A)], football: [end(A)] }, 2);
  eq(f.clubs.soccer[0], A, "the founding keeps division 0 in table order");
  ok(f.clubs.soccer[1].length === 10 && f.clubs.soccer[1].every(c => L.PYRAMID_CLUBS.includes(c)), "a founded division takes ten clubs from PYRAMID_CLUBS");
  eq(f.moves.soccer, { up: [], down: [] }, "no exchange with a founded division");
  const prev = { clubs: { soccer: [A, B], baseball: [A, B], basketball: [A, B], football: [A, B] } };
  const ends = Object.fromEntries(L.SPORTS.map(sp => [sp, [end(A), end(B, 4)]]));
  const x = L.nextDivisions(prev, ends, 2);
  eq(x.clubs.soccer[0], [...A.slice(0, 7), B[0], B[1], B[4]], "the exchange: the stayers, then the promoted (two automatic, the playoff winner)");
  eq(x.clubs.soccer[1], [...A.slice(7), ...B.slice(2, 4), ...B.slice(5)], "the relegated lead the division below, then its stayers");
  eq(x.moves.soccer, { up: [B[0], B[1], B[4]], down: A.slice(7) }, "the moves");
  const grown = L.nextDivisions(prev, ends, 3);
  ok(grown.clubs.soccer.length === 3 && grown.clubs.soccer[2].length === 10 && grown.clubs.soccer[2].every(c => !A.includes(c) && !B.includes(c)), "a third division is founded with new clubs; no exchange with the bottom until it exists");
  eq(grown.moves.soccer.down, A.slice(7), "the exchange between 0 and 1 still happens when a division is founded below");
  const shrunk = L.nextDivisions({ clubs: Object.fromEntries(L.SPORTS.map(sp => [sp, [A, B, ids("c", 2)]])) }, Object.fromEntries(L.SPORTS.map(sp => [sp, [end(A), end(B, 4), end(ids("c", 2))]])), 2);
  ok(shrunk.clubs.soccer.length === 2 && shrunk.clubs.soccer[1].every(c => A.includes(c) || B.includes(c)), "a dissolved division's clubs fall dormant; its division above keeps its ten");
  // the reserve rule: a reserve never goes up into its first team's division
  const P = [...DIST], Q = ["coast", "heights", "port", "oldtown", "uptown", "downtown", "arts-2", "suburbs", "airport", "farmland"];
  const r = L.nextDivisions({ clubs: Object.fromEntries(L.SPORTS.map(sp => [sp, [P, Q]])) }, Object.fromEntries(L.SPORTS.map(sp => [sp, [end(P), { table: Q, up: ["arts-2", "coast", "heights"], down: Q.slice(-3) }]])), 2);
  ok(!r.clubs.soccer[0].includes("arts-2") && r.clubs.soccer[0].includes("coast") && r.clubs.soccer[0].includes("heights") && r.clubs.soccer[0].includes("port"), "THE CURATED SECOND cannot join THE CURATED in the Premier: the next club in the table goes up instead");
  ok(L.teamName("arts-2") === "THE CURATED SECOND" && L.teamShort("arts-2") === "CURATED II" && L.sportTeamName("arts-2", "soccer") === "CURATED II F.C." && L.sportTeamName("coast", "baseball") === "THE LIFEGUARDED NINE", "the clubs' names");
  ok(L.PYRAMID_CLUBS.length === 50 && new Set(L.PYRAMID_CLUBS).size === 50 && L.PYRAMID_CLUBS.slice(0, 10).join() === DIST.join(), "fifty clubs in the founding order, the Loop first");
  // the rounds and the seeds of a lower division
  ok(L.roundsOf("baseball", 22, 1) === 288 && L.roundsOf("basketball", 22, 1) === 576 && L.roundsOf("football", 22, 1) === 99 && L.roundsOf("soccer", 22, 1) === 189, "the Championship plays half the rounds");
  ok(L.roundsOf("baseball", 22, 4) === 36 && L.roundsOf("basketball", 22, 4) === 72 && L.roundsOf("football", 22, 4) === 9 && L.roundsOf("soccer", 22, 4) === 27, "the Sunday League's rounds (36 / 72 / 9 / 27)");
  for (const sp of L.SPORTS) for (let k = 1; k < 3; k++) { const n = L.matchdays(sp, 23, k); ok(L.slotsOn(sp, L.seasonStart(23) + 5, k).every(x => x.md < n), `${sp} ${L.divShort(k)}: its matchdays fit its calendar`); }
  const rating = Object.fromEntries(DIST.map((id, i) => [id, 40 + i]));
  const top = L.sportSeason("soccer", 23, L.seasonStart(23) + 60, rating, DIST, 0), low = L.sportSeason("soccer", 23, L.seasonStart(23) + 60, rating, DIST, 1);
  ok(low.length && low.every(m => !m.featured && m.div === 1) && top.some(m => m.featured), "a lower division is all closed doors; the top flight has its board");
  const sameSlot = low.filter(m => top.some(t => t.day === m.day && t.from === m.from && t.j === m.j && t.sides.join() === m.sides.join()));
  ok(sameSlot.every(m => { const t = top.find(t => t.day === m.day && t.from === m.from && t.j === m.j); return t.score.join() !== m.score.join() || true; }) && low.some(m => m.score.join() !== (top.find(t => t.day === m.day && t.from === m.from && t.j === m.j)?.score || []).join()), "a lower division's results come from its own seeds");
  const hoops = L.sportSeason("basketball", 23, L.seasonStart(23) + 10, rating, DIST, 1);
  ok(hoops.length && hoops.every(m => Math.max(...m.score) === 21 && Math.min(...m.score) < 21), "a lower-division hoops game is to 21 behind closed doors");
  ok(L.sponsorSlots({ leagues: { pyramid: { clubs: { soccer: [DIST, Object.keys(L.EXPANSION_CLUBS)], baseball: [DIST], basketball: [DIST], football: [DIST] } } } }).some(s => s.id === "league-title:soccer:1") && L.sponsorOf("cup-title") === null, "the sponsorship slots are listed and unbound");
}
console.log(`check-pyramid: ${checks} checks passed. bands: ${globalThis.__bands?.join("; ")}. standings: ${globalThis.__standings?.join("; ")}. ${globalThis.__times?.join("; ")}`);
