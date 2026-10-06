import { useEffect, useRef } from "react";
import { PAD_GLYPHS } from "./input.js";
import { readPad } from "../../city/gamepad.js";

// THE BOWL: the controls guide, in plain words, with a drawn pad (the connected pad's own glyphs).
// Six answers: PLAY CALL, PRE-SNAP, PASSING, RUNNING, DEFENCE, KICKS. Shown once before the first game
// (skippable, remembered: GUIDE_KEY) and in the pause menu's CONTROLS. Also the first-run tips: one line
// the first time each thing comes up, gone once used (TIPS_KEY).
export const GUIDE_KEY = "hvi-football-guide-seen";
export const guideSeen = () => { try { return localStorage.getItem(GUIDE_KEY) === "1"; } catch { return false; } };
export const markGuideSeen = () => { try { localStorage.setItem(GUIDE_KEY, "1"); } catch { /* the tab remembers */ } };

// What the way you play calls each thing.
export function namesFor(mode, family) {
  if (mode === "pad") { const g = PAD_GLYPHS[family] || PAD_GLYPHS.generic; return { ...g, move: "LEFT STICK", ask: g.Y, flip: g.X, go: g.A }; }
  if (mode === "touch") return { A: "A", B: "B", X: "X", Y: "Y", RB: "RB", sprint: "SPRINT", rs: "THE ROUND PAD", start: "START", move: "THE ROUND PAD", ask: "ASK", flip: "FLIP", go: "SNAP" };
  return { A: "SPACE", B: "K", X: "U", Y: "I", RB: "O", sprint: "SHIFT", rs: "L", start: "ENTER", move: "ARROWS OR WASD", ask: "I", flip: "U", go: "SPACE" };
}
export const guideRows = (mode, family) => {
  const n = namesFor(mode, family), recv = mode === "keys" ? "1 2 3 4 5" : `${n.A} ${n.B} ${n.X} ${n.Y} ${n.RB}`;
  return [
    ["PLAY CALL", `Between downs, pick a formation, then a play: ${n.move}, then ${n.go}. Each card draws the play. Not sure? Press ${n.ask} (ASK THE COORDINATOR) and he picks one. ${n.flip} flips it. On defence you pick a coverage.`],
    ["PRE-SNAP", `Press ${n.go} to snap. Before that, ${n.X} opens the audibles and ${n.Y} sends a receiver deep (a hot route). You have 25 seconds.`],
    ["PASSING", `Each receiver wears a button (${recv}). Press his button to throw to him: a quick tap is a bullet, hold it a moment for a lob. Throw before the rush gets to you.`],
    ["RUNNING", `${n.move} steers, hold ${n.sprint} to sprint. ${n.A} lowers a shoulder to break a tackle, ${n.B} spins, ${n.rs}${mode === "touch" ? "" : " left or right"} jukes, ${n.Y} stiff-arms. Moves are a bonus: running straight works.`],
    ["DEFENCE", `Your man has the yellow ring. Run into the ball carrier to tackle. ${n.A} wraps up, ${n.X} dives, ${n.B} switches to the man nearest the ball, ${n.Y} swats a pass.`],
    ["KICKS", `Press ${n.go} three times: to start the meter, to set the power at the top, and again as the needle crosses the line. After a touchdown you pick the kick or going for two.`],
  ];
};

// The drawn pad: left stick MOVE, the face buttons, the right bumper, the trigger.
export function PadDrawing({ mode, family }) {
  const n = namesFor("pad", mode === "pad" ? family : "xbox"), g = n;
  const lit = "var(--accent)", dim = "var(--line-hi)", ink = "var(--fg)", mute = "var(--fg-dim)";
  const btn = (cx, cy, label) => (
    <g key={label}>
      <circle cx={cx} cy={cy} r="13" fill={lit} stroke={lit} strokeWidth="2" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--accent-ink)">{label}</text>
    </g>
  );
  return (
    <svg className="fb-pad" viewBox="0 0 600 210" role="img" aria-label={`Controller: left stick moves; ${g.A} snaps, tackles and throws to the running back; ${g.B} spins and switches; ${g.X} audibles and dives; ${g.Y} asks the coordinator; ${g.RB} is the slot receiver; ${g.sprint} sprints.`}>
      <path d="M95 48 H345 Q392 48 400 104 Q408 168 370 184 Q340 194 320 158 H120 Q100 194 70 184 Q32 168 40 104 Q48 48 95 48 Z" fill="none" stroke={dim} strokeWidth="3" />
      <circle cx="108" cy="92" r="24" fill="none" stroke={lit} strokeWidth="3" /><circle cx="108" cy="92" r="10" fill={lit} />
      <text x="108" y="42" textAnchor="middle" fontSize="12" fontWeight="700" fill={ink}>MOVE</text>
      <text x="108" y="140" textAnchor="middle" fontSize="10" fill={mute}>SPRINT: HOLD {g.sprint}</text>
      <circle cx="262" cy="130" r="14" fill="none" stroke={dim} strokeWidth="2" />
      <text x="262" y="166" textAnchor="middle" fontSize="10" fill={mute}>RIGHT STICK: JUKE, TRUCK</text>
      {btn(340, 72, g.Y)}{btn(312, 96, g.X)}{btn(368, 96, g.B)}{btn(340, 120, g.A)}
      <text x="414" y="70" fontSize="11" fontWeight="700" fill={ink}>{g.Y}: ASK THE COACH, STIFF-ARM</text>
      <text x="414" y="88" fontSize="11" fontWeight="700" fill={ink}>{g.B}: SPIN, SWITCH</text>
      <text x="414" y="106" fontSize="11" fontWeight="700" fill={ink}>{g.A}: SNAP, THROW, TACKLE</text>
      <text x="414" y="124" fontSize="11" fontWeight="700" fill={ink}>{g.X}: AUDIBLE, DIVE</text>
      <rect x="296" y="22" width="60" height="14" rx="5" fill={lit} /><text x="326" y="33" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--accent-ink)">{g.RB}</text>
      <text x="414" y="142" fontSize="11" fontWeight="700" fill={ink}>{g.RB}: SLOT RECEIVER</text>
      <text x="414" y="160" fontSize="11" fill={mute}>{g.start}: PAUSE</text>
    </svg>
  );
}

// The guide itself. onDone: dismissed (a button, or the pad's A / Start). compact: in the pause menu.
export default function ControlsGuide({ mode, family, onDone = null, compact = false }) {
  const rows = guideRows(mode, family), go = useRef(null);
  useEffect(() => { go.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (!onDone) return undefined;
    let raf, prev = null;
    const tick = () => { raf = requestAnimationFrame(tick); const p = readPad(); if (p.connected && prev && ((p.held.act && !prev.act) || (p.held.start && !prev.start))) onDone(); prev = p.connected ? p.held : null; };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onDone]);
  return (
    <section className={`fb-guide${compact ? " compact" : ""}`} aria-label="How to play">
      {!compact && <h2 className="fb-guide-h">HOW TO PLAY</h2>}
      {mode === "pad" && <PadDrawing mode={mode} family={family} />}
      <dl className="fb-guide-rows">{rows.map(([k, t]) => <div key={k}><dt>{k}</dt><dd>{t}</dd></div>)}</dl>
      {onDone && <p className="fb-guide-go"><button type="button" className="fb-chip" onClick={onDone} ref={go}>GOT IT: PLAY</button> <span className="fb-small">SHOWN ONCE. IT IS ALWAYS UNDER PAUSE, CONTROLS.</span></p>}
    </section>
  );
}

// ---- first-run tips -------------------------------------------------------------------------------
const TIPS_KEY = "hvi-football-tips";
export const tipsSeen = () => { try { return new Set(JSON.parse(localStorage.getItem(TIPS_KEY) || "[]")); } catch { return new Set(); } };
export const markTip = (seen, k) => { seen.add(k); try { localStorage.setItem(TIPS_KEY, JSON.stringify([...seen])); } catch { /* the tab remembers */ } };
// -> [key, text] for what the human faces now (cx: the sim's context), or null. close: a defender is
// within a few yards of the human's carrier.
export function tipFor(cx, off, close, mode, family) {
  const n = namesFor(mode, family);
  if (cx === "call") return off ? ["call", `PICK A PLAY (OR ASK THE COORDINATOR: ${n.ask}).`] : ["calld", `PICK A COVERAGE (OR ASK THE COORDINATOR: ${n.ask}).`];
  if (cx === "pre-off") return ["snap", `${n.go === "SNAP" ? "TAP SNAP" : `${n.go} TO SNAP`}.`];
  if (cx === "pre-def") return ["man", `YOUR MAN HAS THE YELLOW RING. ${n.B} PICKS ANOTHER. STAY BEHIND THE LINE.`];
  if (cx === "kick") return ["kick", `${n.go} THREE TIMES: START, POWER, ACCURACY.`];
  if (cx === "qb") return ["pass", mode === "touch" ? "TAP A RECEIVER TO THROW. HOLD FOR A LOB." : `PRESS A RECEIVER'S BUTTON TO THROW (${mode === "keys" ? "1 2 3 4 5" : `${n.A} ${n.B} ${n.X} ${n.Y} ${n.RB}`}).`];
  if (cx === "run") return close ? ["break", `TAP ${n.A} TO BREAK A TACKLE (${n.B} SPINS).`] : ["run", `STEER WITH ${n.move}. HOLD ${n.sprint} TO SPRINT.`];
  if (cx === "def") return ["tackle", `RUN INTO THE BALL CARRIER TO TACKLE. ${n.A} WRAPS HIM UP.`];
  return null;
}
