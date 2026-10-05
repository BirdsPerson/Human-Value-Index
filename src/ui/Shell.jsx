// The app shell: a one-line sticky header on every screen (the block-letter banner on
// the menu only), and on phones a bottom command bar within thumb reach:
// MENU · CITY · PLAY · MY FILE. A screen can put one context action (APPEAL) in the
// PLAY slot with useBarAction(). Desktop hides the bar; the header carries the same links.

import { useEffect, useState } from "react";
import { BANNER } from "../term.jsx";
import { readCaseId } from "../caseFile.jsx";
import { useCurrentBarAction } from "./barAction.js";

export const NAV = [
  { key: "menu", label: "MENU", glyph: "▣", href: "#" },
  { key: "city", label: "CITY", glyph: "▦", href: "#city" },
  { key: "play", label: "PLAY", glyph: "◈", href: "#play" },
  { key: "file", label: "MY FILE", glyph: "▤", href: "#file" },
];

// Which tab a location belongs to. INTAKE (#arrivals, once #pen) has no tab of its own.
export function navKeyFor(route = "") {
  const path = route.split("?")[0];
  if (path === "#city" || path.startsWith("#city/") || path === "#heights" || path === "#enterprise" || path === "#prefects") return "city";
  if (path === "#play" || path === "#tennis" || path === "#golf" || path === "#chess" || path === "#casino" || path.startsWith("#casino/")) return "play";
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
          <a className="ui-head-mark" href="#" onClick={e => onNav?.("menu", e)} aria-label="Human Value Index, main menu">▌HUMAN VALUE INDEX</a>
          <nav className="ui-head-nav" aria-label="Sections">
            {NAV.map(n => (
              <a key={n.key} href={n.href} aria-current={active === n.key ? "page" : undefined} onClick={e => onNav?.(n.key, e)}>{n.label}</a>
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
