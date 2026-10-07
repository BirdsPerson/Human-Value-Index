// THE COURTS engine: the public face (what the v4 sim.js exported, from where it lives now). Adapters
// import this; nothing in engine/ imports from outside it (docs/design/BASKETBALL.md 4.2).
export { VERSION, newGame, step, resultOf, replay, setUp, forceShot, forceFreeThrows } from "./game.js";
export { HZ, COURT, TOP_SPOT, dirOf, isThree } from "./court.js";
export { BTN } from "./input/intents.js";
export { FORMATS, MODES, STREET_TO, SHOT_CLOCKS, TIP_JUMP } from "./rules/index.js";
export { ICONS, ARCHES, sk, abilities, POSITIONS, BUILD, POS_ARCH, positionOf } from "./players.js";
export { TOP, FT_TOP, GRADES, greenOf, gradeOf, contestOf, CONTEST_WORDS, contestWord, kindAt, shotProb, ftProb } from "./shot.js";
export { LEVELS, LEVEL_ORDER, levelOf } from "./levels.js";
export { passSpeed, leadTime } from "./pass.js";
export { rleEncode, rleDecode } from "./record.js";
// v5: the possession's rules and roles, for the page (the penalty on the board) and the checks
export { pressCall, inPenalty, PICK_UP } from "./rules/index.js";
export { RULES, rulesOf } from "./rules/tables.js";
export { handleScore, isBig } from "./ai/roles.js";
