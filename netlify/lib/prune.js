// Retention, as the privacy notice states it (docs/legal/privacy.md "How long it is kept"):
//   case files        24 months after the subject's last activity (visit, appeal, directive)
//   dispute requests  24 months after filing
//   rate-limit counters 7 days after their window closes; legacy raw-IP keys at once
//   sign-in links / sessions  once expired
// Run daily by netlify/functions/prune.js. Scheduled functions stop at 30 s, so every phase
// checks one deadline; case files (one GET each) are read in a bounded batch that resumes
// from a cursor kept in hvi-maint. dryRun reads everything and writes nothing.
import { getStore } from "@netlify/blobs";
import { isCaseId } from "./intake.js";
import { deleteCase, removePenCard } from "./store.js";
import { deleteWallet } from "./casino-store.js";
import { caseOwner, detachCase } from "./auth.js";
import { YOUR_CAUSES, causeOf } from "../../src/movement.js";

export const CASE_MONTHS = 24;
export const REQUEST_MONTHS = 24;
export const LIMIT_DAYS = 7;
export const BUDGET_MS = 20_000;
export const CASE_BATCH = 300;
const PARALLEL = 8;
const DAY = 86_400_000;
const OWNER_CASE = "HVI-KKN67AUZ";

const monthsBefore = (now, n) => { const d = new Date(now); d.setUTCMonth(d.getUTCMonth() - n); return d.getTime(); };
const ms = s => (typeof s === "string" ? Date.parse(s) : typeof s === "number" ? s : NaN);

// The subject's own last activity on a file, in ms, or null when the file carries no date
// at all (never expired on a guess). Department recalibrations and reviews do not count:
// a method change is not the subject coming back.
export function lastActivity(rec) {
  const stamps = [rec?.created, rec?.pending?.at, rec?.quests?.active?.at];
  for (const h of rec?.history || []) if (h && YOUR_CAUSES.includes(causeOf(h))) stamps.push(h.at);
  for (const q of rec?.quests?.done || []) stamps.push(q?.at);
  for (const v of rec?.vouches || []) stamps.push(v?.at);
  const t = stamps.map(ms).filter(Number.isFinite);
  return t.length ? Math.max(...t) : null;
}

// hvi-limits keys are "<bucket>:<name>", bucket = YYYY-MM | YYYY-MM-DD | YYYY-MM-DDTHH | YYYY-MM-DDTHH:MM (UTC).
// Returns when that window closed, in ms, or null for a key this code does not recognise.
export function bucketEnd(key) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2})(?:T(\d{2})(?::(\d{2}))?)?)?:/.exec(key);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  if (!m[3]) return Date.UTC(y, mo, 1);                  // month: first of the next month
  if (m[4] === undefined) return Date.UTC(y, mo - 1, d + 1);
  if (m[5] === undefined) return Date.UTC(y, mo - 1, d, h + 1);
  return Date.UTC(y, mo - 1, d, h, mi + 1);
}

// Per-IP counters written before IP hashing hold the address itself ("…-ip:203.0.113.9").
// Hashed ones hold 16 hex characters (netlify/lib/http.js ipHash).
export function isRawIpKey(key) {
  const m = /^[^:]*(?::\d{2})?:[a-z-]+-ip(?:-day)?:(.+)$/.exec(key);
  return Boolean(m) && !/^[0-9a-f]{16}$/.test(m[1]);
}

// req-YYYY-MM-DD-<hex>[:mailed] -> ms of that day, or null.
export const requestDate = key => { const m = /^req-(\d{4}-\d{2}-\d{2})-/.exec(key); return m ? Date.parse(m[1] + "T00:00:00Z") : null; };

const isOwnerCase = id => id === OWNER_CASE || String(process.env.HVI_OWNER_CASES || "").split(",").map(s => s.trim()).includes(id);

export async function prune({ now = Date.now(), dryRun = false, budgetMs = BUDGET_MS, batch = CASE_BATCH, open = name => getStore({ name, consistency: "strong" }) } = {}) {
  const deadline = Date.now() + budgetMs;
  const late = () => Date.now() > deadline;
  const report = { dryRun, errors: 0, at: new Date(now).toISOString(), done: true, cases: { read: 0, expired: 0, undated: 0, kept: 0, cursor: null, wrapped: false }, limits: { stale: 0, rawIp: 0, unknown: 0, kept: 0 }, requests: { expired: 0, kept: 0 }, auth: { tokens: 0, sessions: 0 } };
  const del = async (store, key) => { if (!dryRun) await store.delete(key); };
  // Runs fn over items PARALLEL at a time; stops starting new work at the deadline.
  async function each(items, fn) {
    for (let i = 0; i < items.length; i += PARALLEL) {
      if (late()) { report.done = false; return i; }
      await Promise.all(items.slice(i, i + PARALLEL).map(x => Promise.resolve(fn(x)).catch(err => { report.errors++; console.error("prune failed", err?.name); })));
    }
    return items.length;
  }
  async function keys(store, prefix) {
    const out = [];
    for await (const page of store.list({ paginate: true, ...(prefix ? { prefix } : {}) })) {
      out.push(...page.blobs.map(b => b.key));
      if (late()) { report.done = false; break; }
    }
    return out;
  }

  // 1. Sign-in links and sessions past their expiry (records carry exp in ms).
  const auth = open("hvi-auth");
  for (const [prefix, field] of [["tok:", "tokens"], ["sess:", "sessions"]]) {
    await each(await keys(auth, prefix), async k => {
      const rec = await auth.get(k, { type: "json" }).catch(() => null);
      if (rec && Number.isFinite(rec.exp) && rec.exp < now) { await del(auth, k); report.auth[field]++; }
    });
  }

  // 2. Dispute requests older than 24 months (date is in the key; undated keys are kept).
  const reqs = open("hvi-requests");
  const reqCut = monthsBefore(now, REQUEST_MONTHS);
  await each(await keys(reqs), async k => {
    const t = requestDate(k);
    if (t !== null && t < reqCut) { await del(reqs, k); report.requests.expired++; } else report.requests.kept++;
  });

  // 3. Case files, a bounded batch from the cursor. Keys are sorted here, not trusted to arrive sorted.
  const cases = open("hvi-cases");
  const maint = open("hvi-maint");
  const caseCut = monthsBefore(now, CASE_MONTHS);
  const after = (await maint.get("prune-cursor", { type: "json" }).catch(() => null))?.after || "";
  const all = (await keys(cases)).filter(isCaseId).sort();
  let todo = all.filter(k => k > after).slice(0, batch);
  if (!todo.length && after) { report.cases.wrapped = true; todo = all.slice(0, batch); }
  let last = null;
  for (let i = 0; i < todo.length; i += PARALLEL) {
    if (late()) { report.done = false; break; }
    const chunk = todo.slice(i, i + PARALLEL);
    await Promise.all(chunk.map(async id => { try {
      const rec = await cases.get(id, { type: "json" });
      report.cases.read++;
      const t = rec ? lastActivity(rec) : null;
      if (!rec || t === null) { report.cases.undated++; return; }
      if (t >= caseCut || isOwnerCase(id)) { report.cases.kept++; return; }
      report.cases.expired++;
      if (dryRun) return;
      // The case blob goes last: if anything before it fails, the next pass finds the file again.
      await removePenCard(id);
      const owner = await caseOwner(id);
      if (owner) await detachCase(owner, id);
      await deleteWallet(id);   // the casino's chips go with the file
      await deleteCase(id);
    } catch (err) { report.errors++; console.error("prune case failed", err?.name); } }));
    last = chunk[chunk.length - 1];
  }
  // Cursor: the last key fully handled; past the final key, start over next run.
  const next = last && last !== all[all.length - 1] ? last : null;
  report.cases.cursor = next;
  if (!dryRun && last) await maint.setJSON("prune-cursor", { after: next, at: report.at });

  // 4. Rate-limit counters: windows closed more than 7 days ago, and every raw-IP key.
  const limits = open("hvi-limits");
  const limCut = now - LIMIT_DAYS * DAY;
  const limitKeys = await keys(limits);
  const drop = [];
  for (const k of limitKeys) {
    const end = bucketEnd(k);
    if (isRawIpKey(k)) { drop.push(k); report.limits.rawIp++; }
    else if (end === null) report.limits.unknown++;
    else if (end < limCut) { drop.push(k); report.limits.stale++; }
    else report.limits.kept++;
  }
  await each(drop, k => del(limits, k));

  return report;
}
