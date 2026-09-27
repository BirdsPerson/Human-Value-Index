import { useEffect, useMemo, useState } from "react";
import { Frame, Chip, ChipStrip, TextField, Disclosure, ListRow } from "./ui";
import Cube3D from "./Cube3D.jsx";
import { OctantLegend } from "./CubePanel.jsx";
import { pointOf, FILTERS, passes } from "./cube3d.js";
import { OCTANT_ORDER, OCTANT_FAMILY, OCTANT_LINES } from "./cube.js";
import { FAMOUS_FIGURES } from "./figures.js";
import { readLastResult } from "./caseFile.jsx";

// THE CUBE: every file on record as one point in conduct × competence × likability.
// Three midplanes at 50 cut the cube into eight octants. Figures from the roster,
// referrals from /api/pen, and the viewer's own file when this browser holds one.
const CUBE_CSS = `
  .hvi-cube-intro { color: var(--fg-dim); font-size: var(--t-s); margin: 0 0 var(--s2); max-width: 72ch; }
  .hvi-cube-intro b { color: var(--fg); font-weight: 500; }
  .hvi-cubeview .ui-chip .n { opacity: 0.75; }
  .hvi-cubeview > .ui-field { margin: 0 0 var(--s5); }
  .hvi-cube-display .hvi-cube-legend { margin-top: var(--s3); }
  .hvi-cube-foot { color: var(--fg-mute); font-size: var(--t-xs); margin-top: var(--s2); }
  .hvi-cube-line-note { color: var(--fg-mute); }
  .hvi-cubeview .ui-disc { margin-bottom: var(--s5); }
  .hvi-cubeview .ui-row .tag { color: inherit; }
`;
function injectCubeStyles() {
  let el = document.getElementById("hvi-cube-styles");
  if (!el) { el = document.createElement("style"); el.id = "hvi-cube-styles"; document.head.appendChild(el); }
  if (el.textContent !== CUBE_CSS) el.textContent = CUBE_CSS;
}

export default function CubeView() {
  useEffect(() => { injectCubeStyles(); }, []);
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

  const [fileTick, setFileTick] = useState(0);
  useEffect(() => { const on = () => setFileTick(t => t + 1); window.addEventListener("hvi-file", on); return () => window.removeEventListener("hvi-file", on); }, []);
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
  }, [referred, fileTick]);

  const shown = all.filter(g => passes(g, filter));
  const q = query.trim().toLowerCase();
  const match = q ? all.find(g => g.name.toLowerCase().includes(q)) : null;
  const highlight = match ? match.name : picked;
  const count = f => all.filter(g => passes(g, f)).length;
  const rated = all.filter(g => g.rated).length;
  const ordered = [...shown].sort((a, b) => (OCTANT_ORDER.indexOf(a.octant) + 99 * !a.rated) - (OCTANT_ORDER.indexOf(b.octant) + 99 * !b.rated) || a.name.localeCompare(b.name));
  const fam = f => (f === "UNRATED" ? "mute" : FAMILY_TONE[OCTANT_FAMILY[f]]);

  return (
    <div className="hvi-cubeview">
      <p className="hvi-cube-intro">
        Three axes through one centre: <b>conduct</b> and <b>competence</b> (the machine), <b>likability</b> (the people).
        The planes at 50 cut the cube into eight octants. Hollow points: the people have not been asked.
      </p>
      <ChipStrip label="Filter by octant">
        {FILTERS.map(f => (
          <Chip key={f} tone={fam(f)} pressed={filter === f} onClick={() => setFilter(f)}>
            {f}{f === "ALL" ? "" : <span className="n">{"\u00a0"}{count(f)}</span>}
          </Chip>
        ))}
      </ChipStrip>
      <TextField id="cube-search" label="FIND" value={query} onChange={e => setQuery(e.target.value)}
        placeholder="a name on record" list="cube-names" spellCheck="false" enterKeyHint="search"
        message={q && !match ? "No such file. The Department does not invent subjects." : undefined} error={!!(q && !match)} />
      <datalist id="cube-names">{all.map(g => <option key={g.name} value={g.name} />)}</datalist>
      {/* The cube is one of the app's two live displays (with the pen): box-drawn. */}
      <Frame box title="THE CUBE" meta={`${shown.length} OF ${all.length} FILES`} bodyClass="hvi-cube-display">
        <Cube3D points={shown} highlight={highlight} height={640}
          onHover={g => setPicked(g ? g.name : null)}
          label={`Octant cube with ${shown.length} files. ${OCTANT_ORDER.map(o => `${o} ${count(o)}`).join(", ")}; ${count("UNRATED")} unrated. Use the list below for details.`} />
        <OctantLegend />
        <div className="hvi-cube-foot">
          {rated} PLACED IN AN OCTANT · {all.length - rated} NOT YET ASKED OF THE PEOPLE
        </div>
      </Frame>

      <Disclosure title="LIST VIEW" meta={`${shown.length} FILES`}>
        <div role="list" aria-label="Files in the cube">
          {ordered.map(g => {
            const tone = g.rated ? FAMILY_TONE[g.family] || "mute" : "mute";
            return (
              <div role="listitem" key={g.name}>
                <ListRow label={g.name} tag={g.rated ? g.octant : "UNRATED"} tone={tone}
                  expanded={picked === g.name} onExpand={open => setPicked(open ? g.name : null)}>
                  CONDUCT {g.q.warmth} · COMPETENCE {g.q.competence} · LIKABILITY {g.rated ? g.q.people.likability : "UNRATED"}
                  <br />{g.rated ? `${g.octant} · GAP ${g.gap > 0 ? "+" : ""}${g.gap} · ${g.judge}` : `${g.q.quadrant} (LIKABILITY UNRATED)`}
                  {g.rated && OCTANT_LINES[g.octant] ? <><br /><span className="hvi-cube-line-note">{OCTANT_LINES[g.octant]}</span></> : null}
                </ListRow>
              </div>
            );
          })}
        </div>
      </Disclosure>
    </div>
  );
}

const FAMILY_TONE = { good: "accent", charm: "warn", harm: "harm", dim: "mute" };
