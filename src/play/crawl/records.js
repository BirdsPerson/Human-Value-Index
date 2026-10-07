// THE SUB-BASEMENTS: what this browser keeps (D1 records locally only; the file and the ledger land
// in D2): the deepest floor, runs, lifts reached, what came up in the lift (crates, bounty recorded
// with the level's factor, nothing minted), and the last runs as records you can watch again.
const KEY = "hvi-crawl-progress", RUNS_KEY = "hvi-crawl-runs", KEEP_RUNS = 8;
const blank = () => ({ v: 1, deepest: 0, runs: 0, lifted: 0, lost: 0, lifts: [], bounty: 0, crates: [], items: {}, level: "intern", hand: 0, controls: "assist", at: 0 });
export function loadProgress() { try { const j = JSON.parse(localStorage.getItem(KEY) || "null"); if (j && typeof j === "object") return { ...blank(), ...j }; } catch { /* private */ } return blank(); }
export function saveProgress(p) { try { localStorage.setItem(KEY, JSON.stringify({ ...p, at: Date.now() })); } catch { /* the tab remembers */ } }
// a filed run: the claim -> the browser's records (lifts reached stay reached, either way it ended)
export function recordRun(p, res) {
  p.runs++;
  p.deepest = Math.max(p.deepest, res.depth || 0);
  for (const f of res.lifts || []) if (!p.lifts.includes(f)) p.lifts.push(f);
  if (res.exit === "lift") {
    p.lifted++; p.bounty += res.bountyPaid || 0;
    for (const it of res.pack || []) { if (it.startsWith("crate:")) p.crates.push(it.slice(6)); else p.items[it] = (p.items[it] || 0) + 1; }
  } else p.lost++;
  return p;
}
export function loadRuns() { try { const j = JSON.parse(localStorage.getItem(RUNS_KEY) || "[]"); return Array.isArray(j) ? j : []; } catch { return []; } }
export function saveRun(run) { try { localStorage.setItem(RUNS_KEY, JSON.stringify([run, ...loadRuns()].slice(0, KEEP_RUNS))); return true; } catch { return false; } }
