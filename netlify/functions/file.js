// GET /api/file?caseId=: the subject's CURRENT file from the server, so a browser never
// shows a stale cached result. Holding the case number is the credential (as with
// /api/case and /api/avatar); a signed-in account may also read its claimed cases.
// Voided entries (removed at the subject's request) are never returned.
import { isCaseId } from "../lib/intake.js";
import { getCase, hitLimit } from "../lib/store.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";
import { NO_SUCH_FILE } from "./case.js";

export const FILE_READS_PER_HOUR = 60;
const FIELDS = ["score", "tier", "warmth", "competence", "quadrant", "judge", "realityIndex", "breakdown", "confidence", "verdict", "flags", "commendations", "rubric", "simulated", "appeal", "at"];

export function currentFile(record) {
  const history = (record?.history || []).filter(h => h && !h.voided && typeof h.score === "number");
  const last = history[history.length - 1] || null;
  const latest = last ? Object.fromEntries(FIELDS.filter(k => last[k] !== undefined).map(k => [k, last[k]])) : null;
  if (latest && latest.rubric === undefined) latest.rubric = 1;
  return { visits: history.length, latest, avatar: record?.avatar || null, history: history.map(h => ({ score: h.score, at: h.at })) };
}

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  if (req.method !== "GET") return json(405, { error: "Files are read with GET." });
  if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
  const caseId = (new URL(req.url).searchParams.get("caseId") || "").trim().toUpperCase();
  if (!isCaseId(caseId)) return json(400, { error: "That is not a case number." });
  try {
    try {
      if (!(await hitLimit(`file-ip:${clientIp(req, context)}`, FILE_READS_PER_HOUR, "hour")).ok) {
        return json(429, { error: "Too many file reads from your location. Return in an hour." }, { "Retry-After": "3600" });
      }
    } catch {
      return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" });
    }
    const record = await getCase(caseId);
    if (!record) return json(404, { exists: false, error: NO_SUCH_FILE });
    return json(200, { exists: true, caseId, ...currentFile(record) }, { "Cache-Control": "no-store" });
  } catch (err) {
    console.error("file read failed", err?.name);
    return json(500, { error: "The records office is unavailable." });
  }
};

export const config = { path: "/api/file" };
