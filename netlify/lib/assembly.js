// THE ASSEMBLY (docs/ASSEMBLY.md): the city's first public vote, lean, on Netlify Blobs.
//
// Store hvi-assembly, one session under s<id>/:
//   meta              {session, openAt, closeAt, createdAt}   written once, at the first run
//   v/<voterKey>      one ballot per assessed case: {c, r, rev, at, ip, dev}   onlyIfNew, then CAS
//   ip/<ipHash>       {keys: [voterKey]}   the cases that have voted from this address (cap)
//   dev/<devHash>     {keys: [voterKey]}   ... from this device (cap)
//   tally             {seen: {voterKey: [rev, choiceIdx, reasonMask]}, at, healedAt}
//   result            {winner, votes, reasons, voters, tie, closedAt, decidedAt}   onlyIfNew
//
// The ballots are the truth. The tally is a fold of them, kept per voter and idempotent:
// a ballot is folded in only over an older revision of the same voter, so a retried or
// out-of-order write can never count twice, and a fold that lost its race (the ballot is
// saved, the tally write failed) is healed by the next recount from the ballots (heal()).
// The close is decided from a full recount. No database yet: see docs/ASSEMBLY.md for the
// trigger that moves this to one.
//
// Every function takes the store (or io) as an argument, so scripts/check-assembly.mjs runs
// it against an in-memory store with the same etag semantics.

import { createHash } from "node:crypto";

export const SESSION = "001";
export const STORE = "hvi-assembly";
export const DURATION_MS = 3 * 24 * 3600 * 1000;
export const CHOICES = ["golf", "farm"];
export const REASONS = ["JOBS", "LEISURE", "FOOD", "LAND", "BEAUTY", "SPITE"];
export const MAX_REASONS = 3;
export const LIMITS = { casesPerIp: 4, casesPerDevice: 2, revisions: 10, ballotsPerIpHour: 30 };
export const HEAL_EVERY_MS = 10 * 60 * 1000;
export const HEAL_MAX_VOTERS = 2000;   // past this a GET stops recounting (docs/ASSEMBLY.md: the DB trigger)

const P = `s${SESSION}/`;
export const KEYS = {
  meta: `${P}meta`, tally: `${P}tally`, result: `${P}result`,
  voter: (vk) => `${P}v/${vk}`, ip: (h) => `${P}ip/${h}`, dev: (h) => `${P}dev/${h}`, voters: `${P}v/`,
};

const salt = () => process.env.HVI_IP_SALT || "hvi-limits-v1";
const sha = (s) => createHash("sha256").update(s).digest("hex");
// A case number is a credential: the store never holds it, only a salted hash.
export const voterKey = (caseId) => sha(`${salt()}:assembly:${caseId}`).slice(0, 16);
export const deviceHash = (dev) => (typeof dev === "string" && /^[a-f0-9]{16,64}$/.test(dev) ? sha(`${salt()}:device:${dev}`).slice(0, 16) : null);
export const reasonMask = (r) => r.reduce((m, x) => m | (1 << REASONS.indexOf(x)), 0);
export const reasonsOf = (mask) => REASONS.filter((_, i) => mask & (1 << i));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- the session ----------------------------------------------------------------------
// The first run opens the polls for three days from that moment (Scott: "open at deploy time
// + 3 days"). Whoever writes first wins; everyone after reads theirs.
export async function ensureSession(store, now = Date.now()) {
  const cur = await store.get(KEYS.meta, { type: "json" });
  if (cur) return cur;
  const meta = { session: SESSION, openAt: now, closeAt: now + DURATION_MS, createdAt: new Date(now).toISOString() };
  const res = await store.setJSON(KEYS.meta, meta, { onlyIfNew: true });
  return res.modified ? meta : await store.get(KEYS.meta, { type: "json" });
}
export const readSession = (store) => store.get(KEYS.meta, { type: "json" });
export const isOpen = (meta, now) => Boolean(meta) && now >= meta.openAt && now < meta.closeAt;

// ---- the tally ------------------------------------------------------------------------
const emptyTally = () => ({ seen: {}, at: null, healedAt: 0 });
// -> {votes: {golf, farm}, reasons: {golf: {JOBS..}, farm: {..}}, all: {JOBS..}, voters}
export function countsOf(seen) {
  const votes = Object.fromEntries(CHOICES.map(c => [c, 0]));
  const reasons = Object.fromEntries(CHOICES.map(c => [c, Object.fromEntries(REASONS.map(r => [r, 0]))]));
  const all = Object.fromEntries(REASONS.map(r => [r, 0]));
  let voters = 0;
  for (const [, ci, mask] of Object.values(seen || {})) {
    const c = CHOICES[ci];
    if (!c) continue;
    voters++; votes[c]++;
    for (const r of reasonsOf(mask)) { reasons[c][r]++; all[r]++; }
  }
  return { votes, reasons, all, voters };
}
// Fold ballots {vk: {rev, c, r}} into the tally, each only over an older revision. -> true
// when the tally holds them all (written, or already there).
export async function fold(store, ballots, { tries = 10, now = Date.now(), heal = false } = {}) {
  for (let i = 0; i < tries; i++) {
    const cur = await store.getWithMetadata(KEYS.tally, { type: "json" });
    const t = cur?.data ? structuredClone(cur.data) : emptyTally();
    let changed = false;
    for (const [vk, b] of Object.entries(ballots)) {
      const have = t.seen[vk];
      if (have && have[0] >= b.rev) continue;
      t.seen[vk] = [b.rev, CHOICES.indexOf(b.c), reasonMask(b.r)];
      changed = true;
    }
    if (!changed && !heal) return true;
    t.at = new Date(now).toISOString();
    if (heal) t.healedAt = now;
    const res = await store.setJSON(KEYS.tally, t, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return true;
    await sleep(5 + Math.random() * 20 * (i + 1));
  }
  return false;
}
// Recount from the ballots: every ballot the tally is missing or holds an older revision of.
export async function heal(store, { now = Date.now(), tries = 8 } = {}) {
  const keys = [];
  let cursor;
  do {
    const page = await store.list({ prefix: KEYS.voters, ...(cursor ? { cursor } : {}) });
    keys.push(...page.blobs.map(b => b.key));
    cursor = page.cursor;
  } while (cursor);
  const ballots = {};
  for (let i = 0; i < keys.length; i += 50) {
    const got = await Promise.all(keys.slice(i, i + 50).map(k => store.get(k, { type: "json" })));
    got.forEach((b, j) => { if (b && CHOICES.includes(b.c)) ballots[keys[i + j].slice(KEYS.voters.length)] = b; });
  }
  const ok = await fold(store, ballots, { now, tries, heal: true });
  if (!ok) throw new Error("assembly heal: lost the tally race");
  return Object.keys(ballots).length;
}
export async function readTally(store) {
  return (await store.get(KEYS.tally, { type: "json" })) || emptyTally();
}

// ---- the close ----------------------------------------------------------------------------
// The chair's coin, for a tie: fixed per session, so every recount lands the same way.
export const chairCoin = (session = SESSION) => CHOICES[parseInt(sha(`chair-coin:${session}`).slice(0, 8), 16) % 2];
export function decide(counts) {
  const { golf, farm } = counts.votes;
  const tie = golf === farm;
  return { winner: tie ? chairCoin() : golf > farm ? "golf" : "farm", tie };
}
// After the close: the result, decided once from a full recount. Before it: null.
export async function finalize(store, now = Date.now(), meta = null) {
  meta ||= await readSession(store);
  if (!meta || now < meta.closeAt) return null;
  const have = await store.get(KEYS.result, { type: "json" });
  if (have) return have;
  await heal(store, { now });
  const counts = countsOf((await readTally(store)).seen);
  const { winner, tie } = decide(counts);
  const result = { session: SESSION, winner, tie, votes: counts.votes, reasons: counts.reasons, all: counts.all, voters: counts.voters, closedAt: meta.closeAt, decidedAt: new Date(now).toISOString() };
  const res = await store.setJSON(KEYS.result, result, { onlyIfNew: true });
  return res.modified ? result : await store.get(KEYS.result, { type: "json" });
}
// What the city is built from (sim.setCivic): null before a session exists.
export async function civicOf(store, now = Date.now()) {
  const meta = await readSession(store);
  if (!meta) return null;
  const result = await finalize(store, now, meta);
  return { closeAt: meta.closeAt, winner: result?.winner || null };
}

// ---- a ballot -------------------------------------------------------------------------------
// Add vk to a capped registry (cases per address, per device). -> true if it is (now) there.
async function claim(store, key, vk, cap) {
  for (let i = 0; i < 8; i++) {
    const cur = await store.getWithMetadata(key, { type: "json" });
    const keys = cur?.data?.keys || [];
    if (keys.includes(vk)) return true;
    if (keys.length >= cap) return false;
    const res = await store.setJSON(key, { keys: [...keys, vk] }, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return true;
    await sleep(3 + Math.random() * 10);
  }
  return false;
}

export function parseBallot(body) {
  const choice = String(body?.choice || "").toLowerCase();
  if (!CHOICES.includes(choice)) return { error: "Choose an application: 001 or 002. The Assembly does not accept abstentions in writing." };
  const raw = Array.isArray(body?.reasons) ? body.reasons.map(r => String(r).toUpperCase()) : [];
  const reasons = REASONS.filter(r => raw.includes(r));
  if (!reasons.length || reasons.length !== raw.length) return { error: `Give at least one reason from the list: ${REASONS.join(", ")}. The Department does not read free text.` };
  if (reasons.length > MAX_REASONS) return { error: `At most ${MAX_REASONS} reasons. More would be an opinion.` };
  return { choice, reasons };
}

// io: {store, getCase(caseId), hitLimit(key, max, window)}. -> {status, body}
export async function castBallot(io, { caseId, choice, reasons, ip, device, now = Date.now() }) {
  const { store } = io;
  const meta = await ensureSession(store, now);
  if (now < meta.openAt) return { status: 403, body: { error: "The Assembly is not yet in session. Wait. You are good at waiting." } };
  if (now >= meta.closeAt) return { status: 403, body: { error: "The polls are closed. The Assembly has spoken, or will shortly. You were not needed.", closed: true } };
  let lim;
  try { lim = await io.hitLimit(`assembly-ip:${ip}`, LIMITS.ballotsPerIpHour, "hour"); } catch {
    return { status: 503, body: { error: "The Department's queue ledger is unavailable, and the Assembly does not count off the books. Try again shortly." }, retry: 60 };
  }
  if (!lim.ok) {
    return { status: 429, body: { error: "Too many ballots from your location this hour. Democracy is rate-limited. Return in an hour." }, retry: 3600 };
  }
  const rec = await io.getCase(caseId);
  if (!rec) return { status: 404, body: { error: "No such file. The Department does not lose files. You have mistyped." } };
  if (!Array.isArray(rec.history) || !rec.history.length) return { status: 403, body: { error: "Only assessed subjects vote. Your file has no assessment on it. Be assessed first; then you may have opinions." } };
  const vk = voterKey(caseId), dh = deviceHash(device);
  for (let attempt = 0; attempt < 6; attempt++) {
    const cur = await store.getWithMetadata(KEYS.voter(vk), { type: "json" });
    const prev = cur?.data || null;
    if (prev && prev.c === choice && prev.r.join() === reasons.join()) return { status: 200, body: { ballot: view(prev), unchanged: true } };
    if (prev && prev.rev >= LIMITS.revisions) return { status: 429, body: { error: `This file has changed its ballot ${LIMITS.revisions} times. The Department has recorded your final answer as your final answer.` } };
    if (!prev) {
      // A new voter takes a place on its address's and device's lists (one person, many
      // files: the lists are short). A change of mind costs no place.
      if (!(await claim(store, KEYS.ip(ip), vk, LIMITS.casesPerIp))) return { status: 429, body: { error: `${LIMITS.casesPerIp} files have already voted from your location. The Department counts people, not paperwork.` } };
      if (dh && !(await claim(store, KEYS.dev(dh), vk, LIMITS.casesPerDevice))) return { status: 429, body: { error: `${LIMITS.casesPerDevice} files have already voted from this device. One terminal, one or two citizens. Not a caucus.` } };
    }
    const ballot = { c: choice, r: reasons, rev: (prev?.rev || 0) + 1, at: new Date(now).toISOString(), ip, dev: dh };
    const res = await store.setJSON(KEYS.voter(vk), ballot, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (!res.modified) { await sleep(3 + Math.random() * 15); continue; }
    const folded = await fold(store, { [vk]: ballot }, { now });
    return { status: 200, body: { ballot: view(ballot), changed: Boolean(prev), folded } };
  }
  return { status: 409, body: { error: "Your ballot collided with itself. Submit it once. The Department only needs to hear it once." } };
}
const view = (b) => ({ choice: b.c, reasons: b.r, rev: b.rev, at: b.at });
export async function myBallot(store, caseId) {
  const b = await store.get(KEYS.voter(voterKey(caseId)), { type: "json" });
  return b ? view(b) : null;
}

// ---- the public view --------------------------------------------------------------------------
// GET: opens the session on the first run, closes it when due, recounts now and then.
export async function publicView(store, now = Date.now()) {
  const meta = await ensureSession(store, now);
  const result = await finalize(store, now, meta);
  let tally = await readTally(store);
  const n = Object.keys(tally.seen).length;
  if (!result && n <= HEAL_MAX_VOTERS && now - (tally.healedAt || 0) > HEAL_EVERY_MS) {
    try { await heal(store, { now, tries: 2 }); tally = await readTally(store); } catch { /* the next GET tries again */ }
  }
  const counts = result ? { votes: result.votes, reasons: result.reasons, all: result.all, voters: result.voters } : countsOf(tally.seen);
  return {
    session: { id: SESSION, openAt: meta.openAt, closeAt: meta.closeAt, now, state: now < meta.openAt ? "pending" : now < meta.closeAt ? "open" : "closed" },
    tally: counts, result: result || null,
    civic: { closeAt: meta.closeAt, winner: result?.winner || null },
    rules: { choices: CHOICES, reasons: REASONS, maxReasons: MAX_REASONS, limits: LIMITS },
  };
}
