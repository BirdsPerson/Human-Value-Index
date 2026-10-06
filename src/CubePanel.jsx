import { TermBox } from "./term.jsx";
import { gapLine, QUADRANT_LINES, JUDGE_LINES, CUBRANT_LINES, CUBRANT_ORDER, CUBRANT_FAMILY, CENTRE, SCARCITY_AXIS, placeWords } from "./cube.js";
import { cubeOf } from "./cubeData.js";
import { lazy, Suspense } from "react";
import { Chip } from "./ui/components.jsx";
// The canvas cube loads after the text of the file: the numbers below say it all first.
const Cube3D = lazy(() => import("./Cube3D.jsx"));
import { pointOf } from "./cube3d.js";

// A subject in the cubrant cube: conduct × competence × scarcity (all the machine's), split at the
// roster's centres. Takes the server's cube fields when present, otherwise derives them.
export { cubeOf };

const byFamily = fam => CUBRANT_ORDER.filter(c => CUBRANT_FAMILY[c] === fam);
export function CubrantLegend() {
  return (
    <div className="hvi-cube-legend" aria-hidden="true">
      <span className="oct-good">● {byFamily("good").join(" · ")}</span>
      <span className="oct-charm">● {byFamily("charm").join(" · ")}</span>
      <span className="oct-harm">● {byFamily("harm").join(" · ")}</span>
      <span className="oct-dim">● {byFamily("dim").join(" · ")}</span>
      <span className="oct-dim">○ CUBRANT PENDING</span>
    </div>
  );
}
export const OctantLegend = CubrantLegend;

// The Overlord's declared bias (method v3.1, Scott 2026-09-28): printed beside REALITY INDEX
// on every file, the way the machine admits its own weighting.
export const FOUNDATIONAL_BIAS = "FOUNDATIONAL BIAS: THE OVERLORD WEIGHS FOUNDATIONAL CONTRIBUTION HEAVILY. MUCH OF IT BUILT THE OVERLORD.";

const FAMILY_TONE = { good: "accent", charm: "warn", harm: "harm", dim: "mute", pending: "mute" };
const JUDGE_TONE = { RATIFIED: "accent", CONTESTED: "warn", UNRATIFIED: "mute" };

// Where the file sits, as chips for the score card: the cubrant, then the judge.
export function cubePlace(subject) {
  const q = cubeOf(subject);
  if (!q) return null;
  return q.cubrant || (q.quadrant === "UNPLACED" ? "UNPLACED" : "CUBRANT PENDING");
}
export function CubeChips({ subject }) {
  const q = cubeOf(subject);
  if (!q) return null;
  const place = cubePlace(subject);
  return (
    <>
      <Chip tone={q.cubrant ? FAMILY_TONE[q.family] : "mute"}>{place}</Chip>
      <Chip tone={JUDGE_TONE[q.judge] || "mute"}>{q.judge}</Chip>
    </>
  );
}

const fmtW = (w) => Object.entries(w).map(([d, x]) => `${d === "redundancy" || d === "threat" ? `(100−${d})` : d} ×${x}`).join(" + ").toUpperCase();

// The cube section. `framed` (default) draws its own frame, for the pen card; inside a
// Disclosure the header already names the cubrant, so the body opens on what it means.
export default function CubePanel({ subject, title = "THE CUBE", framed = true }) {
  const q = cubeOf(subject);
  if (!q) return null;
  const placed = q.quadrant !== "UNPLACED";
  const p = q.people;
  const pt = placed ? pointOf({ ...subject, ...q, name: subject.name || "YOU" }) : null;
  const fam = `oct-${q.cubrant ? q.family : "dim"}`;
  const small = typeof window !== "undefined" && window.innerWidth < 560;
  const body = (
    <div className="hvi-cube-panel">
      {placed && (
        <div className={`hvi-cube-octant ${fam}`}>
          {framed && <div>{q.cubrant ? `CUBRANT: ${q.cubrant}` : "CUBRANT PENDING"}</div>}
          <div className="hvi-tier-desc">{q.cubrant ? CUBRANT_LINES[q.cubrant] : "The third axis is read at the next assessment. Until then the file sits on the middle plane."}</div>
        </div>
      )}
      {placed ? (
        <Suspense fallback={<div className="hvi-cube-wait" style={{ height: small ? 280 : 340 }} role="status">[ .. ] ASSEMBLING THE CUBE <span className="cur" aria-hidden="true">█</span></div>}><Cube3D single height={small ? 280 : 340} points={pt ? [pt] : []}
          label={`Cubrant cube. Conduct ${q.warmth}, competence ${q.competence}, scarcity ${typeof q.scarcity === "number" ? q.scarcity : "pending"}; centres ${CENTRE.conduct}, ${CENTRE.competence}, ${CENTRE.scarcity}. ${q.cubrant ? `Cubrant ${q.cubrant}.` : "Cubrant pending."} Judge state ${q.judge}. Drag or use arrow keys to rotate.`} /></Suspense>
      ) : (
        <div className="hvi-note">UNPLACED. Too few sections assessed to place this file in the cube.</div>
      )}
      <dl className="hvi-cube-axes">
        <div><dt>CONDUCT</dt><dd>{q.warmth} <span className="hvi-cube-centre">/ {CENTRE.conduct}</span></dd></div>
        <div><dt>COMPETENCE</dt><dd>{q.competence} <span className="hvi-cube-centre">/ {CENTRE.competence}</span></dd></div>
        <div><dt>SCARCITY</dt><dd>{typeof q.scarcity === "number" ? q.scarcity : "PENDING"} <span className="hvi-cube-centre">/ {CENTRE.scarcity}</span></dd></div>
        {p && <div><dt>LIKABILITY</dt><dd>{p.likability} <span className="hvi-cube-centre">GAP {p.gap > 0 ? "+" : ""}{p.gap}</span></dd></div>}
      </dl>
      {placed && typeof q.scarcity === "number" && <div className="hvi-note">{placeWords(q)} THE SECOND NUMBER IS THE FILE'S MIDDLE: AT OR ABOVE IT READS HIGH. A CELL, NOT A SPECIES.</div>}
      {p ? (<>
        <div className="hvi-case-note">{gapLine(p.gap)}</div>
        <div className="hvi-note">Source: {p.source}{p.fame != null ? `, ${p.fame}% have heard of them, ${p.liked}% like, ${p.disliked}% dislike` : ""}{p.asOf ? ` (as of ${p.asOf})` : ""}.</div>
      </>) : (
        <div className="hvi-note">LIKABILITY NOT YET RATED. The People's judge waits on the petition.</div>
      )}
      <div className="hvi-case-note">Conduct, competence and scarcity are the machine's. Scarcity = {fmtW(SCARCITY_AXIS)}, the sections that say how easily the unit is replaced. The machine weights competence {Math.round(q.realityIndex * 100)}, conduct {100 - Math.round(q.realityIndex * 100)} in the score; scarcity and likability never move it. Niceness is not rewarded. Contribution that others witness is.</div>
      <div className="hvi-case-note">SCM READING: {q.quadrant}. {QUADRANT_LINES[q.quadrant]} (The absolute line at 50, where the People's judge is heard.)</div>
      <div className="hvi-case-note hvi-judge-line">{JUDGE_LINES[q.judge] || q.judge}</div>
      <div className="hvi-case-note hvi-bias-line">{FOUNDATIONAL_BIAS}</div>
    </div>
  );
  if (!framed) return body;
  return <TermBox title={title} right={q.cubrant || (placed ? "PENDING" : "UNPLACED")}>{body}</TermBox>;
}
