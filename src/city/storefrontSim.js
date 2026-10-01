// THE MALL as city data (ROADMAP b1c; Scott 2026-09-30: "if people get dissatisfied with their
// jobs, they should try to open their own businesses"). Pure data, no imports: sim.js spreads
// these into its own lists like funnelSim.js and venueSim.js, so the units and the landmarks are
// laid out, staffed and visited like any other place. docs/CITY_SPEC.md "THE MALL".
//
//   STOREFRONT UNITS   24 small ground-floor shops along the streets: the Heights base (the foot of
//                      the mountain), the Coast's east boardwalk, the Strip, Campus, the Commons and
//                      the Sprawl. Each unit is its own one-room building on a hand-set lot (a
//                      FRONTAGE lot: sim.js lays it out apart from the district's grid, so nothing
//                      already standing moves). Who trades in a unit, and what, is enterprise.js:
//                      a unit with no business that day is TO LET, staffs nobody and draws nobody.
//   SAM'S PIZZA        a fixed landmark at the head of the east boardwalk (an affectionate homage to
//                      the Wildwood boardwalk institution; never closes, never owned by a subject).
//   GOODNIGHT IRENE'S  a fixed landmark brewpub on the corner at the east end of the row (homage to
//                      the Wildwood brewpub); open evenings, late; live music on some nights.

// The units: [id, district, lot {x, y, w, h}, address name]. Lots are map cells, clear of every
// building and open lot already standing (scripts/check-enterprise.mjs holds that).
// Heights base: the village row's open ground between ALPINE FLATS and the Alpine Line.
// Coast: a new row of shops east of the pier, each lot running down over the boards in front of it
// (the boards are the lot's ground, so customers stand on them).
// Strip, Campus: the two free rows at the district's north edge, above the grid.
// Commons, Sprawl: the two free rows at the district's north edge, on the Loop's street.
const row = (prefix, district, n, x0, step, y, w, h, name) => Array.from({ length: n }, (_, i) => [`${prefix}-${i + 1}`, district, { x: x0 + i * step, y, w, h }, `${name} ${i + 1}`]);
export const UNIT_LIST = [
  ...row("sf-heights", "heights", 4, 37.4, 3.45, -17.8, 3.25, 3.5, "BASE PARADE, UNIT"),
  ...row("sf-coast", "coast", 4, 78.2, 4.4, 92.0, 4.4, 5.3, "BOARDWALK EAST, UNIT"),
  ...row("sf-strip", "strip", 4, 85.3, 5.75, 0.15, 5.2, 1.7, "STRIP FRONTAGE, UNIT"),
  ...row("sf-campus", "campus", 4, 29.3, 5.75, 0.15, 5.2, 1.7, "COLLEGE ROW, UNIT"),
  ...row("sf-commons", "commons", 3, 1.6, 7.7, 45.15, 6.6, 1.7, "COMMONS PARADE, UNIT"),
  ...row("sf-sprawl", "sprawl", 5, 57.6, 10.3, 45.15, 6.2, 1.7, "ESTATE PARADE, UNIT"),
];
export const UNIT_IDS = UNIT_LIST.map(u => u[0]);
export const UNIT_SET = new Set(UNIT_IDS);
// Where the shopfront faces (the street side): the Heights and the Coast face south (the
// foothills, the boards); the north-edge rows face north, onto the street. Every unit is
// double-fronted (glass both sides), so the default view always sees a shopfront.
export const UNIT_FACE = Object.fromEntries(UNIT_LIST.map(([id, d]) => [id, d === "heights" || d === "coast" ? "s" : "n"]));

// The landmarks' lots: Sam's at the head of the east boardwalk, by the pier and the wheel;
// Irene's on the corner where the row ends, its patio out front.
export const SAMS_LOT = { x: 72.6, y: 92.0, w: 5.6, h: 5.3 };
export const IRENES_LOT = { x: 95.8, y: 92.0, w: 10.4, h: 5.3 };
// THE TRAM CAR (a Wildwood nod): runs the old boardwalk end to end and back, on the seaward
// side of the stalls. Drawn only (storefrontDraw.js); nobody rides it.
export const TRAM = { x0: 3, x1: 64, y: 89.45, period: 240 };   // period: real seconds there and back

// [id, district, kind, cap, name, engine tendencies]
export const STORE_PLACES = [
  ...UNIT_LIST.map(([id, d, , name]) => [id, d, "mixed", d === "heights" || d === "coast" ? 10 : 8, name, []]),
  ["sams-pizza", "coast", "mixed", 14, "SAM'S PIZZA (BY THE SLICE)", ["pizzeria", "pizza parlor"]],
  ["goodnight-irenes", "coast", "mixed", 22, "GOODNIGHT IRENE'S (BREWPUB)", ["brewpub", "brewery", "pub"]],
];

// [id, name, district, floors top-down, lot, frontage]
export const STORE_BUILDINGS = [
  ...UNIT_LIST.map(([id, d, lot, name]) => [id, name, d, [["G", "THE SHOP FLOOR", [id]]], lot, true]),
  ["sams-pizza", "SAM'S PIZZA", "coast", [["G", "THE COUNTER (OPEN TO THE BOARDS)", ["sams-pizza"]]], SAMS_LOT, true],
  ["goodnight-irenes", "GOODNIGHT IRENE'S", "coast", [["1F", "THE BREWHOUSE (TANKS)", ["goodnight-irenes"]], ["G", "THE BAR AND THE STAGE", ["goodnight-irenes"]]], IRENES_LOT, true],
];
export const STORE_ARCH = { ...Object.fromEntries(UNIT_IDS.map(id => [id, "storefront"])), "sams-pizza": "pizzeria", "goodnight-irenes": "brewpub" };

// The landmarks' regulars. Draft caps keep them a few each.
// [id, title, place, ladder, fields, dims, extra]
export const STORE_JOBS = [
  ["pizza-counter", "Pizza Counter Hand", "sams-pizza", ["Box Folder", "Counter Hand", "Slice Man", "Oven Captain"], ["hospitality", "*"], ["care", "physical"], { shift: "evening", draft: 5 }],
  ["brewpub-bartender", "Brewpub Bartender", "goodnight-irenes", ["Glass Polisher", "Bartender", "Head Bartender", "Keeper of the Taps"], ["hospitality", "*"], ["care", "network"], { shift: "evening", draft: 4 }],
  ["brewer", "Brewer", "goodnight-irenes", ["Grain Hauler", "Assistant Brewer", "Brewer", "Head Brewer"], ["hospitality", "chemistry", "farming"], ["utility", "care"], { draft: 2 }],
];

// Who goes, by band (0 top tiers .. 2 the lowest) and by field; the overflow families
// (sim.js FAMILY: 0 bars, 1 cafes and diners).
export const STORE_LEISURE_BAND = [
  { "sams-pizza": 0.5, "goodnight-irenes": 0.9 },
  { "sams-pizza": 1.2, "goodnight-irenes": 1.2 },
  { "sams-pizza": 1.4, "goodnight-irenes": 0.8 },
];
export const STORE_LEISURE_FIELD = {
  sport: { "sams-pizza": 0.6 }, music: { "goodnight-irenes": 1.5 }, hospitality: { "goodnight-irenes": 1, "sams-pizza": 1 },
  screen: { "sams-pizza": 0.5 }, writing: { "goodnight-irenes": 0.8 },
};
export const STORE_FAMILY = [[1, "sams-pizza"], [0, "goodnight-irenes"]];
// Live music at Irene's (weekday 1-7 as the sim counts them): pulls a crowd like a fixture.
export const STORE_FIXTURES = {
  "goodnight-irenes": [{ days: [4, 5, 6], from: 20.5, to: 23.5, name: "LIVE MUSIC AT GOODNIGHT IRENE'S" }],
};
