import { getAtlasJson, getAtlasSheet } from "../lib/store.js";

// The production sprite atlas (scripts/prod-atlas.mjs): every ready referral sprite in a
// few PNG sheets. /api/atlas.json names the sheets and each sprite's rect and ?v=; a
// sheet is content-addressed (/api/atlas/<hash>.png), so it is cached forever. The JSON
// changes whenever the Mac job packs a new likeness, so it is cached briefly.
const SHEET_RE = /^([0-9a-f]{16})\.png$/;

export default async (req) => {
  if (req.method !== "GET") return new Response("Not found", { status: 404 });
  const name = new URL(req.url).pathname.split("/").pop();
  try {
    if (name === "atlas.json") {
      const j = await getAtlasJson();
      if (!j) return new Response(JSON.stringify({ sheets: [], sprites: {} }), { status: 404, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" } });
      const { sig, ...pub } = j;   // eslint-disable-line no-unused-vars
      return new Response(JSON.stringify(pub), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60, stale-while-revalidate=600" } });
    }
    const m = SHEET_RE.exec(name || "");
    if (!m) return new Response("Not found", { status: 404 });
    const bytes = await getAtlasSheet(m[1]);
    if (!bytes) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    return new Response(bytes, { status: 200, headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch (err) {
    console.error("atlas failed", err);
    return new Response("Unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
};

export const config = { path: ["/api/atlas.json", "/api/atlas/:file"] };
