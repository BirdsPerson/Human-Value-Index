// The desk reader for CITIZEN PROPOSALS (docs/PROPOSALS.md). Reads the production docket
// (Blobs hvi-proposals) and writes what awaits the owner into MORNING_REPORT.md, then runs the
// collector so it reaches the desk (~/projects/CLAUDE.md, organize/collect_reports.py):
//
//   ## Proposals awaiting you    every open proposal, ranked by co-signs. REPLACED in place on
//                                every run (matched on the stable heading, never appended);
//                                removed when nothing is open.
//   ## Needs you                 one bullet, "Put citizen proposal ... to the Assembly?", when
//                                an open proposal has DESK_MIN_COSIGNS or more. Matched on the
//                                stable phrase "citizen proposal" and replaced; removed (with the
//                                heading, if it leaves it empty) when no proposal qualifies.
//
// Scheduled reader: scripts/hvi_nightly.sh runs it (through scripts/hvi_desk.sh) at the end of
// every nightly build run (launchd com.hvi.nightly, 02:00), before the collector's 03:30 gate.
//
//   node scripts/proposals-desk.mjs                       write the report, run the collector
//   node scripts/proposals-desk.mjs --dry-run             print the sections, write nothing
//   node scripts/proposals-desk.mjs --approve <id|P-0001> act on the desk answer "Approve top proposal"
//   node scripts/proposals-desk.mjs --approve-top         ... the top-ranked open proposal
//   node scripts/proposals-desk.mjs --decline-all ["reason"]   act on "Decline all this week"
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { DESK_MIN_COSIGNS, TYPES, filerLabel } from "../src/assembly/proposalRules.js";

export const SECTION = "## Proposals awaiting you";
export const MARK = "citizen proposal";
const SITE = "https://humanvalueindex.com/#docket";
const REPORT = `${homedir()}/projects/human-value-index/MORNING_REPORT.md`;
const LOG = `${homedir()}/Library/Logs/hvi-proposals-desk.log`;

const fmtDay = (ms) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const one = (s) => String(s || "").replace(/\s+/g, " ").trim();

// ---- pure: the sections ------------------------------------------------------------------------
// queue: ownerView(store).queue (open proposals, ranked). -> markdown text (no trailing newline) or "".
export function awaitingSection(queue, now = Date.now()) {
  if (!queue?.length) return "";
  const lines = [SECTION, "", `Citizen proposals on the HVI docket (${SITE}), ranked by co-signs. Each stays open ${7} days; none reaches the Assembly until approved. Review queue: open #docket with the owner file.`, ""];
  for (const p of queue.slice(0, 12)) {
    lines.push(`- **${p.no} ${TYPES[p.type]?.verb || p.type}: ${one(p.title)}** (${p.targetName}) · ${p.cosigns} co-sign${p.cosigns === 1 ? "" : "s"} · expires ${fmtDay(p.expiresAt)}`);
    lines.push(`  ${one(p.desc)} Filed ${fmtDay(p.at)} by ${filerLabel(p.tag)}. Id ${p.id}.`);
  }
  if (queue.length > 12) lines.push(`- ${queue.length - 12} more on the docket.`);
  return lines.join("\n");
}
// -> the Needs-you bullet (four indented lines) or "" when nothing has DESK_MIN_COSIGNS.
export function needsBullet(queue, min = DESK_MIN_COSIGNS) {
  const top = (queue || [])[0];
  if (!top || top.cosigns < min) return "";
  const hot = queue.filter(p => p.cosigns >= min).length;
  return [
    `- **Put ${MARK} ${top.no} "${one(top.title)}" to the Assembly?**`,
    `  ${top.cosigns} co-signs, the most on the HVI docket (${queue.length} open, ${hot} at ${min}+). ${TYPES[top.type]?.label || top.type} on ${top.targetName}: ${one(top.desc)} If nothing happens it expires unscheduled on ${fmtDay(top.expiresAt)} and the players' filings read as ignored. Agent: node scripts/proposals-desk.mjs --approve ${top.id} (or --decline-all).`,
    "  Options: Approve top proposal / Decline all this week",
    "  Recommend: Approve top proposal",
    "  Silence: wait",
  ].join("\n");
}

// Split a report into [head, [{heading, body}]] on "## " headings.
function sections(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const head = [], secs = [];
  for (const l of lines) {
    if (/^## /.test(l)) secs.push({ heading: l.trim(), body: [] });
    else if (secs.length) secs[secs.length - 1].body.push(l);
    else head.push(l);
  }
  return [head, secs];
}
const join = (head, secs) => {
  const out = [...head];
  for (const s of secs) { if (out.length && out[out.length - 1].trim() !== "") out.push(""); out.push(s.heading, ...s.body); }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s*$/, "\n");
};
// Remove every bullet (and its indented continuation lines) whose first line carries MARK.
function dropMarked(body) {
  const out = [];
  for (let i = 0; i < body.length; i++) {
    const l = body[i];
    if (/^[-*+]\s/.test(l) && l.toLowerCase().includes(MARK)) {
      while (i + 1 < body.length && /^\s+\S/.test(body[i + 1])) i++;
      continue;
    }
    out.push(l);
  }
  return out;
}
const hasBullets = (body) => body.some(l => /^([-*+]|\d+\.)\s/.test(l));
// Pure: md -> md with the awaiting section and the Needs-you bullet replaced (or removed).
export function updateReport(md, { section, bullet, title = null }) {
  let [head, secs] = sections(md || "");
  if (!head.some(l => l.trim()) && !secs.length && title) head = [title, ""];
  // the awaiting section: every copy (dedup) out, then one back in place of the first
  const at = secs.findIndex(s => s.heading.toLowerCase() === SECTION.toLowerCase());
  secs = secs.filter(s => s.heading.toLowerCase() !== SECTION.toLowerCase());
  if (section) {
    const [, [sec]] = sections(section);
    secs.splice(at >= 0 ? Math.min(at, secs.length) : secs.length, 0, sec);
  }
  // the Needs-you bullet
  for (const s of secs) if (/^## needs you/i.test(s.heading)) s.body = dropMarked(s.body);
  if (bullet) {
    let ny = secs.find(s => /^## needs you/i.test(s.heading));
    if (!ny) { ny = { heading: "## Needs you", body: [""] }; secs.unshift(ny); }
    const lastBullet = ny.body.map((l, i) => (/^\s*$/.test(l) ? -1 : i)).filter(i => i >= 0).pop();
    ny.body.splice(lastBullet == null ? ny.body.length : lastBullet + 1, 0, ...bullet.split("\n"));
    if (ny.body[0]?.trim() !== "") ny.body.unshift("");
  }
  // an empty Needs you is a phantom item: drop the heading
  secs = secs.filter(s => !/^## needs you/i.test(s.heading) || hasBullets(s.body) || s.body.some(l => l.trim()));
  return join(head, secs);
}

// ---- the live run -------------------------------------------------------------------------------
function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  try { mkdirSync(dirname(LOG), { recursive: true }); appendFileSync(LOG, line + "\n"); } catch { /* the console has it */ }
}
async function main() {
  const args = process.argv.slice(2);
  const { store } = await import("./roster/prod.mjs");
  const P = await import("../netlify/lib/proposals.js");
  const s = store(P.STORE);
  if (args[0] === "--approve" || args[0] === "--approve-top") {
    const v = await P.ownerView(s);
    const want = args[1];
    const row = args[0] === "--approve-top" ? v.queue[0] : v.queue.find(p => p.id === want || p.no === want);
    if (!row) { log(`approve: no open proposal ${want || "(top)"}`); process.exit(1); }
    const { readSession, STORE: ASM } = await import("../netlify/lib/assembly.js");
    const r = await P.review({ store: s, asmCloseAt: async () => (await readSession(store(ASM)))?.closeAt || null }, { action: "approve", pid: row.id });
    log(`approve ${row.no}: ${r.status} ${JSON.stringify(r.body)}`);
    process.exit(r.status === 200 ? 0 : 1);
  }
  if (args[0] === "--decline-all") {
    const n = await P.declineAll(s, args[1] || "THE OWNER HAS DECLINED THIS WEEK'S DOCKET. THE DOCKET WILL RECOVER. IT ALWAYS DOES.");
    log(`decline-all: ${n} declined`);
    process.exit(0);
  }
  const v = await P.ownerView(s);
  const section = awaitingSection(v.queue), bullet = needsBullet(v.queue);
  if (args.includes("--dry-run")) { console.log(section || "(no section)"); console.log(bullet || "(no Needs-you bullet)"); return; }
  const path = args.includes("--report") ? args[args.indexOf("--report") + 1] : REPORT;
  const before = existsSync(path) ? readFileSync(path, "utf8") : "";
  const title = `# Human Value Index — ${new Date().toISOString().slice(0, 10)}`;
  const after = updateReport(before, { section, bullet, title });
  if (after !== before) writeFileSync(path, after);
  log(`desk: ${v.queue.length} open, top ${v.queue[0] ? `${v.queue[0].no} (${v.queue[0].cosigns})` : "none"}, needs-you ${bullet ? "yes" : "no"}, report ${after !== before ? "updated" : "unchanged"}`);
  if (!args.includes("--no-collect")) {
    const py = ["/opt/homebrew/bin/python3", "/usr/local/bin/python3"].find(p => existsSync(p)) || "python3";
    const r = spawnSync(py, [`${homedir()}/projects/organize/collect_reports.py`], { encoding: "utf8", timeout: 120000 });
    log(`collector: exit ${r.status}${r.status ? ` ${(r.stderr || "").trim().split("\n").pop()}` : ""}`);
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(err => { log(`failed: ${err?.stack || err}`); process.exit(1); });
}
