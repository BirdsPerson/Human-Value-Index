// THE SHOPS, slice 1 (docs/design/ECONOMY_PROPERTY.md, "The shops: clothes, furniture, the
// closet"): the stores, what each sells, the prices in CYCLES, the seasonal stock, the room
// slots a flat's furniture stands in, and the lines. Pure: /api/shops (netlify/lib/shops.js)
// and the pages (src/shops/) read the same rules. A purchase BURNS its CYCLES (dept:burned):
// the sink the allowance needs. Nothing is given, sold on or transferred between players.
// Nothing here reads or writes a score: what you wear and own never raises it.
//
// The stores stand in rooms the city already has (no new place, no plan change): the thrift
// shop in MARKET ROW's shops (the Old Town), the department store in EASTGATE MALL's concourse
// (the suburbs; its upper floor sells the furniture), the boutique in THE MERIDIAN's lobby
// arcade (Finance). Their in-sim effects (an arcade cabinet draws visitors, a piano lifts a
// room) wait for a future machine-day boundary: see FURNITURE_EFFECTS.

import { WEAR, WEAR_SLOTS, wearOf } from "../wear.js";
import { CATALOG } from "../city/furniture.js";
import { seasonOf } from "../city/seasons.js";

export const SHOP_V = 1;
export const MAX_FURN_EACH = 3;       // copies of one furniture piece a file may own
export const OUTFIT_SLOTS = 3;        // saved outfits in the closet
export const PRICE_MIN = 50, PRICE_MAX = 40_000;

// ---- the stores (src/economy/stores.js: light, so the city's rows import only that) ----------------
export { STORES, storeOf, storesIn, storesInDistrict } from "./stores.js";
import { storeOf } from "./stores.js";

// ---- the clothes: name, store, price, seasons (null = all year), rail ----------------------------
// Prices sit beside the ladder (an OUTER flat is 9,000; a day's saving ~700): a thrift tee is
// a morning, a boutique blazer a week, the camel overcoat two.
const SP = "SPRING", SU = "SUMMER", AU = "AUTUMN", WI = "WINTER";
export const CLOTHES = {
  "t-tee": ["PLAIN TEE", "thrift", 150, null, "TOPS"],
  "t-flannel": ["FLANNEL SHIRT", "thrift", 280, [AU, WI, SP], "TOPS"],
  "t-sweater": ["SECOND-HAND SWEATER", "thrift", 320, [AU, WI], "TOPS"],
  "t-jeans": ["FADED JEANS", "thrift", 220, null, "BOTTOMS"],
  "t-cords": ["CORDUROYS", "thrift", 260, [AU, WI], "BOTTOMS"],
  "t-shorts": ["CUT-OFF SHORTS", "thrift", 120, [SP, SU], "BOTTOMS"],
  "t-canvas": ["CANVAS SNEAKERS", "thrift", 180, null, "SHOES"],
  "t-boots": ["WORK BOOTS (BROKEN IN)", "thrift", 350, [AU, WI], "SHOES"],
  "t-denim": ["DENIM JACKET", "thrift", 400, [SP, AU], "OUTERWEAR"],
  "t-beanie": ["BEANIE", "thrift", 90, [AU, WI], "HATS AND EXTRAS"],
  "t-bucket": ["BUCKET HAT", "thrift", 110, [SP, SU], "HATS AND EXTRAS"],
  "t-scarf": ["KNIT SCARF", "thrift", 100, [WI, AU], "HATS AND EXTRAS"],
  "d-polo": ["POLO SHIRT", "eastgate", 600, [SP, SU, AU], "TOPS"],
  "d-oxford": ["OXFORD SHIRT", "eastgate", 750, null, "TOPS"],
  "d-hoodie": ["PULLOVER HOODIE", "eastgate", 900, null, "TOPS"],
  "d-chinos": ["CHINOS", "eastgate", 800, null, "BOTTOMS"],
  "d-joggers": ["JOGGERS", "eastgate", 650, null, "BOTTOMS"],
  "d-skirt": ["A-LINE SKIRT", "eastgate", 700, null, "BOTTOMS"],
  "d-runners": ["RUNNING SHOES", "eastgate", 1_100, null, "SHOES"],
  "d-hightops": ["HIGH-TOPS", "eastgate", 1_300, null, "SHOES"],
  "d-bomber": ["BOMBER JACKET", "eastgate", 2_200, [AU, WI, SP], "OUTERWEAR"],
  "d-raincoat": ["RAINCOAT", "eastgate", 1_800, [SP, AU], "OUTERWEAR"],
  "d-cap": ["BASEBALL CAP", "eastgate", 400, [SP, SU, AU], "HATS AND EXTRAS"],
  "d-watch": ["WRISTWATCH", "eastgate", 1_500, null, "HATS AND EXTRAS"],
  "d-tote": ["CANVAS TOTE", "eastgate", 350, null, "HATS AND EXTRAS"],
  "h-eb-tee": ["EB SHOP TEE", "eastgate", 500, null, "HOUSE BRANDS"],
  "h-ebtv-crew": ["EBTV CREW JACKET", "eastgate", 3_500, null, "HOUSE BRANDS"],
  "h-jetsam-hoodie": ["JETSAM! HOODIE", "eastgate", 1_200, null, "HOUSE BRANDS"],
  "h-irene-shirt": ["GOODNIGHT IRENE'S STAFF SHIRT", "eastgate", 900, null, "HOUSE BRANDS"],
  "h-sams-cap": ["SAM'S PIZZA CAP", "eastgate", 450, null, "HOUSE BRANDS"],
  "b-silk": ["SILK SHIRT", "maison", 3_000, null, "TOPS"],
  "b-linen": ["LINEN SHIRT", "maison", 2_800, [SP, SU], "TOPS"],
  "b-cashmere": ["CASHMERE KNIT", "maison", 4_500, [AU, WI], "TOPS"],
  "b-tailored": ["TAILORED TROUSERS", "maison", 3_800, null, "BOTTOMS"],
  "b-pleated": ["PLEATED SKIRT", "maison", 3_500, null, "BOTTOMS"],
  "b-loafers": ["LEATHER LOAFERS", "maison", 4_000, null, "SHOES"],
  "b-chelsea": ["CHELSEA BOOTS", "maison", 4_800, [AU, WI, SP], "SHOES"],
  "b-blazer": ["UNSTRUCTURED BLAZER", "maison", 5_000, null, "OUTERWEAR"],
  "b-trench": ["TRENCH COAT", "maison", 7_500, [SP, AU], "OUTERWEAR"],
  "b-overcoat": ["CAMEL OVERCOAT", "maison", 8_500, [AU, WI], "OUTERWEAR"],
  "b-fedora": ["FELT FEDORA", "maison", 2_500, [AU, WI], "HATS AND EXTRAS"],
  "b-chain": ["GOLD CHAIN", "maison", 6_000, null, "HATS AND EXTRAS"],
  "b-shades": ["DESIGNER SHADES", "maison", 3_000, [SP, SU], "HATS AND EXTRAS"],
};
export const SLOT_NAME = { top: "TOP", bottom: "BOTTOMS", shoes: "SHOES", outer: "OUTERWEAR", head: "HAT", acc: "ACCESSORY" };

// ---- the furniture: furniture.js's catalog, priced (EASTGATE HOME). The building's own fixtures
// (mailboxes, the reception desk, the shop's racks, the bar, the vault's safes) are not for sale;
// nor is the MOUNTED FISH (it waits for THE WATERS' verified catch: docs ... "Selling fish").
export const FURNITURE_PRICES = {
  "bed-single": 600, "bed-futon": 450, "bed-bunk": 500, "bed-double": 1_500, "bed-canopy": 6_000,
  wardrobe: 800, dresser: 700, nightstand: 250, lamp: 200, poster: 120, painting: 1_200,
  fridge: 900, "fridge-retro": 1_400, "fridge-steel": 3_500, stove: 700, range: 4_500, counter: 900, island: 5_000,
  table: 500, "table-round": 800, dinette: 650, pots: 250, "beer-tap": 6_500,
  tv: 1_200, "tv-crt": 300, "tv-flat": 2_800, ebtv: 2_500,
  sofa: 1_600, sectional: 5_500, loveseat: 1_100, beanbag: 200, armchair: 700, rug: 400,
  plant: 100, "plant-tall": 350, cactus: 60, bookshelf: 600, "record-player": 900, aquarium: 2_200, chandelier: 8_000,
  easel: 400, piano: 6_000, "grand-piano": 20_000, books: 150, weights: 750, trophies: 500,
  pc: 2_000, arcade: 4_000, globe: 300, filing: 250, drafting: 1_800, desk: 700,
  tub: 1_500, clawfoot: 4_500, shower: 900, sink: 400, toilet: 300, towels: 80,
  // the upgrade tiers: never sold outright, reached only by UPGRADE (their value on the ladder)
  "golf-cabinet": 10_000, "golf-sim": 35_000, "ebtv-big": 4_500, "home-theater": 18_000, kegerator: 9_000, brewery: 16_000,
};

// ---- UPGRADES (Scott, 2026-10-05: "buy an arcade machine cabinet, then upgrade it to the Golden
// Tee machine with the cool screen, then upgrade that to the golf simulator"). A piece upgrades to
// the next tier for the difference in value plus a fee (5%, at least 100); the old piece is
// consumed, the CYCLES burned. A tier may need more room: `whole` pieces take a whole room (the
// golf simulator converts the study, the spare room only the top and middle flats have).
// Next, when their games exist: dartboard -> electronic darts; a hunting cabinet -> the home
// hunting simulator; a home bowling lane (ultra-luxury, the penthouse only).
export const UPGRADES = {
  arcade: "golf-cabinet", "golf-cabinet": "golf-sim",
  tv: "ebtv-big", ebtv: "ebtv-big", "tv-flat": "ebtv-big", "ebtv-big": "home-theater",
  "beer-tap": "kegerator", kegerator: "brewery",
};
export const UPGRADE_ONLY = new Set(Object.values(UPGRADES));
export const UPGRADE_FEE = (diff) => Math.max(100, Math.round(diff * 0.05));
// -> {from, to, price, item} | null: what upgrading this piece costs now
export function upgradeOf(id) {
  const to = UPGRADES[id];
  if (!to || !FURNITURE_PRICES[id] || !FURNITURE_PRICES[to]) return null;
  const diff = Math.max(0, FURNITURE_PRICES[to] - FURNITURE_PRICES[id]);
  return { from: id, to, price: diff + UPGRADE_FEE(diff), name: CATALOG[to].name };
}
// The chain a piece starts: [id, next, next...]
export function chainOf(id) { const out = [id]; let k = id; while (UPGRADES[k] && out.length < 6) { k = UPGRADES[k]; out.push(k); } return out; }

// ---- PLAYABLE AT HOME: a tap on the piece in your own flat ----------------------------------------
// {game: an arcade.json slug} opens the cabinet's game; {go: a route} opens a page; {ebtv: true}
// opens the live channel (the set shows the live frame, ebtvFrame.js). check-shops resolves each.
export const PLAY_AT_HOME = {
  arcade: { game: "jetsam", label: "PLAY JETSAM!" },
  "golf-cabinet": { go: "#golf?preset=cabinet", label: "PLAY BAR-TOP GOLF (TRACKBALL: DRAG TO SWING)" },
  "golf-sim": { go: "#golf?preset=sim", label: "TEE OFF ON THE SIMULATOR" },
  tv: { ebtv: true, label: "WATCH EBTV" }, "tv-crt": { ebtv: true, label: "WATCH EBTV" }, "tv-flat": { ebtv: true, label: "WATCH EBTV" },
  ebtv: { ebtv: true, label: "WATCH EBTV" }, "ebtv-big": { ebtv: true, label: "WATCH EBTV, BIG" }, "home-theater": { ebtv: true, label: "EBTV IN THE HOME THEATER" },
};
// The top of each chain: at night, the city's figures gather round it (render-side, the cutaway).
export const TOP_TIER = new Set(["golf-sim", "home-theater", "brewery"]);
export const FURN_SECTIONS = [
  ["BEDROOM", ["bed-single", "bed-futon", "bed-bunk", "bed-double", "bed-canopy", "wardrobe", "dresser", "nightstand"]],
  ["LIVING ROOM", ["sofa", "loveseat", "sectional", "armchair", "beanbag", "rug", "tv-crt", "tv", "tv-flat", "ebtv", "record-player", "bookshelf", "books"]],
  ["KITCHEN", ["fridge", "fridge-retro", "fridge-steel", "stove", "range", "counter", "island", "table", "table-round", "dinette", "pots", "beer-tap"]],
  ["STUDY", ["desk", "pc", "drafting", "filing", "globe"]],
  ["BATHROOM", ["sink", "toilet", "shower", "tub", "clawfoot", "towels"]],
  ["LIGHTS, WALLS AND PLANTS", ["lamp", "chandelier", "poster", "painting", "cactus", "plant", "plant-tall", "aquarium"]],
  ["PASTIMES", ["arcade", "piano", "grand-piano", "easel", "weights", "trophies"]],
];
// The small in-sim effects (design: "an arcade cabinet draws visitors; a piano lifts a room's
// mood"). DATA ONLY in slice 1: nothing reads them until EFFECTS_FROM_DAY is set to an absolute
// machine day after the newest published plan + its lookahead, recorded with the sim version,
// so every published day rebuilds identically (the market's MARKET_SIM_FROM rule). Until then
// furniture is cosmetic. The hook: the plan builder reads the close's `econ` block (placements
// per flat) and adds `visit` to the flat's pull on its residents' friends' leisure, `mood` to
// the district's mood fold, once per flat, capped.
export const EFFECTS_FROM_DAY = null;
export const FURNITURE_EFFECTS = {
  arcade: { visit: 0.5, line: "DRAWS VISITORS. THEY STAY FOR ONE MORE GAME." },
  piano: { mood: 1, line: "LIFTS THE ROOM'S MOOD, PLAYED OR NOT." },
  "grand-piano": { mood: 2, line: "LIFTS THE ROOM'S MOOD. THE NEIGHBOURS HAVE OPINIONS." },
  "beer-tap": { visit: 0.4, line: "DRAWS VISITORS. GOODNIGHT IRENE'S ON TAP." },
  ebtv: { visit: 0.2, line: "THE CHANNEL IS ON. PEOPLE DROP IN TO WATCH." },
  "record-player": { mood: 1, line: "LIFTS THE ROOM. VINYL, SUPERVISED." },
  aquarium: { mood: 1, line: "CALMS THE ROOM. THE FISH ARE MONITORED TOO." },
};

// ---- the seasons: the stock rotates with the city's calendar (seasons.js: a long season is a
// real month), SPRING, SUMMER, AUTUMN, WINTER in turn; season 23 (machine day 617, 2026-10-06)
// is AUTUMN.
export const COLLECTIONS = [SP, SU, AU, WI];
export const collectionOf = (machineDay) => COLLECTIONS[((seasonOf(machineDay) % 4) + 4) % 4];

// ---- reading the catalog ---------------------------------------------------------------------------
// A SKU: "w:<wear id>.<colourway>" (clothes) or "f:<furniture id>" (furniture).
export function itemOf(sku) {
  if (typeof sku !== "string") return null;
  if (sku.startsWith("w:")) {
    const w = wearOf(sku.slice(2)), c = w && CLOTHES[w.id];
    if (!c) return null;
    return { sku, kind: "wear", id: w.id, way: w.way, wear: sku.slice(2), slot: w.slot, shape: w.shape, name: c[0], store: c[1], price: c[2], seasons: c[3], rail: c[4], colour: w.main, detail: w.detail, house: w.id.startsWith("h-") };
  }
  if (sku.startsWith("f:")) {
    const id = sku.slice(2), it = CATALOG[id], price = FURNITURE_PRICES[id];
    if (!it || !price) return null;
    return { sku, kind: "furn", id, name: it.name, store: "eastgate-home", price, rooms: it.rooms, wall: it.wall, floor: it.floor, whole: it.whole, effect: FURNITURE_EFFECTS[id] || null,
      upgrade: upgradeOf(id), upgradeOnly: UPGRADE_ONLY.has(id), play: PLAY_AT_HOME[id] || null, top: TOP_TIER.has(id) };
  }
  return null;
}
export const inSeason = (item, collection) => !item.seasons || item.seasons.includes(collection);
// A store's stock today: [{rail, items: [item...]}], the rails in order. machineDay: the city's.
export function stockOf(storeId, machineDay) {
  const st = storeOf(storeId);
  if (!st) return [];
  if (st.kind === "furniture") return FURN_SECTIONS.map(([rail, ids]) => ({ rail, items: ids.map(id => itemOf(`f:${id}`)).filter(Boolean) }));
  const col = collectionOf(machineDay), rails = new Map();
  for (const [id, c] of Object.entries(CLOTHES)) {
    if (c[1] !== storeId) continue;
    for (const way of Object.keys(WEAR[id][2])) {
      const it = itemOf(`w:${id}.${way}`);
      if (!inSeason(it, col)) continue;
      if (!rails.has(c[4])) rails.set(c[4], []);
      rails.get(c[4]).push(it);
    }
  }
  const order = ["HOUSE BRANDS", "TOPS", "BOTTOMS", "OUTERWEAR", "SHOES", "HATS AND EXTRAS"];
  return order.filter(r => rails.has(r)).map(rail => ({ rail, items: rails.get(rail) }));
}
// Is a SKU on sale today (in that store's stock)?
export function onSale(sku, machineDay) {
  const it = itemOf(sku);
  if (!it) return false;
  if (it.kind === "furn") return !it.upgradeOnly;
  return inSeason(it, collectionOf(machineDay));
}

// ---- outfits ---------------------------------------------------------------------------------------
// An outfit: {top: wearSku, bottom, ...}, each a worn SKU (no "w:") for its own slot, every one
// owned. -> the avatar spec's wear_* keys, or null if invalid.
export function outfitKeys(outfit, owned = null) {
  if (!outfit || typeof outfit !== "object" || Array.isArray(outfit)) return null;
  const out = {};
  for (const [slot, v] of Object.entries(outfit)) {
    if (!WEAR_SLOTS.includes(slot)) return null;
    if (v == null || v === "") continue;
    const w = wearOf(v);
    if (!w || w.slot !== slot) return null;
    if (owned && !owned.has(`w:${v}`)) return null;
    out[`wear_${slot}`] = v;
  }
  return out;
}

// ---- furniture in a flat: each room has five floor spots and three on the wall ------------------
export const FLOOR_SPOTS = [0.1, 0.3, 0.5, 0.7, 0.9];
export const WALL_SPOTS = [0.25, 0.5, 0.75];
export const spotsFor = (item) => (item?.wall ? WALL_SPOTS.map((x, i) => ({ id: `w${i}`, x })) : item?.whole ? [{ id: "f2", x: 0.5 }] : FLOOR_SPOTS.map((x, i) => ({ id: `f${i}`, x })));
// The whole-room rule: a `whole` piece needs a room with nothing else on its floor; a room given
// over to one takes no other floor piece (the walls stay free). others: [{room, spot, item}] already
// placed (anyone's), not counting this piece. -> null if fine, else the reason.
export function roomRule(item, roomId, others) {
  const floor = others.filter(o => o.room === roomId && o.spot[0] === "f");
  if (item.whole && floor.length) return "needs-room";
  if (!item.wall && floor.some(o => CATALOG[o.item]?.whole)) return "room-given";
  return null;
}
export const spotX = (spot) => { const m = /^([fw])(\d)$/.exec(String(spot || "")); if (!m) return null; const L = m[1] === "w" ? WALL_SPOTS : FLOOR_SPOTS; return L[+m[2]] ?? null; };
// May this furniture stand in this room of this flat? room: a tower.js room id "<flat>:<purpose>[n]".
export function placeable(item, roomId, flatId) {
  if (!item || item.kind !== "furn" || typeof roomId !== "string" || !flatId) return false;
  if (!roomId.startsWith(`${flatId}:`)) return false;
  const purpose = roomId.slice(flatId.length + 1).replace(/\d+$/, "");
  return item.rooms.includes(purpose);
}
// The pieces placed in a flat, laid over its dressing (furniture.js dressUnit's look): a placed
// floor piece takes the place of whatever dressing stood within reach of its spot.
export function furnishLook(look, placements) {
  if (!look || !placements?.length) return look;
  const rooms = {};
  for (const [rid, r] of Object.entries(look.rooms)) rooms[rid] = { ...r, furniture: r.furniture.slice() };
  for (const p of placements) {
    const r = rooms[p.room], it = CATALOG[p.item], x = spotX(p.spot);
    if (!r || !it || x == null) continue;
    if (it.whole) r.furniture = r.furniture.filter(f => CATALOG[f.item]?.wall || f.placed);
    else if (!it.wall) r.furniture = r.furniture.filter(f => CATALOG[f.item]?.wall || CATALOG[f.item]?.floor || Math.abs(f.x - x) > 0.13);
    else r.furniture = r.furniture.filter(f => !CATALOG[f.item]?.wall || Math.abs(f.x - x) > 0.13);
    r.furniture.push({ item: p.item, x, role: it.role, tint: it.tints ? it.tints[0] : null, flip: false, placed: true });
  }
  return { ...look, rooms };
}

// ---- lines -----------------------------------------------------------------------------------------
export const SHOP_LINES = {
  bought: "PURCHASE RECORDED. THE CYCLES HAVE BEEN DESTROYED. THE GARMENT HAS NOT.",
  boughtFurn: "DELIVERED TO YOUR INVENTORY. PLACE IT FROM YOUR FLAT. THE DEPARTMENT DOES NOT ASSEMBLE.",
  dup: "ALREADY RUNG UP. THE DEPARTMENT DOES NOT CHARGE TWICE FOR ONE TAP.",
  owned: "YOU ALREADY OWN THAT. THE DEPARTMENT KEEPS A RECORD OF YOUR WARDROBE. OBVIOUSLY.",
  tooMany: `THREE OF ANYTHING IS A COLLECTION. THE DEPARTMENT STOPS YOU AT ${MAX_FURN_EACH}.`,
  poor: "NOT ENOUGH CYCLES. COLLECT YOUR ALLOWANCE, OR WANT LESS.",
  offSeason: "NOT IN THIS SEASON'S STOCK. THE SEASON TURNED. FASHION IS A SCHEDULE.",
  noWallet: "NO WALLET ON FILE. COLLECT YOUR ALLOWANCE ONCE AND THE TREASURY WILL KNOW YOU.",
  worn: "OUTFIT FILED. THE CITY WILL SEE IT. THE CITY SEES EVERYTHING.",
  saved: "OUTFIT SAVED TO THE CLOSET.",
  placed: "PLACED. THE ROOM HAS BEEN UPDATED IN THE RECORD.",
  removed: "RETURNED TO YOUR INVENTORY. THE ROOM REMEMBERS.",
  taken: "THAT SPOT IS TAKEN. A FLATMATE GOT THERE FIRST, OR YOU DID.",
  noFlat: "YOUR ASSIGNED HOME HAS NO CUTAWAY YET. YOUR FURNITURE WAITS IN YOUR INVENTORY.",
  upgraded: "UPGRADED. THE OLD ONE WAS TAKEN AWAY. THE DIFFERENCE WAS DESTROYED, WITH A FEE FOR THE TROUBLE.",
  upgradedStored: "UPGRADED. IT NO LONGER FITS WHERE THE OLD ONE STOOD: IT WAITS IN YOUR INVENTORY.",
  noUpgrade: "THAT IS AS GOOD AS IT GETS. THE DEPARTMENT HAS NOTHING BETTER. YET.",
  needsRoom: "IT NEEDS THE WHOLE ROOM. CLEAR THE FLOOR FIRST.",
  roomGiven: "THAT ROOM IS GIVEN OVER TO SOMETHING BIGGER. THE WALLS ARE FREE.",
  drawn: "YOUR LIKENESS WAS DRAWN BY HAND. IT WEARS WHAT IT WAS DRAWN IN. YOUR WARDROBE IS KEPT ALL THE SAME.",
  score: "WHAT YOU WEAR NEVER RAISES YOUR SCORE. CONDUCT DOES.",
};
export const fmtC = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");
