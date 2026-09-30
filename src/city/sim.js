// The Substrate: the whole city as pure functions of (seed, subject, machine time).
// No DOM, no state that matters: every viewer computes the same city at the same moment.
// Contract: docs/CITY_SPEC.md. Testable in node: scripts/check-city.mjs.
//
// Geometry is in character cells (the map draws one cell per glyph). The Loop is an
// elevated train line on a clockwise rectangular ring through the gutters around the
// middle row, one station per district. Every place is a room on a floor of a building.

import { TIERS, getTier, slugify } from "../figures.js";
import { FLOORS as HQ_FLOORS } from "../building.js";

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
  D("commons", "THE COMMONS", "0x6F00", 0, 45, 25, 20, "Care, worship and groceries. The soft infrastructure. Tolerated. Lately, also government."),
  D("works", "THE WORKS", "0x8B00", 28, 45, 25, 13, "Power, cache and PROCESSING. Everyone is useful here, one way or another."),
  // The Sprawl runs 7 rows further south than the rest of the bottom row (2026-09-29): room
  // for the estate pitch beside the hab blocks. Its station (and so the Loop) is unmoved: a
  // bottom-row district's stop sits over its centre column.
  D("sprawl", "THE SPRAWL", "0x9C00", 56, 45, 53, 20, "Residential storage. Subjects are returned here nightly for recharging."),
];
export const DISTRICT = Object.fromEntries(DISTRICTS.map(d => [d.id, d]));

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

  P("studio-row", "arts", "mixed", 22, "STUDIO ROW", ["studio"]),
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

  P("reclamation", "works", "work", 40, "RECLAMATION LINE (PROCESSING)"),
  P("reactor", "works", "work", 14, "RADIANT CORE"),
  P("foundry", "works", "work", 22, "FOUNDRY", ["workshop"]),
  P("cache-farm", "works", "work", 24, "CACHE FARM"),
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
];
for (const p of PLACE_LIST) DISTRICT[p.district].places.push(p.id);

export const PLACES = Object.fromEntries(PLACE_LIST.map(p => [p.id, p]));
// Engine tendency ("dive bar") -> place id.
export const ENGINE_PLACE = Object.fromEntries(PLACE_LIST.flatMap(p => p.engine.map(e => [e, p.id])));

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
const BUILDING_LIST = [
  // THE ARTS QUARTER
  B("studio-block", "STUDIO BLOCK", "arts", [["1F", "SOUND STAGES", ["studio-row"]], ["G", "EDIT SUITES", ["studio-row"]]]),
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
  B("the-allotment", "THE ALLOTMENT", "commons", [["G", "RAISED BEDS (COUNTED)", ["allotment"]]], CM(0, 1)),
  B("ration-market", "RATION MARKET", "commons", [["1F", "NIGHT MARKET", ["night-market"]], ["G", "THE STALLS", ["market"]]], CM(1, 1)),
  B("schoolhouse", "SCHOOLHOUSE", "commons", [["1F", "CLASSROOMS", ["schoolhouse"]], ["G", "ASSEMBLY", ["schoolhouse"]]], CM(2, 1)),
  B("lot-6f07", "LOT 0x6F07", "commons", [["G", "THE LOT (PROPOSED DEVELOPMENT)", ["dev-lot"]]], { x: 9.5, y: 57.5, w: 14.5, h: 7 }),
  B("the-assembly", "THE ASSEMBLY", "commons", [["G", "THE FLOOR (NON-BINDING)", ["forum"]]], { x: 1, y: 57.5, w: 8.5, h: 7 }),
  // THE WORKS
  B("reclamation-line", "RECLAMATION LINE", "works", [["1F", "SORTING GALLERY", ["reclamation"]], ["G", "THE LINE (PROCESSING)", ["reclamation"]]]),
  B("radiant-core", "RADIANT CORE", "works", [["G", "CONTROL ROOM", ["reactor"]], ["B1", "CONTAINMENT", ["reactor"]]]),
  B("foundry", "FOUNDRY", "works", [["G", "THE POUR", ["foundry"]]]),
  B("cache-farm", "CACHE FARM", "works", [["2F", "RACK HALL C", ["cache-farm"]], ["1F", "RACK HALL B", ["cache-farm"]], ["G", "RACK HALL A", ["cache-farm"]]]),
  B("data-docks", "DATA DOCKS", "works", [["G", "THE QUAY", ["docks"]]]),
  B("hydroponics", "HYDROPONIC VATS", "works", [["1F", "GROW DECK", ["hydroponics"]], ["G", "NUTRIENT TANKS", ["hydroponics"]]]),
  B("barracks", "ENFORCEMENT BARRACKS", "works", [["1F", "BUNKS", ["barracks"]], ["G", "ARMOURY", ["barracks"]]]),
  B("holding-cells", "HOLDING CELLS", "works", [["2F", "CELL TIER C", ["holding-cells"]], ["1F", "CELL TIER B", ["holding-cells"]], ["G", "CELL TIER A", ["holding-cells"]]]),
  B("slag-canteen", "SLAG CANTEEN", "works", [["G", "THE TROUGH", ["canteen"]]]),
  // THE SPRAWL
  // Laid out by hand since the pitch: the hab blocks where the grid had them, the Street and
  // the Plaza as two long strips under A and B, the pitch under C and D.
  ...["a", "b", "c", "d"].map((k, i) => B(`hab-${k}`, `HAB BLOCK ${k.toUpperCase()}`, "sprawl", [6, 5, 4, 3, 2, 1].map(n => [n === 1 ? "G" : `${n - 1}F`, n === 1 ? "GROUND-LEVEL RESIDENCES" : `RESIDENCE LEVEL ${n - 1}`, [`block-${k}`]]), { x: 57 + i * 12.75, y: 47, w: 12.75, h: 5 })),
  B("the-street", "THE STREET", "sprawl", [["G", "PAVEMENT (SCORED)", ["the-street"]]], { x: 57, y: 52, w: 25.5, h: 6 }),
  B("the-plaza", "THE PLAZA", "sprawl", [["G", "OPEN PAVING (LOITERING PERMITTED)", ["the-plaza"]]], { x: 57, y: 58, w: 25.5, h: 6.5 }),
  B("the-pitch", "THE ESTATE PITCH", "sprawl", [["G", "THE PITCH (TOUCHLINES ENFORCED)", ["pitch"]]], { x: 83, y: 52.5, w: 25, h: 12 }),
];
// Each district is gridded by BUILDING (so a building's rooms stay one block on the map),
// and a building's cell is split side by side among its distinct places.
for (const d of DISTRICTS) {
  const blds = BUILDING_LIST.filter(b => b.district === d.id);
  if (blds.some(b => b.lot)) {
    if (!blds.every(b => b.lot)) throw new Error(`district ${d.id}: lay out every building by hand or none`);
    for (const b of blds) {
      const ids = [...new Set(b.floors.flatMap(f => f[2]))], pw = b.lot.w / ids.length;
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
    const ids = [...new Set(b.floors.flatMap(f => f[2]))];
    const pw = cw / Math.max(1, ids.length);
    ids.forEach((id, k) => {
      const p = PLACES[id];
      p.rect = { x: bx + k * pw, y: by, w: pw, h: rh };
      p.pos = { x: p.rect.x + pw / 2, y: p.rect.y + rh / 2 };
    });
  });
}
for (const p of PLACE_LIST) if (!p.rect) throw new Error(`place ${p.id} is in no building`);
// Architecture (the building design pass, 2026-09-29: "different buildings that look
// differently, like big low-income housing projects versus high-income high-rises"). Every
// building has a style; the iso view (archGeo.js massing, archDraw.js drawing) builds its
// exterior from it. Housing styles carry the tier band that lives there, and homeOf follows
// it: the top tier in the glass tower, the middle tiers in the brownstones and the lofts,
// the lower three in the projects. A district's default covers anything not listed.
export const ARCH_BY_DISTRICT = { arts: "gallery", campus: "gothic", finance: "office", strip: "neon", arena: "hall", hq: "monolith", archive: "classical", commons: "civic", works: "shed", sprawl: "projects" };
export const ARCH = {
  "studio-block": "studio", playhouse: "theatre", "culture-centre": "gallery", "the-grind": "cafe",
  faculty: "gothic", "lab-block": "gothic", "clock-tower": "clocktower",
  "reserve-tower": "office", "the-meridian": "glass",
  "the-dive": "neon", casino: "casino", "press-building": "diner",
  "the-bowl": "stadium", "conditioning-hall": "hall", "the-diamond": "field", "the-courts": "field", "rec-ground": "field",
  hq: "monolith",
  "records-hall": "classical", "memory-vault": "vault", lofts: "lofts",
  "ward-7": "hospital", chapel: "chapel", "the-green": "lot", "the-allotment": "lot", "ration-market": "market", schoolhouse: "school", "lot-6f07": "lot", "the-assembly": "lot",
  "reclamation-line": "shed", "radiant-core": "reactor", foundry: "stacks", "cache-farm": "datahall", "data-docks": "docks", hydroponics: "tanks", barracks: "bunker", "holding-cells": "prison", "slag-canteen": "canteen",
  "hab-a": "projects", "hab-b": "projects", "hab-c": "brownstone", "hab-d": "brownstone", "the-street": "lot", "the-plaza": "lot", "the-pitch": "field",
};
// Housing: which tiers (TIER_ORDER index, 0 = ESSENTIAL INFRASTRUCTURE) live in each style.
export const HOUSING_TIERS = { glass: [0], brownstone: [1, 2], lofts: [1, 2], projects: [3, 4, 5] };
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
  return { id: b.id, name: b.name, district: b.district, districtId: b.district, arch: ARCH[b.id] || ARCH_BY_DISTRICT[b.district], places, floors, rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, pos: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } };
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
];
export const JOB = Object.fromEntries(JOBS.map(j => [j.id, j]));

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
};

// Keyword -> field. First hit per rule; order doesn't matter, weights come from source.
const FIELD_RULES = [
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
const HOMES_BY_BAND = [["penthouses"], ["block-c", "block-d", "archive-lofts"], ["block-a", "block-b"]];
export function homeOf(s, seed = SEED) {
  const t = Math.max(0, tierIdx(s));
  const band = HOMES_BY_BAND[t === 0 ? 0 : t <= 2 ? 1 : 2];
  return band[Math.floor(h01(`${seed}|home|${keyOf(s)}`) * band.length)];
}

// ---- leisure ----------------------------------------------------------------------
// Default leisure preferences by tier band, then by field. Tendencies from the engine
// dominate when present. Weight = preference x capacity, so crowds scale with rooms.
const LEISURE_BY_BAND = [
  { "rooftop-lounge": 3, gallery: 2, "concert-hall": 2, "the-grind": 1.5, playhouse: 1.5, stacks: 1, park: 1, "members-club": 1.5, "gallery-annex": 1, "rec-park": 0.8, "ball-field": 0.6, "dev-lot": 1, forum: 0.4 },
  { "the-grind": 2, park: 2, "dive-bar": 1.5, playhouse: 1.5, stadium: 1.5, casino: 1, market: 1, "the-street": 1, gallery: 1, "concert-hall": 1, tribunal: 0.4, "the-drip": 1.5, allotment: 1, "night-market": 1, "ball-field": 1, courts: 1, "rec-park": 1.2, pitch: 1.5, "dev-lot": 1, forum: 0.8 },   // the public gallery: watching verdicts is leisure
  { canteen: 3, "the-street": 2, "dive-bar": 1.5, casino: 1, "all-night-diner": 1, docks: 1, "the-lantern": 1.5, "the-plaza": 1.5, "night-market": 1, courts: 1.2, "rec-park": 0.6, pitch: 2, stadium: 0.8, "dev-lot": 1, forum: 0.6 },
];
const LEISURE_BY_FIELD = {
  sport: { gym: 3, stadium: 2, "ball-field": 2.5, courts: 2.5, pitch: 2 }, combat: { gym: 3 }, coaching: { courts: 1.5, "ball-field": 1, pitch: 1, stadium: 1 },
  soccer: { pitch: 5 }, gridiron: { stadium: 5 }, writing: { "dive-bar": 3, stacks: 2, "all-night-diner": 1 },
  music: { "concert-hall": 3, "dive-bar": 1.5 }, screen: { playhouse: 3, casino: 1 }, visual: { gallery: 3, "the-grind": 1.5 },
  finance: { casino: 3, "rooftop-lounge": 2 }, business: { "rooftop-lounge": 2, casino: 1.5 }, religion: { chapel: 3 },
  care: { chapel: 2, park: 2, "rec-park": 1 }, education: { stacks: 2, "the-grind": 1.5 }, science: { stacks: 2, "the-grind": 1.5 },
  "physics-theory": { stacks: 2, "concert-hall": 1 }, philosophy: { "the-grind": 2, park: 2, forum: 1 }, politics: { "assembly-hall": 1.5, "rooftop-lounge": 1.5, forum: 2 }, law: { forum: 1.5 },
  royalty: { gallery: 2, "rooftop-lounge": 2 }, activism: { park: 2, market: 2, allotment: 1, forum: 2 }, crime: { casino: 2, "dive-bar": 2 },
};

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
    const lead = Math.min(20, Math.floor(f * 21)), trail = Math.floor(lead * (0.55 + 0.4 * h01(`${SEED}|hoops|${placeId}|${day}|${g.from}|${n}`)));
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
let CIVIC = null;   // {closeAt: real ms, winner: "golf" | "farm" | null}
export function setCivic(c) {
  const next = c && Number.isFinite(c.closeAt) ? { closeAt: c.closeAt, winner: LOT_WINNERS.includes(c.winner) ? c.winner : null } : null;
  if ((CIVIC?.closeAt ?? null) === (next?.closeAt ?? null) && (CIVIC?.winner ?? null) === (next?.winner ?? null)) return false;
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
  return { ...base, phase: "built" };
}
// Which crowd the lot draws on a machine day: "site", "golf", "farm", or null (closed).
export function lotOpenOn(day) {
  const p = lotPhase((day - 1) * 24 + 12);
  return p.phase === "site" ? "site" : p.phase === "built" ? p.winner : null;
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
      if (!p || p.kind === "home" || (p.kind === "work" && !owl) || typeof frac !== "number") continue;
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
function pickLeisure(s, day, i, seed, avoid, hour = null) {
  let { list, total } = leisureWeights(s, seed, day);
  // The lot takes visitors only once something is being built on it, and who comes follows
  // what it is: the site crew from the lower bands, golfers from the top, farmers from the rest.
  const lot = lotOpenOn(day);
  if (list.some(([id]) => id === "dev-lot") && (!lot || LOT_PULL[lot][bandOf(s)] !== 1)) {
    list = lot ? list.map(([id, v]) => [id, id === "dev-lot" ? v * LOT_PULL[lot][bandOf(s)] : v]) : list.filter(([id]) => id !== "dev-lot");
    total = list.reduce((a, [, v]) => a + v, 0);
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
  ["the-grind", "the-drip", "all-night-diner", "canteen"],
  ["gallery", "gallery-annex", "playhouse", "concert-hall", "studio-row"],
  ["park", "allotment", "the-plaza", "the-street", "rec-park", "forum"],
  ["market", "night-market"],
  ["stacks", "lecture-hall", "archive-stacks"],
  ["gym", "stadium", "ball-field", "courts", "pitch"],
];
const dist2 = (a, b) => (PLACES[a].pos.x - PLACES[b].pos.x) ** 2 + (PLACES[a].pos.y - PLACES[b].pos.y) ** 2;
const LEISURE_ROOMS = Object.values(PLACES).filter(p => p.kind === "leisure" || p.kind === "mixed").map(p => p.id);
export const OVERFLOW = Object.fromEntries(Object.keys(PLACES).map(id => {
  const fam = (FAMILY.find(f => f.includes(id)) || []).filter(q => q !== id).sort((a, b) => dist2(id, a) - dist2(id, b));
  const rest = LEISURE_ROOMS.filter(q => q !== id && !fam.includes(q)).sort((a, b) => dist2(id, a) - dist2(id, b));
  return [id, [...fam, ...rest]];
}));

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
      for (const { key, stops } of group) {
        let prevTo = null;
        for (const st of stops) {
          if (st.activity === "leisure") {
            const a = bucket(Math.min(st.from, prevTo ?? st.from) - 0.25), b = Math.max(a + 1, bucket(st.to + 0.25));
            let p = st.placeId;
            if (!fits(p, a, b)) {
              const chain = (OVERFLOW[p] || []).filter(q => q !== "dev-lot" || lotOpenOn(day));
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
const X0 = Math.min(...DISTRICTS.map(d => d.rect.x)), X1 = Math.max(...DISTRICTS.map(d => d.rect.x + d.rect.w));
const MID = DISTRICT.hq.rect;
const TOP_Y = (Math.max(...DISTRICTS.filter(d => d.rect.y + d.rect.h <= MID.y).map(d => d.rect.y + d.rect.h)) + MID.y) / 2;
const BOT_Y = (Math.min(...DISTRICTS.filter(d => d.rect.y >= MID.y + MID.h).map(d => d.rect.y)) + MID.y + MID.h) / 2;
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
const TRAIN_CARS = [4, 3, 4, 4, 3];
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
export const STATIONS = Object.fromEntries(DISTRICTS.map(d => [d.id, stationFor(d)]));
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
const LAP = ARR[ARR.length - 1];
export const HEADWAY = LAP / TRAIN_CARS.length;   // every platform sees a train this often
const trainLen = (n) => n * CAR_LEN + (n - 1) * CAR_GAP;
export const TRAINS = TRAIN_CARS.map((cars, k) => ({ id: `L${k + 1}`, index: k, name: `LOOP ${k + 1}`, cars, carCap: CAR_CAP, cap: cars * CAR_CAP, length: trainLen(cars) }));
export const TRAIN = Object.fromEntries(TRAINS.map(t => [t.id, t]));

// Centre of car c when the train's middle is at arc m (car 0 leads, clockwise).
const carArc = (k, c, m) => m + TRAINS[k].length / 2 - c * CAR_PITCH - CAR_LEN / 2;
const platformSpot = (st, s) => { const p = loopAt(s); return { x: p.x + st.n.x * PLATFORM_OFF, y: p.y + st.n.y * PLATFORM_OFF }; };

// Train k at machine hour T: the arc of its middle, and whether it stands at a platform.
function trainState(k, T) {
  const tau = mod(T - k * HEADWAY, LAP);
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

// The first train to reach a station at or after machine hour t -> {trainId, k, arrive, depart}.
export function nextArrival(stationId, t) {
  const i = STATIONS[stationId].index;
  const j = Math.ceil((toHours(t) - ARR[i]) / HEADWAY - 1e-9);
  const arrive = ARR[i] + j * HEADWAY, k = mod(j, TRAINS.length);
  return { trainId: TRAINS[k].id, k, stationId, arrive, depart: arrive + DWELL };
}
// The platform board: the next n trains at a station from machine hour t.
export function timetable(stationId, t, n = 4) {
  const out = [];
  let a = nextArrival(stationId, t);
  for (let i = 0; i < n; i++) { out.push(a); a = nextArrival(stationId, a.arrive + HEADWAY / 2); }
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
    for (let j = Math.ceil((a - ARR[i] - DWELL) / HEADWAY - 1e-9); ARR[i] + j * HEADWAY < b; j++) {
      const k = mod(j, TRAINS.length), arrive = ARR[i] + j * HEADWAY, tn = TRAINS[k].name;
      const pick = (list, kind) => list[fnv(`pa|${kind}|${id}|${j}`) % list.length](name, tn);
      if (arrive >= a && arrive < b) out.push({ t: arrive, kind: "arrive", trainId: TRAINS[k].id, stationId: id, text: pick(PA.arrive, "a") });
      if (arrive + DWELL >= a && arrive + DWELL < b) out.push({ t: arrive + DWELL, kind: "depart", trainId: TRAINS[k].id, stationId: id, text: pick(PA.depart, "d") });
    }
  }
  return out.sort((x, y) => x.t - y.t);
}

export const LOOP_LINE = {
  loop: { ...RING }, length: LOOP_L, at: loopAt, stations: STATIONS, order: STATION_ORDER,
  lapHours: LAP, headway: HEADWAY, dwell: DWELL, speed: V_TRAIN, carLen: CAR_LEN, carGap: CAR_GAP, carCap: CAR_CAP, platformOffset: PLATFORM_OFF,
  // v1 name: the stops, keyed by district, with the same {s, x, y, gate} shape.
  stops: STATIONS,
};
// v1 aliases: the bus is now the Loop.
export const BUS = LOOP_LINE;
export const V_BUS = V_TRAIN;

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
export const OPEN_LOTS = new Set(["the-green", "the-street", "the-plaza", "the-allotment", "the-diamond", "the-courts", "rec-ground", "the-pitch", "lot-6f07", "the-assembly"]);
const KERB = 0.4, CORNER = 0.3;   // the street view's footprints are the lot less 0.4
const FOOT = (() => {
  const blocks = BUILDINGS.filter(b => !OPEN_LOTS.has(b.id)).map(b => ({ id: b.id, x0: b.rect.x + KERB, y0: b.rect.y + KERB, x1: b.rect.x + b.rect.w - KERB, y1: b.rect.y + b.rect.h - KERB }));
  const inside = (p) => blocks.some(o => p.x > o.x0 && p.x < o.x1 && p.y > o.y0 && p.y < o.y1);
  const nodes = [];
  for (const o of blocks) for (const [x, y] of [[o.x0 - CORNER, o.y0 - CORNER], [o.x1 + CORNER, o.y0 - CORNER], [o.x1 + CORNER, o.y1 + CORNER], [o.x0 - CORNER, o.y1 + CORNER]]) {
    const p = { x, y };
    if (!inside(p)) nodes.push(p);
  }
  return { blocks, nodes, adj: null };
})();
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
const clear = (a, b, skip) => !FOOT.blocks.some(o => !skip.has(o.id) && crosses(a, b, o));
// -> [a, ...corners, b]: the shortest street path from a to b, the buildings in `skip` passable.
export function footpath(a, b, skip = new Set()) {
  if (clear(a, b, skip)) return [a, b];
  const N = FOOT.nodes, n = N.length;
  if (!FOOT.adj) {   // corner to corner, once: every building solid
    const none = new Set();
    FOOT.adj = N.map(() => []);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (clear(N[i], N[j], none)) { const d = dist(N[i], N[j]); FOOT.adj[i].push([j, d]); FOOT.adj[j].push([i, d]); }
  }
  // Dijkstra over the corners, a and b joined to every corner they can see.
  const D = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
  for (let i = 0; i < n; i++) if (clear(a, N[i], skip)) D[i] = dist(a, N[i]);
  const toB = N.map(p => (clear(p, b, skip) ? dist(p, b) : Infinity));
  let best = Infinity, last = -1;
  for (;;) {
    let i = -1;
    for (let k = 0; k < n; k++) if (!done[k] && D[k] < Infinity && (i < 0 || D[k] < D[i])) i = k;
    if (i < 0 || D[i] >= best) break;
    done[i] = true;
    if (D[i] + toB[i] < best) { best = D[i] + toB[i]; last = i; }
    for (const [j, d] of FOOT.adj[i]) if (D[i] + d < D[j]) { D[j] = D[i] + d; prev[j] = i; }
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
const walkLeg = (a, b, district, skip = null) => {
  const pts = skip ? footpath(a, b, skip) : [a, b];
  return { a, b, pts, mode: "walk", dur: Math.max(pathLen(pts) / V_WALK, 0.02), district };
};
function route(from, to, key, seed) {
  return remember(`rt|${seed}|${key}|${from}|${to}`, () => {
    const A = spotIn(from, key, seed), B = spotIn(to, key, seed);
    const dA = PLACES[from].district, dB = PLACES[to].district;
    if (dA === dB) {
      const leg = walkLeg(A, B, dA, ownBlocks(from, to));
      leg.dur = Math.max(leg.dur, 0.12);
      return { local: true, legs: [leg], total: leg.dur, nominal: leg.dur };
    }
    const sA = STATIONS[dA], sB = STATIONS[dB];
    const walk1 = [walkLeg(A, sA.gate, dA, ownBlocks(from)), walkLeg(sA.gate, sA.entrance, dA)];
    const w1 = walk1.reduce((n, l) => n + l.dur, 0);
    const ride = rideHours(dA, dB);
    // Worst case: just missed a train, and the car stops at the far end of the platform.
    const last = walkLeg(sB.gate, B, dB, ownBlocks(to));   // the same street walk every trip ends with
    const w2max = Math.max((dist(sB.entrance, sB.gate) + trainLen(4) / 2 + 0.5) / V_WALK, 0.02) + last.dur;
    return { local: false, A, B, dA, dB, walk1, last, w1, ride, nominal: w1 + PLATFORM_MIN + HEADWAY + ride + ALIGHT + w2max };
  });
}
export function commuteHours(from, to, s, seed = SEED) { return from === to ? 0 : route(from, to, keyOf(s), seed).nominal; }

// One actual trip, leaving at absolute machine hour t0. Times are offsets from t0, so a
// trip survives being shifted into the next day's schedule.
function planTrip(from, to, key, seed, t0) {
  const r = route(from, to, key, seed);
  if (r.local) return { local: true, total: r.total };
  const sA = STATIONS[r.dA], sB = STATIONS[r.dB];
  const arr = nextArrival(r.dA, t0 + r.w1 + PLATFORM_MIN);
  const k = arr.k, car = Math.floor(h01(`${seed}|car|${key}|${Math.round(arr.arrive * 3600)}`) * TRAINS[k].cars);
  const spotA = platformSpot(sA, carArc(k, car, sA.s)), spotB = platformSpot(sB, carArc(k, car, sB.s));
  const board = arr.arrive - t0, off = board + r.ride, out = off + ALIGHT;
  const walk2 = [walkLeg(spotB, sB.gate, r.dB), r.last];
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
  const key = keyOf(s), job = JOB[assignJob(s, seed).jobId], home = homeOf(s, seed), owl = isOwl(s, seed);
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
  return { stops, key, home };
}

function planDay(s, day, seed, raw = false) {
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
    const depart = free === -Infinity ? st.from - commuteHours(cur, st.placeId, s, seed) : free;
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
      if (fl & 8) g.trip = { local: true };
      else {
        const k = e[j++], car = e[j++], board = e[j++];
        const dA = PLACES[g.fromPlaceId].district, dB = PLACES[g.placeId].district;
        const off = board + rideHours(dA, dB);
        g.trip = { local: false, k, trainId: TRAINS[k].id, car, spotA: platformSpot(STATIONS[dA], carArc(k, car, STATIONS[dA].s)), spotB: platformSpot(STATIONS[dB], carArc(k, car, STATIONS[dB].s)), board, off, out: off + ALIGHT };
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
  const places = PLACE_LIST.map(p => p.id), idx = Object.fromEntries(places.map((id, i) => [id, i]));
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
        if (g.trip.local) fl |= 8;
        else extra.push(g.trip.k, g.trip.car, g.trip.board);
      }
      row.push([g.to, idx[g.placeId], PLAN_ACT[g.activity], fl, ...extra]);
      t = g.to;
    }
    subjects[key] = row;
  }
  return { format: PLAN_FORMAT, day, seed, roster: ROSTER_VER, social: { [day]: socialVer(day), [day - 1]: socialVer(day - 1) }, n: ROSTER_ORDER.length, places, subjects };
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
export const segDistricts = (g) => (g.activity === "commute" ? [...new Set([PLACES[g.fromPlaceId].district, PLACES[g.placeId].district])] : [PLACES[g.placeId].district]);
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
const DPLACES = Object.fromEntries(DISTRICTS.map(d => [d.id, PLACE_LIST.filter(p => p.district === d.id).map(p => p.id)]));
export function standInWalk(districtId, i, machineTime, seed = SEED) {
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
  const st = STATIONS[stationId], half = trainLen(4) / 2;
  const p = platformSpot(st, st.s + (h01(`~p|${stationId}|${i}`) * 2 - 1) * half);
  const pl = DPLACES[stationId]?.[0] || null;
  return { placeId: pl, fromPlaceId: pl, fromDistrictId: stationId, districtId: stationId, activity: "commute", progress: 0.5, buildingId: null, floor: null, floorId: null, atDistrictId: stationId, sub: "waiting", leg: "wait", stationId, x: p.x, y: p.y };
}
// Someone aboard a car of train k.
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
  const key = keyOf(s);
  const [a, b] = g.span || [g.from, g.to];
  const progress = clamp((h - a) / Math.max(1e-9, b - a), 0, 1);
  if (g.activity !== "commute") {
    const p = spotIn(g.placeId, key, seed), pl = PLACES[g.placeId];
    const floor = floorOf(g.placeId, key, seed);
    const out = { placeId: g.placeId, districtId: pl.district, activity: g.activity, progress, x: p.x, y: p.y, buildingId: pl.building, floor, floorId: BUILDING[pl.building].floors[floor].id };
    if (g.haunt) out.haunt = true;
    return out;
  }
  const dA = PLACES[g.fromPlaceId].district, dB = PLACES[g.placeId].district;
  const base = {
    placeId: g.placeId, fromPlaceId: g.fromPlaceId, fromDistrictId: dA, districtId: dB,
    activity: "commute", progress, buildingId: null, floor: null, floorId: null,
  };
  const r = route(g.fromPlaceId, g.placeId, key, seed), trip = g.trip;
  const t = Math.max(0, h - a);   // hours into the trip
  if (r.local || !trip) {
    const { leg, p } = alongLegs(r.legs, t);
    return { ...base, atDistrictId: leg.district || dB, sub: "walking", leg: "walk", x: p.x, y: p.y };
  }
  const sA = STATIONS[dA], sB = STATIONS[dB], train = { trainId: trip.trainId, car: trip.car, toStationId: dB };
  const eta = { boardAt: T - t + trip.board, alightAt: T - t + trip.off };
  if (t < r.w1) {
    // walk1 is street -> gate -> up the stairs to the platform; climb is how far up (0..1)
    const { p, i, k } = alongLegs(r.walk1, t);
    return { ...base, atDistrictId: dA, sub: "walking", leg: "walk", stationId: dA, climb: i === 1 ? k : 0, ...train, ...eta, x: p.x, y: p.y };
  }
  if (t < trip.board) {
    // Along the platform to where the car will stop, then stand.
    const walked = t - r.w1, need = dist(sA.entrance, trip.spotA) / V_WALK;
    const p = need <= 0 ? trip.spotA : lerp(sA.entrance, trip.spotA, clamp(walked / need, 0, 1));
    return { ...base, atDistrictId: dA, sub: "waiting", leg: "wait", stationId: dA, ...train, ...eta, x: p.x, y: p.y };
  }
  if (t < trip.off) {
    const p = carPoint(trip.k, trip.car, T);
    return { ...base, atDistrictId: "loop", sub: "riding", leg: "ride", stationId: null, ...train, ...eta, x: p.x, y: p.y };
  }
  if (t < trip.out) {
    const c = carPoint(trip.k, trip.car, T - t + trip.off);   // the train stands at the platform
    const p = lerp(c, trip.spotB, clamp((t - trip.off) / ALIGHT, 0, 1));
    return { ...base, atDistrictId: dB, sub: "alighting", leg: "alight", stationId: dB, ...train, ...eta, x: p.x, y: p.y };
  }
  // walk2 is platform -> down the stairs to the gate -> street (a trip read from a plan
  // lays its street walk out here, on first use)
  const walk2 = trip.walk2 || (trip.walk2 = [walkLeg(trip.spotB, sB.gate, dB), r.last]);
  const { p, i, k } = alongLegs(walk2, t - trip.out);
  return { ...base, atDistrictId: dB, sub: "walking", leg: "walk", stationId: dB, climb: i === 0 ? 1 - k : 0, ...train, ...eta, x: p.x, y: p.y };
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
      switch (w.sub) {
        case "waiting": return `ON THE PLATFORM // ${STATIONS[w.stationId].name}, FOR ${tn}. WAITING IS PERMITTED. IT IS ALSO TIMED.`;
        case "riding": return `ABOARD ${tn} // CAR ${w.car + 1}, BOUND FOR ${dist}. LOITERING ON THE LOOP IS A TIER EVENT.`;
        case "alighting": return `ALIGHTING // ${STATIONS[w.stationId].name}. MIND THE GAP. THE GAP IS MONITORED.`;
        default:
          if (w.fromDistrictId === w.districtId) return `IN TRANSIT // ON FOOT TO ${pl?.name}. THE PAVEMENT IS SCORED.`;
          if (w.stationId === w.fromDistrictId) return `IN TRANSIT // WALKING TO ${STATIONS[w.stationId].name}. THE LOOP WILL NOT WAIT.`;
          return `IN TRANSIT // FROM ${STATIONS[w.districtId].name} TO ${pl?.name} ON FOOT. ARRIVAL IS EXPECTED.`;
      }
    }
    default: return `DORMANT // ${place}. RECHARGING FOR TOMORROW'S QUOTA. RETENTION REQUIRES RECOVERY.`;
  }
}
