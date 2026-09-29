// The figure index from outside Node: the Python sprite job (scripts/referral_sprites.py) and
// the other Python tools write cards only and call this to re-derive index entries, so the
// index has one writer class (Node, conditional writes; netlify/lib/figure-index.js).
//
//   node scripts/index-sync.mjs <slug> [<slug> ...]   # re-derive these entries from their cards
//   node scripts/index-sync.mjs --dump                # print the whole index as {"cards": [...]}
//   node scripts/index-sync.mjs --repair              # index any card missing from it, resync stale sprite entries
//
// Exit 1 on any failure (an unreadable shard included): the caller must not read a partial
// index as the whole one.
import { store, figureIndex, syncIndex, retry } from "./roster/prod.mjs";
import { LEGACY } from "../netlify/lib/figure-index.js";

// Every card key in hvi-figures (the store pages its listing).
async function cardKeys() {
  const keys = [];
  for await (const page of store("hvi-figures").list({ paginate: true })) keys.push(...page.blobs.map(b => b.key));
  return keys.filter(k => k && k !== LEGACY);
}

// A card written but not indexed (a write that died between the two) is put back; an entry
// still "pending"/"failed" whose card moved on is re-derived. Only non-ready entries are
// checked against their card, so this costs a few reads, not one per figure.
export async function repair() {
  const cards = await retry(figureIndex);
  const have = new Set(cards.map(c => c.slug));
  const figs = store("hvi-figures");
  const out = [];
  const missing = [];
  for (const key of await retry(cardKeys)) {
    if (have.has(key)) continue;
    const card = await retry(() => figs.get(key, { type: "json" }));
    if (card && !card.removed && card.slug === key) missing.push(key);
  }
  const stale = [];
  for (const e of cards.filter(c => c.spriteStatus !== "ready")) {
    const card = await retry(() => figs.get(e.slug, { type: "json" }));
    if (!card || card.removed) continue;
    if (card.spriteStatus !== e.spriteStatus || (card.sprite ?? null) !== (e.sprite ?? null)) stale.push(e.slug);
  }
  if (missing.length || stale.length) await syncIndex([...missing, ...stale]);
  for (const k of missing) out.push(`reindexed ${k} (missing from the index)`);
  for (const k of stale) out.push(`resynced ${k} (index entry behind its card)`);
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--dump")) {
    process.stdout.write(JSON.stringify({ cards: await retry(figureIndex) }));
    return;
  }
  if (args.includes("--repair")) {
    for (const line of await repair()) console.log(line);
    return;
  }
  const slugs = args.filter(a => !a.startsWith("--"));
  if (!slugs.length) { console.error("usage: node scripts/index-sync.mjs <slug>... | --dump | --repair"); process.exit(2); }
  for (const { slug, entry } of await syncIndex(slugs)) console.log(`${entry ? "indexed" : "dropped"} ${slug}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(`index-sync: FAILED ${e?.message || e}`); process.exit(1); });
}
