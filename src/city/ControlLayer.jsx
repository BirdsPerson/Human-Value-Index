import { memo, useEffect, useRef, useState } from "react";
import { isTouchOnly } from "../ui/TouchGate.jsx";
import { CTL, subscribeControl, stickVector } from "./control.js";
import { GLYPHS } from "./gamepad.js";
import { RELEASE_LINE } from "./controlIso.js";

// DRIVE YOURSELF: what sits over the CITY view while you steer your own citizen (control.js,
// controlIso.js). The strip (where you are, RELEASE), the legend (what E does now, in the
// words of the input in use: keys, a controller, or a thumb), and on a touch screen a
// thumbstick bottom-left with ACT and BACK bottom-right. The stick and the buttons take their
// own touches (touch-action: none) and nothing else: the page still scrolls everywhere else,
// and the canvas keeps its TAP TO OPERATE veil (ui/TouchGate.jsx) for panning and pinching.

const CSS = `
.hvi-ctl-legend { position: absolute; left: 8px; top: calc(var(--hit-min, 44px) + 34px); z-index: 23; max-width: min(560px, 46%, calc(100% - 16px)); background: rgba(6,10,6,0.9); border: 1px solid var(--accent, #4ade80); padding: 4px 8px; font-size: var(--t-xs, 12px); color: var(--fg, #d1fadf); pointer-events: none; line-height: 1.45; }
.hvi-ctl-legend .pr { color: #e5ffe9; font-weight: 700; }
.hvi-ctl-legend .pr .k { background: #e5ffe9; color: #06210f; padding: 0 0.5ch; margin-right: 0.6ch; }
.hvi-ctl-legend .ks { color: var(--fg-mute, #6b9a7c); }
.hvi-ctl-strip .tag { background: #e5ffe9 !important; color: #06210f !important; }
.hvi-ctl-stick { position: absolute; left: 12px; bottom: 60px; width: 116px; height: 116px; border-radius: 50%; border: 2px solid rgba(74,222,128,0.65); background: rgba(6,10,6,0.5); z-index: 23; touch-action: none; user-select: none; -webkit-user-select: none; }
.hvi-ctl-stick .knob { position: absolute; left: 50%; top: 50%; width: 50px; height: 50px; margin: -25px 0 0 -25px; border-radius: 50%; background: rgba(74,222,128,0.35); border: 2px solid #4ade80; pointer-events: none; }
.hvi-ctl-btns { position: absolute; right: 10px; bottom: 60px; z-index: 23; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
.hvi-ctl-btn { touch-action: none; user-select: none; -webkit-user-select: none; min-width: 48px; min-height: 48px; border-radius: 50%; border: 2px solid #4ade80; background: rgba(6,10,6,0.72); color: #d1fadf; font: 700 11px 'Fira Mono', ui-monospace, monospace; padding: 0 6px; }
.hvi-ctl-btn.act { width: 68px; height: 68px; background: rgba(74,222,128,0.25); color: #e5ffe9; font-size: 13px; }
.hvi-ctl-btn:active, .hvi-ctl-btn.on { background: #4ade80; color: #06210f; }
@media (max-width: 640px) { .hvi-ctl-note { bottom: 60px; } .hvi-ctl-legend { font-size: 11px; padding: 3px 6px; max-width: calc(100% - 16px); } .hvi-ctl-legend .opt { display: none; } }
/* while driving, the TAP TO OPERATE veil (ui/TouchGate.jsx) stays, small, in a corner: a swipe
   still scrolls the page, a tap still lifts it to pan and pinch, and it hides nothing */
.hvi-ctl-on .ui-gate-veil { align-items: flex-start; justify-content: flex-end; background: transparent; }
.hvi-ctl-on .ui-gate-veil .lbl { font-size: 10px; padding: 2px 6px; margin: 6px; opacity: 0.85; }
.hvi-ctl-on .ui-gate-veil .lbl small { display: none; }
.hvi-ctl-note { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); z-index: 23; background: rgba(6,10,6,0.92); border: 1px solid #e5ffe9; color: #e5ffe9; padding: 4px 10px; font-size: var(--t-xs, 12px); max-width: calc(100% - 24px); text-align: center; pointer-events: none; }
`;
function injectCss() {
  if (typeof document === "undefined") return;
  let el = document.getElementById("hvi-ctl-styles");
  if (!el) { el = document.createElement("style"); el.id = "hvi-ctl-styles"; document.head.appendChild(el); }
  if (el.textContent !== CSS) el.textContent = CSS;
}

export function useControlUi() {
  const [ui, setUi] = useState(() => CTL.ui);
  useEffect(() => subscribeControl(setUi), []);
  return ui;
}

// TAKE CONTROL, on the FIND ME strip: only for your own file, only while not already driving.
export const TakeControlButton = memo(function TakeControlButton({ onTake }) {
  const ui = useControlUi();
  if (ui) return null;
  return <button type="button" className="hvi-city-zb txt" onClick={onTake} aria-label="Take control of your own citizen: suspend its schedule and walk it yourself">TAKE CONTROL</button>;
});

export default memo(function ControlLayer({ onRelease }) {
  useEffect(injectCss, []);
  const ui = useControlUi();
  const [touch] = useState(() => (typeof window === "undefined" ? false : isTouchOnly()));
  useEffect(() => { if (touch && CTL.input.source === "keys") CTL.input.source = "touch"; }, [touch]);
  // the release line stays up a few seconds after the strip is gone
  const [bye, setBye] = useState(false);
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !ui) { setBye(true); const t = setTimeout(() => setBye(false), 3500); was.current = false; return () => clearTimeout(t); }
    if (ui) was.current = true;
    return undefined;
  }, [ui]);
  // the stage knows it is being driven (the veil steps aside: CSS above)
  useEffect(() => { document.querySelector(".hvi-city-stage")?.classList.toggle("hvi-ctl-on", Boolean(ui)); }, [ui]);
  if (!ui) return bye ? <div className="hvi-ctl-note" role="status">{RELEASE_LINE}</div> : null;
  const showTouch = touch || ui.source === "touch";
  return (
    <>
      <div className="hvi-city-found hvi-ctl-strip">
        <span className="tag" aria-hidden="true">DRIVING</span>
        <span className="l" role="status">YOU // {ui.where}</span>
        <button type="button" className="hvi-city-zb txt" onClick={onRelease} aria-label="Release control: your citizen returns to its schedule">RELEASE</button>
      </div>
      <Legend ui={ui} touch={showTouch} />
      {ui.note && <div className="hvi-ctl-note" role="status">{ui.note}</div>}
      {showTouch && <TouchPad ui={ui} />}
    </>
  );
});

function Legend({ ui, touch }) {
  const src = ui.source === "pad" || ui.source === "keys" ? ui.source : touch ? "touch" : "keys";
  const g = GLYPHS[ui.family || "generic"] || GLYPHS.generic;
  const actKey = src === "pad" ? g.act : src === "touch" ? "ACT" : "E";
  const backKey = src === "pad" ? g.back : src === "touch" ? "BACK" : "B";
  const keys = src === "pad"
    ? `L-STICK WALK // ${g.run} RUN // ${g.turnL} ${g.turnR} TURN // ${g.start} RELEASE`
    : src === "touch"
      ? "STICK WALK (PUSH FAR TO RUN) // RELEASE UP TOP"
      : "WASD OR ARROWS WALK // SHIFT RUN // Q R TURN // ESC RELEASE";
  return (
    <div className="hvi-ctl-legend" aria-hidden="true">
      <div className="pr">{ui.prompt ? <><span className="k">{actKey}</span>{ui.prompt}</> : <span className="ks">NOTHING WITHIN REACH. KEEP WALKING. IT IS NOTED.</span>}</div>
      {ui.back && <div><span className="ks">{backKey}</span> {ui.back}</div>}
      {ui.mode === "inside" && ui.lift && <div className="ks opt">UP / DOWN: THE LIFT (WEST WALL). THE EXIT: EAST END, GROUND FLOOR.</div>}
      <div className="ks opt">{keys}</div>
    </div>
  );
}

// The thumbstick and the two buttons. Pointer events, one finger each; nothing here scrolls.
function TouchPad({ ui }) {
  const knob = useRef(null);
  const drag = useRef(null);
  const R = 46;
  const set = (x, y) => {
    const v = stickVector(x, y, R, 0.14);
    CTL.input.stick = v;
    CTL.input.source = "touch";
    const k = Math.min(1, Math.hypot(x, y) / R) * R, a = Math.atan2(y, x);
    if (knob.current) knob.current.style.transform = Math.hypot(x, y) ? `translate(${Math.cos(a) * k}px, ${Math.sin(a) * k}px)` : "";
  };
  const down = (e) => {
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    set(e.clientX - drag.current.cx, e.clientY - drag.current.cy);
  };
  const move = (e) => { const d = drag.current; if (!d || d.id !== e.pointerId) return; e.preventDefault(); set(e.clientX - d.cx, e.clientY - d.cy); };
  const up = (e) => { const d = drag.current; if (!d || d.id !== e.pointerId) return; drag.current = null; set(0, 0); };
  useEffect(() => () => { CTL.input.stick = { x: 0, y: 0, mag: 0 }; }, []);
  const tap = (k) => (e) => { e.preventDefault(); CTL.input.taps[k]++; CTL.input.source = "touch"; };
  const key = (k) => (e) => { if (e.detail === 0) CTL.input.taps[k]++; };   // Enter or Space on the focused button
  return (
    <>
      <div className="hvi-ctl-stick" role="presentation" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onContextMenu={(e) => e.preventDefault()}>
        <div className="knob" ref={knob} />
      </div>
      <div className="hvi-ctl-btns">
        {ui.back && <button type="button" className="hvi-ctl-btn" onPointerDown={tap("back")} onClick={key("back")} aria-label={ui.back}>{ui.back.split(" ")[0]}</button>}
        <button type="button" className={`hvi-ctl-btn act${ui.prompt ? " on" : ""}`} onPointerDown={tap("act")} onClick={key("act")} aria-label={ui.prompt || "Interact"}>ACT</button>
      </div>
    </>
  );
}
