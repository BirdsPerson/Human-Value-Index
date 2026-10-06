// /api/eb-virtual: THE EB SHOP's virtual copies (netlify/lib/ebvirtual.js), public, no person in it.
//   GET  -> {open, items: [{handle, h, title, type, image, sku, cat, shape|form, number, price, live}]}
// Prices are CYCLES by category (src/economy/ebvirtual.js), never dollars. Buying one is /api/shops
// (action buy, the copy's SKU); claiming one with a real purchase is /api/eb-claim.
import { virtualCatalog, publicCatalog } from "../lib/ebvirtual.js";
import { claimsConfig } from "../lib/ebclaim.js";

const json = (status, body, cache = "no-store", extra = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": cache, ...extra } });

export default async (req) => {
  if (req.method !== "GET") return json(405, { error: "The copies are read here. Bought at the shops. Claimed at /api/eb-claim." });
  try {
    const cat = await virtualCatalog();
    const items = publicCatalog(cat);
    return json(200, { open: items.length > 0, claims: Boolean(claimsConfig()), items, stale: Boolean(cat.stale) }, "public, max-age=120", { "Netlify-CDN-Cache-Control": "public, durable, s-maxage=300, stale-while-revalidate=300" });
  } catch (err) {
    console.error("eb-virtual failed", err?.name);
    return json(503, { open: false, items: [], error: "THE COPY ROOM IS CLOSED FOR INVENTORY." }, "public, max-age=30");
  }
};

export const config = { path: "/api/eb-virtual" };
