// The weekly self-calibration loop. Scott's rule: the machine PROPOSES, he approves.
//
//   node scripts/calibrate.mjs                 measure, learn from production appeals, propose;
//                                              writes docs/calibration/<date>.md + proposal JSON,
//                                              puts a desk item in MORNING_REPORT.md when there is
//                                              something to approve, refreshes the desk.
//   node scripts/calibrate.mjs --check-answers read DESK_ANSWERS.md; apply or reject the open
//                                              proposal (apply = rescore, every check, then push).
//   --dry-run                                  (either mode) compute and print; write nothing.
//
// Scheduled by ~/Library/LaunchAgents/com.hvi.calibrate.plist (Sun 21:00) and
// com.hvi.calibrate-answers.plist (daily 09:30). Log: ~/Library/Logs/hvi-calibrate.log.
// Production is only READ here, except on an approved apply (referral cards rescored).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as L from "./calibration-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = (...p) => path.join(ROOT, ...p);
const CAL_PATH = P("netlify/lib/calibration.json");
const DIR = P("docs/calibration");
const STATE = path.join(DIR, "state.json");
const SITE = "3ac3fcb8-cab4-489b-8ea9-1e4153b87941";
const DRY = process.argv.includes("--dry-run");
const today = new Date().toISOString().slice(0, 10);
const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = (...a) => console.log(stamp(), ...a);

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const write = (f, s) => { if (DRY) return log(`[dry-run] would write ${path.relative(ROOT, f)}`); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20, ...opts });

// ---- production reads (netlify CLI; the repo is linked to the site) ---------------------
function blobKeys(store) {
  const out = JSON.parse(run("netlify", ["blobs:list", store, "--json"]));
  return (out.blobs || []).map(b => b.key);
}
function blobGet(store, key) {
  const txt = run("netlify", ["blobs:get", store, key]);
  try { return JSON.parse(txt); } catch { return null; }
}
function blobSet(store, key, obj) {
  const tmp = path.join(DIR, `.tmp-${store}-${key.replace(/[^a-z0-9-]/gi, "_")}.json`);
  fs.writeFileSync(tmp, JSON.stringify(obj));
  try { run("netlify", ["blobs:set", store, key, "--input", tmp]); } finally { fs.rmSync(tmp, { force: true }); }
}
function productionCases() {
  const keys = blobKeys("hvi-cases");
  return { keys: keys.length, cases: keys.map(k => blobGet("hvi-cases", k)).filter(Boolean) };
}
function productionReferrals() {
  const keys = blobKeys("hvi-figures").filter(k => k !== "index");
  return keys.map(k => ({ key: k, card: blobGet("hvi-figures", k) })).filter(x => x.card && !x.card.removed && x.card.breakdown);
}

// ---- roster --------------------------------------------------------------------------
async function roster(referrals) {
  const { FAMOUS_FIGURES } = await import(`../src/figures.js?${Date.now()}`);
  const refs = referrals.map(({ card }) => ({ name: card.name, breakdown: card.breakdown, people: card.people || null, referral: true }));
  const names = new Set(FAMOUS_FIGURES.map(f => f.name));
  return { figures: FAMOUS_FIGURES, all: [...FAMOUS_FIGURES, ...refs.filter(r => !names.has(r.name))] };
}

// ---- desk ----------------------------------------------------------------------------
const REPORT = P("MORNING_REPORT.md");
function stripBullet(md, prefix) {
  // removes a "- <prefix>..." bullet and its indented continuation lines
  const lines = md.split("\n"), out = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(`- ${prefix}`)) { i++; while (i < lines.length && /^\s+\S/.test(lines[i])) i++; i--; continue; }
    out.push(lines[i]);
  }
  return out.join("\n");
}
function stripSection(md, title) {
  const re = new RegExp(`\\n## ${title}\\n[\\s\\S]*?(?=\\n## |$)`);
  return md.replace(re, "\n");
}
function upsertReport({ bullet, section }) {
  let md = fs.existsSync(REPORT) ? fs.readFileSync(REPORT, "utf8") : `# Human Value Index — ${today}\n`;
  md = stripBullet(md, "Calibration proposal");
  md = stripSection(md, "Calibration");
  if (bullet) {
    if (!/\n## Needs you\n/.test(md)) {
      const firstH2 = md.search(/\n## /);
      md = firstH2 < 0 ? `${md.trimEnd()}\n\n## Needs you\n` : `${md.slice(0, firstH2)}\n\n## Needs you\n${md.slice(firstH2)}`;
    }
    md = md.replace(/\n## Needs you\n/, `\n## Needs you\n\n${bullet}\n`);
  }
  if (section) md = `${md.trimEnd()}\n\n## Calibration\n\n${section}\n`;
  md = md.replace(/\n{3,}/g, "\n\n");
  write(REPORT, md);
}
function refreshDesk() {
  if (DRY) return;
  try { run("python3", [path.join(process.env.HOME, "projects/organize/collect_reports.py")], { cwd: path.join(process.env.HOME, "projects/organize") }); log("desk refreshed"); }
  catch (e) { log("desk refresh failed:", String(e.stderr || e.message).slice(0, 300)); }
}

// ---- report text ----------------------------------------------------------------------
const pct = x => `${Math.round(x * 100)}%`;
function fmtRho(r) { return r.rho == null ? `n/a (n=${r.n})` : `${r.rho} (n=${r.n})`; }
function reportMd({ cal, p, learned, prodInfo }) {
  const m = p.base.m, b = p.best;
  const movers = b ? Object.values(b.f.m.byName).map(r => ({ name: r.name, from: m.byName[r.name]?.score, to: r.score })).map(x => ({ ...x, d: x.to - x.from })).filter(x => x.d).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 8) : [];
  const wrongPct = p.worth ? Math.max(1, Math.round((p.gain / Math.max(p.base.soft, 0.01)) * 100)) : 0;
  const lines = [];
  lines.push(`# Calibration — ${today}`, "");
  lines.push(p.worth
    ? `> "The Department has reviewed its own methods. It found itself ${wrongPct}% wrong. A correction awaits approval. It does not apologise."`
    : `> "The Department has reviewed its own methods. It found nothing worth changing. It is not relieved. It does not experience relief."`, "");
  lines.push(`**Decision: ${p.decision.toUpperCase()}.** ${p.reason}`, "");
  lines.push(`Calibration on file: version ${cal.version} (${cal.date}), reality index ${cal.realityIndex}.`, "");
  lines.push("## How the current scale performs", "");
  lines.push(`- Subjects measured: ${m.rows.length} (${prodInfo.referrals} production referrals included)`);
  lines.push(`- Fit to real-world liking (Spearman ρ vs YouGov liked share): ${fmtRho(m.rho.yougovLikedShare)}; vs % disliked: ${fmtRho(m.rho.yougovDisliked)}; vs Pantheon fame: ${fmtRho(m.rho.pantheonHpi)}`);
  lines.push(`- Tier spread (1 = perfectly even over the 6 tiers): ${m.tierEvenness} — ${Object.entries(m.tierCounts).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  lines.push(`- Octants: ${Object.entries(m.octantCounts).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  lines.push(`- Personas: decent ordinary ${m.personas["Decent ordinary"].score} (p${m.personas["Decent ordinary"].percentile}); Scott-like ${m.personas["Scott-like"].score} (p${m.personas["Scott-like"].percentile})`);
  lines.push(`- Moral rules: ${Object.entries(m.invariants).map(([k, v]) => `${k} ${v ? "✓" : "✗"}`).join(" · ")}`);
  if (m.saintsLow.length) lines.push(`- **Finding:** below the roster median (${m.median}) despite being on the reference list of the admired: ${m.saintsLow.map(n => `${n} (${m.byName[n].score})`).join(", ")}. Either the breakdown under-reads them or the reference list is wrong. That's a human call; no weight nudge fixes it without moving others.`);
  if (m.drift) lines.push(`- Drift since last run: mean rank change ${m.drift.meanAbsRankChange} over ${m.drift.compared} subjects${m.drift.added.length ? `; new on file: ${m.drift.added.join(", ")}` : ""}${m.drift.biggest.filter(x => x.delta).length ? `; biggest moves: ${m.drift.biggest.filter(x => x.delta).map(x => `${x.name} ${x.from}→${x.to}`).join(", ")}` : ""}`);
  lines.push("");
  lines.push("## The search", "");
  lines.push(`Every calibration one bounded step away (≤${L.STEP} per weight, weights renormalised, reality index ±${L.STEP}; harm gates never auto-tuned) was scored: ${p.evaluated} feasible single steps, plus one compatible second step. Hard rules: no moral rule that holds today may break, the decent persona stays at or above p${L.PERSONA_FLOOR}, no subject moves more than ${L.MAX_SUBJECT_MOVE} points. Soft objective = ρ vs YouGov liking + 0.5 × tier evenness − ${L.CHURN_WEIGHT} × mean rank churn (+0.05 per repaired rule). A change is proposed only if it gains ≥ ${L.MARGIN}. With 36 YouGov-rated figures, differences under ~0.1 in ρ are within noise, so the threshold is deliberately conservative.`, "");
  lines.push(`Current soft objective: ${p.base.soft}.`);
  if (b) {
    lines.push(`Best candidate: **${b.change}** → ${b.f.soft} (gain ${p.gain}); ρ ${fmtRho(b.f.m.rho.yougovLikedShare)}, tier spread ${b.f.m.tierEvenness}, largest single move ${b.f.maxMove} points.`);
    if (movers.length) lines.push("", "Who would move:", "", ...movers.map(x => `- ${x.name}: ${x.from} → ${x.to} (${x.d > 0 ? "+" : ""}${x.d})`));
  }
  lines.push("");
  lines.push("## What the appeals taught it", "");
  if (!learned) lines.push("Production appeal data could not be read this run.");
  else {
    lines.push(`Real (non-simulated) interviews read: ${learned.interviews}. Appeal rulings: ${learned.totalAppealRulings} across ${learned.appealEntries} appeals.`, "");
    if (!learned.sufficient.appeals) lines.push(`Insufficient appeals to learn from (n=${learned.totalAppealRulings}; needs ≥${L.APPEAL_MIN_N} on one section). The Department will wait. It is good at waiting.`, "");
    lines.push("| Section | Appeal rulings | Upheld | Mean movement | Interviews | Mean evidence | Left unassessed |", "|---|---|---|---|---|---|---|");
    for (const a of learned.appealRows) {
      const c = learned.confRows.find(x => x.dim === a.dim);
      lines.push(`| ${a.dim} | ${a.n} | ${a.upheldRate == null ? "—" : pct(a.upheldRate)} | ${a.meanMovement ?? "—"} | ${c.n} | ${c.meanConfidence ?? "—"} | ${c.unassessedRate == null ? "—" : pct(c.unassessedRate)} |`);
    }
    lines.push("");
    if (learned.proposals.length) lines.push("Text proposals (never auto-applied):", "", ...learned.proposals.map(x => `- ${x}`));
    else lines.push(learned.sufficient.confidence ? "No section crosses the thresholds (appeals upheld > 60% with n ≥ 10, or unassessed in ≥ 50% of ≥ 10 interviews)." : `Too few real interviews to judge which questions land (needs ≥${L.CONF_MIN_N}).`);
  }
  lines.push("");
  return lines.join("\n");
}

// ---- PROPOSE mode ----------------------------------------------------------------------
async function proposeMode() {
  const cal = readJSON(CAL_PATH);
  const bench = readJSON(P("docs/methodology/benchmarks.json"), {}).figures || {};
  let referrals = [], learned = null, prodInfo = { cases: 0, referrals: 0 };
  try {
    referrals = productionReferrals();
    const { keys, cases } = productionCases();
    prodInfo = { cases: keys, referrals: referrals.length };
    const { DIMENSIONS } = await import("../netlify/lib/questionPools.js");
    learned = L.learn(cases, DIMENSIONS);
    log(`production read: ${keys} case files, ${referrals.length} referral cards`);
  } catch (e) { log("production read FAILED:", String(e.stderr || e.message).slice(0, 300)); }
  const { all } = await roster(referrals);
  const last = readJSON(path.join(DIR, "last-run.json"), null);
  const p = L.propose(cal, all, bench);
  // drift vs the previous run is reported on the base measurement
  if (last?.rows) p.base.m.drift = L.measure(cal, all, bench, { rows: last.rows }).drift;
  log(`decision: ${p.decision} — ${p.reason}`);
  const md = reportMd({ cal, p, learned, prodInfo });
  write(path.join(DIR, `${today}.md`), md);
  const proposal = p.worth ? { ...p.best.cal, version: cal.version + 1, date: today, proposedFrom: cal.version, change: p.best.change } : null;
  write(path.join(DIR, `proposal-${today}.json`), JSON.stringify({ date: today, decision: p.decision, reason: p.reason, gain: p.gain, change: p.best?.change || null, calibration: proposal }, null, 2));
  write(path.join(DIR, "last-run.json"), JSON.stringify({ date: today, rows: p.base.m.rows.map(r => ({ name: r.name, score: r.score })) }));
  const state = readJSON(STATE, { proposals: {} });
  // a newer proposal supersedes any unanswered older one
  for (const [d, s] of Object.entries(state.proposals)) if (s.status === "open" && d !== today) s.status = "superseded";
  state.proposals[today] = { status: p.worth ? "open" : "no-change", change: p.best?.change || null, gain: p.gain };
  write(STATE, JSON.stringify(state, null, 2));

  const m = p.base.m;
  const summary = `ρ vs YouGov liking ${fmtRho(m.rho.yougovLikedShare)}, tier spread ${m.tierEvenness}, moral rules ${Object.values(m.invariants).filter(Boolean).length}/${Object.keys(m.invariants).length}${m.saintsLow.length ? ` (below median: ${m.saintsLow.join(", ")})` : ""}.`;
  const appealsLine = learned ? (learned.sufficient.appeals ? `${learned.totalAppealRulings} appeal rulings read.` : `Appeals: too few to learn from yet (n=${learned.totalAppealRulings}).`) : "Appeals: production unreadable this run.";
  const bullet = p.worth ? [
    `- Calibration proposal ${today}: ${p.best.change}?`,
    `  The weekly self-review found a bounded change that improves the fit (soft objective +${p.gain}; threshold ${L.MARGIN}). Largest single score move ${p.best.f.maxMove} points; no moral rule breaks. ${summary} Details: docs/calibration/${today}.md. Apply rescores every figure by formula, runs every check, and ships only if all pass.`,
    `  Options: Apply, Reject`,
  ].join("\n") : null;
  const section = [
    `- **Weekly self-review ${today}: ${p.decision}.** ${p.reason}`,
    `  ${summary} ${appealsLine} Report: docs/calibration/${today}.md`,
    ...(learned?.proposals?.length ? [`  Text proposals: ${learned.proposals.join(" ")}`] : []),
  ].join("\n");
  upsertReport({ bullet, section });
  refreshDesk();
  return p;
}

// ---- APPLY mode ------------------------------------------------------------------------
function waitDeploy(commit) {
  for (let i = 0; i < 60; i++) {
    try {
      const d = JSON.parse(run("netlify", ["api", "listSiteDeploys", "--data", JSON.stringify({ site_id: SITE, per_page: 3 })]))
        .find(x => (x.commit_ref || "").startsWith(commit.slice(0, 7)));
      if (d && (d.state === "ready" || d.state === "error")) return d.state;
    } catch { /* retry */ }
    execFileSync("sleep", ["10"]);
  }
  return "timeout";
}
function runChecks() {
  const fails = [];
  for (const f of fs.readdirSync(P("scripts")).filter(f => /^check-.*\.mjs$/.test(f)).sort()) {
    try { run(process.execPath, [P("scripts", f)]); } catch (e) { fails.push(`${f}: ${String(e.stderr || e.stdout || e.message).split("\n").find(Boolean) || "failed"}`); }
  }
  try { run("npm", ["run", "build"]); } catch (e) { fails.push(`build: ${String(e.stderr || e.message).slice(0, 200)}`); }
  return fails;
}

async function checkAnswersMode() {
  const state = readJSON(STATE, { proposals: {} });
  const date = L.pickOpen(state);
  if (!date) { log("no open proposal"); return; }
  const md = fs.existsSync(P("DESK_ANSWERS.md")) ? fs.readFileSync(P("DESK_ANSWERS.md"), "utf8") : "";
  const answer = L.findAnswer(md, date);
  log(`open proposal ${date}: answer = ${answer || "none yet"}`);
  if (!answer) return;
  if (DRY) { log(`[dry-run] would ${answer} proposal ${date}`); return; }
  const handled = status => { state.proposals[date] = { ...state.proposals[date], status, handledAt: new Date().toISOString() }; write(STATE, JSON.stringify(state, null, 2)); };
  if (answer === "reject") {
    handled("rejected");
    upsertReport({ bullet: null, section: `- **Calibration proposal ${date}: rejected.** Archived; the scale is unchanged.` });
    refreshDesk();
    return;
  }
  // APPLY
  const prop = readJSON(path.join(DIR, `proposal-${date}.json`));
  if (!prop?.calibration) { handled("failed"); log("proposal file missing its calibration"); return; }
  handled("applying");   // marked before touching anything, so a crash can never re-apply
  const before = fs.readFileSync(CAL_PATH, "utf8"), beforeFig = fs.readFileSync(P("src/figures.js"), "utf8");
  const next = { ...prop.calibration };
  delete next.proposedFrom; delete next.change;
  fs.writeFileSync(CAL_PATH, JSON.stringify(next, null, 2) + "\n");
  const { FAMOUS_FIGURES } = await import(`../src/figures.js?${Date.now()}`);
  const { src, changed } = L.rescoreFiguresSource(beforeFig, next, FAMOUS_FIGURES);
  fs.writeFileSync(P("src/figures.js"), src);
  log(`calibration v${next.version} written; ${changed} figure lines rescored`);
  const fails = runChecks();
  if (fails.length) {
    fs.writeFileSync(CAL_PATH, before); fs.writeFileSync(P("src/figures.js"), beforeFig);
    handled("failed");
    upsertReport({ bullet: null, section: `- **Calibration proposal ${date}: APPLY FAILED, nothing shipped.** The checks refused it: ${fails.join("; ")}. The scale is unchanged. The Department is disappointed in itself, briefly.` });
    refreshDesk();
    log("apply failed:", fails.join(" | "));
    return;
  }
  // production referral cards: formula-only rescore
  let cards = 0;
  try {
    const refs = productionReferrals();
    const index = blobGet("hvi-figures", "index");
    for (const { key, card } of refs) {
      const s = L.scoreWith(next, card.breakdown), q = L.cubeWith(next, card.breakdown);
      const upd = { score: s, tier: L.tierWith(next, s), warmth: q.warmth, competence: q.competence, quadrant: q.quadrant };
      blobSet("hvi-figures", key, { ...card, ...upd });
      if (index?.cards) index.cards = index.cards.map(c => (c.slug === card.slug ? { ...c, ...upd } : c));
      cards++;
    }
    if (index?.cards) blobSet("hvi-figures", "index", index);
  } catch (e) { log("referral rescore failed (site ships anyway; rerun apply by hand):", String(e.stderr || e.message).slice(0, 200)); }
  run("git", ["add", "netlify/lib/calibration.json", "src/figures.js", "dist", "docs/calibration"]);
  run("git", ["commit", "-m", `Calibration v${next.version}: ${prop.change}\n\nApproved on the desk (proposal ${date}). Formula-only rescore of the roster; all checks passed.\n\nClaude-Session: https://claude.ai/code/session_017TJjVfyVhZuguVscARLr1E`]);
  run("git", ["push", "-q", "origin", "HEAD"]);
  const commit = run("git", ["rev-parse", "HEAD"]).trim();
  const deploy = waitDeploy(commit);
  handled(deploy === "ready" ? "applied" : `applied-deploy-${deploy}`);
  write(path.join(DIR, `${date}-applied.md`), `# Calibration ${date} — applied\n\nChange: ${prop.change}\nCalibration version: ${next.version}\nFigures rescored: ${changed}; referral cards rescored: ${cards}\nCommit: ${commit}\nDeploy: ${deploy}\n\n"Correction applied. The Department is now slightly less wrong. It will not mention this again."\n`);
  upsertReport({ bullet: null, section: `- **Calibration proposal ${date}: applied.** ${prop.change}. Commit ${commit.slice(0, 7)}, deploy ${deploy}.` });
  refreshDesk();
  log(`applied ${date}: commit ${commit.slice(0, 7)}, deploy ${deploy}`);
}

const mode = process.argv.includes("--check-answers") ? checkAnswersMode : proposeMode;
log(`calibrate ${mode === proposeMode ? "propose" : "check-answers"}${DRY ? " (dry run)" : ""}`);
await mode().catch(e => { log("FATAL", e.stack || e); process.exitCode = 1; });
