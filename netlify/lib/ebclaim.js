// CLAIM A REAL PURCHASE (docs/design/ECONOMY_PROPERTY.md, "The EB SHOP's virtual copies"): a
// citizen who bought something at the real EB Shop gives the order number and the checkout email;
// the server asks Shopify's Admin API (GraphQL, read_orders + read_products) whether that order
// exists, is paid, is not cancelled, carries that email, and which listings it holds; each line's
// virtual copy is granted to the case free, marked OWNED IN REAL LIFE. Needs no Shopify theme edit.
//
// Fails closed: with no SHOPIFY_STORE_DOMAIN, or no credentials (SHOPIFY_ADMIN_TOKEN, or a Dev
// Dashboard app's SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET for the client-credentials grant),
// every claim answers CLAIMS ARE NOT OPEN YET.
//
// Privacy: the email and the order number are compared and hashed here and never kept, logged or
// echoed. The ledger keeps salted one-way hashes (order, line, email) so a line is claimed once.
// Hash comparisons are constant-time.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const API_VERSION = "2025-07";
export const PAID = new Set(["PAID", "PARTIALLY_REFUNDED"]);
const salt = () => process.env.HVI_IP_SALT || "hvi-limits-v1";

export const DOMAIN_RE = /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/;
export function claimsConfig(env = process.env) {
  const domain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  if (!DOMAIN_RE.test(domain)) return null;
  if (env.SHOPIFY_ADMIN_TOKEN) return { domain, token: String(env.SHOPIFY_ADMIN_TOKEN).trim() };
  if (env.SHOPIFY_CLIENT_ID && env.SHOPIFY_CLIENT_SECRET) return { domain, clientId: String(env.SHOPIFY_CLIENT_ID).trim(), clientSecret: String(env.SHOPIFY_CLIENT_SECRET).trim() };
  return null;
}

// Salted one-way hashes, 32 hex. The email is trimmed and lower-cased first.
export const hmac32 = (kind, v) => createHmac("sha256", `${salt()}:ebclaim:${kind}`).update(String(v)).digest("hex").slice(0, 32);
export const normEmail = (e) => String(e || "").trim().toLowerCase();
export const emailHash = (e) => hmac32("email", normEmail(e));
export function sameHash(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  const pad = (z) => Buffer.concat([z, Buffer.alloc(Math.max(0, 64 - z.length))]).subarray(0, 64);
  return timingSafeEqual(pad(x), pad(y)) && x.length === y.length;
}
// What a person types: "#1042", "1042", "EB1042". -> the name's characters, upper-cased, or null.
export function normOrder(s) {
  const t = String(s || "").trim().replace(/^#/, "").toUpperCase();
  return /^[A-Z0-9-]{1,24}$/.test(t) ? t : null;
}
export const looksLikeEmail = (e) => { const s = normEmail(e); return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); };

// ---- Shopify ------------------------------------------------------------------------------------
let TOKEN = null;   // {domain, token, until}: a client-credentials token, kept in this instance only
async function accessToken(cfg, fetchFn) {
  if (cfg.token) return cfg.token;
  if (TOKEN && TOKEN.domain === cfg.domain && TOKEN.until > Date.now() + 60_000) return TOKEN.token;
  const r = await fetchFn(`https://${cfg.domain}/admin/oauth/access_token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: cfg.clientId, client_secret: cfg.clientSecret }).toString(),
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw Object.assign(new Error(`token ${r.status}`), { code: "auth" });
  const j = await r.json();
  if (!j?.access_token) throw Object.assign(new Error("token missing"), { code: "auth" });
  TOKEN = { domain: cfg.domain, token: j.access_token, until: Date.now() + Math.max(300, Number(j.expires_in) || 3600) * 1000 };
  return TOKEN.token;
}
export const resetTokenCache = () => { TOKEN = null; };

export const ORDER_QUERY = `query HviClaim($q: String!) {
  orders(first: 5, query: $q) {
    nodes {
      id name email test cancelledAt displayFinancialStatus
      lineItems(first: 100) { nodes { id currentQuantity product { handle title productType tags featuredImage { url } } } }
    }
  }
}`;
// -> the order whose name matches exactly, or null. Throws {code: "auth" | "down"} on Shopify trouble.
export async function findOrder(cfg, name, fetchFn = fetch) {
  const token = await accessToken(cfg, fetchFn);
  let r;
  try {
    r = await fetchFn(`https://${cfg.domain}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query: ORDER_QUERY, variables: { q: `name:${name}` } }), signal: AbortSignal.timeout(8000),
    });
  } catch { throw Object.assign(new Error("unreachable"), { code: "down" }); }
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error(`admin ${r.status}`), { code: "auth" });
  if (!r.ok) throw Object.assign(new Error(`admin ${r.status}`), { code: "down" });
  const j = await r.json();
  if (j?.errors?.length) throw Object.assign(new Error("graphql errors"), { code: /access|scope|denied/i.test(JSON.stringify(j.errors)) ? "auth" : "down" });
  const nodes = j?.data?.orders?.nodes || [];
  return nodes.find(o => normOrder(o.name) === name) || null;
}

// The lines of an order a claim may grant: paid, not cancelled, not a test, the email matches.
// -> {ok: true, lines: [{lineId, product}]} | {ok: false, why}
export function checkOrder(order, email) {
  if (!order) return { ok: false, why: "nomatch" };
  if (order.email == null) return { ok: false, why: "noemail" };   // the app cannot read emails: a setup problem
  if (!sameHash(emailHash(order.email), emailHash(email))) return { ok: false, why: "nomatch" };
  if (order.test || order.cancelledAt || !PAID.has(order.displayFinancialStatus)) return { ok: false, why: "unpaid" };
  const lines = (order.lineItems?.nodes || []).filter(l => l?.product?.handle && (l.currentQuantity ?? 1) > 0).map(l => ({ lineId: String(l.id), product: l.product }));
  return lines.length ? { ok: true, lines } : { ok: false, why: "nolines" };
}

export const CLAIM_LINES = {
  closed: "CLAIMS ARE NOT OPEN YET.",
  // one answer for "no such order" and "wrong email": a guesser learns nothing about which
  nomatch: "NO ORDER WITH THAT NUMBER AND THAT EMAIL. CHECK THE CONFIRMATION EMAIL: THE NUMBER LOOKS LIKE #1042.",
  unpaid: "THAT ORDER IS NOT PAID, OR WAS CANCELLED. A CLAIM WAITS FOR THE MONEY. SO DOES THE DEPARTMENT.",
  nolines: "NOTHING IN THAT ORDER HAS A VIRTUAL COPY.",
  noemail: "CLAIMS ARE NOT OPEN YET. THE DEPARTMENT CANNOT READ ORDER EMAILS.",
  already: "ALREADY CLAIMED. EACH LINE OF AN ORDER GRANTS ITS COPY ONCE.",
  down: "THE EB SHOP'S RECORDS DID NOT ANSWER. NOTHING WAS CLAIMED. TRY AGAIN SHORTLY.",
  bad: "AN ORDER NUMBER AND THE EMAIL YOU CHECKED OUT WITH, PLEASE.",
};
