import { useEffect, useId, useMemo, useRef, useState } from "react";
import { readPad, GLYPHS } from "../city/gamepad.js";
import { menuItems, moveFocus, keyAction, padStep } from "./gameMenuLogic.js";
import "./gameMenu.css";

// GameMenu: the one menu every game shows when a round ends, and when the player pauses.
// A modal over the page: big rows, keyboard / gamepad / mouse / touch, focus trapped and returned.
//
// PROPS
//   kind      "end" | "pause"
//   title     the line read first: "ROUND FILED." / "PAUSED." (announced as the dialog's name)
//   summary   optional one line under it: "9 OVER PAR. THE DEPARTMENT EXPECTED WORSE."
//   options   which rows apply, and what each does, in the order they show. Known rows (default labels):
//               end:   again PLAY AGAIN, rematch NEW OPPONENT, settings CHANGE SETTINGS,
//                      replay WATCH THE REPLAY, play BACK TO PLAY, city BACK TO THE CITY
//               pause: resume RESUME, restart RESTART, controls CONTROLS, sound SOUND, quit QUIT TO PLAY
//             each value: fn (run it) | "#href" (go there) | true (default link: play/quit -> #play,
//             city -> #city) | {label, onSelect, href, hint, disabled} | false/null (no row).
//             controls: a React element (the game's legend), shown inside the menu.
//             sound: {on, onSelect}  -> "SOUND: ON" / "SOUND: OFF".
//             A custom key (aquarium: {label: "THE AQUARIUM", href: "#aquarium"}) is a row too.
//   onBack    B / Esc / Backspace. Pause: pass the resume function. End: pass a close (look at the
//             final board) or leave it out (B then does nothing).
//
// THE GAME'S JOB: render <GameMenu> only while it is open (give the end and pause menus different
// keys if they share a slot, so the end menu opens fresh), and freeze its own sim while a pause menu
// is up (skip the step AND the input log, exactly as the existing pause does). The menu swallows
// every key pressed inside it, so the game's window key handlers do not see them. Start / + / OPTIONS
// stays the game's own pause toggle; the menu does not read it. A on a pad selects on release.
//
// EXAMPLES
//   <GameMenu kind="end" title="ROUND FILED." summary="9 OVER PAR."
//     options={{ again: playAgain, rematch: { label: "NEW COURSE", onSelect: newCourse },
//                settings: openOptions, replay: canReplay && watchReplay, play: true,
//                city: { label: "BACK TO THE CLUB", href: "#city" } }} />
//   {paused && <GameMenu kind="pause" title="PAUSED." onBack={resume}
//     options={{ resume, restart, controls: <Legend mode={mode} />,
//                sound: { on: !muted, onSelect: toggleMute }, quit: true }} />}

export default function GameMenu({ kind = "end", title, summary, options, onBack }) {
  const items = useMemo(() => menuItems(kind, options), [kind, options]);
  const [focus, setFocus] = useState(() => Math.max(0, moveFocus(items, 0, "first")));
  const [legend, setLegend] = useState(null);
  const [family, setFamily] = useState(null);
  const rows = useRef([]);
  const back = useRef(null);
  const tid = useId(), sid = useId();
  const live = useRef({}); live.current = { items, focus, legend, onBack };

  useEffect(() => { if (focus >= items.length || items[focus]?.disabled) { const n = moveFocus(items, 0, "first"); if (n >= 0 && n !== focus) setFocus(n); } }, [items, focus]);
  // focus: into the menu on open, back where it was on close
  useEffect(() => {
    const was = document.activeElement;
    return () => { try { if (was && document.contains(was)) was.focus({ preventScroll: true }); } catch { /* gone */ } };
  }, []);
  useEffect(() => {
    if (legend) back.current?.focus({ preventScroll: true });
    else rows.current[focus]?.focus({ preventScroll: true });
  }, [focus, legend]);

  const choose = (i) => {
    const it = live.current.items[i];
    if (!it || it.disabled) return;
    if (it.legend != null && !it.onSelect && !it.href) { setLegend(it.legend); return; }
    if (it.onSelect) it.onSelect();
    else if (it.href) window.location.hash = it.href.replace(/^#/, "");
  };
  const act = (a) => {
    const { items: its, focus: f, legend: lg, onBack: ob } = live.current;
    if (lg) { if (a === "back" || a === "select") setLegend(null); return; }
    if (a === "up" || a === "down") setFocus(k => { const n = moveFocus(its, k, a === "up" ? -1 : 1); return n < 0 ? k : n; });
    else if (a === "first" || a === "last") { const n = moveFocus(its, f, a); if (n >= 0) setFocus(n); }
    else if (a === "select") choose(f);
    else if (a === "back") ob?.();
  };

  const onKeyDown = (e) => {
    e.stopPropagation();   // the game's window handlers do not see keys pressed in the menu
    if (e.key === "Tab") {   // the trap: Tab cycles the rows
      e.preventDefault();
      if (!live.current.legend) act(e.shiftKey ? "up" : "down");
      return;
    }
    const a = keyAction(e.key);
    if (!a) return;
    e.preventDefault();
    if (!e.repeat || a === "up" || a === "down") act(a);
  };

  // the pad: poll while open
  useEffect(() => {
    let raf = 0, prev = null, fam = null;
    const tick = () => {
      const p = readPad();
      if (p.connected) {
        if (fam !== p.family) { fam = p.family; setFamily(p.family); }
        const { action, next } = padStep(prev, { y: p.y, act: p.held.act, back: p.held.back });
        prev = next;
        if (action) act(action);
      } else prev = null;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const g = GLYPHS[family] || GLYPHS.generic;
  const hint = family ? `D-PAD ▲▼ CHOOSE // ${g.act} SELECT${onBack || legend ? ` // ${g.back} BACK` : ""}` : `↑↓ CHOOSE // ENTER SELECTS${onBack || legend ? " // ESC BACK" : ""}`;

  return (
    <div className="gm-scrim" onKeyDown={onKeyDown}>
      <div className={`gm gm-${kind}`} role="dialog" aria-modal="true" aria-labelledby={tid} aria-describedby={summary ? sid : undefined}>
        <h2 className="gm-title" id={tid}>{title || (kind === "pause" ? "PAUSED." : "FILED.")}</h2>
        {summary && <p className="gm-sum" id={sid}>{summary}</p>}
        {legend ? (
          <div className="gm-legend">
            {legend}
            <button type="button" className="gm-row" ref={back} onClick={() => setLegend(null)}>BACK</button>
          </div>
        ) : (
          <div className="gm-list" role="menu" aria-label={title || (kind === "pause" ? "Paused" : "Game over")}>
            {items.map((it, i) => {
              const props = {
                key: it.id, role: "menuitem", className: `gm-row${i === focus ? " on" : ""}`, tabIndex: i === focus ? 0 : -1,
                ref: (el) => { rows.current[i] = el; }, onMouseEnter: () => !it.disabled && setFocus(i), onFocus: () => focus !== i && setFocus(i),
                "aria-disabled": it.disabled || undefined, "aria-label": it.hint ? `${it.label}. ${it.hint}` : undefined,
              };
              const body = <><span className="gm-caret" aria-hidden="true">{i === focus ? "▸" : " "}</span><span>{it.label}</span>{it.hint && <span className="gm-hint" aria-hidden="true">{it.hint}</span>}</>;
              return it.href && !it.onSelect
                ? <a {...props} href={it.href}>{body}</a>
                : <button {...props} type="button" onClick={() => choose(i)}>{body}</button>;
            })}
          </div>
        )}
        <p className="gm-keys" aria-hidden="true">{hint}</p>
      </div>
    </div>
  );
}
