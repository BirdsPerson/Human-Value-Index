// THE FARMLAND as the iso view builds it (PHASE 2 step 5): massing per style, merged into
// archGeo.js like the Suburbs'. Pure: no DOM, checked by scripts/check-cityview.mjs. Laid out
// relative to the lot.
//
//   cottage   a row of four whitewashed and stone cottages under steep roofs, a chimney each
//   manor     THE MANOR: the hall between two wings, tall chimneys, the lawn in front
//   dairy     THE DAIRY: the long red barn, the milking parlour, two silos, the cows in the pasture
//   elevator  THE GRAIN ELEVATOR: four concrete bins in a row, the headhouse over them, the leg

export const FARM_STYLES = {
  cottage: { family: "housing", name: "COTTAGES" }, manor: { family: "housing", name: "MANOR HOUSE" },
  dairy: { family: "industry", name: "DAIRY" }, elevator: { family: "industry", name: "GRAIN ELEVATOR" },
};
export const FARM_OUT_FRONT = { cottage: 0.2, manor: 0.3, dairy: 0, elevator: 0 };
export const FARM_PROPS = ["cow", "bale"];

export function farmMass({ box, cyl, pt, gr }) {
  return {
    cottage: (W, H) => {
      const n = Math.max(3, Math.round((W - 1) / 2.6)), w = (W - 1) / n, mats = ["whitewash", "stone", "whitewash", "stone"];
      const parts = [];
      for (let i = 0; i < n; i++) {
        parts.push(box(0.5 + i * w + 0.1, 1.0, 0.5 + (i + 1) * w - 0.1, 3.4, 0, 1.4, mats[i % mats.length], { win: "cottage", roof: "gable", ax: "x", peak: 1.0, door: "s", house: i }));
        parts.push(cyl(0.5 + (i + 1) * w - 0.5, 1.6, 0.18, 1.4, 2.7, "stone", { smoke: i % 2 === 0 }));
      }
      return {
        rise: 2.7, parts,
        ground: [gr("garden", 0.5, 3.4, W - 0.5, H - 0.45)],
        yard: Array.from({ length: n }, (_, i) => pt("tree", 0.5 + (i + 0.5) * w, H - 1.6, 0.35)),
      };
    },
    manor: (W, H) => ({
      rise: 3.6,
      parts: [
        box(0.8, 1.0, 3.2, 4.0, 0, 1.8, "stone", { win: "manor", roof: "gable", ax: "y", peak: 0.9 }),
        box(3.2, 0.8, W - 3.2, 3.6, 0, 2.4, "stone", { win: "manor", roof: "gable", ax: "x", peak: 1.1, door: "s", portico: false }),
        box(W - 3.2, 1.0, W - 0.8, 4.0, 0, 1.8, "stone", { win: "manor", roof: "gable", ax: "y", peak: 0.9 }),
        cyl(3.6, 1.2, 0.22, 2.4, 3.9, "stone", {}), cyl(W - 3.6, 1.2, 0.22, 2.4, 3.9, "stone", { smoke: true }),
      ],
      ground: [gr("lawn", 0.5, 4.1, W - 0.5, H - 0.45)],
      yard: [pt("tree", 1.2, H - 1.0, 0.4), pt("tree", W - 1.2, H - 1.0, 0.4), pt("fountain", W / 2, H - 1.3, 0.35)],
    }),
    dairy: (W, H) => ({
      rise: 4,
      parts: [
        box(1.0, 1.0, 13, 5.0, 0, 1.8, "barnred", { win: "barn", roof: "gable", ax: "x", peak: 1.2, door: "s", sign: "THE DAIRY" }),
        box(13, 1.6, 17.5, 4.4, 0, 1.2, "whitewash", { win: "parlour", door: "e" }),
        cyl(18.8, 2.2, 0.9, 0, 4.0, "tank", { cap: "dome" }), cyl(21, 2.2, 0.9, 0, 4.0, "tank", { cap: "dome" }),
      ],
      ground: [gr("pasture", 0.5, 6.2, W - 0.5, H - 0.45)],
      yard: [
        ...[[3, 9], [6.5, 11], [10, 8.5], [14, 12.5], [18, 9.5], [21.5, 14], [5, 16], [9.5, 18.5], [16.5, 17], [22, 19]].filter(([x, y]) => x < W - 1 && y < H - 1).map(([x, y], i) => pt("cow", x, y, 0.45, { c: i })),
        pt("bale", 24.5, 2.4, 0.4), pt("bale", 25.5, 3.6, 0.4),
      ],
    }),
    elevator: (W, H) => ({
      rise: 9.5,
      parts: [
        ...[0, 1, 2, 3].map(i => cyl(W / 2, 1.6 + i * 2.2, 1.0, 0, 7, "concrete", { cap: "flat" })),
        box(W / 2 - 1.3, 1.0, W / 2 + 1.3, 9.0, 7, 9.2, "concrete", { win: "headhouse", sign: "GRAIN" }),
        box(W / 2 + 1.1, H - 2.6, W / 2 + 2.6, H - 1.0, 0, 1.4, "rust", { win: "shed", door: "s" }),
      ],
      ground: [gr("paving", 0.4, H - 0.9, W - 0.4, H - 0.4)],
      yard: [],
    }),
  };
}
