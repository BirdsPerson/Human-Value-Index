// Netlify Blobs access. Only works inside Functions v2 (default-export handlers);
// v1 exports.handler throws MissingBlobsEnvironmentError.
import { getStore } from "@netlify/blobs";
import * as FI from "./figure-index.js";

const cases = () => getStore({ name: "hvi-cases", consistency: "strong" });
const pen = () => getStore({ name: "hvi-pen", consistency: "strong" });
const limits = () => getStore({ name: "hvi-limits", consistency: "strong" });
const figures = () => getStore({ name: "hvi-figures", consistency: "strong" });
const sprites = () => getStore({ name: "hvi-sprites", consistency: "strong" });

// "day" (YYYY-MM-DD), "hour" (YYYY-MM-DDTHH), "minute" (YYYY-MM-DDTHH:MM) or "month" (YYYY-MM), UTC.
const BUCKET_LEN = { minute: 16, hour: 13, month: 7, day: 10 };
const bucket = window => new Date().toISOString().slice(0, BUCKET_LEN[window] || 10);

export async function getCase(caseId) {
  return (await cases().get(caseId, { type: "json" })) || null;
}

// Read-modify-write with an etag, so a session opened in another tab during a
// multi-second scoring call isn't overwritten. fn gets the fresh record (or null)
// and returns the record to write, or undefined to write nothing.
export async function updateCase(caseId, fn) {
  const store = cases();
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await store.getWithMetadata(caseId, { type: "json" });
    const next = fn(cur?.data ? structuredClone(cur.data) : null);
    if (next === undefined) return cur?.data || null;
    const res = await store.setJSON(caseId, next, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return next;
  }
  throw new Error(`updateCase ${caseId}: lost the write race five times`);
}

// The pen reads one index blob (newest PEN_MAX cards), not one GET per citizen ever
// scored. The per-case blobs stay as the source of truth; the index is rebuilt from
// them only if it is missing.
const PEN_MAX = 200;
const PEN_INDEX = "index";

export async function putPenCard(caseId, card) {
  const store = pen();
  const key = `citizen:${caseId}`;
  // A hand-assigned sprite (e.g. /sprites/scott.png) and the Housing Office's assignment
  // (netlify/lib/housing.js) survive re-assessment.
  if (card.sprite == null || card.home == null) {
    const prev = await store.get(key, { type: "json" }).catch(() => null);
    if (card.sprite == null && prev?.sprite) card = { ...card, sprite: prev.sprite };
    if (card.home == null && prev?.home) card = { ...card, home: prev.home };
  }
  await store.setJSON(key, card);
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await store.getWithMetadata(PEN_INDEX, { type: "json" });
    const base = cur?.data?.cards || (await rebuildPenIndex(store));
    const cards = [{ key, ...card }, ...base.filter(c => c.key !== key)].slice(0, PEN_MAX);
    const res = await store.setJSON(PEN_INDEX, { cards }, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return;
  }
  console.warn("pen index: lost the write race; card saved, index catches up on the next write");
}

// A new outfit on a citizen's file photo: the card and its line in the index change in place
// (the index keeps its order: dressing is not news). No card on file: nothing to change.
export async function setPenAvatar(caseId, avatar) {
  const store = pen();
  const key = `citizen:${caseId}`;
  const prev = await store.get(key, { type: "json" }).catch(() => null);
  if (!prev) return false;
  await store.setJSON(key, { ...prev, avatar });
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await store.getWithMetadata(PEN_INDEX, { type: "json" });
    if (!cur?.data?.cards) return true;
    if (!cur.data.cards.some(c => c.key === key)) return true;
    const cards = cur.data.cards.map(c => (c.key === key ? { ...c, avatar } : c));
    const res = await store.setJSON(PEN_INDEX, { cards }, { onlyIfMatch: cur.etag });
    if (res.modified) return true;
  }
  return true;
}

// The Housing Office's assignment on a citizen's card and its line in the index (src/city/sim.js
// homeAt reads it from the census). In place, like the avatar. No card on file: nothing to change.
export async function setPenHome(caseId, home) {
  const store = pen();
  const key = `citizen:${caseId}`;
  const prev = await store.get(key, { type: "json" }).catch(() => null);
  if (!prev) return false;
  await store.setJSON(key, { ...prev, home });
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await store.getWithMetadata(PEN_INDEX, { type: "json" });
    if (!cur?.data?.cards) return true;
    if (!cur.data.cards.some(c => c.key === key)) return true;
    const cards = cur.data.cards.map(c => (c.key === key ? { ...c, home } : c));
    const res = await store.setJSON(PEN_INDEX, { cards }, { onlyIfMatch: cur.etag });
    if (res.modified) return true;
  }
  return true;
}

async function rebuildPenIndex(store) {
  const { blobs } = await store.list({ prefix: "citizen:" });
  const cards = await Promise.all(blobs.map(b => store.get(b.key, { type: "json" }).then(c => c && { key: b.key, ...c }).catch(() => null)));
  return cards.filter(Boolean).sort((a, b) => (b.updated || "").localeCompare(a.updated || "")).slice(0, PEN_MAX);
}

export async function listPenCards(max = PEN_MAX) {
  const store = pen();
  const idx = await store.get(PEN_INDEX, { type: "json" });
  const cards = idx?.cards || (await rebuildPenIndex(store));
  return cards.slice(0, max);
}

// Daily counter. Increments and reports whether the caller is still under max.
// Conditional writes (etag) so two concurrent requests can't both read 4 and write 5.
// window "day" (YYYY-MM-DD) or "minute" (YYYY-MM-DDTHH:MM) buckets the key.
// Old keys are pruned daily by netlify/lib/prune.js (7 days after their window closes).
export async function hitLimit(key, max, window = "day", amount = 1) {
  const store = limits();
  const k = `${bucket(window)}:${key}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await store.getWithMetadata(k, { type: "json" });
    const count = (cur?.data?.count || 0) + amount;
    if (count > max) return { ok: false, count: count - amount };
    const opts = cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true };
    const res = await store.setJSON(k, { count }, opts);
    if (res.modified) return { ok: true, count };
  }
  // Lost the race four times: someone is hammering this key. Refuse.
  return { ok: false, count: max };
}

// Gives back one unit charged by hitLimit (the call it paid for never happened).
// Best effort: a failed refund only costs the subject one slot.
export async function refundLimit(key, window = "day") {
  const store = limits();
  const k = `${bucket(window)}:${key}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await store.getWithMetadata(k, { type: "json" });
    if (!cur?.data?.count) return;
    const res = await store.setJSON(k, { count: cur.data.count - 1 }, { onlyIfMatch: cur.etag });
    if (res.modified) return;
  }
}

// Reads a counter without charging it (for "remaining this cycle" lines).
export async function peekLimit(key, window = "day") {
  const cur = await limits().get(`${bucket(window)}:${key}`, { type: "json" });
  return cur?.count || 0;
}

// ---- referred public figures ------------------------------------------------
// hvi-figures: slug -> card (plus the legacy "index" blob, kept as the migration's backup).
// The census reads the sharded index (netlify/lib/figure-index.js). The Mac sprite job
// (scripts/referral_sprites.py) is the reader for spriteStatus "pending".
const FIG_INDEX = FI.LEGACY;
const figIndex = () => getStore({ name: FI.INDEX_STORE, consistency: "strong" });
const indexIo = () => ({ figures: figures(), index: figIndex() });

// The legacy index shares the store, so its key is never read as a figure ("Index" is a name).
export async function getFigure(slug) {
  if (!slug || slug === FIG_INDEX) return null;
  return (await figures().get(slug, { type: "json" })) || null;
}

// Writes the card only if the slug is new (a concurrent referral of the same person
// loses cleanly). Returns true when this call created it.
export async function createFigure(card) {
  const res = await figures().setJSON(card.slug, card, { onlyIfNew: true });
  if (!res.modified) return false;
  await indexFigure(card);
  return true;
}

// The card is already saved; a failed index write is logged, and the sprite job's repair
// pass (scripts/index-sync.mjs --repair, every 10 minutes) indexes any card missing.
export async function indexFigure(card) {
  try {
    await FI.writeEntries(indexIo(), [{ slug: card.slug, entry: figureIndexEntry(card) }], { tries: 5 });
  } catch (e) {
    console.warn(`figure index: ${e.message}; card saved`);
  }
}

// An index entry is derived from its card, never edited in place (scripts/index-sync.mjs).
export const figureIndexEntry = c => ({
  slug: c.slug, name: c.name, qualifier: c.qualifier ?? null, score: c.score, tier: c.tier, breakdown: c.breakdown, verdict: c.verdict,
  verdictStatus: c.verdictStatus, noDangle: Boolean(c.noDangle), wikidata: c.wikidata, born: c.born ?? null, died: c.died ?? null,
  sprite: c.sprite ?? null, spriteStatus: c.spriteStatus, referredBy: c.referredBy, at: c.at, people: c.people ?? null, harmReview: c.harmReview ?? null, harmReviewPending: Boolean(c.harmReviewPending),
  source: c.source ?? null,
  places: c.places ?? null, stratum: c.stratum ?? null, description: c.description ?? null, origin: c.origin ?? null, height: c.height ?? null, sex: c.sex ?? null,
  skin: c.skin ?? null,
  localOfficial: c.localOfficial === true ? true : undefined, candidate: c.candidate === true ? true : undefined,
  // The file's movement log (src/movement.js); the Department's changes shown apart from the subject's.
  scoreHistory: Array.isArray(c.scoreHistory) ? c.scoreHistory.slice(-40) : null,
});

// Every shard or a throw (never a partial census): see readShards.
export async function listFigures() {
  return (await FI.readIndex(indexIo())).filter(c => c && c.slug && !c.removed);
}

export async function getSprite(slug) {
  return sprites().get(slug, { type: "arrayBuffer" });
}

// The production sprite atlas (scripts/prod-atlas.mjs writes it; /api/atlas serves it).
const atlas = () => getStore({ name: "hvi-atlas", consistency: "strong" });
export const getAtlasJson = () => atlas().get("current", { type: "json" });
export const getAtlasSheet = hash => atlas().get(`sheet-${hash}`, { type: "arrayBuffer" });
export const getAtlasMap = hash => atlas().get(`map-${hash}`, { type: "text" });

// ---- purge (the subject's own request, /api/purge) ---------------------------------------
export async function deleteCase(caseId) {
  await cases().delete(caseId);
}

export async function removePenCard(caseId) {
  const store = pen();
  const key = `citizen:${caseId}`;
  await store.delete(key);
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await store.getWithMetadata(PEN_INDEX, { type: "json" });
    if (!cur?.data?.cards) return;
    const cards = cur.data.cards.filter(c => c.key !== key);
    if (cards.length === cur.data.cards.length) return;
    const res = await store.setJSON(PEN_INDEX, { cards }, { onlyIfMatch: cur.etag });
    if (res.modified) return;
  }
  console.warn("pen index: lost the write race while purging; the card blob is gone");
}

// ---- correction / takedown requests ------------------------------------------------------
const requests = () => getStore({ name: "hvi-requests", consistency: "strong" });
export async function putRequest(id, rec) {
  await requests().setJSON(id, rec, { onlyIfNew: true });
}
