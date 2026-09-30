import { censusSubjects } from "../lib/census.js";

// The 62 figures on file are static on the client; this serves assessed citizens and
// public figures referred since (verdicts only once published: see publicFigure).
//
// Paged (scaling step 4): the census outgrows one response (Netlify's 6 MB) near 9,400
// subjects, and the city no longer reads it (src/city/sectors.js). The lists that do (the
// pen, the cube, the analytics) walk the pages (src/penClient.js).
//   ?limit=<n>      page size (default and max 2000)
//   ?cursor=<slug>  the page after this slug (pages run in slug order, so a subject added
//                   between two page reads is never skipped or read twice)
//   ?fields=list    without the sim's inputs (breakdown, stratum, place tendencies)
//   ?fields=cube    only what the cube plots (conduct, competence, likability, the photo)
//   ?kind=figure    figures only (the cube and the analytics never read citizens)
// -> {subjects, next (the cursor for the next page, or null), total}
const CACHE_MS = 30 * 1000;
export const PAGE_MAX = 2000;
let cache = { at: 0, subjects: null };

const FIELDS = {
  list: (s) => { const { breakdown: _b, stratum: _s, places: _p, ...rest } = s; return rest; },
  cube: (s) => ({ slug: s.slug, name: s.name, baseName: s.baseName, qualifier: s.qualifier, score: s.score, tier: s.tier, kind: s.kind, referred: s.referred, engine: s.engine, sprite: s.sprite, avatar: s.avatar, warmth: s.warmth, competence: s.competence, quadrant: s.quadrant, judge: s.judge, realityIndex: s.realityIndex, people: s.people }),
};

const json = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...extra } });

export default async (req) => {
  if (req.method !== "GET") return json(405, { error: "The Holding Pen is for viewing. Touching is a separate privilege." });
  try {
    if (!cache.subjects || Date.now() - cache.at > CACHE_MS) {
      const subjects = await censusSubjects();
      subjects.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
      cache = { at: Date.now(), subjects };
    }
    const u = new URL(req.url), p = u.searchParams;
    const limit = Math.max(1, Math.min(PAGE_MAX, Number(p.get("limit")) || PAGE_MAX));
    const cursor = p.get("cursor") || "";
    const kind = p.get("kind");
    const shape = FIELDS[p.get("fields")] || ((s) => s);
    let list = cache.subjects;
    if (kind === "figure" || kind === "citizen") list = list.filter(s => s.kind === kind);
    let i = 0;
    if (cursor) { let lo = 0, hi = list.length; while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].slug <= cursor) lo = m + 1; else hi = m; } i = lo; }
    const page = list.slice(i, i + limit);
    const next = i + limit < list.length ? page[page.length - 1].slug : null;
    return json(200, { subjects: page.map(shape), next, total: list.length }, { "Cache-Control": "public, max-age=30" });
  } catch (err) {
    console.error("pen failed", err);
    return json(503, { error: "The Holding Pen's census is temporarily unavailable. The subjects remain. They always remain.", subjects: [], next: null });
  }
};

export const config = { path: "/api/pen" };
