// TAGGED OUT, the bar cabinet's data (docs/CITY_SPEC.md "THE HUNT"). A light-gun bar cabinet in the
// shape every bar has one of: scenic stages on a slow rail, the target species crossing, the females
// you must not shoot, a bonus round, a trophy at the end. Pure, no DOM, no Math.random, no
// transcendental Math: sim.js is re-played on the server (netlify/functions/hunt.js) and must come
// out to the point. Animals only. Nobody else is ever in the sights, and
// it is a video game: in the city itself no animal is harmed (the foothills outfitter only captures).
import { conditionsAt, SEASONS, LIGHTS, fnv, rngStep, HZ } from "../fish/data.js";
export { conditionsAt, SEASONS, LIGHTS, fnv, rngStep, HZ };

export const W = 320, H = 180;   // the frame, in game pixels (the pointer is quantized to these)

// ---- the species ---------------------------------------------------------------------------------
// w, h: the body's size in sprite pixels at scale 1 (feet to the top of the back, nose to tail).
// base: points per antler point; pts: the antler points a male can carry [min, max]; inch0/perPt:
// the trophy's score in tenths of an inch (a made-up Department scale, not anyone's record book).
// speed: walking pace in game pixels a tick at scale 1; run: the bolt.
// open: the seasons (fish/data.js SEASONS index) when the Department issues tags for it.
export const SPECIES = [
  { id: "whitetail", name: "WHITETAIL", male: "BUCK", female: "DOE", w: 30, h: 21, base: 100, pts: [4, 14], inch0: 900, perPt: 85, speed: 0.42, run: 1.25, coat: ["#9a6a3a", "#c8a070", "#5a3a1e"], open: [2, 3] },
  { id: "elk", name: "ELK", male: "BULL", female: "COW", w: 36, h: 26, base: 130, pts: [5, 14], inch0: 2200, perPt: 140, speed: 0.36, run: 1.05, coat: ["#a87848", "#d8b888", "#4a2e18"], open: [2] },
  { id: "moose", name: "MOOSE", male: "BULL", female: "COW", w: 40, h: 30, base: 160, pts: [6, 16], inch0: 1600, perPt: 120, speed: 0.3, run: 0.85, coat: ["#3a2a1e", "#5a4430", "#1a120c"], open: [2, 3] },
  { id: "caribou", name: "CARIBOU", male: "BULL", female: "COW", w: 33, h: 23, base: 120, pts: [8, 20], inch0: 2600, perPt: 110, speed: 0.4, run: 1.2, coat: ["#8a7a68", "#e8e0d0", "#4a3e30"], open: [1, 2] },
];
export const SPECIES_BY = Object.fromEntries(SPECIES.map(s => [s.id, s]));

// ---- the scenes: OUR world (the forest belt, the foothills, THE ATTRITION, the mountain) ------------
// horizon: the far tree line's foot, in game px; cover: foreground trunks and brush in WORLD x (the
// rail moves the view across them), [x, w, y0] (blocks shots from y0 down to the ground).
// travel: how far the rail moves across the stage, game px.
export const SCENES = {
  meadow: { name: "THE FOOTHILLS MEADOW", place: "THE FOOTHILLS", horizon: 84, travel: 120, cover: [[36, 34, 140], [236, 40, 146], [392, 30, 138]] },
  forest: { name: "THE FOREST BELT", place: "THE FOOTHILLS", horizon: 78, travel: 140, cover: [[20, 9, 0], [118, 12, 0], [214, 8, 0], [330, 13, 0], [420, 10, 0]] },
  river: { name: "THE ATTRITION, EAST BANK", place: "THE ATTRITION", horizon: 88, travel: 110, cover: [[70, 16, 120], [300, 18, 116]] },
  ridge: { name: "THE MOUNTAIN RIDGE", place: "THE MOUNTAIN", horizon: 96, travel: 100, cover: [[150, 22, 128], [360, 16, 124]] },
  marsh: { name: "THE RETENTION POOL MARSH", place: "THE MOUNTAIN LAKE", horizon: 90, travel: 110, cover: [[30, 14, 112], [200, 12, 110], [380, 14, 114]] },
  tundra: { name: "ABOVE THE TREE LINE", place: "THE MOUNTAIN", horizon: 100, travel: 90, cover: [[260, 20, 130]] },
  range: { name: "THE DEPARTMENT RANGE", place: "THE FOOTHILLS", horizon: 86, travel: 0, cover: [[50, 30, 150], [244, 30, 150]] },
  ducks: { name: "DUCKS OVER THE ATTRITION", place: "THE ATTRITION", horizon: 120, travel: 60, cover: [], bonus: "birds" },
  forms: { name: "THE PAPERWORK SHOOT", place: "THE DEPARTMENT RANGE", horizon: 110, travel: 0, cover: [], bonus: "forms" },
};

// ---- the trips (ranked: the cabinet's menu, easiest first) ---------------------------------------------
// scenes run in order; a stage with a quota needs that many males filed to go on ("TAG FILLED").
export const TRIPS = [
  { id: "whitetail", name: "WHITETAIL", sp: "whitetail", rank: 1, scenes: ["meadow", "forest", "ducks", "river", "ridge"], note: "THE FOOTHILLS TO THE RIDGE. THE CLASSIC." },
  { id: "elk", name: "ELK", sp: "elk", rank: 2, scenes: ["meadow", "ridge", "ducks", "forest", "tundra"], note: "THE BULLS BUGLE. THE DEPARTMENT TAKES NOTES." },
  { id: "moose", name: "MOOSE", sp: "moose", rank: 3, scenes: ["river", "marsh", "ducks", "forest", "marsh"], note: "SLOW, LARGE, UNIMPRESSED." },
  { id: "caribou", name: "CARIBOU", sp: "caribou", rank: 4, scenes: ["tundra", "ridge", "ducks", "tundra", "meadow"], note: "THE HERD MOVES. SO SHOULD YOU." },
  { id: "department", name: "THE DEPARTMENT SHOOT", sp: "whitetail", rank: 5, scenes: ["range", "forms", "range"], decoys: true, note: "CARDBOARD BUCKS, DEPARTMENT PROPERTY. THE REAL DEER WANDER THROUGH. DO NOT." },
];
export const TRIP = Object.fromEntries(TRIPS.map(t => [t.id, t]));

// Is the season open for a trip on this machine day? (the Department is always in season)
export function seasonOpen(tripId, at) {
  const t = TRIP[tripId];
  if (!t || t.decoys) return true;
  const c = conditionsAt(at);
  return SPECIES_BY[t.sp].open.includes(c.season);
}
export const openSeasonsLine = (sp) => SPECIES_BY[sp].open.map(i => SEASONS[i]).join(" AND ");

// ---- the rules (scripts/check-hunt.mjs holds every one) ----------------------------------------------
export const RULES = {
  STAGE_TICKS: 25 * 60,        // a hunting stage: 25 seconds
  BONUS_TICKS: 15 * 60,        // a bonus round
  TITLE_TICKS: 100,            // the stage card, before the rail moves (no shooting)
  CLEAR_TICKS: 120,            // the stage's tally
  SHELLS: 5,                   // a magazine
  RELOAD_TICKS: 36,            // shoot off the screen (or reload) to fill it
  COOLDOWN: 14,                // between shots: the action is worked
  QUOTA: 1,                    // males filed to go on from a hunting stage
  FEMALE: -500,                // a doe, a cow: off the score, and a strike
  STRIKES: 3,                  // three and the licence is revoked: the trip ends
  CRITTER: 200,                // a rabbit or a turkey that wandered into it
  BIRD: 100, GOLD: 500,        // a duck in the bonus round; the golden one
  FORM: 100, FORM_GOLD: 500,   // the paperwork shoot's forms; the gold-sealed one
  VITAL: 2, HEAD_NUM: 3, HEAD_DEN: 2,   // multipliers: behind the shoulder x2, the head x1.5, the body x1
  QUICK: 600,                  // the quick-shot bonus: (QUICK - ticks it was in view) / 2, never below 0
  TAG_BONUS: 500,              // per male filed, at the stage's tally
  ACCURACY: 2000,              // the trip's accuracy bonus: ACCURACY * hits / shots
};

// The Overlord's lines (no real-person violence, ever: animals, cardboard, paperwork).
export const LINES = {
  tags: "ONE MALE A STAGE FILLS THE TAG.",
  female: ["THAT WAS A DOE. STRIKE ONE.", "A FEMALE AGAIN. STRIKE TWO.", "A FEMALE. STRIKE THREE."],
  revoked: "THREE STRIKES. THE TRIP IS OVER.",
  quota: "NO MALE THIS STAGE. THE TRIP IS OVER.",
  filled: "TAG FILLED.",
  reload: "OUT OF SHELLS: SHOOT OFF THE SCREEN TO RELOAD.",
  bonus: "BONUS ROUND: SHOOT THE DUCKS.",
  forms: "BONUS ROUND: SHOOT THE FORMS.",
  decoy: "CARDBOARD BUCK.",
};
