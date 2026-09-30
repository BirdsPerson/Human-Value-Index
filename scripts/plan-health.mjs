// Is the plan builder keeping up? (netlify/lib/plans.js, docs/CITY_SPEC.md "Plans".) Run
// every 10 minutes by the referral-sprites launchd job (scripts/referral_sprites.py). The
// builder publishes each machine day ahead of time; tomorrow is never held back, so a
// manifest without tomorrow means the builder has not run for a machine day (24+ real
// minutes). The city then quietly falls back to building each day in every browser, and
// the social tick and quests to the local sim, so nothing looks broken: this is the alarm.
//
// Stalled: a "## City plans stalled" section goes into MORNING_REPORT.md (replaced in place,
// never appended) and the desk collector runs. Recovered: the section is removed, the
// collector runs again. Every run logs one line to ~/Library/Logs/hvi-plan-health.log.
//   node scripts/plan-health.mjs [--dry-run]
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { machineClock } from "../src/city/sim.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPORT = join(ROOT, "MORNING_REPORT.md");
const LOG = join(homedir(), "Library/Logs/hvi-plan-health.log");
const COLLECT = join(homedir(), "projects/organize/collect_reports.py");
const HEADING = "## City plans stalled";
const dry = process.argv.includes("--dry-run");
const log = (line) => { const l = `${new Date().toISOString()} ${line}`; console.log(l); if (!dry) try { appendFileSync(LOG, l + "\n"); } catch { /* the log is best-effort */ } };

// -> {ok, today, latest, note}
export async function health(fetchJson, nowMs = Date.now()) {
  const today = machineClock(nowMs).day;
  let m;
  try { m = await fetchJson("https://humanvalueindex.com/api/plan"); }
  catch (err) { return { ok: false, today, latest: null, note: `the manifest could not be read (${err.message})` }; }
  const latest = m?.latest ?? null;
  if (latest == null) return { ok: false, today, latest, note: "the manifest lists no days" };
  if (latest < today + 1) return { ok: false, today, latest, note: `the latest built machine day is ${latest}, today is ${today}: tomorrow is not built` };
  return { ok: true, today, latest, note: `built through day ${latest} (today ${today})` };
}

// The report with the section set to `body` (null removes it); everything else untouched.
export function withSection(text, body) {
  const lines = text.split("\n");
  const at = lines.findIndex(l => l.trim() === HEADING);
  let end = at;
  if (at >= 0) { end = at + 1; while (end < lines.length && !/^#{1,2} /.test(lines[end])) end++; }
  const block = body == null ? [] : [HEADING, ...body.split("\n"), ""];
  if (at >= 0) lines.splice(at, end - at, ...block);
  else if (block.length) lines.push("", ...block);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const fetchJson = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(20_000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
  const h = await health(fetchJson);
  const text = existsSync(REPORT) ? readFileSync(REPORT, "utf8") : "";
  const body = h.ok ? null : [
    `- The HVI plan builder is behind: ${h.note} (checked ${new Date().toISOString().slice(0, 16)}Z).`,
    "  The city still runs (browsers, quests and the social tick fall back to the local sim), but every phone",
    "  pays the day build again. Look at the plan-build-background function log on Netlify, and",
    "  https://humanvalueindex.com/api/plan. Clears itself once tomorrow is built.",
  ].join("\n");
  const next = withSection(text, body);
  log(`${h.ok ? "ok" : "STALLED"}: ${h.note}`);
  if (next !== text && !dry) {
    writeFileSync(REPORT, next);
    log(h.ok ? "recovered: section removed from MORNING_REPORT.md" : "stall written to MORNING_REPORT.md");
    if (existsSync(COLLECT)) spawnSync("/opt/homebrew/bin/python3", [COLLECT], { timeout: 120_000 });
  }
}
