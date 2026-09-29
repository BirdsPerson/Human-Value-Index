// Migrates the figure index from the one legacy blob (hvi-figures/index) to 64 shards
// (hvi-figure-index/00..63; netlify/lib/figure-index.js) with zero downtime.
//
//   node scripts/index-shards.mjs --dry-run    # plan only: counts per shard, no writes
//   node scripts/index-shards.mjs              # build every shard from the legacy blob, verify, set the flag
//   node scripts/index-shards.mjs --verify     # compare shards with the legacy blob, entry by entry
//   node scripts/index-shards.mjs --rollback   # rebuild the legacy blob from the shards, drop the flag
//
// Readers use the shards only once the flag blob hvi-figure-index/index-v2 exists and the
// legacy blob until then. The legacy blob is never deleted: it is the backup.
// Rollback: `--rollback` (the legacy blob then holds everything the shards hold; functions
// fall back to it within 5 minutes, the flag cache), then revert the commit that stopped
// writers from writing the legacy blob (WRITE_LEGACY) so it stays current.
import { store, retry } from "./roster/prod.mjs";
import * as FI from "../netlify/lib/figure-index.js";

const io = { figures: store("hvi-figures"), index: store(FI.INDEX_STORE) };
const args = process.argv.slice(2);

const report = r => console.log(`legacy ${r.legacy} entries, shards ${r.shards} (${r.dupes} duplicate slugs); only in legacy: ${r.onlyLegacy.join(", ") || "none"}; only in shards: ${r.onlyShards.join(", ") || "none"}; entries that differ: ${r.differ.join(", ") || "none"}; misplaced: ${r.misplaced.join(", ") || "none"} -> ${r.ok ? "MATCH" : "MISMATCH"}`);

async function main() {
  if (args.includes("--dry-run")) {
    const cur = await retry(() => io.figures.getWithMetadata(FI.LEGACY, { type: "json" }));
    const cards = (cur?.data?.cards || []).filter(c => c?.slug);
    const sizes = FI.shardSizes(cards);
    const flag = await retry(() => io.index.get(FI.FLAG, { type: "json" }));
    const keys = (await retry(() => io.index.list())).blobs.map(b => b.key);
    console.log(`legacy: ${cards.length} entries, ${new Set(cards.map(c => c.slug)).size} slugs, ${JSON.stringify(cur?.data || {}).length} bytes, etag ${cur?.etag}`);
    console.log(`per shard: min ${Math.min(...sizes)} max ${Math.max(...sizes)} empty ${sizes.filter(n => !n).length}`);
    console.log(`flag: ${flag ? JSON.stringify(flag) : "absent"}; ${FI.INDEX_STORE} holds ${keys.length} keys`);
    return;
  }
  if (args.includes("--verify")) {
    const r = await retry(() => FI.compareShards(io));
    report(r);
    process.exit(r.ok ? 0 : 1);
  }
  if (args.includes("--rollback")) {
    const n = await retry(() => FI.rollback(io));
    console.log(`rolled back: legacy index holds ${n} entries; flag removed (functions follow within 5 minutes)`);
    return;
  }
  const r = await retry(() => FI.migrate(io));
  if (r.already) { console.log("already migrated (flag present); use --verify"); return; }
  report(r);
  if (!r.ok) { console.error("not flagged: re-run (a writer may have raced the compare)"); process.exit(1); }
  console.log(`migrated: ${r.shards} entries in ${FI.SHARDS} shards; flag ${FI.FLAG} set`);
}

main().catch(e => { console.error(`index-shards: FAILED ${e?.message || e}`); process.exit(1); });
