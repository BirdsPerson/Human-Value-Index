// Architecture, as massing: what each building is made of, in map cells. Pure (no DOM), so
// scripts/check-cityview.mjs can hold it to the rules (every building has a style with a
// drawer, the body stays in its lot, nothing in the yard stands on the body, on another
// prop or on the Loop, at every quarter turn). archDraw.js draws it; CityIso.jsx slots the
// body and each yard prop into the painter's order as boxes of their own.
//
// A building is: parts (the body: boxes with a roof shape, cylinders, a cooling tower),
// yard props (standing things on its lot: trees, a hoop, the chain-link, a doorman, an
// ambulance under its canopy) and ground (flat things: a court slab, a lawn, a plaza).
// Heights are in storeys. `rise` is how tall it reads; the sim's floors are the rooms
// inside (a tower's floor may be several storeys of glass).
//
// Every part and prop is laid out relative to the lot (x, y from its north-west corner).
// The street and the pavement are the lot's outer 0.4 cells (sim KERB): nothing stands
// there, so walkers never walk through a tree.

import { BUILDINGS, ARCH, HOUSING_TIERS, OPEN_LOTS } from "./sim.js";
import { rotRect } from "./iso.js";
import { insetOf, PARK_LOTS } from "./parkGeo.js";
import { funnelMass, FUNNEL_STYLES, FUNNEL_OUT_FRONT } from "./funnelGeo.js";
import { COAST_LOTS, TERRAIN_MAX } from "./coastGeo.js";
import { venueMass, VENUE_STYLES, VENUE_OUT_FRONT } from "./venueGeo.js";

export const KERB = 0.4;    // props and bodies keep this far in from the lot edge (sim KERB)

// What every style is, for the map key and the checks: its family and, for housing, who lives there.
export const STYLES = {
  projects: { family: "housing", name: "THE PROJECTS" }, brownstone: { family: "housing", name: "BROWNSTONES AND WALK-UPS" },
  lofts: { family: "housing", name: "WAREHOUSE LOFTS" }, glass: { family: "housing", name: "GLASS RESIDENTIAL TOWER" },
  office: { family: "finance", name: "OFFICE TOWER" }, monolith: { family: "state", name: "THE MONOLITH" },
  gothic: { family: "campus", name: "COLLEGIATE GOTHIC" }, clocktower: { family: "campus", name: "CLOCK TOWER" },
  neon: { family: "strip", name: "NEON BAR" }, casino: { family: "strip", name: "CASINO" }, diner: { family: "strip", name: "DINER" },
  gallery: { family: "arts", name: "GALLERY" }, theatre: { family: "arts", name: "THEATRE" }, cafe: { family: "arts", name: "CAFE" }, studio: { family: "arts", name: "SOUND STAGES" },
  hall: { family: "arena", name: "SPORTS HALL" }, classical: { family: "archive", name: "CLASSICAL HALL" }, vault: { family: "archive", name: "VAULT" },
  hospital: { family: "civic", name: "HOSPITAL" }, chapel: { family: "civic", name: "CHAPEL" }, market: { family: "civic", name: "MARKET HALL" }, school: { family: "civic", name: "SCHOOLHOUSE" },
  shed: { family: "industry", name: "SAWTOOTH SHED" }, reactor: { family: "industry", name: "REACTOR" }, stacks: { family: "industry", name: "FOUNDRY" },
  datahall: { family: "industry", name: "DATA HALL" }, docks: { family: "industry", name: "DOCKS" }, tanks: { family: "industry", name: "TANK FARM" },
  bunker: { family: "state", name: "BARRACKS" }, prison: { family: "state", name: "PRISON" }, canteen: { family: "industry", name: "CANTEEN" },
  // THE COAST and THE HEIGHTS (2026-09-30): seaside and alpine housing by tier, the base lodge
  shacks: { family: "housing", name: "SURF SHACKS" }, seawall: { family: "housing", name: "SEAWALL ESTATE" }, bungalow: { family: "housing", name: "BEACH BUNGALOWS" },
  seaview: { family: "housing", name: "SEAVIEW FLATS" }, condo: { family: "housing", name: "OCEANFRONT CONDOMINIUM" },
  bunkhouse: { family: "housing", name: "BUNKHOUSE" }, alpine: { family: "housing", name: "ALPINE FLATS" }, chalet: { family: "housing", name: "CHALETS" },
  lodge: { family: "leisure", name: "SKI LODGE" },
  // open ground: drawn by parkDraw (the fields, the Bowl) or as a lot (the Green, the Street)
  stadium: { family: "ground" }, field: { family: "ground" }, lot: { family: "ground" },
  ...FUNNEL_STYLES,   // the Arcade, the EB Shop, the EBTV station (funnelGeo.js)
  ...VENUE_STYLES,    // the Dept of Planning (venueGeo.js)
};
export const GROUND_STYLES = new Set(["stadium", "field", "lot"]);
export { HOUSING_TIERS };

// A box part. roof: flat | gable (ridge along `ax`: "x" or "y") | saw (teeth along ax) |
// barrel | pyramid | none.
const box = (x0, y0, x1, y1, h0, h1, mat, o = {}) => ({ k: "box", x0, y0, x1, y1, h0, h1, mat, roof: "flat", ...o });
const cyl = (cx, cy, r, h0, h1, mat, o = {}) => ({ k: "cyl", cx, cy, r, x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r, h0, h1, mat, ...o });
// A yard prop: a point (with a radius) or a run (a fence panel, x0,y0 -> x1,y1).
const pt = (k, x, y, r = 0.2, o = {}) => ({ k, x, y, r, x0: x - r, y0: y - r, x1: x + r, y1: y + r, ...o });
const bx = (k, x0, y0, x1, y1, o = {}) => ({ k, x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: 0, x0, y0, x1, y1, ...o });
const run = (k, x0, y0, x1, y1, o = {}) => ({ k, ax: x0, ay: y0, bx: x1, by: y1, x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), ...o });
const gr = (k, x0, y0, x1, y1, o = {}) => ({ k, x0, y0, x1, y1, ...o });
// A fence round a rectangle, in panels of at most `len` cells; `gap` leaves the gate open.
function fence(x0, y0, x1, y1, sides = "nesw", len = 1.5, gate = null) {
  const out = [];
  const side = (ax, ay, bx, by, s) => {
    const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / len));
    for (let i = 0; i < n; i++) {
      if (gate && gate.side === s && i === gate.i) continue;
      out.push(run("fence", ax + (bx - ax) * i / n, ay + (by - ay) * i / n, ax + (bx - ax) * (i + 1) / n, ay + (by - ay) * (i + 1) / n, { side: s }));
    }
  };
  if (sides.includes("n")) side(x0, y0, x1, y0, "n");
  if (sides.includes("e")) side(x1, y0, x1, y1, "e");
  if (sides.includes("s")) side(x1, y1, x0, y1, "s");
  if (sides.includes("w")) side(x0, y1, x0, y0, "w");
  return out;
}

// Massing per style: (W, H, n = the sim's storeys above ground, id) -> {parts, yard, ground, rise}.
const MASS = {
  // Big brick slab, eight storeys of repeating balconies; the court at the end of the block,
  // inside the chain-link.
  projects: (W, H) => ({
    rise: 8,
    parts: [box(0.6, 0.8, 8.9, 3.9, 0, 8, "brick", { win: "projects", door: "s" }),
      box(3.9, 1.7, 5.6, 3.0, 8, 8.7, "concrete"), cyl(7.5, 2.3, 0.45, 8, 8.9, "tank", { cap: "cone" })],
    ground: [gr("court", 9.3, 0.55, 12.3, 4.45)],
    yard: [pt("hoop", 10.8, 0.75, 0.18, { face: "s" }), pt("hoop", 10.8, 4.25, 0.18, { face: "n" }),
      ...fence(9.25, 0.5, 12.3, 4.5, "nes", 1.55, { side: "s", i: 1 }), pt("bench", 9.6, 2.5, 0.15, { along: "y" })],
  }),
  // A row of houses, alternating brownstone (stoop, bay, cornice) and red-brick walk-up (the
  // fire escape up the front), trees on the pavement between the stoops.
  brownstone: (W, H, n, id) => {
    const xs = [0.5, 2.85, 5.2, 7.55, 9.9, 12.25], salt = id === "hab-d" ? 1 : 0;
    const parts = xs.slice(0, -1).map((x, i) => {
      const walk = (i + salt) % 2 === 1;
      return box(x, 0.7, xs[i + 1], 3.7, 0, walk ? 5 : 4, walk ? "redbrick" : "brownstone", { win: walk ? "walkup" : "brown", house: i, door: "s", cornice: true });
    });
    return { rise: 5, parts, ground: [gr("pavement", 0.5, 3.7, 12.25, 4.55)], yard: [2.85, 7.55, 12.05].map(x => pt("tree", x, 4.45, 0.12)) };
  },
  // A converted warehouse: arched windows, fire escapes, the water tower on its legs.
  lofts: () => ({
    rise: 6,
    parts: [box(1, 0.8, 19, 5.3, 0, 6, "redbrick", { win: "loft", door: "s", fireEsc: true, cornice: true }),
      cyl(15, 2.6, 0.55, 6.3, 7.3, "wood", { cap: "cone", legs: 0.3 })],
    ground: [gr("paving", 19.6, 0.6, 27.5, 5.8)],
    yard: [pt("tree", 21.2, 1.4, 0.2), pt("tree", 25.8, 1.4, 0.2), pt("tree", 23.5, 4.8, 0.2), pt("bench", 23.5, 2.6, 0.15, { along: "x" }), pt("lamp", 20.3, 4.9, 0.08)],
  }),
  // Glass on a podium, set back twice; the pool on the podium roof, the canopy and its doorman.
  glass: () => ({
    rise: 14.3,
    parts: [box(1, 0.6, 14.5, 3.9, 0, 2, "glass", { win: "curtain", podium: true, pool: [8.8, 1.0, 13.8, 3.5], canopy: [3.9, 6.1], door: "s" }),
      box(2, 0.9, 8, 3.6, 2, 11, "glass", { win: "curtain", terrace: true }),
      box(2.5, 1.2, 7.5, 3.3, 11, 13.5, "glass", { win: "curtain", terrace: true }),
      box(3.3, 1.6, 6.7, 2.9, 13.5, 14.3, "glass", { win: "crown", antenna: 2.2 })],
    ground: [gr("plaza", 15, 0.55, 22.5, 4.45)],
    yard: [pt("doorman", 6.45, 4.5, 0.05), pt("planter", 16.3, 1.2, 0.3), pt("planter", 21.2, 1.2, 0.3), pt("planter", 16.3, 3.8, 0.3), pt("planter", 21.2, 3.8, 0.3), pt("fountain", 18.75, 2.5, 0.7)],
  }),
  // The exchange's colonnade, the tower with its ticker, the lounge on the roof.
  office: () => ({
    rise: 13.8,
    parts: [box(1, 0.7, 13, 4.2, 0, 2.5, "stone", { win: "colonnade", ticker: true, door: "s" }),
      box(13.8, 0.6, 21.8, 4.1, 0, 13, "steel", { win: "office", ticker: true, band: 7 }),
      box(15, 1.1, 19.4, 3.4, 13, 13.8, "glass", { win: "crown", umbrellas: true, antenna: 3 })],
    ground: [], yard: [3, 6, 9].map(x => pt("flag", x, 4.5, 0.06)),
  }),
  // A black slab with one eye. The plaza is watched.
  monolith: (W, H) => {
    const cx = W / 2, cy = H / 2;
    return {
      rise: 11.5,
      parts: [box(cx - 4.4, cy - 2.6, cx + 4.4, cy + 2.6, 0, 0.3, "plinth"), box(cx - 3.6, cy - 1.9, cx + 3.6, cy + 1.9, 0.3, 11.5, "obsidian", { win: "none", eye: 9.4 })],
      ground: [gr("plaza", 2, 2, W - 2, H - 2, { dark: true })],
      yard: [pt("camera", 4, 4, 0.08), pt("camera", W - 4, 4, 0.08), pt("camera", 4, H - 4, 0.08), pt("camera", W - 4, H - 4, 0.08), pt("camera", cx - 9, cy, 0.08), pt("camera", cx + 9, cy, 0.08),
        ...Array.from({ length: 9 }, (_, i) => pt("bollard", cx - 6 + i * 1.5, cy + 5, 0.08)), ...Array.from({ length: 9 }, (_, i) => pt("bollard", cx - 6 + i * 1.5, cy - 5, 0.08))],
    };
  },
  // Stone, pointed windows, ivy; a turret at each end.
  gothic: (W, H, n, id) => ({
    rise: n,
    parts: [box(0.6, 0.9, 1.8, 4.1, 0, n + 0.8, "sandstone", { win: "pointed", roof: "pyramid", peak: 1.3 }),
      box(1.8, 1.1, 9.7, 3.9, 0, n, "sandstone", { win: "pointed", roof: "gable", ax: "x", peak: 1.2, ivy: true, door: "s", fumes: id === "lab-block" }),
      box(9.7, 0.9, 10.9, 4.1, 0, n + 0.8, "sandstone", { win: "pointed", roof: "pyramid", peak: 1.3 })],
    ground: [gr("lawn", 1.8, 3.9, 9.7, 4.55)], yard: [],
  }),
  // The clock tells the machine's time; the quad beside it has paths and trees.
  clocktower: () => ({
    rise: 10,
    parts: [box(4.6, 1.2, 6.9, 3.5, 0, 7, "sandstone", { win: "pointed", clock: 6.5, ivy: true, door: "s" }),
      box(4.8, 1.4, 6.7, 3.3, 7, 8, "sandstone", { win: "belfry", roof: "pyramid", peak: 2.2 }),
      box(7.3, 1.3, 10.8, 3.4, 0, 2, "sandstone", { win: "pointed", roof: "gable", ax: "x", peak: 0.9, ivy: true })],
    ground: [gr("quad", 0.55, 0.55, 4.3, 4.45)],
    yard: [pt("tree", 1.1, 1.1, 0.2), pt("tree", 3.7, 1.1, 0.2), pt("tree", 1.1, 3.9, 0.2), pt("tree", 3.7, 3.9, 0.2), pt("statue", 2.43, 2.5, 0.2)],
  }),
  neon: () => ({
    rise: 2.3,
    parts: [box(1, 1, 10.5, 4.1, 0, 2.3, "darkbrick", { win: "bar", neon: "THE DIVE", blade: true, door: "s", cornice: true })],
    ground: [], yard: [],
  }),
  casino: () => ({
    rise: 4,
    parts: [box(0.5, 0.6, 11, 4.0, 0, 4, "casino", { win: "casino", marquee: true, door: "s", sign: "HOUSE EDGE" })],
    ground: [gr("carpet", 3.5, 4.0, 8, 4.55)], yard: [],
  }),
  diner: () => ({
    rise: 3,
    parts: [box(1, 1, 10.5, 4.1, 0, 3, "redbrick", { win: "diner", neon: "DINER", door: "s", cornice: true, roofSign: "PRESS" })],
    ground: [], yard: [pt("hydrant", 10.8, 4.48, 0.06)],
  }),
  gallery: () => ({
    rise: 4,
    parts: [box(0.8, 0.8, 10.7, 3.4, 0, 4, "white", { win: "gallery", banners: true }),
      box(3.5, 3.4, 7.2, 4.4, 0, 2, "glass", { win: "atrium", door: "s" })],
    ground: [], yard: [pt("statue", 10.9, 2.1, 0.15)],
  }),
  theatre: () => ({
    rise: 4.5,
    parts: [box(3.5, 0.6, 8, 1.6, 0, 4.5, "maroon", { win: "none" }),
      box(1, 1.6, 10.5, 4.1, 0, 3, "maroon", { win: "theatre", marquee: true, blade: "PLAYHOUSE", door: "s", cornice: true })],
    ground: [], yard: [pt("poster", 1.6, 4.55, 0.03), pt("poster", 9.9, 4.55, 0.03)],
  }),
  cafe: () => ({
    rise: 2,
    parts: [box(1, 1, 10.5, 3.8, 0, 2, "redbrick", { win: "cafe", awning: true, door: "s", cornice: true, steam: true })],
    ground: [], yard: [3, 5.2, 7.4].map(x => pt("table", x, 4.45, 0.1)),
  }),
  studio: () => ({
    rise: 2.2,
    parts: [box(0.8, 0.8, 10.7, 4.2, 0, 2, "corrugated", { win: "studio", roof: "saw", ax: "x", teeth: 6, door: "s", onAir: true })],
    ground: [], yard: [],
  }),
  hall: (W, H) => ({
    rise: 3.4,
    parts: [box(1, 1.2, 11, 7.8, 0, 2, "hall", { win: "hall", roof: "barrel", ax: "y", peak: 1.4, door: "e" })],
    ground: [], yard: [],
  }),
  classical: () => ({
    rise: 3.6,
    parts: [box(2, 1.2, 20, 4.4, 0, 3, "limestone", { win: "tall", cornice: true }),
      box(7, 4.4, 15, 5.5, 0, 3, "limestone", { win: "none", portico: true, roof: "gable", ax: "y", peak: 0.6, door: "s" })],
    ground: [gr("paving", 20.6, 0.6, 27.5, 5.8)],
    yard: [pt("tree", 22, 1.6, 0.2), pt("tree", 26, 1.6, 0.2), pt("tree", 22, 4.6, 0.2), pt("tree", 26, 4.6, 0.2), pt("statue", 24, 3.1, 0.2)],
  }),
  vault: () => ({
    rise: 2,
    parts: [box(3, 1, 18, 4.9, 0, 2, "vaultcon", { win: "none", vaultDoor: true })],
    ground: [gr("paving", 3, 4.9, 18, 5.85)],
    yard: [...Array.from({ length: 8 }, (_, i) => pt("bollard", 4 + i * 2, 5.5, 0.08)), pt("camera", 19, 1.2, 0.08), pt("camera", 2.2, 1.2, 0.08), bx("armoured", 21.8, 2.4, 23.4, 3.3), pt("booth", 20.5, 5.2, 0.25)],
  }),
  hospital: () => ({
    rise: 4,
    parts: [box(0.6, 0.7, 5.6, 4.0, 0, 4, "white", { win: "ward", cross: true, door: "s", helipad: true })],
    ground: [gr("bay", 5.7, 1.1, 7.2, 4.5)],
    yard: [bx("ambulance", 5.75, 1.15, 7.25, 4.5)],
  }),
  chapel: () => ({
    rise: 2,
    parts: [box(0.7, 1.9, 1.7, 3.1, 0, 3.6, "sandstone", { win: "pointed", roof: "pyramid", peak: 2.4 }),
      box(1.7, 1.4, 6.4, 3.6, 0, 1.6, "sandstone", { win: "pointed", roof: "gable", ax: "x", peak: 1.1, rose: true, door: "s", ivy: true })],
    ground: [gr("lawn", 1.2, 3.6, 7.2, 4.55)], yard: [pt("grave", 5.2, 4.2, 0.1), pt("grave", 6.2, 4.2, 0.1), pt("tree", 6.9, 1.1, 0.2)],
  }),
  market: () => ({
    rise: 2,
    parts: [box(0.6, 0.7, 7.0, 3.2, 0, 2, "market", { win: "market", awning: true, door: "s", lanterns: true })],
    ground: [], yard: [1.6, 3.8, 6.0].map(x => pt("stall", x, 4.02, 0.42)),
  }),
  school: () => ({
    rise: 2,
    parts: [box(0.8, 1, 6.9, 3.6, 0, 2, "redbrick", { win: "school", roof: "gable", ax: "x", peak: 1, cupola: true, door: "s" })],
    ground: [gr("playground", 0.8, 3.7, 6.9, 4.55)], yard: [pt("flag", 7.15, 4.3, 0.06)],
  }),
  shed: () => ({
    rise: 2.6,
    parts: [box(0.5, 0.5, 5.8, 2.55, 0, 2, "rust", { win: "shed", roof: "saw", ax: "x", teeth: 5, door: "s", dock: true })],
    ground: [], yard: [pt("conveyor", 6.5, 1.65, 0.7)],
  }),
  reactor: () => ({
    rise: 4,
    parts: [cyl(2.1, 1.65, 1.15, 0, 1.5, "concrete", { cap: "dome", warn: true }), cyl(5.6, 1.65, 1.15, 0, 4, "concrete", { cool: true })],
    ground: [], yard: [],
  }),
  stacks: () => ({
    rise: 5,
    parts: [box(0.5, 0.6, 5.2, 2.8, 0, 1.6, "rust", { win: "foundry", roof: "gable", ax: "x", peak: 0.7, door: "s", glow: true }),
      cyl(6.05, 1.1, 0.32, 0, 5, "stack", { smoke: true }), cyl(6.85, 2.25, 0.28, 0, 4.2, "stack", { smoke: true })],
    ground: [], yard: [],
  }),
  datahall: () => ({
    rise: 3,
    parts: [box(0.6, 0.5, 6.9, 2.8, 0, 3, "panel", { win: "vents", fans: true, leds: true, door: "s" })],
    ground: [], yard: [],
  }),
  docks: () => ({
    rise: 3,
    parts: [box(0.5, 0.5, 4, 2.8, 0, 1.5, "rust", { win: "shed", roof: "gable", ax: "y", peak: 0.5, door: "e", dock: true })],
    ground: [gr("apron", 4.1, 0.5, 7.2, 2.85)], yard: [pt("containers", 5.3, 1.65, 1.1)],
  }),
  tanks: () => ({
    rise: 2.2,
    parts: [box(0.5, 0.5, 4.3, 2.8, 0, 1.2, "greenhouse", { win: "greenhouse", roof: "gable", ax: "x", peak: 0.7 }),
      cyl(5.1, 1.1, 0.48, 0, 2.2, "steel", { cap: "dome" }), cyl(6.4, 1.1, 0.48, 0, 2.2, "steel", { cap: "dome" }), cyl(5.75, 2.35, 0.4, 0, 1.6, "steel", { cap: "dome" })],
    ground: [], yard: [],
  }),
  bunker: () => ({
    rise: 2,
    parts: [box(0.6, 0.5, 6.4, 2.8, 0, 2, "vaultcon", { win: "slit", door: "s", antenna: 2.6, flood: true })],
    ground: [], yard: [pt("sandbags", 7.0, 1.65, 0.2)],
  }),
  prison: () => ({
    rise: 4.6,
    parts: [box(0.6, 0.6, 5.4, 2.7, 0, 3, "vaultcon", { win: "cell", wire: true, door: "s" })],
    ground: [], yard: [pt("watchtower", 6.4, 1.65, 0.35)],
  }),
  canteen: () => ({
    rise: 2,
    parts: [box(0.6, 0.6, 5.8, 2.7, 0, 1.3, "rust", { win: "canteen", roof: "gable", ax: "x", peak: 0.6, door: "s", sign: "SLAG" }),
      cyl(4.9, 1.3, 0.16, 1.3, 2.9, "stack", { steam: true })],
    ground: [], yard: [pt("bins", 6.6, 2.1, 0.2)],
  }),

  // ---- THE COAST ----
  // Four huts in faded pastels, tin roofs, boards leaning at the front; palms between.
  shacks: () => ({
    rise: 1.8,
    parts: ["pastel", "pastelpink", "pastelyellow", "pastel"].map((mat, i) => box(0.7 + i * 2.7, 1.2, 2.9 + i * 2.7, 3.6, 0, 1.1, mat, { win: "shack", roof: "gable", ax: "x", peak: 0.55, door: "s", house: i })),
    ground: [gr("sand", 0.5, 3.7, 11.5, 6.5)],
    yard: [pt("palm", 1.2, 5.6, 0.25), pt("palm", 10.8, 5.4, 0.25), pt("surfboard", 3.1, 4.4, 0.18), pt("surfboard", 3.8, 4.4, 0.18), pt("surfboard", 8.4, 4.4, 0.18), pt("bench", 6.2, 5.5, 0.15, { along: "x" })],
  }),
  // The overflow estate: a weathered slab by the seawall, balconies full of towels.
  seawall: () => ({
    rise: 7,
    parts: [box(0.8, 0.9, 11.2, 4.4, 0, 7, "weathered", { win: "flats", balconies: true, door: "s", towels: true })],
    ground: [gr("paving", 0.6, 4.6, 11.4, 6.5)],
    yard: [pt("palm", 1.4, 5.7, 0.25), pt("bench", 6, 5.6, 0.15, { along: "x" }), pt("lamp", 10.4, 5.8, 0.08)],
  }),
  // Three bungalows on stilts of sand, verandas to the front, one storey and a loft.
  bungalow: () => ({
    rise: 2.8,
    parts: ["stucco", "pastel", "stucco"].map((mat, i) => box(0.7 + i * 3.8, 1.0, 3.9 + i * 3.8, 4.0, 0, 2, mat, { win: "bungalow", roof: "gable", ax: "y", peak: 0.8, door: "s", veranda: true, house: i })),
    ground: [gr("sand", 0.5, 4.5, 11.5, 6.5)],
    yard: [pt("palm", 1.5, 5.8, 0.25), pt("palm", 10.5, 5.8, 0.25), pt("surfboard", 5.4, 5.6, 0.18), pt("lamp", 7.6, 5.9, 0.08)],
  }),
  // Stucco flats, five storeys, every window a balcony with a view of the balcony opposite.
  seaview: () => ({
    rise: 5.4,
    parts: [box(0.8, 0.9, 11.2, 4.3, 0, 5, "stucco", { win: "flats", balconies: true, door: "s" }), box(4.2, 1.8, 7.6, 3.4, 5, 5.4, "stucco", { win: "none" })],
    ground: [gr("paving", 0.6, 4.6, 11.4, 6.5)],
    yard: [pt("palm", 1.2, 5.6, 0.25), pt("planter", 5.2, 5.6, 0.3), pt("planter", 7.2, 5.6, 0.3), pt("palm", 10.8, 5.6, 0.25)],
  }),
  // Oceanfront glass: a podium with the pool deck, a slim tower, the penthouse deck.
  condo: () => ({
    rise: 7.6,
    parts: [box(0.8, 0.8, 12.2, 3.6, 0, 1.5, "glass", { win: "condo", door: "s", pool: [7.8, 1.1, 11.8, 3.3] }),
      box(1.4, 1.1, 7.2, 3.3, 1.5, 7, "glass", { win: "condo", terrace: true }),
      box(2.2, 1.5, 6.4, 2.9, 7, 7.6, "glass", { win: "crown", umbrellas: true })],
    ground: [gr("sand", 0.6, 4.0, 12.4, 6.5)],
    yard: [pt("doorman", 4.3, 4.2, 0.05), pt("palm", 1.2, 5.5, 0.25), pt("palm", 11.8, 5.5, 0.25), pt("umbrella", 7.2, 5.5, 0.35), pt("umbrella", 9.4, 5.5, 0.35)],
  }),

  // ---- THE HEIGHTS ----
  // The lift crew's quarters: a long timber block, four storeys of bunks, skis at the door.
  bunkhouse: () => ({
    rise: 4.6,
    parts: [box(0.8, 1.0, 12.2, 4.2, 0, 4, "timber", { win: "bunk", roof: "gable", ax: "x", peak: 0.9, door: "s", snow: true })],
    ground: [gr("snow", 0.5, 4.4, 12.5, 6.5)],
    yard: [pt("skis", 3.2, 4.9, 0.2), pt("skis", 9.8, 4.9, 0.2), pt("pine", 1.2, 5.8, 0.3), pt("pine", 11.8, 5.8, 0.3), pt("lamp", 6.5, 5.9, 0.08)],
  }),
  // Timber over stucco, four storeys under a steep roof, balconies of drying gloves.
  alpine: () => ({
    rise: 5.6,
    parts: [box(0.8, 0.9, 13.2, 4.2, 0, 4, "stucco", { win: "alpine", balconies: true, roof: "gable", ax: "x", peak: 1.4, door: "s", snow: true, timberTop: true })],
    ground: [gr("snow", 0.5, 4.4, 13.5, 6.5)],
    yard: [pt("pine", 1.2, 5.7, 0.3), pt("skis", 6.8, 4.9, 0.2), pt("bench", 9.6, 5.6, 0.15, { along: "x" }), pt("pine", 12.8, 5.7, 0.3)],
  }),
  // The base lodge: logs, a great steep roof, the fire going, the chimney smoking.
  lodge: () => ({
    rise: 4.2,
    parts: [box(0.8, 0.9, 13.2, 4.6, 0, 2, "logs", { win: "lodge", roof: "gable", ax: "x", peak: 1.8, door: "s", snow: true, sign: "BASE LODGE" }),
      cyl(11.6, 2.2, 0.35, 2, 4.4, "stone", { smoke: true })],
    ground: [gr("snow", 0.5, 4.8, 13.5, 6.5)],
    yard: [pt("skis", 2.2, 5.3, 0.2), pt("skis", 3.0, 5.3, 0.2), pt("bench", 7, 5.8, 0.15, { along: "x" }), pt("lamp", 10.2, 5.9, 0.08), pt("pine", 12.8, 5.9, 0.3)],
  }),
  // Four chalets for the top of the ladder: A-frames, glass gable ends, a hot tub each.
  chalet: () => ({
    rise: 3.6,
    parts: [0, 1, 2, 3].map(i => box(0.9 + i * 6.8, 1.0, 5.9 + i * 6.8, 4.2, 0, 1.6, "timber", { win: "chalet", roof: "gable", ax: "y", peak: 2.0, door: "s", snow: true, house: i })),
    ground: [gr("snow", 0.5, 4.4, 27.5, 6.5)],
    yard: [0, 1, 2, 3].flatMap(i => [pt("hottub", 3.4 + i * 6.8, 5.3, 0.45), pt("pine", 6.35 + i * 6.8, 5.8, 0.3)]),
  }),
};

Object.assign(MASS, funnelMass({ box, cyl, pt, bx, run, gr }));
Object.assign(MASS, venueMass({ box, cyl, pt, bx, run, gr }));

// -> {style, parts, yard, ground, rise, box} in map cells, or null for open ground.
const CACHE = new Map();
export function massingOf(b) {
  if (CACHE.has(b.id)) return CACHE.get(b.id);
  const style = b.arch || ARCH[b.id];
  const fn = MASS[style];
  let m = null;
  if (fn) {
    const L = b.rect, n = Math.max(1, b.floors.filter(f => f.level >= 0).length);
    const raw = fn(L.w, L.h, n, b.id);
    const sh = (o) => {
      const q = { ...o, x0: o.x0 + L.x, y0: o.y0 + L.y, x1: o.x1 + L.x, y1: o.y1 + L.y };
      if ("cx" in o) { q.cx = o.cx + L.x; q.cy = o.cy + L.y; }
      if ("x" in o) { q.x = o.x + L.x; q.y = o.y + L.y; }
      if ("ax" in o && typeof o.ax === "number") { q.ax = o.ax + L.x; q.ay = o.ay + L.y; q.bx = o.bx + L.x; q.by = o.by + L.y; }
      if (o.pool) q.pool = [o.pool[0] + L.x, o.pool[1] + L.y, o.pool[2] + L.x, o.pool[3] + L.y];
      if (o.canopy) q.canopy = [o.canopy[0] + L.x, o.canopy[1] + L.x];
      return q;
    };
    const parts = raw.parts.map(sh), yard = raw.yard.map((p, i) => ({ ...sh(p), i, bid: b.id })), ground = raw.ground.map(sh);
    // the body's box: every part, and what hangs off the front (stoops, canopies, awnings)
    const box = { x0: Math.min(...parts.map(p => p.x0)), y0: Math.min(...parts.map(p => p.y0)), x1: Math.max(...parts.map(p => p.x1)), y1: Math.max(...parts.map(p => p.y1)) };
    const out = OUT_FRONT[style] || 0;
    box.y1 += out;
    m = { style, parts, yard, ground, rise: raw.rise, box };
  }
  CACHE.set(b.id, m);
  return m;
}
// How far the front (+y) dressing stands out from the body: stoops, canopies, awnings, a portico's steps.
export const OUT_FRONT = { bungalow: 0.4, lodge: 0.1, brownstone: 0.55, glass: 0.45, casino: 0.45, cafe: 0.45, market: 0.35, theatre: 0.4, neon: 0.3, diner: 0.3, classical: 0.25, projects: 0.3, gallery: 0.1, hospital: 0.25, school: 0.2, gothic: 0.2, clocktower: 0.2, shed: 0.35, lofts: 0.3, office: 0.2, chapel: 0.2, ...FUNNEL_OUT_FRONT, ...VENUE_OUT_FRONT };

export const MASSED = Object.keys(MASS);
export const massingAll = () => BUILDINGS.map(b => [b, massingOf(b)]);

// Back-to-front order of a body's parts at a quarter turn (rot: map -> turned cells).
// Parts that share ground stack (the lower first); otherwise the one behind goes first.
export function partOrder(parts, rot, r) {
  const bx = parts.map(p => {
    const [a, c] = rot(p.x0, p.y0, r), [d, e] = rot(p.x1, p.y1, r);
    return { x0: Math.min(a, d), y0: Math.min(c, e), x1: Math.max(a, d), y1: Math.max(c, e), h0: p.h0 };
  });
  const n = parts.length, eps = 1e-6;
  const over = (a, b) => a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.y0 < b.y1 - eps && b.y0 < a.y1 - eps;
  const before = (a, b) => (over(a, b) ? a.h0 < b.h0 : (a.x1 <= b.x0 + eps || a.y1 <= b.y0 + eps) && !(b.x1 <= a.x0 + eps || b.y1 <= a.y0 + eps));
  const indeg = new Array(n).fill(0), outs = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && before(bx[i], bx[j])) { outs[i].push(j); indeg[j]++; }
  const key = (i) => bx[i].x0 + bx[i].x1 + bx[i].y0 + bx[i].y1;
  const ready = [], order = [];
  for (let i = 0; i < n; i++) if (!indeg[i]) ready.push(i);
  while (ready.length) { ready.sort((a, b) => key(b) - key(a)); const i = ready.pop(); order.push(i); for (const j of outs[i]) if (--indeg[j] === 0) ready.push(j); }
  if (order.length < n) for (let i = 0; i < n; i++) if (!order.includes(i)) order.push(i);
  return order;
}

// The iso view's boxes at a quarter turn, as CityIso.buildGeo slots them: each building's
// body (its massing box, or the lot less its inset for a field or open ground) and each
// yard prop on its own. {kind: "b" | "y", b, R: turned rect, h, m?, p?} with x0..y1 = R.
export function isoItems(r) {
  const items = [];
  for (const b of BUILDINGS) {
    const m = massingOf(b);
    // the Coast's and the Heights' ground (coastGeo.js) is ground too: whoever is on it is drawn
    // after it; the mountain's box stands as tall as the terrain, for the tap
    const coast = COAST_LOTS[b.id], open = OPEN_LOTS.has(b.id) || Boolean(coast);
    let foot;
    if (m) foot = { x: m.box.x0, y: m.box.y0, w: m.box.x1 - m.box.x0, h: m.box.y1 - m.box.y0 };
    else { const [ix, iy] = insetOf(b); foot = { x: b.rect.x + ix, y: b.rect.y + iy, w: b.rect.w - 2 * ix, h: b.rect.h - 2 * iy }; }
    const R = rotRect(foot, r);
    const h = coast === "slopes" || coast === "summit-lot" ? TERRAIN_MAX : coast ? 0.4 : open ? 0.05 : PARK_LOTS[b.id] ? 1 : m ? m.rise : 1;
    items.push({ kind: "b", b, id: b.id, m, R, h, x0: R.x0, y0: R.y0, x1: R.x1, y1: R.y1, ...(open ? { deck: true, top: 0 } : {}) });
    if (m) for (const p of m.yard) {
      const Y = rotRect({ x: p.x0, y: p.y0, w: p.x1 - p.x0, h: p.y1 - p.y0 }, r);
      items.push({ kind: "y", b, id: `${b.id}:${p.k}${p.i}`, p, m, R: Y, x0: Y.x0, y0: Y.y0, x1: Y.x1, y1: Y.y1 });
    }
  }
  return items;
}
