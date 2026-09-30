// THE COUNCIL ELECTIONS (docs/CITY_SPEC.md "Council elections"): one seat per district, the
// Assembly's ballot pattern (docs/ASSEMBLY.md) per race. Lean, on Netlify Blobs.
//
// Store hvi-elections:
//   anchor                   {openAt, createdAt}   written once, by the first run: cycle 1 opens then
//   c<NNN>/meta              {cycle, openAt, closeAt, slate, npc, createdAt}   written once, when the
//                            cycle opens: the candidates and the Substrate's advisory vote, drawn
//                            from the census at that moment (src/city/council.js) and never redrawn
//   c<NNN>/v/<voterKey>      one per assessed case: {b: {district: {c (candidate index | null),
//                            w (a write-in's key), wn, wl (its name, living), rev, at}}, ip, dev}
//                            onlyIfNew, then CAS. One ballot per race: a listed candidate OR a
//                            write-in (c null, w set); c null and no w is a withdrawn ballot.
//   c<NNN>/ip/<h>, dev/<h>   {keys: [voterKey]}   the files that have voted from an address / device
//   c<NNN>/t/<district>      the race's tally {seen: {voterKey: [rev, candidate index | write-in
//                            key | -1]}, w: {key: {n, l}}, at, healedAt}   folded by CAS,
//                            idempotent per voter revision
//   c<NNN>/result            {cycle, closeAt, races: {district: {winner, key, name, by, tie,
//                            votes, voters, npc, writein, writeins, writeinOther, order}},
//                            decidedAt}   onlyIfNew, from a full recount. order: the whole
//                            ranking [[key, name]], so a seat declined goes to the runner-up.
//   c<NNN>/resign            {district: [key]}: a player citizen elected who declined or resigned
//                            the seat (from MY FILE). CAS.
//   c<NNN>/decl/<voterKey>   a file's candidacy: {d: {district: at}, key (its citizen), rev, ip,
//                            dev}. CAS. rev counts every declare and withdraw (LIMITS.declarations).
//   c<NNN>/cands             {by: {district: {voterKey: citizen key}}}: who has declared where. CAS.
//                            Never served: the public view carries counts and citizen keys only.
//   c<NNN>/dip/<h>, ddev/<h> {keys: [voterKey]}   the files that have declared from an address / device
//
// WRITE-INS (docs/CITY_SPEC.md "Council elections"): a ballot may name any subject on file who
// lives or works in the district, or the voter's own citizen, never free text. Excluded: every
// file closed to opinion (petition.js: harm findings made or pending, gated or serious-cap,
// withheld verdicts, real-world candidates, local officials), other players' citizens, and
// whoever is already on a slate. The refusal is neutral. A write-in with WRITEIN_SHOW ballots
// joins the board; below that it is counted as a number.
//
// CANDIDACY: a player whose citizen lives or works in a district may DECLARE there (assessed, no
// harm finding, on the census). A declared citizen may then be written in by any file, shown only
// as SUBJECT and its tag with no statement. Withdrawable until the close; a later harm finding
// withdraws it (intake-score.js). Ballots already cast for a citizen who withdraws still count.
//
// Players decide; the Substrate's lean is advisory, adopted only in a race no player voted in
// (council.js decideRace). A ballot withdrawn is a new revision with no candidate; a file with no
// ballot left gives its place on its address's and device's lists back. Every function takes the
// store (or io) as an argument, so scripts/check-civic.mjs runs it in memory.

import { createHash } from "node:crypto";
import * as SIM from "../../src/city/sim.js";
import { slate, substrateVotes, decideRace, rankRace, mayStand, cycleWindow, cycleAt, seatDayOf, machineDayAt, TERM_DAYS, ELECTION_MS, TERM_MS, ADOPTED, PLATFORMS } from "../../src/city/council.js";
import { WRITEIN_SHOW } from "../../src/elections/content.js";
import { buildIndex, searchIndex } from "../../src/city/find.js";
import { displayName } from "../../src/figures.js";
import { effectivelyGated, seriousHarm } from "./intake.js";

export const STORE = "hvi-elections";
export const LIMITS = { casesPerIp: 4, casesPerDevice: 2, revisions: 10, ballotsPerIpHour: 60, declarations: 10 };
export const HEAL_EVERY_MS = 10 * 60 * 1000;
export const HEAL_MAX_VOTERS = 2000;
export { WRITEIN_SHOW };
export const WRITEIN_HITS = 8;
export const DECLINED = "THE SUBJECT ELECTED DECLINED THE SEAT. THE RUNNER-UP SERVES THE TERM.";
const DIST = SIM.DISTRICTS.map(d => d.id);

const pad = (n) => String(n).padStart(3, "0");
export const KEYS = {
  anchor: "anchor",
  meta: (c) => `c${pad(c)}/meta`, result: (c) => `c${pad(c)}/result`,
  voter: (c, vk) => `c${pad(c)}/v/${vk}`, voters: (c) => `c${pad(c)}/v/`,
  tally: (c, d) => `c${pad(c)}/t/${d}`, resign: (c) => `c${pad(c)}/resign`, ip: (c, h) => `c${pad(c)}/ip/${h}`, dev: (c, h) => `c${pad(c)}/dev/${h}`,
  decl: (c, vk) => `c${pad(c)}/decl/${vk}`, cands: (c) => `c${pad(c)}/cands`, dip: (c, h) => `c${pad(c)}/dip/${h}`, ddev: (c, h) => `c${pad(c)}/ddev/${h}`,
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
// -> {votes: [n per candidate], voters (listed and write-in ballots), writeins: {key: n}}
export function countsOf(seen, n) {
  const votes = Array.from({ length: n }, () => 0), writeins = {};
  let voters = 0;
  for (const [, ci] of Object.values(seen || {})) {
    if (Number.isInteger(ci)) { if (ci >= 0 && ci < n) { votes[ci]++; voters++; } }
    else if (typeof ci === "string" && ci) { writeins[ci] = (writeins[ci] || 0) + 1; voters++; }
  }
  return { votes, voters, writeins };
}
// A ballot's choice as the tally keeps it: a candidate index, a write-in's key, or -1.
const choiceOf = (b) => (Number.isInteger(b?.c) ? b.c : typeof b?.w === "string" && b.w ? b.w : -1);
const liveBallot = (b) => choiceOf(b) !== -1;
// The write-ins on the board (WRITEIN_SHOW ballots or more) and the rest as a number.
export function writeinBoard(writeins, names = {}) {
  const shown = [];
  let other = 0;
  for (const [key, votes] of Object.entries(writeins || {})) {
    if (votes >= WRITEIN_SHOW) {
      const living = names[key]?.l !== false;
      shown.push({ key, name: names[key]?.n || key, living, platform: living ? null : PLATFORMS[key] || null, citizen: isCitizenKey(key), votes });
    } else other += votes;
  }
  shown.sort((a, b) => b.votes - a.votes || (a.key < b.key ? -1 : 1));
  return { writeins: shown, writeinOther: other };
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
      t.seen[vk] = [b.rev, choiceOf(b)];
      if (typeof b.w === "string" && b.w) { t.w = t.w || {}; if (!t.w[b.w]) t.w[b.w] = { n: String(b.wn || b.w), l: b.wl !== false }; }
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
  const races = {}, taken = new Set();
  for (const d of DIST) {
    const cands = meta.slate[d] || [];
    if (!cands.length) continue;
    const t = await readTally(store, meta.cycle, d);
    const { votes, voters, writeins } = countsOf(t.seen, cands.length);
    const npc = meta.npc[d];
    const { by, tie } = decideRace(votes, voters, npc, writeins);
    // The ranking, whole: the seat goes to its first who holds no other seat this cycle (a
    // write-in may live in one district and work in another); a declined seat to the next.
    const order = rankRace(votes, voters, npc, writeins).map(id => (Number.isInteger(id) ? [cands[id].key, cands[id].name] : [id, t.w?.[id]?.n || id]));
    const [key, name] = order.find(([k]) => !taken.has(k)) || order[0];
    taken.add(key);
    const ci = cands.findIndex(c => c.key === key);
    races[d] = { winner: ci >= 0 ? ci : null, key, name, by, tie, votes, voters, npc: npc.votes, notice: by === "substrate" ? ADOPTED : null,
      writein: ci < 0, ...writeinBoard(writeins, t.w), order };
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
    if (result) {
      const seated = seatedOf(result, await readResigned(store, c));
      out.push({ cycle: c, closeAt: result.closeAt, seats: Object.fromEntries(Object.entries(seated).map(([d, r]) => [d, { key: r.key, name: r.name, by: r.by }])) });
    }
  }
  return out;
}

// Who sits for each race of a closed cycle, after any seat declined: the first of the race's
// ranking not declined and not seated in an earlier race. -> {district: {key, name, by, declined}}
export function seatedOf(result, resigned = {}) {
  const out = {}, taken = new Set();
  for (const d of DIST) {
    const r = result?.races?.[d];
    if (!r) continue;
    const gone = new Set(resigned[d] || []);
    const order = Array.isArray(r.order) && r.order.length ? r.order : [[r.key, r.name]];
    const pick = order.find(([k]) => !gone.has(k) && !taken.has(k));
    if (!pick) continue;
    taken.add(pick[0]);
    out[d] = { key: pick[0], name: pick[1], by: r.by, declined: pick[0] !== r.key };
  }
  return out;
}
export const readResigned = async (store, cycle) => (await store.get(KEYS.resign(cycle), { type: "json" })) || {};

// ---- write-ins ------------------------------------------------------------------------------------
// A player's citizen is keyed by its case number's last four (intake-score.js putPenCard);
// its public name is SUBJECT and that tag. The case number itself is never stored or shown.
export const citizenKeyOf = (caseId) => `citizen-${String(caseId || "").slice(-4).toLowerCase()}`;
export const isCitizenKey = (k) => /^citizen-/.test(String(k || ""));
const citizenName = (key) => `Subject ${key.slice(8).toUpperCase()}`;
const homeDistrict = (s) => SIM.PLACES[SIM.homeOf(s)]?.district || null;
export const districtsOf = (s) => [...new Set([SIM.assignJob(s).district, homeDistrict(s)].filter(Boolean))];
const harmed = (b, review = null) => Boolean(b && (effectivelyGated(b, review) || seriousHarm(b)));
// May a figure on file be written in? closed: the keys petition.js closedToOpinion closes
// (read from the full files, which carry what the census drops).
export function mayWriteIn(s, closed) {
  if (!mayStand(s)) return false;   // citizens, local officials, real-world candidates
  if (closed?.has(SIM.keyOf(s))) return false;
  if (s.underReview || s.noDangle || s.harmReview || s.harmReviewPending) return false;
  return !harmed(s.breakdown, s.harmReview);
}
// The write-in pool for a cycle, from the census: per district, the eligible figures who live
// or work there (never anyone on the slate), and the census's citizens (for the voter's own).
export function writeinPool(subjects, meta, closed) {
  SIM.setRoster(subjects);
  const listed = new Set(Object.values(meta?.slate || {}).flat().map(c => c.key));
  const byDistrict = Object.fromEntries(DIST.map(d => [d, []])), citizens = new Map();
  for (const s of subjects) {
    const key = SIM.keyOf(s);
    if (s.kind === "citizen") { citizens.set(key, s); continue; }
    if (listed.has(key) || !mayWriteIn(s, closed)) continue;
    for (const d of districtsOf(s)) byDistrict[d]?.push(s);
  }
  return { cycle: meta?.cycle ?? null, byDistrict, citizens, closed: closed || new Set(), idx: {}, keys: {} };
}
// The voter's own citizen as a write-in: assessed, never harm-flagged, standing where it lives
// or works. -> {key, name, districts, s} | null
export function selfWriteIn(pool, caseId, rec) {
  const hs = (rec?.history || []).filter(h => h && !h.voided), last = hs[hs.length - 1];
  if (!last || harmed(last.breakdown, rec?.harmReview) || rec?.harmReviewPending) return null;
  const key = citizenKeyOf(caseId), name = citizenName(key);
  const s = { ...(pool.citizens.get(key) || { slug: key, kind: "citizen", score: last.score, tier: last.tier }), name, you: true };
  return { key, name, s, districts: districtsOf(s) };
}
// The citizens declared in a race who may be written in by anyone: on the census, living or
// working there, not closed. keys: the citizen keys declared there (readCands). -> [{key, name, s}]
export function declaredIn(pool, district, keys = []) {
  const out = [];
  for (const key of new Set(keys)) {
    const s = pool.citizens.get(key);
    if (!s || pool.closed?.has(key) || !districtsOf(s).includes(district)) continue;
    const name = citizenName(key);
    out.push({ key, name, s: { ...s, name, declared: true } });
  }
  return out;
}
// Type-ahead over a race's pool (find.js: accents off, whole name, then starts, then words), the
// citizens declared there and the voter's own. -> [{key, name, living, self, declared}]
export function writeinSearch(pool, district, q, self = null, { n = WRITEIN_HITS, declared = [] } = {}) {
  if (!pool.byDistrict[district]) return [];
  pool.idx[district] = pool.idx[district] || buildIndex(pool.byDistrict[district]);
  const mine = self && self.districts.includes(district) ? buildIndex([self.s]) : [];
  const others = declaredIn(pool, district, declared).filter(x => x.key !== self?.key);
  const decl = new Set(declared);
  return searchIndex([...mine, ...buildIndex(others.map(x => x.s)), ...pool.idx[district]], String(q || "").slice(0, 80), n)
    .map(e => (isCitizenKey(e.key)
      ? { key: e.key, name: citizenName(e.key), living: true, self: Boolean(e.s.you), declared: decl.has(e.key) }
      : { key: e.key, name: e.name, living: !SIM.isDead(e.s), self: false, declared: false }));
}
// A write-in checked against the pool: -> {key, name, living} | null (the refusal is neutral).
// declared: the citizen keys declared in this race (readCands); only those, or yourself.
export function writeinFor(pool, district, key, self = null, declared = []) {
  if (typeof key !== "string" || !key) return null;
  if (self && key === self.key) return self.districts.includes(district) ? { key, name: self.name, living: true } : null;
  if (isCitizenKey(key)) {
    const x = declaredIn(pool, district, declared.filter(k => k === key))[0];
    return x ? { key, name: x.name, living: true } : null;
  }
  if (!pool.byDistrict[district]) return null;
  if (!pool.keys[district]) pool.keys[district] = new Map(pool.byDistrict[district].map(s => [SIM.keyOf(s), s]));
  const s = pool.keys[district].get(key);
  return s ? { key, name: displayName(s), living: !SIM.isDead(s) } : null;
}
export const WRITEIN_REFUSED = "That subject cannot be written in here. The Department does not say why.";

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
const live = (v) => Object.values(v?.b || {}).some(liveBallot);

// io: {store, census, getCase(caseId), hitLimit(key, max, window), writeins(meta) -> the pool}.
// candidate: a candidate key, or null to withdraw this race's ballot; writein: a write-in's key
// (instead of a candidate). -> {status, body}
export async function castBallot(io, { caseId, district, candidate, writein = null, ip, device, now = Date.now() }) {
  const { store } = io;
  const anchor = await ensureAnchor(store, now);
  const cycle = cycleAt(anchor.openAt, now);
  const meta = await ensureCycle(store, anchor, cycle, io.census, now);
  if (!meta || now < meta.openAt) return { status: 403, body: { error: "No election is open. The Council sits. Wait for the next cycle; you are good at waiting." } };
  if (now >= meta.closeAt) return { status: 403, body: { error: "The polls are closed. The Council has been chosen, or will be shortly. You were not needed.", closed: true } };
  const cands = meta.slate[district];
  if (!cands?.length) return { status: 400, body: { error: "No such race. The Department has ten districts and knows them all." } };
  if (candidate != null && writein != null) return { status: 400, body: { error: "One name per ballot. The Department does not accept a shortlist." } };
  // a write-in who is on this race's slate is simply a vote for that candidate
  if (writein != null && cands.some(c => c.key === writein)) { candidate = writein; writein = null; }
  const ci = candidate == null ? null : cands.findIndex(c => c.key === candidate);
  if (ci === -1) return { status: 400, body: { error: "That subject is not standing in this district. To name someone else, use the write-in." } };
  let lim;
  try { lim = await io.hitLimit(`elections-ip:${ip}`, LIMITS.ballotsPerIpHour, "hour"); } catch {
    return { status: 503, body: { error: "The Department's queue ledger is unavailable, and the Council is not elected off the books. Try again shortly." }, retry: 60 };
  }
  if (!lim.ok) return { status: 429, body: { error: "Too many ballots from your location this hour. Democracy is rate-limited. Return in an hour." }, retry: 3600 };
  const rec = await io.getCase(caseId);
  if (!rec) return { status: 404, body: { error: "No such file. The Department does not lose files. You have mistyped." } };
  if (!Array.isArray(rec.history) || !rec.history.length) return { status: 403, body: { error: "Only assessed subjects vote. Your file has no assessment on it. Be assessed first; then you may have opinions." } };
  let wi = null;
  if (writein != null) {
    let pool;
    try { pool = await io.writeins(meta); } catch {
      return { status: 503, body: { error: "The census is briefly unavailable, and the Department does not take write-ins on trust. Try again shortly." }, retry: 60 };
    }
    const declared = isCitizenKey(writein) ? Object.values((await readCands(store, cycle))[district] || {}) : [];
    wi = writeinFor(pool, district, String(writein), selfWriteIn(pool, caseId, rec), declared);
    if (!wi) return { status: 400, body: { error: WRITEIN_REFUSED } };
  }
  const vk = voterKey(caseId), dh = deviceHash(device);
  for (let attempt = 0; attempt < 6; attempt++) {
    const cur = await store.getWithMetadata(KEYS.voter(cycle, vk), { type: "json" });
    const prev = cur?.data || null, had = prev?.b?.[district] || null;
    const same = wi ? had?.w === wi.key && !Number.isInteger(had?.c) : ci === null ? !liveBallot(had) : had?.c === ci;
    if (same) return { status: 200, body: { mine: minesOf(prev), mineWrite: writesOf(prev), unchanged: true } };
    if (had && had.rev >= LIMITS.revisions) return { status: 429, body: { error: `This file has changed its ballot in this race ${LIMITS.revisions} times. The Department has recorded your final answer as your final answer.` } };
    if ((ci !== null || wi) && !live(prev)) {
      // A file's first live ballot of the cycle takes a place on its address's and device's
      // lists; further races and changes of mind cost no place.
      if (!(await claim(store, KEYS.ip(cycle, ip), vk, LIMITS.casesPerIp))) return { status: 429, body: { error: `${LIMITS.casesPerIp} files have already voted from your location. The Department counts people, not paperwork.` } };
      if (dh && !(await claim(store, KEYS.dev(cycle, dh), vk, LIMITS.casesPerDevice))) return { status: 429, body: { error: `${LIMITS.casesPerDevice} files have already voted from this device. One terminal, one or two citizens. Not a caucus.` } };
    }
    const ballot = wi ? { c: null, w: wi.key, wn: wi.name, wl: wi.living, rev: (had?.rev || 0) + 1, at: new Date(now).toISOString() }
      : { c: ci, rev: (had?.rev || 0) + 1, at: new Date(now).toISOString() };
    const next = { b: { ...(prev?.b || {}), [district]: ballot }, ip: prev?.ip || ip, dev: prev?.dev || dh };
    const r = await store.setJSON(KEYS.voter(cycle, vk), next, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (!r.modified) { await sleep(3 + Math.random() * 15); continue; }
    const folded = await fold(store, cycle, district, { [vk]: ballot }, { now });
    if (ci === null && !wi && !live(next)) {
      await release(store, KEYS.ip(cycle, next.ip), vk);
      if (next.dev) await release(store, KEYS.dev(cycle, next.dev), vk);
    }
    return { status: 200, body: { mine: minesOf(next), mineWrite: writesOf(next), changed: liveBallot(had), withdrawn: ci === null && !wi, folded } };
  }
  return { status: 409, body: { error: "Your ballot collided with itself. Submit it once. The Department only needs to hear it once." } };
}
// A file's live ballots: mine {district: candidate index | write-in key}; mineWrite {district:
// {key, name}} for its write-ins.
const minesOf = (v) => Object.fromEntries(Object.entries(v?.b || {}).filter(([, b]) => liveBallot(b)).map(([d, b]) => [d, choiceOf(b)]));
const writesOf = (v) => Object.fromEntries(Object.entries(v?.b || {}).filter(([, b]) => !Number.isInteger(b.c) && typeof b.w === "string" && b.w).map(([d, b]) => [d, { key: b.w, name: b.wn || b.w }]));
export async function myBallots(store, caseId, now = Date.now()) {
  const anchor = await store.get(KEYS.anchor, { type: "json" });
  if (!anchor) return { mine: {}, mineWrite: {} };
  const v = await store.get(KEYS.voter(cycleAt(anchor.openAt, now), voterKey(caseId)), { type: "json" });
  return { mine: minesOf(v), mineWrite: writesOf(v) };
}
// The seats this file's citizen was elected to (the current cycle and the one before, not
// declined). -> [{cycle, district, name, seatDay, termEnd, sworn}]
export async function mySeats(store, caseId, now = Date.now()) {
  const anchor = await store.get(KEYS.anchor, { type: "json" });
  if (!anchor) return [];
  const key = citizenKeyOf(caseId), cur = cycleAt(anchor.openAt, now), out = [];
  for (let c = Math.max(1, cur - 1); c <= cur; c++) {
    const result = await store.get(KEYS.result(c), { type: "json" });
    if (!result) continue;
    for (const [d, x] of Object.entries(seatedOf(result, await readResigned(store, c)))) {
      if (x.key !== key) continue;
      const seatDay = seatDayOf(result.closeAt);
      out.push({ cycle: c, district: d, districtName: SIM.DISTRICT[d]?.name || d, name: x.name, seatDay, termEnd: seatDay + TERM_DAYS - 1, sworn: machineDayAt(now) >= seatDay });
    }
  }
  return out;
}
// A player citizen elected declines (before it is sworn in) or resigns (during the term): the
// seat goes to the race's runner-up for the rest of the term. -> {status, body}
export async function resignSeat(io, { caseId, cycle, district, ip, now = Date.now() }) {
  const { store } = io;
  let lim;
  try { lim = await io.hitLimit(`elections-ip:${ip}`, LIMITS.ballotsPerIpHour, "hour"); } catch {
    return { status: 503, body: { error: "The Department's queue ledger is unavailable. Resignations are not accepted off the books. Try again shortly." }, retry: 60 };
  }
  if (!lim.ok) return { status: 429, body: { error: "Too many requests from your location this hour. Return in an hour." }, retry: 3600 };
  const rec = await io.getCase(caseId);
  if (!rec) return { status: 404, body: { error: "No such file. The Department does not lose files. You have mistyped." } };
  const mine = await mySeats(store, caseId, now);
  if (!mine.some(x => x.cycle === cycle && x.district === district)) return { status: 403, body: { error: "This file holds no such seat. The Department cannot accept the resignation of a stranger." } };
  const key = citizenKeyOf(caseId);
  for (let i = 0; i < 8; i++) {
    const cur = await store.getWithMetadata(KEYS.resign(cycle), { type: "json" });
    const r = structuredClone(cur?.data || {});
    r[district] = [...new Set([...(r[district] || []), key])];
    const w = await store.setJSON(KEYS.resign(cycle), r, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (w.modified) {
      const result = await store.get(KEYS.result(cycle), { type: "json" });
      const next = seatedOf(result, r)[district] || null;
      return { status: 200, body: { resigned: true, cycle, district, successor: next ? next.name : null } };
    }
    await sleep(3 + Math.random() * 10);
  }
  return { status: 409, body: { error: "Your resignation collided with itself. Submit it once." } };
}

// ---- candidacy ------------------------------------------------------------------------------------------------
export const DECLARE_REFUSED = "The Department cannot accept this filing here. It does not say why.";
export const readCands = async (store, cycle) => (await store.get(KEYS.cands(cycle), { type: "json" }))?.by || {};
const declaredOf = (v) => Object.keys(v?.d || {});
// Add (key) or drop (key null) a file's entry in a race's list of the declared.
async function setCand(store, cycle, d, vk, key) {
  for (let i = 0; i < 10; i++) {
    const cur = await store.getWithMetadata(KEYS.cands(cycle), { type: "json" });
    const by = structuredClone(cur?.data?.by || {});
    const race = by[d] || {};
    if (key ? race[vk] === key : !(vk in race)) return true;
    if (key) race[vk] = key; else delete race[vk];
    by[d] = race;
    if (!Object.keys(race).length) delete by[d];
    const r = await store.setJSON(KEYS.cands(cycle), { by }, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (r.modified) return true;
    await sleep(3 + Math.random() * 15);
  }
  return false;
}
// The file's own citizen, if it may declare: assessed, no harm finding, on the census.
// -> {key, name, districts} | null
function mayDeclare(pool, caseId, rec) {
  const self = selfWriteIn(pool, caseId, rec);
  if (!self || !pool.citizens.has(self.key) || pool.closed?.has(self.key)) return null;
  return { key: self.key, name: self.name, districts: districtsOf(pool.citizens.get(self.key)) };
}
// io as castBallot. withdraw: true to take the candidacy back. -> {status, body}
export async function declareCandidacy(io, { caseId, district, withdraw = false, ip, device, now = Date.now() }) {
  const { store } = io;
  const anchor = await ensureAnchor(store, now);
  const cycle = cycleAt(anchor.openAt, now);
  const meta = await ensureCycle(store, anchor, cycle, io.census, now);
  if (!meta || now < meta.openAt) return { status: 403, body: { error: "No election is open. There is nothing to stand in. Wait for the next cycle." } };
  if (now >= meta.closeAt) return { status: 403, body: { error: "The polls are closed. Candidacies are closed with them.", closed: true } };
  if (!meta.slate[district]?.length) return { status: 400, body: { error: "No such race. The Department has ten districts and knows them all." } };
  let lim;
  try { lim = await io.hitLimit(`elections-ip:${ip}`, LIMITS.ballotsPerIpHour, "hour"); } catch {
    return { status: 503, body: { error: "The Department's queue ledger is unavailable, and candidacies are not filed off the books. Try again shortly." }, retry: 60 };
  }
  if (!lim.ok) return { status: 429, body: { error: "Too many filings from your location this hour. Return in an hour." }, retry: 3600 };
  const rec = await io.getCase(caseId);
  if (!rec) return { status: 404, body: { error: "No such file. The Department does not lose files. You have mistyped." } };
  if (!Array.isArray(rec.history) || !rec.history.length) return { status: 403, body: { error: "Only assessed subjects stand. Your file has no assessment on it. Be assessed first." } };
  let me = null;
  if (!withdraw) {
    let pool;
    try { pool = await io.writeins(meta); } catch {
      return { status: 503, body: { error: "The census is briefly unavailable, and the Department does not take candidacies on trust. Try again shortly." }, retry: 60 };
    }
    me = mayDeclare(pool, caseId, rec);
    if (!me || !me.districts.includes(district)) return { status: 403, body: { error: DECLARE_REFUSED } };
  }
  const vk = voterKey(caseId), dh = deviceHash(device), key = citizenKeyOf(caseId);
  for (let attempt = 0; attempt < 6; attempt++) {
    const cur = await store.getWithMetadata(KEYS.decl(cycle, vk), { type: "json" });
    const prev = cur?.data || null, has = Boolean(prev?.d?.[district]);
    if (has === !withdraw) return { status: 200, body: { declared: declaredOf(prev), key, name: citizenName(key), unchanged: true } };
    if ((prev?.rev || 0) >= LIMITS.declarations) return { status: 429, body: { error: `This file has filed and withdrawn ${LIMITS.declarations} times this cycle. The Department has stopped taking its paperwork.` } };
    if (!withdraw && !declaredOf(prev).length) {
      if (!(await claim(store, KEYS.dip(cycle, ip), vk, LIMITS.casesPerIp))) return { status: 429, body: { error: `${LIMITS.casesPerIp} files have already declared from your location. The Department counts people, not paperwork.` } };
      if (dh && !(await claim(store, KEYS.ddev(cycle, dh), vk, LIMITS.casesPerDevice))) return { status: 429, body: { error: `${LIMITS.casesPerDevice} files have already declared from this device. One terminal, one or two candidates.` } };
    }
    const d = { ...(prev?.d || {}) };
    if (withdraw) delete d[district]; else d[district] = new Date(now).toISOString();
    const next = { d, key, rev: (prev?.rev || 0) + 1, ip: prev?.ip || ip, dev: prev?.dev || dh };
    const r = await store.setJSON(KEYS.decl(cycle, vk), next, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (!r.modified) { await sleep(3 + Math.random() * 15); continue; }
    await setCand(store, cycle, district, vk, withdraw ? null : key);
    if (!Object.keys(d).length) {
      await release(store, KEYS.dip(cycle, next.ip), vk);
      if (next.dev) await release(store, KEYS.ddev(cycle, next.dev), vk);
    }
    return { status: 200, body: { declared: Object.keys(d), key, name: citizenName(key), withdrawn: withdraw } };
  }
  return { status: 409, body: { error: "Your filing collided with itself. Submit it once." } };
}
// A harm finding on a file withdraws every candidacy it holds this cycle (intake-score.js).
// Costs no revision. -> the districts withdrawn
export async function dropCandidacy(store, caseId, now = Date.now()) {
  const anchor = await store.get(KEYS.anchor, { type: "json" });
  if (!anchor) return [];
  const cycle = cycleAt(anchor.openAt, now), vk = voterKey(caseId);
  for (let i = 0; i < 6; i++) {
    const cur = await store.getWithMetadata(KEYS.decl(cycle, vk), { type: "json" });
    const gone = declaredOf(cur?.data);
    if (!gone.length) return [];
    const r = await store.setJSON(KEYS.decl(cycle, vk), { ...cur.data, d: {} }, { onlyIfMatch: cur.etag });
    if (!r.modified) { await sleep(3 + Math.random() * 15); continue; }
    for (const d of gone) await setCand(store, cycle, d, vk, null);
    await release(store, KEYS.dip(cycle, cur.data.ip), vk);
    if (cur.data.dev) await release(store, KEYS.ddev(cycle, cur.data.dev), vk);
    return gone;
  }
  return [];
}
// MY FILE's candidacy panel: where this file's citizen may stand and where it has declared.
// -> {open, key, name, districts: [{id, name, declared, may}]}
export async function myCandidacy(io, caseId, now = Date.now()) {
  const { store } = io;
  const anchor = await store.get(KEYS.anchor, { type: "json" });
  const meta = anchor ? await store.get(KEYS.meta(cycleAt(anchor.openAt, now)), { type: "json" }) : null;
  if (!isOpen(meta, now)) return { open: false, districts: [] };
  const rec = await io.getCase(caseId);
  if (!rec) return { open: true, districts: [] };
  const key = citizenKeyOf(caseId);
  const [pool, v] = await Promise.all([io.writeins(meta), store.get(KEYS.decl(meta.cycle, voterKey(caseId)), { type: "json" })]);
  const me = mayDeclare(pool, caseId, rec), have = new Set(declaredOf(v));
  const ids = DIST.filter(d => meta.slate[d]?.length && (have.has(d) || me?.districts.includes(d)));
  return { open: true, cycle: meta.cycle, closeAt: meta.closeAt, key, name: citizenName(key),
    districts: ids.map(d => ({ id: d, name: SIM.DISTRICT[d]?.name || d, declared: have.has(d), may: Boolean(me?.districts.includes(d)) })) };
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
  const seated = result ? seatedOf(result, await readResigned(store, meta.cycle)) : {};
  const races = {};
  let healed = false;
  const declared = await readCands(store, meta.cycle);
  for (const d of DIST) {
    const cands = meta.slate[d] || [];
    let t = await readTally(store, meta.cycle, d);
    if (!result && !healed && Object.keys(t.seen).length <= HEAL_MAX_VOTERS && now - (t.healedAt || 0) > HEAL_EVERY_MS) {
      healed = true;
      try { await heal(store, meta.cycle, { now, tries: 2 }); t = await readTally(store, meta.cycle, d); } catch { /* the next GET tries again */ }
    }
    const rr = result?.races?.[d] || null;
    const c = rr ? { votes: rr.votes, voters: rr.voters, writeins: rr.writeins || [], writeinOther: rr.writeinOther || 0 } : { ...countsOf(t.seen, cands.length) };
    const board = rr ? { writeins: c.writeins, writeinOther: c.writeinOther } : writeinBoard(c.writeins, t.w);
    // declared: how many citizens have declared here, and which of the board's write-ins did
    const here = new Set(Object.values(declared[d] || {}));
    if (!rr) board.writeins = board.writeins.map(w => ({ ...w, declared: here.has(w.key) }));
    // the ranking stays in the store: below the board's threshold a write-in is only a number
    let res = null;
    if (rr) {
      const { order, ...pub } = rr;
      const s = seated[d];
      res = s && s.declined ? { ...pub, key: s.key, name: s.name, declined: true, notice: DECLINED } : pub;
    }
    races[d] = { candidates: cands, votes: c.votes, voters: c.voters, ...board, declared: rr ? 0 : here.size, npc: meta.npc[d], result: res };
  }
  const next = cycleWindow(anchor.openAt, meta.cycle + 1);
  return {
    cycle: meta.cycle, openAt: meta.openAt, closeAt: meta.closeAt, now,
    state: now < meta.closeAt ? "open" : "closed",
    seatDay: seatDayOf(meta.closeAt), termDays: TERM_DAYS, termMs: TERM_MS, windowMs: ELECTION_MS,
    next: { cycle: meta.cycle + 1, openAt: next.openAt, closeAt: next.closeAt },
    races, decidedAt: result?.decidedAt || null,
    rules: { limits: LIMITS, adopted: ADOPTED, writeinShow: WRITEIN_SHOW },
  };
}
