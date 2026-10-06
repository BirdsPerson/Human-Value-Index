// GET /api/watch?m=<real minute>: SURVEILLANCE, the landing's window that follows one resident at a
// time (src/front/Surveillance.jsx, THE SET's channel 11). The same for every viewer in a minute.
// Who may be shown: public figures on file only (the bundle's FAMOUS_FIGURES). Never a citizen or a
// player (no opt-in exists yet, so none are), never a figure with a harm finding, and never a
// verdict or a quote: facts the city already shows (score, tier, cubrant, job, where, doing what).
//   -> {m, clock: {day, hour, minute, night}, subjects: [{slug, name, score, tier, cubrant, job,
//       activity, district, districtName, place, href}]}
import { FAMOUS_FIGURES, slugify, getTier } from "../../src/figures.js";
import { cubeOf } from "../../src/cubeData.js";
import { machineClock } from "../../src/city/sim.js";
import { whereOf, activityLine, jobLine, districtName, placeName, atDistrict } from "../../src/city/simApi.js";

const N = 6;
export const watchable = (f) => Boolean(f && f.name && !f.harm && typeof f.score === "number");
const h32 = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };

export function watchList(realMs = Date.now()) {
  const m = Math.floor(realMs / 60000), clock = machineClock(realMs);
  const pool = FAMOUS_FIGURES.filter(watchable).map(f => ({ f, k: h32(`${m}|${f.name}`) })).sort((a, b) => a.k - b.k).slice(0, N);
  const subjects = [];
  for (const { f } of pool) {
    const s = { ...f, slug: slugify(f.name), kind: "figure" };
    try {
      const w = whereOf(s, clock.mt), d = atDistrict(w) || w.districtId;
      subjects.push({
        slug: s.slug, name: f.name.toUpperCase(), score: f.score, tier: getTier(f.score).label,
        cubrant: cubeOf(f)?.cubrant || null, job: jobLine(s), activity: activityLine(s, clock.mt),
        district: d || null, districtName: districtName(d), place: w.placeId ? placeName(w.placeId).toUpperCase() : null,
        href: `#city?find=${s.slug}`,
      });
    } catch { /* a subject the sim cannot place this minute: skipped */ }
  }
  return { m, clock: { day: clock.day, hour: clock.hour, minute: clock.minute }, subjects };
}

export default async (req) => {
  if (req.method !== "GET") return new Response("Watched, not written to.", { status: 405 });
  try {
    return new Response(JSON.stringify(watchList()), { status: 200, headers: {
      "Content-Type": "application/json", "Cache-Control": "public, max-age=60",
      "Netlify-CDN-Cache-Control": "public, max-age=60, stale-while-revalidate=60",
    } });
  } catch (err) {
    console.error("watch failed", err?.message);
    return new Response(JSON.stringify({ error: "THE CAMERAS ARE BEING SERVICED." }), { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
};

export const config = { path: "/api/watch" };
