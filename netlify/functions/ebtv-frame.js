// GET /api/ebtv-frame: the newest pixelated frame of Electric Basement TV, for the city's TVs
// (src/city/ebtvFrame.js). scripts/ebtv_frame.py on the always-on Mac writes it every 30 s to
// Blobs (store hvi-ebtv, key frame). Stale or missing is the game's to show (OFF AIR), so this
// only ever serves what is there.  -> {at, title, upNext, png: "data:image/png;base64,..."} | 404
import { getStore } from "@netlify/blobs";

const json = (status, body, cache) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": cache },
});

export default async (req) => {
  if (req.method !== "GET") return json(405, { error: "The broadcast is received. It does not take requests." }, "no-store");
  try {
    const f = await getStore("hvi-ebtv").get("frame", { type: "json" });
    if (!f?.png) return json(404, { error: "NO SIGNAL ON FILE." }, "public, max-age=20");
    return json(200, f, "public, max-age=20");
  } catch (err) {
    console.warn("ebtv-frame:", err?.message);
    return json(503, { error: "THE RECEIVER IS DOWN." }, "no-store");
  }
};
