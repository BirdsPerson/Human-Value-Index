// Set (or clear) a case's ATHLETIC RECORD in production: the operator's tool, never a public API
// (src/leagues/record.js; netlify/lib/league-entries.js; docs/CITY_SPEC.md "Players' entries").
//
//   node scripts/set-athletic-record.mjs <caseId> --level <varsity|standout|college|none> \
//        [--sports basketball,soccer,baseball] [--track] [--dry-run]
//
// Writes `athleticRecord {level, played, track, by, at}` on the case under its etag (a concurrent
// interview is never overwritten), prints the ratings per sport before and after, then reads the
// file's leagues panel (/api/leagues), which re-rates a standing entry with the new record. PRO is not
// a level: the professionals are the named athletes on file. --level none clears the record.
import { store } from "./roster/prod.mjs";
import * as L from "../src/city/leagues.js";
import { inputsOf, ratingsOf } from "../netlify/lib/league-entries.js";
import { isCaseId } from "../netlify/lib/intake.js";

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const caseId = String(argv.find(a => /^HVI-/i.test(a)) || "").toUpperCase();
const DRY = argv.includes("--dry-run");
const level = String(opt("level") || "").toLowerCase();
const usage = "usage: set-athletic-record.mjs <caseId> --level <varsity|standout|college|none> [--sports basketball,soccer,baseball] [--track] [--dry-run]";
if (!isCaseId(caseId) || !level) { console.error(usage); process.exit(1); }
if (level === "pro") { console.error("PRO is not a level: the professionals are the named athletes on file."); process.exit(1); }
const sports = (opt("sports") || "").split(",").map(s => s.trim()).filter(Boolean);
const record = L.cleanRecord({ level, played: sports, track: argv.includes("--track") });
if (!record) { console.error(`not a record: level ${level}, sports ${sports.join(",") || "-"}\n${usage}`); process.exit(1); }
if (record.level === "none" && (sports.length || argv.includes("--track"))) { console.error("--level none takes no sports and no track"); process.exit(1); }

const cases = store("hvi-cases");
const cur = await cases.getWithMetadata(caseId, { type: "json" });
if (!cur?.data) { console.error(`no case ${caseId}`); process.exit(1); }
const before = inputsOf(cur.data);
if (!before) { console.error(`${caseId} has no assessment: the leagues rate assessed files only`); process.exit(1); }
const after = { ...before, record };
const row = (r) => L.ENTRY_SPORTS.map(sp => `${sp} ${r[sp]}`).join("  ");
console.log(`${caseId} (${L.entrantName(`citizen-${caseId.slice(-4).toLowerCase()}`)}): physical ${before.physical ?? "-"} competence ${before.competence ?? "-"} adaptability ${before.adaptability ?? "-"} interview athletics ${before.ath ? `yes (${before.named.join(",") || "no sport named"})` : "no"}`);
console.log(`record now:   ${JSON.stringify(before.record)}`);
console.log(`record new:   ${JSON.stringify(record)}`);
console.log(`file only:    ${row(Object.fromEntries(L.ENTRY_SPORTS.map(sp => [sp, L.fileRating(before, sp)])))}`);
console.log(`ratings now:  ${row(ratingsOf(before))}`);
console.log(`ratings new:  ${row(ratingsOf(after))}`);
if (DRY) { console.log("dry run: nothing written"); process.exit(0); }

const at = new Date().toISOString();
let written = false;
for (let i = 0; i < 6 && !written; i++) {
  const c = i === 0 ? cur : await cases.getWithMetadata(caseId, { type: "json" });
  if (!c?.data) { console.error(`${caseId} vanished`); process.exit(1); }
  const next = { ...c.data };
  if (record.level === "none") delete next.athleticRecord;
  else next.athleticRecord = { ...record, by: "operator", at };
  written = (await cases.setJSON(caseId, next, { onlyIfMatch: c.etag })).modified;
}
if (!written) { console.error("lost the write race six times; nothing written"); process.exit(1); }
console.log("written");
// The panel re-rates a standing entry (a changed record, like a new assessment).
const r = await fetch(`https://humanvalueindex.com/api/leagues?caseId=${encodeURIComponent(caseId)}`, { cache: "no-store" });
const d = await r.json().catch(() => ({}));
if (r.status === 401 || r.status === 403) { console.log(`panel: ${d.error || "secured file"} (the record is written; the panel reads only with the file's own session)`); process.exit(0); }
if (!r.ok) { console.error(`/api/leagues ${r.status}: ${d.error || "?"}`); process.exit(1); }
console.log(`panel: record ${JSON.stringify(d.record)}; preview ${row(d.preview || {})}; entry ${d.entry ? `${d.entry.sports.join(",")} ${JSON.stringify(d.entry.r)}` : "none"} (season ${d.season} draft)`);
