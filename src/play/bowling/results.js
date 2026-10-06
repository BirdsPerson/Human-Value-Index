// THE LANES' results, for anyone who reads them (the newspaper's sports page, later). Pure apart from
// localStorage. A game is kept only once its record has been re-run from its input log and gave the
// same scores (Bowling.jsx verifies before it keeps), so what is here is what was bowled.
//
// THE SHAPE (one entry per finished game, newest first, at most KEEP_N):
//   { game: "bowling", v: <sim version>, at: <ISO time>, day: <machine day>, hour: <machine hour>,
//     cosmic: bool, lane: <1..24>, verified: true,
//     players: [{ name, kind: "human" | "cpu", key: <figure slug or null>, total: 0..300,
//                 strikes, spares, splits, marks: ["X", "9/", "8-", ..., "X9/"] }],
//     winner: <index into players> | null (a tie), high: <best total> }
// readResults() -> that list. resultLine(r) -> one plain line ("BILL MURRAY 203, YOU 187").
import { lineOf } from "./score.js";

export const KEEP = "hvi-bowling-results", KEEP_N = 25;
const EPOCH = Date.UTC(2026, 8, 26, 0, 0, 0);   // the city's day 1 (src/city/sim.js CITY_EPOCH); 1 real minute = 1 machine hour
export function machineClock(now = Date.now()) {
  const mt = (now - EPOCH) / 60000;
  return { mt, day: Math.floor(mt / 24) + 1, hour: ((mt % 24) + 24) % 24 };
}
// COSMIC BOWLING: the late hours on the machine clock
export const cosmicHour = (h) => h >= 21 || h < 3;

export function readResults() {
  try { const j = JSON.parse(localStorage.getItem(KEEP) || "[]"); return Array.isArray(j) ? j : []; } catch { return []; }
}
export function shapeOf(rec, verified, { lane = 1, cosmic = false, now = Date.now() } = {}) {
  const ck = machineClock(now);
  const players = rec.cfg.players.map((p, i) => {
    const balls = (rec.result.players[i]?.balls || []).map(([n, f, s]) => ({ n, foul: !!f, split: !!s }));
    const l = lineOf(balls);
    return { name: p.name, kind: p.kind, key: p.key || null, total: l.total, strikes: l.strikes, spares: l.spares, splits: l.splits, marks: l.marks };
  });
  const high = Math.max(...players.map(p => p.total));
  const top = players.map((p, i) => (p.total === high ? i : -1)).filter(i => i >= 0);
  return { game: "bowling", v: rec.cfg.v, at: new Date(now).toISOString(), day: ck.day, hour: Math.round(ck.hour * 10) / 10, cosmic, lane, verified: !!verified, players, winner: top.length === 1 ? top[0] : null, high };
}
export function keepResult(r) {
  if (!r?.verified) return false;
  try { localStorage.setItem(KEEP, JSON.stringify([r, ...readResults()].slice(0, KEEP_N))); return true; } catch { return false; }
}
export const resultLine = (r) => [...r.players].sort((a, b) => b.total - a.total).map(p => `${p.name} ${p.total}`).join(", ");
