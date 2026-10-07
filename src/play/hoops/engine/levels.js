// THE COURTS engine, levels.js: the difficulty dials (LEVELS, measured on the casual human) and the rated game (NEUTRAL).
// Split from the v4 sim.js unchanged (docs/design/BASKETBALL.md 4.2, stage S1a); pure: imports nothing
// from outside src/play/hoops/engine/.

// ---- difficulty ----------------------------------------------------------------------------------
// 2K's four levels. Each only biases your side (team 0 when a human plays) and how the CPU plays
// against you; a CPU v CPU game (cfg.auto) plays as rated (NEUTRAL), so the calibration holds. The
// game as rated (v2 without EASY MODE) proved too hard for a casual player even against an equal five
// (Scott, 2026-10-06: "way too hard"), so HALL OF FAME is the rated game with the CPU's shots a little
// softer; the rest ease down from there.
// Measured with a simulated casual human (scripts/check-hoops.mjs "difficulty") against an equal five.
//   green     frames added either side of your meter's green band
//   contest   how much a defender's contest costs your shot (1 = as rated)
//   make      your side's shots; ft your free throws; cpuMake the CPU's shots against you
//   cpuSteal  the CPU's reach-ins and interceptions against you; cpuBlock its blocks; react the frames
//             its defenders add before leaving their feet at your shot
//   help      how fast the CPU's help defence rotates to your drive (1 = a sprint)
//   cut       your teammates' extra cuts to the rim; mateD how tightly they guard (their contests)
//   lose      the chance a dribble move loses the ball; ankle added to its chance of breaking ankles
//   steal     added to your reach-in's chance of a steal
//   foul      how strictly your defence is whistled (reach-ins, shooting fouls, blocks)
//   autoD     your man guards for you when you let go of the stick
//   sw        defence auto-switch: "mark" (to the man guarding the ball), "near" (nearest the ball),
//             "poss" (only when possession changes; A switches)
//   sta       your sprint's stamina drain; spd your speed; drive how much a defender in front slows
//             your drive less; tip the jump ball
//   reb       {team size: metres} added to your side's reach for a loose ball (the glass is where a
//             casual player loses a small game: in 1v1 nobody else boxes out for you)
//   street    {team size: {make, cpuMake}} the half court's own ease on top of make / cpuMake
// v4 (lead passes made the offence better, the half court is new) re-measured every level in every
// mode with the casual human (scripts/check-hoops.mjs "difficulty").
export const LEVELS = {
  rookie: { id: "rookie", name: "ROOKIE", green: 1, contest: 0.9, make: 0.97, ft: 1.06, cpuMake: 0.82, cpuSteal: 0.4, cpuBlock: 0.5, react: 6, help: 0.6, cut: 0.1, mateD: 1.4, lose: 0.3, ankle: 0.06, steal: 0.05, foul: 0.5, autoD: true, sw: "mark", sta: 0.6, spd: 1.06, drive: 0.2, tip: 0.1,
    reb: { 1: 0.36, 3: 0.32, 5: 0.09 } },
  pro: { id: "pro", name: "PRO", green: 1, contest: 0.95, make: 0.98, ft: 1.03, cpuMake: 0.87, cpuSteal: 0.65, cpuBlock: 0.8, react: 3, help: 0.8, cut: 0.06, mateD: 1.2, lose: 0.6, ankle: 0.03, steal: 0.025, foul: 0.75, autoD: true, sw: "mark", sta: 0.8, spd: 1.03, drive: 0.1, tip: 0.05,
    reb: { 1: 0.25, 3: 0.26, 5: 0.06 }, street: { 1: { make: 1.05, cpuMake: 0.92 }, 3: { make: 1.03, cpuMake: 0.95 } } },
  allstar: { id: "allstar", name: "ALL-STAR", green: 1, contest: 1, make: 1, ft: 1, cpuMake: 0.89, cpuSteal: 0.75, cpuBlock: 0.9, react: 1, help: 0.85, cut: 0.03, mateD: 1.12, lose: 0.75, ankle: 0.01, steal: 0.01, foul: 0.9, autoD: true, sw: "near", sta: 0.9, spd: 1, drive: 0.05, tip: 0,
    reb: { 1: 0.25, 3: 0.15, 5: 0.05 }, street: { 1: { make: 1.03, cpuMake: 0.92 }, 3: { make: 1.02, cpuMake: 0.93 } } },
  hof: { id: "hof", name: "HALL OF FAME", green: 0, contest: 1, make: 1, ft: 1, cpuMake: 0.95, cpuSteal: 1, cpuBlock: 1, react: 0, help: 1, cut: 0, mateD: 1, lose: 1, ankle: 0, steal: 0, foul: 1, autoD: false, sw: "poss", sta: 1, spd: 1, drive: 0, tip: 0,
    reb: { 1: 0.25, 3: 0.22, 5: 0.06 }, street: { 1: { make: 1.02, cpuMake: 0.88 }, 3: { make: 1.02, cpuMake: 0.92 } } },
};
// the game as rated, every dial at 1: what a CPU v CPU game plays (and v2's game without EASY MODE)
export const NEUTRAL = { id: "rated", green: 0, contest: 1, make: 1, ft: 1, cpuMake: 1, cpuSteal: 1, cpuBlock: 1, react: 0, help: 1, cut: 0, mateD: 1, lose: 1, ankle: 0, steal: 0, foul: 1, autoD: false, sw: "near", sta: 1, spd: 1, drive: 0, tip: 0 };
export const LEVEL_ORDER = ["rookie", "pro", "allstar", "hof"];
// a record from before the levels: EASY MODE (assist) was the nearest thing to ROOKIE
export const levelOf = (cfg = {}) => (LEVELS[cfg.level] ? cfg.level : cfg.assist ? "rookie" : "allstar");
