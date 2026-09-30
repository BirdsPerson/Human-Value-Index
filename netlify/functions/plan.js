// GET /api/plan              -> the manifest: {format, days: {day: ver}, latest, at}
// GET /api/plan/<day>/<ver>  -> that day's plan (sim.js format 1). Immutable: a (day, ver)
// never changes, so it is cached for a year; the manifest changes every machine day.
// The city in every browser reads these (src/city/planClient.js); netlify/lib/plans.js builds them.
import { getStore } from "@netlify/blobs";
import { STORE, MANIFEST, dayKey } from "../lib/plans.js";

const VER = /^\d{1,6}\.[0-9a-f]{12}$/;
const json = (status, body, cache) => new Response(typeof body === "string" ? body : JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": cache },
});

export default async (req) => {
  if (req.method !== "GET") return json(405, { error: "Plans are published, not submitted." }, "no-store");
  const parts = new URL(req.url).pathname.replace(/^\/(api|\.netlify\/functions)\/plan\/?/, "").split("/").filter(Boolean);
  try {
    const s = getStore({ name: STORE, consistency: "strong" });
    if (!parts.length) {
      const m = await s.get(MANIFEST, { type: "json" });
      if (!m) return json(200, { format: null, days: {}, latest: null }, "public, max-age=30");
      const days = Object.fromEntries(Object.entries(m.days).map(([d, e]) => [d, e.ver]));
      const nums = Object.keys(days).map(Number);
      return json(200, { format: m.format, days, latest: nums.length ? Math.max(...nums) : null, at: m.at }, "public, max-age=30");
    }
    const [day, ver] = parts;
    if (parts.length !== 2 || !/^\d{1,6}$/.test(day) || !VER.test(ver) || !ver.startsWith(`${day}.`)) return json(404, { error: "No such plan." }, "no-store");
    const body = await s.get(dayKey(Number(day), ver), { type: "text" });
    if (!body) return json(404, { error: "No such plan. It may have been retired." }, "no-store");
    return json(200, body, "public, max-age=31536000, immutable");
  } catch (err) {
    console.error("plan failed", err);
    return json(503, { error: "The plan office is briefly unavailable. The city will improvise." }, "no-store");
  }
};

export const config = { path: ["/api/plan", "/api/plan/:day/:ver"] };
