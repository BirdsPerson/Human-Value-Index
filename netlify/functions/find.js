// FIND without the census (scaling step 4, docs/CITY_SPEC.md "Sectors"). The city no longer
// downloads everyone, so the search runs here, over the day's find index (plans.js,
// f2/day/<day>/<ver>/find), and answers with what the browser needs to place each match
// itself: the display record and the match's window row from the sector file it is in.
//   GET /api/find?q=<text>[&n=8]      the best matches now (find.js searchIndex ranking)
//   GET /api/find?slug=<key>          one subject (a #city?find= link, FIND ME, a follow)
//   &day=<d>&w=<0-3>                  another window of a planned day (a follow crossing one)
// -> {day, ver, w, hits: [{key, name, rec, row, sector}]}; rec 0 = a figure on file (the
// bundle has it). 404 when the day is not split yet: the browser then searches its census.
import { getStore } from "@netlify/blobs";
import { STORE, manifest2Cached, partKey, windowPart, partOf } from "../lib/plans.js";
import { machineClock, windowOf } from "../../src/city/sim.js";
import { fold, searchIndex } from "../../src/city/find.js";

const json = (status, body, cache = "no-store") => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": cache },
});
const store = () => getStore({ name: STORE, consistency: "strong" });

// Warm-instance caches: the prepared index per (day, ver), the last sector windows read.
const indexes = new Map(), files = new Map();
async function indexOf(day, ver) {
  const id = `${day}/${ver}`;
  if (!indexes.has(id)) {
    const p = store().get(partKey(day, ver, "find"), { type: "json" }).then(f => {
      if (!f) throw new Error("no find index");
      const entries = f.subjects.map(([key, name, baseName, at, citizen]) => {
        const hay = fold(`${name} ${baseName || ""} ${key.replace(/-/g, " ")}`);
        return { key, name, at, s: { you: false, kind: citizen ? "citizen" : "figure" }, hay, words: hay.split(" ") };
      });
      return { sectors: f.sectors, entries, byKey: new Map(entries.map(e => [e.key, e])) };
    });
    p.catch(() => indexes.delete(id));
    indexes.set(id, p);
    while (indexes.size > 4) indexes.delete(indexes.keys().next().value);
  }
  return indexes.get(id);
}
async function windowFile(day, ver, sector, w, part) {
  const id = `${day}/${ver}/${sector}/${w}/${part}`;
  if (!files.has(id)) {
    const p = store().get(partKey(day, ver, windowPart(sector, w, part)), { type: "json" });
    p.catch(() => files.delete(id));
    files.set(id, p);
    while (files.size > 24) files.delete(files.keys().next().value);
  }
  return files.get(id);
}

export default async (req) => {
  if (req.method !== "GET") return json(405, { error: "The census is searched, not written to." });
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") || "").slice(0, 80), slug = (u.searchParams.get("slug") || "").toLowerCase().slice(0, 120);
  if (!q.trim() && !slug) return json(400, { error: "Name someone. The Department does not search for nobody." });
  const c = machineClock();
  const day = Number(u.searchParams.get("day")) || c.day;
  const w = u.searchParams.has("w") ? Math.max(0, Math.min(3, Number(u.searchParams.get("w")) | 0)) : windowOf(c.hour + c.minute / 60);
  try {
    const m = await manifest2Cached(15 * 1000);
    const e = m?.days?.[day];
    if (!e) return json(404, { error: "That day is not on file yet." });
    const idx = await indexOf(day, e.ver);
    const found = slug ? [idx.byKey.get(slug)].filter(Boolean) : searchIndex(idx.entries, q, Math.max(1, Math.min(20, Number(u.searchParams.get("n")) || 8)));
    const hits = await Promise.all(found.map(async (x) => {
      const ch = x.at[w], sector = ch && ch !== "-" ? idx.sectors[parseInt(ch, 36)] : null;
      const P = sector ? e.files?.[sector]?.[w]?.[2] || 1 : 1;
      const f = sector ? await windowFile(day, e.ver, sector, w, partOf(x.key, P)) : null;
      const [rec, row] = f?.subjects?.[x.key] || [null, null];
      return { key: x.key, name: x.name, rec, row, sector };
    }));
    return json(200, { day, ver: e.ver, w, hits }, slug && u.searchParams.has("day") ? "public, max-age=600" : "public, max-age=20");
  } catch (err) {
    console.error("find failed", err);
    return json(503, { error: "The census index is briefly unavailable." });
  }
};

export const config = { path: "/api/find" };
