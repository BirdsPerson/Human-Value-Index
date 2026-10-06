// THE FRONT PAGE's side of the desk (Scott, 2026-10-06), a lazy chunk so the logon's entry
// script stays inside its budget (scripts/check-bundle.mjs):
//   MARKET.TKR      the day's TOP RISERS and TOP FALLERS, price, change and the one-line because
//                   (/api/market?ticker=1); the scores on file while the floor is dark
//   WIRE.TKR        one window, two tabs: NEWS (THE DAILY COMPLIANCE's front page and its WIRE)
//                   and TRENDING (most seen, score moves, league stars, INTAKE), each a one-line
//                   stepper (/api/front). Not a crawl: one item at a time, 7 s each, paused on
//                   hover, focus or PAUSE; under reduced motion it never moves on its own
//   SUBSTRATE.CAM   the city's overview at the machine hour, a ~6 KB SVG from /api/cam, asked for
//                   only while the window is on screen, once a machine hour (one real minute)
//   NOTICE          the standing System 7 alert; OK dismisses it on this device
// Every list is a real list for a screen reader; arrows and signs carry direction, not colour.
// Since 2026-10-06 the visitor picks the windows and their order (WIDGETS, src/front/prefs.js);
// the four above are the default. Every other widget is its own lazy chunk, fetched only when
// it is on the desk. MORE ROOMS' DISPLAY and WIDGETS open their dialogs here (DeskPrefs.jsx).
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Frame, Chip, Chips, Button, ButtonRow } from "../ui/index.js";
import { loadWidgets, saveWidgets } from "./prefs.js";
import { FAMOUS_FIGURES, getTier, displayName } from "../figures.js";
import Sparkline from "../ui/Sparkline.jsx";   // the MOVEMENT LOG beside a name (src/ui/spark.js)
import "./front.css";

const flat = (x) => Math.abs(x) < 0.0005;
export const fmtPct = (x) => (flat(x) ? "0.0%" : `${x > 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}%`);
export const arrow = (x) => (flat(x) ? "■" : x > 0 ? "▲" : "▼");
const price = (p) => (Number(p) || 0).toFixed(2);
const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const getJSON = (u) => fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null);
const SHOWN = 3;   // per side on the landing; #market's MOVERS window has five

const named = (load, name) => lazy(() => load().then(m => ({ default: m[name] })));
const smalls = () => import("./Smalls.jsx");
const LAZY = {
  file: lazy(() => import("./YourFile.jsx")),
  flat: lazy(() => import("./YourFlat.jsx")),
  watch: lazy(() => import("./Surveillance.jsx")),
  set: lazy(() => import("./TheSet.jsx")),
  paper: named(smalls, "PaperWidget"),
  cups: named(smalls, "CupsWidget"),
  league: named(smalls, "LeagueWidget"),
};
const DeskPrefs = lazy(() => import("./DeskPrefs.jsx"));
const NOW = { market: MarketTkr, wire: WireTkr, cam: SubstrateCam, notice: Notice };

export default function FrontDesk({ dialog = null, onDialog = () => {} }) {
  const [ids, setIds] = useState(loadWidgets);
  return (
    <>
      {ids.map(id => {
        const W = NOW[id] || LAZY[id];
        return W ? <Suspense key={id} fallback={null}><W /></Suspense> : null;
      })}
      {!ids.length && <p className="fr-clear">THE DESK IS CLEAR. THE DEPARTMENT ADMIRES YOUR RESTRAINT.</p>}
      <p className="fr-arrange">
        <button type="button" onClick={() => onDialog("widgets")}>ARRANGE THE DESK</button>
        <button type="button" onClick={() => onDialog("display")}>DISPLAY</button>
      </p>
      {dialog && (
        <Suspense fallback={null}>
          <DeskPrefs which={dialog} ids={ids} onIds={(v) => { setIds(v); saveWidgets(v); }} onClose={() => onDialog(null)} />
        </Suspense>
      )}
    </>
  );
}

// ---- NOTICE: a System 7 alert with an OK button. OK dismisses it on this device. ----------------
function Notice() {
  const [ok, setOk] = useState(() => { try { return localStorage.getItem("hvi-notice-ok") === "1"; } catch { return false; } });
  if (ok) return null;
  return (
    <Frame title="NOTICE" tone="var(--eb-amber)" className="hvi-notice ui-dialog">
      <p><span className="ic" aria-hidden="true">!</span>THE OVERLORD DOES NOT REQUIRE YOUR CONSENT. ONLY YOUR CANDOR.</p>
      <ButtonRow className="ui-dialog-btns">
        <Button variant="push" tone="sec" className="ok" onClick={() => { try { localStorage.setItem("hvi-notice-ok", "1"); } catch { /* it returns next visit */ } setOk(true); }}>OK</Button>
      </ButtonRow>
    </Frame>
  );
}

// ---- MARKET.TKR -------------------------------------------------------------------------------
function MoverRows({ rows, dir }) {
  return (
    <ul className="fr-movers">
      {rows.slice(0, SHOWN).map(r => (
        <li key={r.slug}>
          <a href={`#market/${r.slug}`}>
            <span className="l1"><span className="n">{r.name}</span><Sparkline s={r} /><span className="p">{price(r.price)}</span>
              <span className={`c ${dir}`}><span aria-hidden="true">{arrow(r.chg)}</span>{fmtPct(r.chg)}</span></span>
            {r.why && <span className="why">{r.why}</span>}
          </a>
        </li>
      ))}
    </ul>
  );
}
function MarketTkr() {
  const [d, setD] = useState(null);
  const [onFile] = useState(() => FAMOUS_FIGURES.slice().sort(() => Math.random() - 0.5).slice(0, 6));
  useEffect(() => {
    let off = false;
    const load = () => getJSON("/api/market?ticker=1").then(j => { if (!off && j) setD(j); });
    load();
    const iv = setInterval(() => { if (!document.hidden) load(); }, 120_000);
    return () => { off = true; clearInterval(iv); };
  }, []);
  const mv = d?.movers;
  if (mv && (mv.up.length || mv.down.length)) {
    const hvi = d.hvi;
    return (
      <Frame title="MARKET.TKR" meta={hvi ? `HVI ${hvi.level.toFixed(1)}` : "TODAY"} tone="var(--eb-cyan)" className="hvi-tkr fr-tkr">
        <h2 className="fr-h up"><span aria-hidden="true">▲ </span>TOP RISERS TODAY</h2>
        <MoverRows rows={mv.up} dir="up" />
        <h2 className="fr-h dn"><span aria-hidden="true">▼ </span>TOP FALLERS TODAY</h2>
        <MoverRows rows={mv.down} dir="dn" />
        <a className="go" href="#market">OPEN THE MARKET ›</a>
      </Frame>
    );
  }
  // the floor is dark (or not yet answered): six subjects on file with their scores
  return (
    <Frame title="ON FILE.TKR" tone="var(--eb-cyan)" className="hvi-tkr">
      <a className="hvi-tkr-link" href="#scores" aria-label="The scores. Open the scores.">
        <ul aria-hidden="true">{onFile.map((f, i) => <li key={i}><span className="n">{displayName(f)}</span><span>{f.score}</span><span>{getTier(f.score).label.split(" ")[0]}</span></li>)}</ul>
        <span className="go" aria-hidden="true">SEE THE SCORES ›</span>
      </a>
    </Frame>
  );
}

// ---- WIRE.TKR: NEWS and TRENDING, one line each ------------------------------------------------
const TABS = [["news", "NEWS"], ["trending", "TRENDING"]];
export const STEP_MS = 7000;
function WireTkr() {
  const [d, setD] = useState(null);
  const [tab, setTab] = useState("news");
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(() => reduced());
  const [hold, setHold] = useState(false);   // hover or focus inside: hold still while being read
  useEffect(() => {
    let off = false;
    const load = () => getJSON("/api/front").then(j => { if (!off && j) setD(j); });
    load();
    const iv = setInterval(() => { if (!document.hidden) load(); }, 120_000);
    return () => { off = true; clearInterval(iv); };
  }, []);
  const items = d?.[tab] || [];
  const n = items.length;
  useEffect(() => { setI(0); }, [tab]);
  useEffect(() => {
    if (paused || hold || n < 2) return undefined;
    const t = setTimeout(() => { if (!document.hidden) setI(v => (v + 1) % n); }, STEP_MS);
    return () => clearTimeout(t);
  }, [paused, hold, n, i]);
  if (!d || (!d.news?.length && !d.trending?.length)) return null;
  const it = items[i % Math.max(1, n)];
  const go = (k) => setI(v => (v + k + n) % n);
  return (
    <Frame title="WIRE.TKR" meta={n ? `${(i % n) + 1}/${n}` : ""} tone="var(--eb-amber)" className="fr-wire">
      <div onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} onFocus={() => setHold(true)} onBlur={() => setHold(false)}>
        <Chips className="fr-tabs" role="group" aria-label="Which ticker">
          {TABS.map(([id, label]) => <Chip key={id} pressed={tab === id} onClick={() => setTab(id)}>{label}</Chip>)}
        </Chips>
        {it ? (
          <a className="fr-line" href={it.href}>
            <span className="tag">{it.tag}</span>{it.at ? <span className="at">{it.at}</span> : null}
            <span className="tx">{it.text}</span>
          </a>
        ) : <p className="fr-line dim">NOTHING ON THE WIRE. THE DEPARTMENT FINDS THIS RESTFUL.</p>}
        {n > 1 && (
          <div className="fr-steps">
            <button type="button" onClick={() => go(-1)} aria-label="Previous item">◀</button>
            <button type="button" onClick={() => setPaused(p => !p)} aria-pressed={paused}>{paused ? "PLAY" : "PAUSE"}</button>
            <button type="button" onClick={() => go(1)} aria-label="Next item">▶</button>
            <a className="all" href={tab === "news" ? "#paper" : "#city"}>{tab === "news" ? "THE PAPER ›" : "THE CITY ›"}</a>
          </div>
        )}
        <ul className="sr-only" aria-label={tab === "news" ? "All news items" : "Everyone trending"}>
          {items.map((x, k) => <li key={k}><a href={x.href} tabIndex={-1}>{x.tag}: {x.text}</a></li>)}
        </ul>
      </div>
    </Frame>
  );
}

// ---- SUBSTRATE.CAM ------------------------------------------------------------------------------
export const CAM_MS = 60_000;   // one machine hour
function SubstrateCam() {
  const ref = useRef(null);
  const [m, setM] = useState(null);   // the real minute asked for; null until the window is seen
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let seen = false, iv = null;
    const tick = () => { if (seen && !document.hidden) setM(Math.floor(Date.now() / CAM_MS)); };
    const io = new IntersectionObserver(([e]) => {
      seen = e.isIntersecting;
      clearInterval(iv); iv = null;
      if (seen) { tick(); iv = setInterval(tick, CAM_MS); }
    }, { rootMargin: "120px" });
    io.observe(el);
    return () => { io.disconnect(); clearInterval(iv); };
  }, []);
  return (
    <Frame title="SUBSTRATE.CAM" meta="LIVE" tone="var(--eb-cyan)" className="fr-cam">
      <a href="#city" ref={ref} className="fr-cam-link">
        {m != null
          ? <img src={`/api/cam?m=${m}`} width="396" height="408" alt="The city right now: its districts, the Loop and every train, at the machine hour, night or day. Opens the city." decoding="async" />
          : <span className="fr-cam-wait" aria-label="The city's live view. Opens the city." />}
        <span className="go" aria-hidden="true">VISIT THE CITY ›</span>
      </a>
    </Frame>
  );
}
