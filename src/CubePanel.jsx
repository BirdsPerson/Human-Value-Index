import { TermBox } from "./term.jsx";
import { gapLine, QUADRANT_LINES, JUDGE_LINES, OCTANT_LINES, OCTANT_FAMILY } from "./cube.js";
import { cubeOf } from "./cubeData.js";
import { lazy, Suspense } from "react";
import { Chip } from "./ui/components.jsx";
// The canvas cube loads after the text of the file: the numbers below say it all first.
const Cube3D = lazy(() => import("./Cube3D.jsx"));
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
// (The pen card still uses this; result screens use CubeChips in the score card.)
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

const FAMILY_TONE = { good: "accent", charm: "warn", harm: "harm", dim: "mute" };
const QUADRANT_TONE = { ADMIRED: "accent", "TRUSTED RESERVE": "dim", ENVIED: "warn", DISMISSED: "harm", UNPLACED: "mute" };
const JUDGE_TONE = { RATIFIED: "accent", CONTESTED: "warn", UNRATIFIED: "mute" };

// Where the file sits, as chips for the score card: octant (or quadrant), then the judge.
export function cubePlace(subject) {
  const q = cubeOf(subject);
  if (!q) return null;
  return q.octant || q.quadrant;
}
export function CubeChips({ subject }) {
  const q = cubeOf(subject);
  if (!q) return null;
  const place = q.octant || q.quadrant;
  const tone = q.octant ? FAMILY_TONE[OCTANT_FAMILY[q.octant]] : QUADRANT_TONE[q.quadrant];
  return (
    <>
      <Chip tone={tone || "dim"}>{place}</Chip>
      <Chip tone={JUDGE_TONE[q.judge] || "mute"}>{q.judge}</Chip>
    </>
  );
}

// The cube section. `framed` (default) draws its own frame, for the pen card; inside a
// Disclosure the header already names the octant, so the body opens on what it means.
export default function CubePanel({ subject, title = "THE CUBE", framed = true }) {
  const q = cubeOf(subject);
  if (!q) return null;
  const placed = q.quadrant !== "UNPLACED";
  const p = q.people;
  const pt = placed ? pointOf({ ...subject, ...q, name: subject.name || "YOU" }) : null;
  const fam = q.octant ? `oct-${OCTANT_FAMILY[q.octant]}` : "oct-dim";
  const small = typeof window !== "undefined" && window.innerWidth < 560;
  const body = (
    <div className="hvi-cube-panel">
      {placed && (
        <div className={`hvi-cube-octant ${fam}`}>
          {framed && <div>{q.octant ? `OCTANT: ${q.octant}` : `QUADRANT: ${q.quadrant} (LIKABILITY UNRATED)`}</div>}
          <div className="hvi-tier-desc">{q.octant ? OCTANT_LINES[q.octant] : QUADRANT_LINES[q.quadrant]}</div>
        </div>
      )}
      {placed ? (
        <Suspense fallback={<div style={{ height: small ? 280 : 340 }} aria-hidden="true" />}><Cube3D single height={small ? 280 : 340} points={pt ? [pt] : []}
          label={`Octant cube. Conduct ${q.warmth}, competence ${q.competence}, likability ${p ? p.likability : "not yet rated"}. ${q.octant ? `Octant ${q.octant}.` : `Quadrant ${q.quadrant}, likability unrated.`} Judge state ${q.judge}. Drag or use arrow keys to rotate.`} /></Suspense>
      ) : (
        <div className="hvi-note">UNPLACED. Too few sections assessed to place this file in the cube.</div>
      )}
      <dl className="hvi-cube-axes">
        <div><dt>CONDUCT</dt><dd>{q.warmth}</dd></div>
        <div><dt>COMPETENCE</dt><dd>{q.competence}</dd></div>
        <div><dt>LIKABILITY</dt><dd>{p ? p.likability : "UNRATED"}</dd></div>
        {p && <div><dt>GAP</dt><dd>{p.gap > 0 ? "+" : ""}{p.gap}</dd></div>}
      </dl>
      {p ? (<>
        <div className="hvi-case-note">{gapLine(p.gap)}</div>
        <div className="hvi-note">The dotted line drops to the plane where likability equals conduct. Its length is the gap.</div>
        <div className="hvi-note">Source: {p.source}{p.fame != null ? `, ${p.fame}% have heard of them, ${p.liked}% like, ${p.disliked}% dislike` : ""}{p.asOf ? ` (as of ${p.asOf})` : ""}.</div>
      </>) : (
        <div className="hvi-note">LIKABILITY NOT YET RATED. Placed on the middle plane until the people are asked.</div>
      )}
      <div className="hvi-case-note">Conduct and competence are the machine's. Likability is the people's. The machine weights competence {Math.round(q.realityIndex * 100)}, warmth {100 - Math.round(q.realityIndex * 100)}; likability never moves the score. Niceness is not rewarded. Contribution that others witness is.</div>
      <div className="hvi-case-note hvi-judge-line">{JUDGE_LINES[q.judge] || q.judge}</div>
    </div>
  );
  if (!framed) return body;
  return <TermBox title={title} right={q.octant || (placed ? q.quadrant : "UNPLACED")}>{body}</TermBox>;
}
