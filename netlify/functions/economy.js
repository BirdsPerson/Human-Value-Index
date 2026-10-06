// /api/economy: THE TREASURY, slice 1 (docs/design/ECONOMY_PROPERTY.md; terms §11).
//   GET                    the board: the seven district industries, shares, returns, commentary
//   GET ?caseId=           + the file's apartment and wallet (?chip=1: the header's balance only)
//   POST {caseId, action, ...}
//     collect                                  the TRAY: every uncollected day (max 7) of UBI, net
//                                              of the citizen's own spending, into the balance
//     buy  {industry, amount, nonce}           cash -> a position (min 100; held 3 days)
//     sell {industry, amount, nonce}           a position -> cash
// There is deliberately no action that buys CYCLES, cashes them out, or moves them between
// files; scripts/check-economy.mjs fails the build if one appears, and the ledger itself refuses
// a txn touching two cases. An unclaimed file draws on its number; a file secured to an email
// draws (and shows its wallet) only from that account's session (lib/auth.js requireCaseAuth).
// Only assessed files hold a wallet. With no ledger configured (SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY unset) the Treasury is CLOSED: the board and the apartment still
// read, every write answers THE TREASURY IS NOT YET OPEN.
import { isCaseId } from "../lib/intake.js";
import { getCase, hitLimit } from "../lib/store.js";
import { isOwnerCase, requireCaseAuth, caseAuthBody } from "../lib/auth.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";
import { deviceHash } from "../lib/proposals.js";
import { NO_SUCH_FILE } from "./case.js";
import { ledger, LedgerDown } from "../lib/economy-db.js";
import { ACTIONS, apartmentOf, boardView, walletView, collect, trade } from "../lib/economy.js";
import { CLOSED_LINE, UBI_LINE, LEGAL_LINES, UBI, TRAY_DAYS, MIN_INVEST, LOCK_DAYS } from "../../src/economy/rules.js";

export { ACTIONS };
export const ECON_IP_PER_HOUR = 600;
export const ECON_CASE_PER_MINUTE = 30;
export const ECON_WRITES_PER_MINUTE = 12;
export const ECON_MISS_PER_HOUR = 30;
const PUBLIC = { closedLine: CLOSED_LINE, ubiLine: UBI_LINE, legal: LEGAL_LINES, ubi: UBI, trayDays: TRAY_DAYS, minInvest: MIN_INVEST, lockDays: LOCK_DAYS };
const ENROL_REFUSED = {
  "ip-cap": "Too many new wallets from your location this week. The Department counts terminals as well as citizens.",
  "device-cap": "This terminal already holds the Department's limit of wallets. One citizen, one allowance.",
  "owner-cap": "Your email already draws an allowance on another file. One citizen, one allowance.",
};

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  const noStore = { "Cache-Control": "no-store" };
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "GET or POST. The Treasury keeps short hours." });
  if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
  let body = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { return json(400, { error: "Your request is not legible." }); }
    if (!ACTIONS.includes(body?.action)) return json(400, { error: "The Treasury has no such window. It does not sell, cash out, gift or transfer CYCLES, either." });
  }
  const url = new URL(req.url);
  const caseId = String((req.method === "GET" ? url.searchParams.get("caseId") : body?.caseId) || "").trim().toUpperCase();
  const chip = url.searchParams.get("chip") === "1";
  const L = ledger();
  const open = Boolean(L);
  try {
    if (req.method === "GET" && !caseId) return json(200, { open, ...PUBLIC, board: await boardView() }, { "Cache-Control": "public, max-age=30" });
    if (!isCaseId(caseId)) return json(400, { error: "That is not a case number." });
    const ip = clientIp(req, context);
    try {
      if (!(await hitLimit(`econ-ip:${ip}`, ECON_IP_PER_HOUR, "hour")).ok) return json(429, { error: "The Treasury has seen enough of your location for one hour." }, { "Retry-After": "3600" });
      if (!(await hitLimit(`econ-case:${caseId}`, ECON_CASE_PER_MINUTE, "minute")).ok) return json(429, { error: "Slow down. The Treasury counts at the Department's pace." }, { "Retry-After": "60" });
      if (req.method === "POST" && !(await hitLimit(`econ-write:${caseId}`, ECON_WRITES_PER_MINUTE, "minute")).ok) return json(429, { error: "Too many orders this minute. The market is not going anywhere. Neither are you." }, { "Retry-After": "60" });
    } catch {
      return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" });
    }
    const rec = await getCase(caseId);
    if (!rec) {
      const miss = await hitLimit(`econ-miss:${ip}`, ECON_MISS_PER_HOUR, "hour").catch(() => ({ ok: false }));
      return json(miss.ok ? 404 : 429, { error: miss.ok ? NO_SUCH_FILE : "Too many wrong case numbers. The Department suspects you are guessing." });
    }
    const assessed = Array.isArray(rec.history) && rec.history.some(h => h && typeof h.score === "number");
    if (!assessed) return json(403, { open, assessed: false, error: "Only assessed citizens draw an allowance. Your file has no assessment on it." });
    const auth = await requireCaseAuth(req, caseId, { write: req.method === "POST" });
    if (!auth.ok) return json(auth.status, { open, assessed, ...caseAuthBody(auth) }, noStore);

    if (req.method === "GET") {
      if (!open) return json(200, { open, assessed, ...PUBLIC, ...(chip ? {} : { apartment: apartmentOf(caseId, rec), board: await boardView() }) }, noStore);
      const wallet = await walletView(caseId, rec);
      if (chip) return json(200, { open, assessed, balance: wallet.balance, tray: wallet.tray.days, worth: wallet.worth }, noStore);
      return json(200, { open, assessed, ...PUBLIC, apartment: apartmentOf(caseId, rec), wallet, board: await boardView() }, noStore);
    }

    if (!open) return json(503, { open, error: CLOSED_LINE });
    let out;
    if (body.action === "collect") {
      // one allowance per email: the claiming account's key (auth.acct) rides into the enrolment as a hash
      out = await collect(caseId, rec, { ip, deviceHash: deviceHash(body.device), owner: auth.acct, exempt: isOwnerCase(caseId) });
      if (!out.ok) return json(403, { open, error: ENROL_REFUSED[out.error] || "The Treasury refused the disbursement.", wallet: await walletView(caseId, rec) }, noStore);
    } else {
      out = await trade(caseId, body);
      if (!out.ok) return json(out.status || 400, { open, error: out.error, wallet: await walletView(caseId, rec) }, noStore);
    }
    return json(200, { open, assessed, last: out, wallet: await walletView(caseId, rec), board: await boardView() }, noStore);
  } catch (err) {
    console.error("economy failed", err?.name, err?.message);
    if (err instanceof LedgerDown) return json(503, { open, error: "The Treasury's ledger is unavailable. Nothing was moved. Try again shortly." }, { "Retry-After": "30" });
    return json(500, { error: "The Treasury is unavailable. Nothing was moved." });
  }
};

export const config = { path: "/api/economy" };
