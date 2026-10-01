// THE PORT and THE OLD TOWN as the iso view builds them (PHASE 2 step 3): massing per style,
// merged into archGeo.js like the funnels' and the venues'. Pure: no DOM, checked by
// scripts/check-cityview.mjs (every body in its lot, every yard prop clear of the body and of
// each other). Laid out relative to the lot's size, so a style fits the lots it is given.
//
//   tenement    the Port's worker housing: brick walk-ups, fire escapes up the front
//   terrace     a row of narrow houses, brownstone and brick by turns
//   walkup      the Old Town's walk-ups by the cathedral
//   shopflats   shops under flats: striped awnings at the street, flats above (Jacobs)
//   tavern      a pub: brick, a gable, its name over the door
//   customs     the customs house: limestone, a portico, the clock tower over the long room
//   museum      the museum of the city: limestone, a portico, a dome
//   cathedral   the cathedral: nave, transepts, the west front's two towers, the crossing spire
//   covered     the covered market: a long barrel-vaulted hall, the stalls out front
//   quay        the container quay: the apron, container stacks, ship-to-shore gantries, a ship
//   shipyard    the yard: the fabrication shed, the slipway with a hull on it, a tower crane

export const WEST_STYLES = {
  tenement: { family: "housing", name: "TENEMENTS" }, terrace: { family: "housing", name: "TERRACED HOUSES" },
  walkup: { family: "housing", name: "WALK-UPS" }, shopflats: { family: "housing", name: "SHOPS UNDER FLATS" },
  tavern: { family: "leisure", name: "PUBLIC HOUSE" }, customs: { family: "civic", name: "CUSTOMS HOUSE" },
  museum: { family: "civic", name: "MUSEUM" }, cathedral: { family: "civic", name: "CATHEDRAL" }, covered: { family: "civic", name: "COVERED MARKET" },
  quay: { family: "industry", name: "CONTAINER QUAY" }, shipyard: { family: "industry", name: "SHIPYARD" },
};
export const WEST_OUT_FRONT = { tenement: 0.3, terrace: 0.55, walkup: 0.3, shopflats: 0.4, tavern: 0.3, customs: 0.25, museum: 0.25, cathedral: 0.2, covered: 0.35 };
export const WEST_PROPS = ["gantry", "ship", "hull", "tcrane"];
export const WEST_GROUND = ["water", "slip"];

export function westMass({ box, cyl, pt, bx, gr }) {
  // a row of n houses across the lot's width, 0.5 in from each side
  const houses = (W, n, y0, y1, h, mats, win, o = {}) => {
    const w = (W - 1) / n;
    return Array.from({ length: n }, (_, i) => box(0.5 + i * w, y0, 0.5 + (i + 1) * w, y1, 0, typeof h === "function" ? h(i) : h, mats[i % mats.length], { win: typeof win === "function" ? win(i) : win, house: i, door: "s", cornice: true, ...o }));
  };
  return {
    tenement: (W) => ({
      rise: 5,
      parts: houses(W, 4, 0.8, 3.7, 5, ["redbrick", "darkbrick"], "walkup"),
      ground: [gr("pavement", 0.5, 3.7, W - 0.5, 4.55)],
      yard: [],
    }),
    terrace: (W, H) => {
      const n = Math.max(3, Math.round((W - 1) / 2.35));
      return {
        rise: 4,
        parts: houses(W, n, 0.7, Math.min(3.7, H - 1.3), (i) => (i % 2 ? 4 : 3), ["brownstone", "redbrick"], (i) => (i % 2 ? "walkup" : "brown")),
        ground: [gr("pavement", 0.5, Math.min(3.7, H - 1.3), W - 0.5, H - 0.45)],
        yard: [],
      };
    },
    walkup: (W) => ({
      rise: 5,
      parts: houses(W, 4, 0.8, 3.7, 5, ["redbrick", "brownstone"], "walkup"),
      ground: [gr("pavement", 0.5, 3.7, W - 0.5, 4.55)],
      yard: [],
    }),
    shopflats: (W, H, n) => ({
      rise: n + 0.5,
      parts: houses(W, 4, 0.8, 3.6, Math.max(2, n), ["redbrick", "brownstone", "stucco", "redbrick"], "shop", { awning: true }),
      ground: [gr("pavement", 0.5, 3.6, W - 0.5, H - 0.45)],
      yard: [pt("lamp", 0.9, H - 0.6, 0.08), pt("lamp", W - 0.9, H - 0.6, 0.08)],
    }),
    tavern: (W, H) => ({
      rise: 2.8,
      parts: [box(0.7, 0.8, W - 0.7, H - 1.6, 0, 2, "redbrick", { win: "tavern", roof: "gable", ax: "x", peak: 0.9, door: "s" }),
        cyl(W - 2, 1.4, 0.22, 2, 3.2, "stack", { smoke: true })],
      ground: [gr("pavement", 0.6, H - 1.3, W - 0.6, H - 0.45)],
      yard: [pt("bench", W * 0.3, H - 0.75, 0.15, { along: "x" }), pt("bench", W * 0.7, H - 0.75, 0.15, { along: "x" }), pt("lamp", W - 0.9, H - 0.7, 0.08)],
    }),
    customs: (W, H) => ({
      rise: 3.8,
      parts: [box(1, 0.8, W - 1, H - 2, 0, 2.2, "limestone", { win: "tall", cornice: true }),
        box(W / 2 - 2.4, H - 2, W / 2 + 2.4, H - 1.15, 0, 2.2, "limestone", { win: "none", portico: true, roof: "gable", ax: "y", peak: 0.55, door: "s" }),
        box(W / 2 - 1, 1.4, W / 2 + 1, 3.0, 2.2, 3.8, "limestone", { win: "clock", clock: 3.1, roof: "pyramid", peak: 1.2 })],
      ground: [gr("paving", 0.6, H - 1.1, W - 0.6, H - 0.45)],
      yard: [pt("flag", 1.4, H - 0.75, 0.06), pt("flag", W - 1.4, H - 0.75, 0.06)],
    }),
    museum: (W, H) => ({
      rise: 4,
      parts: [box(0.9, 1, W - 0.9, H - 3, 0, 2.4, "limestone", { win: "tall", cornice: true }),
        box(W / 2 - 2, H - 3, W / 2 + 2, H - 2.1, 0, 2.4, "limestone", { win: "none", portico: true, roof: "gable", ax: "y", peak: 0.6, door: "s" }),
        cyl(W / 2, (H - 2) / 2, 1.5, 2.4, 3.4, "limestone", { cap: "dome" })],
      ground: [gr("paving", 0.6, H - 2, W - 0.6, H - 0.45)],
      yard: [pt("statue", 1.6, H - 1.1, 0.2), pt("statue", W - 1.6, H - 1.1, 0.2), pt("bench", W / 2, H - 0.8, 0.15, { along: "x" })],
    }),
    cathedral: (W, H) => {
      const cx = W / 2;
      return {
        rise: 7,
        parts: [
          box(cx - 2.6, 1.0, cx + 2.6, H - 3.2, 0, 3.4, "sandstone", { win: "pointed", roof: "gable", ax: "y", peak: 1.8 }),                                    // the nave
          box(0.8, 4.0, cx - 2.6, 6.6, 0, 3.0, "sandstone", { win: "pointed", roof: "gable", ax: "x", peak: 1.2, rose: true }),                                  // the transepts
          box(cx + 2.6, 4.0, W - 0.8, 6.6, 0, 3.0, "sandstone", { win: "pointed", roof: "gable", ax: "x", peak: 1.2, rose: true }),
          box(cx - 1.2, 4.1, cx + 1.2, 6.5, 3.4, 5.4, "sandstone", { win: "pointed", roof: "pyramid", peak: 3.2 }),                                             // the crossing and its spire
          box(cx - 3.9, H - 3.2, cx - 1.6, H - 1.1, 0, 6.2, "sandstone", { win: "pointed", roof: "pyramid", peak: 2.4 }),                                       // the west front's towers
          box(cx + 1.6, H - 3.2, cx + 3.9, H - 1.1, 0, 6.2, "sandstone", { win: "pointed", roof: "pyramid", peak: 2.4 }),
          box(cx - 1.6, H - 3.2, cx + 1.6, H - 1.3, 0, 3.0, "sandstone", { win: "pointed", roof: "gable", ax: "y", peak: 1.4, rose: true, door: "s" }),        // the porch, the rose window over the door
        ],
        ground: [gr("paving", 0.6, H - 1.0, W - 0.6, H - 0.45), gr("lawn", 0.6, 7, cx - 4.2, H - 1.2), gr("lawn", cx + 4.2, 7, W - 0.6, H - 1.2)],
        yard: [],
      };
    },
    covered: (W, H) => ({
      rise: 3.4,
      parts: [box(0.7, 0.8, W - 0.7, H - 2.2, 0, 2.2, "market", { win: "covered", roof: "barrel", ax: "x", peak: 1.2, door: "s" })],
      ground: [gr("paving", 0.6, H - 1.75, W - 0.6, H - 0.45)],
      yard: [W * 0.2, W * 0.4, W * 0.6, W * 0.8].map(x => pt("stall", x, H - 1.05, 0.42)),
    }),
    quay: (W, H) => {
      const stacks = [];
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) stacks.push(pt("containers", 7.0 + c * 4.0, 2.2 + r * 3.6, 1.1));
      return {
        rise: 1.6,
        parts: [box(0.9, 0.9, 4.4, 2.8, 0, 1.6, "white", { win: "office", door: "s", sign: "QUAY OFFICE" })],
        ground: [gr("apron", 0.5, 0.5, W - 0.5, H - 3.9), gr("water", 0.4, H - 3.9, W - 0.4, H - 0.4)],
        yard: [...stacks, bx("gantry", 4.0, H - 6.4, 6.4, H - 4.2), bx("gantry", 15.0, H - 6.4, 17.4, H - 4.2), bx("ship", 1.2, H - 3.5, W - 1.2, H - 0.8),
          ...[1.4, 8.6, 12.4, 19.6, 22.0].filter(x => x < W - 0.6).map(x => pt("bollard", x, H - 4.15, 0.08))],
      };
    },
    shipyard: (W, H) => ({
      rise: 3.4,
      parts: [box(0.8, 0.8, 9.2, 5.6, 0, 3, "rust", { win: "shed", roof: "saw", ax: "x", teeth: 6, door: "e", sign: "THE SHIPYARD" })],
      ground: [gr("apron", 0.5, 6.0, 9.6, H - 3.9), gr("slip", 10.2, 0.6, W - 0.6, H - 0.4), gr("water", 0.4, H - 3.9, 10.2, H - 0.4)],
      yard: [bx("hull", 11.6, 1.6, W - 2.0, H - 1.6), pt("tcrane", 10.7, 3.0, 0.35), pt("containers", 2.4, 8.6, 1.1), pt("containers", 6.2, 8.6, 1.1)],
    }),
  };
}
