// GET /api/front: the front page's two tickers in one small read (netlify/lib/front.js).
//   -> {news: [{tag, text, href, at?}], trending: [{tag, text, href}], at}
// news: THE DAILY COMPLIANCE's latest edition (front page) and its live WIRE; trending: who the
// city is looking at (most seen, score moves, league stars of the day, new arrivals at INTAKE).
// Each source is optional: one that fails drops out, the rest still print. Cached a minute.
import { paperStore } from "../lib/paper-store.js";
import { readBoard } from "../lib/market.js";
import { newsOf, trendingOf } from "../lib/front.js";
import { wire } from "./paper.js";
import { FAMOUS_FIGURES, slugify } from "../../src/figures.js";

const json = (status, body, cache = "no-store") => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": cache },
});
const figures = () => FAMOUS_FIGURES.map(f => ({ ...f, slug: slugify(f.name) }));

export async function frontOf({ base, fetchImpl = fetch } = {}) {
  const store = paperStore();
  const soft = (p) => p.catch(() => null);
  const edition = soft(store.index().then(idx => (idx?.editions?.[0] ? store.edition(idx.editions[0].date) : null)));
  const arrivals = base ? soft(fetchImpl(`${base}/api/arrivals`, { signal: AbortSignal.timeout(4000) }).then(r => (r.ok ? r.json() : null))) : Promise.resolve(null);
  const [ed, w, board, arr] = await Promise.all([edition, soft(wire()), soft(readBoard()), arrivals]);
  return { news: newsOf(ed, w || []), trending: trendingOf({ board, edition: ed, arrivals: arr, figures: figures() }), at: new Date().toISOString() };
}

export default async (req, context) => {
  if (req.method !== "GET") return json(405, { error: "THE FRONT PAGE IS READ, NOT WRITTEN TO." });
  const url = new URL(req.url);
  try {
    return json(200, await frontOf({ base: context?.site?.url || process.env.URL || url.origin }), "public, max-age=60");
  } catch (err) {
    console.error("front failed", err?.message);
    return json(503, { error: "THE PRESSES ARE STOPPED. THE DEPARTMENT IS LOOKING INTO IT." });
  }
};

export const config = { path: "/api/front" };
