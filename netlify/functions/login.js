// POST /api/login {email}: emails a single-use, 15-minute access link. The response is
// identical whether or not the address has an account (no enumeration).
import { emailValid, normEmail, accountKey, issueToken, sendLink, maybeVerifyDomain, MAIL_ROOM_CLOSED } from "../lib/auth.js";
import { hitLimit } from "../lib/store.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";

export const PER_EMAIL_PER_15MIN = 3;
export const PER_IP_PER_HOUR = 10;
export const SENT_LINE = "If that address can receive mail, a link is on its way. It expires in fifteen minutes.";
const quarter = () => `q${Math.floor(new Date().getUTCMinutes() / 15)}`;

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  if (req.method !== "POST") return json(405, { error: "Access is requested by POST. The Department does not accept loitering." });
  if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Your request is not legible." }); }
  const email = normEmail(body?.email);
  if (!emailValid(email)) return json(400, { error: "That is not an email address. The Department has seen many. It knows." });

  try {
    try {
      if (!(await hitLimit(`login-ip:${clientIp(req, context)}`, PER_IP_PER_HOUR, "hour")).ok) {
        return json(429, { error: "Too many access requests from your location. Return in an hour." }, { "Retry-After": "3600" });
      }
      if (!(await hitLimit(`login-email:${accountKey(email)}:${quarter()}`, PER_EMAIL_PER_15MIN, "hour")).ok) {
        return json(429, { error: "Enough links have been sent to that address. Check your mail, then wait fifteen minutes." }, { "Retry-After": "900" });
      }
    } catch (err) {
      console.error("login limiter unavailable", err?.name);
      return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" });
    }
    const token = await issueToken(email);
    const url = `${new URL(req.url).origin}/api/login/verify?t=${encodeURIComponent(token)}`;
    const sent = await sendLink(email, url);
    if (sent.notVerified) {
      await maybeVerifyDomain().catch(() => {});
      return json(503, { error: MAIL_ROOM_CLOSED, reason: "mailroom" }, { "Retry-After": "3600" });
    }
    return json(200, { ok: true, message: SENT_LINE });
  } catch (err) {
    console.error("login failed", err?.name);
    return json(500, { error: "The access office is unavailable. Your file is untouched." });
  }
};

export const config = { path: "/api/login" };
