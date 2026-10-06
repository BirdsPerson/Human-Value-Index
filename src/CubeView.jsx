import { useEffect, useMemo, useState } from "react";
import { Frame, Chip, ChipStrip, TextField, Disclosure, ListRow, ScreenHead } from "./ui";
import Cube3D from "./Cube3D.jsx";
import { CubrantLegend } from "./CubePanel.jsx";
import { pointOf, FILTERS, passes } from "./cube3d.js";
import { CUBRANT_ORDER, CUBRANT_FAMILY, CUBRANT_LINES, CENTRE } from "./cube.js";
import { FAMOUS_FIGURES, slugify } from "./figures.js";
import { withCrowd } from "./petition.js";
import { loadCrowd } from "./petitionClient.js";
import { readLastResult } from "./caseFile.jsx";
import { fetchPen } from "./penClient.js";

// THE CUBE: every file on record as one point in conduct × competence × scarcity, the
// machine's three axes. Three planes at the roster's centres cut the cube into eight cubrants.
// Figures from the roster, referrals from /api/pen, and the viewer's own file when this browser
// holds one. The People's judge (likability) is a verdict on the placement, printed on the file.
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
  .hvi-cube-centre { color: var(--fg-mute); font-size: var(--t-xs); }
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
  // The People's Petition enriches the roster's likability (referrals arrive blended from /api/pen).
  const [crowd, setCrowd] = useState(null);
  useEffect(() => { let off = false; loadCrowd().then(c => { if (!off) setCrowd(c); }); return () => { off = true; }; }, []);

  useEffect(() => {
    let off = false;
    fetchPen({ fields: "cube", kind: "figure" }).then(list => {
      if (off) return;
      setReferred(list.filter(s => s && s.kind === "figure" && s.referred && s.name));
    }).catch(() => {});
    return () => { off = true; };
  }, []);

  const [fileTick, setFileTick] = useState(0);
  useEffect(() => { const on = () => setFileTick(t => t + 1); window.addEventListener("hvi-file", on); return () => window.removeEventListener("hvi-file", on); }, []);
  const all = useMemo(() => {
    const seen = new Set(), out = [];
    const roster = crowd ? FAMOUS_FIGURES.map(f => withCrowd({ ...f, slug: slugify(f.name) }, crowd)) : FAMOUS_FIGURES;
    for (const s of [...roster, ...referred]) {
      if (seen.has(s.name)) continue;
      const g = pointOf(s);
      if (g) { seen.add(s.name); out.push(g); }
    }
    const mine = readLastResult();
    const g = mine && pointOf({ ...mine, name: "YOU" });
    if (g) out.push(g);
    return out;
  }, [referred, fileTick, crowd]);

  const shown = all.filter(g => passes(g, filter));
  const q = query.trim().toLowerCase();
  const match = q ? all.find(g => g.name.toLowerCase().includes(q)) : null;
  const highlight = match ? match.name : picked;
  const count = f => all.filter(g => passes(g, f)).length;
  const placed = all.filter(g => g.placed).length;
  const ordered = [...shown].sort((a, b) => (CUBRANT_ORDER.indexOf(a.cubrant) + 99 * !a.placed) - (CUBRANT_ORDER.indexOf(b.cubrant) + 99 * !b.placed) || a.name.localeCompare(b.name));
  const fam = f => (f === "PENDING" ? "mute" : FAMILY_TONE[CUBRANT_FAMILY[f]]);

  return (
    <div className="hvi-cubeview">
      <ScreenHead title="THE CUBE" meta={`THREE AXES, EIGHT CUBRANTS // ${all.length} FILES // ${placed} PLACED`} />
      <p className="hvi-cube-intro">
        Three axes through one centre, all the machine's: <b>conduct</b>, <b>competence</b> and <b>scarcity</b> (how hard you are to replace).
        The planes sit at the file's middle ({CENTRE.conduct} · {CENTRE.competence} · {CENTRE.scarcity}) and cut the cube into eight cubrants. Hollow points: the third axis is not yet on file.
      </p>
      <ChipStrip label="Filter by cubrant">
        {FILTERS.map(f => (
          <Chip key={f} tone={fam(f)} pressed={filter === f} onClick={() => setFilter(f)}>
            {f}{f === "ALL" ? "" : <span className="n">{" "}{count(f)}</span>}
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
          label={`Cubrant cube with ${shown.length} files. ${CUBRANT_ORDER.map(o => `${o} ${count(o)}`).join(", ")}; ${count("PENDING")} pending. Use the list below for details.`} />
        <CubrantLegend />
        <div className="hvi-cube-foot">
          {placed} PLACED IN A CUBRANT · {all.length - placed} PENDING THE THIRD AXIS · CENTRES {CENTRE.conduct} / {CENTRE.competence} / {CENTRE.scarcity} (THE FILE'S MEDIANS, METHOD V4)
        </div>
      </Frame>

      <Disclosure title="LIST VIEW" meta={`${shown.length} FILES`}>
        <div role="list" aria-label="Files in the cube">
          {ordered.map(g => {
            const tone = g.placed ? FAMILY_TONE[g.family] || "mute" : "mute";
            return (
              <div role="listitem" key={g.name}>
                <ListRow label={g.name} tag={g.placed ? g.cubrant : "PENDING"} tone={tone}
                  expanded={picked === g.name} onExpand={open => setPicked(open ? g.name : null)}>
                  CONDUCT {g.q.warmth} · COMPETENCE {g.q.competence} · SCARCITY {g.placed ? g.q.scarcity : "PENDING"}
                  <br />{g.placed ? `${g.cubrant}${g.rated ? ` · ${g.judge} · GAP ${g.gap > 0 ? "+" : ""}${g.gap}` : ` · ${g.judge}`}` : "CUBRANT PENDING: THE THIRD AXIS IS READ AT THE NEXT ASSESSMENT."}
                  {g.placed && CUBRANT_LINES[g.cubrant] ? <><br /><span className="hvi-cube-line-note">{CUBRANT_LINES[g.cubrant]}</span></> : null}
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
