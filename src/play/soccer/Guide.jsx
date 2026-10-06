import { useEffect, useState } from "react";
import { readPad } from "../../city/gamepad.js";
import { PAD_GLYPHS, KEY_GLYPHS } from "./input.js";

// THE ESTATE PITCH: the controls guide, in plain words. EA SPORTS FC's default buttons (sim.js header,
// docs/CITY_SPEC.md Soccer "Controls"), drawn on our own pad with the connected pad's glyphs (A B X Y
// on Xbox, the cross, circle, square and triangle on PlayStation, the labels at those positions on a
// Switch pad), or the keys of FC 27's WASD keyboard layout. Three tabs: ATTACK, DEFEND, SET PIECES.
// Shown once before the first match (skippable, remembered: GUIDE_KEY) and in the pause menu.
export const GUIDE_KEY = "hvi-soccer-guide-seen";
export const guideSeen = () => { try { return localStorage.getItem(GUIDE_KEY) === "1"; } catch { return false; } };
export const markGuideSeen = () => { try { localStorage.setItem(GUIDE_KEY, "1"); } catch { /* the tab remembers */ } };

export const glyphsFor = (mode, family) => (mode === "keys" ? KEY_GLYPHS : PAD_GLYPHS[family] || PAD_GLYPHS.generic);

// What each control does, per tab: { control: [action, detail] }. Controls: LS RS A B X Y LB RB LT RT.
export const GUIDE = {
  attack: {
    LS: ["MOVE", ""], RT: ["SPRINT", "hold"], LT: ["SHIELD", "hold: close control"],
    A: ["PASS", "to the teammate you point at"], B: ["SHOOT", "hold for power, let go"], X: ["LOB / CROSS", "in the air; from wide, a cross"], Y: ["THROUGH BALL", "into space ahead of a runner"],
    RB: ["FINESSE", "with {B}: a curled shot"], LB: ["CHIP / RUN", "with {B}: chip. Tap alone: a teammate runs"], RS: ["SKILL MOVES", "flick a direction"],
  },
  defend: {
    LS: ["MOVE", ""], RT: ["SPRINT", "hold"], LT: ["JOCKEY", "hold: face him, stay goal-side"],
    A: ["CONTAIN", "hold: shadow the man on the ball"], B: ["TACKLE", "standing; close from behind: push"], X: ["SLIDE TACKLE", "never from behind"], Y: ["RUSH KEEPER", "hold: your keeper comes out"],
    RB: ["TEAMMATE CONTAIN", "hold: a second man presses"], LB: ["CHANGE PLAYER", "to the man nearest the ball"], RS: ["SWITCH", "to the man that way"],
  },
  set: {
    LS: ["AIM", "free kick, penalty, corner"], RT: ["", ""], LT: ["", ""],
    A: ["SHORT", "pass, throw, short corner"], B: ["SHOOT", "free kick or penalty: hold for power; keeper: kick"], X: ["CROSS / LONG", "corner, long throw, goal kick"], Y: ["", ""],
    RB: ["", ""], LB: ["", ""], RS: ["CURL / HEIGHT", "free kick: left/right curl, up/down height"],
  },
};
export const TABS = [["attack", "ATTACK"], ["defend", "DEFEND"], ["set", "SET PIECES"]];

// Combinations and notes under each tab, plain words.
export function notesFor(tab, g) {
  if (tab === "attack") return [`${g.LB} + ${g.B}: CHIP SHOT. ${g.RB} + ${g.B}: FINESSE SHOT. ${g.LB} + ${g.Y}: LOBBED THROUGH BALL.`, `${g.B} THEN ${g.A} QUICKLY: A FAKE SHOT. HOLD UP OR DOWN AS YOU SHOOT TO PICK A POST.`, "A SKILL MOVE NEEDS THE STARS: ONE PER TEN RATING POINTS OVER 50."];
  if (tab === "defend") return [`HOLD ${g.LT} AND MOVE TO JOCKEY. HOLD ${g.A} TO CONTAIN, THEN ${g.B} TO TACKLE WHEN HE SHOWS YOU THE BALL.`, `A SLIDE (${g.X}) FROM BEHIND IS A FOUL AND MAYBE A CARD.`];
  return [`PENALTY: AIM WITH ${g.LS}, HOLD ${g.B}, LET GO (TOO MUCH POWER GOES OVER). FACING ONE: HOLD UP OR DOWN AS IT IS STRUCK AND YOUR KEEPER DIVES THAT WAY.`, `YOUR KEEPER WITH THE BALL: ${g.A} THROWS, ${g.X} OR ${g.B} KICKS IT LONG.`];
}

// The drawn pad. Our own outline (not a console's): shoulders on top, the left stick, the face
// buttons and the right stick, each named by the pad's own glyph and labelled with what it does on
// this tab. Unused controls are dimmed.
export function PadDrawing({ mode = "pad", family, tab }) {
  const g = glyphsFor(mode, family), map = GUIDE[tab];
  const lit = "var(--accent)", dim = "var(--line-hi)", ink = "var(--fg)", mute = "var(--fg-dim)", accInk = "var(--accent-ink)";
  const on = (k) => Boolean(map[k]?.[0]);
  // [control, control's x, y, label side, label y]
  const L = 186, R = 454;
  const label = (k, x, y, side, ly) => (
    <g key={`l${k}`}>
      <line x1={x} y1={y} x2={side < 0 ? L + 4 : R - 4} y2={ly - 4} stroke={on(k) ? lit : dim} strokeWidth="1" />
      <text x={side < 0 ? L : R} y={ly} textAnchor={side < 0 ? "end" : "start"} fontSize="13" fontWeight="700" fill={on(k) ? ink : mute}>{on(k) ? map[k][0] : "—"}</text>
    </g>
  );
  const btn = (k, cx, cy) => (
    <g key={k}>
      <circle cx={cx} cy={cy} r="13" fill={on(k) ? lit : "none"} stroke={on(k) ? lit : dim} strokeWidth="2" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={g[k].length > 1 ? 10 : 13} fontWeight="700" fill={on(k) ? accInk : mute}>{g[k]}</text>
    </g>
  );
  const sh = (k, x, y, h) => (
    <g key={k}>
      <rect x={x} y={y} width="54" height={h} rx="5" fill={on(k) ? lit : "none"} stroke={on(k) ? lit : dim} strokeWidth="2" />
      <text x={x + 27} y={y + h / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={on(k) ? accInk : mute}>{g[k]}</text>
    </g>
  );
  const stick = (k, cx, cy, name) => (
    <g key={k}>
      <circle cx={cx} cy={cy} r="22" fill="none" stroke={on(k) ? lit : dim} strokeWidth="3" /><circle cx={cx} cy={cy} r="9" fill={on(k) ? lit : dim} />
      {name && <text x={cx} y={cy + 38} textAnchor="middle" fontSize="10" fill={mute}>{name}</text>}
    </g>
  );
  const keys = mode === "keys";
  return (
    <svg className="sc-pad" viewBox="0 0 640 250" role="img" aria-label={`${keys ? "Keyboard" : "Controller"}, ${tab}: ${Object.entries(map).filter(([, v]) => v[0]).map(([k, v]) => `${g[k]} ${v[0].toLowerCase()}`).join(", ")}.`}>
      <path d="M250 62 H390 Q446 62 456 120 Q468 200 430 222 Q398 236 376 196 H264 Q242 236 210 222 Q172 200 184 120 Q194 62 250 62 Z" fill="none" stroke={dim} strokeWidth="3" />
      {sh("LT", 222, 10, 18)}{sh("LB", 222, 36, 14)}{sh("RT", 364, 10, 18)}{sh("RB", 364, 36, 14)}
      {stick("LS", 240, 88, "")}{stick("RS", 368, 172, keys ? "ARROWS" : "R")}
      {btn("Y", 410, 92)}{btn("X", 384, 118)}{btn("B", 436, 118)}{btn("A", 410, 144)}
      <rect x="290" y="150" width="28" height="9" rx="4" fill={dim} /><text x="304" y="174" textAnchor="middle" fontSize="10" fill={mute}>{g.start}: PAUSE</text>
      {label("LT", 222, 19, -1, 22)}{label("LB", 222, 43, -1, 48)}{label("LS", 218, 88, -1, 92)}{label("X", 371, 118, -1, 134)}
      {label("RT", 418, 19, 1, 22)}{label("RB", 418, 43, 1, 48)}{label("Y", 423, 92, 1, 92)}{label("B", 449, 118, 1, 122)}{label("A", 423, 144, 1, 152)}{label("RS", 390, 172, 1, 200)}
    </svg>
  );
}

// The guide. mode: "pad" | "keys" | "touch"; onDone: dismissed (a button, or the pad's A / Start);
// compact: in the pause menu. tab0: the tab to open on.
export default function ControlsGuide({ mode, family, onDone = null, compact = false, tab0 = "attack" }) {
  const [tab, setTab] = useState(tab0);
  const g = glyphsFor(mode === "touch" ? "pad" : mode, family), map = GUIDE[tab];
  useEffect(() => {
    if (!onDone) return undefined;
    let raf, prev = null;
    const tick = () => { raf = requestAnimationFrame(tick); const p = readPad(); if (p.connected && prev && ((p.held.act && !prev.act) || (p.held.start && !prev.start))) onDone(); prev = p.connected ? p.held : null; };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onDone]);
  const touch = mode === "touch";
  return (
    <section className={`sc-guide${compact ? " compact" : ""}`} aria-label="How to play">
      {!compact && <h2 className="sc-guide-h">HOW TO PLAY</h2>}
      <p className="sc-small">{touch ? "ON A PHONE: THE ROUND PAD MOVES; THE FOUR BUTTONS SIT WHERE A CONTROLLER'S DO AND DO THE SAME THINGS. SWIPE THE PICTURE FOR SKILL MOVES." : `THE BUTTONS ARE EA SPORTS FC'S DEFAULTS${mode === "keys" ? " (FC 27'S WASD KEYBOARD LAYOUT)" : ""}.`}</p>
      <div className="sc-chips" role="tablist" aria-label="Controls">
        {TABS.map(([k, n]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`sc-chip${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{n}</button>)}
      </div>
      <PadDrawing mode={mode === "keys" ? "keys" : "pad"} family={family} tab={tab} />
      <dl className="sc-guide-rows">
        {["A", "B", "X", "Y", "RT", "LT", "RB", "LB", "RS", "LS"].filter(k => map[k][0]).map(k => <div key={k}><dt><kbd>{g[k]}</kbd></dt><dd><b>{map[k][0]}</b>{map[k][1] ? ` ${map[k][1].replace("{B}", g.B)}.` : ""}</dd></div>)}
      </dl>
      <ul className="sc-guide-notes">{notesFor(tab, g).map(t => <li key={t}>{t}</li>)}</ul>
      {onDone && <p className="sc-guide-go"><button type="button" className="sc-chip on" onClick={onDone} autoFocus>GOT IT: PLAY</button> <span className="sc-small">SHOWN ONCE. IT IS ALWAYS UNDER PAUSE, CONTROLS.</span></p>}
    </section>
  );
}
