// THE MALL's buildings as massing (archGeo.js's rules: parts, yard props, ground, in lot cells
// from the lot's north-west corner, clear of the 0.4-cell pavement). archGeo passes its part
// makers in, like funnelGeo.js. docs/CITY_SPEC.md "THE MALL".
//   storefront  a storefront unit: one storey of shop under a flat roof with a parapet sign board,
//               glass both sides (the street side is the front: the door, the awning, the window
//               display), the business's name on the sign. What trades there is read at draw time
//               (storefrontDraw.js), so the massing is the unit's alone. On the Coast the lot runs
//               down over the boards in front.
//   pizzeria    SAM'S PIZZA: a boardwalk pizza counter open to the boards, the big sign on the roof,
//               stools on the boards in front
//   brewpub     GOODNIGHT IRENE'S: a two-storey corner pub, the brewhouse's tanks upstairs behind
//               glass, the patio out front on the boards under string lights
import { UNIT_FACE } from "./storefrontSim.js";

export const STORE_STYLES = {
  storefront: { family: "retail", name: "STOREFRONT" },
  pizzeria: { family: "retail", name: "BOARDWALK PIZZA COUNTER" },
  brewpub: { family: "retail", name: "BREWPUB" },
};
export const STORE_OUT_FRONT = { storefront: 0, pizzeria: 0, brewpub: 0 };
export const STORE_PROPS = ["skirack", "boardstool", "patiotable", "stringlights", "aboard"];

export function storeMass({ box, pt, gr }) {
  return {
    storefront: (W, H, n, id) => {
      const face = UNIT_FACE[id] || "s";
      if (H >= 4.5) {
        // the Coast's row: the shop at the back of the lot, the boards in front of it
        return {
          rise: 1.9,
          parts: [box(0.4, 0.4, W - 0.4, 2.7, 0, 1.5, "shopfront", { win: "shopfront", door: "s", unit: id, sign: true })],
          ground: [gr("boards", 0, 2.95, W, H)],
          yard: [pt("aboard", W / 2 + 1.1, 3.4, 0.12)],
        };
      }
      if (H >= 3) {
        // the Heights' parade: a deeper shop, the ski rack by the door
        return {
          rise: 2.0,
          parts: [box(0.4, 0.4, W - 0.4, H - 1.0, 0, 1.6, "shopfront", { win: "shopfront", door: "s", unit: id, sign: true, snow: true })],
          ground: [gr("snow", 0.2, H - 0.95, W - 0.2, H - 0.05)],
          yard: [pt("skirack", W - 0.75, H - 0.65, 0.12)],
        };
      }
      // the north-edge rows: a shallow shop on the street, double-fronted
      return {
        rise: 1.7,
        parts: [box(0.4, 0.4, W - 0.4, H - 0.4, 0, 1.35, "shopfront", { win: "shopfront", door: face, unit: id, sign: true })],
        ground: [],
        yard: [],
      };
    },
    pizzeria: (W, H) => ({
      rise: 2.6,
      parts: [box(0.4, 0.4, W - 0.4, 2.75, 0, 1.6, "pizzawall", { win: "pizzeria", door: "s", sign: true, shimmer: true })],
      ground: [gr("boards", 0, 2.95, W, H)],
      yard: [0, 1, 2, 3].map(i => pt("boardstool", 1.05 + i * 1.15, 3.3, 0.12)),
    }),
    brewpub: (W, H) => ({
      rise: 3.2,
      parts: [box(0.4, 0.4, W - 0.4, 2.75, 0, 2.5, "brewbrick", { win: "brewpub", door: "s", sign: true, cornice: true })],
      ground: [gr("boards", 0, 2.95, W, H), gr("patio", 0.5, 3.0, W - 0.5, 4.6)],
      yard: [pt("patiotable", 1.6, 3.85, 0.3), pt("patiotable", 3.6, 3.85, 0.3), pt("patiotable", 5.6, 3.85, 0.3), pt("patiotable", 7.6, 3.85, 0.3),
        pt("stringlights", W / 2, 3.15, 0.1, { w: W - 1.4 })],
    }),
  };
}
