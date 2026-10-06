// Rubric 3: the machine cube (docs/methodology/RECOMMENDATION.md), method v4: the cubrants
// (docs/design/SCALE.md). Shared by the browser and netlify/lib/intake.js so the plot and
// the score can never disagree.
// Three machine axes, each a weighted mean over ASSESSED dimensions only, renormalised, so an
// unmeasured section neither helps nor hurts:
//   CONDUCT    (warmth: intent)   care, alignment, 100-threat          (Fiske's Stereotype Content Model)
//   COMPETENCE (ability)          utility, legacy, adaptability, network, 100-redundancy, physical
//   SCARCITY   (replaceability)   100-redundancy, physical: how hard the unit is to replace
// Every tunable number lives in netlify/lib/calibration.json, changed only by an approved
// calibration proposal (scripts/calibrate.mjs).
import CAL from "../netlify/lib/calibration.json" with { type: "json" };
export { CAL };
export const WARMTH_AXIS = CAL.warmthAxis;
export const COMPETENCE_AXIS = CAL.competenceAxis;
export const SCARCITY_AXIS = CAL.scarcityAxis;
// The machine's declared bias: how much it rewards being effective over being good. The
// benchmark sweep put the knee at 0.55; it is printed on every file.
export const REALITY_INDEX = CAL.realityIndex;
// The absolute SCM line (50): where the People's judge and the petition cohorts split high from low.
export const CUT = CAL.cut;
// Where the cubrant axes split: the roster medians, frozen in calibration.json (method v4).
export const CENTRE = CAL.centre;
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

// ---- the cubrants: conduct × competence × scarcity, each split at its centre ----------------
// Sign order: CONDUCT, COMPETENCE, SCARCITY; ">= centre" reads "+". Computed on the rounded
// integers the file prints, so a visitor can recompute the cell from the three numbers.
export const CUBRANTS = {
  "+++": "KEYSTONE", "++-": "DEPENDABLE", "+-+": "HEIRLOOM", "+--": "GOOD STANDING",
  "-++": "CONTROLLED ASSET", "-+-": "MERCENARY", "--+": "LIABILITY", "---": "SURPLUS",
};
export const CUBRANT_ORDER = ["KEYSTONE", "DEPENDABLE", "HEIRLOOM", "GOOD STANDING", "CONTROLLED ASSET", "MERCENARY", "LIABILITY", "SURPLUS"];
export const CUBRANT_SIGNS = Object.fromEntries(Object.entries(CUBRANTS).map(([k, v]) => [v, k]));
export function cubrantOf(conduct, competence, scarcity, centre = CENTRE) {
  if (!isNum(conduct) || !isNum(competence) || !isNum(scarcity)) return null;
  const s = (v, c) => (v >= c ? "+" : "-");
  return CUBRANTS[s(conduct, centre.conduct) + s(competence, centre.competence) + s(scarcity, centre.scarcity)];
}
// Cold, not cruel. Every line is RELATIVE: above or below the file's middle on each axis, never
// an absolute verdict (the tier and the score are the verdict). A cell, not a species.
export const CUBRANT_LINES = {
  "KEYSTONE": "Above the middle on conduct, competence and scarcity. The Department has noticed. So has everyone else.",
  "DEPENDABLE": "Above the middle on conduct and competence; easier to replace than most. The Department believes it could find another. It has not tried.",
  "HEIRLOOM": "Above the middle on conduct and scarcity; output below it. Kept, like the good china.",
  "GOOD STANDING": "Above the middle on conduct alone. The Department has nothing against you, which is the most it offers.",
  "CONTROLLED ASSET": "Above the middle on competence and scarcity; conduct below it. Retained under supervision.",
  "MERCENARY": "Above the middle on competence alone. Priced accordingly.",
  "LIABILITY": "Above the middle on scarcity alone: hard to replace, for reasons the record does not flatter. The Department regards this as the awkward combination.",
  "SURPLUS": "Below the middle on all three. The file remains open. The middle is not a high bar.",
};
// Colour families for the display: the good corner, the charm corner, the harm corner.
export const CUBRANT_FAMILY = {
  "KEYSTONE": "good", "DEPENDABLE": "good", "HEIRLOOM": "good",
  "GOOD STANDING": "dim",
  "CONTROLLED ASSET": "charm", "MERCENARY": "charm",
  "LIABILITY": "harm", "SURPLUS": "harm",
};
// The harm colour is for files under the absolute trust line as well as the roster's middle:
// a SURPLUS file with conduct 55 is below the file's middle, not untrustworthy. It draws muted.
export function familyOfCubrant(cubrant, conduct) {
  const f = CUBRANT_FAMILY[cubrant] || "dim";
  return f === "harm" && isNum(conduct) && conduct >= CUT ? "dim" : f;
}

// Warmth, competence, scarcity, the SCM quadrant and the cubrant for a breakdown. An axis with
// no assessed inputs reads as 50 for the score (unmeasured is not below average) but the file is
// UNPLACED; it is also UNPLACED with fewer than 2 of the 3 warmth inputs, so one missing section
// can't swing the placement. No People judge exists yet: every file is UNRATIFIED.
export function cube(b) {
  const w = axisMean(b, WARMTH_AXIS), c = axisMean(b, COMPETENCE_AXIS), s = axisMean(b, SCARCITY_AXIS);
  const warmth = w.value ?? 50, competence = c.value ?? 50, scarcity = s.value ?? 50;
  const unplaced = w.value === null || c.value === null || w.n < 2;
  const hiW = warmth >= CUT, hiC = competence >= CUT;
  const quadrant = unplaced ? "UNPLACED" : hiW && hiC ? "ADMIRED" : hiW ? "TRUSTED RESERVE" : hiC ? "ENVIED" : "DISMISSED";
  const W = Math.round(warmth), C = Math.round(competence), S = Math.round(scarcity);
  const cubrant = unplaced ? null : cubrantOf(W, C, S);
  return { warmth: W, competence: C, scarcity: S, quadrant, cubrant, judge: "UNRATIFIED", realityIndex: REALITY_INDEX };
}

// The SCM quadrant (absolute, cut at 50): the People's judge compares likability with it.
export const QUADRANT_LINES = {
  "ADMIRED": "Cooperation is extended to you freely. Keep it witnessed.",
  "TRUSTED RESERVE": "You are helped and not followed. Raise output.",
  "ENVIED": "Others cooperate with you when it pays them. Raise trust.",
  "DISMISSED": "You are neither feared for your ability nor trusted for your intent. Both are recoverable.",
  "UNPLACED": "Insufficient evidence to place you. The Department declines to guess.",
};
export const JUDGE_LINES = {
  UNRATIFIED: "UNRATIFIED. No human testimony on file; the machine's view stands alone. Should testimony arrive and disagree, the file goes UNDER REVIEW.",
  RATIFIED: "RATIFIED. Public regard places you on the same side of the trust line as the record. The Department finds this suspicious but will allow it.",
  CONTESTED: "CONTESTED. Public regard places you on the other side of the trust line from the record. Should it persist, the file goes UNDER REVIEW.",
};

// ---- The People judge ---------------------------------------------------------------------
// The machine judges CONDUCT. People judge LIKABILITY: how a person is actually experienced,
// charm included. For public figures it is seeded from YouGov US ratings: the share of those who
// have heard of them who like them, shrunk toward 50 when few people know them (a 20-point
// pseudo-count of neutral opinion). The judge is a verdict about the placement, not an axis of
// it (docs/design/SCALE.md §2.1). The People view never changes the headline score; the two are
// coupled only through reviews.
export const LIKABILITY_SHRINK = CAL.likabilityShrink;
export function likabilityFrom(yg) {
  if (!yg || !isNum(yg.liked_share_of_aware) || !isNum(yg.fame_pct) || yg.fame_pct <= 0) return null;
  const raw = 100 * yg.liked_share_of_aware;
  return Math.round((yg.fame_pct * raw + LIKABILITY_SHRINK * 50) / (yg.fame_pct + LIKABILITY_SHRINK));
}
export const quadrantOf = (x, y) => (x >= CUT && y >= CUT ? "ADMIRED" : x >= CUT ? "TRUSTED RESERVE" : y >= CUT ? "ENVIED" : "DISMISSED");
export const GAP_THRESHOLD = CAL.gapThreshold;
export function gapLine(gap) {
  if (gap >= GAP_THRESHOLD) return "Public affection exceeds the record. The Department notes charm is not a moral category. It is, however, a real one.";
  if (gap <= -GAP_THRESHOLD) return "The record exceeds the affection. The public has not noticed. The Department has.";
  return "Public and record roughly agree. Rare.";
}
// Machine cube + (optional) people data -> judge state and the People point.
export function judged(q, people) {
  if (!q) return q;
  if (q.quadrant === "UNPLACED" || !people || !isNum(people.likability)) return { ...q, judge: "UNRATIFIED", people: null };
  const pq = quadrantOf(people.likability, q.competence);
  const gap = people.likability - q.warmth;
  return { ...q, judge: pq === q.quadrant ? "RATIFIED" : "CONTESTED", people: { ...people, quadrant: pq, gap } };
}

// Where a file stands on each axis, in words, for the panel and the screen reader.
export function placeWords(q, centre = CENTRE) {
  if (!q || !isNum(q.warmth)) return "";
  const side = (v, c) => (v >= c ? "ABOVE" : "BELOW");
  return `CONDUCT ${side(q.warmth, centre.conduct)} THE MIDDLE (${q.warmth} vs ${centre.conduct}), COMPETENCE ${side(q.competence, centre.competence)} (${q.competence} vs ${centre.competence}), SCARCITY ${side(q.scarcity, centre.scarcity)} (${q.scarcity} vs ${centre.scarcity}).`;
}
