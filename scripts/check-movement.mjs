// Self-check for the score-change log (src/movement.js) and the roster-tuned tier cutoffs.
// Run: node scripts/check-movement.mjs
//
// A Department change (method / record / review) is shown on a file but is never a visit,
// never capped, never an appeal. Every file's log is ordered with known causes. Every
// figure carries its baseline plus the v3.1 method entry. The tier cutoffs are exactly the
// percentile targets over the roster they were cut from (docs/calibration/roster.json), and
// ESSENTIAL stays a small club: 3-12% of the ungated roster.
import assert from "node:assert/strict";
import fs from "node:fs";
import * as M from "../src/movement.js";
import * as L from "./calibration-lib.mjs";
import { FAMOUS_FIGURES } from "../src/figures.js";

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const cal = JSON.parse(read("netlify/lib/calibration.json"));

// ---- citizens: a recalibration is shown but is not a visit ------------------------------
const v1 = { at: "2026-09-01T00:00:00Z", score: 600, tier: "MONITORED CIVILIAN" };                    // pre-cause entry = visit
const ap = { at: "2026-09-02T00:00:00Z", score: 620, appeal: ["care"], cause: "appeal" };
const rc = { at: "2026-09-28T00:00:00Z", score: 612, kind: "recalibration", cause: "method", note: "RECALIBRATED", method: "v3.1", delta: -8 };
const v2 = { at: "2026-09-29T00:00:00Z", score: 650, cause: "visit" };
const hist = [v1, ap, rc, v2];
assert.equal(M.causeOf(v1), "visit");
assert.equal(M.causeOf({ kind: "recalibration" }), "method", "an old recalibration entry with no cause is still the Department's");
assert.equal(M.visitCount([v1, ap, rc]), 2, "a recalibration does not add a visit");
assert.equal(M.visitCount(hist), 3);
assert.equal(M.visitNumberOf(hist, v2), 3, "the visit after a recalibration is visit 3, not 4");
assert.equal(M.visitNumberOf(hist, rc), 2);
assert.ok(!M.isVisit(rc) && !M.isVisit({ cause: "vouch" }) && !M.isVisit({ cause: "record" }));
assert.ok(!("capped" in rc) && !rc.appeal, "a recalibration is neither capped nor an appeal");
const pub = M.publicHistory(hist);
assert.equal(pub.length, 4, "the recalibration is still shown");
assert.equal(pub[2].cause, "method");
const mv = M.movement(hist);
assert.deepEqual(mv.yours.map(r => r.cause), ["visit", "appeal", "visit"]);
assert.deepEqual(mv.department.map(r => [r.cause, r.delta]), [["method", -8]]);
// the functions count visits through movement.js, never history.length
for (const f of ["intake-session", "intake-score", "file", "case"]) {
  const src = read(`netlify/functions/${f}.js`);
  assert.ok(src.includes("visitCount("), `${f}: counts visits with visitCount`);
  assert.ok(!/visits?:\s*[\w.?]*history\.length/.test(src) && !/history\.length\s*\+\s*1/.test(src), `${f}: never counts history.length as visits`);
}

// ---- ordering and causes ------------------------------------------------------------------
assert.equal(M.historyError(hist), null);
assert.match(M.historyError([v2, v1]), /out of order/);
assert.match(M.historyError([{ ...v1, cause: "whim" }]), /unknown cause/);
assert.throws(() => M.figureEntry({ at: null, score: 1, tier: "x", cause: "whim" }));
for (const c of ["visit", "appeal", "vouch", "method", "record", "review"]) assert.ok(M.validCause(c), c);
const seeded = M.appendFigureHistory(null, { at: "2026-09-28", score: 700, tier: "T", cause: "method" }, { at: null, score: 690, tier: "T" });
assert.deepEqual(seeded.map(h => h.cause), ["baseline", "method"], "an empty log is seeded with its baseline");

// ---- every figure: baseline + the v3.1 method entry ---------------------------------------
assert.equal(FAMOUS_FIGURES.length, 62);
for (const f of FAMOUS_FIGURES) {
  const h = f.scoreHistory;
  assert.ok(Array.isArray(h) && h.length >= 2, `${f.name}: has a score log`);
  assert.equal(M.historyError(h), null, `${f.name}: ${M.historyError(h)}`);
  assert.equal(h[0].cause, "baseline", `${f.name}: starts at its baseline`);
  assert.ok(h.some(e => e.cause === "method" && e.method === "v3.1"), `${f.name}: carries the v3.1 method entry`);
  assert.equal(h.at(-1).score, f.score, `${f.name}: the log ends at the score on file`);
  assert.equal(h.at(-1).tier, f.tier, `${f.name}: and the tier`);
}

// ---- tier cutoffs == percentile targets over the roster -----------------------------------
const roster = JSON.parse(read("docs/calibration/roster.json"));
assert.deepEqual(cal.tierTargets, Object.fromEntries(L.TIER_TARGETS), "targets recorded in calibration.json");
assert.deepEqual(L.tierCutoffs(cal, roster), cal.tiers, "stored cutoffs are the percentile targets over the roster");
const ungated = L.rosterScores(cal, roster);
const essential = ungated.filter(s => L.tierWith(cal, s) === "ESSENTIAL INFRASTRUCTURE").length;
const share = essential / ungated.length;
assert.ok(share >= 0.03 && share <= 0.12, `ESSENTIAL is ${(share * 100).toFixed(1)}% of the roster (want 3-12%)`);
for (let i = 1; i < cal.tiers.length; i++) assert.ok(cal.tiers[i].min < cal.tiers[i - 1].min, "cutoffs strictly decrease");
// v3.2: the lower tiers are fixed anchors for ordinary people; only the top two follow the roster
assert.deepEqual(cal.tierAnchors, Object.fromEntries(L.TIER_ANCHORS), "anchors recorded in calibration.json");
for (const [label, min] of L.TIER_ANCHORS) assert.equal(cal.tiers.find(t => t.label === label).min, min, `${label} anchored at ${min}`);
assert.ok(cal.tiers.find(t => t.label === "RETAINED SPECIALIST").min >= L.RETAINED_FLOOR, "RETAINED never below its floor");
assert.equal(L.tierWith(cal, L.scoreWith(cal, L.PERSONAS["Decent ordinary"])), "TOLERATED GENERALIST", "decent ordinary persona lands TOLERATED");

console.log(`check-movement: ok (${FAMOUS_FIGURES.length} figure logs; ESSENTIAL ${essential}/${ungated.length} = ${(share * 100).toFixed(1)}%)`);
