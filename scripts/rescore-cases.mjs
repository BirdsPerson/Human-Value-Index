// Manual tool: re-score a case file's stored transcripts under the CURRENT rubric.
// Works on an exported JSON file, never on the live store directly. Do not point it at
// production data without Scott's go-ahead.
//
//   netlify blobs:get hvi-cases HVI-XXXXXXXX > case.json
//   ANTHROPIC_API_KEY=... node scripts/rescore-cases.mjs case.json            # dry run: prints old -> new
//   ANTHROPIC_API_KEY=... node scripts/rescore-cases.mjs case.json --write    # writes case.rescored.json
//   netlify blobs:set hvi-cases HVI-XXXXXXXX --input case.rescored.json      # only after review
//
// Entries without a stored transcript (anything scored before transcripts were kept)
// cannot be re-scored; they are left as they are and reported.
import { readFileSync, writeFileSync } from "node:fs";
import { SYSTEM_PROMPT, TRANSCRIPT_ADDENDUM } from "../netlify/lib/systemPrompt.js";
import { callClaude } from "../netlify/lib/score.js";
import { normalizeAssessment, applyCap, formatTranscript, RUBRIC } from "../netlify/lib/intake.js";
import { previousFile } from "../netlify/functions/intake-score.js";

const [file, flag] = process.argv.slice(2);
if (!file) { console.error("usage: node scripts/rescore-cases.mjs case.json [--write]"); process.exit(1); }
if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY not set"); process.exit(1); }

const record = JSON.parse(readFileSync(file, "utf8"));
const rebuilt = [];
for (const [i, old] of record.history.entries()) {
  if (!Array.isArray(old.transcript) || !old.transcript.length) {
    console.log(`visit ${i + 1}: no stored transcript (rubric ${old.rubric ?? 1}), kept as is`);
    rebuilt.push(old);
    continue;
  }
  const prev = rebuilt[rebuilt.length - 1] || null;
  const raw = await callClaude(SYSTEM_PROMPT + TRANSCRIPT_ADDENDUM, previousFile(prev, rebuilt.length) + `INTAKE INTERVIEW TRANSCRIPT:\n\n${formatTranscript(old.transcript)}`);
  const r = applyCap(prev, normalizeAssessment(raw));
  const entry = { ...old, score: r.score, tier: r.tier, breakdown: r.breakdown, confidence: r.confidence, verdict: r.verdict, flags: r.flags, commendations: r.commendations, delta: r.delta, capped: r.capped, rawScore: r.rawScore, capNote: r.capNote, rubric: RUBRIC, rubricReset: Boolean(r.rubricReset), newlyAssessed: r.newlyAssessed || [], provisional: r.provisional, provisionalNote: r.provisionalNote, raw, rescoredAt: new Date().toISOString() };
  console.log(`visit ${i + 1}: ${old.score} (${old.tier}) -> ${entry.score} (${entry.tier})`);
  rebuilt.push(entry);
}
if (flag === "--write") {
  const out = file.replace(/\.json$/, "") + ".rescored.json";
  writeFileSync(out, JSON.stringify({ ...record, history: rebuilt }));
  console.log(`wrote ${out}`);
}
