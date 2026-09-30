// PARK CHESS: stone tables in the Substrate's green spaces (Washington Square's, more or less),
// the Department's figures and the park's regulars playing each other on them all day, a crowd
// of kibitzers, and THE PARK CHESS LADDER. Pure, no DOM, deterministic: every viewer sees the
// same pairings, the same move count and the same result at the same machine minute, computed
// from the seed and the machine clock. Drawn by tableDraw.js; checked by scripts/check-chess.mjs.
//
//   TABLES       two at THE RECREATION GROUND (north-east lawn, beside the fountain's ring),
//                a row of three along THE GREEN (the Commons), two beside the path through
//                THE ESTATE GARDENS (the Sprawl; the master plan's new green). Placed from the
//                lots' own rectangles, so they move with the ground.
//   THE DAY      the tables are open 07:00 to 23:00; a game is a 45-minute slot (the park plays
//                quick); pairings are hashed per day, slot and table from the ladder (roster.js
//                LADDER: the chess players on file weighted first, then the file's strongest,
//                then the regulars), close ratings favoured, a mismatch now and then.
//   RESULTS      from the two ladder ratings (Elo expectation) and a hashed luck; draws likelier
//                between strong, even players; decisive mismatches are short.
//   THE LADDER   Elo, K 24, over the last LADDER_DAYS machine days: the standings at the start of
//                a machine day are fixed for that day (ladderAt), today's results move tomorrow's.
//   THE PA       the game on at a board, a result, an upset, the ladder's top three (paLines).
import { SEED, BUILDING } from "../city/sim.js";
import { REC } from "../city/parkGeo.js";
import { GARDEN_TREES } from "../city/venueGeo.js";
import { LADDER, LADDER_BY_KEY, eloOf } from "./roster.js";

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
const h01 = (s) => fnv(s) / 4294967296;

// ---- the tables -------------------------------------------------------------------------------
// A table: {id, lot (building id), place, x, y (map cells, the table's centre), seats: [[x,y] north,
// [x,y] south], kib: [[x,y], ...] (where the kibitzers stand, in fill order), board: 1-based number
// at its ground, name}
export const OPEN_FROM = 7, OPEN_TO = 23, SLOT_H = 0.75;
export const SLOTS = Math.floor((OPEN_TO - OPEN_FROM) / SLOT_H);   // 21
export const LADDER_DAYS = 120, K_FACTOR = 24;
// a table's top is 0.84 cells square; the stools stand SEAT_D from its centre, a kibitzer about as far to a side
export const SEAT_D = 0.75, TOP_R = 0.42;
export const GROUND_NAME = { "rec-ground": "THE RECREATION GROUND", "the-green": "THE GREEN", "estate-gardens": "THE ESTATE GARDENS" };
export const GROUND_DISTRICT = { "rec-ground": "arena", "the-green": "commons", "estate-gardens": "sprawl" };

function table(lot, n, x, y, kib) {
  return { id: `${lot}-${n}`, lot, place: BUILDING[lot]?.places?.[0] || lot, board: n, name: `${GROUND_NAME[lot]}, BOARD ${n}`, x, y, seats: [[x, y - SEAT_D], [x, y + SEAT_D]], kib };
}
export const TABLES = (() => {
  const out = [];
  // THE RECREATION GROUND: the north-east lawn between the spoke and the trees (the groundskeeper
  // was moved round to the east lawn to make room)
  const G = REC.lot;
  const r1 = [G.x + 4.25, G.y + 1.15], r2 = [G.x + 6.2, G.y + 1.4];
  out.push(table("rec-ground", 1, ...r1, [[r1[0] - 0.78, r1[1] + 0.1], [r1[0] + 0.78, r1[1] - 0.15]]));
  out.push(table("rec-ground", 2, ...r2, [[r2[0] - 0.8, r2[1] + 0.25], [r2[0] + 0.72, r2[1] + 0.05]]));
  // THE GREEN: a row of three across its middle, the kibitzers either side of each
  const g = BUILDING["the-green"]?.rect;
  if (g) {
    const cy = g.y + g.h / 2;
    for (let k = 0; k < 3; k++) {
      const x = g.x + g.w * (0.22 + 0.28 * k);
      out.push(table("the-green", k + 1, x, cy, [[x - 0.8, cy - 0.1], [x + 0.8, cy + 0.15], [x - 0.75, cy + 0.75], [x + 0.78, cy - 0.7]]));
    }
  }
  // THE ESTATE GARDENS: two beside the path, where the trees leave room
  const e = BUILDING["estate-gardens"]?.rect;
  if (e) {
    const y = e.y + e.h / 2 + 1.35, clear = (x) => GARDEN_TREES.every(([tx, ty]) => Math.hypot(tx - x, ty - y) > 1.25 && Math.hypot(tx - x, ty - (y + 0.6)) > 1.0);
    const picks = [];
    for (let x = e.x + 3; x < e.x + e.w - 3 && picks.length < 2; x += 0.25) if (clear(x) && (!picks.length || x - picks[picks.length - 1] > 5)) picks.push(x);
    picks.forEach((x, k) => out.push(table("estate-gardens", k + 1, x, y, [[x - 0.8, y], [x + 0.8, y + 0.1], [x + 0.75, y - 0.75]])));
  }
  return out;
})();
export const TABLES_BY_LOT = TABLES.reduce((m, t) => { (m[t.lot] = m[t.lot] || []).push(t); return m; }, {});
export const TABLE = Object.fromEntries(TABLES.map(t => [t.id, t]));

// The table within reach of a map point (DRIVE YOURSELF: E sits you at it), or null.
export function tableNear(x, y, reach = 0.95) {
  let best = null, bd = reach;
  for (const t of TABLES) { const d = Math.hypot(t.x - x, t.y - y); if (d < bd) { bd = d; best = t; } }
  return best;
}
// Where a table sends you: across the stronger figure playing at it now (the board page).
export function tableGo(t, mt) {
  const g = gameAt(t.id, mt);
  const vs = g ? [g.white, g.black].filter(p => p.kind === "figure").sort((a, b) => b.rating - a.rating)[0] : null;
  return { go: vs ? `#chess?vs=${vs.key}&table=${t.id}` : `#chess?table=${t.id}`, vs };
}

// ---- pairings ---------------------------------------------------------------------------------
const weightA = (p, ti) => (p.chess ? 5 : p.kind === "regular" ? 2 : 1.2) * (ti === 0 ? 1 + p.rating / 50 : 1);
function pick(list, weights, u) {
  let tot = 0;
  for (const w of weights) tot += w;
  let r = u * tot;
  for (let i = 0; i < list.length; i++) { r -= weights[i]; if (r < 0) return list[i]; }
  return list[list.length - 1];
}
// The games of one slot (every table): [{table, white, black}] (ladder keys). Pairings and results
// read the players' park ratings (their strength), never the ladder (which only measures it), so a
// day's games are the same whenever and however far back the ladder is counted.
const SLOT_MEMO = new Map();
const base = (k) => eloOf(LADDER_BY_KEY.get(k).rating);
export function pairingsAt(day, slot) {
  const id = `${day}|${slot}`;
  if (SLOT_MEMO.has(id)) return SLOT_MEMO.get(id);
  const used = new Set(), out = [];
  TABLES.forEach((t, ti) => {
    const free = LADDER.filter(p => !used.has(p.key));
    if (free.length < 2) return;
    const a = pick(free, free.map(p => weightA(p, ti)), h01(`${SEED}|chess|a|${day}|${slot}|${t.id}`));
    used.add(a.key);
    const rest = free.filter(p => p !== a);
    const b = pick(rest, rest.map(p => (p.chess ? 2 : 1) * (Math.exp(-Math.abs(base(p.key) - base(a.key)) / 350) + 0.12)), h01(`${SEED}|chess|b|${day}|${slot}|${t.id}`));
    used.add(b.key);
    const aWhite = h01(`${SEED}|chess|c|${day}|${slot}|${t.id}`) < 0.5;
    const r = resultOf(day, slot, t.id, base(aWhite ? a.key : b.key), base(aWhite ? b.key : a.key));
    out.push({ table: t.id, white: aWhite ? a.key : b.key, black: aWhite ? b.key : a.key, ...r });
  });
  SLOT_MEMO.set(id, out);
  if (SLOT_MEMO.size > 3000) SLOT_MEMO.delete(SLOT_MEMO.keys().next().value);
  return out;
}

// One game's result from the two ratings and the luck: {result: "1-0" | "0-1" | "1/2-1/2", moves}
export function resultOf(day, slot, tableId, eloW, eloB) {
  const tag = `${SEED}|chess|r|${day}|${slot}|${tableId}`;
  const ew = 1 / (1 + Math.pow(10, (eloB - eloW) / 400));
  const even = 1 - Math.abs(2 * ew - 1), strong = Math.max(0, Math.min(1, (Math.min(eloW, eloB) - 1300) / 1100));
  const pDraw = 0.06 + 0.3 * even * strong;
  const u = h01(tag), v = h01(tag + "|m");
  let result;
  if (u < pDraw) result = "1/2-1/2";
  else result = (u - pDraw) / (1 - pDraw) < ew ? "1-0" : "0-1";
  // decisive mismatches are short; even games and draws run long
  const moves = result === "1/2-1/2" ? 30 + Math.floor(v * 50) : 11 + Math.floor(v * (14 + 46 * even));
  return { result, moves };
}

// ---- the ladder -------------------------------------------------------------------------------
// Standings at the start of machine day `day`: Map key -> {elo, w, d, l}. Memoised per day.
const LADDER_MEMO = new Map();
function initial() { return new Map(LADDER.map(p => [p.key, { elo: eloOf(p.rating), w: 0, d: 0, l: 0 }])); }
export function ladderAt(day) {
  if (LADDER_MEMO.has(day)) return LADDER_MEMO.get(day);
  const from = Math.max(1, day - LADDER_DAYS);
  const st = initial();
  for (let d = from; d < day; d++) {
    for (let s = 0; s < SLOTS; s++) for (const g of pairingsAt(d, s)) {
      const W = st.get(g.white), Bk = st.get(g.black);
      const ew = 1 / (1 + Math.pow(10, (Bk.elo - W.elo) / 400)), sw = g.result === "1-0" ? 1 : g.result === "0-1" ? 0 : 0.5;
      const dW = K_FACTOR * (sw - ew);
      W.elo += dW; Bk.elo -= dW;
      if (sw === 1) { W.w++; Bk.l++; } else if (sw === 0) { W.l++; Bk.w++; } else { W.d++; Bk.d++; }
    }
  }
  for (const v of st.values()) v.elo = Math.round(v.elo);
  LADDER_MEMO.set(day, st);
  if (LADDER_MEMO.size > 6) LADDER_MEMO.delete(LADDER_MEMO.keys().next().value);
  return st;
}
// The ladder as a table: [{rank, key, name, elo, w, d, l, kind, chess}]
export function standings(day) {
  const st = ladderAt(day);
  return LADDER.map(p => ({ key: p.key, name: p.name, kind: p.kind, chess: p.chess, dead: p.dead, ...st.get(p.key) }))
    .sort((a, b) => b.elo - a.elo || a.key.localeCompare(b.key)).map((r, i) => ({ rank: i + 1, ...r }));
}

// ---- now --------------------------------------------------------------------------------------
const dayOf = (mt) => Math.floor(mt / 24) + 1;
// The game at a table at machine time mt, or null (closed). ->
// {table, day, slot, white, black (ladder entries), eloW, eloB, result, moves, progress 0..1,
//  move (the move being played now), phase: "play" | "over", t0, t1 (machine hours)}
export function gameAt(tableId, mt) {
  const day = dayOf(mt), h = mt - (day - 1) * 24;
  if (h < OPEN_FROM || h >= OPEN_FROM + SLOTS * SLOT_H) return null;
  const slot = Math.floor((h - OPEN_FROM) / SLOT_H);
  return gameOf(day, slot, tableId, h);
}
function gameOf(day, slot, tableId, h = null) {
  const g = pairingsAt(day, slot).find(x => x.table === tableId);
  if (!g) return null;
  const st = ladderAt(day), eloW = st.get(g.white).elo, eloB = st.get(g.black).elo, r = { result: g.result, moves: g.moves };
  const t0 = OPEN_FROM + slot * SLOT_H, t1 = t0 + SLOT_H;
  const progress = h == null ? 1 : Math.max(0, Math.min(1, (h - t0) / SLOT_H));
  const PLAY = 0.86;   // the last stretch of the slot: the result stands, the pieces are reset
  const phase = progress < PLAY ? "play" : "over";
  const move = phase === "play" ? Math.max(1, Math.ceil((progress / PLAY) * r.moves)) : r.moves;
  return { table: tableId, day, slot, white: LADDER_BY_KEY.get(g.white), black: LADDER_BY_KEY.get(g.black), eloW, eloB, ...r, progress, move, phase, t0, t1 };
}
// Today's finished games so far (newest first), for the board page and the PA.
export function resultsToday(mt, n = 20) {
  const day = dayOf(mt), h = mt - (day - 1) * 24, out = [];
  for (let s = 0; s < SLOTS; s++) {
    const t0 = OPEN_FROM + s * SLOT_H;
    if (t0 + SLOT_H * 0.86 > h) break;
    for (const t of TABLES) { const g = gameOf(day, s, t.id); if (g) out.push(g); }
  }
  return out.reverse().slice(0, n);
}

// ---- words ------------------------------------------------------------------------------------
const SHORT = { "rza": "RZA", "aretha-franklin": "ARETHA", "benjamin-franklin": "FRANKLIN", "bill-gates": "GATES", "leonardo-da-vinci": "LEONARDO", "martin-luther-king-jr": "DR KING", "queen-elizabeth-ii": "THE QUEEN", "mansa-musa": "MANSA MUSA", "marcus-aurelius": "MARCUS AURELIUS", "jfk": "JFK", "pele": "PELE", "prince": "PRINCE", "madonna": "MADONNA", "socrates": "SOCRATES", "mahatma-gandhi": "GANDHI", "nelson-mandela": "MANDELA" };
export const shortName = (p) => (p.kind === "regular" ? p.name : SHORT[p.key] || p.name.split(" ").pop());
// the PA's result line: an upset, a rout, a draw, a long grind, a short one, or the usual
const COMMENT = {
  pigeons: "THE PIGEONS ARE APPEALING.",
  rout: ["THE KIBITZERS SAW IT COMING. THEY SAID SO. AT LENGTH.", "THE CLOCK WAS BARELY WARM.", "THE DEPARTMENT HAS FILED IT UNDER INSTRUCTION."],
  upset: ["THE LADDER WILL HEAR ABOUT THIS.", "THE KIBITZERS DEMAND A RECOUNT. THERE IS NOTHING TO RECOUNT.", "THE DEPARTMENT HAS REVISED ITS EXPECTATIONS. DOWNWARD, FOR ONE OF THEM."],
  draw: ["NEITHER WILL SPEAK OF IT.", "THE PIECES WERE RESET IN SILENCE.", "THE PIGEONS ARE UNIMPRESSED."],
  long: ["THE TABLE HAS BEEN RECLASSIFIED AS A RESIDENCE.", "BOTH CLOCKS HAVE ASKED FOR A TRANSFER."],
  usual: ["THE LADDER MOVES ACCORDINGLY.", "THE LOSER HAS ASKED FOR THE RULES IN WRITING.", "THE WINNER DID NOT SAY ANYTHING. THE WINNER DID NOT HAVE TO."],
};
export function resultLine(g) {
  const W = g.white, Bl = g.black, tag = `${g.day}|${g.slot}|${g.table}`;
  const pickC = (arr) => arr[fnv(tag) % arr.length];
  if (g.result === "1/2-1/2") return `${shortName(W)} AND ${shortName(Bl)} DREW IN ${g.moves} MOVES. ${pickC(COMMENT.draw)}`;
  const [win, lose] = g.result === "1-0" ? [W, Bl] : [Bl, W], ew = eloOf(win.rating), el = eloOf(lose.rating);
  const base = `${shortName(win)} BEAT ${shortName(lose)} IN ${g.moves} MOVES.`;
  if (lose.key === "reg-pigeons") return `${base} ${COMMENT.pigeons}`;
  if (el - ew > 120) return `${base} AN UPSET. ${pickC(COMMENT.upset)}`;
  if (g.moves <= 20 && ew - el > 150) return `${base} ${pickC(COMMENT.rout)}`;
  if (g.moves >= 55) return `${base} ${pickC(COMMENT.long)}`;
  return `${base} ${pickC(COMMENT.usual)}`;
}
export function playLine(g) {
  return `${TABLE[g.table].name}: ${shortName(g.white)} V ${shortName(g.black)}, MOVE ${g.move}. THE KIBITZERS HAVE OPINIONS. NOBODY ASKED FOR THEM.`;
}
export function ladderLine(day) {
  const top = standings(day).slice(0, 3).map(r => `${r.rank} ${shortName({ ...r })} ${r.elo}`);
  return `THE PARK CHESS LADDER: ${top.join(", ")}. THE DEPARTMENT RATES THEM. THEY RATE EACH OTHER. IT IS MUTUAL.`;
}

// PA lines for the map (district null) or a district: a result from the last hour, a game on
// at one of this district's boards, the ladder. Newest first; the caller rotates through them.
export function paLines(mt, districtId = null) {
  const here = (lot) => !districtId || GROUND_DISTRICT[lot] === districtId;
  const out = [];
  const recent = resultsToday(mt, 40).filter(g => mt - ((g.day - 1) * 24 + g.t1) < 1.5 && here(TABLE[g.table].lot));
  for (const g of recent.slice(0, 2)) out.push(resultLine(g));
  const on = TABLES.filter(t => here(t.lot)).map(t => gameAt(t.id, mt)).filter(g => g && g.phase === "play");
  if (on.length) out.push(playLine(on[Math.floor(mt * 4) % on.length]));
  if (!districtId || districtId === "arena") out.push(ladderLine(dayOf(mt)));
  return out;
}
