import { cube as computeCube, judged, REALITY_INDEX } from "./cube.js";

// A subject's cube placement. Takes the server's cube fields when present, otherwise
// derives them from a breakdown. A server-judged card already carries people; a static
// figure carries raw people data.
export function cubeOf(s) {
  let q = null;
  if (s && typeof s.warmth === "number" && typeof s.competence === "number" && s.quadrant) {
    q = { warmth: s.warmth, competence: s.competence, quadrant: s.quadrant, judge: s.judge || "UNRATIFIED", realityIndex: s.realityIndex ?? REALITY_INDEX };
  } else if (s?.breakdown) q = computeCube(s.breakdown);
  if (!q) return null;
  const people = s.people && typeof s.people.likability === "number" ? s.people : null;
  return judged(q, people);
}
