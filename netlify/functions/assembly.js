// THE ASSEMBLY, session 001 (docs/ASSEMBLY.md).
// GET  /api/assembly[?caseId=]  the session, the running tally (the result once closed), and
//      with a case number, that file's own ballot. The first GET ever opens the polls.
// POST /api/assembly {caseId, choice: golf|farm, reasons: [..], device}  cast or change a
//      ballot. Holding the case number is the credential (as with /api/quest). Non-binding.
// No paid API is called here.
import { getStore } from "@netlify/blobs";
import { isCaseId } from "../lib/intake.js";
import { getCase, hitLimit } from "../lib/store.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE } from "../lib/http.js";
import { STORE, publicView, castBallot, parseBallot, myBallot } from "../lib/assembly.js";

const store = () => getStore({ name: STORE, consistency: "strong" });

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  const noStore = { "Cache-Control": "no-store" };
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "GET or POST. The Assembly hears nothing else." });
  try {
    if (req.method === "GET") {
      const s = store();
      const view = await publicView(s);
      const caseId = String(new URL(req.url).searchParams.get("caseId") || "").trim().toUpperCase();
      if (isCaseId(caseId)) view.mine = await myBallot(s, caseId);
      return json(200, view, noStore);
    }
    if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
    let body;
    try { body = await req.json(); } catch { return json(400, { error: "Your ballot is not legible." }); }
    const caseId = String(body?.caseId || "").trim().toUpperCase();
    if (!isCaseId(caseId)) return json(400, { error: "That is not a case number. Only files vote." });
    const b = parseBallot(body);
    if (b.error) return json(400, { error: b.error });
    const r = await castBallot({ store: store(), getCase, hitLimit }, { caseId, choice: b.choice, reasons: b.reasons, ip: clientIp(req, context), device: body?.device });
    const extra = r.retry ? { ...noStore, "Retry-After": String(r.retry) } : noStore;
    if (r.status !== 200) return json(r.status, r.body, extra);
    const view = await publicView(store());
    return json(200, { ...view, mine: r.body.ballot, changed: r.body.changed || false, unchanged: r.body.unchanged || false }, noStore);
  } catch (err) {
    console.error("assembly failed", err?.name, err?.message);
    return json(500, { error: "The Assembly is unavailable. The Department suspects a quorum. It is investigating." });
  }
};

export const config = { path: "/api/assembly" };
