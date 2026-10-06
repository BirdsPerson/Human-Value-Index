// Self-check for the score-change log (src/movement.js) and the tier ladder (method v4).
// Run: node scripts/check-movement.mjs
//
// A Department change (method / record / review) is shown on a file but is never a visit,
// never capped, never an appeal. Every file's log is ordered with known causes. Every
// figure carries its baseline plus the v3.1 method entry; the 23 whose label changed under
// the nine-rung ladder carry a v4 entry too, and the log ends at the label on file. The
// ladder: cal.tiers IS cal.ladder.rungs, strictly decreasing, the anchors kept, the decent
// ordinary persona reads PROVISIONAL CITIZEN or better, and ESSENTIAL stays a small club of
// the reference roster (1.5-12%). The share bands themselves are checked on the live-like
// fixture by scripts/check-scale.mjs.
import assert from "node:assert/strict";
import fs from "node:fs";
import * as M from "../src/movement.js";
import * as L from "./calibration-lib.mjs";
import { FAMOUS_FIGURES, getTier, TIERS } from "../src/figures.js";

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

// ---- every figure: baseline + the v3.1 method entry; the label on file is the ladder's ----------
assert.equal(FAMOUS_FIGURES.length, 62);
let relabelled = 0;
for (const f of FAMOUS_FIGURES) {
  const h = f.scoreHistory;
  assert.ok(Array.isArray(h) && h.length >= 2, `${f.name}: has a score log`);
  assert.equal(M.historyError(h), null, `${f.name}: ${M.historyError(h)}`);
  assert.equal(h[0].cause, "baseline", `${f.name}: starts at its baseline`);
  assert.ok(h.some(e => e.cause === "method" && e.method === "v3.1"), `${f.name}: carries the v3.1 method entry`);
  assert.equal(h.at(-1).score, f.score, `${f.name}: the log ends at the score on file`);
  assert.equal(h.at(-1).tier, f.tier, `${f.name}: and the tier`);
  assert.equal(f.tier, getTier(f.score).label, `${f.name}: the label on file is what the ladder gives its score`);
  const v4 = h.find(e => e.method === "v4");
  if (v4) { relabelled++; assert.equal(v4.cause, "method"); assert.equal(v4.score, h[h.indexOf(v4) - 1].score, `${f.name}: the v4 relabel moved no score`); }
}
assert.ok(relabelled >= 20 && relabelled <= 30, `the nine-rung ladder relabelled about a third of the figures on file (${relabelled})`);

// ---- the ladder: fixed cuts, anchors, order -----------------------------------------------------
assert.equal(cal.method, "v4");
assert.equal(cal.ladder.version, 2);
assert.deepEqual(cal.tiers, L.ladderTiers(cal), "cal.tiers is the ladder's rungs (every reader loops over it)");
assert.equal(cal.tiers.length, 9);
for (let i = 1; i < cal.tiers.length; i++) assert.ok(cal.tiers[i].min < cal.tiers[i - 1].min, "cutoffs strictly decrease");
assert.equal(cal.tiers.at(-1).min, 0);
assert.ok(cal.tiers.at(-2).min > cal.harmGate.cap, "a gated file (<= the cap) is always the bottom rung");
for (const [label, min] of L.TIER_ANCHORS) assert.equal(cal.tiers.find(t => t.label === label)?.min, min, `${label} anchored at ${min}`);
for (const r of cal.ladder.rungs) assert.ok(Array.isArray(r.band) && r.band.length === 2 && r.band[0] >= 0 && r.band[1] <= 1 && r.band[0] < r.band[1], `${r.label}: a guidance band`);
assert.deepEqual(cal.ladder.legacy.rungs.map(r => r.min), [787, 736, 600, 450, 300, 0], "the legacy ladder is method v3.3's, for the city's published days");
assert.deepEqual(TIERS.map(t => t.label), cal.tiers.map(t => t.label));
assert.equal(L.tierWith(cal, L.scoreWith(cal, L.PERSONAS["Decent ordinary"])), "PROVISIONAL CITIZEN", "decent ordinary persona lands PROVISIONAL CITIZEN (the 600 anchor, v4 cuts)");
assert.ok(L.tierRank(L.tierWith(cal, L.scoreWith(cal, L.PERSONAS["Decent ordinary"])), cal) <= L.tierRank(L.ORDINARY_TIER, cal), "...and never below the ordinary anchor");
// the reference roster: ESSENTIAL stays a small club
const roster = JSON.parse(read("docs/calibration/roster.json"));
const ungated = L.rosterScores(cal, roster);
const essential = ungated.filter(s => L.tierWith(cal, s) === "ESSENTIAL INFRASTRUCTURE").length;
const share = essential / ungated.length;
assert.ok(share >= 0.015 && share <= 0.12, `ESSENTIAL is ${(share * 100).toFixed(1)}% of the reference roster (want 1.5-12%)`);
// the ladder's shares are measured, never chased: ladderShares reports inside/outside only
const shares = L.ladderShares(cal, roster);
assert.equal(shares.length, 9);
assert.ok(Math.abs(shares.reduce((a, r) => a + r.share, 0) - 1) < 1e-3, "shares sum to one over the ungated roster (4-decimal shares)");

console.log(`check-movement: ok (${FAMOUS_FIGURES.length} figure logs, ${relabelled} relabelled under v4; ESSENTIAL ${essential}/${ungated.length} = ${(share * 100).toFixed(1)}% of the reference roster)`);
