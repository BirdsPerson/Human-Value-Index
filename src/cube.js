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
  RATIFIED: "RATIFIED. Public regard places you in the same quadrant as the record. The Department finds this suspicious but will allow it.",
  CONTESTED: "CONTESTED. Public regard places you in a different quadrant than the record. Should it persist, the file goes UNDER REVIEW.",
};

// ---- The People judge (the cube's third axis) ----------------------------------------
// The machine judges WARMTH as conduct. People judge LIKABILITY: how a person is actually
// experienced, charm included. For public figures it is seeded from YouGov US ratings:
// the share of those who have heard of them who like them, shrunk toward 50 when few
// people know them (a 20-point pseudo-count of neutral opinion). Competence stays the
// machine's for both points until a people-competence measure exists. The People view
// never changes the headline score; the two are coupled only through reviews.
export const LIKABILITY_SHRINK = 20;
export function likabilityFrom(yg) {
  if (!yg || !isNum(yg.liked_share_of_aware) || !isNum(yg.fame_pct) || yg.fame_pct <= 0) return null;
  const raw = 100 * yg.liked_share_of_aware;
  return Math.round((yg.fame_pct * raw + LIKABILITY_SHRINK * 50) / (yg.fame_pct + LIKABILITY_SHRINK));
}
export const quadrantOf = (x, y) => (x >= 50 && y >= 50 ? "ADMIRED" : x >= 50 ? "TRUSTED RESERVE" : y >= 50 ? "ENVIED" : "DISMISSED");
export const GAP_THRESHOLD = 20;
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

// ---- The octants: warmth × competence × likability, all split at 50 -----------------
// Three midplanes (x=50, y=50, z=50) intersect at the centre; every rated subject sits
// in exactly one of eight cells. An unrated subject has only its 2D quadrant.
export const OCTANTS = {
  "+++": "ADMIRED", "++-": "UNSUNG", "+-+": "BELOVED", "+--": "OVERLOOKED",
  "-++": "CHARMING", "-+-": "FEARED", "--+": "INDULGED", "---": "DISMISSED",
};
export function octantOf(w, c, l) {
  const s = v => (v >= 50 ? "+" : "-");
  return OCTANTS[s(w) + s(c) + s(l)];
}
export const OCTANT_LINES = {
  ADMIRED: "Trusted, capable and liked. Rare. Do not become complacent.",
  UNSUNG: "Effective and decent. Unnoticed. The Department noticed.",
  BELOVED: "Trusted and liked. Output pending.",
  OVERLOOKED: "Decent. Unseen. Recoverable.",
  CHARMING: "Liked beyond the record. Charm is not a moral category. It is, however, a real one.",
  FEARED: "Capable. Not trusted. Not liked. Tolerated because useful.",
  INDULGED: "Liked for reasons the record does not supply.",
  DISMISSED: "Neither trusted, effective nor liked. The file remains open.",
};
// Colour families for the display: the good corner, the charm corner, the harm corner.
export const OCTANT_FAMILY = {
  ADMIRED: "good", UNSUNG: "good", BELOVED: "good",
  CHARMING: "charm", INDULGED: "charm",
  FEARED: "harm", DISMISSED: "harm",
  OVERLOOKED: "dim",
};
export const OCTANT_ORDER = ["ADMIRED", "UNSUNG", "BELOVED", "OVERLOOKED", "CHARMING", "FEARED", "INDULGED", "DISMISSED"];
