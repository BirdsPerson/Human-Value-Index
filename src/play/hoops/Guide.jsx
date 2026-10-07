import HowTo from "../guideKit.jsx";

// THE COURTS: the plain-words controls guide, 2K20's layout (the same pattern as
// src/play/tennis/Guide.jsx and src/play/football/Guide.jsx, on the shared guideKit). A drawn pad with
// the connected pad's own glyphs, then a row per job. Shown once before the first game (skippable,
// remembered: GUIDE_KEY) and under Pause, CONTROLS.
export const GUIDE_KEY = "hvi-hoops-guide-seen";
export const guideSeen = () => { try { return localStorage.getItem(GUIDE_KEY) === "1"; } catch { return false; } };
export const markGuideSeen = () => { try { localStorage.setItem(GUIDE_KEY, "1"); } catch { /* the tab remembers */ } };

// The 2K button names, by position, on each pad family (west X shoots, south A passes ...).
export const PAD_GLYPHS = {
  xbox: { west: "X", south: "A", east: "B", north: "Y", rt: "RT", lt: "LT", lb: "LB", rb: "RB", view: "VIEW", start: "MENU" },
  playstation: { west: "□", south: "✕", east: "○", north: "△", rt: "R2", lt: "L2", lb: "L1", rb: "R1", view: "SHARE", start: "OPTIONS" },
  switch: { west: "Y", south: "B", east: "A", north: "X", rt: "ZR", lt: "ZL", lb: "L", rb: "R", view: "−", start: "+" },
  generic: { west: "X", south: "A", east: "B", north: "Y", rt: "RT", lt: "LT", lb: "LB", rb: "RB", view: "SELECT", start: "START" },
};
// What each way of playing calls each job's button.
export function namesFor(mode, family) {
  if (mode === "pad") {
    const g = PAD_GLYPHS[family] || PAD_GLYPHS.generic;
    return { shoot: g.west, pass: g.south, bounce: g.east, lob: g.north, sprint: g.rt, post: g.lt, pick: g.lb, icon: `HOLD ${g.rb}`, view: g.view, start: g.start, moves: "RIGHT STICK", move: "LEFT STICK",
      // the icons over your teammates: the sim's A, B, X, Y are the south, east, west and north buttons
      icons: { A: g.south, B: g.east, X: g.west, Y: g.north } };
  }
  if (mode === "touch") return { shoot: "SHOOT", pass: "PASS", bounce: "PASS", lob: "LOB", sprint: "SPRINT", post: "-", pick: "PICK", icon: "-", view: "CAMERA", start: "START", moves: "SWIPE THE COURT", move: "THE ROUND PAD", icons: { A: "1", B: "2", X: "3", Y: "4" } };
  return { shoot: "Z", pass: "X", bounce: "F", lob: "C", sprint: "SHIFT", post: "E", pick: "R", icon: "HOLD G", view: "V", start: "ENTER", moves: "Q + ARROW", move: "ARROWS / WASD", icons: { A: "1", B: "2", X: "3", Y: "4" } };
}
export function guideRows(mode, family, street = false) {
  const n = namesFor(mode, family), keys = mode === "keys";
  return [
    ["MOVE", `${n.move}. ${n.sprint} SPRINTS (IT TIRES YOU; TIRED LEGS SHOOT SHORT).`],
    ["SHOOT", `HOLD ${n.shoot} TO RISE, LET GO AT THE TOP OF THE METER (THE GREEN BAND). NEAR THE RIM IT IS A LAYUP; A DUNKER WITH A LANE DUNKS (${n.sprint} + ${n.shoot}: GO UP STRONG).`],
    ["PASS", `${n.pass} PASSES TOWARD THE STICK, THROWN TO WHERE A RUNNING MAN WILL BE. ${n.bounce} BOUNCE PASS (SLOWER, HARDER TO PICK OFF). ${n.lob} LOB.`],
    ...(mode === "touch" ? [] : [["ICON PASS", `${n.icon}: A BUTTON APPEARS OVER EACH TEAMMATE. ${keys ? "PRESS 1-4" : `PRESS HIS BUTTON (${n.icons.A} ${n.icons.B} ${n.icons.X} ${n.icons.Y})`} TO PASS TO HIM.`],
      ["ALLEY-OOP", `DOUBLE-TAP ${n.lob}: THE LOB GOES UP TO THE TEAMMATE NEAREST THE RIM WHO IS GOING THERE (A DUNKER FIRST). ONE TAP CALLS HIM TO CUT.`]]),
    ["MOVES", `${n.moves}: SIDEWAYS CROSSOVER, BACK STEPBACK, TOWARD THE RIM DRIVE, ROUND SPIN. A QUICK REVERSAL OF THE MOVE STICK IS A MOVE TOO.`],
    ...(mode === "touch" ? [] : [["PLAYS", `${n.pick} CALLS A PICK. ${n.post} POSTS UP NEAR THE PAINT.`]]),
    ["DEFENCE", `${n.shoot} STEAL, ${n.lob} BLOCK OR REBOUND, ${n.bounce} TAKE A CHARGE (STAND STILL), ${n.post} INTENSE D, ${n.pass} SWITCH TO THE MAN NEAREST THE BALL.`],
    ...(street ? [["STREET", "THE HALF COURT: ONES INSIDE THE ARC, TWOS OUTSIDE. CHECK BALL AT THE TOP. AFTER A DEFENSIVE REBOUND OR A STEAL, TAKE IT BACK PAST THE ARC BEFORE YOU SHOOT. A FOUL GIVES THE BALL BACK."]] : []),
    ["CAMERA", `${n.view} SWITCHES: 2K, BROADCAST, STEADY, HIGH, LOW, DRIVE, BASELINE, SKYBOX. THE + UNDER THE COURT (AND PAUSE) SETS ZOOM, HEIGHT AND FOLLOW FOR EACH.`],
    ["PAUSE", n.start],
  ];
}
// The pad's keys strip: the jobs on the drawn pad.
const padKeys = (n) => [[n.shoot, "SHOOT (HOLD) // STEAL"], [n.pass, "PASS // SWITCH"], [n.bounce, "BOUNCE // CHARGE"], [n.lob, "LOB, TWICE: ALLEY-OOP // BLOCK"], [n.icon, "ICON PASSING"], [n.pick, "PICK"], [n.post, "POST // INTENSE D"], [n.sprint, "SPRINT"]];

export default function HoopsGuide({ mode, family, street = false, onDone = null, compact = false }) {
  const n = namesFor(mode, family);
  return <HowTo title="HOW TO PLAY: THE COURTS" mode={mode} family={family} rows={guideRows(mode, family, street)} pad={{ family, lit: ["ls", "rs", "A", "B", "X", "Y", "LB", "RB", "start"], keys: padKeys(n), label: "Controller: 2K layout" }} onDone={onDone} compact={compact} />;
}
