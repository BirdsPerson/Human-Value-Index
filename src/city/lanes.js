// THE LANES: the city's bowling alley (Scott, 2026-10-05: "we need a bowling alley and a bowling game").
// Pure data, no imports (sim.js reads it; it may not import anything that imports sim.js). The game is
// src/play/bowling/ (#bowling); the room is lanesProps.js.
//
// WHERE. Not a new building: a new top floor on THE ARCADE, on the Strip (an existing building on its
// existing lot: nothing moved, no address or id changed). Upstairs from the cabinets, as alleys over
// arcades are. The place shares the arcade's ground (SHARED_RECT: the Strip's grid does not split the
// arcade's cell for it), so the arcade's room, its spot and every walk to it stay exactly as they were.
//
// THE DAY BOUNDARY (docs/planning/MASTER_PLAN.md). LANES_DAY is the first machine day the lanes open:
// set past every day published at the push. Before it nobody works there and nobody visits (the plan's
// place list stops before it, the jobs and the pull are off), so a published day, or one rebuilt, is
// byte for byte what the code before built (scripts/check-lanes.mjs holds the two days before it against
// the earlier code's hashes, scripts/fixtures/lanes-pre.json). From it: the jobs, the visitors, league
// nights. The floor itself is drawn from the start (a room upstairs, its lanes dark until the day).

export const LANES_DAY = 618;              // machine day; set past every day published at the deploy
export const LANES_ID = "the-lanes";
export const lanesOpenOn = (day) => day >= LANES_DAY;
export const lanesOpen = (machineTime) => Math.floor(machineTime / 24) + 1 >= LANES_DAY;

// [id, district, kind, cap, name, engine tendencies] (sim.js P)
export const LANES_PLACE = [LANES_ID, "strip", "mixed", 24, "THE LANES (EVERY FRAME LOGGED)", []];
// the floor on THE ARCADE (sim.js FUNNEL building "the-arcade"), top-down: it goes first
export const LANES_BUILDING = "the-arcade";
export const LANES_FLOOR = ["2F", "THE LANES (TEN PINS, SCORED)", [LANES_ID]];
// places that stand on another's ground instead of a share of their building's cell
export const SHARED_RECT = { [LANES_ID]: "arcade" };

// THE JOBS (from LANES_DAY): a share of the Strip's service staff and the Works' fabricators move
// upstairs. [id, title, place, ladder, fields, dims, extra] (sim.js J). Who: a subject whose assigned
// job is one of `from`, picked by their own hash at `p` (no census count needed, so every viewer and
// the builder agree).
export const LANES_JOBS = [
  ["shoe-clerk", "Shoe Rental Clerk", LANES_ID, ["Shoe Sprayer", "Shoe Clerk", "Senior Shoe Clerk", "Keeper of the Sizes"], ["hospitality", "*"], ["care", "network"], { shift: "evening" }],
  ["lane-mechanic", "Lane Mechanic", LANES_ID, ["Pin Picker", "Lane Mechanic", "Pinsetter Technician", "Master of the Machines"], ["engineering", "labor", "*"], ["utility", "physical"], { shift: "day" }],
];
export const LANES_STAFF = [
  { job: "shoe-clerk", from: ["bartender", "line-cook", "prize-clerk", "caffeine-dispenser"], p: 0.2 },
  { job: "lane-mechanic", from: ["fabricator", "depot-clerk"], p: 0.25 },
];
// THE PULL (from LANES_DAY): a leisure weight by tier band (0 the top .. 2 the lowest), more for sport;
// open 12:00 to 02:00; LEAGUE NIGHTS (Tuesday, Thursday from 19:00) pull three times as hard.
export const LANES_PULL = { band: [0.6, 1.1, 1.3], sport: 0.8, hospitality: 0.3, open: [12, 26], league: 3 };
export const LEAGUE_DAYS = [2, 4];
export const lanesHours = (hour) => hour == null || (hour >= LANES_PULL.open[0] && hour < LANES_PULL.open[1]) || hour < LANES_PULL.open[1] - 24;
