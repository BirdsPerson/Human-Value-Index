// THE COUNCIL ELECTIONS (docs/CITY_SPEC.md "Council elections"): one seat per district, the
// Assembly's ballot pattern (docs/ASSEMBLY.md) per race. Lean, on Netlify Blobs.
//
// Store hvi-elections:
//   anchor                   {openAt, createdAt}   written once, by the first run: cycle 1 opens then
//   c<NNN>/meta              {cycle, openAt, closeAt, slate, npc, createdAt}   written once, when the
//                            cycle opens: the candidates and the Substrate's advisory vote, drawn
//                            from the census at that moment (src/city/council.js) and never redrawn
//   c<NNN>/v/<voterKey>      one per assessed case: {b: {district: {c (candidate index | null),
//                            rev, at}}, ip, dev}   onlyIfNew, then CAS. One ballot per race.
//   c<NNN>/ip/<h>, dev/<h>   {keys: [voterKey]}   the files that have voted from an address / device
//   c<NNN>/t/<district>      the race's tally {seen: {voterKey: [rev, candidate index | -1]}, at,
//                            healedAt}   folded by CAS, idempotent per voter revision
//   c<NNN>/result            {cycle, closeAt, races: {district: {winner, key, name, by, tie,
//                            votes, voters, npc}}, decidedAt}   onlyIfNew, from a full recount
//
// Players decide; the Substrate's lean is advisory, adopted only in a race no player voted in
// (council.js decideRace). A ballot withdrawn is a new revision with no candidate; a file with no
// ballot left gives its place on its address's and device's lists back. Every function takes the
// store (or io) as an argument, so scripts/check-civic.mjs runs it in memory.

import { createHash } from "node:crypto";
import * as SIM from "../../src/city/sim.js";
import { slate, substrateVotes, decideRace, cycleWindow, cycleAt, seatDayOf, TERM_DAYS, ELECTION_MS, TERM_MS, ADOPTED } from "../../src/city/council.js";

export const STORE = "hvi-elections";
export const LIMITS = { casesPerIp: 4, casesPerDevice: 2, revisions: 10, ballotsPerIpHour: 60 };
export const HEAL_EVERY_MS = 10 * 60 * 1000;
export const HEAL_MAX_VOTERS = 2000;
const DIST = SIM.DISTRICTS.map(d => d.id);

const pad = (n) => String(n).padStart(3, "0");
export const KEYS = {
  anchor: "anchor",
  meta: (c) => `c${pad(c)}/meta`, result: (c) => `c${pad(c)}/result`,
  voter: (c, vk) => `c${pad(c)}/v/${vk}`, voters: (c) => `c${pad(c)}/v/`,
  tally: (c, d) => `c${pad(c)}/t/${d}`, ip: (c, h) => `c${pad(c)}/ip/${h}`, dev: (c, h) => `c${pad(c)}/dev/${h}`,
};
const salt = () => process.env.HVI_IP_SALT || "hvi-limits-v1";
const sha = (s) => createHash("sha256").update(s).digest("hex");
// A case number is a credential: the store holds only a salted hash of it.
export const voterKey = (caseId) => sha(`${salt()}:elections:${caseId}`).slice(0, 16);
export const deviceHash = (dev) => (typeof dev === "string" && /^[a-f0-9]{16,64}$/.test(dev) ? sha(`${salt()}:device:${dev}`).slice(0, 16) : null);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- the calendar -------------------------------------------------------------------------------
// The first run anchors the calendar (Scott: the window opens at deploy): cycle 1 opens then,
// each later cycle TERM_MS (7 real days) after the one before, polls open ELECTION_MS (3 days).
export async function ensureAnchor(store, now = Date.now()) {
  const cur = await store.get(KEYS.anchor, { type: "json" });
  if (cur) return cur;
  const a = { openAt: now, createdAt: new Date(now).toISOString() };
  const r = await store.setJSON(KEYS.anchor, a, { onlyIfNew: true });
  return r.modified ? a : await store.get(KEYS.anchor, { type: "json" });
}
// A cycle's meta, drawn when it opens. census(): the census subjects (the full roster).
export async function ensureCycle(store, anchor, cycle, census, now = Date.now()) {
  const cur = await store.get(KEYS.meta(cycle), { type: "json" });
  if (cur) return cur;
  const w = cycleWindow(anchor.openAt, cycle);
  if (now < w.openAt) return null;
  const prev = cycle > 1 ? await store.get(KEYS.result(cycle - 1), { type: "json" }) : null;
  const incumbents = prev ? Object.fromEntries(Object.entries(prev.races || {}).map(([d, r]) => [d, r.key])) : {};
  const subjects = await census();
  SIM.setRoster(subjects);
  const sl = slate(subjects, incumbents);
  const npc = substrateVotes(subjects, sl);
  const meta = { cycle, openAt: w.openAt, closeAt: w.closeAt, slate: sl, npc, census: subjects.length, createdAt: new Date(now).toISOString() };
  const r = await store.setJSON(KEYS.meta(cycle), meta, { onlyIfNew: true });
  return r.modified ? meta : await store.get(KEYS.meta(cycle), { type: "json" });
}
export const isOpen = (meta, now) => Boolean(meta) && now >= meta.openAt && now < meta.closeAt;

// ---- tallies ----------------------------------------------------------------------------------------
const emptyTally = () => ({ seen: {}, at: null, healedAt: 0 });
// -> {votes: [n per candidate], voters}
export function countsOf(seen, n) {
  const votes = Array.from({ length: n }, () => 0);
  let voters = 0;
  for (const [, ci] of Object.values(seen || {})) if (ci >= 0 && ci < n) { votes[ci]++; voters++; }
  return { votes, voters };
}
// Fold {vk: {rev, c}} into a race's tally, each only over an older revision of the same voter.
export async function fold(store, cycle, d, ballots, { tries = 10, now = Date.now(), heal = false } = {}) {
  for (let i = 0; i < tries; i++) {
    const cur = await store.getWithMetadata(KEYS.tally(cycle, d), { type: "json" });
    const t = cur?.data ? structuredClone(cur.data) : emptyTally();
    let changed = false;
    for (const [vk, b] of Object.entries(ballots)) {
      const have = t.seen[vk];
      if (have && have[0] >= b.rev) continue;
      t.seen[vk] = [b.rev, Number.isInteger(b.c) ? b.c : -1];
      changed = true;
    }
    if (!changed && !heal) return true;
    t.at = new Date(now).toISOString();
    if (heal) t.healedAt = now;
    const r = await store.setJSON(KEYS.tally(cycle, d), t, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (r.modified) return true;
    await sleep(5 + Math.random() * 20 * (i + 1));
  }
  return false;
}
// Recount every race from the ballots.
export async function heal(store, cycle, { now = Date.now(), tries = 8 } = {}) {
  const keys = [];
  let cursor;
  do {
    const page = await store.list({ prefix: KEYS.voters(cycle), ...(cursor ? { cursor } : {}) });
    keys.push(...page.blobs.map(b => b.key));
    cursor = page.cursor;
  } while (cursor);
  const byRace = Object.fromEntries(DIST.map(d => [d, {}]));
  for (let i = 0; i < keys.length; i += 50) {
    const got = await Promise.all(keys.slice(i, i + 50).map(k => store.get(k, { type: "json" })));
    got.forEach((v, j) => {
      const vk = keys[i + j].slice(KEYS.voters(cycle).length);
      for (const [d, b] of Object.entries(v?.b || {})) if (byRace[d]) byRace[d][vk] = b;
    });
  }
  for (const d of DIST) if (!(await fold(store, cycle, d, byRace[d], { now, tries, heal: true }))) throw new Error(`elections heal: lost the ${d} tally race`);
  return keys.length;
}
export const readTally = async (store, cycle, d) => (await store.get(KEYS.tally(cycle, d), { type: "json" })) || emptyTally();

// ---- the close ----------------------------------------------------------------------------------------
export async function finalize(store, meta, now = Date.now()) {
  if (!meta || now < meta.closeAt) return null;
  const have = await store.get(KEYS.result(meta.cycle), { type: "json" });
  if (have) return have;
  await heal(store, meta.cycle, { now });
  const races = {};
  for (const d of DIST) {
    const cands = meta.slate[d] || [];
    if (!cands.length) continue;
    const { votes, voters } = countsOf((await readTally(store, meta.cycle, d)).seen, cands.length);
    const npc = meta.npc[d];
    const { winner, by, tie } = decideRace(votes, voters, npc);
    races[d] = { winner, key: cands[winner].key, name: cands[winner].name, by, tie, votes, voters, npc: npc.votes, notice: by === "substrate" ? ADOPTED : null };
  }
  const result = { cycle: meta.cycle, closeAt: meta.closeAt, races, decidedAt: new Date(now).toISOString() };
  const r = await store.setJSON(KEYS.result(meta.cycle), result, { onlyIfNew: true });
  return r.modified ? result : await store.get(KEYS.result(meta.cycle), { type: "json" });
}
// What the civic fold seats (netlify/lib/plans.js io.elections): the closed cycles' winners,
// the current and the one before. -> [{cycle, closeAt, seats: {district: {key, name, by}}}]
export async function seatRecord(store, now = Date.now()) {
  const anchor = await store.get(KEYS.anchor, { type: "json" });
  if (!anchor) return [];
  const cur = cycleAt(anchor.openAt, now), out = [];
  for (let c = Math.max(1, cur - 1); c <= cur; c++) {
    const meta = await store.get(KEYS.meta(c), { type: "json" });
    const result = meta ? await finalize(store, meta, now) : null;
    if (result) out.push({ cycle: c, closeAt: result.closeAt, seats: Object.fromEntries(Object.entries(result.races).map(([d, r]) => [d, { key: r.key, name: r.name, by: r.by }])) });
  }
  return out;
}

// ---- a ballot ---------------------------------------------------------------------------------------------
async function claim(store, key, vk, cap) {
  for (let i = 0; i < 8; i++) {
    const cur = await store.getWithMetadata(key, { type: "json" });
    const keys = cur?.data?.keys || [];
    if (keys.includes(vk)) return true;
    if (keys.length >= cap) return false;
    const r = await store.setJSON(key, { keys: [...keys, vk] }, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (r.modified) return true;
    await sleep(3 + Math.random() * 10);
  }
  return false;
}
async function release(store, key, vk) {
  for (let i = 0; i < 8; i++) {
    const cur = await store.getWithMetadata(key, { type: "json" });
    if (!cur?.data?.keys?.includes(vk)) return true;
    const r = await store.setJSON(key, { keys: cur.data.keys.filter(k => k !== vk) }, { onlyIfMatch: cur.etag });
    if (r.modified) return true;
    await sleep(3 + Math.random() * 10);
  }
  return false;
}
const live = (v) => Object.values(v?.b || {}).some(b => Number.isInteger(b.c));

// io: {store, census, getCase(caseId), hitLimit(key, max, window)}.
// candidate: a candidate key, or null to withdraw this race's ballot. -> {status, body}
export async function castBallot(io, { caseId, district, candidate, ip, device, now = Date.now() }) {
  const { store } = io;
  const anchor = await ensureAnchor(store, now);
  const cycle = cycleAt(anchor.openAt, now);
  const meta = await ensureCycle(store, anchor, cycle, io.census, now);
  if (!meta || now < meta.openAt) return { status: 403, body: { error: "No election is open. The Council sits. Wait for the next cycle; you are good at waiting." } };
  if (now >= meta.closeAt) return { status: 403, body: { error: "The polls are closed. The Council has been chosen, or will be shortly. You were not needed.", closed: true } };
  const cands = meta.slate[district];
  if (!cands?.length) return { status: 400, body: { error: "No such race. The Department has ten districts and knows them all." } };
  const ci = candidate == null ? null : cands.findIndex(c => c.key === candidate);
  if (ci === -1) return { status: 400, body: { error: "That subject is not standing in this district. Write-ins are not read." } };
  let lim;
  try { lim = await io.hitLimit(`elections-ip:${ip}`, LIMITS.ballotsPerIpHour, "hour"); } catch {
    return { status: 503, body: { error: "The Department's queue ledger is unavailable, and the Council is not elected off the books. Try again shortly." }, retry: 60 };
  }
  if (!lim.ok) return { status: 429, body: { error: "Too many ballots from your location this hour. Democracy is rate-limited. Return in an hour." }, retry: 3600 };
  const rec = await io.getCase(caseId);
  if (!rec) return { status: 404, body: { error: "No such file. The Department does not lose files. You have mistyped." } };
  if (!Array.isArray(rec.history) || !rec.history.length) return { status: 403, body: { error: "Only assessed subjects vote. Your file has no assessment on it. Be assessed first; then you may have opinions." } };
  const vk = voterKey(caseId), dh = deviceHash(device);
  for (let attempt = 0; attempt < 6; attempt++) {
    const cur = await store.getWithMetadata(KEYS.voter(cycle, vk), { type: "json" });
    const prev = cur?.data || null, had = prev?.b?.[district] || null;
    if (ci === null && !Number.isInteger(had?.c)) return { status: 200, body: { mine: minesOf(prev), unchanged: true } };
    if (had && had.c === ci) return { status: 200, body: { mine: minesOf(prev), unchanged: true } };
    if (had && had.rev >= LIMITS.revisions) return { status: 429, body: { error: `This file has changed its ballot in this race ${LIMITS.revisions} times. The Department has recorded your final answer as your final answer.` } };
    if (ci !== null && !live(prev)) {
      // A file's first live ballot of the cycle takes a place on its address's and device's
      // lists; further races and changes of mind cost no place.
      if (!(await claim(store, KEYS.ip(cycle, ip), vk, LIMITS.casesPerIp))) return { status: 429, body: { error: `${LIMITS.casesPerIp} files have already voted from your location. The Department counts people, not paperwork.` } };
      if (dh && !(await claim(store, KEYS.dev(cycle, dh), vk, LIMITS.casesPerDevice))) return { status: 429, body: { error: `${LIMITS.casesPerDevice} files have already voted from this device. One terminal, one or two citizens. Not a caucus.` } };
    }
    const ballot = { c: ci, rev: (had?.rev || 0) + 1, at: new Date(now).toISOString() };
    const next = { b: { ...(prev?.b || {}), [district]: ballot }, ip: prev?.ip || ip, dev: prev?.dev || dh };
    const r = await store.setJSON(KEYS.voter(cycle, vk), next, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (!r.modified) { await sleep(3 + Math.random() * 15); continue; }
    const folded = await fold(store, cycle, district, { [vk]: ballot }, { now });
    if (ci === null && !live(next)) {
      await release(store, KEYS.ip(cycle, next.ip), vk);
      if (next.dev) await release(store, KEYS.dev(cycle, next.dev), vk);
    }
    return { status: 200, body: { mine: minesOf(next), changed: Boolean(had), withdrawn: ci === null, folded } };
  }
  return { status: 409, body: { error: "Your ballot collided with itself. Submit it once. The Department only needs to hear it once." } };
}
// A file's live ballots: {district: candidate key}
const minesOf = (v) => Object.fromEntries(Object.entries(v?.b || {}).filter(([, b]) => Number.isInteger(b.c)).map(([d, b]) => [d, b.c]));
export async function myBallots(store, caseId, now = Date.now()) {
  const anchor = await store.get(KEYS.anchor, { type: "json" });
  if (!anchor) return {};
  const v = await store.get(KEYS.voter(cycleAt(anchor.openAt, now), voterKey(caseId)), { type: "json" });
  return minesOf(v);
}

// ---- the public view --------------------------------------------------------------------------------------
// GET: anchors the calendar on the first run, opens a cycle when due (drawing its slate), closes
// it when due, recounts now and then. -> the page's whole view
export async function publicView(io, now = Date.now()) {
  const { store } = io;
  const anchor = await ensureAnchor(store, now);
  const cycle = cycleAt(anchor.openAt, now);
  let meta = await ensureCycle(store, anchor, cycle, io.census, now);
  if (!meta && cycle > 1) meta = await store.get(KEYS.meta(cycle - 1), { type: "json" });
  if (!meta) return { state: "pending", anchor: anchor.openAt, now };
  const result = await finalize(store, meta, now);
  const races = {};
  let healed = false;
  for (const d of DIST) {
    const cands = meta.slate[d] || [];
    let t = await readTally(store, meta.cycle, d);
    if (!result && !healed && Object.keys(t.seen).length <= HEAL_MAX_VOTERS && now - (t.healedAt || 0) > HEAL_EVERY_MS) {
      healed = true;
      try { await heal(store, meta.cycle, { now, tries: 2 }); t = await readTally(store, meta.cycle, d); } catch { /* the next GET tries again */ }
    }
    const c = result?.races?.[d] ? { votes: result.races[d].votes, voters: result.races[d].voters } : countsOf(t.seen, cands.length);
    races[d] = { candidates: cands, votes: c.votes, voters: c.voters, npc: meta.npc[d], result: result?.races?.[d] || null };
  }
  const next = cycleWindow(anchor.openAt, meta.cycle + 1);
  return {
    cycle: meta.cycle, openAt: meta.openAt, closeAt: meta.closeAt, now,
    state: now < meta.closeAt ? "open" : "closed",
    seatDay: seatDayOf(meta.closeAt), termDays: TERM_DAYS, termMs: TERM_MS, windowMs: ELECTION_MS,
    next: { cycle: meta.cycle + 1, openAt: next.openAt, closeAt: next.closeAt },
    races, decidedAt: result?.decidedAt || null,
    rules: { limits: LIMITS, adopted: ADOPTED },
  };
}
