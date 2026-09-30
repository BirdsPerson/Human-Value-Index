// The figure thinks here, off the page's thread: {id, moves: [uci], style, seed} -> {id, uci, depth, nodes}.
// The same engine /api/chess re-plays to check the game (engine.js is deterministic).
import { replay, uci } from "./rules.js";
import { chooseMove } from "./engine.js";

self.onmessage = (e) => {
  const { id, moves, style, seed } = e.data || {};
  try {
    const { pos, error } = replay(moves || []);
    if (error) { self.postMessage({ id, error }); return; }
    const c = chooseMove(pos, style, seed);
    self.postMessage({ id, uci: c ? uci(c.move) : null, depth: c?.depth, nodes: c?.nodes });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
