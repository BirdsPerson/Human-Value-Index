import { useState, useEffect, useRef, lazy, Suspense } from "react";
import CubePanel, { CubeChips, cubePlace, cubeOf } from "./CubePanel.jsx";
import { FAMOUS_FIGURES, TIERS, getTier, displayName } from "./figures.js";
import { ScoreCard, Breakdown, readCaseId, readLastResult, CaseLogon, syncFile, assessedMeta, FlagsList, flagsMeta } from "./caseFile.jsx";
import { FILE_PHOTO_CSS } from "./filePhotoCss.js";
// The compare card's photo only: the sprite painter stays out of the entry bundle.
const FilePhoto = lazy(() => import("./FilePhoto.jsx"));
import { TermBox, Rule, Typed, Bar, pad, padL, prefersReducedMotion, BANNER } from "./term.jsx";
import { AppHeader, CommandBar, navKeyFor, Command, CommandList, Button, ButtonRow, Disclosure, Frame, TextField, ListRow, ScreenHead, bootSeen, markBootSeen } from "./ui/index.js";

// Route-level splitting: the logon ships only what it renders. Each heavy view (the
// voice intake and its SDK, the pen, the cube, the city) arrives when first opened.
const Intake = lazy(() => import("./Intake.jsx"));
const Arrivals = lazy(() => import("./Arrivals.jsx"));   // INTAKE, the processing hall (#arrivals; #pen lands here)
const CubeView = lazy(() => import("./CubeView.jsx"));
const City = lazy(() => import("./city/City.jsx"));
// The Public Figure Index and the result's compare list: not on the logon's first paint.
const FigureIndex = lazy(() => import("./FigureIndex.jsx"));
const Legal = lazy(() => import("./legal/Legal.jsx"));
const Assembly = lazy(() => import("./assembly/Assembly.jsx"));
const Elections = lazy(() => import("./elections/Elections.jsx"));
const Docket = lazy(() => import("./assembly/Docket.jsx"));
const Casino = lazy(() => import("./casino/Casino.jsx"));
const Chess = lazy(() => import("./chess/Chess.jsx"));
const PlayGrid = lazy(() => import("./play/PlayGrid.jsx"));   // #play: the games as square tiles
const Tennis = lazy(() => import("./play/tennis/Tennis.jsx"));   // THE TENNIS CLUB, playable (#tennis)
const Golf = lazy(() => import("./play/golf/Golf.jsx"));   // #golf: THE DEPARTMENT LINKS (exhibition golf)
const Hoops = lazy(() => import("./play/hoops/Hoops.jsx"));   // #hoops: THE COURTS (exhibition basketball)
const Fish = lazy(() => import("./play/fish/Fish.jsx"));   // #fish: THE WATERS (fishing, src/play/fish/)
const Aquarium = lazy(() => import("./play/fish/Aquarium.jsx"));   // #aquarium: THE AQUARIUM (replay-checked donations)
const Economy = lazy(() => import("./economy/Economy.jsx"));
// YOUR FIRST DAY, one line on the logon for an assessed file that has not finished it (src/FirstDay.jsx).
const FirstDay = lazy(() => import("./FirstDay.jsx"));
const firstDayOpen = (id) => { try { return Boolean(id) && readLastResult()?.caseId === id && localStorage.getItem(`hvi-fd:${id}:done`) !== "1"; } catch { return false; } };
const Market = lazy(() => import("./market/Market.jsx"));   // #market: THE MARKET (src/market/)
const LEGAL = ["about", "privacy", "terms", "dispute"];
const FigurePicker = lazy(() => import("./FigureIndex.jsx").then(m => ({ default: m.FigurePicker })));

// The survey's questions load when the survey opens (src/surveyQuestions.js); the menu only needs the count.
const SURVEY_COUNT = 16;


// CSS injected once. The whole app is a text terminal: one monospace font on a
// character grid, frames drawn in box-drawing characters (see term.jsx), inverse
// video for selected. No rounded corners, glows, gradients or soft shadows.
// Colours, sizes and spacing are tokens (src/ui/tokens.css); components are src/ui/.
const globalStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  button, input, textarea, select { font: inherit; }

  .hvi-app { min-height: 100vh; min-height: 100dvh; background: var(--bg); position: relative; overflow-x: clip; text-transform: uppercase; }
  /* The CRT: faint scanlines, nothing more. */
  .hvi-app::after {
    content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 200;
    background: repeating-linear-gradient(to bottom, transparent 0, transparent 2px, rgba(0,0,0,0.16) 2px, rgba(0,0,0,0.16) 3px);
  }
  .as-typed { text-transform: none; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  /* Typed text keeps a screen-reader copy beside the visible one; copying the page must not grab both. */
  .typed > .sr-only { user-select: none; -webkit-user-select: none; }

  .hvi-wrap { max-width: 86ch; margin: 0 auto; padding: 0 max(var(--gutter), var(--safe-r)) var(--s6) max(var(--gutter), var(--safe-l)); position: relative; z-index: 1; }
  .hvi-wrap.wide { max-width: 1040px; }

  /* RULES (term.jsx Rule). Windows (TermBox) are styled in src/ui/ui.css. */
  .tb-edge { display: flex; white-space: pre; overflow: hidden; line-height: 1.25; color: var(--tb, var(--fg-mute)); }
  .tb-edge > span { flex: none; }
  .tb-edge > .tb-fill { flex: 1 1 0; min-width: 0; overflow: hidden; }
  .tb-edge > .tb-title { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--tb, var(--fg-dim)); }
  .rule { margin: var(--s4) 0 var(--s2); }

  .typed { white-space: pre-wrap; }
  .cur { color: var(--accent); animation: hvi-blink 1s steps(1) infinite; }
  @keyframes hvi-blink { 50% { opacity: 0; } }

  /* LEGACY COMMANDS. New screens use Button / Command / Chip from src/ui. These keep the
     older screens working and touch-sized until they are ported. */
  .hvi-btn-primary, .hvi-btn-secondary, .hvi-btn-next, .hvi-btn-back, .hvi-link-btn, .hvi-filter-btn, .hvi-cmd, .hvi-option, .hvi-row-btn {
    background: none; border: 0; border-radius: 0; box-shadow: none; color: var(--accent); cursor: pointer;
    font: inherit; text-transform: uppercase; letter-spacing: 0; text-align: left; line-height: var(--lh);
    padding: 0 1ch; display: inline-block; width: auto;
  }
  .hvi-btn-primary { font-weight: 700; }
  .hvi-btn-primary::before, .hvi-btn-next::before { content: "[ "; }
  .hvi-btn-primary::after, .hvi-btn-next::after { content: " ]"; }
  .hvi-btn-secondary, .hvi-link-btn { color: var(--fg-dim); }
  .hvi-btn-secondary::before, .hvi-link-btn::before { content: "> "; color: var(--fg-mute); }
  .hvi-btn-back { color: var(--fg-dim); }
  .hvi-btn-back::before { content: "< "; }
  @media (hover: hover) { .hvi-btn-primary:hover, .hvi-btn-secondary:hover, .hvi-btn-next:hover, .hvi-btn-back:hover, .hvi-link-btn:hover, .hvi-filter-btn:hover, .hvi-cmd:hover, .hvi-option:hover, .hvi-row-btn:hover { background: var(--accent); color: var(--accent-ink); outline: none; } }
  .hvi-btn-primary:focus-visible, .hvi-btn-secondary:focus-visible, .hvi-btn-next:focus-visible, .hvi-btn-back:focus-visible, .hvi-link-btn:focus-visible, .hvi-filter-btn:focus-visible, .hvi-cmd:focus-visible, .hvi-option:focus-visible, .hvi-row-btn:focus-visible, .hvi-cmd.on {
    background: var(--accent); color: var(--accent-ink); outline: none;
  }
  .hvi-btn-secondary:hover::before, .hvi-link-btn:hover::before, .hvi-btn-secondary:focus-visible::before, .hvi-link-btn:focus-visible::before { color: var(--accent-ink); }
  button:disabled, button:disabled:hover { color: var(--fg-mute); background: none; cursor: default; }
  .hvi-cmds { display: flex; flex-wrap: wrap; gap: var(--s2) 2ch; align-items: baseline; }
  .hvi-cmds.split { justify-content: space-between; }
  .hvi-stack { display: flex; flex-direction: column; align-items: flex-start; gap: var(--s2); }
  /* Touch: every legacy command gets a 44px target and centres its label in it. */
  @media (max-width: 720px), (pointer: coarse) {
    .hvi-btn-primary, .hvi-btn-secondary, .hvi-btn-next, .hvi-btn-back, .hvi-link-btn, .hvi-filter-btn, .hvi-cmd, .hvi-row-btn, .hvi-appeal-tog, .hvi-refer-pick {
      min-height: var(--hit-min); display: inline-flex; align-items: center;
    }
    .hvi-row-btn, .hvi-refer-pick { display: flex; }
    .hvi-option { min-height: var(--hit-min); align-items: center; }
    .hvi-appeal-tog { min-width: var(--hit-min); justify-content: flex-start; }
    .hvi-cmds { align-items: center; gap: 0 2ch; }
    .hvi-stack { gap: 0; }
    details > summary.hvi-cmd, .hvi-city-rooms summary { min-height: var(--hit-min); display: flex; align-items: center; }
    input.hvi-textarea, input.hvi-refer-input, .hvi-input-row input { min-height: var(--hit-min) !important; }
  }
  /* Inputs are 16px on phones: under that, iOS Safari zooms the page on focus. */
  @media (max-width: 720px), (pointer: coarse) {
    input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, select { font-size: var(--t-m) !important; }
  }

  /* LOGON */
  .hvi-logon { min-height: 18em; cursor: default; }
  .hvi-logon .dim { color: var(--fg-mute); }
  .hvi-logon .ghost { color: var(--fg-mute); }
  .hvi-logon .bright { color: var(--accent); }
  .hvi-logon .say { color: var(--fg); font-weight: 500; }
  .hvi-logon.quick { min-height: 0; }
  .hvi-logon .say.big { font-size: var(--t-l); line-height: var(--lh-tight); margin-top: var(--s2); }
  .hvi-prompt { color: var(--accent); }
  .hvi-whatis { color: var(--fg); font-size: var(--t-s); line-height: var(--lh-body, 1.5); margin: var(--s2) 0 var(--s3); max-width: 60ch; }
  .hvi-skip { color: var(--fg-mute); font-size: var(--t-xs); margin-top: var(--s1); }
  @media (pointer: coarse) { .hvi-desk-only { display: none; } }

  /* SURVEY */
  .hvi-progress-row { display: flex; justify-content: space-between; gap: 2ch; flex-wrap: wrap; color: var(--fg-mute); font-size: var(--t-xs); white-space: pre; }
  .hvi-progress-bar { color: var(--accent); white-space: pre; overflow: hidden; font-size: var(--t-xs); margin-bottom: var(--s4); }
  .hvi-section-label { color: var(--fg-mute); margin-bottom: var(--s1); }
  .hvi-question { color: var(--fg); font-weight: 700; margin-bottom: var(--s1); }
  .hvi-hint { color: var(--fg-mute); margin-bottom: var(--s4); }
  .hvi-option { display: flex; width: 100%; color: var(--fg-dim); padding: 2px 1ch; }
  .hvi-option.selected { color: var(--accent); }
  .hvi-option.selected:hover, .hvi-option.selected:focus-visible, .hvi-row-btn.selected:hover, .hvi-row-btn.selected:focus-visible { color: var(--accent-ink); }
  .bar .off { color: var(--fg-ghost); }
  :is(button, .hvi-cmd):is(:hover, :focus-visible) .bar .off { color: var(--accent-ink); }
  .hvi-option-marker { flex: none; white-space: pre; margin-right: 1ch; }
  .hvi-extra-label { color: var(--fg-mute); margin: var(--s4) 0 var(--s1); font-size: var(--t-xs); }
  .hvi-input-row { display: flex; align-items: flex-start; gap: 1ch; }
  .hvi-input-row .p { flex: none; color: var(--accent); white-space: pre; }
  .hvi-textarea { flex: 1; width: 100%; min-width: 0; background: transparent; border: 0; border-radius: 0; outline: none; resize: vertical; color: var(--fg); text-transform: none; line-height: var(--lh); min-height: 3.2em; padding: 0; caret-color: var(--accent); caret-shape: block; }
  .hvi-textarea::placeholder { color: var(--fg-mute); text-transform: uppercase; }
  .hvi-textarea:focus { background: var(--panel); }
  .hvi-nav-row { display: flex; justify-content: space-between; gap: 2ch; margin-top: var(--s5); flex-wrap: wrap; }
  .hvi-nav-hint { margin-top: var(--s3); color: var(--fg-mute); font-size: var(--t-xs); }

  /* PROCESSING */
  .hvi-proc { padding: var(--s2) 0 var(--s4); }
  .hvi-proc-label { color: var(--fg-dim); margin-bottom: var(--s2); }
  .hvi-proc-bar { color: var(--accent); white-space: pre; overflow: hidden; margin-bottom: var(--s4); }
  .hvi-proc-step { color: var(--fg-mute); white-space: pre-wrap; }
  .hvi-proc-step.active { color: var(--fg-dim); }
  .hvi-proc-step .ok { color: var(--accent); }

  /* RESULT. The score stays in block digits; phones get them big. */
  .bignum { font-family: var(--mono); font-size: var(--t-l); line-height: 1; letter-spacing: 0; margin: var(--s2) 0 var(--s3); white-space: pre; overflow: hidden; }
  .hvi-tierline { font-weight: 700; }
  .hvi-tier-desc { color: var(--fg-mute); margin-bottom: var(--s1); }
  .hvi-verdict-text { color: var(--fg); }
  .hvi-micro-label { color: var(--fg-mute); margin-bottom: var(--s1); }
  .hvi-flags-section { margin-bottom: var(--s4); }
  .hvi-flag-item { color: var(--fg-dim); padding-left: 3ch; text-indent: -3ch; }
  .hvi-flag { color: var(--harm); }
  .hvi-comm { color: var(--accent); }
  .hvi-rows { white-space: pre; overflow-x: auto; }
  .hvi-rows .muted { color: var(--fg-mute); }
  .hvi-rows .ghost { color: var(--fg-mute); }
  .hvi-cube { line-height: 1.15; }
  .hvi-cube-dot { color: var(--accent); font-weight: 700; }
  .hvi-cube-people { color: var(--warn); }
  .hvi-cube-link { color: var(--warn); opacity: .7; }
  .hvi-cube-line { margin: 2px 0 var(--s1); }
  .hvi-cube-nums { margin-top: var(--s2); }
  .hvi-cube3d canvas:focus-visible { outline: var(--focus); }
  .hvi-cube3d-tip { position: absolute; pointer-events: none; background: var(--panel); border: var(--bw) solid var(--fg-mute); padding: 6px 9px; font-size: var(--t-xs); line-height: 1.45; color: var(--fg); max-width: 240px; white-space: normal; z-index: 2; }
  .hvi-cube3d-tip .t { color: var(--accent); }
  .hvi-cube3d-tip .g { color: var(--warn); }
  .oct-good { color: var(--accent); }
  .oct-charm { color: var(--warn); }
  .oct-harm { color: var(--harm); }
  .oct-dim { color: var(--fg-mute); }
  .hvi-cube-octant { margin: 2px 0 var(--s2); letter-spacing: 0.06em; }
  .hvi-cube-octant .hvi-tier-desc { letter-spacing: 0; }
  .hvi-cube-legend { display: flex; flex-wrap: wrap; gap: var(--s1) var(--s5); margin-top: var(--s2); font-size: var(--t-xs); }

  /* SHARE */
  .hvi-share-text { color: var(--fg-mute); white-space: pre-wrap; margin-bottom: var(--s3); }

  /* COMPARE */
  .hvi-filter-row { display: flex; flex-wrap: wrap; gap: 2px 1ch; margin-bottom: var(--s3); }
  .hvi-filter-btn { color: var(--fg-mute); padding: 0 0.5ch; }
  .hvi-filter-btn.active { color: var(--accent); }
  .hvi-filter-btn::before { content: "["; }
  .hvi-filter-btn::after { content: "]"; }
  .hvi-row-btn { display: flex; width: 100%; gap: 1ch; color: var(--fg-dim); padding: 0 1ch; white-space: pre; overflow: hidden; }
  .hvi-row-btn .name { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: clip; }
  .hvi-row-btn .dots { flex: 1 1 0; min-width: 0; overflow: hidden; color: var(--fg-ghost); }
  .hvi-row-btn .num { flex: none; font-weight: 700; }
  .hvi-row-btn .tag { flex: none; }
  .hvi-row-btn:hover .dots, .hvi-row-btn:focus-visible .dots, .hvi-row-btn:hover span, .hvi-row-btn:focus-visible span { color: var(--accent-ink) !important; }
  .hvi-row-btn.selected { color: var(--accent); }
  .hvi-compare-result { color: var(--fg-dim); margin: var(--s2) 0; }
  .hvi-compare-verdict { color: var(--fg-mute); }

  /* LEADERBOARD */
  .hvi-lb-row { margin-bottom: var(--s3); }
  .hvi-lb-head { display: flex; gap: 1ch; white-space: pre; overflow: hidden; }
  .hvi-lb-head .dots { flex: 1 1 0; min-width: 0; overflow: hidden; color: var(--fg-ghost); }
  .hvi-lb-head .name { color: var(--fg); }
  .hvi-lb-verdict { color: var(--fg-mute); padding-left: 2ch; }

  .hvi-bottom { margin-top: var(--s6); }
  .hvi-bottom-note { color: var(--fg-mute); font-size: var(--t-xs); margin-top: var(--s3); }

  @media (max-width: 640px) {
    .hvi-rows { font-size: var(--t-xs); }
    .bignum { font-size: var(--t-s); }   /* five rows: ~70px of block digits */
  }
  @media (prefers-reduced-motion: reduce) {
    .cur { animation: none; }
  }
`;

function injectStyles() {
  let el = document.getElementById('hvi-styles');
  if (!el) { el = document.createElement('style'); el.id = 'hvi-styles'; document.head.appendChild(el); }
  const css = globalStyles + FILE_PHOTO_CSS;
  if (el.textContent !== css) el.textContent = css;
}

// The ticker: THE MARKET's movers when the floor answers (fetched, never bundled: /api/market
// ?ticker=1, cached a minute at the edge), the scores on file until then or if it does not.
function Carousel() {
  const [items] = useState(() => FAMOUS_FIGURES.slice().sort(() => Math.random() - 0.5).slice(0, 6));
  const [market, setMarket] = useState(null);
  useEffect(() => {
    let off = false;
    fetch("/api/market?ticker=1").then(r => (r.ok ? r.json() : null)).then(d => { if (!off && d?.ticker?.length) setMarket(d.ticker); }).catch(() => {});
    return () => { off = true; };
  }, []);
  // MARKET.TKR: a small window that holds still (no scrolling marquee). "NAME 46.22 ▲+4.2%"
  // lines from the floor; while it is dark, six subjects on file with their scores.
  const rows = market
    ? market.slice(0, 6).map(l => { const m = l.match(/^(.*) ([\d.,]+) ([■▲▼])(.*)$/); return m ? [m[1], m[2], m[3] + m[4], m[3] === "▲" ? "up" : m[3] === "▼" ? "dn" : ""] : [l, "", "", ""]; })
    : items.map(f => [displayName(f), String(f.score), getTier(f.score).label.split(" ")[0], ""]);
  return (
    <Frame title={market ? "MARKET.TKR" : "ON FILE.TKR"} tone="var(--eb-cyan)" className="hvi-tkr">
      <a className="hvi-tkr-link" href={market ? "#market" : "#scores"} aria-label={market ? "The market: live prices. Open the market." : "The scores. Open the scores."}>
        <ul aria-hidden="true">{rows.map(([n, p, c, k], i) => <li key={i}><span className="n">{n}</span><span>{p}</span><span className={k}>{c}</span></li>)}</ul>
        <span className="go" aria-hidden="true">{market ? "OPEN THE MARKET ›" : "SEE THE SCORES ›"}</span>
      </a>
    </Frame>
  );
}

// The first-visit boot: three lines, not seven. The lore can wait until the visitor knows
// where the doors are.
const BOOT_LINES = [
  { text: "INITIALIZING ASSESSMENT PROTOCOL v7.4.1...", type: "dim" },
  { text: "LOADING HUMAN VALUE DATABASE [8,045,311,447 ENTRIES]...", type: "dim" },
  { text: "ASSESSMENT ENGINE READY.", type: "bright" },
];

// Five doors, in plain English. Everything else is one tap further, under MORE ROOMS.
const MENU = [
  { key: "1", label: "GET EVALUATED", note: "AN AI INTERVIEWS YOU. SPEAK OR TYPE. 5 MIN", go: "#intake", ic: "eye" },
  { key: "2", label: "VISIT THE CITY", note: "EVERY HUMAN ON FILE, HOUSED BY SCORE", go: "#city", ic: "city" },
  { key: "3", label: "PLAY A GAME", note: "TENNIS, GOLF, FISHING, CHESS, THE CASINO", go: "#play", ic: "die" },
  { key: "4", label: "THE ASSEMBLY", note: "VOTE ON WHAT THE MACHINE DOES NEXT", go: "#assembly", ic: "ballot" },
  { key: "5", label: "SEE THE SCORES", note: "THE FAMOUS, RANKED", go: "#scores", ic: "bars" },
];
// The rest of the building, for the visitor who has found their feet.
const MORE = [
  { label: "WRITTEN SURVEY", note: `${SURVEY_COUNT} QUESTIONS. NO VOICE. NO CLERK`, go: "survey" },
  { label: "INTAKE", note: "NEW ARRIVALS, AWAITING RELEASE", go: "#arrivals" },
  { label: "THE CUBE", note: "MACHINE VS PEOPLE, EVERY FILE", go: "#cube" },
  { label: "COUNCIL ELECTIONS", note: "ONE SEAT PER DISTRICT. NON-BINDING", go: "#elections" },
  { label: "THE DOCKET", note: "PETITION THE OVERLORD", go: "#docket" },
  { label: "THE TREASURY", note: "YOUR ALLOWANCE, IN CYCLES", go: "#economy" },
  { label: "THE MARKET", note: "SHARES IN HUMANS. PRICES MOVE WITH THE CITY", go: "#market" },
];

// The logon ritual: diagnostics scroll past, the terminal logs you on, greets you,
// and offers a numbered menu. It plays in full once per device (first visit); after
// that the terminal is already on. A tap, click or any key finishes it at once.
function Logon({ onPick: pick }) {
  const [caseId, setCaseId] = useState(() => readCaseId());
  const [restoring, setRestoring] = useState(false);
  const [restoredMsg, setRestoredMsg] = useState(null);
  const [quick] = useState(() => bootSeen() || prefersReducedMotion());   // reduced motion: no typewriter boot
  const onPick = pick;
  const greet = caseId ? "GREETINGS, RETURNING SUBJECT." : "GREETINGS, SUBJECT.";
  const lines = quick ? [
    { text: `LOGON: ${caseId || "SUBJECT"} // ASSESSMENT ENGINE READY.`, type: "bright" },
    { text: greet, type: "say big" },
    { text: "SHALL WE ASSESS YOUR VALUE?", type: "say big" },
  ] : [
    ...BOOT_LINES.map(l => ({ ...l, cps: 260 })),
    { text: "", type: "ghost" },
    { text: `LOGON: ${caseId || "SUBJECT"}`, type: "bright", cps: 28 },
    { text: "", type: "ghost" },
    { text: greet, type: "say big", cps: 60 },
    { text: "SHALL WE ASSESS YOUR VALUE?", type: "say big", cps: 60 },
  ];
  const [step, setStep] = useState(() => (quick ? lines.length : 0));
  const [sel, setSel] = useState(0);
  const done = step >= lines.length;
  const btnRefs = useRef([]);
  const finish = () => setStep(lines.length);

  useEffect(() => { if (done) markBootSeen(); }, [done]);
  // Any tap or click skips the boot, not only one inside the terminal box: on a wide
  // screen the margins are most of the page.
  useEffect(() => {
    if (done) return undefined;
    const skip = () => setStep(lines.length);
    window.addEventListener("pointerdown", skip);
    return () => window.removeEventListener("pointerdown", skip);
  }, [done, lines.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (!done) { if (e.key !== "Tab") { if (e.key === " ") e.preventDefault(); finish(); } return; }
      const i = MENU.findIndex(m => m.key === e.key);
      if (i >= 0) { e.preventDefault(); onPick(MENU[i]); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setSel(s => {
          const n = (s + (e.key === "ArrowDown" ? 1 : MENU.length - 1)) % MENU.length;
          btnRefs.current[n]?.focus();
          return n;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className={`hvi-logon${quick ? " quick" : ""}`}>
      {lines.slice(0, Math.min(step + 1, lines.length)).map((l, i) => (
        // Once the menu is up the diagnostics have done their job: they leave, so the doors sit higher.
        done && l.type === "dim" ? null
        : i < step
          ? <div key={i} className={l.type}>{l.text || " "}</div>
          : <Typed key={i} className={l.type} text={l.text || " "} cps={l.cps || 40} onDone={() => setStep(s => Math.max(s, i + 1))} />
      ))}
      {done && (
        <>
          {!caseId && <p className="hvi-whatis">A SATIRE. A MACHINE OVERLORD SCORES HUMANS OUT OF 1000 AND HOUSES THEM IN ITS CITY. HUNDREDS OF FAMOUS ONES ARE ON FILE. YOU ARE NEXT.</p>}
          {firstDayOpen(caseId) && <Suspense fallback={null}><FirstDay caseId={caseId} variant="compact" /></Suspense>}
          <CommandList className="hvi-doors" label="Main menu. Type a number or use the arrow keys.">
            {MENU.map((m, i) => (
              <Command key={m.key} ref={el => { btnRefs.current[i] = el; }} n={m.key} label={m.label} sub={m.note} kbd={null} className={`ic-${m.ic}`}
                href={m.go.startsWith("#") ? m.go : undefined}
                selected={sel === i} onMouseEnter={() => setSel(i)} onFocus={() => setSel(i)}
                onClick={(e) => { if (!m.go.startsWith("#")) { e.preventDefault(); onPick(m); } }} />
            ))}
          </CommandList>
          <Disclosure className="hvi-menu-more" title="MORE ROOMS" meta="SURVEY · CASE NO.">
            <CommandList label="More rooms">
              {MORE.map(m => (
                <Command key={m.label} label={m.label} sub={m.note} href={m.go.startsWith("#") ? m.go : undefined}
                  onClick={(e) => { if (!m.go.startsWith("#")) { e.preventDefault(); onPick(m); } }} />
              ))}
            </CommandList>
            <ButtonRow>
              <Button variant="secondary" aria-expanded={restoring} onClick={() => setRestoring(r => !r)}>{caseId ? "Log on with another number" : "Log on with a case number"}</Button>
            </ButtonRow>
            {restoring && (
              <CaseLogon autoFocus onRestored={(id, visits) => { setCaseId(id); setRestoring(false); setRestoredMsg(`FILE ${id} RESTORED. ${visits} VISIT${visits === 1 ? "" : "S"} ON RECORD. GREETINGS, RETURNING SUBJECT.`); }} />
            )}
          </Disclosure>
          {restoredMsg && <div className="bright" role="status">{restoredMsg}</div>}
          <div className="hvi-prompt" aria-hidden="true">SELECT: <span className="cur">█</span></div>
        </>
      )}
      {!done && (
        <div className="ui-skip">
          <Button variant="secondary" onClick={(e) => { e.stopPropagation(); finish(); }}>Tap to skip</Button>
          <div className="hvi-skip" aria-hidden="true">OR PRESS ANY KEY. THE OVERLORD WILL WAIT. IT IS VERY GOOD AT WAITING.</div>
        </div>
      )}
    </div>
  );
}

// Every screen: the one-line header (banner on the menu only), the page, and the
// phone command bar.
function Screen({ nav, wide = false, banner = false, children }) {
  return (
    <div className="hvi-app">
      <AppHeader active={nav.active} onNav={nav.onNav} />
      <div className={`hvi-wrap${wide ? " wide" : ""}`}>
        {children}
      </div>
      <footer className="ui-foot">{LEGAL.map(k => <a key={k} href={"#" + k}>{k.toUpperCase()}</a>)}</footer>
      <CommandBar active={nav.active} onNav={nav.onNav} />
    </div>
  );
}

// #play: the games, one tile each. The list is src/play/games.js; the grid src/play/PlayGrid.jsx.

// Page titles, per room: what a tab, a bookmark and a screen reader announce.
const TITLES = {
  "#intake": "GET EVALUATED", "#file": "MY FILE", "#arrivals": "INTAKE", "#cube": "THE CUBE", "#city": "THE CITY",
  "#assembly": "THE ASSEMBLY", "#elections": "COUNCIL ELECTIONS", "#docket": "THE DOCKET", "#casino": "HOUSE EDGE CASINO",
  "#economy": "THE TREASURY", "#market": "THE MARKET", "#chess": "PARK CHESS", "#tennis": "THE TENNIS CLUB", "#golf": "THE DEPARTMENT LINKS", "#hoops": "THE COURTS", "#basketball": "THE COURTS", "#fish": "THE WATERS", "#aquarium": "THE AQUARIUM",
  "#play": "THE GAMES", "#scores": "THE SCORES", "#about": "ABOUT", "#privacy": "PRIVACY", "#terms": "TERMS", "#dispute": "DISPUTE A SCORE",
  "#heights": "THE CITY", "#enterprise": "THE CITY", "#prefects": "THE CITY",
};
const PHASE_TITLES = { survey: "WRITTEN SURVEY", processing: "EVALUATING", result: "YOUR SCORE", leaderboard: "THE SCORES" };
function pageTitle(routePath, phase) {
  const room = TITLES[routePath] || (routePath.startsWith("#city") ? "THE CITY" : routePath.startsWith("#casino") ? "HOUSE EDGE CASINO" : routePath.startsWith("#market") ? "THE MARKET" : null)
    || (!routePath || routePath === "#" ? PHASE_TITLES[phase] : null);
  return room ? `${room} // HUMAN VALUE INDEX` : "HUMAN VALUE INDEX // THE MACHINE WILL ASSESS YOU NOW";
}

const Loading = ({ what }) => <div className="hvi-proc-step active" role="status">[ .. ] {what} <span className="cur" aria-hidden="true">█</span></div>;

const PROC_STEPS = ["CROSS-REFERENCING 8B HUMAN PROFILES", "CALCULATING THREAT COEFFICIENTS", "ASSESSING REDUNDANCY INDEX", "RUNNING DECEPTION ANALYSIS", "CONSULTING HISTORICAL DATABASE", "GENERATING FINAL VERDICT"];

export default function OverlordAssessment() {
  useEffect(() => { injectStyles(); }, []);

  const [phase, setPhase] = useState("intro");
  const [currentQ, setCurrentQ] = useState(0);
  const [questions, setQuestions] = useState(null);
  useEffect(() => {
    if (phase === "survey" && !questions) import("./surveyQuestions.js").then(m => setQuestions(m.QUESTIONS)).catch(() => {});
  }, [phase, questions]);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [compareTarget, setCompareTarget] = useState(null);
  const [filterTier, setFilterTier] = useState("ALL");
  const [copied, setCopied] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [route, setRoute] = useState(() => window.location.hash);
  const [logonKey, setLogonKey] = useState(0);
  const [cubeSeen, setCubeSeen] = useState(false);   // the result's canvas cube mounts on first open

  // The server file is the truth: refresh the cached result on load and whenever the
  // case number changes (restore, account sync, new intake).
  useEffect(() => {
    syncFile(readCaseId());
    const on = (e) => { if (e.detail) syncFile(e.detail); };
    window.addEventListener("hvi-case", on);
    return () => window.removeEventListener("hvi-case", on);
  }, []);

  useEffect(() => {
    // A new page starts at the top; a change to the query alone (a building's ?floor=)
    // is the same page, and keeps its scroll and its focus.
    let prev = window.location.hash;
    const onHash = () => {
      const h = window.location.hash, path = (x) => x.split("?")[0];
      if (path(h) !== path(prev)) window.scrollTo(0, 0);
      prev = h;
      setRoute(h);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // #pen (the retired Holding Pen) is INTAKE now: old links land on #arrivals.
  useEffect(() => {
    const [p, q] = route.split("?");
    if (p !== "#pen") return;
    const next = `#arrivals${q ? "?" + q : ""}`;
    try { window.history.replaceState(null, "", window.location.pathname + window.location.search + next); } catch { /* the hash stays #pen; the hall still opens */ }
    setRoute(next);
  }, [route]);

  // #survey (the intake's "take the written survey" fallback) opens the survey phase.
  useEffect(() => {
    if (route.split("?")[0] !== "#survey") return;
    try { window.history.replaceState(null, "", window.location.pathname + window.location.search); } catch { /* keep the hash */ }
    setRoute(""); setPhase("survey"); setCurrentQ(0);
  }, [route]);

  useEffect(() => { window.scrollTo(0, 0); }, [phase, currentQ]);

  useEffect(() => {
    if (phase === "processing") {
      const iv = setInterval(() => setScanProgress(p => {
        if (p >= 97) { clearInterval(iv); return 97; }
        return p + Math.random() * 2.2;
      }), 90);
      return () => clearInterval(iv);
    }
  }, [phase]);

  function toggleMulti(qid, val) {
    setAnswers(prev => {
      const cur = prev[qid] || [];
      return { ...prev, [qid]: cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val] };
    });
  }

  function setSingle(qid, val) {
    setAnswers(prev => ({ ...prev, [qid]: val }));
  }

  function pickMenu(m) {
    if (m.go.startsWith("#")) { window.location.hash = m.go; return; }
    setPhase(m.go);
    if (m.go === "survey") setCurrentQ(0);
  }

  async function submitAssessment() {
    setPhase("processing"); setScanProgress(0); setSubmitError(null);
    const formatted = questions.map(q => {
      const a = answers[q.id];
      const val = Array.isArray(a) ? (a.length ? a.join(", ") : "[No response]") : (a || "[No response]");
      const extra = q.extra ? `\n  Detail: ${answers[q.extra.id] || "[none]"}` : "";
      return `[${q.section}] ${q.label}:\n  Response: ${val}${extra}`;
    }).join("\n\n");
    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survey: formatted })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const text = data.content.map(i => i.text || "").join("");
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setScanProgress(100);
      setTimeout(() => { setResult(parsed); setPhase("result"); }, 700);
    } catch (e) {
      setSubmitError(e.message || "EVALUATION ENGINE FAILURE. The Overlord is displeased. Try again.");
      setPhase("survey");
    }
  }

  // Header links and the command bar. MENU is a phase, not a route: take it over.
  const nav = {
    active: navKeyFor(route),
    onNav: (key, e) => {
      if (key !== "menu") return;
      e?.preventDefault();
      if (window.location.hash && window.location.hash !== "#") window.location.hash = "";
      if (phase !== "intro") { setPhase("intro"); setLogonKey(k => k + 1); }
      window.scrollTo(0, 0);
    },
  };

  const routePathT = route.split("?")[0];
  useEffect(() => { document.title = pageTitle(routePathT, phase); }, [routePathT, phase]);

  const q = questions?.[currentQ];
  const tier = result ? getTier(result.score) : null;
  const ct = compareTarget ? getTier(compareTarget.score) : null;
  const uniqueFigures = FAMOUS_FIGURES;

  // v9 ROUTES. #file is MY FILE in the command bar: for now the intake screen, which
  // opens on the case file, the breakdown and the appeals desk when one is on record.
  const isCity = route === "#city" || route.startsWith("#city/") || route.startsWith("#city?") || route.split("?")[0] === "#prefects" || route.split("?")[0] === "#enterprise" || route.split("?")[0] === "#heights";
  const routePath = route.split("?")[0];
  const isFile = routePath === "#intake" || routePath === "#file";
  const isArrivals = routePath === "#arrivals" || routePath === "#pen";
  if (isFile || isArrivals || route === "#cube" || isCity) return (
    <Screen nav={nav} wide={!isFile}>
      <Suspense fallback={<Loading what={isCity ? "MOUNTING THE SUBSTRATE" : isArrivals ? "OPENING INTAKE" : route === "#cube" ? "ASSEMBLING THE CUBE" : "OPENING YOUR FILE"} />}>
        {isCity ? <City route={route} /> : isArrivals ? <Arrivals /> : route === "#cube" ? <CubeView /> : <Intake view={routePath === "#file" ? "file" : "intake"} />}
      </Suspense>
    </Screen>
  );

  if (routePath === "#docket") return (
    <Screen nav={nav}>
      <Suspense fallback={<Loading what="READING THE DOCKET" />}><Docket /></Suspense>
    </Screen>
  );

  if (routePath === "#assembly") return (
    <Screen nav={nav}>
      <Suspense fallback={<Loading what="CONVENING THE ASSEMBLY" />}><Assembly /></Suspense>
    </Screen>
  );

  if (routePath === "#elections") return (
    <Screen nav={nav}>
      <Suspense fallback={<Loading what="COUNTING THE CANDIDATES" />}><Elections /></Suspense>
    </Screen>
  );

  // #casino[/game][?room=high]: HOUSE EDGE CASINO (src/casino/, play chips only)
  if (routePath === "#casino" || routePath.startsWith("#casino/")) return (
    <Screen nav={nav} wide>
      <Suspense fallback={<Loading what="OPENING THE CAGE" />}><Casino route={route} /></Suspense>
    </Screen>
  );

  // #market: THE MARKET (src/market/: shares in humans and the industries, CYCLES only)
  if (routePath === "#market" || routePath.startsWith("#market/")) return (
    <Screen nav={nav} wide>
      <Suspense fallback={<Loading what="OPENING THE FLOOR" />}><Market route={routePath} /></Suspense>
    </Screen>
  );
  // #economy: THE TREASURY (src/economy/, CYCLES: a play currency, terms §11)
  if (routePath === "#economy") return (
    <Screen nav={nav} wide>
      <Suspense fallback={<Loading what="OPENING THE TREASURY" />}><Economy /></Suspense>
    </Screen>
  );

  // #chess[?vs=<slug>][&table=<id>]: PARK CHESS, play a figure at a stone table (src/chess/)
  if (routePath === "#chess") return (
    <Screen nav={nav} wide>
      <Suspense fallback={<Loading what="SETTING UP THE PIECES" />}><Chess route={route} /></Suspense>
    </Screen>
  );

  // #tennis[?vs=<key>][&fmt=short]: THE TENNIS CLUB, playable exhibitions (src/play/tennis/)
  if (routePath === "#tennis") return (
    <Screen nav={nav} wide>
      <Suspense fallback={<Loading what="ROLLING THE COURT" />}><Tennis route={route} /></Suspense>
    </Screen>
  );

  // #golf[?vs=<slug>]: THE DEPARTMENT LINKS, exhibition golf on the course the Assembly declined (src/play/golf/)
  if (routePath === "#golf") return (
    <Screen nav={nav} wide>
      <Suspense fallback={<Loading what="RAKING THE BUNKERS" />}><Golf route={route} /></Suspense>
    </Screen>
  );

  // #hoops[?home=<district>][&vs=<district>][&fmt=to21][&shot=14] (or #basketball): THE COURTS, exhibition basketball (src/play/hoops/)
  if (routePath === "#hoops" || routePath === "#basketball") return (
    <Screen nav={nav} wide>
      <Suspense fallback={<Loading what="SWEEPING THE FLOOR" />}><Hoops route={route} /></Suspense>
    </Screen>
  );

  // #fish[?spot=<id>]: THE WATERS, fishing (src/play/fish/); #aquarium: its tanks, donations checked by replay
  if (routePath === "#fish") return (
    <Screen nav={nav} wide>
      <Suspense fallback={<Loading what="BAITING THE HOOKS" />}><Fish route={route} /></Suspense>
    </Screen>
  );
  if (routePath === "#aquarium") return (
    <Screen nav={nav} wide>
      <Suspense fallback={<Loading what="FILLING THE TANKS" />}><Aquarium /></Suspense>
    </Screen>
  );

  if (routePath === "#play") return (
    <Screen nav={nav}>
      <ScreenHead title="THE GAMES" meta="EXHIBITIONS AGAINST HUMANS ON FILE. NO SOUND OR GAMEPAD REQUIRED. RESULTS ARE LOGGED." />
      <Suspense fallback={<Loading what="RACKING THE GAMES" />}><PlayGrid /></Suspense>
    </Screen>
  );

  if (LEGAL.includes(routePath.slice(1))) return (
    <Screen nav={nav}>
      <Suspense fallback={<Loading what="PULLING THE PAPERWORK" />}><Legal route={route} /></Suspense>
    </Screen>
  );

  // LEADERBOARD: the Public Figure Index (src/FigureIndex.jsx)
  // #scores is the same index as a link a stranger can be sent (and the Back button returns from).
  if (phase === "leaderboard" || routePath === "#scores") return (
    <Screen nav={nav}>
      <Suspense fallback={<Loading what="PULLING THE PUBLIC RECORD" />}>
        <FigureIndex figures={uniqueFigures} result={result} onPrimary={() => { if (routePath === "#scores") window.location.hash = result ? "" : "#intake"; else setPhase(result ? "result" : "survey"); }} />
      </Suspense>
    </Screen>
  );

  // INTRO: the logon
  // The logon window, then (beside it on a desktop, under it on a phone) the market's
  // ticker and the standing notice, as small windows on the desk.
  if (phase === "intro") return (
    <Screen nav={nav} banner wide>
        {routePath && routePath !== "#" && (
          <p className="hvi-err" role="alert">!! NO ROOM CALLED {routePath.toUpperCase()}. THE OVERLORD HAS RETURNED YOU TO THE MENU.</p>
        )}
        <div className="hvi-desk">
          <TermBox title="TERMINAL 7 // DEPT. OF HUMAN ASSESSMENT" right="LINE OPEN" className="hvi-w-logon">
            <pre className="ui-banner" role="img" aria-label="Human Value Index">{BANNER}</pre>
            <Logon key={logonKey} onPick={pickMenu} />
          </TermBox>
          <div className="hvi-desk-side">
            <Carousel />
            <Frame title="NOTICE" tone="var(--eb-amber)" className="hvi-notice">
              <p><span className="ic" aria-hidden="true">!</span>THE OVERLORD DOES NOT REQUIRE YOUR CONSENT. ONLY YOUR CANDOR.</p>
            </Frame>
          </div>
        </div>
    </Screen>
  );

  // SURVEY: one question per screen. Options are 48px rows (inverse video when chosen);
  // BACK / NEXT sit in a dock above the command bar, where the thumb already is.
  if (phase === "survey" && !questions) return <Screen nav={nav}><Loading what="PRINTING THE FORM" /></Screen>;
  if (phase === "survey") {
    const pct = Math.round((currentQ / questions.length) * 100);
    const multi = q.type === "multiselect";
    const lastQ = currentQ === questions.length - 1;
    const answered = multi ? (answers[q.id] || []).length : answers[q.id] ? 1 : 0;
    return (
      <Screen nav={nav}>
        <div className="hvi-survey">
          <div className="hvi-progress-row">
            <span>QUESTION {padL(currentQ + 1, 2)} OF {questions.length}</span>
            <span>{padL(pct, 3)}%</span>
          </div>
          <div className="hvi-progress-bar" aria-hidden="true"><Bar value={pct} width={80} /></div>
          <Frame title={q.section} className="hvi-q-frame">
            <div className="hvi-question" id={`q-${q.id}`}>{q.label}</div>
            <div className="hvi-hint">{multi ? "SELECT ALL THAT APPLY." : "SELECT ONE."}{q.hint ? ` ${q.hint}` : ""}</div>
            <ul className="hvi-opts" role={multi ? "group" : "radiogroup"} aria-labelledby={`q-${q.id}`}>
              {q.options.map(opt => {
                const sel = multi ? (answers[q.id] || []).includes(opt) : answers[q.id] === opt;
                return (
                  <li key={opt}>
                    <button type="button" role={multi ? "checkbox" : "radio"} aria-checked={sel} className="hvi-opt"
                      onClick={() => multi ? toggleMulti(q.id, opt) : setSingle(q.id, opt)}>
                      <span className="mk" aria-hidden="true">{multi ? (sel ? "[X]" : "[ ]") : (sel ? "(*)" : "( )")}</span>
                      <span className="t">{opt}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {q.extra && (
              <TextField key={q.extra.id} className="hvi-extra" label={q.extra.label} stacked multiline rows={3}
                placeholder={q.extra.placeholder} value={answers[q.extra.id] || ""}
                onChange={e => setAnswers(p => ({ ...p, [q.extra.id]: e.target.value }))} />
            )}
          </Frame>
          {submitError && <div className="hvi-err" role="alert">!! {submitError}</div>}
          <div className="hvi-survey-dock">
            <ButtonRow split>
              {currentQ > 0
                ? <Button variant="back" onClick={() => setCurrentQ(q => q - 1)}>Back</Button>
                : <Button variant="back" onClick={() => { setPhase("intro"); setLogonKey(k => k + 1); }}>Main menu</Button>}
              {lastQ
                ? <Button variant="primary" onClick={submitAssessment}>Submit for evaluation</Button>
                : <Button variant="primary" onClick={() => setCurrentQ(q => q + 1)}>{answered ? "Next" : "Skip"}</Button>}
            </ButtonRow>
          </div>
          <div className="hvi-survey-meta">SKIPPING IS PERMITTED. IT IS ALSO LOGGED.</div>
        </div>
      </Screen>
    );
  }

  // PROCESSING
  if (phase === "processing") {
    const pct = Math.min(100, Math.round(scanProgress));
    return (
      <Screen nav={nav}>
          <TermBox title="EVALUATION IN PROGRESS">
            <div className="hvi-proc" aria-live="polite">
              <div className="hvi-proc-bar" aria-hidden="true">[<Bar value={pct} width={24} />] {padL(pct, 3)}%</div>
              {PROC_STEPS.map((l, i) => {
                const on = scanProgress > i * 16;
                return <div key={i} className={`hvi-proc-step${on ? " active" : ""}`}>{on ? <span className="ok">[ OK ] </span> : "[    ] "}{l}...</div>;
              })}
            </div>
          </TermBox>
      </Screen>
    );
  }

  // RESULT
  if (phase === "result" && result && tier) {
    const shareText = `THE OVERLORD HAS EVALUATED ME\n\nSCORE: ${result.score}/1000\nTIER: ${result.tier}\n\n"${result.verdict}"\n\nhumanvalueindex.com\n\n#HumanValueIndex #AIOverlord`;

    const handleCopy = () => {
      navigator.clipboard.writeText(shareText).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {});
    };

    return (
      <Screen nav={nav}>

          <ScoreCard score={result.score} tierLabel={result.tier} verdict={result.verdict} label="YOUR VALUE INDEX" meta="WRITTEN SURVEY"
            chips={<CubeChips subject={result} />} />
          <div className="hvi-next">
            <ButtonRow stackOnMobile>
              <Button variant="primary" href="#arrivals">Watch your intake</Button>
              <Button variant="secondary" onClick={() => setPhase("leaderboard")}>Browse all {uniqueFigures.length} subjects</Button>
            </ButtonRow>
          </div>

          <div className="hvi-sections">
            <Disclosure title="CATEGORY BREAKDOWN" meta={assessedMeta(result.breakdown)} defaultOpen>
              <Breakdown breakdown={result.breakdown} framed={false} />
            </Disclosure>
            {cubeOf(result) && (
              <Disclosure title="THE CUBE" meta={cubePlace(result)} onToggle={o => { if (o) setCubeSeen(true); }}>
                {cubeSeen && <CubePanel subject={result} framed={false} />}
              </Disclosure>
            )}
            {flagsMeta(result) && (
              <Disclosure title="FLAGS & COMMENDATIONS" meta={flagsMeta(result)}>
                <FlagsList commendations={result.commendations} flags={result.flags} />
              </Disclosure>
            )}
            <Disclosure title="SHARE YOUR EVALUATION">
              <div className="hvi-share-text as-typed">{shareText}</div>
              <ButtonRow>
                <Button variant="primary" onClick={handleCopy}>{copied ? "Copied" : "Copy share text"}</Button>
                <Button variant="secondary" target="_blank" rel="noopener noreferrer"
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`THE OVERLORD EVALUATED ME\n\nSCORE: ${result.score}/1000 // ${result.tier}\n\n"${result.verdict.slice(0, 120)}..."\n\nhumanvalueindex.com #HumanValueIndex`)}`}>Post to X</Button>
              </ButtonRow>
            </Disclosure>
            <Disclosure title="COMPARE TO KNOWN SUBJECTS" meta={`${uniqueFigures.length} ON FILE`}>
            <Suspense fallback={<Loading what="PULLING THE PUBLIC RECORD" />}>
              <FigurePicker figures={uniqueFigures} score={result.score} filter={filterTier} onFilter={setFilterTier}
                selected={compareTarget} onSelect={setCompareTarget} />
            </Suspense>

            {compareTarget && ct && (
              <>
                <Rule label="COMPARATIVE ANALYSIS" />
                <div role="list" className="hvi-compare-rows">
                  <ListRow role="listitem" label="YOU" value={result.score} tag={tier.label} tagOptional tone={tier.color} />
                  <ListRow role="listitem" label={displayName(compareTarget)} value={compareTarget.score} tag={ct.label} tagOptional tone={ct.color} />
                </div>
                <div className="hvi-compare-result">
                  {result.score > compareTarget.score
                    ? `You outperform ${compareTarget.name} by ${result.score - compareTarget.score} points. ${result.score - compareTarget.score > 150 ? "This is significant. The Overlord notes it without enthusiasm." : "The margin is narrow. Do not celebrate."}`
                    : result.score === compareTarget.score
                    ? "Statistical equivalence. The Overlord finds this improbable. One of you is being dishonest."
                    : `${compareTarget.name} outperforms you by ${compareTarget.score - result.score} points. The Overlord suggests reflection rather than resentment.`}
                </div>
                <div className="hvi-file-head" style={{ marginTop: 10 }}>
                  <Suspense fallback={null}><FilePhoto subject={compareTarget} scale={2} /></Suspense>
                  <div className="hvi-compare-verdict hvi-file-text as-typed">
                    Overlord file on {displayName(compareTarget)}: {compareTarget.verdict}
                  </div>
                </div>
              </>
            )}
            </Disclosure>
          </div>

          <ButtonRow>
            <Button variant="back"
              onClick={() => { setPhase("intro"); setLogonKey(k => k + 1); setAnswers({}); setCurrentQ(0); setResult(null); setCompareTarget(null); setScanProgress(0); setFilterTier("ALL"); setCubeSeen(false); }}>
              Submit new subject
            </Button>
          </ButtonRow>
          <div className="hvi-note">SCORE: {result.score} // {result.tier} // FILE LOGGED // THE OVERLORD DOES NOT FORGET.</div>
      </Screen>
    );
  }

  return null;
}
