// THE MOUNTAIN (Scott 2026-09-30: "mountains can be very tall; Killington is over 4,000 feet;
// many trails that wind and intersect, some much more difficult; some have slalom gates for
// competition; a lodge at the bottom; render the whole mountain up to the top; at least one lodge
// up there too"). The Heights' mountain as city data. Pure data, no imports: sim.js spreads these
// into its own lists, like venueSim.js, so the places and buildings are laid out, staffed and
// visited like any other.
//
//   THE UPPER MOUNTAIN       the band above THE SLOPES: the upper trails (blacks, the bowl, the
//                            glades) and THE RACE COURSE (THE GAUNTLET, its gates, its clock).
//   THE MID-MOUNTAIN LODGE   halfway up, on the west shoulder: the cafeteria and the sun deck.
//   THE SUMMIT LODGE         at the top: the highest bar in the city, the observation deck, and
//                            THE SUMMIT PATROL HUT.
//
// Each lot is a band of the one terrain (mountainGeo.js), drawn by the mountain cell by cell
// (mountainDraw.js), so the lodges stand on their own ground. The lots run the width of the
// district (x -4 to 111: wider than the village, so the massif's flanks fall away) north of THE
// SLOPES and the resort parcel (PARCEL 0xBE06, which stays reserved for THE ASSEMBLY's session 002).
//
// Day boundary: the published days name their places; the first day built after a deploy is the
// first with anyone on the upper mountain (old days' windows have no such rows: nobody is drawn there).

// [id, district, kind, cap, name, engine tendencies]
export const MOUNTAIN_PLACES = [
  ["upper-mountain", "heights", "mixed", 36, "THE UPPER MOUNTAIN (EXPERTS, LOGGED)", ["alpine skiing", "ski area", "snowboarding"]],
  ["race-course", "heights", "mixed", 30, "THE RACE COURSE (TIMED. RANKED.)", ["ski race", "slalom"]],
  ["mid-lodge", "heights", "mixed", 40, "THE MID-MOUNTAIN LODGE (CHILI, RATIONED)", ["mountain lodge", "mountain hut"]],
  ["summit-lodge", "heights", "mixed", 36, "THE SUMMIT LODGE (THE HIGHEST BAR IN THE CITY)", ["summit", "mountain top", "observation deck"]],
  ["summit-patrol", "heights", "work", 8, "THE SUMMIT PATROL HUT (FIRST AID, LOGGED)"],
];

// The mountain's bands, south to north (map cells; y is negative to the north).
export const MTN_Y = { slopesTop: -40.5, upper: -58, mid: -82, top: -125, west: -4, east: 111 };
// [id, name, district, floors top-down: [code, floor name, [places]], lot]
export const MOUNTAIN_BUILDINGS = [
  ["the-upper-mountain", "THE UPPER MOUNTAIN", "heights", [["1F", "THE RACE COURSE (TIMED. RANKED.)", ["race-course"]], ["G", "THE UPPER TRAILS (EXPERTS, LOGGED)", ["upper-mountain"]]], { x: MTN_Y.west, y: MTN_Y.upper, w: MTN_Y.east - MTN_Y.west, h: MTN_Y.slopesTop - MTN_Y.upper }],
  ["the-mid-lodge", "THE MID-MOUNTAIN LODGE", "heights", [["1F", "THE SUN DECK (APRES, MID-DESCENT)", ["mid-lodge"]], ["G", "THE CAFETERIA (CHILI, RATIONED)", ["mid-lodge"]]], { x: MTN_Y.west, y: MTN_Y.mid, w: MTN_Y.east - MTN_Y.west, h: MTN_Y.upper - MTN_Y.mid }],
  ["the-summit-lodge", "THE SUMMIT LODGE", "heights", [["2F", "THE OBSERVATION DECK (VIEW, RATIONED)", ["summit-lodge"]], ["1F", "THE SUMMIT BAR (HIGHEST IN THE CITY)", ["summit-lodge"]], ["G", "THE PATROL HUT (FIRST AID, LOGGED)", ["summit-patrol"]]], { x: MTN_Y.west, y: MTN_Y.top, w: MTN_Y.east - MTN_Y.west, h: MTN_Y.mid - MTN_Y.top }],
];
// The bands are the mountain's own ground (mountainGeo.js), painted with the terrain, and open
// ground to walk across (sim.OPEN_LOTS): the upper base is a short walk from the Alpine Line's
// SUMMIT station; the lodges are a climb.
export const MOUNTAIN_ARCH = { "the-upper-mountain": "lot", "the-mid-lodge": "lot", "the-summit-lodge": "lot" };
export const MOUNTAIN_OPEN_LOTS = ["the-upper-mountain", "the-mid-lodge", "the-summit-lodge", "the-slopes"];   // THE SLOPES too: a ski field, walked across from the Alpine Line's SUMMIT
// Where each place's people arrive (a walk ends here): the bands are the lots, the places are
// these spots on them. THE UPPER BASE (the upper lifts' foot, by the Alpine Line's SUMMIT station),
// the race's finish area, the lodges' doors, the patrol hut. Kept in step with mountainGeo.js.
export const MOUNTAIN_SPOTS = {
  "upper-mountain": { x: 45, y: -44.6, w: 3.6, h: 1.2 },
  "race-course": { x: 36.6, y: -45.4, w: 3.4, h: 1.4 },
  "mid-lodge": { x: 27.4, y: -62.6, w: 5.6, h: 1.4 },
  "summit-lodge": { x: 44.8, y: -84.6, w: 4.8, h: 1.2 },
  "summit-patrol": { x: 40.8, y: -85.6, w: 1.8, h: 1 },
};

// [id, title, place, ladder, fields, dims, extra]
export const MOUNTAIN_JOBS = [
  ["summit-patrol", "Summit Patrol", "summit-patrol", ["Hut Keeper", "Patroller", "Senior Patroller", "Chief of the Summit", "Warden of the Top"], ["medicine", "military", "*", "sport"], ["physical", "care"], { draft: 6 }],
  ["summit-bartender", "Summit Bartender", "summit-lodge", ["Glass Polisher", "Bartender", "Head Bartender", "Keeper of the Highest Bar"], ["*", "hospitality", "music"], ["network", "care"], { shift: "evening", draft: 4 }],
  ["summit-cook", "Summit Lodge Cook", "summit-lodge", ["Fondue Stirrer", "Cook", "Head Cook", "Chef at Altitude"], ["*", "hospitality"], ["care", "utility"], { draft: 4 }],
  ["mid-lodge-cook", "Mid-Mountain Cook", "mid-lodge", ["Chili Stirrer", "Cook", "Head Cook", "Chef of the Middle"], ["*", "hospitality", "farming"], ["care", "utility"], { draft: 5 }],
  ["groomer", "Night Groomer", "upper-mountain", ["Cat Passenger", "Groomer", "Senior Groomer", "Master of Corduroy"], ["*", "engineering", "labor"], ["utility", "physical"], { shift: "night", draft: 4 }],
  ["snowmaker", "Snowmaker", "upper-mountain", ["Hose Dragger", "Snowmaker", "Senior Snowmaker", "Director of Precipitation"], ["*", "engineering", "science"], ["utility", "adaptability"], { shift: "night", draft: 3 }],
  ["race-official", "Race Official", "race-course", ["Gate Keeper", "Timer", "Chief of Course", "Jury President"], ["law", "sport", "*"], ["alignment", "utility"], { draft: 4 }],
];

// Who goes, by band (0 top tiers .. 2 the lowest) and by field.
export const MOUNTAIN_LEISURE_BAND = [
  { "upper-mountain": 1.6, "race-course": 0.6, "mid-lodge": 1, "summit-lodge": 1.6 },
  { "upper-mountain": 1, "race-course": 0.5, "mid-lodge": 1, "summit-lodge": 0.6 },
  { "upper-mountain": 0.3, "race-course": 0.4, "mid-lodge": 0.6, "summit-lodge": 0.2 },
];
export const MOUNTAIN_LEISURE_FIELD = {
  sport: { "upper-mountain": 2, "race-course": 2.5 }, exploration: { "upper-mountain": 3, "summit-lodge": 1.5 }, coaching: { "race-course": 1.5 },
  royalty: { "summit-lodge": 2 }, finance: { "summit-lodge": 1.5 }, hospitality: { "mid-lodge": 1.2, "summit-lodge": 1 }, music: { "summit-lodge": 0.8 },
};
// [family index in sim.js FAMILY (1 the cafes, 8 the slopes), place]
export const MOUNTAIN_FAMILY = [[8, "upper-mountain"], [8, "race-course"], [1, "mid-lodge"], [8, "summit-lodge"]];

// The race on the machine calendar (race.js): Saturdays 13:00-15:00 on THE GAUNTLET. Kept out of
// sim.GAMES (the league's timetable): the sim reads it only to pull a crowd to the course.
export const MOUNTAIN_FIXTURES = { "race-course": [{ days: [6], from: 13, to: 15, name: "THE WEEKEND RACE" }] };
