import { useEffect, useMemo, useState } from "react";
import { TermBox } from "./term.jsx";
import Cube3D from "./Cube3D.jsx";
import { segmentOf, FILTERS, passes } from "./cube3d.js";
import { FAMOUS_FIGURES } from "./figures.js";
import { readLastResult } from "./Intake.jsx";

// THE CUBE: every file on record as a segment from the Machine's verdict (front face)
// to the People's (back face). Figures from the roster, referrals from /api/pen, and
// the viewer's own file when this browser holds one.
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
      const g = segmentOf(s);
      if (g) { seen.add(s.name); out.push(g); }
    }
    const mine = readLastResult();
    const g = mine && segmentOf({ ...mine, name: "YOU" });
    if (g) out.push(g);
    return out;
  }, [referred]);

  const shown = all.filter(g => passes(g, filter));
  const q = query.trim().toLowerCase();
  const match = q ? all.find(g => g.name.toLowerCase().includes(q)) : null;
  const highlight = match ? match.name : picked;
  const counts = {
    contested: all.filter(g => g.judge === "CONTESTED").length,
    ratified: all.filter(g => g.judge === "RATIFIED").length,
  };

  return (
    <div className="hvi-cubeview">
      <TermBox title="THE CUBE" right={`${shown.length} OF ${all.length} FILES`}>
        <div className="hvi-case-note" style={{ marginBottom: "0.8em" }}>
          Front face: the Machine's verdict on conduct. Back face: the People's regard. The line between them is the gap.
          Green lines: the judges agree. Amber: they do not. Dim: the People have not been asked. Drag to rotate.
        </div>
        <div className="hvi-cmds" role="group" aria-label="Filter files" style={{ marginBottom: "0.6em" }}>
          {FILTERS.map(f => (
            <button key={f} className={`hvi-cmd${filter === f ? " on" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>[{f}]</button>
          ))}
        </div>
        <div className="hvi-input-row" style={{ marginBottom: "0.8em" }}>
          <label className="p" htmlFor="cube-search">FIND &gt; </label>
          <input id="cube-search" className="hvi-textarea" style={{ minHeight: 0, resize: "none" }} value={query}
            onChange={e => setQuery(e.target.value)} placeholder="a name on record" autoComplete="off" list="cube-names" />
          <datalist id="cube-names">{all.map(g => <option key={g.name} value={g.name} />)}</datalist>
        </div>
        {q && !match && <div className="hvi-case-note">No such file. The Department does not invent subjects.</div>}
        <Cube3D segments={shown} highlight={highlight} height={620}
          onHover={g => setPicked(g ? g.name : null)}
          label={`Two-judge cube with ${shown.length} files. ${counts.ratified} ratified, ${counts.contested} contested. Use the list below for details.`} />
        <div className="hvi-case-note ghost" style={{ marginTop: "0.6em" }}>
          {counts.ratified} RATIFIED · {counts.contested} CONTESTED · {all.length - counts.ratified - counts.contested} NOT YET ASKED OF THE PEOPLE
        </div>
      </TermBox>

      <details style={{ marginTop: "1em" }}>
        <summary className="hvi-cmd">[+] LIST VIEW // KEYBOARD ACCESS</summary>
        <div className="hvi-rows" style={{ marginTop: "0.6em" }}>
          {[...shown].sort((a, b) => (b.q.people ? b.q.people.gap : -999) - (a.q.people ? a.q.people.gap : -999)).map(g => (
            <div key={g.name}>
              {g.name.toUpperCase()} · M {g.q.warmth}/{g.q.competence} {g.q.quadrant}
              {g.q.people ? ` · P ${g.q.people.likability} ${g.q.people.quadrant} · GAP ${g.q.people.gap > 0 ? "+" : ""}${g.q.people.gap}` : " · P NOT YET RATED"} · {g.judge}
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
