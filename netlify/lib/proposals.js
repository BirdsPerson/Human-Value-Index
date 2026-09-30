// CITIZEN PROPOSALS (docs/PROPOSALS.md): players file proposals to the Overlord, other players
// co-sign, the owner approves one for the floor, and it runs as an Assembly session.
//
// Store hvi-proposals:
//   docket                 {seq, sseq, rows: {id: row}, sessions: [session]}   CAS on the etag
//     row                  {id, no, type, target, title, desc, tag, fk, at, status, cs: [key],
//                           decision: {at, reason?, into?, sid?}, from?: [id]}
//                           status: open | approved | declined | merged (expired is derived:
//                           open and older than 7 days)
//     session              {sid, pid, openAt, closeAt, approvedAt, done?, carried?, votes?}
//   f/<day>/<fk>           the case's one filing that day            onlyIfNew
//   c/<pid>/<key>          one co-signature per case per proposal     onlyIfNew (the truth;
//                          row.cs is the fold, healed from these)
//   cip/<pid>/<ip>, cdev/<pid>/<dev>   {keys}: co-signing cases per address / device (capped)
//   s/<sid>/v/<vk>         a ballot {s, r, rev, at, ip, dev}          onlyIfNew, then CAS
//   s/<sid>/ip/<h>, s/<sid>/dev/<h>    {keys}: voting cases per address / device (capped)
//   s/<sid>/tally          {seen: {vk: [rev, sideIdx, reasonMask]}}  fold, idempotent per revision
//   s/<sid>/result         {sid, pid, carried, votes, reasons, voters, closedAt, decidedAt}  onlyIfNew
//   acts                   {acts: [act]}   what carried motions did (read by the city: src/city/acts.js)
//
// A case number is a credential: the store holds only salted hashes of it (fk, key, vk) and a
// four-character tag from another hash for "FILED BY SUBJECT <tag>". Every function takes io
// (or the store), so scripts/check-proposals.mjs runs it against an in-memory store.

import { createHash } from "node:crypto";
import {
  LIMITS, EXPIRE_MS, SESSION_MS, SIDES, REASONS, MAX_REASONS, TYPES, DECLINE_PRESETS,
  prefilter, targetOf, clean, styleFor, proposalNo, sessionNo, commentary, minute, EFFECT,
} from "../../src/assembly/proposalRules.js";

export const STORE = "hvi-proposals";
export const KEYS = {
  docket: "docket", acts: "acts",
  filed: (day, fk) => `f/${day}/${fk}`,
  cosign: (pid, k) => `c/${pid}/${k}`, cosigns: (pid) => `c/${pid}/`,
  cip: (pid, h) => `cip/${pid}/${h}`, cdev: (pid, h) => `cdev/${pid}/${h}`,
  voter: (sid, vk) => `s/${sid}/v/${vk}`, voters: (sid) => `s/${sid}/v/`,
  ip: (sid, h) => `s/${sid}/ip/${h}`, dev: (sid, h) => `s/${sid}/dev/${h}`,
  tally: (sid) => `s/${sid}/tally`, result: (sid) => `s/${sid}/result`,
};

const salt = () => process.env.HVI_IP_SALT || "hvi-limits-v1";
const sha = (s) => createHash("sha256").update(s).digest("hex");
export const caseKey = (caseId) => sha(`${salt()}:proposals:${caseId}`).slice(0, 16);
export const caseTag = (caseId) => sha(`${salt()}:proposal-tag:${caseId}`).slice(0, 4).toUpperCase();
export const voterKey = (caseId) => sha(`${salt()}:proposal-ballot:${caseId}`).slice(0, 16);
export const deviceHash = (dev) => (typeof dev === "string" && /^[a-f0-9]{16,64}$/.test(dev) ? sha(`${salt()}:device:${dev}`).slice(0, 16) : null);
const dayOf = (now) => new Date(now).toISOString().slice(0, 10);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export const reasonMask = (r) => r.reduce((m, x) => m | (1 << REASONS.indexOf(x)), 0);
export const reasonsOf = (mask) => REASONS.filter((_, i) => mask & (1 << i));

export const isExpired = (row, now) => row.status === "open" && now - row.at > EXPIRE_MS;
export const statusOf = (row, now) => (isExpired(row, now) ? "expired" : row.status);

// ---- the docket blob -------------------------------------------------------------------------
const emptyDocket = () => ({ seq: 0, sseq: 0, rows: {}, sessions: [] });
export async function readDocket(store) {
  return (await store.get(KEYS.docket, { type: "json" })) || emptyDocket();
}
// Read-modify-write under the etag. fn(docket) mutates and returns a value, or throws a
// {status, body} object to refuse. -> fn's value.
export async function editDocket(store, fn, tries = 12) {
  for (let i = 0; i < tries; i++) {
    const cur = await store.getWithMetadata(KEYS.docket, { type: "json" });
    const d = cur?.data ? structuredClone(cur.data) : emptyDocket();
    const out = fn(d);
    if (out === undefined) return undefined;
    const res = await store.setJSON(KEYS.docket, d, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return out;
    await sleep(3 + Math.random() * 15 * (i + 1));
  }
  throw new Error("proposals docket: lost the write race");
}
class Refusal { constructor(status, error, extra = {}) { this.r = { status, body: { error, ...extra } }; } }
const refuse = (status, error, extra) => { throw new Refusal(status, error, extra); };
const guard = async (fn) => { try { return await fn(); } catch (e) { if (e instanceof Refusal) return e.r; throw e; } };

async function assessed(io, caseId) {
  const rec = await io.getCase(caseId);
  if (!rec) refuse(404, "NO SUCH FILE. THE DEPARTMENT DOES NOT LOSE FILES. YOU HAVE MISTYPED.");
  if (!Array.isArray(rec.history) || !rec.history.length) refuse(403, "ONLY ASSESSED SUBJECTS MAY PETITION THE OVERLORD. BE ASSESSED FIRST; THEN YOU MAY HAVE IDEAS.");
  return rec;
}
async function limit(io, key, max, window) {
  let r;
  try { r = await io.hitLimit(key, max, window); } catch { refuse(503, "THE DEPARTMENT'S QUEUE LEDGER IS UNAVAILABLE. NOTHING IS FILED OFF THE BOOKS. TRY AGAIN SHORTLY."); }
  return r.ok;
}
// Add k to a capped registry (cases per address, per device). -> true if it is (now) there.
async function claim(store, key, k, cap) {
  for (let i = 0; i < 8; i++) {
    const cur = await store.getWithMetadata(key, { type: "json" });
    const keys = cur?.data?.keys || [];
    if (keys.includes(k)) return true;
    if (keys.length >= cap) return false;
    const res = await store.setJSON(key, { keys: [...keys, k] }, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return true;
    await sleep(3 + Math.random() * 10);
  }
  return false;
}

// ---- FILE ---------------------------------------------------------------------------------------
// io: {store, getCase, hitLimit, moderate(p) -> {ok} | {ok:false, category, line} | {unavailable}}
export async function fileProposal(io, { caseId, body, ip, now = Date.now() }) {
  return guard(async () => {
    const pf = prefilter(body);
    if (!pf.ok) refuse(400, pf.error, { field: pf.field });
    await assessed(io, caseId);
    const fk = caseKey(caseId), day = dayOf(now);
    if (await io.store.get(KEYS.filed(day, fk), { type: "json" })) refuse(429, "YOUR FILE HAS ALREADY PETITIONED THE OVERLORD TODAY. ONE IDEA PER DAY. THE DEPARTMENT RATIONS THEM.", { retry: 3600 });
    if (!(await limit(io, `proposal-try-case:${fk}`, LIMITS.triesPerCaseDay, "day"))) refuse(429, "THE CENSOR HAS READ ENOUGH FROM THIS FILE TODAY. RETURN TOMORROW WITH BETTER IDEAS, OR FEWER.", { retry: 3600 });
    if (!(await limit(io, `proposal-try-ip:${ip}`, LIMITS.triesPerIpDay, "day"))) refuse(429, "TOO MANY PROPOSALS FROM YOUR LOCATION TODAY. THE DEPARTMENT COUNTS PEOPLE, NOT PAPERWORK.", { retry: 3600 });
    const p = pf.value, t = targetOf(p.target);
    const m = await io.moderate({ ...p, targetName: t.name });
    if (m?.unavailable) {
      // no screen ran: the tries it took are given back (best effort)
      await Promise.all([`proposal-try-case:${fk}`, `proposal-try-ip:${ip}`].map(k => io.refundLimit?.(k, "day")?.catch?.(() => {})));
      refuse(503, m.unavailable, { retry: 60 });
    }
    if (!m?.ok) refuse(422, m?.line || "REFUSED.", { category: m?.category || "other", screened: true });
    if (!(await limit(io, `proposal-file-ip:${ip}`, LIMITS.filingsPerIpDay, "day"))) refuse(429, "YOUR LOCATION HAS FILED ENOUGH FOR ONE DAY. THE OVERLORD HAS A READING LIMIT. IT SET IT.", { retry: 3600 });
    const mark = await io.store.setJSON(KEYS.filed(day, fk), { at: now }, { onlyIfNew: true });
    if (!mark.modified) refuse(429, "YOUR FILE HAS ALREADY PETITIONED THE OVERLORD TODAY. ONE IDEA PER DAY. THE DEPARTMENT RATIONS THEM.", { retry: 3600 });
    const row = await editDocket(io.store, (d) => {
      d.seq += 1;
      const id = `p${String(d.seq).padStart(5, "0")}`;
      const r = { id, no: proposalNo(d.seq), ...p, tag: caseTag(caseId), fk, at: now, status: "open", cs: [], decision: null };
      d.rows[id] = r;
      return r;
    });
    return { status: 201, body: { proposal: publicRow(row, now) } };
  });
}

// ---- CO-SIGN --------------------------------------------------------------------------------------
export async function cosign(io, { caseId, pid, ip, device, now = Date.now() }) {
  return guard(async () => {
    const d = await readDocket(io.store);
    const row = d.rows[pid];
    if (!row) refuse(404, "NO SUCH PROPOSAL. THE DOCKET IS COMPLETE WITHOUT IT.");
    if (statusOf(row, now) !== "open") refuse(409, "THAT PROPOSAL IS NO LONGER OPEN FOR SIGNATURES. HISTORY HAS MOVED ON. SO SHOULD YOU.");
    await assessed(io, caseId);
    const k = caseKey(caseId);
    if (k === row.fk) refuse(403, "YOU FILED IT. SIGNING YOUR OWN PETITION IS NOT SUPPORT. IT IS PUNCTUATION.");
    if (!(await limit(io, `proposal-cosign-ip:${ip}`, LIMITS.cosignsPerIpHour, "hour"))) refuse(429, "TOO MANY SIGNATURES FROM YOUR LOCATION THIS HOUR. ENTHUSIASM IS RATE-LIMITED.", { retry: 3600 });
    if (await io.store.get(KEYS.cosign(pid, k), { type: "json" })) return { status: 200, body: { cosigns: new Set([...row.cs, k]).size, unchanged: true } };
    if (!(await claim(io.store, KEYS.cip(pid, ip), k, LIMITS.cosignersPerIpPerProposal))) refuse(429, `${LIMITS.cosignersPerIpPerProposal} FILES HAVE ALREADY SIGNED THIS FROM YOUR LOCATION. THE DEPARTMENT COUNTS PEOPLE, NOT PAPERWORK.`);
    const dh = deviceHash(device);
    if (dh && !(await claim(io.store, KEYS.cdev(pid, dh), k, LIMITS.cosignersPerDevicePerProposal))) refuse(429, `${LIMITS.cosignersPerDevicePerProposal} FILES HAVE ALREADY SIGNED THIS FROM THIS DEVICE. ONE TERMINAL IS NOT A MOVEMENT.`);
    const mark = await io.store.setJSON(KEYS.cosign(pid, k), { at: now }, { onlyIfNew: true });
    const n = await editDocket(io.store, (dd) => {
      const r = dd.rows[pid];
      if (!r || r.cs.includes(k)) return r ? r.cs.length : 0;
      r.cs.push(k);
      return r.cs.length;
    }).catch(() => null);   // the marker is the truth; healCosigns folds it in later
    return { status: 200, body: { cosigns: n ?? row.cs.length + 1, unchanged: !mark.modified } };
  });
}
// Fold every co-signature marker into its row (a fold that lost its race is healed here).
export async function healCosigns(store, pids) {
  const found = {};
  for (const pid of pids) {
    const keys = [];
    let cursor;
    do {
      const page = await store.list({ prefix: KEYS.cosigns(pid), ...(cursor ? { cursor } : {}) });
      keys.push(...page.blobs.map(b => b.key.slice(KEYS.cosigns(pid).length)));
      cursor = page.cursor;
    } while (cursor);
    found[pid] = keys;
  }
  const missing = (d) => Object.entries(found).some(([pid, ks]) => d.rows[pid] && ks.some(k => !d.rows[pid].cs.includes(k)));
  if (!missing(await readDocket(store))) return 0;
  return editDocket(store, (d) => {
    let added = 0;
    for (const [pid, ks] of Object.entries(found)) {
      const r = d.rows[pid];
      if (!r || r.status !== "open") continue;
      for (const k of ks) if (k !== r.fk && !r.cs.includes(k)) { r.cs.push(k); added++; }
    }
    return added ? added : undefined;
  }).then(x => x || 0);
}

// ---- THE OWNER'S REVIEW ------------------------------------------------------------------------------
// When an approved proposal's session opens: after the Assembly's current session and after every
// proposal session already queued (one open session at a time).
export function nextSlot(d, now, asmCloseAt = null) {
  const lastClose = Math.max(0, ...d.sessions.map(s => s.closeAt));
  return Math.max(now, asmCloseAt && asmCloseAt > now ? asmCloseAt : 0, lastClose);
}
// op: {action: "approve" | "decline" | "merge", pid, reason?, into?}. io.asmCloseAt(): the
// Assembly's own session close (ms) or null. Owner-only: the caller has checked.
export async function review(io, { action, pid, reason, into, now = Date.now() }) {
  return guard(async () => {
    const asmCloseAt = action === "approve" && io.asmCloseAt ? await io.asmCloseAt().catch(() => null) : null;
    let why = null;
    if (action === "decline") {
      why = clean(reason);
      if (!why) why = DECLINE_PRESETS[0];
      if (why.length > LIMITS.declineReason) refuse(400, `A REASON OF ${LIMITS.declineReason} CHARACTERS AT MOST. THE OVERLORD IS TERSE.`);
      why = why.toUpperCase();
    }
    const out = await editDocket(io.store, (d) => {
      const r = d.rows[pid];
      if (!r) refuse(404, "NO SUCH PROPOSAL.");
      const st = statusOf(r, now);
      if (action === "approve") {
        if (st !== "open") refuse(409, `THAT PROPOSAL IS ${st.toUpperCase()}. ONLY OPEN PROPOSALS GO TO THE FLOOR.`);
        const openAt = nextSlot(d, now, asmCloseAt);
        d.sseq = (d.sseq || 0) + 1;
        const s = { sid: sessionNo(d.sseq), pid, openAt, closeAt: openAt + SESSION_MS, approvedAt: now };
        d.sessions.push(s);
        r.status = "approved"; r.decision = { at: now, sid: s.sid };
        return { session: s };
      }
      if (action === "decline") {
        if (st !== "open" && st !== "expired") refuse(409, `THAT PROPOSAL IS ${st.toUpperCase()}. IT CANNOT BE DECLINED TWICE.`);
        r.status = "declined"; r.decision = { at: now, reason: why };
        return { declined: pid };
      }
      if (action === "merge") {
        const t = d.rows[into];
        if (!t || into === pid) refuse(400, "MERGE INTO ANOTHER OPEN PROPOSAL.");
        if (st !== "open" || statusOf(t, now) !== "open") refuse(409, "BOTH PROPOSALS MUST BE OPEN TO MERGE.");
        for (const k of [r.fk, ...r.cs]) if (k !== t.fk && !t.cs.includes(k)) t.cs.push(k);
        t.from = [...(t.from || []), pid];
        r.status = "merged"; r.decision = { at: now, into };
        return { merged: pid, into };
      }
      refuse(400, "APPROVE, DECLINE OR MERGE. THE OWNER HAS THREE BUTTONS.");
    });
    return { status: 200, body: out };
  });
}
// A decision about every open proposal at once (the desk's "Decline all this week").
export async function declineAll(store, reason, now = Date.now()) {
  const why = clean(reason || DECLINE_PRESETS[0]).toUpperCase().slice(0, LIMITS.declineReason);
  return editDocket(store, (d) => {
    let n = 0;
    for (const r of Object.values(d.rows)) if (r.status === "open") { r.status = "declined"; r.decision = { at: now, reason: why }; n++; }
    return n ? n : undefined;
  }).then(x => x || 0);
}

// ---- SESSIONS: the ballot ---------------------------------------------------------------------------
export const sessionState = (s, now) => (now < s.openAt ? "pending" : now < s.closeAt ? "open" : "closed");
export const currentSession = (d, now) => d.sessions.find(s => now >= s.openAt && now < s.closeAt) || null;
export const nextSession = (d, now) => d.sessions.filter(s => s.openAt > now).sort((a, b) => a.openAt - b.openAt)[0] || null;

export function parseBallot(body) {
  const side = String(body?.side || "").toLowerCase();
  if (!SIDES.includes(side)) return { error: "FOR OR AGAINST. THE ASSEMBLY DOES NOT ACCEPT ABSTENTIONS IN WRITING." };
  const raw = Array.isArray(body?.reasons) ? body.reasons.map(r => String(r).toUpperCase()) : [];
  const reasons = REASONS.filter(r => raw.includes(r));
  if (!reasons.length || reasons.length !== raw.length) return { error: `GIVE AT LEAST ONE REASON FROM THE LIST: ${REASONS.join(", ")}. THE DEPARTMENT DOES NOT READ FREE TEXT.` };
  if (reasons.length > MAX_REASONS) return { error: `AT MOST ${MAX_REASONS} REASONS. MORE WOULD BE AN OPINION.` };
  return { side, reasons };
}
const emptyTally = () => ({ seen: {}, at: null });
export function countsOf(seen) {
  const votes = { for: 0, against: 0 };
  const reasons = { for: Object.fromEntries(REASONS.map(r => [r, 0])), against: Object.fromEntries(REASONS.map(r => [r, 0])) };
  let voters = 0;
  for (const [, si, mask] of Object.values(seen || {})) {
    const s = SIDES[si];
    if (!s) continue;
    voters++; votes[s]++;
    for (const r of reasonsOf(mask)) reasons[s][r]++;
  }
  return { votes, reasons, voters };
}
async function fold(store, sid, ballots, tries = 10) {
  for (let i = 0; i < tries; i++) {
    const cur = await store.getWithMetadata(KEYS.tally(sid), { type: "json" });
    const t = cur?.data ? structuredClone(cur.data) : emptyTally();
    let changed = false;
    for (const [vk, b] of Object.entries(ballots)) {
      const have = t.seen[vk];
      if (have && have[0] >= b.rev) continue;
      t.seen[vk] = [b.rev, SIDES.indexOf(b.s), reasonMask(b.r)];
      changed = true;
    }
    if (!changed) return true;
    t.at = Date.now();
    const res = await store.setJSON(KEYS.tally(sid), t, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return true;
    await sleep(5 + Math.random() * 20 * (i + 1));
  }
  return false;
}
// Recount from the ballots (the truth).
export async function recount(store, sid) {
  const keys = [];
  let cursor;
  do {
    const page = await store.list({ prefix: KEYS.voters(sid), ...(cursor ? { cursor } : {}) });
    keys.push(...page.blobs.map(b => b.key));
    cursor = page.cursor;
  } while (cursor);
  const ballots = {};
  for (let i = 0; i < keys.length; i += 50) {
    const got = await Promise.all(keys.slice(i, i + 50).map(k => store.get(k, { type: "json" })));
    got.forEach((b, j) => { if (b && SIDES.includes(b.s)) ballots[keys[i + j].slice(KEYS.voters(sid).length)] = b; });
  }
  if (!(await fold(store, sid, ballots))) throw new Error("proposal recount: lost the tally race");
  const seen = {};
  for (const [vk, b] of Object.entries(ballots)) seen[vk] = [b.rev, SIDES.indexOf(b.s), reasonMask(b.r)];
  return countsOf(seen);
}

export async function castBallot(io, { caseId, side, reasons, ip, device, now = Date.now() }) {
  return guard(async () => {
    const { store } = io;
    const d = await readDocket(store);
    const s = currentSession(d, now);
    if (!s) refuse(403, "NO PROPOSAL IS BEFORE THE ASSEMBLY. THE FLOOR IS EMPTY. THE CHAIR IS NOT.", { closed: true });
    if (!(await limit(io, `proposal-ballot-ip:${ip}`, LIMITS.ballotsPerIpHour, "hour"))) refuse(429, "TOO MANY BALLOTS FROM YOUR LOCATION THIS HOUR. DEMOCRACY IS RATE-LIMITED. RETURN IN AN HOUR.", { retry: 3600 });
    await assessed(io, caseId);
    const vk = voterKey(caseId), dh = deviceHash(device), sid = s.sid;
    for (let attempt = 0; attempt < 6; attempt++) {
      const cur = await store.getWithMetadata(KEYS.voter(sid, vk), { type: "json" });
      const prev = cur?.data || null;
      if (prev && prev.s === side && prev.r.join() === reasons.join()) return { status: 200, body: { ballot: ballotView(prev), sid, unchanged: true } };
      if (prev && prev.rev >= LIMITS.revisions) refuse(429, `THIS FILE HAS CHANGED ITS BALLOT ${LIMITS.revisions} TIMES. THE DEPARTMENT HAS RECORDED YOUR FINAL ANSWER AS YOUR FINAL ANSWER.`);
      if (!prev) {
        if (!(await claim(store, KEYS.ip(sid, ip), vk, LIMITS.casesPerIp))) refuse(429, `${LIMITS.casesPerIp} FILES HAVE ALREADY VOTED FROM YOUR LOCATION. THE DEPARTMENT COUNTS PEOPLE, NOT PAPERWORK.`);
        if (dh && !(await claim(store, KEYS.dev(sid, dh), vk, LIMITS.casesPerDevice))) refuse(429, `${LIMITS.casesPerDevice} FILES HAVE ALREADY VOTED FROM THIS DEVICE. ONE TERMINAL, ONE OR TWO CITIZENS. NOT A CAUCUS.`);
      }
      const ballot = { s: side, r: reasons, rev: (prev?.rev || 0) + 1, at: new Date(now).toISOString(), ip, dev: dh };
      const res = await store.setJSON(KEYS.voter(sid, vk), ballot, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
      if (!res.modified) { await sleep(3 + Math.random() * 15); continue; }
      const folded = await fold(store, sid, { [vk]: ballot });
      return { status: 200, body: { ballot: ballotView(ballot), sid, changed: Boolean(prev), folded } };
    }
    refuse(409, "YOUR BALLOT COLLIDED WITH ITSELF. SUBMIT IT ONCE.");
  });
}
const ballotView = (b) => ({ side: b.s, reasons: b.r, rev: b.rev, at: b.at });
export async function myBallot(store, sid, caseId) {
  const b = await store.get(KEYS.voter(sid, voterKey(caseId)), { type: "json" });
  return b ? ballotView(b) : null;
}

// ---- THE CLOSE: the result, and the act -----------------------------------------------------------------
// Players decide; a motion carries on a simple majority of ballots cast. A tie, or no ballots,
// fails (the city stays as it is). The result is decided once from a full recount.
export async function finalize(store, s, row, now = Date.now()) {
  if (now < s.closeAt) return null;
  let result = await store.get(KEYS.result(s.sid), { type: "json" });
  if (!result) {
    const c = await recount(store, s.sid);
    const r = { sid: s.sid, pid: s.pid, carried: c.votes.for > c.votes.against, votes: c.votes, reasons: c.reasons, voters: c.voters, closedAt: s.closeAt, decidedAt: now };
    const res = await store.setJSON(KEYS.result(s.sid), r, { onlyIfNew: true });
    result = res.modified ? r : await store.get(KEYS.result(s.sid), { type: "json" });
  }
  if (result.carried && row) await recordAct(store, actOf(s, row, result));
  return result;
}
// What a carried motion did: data only, read by the city (src/city/acts.js). Deterministic from
// the row and the result.
export function actOf(s, row, result) {
  const t = targetOf(row.target);
  const a = { sid: s.sid, pid: row.id, no: row.no, type: row.type, target: row.target, targetName: t?.name || row.target, district: t?.district || null, title: row.title, desc: row.desc, tag: row.tag, at: s.closeAt, votes: result.votes };
  if (row.type === "RENAME") a.newName = row.title.toUpperCase();
  if (row.type === "BUILD") a.style = styleFor(row.title, row.desc);
  a.effect = EFFECT[row.type](a);
  return a;
}
export async function recordAct(store, act) {
  for (let i = 0; i < 10; i++) {
    const cur = await store.getWithMetadata(KEYS.acts, { type: "json" });
    const acts = cur?.data?.acts || [];
    if (acts.some(a => a.sid === act.sid)) return false;
    const next = [...acts, act].sort((a, b) => a.at - b.at || a.sid.localeCompare(b.sid));
    const res = await store.setJSON(KEYS.acts, { acts: next }, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return true;
    await sleep(5 + Math.random() * 20);
  }
  throw new Error("proposals acts: lost the write race");
}
export async function readActs(store) {
  return (await store.get(KEYS.acts, { type: "json" }))?.acts || [];
}
// Close every session that is due and not yet marked done. Cheap once they are done.
export async function closeDue(store, now = Date.now()) {
  const d = await readDocket(store);
  const due = d.sessions.filter(s => !s.done && now >= s.closeAt);
  if (!due.length) return d;
  const results = {};
  for (const s of due) results[s.sid] = await finalize(store, s, d.rows[s.pid], now);
  await editDocket(store, (dd) => {
    let n = 0;
    for (const s of dd.sessions) {
      const r = results[s.sid];
      if (r && !s.done) { s.done = true; s.carried = r.carried; s.votes = r.votes; n++; }
    }
    return n ? n : undefined;
  });
  return readDocket(store);
}

// ---- the public view ------------------------------------------------------------------------------
export function publicRow(r, now) {
  const status = statusOf(r, now);
  const t = targetOf(r.target);
  const cosigns = r.cs?.length || 0;
  return {
    id: r.id, no: r.no, type: r.type, target: r.target, targetName: t?.name || r.target, title: r.title, desc: r.desc,
    tag: r.tag, at: r.at, expiresAt: r.at + EXPIRE_MS, status, cosigns,
    decision: r.decision ? { at: r.decision.at, reason: r.decision.reason || null, into: r.decision.into || null, sid: r.decision.sid || null } : null,
    merged: r.from?.length || 0,
    line: commentary({ id: r.id, status, cosigns }),
  };
}
const rank = (a, b) => b.cosigns - a.cosigns || a.at - b.at;
// GET: the docket (open first by co-signs), the sessions, the one in progress (with its tally and
// minute), the acts. With a case: its ballot, what it signed, whether it may file today.
export async function publicView(store, { now = Date.now(), caseId = null, recentDecided = 20 } = {}) {
  let d = await closeDue(store, now).catch(async (err) => { console.error("proposals close failed", err?.message); return readDocket(store); });
  const rows = Object.values(d.rows).map(r => publicRow(r, now));
  const open = rows.filter(r => r.status === "open").sort(rank);
  const decided = rows.filter(r => r.status !== "open").sort((a, b) => (b.decision?.at || b.expiresAt) - (a.decision?.at || a.expiresAt)).slice(0, recentDecided);
  const cur = currentSession(d, now), nxt = nextSession(d, now);
  const sessionOut = async (s) => {
    if (!s) return null;
    const row = d.rows[s.pid];
    const out = { sid: s.sid, openAt: s.openAt, closeAt: s.closeAt, state: sessionState(s, now), proposal: row ? publicRow(row, now) : null, minute: row ? minute(row, targetOf(row.target)?.name || row.target) : null };
    if (out.state === "open") {
      const t = (await store.get(KEYS.tally(s.sid), { type: "json" })) || emptyTally();
      out.tally = countsOf(t.seen);
    }
    return out;
  };
  const lastDone = d.sessions.filter(s => s.done).sort((a, b) => b.closeAt - a.closeAt)[0] || null;
  const view = {
    now,
    open, decided,
    session: await sessionOut(cur),
    next: await sessionOut(nxt),
    last: lastDone ? { sid: lastDone.sid, closeAt: lastDone.closeAt, carried: lastDone.carried, votes: lastDone.votes, proposal: d.rows[lastDone.pid] ? publicRow(d.rows[lastDone.pid], now) : null } : null,
    queue: d.sessions.filter(s => s.openAt > now).sort((a, b) => a.openAt - b.openAt).map(s => ({ sid: s.sid, openAt: s.openAt, closeAt: s.closeAt, no: d.rows[s.pid]?.no, title: d.rows[s.pid]?.title })),
    acts: await readActs(store),
    rules: { types: Object.keys(TYPES), sides: SIDES, reasons: REASONS, maxReasons: MAX_REASONS, limits: LIMITS },
  };
  if (caseId) {
    const k = caseKey(caseId);
    view.mine = {
      tag: caseTag(caseId),
      filedToday: Boolean(await store.get(KEYS.filed(new Date(now).toISOString().slice(0, 10), k), { type: "json" })),
      signed: Object.values(d.rows).filter(r => r.cs.includes(k)).map(r => r.id),
      filed: Object.values(d.rows).filter(r => r.fk === k).map(r => r.id),
      ballot: cur ? await myBallot(store, cur.sid, caseId) : null,
    };
  }
  return view;
}
// The owner's queue: every open proposal by co-signs (co-signatures healed first), the recent
// decisions, and the session queue.
export async function ownerView(store, now = Date.now()) {
  let d = await readDocket(store);
  const openIds = Object.values(d.rows).filter(r => statusOf(r, now) === "open").map(r => r.id);
  if (openIds.length) { await healCosigns(store, openIds).catch(() => 0); d = await readDocket(store); }
  const rows = Object.values(d.rows).map(r => publicRow(r, now));
  return {
    queue: rows.filter(r => r.status === "open").sort(rank),
    expired: rows.filter(r => r.status === "expired").sort(rank),
    decided: rows.filter(r => !["open", "expired"].includes(r.status)).sort((a, b) => (b.decision?.at || 0) - (a.decision?.at || 0)).slice(0, 50),
    sessions: d.sessions.map(s => ({ ...s, state: sessionState(s, now), no: d.rows[s.pid]?.no, title: d.rows[s.pid]?.title })),
    presets: DECLINE_PRESETS,
  };
}
