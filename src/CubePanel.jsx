import { TermBox } from "./term.jsx";
import { gapLine, QUADRANT_LINES, JUDGE_LINES, OCTANT_LINES, OCTANT_FAMILY } from "./cube.js";
import { cubeOf } from "./cubeData.js";
import Cube3D from "./Cube3D.jsx";
import { pointOf } from "./cube3d.js";

// A subject in the octant cube: conduct (machine) × competence (machine) × likability
// (people). Takes the server's cube fields when present, otherwise derives them.
export { cubeOf };

export function OctantLegend() {
  return (
    <div className="hvi-cube-legend" aria-hidden="true">
      <span className="oct-good">● ADMIRED · UNSUNG · BELOVED</span>
      <span className="oct-charm">● CHARMING · INDULGED</span>
      <span className="oct-harm">● FEARED · DISMISSED</span>
      <span className="oct-dim">● OVERLOOKED</span>
      <span className="oct-dim">○ LIKABILITY UNRATED</span>
    </div>
  );
}

// One line for score cards: the octant when the people have rated, else the quadrant.
export function CubeLine({ subject }) {
  const q = cubeOf(subject);
  if (!q) return null;
  const head = q.octant ? `[${q.octant}]` : `[${q.quadrant}]${q.quadrant === "UNPLACED" ? "" : " (LIKABILITY UNRATED)"}`;
  return (
    <div className="hvi-cube-line">
      <div className={q.octant ? `oct-${OCTANT_FAMILY[q.octant]}` : undefined}>{head} · {q.judge} · REALITY INDEX {q.realityIndex.toFixed(2)}</div>
      <div className="hvi-tier-desc">{q.octant ? OCTANT_LINES[q.octant] : QUADRANT_LINES[q.quadrant]}</div>
    </div>
  );
}

export default function CubePanel({ subject, title = "THE CUBE" }) {
  const q = cubeOf(subject);
  if (!q) return null;
  const placed = q.quadrant !== "UNPLACED";
  const p = q.people;
  const pt = placed ? pointOf({ ...subject, ...q, name: subject.name || "YOU" }) : null;
  return (
    <TermBox title={title} right={q.octant || (placed ? q.quadrant : "UNPLACED")}>
      {placed && (
        <div className={`hvi-cube-octant ${q.octant ? `oct-${OCTANT_FAMILY[q.octant]}` : "oct-dim"}`}>
          {q.octant ? `OCTANT: ${q.octant}` : `QUADRANT: ${q.quadrant} (LIKABILITY UNRATED)`}
          <div className="hvi-tier-desc">{q.octant ? OCTANT_LINES[q.octant] : QUADRANT_LINES[q.quadrant]}</div>
        </div>
      )}
      {placed ? (
        <Cube3D single height={340} points={pt ? [pt] : []}
          label={`Octant cube. Conduct ${q.warmth}, competence ${q.competence}, likability ${p ? p.likability : "not yet rated"}. ${q.octant ? `Octant ${q.octant}.` : `Quadrant ${q.quadrant}, likability unrated.`} Judge state ${q.judge}. Drag or use arrow keys to rotate.`} />
      ) : (
        <div className="hvi-case-note ghost">UNPLACED. Too few sections assessed to place this file in the cube.</div>
      )}
      <div className="hvi-cube-nums">CONDUCT {q.warmth} · COMPETENCE {q.competence} · LIKABILITY {p ? p.likability : "UNRATED"}</div>
      {p ? (<>
        <div className="hvi-cube-nums">GAP (LIKABILITY − CONDUCT) {p.gap > 0 ? "+" : ""}{p.gap} · {q.judge}</div>
        <div className="hvi-case-note">{gapLine(p.gap)}</div>
        <div className="hvi-case-note ghost">The dotted line drops to the plane where likability equals conduct. Its length is the gap.</div>
        <div className="hvi-case-note ghost">Source: {p.source}{p.fame != null ? `, ${p.fame}% have heard of them, ${p.liked}% like, ${p.disliked}% dislike` : ""}{p.asOf ? ` (as of ${p.asOf})` : ""}.</div>
      </>) : (
        <div className="hvi-case-note ghost">LIKABILITY NOT YET RATED. Placed on the middle plane until the people are asked.</div>
      )}
      <div className="hvi-case-note">Conduct and competence are the machine's. Likability is the people's. The machine weights competence {Math.round(q.realityIndex * 100)}, warmth {100 - Math.round(q.realityIndex * 100)}; likability never moves the score. Niceness is not rewarded. Contribution that others witness is.</div>
      <div className="hvi-case-note" style={{ marginTop: 6 }}>{JUDGE_LINES[q.judge] || q.judge}</div>
    </TermBox>
  );
}
