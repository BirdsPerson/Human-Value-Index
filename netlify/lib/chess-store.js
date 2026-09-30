// Chess against the figures, on file (Blobs store "hvi-chess"). No stakes, no prizes: a record.
//   g:<gameId>     a game dealt by the server: {caseId, vs, side, seed, at}. Read and deleted when
//                  its result is filed (one result per game); a game older than GAME_TTL_MS is void.
//   c:<caseId>     the file's chess record: {w, d, l, rating, games: [last 20], beat: {slug: n},
//                  hashes: [move-list hashes already filed]}; one etag-conditional write per change.
//   board          the player leaderboard: {rows: [{k, l4, rating, w, d, l, best, bestRating, at}]}.
//                  k is a hash of the case number; only its last four characters are ever served.
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

const chess = () => getStore({ name: "hvi-chess", consistency: "strong" });
export const GAME_TTL_MS = 12 * 3600 * 1000;
export const START_RATING = 1200, K_PLAYER = 32, BOARD_KEEP = 100, KEEP_GAMES = 20, KEEP_HASHES = 200;
export const newRecord = () => ({ v: 1, w: 0, d: 0, l: 0, rating: START_RATING, games: [], beat: {}, hashes: [], n: 0 });

export async function putGame(gameId, game) { await chess().setJSON(`g:${gameId}`, game); }
export async function getGame(gameId) { return (await chess().get(`g:${gameId}`, { type: "json" })) || null; }
export async function dropGame(gameId) { await chess().delete(`g:${gameId}`); }

export async function getRecord(caseId) { return (await chess().get(`c:${caseId}`, { type: "json" })) || null; }
export class Busy extends Error {}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// fn(record) -> {record, out} to write, or {out} to write nothing.
export async function updateRecord(caseId, fn, tries = 8) {
  const store = chess(), key = `c:${caseId}`;
  for (let attempt = 0; attempt < tries; attempt++) {
    const cur = await store.getWithMetadata(key, { type: "json" });
    const r = fn(cur?.data ? structuredClone(cur.data) : newRecord());
    if (!r.record) return { record: cur?.data || null, out: r.out };
    r.record.n = (r.record.n || 0) + 1;
    const res = await store.setJSON(key, r.record, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return { record: r.record, out: r.out };
    await sleep(Math.floor(Math.random() * (8 + attempt * 12)));
  }
  throw new Busy("record busy");
}

export const boardKey = (caseId) => createHash("sha256").update(`hvi-chess:${caseId}`).digest("hex").slice(0, 16);
export async function postBoard(caseId, rec, now = Date.now()) {
  const store = chess(), k = boardKey(caseId);
  const best = Object.keys(rec.beat || {}).map(slug => ({ slug, r: rec.bestRatings?.[slug] ?? 0 })).sort((a, b) => b.r - a.r)[0];
  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await store.getWithMetadata("board", { type: "json" });
    const rows = (cur?.data?.rows || []).filter(r => r.k !== k);
    rows.push({ k, l4: caseId.slice(-4), rating: rec.rating, w: rec.w, d: rec.d, l: rec.l, best: best ? rec.bestNames?.[best.slug] || best.slug : null, at: new Date(now).toISOString() });
    rows.sort((a, b) => b.rating - a.rating || b.w - a.w);
    const res = await store.setJSON("board", { rows: rows.slice(0, BOARD_KEEP) }, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return;
  }
}
export async function readBoard(n = 10) {
  const d = await chess().get("board", { type: "json" });
  return (d?.rows || []).slice(0, n).map((r, i) => ({ rank: i + 1, case: `…${r.l4}`, rating: r.rating, w: r.w, d: r.d, l: r.l, best: r.best }));
}

// MY FILE's purge: the record and the board row (open games expire on their own).
export async function deleteChess(caseId) {
  const store = chess(), k = boardKey(caseId);
  await store.delete(`c:${caseId}`);
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await store.getWithMetadata("board", { type: "json" });
    if (!cur?.data?.rows?.some(r => r.k === k)) return;
    const res = await store.setJSON("board", { rows: cur.data.rows.filter(r => r.k !== k) }, { onlyIfMatch: cur.etag });
    if (res.modified) return;
  }
}
