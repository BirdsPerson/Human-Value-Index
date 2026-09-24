// Netlify Blobs access. Only works inside Functions v2 (default-export handlers);
// v1 exports.handler throws MissingBlobsEnvironmentError.
import { getStore } from "@netlify/blobs";

const cases = () => getStore({ name: "hvi-cases", consistency: "strong" });
const pen = () => getStore({ name: "hvi-pen", consistency: "strong" });
const limits = () => getStore({ name: "hvi-limits", consistency: "strong" });
const figures = () => getStore({ name: "hvi-figures", consistency: "strong" });
const sprites = () => getStore({ name: "hvi-sprites", consistency: "strong" });

// "day" (YYYY-MM-DD), "minute" (YYYY-MM-DDTHH:MM) or "month" (YYYY-MM), UTC.
const bucket = window => new Date().toISOString().slice(0, window === "minute" ? 16 : window === "month" ? 7 : 10);

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
  // A hand-assigned sprite (e.g. /sprites/scott.png) survives re-assessment.
  if (card.sprite == null) {
    const prev = await store.get(key, { type: "json" }).catch(() => null);
    if (prev?.sprite) card = { ...card, sprite: prev.sprite };
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
// ponytail: old keys are never deleted; a few bytes each, prune if it ever matters.
export async function hitLimit(key, max, window = "day") {
  const store = limits();
  const k = `${bucket(window)}:${key}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await store.getWithMetadata(k, { type: "json" });
    const count = (cur?.data?.count || 0) + 1;
    if (count > max) return { ok: false, count: count - 1 };
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
// hvi-figures: slug -> card, plus an "index" blob the pen reads in one GET. The Mac
// sprite job (scripts/referral_sprites.py) is the reader for spriteStatus "pending".
const FIG_INDEX = "index";
const FIG_MAX = 300;

// The index shares the store, so its key is never read as a figure ("Index" is a name).
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

export async function indexFigure(card) {
  const store = figures();
  const entry = figureIndexEntry(card);
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await store.getWithMetadata(FIG_INDEX, { type: "json" });
    const base = cur?.data?.cards || [];
    const cards = [entry, ...base.filter(c => c.slug !== card.slug)].slice(0, FIG_MAX);
    const res = await store.setJSON(FIG_INDEX, { cards }, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return;
  }
  console.warn("figure index: lost the write race; card saved");
}

// Keep in step with INDEX_KEYS in scripts/referral_sprites.py, which rewrites entries.
export const figureIndexEntry = c => ({
  slug: c.slug, name: c.name, score: c.score, tier: c.tier, breakdown: c.breakdown, verdict: c.verdict,
  verdictStatus: c.verdictStatus, noDangle: Boolean(c.noDangle), wikidata: c.wikidata, born: c.born ?? null, died: c.died ?? null,
  sprite: c.sprite ?? null, spriteStatus: c.spriteStatus, referredBy: c.referredBy, at: c.at,
});

export async function listFigures() {
  const idx = await figures().get(FIG_INDEX, { type: "json" });
  return (idx?.cards || []).filter(c => c && c.slug && !c.removed);
}

export async function getSprite(slug) {
  return sprites().get(slug, { type: "arrayBuffer" });
}
