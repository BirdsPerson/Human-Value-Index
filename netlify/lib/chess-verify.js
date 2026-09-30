// Is this the game that was dealt? /api/chess files a result only after replaying it:
//   - every move legal from the start (src/chess/rules.js), nothing after the end;
//   - the end is real: checkmate, stalemate, threefold, fifty moves, dead material, or the
//     citizen resigned (a figure never resigns and never agrees a draw);
//   - the figure's moves are the engine's: a sample of them (always the last) is re-played with
//     the game's seed and the figure's style (the engine is deterministic), so a list typed up
//     by hand, or a figure's play swapped for a weaker one, is refused;
//   - it took time: at least MIN_SECS_PER_MOVE a citizen's move since the game was dealt;
//   - a win is at least MIN_WIN_MOVES of the citizen's moves (a two-move mate is not on file), and
//     the same winning move list is never filed twice for one file (its hash is kept).
// Pure (no Blobs): scripts/check-chess.mjs runs it directly.
import { createHash } from "node:crypto";
import { replay, status, fromFen, START_FEN, make, fromUci } from "../../src/chess/rules.js";
import { chooseMove, styleOf, seedOf } from "../../src/chess/engine.js";
import { figureCard } from "../../src/chess/roster.js";

export const MIN_SECS_PER_MOVE = 1.2, MIN_WIN_MOVES = 5, MAX_PLIES = 600, SAMPLE = 6;
export const moveHash = (vs, moves) => createHash("sha256").update(`${vs}|${moves.join(" ")}`).digest("hex").slice(0, 24);

// game: {vs, side: "w" | "b", seed, at}; body: {moves: [uci], resign?}
// -> {ok: true, res: "W" | "D" | "L", reason, plies, mine, hash} | {ok: false, error}
export function verifyGame(game, body, now = Date.now()) {
  const card = figureCard(game.vs);
  if (!card) return { ok: false, error: "That figure is not seated here." };
  const moves = body?.moves;
  if (!Array.isArray(moves) || moves.length > MAX_PLIES || !moves.every(m => typeof m === "string")) return { ok: false, error: "The move list is not legible." };
  const r = replay(moves);
  if (r.error) return { ok: false, error: `Move ${Math.floor((r.at ?? 0) / 2) + 1} is not a legal move in that position. The Department knows the rules.` };
  const st = status(r.pos);
  const mine = game.side === "w" ? 1 : -1;
  let res, reason;
  if (st.over) {
    reason = st.reason;
    res = st.result === "1/2-1/2" ? "D" : (st.result === "1-0") === (mine === 1) ? "W" : "L";
  } else if (body.resign) { res = "L"; reason = "resigned"; }
  else return { ok: false, error: "The game is not over. Finish it, or resign." };
  // the figure's moves: re-played at a sample of its plies (the last always)
  const style = styleOf(card), seed = game.seed >>> 0;
  const figPlies = [];
  for (let i = 0; i < moves.length; i++) if ((i % 2 === 0 ? 1 : -1) !== mine) figPlies.push(i);
  const pick = new Set(figPlies.length ? [figPlies[figPlies.length - 1]] : []);
  const rest = figPlies.slice(0, -1).map(i => [seedOf(`${game.seed}|${i}`), i]).sort((a, b) => a[0] - b[0]);
  for (const [, i] of rest) { if (pick.size >= SAMPLE) break; pick.add(i); }
  if (pick.size) {
    const pos = fromFen(START_FEN);
    for (let i = 0; i < moves.length; i++) {
      const m = fromUci(pos, moves[i]);
      if (pick.has(i)) {
        const c = chooseMove(pos, style, seed);
        if (!c || c.move.from !== m.from || c.move.to !== m.to || (c.move.promo || 0) !== (m.promo || 0))
          return { ok: false, error: `${card.name.toUpperCase()} DOES NOT RECALL PLAYING MOVE ${Math.floor(i / 2) + 1}. THE RESULT IS NOT FILED.` };
      }
      make(pos, m);
    }
  }
  const myMoves = figPlies.length ? moves.length - figPlies.length : moves.length;
  const secs = (now - game.at) / 1000;
  if (secs < myMoves * MIN_SECS_PER_MOVE) return { ok: false, error: "Nobody plays that fast. The result is not filed." };
  if (res === "W" && myMoves < MIN_WIN_MOVES) return { ok: false, error: "A win in under five moves is not a game. It is an accident. Not filed." };
  return { ok: true, res, reason, plies: moves.length, mine: myMoves, hash: moveHash(game.vs, moves), sans: r.sans };
}
