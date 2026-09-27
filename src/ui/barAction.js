// The command bar's context slot. A screen that has one action worth a thumb (APPEAL on
// a result) registers it while mounted; the bar shows it in place of CUBE. One slot,
// last writer wins, cleared on unmount.
import { useEffect, useRef, useSyncExternalStore } from "react";

let current = null;
const subs = new Set();
const emit = () => subs.forEach(f => f());

export function setBarAction(a) { current = a; emit(); }
export function getBarAction() { return current; }
export function subscribeBarAction(f) { subs.add(f); return () => subs.delete(f); }

// action: { label: "APPEAL", glyph: "✎", onSelect() } or null. The latest onSelect is
// always called, so an inline arrow function is fine.
export function useBarAction(action) {
  const ref = useRef(action);
  ref.current = action;
  const on = Boolean(action);
  const label = action?.label, glyph = action?.glyph;
  useEffect(() => {
    if (!on) return undefined;
    const a = { label, glyph, onSelect: () => ref.current?.onSelect?.() };
    setBarAction(a);
    return () => { if (current === a) setBarAction(null); };
  }, [on, label, glyph]);
}

export function useCurrentBarAction() {
  return useSyncExternalStore(subscribeBarAction, getBarAction, getBarAction);
}
