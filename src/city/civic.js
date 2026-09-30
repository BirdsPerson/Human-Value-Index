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

export const CIVIC_V = 1;
const DIST = SIM.DISTRICTS.map(d => d.id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
const h01 = (s) => fnv(`${SIM.SEED}|civic|${s}`) / 4294967296;

// ---- the teams --------------------------------------------------------------------------------
// Named by the Overlord, one per district: [name, scoreboard name].
export const TEAMS = {
  arts: ["THE CURATED", "CURATED"],
  campus: ["THE TENURED", "TENURED"],
  finance: ["THE LEVERAGED", "LEVERAGED"],
  strip: ["THE HOUSE EDGE", "HOUSE EDGE"],
  arena: ["THE CONDITIONED", "CONDITIONED"],
  hq: ["THE DEPARTMENT", "DEPARTMENT"],
  archive: ["THE INDEXED", "INDEXED"],
  commons: ["THE TOLERATED", "TOLERATED"],
  works: ["THE PROCESSED", "PROCESSED"],
  sprawl: ["THE RETURNED", "RETURNED"],
};
export const teamName = (id) => TEAMS[id]?.[0] || String(id || "").toUpperCase();
export const teamShort = (id) => TEAMS[id]?.[1] || String(id || "").toUpperCase();
export const ROSTER_N = 9;
const VENUES = new Set(Object.keys(SIM.GAMES));
const SPORT_FIELDS = ["sport", "soccer", "gridiron", "combat", "coaching"];

// A player's rating, 0..99: the body, the competence, and a record in sport.
export function playerRating(s) {
  const b = s?.breakdown || {};
  const physical = typeof b.physical === "number" ? b.physical : 40;
  const competence = typeof s?.competence === "number" ? s.competence : typeof b.utility === "number" ? b.utility : 40;
  const f = SIM.fieldsOf(s);
  const sport = Math.max(0, ...SPORT_FIELDS.map(k => f[k] || 0));
  return clamp(Math.round(0.45 * physical + 0.35 * competence + 2 * sport), 0, 99);
}
// 2: an athlete on record; 1: plays at the grounds (a real share of their leisure is there); 0: drafted.
function drawOf(s) {
  const f = SIM.fieldsOf(s);
  if (SPORT_FIELDS.some(k => (f[k] || 0) >= 5)) return 2;
  const { list, total } = SIM.baseLeisure(s);
  const at = list.reduce((n, [id, v]) => n + (VENUES.has(id) ? v : 0), 0);
  return total > 0 && at / total >= 0.12 ? 1 : 0;
}
// The draft: each district's workforce (assignJob), athletes first, then those who play at the
// grounds, then the rest; each group by rating, then key. -> {district: [[key, name, r], ...]}
export function draft(subjects) {
  const pools = Object.fromEntries(DIST.map(id => [id, []]));
  for (const s of subjects) {
    const d = SIM.assignJob(s).district;
    if (pools[d]) pools[d].push({ key: SIM.keyOf(s), name: displayName(s), r: playerRating(s), g: drawOf(s) });
  }
  const out = {};
  for (const id of DIST) {
    out[id] = pools[id].sort((a, b) => b.g - a.g || b.r - a.r || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .slice(0, ROSTER_N).map(p => [p.key, p.name, p.r]);
  }
  return out;
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
  const st = Object.fromEntries(DIST.map(id => [id, { n: 0, tier: 0, workers: 0, glass: 0, proj: 0, commute: 0, residents: 0 }]));
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
  for (const id of DIST) {
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

// plan: that day's format-1 plan. people: key -> census subject. prev: yesterday's block (from
// its summary, or recomputed from its plan) or null. -> the day's civic block.
export function civicFold(plan, people, prev = null) {
  const day = plan.day, season = seasonOf(day);
  // the season's rosters: carried from yesterday within a season, drafted on its first day
  // (or when the chain is broken: the same census drafts the same teams)
  let rosters;
  if (prev?.v === CIVIC_V && prev.league?.season === season + 1 && prev.districts) rosters = Object.fromEntries(DIST.map(id => [id, prev.districts[id]?.team?.roster || []]));
  else rosters = draft(Object.keys(plan.subjects || {}).map(k => people.get(k) || { slug: k, name: k }));
  const rating = Object.fromEntries(DIST.map(id => [id, teamRating(rosters[id])]));
  const all = seasonTo(season, day + 1, rating);
  const played = all.filter(m => m.day < day), today = all.filter(m => m.day === day);
  const table = tableOf(played), standing = order(table);
  const final = played.find(m => m.stage === "final");
  const form = (id) => played.filter(m => m.stage === "regular" && m.sides.includes(id)).slice(-5)
    .map(m => { const i = m.sides.indexOf(id), a = m.score[i], b = m.score[1 - i]; return a > b ? "W" : a < b ? "L" : "D"; }).join("");
  const stats = dayStats(plan, people);
  const lot = assemblyOn(day);
  const districts = {};
  for (const id of DIST) {
    const pos = standing.indexOf(id), fm = form(id);
    const f = factors(stats[id], [...fm].reduce((n, r) => n + (r === "W" ? 3 : r === "L" ? -3 : 0), 0), pos, lot, id);
    const raw = clamp(sum(f), -100, 100);
    const was = prev?.v === CIVIC_V && Number.isFinite(prev.districts?.[id]?.mood?.raw) ? prev.districts[id].mood.raw : raw;
    const s = Math.round(0.6 * raw + 0.4 * was);
    const T = table[id];
    districts[id] = {
      mood: { s, raw, was, f },
      team: { rating: rating[id], roster: rosters[id], pos: pos + 1, p: T.p, w: T.w, d: T.d, l: T.l, f: T.f, a: T.a, pts: T.pts, form: fm },
      // the seat: nobody holds it until the first election. approval follows the mood.
      seat: { holder: null, term: null, approval: s, status: "VACANT", acts: lot ? [["A001", lot.closeDay, lot.winner]] : [] },
    };
  }
  const strip = (m) => ({ k: m.k, day: m.day, placeId: m.placeId, from: m.from, to: m.to, kind: m.kind, stage: m.stage, sides: m.sides, score: m.score, ...(m.tiebreak ? { tiebreak: m.tiebreak } : {}) });
  return {
    v: CIVIC_V, day,
    league: {
      season: season + 1, day: day - seasonStart(season) + 1, days: SEASON_DAYS,
      stage: today[0]?.stage || (played.length ? stageOf(played[played.length - 1].k + 1) : "regular"),
      table: standing, today: today.map(strip), recent: played.slice(-6).map(strip),
      champion: final ? winnerOf(final) : null,
    },
    districts,
  };
}

// ---- readers (browsers) ---------------------------------------------------------------------------
// The league match on at a ground at machine time T, from that day's block: -> match | null
export function leagueMatchAt(block, placeId, T) {
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
