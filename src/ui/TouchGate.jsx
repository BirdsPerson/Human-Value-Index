// TAP TO OPERATE. On touch screens a canvas that takes drags (the cube, the city map)
// would swallow the thumb that meant to scroll the page. The gate lays a veil over it:
// a vertical swipe on the veil scrolls the page as usual, a tap lifts the veil and hands
// the canvas every gesture, and [DONE] (or scrolling it mostly off screen) puts the veil
// back. Mouse and keyboard users never see it.

import { useEffect, useRef, useState } from "react";

export function isTouchOnly() {
  try { return window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(any-pointer: fine)").matches; } catch { return false; }
}

// off: never gate (the wrapper div stays, so the canvas is never remounted).
export default function TouchGate({ children, off = false, label = "TAP TO OPERATE", hint = "DRAG · PINCH", className = "", style, onActiveChange }) {
  const [touch, setTouch] = useState(() => (typeof window === "undefined" ? false : isTouchOnly()));
  const [live, setLive] = useState(false);
  const ref = useRef(null);
  const cb = useRef(onActiveChange);
  cb.current = onActiveChange;

  useEffect(() => {
    let mq;
    try { mq = window.matchMedia("(pointer: coarse)"); } catch { return undefined; }
    const on = () => setTouch(isTouchOnly());
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  useEffect(() => { cb.current?.(live); }, [live]);

  // Scrolled mostly away: re-arm the veil so the next pass over it scrolls again.
  useEffect(() => {
    if (!live || !ref.current || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.intersectionRatio < 0.3) setLive(false); }, { threshold: [0, 0.3] });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [live]);

  // One wrapper in every state: the canvas inside must never be remounted, because the
  // views bind their pointer handlers to it once.
  const gated = touch && !off;
  return (
    <div ref={ref} className={`ui-gate${gated && live ? " live" : ""} ${className}`} style={style}>
      {children}
      {!gated ? null : live
        ? <button type="button" className="ui-gate-done" onClick={() => setLive(false)}>[DONE]</button>
        : (
          <button type="button" className="ui-gate-veil" onClick={() => setLive(true)} aria-label={`${label}. Then ${hint.toLowerCase()}.`}>
            <span className="lbl">▶ {label} <small>{hint}</small></span>
          </button>
        )}
    </div>
  );
}
