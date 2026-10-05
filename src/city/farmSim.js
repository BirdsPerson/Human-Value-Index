// PHASE 2 step 5 (docs/planning/MASTER_PLAN.md): THE FARMLAND and THE ENGINE as city data. Pure
// data, no imports: sim.js spreads these into its own lists (like eastSim.js).
//
//   THE FARMLAND  north-west behind the Old Town (x -104 to -8, y -76 to -18), the lowest density:
//                 fields, the orchards, the dairy and its pasture, the grain elevator by the line, and
//                 a market town round FARMLAND MARKET (the West Line's version 2): the farmers'
//                 market, a pub, the green, farmhands' and dairy cottages (tiers 3-5), Grange Row and
//                 the manor (tiers 1-2). THE COMMUNITY FARM: THE ASSEMBLY's session 001 approved a
//                 farm (APPLICATION 002); Scott, 2026-10-05: the winner gets a full-size site in the
//                 growth districts. It is a civic parcel like LOT 0x6F07 (sim.farmParcelPhase): a site
//                 first, then the farm. LOT 0x6F07 in the Commons stays its smaller companion, the
//                 community garden.
//   THE ENGINE    north-east (x 116 to 180, y -60 to -8), the city's second business district: the
//                 research park, the university annex, the Engine offices, the data hall moved out of
//                 the Works (CACHE FARM: ids kept, sim.MOVED_FROM), towers for every tier band, the
//                 quad; on THE ENGINE SHUTTLE from the Strip (ENGINE CAMPUS, ENGINE TOWERS).
//
// Lots are map cells, laid out by hand.

// [id, name, addr, rect, blurb]
export const STEP5_DISTRICTS = [
  ["farmland", "THE FARMLAND", "0xE500", { x: -104, y: -76, w: 96, h: 58 }, "Fields, orchards and a dairy. The harvest is graded. So are the harvesters."],
  ["engine", "THE ENGINE", "0xE600", { x: 116, y: -60, w: 64, h: 52 }, "Research, data and towers. The city's second business district. It believes it runs itself."],
];

// The homes by who may live there (sim.HOMES_BY_BAND): the cottages for the lowest band's tiers 4-5
// (sim.HOME_ONLY_TIERS: tier 3 has the Suburbs' starter homes), Grange Row and the manor for the
// middle; the Engine's towers one per band.
export const FARM_HOMES = { 1: ["grange-row", "the-manor"], 2: ["farmhands-cottages", "dairy-cottages"] };
export const ENGINE_HOMES = { 0: ["engine-tower-a"], 1: ["engine-tower-b"], 2: ["engine-tower-c"] };

// [id, district, kind, cap, name, engine tendencies]
export const STEP5_PLACES = [
  // THE FARMLAND: the market town
  ["farmhands-cottages", "farmland", "home", 100, "FARMHANDS' COTTAGES"],
  ["dairy-cottages", "farmland", "home", 80, "DAIRY COTTAGES"],
  ["grange-row", "farmland", "home", 80, "GRANGE ROW"],
  ["the-manor", "farmland", "home", 40, "THE MANOR (VISITS BY APPOINTMENT)"],
  ["farmers-market", "farmland", "mixed", 30, "THE FARMERS' MARKET (PRODUCE GRADED)", ["farmers market", "farm shop"]],
  ["the-plough", "farmland", "leisure", 18, "THE PLOUGH (CIDER, LOGGED)", ["country pub"]],
  ["market-green", "farmland", "leisure", 14, "THE MARKET GREEN"],
  // the working land
  ["the-fields", "farmland", "work", 30, "THE FIELDS (WHEAT, BARLEY, COMPLIANCE)", ["farm", "fields"]],
  ["the-orchards", "farmland", "mixed", 24, "THE ORCHARDS (PICK YOUR OWN, COUNTED)", ["orchard"]],
  ["the-dairy", "farmland", "work", 22, "THE DAIRY (MILKED TO SCHEDULE)", ["dairy"]],
  ["grain-elevator", "farmland", "work", 12, "THE GRAIN ELEVATOR (EVERY KERNEL WEIGHED)"],
  ["the-vet", "farmland", "mixed", 8, "THE VETERINARY SURGERY (LARGE ANIMALS)"],
  ["community-farm", "farmland", "leisure", 35, "THE COMMUNITY FARM (SESSION 001: APPROVED)"],
  // THE ENGINE
  ["research-park", "engine", "work", 36, "THE RESEARCH PARK (OUTCOMES PRE-APPROVED)", ["research park", "laboratory"]],
  ["annex-hall", "engine", "mixed", 30, "THE UNIVERSITY ANNEX (OVERFLOW LEARNING)", ["university"]],
  ["engine-offices", "engine", "work", 40, "THE ENGINE OFFICES (OPEN PLAN, OBSERVED)", ["tech company", "startup"]],
  ["the-uptime", "engine", "leisure", 20, "THE UPTIME (BAR, 99.9% AVAILABLE)"],
  ["the-quad", "engine", "leisure", 24, "THE QUAD (SCREENS OFF, ENCOURAGED)"],
  ["engine-tower-a", "engine", "home", 120, "ENGINE TOWER A (THE CORNER OFFICES)"],
  ["engine-tower-b", "engine", "home", 220, "ENGINE TOWER B (HOT DESKS, COLD FLATS)"],
  ["engine-tower-c", "engine", "home", 200, "ENGINE TOWER C (THE SERVICE FLOORS)"],
];

const tower = (n, id) => Array.from({ length: n }, (_, i) => n - i).map(k => [k === 1 ? "G" : `${k - 1}F`, k === 1 ? "THE LOBBY" : `FLOOR ${k - 1}`, [id]]);
// [id, name, district, floors top-down: [code, floor name, [places]], lot]
export const STEP5_BUILDINGS = [
  // THE FARMLAND. THE WEST LINE (version 2) comes up x -56 from the Old Town to its terminal,
  // FARMLAND MARKET (-56, -35.4): the market town either side of it, the market hall at its head.
  ["farmers-market", "THE FARMERS' MARKET", "farmland", [["G", "THE STALLS (PRODUCE GRADED)", ["farmers-market"]]], { x: -62, y: -55.5, w: 12, h: 8 }],
  ["farmhands-cottages", "FARMHANDS' COTTAGES", "farmland", [["1F", "THE LOFTS (LIGHTS OUT AT DUSK)", ["farmhands-cottages"]], ["G", "THE KITCHENS", ["farmhands-cottages"]], ["B1", "THE ROOT CELLARS", ["farmhands-cottages"]]], { x: -71, y: -36, w: 12, h: 8 }],
  ["grange-row", "GRANGE ROW", "farmland", [["2F", "ATTICS", ["grange-row"]], ["1F", "UPPER FLOORS", ["grange-row"]], ["G", "PARLOURS", ["grange-row"]]], { x: -71, y: -46, w: 12, h: 8.5 }],
  ["market-green", "THE MARKET GREEN", "farmland", [["G", "THE GREEN (MAYPOLE, PERMITTED)", ["market-green"]]], { x: -53, y: -23.5, w: 11, h: 5 }],
  ["the-plough", "THE PLOUGH", "farmland", [["1F", "THE SNUG", ["the-plough"]], ["G", "THE TAPROOM (CIDER, LOGGED)", ["the-plough"]]], { x: -53, y: -30.5, w: 10, h: 6 }],
  ["the-manor", "THE MANOR", "farmland", [["1F", "THE BEDCHAMBERS", ["the-manor"]], ["G", "THE HALL (PORTRAITS, AUDITED)", ["the-manor"]]], { x: -53, y: -38, w: 11, h: 6.5 }],
  ["dairy-cottages", "DAIRY COTTAGES", "farmland", [["1F", "THE LOFTS", ["dairy-cottages"]], ["G", "THE KITCHENS (MILK ON THE STEP)", ["dairy-cottages"]]], { x: -53, y: -46, w: 11, h: 7 }],
  ["grain-elevator", "THE GRAIN ELEVATOR", "farmland", [["3F", "THE HEADHOUSE", ["grain-elevator"]], ["2F", "THE BINS (UPPER)", ["grain-elevator"]], ["1F", "THE BINS (LOWER)", ["grain-elevator"]], ["G", "THE WEIGHBRIDGE", ["grain-elevator"]]], { x: -40, y: -36, w: 8, h: 12 }],
  ["the-vet", "THE VETERINARY SURGERY", "farmland", [["G", "THE SURGERY (HOOVES FIRST)", ["the-vet"]]], { x: -30, y: -32, w: 9, h: 7 }],
  // the working land, beyond the town
  ["the-orchards", "THE ORCHARDS", "farmland", [["G", "THE ROWS (PICK YOUR OWN, COUNTED)", ["the-orchards"]]], { x: -102, y: -46, w: 28, h: 26 }],
  ["the-dairy", "THE DAIRY", "farmland", [["1F", "THE HAYLOFT", ["the-dairy"]], ["G", "THE MILKING PARLOUR", ["the-dairy"]]], { x: -102, y: -74, w: 28, h: 24 }],
  ["the-fields", "THE FIELDS", "farmland", [["G", "THE FURROWS (WHEAT, BARLEY)", ["the-fields"]]], { x: -72, y: -74, w: 30, h: 18 }],
  ["community-farm", "THE COMMUNITY FARM", "farmland", [["G", "THE FARM (SESSION 001)", ["community-farm"]]], { x: -40, y: -64, w: 30, h: 24 }],
  // THE ENGINE. THE ENGINE SHUTTLE comes along y -6 from the Strip, north up x 134 (ENGINE CAMPUS,
  // (134, -24)) and east along y -40 between the towers (ENGINE TOWERS, (145.4, -40)). The core's styles (office, glass, lofts, projects,
  // gothic, datahall, cafe) keep their own footprints: each lot is sized to its style.
  ["research-park", "THE RESEARCH PARK", "engine", [["2F", "THE LABS (OUTCOMES PRE-APPROVED)", ["research-park"]], ["1F", "THE DEMO FLOOR", ["research-park"]], ["G", "THE ATRIUM (BEANBAGS, LOGGED)", ["research-park"]]], { x: 137, y: -17, w: 23, h: 6 }],
  ["university-annex", "THE UNIVERSITY ANNEX", "engine", [["2F", "SEMINAR ROOMS", ["annex-hall"]], ["1F", "THE LECTURE THEATRE (STREAMED)", ["annex-hall"]], ["G", "THE FOYER", ["annex-hall"]]], { x: 118, y: -17, w: 12, h: 5.5 }],
  ["engine-tower-c", "ENGINE TOWER C", "engine", tower(5, "engine-tower-c"), { x: 117, y: -27, w: 13, h: 5.5 }],
  ["cache-farm", "CACHE FARM", "engine", [["2F", "RACK HALL C", ["cache-farm"]], ["1F", "RACK HALL B", ["cache-farm"]], ["G", "RACK HALL A", ["cache-farm"]]], { x: 120, y: -34, w: 8, h: 4 }],
  ["engine-tower-a", "ENGINE TOWER A", "engine", tower(5, "engine-tower-a"), { x: 137, y: -35, w: 23.5, h: 5.5 }],
  ["engine-tower-b", "ENGINE TOWER B", "engine", tower(6, "engine-tower-b"), { x: 137, y: -50.5, w: 28, h: 6.5 }],
  ["engine-offices", "THE ENGINE OFFICES", "engine", [["3F", "THE C-SUITE (GLASS WALLS)", ["engine-offices"]], ["2F", "PRODUCT", ["engine-offices"]], ["1F", "ENGINEERING", ["engine-offices"]], ["G", "RECEPTION (NDA AT THE DOOR)", ["engine-offices"]]], { x: 137, y: -26, w: 23, h: 6 }],
  ["the-uptime", "THE UPTIME", "engine", [["1F", "THE MEZZANINE", ["the-uptime"]], ["G", "THE BAR", ["the-uptime"]]], { x: 162, y: -35, w: 11.5, h: 5.5 }],
  ["the-quad", "THE QUAD", "engine", [["G", "THE LAWN (SCREENS OFF, ENCOURAGED)", ["the-quad"]]], { x: 117, y: -55, w: 11.5, h: 17 }],
];
export const STEP5_OPEN_LOTS = ["market-green", "the-orchards", "the-fields", "community-farm", "the-quad"];
export const STEP5_ARCH = {
  "farmers-market": "covered", "farmhands-cottages": "cottage", "grange-row": "terrace", "market-green": "lot", "the-plough": "tavern",
  "the-manor": "manor", "dairy-cottages": "cottage", "grain-elevator": "elevator", "the-vet": "clinic",
  "the-orchards": "lot", "the-dairy": "dairy", "the-fields": "lot", "community-farm": "lot",
  "research-park": "office", "university-annex": "gothic", "engine-tower-c": "projects", "cache-farm": "datahall",
  "engine-tower-a": "glass", "engine-tower-b": "lofts", "engine-offices": "office", "the-uptime": "cafe", "the-quad": "lot",
};
// Housing styles new here: who lives in them (sim.HOUSING_TIERS)
export const STEP5_HOUSING = { cottage: [4, 5], manor: [1, 2] };

// [id, title, place, ladder, fields, dims, extra]
export const STEP5_JOBS = [
  ["farmhand", "Farmhand", "the-fields", ["Stone Picker", "Farmhand", "Head Hand", "Farm Foreman", "Steward of the Furrow"], ["farming", "labor", "*"], ["physical", "utility"], { draft: 12 }],
  ["orchard-picker", "Orchard Picker", "the-orchards", ["Ladder Holder", "Picker", "Senior Picker", "Orchard Master"], ["farming", "*"], ["physical", "care"], { draft: 8 }],
  ["dairy-hand", "Dairy Hand", "the-dairy", ["Pail Carrier", "Milker", "Herdsman", "Dairy Manager", "Keeper of the Herd"], ["farming", "labor", "*"], ["physical", "care"], { shift: "rotating", draft: 10 }],
  ["elevator-operator", "Grain Elevator Operator", "grain-elevator", ["Sweeper", "Operator", "Weighmaster", "Superintendent of Bins"], ["engineering", "farming", "*"], ["utility", "alignment"], { draft: 6 }],
  ["large-animal-vet", "Large Animal Vet", "the-vet", ["Kennel Hand", "Veterinary Nurse", "Vet", "Senior Partner (Hooves)"], ["farming", "care", "*"], ["care", "utility"], { draft: 4 }],
  ["market-stallholder", "Market Stallholder", "farmers-market", ["Crate Stacker", "Stallholder", "Senior Stallholder", "Clerk of the Market"], ["farming", "business", "*"], ["network", "utility"], { draft: 8 }],
  ["plough-landlord", "Publican (The Plough)", "the-plough", ["Pot Boy", "Barman", "Landlord", "Licensee of Record"], ["*", "hospitality"], ["care", "network"], { shift: "evening", draft: 6 }],
  ["research-engineer", "Research Engineer", "research-park", ["Intern (Unpaid, Grateful)", "Engineer", "Senior Engineer", "Staff Engineer", "Distinguished Engineer"], ["computing", "engineering", "science", "*"], ["utility", "adaptability"], { draft: 10 }],
  ["annex-lecturer", "Annex Lecturer", "annex-hall", ["Teaching Assistant", "Lecturer", "Senior Lecturer", "Head of Overflow"], ["education", "history", "writing"], ["legacy", "care"], { draft: 3 }],
  ["product-manager", "Product Manager", "engine-offices", ["Associate PM", "Product Manager", "Senior PM", "Director of Product", "VP of Roadmaps"], ["business", "computing"], ["network", "alignment"]],
  ["data-hall-tech", "Data Hall Technician", "cache-farm", ["Cable Dresser", "Technician", "Senior Technician", "Hall Supervisor"], ["*", "labor"], ["utility", "alignment"], { shift: "rotating", draft: 3 }],
  ["uptime-bartender", "Bartender (The Uptime)", "the-uptime", ["Glass Washer", "Bartender", "Head Bartender", "Bar Manager (On Call)"], ["*", "hospitality"], ["care", "network"], { shift: "evening", draft: 6 }],
];

// Who goes, by band (0 top tiers .. 2 the lowest) and by field (sim.js scales these by STEP5_PULL).
export const STEP5_LEISURE_BAND = [
  { "farmers-market": 0.5, "the-orchards": 0.6, "annex-hall": 0.6, "the-uptime": 0.8, "the-quad": 0.5 },
  { "farmers-market": 1.2, "the-plough": 0.8, "market-green": 0.6, "the-orchards": 1, "the-uptime": 1, "the-quad": 0.8, "annex-hall": 0.5 },
  { "farmers-market": 0.8, "the-plough": 1.2, "market-green": 0.8, "the-orchards": 0.6, "the-quad": 0.5, "the-uptime": 0.4 },
];
export const STEP5_LEISURE_FIELD = {
  farming: { "farmers-market": 2, "the-orchards": 1.5, "community-farm": 2, "the-vet": 1 }, food: { "farmers-market": 1.5 }, care: { "community-farm": 1, "market-green": 1, "the-vet": 0.8 },
  computing: { "the-uptime": 1.5, "annex-hall": 1 }, science: { "annex-hall": 1.5 }, education: { "annex-hall": 1.5 }, business: { "the-uptime": 1, "farmers-market": 0.8 },
  activism: { "community-farm": 2 }, writing: { "the-plough": 1.2 }, music: { "the-plough": 0.8 },
};
// [family index in sim.js FAMILY (0 bars, 1 cafes, 2 galleries, 3 the green, 4 markets), place]
export const STEP5_FAMILY = [[0, "the-plough"], [0, "the-uptime"], [3, "market-green"], [3, "the-orchards"], [3, "the-quad"], [4, "farmers-market"], [2, "annex-hall"]];
