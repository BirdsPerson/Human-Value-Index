// THE HOUSING OFFICE: a player's own apartment, REQUEST A TRANSFER, and the movers. Server-
// authoritative: the browser asks; which door, from which machine day, and where each piece of
// furniture stands after a move are all decided here (the pure rules: src/city/housing.js).
//
// The assignment is written onto the case (rec.home) and its pen card (store.js setPenHome), so
// the census, the published plans' records and MY APARTMENT all read one answer (sim.js homeAt).
// It takes effect on machine day d = effectiveDay(today): past every day already published
// (plans.js LOOKAHEAD), and never before HOUSING_DAY, so a move lands at a day boundary and no
// published day changes. Before d the door in force is `was`.
//
// THE MOVERS (settle): from d, every piece of the file's furniture placed anywhere but the door in
// force is carried to the same room and spot of the new flat (the ledger's econ_shop_place, the
// same call PLACE makes), or, where the new flat has no such room or the spot is taken, back to the
// inventory. Nothing is sold, destroyed or lost; running it twice moves nothing twice. No function
// here reads or writes a score or a CYCLE.
import * as SIM from "../../src/city/sim.js";
import { allocate, transferOptions, unitInfo } from "../../src/city/housing.js";
import { HOUSING_LINES } from "../../src/economy/housingLines.js";
import { itemOf, placeable } from "../../src/economy/shops.js";
import { LOOKAHEAD } from "./plans.js";
import { listPenCards, updateCase, setPenHome } from "./store.js";
import { citizenOf, apartmentOf } from "./economy.js";
import { ledger, caseHash } from "./economy-db.js";
import { forgetRooms } from "./shops.js";

export const LOG_MAX = 20;
export const effectiveDay = (today) => Math.max(SIM.HOUSING_DAY, today + LOOKAHEAD + 1);
const dayStartMs = (d) => SIM.CITY_EPOCH + ((d - 1) * 24 * 3600000) / SIM.DEFAULT_SCALE;
export const minutesUntil = (d, nowMs = Date.now()) => Math.max(0, Math.ceil((dayStartMs(d) - nowMs) / 60000));
const assessed = (rec) => Array.isArray(rec?.history) && rec.history.some(h => h && typeof h.score === "number");
const log = (cur, e) => [...(cur.housingLog || []), e].slice(-LOG_MAX);
const doorOf = (id) => { const x = unitInfo(id); return x ? `UNIT ${x.label}, ${x.building}` : String(id || "").toUpperCase(); };

// Every other player on the census, as the census gives them (census.js; the sim's housing inputs).
export async function playersBesides(caseId) {
  const cards = await listPenCards(1000);
  return cards.filter(c => c && c.key !== `citizen:${caseId}` && typeof c.score === "number").map(c => ({
    slug: c.slug, name: c.name, score: c.score, tier: c.tier, kind: "citizen",
    housedUnder: c.housedUnder ?? SIM.housedUnderAt(c.updated), ...(c.home ? { home: c.home } : {}),
  }));
}

// Is this assignment one the citizen's tier honors (their band, or one up)?
const honored = (s, home, today) => Boolean(home && SIM.homeAt({ ...s, home: { ...home, d: 0, was: null } }, Math.max(today, SIM.HOUSING_DAY, Number(home.d) || 0)));

// ---- the assignment and the movers: run before any read of the apartment ---------------------------
// -> {rec, assigned?, settled?}. Never throws (a failure leaves the file as it was).
export async function ensureHome(caseId, rec, nowMs = Date.now()) {
  if (!assessed(rec)) return { rec };
  const out = { rec };
  try {
    const today = SIM.machineClock(nowMs).day;
    const s = citizenOf(caseId, rec);
    if (!honored(s, rec.home, today)) {
      const d = effectiveDay(today);
      const a = allocate(s, await playersBesides(caseId), d);
      if (a) {
        const home = { ...a, d, k: "assign", was: SIM.homeAt(s, today) };
        const saved = await updateCase(caseId, cur => (cur && !honored(citizenOf(caseId, cur), cur.home, today)
          ? { ...cur, home, housingLog: log(cur, { at: new Date(nowMs).toISOString(), day: today, kind: "assign", to: doorOf(a.u), d }) } : undefined));
        if (saved) { out.rec = saved; out.assigned = saved.home; await setPenHome(caseId, saved.home).catch(() => false); }
      }
    }
    const h = out.rec.home;
    if (h && today >= h.d && h.s !== h.d && ledger()) {
      const r = await settleFurniture(caseId, out.rec, today);
      const saved = await updateCase(caseId, cur => (cur?.home && cur.home.u === h.u && cur.home.d === h.d
        ? { ...cur, home: { ...cur.home, s: h.d }, housingLog: r.moved || r.stored ? log(cur, { at: new Date(nowMs).toISOString(), day: today, kind: "moved", to: doorOf(h.u), moved: r.moved, stored: r.stored }) : cur.housingLog || [] } : undefined));
      if (saved) { out.rec = saved; out.settled = r; await setPenHome(caseId, saved.home).catch(() => false); }
    }
  } catch (err) {
    console.error("housing: ensureHome failed", err?.name, err?.message);
  }
  return out;
}

// THE MOVERS: every placed piece not in the door in force on `day`, carried to the same room and spot
// of it, or stored. -> {moved, stored}. Idempotent.
export async function settleFurniture(caseId, rec, day) {
  const L = ledger();
  if (!L) return { moved: 0, stored: 0 };
  const h = caseHash(caseId);
  const apt = apartmentOf(caseId, rec, day);
  const flat = apt?.flat || null;
  const v = await L.rpc("econ_shop_view", { case_hash: h });
  const away = (v.placements || []).filter(p => !flat || p.flat !== flat.id);
  let moved = 0, stored = 0;
  for (const p of away) {
    const own = (v.items || []).find(i => Number(i.id) === Number(p.item_id));
    const it = own && itemOf(own.sku);
    const room = flat ? `${flat.id}:${String(p.room).slice(String(p.flat).length + 1)}` : null;
    let r = null;
    if (room && it && flat.rooms.some(x => x.id === room) && placeable(it, room, flat.id)) r = await L.rpc("econ_shop_place", { case_hash: h, item_id: Number(p.item_id), flat: flat.id, room, spot: p.spot });
    if (r?.ok) moved++;
    else { await L.rpc("econ_shop_place", { case_hash: h, item_id: Number(p.item_id), remove: true }); stored++; }
  }
  if (moved || stored) forgetRooms();
  return { moved, stored };
}

// ---- what the panel shows ---------------------------------------------------------------------------
const describe = (h, nowMs) => ({ unit: h.u, door: doorOf(h.u), label: unitInfo(h.u)?.label || null, building: unitInfo(h.u)?.building || null, day: h.d, minutes: minutesUntil(h.d, nowMs), kind: h.k });
export async function housingView(caseId, rec, nowMs = Date.now()) {
  const today = SIM.machineClock(nowMs).day, d = effectiveDay(today);
  const s = citizenOf(caseId, rec), h = rec?.home;
  const apartment = apartmentOf(caseId, rec, today);
  const pending = h && h.k === "transfer" && today < h.d ? describe(h, nowMs) : null;
  const assigning = h && h.k === "assign" && today < h.d ? describe(h, nowMs) : null;
  let options = [], up = false;
  if (!pending) {
    const t = transferOptions(s, await playersBesides(caseId), d);
    up = t.qualifiesUp;
    options = t.options.map(o => ({ unit: o.u, label: o.label, building: o.building, floor: o.code, rooms: o.rooms.length, up: Boolean(o.up) }));
  }
  const lines = {
    intro: HOUSING_LINES.intro,
    ...(up ? { up: HOUSING_LINES.upNote } : {}),
    ...(pending ? { pending: HOUSING_LINES.pending(pending.label, pending.building, pending.day) } : {}),
    ...(assigning ? { assigned: HOUSING_LINES.assigned(assigning.label, assigning.building, assigning.day) } : {}),
    ...(!pending && !options.length ? { none: HOUSING_LINES.none } : {}),
  };
  return {
    today, day: d, minutes: minutesUntil(d, nowMs), apartment, pending, assigning, qualifiesUp: up, options, lines,
    log: (rec?.housingLog || []).slice(-5).reverse().map(e => ({ day: e.day, kind: e.kind, to: e.to, d: e.d ?? null, moved: e.moved ?? null, stored: e.stored ?? null })),
  };
}

// ---- REQUEST A TRANSFER: one door from the list, from the next unpublished day -----------------------
export async function requestTransfer(caseId, rec, { unit }, nowMs = Date.now()) {
  const today = SIM.machineClock(nowMs).day, d = effectiveDay(today);
  const busy = (r) => r?.home?.k === "transfer" && today < r.home.d;
  if (busy(rec)) return { ok: false, status: 409, error: HOUSING_LINES.oneAtATime, code: "pending" };
  const s = citizenOf(caseId, rec);
  const o = transferOptions(s, await playersBesides(caseId), d).options.find(x => x.u === unit);
  if (!o) return { ok: false, status: 409, error: HOUSING_LINES.notOffered, code: "not-offered" };
  const home = { u: o.u, p: o.p, f: o.f, d, k: "transfer", was: SIM.homeAt(s, today) };
  const from = apartmentOf(caseId, rec, today);
  let raced = false;
  const saved = await updateCase(caseId, cur => {
    if (!cur) return undefined;
    if (busy(cur)) { raced = true; return undefined; }
    return { ...cur, home, housingLog: log(cur, { at: new Date(nowMs).toISOString(), day: today, kind: "transfer", from: from?.flat ? `UNIT ${from.unit}, ${from.buildingName}` : null, to: doorOf(o.u), d, up: Boolean(o.up) }) };
  });
  if (raced || !saved) return { ok: false, status: 409, error: HOUSING_LINES.oneAtATime, code: "pending" };
  await setPenHome(caseId, saved.home).catch(() => false);
  console.log("housing: transfer filed", JSON.stringify({ day: today, d, to: o.u, up: Boolean(o.up) }));
  return { ok: true, rec: saved, line: HOUSING_LINES.filed(o.label, o.building, d) };
}
