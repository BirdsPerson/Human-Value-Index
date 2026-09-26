// One-off pass over the 62 figures on file (src/figures.js):
//   1. born/died from Wikidata (by the ids in netlify/lib/refer.js FIGURE_QIDS). Never
//      from the model: people die after its knowledge cutoff.
//   2. each verdict fact-checked against the person's full Wikipedia article
//      (netlify/lib/factCheck.js, same pass referrals get); failed claims cut or softened.
//   3. score and tier recomputed from the stored breakdown with the current weights.
// Rewrites the ALL_FIGURES array in src/figures.js and writes a report.
//
//   ANTHROPIC_API_KEY=... node scripts/factcheck-figures.mjs            # all 62
//   ANTHROPIC_API_KEY=... node scripts/factcheck-figures.mjs "Elon Musk" # just these
//   node scripts/factcheck-figures.mjs --no-check                        # dates + scores only, no API key
//   ... --dry-run                                                        # report only, no rewrite
import fs from "node:fs";
import { FAMOUS_FIGURES } from "../src/figures.js";
import { FIGURE_QIDS, fetchArticleText, wikiDate } from "../netlify/lib/refer.js";
import { computeScore, getTier } from "../netlify/lib/intake.js";
import { factCheck } from "../netlify/lib/factCheck.js";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const NO_CHECK = args.includes("--no-check");
const only = args.filter(a => !a.startsWith("--"));
const FILE = new URL("../src/figures.js", import.meta.url);
const REPORT = new URL(`../docs/factcheck-${new Date().toISOString().slice(0, 10)}.md`, import.meta.url);
const UA = "HumanValueIndex/1.0 (https://humanvalueindex.com; fact-check batch)";
if (!NO_CHECK && !process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set (or pass --no-check)");

// Wikidata: life dates + the enwiki title, 50 ids per request.
async function wikidata(qids) {
  const out = {};
  for (let i = 0; i < qids.length; i += 50) {
    const ids = qids.slice(i, i + 50).join("|");
    const r = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=claims|sitelinks&sitefilter=enwiki&format=json`, { headers: { "User-Agent": UA } });
    if (!r.ok) throw new Error(`wikidata HTTP ${r.status}`);
    const data = await r.json();
    for (const [qid, e] of Object.entries(data.entities || {})) {
      const time = p => { const s = e.claims?.[p]?.[0]?.mainsnak; return s ? (s.datavalue?.value?.time || "unknown") : null; };
      out[qid] = { born: wikiDate(time("P569")), died: wikiDate(time("P570")), title: e.sitelinks?.enwiki?.title || null };
    }
  }
  return out;
}

async function pool(items, n, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); }
  }));
  return results;
}

const figures = FAMOUS_FIGURES.map(f => ({ ...f }));
const missing = figures.filter(f => !FIGURE_QIDS[f.name]).map(f => f.name);
if (missing.length) throw new Error(`no Wikidata id for: ${missing.join(", ")}`);
const wd = await wikidata(figures.map(f => FIGURE_QIDS[f.name]));

const log = [];
await pool(figures, 6, async f => {
  const w = wd[FIGURE_QIDS[f.name]] || {};
  f.born = w.born ?? null;
  f.died = w.died ?? null;
  const before = f.score;
  f.score = computeScore(f.breakdown, f.harm?.severity, f.harmReview);
  f.tier = getTier(f.score);
  const row = { name: f.name, before, after: f.score, died: f.died, removed: [], checked: null, changed: false };
  if (!NO_CHECK && (only.length === 0 || only.includes(f.name))) {
    const source = w.title ? await fetchArticleText(w.title, fetch, 200000).catch(() => "") : "";
    if (!source) { row.error = "no article text"; log.push(row); return; }
    try {
      const fc = await factCheck({ name: w.title || f.name, deceased: Boolean(f.died), source, verdict: f.verdict, max: 200000 });
      row.checked = fc.checked;
      row.removed = fc.removed;
      if (fc.verdict && fc.verdict !== f.verdict) { row.old = f.verdict; f.verdict = fc.verdict; row.changed = true; }
      if (fc.mostlyFailed) row.mostlyFailed = true;
    } catch (err) {
      row.error = String(err?.message || err);
    }
    console.log(`${row.changed ? "fixed " : "ok    "} ${f.name} (${row.checked ?? "-"} claims, ${row.removed.length} failed)${row.error ? " ERROR " + row.error : ""}`);
  }
  log.push(row);
});

// Rewrite the array literal in the file's own style: one figure per line.
const dims = f => "{" + Object.entries(f.breakdown).map(([k, v]) => `${k}: ${v}`).join(", ") + "}";
const line = f => `  { name: ${JSON.stringify(f.name)}, score: ${f.score}, tier: ${JSON.stringify(f.tier)}, born: ${JSON.stringify(f.born)}, died: ${JSON.stringify(f.died)}, breakdown: ${dims(f)}, verdict: ${JSON.stringify(f.verdict)} },`;
if (!DRY) {
  const src = fs.readFileSync(FILE, "utf8");
  const start = src.indexOf("const ALL_FIGURES = [\n");
  const end = src.indexOf("\n];", start);
  if (start < 0 || end < 0) throw new Error("ALL_FIGURES array not found");
  fs.writeFileSync(FILE, src.slice(0, start) + "const ALL_FIGURES = [\n" + figures.map(line).join("\n") + src.slice(end));
}

const rows = figures.map(f => log.find(r => r.name === f.name)).filter(Boolean);
const md = [`# Fact-check of the 62 verdicts, ${new Date().toISOString().slice(0, 10)}`, "",
  "Each verdict checked against the person's full English Wikipedia article (whole article, up to 200k characters) by `netlify/lib/factCheck.js`. Claims the article contradicts or doesn't cover were cut or softened. Life dates from Wikidata. Scores recomputed with the current weights.", "",
  "| Figure | Score | Died | Claims | Failed |", "|---|---|---|---|---|",
  ...rows.map(r => `| ${r.name} | ${r.before} → ${r.after} | ${r.died || ""} | ${r.checked ?? "—"} | ${r.removed.length}${r.error ? " (error: " + r.error + ")" : ""} |`),
  "", "## Changed verdicts", "",
  ...rows.filter(r => r.changed).flatMap(r => [`### ${r.name}`, "", ...r.removed.map(c => `- ${c}`), "", `Before: ${r.old}`, "", `After: ${figures.find(f => f.name === r.name).verdict}`, ""]),
].join("\n");
if (!DRY) fs.writeFileSync(REPORT, md + "\n");
console.log(`\n${rows.filter(r => r.changed).length} verdicts changed; ${rows.filter(r => r.error).length} errors${DRY ? " (dry run: nothing written)" : ""}`);
