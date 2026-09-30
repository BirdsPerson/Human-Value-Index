// THE COUNCIL ELECTIONS (docs/CITY_SPEC.md "Council elections").
// GET    /api/elections[?caseId=]  the cycle, every district's race (candidates, the players'
//        running tally, the Substrate's advisory lean), the result once closed, and with a case
//        number that file's own ballots. The first GET ever anchors the calendar.
// POST   /api/elections {caseId, district, candidate (a key, or null to withdraw), device}
//        cast, change or withdraw one race's ballot. Holding the case number is the credential
//        (as with /api/assembly). Non-binding civic theatre. No paid API is called here.
import { getStore } from "@netlify/blobs";
import { isCaseId } from "../lib/intake.js";
import { getCase, hitLimit } from "../lib/store.js";
import { censusSubjects } from "../lib/census.js";
import { fullRoster } from "../../src/city/roster.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE } from "../lib/http.js";
import { STORE, publicView, castBallot, myBallots } from "../lib/elections.js";

const store = () => getStore({ name: STORE, consistency: "strong" });
// The slate is drawn from the whole census, strictly: a failed read opens nothing.
const census = async () => fullRoster(await censusSubjects({ strict: true }));

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  const noStore = { "Cache-Control": "no-store" };
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "GET or POST. The Council hears nothing else." });
  try {
    const io = { store: store(), census, getCase, hitLimit };
    if (req.method === "GET") {
      const view = await publicView(io);
      const caseId = String(new URL(req.url).searchParams.get("caseId") || "").trim().toUpperCase();
      if (isCaseId(caseId)) view.mine = await myBallots(io.store, caseId);
      return json(200, view, noStore);
    }
    if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
    let body;
    try { body = await req.json(); } catch { return json(400, { error: "Your ballot is not legible." }); }
    const caseId = String(body?.caseId || "").trim().toUpperCase();
    if (!isCaseId(caseId)) return json(400, { error: "That is not a case number. Only files vote." });
    const district = String(body?.district || "").toLowerCase();
    const candidate = body?.candidate == null ? null : String(body.candidate);
    const r = await castBallot(io, { caseId, district, candidate, ip: clientIp(req, context), device: body?.device });
    const extra = r.retry ? { ...noStore, "Retry-After": String(r.retry) } : noStore;
    if (r.status !== 200) return json(r.status, r.body, extra);
    const view = await publicView(io);
    return json(200, { ...view, mine: r.body.mine, changed: r.body.changed || false, unchanged: r.body.unchanged || false, withdrawn: r.body.withdrawn || false }, noStore);
  } catch (err) {
    console.error("elections failed", err?.name, err?.message);
    return json(500, { error: "The Council is unavailable. The Department suspects a quorum. It is investigating." });
  }
};

export const config = { path: "/api/elections" };
