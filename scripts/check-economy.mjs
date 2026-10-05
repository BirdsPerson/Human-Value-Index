// THE TREASURY, slice 1: the rules (tray, the 7-day cap, spending, herding, the yield read
// deterministically from a day summary) and /api/economy end to end on in-memory Blobs and the
// in-memory ledger (netlify/lib/economy-db.js memoryLedger): double-entry invariants after every
// step, idempotent UBI (a double click, a race), the lock, no transfer path anywhere, the close
// (once, recomputable), purge removing the case's ledger, the closed state with no ledger, and
// that nothing in the economy touches a score.
// HVI_ECON_PG=1 also runs the ledger suite against a real Postgres with the migration applied
// (psql on PGHOST/PGPORT/PGUSER), the same functions production calls.
// Run: node scripts/check-economy.mjs
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

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

const R = await import("../src/economy/rules.js");
const DB = await import("../netlify/lib/economy-db.js");
const E = await import("../netlify/lib/economy.js");
const econ = (await import("../netlify/functions/economy.js")).default;
const F = await import("../netlify/functions/economy.js");
const purge = (await import("../netlify/functions/purge.js")).default;
const { runClose } = await import("../netlify/functions/econ-close.js");

let checks = 0;
const ok = (c, m) => { checks++; assert.ok(c, m); };
const eq = (a, b, m) => { checks++; assert.deepEqual(a, b, m); };

// ==== RULES ===================================================================================
{
  // the tray: never more than 7 days, never before the vest day, never a claimed day
  let t = R.trayDays({ today: "2026-10-20", vestDay: "2026-10-01" });
  eq(t.days, ["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20"], "tray: the last 7 days");
  eq(t.lost, 13, "tray: 13 days returned to the commons (10-01..10-13)");
  t = R.trayDays({ today: "2026-10-20", vestDay: "2026-10-18" });
  eq(t.days, ["2026-10-18", "2026-10-19", "2026-10-20"], "tray: from the vest day"); eq(t.lost, 0, "nothing lost before vesting");
  t = R.trayDays({ today: "2026-10-20", vestDay: "2026-10-01", claimed: ["2026-10-18", "2026-10-19"], lastClaim: "2026-10-19" });
  eq(t.days, ["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-20"], "tray: claimed days are not paid twice");
  eq(t.lost, 0, "tray: nothing lost after a recent claim");
  t = R.trayDays({ today: "2026-10-20", vestDay: "2026-10-25" });
  eq(t.days, [], "tray: nothing while vesting");
  for (let i = 0; i < 400; i++) {
    const today = R.addDays("2026-10-01", i % 90), vest = R.addDays("2026-09-01", (i * 7) % 120);
    const tt = R.trayDays({ today, vestDay: vest });
    ok(tt.days.length <= R.TRAY_DAYS, "the 7-day accrual cap holds");
    ok(tt.days.every(d => d >= vest && d <= today), "tray days within vest..today");
  }
  eq(R.vestDayOf([{ at: "2026-10-01T15:00:00Z", score: 400 }, { at: "2026-10-04T01:00:00Z", score: 500 }]), "2026-10-03", "vest: the file's third day");
  // the citizen's own spending: ~300, deterministic per case and day
  const sp = Array.from({ length: 500 }, (_, i) => R.spendFor("abc", R.addDays("2026-01-01", i)));
  ok(sp.every(x => x >= 260 && x <= 340), "spend 260..340"); ok(Math.abs(sp.reduce((a, b) => a + b) / sp.length - 300) < 6, "spend averages ~300");
  eq(R.spendFor("abc", "2026-10-05"), R.spendFor("abc", "2026-10-05"), "spend deterministic");
  // herding: a fair share earns full yield; double a fair share a third; nothing thins below a fair share
  ok(Math.abs(R.herding(1 / 7) - 1) < 1e-12, "herding: fair share = 1");
  ok(Math.abs(R.herding(2 / 7) - 1 / 3) < 1e-12, "herding: double share = 1/3");
  ok(Math.abs(R.herding(1) - 1 / 13) < 1e-12, "herding: everything in one industry = 1/13");
  eq(R.herding(0), 1, "herding: empty = 1"); eq(R.herding(0.05), 1, "herding: under a fair share = 1");
  // the yield: clamp(0.3% (I - 1) + 0.2%, -1%, +1%) x H on gains only
  eq(R.yieldPpm(1), 2000, "I = 1: +0.20%"); eq(R.yieldPpm(1, 1 / 3), 667, "thinned gain");
  eq(R.yieldPpm(100), 10000, "capped at +1%"); eq(R.yieldPpm(-100), -10000, "floored at -1%");
  eq(R.yieldPpm(0, 1 / 13), -1000, "losses are never thinned");
  eq(R.gainOf(12345, 2000), 24, "gain truncates"); eq(R.gainOf(12345, -2000), -24, "loss truncates toward zero");
}

// A day summary in the published shape (plans.js publishSplit): civic moods, far-view counts, THE MALL.
function summaryFixture(seed = 1) {
  const ds = ["arts", "campus", "finance", "strip", "arena", "hq", "archive", "commons", "works", "sprawl", "coast", "heights"];
  const civic = { districts: Object.fromEntries(ds.map((d, i) => [d, { mood: { s: ((i * 37 + seed * 11) % 120) - 60 } }])) };
  const d = Object.fromEntries(ds.map((x, i) => [x, Array.from({ length: 48 }, (_, k) => ((i + 3) * (k + seed)) % 90)]));
  const units = { "sf-strip-1": {}, "sf-strip-2": {}, "sf-heights-1": {}, "sf-coast-1": {}, "sf-campus-1": {}, "sf-commons-1": {} };
  const biz = [
    { id: "0001", units: ["sf-strip-1"], takings: [100, 120 + seed] }, { id: "0002", units: ["sf-heights-1"], takings: [80, 60] },
    { id: "0003", units: ["sf-campus-1"], takings: [40, 30 * seed] }, { id: "0004", units: ["sf-commons-1"], takings: [10, 20] },
  ];
  return { day: 900 + seed, civic, d, enterprise: { units, biz } };
}
{
  const s = summaryFixture(1);
  const a = R.dayReturns(s, {}), b = R.dayReturns(JSON.parse(JSON.stringify(s)), {});
  eq(a, b, "returns are deterministic from the summary");
  ok(Object.values(a).every(x => x.ppm >= -10000 && x.ppm <= 10000), "every yield within -1%..+1%");
  ok(new Set(Object.values(a).map(x => x.ppm)).size > 2, "the industries differ");
  const inp = R.summaryInputs(s);
  eq(inp.leisure.takings, 121, "LEISURE reads the Strip's storefront takings");
  eq(inp.finance.takings, null, "FINANCE has no storefronts: neutral on takings");
  eq(inp.resort.takings, 60, "RESORT reads the Coast + the Heights");
  const I = R.industryIndex(inp);
  ok(Math.abs(R.INDUSTRY_IDS.reduce((n, id) => n + 0.5 * ((100 + inp[id].mood) / (R.INDUSTRY_IDS.reduce((m, j) => m + 100 + inp[j].mood, 0) / 7)), 0) / 7 - 0.5) < 1e-9, "the mood term averages 1 (I = 1 is the city mean)");
  ok(Object.values(I).every(x => x >= 0 && x <= 3), "index within 0..3");
  // herding in a close: everything in FINANCE thins FINANCE's gain, never its loss
  const crowd = R.dayReturns(s, { finance: 1000 });
  eq(crowd.finance.herd, R.herding(1) === 1 / 13 ? Math.round((1 / 13) * 1e4) / 1e4 : null, "herd recorded");
  ok(a.finance.ppm > 0 ? crowd.finance.ppm < a.finance.ppm : crowd.finance.ppm === a.finance.ppm, "crowding thins FINANCE");
  eq(R.dayReturns(null, {}).finance.ppm, 2000, "no summary: neutral (+0.20%)");
}

// ==== THE LEDGER'S INVARIANTS ===================================================================
// against a backend: every txn sums to zero; every balance is the sum of its entries; the
// whole ledger sums to zero; no citizen account below zero; no txn touches two cases.
function memInvariants(L, label) {
  const { db } = L;
  const byTxn = new Map();
  for (const e of db.entries) byTxn.set(e.txn_id, (byTxn.get(e.txn_id) || 0) + e.amount);
  for (const t of db.txns) ok((byTxn.get(t.id) || 0) === 0, `${label}: txn ${t.idem_key} sums to zero`);
  const byAcct = new Map();
  for (const e of db.entries) byAcct.set(e.account, (byAcct.get(e.account) || 0) + e.amount);
  let total = 0;
  for (const a of db.accounts.values()) {
    ok(a.balance === (byAcct.get(a.id) || 0), `${label}: ${a.id} balance = its entries`);
    ok(a.kind === "dept" || a.balance >= 0, `${label}: ${a.id} not negative`);
    total += a.balance;
  }
  ok(total === 0, `${label}: the ledger sums to zero`);
  for (const t of db.txns) {
    const owners = new Set(db.entries.filter(e => e.txn_id === t.id && !e.account.startsWith("dept:")).map(e => db.accounts.get(e.account)?.case_hash));
    ok(owners.size <= 1, `${label}: txn ${t.idem_key} touches one case at most`);
  }
}

// ==== /api/economy END TO END (memory ledger) ===================================================
const HOST = "https://humanvalueindex.com";
const call = async (method, body, { ip = "192.0.2.10", q = "" } = {}) => {
  const r = await econ(new Request(HOST + "/api/economy" + q, method === "GET" ? { method, headers: { origin: HOST } } : { method, headers: { "content-type": "application/json", origin: HOST }, body: JSON.stringify(body) }), { ip });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const cases = () => globalThis.__blobs.get("hvi-cases");
const putCase = (id, rec) => { if (!globalThis.__blobs.has("hvi-cases")) globalThis.__blobs.set("hvi-cases", new Map()); cases().set(id, { data: rec, etag: "x" + id }); };
const clearLimits = () => globalThis.__blobs.get("hvi-limits")?.clear();
const DAY = 86_400_000;
const realNow = Date.now;
let fake = Date.parse("2026-10-20T12:00:00Z");
Date.now = () => fake;
const A = "HVI-AAAAAAAA", B = "HVI-BBBBBBBB", U = "HVI-UNASSESS";
putCase(A, { history: [{ at: "2026-09-01T10:00:00Z", score: 512, tier: "MONITORED CIVILIAN" }] });
putCase(B, { history: [{ at: "2026-10-20T10:00:00Z", score: 700, tier: "RETAINED" }] });
putCase(U, { history: [] });

// ---- closed: no ledger configured --------------------------------------------------------------
{
  ok(DB.ledger() === null, "no Supabase secrets, no memory flag: the economy is closed");
  let r = await call("GET", null);
  eq([r.status, r.body.open, r.body.closedLine], [200, false, R.CLOSED_LINE], "closed board says THE TREASURY IS NOT YET OPEN.");
  ok(r.body.board.industries.length === 7, "the board still lists the seven industries");
  r = await call("GET", null, { q: `?caseId=${A}` });
  eq([r.status, r.body.open], [200, false], "closed file view");
  ok(r.body.apartment?.buildingName && r.body.apartment?.districtName, "the apartment reads with the Treasury closed");
  ok(r.body.apartment.href.startsWith(`#city/${r.body.apartment.district}/`), "the apartment links into the city");
  r = await call("POST", { caseId: A, action: "collect" });
  eq([r.status, r.body.error], [503, R.CLOSED_LINE], "closed: COLLECT refused, nothing moves");
  eq(await DB.purgeLedger(A), { ok: true, skipped: true }, "closed: purge has no ledger to clear");
}

const L = DB.memoryLedger();
globalThis.__econLedger = L;
const before = JSON.stringify([...globalThis.__blobs.get("hvi-cases")].map(([k, v]) => [k, v.data]));

// ---- the gate ------------------------------------------------------------------------------------
{
  let r = await call("POST", { caseId: A, action: "transfer", to: B, amount: 5 });
  ok(r.status === 400 && /does not sell, cash out, gift or transfer/.test(r.body.error), "transfer: no such action");
  for (const a of ["gift", "send", "cashout", "cash-out", "purchase", "buy-cycles", "redeem", "withdraw", "deposit", "pay"]) {
    r = await call("POST", { caseId: A, action: a, amount: 1 });
    ok(r.status === 400, `no ${a} action`);
  }
  eq(F.ACTIONS, ["collect", "buy", "sell"], "the only writes: collect, buy, sell");
  r = await call("POST", { caseId: U, action: "collect" });
  ok(r.status === 403, "an unassessed file draws nothing");
  r = await call("POST", { caseId: "HVI-ZZZZZZZZ", action: "collect" });
  ok(r.status === 404, "no such file");
  r = await econ(new Request(HOST + "/api/economy", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ caseId: A, action: "collect" }) }), { ip: "192.0.2.1" });
  ok(r.status === 403, "foreign origin refused");
}

// ---- COLLECT: 7-day cap, net of spending, idempotent ------------------------------------------------
{
  let r = await call("GET", null, { q: `?caseId=${A}` });
  eq([r.status, r.body.open, r.body.wallet.enrolled, r.body.wallet.tray.days], [200, true, false, 7], "A: 7 days waiting (assessed 09-01, vested 09-03)");
  eq(r.body.wallet.tray.lost, 41, "A: 41 earlier days (09-03..10-13) returned to the commons");
  const expectNet = r.body.wallet.tray.net;
  ok(expectNet === 7000 - r.body.wallet.tray.spend && r.body.wallet.tray.spend > 1800 && r.body.wallet.tray.spend < 2400, "the tray is net of the citizen's own spending");
  // a double click and a race: three collects at once
  const rs = await Promise.all([1, 2, 3].map(() => call("POST", { caseId: A, action: "collect", device: "a".repeat(32) })));
  ok(rs.every(x => x.status === 200), "three concurrent collects all answer");
  const paid = rs.map(x => x.body.last.collected);
  eq(paid.filter(x => x > 0).length, 1, "one collect pays; the others are duplicates");
  eq(paid.reduce((a, b) => a + b), expectNet, "paid exactly the tray, once");
  const w = rs.find(x => x.body.last.collected > 0).body;
  eq(w.wallet.balance, expectNet, "balance = the tray");
  ok(/YOU WERE AWAY 7 DAYS/.test(w.last.line) && /RETURNED TO THE COMMONS/.test(w.last.line), "the Overlord's absence line");
  eq(L.db.txns.filter(t => t.kind === "ubi").length, 1, "one UBI txn");
  eq([...L.db.claims.keys()].filter(k => k.startsWith(DB.caseHash(A))).length, 7, "seven claim rows, one per day");
  r = await call("POST", { caseId: A, action: "collect" });
  eq(r.body.last.collected, 0, "a second collect the same day: nothing");
  memInvariants(L, "after collect");
  // the next day: one more day
  fake += DAY; clearLimits();
  r = await call("POST", { caseId: A, action: "collect" });
  eq(r.body.last.days, 1, "next day: one day waiting"); ok(/DAILY ALLOWANCE DEPOSITED/.test(r.body.last.line), "one day: the daily line");
  eq(r.body.wallet.balance, expectNet + 1000 - R.spendFor(DB.caseHash(A), "2026-10-21"), "balance tells the story: +1,000 less the day's spending");
  ok(r.body.wallet.recent[0].kind === "ubi" && r.body.wallet.recent[0].memo.days[0][2] === R.spendFor(DB.caseHash(A), "2026-10-21"), "the spending is an entry with the day, aggregate");
  // B: assessed yesterday, vests tomorrow
  r = await call("POST", { caseId: B, action: "collect", device: "a".repeat(32) });
  eq([r.status, r.body.last.collected, r.body.last.vesting], [200, 0, "2026-10-22"], "B vests on its file's third day");
  memInvariants(L, "after day 2");
}

// ---- anti-farming: device and address caps ---------------------------------------------------------
{
  clearLimits();
  const ids = ["HVI-CCCCCCCC", "HVI-DDDDDDDD", "HVI-EEEEEEEE", "HVI-FFFFFFFF", "HVI-GGGGGGGG", "HVI-HHHHHHHH"];
  for (const id of ids) putCase(id, { history: [{ at: "2026-10-01T00:00:00Z", score: 300, tier: "MONITORED CIVILIAN" }] });
  // the device that enrolled A and B is full
  let r = await call("POST", { caseId: ids[0], action: "collect", device: "a".repeat(32) }, { ip: "198.51.100.1" });
  eq(r.status, 403, "a third case on one device is refused"); ok(/terminal/.test(r.body.error), "device line");
  // one address: 4 new wallets a week (A and B came from 192.0.2.10: two more, then refused)
  const got = [];
  for (const id of ids.slice(1, 5)) got.push((await call("POST", { caseId: id, action: "collect", device: id.slice(-8).toLowerCase().replace(/[^a-f0-9]/g, "a").padEnd(32, "0") })).status);
  eq(got, [200, 200, 403, 403], "four enrolments per address per week");
  eq(L.db.citizens.size, 4, "four wallets enrolled");
  memInvariants(L, "after caps");
}

// ---- investing: buy, idempotent orders, the lock, sell, the close ----------------------------------
{
  clearLimits();
  let r = await call("POST", { caseId: A, action: "buy", industry: "finance", amount: 99, nonce: "nonce-0001" });
  ok(r.status === 400 && /minimum/.test(r.body.error), "min 100");
  r = await call("POST", { caseId: A, action: "buy", industry: "crypto", amount: 500, nonce: "nonce-0002" });
  ok(r.status === 400, "no such industry");
  r = await call("POST", { caseId: A, action: "buy", industry: "finance", amount: 10_000_000, nonce: "nonce-0003" });
  ok(r.status === 400, "over the order cap");
  r = await call("POST", { caseId: A, action: "buy", industry: "finance", amount: 900_000, nonce: "nonce-0004" });
  ok(r.status === 402, "cannot buy with CYCLES you do not have");
  const bal0 = (await call("GET", null, { q: `?caseId=${A}` })).body.wallet.balance;
  const two = await Promise.all([1, 2].map(() => call("POST", { caseId: A, action: "buy", industry: "finance", amount: 3000, nonce: "nonce-0005" })));
  ok(two.every(x => x.status === 200), "double-clicked buy answers twice");
  r = await call("GET", null, { q: `?caseId=${A}` });
  eq(r.body.wallet.balance, bal0 - 3000, "a double-clicked order is charged once");
  eq(r.body.wallet.positions.map(p => [p.industry, p.value, p.basis]), [["finance", 3000, 3000]], "position on file");
  r = await call("POST", { caseId: A, action: "buy", industry: "sport", amount: 1000, nonce: "nonce-0006" });
  eq(r.status, 200, "a second industry");
  r = await call("POST", { caseId: A, action: "sell", industry: "finance", amount: 500, nonce: "nonce-0007" });
  ok(r.status === 409 && /held 3 days/.test(r.body.error), "sold inside the lock: refused");
  memInvariants(L, "after buys");
  // close the day: deterministic from the summary, applied once
  const s = summaryFixture(2);
  const c1 = await E.closeDay("2026-10-21", { summary: { summary: s, machineDay: 1501, ver: "1501.abcdef012345" } });
  const exp = R.dayReturns(s, { finance: 3000, sport: 1000 });
  eq(c1.returns.finance, exp.finance.ppm, "close: FINANCE's yield as the rules read it");
  ok(exp.finance.herd < 1, "FINANCE holds 75% of the invested CYCLES: herding thins it");
  eq(c1.positions, [exp.finance.ppm, exp.sport.ppm].filter((p, i) => R.gainOf([3000, 1000][i], p) !== 0).length, "every position credited");
  r = await call("GET", null, { q: `?caseId=${A}` });
  const fin = r.body.wallet.positions.find(p => p.industry === "finance");
  eq(fin.value, 3000 + R.gainOf(3000, exp.finance.ppm), "the credit: trunc(value x ppm / 1e6)");
  eq(fin.pl, R.gainOf(3000, exp.finance.ppm), "P/L on file");
  const c2 = await E.closeDay("2026-10-21", { summary: { summary: summaryFixture(9), machineDay: 1, ver: "x" } });
  eq(c2.positions, 0, "a second close of the same day applies nothing");
  eq(L.db.returns.get("2026-10-21|finance").ppm, exp.finance.ppm, "the first close's figures stand");
  eq(L.db.returns.get("2026-10-21|finance").machine_day, 1501, "the close names the summary it read");
  r = await call("GET", null);
  const bf = r.body.board.industries.find(i => i.id === "finance");
  eq([bf.invested, bf.holders, bf.last.ppm], [fin.value, 1, exp.finance.ppm], "the board: invested, holders, yesterday's return");
  ok(r.body.board.commentary.some(l => /FINANCE IS CROWDED/.test(l)), "the Overlord notices the crowd");
  memInvariants(L, "after close");
  // the lock lifts after 3 days
  fake += 3 * DAY + 60_000; clearLimits();
  r = await call("POST", { caseId: A, action: "sell", industry: "finance", amount: 1000, nonce: "nonce-0008" });
  eq(r.status, 200, "sold after the lock");
  r = await call("GET", null, { q: `?caseId=${A}` });
  const fin2 = r.body.wallet.positions.find(p => p.industry === "finance");
  eq(fin2.value, fin.value - 1000, "the position shrinks by the sale");
  ok(Math.abs(fin2.basis - (3000 - Math.round(3000 * 1000 / fin.value))) <= 1, "the basis shrinks pro rata");
  r = await call("POST", { caseId: A, action: "sell", industry: "finance", amount: 999_999, nonce: "nonce-0009" });
  eq(r.status, 200, "sell more than held: sells what is held");
  r = await call("GET", null, { q: `?caseId=${A}` });
  ok(!r.body.wallet.positions.some(p => p.industry === "finance"), "the position is closed");
  memInvariants(L, "after sells");
  // the scheduled close: catches up the missed days, then does nothing
  const run1 = await runClose(fake);
  ok(run1.closed.length >= 1, "the scheduled close closes the days since the last");
  const run2 = await runClose(fake);
  eq(run2.closed.length, 0, "and then nothing");
  memInvariants(L, "after scheduled close");
}

// ---- no transfers, even at the ledger -----------------------------------------------------------------
{
  const hA = DB.caseHash(A), hB = DB.caseHash(B);
  await assert.rejects(() => L.rpc("econ_post", { idem: "evil-1", kind: "buy", case_hash: hA, legs: [{ account: `cash:${hA}`, amount: -10 }, { account: `cash:${hB}`, amount: 10 }] }), /another case/, "the ledger refuses a txn between two cases");
  checks++;
  await assert.rejects(() => L.rpc("econ_post", { idem: "evil-2", kind: "buy", case_hash: hA, legs: [{ account: `cash:${hA}`, amount: 10 }] }), /unbalanced/, "the ledger refuses an unbalanced txn");
  checks++;
  const sql = readdirSync("supabase/migrations").map(f => readFileSync(`supabase/migrations/${f}`, "utf8")).join("\n");
  ok(!/function\s+\w*(transfer|gift|cash_?out|withdraw|redeem)\w*\s*\(/i.test(sql), "no transfer / gift / cash-out function in the schema");
  ok(/enable row level security/.test(sql) && !/create policy/i.test(sql), "RLS on, no policies: the browser reads nothing");
  ok(/revoke execute on function[\s\S]*from public/.test(sql), "functions revoked from public");
  const fn = readFileSync("netlify/functions/economy.js", "utf8");
  ok(!/action === "(transfer|gift|send|cashout|withdraw|redeem|purchase)"/.test(fn), "no transfer branch in the function");
}

// ---- purge: the case's ledger goes with the file ----------------------------------------------------------
{
  clearLimits();
  const hA = DB.caseHash(A);
  ok(L.db.txns.some(t => t.case_hash === hA), "A has ledger rows");
  const r = await purge(new Request(HOST + "/api/purge", { method: "POST", headers: { "content-type": "application/json", origin: HOST }, body: JSON.stringify({ caseId: A, confirm: A }) }), { ip: "192.0.2.77" });
  eq(r.status, 200, "purge answers");
  ok(!L.db.txns.some(t => t.case_hash === hA) && ![...L.db.accounts.values()].some(a => a.case_hash === hA), "purge removes every entry and account of the case");
  ok(![...L.db.claims.values()].some(c => c.case_hash === hA) && !L.db.citizens.has(hA) && ![...L.db.investments.values()].some(i => i.case_hash === hA), "and its claims, positions and enrolment");
  ok(L.db.citizens.has(DB.caseHash("HVI-DDDDDDDD")), "other wallets untouched");
  memInvariants(L, "after purge");
  delete globalThis.__blobs.get("hvi-cases").get(A);
}

// ---- prune: an expired file takes its ledger -------------------------------------------------------------
{
  const P = await import("../netlify/lib/prune.js");
  const id = "HVI-DDDDDDDD", h = DB.caseHash(id);
  putCase(id, { created: "2023-01-01T00:00:00Z", history: [{ at: "2023-01-01T00:00:00Z", score: 300, tier: "MONITORED CIVILIAN", cause: "intake" }] });
  ok(L.db.citizens.has(h), "D enrolled");
  await P.prune({ now: Date.parse("2026-10-24T00:00:00Z") });
  ok(!L.db.citizens.has(h) && ![...L.db.accounts.values()].some(a => a.case_hash === h), "the retention sweep removes an expired file's ledger");
  memInvariants(L, "after prune");
}

// ---- wealth never raises the score --------------------------------------------------------------------
{
  const after = JSON.stringify([...globalThis.__blobs.get("hvi-cases")].filter(([k]) => k !== "HVI-DDDDDDDD").map(([k, v]) => [k, v.data]));
  const was = JSON.parse(before).filter(([k]) => k !== A && k !== "HVI-DDDDDDDD");
  eq(JSON.parse(after).filter(([k]) => was.some(([w]) => w === k)), was, "no case record changed: scores, tiers and history untouched by every economy write");
  ok(!globalThis.__blobs.has("hvi-pen") || [...globalThis.__blobs.get("hvi-pen").keys()].length === 0, "no pen card written");
  for (const f of ["netlify/lib/economy.js", "netlify/lib/economy-db.js", "netlify/functions/economy.js", "netlify/functions/econ-close.js", "src/economy/rules.js"]) {
    const src = readFileSync(f, "utf8");
    ok(!/\b(updateCase|putPenCard|setJSON|scoreFrom|rescore|recalibrate)\b|lib\/score\.js/.test(src), `${f} never writes a case, a card or a score`);
  }
  for (const f of readdirSync("src/economy")) {
    const src = readFileSync(`src/economy/${f}`, "utf8");
    ok(!/\bscore\s*[+\-*]?=(?!=)/.test(src), `src/economy/${f} assigns no score`);
  }
  const scoreSrc = readFileSync("netlify/lib/score.js", "utf8");
  ok(!/econom|CYCLES|ledger/i.test(scoreSrc), "the scorer does not read the economy");
}

Date.now = realNow;

// ==== THE SAME LEDGER ON POSTGRES (optional) ==================================================
if (process.env.HVI_ECON_PG === "1") {
  const psql = (sql) => {
    const r = spawnSync("psql", ["-v", "ON_ERROR_STOP=1", "-tAq", "-c", sql], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr.trim());
    return r.stdout.trim();
  };
  const pg = { kind: "pg", async rpc(name, p) { return JSON.parse(psql(`select ${name}($pj$${JSON.stringify(p)}$pj$::jsonb)`)); } };
  psql("set session_replication_role = replica; truncate econ_entries, econ_txns, econ_ubi_claims, econ_investments, econ_returns, econ_citizens cascade; delete from econ_accounts where kind <> 'dept'; update econ_accounts set balance = 0; set session_replication_role = origin;");
  globalThis.__econLedger = pg;
  const pgInv = (label) => {
    eq(psql("select count(*) from (select txn_id from econ_entries group by txn_id having sum(amount) <> 0) x"), "0", `pg ${label}: every txn sums to zero`);
    eq(psql("select count(*) from econ_accounts a where balance <> coalesce((select sum(amount) from econ_entries e where e.account = a.id), 0)"), "0", `pg ${label}: balances = entries`);
    eq(psql("select coalesce(sum(balance), 0) from econ_accounts"), "0", `pg ${label}: the ledger sums to zero`);
  };
  const P1 = "HVI-PPPPPPPP", P2 = "HVI-QQQQQQQQ";
  putCase(P1, { history: [{ at: "2026-09-01T10:00:00Z", score: 512, tier: "MONITORED CIVILIAN" }] });
  putCase(P2, { history: [{ at: "2026-09-01T10:00:00Z", score: 600, tier: "RETAINED" }] });
  clearLimits();
  const rs = await Promise.all([1, 2].map(() => call("POST", { caseId: P1, action: "collect" }, { ip: "203.0.113.5" })));
  eq(rs.map(x => x.body.last.collected).filter(x => x > 0).length, 1, "pg: one collect pays");
  eq(psql(`select count(*) from econ_ubi_claims`), "7", "pg: seven claims");
  let r = await call("POST", { caseId: P1, action: "buy", industry: "resort", amount: 2000, nonce: "pg-nonce-1" }, { ip: "203.0.113.5" });
  eq(r.status, 200, "pg: buy");
  r = await call("POST", { caseId: P1, action: "buy", industry: "resort", amount: 2000, nonce: "pg-nonce-1" }, { ip: "203.0.113.5" });
  eq(r.body.wallet.positions[0].value, 2000, "pg: idempotent order");
  r = await call("POST", { caseId: P1, action: "sell", industry: "resort", amount: 100, nonce: "pg-nonce-2" }, { ip: "203.0.113.5" });
  eq(r.status, 409, "pg: the lock");
  await call("POST", { caseId: P2, action: "collect" }, { ip: "203.0.113.6" });
  const c = await E.closeDay("2026-10-04", { summary: { summary: summaryFixture(3), machineDay: 500, ver: "500.abc" } });
  eq(Number(psql(`select balance from econ_accounts where id = 'inv:${DB.caseHash(P1)}:resort'`)), 2000 + R.gainOf(2000, c.returns.resort), "pg: the close credits trunc(value x ppm / 1e6)");
  eq((await E.closeDay("2026-10-04", { summary: { summary: summaryFixture(7), machineDay: 1, ver: "x" } })).positions, 0, "pg: the close applies once");
  await assert.rejects(() => pg.rpc("econ_post", { idem: "evil", kind: "buy", case_hash: DB.caseHash(P1), legs: [{ account: `cash:${DB.caseHash(P1)}`, amount: -10 }, { account: `cash:${DB.caseHash(P2)}`, amount: 10 }] }), /another case/); checks++;
  await assert.rejects(async () => psql("update econ_entries set amount = amount + 1"), /append-only/); checks++;
  pgInv("after flows");
  eq((await DB.purgeLedger(P1)).ok, true, "pg: purge");
  eq(psql(`select count(*) from econ_txns where case_hash = '${DB.caseHash(P1)}'`) + psql(`select count(*) from econ_accounts where case_hash = '${DB.caseHash(P1)}'`), "00", "pg: purge removes the case's ledger");
  pgInv("after purge");
  ok(Number(psql(`select balance from econ_accounts where id = 'cash:${DB.caseHash(P2)}'`)) > 0, "pg: the other wallet stands");
  console.log("check-economy: Postgres suite passed");
}

console.log(`check-economy: ${checks} checks passed`);
