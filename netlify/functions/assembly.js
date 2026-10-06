// THE ASSEMBLY (docs/ASSEMBLY.md): the session in progress (001, then 002 from 001's close).
// GET  /api/assembly[?caseId=]  the session, the running tally (the result once closed), the
//      sessions before it, and with a case number, that file's own ballot. The first GET ever
//      opens the polls; the first after a close opens the next session.
// POST /api/assembly {caseId, session, choice: golf|farm (001) | choices: {coast, heights} (002),
//      reasons: [..], device}  cast or change a ballot in the session in progress. An unclaimed
//      file votes on its number; a file secured to an email votes (and sees its ballot) only from
//      that account's session (lib/auth.js requireCaseAuth). Non-binding.
// No paid API is called here.
import { getStore } from "@netlify/blobs";
import { isCaseId } from "../lib/intake.js";
import { getCase, hitLimit } from "../lib/store.js";
import { requireCaseAuth, caseAuthBody } from "../lib/auth.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE } from "../lib/http.js";
import { STORE, publicView, castBallot, parseBallot, myBallot, currentSession } from "../lib/assembly.js";
import { substrateSource } from "../lib/substrate-source.js";

const store = () => getStore({ name: STORE, consistency: "strong" });
const source = substrateSource();

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  const noStore = { "Cache-Control": "no-store" };
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "GET or POST. The Assembly hears nothing else." });
  try {
    if (req.method === "GET") {
      const s = store();
      const view = await publicView(s, Date.now(), { source });
      const caseId = String(new URL(req.url).searchParams.get("caseId") || "").trim().toUpperCase();
      if (isCaseId(caseId)) {
        // the public view always answers; the file's own ballot only to whoever may read the file
        const auth = await requireCaseAuth(req, caseId, { write: false });
        if (auth.ok) view.mine = await myBallot(s, caseId, view.session.id);
        else Object.assign(view, { mine: null }, caseAuthBody(auth));
      }
      return json(200, view, noStore);
    }
    if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
    let body;
    try { body = await req.json(); } catch { return json(400, { error: "Your ballot is not legible." }); }
    const caseId = String(body?.caseId || "").trim().toUpperCase();
    if (!isCaseId(caseId)) return json(400, { error: "That is not a case number. Only files vote." });
    const auth = await requireCaseAuth(req, caseId, { write: true });
    if (!auth.ok) return json(auth.status, caseAuthBody(auth), noStore);
    const { sid } = await currentSession(store());
    if (body?.session && String(body.session) !== sid) return json(409, { error: "That session has closed and another has opened. Reload the Assembly. The Department moved on without you.", session: sid });
    const b = parseBallot(body, sid);
    if (b.error) return json(400, { error: b.error });
    const r = await castBallot({ store: store(), getCase, hitLimit }, { caseId, choice: b.choice, reasons: b.reasons, ip: clientIp(req, context), device: body?.device, sid });
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
