// The casino's ledger in Blobs (store "hvi-casino"):
//   w:<caseId>        the wallet: {c (centichips), claimed (UTC day), bj, bac, pk, n, stats}
//                     every change is one etag-conditional write, so two requests racing on
//                     one file can never both spend the same chips (updateWallet).
//   board:<isoWeek>   this week's top stacks: {rows: [{k, l4, chips, at}]}. k is a hash of
//                     the case number; only its last four characters are ever served.
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";
import { isoWeek } from "../../src/casino/rules.js";

const casino = () => getStore({ name: "hvi-casino", consistency: "strong" });
const walletKey = (caseId) => `w:${caseId}`;

export const newWallet = () => ({ v: 1, c: 0, claimed: null, bj: null, bac: null, pk: null, n: 0, stats: { hands: 0, wagered: 0, returned: 0 } });

export async function getWallet(caseId) {
  return (await casino().get(walletKey(caseId), { type: "json" })) || null;
}

export class Busy extends Error {}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// fn(wallet) -> {wallet, out} to write, or {out} (with no wallet) to write nothing.
// Retries on a lost race with jitter; throws Busy when the file is being hammered.
export async function updateWallet(caseId, fn, tries = 10) {
  const store = casino(), key = walletKey(caseId);
  for (let attempt = 0; attempt < tries; attempt++) {
    const cur = await store.getWithMetadata(key, { type: "json" });
    const base = cur?.data ? structuredClone(cur.data) : newWallet();
    const r = fn(base);
    if (!r.wallet) return { wallet: cur?.data || null, out: r.out };
    r.wallet.n = (r.wallet.n || 0) + 1;
    const res = await store.setJSON(key, r.wallet, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return { wallet: r.wallet, out: r.out };
    await sleep(Math.floor(Math.random() * (8 + attempt * 12)));
  }
  throw new Busy("wallet busy");
}

export async function deleteWallet(caseId) {
  await casino().delete(walletKey(caseId));
}

// ---- the weekly board --------------------------------------------------------------------------
export const BOARD_KEEP = 100;
export const boardKey = (caseId) => createHash("sha256").update(`hvi-casino:${caseId}`).digest("hex").slice(0, 16);

// Best effort: a lost race skips this update; the next hand writes it again.
export async function postStack(caseId, chips, now = Date.now()) {
  const store = casino(), key = `board:${isoWeek(now)}`, k = boardKey(caseId);
  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await store.getWithMetadata(key, { type: "json" });
    const rows = (cur?.data?.rows || []).filter(r => r.k !== k);
    const floor = rows.length >= BOARD_KEEP ? Math.min(...rows.map(r => r.chips)) : -1;
    if (chips <= floor && !(cur?.data?.rows || []).some(r => r.k === k)) return;
    rows.push({ k, l4: caseId.slice(-4), chips, at: new Date(now).toISOString() });
    rows.sort((a, b) => b.chips - a.chips);
    const res = await store.setJSON(key, { rows: rows.slice(0, BOARD_KEEP) }, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return;
  }
}

// Top n this week, case last-4 only.
export async function readBoard(n = 10, now = Date.now()) {
  const d = await casino().get(`board:${isoWeek(now)}`, { type: "json" });
  return { week: isoWeek(now), rows: (d?.rows || []).slice(0, n).map((r, i) => ({ rank: i + 1, case: `…${r.l4}`, chips: r.chips })) };
}

export async function dropFromBoard(caseId, now = Date.now()) {
  const store = casino(), key = `board:${isoWeek(now)}`, k = boardKey(caseId);
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await store.getWithMetadata(key, { type: "json" });
    if (!cur?.data?.rows?.some(r => r.k === k)) return;
    const res = await store.setJSON(key, { rows: cur.data.rows.filter(r => r.k !== k) }, { onlyIfMatch: cur.etag });
    if (res.modified) return;
  }
}
