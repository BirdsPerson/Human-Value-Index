import { forwardRef } from "react";
import { Typed } from "../term.jsx";
import { displayName, getTier } from "../figures.js";

export const FONT = "'Fira Mono', ui-monospace, Menlo, monospace";

const css = `
  .hvi-city-head { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 0 2ch; color: var(--text-muted); font-size: 12px; margin-bottom: 0.3em; }
  .hvi-city-clock { color: var(--green); font-weight: 700; letter-spacing: 0.04em; }
  .hvi-city-pa { display: flex; gap: 1ch; align-items: baseline; padding: 0.3em 1ch; color: var(--text-dim); min-height: 2.2em; font-size: 12px; }
  .hvi-city-pa .tag { color: var(--green); flex: none; white-space: pre; }
  .hvi-city-stage { position: relative; background: #060a06; overflow: hidden; }
  .hvi-city-canvas { display: block; width: 100%; touch-action: none; cursor: grab; }
  .hvi-city-canvas.pan { cursor: grabbing; }
  .hvi-city-canvas.point { cursor: pointer; }
  .hvi-district-canvas { display: block; width: 100%; touch-action: pan-y; }
  .hvi-district-canvas.point { cursor: pointer; }
  .hvi-city-zoom { position: absolute; right: 6px; bottom: 6px; display: flex; gap: 2px; z-index: 2; }
  .hvi-city-zoom .hvi-cmd:not(:hover):not(:focus-visible) { background: #060a06; }
  .hvi-city-zoom .hvi-cmd { padding: 0 0.6ch; font-size: 12px; }
  @media (max-width: 600px) { .hvi-city-zoom { position: static; justify-content: flex-end; padding: 4px 6px; } }
  .hvi-city-tip { position: absolute; left: 0; top: 0; z-index: 3; max-width: min(34ch, 80%); text-align: left; font: inherit; font-size: 11px; line-height: 1.35;
    background: #0a0f0a; color: var(--text-dim); border: 0; padding: 0.35em 0.8ch; cursor: pointer; white-space: normal; pointer-events: auto;
    box-shadow: 0 0 0 1px var(--green-dim, #22c55e); will-change: transform; visibility: hidden; }
  .hvi-city-tip .n { color: var(--text); font-weight: 700; display: block; }
  .hvi-city-tip .t { display: block; }
  .hvi-city-tip .j { color: var(--green); display: block; }
  .hvi-city-tip .a { color: var(--amber); display: block; }
  .hvi-city-tip .o { color: var(--text-ghost); display: block; }
  .hvi-city-tip:hover .o, .hvi-city-tip:focus-visible .o { color: var(--green); }
  .hvi-city-help { color: var(--text-ghost); font-size: 12px; margin: 0.4em 0 1.2em; }
  .hvi-city-list { columns: 2 30ch; column-gap: 3ch; margin: 0.4em 0 1em; }
  .hvi-city-list > [role="listitem"] { break-inside: avoid; }
  .hvi-city-list .hvi-row-btn .tag { color: var(--text-ghost); }
  .hvi-city-rooms summary { color: var(--text-muted); cursor: pointer; padding: 0.3em 0; list-style: none; }
  .hvi-city-rooms summary::-webkit-details-marker { display: none; }
  .hvi-city-rooms summary::before { content: "[+] "; color: var(--green); }
  .hvi-city-rooms[open] summary::before { content: "[-] "; }
  .hvi-city-rooms summary:focus-visible { background: var(--green); color: var(--bg); outline: none; }
  .hvi-city-rooms .hvi-row-btn .name { flex: none; max-width: 60%; overflow: hidden; text-overflow: ellipsis; }
  .hvi-city-rooms .hvi-row-btn .tag { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .hvi-city-room-h { color: var(--text-muted); margin: 0.8em 0 0.2em; }
`;
export function injectCityStyles() {
  let el = document.getElementById("hvi-city-styles");
  if (!el) { el = document.createElement("style"); el.id = "hvi-city-styles"; document.head.appendChild(el); }
  if (el.textContent !== css) el.textContent = css;
}

// The machine clock, the census line, and the PA underneath.
export function CityHeader({ clockText, right, pa }) {
  return (
    <>
      <div className="hvi-city-head">
        <span className="hvi-city-clock" aria-live="off">{clockText}</span>
        <span>{right}</span>
      </div>
      <div className="hvi-city-pa" aria-hidden="true">
        <span className="tag">PA&gt;</span><Typed key={pa} as="span" text={pa} cps={45} />
      </div>
    </>
  );
}

// The subject tooltip. Positioned by the canvas loop (style.transform), filled by React.
export const SubjectTip = forwardRef(function SubjectTip({ tip, onOpen }, ref) {
  const s = tip?.s;
  return (
    <button ref={ref} type="button" className="hvi-city-tip" tabIndex={s ? 0 : -1} aria-hidden={s ? undefined : "true"}
      onClick={(e) => { e.stopPropagation(); if (s) onOpen(s); }}
      onPointerDown={(e) => e.stopPropagation()}>
      {s && (
        <>
          <span className="n">{displayName(s).toUpperCase()}{s.you ? " (YOU)" : ""}</span>
          <span className="t" style={{ color: getTier(s.score).color }}>TIER: {getTier(s.score).label}</span>
          <span className="j">{tip.job}</span>
          <span className="a">{tip.act}</span>
          <span className="o">[ OPEN FILE ]</span>
        </>
      )}
    </button>
  );
});
