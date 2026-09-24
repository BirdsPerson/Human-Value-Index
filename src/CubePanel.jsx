import { TermBox } from "./term.jsx";
import { cube as computeCube, judged, gapLine, QUADRANT_LINES, JUDGE_LINES, REALITY_INDEX } from "./cube.js";

// The machine's view of a subject on warmth x competence, drawn as a text-mode plot.
// Takes the server's cube fields when present, otherwise derives them from a breakdown.
const COLS = 31, ROWS = 11, MIDC = 15, MIDR = 5;

const colOf = v => Math.max(0, Math.min(COLS - 1, Math.round((v / 100) * (COLS - 1))));
// M (●) is the machine: warmth as conduct. P (○) is the people: likability. Both share the
// machine's competence, so the gap between them is a horizontal run of ╌.
export function plotRows(warmth, competence, likability = null) {
  const col = colOf(warmth), pcol = likability == null ? null : colOf(likability);
  const row = Math.max(0, Math.min(ROWS - 1, Math.round(((100 - competence) / 100) * (ROWS - 1))));
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    let line = "";
    for (let c = 0; c < COLS; c++) {
      const between = pcol != null && r === row && c > Math.min(col, pcol) && c < Math.max(col, pcol);
      line += r === row && c === col ? "●"
        : r === row && c === pcol ? "○"
        : between ? "╌"
        : r === MIDR && c === MIDC ? "┼"
        : r === MIDR ? "─"
        : c === MIDC ? "│"
        : "·";
    }
    rows.push(line);
  }
  return rows;
}

const MARK = { "●": "hvi-cube-dot", "○": "hvi-cube-dot hvi-cube-people", "╌": "hvi-cube-link" };
function PlotLine({ line }) {
  const out = []; let buf = "";
  for (const ch of line) {
    if (MARK[ch]) { if (buf) out.push(<span key={out.length} className="ghost">{buf}</span>); buf = ""; out.push(<span key={out.length} className={MARK[ch]}>{ch}</span>); }
    else buf += ch;
  }
  if (buf) out.push(<span key={out.length} className="ghost">{buf}</span>);
  return <div>{out}</div>;
}

const edge = (l, r) => l + " ".repeat(Math.max(1, COLS - l.length - r.length)) + r;

export function cubeOf(s) {
  let q = null;
  if (s && typeof s.warmth === "number" && typeof s.competence === "number" && s.quadrant) {
    q = { warmth: s.warmth, competence: s.competence, quadrant: s.quadrant, judge: s.judge || "UNRATIFIED", realityIndex: s.realityIndex ?? REALITY_INDEX };
  } else if (s?.breakdown) q = computeCube(s.breakdown);
  if (!q) return null;
  // A server-judged card already carries people; a static figure carries raw people data.
  const people = s.people && typeof s.people.likability === "number" ? s.people : null;
  return judged(q, people);
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
  const p = q.people;
  const rows = plotRows(q.warmth, q.competence, p ? p.likability : null);
  return (
    <TermBox title={title} right={p ? "MACHINE ● PEOPLE ○" : "MACHINE VIEW"}>
      <div className="hvi-rows hvi-cube" role="img"
        aria-label={`Machine placement: warmth (conduct) ${q.warmth}, competence ${q.competence}, quadrant ${q.quadrant}, ${q.judge}.${p ? ` People: likability ${p.likability}, ${p.quadrant}, gap ${p.gap}.` : " People: not yet rated."}`}>
        <div className="muted">COMPETENCE ↑</div>
        <div className="muted">{edge("ENVIED", "ADMIRED")}</div>
        {rows.map((line, i) => (placed ? <PlotLine key={i} line={line} />
          : <div key={i}><span className="ghost">{line.replace(/[●○╌]/g, "·")}</span></div>))}
        <div className="muted">{edge("DISMISSED", "TRUSTED RESERVE")}</div>
        <div className="muted">{edge("", p ? "● CONDUCT ○ LIKABILITY →" : "WARMTH →")}</div>
      </div>
      <div className="hvi-cube-nums">● MACHINE: WARMTH (CONDUCT) {q.warmth} · COMPETENCE {q.competence}</div>
      {p ? (<>
        <div className="hvi-cube-nums">○ PEOPLE: LIKABILITY {p.likability} · {p.quadrant} · GAP {p.gap > 0 ? "+" : ""}{p.gap}</div>
        <div className="hvi-case-note">{gapLine(p.gap)}</div>
        <div className="hvi-case-note ghost">Source: {p.source}{p.fame != null ? `, ${p.fame}% have heard of them, ${p.liked}% like, ${p.disliked}% dislike` : ""}{p.asOf ? ` (as of ${p.asOf})` : ""}.</div>
      </>) : (
        <div className="hvi-case-note ghost">○ PEOPLE: NOT YET RATED.</div>
      )}
      <div className="hvi-case-note">Warmth: can you be trusted. Competence: can you get it done. The machine weights competence {Math.round(q.realityIndex * 100)}, warmth {100 - Math.round(q.realityIndex * 100)}. Niceness is not rewarded. Contribution that others witness is.</div>
      <div className="hvi-case-note" style={{ marginTop: 6 }}>{JUDGE_LINES[q.judge] || q.judge}</div>
    </TermBox>
  );
}
