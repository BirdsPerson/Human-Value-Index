// TAGGED OUT's board (Blobs store "hvi-hunt"): the machine day's verified trips, every score re-played
// on the server from its log (netlify/functions/hunt.js) before it goes up. docs/CITY_SPEC.md "THE HUNT".
//   day:<n>   {day, top: [up to KEEP_TOP: {tag, trip, score, sp, pts, inches, at}], used: [permit ids]}
// Permits are signed, not stored (an HMAC under a server secret over id, seed, start, trip), so an
// unfiled trip leaves nothing behind; a filed one's id goes in the day's `used` list (one filing each).
import { getStore } from "@netlify/blobs";
import { createHmac, timingSafeEqual } from "node:crypto";

const hunt = () => getStore({ name: "hvi-hunt", consistency: "strong" });
export const KEEP_TOP = 25, KEEP_USED = 600;
export const PERMIT_TTL_MS = 2 * 3600 * 1000;
const key = () => process.env.HVI_HUNT_SALT || process.env.HVI_IP_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "hvi-hunt-dev";

// ---- the permit: id.seed.at.trip.sig ------------------------------------------------------------------
export function signPermit(p, k = key()) {
  const body = `${p.id}.${p.seed}.${p.at}.${p.trip}`;
  return `${body}.${createHmac("sha256", k).update(`hunt|${body}`).digest("hex").slice(0, 32)}`;
}
export function readPermit(token, k = key()) {
  const m = /^([a-f0-9]{16})\.(\d{1,10})\.(\d{13})\.([a-z]{2,16})\.([a-f0-9]{32})$/.exec(String(token || ""));
  if (!m) return null;
  const p = { id: m[1], seed: Number(m[2]), at: Number(m[3]), trip: m[4] };
  const want = Buffer.from(signPermit(p, k).split(".").pop()), got = Buffer.from(m[5]);
  return want.length === got.length && timingSafeEqual(want, got) ? p : null;
}

// ---- the board's rule, pure (scripts/check-hunt.mjs): a verified trip onto the day's board ----------------
// -> {board, rank (1-based, 0 when it missed the board), dup}
export function fileTrip(board, e, permitId) {
  const b = { day: e.day, top: [...(board?.top || [])], used: [...(board?.used || [])] };
  if (b.used.includes(permitId)) return { board: b, rank: 0, dup: true };
  b.used = [permitId, ...b.used].slice(0, KEEP_USED);
  const row = { tag: e.tag, trip: e.trip, score: e.score, sp: e.sp || null, pts: e.pts || 0, inches: e.inches || 0, at: e.at };
  // higher score first; a tie keeps the earlier one ahead
  let i = b.top.findIndex(r => e.score > r.score);
  if (i < 0) i = b.top.length;
  b.top.splice(i, 0, row);
  b.top = b.top.slice(0, KEEP_TOP);
  return { board: b, rank: i < KEEP_TOP ? i + 1 : 0, dup: false };
}
export const publicBoard = (b, day) => ({ day, top: (b?.top || []).slice(0, 10).map(({ tag, trip, score, sp, pts, inches }) => ({ tag, trip, score, sp, pts, inches })) });

export class Busy extends Error {}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export const readBoard = async (day) => (await hunt().get(`day:${day}`, { type: "json" })) || null;
export async function updateBoard(day, fn, tries = 8) {
  const store = hunt(), k = `day:${day}`;
  for (let attempt = 0; attempt < tries; attempt++) {
    const cur = await store.getWithMetadata(k, { type: "json" });
    const r = fn(cur?.data ? structuredClone(cur.data) : { day, top: [], used: [] });
    if (!r.data) return { data: cur?.data || null, out: r.out };
    const res = await store.setJSON(k, r.data, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return { data: r.data, out: r.out };
    await sleep(Math.floor(Math.random() * (8 + attempt * 12)));
  }
  throw new Busy(`${k} busy`);
}
