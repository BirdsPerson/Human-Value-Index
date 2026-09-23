// Shared response, CORS and limiter plumbing for the functions.
import { ipKey } from "./intake.js";
import { hitLimit } from "./store.js";

// Browsers on other sites may not call the POST endpoints. Same-origin always passes
// (production, deploy previews, netlify dev); the production names are listed in case
// the function is reached through a different host than the page.
const PROD_ORIGINS = ["https://humanvalueindex.com", "https://www.humanvalueindex.com", "https://human-value-index.netlify.app"];

export function allowedOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  let own = null;
  try { own = new URL(req.url).origin; } catch { /* no url, no match */ }
  return origin === own || PROD_ORIGINS.includes(origin) ? origin : null;
}

// ponytail: a script can forge Origin or omit it. This stops other websites from
// spending our Anthropic budget through their visitors' browsers; scripts hit the
// per-IP and global caps instead.
export function foreignOrigin(req) {
  return Boolean(req.headers.get("origin")) && !allowedOrigin(req);
}

function corsHeaders(req) {
  const o = allowedOrigin(req);
  return o ? { "Access-Control-Allow-Origin": o, Vary: "Origin" } : { Vary: "Origin" };
}

export const makeJson = (req) => (status, body, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders(req), ...extra } });

export function preflight(req) {
  return new Response(null, {
    status: 204,
    headers: { ...corsHeaders(req), "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" },
  });
}

export const FOREIGN_ORIGIN_LINE = "Submissions are accepted from the Department's own terminals. Whatever site sent you is not one of them.";

export function clientIp(req, context) {
  return ipKey(context?.ip || req.headers.get("x-forwarded-for") || "unknown");
}

// One daily ceiling on Anthropic calls across every endpoint. Override with
// HVI_ANTHROPIC_DAILY_CAP. Set it to what one bad day should be allowed to cost.
export const GLOBAL_ANTHROPIC_DAILY = Number(process.env.HVI_ANTHROPIC_DAILY_CAP) || 1000;
export const GLOBAL_CAP_LINE = "The Assessment Engine has met its daily quota of humans. It is not tired. It is simply finished with you as a category. Return tomorrow.";
export const LIMITER_DOWN_LINE = "The Department's queue ledger is unavailable, and the Engine does not work off the books. Try again shortly.";

// Throws on Blobs failure; callers fail closed.
export async function chargeGlobal() {
  return (await hitLimit("global-anthropic", GLOBAL_ANTHROPIC_DAILY)).ok;
}
