// THE PARK, skateable: what this browser keeps. Pure apart from localStorage.
//   progress  per level: the goals ever done, the best RUN score, the best combo
//   results   the finished runs, newest first (at most KEEP_N), each kept only once it has been
//             re-skated from its own input log and came out the same (Skate.jsx verifies first)
// THE SHAPE of a result (the tournaments' async events read it; a server can re-run `rec`):
//   { game: "skate", v, level, mode, seed, score, best, letters: "SK_TE", tape, goals: [id],
//     goalsOf, ticks, done, verified: true, at: <ISO>, skater: <name>,
//     rec: {v, cfg: {level, mode, seed}, inputLog} }
export const KEEP = "hvi-skate-results", PROG = "hvi-skate-progress", KEEP_N = 20;
export function readResults() { try { const j = JSON.parse(localStorage.getItem(KEEP) || "[]"); return Array.isArray(j) ? j : []; } catch { return []; } }
export function keepResult(r) {
  if (!r?.verified) return false;
  try { localStorage.setItem(KEEP, JSON.stringify([r, ...readResults()].slice(0, KEEP_N))); return true; } catch { return false; }
}
export function readProgress() { try { const j = JSON.parse(localStorage.getItem(PROG) || "{}"); return j && typeof j === "object" ? j : {}; } catch { return {}; } }
// a finished run into the progress -> the new progress (and whether it beat the best)
export function fileProgress(res) {
  const p = readProgress(), L = p[res.level] || { goals: [], best: 0, combo: 0 };
  const beat = res.mode === "run" && res.score > (L.best || 0);
  const next = { goals: [...new Set([...(L.goals || []), ...res.goals])], best: res.mode === "run" ? Math.max(L.best || 0, res.score) : L.best || 0, combo: Math.max(L.combo || 0, res.best) };
  p[res.level] = next;
  try { localStorage.setItem(PROG, JSON.stringify(p)); } catch { /* the tab remembers */ }
  return { p, beat };
}
export const resultLine = (r) => `${r.score.toLocaleString("en-US")} ON ${r.level.toUpperCase()} (${r.goals.length}/${r.goalsOf} GOALS)`;
