import { listPenCards, listFigures } from "../lib/store.js";

// The 62 figures on file are static on the client; this serves assessed citizens and
// public figures referred since (with verdicts: they are public figures).
const CACHE_MS = 30 * 1000;
let cache = { at: 0, subjects: null };

const json = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...extra } });

export default async (req) => {
  if (req.method !== "GET") return json(405, { error: "The Holding Pen is for viewing. Touching is a separate privilege." });
  try {
    if (!cache.subjects || Date.now() - cache.at > CACHE_MS) {
      const [cards, figures] = await Promise.all([listPenCards(), listFigures().catch(() => [])]);
      cache = {
        at: Date.now(),
        subjects: [
          ...cards.map(c => ({
            // Private citizens: score and tier only. Old cards may still carry a verdict
            // or breakdown; they are dropped here.
            slug: c.slug, name: c.name, score: c.score, tier: c.tier, sprite: c.sprite ?? null, kind: "citizen",
          })),
          ...figures.map(f => ({
            slug: f.slug, name: f.name, score: f.score, tier: f.tier, breakdown: f.breakdown, verdict: f.verdict,
            sprite: f.sprite ?? null, spriteStatus: f.spriteStatus || "pending", kind: "figure", referred: true,
          })),
        ],
      };
    }
    return json(200, { subjects: cache.subjects }, { "Cache-Control": "public, max-age=30" });
  } catch (err) {
    console.error("pen failed", err);
    return json(503, { error: "The Holding Pen's census is temporarily unavailable. The subjects remain. They always remain.", subjects: [] });
  }
};

export const config = { path: "/api/pen" };
