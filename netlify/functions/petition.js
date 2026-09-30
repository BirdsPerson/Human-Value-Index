// THE PEOPLE'S PETITION (docs/PETITION.md).
// GET  /api/petition                    the crowd's People signal per file {figures: {slug: {reading, n}}}
// GET  /api/petition/:slug[?caseId=]    one public figure's petition: state, the lean this
//      evaluation, the machine's number beside it, earlier evaluations, and your own vote
// POST /api/petition/:slug {caseId, choice: high|fair|low, device}  vote, or change your vote,
//      once per evaluation period. Holding the case number is the credential (as /api/assembly).
// Votes never move a score. No paid API is called here.
import { getStore } from "@netlify/blobs";
import { isCaseId } from "../lib/intake.js";
import { getCase, getFigure, hitLimit } from "../lib/store.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE } from "../lib/http.js";
import { STORE, fileView, castVote, parseVote, readSummary } from "../lib/petition.js";

const store = () => getStore({ name: STORE, consistency: "strong" });
const SLUG_RE = /^[a-z0-9-]{1,80}$/;

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  const noStore = { "Cache-Control": "no-store" };
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "GET or POST. The petition hears nothing else." });
  // The slug from the route, or from the path (a request reaching /.netlify/functions/petition/<slug>).
  // Anything under /petition/ that is not a bare slug (a probe for <slug>.html, <slug>/index.html)
  // is no file: only the bare /api/petition serves the summary.
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  const rest = context?.params?.slug || (path.match(/\/petition\/(.+)$/) || [])[1] || null;
  const slug = rest;
  try {
    const io = { store: store(), getCase, getCard: getFigure, hitLimit };
    if (req.method === "GET") {
      if (!slug) return json(200, { figures: await readSummary(io.store) }, { "Cache-Control": "public, max-age=300" });
      if (!SLUG_RE.test(slug)) return json(404, { error: "No such file." }, noStore);
      const caseId = String(new URL(req.url).searchParams.get("caseId") || "").trim().toUpperCase();
      const v = await fileView(io, slug, { caseId: isCaseId(caseId) ? caseId : null });
      if (!v) return json(404, { error: "No such public file. The petition is for public figures only." }, noStore);
      return json(200, v, noStore);
    }
    if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
    if (!slug || !SLUG_RE.test(slug)) return json(404, { error: "No such file." });
    let body;
    try { body = await req.json(); } catch { return json(400, { error: "Your petition is not legible." }); }
    const caseId = String(body?.caseId || "").trim().toUpperCase();
    if (!isCaseId(caseId)) return json(400, { error: "That is not a case number. Only files petition." });
    const b = parseVote(body);
    if (b.error) return json(400, { error: b.error });
    const r = await castVote(io, { caseId, slug, choice: b.choice, ip: clientIp(req, context), device: body?.device });
    const extra = r.retry ? { ...noStore, "Retry-After": String(r.retry) } : noStore;
    if (r.status !== 200) return json(r.status, r.body, extra);
    const v = await fileView(io, slug, { caseId });
    return json(200, { ...v, mine: r.body.vote, changed: r.body.changed || false, unchanged: r.body.unchanged || false }, noStore);
  } catch (err) {
    console.error("petition failed", err?.name, err?.message);
    return json(500, { error: "The petition desk is unavailable. The Department suspects the people. It is investigating." });
  }
};

export const config = { path: ["/api/petition", "/api/petition/:slug"] };
