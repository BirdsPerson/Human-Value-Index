import { TermBox } from "./term.jsx";
import { cube as computeCube, QUADRANT_LINES, JUDGE_LINES, REALITY_INDEX } from "./cube.js";

// The machine's view of a subject on warmth x competence, drawn as a text-mode plot.
// Takes the server's cube fields when present, otherwise derives them from a breakdown.
const COLS = 31, ROWS = 11, MIDC = 15, MIDR = 5;

export function plotRows(warmth, competence) {
  const col = Math.max(0, Math.min(COLS - 1, Math.round((warmth / 100) * (COLS - 1))));
  const row = Math.max(0, Math.min(ROWS - 1, Math.round(((100 - competence) / 100) * (ROWS - 1))));
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    let line = "";
    for (let c = 0; c < COLS; c++) {
      line += r === row && c === col ? "●"
        : r === MIDR && c === MIDC ? "┼"
        : r === MIDR ? "─"
        : c === MIDC ? "│"
        : "·";
    }
    rows.push(line);
  }
  return rows;
}

const edge = (l, r) => l + " ".repeat(Math.max(1, COLS - l.length - r.length)) + r;

export function cubeOf(s) {
  if (s && typeof s.warmth === "number" && typeof s.competence === "number" && s.quadrant) {
    return { warmth: s.warmth, competence: s.competence, quadrant: s.quadrant, judge: s.judge || "UNRATIFIED", realityIndex: s.realityIndex ?? REALITY_INDEX };
  }
  return s?.breakdown ? computeCube(s.breakdown) : null;
}

export function CubeLine({ subject }) {
  const q = cubeOf(subject);
  if (!q) return null;
  return (
    <div className="hvi-cube-line">
      <div>[{q.quadrant}] · {q.judge} · REALITY INDEX {q.realityIndex.toFixed(2)}</div>
      <div className="hvi-tier-desc">{QUADRANT_LINES[q.quadrant]}</div>
    </div>
  );
}

export default function CubePanel({ subject, title = "WARMTH × COMPETENCE" }) {
  const q = cubeOf(subject);
  if (!q) return null;
  const placed = q.quadrant !== "UNPLACED";
  const rows = plotRows(q.warmth, q.competence);
  return (
    <TermBox title={title} right="MACHINE VIEW">
      <div className="hvi-rows hvi-cube" role="img"
        aria-label={`Machine placement: warmth ${q.warmth}, competence ${q.competence}, quadrant ${q.quadrant}, ${q.judge}.`}>
        <div className="muted">COMPETENCE ↑</div>
        <div className="muted">{edge("ENVIED", "ADMIRED")}</div>
        {rows.map((line, i) => (
          <div key={i}>{placed ? line.split("●").map((part, j, arr) => (
            <span key={j}><span className="ghost">{part}</span>{j < arr.length - 1 && <span className="hvi-cube-dot">●</span>}</span>
          )) : <span className="ghost">{line.replace("●", "·")}</span>}</div>
        ))}
        <div className="muted">{edge("DISMISSED", "TRUSTED RESERVE")}</div>
        <div className="muted">{edge("", "WARMTH →")}</div>
      </div>
      <div className="hvi-cube-nums">WARMTH {q.warmth} · COMPETENCE {q.competence}</div>
      <div className="hvi-case-note">Warmth: can you be trusted. Competence: can you get it done. The machine weights competence {Math.round(q.realityIndex * 100)}, warmth {100 - Math.round(q.realityIndex * 100)}. Niceness is not rewarded. Contribution that others witness is.</div>
      <div className="hvi-case-note" style={{ marginTop: 6 }}>{JUDGE_LINES[q.judge] || q.judge}</div>
    </TermBox>
  );
}
