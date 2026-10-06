// THE EB SHOP's VIRTUAL COPIES (Scott, 2026-10-06; docs/design/ECONOMY_PROPERTY.md, "The EB SHOP's
// virtual copies"): every listing on the real EB Shop (shop.electricbasement.tv) has an in-game copy,
// sold for CYCLES in the EB SHOP itself. Pure, shared by the server (netlify/lib/ebvirtual.js) and the
// pages: the category a product falls in, the CYCLES price of each category, and the SKU, which
// carries the copy's whole look (so every place that draws a file photo or a flat can draw it with no
// lookup):
//   wear  "w:v-<h8>.<shape>-<main>-<detail>[-<number>]"   a garment layer (src/wear.js wearOf)
//   furn  "f:v-<h8>.<form>-<c1>-<c2>"                      a shelf, a frame or a desk object
// <h8> is the listing's handle, hashed (FNV-1a); the colours are read once from the product photo
// on the server and frozen into the SKU.
//
// PRICES ARE BY CATEGORY, NEVER BY DOLLARS. A $2.50 DVD and a $10 DVD are the same 300 CYCLES; a
// $7.50 jersey and an $85 jersey the same 1,500. Nothing here reads a dollar price: CYCLES have no
// outside price (terms section 11), and a price that tracked dollars would imply an exchange rate.

export const VIRTUAL_RE = /^v-([0-9a-f]{8})\.([a-z]+)-([0-9a-f]{6})-([0-9a-f]{6})(?:-(\d{1,2}))?$/;
export const FORMS = ["shelf", "frame", "desk"];

// The CYCLES price of a copy, by what it is. The thrift tee is 150 and the boutique blazer 5,000:
// a copy sits in the department store's band, the jersey a little above (it is the flex).
export const WEAR_TIER = {
  tee: 600, tank: 600, longsleeve: 700, shirt: 800, polo: 800, sweater: 1_000, hoodie: 1_000, jersey: 1_500,
  trousers: 700, jeans: 700, shorts: 600, skirt: 700, joggers: 700,
  sneakers: 1_100, hightops: 1_100, boots: 1_100, loafers: 1_100,
  jacket: 1_800, bomber: 1_800, blazer: 1_800, coat: 1_800, vest: 1_200,
  cap: 450, beanie: 450, bucket: 450, fedora: 450,
  chain: 600, scarf: 450, tote: 450, watch: 600, shades: 600,
};
export const FORM_TIER = { shelf: 300, desk: 450, frame: 1_200 };
// Where a copy may stand in your flat (tower.js room purposes).
export const FORM_ROOMS = { shelf: ["living", "bedroom", "study"], frame: ["living", "bedroom", "study", "kitchen"], desk: ["study", "bedroom", "living"] };
export const FORM_NAME = { shelf: "ON A SHELF", frame: "FRAMED, FOR THE WALL", desk: "FOR A DESK OR A SHELF" };

export const hash8 = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, "0"); };

// ---- what a product is -----------------------------------------------------------------------------
// Garment words, checked in order against the title (the first that matches names the shape).
const GARMENT = [
  [/hoodie|sweatshirt|pullover/, "hoodie"], [/\bt-?shirts?\b|\btees?\b|v-?neck|\bcrew ?neck\b/, "tee"], [/\bjerseys?\b/, "jersey"],
  [/sweater|cardigan|\bknit\b/, "sweater"], [/\bpolo\b/, "polo"], [/\btank\b/, "tank"], [/long ?sleeve/, "longsleeve"],
  [/button|flannel|blouse|\bshirt\b/, "shirt"], [/bomber/, "bomber"], [/blazer/, "blazer"], [/\bvest\b/, "vest"],
  [/coat|parka|trench/, "coat"], [/jacket|windbreaker|fleece|anorak/, "jacket"],
  [/beanie|knit hat|toque/, "beanie"], [/bucket hat/, "bucket"], [/fedora/, "fedora"], [/\bhats?\b|\bcaps?\b|snapback|visor|fitted/, "cap"],
  [/shorts/, "shorts"], [/jeans/, "jeans"], [/jogger|sweatpants/, "joggers"], [/skirt|dress/, "skirt"], [/pants|trousers|chinos|leggings/, "trousers"],
  [/high-?tops?/, "hightops"], [/boots?\b/, "boots"], [/loafers?/, "loafers"], [/sneakers?|shoes|trainers|cleats/, "sneakers"],
  [/sunglasses|shades/, "shades"], [/necklace|chain|pendant|pearl/, "chain"], [/scarf/, "scarf"], [/\bbag\b|tote|backpack|purse/, "tote"],
  [/watch|bracelet|\brings?\b|earrings?|bangle/, "watch"],
];
const WEAR_TYPE = /clothing|apparel|t-?shirt|v-?neck|hats?\b|caps?\b|jersey|hoodie|shoes|sneakers|necklace|earrings|ring|bracelet|sunglasses|jewel/;
const MEDIA = /movie|dvd|blu-?ray|vhs|vinyl|\brecords?\b|\blp\b|video ?games?|\bcd\b|cassette|book|board ?game|card ?game|playing ?cards|comic|magazine/;
const WALL = /autograph|signed|framed|poster|print\b|\bart\b|memorabilia|photo|canvas|helmet|puck|pennant|home decor|wall/;
const shapeIn = (s) => { for (const [re, shape] of GARMENT) if (re.test(s)) return shape; return null; };

// {type, title, tags?} -> {cat: "wear", shape} | {cat: "furn", form}
export function categorize(p) {
  const type = String(p?.type || "").toLowerCase(), title = String(p?.title || "").toLowerCase();
  if (MEDIA.test(type)) return { cat: "furn", form: "shelf" };
  if (WALL.test(type)) return { cat: "furn", form: "frame" };
  if (WEAR_TYPE.test(type)) return { cat: "wear", shape: shapeIn(title) || shapeIn(type) || "tee" };
  if (type) return { cat: "furn", form: WALL.test(title) ? "frame" : MEDIA.test(title) ? "shelf" : "desk" };
  // no type: the title decides
  const sh = shapeIn(title);
  if (sh && !MEDIA.test(title)) return { cat: "wear", shape: sh };
  return { cat: "furn", form: MEDIA.test(title) ? "shelf" : WALL.test(title) ? "frame" : "desk" };
}
// The CYCLES price of a category: {cat, shape|form} -> CYCLES. Takes no dollar price, on purpose.
export const tierPrice = (c) => (c?.cat === "wear" ? WEAR_TIER[c.shape] : FORM_TIER[c?.form]) || null;

// A jersey's number: the title ("#33", "No. 33"), a "number:33" tag, a player the title names.
const PLAYERS = { "grant hill": "33", "allen iverson": "3", "julius erving": "6", "dr j": "6", "reggie miller": "31", "shaquille o'neal": "32", "penny hardaway": "1",
  "michael jordan": "23", "kobe bryant": "24", "hakeem olajuwon": "34", "charles barkley": "34", "jason kidd": "5", "jalen hurts": "1", "brian dawkins": "20", "reggie white": "92", "mike schmidt": "20" };
export function numberOf(p, override = null) {
  if (override?.number) return String(override.number);
  const t = String(p?.title || "");
  const m = /#\s?(\d{1,2})\b/.exec(t) || /\bno\.?\s?(\d{1,2})\b/i.exec(t);
  if (m) return m[1];
  for (const tag of p?.tags || []) { const k = /^number:\s?(\d{1,2})$/i.exec(String(tag).trim()); if (k) return k[1]; }
  const lo = t.toLowerCase();
  for (const [name, n] of Object.entries(PLAYERS)) if (lo.includes(name)) return n;
  return null;
}

// The SKU of a copy, from its category and the colours read off its photo (hex, no "#").
export function skuOf(handle, c, look) {
  const h = hash8(String(handle)), a = String(look.main).replace("#", "").toLowerCase(), b = String(look.detail).replace("#", "").toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(a) || !/^[0-9a-f]{6}$/.test(b)) return null;
  if (c.cat === "wear") return `w:v-${h}.${c.shape}-${a}-${b}${c.shape === "jersey" && look.number ? `-${look.number}` : ""}`;
  return `f:v-${h}.${c.form}-${a}-${b}`;
}
// "w:v-..." / "f:v-..." / "v-..." -> {h, cat, shape|form, main, detail, number} | null
export function parseVirtual(sku) {
  const s = typeof sku === "string" ? sku.replace(/^[wf]:/, "") : "";
  const m = VIRTUAL_RE.exec(s);
  if (!m) return null;
  const isForm = FORMS.includes(m[2]);
  if (typeof sku === "string" && /^[wf]:/.test(sku) && (sku[0] === "f") !== isForm) return null;
  if (!isForm && !WEAR_TIER[m[2]]) return null;
  if (isForm && m[5]) return null;
  return isForm ? { h: m[1], cat: "furn", form: m[2], main: `#${m[3]}`, detail: `#${m[4]}`, id: s } : { h: m[1], cat: "wear", shape: m[2], main: `#${m[3]}`, detail: `#${m[4]}`, number: m[5] || null, id: s };
}
export const isVirtualSku = (sku) => Boolean(parseVirtual(sku));

// ---- the words ------------------------------------------------------------------------------------
export const EBV_LINES = {
  get: (n) => `GET THE VIRTUAL ONE — ${Number(n).toLocaleString("en-US")} CYCLES`,
  real: "BUY THE REAL ONE AT THE EB SHOP",
  sold: "THE REAL ONE HAS SOLD",
  irl: "OWNED IN REAL LIFE",
  bought: "THE VIRTUAL ONE IS YOURS. THE CYCLES WERE DESTROYED. THE REAL ONE IS STILL FOR SALE, FOR MONEY, ELSEWHERE.",
  owned: "YOU ALREADY HAVE THE VIRTUAL ONE. THE DEPARTMENT ISSUES ONE COPY A FILE.",
  pending: "THE DEPARTMENT IS STILL COPYING THAT ONE. TRY AGAIN IN A FEW MINUTES.",
  unknown: "THE DEPARTMENT HAS NO COPY OF THAT.",
  claimsClosed: "CLAIMS ARE NOT OPEN YET.",
  claimed: "CLAIMED. THE VIRTUAL COPY IS IN YOUR FILE, MARKED OWNED IN REAL LIFE.",
  terms: "CYCLES HAVE NO PRICE OUTSIDE THE CITY. A VIRTUAL COPY IS PRICED BY WHAT IT IS, NOT BY WHAT THE REAL ONE COSTS. BUYING ONE BUYS NOTHING REAL.",
};
