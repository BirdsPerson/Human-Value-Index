// THE SUBURBS and THE AIRPORT as the iso view builds them (PHASE 2 step 4): massing per style,
// merged into archGeo.js like the Port's and the Old Town's. Pure: no DOM, checked by
// scripts/check-cityview.mjs (every body in its lot, every yard prop clear of the body and of each
// other). Laid out relative to the lot, so a style fits the lots it is given.
//
//   house       an estate of detached houses round a curving cul-de-sac: pitched roofs, siding in
//               the estate's colours, garages, a tree in most front yards (trees are parts: they
//               stand between the houses, painted in order with them)
//   townhouse   starter homes: two terraces of narrow two-storey townhouses facing a shared court
//   highschool  RIDGEMONT HIGH: the brick block, the gym, the running track and the field
//   mall        EASTGATE MALL: the anchors, the glass atrium, the car park and its lamps
//   clinic      the clinic: a white box, the green cross, an ambulance bay
//   terminal    THE DEPARTURES HALL: a long glass hall under a wave roof, its jet bridges to the apron
//   tower       THE CONTROL TOWER: the shaft, the glass cab, the antenna
//   hangar      THE HANGARS: three barrel-roofed sheds, their doors to the airfield
//   hotel       THE AIRPORT HOTEL: a slab on a podium, its name on the roof

export const EAST_STYLES = {
  house: { family: "housing", name: "DETACHED HOUSES" }, townhouse: { family: "housing", name: "STARTER TOWNHOUSES" },
  highschool: { family: "civic", name: "HIGH SCHOOL" }, mall: { family: "civic", name: "SHOPPING MALL" }, clinic: { family: "civic", name: "CLINIC" },
  terminal: { family: "transport", name: "AIR TERMINAL" }, tower: { family: "transport", name: "CONTROL TOWER" },
  hangar: { family: "transport", name: "HANGAR" }, hotel: { family: "leisure", name: "AIRPORT HOTEL" },
};
export const EAST_OUT_FRONT = { house: 0, townhouse: 0.3, highschool: 0.2, mall: 0.3, clinic: 0.3, terminal: 0.2, hotel: 0.35 };
export const EAST_PROPS = ["car", "lamp", "bench", "flag", "tree", "ambulance", "windsock", "tug", "bollard", "planter"];
export const EAST_GROUND = ["cul", "track", "parking", "lawn"];

// a small hash for each estate's own colours and roofline
const hs = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const SIDING = ["siding", "sidingblue", "sidingyellow", "sidingsage", "sidingrose", "brickhouse"];

export function eastMass({ box, cyl, pt, bx, gr }) {
  // a tree as a part (a trunk and a round crown), so it stands between houses in the painter's order
  const tree = (x, y, r = 0.55, h = 1.3) => cyl(x, y, r, 0.35, h, "foliage", { cap: "dome", trunk: true });
  return {
    // Six houses round a cul-de-sac that curves in from the street at the front (south): three at
    // the back, two either side of the mouth at the front, one on the bend; garages beside two.
    house: (W, H, n, id) => {
      const k = hs(id || "house"), mats = [0, 1, 2, 3, 4, 5].map(i => SIDING[(k + i * 3) % SIDING.length]);
      const bw = 2.3, bd = 2.0, y0 = 0.7, yF = H - 0.7 - bd;
      const parts = [], xs = [0.7, W / 2 - bw / 2, W - 0.7 - bw];
      xs.forEach((x, i) => parts.push(box(x, y0, x + bw, y0 + bd, 0, (k >> i) & 1 ? 2 : 1.4, mats[i], { win: "house", roof: "gable", ax: i === 1 ? "x" : "y", peak: 0.9, door: "s", house: i })));
      parts.push(box(0.7, yF, 0.7 + bw, yF + bd, 0, (k >> 3) & 1 ? 2 : 1.4, mats[3], { win: "house", roof: "gable", ax: "x", peak: 0.9, door: "n", house: 3 }));
      parts.push(box(W - 0.7 - bw, yF, W - 0.7, yF + bd, 0, (k >> 4) & 1 ? 2 : 1.4, mats[4], { win: "house", roof: "gable", ax: "x", peak: 0.9, door: "n", house: 4 }));
      // the garages, flat-roofed, beside the back corners (where the lot is wide enough for them)
      if (W >= 11.2) parts.push(box(0.7 + bw + 0.15, y0 + 0.6, 0.7 + bw + 1.25, y0 + bd, 0, 0.9, "garage", { win: "garage", door: "s" }));
      if (W >= 11.2) parts.push(box(W - 0.7 - bw - 1.25, y0 + 0.6, W - 0.7 - bw - 0.15, y0 + bd, 0, 0.9, "garage", { win: "garage", door: "s" }));
      // trees in the front yards and on the bend
      parts.push(tree(0.7 + bw + 0.9, yF + 1.0, 0.5, 1.4), tree(W - 0.7 - bw - 0.9, yF + 1.0, 0.5, 1.5), tree(W / 2 - bw / 2 - 0.75, y0 + bd + 0.9, 0.45, 1.2), tree(W / 2 + bw / 2 + 0.75, y0 + bd + 0.9, 0.45, 1.3));
      return {
        rise: 2.6, parts,
        ground: [gr("lawn", 0.45, 0.45, W - 0.45, H - 0.45), gr("cul", W / 2 - 0.6, y0 + bd + 0.2, W / 2 + 0.6, H - 0.4, { turn: 1.25 })],
        yard: [],
        entry: pt("entry", W / 2, H - 0.2, 0),   // the cul-de-sac's mouth on the street (control.js doorOf)
      };
    },
    // Two terraces of townhouses facing a shared court (the cars park in it); a tree at each end.
    townhouse: (W, H, n, id) => {
      const k = hs(id || "townhouse"), m = Math.max(4, Math.round((W - 1.4) / 1.7)), w = (W - 1.4) / m, d = 2.1;
      const parts = [];
      for (let i = 0; i < m; i++) {
        parts.push(box(0.7 + i * w, 0.7, 0.7 + (i + 1) * w, 0.7 + d, 0, 2, SIDING[(k + i) % 3 === 0 ? 5 : (k + i) % SIDING.length], { win: "townhouse", roof: "gable", ax: "x", peak: 0.7, door: "s", house: i }));
        parts.push(box(0.7 + i * w, H - 0.7 - d, 0.7 + (i + 1) * w, H - 0.7, 0, 2, SIDING[(k + i + 2) % 3 === 0 ? 5 : (k + i + 2) % SIDING.length], { win: "townhouse", roof: "gable", ax: "x", peak: 0.7, door: "n", house: m + i }));
      }
      return {
        rise: 2.7, parts,
        ground: [gr("lawn", 0.45, 0.45, W - 0.45, H - 0.45), gr("parking", 1.0, 0.7 + d + 0.5, W - 1.0, H - 0.7 - d - 0.5, { bays: m })],
        yard: [],
        entry: pt("entry", 0.2, H / 2, 0, { nx: -1, ny: 0 }),   // the court's way in, at its west end
      };
    },
    // The school block across the north of the lot, the gym under its barrel roof, the track and the field.
    highschool: (W, H) => ({
      rise: 3,
      parts: [
        box(0.8, 0.8, W - 0.8, 4.4, 0, 2.4, "redbrick", { win: "school", door: "e", sign: "RIDGEMONT HIGH", cornice: true }),
        box(0.8, 4.4, 5.6, 7.6, 0, 2.6, "hall", { win: "gym", roof: "barrel", ax: "y", peak: 0.8, sign: "HOME OF THE COMPLIANT" }),
      ],
      ground: [gr("paving", 5.9, 4.6, W - 0.6, 7.6), gr("track", 0.7, 9.0, W - 0.7, H - 0.6)],
      // the bleachers along the field's north side, the flag at the corner
      yard: [pt("bench", 2.6, 8.45, 0.15, { along: "x" }), pt("bench", 4.6, 8.45, 0.15, { along: "x" }), pt("bench", 6.6, 8.45, 0.15, { along: "x" }), pt("bench", 8.6, 8.45, 0.15, { along: "x" }), pt("flag", W - 1.0, 8.45, 0.06), pt("lamp", 1.0, 8.45, 0.08)],
    }),
    // The mall: two anchors and the concourse between, the atrium's glass over the entrance, the car park.
    mall: (W, H) => ({
      rise: 3.4,
      parts: [
        box(1, 1, 7, 9.5, 0, 2.8, "mallanchor", { win: "anchor", door: "s", sign: "HOLLOWAY'S" }),
        box(7, 1.6, W - 7, 9.0, 0, 2.1, "mallwall", { win: "concourse", door: "w", skylights: true }),
        box(W - 7, 1, W - 1, 9.5, 0, 2.8, "mallanchor", { win: "anchor", door: "s", sign: "THRIFTCO" }),
        box(W / 2 - 2.6, 9.0, W / 2 + 2.6, 10.6, 0, 3.0, "glass", { win: "atrium", roof: "pyramid", peak: 1.3, door: "s", sign: "EASTGATE" }),
      ],
      ground: [gr("paving", 0.6, 10.7, W - 0.6, 11.9), gr("parking", 1, 12.3, W - 1, H - 0.7, { bays: 12, rows: 2 })],
      yard: [
        ...[3, 8, 13, 18, 23].filter(x => x < W - 1).map(x => pt("lamp", x, 16.5, 0.08)),
        ...[[2.4, 13.4], [5.1, 13.4], [9.3, 13.4], [16.1, 13.4], [21.2, 13.4], [3.6, 19.3], [11.6, 19.3], [14.4, 19.3], [19.0, 19.3], [23.8, 19.3]].filter(([x, y]) => x < W - 1 && y < H - 0.8).map(([x, y], i) => pt("car", x, y, 0.42, { along: "y", c: i })),
        pt("planter", W / 2 - 3.6, 11.3, 0.3), pt("planter", W / 2 + 3.6, 11.3, 0.3),
      ],
    }),
    clinic: (W, H) => ({
      rise: 1.8,
      parts: [box(1, 0.8, W - 1, H - 2.0, 0, 1.6, "white", { win: "clinic", door: "s", cross: true })],
      ground: [gr("paving", 0.6, H - 1.6, W - 0.6, H - 0.45)],
      yard: [pt("ambulance", W - 2.6, H - 1.0, 0.5), pt("bench", 2.2, H - 1.0, 0.15, { along: "x" })],
    }),
    // THE DEPARTURES HALL: glass under a wave roof, the name over the doors to the station, jet bridges
    // reaching out over the apron's edge to the stands.
    terminal: (W, H) => ({
      rise: 3.2,
      parts: [
        box(0.8, 1.6, W - 0.8, H - 1.6, 0, 2.4, "glassteel", { win: "terminal", roof: "barrel", ax: "x", peak: 0.8, door: "s", sign: "DEPARTURES // ARRIVALS" }),
        ...[4.5, 11.5, 18.5, 25.5].filter(x => x < W - 1.2).map(x => box(x - 0.45, 0.45, x + 0.45, 1.6, 1.0, 1.7, "white", { win: "none", seg: "bridge" })),
      ],
      ground: [gr("paving", 0.5, H - 1.5, W - 0.5, H - 0.45)],
      yard: [pt("flag", 1.4, H - 1.0, 0.06), pt("flag", W - 1.4, H - 1.0, 0.06), pt("bollard", 6, H - 0.8, 0.08), pt("bollard", W - 6, H - 0.8, 0.08)],
    }),
    tower: (W, H) => ({
      rise: 8.4,
      parts: [
        box(0.8, H - 3.2, W - 0.8, H - 0.8, 0, 1.2, "concrete", { win: "office", door: "s" }),
        cyl(W / 2, 3.4, 0.75, 0, 6.6, "concrete", {}),
        box(W / 2 - 1.5, 1.9, W / 2 + 1.5, 4.9, 6.6, 7.8, "glassteel", { win: "cab", antenna: 1.1 }),
      ],
      ground: [],
      yard: [pt("windsock", W - 1.0, 1.2, 0.1)],
    }),
    hangar: (W, H) => {
      const n = Math.max(1, Math.round(W / 11)), w = (W - 1) / n;
      return {
        rise: 3.4,
        parts: Array.from({ length: n }, (_, i) => box(0.6 + i * w + 0.2, 0.8, 0.6 + (i + 1) * w - 0.2, H - 2.2, 0, 2.2, "hangar", { win: "hangar", roof: "barrel", ax: "y", peak: 1.2, door: "n", sign: `HANGAR ${i + 1}` })),
        ground: [gr("apron", 0.5, H - 2.0, W - 0.5, H - 0.45)],
        yard: [pt("tug", 3.2, H - 1.2, 0.35), pt("tug", W - 4.2, H - 1.2, 0.35)],
      };
    },
    hotel: (W, H) => ({
      rise: 6.8,
      parts: [
        box(0.9, 0.9, W - 0.9, 7.6, 0, 6, "hotelwall", { win: "hotel", sign: "AIRPORT HOTEL" }),
        box(0.9, 7.6, W - 0.9, H - 3.4, 0, 1.4, "hotelwall", { win: "lobby", door: "s", canopy: [2.4, W - 2.4] }),
      ],
      ground: [gr("paving", 0.6, H - 3.1, W - 0.6, H - 0.45)],
      yard: [pt("car", 2.4, H - 1.7, 0.42, { along: "x", c: 3 }), pt("car", W - 2.4, H - 1.7, 0.42, { along: "x", c: 7 }), pt("planter", W / 2, H - 1.0, 0.3)],
    }),
  };
}
