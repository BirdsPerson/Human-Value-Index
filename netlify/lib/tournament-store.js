// THE OPEN TOURNAMENTS, on file (Blobs store "hvi-tournaments"; docs/TOURNAMENTS.md).
//   t:<event id>   the event's board: {id, entries: {<k>: entry}, final: null | {...}}
//                  entry: {k, holder, cid, div, att: [{n, at, legs: [{total, tb, par?, detail, at, ticks}],
//                  done, doneAt}]}. k is a hash of the case number (never served); cid is the case
//                  number itself, kept only so the trophy and the file's line can be delivered (never
//                  served, scrubbed by the purge); holder is the name on the board ("SUBJECT 7Q2X").
//   c:<caseId>     the file's tournaments: {ids: [event ids entered], honours: [{id, line, place, div,
//                  sku, at}]} (MY FILE reads it; the purge deletes it)
// An entry permit is signed, not stored: an HMAC under a server secret over the event, the holder's
// key, the attempt, the division and the issue time.
import { getStore } from "@netlify/blobs";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { rankRows, isDiv, DIVISIONS } from "../../src/tournament/rules.js";
import { statusOf } from "../../src/tournament/calendar.js";

export const STORE = "hvi-tournaments";
const ts = () => getStore({ name: STORE, consistency: "strong" });
export const PURGED = "A PURGED FILE";
export const MAX_ENTRIES = 5000, KEEP_IDS = 200, KEEP_HONOURS = 100;
export const PERMIT_TTL_MS = 4 * 3600 * 1000;   // a round must be filed within four hours of entering
export const holderKey = (caseId) => createHash("sha256").update(`hvi-tourney:${caseId}`).digest("hex").slice(0, 16);
const key = () => process.env.HVI_TOURNEY_SALT || process.env.HVI_HUNT_SALT || process.env.HVI_IP_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "hvi-tourney-dev";

// ---- the permit: <event>.<k>.<attempt>.<div>.<at>.<sig> ------------------------------------------------
export function signPermit(p, k = key()) {
  const body = `${p.id}.${p.k}.${p.n}.${p.div}.${p.at}`;
  return `${body}.${createHmac("sha256", k).update(`tourney|${body}`).digest("hex").slice(0, 32)}`;
}
export function readPermit(token, k = key()) {
  const m = /^([a-z0-9-]{6,32})\.([a-f0-9]{16})\.(\d{1,2})\.(open|assisted)\.(\d{13})\.([a-f0-9]{32})$/.exec(String(token || ""));
  if (!m) return null;
  const p = { id: m[1], k: m[2], n: Number(m[3]), div: m[4], at: Number(m[5]) };
  const want = Buffer.from(signPermit(p, k).split(".").pop()), got = Buffer.from(m[6]);
  return want.length === got.length && timingSafeEqual(want, got) ? p : null;
}

// ---- the rules on a board, pure (scripts/check-tournament.mjs) ---------------------------------------------
export const emptyBoard = (id) => ({ id, entries: {}, final: null });

// ENTER: -> {board, attempt: {n, at, div}, resumed} | {error, status}
export function enter(board, ev, { k, holder, cid, div, nowMs }) {
  const st = statusOf(ev, nowMs);
  if (st === "upcoming") return { error: "THE EVENT IS NOT OPEN YET. THE DEPARTMENT OPENS ON TIME. YOU MAY NOT.", status: 409 };
  if (st !== "open") return { error: "ENTRIES ARE CLOSED. THE RESULT IS BEING FILED.", status: 410 };
  if (!isDiv(div)) return { error: "NO SUCH DIVISION. OPEN OR ASSISTED.", status: 400 };
  const b = structuredClone(board || emptyBoard(ev.id));
  const e = b.entries[k];
  if (e) {
    if (e.div !== div) return { error: `YOU ARE ENTERED IN THE ${e.div.toUpperCase()} DIVISION. ONE DIVISION AN EVENT.`, status: 409 };
    const last = e.att[e.att.length - 1];
    if (last && !last.done && nowMs - last.at < PERMIT_TTL_MS) return { board: b, attempt: { n: last.n, at: last.at, div }, resumed: true, legs: last.legs.length };
    if (e.att.length >= ev.attempts) return { error: ev.attempts === 1 ? "YOUR ONE OFFICIAL ATTEMPT IS SPENT. PRACTICE IS UNLIMITED. THE RECORD IS NOT." : `ALL ${ev.attempts} OFFICIAL ATTEMPTS ARE SPENT.`, status: 409 };
  }
  if (!e && Object.keys(b.entries).length >= MAX_ENTRIES) return { error: "THE FIELD IS FULL. THE DEPARTMENT ADMIRES YOUR PUNCTUALITY'S ABSENCE.", status: 409 };
  const entry = e || { k, holder, cid, div, att: [] };
  const n = entry.att.length + 1;
  entry.att.push({ n, at: nowMs, legs: [], done: false, doneAt: null });
  b.entries[k] = entry;
  return { board: b, attempt: { n, at: nowMs, div }, resumed: false, legs: 0 };
}

// FILE a verified leg: in order, once each, inside the window (and the grace for a card started
// before the close). -> {board, entry} | {error, status}
export function fileLeg(board, ev, { k, n, leg, result, nowMs }) {
  const e = board?.entries?.[k];
  const a = e?.att?.find(x => x.n === n);
  if (!a) return { error: "NO SUCH ENTRY ON THE BOARD. ENTER FIRST.", status: 404 };
  if (a.done) return { error: "THAT ATTEMPT IS ALREADY ON THE BOARD. ONE OFFICIAL RESULT AN ATTEMPT.", status: 409 };
  if (leg !== a.legs.length) return { error: leg < a.legs.length ? "THAT GAME IS ALREADY ON THE BOARD." : "FILE THE GAMES IN ORDER.", status: 409 };
  if (statusOf(ev, nowMs) === "closed") return { error: "THE BOARD IS CLOSED. THE CARD ARRIVED AFTER THE RESULT.", status: 410 };
  if (nowMs - a.at > PERMIT_TTL_MS) return { error: "THAT ENTRY HAS EXPIRED. THE DEPARTMENT WAITED. IT DOES NOT WAIT LONG.", status: 410 };
  const b = structuredClone(board), x = b.entries[k].att.find(y => y.n === n);
  x.legs.push({ ...result, at: nowMs });
  if (x.legs.length >= ev.legs) { x.done = true; x.doneAt = nowMs; }
  return { board: b, entry: b.entries[k] };
}

// The clock: when the attempt's latest leg could have started (its permit, or the leg before it).
export const legStart = (board, k, n) => { const a = board?.entries?.[k]?.att?.find(x => x.n === n); return a ? Math.max(a.at, ...a.legs.map(l => l.at)) : null; };

// One row per entrant: its best finished attempt, else the attempt in progress (projected).
export function rowsOf(board, ev) {
  const rows = [];
  for (const e of Object.values(board?.entries || {})) {
    const atts = e.att.map(a => ({ a, total: a.legs.reduce((s, l) => s + l.total, 0) }));
    const done = atts.filter(x => x.a.done), pick = (done.length ? done : atts.filter(x => x.a.legs.length))
      .sort((x, y) => (ev.lower ? x.total - y.total : y.total - x.total))[0];
    if (!pick) continue;
    const a = pick.a, legs = a.legs;
    const tb = legs.length === 1 ? legs[0].tb || [] : [Math.min(...legs.map(l => (l.tb || [0])[0])), legs.reduce((s, l) => s + ((l.tb || [])[1] || 0), 0)];
    rows.push({ k: e.k, n: a.n, holder: e.holder, div: e.div, total: pick.total, par: legs.reduce((s, l) => (l.par == null ? s : (s ?? 0) + l.par), null), tb, legs: legs.length, of: ev.legs, done: a.done, doneAt: a.doneAt || null, detail: legs.length === 1 ? legs[0].detail : legs.map(l => l.total) });
  }
  return rows;
}
// The boards by division: projected while the window is open (cards in progress count as they
// stand), final after it (finished cards only; the rest are listed as NO CARD).
export function standings(board, ev, nowMs) {
  const st = statusOf(ev, nowMs), final = st === "closed";
  const rows = rowsOf(board, ev);
  const out = { status: st, final, divisions: {}, entrants: rows.length };
  for (const d of DIVISIONS) {
    const mine = rows.filter(r => r.div === d);
    out.divisions[d] = rankRows(final ? mine.filter(r => r.done) : mine, ev.lower);
    if (final) out.divisions[d].nc = mine.filter(r => !r.done).length;
  }
  return out;
}
// What a visitor sees: names, never the key or the case.
const pubRow = (r) => ({ pos: r.pos, holder: r.holder, total: r.total, par: r.par, legs: r.legs, of: r.of, done: r.done, detail: r.detail });
export function publicStandings(s, top = 50) {
  const divisions = {};
  for (const d of DIVISIONS) divisions[d] = (s.divisions[d] || []).slice(0, top).map(pubRow);
  return { status: s.status, final: s.final, entrants: s.entrants, divisions, nc: Object.fromEntries(DIVISIONS.map(d => [d, s.divisions[d]?.nc || 0])) };
}
// The file's own place (MY FILE, the end menu): -> {pos, of, div, row} | null
export function placeOf(s, k) {
  for (const d of DIVISIONS) { const L = s.divisions[d] || [], i = L.findIndex(r => r.k === k); if (i >= 0) return { pos: i + 1, of: L.length, div: d, row: L[i] }; }
  return null;
}

// ---- Blobs: etag-conditional read-modify-write, retried ----------------------------------------------------
export class Busy extends Error {}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function update(k, empty, fn, tries = 8) {
  const store = ts();
  for (let attempt = 0; attempt < tries; attempt++) {
    const cur = await store.getWithMetadata(k, { type: "json" });
    const r = fn(cur?.data ? structuredClone(cur.data) : empty());
    if (!r.data) return { data: cur?.data || null, out: r.out };
    const res = await store.setJSON(k, r.data, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return { data: r.data, out: r.out };
    await sleep(Math.floor(Math.random() * (8 + attempt * 12)));
  }
  throw new Busy(`${k} busy`);
}
export const readBoard = async (id) => (await ts().get(`t:${id}`, { type: "json" })) || null;
export const updateBoard = (id, fn) => update(`t:${id}`, () => emptyBoard(id), fn);
export const getRecord = async (caseId) => (await ts().get(`c:${caseId}`, { type: "json" })) || null;
export const updateRecord = (caseId, fn) => update(`c:${caseId}`, () => ({ v: 1, ids: [], honours: [] }), fn);
export const noteEntered = (caseId, id) => updateRecord(caseId, (r) => (r.ids.includes(id) ? { out: null } : { data: { ...r, ids: [id, ...r.ids].slice(0, KEEP_IDS) } }));
export const addHonour = (caseId, h) => updateRecord(caseId, (r) => (r.honours.some(x => x.id === h.id && x.div === h.div) ? { out: null } : { data: { ...r, honours: [h, ...r.honours].slice(0, KEEP_HONOURS) } }));

// MY FILE's purge: the file's record goes; on every board it entered, the name becomes A PURGED FILE
// and the case number is struck (the card was played; who played it is no longer on file).
export function scrubBoard(board, k) {
  const e = board?.entries?.[k];
  if (!e) return null;
  const b = structuredClone(board);
  b.entries[k] = { ...b.entries[k], holder: PURGED, cid: null };
  for (const a of b.final?.awards || []) if (a.k === k) { a.holder = PURGED; a.cid = null; }
  return b;
}
// A golf card's verified input log, kept so THE SET's tournament channel can replay the leaders
// (src/front/TourneyChannel.jsx): l:<event>:<k>:<attempt> -> {v, hand, inputLog}. Served only through
// the leader's place (tournament.js ?log=1), never by key or case number; the purge deletes it.
export const MAX_LOG_BYTES = 300_000;
export const logKey = (id, k, n) => `l:${id}:${k}:${n}`;
export async function putLog(id, k, n, rec) {
  const body = JSON.stringify(rec);
  if (body.length > MAX_LOG_BYTES) return false;
  await ts().set(logKey(id, k, n), body);
  return true;
}
export const getLog = async (id, k, n) => (await ts().get(logKey(id, k, n), { type: "json" })) || null;
export async function deleteTournaments(caseId) {
  const rec = await getRecord(caseId), k = holderKey(caseId);
  for (const id of rec?.ids || []) {
    const e = (await readBoard(id).catch(() => null))?.entries?.[k];
    for (const a of e?.att || []) await ts().delete(logKey(id, k, a.n)).catch(() => {});
  }
  for (const id of rec?.ids || []) await updateBoard(id, (b) => { const s = scrubBoard(b, k); return s ? { data: s } : { out: null }; });
  await ts().delete(`c:${caseId}`);
}
