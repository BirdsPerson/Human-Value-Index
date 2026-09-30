// Texas Hold'em, server-side: a hand evaluator, the betting state machine (blinds, four
// streets, min-raise, short all-ins, side pots) and the figures' play. The deck and every
// figure's hole cards stay on the server; a figure decides from its own two cards and the
// board only (it samples the unseen cards, it never reads the deck).
//
// Chips at the table are whole chips (the blinds are). The wallet converts on sit and leave.
import { cardCode, RANKS, SUIT_GLYPH } from "../../src/casino/rules.js";
const shown = (c) => { const k = cardCode(c); return (k[0] === "T" ? "10" : k[0]) + SUIT_GLYPH[k[1]]; };
import { shuffle } from "./casino-games.js";

// ---- the evaluator ----------------------------------------------------------------------------
// score(cards) for 5 to 7 cards: category * 13^5 + five tie-break ranks in base 13, so a
// larger number is a better hand and equal numbers split. Categories:
export const CATEGORY = ["HIGH CARD", "PAIR", "TWO PAIR", "THREE OF A KIND", "STRAIGHT", "FLUSH", "FULL HOUSE", "FOUR OF A KIND", "STRAIGHT FLUSH"];
const B5 = 13 ** 5;
const pack = (cat, ks) => { let v = 0; for (let i = 0; i < 5; i++) v = v * 13 + (ks[i] ?? 0); return cat * B5 + v; };

// The top card of the highest straight in a 13-bit rank mask (bit r = rank r present), or -1.
// The wheel (A-2-3-4-5) tops at the five (rank 3).
function straightTop(mask) {
  for (let top = 12; top >= 4; top--) {
    const need = 0x1f << (top - 4);
    if ((mask & need) === need) return top;
  }
  return (mask & 0x100f) === 0x100f ? 3 : -1;   // A, 2, 3, 4, 5
}

export function score(cards) {
  const count = new Array(13).fill(0), suitMask = [0, 0, 0, 0], suitN = [0, 0, 0, 0];
  let mask = 0;
  for (const c of cards) { const r = c >> 2, s = c & 3; count[r]++; mask |= 1 << r; suitMask[s] |= 1 << r; suitN[s]++; }
  const fs = suitN.findIndex(n => n >= 5);
  if (fs >= 0) {
    const sf = straightTop(suitMask[fs]);
    if (sf >= 0) return pack(8, [sf]);
  }
  const quads = [], trips = [], pairs = [], singles = [];
  for (let r = 12; r >= 0; r--) {
    if (count[r] === 4) quads.push(r); else if (count[r] === 3) trips.push(r); else if (count[r] === 2) pairs.push(r); else if (count[r] === 1) singles.push(r);
  }
  const highest = (exclude) => { for (let r = 12; r >= 0; r--) if (count[r] && !exclude.includes(r)) return r; return 0; };
  if (quads.length) return pack(7, [quads[0], highest([quads[0]])]);
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const t = trips[0], p = Math.max(trips[1] ?? -1, pairs[0] ?? -1);
    return pack(6, [t, p]);
  }
  if (fs >= 0) {
    const ks = [];
    for (let r = 12; r >= 0 && ks.length < 5; r--) if (suitMask[fs] & (1 << r)) ks.push(r);
    return pack(5, ks);
  }
  const st = straightTop(mask);
  if (st >= 0) return pack(4, [st]);
  if (trips.length) {
    const ks = []; for (let r = 12; r >= 0 && ks.length < 2; r--) if (count[r] && r !== trips[0]) ks.push(r);
    return pack(3, [trips[0], ...ks]);
  }
  if (pairs.length >= 2) return pack(2, [pairs[0], pairs[1], highest([pairs[0], pairs[1]])]);
  if (pairs.length === 1) {
    const ks = []; for (let r = 12; r >= 0 && ks.length < 3; r--) if (count[r] && r !== pairs[0]) ks.push(r);
    return pack(1, [pairs[0], ...ks]);
  }
  return pack(0, singles.slice(0, 5));
}
export const categoryOf = (s) => Math.floor(s / B5);
const RANK_NAME = ["TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "JACK", "QUEEN", "KING", "ACE"];
const plural = (r) => (r === 4 ? "SIXES" : RANK_NAME[r] + "S");
export function handName(s) {
  const cat = categoryOf(s);
  let v = s % B5; const ks = [];
  for (let i = 0; i < 5; i++) { ks.unshift(v % 13); v = Math.floor(v / 13); }
  switch (cat) {
    case 8: return ks[0] === 12 ? "ROYAL FLUSH" : `STRAIGHT FLUSH, ${RANK_NAME[ks[0]]} HIGH`;
    case 7: return `FOUR ${plural(ks[0])}`;
    case 6: return `FULL HOUSE, ${plural(ks[0])} OVER ${plural(ks[1])}`;
    case 5: return `FLUSH, ${RANK_NAME[ks[0]]} HIGH`;
    case 4: return `STRAIGHT, ${RANK_NAME[ks[0]]} HIGH`;
    case 3: return `THREE ${plural(ks[0])}`;
    case 2: return `TWO PAIR, ${plural(ks[0])} AND ${plural(ks[1])}`;
    case 1: return `PAIR OF ${plural(ks[0])}`;
    default: return `${RANK_NAME[ks[0]]} HIGH`;
  }
}
// "As Kd" -> [51, 46]: for the checks.
export const parseCards = (str) => str.trim().split(/\s+/).map(t => RANKS.indexOf(t[0].toUpperCase()) * 4 + "shdc".indexOf(t[1].toLowerCase()));

// ---- pots ----------------------------------------------------------------------------------------------
// contrib: chips each seat put in this hand; live: seats still holding cards. -> [{amount, eligible}]
// Layered at each live seat's all-in level: a pot is contested only by those who covered it.
// Chips above the last live level (an uncalled bet) form a last pot its bettor wins back.
export function buildPots(contrib, live) {
  const levels = [...new Set(contrib.filter((c, i) => live[i] && c > 0))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const lv of levels) {
    let amount = 0;
    for (const c of contrib) amount += Math.max(0, Math.min(c, lv) - prev);
    const eligible = contrib.map((c, i) => (live[i] && c >= lv ? i : -1)).filter(i => i >= 0);
    if (amount > 0) pots.push({ amount, eligible });
    prev = lv;
  }
  const total = contrib.reduce((a, b) => a + b, 0), used = pots.reduce((a, p) => a + p.amount, 0);
  if (total > used && pots.length) pots[pots.length - 1].amount += total - used;   // folded money above every live level
  return pots;
}

// Splits each pot among its best live hands; odd chips go to the first winner left of the button.
export function awardPots(pots, scores, button, n) {
  const won = new Array(n).fill(0);
  const order = (i) => (i - button - 1 + n) % n;
  for (const p of pots) {
    let best = -1, winners = [];
    for (const i of p.eligible) { const s = scores[i]; if (s > best) { best = s; winners = [i]; } else if (s === best) winners.push(i); }
    winners.sort((a, b) => order(a) - order(b));
    const share = Math.floor(p.amount / winners.length);
    let odd = p.amount - share * winners.length;
    for (const w of winners) { won[w] += share + (odd > 0 ? 1 : 0); odd--; }
    p.winners = winners;
  }
  return won;
}

// ---- the hand -------------------------------------------------------------------------------------------
// table: {seats: [{id, name, stack, bot?}], button, bb, sb, handNo, hand}
// Seat 0 is always the subject. Seats with no chips sit the hand out.
// The subject is seat 0, named YOU: its verbs take no -s.
const v = (i, word) => (i === 0 ? word.replace(/ES$/, "E").replace(/S$/, "") : word);
const STREETS = ["PREFLOP", "FLOP", "TURN", "RIVER"];

export function startHand(table, rng) {
  const n = table.seats.length;
  const inHand = table.seats.map(s => s.stack > 0);
  if (inHand.filter(Boolean).length < 2) return { error: "Two players with chips are needed for a hand." };
  const nextIn = (i) => { for (let k = 1; k <= n; k++) { const j = (i + k) % n; if (inHand[j]) return j; } return -1; };
  table.button = nextIn(table.button ?? -1);
  const heads = inHand.filter(Boolean).length === 2;
  const sbSeat = heads ? table.button : nextIn(table.button), bbSeat = nextIn(sbSeat);
  const deck = shuffle(Array.from({ length: 52 }, (_, i) => i), rng);
  const H = {
    deck, board: [], holes: table.seats.map(() => null), inHand, folded: table.seats.map(() => false), allIn: table.seats.map(() => false),
    bet: table.seats.map(() => 0), contrib: table.seats.map(() => 0), acted: table.seats.map(() => false), lastRaiseN: table.seats.map(() => -1),
    street: 0, currentBet: 0, minRaise: table.bb, fullRaiseN: 0, cur: -1, sbSeat, bbSeat, log: [], done: false, result: null,
  };
  table.hand = H; table.handNo = (table.handNo || 0) + 1;
  for (let k = 0; k < 2; k++) for (let j = 0, i = sbSeat; j < n; j++, i = (i + 1) % n) if (inHand[i]) (H.holes[i] = H.holes[i] || []).push(deck.pop());
  post(table, sbSeat, table.sb, "SMALL BLIND");
  post(table, bbSeat, table.bb, "BIG BLIND");
  H.currentBet = Math.max(table.bb, H.bet[sbSeat], H.bet[bbSeat]);
  H.cur = nextToAct(table, bbSeat);
  if (H.cur < 0 || roundDone(table)) endStreet(table);
  return table;
}

function post(table, i, amt, what) {
  const H = table.hand, s = table.seats[i];
  const a = Math.min(amt, s.stack);
  s.stack -= a; H.bet[i] += a; H.contrib[i] += a;
  if (s.stack === 0) H.allIn[i] = true;
  H.log.push({ seat: i, act: "post", amount: a, text: `${s.name} ${v(i, "POSTS")} THE ${what} (${a})${s.stack === 0 ? ", ALL IN" : ""}.` });
}

const canAct = (H, i) => H.inHand[i] && !H.folded[i] && !H.allIn[i];
const live = (H) => H.inHand.map((x, i) => x && !H.folded[i]);

function nextToAct(table, from) {
  const H = table.hand, n = table.seats.length;
  for (let k = 1; k <= n; k++) {
    const j = (from + k) % n;
    if (canAct(H, j) && (!H.acted[j] || H.bet[j] < H.currentBet)) return j;
  }
  return -1;
}
function roundDone(table) {
  const H = table.hand;
  const actors = H.inHand.map((_, i) => i).filter(i => canAct(H, i));
  if (actors.length === 0) return true;
  if (actors.length === 1 && H.bet[actors[0]] >= H.currentBet) return true;   // nobody left to bet against
  return actors.every(i => H.acted[i] && H.bet[i] === H.currentBet);
}

// What seat i may do now. -> {toCall, canCheck, canCall, canRaise, minTo, maxTo}
export function legal(table, i) {
  const H = table.hand, s = table.seats[i];
  if (!H || H.done || H.cur !== i) return null;
  const toCall = Math.max(0, H.currentBet - H.bet[i]);
  const maxTo = H.bet[i] + s.stack;
  // a short all-in does not reopen the raising to those who already acted on this level
  const reopened = H.lastRaiseN[i] < H.fullRaiseN;
  const othersCanAct = H.inHand.some((x, j) => j !== i && canAct(H, j));
  const canRaise = reopened && maxTo > H.currentBet && othersCanAct;
  const minTo = Math.min(maxTo, H.currentBet === 0 ? table.bb : H.currentBet + H.minRaise);
  return { toCall: Math.min(toCall, s.stack), canCheck: toCall === 0, canCall: toCall > 0, canRaise, minTo, maxTo, pot: potTotal(H) };
}
export const potTotal = (H) => H.contrib.reduce((a, b) => a + b, 0);

// action: {type: fold|check|call|raise, to?} for the seat to act. -> {error} | table
export function act(table, i, action) {
  const H = table.hand, s = table.seats[i];
  const L = legal(table, i);
  if (!L) return { error: "It is not your turn. The Department noticed." };
  const say = (text, extra = {}) => H.log.push({ seat: i, act: action.type, street: H.street, text, ...extra });
  if (action.type === "fold") {
    if (L.canCheck) return { error: "Nothing to call. Check instead; folding for free is logged as theatre." };
    H.folded[i] = true; say(`${s.name} ${v(i, "FOLDS")}.`);
  } else if (action.type === "check") {
    if (!L.canCheck) return { error: `There are ${L.toCall} chips to call.` };
    say(`${s.name} ${v(i, "CHECKS")}.`);
  } else if (action.type === "call") {
    if (!L.canCall) return { error: "Nothing to call." };
    const a = L.toCall;
    s.stack -= a; H.bet[i] += a; H.contrib[i] += a;
    if (s.stack === 0) H.allIn[i] = true;
    say(`${s.name} ${v(i, "CALLS")} ${a}${H.allIn[i] ? ", ALL IN" : ""}.`, { amount: a });
  } else if (action.type === "raise") {
    if (!L.canRaise) return { error: "Raising is closed to you this round." };
    const to = Math.floor(Number(action.to));
    if (!Number.isFinite(to) || to > L.maxTo || (to < L.minTo && to !== L.maxTo) || to <= H.currentBet) return { error: `Raise to between ${L.minTo} and ${L.maxTo}.` };
    const add = to - H.bet[i];
    s.stack -= add; H.bet[i] = to; H.contrib[i] += add;
    if (s.stack === 0) H.allIn[i] = true;
    const inc = to - H.currentBet;
    if (inc >= H.minRaise) { H.minRaise = inc; H.fullRaiseN++; }
    const opened = H.currentBet === 0;
    H.currentBet = to;
    for (let j = 0; j < H.acted.length; j++) if (j !== i) H.acted[j] = false;
    say(`${s.name} ${v(i, opened ? "BETS" : "RAISES")}${opened ? "" : " TO"} ${to}${H.allIn[i] ? ", ALL IN" : ""}.`, { amount: to });
  } else return { error: "Unknown poker action." };
  H.acted[i] = true; H.lastRaiseN[i] = H.fullRaiseN;
  advance(table, i);
  return table;
}

function advance(table, from) {
  const H = table.hand;
  const alive = live(H);
  if (alive.filter(Boolean).length === 1) return finish(table, false);
  if (roundDone(table)) return endStreet(table);
  H.cur = nextToAct(table, from);
  if (H.cur < 0) endStreet(table);
}

function endStreet(table) {
  const H = table.hand;
  if (live(H).filter(Boolean).length === 1) return finish(table, false);
  // Deal on; with fewer than two seats able to bet, run the board out to the showdown.
  while (H.street < 3) {
    H.street++;
    H.deck.pop();   // the burn
    const k = H.street === 1 ? 3 : 1;
    for (let j = 0; j < k; j++) H.board.push(H.deck.pop());
    H.log.push({ seat: -1, act: "street", street: H.street, text: `${STREETS[H.street]}: ${H.board.map(shown).join(" ")}.` });
    H.bet = H.bet.map(() => 0); H.acted = H.acted.map(() => false); H.lastRaiseN = H.lastRaiseN.map(() => -1);
    H.currentBet = 0; H.minRaise = table.bb; H.fullRaiseN = 0;
    const actors = H.inHand.map((_, i) => i).filter(i => canAct(H, i));
    if (actors.length >= 2) { H.cur = nextToAct(table, table.button); return; }
  }
  finish(table, true);
}

function finish(table, showdown) {
  const H = table.hand, n = table.seats.length;
  const alive = live(H);
  let won, scores = null, pots;
  if (!showdown) {
    const w = alive.indexOf(true);
    won = new Array(n).fill(0); won[w] = potTotal(H);
    pots = [{ amount: potTotal(H), eligible: [w], winners: [w] }];
    H.log.push({ seat: w, act: "win", text: `${table.seats[w].name} ${v(w, "TAKES")} THE POT (${potTotal(H)}) UNCONTESTED.` });
  } else {
    scores = H.holes.map((h, i) => (alive[i] ? score([...h, ...H.board]) : -1));
    pots = buildPots(H.contrib, alive);
    won = awardPots(pots, scores, table.button, n);
    pots.forEach((p, k) => {
      const names = p.winners.map(w => table.seats[w].name).join(" AND ");
      H.log.push({ seat: p.winners[0], act: "win", text: `${pots.length > 1 ? (k === 0 ? "MAIN POT" : `SIDE POT ${k}`) : "THE POT"} (${p.amount}): ${names}${p.winners.length > 1 ? " SPLIT IT" : ` ${v(p.winners[0], "WINS")}`} WITH ${handName(scores[p.winners[0]])}.` });
    });
  }
  won.forEach((w, i) => { table.seats[i].stack += w; });
  H.done = true; H.cur = -1;
  H.result = { showdown, won, pots: pots.map(p => ({ amount: p.amount, winners: p.winners })), hands: scores ? scores.map(s => (s >= 0 ? handName(s) : null)) : null };
}

// ---- the figures' play ------------------------------------------------------------------------------------
// Monte Carlo equity: this seat's two cards and the board against `opp` random hands, the
// rest of the board dealt from what this seat cannot see.
export function equity(hole, board, opp, iters, rng) {
  const known = new Set([...hole, ...board]);
  const rest = []; for (let c = 0; c < 52; c++) if (!known.has(c)) rest.push(c);
  let win = 0;
  const need = 5 - board.length;
  for (let it = 0; it < iters; it++) {
    // partial shuffle: just the cards this trial draws
    const take = need + opp * 2;
    for (let k = 0; k < take; k++) { const j = k + rng(rest.length - k); [rest[k], rest[j]] = [rest[j], rest[k]]; }
    const b = board.concat(rest.slice(0, need));
    const mine = score([...hole, ...b]);
    let best = 0, ties = 0, lost = false;
    for (let o = 0; o < opp; o++) {
      const s = score([rest[need + o * 2], rest[need + o * 2 + 1], ...b]);
      if (s > mine) { lost = true; break; }
      if (s === mine) ties++;
      best = Math.max(best, s);
    }
    if (!lost) win += 1 / (ties + 1);
  }
  return win / iters;
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
// A figure's style from its file (0..100 dimensions):
//   aggression  threat and competence: how often it bets and raises for value
//   bluff       adaptability: how often it bets with nothing
//   tightness   care and alignment: how much equity it wants before it puts chips in
//   skill       competence: how well it reads its own chances (noise on the equity)
//   honesty     how often its tell means what it seems to (the competent leak least)
export function styleOf(b, competence, high = false) {
  const g = (k) => (Number.isFinite(b?.[k]) ? b[k] : 50);
  const comp = Number.isFinite(competence) ? competence : (g("utility") + g("adaptability")) / 2;
  return {
    aggression: Math.round(100 * clamp01(0.1 + 0.9 * (0.6 * g("threat") + 0.4 * comp) / 100)),
    bluff: Math.round(100 * (0.03 + 0.25 * (g("adaptability") / 100) ** 1.5)) / 100,
    tightness: Math.round((g("care") + g("alignment")) / 2),
    skill: Math.min(100, Math.round(comp + (high ? 12 : 0))),
    honesty: Math.round(100 * Math.max(0.5, Math.min(0.9, 1.2 - comp / 100 - (high ? 0.1 : 0)))) / 100,   // 0.5: a tell that means nothing
  };
}

// The decision for bot seat i. rnd() -> [0,1); rng(n) for the sampling.
export function botDecide(table, i, rng, rnd) {
  const H = table.hand, s = table.seats[i], st = s.bot;
  const L = legal(table, i);
  const opp = live(H).filter((x, j) => x && j !== i).length;
  const iters = st.skill >= 80 ? 500 : st.skill >= 60 ? 300 : 180;
  let eq = equity(H.holes[i], H.board, Math.max(1, opp), iters, rng);
  const noise = (100 - st.skill) / 280;
  eq = clamp01(eq + (rnd() + rnd() + rnd() - 1.5) * noise);
  const rel = eq * (opp + 1);                              // 1 = an average share of the pot
  const pot = L.pot;
  const potOdds = L.toCall > 0 ? L.toCall / (pot + L.toCall) : 0;
  const agg = st.aggression / 100, tight = st.tightness / 100;
  const sizeTo = (frac) => {
    const base = H.currentBet + Math.max(H.minRaise, Math.round((pot + L.toCall) * frac));
    return Math.max(L.minTo, Math.min(L.maxTo, base));
  };
  let d;
  const strong = rel > 1.75 - 0.6 * agg;
  if (L.canRaise && strong && rnd() < 0.35 + 0.55 * agg) d = { type: "raise", to: sizeTo(rel > 2.4 ? 0.9 : 0.6) };
  else if (L.canCheck) d = L.canRaise && rnd() < st.bluff * (opp <= 2 ? 1.4 : 0.8) ? { type: "raise", to: sizeTo(0.5), bluff: true } : { type: "check" };
  else if (eq >= potOdds * (0.75 + 0.6 * tight) || (L.toCall <= table.bb && rel > 0.55 + 0.4 * tight)) d = { type: "call" };
  else if (L.canRaise && rnd() < st.bluff * 0.25) d = { type: "raise", to: sizeTo(0.8), bluff: true };
  else d = { type: "fold" };
  // Never raise into a pot for less than it could just call with everything.
  if (d.type === "raise" && d.to <= H.currentBet) d = L.canCheck ? { type: "check" } : { type: "call" };
  d.strength = d.bluff ? "weak" : rel > 1.3 ? "strong" : "weak";
  return d;
}

// Bots act until the subject (seat 0) is to act or the hand ends. hooks.say(i, d) may add
// a line or a tell to the log.
export function runBots(table, rng, rnd, hooks = {}) {
  const H = table.hand;
  let guard = 0;
  while (!H.done && H.cur > 0 && guard++ < 200) {
    const i = H.cur;
    const d = botDecide(table, i, rng, rnd);
    const r = act(table, i, d);
    if (r.error) act(table, i, legal(table, i).canCheck ? { type: "check" } : { type: "fold" });
    hooks.after?.(i, d);
  }
  return table;
}

// What the browser may see: its own cards always, the others' only at a showdown they reached.
export function pokerView(table) {
  const H = table.hand;
  const show = H?.done && H.result?.showdown;
  return {
    level: table.level, sb: table.sb, bb: table.bb, button: table.button ?? 0, handNo: table.handNo || 0,
    seats: table.seats.map((s, i) => ({
      id: s.id, name: s.name, stack: s.stack, sprite: s.sprite || null, style: s.bot || null, tier: s.tier || null,
      inHand: H ? H.inHand[i] : false, folded: H ? H.folded[i] : false, allIn: H ? H.allIn[i] : false, bet: H ? H.bet[i] : 0,
      cards: !H || !H.holes[i] ? null : i === 0 || (show && !H.folded[i]) ? H.holes[i].map(cardCode) : ["??", "??"],
    })),
    hand: H ? {
      board: H.board.map(cardCode), pot: potTotal(H), street: STREETS[H.street], cur: H.cur, done: H.done, result: H.result,
      log: H.log.slice(-60), legal: legal(table, 0), sbSeat: H.sbSeat, bbSeat: H.bbSeat,
    } : null,
  };
}
