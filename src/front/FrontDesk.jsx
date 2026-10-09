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
//   NOTICE BOARD    the city's posted notices: the polls, the Assembly, prefects' orders, the docket, the
//                   shops (/api/paper, notices.js)
// Every list is a real list for a screen reader; arrows and signs carry direction, not colour.
// Since 2026-10-06 the visitor picks the windows (WIDGETS, src/front/prefs.js) and, as on a phone's
// home screen, drags them into spots and picks a size for each (the grid: src/front/layout.js;
// ARRANGE under the desk). Every widget has a prepared layout per size, its VIEWS_<id> table:
// S one item (a slow cycle, or a dense readout), M, T tall, L richer, W four columns wide. Each widget past the first four is its own
// lazy chunk, fetched only when it is on the desk. MORE ROOMS' DISPLAY and WIDGETS open their
// dialogs here (DeskPrefs.jsx).
// Two zones on a wide screen (layout.js): the COLUMN beside the logon panel (S, M, T and L; it widens itself for a
// M or a L) and the MAIN grid under both; drag a window between them in ARRANGE. A grip in a window's bottom-right corner resizes it, snapping to the
// nearest prepared size with an outline preview; the S M T L W buttons stay for the keyboard.
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Frame, Chip, Chips, Button, ButtonRow } from "../ui/index.js";
import { WIDGETS } from "./prefs.js";
import { SIZE, SIZE_NAME, SIZES_OF, colsFor, effSize, spans, loadLayout, saveLayout, DEFAULT_LAYOUT, moveTo, resize, removeId, fromIds, keyAction, zoneOf, toZone, snapSize, cellsAt, colTracks, railBeside, colWide, sizesIn } from "./layout.js";
import { useCycle, Cyc, Step } from "./cycle.jsx";
import { noticeItems } from "./notices.js";
import { FAMOUS_FIGURES, getTier, displayName } from "../figures.js";
import Sparkline from "../ui/Sparkline.jsx";   // the MOVEMENT LOG beside a name (src/ui/spark.js)
import "./front.css";

const flat = (x) => Math.abs(x) < 0.0005;
export const fmtPct = (x) => (flat(x) ? "0.0%" : `${x > 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}%`);
export const arrow = (x) => (flat(x) ? "■" : x > 0 ? "▲" : "▼");
const price = (p) => (Number(p) || 0).toFixed(2);
const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const getJSON = (u) => fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null);
const nameOf = (id) => WIDGETS.find(w => w.id === id)?.name || id;

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
  board: lazy(() => import("./Leaderboard.jsx")),
};
const DeskPrefs = lazy(() => import("./DeskPrefs.jsx"));
const NOW = { market: MarketTkr, wire: WireTkr, cam: SubstrateCam, notice: Notice };

// ---- the grid -----------------------------------------------------------------------------------
export default function FrontDesk({ dialog = null, onDialog = () => {} }) {
  const [layout, setLayout] = useState(loadLayout);
  const [arr, setArr] = useState(false);      // ARRANGE: the edit mode
  const [say, setSay] = useState("");
  const [cols, setCols] = useState(4);
  const [rcols, setRcols] = useState(2);      // the column's tracks (1 or 2)
  const [beside, setBeside] = useState(() => { try { return railBeside(window.innerWidth); } catch { return true; } });
  const [rz, setRz] = useState(null);         // { id, size, w, h, m } while a window's corner is dragged
  const [drag, setDrag] = useState(null);     // { id, x, y } while a window is held
  const grid = useRef(null), railEl = useRef(null), wrap = useRef(null), live = useRef(layout), focusId = useRef(null);
  live.current = layout;
  const rcolsRef = useRef(2);
  rcolsRef.current = rcols;
  const apply = (l, keep = true) => { live.current = l; setLayout(l); if (keep) saveLayout(l); };

  useLayoutEffect(() => {
    const el = grid.current;
    if (!el) return undefined;
    const fit = () => setCols(colsFor(el.clientWidth));
    fit();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // the rail beside the panel needs the width (900px); under that it merges into the one column
  useEffect(() => {
    const on = () => setBeside(railBeside(window.innerWidth));
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  useLayoutEffect(() => {
    const el = railEl.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const fit = () => setRcols(colTracks(el.clientWidth));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [beside]);
  // a keyed reorder moves the node and drops its focus: give it back
  useEffect(() => { if (focusId.current) { wrap.current?.querySelector(`[data-wid="${focusId.current}"]`)?.focus({ preventScroll: true }); focusId.current = null; } });
  useEffect(() => {
    if (!arr) return undefined;
    const esc = (e) => { if (e.key === "Escape" && !document.querySelector("dialog[open]")) setArr(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [arr]);

  // the GAMEPAD LAYER (src/ui/padLayer.js): A grabs a window, the sticks press its arrow keys and
  // LT / RT its - / +, A drops it where it is, B puts the whole desk back as it was at the grab
  const [padHeld, setPadHeld] = useState(null);
  const padWas = useRef(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const on = (e) => {
      const id = e.target.closest?.("[data-wid]")?.dataset.wid;
      if (!id) return;
      if (e.detail === "grab") { padWas.current = live.current; setPadHeld(id); setSay(`${nameOf(id)} PICKED UP. MOVE IT TO A NEW SPOT.`); }
      else if (e.detail === "drop") { setPadHeld(null); saveLayout(live.current); const i = live.current.findIndex(x => x.id === id); setSay(`${nameOf(id)} DROPPED AT ${i + 1} OF ${live.current.length}.`); }
      else if (e.detail === "cancel") { setPadHeld(null); if (padWas.current) { focusId.current = id; apply(padWas.current); } setSay(`${nameOf(id)} PUT BACK.`); }
    };
    el.addEventListener("hvi-pad-arrange", on);
    return () => el.removeEventListener("hvi-pad-arrange", on);
  }, []);
  useEffect(() => { if (!arr) setPadHeld(null); }, [arr]);

  const onKey = (id) => (e) => {
    if (e.target !== e.currentTarget) return;
    const r = keyAction(live.current, id, e.key);
    if (!r) return;
    e.preventDefault();
    focusId.current = r.layout.some(x => x.id === id) ? id : r.layout[0]?.id;
    apply(r.layout);
    setSay(r.say);
  };

  // pointer events: a mouse or pen drags from anywhere on the window once it moves; a finger drags
  // from the grip at once, or from anywhere after a long press (like holding an icon on a phone)
  const down = (id) => (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    const touch = e.pointerType === "touch" && !e.target.closest(".fr-grip");
    const from = { x: e.clientX, y: e.clientY };
    let held = false, timer = null, last = null;
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up); window.removeEventListener("touchmove", stop);
      document.documentElement.classList.remove("fr-dragging");
      if (held) { setDrag(null); apply(live.current); saveLayout(live.current); const i = live.current.findIndex(x => x.id === id); setSay(`${nameOf(id)} DROPPED AT ${i + 1} OF ${live.current.length}.`); }
    };
    const begin = () => { held = true; setDrag({ id, ...from }); setSay(`${nameOf(id)} PICKED UP. MOVE IT TO A NEW SPOT.`); document.documentElement.classList.add("fr-dragging"); };
    const stop = (ev) => { if (held) ev.preventDefault(); };
    function move(ev) {
      if (!held) {
        if (Math.hypot(ev.clientX - from.x, ev.clientY - from.y) > 6) { if (touch) done(); else begin(); }
        return;
      }
      setDrag({ id, x: ev.clientX, y: ev.clientY });
      const hit = document.elementFromPoint(ev.clientX, ev.clientY), over = hit?.closest("[data-wid]")?.dataset.wid, zoneAt = hit?.closest("[data-zone]")?.dataset.zone;
      const me = live.current.find(x => x.id === id);
      if (!over && zoneAt && me && zoneAt !== zoneOf(me)) { last = null; apply(toZone(live.current, id, zoneAt, null, rcolsRef.current), false); setSay(`${nameOf(id)} OVER THE ${zoneAt === "rail" ? "COLUMN" : "MAIN GRID"}.`); return; }   // an empty patch of the other zone
      if (!over || over === id) { if (over === id) last = null; return; }
      if (over === last) return;   // one move per cell entered, so equal-sized neighbours do not trade back and forth
      last = over;
      const oz = zoneOf(live.current.find(x => x.id === over) || me);
      if (me && oz !== zoneOf(me)) apply(toZone(live.current, id, oz, over, rcolsRef.current), false);   // into the other zone: the column takes only a size that fits
      else apply(moveTo(live.current, id, live.current.findIndex(x => x.id === over)), false);
    }
    function up() { done(); }
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up); window.addEventListener("touchmove", stop, { passive: false });
    if (touch) timer = setTimeout(begin, 380);
    else if (e.target.closest(".fr-grip")) begin();
  };

  const sizeTo = (id, size) => {
    const was = zoneOf(live.current.find(x => x.id === id) || {});
    const n = resize(live.current, id, size);
    apply(n);
    setSay(`${nameOf(id)} NOW ${SIZE_NAME[size]}, ${SIZE[size][0]} BY ${SIZE[size][1]}${was === "rail" && zoneOf(n.find(x => x.id === id)) === "main" ? ", MOVED OUT OF THE COLUMN INTO THE MAIN GRID" : ""}.`);
  };
  // the corner grip: the pointer's travel from the window's top-left is cells; the nearest prepared size is the
  // outline, applied on release (the layout does not jump while it is held)
  const grip = (id, zone, gcols) => (e) => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const cell = e.currentTarget.closest("[data-wid]"), gridEl = cell.parentElement, cs = getComputedStyle(gridEl);
    const gap = parseFloat(cs.columnGap) || 12, rowGap = parseFloat(cs.rowGap) || gap, row = parseFloat(cs.gridAutoRows) || 196;
    const col = (gridEl.clientWidth - gap * (gcols - 1)) / gcols, m = { col, row, gap, rowGap };
    const rect = cell.getBoundingClientRect(), was = live.current.find(x => x.id === id)?.size;
    let size = was;
    document.documentElement.classList.add("fr-dragging");
    const show = (ev) => {
      const { w, h } = cellsAt(ev.clientX - rect.left, ev.clientY - rect.top, { col, row, gap: (gap + rowGap) / 2 }, gcols);
      size = snapSize(id, w, h, gcols, zone);
      setRz({ id, size, m, gcols });
    };
    const mv = (ev) => show(ev);
    const stop = (ev) => ev.preventDefault();
    const up = () => {
      window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); window.removeEventListener("touchmove", stop);
      document.documentElement.classList.remove("fr-dragging");
      setRz(null);
      if (size && size !== was) sizeTo(id, size);
    };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up); window.addEventListener("touchmove", stop, { passive: false });
    show(e);
  };
  const take = (id) => { apply(removeId(live.current, id)); setSay(`${nameOf(id)} REMOVED FROM THE DESK.`); };

  const cell = ({ id, size }, zone, gcols) => {
    const W = NOW[id] || LAZY[id];
    if (!W) return null;
    const eff = effSize(size, gcols), [w, h] = spans(eff, gcols), pv = rz?.id === id ? rz : null;
    return (
      <div key={id} data-wid={id} data-size={eff} data-zone={zone} className={`fr-cell s-${eff}${arr ? " edit" : ""}${drag?.id === id || padHeld === id ? " held" : ""}`}
        style={{ gridColumn: `span ${w}`, gridRow: `span ${h}` }}
        {...(arr ? { tabIndex: 0, role: "group", "aria-roledescription": "movable window", "aria-label": `${nameOf(id)}, ${SIZE_NAME[eff]}, ${zone === "rail" ? "in the column beside the panel" : "in the main grid"}. Arrow keys move it, plus and minus resize it, Delete removes it.`, onKeyDown: onKey(id), onPointerDown: down(id) } : null)}>
        <div className="fr-cell-in" {...(arr ? { inert: "" } : null)}>
          <Suspense fallback={null}><W size={eff} /></Suspense>
        </div>
        {arr && (
          <div className="fr-ed">
            <div className="fr-ed-top">
              <span className="fr-grip" aria-hidden="true" title="Drag to move">⠿ DRAG</span>
              <button type="button" className="fr-x" onClick={() => take(id)} aria-label={`Remove ${nameOf(id)}`}>✕</button>
            </div>
            <div className="fr-ed-sz" role="group" aria-label={`Size of ${nameOf(id)}`}>
              {SIZES_OF[id].map(k => {
                const out = zone === "rail" && !sizesIn("rail").includes(k), off = (k === "W" && !out && gcols < 3) || (zone === "rail" && gcols < 2 && (k === "M" || k === "L"));
                return (
                  <button key={k} type="button" aria-pressed={size === k} disabled={off} onClick={() => sizeTo(id, k)}
                    aria-label={`${SIZE_NAME[k]}, ${SIZE[k][0]} by ${SIZE[k][1]}${out ? " (moves it to the main grid)" : off ? " (needs a wider screen)" : ""}`} title={`${SIZE_NAME[k]} ${SIZE[k][0]}×${SIZE[k][1]}${out ? ": THE MAIN GRID" : ""}`}>{k}</button>
                );
              })}
            </div>
            <span className="fr-rz" aria-hidden="true" title="Drag to resize" onPointerDown={grip(id, zone, gcols)} />
          </div>
        )}
        {pv && (() => {
          const [pw, ph] = spans(effSize(pv.size, gcols), gcols), m = pv.m;
          return <div className="fr-rz-prev" aria-hidden="true" style={{ width: pw * m.col + (pw - 1) * m.gap, height: ph * m.row + (ph - 1) * (m.rowGap || m.gap) }}><span>{SIZE_NAME[pv.size]} {SIZE[pv.size][0]}×{SIZE[pv.size][1]}</span></div>;
        })()}
      </div>
    );
  };
  // beside the panel: the column's windows, the rest in main; folded (a phone): one column, the column's windows first
  const inRail = layout.filter(x => zoneOf(x) === "rail"), inMain = layout.filter(x => zoneOf(x) !== "rail");
  const railItems = beside ? inRail : [], mainItems = beside ? inMain : [...inRail, ...inMain];

  return (
    <div ref={wrap} className="fr-deskwrap">
      {arr && (
        <div className="fr-bar" role="group" aria-label="Arranging the desk">
          <p>ARRANGING: DRAG A WINDOW BY ITS HANDLE TO MOVE IT, EVEN BETWEEN THE COLUMN BESIDE THE PANEL AND THE GRID UNDER IT. DRAG THE CORNER TO RESIZE. S M T L W RESIZE IT TOO (THE COLUMN TAKES S, M, T AND L). ✕ REMOVES IT. KEYS: ARROWS MOVE, + AND − RESIZE, DELETE REMOVES.</p>
          <ButtonRow className="fr-bar-btns">
            <Button variant="secondary" onClick={() => onDialog("widgets")}>ADD WIDGET</Button>
            <Button variant="secondary" onClick={() => { apply(DEFAULT_LAYOUT.map(x => ({ ...x }))); setSay("THE DESK IS BACK TO THE DEPARTMENT'S ARRANGEMENT."); }}>RESET</Button>
            <Button variant="push" className="ok" onClick={() => { saveLayout(live.current); setArr(false); setSay("ARRANGEMENT SAVED."); }}>DONE</Button>
          </ButtonRow>
        </div>
      )}
      {beside && (railItems.length > 0 || arr) && (
        <div ref={railEl} className={`fr-grid fr-rail${arr ? " arr" : ""}`} data-zone="rail" data-wide={colWide(railItems) ? "" : undefined} style={{ "--cols": rcols }} aria-label="Windows beside the panel">
          {railItems.map(x => cell(x, "rail", rcols))}
          {arr && !railItems.length && <p className="fr-rail-hint">THE COLUMN. DROP WINDOWS HERE: S, M, T OR L.</p>}
        </div>
      )}
      <div ref={grid} data-zone="main" className={`fr-grid fr-main${arr ? " arr" : ""}`} style={{ "--cols": cols }}>
        {mainItems.map(x => cell(x, zoneOf(x), cols))}
      </div>
      {drag && <div className="fr-chip" style={{ left: drag.x, top: drag.y }} aria-hidden="true">{nameOf(drag.id)}</div>}
      {!layout.length && <p className="fr-clear">THE DESK IS CLEAR. THE DEPARTMENT ADMIRES YOUR RESTRAINT.</p>}
      <p className="fr-arrange">
        <button type="button" onClick={() => setArr(a => !a)} aria-pressed={arr} data-pad-y={arr ? "DONE" : "ARRANGE"}>{arr ? "DONE ARRANGING" : "ARRANGE"}</button>
        <button type="button" onClick={() => onDialog("widgets")}>WIDGETS</button>
        <button type="button" onClick={() => onDialog("display")}>DISPLAY</button>
      </p>
      <p className="sr-only" role="status">{say}</p>
      {dialog && (
        <Suspense fallback={null}>
          <DeskPrefs which={dialog} ids={layout.map(x => x.id)} onIds={(v) => apply(fromIds(live.current, v))} onArrange={() => setArr(true)} onClose={() => onDialog(null)} />
        </Suspense>
      )}
    </div>
  );
}

// ---- NOTICE BOARD: what is posted in the city today (Scott, 2026-10-09: "actually delivering content and isn't
// just there to be a widget"). It was a standing slogan with an OK button; now it reads the paper's edition
// (/api/paper, shared with TODAY'S PAPER): the council polls, the Assembly, the prefects' orders, the docket, the
// most restless district, the shops (notices.js). S cycles them, M shows the first three, T all of them.
const NoticeRow = ({ n }) => <li><a href={n.href}><span className="tag">{n.tag}</span><span className="tx">{n.text}</span></a></li>;
const VIEWS_notice = {
  S: function NoticeS({ items }) {
    const c = useCycle(items.length), n = items[c.i];
    return <Cyc c={c} what="notice"><a className="fr-glance fr-nt-s" href={n.href}><span className="ln2">{n.tag}</span><span className="ln1 two"><span className="n">{n.text}</span></span></a></Cyc>;
  },
  M: ({ items }) => <ul className="fr-nt">{items.slice(0, 3).map((n, k) => <NoticeRow key={k} n={n} />)}</ul>,
  T: ({ items }) => <ul className="fr-nt">{items.slice(0, 8).map((n, k) => <NoticeRow key={k} n={n} />)}</ul>,
};
function Notice({ size }) {
  const [items, setItems] = useState(undefined);
  useEffect(() => {
    let off = false;
    import("./Smalls.jsx").then(m => m.paperNow()).then(ed => { if (!off) setItems(noticeItems(ed)); }).catch(() => { if (!off) setItems([]); });
    return () => { off = true; };
  }, []);
  const V = VIEWS_notice[size] || VIEWS_notice.M;
  return (
    <Frame title="NOTICE BOARD" meta={items?.length && size !== "S" ? `${items.length} POSTED` : ""} tone="var(--eb-amber)" className={`fr-notice v-${size}`}>
      {items?.length ? <V items={items} /> : <p className="fr-dim">{items === undefined ? "…" : "NOTHING POSTED TODAY. THE BOARD IS BEING CLEANED."}</p>}
    </Frame>
  );
}

// ---- MARKET.TKR -------------------------------------------------------------------------------
function MoverRows({ rows, dir, n = 3 }) {
  return (
    <ul className="fr-movers">
      {rows.slice(0, n).map(r => (
        <li key={r.slug}>
          <a href={`#market/${r.slug}`} data-pad-row>
            <span className="l1"><span className="n">{r.name}</span><Sparkline s={r} /><span className="p">{price(r.price)}</span>
              <span className={`c ${dir}`}><span aria-hidden="true">{arrow(r.chg)}</span>{fmtPct(r.chg)}</span></span>
            {r.why && <span className="why">{r.why}</span>}
          </a>
        </li>
      ))}
    </ul>
  );
}
// the compact list: one line a mover, the arrow and the sign carry direction
function MoverLines({ up, dn, nu, nd, spark = false, px = true }) {
  const row = (r, dir) => (
    <li key={r.slug}>
      <a href={`#market/${r.slug}`} className="fr-mrow" data-pad-row>
        <span className={dir} aria-hidden="true">{arrow(r.chg)}</span><span className="n">{r.name}</span>
        {spark && <Sparkline s={r} />}{px && <span className="p">{price(r.price)}</span>}<span className={`c ${dir}`}>{fmtPct(r.chg)}</span>
      </a>
    </li>
  );
  return <ul className="fr-movers fr-mlines">{up.slice(0, nu).map(r => row(r, "up"))}{dn.slice(0, nd).map(r => row(r, "dn"))}</ul>;
}
// the movers in the order a S window shows them: up and down interleaved, each side biggest first
export const moversInTurn = (mv) => { const out = []; for (let k = 0; k < Math.max(mv.up.length, mv.down.length); k++) { if (mv.up[k]) out.push(mv.up[k]); if (mv.down[k]) out.push(mv.down[k]); } return out; };
const VIEWS_market = {
  // S: every mover in turn, the biggest first, risers and fallers interleaved; the index under each
  S: function MarketS({ mv, hvi }) {
    const all = moversInTurn(mv), c = useCycle(all.length), t = all[c.i];
    if (!t) return null;
    const dir = t.chg > 0 ? "up" : "dn";
    return (
      <Cyc c={c} what="mover">
        <a className="fr-glance" href={`#market/${t.slug}`} aria-label={`${t.name}, ${price(t.price)}, ${fmtPct(t.chg)} today. Open them on the market.`}>
          <span className={`big ${dir}`}><span aria-hidden="true">{arrow(t.chg)}</span>{fmtPct(t.chg)}</span>
          <span className="ln1 two"><span className="n">{t.name}</span></span>
          <span className="ln2">{price(t.price)}{hvi ? ` · HVI ${hvi.level.toFixed(1)}` : ""}</span>
        </a>
      </Cyc>
    );
  },
  M: ({ mv }) => <><MoverLines up={mv.up} dn={mv.down} nu={2} nd={2} /><a className="go" href="#market">OPEN THE MARKET ›</a></>,
  T: ({ mv }) => <><MoverLines up={mv.up} dn={mv.down} nu={3} nd={3} /><a className="go" href="#market">OPEN THE MARKET ›</a></>,
  L: ({ mv }) => (
    <>
      <h2 className="fr-h up"><span aria-hidden="true">▲ </span>TOP RISERS TODAY</h2>
      <MoverRows rows={mv.up} dir="up" />
      <h2 className="fr-h dn"><span aria-hidden="true">▼ </span>TOP FALLERS TODAY</h2>
      <MoverRows rows={mv.down} dir="dn" />
      <a className="go" href="#market">OPEN THE MARKET ›</a>
    </>
  ),
  W: ({ mv }) => (
    <div className="fr-mw">
      <div><h2 className="fr-h up"><span aria-hidden="true">▲ </span>RISERS</h2><MoverLines up={mv.up} dn={[]} nu={3} nd={0} spark /></div>
      <div><h2 className="fr-h dn"><span aria-hidden="true">▼ </span>FALLERS</h2><MoverLines up={[]} dn={mv.down} nu={0} nd={3} spark /></div>
    </div>
  ),
};
const ONFILE_N = { S: 2, M: 3, T: 5, L: 6, W: 4 };
function MarketTkr({ size }) {
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
    const hvi = d.hvi, V = VIEWS_market[size] || VIEWS_market.M;
    return (
      <Frame title="MARKET.TKR" meta={hvi ? `HVI ${hvi.level.toFixed(1)}${size !== "S" && Number.isFinite(hvi.chg) ? ` ${arrow(hvi.chg)}${fmtPct(hvi.chg)}` : ""}` : "TODAY"} tone="var(--eb-cyan)" className={`hvi-tkr fr-tkr v-${size}`}>
        <V mv={mv} hvi={hvi} />
      </Frame>
    );
  }
  // the floor is dark (or not yet answered): subjects on file with their scores
  return (
    <Frame title="ON FILE.TKR" tone="var(--eb-cyan)" className="hvi-tkr">
      <a className="hvi-tkr-link" href="#scores" aria-label="The scores. Open the scores.">
        <ul aria-hidden="true">{onFile.slice(0, ONFILE_N[size] || 3).map((f, i) => <li key={i}><span className="n">{displayName(f)}</span><span>{f.score}</span><span>{getTier(f.score).label.split(" ")[0]}</span></li>)}</ul>
        <span className="go" aria-hidden="true">SEE THE SCORES ›</span>
      </a>
    </Frame>
  );
}

// ---- WIRE.TKR: NEWS and TRENDING, one line each ------------------------------------------------
const TABS = [["news", "NEWS"], ["trending", "TRENDING"]];
export const STEP_MS = 7000;
const Line = ({ it }) => (
  <a className="fr-line" href={it.href}>
    <span className="tag">{it.tag}</span>{it.at ? <span className="at">{it.at}</span> : null}
    <span className="tx">{it.text}</span>
  </a>
);
const WireTabs = ({ tab, setTab }) => (
  <Chips className="fr-tabs" role="group" aria-label="Which ticker">
    {TABS.map(([id, label]) => <Chip key={id} pressed={tab === id} onClick={() => setTab(id)}>{label}</Chip>)}
  </Chips>
);
const WireSteps = ({ w }) => (
  <div className="fr-steps">
    <button type="button" onClick={() => w.go(-1)} aria-label="Previous item">◀</button>
    <button type="button" onClick={() => w.setPaused(p => !p)} aria-pressed={w.paused}>{w.paused ? "PLAY" : "PAUSE"}</button>
    <button type="button" onClick={() => w.go(1)} aria-label="Next item">▶</button>
    <a className="all" href={w.tab === "news" ? "#paper" : "#city"}>{w.tab === "news" ? "THE PAPER ›" : "THE CITY ›"}</a>
  </div>
);
const Quiet = () => <p className="fr-line dim">NOTHING ON THE WIRE. THE DEPARTMENT FINDS THIS RESTFUL.</p>;
const VIEWS_wire = {
  // S: the stepper alone; ◀ ▶ step it (it holds still under reduced motion)
  S: (w) => (w.it ? <div className="fr-cyc"><div className="fr-cyc-it"><Line it={w.it} /></div><Step c={{ i: w.i, n: w.n, go: w.go }} what="item" /></div> : <Quiet />),
  // T: the tabs and a column of headlines
  T: (w) => (
    <>
      <WireTabs tab={w.tab} setTab={w.setTab} />
      <ul className="fr-wl-list tall">
        {w.items.slice(0, 7).map((x, k) => <li key={k}><a href={x.href}><span className="tag">{x.tag}</span><span className="tx">{x.text}</span></a></li>)}
      </ul>
    </>
  ),
  M: (w) => (
    <>
      <WireTabs tab={w.tab} setTab={w.setTab} />
      {w.it ? <Line it={w.it} /> : <Quiet />}
      {w.n > 1 && <WireSteps w={w} />}
    </>
  ),
  L: (w) => (
    <>
      <WireTabs tab={w.tab} setTab={w.setTab} />
      <ul className="fr-wl-list">
        {w.items.slice(0, 6).map((x, k) => <li key={k}><a href={x.href}><span className="tag">{x.tag}</span><span className="tx">{x.text}</span></a></li>)}
      </ul>
    </>
  ),
  // W: the line, large, with the next two under it; the tabs and the steps beside
  W: (w) => (
    <div className="fr-ww">
      <div className="fr-ww-main">
        {w.it ? <Line it={w.it} /> : <Quiet />}
        {w.n > 2 && <ul className="fr-ww-next" aria-hidden="true">{[1, 2, 3].slice(0, w.n - 1).map(k => { const x = w.items[(w.i + k) % w.n]; return <li key={k}><span className="tag">{k === 1 ? "NEXT" : "THEN"}</span>{x.text}</li>; })}</ul>}
      </div>
      <div className="fr-ww-ctl"><WireTabs tab={w.tab} setTab={w.setTab} />{w.n > 1 && <WireSteps w={w} />}</div>
    </div>
  ),
};
function WireTkr({ size }) {
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
    if (paused || hold || n < 2 || size === "L" || size === "T") return undefined;
    const t = setTimeout(() => { if (!document.hidden) setI(v => (v + 1) % n); }, STEP_MS);
    return () => clearTimeout(t);
  }, [paused, hold, n, i, size]);
  if (!d || (!d.news?.length && !d.trending?.length)) return null;
  const it = items[i % Math.max(1, n)];
  const go = (k) => setI(v => (v + k + n) % n);
  const V = VIEWS_wire[size] || VIEWS_wire.M;
  return (
    <Frame title="WIRE.TKR" meta={n && size !== "L" && size !== "T" ? `${(i % n) + 1}/${n}` : ""} tone="var(--eb-amber)" className={`fr-wire v-${size}`}>
      <div className="fr-wire-in" onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} onFocus={() => setHold(true)} onBlur={() => setHold(false)}>
        <V tab={tab} setTab={setTab} it={it} i={i % Math.max(1, n)} items={items} n={n} go={go} paused={paused} setPaused={setPaused} />
        <ul className="sr-only" aria-label={tab === "news" ? "All news items" : "Everyone trending"}>
          {items.map((x, k) => <li key={k}><a href={x.href} tabIndex={-1}>{x.tag}: {x.text}</a></li>)}
        </ul>
      </div>
    </Frame>
  );
}

// ---- SUBSTRATE.CAM ------------------------------------------------------------------------------
export const CAM_MS = 60_000;   // one machine hour
const camPic = (go, note) => ({ m, linkRef }) => (
  <a href="#city" ref={linkRef} className="fr-cam-link">
    {m != null
      ? <img src={`/api/cam?m=${m}`} width="396" height="408" alt="The city right now: its districts, the Loop and every train, at the machine hour, night or day. Opens the city." decoding="async" />
      : <span className="fr-cam-wait" aria-label="The city's live view. Opens the city." />}
    {note && <span className="note" aria-hidden="true">{note}</span>}
    {go && <span className="go" aria-hidden="true">VISIT THE CITY ›</span>}
  </a>
);
// S: a tour of the districts, one tight view at a time (the crop SURVEILLANCE uses, /api/cam?at=), the whole city first
export const CAM_TOUR = [[null, "THE WHOLE CITY"], ["hq", "DEPT HQ"], ["finance", "FINANCE"], ["strip", "THE STRIP"], ["sprawl", "THE SPRAWL"], ["coast", "THE COAST"], ["oldtown", "THE OLD TOWN"]];
export const CAM_TOUR_MS = 15_000;
function CamS({ m, linkRef }) {
  const c = useCycle(CAM_TOUR.length, CAM_TOUR_MS), [at, name] = CAM_TOUR[c.i];
  return (
    <Cyc c={c} what="district">
      <a href="#city" ref={linkRef} className="fr-cam-link" aria-label={`The city's live view: ${name}. Opens the city.`}>
        {m != null ? <img src={`/api/cam?m=${m}${at ? `&at=${at}` : ""}`} width="396" height="408" alt="" decoding="async" /> : <span className="fr-cam-wait" />}
        <span className="cap" aria-hidden="true">{name}</span>
      </a>
    </Cyc>
  );
}
const VIEWS_cam = { S: CamS, M: camPic(true), T: camPic(false, "THE CITY, FROM ABOVE"), L: camPic(true, "THE WHOLE CITY AT THE MACHINE HOUR: DISTRICTS, THE LOOP, EVERY TRAIN") };
function SubstrateCam({ size }) {
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
  }, [size]);
  const V = VIEWS_cam[size] || VIEWS_cam.M;
  return (
    <Frame title="SUBSTRATE.CAM" meta="LIVE" tone="var(--eb-cyan)" className={`fr-cam v-${size}`}>
      <V m={m} linkRef={ref} />
    </Frame>
  );
}
