// THE SHOPS, slice 1: what /api/shops does over the ledger (economy-db.js, the econ_shop_*
// functions) and the case file. Server-authoritative: the browser names a SKU and a nonce; the
// price, the season's stock, ownership, the flat and its rooms are all decided here. A purchase
// burns CYCLES (cash -> dept:burned) in one balanced txn on the buyer's own accounts; there is
// no gift, resale or transfer of anything between players. Nothing here reads or writes a score.
import { randomUUID } from "node:crypto";
import * as SIM from "../../src/city/sim.js";
import { ledger, caseHash } from "./economy-db.js";
import { apartmentOf } from "./economy.js";
import { updateCase, setPenAvatar } from "./store.js";
import { sanitizeAvatar, DEFAULT_SPEC } from "../../src/avatar.js";
import { WEAR_KEYS } from "../../src/wear.js";
import {
  itemOf, onSale, collectionOf, outfitKeys, placeable, spotsFor, roomRule, upgradeOf, MAX_FURN_EACH, OUTFIT_SLOTS, SHOP_LINES,
} from "../../src/economy/shops.js";

export const SHOP_ACTIONS = ["buy", "upgrade", "wear", "save", "place", "unplace"];   // nothing else: no gift, resale or transfer
const nonceOf = (n) => (typeof n === "string" && /^[A-Za-z0-9-]{8,64}$/.test(n) ? n : randomUUID());
export const machineDayNow = (nowMs = Date.now()) => SIM.machineClock(nowMs).day;

// The outfit on the case's file photo now (the wear_* keys of a procedural spec).
export function wornOn(rec) {
  const av = sanitizeAvatar(rec?.avatar);
  if (av?.kind !== "procedural") return {};
  return Object.fromEntries(WEAR_KEYS.filter(k => av.spec[k]).map(k => [k.slice(5), av.spec[k]]));
}

// ---- the file's wardrobe, furniture and flat ------------------------------------------------------
export async function shopsView(caseId, rec, nowMs = Date.now()) {
  const L = ledger();
  const v = await L.rpc("econ_shop_view", { case_hash: caseHash(caseId) });
  const items = (v.items || []).map(i => { const c = itemOf(i.sku) || { name: i.sku, kind: i.kind }; return { ...c, ref: c.id, id: Number(i.id), sku: i.sku, price: Number(i.price), at: i.bought_at }; });
  const placed = new Map((v.placements || []).map(p => [Number(p.item_id), { room: p.room, spot: p.spot, flat: p.flat }]));
  for (const it of items) if (placed.has(it.id)) it.placed = placed.get(it.id);
  const outfits = {};
  for (let k = 1; k <= OUTFIT_SLOTS; k++) outfits[k] = v.outfits?.[String(k)] || null;
  const av = sanitizeAvatar(rec?.avatar);
  return {
    wallet: Boolean(v.wallet), balance: Number(v.cash) || 0, items, outfits,
    worn: wornOn(rec), drawn: av?.kind === "sprite", spec: av?.kind === "procedural" ? av.spec : null,
    apartment: apartmentOf(caseId, rec), machineDay: machineDayNow(nowMs), collection: collectionOf(machineDayNow(nowMs)),
  };
}

// ---- BUY: one SKU, priced here, burned ------------------------------------------------------------------
export async function buy(caseId, { sku, nonce }, nowMs = Date.now()) {
  const it = itemOf(sku);
  if (!it) return { ok: false, status: 400, error: "THE DEPARTMENT DOES NOT STOCK THAT." };
  if (it.upgradeOnly) return { ok: false, status: 409, error: `THE ${it.name} IS NOT SOLD OUTRIGHT. BUY THE TIER BELOW AND UPGRADE IT.`, code: "upgrade-only" };
  if (!onSale(sku, machineDayNow(nowMs))) return { ok: false, status: 409, error: SHOP_LINES.offSeason };
  const h = caseHash(caseId);
  const r = await ledger().rpc("econ_shop_buy", { idem: `shop:${h}:${nonceOf(nonce)}`, case_hash: h, sku, kind: it.kind, price: it.price, max_each: MAX_FURN_EACH });
  if (r.dup) return { ok: true, dup: true, line: SHOP_LINES.dup };
  if (!r.ok) {
    const map = { "no-wallet": [403, SHOP_LINES.noWallet], owned: [409, SHOP_LINES.owned], "too-many": [409, SHOP_LINES.tooMany], insufficient: [402, SHOP_LINES.poor] };
    const [status, error] = map[r.error] || [409, "THE TILL REFUSED."];
    return { ok: false, status, error, code: r.error };
  }
  return { ok: true, item: Number(r.item), line: it.kind === "furn" ? SHOP_LINES.boughtFurn : SHOP_LINES.bought };
}

// ---- WEAR / SAVE: the ledger checks every piece is the case's own --------------------------------------
export async function setOutfit(caseId, rec, { outfit, slot = 0 }) {
  const keys = outfitKeys(outfit);
  if (!keys) return { ok: false, status: 400, error: "THAT IS NOT AN OUTFIT. ONE PIECE PER SLOT, FROM YOUR OWN WARDROBE." };
  if (!(Number.isInteger(slot) && slot >= 0 && slot <= OUTFIT_SLOTS)) return { ok: false, status: 400, error: "THE CLOSET HAS THREE HOOKS." };
  const clean = Object.fromEntries(Object.entries(keys).map(([k, v]) => [k.slice(5), v]));
  const r = await ledger().rpc("econ_shop_outfit", { case_hash: caseHash(caseId), slot, outfit: clean });
  if (!r.ok) return { ok: false, status: r.error === "no-wallet" ? 403 : 409, error: r.error === "no-wallet" ? SHOP_LINES.noWallet : "YOU DO NOT OWN EVERY PIECE OF THAT. THE DEPARTMENT CHECKED." };
  if (slot > 0) return { ok: true, line: SHOP_LINES.saved };
  // worn: onto the file photo (the case and its card in the pen, so the city draws it)
  const cur = sanitizeAvatar(rec?.avatar);
  if (cur?.kind === "sprite") return { ok: true, line: SHOP_LINES.drawn, drawn: true };
  const base = cur?.kind === "procedural" ? cur.spec : DEFAULT_SPEC;
  const spec = Object.fromEntries(Object.entries(base).filter(([k]) => !k.startsWith("wear_")));
  const avatar = sanitizeAvatar({ kind: "procedural", spec: { ...spec, ...keys } });
  const saved = await updateCase(caseId, c => (c && c.avatar?.kind !== "sprite" ? { ...c, avatar } : undefined));
  if (!saved || saved.avatar?.kind === "sprite") return { ok: true, line: SHOP_LINES.drawn, drawn: true };
  await setPenAvatar(caseId, avatar).catch(() => false);
  return { ok: true, line: SHOP_LINES.worn, avatar };
}

// ---- PLACE / UNPLACE: a piece of the case's furniture into a spot of a room of its own flat ------------
export async function place(caseId, rec, { itemId, room, spot, remove = false }) {
  const L = ledger(), h = caseHash(caseId);
  const id = Number(itemId);
  if (!Number.isInteger(id) || id < 1) return { ok: false, status: 400, error: "NO SUCH ITEM IN YOUR INVENTORY." };
  if (remove) {
    const r = await L.rpc("econ_shop_place", { case_hash: h, item_id: id, remove: true });
    return r.ok ? { ok: true, line: SHOP_LINES.removed } : { ok: false, status: 409, error: "NO SUCH ITEM IN YOUR INVENTORY." };
  }
  const apt = apartmentOf(caseId, rec);
  if (!apt?.flat) return { ok: false, status: 409, error: SHOP_LINES.noFlat };
  const v = await L.rpc("econ_shop_view", { case_hash: h });
  const own = (v.items || []).find(i => Number(i.id) === id);
  const it = own && itemOf(own.sku);
  if (!it || it.kind !== "furn") return { ok: false, status: 409, error: "NO SUCH ITEM IN YOUR INVENTORY." };
  if (!apt.flat.rooms.some(r => r.id === room) || !placeable(it, room, apt.flat.id)) return { ok: false, status: 400, error: `A ${it.name} DOES NOT GO THERE. THE DEPARTMENT HAS A FLOOR PLAN.` };
  if (!spotsFor(it).some(s => s.id === spot)) return { ok: false, status: 400, error: "NO SUCH SPOT IN THAT ROOM." };
  const rule = roomRule(it, room, await othersIn(apt.building, own.sku, id, h));
  if (rule) return { ok: false, status: 409, error: rule === "needs-room" ? SHOP_LINES.needsRoom : SHOP_LINES.roomGiven, code: rule };
  const r = await L.rpc("econ_shop_place", { case_hash: h, item_id: id, flat: apt.flat.id, room, spot });
  if (!r.ok) return { ok: false, status: 409, error: r.error === "taken" ? SHOP_LINES.taken : "NO SUCH ITEM IN YOUR INVENTORY." };
  roomsCache.delete(apt.building);
  return { ok: true, line: SHOP_LINES.placed };
}

// Every piece placed in the building except this one: [{room, spot, item}] (fresh, not cached).
async function othersIn(buildingId, _sku, itemId, h) {
  const rows = await ledger().rpc("econ_shop_rooms", { building: buildingId });
  const mine = await ledger().rpc("econ_shop_view", { case_hash: h });
  const self = (mine.placements || []).find(x => Number(x.item_id) === itemId);
  return (rows || []).filter(x => !(self && x.room === self.room && x.spot === self.spot)).map(x => ({ room: x.room, spot: x.spot, item: String(x.sku).slice(2) }));
}

// ---- UPGRADE: the piece becomes the next tier (the difference + the fee, burned; the old consumed) --------
export async function upgrade(caseId, rec, { itemId, nonce }) {
  const L = ledger(), h = caseHash(caseId), id = Number(itemId);
  if (!Number.isInteger(id) || id < 1) return { ok: false, status: 400, error: "NO SUCH ITEM IN YOUR INVENTORY." };
  const v = await L.rpc("econ_shop_view", { case_hash: h });
  const own = (v.items || []).find(i => Number(i.id) === id);
  const it = own && itemOf(own.sku);
  const idem = `shop:${h}:${nonceOf(nonce)}`;
  if (!it || it.kind !== "furn") {
    // a repeat of an upgrade already made (its piece consumed) answers as the duplicate it is
    const d = await L.rpc("econ_shop_upgrade", { idem, case_hash: h, item_id: id, from_sku: "f:none", to_sku: "f:none", price: 1 });
    return d.dup ? { ok: true, dup: true, line: SHOP_LINES.dup } : { ok: false, status: 409, error: "NO SUCH ITEM IN YOUR INVENTORY." };
  }
  const up = upgradeOf(it.id);
  if (!up) return { ok: false, status: 409, error: SHOP_LINES.noUpgrade };
  const next = itemOf(`f:${up.to}`);
  // where it stands now, and whether the next tier fits there (the room takes it, the whole-room rule)
  const at = (v.placements || []).find(x => Number(x.item_id) === id);
  let keep = null;
  if (at) {
    const apt = apartmentOf(caseId, rec);
    const others = await othersIn(apt?.building, own.sku, id, h);
    const spot = next.whole ? "f2" : at.spot;
    const fits = apt?.flat && at.flat === apt.flat.id && placeable(next, at.room, apt.flat.id) && spotsFor(next).some(s => s.id === spot) && !roomRule(next, at.room, others) && !others.some(o => o.room === at.room && o.spot === spot);
    if (fits) keep = { flat: at.flat, room: at.room, spot };
  }
  const r = await L.rpc("econ_shop_upgrade", { idem, case_hash: h, item_id: id, from_sku: own.sku, to_sku: next.sku, price: up.price, max_each: MAX_FURN_EACH, place: keep });
  if (r.dup) return { ok: true, dup: true, line: SHOP_LINES.dup };
  if (!r.ok) {
    const map = { "not-owned": [409, "NO SUCH ITEM IN YOUR INVENTORY."], "too-many": [409, SHOP_LINES.tooMany], insufficient: [402, SHOP_LINES.poor], taken: [409, SHOP_LINES.taken] };
    const [status, error] = map[r.error] || [409, "THE WORKSHOP REFUSED."];
    return { ok: false, status, error, code: r.error };
  }
  if (at) roomsCache.clear();
  return { ok: true, item: Number(r.item), price: up.price, line: at && !keep ? SHOP_LINES.upgradedStored : SHOP_LINES.upgraded };
}

// ---- what a building's flats hold (public, for the cutaway): [{room, spot, item}] ----------------------
const roomsCache = new Map();
export async function buildingRooms(buildingId, nowMs = Date.now()) {
  const L = ledger();
  if (!L || !SIM.BUILDING[buildingId]) return [];
  const c = roomsCache.get(buildingId);
  if (c && nowMs - c.at < 30_000) return c.v;
  const rows = await L.rpc("econ_shop_rooms", { building: buildingId });
  const v = (rows || []).map(x => ({ room: x.room, spot: x.spot, item: String(x.sku).slice(2) })).filter(x => itemOf(`f:${x.item}`));
  if (roomsCache.size > 200) roomsCache.clear();
  roomsCache.set(buildingId, { at: nowMs, v });
  return v;
}
