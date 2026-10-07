// THE NPC SHOPS' STOCK (the pure half; npcShops.jsx draws it). They sell real EB Shop stock (docs/CITY_SPEC.md "The NPC shops"). A storefront unit a
// citizen has opened (enterprise.js) shelves the live products its trade would plausibly sell
// (npcTags.js SHOP_TAGS: a video rental the DVDs, a boutique the clothes, a pawn shop the rings),
// framed on its back wall exactly as the EB Shop's own racks are (shopStock.js slots and
// thumbnails). A tap opens the item card: BUY THE REAL ONE (tagged utm_campaign=npc-<trade>,
// utm_content=<handle>) and the virtual copy for CYCLES. A GAME SHOP also stocks Iridescent's own
// boxed games. Every open and every link out counts for npc-<trade> (the funnel counter).
// One fetch of /api/funnel?shop=npc per page. Closed or stale feed: CLOSED FOR INVENTORY.
// THE HOOK: a sale here does not touch the sim's economy yet. A later pass can credit the shop's
// owner (enterprise.js bizById(unit).owner) from a counted `out` or a claimed copy.
import { shopSlots } from "./shopStock.js";
import { SHOP_TAGS, NPC_MIN, NPC_MAX, BOXED, BOXED_TRADES, RECORDS_MOVIE, slugOf } from "./npcTags.js";
import { GAME } from "./funnels.js";
import { unitView } from "./enterpriseClient.js";
import { SHOP_TYPES } from "./enterprise.js";
import { UNIT_SET } from "./storefrontSim.js";

// ---- the shared fetch ---------------------------------------------------------------------------
let ST = { state: "idle" };   // idle | loading | open (tags, stale) | closed
let LOADING = null;
const subs = new Set(), MEMO = new Map();
const tell = () => { MEMO.clear(); for (const f of subs) { try { f(ST); } catch { /* a dead listener */ } } };
export const npcState = () => ST;
export function readNpc(j) {
  if (!j || j.closed || !j.tags || typeof j.tags !== "object") return { state: "closed" };
  const tags = {};
  for (const [t, a] of Object.entries(j.tags)) if (Array.isArray(a)) tags[t] = a.filter(i => i && i.handle && i.title).map(i => ({ handle: String(i.handle), title: String(i.title), price: String(i.price ?? ""), image: i.image || null, video: null, type: i.type || "" }));
  return Object.keys(tags).length ? { state: "open", tags, stale: Boolean(j.stale) } : { state: "closed" };
}
export function loadNpc(fetchFn = typeof fetch !== "undefined" ? fetch : null) {
  if (LOADING) return LOADING;
  if (!fetchFn) return Promise.resolve(ST);
  ST = { state: "loading" }; tell();
  LOADING = fetchFn("/api/funnel?shop=npc").then(r => (r.ok ? r.json() : { closed: true })).catch(() => ({ closed: true }))
    .then(j => { ST = readNpc(j); tell(); return ST; });
  return LOADING;
}
export function setNpc(j) { ST = j == null ? { state: "idle" } : readNpc(j); LOADING = j == null ? null : Promise.resolve(ST); tell(); }   // test hook

// ---- what a trade stocks -------------------------------------------------------------------------
// -> {typeId, slug, boxes: [slug], items, state: "open" | "closed" | "loading" | "none"}, or null
// when the trade stocks nothing (or has too little of it on the real shelf to bother).
export function stockFor(typeId, st = ST) {
  const tags = SHOP_TAGS[typeId];
  if (!tags) return null;
  const key = `${typeId}|${st.state}|${st.stale ? 1 : 0}`;
  if (st === ST && MEMO.has(key)) return MEMO.get(key);
  const boxes = BOXED_TRADES.includes(typeId) ? BOXED.filter(s => GAME[s]) : [];
  let items = [], state = st.state === "open" ? (st.stale ? "closed" : "open") : st.state === "idle" ? "loading" : st.state;   // stale counts as closed on the walls
  if (state === "open") {
    const lists = tags.map(t => (st.tags[t] || []).filter(i => t !== "movie" || typeId !== "records" || RECORDS_MOVIE.test(i.title)));
    const seen = new Set();
    // round-robin across the trade's tags, so a pawn shop is not all rings
    for (let k = 0; items.length < NPC_MAX && lists.some(l => k < l.length); k++) for (const l of lists) { const i = l[k]; if (i && !seen.has(i.handle) && items.length < NPC_MAX) { seen.add(i.handle); items.push(i); } }
    if (items.length < NPC_MIN) { items = []; state = "none"; }
  }
  const out = state === "none" && !boxes.length ? null : { typeId, slug: slugOf(typeId), boxes, items, state };
  if (st === ST) MEMO.set(key, out);
  return out;
}
// The shop in this unit today: {typeId, label, sign, stock}, or null (TO LET, closed, a trade with no stock)
export function shopOf(pid, block) {
  if (!UNIT_SET.has(pid)) return null;
  let v = null;
  try { v = unitView(pid, block); } catch { return null; }
  if (!v || v.state !== "OPEN" || !v.typeId) return null;
  const stock = stockFor(v.typeId);
  return stock ? { typeId: v.typeId, label: v.type?.label || SHOP_TYPES[v.typeId]?.label || "", sign: v.biz?.sign || v.type?.label || "", stock } : null;
}
// what an item or the room opens (FunnelOverlay Shop reads spec.npc)
export const payload = (sh) => ({ type: sh.typeId, sign: sh.sign, items: sh.stock.items, boxes: sh.stock.boxes });
export const entries = (st) => [...st.boxes.map(slug => ({ box: true, slug, handle: `box:${slug}`, title: GAME[slug]?.title || slug })), ...st.items];
// how many wall slots a shop needs: its stock, or the notice board's room
export const need = (st) => (st.state === "open" ? entries(st).length : st.boxes.length + (st.boxes.length ? 6 : 12));
export const RIGHT = 0.96;

// ---- the taps ------------------------------------------------------------------------------------
// -> [{spec, box}] in room px for funnelRoomHits: the room opens the shop; each slot, its item
export function hitsFor(pid, plan, u, block) {
  const sh = shopOf(pid, block);
  if (!sh) return [];
  const st = sh.stock, out = [];
  if (st.state === "loading") return out;
  out.push({ spec: { kind: "shop", campaign: st.slug, npc: payload(sh) }, box: [0, 0, plan.w, plan.h] });
  if (!u) return out;
  const list = entries(st), slots = shopSlots(plan.w, plan.h, u, need(st), RIGHT);
  const shown = st.state === "open" ? Math.min(slots.length, list.length) : Math.min(slots.length, st.boxes.length);
  for (let k = 0; k < shown; k++) {
    const q = slots[k], it = list[k];
    out.push({ spec: it.box ? { kind: "game", slug: it.slug, campaign: st.slug, shopCampaign: st.slug, place: pid } : { kind: "shop", campaign: st.slug, item: it.handle, npc: payload(sh) }, box: [q.x - u, q.y - u, q.x + q.s + u, q.y + q.s + 2 * u] });
  }
  return out;
}
export function onNpc(f) { subs.add(f); return () => subs.delete(f); }
