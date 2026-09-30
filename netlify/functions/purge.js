// POST /api/purge {caseId, confirm}: the subject deletes their own file. confirm must repeat
// the case number. A file secured to an email needs that account's session; an unsecured
// file needs only the case number (the same credential that reads it, /api/file).
// Deletes: the case record (transcripts, scores, verdicts, photo, history), its public pen
// card, its account link, and the account itself when that was its last file.
import { isCaseId } from "../lib/intake.js";
import { getCase, deleteCase, removePenCard, hitLimit } from "../lib/store.js";
import { deleteWallet, dropFromBoard } from "../lib/casino-store.js";
import { requireAccount, caseOwner, detachCase, revokeSession, clearCookie } from "../lib/auth.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";

export const PURGES_PER_IP_DAILY = 10;
export const PURGED_LINE = "File shredded. The Department has no record of you. It will pretend this does not sting.";

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  if (req.method !== "POST") return json(405, { error: "Purges are requested by POST." });
  if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
  let body;
  try { body = await req.json(); } catch { return json(400, { error: "The request could not be read." }); }
  const caseId = String(body?.caseId || "").trim().toUpperCase();
  if (!isCaseId(caseId)) return json(400, { error: "That is not a case number." });
  if (String(body?.confirm || "").trim().toUpperCase() !== caseId) return json(400, { error: "Type the case number again to confirm. A purge cannot be undone." });

  try {
    try {
      if (!(await hitLimit(`purge-ip:${clientIp(req, context)}`, PURGES_PER_IP_DAILY)).ok) return json(429, { error: "Too many purge requests today. Return tomorrow." }, { "Retry-After": "3600" });
    } catch {
      return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" });
    }
    if (!(await getCase(caseId))) return json(404, { error: "No such file. It may already have been purged." });
    const owner = await caseOwner(caseId);
    let accountDeleted = false;
    if (owner) {
      const s = await requireAccount(req);
      if (!s || s.key !== owner) return json(401, { error: "This file is secured to an email address. Sign in with that address first, then purge." });
    }
    await deleteCase(caseId);
    await removePenCard(caseId);
    await Promise.all([deleteWallet(caseId), dropFromBoard(caseId)]).catch(err => console.warn("purge: casino wallet", err?.message));
    if (owner) ({ accountDeleted } = await detachCase(owner, caseId));
    const extra = { "Cache-Control": "no-store" };
    if (accountDeleted) { await revokeSession(req).catch(() => {}); extra["Set-Cookie"] = clearCookie(); }
    return json(200, { ok: true, purged: caseId, accountDeleted, message: PURGED_LINE }, extra);
  } catch (err) {
    console.error("purge failed", err?.name);
    return json(500, { error: "The purge did not complete. Try again; nothing further was changed." });
  }
};

export const config = { path: "/api/purge" };
