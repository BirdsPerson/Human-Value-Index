// THE WEEKEND RACE on THE GAUNTLET (Scott 2026-09-30: "some have slalom gates for competition").
// Pure: the race calendar, the field, every run's time, the board, the PA, the season's standings.
// Every viewer sees the same racer on the course, the same split, the same winner.
//
//   WHEN        Saturdays 13:00-15:00 on the machine calendar (mountainSim.js MOUNTAIN_FIXTURES pulls the
//               crowd to the course). SLALOM one week, GIANT SLALOM the next.
//   THE FIELD   the skiers and boarders on file first (Shaun White on his board; Tenzing Norgay, who knows
//               a mountain), then the athletes on file the Department enters (the census of 2026-09-30).
//               Lindsey Vonn, Mikaela Shiffrin and the rest of mountainGeo.js SKI_ON_FILE join the top of
//               the field the day they are on file: add them here, with their rating.
//   THE RUNS    two runs each: run 1 in bib order, run 2 in the reverse order of run 1. A run's time is
//               the course's par x (1 + (100 - rating) / 180) x the day's form (+-3%) x the run's luck (+-5%); a straddled gate
//               (more likely the lower the rating, and in the slalom) is DNF. Total of both runs, lowest wins.
//   STANDINGS   World Cup points by place (100 80 60 50 45 40 36 32 29 26 24 22) over the season (the
//               leagues' season, seasons.js: one real month from season 23): THE MOUNTAIN STANDINGS, ladder-style, top first.
//   THE CUP     the leagues module (leagues.js cupTable) takes fixed kinds (four leagues, the tennis
//               ladder, the Pit). The hook: raceTop3(season, T) gives the standings' top three, keyed
//               like the ladder's; CUP_HOOK says how it would score (IND_PTS, 3/2/1) once cupTable reads
//               a "ski" kind from the season the Department chooses. Until then the race scores nothing
//               in the Cup, and no published table changes.
//
// The rating: 0.4 physical + 0.3 adaptability + 0.3 competence from the record on file, + 20 for a
// skier or boarder on file, + 8 a mountaineer, + 6 a skater, + 5 a hockey player, + 4 a racing driver.

import { SEED, weekdayOf } from "./sim.js";
import { seasonOf, seasonStart } from "./seasons.js";   // the leagues' season: one calendar
export { seasonOf };
import { RACE_HOURS } from "./mountainGeo.js";

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
const h01 = (s) => fnv(s) / 4294967296;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// [slug, name on the board, discipline, rating]
export const RACERS = [
  ["shaun-white", "SHAUN WHITE", "BOARD", 97],
  ["tenzing-norgay", "TENZING NORGAY", "SKI", 90],
  ["tony-hawk", "TONY HAWK", "BOARD", 84],
  ["gordie-howe", "GORDIE HOWE", "SKI", 82],
  ["bob-burnquist", "BOB BURNQUIST", "BOARD", 80],
  ["ayrton-senna", "AYRTON SENNA", "SKI", 80],
  ["tiger-woods", "TIGER WOODS", "SKI", 79],
  ["dwayne-johnson", "DWAYNE JOHNSON", "SKI", 79],
  ["michael-phelps", "MICHAEL PHELPS", "SKI", 78],
  ["wayne-gretzky", "WAYNE GRETZKY", "SKI", 78],
  ["claude-giroux", "CLAUDE GIROUX", "SKI", 76],
  ["roy-jones-jr", "ROY JONES JR.", "SKI", 75],
];
export const RACER = Object.fromEntries(RACERS.map(r => [r[0], r]));
export const KINDS = { SL: { name: "SLALOM", par: 46, dnf: 1 }, GS: { name: "GIANT SLALOM", par: 71, dnf: 0.6 } };
export const POINTS = [100, 80, 60, 50, 45, 40, 36, 32, 29, 26, 24, 22];
export const CUP_HOOK = { kind: "ski", pts: [3, 2, 1], from: null };   // from: the season the Cup starts counting it (null: not yet)
export const START = RACE_HOURS[0] + 0.05, GAP = 0.075, DESCENT = 0.065;   // machine hours: the first start, a start every 4.5 minutes, the run on the course

export const isRaceDay = (day) => weekdayOf(day) === 6;
export const kindOn = (day) => (Math.floor((day - 1) / 7) % 2 ? "GS" : "SL");
// The race on a machine day (deterministic): the bibs, both runs' order and times, the results.
const CACHE = new Map();
export function raceOn(day) {
  if (!isRaceDay(day)) return null;
  if (CACHE.has(day)) return CACHE.get(day);
  const kind = kindOn(day), K = KINDS[kind], N = RACERS.length;
  const bibs = RACERS.map((r, i) => [r, fnv(`${SEED}|bib|${day}|${r[0]}`) + i]).sort((a, b) => a[1] - b[1]).map(e => e[0]);
  const run = (r, n) => {
    const luck = h01(`${SEED}|race|${day}|${n}|${r[0]}`), dnf = h01(`${SEED}|dnf|${day}|${n}|${r[0]}`) < clamp(((92 - r[3]) / 260 + 0.025) * K.dnf, 0.01, 0.14);
    const form = h01(`${SEED}|form|${day}|${r[0]}`);   // the day's form (both runs), then each run's luck
    const t = K.par * (1 + (100 - r[3]) / 180) * (0.95 + 0.1 * luck) * (0.97 + 0.06 * form);
    return { slug: r[0], t: Math.round(t * 100) / 100, dnf };
  };
  const run1 = bibs.map(r => ({ ...run(r, 1), bib: bibs.indexOf(r) + 1 }));
  // run 2: the finishers of run 1, slowest first (the leader goes last); the DNFs after, if they start
  const fin1 = run1.filter(x => !x.dnf).sort((a, b) => a.t - b.t);
  const order2 = [...fin1].reverse();
  const run2 = order2.map(x => ({ ...run(RACER[x.slug], 2), bib: x.bib }));
  const results = fin1.map(x => { const r2 = run2.find(y => y.slug === x.slug); return { slug: x.slug, bib: x.bib, t1: x.t, t2: r2.dnf ? null : r2.t, total: r2.dnf ? null : Math.round((x.t + r2.t) * 100) / 100 }; })
    .sort((a, b) => (a.total == null) - (b.total == null) || (a.total ?? 0) - (b.total ?? 0) || a.bib - b.bib);
  results.forEach((x, i) => { x.place = x.total == null ? null : i + 1; x.pts = x.place ? POINTS[x.place - 1] || 0 : 0; });
  const dnf = run1.filter(x => x.dnf).map(x => ({ slug: x.slug, bib: x.bib, t1: null, t2: null, total: null, place: null, pts: 0 }));
  const out = { day, kind, name: K.name, bibs: bibs.map(r => r[0]), run1, run2, results: [...results, ...dnf], starts: [...run1.map(x => ({ ...x, run: 1 })), ...run2.map(x => ({ ...x, run: 2 }))] };
  out.starts.forEach((x, i) => { x.at = (day - 1) * 24 + START + i * GAP + (x.run === 2 ? GAP : 0); });
  CACHE.set(day, out);
  if (CACHE.size > 64) CACHE.delete(CACHE.keys().next().value);
  void N;
  return out;
}
export const fmt = (t) => (t == null ? "DNF" : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`);
export const racerName = (slug) => RACER[slug]?.[1] || String(slug).toUpperCase();

// The race at machine time mt: who is on the course, how far down, the board so far.
// -> null | {race, phase: "before" | "on" | "done", cur: {slug, bib, run, f, t, dnf} | null, done: [starts finished], board}
export function raceAt(mt) {
  const day = Math.floor(mt / 24) + 1, race = raceOn(day);
  if (!race) return null;
  const first = race.starts[0].at, last = race.starts[race.starts.length - 1].at + DESCENT;
  if (mt < first - 0.5) return null;
  if (mt < first) return { race, phase: "before", cur: null, done: [], board: [] };
  const done = race.starts.filter(s => mt >= s.at + DESCENT);
  const cur = race.starts.find(s => mt >= s.at && mt < s.at + DESCENT);
  const board = boardAt(race, done);
  if (mt >= last) return mt < (day - 1) * 24 + RACE_HOURS[1] + 3 ? { race, phase: "done", cur: null, done, board: race.results } : null;
  return { race, phase: "on", cur: cur ? { ...cur, f: (mt - cur.at) / DESCENT } : null, done, board };
}
// The board after some starts: run 1's times, then the combined totals as run 2 comes in.
function boardAt(race, done) {
  const r2 = done.filter(s => s.run === 2);
  if (!r2.length) return done.filter(s => !s.dnf).sort((a, b) => a.t - b.t).map((s, i) => ({ slug: s.slug, bib: s.bib, t1: s.t, total: null, place: i + 1 }));
  return race.results.filter(x => r2.some(s => s.slug === x.slug)).map(x => ({ ...x, place: null })).sort((a, b) => (a.total == null) - (b.total == null) || (a.total ?? 0) - (b.total ?? 0)).map((x, i) => ({ ...x, place: x.total == null ? null : i + 1 }));
}
// The last race decided before machine time mt (this Saturday's once it is over).
export function lastRace(mt) {
  let day = Math.floor(mt / 24) + 1;
  for (let k = 0; k < 8; k++, day--) { const r = raceOn(day); if (r && mt >= r.starts[r.starts.length - 1].at + DESCENT) return r; }
  return null;
}
export function nextRace(mt) {
  let day = Math.floor(mt / 24) + 1;
  for (let k = 0; k < 8; k++, day++) { const r = raceOn(day); if (r && mt < r.starts[0].at) return r; }
  return null;
}

// THE MOUNTAIN STANDINGS: the season's points (races decided by mt). -> [{slug, pts, wins, podiums, races}]
export function standings(mt) {
  const day = Math.floor(mt / 24) + 1, s0 = seasonStart(seasonOf(day));
  const rows = Object.fromEntries(RACERS.map(r => [r[0], { slug: r[0], pts: 0, wins: 0, podiums: 0, races: 0 }]));
  for (let d = s0; d <= day; d++) {
    const r = raceOn(d);
    if (!r || mt < r.starts[r.starts.length - 1].at + DESCENT) continue;
    for (const x of r.results) { const row = rows[x.slug]; row.races++; row.pts += x.pts; if (x.place === 1) row.wins++; if (x.place && x.place <= 3) row.podiums++; }
  }
  return Object.values(rows).sort((a, b) => b.pts - a.pts || b.wins - a.wins || RACER[b.slug][3] - RACER[a.slug][3]);
}
// The Departmental Cup's hook (see the header): the standings' top three at mt.
export const raceTop3 = (mt) => standings(mt).filter(r => r.pts > 0).slice(0, 3).map(r => r.slug);

// The PA: the starter, the clock, the result. -> [{t, text}] between machine times a and b
export function raceEvents(a, b) {
  const out = [];
  for (let day = Math.floor(a / 24) + 1; day <= Math.floor(b / 24) + 1; day++) {
    const r = raceOn(day);
    if (!r) continue;
    r.starts.forEach((s, i) => {
      const nm = racerName(s.slug);
      if (s.at >= a && s.at < b) out.push({ t: s.at, text: `THE GAUNTLET, ${r.name}, RUN ${s.run}: BIB ${String(s.bib).padStart(2, "0")} ${nm} IN THE GATE. THE CLOCK IS RUNNING.${RACER[s.slug][2] === "BOARD" ? " ON A BOARD. THE JURY HAS NOTED IT." : ""}` });
      const fin = s.at + DESCENT;
      if (fin >= a && fin < b) {
        if (s.dnf) out.push({ t: fin, text: `BIB ${String(s.bib).padStart(2, "0")} ${nm}: DID NOT FINISH. A GATE WAS STRADDLED. THE GATE IS UNHARMED.` });
        else {
          const board = boardAt(r, r.starts.slice(0, i + 1).filter(x => fin >= x.at + DESCENT)), row = board.find(x => x.slug === s.slug);
          out.push({ t: fin, text: `BIB ${String(s.bib).padStart(2, "0")} ${nm}: ${fmt(s.run === 2 ? row?.total : s.t)}${s.run === 2 ? " COMBINED" : ""}, CURRENTLY ${row?.place ? ordinal(row.place) : "OUT"}. ${row?.place === 1 ? "THE MOUNTAIN APPROVES." : "PERFORMANCE LOGGED."}` });
        }
      }
    });
    const end = r.starts[r.starts.length - 1].at + DESCENT;
    if (end >= a && end < b) out.push({ t: end, text: resultLine(r) });
  }
  return out.sort((x, y) => x.t - y.t);
}
const ordinal = (n) => `${n}${n % 10 === 1 && n !== 11 ? "ST" : n % 10 === 2 && n !== 12 ? "ND" : n % 10 === 3 && n !== 13 ? "RD" : "TH"}`;
export function resultLine(r) {
  const [a, b, c] = r.results.filter(x => x.place);
  return `THE WEEKEND RACE: ${racerName(a.slug)} WINS THE ${r.name} IN ${fmt(a.total)}. SILVER, ${racerName(b.slug)}; BRONZE, ${racerName(c.slug)}. RESULTS POSTED AT THE BASE. DESCENT IS MANDATORY.`;
}
