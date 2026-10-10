// /api/housing: THE HOUSING OFFICE (netlify/lib/housing.js).
//   GET ?caseId=                 the file's door, its pending move, and REQUEST A TRANSFER's list
//   POST {caseId, action: "transfer", unit}
//                                one door from that list, from the next unpublished machine day;
//                                one pending request at a time; the furniture moves with the file
// A file secured to an email answers only to that account's session (lib/auth.js requireCaseAuth);
// only assessed files are housed. Nothing here reads or writes a score or a CYCLE.
import { isCaseId } from "../lib/intake.js";
import { getCase, hitLimit } from "../lib/store.js";
import { requireCaseAuth, caseAuthBody } from "../lib/auth.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";
import { NO_SUCH_FILE } from "./case.js";
import { ensureHome, housingView, requestTransfer } from "../lib/housing.js";
import { HOUSING_LINES } from "../../src/economy/housingLines.js";

export const HOUSING_ACTIONS = ["transfer"];
export const HOUSING_IP_PER_HOUR = 300;
export const HOUSING_CASE_PER_MINUTE = 20;
export const HOUSING_TRANSFERS_PER_DAY = 6;
export const HOUSING_MISS_PER_HOUR = 30;

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  const noStore = { "Cache-Control": "no-store" };
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "GET or POST. The Housing Office keeps shorter hours than you." });
  if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
  let body = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { return json(400, { error: "Your request is not legible." }); }
    if (!HOUSING_ACTIONS.includes(body?.action)) return json(400, { error: "The Housing Office has one form. It is the transfer request." });
  }
  const url = new URL(req.url);
  const caseId = String((req.method === "GET" ? url.searchParams.get("caseId") : body?.caseId) || "").trim().toUpperCase();
  if (!isCaseId(caseId)) return json(400, { error: "That is not a case number." });
  const ip = clientIp(req, context);
  try {
    try {
      if (!(await hitLimit(`housing-ip:${ip}`, HOUSING_IP_PER_HOUR, "hour")).ok) return json(429, { error: "The Housing Office has seen enough of your location for one hour." }, { "Retry-After": "3600" });
      if (!(await hitLimit(`housing-case:${caseId}`, HOUSING_CASE_PER_MINUTE, "minute")).ok) return json(429, { error: "Slow down. The Housing Office stamps at its own pace." }, { "Retry-After": "60" });
      if (req.method === "POST" && !(await hitLimit(`housing-write:${caseId}`, HOUSING_TRANSFERS_PER_DAY, "day")).ok) return json(429, { error: HOUSING_LINES.tooMany }, { "Retry-After": "3600" });
    } catch {
      return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" });
    }
    let rec = await getCase(caseId);
    if (!rec) {
      const miss = await hitLimit(`housing-miss:${ip}`, HOUSING_MISS_PER_HOUR, "hour").catch(() => ({ ok: false }));
      return json(miss.ok ? 404 : 429, { error: miss.ok ? NO_SUCH_FILE : "Too many wrong case numbers. The Department suspects you are guessing." });
    }
    const assessed = Array.isArray(rec.history) && rec.history.some(h => h && typeof h.score === "number");
    if (!assessed) return json(403, { assessed: false, error: "Only assessed citizens are housed. Your file has no assessment on it." });
    const auth = await requireCaseAuth(req, caseId, { write: req.method === "POST" });
    if (!auth.ok) return json(auth.status, { assessed, ...caseAuthBody(auth) }, noStore);
    rec = (await ensureHome(caseId, rec)).rec;
    if (req.method === "GET") return json(200, { assessed, ...(await housingView(caseId, rec)) }, noStore);
    const out = await requestTransfer(caseId, rec, { unit: String(body.unit || "").slice(0, 64) });
    const view = await housingView(caseId, out.rec || rec);
    if (!out.ok) return json(out.status || 400, { assessed, error: out.error, code: out.code, ...view }, noStore);
    return json(200, { assessed, last: { line: out.line }, ...view }, noStore);
  } catch (err) {
    console.error("housing failed", err?.name, err?.message);
    return json(500, { error: "The Housing Office is unavailable. Nobody was moved." });
  }
};

export const config = { path: "/api/housing" };
