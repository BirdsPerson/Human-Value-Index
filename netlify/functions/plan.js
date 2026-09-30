// GET /api/plan                          -> the manifest: {format, days: {day: ver}, latest, at,
//                                           sectors: {day: ver}} (sectors: the days split for
//                                           browsers, format 2; the summary lists the parts)
// GET /api/plan/<day>/<ver>              -> that day's whole plan (sim.js format 1)
// GET /api/plan/<day>/<ver>/summary      -> the day's summary (format 2: far-view counts,
//                                           the figures on file's rows)
// GET /api/plan/<day>/<ver>/<sector>/<w>[/<p>] -> one sector's window, part p (format 2)
// Immutable: a (day, ver) never changes, so each is cached for a year; the manifest changes
// every machine day. The city reads these (src/city/planClient.js); netlify/lib/plans.js builds them.
import { getStore } from "@netlify/blobs";
import { STORE, MANIFEST, MANIFEST2, dayKey, partKey, windowPart } from "../lib/plans.js";
import { SECTORS } from "../../src/city/planSplit.js";

const VER = /^\d{1,6}\.[0-9a-f]{12}$/;
const json = (status, body, cache) => new Response(typeof body === "string" ? body : JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": cache },
});
const IMMUTABLE = "public, max-age=31536000, immutable";

export default async (req) => {
  if (req.method !== "GET") return json(405, { error: "Plans are published, not submitted." }, "no-store");
  const parts = new URL(req.url).pathname.replace(/^\/(api|\.netlify\/functions)\/plan\/?/, "").split("/").filter(Boolean);
  try {
    const s = getStore({ name: STORE, consistency: "strong" });
    if (!parts.length) {
      const [m, m2] = await Promise.all([s.get(MANIFEST, { type: "json" }), s.get(MANIFEST2, { type: "json" }).catch(() => null)]);
      const sectors = Object.fromEntries(Object.entries(m2?.days || {}).map(([d, e]) => [d, e.ver]));
      if (!m) return json(200, { format: null, days: {}, latest: null, sectors }, "public, max-age=30");
      const days = Object.fromEntries(Object.entries(m.days).map(([d, e]) => [d, e.ver]));
      const nums = Object.keys(days).map(Number);
      return json(200, { format: m.format, days, latest: nums.length ? Math.max(...nums) : null, at: m.at, sectors }, "public, max-age=30");
    }
    const [day, ver, a, b] = parts;
    const bad = () => json(404, { error: "No such plan." }, "no-store");
    if (!/^\d{1,6}$/.test(day) || !VER.test(ver || "") || !ver.startsWith(`${day}.`)) return bad();
    let key;
    if (parts.length === 2) key = dayKey(Number(day), ver);
    else if (parts.length === 3 && a === "summary") key = partKey(Number(day), ver, "summary");
    else if ((parts.length === 4 || (parts.length === 5 && /^\d{1,3}$/.test(parts[4]))) && SECTORS.includes(a) && /^[0-3]$/.test(b)) key = partKey(Number(day), ver, windowPart(a, Number(b), Number(parts[4] || 0)));
    else return bad();
    const body = await s.get(key, { type: "text" });
    if (!body) return json(404, { error: "No such plan. It may have been retired." }, "no-store");
    return json(200, body, IMMUTABLE);
  } catch (err) {
    console.error("plan failed", err);
    return json(503, { error: "The plan office is briefly unavailable. The city will improvise." }, "no-store");
  }
};

export const config = { path: ["/api/plan", "/api/plan/*"] };
