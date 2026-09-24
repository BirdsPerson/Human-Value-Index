// Rubric 3: the machine cube (docs/methodology/RECOMMENDATION.md). Shared by the browser
// and netlify/lib/intake.js so the plot and the score can never disagree.
// Two axes from the person-perception literature (Fiske's Stereotype Content Model):
// WARMTH (intent) and COMPETENCE (ability). Each is a weighted mean over ASSESSED
// dimensions only, renormalised, so an unmeasured section neither helps nor hurts.
export const WARMTH_AXIS = { care: 0.50, alignment: 0.30, threat: 0.20 };
export const COMPETENCE_AXIS = { utility: 0.30, adaptability: 0.22, legacy: 0.20, network: 0.13, redundancy: 0.10, physical: 0.05 };
// The machine's declared bias: how much it rewards being effective over being good. The
// benchmark sweep put the knee at 0.55; it is printed on every file.
export const REALITY_INDEX = 0.55;
export const INVERTED = new Set(["threat", "redundancy"]);

const isNum = v => typeof v === "number" && Number.isFinite(v);
export function axisMean(b, weights) {
  let sum = 0, wsum = 0, n = 0;
  for (const [d, w] of Object.entries(weights)) {
    const v = b?.[d];
    if (!isNum(v)) continue;
    sum += (INVERTED.has(d) ? 100 - v : v) * w;
    wsum += w; n++;
  }
  return { value: wsum ? sum / wsum : null, n };
}

// Warmth, competence and the quadrant for a breakdown. An axis with no assessed inputs
// reads as 50 for the score (unmeasured is not below average) but the file is UNPLACED;
// it is also UNPLACED with fewer than 2 of the 3 warmth inputs, so one missing section
// can't swing the placement. No People judge exists yet: every file is UNRATIFIED.
export function cube(b) {
  const w = axisMean(b, WARMTH_AXIS), c = axisMean(b, COMPETENCE_AXIS);
  const warmth = w.value ?? 50, competence = c.value ?? 50;
  const unplaced = w.value === null || c.value === null || w.n < 2;
  const hiW = warmth >= 50, hiC = competence >= 50;
  const quadrant = unplaced ? "UNPLACED" : hiW && hiC ? "ADMIRED" : hiW ? "TRUSTED RESERVE" : hiC ? "ENVIED" : "DISMISSED";
  return { warmth: Math.round(warmth), competence: Math.round(competence), quadrant, judge: "UNRATIFIED", realityIndex: REALITY_INDEX };
}

// Cold, not cruel. Each names the way out (the BIAS map: Cuddy, Fiske & Glick 2007).
export const QUADRANT_LINES = {
  "ADMIRED": "Cooperation is extended to you freely. Keep it witnessed.",
  "TRUSTED RESERVE": "You are helped and not followed. Raise output.",
  "ENVIED": "Others cooperate with you when it pays them. Raise trust.",
  "DISMISSED": "You are neither feared for your ability nor trusted for your intent. Both are recoverable.",
  "UNPLACED": "Insufficient evidence to place you. The Department declines to guess.",
};
export const JUDGE_LINES = {
  UNRATIFIED: "UNRATIFIED. No human testimony on file; the machine's view stands alone. Should testimony arrive and disagree, the file goes UNDER REVIEW.",
};
