// The NPC shops sell real EB Shop stock (src/city/npcTags.js, npcStock.js, npcShops.jsx; docs/CITY_SPEC.md
// "The NPC shops"): the trade -> product table is sane, every stocked shop's items resolve to real
// products, every link out is tagged (utm_campaign=npc-<trade>, utm_content=<handle>), a game shop
// also shelves Iridescent's boxes, closed or stale stock reads CLOSED FOR INVENTORY, each trade is
// its own click counter, and none of it is in the entry bundle. No network. Run: node scripts/check-npcshop.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let n = 0, failed = 0;
const ok = (c, msg) => { n++; if (!c) { failed++; console.log(`  FAIL ${msg}`); } };
const src = (p) => readFileSync(join(ROOT, p), "utf8");

const TAGS = await import("../src/city/npcTags.js");
const E = await import("../src/city/enterprise.js");
const L = await import("../netlify/lib/funnels.js");
const F = await import("../src/city/funnels.js");
const ST = await import("../src/city/npcStock.js");
const SS = await import("../src/city/shopStock.js");
const PROPS = await import("../src/city/props.js");
const FP = await import("../src/city/funnelProps.js");
const HOOK = await import("../src/city/npcHook.js");
const SF = await import("../src/city/storefrontSim.js");

// a catalogue shaped like the real one (types as Shopify has them), enough of every kind
const mk = (type, title, i) => ({ handle: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${i}`, title, product_type: type, vendor: "EBShop", published_at: `2026-10-${String(10 + (i % 20)).padStart(2, "0")}`, variants: [{ price: "9.99", available: true }], images: [{ src: `https://cdn.shopify.com/i${i}.jpg` }] });
const PRODUCTS = [];
const add = (type, titles) => titles.forEach(t => PRODUCTS.push(mk(type, t, PRODUCTS.length)));
add("Movies", Array.from({ length: 30 }, (_, i) => `Film ${i} (DVD)`).concat(["Stop Making Sense Live in Concert (DVD)", "The Beatles Anthology Tour (DVD)", "Rock Documentary Band (DVD)", "Jazz Sound Live (DVD)"]));
add("Video Games", Array.from({ length: 12 }, (_, i) => `Game ${i} (PS2)`));
add("Playing Cards", ["Poker Deck A", "Poker Deck B", "Magic Deck C", "Tarot Cards D"]);
add("Board Game", ["Board One", "Board Two"]);
add("Dice", ["Gemstone Dice Set"]);
add("Toys", ["Robot Toy", "Plush Bear", "STEM Kit"]);
add("Autographed Mini-Helmets", ["Signed Helmet 1", "Signed Helmet 2", "Signed Helmet 3", "Signed Helmet 4", "Signed Helmet 5"]);
add("Autographed Pucks", ["Signed Puck 1", "Signed Puck 2", "Signed Puck 3"]);
add("Clothing / Accessories", ["Logo T-Shirt 1", "Logo T-Shirt 2", "Logo T-Shirt 3", "Hockey Jersey 1", "Hockey Jersey 2", "Hockey Jersey 3", "Zip Hoodie", "Fleece Jacket", "Bomber Jacket", "Wool Beanie", "Golf Polo A", "Golf Polo B", "Golf Polo C", "Baseball Cap", "Board Shorts", "Canvas Sneakers", "Leather Boots"]);
add("Earrings", ["Diamond Stud Earrings"]); add("Mens Ring", ["Signet Ring"]); add("Necklace", ["Gold Necklace"]); add("Bracelets", ["Silver Bracelet"]);
add("Mug", ["Mug One", "Mug Two", "Mug Three"]); add("Home Decor", ["Wall Clock"]);
add("Vinyl", ["Record One", "Record Two"]);
add("Electronics", ["Cassette Player"]);
const fetchFn = async (url) => ({ ok: true, json: async () => ({ products: new URL(url).searchParams.get("page") === "1" ? PRODUCTS : [] }) });
const mem = new Map();
const store = { get: async (k) => mem.get(k) ?? null, setJSON: async (k, v) => { mem.set(k, v); return {}; } };
const listing = await L.npcListing({ fetchFn, st: store, now: 1e12 });
ok(listing.tags && !listing.closed, "the server groups the feed for the shops");
ok(Object.values(listing.tags).every(a => a.length <= TAGS.NPC_CAP), "no tag keeps more than NPC_CAP");
ok(mem.has("shopnpc"), "the grouped stock is kept (Blobs), like the shop's");
const again = await L.npcListing({ fetchFn: async () => { throw new Error("down"); }, st: store, now: 1e12 + 5 * 60 * 1000 });
ok(again.tags && !again.stale, "a fresh copy is served without asking Shopify");
const stale = await L.npcListing({ fetchFn: async () => { throw new Error("down"); }, st: store, now: 1e12 + 3 * 3600 * 1000 });
ok(stale.stale && stale.tags, "Shopify down with a recent copy: the copy, marked stale");
const dead = await L.npcListing({ fetchFn: async () => { throw new Error("down"); }, st: { get: async () => null, setJSON: async () => ({}) }, now: 1e12 });
ok(dead.closed, "Shopify down with nothing kept: closed for inventory");

// 1. the table
const known = new Set(PRODUCTS.flatMap(p => TAGS.tagsOf(p.product_type, p.title)));
for (const [trade, tags] of Object.entries(TAGS.SHOP_TAGS)) {
  ok(Boolean(E.SHOP_TYPES[trade]), `${trade} is a real storefront trade`);
  ok(tags.length > 0 && tags.every(t => known.has(t) || ["book"].includes(t)), `${trade}: every tag it stocks is one a product can have (${tags})`);
  ok(L.CAMPAIGNS.has(TAGS.slugOf(trade)), `${trade}: its counter ${TAGS.slugOf(trade)} is one the server counts`);
  ok(Boolean(L.clickKey({ c: TAGS.slugOf(trade), k: "open", to: null })) && Boolean(L.clickKey({ c: TAGS.slugOf(trade), k: "out", to: "shop.electricbasement.tv" })), `${trade}: its opens and its links out are counted`);
}
for (const none of ["gym", "restaurant", "bakery", "icecream", "grocer", "wine", "venue", "comedy"]) ok(!TAGS.SHOP_TAGS[none], `${none}: nothing sensible to stock, so nothing forced`);
ok(TAGS.SHOP_TAGS.games.includes("game") && TAGS.SHOP_TAGS.video.includes("movie") && TAGS.SHOP_TAGS.boutique.includes("apparel") && TAGS.SHOP_TAGS.records.includes("vinyl"), "the headline pairings: games, video, boutique, records");
ok(TAGS.NPC_CAMPAIGNS.every(c => c.startsWith("npc-")) && new Set(TAGS.NPC_CAMPAIGNS).size === TAGS.NPC_CAMPAIGNS.length, "one counter per trade");

// 2. every stocked shop: items resolve, 4..16 of them, matching its trade, links tagged
ST.setNpc({ tags: listing.tags });
const byHandle = new Map(PRODUCTS.map(p => [p.handle, p]));
const stocked = [], skipped = [];
for (const trade of Object.keys(TAGS.SHOP_TAGS)) {
  const s = ST.stockFor(trade);
  if (!s || s.state !== "open") { skipped.push(trade); continue; }
  stocked.push([trade, s.items.length]);
  ok(s.items.length >= TAGS.NPC_MIN && s.items.length <= TAGS.NPC_MAX, `${trade}: ${s.items.length} items (${TAGS.NPC_MIN}..${TAGS.NPC_MAX})`);
  ok(s.items.every(i => byHandle.has(i.handle) && i.image && i.price), `${trade}: every item resolves to a real product with a picture and a price`);
  ok(s.items.every(i => TAGS.tagsOf(i.type, i.title).some(t => TAGS.SHOP_TAGS[trade].includes(t))), `${trade}: every item is something this trade sells`);
  ok(new Set(s.items.map(i => i.handle)).size === s.items.length, `${trade}: no item twice`);
  for (const i of s.items) {
    const url = F.utm(`${F.EB_SHOP}/products/${i.handle}`, s.slug, i.handle), q = new URL(url).searchParams;
    if (!(F.isTagged(url) && q.get("utm_campaign") === s.slug && q.get("utm_content") === i.handle)) { ok(false, `${trade}: ${i.handle} link tagged`); break; }
  }
}
ok(stocked.length >= 8, `at least eight trades stock real items (${stocked.map(x => x.join(":")).join(" ")})`);
ok(ST.stockFor("books") === null, "books: no books on the real shelf, so no stock (not forced)");
const rec = ST.stockFor("records");
ok(rec && rec.items.every(i => /vinyl|record/i.test(i.type + i.title) || TAGS.RECORDS_MOVIE.test(i.title)), "records: vinyl and music films only, not a second video rental");

// 3. the game shop's Iridescent boxes
const games = ST.stockFor("games");
ok(games && JSON.stringify(games.boxes) === JSON.stringify(["jetsam", "anamnesis", "ward"]), "the game shop shelves JETSAM!, ANAMNESIS and WARD");
ok(F.GAME.jetsam.play && F.GAME.jetsam.itch && F.GAME.anamnesis.play && F.GAME.anamnesis.itch, "the live boxes link to play and to itch");
ok(F.GAME.ward.status === "dev" && !F.GAME.ward.play, "WARD is COMING SOON, nothing to play");
ok(Object.entries(ST.stockFor("video")).length && ST.stockFor("video").boxes.length === 0 && ST.stockFor("boutique").boxes.length === 0, "only a game shop has the boxes");

// 4. in the room: slots, taps, the room opens the shop
const unit = SF.UNIT_IDS[0];
const block = (type) => ({ day: 1, units: { [unit]: { s: "OPEN", id: "0007", sign: "TYLER'S GAME SHOP", type } }, biz: [{ id: "0007", owner: "x", sign: "TYLER'S GAME SHOP", type, units: [unit], staff: [] }], closed: [] });
HOOK.NPC.hits = (pid, plan, u) => ST.hitsFor(pid, plan, u, BLK);
let BLK = block("games");
const sh = ST.shopOf(unit, BLK);
ok(sh && sh.typeId === "games" && sh.sign === "TYLER'S GAME SHOP", "a game shop is found in its unit, by its sign");
for (const [w, h, sw, u] of [[916, 188, 34, 5], [700, 120, 32, 3], [520, 150, 43, 4]]) {
  const plan = PROPS.roomPlan("shop-games", w, h, sw, 8);
  const slots = SS.shopSlots(w, h, u, ST.need(sh.stock), ST.RIGHT);
  ok(slots.length >= 6, `game shop ${w}x${h}: ${slots.length} slots on the wall`);
  ok(slots.every(q => q.x >= 0 && q.x + q.s <= w && q.y >= 0 && q.y + q.s <= h * 0.5), `${w}x${h}: every slot on the wall`);
  const list = ST.entries(sh.stock);
  let right = 0, boxes = 0;
  slots.slice(0, list.length).forEach((q, k) => {
    const spec = FP.funnelTapAt(unit, plan, q.x + q.s / 2, q.y + q.s / 2, u);
    const it = list[k];
    if (it.box ? spec?.kind === "game" && spec.slug === it.slug && spec.campaign === "npc-games" && spec.shopCampaign === "npc-games" : spec?.kind === "shop" && spec.item === it.handle && spec.campaign === "npc-games" && spec.npc?.items.length === sh.stock.items.length) right++;
    if (it.box) boxes++;
  });
  ok(right === Math.min(slots.length, list.length), `${w}x${h}: a tap on each shelf item opens its own (${right}/${Math.min(slots.length, list.length)}), the boxes first (${boxes})`);
  const room = FP.funnelTapAt(unit, plan, w - 3, h - 3, u);
  ok(room?.kind === "shop" && !room.item && room.campaign === "npc-games" && room.npc?.sign === "TYLER'S GAME SHOP", `${w}x${h}: the rest of the floor opens the shop, counted as npc-games`);
}
BLK = { ...block("games"), units: { [unit]: { s: "TO LET" } }, biz: [] };
ok(ST.hitsFor(unit, { w: 700, h: 120, rows: [] }, 3, BLK).length === 0, "a unit TO LET sells nothing");
BLK = block("gym");
ok(ST.hitsFor(unit, { w: 700, h: 120, rows: [] }, 3, BLK).length === 0, "a gym has no stock to sell");

// 5. closed or stale: CLOSED FOR INVENTORY, the boxes (ours) stay
for (const j of [{ closed: true }, { tags: listing.tags, stale: true }, { tags: {} }, null]) {
  ST.setNpc(j === null ? { closed: true } : j);
  const v = ST.stockFor("video"), g = ST.stockFor("games");
  ok(v && v.state === "closed" && v.items.length === 0, `${JSON.stringify(j)?.slice(0, 24)}: a video rental's shelves read closed`);
  ok(g && g.state === "closed" && g.items.length === 0 && g.boxes.length === 3, `${JSON.stringify(j)?.slice(0, 24)}: the game shop keeps its three boxes`);
  BLK = block("video");
  const hv = ST.hitsFor(unit, { w: 700, h: 120, rows: [] }, 3, BLK);
  ok(hv.every(h => !h.spec.item), "closed: no item answers a tap");
}
{
  const jsx = src("src/city/npcShops.jsx");
  ok(jsx.includes("CLOSED FOR INVENTORY"), "the closed notice is on the shelf");
}

// 6. wiring: lazy, counted, linked
const entry = ["src/city/storefrontProps.js", "src/city/funnelProps.js", "src/city/FunnelOverlay.jsx", "src/city/CityIso.jsx", "src/city/BuildingView.jsx", "src/city/props.js"];
for (const f of entry) ok(!/from\s+["']\.\/npcShops\.jsx["']/.test(src(f)), `${f}: the shelves are never imported statically`);
ok(/import\(["']\.\/npcShops\.jsx["']\)/.test(src("src/city/npcHook.js")) && /lazy\(\(\) => import\(["']\.\/npcShops\.jsx["']\)\)/.test(src("src/city/NpcShopLinks.jsx")), "the shelves load on first draw, and with the keyboard links");
ok(/NpcShopLinks pid=\{b\.id\}/.test(src("src/city/CityIso.jsx")) && /NpcShopLinks pid=\{b\.id\}/.test(src("src/city/BuildingView.jsx")), "the city and the building page both carry the keyboard links");
ok(/spec\.npc/.test(src("src/city/FunnelOverlay.jsx")) && /spec\.shopCampaign/.test(src("src/city/FunnelOverlay.jsx")), "the overlay shows a shop's own stock and counts a box's play for the shop");
ok(/countFunnel\(s\.campaign/.test(src("src/city/FunnelOverlay.jsx")), "an open counts for the shop's campaign");
ok(/BUY THE REAL ONE|EBV_LINES\.real/.test(src("src/city/FunnelOverlay.jsx")) && /LazyCopy handle=\{pick\.handle\} campaign=\{campaign\}/.test(src("src/city/FunnelOverlay.jsx")), "the card carries BUY THE REAL ONE and the virtual copy, both under the shop's campaign");

console.log(`check-npcshop: ${n - failed}/${n} passed. Stocked: ${stocked.map(x => x.join(":")).join(", ")}. Not stocked right now: ${skipped.join(", ")}.`);
if (failed) { console.log(`${failed} FAILED`); process.exit(1); }
