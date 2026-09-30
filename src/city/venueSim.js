// THE MASTER PLAN's venues, as city data (docs/planning/MASTER_PLAN.md, 2026-09-30). Pure data,
// no imports: sim.js spreads these into its own lists, like funnelSim.js, so the places and
// buildings are laid out, staffed and visited like any other.
//
//   THE PIT            the Works' new southern rows: a boxing ring and an MMA octagon under the
//                      sky, arena seating, locker rooms. Fight cards (pit.js) and settled grievances.
//   THE TENNIS CLUB    the Sprawl's south-east corner, beside the estate pitch and across the street
//                      from the Coast's resort parcel: four courts, a clubhouse, a club fixture.
//   DEPT OF PLANNING   the Commons, beside THE ASSEMBLY: the drawing office and THE PANORAMA (a
//                      model of the city); ROBERT MOSES and JANE JACOBS argue developments (planning.js).
//   THE ESTATE GARDENS the Sprawl's green: the densest housing had none (the plan's green-space audit).
//   THE FOOTHILLS      the Heights' southern band: forest and trails between the CBD and the mountain.
//
// Lots are map cells (sim.js B()); the districts they sit in are hand laid out.

// [id, district, kind, cap, name, engine tendencies]
export const VENUE_PLACES = [
  ["pit", "works", "mixed", 40, "THE PIT (GRIEVANCES SETTLED, NON-BINDING)", ["boxing ring", "boxing gym", "fight venue", "wrestling ring"]],
  ["tennis", "sprawl", "mixed", 20, "THE TENNIS CLUB (LOVE IS A SCORE)", ["tennis court", "tennis club"]],
  ["planning-office", "commons", "mixed", 14, "DEPT OF PLANNING (OBJECTIONS NOTED)", ["planning office", "city planning"]],
  ["estate-gardens", "sprawl", "leisure", 20, "THE ESTATE GARDENS (GREEN, ALLOCATED)", ["garden", "community garden"]],
  ["foothills", "heights", "leisure", 22, "THE FOOTHILLS (TRAILS, MONITORED)", ["forest", "hiking trail", "woods"]],
];

// [id, name, district, floors top-down: [code, floor name, [places]], lot]
export const VENUE_BUILDINGS = [
  ["the-pit", "THE PIT", "works", [["G", "THE FLOOR (RING AND OCTAGON)", ["pit"]], ["B1", "LOCKER ROOMS (SILENCE BEFORE THE BELL)", ["pit"]]], { x: 29, y: 57.5, w: 23, h: 16 }],
  ["tennis-club", "THE TENNIS CLUB", "sprawl", [["G", "THE COURTS (GRASS, CLAY, HARD, LOGGED)", ["tennis"]]], { x: 83, y: 65.5, w: 25, h: 8 }],
  ["planning-office", "DEPT OF PLANNING", "commons", [["1F", "THE DRAWING OFFICE", ["planning-office"]], ["G", "THE PANORAMA (A MODEL OF THE CITY)", ["planning-office"]]], { x: 1, y: 65.5, w: 23, h: 8 }],
  ["estate-gardens", "THE ESTATE GARDENS", "sprawl", [["G", "LAWNS AND BEDS (ALLOCATED)", ["estate-gardens"]]], { x: 57, y: 65.5, w: 25.5, h: 8 }],
  ["the-foothills", "THE FOOTHILLS", "heights", [["G", "THE TRAILS (MONITORED)", ["foothills"]]], { x: 9, y: -13, w: 91, h: 9.5 }],
];
// The Pit and the tennis club are open to the sky, walked onto (drawn by venueDraw.js); the
// gardens are open ground (CityIso's lots); the foothills are the Heights' own ground (coastGeo.js).
export const VENUE_OPEN_LOTS = ["the-pit", "tennis-club", "estate-gardens", "the-foothills"];
export const VENUE_ARCH = { "the-pit": "lot", "tennis-club": "lot", "planning-office": "planning", "estate-gardens": "lot", "the-foothills": "lot" };

// [id, title, place, ladder, fields, dims, extra]: a few staff each (draft caps), the club's pros
// for the tennis players on file. The fighters keep their jobs (the gym's Combat Exhibitors):
// a card is a night out, drawn by projection (pit.js).
export const VENUE_JOBS = [
  ["bout-referee", "Bout Referee", "pit", ["Bucket Carrier", "Timekeeper", "Referee", "Third Man in the Ring", "Arbiter of the Bell"], ["law", "coaching", "*"], ["alignment", "physical"], { shift: "evening", draft: 6 }],
  ["ring-announcer", "Ring Announcer", "pit", ["Card Holder", "Announcer", "Voice of the Pit", "The Voice (Retained)"], ["*"], ["network", "adaptability"], { shift: "evening", draft: 3 }],
  ["club-pro", "Club Professional", "tennis", ["Ball Collector", "Hitting Partner", "Club Pro", "Head Pro", "Champion (Emeritus)"], ["tennis", "coaching"], ["physical", "care"]],
  ["line-judge", "Line Judge", "tennis", ["Ball Person", "Line Judge", "Chair Umpire", "Hawk-Eye (Human)"], ["law", "*"], ["alignment", "utility"], { draft: 4 }],
  ["planning-officer", "Planning Officer", "planning-office", ["Plan Clerk", "Planning Officer", "Senior Planner", "Chief Planner", "Commissioner of the Grid"], ["*", "visual", "law"], ["utility", "alignment"], { draft: 5 }],
  ["forest-ranger", "Forest Ranger", "foothills", ["Trail Sweeper", "Ranger", "Senior Ranger", "Warden of the Treeline"], ["farming", "exploration", "*"], ["physical", "care"], { draft: 5 }],
];

// Who goes, by band (0 top tiers .. 2 the lowest) and by field.
export const VENUE_LEISURE_BAND = [
  { tennis: 2.2, "planning-office": 0.3, foothills: 1.2, pit: 0.6 },
  { tennis: 1, "planning-office": 0.3, "estate-gardens": 1, foothills: 1, pit: 1.2 },
  { tennis: 0.3, "planning-office": 0.2, "estate-gardens": 1.8, foothills: 0.5, pit: 1.6 },
];
export const VENUE_LEISURE_FIELD = {
  tennis: { tennis: 6 }, combat: { pit: 3 }, sport: { tennis: 1, pit: 1 }, coaching: { tennis: 1, pit: 0.8 },
  politics: { "planning-office": 1.5 }, activism: { "planning-office": 1.2, "estate-gardens": 1 }, law: { "planning-office": 1 },
  visual: { "planning-office": 1 }, exploration: { foothills: 3 }, philosophy: { foothills: 1.5 }, writing: { foothills: 1 },
  care: { "estate-gardens": 1.5 }, farming: { "estate-gardens": 2, foothills: 1 }, screen: { pit: 0.8 }, crime: { pit: 1 },
};
// [family index in sim.js FAMILY (3 the green, 5 study, 6 sport), place]
export const VENUE_FAMILY = [[6, "pit"], [6, "tennis"], [5, "planning-office"], [3, "estate-gardens"], [3, "foothills"]];

// Fields the record on the census does not carry (a referral's file holds no occupation):
// the fighters and the tennis players the plan's venues are for, found on the census by name.
export const VENUE_FIELD_HINTS = {
  "mike-tyson": ["combat", "sport"], "chuck-norris": ["combat", "screen"], "john-cena": ["combat", "screen"], "jackie-chan": ["screen", "combat"],
  "serena-williams": ["tennis", "sport"], "venus-williams": ["tennis", "sport"], "arthur-ashe": ["tennis", "activism"], "john-mcenroe": ["tennis", "sport"],
};
export const VENUE_FIELD_RULES = [["tennis", /tennis/]];

// The venues' fixtures on the machine calendar (weekday 1-7 as the sim counts them). Kept out
// of sim.GAMES (the league's timetable, which these must never change): the sim reads them only
// to pull a crowd, as GAMES pulls one (a fixture on when a visit starts: x3 its own liking).
export const VENUE_FIXTURES = {
  pit: [{ days: [5], from: 20, to: 22, name: "FRIDAY NIGHT AT THE PIT" }],
  tennis: [{ days: [6], from: 14, to: 17.5, name: "THE CLUB CHAMPIONSHIP" }, { days: [3], from: 18, to: 20.5, name: "LADDER NIGHT" }],
};
