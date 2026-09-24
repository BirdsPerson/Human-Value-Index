import { listPenCards } from "../lib/store.js";

// Figures are static on the client; this only serves assessed citizens.
const CACHE_MS = 30 * 1000;
let cache = { at: 0, subjects: null };

const json = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...extra } });

export default async (req) => {
  if (req.method !== "GET") return json(405, { error: "The Holding Pen is for viewing. Touching is a separate privilege." });
  try {
    if (!cache.subjects || Date.now() - cache.at > CACHE_MS) {
      const cards = await listPenCards();
      cache = {
        at: Date.now(),
        subjects: cards.map(c => ({
          // Private citizens: score and tier only. Old cards may still carry a verdict
          // or breakdown; they are dropped here.
          slug: c.slug, name: c.name, score: c.score, tier: c.tier, sprite: c.sprite ?? null, kind: "citizen",
        })),
      };
    }
    return json(200, { subjects: cache.subjects }, { "Cache-Control": "public, max-age=30" });
  } catch (err) {
    console.error("pen failed", err);
    return json(503, { error: "The Holding Pen's census is temporarily unavailable. The subjects remain. They always remain.", subjects: [] });
  }
};

export const config = { path: "/api/pen" };
