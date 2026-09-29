// Promote a staged verdict to live: the one command that turns Scott's approval of a
// rewritten verdict into a published file. A held card (verdictStatus "withheld") carries
// the rewrite as `pendingVerdict` {verdict, breakdown, score, at, ...}; this makes it the
// live verdict, score and breakdown, publishes it, logs any score move on the file's
// movement log (cause "review"), and updates the index entry. Etag-safe writes.
//
//   node scripts/publish-pending-verdict.mjs <slug>             # promote it
//   node scripts/publish-pending-verdict.mjs <slug> --dry-run   # show what would change
import { store, retry } from "./roster/prod.mjs";
import { figureIndexEntry } from "../netlify/lib/store.js";
import { getTier, cube, computeScore } from "../netlify/lib/intake.js";
import { appendFigureHistory } from "../src/movement.js";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const slug = args.find(a => !a.startsWith("--"));
if (!slug || slug === "index") { console.error("usage: node scripts/publish-pending-verdict.mjs <slug> [--dry-run]"); process.exit(1); }

const REVIEW_NOTE = "RE-EXAMINED: ALLEGATIONS NOW FILED AS ALLEGATIONS";

// Pure: the held card -> the published card.
function promote(card, at = new Date().toISOString()) {
  const p = card.pendingVerdict;
  if (!p || typeof p.verdict !== "string" || !p.verdict.trim() || !p.breakdown) throw new Error(`${card.slug}: no pendingVerdict to publish`);
  const score = Number.isFinite(p.score) ? p.score : computeScore(p.breakdown, p.harm?.severity, card.harmReview);
  const tier = getTier(score);
  const { pendingVerdict, ...rest } = card;
  const moved = score !== card.score || tier !== card.tier;
  return {
    ...rest, ...cube(p.breakdown), score, tier, breakdown: p.breakdown, verdict: p.verdict,
    ...(p.harm !== undefined ? { harm: p.harm } : {}),
    ...(p.flags !== undefined ? { flags: p.flags } : {}),
    ...(p.commendations !== undefined ? { commendations: p.commendations } : {}),
    ...(p.factCheck !== undefined ? { factCheck: p.factCheck } : {}),
    verdictStatus: "published", verdictHold: null,
    verdictReleased: { at, staged: p.at ?? null, hold: card.verdictHold ?? null },
    rescoredAt: at,
    scoreHistory: moved
      ? appendFigureHistory(card.scoreHistory, { at, score, tier, cause: "review", note: p.note || REVIEW_NOTE }, { at: card.at || null, score: card.score, tier: card.tier, note: "On file before the review." })
      : card.scoreHistory ?? null,
  };
}

const figs = store("hvi-figures");
let next = null;
for (let attempt = 0; attempt < 5; attempt++) {
  const cur = await retry(() => figs.getWithMetadata(slug, { type: "json" }));
  if (!cur?.data) { console.error(`no card: ${slug}`); process.exit(1); }
  // Already promoted (an earlier run lost the index race): just repair the index entry.
  if (!cur.data.pendingVerdict && cur.data.verdictReleased && cur.data.verdictStatus === "published") { next = cur.data; console.log(`${slug}: already published; repairing the index entry`); break; }
  next = promote(cur.data);
  console.log(`${slug}: ${cur.data.score} -> ${next.score} (${next.tier}), verdict ${cur.data.verdictStatus} -> published\n  ${next.verdict}`);
  if (DRY) process.exit(0);
  if ((await retry(() => figs.setJSON(slug, next, { onlyIfMatch: cur.etag }))).modified) break;
  next = null;
}
if (!next) { console.error("lost the card write race 5 times; nothing published"); process.exit(1); }
for (let attempt = 0; attempt < 8; attempt++) {
  const cur = await retry(() => figs.getWithMetadata("index", { type: "json" }));
  const cards = (cur?.data?.cards || []).map(e => (e.slug === slug ? figureIndexEntry(next) : e));
  if ((await retry(() => figs.setJSON("index", { ...cur.data, cards }, { onlyIfMatch: cur.etag }))).modified) { console.log("published; index updated"); process.exit(0); }
}
console.error("card published but the index write lost 8 races: re-run to repair the index entry");
process.exit(1);
