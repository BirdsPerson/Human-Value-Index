// One-off test for docs/methodology/teresa-2026-09-25.md: score a small comparison set
// from the public record under the current (branch) prompt, fact-check each verdict
// against the Wikipedia article, and compare with the stored figures. Baseline noise check:
// Mother Teresa once more under main's prompt (paths passed as argv).
//   ANTHROPIC_API_KEY=... node scripts/teresa-test.mjs <old systemPrompt.js> <old publicRecord.js> <out.json>
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { SYSTEM_PROMPT } from "../netlify/lib/systemPrompt.js";
import { PUBLIC_RECORD, directiveFor } from "../netlify/lib/publicRecord.js";
import { callClaude } from "../netlify/lib/score.js";
import { computeScore, getTier, normalizeAssessment, cube } from "../netlify/lib/intake.js";
import { fetchArticleText } from "../netlify/lib/refer.js";
import { factCheck } from "../netlify/lib/factCheck.js";
import { FAMOUS_FIGURES } from "../src/figures.js";
import { PEOPLE } from "../src/peopleData.js";
import { octantOf } from "../src/cube.js";

const [oldSysPath, oldPrPath, outPath] = process.argv.slice(2);
const OLD_SYS = (await import(pathToFileURL(oldSysPath))).SYSTEM_PROMPT;
const OLD_PR = (await import(pathToFileURL(oldPrPath))).PUBLIC_RECORD;
const SET = [
  ["Mother Teresa", "Mother Teresa"], ["Harriet Tubman", "Harriet Tubman"], ["Mahatma Gandhi", "Mahatma Gandhi"],
  ["Nelson Mandela", "Nelson Mandela"], ["Martin Luther King Jr.", "Martin Luther King Jr."],
  ["Dolly Parton", "Dolly Parton", { died: "2026-08-25" }], ["Elon Musk", "Elon Musk"], ["Peter Thiel", "Peter Thiel"], ["Albert Einstein", "Albert Einstein"],
];

async function run(name, title, sys, pr, died) {
  const status = died ? `deceased (died ${died})` : "living";
  const raw = await callClaude(sys + pr, `PUBLIC FIGURE: ${name}\nSTATUS: ${status}\n(If you cite a directive, cite Directive ${directiveFor(name)}.)`);
  const a = normalizeAssessment(raw);
  const source = await fetchArticleText(title);
  let fc = null;
  try { fc = await factCheck({ name, deceased: Boolean(died), source, verdict: a.verdict }); } catch (e) { fc = { error: e.message }; }
  const score = computeScore(a.breakdown), c = cube(a.breakdown);
  const l = PEOPLE[name]?.likability ?? null;
  return { name, score, tier: getTier(score), breakdown: a.breakdown, warmth: c.warmth, competence: c.competence, quadrant: c.quadrant,
    octant: l == null ? null : octantOf(c.warmth, c.competence, l), verdictRaw: a.verdict, verdict: fc?.verdict ?? a.verdict, factCheck: fc && { removed: fc.removed, checked: fc.checked, error: fc.error } };
}

const out = { after: [], baselineTeresa: null, before: [] };
for (const [name, title, extra] of SET) {
  const f = FAMOUS_FIGURES.find(x => x.name === name);
  const died = f?.died ?? extra?.died ?? null;
  if (f) { const c = cube(f.breakdown), l = PEOPLE[name]?.likability ?? null;
    out.before.push({ name, score: f.score, breakdown: f.breakdown, warmth: c.warmth, competence: c.competence, quadrant: c.quadrant, octant: l == null ? null : octantOf(c.warmth, c.competence, l), verdict: f.verdict }); }
  const r = await run(name, title, SYSTEM_PROMPT, PUBLIC_RECORD, died);
  out.after.push(r); console.log(String(r.score).padStart(4), name, "care", r.breakdown.care, "align", r.breakdown.alignment);
}
out.baselineTeresa = await run("Mother Teresa", "Mother Teresa", OLD_SYS, OLD_PR, "1997-09-05");
console.log("baseline (main prompt) Teresa", out.baselineTeresa.score, JSON.stringify(out.baselineTeresa.breakdown));
writeFileSync(outPath, JSON.stringify(out, null, 1));
