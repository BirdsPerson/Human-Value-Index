// The funnels, server side (docs/CITY_SPEC.md "The funnels"):
//   the EB SHOP's stock: the Shopify storefront's public endpoints (no keys), read at most
//     once per SHOP_TTL and kept in Blobs, so a busy city never hammers Shopify. Down with a
//     recent copy: the copy, marked stale. Down with nothing recent: closed for inventory.
//   the click counter: per real day, per campaign (the building), per kind (open: an overlay
//     opened; play: a game loaded; out: a link out followed), per destination host. Anonymous:
//     no IP, no id, no path, nothing about who.
import { getStore } from "@netlify/blobs";

export const STORE = "funnels";
export const SHOP = "https://shop.electricbasement.tv";
export const SHOP_TTL = 15 * 60 * 1000;           // Shopify is read at most this often
export const SHOP_STALE = 24 * 3600 * 1000;       // a copy this old still beats CLOSED
export const SHOP_MAX = 24;                       // items shown
const CANDIDATES = 36;                            // newest in stock, read for their turntable videos
export const CAMPAIGNS = new Set(["the-arcade", "eb-shop", "ebtv-station", "the-dive", "the-diner", "casino", "union-lounge", "the-boardwalk", "departures-hall", "internet-city-cabinet", "city"]);
export const KINDS = new Set(["open", "play", "out"]);
export const HOSTS = new Set(["play-jetsam.netlify.app", "anamnesis-eb.netlify.app", "birdsperson.itch.io", "shop.electricbasement.tv", "electricbasement.tv", "live.electricbasement.tv", "iridescent-studio.netlify.app", "internetcitygame.com"]);

const store = () => getStore({ name: STORE, consistency: "strong" });

// ---- the shop -------------------------------------------------------------------------------
const priceOf = (p) => {
  const v = (p.variants || []).map(x => Number(x.price)).filter(n => n > 0);
  return v.length ? Math.min(...v).toFixed(2) : null;
};
const inStock = (p) => (p.variants || []).some(v => v.available);
const sized = (src, w) => (src ? `${src}${src.includes("?") ? "&" : "?"}width=${w}` : null);
// The turntable: the product's own video, the smallest mp4 that is at least 480 tall.
function videoOf(js) {
  const m = (js?.media || []).find(x => x.media_type === "video" && (x.sources || []).length);
  if (!m) return null;
  const mp4 = m.sources.filter(s => s.format === "mp4" && s.url).sort((a, b) => (a.height || 0) - (b.height || 0));
  const pick = mp4.find(s => (s.height || 0) >= 480) || mp4[mp4.length - 1];
  return pick ? { mp4: pick.url, poster: sized(m.preview_image?.src, 480) } : null;
}

async function getJson(fetchFn, url, ms) {
  const r = await fetchFn(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

// Read the storefront: the newest products in stock, each with its turntable video where it
// has one (videos first). -> [{handle, title, price, image, video, type}]
export async function readShop(fetchFn = fetch) {
  const list = [];
  for (let page = 1; page <= 3; page++) {
    const j = await getJson(fetchFn, `${SHOP}/products.json?limit=250&page=${page}`, 6000);
    const ps = j?.products || [];
    list.push(...ps);
    if (ps.length < 250) break;
  }
  if (!list.length) throw new Error("the storefront listed nothing");
  // the shop's own listings first (vendor EBShop: the ones with turntable videos), newest first
  const own = (p) => /^eb ?shop$/i.test(String(p.vendor || "").trim());
  const fresh = list.filter(inStock).sort((a, b) => (own(b) - own(a)) || String(b.published_at).localeCompare(String(a.published_at))).slice(0, CANDIDATES);
  // the product pages, four at a time, each allowed 4 s; a page that does not answer just has no video
  const media = new Map();
  for (let i = 0; i < fresh.length; i += 4) {
    await Promise.all(fresh.slice(i, i + 4).map(async p => {
      try { media.set(p.handle, videoOf(await getJson(fetchFn, `${SHOP}/products/${p.handle}.js`, 4000))); } catch { /* no video then */ }
    }));
  }
  const items = fresh.map(p => ({
    handle: p.handle, title: String(p.title || "").slice(0, 140), price: priceOf(p), type: p.product_type || "",
    image: sized(p.images?.[0]?.src, 360), video: media.get(p.handle) || null,
  })).filter(x => x.price && x.image);
  items.sort((a, b) => Boolean(b.video) - Boolean(a.video));
  return items.slice(0, SHOP_MAX);
}

// -> {items, at, stale?} or {closed: true}. now/fetchFn injectable for the check.
export async function shopListing({ fetchFn = fetch, now = Date.now(), st = store() } = {}) {
  let cached = null;
  try { cached = await st.get("shop", { type: "json" }); } catch { /* read through to Shopify */ }
  if (cached && now - cached.at < SHOP_TTL) return { items: cached.items, at: cached.at };
  try {
    const items = await readShop(fetchFn);
    try { await st.setJSON("shop", { at: now, items }); } catch { /* served, just not kept */ }
    return { items, at: now };
  } catch {
    if (cached && now - cached.at < SHOP_STALE) return { items: cached.items, at: cached.at, stale: true };
    return { closed: true };
  }
}

// ---- the click counter ------------------------------------------------------------------------
export const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
// body: {c: campaign, k: kind, to: host|null} -> the counter key, or null when it is not one of ours
export function clickKey(body) {
  const c = String(body?.c || ""), k = String(body?.k || ""), to = body?.to == null ? "-" : String(body.to);
  if (!CAMPAIGNS.has(c) || !KINDS.has(k)) return null;
  if (to !== "-" && !HOSTS.has(to)) return null;
  return `${c}|${k}|${to}`;
}
export async function countClick(body, { now = Date.now(), st = store() } = {}) {
  const key = clickKey(body);
  if (!key) return false;
  const id = `clicks/${dayKey(now)}`;
  for (let i = 0; i < 5; i++) {
    const got = await st.getWithMetadata(id, { type: "json" });
    const data = got?.data || {};
    data[key] = (data[key] || 0) + 1;
    const r = got ? await st.setJSON(id, data, { onlyIfMatch: got.etag }) : await st.setJSON(id, data, { onlyIfNew: true });
    if (r?.modified !== false) return true;
  }
  return false;
}
// The last `days` days of counts: {days: {date: {key: n}}, totals: {campaign: {open, play, out}}}
export async function clickStats(days = 30, { now = Date.now(), st = store() } = {}) {
  const out = { days: {}, totals: {} };
  for (let d = 0; d < days; d++) {
    const date = dayKey(now - d * 86400000);
    const data = await st.get(`clicks/${date}`, { type: "json" }).catch(() => null);
    if (!data) continue;
    out.days[date] = data;
    for (const [key, n] of Object.entries(data)) {
      const [c, k] = key.split("|");
      const t = (out.totals[c] ||= { open: 0, play: 0, out: 0 });
      t[k] = (t[k] || 0) + n;
    }
  }
  return out;
}
