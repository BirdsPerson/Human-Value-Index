// /api/casino: HOUSE EDGE CASINO. Play chips only (docs/CASINO.md, docs/legal/terms.md §10).
//   GET  ?caseId=          the file's wallet, tables in progress, limits, this week's board
//   GET                    the board and the house edges (no file needed)
//   POST {caseId, action, level?, ...}
//     claim                                  today's allowance (once per UTC day)
//     roulette   {bets: [{type, n?|k?, amount}]}
//     bj-deal {bet} | bj-insurance {take} | bj-hit | bj-stand | bj-double | bj-split
//     baccarat   {bets: {player?, banker?, tie?}}
//     poker-sit {seats, buyIn} | poker-deal | poker-act {type, to?} | poker-reload {buyIn} | poker-leave
// There is deliberately no action that buys chips, cashes them out, or moves them between
// files; scripts/check-casino.mjs fails the build if one appears.
// An unclaimed file plays on its number; a file secured to an email plays (and shows its wallet)
// only from that account's session (lib/auth.js requireCaseAuth). Only assessed files play.
// Every hand, spin and coup is one server call; the RNG is node:crypto; every balance change
// is one etag-conditional write (casino-store.updateWallet).
import { isCaseId } from "../lib/intake.js";
import { getCase, hitLimit } from "../lib/store.js";
import { requireCaseAuth, caseAuthBody } from "../lib/auth.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";
import { NO_SUCH_FILE } from "./case.js";
import { updateWallet, getWallet, postStack, readBoard, Busy } from "../lib/casino-store.js";
import { cryptoRng, spinRoulette, bjDeal, bjInsurance, bjAct, bjView, bacPlay } from "../lib/casino-games.js";
import { startHand, act, runBots, pokerView } from "../lib/casino-poker.js";
import { poolOf, seatFor, lineFor, tellFor, dossier } from "../lib/casino-figures.js";
import { ALLOWANCE, LIMITS, HOUSE_EDGE, HOUSE_LINE, LEGAL_LINES, RESPONSIBLE_LINE, HIGH_UNLOCK_CHIPS, HIGH_TIERS, coverOf, utcDay, highUnlocked, cardCode } from "../../src/casino/rules.js";
import { randomInt } from "node:crypto";

export const ACTIONS = ["claim", "roulette", "bj-deal", "bj-insurance", "bj-hit", "bj-stand", "bj-double", "bj-split", "baccarat", "poker-sit", "poker-deal", "poker-act", "poker-reload", "poker-leave"];
export const CASINO_IP_PER_HOUR = 1500;
export const CASINO_CASE_PER_MINUTE = 60;
export const CASINO_MISS_PER_HOUR = 30;
const rnd = () => randomInt(1 << 30) / (1 << 30);

const PUBLIC = { edges: HOUSE_EDGE, houseLine: HOUSE_LINE, legal: LEGAL_LINES, responsible: RESPONSIBLE_LINE, limits: LIMITS, allowance: ALLOWANCE, highUnlock: { chips: HIGH_UNLOCK_CHIPS, tiers: HIGH_TIERS } };
const tableChips = (w) => (w?.pk ? w.pk.seats[0].stack : 0);
const totalChips = (w) => Math.floor((w?.c || 0) / 100) + tableChips(w);
const fail = (status, error) => ({ out: { status, error } });

function view(w, rec, extra = {}) {
  const tier = rec.history[rec.history.length - 1]?.tier || null;
  const today = utcDay();
  return {
    ...PUBLIC,
    chips: w?.c || 0, atTable: tableChips(w), tier,
    claimable: !w || w.claimed !== today, claimedToday: w?.claimed === today,
    high: highUnlocked((w?.c || 0) + tableChips(w) * 100, tier),
    bj: w?.bj ? bjView(w.bj) : null,
    poker: w?.pk ? { ...pokerView(w.pk), dossiers: w.pk.seats.slice(1).map(s => ({ id: s.id, lines: s.dossier || [] })) } : null,
    stats: w?.stats || null,
    ...extra,
  };
}

const whole = (x) => Number.isInteger(x) && x > 0;
function checkLevel(level, w, tier) {
  if (level !== "floor" && level !== "high") return "Pick a room: the floor or the high limit room.";
  if (level === "high" && !highUnlocked((w.c || 0) + tableChips(w) * 100, tier)) return `The high limit room admits ${HIGH_UNLOCK_CHIPS.toLocaleString("en-US")} chips or an ESSENTIAL or RETAINED file. The velvet rope has read yours.`;
  return null;
}
const stake = (w, centi, game) => {
  w.c -= centi;
  w.stats = w.stats || { hands: 0, wagered: 0, returned: 0 };
  w.stats.hands++; w.stats.wagered += centi;
  w.stats[game] = (w.stats[game] || 0) + 1;
};
const credit = (w, centi) => { w.c += centi; w.stats.returned += centi; };
const BROKE = "Not enough chips. The allowance refills tomorrow. The Department does not extend credit; it extends judgement.";

// ---- poker helpers --------------------------------------------------------------------------------
function pickOpponents(level, n) {
  const pool = poolOf(level);
  for (let i = pool.length - 1; i > 0; i--) { const j = randomInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, n);
}
const botStack = (level) => LIMITS[level].poker.buyIn[1];
const narrate = (table) => ({
  after(i, d) {
    const s = table.seats[i], H = table.hand;
    if (H.done) return;   // the hand ended on this action: the result speaks
    const moment = d.type === "raise" ? "raise" : d.type === "fold" ? "fold" : null;
    const line = moment && rnd() < (moment === "raise" ? 0.45 : 0.3) ? lineFor(s, moment) : null;
    if (line) H.log.push({ seat: i, act: "say", text: line });
    else if (d.type !== "fold" && rnd() < 0.35) H.log.push({ seat: i, act: "tell", text: tellFor(s, d.strength, rnd) });
  },
});
function playOn(table) {
  runBots(table, cryptoRng, rnd, narrate(table));
  const H = table.hand;
  if (H.done) for (const p of H.result.pots) for (const wi of p.winners) {
    const line = wi > 0 && rnd() < 0.6 ? lineFor(table.seats[wi], "win") : null;
    if (line && !H.log.some(e => e.act === "say" && e.seat === wi && e.text === line)) H.log.push({ seat: wi, act: "say", text: line });
  }
}
function deal(table) {
  for (const s of table.seats.slice(1)) if (s.stack < table.bb) { s.stack = botStack(table.level); s.restaked = (s.restaked || 0) + 1; }
  const r = startHand(table, cryptoRng);
  if (r.error) return r;
  if (table.handNo === 1) for (let i = 1; i < table.seats.length; i++) { const l = lineFor(table.seats[i], "sit"); if (l) table.hand.log.unshift({ seat: i, act: "say", text: l }); }
  playOn(table);
  return table;
}
// The table is stored with the wallet; its deck never leaves the server.
function applyPoker(w, body, tier) {
  const a = body.action;
  if (a === "poker-sit") {
    if (w.pk) return "You are already seated. Leave the table first.";
    const level = body.level;
    const lv = checkLevel(level, w, tier); if (lv) return lv;
    const L = LIMITS[level].poker, n = Number(body.seats), buyIn = Number(body.buyIn);
    if (!Number.isInteger(n) || n < 2 || n > 5) return "Two to five figures sit with you.";
    if (!Number.isInteger(buyIn) || buyIn < L.buyIn[0] || buyIn > L.buyIn[1]) return `Buy in for ${L.buyIn[0]} to ${L.buyIn[1]} chips.`;
    if (w.c < buyIn * 100) return BROKE;
    w.c -= buyIn * 100;
    const seats = [{ id: "you", name: "YOU", stack: buyIn }, ...pickOpponents(level, n).map(card => ({ ...seatFor(card, level, botStack(level)), dossier: dossier(card, level) }))];
    w.pk = { level, sb: L.sb, bb: L.bb, seats, button: randomInt(seats.length), handNo: 0, hand: null, buyIns: buyIn };
    const r = deal(w.pk);
    return r.error || null;
  }
  const T = w.pk;
  if (!T) return "You are not seated at a table.";
  if (a === "poker-leave") {
    const back = T.seats[0].stack;   // chips already in an unfinished pot stay in it
    w.c += back * 100;
    w.pkLast = { left: back, buyIns: T.buyIns, hands: T.handNo };
    w.pk = null;
    return null;
  }
  if (a === "poker-reload") {
    if (T.hand && !T.hand.done) return "Finish the hand first.";
    const L = LIMITS[T.level].poker, buyIn = Number(body.buyIn);
    if (T.seats[0].stack >= L.bb) return "You still have chips. The Department admires the optimism.";
    if (!Number.isInteger(buyIn) || buyIn < L.buyIn[0] || buyIn > L.buyIn[1]) return `Buy in for ${L.buyIn[0]} to ${L.buyIn[1]} chips.`;
    if (w.c < buyIn * 100) return BROKE;
    w.c -= buyIn * 100; T.seats[0].stack += buyIn; T.buyIns += buyIn;
    return null;
  }
  if (a === "poker-deal") {
    if (T.hand && !T.hand.done) return "A hand is in progress.";
    if (T.seats[0].stack < T.bb) return "You are out of chips at this table. Rebuy or leave.";
    const r = deal(T);
    return r.error || null;
  }
  if (a === "poker-act") {
    if (!T.hand || T.hand.done) return "No hand in progress. Deal.";
    const r = act(T, 0, { type: body.type, to: body.to });
    if (r.error) return r.error;
    playOn(T);
    return null;
  }
  return "Unknown action.";
}

// ---- the table games, on one wallet ------------------------------------------------------------------
function apply(w, body, tier) {
  const a = body.action;
  if (a === "claim") {
    const today = utcDay();
    if (w.claimed === today) return fail(409, "Today's allowance is already in your stack. The Department issues it once per day, like mercy.");
    w.c += ALLOWANCE * 100; w.claimed = today;
    return { wallet: w, out: { claimed: ALLOWANCE } };
  }
  if (a.startsWith("poker-")) {
    const err = applyPoker(w, body, tier);
    return err ? fail(400, err) : { wallet: w, out: {} };
  }
  if (a === "roulette") {
    const lv = checkLevel(body.level, w, tier); if (lv) return fail(403, lv);
    const bets = Array.isArray(body.bets) ? body.bets : [];
    if (!bets.length || bets.length > 40) return fail(400, "Place between one and forty bets.");
    const clean = [];
    for (const b of bets) {
      if (!whole(b?.amount) || !coverOf(b)) return fail(400, "One of those bets is not on this layout.");
      clean.push({ type: b.type, n: b.n, k: b.k, amount: b.amount * 100 });
    }
    const total = clean.reduce((t, b) => t + b.amount, 0) / 100;
    const [lo, hi] = LIMITS[body.level].roulette;
    if (total < lo || total > hi) return fail(400, `This wheel takes ${lo} to ${hi} chips a spin.`);
    if (w.c < total * 100) return fail(402, BROKE);
    stake(w, total * 100, "roulette");
    const r = spinRoulette(clean, cryptoRng);
    credit(w, r.returned);
    return { wallet: w, out: { roulette: { n: r.n, returned: r.returned, staked: total * 100, lines: r.lines } } };
  }
  if (a === "baccarat") {
    const lv = checkLevel(body.level, w, tier); if (lv) return fail(403, lv);
    const bets = {}, [lo, hi] = LIMITS[body.level].baccarat;
    let total = 0;
    for (const k of ["player", "banker", "tie"]) {
      const v = body.bets?.[k];
      if (v == null || v === 0) continue;
      if (!whole(v) || v < lo || v > hi) return fail(400, `Each spot takes ${lo} to ${hi} chips.`);
      bets[k] = v * 100; total += v;
    }
    if (!total) return fail(400, "Bet on the player, the banker or the tie.");
    if (w.c < total * 100) return fail(402, BROKE);
    w.bac = w.bac || {};
    stake(w, total * 100, "baccarat");
    const r = bacPlay(w.bac, bets, cryptoRng);
    credit(w, r.returned);
    return { wallet: w, out: { baccarat: { player: r.player.map(cardCode), banker: r.banker.map(cardCode), pt: r.pt, bt: r.bt, winner: r.winner, returned: r.returned, staked: total * 100, shoeLeft: r.shoeLeft, shuffled: Boolean(w.bac.shuffled) } } };
  }
  if (a.startsWith("bj-")) {
    w.bj = w.bj || {};
    const R = w.bj.round;
    if (a === "bj-deal") {
      if (R && R.phase !== "done") return fail(409, "Finish the hand on the felt first.");
      const lv = checkLevel(body.level, w, tier); if (lv) return fail(403, lv);
      const [lo, hi] = LIMITS[body.level].blackjack, bet = body.bet;
      if (!whole(bet) || bet < lo || bet > hi) return fail(400, `This table takes ${lo} to ${hi} chips.`);
      if (w.c < bet * 100) return fail(402, BROKE);
      stake(w, bet * 100, "blackjack");
      bjDeal(w.bj, bet * 100, cryptoRng);
    } else {
      if (!R || R.phase === "done") return fail(409, "No hand in play. Deal.");
      let r;
      if (a === "bj-insurance") {
        const take = Boolean(body.take);
        if (take) { if (w.c < R.bet / 2) return fail(402, BROKE); w.c -= R.bet / 2; w.stats.wagered += R.bet / 2; }
        r = bjInsurance(w.bj, take, cryptoRng);
      } else {
        const act_ = a.slice(3);
        if (act_ === "double" || act_ === "split") {
          const h = R.hands[R.i];
          if (w.c < h.bet) return fail(402, BROKE);
          r = bjAct(w.bj, act_, cryptoRng);
          if (!r.error) { w.c -= h.bet / (act_ === "double" ? 2 : 1); w.stats.wagered += h.bet / (act_ === "double" ? 2 : 1); }
        } else r = bjAct(w.bj, act_, cryptoRng);
      }
      if (r.error) return fail(400, r.error);
    }
    if (w.bj.round.phase === "done" && !w.bj.round.paid) { credit(w, w.bj.round.outcome.returned); w.bj.round.paid = true; }
    return { wallet: w, out: {} };
  }
  return fail(400, "Unknown action.");
}

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  const noStore = { "Cache-Control": "no-store" };
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "GET or POST. The house does not take other bets." });
  if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
  let body = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { return json(400, { error: "Your request is not legible." }); }
    if (!ACTIONS.includes(body?.action)) return json(400, { error: "The house has no such game. It does not buy, sell, cash out or transfer chips, either." });
  }
  const caseId = String((req.method === "GET" ? new URL(req.url).searchParams.get("caseId") : body?.caseId) || "").trim().toUpperCase();
  try {
    if (req.method === "GET" && !caseId) return json(200, { ...PUBLIC, board: await readBoard() }, { "Cache-Control": "public, max-age=15" });
    if (!isCaseId(caseId)) return json(400, { error: "That is not a case number." });
    const ip = clientIp(req, context);
    try {
      if (!(await hitLimit(`casino-ip:${ip}`, CASINO_IP_PER_HOUR, "hour")).ok) return json(429, { error: "The pit boss has seen enough of your location for one hour." }, { "Retry-After": "3600" });
      if (!(await hitLimit(`casino-case:${caseId}`, CASINO_CASE_PER_MINUTE, "minute")).ok) return json(429, { error: "Slow down. The cards are dealt at the Department's pace, not yours." }, { "Retry-After": "60" });
    } catch {
      return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" });
    }
    const rec = await getCase(caseId);
    if (!rec) {
      const miss = await hitLimit(`casino-miss:${ip}`, CASINO_MISS_PER_HOUR, "hour").catch(() => ({ ok: false }));
      return json(miss.ok ? 404 : 429, { error: miss.ok ? NO_SUCH_FILE : "Too many wrong case numbers. The Department suspects you are guessing." });
    }
    if (!Array.isArray(rec.history) || !rec.history.length) return json(403, { error: "Only assessed subjects play. Your file has no assessment on it. Be assessed; then you may lose chips like a citizen." });
    const tier = rec.history[rec.history.length - 1]?.tier || null;
    const auth = await requireCaseAuth(req, caseId, { write: req.method === "POST" });
    if (!auth.ok) return json(auth.status, caseAuthBody(auth), noStore);
    if (req.method === "GET") return json(200, view(await getWallet(caseId), rec, { board: await readBoard() }), noStore);

    let result;
    try { result = await updateWallet(caseId, (w) => apply(w, body, tier)); } catch (e) {
      if (e instanceof Busy) return json(409, { error: "The table is busy with your other request. One hand at a time." });
      throw e;
    }
    const { wallet, out } = result;
    if (out?.error) return json(out.status || 400, { error: out.error, ...view(wallet, rec) }, noStore);
    await postStack(caseId, totalChips(wallet)).catch(err => console.warn("casino board", err?.message));
    return json(200, view(wallet, rec, { last: out, board: await readBoard() }), noStore);
  } catch (err) {
    console.error("casino failed", err?.name, err?.message);
    return json(500, { error: "The casino floor is unavailable. The house regrets nothing, but it is closed." });
  }
};

export const config = { path: "/api/casino" };
