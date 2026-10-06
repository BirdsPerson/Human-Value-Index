import { useEffect, useMemo } from "react";
import { readPad } from "../../city/gamepad.js";

// THE PARK, skateable: the plain-words controls guide (the tennis club's pattern, play/tennis/Guide.jsx). A drawn
// pad with the connected pad's own glyphs, and the layout in plain words for the way you are playing. Shown once
// before the first run (skippable, remembered: GUIDE_KEY) and under pause, CONTROLS.
export const GUIDE_KEY = "hvi-skate-guide-seen";
export const guideSeen = () => { try { return localStorage.getItem(GUIDE_KEY) === "1"; } catch { return false; } };
export const markGuideSeen = () => { try { localStorage.setItem(GUIDE_KEY, "1"); } catch { /* the tab remembers */ } };

// What each button is called, by the way you are playing. Pads are by POSITION: the bottom button ollies.
const PADS = {
  playstation: { ollie: "✕", flip: "□", grab: "○", grind: "△", l1: "L1", r1: "R1", r2: "R2", start: "OPTIONS" },
  xbox: { ollie: "A", flip: "X", grab: "B", grind: "Y", l1: "LB", r1: "RB", r2: "RT", start: "MENU" },
  switch: { ollie: "B", flip: "Y", grab: "A", grind: "X", l1: "L", r1: "R", r2: "ZR", start: "+" },
};
PADS.generic = PADS.xbox;
export function namesFor(mode, family) {
  if (mode === "pad") return { ...(PADS[family] || PADS.generic), move: "LEFT STICK / D-PAD", manual: "UP, DOWN", pause: (PADS[family] || PADS.generic).start };
  if (mode === "touch") return { ollie: "✕", flip: "□", grab: "○", grind: "△", l1: "↶", r1: "↷", r2: "R", start: "II", move: "THE D-PAD", manual: "UP, DOWN", pause: "II" };
  return { ollie: "Z / SPACE", flip: "X", grab: "C", grind: "V", l1: "Q", r1: "E", r2: "SHIFT", start: "ENTER", move: "ARROWS / WASD", manual: "UP, DOWN", pause: "ENTER / ESC" };
}
// the plain-words rows
export function guideLines(mode, family, goofy = false) {
  const n = namesFor(mode, family);
  return [
    ["OLLIE", `HOLD ${n.ollie} TO CROUCH, LET GO TO POP. UP PUSHES, LEFT AND RIGHT TURN, DOWN SLOWS.`],
    ["FLIP", `IN THE AIR, ${n.flip} + A DIRECTION. HOLD ${n.flip} LONGER (OR TAP IT AGAIN) FOR A DOUBLE, THEN A TRIPLE: MORE POINTS, MORE AIR NEEDED. LAND MID-FLIP AND YOU BAIL.`],
    ["GRAB", `${n.grab} + A DIRECTION. HOLD IT TO KEEP SCORING; LET GO BEFORE YOU LAND.`],
    ["GRIND", `${n.grind} WHEN YOU ARE OVER A RAIL, A LEDGE OR THE COPING. A DIRECTION PICKS THE GRIND. LEFT AND RIGHT KEEP YOUR BALANCE.`],
    ["MANUAL", `UP THEN DOWN, QUICKLY (DOWN THEN UP: A NOSE MANUAL). UP AND DOWN KEEP YOUR BALANCE.`],
    ["REVERT", `${n.r2} AS YOU LAND ON A RAMP. THEN A MANUAL, TO KEEP THE COMBO GOING.`],
    ["SPIN", `${n.l1} / ${n.r1}, OR LEFT AND RIGHT ON THE STICK, IN THE AIR. LAND STRAIGHT.`],
    ["COMBO", "EVERY TRICK ADDS ITS POINTS AND +1 TO THE MULTIPLIER. LAND OR STOP TO BANK POINTS X MULTIPLIER. A BAIL LOSES THE LOT. THE SAME TRICK AGAIN IS WORTH LESS."],
    ["STANCE", goofy ? "GOOFY: YOUR TRICKS ARE MIRRORED (LEFT AND RIGHT SWAP)." : "REGULAR. GOOFY MIRRORS YOUR TRICKS: CHANGE IT ON THE START SCREEN."],
  ];
}

// The drawn pad. Left: stick / d-pad (move, spin, manual). Right: the four face buttons, as printed. Top: L1 R1 spin, R2 revert.
export function PadDrawing({ family, mode = "pad" }) {
  const g = namesFor(mode === "keys" ? "pad" : "pad", family);
  const lit = "var(--accent)", dim = "var(--line-hi)", ink = "var(--fg)", mute = "var(--fg-dim)";
  const btn = (cx, cy, label) => (
    <g key={label}>
      <circle cx={cx} cy={cy} r="13" fill={lit} stroke={lit} strokeWidth="2" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={label.length > 1 ? 9 : 13} fontWeight="700" fill="var(--accent-ink)">{label}</text>
    </g>
  );
  return (
    <svg className="sb-pad" viewBox="0 0 430 200" role="img" aria-label={`Controller: ${g.ollie} ollies, ${g.flip} flips, ${g.grab} grabs, ${g.grind} grinds, ${g.r2} reverts, ${g.l1} and ${g.r1} spin.`}>
      <path d="M70 40 H310 Q352 40 360 96 Q368 160 330 176 Q300 186 280 150 H100 Q80 186 50 176 Q12 160 20 96 Q28 40 70 40 Z" fill="none" stroke={dim} strokeWidth="3" />
      {/* the shoulders */}
      <rect x="40" y="20" width="56" height="12" rx="4" fill={lit} /><text x="68" y="14" textAnchor="middle" fontSize="11" fontWeight="700" fill={ink}>{g.l1}: SPIN</text>
      <rect x="284" y="20" width="56" height="12" rx="4" fill={lit} /><text x="312" y="14" textAnchor="middle" fontSize="11" fontWeight="700" fill={ink}>{g.r1}: SPIN</text>
      <rect x="352" y="2" width="44" height="14" rx="4" fill={lit} /><text x="374" y="30" textAnchor="middle" fontSize="11" fontWeight="700" fill={ink}>{g.r2}</text><text x="374" y="42" textAnchor="middle" fontSize="9" fill={mute}>REVERT</text>
      {/* left stick: push, turn, manual */}
      <circle cx="96" cy="86" r="24" fill="none" stroke={lit} strokeWidth="3" /><circle cx="96" cy="86" r="10" fill={lit} />
      <text x="96" y="130" textAnchor="middle" fontSize="11" fontWeight="700" fill={ink}>PUSH / TURN</text>
      <text x="96" y="143" textAnchor="middle" fontSize="9" fill={mute}>UP, DOWN = MANUAL</text>
      <path d="M142 112 h12 v-12 h12 v12 h12 v12 h-12 v12 h-12 v-12 h-12 z" fill="none" stroke={lit} strokeWidth="2" transform="translate(-10 -4)" />
      <text x="156" y="160" textAnchor="middle" fontSize="9" fill={mute}>OR D-PAD</text>
      {/* the four face buttons: top grind, left flip, right grab, bottom ollie */}
      {btn(290, 62, g.grind)}{btn(262, 88, g.flip)}{btn(318, 88, g.grab)}{btn(290, 114, g.ollie)}
      <text x="290" y="48" textAnchor="middle" fontSize="11" fontWeight="700" fill={ink}>GRIND</text>
      <text x="240" y="92" textAnchor="end" fontSize="11" fontWeight="700" fill={ink}>FLIP</text>
      <text x="336" y="92" fontSize="11" fontWeight="700" fill={ink}>GRAB (HOLD)</text>
      <text x="290" y="140" textAnchor="middle" fontSize="11" fontWeight="700" fill={ink}>OLLIE (HOLD, LET GO)</text>
    </svg>
  );
}

// The guide itself. onDone: dismissed (a button, or the pad's cross / Start). compact: in the pause menu.
export default function ControlsGuide({ mode, family, goofy = false, onDone = null, compact = false }) {
  const rows = useMemo(() => guideLines(mode, family, goofy), [mode, family, goofy]);
  useEffect(() => {
    if (!onDone) return undefined;
    let raf, prev = null;
    const tick = () => { raf = requestAnimationFrame(tick); const p = readPad(); if (p.connected && prev && ((p.held.act && !prev.act) || (p.held.start && !prev.start))) onDone(); prev = p.connected ? p.held : null; };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onDone]);
  return (
    <section className={`sb-guide${compact ? " compact" : ""}`} aria-label="How to play">
      {!compact && <h2 className="sb-guide-h">HOW TO PLAY</h2>}
      {(mode === "pad" || compact) && <PadDrawing family={family} mode={mode} />}
      <dl className="sb-guide-rows">
        {rows.map(([k, t]) => <div key={k}><dt>{k}</dt><dd>{t}</dd></div>)}
      </dl>
      {onDone && <p className="sb-guide-go"><button type="button" className="sb-chip on" onClick={onDone} autoFocus>GOT IT: SKATE</button> <span className="sb-small">SHOWN ONCE. IT IS ALWAYS UNDER PAUSE, CONTROLS.</span></p>}
    </section>
  );
}
