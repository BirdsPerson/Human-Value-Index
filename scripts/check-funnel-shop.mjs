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
// 4. The hosts (hostsLive.js): the shift is the same for every viewer at the same hour, three
//    on the floor in three roles, the rest in the lounge; a tap lands on a host, and the host
//    pitches a real item from the stock (its title and price), then a line of banter.
{
  const HL = await import("../src/city/hostsLive.js");
  for (const day of [1, 2, 3, 40, 605]) for (const hour of [0, 5, 7, 13, 15, 23]) {
    const a = HL.shiftAt("eb-shop", day, hour), b = HL.shiftAt("eb-shop", day, hour);
    const all = [a.register, a.floor, a.turntable, ...a.off];
    if (JSON.stringify(a) !== JSON.stringify(b) || new Set(all).size !== 6 || !all.every(h => HL.HOSTS[h])) { ok(false, `shift ${day}/${hour}: deterministic, six hosts, each once`); continue; }
  }
  ok(true, "shifts: deterministic, three on the floor, three in the lounge, each host once");
  const pair = (h) => HL.shiftAt("eb-shop", 9, h).on;
  ok(pair(9).includes("dale") && pair(9).includes("carol") && pair(16).includes("hector") && pair(16).includes("asuka") && pair(2).includes("vern") && pair(2).includes("joan"), "each daypart's crew works its own hours (day, La Hora Internacional, Liquidation Hour)");
  const covers = new Set(); for (let d = 1; d < 60; d++) covers.add(HL.shiftAt("eb-shop", d, 9).on[2]);
  ok(covers.size >= 3, "the third host on the floor changes from day to day");
  ok(Object.values(HL.CHATTER).every(l => l.length >= 10 && l.every(x => x === x.toUpperCase() && x.length <= 80)), "every host has 10+ short lines of chatter, all caps");
  ok(Object.values(HL.CHATTER).flat().every(x => !/FREE SHIPPING|FREE RETURNS|DISCOUNT|GUARANTEE/.test(x)), "nobody promises shipping, returns or discounts");
  const looks = Object.values(HL.HOSTS).map(h => `${h.top}|${h.bottom}`);
  ok(new Set(looks).size === looks.length, "no two hosts in the same clothes");
  const c1 = HL.chatterAt("eb-shop", ["dale", "carol", "joan"], 70.2), c2 = HL.chatterAt("eb-shop", ["dale", "carol", "joan"], 70.2);
  ok(c1 && JSON.stringify(c1) === JSON.stringify(c2) && HL.CHATTER[c1.host].includes(c1.line), "one bubble per room at a time, the same for everyone");
  SS.setShop({ items });
  for (const [w, h, sw, u] of SIZES) {
    const plan = PROPS.roomPlan("recordshop", w, h, sw, cap("eb-shop"));
    const spots = FP.hostSpots("eb-shop", plan, 3.3, 10, 50);
    const sh = HL.shiftAt("eb-shop", 50, 10);
    ok(spots.length === 3 && spots.map(s => s.host).sort().join() === sh.on.slice().sort().join(), `shop ${w}x${h}: the shift's three hosts on the floor`);
    const hits = FP.funnelRoomHits("eb-shop", plan, 0.3, u).filter(x => x.spec.kind === "host");
    ok(hits.length === 3 && hits.every(x => x.box[0] >= -4 && x.box[2] <= w + 4 && x.box[1] >= 0), `shop ${w}x${h}: each host can be tapped, inside the room`);
    const [cx, cy] = centre(hits[0].box);
    const spec = FP.funnelTapAt("eb-shop", plan, cx, cy, u);
    ok(spec?.kind === "host" && HL.HOSTS[spec.host], `shop ${w}x${h}: a tap on a host resolves to that host (${spec?.host})`);
    const lounge = PROPS.roomPlan("union", w, h, sw, cap("campus-lounge"));
    ok(FP.funnelRoomHits("campus-lounge", lounge, 0.3, u).filter(x => x.spec.kind === "host" && x.spec.off).length === 3, `lounge ${w}x${h}: the hosts off the clock are upstairs, tappable`);
  }
  HL.resetHosts();
  const t1 = HL.tapHost("carol", items, 1), t2 = HL.tapHost("carol", items, 2), t3 = HL.tapHost("carol", items, 3);
  ok(t1.item && items.includes(t1.item) && t1.line.includes(t1.item.title.toUpperCase().slice(0, 10)) && t1.line.includes(`$${Number(t1.item.price)}`), `a tap: a pitch for a real item, its title and price ("${t1.line}")`);
  ok(t2.item && t2.item !== t1.item, "a second tap: another item");
  ok(!t3.item && HL.CHATTER.carol.includes(t3.line), "a third: a line of banter");
  ok(!HL.tapHost("vern", [], 4).item, "no stock: banter, never an invented product");
  ok(HL.tapHost("joan", items, 5, true).line === HL.OFF_LINES.joan, "off the clock: an off-duty line");
  const ov = readFileSync(join(ROOT, "src/city/FunnelOverlay.jsx"), "utf8");
  ok(/kind: "shop", campaign: spec\.campaign \|\| "eb-shop", item: r\.item\.handle, pitch/.test(ov), "a pitch opens that item in the shop (BUY AT THE EB SHOP, tagged)");
  ok(/TALK TO \$\{/.test(ov) && /aria-live="polite"/.test(ov), "keyboard and screen readers: a TALK TO button per host, the reply announced");
}
SS.setShop(null);

// FIND > finds the shop
ok(F.findFunnel("eb sh")[0]?.id === "eb-shop" && F.findFunnel("arcade")[0]?.id === "the-arcade" && F.findFunnel("x").length === 0, "FIND finds the EB Shop and the Arcade by name");

console.log(failed ? `check-funnel-shop: ${failed} of ${n} FAILED` : `check-funnel-shop: ${n} checks passed`);
process.exit(failed ? 1 : 0);
