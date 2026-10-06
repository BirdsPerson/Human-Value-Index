// CITIZEN PROPOSALS (docs/PROPOSALS.md).
// GET  /api/proposals[?caseId=][&review=1]   the docket, the session in progress, the acts; with a
//      case number, that file's ballot and signatures; with review=1 and the owner's signed-in
//      account, the review queue.
// POST /api/proposals {action: "file", caseId, type, target, title, desc}
//      {action: "cosign", caseId, pid, device}
//      {action: "ballot", caseId, side: for|against, reasons, device}
//      {action: "review", caseId, op: approve|decline|merge, pid, reason?, into?}   owner only
// An unclaimed file acts on its number; a file secured to an email acts (and sees its ballot) only
// from that account's session (lib/auth.js requireCaseAuth). The owner is a signed-in owner account,
// never a case number. Filing spends one Haiku call (lib/proposalModeration.js), behind the
// pre-filter and the caps.
import { getStore } from "@netlify/blobs";
import { isCaseId } from "../lib/intake.js";
import { getCase, hitLimit, refundLimit } from "../lib/store.js";
import { requireAccount, isOwnerAccount, requireCaseAuth, caseAuthBody } from "../lib/auth.js";
import { makeJson, preflight, foreignOrigin, clientIp, chargeGlobal, FOREIGN_ORIGIN_LINE } from "../lib/http.js";
import { readSession, STORE as ASM_STORE } from "../lib/assembly.js";
import { STORE, publicView, ownerView, fileProposal, cosign, castBallot, parseBallot, review } from "../lib/proposals.js";
import { makeModerator } from "../lib/proposalModeration.js";

const store = () => getStore({ name: STORE, consistency: "strong" });
// The owner: a session of an owner account (one holding a case in HVI_OWNER_CASES). A case
// number alone never is: this repository is public.
async function isOwner(req) {
  try { const s = await requireAccount(req); return Boolean(s && isOwnerAccount(s.account)); } catch { return false; }
}
const asmCloseAt = async () => (await readSession(getStore({ name: ASM_STORE, consistency: "strong" })))?.closeAt || null;
const moderate = makeModerator({ chargeGlobal, hitLimit, refundLimit });

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  const noStore = { "Cache-Control": "no-store" };
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "GET OR POST. THE DOCKET HEARS NOTHING ELSE." });
  try {
    if (req.method === "GET") {
      const q = new URL(req.url).searchParams;
      const caseId = String(q.get("caseId") || "").trim().toUpperCase();
      const s = store();
      // the docket always answers; the file's own ballot and signatures only to whoever may read the file
      let mine = isCaseId(caseId) ? caseId : null, secured = null;
      if (mine) { const auth = await requireCaseAuth(req, mine, { write: false }); if (!auth.ok) { secured = caseAuthBody(auth); mine = null; } }
      const view = await publicView(s, { caseId: mine });
      if (secured) Object.assign(view, secured);
      view.owner = await isOwner(req);
      if (view.owner && q.get("review")) view.review = await ownerView(s);
      return json(200, view, noStore);
    }
    if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
    let body;
    try { body = await req.json(); } catch { return json(400, { error: "YOUR PAPERWORK IS NOT LEGIBLE." }); }
    const caseId = String(body?.caseId || "").trim().toUpperCase();
    if (!isCaseId(caseId)) return json(400, { error: "THAT IS NOT A CASE NUMBER. ONLY FILES PETITION." });
    const auth = await requireCaseAuth(req, caseId, { write: true });
    if (!auth.ok) return json(auth.status, caseAuthBody(auth), noStore);
    const ip = clientIp(req, context), s = store();
    const io = { store: s, getCase, hitLimit, refundLimit, moderate, asmCloseAt };
    let r;
    if (body.action === "file") r = await fileProposal(io, { caseId, body, ip });
    else if (body.action === "cosign") r = await cosign(io, { caseId, pid: String(body.pid || ""), ip, device: body.device });
    else if (body.action === "ballot") {
      const b = parseBallot(body);
      if (b.error) return json(400, { error: b.error });
      r = await castBallot(io, { caseId, side: b.side, reasons: b.reasons, ip, device: body.device });
    } else if (body.action === "review") {
      if (!(await isOwner(req))) return json(403, { error: "THE REVIEW QUEUE IS THE OWNER'S. YOU ARE NOT THE OWNER. THE DEPARTMENT CHECKED." });
      r = await review(io, { action: String(body.op || ""), pid: String(body.pid || ""), reason: body.reason, into: String(body.into || "") });
    } else return json(400, { error: "FILE, COSIGN, BALLOT OR REVIEW. THE DOCKET HAS FOUR SLOTS." });
    const extra = r.body?.retry ? { ...noStore, "Retry-After": String(r.body.retry) } : noStore;
    return json(r.status, r.body, extra);
  } catch (err) {
    console.error("proposals failed", err?.name, err?.message);
    return json(500, { error: "THE DOCKET IS UNAVAILABLE. THE DEPARTMENT SUSPECTS A QUORUM. IT IS INVESTIGATING." });
  }
};

export const config = { path: "/api/proposals" };
