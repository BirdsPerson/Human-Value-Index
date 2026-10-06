// /api/mail: DEPARTMENT MAIL (docs/design/COMMS.md, layer 1; src/mail/).
//   GET ?caseId=[&count=1]         the file's post. The day's letters are delivered at the first look
//                                  of the real day (America/New_York, the paper's day): generated from
//                                  the day's events (netlify/lib/mail-gen.js), at most a few, once.
//                                  count=1 answers {unread} only (MY FILE's line).
//   POST {caseId, op, id}          op: read | unread | archive | unarchive | delete | restore | readall
//                                  (readall: id is a folder, or empty for all). Flags only.
// No user writes a letter: there is no send, reply or forward, and nothing here takes text. Holding the
// case number is the credential for an unclaimed file; a file secured to an email needs its session
// (lib/auth.js requireCaseAuth), for the reads as well (the inbox is private). Purged with the file (/api/purge) and by
// the retention sweep (netlify/lib/prune.js).
import { isCaseId } from "../lib/intake.js";
import { getCase, hitLimit } from "../lib/store.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";
import { NO_SUCH_FILE } from "./case.js";
import { requireCaseAuth, caseAuthBody } from "../lib/auth.js";
import { getInbox, updateInbox, Busy } from "../lib/mail-store.js";
import { gatherEvents } from "../lib/mail-events.js";
import { lettersFor } from "../lib/mail-gen.js";
import { paperDate } from "../lib/paper-notices.js";
import { OPS, viewOf, applyOp, deliver, tidy, unreadIn, newInbox } from "../../src/mail/mail.js";

export const MAIL_IP_PER_HOUR = 600;
export const MAIL_CASE_PER_MINUTE = 60;

// Today's post into the file's inbox, at most once a date. -> the inbox
export async function deliverToday(caseId, rec, nowMs = Date.now(), io = undefined) {
  const date = paperDate(nowMs);
  const cur = await getInbox(caseId);
  if (cur?.days?.includes(date)) return cur;
  const E = await gatherEvents(caseId, rec, { nowMs, first: !cur?.first, io });
  const letters = lettersFor({ ...E, seen: new Set((cur?.mail || []).map(m => m.id)) });
  const { data } = await updateInbox(caseId, (inbox) => {
    const r = deliver(inbox || newInbox(), date, inbox?.first ? letters.filter(m => m.kind !== "welcome") : letters, nowMs);
    return r.inbox === inbox ? { out: null } : { data: r.inbox, out: r.added };
  });
  return data || cur;
}

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  const noStore = { "Cache-Control": "no-store" };
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "GET or POST. The mail room keeps short hours." });
  if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
  let body = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { return json(400, { error: "Your request is not legible." }); }
    if (!OPS.includes(body?.op)) return json(400, { error: "The mail room reads, files and shreds. It does not send. There is no such counter." });
  }
  const url = new URL(req.url);
  const caseId = String((req.method === "GET" ? url.searchParams.get("caseId") : body?.caseId) || "").trim().toUpperCase();
  if (!isCaseId(caseId)) return json(400, { error: "That is not a case number." });
  try {
    try {
      if (!(await hitLimit(`mail-ip:${clientIp(req, context)}`, MAIL_IP_PER_HOUR, "hour")).ok) return json(429, { error: "The mail room has seen enough of your location for one hour." }, { "Retry-After": "3600" });
      if (!(await hitLimit(`mail-case:${caseId}`, MAIL_CASE_PER_MINUTE, "minute")).ok) return json(429, { error: "One letter at a time. The mail room is not a slot machine." }, { "Retry-After": "60" });
    } catch {
      return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" });
    }
    // the inbox is private (holdings, the flat): a file secured to an email answers only to its session
    const auth = await requireCaseAuth(req, caseId, { write: req.method === "POST" });
    if (!auth.ok) return json(auth.status, caseAuthBody(auth), noStore);
    const rec = await getCase(caseId);
    if (!rec) return json(404, { error: NO_SUCH_FILE });
    const now = Date.now();
    if (req.method === "GET") {
      const inbox = await deliverToday(caseId, rec, now);
      if (url.searchParams.get("count") === "1") return json(200, { unread: unreadIn(inbox) }, noStore);
      return json(200, viewOf(inbox), noStore);
    }
    const id = typeof body.id === "string" ? body.id.slice(0, 120) : "";
    let fail = null;
    const { data } = await updateInbox(caseId, (inbox) => {
      if (!inbox) { fail = "NO POST ON FILE YET. OPEN THE MAIL ROOM FIRST."; return { out: null }; }
      const r = applyOp(inbox, body.op, id, now);
      if (r.error) { fail = r.error; return { out: null }; }
      return r.changed ? { data: tidy(r.inbox, now), out: true } : { out: false };
    });
    if (fail) return json(404, { error: fail });
    return json(200, viewOf(data), noStore);
  } catch (err) {
    console.error("mail failed", err?.name, err?.message);
    if (err instanceof Busy) return json(503, { error: "The mail room is sorting. Try again in a moment." }, { "Retry-After": "2" });
    return json(500, { error: "The mail room is closed. The post will keep. It always does." });
  }
};

export const config = { path: "/api/mail" };
