// The roster engine: grows the Human Value Index by N public figures per run, cheaply.
//
//   node scripts/roster-grow.mjs [--n 48] [--max-wait-min 360] [--dry-run]
//   node scripts/roster-grow.mjs --status
//
// One run is a small state machine, persisted after every step in
// ~/.cache/hvi-roster/state.json, so a batch that outlives the process is picked up on the
// next invocation (the weekly launchd job advances an unfinished run before starting a
// new one):
//
//   candidates  stratified people from Pantheon + Wikidata (scripts/roster/candidates.mjs)
//   scoring     one Message Batch (Sonnet 5, 50% price, cached system prompt): each person
//               read 3 times; the per-dimension median is kept (same as rescore-lib)
//   factcheck   one Message Batch (Haiku) of the median-closest verdicts vs the article
//   sprites     4x4 grids, 16 people per Higgsfield image, looks only (scripts/roster/grid.py)
//   store       cards into production hvi-figures (source: roster-engine), spriteStatus
//               pending; the grid cells are already in the raw cache, so
//               scripts/referral_sprites.py uploads them without a new generation
//   report      a "## Roster engine" note in MORNING_REPORT.md, then the desk collector
//
// Budgets are checked before anything is spent: HVI_ROSTER_MAX_DOLLARS (default 3) against
// a token estimate at batch prices, and HVI_ROSTER_MAX_CREDITS (default 20) against the
// Higgsfield cost of the grids plus any single-figure redraws.
import { unsafeLook, NEUTRAL_LOOK } from "../netlify/lib/look.js";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { SYSTEM_PROMPT } from "../netlify/lib/systemPrompt.js";
import { PUBLIC_RECORD, REFERRAL_ADDENDUM, ENGINE_ADDENDUM, PLACES, directiveFor } from "../netlify/lib/publicRecord.js";
import { parseModelJson } from "../netlify/lib/score.js";
import { normalizeAssessment, computeScore, getTier, cube } from "../netlify/lib/intake.js";
import { FACT_CHECK_SYSTEM, SOURCE_MAX, summarizeFactCheck } from "../netlify/lib/factCheck.js";
import { fetchArticleText, placeReferral } from "../netlify/lib/refer.js";
import { medianBreakdown, distance, dispersion, RUNS } from "./rescore-lib.mjs";
import { buildCohort } from "./roster/candidates.mjs";
import { createBatch, getBatch, batchResults, resultText, resultUsage, estimateDollars, actualDollars, approxTokens } from "./roster/batch.mjs";
import { prodQids, getCard, createCard } from "./roster/prod.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const STATE_DIR = `${homedir()}/.cache/hvi-roster`;
const STATE = `${STATE_DIR}/state.json`;
const PY = "/opt/homebrew/bin/python3";
const SCORE_MODEL = "claude-sonnet-5";
const CHECK_MODEL = "claude-haiku-4-5-20251001";
const SYSTEM = SYSTEM_PROMPT + PUBLIC_RECORD + REFERRAL_ADDENDUM + ENGINE_ADDENDUM;
const DECLINE = new Set(["minor", "victim", "pending_case"]);
const MAX_LOOK = 400;
const GRID = 16;
// Credits per 4k grid and per single redraw. Set from the first real run (see the log);
// the budget guard uses these before spending.
export const GRID_CREDITS = Number(process.env.HVI_GRID_CREDITS || 4);
export const SINGLE_CREDITS = 2;
export const MAX_DOLLARS = Number(process.env.HVI_ROSTER_MAX_DOLLARS || 3);
export const MAX_CREDITS = Number(process.env.HVI_ROSTER_MAX_CREDITS || 20);

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const log = m => console.log(`${new Date().toISOString().slice(0, 19)} ${m}`);

export const loadState = (path = STATE) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { runs: [] });
export function saveState(s, path = STATE) { mkdirSync(STATE_DIR, { recursive: true }); writeFileSync(path, JSON.stringify(s, null, 1)); }
const activeRun = s => s.runs.find(r => !["done", "failed"].includes(r.stage));

// ---- budget --------------------------------------------------------------------------
const userPrompt = c => `PUBLIC FIGURE: ${c.title}\nSTATUS: ${c.living ? "living" : `deceased (died ${c.died})`}\nWIKIPEDIA DESCRIPTION: ${c.description}\nWIKIPEDIA SUMMARY: ${c.extract}\n(If you cite a directive, cite Directive ${directiveFor(c.title)}.)`;

// Dollars for scoring (RUNS reads each) plus the fact-check, estimated high.
export function estimateRunDollars(cohort) {
  const sys = approxTokens(SYSTEM), fcSys = approxTokens(FACT_CHECK_SYSTEM);
  let score = 0, check = 0;
  for (const c of cohort) {
    score += estimateDollars(SCORE_MODEL, RUNS * (sys + approxTokens(userPrompt(c))), RUNS * 900);
    check += estimateDollars(CHECK_MODEL, fcSys + SOURCE_MAX / 4 + 300, 800);
  }
  return score + check;
}

// Largest prefix of the cohort that fits the dollar budget.
export function fitDollars(cohort, max = MAX_DOLLARS) {
  let n = cohort.length;
  while (n > 0 && estimateRunDollars(cohort.slice(0, n)) > max) n--;
  return cohort.slice(0, n);
}

// Credits the sprite step may spend: grids first, then single redraws of failed cells.
// Returns { grids, redraws } that fit, or null when not even the grids fit.
export function planCredits(n, failedCells = 0, max = MAX_CREDITS) {
  const grids = Math.ceil(n / GRID);
  const gridCost = grids * GRID_CREDITS;
  if (gridCost > max) return null;
  return { grids, redraws: Math.max(0, Math.min(failedCells, Math.floor((max - gridCost) / SINGLE_CREDITS))) };
}

// ---- stages --------------------------------------------------------------------------
async function stageCandidates(run) {
  const taken = await prodQids();
  const raw = await buildCohort(run.n, taken, { log });
  const cohort = fitDollars(raw);
  if (cohort.length < raw.length) log(`budget: cohort trimmed ${raw.length} -> ${cohort.length} to stay under $${MAX_DOLLARS}`);
  if (!cohort.length) throw new Error("budget allows no one this run");
  run.cohort = cohort.map((c, i) => ({ ...c, cid: `p${i}` }));
  run.estDollars = Number(estimateRunDollars(run.cohort).toFixed(3));
  run.stage = "scoring";
  log(`cohort: ${run.cohort.length} people, est $${run.estDollars}`);
}

async function stageScoring(run) {
  if (!run.scoreBatch) {
    const requests = run.cohort.flatMap(c => Array.from({ length: RUNS }, (_, k) => ({
      custom_id: `${c.cid}_r${k}`,
      params: {
        model: SCORE_MODEL, max_tokens: 1500, thinking: { type: "disabled" },
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral", ttl: "1h" } }],
        messages: [{ role: "user", content: userPrompt(c) }],
      },
    })));
    const b = await createBatch(requests);
    run.scoreBatch = b.id;
    log(`scoring batch ${b.id}: ${requests.length} requests`);
  }
  const b = await getBatch(run.scoreBatch);
  if (b.processing_status !== "ended") return false;
  const results = await batchResults(b);
  run.usage = { ...(run.usage || {}), score: [...results.values()].map(resultUsage).filter(Boolean) };
  run.scored = {};
  for (const c of run.cohort) {
    const reads = [];
    for (let k = 0; k < RUNS; k++) {
      const text = resultText(results.get(`${c.cid}_r${k}`));
      if (!text) continue;
      try { reads.push(parseModelJson(text)); } catch { /* malformed read: dropped */ }
    }
    const refusals = reads.filter(r => r?.is_human_public_figure === false || DECLINE.has(r?.decline)).length;
    if (!reads.length || refusals * 2 >= RUNS) { run.scored[c.cid] = { dropped: reads.length ? "declined" : "no readings" }; continue; }
    const ok = reads.filter(r => r?.is_human_public_figure !== false && !DECLINE.has(r?.decline));
    const readings = ok.map(r => ({ raw: r, a: normalizeAssessment({ ...r, confidence: undefined }) }));
    const breakdown = medianBreakdown(readings.map(x => x.a.breakdown));
    const closest = readings.reduce((best, x) => (distance(x.a.breakdown, breakdown) < distance(best.a.breakdown, breakdown) ? x : best));
    // First clean look among the readings; a banned term in every one falls back to neutral.
    const looks = [closest, ...readings].map(x => x.raw.sprite_look).filter(l => typeof l === "string" && l.trim());
    const look = looks.find(l => !unsafeLook(l)) || (looks.length ? NEUTRAL_LOOK : "");
    const places = (Array.isArray(closest.raw.places) ? closest.raw.places : []).filter(p => PLACES.includes(p)).slice(0, 4);
    run.scored[c.cid] = {
      breakdown, verdict: closest.a.verdict, flags: closest.a.flags, commendations: closest.a.commendations,
      harm: closest.a.harm ? { ...closest.a.harm, runs: readings.map(x => x.a.harm?.band ?? null) } : null,
      spread: dispersion(readings.map(x => x.a.breakdown)).score, reads: readings.length,
      look: look.replace(/\s+/g, " ").trim().slice(0, MAX_LOOK), places,
      noDangle: readings.filter(x => x.raw.no_dangle === true).length * 2 > readings.length,
    };
  }
  const dropped = Object.values(run.scored).filter(s => s.dropped).length;
  log(`scoring done: ${run.cohort.length - dropped} kept, ${dropped} dropped`);
  run.stage = "factcheck";
  return true;
}

async function stageFactcheck(run) {
  const keep = run.cohort.filter(c => !run.scored[c.cid].dropped);
  if (!run.checkBatch) {
    const requests = [];
    for (const c of keep) {
      const source = (await fetchArticleText(c.title, fetch, SOURCE_MAX).catch(() => "")) || c.extract;
      requests.push({
        custom_id: `${c.cid}_fc`,
        params: {
          model: CHECK_MODEL, max_tokens: 1500,
          system: [{ type: "text", text: FACT_CHECK_SYSTEM, cache_control: { type: "ephemeral", ttl: "1h" } }],
          messages: [{ role: "user", content: `SUBJECT: ${c.title}\nSTATUS: ${c.living ? "living" : "deceased"}\n\nSOURCE:\n${source}\n\nVERDICT:\n${run.scored[c.cid].verdict}` }],
        },
      });
    }
    if (!requests.length) { run.stage = "sprites"; return true; }
    const b = await createBatch(requests);
    run.checkBatch = b.id;
    log(`fact-check batch ${b.id}: ${requests.length} requests`);
  }
  const b = await getBatch(run.checkBatch);
  if (b.processing_status !== "ended") return false;
  const results = await batchResults(b);
  run.usage = { ...(run.usage || {}), check: [...results.values()].map(resultUsage).filter(Boolean) };
  for (const c of keep) {
    const s = run.scored[c.cid];
    const text = resultText(results.get(`${c.cid}_fc`));
    let fc = null;
    try { if (text) fc = summarizeFactCheck(parseModelJson(text), s.verdict); } catch { fc = null; }
    // ponytail: no regenerate-on-mostly-failed here (the live /api/refer does one); the
    // cleaned verdict publishes, and a check that failed outright withholds the verdict.
    s.verdictStatus = fc?.verdict ? "published" : "withheld";
    if (fc?.verdict) s.verdict = fc.verdict;
    s.factCheck = fc ? { checked: fc.checked, removed: fc.removed, regenerated: false, at: new Date().toISOString() } : null;
  }
  run.stage = "sprites";
  return true;
}

function higgsCredits() {
  try {
    const out = execFileSync("higgsfield", ["account", "status"], { encoding: "utf8", timeout: 60000 });
    const m = /([\d.]+)\s+credits/.exec(out);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}

async function stageSprites(run) {
  const keep = run.cohort.filter(c => !run.scored[c.cid].dropped);
  // Slugs are decided here (before the grid writes raws under them), exactly as a referral
  // would place the person: namesakes of people on file get a qualified slug.
  const used = new Set();
  for (const c of keep) {
    if (run.scored[c.cid].slug) { used.add(run.scored[c.cid].slug); continue; }
    const place = await placeReferral({ title: c.title, wikidata: c.wikidata }, async slug => (used.has(slug) ? { wikidata: "taken-this-run" } : await getCard(slug)));
    run.scored[c.cid].slug = place.slug || null;
    if (place.slug) used.add(place.slug);
  }
  const drawable = keep.filter(c => run.scored[c.cid].slug && run.scored[c.cid].look);
  const plan = planCredits(drawable.length);
  if (!plan) { log(`budget: sprites skipped (grids need more than ${MAX_CREDITS} credits); cards stay pending`); run.sprites = { skipped: true }; run.stage = "store"; return true; }
  run.sprites = run.sprites || { grids: [] };
  if (run.sprites.creditsBefore == null) run.sprites.creditsBefore = higgsCredits();
  for (let g = 0; g * GRID < drawable.length; g++) {
    if (run.sprites.grids[g]?.done) continue;
    const chunk = drawable.slice(g * GRID, (g + 1) * GRID).map(c => ({ slug: run.scored[c.cid].slug, look: run.scored[c.cid].look }));
    const dir = `${tmpdir()}/hvi-roster`;
    mkdirSync(dir, { recursive: true });
    const inPath = `${dir}/${run.id}-g${g}-in.json`, outPath = `${dir}/${run.id}-g${g}.json`;
    writeFileSync(inPath, JSON.stringify(chunk));
    try {
      execFileSync(PY, [`${ROOT}scripts/roster/grid.py`, inPath, outPath], { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"], timeout: 1800000 });
      const res = JSON.parse(readFileSync(outPath, "utf8"));
      run.sprites.grids[g] = { done: true, sheet: res.sheet, job: res.job, cells: res.cells };
    } catch (e) {
      log(`grid ${g} failed: ${e.message.slice(0, 200)}; those figures fall back to single redraws`);
      run.sprites.grids[g] = { done: true, failed: String(e.message).slice(0, 300), cells: chunk.map(c => ({ slug: c.slug, ok: false, reason: "grid failed" })) };
    }
    saveState(state);
  }
  run.sprites.creditsAfterGrids = higgsCredits();
  const cells = run.sprites.grids.flatMap(g => g.cells || []);
  const failed = cells.filter(c => !c.ok).map(c => c.slug);
  const allowed = planCredits(drawable.length, failed.length)?.redraws ?? 0;
  run.sprites.redraw = failed.slice(0, allowed);
  run.sprites.noRedraw = failed.slice(allowed);
  log(`sprites: ${cells.length - failed.length}/${cells.length} grid cells usable; ${run.sprites.redraw.length} single redraws allowed, ${run.sprites.noRedraw.length} left as placeholders`);
  run.stage = "store";
  return true;
}

async function stageStore(run) {
  run.stored = run.stored || [];
  const noRedraw = new Set(run.sprites?.noRedraw || []);
  for (const c of run.cohort) {
    const s = run.scored[c.cid];
    if (s.dropped || !s.slug || run.stored.includes(s.slug)) continue;
    const score = computeScore(s.breakdown);
    const card = {
      slug: s.slug, name: c.title.replace(/\s*\([^)]*\)\s*$/, ""), wikiTitle: c.title, wikidata: c.wikidata,
      score, tier: getTier(score), ...cube(s.breakdown), breakdown: s.breakdown, confidence: null, verdict: s.verdict,
      verdictStatus: s.verdictStatus || "withheld", living: c.living, born: c.born, died: c.died,
      factCheck: s.factCheck || null, noDangle: Boolean(s.noDangle), flags: s.flags, commendations: s.commendations,
      harm: s.harm, spread: s.spread, places: s.places, people: null,
      sprite: null, spriteStatus: noRedraw.has(s.slug) ? "failed" : "pending", spriteAttempts: 0, look: s.look,
      source: "roster-engine", stratum: c.stratum, run: run.id, referredBy: "ENGN", at: new Date().toISOString(),
    };
    if (await createCard(card)) { run.stored.push(s.slug); log(`stored ${s.slug}: ${score} ${card.tier} ${card.quadrant || ""}`); }
    else log(`slug taken meanwhile, skipped: ${s.slug}`);
    saveState(state);
  }
  run.stage = "upload";
  return true;
}

function stageUpload(run) {
  // Uploads the grid cells already in the raw cache (no generation) and redraws the
  // failed ones within the credit budget the store step allowed.
  try {
    execFileSync(PY, [`${ROOT}scripts/referral_sprites.py`], { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"], timeout: 3600000 });
  } catch (e) { log(`sprite upload job exited non-zero: ${e.message.slice(0, 200)} (it runs again every 10 minutes)`); }
  if (run.sprites) run.sprites.creditsAfter = higgsCredits();
  run.stage = "report";
  return true;
}

function stageReport(run) {
  const kept = run.stored?.length || 0;
  const score = actualDollars(SCORE_MODEL, run.usage?.score || []), check = actualDollars(CHECK_MODEL, run.usage?.check || []);
  const credits = run.sprites?.creditsBefore != null && run.sprites?.creditsAfter != null ? run.sprites.creditsBefore - run.sprites.creditsAfter : null;
  run.cost = { dollars: Number((score + check).toFixed(3)), credits: credits == null ? null : Number(credits.toFixed(2)) };
  const perFig = kept ? { dollars: (run.cost.dollars / kept).toFixed(3), credits: credits == null ? "?" : (credits / kept).toFixed(2) } : null;
  const byPool = {};
  for (const c of run.cohort) if (run.stored?.includes(run.scored[c.cid]?.slug)) byPool[c.stratum.pool] = (byPool[c.stratum.pool] || 0) + 1;
  const line = `- **${run.id}:** ${kept} new figures (${Object.entries(byPool).map(([k, v]) => `${v} ${k}`).join(", ")}). Cost $${run.cost.dollars} + ${credits ?? "?"} Higgsfield credits${perFig ? ` (~$${perFig.dollars} and ${perFig.credits} credits each)` : ""}. The Sunday calibration picks them up.`;
  const mr = `${ROOT}MORNING_REPORT.md`;
  let text = existsSync(mr) ? readFileSync(mr, "utf8") : "# Human Value Index\n";
  if (text.includes("\n## Roster engine\n")) text = text.replace("\n## Roster engine\n", `\n## Roster engine\n\n${line}\n`);
  else text = `${text.trimEnd()}\n\n## Roster engine\n\n${line}\n`;
  writeFileSync(mr, text);
  try { execFileSync("/opt/homebrew/bin/python3", [`${homedir()}/projects/organize/collect_reports.py`], { stdio: "ignore", timeout: 300000 }); } catch { log("desk collector failed (non-fatal)"); }
  log(line);
  run.stage = "done";
  return true;
}

const STAGES = { candidates: stageCandidates, scoring: stageScoring, factcheck: stageFactcheck, sprites: stageSprites, store: stageStore, upload: stageUpload, report: stageReport };

let state;
async function main() {
  state = loadState();
  if (args.includes("--status")) { console.log(JSON.stringify(state.runs.map(r => ({ id: r.id, stage: r.stage, n: r.cohort?.length, stored: r.stored?.length, cost: r.cost })), null, 1)); return; }
  if (args.includes("--dry-run")) {
    const cohort = await buildCohort(Number(arg("--n", 16)), await prodQids(), { log });
    console.log(`${cohort.length} candidates, est $${estimateRunDollars(cohort).toFixed(3)}, fits $${MAX_DOLLARS}: ${fitDollars(cohort).length}; credits plan ${JSON.stringify(planCredits(cohort.length))}`);
    for (const c of cohort) console.log(`  ${c.stratum.pool.padEnd(9)} ${c.stratum.era.padEnd(12)} ${c.title}`);
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = execFileSync("netlify", ["env:get", "ANTHROPIC_API_KEY", "--context", "production"], { cwd: ROOT, encoding: "utf8" }).trim();
  }
  // One process at a time: a Saturday run can still be waiting on a batch when a manual
  // kickstart (or the next Saturday) arrives.
  const lock = `${STATE_DIR}/lock`;
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, "utf8"));
    let alive = false;
    try { process.kill(pid, 0); alive = true; } catch { alive = false; }
    if (alive) { log(`another roster run is in progress (pid ${pid}); exiting`); return; }
  }
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(lock, String(process.pid));
  process.on("exit", () => { try { if (readFileSync(lock, "utf8") === String(process.pid)) unlinkSync(lock); } catch { /* gone */ } });

  let run = activeRun(state);
  // Weekly cadence: a new run starts at most every 6 days unless --force, so a manual
  // kickstart doesn't double the week's spend. It still proves the job can reach production.
  const last = state.runs.at(-1);
  if (!run && last && Date.now() - Date.parse(last.created) < 6 * 864e5 && !args.includes("--force")) {
    log(`cadence: last run ${last.id} started ${last.created.slice(0, 16)}; next due ${new Date(Date.parse(last.created) + 6 * 864e5).toISOString().slice(0, 10)}. production has ${(await prodQids()).size} referred/engine figures on file. Nothing to do.`);
    return;
  }
  if (!run) {
    run = { id: `R${new Date().toISOString().slice(0, 10)}-${state.runs.length + 1}`, n: Number(arg("--n", 48)), stage: "candidates", created: new Date().toISOString() };
    state.runs.push(run);
    log(`new run ${run.id} (n=${run.n})`);
  } else log(`resuming ${run.id} at ${run.stage}`);
  const deadline = Date.now() + Number(arg("--max-wait-min", 360)) * 60000;
  while (run.stage !== "done") {
    let advanced;
    try {
      advanced = await STAGES[run.stage](run);
    } catch (e) {
      run.errors = [...(run.errors || []), `${run.stage}: ${e.message}`];
      saveState(state);
      throw e;
    }
    saveState(state);
    if (advanced === false) {
      if (Date.now() > deadline) { log(`still waiting on ${run.stage}; the next run resumes it`); return; }
      await new Promise(r => setTimeout(r, 60000));
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { log(`FAILED: ${e.stack || e.message}`); process.exit(1); });
}
