// One-off (safe to re-run): height (cm) and sex from Wikidata onto every production card,
// for sprites drawn to scale. New cards get them at creation (refer, roster-grow).
//   node scripts/backfill-stature.mjs            # dry run
//   node scripts/backfill-stature.mjs --apply    # writes production cards + index
import { staturesOf } from "../netlify/lib/refer.js";
import { store, figureIndex, syncIndex } from "./roster/prod.mjs";

const APPLY = process.argv.includes("--apply");
const cards = await figureIndex();
const found = await staturesOf(cards.map(c => c.wikidata));
const plan = {};
for (const c of cards) {
  const s = found.get(c.wikidata);
  if (s && (s.height !== (c.height ?? null) || s.sex !== (c.sex ?? null))) plan[c.slug] = { height: s.height, sex: s.sex };
}
const n = Object.values(plan);
console.log(`${cards.length} cards; ${n.length} to set; ${n.filter(p => p.height).length} with a measured height`);
if (!APPLY) process.exit(0);

const figs = store("hvi-figures");
for (const [slug, p] of Object.entries(plan)) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await figs.getWithMetadata(slug, { type: "json" });
    if (!cur?.data) break;
    if ((await figs.setJSON(slug, { ...cur.data, ...p }, { onlyIfMatch: cur.etag })).modified) break;
  }
}
await syncIndex(Object.keys(plan));
console.log("index updated");
