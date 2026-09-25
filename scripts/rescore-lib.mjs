// Median-of-N public-record scoring, shared by scripts/rescore-figures.mjs (the full
// roster pass) and scripts/calibrate.mjs (the weekly drift sample).
//
// One reading of a public figure varies by ~±30 points run to run. Scoring N times and
// taking the per-dimension median cancels most of that; the verdict comes from the run
// whose breakdown sits closest to the median, then goes through the Haiku fact-check.
import { SYSTEM_PROMPT } from "../netlify/lib/systemPrompt.js";
import { PUBLIC_RECORD, directiveFor } from "../netlify/lib/publicRecord.js";
import { callClaude } from "../netlify/lib/score.js";
import { normalizeAssessment, computeScore } from "../netlify/lib/intake.js";
import { factCheck } from "../netlify/lib/factCheck.js";
import { fetchArticleText } from "../netlify/lib/refer.js";
import { DIMENSIONS } from "../netlify/lib/questionPools.js";

export const RUNS = 3;

// Median of the numeric readings; a dimension most runs left unassessed stays unassessed.
export function medianOf(values) {
  const nums = values.filter(v => typeof v === "number").sort((a, b) => a - b);
  if (nums.length * 2 <= values.length) return null;
  const m = nums.length >> 1;
  return nums.length % 2 ? nums[m] : Math.round((nums[m - 1] + nums[m]) / 2);
}

export function medianBreakdown(breakdowns) {
  return Object.fromEntries(DIMENSIONS.map(d => [d, medianOf(breakdowns.map(b => b?.[d] ?? null))]));
}

// L1 distance over dimensions both sides assessed; a mismatch in assessed-ness costs 50.
export function distance(a, b) {
  let s = 0;
  for (const d of DIMENSIONS) {
    const x = a?.[d], y = b?.[d];
    if (typeof x === "number" && typeof y === "number") s += Math.abs(x - y);
    else if ((x == null) !== (y == null)) s += 50;
  }
  return s;
}

// Per-dimension spread (max - min across runs) and the spread of the headline score.
export function dispersion(breakdowns) {
  const dims = Object.fromEntries(DIMENSIONS.map(d => {
    const v = breakdowns.map(b => b?.[d]).filter(x => typeof x === "number");
    return [d, v.length ? Math.max(...v) - Math.min(...v) : null];
  }));
  const scores = breakdowns.map(b => computeScore(b));
  return { dims, score: Math.max(...scores) - Math.min(...scores) };
}

// The model is told who is dead from Wikidata-backed data, never left to its memory.
export const statusLine = died => `STATUS: ${died ? `deceased (died ${died})` : "living"}`;

async function once(name, died, calls) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      calls.sonnet++;
      const raw = await callClaude(SYSTEM_PROMPT + PUBLIC_RECORD,
        `PUBLIC FIGURE: ${name}\n${statusLine(died)}\n(If you cite a directive, cite Directive ${directiveFor(name)}.)`);
      return normalizeAssessment({ ...raw, confidence: undefined });
    } catch (e) {
      console.error(`retry ${attempt} ${name}: ${e.message}`);
      await new Promise(r => setTimeout(r, 3000 * attempt));
    }
  }
  throw new Error(`gave up on ${name}`);
}

// Returns the median reading plus everything needed to report and audit it.
export async function rescoreOne({ name, died = null, wikiTitle = name }, { runs = RUNS, check = true, calls = { sonnet: 0, haiku: 0 } } = {}) {
  const readings = await Promise.all(Array.from({ length: runs }, () => once(name, died, calls)));
  const breakdowns = readings.map(r => r.breakdown);
  const breakdown = medianBreakdown(breakdowns);
  const closest = readings.reduce((best, r) => (distance(r.breakdown, breakdown) < distance(best.breakdown, breakdown) ? r : best));
  let verdict = closest.verdict, fc = null;
  if (check) {
    try {
      const source = await fetchArticleText(wikiTitle).catch(() => "");
      if (source) {
        calls.haiku++;
        fc = await factCheck({ name, deceased: Boolean(died), source, verdict });
        if (fc.verdict) verdict = fc.verdict;
      }
    } catch (e) {
      console.error(`fact-check failed for ${name}: ${e.message}; keeping the unchecked verdict`);
    }
  }
  return {
    name, breakdown, verdict, flags: closest.flags, commendations: closest.commendations,
    score: computeScore(breakdown), spread: dispersion(breakdowns), runScores: breakdowns.map(b => computeScore(b)),
    factCheck: fc ? { checked: fc.checked, removed: fc.removed, at: new Date().toISOString() } : null,
  };
}

// Small fixed-size pool; each job already fans out to `runs` concurrent calls.
export async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}
