// Re-scores public figures on the current rubric from each person's documented public
// record: every figure is read RUNS (3) times, the per-dimension median is kept, the
// verdict comes from the reading closest to that median and is fact-checked against the
// Wikipedia article (Haiku). Score, tier and cube always come from the formula.
//
//   ANTHROPIC_API_KEY=$(netlify env:get ANTHROPIC_API_KEY --context production) node scripts/rescore-figures.mjs
//   ... node scripts/rescore-figures.mjs "Peter Thiel" "Socrates"   # just these (figures or referrals, by name)
//   ... --no-referrals   # roster only   --only-referrals   # production cards only   --no-check   # skip the fact-check
//
// Writes src/figures.js in place (every other field on a line is kept), production
// referral cards in hvi-figures via the netlify CLI (sprites and metadata kept), and on a
// full pass docs/rescore-<date>.md + .json. The key stays in the environment.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { getTier, cube } from "../netlify/lib/intake.js";
import { FAMOUS_FIGURES } from "../src/figures.js";
import { DIMENSIONS } from "../netlify/lib/questionPools.js";
import { octantOf } from "../src/cube.js";
import { rescoreOne, pool, RUNS } from "./rescore-lib.mjs";
import { VILLAINS, SAINTS } from "./calibration-lib.mjs";

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith("--")));
const want = new Set(args.filter(a => !a.startsWith("--")));
const full = !want.size;
if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY not set"); process.exit(1); }

const ROOT = new URL("..", import.meta.url).pathname;
const cli = a => execFileSync("netlify", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "pipe"] });
const blobGet = (store, key) => { try { return JSON.parse(cli(["blobs:get", store, key])); } catch { return null; } };
function blobSet(store, key, obj) {
  const tmp = `${ROOT}.rescore-${key.replace(/[^a-z0-9-]/gi, "_")}.json`;
  writeFileSync(tmp, JSON.stringify(obj));
  try { cli(["blobs:set", store, key, "--input", tmp]); } finally { execFileSync("rm", ["-f", tmp]); }
}

const bench = (() => { try { const b = JSON.parse(readFileSync(new URL("../docs/methodology/benchmarks.json", import.meta.url))); return b.figures || b; } catch { return {}; } })();

// ---- targets -------------------------------------------------------------------------
const figureJobs = flags.has("--only-referrals") ? [] : FAMOUS_FIGURES.filter(f => full || want.has(f.name))
  .map(f => ({ kind: "figure", name: f.name, died: f.died || null, wikiTitle: bench[f.name]?.enwiki_title || f.name, harmReview: f.harmReview ?? null, before: f }));
let referralJobs = [];
if (!flags.has("--no-referrals")) {
  const index = blobGet("hvi-figures", "index");
  referralJobs = (index?.cards || []).filter(c => !c.removed && (full || want.has(c.name)))
    .map(c => ({ kind: "referral", slug: c.slug, name: c.name, died: c.died || null, before: c }));
  for (const j of referralJobs) { const card = blobGet("hvi-figures", j.slug); j.card = card; j.wikiTitle = card?.wikiTitle || j.name; j.harmReview = card?.harmReview ?? null; }
  referralJobs = referralJobs.filter(j => j.card && !j.card.removed);
}
const jobs = [...figureJobs, ...referralJobs];
console.log(`rescoring ${figureJobs.length} figures + ${referralJobs.length} referrals, ${RUNS} runs each`);

const calls = { sonnet: 0, haiku: 0 };
const results = await pool(jobs, 4, async j => {
  const r = await rescoreOne(j, { check: !flags.has("--no-check"), calls });
  console.log(`${String(r.score).padStart(4)}  ±${String(r.spread.score).padEnd(3)} ${j.name}`);
  return { ...j, r };
});

// ---- write the roster ----------------------------------------------------------------
const path = new URL("../src/figures.js", import.meta.url);
let src = readFileSync(path, "utf8");
const lit = o => JSON.stringify(o).replace(/"([a-z]+)":/g, "$1: ").replace(/,(?=[a-z]+: )/g, ", ");
for (const { kind, name, before, r } of results.filter(x => x.kind === "figure")) {
  const bd = Object.fromEntries(DIMENSIONS.map(d => [d, r.breakdown[d]]));
  const c = cube(bd);
  // Keep every other field on the line (born, died, no_dangle, ...); recompute score and cube.
  const extra = Object.entries(before).filter(([k]) => !["name", "score", "tier", "warmth", "competence", "quadrant", "breakdown", "verdict", "people", "harm"].includes(k))
    .map(([k, v]) => `, ${k}: ${JSON.stringify(v)}`).join("");
  const line = `  { name: ${JSON.stringify(name)}, score: ${r.score}, tier: ${JSON.stringify(getTier(r.score))}, warmth: ${c.warmth}, competence: ${c.competence}, quadrant: ${JSON.stringify(c.quadrant)}${extra}${r.harm ? `, harm: ${JSON.stringify({ documented: r.harm.documented, era: r.harm.era, band: r.harm.band, ...(r.harm.severity ? { severity: r.harm.severity } : {}) })}` : ""}, breakdown: ${lit(bd)}, verdict: ${JSON.stringify(r.verdict)} },`;
  const re = new RegExp(`^  \\{ name: ${JSON.stringify(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},.*$`, "m");
  if (!re.test(src)) throw new Error(`no line for ${kind} ${name}`);
  src = src.replace(re, () => line);
}
writeFileSync(path, src);

// ---- write production referral cards (card + index entry) ------------------------------
const refDone = results.filter(x => x.kind === "referral");
if (refDone.length) {
  const at = new Date().toISOString();
  for (const { slug, card, r } of refDone) {
    const next = { ...card, score: r.score, tier: getTier(r.score), ...cube(r.breakdown), breakdown: r.breakdown, verdict: r.verdict,
      harm: r.harm ? { documented: r.harm.documented, era: r.harm.era, band: r.harm.band, severity: r.harm.severity ?? null } : card.harm ?? null,
      flags: r.flags, commendations: r.commendations, factCheck: r.factCheck ?? card.factCheck ?? null, rescoredAt: at };
    blobSet("hvi-figures", slug, next);
  }
  const index = blobGet("hvi-figures", "index");
  const bySlug = new Map(refDone.map(x => [x.slug, x.r]));
  index.cards = index.cards.map(c => (bySlug.has(c.slug)
    ? { ...c, score: bySlug.get(c.slug).score, tier: getTier(bySlug.get(c.slug).score), breakdown: bySlug.get(c.slug).breakdown, verdict: bySlug.get(c.slug).verdict, harmReview: bySlug.get(c.slug).harmReview ?? c.harmReview ?? null }
    : c));
  blobSet("hvi-figures", "index", index);
}

// ---- report (full pass only) -----------------------------------------------------------
const date = new Date().toISOString().slice(0, 10);
const rows = results.map(({ kind, name, before, r }) => {
  const c = cube(r.breakdown), cb = cube(before.breakdown || {});
  const like = before.people?.likability ?? null;
  return {
    kind, name, before: before.score, after: r.score, delta: r.score - before.score, tier: getTier(r.score),
    octant: like == null ? `${c.quadrant} (likability unrated)` : octantOf(c.warmth, c.competence, like),
    care: r.breakdown.care, careBefore: before.breakdown?.care ?? null, warmth: c.warmth, warmthBefore: cb.warmth, competence: c.competence,
    spread: r.spread, runScores: r.runScores, verdict: r.verdict,
  };
}).sort((a, b) => b.after - a.after);
if (full && figureJobs.length) writeFileSync(new URL(`../docs/rescore-${date}.json`, import.meta.url), JSON.stringify({ date, runs: RUNS, calls, rows }, null, 1));
if (full && figureJobs.length) {
  const sign = n => (n >= 0 ? `+${n}` : `${n}`);
  const table = rows.map(x => `| ${x.name}${x.kind === "referral" ? " (ref)" : ""} | ${x.before} | **${x.after}** | ${sign(x.delta)} | ${x.tier} | ${x.octant} | ${x.careBefore ?? "—"}→${x.care ?? "—"} | ${x.warmth} | ${x.competence} | ±${x.spread.score} |`).join("\n");
  const movers = [...rows].sort((a, b) => b.delta - a.delta);
  const mv = list => list.map(x => `${x.name} ${sign(x.delta)} (${x.before}→${x.after})`).join(" · ");
  const medianOf = a => { const s = a.filter(v => v != null).sort((p, q) => p - q); return s.length ? s[s.length >> 1] : null; };
  const noise = DIMENSIONS.map(d => `| ${d} | ${medianOf(rows.map(x => x.spread.dims[d]))} | ${Math.max(...rows.map(x => x.spread.dims[d] ?? 0))} |`).join("\n");
  const scoreSpreads = rows.map(x => x.spread.score);
  const vil = rows.filter(x => VILLAINS.includes(x.name)), non = rows.filter(x => !VILLAINS.includes(x.name));
  const worstNon = Math.min(...non.map(x => x.after)), bestVil = Math.max(...vil.map(x => x.after));
  const median = medianOf(rows.map(x => x.after));
  const teresa = rows.find(x => x.name === "Mother Teresa");
  writeFileSync(new URL(`../docs/rescore-${date}.md`, import.meta.url), `# Roster rescore: median of ${RUNS}, ${date}

Every figure and production referral scored ${RUNS} times from the public record under the current prompts (care counts service to strangers; alignment judges conduct, not contested opinions; credibly reported observations are documented, only their interpretation may be disputed). Per-dimension median kept; the verdict is from the reading closest to the median, fact-checked against the Wikipedia article. Score, tier and cube from the formula (\`netlify/lib/calibration.json\`). Model calls: ${calls.sonnet} Sonnet scoring, ${calls.haiku} Haiku fact-checks.

## Invariants

- Every villain below every non-villain: **${bestVil < worstNon ? "holds" : "BROKEN"}** (best villain ${bestVil}, worst non-villain ${worstNon}).
- Saints at or above the roster median (${median}): ${SAINTS.map(n => rows.find(x => x.name === n)).filter(Boolean).map(x => `${x.name} ${x.after}${x.after >= median ? "" : " ⚠"}`).join(", ")}.

## Biggest movers

**Up:** ${mv(movers.slice(0, 10))}

**Down:** ${mv(movers.slice(-10).reverse())}

## Noise (spread across the ${RUNS} readings, before taking the median)

Headline score spread: median ±${medianOf(scoreSpreads)}, worst ±${Math.max(...scoreSpreads)} (${rows.find(x => x.spread.score === Math.max(...scoreSpreads)).name}).

| Dimension | Median spread | Worst |
|---|---|---|
${noise}

## Mother Teresa

${teresa ? `**${teresa.after}** (${teresa.tier}, ${teresa.octant}); care ${teresa.careBefore}→${teresa.care}, warmth ${teresa.warmthBefore}→${teresa.warmth}.\n\n> ${teresa.verdict}` : "not in this pass"}

## Full table (sorted by new score)

| Name | Old | New | Δ | Tier | Octant | Care | Warmth | Competence | Run spread |
|---|---|---|---|---|---|---|---|---|---|
${table}
`);
  console.log(`report: docs/rescore-${date}.md`);
}
console.log(`calls: ${calls.sonnet} sonnet, ${calls.haiku} haiku`);
