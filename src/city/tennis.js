// THE TENNIS CLUB's fixtures (the master plan, 2026-09-30; Scott: "we don't have any tennis
// courts yet"). Pure: the club's calendar, the match on the show court at any machine moment,
// the PA. Every viewer sees the same match, the same sets, the same winner.
//
//   THE CLUB CHAMPIONSHIP  Saturdays 14:00-17:30: the final, best of three sets.
//   LADDER NIGHT           Wednesdays 18:00-20:30: a ladder match, best of three.
// The finalists are tennis players on file (the census of 2026-09-30), drawn on the show court
// by projection (the council's pattern); the rest of the club plays on courts 0-2 as the sim
// sends them (sim.js leisure: a tennis record pulls hard to the club).

import { SEED, toHours, weekdayOf } from "./sim.js";
import { VENUE_FIXTURES } from "./venueSim.js";

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
const h01 = (s) => fnv(s) / 4294967296;

// [slug, name on the board, rating]
export const TENNIS_ON_FILE = [
  ["serena-williams", "SERENA WILLIAMS", 98],
  ["venus-williams", "VENUS WILLIAMS", 93],
  ["arthur-ashe", "ARTHUR ASHE", 91],
  ["john-mcenroe", "JOHN MCENROE", 92],
];
export const TENNIS_FIXTURES = VENUE_FIXTURES.tennis;

// The pair for a fixture: every pairing of the players on file comes round in turn (a hashed
// order), fixture after fixture, so no final is played twice running; who serves first by hash.
const PAIRS = (() => { const out = []; for (let i = 0; i < TENNIS_ON_FILE.length; i++) for (let j = i + 1; j < TENNIS_ON_FILE.length; j++) out.push([TENNIS_ON_FILE[i], TENNIS_ON_FILE[j]]); return out.map((p, k) => [fnv(`${SEED}|tennispair|${k}`), p]).sort((a, b) => a[0] - b[0]).map(e => e[1]); })();
function pairFor(day, from) {
  const week = Math.floor((day - 1) / 7), idx = week * TENNIS_FIXTURES.length + TENNIS_FIXTURES.findIndex(f => f.from === from && f.days.includes(weekdayOf(day)));
  const [a, b] = PAIRS[((idx % PAIRS.length) + PAIRS.length) % PAIRS.length];
  return fnv(`${SEED}|serve|${day}|${from}`) % 2 ? [b, a] : [a, b];
}
// The match, decided game by game: each game to the server's side more often than not, a
// better player's edge on top; sets to six by two, seven-six on a tiebreak; best of three.
function matchFor(day, from, pa, pb) {
  const edge = (pa[2] - pb[2]) / 100;
  const sets = [], seq = [];
  const won = [0, 0];
  for (let k = 0; k < 3 && won[0] < 2 && won[1] < 2; k++) {
    let a = 0, b = 0;
    for (let g = 0; ; g++) {
      const serveA = (seq.length % 2) === 0, p = 0.5 + (serveA ? 0.12 : -0.12) + edge;
      const w = h01(`${SEED}|tennisg|${day}|${from}|${k}|${g}`) < p ? 0 : 1;
      if (w === 0) a++; else b++;
      seq.push([k, w]);
      if ((a >= 6 || b >= 6) && Math.abs(a - b) >= 2) break;
      if (a === 7 || b === 7) break;
    }
    sets.push([a, b]); won[a > b ? 0 : 1]++;
  }
  return { sets, seq, winner: won[0] > won[1] ? 0 : 1 };
}

// -> the fixture on at machine time t, or null:
// {name, day, from, to, progress, players: [{key, name}] x2, sets: [[a, b]] (so far), set, games: [a, b],
//  score: [sets won], label, status, short, done, winner}
export function tennisAt(machineTime) {
  const T = toHours(machineTime), d0 = Math.floor(T / 24), h = T - d0 * 24, day = d0 + 1, wd = weekdayOf(day);
  const f = TENNIS_FIXTURES.find(x => x.days.includes(wd) && h >= x.from && h < x.to);
  if (!f) return null;
  const [pa, pb] = pairFor(day, f.from), m = matchFor(day, f.from, pa, pb);
  const progress = (h - f.from) / (f.to - f.from);
  // the match takes 90% of the slot; then the trophy
  const played = Math.min(m.seq.length, Math.floor((progress / 0.9) * m.seq.length));
  const sets = [], score = [0, 0];
  let cur = [0, 0], set = 0;
  for (let i = 0; i < played; i++) {
    const [k, w] = m.seq[i];
    if (k !== set) { sets.push(cur); score[cur[0] > cur[1] ? 0 : 1]++; cur = [0, 0]; set = k; }
    cur[w]++;
  }
  const done = played === m.seq.length;
  if (done) { sets.push(cur); score[cur[0] > cur[1] ? 0 : 1]++; } else sets.push(cur);
  const players = [{ key: pa[0], name: pa[1] }, { key: pb[0], name: pb[1] }];
  const games = sets[sets.length - 1];
  // the board's short name: the surname, or the first name when both finalists share one
  const last = (n) => n.split(" ").slice(-1)[0], same = last(players[0].name) === last(players[1].name);
  const surname = (n) => (same ? n.split(" ")[0] : last(n));
  // the score from the winner's side once it is won (as tennis reads it), else from the first-named player's
  const setsTxt = sets.map(s => (done && m.winner === 1 ? `${s[1]}-${s[0]}` : `${s[0]}-${s[1]}`)).join(" ");
  const out = { placeId: "tennis", name: f.name, day, from: f.from, to: f.to, progress, players, sets, set: sets.length, games, score, done, winner: done ? m.winner : null };
  out.label = done ? `${surname(players[m.winner].name)} WINS` : `SET ${out.set} ${games[0]}-${games[1]}`;
  out.status = done ? `${players[m.winner].name} TAKES ${f.name}, ${setsTxt}. THE TROPHY HAS BEEN LOGGED.` : `${players[0].name} V ${players[1].name} // SETS ${score[0]}-${score[1]}, ${games[0]}-${games[1]} IN THE ${["FIRST", "SECOND", "THIRD"][sets.length - 1]}`;
  out.short = done ? `${surname(players[m.winner].name)} WINS, ${setsTxt}` : `${surname(players[0].name)} V ${surname(players[1].name)} // ${setsTxt}`;
  // who is serving: alternate games; the ball's rhythm (the draw uses it)
  out.server = played % 2;
  return out;
}

const START = [
  (m) => `${m.name} AT THE TENNIS CLUB: ${m.players[0].name} V ${m.players[1].name}. QUIET PLEASE. QUIET IS ALSO MONITORED.`,
  (m) => `THE TENNIS CLUB OPENS THE SHOW COURT FOR ${m.name}. ${m.players[0].name} TO SERVE. LOVE IS A SCORE, NOT A FEELING.`,
];
const END = [
  (m) => `GAME, SET AND MATCH AT THE TENNIS CLUB. ${m.status}`,
  (m) => `${m.name} IS DECIDED. ${m.players[m.winner].name} WINS. THE LOSER WILL SHAKE HANDS AT THE NET. THIS IS MANDATORY.`,
];
// -> [{t, kind: "start" | "end", text}] for machine hours [from, to)
export function tennisEvents(from, to) {
  const a = toHours(from), b = toHours(to), out = [];
  for (let d0 = Math.floor(a / 24); d0 * 24 < b; d0++) {
    const day = d0 + 1, wd = weekdayOf(day);
    for (const f of TENNIS_FIXTURES) {
      if (!f.days.includes(wd)) continue;
      const t0 = d0 * 24 + f.from, t1 = d0 * 24 + f.from + 0.9 * (f.to - f.from) + 0.01;
      if (t0 >= a && t0 < b) { const m = tennisAt(t0 + 1e-6); out.push({ t: t0, kind: "start", text: START[fnv(`tpa|${day}|${f.from}|s`) % START.length](m) }); }
      if (t1 >= a && t1 < b) { const m = tennisAt(t1); out.push({ t: t1, kind: "end", text: END[fnv(`tpa|${day}|${f.from}|e`) % END.length](m) }); }
    }
  }
  return out.sort((x, y) => x.t - y.t);
}
