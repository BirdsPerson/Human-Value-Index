import { useEffect, useMemo, useState } from "react";
import { TermBox } from "./term.jsx";
import Cube3D from "./Cube3D.jsx";
import { OctantLegend } from "./CubePanel.jsx";
import { pointOf, FILTERS, passes } from "./cube3d.js";
import { OCTANT_ORDER, OCTANT_FAMILY } from "./cube.js";
import { FAMOUS_FIGURES } from "./figures.js";
import { readLastResult } from "./Intake.jsx";

// THE CUBE: every file on record as one point in conduct × competence × likability.
// Three midplanes at 50 cut the cube into eight octants. Figures from the roster,
// referrals from /api/pen, and the viewer's own file when this browser holds one.
export default function CubeView() {
  const [referred, setReferred] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    let off = false;
    fetch("/api/pen").then(r => (r.ok ? r.json() : null)).then(d => {
      if (off || !d) return;
      setReferred((d.subjects || []).filter(s => s && s.kind === "figure" && s.referred && s.name));
    }).catch(() => {});
    return () => { off = true; };
  }, []);

  const all = useMemo(() => {
    const seen = new Set(), out = [];
    for (const s of [...FAMOUS_FIGURES, ...referred]) {
      if (seen.has(s.name)) continue;
      const g = pointOf(s);
      if (g) { seen.add(s.name); out.push(g); }
    }
    const mine = readLastResult();
    const g = mine && pointOf({ ...mine, name: "YOU" });
    if (g) out.push(g);
    return out;
  }, [referred]);

  const shown = all.filter(g => passes(g, filter));
  const q = query.trim().toLowerCase();
  const match = q ? all.find(g => g.name.toLowerCase().includes(q)) : null;
  const highlight = match ? match.name : picked;
  const count = f => all.filter(g => passes(g, f)).length;
  const rated = all.filter(g => g.rated).length;

  return (
    <div className="hvi-cubeview">
      <TermBox title="THE CUBE" right={`${shown.length} OF ${all.length} FILES`}>
        <div className="hvi-case-note" style={{ marginBottom: "0.8em" }}>
          Three axes through one centre: CONDUCT (the machine), COMPETENCE (the machine), LIKABILITY (the people).
          The planes at 50 cut the cube into eight octants. Hollow points: the people have not been asked. Drag to rotate.
        </div>
        <div className="hvi-cmds" role="group" aria-label="Filter by octant" style={{ marginBottom: "0.6em", flexWrap: "wrap" }}>
          {FILTERS.map(f => (
            <button key={f} className={`hvi-cmd${filter === f ? " on" : ""}${OCTANT_FAMILY[f] ? ` oct-${OCTANT_FAMILY[f]}` : ""}`}
              aria-pressed={filter === f} onClick={() => setFilter(f)}>[{f}{f === "ALL" ? "" : ` ${count(f)}`}]</button>
          ))}
        </div>
        <div className="hvi-input-row" style={{ marginBottom: "0.8em" }}>
          <label className="p" htmlFor="cube-search">FIND &gt; </label>
          <input id="cube-search" className="hvi-textarea" style={{ minHeight: 0, resize: "none" }} value={query}
            onChange={e => setQuery(e.target.value)} placeholder="a name on record" autoComplete="off" list="cube-names" />
          <datalist id="cube-names">{all.map(g => <option key={g.name} value={g.name} />)}</datalist>
        </div>
        {q && !match && <div className="hvi-case-note">No such file. The Department does not invent subjects.</div>}
        <Cube3D points={shown} highlight={highlight} height={640}
          onHover={g => setPicked(g ? g.name : null)}
          label={`Octant cube with ${shown.length} files. ${OCTANT_ORDER.map(o => `${o} ${count(o)}`).join(", ")}; ${count("UNRATED")} unrated. Use the list below for details.`} />
        <OctantLegend />
        <div className="hvi-case-note ghost" style={{ marginTop: "0.6em" }}>
          {rated} PLACED IN AN OCTANT · {all.length - rated} NOT YET ASKED OF THE PEOPLE
        </div>
      </TermBox>

      <details style={{ marginTop: "1em" }}>
        <summary className="hvi-cmd">[+] LIST VIEW // KEYBOARD ACCESS</summary>
        <div className="hvi-rows" style={{ marginTop: "0.6em" }}>
          {[...shown].sort((a, b) => (OCTANT_ORDER.indexOf(a.octant) + 99 * !a.rated) - (OCTANT_ORDER.indexOf(b.octant) + 99 * !b.rated) || a.name.localeCompare(b.name)).map(g => (
            <div key={g.name}>
              {g.name.toUpperCase()} · {g.rated ? g.octant : `${g.q.quadrant} (LIKABILITY UNRATED)`} · CONDUCT {g.q.warmth} · COMPETENCE {g.q.competence} · LIKABILITY {g.rated ? g.q.people.likability : "—"}
              {g.rated ? ` · GAP ${g.gap > 0 ? "+" : ""}${g.gap} · ${g.judge}` : ""}
            </div>
          ))}
        </div>
      </details>

      <div className="hvi-cmds split" style={{ marginTop: "1.6em" }}>
        <button className="hvi-btn-back" onClick={() => { window.location.hash = ""; }}>Main menu</button>
        <button className="hvi-btn-secondary" onClick={() => { window.location.hash = "#pen"; }}>Holding pen</button>
      </div>
    </div>
  );
}
