// The EB Shop's racks and every cabinet's tap (docs/CITY_SPEC.md "The funnels"): the shop floor
// shows the live stock on its walls, a tap on a rack opens that product, stale or closed stock
// puts CLOSED FOR INVENTORY on the walls; and in every room a cabinet stands in, a tap on it plays
// its game, in the city's cutaway and on the building page alike (both call funnelTapAt with the
// room's plan and pixel). No network. Run: node scripts/check-funnel-shop.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let n = 0, failed = 0;
const ok = (c, msg) => { n++; if (!c) { failed++; console.log(`  FAIL ${msg}`); } };

const SIM = await import("../src/city/sim.js");
const PROPS = await import("../src/city/props.js");
const FP = await import("../src/city/funnelProps.js");
const F = await import("../src/city/funnels.js");
const SS = await import("../src/city/shopStock.js");

const items = Array.from({ length: 24 }, (_, i) => ({ handle: `item-${i}`, title: `Item ${i}`, price: `${5 + i}.00`, image: `https://cdn.shopify.com/i${i}.jpg?width=360`, video: i === 3 ? { mp4: "https://cdn.shopify.com/v.mp4" } : null }));
const cap = (pid) => Math.round(SIM.PLACES[pid].cap / SIM.PLACES[pid].floors.length);
// the sizes the rooms are drawn at: the city's cutaway (u = rh / 40) and the building page (u = ih / 50)
const SIZES = [[916, 188, 34, 5], [700, 120, 32, 3], [940, 120, 32, 2], [316, 120, 32, 2], [520, 150, 43, 4]];
const centre = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

// 1. Open: the shop floor has a rack slot per item (as many as the wall holds), each tap its product.
SS.setShop({ items });
ok(SS.wallOpen(), "fresh stock: the walls are open");
for (const [w, h, sw, u] of SIZES) {
  const plan = PROPS.roomPlan("recordshop", w, h, sw, cap("eb-shop"));
  const slots = SS.shopSlots(w, h, u, items.length);
  ok(slots.length >= Math.min(items.length, 10), `shop ${w}x${h}: ${slots.length} item slots on the wall`);
  ok(slots.every(q => q.x >= 0 && q.x + q.s <= w && q.y >= 0 && q.y + q.s <= h * 0.5), `shop ${w}x${h}: every slot on the wall, above the shelf`);
  ok(slots.every((q, i) => slots.every((r, j) => i === j || q.x + q.s <= r.x || r.x + r.s <= q.x || q.y + q.s <= r.y || r.y + r.s <= q.y)), `shop ${w}x${h}: no two slots overlap`);
  let right = 0;
  for (const q of slots) {
    const spec = FP.funnelTapAt("eb-shop", plan, q.x + q.s / 2, q.y + q.s / 2, u);
    if (spec?.kind === "shop" && spec.item === items[q.i].handle && spec.campaign === "eb-shop") right++;
  }
  ok(right === slots.length, `shop ${w}x${h}: a tap on each rack opens its own product (${right}/${slots.length})`);
  const room = FP.funnelTapAt("eb-shop", plan, w - 3, h - 3, u);
  ok(room?.kind === "shop" && !room.item, `shop ${w}x${h}: the rest of the floor opens the whole shop`);
  const hasCounter = plan.rows.some(r => r.items.some(i => i.prop === "shopCounter"));
  if (hasCounter) {
    const hits = FP.funnelRoomHits("eb-shop", plan, 0.3, u);
    ok(hits.some(h => h.spec.item === "item-3"), `shop ${w}x${h}: the turntable behind the till shows the item with a video`);
  }
}
// the link a product opens is tagged with its handle
{
  const u = new URL(F.utm(`${F.EB_SHOP}/products/item-7`, "eb-shop", "item-7"));
  ok(u.searchParams.get("utm_content") === "item-7" && u.searchParams.get("utm_campaign") === "eb-shop", "a product's link carries utm_content=<handle>");
}

// 2. Stale or closed: no product slots answer; the floor still opens the shop (which says why).
for (const j of [{ items, stale: true }, { closed: true }, { items: [] }, null]) {
  if (j === null) SS.setShop({ closed: true }); else SS.setShop(j);
  const plan = PROPS.roomPlan("recordshop", 916, 188, 34, cap("eb-shop"));
  const hits = FP.funnelRoomHits("eb-shop", plan, 0.3, 5);
  ok(!SS.wallOpen() && hits.every(h => !h.spec.item) && hits.some(h => h.spec.kind === "shop"), `${JSON.stringify(j)?.slice(0, 40)}: the walls are closed, the floor still opens the shop`);
}
ok(/CLOSED FOR INVENTORY/.test(readFileSync(join(ROOT, "src/city/funnelProps.js"), "utf8")), "the closed walls say CLOSED FOR INVENTORY");
ok(SS.readShop({ items: [{ handle: "x", title: "X", price: "1" }], stale: true }).stale === true, "readShop keeps the stale flag");

// 3. Every cabinet in the city plays its game when tapped, at both views' sizes.
SS.setShop(null);
const rooms = { arcade: F.PLAYABLE.map(g => g.slug), ...F.CABINET_PLACES };
for (const [pid, games] of Object.entries(rooms)) {
  for (const [w, h, sw, u] of SIZES) {
    const plan = PROPS.roomPlan(PROPS.typeOf(pid), w, h, sw, cap(pid));
    const hits = FP.funnelRoomHits(pid, plan, 0.3, u).filter(x => x.spec.kind === "game");
    const seen = new Set();
    for (const h0 of hits) {
      const [cx, cy] = centre(h0.box);
      const spec = FP.funnelTapAt(pid, plan, cx, cy, u);
      if (spec?.kind === "game" && spec.slug === h0.spec.slug && F.GAME[spec.slug]) seen.add(spec.slug);
    }
    for (const g of games) if (plan.rows.some(r => r.items.some(i => i.prop === `cab:${g}`))) ok(seen.has(g), `${pid} ${w}x${h}: a tap on the ${g} cabinet plays ${g}`);
  }
}
// the building page wires the same taps (the bug of 2026-10-05: only the city's cutaway did)
{
  const rs = readFileSync(join(ROOT, "src/city/RoomStage.jsx"), "utf8");
  ok(/funnelTapAt\(/.test(rs) && /openFunnel\(spec\)/.test(rs), "RoomStage (building page, district view) opens what funnelTapAt finds");
  const iso = readFileSync(join(ROOT, "src/city/CityIso.jsx"), "utf8");
  ok(/funnelRoomHits\(pid, plan, 0\.3, u\)/.test(iso), "the city's cutaway passes the room's pixel (the racks answer there too)");
}
// FIND > finds the shop
ok(F.findFunnel("eb sh")[0]?.id === "eb-shop" && F.findFunnel("arcade")[0]?.id === "the-arcade" && F.findFunnel("x").length === 0, "FIND finds the EB Shop and the Arcade by name");

console.log(failed ? `check-funnel-shop: ${failed} of ${n} FAILED` : `check-funnel-shop: ${n} checks passed`);
process.exit(failed ? 1 : 0);
