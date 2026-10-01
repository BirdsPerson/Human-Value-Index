// THE CIVIC FOLD (scaling step 7, docs/CITY_SPEC.md "The civic fold"): per-district civic
// state, computed once per machine day by the plan builder (netlify/lib/plans.js publishSplit)
// and written into that day's SUMMARY, so it scales with the sectors and every viewer reads
// the same record. The substrate for councils, elections, leagues and the economy:
//
//   MOOD     per district, -100..100, from the day's plan (crowding against capacity, the tier
//            mix of its workers and residents, the projects / Meridian housing split, commute
//            burden), its team's league form, and what the Assembly built. Smoothed over two
//            days: score = 0.6 today + 0.4 yesterday (raw). Yesterday's raw is read from
//            yesterday's summary; when that summary is missing it is recomputed from
//            yesterday's plan. The window is finite on purpose: the recompute equals the chain.
//   LEAGUE   one team per district (its workforce), nine players drafted at the start of each
//            season (athletes first, then those who play at the Diamond, the Courts, the Bowl
//            and the Pitch), rated from physical, competence and sport fields. A season is
//            28 machine days on the existing GAMES fixtures: a single round robin (45
//            fixtures), two semi-finals, a final, then exhibitions (the old generic sides).
//            Each result is the scoreboard's own final (sim.js gameAt) with the side that won
//            it given to the team better on the day (rating + a hashed day's luck), so the
//            board, the PA and the table always agree. The rosters ride the chain for the
//            whole season; a missing chain re-drafts from the same census, which agrees.
//   COUNCIL  one seat per district: vacant, with the shape for a holder, a term and an
//            approval (= mood); the Assembly's result as the Council's first act.
//
// Pure: same plan, same census, same Assembly outcome, same yesterday -> the same block.
// Browsers only read it (planClient summaryOf(day).civic).
import * as SIM from "./sim.js";
import { displayName } from "../figures.js";
import { seatsOn } from "./councilCalendar.js";
import { councilLeans, prefectFold } from "./prefects.js";
import { PREFECT } from "./prefectData.js";   // THE PREFECTS: directive, clash, legitimacy
import * as L from "./leagues.js";   // THE LEAGUES: four sports, the ladder, the Pit, the Departmental Cup
import { playerRating, draftOrder, teamName, teamShort } from "./leagues.js";
import { enterpriseMood, districtBiz } from "./enterprise.js";   // THE MALL: the district's shops
import { nightlifeMood } from "./nightlife.js";   // THE NIGHTLIFE QUARTERS: the NIGHTLIFE factor

export const CIVIC_V = 1;
// The league is the Loop's ten districts (its season was drawn before the city grew outward);
// every district, the expansion ones included, has a mood and a seat.
const DIST = SIM.LOOP_DISTRICTS.map(d => d.id);
const ALL = SIM.DISTRICTS.map(d => d.id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
const h01 = (s) => fnv(`${SIM.SEED}|civic|${s}`) / 4294967296;

// ---- the teams --------------------------------------------------------------------------------
// Named by the Overlord, one per district (leagues.js TEAMS): [name, scoreboard name].
export { TEAMS, teamName, teamShort, playerRating, snakeTeam, draftOrder, CAP_GAP, MAX_TRADES } from "./leagues.js";
export const ROSTER_N = 9;
const VENUES = new Set(Object.keys(SIM.GAMES));
const SPORT_FIELDS = ["sport", "soccer", "gridiron", "combat", "coaching"];
// 2: an athlete on record; 1: plays at the grounds (a real share of their leisure is there); 0: drafted.
function drawOf(s) {
  const f = SIM.fieldsOf(s);
  if (SPORT_FIELDS.some(k => (f[k] || 0) >= 5)) return 2;
  const { list, total } = SIM.baseLeisure(s);
  const at = list.reduce((n, [id, v]) => n + (VENUES.has(id) ? v : 0), 0);
  return total > 0 && at / total >= 0.12 ? 1 : 0;
}
// THE OLD DRAFT (seasons 1-11): each district's workforce (assignJob), athletes first, then those
// who play at the grounds, then the rest; each group by rating, then key. The Arena, where the
// athletes work, fielded Kobe, Ali, Ohtani and Pele and won on rating alone. Kept for the
// seasons it drafted (a broken chain recomputes them). -> {district: [[key, name, r], ...]}
const byDraft = (a, b) => b.g - a.g || b.r - a.r || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
export function workforceDraft(subjects) {
  const pools = Object.fromEntries(DIST.map(id => [id, []]));
  for (const s of subjects) {
    const d = SIM.assignJob(s).district;
    if (pools[d]) pools[d].push({ key: SIM.keyOf(s), name: displayName(s), r: playerRating(s), g: drawOf(s) });
  }
  const out = {};
  for (const id of DIST) out[id] = pools[id].sort(byDraft).slice(0, ROSTER_N).map(p => [p.key, p.name, p.r]);
  return out;
}

// ---- THE DRAFT (Scott 2026-09-30: "the league is bullshit, break it up and get a draft in there") --
// From season 12 (machine day 309) the teams still carry their districts' names, but every roster
// comes from one league-wide draft: the whole city's pool (athletes on record first, then the
// regulars at the grounds, then the rest; each by rating, then key), taken in a snake over
// ROSTER_N rounds, the order the reverse of last season's final table (the champion picks last).
// Every team takes the best player left. No keepers. A player plays for the team that drafted
// them wherever they work or live. Then THE COMMISSIONER'S CAP: while the strongest team's rating
// is more than CAP_GAP over the weakest's, they trade their picks of the one round that closes
// the gap most (at most MAX_TRADES trades; a trade that would not narrow it is not made). The
// snake alone leaves the first pick's team a star the last pick's never sees; the cap is the
// measured fix (docs/CITY_SPEC.md "The draft"). Deterministic: the season, the census, the table.
export const DRAFT_FROM = 11;   // the season index (0-based) of the first league-wide draft: season 12
// The pool in draft order: the first teams x ROSTER_N of the city, best first.
export function draftPool(subjects, n = DIST.length * ROSTER_N) {
  return subjects.map(s => ({ key: SIM.keyOf(s), name: displayName(s), r: playerRating(s), g: drawOf(s) })).sort(byDraft).slice(0, n);
}
// order: the districts, first pick first. -> {rosters: {district: [[key, name, r] x ROSTER_N, in
// round order]}, trades: [[round, a, b]] (a, the stronger, and b swapped their round's picks)}
export const snakeDraft = (pool, order) => L.snakeDraftN(pool, order, ROSTER_N);
// A season's rosters from the census alone (the chain broken): the old rule before DRAFT_FROM,
// else the draft from the season before's recomputed end. Memoised per census; depth is the
// seasons since DRAFT_FROM, each a snake over the pool and the season's fixtures.
const SEASONS = new Map();
export function seasonRosters(season, subjects) {
  const sig = fnv(subjects.map(x => SIM.keyOf(x)).join("|"));
  if (SEASONS.get("sig") !== sig) { SEASONS.clear(); SEASONS.set("sig", sig); }
  if (SEASONS.has(season)) return SEASONS.get(season);
  if (season < DRAFT_FROM) {
    const v = { rosters: workforceDraft(subjects), draft: null };
    SEASONS.set(season, v);
    return v;
  }
  let s0 = season;   // walk up from the last season on record: no deep recursion however long the league runs
  while (s0 > DRAFT_FROM && !SEASONS.has(s0 - 1)) s0--;
  for (let s = s0; s <= season; s++) {
    const last = s - 1 < DRAFT_FROM ? seasonRosters(s - 1, subjects) : SEASONS.get(s - 1);
    const end = seasonEnd(s - 1, last.rosters);
    SEASONS.set(s, draftFrom(s, subjects, end.table, end.champion));
  }
  return SEASONS.get(season);
}
// A season's final table and champion from its rosters.
export function seasonEnd(season, rosters) {
  const rating = Object.fromEntries(DIST.map(id => [id, teamRating(rosters[id])]));
  const all = seasonTo(season, seasonStart(season + 1), rating);
  const fin = all.find(m => m.stage === "final");
  return { table: order(tableOf(all)), champion: fin ? winnerOf(fin) : null };
}
// The draft of `season` from the pool and last season's end. -> {rosters, draft: {season (1-based),
// order, trades}}
export function draftFrom(season, subjects, table, champion) {
  const ord = draftOrder(table, champion);
  const { rosters, trades } = snakeDraft(draftPool(subjects), ord);
  for (const id of DIST) rosters[id] ||= [];
  return { rosters, draft: { season: season + 1, order: ord, trades } };
}
// A team's rating: its players' mean, or 20 for a district with nobody to field.
export const teamRating = (roster) => (roster?.length ? Math.round(roster.reduce((n, p) => n + p[2], 0) / roster.length) : 20);

// ---- the calendar ---------------------------------------------------------------------------
// Every fixture on the GAMES timetable that keeps a score (practice does not), in day order.
export const SEASON_DAYS = 28, REGULAR = (DIST.length * (DIST.length - 1)) / 2;   // 45
const byWeekday = Array.from({ length: 8 }, (_, wd) => Object.entries(SIM.GAMES)
  .flatMap(([placeId, list]) => list.filter(g => !g.practice && g.days.includes(wd)).map(g => ({ placeId, from: g.from, to: g.to, kind: g.kind, name: g.name })))
  .sort((a, b) => a.from - b.from || (a.placeId < b.placeId ? -1 : 1)));
const PER_WEEK = byWeekday.reduce((n, l) => n + l.length, 0);
export const seasonOf = (day) => Math.floor((day - 1) / SEASON_DAYS);
export const seasonStart = (season) => season * SEASON_DAYS + 1;
// -> [{day, k (the fixture's number in its season), placeId, from, to, kind, name}]
export function fixturesOn(day) {
  const i = (day - 1) - seasonOf(day) * SEASON_DAYS, wd = SIM.weekdayOf(day);
  let k = Math.floor(i / 7) * PER_WEEK;
  for (let w = 1; w < wd; w++) k += byWeekday[w].length;
  return byWeekday[wd].map((g, j) => ({ day, k: k + j, ...g }));
}
// A single round robin (the circle method) over the districts, reshuffled every season.
function roundRobin(season) {
  const t = [...DIST].sort((a, b) => h01(`order|${season}|${a}`) - h01(`order|${season}|${b}`));
  const n = t.length, out = [];
  let arr = t.slice();
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) out.push(r % 2 ? [arr[n - 1 - i], arr[i]] : [arr[i], arr[n - 1 - i]]);
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }
  return out;
}
const RR = new Map();
const rr = (season) => { if (!RR.has(season)) { RR.set(season, roundRobin(season)); if (RR.size > 8) RR.delete(RR.keys().next().value); } return RR.get(season); };
export const stageOf = (k) => (k < REGULAR ? "regular" : k < REGULAR + 2 ? "semi" : k === REGULAR + 2 ? "final" : "off");

// ---- results ---------------------------------------------------------------------------------
// The scoreboard's final for a fixture: [side 0, side 1]. Hoops keeps no sides on the board
// (winners stay on), so a league night at the Courts counts games won, each game's winner hashed.
const HOOP_LEN = 0.7;
export function boardFinal(fx) {
  if (fx.kind === "hoops") {
    const n = Math.floor((fx.to - fx.from) / HOOP_LEN + 1e-9), sc = [0, 0];
    for (let j = 0; j < n; j++) sc[h01(`hoop|${fx.placeId}|${fx.day}|${fx.from}|${j}`) < 0.5 ? 0 : 1]++;
    return sc;
  }
  const g = SIM.gameAt(fx.placeId, (fx.day - 1) * 24 + fx.to - 1e-6);
  return g?.score ? [g.score[0], g.score[1]] : [0, 0];
}
const LUCK = 50;
// Who plays whom, and how it ends. pair: [x, y]; rating: {district: r}. The team better on
// the day (rating + luck) takes the side that won the board; a level board stays level
// (a draw), except in the playoffs, which the better team takes on the Department's tiebreak.
function play(fx, pair, rating) {
  const [x, y] = pair;
  const qx = rating[x] + LUCK * h01(`luck|${fx.day}|${fx.k}|${x}`), qy = rating[y] + LUCK * h01(`luck|${fx.day}|${fx.k}|${y}`);
  const better = qx >= qy ? x : y, worse = better === x ? y : x;
  const sc = boardFinal(fx);
  const won = sc[0] > sc[1] ? 0 : sc[1] > sc[0] ? 1 : -1;
  const sides = won === 1 ? [worse, better] : [better, worse];
  const m = { k: fx.k, day: fx.day, placeId: fx.placeId, from: fx.from, to: fx.to, kind: fx.kind, stage: stageOf(fx.k), sides, score: sc };
  if (won < 0 && m.stage !== "regular") m.tiebreak = better;
  return m;
}
const winnerOf = (m) => (m.score[0] > m.score[1] ? m.sides[0] : m.score[1] > m.score[0] ? m.sides[1] : m.tiebreak || null);

// The table from a list of results (regular season only).
export function tableOf(played) {
  const table = Object.fromEntries(DIST.map(id => [id, { p: 0, w: 0, d: 0, l: 0, f: 0, a: 0, pts: 0 }]));
  for (const m of played) {
    if (m.stage !== "regular") continue;
    const [x, y] = m.sides, [sx, sy] = m.score, X = table[x], Y = table[y];
    X.p++; Y.p++; X.f += sx; X.a += sy; Y.f += sy; Y.a += sx;
    if (sx > sy) { X.w++; Y.l++; X.pts += 3; } else if (sy > sx) { Y.w++; X.l++; Y.pts += 3; } else { X.d++; Y.d++; X.pts++; Y.pts++; }
  }
  return table;
}
// Every league match of the season on days [start, until), in order.
export function seasonTo(season, until, rating) {
  const list = rr(season), played = [];
  let semis = [];
  for (let day = seasonStart(season); day < until; day++) for (const fx of fixturesOn(day)) {
    const st = stageOf(fx.k);
    const m = st === "regular" ? play(fx, list[fx.k], rating)
      : st === "semi" ? (() => { const t = order(tableOf(played)); return play(fx, fx.k === REGULAR ? [t[0], t[3]] : [t[1], t[2]], rating); })()
        : st === "final" && semis.length === 2 ? play(fx, [winnerOf(semis[0]), winnerOf(semis[1])], rating) : null;
    if (!m) continue;
    played.push(m);
    if (m.stage === "semi") semis = [...semis, m];
  }
  return played;
}
// Standings order: points, goal (run, point) difference, scored, then the district order.
export function order(table) {
  return [...DIST].sort((a, b) => table[b].pts - table[a].pts || (table[b].f - table[b].a) - (table[a].f - table[a].a) || table[b].f - table[a].f || DIST.indexOf(a) - DIST.indexOf(b));
}

// ---- mood inputs from the day's plan ------------------------------------------------------------
const NB = 48;   // half-hour buckets
const TIER_N = SIM.TIER_ORDER.length;
const GLASS = new Set(["penthouses"]), PROJECTS = new Set(["block-a", "block-b"]);
// -> {district: {n (workers and residents), workers, residents, tier (mean index), glass, proj
// (shares of n housed in the Meridian's glass / the projects), commute (a worker's hours),
// excess (room person-hours over capacity per capacity-hour), homeOver}} from one day's plan.
export function dayStats(plan, people) {
  const P = plan.places, load = new Map();
  const st = Object.fromEntries(ALL.map(id => [id, { n: 0, tier: 0, workers: 0, glass: 0, proj: 0, commute: 0, residents: 0 }]));
  const res = new Map();
  for (const [key, row] of Object.entries(plan.subjects || {})) {
    const s = people.get(key) || { slug: key, name: key };
    const home = P[row[0]], hd = SIM.PLACES[home]?.district;
    const jd = SIM.assignJob(s).district;
    const t = Math.max(0, SIM.TIER_ORDER.indexOf(SIM.tierOf(s)));
    let commute = 0;
    for (const g of SIM.rowSegs(P, row)) {
      if (g.activity === "commute") { commute += g.to - g.from; continue; }
      if (g.activity !== "work" && g.activity !== "leisure") continue;
      let a = load.get(g.placeId);
      if (!a) { a = new Uint32Array(NB); load.set(g.placeId, a); }
      for (let k = Math.max(0, Math.ceil(g.from * 2 - 0.5)); k < NB && (k + 0.5) / 2 < g.to; k++) a[k]++;
    }
    res.set(home, (res.get(home) || 0) + 1);
    for (const d of new Set([jd, hd])) {
      const x = st[d]; if (!x) continue;
      x.n++; x.tier += t;
      if (GLASS.has(home)) x.glass++;
      if (PROJECTS.has(home)) x.proj++;
    }
    const w = st[jd];
    if (w) { w.workers++; w.commute += commute; }
    if (st[hd]) st[hd].residents++;
  }
  const out = {};
  for (const id of ALL) {
    const x = st[id];
    let over = 0, cap = 0, hOver = 0, hCap = 0;
    for (const pid of SIM.DISTRICT[id].places) {
      const p = SIM.PLACES[pid];
      if (p.kind === "home") { hOver += Math.max(0, (res.get(pid) || 0) - p.cap); hCap += p.cap; continue; }
      cap += p.cap * NB;
      const a = load.get(pid);
      if (a) for (let k = 0; k < NB; k++) over += Math.max(0, a[k] - p.cap);
    }
    out[id] = {
      n: x.n, workers: x.workers, residents: x.residents,
      tier: x.n ? x.tier / x.n : 2,
      glass: x.n ? x.glass / x.n : 0, proj: x.n ? x.proj / x.n : 0,
      commute: x.workers ? x.commute / x.workers : 0,
      excess: cap ? over / cap : 0, homeOver: hCap ? hOver / hCap : 0,
    };
  }
  Object.defineProperty(out, "load", { value: load });   // per place, per half hour (the nightlife factor reads it)
  return out;
}

// ---- the Assembly on the districts ------------------------------------------------------------
// What the lot's outcome does to each district's mood once the ground breaks (never before:
// every day with an effect is built after the result is on record, see sim.js lotPhase). A
// course pleases the top of the ladder and costs the Commons its common; a farm the reverse.
const LOT_MOOD = {
  golf: { commons: -10, finance: 6, hq: 3, sprawl: -5, works: -3 },
  farm: { commons: 10, sprawl: 5, works: 4, finance: -3 },
};
function assemblyOn(day) {
  const c = SIM.civicState();
  if (!c?.winner) return null;
  const p = SIM.lotPhase((day - 1) * 24 + 12);
  if (day < p.breakDay) return null;
  return { winner: c.winner, closeDay: p.breakDay - SIM.LOT_BREAK, phase: p.phase };
}

// ---- the council's seats --------------------------------------------------------------------------
// The closed election cycles (netlify/lib/elections.js seatRecord), set by the plan builder before
// it folds, like the Assembly's outcome: [{cycle, closeAt, seats: {district: {key, name, by}}}].
let SEATS = [];
export function setSeats(record) { SEATS = Array.isArray(record) ? record : []; }
export const seatsRecord = () => SEATS;

// ---- the fold -------------------------------------------------------------------------------------
export const MOOD_WORDS = [
  [45, "PLACATED"], [15, "COMPLIANT"], [-14, "INDIFFERENT"], [-44, "RESTLESS"], [-101, "SEETHING"],
];
export const moodWord = (s) => MOOD_WORDS.find(([min]) => s >= min)[1];
// The factors, each an integer: what the Department would say moved the district.
function factors(x, formPts, pos, lot, id) {
  const f = {
    // person-hours over capacity per capacity-hour (rooms and, at half weight, homes); saturating
    crowd: -Math.round(35 * (1 - Math.exp(-(x.excess + 0.5 * x.homeOver) / 1.5))),
    tier: Math.round(clamp((2.2 - x.tier) * 9, -20, 20)),
    housing: Math.round(clamp(20 * x.glass - 20 * x.proj, -14, 14)),
    // a worker's machine hours in transit a day, past the two every round trip costs
    commute: -Math.round(clamp((x.commute - 2) * 12, 0, 20)),
    league: clamp(formPts + (pos === 0 ? 4 : pos === DIST.length - 1 ? -4 : 0), -19, 19),
    assembly: 0,
  };
  if (lot) f.assembly = Math.round((LOT_MOOD[lot.winner]?.[id] || 0) * (lot.phase === "site" ? 0.5 : 1)) - (lot.phase === "site" && id === "commons" ? 3 : 0);
  for (const k of Object.keys(f)) f[k] ||= 0;   // no -0: the block is plain JSON
  return f;
}
const sum = (f) => Object.values(f).reduce((a, b) => a + b, 0);

// ---- THE LEAGUES (from season 13): four sports, the ladder, the Pit, the Departmental Cup ---------
// Scott 2026-09-30: per-sport leagues and a Cup replace the single mixed league from the season
// boundary after the running one. Seasons before LEAGUES_FROM keep the league they were drawn with.
export const LEAGUES_FROM = 12;   // the season index (0-based): season 13, machine day 337
const censusSig = (subjects) => fnv(subjects.map(x => SIM.keyOf(x)).join("|"));
// THE ENTRANTS (leagues.js; netlify/lib/league-entries.js): each season's frozen snapshot of the
// players' entries, set by the plan builder before it folds, like the seats: {season (1-based):
// [{key, sports, r}]}. A season with no snapshot drafts the census alone, as before.
let ENTRIES = {};
export function setEntries(record) { ENTRIES = record && typeof record === "object" && !Array.isArray(record) ? record : {}; }
export const entriesRecord = () => ENTRIES;
export const entriesOf = (season) => (Array.isArray(ENTRIES[season + 1]) ? ENTRIES[season + 1] : []);
const entriesSig = () => fnv(JSON.stringify(Object.keys(ENTRIES).sort().map(k => [k, ENTRIES[k]])));
const POOLS = new Map();
function poolsFor(subjects, entrants = []) {
  const sig = `${censusSig(subjects)}|${entrants.length ? fnv(JSON.stringify(entrants)) : 0}`;
  if (!POOLS.has(sig)) { if (POOLS.size > 4) POOLS.clear(); POOLS.set(sig, L.sportPools(subjects, entrants)); }
  return POOLS.get(sig);
}
// A per-sport season's draft from the census and each league's last end ({sport: {table, champion}}).
// -> {rosters: {sport: {district: roster}}, drafts: {sport: {season, order, trades}}, tennis (the
// ladder's seed), pit (fighter -> district)}
export function sportDraft(season, subjects, ends, entrants = entriesOf(season)) {
  const pools = poolsFor(subjects, entrants), rosters = {}, drafts = {};
  for (const sp of L.SPORTS) {
    const ord = draftOrder(ends[sp].table, ends[sp].champion);
    const { rosters: r, trades } = L.snakeDraftN(pools[sp], ord, L.SPORT[sp].n, { fine: true, maxTrades: L.L_TRADES });
    for (const id of DIST) r[id] ||= [];
    rosters[sp] = r; drafts[sp] = { season: season + 1, order: ord, trades };
  }
  const people = new Map(subjects.map(s => [SIM.keyOf(s), s]));
  return { rosters, drafts, tennis: L.ladderSeed(subjects, entrants), pit: L.pitDistricts(people) };
}
// Each league's end of `season` from its rosters (the mixed league's for the season before the first).
function endsOf(season, v) {
  // The first per-sport drafts come off the one mixed table: rotate it per sport so the same
  // district doesn't pick first in all four and stack the Cup (Scott's leagues, 2026-09-30).
  if (season < LEAGUES_FROM) {
    const e = seasonEnd(season, v.rosters), t = e.table;
    return Object.fromEntries(L.SPORTS.map((sp, i) => {
      const k = (i * 3) % Math.max(1, t.length);
      return [sp, { ...e, table: [...t.slice(k), ...t.slice(0, k)], champion: i === 0 ? e.champion : null }];
    }));
  }
  return Object.fromEntries(L.SPORTS.map(sp => [sp, L.sportEnd(sp, season, v.rosters[sp])]));
}
// The Cup at machine hour T of `season` (v: that season's draft). -> [{id, pts, by}]
export function cupAt(season, v, T) {
  const day = Math.min(seasonStart(season + 1), Math.floor(T / 24) + 1);
  const pos = {};
  for (const sp of L.SPORTS) {
    const rating = Object.fromEntries(DIST.map(id => [id, teamRating(v.rosters[sp][id])]));
    pos[sp] = L.positionPoints(sp, L.sportSeason(sp, season, day + 1, rating).filter(m => (m.day - 1) * 24 + m.to <= T));
  }
  const dist = { ...Object.fromEntries(v.tennis.map(([k, , , d]) => [k, d])), ...v.pit };
  return L.cupTable(pos, L.ladderRun(v.tennis, season, T).ladder, L.pitRun(season, T).rank.map(x => x.key), dist);
}
const lastCupOf = (season, v) => { if (!v || season < LEAGUES_FROM) return null; const t = cupAt(season, v, seasonStart(season + 1) * 24); return { season: season + 1, champion: t[0].id, table: t.map(r => [r.id, r.pts]) }; };
// From the census alone (the chain broken): each per-sport season is drafted from the one before's
// recomputed end, walking up from the last season on record (memoised per census).
const SPORT_SEASONS = new Map();
export function sportSeasonRosters(season, subjects) {
  const sig = `${censusSig(subjects)}|${entriesSig()}`;
  if (SPORT_SEASONS.get("sig") !== sig) { SPORT_SEASONS.clear(); SPORT_SEASONS.set("sig", sig); }
  if (SPORT_SEASONS.has(season)) return SPORT_SEASONS.get(season);
  let s0 = season;
  while (s0 > LEAGUES_FROM && !SPORT_SEASONS.has(s0 - 1)) s0--;
  for (let s = s0; s <= season; s++) {
    const prevV = s - 1 < LEAGUES_FROM ? seasonRosters(s - 1, subjects) : SPORT_SEASONS.get(s - 1);
    const v = sportDraft(s, subjects, endsOf(s - 1, prevV));
    v.last = lastCupOf(s - 1, s - 1 < LEAGUES_FROM ? null : prevV);
    SPORT_SEASONS.set(s, v);
  }
  return SPORT_SEASONS.get(season);
}
// Matchdays a sport has played in the season before `day`.
const mdBefore = (sp, day) => { let n = 0; for (let d = seasonStart(seasonOf(day)); d < day; d++) n += L.slotsOn(sp, d).length; return n; };
const byTime = (a, b) => a.day - b.day || a.from - b.from || a.j - b.j;
// The season's state entering `day`: -> {v, rating, played: {sport: [...]}, cup, ladder, pit}
function leaguesOn(plan, people, prev, day, season) {
  let v;
  const chained = prev?.v === CIVIC_V && prev.districts;
  const prevRosters = () => Object.fromEntries(L.SPORTS.map(sp => [sp, Object.fromEntries(DIST.map(id => [id, prev.districts[id]?.teams?.[sp]?.roster || []]))]));
  if (chained && prev.leagues?.season === season + 1) {
    const P = prev.leagues;
    v = { rosters: prevRosters(), drafts: Object.fromEntries(L.SPORTS.map(sp => [sp, P.sports[sp].draft])), tennis: P.tennis.seed, pit: P.pit.dist, last: P.cup.last || null };
  } else {
    const subjects = Object.keys(plan.subjects || {}).map(k => people.get(k) || { slug: k, name: k });
    const lastDay = chained && (prev.leagues || prev.league)?.season === season && (prev.leagues || prev.league).day === SEASON_DAYS;
    if (lastDay && prev.leagues) {
      // draft day, the chain whole: each league's end from yesterday's rosters
      const pv = { rosters: prevRosters(), tennis: prev.leagues.tennis.seed, pit: prev.leagues.pit.dist };
      v = sportDraft(season, subjects, endsOf(season - 1, pv));
      v.last = lastCupOf(season - 1, pv);
    } else if (lastDay && prev.league && season - 1 < LEAGUES_FROM) {
      // the first per-sport draft: every league drafts in the reverse of the mixed league's end
      v = sportDraft(season, subjects, endsOf(season - 1, { rosters: Object.fromEntries(DIST.map(id => [id, prev.districts[id]?.team?.roster || []])) }));
      v.last = null;
    } else v = sportSeasonRosters(season, subjects);
  }
  const rating = {}, played = {}, today = {};
  for (const sp of L.SPORTS) {
    rating[sp] = Object.fromEntries(DIST.map(id => [id, teamRating(v.rosters[sp][id])]));
    const all = L.sportSeason(sp, season, day + 1, rating[sp]);
    played[sp] = all.filter(m => m.day < day); today[sp] = all.filter(m => m.day === day);
  }
  const T0 = (day - 1) * 24;
  const ladder = L.ladderRun(v.tennis, season, T0), pit = L.pitRun(season, T0);
  const dist = { ...Object.fromEntries(v.tennis.map(([k, , , d]) => [k, d])), ...v.pit };
  const pos = Object.fromEntries(L.SPORTS.map(sp => [sp, L.positionPoints(sp, played[sp])]));
  const cup = L.cupTable(pos, ladder.ladder, pit.rank.map(x => x.key), dist);
  const tables = Object.fromEntries(L.SPORTS.map(sp => [sp, L.tableOf(played[sp])]));
  const standings = Object.fromEntries(L.SPORTS.map(sp => [sp, L.order(tables[sp])]));
  return { v, rating, played, today, ladder, pit, cup, tables, standings };
}

// plan: that day's format-1 plan. people: key -> census subject. prev: yesterday's block (from
// its summary, or recomputed from its plan) or null. -> the day's civic block.
export function civicFold(plan, people, prev = null) {
  const day = plan.day, season = seasonOf(day);
  const perSport = season >= LEAGUES_FROM;
  let lg = null, X = null;   // the mixed league (before LEAGUES_FROM) | the leagues (from it)
  if (!perSport) {
    // the season's rosters: carried from yesterday within a season, drafted on its first day
    // (or when the chain is broken: the same census drafts the same teams)
    let rosters, drafted = null;
    const chained = prev?.v === CIVIC_V && prev.districts && prev.league;
    if (chained && prev.league.season === season + 1) {
      rosters = Object.fromEntries(DIST.map(id => [id, prev.districts[id]?.team?.roster || []]));
      drafted = prev.league.draft || null;
    } else {
      const subjects = Object.keys(plan.subjects || {}).map(k => people.get(k) || { slug: k, name: k });
      if (season >= DRAFT_FROM && chained && prev.league.season === season && prev.league.day === SEASON_DAYS) {
        // draft day, the chain whole: last season's end is yesterday's table and champion
        ({ rosters, draft: drafted } = draftFrom(season, subjects, prev.league.table, prev.league.champion));
      } else ({ rosters, draft: drafted } = seasonRosters(season, subjects));
    }
    const rating = Object.fromEntries(DIST.map(id => [id, teamRating(rosters[id])]));
    const all = seasonTo(season, day + 1, rating);
    const played = all.filter(m => m.day < day), today = all.filter(m => m.day === day);
    const table = tableOf(played), standing = order(table);
    lg = { rosters, drafted, rating, played, today, table, standing, final: played.find(m => m.stage === "final") };
  } else X = leaguesOn(plan, people, prev, day, season);
  const form = (id) => lg.played.filter(m => m.stage === "regular" && m.sides.includes(id)).slice(-5)
    .map(m => { const i = m.sides.indexOf(id), a = m.score[i], b = m.score[1 - i]; return a > b ? "W" : a < b ? "L" : "D"; }).join("");
  // the Cup form: the district's last five results across its four teams
  const allPlayed = X ? L.SPORTS.flatMap(sp => X.played[sp]).sort(byTime) : null;
  const cupPos = X ? X.cup.map(r => r.id) : null;
  const stats = dayStats(plan, people);
  const lot = assemblyOn(day);
  const held = seatsOn(day, SEATS);
  const leans = councilLeans(held, people);   // PEOPLE <-> ORDER, per held seat (prefects.js)
  const districts = {};
  for (const id of ALL) {
    const pos = X ? cupPos.indexOf(id) : lg.standing.indexOf(id), fm = X ? L.formOf(allPlayed, id) : form(id);
    const f = factors(stats[id], [...fm].reduce((n, r) => n + (r === "W" ? 3 : r === "L" ? -3 : 0), 0), pos, lot, id);
    if (plan.ent) f.enterprise = enterpriseMood(plan.ent, id) || 0;   // THE MALL (enterprise.js): thriving shops +, closures -
    { const nl = nightlifeMood(id, stats.load); if (nl) f.nightlife = nl; }   // THE NIGHTLIFE QUARTERS (nightlife.js): -3..4, the quarters and their neighbours
    // THE PREFECT (prefects.js): today's directive from the mood before its own factor and the
    // council's lean; the clash and the directive's weight become the mood's `prefect` factor.
    // (a district without a prefect has no block: every district has one once phase2Prefects.js covers it)
    const pf = PREFECT[id] ? prefectFold(id, day, clamp(sum(f), -100, 100), held[id] ? leans[id] ?? 0 : null, prev?.v === CIVIC_V ? prev.districts?.[id]?.prefect : null) : null;
    if (pf) f.prefect = pf.factor;
    const raw = clamp(sum(f), -100, 100);
    const was = prev?.v === CIVIC_V && Number.isFinite(prev.districts?.[id]?.mood?.raw) ? prev.districts[id].mood.raw : raw;
    const s = Math.round(0.6 * raw + 0.4 * was) || 0;   // no -0: the block is plain JSON
    const rec = { mood: { s, raw, was, f } };
    if (X) {
      if (DIST.includes(id)) {
        rec.teams = Object.fromEntries(L.SPORTS.map(sp => {
          const T = X.tables[sp][id], st = X.standings[sp];
          return [sp, { rating: X.rating[sp][id], roster: X.v.rosters[sp][id], pos: st.indexOf(id) + 1, p: T.p, w: T.w, d: T.d, l: T.l, f: T.f, a: T.a, pts: T.pts, form: L.formOf(X.played[sp], id) }];
        }));
        rec.cup = { pos: pos + 1, pts: X.cup[pos].pts };
      } else rec.cup = { pos: null, pts: 0 };   // built after the leagues were drawn: it watches
    } else {
      const T = lg.table[id] || { p: 0, w: 0, d: 0, l: 0, f: 0, a: 0, pts: 0 };   // outside the league
      rec.team = { rating: lg.rating[id] ?? 20, roster: lg.rosters[id] || [], pos: pos + 1 || null, p: T.p, w: T.w, d: T.d, l: T.l, f: T.f, a: T.a, pts: T.pts, form: fm };
    }
    // the seat: nobody holds it until the first election is decided and sworn in (council.js).
    rec.seat = held[id]
      ? { holder: held[id].holder, name: held[id].name, term: held[id].term, cycle: held[id].cycle, by: held[id].by, approval: s, status: "HELD", lean: leans[id] ?? 0, acts: lot ? [["A001", lot.closeDay, lot.winner]] : [] }
      : { holder: null, term: null, approval: s, status: "VACANT", acts: lot ? [["A001", lot.closeDay, lot.winner]] : [] };
    if (pf) rec.prefect = pf.block;
    if (plan.ent) rec.biz = districtBiz(plan.ent, id);   // THE MALL: open shops, closures this week
    districts[id] = rec;
  }
  if (X) {
    const sports = {};
    for (const sp of L.SPORTS) {
      const fin = X.played[sp].find(m => m.stage === "final");
      sports[sp] = { stage: X.today[sp][0]?.stage || L.stageOf(sp, mdBefore(sp, day)), table: X.standings[sp], champion: fin ? L.winnerOf(fin) : null, draft: X.v.drafts[sp] };
    }
    return {
      v: CIVIC_V, day,
      leagues: {
        season: season + 1, day: day - seasonStart(season) + 1, days: SEASON_DAYS, sports,
        tennis: { seed: X.v.tennis, ladder: X.ladder.ladder },
        pit: { dist: X.v.pit, rank: X.pit.rank.map(x => x.key) },
        cup: { table: X.cup.map(r => [r.id, r.pts]), last: X.v.last || null },
      },
      districts,
    };
  }
  const strip = (m) => ({ k: m.k, day: m.day, placeId: m.placeId, from: m.from, to: m.to, kind: m.kind, stage: m.stage, sides: m.sides, score: m.score, ...(m.tiebreak ? { tiebreak: m.tiebreak } : {}) });
  return {
    v: CIVIC_V, day,
    league: {
      season: season + 1, day: day - seasonStart(season) + 1, days: SEASON_DAYS,
      stage: lg.today[0]?.stage || (lg.played.length ? stageOf(lg.played[lg.played.length - 1].k + 1) : "regular"),
      table: lg.standing, today: lg.today.map(strip), recent: lg.played.slice(-6).map(strip),
      champion: lg.final ? winnerOf(lg.final) : null,
      ...(lg.drafted ? { draft: lg.drafted } : {}),
    },
    districts,
  };
}

// ---- readers (browsers) ---------------------------------------------------------------------------
// The league match on at a ground at machine time T, from that day's block: -> match | null
export function leagueMatchAt(block, placeId, T) {
  if (block?.leagues) {
    const sp = L.SPORT_AT[placeId], V = sp && leaguesView(block);
    if (!V) return null;
    const h = T - Math.floor(T / 24) * 24;
    return V.all[sp].find(m => m.day === block.day && m.featured && h >= m.from && h < m.to) || null;
  }
  if (!block?.league) return null;
  const d0 = Math.floor(T / 24), h = T - d0 * 24;
  return block.league.today.find(m => m.placeId === placeId && h >= m.from && h < m.to) || null;
}
// The table as it stands at machine hour h of the block's day: entering the day plus every
// match already over. -> [{id, pos, p, w, d, l, f, a, pts, form}]
export function tableAt(block, h = 24) {
  if (!block?.districts) return [];
  const t = Object.fromEntries(DIST.map(id => { const x = block.districts[id].team; return [id, { p: x.p, w: x.w, d: x.d, l: x.l, f: x.f, a: x.a, pts: x.pts, form: x.form }]; }));
  for (const m of block.league.today) {
    if (m.stage !== "regular" || m.to > h) continue;
    const [x, y] = m.sides, [sx, sy] = m.score, X = t[x], Y = t[y];
    X.p++; Y.p++; X.f += sx; X.a += sy; Y.f += sy; Y.a += sx;
    const r = sx > sy ? ["W", "L"] : sx < sy ? ["L", "W"] : ["D", "D"];
    if (sx > sy) { X.w++; Y.l++; X.pts += 3; } else if (sy > sx) { Y.w++; X.l++; Y.pts += 3; } else { X.d++; Y.d++; X.pts++; Y.pts++; }
    X.form = (X.form + r[0]).slice(-5); Y.form = (Y.form + r[1]).slice(-5);
  }
  return order(t).map((id, i) => ({ id, pos: i + 1, ...t[id] }));
}
// Games won so far on a league night at the Courts (the first `done` games), per side.
export function hoopGames(m, done) {
  const sc = [0, 0];
  for (let j = 0; j < Math.max(0, done); j++) sc[h01(`hoop|${m.placeId}|${m.day}|${m.from}|${j}`) < 0.5 ? 0 : 1]++;
  return sc;
}
export const matchLine = (m) => `${teamName(m.sides[0])} ${m.score[0]}, ${teamName(m.sides[1])} ${m.score[1]}${m.tiebreak ? ` (${teamShort(m.tiebreak)} ON THE DEPARTMENT'S TIEBREAK)` : ""}`;
export const STAGE_NAME = { regular: "LEAGUE", semi: "SEMI-FINAL", final: "THE FINAL", off: "EXHIBITION" };

// ---- readers for the leagues (from season 13) -------------------------------------------------------
// The season as the browser reads it: every match of each league through the block's day,
// recomputed from the block's rosters by the code the fold ran (so the summary carries no fixtures).
const VIEWS = new Map();
export function leaguesView(block) {
  const lg = block?.leagues;
  if (!lg) return null;
  const key = `${block.day}|${lg.season}`;
  if (VIEWS.has(key) && VIEWS.get(key).block === block) return VIEWS.get(key);
  const season = lg.season - 1, rosters = {}, rating = {}, all = {};
  for (const sp of L.SPORTS) {
    rosters[sp] = Object.fromEntries(DIST.map(id => [id, block.districts[id]?.teams?.[sp]?.roster || []]));
    rating[sp] = Object.fromEntries(DIST.map(id => [id, teamRating(rosters[sp][id])]));
    all[sp] = L.sportSeason(sp, season, block.day + 1, rating[sp]);
  }
  const v = { block, season, rosters, rating, all, tennis: lg.tennis.seed, pit: lg.pit.dist };
  VIEWS.set(key, v);
  if (VIEWS.size > 4) VIEWS.delete(VIEWS.keys().next().value);
  return v;
}
const T_OF = (block, h) => (block.day - 1) * 24 + h;
// A sport's matches decided by hour h of the block's day.
export function decidedAt(block, sport, h = 24) {
  const V = leaguesView(block);
  if (!V) return [];
  const T = T_OF(block, h);
  return V.all[sport].filter(m => (m.day - 1) * 24 + m.to <= T);
}
// A sport's table as it stands at hour h: -> [{id, pos, p, w, d, l, f, a, pts, form}]
export function sportTableAt(block, sport, h = 24) {
  const done = decidedAt(block, sport, h), t = L.tableOf(done);
  return L.order(t).map((id, i) => ({ id, pos: i + 1, ...t[id], form: L.formOf(done, id) }));
}
// The Cup as it stands at hour h: -> [{id, pts, by}]
export function cupTableAt(block, h = 24) {
  const V = leaguesView(block);
  if (!V) return [];
  const T = T_OF(block, h), pos = {};
  for (const sp of L.SPORTS) pos[sp] = L.positionPoints(sp, decidedAt(block, sp, h));
  const dist = { ...Object.fromEntries(V.tennis.map(([k, , , d]) => [k, d])), ...V.pit };
  return L.cupTable(pos, L.ladderRun(V.tennis, V.season, T).ladder, L.pitRun(V.season, T).rank.map(x => x.key), dist);
}
export const sportMatchLine = (m) => `${L.sportTeamName(m.sides[0], m.sport)} ${m.score[0]}, ${L.sportTeamName(m.sides[1], m.sport)} ${m.score[1]}${m.tiebreak ? ` (${teamShort(m.tiebreak)} ON THE DEPARTMENT'S TIEBREAK)` : ""}`;

// ---- THE ENTRANTS on MY FILE: a player's citizen's season, in the Department's hand --------------
// -> [{sport, team | null, text}] for the citizen `key` (citizen-<last4>) as the block stands at hour h:
// "BATTING .287 FOR THE CURATED NINE. THE DEPARTMENT IS UNMOVED." Empty when they are on no roster.
const ENTRANT_TAILS = ["THE DEPARTMENT IS UNMOVED.", "THE DEPARTMENT HAS SEEN BETTER.", "NOTED. NOT ADMIRED.", "THE SCOUTS HAVE STOPPED TAKING NOTES.", "THE DEPARTMENT EXPECTED LESS. IT IS ADJUSTING.", "THE CROWD WAS TOLD TO CLAP. IT CLAPPED."];
const f3 = (v) => (v >= 1 ? v.toFixed(3) : v.toFixed(3).replace(/^0/, ""));
const plural = (n, one, many = `${one}S`) => `${n} ${n === 1 ? one : many}`;
export function entrantLines(block, key, h = 24) {
  const V = leaguesView(block);
  if (!V || !key) return [];
  const out = [], lg = block.leagues;
  const tail = (sp) => ENTRANT_TAILS[fnv(`${key}|${block.day}|${sp}`) % ENTRANT_TAILS.length];
  for (const sp of L.SPORTS) for (const id of DIST) {
    if (!V.rosters[sp][id].some(p => p[0] === key)) continue;
    const team = L.sportTeamName(id, sp);
    const x = L.seasonStats(sp, decidedAt(block, sp, h), V.rosters[sp]).players[key];
    let text;
    if (!x || !x.g) {
      const pick = L.draftBoard(lg.sports[sp].draft, V.rosters[sp], L.SPORT[sp].n).find(p => p.player[0] === key);
      text = pick ? `DRAFTED BY ${L.sportTeamName(pick.team, sp)} IN ROUND ${pick.round}, PICK ${pick.no}${pick.holder !== pick.team ? `; TRADED TO ${team} BY THE COMMISSIONER` : ""}. NO GAMES YET.` : `ON THE ROSTER OF ${team}. NO GAMES YET.`;
    } else if (sp === "baseball") {
      text = x.pos === "P" && x.ip ? `PITCHING FOR ${team}: ERA ${x.era.toFixed(2)} OVER ${x.ip} INNINGS, ${plural(x.k, "STRIKEOUT")}.`
        : `BATTING ${f3(x.avg)} FOR ${team} (${plural(x.hr, "HOME RUN")}, ${x.rbi} RBI IN ${plural(x.g, "GAME")}).`;
    } else if (sp === "basketball") {
      text = `${x.ppg.toFixed(1)} POINTS A GAME FOR ${team} (${x.rpg.toFixed(1)} REBOUNDS, ${x.apg.toFixed(1)} ASSISTS, ${plural(x.g, "GAME")}).`;
    } else if (sp === "football") {
      const yds = x.passYds + x.rushYds + x.recYds;
      text = x.pos === "K" ? `KICKING FOR ${team}: ${plural(x.fg, "FIELD GOAL")}, ${plural(x.xp, "EXTRA POINT")} IN ${plural(x.g, "GAME")}.`
        : yds || x.td ? `${plural(x.td, "TOUCHDOWN")} AND ${yds} YARDS FOR ${team} IN ${plural(x.g, "GAME")}.`
          : `${plural(x.sacks, "SACK")} AND ${plural(x.int, "INTERCEPTION")} FOR ${team} IN ${plural(x.g, "GAME")}.`;
    } else {
      text = x.pos === "GK" ? `IN GOAL FOR ${team}: ${plural(x.cs, "CLEAN SHEET")}, ${x.ga} CONCEDED IN ${plural(x.g, "MATCH", "MATCHES")}.`
        : `${plural(x.goals, "GOAL")} AND ${plural(x.assists, "ASSIST")} FOR ${team} IN ${plural(x.g, "MATCH", "MATCHES")}.`;
    }
    out.push({ sport: sp, team: id, text: `${text} ${tail(sp)}` });
  }
  const seeded = lg.tennis.seed.some(r => r[0] === key);
  if (seeded) {
    const run = L.ladderRun(lg.tennis.seed, lg.season - 1, T_OF(block, h)), s = run.stats[key];
    out.push({ sport: "tennis", team: null, text: `RUNG ${run.ladder.indexOf(key) + 1} OF ${run.ladder.length} ON THE TENNIS LADDER (${s.w}-${s.l}${s.aces ? `, ${plural(s.aces, "ACE")}` : ""}). ${tail("tennis")}` });
  }
  return out;
}
