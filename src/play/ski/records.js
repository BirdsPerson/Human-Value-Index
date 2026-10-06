// THE MOUNTAIN, skiable: what this browser keeps. The places found (fast travel goes only there), the
// files found, each challenge's best and medal, the runs saved (a run is {v, ch | snap, board,
// inputLog}: enough to play it again). Nothing here reaches a file or the league.
//
// skiResults(): the small shape the newspaper's sports page can read (the challenges' records).
import { CHALLENGES, LOWER_BETTER, medalOf } from "./challenges.js";

const KEY = "hvi-ski-progress", RUNS_KEY = "hvi-ski-runs", KEEP_RUNS = 12;
const blank = () => ({ v: 1, found: ["base"], files: 0, medals: {}, board: false, at: 0 });
export function loadProgress() {
  try { const j = JSON.parse(localStorage.getItem(KEY) || "null"); if (j && Array.isArray(j.found)) return { ...blank(), ...j, found: [...new Set(["base", ...j.found])] }; } catch { /* a private store */ }
  return blank();
}
export function saveProgress(p) { try { localStorage.setItem(KEY, JSON.stringify({ ...p, at: Date.now() })); } catch { /* the tab remembers */ } }
// a finished challenge: keep the best (and its medal) -> {best: bool, prev}
export function fileResult(p, res) {
  if (!res || res.value == null) return { best: false, prev: p.medals[res?.id]?.best ?? null };
  const C = CHALLENGES.find(c => c.id === res.id), cur = p.medals[res.id];
  const better = !cur || cur.best == null || (LOWER_BETTER(C) ? res.value < cur.best : res.value > cur.best);
  if (better) p.medals[res.id] = { best: res.value, medal: Math.max(cur?.medal || 0, medalOf(C, res.value)), at: Date.now() };
  return { best: better, prev: cur?.best ?? null };
}
export function loadRuns() { try { const j = JSON.parse(localStorage.getItem(RUNS_KEY) || "[]"); return Array.isArray(j) ? j : []; } catch { return []; } }
export function saveRun(run) {
  try { localStorage.setItem(RUNS_KEY, JSON.stringify([run, ...loadRuns()].slice(0, KEEP_RUNS))); return true; } catch { return false; }
}
export function deleteRun(at) { try { localStorage.setItem(RUNS_KEY, JSON.stringify(loadRuns().filter(r => r.at !== at))); } catch { /* */ } }
const fmt = (c, v) => (v == null ? "-" : c.unit === "s" ? `${v.toFixed(2)} S` : c.unit === "place" ? `${ordinal(v)} PLACE` : c.unit === "%" ? `${v}%` : c.unit === "m" ? `${v.toFixed(1)} M` : `${v} ${c.unit.toUpperCase()}`);
export const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "TH" : ["TH", "ST", "ND", "RD"][n % 10] || "TH"}`;
export const fmtValue = fmt;
// For the newspaper (and anything else that reports on the mountain): this browser's records.
// -> {game: "ski", at, files: n, challenges: [{id, name, unit, best, shown, medal (0..3), at}]}
export function skiResults(p = loadProgress()) {
  let files = 0; for (let i = 0; i < 16; i++) if (p.files & (1 << i)) files++;
  return {
    game: "ski", at: p.at || null, files,
    challenges: CHALLENGES.filter(c => c.start).map(c => { const m = p.medals[c.id]; return { id: c.id, name: c.name, unit: c.unit, best: m?.best ?? null, shown: fmt(c, m?.best ?? null), medal: m?.medal || 0, at: m?.at || null }; }),
  };
}
