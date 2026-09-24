// Case number logon: does this file exist, and how many visits does it hold? Nothing
// else leaves this endpoint. Lookups are metered per IP so numbers can't be enumerated.
import { isCaseId } from "../lib/intake.js";
import { getCase, hitLimit } from "../lib/store.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";

export const LOOKUPS_PER_HOUR = 30;
export const NO_SUCH_FILE = "No such file. The Department does not lose files. You have mistyped.";

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  if (req.method !== "GET") return json(405, { error: "Files are looked up, not delivered. Use GET." });
  if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });

  const caseId = (new URL(req.url).searchParams.get("caseId") || "").trim().toUpperCase();
  if (!isCaseId(caseId)) return json(400, { error: "That is not a case number. Case numbers look like HVI-XXXXXXXX. You were told this." });

  try {
    try {
      if (!(await hitLimit(`lookup-ip:${clientIp(req, context)}`, LOOKUPS_PER_HOUR, "hour")).ok) {
        return json(429, { error: "Too many file lookups from your location. The Department suspects you are guessing. Guessing is logged. Return in an hour." }, { "Retry-After": "3600" });
      }
    } catch (err) {
      console.error("case lookup limiter unavailable", err);
      return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" });
    }
    const record = await getCase(caseId);
    if (!record) return json(404, { exists: false, error: NO_SUCH_FILE });
    return json(200, { exists: true, caseId, visits: record.history?.length || 0 });
  } catch (err) {
    console.error("case lookup failed", err);
    return json(500, { error: "The records office is unavailable. Your file is safe. Probably." });
  }
};

export const config = { path: "/api/case" };
