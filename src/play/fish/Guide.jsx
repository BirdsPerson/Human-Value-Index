import { GLYPHS } from "../../city/gamepad.js";
import HowTo from "../guideKit.jsx";

// THE WATERS: the plain-words controls guide (once before the first trip, then under Pause, CONTROLS).
// One button does it all: cast, hook, reel. EXPERT keeps the old legend (Fish.jsx's Controls).
export const GUIDE_KEY = "hvi-fish-guide-seen", TIPS_KEY = "hvi-fish-tips";

export function rowsFor(mode, family) {
  const g = GLYPHS[family] || GLYPHS.generic;
  const A = mode === "pad" ? g.act : mode === "touch" ? "THE BIG BUTTON" : "SPACE (OR Z)";
  return [
    ["CAST", mode === "touch" ? "Tap the water where you want the float to land, or use the arrows to aim. The big button casts." : mode === "pad" ? `Aim with the d-pad or left stick (left and right). Press ${A} to cast.` : `Aim with the left and right arrows, or click the water where you want the float to land. Press ${A} to cast.`],
    ["BITE", `Wait. A nibble is not a bite: leave it alone. When the float plunges and the screen says IT BIT, press ${A}. You have almost a second.`],
    ["REEL", `Hold ${A} to reel the fish in. Let go and it drifts back a little. A big one tugs: keep holding.`],
    ["KEEP", mode === "pad" ? `On the catch card, ${g.act} keeps it, ${g.back} lets it go.` : mode === "touch" ? "On the catch card, tap KEEP or RELEASE." : "On the catch card, SPACE keeps it, X lets it go."],
  ];
}

export default function FishGuide({ mode, family, onDone = null, compact = false }) {
  const g = GLYPHS[family] || GLYPHS.generic;
  return <HowTo mode={mode} family={family} rows={rowsFor(mode, family)} onDone={onDone} compact={compact}
    pad={{ lit: ["dpad", "ls", "A", "B", "start"], label: `Controller: ${g.act} casts, hooks and reels; the d-pad aims; ${g.back} releases a fish; ${g.start} pauses.`,
      keys: [[g.act, "CAST, SET THE HOOK, HOLD TO REEL"], ["D-PAD", "AIM THE CAST"], [g.back, "RELEASE"], [g.start, "PAUSE"]] }} />;
}

export function tipText(id, mode, family) {
  const g = GLYPHS[family] || GLYPHS.generic, A = mode === "pad" ? g.act : mode === "touch" ? "THE BIG BUTTON" : "SPACE";
  if (id === "cast") return `PRESS ${A} TO CAST`;
  if (id === "bite") return `IT BIT: PRESS ${A} NOW`;
  if (id === "reel") return `HOLD ${A} TO REEL IT IN`;
  return "";
}
