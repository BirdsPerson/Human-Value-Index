// PHASE 2 step 4 (docs/planning/MASTER_PLAN.md): THE SUBURBS and THE AIRPORT, east of the core, as
// city data. Pure data, no imports: sim.js spreads these into its own lists (like venueSim.js), so
// the places and buildings are laid out, staffed and visited like any other.
//
//   THE SUBURBS   family housing on curving streets, east beyond the nightlife quarters (x 140-198,
//                 y 30-100): estates round three stations on THE EAST LINE (SUBURBS NORTH, SUBURBS
//                 MALL, SUBURBS SOUTH), a park or the green beside each; detached houses for tiers 1-2, starter
//                 townhouses for tier 3 (and only tier 3: sim.HOME_ONLY_TIERS); EASTGATE MALL and its
//                 food court, RIDGEMONT HIGH, the clinic. No home more than a short walk from a
//                 platform (check-planner); every home within twenty cells of a park.
//   THE AIRPORT   far east, jobs and visitors, no homes: THE DEPARTURES HALL (security, the gates,
//                 the city's door: it links to #arrivals), one runway east-west (planes come in from
//                 the east and leave to the east, never over the core: airport.js), the control
//                 tower, the hangars, the airport hotel. AIRPORT TERMINAL is the East Line's end.
//
// Lots are map cells (sim.js B()); both districts are laid out by hand.

// [id, name, addr, rect, blurb]
export const EAST_DISTRICTS = [
  ["suburbs", "THE SUBURBS", "0xE300", { x: 140, y: 30, w: 58, h: 70 }, "Lawns, cul-de-sacs and a mall. Every hedge is measured. Every family is a unit."],
  ["airport", "THE AIRPORT", "0xE400", { x: 202, y: 54, w: 84, h: 40 }, "The city's door. Arrivals are processed. Departures are reviewed. Nobody leaves without a reason on file."],
];

// The estates' homes, by who may live there: houses for tiers 1-2 (sim.HOMES_BY_BAND band 1), starter
// townhouses for tier 3 alone (band 2, sim.HOME_ONLY_TIERS: the band's lower tiers are not offered them).
export const SUBURB_HOUSES = ["maple-close", "larchmont", "birch-crescent", "orchard-way", "foxglove-drive", "cedar-loop"];
export const SUBURB_STARTERS = ["willow-bend", "aspen-row", "hawthorn-rise", "primrose-court"];

// [id, district, kind, cap, name, engine tendencies]
export const EAST_PLACES = [
  // THE SUBURBS: the north estate (SUBURBS NORTH), the mall estate, the south estate
  ["maple-close", "suburbs", "home", 100, "MAPLE CLOSE"],
  ["larchmont", "suburbs", "home", 100, "LARCHMONT"],
  ["willow-bend", "suburbs", "home", 80, "WILLOW BEND (STARTER HOMES)"],
  ["birch-crescent", "suburbs", "home", 100, "BIRCH CRESCENT"],
  ["orchard-way", "suburbs", "home", 90, "ORCHARD WAY"],
  ["aspen-row", "suburbs", "home", 80, "ASPEN ROW (STARTER HOMES)"],
  ["foxglove-drive", "suburbs", "home", 90, "FOXGLOVE DRIVE"],
  ["hawthorn-rise", "suburbs", "home", 80, "HAWTHORN RISE (STARTER HOMES)"],
  ["cedar-loop", "suburbs", "home", 90, "CEDAR LOOP"],
  ["primrose-court", "suburbs", "home", 80, "PRIMROSE COURT (STARTER HOMES)"],
  ["north-park", "suburbs", "leisure", 24, "NORTH PARK (DOGS ON LEADS, LEADS ON FILE)", ["park", "dog park"]],
  ["central-green", "suburbs", "leisure", 20, "THE VILLAGE GREEN (MOWN WEEKLY)", ["village green"]],
  ["south-park", "suburbs", "leisure", 20, "SOUTH PARK (THE POND IS DECORATIVE)", ["pond", "duck pond"]],
  ["eastgate", "suburbs", "mixed", 40, "EASTGATE MALL (FOOT TRAFFIC MEASURED)", ["shopping mall", "mall", "department store"]],
  ["food-court", "suburbs", "mixed", 36, "THE FOOD COURT (TRAYS RETURNED)", ["food court", "fast food"]],
  ["high-school", "suburbs", "work", 30, "RIDGEMONT HIGH (ATTENDANCE TAKEN)", ["high school"]],
  ["school-field", "suburbs", "leisure", 20, "RIDGEMONT FIELD (FRIDAY NIGHTS)", ["football field", "running track"]],
  ["clinic", "suburbs", "work", 14, "EASTSIDE CLINIC (APPOINTMENTS ONLY)", ["clinic", "doctor's office"]],
  // THE AIRPORT
  ["departures", "airport", "mixed", 44, "THE DEPARTURES HALL (DELAYS ANNOUNCED, NEVER EXPLAINED)", ["airport", "airport terminal", "duty free"]],
  ["security-hall", "airport", "work", 20, "SECURITY (SHOES OFF. BELTS OFF. HOPE OFF.)"],
  ["airfield", "airport", "work", 32, "THE AIRFIELD (RUNWAY 09/27, ONE WAY IN)", ["runway", "airfield"]],
  ["control-tower", "airport", "work", 10, "THE CONTROL TOWER (EVERYTHING IS CLEARED)", ["control tower"]],
  ["hangars", "airport", "work", 30, "THE HANGARS (MAINTENANCE, LOGGED)", ["hangar", "aircraft maintenance"]],
  ["airport-hotel", "airport", "mixed", 30, "THE AIRPORT HOTEL (CHECK-OUT AT 06:00)", ["hotel", "airport hotel"]],
];

// [id, name, district, floors top-down: [code, floor name, [places]], lot]
const estate = (id, name, x, y, w, h) => [id, name, "suburbs", [["1F", "UPSTAIRS (BEDTIME ENFORCED)", [id]], ["G", "LIVING ROOMS AND GARAGES", [id]], ["B1", "FINISHED BASEMENTS (REC ROOMS, MONITORED)", [id]]], { x, y, w, h }];
const starter = (id, name, x, y, w, h) => [id, name, "suburbs", [["1F", "BEDROOMS (TWO, SMALL)", [id]], ["G", "KITCHEN-DINERS", [id]]], { x, y, w, h }];
export const EAST_BUILDINGS = [
  // THE EAST LINE comes in from the Archive along y 48.5 (south of Downtown), turns south down x 168.5
  // and east along y 86 to the Airport. SUBURBS NORTH (153.5, 48.5): an estate either side of the
  // line, the park beyond the corner
  estate("maple-close", "MAPLE CLOSE", 141, 33, 12, 12.5),
  estate("larchmont", "LARCHMONT", 154, 33, 11.5, 12.5),
  ["north-park", "NORTH PARK", "suburbs", [["G", "THE LAWNS (DOGS ON LEADS)", ["north-park"]]], { x: 170.5, y: 31, w: 26.5, h: 15 }],
  starter("willow-bend", "WILLOW BEND", 141, 51.5, 12, 8.6),
  estate("birch-crescent", "BIRCH CRESCENT", 154, 51.5, 9.5, 8.6),
  // SUBURBS MALL (168.5, 62): the mall east of the line, the high school and the estates west
  ["eastgate-mall", "EASTGATE MALL", "suburbs", [["1F", "THE FOOD COURT", ["food-court"]], ["G", "THE CONCOURSE", ["eastgate"]]], { x: 170.5, y: 50.5, w: 26.5, h: 21 }],
  ["ridgemont-high", "RIDGEMONT HIGH", "suburbs", [["1F", "CLASSROOMS (PHONES SURRENDERED)", ["high-school"]], ["G", "THE GYM AND THE FIELD", ["high-school", "school-field"]]], { x: 141, y: 62, w: 12, h: 18 }],
  estate("orchard-way", "ORCHARD WAY", 154, 62, 11.5, 8),
  starter("aspen-row", "ASPEN ROW", 154, 71, 11.5, 8.5),
  // SUBURBS SOUTH (182, 86), on the way to the Airport: estates either side of the line; the green,
  // the clinic and the pond west of the corner
  estate("cedar-loop", "CEDAR LOOP", 170.5, 72.5, 12, 8),
  estate("foxglove-drive", "FOXGLOVE DRIVE", 183, 72.5, 13, 8),
  starter("primrose-court", "PRIMROSE COURT", 170.5, 89.5, 12, 8.5),
  starter("hawthorn-rise", "HAWTHORN RISE", 183, 89.5, 12, 8.5),
  ["village-green", "THE VILLAGE GREEN", "suburbs", [["G", "THE GREEN (MOWN WEEKLY)", ["central-green"]]], { x: 141, y: 81, w: 12, h: 18 }],
  ["eastside-clinic", "EASTSIDE CLINIC", "suburbs", [["G", "CONSULTING ROOMS", ["clinic"]]], { x: 154, y: 81, w: 11, h: 6 }],
  ["south-park", "SOUTH PARK", "suburbs", [["G", "THE POND AND THE PATHS", ["south-park"]]], { x: 154, y: 88, w: 11, h: 10 }],
  // THE AIRPORT: the airfield across the north (the runway, the taxiway, the apron by the gates),
  // the departures hall, the tower and the hangars along its south side, the hotel at the west end
  ["the-airfield", "THE AIRFIELD", "airport", [["G", "RUNWAY 09/27 AND THE APRON", ["airfield"]]], { x: 213, y: 56, w: 72, h: 17 }],
  ["departures-hall", "THE DEPARTURES HALL", "airport", [["1F", "THE GATES (BOARDING BY TIER)", ["departures"]], ["G", "SECURITY (SHOES OFF)", ["security-hall"]]], { x: 214, y: 73.5, w: 27, h: 9 }],
  ["control-tower", "THE CONTROL TOWER", "airport", [["3F", "THE CAB (EVERYTHING IS CLEARED)", ["control-tower"]], ["2F", "RADAR ROOM", ["control-tower"]], ["1F", "THE SHAFT", ["control-tower"]], ["G", "BASE", ["control-tower"]]], { x: 243, y: 74, w: 6, h: 8 }],
  ["the-hangars", "THE HANGARS", "airport", [["G", "THE HANGAR FLOOR (FOD WALKED)", ["hangars"]]], { x: 251, y: 74, w: 34, h: 11 }],
  ["airport-hotel", "THE AIRPORT HOTEL", "airport", [["3F", "ROOMS LEVEL 3 (RUNWAY VIEW)", ["airport-hotel"]], ["2F", "ROOMS LEVEL 2", ["airport-hotel"]], ["1F", "ROOMS LEVEL 1", ["airport-hotel"]], ["G", "THE LOBBY BAR (LAYOVERS ONLY)", ["airport-hotel"]]], { x: 203, y: 66, w: 9.5, h: 17 }],
];
// The parks and the airfield are open ground, walked onto (CityIso's lots, drawn by eastDraw.js).
export const EAST_OPEN_LOTS = ["north-park", "village-green", "south-park", "the-airfield"];
export const EAST_ARCH = {
  "maple-close": "house", larchmont: "house", "birch-crescent": "house", "orchard-way": "house", "foxglove-drive": "house", "cedar-loop": "house",
  "willow-bend": "townhouse", "aspen-row": "townhouse", "hawthorn-rise": "townhouse", "primrose-court": "townhouse",
  "north-park": "lot", "village-green": "lot", "south-park": "lot", "the-airfield": "lot",
  "ridgemont-high": "highschool", "eastgate-mall": "mall", "eastside-clinic": "clinic",
  "departures-hall": "terminal", "control-tower": "tower", "the-hangars": "hangar", "airport-hotel": "hotel",
};
// Housing styles: who lives in them (sim.HOUSING_TIERS)
export const EAST_HOUSING = { house: [1, 2], townhouse: [3] };

// [id, title, place, ladder, fields, dims, extra]
export const EAST_JOBS = [
  ["hs-teacher", "High School Teacher", "high-school", ["Substitute", "Teacher", "Head of Year", "Principal", "Superintendent of Attendance"], ["education", "history", "writing", "coaching"], ["care", "legacy"]],
  ["hs-coach", "Varsity Coach", "school-field", ["Water Carrier", "Assistant Coach", "Head Coach", "Athletic Director"], ["coaching", "sport", "gridiron"], ["physical", "care"], { draft: 2 }],
  ["guidance-counsellor", "Guidance Counsellor", "high-school", ["Hall Pass Issuer", "Counsellor", "Senior Counsellor", "Dean of Futures (Predetermined)"], ["care", "*", "education"], ["care", "alignment"], { draft: 2 }],
  ["mall-associate", "Retail Associate (Eastgate)", "eastgate", ["Stock Hand", "Associate", "Shift Lead", "Store Manager", "Regional Manager of Footfall"], ["*", "business"], ["network", "utility"], { draft: 6 }],
  ["mall-security", "Mall Security Officer", "eastgate", ["Bike Patrol (Indoor)", "Officer", "Senior Officer", "Chief of Concourse"], ["law", "military", "*"], ["alignment", "physical"], { draft: 3 }],
  ["food-court-cook", "Food Court Cook", "food-court", ["Tray Collector", "Fryer", "Line Cook", "Franchise Manager"], ["*", "hospitality"], ["care", "utility"], { shift: "evening", draft: 4 }],
  ["clinic-gp", "General Practitioner (Eastside)", "clinic", ["Locum", "GP", "Senior Partner", "Medical Director (Suburban)"], ["care", "*"], ["care", "utility"], { draft: 3 }],
  ["clinic-receptionist", "Clinic Receptionist", "clinic", ["Hold Music Operator", "Receptionist", "Senior Receptionist", "Practice Manager"], ["*", "care"], ["care", "alignment"], { draft: 2 }],
  ["park-keeper", "Park Keeper (Suburbs)", "north-park", ["Leaf Blower", "Park Keeper", "Head Keeper", "Warden of the Lawns"], ["farming", "labor", "*"], ["physical", "care"], { draft: 2 }],
  ["ground-crew", "Ground Crew", "airfield", ["Chock Carrier", "Ramp Agent", "Crew Chief", "Ramp Controller", "Master of the Apron"], ["labor", "*", "engineering"], ["physical", "utility"], { shift: "rotating", draft: 7 }],
  ["air-traffic-controller", "Air Traffic Controller", "control-tower", ["Flight Strip Clerk", "Controller", "Senior Controller", "Watch Supervisor", "Voice of the Tower"], ["military", "engineering", "exploration", "*"], ["utility", "alignment"], { shift: "rotating", draft: 3 }],
  ["security-screener", "Security Screener", "security-hall", ["Tray Stacker", "Screener", "Lead Screener", "Checkpoint Supervisor", "Director of Removing Shoes"], ["law", "military", "*"], ["alignment", "physical"], { shift: "rotating", draft: 6 }],
  ["gate-agent", "Gate Agent", "departures", ["Boarding Pass Scanner", "Gate Agent", "Senior Agent", "Duty Manager of Delays"], ["*", "hospitality", "languages"], ["network", "care"], { draft: 5 }],
  ["aircraft-mechanic", "Aircraft Mechanic", "hangars", ["Rivet Counter", "Mechanic", "Licensed Engineer", "Chief Engineer", "Airworthiness Officer"], ["engineering", "electrical", "*"], ["utility", "physical"], { shift: "rotating", draft: 6 }],
  ["hotel-concierge", "Hotel Concierge (Airport)", "airport-hotel", ["Luggage Porter", "Night Porter", "Concierge", "Duty Manager", "Keeper of the Layover"], ["*", "hospitality", "languages"], ["care", "network"], { shift: "evening", draft: 4 }],
];

// Who goes, by band (0 top tiers .. 2 the lowest) and by field.
export const EAST_LEISURE_BAND = [
  { eastgate: 0.5, "food-court": 0.2, "north-park": 0.4, "central-green": 0.3, "south-park": 0.3, departures: 0.6, "airport-hotel": 0.8 },
  { eastgate: 1.4, "food-court": 1, "north-park": 0.8, "central-green": 0.6, "south-park": 0.7, "school-field": 0.6, departures: 0.4, "airport-hotel": 0.3 },
  { eastgate: 0.8, "food-court": 1.2, "north-park": 0.4, "central-green": 0.3, "south-park": 0.4, "school-field": 0.5, departures: 0.2 },
];
export const EAST_LEISURE_FIELD = {
  exploration: { departures: 2.5, "airport-hotel": 0.8 }, business: { eastgate: 1.5, "airport-hotel": 1 }, languages: { departures: 1.5 },
  sport: { "school-field": 1.5 }, gridiron: { "school-field": 3 }, coaching: { "school-field": 1.5 }, care: { "north-park": 1, "south-park": 1 },
  education: { "school-field": 0.6 }, hospitality: { "food-court": 1.2 }, farming: { "south-park": 1 }, visual: { "south-park": 0.8 },
};
// [family index in sim.js FAMILY (0 bars, 1 cafes, 3 the green, 4 markets, 6 sport), place]
export const EAST_FAMILY = [[3, "north-park"], [3, "central-green"], [3, "south-park"], [4, "eastgate"], [1, "food-court"], [6, "school-field"], [0, "airport-hotel"], [1, "departures"]];
// RIDGEMONT FIELD's Friday night game pulls the estates out (a crowd, not a league fixture)
export const EAST_FIXTURES = { "school-field": [{ days: [5], from: 18.5, to: 21, name: "FRIDAY NIGHT AT RIDGEMONT" }] };
