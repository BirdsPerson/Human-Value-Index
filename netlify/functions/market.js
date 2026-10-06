// /api/market: THE MARKET (docs/design/ECONOMY_PROPERTY.md, "The Living Market"; terms §11).
//   GET                    the board: THE HUMAN VALUE INDEX, every listed human (price, change,
//                          fair value, the "because"), movers, the floor, the leaders, events
//   GET ?ticker=1          the landing's ticker lines and the day's top risers and fallers, each
//                          with its "because" (netlify/lib/front.js moversOf; small, cached)
//   GET ?slug=<slug>       one human: today's ticks, closes, the NPC holders, events
//   GET ?caseId=           + the file's shares and open orders (the wallet's market half)
//   POST {caseId, action: "order", side: buy|sell, slug, amount (buy, CYCLES) | units (sell), nonce}
// Orders fill at the next tick (a batch auction, netlify/lib/market.js); the Department is the
// only counterparty. There is no action that moves CYCLES or shares between files.
import { isCaseId } from "../lib/intake.js";
import { getCase, hitLimit } from "../lib/store.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";
import { NO_SUCH_FILE } from "./case.js";
import { ledger, LedgerDown } from "../lib/economy-db.js";
import { readBoard, detail, placeOrder } from "../lib/market.js";
import { walletView } from "../lib/economy.js";
import { moversOf } from "../lib/front.js";
import { LEDE, LEGAL, CURRENCY_NOTE } from "../../src/market/rules.js";

export const ACTIONS = ["order"];
export const MKT_IP_PER_HOUR = 600;
export const MKT_WRITES_PER_MINUTE = 12;
const PUBLIC = { lede: LEDE, legal: LEGAL, note: CURRENCY_NOTE };

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "GET or POST. The floor keeps short hours." });
  if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
  const url = new URL(req.url);
  const open = Boolean(ledger());
  try {
    if (req.method === "GET") {
      const board = await readBoard();
      if (url.searchParams.get("ticker") === "1") {
        return json(200, { ticker: board?.ticker || [], movers: moversOf(board), hvi: board?.hvi || null, at: board?.at || null }, { "Cache-Control": "public, max-age=60" });
      }
      const slug = url.searchParams.get("slug");
      if (slug) {
        if (!/^[a-z0-9-]{1,80}$/.test(slug)) return json(400, { error: "That is not a listing." });
        const d = await detail(slug);
        return d ? json(200, { open, detail: d }, { "Cache-Control": "public, max-age=60" }) : json(404, { error: "Not listed. The Department does not trade in everyone." });
      }
      const caseId = String(url.searchParams.get("caseId") || "").trim().toUpperCase();
      if (!caseId) return json(200, { open, ...PUBLIC, board }, { "Cache-Control": "public, max-age=30" });
      if (!isCaseId(caseId)) return json(400, { error: "That is not a case number." });
      const rec = await getCase(caseId);
      if (!rec) return json(404, { error: NO_SUCH_FILE });
      const assessed = Array.isArray(rec.history) && rec.history.some(h => h && typeof h.score === "number");
      if (!assessed || !open) return json(200, { open, assessed, ...PUBLIC, board }, { "Cache-Control": "no-store" });
      return json(200, { open, assessed, ...PUBLIC, board, wallet: await walletView(caseId, rec) }, { "Cache-Control": "no-store" });
    }
    let body;
    try { body = await req.json(); } catch { return json(400, { error: "Your request is not legible." }); }
    if (!ACTIONS.includes(body?.action)) return json(400, { error: "The floor takes orders. It does not sell, cash out, gift or transfer CYCLES, or shares." });
    const caseId = String(body.caseId || "").trim().toUpperCase();
    if (!isCaseId(caseId)) return json(400, { error: "That is not a case number." });
    if (!open) return json(503, { open, error: "THE TREASURY IS NOT YET OPEN." });
    const ip = clientIp(req, context);
    try {
      if (!(await hitLimit(`mkt-ip:${ip}`, MKT_IP_PER_HOUR, "hour")).ok) return json(429, { error: "The floor has seen enough of your location for one hour." }, { "Retry-After": "3600" });
      if (!(await hitLimit(`mkt-write:${caseId}`, MKT_WRITES_PER_MINUTE, "minute")).ok) return json(429, { error: "Too many orders this minute. The tick comes every 24 minutes either way." }, { "Retry-After": "60" });
    } catch {
      return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" });
    }
    const rec = await getCase(caseId);
    if (!rec) return json(404, { error: NO_SUCH_FILE });
    if (!(Array.isArray(rec.history) && rec.history.some(h => h && typeof h.score === "number"))) return json(403, { error: "Only assessed citizens trade. Your file has no assessment on it." });
    const out = await placeOrder(caseId, body);
    const wallet = await walletView(caseId, rec);
    if (!out.ok) return json(out.status || 400, { open, error: out.error, wallet }, { "Cache-Control": "no-store" });
    return json(200, { open, last: out, wallet }, { "Cache-Control": "no-store" });
  } catch (err) {
    console.error("market failed", err?.name, err?.message);
    if (err instanceof LedgerDown) return json(503, { open, error: "The Treasury's ledger is unavailable. Nothing was moved. Try again shortly." }, { "Retry-After": "30" });
    return json(500, { error: "The floor is unavailable. Nothing was moved." });
  }
};

export const config = { path: "/api/market" };
