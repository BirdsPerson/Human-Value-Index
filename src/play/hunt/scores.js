// This browser's high scores, per trip (localStorage), and the initials the marquee shows.
const KEY = "hvi-hunt-scores", TAG = "hvi-arcade-initials";
export function loadScores() { try { const j = JSON.parse(localStorage.getItem(KEY) || "{}"); return j && typeof j === "object" ? j : {}; } catch { return {}; } }
// -> true when it is this browser's best for the trip
export function saveScore(trip, r) {
  const all = loadScores(), list = Array.isArray(all[trip]) ? all[trip] : [];
  list.push({ score: r.score, at: Date.now(), trophy: r.trophy || null, end: r.end });
  list.sort((a, b) => b.score - a.score);
  all[trip] = list.slice(0, 5);
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* the tab remembers */ }
  return all[trip][0].score === r.score;
}
export const loadTag = () => { try { return (localStorage.getItem(TAG) || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3); } catch { return ""; } };
export const saveTag = (t) => { try { localStorage.setItem(TAG, String(t).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3)); } catch { /* fine */ } };
