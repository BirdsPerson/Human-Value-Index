// Candidate HVI methodologies, formula_js copied verbatim from the 2026-09-24 proposals.
// Evaluated by evaluate.mjs. Not imported by the app.

// 1. The Realism Dial
function realismDial(breakdown, opts = {}) {
  const REALISM = typeof opts.realism === "number" ? opts.realism : 0.65; // the dial: 0 = pure idealist, 1 = pure realist (machine-only default)
  const WARMTH = { care: 0.50, alignment: 0.30, threat: 0.20 };
  const COMPETENCE = { utility: 0.30, adaptability: 0.22, legacy: 0.20, network: 0.13, redundancy: 0.10, physical: 0.05 };
  const INVERTED = { threat: true, redundancy: true };
  const b = breakdown || {};
  const axis = (weights) => {
    let sum = 0, wsum = 0;
    for (const k in weights) {
      const v = b[k];
      if (typeof v !== "number" || !Number.isFinite(v)) continue; // unassessed: excluded, renormalised
      sum += (INVERTED[k] ? 100 - v : v) * weights[k];
      wsum += weights[k];
    }
    return wsum ? sum / wsum : null;
  };
  let warmth = axis(WARMTH), competence = axis(COMPETENCE);
  const provisional = warmth === null || competence === null;
  if (warmth === null) warmth = 50;          // unmeasured is not below average
  if (competence === null) competence = 50;
  let s = Math.round(10 * ((1 - REALISM) * warmth + REALISM * competence));
  const harmGated = typeof b.care === "number" && typeof b.threat === "number" && b.care <= 10 && b.threat >= 85;
  if (harmGated) s = Math.min(s, 99);
  s = Math.max(0, Math.min(1000, s));
  const hiW = warmth >= 50, hiC = competence >= 50;
  const quadrant = provisional ? "UNPLACED" : hiW && hiC ? "ADMIRED" : hiW ? "PITIED" : hiC ? "ENVIED" : "DISMISSED";
  // Third axis (judge): the machine-only view cannot corroborate itself.
  const judge = opts.people ? "CORROBORATED" : "UNCORROBORATED";
  return {
    warmth: Math.round(warmth),
    competence: Math.round(competence),
    score: s,
    octantOrQuadrant: quadrant + " / " + judge,
    realism: REALISM,
    gap: Math.round(competence - warmth),
    provisional,
    harmGated,
  };
}

// 2. Perception-First Cube
function perceptionFirst(b) {
  const n = v => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null);
  const inv = v => (v == null ? null : 100 - v);
  const d = {
    care: n(b?.care), honesty: n(b?.honesty), sociability: n(b?.sociability),
    alignment: n(b?.alignment), threat: inv(n(b?.threat)),
    utility: n(b?.utility), adaptability: n(b?.adaptability), legacy: n(b?.legacy),
    network: n(b?.network), physical: n(b?.physical), redundancy: inv(n(b?.redundancy)),
  };
  const split = d.honesty != null || d.sociability != null;
  const W_AX = split
    ? { honesty: 0.34, sociability: 0.11, alignment: 0.35, threat: 0.20 }
    : { care: 0.45, alignment: 0.35, threat: 0.20 };
  const C_AX = { utility: 0.34, adaptability: 0.24, legacy: 0.20, network: 0.12, physical: 0.05, redundancy: 0.05 };
  const axis = ax => {
    let s = 0, w = 0;
    for (const [k, wt] of Object.entries(ax)) if (d[k] != null) { s += d[k] * wt; w += wt; }
    return { v: w ? s / w : null, cov: w };
  };
  const W = axis(W_AX), C = axis(C_AX);
  const MW = 0.40, MC = 0.60;
  let s = Math.round(((W.v ?? 50) * MW + (C.v ?? 50) * MC) * 10);
  const morality = split ? d.honesty : d.care;
  const harmGated = morality != null && d.threat != null && morality <= 10 && d.threat <= 15; // threat already inverted
  if (harmGated) s = Math.min(s, 99);
  const warmth = W.v == null ? null : Math.round(W.v);
  const competence = C.v == null ? null : Math.round(C.v);
  const HI = 60;
  let quadrant;
  if (warmth == null || competence == null) quadrant = "UNPLACED";
  else quadrant = warmth >= HI ? (competence >= HI ? "ADMIRED" : "PROTECTED") : (competence >= HI ? "ENVIED" : "DISMISSED");
  const provisional = W.cov < 0.5 || C.cov < 0.5;
  return { warmth, competence, score: s, octantOrQuadrant: `${quadrant}-M/${provisional ? "PROVISIONAL" : "UNRATIFIED"}`, harmGated };
}

// 3. Rubric 3: Reweigh and Read Out
function reweigh(b) {
  const W = { care: .14, alignment: .10, utility: .21, adaptability: .16, legacy: .13, network: .10, physical: .04, threat: .07, redundancy: .05 };
  const INV = { threat: 1, redundancy: 1 };
  const val = d => { const v = b && b[d]; return (typeof v === "number" && Number.isFinite(v)) ? (INV[d] ? 100 - v : v) : null; };
  const avg = mix => { let s = 0, w = 0; for (const d in mix) { const v = val(d); if (v !== null) { s += v * mix[d]; w += mix[d]; } } return w ? s / w : null; };
  const m = avg(W);
  const gated = typeof b?.care === "number" && typeof b?.threat === "number" && b.care <= 10 && b.threat >= 85;
  let sc = m === null ? 500 : Math.round(m * 10);
  if (gated) sc = Math.min(sc, 99);
  const warmth = avg({ care: .55, threat: .30, alignment: .15 });
  const competence = avg({ utility: .35, adaptability: .25, legacy: .20, network: .10, redundancy: .10 });
  const r = x => x === null ? null : Math.round(x);
  let q = null;
  if (warmth !== null && competence !== null) q = warmth >= 60 ? (competence >= 65 ? "ADMIRED" : "PITIED") : (competence >= 65 ? "ENVIED" : "DISMISSED");
  return { warmth: r(warmth), competence: r(competence), score: sc, octantOrQuadrant: q ? "MACHINE-" + q : null };
}

export const CANDIDATES = [
  { id: "realism_dial", name: "The Realism Dial (machine-only, R=0.65)", score: b => realismDial(b) },
  { id: "realism_dial_055", name: "The Realism Dial at R=0.55 (its own proposed mitigation / blended headline)", score: b => realismDial(b, { realism: 0.55 }) },
  { id: "perception_first", name: "Perception-First Cube", score: perceptionFirst },
  { id: "reweigh", name: "Rubric 3: Reweigh and Read Out", score: reweigh },
];
