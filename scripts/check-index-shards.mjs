// The sharded figure index (netlify/lib/figure-index.js) with an in-memory Blobs store:
// stable sharding, conditional-write retries, strict reads (a failed or missing shard fails
// the census, never reads as an empty bucket), no eviction past the old 5,000 cap, the legacy
// fallback before the migration flag, a migration raced by writers, and the Mac-side
// writers (syncIndex, index-sync --repair). Run: node scripts/check-index-shards.mjs
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";

globalThis.__blobs = new Map();
globalThis.__fail = null;   // (store, op, key) => true to throw
globalThis.__race = null;   // (store, key) => called before a conditional write lands
const blobsSrc = `
let n = 0;
export function getStore({ name }) {
  const m = globalThis.__blobs;
  if (!m.has(name)) m.set(name, new Map());
  const s = m.get(name);
  const tick = () => new Promise(r => setImmediate(r));
  const fail = (op, k) => { if (globalThis.__fail && globalThis.__fail(name, op, k)) throw new Error("blobs down: " + name + "/" + k); };
  const read = k => (s.has(k) ? JSON.parse(JSON.stringify(s.get(k).data)) : null);
  return {
    async get(k) { await tick(); fail("get", k); return read(k); },
    async getWithMetadata(k) { await tick(); fail("get", k); return s.has(k) ? { data: read(k), etag: s.get(k).etag, metadata: {} } : null; },
    async setJSON(k, v, o = {}) {
      await tick(); fail("set", k);
      if (globalThis.__race) await globalThis.__race(name, k);
      if (o.onlyIfNew && s.has(k)) return { modified: false };
      if (o.onlyIfMatch && (!s.has(k) || s.get(k).etag !== o.onlyIfMatch)) return { modified: false };
      const etag = "e" + ++n; s.set(k, { data: JSON.parse(JSON.stringify(v)), etag }); return { modified: true, etag };
    },
    async delete(k) { await tick(); s.delete(k); },
    list({ prefix = "", paginate } = {}) {
      const page = { blobs: [...s.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) };
      if (paginate) return (async function* () { yield page; })();
      return Promise.resolve(page);
    },
  };
}`;
registerHooks({ resolve(spec, ctx, next) { return spec === "@netlify/blobs" ? { url: "data:text/javascript," + encodeURIComponent(blobsSrc), shortCircuit: true } : next(spec, ctx); } });
const __warn = console.warn; console.warn = (...a) => { if (process.env.DEBUG_CHECK) __warn(...a); };
process.env.NETLIFY_AUTH_TOKEN = "test";

const { getStore } = await import("@netlify/blobs");
const FI = await import("../netlify/lib/figure-index.js");
const store = await import("../netlify/lib/store.js");
const { censusSubjects } = await import("../netlify/lib/census.js");
const prod = await import("./roster/prod.mjs");
const { repair } = await import("./index-sync.mjs");

const io = () => ({ figures: getStore({ name: "hvi-figures" }), index: getStore({ name: FI.INDEX_STORE }) });
const raw = (name, key) => globalThis.__blobs.get(name)?.get(key)?.data ?? null;
const reset = () => { globalThis.__blobs = new Map(); globalThis.__fail = null; globalThis.__race = null; FI.forgetMigrated(); };
const card = (i, extra = {}) => ({
  slug: `subject-${i}`, name: `Subject ${i}`, score: 400 + (i % 300), tier: "B", breakdown: { care: 50 }, verdict: "V.", verdictStatus: "published",
  wikidata: `Q${1000 + i}`, spriteStatus: "pending", referredBy: "check", at: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString(), ...extra,
});

// ---- sharding is stable and spread ------------------------------------------------------
assert.equal(FI.SHARDS, 64);
assert.deepEqual(["dolly-parton", "fred-rogers", "index", "a", "é"].map(FI.shardOf), [58, 7, 43, 44, 4], "pinned hashes: changing shardOf strands every entry");
assert.equal(FI.shardKeyOf("fred-rogers"), "07");
assert.equal(FI.SHARD_KEYS.length, 64);
assert.equal(new Set(FI.SHARD_KEYS).size, 64);
{
  const sizes = FI.shardSizes(Array.from({ length: 6400 }, (_, i) => card(i)));
  assert.ok(Math.min(...sizes) > 60 && Math.max(...sizes) < 150, `shards stay even: ${Math.min(...sizes)}..${Math.max(...sizes)}`);
}

// ---- before the flag: readers use the legacy blob; shards-only writers refuse ---------------
reset();
{
  const legacy = [card(2), card(1)].map(store.figureIndexEntry);
  await getStore({ name: "hvi-figures" }).setJSON("index", { cards: legacy });
  // A stray shard written before the migration is not read.
  await getStore({ name: FI.INDEX_STORE }).setJSON(FI.shardKeyOf("ghost"), { cards: [{ slug: "ghost", name: "Ghost", score: 1 }] });
  assert.deepEqual((await store.listFigures()).map(c => c.slug), ["subject-2", "subject-1"], "legacy fallback before the flag");
  await assert.rejects(FI.writeEntries(io(), [{ slug: "subject-3", entry: store.figureIndexEntry(card(3)) }]), /not migrated/, "a shards-only write to an unmigrated store would be invisible: refused");
  assert.equal(await store.createFigure(card(3)), true, "the card is saved; its index write is refused and logged");
  assert.equal(raw("hvi-figures", "index").cards.length, 2);
  // The transition writers (legacy blob, then shard) the migration was run under.
  await FI.writeEntries(io(), [{ slug: "subject-3", entry: store.figureIndexEntry(card(3)) }], { legacy: true });
  assert.deepEqual(raw("hvi-figures", "index").cards.map(c => c.slug), ["subject-3", "subject-2", "subject-1"], "transition: the legacy blob is written");
  assert.equal(raw(FI.INDEX_STORE, FI.shardKeyOf("subject-3")).cards.find(c => c.slug === "subject-3").name, "Subject 3", "transition: the shard is written too");
  assert.equal(await store.createFigure(card(3)), false, "a taken slug is refused");
}

// ---- migration: build, verify, flag; readers switch --------------------------------------
{
  const r = await FI.migrate(io());
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.shards, 3);
  assert.ok(raw(FI.INDEX_STORE, FI.FLAG), "flag set");
  assert.equal(FI.SHARD_KEYS.every(k => Array.isArray(raw(FI.INDEX_STORE, k)?.cards)), true, "every shard exists, empty ones included");
  assert.equal(raw(FI.INDEX_STORE, FI.shardKeyOf("ghost")).cards.some(c => c.slug === "ghost"), false, "the stray entry is gone: shards are the legacy blob");
  assert.deepEqual((await store.listFigures()).map(c => c.slug), ["subject-3", "subject-2", "subject-1"], "shards read, newest first");
  assert.deepEqual(await FI.migrate(io()), { already: true });
  // After the flag, a legacy-only change is not what readers see.
  await getStore({ name: "hvi-figures" }).setJSON("index", { cards: [] });
  assert.equal((await store.listFigures()).length, 3, "flagged: shards, not the legacy blob");
}

// ---- strict reads: a failed or missing shard fails the census -----------------------------
{
  globalThis.__fail = (name, op, k) => name === FI.INDEX_STORE && op === "get" && k === "17";
  await assert.rejects(store.listFigures(), /blobs down/);
  await assert.rejects(censusSubjects({ strict: true }), /blobs down/, "the social tick's census fails rather than forget a shard's people");
  assert.equal((await censusSubjects()).filter(s => s.kind === "figure").length, 0, "the pen's non-strict census drops all figures, never some");
  globalThis.__fail = null;
  const k = FI.shardKeyOf("subject-2");
  const keep = raw(FI.INDEX_STORE, k);
  globalThis.__blobs.get(FI.INDEX_STORE).delete(k);
  await assert.rejects(store.listFigures(), new RegExp(`shard ${k} is missing`), "a missing shard is not an empty bucket");
  await assert.rejects(censusSubjects({ strict: true }), /missing/);
  // Writers do not recreate a vanished shard holding one entry.
  await store.indexFigure(card(2, { score: 1 }));
  assert.equal(raw(FI.INDEX_STORE, k), null, "a flagged writer refuses to recreate a missing shard");
  await getStore({ name: FI.INDEX_STORE }).setJSON(k, keep);
  assert.equal((await censusSubjects({ strict: true })).filter(s => s.kind === "figure").length, 3);
}

// ---- conditional writes: a racing writer is retried, not overwritten ----------------------
{
  const k = FI.shardKeyOf("subject-10");
  let raced = false;
  globalThis.__race = async (name, key) => {
    if (raced || name !== FI.INDEX_STORE || key !== k) return;
    raced = true;
    // Another writer lands in the same shard between our read and our write.
    const s = globalThis.__blobs.get(FI.INDEX_STORE);
    const cur = s.get(k);
    s.set(k, { data: { cards: [store.figureIndexEntry(card(99, { slug: "racer" })), ...cur.data.cards] }, etag: "raced" });
  };
  await FI.writeEntries(io(), [{ slug: "subject-10", entry: store.figureIndexEntry(card(10)) }]);
  globalThis.__race = null;
  assert.ok(raced);
  const slugs = raw(FI.INDEX_STORE, k).cards.map(c => c.slug);
  assert.ok(slugs.includes("subject-10") && slugs.includes("racer"), "both writes survive the race");
  // A writer that keeps losing gives up loudly (the card stays; repair re-indexes it).
  globalThis.__race = async (name, key) => { if (name === FI.INDEX_STORE && key === k) globalThis.__blobs.get(FI.INDEX_STORE).get(k).etag = "x" + Math.random(); };
  await assert.rejects(FI.writeEntries(io(), [{ slug: "subject-10", entry: null }], { tries: 3 }), /lost the write race 3 times/);
  globalThis.__race = null;
  // Removing drops the entry; a no-op writes nothing.
  await FI.writeEntries(io(), [{ slug: "racer", entry: null }]);
  assert.equal(raw(FI.INDEX_STORE, FI.shardKeyOf("racer")).cards.some(c => c.slug === "racer"), false);
  const before = globalThis.__blobs.get(FI.INDEX_STORE).get(k).etag;
  await FI.writeEntries(io(), [{ slug: "racer", entry: null }]);
  assert.equal(globalThis.__blobs.get(FI.INDEX_STORE).get(k).etag, before, "a no-op change is not written");
}

// ---- no eviction: 6,000 figures, then more ------------------------------------------------
reset();
{
  const legacy = Array.from({ length: 6000 }, (_, i) => store.figureIndexEntry(card(i))).reverse();
  await getStore({ name: "hvi-figures" }).setJSON("index", { cards: legacy });
  const r = await FI.migrate(io());
  assert.equal(r.ok, true);
  assert.equal(r.shards, 6000);
  for (let i = 6000; i < 6005; i++) assert.equal(await store.createFigure(card(i)), true);
  const all = await store.listFigures();
  assert.equal(all.length, 6005, "nothing evicted past the old 5,000 cap");
  assert.equal(all[0].slug, "subject-6004", "newest first");
  assert.ok(all.some(c => c.slug === "subject-0"), "the oldest figure is still on file");
  assert.equal(raw("hvi-figures", "index").cards.length, 6000, "after the migration the legacy blob is frozen (the backup)");
  assert.equal((await censusSubjects({ strict: true })).length, 6005);
}

// ---- a migration raced by live writers still matches ---------------------------------------
reset();
{
  await getStore({ name: "hvi-figures" }).setJSON("index", { cards: Array.from({ length: 300 }, (_, i) => store.figureIndexEntry(card(i))) });
  // 40 writers at once all contend for the one legacy blob (the reason for the shards):
  // generous retries here, so the check is about the migration, not that contention.
  const writes = Array.from({ length: 40 }, (_, j) => FI.writeEntries(io(), [{ slug: `subject-${1000 + j}`, entry: store.figureIndexEntry(card(1000 + j)) }], { tries: 200, legacy: true }));
  const [r] = await Promise.all([FI.migrate(io()).catch(e => ({ error: e.message })), ...writes]);
  // A writer between the build and the compare leaves it unflagged; a re-run settles it.
  const final = r.ok ? r : await FI.migrate(io());
  assert.equal(final.ok, true, JSON.stringify(final).slice(0, 300));
  const v = await FI.compareShards(io());
  assert.equal(v.ok, true);
  assert.equal(v.shards, 340, "every racing write landed in the shards");
}

// ---- rollback: the legacy blob rebuilt from the shards, flag dropped ------------------------
{
  await FI.writeEntries(io(), [{ slug: "subject-1", entry: null }], { legacy: false });
  const n = await FI.rollback(io());
  assert.equal(n, 339);
  assert.equal(raw(FI.INDEX_STORE, FI.FLAG), null);
  assert.equal(raw("hvi-figures", "index").cards.length, 339);
  assert.equal((await store.listFigures()).length, 339, "readers fall back to the rebuilt legacy blob");
}

// ---- a fresh store is born sharded ------------------------------------------------------------
reset();
{
  assert.deepEqual(await store.listFigures(), [], "nothing on file, nothing read");
  assert.equal(await store.createFigure(card(1)), true);
  assert.ok(raw(FI.INDEX_STORE, FI.FLAG)?.fresh, "the first write creates every shard, then the flag");
  assert.equal(FI.SHARD_KEYS.every(k => Array.isArray(raw(FI.INDEX_STORE, k)?.cards)), true);
  assert.equal(raw("hvi-figures", "index"), null, "no legacy blob is made");
  assert.deepEqual((await store.listFigures()).map(c => c.slug), ["subject-1"]);
}

// ---- Mac writers: syncIndex derives from the card; repair re-indexes ----------------------
reset();
{
  await getStore({ name: "hvi-figures" }).setJSON("index", { cards: [] });
  assert.equal((await FI.migrate(io())).ok, true);
  const figs = getStore({ name: "hvi-figures" });
  // The sprite job's path: card written (no index), then Node re-derives the entry.
  await figs.setJSON("subject-1", card(1, { spriteStatus: "ready", sprite: "/api/sprite/subject-1?v=1", skin: "tan" }));
  await prod.syncIndex(["subject-1"]);
  const e = raw(FI.INDEX_STORE, FI.shardKeyOf("subject-1")).cards[0];
  assert.equal(e.spriteStatus, "ready");
  assert.equal(e.skin, "tan", "skin (written by the sprite job) is carried in the entry");
  // Takedown: a tombstone drops the entry.
  await figs.setJSON("subject-1", { slug: "subject-1", removed: true });
  await prod.syncIndex(["subject-1"]);
  assert.equal((await prod.figureIndex()).length, 0);
  // Repair: a card never indexed, and an entry behind its card.
  await figs.setJSON("subject-2", card(2));
  await figs.setJSON("subject-3", card(3));
  await prod.syncIndex(["subject-3"]);
  await figs.setJSON("subject-3", card(3, { spriteStatus: "ready", sprite: "/api/sprite/subject-3?v=2" }));
  const lines = await repair();
  assert.deepEqual(lines, ["reindexed subject-2 (missing from the index)", "resynced subject-3 (index entry behind its card)"]);
  assert.deepEqual((await prod.figureIndex()).map(c => [c.slug, c.spriteStatus]), [["subject-3", "ready"], ["subject-2", "pending"]]);
  assert.deepEqual(await repair(), [], "a second pass finds nothing");
  // createCard (roster-grow) indexes into the shard.
  assert.equal(await prod.createCard(card(4, { run: "r1" })), true);
  assert.equal((await prod.figureIndex()).length, 3);
  // figureIndex fails on a failed shard (roster-grow, the atlas builder, backfills).
  globalThis.__fail = (name, op, k) => name === FI.INDEX_STORE && op === "get" && k === "40";
  await assert.rejects(prod.figureIndex(), /blobs down/);
  globalThis.__fail = null;
}

// ---- one writer class: the Python jobs never write the index -------------------------------
for (const f of ["referral_sprites.py", "redraw_gated.py", "skin_backfill.py", "sprite_audit.py"]) {
  const src = readFileSync(new URL(f, import.meta.url), "utf8");
  assert.equal(/"hvi-figures",\s*"index"/.test(src), false, `${f} touches the index blob directly`);
}
for (const f of ["rescore-figures.mjs", "method-apply.mjs", "harm-review.mjs", "harm-reviews.mjs", "publish-pending-verdict.mjs", "backfill-origins.mjs", "backfill-stature.mjs", "backfill-qualifiers.mjs"]) {
  const src = readFileSync(new URL(f, import.meta.url), "utf8");
  assert.equal(/figs\.(get|getWithMetadata|setJSON)\("index"|update\((figs, )?"index"|"hvi-figures", "index"/.test(src), false, `${f} writes or reads the legacy index directly`);
}
assert.equal(/FIG_MAX/.test(readFileSync(new URL("../netlify/lib/store.js", import.meta.url), "utf8")), false, "no FIG_MAX eviction");

console.log("check-index-shards: all passed");
