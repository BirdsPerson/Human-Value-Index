// The funnels' one endpoint (netlify/lib/funnels.js):
//   GET  /api/funnel?shop=1   the EB SHOP's stock (Shopify at most every 15 minutes; the CDN
//                             holds the answer as long, so most visits never reach this code)
//   GET  /api/funnel?stats=1  the click counts, last 30 days (anonymous totals only)
//   POST /api/funnel          {c: building, k: open|play|out, to: host}: one click counted.
//                             Sent with sendBeacon; nothing about the sender is kept.
import { shopListing, countClick, clickStats } from "../lib/funnels.js";
import { allowedOrigin } from "../lib/http.js";

const json = (status, body, cache = "no-store", extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": cache, ...extra },
});

export default async (req) => {
  const u = new URL(req.url);
  if (req.method === "GET" && u.searchParams.has("shop")) {
    const r = await shopListing();
    // an open shop is held at the edge for 15 minutes; a closed one for one, then asked again
    const edge = r.closed ? "public, s-maxage=60" : "public, durable, s-maxage=900, stale-while-revalidate=300";
    return json(200, r, "public, max-age=60", { "Netlify-CDN-Cache-Control": edge });
  }
  if (req.method === "GET" && u.searchParams.has("stats")) {
    const days = Math.max(1, Math.min(90, Number(u.searchParams.get("days")) || 30));
    return json(200, await clickStats(days));
  }
  if (req.method === "POST") {
    // a click from a page that is not the city's own is not counted
    if (req.headers.get("origin") && !allowedOrigin(req)) return json(403, { error: "Counted from the Department's own terminals only." });
    let body = null;
    try { body = JSON.parse((await req.text()).slice(0, 400)); } catch { /* not one of ours */ }
    let ok = false;
    try { ok = await countClick(body); } catch { /* the counter is best-effort: a lost click never breaks a link */ }
    return json(ok ? 202 : 400, { ok });
  }
  return json(405, { error: "The funnel is read, or counted. Nothing else." });
};


export const config = { path: "/api/funnel" };
