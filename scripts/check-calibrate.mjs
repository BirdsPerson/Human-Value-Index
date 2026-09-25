// Self-check for the calibration loop (scripts/calibration-lib.mjs). Stubbed data only.
import assert from "node:assert/strict";
import CAL from "../netlify/lib/calibration.json" with { type: "json" };
import { FAMOUS_FIGURES } from "../src/figures.js";
import { computeScore, cube, getTier } from "../netlify/lib/intake.js";
import * as L from "./calibration-lib.mjs";

// 1. The explicit-calibration scorer is the live scorer.
for (const f of FAMOUS_FIGURES) {
  assert.equal(L.scoreWith(CAL, f.breakdown), computeScore(f.breakdown), `score drift: ${f.name}`);
  const q = cube(f.breakdown), w = L.cubeWith(CAL, f.breakdown);
  assert.deepEqual([w.warmth, w.competence, w.quadrant], [q.warmth, q.competence, q.quadrant], `cube drift: ${f.name}`);
  assert.equal(L.tierWith(CAL, f.score), getTier(f.score), `tier drift: ${f.name}`);
  assert.equal(f.score, L.scoreWith(CAL, f.breakdown), `stored score differs from calibration: ${f.name}`);
}

// 2. Step bounds: every neighbour is at most one STEP from the calibration, axes still sum to 1.
const sum = o => Object.values(o).reduce((s, x) => s + x, 0);
for (const n of L.neighbours(CAL)) {
  assert.ok(Math.abs(n.cal.realityIndex - CAL.realityIndex) <= L.STEP + 1e-9, "reality index step too large");
  for (const ax of ["warmthAxis", "competenceAxis"]) {
    assert.ok(Math.abs(sum(n.cal[ax]) - 1) < 1e-9, `${ax} no longer sums to 1`);
    for (const d of Object.keys(CAL[ax])) assert.ok(Math.abs(n.cal[ax][d] - CAL[ax][d]) <= L.STEP + 1e-9, `${ax}.${d} step too large`);
  }
  assert.deepEqual(n.cal.harmGate, CAL.harmGate, "harm gates are never auto-tuned");
}
// ...and the full proposal (two steps on different parameters) never moves one parameter twice.
const bench = {};
const p = L.propose(CAL, FAMOUS_FIGURES, bench);
if (p.best) {
  for (const ax of ["warmthAxis", "competenceAxis"]) for (const d of Object.keys(CAL[ax]))
    assert.ok(Math.abs(p.best.cal[ax][d] - CAL[ax][d]) <= L.STEP + 1e-9, `proposal moved ${ax}.${d} more than one step`);
  assert.ok(p.best.f.maxMove <= L.MAX_SUBJECT_MOVE, "a subject moved too far");
}

// 3. An invariant that holds today can never be broken by a candidate.
const stub = [
  { name: "Ordinary A", breakdown: { care: 60, alignment: 60, utility: 20, adaptability: 20, legacy: 20, network: 20, physical: 20, threat: 20, redundancy: 80 } },
  { name: "Ordinary B", breakdown: { care: 70, alignment: 70, utility: 60, adaptability: 60, legacy: 60, network: 60, physical: 60, threat: 10, redundancy: 40 } },
  { name: "Putin", breakdown: { care: 30, alignment: 10, utility: 90, adaptability: 90, legacy: 90, network: 90, physical: 70, threat: 80, redundancy: 5 } },
];
const baseM = L.measure(CAL, stub, {});
assert.equal(baseM.invariants.villainsBelowAll, false, "stub: the villain already outranks A under the real calibration");
const fixed = { ...CAL, realityIndex: 0.1 };   // extreme: warmth-dominated, villain drops below everyone
const fixedM = L.measure(fixed, stub, {});
assert.equal(fixedM.invariants.villainsBelowAll, true);
const breaking = L.fitness(CAL, stub, {}, { rows: fixedM.rows, byName: fixedM.byName, invariants: fixedM.invariants });
assert.equal(breaking.feasible, false, "a candidate that breaks a rule holding today must be rejected");
assert.ok(breaking.broken.includes("villainsBelowAll"));

// 4. Answers: nothing applies without one; reject and apply are read from the quoted answer.
assert.equal(L.findAnswer("", "2026-09-27"), null);
assert.equal(L.findAnswer("## From the desk\n\n**Something else entirely**\n\n> Apply\n", "2026-09-27"), null, "an answer to another item is not an answer");
const q = d => `## From the desk — ${d}\n\n**Calibration proposal ${d}: competence: 0.02 weight from utility to legacy?**\n\n`;
assert.equal(L.findAnswer(q("2026-09-27"), "2026-09-27"), null, "the question alone is not an answer");
assert.equal(L.findAnswer(q("2026-09-27") + "> **Apply** — answered on the desk.\n", "2026-09-27"), "apply");
assert.equal(L.findAnswer(q("2026-09-27") + "> **Reject**\n", "2026-09-27"), "reject");
assert.equal(L.findAnswer(q("2026-09-20") + "> **Apply**\n", "2026-09-27"), null, "an old proposal's answer does not apply a new one");

// 5. No double-apply: only an open proposal is ever picked.
assert.equal(L.pickOpen({ proposals: { "2026-09-20": { status: "applied" }, "2026-09-27": { status: "applying" } } }), null);
assert.equal(L.pickOpen({ proposals: { "2026-09-20": { status: "superseded" }, "2026-09-27": { status: "open" } } }), "2026-09-27");
assert.equal(L.pickOpen({ proposals: { "2026-09-27": { status: "no-change" } } }), null);

// 6. figures.js rewrite touches only the scored fields.
const line = `  { name: "Test Person", score: 1, tier: "X", warmth: 1, competence: 1, quadrant: "Y", born: null, breakdown: {care: 70}, verdict: "v" },`;
const out = L.rescoreFiguresSource(line, CAL, [{ name: "Test Person", breakdown: stub[1].breakdown }]);
assert.equal(out.changed, 1);
assert.match(out.src, /born: null, breakdown: \{care: 70\}, verdict: "v" \},$/);
assert.match(out.src, new RegExp(`score: ${L.scoreWith(CAL, stub[1].breakdown)}, tier: "`));

console.log("check-calibrate: ok");
