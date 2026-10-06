// THE EB SHOP's live stock, shared: one fetch of /api/funnel?shop=1 per page (the overlay,
// the wall racks in the shop floor and the keyboard links all read this copy), and the wall's
// pixel thumbnails, made only once the shop room is actually drawn. docs/CITY_SPEC.md
// "The funnels". The geometry (shopSlots) is pure, so scripts/check-funnel-shop.mjs can test
// that a tap on a rack lands on the right product.

let ST = { state: "idle" };   // idle | loading | open | closed; open: {items, stale}
let LOADING = null;
const subs = new Set();
const tell = () => { for (const f of subs) { try { f(ST); } catch { /* a dead listener */ } } };

export const shopState = () => ST;
export function onShop(f) { subs.add(f); return () => subs.delete(f); }
// The answer as the walls read it: an open shop with stock, or closed (stale stock counts as
// closed on the walls: the racks show only what is really on the shelf).
export function readShop(j) {
  if (!j || j.closed || !Array.isArray(j.items) || !j.items.length) return { state: "closed" };
  const items = j.items.filter(i => i && i.handle && i.title).map(i => ({ handle: String(i.handle), title: String(i.title), price: String(i.price ?? ""), image: i.image || null, video: i.video || null, type: i.type || "" }));
  return items.length ? { state: "open", items, stale: Boolean(j.stale) } : { state: "closed" };
}
export const wallOpen = (st = ST) => st.state === "open" && !st.stale;

export function loadShop(fetchFn = typeof fetch !== "undefined" ? fetch : null) {
  if (LOADING) return LOADING;
  if (!fetchFn) return Promise.resolve(ST);
  ST = { state: "loading" }; tell();
  LOADING = fetchFn("/api/funnel?shop=1").then(r => (r.ok ? r.json() : { closed: true })).catch(() => ({ closed: true }))
    .then(j => { ST = readShop(j); tell(); return ST; });
  return LOADING;
}
// test hook: put the shop in a given state without the network
export function setShop(j) { ST = j == null ? { state: "idle" } : readShop(j); LOADING = j == null ? null : Promise.resolve(ST); tell(); }

// ---- the racks ------------------------------------------------------------------------------
// Framed thumbnails on the shop floor's back wall, two racks above the record shelf, left of
// the shop's sign. Room-relative px: [{i, x, y, s}] (s: the square's side). u: the room's pixel.
export function shopSlots(w, h, u, n) {
  const s = Math.max(4 * u, Math.min(14 * u, Math.round((h * 0.17) / u) * u));
  const gap = Math.max(u, Math.round(s * 0.28 / u) * u);
  const x0 = 6 * u, x1 = w * 0.68;
  const fit = Math.max(0, Math.floor((x1 - x0 + gap) / (s + gap)));
  const tops = [Math.round(h * 0.09), Math.round(h * 0.09) + s + gap + u];
  const rows = tops.filter(y0 => y0 + s <= h * 0.5).length;
  // as few racks as hold it, evenly filled (never 23 and a lonely one)
  const per = fit && rows ? Math.min(fit, Math.ceil(Math.min(n, fit * rows) / Math.max(1, Math.ceil(Math.min(n, fit * rows) / fit)))) : 0;
  const out = [];
  for (let r = 0; r < tops.length && out.length < n; r++) {
    if (tops[r] + s > h * 0.5) break;   // never down into the shelf and the people
    for (let k = 0; k < per && out.length < n; k++) out.push({ i: out.length, x: x0 + k * (s + gap), y: tops[r], s });
  }
  return out;
}
// The topmost item at a room-relative point, or null.
export function slotAt(w, h, u, items, x, y) {
  const sl = shopSlots(w, h, u, items.length);
  for (const q of sl) if (x >= q.x - u && x <= q.x + q.s + u && y >= q.y - u && y <= q.y + q.s + 2 * u) return items[q.i];
  return null;
}

// ---- the thumbnails -------------------------------------------------------------------------
// Each image fetched small (Shopify's own resize) and painted at the room's pixel size, so a
// cover reads as a few dozen pixels, like everything else in the city. Made on first draw.
const IMG = new Map(), PIX = new Map();
const small = (url) => { try { const u = new URL(url); u.searchParams.set("width", "96"); return u.toString(); } catch { return url; } };
export function thumb(item, px) {
  if (!item?.image || typeof Image === "undefined" || typeof document === "undefined") return null;
  const key = `${item.handle}|${px}`;
  if (PIX.has(key)) return PIX.get(key);
  let img = IMG.get(item.handle);
  if (!img) { img = new Image(); img.crossOrigin = "anonymous"; img.decoding = "async"; img.src = small(item.image); IMG.set(item.handle, img); }
  if (!img.complete || !img.naturalWidth) return null;
  const c = document.createElement("canvas");
  c.width = px; c.height = px;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = true;
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, px, px);
  PIX.set(key, c);
  return c;
}

// The rack the keyboard is on (FunnelOverlay's ShopWallLinks): its frame is lit.
let FOCUS = null;
export const shopFocus = () => FOCUS;
export function setShopFocus(h) { FOCUS = h || null; }
