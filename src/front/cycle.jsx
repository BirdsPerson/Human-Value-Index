// THE SMALL WINDOWS' CYCLE (Scott, 2026-10-07: "the small ones, unless they're cycling through data, don't
// deliver enough information to be valuable"). A 1x1 window that cannot hold a list shows the list one item
// at a time: slow (CYCLE_MS), held still while the pointer is over it or focus is inside it, and never on its
// own under prefers-reduced-motion (it starts paused; ◀ ▶ step it by hand). Off screen or in a hidden tab it
// does not tick. Step is the small ◀ 2/9 ▶ row every cycling S view carries.
import { createContext, useContext, useEffect, useState } from "react";

// THE SET's caption (TheSet.jsx): the channel on the air says, in one readable line, what it is showing (the
// headline being read, the latest score, who the camera follows), so a small set reads beside its picture
export const SetNow = createContext(null);
export function useSetNow(text) {
  const say = useContext(SetNow);
  useEffect(() => { if (say) say(text || ""); }, [say, text]);
}

export const CYCLE_MS = 8000;
export const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

export function useCycle(n, ms = CYCLE_MS) {
  const [i, setI] = useState(0);
  const [still] = useState(reduced);
  const [hold, setHold] = useState(false);
  useEffect(() => {
    if (still || hold || n < 2) return undefined;
    const t = setTimeout(() => { if (!document.hidden) setI(v => (v + 1) % n); }, ms);
    return () => clearTimeout(t);
  }, [still, hold, n, i, ms]);
  const go = (k) => setI(v => (v + k + n) % Math.max(1, n));
  const holdProps = {
    onMouseEnter: () => setHold(true), onMouseLeave: () => setHold(false),
    onFocus: () => setHold(true), onBlur: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHold(false); },
  };
  return { i: n ? i % n : 0, n, go, still, holdProps };
}

export function Step({ c, what = "item" }) {
  if (!c || c.n < 2) return null;
  return (
    <span className="fr-step">
      <button type="button" onClick={() => c.go(-1)} aria-label={`Previous ${what}`}>◀</button>
      <span className="ix" aria-hidden="true">{c.i + 1}/{c.n}</span>
      <button type="button" onClick={() => c.go(1)} aria-label={`Next ${what}`}>▶</button>
    </span>
  );
}

// a cycling S view: the item (a link, usually) over the step row; hover or focus anywhere in it holds it
export const Cyc = ({ c, what, children, className = "" }) => (
  <div className={`fr-cyc ${className}`} {...c.holdProps}>
    <div className="fr-cyc-it">{children}</div>
    <Step c={c} what={what} />
  </div>
);
