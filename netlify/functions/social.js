// GET /api/social            -> city-wide relationships, gossip, and the per-day snapshots
// GET /api/social?subject=k  -> one subject's associates and their recent events
import { publicCached } from "../lib/social-store.js";

const json = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...extra } });
const SLUG = /^[a-z0-9-]{1,120}$/;

export default async (req) => {
  if (req.method !== "GET") return json(405, { error: "Relationships are observed, not submitted." });
  try {
    const pub = await publicCached();
    if (!pub) return json(200, { ready: false, note: "THE DEPARTMENT HAS NOT YET OBSERVED ANYONE TOGETHER. GIVE IT AN HOUR." }, { "Cache-Control": "public, max-age=60" });
    const subject = new URL(req.url).searchParams.get("subject");
    if (subject) {
      if (!SLUG.test(subject)) return json(400, { error: "That is not a file the Department keeps." });
      const one = pub.bySubject?.[subject] || { relations: [], events: [] };
      return json(200, { ready: true, subject, ...one }, { "Cache-Control": "public, max-age=60" });
    }
    const { bySubject, ...city } = pub;
    return json(200, { ready: true, ...city }, { "Cache-Control": "public, max-age=60" });
  } catch (err) {
    console.error("social failed", err);
    return json(503, { error: "The Department's social ledger is briefly unavailable. The subjects continue to associate regardless." });
  }
};

export const config = { path: "/api/social" };
