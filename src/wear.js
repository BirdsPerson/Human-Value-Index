// What a citizen can wear over their file photo (docs/design/ECONOMY_PROPERTY.md, "The shops"):
// the render data only, so the entry bundle carries no prices or names. One entry per garment:
// [slot, shape, {colourway: [main, detail]}, mark?]. A worn piece is a SKU "<id>.<colourway>"
// on the avatar spec under wear_<slot>; avatar.js draws it as its own layer (clothes over the
// body, the hair over the clothes, headwear and worn accessories over the hair). Names, prices,
// stores and seasons are in src/economy/shops.js, which checks every id here has one.
// Pure, no DOM.

export const WEAR_SLOTS = ["top", "bottom", "shoes", "outer", "head", "acc"];
export const WEAR_KEYS = WEAR_SLOTS.map(s => `wear_${s}`);

// The shapes each slot knows (avatar.js draws them).
export const SHAPES = {
  top: ["tee", "longsleeve", "tank", "shirt", "polo", "hoodie", "sweater", "jersey"],
  bottom: ["trousers", "jeans", "shorts", "skirt", "joggers"],
  shoes: ["sneakers", "hightops", "boots", "loafers"],
  outer: ["jacket", "bomber", "blazer", "coat", "vest"],
  head: ["cap", "beanie", "bucket", "fedora"],
  acc: ["chain", "scarf", "tote", "watch", "shades"],
};

// The house marks: a few pixels on the chest (x, y from the chest's top centre).
export const MARKS = {
  eb: [[-2, 0], [-2, 1], [-2, 2], [-1, 0], [-1, 1], [-1, 2], [1, 0], [1, 1], [1, 2], [2, 1], [2, 2], [2, 0]],
  ebtv: [[-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-3, 1], [2, 1], [-3, 2], [-2, 2], [-1, 2], [0, 2], [1, 2], [2, 2], [-1, 3], [0, 3]],
  jetsam: [[-2, 0], [-1, 0], [0, 0], [1, 0], [0, 1], [0, 2], [-2, 2], [-1, 3], [0, 3], [2, 0], [2, 1], [2, 3]],
  irene: [[-1, 0], [0, 0], [-1, 1], [0, 1], [-2, 2], [1, 2], [-1, 3], [0, 3]],
  sams: [[-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
};

const C = {
  black: "#262626", charcoal: "#3d3d3d", grey: "#8a8a8a", white: "#e6e6e6", oatmeal: "#d9ccb0", tan: "#c2a878", brown: "#6b4a2e",
  navy: "#1f2f5a", blue: "#3a6fd8", denim: "#45618f", red: "#b83232", maroon: "#6e2230", green: "#3c8a46", olive: "#6b6b35",
  yellow: "#e0c040", orange: "#d97a2b", purple: "#6b3fa0", pink: "#d977a8", cream: "#efe6cf", camel: "#b98a52", emerald: "#1f6b4a",
  gold: "#d8b040", silver: "#b8c0c8",
};
const W = (...names) => Object.fromEntries(names.map(n => (Array.isArray(n) ? [n[0], [n[1], n[2]]] : [n, [C[n], C[n]]])));

// id: [slot, shape, ways, mark]
export const WEAR = {
  // ---- SECOND FILE THRIFT (the Old Town)
  "t-tee": ["top", "tee", W("white", "grey", "black", "navy", "red", "green")],
  "t-flannel": ["top", "shirt", W(["red", C.red, C.black], ["green", C.green, C.navy], ["blue", C.blue, C.charcoal])],
  "t-sweater": ["top", "sweater", W(["oatmeal", C.oatmeal, C.brown], ["maroon", C.maroon, C.oatmeal], ["olive", C.olive, C.tan])],
  "t-jeans": ["bottom", "jeans", W(["denim", C.denim, C.tan], ["black", C.black, C.grey])],
  "t-cords": ["bottom", "trousers", W("brown", "olive", "tan")],
  "t-shorts": ["bottom", "shorts", W(["denim", C.denim, C.white], ["tan", C.tan, C.oatmeal])],
  "t-canvas": ["shoes", "sneakers", W(["white", C.white, C.white], ["black", C.black, C.white], ["red", C.red, C.white])],
  "t-boots": ["shoes", "boots", W(["brown", C.brown, C.black])],
  "t-denim": ["outer", "jacket", W(["denim", C.denim, C.tan])],
  "t-beanie": ["head", "beanie", W(["red", C.red, C.white], ["navy", C.navy, C.grey], ["olive", C.olive, C.oatmeal])],
  "t-bucket": ["head", "bucket", W(["tan", C.tan, C.brown], ["black", C.black, C.charcoal])],
  "t-scarf": ["acc", "scarf", W(["red", C.red, C.oatmeal], ["green", C.green, C.navy])],
  // ---- EASTGATE DEPARTMENT STORE (the suburbs)
  "d-polo": ["top", "polo", W(["white", C.white, C.navy], ["navy", C.navy, C.white], ["green", C.green, C.white])],
  "d-oxford": ["top", "shirt", W(["white", C.white, C.grey], ["blue", "#8fb0e0", C.white], ["pink", "#e8b0c8", C.white])],
  "d-hoodie": ["top", "hoodie", W(["grey", C.grey, C.white], ["navy", C.navy, C.white], ["black", C.black, C.grey], ["maroon", C.maroon, C.white])],
  "d-chinos": ["bottom", "trousers", W("tan", "navy", "olive")],
  "d-joggers": ["bottom", "joggers", W(["grey", C.grey, C.charcoal], ["black", C.black, C.charcoal])],
  "d-skirt": ["bottom", "skirt", W("black", "navy", "maroon")],
  "d-runners": ["shoes", "sneakers", W(["blue", C.blue, C.white], ["orange", C.orange, C.charcoal])],
  "d-hightops": ["shoes", "hightops", W(["red", C.red, C.white], ["black", C.black, C.white], ["white", C.white, C.red])],
  "d-bomber": ["outer", "bomber", W(["olive", C.olive, C.orange], ["black", C.black, C.charcoal], ["navy", C.navy, C.grey])],
  "d-raincoat": ["outer", "coat", W(["yellow", C.yellow, C.charcoal], ["navy", C.navy, C.yellow])],
  "d-cap": ["head", "cap", W(["navy", C.navy, C.white], ["red", C.red, C.white], ["black", C.black, C.grey])],
  "d-watch": ["acc", "watch", W(["silver", C.silver, C.charcoal])],
  "d-tote": ["acc", "tote", W(["canvas", C.oatmeal, C.navy])],
  // ---- the house brands (the department store's HOUSE BRANDS rail)
  "h-eb-tee": ["top", "tee", W(["black", C.black, C.yellow], ["white", C.white, C.black]), "eb"],
  "h-ebtv-crew": ["outer", "bomber", W(["navy", "#14202a", "#1d6fe0"]), "ebtv"],
  "h-jetsam-hoodie": ["top", "hoodie", W(["magenta", "#2a1a4a", "#ff40c0"], ["cyan", "#1a2a4a", "#40e0ff"]), "jetsam"],
  "h-irene-shirt": ["top", "polo", W(["brewpub", "#8c1622", "#f7f5ec"]), "irene"],
  "h-sams-cap": ["head", "cap", W(["red", "#c8102e", "#f7f5ec"]), "sams"],
  // ---- MAISON MERIDIAN (the Meridian's lobby arcade, Finance)
  "b-silk": ["top", "shirt", W(["cream", C.cream, C.gold], ["black", "#141414", C.charcoal], ["emerald", C.emerald, C.gold])],
  "b-linen": ["top", "shirt", W(["white", "#f2efe6", C.oatmeal], ["oatmeal", C.oatmeal, C.white])],
  "b-cashmere": ["top", "sweater", W(["oatmeal", C.oatmeal, C.cream], ["charcoal", C.charcoal, C.grey])],
  "b-tailored": ["bottom", "trousers", W("charcoal", "navy", "black")],
  "b-pleated": ["bottom", "skirt", W(["black", "#141414", C.charcoal], ["camel", C.camel, C.brown])],
  "b-loafers": ["shoes", "loafers", W(["brown", "#5a3420", C.gold], ["black", "#141414", C.gold])],
  "b-chelsea": ["shoes", "boots", W(["black", "#141414", "#3a3a3a"], ["brown", "#5a3420", "#2a1810"])],
  "b-blazer": ["outer", "blazer", W(["navy", C.navy, C.cream], ["charcoal", C.charcoal, C.grey], ["oatmeal", C.oatmeal, C.brown])],
  "b-trench": ["outer", "coat", W(["camel", C.camel, C.brown])],
  "b-overcoat": ["outer", "coat", W(["camel", "#a8743e", C.brown], ["charcoal", "#2e2e30", C.black])],
  "b-fedora": ["head", "fedora", W(["charcoal", C.charcoal, C.black], ["brown", C.brown, C.black])],
  "b-chain": ["acc", "chain", W(["gold", C.gold, "#f8e080"])],
  "b-shades": ["acc", "shades", W(["tortoise", "#3a2414", "#8a5a2a"])],
};

// An EB SHOP virtual copy (src/economy/ebvirtual.js) carries its own look in the SKU:
// "v-<h8>.<shape>-<main>-<detail>[-<number>]", so it draws anywhere with no lookup.
const VIRTUAL = /^v-[0-9a-f]{8}\.([a-z]+)-([0-9a-f]{6})-([0-9a-f]{6})(?:-(\d{1,2}))?$/;
const SLOT_OF = Object.fromEntries(Object.entries(SHAPES).flatMap(([slot, l]) => l.map(sh => [sh, slot])));

// "<id>.<way>" -> {id, way, slot, shape, main, detail, mark} | null
export function wearOf(sku) {
  if (typeof sku !== "string") return null;
  if (sku.startsWith("v-")) {
    const m = VIRTUAL.exec(sku), slot = m && SLOT_OF[m[1]];
    if (!slot || (m[4] && m[1] !== "jersey")) return null;
    return { id: sku.slice(0, 10), way: sku.slice(11), slot, shape: m[1], main: `#${m[2]}`, detail: `#${m[3]}`, mark: null, number: m[4] || null, virtual: true };
  }
  const dot = sku.lastIndexOf(".");
  if (dot < 1) return null;
  const id = sku.slice(0, dot), way = sku.slice(dot + 1), w = WEAR[id];
  if (!w || !Object.prototype.hasOwnProperty.call(w[2], way)) return null;
  return { id, way, slot: w[0], shape: w[1], main: w[2][way][0], detail: w[2][way][1], mark: w[3] || null };
}
// Every SKU in the catalog.
export const allSkus = () => Object.entries(WEAR).flatMap(([id, w]) => Object.keys(w[2]).map(way => `${id}.${way}`));
