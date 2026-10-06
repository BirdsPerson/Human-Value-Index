// THE SHORE PLAZA (Scott, 2026-10-06: "the Surfside could even be the SHORE PLAZA, and you can put
// SAM'S PIZZA in the lobby of it like it actually is ... that's what I was trying to do from the
// beginning"; and "I would like GOODNIGHT IRENE'S to be there too, as an actual BREWERY and BREW PUB
// ... OWNED BY MY CHARACTER"). Pure data, no imports (sim.js reads it; it may not import anything
// that imports sim.js).
//
// THE REAL ONE. The Shore Plaza on the Wildwood boardwalk at 26th Avenue: a 1957 doo-wop motel with
// curved balconies over the boards and a pool on the roof, rebuilt on the same lot in the same basic
// design, Sam's Pizza Palace (also 1957) at street level under it, across from the piers. Ours is
// drawn from that description, not from a photograph (archGeo.js "condo", archDraw.js plazaFace).
//
// WHAT CHANGED. The Coast's tower `the-surfside` keeps its id, its lot, its residents' place
// (`surfside`) and its helipad; only its name and its floors: THE SHORE PLAZA, Sam's at street level
// beside the residents' lobby, Goodnight Irene's brewhouse and taproom on the two floors over it, the
// suites above, the pool deck on the roof. SAM'S PIZZA and GOODNIGHT IRENE'S keep their place ids:
// only the building and the floor they stand on change. The two boardwalk lots they stood on keep
// their building ids and their ground (no footprint moved), each now a shop TO LET (a shell place
// nobody is planned into, PLAZA_SHELLS).
//
// THE DAY BOUNDARY (docs/planning/MASTER_PLAN.md). PLAZA_DAY is the first machine day of the move:
// set past every day published at the push. Before it the two places stand where they stood (sim.js
// placedOn: their old lots, buildings and floors, for plans, routes and whereAt), so a published day,
// or one rebuilt, is byte for byte what the code before built (check-shoreplaza against
// fixtures/shoreplaza-pre.json). From it: they are in the Plaza, and Irene's new staff (PLAZA_STAFF)
// come on. The city is drawn as the Plaza from the deploy (a few machine days early).

export const PLAZA_DAY = 619;              // machine day; set past every day published at the deploy
export const PLAZA_ID = "the-surfside";    // the building (its id kept)
export const PLAZA_NAME = "THE SHORE PLAZA";
export const PLAZA_HOMES = "surfside";     // the residents' place (its id kept)
export const SAMS = "sams-pizza", IRENES = "goodnight-irenes";
export const PLAZA_MOVES = [SAMS, IRENES];

// The Plaza's floors, top-down (sim.js B). Sam's shares the street level with the residents' lobby;
// Irene's brews on the first floor (copper behind the glass, over the boards) and pours on the second.
export const BREWHOUSE = "BH", TAPROOM = "TR";
export const PLAZA_FLOORS = [
  ["PH", "THE ROOF: POOL DECK (SUNSET, SCHEDULED)", [PLAZA_HOMES]],
  ...[4, 3, 2, 1].map(n => [`${n}F`, `SUITES LEVEL ${n} (CURVED BALCONIES)`, [PLAZA_HOMES]]),
  [TAPROOM, "GOODNIGHT IRENE'S: THE TAPROOM", [IRENES]],
  [BREWHOUSE, "GOODNIGHT IRENE'S: THE BREWHOUSE", [IRENES]],
  ["G", "SAM'S PIZZA PALACE AND THE LOBBY (SAND REMOVED AT THE DOOR)", [SAMS, PLAZA_HOMES]],
];
// The Plaza's guests stand on the residents' ground (sim.js SHARED_RECT): the lot is not split for
// them, so the residents' rect, spot and every walk to it stay as they were.
export const PLAZA_SHARED = { [SAMS]: PLAZA_HOMES, [IRENES]: PLAZA_HOMES };

// The old lots, TO LET from the deploy: [place id, district, kind, cap, name]. Appended to the place
// list after everything else and never in a plan (`from` Infinity), so no index moves.
export const PLAZA_SHELLS = [
  ["boardwalk-east-to-let-a", "coast", "mixed", 10, "BOARDWALK EAST, THE OLD PIZZA COUNTER (TO LET)"],
  ["boardwalk-east-to-let-b", "coast", "mixed", 10, "BOARDWALK EAST, THE OLD CORNER (TO LET)"],
];
export const SHELL_OF = { [SAMS]: PLAZA_SHELLS[0][0], [IRENES]: PLAZA_SHELLS[1][0] };   // building id -> its shell

// IRENE'S STAFF (from PLAZA_DAY). The brewer and the brewpub bartender (storefrontSim.js) were always
// there; the Plaza's brewery adds a head brewer (half the brewers, by their own hash), cellar hands
// (from the Parts Depot and the fabricators) and servers (from the diner's line, the cafe and the
// bars). [id, title, place, ladder, fields, dims, extra] (sim.js J): in JOB, not in JOBS, so job
// assignment is unchanged; who works them is sim.js workOf's.
export const PLAZA_JOBS = [
  ["irenes-head-brewer", "Head Brewer", IRENES, ["Assistant Brewer", "Brewer", "Head Brewer", "Brewmaster"], ["hospitality", "chemistry", "farming"], ["utility", "care"], { shift: "day" }],
  ["irenes-cellar-hand", "Cellar Hand", IRENES, ["Keg Washer", "Cellar Hand", "Cellarman", "Keeper of the Bright Tanks"], ["*", "labor"], ["physical", "utility"], { shift: "day" }],
  ["irenes-server", "Server", IRENES, ["Busser", "Server", "Head Server", "Floor Captain"], ["hospitality", "*"], ["care", "network"], { shift: "evening" }],
];
export const PLAZA_STAFF = [
  { job: "irenes-head-brewer", from: ["brewer"], p: 0.5 },
  { job: "irenes-cellar-hand", from: ["depot-clerk", "fabricator"], p: 0.12 },
  { job: "irenes-server", from: ["line-cook", "caffeine-dispenser", "bartender"], p: 0.15 },
];
