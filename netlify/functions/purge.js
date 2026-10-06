// POST /api/purge {caseId, confirm}: the subject deletes their own file. confirm must repeat
// the case number. A file secured to an email needs that account's session; an unsecured
// file needs only the case number (the same credential that reads it, /api/file).
// Deletes: the case record (transcripts, scores, verdicts, photo, history), its public pen
// card, its account link, its league entry, its tournament entries (the name on each board struck), its CYCLES ledger (every entry, position and claim),
// and the account itself when that was its last file.
import { isCaseId } from "../lib/intake.js";
import { getCase, deleteCase, removePenCard, hitLimit } from "../lib/store.js";
import { deleteWallet, dropFromBoard } from "../lib/casino-store.js";
import { deleteChess } from "../lib/chess-store.js";
import { deleteAquarium } from "../lib/aquarium-store.js";
import { deleteSki } from "../lib/ski-store.js";
import { deleteTournaments } from "../lib/tournament-store.js";
import { purgeLedger } from "../lib/economy-db.js";
import { getStore } from "@netlify/blobs";
import { dropEntry, STORE as LEAGUES_STORE } from "../lib/league-entries.js";
import { requireCaseAuth, caseAuthBody, detachCase, revokeSession, clearCookie } from "../lib/auth.js";
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
    // the same rule as every other write on a file (lib/auth.js requireCaseAuth)
    const auth = await requireCaseAuth(req, caseId, { write: true });
    if (!auth.ok) return json(auth.status, { ...caseAuthBody(auth), error: auth.code === "sign-in" ? "This file is secured to an email address. Sign in with that address first, then purge." : auth.error });
    const owner = auth.acct;
    let accountDeleted = false;
    // The Treasury's ledger first: if it is down, nothing is deleted and the purge can be retried.
    await purgeLedger(caseId);
    await deleteCase(caseId);
    await removePenCard(caseId);
    await Promise.all([deleteWallet(caseId), dropFromBoard(caseId)]).catch(err => console.warn("purge: casino wallet", err?.message));
    await deleteChess(caseId).catch(err => console.warn("purge: chess record", err?.message));
    await deleteAquarium(caseId).catch(err => console.warn("purge: aquarium record", err?.message));
    await deleteSki(caseId).catch(err => console.warn("purge: ski record", err?.message));
    await deleteTournaments(caseId).catch(err => console.warn("purge: tournament record", err?.message));
    await dropEntry(getStore({ name: LEAGUES_STORE, consistency: "strong" }), caseId).catch(err => console.warn("purge: league entry", err?.message));
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
