// THE PEOPLE'S PETITION, the review (docs/PETITION.md). Runs on the Mac (launchd
// com.hvi.petition-review, hourly): reads the queue the hourly petition tick fills and
// re-examines each granted file through the existing rescore pipeline (median of 3 Sonnet
// readings, the Haiku fact-check with its living rules and delete-only guard).
//
//   node scripts/petition-review.mjs             # run whatever is queued (max 3 a day, site-wide)
//   node scripts/petition-review.mjs --dry-run   # show the queue and the jobs; no model, no writes
//
// BLIND: the queue entry carries no direction, and the job handed to the model is built from
// the figure alone (reviewJob), so "the machine agreed" means something. Every section moves
// at most ±60 from where it stood; the move is logged on the file as cause "review", sub
// "petition", and the new log entry opens a new evaluation period (the ballot re-opens).
// Roster files (src/figures.js) are rewritten in a throwaway worktree of origin/main,
// checked, committed and pushed (Netlify deploys); referred files are written to hvi-figures.
import { readFileSync, writeFileSync, mkdtempSync, symlinkSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as PL from "../netlify/lib/petition.js";
import { computeScore, getTier, cube } from "../netlify/lib/intake.js";
import { DIMENSIONS } from "../netlify/lib/questionPools.js";
import { appendFigureHistory, figureEntry } from "../src/movement.js";
import { setFigureHistory } from "./calibration-lib.mjs";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// ---- pure: what the model is given, and what the review may change -------------------------------
// Built from the figure alone. Nothing about the petition, its direction or its size.
export const reviewJob = (fig) => ({ name: fig.name, died: fig.died || null, wikiTitle: fig.wikiTitle || fig.name, harmReview: fig.harmReview ?? null });

// ±max per section. A section the new reading leaves unassessed keeps its old value (a review
// never erases evidence); a newly assessed one is taken, capped around the neutral 50.
export function capBreakdown(before, after, max = PL.CFG.maxSectionMove) {
  const out = {};
  for (const d of DIMENSIONS) {
    const a = before?.[d], b = after?.[d];
    if (!isNum(b)) out[d] = isNum(a) ? a : null;
    else { const base = isNum(a) ? a : 50; out[d] = Math.max(0, Math.min(100, Math.max(base - max, Math.min(base + max, b)))); }
  }
  return out;
}

// The change a finished reading makes to the file.
export function reviewChange(fig, r, now = Date.now()) {
  const breakdown = capBreakdown(fig.breakdown, r.breakdown);
  const score = computeScore(breakdown, r.harm?.severity ?? fig.harm?.severity ?? null, fig.harmReview);
  const tier = getTier(score);
  const q = cube(breakdown);
  // A verdict is replaced only by one that passed the fact-check; otherwise the old one stands.
  const verdict = r.factCheck?.passed && typeof r.verdict === "string" ? r.verdict : fig.verdict;
  const at = new Date(now).toISOString();
  const scoreHistory = appendFigureHistory(fig.scoreHistory, figureEntry({ at, score, tier, cause: "review", sub: "petition", note: PL.REVIEW_NOTE }),
    { at: null, score: fig.score, tier: fig.tier, note: "On file before the review." });
  return { breakdown, score, tier, warmth: q.warmth, competence: q.competence, quadrant: q.quadrant, verdict, scoreHistory, delta: score - fig.score, at };
}

// Rewrite one roster line of src/figures.js (score, tier, cube, breakdown, verdict, log).
const lit = (o) => `{${DIMENSIONS.map(d => `${d}: ${o[d] ?? null}`).join(", ")}}`;
export function rewriteRosterLine(src, name, c) {
  const head = `  { name: ${JSON.stringify(name)}, `;
  const start = src.indexOf(head);
  if (start < 0) throw new Error(`figures.js: no line for ${name}`);
  const end = src.indexOf("\n", start);
  let line = src.slice(start, end < 0 ? src.length : end);
  const reScore = /score: -?\d+, tier: "[^"]*", warmth: -?\d+, competence: -?\d+, quadrant: "[^"]*"/;
  const reBd = /breakdown: \{[^}]*\}/;
  const reVerdict = /verdict: "(?:[^"\\]|\\.)*"/;
  if (!reScore.test(line) || !reBd.test(line) || !reVerdict.test(line)) throw new Error(`figures.js: ${name}'s line is not in the expected shape`);
  line = line.replace(reScore, `score: ${c.score}, tier: ${JSON.stringify(c.tier)}, warmth: ${c.warmth}, competence: ${c.competence}, quadrant: ${JSON.stringify(c.quadrant)}`)
    .replace(reBd, () => `breakdown: ${lit(c.breakdown)}`)
    .replace(reVerdict, () => `verdict: ${JSON.stringify(c.verdict)}`);
  const out = src.slice(0, start) + line + (end < 0 ? "" : src.slice(end));
  return setFigureHistory(out, name, c.scoreHistory);
}

// ---- the run (io injected: the check runs it against memory and a fake model) -----------------------
// io: {store, getCard, rescore(job) -> reading, apply(fig, change)}. -> [{slug, status, ...}]
export async function runReviews(io, { now = Date.now(), log = () => {} } = {}) {
  const done = [];
  for (const q of await PL.queuedReviews(io.store)) {
    const fig = await PL.figureFor(q.slug, io.getCard);
    const close = async (status, extra = {}) => { await PL.finishReview(io.store, q, { status, closedAt: new Date(now).toISOString(), ...extra }); done.push({ slug: q.slug, status, ...extra }); };
    if (!fig) { await close("void", { reason: "the file is gone" }); continue; }
    if (fig.closed) { await close("void", { reason: "the file is closed to opinion" }); continue; }
    // The Department re-evaluated the file on its own since: that period (and its petition) closed.
    if (fig.period !== q.period) { await close("superseded", { reason: `the file moved to evaluation ${fig.period}` }); continue; }
    if (!(await PL.claimRun(io.store, q.slug, now))) { log(`daily cap reached (${PL.CFG.reviewsPerDay}); ${q.slug} waits`); break; }
    log(`re-examining ${fig.name} (${q.slug}), evaluation ${q.period}`);
    let c;
    try {
      const r = await io.rescore(reviewJob(fig));
      c = reviewChange(fig, r, now);
      await io.apply(fig, c);
    } catch (e) {
      // Retried next run; after three failures the petition is closed as failed, on the record.
      const attempts = (q.attempts || 0) + 1;
      log(`review of ${q.slug} failed (${attempts}): ${e.message}`);
      if (attempts >= 3) await close("failed", { reason: String(e.message).slice(0, 200), attempts });
      else await PL.finishReview(io.store, q, { attempts });
      continue;
    }
    await PL.finishReview(io.store, q, { status: "done", reviewedAt: c.at, before: fig.score, after: c.score, delta: c.delta });
    await PL.updateLean(io.store, q.slug, q.period, { delta: c.delta, reviewedAt: c.at });
    done.push({ slug: q.slug, status: "done", before: fig.score, after: c.score });
  }
  return done;
}

// ---- production (the Mac) ------------------------------------------------------------------------------
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const run = (cmd, args, cwd = ROOT) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 });
const SESSION = "Claude-Session: https://claude.ai/code/session_01KhP2qfbAP6uppihTED8JiQ";

// A roster file lives in the source: rewrite it in a throwaway worktree of origin/main (the
// main checkout may hold someone's work in progress), check, commit, push.
function applyRoster(fig, c) {
  run("git", ["fetch", "-q", "origin"]);
  const wt = mkdtempSync(join(tmpdir(), "hvi-petition-"));
  run("git", ["worktree", "add", "-q", "--detach", wt, "origin/main"]);
  try {
    if (existsSync(join(ROOT, "node_modules"))) symlinkSync(join(ROOT, "node_modules"), join(wt, "node_modules"));
    const path = join(wt, "src/figures.js");
    writeFileSync(path, rewriteRosterLine(readFileSync(path, "utf8"), fig.name, c));
    for (const chk of ["scripts/check-movement.mjs", "scripts/check-petition.mjs"]) run("node", [chk], wt);
    run("git", ["add", "src/figures.js"], wt);
    run("git", ["commit", "-q", "-m", `Petition review: ${fig.name} ${fig.score} -> ${c.score}\n\nThe people petitioned; the Department re-examined the record, blind to which way they leaned\n(median of 3, fact-checked, ±${PL.CFG.maxSectionMove} per section). A new evaluation period opens.\n\n${SESSION}`], wt);
    for (let i = 0; ; i++) {
      try { run("git", ["push", "-q", "origin", "HEAD:main"], wt); break; } catch (e) {
        if (i >= 3) throw e;
        run("git", ["fetch", "-q", "origin"], wt); run("git", ["rebase", "-q", "origin/main"], wt);
      }
    }
    return run("git", ["rev-parse", "HEAD"], wt).trim();
  } finally {
    try { run("git", ["worktree", "remove", "--force", wt]); } catch { /* leave it for git worktree prune */ }
  }
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const prod = await import("./roster/prod.mjs");
  const store = prod.store(PL.STORE);
  const q = await PL.queuedReviews(store);
  console.log(`${new Date().toISOString()} petition review: ${q.length} queued`);
  if (dry) {
    for (const e of q) { const f = await PL.figureFor(e.slug, prod.getCard); console.log(" ", e.slug, "period", e.period, "->", f ? JSON.stringify(reviewJob(f)) : "(gone)"); }
    return;
  }
  if (!q.length) return;
  if (!process.env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = run("netlify", ["env:get", "ANTHROPIC_API_KEY", "--context", "production"]).trim();
  if (!/^sk-ant-/.test(process.env.ANTHROPIC_API_KEY)) throw new Error("no Anthropic key (netlify env:get); run `netlify link` in the repo");
  const { rescoreOne } = await import("./rescore-lib.mjs");
  const figs = prod.store("hvi-figures");
  const done = await runReviews({
    store, getCard: prod.getCard,
    rescore: (job) => rescoreOne(job),
    apply: async (fig, c) => {
      if (fig.kind === "roster") { console.log("  pushed", applyRoster(fig, c)); return; }
      for (let i = 0; i < 6; i++) {
        const cur = await prod.retry(() => figs.getWithMetadata(fig.slug, { type: "json" }));
        if (!cur?.data) throw new Error(`${fig.slug}: card vanished`);
        const card = { ...cur.data, score: c.score, tier: c.tier, breakdown: c.breakdown, verdict: c.verdict, scoreHistory: c.scoreHistory };
        const res = await prod.retry(() => figs.setJSON(fig.slug, card, { onlyIfMatch: cur.etag }));
        if (res.modified) { await prod.syncIndex([fig.slug]); return; }
      }
      throw new Error(`${fig.slug}: lost the card write race`);
    },
  }, { log: (s) => console.log(" ", s) });
  for (const d of done) console.log(" ", d.slug, d.status, d.before ?? "", d.after != null ? `-> ${d.after}` : "", d.reason || "");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(e => { console.error("petition review failed:", e.message); process.exit(1); });
}
