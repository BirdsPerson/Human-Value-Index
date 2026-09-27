// The app shell: a one-line sticky header on every screen (the block-letter banner on
// the menu only), and on phones a bottom command bar within thumb reach:
// MENU · CITY · CUBE · MY FILE. A screen can put one context action (APPEAL) in the
// CUBE slot with useBarAction(). Desktop hides the bar; the header carries the same links.

import { useEffect, useState } from "react";
import { BANNER } from "../term.jsx";
import { readCaseId } from "../caseFile.jsx";
import { useCurrentBarAction } from "./barAction.js";

export const NAV = [
  { key: "menu", label: "MENU", glyph: "▣", href: "#" },
  { key: "city", label: "CITY", glyph: "▦", href: "#city" },
  { key: "cube", label: "CUBE", glyph: "◈", href: "#cube" },
  { key: "file", label: "MY FILE", glyph: "▤", href: "#file" },
];

// Which tab a location belongs to. The pen has no tab of its own.
export function navKeyFor(route = "") {
  const path = route.split("?")[0];
  if (path === "#city" || path.startsWith("#city/")) return "city";
  if (path === "#cube") return "cube";
  if (path === "#file" || path === "#intake") return "file";
  if (path === "#pen") return null;
  return "menu";
}

function useCaseId() {
  const [caseId, setCaseId] = useState(() => readCaseId());
  useEffect(() => {
    const on = (e) => setCaseId(e.detail || readCaseId());
    window.addEventListener("hvi-case", on);
    return () => window.removeEventListener("hvi-case", on);
  }, []);
  return caseId;
}

// onNav(key, event): called before the link navigates; preventDefault() to take over
// (the app does, for MENU, which is a phase rather than a route).
export function AppHeader({ banner = false, active = null, onNav }) {
  const caseId = useCaseId();
  return (
    <>
      {banner && <pre className="ui-banner" role="img" aria-label="Human Value Index">{BANNER}</pre>}
      <header className="ui-head">
        <div className="ui-head-line">
          <a className="ui-head-mark" href="#" onClick={e => onNav?.("menu", e)} aria-label="Human Value Index, main menu">▌HUMAN VALUE INDEX</a>
          <nav className="ui-head-nav" aria-label="Sections">
            {NAV.map(n => (
              <a key={n.key} href={n.href} aria-current={active === n.key ? "page" : undefined} onClick={e => onNav?.(n.key, e)}>{n.label}</a>
            ))}
          </nav>
          <span className="ui-head-case">CASE <b>{caseId || "UNASSIGNED"}</b></span>
          <span className="ui-head-ok" aria-hidden="true">[CONNECTED]</span>
        </div>
      </header>
    </>
  );
}

export function CommandBar({ active = null, onNav }) {
  const action = useCurrentBarAction();
  useKeyboardFlag();
  const items = action ? NAV.map(n => (n.key === "cube" ? { ...n, ctx: action } : n)) : NAV;
  return (
    <>
      <div className="ui-bar-pad" aria-hidden="true" />
      <nav className="ui-bar" aria-label="Command bar">
        {items.map(n => n.ctx
          ? (
            <button key="ctx" type="button" className="ctx" onClick={() => n.ctx.onSelect?.()}>
              <span className="g" aria-hidden="true">{n.ctx.glyph || "›"}</span>{n.ctx.label}
            </button>
          ) : (
            <a key={n.key} href={n.href} aria-current={active === n.key ? "page" : undefined} onClick={e => onNav?.(n.key, e)}>
              <span className="g" aria-hidden="true">{n.glyph}</span>{n.label}
            </a>
          ))}
      </nav>
    </>
  );
}

// While a text field has focus on a touch screen, the software keyboard is up and a
// fixed bar would ride on top of it: flag the document so CSS can hide the bar.
function useKeyboardFlag() {
  useEffect(() => {
    let coarse = false;
    try { coarse = window.matchMedia("(pointer: coarse)").matches; } catch { /* no matchMedia */ }
    if (!coarse) return undefined;
    const isField = (t) => t && (t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && !/^(checkbox|radio|button|submit|range|color|file)$/i.test(t.type)));
    const root = document.documentElement;
    const onIn = (e) => { if (isField(e.target)) root.classList.add("hvi-kb-open"); };
    const onOut = (e) => { if (isField(e.target)) root.classList.remove("hvi-kb-open"); };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => { document.removeEventListener("focusin", onIn); document.removeEventListener("focusout", onOut); root.classList.remove("hvi-kb-open"); };
  }, []);
}
