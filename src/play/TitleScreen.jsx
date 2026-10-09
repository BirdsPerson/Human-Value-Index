import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { readPad, GLYPHS } from "../city/gamepad.js";
import { drawText, textWidth, CH } from "./golf/font.js";
import { frontItems, selectKind, titleKey, padTitle, stepFocus, titleLines, seenTitle, markTitle } from "./titleLogic.js";
import "./titleScreen.css";

// TitleScreen: every arcade game's front door. An NES-style title (big pixel letters, four colours,
// a blinking PRESS START), then the FRONT MENU: the rows the game supplies, the same keys, pad, mouse
// and touch as GameMenu (../GameMenu.jsx). START on the title, START again on the menu plays: a
// returning player goes straight through. The title's drop-in plays once per browser and never under
// reduced motion.
//
// PROPS
//   game     a short key ("tennis"): remembers that the title has been seen
//   title    the big letters ("TENNIS"); sub: one plain line under them
//   colors   [background, letters, shadow, highlight]: the game's four
//   rows     the menu, in order (titleLogic.js frontItems): play, modes, team, live, settings,
//            controls, back, or any custom key. Each: fn | "#href" | true | [items] | <Legend/> |
//            {label, onSelect, href, hint, items, legend, value, cycle, art, disabled}.
//            A list row (MODES, TEAM SELECT, LIVE, SETTINGS) opens its items; a settings item with
//            value + cycle(dir) shows "DIFFICULTY  ROOKIE" and LEFT / RIGHT (or SELECT) changes it.
//   at       open on the menu instead of the title (true), or straight into one list ("settings")
//   note     one dim line under the menu (what counts where). An item's own `note` replaces it
//            while that item is focused (what ROOKIE means), so the explanation is there only when asked.
//   onStart  START pressed on the menu (default: the play row)
//   An item's onSelect may return a top row's id ("team"): the menu then opens that list (MODES ->
//   pick ONE SET -> TEAM SELECT opens).
//
// EXAMPLE
//   <TitleScreen game="tennis" title="TENNIS" sub="THE TENNIS CLUB" colors={["#000", "#fcfcfc", "#0058f8", "#f8b800"]}
//     rows={{ play: quick, modes: [{label: "ONE SET", onSelect: () => ...}], team: opponents, live: liveItems("tennis"),
//             settings: [{label: "DIFFICULTY", value: "ROOKIE", cycle: (d) => ...}], controls: <Legend />, back: true }} />

function PixelTitle({ lines, colors, small = false }) {
  const ref = useRef(null), box = useRef(null);
  const [k, setK] = useState(small ? 2 : 4);
  const w = Math.max(...lines.map(l => textWidth(l))) + 1, h = lines.length * (CH + 1);
  useLayoutEffect(() => {
    const fit = () => {
      const cw = box.current?.clientWidth || 320, dpr = window.devicePixelRatio || 1;
      const cap = small ? 3 : 12;
      const dev = Math.max(1, Math.min(cap * dpr, Math.floor((cw * dpr) / w)));
      setK(dev / dpr);
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    if (ro && box.current) ro.observe(box.current);
    return () => ro?.disconnect();
  }, [w, small]);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const x = c.getContext("2d"); x.clearRect(0, 0, c.width, c.height);
    lines.forEach((l, i) => {
      const lx = Math.floor((w - 1 - textWidth(l)) / 2), ly = i * (CH + 1);
      drawText(x, l, lx + 1, ly + 1, colors[2]);
      drawText(x, l, lx, ly, colors[1]);
    });
  }, [lines, colors, w]);
  return (
    <div className="ts-big" ref={box}>
      <canvas ref={ref} width={w} height={h} style={{ width: w * k, height: h * k }} aria-hidden="true" />
    </div>
  );
}

const REDUCED = () => { try { return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); } catch { return false; } };

export default function TitleScreen({ game, title, sub, colors = ["#000000", "#fcfcfc", "#0058f8", "#f8b800"], rows, at = false, note, onStart }) {
  const items = useMemo(() => frontItems(rows), [rows]);
  const lines = useMemo(() => titleLines(title), [title]);
  const [phase, setPhase] = useState(at ? "menu" : "title");
  const [path, setPath] = useState(() => (typeof at === "string" ? [at] : []));   // the open lists, by id
  const [focus, setFocus] = useState([0]);   // one per level
  const [legend, setLegend] = useState(null);
  const [family, setFamily] = useState(null);
  const [drop] = useState(() => !at && !REDUCED() && !seenTitle(game));
  const rowEls = useRef([]), startEl = useRef(null), backEl = useRef(null), rootEl = useRef(null);
  const tid = useId();
  useEffect(() => { markTitle(game); }, [game]);

  // the list on screen: the top menu, or the open sub-list
  let list = items, head = null;
  for (const id of path) { const it = list.find(x => x.id === id); if (!it?.items) break; head = it; list = it.items; }
  const f = Math.min(focus[path.length] ?? 0, Math.max(0, list.length - 1));
  const live = useRef({}); live.current = { list, f, phase, path, legend, items, onStart };

  // focus: the first usable row of whatever is on screen
  useEffect(() => { if (list[f]?.disabled) { const n = stepFocus(list, f, "first"); if (n >= 0) setFocusAt(n); } });
  const setFocusAt = (n) => setFocus(fs => { const a = fs.slice(0, live.current.path.length + 1); a[live.current.path.length] = n; return a; });
  useEffect(() => {
    if (phase === "title") startEl.current?.focus({ preventScroll: true });
    else if (legend) backEl.current?.focus({ preventScroll: true });
    else { const el = rowEls.current[f]; el?.focus({ preventScroll: true }); el?.scrollIntoView?.({ block: "nearest" }); }
  }, [phase, f, legend, path.join("/")]);   // eslint-disable-line react-hooks/exhaustive-deps

  const play = () => { const p = live.current.items.find(x => x.id === "play"); if (live.current.onStart) live.current.onStart(); else if (p?.onSelect) p.onSelect(); else if (p?.href) window.location.hash = p.href.replace(/^#/, ""); };
  const choose = (i) => {
    const { list: L } = live.current, it = L[i];
    switch (selectKind(it)) {
      case "run": { const next = it.onSelect(); if (typeof next === "string" && live.current.items.some(x => x.id === next && x.items)) { setPath([next]); setFocus(fs => [fs[0] ?? 0, 0]); } break; }
      case "link": window.location.hash = it.href.replace(/^#/, ""); break;
      case "open": setPath(p => [...p, it.id]); setFocus(fs => [...fs.slice(0, live.current.path.length + 1), 0]); break;
      case "legend": setLegend(it.id); break;   // the id: the element is re-read from the rows each render, so it never goes stale
      case "cycle": it.cycle(1); break;
      default: break;
    }
  };
  const act = (a) => {
    const { list: L, f: k, phase: ph, path: P, legend: lg } = live.current;
    if (ph === "title") { if (a === "select" || a === "start") setPhase("menu"); return; }
    if (lg) { if (a === "back" || a === "select") setLegend(null); return; }
    if (a === "up" || a === "down") { const n = stepFocus(L, k, a === "up" ? -1 : 1); if (n >= 0) setFocusAt(n); }
    else if (a === "first" || a === "last") { const n = stepFocus(L, k, a); if (n >= 0) setFocusAt(n); }
    else if ((a === "left" || a === "right") && L[k]?.cycle && !L[k].disabled) L[k].cycle(a === "left" ? -1 : 1);
    else if (a === "select") choose(k);
    else if (a === "start") { if (P.length) choose(k); else play(); }
    else if (a === "back") { if (P.length) setPath(p => p.slice(0, -1)); else setPhase("title"); }
  };

  const onKeyDown = (e) => {
    if (e.target.closest?.(".ts-legend") && e.key !== "Escape" && e.key !== "Tab") return;   // a legend may hold its own buttons
    e.stopPropagation();   // the game's window handlers do not see keys pressed here
    if (e.key === "Tab") {   // the trap: Tab cycles the rows
      if (live.current.phase === "title") return;
      e.preventDefault();
      if (!live.current.legend) act(e.shiftKey ? "up" : "down");
      return;
    }
    const a = titleKey(e.key);
    if (!a) return;
    e.preventDefault();
    if (!e.repeat || ["up", "down", "left", "right"].includes(a)) act(a);
  };

  // the pad: poll while up
  useEffect(() => {
    let raf = 0, prev = null, fam = null;
    const tick = () => {
      const p = readPad();
      if (p.connected) {
        if (fam !== p.family) { fam = p.family; setFamily(p.family); }
        const { action, next } = padTitle(prev, { x: p.x, y: p.y, act: p.held.act, back: p.held.back, start: p.held.start });
        prev = next;
        if (action) act(action);
      } else prev = null;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const g = GLYPHS[family] || GLYPHS.generic;
  const startWord = family ? `PRESS ${g.start}` : "PRESS START";
  const hint = family
    ? `${g.start} PLAYS // ${g.act} SELECT // ${g.back} BACK`
    : `↑↓ CHOOSE${list.some(x => x.cycle) ? " // ←→ CHANGE" : ""} // ENTER SELECTS // ESC BACK`;
  const [bg, ink, shadow, hi] = colors;
  const style = { "--ts-bg": bg, "--ts-ink": ink, "--ts-shadow": shadow, "--ts-hi": hi };

  return (
    <section className={`ts ts-${phase}${drop ? " ts-drop" : ""}`} style={style} ref={rootEl} onKeyDown={onKeyDown} data-pad-own="titlescreen"
      role="dialog" aria-labelledby={tid} onClick={phase === "title" ? () => setPhase("menu") : undefined}>
      <h2 className="sr-only" id={tid}>{title}{phase === "menu" ? (head ? `: ${head.label}` : ": menu") : ""}</h2>
      {phase === "title" ? (
        <div className="ts-title">
          <PixelTitle lines={lines} colors={colors} />
          {sub && <p className="ts-sub">{sub}</p>}
          <button type="button" className="ts-start" ref={startEl} onClick={(e) => { e.stopPropagation(); setPhase("menu"); }}>{startWord}</button>
        </div>
      ) : (
        <div className="ts-menu">
          <PixelTitle lines={[lines.join(" ")]} colors={colors} small />
          {head && <p className="ts-head" aria-hidden="true">{head.label}</p>}
          {legend ? (
            <div className="ts-legend">
              {list.find(x => x.id === legend)?.legend}
              <button type="button" className="ts-row on" ref={backEl} onClick={() => setLegend(null)}><span className="ts-caret" aria-hidden="true">▶</span><span>BACK</span></button>
            </div>
          ) : (
            <div className="ts-list" role="menu" aria-label={head ? head.label : `${title} menu`}>
              {list.map((it, i) => {
                const on = i === f;
                const props = {
                  role: "menuitem", className: `ts-row${on ? " on" : ""}`, tabIndex: on ? 0 : -1,
                  ref: (el) => { rowEls.current[i] = el; }, onMouseEnter: () => !it.disabled && setFocusAt(i), onFocus: () => !on && setFocusAt(i),
                  "aria-disabled": it.disabled || undefined,
                  "aria-label": [it.label, it.value, it.hint].filter(Boolean).join(". ") || undefined,
                };
                const body = <>
                  <span className="ts-caret" aria-hidden="true">{on ? "▶" : ""}</span>
                  {it.art && <span className="ts-art" aria-hidden="true">{it.art}</span>}
                  <span className="ts-lbl" aria-hidden="true">{it.label}</span>
                  {it.value != null && <span className="ts-val" aria-hidden="true">{it.cycle ? <><b onClick={(e) => { e.stopPropagation(); it.cycle(-1); }}>◀</b> {it.value} <b onClick={(e) => { e.stopPropagation(); it.cycle(1); }}>▶</b></> : it.value}</span>}
                  {it.hint && <span className="ts-hint" aria-hidden="true">{it.hint}</span>}
                </>;
                return it.href && !it.onSelect
                  ? <a key={it.id} {...props} href={it.href}>{body}</a>
                  : <button key={it.id} {...props} type="button" onClick={() => choose(i)}>{body}</button>;
              })}
            </div>
          )}
          {!legend && (list[f]?.note || (!path.length && note)) && <p className="ts-note" aria-live="polite">{list[f]?.note || note}</p>}
          <p className="ts-keys" aria-hidden="true">{hint}</p>
        </div>
      )}
    </section>
  );
}
