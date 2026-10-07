// THE NPC SHOPS sell real EB Shop stock (docs/CITY_SPEC.md "The NPC shops"). A storefront unit a
// citizen has opened (enterprise.js) shelves the live products its trade would plausibly sell
// (npcTags.js SHOP_TAGS: a video rental the DVDs, a boutique the clothes, a pawn shop the rings),
// framed on its back wall exactly as the EB Shop's own racks are (shopStock.js slots and
// thumbnails). A tap opens the item card: BUY THE REAL ONE (tagged utm_campaign=npc-<trade>,
// utm_content=<handle>) and the virtual copy for CYCLES. A GAME SHOP also stocks Iridescent's own
// boxed games. Every open and every link out counts for npc-<trade> (the funnel counter).
// One fetch of /api/funnel?shop=npc per page. Closed or stale feed: CLOSED FOR INVENTORY.
// THE HOOK: a sale here does not touch the sim's economy yet. A later pass can credit the shop's
// owner (enterprise.js bizById(unit).owner) from a counted `out` or a claimed copy.
import { useEffect, useState } from "react";
import { shopSlots, thumb, shopFocus, setShopFocus } from "./shopStock.js";
import { GAME, cabColors, utm, EB_SHOP } from "./funnels.js";
import { shopOf, entries, need, RIGHT, payload, loadNpc, npcState, hitsFor, onNpc } from "./npcStock.js";
import { openFunnel, injectStyles } from "./FunnelOverlay.jsx";

// ---- the walls -----------------------------------------------------------------------------------
const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
function text(c, s, x, y, px, col, align = "left") {
  if (px < 5) return;
  c.font = `bold ${Math.round(px)}px 'Fira Mono', ui-monospace, Menlo, monospace`;
  c.textAlign = align; c.textBaseline = "top"; c.fillStyle = col; c.fillText(s, Math.round(x), Math.round(y));
}
function hk(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function drawBox(c, slug, sx, sy, s, u) {
  const [a, b] = cabColors(slug), soon = GAME[slug]?.status === "dev";
  R(c, "#fbbf24", sx - u, sy - u, s + 2 * u, s + 2 * u);   // the Iridescent gold edge
  R(c, soon ? "#374151" : a, sx, sy, s, s);
  R(c, soon ? "#1f2937" : b, sx, sy + s * 0.62, s, s * 0.38);
  R(c, "#0b0b10", sx + s * 0.1, sy + s * 0.12, s * 0.8, s * 0.36);
  text(c, (GAME[slug]?.title || slug).toUpperCase(), sx + s / 2, sy + s * 0.2, Math.min(s * 0.17, 3.4 * u), soon ? "#9ca3af" : "#f8fafc", "center");
  text(c, soon ? "COMING SOON" : "IRIDESCENT", sx + s / 2, sy + s * 0.7, Math.min(s * 0.11, 2.2 * u), soon ? "#fbbf24" : "#0b0b10", "center");
  if (soon) R(c, "#fbbf24", sx, sy + s * 0.56, s, u);
}
function draw(c, pid, x, y, w, h, u) {
  const sh = shopOf(pid);
  if (!sh) return;
  const st = sh.stock;
  if (npcState().state === "idle") loadNpc();
  const slots = shopSlots(w, h, u, need(st), RIGHT);
  if (!slots.length) return;
  const f = shopFocus(), list = entries(st);
  const nBoxes = st.boxes.length, shown = st.state === "open" ? Math.min(slots.length, list.length) : Math.min(slots.length, nBoxes);
  for (let k = 0; k < shown; k++) {
    const q = slots[k], it = list[k], sx = x + q.x, sy = y + q.y;
    if (it.box) { drawBox(c, it.slug, sx, sy, q.s, u); continue; }
    R(c, f === it.handle ? "#fbbf24" : "#120c08", sx - u, sy - u, q.s + 2 * u, q.s + 2 * u);
    const tc = thumb(it, Math.max(4, Math.round(q.s / u)));
    if (tc) { c.imageSmoothingEnabled = false; c.drawImage(tc, Math.round(sx), Math.round(sy), q.s, q.s); }
    else R(c, ["#dc2626", "#1d4ed8", "#eab308", "#15803d", "#9333ea", "#f97316"][hk(it.handle) % 6], sx, sy, q.s, q.s);
    R(c, "#fbbf24", sx + q.s - 3 * u, sy + q.s - u, 3 * u, 2 * u);   // the price sticker
  }
  if (st.state !== "open" && slots.length > nBoxes) {
    // closed, stale or still counting: a board across the rest of the shelf
    const a = slots[nBoxes], z = slots[slots.length - 1];
    const bx = x + a.x, by = y + a.y, bw = Math.max(30 * u, z.x + z.s - a.x), bh = Math.max(9 * u, z.y + z.s - a.y);
    R(c, "#120c08", bx, by, bw, bh);
    if (st.state === "loading") R(c, "#2a1e14", bx + u, by + u, bw - 2 * u, bh - 2 * u);
    else { R(c, "#e8d36a", bx + bw * 0.06, by + bh * 0.3, bw * 0.88, bh * 0.4); text(c, "CLOSED FOR INVENTORY", bx + bw / 2, by + bh * 0.5 - 1.6 * u, 3.2 * u, "#3a2a0a", "center"); }
  }
  if (w > 60 * u) text(c, "EB SHOP STOCK", x + w - 4 * u, y + h * 0.5 - 4 * u, 1.8 * u, "#67e8f9", "right");
}

export const api = { draw, hits: hitsFor };

// ---- the keyboard's way in -------------------------------------------------------------------------
export default function NpcShopLinks({ pid }) {
  const [, setSt] = useState(0);
  useEffect(() => { injectStyles(); const off = onNpc(() => setSt(n => n + 1)); loadNpc(); return off; }, []);
  const sh = shopOf(pid);
  if (!sh) return null;
  const st = sh.stock, slug = st.slug;
  return (
    <ul className="hvi-shopwall" aria-label={`In ${sh.sign}`}>
      {st.boxes.map(s => (
        <li key={s}><a href={utm(GAME[s].play || GAME[s].itch || "https://iridescent-studio.netlify.app", slug)} target="_blank" rel="noopener"
          onClick={(e) => { e.preventDefault(); openFunnel({ kind: "game", slug: s, campaign: slug, shopCampaign: slug, place: pid }); }}>
          {GAME[s].status === "dev" ? `${GAME[s].title}, an Iridescent game, COMING SOON` : `PLAY ${GAME[s].title}, an Iridescent game`}
        </a></li>
      ))}
      {st.state === "open" && st.items.map(it => (
        <li key={it.handle}><a href={utm(`${EB_SHOP}/products/${it.handle}`, slug, it.handle)} target="_blank" rel="noopener"
          onFocus={() => setShopFocus(it.handle)} onBlur={() => setShopFocus(null)}
          onClick={(e) => { e.preventDefault(); openFunnel({ kind: "shop", campaign: slug, item: it.handle, npc: payload(sh) }); }}>
          {`BUY ${it.title}, $${it.price}, from the EB Shop, sold here at ${sh.sign}`}
        </a></li>
      ))}
      {(st.state === "closed" || st.state === "none") && <li className="sr-only">{`${sh.sign}: THE EB SHOP STOCK IS CLOSED FOR INVENTORY.`}</li>}
    </ul>
  );
}
