// THE MARKET, server side (docs/design/ECONOMY_PROPERTY.md, "The Living Market"): the tick that
// runs the engine (src/market/engine.js) one completed machine day at a time, the board the page
// reads, orders, the file's holdings, and the daily close's levy and dividend.
//
// Blobs (store hvi-market):
//   in/<day>       the builder's input for a machine day (netlify/lib/plans.js putMarket),
//                  write-once; it outlives the plan it was read from (kept 14 real days)
//   j/<day>        the tick's journal for a machine day: the batch of orders it filled, written
//                  once BEFORE the fills, so a re-run of the same day reads the same batch
//   state          the engine state (prices, NPCs, events), written last, under its etag
//   series/<rd>    a real day's prices, one point per machine day (the charts)
//   board          what /api/market serves: the list, movers, the floor, the leaders, the ticker
// The Supabase ledger holds the players' side (orders, shares, CYCLES); NPC wealth lives in state.
import { createHmac, createHash, randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";
import * as SIM from "../../src/city/sim.js";
import * as E from "../../src/market/engine.js";
import { FLOAT, KNOBS, MIN_ORDER, MAX_ORDER, NPC_CLASS_WORD, DRIVE_WORD, holderName, fmt, fmtPct, arrow } from "../../src/market/rules.js";
import { ledger, caseHash } from "./economy-db.js";
import { FAMOUS_FIGURES, slugify } from "../../src/figures.js";

const BUNDLED = new Set(FAMOUS_FIGURES.map(f => slugify(f.name)));
export const spriteOf = (slug) => (BUNDLED.has(slug) ? `/sprites/${slug}.png` : `/api/sprite/${slug}`);

export const MARKET_STORE = "hvi-market";
export const MAX_DAYS_PER_RUN = 90;      // a long outage catches up over several runs
export const WAIT_FOR_INPUT = 3;         // machine days a missing input is waited for before "no news"
export const KEEP_IN_DAYS = 14 * 60;
export const MAX_PENDING = 20;
const store = () => getStore({ name: MARKET_STORE, consistency: "strong" });

// The noise: an HMAC of the day and the slug under a server secret, so the server replays every
// tick and a reader of a published plan cannot. The key's fingerprint is kept in the state.
const noiseKey = () => process.env.HVI_MARKET_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.HVI_IP_SALT || "hvi-market-dev";
export const keyId = () => createHash("sha256").update(noiseKey()).digest("hex").slice(0, 8);
export function noiseFn(key = noiseKey()) {
  return (day, slug) => {
    const h = createHmac("sha256", key).update(`${day}|${slug}`).digest();
    let x = 0;
    for (let i = 0; i < 3; i++) x += h.readUInt32BE(i * 4) / 4294967296 * 2 - 1;
    return x / 3;
  };
}

// ---- the tick --------------------------------------------------------------------------------------
// io (tests inject one): {store, ledger, now}
export async function runTick(nowMs = Date.now(), io = {}) {
  const S = io.store || store();
  const L = io.ledger === undefined ? ledger() : io.ledger;
  const target = SIM.machineClock(nowMs).day - 1;   // the last completed machine day
  const cur = await S.getWithMetadata("state", { type: "json" });
  let state = cur?.data || null;
  if (state && state.v !== E.ENGINE_V) throw new Error(`market state v${state.v}, engine v${E.ENGINE_V}`);
  if (!state) { state = E.initState(target); state.key = keyId(); }
  if (state.day >= target) return { skipped: "up to date", day: state.day };
  const noise = noiseFn();
  const done = [], series = new Map();
  for (let d = state.day + 1; d <= target && done.length < MAX_DAYS_PER_RUN; d++) {
    let part = await S.get(`in/${d}`, { type: "json" }).catch(() => null);
    if (!part && d > target - WAIT_FOR_INPUT && !(io.noWait)) break;   // the builder may still be on its way
    // the journal: the batch this day fills, fixed before anything is posted
    let j = await S.get(`j/${d}`, { type: "json" });
    if (!j) {
      const orders = L ? await L.rpc("econ_orders_batch", { tick_day: d }) : [];
      const batch = (orders || []).filter(o => o.status === "pending" || o.tick_day === d);
      const w = await S.setJSON(`j/${d}`, { day: d, orders: batch, part: Boolean(part), at: new Date(nowMs).toISOString() }, { onlyIfNew: true });
      j = w.modified ? { orders: batch } : await S.get(`j/${d}`, { type: "json" });
    }
    const tick = E.step(state, { day: d, part, orders: j.orders || [], noise });
    // the file's movement (score history, not price) for the board's sparkline; the engine never reads it
    if (part?.h) for (const [k, v] of Object.entries(part.h)) if (state.inst[k] && Array.isArray(v) && typeof v[0] === "number" && typeof v[1] === "string" && v[1].length <= 24) state.inst[k].fs = v;
    if (L && tick.fills.length) await L.rpc("econ_orders_fill", { tick_day: d, hold_hours: state.knobs.minHoldHours, fills: tick.fills });
    done.push({ day: d, news: tick.news, fills: tick.fills.length, halts: tick.halts.length, roll: tick.roll?.fired || null });
    const rd = tick.rd;
    if (!series.has(rd)) series.set(rd, (await S.get(`series/${rd}`, { type: "json" })) || { rd, days: [], hvi: [], p: {} });
    const sr = series.get(rd);
    if (!sr.days.includes(d)) {
      const i = sr.days.length;
      sr.days.push(d); sr.hvi.push(state.hvi.level);
      for (const k of Object.keys(state.inst).sort()) { const I = state.inst[k]; if (I.u) continue; (sr.p[k] ||= Array(i).fill(null)).push(I.p); }
      for (const k of Object.keys(sr.p)) while (sr.p[k].length < sr.days.length) sr.p[k].push(null);
    }
  }
  if (!done.length) return { skipped: "waiting for the builder", day: state.day, target };
  // the state last, over the version read: a racing run that got here first wins, this one's
  // fills were the same batch (the journal) and idempotent
  const w = await S.setJSON("state", state, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
  if (!w.modified) return { skipped: "another tick wrote first", done };
  for (const [rd, sr] of series) await S.setJSON(`series/${rd}`, sr);
  const leaders = L ? await L.rpc("econ_leaders", { limit: 60 }).catch(() => []) : [];
  await S.setJSON("board", boardOf(state, leaders, nowMs));
  await prune(S, state.day);
  return { day: state.day, done };
}

async function prune(S, day) {
  try {
    const { blobs } = await S.list({ prefix: "in/" });
    for (const b of blobs) if (Number(b.key.split("/")[1]) < day - KEEP_IN_DAYS) await S.delete(b.key);
    const j = await S.list({ prefix: "j/" });
    for (const b of j.blobs) if (Number(b.key.split("/")[1]) < day - KEEP_IN_DAYS) await S.delete(b.key);
  } catch { /* the next run tries again */ }
}

// ---- the board ------------------------------------------------------------------------------------
const TERM_KEYS = ["work", "crowd", "sport", "play", "civic"];
export function rowOf(state, k) {
  const I = state.inst[k];
  return {
    slug: k, name: I.n, ...(I.fs ? { score: I.fs[0], ...(I.fs[1] ? { hx: I.fs[1] } : {}) } : {}), dead: Boolean(I.dead), price: I.p, open: I.o, chg: E.changeOf(I), close: I.cl.length ? I.cl[I.cl.length - 1] : null,
    fair: E.fairValue(I.s), record: Math.round(I.s * 100) / 100, recent: Math.round((I.r ?? I.s) * 100) / 100, halted: Boolean(I.h),
    npc: I.npc / FLOAT, players: I.pl / FLOAT, why: E.whyOf(state, k),
    terms: I.a ? Object.fromEntries(TERM_KEYS.map((t, j) => [t, I.a[j]])) : null,
  };
}
export function boardOf(state, leaders = [], nowMs = Date.now()) {
  const keys = Object.keys(state.inst).sort().filter(k => !state.inst[k].u);
  const rows = keys.map(k => rowOf(state, k));
  const byChg = rows.slice().sort((a, b) => b.chg - a.chg || (a.slug < b.slug ? -1 : 1));
  const npcs = E.npcBoard(state);
  // the leaders: players (the ledger: cash, escrow, industries, shares at today's price) and NPCs
  const players = (leaders || []).map(x => {
    const shares = Object.entries(x.shares || {}).reduce((s, [k, u]) => s + u * (state.inst[k]?.p || 0), 0);
    return { kind: "citizen", name: holderName(x.case_hash), h: x.case_hash.slice(0, 8), worth: Math.round(Number(x.liquid) + shares) };
  });
  const npcRows = npcs.map(n => ({ kind: "npc", name: n.name, slug: n.slug, cls: NPC_CLASS_WORD[n.cls], drive: DRIVE_WORD[n.drive], worth: n.worth }));
  // the top 25, and the ten richest citizens wherever they stand (players compete with the NPCs)
  const ranked = [...players, ...npcRows].sort((a, b) => b.worth - a.worth || (a.name < b.name ? -1 : 1)).map((x, i) => ({ ...x, rank: i + 1 }));
  const leaderboard = ranked.filter((x, i) => i < 25 || (x.kind === "citizen" && ranked.filter(y => y.kind === "citizen" && y.rank <= x.rank).length <= 10));
  // the floor: each NPC, its desk (moguls on the upper floor, day traders on the lower, the idle
  // rich in the members' club), what it last did and why
  const lastTrade = {};
  for (const k of keys) for (const [id, q] of Object.entries(state.inst[k].w?.npc || {})) if (!lastTrade[id] || Math.abs(q) > Math.abs(lastTrade[id][1])) lastTrade[id] = [k, q];
  const floor = npcs.map(n => {
    const lt = lastTrade[n.id];
    const N = state.npc[n.id];
    const dv = N.divest ? Object.keys(N.divest)[0] : null;
    const doing = dv ? `SELLING ${state.inst[dv]?.n.toUpperCase() || "A CORNER"} UNDER ORDER` : N.panic > state.day ? "SELLING. A MARGIN CALL." : lt ? `${lt[1] > 0 ? "BUYING" : "SELLING"} ${state.inst[lt[0]]?.n.toUpperCase()}` : "WATCHING THE BOARD";
    return { id: n.id, slug: n.slug, sprite: spriteOf(n.slug), name: n.name, cls: NPC_CLASS_WORD[n.cls], drive: DRIVE_WORD[n.drive], note: n.note, worth: n.worth, room: n.cls === "mogul" ? "UPPER TRADING FLOOR" : n.cls === "rich" ? "THE MEMBERS' CLUB" : "LOWER TRADING FLOOR", doing, top: n.held.slice(0, 3).map(([k, u]) => [state.inst[k]?.n || k, u]) };
  });
  const hvi = { level: state.hvi.level, open: state.hvi.open, chg: state.hvi.open ? state.hvi.level / state.hvi.open - 1 : 0, cl: state.hvi.cl.slice(-14) };
  const movers = { up: byChg.filter(r => r.chg > 0).slice(0, 6), down: byChg.filter(r => r.chg < 0).slice(-6).reverse() };
  const ticker = [`HUMAN VALUE INDEX ${hvi.level.toFixed(1)} ${arrow(hvi.chg)}${fmtPct(hvi.chg)}`,
    ...[...movers.up.slice(0, 5), ...movers.down.slice(0, 5)].map(r => `${r.name.toUpperCase()} ${r.price.toFixed(2)} ${arrow(r.chg)}${fmtPct(r.chg)}`),
    ...state.events.slice(-2).map(e => e.line.split(". ")[0] + ".")];
  return {
    v: 1, at: new Date(nowMs).toISOString(), day: state.day, rd: state.rd, hvi, count: rows.length,
    rows, movers, leaderboard, floor, ticker, knobs: state.knobs, events: state.events.slice(-12).reverse(),
    emergency: state.emergency && state.day < state.emergency.until ? state.emergency : null,
  };
}

// ---- reads (cached a minute per instance) --------------------------------------------------------
let cached = { at: 0, board: null, state: null };
export async function readBoard(S = store()) {
  if (cached.board && Date.now() - cached.at < 60_000) return cached.board;
  cached = { ...cached, at: Date.now(), board: await S.get("board", { type: "json" }) };
  return cached.board;
}
let stateCache = { at: 0, v: null };
export async function readState(S = store(), maxAge = 30_000) {
  if (stateCache.v && Date.now() - stateCache.at < maxAge) return stateCache.v;
  stateCache = { at: Date.now(), v: await S.get("state", { type: "json" }) };
  return stateCache.v;
}
export function forgetMarket() { cached = { at: 0, board: null, state: null }; stateCache = { at: 0, v: null }; }

export async function detail(slug, S = store()) {
  const state = await readState(S);
  const I = state?.inst?.[slug];
  if (!I || I.u) return null;
  const sr = await S.get(`series/${state.rd}`, { type: "json" }).catch(() => null);
  const holders = Object.entries(state.npc).map(([id, n]) => [n.n, n.hold[slug] || 0, DRIVE_WORD[n.drive]]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return { ...rowOf(state, slug), closes: I.cl.slice(-14), today: sr?.p?.[slug] || [], days: sr?.days || [], holders, events: state.events.filter(e => e.slug === slug).slice(-5).reverse() };
}

// ---- the file: shares, open orders --------------------------------------------------------------------
export async function sharesView(v) {
  const state = await readState();
  const shares = (v.shares || []).map(s => {
    const I = state?.inst?.[s.slug];
    const price = I?.p ?? 0, value = Math.round(Number(s.units) * price);
    return { slug: s.slug, name: I?.n || s.slug, units: Number(s.units), reserved: Number(s.reserved) || 0, basis: Number(s.basis), price, value, pl: value - Number(s.basis), lockedUntil: s.locked_until, halted: Boolean(I?.h), listed: Boolean(I && !I.u) };
  });
  const orders = (v.orders || []).map(o => ({ id: o.id, slug: o.slug, name: state?.inst?.[o.slug]?.n || o.slug, side: o.side, amount: Number(o.amount), units: Number(o.units), status: o.status, fillUnits: o.fill_units, fillCash: o.fill_cash, price: o.price != null ? Number(o.price) : null, at: o.created_at }));
  return { shares, orders, escrow: Number(v.escrow) || 0, sharesValue: shares.reduce((n, s) => n + s.value, 0) };
}

// ---- orders --------------------------------------------------------------------------------------------
// -> {ok, status, error?, line?}. Server-authoritative: the listing, the halt, the cap and the
// cash are checked here and again by the ledger; the fill is the next tick's.
export async function placeOrder(caseId, { side, slug, amount, units, nonce }) {
  const L = ledger();
  const h = caseHash(caseId);
  const state = await readState(undefined, 5_000);
  const I = state?.inst?.[String(slug || "")];
  if (side !== "buy" && side !== "sell") return { ok: false, status: 400, error: "Buy or sell. The Department offers nothing in between." };
  if (!I) return { ok: false, status: 404, error: "No such listing. Not everyone on file is for sale. Some are not for sale by policy." };
  if (side === "buy" && I.u) return { ok: false, status: 409, error: "Not listed. The Department does not trade in everyone." };
  if (I.h && !I.u) return { ok: false, status: 409, error: "HALTED FOR THE DAY. THE BAND HELD. THE DEPARTMENT RESUMES AT 00:00 UTC." };
  const n = typeof nonce === "string" && /^[A-Za-z0-9-]{8,64}$/.test(nonce) ? nonce : randomUUID();
  if (side === "buy") {
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt < MIN_ORDER || amt > MAX_ORDER) return { ok: false, status: 400, error: `Whole CYCLES, at least ${MIN_ORDER}.` };
    const r = await L.rpc("econ_order_place", { idem: `mkt:${h}:${n}`, case_hash: h, slug, side, amount: amt, max_pending: MAX_PENDING });
    if (!r.ok) return { ok: false, status: r.error === "insufficient" ? 402 : 409, error: r.error === "insufficient" ? "Not enough CYCLES. COLLECT first, or want less." : r.error === "too-many" ? "Too many orders waiting. The next tick will clear them." : "The order was refused." };
    return { ok: true, dup: r.dup, line: r.dup ? "ORDER ALREADY ON FILE." : `ORDER FILED: ${fmt(amt)} CYCLES OF ${I.n.toUpperCase()}. IT FILLS AT THE NEXT TICK, WITHIN 24 MINUTES, AT THAT TICK'S PRICE. THE DEPARTMENT DOES NOT LET ANYONE READ TOMORROW'S PAPER.` };
  }
  const u = Number(units);
  if (!Number.isInteger(u) || u < 1 || u > FLOAT) return { ok: false, status: 400, error: "Whole shares only." };
  const r = await L.rpc("econ_order_place", { idem: `mkt:${h}:${n}`, case_hash: h, slug, side, units: u, max_pending: MAX_PENDING });
  if (!r.ok && r.error === "locked") return { ok: false, status: 409, error: `Held ${state.knobs.minHoldHours} hours after a purchase. The Department does not do day trading. It does not do days.` };
  if (!r.ok) return { ok: false, status: 409, error: r.error === "no-shares" ? "You do not hold that many free shares." : r.error === "too-many" ? "Too many orders waiting. The next tick will clear them." : "The order was refused." };
  return { ok: true, dup: r.dup, line: r.dup ? "ORDER ALREADY ON FILE." : `SELL ORDER FILED: ${fmt(u)} SHARES OF ${I.n.toUpperCase()}. IT FILLS AT THE NEXT TICK. THE MARKET WILL MANAGE WITHOUT YOU.` };
}

// ---- the daily close: the levy and the citizens' dividend ------------------------------------------------
// Real day `day` once the market has rolled past it (its closes are in the state). -> the declared
// dividend, or {skipped}.
export async function closeMarketDay(day, { S = store(), L = ledger() } = {}) {
  if (!L) return { skipped: "closed" };
  const state = await S.get("state", { type: "json" });
  if (!state || state.rd <= day) return { skipped: "market not yet past the day" };
  const K = state.knobs || KNOBS;
  const rich = await L.rpc("econ_rich", { min: Math.floor(K.levyFloor / 2) });
  const closeOf = (k) => { const I = state.inst[k]; return I ? (I.cl.length ? I.cl[I.cl.length - 1] : I.p) : 0; };
  const rate = state.emergency && state.emergency.from <= E.firstMachineDayOf(day) + 59 && state.emergency.until > E.firstMachineDayOf(day) ? state.emergency.rate : K.levyRate;
  const levies = [];
  for (const r of rich || []) {
    const W = Number(r.cash) + Number(r.inv) + Object.entries(r.shares || {}).reduce((s, [k, u]) => s + u * closeOf(k), 0);
    if (W > K.levyFloor) levies.push({ case_hash: r.case_hash, amount: Math.floor((W - K.levyFloor) * rate) });
  }
  return L.rpc("econ_levy_close", { day, levies, npc_pool: state.levy?.[day] || 0, share: K.dividend });
}
