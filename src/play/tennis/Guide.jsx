import { useEffect, useMemo } from "react";
import { readPad, GLYPHS } from "../../city/gamepad.js";
import { SELECT_GLYPH } from "./input.js";

// THE TENNIS CLUB: the plain-words controls guide. A drawn pad (with the connected pad's own
// glyphs: A and B on an Xbox pad, the cross and the circle on a PlayStation one, the minus on a
// Switch's), and three short answers: how to attack, how to serve, how to challenge. Shown once
// before the first match (skippable, remembered: GUIDE_KEY) and in the pause menu's CONTROLS.
export const GUIDE_KEY = "hvi-tennis-guide-seen";
export const guideSeen = () => { try { return localStorage.getItem(GUIDE_KEY) === "1"; } catch { return false; } };
export const markGuideSeen = () => { try { localStorage.setItem(GUIDE_KEY, "1"); } catch { /* the tab remembers */ } };

// What each way of playing calls the buttons: [swing, lob, challenge, pause, move]
export function namesFor(mode, family) {
  const g = GLYPHS[family] || GLYPHS.generic;
  if (mode === "pad") return { swing: g.act, lob: g.back, challenge: SELECT_GLYPH[family] || SELECT_GLYPH.generic, pause: g.start, move: "LEFT STICK / D-PAD" };
  if (mode === "touch") return { swing: "A", lob: "B", challenge: "THE CHALLENGE BUTTON", pause: "START", move: "THE ROUND PAD" };
  if (mode === "pointer") return { swing: "RELEASE", lob: "FLICK UP", challenge: "THE CHALLENGE BUTTON", pause: "ENTER / ESC", move: "CLICK OR TAP THE COURT" };
  return { swing: "Z", lob: "X", challenge: "C", pause: "ENTER / ESC", move: "ARROWS / WASD" };
}
// The three answers, in plain words, for the way you are playing.
export function guideLines(mode, family, hand = "R") {
  const n = namesFor(mode, family);
  if (mode === "pointer") return [
    ["ATTACK", "Click or tap where you want to run. Press and hold, then let go as the ball arrives to swing. Drag while you hold: up for topspin, down for a slice, a big flick up for a lob. Left or right aims."],
    ["SERVE", "Press to toss the ball. Let go as it reaches the top to hit. Drag up to kick it, down to slice it."],
    ["CHALLENGE", "After a close call against you, tap the CHALLENGE button within two seconds. A right challenge costs nothing; three wrong ones a set."],
  ];
  return [
    ["ATTACK", `Move under the ball with ${n.move}. Press ${n.swing} as the ball arrives to swing; a high ball is smashed. ${n.lob} lobs it, ${mode === "pad" ? `DOWN + ${n.lob}` : mode === "touch" ? "DOWN + B" : "DOWN + X"} slices it. Hold a direction as you hit to aim: left or right for the lines, up for deep, down for short.`],
    ["SERVE", `Press ${n.swing} to toss. Press ${n.swing} again as the ball reaches the top. Hold left or right as you hit to aim at the T or wide.`],
    ["CHALLENGE", `After a close call against you, press ${n.challenge} within two seconds. A right challenge costs nothing; three wrong ones a set (one more in a tiebreak). Do not hold it down.`],
  ].concat(hand === "L" ? [["LEFT-HANDED", "You play left-handed: your player stands and tosses on the left. The buttons are the same."]] : []);
}

// The drawn pad. Standard layout: the left stick and d-pad on the left, four face buttons on the
// right (bottom: the swing, right: the lob), SELECT and START between. Lit controls are the ones
// the game uses; the labels sit beside them.
export function PadDrawing({ family }) {
  const g = GLYPHS[family] || GLYPHS.generic, sel = SELECT_GLYPH[family] || SELECT_GLYPH.generic;
  const lit = "var(--accent)", dim = "var(--line-hi)", ink = "var(--fg)", mute = "var(--fg-dim)";
  const btn = (cx, cy, on, label) => (
    <g key={`${cx}${cy}`}>
      <circle cx={cx} cy={cy} r="12" fill={on ? lit : "none"} stroke={on ? lit : dim} strokeWidth="2" />
      {label && <text x={cx} y={cy + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill={on ? "var(--accent-ink)" : mute}>{label}</text>}
    </g>
  );
  return (
    <svg className="tn-pad" viewBox="0 0 430 190" role="img" aria-label={`Controller: left stick moves, ${g.act} swings and serves, ${g.back} lobs, ${sel} challenges, ${g.start} pauses.`}>
      <path d="M70 30 H310 Q352 30 360 86 Q368 150 330 166 Q300 176 280 140 H100 Q80 176 50 166 Q12 150 20 86 Q28 30 70 30 Z" fill="none" stroke={dim} strokeWidth="3" />
      {/* left stick: MOVE */}
      <circle cx="96" cy="72" r="24" fill="none" stroke={lit} strokeWidth="3" /><circle cx="96" cy="72" r="10" fill={lit} />
      <text x="96" y="22" textAnchor="middle" fontSize="12" fontWeight="700" fill={ink}>MOVE</text>
      {/* d-pad */}
      <path d="M142 112 h12 v-12 h12 v12 h12 v12 h-12 v12 h-12 v-12 h-12 z" fill="none" stroke={lit} strokeWidth="2" transform="translate(-30 4)" />
      <text x="124" y="160" textAnchor="middle" fontSize="11" fill={mute}>OR D-PAD</text>
      {/* select, start */}
      <rect x="140" y="64" width="26" height="9" rx="4" fill={lit} /><text x="153" y="56" textAnchor="middle" fontSize="11" fontWeight="700" fill={ink}>{sel}</text><text x="153" y="88" textAnchor="middle" fontSize="9" fill={mute}>CHALLENGE</text>
      <rect x="214" y="64" width="26" height="9" rx="4" fill={dim} /><text x="227" y="56" textAnchor="middle" fontSize="11" fontWeight="700" fill={ink}>{g.start}</text><text x="227" y="88" textAnchor="middle" fontSize="9" fill={mute}>PAUSE</text>
      {/* face buttons: top, left unused; bottom swings, right lobs */}
      {btn(290, 52, false)}{btn(262, 78, false)}
      {btn(290, 104, true, g.act)}{btn(318, 78, true, g.back)}
      <text x="290" y="136" textAnchor="middle" fontSize="11" fontWeight="700" fill={ink}>SWING / SERVE</text>
      <text x="336" y="76" fontSize="11" fontWeight="700" fill={ink}>LOB</text>
      <text x="336" y="88" fontSize="9" fill={mute}>DOWN + = SLICE</text>
    </svg>
  );
}

// The guide itself. onDone: dismissed (a button, or the pad's A / Start). compact: in the pause menu.
export default function ControlsGuide({ mode, family, hand = "R", onDone = null, compact = false }) {
  const rows = useMemo(() => guideLines(mode, family, hand), [mode, family, hand]);
  useEffect(() => {
    if (!onDone) return undefined;
    let raf, prev = null;
    const tick = () => { raf = requestAnimationFrame(tick); const p = readPad(); if (p.connected && prev && ((p.held.act && !prev.act) || (p.held.start && !prev.start))) onDone(); prev = p.connected ? p.held : null; };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onDone]);
  return (
    <section className={`tn-guide${compact ? " compact" : ""}`} aria-label="How to play">
      {!compact && <h2 className="tn-guide-h">HOW TO PLAY</h2>}
      {(mode === "pad" || compact) && <PadDrawing family={family} />}
      <dl className="tn-guide-rows">
        {rows.map(([k, t]) => <div key={k}><dt>{k}</dt><dd>{t}</dd></div>)}
      </dl>
      {onDone && <p className="tn-guide-go"><button type="button" className="tn-chip on" onClick={onDone} autoFocus>GOT IT: PLAY</button> <span className="tn-small">SHOWN ONCE. IT IS ALWAYS UNDER PAUSE, CONTROLS.</span></p>}
    </section>
  );
}
