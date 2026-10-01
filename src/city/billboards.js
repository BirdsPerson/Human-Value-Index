// BILLBOARD SITES (the master plan, 2026-09-30). Scott approved the EBSN hosts' faces "on
// billboards and stuff": the plan reserves the sites; what goes on them (EBSN hosts advertising
// the EB Shop, EBTV, JETSAM!, tappable through the funnels' utm links) is a later pass. Pure data:
// no drawing here. docs/planning/MASTER_PLAN.md "Billboard sites".
//
// A site: {id, district, kind, host?, x, y (the panel's centre, map cells), facing ("n" | "e" |
//   "s" | "w": the side the face looks toward), w (the panel's width, cells), h0, h1 (the panel's
//   bottom and top, storeys), audience (who sees it), note}
//   kind "rooftop"   on a flat roof: host is the building; h0 sits on its roof
//   kind "loop"      roadside along the Loop's viaduct, the panel at deck height for the riders
//   kind "boardwalk" on the Coast's boardwalk, facing the beach
//   kind "strip"     on the Strip, over its street
// scripts/check-planner.mjs holds every site: inside its district (or its gutter), a rooftop
// inside its host's roof and above it, every other site clear of every building, yard prop,
// station, stair, spur shelter and piece of the viaduct at all four quarter turns.
import { COAST_DY } from "./sim.js";

export const BILLBOARD_DEPTH = 0.16;   // the panel and its frame, cells
export const BILLBOARD_SITES = [
  // rooftops, seen from the Loop and from across the city
  { id: "bb-roof-hab-a", district: "sprawl", kind: "rooftop", host: "hab-a", x: 59.2, y: 49.35, facing: "n", w: 2.6, h0: 8.2, h1: 9.6, audience: "the Loop's riders round the bottom of the ring, the Sprawl" },
  { id: "bb-roof-lofts", district: "archive", kind: "rooftop", host: "lofts", x: 86, y: 35.7, facing: "w", w: 3.4, h0: 6.2, h1: 7.6, audience: "HQ's plaza, the Loop's east side" },
  { id: "bb-roof-seaview", district: "coast", kind: "rooftop", host: "seaview-flats", x: 40.9, y: 71.1 + COAST_DY, facing: "n", w: 2.6, h0: 5.2, h1: 6.4, audience: "the Shore Line's riders, the Pit's crowd" },
  { id: "bb-roof-dive", district: "strip", kind: "rooftop", host: "the-dive", x: 90.5, y: 4.6, facing: "s", w: 3.6, h0: 2.5, h1: 3.7, audience: "the Strip's street, the casino's queue" },
  // roadside along the viaduct, at the riders' eye level, in the gutters between stations
  { id: "bb-loop-arts-campus", district: "arts", kind: "loop", x: 26.5, y: 13.55, facing: "s", w: 2.4, h0: 1.55, h1: 2.55, audience: "the Loop between Arts and Campus" },
  { id: "bb-loop-finance-strip", district: "finance", kind: "loop", x: 82.5, y: 13.55, facing: "s", w: 2.4, h0: 1.55, h1: 2.55, audience: "the Loop between Finance and the Strip" },
  { id: "bb-loop-commons-works", district: "commons", kind: "loop", x: 26.5, y: 44.45, facing: "n", w: 2.4, h0: 1.55, h1: 2.55, audience: "the Loop between the Commons and the Works" },
  { id: "bb-loop-east", district: "archive", kind: "loop", x: 111.95, y: 22.5, facing: "e", w: 2.4, h0: 1.55, h1: 2.55, audience: "the Loop's east side, outside the ring" },
  // the Coast's boardwalk, between the stalls, facing the beach
  { id: "bb-boardwalk-west", district: "coast", kind: "boardwalk", x: 11, y: 76.25 + COAST_DY, facing: "s", w: 2.6, h0: 0.6, h1: 1.6, audience: "the beach" },
  { id: "bb-boardwalk-east", district: "coast", kind: "boardwalk", x: 41, y: 76.25 + COAST_DY, facing: "s", w: 2.6, h0: 0.6, h1: 1.6, audience: "the beach, the pier" },
];
// The panel's footprint in map cells: -> {x0, y0, x1, y1, h0, h1}
export function billboardBox(b) {
  const along = b.facing === "n" || b.facing === "s", hw = b.w / 2, hd = BILLBOARD_DEPTH / 2;
  return along ? { x0: b.x - hw, x1: b.x + hw, y0: b.y - hd, y1: b.y + hd, h0: b.h0, h1: b.h1 } : { x0: b.x - hd, x1: b.x + hd, y0: b.y - hw, y1: b.y + hw, h0: b.h0, h1: b.h1 };
}
