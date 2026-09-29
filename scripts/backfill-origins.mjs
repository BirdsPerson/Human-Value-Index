// One-off (safe to re-run): give every production referral/engine card its birth country
// (`origin`, ISO alpha-3) from Wikidata. New cards get it at creation (refer.js,
// roster-grow.mjs); src/figures.js carries it for the 62 on record.
//   node scripts/backfill-origins.mjs            # dry run: prints the plan
//   node scripts/backfill-origins.mjs --apply    # writes production cards + index
import { originsOf } from "../netlify/lib/refer.js";
import { store, figureIndex } from "./roster/prod.mjs";

const APPLY = process.argv.includes("--apply");
// Wikidata has no birthplace or citizenship for these.
const MANUAL = { Q37151: "CHN" /* Sun Tzu */ };

const cards = await figureIndex();
const found = await originsOf(cards.map(c => c.wikidata));
const plan = {};
for (const c of cards) {
  const o = found.get(c.wikidata) || MANUAL[c.wikidata] || null;
  if (o && o !== c.origin) plan[c.slug] = o;
}
const missing = cards.filter(c => !found.get(c.wikidata) && !MANUAL[c.wikidata] && !c.origin).map(c => c.name);
console.log(`${cards.length} cards; ${Object.keys(plan).length} to set; no origin: ${missing.join(", ") || "none"}`);
if (!APPLY) process.exit(0);

const figs = store("hvi-figures");
for (const [slug, origin] of Object.entries(plan)) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await figs.getWithMetadata(slug, { type: "json" });
    if (!cur?.data) break;
    if ((await figs.setJSON(slug, { ...cur.data, origin }, { onlyIfMatch: cur.etag })).modified) break;
  }
}
for (let attempt = 0; attempt < 8; attempt++) {
  const cur = await figs.getWithMetadata("index", { type: "json" });
  const next = (cur?.data?.cards || []).map(e => (plan[e.slug] ? { ...e, origin: plan[e.slug] } : e));
  if ((await figs.setJSON("index", { cards: next }, { onlyIfMatch: cur.etag })).modified) { console.log("index updated"); break; }
}
