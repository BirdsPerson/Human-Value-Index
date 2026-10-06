// THE CARD ROOM's shared deck: cards, a seeded shuffle, names. Pure: no DOM, no clock, no
// Math.random, so every engine here (hearts.js, spades.js, klondike.js, spider.js) deals the same
// hand from the same seed in any engine, and a game is {cfg, log} that replays to itself.
//
// A card is an integer 0..51, the casino's own shape (src/casino/rules.js): rank = c >> 2
// (0 = deuce .. 12 = ace), suit = c & 3 (0 spades, 1 hearts, 2 diamonds, 3 clubs). A code is the
// casino's two characters ("Qs", "Th"), which the pixel cards draw.

export const RANKS = "23456789TJQKA";
export const SUITS = "shdc";
export const SP = 0, HE = 1, DI = 2, CL = 3;
export const rankOf = (c) => c >> 2;
export const suitOf = (c) => c & 3;
export const card = (rank, suit) => (rank << 2) | suit;
export const codeOf = (c) => RANKS[c >> 2] + SUITS[c & 3];
export const fromCode = (code) => { const r = RANKS.indexOf(code?.[0]), s = SUITS.indexOf(code?.[1]); return r < 0 || s < 0 ? -1 : card(r, s); };
export const isRed = (c) => (c & 3) === HE || (c & 3) === DI;
// Solitaire's rank: ace low, 1..13.
export const solRank = (c) => ((c >> 2) === 12 ? 1 : (c >> 2) + 2);

const RANK_NAME = ["two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "jack", "queen", "king", "ace"];
const SUIT_NAME = ["spades", "hearts", "diamonds", "clubs"];
export const SUIT_WORD = SUIT_NAME;
// "queen of spades": a card's accessible name.
export const nameOf = (c) => `${RANK_NAME[c >> 2]} of ${SUIT_NAME[c & 3]}`;
export const nameOfCode = (code) => { const c = fromCode(code); return c < 0 ? "face-down card" : nameOf(c); };
export const rankWord = (c) => RANK_NAME[c >> 2];

// ---- the seeded generator -------------------------------------------------------------------
// FNV-1a of a string -> a 32-bit seed; xorshift32 steps. The state is one integer kept in the
// game's own state (st.rng), so a CPU's choice is part of the replay.
export function fnv(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) || 1;
}
export function nextRng(x) {
  x >>>= 0; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) || 1;
}
// One draw from the state's generator: 0 <= n < k.
export function draw(st, k) { st.rng = nextRng(st.rng); return k > 0 ? st.rng % k : 0; }
// Fisher-Yates over a list, using the state's generator.
export function shuffleInto(st, list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = draw(st, i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
export const fullDeck = () => Array.from({ length: 52 }, (_, i) => i);

// Hands sort the way Windows Hearts sorted them: by suit (clubs, diamonds, spades, hearts: the
// colours alternate), then by rank.
const SUIT_ORDER = [2, 3, 1, 0];
export const sortHand = (cards) => cards.slice().sort((a, b) => SUIT_ORDER[a & 3] - SUIT_ORDER[b & 3] || (a >> 2) - (b >> 2));

export const clone = (o) => JSON.parse(JSON.stringify(o));

// ---- tricks (hearts and spades) ----------------------------------------------------------------
// The winner of a complete trick [{p, c}...]: the highest trump if any (trump: a suit or -1), else
// the highest card of the suit led.
export function trickWinner(trick, trump = -1) {
  const led = trick[0].c & 3;
  let best = trick[0];
  for (const t of trick.slice(1)) {
    const s = t.c & 3, bs = best.c & 3;
    if (s === trump && bs !== trump) best = t;
    else if (s === bs && (t.c >> 2) > (best.c >> 2) && (s === led || s === trump)) best = t;
  }
  return best.p;
}
