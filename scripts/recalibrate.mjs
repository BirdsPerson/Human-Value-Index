// A Department method change, applied by hand with Scott's say-so (the weekly loop's
// approved proposals go through calibrate.mjs --check-answers instead, which uses the same
// method-apply code).
//
//   node scripts/recalibrate.mjs docs/calibration/method-v3.1.json [--dry-run]
//
// The spec file holds the new parameters ({realityIndex?, competenceAxis?, warmthAxis?}),
// the method label and the note shown on every file. Tier cutoffs are re-derived from the
// roster (calibration-lib tierCutoffs) under the new weights. Then: calibration.json,
// src/figures.js (scoreHistory, cause "method"), production figure cards + index, citizen
// files (a recalibration entry: not a visit) + pen cards.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "./calibration-lib.mjs";
import { applyToCards, applyToCitizens } from "./method-apply.mjs";
import { store } from "./roster/prod.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = (...p) => path.join(ROOT, ...p);
const DRY = process.argv.includes("--dry-run");
const specPath = process.argv.slice(2).find(a => !a.startsWith("--"));
if (!specPath) { console.error("usage: recalibrate.mjs <spec.json> [--dry-run]"); process.exit(1); }
const spec = JSON.parse(fs.readFileSync(path.resolve(specPath), "utf8"));
const prev = JSON.parse(fs.readFileSync(P("netlify/lib/calibration.json"), "utf8"));
const at = new Date().toISOString();

const { FAMOUS_FIGURES } = await import("../src/figures.js");
const figs = store("hvi-figures");
const { blobs } = await figs.list();
const cards = [];
for (const { key } of blobs) {
  if (key === "index") continue;
  const c = await figs.get(key, { type: "json" });
  if (c && !c.removed && c.breakdown) cards.push(c);
}
const roster = [...FAMOUS_FIGURES, ...cards.filter(c => !FAMOUS_FIGURES.some(f => f.name === c.name))];

let next = { ...prev };
for (const k of ["realityIndex", "competenceAxis", "warmthAxis"]) if (spec[k] != null) next[k] = spec[k];
if (spec.severity) next.severity = { ...prev.severity, ...spec.severity };
if (!spec.keepTiers) next = L.withTiers(next, L.tierCutoffs(next, roster)); // keepTiers: a severity-only change leaves the ungated cutoffs alone
next.version = prev.version + 1;
next.date = at.slice(0, 10);
next.method = spec.method;
const log = { at, cause: "method", note: spec.note, method: spec.method, fromMethod: prev.method || `v${prev.rubric}`, always: spec.always ?? true };

// report
const before = new Map(roster.map(f => [f.name, L.scoreWith(prev, f.breakdown, f.harm?.severity, f.harmReview)]));
const after = roster.map(f => ({ name: f.name, from: before.get(f.name), to: L.scoreWith(next, f.breakdown, f.harm?.severity, f.harmReview) }));
after.forEach(r => { r.tier = L.tierWith(next, r.to); });
const sorted = [...after].sort((a, b) => b.to - a.to);
console.log(`cutoffs: ${next.tiers.map(t => `${t.label} ≥${t.min}`).join(" | ")}`);
console.log(`roster ${roster.length} (ungated ${L.rosterScores(next, roster).length})`);
console.log(`ESSENTIAL (${sorted.filter(r => r.tier === "ESSENTIAL INFRASTRUCTURE").length}): ${sorted.filter(r => r.tier === "ESSENTIAL INFRASTRUCTURE").map(r => `${r.name} ${r.to}`).join(", ")}`);
console.log("top 15:", sorted.slice(0, 15).map(r => `${r.name} ${r.from}→${r.to}`).join(" | "));
const g = (a, b) => (after.find(r => r.name === a)?.to ?? NaN) - (after.find(r => r.name === b)?.to ?? NaN);
console.log(`gaps: Tubman–Einstein ${g("Harriet Tubman", "Albert Einstein")}, Tubman–Turing ${g("Harriet Tubman", "Alan Turing")}`);
const movers = [...after].map(r => ({ ...r, d: r.to - r.from })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 10);
console.log("biggest movers:", movers.map(r => `${r.name} ${r.d > 0 ? "+" : ""}${r.d}`).join(", "));
const tierChanges = after.filter(r => L.tierWith(prev, r.from) !== r.tier);
console.log(`tier changes: ${tierChanges.length}`, tierChanges.map(r => r.name).join(", "));
console.log("gated:", sorted.filter(r => r.to < 300).reverse().map(r => `${r.name} ${r.from}→${r.to}`).join(" | "));

if (DRY) { console.log("[dry-run] nothing written"); process.exit(0); }

const src = fs.readFileSync(P("src/figures.js"), "utf8");
const r = L.rescoreFiguresSource(src, next, FAMOUS_FIGURES, log);
fs.writeFileSync(P("src/figures.js"), r.src);
fs.writeFileSync(P("netlify/lib/calibration.json"), JSON.stringify(next, null, 2) + "\n");
if (!spec.keepTiers) fs.writeFileSync(P("docs/calibration/roster.json"), JSON.stringify(L.rosterSnapshot(roster)) + "\n");
console.log(`figures.js: ${r.changed} lines rewritten`);
const cardRows = await applyToCards(prev, next, log);
console.log(`production cards: ${cardRows.length} updated`);
const citizens = await applyToCitizens(prev, next, log);
console.log(`citizens: ${citizens.length} recalibrated: ${citizens.map(c => `${c.caseId} ${c.from}→${c.to} (${c.tier})`).join(", ")}`);
fs.writeFileSync(P(`docs/calibration/method-${spec.method}-applied.json`), JSON.stringify({ at, method: spec.method, note: spec.note, cutoffs: next.tiers, top: sorted.slice(0, 20), movers, citizens, cards: cardRows.length }, null, 2));
