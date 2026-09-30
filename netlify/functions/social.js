// GET /api/social            -> city-wide relationships, gossip, and the per-day snapshots
// GET /api/social/<slug>     -> one subject's associates and their recent events, from the
//                               subject's shard (pub/s/<nn>: a card never loads the whole city)
// GET /api/social?subject=k  -> the same (the address clients used before the shards)
import { publicCached, subjectCached } from "../lib/social-store.js";

const json = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...extra } });
const SLUG = /^[a-z0-9-]{1,120}$/;
const NOT_YET = { ready: false, note: "THE DEPARTMENT HAS NOT YET OBSERVED ANYONE TOGETHER. GIVE IT AN HOUR." };

export default async (req) => {
  if (req.method !== "GET") return json(405, { error: "Relationships are observed, not submitted." });
  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/(api|\.netlify\/functions)\/social\/?/, "");
    const subject = path ? decodeURIComponent(path.split("/")[0]) : url.searchParams.get("subject");
    if (subject != null) {
      if (!SLUG.test(subject)) return json(400, { error: "That is not a file the Department keeps." });
      const one = await subjectCached(subject);
      if (!one) return json(200, NOT_YET, { "Cache-Control": "public, max-age=60" });
      return json(200, { ready: true, subject, relations: one.relations || [], events: one.events || [] }, { "Cache-Control": "public, max-age=60" });
    }
    const pub = await publicCached();
    if (!pub) return json(200, NOT_YET, { "Cache-Control": "public, max-age=60" });
    const { bySubject, ...city } = pub;
    return json(200, { ready: true, ...city }, { "Cache-Control": "public, max-age=60" });
  } catch (err) {
    console.error("social failed", err);
    return json(503, { error: "The Department's social ledger is briefly unavailable. The subjects continue to associate regardless." });
  }
};

export const config = { path: ["/api/social", "/api/social/:slug"] };
