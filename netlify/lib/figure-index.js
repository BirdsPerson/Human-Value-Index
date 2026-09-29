// The figure index: what the census reads instead of opening every card. 64 shards by slug
// hash in their own store (hvi-figure-index, keys "00".."63"), each { cards: [entry] }, every
// write conditional (etag). No cap: nothing is ever evicted to make room.
//
// One writer class: Node, through writeEntries (functions via netlify/lib/store.js, Mac
// scripts via scripts/roster/prod.mjs, the Python sprite job via scripts/index-sync.mjs).
// An entry is always derived from its card (figureIndexEntry), never edited in place.
//
// Migration (scripts/index-shards.mjs): the shards are built from the legacy single blob
// (hvi-figures/index), verified, then the flag blob "index-v2" is written. Readers use the
// shards once the flag exists and the legacy blob until then. The legacy blob is kept as a
// backup; `node scripts/index-shards.mjs --rollback` rebuilds it from the shards and drops
// the flag.
export const SHARDS = 64;
export const INDEX_STORE = "hvi-figure-index";
export const FLAG = "index-v2";
export const LEGACY = "index";
// Transition: writers also keep the legacy blob current, so a rollback loses nothing.
export const WRITE_LEGACY = true;

// FNV-1a over the slug's UTF-16 code units: stable across Node versions and machines.
export function shardOf(slug) {
  let h = 0x811c9dc5;
  const s = String(slug);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h % SHARDS;
}
export const shardKey = i => String(i).padStart(2, "0");
export const SHARD_KEYS = Array.from({ length: SHARDS }, (_, i) => shardKey(i));
export const shardKeyOf = slug => shardKey(shardOf(slug));

// Newest filed first (the order the pen admits referrals in), slug breaks ties.
export const byNewest = (a, b) => String(b.at || "").localeCompare(String(a.at || "")) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

// Every shard, or an error. A missing or unreadable shard is never read as an empty bucket:
// the census would silently drop everyone hashed into it.
export async function readShards(index) {
  const got = await Promise.all(SHARD_KEYS.map(k => index.get(k, { type: "json" })));
  const out = [];
  got.forEach((d, i) => {
    if (!d || !Array.isArray(d.cards)) throw new Error(`figure index shard ${SHARD_KEYS[i]} is missing`);
    out.push(...d.cards);
  });
  return out.filter(c => c?.slug).sort(byNewest);
}

// Once migrated, always migrated (a rollback deletes the flag and redeploys), so a positive
// answer is kept for a few minutes rather than re-read on every census.
let migratedAt = 0;
export async function isMigrated(index) {
  if (Date.now() - migratedAt < 5 * 60 * 1000) return true;
  const on = Boolean(await index.get(FLAG, { type: "json" }));
  if (on) migratedAt = Date.now();
  return on;
}
export const forgetMigrated = () => { migratedAt = 0; };

// io: { figures: the hvi-figures store, index: the hvi-figure-index store }
export async function readIndex(io) {
  if (await isMigrated(io.index)) return readShards(io.index);
  const legacy = await io.figures.get(LEGACY, { type: "json" });
  return (legacy?.cards || []).filter(c => c?.slug);
}

// changes: [{ slug, entry }] with entry null to drop the slug. Newest write first, as the
// legacy blob always did. Returns null when nothing would change (no write).
export function applyEntries(base, changes) {
  let next = base;
  for (const { slug, entry } of changes) {
    next = next.filter(c => c?.slug !== slug);
    if (entry) next = [entry, ...next];
  }
  return JSON.stringify(next) === JSON.stringify(base) ? null : next;
}

async function cas(store, key, edit, { tries, create }) {
  for (let attempt = 0; attempt < tries; attempt++) {
    const cur = await store.getWithMetadata(key, { type: "json" });
    if (!cur && !create) throw new Error(`figure index ${key} is missing; not recreating it with one entry`);
    const next = edit(cur?.data?.cards || []);
    if (!next) return false;
    const res = await store.setJSON(key, { ...(cur?.data || {}), cards: next }, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return true;
  }
  throw new Error(`figure index ${key}: lost the write race ${tries} times`);
}

// Legacy first, then the shards: the migration reads each shard's etag before the legacy
// blob, so a write racing it either lands on top of the migrated shard or makes the
// migration's conditional write fail and retry with the fresh legacy blob.
export async function writeEntries(io, changes, { tries = 8, legacy = WRITE_LEGACY } = {}) {
  if (!changes.length) return;
  if (legacy) await cas(io.figures, LEGACY, base => applyEntries(base, changes), { tries, create: true });
  // After the migration every shard exists; a missing one is an error, not a fresh bucket.
  const create = !(await isMigrated(io.index));
  const byShard = new Map();
  for (const ch of changes) {
    const k = shardKeyOf(ch.slug);
    if (!byShard.has(k)) byShard.set(k, []);
    byShard.get(k).push(ch);
  }
  await Promise.all([...byShard].map(([k, list]) => cas(io.index, k, base => applyEntries(base, list), { tries, create })));
}

// ---- migration (scripts/index-shards.mjs) -------------------------------------------------
async function legacyCards(io) {
  const cur = await io.figures.get(LEGACY, { type: "json" });
  if (!cur || !Array.isArray(cur.cards)) throw new Error("no legacy index blob (hvi-figures/index)");
  return cur.cards.filter(c => c?.slug);
}

function bucket(cards) {
  const out = new Map(SHARD_KEYS.map(k => [k, []]));
  for (const c of cards) out.get(shardKeyOf(c.slug)).push(c);
  return out;
}
export const shardSizes = cards => [...bucket(cards).values()].map(l => l.length);

// Every shard from the legacy blob. Per shard: its etag first, then the legacy blob, then a
// write under that etag. A writer (legacy, then shard) racing this either lands on top
// afterwards or fails the conditional write here, which retries with a fresh legacy read.
export async function buildShards(io, { rounds = 8 } = {}) {
  let todo = [...SHARD_KEYS];
  for (let round = 0; todo.length && round < rounds; round++) {
    const curs = new Map(await Promise.all(todo.map(async k => [k, await io.index.getWithMetadata(k, { type: "json" })])));
    const buckets = bucket(await legacyCards(io));
    const lost = [];
    await Promise.all(todo.map(async k => {
      const cur = curs.get(k);
      const res = await io.index.setJSON(k, { cards: buckets.get(k) }, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
      if (!res.modified) lost.push(k);
    }));
    todo = lost;
  }
  if (todo.length) throw new Error(`shards ${todo.join(", ")} lost the write race ${rounds} rounds running`);
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Shards against the legacy blob: the same slugs, each entry identical, each in its own shard.
export async function compareShards(io) {
  const [legacy, raw] = await Promise.all([legacyCards(io), Promise.all(SHARD_KEYS.map(k => io.index.get(k, { type: "json" })))]);
  const misplaced = [], shards = [];
  raw.forEach((d, i) => {
    if (!d || !Array.isArray(d.cards)) throw new Error(`figure index shard ${SHARD_KEYS[i]} is missing`);
    for (const c of d.cards) { shards.push(c); if (shardKeyOf(c.slug) !== SHARD_KEYS[i]) misplaced.push(`${c.slug}@${SHARD_KEYS[i]}`); }
  });
  const a = new Map(legacy.map(c => [c.slug, c])), b = new Map(shards.map(c => [c.slug, c]));
  const onlyLegacy = [...a.keys()].filter(k => !b.has(k)), onlyShards = [...b.keys()].filter(k => !a.has(k));
  const differ = [...a.keys()].filter(k => b.has(k) && !same(a.get(k), b.get(k)));
  const dupes = shards.length - b.size;
  return { legacy: a.size, shards: b.size, dupes, onlyLegacy, onlyShards, differ, misplaced,
    ok: !onlyLegacy.length && !onlyShards.length && !differ.length && !misplaced.length && !dupes };
}

// Build, verify, then flag. Returns the comparison; the flag is written only when it matched.
export async function migrate(io) {
  if (await io.index.get(FLAG, { type: "json" })) return { already: true };
  await buildShards(io);
  const r = await compareShards(io);
  if (r.ok) await io.index.setJSON(FLAG, { at: new Date().toISOString(), entries: r.shards, shards: SHARDS });
  return r;
}

// The legacy blob rebuilt from the shards, then the flag dropped: readers fall back to it.
export async function rollback(io, { tries = 8 } = {}) {
  const cards = await readShards(io.index);
  await cas(io.figures, LEGACY, base => (same(base, cards) ? null : cards), { tries, create: true });
  await io.index.delete(FLAG);
  forgetMigrated();
  return cards.length;
}
