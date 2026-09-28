import { censusSubjects } from "../lib/census.js";

// The 62 figures on file are static on the client; this serves assessed citizens and
// public figures referred since (verdicts only once published: see publicFigure).
const CACHE_MS = 30 * 1000;
let cache = { at: 0, subjects: null };

const json = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...extra } });

export default async (req) => {
  if (req.method !== "GET") return json(405, { error: "The Holding Pen is for viewing. Touching is a separate privilege." });
  try {
    if (!cache.subjects || Date.now() - cache.at > CACHE_MS) {
      cache = { at: Date.now(), subjects: await censusSubjects() };
    }
    return json(200, { subjects: cache.subjects }, { "Cache-Control": "public, max-age=30" });
  } catch (err) {
    console.error("pen failed", err);
    return json(503, { error: "The Holding Pen's census is temporarily unavailable. The subjects remain. They always remain.", subjects: [] });
  }
};

export const config = { path: "/api/pen" };
