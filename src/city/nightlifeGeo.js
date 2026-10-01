// THE NIGHTLIFE QUARTERS as massing (archGeo.js's rules: parts, yard props and ground in lot cells
// from the lot's north-west corner, clear of the 0.4-cell pavement). archGeo passes its part makers
// in, like storefrontGeo.js. Drawn by nightlifeDraw.js. docs/CITY_SPEC.md "THE NIGHTLIFE QUARTERS".
//
// UPTOWN, marble and glass:
//   nightclub   AURUM: a white-marble box, a glass mezzanine band (the VIP floor) under a gold cornice,
//               the name in gold; the forecourt in front: the red carpet, the velvet rope on its brass
//               stanchions, the door supervisor, and the queue along the rope after 22:00
//   rooftower   THE CEILING: a slim glass tower, the lounge on its roof (umbrellas, a rail, lit at night)
//   cocktail    THE BITTERS: black marble and brass, a deco fin with the name down it
//   steakhouse  THE CUT: limestone, an oxblood awning, carriage lamps by the door
//   omakase     HINOKI: pale cypress slats, the noren over the door, a gravel bed and a pine
//   supperclub  THE MINOR KEY: deco marble, a marquee canopy edged in bulbs, a vertical JAZZ blade
// DOWNTOWN, brick, murals and roll-down gates:
//   danceclub   VOLTAGE, STROBE: a long brick box, a mural down its flank, neon edging, crowd barriers
//   hiphop      THE CYPHER: sooty brick, graffiti, a roll-down gate on the shop next door
//   punk        BASEMENT 0x00: a low brick front, the stairs down at the side, flyers on every wall
//   karaoke     KARAOKE BOX: a pink box, a neon microphone
//   poolhall    EIGHT BALL: brick upstairs over a green-neon window, the eight ball on a sign
//   comedy      THE HECKLE: brick, a bulb marquee, a neon microphone
//   chicken     THE COOP: red and yellow, 24H, and the halal cart at the kerb under its umbrella
//   liquor      LIQUOR 24, CUT-RATE: a squat box, barred windows, a roll-down gate down after hours

export const NIGHT_STYLES = {
  nightclub: { family: "nightlife", name: "NIGHTCLUB (MARBLE AND GLASS)" },
  rooftower: { family: "nightlife", name: "ROOFTOP LOUNGE TOWER" },
  cocktail: { family: "nightlife", name: "COCKTAIL BAR" },
  steakhouse: { family: "nightlife", name: "STEAKHOUSE" },
  omakase: { family: "nightlife", name: "OMAKASE COUNTER" },
  supperclub: { family: "nightlife", name: "JAZZ SUPPER CLUB" },
  danceclub: { family: "nightlife", name: "DANCE CLUB (BRICK, MURAL)" },
  hiphop: { family: "nightlife", name: "HIP-HOP CLUB" },
  punk: { family: "nightlife", name: "PUNK BASEMENT" },
  karaoke: { family: "nightlife", name: "KARAOKE BAR" },
  poolhall: { family: "nightlife", name: "POOL HALL" },
  comedy: { family: "nightlife", name: "COMEDY CLUB" },
  chicken: { family: "nightlife", name: "LATE-NIGHT FOOD" },
  liquor: { family: "nightlife", name: "LIQUOR STORE" },
};
export const NIGHT_OUT_FRONT = { nightclub: 0.2, rooftower: 0.15, cocktail: 0.2, steakhouse: 0.45, omakase: 0.2, supperclub: 0.5, danceclub: 0.2, hiphop: 0.2, punk: 0.1, karaoke: 0.2, poolhall: 0.2, comedy: 0.45, chicken: 0.4, liquor: 0.2 };
export const NIGHT_PROPS = ["rope", "bouncer", "queue", "pine", "barrier", "halalcart", "lamppost", "flyerpole"];
export const NIGHT_GROUND = ["redcarpet", "marbleplaza", "gravel", "stairwell", "tarmac"];

import { NIGHT_BUILDINGS } from "./nightlifeSim.js";
// building -> the place on its ground floor (what its hours and its bill are read from)
export const NIGHT_PID = Object.fromEntries(NIGHT_BUILDINGS.map(([id, , , floors]) => [id, floors[floors.length - 1][2][0]]));

export function nightMass(kit) {
  const raw = nightMassRaw(kit), out = {};
  for (const [k, fn] of Object.entries(raw)) out[k] = (W, H, n, id) => { const m = fn(W, H, n, id); for (const p of [...m.parts, ...m.yard]) p.pid = NIGHT_PID[id]; return m; };
  return out;
}
function nightMassRaw({ box, pt, run, gr }) {
  // a front box set back from the street side (y): `back` cells of yard left in front of it, the door
  // on the south (+y) face
  const front = (W, H, back, h, mat, o = {}) => box(0.4, 0.4, W - 0.4, H - back, 0, h, mat, { door: "s", ...o });
  return {
    nightclub: (W, H) => {
      const y = H - 2.6;   // the body's front; the forecourt (the carpet, the rope, the queue) before it
      return {
        rise: 3.3,
        parts: [front(W, H, 2.6, 2.7, "marble", { win: "club", sign: "AURUM" }),
          box(W * 0.28, 1.0, W * 0.72, y - 0.6, 2.7, 3.3, "glass", { win: "vip" })],
        ground: [gr("marbleplaza", 0.4, y + 0.2, W - 0.4, H - 0.4), gr("redcarpet", W / 2 - 0.55, y + 0.2, W / 2 + 0.55, H - 0.4)],
        yard: [run("rope", W / 2 + 0.85, y + 0.75, W - 0.9, y + 0.75), pt("bouncer", W / 2 + 0.75, y + 1.25, 0.12),
          run("queue", W / 2 + 1.3, y + 1.3, W - 0.8, y + 1.3)],
      };
    },
    rooftower: (W, H) => ({
      rise: 9.2,
      parts: [box(0.6, 0.6, W - 0.6, H - 0.7, 0, 8, "glass", { win: "tower", door: "s", sign: "THE CEILING" }),
        box(0.8, 0.8, W - 0.8, H - 0.9, 8, 8.35, "darkglass", { win: "deck", roof: "flat" })],
      ground: [], yard: [],
    }),
    cocktail: (W, H) => ({
      rise: 2.4,
      parts: [front(W, H, 1.0, 2.1, "blackmarble", { win: "cocktail", sign: "THE BITTERS" })],
      ground: [gr("marbleplaza", 0.4, H - 0.8, W - 0.4, H - 0.4)], yard: [],
    }),
    steakhouse: (W, H) => ({
      rise: 2.3,
      parts: [front(W, H, 1.3, 2.2, "limestone", { win: "steak", sign: "THE CUT", cornice: true })],
      ground: [], yard: [pt("lamppost", 0.75, H - 0.55, 0.1), pt("lamppost", W - 0.75, H - 0.55, 0.1)],
    }),
    omakase: (W, H) => ({
      rise: 1.9,
      parts: [box(1.6, 0.4, W - 0.4, H - 0.9, 0, 1.55, "hinokiwood", { win: "omakase", door: "s", sign: "HINOKI", roof: "gable", ax: "x" })],
      ground: [gr("gravel", 0.4, 0.4, 1.4, H - 0.4)], yard: [pt("pine", 0.9, 1.4, 0.3)],
    }),
    supperclub: (W, H) => ({
      rise: 2.9,
      parts: [front(W, H, 1.6, 2.5, "decomarble", { win: "supper", sign: "THE MINOR KEY", cornice: true })],
      ground: [gr("redcarpet", W / 2 - 0.5, H - 1.05, W / 2 + 0.5, H - 0.4)], yard: [pt("lamppost", 1.0, H - 0.6, 0.1), pt("lamppost", W - 1.0, H - 0.6, 0.1)],
    }),
    danceclub: (W, H, n, id) => ({
      rise: 2.6,
      parts: [front(W, H, 1.2, 2.3, id === "strobe" ? "sootbrick" : "brickdown", { win: "dance", sign: id === "strobe" ? "STROBE" : "VOLTAGE", club: id })],
      ground: [gr("tarmac", 0.4, H - 1.0, W - 0.4, H - 0.4)],
      yard: [run("barrier", 1.0, H - 0.85, W / 2 - 0.8, H - 0.85), run("queue", 1.2, H - 0.5, W / 2 - 1.0, H - 0.5, { cheap: true })],
    }),
    hiphop: (W, H) => ({
      rise: 2.5,
      parts: [front(W, H, 0.9, 2.2, "sootbrick", { win: "hiphop", sign: "THE CYPHER" })],
      ground: [gr("tarmac", 0.4, H - 0.7, W - 0.4, H - 0.4)], yard: [],
    }),
    punk: (W, H) => ({
      rise: 1.6,
      parts: [box(0.4, 0.4, W - 1.7, H - 0.9, 0, 1.4, "sootbrick", { win: "punk", door: "s", sign: "BASEMENT 0x00" })],
      ground: [gr("stairwell", W - 1.5, 0.6, W - 0.5, H - 1.2), gr("tarmac", 0.4, H - 0.8, W - 0.4, H - 0.4)], yard: [pt("flyerpole", W - 1.0, H - 0.6, 0.1)],
    }),
    karaoke: (W, H) => ({
      rise: 2.2,
      parts: [front(W, H, 0.8, 2.0, "pinkpanel", { win: "karaoke", sign: "KARAOKE BOX" })],
      ground: [], yard: [],
    }),
    poolhall: (W, H) => ({
      rise: 2.5,
      parts: [front(W, H, 0.8, 2.3, "brickdown", { win: "pool", sign: "EIGHT BALL", cornice: true })],
      ground: [], yard: [],
    }),
    comedy: (W, H) => ({
      rise: 2.4,
      parts: [front(W, H, 1.0, 2.2, "brickdown", { win: "comedy", sign: "THE HECKLE" })],
      ground: [], yard: [],
    }),
    chicken: (W, H) => ({
      rise: 1.7,
      parts: [front(W, H, 1.3, 1.35, "redfront", { win: "chicken", sign: "THE COOP" })],
      ground: [gr("tarmac", 0.4, H - 0.9, W - 0.4, H - 0.4)], yard: [pt("halalcart", W - 1.4, H - 0.6, 0.2)],
    }),
    liquor: (W, H, n, id) => ({
      rise: 1.5,
      parts: [front(W, H, 0.8, 1.25, id === "cut-rate" ? "sootbrick" : "liquorblock", { win: "liquor", sign: id === "cut-rate" ? "CUT-RATE SPIRITS" : "LIQUOR 24", gate: true })],
      ground: [], yard: [],
    }),
  };
}
