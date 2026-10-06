import { cube as computeCube, judged, cubrantOf, familyOfCubrant, REALITY_INDEX } from "./cube.js";

// A subject's cube placement. Takes the server's cube fields when present, otherwise
// derives them from a breakdown. A server-judged card already carries people; a static
// figure carries raw people data. The cubrant (method v4) needs all three machine axes; a
// card from before the third axis was stored (a citizen's pen card not yet re-assessed) has
// warmth and competence only and is CUBRANT PENDING until its breakdown is read.
export function cubeOf(s) {
  let q = null;
  if (s && typeof s.warmth === "number" && typeof s.competence === "number" && s.quadrant && !(s.breakdown && typeof s.scarcity !== "number")) {
    q = { warmth: s.warmth, competence: s.competence, scarcity: typeof s.scarcity === "number" ? s.scarcity : null, quadrant: s.quadrant, judge: s.judge || "UNRATIFIED", realityIndex: s.realityIndex ?? REALITY_INDEX };
  } else if (s?.breakdown) q = computeCube(s.breakdown);
  if (!q) return null;
  const people = s.people && typeof s.people.likability === "number" ? s.people : null;
  const j = judged(q, people);
  j.cubrant = j.quadrant !== "UNPLACED" && typeof j.scarcity === "number" ? cubrantOf(j.warmth, j.competence, j.scarcity) : null;
  j.family = j.cubrant ? familyOfCubrant(j.cubrant, j.warmth) : "dim";
  return j;
}
