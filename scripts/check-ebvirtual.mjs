// THE EB SHOP's VIRTUAL COPIES and CLAIM A REAL PURCHASE (docs/design/ECONOMY_PROPERTY.md, "The EB
// SHOP's virtual copies"): the category mapping (jerseys, hats, DVDs, memorabilia, the rest), the
// CYCLES tiers (sane on the ladder, and never proportional to dollars), the photo's colours (a real
// PNG decoded here), the SKU carrying the look (a jersey's colours and number reach the avatar), a
// copy bought through /api/shops debits once and burns, a made-up SKU is refused, a sold listing
// stays for sale; and /api/eb-claim against a mocked Shopify Admin API: a paid order with the right
// email grants once, marked OWNED IN REAL LIFE, the wrong email / an unpaid / a cancelled / a test
// order is refused, a second claim is refused, the ledger keeps hashes only (no email, no order
// number), the purge keeps the claim spent, and with no Shopify settings every claim is CLOSED.
// Test files only (HVI-EBVTEST*); never Scott's case. No network: fetch is mocked.
// Run: node scripts/check-ebvirtual.mjs
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { deflateSync } from "node:zlib";
import { readFileSync, readdirSync } from "node:fs";

globalThis.__blobs = new Map();
const blobsSrc = `
let n = 0;
export function getStore({ name }) {
  const m = globalThis.__blobs;
  if (!m.has(name)) m.set(name, new Map());
  const s = m.get(name);
  const read = k => (s.has(k) ? JSON.parse(JSON.stringify(s.get(k).data)) : null);
  return {
    async get(k) { return read(k); },
    async getWithMetadata(k) { return s.has(k) ? { data: read(k), etag: s.get(k).etag, metadata: {} } : null; },
    async setJSON(k, v, o = {}) {
      if (o.onlyIfNew && s.has(k)) return { modified: false };
      if (o.onlyIfMatch && (!s.has(k) || s.get(k).etag !== o.onlyIfMatch)) return { modified: false };
      const etag = "e" + ++n; s.set(k, { data: JSON.parse(JSON.stringify(v)), etag }); return { modified: true, etag };
    },
    async delete(k) { s.delete(k); },
    list({ prefix = "" } = {}) { return Promise.resolve({ blobs: [...s.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }); },
  };
}`;
registerHooks({ resolve(spec, ctx, next) { return spec === "@netlify/blobs" ? { url: "data:text/javascript," + encodeURIComponent(blobsSrc), shortCircuit: true } : next(spec, ctx); } });
const __err = console.error; const logged = [];
console.error = console.warn = console.log2 = (...a) => { logged.push(a.map(String).join(" ")); if (process.env.DEBUG_CHECK) __err(...a); };
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "HVI_ECONOMY_BACKEND", "SHOPIFY_STORE_DOMAIN", "SHOPIFY_ADMIN_TOKEN", "SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"]) delete process.env[k];

let checks = 0;
const ok = (c, m) => { checks++; assert.ok(c, m); };
const eq = (a, b, m) => { checks++; assert.deepEqual(a, b, m); };

// ---- a product photo: a jersey (blue, red trim) on a white wall, as a real PNG -------------------
function png(w, h, f) {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = y % 5; for (let x = 0; x < w; x++) { const [r, g, b] = f(x, y); const i = y * (w * 3 + 1) + 1 + x * 3; raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; } }
  // the filter byte says 0..4 but the bytes are raw: re-encode each row with its filter so the decoder must undo them
  const out = Buffer.alloc(raw.length), stride = w * 3;
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)], o = y * (stride + 1);
    out[o] = ft;
    for (let x = 0; x < stride; x++) {
      const cur = raw[o + 1 + x], a = x >= 3 ? raw[o + 1 + x - 3] : 0, up = y ? raw[o - (stride + 1) + 1 + x] : 0, ul = y && x >= 3 ? raw[o - (stride + 1) + 1 + x - 3] : 0;
      let pred = 0;
      if (ft === 1) pred = a; else if (ft === 2) pred = up; else if (ft === 3) pred = (a + up) >> 1;
      else if (ft === 4) { const p = a + up - ul, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - ul); pred = pa <= pb && pa <= pc ? a : pb <= pc ? up : ul; }
      out[o + 1 + x] = (cur - pred) & 255;
    }
  }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); return Buffer.concat([len, Buffer.from(type, "latin1"), data, Buffer.alloc(4)]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(out)), chunk("IEND", Buffer.alloc(0))]);
}
const BLUE = [29, 66, 138], RED = [200, 16, 46], WHITE = [236, 236, 230];
const jerseyPng = png(32, 32, (x, y) => (x < 6 || x > 25 || y < 3 ? WHITE : (y > 12 && y < 18) || x === 6 || x === 25 ? RED : BLUE));
const dvdPng = png(32, 32, (x, y) => (x < 4 || x > 27 ? [250, 250, 250] : y < 20 ? [20, 20, 24] : [230, 180, 40]));

// ---- the mocked network: the storefront, Shopify's CDN, the Admin API ------------------------------
const SHOP = "https://shop.electricbasement.tv";
const prod = (handle, title, type, price, available = true, tags = []) => ({ handle, title, product_type: type, tags, vendor: "EBShop", published_at: "2026-09-01", variants: [{ price, available }], images: [{ src: `https://cdn.shopify.com/s/files/${handle}.jpg?v=1` }] });
let PRODUCTS = [
  prod("champion-vintage-detroit-pistons-nba-basketball-jersey", "Champion - Vintage Detroit Pistons NBA Basketball Jersey", "Clothing / Accessories", "85.00"),
  prod("nike-boys-philadelphia-76ers-jersey", "Nike - Boys Philadelphia 76ers Jersey", "Clothing / Accessories", "18.00"),
  prod("common-hype-x-nascar-phoenix-raceway-hat", "Common Hype x NASCAR Phoenix Raceway Hat", "Hats", "45.00"),
  prod("diner-dvd", "Diner (DVD)", "Movies", "5.00"),
  prod("lightning-swords-of-death-dvd", "Lightning Swords of Death (DVD)", "Movies", "10.00"),
  prod("darick-hall-phillies-autographed-helmet", "Darick Hall Philadelphia Phillies Autographed Helmet", "Autographed Helmets", "39.00"),
  prod("percy-robot-cat", "Percy Robot Cat - Interactive Emotional Support Pet", "Toys", "60.00"),
  prod("ebshop-logo-t-shirt", "EBShop Logo T-Shirt", "T-Shirt", "24.00", true, ["number:7"]),
];
let ORDERS = [];
const adminCalls = [];
let adminDown = false;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const J = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (u.startsWith(`${SHOP}/products.json`)) return J(200, { products: new URL(u).searchParams.get("page") === "1" ? PRODUCTS : [] });
  if (u.startsWith("https://cdn.shopify.com/")) {
    ok(/format=png/.test(u) && /width=32/.test(u), "the photo is read small, as PNG");
    return new Response(/jersey|hat|shirt/.test(u) ? jerseyPng : dvdPng, { status: 200, headers: { "content-type": "image/png" } });
  }
  if (/^https:\/\/eb-test\.myshopify\.com\/admin\/oauth\/access_token$/.test(u)) return J(200, { access_token: "shpat_from_client_credentials", scope: "read_orders,read_products", expires_in: 86399 });
  if (/^https:\/\/eb-test\.myshopify\.com\/admin\/api\/[\d-]+\/graphql\.json$/.test(u)) {
    adminCalls.push({ token: opts.headers?.["X-Shopify-Access-Token"], body: JSON.parse(opts.body) });
    if (adminDown) return J(502, {});
    if (opts.headers?.["X-Shopify-Access-Token"] === "bad") return J(401, { errors: "Invalid API key or access token" });
    const q = JSON.parse(opts.body).variables.q.replace(/^name:/, "");
    return J(200, { data: { orders: { nodes: ORDERS.filter(o => o.name.replace("#", "").toUpperCase().includes(q)) } } });
  }
  throw new Error(`unexpected fetch ${u}`);
};

const EV = await import("../src/economy/ebvirtual.js");
const SH = await import("../src/economy/shops.js");
const WR = await import("../src/wear.js");
const AV = await import("../src/avatar.js");
const FURN = await import("../src/city/furniture.js");
const LV = await import("../netlify/lib/ebvirtual.js");
const LC = await import("../netlify/lib/ebclaim.js");
const DB = await import("../netlify/lib/economy-db.js");
const shopsFn = (await import("../netlify/functions/shops.js")).default;
const catFn = (await import("../netlify/functions/eb-virtual.js")).default;
const claimFn = (await import("../netlify/functions/eb-claim.js")).default;
const purge = (await import("../netlify/functions/purge.js")).default;

// ==== THE CATEGORIES ===========================================================================
{
  const c = (type, title) => EV.categorize({ type, title });
  eq(c("Clothing / Accessories", "Champion - Vintage Detroit Pistons NBA Basketball Jersey"), { cat: "wear", shape: "jersey" }, "a jersey is worn, as a jersey");
  eq(c("Clothing / Accessories", "Champion - Men's Blue Classic Jersey Dip Dye T-Shirt"), { cat: "wear", shape: "tee" }, "a jersey-knit T-shirt is a tee");
  eq(c("Hats", "Common Hype x NASCAR Phoenix Raceway Hat"), { cat: "wear", shape: "cap" }, "a hat is headwear");
  eq(c("", "Servant Premium Snapback - Cream/Black"), { cat: "wear", shape: "cap" }, "a snapback with no type is still a cap");
  eq(c("Clothing / Accessories", "Nike - Youth Black and Gray Crew Neck Sweatshirt"), { cat: "wear", shape: "hoodie" }, "a sweatshirt");
  eq(c("Clothing / Accessories", "Weatherproof Men's Jacket"), { cat: "wear", shape: "jacket" }, "a jacket is outerwear");
  eq(c("T-Shirt", "EBShop Logo T-Shirt"), { cat: "wear", shape: "tee" }, "the shop's own tee");
  eq(c("Necklace", "AAA Freshwater Pearl Strand"), { cat: "wear", shape: "chain" }, "a necklace is worn");
  for (const [type, title] of [["Movies", "Diner (DVD)"], ["Movies/TV", "Bambi"], ["Video Games", "Halo 3"], ["Vinyl", "Yes - Fragile"], ["Board Game", "Zounds"], ["Playing Cards", "Art of Play Deck"], ["", "Some VHS tape"]]) eq(c(type, title).form, "shelf", `${type || title}: on the shelf`);
  for (const [type, title] of [["Autographed Mini-Helmets", "Signed helmet"], ["Autographed Pucks", "Puck"], ["Framed Wrestling Photos", "Photo"], ["Home Decor", "Poster"]]) eq(c(type, title).form, "frame", `${type}: framed, on the wall`);
  for (const [type, title] of [["Toys", "Nee-Doh"], ["Mug", "EB Mug"], ["Dice", "D20 set"], ["Electronics", "Speaker"], ["", "Medium Macchiato Journal"]]) eq(c(type, title).form, "desk", `${type || title}: a desk object`);
  eq(c("Movies", "The Jersey Boys (DVD)").form, "shelf", "a film about New Jersey is still a film");
  eq(EV.numberOf({ title: "Allen Iverson #3 Sixers Jersey" }), "3", "the number from the title");
  eq(EV.numberOf({ title: "Sixers Jersey", tags: ["number:20"] }), "20", "the number from a tag");
  eq(EV.numberOf({ title: "Grant Hill Pistons jersey" }), "33", "the number from the player");
  eq(EV.numberOf({ title: "Pistons jersey" }, LV.OVERRIDES["champion-vintage-detroit-pistons-nba-basketball-jersey"]), "33", "the Pistons jersey is Grant Hill's 33");
}

// ==== THE PRICES: by category, never by dollars ==================================================
{
  for (const [shape, p] of Object.entries(EV.WEAR_TIER)) {
    ok(Object.values(WR.SHAPES).some(l => l.includes(shape)), `${shape}: a shape the avatar draws`);
    ok(Number.isInteger(p) && p >= SH.PRICE_MIN && p < 9_000, `${shape}: ${p} is on the ladder, under an OUTER flat`);
  }
  for (const l of Object.values(WR.SHAPES)) for (const shape of l) ok(EV.WEAR_TIER[shape], `every shape has a tier: ${shape}`);
  for (const [form, p] of Object.entries(EV.FORM_TIER)) ok(Number.isInteger(p) && p >= SH.PRICE_MIN && p <= SH.PRICE_MAX, `${form}: ${p}`);
  ok(EV.WEAR_TIER.jersey > EV.WEAR_TIER.tee && EV.WEAR_TIER.cap < EV.WEAR_TIER.tee, "a jersey above a tee, a cap below");
  ok(EV.FORM_TIER.shelf < EV.FORM_TIER.desk && EV.FORM_TIER.desk < EV.FORM_TIER.frame, "a DVD < a desk object < framed memorabilia");
  ok(Math.max(...Object.values(EV.WEAR_TIER)) <= SH.CLOTHES["b-blazer"][2], "no copy dearer than the boutique blazer");
  // no dollars in: the price function takes no price, and the same category is one price whatever the dollars
  eq(EV.tierPrice.length, 1, "tierPrice takes the category only");
  ok(!/price|\$|dollar/i.test(String(EV.tierPrice).replace(/tierPrice|WEAR_TIER|FORM_TIER/g, "")), "tierPrice reads no dollar price");
  const rows = PRODUCTS.map(p => ({ usd: Number(p.variants[0].price), cyc: EV.tierPrice(EV.categorize({ type: p.product_type, title: p.title })) }));
  const dvd = rows.filter((_, i) => PRODUCTS[i].product_type === "Movies");
  eq(new Set(dvd.map(r => r.cyc)).size, 1, "a $5 DVD and a $10 DVD cost the same CYCLES");
  const jer = rows.slice(0, 2);
  ok(jer[0].usd / jer[1].usd > 4 && jer[0].cyc === jer[1].cyc, "an $85 jersey and an $18 jersey cost the same CYCLES");
  const ratios = new Set(rows.map(r => Math.round((r.cyc / r.usd) * 100)));
  ok(ratios.size > 3, "no single CYCLES-per-dollar ratio across the catalog (no implied exchange rate)");
  const src = readFileSync(new URL("../src/economy/ebvirtual.js", import.meta.url), "utf8") + readFileSync(new URL("../netlify/lib/ebvirtual.js", import.meta.url), "utf8");
  ok(!/variants[^\n]*price|priceOf|\.usd|dollars?\s*\*/.test(src), "the copy's code never reads a variant's dollar price");
}

// ==== THE PHOTO, THE SKU, THE LOOK ===============================================================
{
  const img = LV.decodePng(jerseyPng);
  ok(img && img.w === 32 && img.h === 32, "the PNG decodes (all five row filters)");
  eq([...img.rgb.slice((10 * 32 + 10) * 3, (10 * 32 + 10) * 3 + 3)], BLUE, "a pixel reads back exactly");
  const look = LV.dominantColours(img);
  eq(look, { main: "1d428a", detail: "c8102e" }, "the jersey's colours: blue, then the red trim (the white wall ignored)");
  eq(LV.dominantColours(LV.decodePng(dvdPng)).main, "141418", "a DVD's dark cover");
  eq(LV.decodePng(Buffer.from("not a png")), null, "not a PNG: null, not a crash");
  const sku = EV.skuOf("champion-vintage-detroit-pistons-nba-basketball-jersey", { cat: "wear", shape: "jersey" }, { ...look, number: "33" });
  ok(/^w:v-[0-9a-f]{8}\.jersey-1d428a-c8102e-33$/.test(sku) && sku.length <= 50, `the jersey's SKU carries its look: ${sku}`);
  ok(/^(w|f):[a-z0-9.-]{2,48}$/.test(sku), "it fits the ledger's item pattern");
  const it = SH.itemOf(sku);
  ok(it.virtual && it.kind === "wear" && it.slot === "top" && it.price === EV.WEAR_TIER.jersey, "itemOf: a virtual top at the jersey tier");
  ok(SH.onSale(sku, 617) && SH.onSale(sku, 617 + 1800 * 2), "a copy is on sale every season");
  eq(SH.itemOf("w:v-zzzzzzzz.jersey-1d428a-c8102e-33"), null, "a malformed copy is no item");
  eq(SH.itemOf("w:v-12345678.cape-1d428a-c8102e"), null, "a shape the avatar does not draw is no item");
  eq(SH.itemOf("f:v-12345678.jersey-1d428a-c8102e"), null, "a garment is not furniture");
  eq(SH.itemOf("w:v-12345678.cap-1d428a-c8102e-33"), null, "only a jersey wears a number");
  // the jersey renders: on the body, in the clothes layer, blue with red trim and a red 33
  for (const build of ["slim", "average", "broad"]) for (const fr of [0, 1]) {
    const spec = { ...AV.DEFAULT_SPEC, build, wear_top: sku.slice(2) };
    eq(AV.sanitizeSpec(spec).wear_top, sku.slice(2), `the jersey survives sanitizing (${build})`);
    const pal = AV.avatarPalette(spec), px = AV.avatarPixels(spec, fr);
    eq(pal[AV.AX.TOP], BLUE, "the jersey's body is its colour");
    eq(pal[AV.AX.TRIM], RED, "the trim is the second colour");
    const chest = []; for (let y = 20; y < 25; y++) for (let x = 10; x < 22; x++) chest.push(px[y * 32 + x]);
    ok(chest.filter(i => i === AV.AX.TRIM).length >= 14, `the number 33 is on the chest (${build}, frame ${fr})`);
    ok(AV.avatarLayers(spec, fr).find(l => l.name === "clothes").px.some(i => i === AV.AX.TRIM), "drawn in the clothes layer");
  }
  const no = AV.avatarPixels({ ...AV.DEFAULT_SPEC, wear_top: sku.slice(2).replace(/-33$/, "") }, 0);
  const yes = AV.avatarPixels({ ...AV.DEFAULT_SPEC, wear_top: sku.slice(2) }, 0);
  ok([...yes].some((v, i) => v !== no[i]), "the number changes the figure");
  const cap = EV.skuOf("common-hype-x-nascar-phoenix-raceway-hat", { cat: "wear", shape: "cap" }, { main: "18181a", detail: "d4cac9" });
  const capSpec = { ...AV.DEFAULT_SPEC, wear_head: cap.slice(2) };
  ok(AV.avatarLayers(capSpec, 0).find(l => l.name === "accessories").px.some(i => i === AV.AX.HAT), "the hat renders, over the hair");
  eq(AV.avatarPalette(capSpec)[AV.AX.HAT], [0x18, 0x18, 0x1a], "in its own colour");
  // furniture copies: a piece the cutaway can draw, in rooms that take it
  const dvd = EV.skuOf("diner-dvd", { cat: "furn", form: "shelf" }, { main: "141418", detail: "e6b428" });
  const pc = FURN.pieceOf(dvd.slice(2));
  ok(pc && pc.eb && !pc.wall && pc.footprint.h > 10, "a DVD copy is a media shelf");
  ok(FURN.pieceOf(EV.skuOf("x", { cat: "furn", form: "frame" }, { main: "111111", detail: "222222" }).slice(2)).wall, "memorabilia hangs on the wall");
  const calls = []; const ctx = { set fillStyle(v) { calls.push(v); }, fillRect() { calls.push("r"); }, drawImage() { calls.push("img"); }, imageSmoothingEnabled: true };
  FURN.drawItem(ctx, dvd.slice(2), 50, 100, 2, {});
  ok(calls.includes("#141418") && calls.filter(c => c === "r").length > 6, "the shelf draws, its cover in the copy's colours");
  ok(SH.placeable(SH.itemOf(dvd), "a:L1:A:living", "a:L1:A") && !SH.placeable(SH.itemOf(dvd), "a:L1:A:bath", "a:L1:A"), "a shelf goes in the living room, not the bathroom");
  const look2 = SH.furnishLook({ rooms: { "a:L1:A:living": { furniture: [] } } }, [{ room: "a:L1:A:living", spot: "f1", item: dvd.slice(2) }]);
  eq(look2.rooms["a:L1:A:living"].furniture[0].item, dvd.slice(2), "furnishLook lays the copy into the room");
}

// ==== THE CATALOG ==================================================================================
const HOST = "https://humanvalueindex.com";
let fake = Date.parse("2026-10-20T12:00:00Z");
Date.now = () => fake;
{
  const r = await catFn(new Request(HOST + "/api/eb-virtual"));
  const j = await r.json();
  eq(r.status, 200, "/api/eb-virtual answers");
  eq(j.items.length, PRODUCTS.length, "every listing has a copy");
  eq(j.claims, false, "claims are reported closed with no Shopify settings");
  const pist = j.items.find(i => i.handle === "champion-vintage-detroit-pistons-nba-basketball-jersey");
  ok(/\.jersey-1d428a-c8102e-33$/.test(pist.sku), "the Pistons copy: its colours from the photo and Grant Hill's 33");
  eq(pist.price, EV.WEAR_TIER.jersey, "priced at the jersey tier");
  ok(/\.cap-/.test(j.items.find(i => i.handle.includes("hat")).sku), "the hat is a cap");
  ok(/^f:v-[0-9a-f]{8}\.shelf-/.test(j.items.find(i => i.handle === "diner-dvd").sku), "the DVD is a shelf piece");
  ok(/\.frame-/.test(j.items.find(i => i.handle.includes("helmet")).sku), "the helmet is framed");
  ok(/\.desk-/.test(j.items.find(i => i.handle.includes("robot-cat")).sku), "the robot cat sits on a desk");
  ok(/\.tee-[0-9a-f]{6}-[0-9a-f]{6}$/.test(j.items.find(i => i.handle.includes("logo")).sku), "a tee wears no number, even tagged");
  ok(!JSON.stringify(j).includes("85.00") && !JSON.stringify(j).includes("variants"), "no dollar price in the copies' catalog");
  // the real one sells: the copy stays, marked
  PRODUCTS = PRODUCTS.map(p => (p.handle === "diner-dvd" ? { ...p, variants: [{ price: "5.00", available: false }] } : p)).filter(p => p.handle !== "lightning-swords-of-death-dvd");
  fake += LV.CATALOG_TTL + 1000;
  const j2 = await (await catFn(new Request(HOST + "/api/eb-virtual"))).json();
  eq(j2.items.length, 8, "a listing that leaves the shop keeps its copy");
  eq(j2.items.find(i => i.handle === "diner-dvd").live, false, "out of stock: THE REAL ONE HAS SOLD");
  eq(j2.items.find(i => i.handle === "lightning-swords-of-death-dvd").live, false, "gone from the shop: sold");
  eq(j2.items.find(i => i.handle === "diner-dvd").sku, j.items.find(i => i.handle === "diner-dvd").sku, "a copy's SKU never changes");
}

// ==== BUYING A COPY (/api/shops) ===================================================================
const req = (fn, path) => async (method, body, { ip = "192.0.2.40", origin = HOST, raw = null } = {}) => {
  const headers = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  const r = await fn(new Request(HOST + path + (method === "GET" ? body || "" : ""), method === "GET" ? { method, headers } : { method, headers, body: raw ?? JSON.stringify(body) }), { ip });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const shop = req(shopsFn, "/api/shops"), claim = req(claimFn, "/api/eb-claim");
const putCase = (id, rec) => { if (!globalThis.__blobs.has("hvi-cases")) globalThis.__blobs.set("hvi-cases", new Map()); globalThis.__blobs.get("hvi-cases").set(id, { data: rec, etag: "x" + id }); };
const clearLimits = () => globalThis.__blobs.get("hvi-limits")?.clear();
const hist = [{ at: "2026-09-01T10:00:00Z", score: 850, tier: "ESSENTIAL" }];
const T = "HVI-EBVTEST2", O = "HVI-EBVTEST3", NW = "HVI-EBVTESTN";
for (const id of [T, O, NW]) putCase(id, { history: hist, avatar: { kind: "procedural", spec: AV.DEFAULT_SPEC } });
const L = DB.memoryLedger();
globalThis.__econLedger = L;
const H = DB.caseHash;
for (const id of [T, O]) {
  await L.rpc("econ_enrol", { case_hash: H(id), vest_day: 0, exempt: true });
  await L.rpc("econ_post", { idem: `test-grant-${id}`, kind: "ubi", case_hash: H(id), legs: [{ account: "dept:treasury", amount: -5_000 }, { account: `cash:${H(id)}`, kind: "cash", amount: 5_000 }] });
}
const cash = (id) => L.db.accounts.get(`cash:${H(id)}`)?.balance ?? 0;
const burned = () => L.db.accounts.get("dept:burned").balance;
const inv = (label) => {
  const byTxn = new Map();
  for (const e of L.db.entries) byTxn.set(e.txn_id, (byTxn.get(e.txn_id) || 0) + e.amount);
  ok([...byTxn.values()].every(v => v === 0), `${label}: every txn sums to zero`);
  for (const a of L.db.accounts.values()) eq(a.balance, L.db.entries.filter(e => e.account === a.id).reduce((s, e) => s + e.amount, 0), `${label}: ${a.id} = its entries`);
};
const cat = (await (await catFn(new Request(HOST + "/api/eb-virtual"))).json()).items;
const skuOfH = (h) => cat.find(i => i.handle === h).sku;
const JER = skuOfH("champion-vintage-detroit-pistons-nba-basketball-jersey"), DVD = skuOfH("diner-dvd"), HAT = skuOfH("common-hype-x-nascar-phoenix-raceway-hat");
{
  const c0 = cash(T), b0 = burned();
  let r = await shop("POST", { caseId: T, action: "buy", sku: JER, nonce: "ebv-nonce-jer-1" });
  eq(r.status, 200, "buy the virtual jersey");
  eq(r.body.last.line, EV.EBV_LINES.bought, "the copy's own line");
  r = await shop("POST", { caseId: T, action: "buy", sku: JER, nonce: "ebv-nonce-jer-1" });
  eq(r.body.last.dup, true, "the same tap twice is one purchase");
  eq(cash(T), c0 - EV.WEAR_TIER.jersey, "debited exactly once, the jersey tier");
  eq(burned(), b0 + EV.WEAR_TIER.jersey, "the CYCLES are burned");
  r = await shop("POST", { caseId: T, action: "buy", sku: JER, nonce: "ebv-nonce-jer-2" });
  eq([r.status, r.body.error], [409, EV.EBV_LINES.owned], "one copy a file");
  eq(cash(T), c0 - EV.WEAR_TIER.jersey, "nothing moved");
  r = await shop("POST", { caseId: T, action: "buy", sku: DVD, nonce: "ebv-nonce-dvd-1" });
  eq(r.status, 200, "the real DVD has sold; the virtual one is still for sale");
  eq((await shop("POST", { caseId: T, action: "buy", sku: DVD, nonce: "ebv-nonce-dvd-2" })).body.error, EV.EBV_LINES.owned, "one virtual DVD a file");
  const fakeSku = JER.replace(/-33$/, "-99");
  r = await shop("POST", { caseId: T, action: "buy", sku: fakeSku, nonce: "ebv-nonce-fake" });
  eq([r.status, r.body.error], [400, EV.EBV_LINES.unknown], "a made-up copy (the right shape, a number of your choosing) is not stocked");
  r = await shop("POST", { caseId: T, action: "buy", sku: "w:v-00000000.jersey-ffffff-000000-1", nonce: "ebv-nonce-fake2" });
  eq(r.status, 400, "an unknown listing is not stocked");
  // wear it: the file photo carries the look
  r = await shop("POST", { caseId: T, action: "wear", outfit: { top: JER.slice(2) } });
  eq(r.status, 200, "wear the virtual jersey");
  eq(r.body.worn.top, JER.slice(2), "it is on the file photo");
  eq((await shop("POST", { caseId: O, action: "wear", outfit: { top: JER.slice(2) } })).status, 409, "a file that does not own it cannot wear it");
  const v = (await shop("GET", `?caseId=${T}`)).body;
  const mine = v.items.find(i => i.sku === JER);
  ok(mine.virtual && mine.name.includes("PISTONS") && mine.handle && mine.irl === false, "the view names the copy from the catalog; not yet owned in real life");
  // place the DVD in the flat
  const dv = v.items.find(i => i.sku === DVD);
  const flat = v.apartment?.flat;
  if (flat) {
    const room = flat.rooms.find(x => x.purpose === "living") || flat.rooms.find(x => dv.rooms.includes(x.purpose));
    eq((await shop("POST", { caseId: T, action: "place", itemId: dv.id, room: room.id, spot: "f3" })).status, 200, "the virtual DVD on its shelf, in the flat");
    const rooms = (await shop("GET", `?building=${v.apartment.building}`)).body.rooms;
    ok(rooms.some(x => x.item === DVD.slice(2)), "the building's public read shows the copy (no case in it)");
  }
  inv("after buying copies");
}

// ==== CLAIM A REAL PURCHASE (/api/eb-claim) =======================================================
const lineItem = (n, handle, qty = 1) => { const p = PRODUCTS.find(x => x.handle === handle) || { handle, title: handle, product_type: "Movies", tags: [] }; return { id: `gid://shopify/LineItem/${n}`, currentQuantity: qty, product: { handle, title: p.title, productType: p.product_type, tags: p.tags, featuredImage: { url: `https://cdn.shopify.com/s/files/${handle}.jpg?v=1` } } }; };
const order = (name, email, status, lines, extra = {}) => ({ id: `gid://shopify/Order/${name.replace("#", "")}0001`, name, email, test: false, cancelledAt: null, displayFinancialStatus: status, lineItems: { nodes: lines }, ...extra });
ORDERS = [
  order("#1042", "Buyer@Example.com", "PAID", [lineItem(1, "champion-vintage-detroit-pistons-nba-basketball-jersey"), lineItem(2, "common-hype-x-nascar-phoenix-raceway-hat"), lineItem(3, "the-sting-dvd")]),
  order("#1043", "late@example.com", "PENDING", [lineItem(4, "diner-dvd")]),
  order("#1044", "gone@example.com", "PAID", [lineItem(5, "diner-dvd")], { cancelledAt: "2026-10-01T00:00:00Z" }),
  order("#1045", "test@example.com", "PAID", [lineItem(6, "diner-dvd")], { test: true }),
  order("#1046", "refund@example.com", "PARTIALLY_REFUNDED", [lineItem(7, "diner-dvd", 0), lineItem(8, "percy-robot-cat")]),
  order("#1047", "noemail@example.com", "PAID", [lineItem(9, "diner-dvd")], { email: null }),
];
{
  clearLimits();
  let r = await claim("POST", { caseId: T, order: "#1042", email: "buyer@example.com" });
  eq([r.status, r.body.error], [503, LC.CLAIM_LINES.closed], "no Shopify settings: CLAIMS ARE NOT OPEN YET");
  eq(adminCalls.length, 0, "closed means Shopify is never asked");
  process.env.SHOPIFY_STORE_DOMAIN = "eb-test.myshopify.com";
  eq((await claim("POST", { caseId: T, order: "#1042", email: "buyer@example.com" })).status, 503, "a domain and no token: still closed");
  process.env.SHOPIFY_STORE_DOMAIN = "evil.example.com"; process.env.SHOPIFY_ADMIN_TOKEN = "shpat_test";
  eq((await claim("POST", { caseId: T, order: "#1042", email: "buyer@example.com" })).status, 503, "a domain that is not a myshopify.com store: closed");
  process.env.SHOPIFY_STORE_DOMAIN = "eb-test.myshopify.com";
  eq((await claim("POST", { caseId: T, order: "#1042", email: "buyer@example.com" }, { origin: "https://evil.example" })).status, 403, "another site cannot post a claim");
  eq((await claim("POST", { caseId: T, order: "#1042", email: "buyer@example.com" }, { origin: null })).status, 403, "no origin, no claim");
  eq((await claim("GET")).status, 405, "a claim is posted");
  eq((await claim("POST", { caseId: "HVI-KK", order: "#1042", email: "buyer@example.com" })).status, 400, "a case number is checked");
  eq((await claim("POST", { caseId: T, order: "#10 42; drop", email: "buyer@example.com" })).status, 400, "an order number is checked");
  eq((await claim("POST", { caseId: T, order: "#1042", email: "not-an-email" })).status, 400, "an email is checked");
  eq((await claim("POST", { caseId: "HVI-ZZZZZZZZ", order: "#1042", email: "buyer@example.com" })).status, 404, "a file must exist");
  clearLimits();
  // the wrong email: refused, the same words as no such order
  r = await claim("POST", { caseId: T, order: "#1042", email: "someone@else.com" });
  eq([r.status, r.body.error], [404, LC.CLAIM_LINES.nomatch], "the wrong email is refused");
  eq((await claim("POST", { caseId: T, order: "#9999", email: "buyer@example.com" })).body.error, LC.CLAIM_LINES.nomatch, "no such order: the same answer");
  eq((await claim("POST", { caseId: T, order: "#1043", email: "late@example.com" })).body.code, "unpaid", "an unpaid order is refused");
  eq((await claim("POST", { caseId: T, order: "#1044", email: "gone@example.com" })).body.code, "unpaid", "a cancelled order is refused");
  eq((await claim("POST", { caseId: T, order: "#1045", email: "test@example.com" })).body.code, "unpaid", "a test order is refused");
  r = await claim("POST", { caseId: T, order: "#1047", email: "noemail@example.com" });
  eq([r.status, r.body.error], [503, LC.CLAIM_LINES.noemail], "an app that cannot read emails: closed, not a guess");
  eq(L.db.irlClaims.size, 0, "nothing claimed yet");
  clearLimits();
  // the right one: three lines; the jersey already bought, the hat new, a DVD the catalog never saw
  const c0 = cash(T), b0 = burned(), n0 = L.db.items.filter(i => i.case_hash === H(T)).length;
  r = await claim("POST", { caseId: T, order: " 1042 ", email: "  BUYER@example.COM " });
  eq(r.status, 200, "a paid order with its email (any case, any spaces, with or without #) is claimed");
  eq(r.body.granted.length, 3, "every line's copy granted");
  eq(cash(T), c0, "a claim costs no CYCLES");
  eq(burned(), b0, "and burns none");
  const mine = L.db.items.filter(i => i.case_hash === H(T));
  eq(mine.length, n0 + 2, "the jersey already owned is marked, not doubled; the hat and the DVD are new");
  ok(mine.find(i => i.sku === JER).irl && mine.find(i => i.sku === HAT).irl, "OWNED IN REAL LIFE");
  ok(mine.some(i => /^f:v-[0-9a-f]{8}\.shelf-/.test(i.sku) && i.irl), "a listing the catalog had not seen is copied on the spot (read_products)");
  ok(!mine.find(i => i.sku === DVD).irl, "a copy bought, not claimed, carries no badge");
  const v = (await shop("GET", `?caseId=${T}`)).body;
  ok(v.items.find(i => i.sku === HAT).irl === true, "the view carries the badge");
  // a second claim of the same order: refused, by anyone
  r = await claim("POST", { caseId: T, order: "#1042", email: "buyer@example.com" });
  eq([r.status, r.body.code], [409, "already"], "a double claim is refused");
  r = await claim("POST", { caseId: O, order: "#1042", email: "buyer@example.com" });
  eq([r.status, r.body.code], [409, "already"], "another file cannot claim it either");
  eq(L.db.items.filter(i => i.case_hash === H(O)).length, 0, "nothing went to the other file");
  // a partly refunded order: only the line still bought
  clearLimits();
  r = await claim("POST", { caseId: O, order: "#1046", email: "refund@example.com" });
  eq(r.status, 200, "a partly refunded order");
  eq(r.body.granted.length, 1, "only the line not refunded");
  // no wallet
  r = await claim("POST", { caseId: NW, order: "#1045", email: "test@example.com" });
  ok(r.status === 409, "a test order is refused before the wallet is asked");
  // what the ledger keeps: hashes only
  const dump = JSON.stringify([...L.db.irlClaims.values()]) + JSON.stringify(L.db.txns) + JSON.stringify([...globalThis.__blobs.entries()].map(([k, m]) => [k, [...m.entries()]]));
  for (const pii of ["buyer@example.com", "BUYER@", "refund@example.com", "1042", "1046", "gid://shopify/Order"]) ok(!dump.toLowerCase().includes(pii.toLowerCase()), `nothing stored holds "${pii}"`);
  for (const c of L.db.irlClaims.values()) ok(/^[0-9a-f]{32}$/.test(c.order_hash) && /^[0-9a-f]{32}$/.test(c.line_hash) && /^[0-9a-f]{32}$/.test(c.email_hash), "the claim keeps 32-hex hashes");
  ok(!logged.join("\n").toLowerCase().includes("example.com") && !logged.join("\n").includes("1042"), "no email or order number in the logs");
  ok(LC.sameHash(LC.emailHash(" A@B.co "), LC.emailHash("a@b.co")) && !LC.sameHash(LC.emailHash("a@b.co"), LC.emailHash("a@b.com")), "the email compare (constant time, normalised)");
  // the rate limit
  clearLimits();
  let last = null;
  for (let k = 0; k <= (await import("../netlify/functions/eb-claim.js")).CLAIM_CASE_PER_HOUR; k++) last = await claim("POST", { caseId: O, order: "#9998", email: "x@example.com" }, { ip: `192.0.2.${100 + k}` });
  eq(last.status, 429, "claims per file per hour are capped");
  clearLimits();
  for (let k = 0; k <= 12; k++) last = await claim("POST", { caseId: k % 2 ? O : T, order: "#9997", email: "x@example.com" }, { ip: "192.0.2.77" });
  eq(last.status, 429, "claims per address are capped");
  // Shopify trouble: nothing claimed, said plainly
  clearLimits();
  adminDown = true;
  eq((await claim("POST", { caseId: O, order: "#1042", email: "buyer@example.com" })).status, 503, "Shopify down: 503, nothing claimed");
  adminDown = false;
  process.env.SHOPIFY_ADMIN_TOKEN = "bad";
  eq((await claim("POST", { caseId: O, order: "#1042", email: "buyer@example.com" })).body.error, LC.CLAIM_LINES.closed, "a revoked token: closed");
  // the Dev Dashboard's client credentials work in place of a static token
  delete process.env.SHOPIFY_ADMIN_TOKEN;
  process.env.SHOPIFY_CLIENT_ID = "cid"; process.env.SHOPIFY_CLIENT_SECRET = "csecret";
  LC.resetTokenCache();
  r = await claim("POST", { caseId: O, order: "#1042", email: "buyer@example.com" });
  eq(r.body.code, "already", "client credentials: the claim reaches Shopify (and the order is spent)");
  eq(adminCalls[adminCalls.length - 1].token, "shpat_from_client_credentials", "with the exchanged token");
  ok(adminCalls.every(c => /orders\(first: 5, query: \$q\)/.test(c.body.query) && /^name:[A-Z0-9-]+$/.test(c.body.variables.q)), "the order is looked up by name, as a variable, never spliced into the query");
  inv("after claims");
  // the purge: the file's copies go; the order stays spent
  const pr = await purge(new Request(HOST + "/api/purge", { method: "POST", headers: { "content-type": "application/json", origin: HOST }, body: JSON.stringify({ caseId: T, confirm: T }) }), { ip: "192.0.2.99" }).catch(() => null);
  if (!pr || pr.status !== 200) await DB.purgeLedger(T);
  eq(L.db.items.filter(i => i.case_hash === H(T)).length, 0, "purge: the copies go with the file");
  ok([...L.db.irlClaims.values()].filter(c => c.order_hash).length >= 3 && [...L.db.irlClaims.values()].every(c => c.case_hash !== H(T)), "purge: the claims keep their hashes, lose the case");
  clearLimits();
  putCase(T, { history: hist });
  await L.rpc("econ_enrol", { case_hash: H(T), vest_day: 0, exempt: true });
  eq((await claim("POST", { caseId: T, order: "#1042", email: "buyer@example.com" })).body.code, "already", "a purged and re-made file cannot claim the order again");
  inv("after purge");
}

// ==== THE LEDGER'S SQL ============================================================================
{
  const mig = readdirSync(new URL("../supabase/migrations/", import.meta.url)).find(f => /eb_virtual/.test(f));
  ok(mig, "the migration exists");
  const sql = readFileSync(new URL(`../supabase/migrations/${mig}`, import.meta.url), "utf8").split("\n").filter(l => !/^\s*--/.test(l)).join("\n");
  ok(/enable row level security/.test(sql) && !/grant[^;]*to (anon|authenticated)/i.test(sql), "RLS on, no grant to the browser");
  ok(/primary key \(order_hash, line_hash\)/.test(sql), "a line is claimed once, by the database itself");
  ok(!/email\s+text(?!_)/.test(sql.replace(/email_hash/g, "")) && !/order_name|order_number/.test(sql), "no email or order number column");
  ok(!/econ_entries/.test(sql.split("econ_irl_claim")[1].split("end $$")[0]), "a claim moves no CYCLES");
  const src = ["netlify/lib/ebclaim.js", "netlify/functions/eb-claim.js"].map(f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8")).join("\n");
  ok(!/console\.(log|error|warn)\([^)]*(email|order|body)/i.test(src), "the claim code never logs the email or the order");
  ok(/timingSafeEqual/.test(src), "hash compares are constant-time");
}

console.log(`check-ebvirtual: ${checks} checks passed`);
