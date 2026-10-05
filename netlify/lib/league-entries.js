// JOIN THE LEAGUES (Scott 2026-10-05: "my character is not on any sports teams. I was a multi-sport
// varsity athlete in high school. I would like to be in the sports competitions."). A player enters
// their citizen from MY FILE: one or two of BASEBALL, BASKETBALL, FOOTBALL, SOCCER and THE TENNIS
// LADDER. The entry stands season after season until withdrawn. docs/CITY_SPEC.md "The leagues and
// the Departmental Cup" (players' entries); the mechanics are src/city/leagues.js (entrantRating,
// entrantsBySport, sportPools, ladderSeed).
//
// Store hvi-leagues:
//   e/<entryKey>     one per file: {key (its citizen), sports, inputs {physical, competence,
//                    adaptability, ath, named, record, assessedAt}, r {sport: rating}, since, at, rev, revSeason,
//                    ip}. CAS. entryKey is a salted hash of the case number (a case number is a
//                    credential; the store never holds one). sports [] is a withdrawn entry.
//   snap/s<NNN>      season NNN's (1-based) entries, frozen once: {season, closeAt, frozenAt,
//                    entries: [{key, sports, r, record}]}. onlyIfNew. Written by the plan builder when it first
//                    folds a day of that season, or by the first write here after the season's
//                    entries close, whichever comes first; read by every fold after, so a season's
//                    drafts are always drawn from the same list.
//
// THE CALENDAR: a season's entries close at the start of machine day seasonStart - 3 (the builder
// folds up to three days ahead). An entry or withdrawal before that counts for that season's draft;
// after it, for the next. Entering is free; no stakes. Every function takes the store (or io), so
// scripts/check-civic.mjs runs it in memory.
//
// THE ATHLETIC RECORD (Scott 2026-10-05): admin-set on the case (`athleticRecord {level, played,
// track, by, at}` in hvi-cases), by the operator with scripts/set-athletic-record.mjs; never written
// through any public API. inputsOf reads it; the rating takes its floor (src/leagues/record.js). A
// changed record re-rates a standing entry like a new assessment does (myEntry); a snapshot already
// frozen keeps the record it was frozen with.
import { createHash } from "node:crypto";
import * as SIM from "../../src/city/sim.js";
import * as L from "../../src/city/leagues.js";
import { effectivelyGated, seriousHarm } from "./intake.js";

export const STORE = "hvi-leagues";
// The first season (0-based) that takes entries: season 23, draft day 617 (2026-10-06 06:24 UTC).
// Earlier seasons were drafted without them and fold as they always did.
export const ENTRIES_FROM = 22;
export const LIMITS = { revisions: 10, perIpHour: 30, newPerIpDay: 4 };
const pad = (n) => String(n).padStart(3, "0");
export const KEYS = { entry: (ek) => `e/${ek}`, entries: "e/", snap: (season1) => `snap/s${pad(season1)}`, snaps: "snap/" };
const salt = () => process.env.HVI_IP_SALT || "hvi-limits-v1";
const sha = (s) => createHash("sha256").update(s).digest("hex");
export const entryKey = (caseId) => sha(`${salt()}:leagues:${caseId}`).slice(0, 16);
export const citizenKeyOf = (caseId) => `citizen-${String(caseId || "").slice(-4).toLowerCase()}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- the calendar (seasons 0-based here; the store and the page say season + 1) --------------------
const dayStartMs = (day) => SIM.CITY_EPOCH + ((day - 1) * 24 * 3600 * 1000) / SIM.DEFAULT_SCALE;
export const closeMs = (season) => dayStartMs(L.entryCloseDay(season));
export const draftMs = (season) => dayStartMs(L.seasonStart(season));
const mtOf = (now) => SIM.machineClock(now).mt;
// The season an entry made now is drafted in: the first still open, not yet frozen.
export async function targetSeason(store, now = Date.now()) {
  let s = Math.max(ENTRIES_FROM, L.entrySeasonAt(mtOf(now)));
  while (await store.get(KEYS.snap(s + 1), { type: "json" })) s++;
  return s;
}

// ---- the file's rating inputs -------------------------------------------------------------------------
const lastOf = (rec) => (Array.isArray(rec?.history) && rec.history.length ? rec.history[rec.history.length - 1] : null);
export const inHarm = (rec) => { const b = lastOf(rec)?.breakdown; return Boolean(b && (effectivelyGated(b, rec?.harmReview || null) || seriousHarm(b))); };
// The subject's own words across every visit, and the Department's commendations on the latest.
export function athleticsText(rec) {
  const words = [];
  for (const h of rec?.history || []) for (const m of h?.transcript || []) if (m && m.role !== "agent" && typeof m.text === "string") words.push(m.text);
  for (const c of lastOf(rec)?.commendations || []) words.push(typeof c === "string" ? c : [c?.title, c?.text, c?.label].filter(x => typeof x === "string").join(" "));
  return words.join("\n").slice(0, 200000);
}
const n0 = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
export function inputsOf(rec) {
  const last = lastOf(rec);
  if (!last) return null;
  const b = last.breakdown || {};
  return { physical: n0(b.physical), competence: n0(last.competence), adaptability: n0(b.adaptability), ...L.athleticsOf(athleticsText(rec)), record: recordOnFile(rec), assessedAt: last.at || null };
}
// The admin-set ATHLETIC RECORD on the case, canonical ({level: "none"} when there is none or it is
// malformed).
export const recordOnFile = (rec) => L.cleanRecord(rec?.athleticRecord ? { level: rec.athleticRecord.level, played: rec.athleticRecord.played, track: rec.athleticRecord.track } : null) || L.cleanRecord(null);
export const ratingsOf = (inputs, sports = L.ENTRY_SPORTS) => Object.fromEntries(sports.map(sp => [sp, L.entrantRating(inputs, sp, inputs?.record)]));
// The record on an entry's inputs, canonical.
const entryRecord = (e) => L.cleanRecord(e?.inputs?.record) || L.cleanRecord(null);
export function cleanSports(list) {
  if (!Array.isArray(list)) return null;
  const s = [...new Set(list.map(x => String(x || "").toLowerCase()))];
  if (s.length > L.ENTRY_MAX_SPORTS || s.some(x => !L.ENTRY_SPORTS.includes(x))) return null;
  return L.ENTRY_SPORTS.filter(x => s.includes(x));
}

// ---- the snapshot ---------------------------------------------------------------------------------------
// Freeze season `season`'s entries (0-based) if not yet frozen. -> the snapshot
export async function freezeSeason(store, season, now = Date.now()) {
  const k = KEYS.snap(season + 1);
  const cur = await store.get(k, { type: "json" });
  if (cur) return cur;
  const { blobs } = await store.list({ prefix: KEYS.entries });
  const recs = (await Promise.all(blobs.map(b => store.get(b.key, { type: "json" }).catch(() => null)))).filter(e => e?.sports?.length && e.key);
  // one entry per citizen: two files that share a last four, the earlier entry
  recs.sort((a, b) => String(a.since || "").localeCompare(String(b.since || "")) || (a.key < b.key ? -1 : 1));
  const seen = new Set(), entries = [];
  for (const e of recs) {
    if (seen.has(e.key)) continue;
    seen.add(e.key);
    entries.push({ key: e.key, sports: e.sports, r: Object.fromEntries(e.sports.map(sp => [sp, e.r?.[sp]])), record: entryRecord(e) });
  }
  entries.sort((a, b) => (a.key < b.key ? -1 : 1));
  const snap = { season: season + 1, closeAt: new Date(closeMs(season)).toISOString(), frozenAt: new Date(now).toISOString(), entries };
  const r = await store.setJSON(k, snap, { onlyIfNew: true });
  return r.modified ? snap : await store.get(k, { type: "json" });
}
// Before any write: the season whose entries have just closed is frozen first, so nothing written
// after the close can reach its draft.
async function freezeClosed(store, now) {
  const s = L.entrySeasonAt(mtOf(now)) - 1;
  if (s >= ENTRIES_FROM) await freezeSeason(store, s, now);
}
// The plan builder: freeze the seasons of the days it is about to fold (from ENTRIES_FROM), then
// every snapshot on record. -> {season (1-based): [{key, sports, r, record}]} for civic.js setEntries. Strict:
// a failed read throws (the builder builds nothing rather than draft without the entries).
export async function entriesRecord(store, days = [], now = Date.now()) {
  const seasons = [...new Set(days.map(d => L.seasonOf(d)))].filter(s => s >= ENTRIES_FROM).sort((a, b) => a - b);
  for (const s of seasons) await freezeSeason(store, s, now);
  const { blobs } = await store.list({ prefix: KEYS.snaps });
  const out = {};
  for (const b of blobs) {
    const snap = await store.get(b.key, { type: "json" });
    if (!snap || !Number.isInteger(snap.season)) throw new Error(`league entries: ${b.key} unreadable`);
    out[snap.season] = snap.entries || [];
  }
  return out;
}

// ---- MY FILE ------------------------------------------------------------------------------------------
// io: {store, getCase, hitLimit, block?: async () => today's civic block | null, now?}.
// -> {status, body}: the panel's state. body: {key, name, season (the next draft's, 1-based),
// closeAt, draftAt, draftDay, entry: {sports, r} | null, preview {sport: rating}, ath, record (the
// admin-set ATHLETIC RECORD, or null), eligible,
// refused, drafted: [{season, sports}], lines: [{sport, text}]}
export async function myEntry(io, caseId, now = Date.now()) {
  const { store } = io;
  const rec = await io.getCase(caseId);
  if (!rec) return { status: 404, body: { error: "No such file. The Department does not lose files. You have mistyped." } };
  const key = citizenKeyOf(caseId), inputs = inputsOf(rec);
  const s = await targetSeason(store, now);
  let cur = await store.get(KEYS.entry(entryKey(caseId)), { type: "json" });
  // a new assessment re-rates a standing entry (a harm finding withdraws it), before the next freeze
  if (cur?.sports?.length && (inHarm(rec) || (inputs && (cur.inputs?.assessedAt !== inputs.assessedAt || !L.sameRecord(entryRecord(cur), inputs.record))))) {
    cur = await refreshEntry(store, caseId, rec, now);
  }
  const entry = cur?.sports?.length ? { sports: cur.sports, r: cur.r } : null;
  // the drafts this file's citizen is in: the frozen seasons from the one running
  const running = L.seasonOf(SIM.machineClock(now).day);
  const drafted = [];
  for (let q = Math.max(ENTRIES_FROM, running); q < s; q++) {
    const snap = await store.get(KEYS.snap(q + 1), { type: "json" });
    const mine = snap?.entries?.find(e => e.key === key);
    if (mine) drafted.push({ season: q + 1, sports: mine.sports, r: mine.r, draftDay: L.seasonStart(q), draftAt: new Date(draftMs(q)).toISOString() });
  }
  let lines = [];
  if (io.block) {
    try {
      const { entrantLines } = await import("../../src/city/civic.js");
      const blk = await io.block();
      const c = SIM.machineClock(now);
      if (blk?.leagues && blk.day === c.day) lines = entrantLines(blk, key, c.mt - (c.day - 1) * 24).map(x => ({ sport: x.sport, text: x.text }));
    } catch (err) { console.warn("league lines", err?.message); }
  }
  return {
    status: 200,
    body: {
      key, name: L.entrantName(key), season: s + 1, closeAt: new Date(closeMs(s)).toISOString(), draftAt: new Date(draftMs(s)).toISOString(), draftDay: L.seasonStart(s),
      closeDay: L.entryCloseDay(s), sports: L.ENTRY_SPORTS, max: L.ENTRY_MAX_SPORTS,
      entry, preview: inputs ? ratingsOf(inputs) : null, ath: Boolean(inputs?.ath),
      record: inputs?.record?.level && inputs.record.level !== "none" ? inputs.record : null, named: inputs?.named || [],
      file: inputs ? { physical: inputs.physical, competence: inputs.competence, adaptability: inputs.adaptability } : null,
      eligible: Boolean(inputs) && !inHarm(rec), refused: !inputs ? "unassessed" : inHarm(rec) ? "harm" : null,
      drafted, lines,
    },
  };
}
export const REFUSED = {
  unassessed: "Only assessed subjects are drafted. Your file has no assessment on it. Be assessed first.",
  harm: "The leagues do not draft files under a harm finding. The Department's sport is supervised.",
};
// Enter (sports: one or two of L.ENTRY_SPORTS), change, or withdraw (sports: []). -> {status, body}
export async function setEntry(io, { caseId, sports, ip, now = Date.now() }) {
  const { store } = io;
  const want = cleanSports(sports);
  if (!want) return { status: 400, body: { error: `Pick one or two: ${L.ENTRY_SPORTS.join(", ")}. The Department does not take all-rounders.` } };
  let lim;
  try { lim = await io.hitLimit(`leagues-ip:${ip}`, LIMITS.perIpHour, "hour"); } catch {
    return { status: 503, body: { error: "The Department's queue ledger is unavailable, and entries are not taken off the books. Try again shortly." }, retry: 60 };
  }
  if (!lim.ok) return { status: 429, body: { error: "Too many filings from your location this hour. Return in an hour." }, retry: 3600 };
  const rec = await io.getCase(caseId);
  if (!rec) return { status: 404, body: { error: "No such file. The Department does not lose files. You have mistyped." } };
  const inputs = inputsOf(rec);
  if (want.length && (!inputs || inHarm(rec))) return { status: 403, body: { error: REFUSED[!inputs ? "unassessed" : "harm"] } };
  await freezeClosed(store, now);
  const s = await targetSeason(store, now);
  const ek = entryKey(caseId), key = citizenKeyOf(caseId);
  for (let attempt = 0; attempt < 6; attempt++) {
    const cur = await store.getWithMetadata(KEYS.entry(ek), { type: "json" });
    const prev = cur?.data || null;
    const had = prev?.sports || [];
    if (had.join() === want.join() && (!want.length || (prev?.inputs?.assessedAt === inputs?.assessedAt && L.sameRecord(entryRecord(prev), inputs?.record)))) {
      return { status: 200, body: { entry: want.length ? { sports: prev.sports, r: prev.r } : null, season: s + 1, unchanged: true } };
    }
    const revs = prev?.revSeason === s + 1 ? prev.rev || 0 : 0;
    if (revs >= LIMITS.revisions) return { status: 429, body: { error: `This file has entered and withdrawn ${LIMITS.revisions} times before one draft. The Department has stopped taking its paperwork.` } };
    if (!prev && want.length) {
      const nl = await io.hitLimit(`leagues-new-ip:${ip}`, LIMITS.newPerIpDay, "day").catch(() => ({ ok: false }));
      if (!nl.ok) return { status: 429, body: { error: `${LIMITS.newPerIpDay} files have already entered from your location today. The Department counts athletes, not paperwork.` } };
    }
    const at = new Date(now).toISOString();
    const next = want.length
      ? { key, sports: want, inputs, r: ratingsOf(inputs, want), since: had.length ? prev.since : at, at, rev: revs + 1, revSeason: s + 1, ip: prev?.ip || sha(`${salt()}:ip:${ip}`).slice(0, 16) }
      : { key, sports: [], inputs: null, r: {}, since: null, at, rev: revs + 1, revSeason: s + 1, ip: prev?.ip || null };
    const r = await store.setJSON(KEYS.entry(ek), next, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (!r.modified) { await sleep(3 + Math.random() * 15); continue; }
    return { status: 200, body: { entry: want.length ? { sports: next.sports, r: next.r } : null, season: s + 1, withdrawn: !want.length } };
  }
  return { status: 409, body: { error: "Your filing collided with itself. Submit it once." } };
}
// Re-rate a standing entry from the file as it is now (no revision is charged). -> the record
async function refreshEntry(store, caseId, rec, now) {
  await freezeClosed(store, now);
  const k = KEYS.entry(entryKey(caseId)), inputs = inputsOf(rec);
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await store.getWithMetadata(k, { type: "json" });
    if (!cur?.data?.sports?.length) return cur?.data || null;
    if (inHarm(rec)) { await store.delete(k); return null; }
    const next = { ...cur.data, inputs, r: ratingsOf(inputs, cur.data.sports) };
    const r = await store.setJSON(k, next, { onlyIfMatch: cur.etag });
    if (r.modified) return next;
    await sleep(3 + Math.random() * 15);
  }
  return store.get(k, { type: "json" });
}
// A harm finding (intake-score.js) or a purge withdraws the entry; nothing frozen changes.
export async function dropEntry(store, caseId) {
  await store.delete(KEYS.entry(entryKey(caseId))).catch(() => {});
}
