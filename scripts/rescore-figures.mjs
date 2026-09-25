// Re-scores every public figure in src/figures.js on the current rubric, through the
// same engine that scores subjects, from each person's documented public record.
//
//   ANTHROPIC_API_KEY=$(netlify env:get ANTHROPIC_API_KEY --context production) node scripts/rescore-figures.mjs
//   ... node scripts/rescore-figures.mjs "Peter Thiel" "Socrates"   # just these
//
// Writes the new scores/breakdowns/verdicts back into src/figures.js (score and tier
// always from computeScore/getTier, never the model's number) and a before/after
// report to docs/rescore-<date>.md. The key stays in the environment; nothing writes it.
import { readFileSync, writeFileSync } from "node:fs";
import { SYSTEM_PROMPT } from "../netlify/lib/systemPrompt.js";
import { PUBLIC_RECORD, directiveFor } from "../netlify/lib/publicRecord.js";
import { callClaude } from "../netlify/lib/score.js";
import { computeScore, getTier, normalizeAssessment, cube } from "../netlify/lib/intake.js";
import { FAMOUS_FIGURES } from "../src/figures.js";
import { DIMENSIONS } from "../netlify/lib/questionPools.js";


const want = new Set(process.argv.slice(2));
const targets = FAMOUS_FIGURES.filter(f => !want.size || want.has(f.name));
if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY not set"); process.exit(1); }

async function score(f) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const directive = directiveFor(f.name);
      const raw = await callClaude(SYSTEM_PROMPT + PUBLIC_RECORD, `PUBLIC FIGURE: ${f.name}\n(If you cite a directive, cite Directive ${directive}.)`);
      const a = normalizeAssessment(raw);
      return { name: f.name, breakdown: a.breakdown, verdict: a.verdict, score: computeScore(a.breakdown), tier: getTier(computeScore(a.breakdown)) };
    } catch (e) {
      console.error(`retry ${attempt} ${f.name}: ${e.message}`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error(`gave up on ${f.name}`);
}

// ponytail: fixed pool of 6 concurrent calls; plenty for 62 names.
const results = new Map();
let next = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (next < targets.length) {
    const f = targets[next++];
    const r = await score(f);
    results.set(f.name, r);
    console.log(`${String(r.score).padStart(4)}  ${f.name}`);
  }
}));

// Rewrite src/figures.js entries in place, keeping order.
const path = new URL("../src/figures.js", import.meta.url);
let src = readFileSync(path, "utf8");
const lit = o => JSON.stringify(o).replace(/"([a-z]+)":/g, "$1: ").replace(/,(?=[a-z]+: )/g, ", ");
for (const [name, r] of results) {
  const bd = Object.fromEntries(DIMENSIONS.map(d => [d, r.breakdown[d]]));
  // Keep every other field on the line (born, died, ...); recompute the cube from the new breakdown.
  const f = FAMOUS_FIGURES.find(x => x.name === name);
  const c = cube(bd);
  const extra = Object.entries(f).filter(([k]) => !["name", "score", "tier", "warmth", "competence", "quadrant", "breakdown", "verdict"].includes(k))
    .map(([k, v]) => `, ${k}: ${JSON.stringify(v)}`).join("");
  const line = `  { name: ${JSON.stringify(name)}, score: ${r.score}, tier: ${JSON.stringify(r.tier)}, warmth: ${c.warmth}, competence: ${c.competence}, quadrant: ${JSON.stringify(c.quadrant)}${extra}, breakdown: ${lit(bd)}, verdict: ${JSON.stringify(r.verdict)} },`;
  const re = new RegExp(`^  \\{ name: ${JSON.stringify(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},.*$`, "m");
  if (!re.test(src)) throw new Error(`no line for ${name}`);
  src = src.replace(re, () => line);
}
writeFileSync(path, src);

// Before/after report (only when the whole roster was scored).
if (!want.size) {
  const date = new Date().toISOString().slice(0, 10);
  const rows = FAMOUS_FIGURES.map(f => ({ f, r: results.get(f.name) })).sort((a, b) => b.r.score - a.r.score);
  const table = rows.map(({ f, r }) => `| ${f.name} | ${f.score} | ${r.score} | ${r.score - f.score >= 0 ? "+" : ""}${r.score - f.score} | ${f.tier} → ${r.tier} |`).join("\n");
  const samples = ["Peter Thiel", "Mother Teresa", "Albert Einstein", "Harriet Tubman", "Steve Jobs", "Michael Jackson", "Elon Musk", "Aretha Franklin"]
    .map(n => results.get(n)).filter(Boolean).slice(0, 6)
    .map(r => `**${r.name}** (${r.score}, ${r.tier})\n\n> ${r.verdict}`).join("\n\n");
  writeFileSync(new URL(`../docs/rescore-${date}.md`, import.meta.url), `# Figure rescore — ${date}

Rubric v10: care (incl. honesty) .25, alignment .14, utility .17, adaptability .13, legacy .11, network .08, physical .04, low threat .04, low redundancy .04. Scored from each person's public record by \`scripts/rescore-figures.mjs\`, same engine as subjects.

| Name | Old | New | Δ | Tier |
|---|---|---|---|---|
${table}

## Sample verdicts

${samples}
`);
  console.log(`report: docs/rescore-${date}.md`);
}
