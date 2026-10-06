// THE MARKET (docs/design/ECONOMY_PROPERTY.md, "The Living Market"): the engine, the city's input,
// the tick, the ledger's market functions, /api/market, and Scott's three tests.
//   1. determinism: the same inputs give the same prices, bit for bit; a replay from a snapshot
//      lands on the same state; a re-run of a priced day changes nothing
//   2. published plans: the market's input is written beside a day, never into it (files,
//      summary and version identical with and without it); marketTerms never mutates the plan
//   3. bounds: no tick moves a price more than the tick band, no real day more than the day band
//   4. herding: a crowd's own orders move the price it fills at; crowded savvy earns less
//   5. excluded figures are never listed (barred, harm review, the faiths' founders, citizens)
//   6. the NPCs: the walls hold always; past a guardrail a stabilizer fires within 3 real days
//   7. fairness: a UBI newcomer reaches the first rung in 14 days even investing everything;
//      the top 1% hold at most 25% of market wealth over 90 days; savvy pays 0.5x-2x of labour;
//      doing both beats either
//   8. the ledger: escrowed buys, reserved sells, fills once, one case per txn, the levy and the
//      dividend once, purge; /api/market end to end
// Run: node scripts/check-market.mjs
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
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
    async getMetadata(k) { return s.has(k) ? { etag: s.get(k).etag } : null; },
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

const R = await import("../src/market/rules.js");
const E = await import("../src/market/engine.js");
const A = await import("../src/market/activity.js");
const D = await import("../src/city/drives.js");
const M = await import("./market-sim.mjs");
const SIM = await import("../src/city/sim.js");

let checks = 0;
const ok = (c, m) => { checks++; assert.ok(c, m); };
const eq = (a, b, m) => { checks++; assert.deepEqual(a, b, m); };
const sha = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex");

// ==== the rules ==================================================================================
{
  ok(E.realDayOf(1) === new Date(SIM.CITY_EPOCH).toISOString().slice(0, 10), "the engine's epoch is the sim's");
  ok(E.realDayOf(60) === E.realDayOf(1) && E.realDayOf(61) !== E.realDayOf(60) && E.firstMachineDayOf(E.realDayOf(601)) === 601, "60 machine days to a real day");
  const k = R.knobsOf({ positionCap: 5, levyRate: -1, halts: "no", spread: 0.001 });
  ok(k.positionCap === 0.1 && k.levyRate === 0 && k.halts === true && k.spread === 0.001, "knobs are held to their limits; junk keeps the default");
  ok(Object.keys(R.KNOB_LABELS).every(x => x in R.KNOBS) && Object.keys(R.KNOBS).every(x => x in R.KNOB_LIMITS), "every knob has a limit and a ballot label");
  const u = R.unitsFor(1000, 100);
  ok(u.units === 9 && u.cost <= 1000 && u.ask > 100, "a buy rounds down to whole shares at the ask");
  ok(R.proceedsOf(10, 100) < 1000, "a sell is at the bid");
  // drives: the game-wide module, pure
  ok(R.NPC_ROSTER.every(([slug, , drive]) => D.DRIVES.includes(drive) && D.PERSONA[slug] === drive), "every NPC's drive is its documented persona (src/city/drives.js)");
  const v1 = D.driveVector({ breakdown: { care: 20, utility: 95, network: 90 }, competence: 90 });
  ok(D.driveOf({ slug: "nobody", breakdown: { care: 20, utility: 95, network: 90, alignment: 50 }, competence: 90 }) === "acquisitive" && Object.values(v1).every(x => x >= 0 && x <= 1), "a file's numbers give a bounded drive vector; utility and network without care reads acquisitive");
  ok(D.driveOf({ slug: "karl-marx" }) === "revolutionary" && /BECAUSE NOBODY ELSE WOULD\.$/.test(D.because({ who: "Karl Marx", did: "bought the commons", drive: "revolutionary" })), "the persona overrides; because() writes one line");
}

// ==== the city's input: excluded figures, purity, the plan untouched ==============================
{
  const F = (await import("../src/figures.js")).FAMOUS_FIGURES;
  const genghis = F.find(f => f.name === "Genghis Khan");
  ok(A.untradable({ ...genghis, kind: "figure" }) && A.untradable({ name: "x", kind: "citizen" }), "the barred and every citizen are untradable");
  ok(A.untradable({ name: "x", kind: "figure", harmReviewPending: true }) && A.untradable({ name: "x", kind: "figure", harmReview: { decision: "gate" } }) && A.untradable({ name: "x", kind: "figure", wikidata: "Q9458" }), "a pending or adverse harm review, and the faiths' founders, are untradable");
  ok(!A.untradable({ name: "x", kind: "figure", harmReview: { decision: "ungate" }, breakdown: { threat: 10 }, tier: "TOLERATED GENERALIST" }), "an ungated figure is tradable");
  // the chess park's barred() and this agree on every figure on file
  const { barred } = await import("../src/play/tennis/gallery.js");
  ok(F.every(f => barred(f) === A.untradable({ ...f, kind: "figure" })), "untradable() is the park's barred() on every bundled figure");

  // a real built day, from the synthetic roster: the input is written beside the day, never into it
  const PL = await import("../netlify/lib/plans.js");
  const { synthRoster } = await import("./synth-roster.mjs");
  const roster = synthRoster(260, { seed: 9 });
  const Dd = 640;
  SIM.clearPlans(); SIM.setRoster(roster);
  const plan = JSON.parse(JSON.stringify(SIM.buildPlan(Dd)));
  SIM.clearRoster();
  const ver = PL.versionOf(plan), before = sha(plan);
  const run = async (withMarket) => {
    const box = new Map(), mk = new Map();
    const io = { putPart: async (k, v) => { box.set(k, JSON.parse(JSON.stringify(v))); }, ...(withMarket ? { putMarket: async (d, v) => { mk.set(d, JSON.parse(JSON.stringify(v))); } } : {}) };
    const entry = await PL.publishSplit(io, plan, ver, roster, "x", () => 0);
    return { box, mk, entry };
  };
  const a = await run(false), b = await run(true);
  ok(sha(plan) === before && PL.versionOf(plan) === ver, "publishing the market's input leaves the plan and its version untouched");
  ok(sha([...a.box]) === sha([...b.box]) && sha(a.entry) === sha(b.entry), "every published file and the manifest entry are identical with and without the market's input");
  const terms = b.mk.get(Dd);
  ok(terms && terms.ver === ver && terms.day === Dd && Object.keys(terms.a).length > 100, `the input names the plan it was read from and its humans (${Object.keys(terms?.a || {}).length})`);
  ok(Object.keys(terms.n).every(k => roster.find(s => SIM.keyOf(s) === k)?.kind !== "citizen"), "no citizen is in the market's input");
  const badOnFile = Object.entries(terms.n).filter(([k, x]) => x[2] !== (A.untradable(roster.find(s => SIM.keyOf(s) === k)) ? 1 : 0));
  ok(!badOnFile.length, "each human's untradable flag is untradable() of its record");
  const c = await run(true);
  ok(sha(c.mk.get(Dd)) === sha(terms), "the input is deterministic: the same day gives the same terms");
  // the engine never lists an untradable human
  const s = E.initState(Dd);
  E.step(s, { day: Dd, part: terms });
  const listed = Object.keys(s.inst);
  ok(listed.length > 0 && listed.every(k => terms.n[k][2] === 0), "the engine lists only the tradable");
  // and no market source imports the score or writes a plan
  for (const f of ["src/market/engine.js", "src/market/rules.js", "src/market/activity.js", "netlify/lib/market.js", "netlify/functions/market.js", "netlify/functions/market-tick.js", "src/city/drives.js"]) {
    const src = readFileSync(f, "utf8");
    ok(!/from\s+["'][^"']*score\.js["']/.test(src) && !/putDay|putManifest|setPlan\(/.test(src), `${f}: reads no score and writes no plan`);
  }
}

// ==== the engine: determinism, replay, bounds, herding ===========================================
const city = M.cityOf(120, "k"), noise = M.hashNoise("k");
{
  const go = (n, from = null, start = 601) => { const s = from ? E.clone(from) : E.initState(start); for (let t = 0; t < n; t++) { const d = s.day + 1; E.step(s, { day: d, part: city.part(d), noise }); } return s; };
  const a = go(240), b = go(240);
  ok(sha(a) === sha(b), "two runs over the same days are identical, bit for bit");
  const mid = go(120), rest = go(120, mid);
  ok(sha(rest) === sha(a), "a replay from a snapshot lands on the same state");
  ok(sha(E.replay(mid, Array.from({ length: 120 }, (_, i) => ({ day: 721 + i, part: city.part(721 + i) })), noise)) === sha(a), "replay() is the same as stepping");
  assert.throws(() => E.step(E.clone(a), { day: a.day + 2, part: null })); checks++;
  assert.throws(() => E.step(E.clone(a), { day: a.day, part: null })); checks++;
  ok(true, "a day out of order is refused (a priced day is never priced again)");
  // bounds: every tick inside the tick band, every real day inside the day band
  const s = E.initState(601);
  let worstTick = 0, worstDay = 0, halts = 0;
  for (let t = 0; t < 600; t++) {
    const d = s.day + 1, prev = Object.fromEntries(Object.entries(s.inst).map(([k, I]) => [k, I.p]));
    const tick = E.step(s, { day: d, part: city.part(d), noise });
    halts += tick.halts.length;
    for (const [k, I] of Object.entries(s.inst)) {
      if (prev[k] && !I.u) worstTick = Math.max(worstTick, Math.abs(Math.log(I.p / prev[k])));
      if (!I.u) worstDay = Math.max(worstDay, Math.abs(I.p / I.o - 1));
    }
  }
  ok(worstTick <= s.knobs.tickBand + 0.0005, `no tick moves a price past the tick band (${(worstTick * 100).toFixed(2)}%)`);
  ok(worstDay <= s.knobs.dayBand + 0.0005, `no real day moves a price past the day band (${(worstDay * 100).toFixed(1)}%)`);
  ok(Object.values(s.inst).every(I => I.p >= 1 && Number.isFinite(I.p)), "prices stay finite and at least 1.00");
  ok(Math.abs(s.hvi.level / R.HVI_BASE - 1) < 0.35, `THE HUMAN VALUE INDEX does not drift off on its own (${s.hvi.level.toFixed(1)})`);
  // every listed human has a because, and nothing anywhere quotes anyone
  const whys = Object.keys(s.inst).filter(k => !s.inst[k].u).map(k => E.whyOf(s, k));
  ok(whys.every(w => w.length > 10 && !/["“”]/.test(w)) && s.events.every(e => !/["“”]/.test(e.line)), "every move has a because; no line quotes anyone");
  // herding: a crowd's orders move the price it fills at
  const h0 = E.clone(s), k = Object.keys(h0.inst).find(x => !h0.inst[x].u && !h0.inst[x].h);
  const crowd = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, case_hash: `c${i}`, slug: k, side: "buy", amount: 2000, held: 0 }));
  const lone = E.clone(s);
  const t1 = E.step(h0, { day: h0.day + 1, part: city.part(h0.day + 1), orders: crowd, noise });
  const t2 = E.step(lone, { day: lone.day + 1, part: city.part(lone.day + 1), orders: [crowd[0]], noise });
  ok(t1.fills[0].price > t2.fills[0].price && t1.fills[0].units <= t2.fills[0].units, `the crowd fills dearer than the lone buyer (${t1.fills[0].price} vs ${t2.fills[0].price})`);
  // caps: no holder past the position cap, nobody past the float
  const greedy = E.step(E.clone(s), { day: s.day + 1, part: city.part(s.day + 1), orders: [{ id: 1, case_hash: "g", slug: k, side: "buy", amount: 10_000_000, held: 0 }], noise });
  ok(greedy.fills[0].units <= R.KNOBS.positionCap * R.FLOAT, `one holder is held to the position cap (${greedy.fills[0].units})`);
  // a sale of more than is held fills only what is held; an unlisted human can still be sold
  const un = E.clone(s); un.inst[k].u = 1; un.inst[k].h = 1;
  const tu = E.step(un, { day: un.day + 1, part: null, orders: [{ id: 1, case_hash: "x", slug: k, side: "sell", units: 50, held: 20 }, { id: 2, case_hash: "x", slug: k, side: "buy", amount: 500, held: 0 }], noise });
  ok(tu.fills[0].units === 20 && tu.fills[0].cash > 0 && tu.fills[1].units === 0 && tu.fills[1].note === "UNLISTED", "an unlisted human: sells fill (nobody is trapped), buys are refused");
}

// ==== the NPCs: walls, guardrails, stabilizers ==================================================
{
  // polarize on purpose: tight guardrails, so the acquisitive cross them
  const knobs = { ...R.KNOBS, npcEach: 0.02, npcCap: 0.12 };
  const s = E.initState(601, knobs);
  const over = new Map();   // slug -> first real-day index it was past a guardrail
  let worstNpc = 0, worstEach = 0, fired = 0, late = [];
  for (let t = 0; t < 120 * 60; t++) {
    const d = s.day + 1;
    E.step(s, { day: d, part: city.part(d), noise });
    for (const [k, I] of Object.entries(s.inst)) {
      worstNpc = Math.max(worstNpc, I.npc / R.FLOAT);
      for (const n of Object.values(s.npc)) worstEach = Math.max(worstEach, (n.hold[k] || 0) / R.FLOAT);
    }
    if (t % 60 === 59) {
      const day = Math.floor(t / 60);
      for (const [k, I] of Object.entries(s.inst)) {
        const past = I.npc > knobs.npcCap * R.FLOAT || Object.values(s.npc).some(n => (n.hold[k] || 0) > knobs.npcEach * R.FLOAT * 2);
        if (past && !over.has(k)) over.set(k, day);
        if (!past) over.delete(k);
        if (past && day - over.get(k) > 3) late.push(`${k}@${day}`);
      }
    }
  }
  fired = s.events.filter(e => ["antitrust", "scandal", "run"].includes(e.kind)).length;
  ok(worstNpc <= knobs.npcHard + 1e-9 && worstEach <= knobs.npcEachHard + 1e-9, `the walls hold: NPCs ${(worstNpc * 100).toFixed(1)}% of a float at most, one NPC ${(worstEach * 100).toFixed(1)}%`);
  ok(fired > 0, `concentration polarized and a deus ex machina arrived (${fired} corners broken; kinds ${[...new Set(s.events.map(e => e.kind))].join(", ")})`);
  ok(!late.length, `every corner past a guardrail is broken within 3 real days (${late.slice(0, 4).join(" ")})`);
  ok(s.events.every(e => e.line && e.line.length > 20), "every event says why");
  console.log(`  polarized run (tight guardrails, 120 days): ${fired} corners broken, peak NPC share ${(worstNpc * 100).toFixed(1)}%, kinds ${[...new Set(s.events.map(e => e.kind))].join(", ")}`);
  const drives = new Set(Object.values(s.npc).map(n => n.drive));
  ok(drives.size >= 6, `the NPC class has many natures, not one bot (${[...drives].join(", ")})`);
}

// ==== fairness: Scott's three tests ===============================================================
{
  const pop = [{ kind: "savvy" }, { kind: "both" }, { kind: "worker" }, { kind: "saver" }, { kind: "idle" }, ...Array.from({ length: 20 }, () => ({ kind: "holder" })), ...Array.from({ length: 3 }, () => ({ kind: "chaser" }))];
  const ratios = [];
  for (const seed of ["c", "d", "e"]) {
    const r = M.runSim({ days: 30, players: pop, seed });
    const w = (kind) => r.players.find(p => p.kind === kind).worth;
    const rung = (kind) => w(kind).findIndex(x => x >= R.TARGETS.firstRung) + 1;
    ok(rung("saver") > 0 && rung("saver") <= R.TARGETS.firstRungDays, `seed ${seed}: a UBI-only saver reaches the first rung on day ${rung("saver")}`);
    const investors = r.players.filter(p => ["holder", "chaser", "savvy"].includes(p.kind));
    const slow = investors.map(p => p.worth.findIndex(x => x >= R.TARGETS.firstRung) + 1);
    ok(slow.every(d => d > 0 && d <= R.TARGETS.firstRungDays + 2), `seed ${seed}: a newcomer who invests everything still reaches it within ${R.TARGETS.firstRungDays + 2} days (worst day ${Math.max(...slow)})`);
    const labour = R.TARGETS.wagePerDay * 30;
    const savvy = ((w("savvy")[29] - w("saver")[29]) + (w("both")[29] - w("worker")[29])) / 2;
    ratios.push(savvy / labour);
    ok(w("both")[29] > w("worker")[29] && w("both")[29] > w("savvy")[29], `seed ${seed}: doing both beats working alone and investing alone`);
    ok(w("savvy")[29] > Math.max(...r.players.filter(p => p.kind === "chaser").map(p => p.worth[29])), `seed ${seed}: reading the city beats chasing yesterday's risers`);
  }
  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  ok(mean >= R.TARGETS.skillBand[0] && mean <= R.TARGETS.skillBand[1], `skill pays like labour: savvy's month gain is ${mean.toFixed(2)}x labour's (band ${R.TARGETS.skillBand.join("-")}; per seed ${ratios.map(x => x.toFixed(2)).join(", ")})`);
  // the top 1%: 100 citizens of every kind and the whole NPC class, 90 days, default knobs
  const kinds = ["idle", "saver", "worker", "savvy", "both", "holder", "holder", "holder", "chaser", "saver"];
  const big = M.runSim({ days: 90, players: Array.from({ length: 100 }, (_, i) => ({ kind: kinds[i % kinds.length] })), seed: "t" });
  const worth = [...big.players.map(p => p.worth[89]), ...E.npcBoard(big.state).map(n => n.worth)].sort((a, b) => b - a);
  const top = worth.slice(0, Math.max(1, Math.ceil(worth.length / 100))).reduce((a, b) => a + b, 0), all = worth.reduce((a, b) => a + b, 0);
  ok(top / all <= R.TARGETS.top1Share, `the top 1% hold ${(top / all * 100).toFixed(1)}% of market wealth after 90 days (bound ${R.TARGETS.top1Share * 100}%)`);
  ok(Object.values(big.state.levy).some(x => x > 0), "the concentration levy is collected from the NPC fortunes for the dividend");
  console.log(`  fairness: skill/labour ${mean.toFixed(2)}x (${ratios.map(x => x.toFixed(2)).join(", ")}); top 1% hold ${(top / all * 100).toFixed(1)}% after 90 days; ${big.state.events.length} events (${[...new Set(big.state.events.map(e => e.kind))].join(", ") || "none"})`);
}

// ==== the ledger's market functions (memory twin; HVI_ECON_PG runs check-economy on Postgres) =====
const DB = await import("../netlify/lib/economy-db.js");
const L = DB.memoryLedger();
globalThis.__econLedger = L;
const inv = () => {
  const db = L.db;
  const sums = new Map();
  for (const e of db.entries) sums.set(e.txn_id, (sums.get(e.txn_id) || 0) + e.amount);
  ok([...sums.values()].every(x => x === 0), "every txn sums to zero");
  ok([...db.accounts.values()].every(a => a.balance === db.entries.filter(e => e.account === a.id).reduce((s, e) => s + e.amount, 0)), "every balance is the sum of its entries");
  ok([...db.accounts.values()].every(a => a.kind === "dept" || a.balance >= 0), "no citizen account below zero");
};
{
  const h = "a".repeat(32), g = "b".repeat(32);
  await L.rpc("econ_enrol", { case_hash: h, vest_day: "2026-10-01", exempt: true });
  await L.rpc("econ_post", { idem: "seed", kind: "ubi", case_hash: h, day: "2026-10-05", legs: [{ account: "dept:treasury", amount: -5000 }, { account: `cash:${h}`, kind: "cash", amount: 5000 }], claims: ["2026-10-05"] });
  let r = await L.rpc("econ_order_place", { idem: "o1", case_hash: h, slug: "ada-lovelace", side: "buy", amount: 1200 });
  ok(r.ok && L.db.accounts.get(`esc:${h}`).balance === 1200 && L.db.accounts.get(`cash:${h}`).balance === 3800, "a buy escrows its CYCLES in the case's own account");
  ok((await L.rpc("econ_order_place", { idem: "o1", case_hash: h, slug: "ada-lovelace", side: "buy", amount: 1200 })).dup, "the same order twice is one order");
  ok((await L.rpc("econ_order_place", { idem: "o2", case_hash: h, slug: "x", side: "buy", amount: 999999 })).error === "insufficient", "a buy past the cash is refused");
  ok((await L.rpc("econ_order_place", { idem: "o3", case_hash: h, slug: "ada-lovelace", side: "sell", units: 1 })).error === "no-shares", "a sell of shares not held is refused");
  const batch = await L.rpc("econ_orders_batch", { tick_day: 700 });
  ok(batch.length === 1 && batch[0].held === 0, "the tick reads the pending batch with the holder's shares");
  await L.rpc("econ_orders_fill", { tick_day: 700, hold_hours: 24, fills: [{ id: batch[0].id, units: 11, cash: 1105, price: 100.4 }] });
  ok(L.db.accounts.get(`esc:${h}`).balance === 0 && L.db.accounts.get(`cash:${h}`).balance === 3800 + 95 && L.db.shares.get(`${h}|ada-lovelace`).units === 11, "a fill spends the escrow, refunds the rest, and books the shares");
  await L.rpc("econ_orders_fill", { tick_day: 700, hold_hours: 24, fills: [{ id: batch[0].id, units: 11, cash: 1105 }] });
  ok(L.db.shares.get(`${h}|ada-lovelace`).units === 11 && L.db.txns.filter(t => t.kind === "ofill").length === 1, "a fill is applied once");
  ok((await L.rpc("econ_order_place", { idem: "o4", case_hash: h, slug: "ada-lovelace", side: "sell", units: 5 })).error === "locked", "a purchase is held before it can be sold");
  L.db.shares.get(`${h}|ada-lovelace`).locked_until = 0;
  r = await L.rpc("econ_order_place", { idem: "o5", case_hash: h, slug: "ada-lovelace", side: "sell", units: 5 });
  ok(r.ok && L.db.shares.get(`${h}|ada-lovelace`).reserved === 5, "a sell reserves its shares");
  ok((await L.rpc("econ_order_place", { idem: "o6", case_hash: h, slug: "ada-lovelace", side: "sell", units: 7 })).error === "no-shares", "reserved shares cannot be sold twice");
  const b2 = await L.rpc("econ_orders_batch", { tick_day: 701 });
  await L.rpc("econ_orders_fill", { tick_day: 701, fills: [{ id: b2[0].id, units: 5, cash: 498 }] });
  ok(L.db.shares.get(`${h}|ada-lovelace`).units === 6 && L.db.shares.get(`${h}|ada-lovelace`).reserved === 0, "a sell fill takes the shares and releases the reservation");
  // a refused buy returns the whole escrow
  await L.rpc("econ_order_place", { idem: "o7", case_hash: h, slug: "ada-lovelace", side: "buy", amount: 300 });
  const b3 = await L.rpc("econ_orders_batch", { tick_day: 702 });
  const cash0 = L.db.accounts.get(`cash:${h}`).balance;
  await L.rpc("econ_orders_fill", { tick_day: 702, fills: [{ id: b3.find(o => o.status === "pending").id, units: 0, cash: 0, note: "HALTED" }] });
  ok(L.db.accounts.get(`cash:${h}`).balance === cash0 + 300 && L.db.orders.at(-1).status === "refused", "a refused buy comes back whole");
  // the batch of a re-run tick is the same batch
  ok((await L.rpc("econ_orders_batch", { tick_day: 702 })).map(o => o.id).join() === b3.map(o => o.id).join(), "a re-run of a tick reads the same batch");
  // no transfers
  await assert.rejects(L.rpc("econ_post", { idem: "t1", kind: "buy", case_hash: h, legs: [{ account: `cash:${h}`, amount: -10 }, { account: `cash:${g}`, amount: 10 }] })); checks++;
  inv();
  // the levy and the dividend: once a day; paid with the next COLLECT to the aged
  L.db.citizens.get(h).at = Date.parse("2026-09-01T00:00:00Z");
  const lv = await L.rpc("econ_levy_close", { day: "2026-10-05", levies: [{ case_hash: h, amount: 50 }], npc_pool: 950, share: 1 });
  ok(lv.pool === 1000 && lv.eligible === 1 && lv.per_citizen === 1000, `the day's levy and the NPCs' pool become a dividend (${JSON.stringify(lv)})`);
  ok((await L.rpc("econ_levy_close", { day: "2026-10-05", levies: [{ case_hash: h, amount: 50 }], npc_pool: 950 })).dup && L.db.txns.filter(t => t.kind === "levy").length === 1, "a day is levied and declared once");
  const Ec = await import("../netlify/lib/economy.js");
  const dd = Ec.dividendDays(["2026-10-06", "2026-10-07"], { "2026-10-05": 1000 }, { enrolled_at: "2026-09-01T00:00:00Z" });
  ok(dd.total === 1000 && dd.by["2026-10-06"] === 1000, "the dividend lands with the next day's allowance");
  ok(Ec.dividendDays(["2026-10-06"], { "2026-10-05": 1000 }, { enrolled_at: "2026-10-03T00:00:00Z" }).total === 0, "a wallet younger than a week draws no dividend");
  inv();
  await L.rpc("econ_purge", { case_hash: h });
  ok(![...L.db.shares.values()].some(s => s.case_hash === h) && !L.db.orders.some(o => o.case_hash === h), "purge takes the market rows too");
  inv();
  const sql = readdirSync("supabase/migrations").map(f => readFileSync(`supabase/migrations/${f}`, "utf8")).join("\n");
  ok(!/function\s+\w*(transfer|gift|cash_?out|withdraw|redeem)\w*\s*\(/i.test(sql), "no transfer function in the schema");
  ok(/econ_orders_fill/.test(sql) && /enable row level security/.test(readFileSync("supabase/migrations/20261005230000_market_slice1.sql", "utf8")), "the market's tables are under RLS");
}

// ==== the tick and /api/market, end to end ========================================================
{
  const MK = await import("../netlify/lib/market.js");
  const { getStore } = await import("@netlify/blobs");
  const S = getStore({ name: MK.MARKET_STORE });
  globalThis.__econLedger = DB.memoryLedger();
  const L2 = globalThis.__econLedger;
  const minute = 60_000, at = (d) => SIM.CITY_EPOCH + d * 24 * minute + 1000;   // just after machine day d ends
  const D0 = 700;
  for (let d = D0; d < D0 + 80; d++) await S.setJSON(`in/${d}`, city.part(d));
  let r = await MK.runTick(at(D0), { ledger: L2 });
  ok(r.day === D0 && r.done.length === 1, `the first tick prices the last completed day (${JSON.stringify(r).slice(0, 80)})`);
  ok((await MK.runTick(at(D0), { ledger: L2 })).skipped === "up to date", "a second run in the same day changes nothing");
  // a citizen with CYCLES orders; the next tick fills it
  const { store: caseStore } = { store: null };
  const h = DB.caseHash("HVI-TEST0001");
  await L2.rpc("econ_enrol", { case_hash: h, vest_day: "2026-10-01", exempt: true });
  await L2.rpc("econ_post", { idem: "s", kind: "ubi", case_hash: h, day: "2026-10-05", legs: [{ account: "dept:treasury", amount: -3000 }, { account: `cash:${h}`, kind: "cash", amount: 3000 }], claims: ["2026-10-05"] });
  MK.forgetMarket();
  const st = await S.get("state");
  const slug = Object.keys(st.inst).find(k => !st.inst[k].u && !st.inst[k].h);
  globalThis.__econLedger = L2;
  const o = await MK.placeOrder("HVI-TEST0001", { side: "buy", slug, amount: 1000, nonce: "nonce-0001" });
  ok(o.ok && /NEXT TICK/.test(o.line), "an order is filed for the next tick");
  ok((await MK.placeOrder("HVI-TEST0001", { side: "buy", slug: "no-such-human", amount: 1000 })).status === 404, "an unlisted human cannot be bought");
  r = await MK.runTick(at(D0 + 1), { ledger: L2 });
  const sh = L2.db.shares.get(`${h}|${slug}`);
  ok(r.done[0].fills === 1 && sh?.units > 0, `the next tick fills it at the new price (${sh?.units} shares)`);
  const j = await S.get(`j/${D0 + 1}`);
  ok(j.orders.length === 1, "the tick journaled its batch before filling it");
  // a re-run of a priced day (the state write lost) reads the journal and changes nothing
  const stAfter = await S.get("state");
  globalThis.__blobs.get(MK.MARKET_STORE).set("state", { data: st, etag: "old" });
  const r2 = await MK.runTick(at(D0 + 1), { ledger: L2 });
  const stAgain = await S.get("state");
  ok(sha(stAgain) === sha(stAfter) && L2.db.shares.get(`${h}|${slug}`).units === sh.units && L2.db.txns.filter(t => t.kind === "ofill").length === 1, `a re-run of the same day replays the same batch to the same state, and fills nothing twice (${JSON.stringify(r2).slice(0, 60)})`);
  // catching up after an outage: every day in order, none skipped
  r = await MK.runTick(at(D0 + 30), { ledger: L2 });
  ok(r.day === D0 + 30 && r.done.length === 29, `after an outage the tick catches up in order (${r.done.length} days)`);
  const board = await S.get("board");
  ok(board.rows.length > 50 && board.ticker[0].startsWith("HUMAN VALUE INDEX") && board.floor.length > 10 && board.leaderboard.length > 0, "the board: the list, the ticker, the floor, the leaders");
  ok(board.rows.every(x => x.why && x.why.length > 5), "every row says why it moved");
  ok(board.leaderboard.some(x => x.kind === "citizen") && board.leaderboard.some(x => x.kind === "npc") && board.leaderboard.every(x => !/HVI-/.test(x.name)), "the leaders mix citizens and NPCs, and never show a case number");
  ok(JSON.stringify(board).length < 400_000, `the board stays small (${Math.round(JSON.stringify(board).length / 1024)} KB at ${board.count} humans)`);
  const series = await S.get(`series/${E.realDayOf(D0 + 1)}`);
  ok(series.days.length >= 2 && series.p[slug].length === series.days.length, "the day's price series has a point per machine day");
  // the API
  MK.forgetMarket();
  const fn = (await import("../netlify/functions/market.js")).default;
  const res = await fn(new Request("https://x/api/market?ticker=1"));
  const tk = await res.json();
  ok(res.status === 200 && tk.ticker.length > 3 && /max-age/.test(res.headers.get("cache-control")), "the ticker is served small and cached");
  ok(Array.isArray(tk.movers?.up) && Array.isArray(tk.movers?.down) && tk.movers.up.every(r => r.chg > 0 && r.why !== undefined) && tk.movers.down.every(r => r.chg < 0), "the ticker carries the risers and the fallers, each with its because");
  const res2 = await fn(new Request(`https://x/api/market?slug=${slug}`));
  ok(res2.status === 200 && (await res2.json()).detail.today.length > 0, "one human's detail carries today's ticks");
  const bad = await fn(new Request("https://x/api/market", { method: "POST", body: JSON.stringify({ caseId: "HVI-TEST0001", action: "transfer", to: "x" }) }));
  ok(bad.status === 400 && /does not sell, cash out, gift or transfer/i.test((await bad.json()).error), "there is no transfer action");
  // the dividend close waits for the market to roll past the day, then declares once
  const Mk = await import("../netlify/lib/market.js");
  const rd = E.realDayOf(D0);
  const c1 = await Mk.closeMarketDay(rd, { S, L: L2 });
  ok(c1.ok && Number.isFinite(c1.per_citizen), `the market's day closes with a dividend (${JSON.stringify(c1)})`);
  ok((await Mk.closeMarketDay(E.realDayOf(D0 + 30), { S, L: L2 })).skipped, "a day the market has not rolled past is not closed");
}

// ==== the page ships light ========================================================================
{
  const app = readFileSync("src/App.jsx", "utf8");
  const desk = readFileSync("src/front/FrontDesk.jsx", "utf8");   // the landing's side windows (a lazy chunk)
  ok(/lazy\(\(\) => import\("\.\/market\/Market\.jsx"\)\)/.test(app) && /lazy\(\(\) => import\("\.\/front\/FrontDesk\.jsx"\)\)/.test(app) && /\/api\/market\?ticker=1/.test(desk), "the market page is lazy; the landing fetches the ticker, never bundles it");
  const page = readFileSync("src/market/Market.jsx", "utf8");
  ok(page.includes("LEDE") && /<table/.test(page) && /<caption/.test(page) && /aria-expanded/.test(page), "one plain line, a real table with a caption, expandable rows");
  ok(R.LEDE === "PUT YOUR DAILY CYCLES TO WORK. PRICES MOVE WITH WHAT HAPPENS IN THE CITY.", "the market's one line is Scott's");
  ok(/prefers-reduced-motion/.test(readFileSync("src/market/market.css", "utf8")), "the floor's board holds still under reduced motion");
}

console.log(`check-market: ${checks} checks passed`);
