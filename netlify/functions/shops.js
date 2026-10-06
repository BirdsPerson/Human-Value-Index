// /api/shops: THE SHOPS, slice 1 (docs/design/ECONOMY_PROPERTY.md, "The shops"; terms §11).
//   GET ?building=<id>                      what that building's flats have placed in their rooms
//                                           (public: room, spot, piece; never a case or a hash)
//   GET ?caseId=                            the file's wardrobe, furniture, saved outfits, flat, balance
//   POST {caseId, action, ...}
//     buy     {sku, nonce}                  a garment ("w:<id>.<colourway>") or a piece ("f:<id>"),
//                                           priced and stocked here; the CYCLES are burned
//     upgrade {itemId, nonce}               a piece to its next tier (the difference + a fee burned, the
//                                           old piece consumed; it stays placed if the room still takes it)
//     wear    {outfit}                      onto the file photo (every piece your own)
//     save    {slot 1..3, outfit}           into the closet
//     place   {itemId, room, spot}          a piece into a room of your assigned flat
//     unplace {itemId}                      back to the inventory
// There is deliberately no action that gives, sells on or transfers an item or a CYCLE between
// files; scripts/check-shops.mjs fails the build if one appears. An unclaimed file shops on its
// number; a file secured to an email shops (and shows its wardrobe) only from that account's session
// (lib/auth.js requireCaseAuth). Only assessed files with a wallet buy. With no ledger configured the
// shops are CLOSED: every read says so, every write answers THE TREASURY IS NOT YET OPEN.
import { isCaseId } from "../lib/intake.js";
import { getCase, hitLimit } from "../lib/store.js";
import { requireCaseAuth, caseAuthBody } from "../lib/auth.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";
import { NO_SUCH_FILE } from "./case.js";
import { ledger, LedgerDown } from "../lib/economy-db.js";
import { SHOP_ACTIONS, shopsView, buy, upgrade, setOutfit, place, buildingRooms, machineDayNow } from "../lib/shops.js";
import { CLOSED_LINE } from "../../src/economy/rules.js";
import { collectionOf } from "../../src/economy/shops.js";

export { SHOP_ACTIONS };
export const SHOP_IP_PER_HOUR = 600;
export const SHOP_CASE_PER_MINUTE = 40;
export const SHOP_WRITES_PER_MINUTE = 20;
export const SHOP_BUYS_PER_DAY = 60;
export const SHOP_MISS_PER_HOUR = 30;

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  const noStore = { "Cache-Control": "no-store" };
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "GET or POST. The shops keep short hours." });
  if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
  let body = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { return json(400, { error: "Your request is not legible." }); }
    if (!SHOP_ACTIONS.includes(body?.action)) return json(400, { error: "The shops have no such counter. Nothing is given, sold on or transferred here." });
  }
  const url = new URL(req.url);
  const L = ledger();
  const open = Boolean(L);
  const ip = clientIp(req, context);
  try {
    if (req.method === "GET" && url.searchParams.has("building")) {
      const b = String(url.searchParams.get("building") || "").slice(0, 64);
      if (!/^[a-z0-9-]{1,64}$/.test(b)) return json(400, { error: "No such building." });
      return json(200, { open, building: b, rooms: open ? await buildingRooms(b) : [] }, { "Cache-Control": "public, max-age=30" });
    }
    const caseId = String((req.method === "GET" ? url.searchParams.get("caseId") : body?.caseId) || "").trim().toUpperCase();
    const md = machineDayNow();
    if (req.method === "GET" && !caseId) return json(200, { open, machineDay: md, collection: collectionOf(md) }, { "Cache-Control": "public, max-age=60" });
    if (!isCaseId(caseId)) return json(400, { error: "That is not a case number." });
    try {
      if (!(await hitLimit(`shop-ip:${ip}`, SHOP_IP_PER_HOUR, "hour")).ok) return json(429, { error: "The shops have seen enough of your location for one hour." }, { "Retry-After": "3600" });
      if (!(await hitLimit(`shop-case:${caseId}`, SHOP_CASE_PER_MINUTE, "minute")).ok) return json(429, { error: "Slow down. The shop assistant is pretending to be busy." }, { "Retry-After": "60" });
      if (req.method === "POST" && !(await hitLimit(`shop-write:${caseId}`, SHOP_WRITES_PER_MINUTE, "minute")).ok) return json(429, { error: "Too many trips to the till this minute." }, { "Retry-After": "60" });
      if ((body.action === "buy" || body.action === "upgrade") && !(await hitLimit(`shop-buy:${caseId}`, SHOP_BUYS_PER_DAY, "day")).ok) return json(429, { error: "Sixty purchases in a day. The Department has flagged your enthusiasm. Return tomorrow." }, { "Retry-After": "3600" });
    } catch {
      return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" });
    }
    const rec = await getCase(caseId);
    if (!rec) {
      const miss = await hitLimit(`shop-miss:${ip}`, SHOP_MISS_PER_HOUR, "hour").catch(() => ({ ok: false }));
      return json(miss.ok ? 404 : 429, { error: miss.ok ? NO_SUCH_FILE : "Too many wrong case numbers. The Department suspects you are guessing." });
    }
    const assessed = Array.isArray(rec.history) && rec.history.some(h => h && typeof h.score === "number");
    if (!assessed) return json(403, { open, assessed: false, error: "Only assessed citizens shop. Your file has no assessment on it." });
    const auth = await requireCaseAuth(req, caseId, { write: req.method === "POST" });
    if (!auth.ok) return json(auth.status, { open, assessed, ...caseAuthBody(auth) }, noStore);
    if (!open) return json(req.method === "GET" ? 200 : 503, { open, assessed, error: CLOSED_LINE, machineDay: md, collection: collectionOf(md) }, noStore);
    if (req.method === "GET") return json(200, { open, assessed, ...(await shopsView(caseId, rec)) }, noStore);

    let out;
    if (body.action === "buy") out = await buy(caseId, body);
    else if (body.action === "upgrade") out = await upgrade(caseId, rec, { itemId: body.itemId, nonce: body.nonce });
    else if (body.action === "wear") out = await setOutfit(caseId, rec, { outfit: body.outfit, slot: 0 });
    else if (body.action === "save") out = await setOutfit(caseId, rec, { outfit: body.outfit, slot: Number(body.slot) });
    else if (body.action === "place") out = await place(caseId, rec, { itemId: body.itemId, room: body.room, spot: body.spot });
    else out = await place(caseId, rec, { itemId: body.itemId, remove: true });
    const fresh = body.action === "wear" && out.ok ? (await getCase(caseId)) || rec : rec;
    const view = await shopsView(caseId, fresh);
    if (!out.ok) return json(out.status || 400, { open, assessed, error: out.error, code: out.code, ...view }, noStore);
    return json(200, { open, assessed, last: out, ...view }, noStore);
  } catch (err) {
    console.error("shops failed", err?.name, err?.message);
    if (err instanceof LedgerDown) return json(503, { open, error: "The Treasury's ledger is unavailable. Nothing was bought. Try again shortly." }, { "Retry-After": "30" });
    return json(500, { error: "The shops are unavailable. Nothing was bought." });
  }
};

export const config = { path: "/api/shops" };
