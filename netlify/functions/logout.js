// POST /api/logout: ends the session on this browser.
import { revokeSession, clearCookie } from "../lib/auth.js";
import { makeJson, preflight, foreignOrigin, FOREIGN_ORIGIN_LINE } from "../lib/http.js";

export default async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  if (req.method !== "POST") return json(405, { error: "Logout is requested by POST." });
  if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
  try { await revokeSession(req); } catch (err) { console.error("logout failed", err?.name); }
  return json(200, { signedIn: false }, { "Cache-Control": "no-store", "Set-Cookie": clearCookie() });
};

export const config = { path: "/api/logout" };
