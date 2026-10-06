// Aggregation math for the Public Figure Index analytics (src/analytics/aggregate.js).
import assert from "node:assert/strict";
import { FAMOUS_FIGURES, TIERS, getTier } from "../src/figures.js";
import {
  mergeRoster, tierCounts, histogram, tierMarkers, quadrantShare, categoryProfile,
  yearOf, eraOf, domainOf, groupAverages, coverage, topBottom, scatterPoints, DIMS,
} from "../src/analytics/aggregate.js";

// merge: static first, dedupe by name or slug, citizens and removed cards excluded
const pen = [
  { kind: "figure", name: "Albert Einstein", slug: "albert-einstein", score: 1 },          // dup by name
  { kind: "figure", name: "Dolly Parton", slug: "dolly-parton", score: 794, referred: true },
  { kind: "figure", name: "Dolly Parton", baseName: "Dolly Parton", slug: "dolly-parton", score: 700 }, // dup
  { kind: "figure", name: "Engine Person", slug: "engine-person", score: 600, engine: true },
  { kind: "citizen", name: "Subject 7AUZ", slug: "citizen-7auz", score: 660 },
  { kind: "figure", name: "Gone", slug: "gone", score: 500, removed: true },
  { kind: "figure", name: "No Score", slug: "no-score" },
];
const roster = mergeRoster(FAMOUS_FIGURES, pen);
assert.equal(roster.length, FAMOUS_FIGURES.length + 2);
assert.equal(roster.find(s => s.name === "Albert Einstein").source, "record");
assert.equal(roster.find(s => s.name === "Albert Einstein").score, FAMOUS_FIGURES.find(s => s.name === "Albert Einstein").score);
assert.equal(roster.find(s => s.name === "Dolly Parton").score, 794);
assert.equal(roster.find(s => s.name === "Engine Person").source, "engine");
assert.ok(!roster.some(s => s.kind === "citizen"));

// tiers: counts sum to n, follow getTier, and read cutoffs from TIERS
const tc = tierCounts(roster);
assert.equal(tc.reduce((a, t) => a + t.count, 0), roster.length);
assert.equal(tc.length, TIERS.length);
for (const t of tc) assert.equal(t.count, roster.filter(s => getTier(s.score).label === t.label).length);
assert.ok(Math.abs(tc.reduce((a, t) => a + t.pct, 0) - 1) < 1e-9);
assert.deepEqual(tierMarkers().map(m => m.min), TIERS.filter(t => t.min > 0).map(t => t.min));

// histogram: 20 buckets of 50, edges inclusive-low, 1000 lands in the last bucket
const h = histogram([{ score: 0 }, { score: 49 }, { score: 50 }, { score: 999 }, { score: 1000 }]);
assert.equal(h.length, 20);
assert.deepEqual([h[0].count, h[1].count, h[19].count], [2, 1, 2]);
assert.equal(histogram(roster).reduce((a, b) => a + b.count, 0), roster.length);

// quadrants: counts + UNPLACED sum to n
const qs = quadrantShare([{ quadrant: "ADMIRED" }, { quadrant: "ENVIED" }, { quadrant: "ADMIRED" }, {}]);
assert.equal(qs.find(r => r.label === "ADMIRED").count, 2);
assert.equal(qs.find(r => r.label === "UNPLACED").count, 1);
assert.equal(qs.reduce((a, r) => a + r.count, 0), 4);

// profile: mean over assessed only, n per dimension
const prof = categoryProfile([{ breakdown: { care: 10, threat: 90 } }, { breakdown: { care: 30, threat: null } }, {}]);
assert.equal(prof.length, DIMS.length);
assert.equal(prof.find(p => p.dim === "care").mean, 20);
assert.equal(prof.find(p => p.dim === "care").n, 2);
assert.equal(prof.find(p => p.dim === "threat").n, 1);
assert.equal(prof.find(p => p.dim === "legacy").mean, null);
assert.ok(prof.find(p => p.dim === "redundancy").lowerIsBetter);

// era + year parsing, BCE included
assert.equal(yearOf("-0069-01-01"), -69);
assert.equal(yearOf("1946-01-19"), 1946);
assert.equal(yearOf(null), null);
assert.equal(eraOf({ born: "-0069-01-01" }), "ANCIENT");
assert.equal(eraOf({ born: "1879-03-14" }), "BORN 1800–1899");
assert.equal(eraOf({ born: "1989-12-13" }), "BORN 1960+");
assert.equal(eraOf({}), null);

// domain: from the city's field reader
assert.equal(domainOf({ name: "Albert Einstein" }), "SCIENCE");
assert.equal(domainOf({ name: "Taylor Swift" }), "ARTS");
assert.equal(domainOf({ name: "X", qualifier: "boxer" }), "SPORT");

// group averages: n >= 3 only, held and unknown counted, sorted by mean
const ga = groupAverages([{ score: 100, g: "a" }, { score: 300, g: "a" }, { score: 200, g: "a" }, { score: 900, g: "b" }, { score: 1 }], s => s.g, 3);
assert.deepEqual(ga.rows, [{ label: "a", n: 3, mean: 200 }]);
assert.equal(ga.held, 1);
assert.equal(ga.unknown, 1);

// coverage sums
const cv = coverage([{ source: "record" }, { source: "referral" }, { source: "engine" }, { people: { likability: 70 } }]);
assert.equal(cv.record + cv.referral + cv.engine + cv.otherSource, cv.n);
assert.equal(cv.otherSource, 1);
assert.equal(cv.rated, 1);
assert.equal(cv.rated + cv.unrated, cv.n);

// top/bottom: sorted, k items, bottom is lowest first
const tb = topBottom(roster, 10);
assert.equal(tb.top.length, 10);
assert.ok(tb.top[0].score >= tb.top[9].score);
assert.ok(tb.bottom[0].score <= tb.bottom[9].score);
assert.equal(tb.top[0].score, Math.max(...roster.map(s => s.score)));

// scatter only takes subjects with both axes
assert.equal(scatterPoints([{ name: "a", warmth: 1, competence: 2 }, { name: "b", warmth: 1 }]).length, 1);

// the real roster: every static figure lands in some era and most in a domain
const staticDomains = FAMOUS_FIGURES.filter(f => domainOf(f)).length;
assert.ok(staticDomains >= FAMOUS_FIGURES.length - 3, `domains ${staticDomains}/${FAMOUS_FIGURES.length}`);
assert.ok(FAMOUS_FIGURES.every(f => eraOf(f) !== null), "every figure on record has a birth year");

console.log("ANALYTICS CHECKS PASS");

// ---- THE NUMBERS, method v4 (docs/design/SCALE.md §3) ----------------------------------------
const { dimHistograms, cubrantCounts, correlationMatrix, pearson, regionTierCrosstab, ladderShares } = await import("../src/analytics/aggregate.js");
const { CUBRANT_ORDER } = await import("../src/cube.js");
// nine small multiples: 20 bins of 5, counts sum to the assessed n, median inside the range
const dh = dimHistograms(FAMOUS_FIGURES, 5);
assert.equal(dh.length, DIMS.length);
for (const h of dh) {
  assert.equal(h.bins.length, 20);
  assert.equal(h.bins.reduce((a, b) => a + b.count, 0), h.n, h.dim);
  assert.ok(h.n === 0 || (h.median >= 0 && h.median <= 100), h.dim);
}
assert.equal(dimHistograms([{ breakdown: { care: 100 } }])[0].bins[19].count, 1, "100 lands in the last bin");
// cubrants: every placed file in exactly one cell; pending counted apart
const cc = cubrantCounts([...FAMOUS_FIGURES, { name: "P", warmth: 60, competence: 60, quadrant: "ADMIRED" }, {}]);
assert.deepEqual(cc.rows.map(r => r.label), CUBRANT_ORDER);
assert.equal(cc.rows.reduce((a, r) => a + r.count, 0) + cc.pending + cc.unplaced, cc.n);
assert.equal(cc.pending, 1); assert.equal(cc.unplaced, 1);
// correlations: 1 on the diagonal, symmetric, care-alignment strongly positive, care-threat negative
const cm = correlationMatrix(FAMOUS_FIGURES);
for (let i = 0; i < DIMS.length; i++) { assert.ok(Math.abs(cm.r[i][i] - 1) < 1e-9); for (let j = 0; j < DIMS.length; j++) assert.ok(Math.abs(cm.r[i][j] - cm.r[j][i]) < 1e-9); }
assert.ok(cm.r[0][1] > 0.8, "care and alignment move together");
assert.ok(cm.r[0][DIMS.indexOf("threat")] < -0.5, "care and threat move apart");
assert.equal(pearson([1, 2], [1, 2]), null, "fewer than three points is no correlation");
assert.ok(Math.abs(pearson([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-9);
// region × tier: rows sum to their n, columns to the totals, totals to n
const xt = regionTierCrosstab(FAMOUS_FIGURES);
assert.equal(xt.tiers.length, TIERS.length);
for (const r of xt.rows) assert.equal(r.counts.reduce((a, b) => a + b, 0), r.n, r.region);
assert.equal(xt.total.reduce((a, b) => a + b, 0), xt.n);
assert.equal(xt.rows.reduce((a, r) => a + r.n, 0), xt.n);
// ladder shares: ungated only, with the guidance band read from TIERS
const ls = ladderShares([...FAMOUS_FIGURES, { name: "gated", score: 12 }]);
assert.equal(ls.length, TIERS.length);
assert.ok(Math.abs(ls.reduce((a, r) => a + r.share, 0) - 1) < 1e-9);
assert.equal(ls.reduce((a, r) => a + r.count, 0), FAMOUS_FIGURES.filter(f => f.score >= 100).length, "the gated file is not counted");
for (const r of ls) assert.ok(r.band === null || typeof r.inside === "boolean");
console.log(`check-analytics: ok (+ the numbers: ${cc.rows.map(r => `${r.label.split(" ")[0]} ${r.count}`).join(", ")})`);
