// GET /api/me: who is signed in (masked), and which case files they hold.
// POST /api/me {action:"logout"} ends the session; {action:"claim", caseId} attaches the
// case this browser holds to the account.
import { requireAccount, revokeSession, clearCookie, maskEmail, claimCase, isOwnerAccount } from "../lib/auth.js";
import { isCaseId } from "../lib/intake.js";
import { getCase } from "../lib/store.js";
import { makeJson, preflight, foreignOrigin, FOREIGN_ORIGIN_LINE } from "../lib/http.js";

const view = s => ({ signedIn: true, email: maskEmail(s.account.email), cases: s.account.cases, owner: isOwnerAccount(s.account) });

export default async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  const noStore = { "Cache-Control": "no-store" };
  try {
    if (req.method === "GET") {
      const s = await requireAccount(req);
      return json(200, s ? view(s) : { signedIn: false }, noStore);
    }
    if (req.method !== "POST") return json(405, { error: "GET or POST. Nothing else." });
    if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
    let body;
    try { body = await req.json(); } catch { return json(400, { error: "Your request is not legible." }); }
    if (body?.action === "logout") {
      await revokeSession(req);
      return json(200, { signedIn: false }, { ...noStore, "Set-Cookie": clearCookie() });
    }
    if (body?.action === "claim") {
      const s = await requireAccount(req);
      if (!s) return json(401, { error: "Secure your file first. The Department attaches files to people, not to rumours." });
      const caseId = String(body.caseId || "").trim().toUpperCase();
      if (!isCaseId(caseId)) return json(400, { error: "That is not a case number." });
      if (!(await getCase(caseId))) return json(404, { error: "No such file." });
      const r = await claimCase(s.key, caseId);
      if (r === "taken") return json(409, { error: "That file is already secured to another subject. The Department does not share files." });
      const fresh = await requireAccount(req);
      return json(200, { ...view(fresh || s), claimed: caseId }, noStore);
    }
    return json(400, { error: "Unknown action." });
  } catch (err) {
    console.error("me failed", err?.name);
    return json(500, { error: "The access office is unavailable." });
  }
};

export const config = { path: "/api/me" };
