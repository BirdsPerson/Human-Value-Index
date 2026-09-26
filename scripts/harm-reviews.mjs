// Keeps the "## Harm reviews" section of MORNING_REPORT.md in step with the production
// figure index: public figures who are heads of state/government (or whose documented harm
// was done in an official state capacity) and landed in the harm gate are flagged
// harmReviewPending by /api/refer and the roster engine, and wait for Scott's
// case-by-case call. Not a "Needs you" item: when Scott is present the session asks him
// in chat. Reader: every session (MORNING_REPORT.md at session start) and the desk.
//
//   node scripts/harm-reviews.mjs            # reads the production index via the netlify CLI
//   node scripts/harm-reviews.mjs --stdin    # the index JSON on stdin (referral_sprites.py)
//
// Rewrites the section in place (stable heading, no dated duplicates) and runs the desk
// collector only when the text changed.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { FAMOUS_FIGURES } from "../src/figures.js";

const ROOT = new URL("..", import.meta.url).pathname;
const REPORT = `${ROOT}MORNING_REPORT.md`;
const HEADING = "## Harm reviews";
// Context only (no change to them): the roster's gated heads of state and their bands.
export const CONTEXT_HEADS = ["Putin", "Kim Jong-un", "Mao Zedong", "Genghis Khan"];

export function sectionText(cards, figures = FAMOUS_FIGURES) {
  const pending = (cards || []).filter(c => c && c.harmReviewPending && !c.removed && !c.harmReview);
  const reviewed = (cards || []).filter(c => c && c.harmReview && !c.removed);
  const lines = [HEADING, ""];
  lines.push(pending.length
    ? `Public figures who held state office and landed in the harm gate through state force wait for a case-by-case call (ungate: weighed, not gated; serious: no gate but the 499 serious-harm cap; or gate). The gate applies until decided.`
    : `No harm reviews pending.`);
  for (const c of pending) {
    const band = c.harm?.band ? `, band ${c.harm.band}` : "";
    lines.push(`- ${c.name}${c.qualifier ? ` (${c.qualifier})` : ""}: gated at ${c.score}${band}. Decide ungate, serious or gate.`);
  }
  if (reviewed.length) {
    lines.push("", "Decided:");
    for (const c of reviewed) lines.push(`- ${c.name}: ${c.harmReview.decision} (${c.harmReview.note})`);
  }
  const ctx = CONTEXT_HEADS.map(n => figures.find(f => f.name === n)).filter(Boolean)
    .map(f => `${f.name} ${f.score} (${f.harm?.band || "no band"})`);
  if (ctx.length) lines.push("", `For context, the roster's gated heads of state stay gated, unchanged: ${ctx.join(" · ")}.`);
  return lines.join("\n") + "\n";
}

export function replaceSection(md, section) {
  const start = md.indexOf(`${HEADING}\n`);
  if (start === -1) return `${md.replace(/\s*$/, "")}\n\n${section}`;
  const rest = md.slice(start + HEADING.length + 1);
  const next = rest.search(/^## /m);
  const end = next === -1 ? md.length : start + HEADING.length + 1 + next;
  return `${md.slice(0, start)}${section}${next === -1 ? "" : "\n"}${md.slice(end)}`;
}

async function main() {
  let index;
  if (process.argv.includes("--stdin")) index = JSON.parse(readFileSync(0, "utf8") || "{}");
  else index = JSON.parse(execFileSync("netlify", ["blobs:get", "hvi-figures", "index"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }));
  const cards = index?.cards || [];
  const section = sectionText(cards);
  const md = existsSync(REPORT) ? readFileSync(REPORT, "utf8") : "";
  const next = replaceSection(md, section);
  if (next === md) return console.log("harm reviews: unchanged");
  writeFileSync(REPORT, next);
  console.log(`harm reviews: ${cards.filter(c => c.harmReviewPending && !c.harmReview).length} pending; report updated`);
  try { execFileSync("python3", [`${ROOT}../organize/collect_reports.py`], { stdio: "ignore", timeout: 120000 }); } catch { /* desk refresh is best-effort */ }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("harm reviews failed:", e.message); process.exit(1); });
