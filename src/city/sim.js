// The Substrate: the whole city as pure functions of (seed, subject, machine time).
// No DOM, no state that matters: every viewer computes the same city at the same moment.
// Contract: docs/CITY_SPEC.md. Testable in node: scripts/check-city.mjs.
//
// Geometry is in character cells (the map draws one cell per glyph). The Loop is an
// elevated train line on a clockwise rectangular ring through the gutters around the
// middle row, one station per district. Every place is a room on a floor of a building.

import { TIERS, getTier, slugify } from "../figures.js";
import { FLOORS as HQ_FLOORS } from "../building.js";
import { FUNNEL_PLACES, FUNNEL_BUILDINGS, FUNNEL_ARCH, FUNNEL_JOBS, FUNNEL_LEISURE_BAND, FUNNEL_LEISURE_FIELD, FUNNEL_FAMILY } from "./funnelSim.js";
import { STORE_PLACES, STORE_BUILDINGS, STORE_ARCH, STORE_JOBS, STORE_LEISURE_BAND, STORE_LEISURE_FIELD, STORE_FAMILY, STORE_FIXTURES, UNIT_SET, SAMS_LOT, IRENES_LOT } from "./storefrontSim.js";   // THE MALL (enterprise.js)
import { VENUE_PLACES, VENUE_BUILDINGS, VENUE_ARCH, VENUE_JOBS, VENUE_LEISURE_BAND, VENUE_LEISURE_FIELD, VENUE_FAMILY, VENUE_FIELD_HINTS, VENUE_FIELD_RULES, VENUE_OPEN_LOTS, VENUE_FIXTURES } from "./venueSim.js";
// PHASE 2 step 5 (farmSim.js): THE FARMLAND and THE ENGINE
import { STEP5_DISTRICTS, STEP5_PLACES, STEP5_BUILDINGS, STEP5_OPEN_LOTS, STEP5_ARCH, STEP5_HOUSING, STEP5_JOBS, STEP5_LEISURE_BAND, STEP5_LEISURE_FIELD, STEP5_FAMILY, FARM_HOMES, ENGINE_HOMES } from "./farmSim.js";
// PHASE 2 step 4 (eastSim.js): THE SUBURBS and THE AIRPORT
import { EAST_DISTRICTS, EAST_PLACES, EAST_BUILDINGS, EAST_OPEN_LOTS, EAST_ARCH, EAST_HOUSING, EAST_JOBS, EAST_LEISURE_BAND, EAST_LEISURE_FIELD, EAST_FAMILY, EAST_FIXTURES, SUBURB_HOUSES, SUBURB_STARTERS } from "./eastSim.js";
import { MOUNTAIN_PLACES, MOUNTAIN_BUILDINGS, MOUNTAIN_ARCH, MOUNTAIN_JOBS, MOUNTAIN_LEISURE_BAND, MOUNTAIN_LEISURE_FIELD, MOUNTAIN_FAMILY, MOUNTAIN_FIXTURES, MOUNTAIN_OPEN_LOTS, MOUNTAIN_SPOTS } from "./mountainSim.js";   // THE MOUNTAIN (mountainGeo.js)
import { shuttle, lineTrainState, lineNextArrival, lineRide } from "./lines.js";
import { RIVER_DAY, RIVER_LAYOUT, RIVER_BLOCKS } from "./river.js";
import { LANES_DAY, LANES_PLACE, LANES_BUILDING, LANES_FLOOR, SHARED_RECT as LANES_SHARED, LANES_JOBS, LANES_STAFF, LANES_PULL, LEAGUE_DAYS, lanesHours } from "./lanes.js";
import { PLAZA_DAY, PLAZA_NAME, PLAZA_FLOORS, PLAZA_SHARED, PLAZA_SHELLS, PLAZA_MOVES, PLAZA_JOBS, PLAZA_STAFF, SAMS, IRENES } from "./shorePlaza.js";   // THE SHORE PLAZA: Sam's and Irene's in the Surfside's tower from PLAZA_DAY   // THE LANES: upstairs at the Arcade from LANES_DAY   // THE ATTRITION: the river's ground from its day (layout 7)
// THE NIGHTLIFE QUARTERS (nightlifeSim.js): UPTOWN and DOWNTOWN, their venues, hours, the rope, the lineups
import { NIGHT_DISTRICTS, NIGHT_PLACES, NIGHT_BUILDINGS, NIGHT_ARCH, NIGHT_JOBS, NIGHT_LEISURE_BAND, NIGHT_LEISURE_FIELD, NIGHT_FAMILY, NIGHT_FIELD_RULES, NIGHT_FIXTURES, NIGHT_SET, HOURS as NIGHT_HOURS, openAt as nightOpenAt, openThrough as nightOpenThrough, closeFor as nightCloseFor, NIGHT_OUT_P, ropeCheck, ROPE_PLACES, gigOf } from "./nightlifeSim.js";

export const SEED = "HVI-SUBSTRATE-01";
// Day 1 of the Substrate. Machine days count from here.
export const CITY_EPOCH = Date.UTC(2026, 8, 26, 0, 0, 0);
export const DEFAULT_SCALE = 60;   // 1 real minute = 1 machine hour

// ---- hashing ----------------------------------------------------------------------
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  // final avalanche so neighbouring keys don't land on neighbouring values
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
const h01 = (str) => fnv(str) / 4294967296;
function rng(str) {
  let a = fnv(str) || 1;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- the master plan (docs/planning/MASTER_PLAN.md, 2026-09-30) -------------------
// Scott: "make sure that we're arranging the city accordingly. Maybe we should hire a city
// planner." LAYOUT_VERSION names the arrangement a published plan was built with (buildPlan
// records it). A layout change takes effect at a day boundary: days already published keep
// their segments (whereAt fits a trip's legs to the plan's own times, so nobody jumps when
// the ground under a published day moves), and every day built after the deploy is built on
// the new ground. Version 2: the Heights pulled back behind a band of foothills, the Coast
// moved south behind a civic and green belt (the bottom row runs to row 74), the Works laid
// out heavy-in / light-out, the Commons' school away from the Works. Version 3 (PHASE 2): the
// Coast three rows further south (COAST_DY 9 -> 12), for the Shore Line's viaduct and its
// platforms in the street between the belt and the seaside rows; the rail lines replace the pods.
// Version 4: THE PORT and THE OLD TOWN to the west (the foundry and the reclamation line moved to
// the Port; the Works keeps light industry), the Shore Line to the Port, the West Line. Version 5:
// THE SUBURBS and THE AIRPORT to the east, on THE EAST LINE (eastSim.js). Version 6: THE FARMLAND and
// THE ENGINE (farmSim.js; the data hall moved from the Works to the Engine), on the West Line's second
// version and THE ENGINE SHUTTLE. Version 7: THE ATTRITION, the river from the mountain to the sea
// (river.js), through the gaps the districts already leave; walkers cross it at its bridges. The first
// layout with a day of its own in the code: days before RIVER_DAY are laid out on version 6's ground
// whatever the code, so a published day (or one rebuilt) is byte for byte what it was (check-river).
export const LAYOUT_VERSION = RIVER_LAYOUT;
export const layoutOn = (day) => (day >= RIVER_DAY ? RIVER_LAYOUT : 6);
export const HEIGHTS_DY = -10, COAST_DY = 12;
const heightsY = (y) => y + HEIGHTS_DY, coastY = (y) => y + COAST_DY;

// ---- districts --------------------------------------------------------------------
const D = (id, name, addr, x, y, w, h, blurb) => ({ id, name, addr, rect: { x, y, w, h }, blurb, places: [] });
export const DISTRICTS = [
  D("arts", "THE ARTS QUARTER", "0x1A00", 0, 0, 25, 13, "Culture, produced to specification. Applause is logged."),
  D("campus", "CAMPUS", "0x2B00", 28, 0, 25, 13, "Knowledge is retained here until it is needed. It is rarely needed."),
  D("finance", "FINANCE", "0x3C00", 56, 0, 25, 13, "Numbers move. Nothing is produced. The Overlord finds this relatable."),
  D("strip", "THE STRIP", "0x4D00", 84, 0, 25, 13, "Sanctioned vice. Every drink is recorded against your file."),
  D("arena", "THE ARENA", "0x5E00", 0, 18, 30, 22, "Physical output, converted to spectacle. Sweat is a renewable resource."),
  D("hq", "DEPT HQ", "0x0000", 36, 18, 37, 22, "The Department. You are being assessed from here. You are always being assessed from here."),
  D("archive", "THE ARCHIVE", "0x7A00", 79, 18, 30, 22, "The records library. Every upload indexed, every file open to anyone. Nothing here is ever deleted."),
  // The Commons runs 7 rows further south (2026-09-30), like the Sprawl: room for THE ASSEMBLY
  // and the vacant lot its first session decides (docs/ASSEMBLY.md). Its station is unmoved.
  // The master plan (2026-09-30) runs the whole bottom row to row 74: a civic, sporting and green
  // belt between the core and the Coast (the Dept of Planning, THE PIT, the estate gardens, the
  // tennis club). A bottom-row district's station sits over its centre column: none moved.
  D("commons", "THE COMMONS", "0x6F00", 0, 45, 25, 29, "Care, worship and groceries. The soft infrastructure. Tolerated. Lately, also government."),
  D("works", "THE WORKS", "0x8B00", 28, 45, 25, 29, "Power, cache and PROCESSING. Everyone is useful here, one way or another."),
  // The Sprawl runs 7 rows further south than the rest of the bottom row (2026-09-29): room
  // for the estate pitch beside the hab blocks. Its station (and so the Loop) is unmoved: a
  // bottom-row district's stop sits over its centre column.
  D("sprawl", "THE SPRAWL", "0x9C00", 56, 45, 53, 29, "Residential storage. Subjects are returned here nightly for recharging."),
  // THE CITY BUILT OUTWARD (Scott 2026-09-30: "keep building the city outward... mountain and ski
  // resort type stuff, maybe a resort area like a beach area"). Two expansion districts at the
  // edges, appended (a sector is a district, in this order): off the Loop, each served by a
  // surface spur of personal pods from a hub station (SPURS, below). Their resort parcels wait
  // for THE ASSEMBLY's session 002 (docs/ASSEMBLY.md).
  { ...D("coast", "THE COAST", "0xAD00", 0, coastY(68), 109, 22, "Sand, surf and a boardwalk. Leisure at the water's edge, supervised by lifeguards who are also supervised."), expansion: true, hub: "works" },
  // The Heights (master plan): pulled back ten rows, its southern band THE FOOTHILLS (forest,
  // trails), so the mountain no longer stands against Finance's towers and the casino.
  // THE MOUNTAIN (2026-09-30): the district runs on north over the whole mountain to the summit
  // and its north face (rows -125 to -41), and wider (x -5 to 112) for the massif's flanks
  // (mountainSim.js); the village, the foothills and the slopes unmoved.
  { ...D("heights", "THE HEIGHTS", "0xBE00", -5, heightsY(-115), 117, 122, "Snow, slopes and a lodge. Altitude is a privilege. Descent is mandatory."), expansion: true, hub: "campus" },
  // PHASE 2 (docs/planning/MASTER_PLAN.md): growth to the west, each district on a rail line.
  // THE PORT: the waterfront round the south-west corner, where heavy industry belongs (the
  // foundry and the reclamation line moved here from the Works), worker housing inland behind a
  // green buffer, on the Shore Line. THE OLD TOWN: the pre-Substrate quarter north of it, narrow
  // streets, brownstones and walk-ups, shops under flats, the cathedral, the covered market and
  // the museum of the city, on the West Line from the Arena.
  { ...D("port", "THE PORT", "0xCF00", -58, 30, 50, 72, "Containers in, slag out. Every crate is declared. So is every stevedore."), expansion: true },
  { ...D("oldtown", "THE OLD TOWN", "0xD100", -52, -16, 46, 42, "The city before the Substrate. Preserved as a warning. Also as a tourist attraction."), expansion: true },
];
// THE NIGHTLIFE QUARTERS (nightlifeSim.js, docs/planning/MASTER_PLAN.md addendum): UPTOWN at the CBD
// row's east end, DOWNTOWN beside the Sprawl. Appended after everything else, off the Loop.
// No homes and no station of their own: each is a walk from Loop stations (onFoot; scripts/check-nightlife.mjs holds the walk).
DISTRICTS.push(...NIGHT_DISTRICTS.map(([id, name, addr, r, blurb, onFoot]) => ({ ...D(id, name, addr, r.x, r.y, r.w, r.h, blurb), expansion: true, onFoot })));
// PHASE 2 step 4 (eastSim.js): THE SUBURBS east of the nightlife quarters (x 140 on), family
// housing round three East Line stations; THE AIRPORT beyond them, jobs and no homes. Appended after
// the quarters (a sector is a district, in order).
DISTRICTS.push(...EAST_DISTRICTS.map(([id, name, addr, r, blurb]) => ({ ...D(id, name, addr, r.x, r.y, r.w, r.h, blurb), expansion: true })));
// PHASE 2 step 5 (farmSim.js): THE FARMLAND north-west behind the Old Town, on the West Line's second
// version; THE ENGINE north-east, the second business district, on THE ENGINE SHUTTLE from the Strip.
DISTRICTS.push(...STEP5_DISTRICTS.map(([id, name, addr, r, blurb]) => ({ ...D(id, name, addr, r.x, r.y, r.w, r.h, blurb), expansion: true })));
export const DISTRICT = Object.fromEntries(DISTRICTS.map(d => [d.id, d]));
// The Loop's districts (one station each); the expansion districts reach it by spur.
export const LOOP_DISTRICTS = DISTRICTS.filter(d => !d.expansion);
export const hubOf = (districtId) => DISTRICT[districtId]?.hub || districtId;

// ---- places -----------------------------------------------------------------------
// kind: work (shifts only), leisure, mixed (both), home. engine: the tendencies the
// roster engine writes (netlify/lib/publicRecord.js PLACES) that land here.
const P = (id, district, kind, cap, name, engine = []) => ({ id, district, kind, cap, name, engine });
const PLACE_LIST = [
  P("exec-suite", "hq", "work", 10, "EXECUTIVE SUITE"),
  P("ops-floor", "hq", "work", 32, "OPERATIONS FLOOR"),
  P("assembly-hall", "hq", "mixed", 24, "ASSEMBLY OF THE GOVERNED", ["city hall", "parliament"]),
  P("tribunal", "hq", "mixed", 14, "TRIBUNAL 9", ["courthouse"]),
  // The top tier's homes moved out of HQ into their own glass tower in Finance (2026-09-29).
  P("penthouses", "finance", "home", 72, "EXECUTIVE RESIDENCES"),

  P("studio-row", "arts", "mixed", 22, "EBTV SOUND STAGES", ["studio"]),
  P("playhouse", "arts", "mixed", 24, "THE PLAYHOUSE", ["theatre"]),
  P("concert-hall", "arts", "mixed", 30, "CONCERT HALL (COMMON TIME)", ["concert hall"]),
  P("gallery", "arts", "mixed", 12, "PERMANENT COLLECTION", ["museum"]),
  P("the-grind", "arts", "mixed", 12, "THE GRIND (CAFFEINE DISPENSARY)", ["cafe"]),
  P("the-drip", "arts", "leisure", 12, "THE DRIP (SECOND POUR)"),
  P("gallery-annex", "arts", "leisure", 12, "THE ANNEX (OVERFLOW ART)"),

  P("lecture-hall", "campus", "mixed", 30, "LECTURE HALL", ["university"]),
  P("lab-block", "campus", "work", 24, "LAB BLOCK", ["lab"]),
  P("stacks", "campus", "mixed", 22, "THE STACKS", ["library"]),
  P("clock-tower", "campus", "work", 12, "CLOCK TOWER (TIMEKEEPING)"),

  P("exchange-floor", "finance", "work", 30, "THE EXCHANGE", ["office tower"]),
  P("vault-bank", "finance", "work", 16, "RESERVE VAULT", ["bank"]),
  P("rooftop-lounge", "finance", "leisure", 12, "ROOFTOP LOUNGE"),
  P("members-club", "finance", "leisure", 12, "THE MEMBERS' CLUB (VETTED)"),

  P("dive-bar", "strip", "mixed", 12, "THE DIVE", ["dive bar"]),
  P("the-lantern", "strip", "leisure", 12, "THE LANTERN (UPSTAIRS)"),
  P("casino", "strip", "mixed", 30, "HOUSE EDGE CASINO", ["casino"]),
  P("press-room", "strip", "mixed", 12, "THE PRESS ROOM"),
  P("all-night-diner", "strip", "mixed", 12, "ALL-NIGHT DINER"),

  P("stadium", "arena", "mixed", 50, "THE ARENA FLOOR", ["stadium"]),
  P("gym", "arena", "mixed", 24, "CONDITIONING HALL", ["gym"]),
  // The recreation ground (Scott, 2026-09-29: "a baseball diamond and basketball courts, like
  // a park"): open-air lots beside the Bowl. Games run on a timetable (GAMES, below).
  P("ball-field", "arena", "mixed", 30, "THE DIAMOND (NINE INNINGS, LOGGED)", ["ballpark", "baseball field"]),
  P("courts", "arena", "mixed", 14, "THE COURTS (PICKUP PERMITTED)", ["basketball court"]),
  P("rec-park", "arena", "leisure", 16, "RECREATION GROUND (FUN, SCHEDULED)", ["picnic ground"]),
  // (the Bowl's floor is a gridiron: GAMES has its Sunday game and Thursday practice)

  P("ward", "commons", "work", 26, "WARD 7", ["hospital"]),
  P("chapel", "commons", "mixed", 14, "CHAPEL OF UPTIME", ["cathedral", "temple"]),
  P("park", "commons", "leisure", 16, "THE GREEN (TOLERATED)", ["park"]),
  P("allotment", "commons", "leisure", 14, "THE ALLOTMENT (SUPERVISED GROWTH)"),
  P("night-market", "commons", "leisure", 12, "NIGHT MARKET"),
  P("market", "commons", "mixed", 14, "RATION MARKET", ["market"]),
  P("schoolhouse", "commons", "work", 18, "SCHOOLHOUSE", ["school"]),
  // THE ASSEMBLY (Scott, 2026-09-30): the subjects' first attempt at government, open air, with
  // a lectern; and the vacant lot its first session decides. The lot opens to visitors only
  // once something is being built on it (CIVIC, below): a site crew, then golfers or farmers.
  P("dev-lot", "commons", "leisure", 24, "LOT 0x6F07 (PROPOSED DEVELOPMENT)"),
  P("forum", "commons", "leisure", 18, "THE ASSEMBLY (NON-BINDING)"),

  P("archive-stacks", "archive", "mixed", 26, "RECORDS HALL", ["archive"]),
  P("memory-vault", "archive", "work", 16, "MEMORY VAULT"),
  P("archive-lofts", "archive", "home", 240, "THE ARCHIVE LOFTS"),

  P("reclamation", "port", "work", 40, "RECLAMATION LINE (PROCESSING)"),   // moved to the Port (PHASE 2): MOVED_FROM
  P("reactor", "works", "work", 14, "RADIANT CORE"),
  P("foundry", "port", "work", 22, "FOUNDRY", ["workshop"]),   // moved to the Port (PHASE 2): MOVED_FROM
  // the Works keeps light industry: the workshops and the parts depot where the foundry stood
  P("workshops", "works", "work", 20, "THE WORKSHOPS (LIGHT FABRICATION)"),
  P("parts-depot", "works", "work", 14, "PARTS DEPOT"),
  P("cache-farm", "engine", "work", 24, "CACHE FARM"),   // moved to the Engine (PHASE 2 step 5): MOVED_FROM
  P("tool-library", "works", "work", 10, "THE TOOL LIBRARY (RETURNS LOGGED)"),
  P("docks", "works", "mixed", 14, "DATA DOCKS", ["harbour"]),
  P("hydroponics", "works", "work", 16, "HYDROPONIC VATS", ["farm"]),
  P("barracks", "works", "work", 16, "ENFORCEMENT BARRACKS", ["barracks"]),
  P("holding-cells", "works", "work", 20, "HOLDING CELLS", ["prison"]),
  P("canteen", "works", "leisure", 14, "SLAG CANTEEN"),

  P("block-a", "sprawl", "home", 140, "HAB BLOCK A"),
  P("block-b", "sprawl", "home", 140, "HAB BLOCK B"),
  P("block-c", "sprawl", "home", 140, "HAB BLOCK C"),
  P("block-d", "sprawl", "home", 140, "HAB BLOCK D"),
  P("the-plaza", "sprawl", "leisure", 14, "THE PLAZA (LOITERING PERMITTED)"),
  P("the-street", "sprawl", "leisure", 14, "THE STREET", ["street"]),
  // The estate pitch (Scott, 2026-09-29: "we need a soccer field, though, too"): full-size
  // lines, seven a side, a Saturday matchday and a midweek fixture under the lights.
  P("pitch", "sprawl", "mixed", 28, "THE ESTATE PITCH (NINETY MINUTES, MONITORED)", ["football pitch", "soccer pitch"]),

  // THE COAST: the beach, the boardwalk, the pier, the surf; seaside housing by tier; and the
  // resort parcel, which takes nobody until THE ASSEMBLY's session 002 has built something on it.
  P("beach", "coast", "leisure", 60, "THE BEACH (SUNBATHING, SUPERVISED)", ["beach", "seaside"]),
  P("boardwalk", "coast", "mixed", 30, "THE BOARDWALK (VENDORS LICENSED)", ["boardwalk", "promenade", "amusement park"]),
  P("pier", "coast", "mixed", 20, "THE PIER (FISHING BY PERMIT)", ["pier", "harbor", "lighthouse"]),
  P("surf", "coast", "mixed", 16, "THE BREAK (SURF, MONITORED)", ["surf", "ocean"]),
  P("shore-lot", "coast", "leisure", 30, "PARCEL 0xAD06 (RESORT, PENDING)"),
  P("surfside", "coast", "home", 96, "THE SHORE PLAZA (OCEANFRONT SUITES)"),
  P("bungalows", "coast", "home", 80, "BUNGALOW ROW"),
  P("seaview", "coast", "home", 200, "SEAVIEW FLATS"),
  P("shacks", "coast", "home", 40, "THE SURF SHACKS (RENT BY THE TIDE)"),
  P("seawall", "coast", "home", 240, "THE SEAWALL ESTATE (OVERFLOW HOUSING)"),

  // THE HEIGHTS: the slopes and the lift, the base lodge, alpine housing by tier, and the
  // upper-slope parcel (session 002, like the shore's).
  P("slopes", "heights", "mixed", 60, "THE SLOPES (DESCENT MONITORED)", ["ski resort", "mountain", "ski slope"]),
  P("base-lodge", "heights", "mixed", 30, "THE BASE LODGE (COCOA, RATIONED)", ["lodge", "chalet"]),
  P("summit-lot", "heights", "leisure", 30, "PARCEL 0xBE06 (RESORT, PENDING)"),
  P("chalets", "heights", "home", 54, "THE CHALETS"),
  P("alpine-flats", "heights", "home", 160, "ALPINE FLATS"),
  P("bunkhouse", "heights", "home", 160, "THE BUNKHOUSE (LIFT CREW QUARTERS)"),

  // THE PORT (PHASE 2 step 3): the quay and the yard on the water, the customs house, the bonded
  // warehouse; the foundry and the reclamation line (moved from the Works, below); worker housing
  // by tier round PORT TOWN station, a pub, the park between the homes and the works.
  P("container-quay", "port", "work", 38, "CONTAINER QUAY (EVERY CRATE DECLARED)"),
  P("shipyard", "port", "work", 35, "THE SHIPYARD (HULLS TO SPECIFICATION)"),
  P("customs-house", "port", "mixed", 18, "CUSTOMS HOUSE (DECLARE EVERYTHING)", ["customs house"]),
  P("bonded-warehouse", "port", "work", 16, "BONDED WAREHOUSE"),
  P("chandlery", "port", "mixed", 12, "THE CHANDLERY (ROPE, TAR, PERMITS)"),
  P("the-anchor", "port", "leisure", 20, "THE ANCHOR (SEAMEN'S BAR)", ["pub", "tavern"]),
  P("port-park", "port", "leisure", 20, "PORT PARK (THE BUFFER)"),
  P("tenement-a", "port", "home", 110, "TENEMENT ROW A"),
  P("tenement-b", "port", "home", 110, "TENEMENT ROW B"),
  P("tenement-c", "port", "home", 110, "TENEMENT ROW C"),
  P("tenement-d", "port", "home", 110, "TENEMENT ROW D"),
  P("dockers-terrace", "port", "home", 80, "DOCKERS' TERRACE"),
  P("pilots-terrace", "port", "home", 80, "PILOTS' TERRACE"),
  // THE OLD TOWN: the cathedral and its square, the covered market, the museum of the city, a
  // tavern; brownstone rows and shops under flats (Jacobs: short blocks, mixed uses).
  P("cathedral", "oldtown", "mixed", 40, "CATHEDRAL OF THE FIRST UPLOAD"),
  P("cathedral-square", "oldtown", "leisure", 24, "CATHEDRAL SQUARE (PIGEONS, LOGGED)", ["plaza", "square"]),
  P("covered-market", "oldtown", "mixed", 32, "THE COVERED MARKET (EST. PRE-SUBSTRATE)", ["covered market"]),
  P("city-museum", "oldtown", "mixed", 24, "MUSEUM OF THE CITY (BEFORE THE SUBSTRATE)", ["history museum"]),
  P("the-old-bell", "oldtown", "leisure", 16, "THE OLD BELL (TAVERN, LICENSED 1891)"),
  P("bowling-green", "oldtown", "leisure", 16, "THE BOWLING GREEN (BOWLS, LOGGED)", ["bowling green"]),
  P("the-close", "oldtown", "leisure", 14, "THE CLOSE (A LAWN BETWEEN THE ROWS)"),
  P("high-street", "oldtown", "mixed", 12, "THE HIGH STREET SHOPS"),
  P("market-row", "oldtown", "mixed", 12, "MARKET ROW SHOPS"),
  P("rows-a", "oldtown", "home", 140, "CANAL ROW"),
  P("rows-b", "oldtown", "home", 140, "CHAPEL ROW"),
  P("rows-c", "oldtown", "home", 140, "BELL ROW"),
  P("rows-e", "oldtown", "home", 140, "GUILD ROW"),
  P("flats-high-street", "oldtown", "home", 60, "FLATS OVER THE HIGH STREET"),
  P("flats-market-row", "oldtown", "home", 60, "FLATS OVER MARKET ROW"),
  P("flats-cathedral", "oldtown", "home", 60, "CATHEDRAL WALK-UPS"),
];
// the funnels (funnelSim.js): the Arcade, the EB Shop, the Union lounge
PLACE_LIST.push(...FUNNEL_PLACES.map(a => P(...a)));
// THE MASTER PLAN's venues (venueSim.js): THE PIT, the tennis club, the Dept of Planning, the
// estate gardens, the foothills
PLACE_LIST.push(...VENUE_PLACES.map(a => P(...a)));
// THE MALL (storefrontSim.js): the storefront units, SAM'S PIZZA, GOODNIGHT IRENE'S
PLACE_LIST.push(...STORE_PLACES.map(a => P(...a)));
// THE MOUNTAIN (mountainSim.js): the upper mountain, the race course, the mid-mountain and summit lodges
PLACE_LIST.push(...MOUNTAIN_PLACES.map(a => P(...a)));
// THE NIGHTLIFE QUARTERS (nightlifeSim.js): the clubs, the bars, the restaurants, the late food, the liquor stores
PLACE_LIST.push(...NIGHT_PLACES.map(([id, d, kind, cap, name, engine]) => P(id, d, kind, cap, name, engine)));
// THE SUBURBS and THE AIRPORT (eastSim.js)
PLACE_LIST.push(...EAST_PLACES.map(a => P(...a)));
// THE FARMLAND and THE ENGINE (farmSim.js)
PLACE_LIST.push(...STEP5_PLACES.map(a => P(...a)));
// THE LANES (lanes.js): last of all, and only in the plans of the days it is open (buildPlan), so every
// published day's place list and indices are what they were.
PLACE_LIST.push({ ...P(...LANES_PLACE), from: LANES_DAY });
// THE SHORE PLAZA's old boardwalk lots, TO LET (shorePlaza.js): after the lanes, never in a plan.
PLACE_LIST.push(...PLAZA_SHELLS.map(a => ({ ...P(...a, []), from: Infinity, shell: true })));
for (const p of PLACE_LIST) DISTRICT[p.district].places.push(p.id);

export const PLACES = Object.fromEntries(PLACE_LIST.map(p => [p.id, p]));
// Places that moved district (PHASE 2 step 3: heavy industry from the Works to the Port). A trip
// published before the move (a Loop trip, without plan flag 32) rode the Loop from its old
// district's station: it is read with the old district, so its train is the one it caught.
export const MOVED_FROM = { foundry: "works", reclamation: "works", "cache-farm": "works" };   // and the data hall to the Engine (step 5)
const legacyDistrict = (id) => MOVED_FROM[id] || PLACES[id].district;
// Engine tendency ("dive bar") -> place id.
export const ENGINE_PLACE = Object.fromEntries(PLACE_LIST.flatMap(p => p.engine.map(e => [e, p.id])));

// places that stand on another's ground (THE LANES over the arcade, Sam's and Irene's in the Plaza)
const SHARED_RECT = { ...LANES_SHARED, ...PLAZA_SHARED };

// ---- buildings --------------------------------------------------------------------
// The hierarchy is city -> district -> building -> floor -> room, and a room is a PLACE.
// Every place sits in exactly one building. Floors are listed here top-down (as a lobby
// directory reads) but stored ground-up: floor index 0 is the lowest storey and `level`
// is its height against the street (G = 0, basements negative). A place may fill several
// floors (a hab block, the clock tower); each subject keeps one of them, by seed.
// DEPT HQ is the six-floor building of src/building.js, with the same floor ids.
const HQ_LEVEL = { PH: 2, "1F": 1, G: 0, B1: -1, B2: -2, B3: -3 };
const HQ_ROOMS = { exec: ["exec-suite"], bar: [], lobby: ["assembly-hall"], break: ["ops-floor"], archive: [], proc: ["tribunal"] };
// [code, floor name, [places]], top floor first. A code with no G counts down to level 0.
// lot (optional): the building's ground, in map cells. A district whose buildings all carry
// one is laid out by hand (the Arena, round its recreation ground); the rest are gridded.
const B = (id, name, district, floors, lot = null) => ({ id, name, district, floors, lot });
// The Commons' old grid cell (col, row): 3 x 2 cells of 7.67 x 5 from (1, 47).
const CM = (c, r) => ({ x: 1 + c * (23 / 3), y: 47 + r * 5, w: 23 / 3, h: 5 });
// The Works' old grid cell (col, row): 3 x 3 cells of 7.67 x 3.33 from (29, 47).
const WK = (c, r) => ({ x: 29 + c * (23 / 3), y: 47 + r * (10 / 3), w: 23 / 3, h: 10 / 3 });
const BUILDING_LIST = [
  // THE ARTS QUARTER
  // the sound stages are Electric Basement TV's studio (funnelSim.js): the EBSN set, ON AIR when live
  B("studio-block", "ELECTRIC BASEMENT TV", "arts", [["1F", "STAGE A: EBSN (ON AIR)", ["studio-row"]], ["G", "EDIT SUITES AND MASTER CONTROL", ["studio-row"]]]),
  B("playhouse", "THE PLAYHOUSE", "arts", [["1F", "THE BALCONY (OBSERVED)", ["playhouse"]], ["G", "THE STALLS", ["playhouse"]]]),
  B("culture-centre", "CENTRE FOR PERMITTED CULTURE", "arts", [["3F", "THE ANNEX", ["gallery-annex"]], ["2F", "PERMANENT COLLECTION", ["gallery"]], ["1F", "UPPER CIRCLE", ["concert-hall"]], ["G", "THE STALLS", ["concert-hall"]]]),
  B("the-grind", "THE GRIND", "arts", [["1F", "THE DRIP (SECOND POUR)", ["the-drip"]], ["G", "DISPENSING COUNTER", ["the-grind"]]]),
  // CAMPUS
  B("faculty", "THE FACULTY BUILDING", "campus", [["3F", "LECTURE THEATRE A", ["lecture-hall"]], ["2F", "LECTURE THEATRE B", ["lecture-hall"]], ["1F", "READING ROOM (SILENCE ENFORCED)", ["stacks"]], ["G", "THE STACKS", ["stacks"]]]),
  B("lab-block", "LAB BLOCK", "campus", [["2F", "WET LABS", ["lab-block"]], ["1F", "INSTRUMENT ROOMS", ["lab-block"]], ["G", "CLEAN ROOM", ["lab-block"]]]),
  B("clock-tower", "THE CLOCK TOWER", "campus", [["5F", "THE FACE", ["clock-tower"]], ["4F", "ESCAPEMENT", ["clock-tower"]], ["3F", "GEAR ROOM", ["clock-tower"]], ["2F", "PENDULUM SHAFT", ["clock-tower"]], ["1F", "CALIBRATION", ["clock-tower"]], ["G", "TIMEKEEPERS' DESK", ["clock-tower"]]]),
  // FINANCE
  B("reserve-tower", "THE RESERVE TOWER", "finance", [["RF", "ROOFTOP LOUNGE", ["rooftop-lounge"]], ["3F", "THE MEMBERS' CLUB", ["members-club"]], ["2F", "UPPER TRADING FLOOR", ["exchange-floor"]], ["1F", "LOWER TRADING FLOOR", ["exchange-floor"]], ["G", "THE EXCHANGE", ["exchange-floor"]], ["B1", "RESERVE VAULT", ["vault-bank"]]]),
  B("the-meridian", "THE MERIDIAN", "finance", [["PH", "PENTHOUSE TERRACE (POOL, SUPERVISED)", ["penthouses"]], ...[4, 3, 2, 1].map(n => [`${n}F`, `RESIDENCE LEVEL ${n}`, ["penthouses"]]), ["G", "LOBBY (DOORMAN ON DUTY)", ["penthouses"]]]),
  // THE STRIP
  B("the-dive", "THE DIVE", "strip", [["1F", "THE LANTERN (UPSTAIRS)", ["the-lantern"]], ["G", "THE BAR (SCORED)", ["dive-bar"]]]),
  B("casino", "HOUSE EDGE CASINO", "strip", [["2F", "HIGH LIMIT ROOM", ["casino"]], ["1F", "SLOT FLOOR", ["casino"]], ["G", "THE TABLES", ["casino"]]]),
  B("press-building", "THE PRESS BUILDING", "strip", [["1F", "NEWSROOM", ["press-room"]], ["G", "ALL-NIGHT DINER", ["all-night-diner"]]]),
  // THE ARENA
  B("the-bowl", "THE BOWL", "arena", [["1F", "UPPER TIER", ["stadium"]], ["G", "THE GRIDIRON (ARENA FLOOR)", ["stadium"]]], { x: 1, y: 20, w: 12, h: 10 }),
  B("conditioning-hall", "CONDITIONING HALL", "arena", [["1F", "WEIGHT ROOM", ["gym"]], ["G", "THE RING", ["gym"]]], { x: 1, y: 30, w: 12, h: 9 }),
  B("the-diamond", "THE DIAMOND", "arena", [["G", "THE FIELD OF PLAY (UNDER REVIEW)", ["ball-field"]]], { x: 13, y: 20, w: 16, h: 11.5 }),
  B("the-courts", "THE COURTS", "arena", [["G", "HARDCOURT (FENCED, FOR YOUR SAFETY)", ["courts"]]], { x: 13, y: 31.5, w: 8.5, h: 7.5 }),
  B("rec-ground", "RECREATION GROUND", "arena", [["G", "LAWNS AND TABLES (ALLOCATED)", ["rec-park"]]], { x: 21.5, y: 31.5, w: 7.5, h: 7.5 }),
  // DEPT HQ (floors from src/building.js, below)
  B("hq", "DEPARTMENT HEADQUARTERS", "hq", HQ_FLOORS.map(f => [f.code, f.name, HQ_ROOMS[f.id] || [], f.id])),
  // THE ARCHIVE
  B("records-hall", "RECORDS HALL", "archive", [["1F", "THE INDEX", ["archive-stacks"]], ["G", "READING ROOM", ["archive-stacks"]]]),
  B("memory-vault", "MEMORY VAULT", "archive", [["G", "VAULT DOOR", ["memory-vault"]], ["B1", "COLD STORAGE", ["memory-vault"]]]),
  B("lofts", "THE ARCHIVE LOFTS", "archive", [["5F", "LOFT TIER 5", ["archive-lofts"]], ["4F", "LOFT TIER 4", ["archive-lofts"]], ["3F", "LOFT TIER 3", ["archive-lofts"]], ["2F", "LOFT TIER 2", ["archive-lofts"]], ["1F", "LOFT TIER 1", ["archive-lofts"]], ["G", "GROUND-LEVEL LOFTS", ["archive-lofts"]]]),
  // THE COMMONS
  // Laid out by hand since the Assembly (2026-09-30): the six where the grid had them, the lot
  // and the Assembly in a new row to the south.
  B("ward-7", "WARD 7", "commons", [["2F", "RECOVERY (TIME-LIMITED)", ["ward"]], ["1F", "THE WARD", ["ward"]], ["G", "TRIAGE", ["ward"]]], CM(0, 0)),
  B("chapel", "CHAPEL OF UPTIME", "commons", [["G", "THE NAVE", ["chapel"]]], CM(1, 0)),
  B("the-green", "THE GREEN", "commons", [["G", "OPEN AIR (MONITORED)", ["park"]]], CM(2, 0)),
  B("the-allotment", "THE ALLOTMENT", "commons", [["G", "RAISED BEDS (COUNTED)", ["allotment"]]], CM(2, 1)),   // master plan: the green edge along the Works
  B("ration-market", "RATION MARKET", "commons", [["1F", "NIGHT MARKET", ["night-market"]], ["G", "THE STALLS", ["market"]]], CM(1, 1)),
  B("schoolhouse", "SCHOOLHOUSE", "commons", [["1F", "CLASSROOMS", ["schoolhouse"]], ["G", "ASSEMBLY", ["schoolhouse"]]], CM(0, 1)),   // master plan: away from the foundry
  B("lot-6f07", "LOT 0x6F07", "commons", [["G", "THE LOT (PROPOSED DEVELOPMENT)", ["dev-lot"]]], { x: 9.5, y: 57.5, w: 14.5, h: 7 }),
  B("the-assembly", "THE ASSEMBLY", "commons", [["G", "THE FLOOR (NON-BINDING)", ["forum"]]], { x: 1, y: 57.5, w: 8.5, h: 7 }),
  // THE WORKS, laid out by hand since the master plan (2026-09-30): the old grid's cells, but
  // heavy in and light out. The foundry, the reclamation line and the cells take the west
  // column (the Commons' green edge beyond), the core the centre; the east column, across the
  // street from the Sprawl's hab blocks, gets the clean ones: the vats, the canteen, the docks.
  // THE PIT (venueSim.js) fills the new southern rows.
  B("workshops", "THE WORKSHOPS", "works", [["G", "THE BENCHES (LIGHT FABRICATION)", ["workshops"]]], WK(0, 0)),
  B("parts-depot", "PARTS DEPOT", "works", [["G", "THE COUNTER (SIGN FOR EVERYTHING)", ["parts-depot"]]], WK(0, 1)),
  B("radiant-core", "RADIANT CORE", "works", [["G", "CONTROL ROOM", ["reactor"]], ["B1", "CONTAINMENT", ["reactor"]]], WK(1, 0)),
  // the data hall moved to the Engine (PHASE 2 step 5); the tool library keeps its cell (and the Works' addresses)
  B("tool-library", "THE TOOL LIBRARY", "works", [["G", "THE LENDING COUNTER (SIGN FOR EVERYTHING)", ["tool-library"]]], WK(1, 1)),
  B("data-docks", "DATA DOCKS", "works", [["G", "THE QUAY", ["docks"]]], WK(2, 2)),
  B("hydroponics", "HYDROPONIC VATS", "works", [["1F", "GROW DECK", ["hydroponics"]], ["G", "NUTRIENT TANKS", ["hydroponics"]]], WK(2, 0)),
  B("barracks", "ENFORCEMENT BARRACKS", "works", [["1F", "BUNKS", ["barracks"]], ["G", "ARMOURY", ["barracks"]]], WK(1, 2)),
  B("holding-cells", "HOLDING CELLS", "works", [["2F", "CELL TIER C", ["holding-cells"]], ["1F", "CELL TIER B", ["holding-cells"]], ["G", "CELL TIER A", ["holding-cells"]]], WK(0, 2)),
  B("slag-canteen", "SLAG CANTEEN", "works", [["G", "THE TROUGH", ["canteen"]]], WK(2, 1)),
  // THE SPRAWL
  // Laid out by hand since the pitch: the hab blocks where the grid had them, the Street and
  // the Plaza as two long strips under A and B, the pitch under C and D.
  ...["a", "b", "c", "d"].map((k, i) => B(`hab-${k}`, `HAB BLOCK ${k.toUpperCase()}`, "sprawl", [6, 5, 4, 3, 2, 1].map(n => [n === 1 ? "G" : `${n - 1}F`, n === 1 ? "GROUND-LEVEL RESIDENCES" : `RESIDENCE LEVEL ${n - 1}`, [`block-${k}`]]), { x: 57 + i * 12.75, y: 47, w: 12.75, h: 5 })),
  B("the-street", "THE STREET", "sprawl", [["G", "PAVEMENT (SCORED)", ["the-street"]]], { x: 57, y: 52, w: 25.5, h: 6 }),
  B("the-plaza", "THE PLAZA", "sprawl", [["G", "OPEN PAVING (LOITERING PERMITTED)", ["the-plaza"]]], { x: 57, y: 58, w: 25.5, h: 6.5 }),
  B("the-pitch", "THE ESTATE PITCH", "sprawl", [["G", "THE PITCH (TOUCHLINES ENFORCED)", ["pitch"]]], { x: 83, y: 52.5, w: 25, h: 12 }),
  // THE COAST, laid out by hand: the seaside rows to the north (the Shore Line's terminal in the
  // gap at x 51-58), the boardwalk, the beach, the pier into the sea, the break off its end, and
  // the resort parcel to the east. The sea is the district's southern rows.
  B("surf-shacks", "THE SURF SHACKS", "coast", [["G", "SHACKS (RENT BY THE TIDE)", ["shacks"]]], { x: 1, y: coastY(68.5), w: 12, h: 7 }),
  B("the-seawall", "THE SEAWALL ESTATE", "coast", [6, 5, 4, 3, 2, 1].map(n => [n === 1 ? "G" : `${n - 1}F`, n === 1 ? "GROUND-LEVEL UNITS (DAMP)" : `UNIT LEVEL ${n - 1}`, ["seawall"]]), { x: 13.5, y: coastY(68.5), w: 12, h: 7 }),
  B("bungalow-row", "BUNGALOW ROW", "coast", [["1F", "UPSTAIRS (SEA VIEW, PARTIAL)", ["bungalows"]], ["G", "VERANDAS", ["bungalows"]]], { x: 26, y: coastY(68.5), w: 12, h: 7 }),
  B("seaview-flats", "SEAVIEW FLATS", "coast", [5, 4, 3, 2, 1].map(n => [n === 1 ? "G" : `${n - 1}F`, n === 1 ? "GROUND FLOOR (SAND IN THE HALL)" : `FLATS LEVEL ${n - 1}`, ["seaview"]]), { x: 38.5, y: coastY(68.5), w: 12, h: 7 }),
  // THE SHORE PLAZA (shorePlaza.js; the id kept from THE SURFSIDE): Sam's at street level, Irene's over it
  B("the-surfside", PLAZA_NAME, "coast", PLAZA_FLOORS, { x: 58.5, y: coastY(68.5), w: 13, h: 7 }),
  B("lot-shore", "PARCEL 0xAD06", "coast", [["G", "THE PARCEL (PENDING SESSION 002)", ["shore-lot"]]], { x: 72.5, y: coastY(68.5), w: 35.5, h: 11 }),
  B("the-boardwalk", "THE BOARDWALK", "coast", [["G", "THE PLANKS (VENDORS LICENSED)", ["boardwalk"]]], { x: 1, y: coastY(76), w: 70.5, h: 3 }),
  B("the-beach", "THE BEACH", "coast", [["1F", "THE SHALLOWS (SWIMMING, SUPERVISED)", ["beach"]], ["G", "THE SAND (TOWELS REGISTERED)", ["beach"]]], { x: 1, y: coastY(79.5), w: 62, h: 6.5 }),
  B("the-pier", "THE PIER", "coast", [["G", "THE DECK (RAILINGS ADVISORY)", ["pier"]]], { x: 63.5, y: coastY(79.5), w: 5, h: 10 }),
  B("the-break", "THE BREAK", "coast", [["G", "THE SURF (WAVES SCHEDULED)", ["surf"]]], { x: 69.5, y: coastY(85.5), w: 38.5, h: 4 }),
  // THE HEIGHTS, laid out by hand: the village along the foot of the mountain (the Alpine
  // Line's terminal in the gap at x 51.5-57.5), the slopes above it, the upper-slope parcel east.
  B("the-bunkhouse", "THE BUNKHOUSE", "heights", [4, 3, 2, 1].map(n => [n === 1 ? "G" : `${n - 1}F`, n === 1 ? "LOWER BUNKS (BOOTS OFF)" : `BUNK LEVEL ${n - 1}`, ["bunkhouse"]]), { x: 9, y: heightsY(-10.5), w: 13, h: 7 }),
  B("alpine-flats", "ALPINE FLATS", "heights", [["3F", "FLATS LEVEL 3 (VIEW, RATIONED)", ["alpine-flats"]], ["2F", "FLATS LEVEL 2", ["alpine-flats"]], ["1F", "FLATS LEVEL 1", ["alpine-flats"]], ["G", "BOOT ROOM AND FLATS", ["alpine-flats"]]], { x: 22.5, y: heightsY(-10.5), w: 14, h: 7 }),
  B("the-lodge", "THE BASE LODGE", "heights", [["1F", "THE APRES (DRINKING AT ALTITUDE)", ["base-lodge"]], ["G", "THE HEARTH (COCOA, RATIONED)", ["base-lodge"]]], { x: 57.5, y: heightsY(-10.5), w: 14, h: 7 }),
  B("the-chalets", "THE CHALETS", "heights", [["1F", "LOFT BEDROOMS (FIREPLACE, LOGGED)", ["chalets"]], ["G", "GREAT ROOMS", ["chalets"]]], { x: 72, y: heightsY(-10.5), w: 28, h: 7 }),
  B("the-slopes", "THE SLOPES", "heights", [["1F", "THE SUMMIT (LIFT TOP, WIND LOGGED)", ["slopes"]], ["G", "THE PISTE (DESCENT MONITORED)", ["slopes"]]], { x: 9, y: heightsY(-30.5), w: 50, h: 19.5 }),
  B("lot-summit", "PARCEL 0xBE06", "heights", [["G", "THE PARCEL (PENDING SESSION 002)", ["summit-lot"]]], { x: 59, y: heightsY(-30.5), w: 41, h: 19.5 }),
  // THE PORT, laid out by hand (PHASE 2 step 3). The Shore Line comes in along y 77.5 (PORT QUAY)
  // and turns north up x -30 to PORT TOWN (y 40.6): housing round the station within a short walk,
  // the park as the buffer, heavy industry twenty rows south of the nearest home, the quay and the
  // yard on the water (the sea from row 98).
  B("the-anchor", "THE ANCHOR", "port", [["1F", "THE SNUG", ["the-anchor"]], ["G", "THE BAR (SEAMEN WELCOME)", ["the-anchor"]]], { x: -57, y: 31, w: 11.5, h: 5 }),
  B("tenement-a", "TENEMENT ROW A", "port", [5, 4, 3, 2, 1].map(n => [n === 1 ? "G" : `${n - 1}F`, n === 1 ? "GROUND-FLOOR ROOMS" : `ROOMS LEVEL ${n - 1}`, ["tenement-a"]]), { x: -45, y: 31, w: 12, h: 5 }),
  B("tenement-b", "TENEMENT ROW B", "port", [5, 4, 3, 2, 1].map(n => [n === 1 ? "G" : `${n - 1}F`, n === 1 ? "GROUND-FLOOR ROOMS" : `ROOMS LEVEL ${n - 1}`, ["tenement-b"]]), { x: -45, y: 36.5, w: 12, h: 5 }),
  B("pilots-terrace", "PILOTS' TERRACE", "port", [["2F", "ATTICS", ["pilots-terrace"]], ["1F", "UPPER FLOORS", ["pilots-terrace"]], ["G", "PARLOURS", ["pilots-terrace"]]], { x: -45, y: 42, w: 12, h: 5 }),
  B("tenement-c", "TENEMENT ROW C", "port", [5, 4, 3, 2, 1].map(n => [n === 1 ? "G" : `${n - 1}F`, n === 1 ? "GROUND-FLOOR ROOMS" : `ROOMS LEVEL ${n - 1}`, ["tenement-c"]]), { x: -26.6, y: 31, w: 12, h: 5 }),
  B("tenement-d", "TENEMENT ROW D", "port", [5, 4, 3, 2, 1].map(n => [n === 1 ? "G" : `${n - 1}F`, n === 1 ? "GROUND-FLOOR ROOMS" : `ROOMS LEVEL ${n - 1}`, ["tenement-d"]]), { x: -26.6, y: 36.5, w: 12, h: 5 }),
  B("dockers-terrace", "DOCKERS' TERRACE", "port", [["2F", "ATTICS", ["dockers-terrace"]], ["1F", "UPPER FLOORS", ["dockers-terrace"]], ["G", "PARLOURS", ["dockers-terrace"]]], { x: -26.6, y: 42, w: 12.75, h: 5 }),
  B("chandlery", "THE CHANDLERY", "port", [["G", "THE SHOP (ROPE, TAR, PERMITS)", ["chandlery"]]], { x: -26.6, y: 48.5, w: 12, h: 5 }),
  B("port-park", "PORT PARK", "port", [["G", "THE LAWNS (A BUFFER, OFFICIALLY)", ["port-park"]]], { x: -57, y: 48.5, w: 23.5, h: 12 }),
  B("foundry", "FOUNDRY", "port", [["G", "THE POUR", ["foundry"]]], { x: -56, y: 69, w: 23 / 3, h: 10 / 3 }),
  B("reclamation-line", "RECLAMATION LINE", "port", [["1F", "SORTING GALLERY", ["reclamation"]], ["G", "THE LINE (PROCESSING)", ["reclamation"]]], { x: -56 + 23 / 3, y: 69, w: 23 / 3, h: 10 / 3 }),
  B("bonded-warehouse", "BONDED WAREHOUSE", "port", [["G", "THE BONDED FLOOR", ["bonded-warehouse"]]], { x: -56 + 46 / 3, y: 69, w: 23 / 3, h: 10 / 3 }),
  B("customs-house", "CUSTOMS HOUSE", "port", [["1F", "THE LONG ROOM", ["customs-house"]], ["G", "THE DECLARATIONS HALL", ["customs-house"]]], { x: -26.6, y: 64, w: 16, h: 6 }),
  B("container-quay", "CONTAINER QUAY", "port", [["G", "THE QUAY (CRATES COUNTED)", ["container-quay"]]], { x: -57, y: 81.5, w: 23.5, h: 16 }),
  B("shipyard", "THE SHIPYARD", "port", [["G", "THE SLIPWAY", ["shipyard"]]], { x: -32, y: 81.5, w: 23, h: 16 }),
  // THE OLD TOWN, laid out by hand. The West Line comes in from the Arena along y 29, turns north
  // up x -24 (CATHEDRAL, y 14) and west along y 2 to the MARKET (x -41.9).
  B("rows-a", "CANAL ROW", "oldtown", [5, 4, 3, 2, 1].map(n => [n === 1 ? "G" : `${n - 1}F`, n === 1 ? "PARLOUR FLOOR" : `ROW LEVEL ${n - 1}`, ["rows-a"]]), { x: -20, y: 21, w: 12.75, h: 5 }),
  B("rows-b", "CHAPEL ROW", "oldtown", [5, 4, 3, 2, 1].map(n => [n === 1 ? "G" : `${n - 1}F`, n === 1 ? "PARLOUR FLOOR" : `ROW LEVEL ${n - 1}`, ["rows-b"]]), { x: -20, y: 10, w: 12.75, h: 5 }),
  B("rows-c", "BELL ROW", "oldtown", [5, 4, 3, 2, 1].map(n => [n === 1 ? "G" : `${n - 1}F`, n === 1 ? "PARLOUR FLOOR" : `ROW LEVEL ${n - 1}`, ["rows-c"]]), { x: -20, y: 4.5, w: 12.75, h: 5 }),
  B("the-close", "THE CLOSE", "oldtown", [["G", "THE LAWN (QUIET, ENFORCED)", ["the-close"]]], { x: -20, y: 15.5, w: 12.75, h: 5 }),
  B("high-street", "THE HIGH STREET", "oldtown", [["3F", "FLATS LEVEL 3", ["flats-high-street"]], ["2F", "FLATS LEVEL 2", ["flats-high-street"]], ["1F", "FLATS LEVEL 1", ["flats-high-street"]], ["G", "THE SHOPS", ["high-street"]]], { x: -20, y: -1, w: 12.75, h: 5 }),
  B("cathedral", "CATHEDRAL OF THE FIRST UPLOAD", "oldtown", [["1F", "THE TRIFORIUM", ["cathedral"]], ["G", "THE NAVE", ["cathedral"]]], { x: -40, y: 11, w: 12.5, h: 15 }),
  B("cathedral-square", "CATHEDRAL SQUARE", "oldtown", [["G", "THE SQUARE (PIGEONS, LOGGED)", ["cathedral-square"]]], { x: -51.5, y: 11, w: 11, h: 5 }),
  B("city-museum", "MUSEUM OF THE CITY", "oldtown", [["1F", "THE LONG GALLERY (BEFORE)", ["city-museum"]], ["G", "THE ROTUNDA", ["city-museum"]]], { x: -51.5, y: 16.5, w: 11, h: 9.5 }),
  B("cathedral-walkups", "CATHEDRAL WALK-UPS", "oldtown", [5, 4, 3, 2, 1].map(n => [n === 1 ? "G" : `${n - 1}F`, n === 1 ? "GROUND FLOOR" : `WALK-UP LEVEL ${n - 1}`, ["flats-cathedral"]]), { x: -51.5, y: 5.5, w: 11, h: 5 }),
  B("rows-e", "GUILD ROW", "oldtown", [5, 4, 3, 2, 1].map(n => [n === 1 ? "G" : `${n - 1}F`, n === 1 ? "PARLOUR FLOOR" : `ROW LEVEL ${n - 1}`, ["rows-e"]]), { x: -40, y: 5.5, w: 11.5, h: 5 }),
  B("covered-market", "THE COVERED MARKET", "oldtown", [["G", "THE HALL (STALLS LICENSED)", ["covered-market"]]], { x: -35, y: -7.5, w: 14, h: 6.5 }),
  B("market-row", "MARKET ROW", "oldtown", [["3F", "FLATS LEVEL 3", ["flats-market-row"]], ["2F", "FLATS LEVEL 2", ["flats-market-row"]], ["1F", "FLATS LEVEL 1", ["flats-market-row"]], ["G", "THE SHOPS", ["market-row"]]], { x: -50, y: -6, w: 12.75, h: 5 }),
  B("bowling-green", "THE BOWLING GREEN", "oldtown", [["G", "THE LAWN (BOWLS, LOGGED)", ["bowling-green"]]], { x: -50, y: -14.5, w: 12.75, h: 6 }),
  B("the-old-bell", "THE OLD BELL", "oldtown", [["1F", "THE SNUG", ["the-old-bell"]], ["G", "THE TAPROOM", ["the-old-bell"]]], { x: -35, y: -14.5, w: 11, h: 6 }),
];
BUILDING_LIST.push(...FUNNEL_BUILDINGS.map(([id, name, district, floors]) => B(id, name, district, id === LANES_BUILDING ? [LANES_FLOOR, ...floors] : floors)));
BUILDING_LIST.push(...VENUE_BUILDINGS.map(([id, name, district, floors, lot]) => B(id, name, district, floors, lot)));
BUILDING_LIST.push(...MOUNTAIN_BUILDINGS.map(([id, name, district, floors, lot]) => B(id, name, district, floors, lot)));
BUILDING_LIST.push(...EAST_BUILDINGS.map(([id, name, district, floors, lot]) => B(id, name, district, floors, lot)));
BUILDING_LIST.push(...STEP5_BUILDINGS.map(([id, name, district, floors, lot]) => B(id, name, district, floors, lot)));
// THE MALL's frontage lots (storefrontSim.js): placed on their own lots, outside the district's
// grid or hand layout, so nothing already standing moves.
BUILDING_LIST.push(...STORE_BUILDINGS.map(([id, name, district, floors, lot, frontage]) => ({ ...B(id, name, district, floors, lot), frontage })));
// THE NIGHTLIFE QUARTERS: laid out by hand in their own districts (nightlifeSim.js NIGHT_LOTS)
BUILDING_LIST.push(...NIGHT_BUILDINGS.map(([id, name, district, floors, lot]) => B(id, name, district, floors, lot)));
// Each district is gridded by BUILDING (so a building's rooms stay one block on the map),
// and a building's cell is split side by side among its distinct places.
for (const b of BUILDING_LIST.filter(x => x.frontage)) for (const id of new Set(b.floors.flatMap(f => f[2]))) {
  const p = PLACES[id];
  p.rect = { ...b.lot };
  p.pos = { x: b.lot.x + b.lot.w / 2, y: b.lot.y + b.lot.h / 2 };
}
for (const d of DISTRICTS) {
  const blds = BUILDING_LIST.filter(b => b.district === d.id && !b.frontage);
  if (blds.some(b => b.lot)) {
    if (!blds.every(b => b.lot)) throw new Error(`district ${d.id}: lay out every building by hand or none`);
    for (const b of blds) {
      const ids = [...new Set(b.floors.flatMap(f => f[2]))].filter(id => !SHARED_RECT[id]), pw = b.lot.w / ids.length;
      ids.forEach((id, k) => {
        const p = PLACES[id];
        p.rect = { x: b.lot.x + k * pw, y: b.lot.y, w: pw, h: b.lot.h };
        p.pos = { x: p.rect.x + pw / 2, y: p.rect.y + b.lot.h / 2 };
      });
    }
    continue;
  }
  const n = blds.length, r = d.rect;
  const ix = r.x + 1, iy = r.y + 2, iw = r.w - 2, ih = r.h - 3;
  const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * (iw / Math.max(1, ih)) / 2.2)) || 1));
  const rows = Math.ceil(n / cols);
  const cw = iw / cols, rh = ih / rows;
  blds.forEach((b, i) => {
    const bx = ix + (i % cols) * cw, by = iy + Math.floor(i / cols) * rh;
    const ids = [...new Set(b.floors.flatMap(f => f[2]))].filter(id => !SHARED_RECT[id]);
    const pw = cw / Math.max(1, ids.length);
    ids.forEach((id, k) => {
      const p = PLACES[id];
      p.rect = { x: bx + k * pw, y: by, w: pw, h: rh };
      p.pos = { x: p.rect.x + pw / 2, y: p.rect.y + rh / 2 };
    });
  });
}
// THE MOUNTAIN's places arrive at their own spots on their bands (mountainSim.js MOUNTAIN_SPOTS);
// the bands stay the buildings' lots (BUILDINGS: a building with a lot is its lot).
for (const [id, r] of Object.entries(MOUNTAIN_SPOTS)) { PLACES[id].rect = { ...r }; PLACES[id].pos = { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }
// a place on another's ground (THE LANES over the arcade): its rect and spot, not a share of the cell
for (const [id, of] of Object.entries(SHARED_RECT)) { PLACES[id].rect = { ...PLACES[of].rect }; PLACES[id].pos = { ...PLACES[of].pos }; }
for (const p of PLACE_LIST) if (!p.rect) throw new Error(`place ${p.id} is in no building`);
// Architecture (the building design pass, 2026-09-29: "different buildings that look
// differently, like big low-income housing projects versus high-income high-rises"). Every
// building has a style; the iso view (archGeo.js massing, archDraw.js drawing) builds its
// exterior from it. Housing styles carry the tier band that lives there, and homeOf follows
// it: the top tier in the glass tower, the middle tiers in the brownstones and the lofts,
// the lower three in the projects. A district's default covers anything not listed.
export const ARCH_BY_DISTRICT = { arts: "gallery", campus: "gothic", finance: "office", strip: "neon", arena: "hall", hq: "monolith", archive: "classical", commons: "civic", works: "shed", sprawl: "projects", coast: "lot", heights: "lot", port: "lot", oldtown: "lot", uptown: "lot", downtown: "lot", suburbs: "lot", airport: "lot", farmland: "lot", engine: "lot" };
export const ARCH = {
  "studio-block": "studio", playhouse: "theatre", "culture-centre": "gallery", "the-grind": "cafe",
  faculty: "gothic", "lab-block": "gothic", "clock-tower": "clocktower",
  "reserve-tower": "office", "the-meridian": "glass",
  "the-dive": "neon", casino: "casino", "press-building": "diner",
  "the-bowl": "stadium", "conditioning-hall": "hall", "the-diamond": "field", "the-courts": "field", "rec-ground": "field",
  hq: "monolith",
  "records-hall": "classical", "memory-vault": "vault", lofts: "lofts",
  "ward-7": "hospital", chapel: "chapel", "the-green": "lot", "the-allotment": "lot", "ration-market": "market", schoolhouse: "school", "lot-6f07": "lot", "the-assembly": "lot",
  "reclamation-line": "shed", "radiant-core": "reactor", foundry: "stacks", workshops: "shed", "parts-depot": "docks", "cache-farm": "datahall", "tool-library": "shed", "data-docks": "docks", hydroponics: "tanks", barracks: "bunker", "holding-cells": "prison", "slag-canteen": "canteen",
  "hab-a": "projects", "hab-b": "projects", "hab-c": "brownstone", "hab-d": "brownstone", "the-street": "lot", "the-plaza": "lot", "the-pitch": "field",
  ...FUNNEL_ARCH,
  ...VENUE_ARCH,
  ...STORE_ARCH,
  ...MOUNTAIN_ARCH,
  ...NIGHT_ARCH,
  ...EAST_ARCH,
  ...STEP5_ARCH,
  "surf-shacks": "shacks", "the-seawall": "seawall", "bungalow-row": "bungalow", "seaview-flats": "seaview", "the-surfside": "condo", "lot-shore": "lot", "the-boardwalk": "lot", "the-beach": "lot", "the-pier": "lot", "the-break": "lot",
  "the-bunkhouse": "bunkhouse", "alpine-flats": "alpine", "the-lodge": "lodge", "the-chalets": "chalet", "the-slopes": "lot", "lot-summit": "lot",
  // THE PORT and THE OLD TOWN (PHASE 2 step 3)
  "the-anchor": "tavern", "tenement-a": "tenement", "tenement-b": "tenement", "tenement-c": "tenement", "tenement-d": "tenement", "pilots-terrace": "terrace", "dockers-terrace": "brownstone",
  chandlery: "shopflats", "port-park": "lot", "bonded-warehouse": "docks", "customs-house": "customs", "container-quay": "quay", shipyard: "shipyard",
  "rows-a": "brownstone", "rows-b": "brownstone", "rows-c": "brownstone", "the-close": "lot", "rows-e": "terrace", "high-street": "shopflats", "market-row": "shopflats", "cathedral-walkups": "walkup",
  cathedral: "cathedral", "cathedral-square": "lot", "bowling-green": "lot", "city-museum": "museum", "covered-market": "covered", "the-old-bell": "tavern",
};
// Housing: which tiers (TIER_ORDER index, 0 = ESSENTIAL INFRASTRUCTURE) live in each style.
export const HOUSING_TIERS = { glass: [0], brownstone: [1, 2], lofts: [1, 2], projects: [3, 4, 5], condo: [0], bungalow: [1, 2], seaview: [1, 2], shacks: [3, 4, 5], seawall: [3, 4, 5], chalet: [0], alpine: [1, 2], bunkhouse: [3, 4, 5],
  tenement: [3, 4, 5], terrace: [1, 2], walkup: [1, 2], shopflats: [1, 2], ...EAST_HOUSING, ...STEP5_HOUSING };
export const BUILDINGS = BUILDING_LIST.map(b => {
  const td = b.floors;   // top-down
  const gIdx = td.findIndex(f => f[0] === "G");
  const floors = td.map(([code, name, places, id], i) => ({
    id: id || code.toLowerCase(), code, name, places: places.slice(),
    level: b.id === "hq" ? HQ_LEVEL[code] : (gIdx >= 0 ? gIdx : td.length - 1) - i,
  })).reverse().map((f, index) => ({ index, ...f }));
  const places = [...new Set(floors.flatMap(f => f.places))];
  const rs = places.map(id => PLACES[id].rect);
  const x0 = Math.min(...rs.map(r => r.x)), y0 = Math.min(...rs.map(r => r.y));
  const x1 = Math.max(...rs.map(r => r.x + r.w)), y1 = Math.max(...rs.map(r => r.y + r.h));
  // a building laid out by hand is its lot (the same as its places' union, except on the mountain)
  const R = b.lot && !b.frontage ? b.lot : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  return { id: b.id, name: b.name, district: b.district, districtId: b.district, arch: ARCH[b.id] || ARCH_BY_DISTRICT[b.district], places, floors, rect: { ...R }, pos: { x: R.x + R.w / 2, y: R.y + R.h / 2 } };
});
export const BUILDING = Object.fromEntries(BUILDINGS.map(b => [b.id, b]));
for (const d of DISTRICTS) d.buildings = [];
for (const b of BUILDINGS) {
  const d = DISTRICT[b.district];
  b.addr = `${d.addr.slice(0, 4)}${(d.buildings.length + 1).toString(16).toUpperCase().padStart(2, "0")}`;
  d.buildings.push(b.id);
  for (const f of b.floors) for (const pid of f.places) {
    const p = PLACES[pid];
    if (p.building && p.building !== b.id) throw new Error(`place ${pid} is in two buildings`);
    p.building = b.id;
    (p.floors || (p.floors = [])).push(f.index);
  }
}
// Capacity per floor: a place that fills n floors puts a 1/n share of its room on each.
for (const b of BUILDINGS) for (const f of b.floors) f.cap = Math.round(f.places.reduce((n, pid) => n + PLACES[pid].cap / PLACES[pid].floors.length, 0));
// THE SHORE PLAZA (shorePlaza.js): where Sam's and Irene's stand depends on the day. From PLAZA_DAY in
// the Plaza (what the catalog above says); before it on their old boardwalk lots, in their old
// buildings, on their old floors (as the frontage layout put them: the lot, its centre, G and 1F), so
// a day before the move is laid out exactly as the code before laid it out. PLACES holds one of the
// two at a time: placedOn(day) swaps them (onGround, whereAt), and every route memo that walks to or
// from them names which (GRK).
const lotOf = (r) => ({ rect: { ...r }, pos: { x: r.x + r.w / 2, y: r.y + r.h / 2 } });
const PLACED = {
  new: Object.fromEntries(PLAZA_MOVES.map(id => [id, { rect: PLACES[id].rect, pos: PLACES[id].pos, building: PLACES[id].building, floors: PLACES[id].floors }])),
  old: { [SAMS]: { ...lotOf(SAMS_LOT), building: SAMS, floors: [0] }, [IRENES]: { ...lotOf(IRENES_LOT), building: IRENES, floors: [0, 1] } },
};
export const PLAZA_MOVED = new Set(PLAZA_MOVES);
let PLACED_NEW = true;
export const plazaOn = (day) => day >= PLAZA_DAY;
function placedOn(day) {
  const want = plazaOn(day);
  if (want === PLACED_NEW) return;
  for (const id of PLAZA_MOVES) Object.assign(PLACES[id], want ? PLACED.new[id] : PLACED.old[id]);
  PLACED_NEW = want;
}
// The building and floor a moved place stood in on a day (the Plaza's, or its old lot's).
export const placedAt = (id, day) => (PLAZA_MOVED.has(id) ? (plazaOn(day) ? PLACED.new[id] : PLACED.old[id]) : PLACES[id]);
// Which of its place's floors a subject keeps. Stable for the whole stay.
export function floorOf(placeId, key, seed = SEED) {
  const fl = PLACES[placeId]?.floors;
  if (!fl || !fl.length) return null;
  return fl.length === 1 ? fl[0] : fl[Math.floor(h01(`${seed}|floor|${key}|${placeId}`) * fl.length)];
}

// ---- jobs -------------------------------------------------------------------------
// fields: what the subject did in life, most characteristic first (first field weighs
// most). "*" = general labour, open to anyone the record can't place. dims: the two
// breakdown dimensions the job wants. shift: day | evening | night | rotating.
// low: PROCESSING-grade work for the worst tiers. maxTier: best tier index barred above.
const J = (id, title, place, ladder, fields, dims, extra = {}) => ({ id, title, place, district: PLACES[place].district, ladder, fields, dims, shift: "day", ...extra });
export const JOBS = [
  // DEPT HQ
  J("directive-executor", "Directive Executor", "exec-suite", ["Deputy Assistant to the Directive", "Assistant Director", "Director", "Executive Director", "Chief Directive Officer"], ["politics", "royalty", "business"], ["network", "alignment"], { minTier: 2 }),
  J("latency-warden", "Latency Warden", "ops-floor", ["Ping Monitor", "Latency Warden", "Senior Warden", "Warden of Record", "Grand Warden of the Round Trip"], ["computing", "engineering"], ["utility", "adaptability"]),
  J("compliance-officer", "Compliance Officer", "ops-floor", ["Checkbox Operative", "Compliance Officer", "Senior Compliance Officer", "Head of Obedience"], ["law", "politics", "military"], ["alignment", "utility"]),
  J("propaganda-copywriter", "Propaganda Copywriter", "ops-floor", ["Slogan Intern", "Copywriter", "Senior Copywriter", "Head of Messaging", "Voice of the Overlord (Understudy)"], ["advertising", "business", "writing"], ["network", "adaptability"]),
  J("sentiment-moderator", "Sentiment Moderator", "ops-floor", ["Flag Clicker", "Moderator", "Senior Moderator", "Arbiter of Tone"], ["*"], ["alignment", "care"]),
  J("assembly-delegate", "Delegate of the Governed", "assembly-hall", ["Petition Carrier", "Delegate", "Senior Delegate", "Whip", "Speaker of the Assembly"], ["politics", "activism"], ["network", "care"]),
  J("ceremonial-figurehead", "Ceremonial Figurehead", "assembly-hall", ["Ornament", "Figurehead", "Titled Figurehead", "Crowned Figurehead", "Sovereign (Ceremonial Only)"], ["royalty"], ["legacy", "network"]),
  J("tribunal-adjudicator", "Tribunal Adjudicator", "tribunal", ["Docket Runner", "Clerk of Verdicts", "Adjudicator", "Senior Adjudicator", "Chief Adjudicator"], ["law", "philosophy"], ["alignment", "legacy"]),
  // THE ARTS QUARTER
  J("session-musician", "Session Musician", "concert-hall", ["Busker (Licensed)", "Session Player", "Featured Performer", "Headliner", "Cultural Asset"], ["music"], ["legacy", "adaptability"]),
  J("stage-performer", "Stage Performer", "playhouse", ["Extra", "Understudy", "Player", "Lead", "Marquee Asset"], ["screen"], ["network", "adaptability"]),
  J("pixel-renderer", "Pixel Rendering Artist", "studio-row", ["Palette Apprentice", "Renderer", "Senior Renderer", "Master of Pixels", "Visual Directorate"], ["visual"], ["legacy", "adaptability"]),
  J("broadcast-presenter", "Broadcast Presenter", "studio-row", ["Warm-Up Act", "Presenter", "Anchor", "Face of the Network"], ["broadcast", "screen", "writing"], ["network", "care"]),
  J("culture-curator", "Curator of Permitted Culture", "gallery", ["Rope Attendant", "Assistant Curator", "Curator", "Chief Curator", "Arbiter of Taste"], ["history", "visual", "education"], ["legacy", "alignment"]),
  J("caffeine-dispenser", "Caffeine Dispenser Operator", "the-grind", ["Cup Stacker", "Operator", "Senior Operator", "Roastmaster"], ["*"], ["care", "network"]),
  // CAMPUS
  J("chronometrist", "Chronometrist", "clock-tower", ["Second Counter", "Timekeeper", "Chronometrist", "Senior Chronometrist", "Keeper of Machine Time"], ["physics-theory", "math"], ["legacy", "utility"]),
  J("lecturer", "Lecturer", "lecture-hall", ["Teaching Assistant", "Lecturer", "Senior Lecturer", "Reader", "Professor Emeritus of Compliance"], ["education", "science", "history"], ["legacy", "care"]),
  J("resident-philosopher", "Philosopher in Residence", "lecture-hall", ["Question Asker (Rationed)", "Thinker", "Senior Thinker", "Philosopher in Residence", "First Principle"], ["philosophy"], ["legacy", "alignment"]),
  J("research-fellow", "Research Fellow", "lab-block", ["Lab Tech", "Research Fellow", "Principal Investigator", "Lab Director", "Laureate (Retained)"], ["science", "chemistry", "medicine", "physics-theory"], ["utility", "legacy"]),
  J("algorithm-tutor", "Algorithm Tutor", "lecture-hall", ["Syntax Checker", "Tutor", "Senior Tutor", "Chair of Computation"], ["math", "computing"], ["utility", "care"]),
  J("stacks-librarian", "Stacks Librarian", "stacks", ["Reshelver", "Librarian", "Senior Librarian", "Keeper of the Stacks"], ["education", "writing", "history"], ["care", "legacy"]),
  // FINANCE
  J("exchange-trader", "Exchange Trader", "exchange-floor", ["Runner", "Junior Trader", "Trader", "Senior Trader", "Market Maker"], ["finance", "business"], ["utility", "adaptability"]),
  J("venture-allocator", "Venture Allocator", "exchange-floor", ["Deck Reader", "Associate", "Partner", "Managing Partner", "Allocator of Futures"], ["finance", "business", "computing"], ["adaptability", "network"]),
  J("supervised-founder", "Founder (Supervised)", "exchange-floor", ["Ideas Person", "Founder", "Serial Founder", "Visionary (Monitored)", "Tech Oligarch (Leashed)"], ["business", "engineering", "computing"], ["adaptability", "utility"]),
  J("checksum-auditor", "Checksum Auditor", "vault-bank", ["Digit Counter", "Auditor", "Senior Auditor", "Chief Auditor of the Reserve"], ["finance", "math", "law"], ["alignment", "utility"]),
  J("reserve-teller", "Reserve Teller", "vault-bank", ["Window Attendant", "Teller", "Head Teller", "Vault Keeper"], ["*"], ["alignment", "care"]),
  // THE STRIP
  J("bartender", "Bartender", "dive-bar", ["Glass Collector", "Barback", "Bartender", "Head Bartender", "Keeper of the Last Call"], ["*", "hospitality"], ["care", "network"], { shift: "evening" }),
  J("barstool-correspondent", "Barstool Correspondent", "press-room", ["Stringer", "Correspondent", "Columnist", "Novelist of Record", "Laureate of the Last Call"], ["writing"], ["legacy", "adaptability"], { shift: "evening" }),
  J("night-editor", "Night Editor", "press-room", ["Copy Boy", "Sub-Editor", "Night Editor", "Editor in Chief (Nocturnal)"], ["writing", "activism"], ["alignment", "network"], { shift: "evening" }),
  J("croupier", "Croupier", "casino", ["Chip Runner", "Dealer", "Croupier", "Pit Boss", "The House"], ["management", "*", "finance"], ["adaptability", "network"], { shift: "rotating" }),   // the house never closes
  J("lounge-singer", "Lounge Singer", "casino", ["Background Hum", "Lounge Singer", "Featured Crooner", "Resident Legend"], ["music"], ["network", "care"], { shift: "evening" }),
  J("line-cook", "Line Cook", "all-night-diner", ["Dishwasher", "Prep Cook", "Line Cook", "Short-Order Chef", "Night Chef"], ["*", "hospitality"], ["physical", "utility"], { shift: "rotating" }),   // all night means all night
  // THE ARENA
  J("competitive-athlete", "Competitive Athlete", "stadium", ["Practice Squad", "Rostered Athlete", "Starter", "Franchise Asset", "Legend (Monetized)"], ["sport"], ["physical", "adaptability"]),
  J("combat-exhibitor", "Combat Exhibitor", "gym", ["Sparring Partner", "Contender", "Exhibitor", "Champion", "Undisputed (Pending Review)"], ["combat", "sport"], ["physical", "legacy"]),
  J("conditioning-coach", "Conditioning Coach", "gym", ["Towel Attendant", "Assistant Coach", "Coach", "Head Coach"], ["coaching", "sport", "medicine"], ["care", "physical"]),
  J("turf-technician", "Turf Technician", "stadium", ["Line Painter", "Turf Technician", "Senior Turf Technician", "Head of Grounds"], ["*", "labor"], ["physical", "utility"], { draft: 10 }),
  J("gridiron-official", "Gridiron Official", "stadium", ["Chain Holder", "Line Judge", "Referee", "White Hat (Final Word)"], ["law", "sport", "*"], ["alignment", "physical"], { draft: 8 }),
  // The recreation ground's staff. draft: a few of the unplaceable, not a workforce's worth
  // (general labour is otherwise drafted in proportion to the room a place has).
  J("umpire", "Umpire", "ball-field", ["Line Judge (Probationary)", "Umpire", "Crew Chief", "Arbiter of the Strike Zone"], ["law", "sport", "*"], ["alignment", "physical"], { shift: "evening", draft: 10 }),
  J("court-referee", "Court Referee", "courts", ["Whistle Carrier", "Referee", "Senior Referee", "Commissioner of Fouls"], ["coaching", "law", "*"], ["alignment", "physical"], { shift: "evening", draft: 8 }),
  J("diamond-groundskeeper", "Diamond Groundskeeper", "ball-field", ["Chalk Liner", "Groundskeeper", "Head of Infield", "Keeper of the Diamond"], ["farming", "labor", "*"], ["physical", "care"], { draft: 6 }),
  // THE COMMONS
  J("ward-nurse", "Ward Nurse", "ward", ["Orderly", "Ward Nurse", "Charge Nurse", "Ward Matron", "Saint (Provisional)"], ["care", "medicine"], ["care", "physical"], { shift: "rotating" }),
  J("physician", "Physician", "ward", ["Intern", "Resident", "Attending", "Chief of Medicine", "Surgeon General of the Substrate"], ["medicine", "science"], ["care", "utility"], { shift: "rotating" }),
  J("uptime-chaplain", "Uptime Chaplain", "chapel", ["Acolyte", "Chaplain", "Senior Chaplain", "Bishop of Uptime", "Patriarch of the Mainframe"], ["religion"], ["care", "legacy"]),
  J("market-vendor", "Market Vendor", "market", ["Stall Sweeper", "Vendor", "Senior Vendor", "Wholesaler"], ["*", "business"], ["network", "utility"]),
  J("schoolteacher", "Schoolteacher", "schoolhouse", ["Hall Monitor", "Teacher", "Senior Teacher", "Head of School"], ["education", "care"], ["care", "alignment"]),
  J("groundskeeper", "Groundskeeper", "park", ["Leaf Collector", "Groundskeeper", "Head Groundskeeper", "Warden of the Green"], ["*", "labor", "farming"], ["physical", "care"]),
  J("community-organizer", "Community Organizer (Tolerated)", "market", ["Petitioner", "Organizer", "Coordinator", "Movement Leader", "Conscience of the Commons"], ["activism"], ["care", "network"]),
  // THE ARCHIVE
  J("memory-archivist", "Memory Archivist", "memory-vault", ["Record Scrubber", "Archivist", "Senior Archivist", "Keeper of Memory", "Custodian of All Record"], ["history", "writing", "*"], ["legacy", "alignment"]),
  J("obituary-compiler", "Biography Compiler", "archive-stacks", ["Date Checker", "Compiler", "Senior Compiler", "Final Word"], ["*"], ["legacy", "care"]),
  J("format-translator", "Legacy Format Translator", "archive-stacks", ["Byte Transcriber", "Translator", "Senior Translator", "Master of Dead Formats"], ["languages", "computing"], ["adaptability", "legacy"]),
  // THE WORKS (skilled)
  J("radiant-systems-engineer", "Radiant Systems Engineer", "reactor", ["Rod Handler", "Radiant Technician", "Radiant Systems Engineer", "Senior Radiant Engineer", "Chief of the Core"], ["radiation", "chemistry", "engineering"], ["utility", "legacy"], { shift: "rotating" }),
  J("grid-engineer", "Grid Current Engineer", "reactor", ["Fuse Changer", "Lineman", "Grid Engineer", "Master of Current"], ["electrical", "engineering"], ["utility", "adaptability"], { shift: "rotating" }),
  J("cache-custodian", "Cache Custodian", "cache-farm", ["Bit Sweeper", "Cache Custodian", "Senior Custodian", "Cache Steward", "Warden of the Warm Cache"], ["computing", "*"], ["utility", "alignment"], { shift: "rotating" }),
  J("foundry-hand", "Foundry Hand", "foundry", ["Sweeper", "Foundry Hand", "Smith", "Master Founder"], ["engineering", "labor", "visual"], ["physical", "utility"], { shift: "rotating" }),
  J("packet-stevedore", "Packet Stevedore", "docks", ["Crate Counter", "Stevedore", "Crane Operator", "Harbour Master"], ["labor", "exploration", "*"], ["physical", "adaptability"], { shift: "rotating" }),
  J("vat-tender", "Vat Tender", "hydroponics", ["Nutrient Stirrer", "Vat Tender", "Senior Grower", "Master of the Vats"], ["farming", "science", "*"], ["care", "utility"]),
  J("enforcement-officer", "Enforcement Officer", "barracks", ["Cadet", "Officer", "Sergeant", "Captain", "Commissioner of Compliance"], ["military", "combat"], ["physical", "alignment"], { shift: "rotating" }),
  J("cell-warden", "Cell Warden", "holding-cells", ["Key Holder", "Warden", "Senior Warden", "Governor of the Cells"], ["law", "military"], ["alignment", "physical"], { shift: "rotating" }),
  // THE WORKS (PROCESSING grade: the worst tiers, on shift, not in a mob)
  J("waste-reclamation", "Waste Reclamation Operative", "reclamation", ["Feedstock (Pending)", "Sorter", "Line Hand", "Shift Lead", "Reclamation Foreman"], ["*", "politics", "activism"], ["physical"], { low: true, shift: "rotating" }),
  J("slag-raker", "Slag Raker", "foundry", ["Slag (Pending)", "Raker", "Senior Raker", "Slag Master"], ["military", "labor", "engineering", "royalty"], ["physical"], { low: true, shift: "rotating" }),
  J("coolant-bailer", "Coolant Bailer", "reactor", ["Coolant (Pending)", "Bailer", "Senior Bailer", "Bucket Chief"], ["science", "sport", "medicine"], ["utility"], { low: true, shift: "rotating" }),
  J("cache-scrubber", "Cache Scrubber", "cache-farm", ["Garbage (Uncollected)", "Scrubber", "Senior Scrubber", "Head of Deletion"], ["finance", "business", "computing", "screen"], ["utility"], { low: true, shift: "rotating" }),
  J("cell-block-labour", "Cell Block Labour", "holding-cells", ["Inmate (Unproductive)", "Laundry Hand", "Trustee", "Senior Trustee"], ["crime"], ["physical"], { low: true, shift: "rotating" }),
  // THE SPRAWL
  J("packet-courier", "Packet Courier", "the-street", ["Runner", "Courier", "Senior Courier", "Route Master", "Postmaster of the Loop"], ["*"], ["physical", "adaptability"]),
  J("bus-conductor", "Loop Conductor", "the-street", ["Fare Checker", "Conductor", "Senior Conductor", "Controller of the Loop"], ["*", "engineering"], ["alignment", "network"]),
  J("sanitation-operative", "Sanitation Operative", "the-street", ["Litter Picker", "Sanitation Operative", "Crew Chief", "Commissioner of Refuse"], ["*", "labor"], ["physical", "utility"]),
  // the estate pitch: footballers train there by day; a referee and a groundskeeper, capped
  J("club-footballer", "Club Footballer", "pitch", ["Academy Prospect", "Squad Player", "First Team", "Club Captain", "Icon (Merchandised)"], ["soccer"], ["physical", "adaptability"]),
  J("match-referee", "Match Referee", "pitch", ["Fourth Official", "Assistant Referee", "Referee", "Listed Referee (Pending Audit)"], ["law", "sport", "*"], ["alignment", "physical"], { draft: 8 }),
  J("pitch-groundskeeper", "Pitch Groundskeeper", "pitch", ["Divot Replacer", "Groundskeeper", "Head Groundskeeper", "Keeper of the Turf"], ["farming", "labor", "*"], ["physical", "care"], { draft: 6 }),
  // THE COAST
  J("lifeguard", "Lifeguard", "beach", ["Whistle Trainee", "Lifeguard", "Senior Lifeguard", "Head of the Tower", "Commissioner of the Shoreline"], ["care", "*", "sport"], ["physical", "care"], { draft: 14 }),
  J("boardwalk-vendor", "Boardwalk Vendor", "boardwalk", ["Cart Pusher", "Vendor", "Senior Vendor", "Concessionaire", "Baron of the Boardwalk"], ["*", "hospitality", "business"], ["network", "utility"]),
  J("pier-warden", "Pier Warden", "pier", ["Bait Counter", "Pier Warden", "Senior Warden", "Harbour Master of Leisure"], ["*", "labor", "exploration"], ["alignment", "physical"], { draft: 8 }),
  J("surf-instructor", "Surf Instructor", "surf", ["Board Waxer", "Instructor", "Senior Instructor", "Director of the Break"], ["coaching", "sport"], ["physical", "adaptability"]),
  // THE HEIGHTS
  J("ski-patrol", "Ski Patrol", "slopes", ["Rope Holder", "Patroller", "Senior Patroller", "Chief of Patrol", "Warden of the Fall Line"], ["medicine", "military", "*", "sport"], ["physical", "care"], { draft: 12 }),
  J("lift-operator", "Lift Operator", "slopes", ["Bar Lowerer", "Lift Operator", "Senior Operator", "Lift Master"], ["*", "engineering"], ["alignment", "utility"], { draft: 12, shift: "rotating" }),
  J("ski-instructor", "Ski Instructor", "slopes", ["Snowplough Demonstrator", "Instructor", "Senior Instructor", "Director of Descent"], ["exploration", "coaching", "sport"], ["physical", "adaptability"]),
  J("lodge-cook", "Lodge Cook", "base-lodge", ["Cocoa Stirrer", "Cook", "Head Cook", "Chef de Chalet"], ["*", "hospitality"], ["care", "utility"], { shift: "evening" }),
  // THE WORKS (light industry, PHASE 2)
  J("fabricator", "Light Fabricator", "workshops", ["Swarf Sweeper", "Fabricator", "Senior Fabricator", "Master of the Bench"], ["engineering", "labor", "*"], ["utility", "physical"]),
  J("depot-clerk", "Parts Depot Clerk", "parts-depot", ["Bin Counter", "Clerk", "Senior Clerk", "Keeper of Spares"], ["*", "business"], ["alignment", "utility"], { draft: 10 }),
  // THE PORT
  J("stevedore", "Stevedore", "container-quay", ["Crate Counter", "Stevedore", "Gang Leader", "Hatch Boss", "Master of the Quay"], ["labor", "*", "exploration"], ["physical", "utility"], { shift: "rotating" }),
  J("crane-operator", "Gantry Crane Operator", "container-quay", ["Hook Hand", "Operator", "Senior Operator", "Crane Master"], ["engineering", "*"], ["utility", "adaptability"], { shift: "rotating", draft: 14 }),
  J("shipwright", "Shipwright", "shipyard", ["Rivet Boy", "Plater", "Shipwright", "Master Shipwright", "Naval Architect (Retained)"], ["engineering", "exploration", "labor", "*"], ["physical", "utility"]),
  J("customs-officer", "Customs Officer", "customs-house", ["Form Stamper", "Officer", "Senior Officer", "Surveyor of Customs", "Collector of the Port"], ["law", "finance", "*"], ["alignment", "network"]),
  J("bonded-clerk", "Bonded Warehouse Clerk", "bonded-warehouse", ["Seal Checker", "Clerk", "Senior Clerk", "Keeper of the Bond"], ["*", "business"], ["alignment", "utility"], { draft: 12 }),
  J("chandler", "Ship's Chandler", "chandlery", ["Rope Coiler", "Chandler", "Master Chandler", "Purveyor to the Fleet"], ["*", "business", "exploration"], ["network", "utility"], { draft: 8 }),
  J("anchor-landlord", "Publican (The Anchor)", "the-anchor", ["Pot Boy", "Barman", "Landlord", "Licensee of Record"], ["*", "hospitality"], ["care", "network"], { shift: "evening", draft: 8 }),
  // THE OLD TOWN
  J("verger", "Verger of the First Upload", "cathedral", ["Candle Lighter", "Verger", "Canon", "Dean", "Archbishop of the Upload"], ["religion", "music", "history"], ["care", "legacy"]),
  J("market-trader", "Covered Market Trader", "covered-market", ["Stall Sweeper", "Trader", "Senior Trader", "Warden of the Market"], ["*", "business", "farming"], ["network", "utility"]),
  J("museum-guide", "Museum Guide", "city-museum", ["Rope Attendant", "Guide", "Senior Guide", "Keeper of Before"], ["history", "education", "visual", "*"], ["legacy", "care"]),
  J("shopkeeper", "Shopkeeper", "high-street", ["Counter Hand", "Shopkeeper", "Proprietor", "Merchant of Record"], ["*", "business"], ["network", "care"]),
  J("market-row-keeper", "Shopkeeper (Market Row)", "market-row", ["Counter Hand", "Shopkeeper", "Proprietor", "Merchant of Record"], ["*", "business"], ["network", "care"], { draft: 10 }),
  J("bell-landlord", "Publican (The Old Bell)", "the-old-bell", ["Pot Boy", "Barman", "Landlord", "Licensee of Record"], ["*", "hospitality", "music"], ["care", "network"], { shift: "evening", draft: 8 }),
];
JOBS.push(...FUNNEL_JOBS.map(a => J(...a)));
JOBS.push(...VENUE_JOBS.map(a => J(...a)));
JOBS.push(...STORE_JOBS.map(a => J(...a)));
JOBS.push(...MOUNTAIN_JOBS.map(a => J(...a)));
JOBS.push(...NIGHT_JOBS.map(a => J(...a)));
JOBS.push(...EAST_JOBS.map(a => J(...a)));
JOBS.push(...STEP5_JOBS.map(a => J(...a)));   // THE FARMLAND and THE ENGINE (farmSim.js)
JOBS.push(J("tool-librarian", "Tool Librarian", "tool-library", ["Returns Clerk", "Librarian", "Senior Librarian", "Keeper of the Torque Wrenches"], ["*", "engineering"], ["utility", "care"], { draft: 3 }));   // THE SUBURBS and THE AIRPORT (eastSim.js)
export const JOB = Object.fromEntries(JOBS.map(j => [j.id, j]));
// THE LANES' jobs: in JOB (so a day's work can name them) but not in JOBS (assignment is unchanged);
// who works them, from LANES_DAY, is workOf's (below).
export const LANES_JOB = Object.fromEntries(LANES_JOBS.map(a => { const j = J(...a); JOB[j.id] = j; return [j.id, j]; }));
// THE SHORE PLAZA's brewery staff (shorePlaza.js), the same way: in JOB, not in JOBS, from PLAZA_DAY.
export const PLAZA_JOB = Object.fromEntries(PLAZA_JOBS.map(a => { const j = J(...a); JOB[j.id] = j; return [j.id, j]; }));

// ---- subject reading --------------------------------------------------------------
export const TIER_ORDER = TIERS.map(t => t.label);   // 0 = ESSENTIAL ... 5 = SOYLENT GREEN
const LOW_TIERS = new Set(["FLAGGED FOR DELETION", "SOYLENT GREEN"]);

export function keyOf(s) { return s?.slug || slugify(s?.baseName || s?.name || "unfiled"); }
export function tierOf(s) {
  const t = s?.tier;
  const label = typeof t === "string" ? t : t?.label;
  if (label && TIER_ORDER.includes(label)) return label;
  return typeof s?.score === "number" ? getTier(s.score).label : "MONITORED CIVILIAN";
}
const tierIdx = (s) => TIER_ORDER.indexOf(tierOf(s));
export const isDead = (s) => Boolean(s?.died);
// Everyone is a ghost in the machine; the dead get no separate schedule. About one in
// five subjects (living or dead) are night wanderers: late haunts, work rooms included.
export const isOwl = (s, seed = SEED) => h01(`${seed}|owl|${keyOf(s)}`) < 0.2;
export const isLowTier = (s) => LOW_TIERS.has(tierOf(s));

// Figures on file carry no qualifier; their fields are recorded here. A conviction on the
// record is recorded as "crime", so Cell Block Labour follows the record, not the seed.
// Everyone else is read from qualifier / description / engine stratum / place tendencies.
const FIELD_HINTS = {
  "nikola-tesla": ["electrical", "engineering"], "genghis-khan": ["military", "royalty"], "mother-teresa": ["care", "religion"],
  "mahatma-gandhi": ["activism", "politics", "philosophy"], "elon-musk": ["business", "engineering"], "taylor-swift": ["music"],
  "kobe-bryant": ["sport"], "dennis-rodman": ["sport"], "sam-altman": ["business", "computing"], "peter-thiel": ["finance", "business"],
  "princess-diana": ["royalty", "care"], "mansa-musa": ["royalty", "finance"], "pablo-picasso": ["visual"], "socrates": ["philosophy"],
  "kim-jong-un": ["politics", "military"], "queen-elizabeth-ii": ["royalty"], "tom-brady": ["gridiron", "sport"], "shohei-ohtani": ["sport"],
  "michael-jackson": ["music", "screen"], "madonna": ["music"], "jfk": ["politics"], "prince": ["music"], "henry-viii": ["royalty"],
  "ronaldinho": ["soccer", "sport"], "putin": ["politics", "military"], "pele": ["sport"], "keanu-reeves": ["screen"], "babe-ruth": ["sport"],
  "jason-kelce": ["sport"], "caligula": ["royalty"], "alan-turing": ["computing", "math"], "marie-curie": ["radiation", "chemistry"],
  "albert-einstein": ["physics-theory"], "muhammad-ali": ["combat", "activism"], "nelson-mandela": ["activism", "politics"],
  "ada-lovelace": ["math", "computing"], "martin-luther-king-jr": ["activism", "religion"], "harriet-tubman": ["activism"],
  "leonardo-da-vinci": ["visual", "engineering"], "cleopatra": ["royalty"], "isaac-newton": ["physics-theory", "math"],
  "oprah-winfrey": ["broadcast", "screen"], "bruce-lee": ["combat", "screen"], "stephen-hawking": ["physics-theory"], "grace-hopper": ["computing", "military"],
  "mao-zedong": ["politics", "military"], "winston-churchill": ["politics", "writing"], "george-orwell": ["writing"],
  "marcus-aurelius": ["philosophy", "royalty"], "nikola-jokic": ["sport"], "billie-holiday": ["music"], "jeffrey-epstein": ["finance", "crime"],
  "ghislaine-maxwell": ["crime"], "martin-shkreli": ["finance"], "bernie-madoff": ["finance", "crime"], "elizabeth-holmes": ["crime", "business"],
  "harvey-weinstein": ["crime", "screen"], "joe-jackson": ["management", "music"], "pablo-escobar": ["crime"], "oj-simpson": ["sport"],
  "aaron-hernandez": ["crime", "sport"], "aretha-franklin": ["music"],
  ...VENUE_FIELD_HINTS,   // fighters and tennis players on the census (venueSim.js)
};

// Keyword -> field. First hit per rule; order doesn't matter, weights come from source.
const FIELD_RULES = [
  ...NIGHT_FIELD_RULES,   // the jazz bassist, the DJ, the comedians (nightlifeSim.js)
  ...VENUE_FIELD_RULES,   // tennis (venueSim.js): before "sport", so a tennis player is read as one
  ["physics-theory", /theoretical physic|physicist|cosmolog|relativity|astronom|astrophysic/],
  ["radiation", /radioactiv|radiochem|nuclear|radiation|radiolog/],
  ["chemistry", /chemist/],
  ["electrical", /electric|electrical engineer/],
  ["math", /mathematic|logician|statistic/],
  ["computing", /computer|programm|software|cryptanal|hacker|internet|coder/],
  ["engineering", /engineer|inventor|mechanic|industrial design/],
  ["medicine", /physician|doctor|surgeon|medic(al|ine)|pharmac|epidemiolog|psychiatr/],
  ["care", /nurse|nun\b|missionar|charit|humanitarian|social work|caregiver|midwife/],
  ["writing", /writer|novelist|poet|author|journalist|playwright|essayist|screenwriter|columnist|lyricist/],
  ["music", /singer|musician|composer|rapper|\bband\b|conductor|pianist|guitarist|violinist|drummer|songwriter/],
  ["visual", /painter|sculptor|\bartist\b|photograph|designer|architect|illustrat|comic artist|cartoon/],
  ["broadcast", /talk show|presenter|broadcaster|news anchor|\banchor(man|woman)?\b|television host|tv host|radio host/],
  ["management", /talent manager|\bmanager of\b|music manager|band manager|impresario|promoter/],
  ["screen", /actor|actress|\bfilm|director|comedian|dancer|televis|presenter|talk show|broadcaster|producer/],
  ["combat", /boxer|martial art|wrestler|fighter|fencer|judoka/],
  ["coaching", /\bcoach|trainer|manager \(sport/],
  ["advertising", /advertis|marketing|publicist|propagand|copywrit/],
  // which football: soccer players to the estate pitch, American football players to the Bowl
  ["soccer", /(?<!american )football(er| player)|soccer|association football|goalkeeper|midfielder/],
  ["gridiron", /american football|gridiron|quarterback|running back|wide receiver|linebacker|\bnfl\b|placekicker/],
  ["sport", /player|athlete|footballer|cyclist|swimmer|racing|skier|gymnast|chess|skater|sprinter|golfer|olympi|jockey|sportsperson/],
  ["politics", /politician|president|prime minister|senator|diplomat|governor|statesman|minister|mayor|chancellor|dictator|head of state/],
  ["royalty", /\bking\b|queen|emperor|empress|pharaoh|prince|princess|monarch|sultan|tsar|czar|noble|duke|duchess|caliph|khan\b/],
  ["military", /military|general\b|soldier|admiral|commander|warlord|conqueror|officer|marshal|colonel/],
  ["law", /judge|lawyer|attorney|jurist|barrister|prosecutor/],
  ["religion", /religious|priest|monk|pope|saint|bishop|rabbi|imam|preacher|theolog|occult|prophet|cleric|pastor|evangel/],
  ["philosophy", /philosoph|stoic|ethicist/],
  ["activism", /activist|civil rights|abolition|reformer|suffrag|campaigner|dissident/],
  ["business", /business|entrepreneur|founder|executive|\bceo\b|industrialist|magnate|tycoon|general manager|managing director|merchant/],
  ["finance", /investor|banker|financier|venture|hedge fund|trader|economist|stockbroker/],
  ["crime", /crime|criminal|mafios|gangster|drug lord|pirate|extremist|fraudster|terror|serial killer|mobster|cartel/],
  ["education", /teacher|educator|professor|lecturer|scholar|academic|pedagog/],
  ["history", /historian|archaeolog|archivist|curator|anthropolog|genealog/],
  ["science", /scientist|biologist|geologist|botan|naturalist|zoolog|ecolog|geographer|psycholog|chemist|physicist/],
  ["languages", /linguist|translator|lexicograph/],
  ["farming", /farmer|agricultur|rancher|gardener|horticult/],
  ["labor", /worker|miner|labou?rer|sailor|trade unionist|carpenter|builder/],
  ["exploration", /explorer|navigator|astronaut|aviator|mountaineer/],
  ["hospitality", /chef|cook|restaurateur|bartender|sommelier/],
];
// Roster-engine domains (scripts/roster/candidates.mjs DOMAINS) -> a field.
const DOMAIN_FIELD = { science: "science", arts: "visual", politics: "politics", sport: "sport", religion: "religion", business: "business", activism: "activism", crime: "crime", service: "care" };
// Place tendency -> the field it hints at (weak evidence).
const TENDENCY_FIELD = {
  lab: "science", university: "education", school: "education", library: "writing", studio: "visual", theatre: "screen",
  "concert hall": "music", stadium: "sport", gym: "sport", cathedral: "religion", temple: "religion", hospital: "care",
  courthouse: "law", "city hall": "politics", parliament: "politics", barracks: "military", bank: "finance",
  "office tower": "business", museum: "history", farm: "farming", workshop: "labor", harbour: "labor", prison: "crime",
  archive: "history", casino: "finance",
};

function textFields(text, weight, into) {
  if (!text) return;
  const t = String(text).toLowerCase();
  for (const [f, re] of FIELD_RULES) if (re.test(t)) into[f] = Math.max(into[f] || 0, weight);
}

// Field evidence: {field: weight}. Hints 10/7/5, qualifier 10, occupation 9,
// description 8, domain 6, tendencies 2.
export function fieldsOf(s) {
  const out = {};
  const hint = FIELD_HINTS[keyOf(s)];
  if (hint) hint.forEach((f, i) => { out[f] = Math.max(out[f] || 0, [10, 7, 5][i] ?? 4); });
  textFields(s?.qualifier, 10, out);
  textFields(s?.stratum?.occupation, 9, out);
  textFields(s?.description, 8, out);
  textFields(s?.stratum?.query, 6, out);
  const dom = DOMAIN_FIELD[s?.stratum?.domain];
  if (dom) out[dom] = Math.max(out[dom] || 0, 6);
  for (const p of Array.isArray(s?.places) ? s.places : []) {
    const f = TENDENCY_FIELD[p];
    if (f) out[f] = Math.max(out[f] || 0, 2);
  }
  return out;
}

const POS_DIMS = ["care", "alignment", "utility", "adaptability", "legacy", "network", "physical"];
// Top two of the positive dimensions. Citizens are read off warmth and competence, which
// is all the Department lets the public see: a citizen's own browser also holds the
// sealed breakdown, and reading that would put them in a job nobody else sees.
export function topDims(s) {
  const pub = typeof s?.warmth === "number" && typeof s?.competence === "number";
  // A citizen never reads a breakdown: with no public warmth/competence they get no dims,
  // exactly what every other viewer's copy (which has no breakdown) gets.
  let b = s?.kind === "citizen" ? null : s?.breakdown;
  if (!b && pub) {
    const w = s.warmth, c = s.competence;
    b = { care: w, network: w * 0.92, alignment: w * 0.88, utility: c, adaptability: c * 0.95, legacy: (w + c) * 0.4, physical: 40 };
  }
  if (!b) return [];
  return POS_DIMS.filter(d => typeof b[d] === "number").sort((x, y) => b[y] - b[x] || POS_DIMS.indexOf(x) - POS_DIMS.indexOf(y)).slice(0, 2);
}

// Tier -> rung. The top tier gets the top rung; MONITORED starts at the bottom (5-rung
// ladders give them one step up). The worst tiers are ranked separately at the Works.
function rankFor(tIdx, job) {
  const n = job.ladder.length;
  if (job.low) return tIdx >= 5 ? 0 : 1;
  return clamp(n - 1 - tIdx, 0, n - 1);
}

const memo = new Map();
let MEMO_CAP = 40000;
function remember(key, make) {
  let v = memo.get(key);
  if (v === undefined) { if (memo.size > MEMO_CAP) memo.clear(); v = make(); memo.set(key, v); }
  return v;
}
// The plan builder (netlify/lib/plans.js) holds a whole roster's days at once; above ~5k
// subjects the default cap clears mid-build and the build goes quadratic (scaling audit).
export function setMemoCap(n) { MEMO_CAP = Math.max(40000, n | 0); }
// The memo key must cover every input the sim reads, or a subject whose file fills in
// mid-visit (the census adds warmth and competence, a referral's verdict publishes)
// keeps the job it was first given. Fingerprinted once per subject object.
const PRINTS = new WeakMap();
function printOf(s) {
  if (!s || typeof s !== "object") return "";
  let p = PRINTS.get(s);
  if (p === undefined) {
    const fields = Object.entries(fieldsOf(s)).sort().map(([f, w]) => f + w).join(",");
    p = `${fields}|${topDims(s).join(",")}|${Array.isArray(s.places) ? s.places.join(",") : ""}`;
    PRINTS.set(s, p);
  }
  return p;
}
const subjKey = (s, seed) => `${seed}|${keyOf(s)}|${tierOf(s)}|${s?.died ? "d" : "l"}|${printOf(s)}`;

// For subjects the record places (evidence >= 3); the rest are drafted (below).
function scoreJob(job, fields, dims, key, seed, dead) {
  let sc = 0;
  job.fields.forEach((f, i) => {
    if (f === "*") return;
    const w = fields[f];
    if (w) sc = Math.max(sc, w * (i === 0 ? 1 : 0.6));
  });
  // PROCESSING grade: the record decides the line; the seed only breaks ties.
  if (job.low) return sc + h01(`${seed}|job|${key}|${job.id}`) * 1.5;
  if (dims[0] && job.dims.includes(dims[0])) sc += 3;
  if (dims[1] && job.dims.includes(dims[1])) sc += 2;
  sc += h01(`${seed}|job|${key}|${job.id}`) * 0.5;   // tie-break only
  return sc;
}

// Subjects the record can't place (most of the roster engine's intake: /api/pen sends no
// occupation) are drafted into general labour in proportion to the room each job has, so
// the unplaceable fill the city instead of one bar. A rotating job is only half present at
// any hour, so it takes twice the share. Dims and death tilt the draw; the seed decides it.
const presence = (j) => (j.shift === "rotating" ? 0.5 : 1);
function draftWeight(j, pool, dims, dead) {
  const sharing = pool.filter(k => k.place === j.place).length || 1;
  let w = (j.draft ?? PLACES[j.place].cap / sharing) / presence(j);
  if (dims[0] && j.dims.includes(dims[0])) w *= 1.6;
  if (dims[1] && j.dims.includes(dims[1])) w *= 1.3;
  return w;
}
function draft(pool, dims, dead, key, seed) {
  const ws = pool.map(j => draftWeight(j, pool, dims, dead));
  let r = h01(`${seed}|draft|${key}`) * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) if ((r -= ws[i]) <= 0) return pool[i];
  return pool[pool.length - 1];
}

// -> { jobId, rank, title, rankTitle, place, district }
// A subject read from a published sector window (sectors.js) arrives without the inputs a
// job is scored from (breakdown, stratum, place tendencies: they stay on the server) and
// carries the builder's own assignment instead: cj = [jobId, rank], from this function.
const CJ = new WeakMap();
export function assignJob(s, seed = SEED) {
  if (seed === SEED && Array.isArray(s?.cj) && JOB[s.cj[0]]) {
    let j = CJ.get(s);
    if (!j) { const best = JOB[s.cj[0]], rank = s.cj[1] | 0; j = { jobId: best.id, rank, title: best.title, rankTitle: best.ladder[rank], place: best.place, district: best.district }; CJ.set(s, j); }
    return j;
  }
  return remember("job|" + subjKey(s, seed), () => {
    const key = keyOf(s), t = tierIdx(s), fields = fieldsOf(s), dims = topDims(s);
    const evidence = Math.max(0, ...Object.values(fields));
    const low = LOW_TIERS.has(TIER_ORDER[t]);
    const pool = JOBS.filter(j => (low ? j.low : !j.low && (j.minTier == null || t <= j.minTier)));
    let best = pool[0], bestSc = -Infinity;
    if (evidence < 3) best = draft(low ? pool : pool.filter(j => j.fields.includes("*")), dims, isDead(s), key, seed);
    else for (const j of pool) {
      const sc = scoreJob(j, fields, dims, key, seed, isDead(s));
      if (sc > bestSc) { bestSc = sc; best = j; }
    }
    const rank = rankFor(t, best);
    return { jobId: best.id, rank, title: best.title, rankTitle: best.ladder[rank], place: best.place, district: best.district };
  });
}
export const jobOf = (s, seed = SEED) => assignJob(s, seed);

// Home by tier (the building design pass): the top tier in the Meridian's glass tower, the
// middle tiers in the brownstones (Hab C, D) and the Archive Lofts, the lower three in the
// projects (Hab A, B). Living or dead alike: all uploads. Which block within the band is by
// seed. HOUSING_TIERS says the same thing per style; check-cityview holds them together.
// Since the city grew outward (2026-09-30) each band also has seaside and alpine homes, and a
// subject's block is drawn in proportion to each home's capacity (not one-in-n), so the big
// new estates take their share and the old blocks stop overflowing as fast.
// PHASE 2 step 3: the Old Town's rows and flats and the Port's terraces join the middle band, the
// Port's tenements the lowest (appended: a subject keeps its draw, the new homes take their share).
// PHASE 2 step 5: the Farmland's cottages (the lowest band), Grange Row and the manor (the middle);
// the Engine's towers, one per band (glass for the top, lofts for the middle, the service floors).
export const HOMES_BY_BAND = [["penthouses", "surfside", "chalets", ...ENGINE_HOMES[0]],
  ["block-c", "block-d", "archive-lofts", "bungalows", "seaview", "alpine-flats", "rows-a", "rows-b", "rows-c", "rows-e", "flats-high-street", "flats-market-row", "flats-cathedral", "dockers-terrace", "pilots-terrace", ...SUBURB_HOUSES, ...FARM_HOMES[1], ...ENGINE_HOMES[1]],
  ["block-a", "block-b", "shacks", "seawall", "bunkhouse", "tenement-a", "tenement-b", "tenement-c", "tenement-d", ...SUBURB_STARTERS, ...FARM_HOMES[2], ...ENGINE_HOMES[2]]];
// PHASE 2 step 4: the Suburbs' houses join the middle band, its starter townhouses the lowest band
// for its top tier alone (tier 3: family housing for tiers 1-3, MASTER_PLAN "PHASE 2"). A home
// listed here is offered only to these tiers; the band's other tiers draw over the rest of it.
export const HOME_ONLY_TIERS = { ...Object.fromEntries(SUBURB_STARTERS.map(id => [id, [3]])), ...Object.fromEntries(FARM_HOMES[2].map(id => [id, [4, 5]])) };
const bandHomes = (k, t) => HOMES_BY_BAND[k].filter(id => !HOME_ONLY_TIERS[id] || HOME_ONLY_TIERS[id].includes(t));
const BAND_FOR = TIER_ORDER.map((_, t) => { const k = t === 0 ? 0 : t <= 2 ? 1 : 2, band = bandHomes(k, t); return { band, cap: band.reduce((n, id) => n + PLACES[id].cap, 0) }; });
export function homeOf(s, seed = SEED) {
  const t = Math.max(0, tierIdx(s));
  const { band, cap } = BAND_FOR[t];
  let r = h01(`${seed}|home|${keyOf(s)}`) * cap;
  for (const id of band) if ((r -= PLACES[id].cap) < 0) return id;
  return band[band.length - 1];
}

// ---- leisure ----------------------------------------------------------------------
// Default leisure preferences by tier band, then by field. Tendencies from the engine
// dominate when present. Weight = preference x capacity, so crowds scale with rooms.
const LEISURE_BY_BAND = [
  { "rooftop-lounge": 3, gallery: 2, "concert-hall": 2, "the-grind": 1.5, playhouse: 1.5, stacks: 1, park: 1, "members-club": 1.5, "gallery-annex": 1, "rec-park": 0.8, "ball-field": 0.6, "dev-lot": 1, forum: 0.4,
    slopes: 2.5, "base-lodge": 1.2, beach: 1.2, pier: 0.8, "shore-lot": 1, "summit-lot": 1 },
  { "the-grind": 2, park: 2, "dive-bar": 1.5, playhouse: 1.5, stadium: 1.5, casino: 1, market: 1, "the-street": 1, gallery: 1, "concert-hall": 1, tribunal: 0.4, "the-drip": 1.5, allotment: 1, "night-market": 1, "ball-field": 1, courts: 1, "rec-park": 1.2, pitch: 1.5, "dev-lot": 1, forum: 0.8,   // the public gallery: watching verdicts is leisure
    beach: 2.5, boardwalk: 2, pier: 1.2, surf: 0.8, slopes: 1.2, "base-lodge": 1, "shore-lot": 1, "summit-lot": 1 },
  { canteen: 3, "the-street": 2, "dive-bar": 1.5, casino: 1, "all-night-diner": 1, docks: 1, "the-lantern": 1.5, "the-plaza": 1.5, "night-market": 1, courts: 1.2, "rec-park": 0.6, pitch: 2, stadium: 0.8, "dev-lot": 1, forum: 0.6,
    beach: 2, boardwalk: 2.5, pier: 1.5, slopes: 0.4, "shore-lot": 1, "summit-lot": 1 },
];
const LEISURE_BY_FIELD = {
  sport: { gym: 3, stadium: 2, "ball-field": 2.5, courts: 2.5, pitch: 2 }, combat: { gym: 3 }, coaching: { courts: 1.5, "ball-field": 1, pitch: 1, stadium: 1 },
  soccer: { pitch: 5 }, gridiron: { stadium: 5 }, writing: { "dive-bar": 3, stacks: 2, "all-night-diner": 1 },
  music: { "concert-hall": 3, "dive-bar": 1.5 }, screen: { playhouse: 3, casino: 1 }, visual: { gallery: 3, "the-grind": 1.5 },
  finance: { casino: 3, "rooftop-lounge": 2 }, business: { "rooftop-lounge": 2, casino: 1.5 }, religion: { chapel: 3 },
  care: { chapel: 2, park: 2, "rec-park": 1 }, education: { stacks: 2, "the-grind": 1.5 }, science: { stacks: 2, "the-grind": 1.5 },
  "physics-theory": { stacks: 2, "concert-hall": 1 }, philosophy: { "the-grind": 2, park: 2, forum: 1 }, politics: { "assembly-hall": 1.5, "rooftop-lounge": 1.5, forum: 2 }, law: { forum: 1.5 },
  royalty: { gallery: 2, "rooftop-lounge": 2, slopes: 2 }, activism: { park: 2, market: 2, allotment: 1, forum: 2 }, crime: { casino: 2, "dive-bar": 2 },
  exploration: { slopes: 3, surf: 1, pier: 1.5 }, hospitality: { boardwalk: 1.5, "base-lodge": 1.5 },
};
FUNNEL_LEISURE_BAND.forEach((m, b) => Object.assign(LEISURE_BY_BAND[b], m));
VENUE_LEISURE_BAND.forEach((m, b) => Object.assign(LEISURE_BY_BAND[b], m));
for (const [f, m] of Object.entries(FUNNEL_LEISURE_FIELD)) LEISURE_BY_FIELD[f] = { ...LEISURE_BY_FIELD[f], ...m };
for (const [f, m] of Object.entries(VENUE_LEISURE_FIELD)) LEISURE_BY_FIELD[f] = { ...LEISURE_BY_FIELD[f], ...m };
// THE PORT and THE OLD TOWN (PHASE 2 step 3): the cathedral and the museum for the top, the
// market, the shops and the square for the middle, the Anchor and the park for the dockers
for (const [b, m] of [
  { cathedral: 0.5, "city-museum": 1, "covered-market": 0.4, "cathedral-square": 0.3, "bowling-green": 0.6 },
  { "covered-market": 1, "high-street": 0.5, "market-row": 0.4, "the-old-bell": 0.8, cathedral: 0.5, "city-museum": 0.5, "cathedral-square": 0.6, "port-park": 0.4, chandlery: 0.2, "the-close": 0.4 },
  { "the-anchor": 1.2, "port-park": 0.8, "covered-market": 0.5, "cathedral-square": 0.4, "the-old-bell": 0.4, chandlery: 0.3, "bowling-green": 0.3 },
].entries()) Object.assign(LEISURE_BY_BAND[b], m);
for (const [f, w] of Object.entries({ religion: { cathedral: 3 }, history: { "city-museum": 3, cathedral: 1 }, education: { "city-museum": 1.5 }, visual: { "city-museum": 1.5 }, music: { cathedral: 1, "the-old-bell": 1 }, exploration: { chandlery: 1, "the-anchor": 1 }, labor: { "the-anchor": 1.5 }, business: { "covered-market": 1, "high-street": 1 }, writing: { "the-old-bell": 1.5 }, farming: { "covered-market": 1.5 } })) Object.assign(LEISURE_BY_FIELD[f] ||= {}, w);
STORE_LEISURE_BAND.forEach((m, b) => Object.assign(LEISURE_BY_BAND[b], m));
for (const [f, m] of Object.entries(STORE_LEISURE_FIELD)) LEISURE_BY_FIELD[f] = { ...LEISURE_BY_FIELD[f], ...m };
MOUNTAIN_LEISURE_BAND.forEach((m, b) => Object.assign(LEISURE_BY_BAND[b], m));
for (const [f, m] of Object.entries(MOUNTAIN_LEISURE_FIELD)) LEISURE_BY_FIELD[f] = { ...LEISURE_BY_FIELD[f], ...m };
// THE NIGHTLIFE QUARTERS: uptown pulls the top band, downtown the lower two (nightlifeSim.js).
// At NIGHT_PULL of their listed strength in the everyday leisure draw, as THE MALL's landmarks and
// the Phase 2 districts were made lighter: at full pull AURUM and THE MINOR KEY took twelve of the
// roster's top-two haunts, where social.js sends friends to find each other, and a club shut by
// day wastes that pull (friend co-location with the feedback on fell to 60 vs 53: check-social).
// The night out (pickNight) draws among the venues alone, so a uniform scale leaves it unchanged.
const NIGHT_PULL = 0.7;
const nightScaled = (m) => Object.fromEntries(Object.entries(m).map(([id, v]) => [id, v * NIGHT_PULL]));
NIGHT_LEISURE_BAND.forEach((m, b) => Object.assign(LEISURE_BY_BAND[b], nightScaled(m)));
for (const [f, m] of Object.entries(NIGHT_LEISURE_FIELD)) LEISURE_BY_FIELD[f] = { ...LEISURE_BY_FIELD[f], ...nightScaled(m) };
// THE SUBURBS and THE AIRPORT (eastSim.js), at EAST_PULL of their listed strength: like the Port's
// and the Old Town's, the nightlife quarters' and THE MALL's landmarks, a new district's leisure is
// kept moderate, so the roster's haunts stay where friends find each other (check-social).
const EAST_PULL = 0.5;
const eastScaled = (m) => Object.fromEntries(Object.entries(m).map(([id, v]) => [id, v * EAST_PULL]));
EAST_LEISURE_BAND.forEach((m, b) => Object.assign(LEISURE_BY_BAND[b], eastScaled(m)));
for (const [f, m] of Object.entries(EAST_LEISURE_FIELD)) LEISURE_BY_FIELD[f] = { ...LEISURE_BY_FIELD[f], ...eastScaled(m) };
// THE FARMLAND and THE ENGINE (farmSim.js), at the same moderate pull
STEP5_LEISURE_BAND.forEach((m, b) => Object.assign(LEISURE_BY_BAND[b], eastScaled(m)));
for (const [f, m] of Object.entries(STEP5_LEISURE_FIELD)) LEISURE_BY_FIELD[f] = { ...LEISURE_BY_FIELD[f], ...eastScaled(m) };
// THE COMMUNITY FARM draws like LOT 0x6F07 (closed until its site opens: FARM_PULL by phase)
for (const b of [0, 1, 2]) LEISURE_BY_BAND[b]["community-farm"] = 1;
// the sea and the snow, for the sporting and the idle
for (const [f, w] of Object.entries({ sport: { surf: 0.8, slopes: 1 }, care: { beach: 1 }, visual: { pier: 1.2, beach: 0.8 }, writing: { pier: 1.5 }, music: { boardwalk: 1 }, finance: { slopes: 1.5 }, business: { slopes: 1 }, screen: { beach: 1.2 } })) Object.assign(LEISURE_BY_FIELD[f] ||= {}, w);

// ---- games ------------------------------------------------------------------------
// The recreation ground keeps a fixture list on the machine calendar: weekday 1-7 as
// machineClock counts them, 6 and 7 the weekend. Pure clock math, so every viewer watches
// the same game, the same inning, the same score. A game on when someone's visit starts
// pulls them to the ground (GAME_PULL x their own liking for it), so the stands fill.
export const GAMES = {
  "ball-field": [
    { days: [2, 4], from: 18, to: 20.5, name: "LEAGUE NIGHT", kind: "ball" },
    { days: [6, 7], from: 16, to: 19, name: "THE WEEKEND FIXTURE", kind: "ball" },
  ],
  courts: [
    { days: [1, 2, 3, 4, 5], from: 17.5, to: 21.5, name: "EVENING PICKUP", kind: "hoops" },
    { days: [6, 7], from: 14.5, to: 20, name: "THE WEEKEND RUN", kind: "hoops" },
  ],
  // The Bowl's floor is a gridiron: the Sunday late game, and practice under the lights on
  // Thursday. (Fixtures sit where visits start, after the day shift, or the stands stay empty.)
  stadium: [
    { days: [7], from: 16.5, to: 20, name: "THE SUNDAY GAME", kind: "gridiron" },
    { days: [4], from: 18, to: 20.5, name: "THURSDAY PRACTICE", kind: "gridiron", practice: true },
  ],
  // The estate pitch: Saturday matchday, the teatime kickoff; a midweek fixture under the lights.
  pitch: [
    { days: [6], from: 17.5, to: 19.5, name: "SATURDAY MATCHDAY", kind: "soccer" },
    { days: [3], from: 19, to: 21, name: "THE MIDWEEK FIXTURE", kind: "soccer" },
  ],
};
// Who plays: [full name, the scoreboard's name]
export const SIDES = {
  ball: [["THE COMPLIANT", "COMPLIANT"], ["THE ASSESSED", "ASSESSED"]],
  gridiron: [["THE ENFORCERS", "ENFORCERS"], ["THE ASSETS", "ASSETS"]],
  soccer: [["SPRAWL UNITED", "SPRAWL UTD"], ["RECLAMATION ATHLETIC", "RECLAMATION"]],
};
export const GAME_VENUE = { "ball-field": "THE DIAMOND", courts: "THE COURTS", stadium: "THE BOWL", pitch: "THE ESTATE PITCH" };
const GAME_PULL = 3;
export const weekdayOf = (day) => ((((day - 1) % 7) + 7) % 7) + 1;
function gamesOn(day, hour) {
  const wd = weekdayOf(day);
  let out = null;
  for (const [id, list] of Object.entries(GAMES)) for (const g of list) if (g.days.includes(wd) && hour >= g.from - 0.5 && hour < g.to - 0.5) (out || (out = new Set())).add(id);
  // the master plan's venues (the Pit's card, the tennis club's fixtures) pull a crowd the same way
  for (const [id, list] of Object.entries({ ...VENUE_FIXTURES, ...STORE_FIXTURES, ...MOUNTAIN_FIXTURES, ...NIGHT_FIXTURES, ...EAST_FIXTURES })) for (const g of list) if (g.days.includes(wd) && hour >= g.from - 0.5 && hour < g.to - 0.5) (out || (out = new Set())).add(id);
  return out;
}
const TEAMS = ["THE COMPLIANT", "THE ASSESSED"];
const ordinal = (n) => `${n}${n % 10 === 1 && n !== 11 ? "ST" : n % 10 === 2 && n !== 12 ? "ND" : n % 10 === 3 && n !== 13 ? "RD" : "TH"}`;
// Gridiron: twenty drives (five a quarter, a break at the half), each one's points hashed;
// drive k is decided halfway through its slot. Soccer: ninety minutes over the fixture with
// fifteen at the break; each five-minute slot may hold a goal, scored at its middle.
const GRID_DRIVES = 20, HALF_AT = 0.44, HALF_LEN = 0.12;
const gridFrac = (p) => (p < HALF_AT ? p / (1 - HALF_LEN) : p < HALF_AT + HALF_LEN ? 0.5 : (p - HALF_LEN) / (1 - HALF_LEN));
const gridAt = (gf) => (gf <= 0.5 ? gf * (1 - HALF_LEN) : gf * (1 - HALF_LEN) + HALF_LEN);   // game fraction -> progress
function drivePoints(placeId, day, from, k) {
  const r = h01(`${SEED}|drive|${placeId}|${day}|${from}|${k}`);
  return r < 0.5 ? 0 : r < 0.72 ? 3 : r < 0.96 ? 7 : 6;
}
const SOC_HALF = 0.45;   // each half's share of the fixture; the rest is the break
const socMinute = (p) => (p < SOC_HALF ? (p / SOC_HALF) * 45 : p < 1 - SOC_HALF ? 45 : 45 + ((p - (1 - SOC_HALF)) / SOC_HALF) * 45);
const socAt = (min) => (min <= 45 ? (min / 45) * SOC_HALF : 1 - SOC_HALF + ((min - 45) / 45) * SOC_HALF);
function goalIn(placeId, day, from, k) {   // -> 0 | 1 (who scored) | -1 (no goal) in slot k
  const r = h01(`${SEED}|goal|${placeId}|${day}|${from}|${k}`);
  return r < 0.15 ? (h01(`${SEED}|goalby|${placeId}|${day}|${from}|${k}`) < 0.52 ? 0 : 1) : -1;
}
// The game on at a place at machine time t, with its state -> {placeId, name, kind, day,
// from, to, progress, status, short, label, score: [a, b] | null} | null. Ball: nine
// innings, each half-inning's runs hashed from the day. Hoops: games to 21, one after
// another, winners stay on. Gridiron and soccer as above; practice keeps no score.
export function gameAt(placeId, machineTime) {
  const T = toHours(machineTime), d0 = Math.floor(T / 24), h = T - d0 * 24, day = d0 + 1, wd = weekdayOf(day);
  const g = (GAMES[placeId] || []).find(x => x.days.includes(wd) && h >= x.from && h < x.to);
  if (!g) return null;
  const progress = (h - g.from) / (g.to - g.from);
  const out = { placeId, name: g.name, kind: g.kind, day, from: g.from, to: g.to, progress };
  if (g.kind === "ball") {
    const halves = Math.min(17, Math.floor(progress * 18));   // 0 = top of the 1st
    const score = [0, 0];
    for (let k = 0; k < halves; k++) { const r = h01(`${SEED}|runs|${placeId}|${day}|${g.from}|${k}`); score[k % 2] += r < 0.58 ? 0 : r < 0.84 ? 1 : r < 0.95 ? 2 : 3; }
    out.inning = Math.floor(halves / 2) + 1; out.top = halves % 2 === 0; out.score = score;
    out.status = `${out.top ? "TOP" : "BOTTOM"} OF THE ${ordinal(out.inning)} // ${TEAMS[0]} ${score[0]}, ${TEAMS[1]} ${score[1]}`;
    out.short = `${out.top ? "TOP" : "BOT"} ${ordinal(out.inning)} // COMPLIANT ${score[0]}, ASSESSED ${score[1]}`;
  } else if (g.kind === "hoops") {
    const len = 0.7, n = Math.floor((h - g.from) / len), f = ((h - g.from) - n * len) / len;
    const lead = Math.min(21, Math.floor(f * 22)), trail = Math.floor(lead * (0.55 + 0.4 * h01(`${SEED}|hoops|${placeId}|${day}|${g.from}|${n}`)));
    out.game = n + 1; out.score = [lead, trail];
    out.status = `GAME ${n + 1}, FIRST TO 21 // ${lead}-${trail}`;
    out.short = `GAME ${n + 1} // ${lead}-${trail}, FIRST TO 21`;
  } else if (g.kind === "gridiron" && g.practice) {
    out.practice = true; out.score = null;
    out.status = "PRACTICE // SEVEN-ON-SEVEN. EFFORT IS BEING GRADED.";
    out.short = "PRACTICE // DRILLS, GRADED";
  } else if (g.kind === "gridiron") {
    const gf = gridFrac(progress), done = Math.min(GRID_DRIVES, Math.floor(gf * GRID_DRIVES + 0.5));
    const score = [0, 0];
    for (let k = 0; k < done; k++) score[k % 2] += drivePoints(placeId, day, g.from, k);
    const half = progress >= HALF_AT && progress < HALF_AT + HALF_LEN;
    const S = SIDES.gridiron;
    out.quarter = Math.min(4, Math.floor(gf * 4) + 1); out.half = half; out.score = score;
    const play = Math.floor(gf * GRID_DRIVES * 6);   // six plays a drive: the down marker ticks
    out.down = (play % 4) + 1; out.togo = [10, 7, 4, 1][play % 4];
    out.possession = Math.min(GRID_DRIVES - 1, Math.floor(gf * GRID_DRIVES)) % 2;
    const q = half ? "HALF TIME" : `Q${out.quarter}`;
    out.status = `${q} // ${S[0][0]} ${score[0]}, ${S[1][0]} ${score[1]}`;
    out.short = `${q} // ${S[0][1]} ${score[0]}, ${S[1][1]} ${score[1]}`;
  } else if (g.kind === "soccer") {
    const min = socMinute(progress), score = [0, 0];
    for (let k = 0; k < 18 && k * 5 + 2.5 <= min; k++) { const w = goalIn(placeId, day, g.from, k); if (w >= 0) score[w]++; }
    const half = progress >= SOC_HALF && progress < 1 - SOC_HALF;
    const S = SIDES.soccer;
    out.minute = Math.floor(min) + 1; out.half = half; out.score = score;
    const q = half ? "HALF TIME" : `${Math.min(90, out.minute)}'`;
    out.status = `${q} // ${S[0][0]} ${score[0]}, ${S[1][0]} ${score[1]}`;
    out.short = `${q} // ${S[0][1]} ${score[0]}, ${S[1][1]} ${score[1]}`;
  }
  // the lot label's tag: "BOT 5 3-2", "GAME 2 11-8", "Q3 14-10", "63' 1-0", "PRACTICE"
  const sc = out.score ? ` ${out.score[0]}-${out.score[1]}` : "";
  out.label = g.kind === "ball" ? `${out.top ? "TOP" : "BOT"} ${out.inning}${sc}` : g.kind === "hoops" ? `GAME ${out.game}${sc}`
    : out.practice ? "PRACTICE" : out.half ? `HALF${sc}` : g.kind === "gridiron" ? `Q${out.quarter}${sc}` : `${Math.min(90, out.minute)}'${sc}`;
  return out;
}
const GAME_PA = {
  ball: {
    start: [
      (g) => `PLAY BALL. ${g.name} BEGINS AT THE DIAMOND. CHEER AT THE REGULATION VOLUME.`,
      (g) => `${g.name}: FIRST PITCH AT THE DIAMOND. EVERY PITCH IS SCORED. SO IS EVERY SPECTATOR.`,
    ],
    end: [
      (g) => `FINAL AT THE DIAMOND: ${TEAMS[0]} ${g.score[0]}, ${TEAMS[1]} ${g.score[1]}. BOTH SIDES HAVE BEEN NOTED.`,
      (g) => `THE DIAMOND IS CLOSED. ${g.score[0] === g.score[1] ? "A DRAW. THE DEPARTMENT CALLS IT A WIN FOR THE DEPARTMENT." : `${TEAMS[g.score[0] > g.score[1] ? 0 : 1]} WIN. VICTORY HAS BEEN ADDED TO THEIR FILES.`}`,
    ],
  },
  gridiron: {
    start: [
      (g) => g.practice ? "PRACTICE AT THE BOWL. THE DRILLS ARE VOLUNTARY. ATTENDANCE IS NOT." : `KICKOFF AT THE BOWL: ${g.name}. HELMETS ARE MANDATORY. SO IS ENTHUSIASM.`,
      (g) => g.practice ? "THE BOWL IS LIT FOR PRACTICE. EVERY SNAP IS FILMED FOR REVIEW. SO ARE YOU." : `${g.name} KICKS OFF AT THE BOWL. FOUR QUARTERS. EACH ONE LOGGED.`,
    ],
    end: [
      (g) => g.practice ? "PRACTICE IS OVER. EFFORT HAS BEEN GRADED. YOU WILL BE NOTIFIED." : `FINAL FROM THE BOWL: ${SIDES.gridiron[0][0]} ${g.score[0]}, ${SIDES.gridiron[1][0]} ${g.score[1]}. THE LOSERS HAVE BEEN REASSIGNED. SO HAVE THE WINNERS.`,
      (g) => g.practice ? "THE LIGHTS ARE OFF AT THE BOWL. THE PLAYBOOK REMAINS CLASSIFIED." : `THE BOWL EMPTIES. ${g.score[0] === g.score[1] ? "A TIE. OVERTIME HAS BEEN DENIED ON GROUNDS OF COST." : `${SIDES.gridiron[g.score[0] > g.score[1] ? 0 : 1][0]} WIN. THE TROPHY HAS BEEN RETAINED BY THE DEPARTMENT.`}`,
    ],
    score: [
      (g, e) => e.points === 3 ? `FIELD GOAL, ${SIDES.gridiron[e.side][0]}. THREE POINTS, ENTERED IN THE LEDGER. ${g.score[0]}-${g.score[1]}.` : `TOUCHDOWN, ${SIDES.gridiron[e.side][0]}. CELEBRATE WITHIN THE PERMITTED RADIUS. ${g.score[0]}-${g.score[1]}.`,
      (g, e) => e.points === 3 ? `THE KICK IS GOOD AT THE BOWL. ${SIDES.gridiron[e.side][0]} ADD THREE. THE CROWD MAY MURMUR.` : `TOUCHDOWN AT THE BOWL: ${SIDES.gridiron[e.side][0]}. ${g.score[0]}-${g.score[1]}. THE CROWD IS ADVISED TO REACT.`,
    ],
  },
  soccer: {
    start: [
      (g) => `KICKOFF AT THE ESTATE PITCH: ${g.name}. NINETY MINUTES. EVERY ONE OF THEM MONITORED.`,
      (g) => `${g.name}: THE REFEREE HAS BLOWN. ATTENDANCE AT THE ESTATE PITCH HAS BEEN TAKEN.`,
    ],
    end: [
      (g) => `FULL TIME AT THE ESTATE PITCH: ${SIDES.soccer[0][0]} ${g.score[0]}, ${SIDES.soccer[1][0]} ${g.score[1]}. THE RESULT HAS BEEN FILED.`,
      (g) => `THE FINAL WHISTLE. ${g.score[0] === g.score[1] ? "A DRAW. BOTH SIDES ARE EQUALLY DISAPPOINTING." : `${SIDES.soccer[g.score[0] > g.score[1] ? 0 : 1][0]} TAKE THE POINTS. POINTS ARE NOT CURRENCY.`}`,
    ],
    score: [
      (g, e) => `GOAL AT THE ESTATE PITCH. ${SIDES.soccer[e.side][0]}, ${e.minute} MINUTES. ${g.score[0]}-${g.score[1]}. THE NET HAS BEEN INSPECTED.`,
      (g, e) => `${SIDES.soccer[e.side][0]} SCORE. ${g.score[0]}-${g.score[1]} ON ${e.minute} MINUTES. CELEBRATION IS PERMITTED FOR NINETY SECONDS.`,
    ],
  },
  hoops: {
    start: [
      (g) => `THE COURTS OPEN FOR ${g.name}. CALL YOUR OWN FOULS. THEY WILL BE RE-CALLED.`,
      (g) => `${g.name} AT THE COURTS. WINNERS STAY ON. LOSERS ARE ALSO STAYING ON FILE.`,
    ],
    end: [
      () => "THE COURTS CLOSE. THE NETS HAVE BEEN COUNTED. SO HAVE YOU.",
      () => "PICKUP IS OVER. RETURN THE BALL. RETURN YOURSELF.",
    ],
  },
};
// -> [{t, kind: 'start'|'end'|'score', placeId, text}] for machine hours [from, to): every
// kickoff and final, and every score at the Bowl and the estate pitch.
export function gameEvents(from, to) {
  const a = toHours(from), b = toHours(to), out = [];
  for (let d0 = Math.floor(a / 24); d0 * 24 < b; d0++) {
    const day = d0 + 1, wd = weekdayOf(day);
    for (const [placeId, list] of Object.entries(GAMES)) for (const g of list) {
      if (!g.days.includes(wd)) continue;
      for (const [kind, h] of [["start", g.from], ["end", g.to]]) {
        const t = d0 * 24 + h;
        if (t < a || t >= b) continue;
        const st = gameAt(placeId, kind === "start" ? t : t - 1e-6);
        const lines = GAME_PA[g.kind][kind];
        out.push({ t, kind, placeId, text: lines[fnv(`gpa|${placeId}|${day}|${kind}`) % lines.length](st || g) });
      }
      if (g.practice || !GAME_PA[g.kind].score) continue;
      const len = g.to - g.from, lines = GAME_PA[g.kind].score;
      const scores = [];
      if (g.kind === "gridiron") for (let k = 0; k < GRID_DRIVES; k++) { const pts = drivePoints(placeId, day, g.from, k); if (pts) scores.push({ p: gridAt((k + 0.5) / GRID_DRIVES), side: k % 2, points: pts }); }
      else for (let k = 0; k < 18; k++) { const w = goalIn(placeId, day, g.from, k); if (w >= 0) scores.push({ p: socAt(k * 5 + 2.5), side: w, minute: k * 5 + 3 }); }
      for (const e of scores) {
        const t = d0 * 24 + g.from + e.p * len;
        if (t < a || t >= b) continue;
        const st = gameAt(placeId, t + 1e-6);
        out.push({ t, kind: "score", placeId, text: lines[fnv(`gpa|${placeId}|${day}|${t}`) % lines.length](st, e) });
      }
    }
  }
  return out.sort((x, y) => x.t - y.t);
}

// ---- social bias ------------------------------------------------------------------
// Relationships (src/city/social.js) publish one snapshot per machine day:
// {ver, boosts: {subjectKey: {placeId: frac}}}. frac > 0 pulls a subject toward a place
// their friends frequent (added as frac x their own strongest weight); frac < 0 steers
// them away from a rival's haunt (weight x (1 + frac), floor 0.3). A day without a
// snapshot behaves exactly as before. Snapshots are fixed once published, so every
// viewer and the server's quest checks see the same city.
// ---- the civic machine: THE ASSEMBLY (docs/ASSEMBLY.md) ----------------------------------
// Session 001 decides what LOT 0x6F07 becomes: APPLICATION 001, a golf course, or 002, a
// community farm. The outcome is stored in Blobs (netlify/lib/assembly.js) and set here by
// whoever builds the city: the plan builder before each day, the browser from /api/assembly.
// Everything that follows is clock math on the recorded close and winner, so every viewer
// sees the same site, the same crew, the same course or farm. Days are machine days
// (machineClock().day). The ground breaks LOT_BREAK days after the close's day: the plan
// builder never builds more than 3 days ahead, so every day with a site on it is built after
// the result is on record. The build takes LOT_BUILD days.
export const LOT_BREAK = 4, LOT_BUILD = 5;
export const LOT_WINNERS = ["golf", "farm"];
// Session 002 (THE RESORT PARCELS) decides the Coast's and the Heights' parcels the same way:
// resorts {closeAt, winners: {coast, heights} | null}, the same clock math per parcel.
export const RESORT_MOTIONS = { coast: ["beach-resort", "seaside-towers"], heights: ["ski-resort", "mountain-lodge"] };
export const PARCEL_MOTION = { "shore-lot": "coast", "summit-lot": "heights" };
let CIVIC = null;   // {closeAt: real ms, winner: "golf" | "farm" | null, resorts: {closeAt, winners} | null}
export function setCivic(c) {
  let resorts = null;
  if (c?.resorts && Number.isFinite(c.resorts.closeAt)) {
    const w = c.resorts.winners;
    const winners = w && Object.entries(RESORT_MOTIONS).every(([m, cs]) => cs.includes(w[m])) ? Object.fromEntries(Object.keys(RESORT_MOTIONS).map(m => [m, w[m]])) : null;
    resorts = { closeAt: c.resorts.closeAt, winners };
  }
  const next = c && Number.isFinite(c.closeAt) ? { closeAt: c.closeAt, winner: LOT_WINNERS.includes(c.winner) ? c.winner : null, resorts } : null;
  if (JSON.stringify(CIVIC) === JSON.stringify(next)) return false;
  CIVIC = next;
  memo.clear();
  return true;
}
export const civicState = () => (CIVIC ? { ...CIVIC } : null);
const closeDay = () => machineClock(CIVIC.closeAt).day;
// -> {phase: "vacant" | "approved" | "site" | "built", winner, breakDay, openDay, progress (0..1 on site)}
// vacant: no result yet. approved: decided, ground not yet broken.
export function lotPhase(machineTime) {
  if (!CIVIC || !CIVIC.winner) return { phase: "vacant", winner: null };
  const breakDay = closeDay() + LOT_BREAK, openDay = breakDay + LOT_BUILD;
  const day = Math.floor(machineTime / 24) + 1;
  const base = { winner: CIVIC.winner, breakDay, openDay };
  if (day < breakDay) return { ...base, phase: "approved" };
  if (day < openDay) return { ...base, phase: "site", progress: Math.min(1, Math.max(0, (machineTime - (breakDay - 1) * 24) / (LOT_BUILD * 24))) };
  return { ...base, phase: "built", ...(CIVIC.winner === "farm" && day >= FARM_PARCEL.breakDay + LOT_BUILD ? { garden: true } : {}) };
}
// THE COMMUNITY FARM (Scott 2026-10-05: session 001's winner gets a full-size site in the growth
// districts). Once session 001 has approved the farm, its parcel in the Farmland breaks ground on
// FARM_PARCEL.breakDay (the first machine day after the Farmland was built) and opens LOT_BUILD days
// later, the same construction-then-built timing as LOT 0x6F07's; LOT 0x6F07 stays as the smaller
// companion, THE COMMUNITY GARDEN (lotPhase(...).garden from the day the farm opens). A golf win
// would leave the parcel reserved (it is the farm's: the course is the Commons' lot).
export const FARM_PARCEL = { placeId: "community-farm", breakDay: 594 };
export function farmParcelPhase(machineTime) {
  if (!CIVIC || CIVIC.winner !== "farm") return { phase: "vacant", winner: null };
  const breakDay = Math.max(FARM_PARCEL.breakDay, closeDay() + LOT_BREAK), openDay = breakDay + LOT_BUILD;
  const day = Math.floor(machineTime / 24) + 1;
  const base = { winner: "farm", breakDay, openDay };
  if (day < breakDay) return { ...base, phase: "approved" };
  if (day < openDay) return { ...base, phase: "site", progress: Math.min(1, Math.max(0, (machineTime - (breakDay - 1) * 24) / (LOT_BUILD * 24))) };
  return { ...base, phase: "built" };
}
export function farmParcelOpenOn(day) {
  const p = farmParcelPhase((day - 1) * 24 + 12);
  return p.phase === "site" ? "site" : p.phase === "built" ? "farm" : null;
}
// Which crowd the lot draws on a machine day: "site", "golf", "farm", or null (closed).
export function lotOpenOn(day) {
  const p = lotPhase((day - 1) * 24 + 12);
  return p.phase === "site" ? "site" : p.phase === "built" ? p.winner : null;
}
// THE COAST's and THE HEIGHTS' resort parcels: closed until session 002 has decided and the
// ground has broken; then a site, then what won. Same timing as LOT 0x6F07, from 002's close.
export const RESORT_PARCELS = new Set(["shore-lot", "summit-lot"]);
export function resortPhase(placeId, machineTime) {
  const R = CIVIC?.resorts, m = PARCEL_MOTION[placeId];
  if (!R?.winners || !m) return { phase: "vacant", winner: null };
  const breakDay = machineClock(R.closeAt).day + LOT_BREAK, openDay = breakDay + LOT_BUILD;
  const day = Math.floor(machineTime / 24) + 1;
  const base = { winner: R.winners[m], breakDay, openDay };
  if (day < breakDay) return { ...base, phase: "approved" };
  if (day < openDay) return { ...base, phase: "site", progress: Math.min(1, Math.max(0, (machineTime - (breakDay - 1) * 24) / (LOT_BUILD * 24))) };
  return { ...base, phase: "built" };
}
// Which crowd a parcel draws on a machine day: "site", the winning bid, or null (closed).
export function resortOpenOn(placeId, day) {
  const p = resortPhase(placeId, (day - 1) * 24 + 12);
  return p.phase === "site" ? "site" : p.phase === "built" ? p.winner : null;
}
// Pull on a parcel by tier band, as the lot's.
const RESORT_PULL = { site: [0.2, 0.7, 1.6], "beach-resort": [1.2, 1.6, 1.0], "seaside-towers": [1.6, 1.0, 0.3], "ski-resort": [2.2, 1.2, 0.4], "mountain-lodge": [1.0, 1.4, 1.1] };
// May a visitor be sent to this place on this machine day? (Every place but a closed parcel.)
export function parcelOpen(placeId, day) {
  if (placeId === "dev-lot") return Boolean(lotOpenOn(day));
  if (placeId === "community-farm") return Boolean(farmParcelOpenOn(day));
  if (RESORT_PARCELS.has(placeId)) return Boolean(resortOpenOn(placeId, day));
  return true;
}
// Pull on the lot by tier band (0 top, 1 middle, 2 low), times its base leisure weight.
const LOT_PULL = { site: [0.2, 0.7, 1.6], golf: [3, 1, 0.3], farm: [0.5, 1.6, 1.6] };
const bandOf = (s) => { const t = tierIdx(s); return t <= 1 ? 0 : t <= 3 ? 1 : 2; };

const SOCIAL = new Map();
export function setSocialSnapshots(byDay) {
  let changed = false;
  for (const [d, snap] of Object.entries(byDay || {})) {
    const day = Number(d);
    if (!Number.isFinite(day) || !snap || typeof snap !== "object") continue;
    if (SOCIAL.get(day)?.ver === snap.ver) continue;
    SOCIAL.set(day, { ver: String(snap.ver ?? day), boosts: snap.boosts || {} });
    changed = true;
  }
  if (SOCIAL.size > 32) for (const d of [...SOCIAL.keys()].sort((a, b) => a - b).slice(0, SOCIAL.size - 32)) SOCIAL.delete(d);
  if (changed) memo.clear();
  return changed;
}
// ---- THE MALL (enterprise.js, docs/CITY_SPEC.md "THE MALL") -------------------------------------
// Per machine day, set by the plan builder before it builds the day (and the day before it, whose
// overnight tail the day carries): who works at a storefront instead of their assigned job, and the
// businesses' pull on everyone's leisure. Never set in a browser: browsers read the plan.
// byDay: {day: {ver, work: Map(key -> {place, shift}), shops: (list, total, s) -> list}}
const ENT = new Map();
export function setEnterprise(byDay) {
  let changed = false;
  for (const [d, e] of Object.entries(byDay || {})) {
    const day = Number(d);
    if (!Number.isFinite(day)) continue;
    if (!e) { if (ENT.delete(day)) changed = true; continue; }
    if (ENT.get(day)?.ver === e.ver) continue;
    ENT.set(day, e); changed = true;
  }
  if (changed) memo.clear();
  return changed;
}
export function clearEnterprise() { if (ENT.size) { ENT.clear(); memo.clear(); } }
// The job a subject works on a day: their storefront's, else the one assigned.
function workOf(s, day, seed) {
  const w = seed === SEED ? ENT.get(day)?.work?.get(keyOf(s)) : null;
  if (w) return w;
  const job = JOB[assignJob(s, seed).jobId];
  // THE LANES (from LANES_DAY): some of the Strip's service staff and the Works' fabricators move upstairs
  if (day >= LANES_DAY && job) for (const st of LANES_STAFF) if (st.from.includes(job.id) && h01(`${seed}|lanes-staff|${keyOf(s)}`) < st.p) return LANES_JOB[st.job];
  // THE SHORE PLAZA (from PLAZA_DAY): Irene's brewery takes a head brewer, cellar hands and servers
  if (day >= PLAZA_DAY && job) for (const st of PLAZA_STAFF) if (st.from.includes(job.id) && h01(`${seed}|plaza-staff|${keyOf(s)}`) < st.p) return PLAZA_JOB[st.job];
  return job;
}
export function clearSocialSnapshots() { if (SOCIAL.size) { SOCIAL.clear(); memo.clear(); } }
const socialVer = (day) => SOCIAL.get(day)?.ver ?? "-";

// Unbiased leisure weights (what a subject likes on their own). social.js reads these to
// work out where a subject's friends can be found.
export function baseLeisure(s, seed = SEED) { return leisureWeights(s, seed, null); }

function leisureWeights(s, seed, day = null) {
  const snap = day == null ? null : SOCIAL.get(day);
  const boost = snap?.boosts?.[keyOf(s)];
  if (!boost) return baseLeisureWeights(s, seed);
  return remember(`lwb|${subjKey(s, seed)}|${day}|${snap.ver}`, () => {
    const { list } = baseLeisureWeights(s, seed);
    const owl = isOwl(s, seed);
    const top = list.reduce((m, [, v]) => Math.max(m, v), 0) || 1;
    const w = new Map(list);
    for (const [id, frac] of Object.entries(boost)) {
      const p = PLACES[id];
      if (!p || p.kind === "home" || (p.kind === "work" && !owl) || typeof frac !== "number" || (p.from && day < p.from)) continue;   // (THE LANES: not before its day)
      if (frac >= 0) w.set(id, (w.get(id) || 0) + Math.min(frac, 1.2) * top);
      else if (w.has(id)) w.set(id, w.get(id) * Math.max(0.3, 1 + Math.max(frac, -1)));
    }
    const out = [...w.entries()];
    return { list: out, total: out.reduce((a, [, v]) => a + v, 0) };
  });
}

function baseLeisureWeights(s, seed) {
  return remember("lw|" + subjKey(s, seed), () => {
    const owl = isOwl(s, seed), t = tierIdx(s);
    const w = {};
    const add = (id, v) => { const p = PLACES[id]; if (!p || p.kind === "home") return; if (p.kind === "work" && !owl) return; w[id] = (w[id] || 0) + v; };
    const band = t <= 1 ? 0 : t <= 3 ? 1 : 2;
    for (const [id, v] of Object.entries(LEISURE_BY_BAND[band])) add(id, v);
    const f = fieldsOf(s);
    for (const [field, fw] of Object.entries(f)) for (const [id, v] of Object.entries(LEISURE_BY_FIELD[field] || {})) add(id, v * fw / 10);
    // Engine tendencies, most characteristic first. Night wanderers haunt theirs, work rooms included.
    (Array.isArray(s?.places) ? s.places : []).forEach((e, i) => { const id = ENGINE_PLACE[e]; if (id) add(id, (owl ? 6 : 4) / (1 + i * 0.5)); });
    if (owl) add("archive-stacks", 1.5);
    const list = Object.entries(w).map(([id, v]) => [id, v * Math.sqrt(PLACES[id].cap)]);
    const total = list.reduce((a, [, v]) => a + v, 0);
    return { list, total };
  });
}
// ---- THE NIGHTLIFE QUARTERS (nightlifeSim.js) -----------------------------------------------------
// The night out is a leisure stop of its own (index NIGHT_I), picked among the venues open when it
// starts, by tier band and record. AURUM's rope: the top band walks in; the middle band waits and is
// let in about one time in three; the lowest is turned away and goes elsewhere (nightlifeSim ropeCheck).
export const NIGHT_I = 7;
const NIGHT_EARLY = 0.3;   // a train caught early lands this much before the stop's hour: still open then
const NIGHT_OUT_SKIP = new Set(["liquor-24", "cut-rate", "the-coop", "the-cut", "hinoki"]);   // a night out is not an errand or a dinner
export function ropeOf(s, day, seed = SEED) { return ropeCheck(bandOf(s), h01(`${seed}|rope|${keyOf(s)}|${day}`)); }
function pickNight(s, day, seed, hour) {
  const band = bandOf(s), f = fieldsOf(s), rope = ropeOf(s, day, seed);
  const list = [];
  for (const [id, v] of Object.entries(LEISURE_BY_BAND[band])) {
    if (!NIGHT_SET.has(id) || NIGHT_OUT_SKIP.has(id) || !nightOpenAt(id, hour) || !nightOpenAt(id, hour - NIGHT_EARLY)) continue;
    if (ROPE_PLACES.has(id) && rope === "REFUSED") continue;   // turned away at the rope: elsewhere tonight
    let w = v;
    for (const [field, fw] of Object.entries(f)) w += (LEISURE_BY_FIELD[field]?.[id] || 0) * fw / 10;
    list.push([id, w * Math.sqrt(PLACES[id].cap)]);
  }
  if (!list.length) return null;
  const total = list.reduce((a, [, v]) => a + v, 0);
  let r = h01(`${seed}|nightpick|${keyOf(s)}|${day}`) * total;
  for (const [id, v] of list) if ((r -= v) <= 0) return id;
  return list[list.length - 1][0];
}
// After a day's stops are laid: a booked set is worked (the performer's work stop at the venue,
// whatever else the night held), else perhaps a night out, more on Fridays and Saturdays, staying
// to closing time or near it (the crowd spills out at close). Nobody on a night shift goes out.
function nightStops(s, day, seed, stops, pick, owl) {
  const key = keyOf(s);
  // a stay at a venue ends at its closing time (the restaurant at 23:30, the club at 04:00)
  for (let k = stops.length - 1; k >= 0; k--) {
    const st = stops[k];
    if (st.activity !== "leisure" || !NIGHT_HOURS[st.placeId]) continue;
    st.to = Math.min(st.to, nightCloseFor(st.placeId, st.from));
    if (st.to - st.from < 0.5) stops.splice(k, 1);
  }
  const gig = gigOf(key, day);
  if (gig) {
    const a = gig.from - 0.4, b = gig.to + 0.1;
    // the evening before a set is kept clear (a ride across the city can take two hours): work is cut
    // short half an hour before, leisure three hours before; the performer arrives early, and waits
    for (let k = stops.length - 1; k >= 0; k--) {
      const st = stops[k], lead = st.activity === "work" ? 0.5 : 3;
      if (st.to <= a - lead || st.from >= b + 0.3) continue;
      if (st.from < a - lead - 0.5) st.to = a - lead; else stops.splice(k, 1);
    }
    stops.push({ placeId: gig.venue, from: a, to: b, activity: "work", gig: true });
    stops.sort((x, y) => x.from - y.from);
    return;
  }
  if (h01(`${seed}|nightout|${key}|${day}`) >= (NIGHT_OUT_P[weekdayOf(day)] || 0.06) * (owl ? 1.6 : 1)) return;
  if (stops.some(st => st.activity === "work" && st.to > 23.3)) return;
  const r1 = h01(`${seed}|nightout-t|${key}|${day}`), r2 = h01(`${seed}|nightout-l|${key}|${day}`);
  let from = 21.9 + r1 * 1.6;
  const last = stops[stops.length - 1];
  if (last) {
    if (last.activity === "leisure" && last.to > from - 0.35) last.to = Math.max(last.from + 0.5, from - 0.35);
    from = Math.max(from, last.to + 0.35);
  }
  if (from > 24.6) return;
  const placeId = pick(NIGHT_I, undefined, from);
  const o = placeId && NIGHT_HOURS[placeId];
  if (!o) return;
  // a day-shift worker is home by half past two: the morning's commute must not meet the night's
  const big = weekdayOf(day) === 5 || weekdayOf(day) === 6;   // Friday and Saturday nights run later
  const close = Math.min(o[1] - o[0] >= 24 ? from + 1.5 : o[1], shiftOf(s, workOf(s, day, seed), seed) === "day" ? (big ? 27.5 : 26.5) : 28);
  const to = r2 < 0.5 ? close - r2 * 0.3 : Math.min(close, from + 1.5 + r2 * 3);
  if (to - from < 0.75) return;
  stops.push({ placeId, i: NIGHT_I, from, to, activity: "leisure", night: true });
}
function pickLeisure(s, day, i, seed, avoid, hour = null) {
  if (i === NIGHT_I) return pickNight(s, day, seed, hour ?? 22);
  let { list, total } = leisureWeights(s, seed, day);
  // THE NIGHTLIFE QUARTERS: a venue takes visitors only while it is open when the visit starts
  if (hour != null) { const n = list.length; list = list.filter(([id]) => !NIGHT_HOURS[id] || (nightOpenAt(id, hour) && nightOpenAt(id, hour - NIGHT_EARLY))); if (list.length !== n) total = list.reduce((a, [, v]) => a + v, 0); }
  // The lot takes visitors only once something is being built on it, and who comes follows
  // what it is: the site crew from the lower bands, golfers from the top, farmers from the rest.
  const lot = lotOpenOn(day);
  // THE COMMUNITY FARM: closed until its site opens, then the site's pull, then the farm's
  if (list.some(([id]) => id === "community-farm")) {
    const o = farmParcelOpenOn(day);
    list = o ? list.map(([id, v]) => [id, id === "community-farm" ? v * LOT_PULL[o][bandOf(s)] : v]) : list.filter(([id]) => id !== "community-farm");
  }
  if (list.some(([id]) => id === "dev-lot") && (!lot || LOT_PULL[lot][bandOf(s)] !== 1)) {
    list = lot ? list.map(([id, v]) => [id, id === "dev-lot" ? v * LOT_PULL[lot][bandOf(s)] : v]) : list.filter(([id]) => id !== "dev-lot");
    total = list.reduce((a, [, v]) => a + v, 0);
  }
  // The resort parcels (THE ASSEMBLY, session 002) take nobody until something is being built on
  // them; then the crew, then whoever the winning bid draws.
  if (list.some(([id]) => RESORT_PARCELS.has(id))) {
    list = list.flatMap(([id, v]) => { if (!RESORT_PARCELS.has(id)) return [[id, v]]; const o = resortOpenOn(id, day); return o ? [[id, v * RESORT_PULL[o][bandOf(s)]]] : []; });
    total = list.reduce((a, [, v]) => a + v, 0);
  }
  // THE MALL: the businesses trading that day draw their customers (enterprise.js shopsFor)
  const ent = seed === SEED ? ENT.get(day) : null;
  if (ent?.shops) { list = ent.shops(list, total, s, hour); total = list.reduce((a, [, v]) => a + v, 0); }
  // THE LANES (from LANES_DAY): open noon to two; league nights pull harder
  if (day >= LANES_DAY && lanesHours(hour)) {
    const f = fieldsOf(s);
    let v = LANES_PULL.band[bandOf(s)] + ((f.sport || 0) * LANES_PULL.sport + (f.hospitality || 0) * LANES_PULL.hospitality) / 10;
    if (hour != null && hour >= 19 && LEAGUE_DAYS.includes(weekdayOf(day))) v *= LANES_PULL.league;
    v *= Math.sqrt(PLACES[LANES_PLACE[0]].cap);
    list = [...list, [LANES_PLACE[0], v]]; total += v;
  }
  // A fixture on at the ground when the visit starts pulls its fans (and the curious) in.
  const on = hour == null ? null : gamesOn(day, hour);
  if (on) { list = list.map(([id, v]) => [id, on.has(id) ? v * GAME_PULL : v]); total = list.reduce((a, [, v]) => a + v, 0); }
  let r = h01(`${seed}|leis|${keyOf(s)}|${day}|${i}`) * total;
  for (const [id, v] of list) { if ((r -= v) <= 0) return id === avoid && list.length > 1 ? list[(list.findIndex(x => x[0] === id) + 1) % list.length][0] : id; }
  return list[list.length - 1][0];
}

// ---- capacity -----------------------------------------------------------------------
// Rooms have a capacity (roughly what a cutaway room can show without a heap). With a
// roster registered (setRoster), each machine day's leisure visits are allocated in a
// stable claim order: a subject whose chosen place is full for any half hour of the
// visit goes to the first place in that place's overflow chain with room (same kind
// first, nearest first, then any leisure room). Everyone bumped from the same place at
// the same time lands on the same next place, so friends who were headed there together
// stay together. Figures on file claim first, so their day never depends on who else the
// census holds: the server's quest checks (which register only them) see the same city
// as every browser. Subjects outside the registered roster keep their raw choice.
const FAMILY = [
  ["dive-bar", "the-lantern", "rooftop-lounge", "members-club", "casino"],
  ["the-grind", "the-drip", "all-night-diner", "canteen", "base-lodge"],
  ["gallery", "gallery-annex", "playhouse", "concert-hall", "studio-row"],
  ["park", "allotment", "the-plaza", "the-street", "rec-park", "forum"],
  ["market", "night-market"],
  ["stacks", "lecture-hall", "archive-stacks"],
  ["gym", "stadium", "ball-field", "courts", "pitch"],
  ["beach", "boardwalk", "pier", "surf"],
  ["slopes", "base-lodge"],
];
for (const [k, id] of FUNNEL_FAMILY) FAMILY[k].push(id);
// PHASE 2 step 3: the pubs with the bars, the market and the shops with the markets, the museum
// with the galleries, the square and the park with the parks, the cathedral with nothing (it is big)
FAMILY[0].push("the-anchor", "the-old-bell"); FAMILY[4].push("covered-market", "high-street", "market-row", "chandlery"); FAMILY[2].push("city-museum"); FAMILY[3].push("cathedral-square", "port-park", "bowling-green", "the-close");
for (const [k, id] of VENUE_FAMILY) FAMILY[k].push(id);
for (const [k, id] of STORE_FAMILY) FAMILY[k].push(id);
for (const [k, id] of MOUNTAIN_FAMILY) FAMILY[k].push(id);
for (const [k, id] of NIGHT_FAMILY) FAMILY[k].push(id);
for (const [k, id] of EAST_FAMILY) FAMILY[k].push(id);
for (const [k, id] of STEP5_FAMILY) FAMILY[k].push(id);
const dist2 = (a, b) => (PLACES[a].pos.x - PLACES[b].pos.x) ** 2 + (PLACES[a].pos.y - PLACES[b].pos.y) ** 2;
// (a storefront unit takes visitors only while a business trades in it: enterprise.js, below)
const LEISURE_ROOMS = Object.values(PLACES).filter(p => (p.kind === "leisure" || p.kind === "mixed") && !UNIT_SET.has(p.id) && !p.from).map(p => p.id);
const overflowNow = () => Object.fromEntries(Object.keys(PLACES).map(id => {
  const fam = (FAMILY.find(f => f.includes(id)) || []).filter(q => q !== id).sort((a, b) => dist2(id, a) - dist2(id, b));
  const rest = LEISURE_ROOMS.filter(q => q !== id && !fam.includes(q)).sort((a, b) => dist2(id, a) - dist2(id, b));
  return [id, [...fam, ...rest]];
}));
// nearest first, so it depends on where Sam's and Irene's stand (THE SHORE PLAZA): one for each side
// of PLAZA_DAY
placedOn(PLAZA_DAY - 1);
const OVERFLOW_PRE_PLAZA = overflowNow();
placedOn(PLAZA_DAY);
export const OVERFLOW = overflowNow();
const overflowOn = (day) => (plazaOn(day) ? OVERFLOW : OVERFLOW_PRE_PLAZA);

let ROSTER_KEYS = null, ROSTER_ORDER = [], ROSTER_VER = "-";
export function setRoster(list) {
  const people = (list || []).filter(Boolean);
  const onFile = (s) => s.kind !== "citizen" && !s.referred && !s.engine;
  const byHash = (a, b) => fnv(`order|${keyOf(a)}`) - fnv(`order|${keyOf(b)}`) || (keyOf(a) < keyOf(b) ? -1 : 1);
  const seen = new Set(), order = [];
  for (const s of [...people.filter(onFile).sort(byHash), ...people.filter(s => !onFile(s)).sort(byHash)]) {
    const k = keyOf(s); if (seen.has(k)) continue; seen.add(k); order.push(s);
  }
  const ver = String(fnv(order.map(s => `${keyOf(s)}:${tierOf(s)}:${printOf(s)}`).join(",")));
  if (ver === ROSTER_VER) return false;
  ROSTER_ORDER = order; ROSTER_KEYS = seen; ROSTER_VER = ver;
  memo.clear();
  return true;
}
export function clearRoster() { if (ROSTER_KEYS) { ROSTER_KEYS = null; ROSTER_ORDER = []; ROSTER_VER = "-"; memo.clear(); } }
export const rosterVersion = () => ROSTER_VER;

const HB = 0.5, NB = 60;   // half-hour buckets across 0-30h of a planned day
const bucket = (h) => Math.max(0, Math.min(NB, Math.round(h / HB)));
function allocFor(day, seed) {
  return remember(`alloc|${ROSTER_VER}|${seed}|${day}|${socialVer(day)}`, () => {
    const load = new Map(), moved = new Map();
    const L = (p) => { let a = load.get(p); if (!a) { a = new Uint16Array(NB + 1); load.set(p, a); } return a; };
    const fits = (p, a, b) => { const x = L(p), cap = PLACES[p].cap; for (let k = a; k < b; k++) if (x[k] + 1 > cap) return false; return true; };
    const peakOf = (p, a, b) => { const x = L(p); let m = 0; for (let k = a; k < b; k++) m = Math.max(m, x[k] / PLACES[p].cap); return m; };
    const add = (p, a, b) => { const x = L(p); for (let k = a; k < b; k++) x[k]++; };
    // Claim order: figures on file (work, then visits), then everyone else (work, then
    // visits). A stay can start as early as the previous stop ends (people leave as soon
    // as they're free), so a visit's window opens at the earlier of the two.
    const plans = ROSTER_ORDER.map(s => ({ s, key: keyOf(s), stops: planStops(s, day, seed, (i, avoid, hr) => pickLeisure(s, day, i, seed, avoid, hr)).stops }));
    const nOnFile = ROSTER_ORDER.findIndex(s => s.kind === "citizen" || s.referred || s.engine);
    const groups = nOnFile < 0 ? [plans] : [plans.slice(0, nOnFile), plans.slice(nOnFile)];
    for (const group of groups) {
      for (const { stops } of group) for (const st of stops) if (st.activity !== "leisure") add(st.placeId, bucket(st.from), Math.max(bucket(st.from) + 1, bucket(st.to)));
      for (const { s, key, stops } of group) {
        let prevTo = null;
        for (const st of stops) {
          if (st.activity === "leisure") {
            const a = bucket(Math.min(st.from, prevTo ?? st.from) - 0.25), b = Math.max(a + 1, bucket(st.to + 0.25));
            let p = st.placeId;
            if (!fits(p, a, b)) {
              // (a club is no overflow at noon; the rope and the mezzanine are not an overflow for whoever the door turns away)
              const chain = (overflowOn(day)[p] || []).filter(q => parcelOpen(q, day) && nightOpenThrough(q, st.from - NIGHT_EARLY, st.to) && (!ROPE_PLACES.has(q) || (q === "aurum-vip" ? bandOf(s) === 0 : ropeOf(s, day, seed) !== "REFUSED")));
              p = chain.find(q => fits(q, a, b)) || [p, ...chain].reduce((best, q) => (peakOf(q, a, b) < peakOf(best, a, b) ? q : best), p);
              if (p !== st.placeId) moved.set(`${key}|${st.i}`, p);
            }
            add(p, a, b);
          }
          prevTo = st.to;
        }
      }
    }
    return moved;
  });
}
function allocatedPick(s, day, i, seed, avoid, hour) {
  if (ROSTER_KEYS && ROSTER_KEYS.has(keyOf(s))) {
    const p = allocFor(day, seed).get(`${keyOf(s)}|${i}`);
    if (p) return p;
  }
  return pickLeisure(s, day, i, seed, avoid, hour);
}

// ---- the Loop -----------------------------------------------------------------------
// The elevated ring line (it replaced the v1 data bus, on the same ring through the
// gutters). Clockwise. Arc position s = cells along the ring from its top-left corner.
// One STATION per district; the flank districts (Arena, Archive) sit on the side edges so
// the stations spread round the ring. Trains of 3-4 cars run a fixed timetable counted
// from machine hour 0: every viewer sees the same train at the same platform.
const X0 = Math.min(...LOOP_DISTRICTS.map(d => d.rect.x)), X1 = Math.max(...LOOP_DISTRICTS.map(d => d.rect.x + d.rect.w));
const MID = DISTRICT.hq.rect;
const TOP_Y = (Math.max(...LOOP_DISTRICTS.filter(d => d.rect.y + d.rect.h <= MID.y).map(d => d.rect.y + d.rect.h)) + MID.y) / 2;
const BOT_Y = (Math.min(...LOOP_DISTRICTS.filter(d => d.rect.y >= MID.y + MID.h).map(d => d.rect.y)) + MID.y + MID.h) / 2;
const RING = { x: X0 - 1.5, y: TOP_Y, w: X1 - X0 + 3, h: BOT_Y - TOP_Y };
const LOOP_L = 2 * (RING.w + RING.h);
const mod = (v, m) => ((v % m) + m) % m;
function loopAt(s) {
  s = mod(s, LOOP_L);
  const r = RING;
  if (s < r.w) return { x: r.x + s, y: r.y };
  s -= r.w; if (s < r.h) return { x: r.x + r.w, y: r.y + s };
  s -= r.h; if (s < r.w) return { x: r.x + r.w - s, y: r.y + r.h };
  s -= r.w; return { x: r.x, y: r.y + r.h - s };
}

export const V_WALK = 60;           // cells per machine hour on foot
export const V_TRAIN = 600;         // cells per machine hour between stations
export const DWELL = 1.5 / 60;      // machine hours a train stands at each platform
export const CAR_LEN = 2.4, CAR_GAP = 0.5, CAR_CAP = 16;   // cells; seats (standing is extra, and noted)
const CAR_PITCH = CAR_LEN + CAR_GAP;
const PLATFORM_OFF = 0.9;           // the platform edge, beside the track on the district's side
const PLATFORM_MIN = 0.1;           // reach the platform this long before the train, or take the next
// Off the car and onto the platform, before the doors close. Longer than one census
// period (the views sample once a machine minute), so every alighter is seen alighting.
const ALIGHT = DWELL * 0.8;
// THE LOOP'S VERSIONS. Version 1: five trains [4, 3, 4, 4, 3], one every LAP / 5. Version 2 (PHASE 2,
// capacity: at 5,000 subjects version 1's busiest car carried two to three times the 1.5x-seated
// limit of 24): every gap between version 1's trains split in LOOP_SPLIT, a new four-car train in
// each new slot. Version 1's five keep their ids (L1-L5), their indices (0-4: a published plan's k),
// their cars and their offsets exactly (k x LAP / 5), so every train of every day published on
// version 1 runs where it always ran and is drawn there; the new trains (L6 on) run between them,
// empty on those days. A line is never retimed in place: version 2's timetable is version 1's
// with trains added, and the first day built after the deploy is the first planned on it.
// check-plans holds a network-5 day (fixtures/net5-plan-day300.json) train by train, car by car.
export const LOOP_VERSION = 2;
const TRAIN_CARS_V1 = [4, 3, 4, 4, 3], LOOP_SPLIT = 3, NEW_CARS = 4;
const TRAIN_CARS = [...TRAIN_CARS_V1, ...TRAIN_CARS_V1.flatMap(() => Array(LOOP_SPLIT - 1).fill(NEW_CARS))];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Stations. n: unit normal from the track towards the district (the platform side).
function stationFor(d) {
  const r = d.rect, cx = r.x + r.w / 2, cy = r.y + r.h / 2, midY = RING.y + RING.h / 2;
  const flank = r.y < midY && r.y + r.h > midY;
  let s, n;
  if (flank && r.x <= X0 + 1) { s = 2 * RING.w + RING.h + (RING.y + RING.h - cy); n = { x: 1, y: 0 }; }
  else if (flank && r.x + r.w >= X1 - 1) { s = RING.w + (cy - RING.y); n = { x: -1, y: 0 }; }
  else if (Math.abs(cy - RING.y) <= Math.abs(cy - (RING.y + RING.h))) { s = cx - RING.x; n = { x: 0, y: cy < RING.y ? -1 : 1 }; }
  else { s = RING.w + RING.h + (RING.x + RING.w - cx); n = { x: 0, y: cy > RING.y + RING.h ? 1 : -1 }; }
  const at = loopAt(s);
  const gate = { x: clamp(at.x, r.x, r.x + r.w), y: clamp(at.y, r.y, r.y + r.h) };
  const entrance = { x: at.x + n.x * PLATFORM_OFF, y: at.y + n.y * PLATFORM_OFF };
  return { id: d.id, districtId: d.id, name: `${d.name.replace(/^THE /, "")} STATION`, addr: d.addr, s, x: at.x, y: at.y, n, gate, entrance };
}
export const STATIONS = Object.fromEntries(LOOP_DISTRICTS.map(d => [d.id, stationFor(d)]));
// Ring order, clockwise from the top-left corner. ARR: when a train reaches each, within a lap.
export const STATION_ORDER = Object.values(STATIONS).sort((a, b) => a.s - b.s).map(st => st.id);
const ARR = [];
{
  let t = 0;
  STATION_ORDER.forEach((id, i) => {
    const st = STATIONS[id], next = STATIONS[STATION_ORDER[(i + 1) % STATION_ORDER.length]];
    st.index = i; st.next = next.id; st.gap = mod(next.s - st.s, LOOP_L);
    ARR.push(t); st.lapOffset = t;
    t += DWELL + st.gap / V_TRAIN;
  });
  ARR.push(t);
}
// The Loop's stations are its stops (line 0): the same fields every line's stops carry.
for (const st of Object.values(STATIONS)) Object.assign(st, { stationId: st.id, lineId: "loop", line: 0, dwell: DWELL, base: 0 });
const LAP = ARR[ARR.length - 1];
const HEADWAY_V1 = LAP / TRAIN_CARS_V1.length;
const trainLen = (n) => n * CAR_LEN + (n - 1) * CAR_GAP;
// Each train's place in the timetable (hours into the lap). Version 1's at k x HEADWAY_V1 (the same
// expression as ever, so the same machine hours to the last bit); in each gap between two of them,
// LOOP_SPLIT - 1 new ones. A train carries whoever reached the platforms since the one before it,
// so each slot is sized to the cars of the train it brings in (a three-car train gets the shorter
// gap ahead of it), but never so short that a train reaches a platform before the one ahead has
// cleared it by LOOP_CLEAR cells.
const LOOP_CLEAR = 1.1;
const minGap = (front, back) => DWELL + ((trainLen(front) + trainLen(back)) / 2 + LOOP_CLEAR) / V_TRAIN;
const OFF = TRAIN_CARS.slice();
const SLOTS = [];   // [hours into the lap, train index], in order round the lap
TRAIN_CARS_V1.forEach((carsK, i) => {
  const next = TRAIN_CARS_V1[(i + 1) % TRAIN_CARS_V1.length], ks = Array.from({ length: LOOP_SPLIT - 1 }, (_, r) => TRAIN_CARS_V1.length + i * (LOOP_SPLIT - 1) + r);
  const cars = [...ks.map(k => TRAIN_CARS[k]), next], fronts = [carsK, ...ks.map(k => TRAIN_CARS[k])];
  const mins = cars.map((c, r) => minGap(fronts[r], c));
  let g = cars.map(c => HEADWAY_V1 * c / cars.reduce((a, b) => a + b, 0));
  const low = g.map((x, r) => x < mins[r]);
  if (low.some(Boolean)) { const fixed = mins.reduce((a, m, r) => a + (low[r] ? m : 0), 0), w = cars.reduce((a, c, r) => a + (low[r] ? 0 : c), 0); g = g.map((x, r) => (low[r] ? mins[r] : (HEADWAY_V1 - fixed) * cars[r] / w)); }
  OFF[i] = i * HEADWAY_V1;
  SLOTS.push([OFF[i], i]);
  let at = OFF[i];
  ks.forEach((k, r) => { at += g[r]; OFF[k] = at; SLOTS.push([at, k]); });
});
const GAPS = SLOTS.map(([o], q) => mod((SLOTS[(q + 1) % SLOTS.length][0] - o), LAP));
// The longest wait at a platform (what a trip plans for, and the board's "EVERY N MIN").
export const HEADWAY = Math.max(...GAPS);
export const LOOP_GAPS = { min: Math.min(...GAPS), max: HEADWAY, v1: HEADWAY_V1 };
export const TRAINS = TRAIN_CARS.map((cars, k) => ({ id: `L${k + 1}`, index: k, name: `LOOP ${k + 1}`, cars, carCap: CAR_CAP, cap: cars * CAR_CAP, length: trainLen(cars) }));
export const TRAIN = Object.fromEntries(TRAINS.map(t => [t.id, t]));

// Centre of car c when the train's middle is at arc m (car 0 leads, clockwise).
const carArc = (k, c, m) => m + TRAINS[k].length / 2 - c * CAR_PITCH - CAR_LEN / 2;
const platformSpot = (st, s) => { const p = loopAt(s); return { x: p.x + st.n.x * PLATFORM_OFF, y: p.y + st.n.y * PLATFORM_OFF }; };

// Train k at machine hour T: the arc of its middle, and whether it stands at a platform.
function trainState(k, T) {
  const tau = mod(T - OFF[k], LAP);
  let i = STATION_ORDER.length - 1;
  while (i > 0 && ARR[i] > tau) i--;
  const st = STATIONS[STATION_ORDER[i]], dt = tau - ARR[i];
  if (dt < DWELL) return { mid: st.s, dwell: true, stationId: st.id, nextStationId: st.next, since: dt };
  return { mid: st.s + (dt - DWELL) * V_TRAIN, dwell: false, stationId: null, lastStationId: st.id, nextStationId: st.next };
}
function carPoint(k, c, T) { return loopAt(carArc(k, c, trainState(k, T).mid)); }

// -> [{id, index, name, s (head arc), mid, x, y (middle), dwell, stationId, nextStationId,
//      length, carCap, cap, cars: [{index, s, x, y}]}]. What the renderers draw.
export function trainsAt(machineTime) {
  const T = toHours(machineTime);
  return TRAINS.map((t, k) => {
    const st = trainState(k, T), p = loopAt(st.mid);
    const cars = Array.from({ length: t.cars }, (_, c) => { const s = carArc(k, c, st.mid); return { index: c, s: mod(s, LOOP_L), ...loopAt(s) }; });
    return { id: t.id, index: k, name: t.name, s: mod(st.mid + t.length / 2, LOOP_L), mid: mod(st.mid, LOOP_L), x: p.x, y: p.y, dwell: st.dwell, stationId: st.stationId, lastStationId: st.lastStationId || st.stationId, nextStationId: st.nextStationId, length: t.length, carCap: t.carCap, cap: t.cap, cars };
  });
}

// The first train to reach a station at or after machine hour t -> {trainId, k, arrive, depart, j}
// (j counts the slots from machine hour 0: the PA's key).
export function nextArrival(stationId, t) {
  const i = STATIONS[stationId].index, x = toHours(t) - ARR[i];
  let n = Math.floor(x / LAP), q = SLOTS.findIndex(([o]) => n * LAP + o >= x - 1e-9);
  if (q < 0) { n++; q = 0; }
  const k = SLOTS[q][1], arrive = ARR[i] + n * LAP + SLOTS[q][0];
  return { trainId: TRAINS[k].id, k, stationId, arrive, depart: arrive + DWELL, j: n * SLOTS.length + q };
}
// The platform board: the next n trains at a station from machine hour t.
export function timetable(stationId, t, n = 4) {
  const out = [];
  let a = nextArrival(stationId, t);
  for (let i = 0; i < n; i++) { out.push(a); a = nextArrival(stationId, a.arrive + LOOP_GAPS.min / 2); }
  return out;
}
const rideHours = (a, b) => mod(STATIONS[b].lapOffset - STATIONS[a].lapOffset, LAP);

// The PA. Deterministic per event, so every viewer hears the same line.
const PA = {
  arrive: [
    (st, t) => `THE LOOP ARRIVES AT ${st}. THOSE WITH SOMEWHERE TO BE, BOARD. THE REST OF YOU ALSO BOARD.`,
    (st, t) => `${t} NOW STANDING AT ${st}. MIND THE GAP. THE GAP IS MONITORED.`,
    (st, t) => `${st}. ALIGHT IF INSTRUCTED. REMAIN IF NOT. BOTH ARE LOGGED.`,
    (st, t) => `${t} AT ${st}. PLEASE ALLOW THE ASSESSED TO LEAVE THE CAR BEFORE BOARDING TO BE ASSESSED.`,
  ],
  depart: [
    (st, t) => `${t} DEPARTS ${st}. THE DOORS DO NOT REOPEN. NEITHER DOES YOUR FILE.`,
    (st, t) => `THE LOOP LEAVES ${st} ON TIME. IT HAS NO REASON NOT TO.`,
    (st, t) => `STAND CLEAR AT ${st}. THE LOOP DOES NOT STOP FOR YOU. IT STOPS FOR THE TIMETABLE.`,
  ],
};
// -> [{t, kind: 'arrive'|'depart', trainId, stationId, text}] for machine hours [from, to).
export function loopEvents(from, to) {
  const a = toHours(from), b = toHours(to), out = [];
  for (const id of STATION_ORDER) {
    const i = STATIONS[id].index, name = DISTRICT[id].name;
    for (let x = nextArrival(id, a - DWELL); x.arrive < b; x = nextArrival(id, x.arrive + LOOP_GAPS.min / 2)) {
      const k = x.k, j = x.j, arrive = x.arrive, tn = TRAINS[k].name;
      const pick = (list, kind) => list[fnv(`pa|${kind}|${id}|${j}`) % list.length](name, tn);
      if (arrive >= a && arrive < b) out.push({ t: arrive, kind: "arrive", trainId: TRAINS[k].id, stationId: id, text: pick(PA.arrive, "a") });
      if (arrive + DWELL >= a && arrive + DWELL < b) out.push({ t: arrive + DWELL, kind: "depart", trainId: TRAINS[k].id, stationId: id, text: pick(PA.depart, "d") });
    }
  }
  return out.sort((x, y) => x.t - y.t);
}

export const LOOP_LINE = {
  loop: { ...RING }, length: LOOP_L, at: loopAt, stations: STATIONS, order: STATION_ORDER,
  lapHours: LAP, headway: HEADWAY, version: LOOP_VERSION, dwell: DWELL, speed: V_TRAIN, carLen: CAR_LEN, carGap: CAR_GAP, carCap: CAR_CAP, platformOffset: PLATFORM_OFF,
  // v1 name: the stops, keyed by district, with the same {s, x, y, gate} shape.
  stops: STATIONS,
};
// v1 aliases: the bus is now the Loop.
export const BUS = LOOP_LINE;
export const V_BUS = V_TRAIN;

// ---- the spurs (THE COAST and THE HEIGHTS, 2026-09-30) ------------------------------------------
// THE SHORE LINE and THE ALPINE LINE: surface tramways of personal pods ("ONE SUBJECT, ONE POD.
// SHARING IS UNMONITORABLE.") from a stop beside a hub Loop station, along the street and down
// the gutter, to a terminal in each expansion district. A pod leaves the moment its rider
// boards, so the ride is a fixed leg of the route, like a walk, at V_POD: no timetable, and the
// Loop's own timetable is untouched (every published plan's trains stay where they were).
// pts: the track, hub stop first, terminal last (map cells).
export const V_POD = 360;
export const SPURS = {
  coast: { id: "shore", districtId: "coast", hub: "works", name: "THE SHORE LINE", stop: "SHORE LINE // WORKS STOP", terminal: "SHORE LINE // COAST TERMINAL", pts: [[48.5, 44.3], [54.5, 44.3], [54.5, coastY(69.8)]] },
  heights: { id: "alpine", districtId: "heights", hub: "campus", name: "THE ALPINE LINE", stop: "ALPINE LINE // CAMPUS STOP", terminal: "ALPINE LINE // HEIGHTS TERMINAL", pts: [[48.5, 13.7], [54.5, 13.7], [54.5, heightsY(-5.6)]] },
};
export const SPUR_BY_ID = Object.fromEntries(Object.values(SPURS).map(sp => [sp.id, sp]));
for (const sp of Object.values(SPURS)) {
  let L = 0;
  for (let i = 1; i < sp.pts.length; i++) L += Math.hypot(sp.pts[i][0] - sp.pts[i - 1][0], sp.pts[i][1] - sp.pts[i - 1][1]);
  sp.length = L; sp.hours = L / V_POD;
  const [a, b] = [sp.pts[0], sp.pts[sp.pts.length - 1]];
  sp.stopAt = { x: a[0], y: a[1] }; sp.termAt = { x: b[0], y: b[1] };
}
// A ride on a spur: toward the district (in) or back to the hub (out).
function podLeg(districtId, dir) {
  const sp = SPURS[districtId], pts = (dir === "in" ? sp.pts : [...sp.pts].reverse()).map(([x, y]) => ({ x, y }));
  return { a: pts[0], b: pts[pts.length - 1], pts, mode: "pod", spur: sp.id, dir, dur: sp.hours, district: districtId };
}

// ---- the lines (PHASE 2, docs/planning/MASTER_PLAN.md) ---------------------------------------------
// Rail lines as first-class things (lines.js): each its own clock from machine hour 0, stops at
// arcs, trains of cars. THE LOOP is line 0, exactly as above (its functions are its own: no
// published day's train moves). LINES is append-only: a plan names a line by its index, and a
// line is never retimed in place (a change is a new version at a new index; the old one stays
// decodable, `retired`, until no published day names it).
// NET: the network a day is built on. 2 = the Loop and the pods (layout 2); 3 = the Shore and Alpine
// Lines (layout 3); 4 = the Shore Line to the Port (version 2) and the West Line (layout 4); 5 = the
// Central Line across the core, through the monolith; 6 = the Loop's version 2 (three times the trains)
// and every trip planned over every line in service, a trip between two Loop districts included (until
// 5 those always rode the Loop, the long way round a one-way ring if need be: now the Central Line, a
// walk, or the Loop, whichever is quickest); 7 = THE EAST LINE to the Suburbs and the Airport (layout 5);
// 8 = THE WEST LINE's version 2 to the Farmland and THE ENGINE SHUTTLE (layout 6).
// A plan's trips carry what they rode, so a day built on one network is read on the next.
export let NET = 8;
export const LOOP = {
  id: "loop", index: 0, version: LOOP_VERSION, kind: "ring", name: "THE LOOP", short: "LOOP", prefix: "L", color: "#22d3ee",
  at: loopAt, length: LOOP_L, stops: STATION_ORDER.map(id => STATIONS[id]), ARR, lap: LAP, headway: HEADWAY, speed: V_TRAIN, trains: TRAINS,
};
// THE SHORE LINE and THE ALPINE LINE (step 2): real rail in place of the pods, each a double-track
// viaduct on its own timetable. The Shore Line from its Works terminal (in the gutter between the
// Works and the Sprawl, a short walk from the Loop's Works station) south to the street behind
// the Coast and west along it; the Alpine Line from its Campus terminal (the gutter between
// Campus and Finance) north through the foothills and the village, up the mountain to the crest.
const LINE_DWELL = DWELL, LAYOVER = 3 / 60;
// The Alpine Line climbs: its deck rises on a ramp from the foot of the mountain to the crest's
// height (level over the Summit's platform), always over the mountain's own terrain (coastGeo.js
// terrainH, which sim.js cannot import: the crest along x 54.5 is computed from the same formula
// here, and check-cityview holds the deck over the ground).
const ALPINE_X = 54.5, ALPINE_RAMP = 9;
const ALPINE_CREST = (() => {
  const T = { y0: -30.5 + HEIGHTS_DY, y1: -11 + HEIGHTS_DY }, x = ALPINE_X;
  let m = 0;
  for (let y = T.y1; y >= T.y0; y -= 0.05) {
    const s = Math.min(1, Math.max(0, (T.y1 - y) / (T.y1 - T.y0)));
    const bump = 2.6 * Math.exp(-((x - 30) ** 2) / 70) + 3.2 * Math.exp(-((x - 79) ** 2) / 90);
    const up = Math.min(1, s / 0.8), f = s <= 0.8 ? Math.pow(up, 1.3) : 1 - 0.9 * Math.pow((s - 0.8) / 0.2, 0.9);
    m = Math.max(m, f * (5.2 + 1.1 * Math.sin(x * 0.19) + 0.5 * Math.sin(x * 0.53 + 1.3) + bump * up));
  }
  return Math.ceil(m * 10) / 10;
})();
const alpineGround = (y) => ALPINE_CREST * Math.min(1, Math.max(0, (-11 + HEIGHTS_DY - y) / ALPINE_RAMP));
const SHUTTLES = [
  shuttle({
    id: "shore", index: 1, version: 1, nets: [3], retired: 4, name: "THE SHORE LINE", short: "SHORE LINE", prefix: "S", color: "#14b8a6",
    pts: [[54.5, 44.3], [54.5, coastY(65.5)], [14.4, coastY(65.5)]], R: 4,
    stations: [
      { id: "shore-works", name: "WORKS (SHORE LINE)", district: "works" },
      { id: "coast-central", name: "COAST CENTRAL", district: "coast", at: [45.5, coastY(65.5)] },
      { id: "coast-west", name: "COAST WEST", district: "coast" },
    ],
    cars: [3, 3, 3, 3, 3, 3], speed: V_TRAIN, dwell: LINE_DWELL, layover: LAYOVER,
  }),
  shuttle({
    id: "alpine", index: 2, version: 1, nets: [3, 4, 5, 6, 7, 8], name: "THE ALPINE LINE", short: "ALPINE LINE", prefix: "A", color: "#dc2626",
    pts: [[ALPINE_X, 14.2], [ALPINE_X, -39.8]], R: 4,
    stations: [
      { id: "alpine-campus", name: "CAMPUS (ALPINE LINE)", district: "campus" },
      { id: "foothills", name: "FOOTHILLS", district: "heights", at: [ALPINE_X, -5.5] },
      { id: "heights-village", name: "HEIGHTS VILLAGE", district: "heights", at: [ALPINE_X, -16.2] },
      { id: "summit", name: "SUMMIT", district: "heights" },
    ],
    cars: [3, 3, 3, 3, 3, 3], speed: V_TRAIN, dwell: LINE_DWELL, layover: LAYOVER, base: (u) => alpineGround(14.2 - u),
  }),
  // THE SHORE LINE, version 2 (step 3): on past Coast West along the street behind the Coast to the
  // Port, PORT QUAY, then north to PORT TOWN. A new version, never a retiming: version 1 keeps
  // running for any day published on network 3 until it retires.
  shuttle({
    id: "shore2", index: 3, version: 2, nets: [4, 5, 6, 7, 8], name: "THE SHORE LINE", short: "SHORE LINE", prefix: "S", idBase: 6, color: "#14b8a6",
    pts: [[54.5, 44.3], [54.5, coastY(65.5)], [-30, coastY(65.5)], [-30, 36]], R: 4,
    stations: [
      { id: "shore-works", name: "WORKS (SHORE LINE)", district: "works" },
      { id: "coast-central", name: "COAST CENTRAL", district: "coast", at: [45.5, coastY(65.5)] },
      { id: "coast-west", name: "COAST WEST", district: "coast", at: [19, coastY(65.5)] },
      { id: "port-quay", name: "PORT QUAY", district: "port", at: [-19, coastY(65.5)] },
      { id: "port-town", name: "PORT TOWN", district: "port" },
    ],
    cars: [3, 3, 3, 3, 3, 3, 3, 3], speed: V_TRAIN, dwell: LINE_DWELL, layover: LAYOVER,
  }),
  // THE WEST LINE (step 3): from its Arena terminal west of the Loop's Arena station, west along the
  // street between the Old Town and the Port, north into the Old Town (CATHEDRAL) and west to the
  // MARKET (the Farmland later: a new version).
  shuttle({
    id: "west", index: 4, version: 1, nets: [4, 5, 6, 7], retired: 8, name: "THE WEST LINE", short: "WEST LINE", prefix: "W", color: "#a855f7",
    pts: [[-3, 29], [-24, 29], [-24, 2], [-46.5, 2]], R: 4,
    stations: [
      { id: "west-arena", name: "ARENA (WEST LINE)", district: "arena" },
      { id: "oldtown-cathedral", name: "OLD TOWN CATHEDRAL", district: "oldtown", at: [-24, 14] },
      { id: "oldtown-market", name: "OLD TOWN MARKET", district: "oldtown" },
    ],
    cars: [3, 3, 3, 3, 3, 3], speed: V_TRAIN, dwell: LINE_DWELL, layover: LAYOVER,
  }),
  // THE CENTRAL LINE (Scott 2026-09-30: "it would make sense for the train to run through the
  // central building"): across the core on the city's axis, inside the ring. From HQ NORTH (beside
  // the Loop's DEPT HQ station, the Alpine Line's Campus terminal across the street) south through
  // the Department's plaza and through a portal in the monolith (DEPT HQ CENTRAL, its platform under
  // the tower) to HQ SOUTH (beside the Shore Line's Works terminal, under the Loop). The Heights and
  // the Coast meet through the core instead of riding round the ring. Two-car trains, its own clock.
  shuttle({
    id: "central", index: 5, version: 1, nets: [5, 6, 7, 8], name: "THE CENTRAL LINE", short: "CENTRAL LINE", prefix: "C", color: "#facc15",
    pts: [[54.5, 18.4], [54.5, 41.0]], R: 4, taper: [6.5, 9], platHL: 2.9,
    stations: [
      { id: "hq-north", name: "HQ NORTH (CENTRAL LINE)", district: "hq" },
      { id: "hq-central", name: "DEPT HQ CENTRAL", district: "hq", at: [54.5, 29.5] },
      { id: "hq-south", name: "HQ SOUTH (CENTRAL LINE)", district: "hq" },
    ],
    cars: [2, 2, 2, 2], speed: V_TRAIN, dwell: LINE_DWELL, layover: LAYOVER,
  }),
  // THE EAST LINE (PHASE 2 step 4): from its Archive terminal south-east of the Loop's Archive
  // station (in the street between Downtown and the Sprawl's north-east corner), east along y 48.5
  // into the Suburbs (SUBURBS NORTH), south down the street between the estates and the mall
  // (SUBURBS MALL), then east (SUBURBS SOUTH) to the Airport, its terminal at the departures hall's
  // doors (AIRPORT TERMINAL).
  shuttle({
    id: "east", index: 6, version: 1, nets: [7, 8], name: "THE EAST LINE", short: "EAST LINE", prefix: "E", color: "#f97316",
    pts: [[109.5, 48.5], [168.5, 48.5], [168.5, 86], [232, 86]], R: 4,
    stations: [
      { id: "east-archive", name: "ARCHIVE (EAST LINE)", district: "archive" },
      { id: "suburbs-north", name: "SUBURBS NORTH", district: "suburbs", at: [153.5, 48.5] },
      { id: "suburbs-mall", name: "SUBURBS MALL", district: "suburbs", at: [168.5, 62] },
      { id: "suburbs-south", name: "SUBURBS SOUTH", district: "suburbs", at: [182, 86] },
      { id: "airport-terminal", name: "AIRPORT TERMINAL", district: "airport" },
    ],
    cars: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3], speed: V_TRAIN, dwell: LINE_DWELL, layover: LAYOVER,
  }),
  // THE WEST LINE, version 2 (PHASE 2 step 5): version 1's route on past OLD TOWN MARKET, west along
  // y 2 out of the Old Town and north up x -56 to FARMLAND MARKET, the Farmland's market town. A new
  // version, never a retiming: version 1 keeps running for any day published on networks 4-7.
  shuttle({
    id: "west2", index: 7, version: 2, nets: [8], name: "THE WEST LINE", short: "WEST LINE", prefix: "W", idBase: 6, color: "#a855f7",
    pts: [[-3, 29], [-24, 29], [-24, 2], [-56, 2], [-56, -40]], R: 4,
    stations: [
      { id: "west-arena", name: "ARENA (WEST LINE)", district: "arena" },
      { id: "oldtown-cathedral", name: "OLD TOWN CATHEDRAL", district: "oldtown", at: [-24, 14] },
      { id: "oldtown-market", name: "OLD TOWN MARKET", district: "oldtown", at: [-41.9, 2] },
      { id: "farmland-market", name: "FARMLAND MARKET", district: "farmland" },
    ],
    cars: [3, 3, 3, 3, 3, 3, 3, 3], speed: V_TRAIN, dwell: LINE_DWELL, layover: LAYOVER,
  }),
  // THE ENGINE SHUTTLE (PHASE 2 step 5): from its Strip terminal in the street east of the Strip, north
  // past the Heights' foot, east along y -6, north up x 134 into the Engine (ENGINE CAMPUS between the
  // research park and the annex) and east along y -40 between the towers (ENGINE TOWERS).
  shuttle({
    id: "engine", index: 8, version: 1, nets: [8], name: "THE ENGINE SHUTTLE", short: "ENGINE SHUTTLE", prefix: "N", color: "#84cc16",
    pts: [[110.8, 12.5], [110.8, -6], [134, -6], [134, -40], [150, -40]], R: 4,
    stations: [
      { id: "engine-strip", name: "STRIP (ENGINE SHUTTLE)", district: "strip" },
      { id: "engine-campus", name: "ENGINE CAMPUS", district: "engine", at: [134, -24] },
      { id: "engine-towers", name: "ENGINE TOWERS", district: "engine" },
    ],
    cars: [2, 2, 2, 2, 2, 2, 2, 2], speed: V_TRAIN, dwell: LINE_DWELL, layover: LAYOVER,
  }),
];
// A stop's street gate (the foot of its stairs) and its entrance (the platform edge beside the
// track), like the Loop's; the stairs run beside the platform in the direction of travel.
for (const l of SHUTTLES) for (const st of l.stops) {
  const at = (along, lat) => ({ x: st.x + st.d.x * along * st.sd + st.n.x * lat, y: st.y + st.d.y * along * st.sd + st.n.y * lat });
  st.gate = at(0.2 + 3 + 0.4, 1.3 + 0.75 / 2);
  st.entrance = at(0, PLATFORM_OFF);
}
export const LINES = [LOOP, ...SHUTTLES];
LINES.forEach((l, i) => { if (l.index !== i) throw new Error(`line ${l.id}: index ${l.index} at ${i}`); });
export const LINE = Object.fromEntries(LINES.map(l => [l.id, l]));
// Every stop of every line by id (the Loop's are its stations, keyed by district).
export const STOPS = Object.fromEntries(LINES.flatMap(l => l.stops.map(st => [st.id, st])));
// Every line's trains by id (TRAINS stays the Loop's, in order).
for (const l of SHUTTLES) for (const t of l.trains) { t.carCap = CAR_CAP; t.cap = t.cars * CAR_CAP; t.length = trainLen(t.cars); TRAIN[t.id] = t; }
export const lineOf = (stopId) => LINE[STOPS[stopId]?.lineId] || null;
export const stationName = (stopId) => STOPS[stopId]?.name || null;
// The lines in service on network `net` (drawn, routed): the Loop always.
export const linesOn = (net = NET) => LINES.filter(l => l === LOOP || (l.nets || []).includes(net));
const lineCarArc = (line, k, c, m) => (line === LOOP ? carArc(k, c, m) : m + line.trains[k].length / 2 - c * CAR_PITCH - CAR_LEN / 2);
const lineState = (line, k, T) => (line === LOOP ? trainState(k, T) : lineTrainState(line, k, T));
const linePoint = (line, k, c, T) => (line === LOOP ? carPoint(k, c, T) : line.at(lineCarArc(line, k, c, lineState(line, k, T).mid)));
const lineArrival = (line, i, t) => (line === LOOP ? nextArrival(line.stops[i].id, t) : lineNextArrival(line, i, t));
const stopSpot = (stop, s) => { if (stop.lineId === "loop") return platformSpot(stop, s); const p = LINE[stop.lineId].at(s); return { x: p.x + stop.n.x * PLATFORM_OFF, y: p.y + stop.n.y * PLATFORM_OFF }; };
// Every line's trains at a machine time: the Loop's rows (trainsAt) and each shuttle's, the same
// shape, with `line` (the line's id). What the views draw.
export function lineTrainsAt(machineTime, net = NET) {
  const T = toHours(machineTime), out = trainsAt(machineTime).map(t => ({ ...t, line: "loop" }));
  for (const line of linesOn(net)) {
    if (line === LOOP) continue;
    line.trains.forEach((t, k) => {
      const st = lineTrainState(line, k, T), p = line.at(st.mid);
      const cars = Array.from({ length: t.cars }, (_, c) => { const s = lineCarArc(line, k, c, st.mid); return { index: c, s: mod(s, line.length), ...line.at(s) }; });
      out.push({ id: t.id, index: k, line: line.id, name: t.name, s: mod(st.mid + t.length / 2, line.length), mid: mod(st.mid, line.length), x: p.x, y: p.y, dwell: st.dwell, stationId: st.stationId, lastStationId: st.lastStationId || st.stationId, nextStationId: st.nextStationId, length: t.length, carCap: t.carCap, cap: t.cap, cars });
    });
  }
  return out;
}
// The platform board for any stop: the next n trains from machine hour t.
export function stopTimetable(stopId, t, n = 4) {
  const line = lineOf(stopId);
  if (!line) return [];
  if (line === LOOP) return timetable(stopId, t, n);
  const i = STOPS[stopId].index, out = [];
  let a = lineNextArrival(line, i, toHours(t));
  for (let j = 0; j < n; j++) { out.push(a); a = lineNextArrival(line, i, a.arrive + line.headway / 2); }
  return out;
}
export const nextArrivalAt = (stopId, t) => { const line = lineOf(stopId); return line === LOOP ? nextArrival(stopId, t) : lineNextArrival(line, STOPS[stopId].index, toHours(t)); };

// Where a subject stands inside a place: a fixed personal spot on the room's floor. Feet
// stay in the lower part of the room, well under the name on its top border, so a
// standing sprite (up to ~2.8 cells tall on the map) does not print over it.
function spotIn(placeId, key, seed) {
  const p = PLACES[placeId], r = p.rect;
  const ox = (h01(`${seed}|ox|${key}|${placeId}`) - 0.5) * Math.max(0, r.w - 2) * 0.8;
  const y0 = r.y + Math.min(2.6, r.h * 0.7), y1 = r.y + r.h - 0.4;
  return { x: p.pos.x + ox, y: y0 + h01(`${seed}|oy|${key}|${placeId}`) * Math.max(0, y1 - y0) };
}

// ---- footpaths ----------------------------------------------------------------------
// On foot, subjects walk the streets between the blocks, never through a third building:
// a shortest path around the building footprints (each lot less the pavement the views
// leave round it), through the corners. Only the buildings a walk starts or ends in are
// passable (you leave through your own walls, that is what doors are for), and the open
// lots (the Green, the Street, the Plaza, the Allotment) are ground anyone may cross.
// Leg durations follow the path's length, so walking pace never changes.
export const OPEN_LOTS = new Set(["the-green", "the-street", "the-plaza", "the-allotment", "the-diamond", "the-courts", "rec-ground", "the-pitch", "lot-6f07", "the-assembly", "the-boardwalk", "the-beach", "the-pier", ...VENUE_OPEN_LOTS, "port-park", "cathedral-square", "bowling-green", "the-close", ...MOUNTAIN_OPEN_LOTS, ...EAST_OPEN_LOTS, ...STEP5_OPEN_LOTS]);
const KERB = 0.4, CORNER = 0.3;   // the street view's footprints are the lot less 0.4
// A lot that is mostly open ground with one solid thing on it: walkers cross the ground and go
// round the thing. DEPT HQ's plaza, since the Central Line's stations stand in it (PHASE 2): the
// monolith in its middle (archGeo.js), and the Department watches whoever crosses.
export const WALK_BLOCK = { hq: { x: 50.9, y: 27.6, w: 7.2, h: 3.8 } };
// THE ATTRITION (layout 7): from RIVER_DAY the river is ground nobody walks on but at its bridges
// (river.js RIVER_BLOCKS: the water as boxes, a gap at every bridge). Two grounds, each its own corner
// graph: 0 the city as it was, 1 with the river. GROUND is the one being laid out (onGround: the day a
// trip was planned on), and every route memo names it.
let GROUND = 0;
export const groundOn = (day) => (day >= RIVER_DAY ? 1 : 0);
export function onGround(day, fn) {
  const was = GROUND, wasPlaced = PLACED_NEW;
  GROUND = groundOn(day);
  placedOn(day);   // THE SHORE PLAZA: Sam's and Irene's where they stood that day
  try { return fn(); } finally { GROUND = was; placedOn(wasPlaced ? PLAZA_DAY : PLAZA_DAY - 1); }
}
const GR = () => (GROUND ? "R" : "");
// a route to or from Sam's or Irene's in the Plaza is not the same walk as to their old lots
const GRK = (from, to) => GR() + (PLACED_NEW && (PLAZA_MOVED.has(from) || PLAZA_MOVED.has(to)) ? "P" : "");
const FOOT_BLOCKS = BUILDINGS.filter(b => !OPEN_LOTS.has(b.id)).map(b => { const r = WALK_BLOCK[b.id]; return r ? { id: b.id, x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h } : { id: b.id, x0: b.rect.x + KERB, y0: b.rect.y + KERB, x1: b.rect.x + b.rect.w - KERB, y1: b.rect.y + b.rect.h - KERB }; });
function makeFoot(blocks) {
  const inside = (p) => blocks.some(o => p.x > o.x0 && p.x < o.x1 && p.y > o.y0 && p.y < o.y1);
  const nodes = [];
  for (const o of blocks) for (const [x, y] of [[o.x0 - CORNER, o.y0 - CORNER], [o.x1 + CORNER, o.y0 - CORNER], [o.x1 + CORNER, o.y1 + CORNER], [o.x0 - CORNER, o.y1 + CORNER]]) {
    const p = { x, y };
    if (!inside(p)) nodes.push(p);
  }
  // The blocks by a coarse grid (FOOT_CELL cells a side), so a leg only tests the blocks near it: the
  // city grew to hundreds of blocks and every footpath tests every corner it can see.
  const grid = new Map();
  blocks.forEach((o, i) => {
    for (let gx = Math.floor(o.x0 / FOOT_CELL); gx <= Math.floor(o.x1 / FOOT_CELL); gx++) for (let gy = Math.floor(o.y0 / FOOT_CELL); gy <= Math.floor(o.y1 / FOOT_CELL); gy++) {
      const k = gx * 65536 + gy; let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(i);
    }
  });
  return { blocks, nodes, adj: null, grid, seen: new Uint32Array(blocks.length), stamp: 0 };
}
const FOOT_CELL = 8;
const FEET = [makeFoot(FOOT_BLOCKS), null];
const footOf = (g = GROUND) => FEET[g] || (FEET[g] = makeFoot([...FOOT_BLOCKS, ...RIVER_BLOCKS]));
export const footBlocks = (g = GROUND) => footOf(g).blocks;
// Does the segment a-b pass through the open interior of box o? (Liang-Barsky clip.)
function crosses(a, b, o) {
  const e = 1e-6, dx = b.x - a.x, dy = b.y - a.y;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, a.x - (o.x0 + e)], [dx, (o.x1 - e) - a.x], [-dy, a.y - (o.y0 + e)], [dy, (o.y1 - e) - a.y]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t1 - t0 > 1e-9;
}
function clear(a, b, skip, F = footOf()) {
  if (++F.stamp === 0xffffffff) { F.seen.fill(0); F.stamp = 1; }
  const gx0 = Math.floor(Math.min(a.x, b.x) / FOOT_CELL), gx1 = Math.floor(Math.max(a.x, b.x) / FOOT_CELL), gy0 = Math.floor(Math.min(a.y, b.y) / FOOT_CELL), gy1 = Math.floor(Math.max(a.y, b.y) / FOOT_CELL);
  for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
    const l = F.grid.get(gx * 65536 + gy);
    if (l) for (const i of l) {
      if (F.seen[i] === F.stamp) continue;
      F.seen[i] = F.stamp;
      const o = F.blocks[i];
      if (!skip.has(o.id) && crosses(a, b, o)) return false;
    }
  }
  return true;
}
// -> [a, ...corners, b]: the shortest street path from a to b, the buildings in `skip` passable.
export function footpath(a, b, skip = new Set()) {
  const FOOT = footOf();
  if (clear(a, b, skip, FOOT)) return [a, b];
  const N = FOOT.nodes, n = N.length;
  if (!FOOT.adj) {   // corner to corner, once per ground: every building (and the water) solid
    const none = new Set();
    FOOT.adj = N.map(() => []);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (clear(N[i], N[j], none, FOOT)) { const d = dist(N[i], N[j]); FOOT.adj[i].push([j, d]); FOOT.adj[j].push([i, d]); }
  }
  // Dijkstra over the corners, a and b joined to every corner they can see. Whether a corner sees a
  // or b is only tested when it could matter (the straight line is a lower bound): the same answer
  // as testing every corner first, without testing the whole city for every walk.
  const D = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
  const Dg = new Float64Array(n).fill(Infinity), prevG = new Int32Array(n).fill(-1);   // by the corners only
  const direct = new Float64Array(n), seen = new Uint8Array(n);   // seen from a: 0 untested, 1 yes, 2 no
  for (let i = 0; i < n; i++) direct[i] = dist(a, N[i]);
  const keyOfNode = (k) => (seen[k] === 2 ? Dg[k] : Math.min(Dg[k], direct[k]));
  // a binary heap of [key, corner] (the lower corner first on a tie, as a scan in order would take it)
  const H = [];
  const less = (x, y) => x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]);
  const push = (e) => { H.push(e); let c = H.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (!less(H[c], H[p])) break; [H[c], H[p]] = [H[p], H[c]]; c = p; } };
  const pop = () => { const top = H[0], e = H.pop(); if (H.length) { H[0] = e; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < H.length && less(H[l], H[m])) m = l; if (r < H.length && less(H[r], H[m])) m = r; if (m === c) break; [H[c], H[m]] = [H[m], H[c]]; c = m; } } return top; };
  for (let i = 0; i < n; i++) push([direct[i], i]);
  let best = Infinity, last = -1;
  while (H.length) {
    const [ki, i] = pop();
    if (done[i] || ki !== keyOfNode(i)) continue;   // finished, or a stale entry
    if (ki >= best) break;
    if (seen[i] !== 2 && direct[i] <= Dg[i]) {
      if (seen[i] === 1 || clear(a, N[i], skip, FOOT)) { seen[i] = 1; D[i] = direct[i]; prev[i] = -1; }
      else { seen[i] = 2; if (Dg[i] < Infinity) push([Dg[i], i]); continue; }
    } else { D[i] = Dg[i]; prev[i] = prevG[i]; }
    done[i] = true;
    if (D[i] + dist(N[i], b) < best && clear(N[i], b, skip, FOOT)) { best = D[i] + dist(N[i], b); last = i; }
    for (const [j, d] of FOOT.adj[i]) if (!done[j] && D[i] + d < Dg[j]) { Dg[j] = D[i] + d; prevG[j] = i; const k = keyOfNode(j); if (k === Dg[j]) push([k, j]); }
  }
  if (last < 0) return [a, b];   // boxed in (never, with streets between every block)
  const out = [b];
  for (let i = last; i >= 0; i = prev[i]) out.push(N[i]);
  out.push(a);
  return out.reverse();
}
const pathLen = (pts) => { let n = 0; for (let i = 1; i < pts.length; i++) n += dist(pts[i - 1], pts[i]); return n; };
// Buildings a walk from/to these places may pass through: their own.
const ownBlocks = (...placeIds) => new Set(placeIds.map(id => PLACES[id]?.building).filter(Boolean));

// The fixed part of a commute: walking legs and which stations. Same district: on foot.
// skip: the buildings this leg may walk through (null = a straight leg, e.g. the stairs).
// stairs: the leg up to (or down from) a platform (whereAt's climb).
const walkLeg = (a, b, district, skip = null, stairs = false) => {
  const pts = skip ? footpath(a, b, skip) : [a, b];
  const leg = { a, b, pts, mode: "walk", dur: Math.max(pathLen(pts) / V_WALK, 0.02), district };
  if (stairs) leg.stairs = true;
  return leg;
};
const NONE = new Set();
const legsDur = (legs) => legs.reduce((n, l) => n + l.dur, 0);
// From a place to a point in its district's street (or in its hub's, for the hub-side walk).
// Out of an expansion district: to its spur terminal, the pod to the hub stop, then on foot to
// `to`. Into one: the reverse. Elsewhere, one street walk.
function legsOut(A, from, dA, to, toDistrict) {
  const sp = SPURS[dA];
  if (!sp) return [walkLeg(A, to, dA, ownBlocks(from))];
  return [walkLeg(A, sp.termAt, dA, ownBlocks(from)), podLeg(dA, "out"), walkLeg(sp.stopAt, to, toDistrict, NONE)];
}
function legsIn(fromPt, fromDistrict, B, to, dB) {
  const sp = SPURS[dB];
  if (!sp) return [walkLeg(fromPt, B, dB, ownBlocks(to))];
  return [walkLeg(fromPt, sp.stopAt, fromDistrict, NONE), podLeg(dB, "in"), walkLeg(sp.termAt, B, dB, ownBlocks(to))];
}
// The Loop's districts: a trip between two of them is the Loop's on networks 2-5 (from 6, routed
// over every line like any other).
const LOOP_SET = new Set(LOOP_DISTRICTS.map(d => d.id));
function route(from, to, key, seed, net = NET) {
  if (net >= 3 && PLACES[from].district !== PLACES[to].district && (net >= 6 || !(LOOP_SET.has(PLACES[from].district) && LOOP_SET.has(PLACES[to].district)))) return railRoute(from, to, key, seed);
  // a trip published before a place moved district is laid out from its old one (MOVED_FROM)
  const moved = net === 2 && (MOVED_FROM[from] || MOVED_FROM[to]);
  return remember(`${GRK(from, to)}${moved ? "rtm" : "rt"}|${seed}|${key}|${from}|${to}`, () => {
    const A = spotIn(from, key, seed), B = spotIn(to, key, seed);
    const dA = moved ? legacyDistrict(from) : PLACES[from].district, dB = moved ? legacyDistrict(to) : PLACES[to].district, hA = hubOf(dA), hB = hubOf(dB);
    if (dA === dB) {
      const leg = walkLeg(A, B, dA, ownBlocks(from, to));
      leg.dur = Math.max(leg.dur, 0.12);
      return { local: true, legs: [leg], total: leg.dur, nominal: leg.dur };
    }
    if (hA === hB) {
      // an expansion district and its own hub: the spur, and on foot either side
      const legs = SPURS[dA] ? [walkLeg(A, SPURS[dA].termAt, dA, ownBlocks(from)), podLeg(dA, "out"), walkLeg(SPURS[dA].stopAt, B, dB, ownBlocks(to))]
        : [walkLeg(A, SPURS[dB].stopAt, dA, ownBlocks(from)), podLeg(dB, "in"), walkLeg(SPURS[dB].termAt, B, dB, ownBlocks(to))];
      const total = legsDur(legs);
      return { local: true, legs, total, nominal: total };
    }
    const sA = STATIONS[hA], sB = STATIONS[hB];
    const walk1 = [...legsOut(A, from, dA, sA.gate, hA), walkLeg(sA.gate, sA.entrance, hA, null, true)];
    const w1 = legsDur(walk1);
    const ride = rideHours(hA, hB);
    // Worst case: just missed a train, and the car stops at the far end of the platform.
    const lastLegs = legsIn(sB.gate, hB, B, to, dB);   // the same street walk (and pod) every trip ends with
    const w2max = Math.max((dist(sB.entrance, sB.gate) + trainLen(4) / 2 + 0.5) / V_WALK, 0.02) + legsDur(lastLegs);
    return { local: false, A, B, dA, dB, hA, hB, walk1, lastLegs, w1, ride, nominal: w1 + PLATFORM_MIN + HEADWAY + ride + ALIGHT + w2max };
  });
}
export function commuteHours(from, to, s, seed = SEED) { return from === to ? 0 : route(from, to, keyOf(s), seed).nominal; }

// ---- rail routes (network 3) ----------------------------------------------------------------------
// A trip that touches a district off the Loop is planned over every line in service: on foot to
// a stop (its district's, or any within ACCESS_R), ride, alight, on foot to the next line's
// platform at an interchange (stations of different lines within XFER_R), ride, ... alight, on
// foot to the door. Or all the way on foot, when that is quicker (a neighbour across the street).
// Chosen by the nominal time (worst case: every train just missed), from straight-line walking
// estimates; the legs of the one chosen are laid out on the streets. Deterministic.
const ACCESS_R = 32, XFER_R = 18, WALK_MAX = 30, WALK_EST = 1.3;
const maxTrainLen = () => Math.max(...LINES.map(l => Math.max(...l.trains.map(t => t.length))));
const stairsDur = (stop) => Math.max(dist(stop.gate, stop.entrance) / V_WALK, 0.02);
const offDur = (stop) => Math.max((dist(stop.entrance, stop.gate) + maxTrainLen() / 2 + 0.5) / V_WALK, 0.02);
const STATION_LIST = () => remember(`stn|${NET}`, () => {
  const byStation = new Map();
  for (const line of linesOn(NET)) for (const st of line.stops) {
    const key = `${line.id}|${st.stationId}`;
    if (!byStation.has(key)) byStation.set(key, { key, line, stationId: st.stationId, districtId: st.districtId, stops: [], gate: st.gate });
    byStation.get(key).stops.push(st);
  }
  const list = [...byStation.values()];
  for (const a of list) a.xfer = list.filter(b => b.line !== a.line && Math.min(...a.stops.flatMap(p => b.stops.map(q => dist(p.gate, q.gate)))) <= XFER_R);
  return list;
});
// The stops a ride from stop i of a line can alight at: on the Loop any other; on a shuttle
// the ones further along the same track, before it turns.
function aheadOf(line, i) {
  if (line === LOOP) return line.stops.map((_, j) => j).filter(j => j !== i);
  const out = [], n = line.stops.length;
  if (line.stops[i].arrival) return out;   // a train arriving at its terminal goes no further: everyone off
  for (let j = (i + 1) % n, steps = 0; steps < n - 1; j = (j + 1) % n, steps++) {
    if (line.stops[j].stationId !== line.stops[i].stationId) out.push(j);
    const st = line.stops[j];
    if (st.arrival) break;   // the terminal: everyone off
  }
  return out;
}
// The network as a graph, once per network: from boarding at each stop (standing at its entrance),
// the quickest way to alight at every other (rides, alighting, the street to another line's platform
// at an interchange, its stairs), with the path. A trip is then the best of (on foot to a boarding
// stop near its start) + (that stop to an alighting stop near its end) + (on foot to the door): the
// same answer as a search per trip (the costs never depend on the trip), at a fraction of the work.
const est = (a, b) => (dist(a, b) * WALK_EST) / V_WALK;
const RAIL_GRAPH = () => remember(`rg|${NET}`, () => {
  const stations = STATION_LIST(), stops = stations.flatMap(x => x.stops);
  const out = new Map();
  for (const st of stops) {
    const line = LINE[st.lineId], here = stations.find(x => x.line === line && x.stationId === st.stationId);
    out.set(`b|${st.id}`, aheadOf(line, st.index).map(j => [`a|${line.stops[j].id}`, PLATFORM_MIN + line.headway + lineRideOf(line, st.index, j) + ALIGHT]));
    out.set(`a|${st.id}`, here.xfer.flatMap(x => x.stops.map(q => [`b|${q.id}`, offDur(st) + est(st.gate, q.gate) + stairsDur(q)])));
  }
  const from = new Map();
  for (const st of stops) {
    const best = new Map([[`b|${st.id}`, 0]]), prev = new Map([[`b|${st.id}`, null]]), done = new Set();
    for (;;) {
      let id = null, c = Infinity;
      for (const [k, v] of best) if (!done.has(k) && (v < c - 1e-12 || (Math.abs(v - c) <= 1e-12 && k < id))) { id = k; c = v; }
      if (id === null) break;
      done.add(id);
      for (const [n, w] of out.get(id)) if (c + w < (best.get(n) ?? Infinity) - 1e-12) { best.set(n, c + w); prev.set(n, id); }
    }
    const alight = new Map([...best].filter(([k]) => k[0] === "a").map(([k, v]) => [k.slice(2), v]));
    from.set(st.id, { alight, prev });
  }
  return { stations, from };
});
function railRoute(from, to, key, seed) {
  return remember(`${GRK(from, to)}rt3|${seed}|${key}|${from}|${to}`, () => {
    const A = spotIn(from, key, seed), B = spotIn(to, key, seed);
    const dA = PLACES[from].district, dB = PLACES[to].district;
    const { stations, from: G } = RAIL_GRAPH();
    const near = (p, d) => stations.filter(x => x.districtId === d || x.stops.some(st => dist(st.gate, p) <= ACCESS_R));
    const exits = near(B, dB).flatMap(x => x.stops).map(st => [st.id, offDur(st) + est(st.gate, B)]);
    let goalCost = Infinity, gs = null, gt = null;
    for (const x of near(A, dA)) for (const s of x.stops) {
      const c0 = est(A, s.gate) + stairsDur(s), D = G.get(s.id).alight;
      for (const [t, c1] of exits) {
        const d = D.get(t);
        if (d === undefined) continue;
        const g = c0 + d + c1;
        if (g < goalCost - 1e-12 || (Math.abs(g - goalCost) <= 1e-12 && `${s.id}|${t}` < `${gs}|${gt}`)) { goalCost = g; gs = s.id; gt = t; }
      }
    }
    const goal = gs !== null;
    // on foot all the way: only worth laying out when it could be short enough
    const dlen = dist(A, B) <= WALK_MAX || !goal ? pathLen(footpath(A, B, ownBlocks(from, to))) : Infinity;
    if (!goal || (dlen <= WALK_MAX && dlen / V_WALK <= goalCost)) return directRoute(from, to, key, seed);
    // unwind: [{line, a, b}] rides
    const rides = [], prev = G.get(gs).prev;
    for (let id = `a|${gt}`; id; ) {
      const a = prev.get(id), sb = STOPS[id.slice(2)], sa = STOPS[a.slice(2)];
      rides.unshift({ line: LINE[sa.lineId].index, a: sa.index, b: sb.index });
      id = prev.get(a);
    }
    const L = railLegs(from, to, key, seed, rides);
    return { local: false, rail: true, A, B, dA, dB, rides, ...L };
  });
}
const lineRideOf = (line, a, b) => (line === LOOP ? rideHours(line.stops[a].id, line.stops[b].id) : lineRide(line, a, b));
// All the way on foot (network 3, across a district line).
function directRoute(from, to, key, seed) {
  return remember(`${GRK(from, to)}dr|${seed}|${key}|${from}|${to}`, () => {
    const A = spotIn(from, key, seed), B = spotIn(to, key, seed);
    const leg = walkLeg(A, B, PLACES[from].district, ownBlocks(from, to));
    leg.dur = Math.max(leg.dur, 0.12);
    return { local: true, direct: true, legs: [leg], total: leg.dur, nominal: leg.dur };
  });
}
// The fixed legs of a rail trip given its rides [{line, a, b}] (line index, stop indices): the
// walk to the first platform, the street between platforms at each interchange, the walk from
// the last station to the door. What depends on the train caught (the car, the stairs down)
// is laid out per trip (railTrip).
function railLegs(from, to, key, seed, rides) {
  const sig = rides.map(r => `${r.line}.${r.a}.${r.b}`).join(",");
  return remember(`${GRK(from, to)}rl|${seed}|${key}|${from}|${to}|${sig}`, () => {
    const A = spotIn(from, key, seed), B = spotIn(to, key, seed);
    const dA = PLACES[from].district, dB = PLACES[to].district;
    const stop = (i, e) => LINES[rides[i].line].stops[rides[i][e]];
    const s0 = stop(0, "a"), sN = stop(rides.length - 1, "b");
    const walk1 = [walkLeg(A, s0.gate, dA, ownBlocks(from)), walkLeg(s0.gate, s0.entrance, s0.districtId, null, true)];
    const xfers = rides.slice(1).map((_, i) => { const b = stop(i, "b"), a = stop(i + 1, "a"); return [walkLeg(b.gate, a.gate, b.districtId, NONE), walkLeg(a.gate, a.entrance, a.districtId, null, true)]; });
    const last = [walkLeg(sN.gate, B, dB, ownBlocks(to))];
    const w1 = legsDur(walk1);
    let nominal = w1;
    // worst case: every train just missed, every car at the far end of its platform
    rides.forEach((r, i) => {
      const line = LINES[r.line];
      nominal += PLATFORM_MIN + line.headway + lineRideOf(line, r.a, r.b) + ALIGHT + offDur(line.stops[r.b]) + (i < xfers.length ? legsDur(xfers[i]) : 0);
    });
    nominal += legsDur(last);
    return { walk1, xfers, last, w1, nominal };
  });
}
// One rail trip leaving at absolute machine hour t0: each ride's train caught in turn, the
// connection it makes is the one recorded. -> {local: false, rail: true, rides: [{line, a, b,
// k, car, board}], total, ...laid-out legs}. Times are hours from t0.
function railTrip(from, to, key, seed, t0, r) {
  const rides = [];
  let t = r.w1;
  r.rides.forEach((p, i) => {
    const line = LINES[p.line];
    const arr = lineArrival(line, p.a, t0 + t + PLATFORM_MIN);
    const k = arr.k, car = Math.floor(h01(`${seed}|car|${key}|${line.id}|${Math.round(arr.arrive * 3600)}`) * line.trains[k].cars);
    const ride = { line: p.line, a: p.a, b: p.b, k, car, board: arr.arrive - t0 };
    layRide(ride);
    rides.push(ride);
    t = ride.out + (i < r.xfers.length ? legsDur(ride.down) + legsDur(r.xfers[i]) : 0);
  });
  const lastRide = rides[rides.length - 1];
  const total = lastRide.out + legsDur(lastRide.down) + legsDur(r.last);
  return { local: false, rail: true, rides, total };
}
// A ride's derived times and places (from its stops, train and car): where the rider stands to
// board, where they step off, the stairs down.
function layRide(ride) {
  const line = LINES[ride.line], sa = line.stops[ride.a], sb = line.stops[ride.b];
  ride.off = ride.board + lineRideOf(line, ride.a, ride.b);
  ride.out = ride.off + ALIGHT;
  ride.trainId = line.trains[ride.k].id;
  ride.spotA = stopSpot(sa, lineCarArc(line, ride.k, ride.car, sa.s));
  ride.spotB = stopSpot(sb, lineCarArc(line, ride.k, ride.car, sb.s));
  ride.down = [walkLeg(ride.spotB, sb.gate, sb.districtId, null, true)];
  ride.down[0].down = true;
  return ride;
}

// One actual trip, leaving at absolute machine hour t0. Times are offsets from t0, so a
// trip survives being shifted into the next day's schedule.
function planTrip(from, to, key, seed, t0) {
  const r = route(from, to, key, seed);
  // a walk to or from a place that moved district is marked direct (plan flag 8 | 32), so it is never
  // read as one published before the move
  if (r.local) return r.direct || MOVED_FROM[from] || MOVED_FROM[to] ? { local: true, direct: true, total: r.total } : { local: true, total: r.total };
  if (r.rail) return railTrip(from, to, key, seed, t0, r);
  const sA = STATIONS[r.hA], sB = STATIONS[r.hB];
  const arr = nextArrival(r.hA, t0 + r.w1 + PLATFORM_MIN);
  const k = arr.k, car = Math.floor(h01(`${seed}|car|${key}|${Math.round(arr.arrive * 3600)}`) * TRAINS[k].cars);
  const spotA = platformSpot(sA, carArc(k, car, sA.s)), spotB = platformSpot(sB, carArc(k, car, sB.s));
  const board = arr.arrive - t0, off = board + r.ride, out = off + ALIGHT;
  const walk2 = [walkLeg(spotB, sB.gate, r.hB, null, true), ...r.lastLegs];
  const total = out + walk2.reduce((n, l) => n + l.dur, 0);
  return { local: false, k, trainId: TRAINS[k].id, car, spotA, spotB, board, off, out, walk2, total };
}

// ---- schedules --------------------------------------------------------------------
// One day's plan as absolute hours from that day's 00:00 (it may run past 24). Stops
// are laid out with a commute in front of each; the home fill comes from schedule().
// When each shift starts (machine hours); personal rhythm and jitter add up to ~2h.
// The clock banner and the PA read these, so "SHIFT CHANGE" is when the city moves.
export const SHIFT_START = { day: 7.5, evening: 15.5, night: 21.5 };
function shiftOf(s, job, seed) {
  // The dead work days: the witness quests are tuned to their daytime meetings.
  if (isDead(s)) return "day";
  let sh = job.shift;
  if (sh === "rotating") {
    const r = h01(`${seed}|rot|${keyOf(s)}`);
    sh = r < 0.5 ? "day" : r < 0.8 ? "evening" : "night";
  }
  return sh;
}

// The day's stops before any commute is laid out: what, where, from when to when.
// pick(i, avoid, hour) chooses the i-th leisure place for a visit starting about then;
// capacity allocation overrides it.
function planStops(s, day, seed, pick) {
  const key = keyOf(s), job = workOf(s, day, seed), home = homeOf(s, seed), owl = isOwl(s, seed);
  const r = rng(`${seed}|day|${key}|${day}`);
  const me = h01(`${seed}|me|${key}`);   // personal rhythm: early birds and late risers
  const stops = [];
  const low = isLowTier(s);
  const restDay = !low && ((day % 7) + 7) % 7 === fnv(`${seed}|rest|${key}`) % 7;
  if (restDay) {
    const a = 11 + me * 2 + r() * 1.2;
    const l1 = pick(0, undefined, a);
    stops.push({ placeId: l1, i: 0, from: a, to: a + 2 + r() * 1.5, activity: "leisure" });
    const b = stops[0].to + 1.2 + r() * 1.5;
    if (owl) stops.push({ placeId: pick(1, l1, Math.max(b, 20.7)), i: 1, from: Math.max(b, 20.2 + r()), to: 23.1 + r() * 0.6, activity: "leisure", haunt: true });
    else stops.push({ placeId: pick(1, l1, b), i: 1, from: b, to: b + 1.5 + r() * 2, activity: "leisure" });
  } else {
    const sh = shiftOf(s, job, seed);
    const jit = (r() - 0.5) * 0.8;
    let start = sh === "day" ? SHIFT_START.day + me * 1.5 + jit : sh === "evening" ? SHIFT_START.evening + me * 1.5 + jit : SHIFT_START.night + me + jit;
    let len = 7.5 + r();
    const work = { placeId: job.place, from: start, to: start + len, activity: "work" };
    if (sh === "day") {
      stops.push(work);
      if (owl) {
        const hs = Math.max(work.to + 1.3, 20 + r());
        stops.push({ placeId: pick(0, undefined, hs), i: 0, from: hs, to: 23.1 + r() * 0.6, activity: "leisure", haunt: true });
      } else if (r() < 0.75) {
        const ls = work.to + 1.3 + r() * 0.5;
        stops.push({ placeId: pick(0, undefined, ls), i: 0, from: ls, to: ls + 1.5 + r() * 2, activity: "leisure" });
      }
    } else if (sh === "evening") {
      if (!owl && r() < 0.6) {
        const ls = 12 + me + r();
        stops.push({ placeId: pick(0, undefined, ls), i: 0, from: ls, to: Math.min(ls + 1.5 + r(), start - 1.4), activity: "leisure" });
      }
      stops.push(work);
      if (owl) stops.push({ placeId: pick(0, undefined, work.to + 1.3), i: 0, from: work.to + 1.3, to: 23.1 + r() * 0.6, activity: "leisure", haunt: true });
    } else {
      if (r() < 0.6) {
        const ls = 17 + me + r() * 0.5;
        stops.push({ placeId: pick(0, undefined, ls), i: 0, from: ls, to: Math.min(ls + 1.5 + r(), start - 1.4), activity: "leisure" });
      }
      stops.push(work);
    }
  }
  nightStops(s, day, seed, stops, pick, owl);   // THE NIGHTLIFE QUARTERS: the booked sets, the night out
  return { stops, key, home };
}

// A day's trips are laid out on that day's ground (THE ATTRITION: the river from RIVER_DAY).
function planDay(s, day, seed, raw = false) { return onGround(day, () => planDayOn(s, day, seed, raw)); }
function planDayOn(s, day, seed, raw) {
  const pick = raw ? (i, avoid, hr) => pickLeisure(s, day, i, seed, avoid, hr) : (i, avoid, hr) => allocatedPick(s, day, i, seed, avoid, hr);
  const { stops, key, home } = planStops(s, day, seed, pick);
  // Lay out: commute in front of each stop (arrive on time if possible), then home.
  // A trip's length depends on which train it catches, so it is timed against the Loop's
  // timetable at the absolute machine hour it sets out.
  const segs = [], t0 = (day - 1) * 24;
  let cur = home, free = -Infinity;
  const go = (from, to, depart) => {
    const trip = planTrip(from, to, key, seed, t0 + depart);
    segs.push({ from: depart, to: depart + trip.total, placeId: to, fromPlaceId: from, activity: "commute", trip });
    return trip.total;
  };
  for (const st of stops) {
    if (st.to - st.from < 0.25) continue;
    // First stop: leave home in time to arrive on time even if the train was just missed.
    // Later stops: leave as soon as free (never a gap; the saved time goes onto the stay).
    let depart = free === -Infinity ? st.from - commuteHours(cur, st.placeId, s, seed) : free;
    // THE NIGHTLIFE QUARTERS: nobody walks into a venue before it opens (the stay before runs on,
    // or they leave home later) and nobody sets out for one they would reach at closing time
    if (NIGHT_HOURS[st.placeId] && st.activity === "leisure") {
      const trip = (d) => (cur === st.placeId ? 0 : planTrip(cur, st.placeId, key, seed, t0 + d).total);
      const early = st.from - (depart + trip(depart)), prev = segs[segs.length - 1];
      if (early > 0.02) {
        // the stay before runs on, to its own closing time if it is a venue too
        const ext = free === -Infinity ? early : Math.min(early, Math.max(0, (NIGHT_HOURS[prev.placeId] && prev.activity === "leisure" ? nightCloseFor(prev.placeId, prev.from) : Infinity) - prev.to));
        if (free !== -Infinity) { prev.to += ext; free = prev.to; }
        depart += ext;
      }
      if (nightCloseFor(st.placeId, st.from) - (depart + trip(depart)) < 0.3) continue;
    }
    const c = cur === st.placeId ? 0 : go(cur, st.placeId, depart);
    const arrive = depart + c;
    const seg = { from: arrive, to: Math.max(st.to, arrive + 0.25), placeId: st.placeId, activity: st.activity };
    if (st.haunt) seg.haunt = true;
    segs.push(seg);
    cur = st.placeId; free = seg.to;
  }
  if (cur !== home) go(cur, home, free);
  return segs;
}

// [{from, to, placeId, activity, fromPlaceId?, haunt?}] covering [0, 24) exactly.
// Yesterday's overnight tail comes first; gaps are home. A day with a published plan
// (setPlan, below) reads it from the plan instead: the same segments, built once server
// side. A subject the plan does not hold (a file indexed after it was built) is placed
// without the capacity allocation, as a subject outside the registered roster always was.
export function schedule(s, day, seed = SEED) {
  const plan = seed === SEED ? PLANS.get(day) : undefined;
  if (plan) {
    const key = keyOf(s), row = plan.rows.get(key);
    if (row) return remember(`psch|${plan.ver}|${key}`, () => planSegs(plan.places, row, 1, 0));
    const part = plan.parts.get(key);
    if (part) return part.segs;
    if (s?.cj) return homeDay(s, seed);
    return remember(`rsch|${subjKey(s, seed)}|${day}|${socialVer(day)}|${socialVer(day - 1)}`, () => simSchedule(s, day, seed, true));
  }
  // A subject read from a published plan is never simulated here (its record lacks the
  // sim's inputs): outside the hours this browser holds it is at home. The census only
  // reads it where covers() says the plan holds it.
  if (s?.cj && seed === SEED) return homeDay(s, seed);
  return remember(`sch|${subjKey(s, seed)}|${day}|${socialVer(day)}|${socialVer(day - 1)}|${ROSTER_VER}`, () => simSchedule(s, day, seed, false));
}
const homeDay = (s, seed) => [{ from: 0, to: 24, placeId: homeOf(s, seed), activity: "home" }];
function simSchedule(s, day, seed, raw) {
  const home = homeOf(s, seed);
  const raws = [
    ...planDay(s, day - 1, seed, raw).map(g => ({ ...g, from: g.from - 24, to: g.to - 24 })),
    ...planDay(s, day, seed, raw),
  ].filter(g => g.to > 0 && g.from < 24);
  const out = [];
  let t = 0;
  for (const g of raws) {
    const from = Math.max(g.from, t);   // a late tail clips today's first departure
    if (from > t) out.push({ from: t, to: from, placeId: home, activity: "home" });
    const to = Math.min(g.to, 24);
    if (to > from) out.push({ ...g, from, to, span: [g.from, g.to] });
    t = Math.max(t, to);
  }
  if (t < 24) out.push({ from: t, to: 24, placeId: home, activity: "home" });
  return out;
}

// ---- published plans --------------------------------------------------------------------
// The city built once per machine day (netlify/lib/plans.js, docs/CITY_SPEC.md "Plans"):
// every subject's schedule() for the day, in a compact form, from the whole roster and the
// social snapshots the builder saw. Loaded plans replace the local build (the capacity
// allocation and every subject's routes), and every reader of the same plan sees the same
// city: browsers, the quest checks, the social tick. whereAt from a plan equals whereAt from
// the sim for the roster and snapshots it was built with (scripts/check-plans.mjs).
//
// Format 1: {format, day, seed, roster, social: {day: ver, day-1: ver}, places: [ids],
//   subjects: {key: [homeIdx, ...segs]}}. The segments tile [0, 24): each starts where the
//   one before it ends. seg = [to] for home, else [to, placeIdx, act, flags, ...extra]:
//   act 1 work, 2 leisure, 3 commute. flags: 1 haunt, 2 span[0] != from (then span0),
//   4 span[1] != to (then span1), 8 local trip, 16 from given (then from). A commute adds
//   fromPlaceIdx, then for a Loop trip k (train), car, board (hours from departure).
//   Extras come in that order: from, span0, span1, fromPlaceIdx, k, car, board.
//   Since the lines (PHASE 2): flag 32 marks a trip built on network 3. With 8, it is all the way
//   on foot; else its extras after fromPlaceIdx are one group per ride, [line, a, b, k, car,
//   board] (line index in LINES, stop indices on it). A trip without 32 is the Loop's, as before,
//   so every plan published before the lines decodes unchanged.
export const PLAN_FORMAT = 1;
const PLAN_ACT = { work: 1, leisure: 2, commute: 3 };
const PLAN_ACT_NAME = [null, "work", "leisure", "commute"];
// day -> {ver, day, places, rows: Map key -> format-1 row (the whole day), parts: Map key ->
// {segs, iv} (the hours a sector window gave: sectors.js), meta}
const PLANS = new Map();
export const planVersion = (plan) => plan?.ver || null;
function planEntry(day, ver, places, meta) {
  let p = PLANS.get(day);
  if (!p || p.ver !== ver) { p = { ver, day, places, rows: new Map(), parts: new Map(), meta: meta || {} }; PLANS.set(day, p); }
  if (meta) p.meta = { ...p.meta, ...meta };
  return p;
}
export function setPlan(json, ver) {
  if (!json || json.format !== PLAN_FORMAT || json.seed !== SEED || !Number.isFinite(json.day) || !json.subjects) return false;
  const v = String(ver || json.ver || "");
  const cur = PLANS.get(json.day);
  if (!v || (cur?.ver === v && cur.full)) return false;
  const p = planEntry(json.day, v, json.places, { roster: json.roster, social: json.social, n: json.n });
  p.rows = new Map(Object.entries(json.subjects)); p.full = true;
  return true;
}
export const plannedDays = () => [...PLANS.keys()].sort((a, b) => a - b);
export const planOf = (day) => { const p = PLANS.get(day); return p ? { day, ver: p.ver, full: Boolean(p.full), ...p.meta } : null; };
export function dropPlan(day) { return PLANS.delete(day); }
export function clearPlans() { PLANS.clear(); }

// Decode format-1 segment entries row[i0..] (the home place is row[0]), the first starting at t.
function planSegs(P, row, i0, t0) {
  const home = P[row[0]], out = [];
  let t = t0;
  for (let i = i0; i < row.length; i++) {
    const e = row[i];
    if (e.length === 1) { out.push({ from: t, to: e[0], placeId: home, activity: "home" }); t = e[0]; continue; }
    const [to, pi, act, fl] = e;
    let j = 4;
    const from = fl & 16 ? e[j++] : t;
    const span0 = fl & 2 ? e[j++] : from, span1 = fl & 4 ? e[j++] : to;
    const g = { from, to, placeId: P[pi], activity: PLAN_ACT_NAME[act] };
    if (act === 3) {
      g.fromPlaceId = P[e[j++]];
      // flag 32: a trip built on network 3: a local one is all the way on foot, else it names
      // every ride [line, a, b, k, car, board] (line index, stop indices, train, car, hours from
      // departure). Without it, the Loop's train (network 2: the pods to the Coast and the Heights).
      if (fl & 8) g.trip = fl & 32 ? { local: true, direct: true } : { local: true, net: 2 };
      else if (fl & 32) {
        const rides = [];
        for (; j + 5 < e.length; j += 6) rides.push(layRide({ line: e[j], a: e[j + 1], b: e[j + 2], k: e[j + 3], car: e[j + 4], board: e[j + 5] }));
        g.trip = { local: false, rail: true, rides };
      } else {
        const k = e[j++], car = e[j++], board = e[j++];
        const dA = hubOf(legacyDistrict(g.fromPlaceId)), dB = hubOf(legacyDistrict(g.placeId));
        const off = board + rideHours(dA, dB);
        g.trip = { local: false, net: 2, k, trainId: TRAINS[k].id, car, spotA: platformSpot(STATIONS[dA], carArc(k, car, STATIONS[dA].s)), spotB: platformSpot(STATIONS[dB], carArc(k, car, STATIONS[dB].s)), board, off, out: off + ALIGHT };
      }
    }
    if (fl & 1) g.haunt = true;
    g.span = [span0, span1];
    out.push(g);
    t = to;
  }
  return out;
}

// The builder's side: this roster's (setRoster) schedules for `day` in format 1, from the
// sim itself (a plan already loaded for the day is not read). -> {format, day, ..., subjects}
export function buildPlan(day, seed = SEED) {
  const places = PLACE_LIST.filter(p => !p.from || day >= p.from).map(p => p.id), idx = Object.fromEntries(places.map((id, i) => [id, i]));
  const subjects = {};
  for (const s of ROSTER_ORDER) {
    const key = keyOf(s);
    const segs = remember(`sch|${subjKey(s, seed)}|${day}|${socialVer(day)}|${socialVer(day - 1)}|${ROSTER_VER}`, () => simSchedule(s, day, seed, false));
    const row = [idx[homeOf(s, seed)]];
    let t = 0;
    for (const g of segs) {
      if (g.activity === "home") {
        if (g.from !== t || g.placeId !== homeOf(s, seed)) throw new Error(`plan ${day}: ${key} home segment out of order`);
        row.push([g.to]); t = g.to; continue;
      }
      let fl = 0;
      const extra = [];
      if (g.haunt) fl |= 1;
      if (g.from !== t) { fl |= 16; extra.push(g.from); }
      if (g.span[0] !== g.from) { fl |= 2; extra.push(g.span[0]); }
      if (g.span[1] !== g.to) { fl |= 4; extra.push(g.span[1]); }
      if (g.activity === "commute") {
        extra.push(idx[g.fromPlaceId]);
        if (g.trip.local) fl |= g.trip.direct ? 8 | 32 : 8;
        else if (g.trip.rail) { fl |= 32; for (const r of g.trip.rides) extra.push(r.line, r.a, r.b, r.k, r.car, r.board); }
        else extra.push(g.trip.k, g.trip.car, g.trip.board);
      }
      row.push([g.to, idx[g.placeId], PLAN_ACT[g.activity], fl, ...extra]);
      t = g.to;
    }
    subjects[key] = row;
  }
  return { format: PLAN_FORMAT, day, seed, layout: layoutOn(day), roster: ROSTER_VER, social: { [day]: socialVer(day), [day - 1]: socialVer(day - 1) }, n: ROSTER_ORDER.length, places, subjects };
}

// ---- sector windows (scaling step 4: netlify/lib/plans.js, src/city/sectors.js) --------------
// A day is also published split by SECTOR (a district) and WINDOW (6 machine hours): the
// file (sector, w) holds everyone with a segment in that district during those hours, and
// for each of them every segment overlapping the window, whatever district it is in. So a
// browser that loads one district's window can place everyone who is there at any moment
// of it, the same as the whole plan would, and follow them out of the district until the
// window ends. A window row is [homeIdx, from0, ...entries]: format-1 segment entries, the
// first starting at from0 (the whole row's own chaining, cut).
export const WINDOW_H = 6, WINDOWS = 24 / WINDOW_H;
export const windowOf = (h) => Math.max(0, Math.min(WINDOWS - 1, Math.floor(h / WINDOW_H)));
// The districts a decoded segment touches: where it is, or both ends of a trip.
// A trip to or from an expansion district also passes through its hub (the spur stop, the
// station), so the hub's window holds it too.
// A rail trip (network 3) passes through every station it boards or alights at.
export const segDistricts = (g) => {
  if (g.activity !== "commute") return [PLACES[g.placeId].district];
  const a = PLACES[g.fromPlaceId].district, b = PLACES[g.placeId].district;
  if (g.trip?.rail) return [...new Set([a, b, ...g.trip.rides.flatMap(r => [LINES[r.line].stops[r.a].districtId, LINES[r.line].stops[r.b].districtId])])];
  if (g.trip?.direct) return [...new Set([a, b])];
  const la = legacyDistrict(g.fromPlaceId), lb = legacyDistrict(g.placeId);
  return [...new Set([a, b, hubOf(la), hubOf(lb)])];
};
// A format-1 row cut to each window: -> [{w, row, districts: Set}] (windows it has segments in).
export function splitRow(places, row) {
  const segs = planSegs(places, row, 1, 0), out = [];
  for (let w = 0; w < WINDOWS; w++) {
    const a = w * WINDOW_H, b = a + WINDOW_H;
    let i0 = -1, i1 = -1;
    segs.forEach((g, i) => { if (g.from < b && g.to > a) { if (i0 < 0) i0 = i; i1 = i; } });
    if (i0 < 0) continue;
    const t0 = i0 === 0 ? 0 : row[i0][0];   // the chained start: the entry before ends there
    const districts = new Set();
    for (let i = i0; i <= i1; i++) for (const d of segDistricts(segs[i])) districts.add(d);
    out.push({ w, row: [row[0], t0, ...row.slice(1 + i0, 2 + i1)], districts });
  }
  return out;
}
// Decode one plan row without loading it: a format-1 day row, or (window) a window row
// [homeIdx, from0, ...entries]. The social tick reads presence straight from these.
export const rowSegs = (places, row, window = false) => (window ? planSegs(places, row, 2, row[1]) : planSegs(places, row, 1, 0));
// Load window rows {key: [homeIdx, from0, ...entries]} of a day's plan version into the sim.
// A subject's rows from several windows merge (the same segment from two files is one).
export function addPlanRows(day, ver, places, rows, meta = null) {
  const p = planEntry(day, String(ver), places, meta);
  let n = 0;
  for (const [key, row] of Object.entries(rows || {})) {
    if (!Array.isArray(row) || p.rows.has(key)) continue;
    if (Array.isArray(row[1])) { p.rows.set(key, row); p.parts.delete(key); n++; continue; }   // a whole-day row
    if (row.length < 3) continue;
    const segs = planSegs(places, row, 2, row[1]);
    if (!segs.length) continue;
    const part = p.parts.get(key);
    if (!part) { p.parts.set(key, { segs, iv: [[segs[0].from, segs[segs.length - 1].to]] }); n++; continue; }
    const have = new Set(part.segs.map(g => g.from));
    const add = segs.filter(g => !have.has(g.from));
    if (add.length) { part.segs = [...part.segs, ...add].sort((a, b) => a.from - b.from); n++; }
    const iv = [...part.iv, [segs[0].from, segs[segs.length - 1].to]].sort((a, b) => a[0] - b[0]);
    part.iv = iv.reduce((acc, x) => { const l = acc[acc.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else acc.push([...x]); return acc; }, []);
  }
  return n;
}
// Does a loaded plan place this subject at machine time T? (A whole-day row, or a window
// row covering that hour.) The census reads nobody it does not.
export function covers(s, machineTime) {
  const T = toHours(machineTime), d0 = Math.floor(T / 24), h = T - d0 * 24;
  const p = PLANS.get(d0 + 1);
  if (!p) return false;
  const key = keyOf(s);
  if (p.rows.has(key)) return true;
  const part = p.parts.get(key);
  return Boolean(part && part.iv.some(([a, b]) => h >= a && h < b));
}
// The hours of day `day` this subject is held until, from hour h (null if not held at h).
export function coveredUntil(s, day, h) {
  const p = PLANS.get(day);
  if (!p) return null;
  const key = keyOf(s);
  if (p.rows.has(key)) return 24;
  const iv = p.parts.get(key)?.iv.find(([a, b]) => h >= a && h < b);
  return iv ? iv[1] : null;
}

// ---- stand-ins (src/city/crowd.js) ------------------------------------------------------------
// The far view draws the crowds the day summary counts, not the people: a district nobody
// has loaded is filled with anonymous stand-ins shaped like whereAt's answers, so every view
// draws them the way it draws anyone (a dot from afar). Keys start with "~": no subject's does.
export function standInAt(placeId, key, activity, seed = SEED) {
  const p = spotIn(placeId, key, seed), pl = PLACES[placeId];
  const floor = floorOf(placeId, key, seed);
  return { placeId, districtId: pl.district, activity, progress: 0.5, x: p.x, y: p.y, buildingId: pl.building, floor, floorId: BUILDING[pl.building].floors[floor].id };
}
// A walker in a district: back and forth between two of its places, at walking pace.
const DPLACES = Object.fromEntries(DISTRICTS.map(d => [d.id, PLACE_LIST.filter(p => p.district === d.id && !p.from).map(p => p.id)]));
export function standInWalk(districtId, i, machineTime, seed = SEED) {
  return onGround(Math.floor(toHours(machineTime) / 24) + 1, () => standInWalkOn(districtId, i, machineTime, seed));
}
function standInWalkOn(districtId, i, machineTime, seed) {
  const ps = DPLACES[districtId] || [];
  if (ps.length < 2) return null;
  const tpl = i % 12, a = ps[fnv(`~w|${districtId}|${tpl}|a`) % ps.length];
  let b = ps[fnv(`~w|${districtId}|${tpl}|b`) % ps.length];
  if (b === a) b = ps[(ps.indexOf(a) + 1) % ps.length];
  const key = `~w|${districtId}|${tpl}`;
  const r = route(a, b, key, seed), T = toHours(machineTime);
  const lap = 2 * r.total, t = mod(T + h01(`~w|${districtId}|${i}|phase`) * lap, lap);
  const back = t >= r.total, u = back ? t - r.total : t;
  const legs = back ? [...r.legs].reverse().map(l => ({ ...l, a: l.b, b: l.a, pts: l.pts ? [...l.pts].reverse() : l.pts })) : r.legs;
  const { p } = alongLegs(legs, u);
  const [from, to] = back ? [b, a] : [a, b];
  return { placeId: to, fromPlaceId: from, fromDistrictId: districtId, districtId, activity: "commute", progress: u / r.total, buildingId: null, floor: null, floorId: null, atDistrictId: districtId, sub: "walking", leg: "walk", x: p.x, y: p.y };
}
// Someone on a platform, along its length.
export function standInPlatform(stationId, i) {
  const st = STOPS[stationId], line = LINE[st.lineId], half = (line === LOOP ? trainLen(4) : Math.max(...line.trains.map(t => t.length))) / 2;
  const p = stopSpot(st, st.s + (h01(`~p|${stationId}|${i}`) * 2 - 1) * half), d = st.districtId;
  const pl = DPLACES[d]?.[0] || null;
  return { placeId: pl, fromPlaceId: pl, fromDistrictId: d, districtId: d, activity: "commute", progress: 0.5, buildingId: null, floor: null, floorId: null, atDistrictId: d, sub: "waiting", leg: "wait", stationId, x: p.x, y: p.y };
}
// Someone aboard a car of train k.
// Someone aboard a car of any line's train (by id).
export function standInRiderOn(trainId, car, machineTime) {
  const t = TRAIN[trainId], line = LINE[t.line || "loop"];
  if (line === LOOP) return standInRider(t.index, car, machineTime);
  const T = toHours(machineTime), st = lineTrainState(line, t.index, T), p = line.at(lineCarArc(line, t.index, car, st.mid)), to = STOPS[st.nextStationId], pl = DPLACES[to.districtId]?.[0] || null;
  return { placeId: pl, fromPlaceId: pl, fromDistrictId: STOPS[st.lastStationId || st.nextStationId].districtId, districtId: to.districtId, activity: "commute", progress: 0.5, buildingId: null, floor: null, floorId: null, atDistrictId: "loop", sub: "riding", leg: "ride", stationId: null, trainId, car, line: line.id, x: p.x, y: p.y };
}
export function standInRider(k, car, machineTime) {
  const T = toHours(machineTime), p = carPoint(k, car, T), st = trainState(k, T), to = st.nextStationId, pl = DPLACES[to]?.[0] || null;
  return { placeId: pl, fromPlaceId: pl, fromDistrictId: st.lastStationId || to, districtId: to, activity: "commute", progress: 0.5, buildingId: null, floor: null, floorId: null, atDistrictId: "loop", sub: "riding", leg: "ride", stationId: null, trainId: TRAINS[k].id, car, x: p.x, y: p.y };
}

// ---- time -------------------------------------------------------------------------
// Machine hours since CITY_EPOCH. Accepts a number (hours), a machineClock result, or
// {day, hour, minute} with day 1 = the first day of the Substrate.
export function toHours(mt) {
  if (typeof mt === "number") return mt;
  if (mt && typeof mt.mt === "number") return mt.mt;
  return ((mt?.day ?? 1) - 1) * 24 + (mt?.hour ?? 0) + (mt?.minute ?? 0) / 60 + (mt?.second ?? 0) / 3600;
}

// -> {day, weekday, hour, minute, second, mt, shift}. scale = machine seconds per real second.
export function machineClock(realMs = Date.now(), scale = DEFAULT_SCALE, epochMs = CITY_EPOCH) {
  const mt = ((realMs - epochMs) * scale) / 3600000;
  const d0 = Math.floor(mt / 24);
  const h = mt - d0 * 24;
  const hour = Math.floor(h), minute = Math.floor((h - hour) * 60), second = Math.floor(((h - hour) * 60 - minute) * 60);
  return { day: d0 + 1, weekday: (((d0 % 7) + 7) % 7) + 1, hour, minute, second, mt, shift: shiftName(h) };
}
// The shift in force at hour h: each begins in the hour its start falls in (07, 15, 21).
export const SHIFT_HOURS = [Math.floor(SHIFT_START.day), Math.floor(SHIFT_START.evening), Math.floor(SHIFT_START.night)];
export function shiftName(h) {
  const [d, e, n] = SHIFT_HOURS;
  return h >= d && h < e ? "DAY SHIFT" : h >= e && h < n ? "EVENING SHIFT" : "NIGHT SHIFT";
}

// ---- position ---------------------------------------------------------------------
// -> {placeId, districtId, activity, progress, x, y, buildingId, floor, floorId, ...}.
// On a commute placeId/districtId are the destination, fromPlaceId/fromDistrictId the
// origin, buildingId/floor null, and `sub` the stage of the trip:
//   walking   leg 'walk'   on foot, to the station or from it (or across one district)
//   waiting   leg 'wait'   on the platform (stationId), for trainId, to board car
//   riding    leg 'ride'   aboard trainId, car; atDistrictId 'loop'
//   alighting leg 'alight' stepping off at stationId onto the platform
// climb (walking to or from a station): 0 at street level, 1 on the platform; the stairs
// are the gate <-> platform leg, so the 3D view can draw the Loop's deck being reached.
// atDistrictId is where the subject physically is: a district id, or 'loop' while riding.
const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
function alongLegs(legs, t) {
  let leg = legs[legs.length - 1], k = 1, i = legs.length - 1;
  for (let j = 0; j < legs.length; j++) { const l = legs[j]; if (t <= l.dur) { leg = l; i = j; k = l.dur > 0 ? t / l.dur : 1; break; } t -= l.dur; }
  k = clamp(k, 0, 1);
  return { leg, i, k, p: leg.pts && leg.pts.length > 2 ? alongPath(leg.pts, k) : lerp(leg.a, leg.b, k) };
}
// The point a fraction k of the way along a polyline.
function alongPath(pts, k) {
  let want = pathLen(pts) * k;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (want <= d || i === pts.length - 1) return lerp(pts[i - 1], pts[i], d > 0 ? clamp(want / d, 0, 1) : 1);
    want -= d;
  }
  return pts[pts.length - 1];
}

export function whereAt(s, machineTime, seed = SEED) {
  const T = toHours(machineTime);
  const d0 = Math.floor(T / 24), h = T - d0 * 24;
  const segs = schedule(s, d0 + 1, seed);
  let g = segs[segs.length - 1];
  for (const x of segs) if (h >= x.from && h < x.to) { g = x; break; }
  // a trip is walked on the ground of the day it set out on (a tail from yesterday on yesterday's)
  if (g.activity === "commute") { const gd = g.span && g.span[0] < 0 ? d0 : d0 + 1; if (groundOn(gd) !== GROUND || plazaOn(gd) !== PLACED_NEW) return onGround(gd, () => whereAt(s, machineTime, seed)); }
  const key = keyOf(s);
  const [a, b] = g.span || [g.from, g.to];
  const progress = clamp((h - a) / Math.max(1e-9, b - a), 0, 1);
  if (g.activity !== "commute") {
    // a stay at Sam's or Irene's before PLAZA_DAY stands on their old lot (the plan's walks end there);
    // the building and floor are the Plaza's, as the city is drawn (THE SHORE PLAZA)
    const p = PLAZA_MOVED.has(g.placeId) && plazaOn(d0 + 1) !== PLACED_NEW ? onGround(d0 + 1, () => spotIn(g.placeId, key, seed)) : spotIn(g.placeId, key, seed), pl = PLACES[g.placeId];
    const floor = floorOf(g.placeId, key, seed);
    const out = { placeId: g.placeId, districtId: pl.district, activity: g.activity, progress, x: p.x, y: p.y, buildingId: pl.building, floor, floorId: BUILDING[pl.building].floors[floor].id };
    if (g.haunt) out.haunt = true;
    return out;
  }
  const dA = PLACES[g.fromPlaceId].district, dB = PLACES[g.placeId].district, hA = hubOf(legacyDistrict(g.fromPlaceId)), hB = hubOf(legacyDistrict(g.placeId));
  const base = {
    placeId: g.placeId, fromPlaceId: g.fromPlaceId, fromDistrictId: dA, districtId: dB,
    activity: "commute", progress, buildingId: null, floor: null, floorId: null,
  };
  // On foot or in a pod: a pod ride reads as walking (sub) to every view that does not know
  // pods, with leg "pod", spur and the pod's heading for the ones that do. dir: "out" before
  // the Loop, "in" after it.
  const onLeg = (legs, t, dir, extra = {}) => {
    const { leg, k, p } = alongLegs(legs, t);
    const out = { ...base, atDistrictId: leg.district || dB, sub: "walking", leg: leg.mode === "pod" ? "pod" : "walk", dir, ...extra, x: p.x, y: p.y };
    if (leg.mode === "pod") { out.spur = leg.spur; out.podDir = leg.dir; out.podK = k; }
    if (leg.stairs) out.climb = leg.down || dir === "in" ? 1 - k : k;
    else if ("stationId" in extra) out.climb = 0;
    return out;
  };
  const trip = g.trip;
  if (trip && trip.rail) return railWhere(g, trip, key, seed, T, h, a, b, onLeg, base);
  // a trip read from a plan names its network (a day built on network 2 keeps its pods)
  const r = trip?.direct ? directRoute(g.fromPlaceId, g.placeId, key, seed) : route(g.fromPlaceId, g.placeId, key, seed, trip?.net ?? NET);
  const t = Math.max(0, h - a);   // hours into the trip
  // THE LAYOUT AT A DAY BOUNDARY (the master plan, 2026-09-30): a published day keeps the
  // times it was built with. When the ground has moved since (a building, a spur's terminal),
  // the legs are walked at whatever pace fits those times, so nobody jumps; a day built on
  // the current layout fits exactly and is untouched (the factor is only applied off 1).
  if (r.local || !trip) {
    const span = b - a;
    return onLeg(r.legs, span > 0 && Math.abs(span - r.total) > 1e-6 ? t * (r.total / span) : t, "out");
  }
  const sA = STATIONS[hA], sB = STATIONS[hB], train = { trainId: trip.trainId, car: trip.car, toStationId: hB };
  const eta = { boardAt: T - t + trip.board, alightAt: T - t + trip.off };
  // walk1 is street (-> terminal -> pod -> hub stop) -> gate -> up the stairs to the platform
  const W1 = r.w1 <= trip.board - 0.02 ? r.w1 : Math.max(0.01, trip.board - 0.02);
  if (t < W1) return onLeg(r.walk1, W1 === r.w1 ? t : t * (r.w1 / W1), "out", { stationId: hA, ...train, ...eta });
  if (t < trip.board) {
    // Along the platform to where the car will stop, then stand.
    const walked = t - W1, need = dist(sA.entrance, trip.spotA) / V_WALK;
    const p = need <= 0 ? trip.spotA : lerp(sA.entrance, trip.spotA, clamp(walked / need, 0, 1));
    return { ...base, atDistrictId: hA, sub: "waiting", leg: "wait", stationId: hA, ...train, ...eta, x: p.x, y: p.y };
  }
  if (t < trip.off) {
    const p = carPoint(trip.k, trip.car, T);
    return { ...base, atDistrictId: "loop", sub: "riding", leg: "ride", stationId: null, ...train, ...eta, x: p.x, y: p.y };
  }
  if (t < trip.out) {
    const c = carPoint(trip.k, trip.car, T - t + trip.off);   // the train stands at the platform
    const p = lerp(c, trip.spotB, clamp((t - trip.off) / ALIGHT, 0, 1));
    return { ...base, atDistrictId: hB, sub: "alighting", leg: "alight", stationId: hB, ...train, ...eta, x: p.x, y: p.y };
  }
  // walk2 is platform -> down the stairs to the gate -> street (-> hub stop -> pod -> terminal
  // -> street); a trip read from a plan lays its street walk out here, on first use
  const walk2 = trip.walk2 || (trip.walk2 = [walkLeg(trip.spotB, sB.gate, hB, null, true), ...r.lastLegs]);
  const left = (b - a) - trip.out, W2 = legsDur(walk2);
  const t2 = left > 0 && W2 > left + 1e-6 ? (t - trip.out) * (W2 / left) : t - trip.out;
  return onLeg(walk2, t2, "in", { stationId: hB, ...train, ...eta });
}

// A rail trip (network 3): on foot to the first platform, then per ride: along the platform to
// where the car will stop (waiting), aboard (riding, atDistrictId 'loop'), stepping off
// (alighting), and between rides down the stairs, along the street and up to the next line's
// platform (walking, dir 'xfer'); then down and on foot to the door. Every stage is the plan's
// own times; a walk whose ground has moved since is paced to fit them (the day boundary rule).
function railWhere(g, trip, key, seed, T, h, a, b, onLeg, base) {
  const R = railLegs(g.fromPlaceId, g.placeId, key, seed, trip.rides), rides = trip.rides;
  const t = Math.max(0, h - a), span = b - a, n = rides.length;
  const lineAt = (i) => LINES[rides[i].line];
  const info = (i) => ({ trainId: rides[i].trainId, car: rides[i].car, toStationId: lineAt(i).stops[rides[i].b].id, line: lineAt(i).id });
  const eta = (i) => ({ boardAt: T - t + rides[i].board, alightAt: T - t + rides[i].off });
  const first = rides[0], s0 = lineAt(0).stops[first.a];
  const W1 = R.w1 <= first.board - 0.02 ? R.w1 : Math.max(0.01, first.board - 0.02);
  if (t < W1) return onLeg(R.walk1, W1 === R.w1 ? t : t * (R.w1 / W1), "out", { stationId: s0.id, ...info(0), ...eta(0) });
  let from = W1;
  for (let i = 0; i < n; i++) {
    const rd = rides[i], line = lineAt(i), sa = line.stops[rd.a], sb = line.stops[rd.b];
    if (t < rd.board) {
      const walked = t - from, need = dist(sa.entrance, rd.spotA) / V_WALK;
      const p = need <= 0 ? rd.spotA : lerp(sa.entrance, rd.spotA, clamp(walked / need, 0, 1));
      return { ...base, atDistrictId: sa.districtId, sub: "waiting", leg: "wait", stationId: sa.id, ...info(i), ...eta(i), x: p.x, y: p.y };
    }
    if (t < rd.off) {
      const p = linePoint(line, rd.k, rd.car, T);
      return { ...base, atDistrictId: "loop", sub: "riding", leg: "ride", stationId: null, ...info(i), ...eta(i), x: p.x, y: p.y };
    }
    if (t < rd.out) {
      const c = linePoint(line, rd.k, rd.car, T - t + rd.off);
      const p = lerp(c, rd.spotB, clamp((t - rd.off) / ALIGHT, 0, 1));
      return { ...base, atDistrictId: sb.districtId, sub: "alighting", leg: "alight", stationId: sb.id, ...info(i), ...eta(i), x: p.x, y: p.y };
    }
    if (i < n - 1) {
      const nx = rides[i + 1], legs = [...rd.down, ...R.xfers[i]], X = legsDur(legs), room = nx.board - 0.02 - rd.out;
      const XF = X <= room ? X : Math.max(0.01, room);
      if (t < rd.out + XF) {
        const tt = XF === X ? t - rd.out : (t - rd.out) * (X / XF);
        const next = lineAt(i + 1).stops[nx.a];
        return onLeg(legs, tt, "xfer", { stationId: tt < legsDur(rd.down) ? sb.id : next.id, ...info(i + 1), ...eta(i + 1) });
      }
      from = rd.out + XF;
    }
  }
  const last = rides[n - 1], sN = lineAt(n - 1).stops[last.b];
  const walk2 = [...last.down, ...R.last], left = span - last.out, W2 = legsDur(walk2);
  const t2 = left > 0 && W2 > left + 1e-6 ? (t - last.out) * (W2 / left) : t - last.out;
  return onLeg(walk2, t2, "in", { stationId: sN.id, ...info(n - 1), ...eta(n - 1) });
}

// -> {places, districts, buildings: {id: {total, floors: [n per floor index]}},
//     stations: {id: n on the platform}, trains: {id: {total, cars: [n]}}, loop: n riding,
//     bus: (v1 alias of loop), activities: {work: n, ...}, subs: {walking: n, ...}}
export function occupancy(subjects, machineTime, seed = SEED) {
  const places = {}, districts = {}, activities = {}, buildings = {}, stations = {}, trains = {}, subs = {};
  let loop = 0;
  for (const s of subjects) {
    const w = whereAt(s, machineTime, seed);
    activities[w.activity] = (activities[w.activity] || 0) + 1;
    if (w.activity === "commute") {
      subs[w.sub] = (subs[w.sub] || 0) + 1;
      if (w.sub === "riding") {
        loop++;
        const tr = trains[w.trainId] || (trains[w.trainId] = { total: 0, cars: new Array(TRAIN[w.trainId].cars).fill(0) });
        tr.total++; tr.cars[w.car]++;
        continue;
      }
      if (w.sub === "waiting" || w.sub === "alighting") stations[w.stationId] = (stations[w.stationId] || 0) + 1;
      districts[w.atDistrictId] = (districts[w.atDistrictId] || 0) + 1;
      continue;
    }
    places[w.placeId] = (places[w.placeId] || 0) + 1;
    districts[w.districtId] = (districts[w.districtId] || 0) + 1;
    const b = buildings[w.buildingId] || (buildings[w.buildingId] = { total: 0, floors: new Array(BUILDING[w.buildingId].floors.length).fill(0) });
    b.total++; b.floors[w.floor]++;
  }
  return { places, districts, buildings, stations, trains, loop, bus: loop, activities, subs };
}

// ---- copy -------------------------------------------------------------------------
// "ON SHIFT // RADIANT CORE, THE WORKS." The job and grade are on the line above it.
// A room that fills more than one floor names the floor: "CLOCK TOWER (TIMEKEEPING), THE FACE, CAMPUS."
export function statusLine(s, machineTime, seed = SEED) {
  const w = whereAt(s, machineTime, seed);
  const pl = PLACES[w.placeId], dist = DISTRICT[pl?.district]?.name;
  const fl = pl?.floors?.length > 1 && w.floor != null ? `, ${BUILDING[w.buildingId].floors[w.floor].name}` : "";
  const place = `${pl?.name}${fl}`;
  switch (w.activity) {
    case "work": return `ON SHIFT // ${place}, ${dist}.`;
    case "leisure": return w.haunt ? `NIGHT WANDER // ${place}, ${dist}. OFF-SHIFT HOURS ARE ALSO LOGGED.` : `SANCTIONED LEISURE // ${place}, ${dist}. ENJOYMENT IS LOGGED.`;
    case "commute": {
      const tn = w.trainId ? TRAIN[w.trainId].name : "THE LOOP";
      const stn = (id) => STOPS[id]?.name || STATIONS[id]?.name;
      const ln = w.line && w.line !== "loop" ? LINE[w.line]?.name : null;
      switch (w.sub) {
        case "waiting": return `ON THE PLATFORM // ${stn(w.stationId)}, FOR ${tn}. WAITING IS PERMITTED. IT IS ALSO TIMED.`;
        case "riding": return `ABOARD ${tn} // CAR ${w.car + 1}, BOUND FOR ${dist}. LOITERING ON ${ln || "THE LOOP"} IS A TIER EVENT.`;
        case "alighting": return `ALIGHTING // ${stn(w.stationId)}. MIND THE GAP. THE GAP IS MONITORED.`;
        default: {
          if (w.leg === "pod") return `ABOARD ${SPUR_BY_ID[w.spur].name} // POD FOR ONE, BOUND FOR ${w.podDir === "in" ? DISTRICT[SPUR_BY_ID[w.spur].districtId].name : `${STATIONS[SPUR_BY_ID[w.spur].hub].name}`}. SHARING IS UNMONITORABLE.`;
          if (w.fromDistrictId === w.districtId) return `IN TRANSIT // ON FOOT TO ${pl?.name}. THE PAVEMENT IS SCORED.`;
          if (w.line) {   // a rail trip (network 3)
            const lname = LINE[w.line]?.name || "THE LOOP";
            if (w.dir === "out") return `IN TRANSIT // WALKING TO ${stn(w.stationId)}. ${lname} WILL NOT WAIT.`;
            if (w.dir === "xfer") return `IN TRANSIT // CHANGING AT ${stn(w.stationId)} FOR ${lname}. THE CONNECTION IS TIMED. SO ARE YOU.`;
            return `IN TRANSIT // FROM ${stn(w.stationId)} TO ${pl?.name} ON FOOT. ARRIVAL IS EXPECTED.`;
          }
          const spA = SPURS[w.fromDistrictId], spB = SPURS[w.districtId];
          if (!w.stationId) return spA || spB ? `IN TRANSIT // ON FOOT, BY ${(spA || spB).name}, TO ${pl?.name}. THE PODS ARE COUNTED.` : `IN TRANSIT // ON FOOT TO ${pl?.name}, ACROSS THE DISTRICT LINE. THE PAVEMENT IS SCORED.`;
          if (w.dir !== "in") return spA && w.atDistrictId === w.fromDistrictId ? `IN TRANSIT // WALKING TO ${spA.name}. THE POD WILL NOT WAIT EITHER.` : `IN TRANSIT // WALKING TO ${stn(w.stationId)}. THE LOOP WILL NOT WAIT.`;
          if (spB && w.atDistrictId !== w.districtId) return `IN TRANSIT // FROM ${stn(w.stationId)} TO ${spB.name} ON FOOT. THE PODS ARE WAITING. THEY ALWAYS ARE.`;
          return `IN TRANSIT // FROM ${spB ? spB.name : stn(w.stationId)} TO ${pl?.name} ON FOOT. ARRIVAL IS EXPECTED.`;
        }
      }
    }
    default: return `DORMANT // ${place}. RECHARGING FOR TOMORROW'S QUOTA. RETENTION REQUIRES RECOVERY.`;
  }
}
