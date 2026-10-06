// The app shell (DEPARTMENT OS, 2026-10-05): a sticky menu bar on every screen, Turbo
// Vision style, its hotkey letters live as accesskeys, and on phones a bottom F-key strip
// within thumb reach: F1 MENU · F2 CITY · F3 PLAY · F4 MY FILE (the keys are labels; the
// function keys belong to the browser). A screen can put one context action (APPEAL) in
// the PLAY slot with useBarAction(). Desktop hides the strip; the menu bar carries the links.

import { useEffect, useState } from "react";
import { BANNER } from "../term.jsx";
import { readCaseId } from "../caseFile.jsx";
import { useCurrentBarAction } from "./barAction.js";

export const NAV = [
  { key: "menu", label: "MENU", glyph: "▣", href: "#", fk: "F1", hot: "M" },
  { key: "city", label: "CITY", glyph: "▦", href: "#city", fk: "F2", hot: "C" },
  { key: "play", label: "PLAY", glyph: "◈", href: "#play", fk: "F3", hot: "P" },
  { key: "file", label: "MY FILE", glyph: "▤", href: "#file", fk: "F4", hot: "F" },
];
// LABEL with its hotkey letter marked: MY FILE -> MY <u>F</u>ILE. The letter is decoration;
// the link's accessible name stays the plain label.
const hotLabel = (n) => {
  const i = n.label.indexOf(n.hot);
  const nb = (t) => t.replace(/ /g, "\u00a0");   // the link is inline-flex: a plain space at an item edge collapses
  return i < 0 ? n.label : <>{nb(n.label.slice(0, i))}<u aria-hidden="true">{n.hot}</u>{nb(n.label.slice(i + 1))}</>;
};

// Which tab a location belongs to. INTAKE (#arrivals, once #pen) has no tab of its own.
export function navKeyFor(route = "") {
  const path = route.split("?")[0];
  if (path === "#city" || path.startsWith("#city/") || path === "#heights" || path === "#enterprise" || path === "#prefects") return "city";
  if (path === "#play" || path === "#tennis" || path === "#golf" || path === "#hoops" || path === "#basketball" || path === "#fish" || path === "#aquarium" || path === "#chess" || path === "#casino" || path.startsWith("#casino/")) return "play";
  if (path === "#file" || path === "#intake") return "file";
  if (path === "#pen" || path === "#arrivals") return null;
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

// THE TREASURY's balance chip (src/economy/): for an assessed file while the Treasury is open.
// One small GET per case per minute (sessionStorage), refreshed by "hvi-economy" after a COLLECT
// or an order. Closed, unassessed or unreachable: no chip.
const CHIP_KEY = "hvi-econ-chip";
function useEconomyChip(caseId) {
  const [chip, setChip] = useState(null);
  useEffect(() => {
    if (!caseId) { setChip(null); return undefined; }
    let off = false;
    try {
      const c = JSON.parse(sessionStorage.getItem(CHIP_KEY) || "null");
      if (c && c.caseId === caseId && Date.now() - c.at < 60_000) setChip(c);
      else fetch(`/api/economy?caseId=${encodeURIComponent(caseId)}&chip=1`, { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).then(d => {
        if (off) return;
        const v = d?.open && d.assessed ? { caseId, balance: d.balance, tray: d.tray, at: Date.now() } : { caseId, none: true, at: Date.now() };
        try { sessionStorage.setItem(CHIP_KEY, JSON.stringify(v)); } catch { /* private mode */ }
        setChip(v);
      }).catch(() => {});
    } catch { /* no storage */ }
    const on = (e) => {
      const d = e.detail;
      if (!d || d.caseId !== caseId || !d.open) return;
      const v = { caseId, balance: d.balance, tray: d.tray, at: Date.now() };
      try { sessionStorage.setItem(CHIP_KEY, JSON.stringify(v)); } catch { /* private mode */ }
      setChip(v);
    };
    window.addEventListener("hvi-economy", on);
    return () => { off = true; window.removeEventListener("hvi-economy", on); };
  }, [caseId]);
  return chip && !chip.none && chip.caseId === caseId ? chip : null;
}

// onNav(key, event): called before the link navigates; preventDefault() to take over
// (the app does, for MENU, which is a phase rather than a route).
export function AppHeader({ banner = false, active = null, onNav }) {
  const caseId = useCaseId();
  const chip = useEconomyChip(caseId);
  return (
    <>
      {banner && <pre className="ui-banner" role="img" aria-label="Human Value Index">{BANNER}</pre>}
      <header className="ui-head">
        <div className="ui-head-line">
          <a className="ui-head-mark" href="#" onClick={e => onNav?.("menu", e)} aria-label="Human Value Index, main menu"><span aria-hidden="true">≡{"\u00a0"}</span>HUMAN VALUE INDEX</a>
          <nav className="ui-head-nav" aria-label="Sections">
            {NAV.map(n => (
              <a key={n.key} href={n.href} accessKey={n.hot.toLowerCase()} aria-label={n.label} aria-current={active === n.key ? "page" : undefined} onClick={e => onNav?.(n.key, e)}>{hotLabel(n)}</a>
            ))}
          </nav>
          <span className="ui-head-case">CASE <b>{caseId || "UNASSIGNED"}</b></span>
          {chip && <a className="ui-head-econ" href="#economy" aria-label={`${chip.balance} CYCLES${chip.tray ? `, ${chip.tray} days waiting to collect` : ""}. The Treasury.`}>¢{chip.balance.toLocaleString("en-US")}{chip.tray ? <span className="tray"> +{chip.tray}D</span> : null}</a>}
          <span className="ui-head-ok" aria-hidden="true">[CONNECTED]</span>
        </div>
      </header>
    </>
  );
}

export function CommandBar({ active = null, onNav }) {
  const action = useCurrentBarAction();
  useKeyboardFlag();
  const items = action ? NAV.map(n => (n.key === "play" ? { ...n, ctx: action } : n)) : NAV;
  return (
    <>
      <div className="ui-bar-pad" aria-hidden="true" />
      <nav className="ui-bar" aria-label="Command bar">
        {items.map(n => n.ctx
          ? (
            <button key="ctx" type="button" className="ctx" onClick={() => n.ctx.onSelect?.()}>
              <span className="g" aria-hidden="true">{n.fk}</span>{n.ctx.label}
            </button>
          ) : (
            <a key={n.key} href={n.href} aria-current={active === n.key ? "page" : undefined} onClick={e => onNav?.(n.key, e)}>
              <span className="g" aria-hidden="true">{n.fk}</span>{n.label}
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
