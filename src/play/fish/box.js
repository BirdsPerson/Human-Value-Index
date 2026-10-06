// THE TACKLE BOX: this browser's catches (kept fish, personal bests per species) and the logs of its
// permitted trips (so a kept fish can still be donated while its permit lasts). localStorage, with
// the tab's memory when storage is refused. The aquarium's plaques are the server's (api.js).
const BOX = "hvi-fish-box", BESTS = "hvi-fish-bests", TRIPS = "hvi-fish-trips";
const MEM = {};
const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v ?? MEM[k] ?? d; } catch { return MEM[k] ?? d; } };
const write = (k, v) => { MEM[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* the tab keeps it */ } };

export const loadBox = () => { const b = read(BOX, []); return Array.isArray(b) ? b : []; };
export const loadBests = () => { const b = read(BESTS, {}); return b && typeof b === "object" ? b : {}; };
// every landed fish counts toward the bests (kept or released); only kept fish go in the box
export function recordCatch(k, { tripId = null, kept = false } = {}) {
  const bests = loadBests(), cur = bests[k.sp];
  const isBest = !cur || k.cw > cur.cw;
  if (isBest) { bests[k.sp] = { cw: k.cw, tl: k.tl, spot: k.spot, day: k.day, at: Date.now() }; write(BESTS, bests); }
  if (kept) write(BOX, [{ ...k, tripId, at: Date.now() }, ...loadBox().filter(x => !(tripId && x.tripId === tripId && x.n === k.n))].slice(0, 100));
  return isBest;
}
export function markDonated(tripId, n) {
  write(BOX, loadBox().map(x => (x.tripId === tripId && x.n === n ? { ...x, donated: true } : x)));
}
// a permitted trip's config and log, newest first, the last three
export const loadTrips = () => { const t = read(TRIPS, []); return Array.isArray(t) ? t : []; };
export function saveTrip(tripId, cfg, log) {
  if (!tripId) return;
  write(TRIPS, [{ tripId, cfg, log, at: Date.now() }, ...loadTrips().filter(t => t.tripId !== tripId)].slice(0, 3));
}
