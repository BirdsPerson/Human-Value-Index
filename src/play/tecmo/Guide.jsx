import { useState } from "react";
import { GLYPHS } from "../../city/gamepad.js";

// FOURTH AND LONG: the controls guide, in plain words. Two buttons and a d-pad, NES-style, named with
// the connected pad's own glyphs (or the keys). Three tabs: OFFENCE, DEFENCE, KICKS. Shown once before
// the first game (skippable, remembered: GUIDE_KEY) and from the pause menu's CONTROLS.
export const GUIDE_KEY = "hvi-tecmo-guide-seen";
export const guideSeen = () => { try { return localStorage.getItem(GUIDE_KEY) === "1"; } catch { return false; } };
export const markGuideSeen = () => { try { localStorage.setItem(GUIDE_KEY, "1"); } catch { /* the tab remembers */ } };

export function namesFor(family, two = false) {
  if (family) { const g = GLYPHS[family] || GLYPHS.generic; return { pad: "D-PAD", A: g.act, B: g.back, start: g.start }; }
  return two ? { pad: "WASD / ARROWS", A: "F  ( / FOR P2)", B: "G  ( . FOR P2)", start: "ESC" } : { pad: "ARROWS OR WASD", A: "SPACE", B: "K", start: "ESC" };
}
export const GUIDE = (n) => ({
  offence: [
    ["PICK A PLAY", `${n.pad}, THEN ${n.A}`, "TOP ROW: TWO RUNS. BOTTOM ROW: TWO PASSES."],
    ["SNAP", n.A, ""],
    ["RUN", n.pad, "YOUR BACK TAKES THE HANDOFF AND HITS THE HOLE; THEN STEER."],
    ["BREAK A TACKLE", `TAP ${n.A} FAST`, "WHEN YOU ARE GRABBED. STARS BREAK FREE MORE EASILY."],
    ["PASS", `${n.B} PICKS, ${n.A} THROWS`, "THE GOLD MARK IS YOUR RECEIVER. THROW BEFORE THE RUSH GETS THERE."],
  ],
  defence: [
    ["GUESS THEIR PLAY", `${n.pad}, THEN ${n.A}`, "GUESS RIGHT AND YOUR MEN ARE THROUGH THE LINE AT THE SNAP."],
    ["PICK YOUR MAN", `${n.B} BEFORE THE SNAP`, "THE ARROW SHOWS WHO YOU ARE."],
    ["CHASE", n.pad, "RUN INTO THE BALL CARRIER TO TACKLE HIM."],
    ["DIVE", n.A, "A LONGER REACH. MISS AND YOU ARE ON THE GROUND."],
    ["SWITCH", n.B, "AFTER THE SNAP: TAKE THE MAN NEAREST THE BALL."],
  ],
  kicks: [
    ["KICK", `${n.A} AT THE TOP OF THE METER`, "KICKOFFS, PUNTS, FIELD GOALS, EXTRA POINTS."],
    ["PUNT OR KICK", `ON 4TH DOWN, ${n.pad} DOWN`, "THE KICK ROW SHOWS UNDER THE PLAYS."],
    ["RETURN", n.pad, "YOUR RETURNER CATCHES IT HIMSELF; THEN STEER."],
    ["PAUSE", n.start, ""],
  ],
});
const TABS = [["offence", "OFFENCE"], ["defence", "DEFENCE"], ["kicks", "KICKS"]];

export default function ControlsGuide({ family = null, two = false, onDone = null, compact = false }) {
  const [tab, setTab] = useState("offence");
  const rows = GUIDE(namesFor(family, two))[tab];
  return (
    <div className={`tb-guide${compact ? " compact" : ""}`}>
      {!compact && <p className="tb-cabhead">HOW TO PLAY. {family ? "YOUR PAD'S BUTTONS ARE SHOWN." : "A PAD WORKS TOO."}</p>}
      <div className="tb-chips" role="tablist" aria-label="Controls">
        {TABS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tb-chip${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      <dl className="tb-keys" role="tabpanel">
        {rows.map(([what, keys, note]) => <div key={what} className="row"><dt>{what}</dt><dd><kbd>{keys}</kbd>{note ? ` ${note}` : ""}</dd></div>)}
      </dl>
      {onDone && <button type="button" className="tb-chip on tb-go" onClick={onDone} autoFocus>GOT IT: KICK OFF</button>}
    </div>
  );
}

// First-run tips: one line the first time each thing comes up, then never again (TIPS_KEY).
const TIPS_KEY = "hvi-tecmo-tips";
export const tipsSeen = () => { try { return new Set(JSON.parse(localStorage.getItem(TIPS_KEY) || "[]")); } catch { return new Set(); } };
export const markTip = (seen, k) => { seen.add(k); try { localStorage.setItem(TIPS_KEY, JSON.stringify([...seen])); } catch { /* the tab remembers */ } };
// -> [key, text] for what the human on `side` is facing now, or null
export function tipFor(st, side, n) {
  const off = st.poss === side;
  if (st.phase === "call" && !st.call.lock[side]) return off ? ["call", `PICK A PLAY: ${n.pad}, THEN ${n.A}. TOP ROW RUNS, BOTTOM ROW PASSES.`] : ["guess", `DEFENCE: GUESS THEIR PLAY (${n.pad}, THEN ${n.A}). GUESS RIGHT AND YOUR MEN BLOW IT UP.`];
  if (st.phase === "pre") return off ? ["snap", `PRESS ${n.A} TO SNAP THE BALL.`] : ["man", `THE ARROW IS YOUR MAN. ${n.B} PICKS ANOTHER.`];
  if (st.phase === "kick" && st.kick?.t === side && st.kick.power < 0) return ["kick", `PRESS ${n.A} WHEN THE METER IS FULL.`];
  if (st.phase !== "live") return null;
  const c = st.ball?.state === "held" ? st.p[st.ball.g] : null;
  if (c && st.grab && st.grab.g === c.g && c.t === side) return ["mash", `TAP ${n.A} AS FAST AS YOU CAN TO BREAK THE TACKLE!`];
  if (c && c.t === side && st.ctrl[side] === c.g) {
    if (c.role === "qb" && st.play?.kind === "pass" && !st.play.thrown) return ["pass", `${n.B}: NEXT RECEIVER (THE GOLD MARK). ${n.A}: THROW.`];
    return ["run", `RUN WITH THE ${n.pad}. HEAD FOR THE END ZONE.`];
  }
  if (c && c.t !== side) return ["tackle", `RUN INTO THE BALL CARRIER TO TACKLE. ${n.A} DIVES.`];
  return null;
}
