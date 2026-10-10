// THE HOUSING OFFICE (netlify/lib/housing.js, src/city/housing.js, sim.js homeAt, tower.js): every
// player gets a door of their own, REQUEST A TRANSFER moves them, the furniture moves with them.
// Fails if:
//   - a famous resident hashes into a flat kept for players (from HOUSING_DAY), or any flat changes
//     before HOUSING_DAY (the published days stay as they were);
//   - a player is given a unit another player holds while an empty one stands in their band;
//   - the server (MY APARTMENT) and a viewer (the census, a published plan's record, this browser's
//     own file, the tower's nameplates and rooms) disagree on a player's unit, on any day;
//   - a move or a transfer loses, duplicates or strands a piece of furniture, or the movers move
//     anything twice;
//   - a transfer lands on a published day, is accepted while another is pending, or takes a door
//     that was not offered;
//   - a case number reaches the census or the housing answer.
// The players' situation before this (a citizen sharing a flat with Elon Musk, two players in one
// flat) is reproduced with made-up files whose keys collide the same way. Never uses a real case.
// Run: node scripts/check-housing.mjs
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

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
    list({ prefix = "", paginate = false } = {}) {
      const page = { blobs: [...s.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) };
      return paginate ? (async function* () { yield page; })() : Promise.resolve(page);
    },
  };
}`;
registerHooks({ resolve(spec, ctx, next) { return spec === "@netlify/blobs" ? { url: "data:text/javascript," + encodeURIComponent(blobsSrc), shortCircuit: true } : next(spec, ctx); } });
const __err = console.error; console.error = console.warn = console.log = (...a) => { if (process.env.DEBUG_CHECK) __err(...a); };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.HVI_ECONOMY_BACKEND;

const SIM = await import("../src/city/sim.js");
const T = await import("../src/city/tower.js");
const HZ = await import("../src/city/housing.js");
const { roomIn } = await import("../src/city/simApi.js");
const { recOf } = await import("../src/city/planSplit.js");
const { fullRoster } = await import("../src/city/roster.js");
const DB = await import("../netlify/lib/economy-db.js");
const E = await import("../netlify/lib/economy.js");
const LH = await import("../netlify/lib/housing.js");
const ST = await import("../netlify/lib/store.js");
const { censusSubjects } = await import("../netlify/lib/census.js");
const { LOOKAHEAD } = await import("../netlify/lib/plans.js");
const { currentFile } = await import("../netlify/functions/file.js");
const housingFn = (await import("../netlify/functions/housing.js")).default;
const shopsFn = (await import("../netlify/functions/shops.js")).default;
const econFn = (await import("../netlify/functions/economy.js")).default;
const { rounds } = await import("../netlify/functions/housing-tick.js");

let checks = 0;
const ok = (c, m) => { checks++; assert.ok(c, m); };
const eq = (a, b, m) => { checks++; assert.deepEqual(a, b, m); };
const HD = SIM.HOUSING_DAY;
const dayStart = (d) => SIM.CITY_EPOCH + ((d - 1) * 24 * 3600000) / SIM.DEFAULT_SCALE;
let fake = dayStart(HD - LOOKAHEAD - 3) + 5 * 60000;   // three days before the first day the office may use
Date.now = () => fake;
const today = () => SIM.machineClock(fake).day;
const planOf = (bid) => T.towerPlan(SIM.BUILDING[bid]);
const plansAll = T.TOWERS().map(b => T.towerPlan(b));
const unitById = new Map(plansAll.flatMap(p => p.storeys.flatMap(st => st.units)).map(u => [u.id, u]));

// ==== 1. THE PLAYERS' FLATS ======================================================================
{
  let kept = 0;
  for (const p of plansAll) for (const st of p.storeys) {
    const byPlace = new Map();
    for (const u of st.units.filter(u => u.kind === "flat")) (byPlace.get(u.placeId) || byPlace.set(u.placeId, []).get(u.placeId)).push(u);
    for (const [, list] of byPlace) {
      const mine = list.filter(u => u.citizen);
      eq(mine.length, list.length >= 2 ? 1 : 0, `${st.id}: one flat kept for players where a home has two or more`);
      if (mine.length) { ok(mine[0] === list[list.length - 1], `${st.id}: the kept flat is the last`); kept++; }
    }
  }
  ok(kept > 100, `players' flats across the towers (${kept})`);
  for (const k of [0, 1, 2]) ok(HZ.playerUnits(SIM.HOMES_BY_BAND[k]).length >= 20, `band ${k} has players' flats`);
}

// a production-shaped census: the figures on file, 400 referred figures, and players
const figs = Array.from({ length: 400 }, (_, i) => ({ slug: `ref-figure-${i}`, name: `Referred Figure ${i}`, score: 300 + ((i * 37) % 560), kind: "figure", referred: true }));
// ==== 2. FAMOUS RESIDENTS NEVER IN A PLAYERS' FLAT; NOTHING CHANGES BEFORE HOUSING_DAY ================
{
  const famous = fullRoster(figs).filter(s => s.kind !== "citizen");
  let n = 0;
  for (const s of famous) {
    const p = SIM.homeOf(s, SIM.SEED, HD), b = SIM.BUILDING[SIM.PLACES[p].building], plan = b && T.towerPlan(b);
    if (!plan) continue;
    const u = T.residentFlat(plan, s, SIM.SEED, HD);
    if (!u) continue;
    n++;
    ok(!u.citizen, `${s.slug}: a famous resident is never in a flat kept for players (${u.id})`);
    // before HOUSING_DAY: byte for byte the old hash (flatOf over every flat)
    const pre = SIM.homeOf(s, SIM.SEED, HD - 1), pb = T.towerPlan(SIM.BUILDING[SIM.PLACES[pre].building]);
    if (pb) eq(T.residentFlat(pb, s, SIM.SEED, HD - 1)?.id, T.flatOf(pb, pre, SIM.floorOf(pre, SIM.keyOf(s)), SIM.keyOf(s))?.id, `${s.slug}: the day before HOUSING_DAY is as it was`);
  }
  ok(n > 200, `famous residents housed in towers (${n})`);
}

// ==== 3. ALLOCATION: an empty door while one stands; else the least shared ========================
{
  const D = HD + 2;
  const band1 = HZ.playerUnits(SIM.bandHomesFor({ kind: "citizen", score: 680 }, D));
  const players = [];
  let free = 0, full = 0;
  for (let i = 0; i < band1.length + 25; i++) {
    const s = { slug: `citizen-alloc${i}`, name: `Subject A${i}`, score: 660 + (i % 40), kind: "citizen", housedUnder: 2 };
    const occ = HZ.occupancy(players, D), empty = band1.filter(c => !occ.get(c.u));
    const a = HZ.allocate(s, players, D);
    ok(a && band1.some(c => c.u === a.u), `${s.slug}: given a players' flat in their band`);
    if (empty.length) { free++; ok(!occ.get(a.u), `${s.slug}: given an empty door while ${empty.length} stand empty (got one held by ${occ.get(a.u)})`); }
    else { full++; const min = Math.min(...band1.map(c => occ.get(c.u) || 0)); eq(occ.get(a.u) || 0, min, `${s.slug}: no empty door: the least shared (${min})`); }
    players.push({ ...s, home: { ...a, d: D, k: "assign", was: null } });
    eq(HZ.unitAt(players[players.length - 1], D), a.u, `${s.slug}: the sim sleeps them in the door assigned`);
  }
  ok(free === band1.length && full === 25, `every empty door used first (${free} empty, then ${full} shared)`);
  eq(HZ.allocate(players[3], players.slice(0, 3), D), HZ.allocate(players[3], players.slice(0, 3), D), "deterministic");
}

// ==== 4. THE OLD SITUATION, REPRODUCED: two players and a famous resident in one flat ===============
const L = DB.memoryLedger();
globalThis.__econLedger = L;
const H = DB.caseHash;
const A = "HVI-ROOMAA3S", B = "HVI-FLATAA7U", C = "HVI-PROVAB6F", N = "HVI-NOTCHANG";   // made up here; A and B collide into one flat
const hist = (score, tier) => [{ at: "2026-10-05T10:00:00Z", score, tier }];
const files = { [A]: hist(680, "TOLERATED GENERALIST"), [B]: hist(681, "TOLERATED GENERALIST"), [C]: hist(590, "MONITORED CIVILIAN"), [N]: hist(580, "MONITORED CIVILIAN") };
for (const [id, history] of Object.entries(files)) {
  await ST.updateCase(id, () => ({ caseId: id, history }));
  const l4 = id.slice(-4), h = history[0];
  await ST.putPenCard(id, { slug: `citizen-${l4.toLowerCase()}`, name: `Subject ${l4}`, score: h.score, tier: h.tier, housedUnder: 2, updated: h.at });
}
const recOfCase = async (id) => ST.getCase(id);
const census = async () => fullRoster([...(await censusSubjects()), ...figs]);
{
  const day = HD - 1;
  const a = E.apartmentOf(A, await recOfCase(A), day), b = E.apartmentOf(B, await recOfCase(B), day);
  eq(a?.flat?.id, "hab-d:L1:A", "before: the made-up file A sleeps in hab-d:L1:A");
  eq(b?.flat?.id, "hab-d:L1:A", "before: so does B");
  const roster = await census();
  const res = T.placeAll(planOf("hab-d"), roster.map(s => ({ s, w: null, r: null })), (day - 1) * 24 + 3).residents.get("hab-d:L1:A") || [];
  ok(res.some(s => s.name === "Elon Musk") && res.filter(s => s.kind === "citizen" && /^Subject AA(3S|7U)$/.test(s.name)).length === 2, `before: two players share Elon Musk's flat (${res.map(s => s.name).join(", ")})`);
}

// ==== 5. THE MOVE: assigned at the first unpublished day, the furniture carried ======================
const HOST = "https://humanvalueindex.com";
const req = (fn, path) => async (method, body, { q = "" } = {}) => {
  const r = await fn(new Request(HOST + path + q, method === "GET" ? { method, headers: { origin: HOST } } : { method, headers: { "content-type": "application/json", origin: HOST }, body: JSON.stringify(body) }), { ip: "192.0.2.30" });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const housing = req(housingFn, "/api/housing"), shop = req(shopsFn, "/api/shops"), econ = req(econFn, "/api/economy");
const clearLimits = () => globalThis.__blobs.get("hvi-limits")?.clear();
const give = (id, sku) => { const it = { id: ++L.db.iseq, case_hash: H(id), sku, kind: "furn", price: 100, txn_id: 0, bought_at: new Date(fake).toISOString() }; L.db.items.push(it); return it.id; };
const mine = (id) => ({ items: L.db.items.filter(i => i.case_hash === H(id)).map(i => i.id).sort(), placed: [...L.db.placements.values()].filter(p => p.case_hash === H(id)).sort((x, y) => x.item_id - y.item_id) });
const suffix = (p) => p.room.slice(p.flat.length + 1);
{
  // furniture in the shared flat: A's sofa, bed and tub; B's lamp
  const placeIt = async (id, sku, purpose, spot) => {
    const iid = give(id, sku);
    const r = await shop("POST", { caseId: id, action: "place", itemId: iid, room: `hab-d:L1:A:${purpose}`, spot });
    eq(r.status, 200, `${id.slice(-4)} places a ${sku} in the ${purpose} (${JSON.stringify(r.body?.error || "")})`);
  };
  await placeIt(A, "f:sofa", "living", "f1"); await placeIt(A, "f:bed-double", "bedroom", "f1"); await placeIt(A, "f:tub", "bath", "f0");
  await placeIt(B, "f:lamp", "living", "f3");
  // the shops' GET already ran the office: both assigned, from HOUSING_DAY, nothing in force yet
  const ra = await recOfCase(A), rb = await recOfCase(B);
  ok(ra.home && rb.home, "both files carry an assignment");
  eq([ra.home.d, rb.home.d, ra.home.k, ra.home.was], [HD, HD, "assign", null], "from HOUSING_DAY (past every published day), nothing before it");
  ok(ra.home.u !== rb.home.u, `two players, two doors (${ra.home.u}, ${rb.home.u})`);
  for (const h of [ra.home, rb.home]) ok(unitById.get(h.u)?.citizen, `${h.u}: a flat kept for players`);
  eq(E.apartmentOf(A, ra)?.flat?.id, "hab-d:L1:A", "until the day, MY APARTMENT is the old door");
  const card = (await ST.listPenCards()).find(c => c.key === `citizen:${A}`);
  eq(card.home, ra.home, "the pen card carries the assignment (the census reads it)");
  eq(currentFile(ra).home, ra.home, "and the file's own read (this browser's copy)");
  const before = mine(A), beforeB = mine(B);
  // the day lands: the rounds carry the furniture
  fake = dayStart(HD) + 60000;
  clearLimits();
  const r = await rounds(fake);
  ok(r.settled >= 2, `the rounds moved the players whose day landed (${JSON.stringify(r)})`);
  for (const [id, was] of [[A, before], [B, beforeB]]) {
    const rec = await recOfCase(id), apt = E.apartmentOf(id, rec), now = mine(id);
    eq(apt.flat.id, rec.home.u, `${id.slice(-4)}: MY APARTMENT is the assigned door from the day`);
    eq(now.items, was.items, `${id.slice(-4)}: every piece still owned`);
    eq(now.placed.length, was.placed.length, `${id.slice(-4)}: every placed piece still placed`);
    for (const p of now.placed) {
      ok(p.flat === rec.home.u && p.room.startsWith(`${rec.home.u}:`), `${id.slice(-4)}: item ${p.item_id} moved into the new flat (${p.room})`);
      const o = was.placed.find(x => x.item_id === p.item_id);
      eq([suffix(p), p.spot], [suffix(o), o.spot], `${id.slice(-4)}: item ${p.item_id} in the same room and spot`);
    }
    eq(rec.home.s, HD, `${id.slice(-4)}: the move recorded as done`);
    ok(rec.housingLog.some(e => e.kind === "moved"), `${id.slice(-4)}: logged`);
  }
  const again = await LH.settleFurniture(A, await recOfCase(A), today());
  eq(again, { moved: 0, stored: 0 }, "the movers do not move anything twice");
  eq(mine(A), mine(A), "idempotent");
  const r2 = await rounds(fake);
  eq([r2.assigned, r2.settled], [0, 0], "the next round finds nothing to do");
}

// ==== 6. EVERY VIEWER AGREES: the census, a published plan's record, this browser's own file, the tower ==
const agree = async (label) => {
  const roster = await census(), D = today();
  for (const id of [A, B, C, N]) {
    const rec = await recOfCase(id), apt = E.apartmentOf(id, rec);
    const key = `citizen-${id.slice(-4).toLowerCase()}`;
    const s = roster.find(x => x.slug === key);
    ok(s, `${label}: ${key} is on the census`);
    const plan = apt?.flat ? planOf(apt.building) : null;
    if (!plan) continue;
    eq(T.residentFlat(plan, s)?.id, apt.flat.id, `${label}: ${key}: the census and MY APARTMENT agree`);
    eq(T.residentFlat(plan, { ...recOf(s, false, D), slug: key })?.id, apt.flat.id, `${label}: ${key}: a published plan's record agrees`);
    const f = currentFile(rec), self = { slug: key, name: `Subject ${id.slice(-4)}`, score: f.latest.score, tier: f.latest.tier, kind: "citizen", housedUnder: 2, ...(f.home ? { home: f.home } : {}) };
    eq(T.residentFlat(plan, self)?.id, apt.flat.id, `${label}: ${key}: this browser's own file agrees`);
    // the tower: the nameplate, and the room they sleep in at 03:00
    const mt = (D - 1) * 24 + 3, w = SIM.whereAt(s, mt), P = T.placeAll(plan, roster.map(x => ({ s: x, w: x === s ? w : null, r: x === s ? roomIn(w, s) : null })), mt);
    ok((P.residents.get(apt.flat.id) || []).some(x => x.slug === key), `${label}: ${key}: the nameplate on the door`);
    if (w.activity === "home" && w.buildingId === apt.building) ok(P.at.get(key)?.startsWith(`${apt.flat.id}:`), `${label}: ${key}: asleep in their own flat (${P.at.get(key)})`);
    if (rec.home && apt.flat.id === rec.home.u) {
      const others = (P.residents.get(apt.flat.id) || []).filter(x => x.slug !== key);
      ok(!others.some(x => x.kind !== "citizen"), `${label}: ${key}: no famous resident in their flat (${others.map(x => x.name).join(", ")})`);
    }
  }
};
await agree("on HOUSING_DAY");

// ==== 7. REQUEST A TRANSFER =========================================================================
{
  clearLimits();
  let g = await housing("GET", null, { q: `?caseId=${A}` });
  eq(g.status, 200, "GET the housing office");
  ok(!/HVI-[A-Z2-7]{8}/.test(JSON.stringify(g.body)), "no case number in the housing answer");
  ok(g.body.options.length >= 1 && g.body.options.length <= HZ.OFFERS, `a short list (${g.body.options.length})`);
  const D = LH.effectiveDay(today());
  eq(g.body.day, D, "the move lands on the first unpublished day");
  ok(D > today() + LOOKAHEAD, "past every published day");
  const roster0 = await census();
  const occ = HZ.occupancy(roster0.filter(s => s.kind === "citizen" && s.slug !== "citizen-aa3s"), D);
  const curA = (await recOfCase(A)).home.u;
  for (const o of g.body.options) {
    ok(unitById.get(o.unit)?.citizen && !occ.get(o.unit) && o.unit !== curA, `${o.unit}: an empty players' flat, not the one held`);
    ok(SIM.bandHomesFor(roster0.find(s => s.slug === "citizen-aa3s"), D).includes(unitById.get(o.unit).placeId), `${o.unit}: in the band`);
  }
  const pick = g.body.options[0].unit;
  const preDays = Array.from({ length: D - today() }, (_, i) => today() + i).map(d => SIM.homeOf(roster0.find(s => s.slug === "citizen-aa3s"), SIM.SEED, d));
  let p = await housing("POST", { caseId: A, action: "transfer", unit: pick });
  eq(p.status, 200, `transfer filed (${JSON.stringify(p.body?.error || "")})`);
  ok(/REQUEST STAMPED/.test(p.body.last.line) && p.body.pending?.unit === pick && p.body.options.length === 0, "the Overlord stamps it; it is pending; no list while it is");
  eq((await housing("POST", { caseId: A, action: "transfer", unit: pick })).body.code, "pending", "one pending request at a time");
  eq((await housing("POST", { caseId: B, action: "transfer", unit: "hab-d:L1:A" })).body.code, "not-offered", "a door not on the list is refused");
  eq((await housing("POST", { caseId: B, action: "transfer", unit: pick })).body.code, "not-offered", "nor one another player has just taken");
  const recA = await recOfCase(A);
  eq([recA.home.u, recA.home.d, recA.home.k, recA.home.was?.u], [pick, D, "transfer", curA], "on file: the new door from its day, the old one until then");
  ok(recA.housingLog.some(e => e.kind === "transfer" && e.d === D), "logged");
  const roster1 = await census(), sA = roster1.find(s => s.slug === "citizen-aa3s");
  eq(preDays, Array.from({ length: D - today() }, (_, i) => today() + i).map(d => SIM.homeOf(sA, SIM.SEED, d)), "no published day changes");
  eq(E.apartmentOf(A, recA)?.flat?.id, curA, "until the day: the old door");
  // a piece the new flat has no room for goes back to the inventory, unharmed
  const odd = give(A, "f:desk");
  L.db.placements.set(odd, { item_id: odd, case_hash: H(A), flat: curA, room: `${curA}:study`, spot: "f0" });
  const before = mine(A);
  fake = dayStart(D) + 60000;
  clearLimits();
  g = await econ("GET", null, { q: `?caseId=${A}` });
  eq(g.status, 200, "the Treasury's read runs the office too");
  eq(g.body.apartment.flat.id, pick, "from the day: MY APARTMENT is the new door");
  const now = mine(A);
  eq(now.items, before.items, "every piece still owned after the transfer");
  eq(now.placed.length, before.placed.length - 1, "every piece that fits placed; the one that does not, stored");
  ok(!now.placed.some(x => x.item_id === odd) && now.items.includes(odd), "the desk is in the inventory");
  ok(now.placed.every(x => x.flat === pick), "everything placed is in the new flat");
  const lg = (await recOfCase(A)).housingLog.at(-1);
  eq([lg.kind, lg.moved, lg.stored], ["moved", before.placed.length - 1, 1], "the movers' record");
  await agree("after the transfer");
}

// ==== 8. ONE BAND UP, WHEN THE SCORE IS ON THE LINE ====================================================
{
  clearLimits();
  const roster = await census(), sC = roster.find(s => s.slug === "citizen-ab6f"), sN = roster.find(s => s.slug === "citizen-hang");
  const D = LH.effectiveDay(today());
  ok(HZ.qualifiesUp(sC, D) && !HZ.qualifiesUp(sN, D), "590 is on the line of the band above (600); 580 is not");
  const g = await housing("GET", null, { q: `?caseId=${C}` });
  const up = g.body.options.filter(o => o.up);
  ok(g.body.qualifiesUp && up.length >= 1 && up.length <= HZ.OFFERS_UP, `one band up offered (${up.length})`);
  for (const o of up) ok(SIM.bandHomesFor(sC, D, true).includes(unitById.get(o.unit).placeId), `${o.unit}: one band up`);
  ok(!(await housing("GET", null, { q: `?caseId=${N}` })).body.options.some(o => o.up), "nothing above for a score off the line");
  const p = await housing("POST", { caseId: C, action: "transfer", unit: up[0].unit });
  eq(p.status, 200, "the band-up transfer filed");
  fake = dayStart(D) + 60000;
  clearLimits();
  await rounds(fake);
  eq(E.apartmentOf(C, await recOfCase(C)).flat.id, up[0].unit, "and honored from its day");
  await agree("after the band-up");
}

// ==== 9. NO CASE NUMBER ON THE CENSUS ==================================================================
ok(!/HVI-[A-Z2-7]{8}/.test(JSON.stringify(await censusSubjects())), "the census carries no case number");

console.log = __err;
console.log(`check-housing: ${checks} checks passed`);
