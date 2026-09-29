import { getFigure } from "../lib/store.js";
import { publicFigure } from "../lib/refer.js";

// One referred figure's whole public file: what /api/pen leaves out (the verdict, the
// file's movement log, a harm finding) plus everything it carries. Fetched when a file
// opens (src/fileDetail.js). A withheld verdict stays withheld: publicFigure decides.
const SLUG_RE = /^[a-z0-9-]{1,80}$/;
const json = (status, body, cache) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": cache } });

export default async (req, context) => {
  const slug = context?.params?.slug || new URL(req.url).pathname.split("/").pop();
  if (req.method !== "GET" || !SLUG_RE.test(slug || "")) return json(404, { error: "No such file." }, "no-store");
  try {
    const card = await getFigure(slug);
    if (!card || card.removed || !card.slug) return json(404, { error: "No such file." }, "public, max-age=60");
    return json(200, { subject: publicFigure(card) }, "public, max-age=60");
  } catch (err) {
    console.error("figure failed", err);
    return json(503, { error: "The file room is temporarily unavailable." }, "no-store");
  }
};

export const config = { path: "/api/figure/:slug" };
