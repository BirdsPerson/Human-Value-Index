// THE SHOPS, slice 1: the catalog and its prices (every garment drawn, every price on the ladder,
// every store stocked in every season), the avatar's layers (every catalog piece renders, a bare
// spec renders exactly as before the wardrobe existed, a stray key is dropped), and /api/shops end
// to end on in-memory Blobs and the in-memory ledger: a purchase debits exactly once per
// idempotency key (a double click, a race), CYCLES are burned (dept:burned), the ledger's
// invariants hold after every step, insufficient funds / no wallet / off-season / unowned are
// refused, one of each garment and three of a piece, outfits worn onto the file photo and its pen
// card, saved to the closet, furniture placed only in the case's own flat, in a room that takes it,
// on a free spot, the public building read carries no case, the purge takes everything, and there
// is no gift / resale / transfer path. Published plans: the shops add no place and nothing they
// own reaches a plan (the effects wait for EFFECTS_FROM_DAY). HVI_ECON_PG=1 also runs the ledger
// part against a real Postgres with the migrations applied (psql on PGHOST/PGPORT/PGUSER).
// Never uses a real case: the test files are HVI-SHOPTEST-style ids made up here.
// Run: node scripts/check-shops.mjs
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

globalThis.__blobs = new Map();
const blobsSrc = `
let n = 0;
export function getStore({ name }) {
  const m = globalThis.__blobs;
  if (!m.has(name)) m.set(name, new Map());
  const s = m.get(name);
  const read = k => (s.has(k) ? JSON.parse(JSON.stringify(s.get(k).data)) : null);
  const tick = () => new Promise(r => setImmediate(r));
  return {
    async get(k) { await tick(); return read(k); },
    async getWithMetadata(k) { await tick(); return s.has(k) ? { data: read(k), etag: s.get(k).etag, metadata: {} } : null; },
    async setJSON(k, v, o = {}) {
      await tick();
      if (o.onlyIfNew && s.has(k)) return { modified: false };
      if (o.onlyIfMatch && (!s.has(k) || s.get(k).etag !== o.onlyIfMatch)) return { modified: false };
      const etag = "e" + ++n; s.set(k, { data: JSON.parse(JSON.stringify(v)), etag }); return { modified: true, etag };
    },
    async delete(k) { s.delete(k); },
    list({ prefix = "", paginate = false } = {}) {
      const page = { blobs: [...s.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) };
      return paginate ? (async function* () { yield page; })() : Promise.resolve(page);
    },
  };
}`;
registerHooks({ resolve(spec, ctx, next) { return spec === "@netlify/blobs" ? { url: "data:text/javascript," + encodeURIComponent(blobsSrc), shortCircuit: true } : next(spec, ctx); } });
const __err = console.error; console.error = console.warn = (...a) => { if (process.env.DEBUG_CHECK) __err(...a); };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.HVI_ECONOMY_BACKEND;

const AV = await import("../src/avatar.js");
const WR = await import("../src/wear.js");
const SH = await import("../src/economy/shops.js");
const FURN = await import("../src/city/furniture.js");
const SIM = await import("../src/city/sim.js");
const { towerPlan, residentFlat } = await import("../src/city/tower.js");
const DB = await import("../netlify/lib/economy-db.js");
const E = await import("../netlify/lib/economy.js");
const LS = await import("../netlify/lib/shops.js");
const econ = (await import("../netlify/functions/economy.js")).default;
const shopsFn = (await import("../netlify/functions/shops.js")).default;
const F = await import("../netlify/functions/shops.js");
const purge = (await import("../netlify/functions/purge.js")).default;

let checks = 0;
const ok = (c, m) => { checks++; assert.ok(c, m); };
const eq = (a, b, m) => { checks++; assert.deepEqual(a, b, m); };

// ==== THE CATALOG AND THE PRICES ===============================================================
const OUTER_FLAT = 9_000, SAVE_DAY = 700;
{
  for (const id of Object.keys(WR.WEAR)) ok(SH.CLOTHES[id], `every garment drawn has a name, store and price: ${id}`);
  for (const id of Object.keys(SH.CLOTHES)) ok(WR.WEAR[id], `every garment for sale is drawn: ${id}`);
  for (const [id, w] of Object.entries(WR.WEAR)) {
    ok(WR.WEAR_SLOTS.includes(w[0]) && WR.SHAPES[w[0]].includes(w[1]), `${id}: a known slot and shape`);
    for (const [way, [a, b]] of Object.entries(w[2])) ok(/^[a-z]+$/.test(way) && /^#[0-9a-f]{6}$/.test(a) && /^#[0-9a-f]{6}$/.test(b), `${id}.${way}: colours`);
    if (w[3]) ok(WR.MARKS[w[3]], `${id}: its mark exists`);
  }
  for (const [id, c] of Object.entries(SH.CLOTHES)) {
    ok(SH.storeOf(c[1])?.kind === "clothes", `${id}: sold in a clothes store`);
    ok(Number.isInteger(c[2]) && c[2] >= SH.PRICE_MIN && c[2] < OUTER_FLAT, `${id}: ${c[2]} is on the ladder, under an OUTER flat`);
    ok(c[3] === null || (Array.isArray(c[3]) && c[3].every(s => SH.COLLECTIONS.includes(s))), `${id}: its seasons are the city's`);
  }
  for (const [id, p] of Object.entries(SH.FURNITURE_PRICES)) {
    ok(FURN.CATALOG[id], `furniture for sale is in the catalog: ${id}`);
    ok(Number.isInteger(p) && p >= SH.PRICE_MIN && p <= SH.PRICE_MAX, `${id}: ${p} within ${SH.PRICE_MIN}..${SH.PRICE_MAX}`);
    ok(FURN.CATALOG[id].rooms.some(r => ["bedroom", "kitchen", "living", "bath", "study"].includes(r)), `${id}: stands in a flat's room`);
  }
  for (const id of ["mailboxes", "reception", "cooler", "rack", "till", "bar", "stool", "safe", "mounted-fish"]) ok(!SH.FURNITURE_PRICES[id], `${id} is not for sale`);
  const sections = SH.FURN_SECTIONS.flatMap(([, ids]) => ids);
  eq([...sections].sort(), Object.keys(SH.FURNITURE_PRICES).filter(id => !SH.UPGRADE_ONLY.has(id)).sort(), "EASTGATE HOME shows every piece sold outright, once");
  // the upgrade chains: each tier dearer than the last, the price the difference plus the fee, the tops whole rooms or corners
  for (const [from, to] of Object.entries(SH.UPGRADES)) {
    ok(FURN.CATALOG[from] && FURN.CATALOG[to] && SH.FURNITURE_PRICES[to] > SH.FURNITURE_PRICES[from], `${from} -> ${to}: a dearer tier`);
    const u = SH.upgradeOf(from), diff = SH.FURNITURE_PRICES[to] - SH.FURNITURE_PRICES[from];
    eq(u.price, diff + Math.max(100, Math.round(diff * 0.05)), `${from} -> ${to}: the difference and the fee`);
    ok(!SH.onSale(`f:${to}`, 617), `${to} is reached only by upgrade`);
  }
  eq(SH.chainOf("arcade"), ["arcade", "golf-cabinet", "golf-sim"], "the cabinet -> the bar-top golf cabinet -> the simulator");
  eq(SH.chainOf("tv"), ["tv", "ebtv-big", "home-theater"], "the TV -> the EBTV big screen -> the home theater");
  eq(SH.chainOf("beer-tap"), ["beer-tap", "kegerator", "brewery"], "the tap -> Irene's kegerator -> the home brewery");
  eq(SH.upgradeOf("arcade").price, 6_300, "cabinet -> golf cabinet: +6,000 and the fee");
  eq(SH.upgradeOf("golf-cabinet").price, 26_250, "golf cabinet -> simulator: +25,000 and the fee");
  ok(FURN.CATALOG["golf-sim"].whole && FURN.CATALOG["golf-sim"].rooms.join() === "study,living", "the simulator takes a whole room: the study, or a living room given over to it");
  ok(FURN.CATALOG["home-theater"].whole, "the home theater takes a whole room");
  eq(SH.spotsFor(SH.itemOf("f:golf-sim")).map(s => s.id), ["f2"], "a whole-room piece stands in the middle");
  eq(SH.roomRule(SH.itemOf("f:golf-sim"), "x:L1:A:study", [{ room: "x:L1:A:study", spot: "f0", item: "plant" }]), "needs-room", "a whole-room piece needs an empty floor");
  eq(SH.roomRule(SH.itemOf("f:plant"), "x:L1:A:study", [{ room: "x:L1:A:study", spot: "f2", item: "golf-sim" }]), "room-given", "a room given over takes no other floor piece");
  eq(SH.roomRule(SH.itemOf("f:painting"), "x:L1:A:study", [{ room: "x:L1:A:study", spot: "f2", item: "golf-sim" }]), null, "the walls stay free");
  // playable at home: every target resolves (a game on the arcade's list, a route the app serves, the channel)
  const GAMES = JSON.parse(readFileSync(new URL("../src/city/arcade.json", import.meta.url), "utf8"));
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  for (const [id, p] of Object.entries(SH.PLAY_AT_HOME)) {
    ok(FURN.CATALOG[id] && p.label, `${id}: playable, labelled`);
    if (p.game) ok(GAMES.some(g => g.slug === p.game && g.status === "live" && g.play), `${id}: ${p.game} is a live game`);
    if (p.go) ok(app.includes(`"${p.go.split("?")[0]}"`), `${id}: ${p.go} is a route the app serves`);
    ok(p.game || p.go || p.ebtv, `${id}: resolves to something`);
  }
  ok(SH.PLAY_AT_HOME.arcade.game === "jetsam" && SH.PLAY_AT_HOME["golf-cabinet"].go.includes("preset=cabinet") && SH.PLAY_AT_HOME["golf-sim"].go.includes("preset=sim"), "the cabinet plays JETSAM!, the golf tiers their presets");
  const golf = readFileSync(new URL("../src/play/golf/Golf.jsx", import.meta.url), "utf8");
  ok(/preset/.test(golf), "#golf reads the home preset");
  eq(new Set(sections).size, sections.length, "no piece on two shelves");
  // the ladder: thrift < department < boutique; the examples Scott named
  const by = (tier) => Object.values(SH.CLOTHES).filter(c => SH.storeOf(c[1]).tier === tier).map(c => c[2]);
  const max = (a) => Math.max(...a), min = (a) => Math.min(...a), med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  ok(max(by("thrift")) < min(by("boutique")), "every thrift piece is cheaper than every boutique piece");
  ok(med(by("thrift")) < med(by("dept")) && med(by("dept")) < med(by("boutique")), "medians climb thrift < department < boutique");
  ok(SH.CLOTHES["t-tee"][2] <= SAVE_DAY / 4, "a thrift tee is a morning's saving");
  ok(SH.FURNITURE_PRICES.arcade >= 3_000 && SH.FURNITURE_PRICES.arcade <= 5_000, "the JETSAM! cabinet ~4,000");
  eq(SH.FURNITURE_PRICES["grand-piano"], 20_000, "the grand piano 20,000");
  ok(SH.CLOTHES["b-blazer"][2] === 5_000, "the boutique jacket 5,000");
  ok(Object.entries(SH.FURNITURE_PRICES).filter(([id, p]) => !SH.UPGRADE_ONLY.has(id) && p > OUTER_FLAT).length <= 2, "at most two pieces sold outright cost more than an OUTER flat");
  ok(SH.FURNITURE_PRICES["golf-sim"] <= 4 * 9_000, "the simulator, the top of a chain, under four OUTER flats");
  // every store stocked in every season; every garment on sale in some season
  for (const st of SH.STORES) for (let k = 0; k < 4; k++) {
    const md = 617 + k * 1800, col = SH.COLLECTIONS[(22 + k) % 4];
    eq(SH.collectionOf(md), col, `machine day ${md} is ${col}`);
    const rails = SH.stockOf(st.id, md);
    ok(rails.length >= 3 && rails.every(r => r.items.length > 0), `${st.id} is stocked in ${col}`);
    if (st.kind === "clothes") for (const slot of ["top", "bottom", "shoes"]) ok(rails.some(r => r.items.some(i => i.slot === slot)), `${st.id} sells ${slot} in ${col}`);
  }
  for (const sku of WR.allSkus()) ok(SH.COLLECTIONS.some((c, k) => SH.onSale(`w:${sku}`, 617 + k * 1800)), `${sku} is on sale some season`);
  eq(SH.collectionOf(617), "AUTUMN", "season 23 (2026-10-06) is AUTUMN");
  // the stores stand in rooms the city already has
  for (const st of SH.STORES) {
    ok(SIM.BUILDING[st.building] && SIM.PLACES[st.place] && SIM.BUILDING[st.building].districtId === st.district, `${st.id}: an existing building and place`);
    ok(SIM.BUILDING[st.building].places.includes(st.place), `${st.id}: the place is in the building`);
  }
  eq(SH.EFFECTS_FROM_DAY, null, "furniture's in-sim effects wait for a future boundary (cosmetic in slice 1)");
}

// ==== THE AVATAR'S LAYERS =====================================================================
{
  // a bare spec renders byte for byte as before the wardrobe (the hash of the old renderer, 4,080 frames)
  const E2 = AV.AVATAR_ENUMS, keys = (k) => (Array.isArray(E2[k]) ? E2[k] : Object.keys(E2[k]));
  const h = createHash("sha256");
  for (const hs of keys("hair_style")) for (const b of keys("build")) for (const f of keys("facial_hair")) for (const a of keys("accessory")) for (const fr of [0, 1])
    h.update(Buffer.from(AV.avatarPixels({ ...AV.DEFAULT_SPEC, hair_style: hs, build: b, facial_hair: f, accessory: a }, fr)));
  for (const t of keys("top_color")) h.update(JSON.stringify(AV.avatarPalette({ ...AV.DEFAULT_SPEC, top_color: t, bottom_color: t }).slice(0, 12)));
  eq(h.digest("hex"), "9c4a5b19c597e78da416bbc312d49143310db16670536d33a8568079d65018bd", "a spec with nothing worn renders exactly as before");
  const layers = AV.avatarLayers(AV.DEFAULT_SPEC, 0);
  eq(layers.map(l => l.name), ["body", "hair", "clothes", "accessories"], "the layers, separable and in order");
  // every catalog piece renders, on every build, both frames, and changes the figure
  const base = (b, fr) => { const p = AV.avatarPalette({ ...AV.DEFAULT_SPEC, build: b }); return [...AV.avatarPixels({ ...AV.DEFAULT_SPEC, build: b }, fr)].map(i => (p[i] || [-1]).join(",")).join(";"); };
  for (const sku of WR.allSkus()) {
    const w = WR.wearOf(sku);
    for (const build of ["slim", "average", "broad"]) for (const fr of [0, 1]) {
      const spec = { ...AV.DEFAULT_SPEC, build, [`wear_${w.slot}`]: sku };
      eq(AV.sanitizeSpec(spec)[`wear_${w.slot}`], sku, `${sku} survives sanitizing`);
      const pal = AV.avatarPalette(spec), px = AV.avatarPixels(spec, fr);
      ok([...px].every(i => i === 0 || Array.isArray(pal[i])), `${sku} (${build}): every pixel has a colour`);
      const drawn = [...px].map(i => (pal[i] || [-1]).join(",")).join(";");
      if (!(w.id === "t-jeans" && w.way === "denim")) ok(drawn !== base(build, fr), `${sku} (${build}) changes the figure`);
      ok(AV.avatarLayers(spec, fr).find(l => l.name === (w.slot === "head" || w.slot === "acc" ? "accessories" : "clothes")).px.some(Boolean), `${sku}: drawn in its own layer`);
    }
  }
  eq(AV.sanitizeSpec({ ...AV.DEFAULT_SPEC, wear_top: "t-jeans.denim" }).wear_top, undefined, "a garment in the wrong slot is dropped");
  eq(AV.sanitizeSpec({ ...AV.DEFAULT_SPEC, wear_top: "t-tee.gold" }).wear_top, undefined, "a colourway the garment does not come in is dropped");
  eq(AV.sanitizeSpec({ ...AV.DEFAULT_SPEC, wear_top: "<script>" }).wear_top, undefined, "free text is dropped");
  ok(AV.hasOutfit({ wear_head: "h-sams-cap.red" }) && !AV.hasOutfit(AV.DEFAULT_SPEC), "hasOutfit");
  // the outfit rules
  eq(SH.outfitKeys({ top: "t-tee.white", shoes: "d-hightops.red" }), { wear_top: "t-tee.white", wear_shoes: "d-hightops.red" }, "an outfit");
  eq(SH.outfitKeys({ top: "t-jeans.denim" }), null, "a piece in the wrong slot is not an outfit");
  eq(SH.outfitKeys({ cape: "t-tee.white" }), null, "no such slot");
  eq(SH.outfitKeys({ top: "t-tee.white" }, new Set(["w:t-tee.black"])), null, "an unowned piece is not an outfit");
}

// ==== /api/shops END TO END ======================================================================
const HOST = "https://humanvalueindex.com";
const req = (fn, path) => async (method, body, { ip = "192.0.2.20", q = "" } = {}) => {
  const r = await fn(new Request(HOST + path + q, method === "GET" ? { method, headers: { origin: HOST } } : { method, headers: { "content-type": "application/json", origin: HOST }, body: JSON.stringify(body) }), { ip });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const shop = req(shopsFn, "/api/shops"), money = req(econ, "/api/economy");
const cases = () => globalThis.__blobs.get("hvi-cases");
const putCase = (id, rec) => { if (!globalThis.__blobs.has("hvi-cases")) globalThis.__blobs.set("hvi-cases", new Map()); cases().set(id, { data: rec, etag: "x" + id }); };
const clearLimits = () => globalThis.__blobs.get("hvi-limits")?.clear();
let fake = Date.parse("2026-10-20T12:00:00Z");   // machine day ~1441: AUTUMN
Date.now = () => fake;
const md = SIM.machineClock(fake).day;
eq(SH.collectionOf(md), "AUTUMN", "the test runs in AUTUMN");

// test files only, made up here; two that share a flat (for the flatmate's spot)
const hist = [{ at: "2026-09-01T10:00:00Z", score: 850, tier: "ESSENTIAL" }];   // a top-band flat: five rooms, a study
const A32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
// a flat with a study (the spare room the simulator needs)
const flatOfId = (id) => { const f = E.apartmentOf(id, { history: hist })?.flat; return f && f.rooms.some(r => r.purpose === "study") ? f.id : null; };
let T = null, M = null;
const seen = new Map();
for (let i = 0; i < 40000 && !M; i++) {
  let n = i + 5 * 32 ** 7, s = "";
  for (let k = 0; k < 8; k++) { s = A32[n % 32] + s; n = Math.floor(n / 32); }
  const id = `HVI-${s}`;
  const f = flatOfId(id);
  if (!f) continue;
  if (seen.has(f)) { T = seen.get(f); M = id; } else seen.set(f, id);
}
ok(T && M && T !== M && flatOfId(T) === flatOfId(M), `two test files share a flat (${T}, ${M})`);
const P = "HVI-POORPOOR", NW = "HVI-NOWALLET", U = "HVI-UNASSESS";
for (const id of [T, M, P, NW]) putCase(id, { history: hist, avatar: { kind: "procedural", spec: { ...AV.DEFAULT_SPEC, hair_style: "curly" } } });
putCase(U, { history: [] });
// the pen cards (so wearing reaches the city)
globalThis.__blobs.set("hvi-pen", new Map());
const penStore = globalThis.__blobs.get("hvi-pen");
penStore.set(`citizen:${T}`, { data: { slug: `citizen-${T.slice(-4).toLowerCase()}`, name: `Subject ${T.slice(-4)}`, score: 512, avatar: { kind: "procedural", spec: AV.DEFAULT_SPEC } }, etag: "p1" });
penStore.set("index", { data: { cards: [{ key: "citizen:HVI-ZZZZZZZZ" }, { key: `citizen:${T}`, slug: "x", avatar: null }] }, etag: "p0" });

const L = DB.memoryLedger();
globalThis.__econLedger = L;
const inv = (label) => {
  const db = L.db;
  const byTxn = new Map();
  for (const e of db.entries) byTxn.set(e.txn_id, (byTxn.get(e.txn_id) || 0) + e.amount);
  ok([...byTxn.values()].every(v => v === 0), `${label}: every txn sums to zero`);
  for (const a of db.accounts.values()) eq(a.balance, db.entries.filter(e => e.account === a.id).reduce((s, e) => s + e.amount, 0), `${label}: ${a.id} = its entries`);
  for (const a of db.accounts.values()) if (a.kind !== "dept") ok(a.balance >= 0, `${label}: ${a.id} never below zero`);
  for (const t of db.txns.filter(x => x.kind === "shop")) ok(db.entries.filter(e => e.txn_id === t.id).every(e => e.account === `cash:${t.case_hash}` || e.account === "dept:burned"), `${label}: a purchase moves the buyer's cash to the burn, nothing else`);
};
const H = DB.caseHash;
const cash = (id) => L.db.accounts.get(`cash:${H(id)}`)?.balance ?? 0;
const burned = () => L.db.accounts.get("dept:burned").balance;
// a test grant from the treasury, balanced (the treasury mints), on the test file only
let grants = 0;
const grant = (id, n) => {
  const t = L.db.seq + 1; L.db.seq = t; grants++;
  L.db.txns.push({ id: t, idem_key: `test-grant-${grants}`, kind: "ubi", case_hash: H(id), day: null, memo: { test: true }, created_at: new Date().toISOString() });
  L.db.entries.push({ id: ++L.db.eseq, txn_id: t, account: `cash:${H(id)}`, amount: n }, { id: ++L.db.eseq, txn_id: t, account: "dept:treasury", amount: -n });
  L.db.accounts.get(`cash:${H(id)}`).balance += n; L.db.accounts.get("dept:treasury").balance -= n;
};

// closed with no ledger
{
  globalThis.__econLedger = null;
  const r = await shop("POST", { caseId: T, action: "buy", sku: "w:t-tee.white", nonce: "closed-nonce-1" });
  eq(r.status, 503, "closed: a purchase is refused"); ok(/NOT YET OPEN/.test(r.body.error), "closed: says so");
  eq((await shop("GET", null, { q: "?building=the-meridian" })).body.rooms, [], "closed: no rooms");
  globalThis.__econLedger = L;
}
// wallets: T and M and P collect (T and M a week's allowance; P one day)
fake = Date.parse("2026-10-13T12:00:00Z");
eq((await money("POST", { caseId: T, action: "collect" })).status, 200, "collect T, a week ago");
fake = Date.parse("2026-10-20T12:00:00Z");
for (const id of [T, M]) { const r = await money("POST", { caseId: id, action: "collect" }); eq(r.status, 200, `collect ${id}`); }
{
  // P: a wallet with little in it (the vest day is recent)
  putCase(P, { history: [{ at: "2026-10-17T10:00:00Z", score: 300, tier: "MONITORED CIVILIAN" }], avatar: { kind: "procedural", spec: AV.DEFAULT_SPEC } });
  const r = await money("POST", { caseId: P, action: "collect" }); eq(r.status, 200, "collect P");
}
clearLimits();
inv("after collect");
const t0 = cash(T);
ok(t0 > 9000, `T has two weeks' allowance (${t0})`);

// GET the wardrobe
{
  const r = await shop("GET", null, { q: `?caseId=${T}` });
  eq(r.status, 200, "GET wardrobe"); eq(r.body.balance, t0, "the balance"); eq(r.body.items, [], "nothing owned yet");
  eq(r.body.collection, "AUTUMN", "the season's collection"); ok(r.body.apartment?.flat?.id, "the flat is a cutaway flat");
  eq(r.body.apartment.unit, r.body.apartment.flat.label, "MY APARTMENT's unit is the cutaway's flat label");
  const s = { slug: `citizen-${T.slice(-4).toLowerCase()}`, name: `Subject ${T.slice(-4)}`, score: hist[0].score, tier: hist[0].tier, kind: "citizen" };
  const b = SIM.BUILDING[r.body.apartment.building];
  eq(residentFlat(towerPlan(b), s).id, r.body.apartment.flat.id, "MY APARTMENT names the door the tower draws");
  eq((await shop("GET", null, { q: `?caseId=${U}` })).status, 403, "an unassessed file does not shop");
  eq((await shop("GET", null, { q: "?caseId=HVI-NOPENOPE" })).status, 404, "no such file");
}
// BUY: exactly once per key, burned
{
  const b0 = burned();
  let r = await shop("POST", { caseId: T, action: "buy", sku: "w:t-tee.white", nonce: "nonce-tee-0001" });
  eq(r.status, 200, "buy a thrift tee"); ok(/DESTROYED/.test(r.body.last.line), "the line");
  eq(cash(T), t0 - 150, "debited exactly 150"); eq(burned(), b0 + 150, "150 burned");
  r = await shop("POST", { caseId: T, action: "buy", sku: "w:t-tee.white", nonce: "nonce-tee-0001" });
  eq(r.status, 200, "the same nonce again: ok"); eq(r.body.last.dup, true, "reported as a duplicate"); eq(cash(T), t0 - 150, "debited once");
  // a race: one nonce, three requests at once
  const race = await Promise.all([1, 2, 3].map(() => shop("POST", { caseId: T, action: "buy", sku: "f:arcade", nonce: "nonce-race-0001" })));
  ok(race.every(x => x.status === 200), "the race: every answer ok");
  eq(L.db.items.filter(i => i.case_hash === H(T) && i.sku === "f:arcade").length, 1, "the race: one cabinet");
  eq(cash(T), t0 - 150 - 4000, "the race: debited once");
  r = await shop("POST", { caseId: T, action: "buy", sku: "w:t-tee.white", nonce: "nonce-tee-0002" });
  eq(r.status, 409, "the same garment twice is refused"); eq(r.body.code, "owned", "owned");
  r = await shop("POST", { caseId: T, action: "buy", sku: "w:t-tee.gold", nonce: "nonce-bad-0001" });
  eq(r.status, 400, "a colourway that does not exist");
  r = await shop("POST", { caseId: T, action: "buy", sku: "w:t-shorts.denim", nonce: "nonce-off-0001" });
  eq(r.status, 409, "off season (shorts in AUTUMN)"); ok(/SEASON/.test(r.body.error), "the season's line");
  r = await shop("POST", { caseId: T, action: "buy", sku: "f:safe", nonce: "nonce-safe-0001" });
  eq(r.status, 400, "the vault's safe is not for sale");
  r = await shop("POST", { caseId: T, action: "buy", sku: "w:t-tee.white", price: 1, nonce: "nonce-cheap-001" });
  eq(r.status, 409, "the browser cannot set a price (still the owned refusal, nothing debited)");
  // three of a piece, not four
  for (let k = 0; k < 3; k++) { r = await shop("POST", { caseId: T, action: "buy", sku: "f:plant", nonce: `nonce-plant-00${k}` }); eq(r.status, 200, `plant ${k + 1}`); }
  r = await shop("POST", { caseId: T, action: "buy", sku: "f:plant", nonce: "nonce-plant-004" });
  eq(r.status, 409, "a fourth plant is refused"); eq(r.body.code, "too-many", "too many");
  // insufficient funds
  const p0 = cash(P);
  r = await shop("POST", { caseId: P, action: "buy", sku: "w:b-overcoat.camel", nonce: "nonce-poor-0001" });
  eq(r.status, 402, "insufficient funds refused"); eq(cash(P), p0, "nothing moved");
  // no wallet: assessed but never collected
  r = await shop("POST", { caseId: NW, action: "buy", sku: "w:t-tee.white", nonce: "nonce-nowal-001" });
  eq(r.status, 403, "no wallet, no purchase"); ok(/WALLET/.test(r.body.error), "the wallet line");
  eq(L.db.citizens.has(H(NW)), false, "the shop enrols nobody (enrolment and its caps are COLLECT's)");
  // more for the outfit
  for (const [sku, n] of [["w:d-hightops.red", "nonce-hi-00001"], ["w:h-jetsam-hoodie.magenta", "nonce-jh-00001"], ["w:h-sams-cap.red", "nonce-sc-00001"], ["w:t-jeans.black", "nonce-tj-00001"]]) {
    r = await shop("POST", { caseId: T, action: "buy", sku, nonce: n }); eq(r.status, 200, `buy ${sku}`);
  }
  inv("after purchases");
  eq(L.db.txns.filter(t => t.kind === "shop" && t.case_hash === H(T)).length, 9, "nine purchases on T's ledger, no more");
}
// WEAR and SAVE
{
  clearLimits();
  let r = await shop("POST", { caseId: T, action: "wear", outfit: { top: "h-jetsam-hoodie.magenta", bottom: "t-jeans.black", shoes: "d-hightops.red", head: "h-sams-cap.red" } });
  eq(r.status, 200, "wear an owned outfit");
  const rec = cases().get(T).data;
  eq(rec.avatar.spec.wear_top, "h-jetsam-hoodie.magenta", "on the file photo"); eq(rec.avatar.spec.hair_style, "curly", "the likeness kept");
  eq(penStore.get(`citizen:${T}`).data.avatar.spec.wear_head, "h-sams-cap.red", "on the pen card (the city draws it)");
  eq(penStore.get("index").data.cards.map(c => c.key), ["citizen:HVI-ZZZZZZZZ", `citizen:${T}`], "the pen index keeps its order");
  eq(penStore.get("index").data.cards[1].avatar.spec.wear_top, "h-jetsam-hoodie.magenta", "the index line updated in place");
  eq(r.body.worn.top, "h-jetsam-hoodie.magenta", "the answer shows it worn");
  r = await shop("POST", { caseId: T, action: "wear", outfit: { outer: "b-overcoat.camel" } });
  eq(r.status, 409, "an unowned piece cannot be worn");
  r = await shop("POST", { caseId: T, action: "wear", outfit: { top: "t-jeans.black" } });
  eq(r.status, 400, "a piece in the wrong slot");
  r = await shop("POST", { caseId: T, action: "save", slot: 2, outfit: { top: "t-tee.white", shoes: "d-hightops.red" } });
  eq(r.status, 200, "save to the closet"); eq(r.body.outfits["2"], { top: "t-tee.white", shoes: "d-hightops.red" }, "saved in hook 2");
  eq((await shop("POST", { caseId: T, action: "save", slot: 4, outfit: {} })).status, 400, "three hooks");
  r = await shop("POST", { caseId: T, action: "wear", outfit: {} });
  eq(r.status, 200, "wear nothing bought"); eq(cases().get(T).data.avatar.spec.wear_top, undefined, "back to the file's own clothes");
  // a hand-drawn likeness keeps what it was drawn in
  putCase(M, { history: hist, avatar: { kind: "sprite", url: "/sprites/someone.png" } });
  await shop("POST", { caseId: M, action: "buy", sku: "w:t-tee.black", nonce: "nonce-m-tee-01" });
  r = await shop("POST", { caseId: M, action: "wear", outfit: { top: "t-tee.black" } });
  eq(r.status, 200, "a drawn likeness: ok"); ok(r.body.last.drawn, "says it is drawn"); eq(cases().get(M).data.avatar.kind, "sprite", "the drawing untouched");
}
// PLACE: the case's own flat, a room that takes it, a free spot
{
  clearLimits();
  const v = (await shop("GET", null, { q: `?caseId=${T}` })).body;
  const flat = v.apartment.flat, living = flat.rooms.find(r => r.purpose === "living"), bath = flat.rooms.find(r => r.purpose === "bath") || flat.rooms.find(r => r.purpose === "kitchen");
  const cab = v.items.find(i => i.sku === "f:arcade"), plant = v.items.find(i => i.sku === "f:plant");
  let r = await shop("POST", { caseId: T, action: "place", itemId: cab.id, room: living.id, spot: "f1" });
  eq(r.status, 200, "the JETSAM! cabinet in the living room"); eq(r.body.items.find(i => i.id === cab.id).placed.room, living.id, "placed");
  r = await shop("POST", { caseId: T, action: "place", itemId: cab.id, room: bath.id, spot: "f2" });
  eq(r.status, 400, "a cabinet does not go in the bathroom");
  r = await shop("POST", { caseId: T, action: "place", itemId: cab.id, room: "the-meridian:L1:A:living", spot: "f2" });
  eq(r.status, 400, "not someone else's flat");
  r = await shop("POST", { caseId: T, action: "place", itemId: cab.id, room: living.id, spot: "w1" });
  eq(r.status, 400, "a floor piece on the wall");
  r = await shop("POST", { caseId: T, action: "place", itemId: plant.id, room: living.id, spot: "f1" });
  eq(r.status, 409, "the spot is taken (by the cabinet)");
  r = await shop("POST", { caseId: M, action: "place", itemId: cab.id, room: living.id, spot: "f3" });
  eq(r.status, 409, "a flatmate cannot place T's cabinet");
  await shop("POST", { caseId: M, action: "buy", sku: "f:cactus", nonce: "nonce-m-cac-01" });
  const mc = (await shop("GET", null, { q: `?caseId=${M}` })).body.items.find(i => i.sku === "f:cactus");
  r = await shop("POST", { caseId: M, action: "place", itemId: mc.id, room: living.id, spot: "f1" });
  eq(r.status, 409, "a flatmate finds the spot taken"); ok(/TAKEN/.test(r.body.error), "the taken line");
  r = await shop("POST", { caseId: M, action: "place", itemId: mc.id, room: living.id, spot: "f4" });
  eq(r.status, 200, "the flatmate's cactus on a free spot");
  r = await shop("POST", { caseId: T, action: "place", itemId: plant.id, room: living.id, spot: "f2" });
  eq(r.status, 200, "a plant beside the cabinet");
  // the public read: rooms, spots, pieces; never a case
  r = await shop("GET", null, { q: `?building=${v.apartment.building}` });
  eq(r.status, 200, "the building's rooms");
  eq(r.body.rooms.map(x => `${x.room}|${x.spot}|${x.item}`).sort(), [`${living.id}|f1|arcade`, `${living.id}|f2|plant`, `${living.id}|f4|cactus`].sort(), "what stands where");
  const pub = JSON.stringify(r.body);
  ok(!pub.includes(H(T)) && !pub.includes(T) && !/case/i.test(pub), "the public read names no case and no hash");
  eq((await shop("GET", null, { q: "?building=../../x" })).status, 400, "a bad building id");
  // the look: a placed piece takes its spot in the dressing
  const plan = towerPlan(SIM.BUILDING[v.apartment.building]);
  const u = plan.storeys.flatMap(s => s.units).find(x => x.id === flat.id);
  const look = SH.furnishLook(FURN.dressUnit(u, { band: plan.band }), r.body.rooms);
  ok(look.rooms[living.id].furniture.some(f => f.item === "arcade" && f.placed && Math.abs(f.x - 0.3) < 1e-9), "the cabinet stands at its spot in the look");
  r = await shop("POST", { caseId: T, action: "unplace", itemId: plant.id });
  eq(r.status, 200, "back to the inventory"); ok(!r.body.items.find(i => i.id === plant.id).placed, "unplaced");
  inv("after placing");
}
// UPGRADE: the difference, once; the old piece consumed; the room rules
{
  clearLimits();
  let v = (await shop("GET", null, { q: `?caseId=${T}` })).body;
  const flat = v.apartment.flat, living = flat.rooms.find(r => r.purpose === "living"), study = flat.rooms.find(r => r.purpose === "study");
  const cab = v.items.find(i => i.sku === "f:arcade");
  ok(cab.placed && cab.upgrade?.to === "golf-cabinet", "the cabinet is placed and upgradable");
  eq((await shop("POST", { caseId: T, action: "buy", sku: "f:golf-cabinet", nonce: "nonce-gc-direct" })).body.code, "upgrade-only", "the golf cabinet is not sold outright");
  grant(T, 8_000);
  const c0 = cash(T), b0 = burned(), n0 = L.db.items.filter(i => i.case_hash === H(T)).length;
  let r = await shop("POST", { caseId: T, action: "upgrade", itemId: cab.id, nonce: "nonce-up-00001" });
  eq(r.status, 200, "upgrade the cabinet to the bar-top golf cabinet");
  eq(cash(T), c0 - 6_300, "debited exactly the difference and the fee"); eq(burned(), b0 + 6_300, "burned");
  r = await shop("POST", { caseId: T, action: "upgrade", itemId: cab.id, nonce: "nonce-up-00001" });
  eq(r.body.last?.dup, true, "the same nonce again: a duplicate"); eq(cash(T), c0 - 6_300, "debited once");
  eq(L.db.items.filter(i => i.case_hash === H(T)).length, n0, "the old piece consumed, the new one in its place");
  ok(!L.db.items.some(i => i.id === cab.id), "the cabinet is gone");
  const gc = r.body.items.find(i => i.sku === "f:golf-cabinet");
  ok(gc && gc.placed?.room === living.id && gc.placed.spot === cab.placed.spot, "the golf cabinet stands where the cabinet stood");
  eq(gc.price, 4_000 + 6_300, "its value on the ledger: what was paid");
  eq((await shop("POST", { caseId: T, action: "upgrade", itemId: cab.id, nonce: "nonce-up-00002" })).status, 409, "the consumed piece cannot be upgraded again");
  // the simulator does not go in the living room: it waits in the inventory (or, with no study, cannot stand at all)
  const poorBefore = cash(T);
  const up2 = SH.upgradeOf("golf-cabinet").price;
  if (poorBefore < up2) {
    r = await shop("POST", { caseId: T, action: "upgrade", itemId: gc.id, nonce: "nonce-up-00003" });
    eq(r.status, 402, "the simulator is dearer than the wallet: refused"); eq(cash(T), poorBefore, "nothing moved");
    grant(T, 30_000);
  }
  const c2 = cash(T);
  r = await shop("POST", { caseId: T, action: "upgrade", itemId: gc.id, nonce: "nonce-up-00004" });
  eq(r.status, 200, "upgrade to the home golf simulator"); eq(cash(T), c2 - up2, "debited the difference and the fee");
  ok(/INVENTORY/.test(r.body.last.line), "it no longer fits the living room: it waits in the inventory");
  const sim = r.body.items.find(i => i.sku === "f:golf-sim");
  ok(sim && !sim.placed, "the simulator is unplaced");
  eq((await shop("POST", { caseId: T, action: "place", itemId: sim.id, room: living.id, spot: "f2" })).body.code, "needs-room", "the simulator needs the whole living room (the flatmate's cactus is in it)");
  eq((await shop("POST", { caseId: T, action: "place", itemId: sim.id, room: flat.rooms.find(r => r.purpose === "kitchen").id, spot: "f2" })).status, 400, "the simulator does not go in the kitchen");
  ok(study, "the test flat has a study");
  {
    const pl = r.body.items.find(i => i.sku === "f:plant" && !i.placed);
    eq((await shop("POST", { caseId: T, action: "place", itemId: pl.id, room: study.id, spot: "f0" })).status, 200, "a plant in the study");
    r = await shop("POST", { caseId: T, action: "place", itemId: sim.id, room: study.id, spot: "f2" });
    eq(r.status, 409, "the simulator needs the whole study"); eq(r.body.code, "needs-room", "needs the room");
    await shop("POST", { caseId: T, action: "unplace", itemId: pl.id });
    eq((await shop("POST", { caseId: T, action: "place", itemId: sim.id, room: study.id, spot: "f0" })).status, 400, "a whole-room piece stands in the middle only");
    eq((await shop("POST", { caseId: T, action: "place", itemId: sim.id, room: study.id, spot: "f2" })).status, 200, "the simulator takes the study");
    r = await shop("POST", { caseId: T, action: "place", itemId: pl.id, room: study.id, spot: "f4" });
    eq(r.status, 409, "the study is given over"); eq(r.body.code, "room-given", "given over");
    const plan = towerPlan(SIM.BUILDING[v.apartment.building]);
    const u = plan.storeys.flatMap(s => s.units).find(x => x.id === flat.id);
    const rooms = (await shop("GET", null, { q: `?building=${v.apartment.building}` })).body.rooms;
    const look = SH.furnishLook(FURN.dressUnit(u, { band: plan.band }), rooms);
    eq(look.rooms[study.id].furniture.filter(f => !FURN.CATALOG[f.item].wall).map(f => f.item), ["golf-sim"], "the study's dressing cleared for the simulator");
  }
  eq((await shop("POST", { caseId: T, action: "upgrade", itemId: sim.id, nonce: "nonce-up-00005" })).body.error, SH.SHOP_LINES.noUpgrade, "the top of the chain");
  inv("after upgrades");
}
// nothing here gives, sells on or transfers
{
  clearLimits();
  eq(F.SHOP_ACTIONS, ["buy", "upgrade", "wear", "save", "place", "unplace"], "the counters, and no others");
  // the rate limit: writes per case per minute
  let last = null;
  for (let k = 0; k <= F.SHOP_WRITES_PER_MINUTE; k++) last = await shop("POST", { caseId: T, action: "save", slot: 1, outfit: {} });
  eq(last.status, 429, "too many trips to the till in a minute");
  clearLimits();
  for (const a of ["gift", "give", "transfer", "send", "sell", "resell", "trade", "refund"]) {
    const r = await shop("POST", { caseId: T, action: a, sku: "w:t-tee.white", to: M });
    eq(r.status, 400, `no ${a} counter`);
  }
  await assert.rejects(() => L.rpc("econ_post", { idem: "evil-shop", kind: "shop", case_hash: H(T), legs: [{ account: `cash:${H(T)}`, amount: -10 }, { account: `cash:${H(M)}`, amount: 10 }] }), /another case/); checks++;
  const src = ["netlify/lib/shops.js", "netlify/functions/shops.js", "netlify/lib/shops-db.js", "src/economy/shops.js"].map(f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8")).join("\n");
  ok(!/updateScore|\.score\s*=(?!=)|history\.push/.test(src), "nothing in the shops writes a score");
  const mig = readdirSync(new URL("../supabase/migrations/", import.meta.url)).find(f => /shops_slice1/.test(f));
  const sql = readFileSync(new URL(`../supabase/migrations/${mig}`, import.meta.url), "utf8").split("\n").filter(l => !/^\s*--/.test(l)).join("\n");
  ok(/enable row level security/.test(sql) && !/grant[^;]*to (anon|authenticated)/i.test(sql), "RLS on, no grant to the browser");
}
// published plans: the shops add no place and nothing of theirs reaches a plan
{
  for (const f of ["src/city/sim.js", "netlify/lib/plans.js", "src/city/tower.js"]) {
    const s = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    ok(!/economy\/shops|wear\.js|econ_shop/.test(s), `${f} reads nothing of the shops`);
  }
  ok(!/avatar/.test(readFileSync(new URL("../netlify/lib/plans.js", import.meta.url), "utf8")), "plans never carry a likeness (an outfit cannot change a published day)");
}
// purge: the file's things go with its file
{
  const r = await purge(new Request(HOST + "/api/purge", { method: "POST", headers: { "content-type": "application/json", origin: HOST }, body: JSON.stringify({ caseId: T, confirm: T }) }), { ip: "192.0.2.99" }).catch(() => null);
  if (r && r.status === 200) {
    eq(L.db.items.filter(i => i.case_hash === H(T)).length, 0, "purge: the wardrobe goes");
    eq([...L.db.placements.values()].filter(x => x.case_hash === H(T)).length, 0, "purge: the furniture goes");
    eq([...L.db.outfits.keys()].filter(k => k.startsWith(H(T))).length, 0, "purge: the closet goes");
  } else {
    await DB.purgeLedger(T);
    eq(L.db.items.filter(i => i.case_hash === H(T)).length, 0, "purge: the wardrobe goes");
    eq([...L.db.placements.values()].filter(x => x.case_hash === H(T)).length, 0, "purge: the furniture goes");
  }
  ok(L.db.items.some(i => i.case_hash === H(M)), "the flatmate's things stand");
  inv("after purge");
}

// ==== POSTGRES (HVI_ECON_PG=1) ======================================================================
if (process.env.HVI_ECON_PG === "1") {
  const psql = (sql) => {
    const r = spawnSync("psql", ["-v", "ON_ERROR_STOP=1", "-tAq", "-c", sql], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr.trim());
    return r.stdout.trim();
  };
  const pg = { kind: "pg", async rpc(name, p) { return JSON.parse(psql(`select ${name}($pj$${JSON.stringify(p)}$pj$::jsonb)`)); } };
  psql("set session_replication_role = replica; truncate econ_placements, econ_outfits, econ_items, econ_entries, econ_txns, econ_ubi_claims, econ_investments, econ_returns, econ_citizens cascade; delete from econ_accounts where kind <> 'dept'; update econ_accounts set balance = 0; set session_replication_role = origin;");
  globalThis.__econLedger = pg;
  const pgInv = (label) => {
    eq(psql("select count(*) from (select txn_id from econ_entries group by txn_id having sum(amount) <> 0) x"), "0", `pg ${label}: every txn sums to zero`);
    eq(psql("select count(*) from econ_accounts a where balance <> coalesce((select sum(amount) from econ_entries e where e.account = a.id), 0)"), "0", `pg ${label}: balances = entries`);
    eq(psql("select coalesce(sum(balance), 0) from econ_accounts"), "0", `pg ${label}: the ledger sums to zero`);
  };
  clearLimits();
  putCase(T, { history: hist, avatar: { kind: "procedural", spec: AV.DEFAULT_SPEC } });
  putCase(M, { history: hist, avatar: { kind: "procedural", spec: AV.DEFAULT_SPEC } });
  fake = Date.parse("2026-10-13T12:00:00Z");
  eq((await money("POST", { caseId: T, action: "collect" })).status, 200, "pg: collect T, a week ago");
  fake = Date.parse("2026-10-20T12:00:00Z");
  for (const id of [T, M]) eq((await money("POST", { caseId: id, action: "collect" })).status, 200, `pg: collect ${id}`);
  const c0 = Number(psql(`select balance from econ_accounts where id = 'cash:${H(T)}'`));
  let r = await shop("POST", { caseId: T, action: "buy", sku: "f:arcade", nonce: "pg-nonce-cab-1" });
  eq(r.status, 200, "pg: buy the cabinet");
  r = await shop("POST", { caseId: T, action: "buy", sku: "f:arcade", nonce: "pg-nonce-cab-1" });
  eq(r.body.last.dup, true, "pg: the same nonce is a duplicate");
  eq(Number(psql(`select balance from econ_accounts where id = 'cash:${H(T)}'`)), c0 - 4000, "pg: debited exactly once");
  eq(Number(psql("select balance from econ_accounts where id = 'dept:burned'")), 4000, "pg: burned");
  r = await shop("POST", { caseId: T, action: "buy", sku: "w:b-blazer.navy", nonce: "pg-nonce-coat-1" });
  eq(r.status, 200, "pg: the boutique blazer");
  const c1 = Number(psql(`select balance from econ_accounts where id = 'cash:${H(T)}'`));
  r = await shop("POST", { caseId: T, action: "buy", sku: "w:b-overcoat.charcoal", nonce: "pg-nonce-coat-2" });
  eq(r.status, 402, "pg: insufficient funds refused");
  eq(Number(psql(`select balance from econ_accounts where id = 'cash:${H(T)}'`)), c1, "pg: nothing moved");
  r = await shop("POST", { caseId: T, action: "buy", sku: "w:b-blazer.navy", nonce: "pg-nonce-coat-3" });
  eq(r.body.code, "owned", "pg: one of each garment");
  for (let k = 0; k < 3; k++) await shop("POST", { caseId: M, action: "buy", sku: "f:cactus", nonce: `pg-nonce-cac-${k}` });
  eq((await shop("POST", { caseId: M, action: "buy", sku: "f:cactus", nonce: "pg-nonce-cac-9" })).body.code, "too-many", "pg: three of a piece");
  eq((await shop("POST", { caseId: T, action: "wear", outfit: { outer: "b-blazer.navy" } })).status, 200, "pg: wear");
  eq((await shop("POST", { caseId: T, action: "wear", outfit: { outer: "b-overcoat.charcoal" } })).status, 409, "pg: not owned, not worn");
  const v = (await shop("GET", null, { q: `?caseId=${T}` })).body;
  const living = v.apartment.flat.rooms.find(x => x.purpose === "living");
  const cab = v.items.find(i => i.sku === "f:arcade");
  eq((await shop("POST", { caseId: T, action: "place", itemId: cab.id, room: living.id, spot: "f1" })).status, 200, "pg: place");
  const mc = (await shop("GET", null, { q: `?caseId=${M}` })).body.items.find(i => i.sku === "f:cactus");
  eq((await shop("POST", { caseId: M, action: "place", itemId: mc.id, room: living.id, spot: "f1" })).status, 409, "pg: a spot holds one piece");
  eq((await shop("GET", null, { q: `?building=${v.apartment.building}` })).body.rooms.length, 1, "pg: the building's rooms");
  await assert.rejects(async () => psql(`insert into econ_placements (item_id, case_hash, flat, room, spot) values (${cab.id}, '${H(T)}', 'a:L1:A', 'b:L1:A:living', 'f0')`), /violates/); checks++;
  // the upgrade on Postgres: refused when poor, then exactly once, the old piece consumed, the spot kept
  const cu0 = Number(psql(`select balance from econ_accounts where id = 'cash:${H(T)}'`));
  if (cu0 < 6_300) {
    eq((await shop("POST", { caseId: T, action: "upgrade", itemId: cab.id, nonce: "pg-nonce-up-0" })).status, 402, "pg: an upgrade the wallet cannot cover");
    await pg.rpc("econ_post", { idem: "pg-test-grant", kind: "ubi", case_hash: H(T), legs: [{ account: "dept:treasury", amount: -10_000 }, { account: `cash:${H(T)}`, kind: "cash", amount: 10_000 }] });
  }
  const cu1 = Number(psql(`select balance from econ_accounts where id = 'cash:${H(T)}'`));
  eq((await shop("POST", { caseId: T, action: "upgrade", itemId: cab.id, nonce: "pg-nonce-up-1" })).status, 200, "pg: upgrade the cabinet");
  eq((await shop("POST", { caseId: T, action: "upgrade", itemId: cab.id, nonce: "pg-nonce-up-1" })).body.last?.dup, true, "pg: the repeat is a duplicate");
  eq(Number(psql(`select balance from econ_accounts where id = 'cash:${H(T)}'`)), cu1 - 6_300, "pg: debited the difference and the fee, once");
  eq(psql(`select count(*) from econ_items where id = ${cab.id}`), "0", "pg: the cabinet consumed");
  eq(psql(`select i.sku || '|' || p.room || '|' || p.spot from econ_placements p join econ_items i on i.id = p.item_id where p.case_hash = '${H(T)}'`), `f:golf-cabinet|${living.id}|f1`, "pg: the golf cabinet stands where the cabinet stood");
  pgInv("after shopping");
  eq((await DB.purgeLedger(T)).ok, true, "pg: purge");
  eq(psql(`select (select count(*) from econ_items where case_hash = '${H(T)}') + (select count(*) from econ_outfits where case_hash = '${H(T)}') + (select count(*) from econ_placements where case_hash = '${H(T)}')`), "0", "pg: the purge takes the wardrobe, the closet and the furniture");
  pgInv("after purge");
  console.log("check-shops: Postgres suite passed");
}

console.log(`check-shops: ${checks} checks passed`);
