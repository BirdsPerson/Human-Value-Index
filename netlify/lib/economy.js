// THE TREASURY, slice 1: what /api/economy and the daily close do, over the ledger
// (economy-db.js) and the city's published record (plans.js). Server-authoritative: the
// browser asks; every amount, day and yield is decided here. No function in this file reads
// or writes a score, a tier or a case record (the case is only read, for its history dates
// and tier): wealth never raises the score (scripts/check-economy.mjs).
import { randomUUID } from "node:crypto";
import * as SIM from "../../src/city/sim.js";
import { towerPlan, residentFlat } from "../../src/city/tower.js";
import { getStore } from "@netlify/blobs";
import { STORE as PLANS, manifest2Cached, partKey } from "./plans.js";
import { ledger, caseHash, ownerHash } from "./economy-db.js";
import { sharesView } from "./market.js";
import {
  UBI, TRAY_DAYS, MIN_INVEST, MAX_ORDER, LOCK_DAYS, IP_CAP, DEVICE_CAP, INDUSTRIES, INDUSTRY_IDS, industryOf,
  utcDay, addDays, vestDayOf, trayDays, spendFor, dayReturns, sharesOf, commentary, collectLine,
} from "../../src/economy/rules.js";

export const ACTIONS = ["collect", "buy", "sell"];   // nothing else: no transfer, gift, purchase or cash-out

// ---- MY APARTMENT: the sim's own assignment, by tier ------------------------------------------
const placeName = (id) => SIM.PLACES[id]?.name || String(id || "").toUpperCase();
const districtName = (id) => SIM.DISTRICTS.find(d => d.id === id)?.name || String(id || "").toUpperCase();
export function citizenOf(caseId, rec) {
  const last = (rec?.history || []).filter(h => h && typeof h.score === "number").pop();
  const last4 = caseId.slice(-4);
  return { slug: `citizen-${last4.toLowerCase()}`, name: `Subject ${last4}`, score: last?.score, tier: last?.tier, kind: "citizen", housedUnder: SIM.housedUnderAt(last?.at) };
}
// MY APARTMENT names the same door as the tower: where the cutaway (tower.js residentFlat) puts the
// citizen, its storey, flat and rooms. A home that is not a tower (a house, a cottage) keeps the
// floor and a unit number hashed from the citizen (no cutaway flat, so no furniture placement yet).
export function apartmentOf(caseId, rec) {
  try {
    const s = citizenOf(caseId, rec);
    const place = SIM.homeOf(s), p = SIM.PLACES[place];
    const b = SIM.BUILDING[p?.building];
    const fi = SIM.floorOf(place, SIM.keyOf(s));
    const f = b?.floors?.find(x => x.index === fi) || null;
    let floorCode = f ? (f.code || (f.index === 0 ? "G" : `${f.index}F`)) : null;
    let unit = `${floorCode || "G"}-${String(1 + (SIM.keyOf(s).split("").reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % 24)).padStart(2, "0")}`;
    let flat = null, storeyLevel = null;
    const plan = b ? towerPlan(b) : null;
    const u = plan ? residentFlat(plan, s) : null;
    if (u) {
      const st = plan.storeys.find(x => x.units.includes(u));
      storeyLevel = st.level; floorCode = st.code; unit = u.label;
      flat = { id: u.id, label: u.label, storey: st.id, level: st.level, rooms: u.rooms.map(r => ({ id: r.id, purpose: r.purpose })) };
    }
    return {
      place, placeName: placeName(place).toUpperCase(), building: b?.id || null, buildingName: (b?.name || placeName(place)).toUpperCase(),
      district: p?.district || null, districtName: districtName(p?.district).toUpperCase(), floor: fi, floorName: f ? String(f.name || "").replace(`${b?.name} // `, "").toUpperCase() : null, floorCode, unit, flat,
      tier: s.tier || null, href: b ? `#city/${p.district}/${b.id}${fi != null ? `?floor=${fi}${storeyLevel != null ? `&storey=${storeyLevel}` : ""}${flat ? `&flat=${flat.id}&zoom=flat` : ""}` : flat ? `?flat=${flat.id}&zoom=flat` : ""}` : `#city/${p?.district || ""}`,
      rent: 0, tenure: "PERMANENT",
    };
  } catch { return null; }
}

// ---- the city's record: one machine day's summary ------------------------------------------
// The last machine day of a real UTC day (60 to a real day, from CITY_EPOCH at a UTC midnight).
export const lastMachineDayOf = (day) => SIM.machineClock(Date.parse(`${addDays(day, 1)}T00:00:00Z`) - 1).day;
const plans = () => getStore({ name: PLANS, consistency: "strong" });
// -> {summary, machineDay, ver} for the newest published day <= target (and >= target - 59, the
// same real day), or {summary: null}. The economy reads what the browsers read.
export async function summaryFor(target, { m2, s = plans } = {}) {
  const man = m2 || await manifest2Cached(60 * 1000);
  const days = Object.keys(man?.days || {}).map(Number).filter(d => d <= target && d > target - 60).sort((a, b) => b - a);
  for (const d of days) {
    const ver = man.days[d].ver;
    const summary = await s().get(partKey(d, ver, "summary"), { type: "json" }).catch(() => null);
    if (summary?.civic) return { summary, machineDay: d, ver };
  }
  return { summary: null, machineDay: null, ver: null };
}

// ---- the board: the industries, shares, yesterday's returns, today's indication --------------
let indicated = { at: 0, v: null };
async function indication(invested, nowMs) {
  if (indicated.v && nowMs - indicated.at < 5 * 60_000) return indicated.v;
  const md = SIM.machineClock(nowMs).day - 1;
  const r = await summaryFor(md).catch(() => ({ summary: null }));
  const v = r.summary ? { machineDay: r.machineDay, rows: dayReturns(r.summary, invested) } : null;
  indicated = { at: nowMs, v };
  return v;
}
export async function boardView(nowMs = Date.now()) {
  const L = ledger();
  const b = L ? await L.rpc("econ_board", { days: 7 }) : { invested: {}, holders: {}, returns: [], closed_through: null, citizens: 0 };
  const shares = sharesOf(b.invested);
  const ind = await indication(b.invested, nowMs);
  const hist = {};
  for (const r of b.returns || []) (hist[r.industry] ||= []).push({ day: r.day, ppm: r.ppm, idx: Number(r.idx), herd: Number(r.herd), share: Number(r.share) });
  const last = Object.fromEntries(INDUSTRY_IDS.map(id => [id, hist[id]?.[0]?.ppm]).filter(([, v]) => Number.isFinite(v)));
  return {
    industries: INDUSTRIES.map(i => ({
      id: i.id, name: i.name, districts: i.districts, line: i.line,
      invested: Number(b.invested?.[i.id]) || 0, holders: Number(b.holders?.[i.id]) || 0, share: shares[i.id],
      history: (hist[i.id] || []).slice(0, 7), last: hist[i.id]?.[0] || null,
      indicated: ind?.rows?.[i.id] ? { ppm: ind.rows[i.id].ppm, idx: ind.rows[i.id].idx, herd: ind.rows[i.id].herd } : null,
    })),
    indicatedFrom: ind?.machineDay ?? null,
    closedThrough: b.closed_through, citizens: Number(b.citizens) || 0,
    commentary: commentary({ shares, last, holders: b.holders || {} }),
  };
}

// ---- the wallet ------------------------------------------------------------------------------
export async function walletView(caseId, rec, nowMs = Date.now()) {
  const L = ledger();
  const today = utcDay(nowMs), h = caseHash(caseId);
  const v = await L.rpc("econ_view", { case_hash: h, since: addDays(today, -(TRAY_DAYS + 7)), limit: 20 });
  const vest = v.citizen?.vest_day ? String(v.citizen.vest_day).slice(0, 10) : vestDayOf(rec?.history);
  const tray = trayDays({ today, vestDay: vest, claimed: (v.claims || []).map(d => String(d).slice(0, 10)), lastClaim: v.last_claim ? String(v.last_claim).slice(0, 10) : null });
  const spend = tray.days.reduce((n, d) => n + spendFor(h, d), 0);
  const positions = (v.positions || []).map(p => ({ industry: p.industry, name: industryOf(p.industry)?.name || p.industry.toUpperCase(), value: Number(p.value), basis: Number(p.basis), pl: Number(p.value) - Number(p.basis), lockedUntil: p.locked_until }));
  const invested = positions.reduce((n, p) => n + p.value, 0);
  const market = await sharesView(v).catch(() => ({ shares: [], orders: [], escrow: Number(v.escrow) || 0, sharesValue: 0 }));
  const div = dividendDays(tray.days, v.dividends, v.citizen);
  return {
    enrolled: Boolean(v.citizen), vestDay: vest, today,
    balance: Number(v.cash) || 0, invested, worth: (Number(v.cash) || 0) + invested + market.sharesValue + market.escrow,
    tray: { days: tray.days.length, gross: tray.days.length * UBI, spend, net: tray.days.length * UBI - spend + div.total, dividend: div.total, lost: tray.lost, from: tray.days[0] || null, vesting: vest > today },
    positions, ...market,
    recent: (v.recent || []).map(t => ({ kind: t.kind, day: t.day ? String(t.day).slice(0, 10) : null, cash: Number(t.cash), inv: Number(t.inv), memo: t.memo || {}, at: t.created_at })),
  };
}

// The dividend each tray day carries: the per-citizen dividend declared for the day before, to a
// citizen enrolled a week or more before it (the same aging the declaration counts).
export function dividendDays(days, dividends = {}, citizen = null) {
  const by = {};
  let total = 0;
  const enrolled = citizen?.enrolled_at ? String(citizen.enrolled_at).slice(0, 10) : null;
  for (const d of days) {
    const prev = addDays(d, -1), per = Number(dividends?.[prev]) || 0;
    if (per > 0 && enrolled && enrolled <= addDays(prev, -6)) { by[d] = per; total += per; }
  }
  return { by, total };
}

// ---- COLLECT: every waiting day in one balanced txn, one claim row per day ----------------------
// The days are decided here, never by the caller. A double click posts the same days twice: the
// claims' primary key refuses the second, which reports dup and changes nothing.
export async function collect(caseId, rec, { ip = null, deviceHash = null, owner = null, exempt = false, nowMs = Date.now() } = {}) {
  const L = ledger();
  const h = caseHash(caseId), today = utcDay(nowMs);
  const en = await L.rpc("econ_enrol", { case_hash: h, vest_day: vestDayOf(rec?.history), ip_hash: ip, device_hash: deviceHash, owner_hash: ownerHash(owner), ip_cap: IP_CAP, device_cap: DEVICE_CAP, exempt });
  if (!en.ok) return { ok: false, error: en.error };
  const v = await L.rpc("econ_view", { case_hash: h, since: addDays(today, -(TRAY_DAYS + 7)), limit: 1 });
  const vest = String(v.citizen?.vest_day || en.vest_day).slice(0, 10);
  const { days, lost } = trayDays({ today, vestDay: vest, claimed: (v.claims || []).map(d => String(d).slice(0, 10)), lastClaim: v.last_claim ? String(v.last_claim).slice(0, 10) : null });
  if (!days.length) return { ok: true, collected: 0, days: 0, line: collectLine({ days: 0 }), vesting: vest > today ? vest : null };
  const legs = [], memoDays = [];
  const div = dividendDays(days, v.dividends, v.citizen);
  for (const d of days) {
    const s = spendFor(h, d);
    legs.push({ account: "dept:treasury", amount: -UBI }, { account: `cash:${h}`, kind: "cash", amount: UBI }, { account: `cash:${h}`, kind: "cash", amount: -s }, { account: "dept:shops", amount: s });
    // THE CITIZENS' DIVIDEND (the market's concentration levy, paid back): yesterday's, with today's allowance
    if (div.by[d]) legs.push({ account: "dept:commons", amount: -div.by[d] }, { account: `cash:${h}`, kind: "cash", amount: div.by[d] });
    memoDays.push(div.by[d] ? [d, UBI, s, div.by[d]] : [d, UBI, s]);
  }
  const r = await L.rpc("econ_post", { idem: `ubi:${h}:${days.join(",")}`, kind: "ubi", case_hash: h, day: today, memo: { days: memoDays, lost }, legs, claims: days });
  if (!r.ok) return { ok: false, error: r.error };
  if (r.dup) return { ok: true, dup: true, collected: 0, days: 0, line: "ALREADY DISBURSED. THE DEPARTMENT DOES NOT PAY TWICE FOR ONE DAY." };
  const net = memoDays.reduce((n, [, u, s, dv = 0]) => n + u - s + dv, 0);
  return { ok: true, collected: net, days: days.length, gross: days.length * UBI, spend: days.length * UBI - net + div.total, dividend: div.total, lost, line: collectLine({ days: days.length, lost }) + (div.total ? ` THE CITIZENS' DIVIDEND ADDS ${div.total.toLocaleString("en-US")}: WHAT THE RICHEST PAID IN LEVY, SHARED.` : "") };
}

// ---- buy / sell: cash <-> the industry position, both the case's own accounts -------------------
export async function trade(caseId, { action, industry, amount, nonce }) {
  const L = ledger();
  const h = caseHash(caseId);
  if (!industryOf(industry)) return { ok: false, status: 400, error: "No such industry. The Department lists seven." };
  const amt = Number(amount);
  if (!Number.isInteger(amt) || amt < 1 || amt > MAX_ORDER) return { ok: false, status: 400, error: "Whole CYCLES only." };
  if (action === "buy" && amt < MIN_INVEST) return { ok: false, status: 400, error: `The minimum position is ${MIN_INVEST} CYCLES. The Department does not open files for less.` };
  const n = typeof nonce === "string" && /^[A-Za-z0-9-]{8,64}$/.test(nonce) ? nonce : randomUUID();
  const inv = `inv:${h}:${industry}`, cash = `cash:${h}`;
  if (action === "buy") {
    const r = await L.rpc("econ_post", { idem: `buy:${h}:${n}`, kind: "buy", case_hash: h, memo: { industry, amount: amt },
      legs: [{ account: cash, kind: "cash", amount: -amt }, { account: inv, kind: "inv", industry, amount: amt }], position: { industry, basis_delta: amt, lock_days: LOCK_DAYS } });
    if (!r.ok) return { ok: false, status: 402, error: r.error === "insufficient" ? "Not enough CYCLES. COLLECT first, or want less." : "The order was refused." };
    return { ok: true, dup: r.dup, line: r.dup ? "ORDER ALREADY ON FILE." : `POSITION OPENED IN ${industryOf(industry).name}. YOUR HUMAN VALUE IS UNCHANGED. WE WANTED YOU TO HEAR IT FROM US.` };
  }
  if (action === "sell") {
    const v = await L.rpc("econ_view", { case_hash: h, since: utcDay(), limit: 1 });
    const pos = (v.positions || []).find(p => p.industry === industry);
    const value = Number(pos?.value) || 0, basis = Number(pos?.basis) || 0;
    if (!value) return { ok: false, status: 400, error: "You hold no position there." };
    const sell = Math.min(amt, value);
    const basisDelta = -Math.round((basis * sell) / value);
    const r = await L.rpc("econ_post", { idem: `sell:${h}:${n}`, kind: "sell", case_hash: h, memo: { industry, amount: sell }, unlocked: industry,
      legs: [{ account: inv, kind: "inv", industry, amount: -sell }, { account: cash, kind: "cash", amount: sell }], position: { industry, basis_delta: basisDelta } });
    if (!r.ok && r.error === "locked") return { ok: false, status: 409, error: `Positions are held ${LOCK_DAYS} days after a purchase. The Department does not do day trading. It does not do days.` };
    if (!r.ok) return { ok: false, status: 409, error: "The position moved under you. Read the file again." };
    return { ok: true, dup: r.dup, line: r.dup ? "ORDER ALREADY ON FILE." : `SOLD ${sell.toLocaleString("en-US")} CYCLES OF ${industryOf(industry).name}. THE MARKET WILL MANAGE WITHOUT YOU.` };
  }
  return { ok: false, status: 400, error: "Unknown action." };
}

// ---- the daily close -------------------------------------------------------------------------------
// Closes real UTC `day` (once; re-runs apply nothing): reads the last machine day of that real day
// from the published summaries, the shares invested at close, and credits every position.
export async function closeDay(day, { summary: given } = {}) {
  const L = ledger();
  if (!L) return { ok: false, skipped: "closed" };
  const b = await L.rpc("econ_board", { days: 1 });
  const target = lastMachineDayOf(day);
  const src = given || await summaryFor(target);
  const rows = dayReturns(src.summary, b.invested);
  const returns = INDUSTRY_IDS.map(id => ({ industry: id, ...rows[id], machine_day: src.machineDay, ver: src.ver }));
  const r = await L.rpc("econ_close", { day, returns });
  return { ...r, day, machineDay: src.machineDay, returns: Object.fromEntries(returns.map(x => [x.industry, x.ppm])) };
}
