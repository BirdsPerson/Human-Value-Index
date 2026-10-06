// THE MOVEMENT LOG beside every name in a list (src/ui/spark.js, src/ui/Sparkline.jsx).
// The census carries a file's last 8 scores as `hx` (deltas, zigzag varint, base64url): the
// encoding round-trips, the aria label reads plainly, one point is NEW, a flat run says
// unchanged, and the census row grows by about 12 bytes a figure at most.
// Run: node scripts/check-sparkline.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import * as S from "../src/ui/spark.js";
import { FAMOUS_FIGURES } from "../src/figures.js";
import { censusFigure, FILE_ONLY } from "../netlify/lib/refer.js";
import { rowOf } from "../netlify/lib/market.js";

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ---- round trip ---------------------------------------------------------------------------
const rt = (p) => assert.deepEqual(S.decodeSeries(S.encodeSeries(p), p[p.length - 1]), p.slice(-S.SPARK_MAX), `round trip ${p}`);
rt([789, 806]);
rt([0, 0, 34]);
rt([1000, 0, 1000, 999, 1, 512, 511, 16, 15, -3]);
rt([761, 782]);
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let n = 0; n < 500; n++) rt(Array.from({ length: 2 + Math.floor(rnd() * 12) }, () => Math.round(rnd() * 1000)));
assert.equal(S.encodeSeries([806]), "", "one point: nothing to encode");
assert.equal(S.encodeSeries([700, 712]), "Y", "a move under 16 is one character");
assert.equal(S.encodeSeries([789, 806]).length, 2, "a move of 17 is two");
assert.deepEqual(S.decodeSeries("", 806), [806]);
assert.deepEqual(S.decodeSeries("!!", 806), [806], "a bad string reads as no movement, never as a wrong one");
assert.equal(S.decodeSeries("Y", null), null);
assert.ok(/^[A-Za-z0-9_-]*$/.test(S.encodeSeries([5, 900, 3, 777])), "base64url: JSON- and URL-safe");

// ---- the log -> the series ----------------------------------------------------------------
const log = [{ at: null, score: 789, cause: "baseline" }, { at: "2026-09-28", score: 790, cause: "method" }, { at: "2026-09-29", score: 801, cause: "record", voided: true }, { at: "2026-09-30", score: 806, cause: "method" }];
assert.deepEqual(S.seriesOfLog(log, 806), [789, 790, 806], "voided entries are not movement");
assert.deepEqual(S.seriesOfLog(log, 810), [789, 790, 806, 810], "always ends at the score on file");
assert.deepEqual(S.seriesOfLog(null, 806), [806]);
assert.equal(S.hxOf({ score: 806 }), undefined, "no log: no hx (the key is left off: NEW)");
assert.equal(S.hxOf({ score: 806, scoreHistory: [{ score: 806 }] }), undefined, "a one-point log is NEW too");
assert.equal(S.seriesOfLog(Array.from({ length: 30 }, (_, i) => ({ score: i })), 29).length, S.SPARK_MAX, "the last 8 points only");

// ---- the aria label ---------------------------------------------------------------------------
assert.equal(S.sparkLabel([789, 795, 801, 806]), "score history: 789 to 806, up 17 over 3 revisions");
assert.equal(S.sparkLabel([789, 806]), "score history: 789 to 806, up 17 over 1 revision");
assert.equal(S.sparkLabel([700, 650]), "score history: 700 to 650, down 50 over 1 revision");
assert.equal(S.sparkLabel([627, 627, 627]), "score history: 627 to 627, unchanged over 2 revisions");
assert.equal(S.sparkLabel([806]), "score history: 806, new on file");
assert.equal(S.sparkLabel([]), "");
assert.deepEqual([S.sparkDir([1, 2]), S.sparkDir([2, 1]), S.sparkDir([3, 3]), S.sparkDir([3])], [1, -1, 0, 0]);

// ---- geometry: whole pixels inside the box; flat and new are level ------------------------------
for (const p of [[789, 806], [0, 1000, 0], [627, 627, 627], [806], [1, 2, 3, 4, 5, 6, 7, 8]]) {
  const g = S.sparkGeom(p, 60, 14);
  for (const [x, y] of g.pts) assert.ok(Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x <= 58 && y >= 0 && y <= 13, `point in the box: ${p} -> ${x},${y}`);
  for (const b of g.bars) assert.ok(b.x >= 0 && b.x + b.w <= 60 && b.y >= 0 && b.y + b.h <= 14 && b.w >= 1, `bar in the box: ${p}`);
}
assert.equal(new Set(S.sparkGeom([627, 627, 627]).pts.map(q => q[1])).size, 1, "flat: one level");
assert.equal(new Set(S.sparkGeom([806]).pts.map(q => q[1])).size, 1, "new: a flat dash");
const up = S.sparkGeom([100, 900]).pts;
assert.ok(up[1][1] < up[0][1], "up goes up the box");

// ---- the census row: hx rides it, ~12 bytes a figure ----------------------------------------------
assert.ok(FILE_ONLY.includes("scoreHistory"), "the full log stays a file-only field");
let grew = 0, worst = 0, carried = 0;
for (const f of FAMOUS_FIGURES) {
  const card = { ...f, slug: f.name.toLowerCase().replace(/\W+/g, "-"), verdictStatus: "published" };
  const row = censusFigure(card);
  assert.equal(row.scoreHistory, undefined, `${f.name}: no full log in the census`);
  const series = S.seriesOfLog(f.scoreHistory, f.score);
  if (series.length > 1) { assert.equal(typeof row.hx, "string", `${f.name}: carries hx`); carried++; }
  assert.deepEqual(row.hx ? S.decodeSeries(row.hx, row.score) : [row.score], series, `${f.name}: decodes to its log`);
  const { hx: _hx, ...without } = row;
  const d = JSON.stringify(row).length - JSON.stringify(without).length;
  grew += d; worst = Math.max(worst, d);
}
const mean = grew / FAMOUS_FIGURES.length;
assert.ok(carried >= 50, `most figures on file have moved (${carried})`);
assert.ok(mean <= 12, `census growth ${mean.toFixed(1)} bytes a figure (<= 12)`);
assert.ok(worst <= 8 + 2 * (S.SPARK_MAX - 1), `worst row ${worst} bytes`);

// ---- the market board carries the score and the movement once a part names them ------------------
const I = { n: "Test", dead: 0, p: 10, o: 10, s: 1, cl: [], h: 0, npc: 0, pl: 0, a: null, w: { news: 0, npc: {}, pl: 0, ev: null, flow: 0 } };
const state = { inst: { t: { ...I, fs: [806, S.encodeSeries([789, 806])] }, u: { ...I } }, knobs: {}, events: [] };
const r = rowOf(state, "t");
assert.equal(r.score, 806);
assert.deepEqual(S.decodeSeries(r.hx, r.score), [789, 806]);
const r2 = rowOf(state, "u");
assert.ok(!("hx" in r2) && !("score" in r2), "no movement on file: no fields");
assert.match(read("src/market/activity.js"), /h\[key\] = \[s\.score, s\.hx \|\| hxOf\(s\) \|\| ""\]/, "the market terms name each human's score and movement");

// ---- every list of people draws it ---------------------------------------------------------------
for (const f of ["src/FigureIndex.jsx", "src/market/Market.jsx", "src/city/CityFind.jsx", "src/city/cityUi.jsx", "src/city/LeagueHub.jsx",
  "src/elections/Elections.jsx", "src/paper/Paper.jsx", "src/play/fish/Aquarium.jsx", "src/Pen.jsx", "src/Arrivals.jsx"]) {
  assert.ok(read(f).includes("<Sparkline"), `${f}: draws the movement log`);
}
const comp = read("src/ui/Sparkline.jsx");
assert.ok(!/<animate|animation:|transition:/.test(comp) && !/animation:|transition:/.test(read("src/ui/ui.css").split("THE MOVEMENT LOG")[1] || ""), "no animation");
assert.match(comp, /role="img" aria-label=\{label\}/);
assert.match(read("src/ui/ui.css"), /contain: strict/, "fixed box: never reflows the row");

console.log(`check-sparkline: OK (${carried}/${FAMOUS_FIGURES.length} figures moved; census +${mean.toFixed(1)} bytes a figure, worst ${worst})`);
