// GET /api/quest?caseId= : the file's directives and vouches.
// POST /api/quest {caseId, action: accept|complete|abandon, questId, buildingId?}
// Holding the case number is the credential (as with /api/file). Completion is checked
// against the city sim server-side: the figure must be in that building now.
// No paid API is called here.
import { isCaseId } from "../lib/intake.js";
import { getCase, updateCase, hitLimit } from "../lib/store.js";
import { applyQuest, questState } from "../lib/quests.js";
import { loadSocialSnapshots } from "../lib/social-store.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";
import { NO_SUCH_FILE } from "./case.js";

export const QUEST_CALLS_PER_HOUR = 60;

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  const noStore = { "Cache-Control": "no-store" };
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "GET or POST. Nothing else." });
  if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
  let body = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { return json(400, { error: "Your request is not legible." }); }
  }
  const caseId = String((req.method === "GET" ? new URL(req.url).searchParams.get("caseId") : body?.caseId) || "").trim().toUpperCase();
  if (!isCaseId(caseId)) return json(400, { error: "That is not a case number." });
  // Friends pull each other toward shared haunts (src/city/social.js); the contact and
  // meeting checks must see the same city the browser does.
  await loadSocialSnapshots().catch(() => false);
  try {
    try {
      if (!(await hitLimit(`quest-ip:${clientIp(req, context)}`, QUEST_CALLS_PER_HOUR, "hour")).ok) {
        return json(429, { error: "Too many directives from your location. The Archive is closed to you for the hour." }, { "Retry-After": "3600" });
      }
    } catch {
      return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" });
    }
    if (req.method === "GET") {
      const record = await getCase(caseId);
      if (!record) return json(404, { error: NO_SUCH_FILE });
      return json(200, questState(record), noStore);
    }
    const input = { action: body.action, questId: body.questId, buildingId: body.buildingId };
    let fail = null, vouch = null;
    const now = Date.now();
    const saved = await updateCase(caseId, rec => {
      const r = applyQuest(rec, input, now);
      fail = null;
      if (r.error) { fail = r; return undefined; }
      vouch = r.vouch || null;
      return r.record;
    });
    if (fail) return json(fail.status, { error: fail.error });
    return json(200, { ...questState(saved, now), vouch }, noStore);
  } catch (err) {
    console.error("quest failed", err?.name);
    return json(500, { error: "The Archive is unavailable. The dead can wait. They are good at it." });
  }
};

export const config = { path: "/api/quest" };
