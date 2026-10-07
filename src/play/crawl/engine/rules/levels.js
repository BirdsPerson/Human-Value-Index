// LEVELS: the casual-human dials (docs/design/DUNGEON.md 3.10). Each dial is a hook that scales one
// code path; the outcomes (the first-timer bot's reach of the B8 lift) are measured, never chosen.
//   hearts   the run's starting hearts                       (combat.js: the player's pips)
//   dmg      every monster's damage but the Auditor's        (combat.js hurt())
//   loiter   seconds on a floor before THE AUDITOR arrives   (rules/floor.js)
//   cone     the aim-assist cone, degrees, whole width       (combat.js assisted())
//   hatch    the hatch chance curve                          (loot.js hatchRoll())
//   gen      the generator's spawn rate                      (ai/archetypes.js generator)
//   bounty   the bounty factor (9.4; recorded, minted from D2)
// The cone's half-angle cosines are written out (no trig in the engine).
export const LEVELS = {
  intern:   { name: "INTERN",   hearts: 8, dmg: 0.7, loiter: 240, cone: 90, coneCos: 0.7071067811865476, hatch: 1.5, gen: 0.7, bounty: 0.6 },
  clerk:    { name: "CLERK",    hearts: 6, dmg: 1.0, loiter: 150, cone: 60, coneCos: 0.8660254037844387, hatch: 1.0, gen: 1.0, bounty: 1.0 },
  officer:  { name: "OFFICER",  hearts: 6, dmg: 1.2, loiter: 120, cone: 45, coneCos: 0.9238795325112867, hatch: 0.8, gen: 1.3, bounty: 1.3 },
  director: { name: "DIRECTOR", hearts: 5, dmg: 1.4, loiter: 90,  cone: 30, coneCos: 0.9659258262890683, hatch: 0.6, gen: 1.6, bounty: 1.6 },
};
export const LEVEL_ORDER = ["intern", "clerk", "officer", "director"];
export const DEFAULT_LEVEL = "intern";
// Parties (D4) play NEUTRAL: CLERK's numbers, monster hearts and spawn counts scaled by the party size.
export const NEUTRAL = "clerk";
export const levelOf = (id) => LEVELS[id] || LEVELS[DEFAULT_LEVEL];
