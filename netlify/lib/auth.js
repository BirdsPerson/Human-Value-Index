// Email magic-link identity. Ported from applyops-u/backend/auth.py to Blobs.
// Tokens and session ids are stored only as SHA-256 hashes; the email lives only in
// the private hvi-accounts store and never reaches a log or the client bundle.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";

export const TOKEN_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const COOKIE = "hvi_sid";
export const FROM_DEFAULT = "The Department <file@mail.humanvalueindex.com>";
export const RESEND_DOMAIN_ID = "69b9e1d0-1318-4187-8ddd-b2a4795c05ea";
const OWNER_CASE = "HVI-KKN67AUZ";

const auth = () => getStore({ name: "hvi-auth", consistency: "strong" });
const accounts = () => getStore({ name: "hvi-accounts", consistency: "strong" });

export const sha256 = s => createHash("sha256").update(String(s)).digest("hex");
export const newSecret = () => randomBytes(32).toString("base64url");
export const normEmail = e => String(e || "").trim().toLowerCase();
export const EMAIL_RE = /^[^\s@<>()",;]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/;
export const emailValid = e => { const n = normEmail(e); return n.length <= 254 && EMAIL_RE.test(n); };
export const accountKey = email => sha256("acct:" + normEmail(email));

export function maskEmail(email) {
  const [u = "", d = ""] = String(email).split("@");
  const [host = "", ...tld] = d.split(".");
  return `${u.slice(0, 1)}***@${host.slice(0, 1)}***.${tld.join(".") || "?"}`;
}

const sameHex = (a, b) => {
  const x = Buffer.from(String(a), "utf8"), y = Buffer.from(String(b), "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
};

// ---- magic-link tokens ----------------------------------------------------------
export async function issueToken(email, now = Date.now()) {
  const token = newSecret();
  const hash = sha256(token);
  await auth().setJSON(`tok:${hash}`, { hash, email: normEmail(email), exp: now + TOKEN_TTL_MS, used: false });
  return token;
}

// Single use: the first caller flips `used` with an etag-conditional write; a concurrent
// second caller loses the race and gets null.
export async function consumeToken(token, now = Date.now()) {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const hash = sha256(token);
  const store = auth();
  const cur = await store.getWithMetadata(`tok:${hash}`, { type: "json" });
  const rec = cur?.data;
  if (!rec || rec.used || !(rec.exp > now) || !sameHex(rec.hash, hash)) return null;
  const res = await store.setJSON(`tok:${hash}`, { ...rec, used: true, usedAt: now }, { onlyIfMatch: cur.etag });
  return res.modified ? rec.email : null;
}

// ---- accounts ---------------------------------------------------------------------
export async function upsertAccount(email, now = Date.now()) {
  const key = accountKey(email);
  const store = accounts();
  await store.setJSON(key, { email: normEmail(email), cases: [], created: new Date(now).toISOString() }, { onlyIfNew: true });
  return { key, account: await store.get(key, { type: "json" }) };
}

export const getAccount = async key => (key ? (await accounts().get(key, { type: "json" })) || null : null);

const ownerCases = () => new Set([OWNER_CASE, ...String(process.env.HVI_OWNER_CASES || "").split(",").map(s => s.trim()).filter(Boolean)]);
export const isOwnerAccount = account => Boolean(account?.owner || account?.cases?.some(c => ownerCases().has(c)));

// A case belongs to at most one account: a `case:<id>` marker is written onlyIfNew.
// Returns "claimed" | "already-yours" | "taken".
export async function claimCase(key, caseId) {
  const store = accounts();
  const marker = await store.setJSON(`case:${caseId}`, { acct: key, at: new Date().toISOString() }, { onlyIfNew: true });
  if (!marker.modified) {
    const owner = await store.get(`case:${caseId}`, { type: "json" });
    if (owner?.acct !== key) return "taken";
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await store.getWithMetadata(key, { type: "json" });
    if (!cur?.data) throw new Error("claimCase: account missing");
    const acct = cur.data;
    if (acct.cases.includes(caseId)) return marker.modified ? "claimed" : "already-yours";
    const next = { ...acct, cases: [...acct.cases, caseId], ...(ownerCases().has(caseId) ? { owner: true } : {}) };
    const res = await store.setJSON(key, next, { onlyIfMatch: cur.etag });
    if (res.modified) return "claimed";
  }
  throw new Error("claimCase: lost the write race five times");
}

// ---- sessions ----------------------------------------------------------------------
export async function createSession(key, now = Date.now()) {
  const sid = newSecret();
  await auth().setJSON(`sess:${sha256(sid)}`, { acct: key, exp: now + SESSION_TTL_MS, created: new Date(now).toISOString() });
  return sid;
}

export function readCookie(req, name = COOKIE) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export const sessionCookie = sid => `${COOKIE}=${sid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`;
export const clearCookie = () => `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

// The account behind this request's cookie, or null. For later features (economy,
// vouches) that must be tied to a real person rather than a free case number.
export async function requireAccount(req, now = Date.now()) {
  const sid = readCookie(req);
  if (!sid || sid.length > 100) return null;
  const rec = await auth().get(`sess:${sha256(sid)}`, { type: "json" });
  if (!rec || !(rec.exp > now)) return null;
  const account = await getAccount(rec.acct);
  return account ? { key: rec.acct, account } : null;
}

export async function revokeSession(req) {
  const sid = readCookie(req);
  if (sid && sid.length <= 100) await auth().delete(`sess:${sha256(sid)}`);
}

// ---- mail --------------------------------------------------------------------------
export const MAIL_ROOM_CLOSED = "The Department's mail room is not yet open. Your link cannot be dispatched. Retain your case number; it still works.";

export function linkEmail(url) {
  return {
    subject: "Your access link // Department of Human Assessment",
    text: `Subject,\n\nYour access link. It expires in fifteen minutes. So, statistically, will your motivation.\n\n${url}\n\nIt works once. If you did not request it, someone else is interested in your file. The Department is not.\n\n— The Department of Human Assessment`,
  };
}

// Returns { ok } or { notVerified }. Only the HTTP status is ever logged: Resend error
// bodies can echo the recipient.
export async function sendLink(email, url) {
  if (process.env.HVI_AUTH_STUB === "1") {
    console.log(`[auth stub] magic link: ${url}`);
    return { ok: true, stub: true };
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, reason: "no-key" };
  const { subject, text } = linkEmail(url);
  let res;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      // A non-default UA: Cloudflare fronts api.resend.com and rejects some library UAs (applyops-u lesson).
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "User-Agent": "human-value-index/1.0" },
      body: JSON.stringify({ from: process.env.RESEND_FROM || FROM_DEFAULT, to: [normEmail(email)], subject, text }),
    });
  } catch (err) {
    console.error("[auth] resend unreachable", err?.name || "error");
    return { ok: false, reason: "network" };
  }
  if (res.ok) return { ok: true };
  const body = await res.text().catch(() => "");
  console.error("[auth] resend status", res.status);
  if ((res.status === 403 || res.status === 422) && /not verified/i.test(body)) return { ok: false, notVerified: true };
  return { ok: false, reason: `http_${res.status}` };
}

// Nudges Resend to re-check the DNS records, at most once an hour.
export async function maybeVerifyDomain(now = Date.now()) {
  const store = auth();
  const last = await store.get("verify-at", { type: "json" }).catch(() => null);
  if (last?.at && now - last.at < 60 * 60 * 1000) return false;
  await store.setJSON("verify-at", { at: now });
  const key = process.env.RESEND_API_KEY;
  if (!key || process.env.HVI_AUTH_STUB === "1") return false;
  try {
    const res = await fetch(`https://api.resend.com/domains/${RESEND_DOMAIN_ID}/verify`, {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "User-Agent": "human-value-index/1.0" },
    });
    console.log("[auth] resend verify requested", res.status);
  } catch { /* next hour */ }
  return true;
}
