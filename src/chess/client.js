// /api/chess from the browser, and the figure's engine in a Web Worker (the main thread when a
// worker cannot start). The server deals the game's seed and files the result; the moves are played here.
import { replay, uci } from "./rules.js";
import { chooseMove } from "./engine.js";

export { loadChess, chessAct } from "./api.js";

let worker = null, seq = 0;
const waiting = new Map();
function getWorker() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL("./engine.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => { const w = waiting.get(e.data?.id); if (w) { waiting.delete(e.data.id); w(e.data); } };
    worker.onerror = () => { worker = false; for (const [, w] of waiting) w({ error: "worker" }); waiting.clear(); };
  } catch { worker = false; }
  return worker;
}
// The figure's move after `moves`: -> uci string (or null when it has none)
export function figureMove(moves, style, seed) {
  const w = getWorker();
  const local = () => { const { pos } = replay(moves); const c = chooseMove(pos, style, seed); return c ? uci(c.move) : null; };
  if (!w) return new Promise(res => setTimeout(() => res(local()), 30));
  return new Promise(res => {
    const id = ++seq;
    const t = setTimeout(() => { if (waiting.has(id)) { waiting.delete(id); res(local()); } }, 20000);
    waiting.set(id, (d) => { clearTimeout(t); res(d.error ? local() : d.uci); });
    w.postMessage({ id, moves, style, seed });
  });
}
