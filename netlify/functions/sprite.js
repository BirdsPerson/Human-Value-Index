import { getSprite } from "../lib/store.js";

// Serves a referred figure's sprite sheet (64x48 PNG) from Blobs. The Mac job
// (scripts/referral_sprites.py) uploads it. A likeness not drawn yet answers 204, not 404:
// an <img> or CSS background still fails over to its placeholder (onerror fires on an empty
// body), but the browser console stays clean on every page that shows a pending face.
const SLUG_RE = /^[a-z0-9-]{1,80}$/;

export default async (req, context) => {
  const slug = context?.params?.slug || new URL(req.url).pathname.split("/").pop();
  if (req.method !== "GET" || !SLUG_RE.test(slug || "")) return new Response("Not found", { status: 404 });
  try {
    const bytes = await getSprite(slug);
    if (!bytes) return new Response(null, { status: 204, headers: { "Cache-Control": "public, max-age=300", "X-Likeness": "pending" } });
    // A slug's sprite never changes once drawn; if it is redrawn it gets a new ?v=.
    return new Response(bytes, { status: 200, headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch (err) {
    console.error("sprite failed", err);
    return new Response("Unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
};

export const config = { path: "/api/sprite/:slug" };
