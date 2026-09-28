// Apply one of Scott's case-by-case harm decisions to a production figure card, logged on the
// file as the Department's change (cause "review").
//
//   node scripts/harm-review.mjs <slug> <ungate|serious|gate> "<note>" [--dry-run]
//
// Recomputes the score by formula with the review, writes the card and its index entry under
// an etag, clears harmReviewPending. Then `node scripts/harm-reviews.mjs` refreshes the desk.
import fs from "node:fs";
import { store } from "./roster/prod.mjs";
import * as L from "./calibration-lib.mjs";
import { appendFigureHistory } from "../src/movement.js";

const [slug, decision, note] = process.argv.slice(2).filter(a => !a.startsWith("--"));
const DRY = process.argv.includes("--dry-run");
if (!slug || !["ungate", "serious", "gate"].includes(decision) || !note) {
  console.error('usage: harm-review.mjs <slug> <ungate|serious|gate> "<note>" [--dry-run]'); process.exit(1);
}
const cal = JSON.parse(fs.readFileSync(new URL("../netlify/lib/calibration.json", import.meta.url), "utf8"));
const at = new Date().toISOString();
const review = { decision, note, by: "scott", at: at.slice(0, 10) };
const figs = store("hvi-figures");

async function update(key, fn) {
  for (let i = 0; i < 6; i++) {
    const cur = await figs.getWithMetadata(key, { type: "json" });
    if (!cur?.data) throw new Error(`no ${key}`);
    const next = fn(structuredClone(cur.data));
    if ((await figs.setJSON(key, next, { onlyIfMatch: cur.etag })).modified) return next;
  }
  throw new Error(`${key}: lost the write race`);
}

const card = await figs.get(slug, { type: "json" });
if (!card) { console.error(`no card ${slug}`); process.exit(1); }
const score = L.scoreWith(cal, card.breakdown, card.harm?.severity, review), tier = L.tierWith(cal, score);
const upd = {
  harmReview: review, harmReviewPending: false, score, tier,
  scoreHistory: appendFigureHistory(card.scoreHistory, { at, score, tier, cause: "review", note: `HARM FINDING REVIEWED BY THE DEPARTMENT (${decision.toUpperCase()}): ${note}` },
    { at: card.at || null, score: card.score, tier: card.tier, note: "On file before the review." }),
};
console.log(`${card.name}: ${card.score} ${card.tier} -> ${score} ${tier} (${decision})`);
if (DRY) process.exit(0);
await update(slug, c => ({ ...c, ...upd }));
await update("index", idx => ({ ...idx, cards: (idx.cards || []).map(c => (c.slug === slug ? { ...c, ...upd } : c)) }));
console.log("written");
