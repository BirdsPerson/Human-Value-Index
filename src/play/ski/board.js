// THE MOUNTAIN's verified boards, the client (/api/ski, netlify/functions/ski.js). A run is filed
// only after the server re-plays its input log on the same pure sim (src/play/ski/sim.js) and it
// comes out exactly as claimed. No browser-only code at the top: node imports BOARDED from here.
export const BOARDED = ["gs", "bigair", "park"];
const API = "/api/ski";

async function call(method, body = null, q = "") {
  const res = await fetch(API + q, method === "GET" ? { method } : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  let j = null;
  try { j = await res.json(); } catch { j = null; }
  if (!res.ok) throw new Error(j?.error || `THE BOARDS DID NOT ANSWER (${res.status}).`);
  return j;
}
// -> {v, boards: {ch: [{holder, value, unit, medal, board, at, ticks}]}, mine?: {best: {ch: value}}}
export const fetchBoards = (caseId = null) => call("GET", null, caseId ? `?caseId=${encodeURIComponent(caseId)}` : "");
// -> {runId, at, ch, v}: a permit, issued before the run starts
export const startRun = (caseId, ch) => call("POST", { caseId, action: "start", ch });
// -> {filed: {value, medal, rank, improved}, board: [...]}
export const fileRun = (caseId, { runId, ch, board, inputLog, claim }) => call("POST", { caseId, action: "file", runId, ch, board: Boolean(board), inputLog, claim });
