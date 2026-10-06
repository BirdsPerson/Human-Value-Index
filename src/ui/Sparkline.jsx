// A file's MOVEMENT LOG beside its name in a list: a 60x14 inline SVG, a crisp 1px line (or
// `bars`), the last point a 2px dot coloured by direction. One point on file: a flat dash and
// NEW. Fixed size (contain: strict), no animation, hidden under 360px. Generic: give it a
// subject (`s`, any list's record) or a `series` of scores. src/ui/spark.js has the data.
import { memo } from "react";
import { FAMOUS_FIGURES, slugify } from "../figures.js";
import { readLastResult } from "../caseFile.jsx";
import { decodeSeries, seriesOfLog, sparkDir, sparkGeom, sparkLabel } from "./spark.js";

let bundled = null;   // the figures on file carry their whole log in the bundle
const bundledLog = (key) => {
  if (!bundled) { bundled = new Map(); for (const f of FAMOUS_FIGURES) { bundled.set(slugify(f.name), f); bundled.set(f.name, f); } }
  return bundled.get(key) || null;
};

// Any list's record -> scores (oldest first) | null (nothing to show: a stranger's citizen
// file, whose movement is theirs alone). Order: the census row's hx, a log already in hand,
// your own file's history, the figures on file by slug or name.
export function seriesOf(s) {
  if (!s) return null;
  const score = typeof s.score === "number" ? s.score : null;
  if (s.hx && score != null) return decodeSeries(s.hx, score);
  if (Array.isArray(s.scoreHistory) && s.scoreHistory.length) return seriesOfLog(s.scoreHistory, score);
  if (s.you || s.self) {
    const last = Array.isArray(s.history) ? null : readLastResult();
    const p = seriesOfLog(s.history || last?.history, score ?? last?.score);
    return p.length ? p : null;
  }
  const f = bundledLog(s.slug || s.key) || bundledLog(s.name);
  if (f) return seriesOfLog(f.scoreHistory, f.score);
  if (s.kind === "citizen" || s.citizen) return null;
  return score != null ? [score] : null;
}

export const sparkLabelOf = (s) => { const p = seriesOf(s); return p ? sparkLabel(p) : ""; };

function Sparkline({ s, series, bars = false, w = 60, h = 14, className }) {
  const p = series || seriesOf(s);
  if (!p || !p.length) return null;
  const label = sparkLabel(p);
  const dir = sparkDir(p);
  const g = sparkGeom(p, w, h);
  const end = g.pts[g.pts.length - 1];
  const fresh = p.length === 1;
  return (
    <span className={`ui-spark${fresh ? " new" : dir > 0 ? " up" : dir < 0 ? " dn" : " flat"}${className ? " " + className : ""}`}
      role="img" aria-label={label} title={label.replace(/^score history/, "SCORE HISTORY").toUpperCase()} style={{ width: w, height: h }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false" shapeRendering="crispEdges">
        {fresh ? <>
          <rect x={2} y={end[1]} width={14} height={1} className="ln-f" />
          <text x={20} y={h - 3} className="nw">NEW</text>
        </> : bars ? g.bars.map((b, i) => <rect key={i} x={b.x} y={b.y} width={b.w} height={Math.max(1, b.h)} className={i === g.bars.length - 1 ? "pt" : "br"} />)
          : <>
            <polyline points={g.pts.map(([x, y]) => `${x + 0.5},${y + 0.5}`).join(" ")} className="ln" />
            <rect x={end[0]} y={end[1]} width={2} height={2} className="pt" />
          </>}
      </svg>
    </span>
  );
}
export default memo(Sparkline);
