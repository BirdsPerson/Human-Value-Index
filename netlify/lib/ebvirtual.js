// THE EB SHOP's VIRTUAL COPIES, server side (src/economy/ebvirtual.js has the rules): the catalog of
// every listing the real shop has ever shown, each with its frozen virtual SKU. Read from the
// storefront's public products.json (no keys) at most once per CATALOG_TTL and kept in Blobs (no
// person in it: handles, titles, photos, SKUs). A listing that leaves the shop or goes out of stock
// stays in the catalog, marked sold: the virtual copy is sold on regardless.
//
// The look: each new listing's photo is fetched once, 64 px, as PNG (Shopify's CDN converts), decoded
// here (node:zlib, no dependency), and its two strongest colours away from the background become
// the copy's colours; a jersey also gets its number (the title, a "number:NN" tag, OVERRIDES).
import { inflateSync } from "node:zlib";
import { getStore } from "@netlify/blobs";
import { categorize, numberOf, skuOf, hash8, tierPrice, parseVirtual } from "../../src/economy/ebvirtual.js";

export const SHOP = "https://shop.electricbasement.tv";
export const STORE = "ebvirtual";
export const CATALOG_TTL = 15 * 60 * 1000;
export const LOOKS_PER_READ = 120;   // new photos read per refresh (the rest wait for the next one)
// Listings whose photo cannot say everything (the Pistons jersey is Grant Hill's 33; the title does
// not say so). Add a "number:NN" tag in Shopify instead where you can.
export const OVERRIDES = { "champion-vintage-detroit-pistons-nba-basketball-jersey": { number: "33" } };

const store = () => getStore({ name: STORE, consistency: "strong" });

// ---- PNG -> RGB ------------------------------------------------------------------------------------
// 8-bit, non-interlaced, greyscale / RGB / palette / grey+alpha / RGBA. -> {w, h, rgb} | null
export function decodePng(buf) {
  const b = Buffer.from(buf);
  if (b.length < 33 || b.readUInt32BE(0) !== 0x89504e47 || b.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  let p = 8, w = 0, h = 0, depth = 0, ct = 0, inter = 0, pal = null;
  const idat = [];
  while (p + 8 <= b.length) {
    const len = b.readUInt32BE(p), type = b.toString("latin1", p + 4, p + 8), data = b.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ct = data[9]; inter = data[12]; }
    else if (type === "PLTE") pal = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  const bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  if (!bpp || depth !== 8 || inter !== 0 || !w || !h || w * h > 1 << 20 || (ct === 3 && !pal)) return null;
  let raw;
  try { raw = inflateSync(Buffer.concat(idat)); } catch { return null; }
  const stride = w * bpp;
  if (raw.length < h * (stride + 1)) return null;
  const out = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = y * stride, src = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[row + x - bpp] : 0, up = y ? out[row - stride + x] : 0, ul = y && x >= bpp ? out[row - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const pp = a + up - ul, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - ul); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : ul; }
      out[row + x] = v & 255;
    }
  }
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const s = i * bpp;
    if (ct === 2 || ct === 6) { rgb[i * 3] = out[s]; rgb[i * 3 + 1] = out[s + 1]; rgb[i * 3 + 2] = out[s + 2]; }
    else if (ct === 3) { const k = out[s] * 3; rgb[i * 3] = pal[k]; rgb[i * 3 + 1] = pal[k + 1]; rgb[i * 3 + 2] = pal[k + 2]; }
    else rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = out[s];
  }
  return { w, h, rgb };
}

// ---- the colours of a photo -----------------------------------------------------------------------
const hex = (c) => c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// {w, h, rgb} -> {main, detail} (hex, no "#"): the commonest colour in the middle of the photo that
// is not the background (the border's average), and the next commonest that differs from it.
export function dominantColours({ w, h, rgb }) {
  const px = (x, y) => { const i = (y * w + x) * 3; return [rgb[i], rgb[i + 1], rgb[i + 2]]; };
  const border = [];
  for (let x = 0; x < w; x++) border.push(px(x, 0), px(x, h - 1));
  for (let y = 1; y < h - 1; y++) border.push(px(0, y), px(w - 1, y));
  const bg = [0, 1, 2].map(k => border.reduce((s, c) => s + c[k], 0) / border.length);
  const B = new Map();
  for (let y = Math.floor(h * 0.15); y < Math.ceil(h * 0.85); y++) for (let x = Math.floor(w * 0.2); x < Math.ceil(w * 0.8); x++) {
    const c = px(x, y);
    if (dist(c, bg) < 48) continue;
    const k = (c[0] >> 5) * 64 + (c[1] >> 5) * 8 + (c[2] >> 5);
    const e = B.get(k) || { n: 0, s: [0, 0, 0] };
    e.n++; e.s[0] += c[0]; e.s[1] += c[1]; e.s[2] += c[2];
    B.set(k, e);
  }
  const list = [...B.values()].sort((a, b) => b.n - a.n).map(e => ({ n: e.n, c: e.s.map(v => v / e.n) }));
  const sat = (c) => { const mx = Math.max(...c), mn = Math.min(...c); return mx ? (mx - mn) / mx : 0; };
  // product photos are dim: a dark, coloured main is lifted so it reads as its colour, not as black
  const lift = (c, to) => { const mx = Math.max(...c); return mx > 20 && mx < to && sat(c) > 0.35 ? c.map(v => v * Math.min(1.6, to / mx)) : c; };
  const main = list[0]?.c || bg;
  // the second colour: a trim or a print, so a vivid one beats a commoner grey or white
  const second = list.filter(e => e.n >= 3 && dist(e.c, main) > 90).sort((a, b) => b.n * (sat(b.c) + 0.05) ** 2 - a.n * (sat(a.c) + 0.05) ** 2)[0];
  const lum = 0.3 * main[0] + 0.59 * main[1] + 0.11 * main[2];
  const detail = second ? second.c : main.map(v => (lum > 128 ? v * 0.55 : v + (255 - v) * 0.6));
  return { main: hex(lift(main, 125)), detail: hex(lift(detail, 160)) };
}

// A product photo's colours: fetched small, as PNG, decoded. -> {main, detail} | null
export async function lookOfImage(url, fetchFn = fetch) {
  if (!url) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:") return null;
  u.searchParams.set("width", "64"); u.searchParams.set("format", "png");
  try {
    const r = await fetchFn(u.toString(), { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const img = decodePng(Buffer.from(await r.arrayBuffer()));
    return img ? dominantColours(img) : null;
  } catch { return null; }
}

// ---- the catalog ------------------------------------------------------------------------------------
const sized = (src, w) => (src ? `${src}${src.includes("?") ? "&" : "?"}width=${w}` : null);
const inStock = (p) => (p.variants || []).some(v => v.available);
// A product (storefront products.json, or the Admin API's shape mapped to it) -> a new entry, no look yet.
export function entryOf(p, now) {
  const handle = String(p.handle || "");
  if (!/^[a-z0-9][a-z0-9-]{0,254}$/.test(handle)) return null;
  const c = categorize({ type: p.product_type ?? p.type, title: p.title });
  return {
    handle, h: hash8(handle), title: String(p.title || "").slice(0, 140), type: String(p.product_type ?? p.type ?? "").slice(0, 60),
    image: p.image || sized(p.images?.[0]?.src, 360), cat: c.cat, shape: c.shape || null, form: c.form || null,
    number: c.shape === "jersey" ? numberOf({ title: p.title, tags: Array.isArray(p.tags) ? p.tags : String(p.tags || "").split(",") }, OVERRIDES[handle]) : null,
    sku: null, price: tierPrice(c), live: true, seen: now,
  };
}
// Read the look of an entry and freeze its SKU (once; a SKU never changes after).
export async function freeze(e, fetchFn = fetch) {
  if (e.sku) return e;
  const look = await lookOfImage(e.image, fetchFn);
  if (!look) return e;
  e.sku = skuOf(e.handle, e.cat === "wear" ? { cat: "wear", shape: e.shape } : { cat: "furn", form: e.form }, { ...look, number: e.number });
  return e;
}
async function getJson(fetchFn, url, ms) {
  const r = await fetchFn(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`storefront ${r.status}`);
  return r.json();
}
async function pool(list, n, f) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) await f(list[i++]); })); }

// -> {at, items: {handle: entry}, stale?}. now/fetchFn/st injectable for the check.
export async function virtualCatalog({ fetchFn = fetch, now = Date.now(), st = store(), force = false } = {}) {
  let cached = null;
  try { cached = await st.get("catalog", { type: "json" }); } catch { /* read through */ }
  // fresh: kept; photos still unread are retried at most once a minute
  if (cached && !force && now - cached.at < CATALOG_TTL && (now - (cached.tried || 0) < 60_000 || !Object.values(cached.items).some(e => !e.sku && e.image))) return cached;
  const items = { ...(cached?.items || {}) };
  let list = null;
  try {
    list = [];
    for (let page = 1; page <= 4; page++) {
      const j = await getJson(fetchFn, `${SHOP}/products.json?limit=250&page=${page}`, 6000);
      const ps = j?.products || [];
      list.push(...ps);
      if (ps.length < 250) break;
    }
  } catch { list = null; }
  if (list && list.length) {
    const here = new Set();
    for (const p of list) {
      const e = items[p.handle] || entryOf(p, now);
      if (!e) continue;
      here.add(e.handle);
      e.title = String(p.title || e.title).slice(0, 140);
      if (p.images?.[0]?.src) e.image = sized(p.images[0].src, 360);
      e.live = inStock(p);
      if (e.live) delete e.soldAt; else e.soldAt ||= now;
      items[e.handle] = e;
    }
    for (const e of Object.values(items)) if (!here.has(e.handle)) { e.live = false; e.soldAt ||= now; }
  }
  // the looks: the newest unread photos, garments and live listings first
  const todo = Object.values(items).filter(e => !e.sku && e.image).sort((a, b) => (b.live - a.live) || ((b.cat === "wear") - (a.cat === "wear"))).slice(0, LOOKS_PER_READ);
  await pool(todo, 12, e => freeze(e, fetchFn));
  const out = { at: list ? now : (cached?.at || 0), tried: now, items };
  if (!list && cached) out.stale = true;
  try { await st.setJSON("catalog", out); } catch { /* served, not kept */ }
  return out;
}

// The catalog as last kept (no Shopify read): for naming the copies a file owns.
export async function keptCatalog(st = store()) {
  try { return (await st.get("catalog", { type: "json" })) || { at: 0, items: {} }; } catch { return { at: 0, items: {} }; }
}
// The copy a SKU names, from the catalog (or null: a made-up SKU is never sold).
export async function entryBySku(sku, opts = {}) {
  const v = parseVirtual(sku);
  if (!v) return null;
  const cat = await virtualCatalog(opts);
  return Object.values(cat.items).find(e => e.h === v.h && e.sku === sku) || null;
}
// Add (or find) a listing the Admin API names, for a claim: its copy, its SKU frozen. -> entry | null
export async function ensureEntry(p, { fetchFn = fetch, now = Date.now(), st = store() } = {}) {
  let cat = null;
  try { cat = await st.get("catalog", { type: "json" }); } catch { /* none yet */ }
  cat ||= { at: 0, items: {} };
  let e = cat.items[p.handle];
  if (e?.sku) return e;
  e ||= entryOf(p, now);
  if (!e) return null;
  await freeze(e, fetchFn);
  if (!e.sku) return null;
  if (!cat.items[p.handle]) { e.live = false; e.soldAt = now; }
  cat.items[p.handle] = e;
  try { await st.setJSON("catalog", cat); } catch { /* kept next time */ }
  return e;
}
// The catalog as the pages read it: copies with a SKU only, the live first.
export const publicCatalog = (cat) => Object.values(cat.items).filter(e => e.sku)
  .map(e => ({ handle: e.handle, h: e.h, title: e.title, type: e.type, image: e.image, sku: e.sku, cat: e.cat, shape: e.shape, form: e.form, number: e.number, price: e.price, live: e.live }))
  .sort((a, b) => (b.live - a.live) || a.title.localeCompare(b.title));
