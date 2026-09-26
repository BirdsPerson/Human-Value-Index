// One-off: give namesakes a visible qualifier ("Joe Jackson (talent manager)").
// Scans every roster name and every production referral/engine card through the same
// resolver the referral desk uses; a qualifier is added only when two or more humans
// answer to the name and none dwarfs the rest (needsChoice). Usage:
//   node scripts/backfill-qualifiers.mjs            # dry run: prints the plan
//   node scripts/backfill-qualifiers.mjs --apply    # writes src/figures.js + production cards
import { readFileSync, writeFileSync } from "node:fs";
import { FAMOUS_FIGURES } from "../src/figures.js";
import { resolveCandidates, needsChoice, qualifierFrom, FIGURE_QIDS } from "../netlify/lib/refer.js";
import { store, figureIndex } from "./roster/prod.mjs";
import { figureIndexEntry } from "../netlify/lib/store.js";

const APPLY = process.argv.includes("--apply");
// A bare name that is also a common word or title ("Prince") reads ambiguously even with
// one human answering to it.
const ALWAYS = { Prince: "musician" };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function qualifierForName(base, qid, title) {
  const c = await resolveCandidates(base);
  if (!c.ok) return { error: "lookup" };
  if (!needsChoice(c.candidates)) return { q: null, n: c.candidates.length };
  const me = c.candidates.find(k => k.qid === qid) || (title && c.candidates.find(k => k.title === title));
  return { q: me ? qualifierFrom(me.title, me.description) : null, n: c.candidates.length, missing: !me };
}

const plan = { figures: {}, cards: {} };
for (const f of FAMOUS_FIGURES) {
  if (ALWAYS[f.name]) { plan.figures[f.name] = ALWAYS[f.name]; continue; }
  const r = await qualifierForName(f.name, FIGURE_QIDS[f.name]);
  if (r.error) console.log(`  lookup failed: ${f.name}`);
  if (r.q) plan.figures[f.name] = r.q;
  if (r.missing) console.log(`  ${f.name}: ambiguous but its own entry wasn't among the candidates; left bare`);
  await sleep(1500);
}
const cards = await figureIndex();
for (const c of cards) {
  const base = c.name;
  let r = await qualifierForName(base, c.wikidata);
  if (r.error) { console.log(`  lookup failed: ${base}`); continue; }
  if (r.q) plan.cards[c.slug] = r.q;
  await sleep(1500);
}
console.log("roster qualifiers:", plan.figures);
console.log("card qualifiers:", plan.cards);
if (!APPLY) process.exit(0);

// src/figures.js: add `qualifier: "..."` after the name of each entry.
let src = readFileSync(new URL("../src/figures.js", import.meta.url), "utf8");
for (const [name, q] of Object.entries(plan.figures)) {
  const needle = `{ name: ${JSON.stringify(name)},`;
  if (!src.includes(needle)) { console.log(`  figures.js: no entry for ${name}`); continue; }
  src = src.replace(needle, `{ name: ${JSON.stringify(name)}, qualifier: ${JSON.stringify(q)},`);
}
writeFileSync(new URL("../src/figures.js", import.meta.url), src);

const figs = store("hvi-figures");
for (const [slug, q] of Object.entries(plan.cards)) {
  const card = await figs.get(slug, { type: "json" });
  if (!card) continue;
  await figs.setJSON(slug, { ...card, qualifier: q });
}
for (let attempt = 0; attempt < 8; attempt++) {
  const cur = await figs.getWithMetadata("index", { type: "json" });
  const next = (cur?.data?.cards || []).map(e => (plan.cards[e.slug] ? { ...e, qualifier: plan.cards[e.slug] } : e));
  const res = await figs.setJSON("index", { cards: next }, { onlyIfMatch: cur.etag });
  if (res.modified) { console.log("index updated"); break; }
}
