// GET /api/quest?caseId= : the file's directives and vouches.
// POST /api/quest {caseId, action: accept|complete|abandon, questId, buildingId?}
// An unclaimed file answers to its number; a file secured to an email needs that account's
// session (lib/auth.js requireCaseAuth). Completion is checked against the city sim
// server-side: the figure must be in that building now. No paid API is called here.
import { isCaseId } from "../lib/intake.js";
import { getCase, updateCase, putPenCard, hitLimit } from "../lib/store.js";
import { housedUnderAt } from "../../src/city/sim.js";
import { sanitizeAvatar } from "../../src/avatar.js";
import { requireCaseAuth, caseAuthBody } from "../lib/auth.js";
import { applyQuest, questState } from "../lib/quests.js";
import { loadSocialSnapshots } from "../lib/social-store.js";
import { loadOnFile, questDays } from "../lib/plans.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";
import { NO_SUCH_FILE } from "./case.js";
import { setRoster } from "../../src/city/sim.js";
import { baseRoster } from "../../src/city/roster.js";

// Figures on file are placed first by the capacity allocator, so registering just them
// puts every quest figure where the browsers (which register the whole census) see it.
// When the day is published (netlify/lib/plans.js), the check reads the same plan every
// browser draws instead, for every machine day the report's look-back window touches: the
// figures on file's whole-day rows from the day's summary (format 2), or the one-file plan
// for a day not yet split.
setRoster(baseRoster());

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
    const auth = await requireCaseAuth(req, caseId, { write: req.method === "POST" });
    if (!auth.ok) return json(auth.status, caseAuthBody(auth), noStore);
    if (req.method === "GET") {
      const record = await getCase(caseId);
      if (!record) return json(404, { error: NO_SUCH_FILE });
      return json(200, questState(record), noStore);
    }
    const input = { action: body.action, questId: body.questId, buildingId: body.buildingId };
    let fail = null, vouch = null;
    const now = Date.now();
    if (input.action === "complete") await loadOnFile(questDays(now)).catch(err => { console.error("quest: plans unreadable, the sim decides", err?.message); });
    const saved = await updateCase(caseId, rec => {
      const r = applyQuest(rec, input, now);
      fail = null;
      if (r.error) { fail = r; return undefined; }
      vouch = r.vouch || null;
      return r.record;
    });
    if (fail) return json(fail.status, { error: fail.error });
    // A vouch that moved the score moves the citizen's pen card with it.
    if (vouch?.delta) {
      const e = saved.history[saved.history.length - 1];
      const last4 = caseId.slice(-4);
      await putPenCard(caseId, {
        slug: `citizen-${last4.toLowerCase()}`, name: `Subject ${last4}`, score: e.score, tier: e.tier, quadrant: e.quadrant, warmth: e.warmth, competence: e.competence, scarcity: e.scarcity ?? null,
        housedUnder: housedUnderAt(e.at), avatar: sanitizeAvatar(saved.avatar), sprite: saved.avatar?.kind === "sprite" ? saved.avatar.url : null,
        kind: "citizen", updated: e.at,
      }).catch(err => console.error("vouch pen card failed", err?.message));
    }
    return json(200, { ...questState(saved, now), vouch }, noStore);
  } catch (err) {
    console.error("quest failed", err?.name);
    return json(500, { error: "The Archive is unavailable. Your directives will wait. Patience is also assessed." });
  }
};

export const config = { path: "/api/quest" };
