// THE AD INVENTORY: every place in the city and the games that can carry an ad, in one list, and
// what each one carries today. Every surface that draws an ad reads it from here (render only):
// the city's billboards (src/city/billboardDraw.js), the Estate Pitch's perimeter ring
// (src/play/soccer/render.js), the Tennis Club's back wall (src/play/tennis/render.js), the
// Courts' apron (src/play/hoops/render.js). Design and the selling questions: docs/design/ADS.md.
// Nothing here is sold yet. Today's creatives are house ads (Scott's own brands, a few, never
// shouting) and THIS SPACE AVAILABLE placeholders. Pure data, no imports: the games load it
// without the city. scripts/check-ads.mjs holds it (sizes, creatives, the house-ad cap per venue,
// every drawn slot clear of the field of play, the billboard ids equal to billboards.js).
//
// A slot: {id, surface, venue, location, size: {w, h, unit}, audience, creative, placeholder?, drawn}
//   surface      a key of SURFACES
//   venue        where it is: a game ("tennis", "soccer", "hoops") or "city"
//   size         the face in metres (games) or map cells (city billboards)
//   audience     {measured, basis, share}: measured is null until impressions are counted (ADS.md
//                "Measurement"); share is the modelled fraction of the venue's screen time the slot
//                is on camera (1 = every frame); basis says who sees it
//   creative     a key of CREATIVES
//   placeholder  how an AVAILABLE slot is drawn: "label" (THIS SPACE AVAILABLE, dim) or "plain"
//                (an empty board, for venues that want the breathing room)
//   drawn        false: an inventory line that no surface draws yet (shirt sponsors, naming rights)
//   at           games only: where the face stands in the game's own world units, for the check:
//                {x0, x1, y} (soccer, hoops: along the far side) or {wall: "back" | "side"} (tennis)

export const SURFACES = {
  "city-billboard": { name: "city billboard", unit: "cells", sold: "by the week" },
  "stadium-perimeter": { name: "stadium perimeter board", unit: "m", sold: "by the match or the week" },
  "court-side": { name: "court-side board", unit: "m", sold: "by the week" },
  "venue-naming": { name: "venue naming rights", unit: null, sold: "by the season" },
  "team-sponsor": { name: "team (shirt) sponsor", unit: null, sold: "by the season" },
  "league-title": { name: "league title sponsor", unit: null, sold: "by the season" },
  scoreboard: { name: "scoreboard / score bug", unit: null, sold: "by the week" },
  "arcade-marquee": { name: "arcade marquee side", unit: null, sold: "by the week" },
  "transit-wrap": { name: "bus / train wrap", unit: null, sold: "by the month" },
};

// What a slot can carry. kind "house": Scott's own brands (mark: a sprite in the brand atlas,
// src/ads/marks.js); "venue": the ground's own name; "available": the placeholder.
// bg / ink / line / title / sub / serif / neon / frame are the billboard's (billboardDraw.js);
// board: the shorter line a game's 3 x 5 type draws beside the mark on a pitch-side board.
export const CREATIVES = {
  ebtv: { kind: "house", brand: "Electric Basement", bg: "#06070b", mark: "eb-logo", boardMark: "eb-bolt", neon: true, line: "ELECTRICBASEMENT.TV", board: "ELECTRIC BASEMENT", ink: "#ffaa2d" },
  ebshop: { kind: "house", brand: "EB Shop", bg: "#1b1f21", mark: "ebshop", boardMark: "ebshop", neon: true, line: "SHOP.ELECTRICBASEMENT.TV", board: null, ink: "#51edda" },
  ebsn: { kind: "house", brand: "EBSN", bg: "#0f3f42", mark: "eb-bolt", neon: true, title: "EBSN", line: "AFTER DARK", ink: "#f472b6" },
  jetsam: { kind: "house", brand: "JETSAM!", bg: "#0f1c22", mark: "jetsam", sub: "iridescent", line: "AN IRIDESCENT PRODUCTION", ink: "#9fb8bc" },
  irenes: { kind: "house", brand: "Goodnight Irene's", bg: "#f7f5ec", mark: "irenes", line: null, ink: "#8c1622", frame: "#8c1622" },
  beacon: { kind: "house", brand: "Beacon", bg: "#3d2b96", mark: "beacon", line: null, ink: "#f6f6fc" },
  brainforest: { kind: "house", brand: "Brainforest", bg: "#0b1230", mark: "brainforest", title: "BRAINFOREST", line: "ANALYTICA", ink: "#a0c6ff", serif: true },
  "venue-pitch": { kind: "venue", lines: ["THE ESTATE PITCH", "ESTATE PITCH"] },
  "venue-courts": { kind: "venue", lines: ["THE COURTS"] },
  available: { kind: "available", bg: "#15171b", ink: "#7d8590", lines: ["THIS SPACE AVAILABLE", "SPACE AVAILABLE", "AVAILABLE"] },
};

// House ads stay sparse: at most this many per venue (the city's billboards: one brand once).
export const HOUSE_CAP = { city: 7, soccer: 2, tennis: 1, hoops: 1 };

const bb = (id, location, w, h, basis, creative, host) =>
  ({ id, surface: "city-billboard", venue: "city", location, size: { w, h, unit: "cells" }, audience: { measured: null, basis, share: null }, creative, ...(host ? { host } : {}), placeholder: "label", drawn: true });

// The soccer ring: fifteen boards along the far touchline (the side the broadcast sees), 0.4 m
// apart, centred on the halfway line and long enough for the widest camera at either end. The
// ground's name on the halfway line, one house ad a board away either side (the Electric Basement
// board long enough for its name beside the mark); the rest is for sale. [creative, metres]
const PITCH_RING = [["available", 15], ["available", 15], ["available", 15], ["available", 15], ["available", 15], ["ebtv", 26], ["available", 15],
  ["venue-pitch", 20], ["available", 15], ["ebshop", 15], ["available", 15], ["available", 15], ["available", 15], ["available", 15], ["available", 15]];
const RING_GAP = 0.4, RING_MID = 7;
// x0 of each board, the ring centred on the middle of the venue board
const RING_AT = (() => {
  const out = [];
  let x = 0;
  for (const [, w] of PITCH_RING) { out.push(x); x += w + RING_GAP; }
  const off = out[RING_MID] + PITCH_RING[RING_MID][1] / 2;
  return out.map(v => v - off);
})();
// The Courts' apron: six boards of 9 m along the far side, from x = -27.
const COURTS_APRON = [["available", "plain"], ["ebtv"], ["available", "label"], ["venue-courts"], ["available", "plain"], ["available", "label"]];

const TEAM_DISTRICTS = ["arts", "campus", "finance", "strip", "arena", "hq", "archive", "commons", "works", "sprawl"];
const planned = (id, surface, venue, location, basis) =>
  ({ id, surface, venue, location, size: null, audience: { measured: null, basis, share: null }, creative: "available", drawn: false });

export const SLOTS = [
  // ---- the city's billboards: the planner's ten reserved sites (src/city/billboards.js) ----
  bb("bb-roof-hab-a", "rooftop, the Sprawl", 2.6, 1.4, "the Loop's riders round the bottom of the ring, the Sprawl", "ebtv", "carol"),
  bb("bb-roof-lofts", "rooftop, the Archive", 3.4, 1.4, "HQ's plaza, the Loop's east side", "brainforest"),
  bb("bb-roof-seaview", "rooftop, the Coast", 2.6, 1.2, "the Shore Line's riders, the Pit's crowd", "jetsam"),
  bb("bb-roof-dive", "rooftop, the Strip", 3.6, 1.2, "the Strip's street, the casino's queue", "ebsn", "vern"),
  bb("bb-loop-arts-campus", "the Loop, Arts to Campus", 2.4, 1.0, "the Loop between Arts and Campus", "ebshop", "dale"),
  bb("bb-loop-finance-strip", "the Loop, Finance to the Strip", 2.4, 1.0, "the Loop between Finance and the Strip", "beacon"),
  bb("bb-loop-commons-works", "the Loop, the Commons to the Works", 2.4, 1.0, "the Loop between the Commons and the Works", "available"),
  bb("bb-loop-east", "the Loop's east side", 2.4, 1.0, "the Loop's east side, outside the ring", "available"),
  bb("bb-boardwalk-west", "the boardwalk, west", 2.6, 1.0, "the beach", "irenes"),
  bb("bb-boardwalk-east", "the boardwalk, east", 2.6, 1.0, "the beach, the pier", "available"),
  // ---- the Estate Pitch: the perimeter ring ----
  ...PITCH_RING.map(([creative, w], i) => ({
    id: `pitch-ring-${String(i + 1).padStart(2, "0")}`, surface: "stadium-perimeter", venue: "soccer", location: `the far touchline, board ${i + 1} of ${PITCH_RING.length}`,
    size: { w, h: 0.9, unit: "m" }, audience: { measured: null, basis: "every soccer match, broadcast camera", share: Math.abs(i - RING_MID) <= 2 ? 0.7 : Math.abs(i - RING_MID) <= 4 ? 0.45 : 0.2 },
    creative, placeholder: "label", drawn: true, at: { x0: RING_AT[i], x1: RING_AT[i] + w, y: 71 },
  })),
  // ---- the Tennis Club: the back wall (three boards) and the two side walls ----
  { id: "tennis-back-left", surface: "court-side", venue: "tennis", location: "the back wall, left", size: { w: 4.6, h: 0.9, unit: "m" }, audience: { measured: null, basis: "every tennis point", share: 1 }, creative: "available", placeholder: "plain", drawn: true, at: { wall: "back" } },
  { id: "tennis-back-centre", surface: "court-side", venue: "tennis", location: "the back wall, centre", size: { w: 5.4, h: 0.9, unit: "m" }, audience: { measured: null, basis: "every tennis point", share: 1 }, creative: "ebtv", drawn: true, at: { wall: "back" } },
  { id: "tennis-back-right", surface: "court-side", venue: "tennis", location: "the back wall, right", size: { w: 4.6, h: 0.9, unit: "m" }, audience: { measured: null, basis: "every tennis point", share: 1 }, creative: "available", placeholder: "plain", drawn: true, at: { wall: "back" } },
  { id: "tennis-side-left", surface: "court-side", venue: "tennis", location: "the left side wall", size: { w: 23, h: 1.65, unit: "m" }, audience: { measured: null, basis: "every tennis point", share: 1 }, creative: "available", placeholder: "plain", drawn: true, at: { wall: "side" } },
  { id: "tennis-side-right", surface: "court-side", venue: "tennis", location: "the right side wall", size: { w: 23, h: 1.65, unit: "m" }, audience: { measured: null, basis: "every tennis point", share: 1 }, creative: "available", placeholder: "plain", drawn: true, at: { wall: "side" } },
  // ---- the Courts: the far apron ----
  ...COURTS_APRON.map(([creative, placeholder], i) => ({
    id: `courts-apron-${i + 1}`, surface: "court-side", venue: "hoops", location: `the far apron, board ${i + 1} of 6`,
    size: { w: 9, h: 0.85, unit: "m" }, audience: { measured: null, basis: "every basketball game", share: 0.5 },
    creative, ...(placeholder ? { placeholder } : {}), drawn: true, at: { x0: -27 + i * 9.1, x1: -27 + i * 9.1 + 9, y: 17.14 },
  })),
  // ---- planned: in the inventory, drawn nowhere yet (ADS.md "What is for sale") ----
  ...[["tennis", "THE TENNIS CLUB"], ["soccer", "THE ESTATE PITCH"], ["hoops", "THE COURTS"], ["football", "THE BOWL"], ["bowling", "THE LANES"], ["golf", "THE DEPARTMENT LINKS"], ["ski", "THE MOUNTAIN"]]
    .map(([v, name]) => planned(`naming-${v}`, "venue-naming", v, `${name}: "<sponsor> presents ${name}"`, `every visit to ${name}`)),
  ...TEAM_DISTRICTS.map(d => planned(`team-${d}`, "team-sponsor", "leagues", `the ${d} district's sides: the shirt, every sport`, "every match the district plays, the standings")),
  ...["baseball", "basketball", "football", "soccer"].map(s => planned(`league-${s}`, "league-title", "leagues", `the city's ${s} league`, "the league table, every fixture")),
  ...["tennis", "soccer", "hoops", "football"].map(g => planned(`bug-${g}`, "scoreboard", g, "the broadcast's score bug", "every frame of every match")),
  planned("arcade-marquee", "arcade-marquee", "city", "the arcade's marquee, the side panel", "the arcade's visitors"),
  planned("wrap-loop", "transit-wrap", "city", "the Loop's train", "the whole ring"),
  planned("wrap-shore", "transit-wrap", "city", "the Shore Line's train", "the Coast"),
];

export const SLOT = Object.fromEntries(SLOTS.map(s => [s.id, s]));
export const slotsAt = (venue) => SLOTS.filter(s => s.venue === venue && s.drawn);
// The creative a slot carries now (an unknown key reads as AVAILABLE, never as a blank).
export const creativeOf = (slot) => CREATIVES[slot?.creative] || CREATIVES.available;
