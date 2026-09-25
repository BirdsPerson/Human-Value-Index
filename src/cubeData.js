import { cube as computeCube, judged, octantOf, REALITY_INDEX } from "./cube.js";

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
  const j = judged(q, people);
  // The octant needs all three axes; without likability the file keeps only its quadrant.
  j.octant = j.people && j.quadrant !== "UNPLACED" ? octantOf(j.warmth, j.competence, j.people.likability) : null;
  return j;
}
