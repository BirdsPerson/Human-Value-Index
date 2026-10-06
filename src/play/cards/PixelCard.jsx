import { memo } from "react";
import { CW, CH, cardLayers, backLayers, svgPaths } from "./art.js";
import { nameOfCode } from "./deck.js";

// One pixel card (art.js) as an SVG, crisp at any size: scale = CSS px per card pixel.
// code: "Qs" | null/"??" (face down). As a button when onClick is given (its name: "Queen of spades").
// four: the four-colour deck. back: "dept" | "eb". big: the big-index face (small cards).
const paths = new Map();
function pathsFor(code, four, big, back) {
  const k = `${code}|${four}|${big}|${back}`;
  if (!paths.has(k)) paths.set(k, svgPaths(code && code !== "??" ? cardLayers(code, { four, big }) : backLayers(back)));
  return paths.get(k);
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function PixelCard({ code, scale = 2, four = false, big = false, back = "dept", onClick, selected = false, dim = false, label, className = "", style, tabIndex, onKeyDown, ...rest }) {
  const face = code && code !== "??";
  const name = label || (face ? cap(nameOfCode(code)) : "Face-down card");
  const svg = (
    <svg className="pc-svg" viewBox={`0 0 ${CW} ${CH}`} width={CW * scale} height={CH * scale} shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      {pathsFor(face ? code : null, four, big, back).map(p => <path key={p.fill} d={p.d} fill={p.fill} />)}
    </svg>
  );
  const cls = `pc${selected ? " sel" : ""}${dim ? " dim" : ""}${onClick ? " tap" : ""} ${className}`.trim();
  if (onClick) return <button type="button" className={cls} style={style} onClick={onClick} aria-label={name} aria-pressed={selected || undefined} tabIndex={tabIndex} onKeyDown={onKeyDown} {...rest}>{svg}</button>;
  return <span className={cls} style={style} role="img" aria-label={name} {...rest}>{svg}</span>;
}
export default memo(PixelCard);
export { CW, CH };
