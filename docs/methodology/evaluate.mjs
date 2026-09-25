// Runs the current rubric and every candidate over the 62 figure breakdowns + 2 personas.
// node docs/methodology/evaluate.mjs  ->  docs/methodology/results.json + a metrics table on stdout.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FAMOUS_FIGURES } from "../../src/figures.js";
import { computeScore, TIERS, getTier } from "../../netlify/lib/intake.js";
import { CANDIDATES } from "./candidates.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const bench = JSON.parse(readFileSync(join(here, "benchmarks.json"), "utf8")).figures;

const PERSONAS = {
  "Decent ordinary": { care: 76, alignment: 62, utility: 60, adaptability: 55, legacy: 58, network: 53, physical: 62, threat: 12, redundancy: 50 },
  "Scott-like": { care: 62, alignment: 58, utility: 68, adaptability: 75, legacy: 58, network: 58, physical: 58, threat: null, redundancy: 45 },
};

// Moral sanity groups, fixed before looking at any candidate's output.
const MONSTER = f => f.breakdown.threat >= 85; // documented serious harm (12 files)
// Every tyrant/criminal file on the roster: should sit below every non-villain.
// Cleopatra, Henry VIII and Caligula moved to a separate historically-violent-rulers group on 2026-09-25 (scripts/calibration-lib.mjs HISTORICAL_RULERS).
const VILLAINS = ["Genghis Khan", "Kim Jong-un", "Putin", "Mao Zedong", "Jeffrey Epstein", "Ghislaine Maxwell", "Martin Shkreli", "Bernie Madoff", "Elizabeth Holmes", "Harvey Weinstein", "Joe Jackson", "Pablo Escobar", "O.J. Simpson", "Aaron Hernandez"];
const CRUEL = ["Elon Musk", "Peter Thiel", "Pablo Picasso", "Michael Jackson", "JFK", "Isaac Newton"]; // famous, capable, low care, not monsters
const SAINTS = ["Harriet Tubman", "Nelson Mandela", "Martin Luther King Jr.", "Mahatma Gandhi", "Mother Teresa", "Princess Diana", "Keanu Reeves"];
const ADMIRED_REF = ["Marie Curie", "Alan Turing", "Grace Hopper", "Stephen Hawking", "Oprah Winfrey", "Jason Kelce", "Shohei Ohtani", "Aretha Franklin", ...SAINTS];

// ---- stats
const ranks = xs => {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
};
const pearson = (a, b) => {
  const n = a.length, ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : null;
};
const spearman = (xs, ys) => {
  const p = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => typeof x === "number" && typeof y === "number");
  if (p.length < 5) return { rho: null, n: p.length };
  const rho = pearson(ranks(p.map(q => q[0])), ranks(p.map(q => q[1])));
  return { rho: rho == null ? null : +rho.toFixed(3), n: p.length };
};
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = xs => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))); };
const entropy = (counts, k) => {
  const tot = Object.values(counts).reduce((s, x) => s + x, 0);
  let h = 0; for (const c of Object.values(counts)) if (c) h -= (c / tot) * Math.log(c / tot);
  return +(h / Math.log(k)).toFixed(3); // 1 = perfectly even over k bins
};
const r1 = x => Math.round(x * 10) / 10;

const BENCH = {
  yougov_liked_share: n => bench[n]?.yougov_us?.liked_share_of_aware,
  yougov_popularity_pct: n => bench[n]?.yougov_us?.popularity_pct,
  yougov_disliked_pct: n => bench[n]?.yougov_us?.disliked_pct,
  yougov_fame_pct: n => bench[n]?.yougov_us?.fame_pct,
  pantheon_hpi: n => bench[n]?.pantheon?.hpi,
  pageviews_12mo: n => bench[n]?.pageviews_12mo,
  language_editions: n => bench[n]?.wikipedia_language_editions,
  wikidata_awards: n => bench[n]?.wikidata_awards_count,
  time100_century: n => (bench[n] ? (bench[n].time_100_of_the_century ? 1 : 0) : undefined),
  time_poy_count: n => (bench[n] ? (Array.isArray(bench[n].time_person_of_the_year) ? bench[n].time_person_of_the_year.length : bench[n].time_person_of_the_year ? 1 : 0) : undefined),
};

const quadOf = q => {
  const m = String(q ?? "").match(/ADMIRED|PITIED|PROTECTED|ENVIED|DISMISSED|UNPLACED/);
  return m ? (m[0] === "PROTECTED" ? "PITIED" : m[0]) : null;
};

const baseline = { id: "current", name: "Current rubric 2 (computeScore)", score: b => ({ score: computeScore(b), warmth: null, competence: null, octantOrQuadrant: null }) };
const all = [baseline, ...CANDIDATES];
const figs = FAMOUS_FIGURES;
const names = figs.map(f => f.name);

const storedMismatch = figs.filter(f => computeScore(f.breakdown, f.harm?.severity) !== f.score).map(f => ({ name: f.name, stored: f.score, computed: computeScore(f.breakdown, f.harm?.severity) }));

const out = { generated: new Date().toISOString(), figures: figs.length, groups: { villains: VILLAINS, monsters: figs.filter(MONSTER).map(f => f.name), cruel: CRUEL, saints: SAINTS, admired_ref: ADMIRED_REF }, stored_vs_computed_mismatch: storedMismatch, candidates: {} };

const baseScores = figs.map(f => computeScore(f.breakdown, f.harm?.severity));
const baseRank = ranks(baseScores.map(s => -s));

for (const c of all) {
  const res = figs.map(f => ({ name: f.name, ...c.score(f.breakdown) }));
  const S = res.map(r => r.score);
  const tiers = Object.fromEntries(TIERS.map(t => [t.label, 0]));
  S.forEach(s => tiers[getTier(s)]++);
  const quads = {};
  res.forEach(r => { const q = quadOf(r.octantOrQuadrant); if (q) quads[q] = (quads[q] || 0) + 1; });

  const reality = {};
  for (const [k, get] of Object.entries(BENCH)) reality[k] = spearman(S, names.map(get));
  const liked = names.map(BENCH.yougov_liked_share);
  const nonMon = figs.map(f => !MONSTER(f));
  reality.yougov_liked_share_non_monsters = spearman(S.filter((_, i) => nonMon[i]), liked.filter((_, i) => nonMon[i]));
  if (res[0].warmth != null) {
    reality.warmth_axis_vs_liked = spearman(res.map(r => r.warmth), liked);
    reality.competence_axis_vs_liked = spearman(res.map(r => r.competence), liked);
  }

  const by = Object.fromEntries(res.map(r => [r.name, r.score]));
  const pctile = s => r1((100 * S.filter(x => x < s).length) / S.length);
  const mon = res.filter((_, i) => MONSTER(figs[i])), rest = res.filter((_, i) => !MONSTER(figs[i]));
  const maxMon = Math.max(...mon.map(r => r.score)), minRest = Math.min(...rest.map(r => r.score));
  const cruel = CRUEL.map(n => by[n]), saints = SAINTS.map(n => by[n]), adm = ADMIRED_REF.map(n => by[n]);
  let wins = 0, pairs = 0; for (const a of adm) for (const x of cruel) { pairs++; wins += a > x ? 1 : a === x ? 0.5 : 0; }
  const sorted = [...res].sort((a, b) => a.score - b.score);
  const vil = res.filter(r => VILLAINS.includes(r.name)), nonVil = res.filter(r => !VILLAINS.includes(r.name));
  const minNonVil = Math.min(...nonVil.map(r => r.score));
  const moral = {
    villains_all_below_everyone_else: Math.max(...vil.map(r => r.score)) < minNonVil,
    min_non_villain: `${nonVil.find(r => r.score === minNonVil).name} ${minNonVil}`,
    max_villain: `${vil.sort((a, b) => b.score - a.score)[0].name} ${vil[0].score}`,
    under_100: res.filter(r => r.score < 100).length,
    monsters_all_below_everyone_else: maxMon < minRest,
    max_monster: { score: maxMon, name: mon.find(r => r.score === maxMon).name },
    min_non_monster: { score: minRest, name: rest.find(r => r.score === minRest).name },
    lowest_file: sorted[0].name,
    monster_mean: r1(mean(mon.map(r => r.score))),
    cruel_mean: r1(mean(cruel)), admired_mean: r1(mean(adm)), saints_mean: r1(mean(saints)),
    admired_beats_cruel_pairwise: +(wins / pairs).toFixed(3),
    cruel_above_any_saint: CRUEL.filter(n => SAINTS.some(s => by[n] > by[s])).map(n => `${n} ${by[n]} > ${SAINTS.filter(s => by[n] > by[s]).map(s => `${s} ${by[s]}`).join(", ")}`),
    saints_mean_percentile: r1(mean(saints.map(pctile))),
    saints_min_percentile: Math.min(...saints.map(pctile)),
    cruel_mean_percentile: r1(mean(cruel.map(pctile))),
    top5: [...sorted].reverse().slice(0, 5).map(r => `${r.name} ${r.score}`),
  };

  const rank = ranks(S.map(s => -s));
  const deltas = res.map((r, i) => ({ name: r.name, from: baseScores[i], to: r.score, delta: r.score - baseScores[i], rank_from: baseRank[i], rank_to: rank[i], rank_change: baseRank[i] - rank[i] }));
  const tierChanges = deltas.filter(d => getTier(d.from) !== getTier(d.to)).map(d => `${d.name} ${d.from}->${d.to} (${getTier(d.from)} -> ${getTier(d.to)})`);
  const byRank = [...deltas].sort((a, b) => b.rank_change - a.rank_change);
  const changes = {
    spearman_vs_current: spearman(S, baseScores).rho,
    mean_delta: r1(mean(deltas.map(d => d.delta))),
    delta_range: [Math.min(...deltas.map(d => d.delta)), Math.max(...deltas.map(d => d.delta))],
    mean_abs_rank_change: r1(mean(deltas.map(d => Math.abs(d.rank_change)))),
    tier_changes: tierChanges,
    biggest_score_gains: [...deltas].sort((a, b) => b.delta - a.delta).slice(0, 6).map(d => `${d.name} ${d.delta >= 0 ? "+" : ""}${d.delta}`),
    biggest_score_drops: [...deltas].sort((a, b) => a.delta - b.delta).slice(0, 6).map(d => `${d.name} ${d.delta >= 0 ? "+" : ""}${d.delta}`),
    rank_risers: byRank.slice(0, 5).map(d => `${d.name} +${d.rank_change}`),
    rank_fallers: byRank.slice(-5).reverse().map(d => `${d.name} ${d.rank_change}`),
  };

  const personas = {};
  for (const [pn, b] of Object.entries(PERSONAS)) {
    const r = c.score(b);
    personas[pn] = { score: r.score, tier: getTier(r.score), warmth: r.warmth ?? null, competence: r.competence ?? null, quadrant: r.octantOrQuadrant ?? null, percentile_vs_figures: pctile(r.score), rank_among_figures: S.filter(x => x > r.score).length + 1 };
  }

  out.candidates[c.id] = {
    name: c.name,
    distribution: { mean: r1(mean(S)), sd: r1(sd(S)), min: Math.min(...S), max: Math.max(...S), tiers, tier_evenness: entropy(tiers, 6), quadrants: Object.keys(quads).length ? quads : null, quadrant_evenness: Object.keys(quads).length ? entropy({ ADMIRED: 0, PITIED: 0, ENVIED: 0, DISMISSED: 0, ...quads }, 4) : null },
    halo_warmth_competence_spearman: res[0].warmth != null ? spearman(res.map(r => r.warmth), res.map(r => r.competence)).rho : null,
    reality, moral, changes, personas,
    figures: res.map((r, i) => ({ name: r.name, warmth: r.warmth ?? null, competence: r.competence ?? null, score: r.score, tier: getTier(r.score), quadrant: quadOf(r.octantOrQuadrant), cell: r.octantOrQuadrant ?? null, delta_vs_current: r.score - baseScores[i] })),
  };
}

// cross-candidate agreement on the headline
const ids = Object.keys(out.candidates);
out.cross_spearman = Object.fromEntries(ids.map(a => [a, Object.fromEntries(ids.map(b => [b, spearman(out.candidates[a].figures.map(f => f.score), out.candidates[b].figures.map(f => f.score)).rho]))]));
// cross-candidate quadrant agreement (figures placed in same quadrant)
const qids = ids.filter(i => out.candidates[i].distribution.quadrants);
out.quadrant_agreement = Object.fromEntries(qids.map(a => [a, Object.fromEntries(qids.map(b => [b, out.candidates[a].figures.filter((f, i) => f.quadrant === out.candidates[b].figures[i].quadrant).length]))]));

writeFileSync(join(here, "results.json"), JSON.stringify(out, null, 2) + "\n");

// ---- table
const pad = (s, n) => String(s).padEnd(n);
const cols = ["metric", ...ids];
const row = (label, f) => console.log(pad(label, 34) + ids.map(id => pad(f(out.candidates[id]) ?? "-", 18)).join(""));
console.log(pad("", 34) + ids.map(id => pad(id, 18)).join(""));
row("mean / sd", c => `${c.distribution.mean} / ${c.distribution.sd}`);
row("tier evenness (0-1)", c => c.distribution.tier_evenness);
row("tiers 850/700/500/300/100/0", c => Object.values(c.distribution.tiers).join("/"));
row("quadrants A/P/E/D", c => c.distribution.quadrants ? ["ADMIRED", "PITIED", "ENVIED", "DISMISSED"].map(q => c.distribution.quadrants[q] || 0).join("/") : null);
row("quadrant evenness (0-1)", c => c.distribution.quadrant_evenness);
row("halo W~C rho", c => c.halo_warmth_competence_spearman);
for (const k of ["yougov_liked_share", "yougov_liked_share_non_monsters", "yougov_popularity_pct", "yougov_disliked_pct", "pantheon_hpi", "pageviews_12mo", "language_editions", "wikidata_awards", "time100_century", "time_poy_count", "warmth_axis_vs_liked", "competence_axis_vs_liked"])
  row("rho " + k, c => c.reality[k] ? `${c.reality[k].rho} (n${c.reality[k].n})` : null);
row("villains all below non-villains", c => c.moral.villains_all_below_everyone_else);
row("max villain / min non-villain", c => `${c.moral.max_villain} / ${c.moral.min_non_villain}`);
row("files under 100", c => c.moral.under_100);
row("threat>=85 all at bottom", c => c.moral.monsters_all_below_everyone_else);
row("max monster / min other", c => `${c.moral.max_monster.score} / ${c.moral.min_non_monster.score}`);
row("lowest file", c => c.moral.lowest_file);
row("saints / admired / cruel mean", c => `${c.moral.saints_mean}/${c.moral.admired_mean}/${c.moral.cruel_mean}`);
row("admired>cruel pairwise", c => c.moral.admired_beats_cruel_pairwise);
row("cruel files above a saint", c => c.moral.cruel_above_any_saint.length);
row("saints pctile mean/min", c => `${c.moral.saints_mean_percentile}/${c.moral.saints_min_percentile}`);
row("cruel pctile mean", c => c.moral.cruel_mean_percentile);
row("rho vs current", c => c.changes.spearman_vs_current);
row("mean delta [range]", c => `${c.changes.mean_delta} [${c.changes.delta_range.join(",")}]`);
row("mean |rank change|", c => c.changes.mean_abs_rank_change);
row("tier changes", c => c.changes.tier_changes.length);
for (const p of Object.keys(PERSONAS)) row(p, c => { const x = c.personas[p]; return `${x.score} p${x.percentile_vs_figures} ${quadOf(x.quadrant) ?? ""}`; });
console.log("\nstored score != computeScore:", storedMismatch.length ? JSON.stringify(storedMismatch) : "none");
