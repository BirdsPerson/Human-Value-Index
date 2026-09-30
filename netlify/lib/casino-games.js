// The table games, server-side: roulette, blackjack, baccarat. Pure functions over a state
// object and an rng (rng(n) -> integer in [0, n)); the function (netlify/functions/casino.js)
// passes crypto.randomInt and stores the state in the wallet blob, so the shoe, the hole
// card and the next card never leave the server. Amounts here are centichips (src/casino/rules.js).
import { randomInt } from "node:crypto";
import { coverOf, WHEEL, cardCode } from "../../src/casino/rules.js";

export const cryptoRng = (n) => randomInt(n);

export function shuffle(cards, rng) {
  for (let i = cards.length - 1; i > 0; i--) { const j = rng(i + 1); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return cards;
}
export const newShoe = (decks, rng) => shuffle(Array.from({ length: 52 * decks }, (_, i) => i % 52), rng);

// ---- roulette ---------------------------------------------------------------------------------
// bets: [{type, n?|k?, amount (centichips)}]. -> {n, color, returned, lines: [{i, win, returned}]}
// The stakes are taken before the spin; `returned` is what comes back (stake + winnings).
export function spinRoulette(bets, rng) {
  const n = WHEEL[rng(37)];
  return { n, ...settleRoulette(bets, n) };
}
export function settleRoulette(bets, n) {
  let returned = 0;
  const lines = bets.map((b, i) => {
    const cover = coverOf(b);
    const win = cover.includes(n);
    const back = win ? b.amount * (36 / cover.length) : 0;   // 36/k is an integer for every legal k
    returned += back;
    return { i, win, returned: back };
  });
  return { returned, lines };
}

// ---- blackjack ------------------------------------------------------------------------------------
// Six decks, reshuffled when 75% has been dealt. Dealer stands on all 17s (S17), peeks for
// blackjack under an ace or a ten. Blackjack pays 3:2. Double on any first two cards (also
// after a split). Split once (two hands; equal value, so K-10 splits); split aces take one
// card each. Insurance is offered under an ace: half the stake, pays 2:1.
export const BJ_DECKS = 6;
export const BJ_RESHUFFLE_AT = Math.round(52 * BJ_DECKS * 0.25);

export const bjValue = (c) => { const r = c >> 2; return r <= 8 ? r + 2 : r <= 11 ? 10 : 11; };
export function bjTotal(cards) {
  let t = 0, aces = 0;
  for (const c of cards) { const v = bjValue(c); t += v; if (v === 11) aces++; }
  while (t > 21 && aces) { t -= 10; aces--; }
  return { total: t, soft: aces > 0 };
}
const isBJ = (cards) => cards.length === 2 && bjTotal(cards).total === 21;

function draw(state, rng) {
  if (!state.shoe || !state.shoe.length) state.shoe = newShoe(BJ_DECKS, rng);
  return state.shoe.pop();
}

// Dealer's play: hit until 17 or more, standing on soft 17.
export function dealerPlays(cards, next) {
  const out = cards.slice();
  while (bjTotal(out).total < 17) out.push(next());
  return out;
}

// A new round. The caller has checked the limits and taken `bet` from the wallet.
export function bjDeal(state, bet, rng) {
  if (!state.shoe || state.shoe.length < BJ_RESHUFFLE_AT) { state.shoe = newShoe(BJ_DECKS, rng); state.shuffled = true; } else state.shuffled = false;
  const p1 = draw(state, rng), d1 = draw(state, rng), p2 = draw(state, rng), d2 = draw(state, rng);
  state.round = { bet, hands: [{ cards: [p1, p2], bet, done: false, doubled: false, splitAces: false }], dealer: [d1, d2], i: 0, insurance: 0, phase: "play", outcome: null };
  const up = bjValue(d1);
  if (up === 11) { state.round.phase = "insurance"; return state; }
  return bjAfterInsurance(state, rng);
}

// Under an ace the player answers the insurance offer first (take: stake taken by the caller).
export function bjInsurance(state, take, rng) {
  const R = state.round;
  if (!R || R.phase !== "insurance") return { error: "No insurance is on offer." };
  R.insurance = take ? R.bet / 2 : 0;
  return bjAfterInsurance(state, rng);
}

function bjAfterInsurance(state, rng) {
  const R = state.round;
  const up = bjValue(R.dealer[0]);
  const dealerBJ = (up === 11 || up === 10) && isBJ(R.dealer);
  if (dealerBJ || isBJ(R.hands[0].cards)) { R.hands[0].done = true; return bjSettle(state, rng); }
  R.phase = "play";
  return state;
}

export function bjCanSplit(R) {
  const h = R.hands[R.i];
  return R.phase === "play" && R.hands.length === 1 && h.cards.length === 2 && bjValue(h.cards[0]) === bjValue(h.cards[1]);
}
export const bjCanDouble = (R) => R.phase === "play" && R.hands[R.i].cards.length === 2 && !R.hands[R.i].splitAces;

// hit | stand | double | split. The caller takes the extra stake for double and split first.
export function bjAct(state, action, rng) {
  const R = state.round;
  if (!R || R.phase !== "play") return { error: "There is no hand in play." };
  const h = R.hands[R.i];
  if (action === "hit") {
    h.cards.push(draw(state, rng));
    if (bjTotal(h.cards).total >= 21) h.done = true;
  } else if (action === "stand") {
    h.done = true;
  } else if (action === "double") {
    if (!bjCanDouble(R)) return { error: "Doubling is for two-card hands." };
    h.bet *= 2; h.doubled = true;
    h.cards.push(draw(state, rng));
    h.done = true;
  } else if (action === "split") {
    if (!bjCanSplit(R)) return { error: "That hand does not split." };
    const aces = bjValue(h.cards[0]) === 11;
    const a = { cards: [h.cards[0], draw(state, rng)], bet: h.bet, done: aces, doubled: false, splitAces: aces };
    const b = { cards: [h.cards[1], draw(state, rng)], bet: h.bet, done: aces, doubled: false, splitAces: aces };
    for (const x of [a, b]) if (!x.done && bjTotal(x.cards).total === 21) x.done = true;
    R.hands = [a, b];
  } else return { error: "Unknown blackjack action." };
  while (R.i < R.hands.length && R.hands[R.i].done) R.i++;
  if (R.i >= R.hands.length) return bjSettle(state, rng);
  return state;
}

// Dealer plays (unless every hand is bust or it was settled on a blackjack), then each hand
// is paid. R.outcome.returned is the total to credit (stakes + winnings), centichips.
function bjSettle(state, rng) {
  const R = state.round;
  const dealerBJ = isBJ(R.dealer);
  const playerBJ = R.hands.length === 1 && isBJ(R.hands[0].cards);
  const allBust = R.hands.every(h => bjTotal(h.cards).total > 21);
  if (!dealerBJ && !playerBJ && !allBust) R.dealer = dealerPlays(R.dealer, () => draw(state, rng));
  const d = bjTotal(R.dealer).total;
  let returned = R.insurance && dealerBJ ? R.insurance * 3 : 0;
  const results = R.hands.map(h => {
    const p = bjTotal(h.cards).total;
    let r;
    if (playerBJ && dealerBJ) r = "push";
    else if (playerBJ) r = "blackjack";
    else if (dealerBJ) r = "lose";
    else if (p > 21) r = "bust";
    else if (d > 21 || p > d) r = "win";
    else if (p === d) r = "push";
    else r = "lose";
    const back = r === "blackjack" ? h.bet * 2.5 : r === "win" ? h.bet * 2 : r === "push" ? h.bet : 0;
    returned += back;
    return { r, back };
  });
  R.phase = "done";
  R.outcome = { returned, results, dealerTotal: d, dealerBJ, insurancePaid: Boolean(R.insurance && dealerBJ) };
  return state;
}

// What the browser may see: the hole card only once the dealer has played.
export function bjView(state) {
  const R = state.round;
  if (!R) return null;
  const open = R.phase === "done";
  return {
    phase: R.phase, bet: R.bet, insurance: R.insurance, i: R.i,
    dealer: open ? R.dealer.map(cardCode) : [cardCode(R.dealer[0]), "??"],
    dealerTotal: open ? bjTotal(R.dealer).total : bjValue(R.dealer[0]),
    hands: R.hands.map(h => ({ cards: h.cards.map(cardCode), bet: h.bet, done: h.done, doubled: h.doubled, total: bjTotal(h.cards).total, soft: bjTotal(h.cards).soft })),
    canSplit: bjCanSplit(R), canDouble: R.phase === "play" && bjCanDouble(R),
    outcome: R.outcome, shoeLeft: state.shoe?.length ?? 0, shuffled: Boolean(state.shuffled),
  };
}

// ---- baccarat --------------------------------------------------------------------------------------
// Punto banco, eight decks, the standard tableau. Player bet 1:1; banker 1:1 less 5%
// commission; tie 8:1 (player and banker bets push on a tie).
export const BAC_DECKS = 8;
export const BAC_RESHUFFLE_AT = 16;
export const bacValue = (c) => { const r = c >> 2; return r <= 7 ? r + 2 : r === 12 ? 1 : 0; };   // 2..9, A = 1, T J Q K = 0
export const bacTotal = (cards) => cards.reduce((t, c) => t + bacValue(c), 0) % 10;

// The banker's third card, given the banker's two-card total and the player's third card
// (its value, or null when the player stood).
export function bankerDraws(b, t) {
  if (t === null) return b <= 5;
  if (b <= 2) return true;
  if (b === 3) return t !== 8;
  if (b === 4) return t >= 2 && t <= 7;
  if (b === 5) return t >= 4 && t <= 7;
  if (b === 6) return t === 6 || t === 7;
  return false;
}
export const playerDraws = (p) => p <= 5;

// The coup from a card source (next() -> card). -> {player, banker, pt, bt, winner}
export function bacCoup(next) {
  const p1 = next(), b1 = next(), p2 = next(), b2 = next();   // dealt alternately, player first
  const P = [p1, p2], B = [b1, b2];
  let pt = bacTotal(P), bt = bacTotal(B);
  if (pt < 8 && bt < 8) {
    let third = null;
    if (playerDraws(pt)) { const c = next(); P.push(c); third = bacValue(c); pt = bacTotal(P); }
    if (bankerDraws(bt, third)) { B.push(next()); bt = bacTotal(B); }
  }
  return { player: P, banker: B, pt, bt, winner: pt > bt ? "player" : bt > pt ? "banker" : "tie" };
}

// bets: {player, banker, tie} centichips (taken already). -> returned (stake + winnings).
export function bacSettle(bets, winner) {
  let r = 0;
  if (winner === "tie") r += (bets.tie || 0) * 9 + (bets.player || 0) + (bets.banker || 0);
  else if (winner === "player") r += (bets.player || 0) * 2;
  else r += (bets.banker || 0) + (bets.banker || 0) * 0.95;
  return Math.round(r);
}

export function bacPlay(state, bets, rng) {
  if (!state.shoe || state.shoe.length < BAC_RESHUFFLE_AT) { state.shoe = newShoe(BAC_DECKS, rng); state.shuffled = true; } else state.shuffled = false;
  const coup = bacCoup(() => state.shoe.pop());
  return { ...coup, returned: bacSettle(bets, coup.winner), shoeLeft: state.shoe.length };
}
