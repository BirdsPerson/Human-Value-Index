// THE PIT (the master plan, 2026-09-30; Scott: "a ring or an octagon or both for settling
// disputes"). A fight venue in the Works' new southern rows: a boxing ring and an MMA octagon
// under the sky, arena seating, locker rooms. Pure (no DOM): the browser draws it (venueDraw.js),
// the social tick settles grievances with it (social.js), scripts/check-planner.mjs holds it.
//
// Two kinds of bout, both non-graphic: nobody is hurt, nobody falls; a bout ends BY DECISION,
// BY SPLIT DECISION, RETIRED FROM THE BOUT (the corner stops it), BY SUBMISSION (a tap, in the
// octagon) or A DRAW.
//
//   THE CARD      Friday night on the machine calendar: three bouts between fighters on file
//                 (FIGHTERS), matched by the week, decided by rating and a hashed luck. Every
//                 viewer sees the same card, the same rounds, the same result. The fighters are
//                 drawn in the ring by projection (the council's pattern): the sim keeps them at
//                 their own schedule; the crowd is the sim's (the card is a fixture, sim GAMES).
//   GRIEVANCES    a pair at nemesis in the ledger may settle it at the Pit (social.js, at a day
//                 boundary, for the night GRIEVANCE_LAG days on, when the published ledger has
//                 it well before). The dead fight their own grievances; the living never fight
//                 over a grievance, theirs or anyone's: a living side names a CHAMPION, a
//                 fighter on file (and never one of the living) with the most affinity to them.
//                 The result moves the rivalry: the grievance cools, sometimes they reconcile.

import { SEED, toHours, weekdayOf } from "./sim.js";
import { VENUE_FIXTURES } from "./venueSim.js";

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
const h01 = (s) => fnv(s) / 4294967296;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Fighters on file, found by field (sim.js FIELD_HINTS / a "boxer" qualifier: combat >= 5) on
// the census of 2026-09-30, with the Department's rating (0..99) and discipline. The living and
// the dead fight on the card alike (a sanctioned bout is their trade); only the dead fight in a
// grievance (below: who is living is read from the census, never from this list).
// [slug, name on the board, discipline, rating]
export const FIGHTERS = [
  ["muhammad-ali", "MUHAMMAD ALI", "boxing", 97],
  ["mike-tyson", "MIKE TYSON", "boxing", 94],
  ["jack-johnson", "JACK JOHNSON", "boxing", 91],
  ["bruce-lee", "BRUCE LEE", "martial", 95],
  ["chuck-norris", "CHUCK NORRIS", "martial", 82],
  ["jackie-chan", "JACKIE CHAN", "martial", 79],
  ["john-cena", "JOHN CENA", "wrestling", 84],
];
export const FIGHTER = Object.fromEntries(FIGHTERS.map(([slug, name, disc, rating]) => [slug, { slug, name, disc, rating }]));

// ---- the calendar -------------------------------------------------------------------------------
// Friday (weekday 5 as the sim counts) from 20:00: three bouts, 40 machine minutes a slot.
// Every night from 22:00: up to two grievance bouts, when the ledger has scheduled any.
export const CARD_DAY = VENUE_FIXTURES.pit[0].days[0], CARD_FROM = VENUE_FIXTURES.pit[0].from, SLOT_H = 2 / 3, CARD_BOUTS = 3;
export const GRIEVANCE_FROM = 22, GRIEVANCE_MAX = 2, GRIEVANCE_LAG = 4;
export const CARD_TO = CARD_FROM + CARD_BOUTS * SLOT_H;   // 22:00
// A slot: the walkout, three rounds and two breaks, the decision read.
const WALK = 0.08, ROUND = 0.14, BREAK = 0.04, READ = 0.06;   // hours: 5 + 3x8.4 + 2x2.4 + 3.6 = 40 min
const ROUNDS = 3;

// The week's card: the boxers in a hashed order box in the ring (the first two), everyone else
// meets in the octagon, paired off in their own hashed order; who is left sits the week out. A
// card that repeats last week's first bout is re-drawn once. The main event goes last.
export const weekOf = (day) => Math.floor((day - 1) / 7);
function draw(w) {
  const order = (list) => list.slice().sort((a, b) => fnv(`${SEED}|pit|${w}|${a}`) - fnv(`${SEED}|pit|${w}|${b}`));
  const box = order(FIGHTERS.filter(f => f[2] === "boxing").map(f => f[0]));
  const rest = order(FIGHTERS.filter(f => f[2] !== "boxing").map(f => f[0]));
  const out = [];
  if (box.length >= 2) out.push([box[0], box[1], "ring"]);
  for (let i = 0; i + 1 < rest.length && out.length < CARD_BOUTS; i += 2) out.push([rest[i], rest[i + 1], "octagon"]);
  // short of bouts: whoever is left meets under unified rules in the octagon
  const used = new Set(out.flat()), left = order(FIGHTERS.map(f => f[0]).filter(k => !used.has(k)));
  for (let i = 0; i + 1 < left.length && out.length < CARD_BOUTS; i += 2) out.push([left[i], left[i + 1], "octagon"]);
  return out;
}
export function cardFor(day) {
  if (weekdayOf(day) !== CARD_DAY) return null;
  const week = weekOf(day), key = (p) => [p[0], p[1]].sort().join("|");
  let list = draw(week);
  const last = new Set(draw(week - 1).map(key));
  if (list.some(p => last.has(key(p)))) list = draw(week + 1000);
  // the main event last: the best-rated pair
  list.sort((p, q) => (FIGHTER[p[0]].rating + FIGHTER[p[1]].rating) - (FIGHTER[q[0]].rating + FIGHTER[q[1]].rating));
  return list.map(([a, b, ring], i) => {
    const A = FIGHTER[a], B = FIGHTER[b], id = `card|${day}|${i}`;
    return { id, kind: "card", day, slot: i, from: CARD_FROM + i * SLOT_H, ring, main: i === list.length - 1,
      sides: [{ key: a, name: A.name }, { key: b, name: B.name }], ...boutOutcome(id, A.rating, B.rating, ring) };
  });
}

// ---- a result -----------------------------------------------------------------------------------
// -> {win: 0 | 1 | null (a draw), method, round (the round it ended in), cards?: [a, b] (judges' tally)}
// Rating and luck: the better fighter wins more often, never always.
export function boutOutcome(id, ra, rb, ring = "ring") {
  const pA = 1 / (1 + Math.pow(10, -(ra - rb) / 18));
  const r = h01(`${SEED}|bout|${id}`), m = h01(`${SEED}|method|${id}`), k = h01(`${SEED}|round|${id}`);
  if (r > 0.97) return { win: null, method: "A DRAW", round: ROUNDS, cards: [1, 1] };
  const win = r * (1 / 0.97) < pA ? 0 : 1;
  const edge = Math.abs(pA - 0.5);
  if (m < 0.22 + edge * 0.5) {
    const round = 1 + Math.floor(k * ROUNDS);
    return { win, method: ring === "octagon" && m < 0.12 ? "BY SUBMISSION" : "RETIRED FROM THE BOUT", round };
  }
  const split = m > 0.78;
  return { win, method: split ? "BY SPLIT DECISION" : "BY UNANIMOUS DECISION", round: ROUNDS, cards: split ? [2, 1] : [3, 0] };
}

// ---- a bout at time t ---------------------------------------------------------------------------
// bout: {from (hour of its day), day, ...outcome}. -> null (not on) or
// {phase: "walkout" | "round" | "break" | "decision" | "over", round, clock (0..1 of the phase)}
export function boutPhase(bout, machineTime) {
  const T = toHours(machineTime), t0 = (bout.day - 1) * 24 + bout.from, e = T - t0;
  if (e < 0 || e >= SLOT_H) return null;
  if (e < WALK) return { phase: "walkout", round: 0, clock: e / WALK };
  const stop = bout.method && !/DECISION|DRAW/.test(bout.method) ? bout.round : null, last = stop || ROUNDS;
  let u = e - WALK;
  for (let rd = 1; rd <= ROUNDS; rd++) {
    // a stoppage ends it partway through its round
    const len = rd === stop ? ROUND * (0.35 + 0.5 * h01(`${SEED}|stop|${bout.id}`)) : ROUND;
    if (u < len) return { phase: "round", round: rd, clock: u / len, stopping: len < ROUND && u > len * 0.85 };
    u -= len;
    if (rd === last) return u < READ ? { phase: "decision", round: rd, clock: u / READ } : { phase: "over", round: rd, clock: 1 };
    if (u < BREAK) return { phase: "break", round: rd, clock: u / BREAK };
    u -= BREAK;
  }
  return { phase: "over", round: last, clock: 1 };
}
// Is the result on the board yet (the decision read, or later)?
export const decided = (bout, mt) => { const T = toHours(mt), t0 = (bout.day - 1) * 24 + bout.from; if (T >= t0 + SLOT_H) return true; const p = boutPhase(bout, mt); return Boolean(p && (p.phase === "decision" || p.phase === "over")); };

// Every bout on at the Pit this machine day, in order: the card (Fridays), then the grievances
// the ledger has published for the day (/api/social pit.bouts; none known = none shown).
let GRIEVANCES = [];
export function setGrievances(list) { GRIEVANCES = Array.isArray(list) ? list.filter(b => b && Number.isFinite(b.day) && Array.isArray(b.sides)) : []; }
export const grievancesKnown = () => GRIEVANCES.slice();
export function boutsOn(day) {
  return [...(cardFor(day) || []), ...GRIEVANCES.filter(b => b.day === day).sort((a, b) => a.slot - b.slot)];
}
// The bout on at time t (or the last one decided within the half hour after it): -> {bout, phase} | null
export function boutAt(machineTime) {
  const T = toHours(machineTime), day = Math.floor(T / 24) + 1;
  for (const b of boutsOn(day)) { const p = boutPhase(b, T); if (p) return { bout: b, phase: p }; }
  return null;
}
// The fighters in the ring for a bout (a grievance side is fought by its champion, or in person).
export const fightersOf = (bout) => bout.sides.map(s => ({ key: s.champ || s.key, name: s.champName || s.name, side: s }));

// ---- the board and the PA -----------------------------------------------------------------------
export function resultLine(b) {
  const f = fightersOf(b);
  if (b.win == null) return `${f[0].name} AND ${f[1].name}: A DRAW. THE JUDGES HAVE BEEN REASSIGNED.`;
  const w = f[b.win], l = f[1 - b.win];
  const rd = /DECISION/.test(b.method) ? "" : ` IN ROUND ${b.round}`;
  return `${w.name} OVER ${l.name}, ${b.method}${rd}.`;
}
function sideLine(s) { return s.champ ? `${s.champName} FOR ${s.name}` : s.name; }
export function billLine(b) {
  if (b.kind === "grievance") return `GRIEVANCE: ${sideLine(b.sides[0])} V ${sideLine(b.sides[1])}`;
  const f = fightersOf(b);
  return `${b.main ? "MAIN EVENT" : `BOUT ${b.slot + 1}`}: ${f[0].name} V ${f[1].name} (${b.ring === "ring" ? "THE RING" : "THE OCTAGON"})`;
}
const PA_START = [
  (b) => b.kind === "grievance" ? `THE PIT OPENS A GRIEVANCE: ${sideLine(b.sides[0])} AGAINST ${sideLine(b.sides[1])}. THE MATTER WILL BE SETTLED. NOT RESOLVED. SETTLED.` : `${b.main ? "THE MAIN EVENT" : "TONIGHT AT THE PIT"}: ${fightersOf(b)[0].name} V ${fightersOf(b)[1].name}. THREE ROUNDS. GLOVES ARE MANDATORY. SO IS RESTRAINT.`,
  (b) => b.kind === "grievance" ? `GRIEVANCE HOUR AT THE PIT. ${sideLine(b.sides[0])} MEETS ${sideLine(b.sides[1])}. THE DEPARTMENT DOES NOT TAKE SIDES. IT TAKES NOTES.` : `IN ${b.ring === "ring" ? "THE RING" : "THE OCTAGON"}: ${fightersOf(b)[0].name}. OPPOSITE: ${fightersOf(b)[1].name}. THE CROWD MAY RISE. THE CROWD MAY NOT ENTER.`,
];
const PA_END = [
  (b) => `RESULT AT THE PIT: ${resultLine(b)} ${b.kind === "grievance" ? "THE GRIEVANCE IS CLOSED. THE FILE IS NOT." : "THE RECORD HAS BEEN UPDATED."}`,
  (b) => `THE BELL. ${resultLine(b)} ${b.kind === "grievance" ? "BOTH PARTIES WILL NOW BE CIVIL. THIS IS NOT A REQUEST." : "NOBODY WAS HARMED. EVERYBODY WAS ASSESSED."}`,
];
// -> [{t, kind: "start" | "end", text}] for machine hours [from, to)
export function pitEvents(from, to) {
  const a = toHours(from), b = toHours(to), out = [];
  for (let d0 = Math.floor(a / 24); d0 * 24 < b; d0++) for (const bout of boutsOn(d0 + 1)) {
    const t0 = d0 * 24 + bout.from, t1 = t0 + SLOT_H - READ;
    const pick = (L, k) => L[fnv(`pitpa|${bout.id}|${k}`) % L.length](bout);
    if (t0 >= a && t0 < b) out.push({ t: t0, kind: "start", text: pick(PA_START, "s") });
    if (t1 >= a && t1 < b) out.push({ t: t1, kind: "end", text: pick(PA_END, "e") });
  }
  return out.sort((x, y) => x.t - y.t);
}

// ---- grievances (the ledger's side: social.js calls these) --------------------------------------
// A side's fighting strength when they fight in person (the dead only): the record's physical
// and competence, as the league rates a player, less than any fighter on file.
export function inPersonRating(s) {
  const b = s?.breakdown || {};
  const phys = typeof b.physical === "number" ? b.physical : 50, comp = typeof s?.competence === "number" ? s.competence : 55;
  return clamp(Math.round(0.55 * phys + 0.25 * comp), 20, 75);
}
export const isFighter = (key) => Boolean(FIGHTER[key]);
