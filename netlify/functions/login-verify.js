// GET /api/login/verify?t=: consumes the link, opens a 30-day session, sends the
// browser back to its case file.
import { consumeToken, upsertAccount, createSession, sessionCookie } from "../lib/auth.js";

const back = (status, extra = {}) => new Response(null, { status: 302, headers: { Location: `/?auth=${status}#intake`, "Cache-Control": "no-store", ...extra } });

export default async (req) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  try {
    const email = await consumeToken(new URL(req.url).searchParams.get("t"));
    if (!email) return back("expired");
    const { key } = await upsertAccount(email);
    const sid = await createSession(key);
    return back("ok", { "Set-Cookie": sessionCookie(sid) });
  } catch (err) {
    console.error("login verify failed", err?.name);
    return back("error");
  }
};

export const config = { path: "/api/login/verify" };
