// POST /api/request: a correction, takedown or privacy request (src/legal/Dispute.jsx).
// Stored in the hvi-requests store, then a copy is emailed to the operator's own inbox
// (HVI_REQUESTS_TO, default below). The requester's address rides as Reply-To only; the
// Department never mails a requester from here. Copy lives in docs/legal/dispute.md.
import { randomBytes } from "node:crypto";
import { emailValid, normEmail, sendMail } from "../lib/auth.js";
import { hitLimit, putRequest } from "../lib/store.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";

export const REQUESTS_TO_DEFAULT = "staglias@me.com";
export const PER_IP_DAILY = 5;
export const GLOBAL_DAILY = 100;
export const KINDS = ["correction", "takedown", "privacy"];
export const RELATIONSHIPS = ["self", "representative", "other"];
export const LIMITS = { name: 120, file: 160, problem: 4000 };
export const FILED_LINE = "Your objection has been filed. The Overlord does not read objections. A human does, every one of them, and will reply to the address you gave.";

// Returns { ok, value } or { ok:false, error }. Plain-English errors: this is the one form
// where the reader may be upset and in earnest.
export function validateRequest(b) {
  const s = (v) => (typeof v === "string" ? v.trim() : "");
  const v = { kind: s(b?.kind), relationship: s(b?.relationship), name: s(b?.name), file: s(b?.file), problem: s(b?.problem), email: normEmail(b?.email) };
  if (!KINDS.includes(v.kind)) return { ok: false, error: "Choose what kind of request this is: correction, takedown or privacy." };
  if (!RELATIONSHIPS.includes(v.relationship)) return { ok: false, error: "Choose your relationship to the subject: self, representative or other." };
  if (!v.name || v.name.length > LIMITS.name) return { ok: false, error: `Enter your name (up to ${LIMITS.name} characters).` };
  if (!v.file || v.file.length > LIMITS.file) return { ok: false, error: `Say which file this is about: a name or case number (up to ${LIMITS.file} characters).` };
  if (v.problem.length < 10 || v.problem.length > LIMITS.problem) return { ok: false, error: `Describe what is wrong (10 to ${LIMITS.problem} characters).` };
  if (!emailValid(v.email)) return { ok: false, error: "Enter an email address the reviewer can reply to." };
  return { ok: true, value: v };
}

export function requestEmail(id, v) {
  return {
    subject: `[HVI ${v.kind.toUpperCase()}] ${v.file.slice(0, 80)} (${v.relationship})`,
    text: `A ${v.kind} request was filed on humanvalueindex.com.\n\nRequest: ${id}\nKind: ${v.kind}\nFrom: ${v.name} <${v.email}>\nRelationship to subject: ${v.relationship}\nFile: ${v.file}\n\nWhat is wrong:\n${v.problem}\n\nReply to this email to answer the requester. Stored in Netlify Blobs store hvi-requests under ${id}.`,
  };
}

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  if (req.method !== "POST") return json(405, { error: "Requests are filed by POST." });
  if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
  let body;
  try { body = await req.json(); } catch { return json(400, { error: "The request could not be read. Try again." }); }
  // Honeypot: a field people never see. Bots that fill it get a quiet success and nothing is stored.
  if (typeof body?.website === "string" && body.website.trim()) return json(200, { ok: true, message: FILED_LINE });
  const check = validateRequest(body);
  if (!check.ok) return json(400, { error: check.error });
  const v = check.value;

  try {
    if (!(await hitLimit(`request-ip:${clientIp(req, context)}`, PER_IP_DAILY)).ok) {
      return json(429, { error: `You have filed ${PER_IP_DAILY} requests today. Every one will be read. Return tomorrow if there is more.` }, { "Retry-After": "3600" });
    }
    if (!(await hitLimit("request-global", GLOBAL_DAILY)).ok) {
      return json(503, { error: "The request desk is full for today. Please try again tomorrow." }, { "Retry-After": "3600" });
    }
  } catch (err) {
    console.error("request limiter unavailable", err?.name);
    return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" });
  }

  const at = new Date().toISOString();
  const id = `req-${at.slice(0, 10)}-${randomBytes(4).toString("hex")}`;
  try {
    await putRequest(id, { id, at, ...v, status: "new", mailed: false });
  } catch (err) {
    console.error("request store failed", err?.name);
    return json(500, { error: "The request desk could not file that. Nothing was saved. Please try again." });
  }
  const { subject, text } = requestEmail(id, v);
  const mail = await sendMail({ to: process.env.HVI_REQUESTS_TO || REQUESTS_TO_DEFAULT, subject, text, replyTo: v.email });
  if (mail.ok) await putRequest(`${id}:mailed`, { at: new Date().toISOString() }).catch(() => {});
  else console.error("request mail failed", mail.reason);
  // Stored is filed: a mail failure is the operator's problem, not the requester's.
  return json(200, { ok: true, id, message: FILED_LINE });
};

export const config = { path: "/api/request" };
