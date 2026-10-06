// /api/leagues: JOIN THE LEAGUES from MY FILE (netlify/lib/league-entries.js; docs/CITY_SPEC.md
// "The leagues and the Departmental Cup", players' entries).
//   GET  ?caseId=                    the panel: the next draft (season, close, draft day), the file's
//                                    entry, its ratings per sport, the drafts it is in and its season
//                                    lines ("BATTING .287 FOR THE CURATED NINE. ...")
//   POST {caseId, sports: [..]}      enter or change: one or two of baseball, basketball, football,
//                                    soccer, tennis
//   POST {caseId, sports: []}        withdraw (before the close: out of that draft; after: the next)
// An unclaimed file enters on its number; a file secured to an email enters (and shows its entry)
// only from that account's session (lib/auth.js requireCaseAuth). No stakes, no paid API.
import { getStore } from "@netlify/blobs";
import { isCaseId } from "../lib/intake.js";
import { getCase, hitLimit } from "../lib/store.js";
import { requireCaseAuth, caseAuthBody } from "../lib/auth.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE } from "../lib/http.js";
import { STORE, myEntry, setEntry } from "../lib/league-entries.js";
import { manifest2Cached, partKey, STORE as PLANS } from "../lib/plans.js";
import * as SIM from "../../src/city/sim.js";

const store = () => getStore({ name: STORE, consistency: "strong" });
// Today's civic block (the day's published summary), for the season lines.
async function block() {
  const day = SIM.machineClock(Date.now()).day, m2 = await manifest2Cached(60 * 1000);
  const e = m2?.days?.[day];
  if (!e) return null;
  const sum = await getStore({ name: PLANS, consistency: "strong" }).get(partKey(day, e.ver, "summary"), { type: "json" });
  return sum?.civic || null;
}

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  const noStore = { "Cache-Control": "no-store" };
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "GET or POST. The Commissioner hears nothing else." });
  try {
    const io = { store: store(), getCase, hitLimit, block };
    if (req.method === "GET") {
      const caseId = String(new URL(req.url).searchParams.get("caseId") || "").trim().toUpperCase();
      if (!isCaseId(caseId)) return json(400, { error: "That is not a case number. Only files are drafted." });
      const auth = await requireCaseAuth(req, caseId, { write: false });
      if (!auth.ok) return json(auth.status, caseAuthBody(auth), noStore);
      const r = await myEntry(io, caseId);
      return json(r.status, r.body, noStore);
    }
    if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
    let body;
    try { body = await req.json(); } catch { return json(400, { error: "Your entry is not legible." }); }
    const caseId = String(body?.caseId || "").trim().toUpperCase();
    if (!isCaseId(caseId)) return json(400, { error: "That is not a case number. Only files are drafted." });
    const auth = await requireCaseAuth(req, caseId, { write: true });
    if (!auth.ok) return json(auth.status, caseAuthBody(auth), noStore);
    const r = await setEntry(io, { caseId, sports: body?.sports, ip: clientIp(req, context) });
    if (r.status !== 200) return json(r.status, r.body, r.retry ? { ...noStore, "Retry-After": String(r.retry) } : noStore);
    const view = await myEntry(io, caseId);
    return json(200, { ...view.body, changed: !r.body.unchanged, withdrawn: Boolean(r.body.withdrawn) }, noStore);
  } catch (err) {
    console.error("leagues failed", err?.name, err?.message);
    return json(500, { error: "The Commissioner's office is unavailable. The Department suspects a doping scandal. It is investigating." });
  }
};

export const config = { path: "/api/leagues" };
