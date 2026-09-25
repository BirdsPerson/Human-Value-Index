// The file photo on a case: read it (GET), or redraw it from a new description (POST).
// A case whose photo is a hand-drawn sprite keeps it; everyone else gets enum-only specs.
import { isCaseId } from "../lib/intake.js";
import { getCase, updateCase, putPenCard, hitLimit } from "../lib/store.js";
import { makeJson, preflight, foreignOrigin, clientIp, chargeGlobal, FOREIGN_ORIGIN_LINE, GLOBAL_CAP_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";
import { descriptionError, extractSpec } from "../lib/avatar.js";
import { sanitizeAvatar } from "../../src/avatar.js";

export const UPDATES_PER_CASE_DAILY = 5;
export const UPDATES_PER_IP_DAILY = 20;
export const LOOKUPS_PER_IP_HOURLY = 60;
export const UPDATED_LINE = "The Department will update your likeness. It was not flattering before either.";
export const HAND_DRAWN_LINE = "Your likeness was drawn by the Department by hand. It is not open to amendment.";

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
  const ip = clientIp(req, context);

  if (req.method === "GET") {
    const caseId = (new URL(req.url).searchParams.get("caseId") || "").trim().toUpperCase();
    if (!isCaseId(caseId)) return json(400, { error: "That is not a case number. Case numbers look like HVI-XXXXXXXX. You were told this." });
    try {
      if (!(await hitLimit(`avatar-look-ip:${ip}`, LOOKUPS_PER_IP_HOURLY, "hour")).ok) return json(429, { error: "Too many photo lookups. The archive clerk has gone for tea. Return in an hour." }, { "Retry-After": "3600" });
      const record = await getCase(caseId);
      if (!record) return json(404, { error: "No such file." });
      return json(200, { avatar: sanitizeAvatar(record.avatar) });
    } catch (err) {
      console.error("avatar lookup failed", err);
      return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" });
    }
  }
  if (req.method !== "POST") return json(405, { error: "File photos are read with GET and redrawn with POST. There is no third way." });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Your request is not legible. The Department does not do handwriting." }); }
  const { caseId, description } = body || {};
  if (!isCaseId(caseId)) return json(400, { error: "That is not a case number. Case numbers look like HVI-XXXXXXXX. You were told this." });
  const bad = descriptionError(description);
  if (bad) return json(400, { error: bad });

  try {
    const record = await getCase(caseId);
    if (!record?.history?.length) return json(404, { error: "There is no file to photograph. Be assessed first." });
    if (record.avatar?.kind === "sprite") return json(409, { error: HAND_DRAWN_LINE, avatar: sanitizeAvatar(record.avatar) });
    try {
      if (!(await hitLimit(`avatar-ip:${ip}`, UPDATES_PER_IP_DAILY)).ok) return json(429, { error: "Your location has been redrawn enough for one day. Return tomorrow." }, { "Retry-After": "3600" });
      if (!(await hitLimit(`avatar-case:${caseId}`, UPDATES_PER_CASE_DAILY)).ok) return json(429, { error: "Five new likenesses in one day. You are not changing that fast. Return tomorrow." }, { "Retry-After": "3600" });
      if (!(await chargeGlobal())) return json(503, { error: GLOBAL_CAP_LINE }, { "Retry-After": "3600" });
    } catch (err) {
      console.error("avatar limiter unavailable", err);
      return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" });
    }
    const spec = await extractSpec(description).catch(() => null);
    if (!spec) return json(502, { error: "The Department's illustrator could not make sense of that. Plainer words. Hair, build, clothes." });
    const avatar = { kind: "procedural", spec };
    const saved = await updateCase(caseId, cur => (cur && cur.avatar?.kind !== "sprite" ? { ...cur, avatar } : undefined));
    if (!saved || saved.avatar?.kind === "sprite") return json(409, { error: HAND_DRAWN_LINE });
    const last = saved.history[saved.history.length - 1];
    const last4 = caseId.slice(-4);
    await putPenCard(caseId, {
      slug: `citizen-${last4.toLowerCase()}`, name: `Subject ${last4}`,
      score: last.score, tier: last.tier, quadrant: last.quadrant, warmth: last.warmth, competence: last.competence,
      avatar, sprite: null, kind: "citizen", updated: new Date().toISOString(),
    });
    return json(200, { avatar, line: UPDATED_LINE });
  } catch (err) {
    console.error("avatar update failed", err);
    return json(500, { error: "The records office is unavailable. Your face is safe. Probably." });
  }
};

export const config = { path: "/api/avatar" };
