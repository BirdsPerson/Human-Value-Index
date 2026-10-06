// /api/eb-claim: CLAIM A REAL PURCHASE (netlify/lib/ebclaim.js). POST {caseId, order, email}.
// Verifies the order with Shopify's Admin API, then grants each line's virtual copy to the case,
// free, marked OWNED IN REAL LIFE (econ_irl_claim: once per order line, ever). Closed with no
// Shopify credentials. Same-origin only; rate-limited per address and per case. Never logs, stores
// or echoes the email or the order: only salted hashes reach the ledger.
import { isCaseId } from "../lib/intake.js";
import { getCase, hitLimit } from "../lib/store.js";
import { requireCaseAuth, caseAuthBody } from "../lib/auth.js";
import { makeJson, preflight, allowedOrigin, clientIp, FOREIGN_ORIGIN_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";
import { NO_SUCH_FILE } from "./case.js";
import { ledger, caseHash, LedgerDown } from "../lib/economy-db.js";
import { claimsConfig, findOrder, checkOrder, normOrder, looksLikeEmail, emailHash, hmac32, CLAIM_LINES } from "../lib/ebclaim.js";
import { ensureEntry } from "../lib/ebvirtual.js";
import { CLOSED_LINE } from "../../src/economy/rules.js";
import { EBV_LINES } from "../../src/economy/ebvirtual.js";

export const CLAIM_IP_PER_HOUR = 12;
export const CLAIM_CASE_PER_HOUR = 6;
export const CLAIM_MISS_PER_DAY = 10;

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  const noStore = { "Cache-Control": "no-store" };
  if (req.method !== "POST") return json(405, { error: "A claim is posted. Nothing else." });
  if (!allowedOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
  const cfg = claimsConfig();
  if (!cfg) return json(503, { open: false, error: CLAIM_LINES.closed }, noStore);
  const L = ledger();
  if (!L) return json(503, { open: false, error: CLOSED_LINE }, noStore);
  let body;
  try { body = JSON.parse((await req.text()).slice(0, 2000)); } catch { return json(400, { error: CLAIM_LINES.bad }); }
  const caseId = String(body?.caseId || "").trim().toUpperCase();
  if (!isCaseId(caseId)) return json(400, { error: "That is not a case number." });
  const name = normOrder(body?.order);
  if (!name || !looksLikeEmail(body?.email)) return json(400, { error: CLAIM_LINES.bad });
  const ip = clientIp(req, context);
  try {
    if (!(await hitLimit(`ebclaim-ip:${ip}`, CLAIM_IP_PER_HOUR, "hour")).ok) return json(429, { error: "ENOUGH CLAIMS FROM YOUR LOCATION FOR ONE HOUR." }, { "Retry-After": "3600" });
    if (!(await hitLimit(`ebclaim-case:${caseId}`, CLAIM_CASE_PER_HOUR, "hour")).ok) return json(429, { error: "ENOUGH CLAIMS ON THIS FILE FOR ONE HOUR." }, { "Retry-After": "3600" });
  } catch { return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" }); }
  const rec = await getCase(caseId);
  if (!rec) return json(404, { error: NO_SUCH_FILE });
  try {
    // a file secured to an email takes claims only from that account's session (lib/auth.js)
    const auth = await requireCaseAuth(req, caseId, { write: true });
    if (!auth.ok) return json(auth.status, caseAuthBody(auth), noStore);
    const order = await findOrder(cfg, name);
    const chk = checkOrder(order, body.email);
    if (!chk.ok) {
      if (chk.why === "nomatch") {
        const miss = await hitLimit(`ebclaim-miss:${ip}`, CLAIM_MISS_PER_DAY, "day").catch(() => ({ ok: false }));
        if (!miss.ok) return json(429, { error: "TOO MANY ORDERS THAT DO NOT MATCH. THE DEPARTMENT SUSPECTS YOU ARE GUESSING." }, { "Retry-After": "3600" });
      }
      return json(chk.why === "noemail" ? 503 : chk.why === "unpaid" ? 409 : chk.why === "nolines" ? 409 : 404, { error: CLAIM_LINES[chk.why], code: chk.why }, noStore);
    }
    const lines = [];
    for (const l of chk.lines) {
      const p = l.product;
      const e = await ensureEntry({ handle: p.handle, title: p.title, type: p.productType, tags: p.tags || [], image: p.featuredImage?.url ? `${p.featuredImage.url}${p.featuredImage.url.includes("?") ? "&" : "?"}width=360` : null });
      if (!e?.sku) continue;
      lines.push({ line_hash: hmac32("line", `${order.id}|${l.lineId}`), sku: e.sku, kind: e.cat === "wear" ? "wear" : "furn", name: `EB SHOP COPY: ${e.title}`.slice(0, 160), price: e.price, title: e.title });
    }
    if (!lines.length) return json(409, { error: CLAIM_LINES.nolines, code: "nolines" }, noStore);
    const r = await L.rpc("econ_irl_claim", { case_hash: caseHash(caseId), order_hash: hmac32("order", order.id), email_hash: emailHash(body.email), lines: lines.map(({ title, ...x }) => x) });
    if (!r?.ok) return json(r?.error === "no-wallet" ? 403 : 409, { error: r?.error === "no-wallet" ? "NO WALLET ON FILE. COLLECT YOUR ALLOWANCE ONCE AND THE TREASURY WILL KNOW YOU. THEN CLAIM." : "THE LEDGER REFUSED THE CLAIM.", code: r?.error }, noStore);
    const titleOf = new Map(lines.map(x => [x.sku, x.title]));
    const granted = (r.granted || []).map(g => ({ sku: g.sku, title: titleOf.get(g.sku) || "" }));
    if (!granted.length) return json(409, { error: CLAIM_LINES.already, code: "already" }, noStore);
    return json(200, { ok: true, granted, already: (r.already || []).length, line: EBV_LINES.claimed }, noStore);
  } catch (err) {
    console.error("eb-claim failed", err?.name, err?.code || "");
    if (err?.code === "auth") return json(503, { open: false, error: CLAIM_LINES.closed }, noStore);
    if (err?.code === "down" || err instanceof LedgerDown) return json(503, { error: CLAIM_LINES.down }, { "Retry-After": "60" });
    return json(500, { error: CLAIM_LINES.down });
  }
};

export const config = { path: "/api/eb-claim" };
