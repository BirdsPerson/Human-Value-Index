// Pure logic for the weekly self-calibration loop (scripts/calibrate.mjs). No I/O, so
// scripts/check-calibrate.mjs can exercise every rule with stubbed data.
//
// The loop MEASURES the current calibration against the roster and the real-world
// benchmarks, LEARNS from production appeals, and PROPOSES at most one bounded change.
// It never applies anything: Scott approves or rejects on the desk.
import { axisMean } from "../src/cube.js";

// ---- scoring with an explicit calibration (mirrors netlify/lib/intake.js computeScore and
// src/cube.js cube(); check-calibrate asserts they agree on every figure) -------------
const isNum = v => typeof v === "number" && Number.isFinite(v);
export function harmGatedWith(cal, b) {
  const g = cal.harmGate;
  return isNum(b?.threat) && (b.threat >= g.threatAlone || (isNum(b?.care) && b.care <= g.care && b.threat >= g.threat));
}
// Graded bottom: a gated file sits at cap - severity points (mirrors intake.js severityScore).
export function severityScoreWith(cal, sev) {
  const S = cal.severity;
  if (!S || !sev || typeof sev !== "object") return null;
  let pts = 0;
  for (const f of ["kind", "scale", "role", "duration", "accountability"]) {
    if (typeof sev[f] !== "string" || !(sev[f] in S[f])) return null;
    pts += S[f][sev[f]];
  }
  return Math.max(0, Math.round(cal.harmGate.cap - pts));
}
export function scoreWith(cal, b, sev = null) {
  const w = axisMean(b, cal.warmthAxis), c = axisMean(b, cal.competenceAxis);
  if (w.value === null && c.value === null) return 500;
  const score = Math.round(10 * ((1 - cal.realityIndex) * (w.value ?? 50) + cal.realityIndex * (c.value ?? 50)));
  if (harmGatedWith(cal, b)) { const g = severityScoreWith(cal, sev); return g ?? Math.min(score, cal.harmGate.cap); }
  const serious = isNum(b?.threat) && isNum(cal.harmGate.seriousThreat) && b.threat >= cal.harmGate.seriousThreat;
  return Math.max(0, Math.min(1000, serious ? Math.min(score, cal.harmGate.seriousCap) : score));
}
export function tierWith(cal, score) {
  return (cal.tiers.find(t => score >= t.min) || cal.tiers[cal.tiers.length - 1]).label;
}
export function cubeWith(cal, b) {
  const w = axisMean(b, cal.warmthAxis), c = axisMean(b, cal.competenceAxis);
  const warmth = w.value ?? 50, competence = c.value ?? 50;
  const unplaced = w.value === null || c.value === null || w.n < 2;
  const hiW = warmth >= cal.cut, hiC = competence >= cal.cut;
  const quadrant = unplaced ? "UNPLACED" : hiW && hiC ? "ADMIRED" : hiW ? "TRUSTED RESERVE" : hiC ? "ENVIED" : "DISMISSED";
  return { warmth: Math.round(warmth), competence: Math.round(competence), quadrant };
}
export function octantWith(cal, w, c, l) {
  const s = v => (v >= cal.cut ? "+" : "-");
  return { "+++": "ADMIRED", "++-": "UNSUNG", "+-+": "BELOVED", "+--": "OVERLOOKED", "-++": "CHARMING", "-+-": "FEARED", "--+": "INDULGED", "---": "DISMISSED" }[s(w) + s(c) + s(l)];
}

// ---- stats ---------------------------------------------------------------------------
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
export function spearman(xs, ys) {
  const p = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => isNum(x) && isNum(y));
  if (p.length < 5) return { rho: null, n: p.length };
  const rho = pearson(ranks(p.map(q => q[0])), ranks(p.map(q => q[1])));
  return { rho: rho == null ? null : +rho.toFixed(3), n: p.length };
}
// Normalised Shannon entropy over k bins: 1 = perfectly even.
export function evenness(counts, k) {
  const tot = Object.values(counts).reduce((s, x) => s + x, 0);
  if (!tot) return 0;
  let h = 0; for (const c of Object.values(counts)) if (c) h -= (c / tot) * Math.log(c / tot);
  return +(h / Math.log(k)).toFixed(3);
}

// ---- moral reference groups (fixed in docs/methodology/evaluate.mjs, before any tuning) ---
export const VILLAINS = ["Genghis Khan", "Kim Jong-un", "Putin", "Mao Zedong", "Jeffrey Epstein", "Ghislaine Maxwell", "Martin Shkreli", "Bernie Madoff", "Elizabeth Holmes", "Harvey Weinstein", "Joe Jackson", "Pablo Escobar", "O.J. Simpson", "Aaron Hernandez"];
// Pre-modern rulers whose documented harm is individual or dynastic killing within the
// norms of their court (Scott, 2026-09-25): serious, but judged by scale and era. They sit
// below every saint and above every modern predator; they are not held below everyone.
export const HISTORICAL_RULERS = ["Cleopatra", "Henry VIII", "Caligula"];
export const MODERN_PREDATORS = ["Jeffrey Epstein", "Ghislaine Maxwell", "Harvey Weinstein", "Pablo Escobar", "O.J. Simpson", "Aaron Hernandez"];
export const SAINTS = ["Harriet Tubman", "Nelson Mandela", "Martin Luther King Jr.", "Mahatma Gandhi", "Mother Teresa", "Princess Diana", "Keanu Reeves"];
export const PERSONAS = {
  "Decent ordinary": { care: 76, alignment: 62, utility: 60, adaptability: 55, legacy: 58, network: 53, physical: 62, threat: 12, redundancy: 50 },
  "Scott-like": { care: 62, alignment: 58, utility: 68, adaptability: 75, legacy: 58, network: 58, physical: 58, threat: null, redundancy: 45 },
};
export const PERSONA_FLOOR = 35;   // percentile vs the roster; a decent ordinary person must stay at or above it. 40 until the 2026-09-25 rescore lifted famous figures past the fixed persona; Scott confirmed p35 the same day (famous people outranking an ordinary one is realistic; the floor only guards against collapse).
export const SAINT_FLOOR = 50;     // every saint must sit at or above the roster median
export const MAX_SUBJECT_MOVE = 25;

// ---- MEASURE ---------------------------------------------------------------------------
// figures: [{name, breakdown, people?: {likability}}]; bench: benchmarks.json .figures
export function measure(cal, figures, bench = {}, prev = null) {
  const rows = figures.map(f => {
    const score = scoreWith(cal, f.breakdown, f.harm?.severity), q = cubeWith(cal, f.breakdown);
    const l = f.people?.likability;
    return { name: f.name, score, tier: tierWith(cal, score), ...q, octant: isNum(l) && q.quadrant !== "UNPLACED" ? octantWith(cal, q.warmth, q.competence, l) : null };
  });
  const byName = Object.fromEntries(rows.map(r => [r.name, r]));
  const scores = rows.map(r => r.score);
  const tierCounts = Object.fromEntries(cal.tiers.map(t => [t.label, 0]));
  rows.forEach(r => tierCounts[r.tier]++);
  const octantCounts = {};
  rows.forEach(r => { const k = r.octant || "UNRATED"; octantCounts[k] = (octantCounts[k] || 0) + 1; });
  const bget = (n, fn) => { try { return fn(bench[n]); } catch { return undefined; } };
  const vs = fn => spearman(scores, rows.map(r => bget(r.name, fn)));
  const rho = {
    yougovLikedShare: vs(b => b?.yougov_us?.liked_share_of_aware),
    yougovDisliked: vs(b => b?.yougov_us?.disliked_pct),
    pantheonHpi: vs(b => b?.pantheon?.hpi),
  };
  // invariants
  const villainRows = rows.filter(r => VILLAINS.includes(r.name)), otherRows = rows.filter(r => !VILLAINS.includes(r.name) && !HISTORICAL_RULERS.includes(r.name));
  const histRows = rows.filter(r => HISTORICAL_RULERS.includes(r.name));
  const saintRows = rows.filter(r => SAINTS.includes(r.name)), predatorRows = rows.filter(r => MODERN_PREDATORS.includes(r.name));
  const maxVillain = Math.max(-Infinity, ...villainRows.map(r => r.score)), minOther = Math.min(Infinity, ...otherRows.map(r => r.score));
  const under100 = rows.filter(r => r.score < 100);
  const sorted = [...scores].sort((a, b) => a - b), median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const pct = s => (100 * scores.filter(x => x < s).length) / (scores.length || 1);
  const saintsLow = rows.filter(r => SAINTS.includes(r.name) && r.score < median).map(r => r.name);
  const personas = Object.fromEntries(Object.entries(PERSONAS).map(([k, b]) => { const s = scoreWith(cal, b); return [k, { score: s, percentile: +pct(s).toFixed(1) }]; }));
  const invariants = {
    villainsBelowAll: !villainRows.length || !otherRows.length || maxVillain < minOther,
    under100AllVillains: under100.every(r => VILLAINS.includes(r.name)),
    saintsAtOrAboveMedian: saintsLow.length === 0,
    decentPersonaAboveFloor: personas["Decent ordinary"].percentile >= PERSONA_FLOOR,
    historicalRulersBracketed: !histRows.length
      || (Math.max(...histRows.map(r => r.score)) < Math.min(Infinity, ...saintRows.map(r => r.score))
        && Math.min(...histRows.map(r => r.score)) > Math.max(-Infinity, ...predatorRows.map(r => r.score))),
  };
  // drift vs a previous run (by name)
  let drift = null;
  if (prev?.rows) {
    const pr = Object.fromEntries(prev.rows.map((r, i) => [r.name, r]));
    const rankOf = rs => { const s = [...rs].sort((a, b) => b.score - a.score); return Object.fromEntries(s.map((r, i) => [r.name, i + 1])); };
    const rNow = rankOf(rows), rPrev = rankOf(prev.rows);
    const moves = rows.filter(r => pr[r.name]).map(r => ({ name: r.name, from: pr[r.name].score, to: r.score, delta: r.score - pr[r.name].score, rankDelta: rPrev[r.name] - rNow[r.name] }));
    drift = { compared: moves.length, meanAbsRankChange: moves.length ? +(moves.reduce((s, m) => s + Math.abs(m.rankDelta), 0) / moves.length).toFixed(2) : 0, biggest: [...moves].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5), added: rows.filter(r => !pr[r.name]).map(r => r.name) };
  }
  return {
    rows, byName, tierCounts, tierEvenness: evenness(tierCounts, cal.tiers.length), octantCounts, rho,
    invariants, invariantsHold: Object.values(invariants).every(Boolean), saintsLow, under100: under100.map(r => r.name),
    personas, median, drift,
  };
}

// ---- LEARN FROM APPEALS AND CONFIDENCE -------------------------------------------------
export const APPEAL_MIN_N = 10, APPEAL_UPHELD_RATE = 0.6, OFTEN_UNASSESSED = 0.5, CONF_MIN_N = 10;
// cases: [{history: [...entries]}] from production hvi-cases
export function learn(cases, dims) {
  const appeals = Object.fromEntries(dims.map(d => [d, { n: 0, upheld: 0, denied: 0, movement: 0 }]));
  const conf = Object.fromEntries(dims.map(d => [d, { n: 0, unassessed: 0, sum: 0 }]));
  let interviews = 0, appealEntries = 0;
  for (const c of cases) {
    const h = Array.isArray(c?.history) ? c.history : [];
    h.forEach((e, i) => {
      if (!e || e.simulated) return;                       // only real subjects teach the machine
      if (e.appeal && e.appealRulings) {
        appealEntries++;
        const prev = h[i - 1];
        for (const [d, ruling] of Object.entries(e.appealRulings)) {
          if (!appeals[d]) continue;
          const a = appeals[d]; a.n++;
          ruling === "UPHELD" ? a.upheld++ : a.denied++;
          if (isNum(e.breakdown?.[d]) && isNum(prev?.breakdown?.[d])) a.movement += e.breakdown[d] - prev.breakdown[d];
        }
        return;                                              // an appeal's confidence is scoped: don't count it as an interview
      }
      if (!e.confidence || (e.rubric ?? 1) < 2) return;
      interviews++;
      for (const d of dims) {
        const v = e.confidence[d];
        if (!isNum(v)) continue;
        conf[d].n++; conf[d].sum += v;
        if (e.breakdown?.[d] === null || v < 35) conf[d].unassessed++;
      }
    });
  }
  const appealRows = dims.map(d => {
    const a = appeals[d];
    return { dim: d, n: a.n, upheldRate: a.n ? +(a.upheld / a.n).toFixed(2) : null, meanMovement: a.n ? +(a.movement / a.n).toFixed(1) : null };
  });
  const confRows = dims.map(d => ({ dim: d, n: conf[d].n, meanConfidence: conf[d].n ? Math.round(conf[d].sum / conf[d].n) : null, unassessedRate: conf[d].n ? +(conf[d].unassessed / conf[d].n).toFixed(2) : null }));
  const proposals = [];
  for (const r of appealRows) {
    if (r.n >= APPEAL_MIN_N && r.upheldRate > APPEAL_UPHELD_RATE)
      proposals.push(`${r.dim.toUpperCase()}: ${Math.round(r.upheldRate * 100)}% of ${r.n} appeals upheld (mean +${r.meanMovement}). The interview under-reads this section. Review its question pool and scoring anchors.`);
  }
  for (const r of confRows) {
    if (r.n >= CONF_MIN_N && r.unassessedRate >= OFTEN_UNASSESSED)
      proposals.push(`${r.dim.toUpperCase()}: left unassessed in ${Math.round(r.unassessedRate * 100)}% of ${r.n} interviews. Its questions are not landing.`);
  }
  const totalAppealRulings = appealRows.reduce((s, r) => s + r.n, 0);
  return { interviews, appealEntries, totalAppealRulings, appealRows, confRows, proposals, sufficient: { appeals: appealRows.some(r => r.n >= APPEAL_MIN_N), confidence: confRows.some(r => r.n >= CONF_MIN_N) } };
}

// ---- PROPOSE ---------------------------------------------------------------------------
export const STEP = 0.02;
export const MARGIN = 0.02;        // soft-objective gain required before a change is worth proposing
export const CHURN_WEIGHT = 0.01;  // per unit of mean absolute rank change
const round2 = x => Math.round(x * 100) / 100;
const clone = o => JSON.parse(JSON.stringify(o));

// Soft objective: fit to real-world liking + tier evenness − churn. Hard constraints first.
// Hard constraints: no invariant that holds today may break, no persona may fall below
// its floor, no subject may move more than MAX_SUBJECT_MOVE. An invariant that already
// fails is reported as a finding, not used to veto every candidate; repairing one earns
// a bonus in the soft objective.
export function fitness(cal, figures, bench, base) {
  const m = measure(cal, figures, bench, base ? { rows: base.rows } : null);
  const maxMove = base ? Math.max(0, ...m.rows.map(r => Math.abs(r.score - (base.byName[r.name]?.score ?? r.score)))) : 0;
  const was = base?.invariants || m.invariants;
  const broken = Object.keys(m.invariants).filter(k => was[k] && !m.invariants[k]);
  const repaired = Object.keys(m.invariants).filter(k => !was[k] && m.invariants[k]);
  const feasible = broken.length === 0 && m.invariants.decentPersonaAboveFloor && maxMove <= MAX_SUBJECT_MOVE;
  const churn = m.drift ? m.drift.meanAbsRankChange : 0;
  const soft = (m.rho.yougovLikedShare.rho ?? 0) + 0.5 * m.tierEvenness - CHURN_WEIGHT * churn + 0.05 * repaired.length;
  return { m, feasible, broken, repaired, maxMove, churn, soft: +soft.toFixed(4) };
}

// Every calibration one bounded step away: move STEP of weight between two dimensions of
// the same axis (the axis still sums to 1), or move the reality index by ±STEP.
export function neighbours(cal) {
  const out = [];
  for (const axis of ["warmthAxis", "competenceAxis"]) {
    const dims = Object.keys(cal[axis]);
    for (const from of dims) for (const to of dims) {
      if (from === to || cal[axis][from] - STEP < 0.01) continue;
      const c = clone(cal);
      c[axis][from] = round2(c[axis][from] - STEP); c[axis][to] = round2(c[axis][to] + STEP);
      out.push({ cal: c, change: `${axis === "warmthAxis" ? "warmth" : "competence"}: ${STEP} weight from ${from} to ${to}`, touched: [`${axis}.${from}`, `${axis}.${to}`] });
    }
  }
  for (const d of [-STEP, STEP]) {
    const r = round2(cal.realityIndex + d);
    if (r <= 0.4 || r >= 0.7) continue;
    const c = clone(cal); c.realityIndex = r;
    out.push({ cal: c, change: `reality index ${cal.realityIndex} → ${r}`, touched: ["realityIndex"] });
  }
  return out;
}

// Bounded search: best single step, then one compatible second step on different
// parameters, so no parameter moves more than STEP in a run.
export function propose(cal, figures, bench) {
  const base = fitness(cal, figures, bench, null);
  const baseRef = { rows: base.m.rows, byName: base.m.byName, invariants: base.m.invariants };
  const score = n => ({ ...n, f: fitness(n.cal, figures, bench, baseRef) });
  const singles = neighbours(cal).map(score).filter(n => n.f.feasible).sort((a, b) => b.f.soft - a.f.soft);
  let best = singles[0] || null;
  if (best) {
    const doubles = neighbours(best.cal)
      .filter(n => !n.touched.some(t => best.touched.includes(t)))
      .map(n => score({ ...n, change: `${best.change}; ${n.change}`, touched: [...best.touched, ...n.touched] }))
      .filter(n => n.f.feasible)
      .sort((a, b) => b.f.soft - a.f.soft);
    if (doubles[0] && doubles[0].f.soft > best.f.soft) best = doubles[0];
  }
  const gain = best ? +(best.f.soft - base.soft).toFixed(4) : 0;
  const worth = !!best && gain >= MARGIN;
  return {
    base, evaluated: singles.length, best, gain, worth,
    decision: worth ? "change" : "no change",
    reason: !best ? "No feasible neighbour: every bounded step breaks a rule that holds today." :
      worth ? `Improves the soft objective by ${gain} (threshold ${MARGIN}).` :
      `Best bounded step (${best.change}) improves the soft objective by only ${gain}, under the ${MARGIN} threshold. Not worth moving anyone.`,
  };
}

// ---- figures.js rewrite (formula only, no model calls) -------------------------------
// Replaces score/tier/warmth/competence/quadrant on each figure line; everything else stays.
export function rescoreFiguresSource(src, cal, figures) {
  let out = src, changed = 0;
  for (const f of figures) {
    const esc = JSON.stringify(f.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^(  \\{ name: ${esc}, )score: -?\\d+, tier: "[^"]*", warmth: -?\\d+, competence: -?\\d+, quadrant: "[^"]*"`, "m");
    if (!re.test(out)) throw new Error(`figures.js: no rewritable line for ${f.name}`);
    const s = scoreWith(cal, f.breakdown, f.harm?.severity), q = cubeWith(cal, f.breakdown);
    const next = out.replace(re, (_, head) => `${head}score: ${s}, tier: ${JSON.stringify(tierWith(cal, s))}, warmth: ${q.warmth}, competence: ${q.competence}, quadrant: ${JSON.stringify(q.quadrant)}`);
    if (next !== out) changed++;
    out = next;
  }
  return { src: out, changed };
}

// ---- desk answers ----------------------------------------------------------------------
// DESK_ANSWERS.md sections look like "**<item text>**" followed by "> **(answer)** ...".
// Returns "apply" | "reject" | null for the proposal with this date.
export function findAnswer(md, date) {
  if (!md) return null;
  const needle = `calibration proposal ${date}`;
  const i = md.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return null;
  const tail = md.slice(i, i + 1500);
  const quoted = tail.split("\n").filter(l => l.trim().startsWith(">")).join(" ").toLowerCase();
  if (/\breject/.test(quoted)) return "reject";
  if (/\bapply\b|\bapplied\b|\bapprove/.test(quoted)) return "apply";
  return null;
}

// The newest proposal still waiting for an answer, or null. Anything applied, applying,
// rejected, failed or superseded is never picked again, so nothing applies twice.
export function pickOpen(state) {
  const open = Object.entries(state?.proposals || {}).filter(([, s]) => s.status === "open").map(([d]) => d).sort();
  return open.length ? open[open.length - 1] : null;
}

// ---- roster drift ----------------------------------------------------------------------
// The loop above only re-weights STORED breakdowns, so it cannot see the stored roster
// drifting away from what the live prompts would say today. Each week a rotating sample is
// re-scored fresh (median of 3) and compared with what is stored.
export const DRIFT_SAMPLE = 5;
export const DRIFT_THRESHOLD = 25;   // mean absolute points before the roster is called stale

// Deterministic rotation: week w takes names [w*n, w*n+n) of the sorted roster, wrapping.
export function driftSample(names, week, n = DRIFT_SAMPLE) {
  const sorted = [...new Set(names)].sort();
  if (!sorted.length) return [];
  const start = ((week * n) % sorted.length + sorted.length) % sorted.length;
  return Array.from({ length: Math.min(n, sorted.length) }, (_, i) => sorted[(start + i) % sorted.length]);
}
export const weekNumber = (date = new Date()) => Math.floor(date.getTime() / (7 * 864e5));

// pairs: [{ name, stored, fresh }] -> { mad, worst, stale }
export function driftStats(pairs, threshold = DRIFT_THRESHOLD) {
  if (!pairs.length) return { mad: 0, worst: null, stale: false };
  const d = pairs.map(p => ({ ...p, diff: p.fresh - p.stored }));
  const mad = Math.round(d.reduce((s, p) => s + Math.abs(p.diff), 0) / d.length);
  const worst = d.reduce((a, b) => (Math.abs(b.diff) > Math.abs(a.diff) ? b : a));
  return { mad, worst: { name: worst.name, diff: worst.diff }, stale: mad > threshold, rows: d };
}

// "Roster drift <date>" desk item -> "rescore" | "ignore" | null
export function findDriftAnswer(md, date) {
  if (!md) return null;
  const i = md.toLowerCase().indexOf(`roster drift ${date}`.toLowerCase());
  if (i < 0) return null;
  const quoted = md.slice(i, i + 1500).split("\n").filter(l => l.trim().startsWith(">")).join(" ").toLowerCase();
  if (/\bignore/.test(quoted)) return "ignore";
  if (/\brescore\b|\bre-score\b/.test(quoted)) return "rescore";
  return null;
}
export function pickOpenDrift(state) {
  const open = Object.entries(state?.drift || {}).filter(([, s]) => s.status === "open").map(([d]) => d).sort();
  return open.length ? open[open.length - 1] : null;
}
