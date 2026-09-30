import { forwardRef, memo, useEffect, useRef } from "react";
import { Typed } from "../term.jsx";
import { displayName, getTier } from "../figures.js";
import { SPRITE_W, SPRITE_H } from "../sprites.js";
import { sheetFor } from "./spriteBank.js";
import { jobLine } from "./simApi.js";
import { FAMILY_COLOR } from "./cityKit.js";

export const FONT = "'Fira Mono', ui-monospace, Menlo, monospace";

const css = `
  /* The city. Tokens only (src/ui/tokens.css); components from src/ui. */
  .hvi-city-head { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 0 var(--s4); font-size: var(--t-xs); color: var(--fg-mute); }
  .hvi-city-clock { color: var(--accent); font-weight: 700; letter-spacing: 0.04em; font-size: var(--t-s); }
  .hvi-city-census { min-width: 0; }
  .hvi-city-pa { display: flex; gap: 1ch; align-items: baseline; margin: var(--s1) 0 0; color: var(--fg-dim); min-height: calc(var(--lh) * var(--t-xs)); font-size: var(--t-xs); }
  /* on a phone the PA wraps: hold two lines so the page does not jump as it types */
  @media (max-width: 720px) { .hvi-city-pa { min-height: calc(2 * var(--lh) * var(--t-xs)); } }
  .hvi-city-pa .tag { color: var(--accent); flex: none; white-space: pre; }
  .hvi-city-pa > :last-child { min-width: 0; }
  .hvi-city-note { color: var(--fg-mute); font-size: var(--t-xs); margin: 0 0 var(--s3); }
  .hvi-city-in { padding: var(--s3); }

  /* the civic record (CivicPanel.jsx): mood, team, council seat; the league */
  .hvi-civic { margin: 0 0 var(--s4); }
  .hvi-civic-line { font-size: var(--t-xs); color: var(--fg-dim); margin: var(--s1) 0 var(--s2); }
  .hvi-civic-line b, .hvi-civic-kv b { color: var(--fg); }
  .hvi-civic-kv .warn { color: var(--warn); }
  .hvi-civic-factors { display: flex; flex-wrap: wrap; gap: 0 var(--s3); font-size: var(--t-xs); color: var(--fg-mute); margin: 0 0 var(--s3); }
  .hvi-civic-kv { display: grid; grid-template-columns: 9ch minmax(0, 1fr); gap: var(--s1) var(--s2); font-size: var(--t-xs); }
  .hvi-civic-kv .k { color: var(--fg-mute); letter-spacing: 0.06em; }
  .hvi-civic-kv .v { color: var(--fg-dim); min-width: 0; overflow-wrap: anywhere; }
  .hvi-civic-kv .v.dim { color: var(--fg-mute); }
  .hvi-civic-kv a { color: var(--accent); }
  .hvi-civic-table { font: inherit; font-size: var(--t-xs); color: var(--fg-dim); margin: 0 0 var(--s2); white-space: pre; overflow-x: auto; }
  .hvi-civic-table b { color: var(--accent); font-weight: 700; }
  .hvi-civic-fx { font-size: var(--t-xs); color: var(--fg-dim); padding: 2px 0; }
  .hvi-city-in > .ui-disc { margin: 0; }

  /* FIND: a name in the census, and FIND ME */
  .hvi-city-find { display: flex; align-items: flex-start; gap: var(--s2); margin: var(--s2) 0 0; }
  .hvi-city-find-box { position: relative; flex: 1 1 auto; min-width: 0; display: flex; align-items: flex-start; gap: 1ch; }
  .hvi-city-find-box > .p { flex: none; color: var(--accent); line-height: var(--hit-min); font-size: var(--t-s); white-space: pre; }
  .hvi-city-find .ui-input { font-size: var(--t-m); text-transform: none; }
  .hvi-city-find .ui-input::-webkit-search-cancel-button { filter: hue-rotate(90deg); }
  .hvi-city-find-list { position: absolute; left: 0; right: 0; top: 100%; z-index: 40; margin: 0; padding: 0; list-style: none;
    background: var(--bg); border: var(--bw) solid var(--accent); max-height: min(60vh, 440px); overflow-y: auto; }
  .hvi-city-find-list li { display: flex; align-items: center; gap: var(--s2); min-height: var(--hit); padding: var(--s1) var(--s2); cursor: pointer; border-bottom: var(--bw) solid var(--line); }
  .hvi-city-find-list li:last-child { border-bottom: 0; }
  .hvi-city-find-list li.act { background: var(--accent); color: var(--accent-ink); }
  .hvi-city-find-list li.act .w { color: var(--accent-ink); }
  .hvi-city-find-list li.none { cursor: default; color: var(--fg-mute); font-size: var(--t-xs); }
  .hvi-city-find-list .lead { flex: none; }
  .hvi-city-find-list .hvi-city-thumb { display: block; width: 16px; height: 24px; image-rendering: pixelated; }
  .hvi-city-find-list .txt { display: flex; flex-direction: column; min-width: 0; line-height: 1.3; }
  .hvi-city-find-list .n { text-transform: none; font-size: var(--t-s); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hvi-city-find-list .w { text-transform: uppercase; font-size: var(--t-xs); color: var(--fg-mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hvi-city-findme { flex: none; text-decoration: none; white-space: nowrap; }
  .hvi-city-findme:disabled { color: var(--fg-mute); border-color: var(--line); cursor: default; }
  @media (max-width: 720px) {
    .hvi-city-find { flex-wrap: wrap; }
    .hvi-city-find-box { flex-basis: 100%; }
    .hvi-city-findme { width: 100%; }
  }
  /* the find's status: over the top of the stage, the [x] and FOLLOW keys at its end */
  .hvi-city-found { display: flex; align-items: center; gap: var(--s2); padding: var(--s1) 0 var(--s1) var(--s2); background: var(--bg); border-bottom: var(--bw) solid var(--accent); font-size: var(--t-xs); color: var(--fg); min-height: var(--hit-min); }
  .hvi-city-found .tag { flex: none; color: var(--accent-ink); background: var(--accent); padding: 0 0.6ch; font-weight: 700; }
  .hvi-city-found .l { flex: 1 1 auto; min-width: 0; }
  .hvi-city-found .hvi-city-zb { border-top: 0; border-bottom: 0; border-right: 0; }
  @media (max-width: 720px) { .hvi-city-found .tag { display: none; } }

  /* the bar under the header: where you are, and the view toggle */
  .hvi-city-bar { display: flex; justify-content: space-between; align-items: center; gap: var(--s1) var(--s3); margin: var(--s2) 0 var(--s3); min-width: 0; }
  .hvi-city-bar .ui-chips { margin: 0; flex: none; flex-wrap: nowrap; }
  .hvi-city-crumbs { display: flex; align-items: center; min-width: 0; flex: 1 1 auto; font-size: var(--t-xs); color: var(--fg-mute); white-space: nowrap; }
  .hvi-city-crumbs .p { color: var(--accent); flex: none; margin-right: 0.6ch; }
  .hvi-city-crumbs .c { display: inline-flex; align-items: center; min-width: 0; }
  /* parents shrink first, "you are here" last, so the deepest level stays readable */
  .hvi-city-crumbs .c.root { flex: none; }
  .hvi-city-crumbs .c.up { flex: 0 100 auto; min-width: 5ch; }
  .hvi-city-crumbs .c.here-c { flex: 0 1 auto; }
  .hvi-city-crumbs .sep { flex: none; padding: 0 0.4ch; color: var(--fg-mute); }
  .hvi-city-crumbs button, .hvi-city-crumbs .here { font: inherit; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hvi-city-crumbs button { background: none; border: 0; border-radius: 0; padding: 0 0.3ch; color: var(--fg-dim); cursor: pointer; min-height: var(--hit-min);
    text-transform: uppercase; text-decoration: underline; text-decoration-color: var(--line-hi); text-underline-offset: 4px; }
  .hvi-city-crumbs button:hover { color: var(--fg); text-decoration-color: currentColor; }
  .hvi-city-crumbs .here { color: var(--fg); font-weight: 700; padding: 0 0.3ch; line-height: var(--hit-min); }
  .hvi-city-crumbs .here:focus { outline: var(--focus); outline-offset: -2px; }
  .hvi-city-crumbs .here:focus:not(:focus-visible) { outline: none; }
  @media (max-width: 720px) {
    .hvi-city-crumbs.deep { flex-wrap: wrap; }
    .hvi-city-crumbs.deep .c.here-c { flex: 1 1 100%; order: 2; }
    .hvi-city-crumbs.deep .c.up { min-width: 8ch; }
    .hvi-city-crumbs.deep .here { line-height: var(--lh); padding-bottom: var(--s1); }
    .hvi-city-crumbs.deep .cur { display: none; }
  }
  .hvi-city-crumbs .cur { flex: none; color: var(--accent); animation: hvi-blink 1s steps(1) infinite; }
  @media (prefers-reduced-motion: reduce) { .hvi-city-crumbs .cur { animation: none; } }

  /* the stage: the map, the 3D city, a district's rooms, a building's floors */
  .hvi-city-stage { position: relative; background: #060a06; overflow: hidden; }
  .hvi-city-canvas { display: block; width: 100%; touch-action: none; cursor: grab; }
  .hvi-city-canvas.pan { cursor: grabbing; }
  .hvi-city-canvas.point { cursor: pointer; }
  .hvi-district-canvas { display: block; width: 100%; touch-action: pan-y; }
  .hvi-district-canvas.point { cursor: pointer; }
  .hvi-city-stage canvas:focus-visible { outline: var(--focus); outline-offset: -2px; }
  /* zoom: square 44px keys on the canvas corner; under it on phones, clear of the thumb that scrolls */
  .hvi-city-zoom { position: absolute; right: var(--s2); bottom: var(--s2); display: flex; gap: var(--s1); z-index: 22; }
  .hvi-city-zb { min-width: var(--hit-min); height: var(--hit-min); padding: 0 var(--s2); display: inline-flex; align-items: center; justify-content: center;
    background: var(--bg); color: var(--accent); border: var(--bw) solid var(--line-hi); border-radius: 0; font: inherit; font-size: var(--t-s); font-weight: 700; cursor: pointer; text-transform: uppercase; }
  .hvi-city-zb.txt { font-size: var(--t-xs); }
  .hvi-city-zb svg { display: block; flex: none; }
  .hvi-city-zb:hover { border-color: var(--accent); }
  .hvi-city-zb:active { background: var(--accent); color: var(--accent-ink); }
  .hvi-city-zb:focus-visible { outline-offset: -3px; }
  @media (max-width: 720px) {
    .hvi-city-zoom { position: static; justify-content: flex-end; padding: var(--s2); border-top: var(--bw) solid var(--line); background: var(--bg); }
    /* one line, cut short: a long building name must not wrap and change the stage's height */
    .hvi-city-zoom .hint { margin-right: auto; align-self: center; color: var(--fg-mute); font-size: var(--t-xs); flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  }
  @media (min-width: 721px) { .hvi-city-zoom .hint { display: none; } }

  .hvi-city-tip { position: absolute; left: 0; top: 0; z-index: 23; max-width: min(34ch, 86%); min-height: var(--hit-min); text-align: left; font: inherit; font-size: var(--t-xs); line-height: 1.4;
    background: var(--bg); color: var(--fg-dim); border: 0; border-radius: 0; padding: var(--s1) var(--s2); cursor: pointer; white-space: normal; pointer-events: auto; text-transform: uppercase;
    box-shadow: 0 0 0 1px var(--accent); will-change: transform; visibility: hidden; }
  .hvi-city-tip .n { color: var(--fg); font-weight: 700; display: block; }
  .hvi-city-tip .t { display: block; }
  .hvi-city-tip .j { color: var(--accent); display: block; }
  .hvi-city-tip .a { color: var(--warn); display: block; }
  .hvi-city-tip .o { color: var(--fg-mute); display: block; margin-top: 2px; }
  .hvi-city-tip:hover .o, .hvi-city-tip:focus-visible .o { color: var(--accent); }

  /* the key under the map */
  .hvi-city-key { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s1) var(--s4); margin: var(--s3) 0 var(--s2); font-size: var(--t-xs); color: var(--fg-dim); }
  .hvi-city-key .k { white-space: nowrap; }
  .hvi-city-key .dot { display: inline-block; width: 7px; height: 7px; margin-right: 0.8ch; vertical-align: 1px; background: var(--tone); }
  .hvi-city-key .dot.hollow { background: none; box-shadow: inset 0 0 0 1px var(--tone); }
  .hvi-city-help { color: var(--fg-mute); font-size: var(--t-xs); margin: 0 0 var(--s4); max-width: 80ch; }

  /* directories */
  .hvi-city-list { columns: 2 30ch; column-gap: var(--s5); margin: var(--s2) 0 var(--s4); }
  .hvi-city-list > [role="listitem"] { break-inside: avoid; }
  .hvi-city-list .ui-row .lead, .hvi-city-blist .ui-row .lead, .hvi-city-floors .ui-row .lead { color: var(--fg-mute); white-space: pre; }
  .hvi-city-list .ui-row .over, .hvi-city-floors .ui-row .over { color: var(--harm); }
  .hvi-city-floors .ui-row[aria-expanded="true"] { background: var(--accent); color: var(--accent-ink); }
  .hvi-city-floors .ui-row[aria-expanded="true"] :is(.name, .dots, .val, .lead, .x, .over) { color: var(--accent-ink); }
  .hvi-city-room-h { color: var(--fg-mute); font-size: var(--t-xs); letter-spacing: 0.06em; margin: var(--s4) 0 var(--s1); }
  .hvi-city-room-h:first-child { margin-top: 0; }
  .hvi-city-blist { margin: 0 0 var(--s4); }
  .hvi-city-floors { margin: var(--s4) 0 0; }
  .hvi-city-floors .occ, .hvi-city-floors .sub { padding-left: 2ch; border-left: var(--bw) solid var(--line); margin: var(--s1) 0 var(--s3) 1ch; }
  .hvi-city-stage + .ui-disc, .hvi-city-disc { margin-top: var(--s3); }
  .hvi-city-disc + .ui-disc { margin-top: 0; }
  .hvi-city-dir { margin-top: var(--s5); }
  /* the command bar has MENU on phones */
  @media (max-width: 720px) { .hvi-city-menu-back { display: none; } }

  /* a person in a list: sprite, name, assignment */
  .hvi-city-occ { align-items: center; }
  .hvi-city-occ .hvi-city-thumb { flex: none; width: 16px; height: 24px; image-rendering: pixelated; }
  .hvi-city-occ .txt { display: flex; flex: 1 1 auto; min-width: 0; gap: 1ch; align-items: baseline; overflow: hidden; }
  .hvi-city-occ .name { text-transform: none; }
  .hvi-city-occ .tag { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  @media (max-width: 600px) {
    .hvi-city-occ .txt { flex-direction: column; gap: 0; line-height: 1.3; }
    .hvi-city-occ .dots { display: none; }
    .hvi-city-occ .tag { font-size: var(--t-xs); max-width: 100%; }
    .hvi-city-occ .name { max-width: 100%; }
  }
  @media (hover: none) { .hvi-city-stage ~ * .ui-row:hover .name, .hvi-city-list .ui-row:hover .name, .hvi-city-in .ui-row:hover .name { text-decoration: none; } }
  .hvi-city3d-floors { padding: var(--s2) var(--s3) var(--s3); border-top: var(--bw) solid var(--line); }
  .hvi-city3d-floors .h { color: var(--fg-mute); font-size: var(--t-xs); margin-bottom: var(--s1); }
  .hvi-city3d-floors .note { color: var(--fg-mute); font-size: var(--t-xs); }
`;
export function injectCityStyles() {
  let el = document.getElementById("hvi-city-styles");
  if (!el) { el = document.createElement("style"); el.id = "hvi-city-styles"; document.head.appendChild(el); }
  if (el.textContent !== css) el.textContent = css;
}

// The machine clock, the census line, and the PA underneath. The PA rotates every few
// seconds, so it is not a live region (the census would talk over everything).
export function CityHeader({ clockText, right, pa, find = null }) {
  return (
    <>
      <div className="hvi-city-head">
        <span className="hvi-city-clock" aria-live="off">{clockText}</span>
        <span className="hvi-city-census">{right}</span>
      </div>
      <div className="hvi-city-pa" aria-hidden="true">
        <span className="tag">PA&gt;</span><Typed key={pa} as="span" text={pa} cps={45} />
      </div>
      {find}
    </>
  );
}

// Zoom keys for a canvas: [+] [−] and a reset. On phones they sit under the canvas, with
// the one-line hint beside them, where the thumb can reach them without landing on the map.
export function ZoomBar({ api, resetLabel = "FIT", resetAria = "Fit the whole city", hint }) {
  return (
    <div className="hvi-city-zoom" role="toolbar" aria-label="Zoom">
      {hint && <span className="hint">{hint}</span>}
      <button type="button" className="hvi-city-zb" aria-label="Zoom in" onClick={() => api.current.zoom?.(1.4)}>+</button>
      <button type="button" className="hvi-city-zb" aria-label="Zoom out" onClick={() => api.current.zoom?.(1 / 1.4)}>−</button>
      <button type="button" className="hvi-city-zb txt" aria-label={resetAria} onClick={() => (api.current.fit || api.current.reset)?.()}>{resetLabel}</button>
    </div>
  );
}

// What the dots mean. The swatches are the canvas's own colours.
export function MapKey() {
  const items = [
    ["GOOD", FAMILY_COLOR.good], ["CHARM", FAMILY_COLOR.charm], ["HARM", FAMILY_COLOR.harm], ["RESERVE", FAMILY_COLOR.dim], ["NOT ASKED", "var(--fg-dim)", true], ["THE LOOP", "#67e8f9"],
  ];
  return (
    <div className="hvi-city-key" role="note" aria-label="Map key">
      {items.map(([l, c, hollow]) => (
        <span key={l} className="k"><span className={`dot${hollow ? " hollow" : ""}`} style={{ "--tone": c }} aria-hidden="true" />{l}</span>
      ))}
    </div>
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

// A subject's standing frame, small, for lists. Redrawn once the drawn sprite arrives.
export function SpriteThumb({ s }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return undefined;
    let seen = -1;
    const draw = () => {
      const e = sheetFor(s);
      if (e.v === seen) return;
      seen = e.v;
      const x = c.getContext("2d");
      x.clearRect(0, 0, c.width, c.height);
      x.imageSmoothingEnabled = false;
      try { x.drawImage(e.img, 0, 0, SPRITE_W, SPRITE_H, 0, 0, c.width, c.height); } catch { /* not decoded yet */ }
    };
    draw();
    const t1 = setTimeout(draw, 800), t2 = setTimeout(draw, 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [s]);
  return <canvas ref={ref} width={SPRITE_W} height={SPRITE_H} className="hvi-city-thumb" aria-hidden="true" />;
}

// One person in a room list: sprite, name, assignment. Opens the file.
// Memoized: lists re-render with the census; a row only changes with its subject.
export const Occupant = memo(function Occupant({ s, onOpen, note }) {
  const job = jobLine(s);
  return (
    <button type="button" className="ui-row hvi-city-occ" onClick={() => onOpen(s)} aria-label={`${displayName(s)}. ${job}.${note ? " " + note + "." : ""} Open file.`}>
      <span className="lead"><SpriteThumb s={s} /></span>
      <span className="txt">
        <span className="name">{displayName(s)}{s.you ? " (YOU)" : ""}</span>
        <span className="dots" aria-hidden="true">{" " + ".".repeat(120)}</span>
        <span className="tag">{note ? `${note} // ` : ""}{job}</span>
      </span>
    </button>
  );
});

// CITY > DISTRICT > BUILDING > FLOOR, as a prompt. crumbs: [{label, go?}], the last is here.
// One line at any width: the parents give up their letters first (each stays a 44px
// target), so on a phone the deepest level is the one you can read.
export function Breadcrumb({ crumbs }) {
  return (
    <nav className={`hvi-city-crumbs${crumbs.length > 2 ? " deep" : ""}`} aria-label="Location">
      <span className="p" aria-hidden="true">&gt;</span>
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={i} className={`c ${last ? "here-c" : i === 0 ? "root" : "up"}`}>
            {last
              ? <span className="here" id="hvi-city-here" tabIndex={-1} aria-current="page" title={c.label}>{c.label}</span>
              : <button type="button" onClick={c.go} title={c.label}>{c.label}</button>}
            {!last && <span className="sep" aria-hidden="true">›</span>}
          </span>
        );
      })}
      <span className="cur" aria-hidden="true">_</span>
    </nav>
  );
}
