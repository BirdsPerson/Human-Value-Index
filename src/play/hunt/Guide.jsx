import { GLYPHS } from "../../city/gamepad.js";
import HowTo from "../guideKit.jsx";

// TAGGED OUT: the plain-words controls guide (once before the first trip, then under Pause, CONTROLS).
export const GUIDE_KEY = "hvi-hunt-guide-seen", TIPS_KEY = "hvi-hunt-tips";

export function rowsFor(mode, family) {
  const g = GLYPHS[family] || GLYPHS.generic;
  const aim = mode === "pad" ? "Push the left stick to move the sight; it speeds up the longer you push, and slows a little over a target." : mode === "touch" ? "Tap where you want to shoot: your finger aims and shoots at once." : "Move the mouse to aim. The arrow keys also nudge the sight.";
  const shoot = mode === "pad" ? `${g.act} or the right trigger (RT) shoots.` : mode === "touch" ? "A tap shoots." : "Click, or press SPACE, to shoot.";
  const reload = mode === "pad" ? `You have five shells. ${g.find} or ${g.back} reloads, or shoot off the screen.` : mode === "touch" ? "You have five shells. Press RELOAD, or tap the dark border off the screen." : "You have five shells. Right-click or R reloads, or click off the screen.";
  return [
    ["AIM", aim],
    ["SHOOT", shoot],
    ["RELOAD", reload],
    ["WHAT TO SHOOT", "Shoot the bucks and bulls (the ones with antlers). Never the does or cows: three strikes and the trip is over. Shoot at least one male in each stage. Trees and brush stop a shot. Behind the shoulder scores double."],
  ];
}

export default function HuntGuide({ mode, family, onDone = null, compact = false }) {
  const g = GLYPHS[family] || GLYPHS.generic;
  return <HowTo mode={mode} family={family} rows={rowsFor(mode, family)} onDone={onDone} compact={compact}
    pad={{ lit: ["ls", "A", "B", "X", "start"], label: `Controller: the left stick aims, ${g.act} or the right trigger shoots, ${g.find} or ${g.back} reloads, ${g.start} pauses.`,
      keys: [["LEFT STICK", "AIM"], [`${g.act} / RT`, "SHOOT"], [`${g.find} / ${g.back}`, "RELOAD"], [g.start, "PAUSE"]] }} />;
}

export function tipText(id, mode, family) {
  const g = GLYPHS[family] || GLYPHS.generic;
  if (id === "aim") return mode === "pad" ? `AIM WITH THE LEFT STICK, SHOOT WITH ${g.act}` : mode === "touch" ? "TAP A BUCK TO SHOOT IT" : "POINT AT A BUCK AND CLICK";
  if (id === "female") return "NO SHOOTING DOES OR COWS: THREE STRIKES ENDS THE TRIP";
  if (id === "reload") return mode === "pad" ? `LOW ON SHELLS: ${g.find} RELOADS` : mode === "touch" ? "LOW ON SHELLS: PRESS RELOAD" : "LOW ON SHELLS: RIGHT-CLICK OR PRESS R TO RELOAD";
  return "";
}
