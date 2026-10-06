// THE AQUARIUM, on file (Blobs store "hvi-aquarium"): the first thing in the city a server checks by
// replaying a game (docs/CITY_SPEC.md "THE AQUARIUM").
//   c:<caseId>   the file's angling: {trips: [last KEEP_TRIPS issued: {id, seed, spot, at, donated: [n]}],
//                donations: [last KEEP_DONATIONS: {sp, cw, tl, spot, day, at, record}], n}
//                Trips live inside the file's own record, so an issued permit never leaves a blob behind.
//   tanks        every species' tank: {sp: {record, previous: [up to KEEP_PREVIOUS], donors: [the first
//                donation of each subject, in order, up to KEEP_DONORS], n}}. A holder is {k, holder, cw,
//                tl, spot, day, at}: k is a hash of the case number (never served), holder the name
//                on the plaque ("SUBJECT 7Q2X").
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

const aq = () => getStore({ name: "hvi-aquarium", consistency: "strong" });
export const TRIP_TTL_MS = 6 * 3600 * 1000;
export const KEEP_TRIPS = 12, KEEP_DONATIONS = 60, KEEP_PREVIOUS = 10, KEEP_DONORS = 100;
export const PURGED = "A PURGED FILE";
export const holderKey = (caseId) => createHash("sha256").update(`hvi-aquarium:${caseId}`).digest("hex").slice(0, 16);
export const holderName = (caseId) => `SUBJECT ${String(caseId).replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase()}`;
export const newRecord = () => ({ v: 1, trips: [], donations: [], n: 0 });

export class Busy extends Error {}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// fn(current) -> {data, out} to write, or {out} to write nothing. Etag-conditional, retried.
async function update(key, empty, fn, tries = 8) {
  const store = aq();
  for (let attempt = 0; attempt < tries; attempt++) {
    const cur = await store.getWithMetadata(key, { type: "json" });
    const r = fn(cur?.data ? structuredClone(cur.data) : empty());
    if (!r.data) return { data: cur?.data || null, out: r.out };
    const res = await store.setJSON(key, r.data, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return { data: r.data, out: r.out };
    await sleep(Math.floor(Math.random() * (8 + attempt * 12)));
  }
  throw new Busy(`${key} busy`);
}
export const getRecord = async (caseId) => (await aq().get(`c:${caseId}`, { type: "json" })) || null;
export const updateRecord = (caseId, fn) => update(`c:${caseId}`, newRecord, fn);
export const readTanks = async () => (await aq().get("tanks", { type: "json" })) || {};
export const updateTanks = (fn) => update("tanks", () => ({}), fn);

// ---- the plaque's rule, pure (scripts/check-fish.mjs): a donation into the tanks ------------------------
// entry: {k, holder, sp, cw, tl, spot, day, at}. The heavier fish takes the plaque (a tie keeps the
// holder: first to the weight keeps it); the old holder moves to PREVIOUS RECORDS, newest first.
// The donor list keeps each subject's first donation of the species, in order.
// -> {tanks, record: bool, beat: previous holder | null}
export function fileDonation(tanks, e) {
  const t = tanks[e.sp] || { record: null, previous: [], donors: [], n: 0 };
  const h = { k: e.k, holder: e.holder, cw: e.cw, tl: e.tl, spot: e.spot, day: e.day, at: e.at };
  let record = false, beat = null;
  if (!t.record || e.cw > t.record.cw) {
    if (t.record) { beat = t.record; t.previous = [t.record, ...(t.previous || [])].slice(0, KEEP_PREVIOUS); }
    t.record = h; record = true;
  }
  if (!t.donors.some(d => d.k === e.k) && t.donors.length < KEEP_DONORS) t.donors.push(h);
  t.n = (t.n || 0) + 1;
  return { tanks: { ...tanks, [e.sp]: t }, record, beat };
}
// What a visitor sees: names, never the key.
const pub = (h) => (h ? { holder: h.holder, cw: h.cw, tl: h.tl, spot: h.spot, day: h.day, at: h.at } : null);
export function publicTanks(tanks) {
  return Object.fromEntries(Object.entries(tanks || {}).map(([sp, t]) => [sp, { record: pub(t.record), previous: (t.previous || []).map(pub), donors: (t.donors || []).map(pub), n: t.n || 0 }]));
}
export const recordsHeld = (tanks, caseId) => { const k = holderKey(caseId); return Object.entries(tanks || {}).filter(([, t]) => t.record?.k === k).map(([sp]) => sp); };

// MY FILE's purge: the file's record goes; on the plaques its name becomes A PURGED FILE (the fish
// was caught; who caught it is no longer on file).
export async function deleteAquarium(caseId) {
  await aq().delete(`c:${caseId}`);
  const k = holderKey(caseId);
  const scrub = (h) => (h && h.k === k ? { ...h, k: null, holder: PURGED } : h);
  await updateTanks((tanks) => {
    let hit = false;
    for (const t of Object.values(tanks)) {
      const before = JSON.stringify(t);
      t.record = scrub(t.record); t.previous = (t.previous || []).map(scrub); t.donors = (t.donors || []).map(scrub);
      if (JSON.stringify(t) !== before) hit = true;
    }
    return hit ? { data: tanks } : { out: null };
  });
}
