import { GLYPHS } from "../../city/gamepad.js";
import HowTo from "../guideKit.jsx";

// THE LANES: the plain-words controls guide (once before the first game, then under Pause, CONTROLS).
export const GUIDE_KEY = "hvi-bowling-guide-seen", TIPS_KEY = "hvi-bowling-tips";

export function rowsFor(mode, family, hand = 1) {
  const g = GLYPHS[family] || GLYPHS.generic;
  const rows = mode === "pad" ? [
    ["STAND AND AIM", `Left stick moves you along the floor. ${g.turnL} and ${g.turnR} turn the aim.`],
    ["BOWL", `Right stick: pull it back, then push it forward. A faster push is a faster ball. Prefer one button? ${g.act} three times: set the power (stop short of the red), then the accuracy (on the green), then the hook.`],
    ["HOOK", `Lean the right stick ${hand === -1 ? "right" : "left"} as it goes forward and the ball curves in. ${g.back} cancels a meter. ${g.start} pauses.`],
  ] : mode === "touch" ? [
    ["STAND AND AIM", "Drag the floor at the bottom of the picture to stand left or right. Drag the arrow's head to aim."],
    ["BOWL", "Anywhere on the lane: pull down, then flick up. A faster flick is a faster ball. Too hard and you cross the foul line."],
    ["HOOK", `Curl the end of the flick to the ${hand === -1 ? "right" : "left"} and the ball curves in.`],
  ] : [
    ["STAND AND AIM", "Left and right arrows move you along the floor. A and D turn the aim. Or use the mouse: drag the floor at the bottom to stand, drag the arrow's head to aim."],
    ["BOWL", "Press SPACE three times: it sets the power (stop short of the red), then the accuracy (on the green), then the hook. Or with the mouse: pull back on the lane, then flick forward."],
    ["HOOK", `The third press is the hook. With the mouse, curl the end of the flick to the ${hand === -1 ? "right" : "left"}. BACKSPACE cancels. ESC pauses.`],
  ];
  rows.push(["EASY", "EASY is on at first: slower meters, a straighter ball, the line drawn for you. BUMPERS keep the ball out of the gutter. Both are under SETTINGS on the bowling menu."]);
  if (hand === -1) rows.push(["LEFT-HANDED", "You bowl left-handed: you start on the left and the pocket is the 1-2."]);
  return rows;
}

export default function BowlGuide({ mode, family, hand = 1, onDone = null, compact = false }) {
  const g = GLYPHS[family] || GLYPHS.generic;
  return <HowTo mode={mode} family={family} rows={rowsFor(mode, family, hand)} onDone={onDone} compact={compact}
    pad={{ lit: ["ls", "rs", "LB", "RB", "A", "B", "start"], label: `Controller: left stick stands, ${g.turnL} and ${g.turnR} aim, right stick pulls back and pushes forward to bowl, ${g.act} is the three-press meter, ${g.start} pauses.`,
      keys: [["LEFT STICK", "STAND"], [`${g.turnL} ${g.turnR}`, "AIM"], ["RIGHT STICK", "PULL BACK, PUSH FORWARD"], [g.act, "THREE-PRESS METER"], [g.back, "CANCEL"], [g.start, "PAUSE"]] }} />;
}
