// THE MOUNTAIN's boards, on file (Blobs store "hvi-ski"): the second thing in the city a server checks
// by replaying a game (after THE AQUARIUM).
//   c:<caseId>   the file's skiing: {runs: [last KEEP_RUNS permits issued: {id, ch, at, filed}], best: {ch: value}}
//   boards       {ch: [top KEEP entries, best first: {k, holder, value, unit, medal, board, at, ticks}]}
//                k is a hash of the case number (never served); holder the name on the board ("SUBJECT 7Q2X").
//                One entry per holder per challenge: their best. A tie keeps the earlier run.
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

const sk = () => getStore({ name: "hvi-ski", consistency: "strong" });
export const RUN_TTL_MS = 2 * 3600 * 1000;
export const KEEP = 25, KEEP_RUNS = 20;
export const PURGED = "A PURGED FILE";
export const holderKey = (caseId) => createHash("sha256").update(`hvi-ski:${caseId}`).digest("hex").slice(0, 16);
export const holderName = (caseId) => `SUBJECT ${String(caseId).replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase()}`;
export const newRecord = () => ({ v: 1, runs: [], best: {} });

export class Busy extends Error {}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// fn(current) -> {data, out} to write, or {out} to write nothing. Etag-conditional, retried.
async function update(key, empty, fn, tries = 8) {
  const store = sk();
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
export const getRecord = async (caseId) => (await sk().get(`c:${caseId}`, { type: "json" })) || null;
export const updateRecord = (caseId, fn) => update(`c:${caseId}`, newRecord, fn);
export const readBoards = async () => (await sk().get("boards", { type: "json" })) || {};
export const updateBoards = (fn) => update("boards", () => ({}), fn);

// ---- the board's rule, pure: a run filed on a challenge's board -------------------------------------------
// entry: {ch, k, holder, value, unit, medal, board, at, ticks}. lowerBetter: times and places.
// -> {boards, rank (1-based, or null when off the board), improved (the holder's own best moved)}
export function fileRun(boards, e, lowerBetter) {
  const list = [...(boards[e.ch] || [])];
  const better = (a, b) => (lowerBetter ? a < b : a > b);
  const i = list.findIndex(x => x.k === e.k);
  let improved = false;
  if (i < 0 || better(e.value, list[i].value)) {
    if (i >= 0) list.splice(i, 1);
    const h = { k: e.k, holder: e.holder, value: e.value, unit: e.unit, medal: e.medal, board: Boolean(e.board), at: e.at, ticks: e.ticks };
    // after every entry it does not beat (a tie keeps the earlier run ahead)
    let at = list.findIndex(x => better(e.value, x.value));
    if (at < 0) at = list.length;
    list.splice(at, 0, h);
    improved = true;
  }
  const kept = list.slice(0, KEEP);
  const r = kept.findIndex(x => x.k === e.k);
  return { boards: { ...boards, [e.ch]: kept }, rank: r < 0 ? null : r + 1, improved: improved && r >= 0 };
}
// What a visitor sees: names, never the key.
const pub = (h) => ({ holder: h.holder, value: h.value, unit: h.unit, medal: h.medal, board: h.board, at: h.at, ticks: h.ticks });
export const publicBoards = (boards) => Object.fromEntries(Object.entries(boards || {}).map(([ch, l]) => [ch, (l || []).map(pub)]));

// MY FILE's purge: the record goes; on the boards the name becomes A PURGED FILE.
export async function deleteSki(caseId) {
  await sk().delete(`c:${caseId}`);
  const k = holderKey(caseId);
  await updateBoards((boards) => {
    let hit = false;
    for (const l of Object.values(boards)) for (const h of l) if (h.k === k) { h.k = null; h.holder = PURGED; hit = true; }
    return hit ? { data: boards } : { out: null };
  });
}
