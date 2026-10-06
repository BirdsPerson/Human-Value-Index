// THE OPEN TOURNAMENTS' prizes (docs/TOURNAMENTS.md): when an event's window (and its grace) has
// closed, its boards are final; the places that win are written into the board once, then delivered:
//   a line on the winner's file   (c:<caseId>.honours, MY FILE reads it)
//   a trophy for the flat         (the ledger's econ_award: a unique furniture item, SKU
//                                  f:trophy.<event>.<o|a><place>, a txn with no CYCLES in it)
// No CYCLES purse: docs/design/ECONOMY_PROPERTY.md section 11 says CYCLES carry "no prizes", and a
// purse would be minting outside the UBI and the market's rules. Trophies and titles only.
// A trophy for a file with no wallet yet (no COLLECT) waits on the board and is retried on every tick
// for AWARD_RETRY_MS; a file purged meanwhile gets nothing.
import { standings } from "./tournament-store.js";
import { readBoard, updateBoard, addHonour } from "./tournament-store.js";
import { ledger, caseHash } from "./economy-db.js";
import { eventsBetween, statusOf } from "../../src/tournament/calendar.js";
import { honourLine, trophySku, trophyOf, prizePlaces, DIVISIONS } from "../../src/tournament/rules.js";

export const AWARD_RETRY_MS = 30 * 86400000;
export const FINALIZE_LOOKBACK_MS = 10 * 86400000;

// The places that win, from the final standings: -> [{k, cid, holder, div, place, line, sku}]
export function awardsFor(ev, s) {
  const out = [];
  for (const div of DIVISIONS) {
    const rows = s.divisions[div] || [];
    const lines = prizePlaces(ev, div, "line"), cups = prizePlaces(ev, div, "trophies");
    for (const place of new Set([...lines, ...cups])) {
      const r = rows[place - 1];
      if (!r) continue;
      out.push({ k: r.k, div, place, holder: r.holder, line: lines.includes(place) ? honourLine(ev, place, r, div) : null, sku: cups.includes(place) ? trophySku(ev, place, div) : null });
    }
  }
  return out;
}

// Final the board once (pure on the board): -> the board with final = {at, awards: [... + cid, line, sku,
// filed: false, granted: null]} or null when it is already final.
export function finalBoard(board, ev, nowMs) {
  if (board?.final) return null;
  const s = standings(board, ev, nowMs);
  if (!s.final) return null;
  const awards = awardsFor(ev, s).map(a => ({ ...a, cid: board.entries[a.k]?.cid || null, filed: false, granted: a.sku ? null : "none" }));
  const champs = Object.fromEntries(DIVISIONS.map(d => [d, s.divisions[d][0] ? { holder: s.divisions[d][0].holder, total: s.divisions[d][0].total, par: s.divisions[d][0].par } : null]));
  return { ...structuredClone(board || { id: ev.id, entries: {} }), final: { at: nowMs, awards, champs } };
}

// Deliver what is owed on a final board. ledgerImpl: the ledger (null: the economy is closed; trophies wait).
export async function deliver(ev, nowMs, { L = ledger() } = {}) {
  const board = await readBoard(ev.id);
  if (!board?.final) return { delivered: 0 };
  let delivered = 0;
  const done = [];
  for (const a of board.final.awards) {
    if (!a.cid) continue;
    const patch = {};
    if (a.line && !a.filed) {
      await addHonour(a.cid, { id: ev.id, name: ev.name, game: ev.game, line: a.line, place: a.place, div: a.div, sku: a.sku, at: board.final.at });
      patch.filed = true; delivered++;
    }
    if (a.sku && a.granted !== "granted" && a.granted !== "lapsed") {
      if (nowMs - board.final.at > AWARD_RETRY_MS) patch.granted = "lapsed";
      else if (L) {
        try {
          const r = await L.rpc("econ_award", { idem: `award:${a.sku}`, case_hash: caseHash(a.cid), sku: a.sku, kind: "furn", name: trophyOf(a.sku.slice(2))?.name || a.sku });
          patch.granted = r?.ok ? "granted" : r?.error === "no-wallet" ? "no-wallet" : "refused";
          if (r?.ok) delivered++;
        } catch (e) { console.warn("tournament: award", e?.message); }
      }
    }
    if (Object.keys(patch).length) done.push([a.k, a.div, a.place, patch]);
  }
  if (done.length) {
    await updateBoard(ev.id, (b) => {
      if (!b?.final) return { out: null };
      for (const [k, div, place, patch] of done) { const x = b.final.awards.find(y => y.k === k && y.div === div && y.place === place); if (x) Object.assign(x, patch); }
      return { data: b };
    });
  }
  return { delivered };
}

// The tick: every event closed in the last ten days, finaled once, its prizes delivered (retried).
export async function finalizeDue(nowMs = Date.now(), opts = {}) {
  const out = [];
  for (const ev of eventsBetween(nowMs - FINALIZE_LOOKBACK_MS, nowMs)) {
    if (statusOf(ev, nowMs) !== "closed") continue;
    const b = await readBoard(ev.id);
    if (!b) continue;                                   // nobody entered: nothing to file
    if (!b.final) await updateBoard(ev.id, (cur) => { const f = finalBoard(cur, ev, nowMs); return f ? { data: f } : { out: null }; });
    const owed = (await readBoard(ev.id))?.final?.awards?.some(a => a.cid && ((a.line && !a.filed) || (a.sku && !["granted", "lapsed", "none"].includes(a.granted))));
    if (owed) out.push({ id: ev.id, ...(await deliver(ev, nowMs, opts)) });
  }
  return out;
}
