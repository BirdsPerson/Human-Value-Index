import { GLYPHS } from "../../city/gamepad.js";
import HowTo from "../guideKit.jsx";

// THE SUB-BASEMENTS: the plain-words controls guide (once before the first run, then under Pause,
// CONTROLS), with the pad drawn in the connected pad's own glyphs and the player's hand.
export const GUIDE_KEY = "hvi-crawl-guide-seen", TIPS_KEY = "hvi-crawl-tips";

// the button names for this pad and hand
export function padNames(family, hand) {
  const g = GLYPHS[family] || GLYPHS.generic;
  return hand === -1
    ? { attack: g.turnL, roll: g.turnR, tool: g.zoomIn, interact: g.zoomOut, use: g.find, next: g.back, lock: g.labels, run: "FULL STICK", start: g.start }
    : { attack: g.find, roll: g.back, tool: g.labels, interact: g.act, use: g.turnL, next: g.turnR, lock: g.zoomOut, run: g.run, start: g.start };
}
export function controlName(id, mode, family, hand) {
  if (mode === "pad") return padNames(family, hand)[id];
  if (mode === "touch") return { attack: "HIT", roll: "ROLL", tool: "STAPLE", interact: "ACT", use: "THE TRAY", lock: "HOLD HIT", next: "THE TRAY" }[id] || id.toUpperCase();
  return { attack: "J", roll: "K", tool: "L", interact: "E", use: "Q", lock: "F", next: "1-9" }[id] || id.toUpperCase();
}

export function rowsFor(mode, family, hand) {
  const n = (id) => controlName(id, mode, family, hand);
  const move = mode === "pad" ? `The left stick (or the d-pad) moves. Push it all the way to run${hand === -1 ? "" : `, or hold ${padNames(family, hand).run}`}.` : mode === "touch" ? `Drag on the ${hand === -1 ? "right" : "left"} half to move. WALK slows you down.` : "WASD or the arrow keys. You run; hold Shift to walk.";
  return [
    ["MOVE", move],
    ["HIT", `${n("attack")} swings at whatever is in front of you. Hold it to keep swinging. It turns a little toward the nearest thing.`],
    ["ROLL", `${n("roll")} rolls. You cannot be hurt for most of a roll: roll through a charging cart or a shot.`],
    ["STAPLER", `${n("tool")} fires the stapler gun at the nearest thing in front of you. Good for printers and the copier.`],
    ["ACT", `${n("interact")} goes down the stairs or a hatch, opens a locked door with its keycard, and calls the lift.`],
    ["PACK", mode === "touch" ? "Tap a slot in the tray to use it. COFFEE heals two hearts. FORM 00 clears every shot and stuns everything near you." : `${n("use")} uses the selected slot (${mode === "pad" ? `${n("next")} picks the next one` : "1-9, 0, -, = pick one"}). COFFEE heals two hearts. FORM 00 clears every shot and stuns everything near you.`],
    ["THE WAY DOWN", "Every floor has a stairwell. Breaking cabinets and filing monsters sometimes opens a hatch: a shortcut. Reach the lift at B8 and call it to keep what you carry."],
    ["THE AUDITOR", "Stay on one floor too long and the Auditor comes through the wall. You cannot hurt it. Leave."],
    ["LOSING", "If your hearts run out, or the 20-minute shift does, you wake at B4 without your pack. Lifts you reached stay reached."],
  ];
}

export default function CrawlGuide({ mode, family, hand = 1, onDone = null, compact = false }) {
  const p = padNames(family, hand);
  const lit = hand === -1 ? ["ls", "dpad", "LB", "RB", "X", "B", "Y", "start"] : ["ls", "dpad", "X", "B", "Y", "A", "LB", "RB", "start"];
  return <HowTo title="THE SUB-BASEMENTS: HOW TO PLAY" mode={mode} family={family} rows={rowsFor(mode, family, hand)} onDone={onDone} compact={compact}
    pad={{ lit, label: `Controller, ${hand === -1 ? "left-handed" : "right-handed"}: the left stick moves, ${p.attack} hits, ${p.roll} rolls, ${p.tool} fires the stapler, ${p.interact} acts, ${p.use} uses the pack, ${p.start} pauses.`,
      keys: [["LEFT STICK", "MOVE"], [p.attack, "HIT"], [p.roll, "ROLL"], [p.tool, "STAPLER"], [p.interact, "ACT"], [p.use, "USE"], [p.next, "NEXT SLOT"], [p.lock, "HOLD FACING"], [p.start, "PAUSE"]] }} />;
}

export function tipText(id, mode, family, hand) {
  const n = (k) => controlName(k, mode, family, hand);
  switch (id) {
    case "move": return mode === "touch" ? "DRAG TO MOVE. FIND THE STAIRWELL." : "FIND THE STAIRWELL DOWN. BREAK CABINETS ON THE WAY.";
    case "fight": return `${n("attack")} HITS. ${n("roll")} ROLLS THROUGH TROUBLE.`;
    case "stairs": return `${n("interact")}: GO DOWN`;
    case "hatch": return `A HATCH OPENED. ${n("interact")} ON IT GOES DOWN.`;
    case "coffee": return mode === "touch" ? "LOW ON HEARTS: TAP THE COFFEE IN THE TRAY" : `LOW ON HEARTS: SELECT THE COFFEE, ${n("use")} DRINKS IT`;
    case "auditor": return "THE AUDITOR CANNOT BE HURT. GO DOWN.";
    default: return "";
  }
}
