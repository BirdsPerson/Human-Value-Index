// Self-check for the roster engine's pure parts (no network, no spending):
// QID dedupe, strata balance, the budget guards, resumable state, and the grid slicer
// (Python, on a synthetic 4x4 sheet).  node scripts/check-roster.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { freshRows, planSlots, MIX, eraOf } from "./roster/candidates.mjs";
import { fitDollars, estimateRunDollars, planCredits, loadState, saveState, GRID_CREDITS, SINGLE_CREDITS } from "./roster-grow.mjs";
import { estimateDollars, actualDollars } from "./roster/batch.mjs";

// dedupe by Wikidata id: on-file ids and repeats within a batch are dropped; namesakes stay
const taken = new Set(["Q937"]);
const rows = [{ qid: "Q937", label: "Albert Einstein" }, { qid: "Q1", label: "A" }, { qid: "Q1", label: "A again" }, { qid: "Q2", label: "Albert Einstein" }, { label: "no id" }];
assert.deepEqual(freshRows(rows, taken).map(r => r.qid), ["Q1", "Q2"]);

// strata balance: slots sum to n, and every pool gets its share within one
for (const n of [1, 5, 16, 48, 100]) {
  const s = planSlots(n);
  assert.equal(Object.values(s).reduce((a, b) => a + b, 0), n, `slots sum for ${n}`);
  for (const [k, p] of MIX) assert.ok(Math.abs(s[k] - n * p) < 1, `${k} share for ${n}`);
}
assert.equal(eraOf(1850, false), "c19");
assert.equal(eraOf(1950, true), "living");
assert.equal(eraOf(-400, false), "ancient");

// budget guard: dollars
const person = i => ({ title: `Person ${i}`, living: false, died: "1900", description: "x".repeat(80), extract: "y".repeat(1500) });
const cohort = Array.from({ length: 48 }, (_, i) => person(i));
const est = estimateRunDollars(cohort);
assert.ok(est > 0);
assert.equal(fitDollars(cohort, est + 1).length, 48, "fits whole cohort under a roomy budget");
const half = fitDollars(cohort, est / 2);
assert.ok(half.length > 0 && half.length < 48, "trimmed under a tight budget");
assert.ok(estimateRunDollars(half) <= est / 2, "trimmed cohort is under budget");
assert.equal(fitDollars(cohort, 0).length, 0, "no budget, no one");
assert.ok(estimateDollars("claude-sonnet-5", 1e6, 0) > estimateDollars("claude-haiku-4-5-20251001", 1e6, 0));
assert.equal(actualDollars("claude-sonnet-5", [{ input_tokens: 1e6 }]), 1.0);

// budget guard: credits. Grids that don't fit refuse; redraws only within what's left.
assert.equal(planCredits(48, 0, GRID_CREDITS * 3 - 1), null, "3 grids over budget refused");
const p = planCredits(48, 10, GRID_CREDITS * 3 + SINGLE_CREDITS * 2);
assert.deepEqual(p, { grids: 3, redraws: 2 });
assert.deepEqual(planCredits(16, 0, 20), { grids: 1, redraws: 0 });

// resumable state
const dir = mkdtempSync(`${tmpdir()}/roster-check-`);
try {
  const path = `${dir}/state.json`;
  assert.deepEqual(loadState(path), { runs: [] });
  saveState({ runs: [{ id: "R1", stage: "scoring", scoreBatch: "msgbatch_x" }, { id: "R0", stage: "done" }] }, path);
  const s = loadState(path);
  assert.equal(s.runs.find(r => !["done", "failed"].includes(r.stage)).scoreBatch, "msgbatch_x", "an unfinished run resumes with its batch id");
} finally { rmSync(dir, { recursive: true, force: true }); }

// grid slicing on a synthetic sheet: 16 blobs on magenta, gutters slightly off-centre
const py = `
import sys; sys.path.insert(0, "scripts/roster"); sys.path.insert(0, "scripts")
from PIL import Image, ImageDraw
import grid
W, H = 800, 1200
img = Image.new("RGB", (W, H), (255, 0, 255)); d = ImageDraw.Draw(img)
for r in range(4):
    for c in range(4):
        cx = int((c + 0.5) * W / 4) + (9 if c == 1 else 0); cy = int((r + 0.5) * H / 4) - (11 if r == 2 else 0)
        d.rectangle([cx - 50, cy - 110, cx + 50, cy + 110], fill=(40, 90, 200))
boxes, mask = grid.slice_grid(img)
assert len(boxes) == 16
assert all(grid.validate_cell(mask, b) is None for b in boxes), [grid.validate_cell(mask, b) for b in boxes]
# a figure straddling a gutter is caught
d.rectangle([W // 2 - 80, 20, W // 2 + 80, 250], fill=(40, 90, 200))
boxes, mask = grid.slice_grid(img)
assert any(grid.validate_cell(mask, b) for b in boxes[:4])
# an empty cell is caught
img2 = Image.new("RGB", (W, H), (255, 0, 255))
boxes, mask = grid.slice_grid(img2)
assert grid.validate_cell(mask, boxes[0]).startswith("no figure")
print("grid ok")
`;
assert.match(execFileSync("/opt/homebrew/bin/python3", ["-c", py], { encoding: "utf8" }), /grid ok/);

console.log("check-roster: ok");
