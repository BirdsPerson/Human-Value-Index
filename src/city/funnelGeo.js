// The funnel buildings as massing (archGeo.js's rules: parts, yard props, ground, in lot
// cells from the lot's north-west corner, clear of the 0.4-cell pavement). archGeo passes its
// own part makers in, so this file adds styles without a second copy of the geometry kit.
//   arcade      THE ARCADE, on the Strip: a two-storey box of neon, the cabinet floor behind a
//               shopfront, a rooftop sign with a joystick, the A-frame board on the pavement
//   recordshop  EB SHOP, on Campus: brick, display windows either side of the door, the Union
//               lounge upstairs, the dollar crates out front
//   station     ELECTRIC BASEMENT TV, in the Arts quarter: the sound stage, a dish on its roof,
//               the broadcast mast beside it with its beacons
export const FUNNEL_STYLES = {
  arcade: { family: "strip", name: "ARCADE" },
  recordshop: { family: "civic", name: "RECORD SHOP" },
  station: { family: "arts", name: "TV STATION" },
};
export const FUNNEL_OUT_FRONT = { arcade: 0.15, recordshop: 0.2, station: 0.1 };

export function funnelMass({ box, pt, gr }) {
  return {
    arcade: () => ({
      rise: 3.4,
      parts: [box(0.8, 0.9, 10.7, 4.1, 0, 2.6, "arcadewall", { win: "arcade", door: "s", cornice: true, arcadeSign: true })],
      ground: [gr("carpet", 4.2, 4.1, 7.3, 4.55)],
      yard: [pt("aframe", 2.3, 4.45, 0.08, { text: "JETSAM!" }), pt("hydrant", 10.4, 4.5, 0.06)],
    }),
    recordshop: () => ({
      rise: 2.6,
      parts: [box(0.8, 0.9, 10.7, 3.9, 0, 2.2, "redbrick", { win: "recordshop", door: "s", cornice: true })],
      ground: [],
      yard: [pt("recordbin", 2.0, 4.4, 0.12), pt("recordbin", 9.4, 4.4, 0.12), pt("aframe", 3.2, 4.45, 0.08, { text: "EB SHOP" })],
    }),
    station: () => ({
      rise: 2.4,
      parts: [box(0.8, 0.8, 8.2, 4.2, 0, 2, "corrugated", { win: "station", roof: "saw", ax: "x", teeth: 5, door: "s", onAir: true, dish: true })],
      ground: [gr("apron", 8.6, 1.4, 10.9, 4.2)],
      yard: [pt("mast", 9.75, 2.6, 0.45)],
    }),
  };
}
