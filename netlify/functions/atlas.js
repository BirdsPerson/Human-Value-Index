import { getAtlasJson, getAtlasSheet, getAtlasMap } from "../lib/store.js";

// The production sprite atlas (scripts/prod-atlas.mjs): every ready referral sprite in small
// PNG sheets, one sector (work district) to a sheet. /api/atlas.json is the index: which map
// holds each sector ({v, at, count, maps: {sector: hash}}); it changes whenever the Mac job
// packs a new likeness, so it is cached briefly. A map (/api/atlas/<hash>.json: the sector's
// sheets, their bytes, each sprite's rect and ?v=) and a sheet (/api/atlas/<hash>.png) are
// content-addressed, so they are cached forever.
const FILE_RE = /^([0-9a-f]{16})\.(png|json)$/;
const FOREVER = "public, max-age=31536000, immutable";

export default async (req) => {
  if (req.method !== "GET") return new Response("Not found", { status: 404 });
  const name = new URL(req.url).pathname.split("/").pop();
  try {
    if (name === "atlas.json") {
      const j = await getAtlasJson();
      if (!j) return new Response(JSON.stringify({ maps: {} }), { status: 404, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" } });
      const pub = { v: j.v, at: j.at, count: j.count, maps: j.maps || {} };   // the packer's own record stays home
      return new Response(JSON.stringify(pub), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60, stale-while-revalidate=600" } });
    }
    const m = FILE_RE.exec(name || "");
    if (!m) return new Response("Not found", { status: 404 });
    const body = m[2] === "png" ? await getAtlasSheet(m[1]) : await getAtlasMap(m[1]);
    if (!body) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    return new Response(body, { status: 200, headers: { "Content-Type": m[2] === "png" ? "image/png" : "application/json", "Cache-Control": FOREVER } });
  } catch (err) {
    console.error("atlas failed", err);
    return new Response("Unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
};

export const config = { path: ["/api/atlas.json", "/api/atlas/:file"] };
