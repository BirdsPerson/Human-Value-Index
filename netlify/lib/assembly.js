// THE ASSEMBLY (docs/ASSEMBLY.md): the city's public votes, lean, on Netlify Blobs. One session
// open at a time: 001 (LOT 0x6F07) opens at the first run; 002 (THE RESORT PARCELS) opens the
// moment 001 closes. A session has one or more MOTIONS, each a choice between two bids.
//
// Store hvi-assembly, one session under s<id>/:
//   meta              {session, openAt, closeAt, createdAt}   written once (001: the first run;
//                     002: the first reader after 001's close, dated from 001's close)
//   v/<voterKey>      one ballot per assessed case: {c, r, rev, at, ip, dev}   onlyIfNew, then CAS.
//                     c: the choice (a one-motion session) or {motion: choice}
//   ip/<ipHash>       {keys: [voterKey]}   the cases that have voted from this address (cap)
//   dev/<devHash>     {keys: [voterKey]}   ... from this device (cap)
//   tally             {seen: {voterKey: [rev, comboIdx, reasonMask]}, at, healedAt}. comboIdx: the
//                     ballot's choices as one number (a one-motion session: the choice's index)
//   result            001: {winner, votes, reasons, voters, tie, closedAt, decidedAt, decidedBy, substrate}
//                     002: {winners: {motion: choice}, ties, decidedBy, substrate: {motion: ..}, ...}
//                     onlyIfNew, from a full recount
//   substrate         THE SUBSTRATE (ADVISORY): the census's advisory tally (src/assembly/substrate.js),
//                     recounted at most every 10 minutes while the polls are open, frozen at the close
//
// The ballots are the truth. The tally is a fold of them, kept per voter and idempotent:
// a ballot is folded in only over an older revision of the same voter, so a retried or
// out-of-order write can never count twice, and a fold that lost its race (the ballot is
// saved, the tally write failed) is healed by the next recount from the ballots (heal()).
// The close is decided from a full recount. No database yet: see docs/ASSEMBLY.md for the
// trigger that moves this to one.
//
// Every function takes the store (or io) as an argument, so scripts/check-assembly.mjs runs
// it against an in-memory store with the same etag semantics. Session 001's functions keep
// their signatures (the session is an optional last argument / option).

import { createHash } from "node:crypto";
import { substrateTally } from "../../src/assembly/substrate.js";
import { SUBSTRATE } from "../../src/assembly/content.js";
import { SUBSTRATE2 } from "../../src/assembly/content002.js";

export const SESSION = "001";
export const STORE = "hvi-assembly";
export const DURATION_MS = 3 * 24 * 3600 * 1000;
export const CHOICES = ["golf", "farm"];
export const REASONS = ["JOBS", "LEISURE", "FOOD", "LAND", "BEAUTY", "SPITE"];
export const MAX_REASONS = 3;
export const LIMITS = { casesPerIp: 4, casesPerDevice: 2, revisions: 10, ballotsPerIpHour: 30 };
export const HEAL_EVERY_MS = 10 * 60 * 1000;
export const HEAL_MAX_VOTERS = 2000;   // past this a GET stops recounting (docs/ASSEMBLY.md: the DB trigger)
export const SUBSTRATE_EVERY_MS = 10 * 60 * 1000;

// ---- the sessions ---------------------------------------------------------------------------------
// motions: [{id, choices: [a, b]}]; substrate: one lean per motion (content.js, content002.js).
export const SESSIONS = {
  "001": { id: "001", motions: [{ id: "lot", choices: CHOICES }], substrate: [SUBSTRATE] },
  "002": { id: "002", after: "001", motions: SUBSTRATE2.map(m => ({ id: m.id, choices: m.choices })), substrate: SUBSTRATE2 },
};
export const SESSION_ORDER = ["001", "002"];
const S = (sid) => SESSIONS[sid] || SESSIONS[SESSION];
const single = (sid) => S(sid).motions.length === 1;
// A ballot's choices as one number and back: motion i's choice index times 2^i.
export function encode(sid, c) {
  const Z = S(sid);
  if (single(sid)) return Z.motions[0].choices.indexOf(c);
  let idx = 0;
  Z.motions.forEach((m, i) => { const k = m.choices.indexOf(c?.[m.id]); idx = k < 0 || idx < 0 ? -1 : idx + k * 2 ** i; });
  return idx;
}
export function decode(sid, idx) {
  const Z = S(sid);
  if (!Number.isInteger(idx) || idx < 0 || idx >= 2 ** Z.motions.length) return null;
  return Object.fromEntries(Z.motions.map((m, i) => [m.id, m.choices[Math.floor(idx / 2 ** i) % 2]]));
}
const validChoice = (sid, c) => encode(sid, c) >= 0;

const keysFor = (sid) => {
  const P = `s${sid}/`;
  return {
    meta: `${P}meta`, tally: `${P}tally`, result: `${P}result`, substrate: `${P}substrate`,
    voter: (vk) => `${P}v/${vk}`, ip: (h) => `${P}ip/${h}`, dev: (h) => `${P}dev/${h}`, voters: `${P}v/`,
  };
};
const KEYS_BY = Object.fromEntries(Object.keys(SESSIONS).map(sid => [sid, keysFor(sid)]));
export const KEYS = KEYS_BY[SESSION];
export const keysOf = (sid = SESSION) => KEYS_BY[sid] || keysFor(sid);

const salt = () => process.env.HVI_IP_SALT || "hvi-limits-v1";
const sha = (s) => createHash("sha256").update(s).digest("hex");
// A case number is a credential: the store never holds it, only a salted hash.
export const voterKey = (caseId) => sha(`${salt()}:assembly:${caseId}`).slice(0, 16);
export const deviceHash = (dev) => (typeof dev === "string" && /^[a-f0-9]{16,64}$/.test(dev) ? sha(`${salt()}:device:${dev}`).slice(0, 16) : null);
export const reasonMask = (r) => r.reduce((m, x) => m | (1 << REASONS.indexOf(x)), 0);
export const reasonsOf = (mask) => REASONS.filter((_, i) => mask & (1 << i));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- the session ----------------------------------------------------------------------
// 001: the first run opens the polls for three days from that moment (Scott: "open at deploy
// time + 3 days"). Whoever writes first wins; everyone after reads theirs.
export async function ensureSession(store, now = Date.now(), sid = SESSION) {
  if (sid !== SESSION) return ensureNext(store, now, sid);
  const K = keysOf(sid);
  const cur = await store.get(K.meta, { type: "json" });
  if (cur) return cur;
  const meta = { session: SESSION, openAt: now, closeAt: now + DURATION_MS, createdAt: new Date(now).toISOString() };
  const res = await store.setJSON(K.meta, meta, { onlyIfNew: true });
  return res.modified ? meta : await store.get(K.meta, { type: "json" });
}
// A later session opens the moment the one before it closes (one open session at a time), for
// three days: dated from that close, whoever reads first, so every reader writes the same times.
// Before the close: null.
async function ensureNext(store, now, sid) {
  const K = keysOf(sid), cur = await store.get(K.meta, { type: "json" });
  if (cur) return cur;
  const before = await store.get(keysOf(S(sid).after).meta, { type: "json" });
  if (!before || now < before.closeAt) return null;
  const meta = { session: sid, openAt: before.closeAt, closeAt: before.closeAt + DURATION_MS, createdAt: new Date(now).toISOString() };
  const res = await store.setJSON(K.meta, meta, { onlyIfNew: true });
  return res.modified ? meta : await store.get(K.meta, { type: "json" });
}
export const readSession = (store, sid = SESSION) => store.get(keysOf(sid).meta, { type: "json" });
export const isOpen = (meta, now) => Boolean(meta) && now >= meta.openAt && now < meta.closeAt;

// ---- the tally ------------------------------------------------------------------------
const emptyTally = () => ({ seen: {}, at: null, healedAt: 0 });
// -> {votes: {choice: n}, reasons: {choice: {JOBS..}}, all: {JOBS..}, voters}. A ballot's
// reasons count towards every bid it chose (and once in `all`).
export function countsOf(seen, sid = SESSION) {
  const ids = S(sid).motions.flatMap(m => m.choices);
  const votes = Object.fromEntries(ids.map(c => [c, 0]));
  const reasons = Object.fromEntries(ids.map(c => [c, Object.fromEntries(REASONS.map(r => [r, 0]))]));
  const all = Object.fromEntries(REASONS.map(r => [r, 0]));
  let voters = 0;
  for (const [, ci, mask] of Object.values(seen || {})) {
    const cs = single(sid) ? [S(sid).motions[0].choices[ci]] : Object.values(decode(sid, ci) || {});
    if (!cs.length || !cs.every(Boolean)) continue;
    voters++;
    const rs = reasonsOf(mask);
    for (const c of cs) { votes[c]++; for (const r of rs) reasons[c][r]++; }
    for (const r of rs) all[r]++;
  }
  return { votes, reasons, all, voters };
}
// Fold ballots {vk: {rev, c, r}} into the tally, each only over an older revision. -> true
// when the tally holds them all (written, or already there).
export async function fold(store, ballots, { tries = 10, now = Date.now(), heal = false, sid = SESSION } = {}) {
  const K = keysOf(sid);
  for (let i = 0; i < tries; i++) {
    const cur = await store.getWithMetadata(K.tally, { type: "json" });
    const t = cur?.data ? structuredClone(cur.data) : emptyTally();
    let changed = false;
    for (const [vk, b] of Object.entries(ballots)) {
      const have = t.seen[vk];
      if (have && have[0] >= b.rev) continue;
      t.seen[vk] = [b.rev, encode(sid, b.c), reasonMask(b.r)];
      changed = true;
    }
    if (!changed && !heal) return true;
    t.at = new Date(now).toISOString();
    if (heal) t.healedAt = now;
    const res = await store.setJSON(K.tally, t, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return true;
    await sleep(5 + Math.random() * 20 * (i + 1));
  }
  return false;
}
// Recount from the ballots: every ballot the tally is missing or holds an older revision of.
export async function heal(store, { now = Date.now(), tries = 8, sid = SESSION } = {}) {
  const K = keysOf(sid), keys = [];
  let cursor;
  do {
    const page = await store.list({ prefix: K.voters, ...(cursor ? { cursor } : {}) });
    keys.push(...page.blobs.map(b => b.key));
    cursor = page.cursor;
  } while (cursor);
  const ballots = {};
  for (let i = 0; i < keys.length; i += 50) {
    const got = await Promise.all(keys.slice(i, i + 50).map(k => store.get(k, { type: "json" })));
    got.forEach((b, j) => { if (b && validChoice(sid, b.c)) ballots[keys[i + j].slice(K.voters.length)] = b; });
  }
  const ok = await fold(store, ballots, { now, tries, heal: true, sid });
  if (!ok) throw new Error("assembly heal: lost the tally race");
  return Object.keys(ballots).length;
}
export async function readTally(store, sid = SESSION) {
  return (await store.get(keysOf(sid).tally, { type: "json" })) || emptyTally();
}

// ---- THE SUBSTRATE (ADVISORY) -----------------------------------------------------------------
// Every subject in the census votes from its record (src/assembly/substrate.js). Players decide;
// the substrate advises, and is adopted only when no player votes at all. source: async () =>
// {subjects (the full roster), moods ({district: mood score} | null)}. Recounted at most every
// SUBSTRATE_EVERY_MS while the polls are open (the plan builder's run and the page's reads both
// ask); the last count before the close is the one the close reads. -> the snapshot, or null.
// A one-motion session's snapshot is the motion's tally; a session of several holds
// {motions: {motion: tally}} with the same bookkeeping beside it.
export const readSubstrate = (store, sid = SESSION) => store.get(keysOf(sid).substrate, { type: "json" });
export async function refreshSubstrate(store, source, { now = Date.now(), force = false, meta = null, sid = SESSION } = {}) {
  meta ||= await readSession(store, sid);
  const cur = await readSubstrate(store, sid);
  if (!meta || now >= meta.closeAt || now < meta.openAt) return cur;   // frozen at the close
  if (!force && cur && now - (cur.computedAt || 0) < SUBSTRATE_EVERY_MS) return cur;
  const { subjects, moods } = await source();
  if (!Array.isArray(subjects) || !subjects.length) return cur;   // an empty census is a failed read, not a city
  const book = { session: sid, moods: Boolean(moods), computedAt: now, at: new Date(now).toISOString() };
  const snap = single(sid)
    ? { session: sid, ...substrateTally(subjects, S(sid).substrate[0], { moods }), ...book }
    : { ...book, motions: Object.fromEntries(S(sid).substrate.map(m => [m.id, substrateTally(subjects, m, { moods })])) };
  await store.setJSON(keysOf(sid).substrate, snap);
  return snap;
}
const compactSub = (x) => (x ? { votes: x.votes, reasons: x.reasons, all: x.all, voters: x.voters, abstained: x.abstained, recused: x.recused, n: x.n, winner: x.winner, at: x.at } : null);
const compactSubs = (x, sid) => (x?.motions ? Object.fromEntries(S(sid).motions.map(m => [m.id, compactSub(x.motions[m.id] && { ...x.motions[m.id], at: x.at })])) : null);

// ---- the close ----------------------------------------------------------------------------
// The chair's coin, for a tie: fixed per session (per parcel), so every recount lands the same way.
export const chairCoin = (session = SESSION, choices = CHOICES) => choices[parseInt(sha(`chair-coin:${session}`).slice(0, 8), 16) % 2];
export function decide(counts) {
  const { golf, farm } = counts.votes;
  const tie = golf === farm;
  return { winner: tie ? chairCoin() : golf > farm ? "golf" : "farm", tie };
}
// A session of several motions: each motion's majority, the chair's coin (one per parcel) on a tie.
export function decideMotions(counts, sid) {
  const winners = {}, ties = {};
  for (const m of S(sid).motions) {
    const [a, b] = m.choices, va = counts.votes[a], vb = counts.votes[b];
    ties[m.id] = va === vb;
    winners[m.id] = va === vb ? chairCoin(`${sid}:${m.id}`, m.choices) : va > vb ? a : b;
  }
  return { winners, ties };
}
// After the close: the result, decided once from a full recount. Before it: null.
export async function finalize(store, now = Date.now(), meta = null, sid = SESSION) {
  meta ||= await readSession(store, sid);
  if (!meta || now < meta.closeAt) return null;
  const K = keysOf(sid);
  const have = await store.get(K.result, { type: "json" });
  if (have) return have;
  await heal(store, { now, sid });
  const counts = countsOf((await readTally(store, sid)).seen, sid);
  const base = { votes: counts.votes, reasons: counts.reasons, all: counts.all, voters: counts.voters, closedAt: meta.closeAt, decidedAt: new Date(now).toISOString() };
  let result;
  if (single(sid)) {
    let { winner, tie } = decide(counts);
    // Players decide. Only when not one player voted is the substrate's preference adopted (a
    // level substrate, or none on record, leaves it to the chair's coin, as before).
    const sub = compactSub(await readSubstrate(store, sid));
    let decidedBy = tie ? "coin" : "citizens";
    if (counts.voters === 0 && sub?.winner) { winner = sub.winner; tie = false; decidedBy = "substrate"; }
    result = { session: sid, winner, tie, ...base, decidedBy, substrate: sub };
  } else {
    const { winners, ties } = decideMotions(counts, sid);
    const subs = compactSubs(await readSubstrate(store, sid), sid), decidedBy = {};
    for (const m of S(sid).motions) {
      decidedBy[m.id] = ties[m.id] ? "coin" : "citizens";
      const sub = subs?.[m.id];
      if (counts.voters === 0 && sub?.winner) { winners[m.id] = sub.winner; ties[m.id] = false; decidedBy[m.id] = "substrate"; }
    }
    result = { session: sid, winners, ties, ...base, decidedBy, substrate: subs };
  }
  const res = await store.setJSON(K.result, result, { onlyIfNew: true });
  return res.modified ? result : await store.get(K.result, { type: "json" });
}
// What the city is built from (sim.setCivic): null before a session exists. resorts: session
// 002's parcels, once it has opened ({closeAt, winners: {coast, heights} | null}).
export async function civicOf(store, now = Date.now()) {
  const meta = await readSession(store);
  if (!meta) return null;
  const result = await finalize(store, now, meta);
  const out = { closeAt: meta.closeAt, winner: result?.winner || null, resorts: null };
  if (result) {
    const m2 = await ensureSession(store, now, "002");
    if (m2) { const r2 = await finalize(store, now, m2, "002"); out.resorts = { closeAt: m2.closeAt, winners: r2?.winners || null }; }
  }
  return out;
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

// body: {choice, reasons} (a one-motion session) or {choices: {motion: choice}, reasons}.
export function parseBallot(body, sid = SESSION) {
  let choice;
  if (single(sid)) {
    choice = String(body?.choice || "").toLowerCase();
    if (!S(sid).motions[0].choices.includes(choice)) return { error: "Choose an application: 001 or 002. The Assembly does not accept abstentions in writing." };
  } else {
    const raw = body?.choices && typeof body.choices === "object" ? body.choices : {};
    choice = Object.fromEntries(S(sid).motions.map(m => [m.id, String(raw[m.id] || "").toLowerCase()]));
    if (!validChoice(sid, choice)) return { error: "Choose one bid for each parcel. The Assembly does not accept abstentions in writing, on either parcel." };
  }
  const raw = Array.isArray(body?.reasons) ? body.reasons.map(r => String(r).toUpperCase()) : [];
  const reasons = REASONS.filter(r => raw.includes(r));
  if (!reasons.length || reasons.length !== raw.length) return { error: `Give at least one reason from the list: ${REASONS.join(", ")}. The Department does not read free text.` };
  if (reasons.length > MAX_REASONS) return { error: `At most ${MAX_REASONS} reasons. More would be an opinion.` };
  return { choice, reasons };
}
const sameChoice = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// io: {store, getCase(caseId), hitLimit(key, max, window)}. -> {status, body}
export async function castBallot(io, { caseId, choice, reasons, ip, device, now = Date.now(), sid = SESSION }) {
  const { store } = io, K = keysOf(sid);
  const meta = await ensureSession(store, now, sid);
  if (!meta || now < meta.openAt) return { status: 403, body: { error: "The Assembly is not yet in session. Wait. You are good at waiting." } };
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
    const cur = await store.getWithMetadata(K.voter(vk), { type: "json" });
    const prev = cur?.data || null;
    if (prev && sameChoice(prev.c, choice) && prev.r.join() === reasons.join()) return { status: 200, body: { ballot: view(prev), unchanged: true } };
    if (prev && prev.rev >= LIMITS.revisions) return { status: 429, body: { error: `This file has changed its ballot ${LIMITS.revisions} times. The Department has recorded your final answer as your final answer.` } };
    if (!prev) {
      // A new voter takes a place on its address's and device's lists (one person, many
      // files: the lists are short). A change of mind costs no place.
      if (!(await claim(store, K.ip(ip), vk, LIMITS.casesPerIp))) return { status: 429, body: { error: `${LIMITS.casesPerIp} files have already voted from your location. The Department counts people, not paperwork.` } };
      if (dh && !(await claim(store, K.dev(dh), vk, LIMITS.casesPerDevice))) return { status: 429, body: { error: `${LIMITS.casesPerDevice} files have already voted from this device. One terminal, one or two citizens. Not a caucus.` } };
    }
    const ballot = { c: choice, r: reasons, rev: (prev?.rev || 0) + 1, at: new Date(now).toISOString(), ip, dev: dh };
    const res = await store.setJSON(K.voter(vk), ballot, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (!res.modified) { await sleep(3 + Math.random() * 15); continue; }
    const folded = await fold(store, { [vk]: ballot }, { now, sid });
    return { status: 200, body: { ballot: view(ballot), changed: Boolean(prev), folded } };
  }
  return { status: 409, body: { error: "Your ballot collided with itself. Submit it once. The Department only needs to hear it once." } };
}
const view = (b) => (typeof b.c === "string" ? { choice: b.c, reasons: b.r, rev: b.rev, at: b.at } : { choices: b.c, reasons: b.r, rev: b.rev, at: b.at });
export async function myBallot(store, caseId, sid = SESSION) {
  const b = await store.get(keysOf(sid).voter(voterKey(caseId)), { type: "json" });
  return b ? view(b) : null;
}

// ---- the public view --------------------------------------------------------------------------
// The session the city is on now: 001 until it closes, then 002 (opened here, dated from 001's
// close). -> {sid, meta, result} of the latest session that exists.
export async function currentSession(store, now = Date.now()) {
  const meta1 = await ensureSession(store, now);
  const result1 = await finalize(store, now, meta1);
  if (!result1) return { sid: SESSION, meta: meta1, result: null, earlier: [] };
  const meta2 = await ensureSession(store, now, "002");
  if (!meta2) return { sid: SESSION, meta: meta1, result: result1, earlier: [] };
  return { sid: "002", meta: meta2, result: await finalize(store, now, meta2, "002"), earlier: [{ sid: SESSION, meta: meta1, result: result1 }] };
}
// GET: opens a session when due, closes it when due, recounts now and then.
// source (optional): the census for THE SUBSTRATE's recount (refreshSubstrate).
export async function publicView(store, now = Date.now(), { source = null } = {}) {
  const { sid, meta, result, earlier } = await currentSession(store, now);
  let substrate = null;
  if (source && now < meta.closeAt) { try { substrate = await refreshSubstrate(store, source, { now, meta, sid }); } catch (err) { console.error("substrate recount failed", err?.message); } }
  substrate ||= await readSubstrate(store, sid).catch(() => null);
  let tally = await readTally(store, sid);
  const n = Object.keys(tally.seen).length;
  if (!result && n <= HEAL_MAX_VOTERS && now - (tally.healedAt || 0) > HEAL_EVERY_MS) {
    try { await heal(store, { now, tries: 2, sid }); tally = await readTally(store, sid); } catch { /* the next GET tries again */ }
  }
  const counts = result ? { votes: result.votes, reasons: result.reasons, all: result.all, voters: result.voters } : countsOf(tally.seen, sid);
  const first = sid === SESSION ? { meta, result } : earlier[0];
  const out = {
    session: { id: sid, openAt: meta.openAt, closeAt: meta.closeAt, now, state: now < meta.openAt ? "pending" : now < meta.closeAt ? "open" : "closed" },
    tally: counts, result: result || null,
    substrate: result ? result.substrate : single(sid) ? compactSub(substrate) : compactSubs(substrate, sid),
    civic: { closeAt: first.meta.closeAt, winner: first.result?.winner || null, resorts: sid === "002" ? { closeAt: meta.closeAt, winners: result?.winners || null } : null },
    rules: { choices: sid === SESSION ? CHOICES : S(sid).motions.flatMap(m => m.choices), motions: S(sid).motions, reasons: REASONS, maxReasons: MAX_REASONS, limits: LIMITS },
  };
  // the sessions before this one, closed: what they decided, for the record
  if (earlier.length) out.earlier = earlier.map(e => ({ session: { id: e.sid, openAt: e.meta.openAt, closeAt: e.meta.closeAt }, result: e.result }));
  return out;
}
