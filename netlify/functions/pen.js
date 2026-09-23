import { listPenCards } from "../lib/store.js";
import { penVerdict } from "../lib/intake.js";

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
          slug: c.slug, name: c.name, score: c.score, tier: c.tier, verdict: penVerdict(c.verdict),
          breakdown: c.breakdown, sprite: c.sprite ?? null, kind: "citizen",
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
