// A small chess engine whose strength follows the figure's file. Pure and deterministic: the same
// position, style and seed give the same move in the browser (engine.worker.js) and in node
// (/api/chess re-plays a sample of the figure's moves to check a submitted game was played
// against this engine, and scripts/check-chess.mjs plays the figures against each other).
//
// The search: iterative-deepening negamax with alpha-beta, captures first (most valuable victim,
// least valuable attacker), a quiescence search over captures for the stronger, a node budget
// (a count, never a clock, so it stays deterministic). The evaluation: material and piece-square
// tables, plus an attacking term for the aggressive. How a file becomes a player (styleOf):
//
//   park rating (roster.ratingOf: a chess player's own, else competence then adaptability)
//     >= 95 -> 5 plies, 80-94 -> 4, 65-79 -> 3, 45-64 -> 2, below -> 1
//     >= 55 -> the quiescence search (it sees the recapture); below it hangs pieces at the horizon
//     noise: every position it judges is off by up to (100 - rating) x 2.2 centipawns, fixed per
//            position and game (a weak player misjudges, consistently)
//     below 50: a blunder now and then, (50 - rating) / 160 of its moves played at random
//   threat (the file's) -> aggression: pieces near the other king are worth up to 3 x threat / 100
//     centipawns a square closer, and a king left open costs the aggressive less
import { pseudo, make, unmake, inCheck, legalMoves, keyOf, repetitions, P, N, B, R, Q, K } from "./rules.js";

const VAL = [0, 100, 320, 330, 500, 900, 0];
// piece-square tables, White's view, a8..h8 first (the "simplified evaluation function" set)
const PST = {
  [P]: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  [N]: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  [B]: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  [R]: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  [Q]: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  [K]: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
};
const KING_END = [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];
// 0x88 square -> table index for White (a8 = 0) and for Black (mirrored)
const IDX_W = new Int8Array(128), IDX_B = new Int8Array(128);
for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { IDX_W[r * 16 + f] = (7 - r) * 8 + f; IDX_B[r * 16 + f] = r * 8 + f; }

export const MATE = 100000;

// ---- the style of a file ----------------------------------------------------------------------
// card: {rating (0..99), breakdown: {threat, ...}} (roster.figureCard)
export function styleOf(card) {
  const rating = Math.max(0, Math.min(99, Math.round(card?.rating ?? 50)));
  const threat = card?.breakdown?.threat ?? 20;
  return {
    rating,
    depth: rating >= 95 ? 5 : rating >= 80 ? 4 : rating >= 65 ? 3 : rating >= 45 ? 2 : 1,
    quiesce: rating >= 55,
    noise: Math.round((100 - rating) * 2.2),
    blunder: rating < 50 ? (50 - rating) / 160 : 0,
    aggression: Math.max(0, Math.min(1, threat / 100)),
    nodes: 250000,
  };
}
// The style as the board page's dossier shows it.
export function describe(card) {
  const s = styleOf(card), b = card?.breakdown || {};
  return [
    `PARK RATING ${s.rating}${card?.chess ? " // A CHESS PLAYER ON FILE" : ` // FROM COMPETENCE ${card?.competence ?? "?"} AND ADAPTABILITY ${b.adaptability ?? "?"}`}`,
    `SEES ${s.depth} ${s.depth === 1 ? "MOVE" : "MOVES"} AHEAD${s.quiesce ? ", AND EVERY RECAPTURE" : ". NOT THE RECAPTURE"}`,
    `MISJUDGES BY UP TO ${s.noise} CENTIPAWNS${s.blunder ? ` // BLUNDERS ${Math.round(s.blunder * 100)}% OF MOVES` : ""}`,
    `AGGRESSION ${Math.round(s.aggression * 100)} // FROM THREAT ${b.threat ?? "?"}`,
  ];
}

// ---- evaluation -------------------------------------------------------------------------------
function evaluate(pos, S, seed) {
  const b = pos.b;
  let mat = 0, pst = 0, h = seed | 0, heavy = 0;
  const wk = pos.kings[0], bk = pos.kings[1];
  let atk = 0;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const v = b[s];
    if (!v) continue;
    h = Math.imul(h ^ (v * 131 + s), 0x5bd1e995) ^ (h >>> 15);
    const t = v > 0 ? v : -v, sg = v > 0 ? 1 : -1;
    mat += sg * VAL[t];
    if (t === Q || t === R) heavy += t === Q ? 2 : 1;
    if (t !== K) pst += sg * PST[t][sg > 0 ? IDX_W[s] : IDX_B[s]];
    if (S.aggression && t !== P && t !== K) {
      const ek = sg > 0 ? bk : wk, d = Math.max(Math.abs((s >> 4) - (ek >> 4)), Math.abs((s & 7) - (ek & 7)));
      atk += sg * (7 - d);
    }
  }
  // kings: the middlegame table while queens and rooks are about, the endgame's after
  const kt = heavy <= 2 ? KING_END : PST[K];
  pst += kt[IDX_W[wk]] - kt[IDX_B[bk]];
  let score = mat + pst + Math.round(atk * 3 * S.aggression);
  if (S.noise) { const n = (((h ^ (h >>> 13)) >>> 0) % (2 * S.noise + 1)) - S.noise; score += n; }
  return pos.turn > 0 ? score : -score;
}

// ---- search -----------------------------------------------------------------------------------
const order = (a, b) => b._o - a._o;
function scoreMoves(moves) {
  for (const m of moves) {
    let o = 0;
    if (m.cap) o = 10000 + VAL[Math.abs(m.cap)] * 10 - VAL[Math.abs(m.piece)] / 10;
    if (m.promo) o += 9000 + VAL[Math.abs(m.promo)];
    m._o = o;
  }
  moves.sort(order);
  return moves;
}

function quiesce(pos, alpha, beta, S, seed, ctx, qd) {
  ctx.nodes++;
  const stand = evaluate(pos, S, seed);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  if (qd <= 0) return alpha;
  for (const m of scoreMoves(pseudo(pos, true))) {
    make(pos, m, false);
    if (inCheck(pos, -pos.turn)) { unmake(pos, false); continue; }
    const sc = -quiesce(pos, -beta, -alpha, S, seed, ctx, qd - 1);
    unmake(pos, false);
    if (sc >= beta) return beta;
    if (sc > alpha) alpha = sc;
  }
  return alpha;
}

function negamax(pos, depth, alpha, beta, ply, S, seed, ctx) {
  if (ctx.nodes > S.nodes) { ctx.out = true; return 0; }
  if (pos.half >= 100) return 0;
  if (depth <= 0) return S.quiesce ? quiesce(pos, alpha, beta, S, seed, ctx, 6) : (ctx.nodes++, evaluate(pos, S, seed));
  ctx.nodes++;
  let any = false, best = -MATE * 2;
  for (const m of scoreMoves(pseudo(pos))) {
    make(pos, m, false);
    if (inCheck(pos, -pos.turn)) { unmake(pos, false); continue; }
    any = true;
    const sc = -negamax(pos, depth - 1, -beta, -alpha, ply + 1, S, seed, ctx);
    unmake(pos, false);
    if (ctx.out) return 0;
    if (sc > best) best = sc;
    if (sc > alpha) alpha = sc;
    if (alpha >= beta) break;
  }
  if (!any) return inCheck(pos) ? -MATE + ply : 0;
  return best;
}

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function seedOf(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// The figure's move in pos (a game position from rules.js, with its keys). style: styleOf(card);
// seed: the game's (a number). -> {move, score, depth, nodes, blunder}
export function chooseMove(pos, style, seed = 1) {
  const S = style, moves = legalMoves(pos);
  if (!moves.length) return null;
  const ply = pos.keys.length;
  const rnd = mulberry((seed ^ Math.imul(ply + 1, 0x9e3779b1)) >>> 0);
  if (S.blunder && rnd() < S.blunder) return { move: moves[Math.floor(rnd() * moves.length) % moves.length], score: 0, depth: 0, nodes: 0, blunder: true };
  const evalSeed = seed ^ 0x2545f491;
  const ctx = { nodes: 0, out: false };
  // a root move that repeats the position a third time is a draw: scored as one
  const drawn = new Set();
  for (const m of moves) { make(pos, m); if (repetitions(pos) >= 3) drawn.add(m); unmake(pos); }
  let bestMove = scoreMoves(moves)[0], bestScore = 0, done = 0;
  for (let d = 1; d <= S.depth; d++) {
    let alpha = -MATE * 2, iterBest = null;
    const ordered = [bestMove, ...moves.filter(m => m !== bestMove)];
    for (const m of ordered) {
      make(pos, m, false);
      const sc = drawn.has(m) ? 0 : -negamax(pos, d - 1, -MATE * 2, -alpha, 1, S, evalSeed, ctx);
      unmake(pos, false);
      if (ctx.out) break;
      if (sc > alpha) { alpha = sc; iterBest = m; }
    }
    if (ctx.out) break;
    if (iterBest) { bestMove = iterBest; bestScore = alpha; done = d; }
    if (Math.abs(bestScore) > MATE - 100) break;   // a forced mate found: play it
  }
  return { move: bestMove, score: bestScore, depth: done, nodes: ctx.nodes, blunder: false };
}

// A cheap material count (White minus Black), for adjudicating a self-play game that runs long.
export function material(pos) {
  let m = 0;
  for (let s = 0; s < 128; s++) { if (s & 0x88) { s += 7; continue; } const v = pos.b[s]; if (v) m += (v > 0 ? 1 : -1) * VAL[Math.abs(v)]; }
  return m;
}
export { keyOf };
