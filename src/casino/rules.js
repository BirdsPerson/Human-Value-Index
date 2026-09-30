// HOUSE EDGE CASINO: the rules both sides read. The server (netlify/lib/casino-*.js) is the
// authority on chips and cards; the browser imports this only to draw the same layout and
// quote the same limits. Play chips only: no purchase, no cash-out, no transfer, no prizes
// (docs/legal/terms.md §10, docs/CASINO.md).
//
// Chips are held server-side in hundredths (a "centichip") so 3:2 blackjack, half-stake
// insurance and the banker's 5% commission stay exact integers. Every stake is a whole chip.

export const CHIP_NAME = "HOUSE CHIPS";
export const ALLOWANCE = 1000;              // chips, once per UTC day, per assessed case file
export const HIGH_UNLOCK_CHIPS = 5000;      // or one of HIGH_TIERS
export const HIGH_TIERS = ["ESSENTIAL INFRASTRUCTURE", "RETAINED SPECIALIST"];
export const LEVELS = ["floor", "high"];

// [min, max] per stake (roulette: per spin, all bets together), in whole chips.
export const LIMITS = {
  floor: { roulette: [1, 500], blackjack: [5, 500], baccarat: [5, 500], poker: { sb: 5, bb: 10, buyIn: [200, 1000] } },
  high: { roulette: [25, 5000], blackjack: [100, 5000], baccarat: [100, 5000], poker: { sb: 25, bb: 50, buyIn: [1000, 10000] } },
};

// The edge on each game, as the Department states it. Roulette and baccarat are exact
// (checked by scripts/check-casino.mjs); blackjack depends on the player.
export const HOUSE_EDGE = [
  { game: "roulette", label: "ROULETTE (SINGLE ZERO)", edge: "2.70%", note: "EVERY BET ON THE LAYOUT PAYS 36/N - 1 ON N NUMBERS OF 37. THE ZERO IS THE DEPARTMENT'S." },
  { game: "blackjack", label: "BLACKJACK (6 DECKS, S17, 3:2)", edge: "0.4%", note: "WITH PERFECT BASIC STRATEGY. YOUR STRATEGY IS NOT PERFECT. THE DEPARTMENT HAS YOUR FILE." },
  { game: "baccarat", label: "BACCARAT: BANKER / PLAYER / TIE", edge: "1.06% / 1.24% / 14.36%", note: "THE TIE PAYS 8:1 AND IS STILL THE WORST BET IN THE BUILDING." },
  { game: "poker", label: "HOLD'EM", edge: "0% RAKE", note: "THE HOUSE TAKES NOTHING. THE FIGURES AT THE TABLE TAKE EVERYTHING." },
];
export const HOUSE_LINE = "THE HOUSE ALWAYS WINS. THE DEPARTMENT IS THE HOUSE.";

export const LEGAL_LINES = [
  "PLAY CHIPS ONLY. HOUSE CHIPS ARE A FREE DAILY ALLOWANCE ON AN ASSESSED FILE. THEY CANNOT BE BOUGHT, CASHED OUT, TRANSFERRED TO ANOTHER PLAYER OR EXCHANGED FOR ANYTHING OF VALUE. THERE ARE NO PRIZES. SUBJECTS MUST BE 16 OR OLDER.",
];
export const RESPONSIBLE_LINE = "THE HOUSE WINS EVENTUALLY. THAT IS THE WHOLE DESIGN, AND THE DEPARTMENT IS PROUD OF IT. STOP WHEN IT STOPS BEING FUN; THE DEPARTMENT WILL NOT FILE IT AS WEAKNESS. IF GAMBLING WITH REAL MONEY IS COSTING YOU, CALL 1-800-GAMBLER. IT IS FREE, IT IS CONFIDENTIAL, AND IT IS NOT THE DEPARTMENT.";

// ---- roulette -----------------------------------------------------------------------------
// European single-zero wheel, pockets in wheel order clockwise from zero.
export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const colorOf = (n) => (n === 0 ? "green" : RED.has(n) ? "red" : "black");
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
// The layout: 12 rows of three, row r (1..12) = 3r-2, 3r-1, 3r. Column c (1..3) = n % 3 (3 for 0).
const rowOf = (n) => Math.ceil(n / 3);

export const OUTSIDE = {
  red: () => range(1, 36).filter(n => RED.has(n)),
  black: () => range(1, 36).filter(n => !RED.has(n)),
  odd: () => range(1, 36).filter(n => n % 2 === 1),
  even: () => range(1, 36).filter(n => n % 2 === 0),
  low: () => range(1, 18),
  high: () => range(19, 36),
};
export const INSIDE_TYPES = ["straight", "split", "street", "corner", "line"];
export const BET_TYPES = [...INSIDE_TYPES, "dozen", "column", ...Object.keys(OUTSIDE)];

// The numbers a bet covers, or null when it is not a bet on this layout. Inside bets name
// their numbers (any order); a dozen or column names which (1..3).
export function coverOf(bet) {
  if (!bet || typeof bet !== "object" || !BET_TYPES.includes(bet.type)) return null;
  const t = bet.type;
  if (OUTSIDE[t]) return OUTSIDE[t]();
  if (t === "dozen" || t === "column") {
    const k = bet.k;
    if (![1, 2, 3].includes(k)) return null;
    return t === "dozen" ? range(12 * (k - 1) + 1, 12 * k) : range(1, 36).filter(n => ((n - 1) % 3) + 1 === k);
  }
  const ns = Array.isArray(bet.n) ? bet.n : null;
  if (!ns || ns.some(n => !Number.isInteger(n) || n < 0 || n > 36) || new Set(ns).size !== ns.length) return null;
  const s = ns.slice().sort((a, b) => a - b);
  const [a] = s;
  const eq = (xs) => xs.length === s.length && xs.every((x, i) => x === s[i]);
  switch (t) {
    case "straight": return s.length === 1 ? s : null;
    case "split": {
      if (s.length !== 2) return null;
      const b = s[1];
      if (a === 0) return b <= 3 ? s : null;                            // 0-1, 0-2, 0-3
      if (b - a === 1 && rowOf(a) === rowOf(b)) return s;                  // side by side
      return b - a === 3 ? s : null;                                       // one above the other
    }
    case "street":
      if (eq([0, 1, 2]) || eq([0, 2, 3])) return s;                        // the trios
      return a >= 1 && a % 3 === 1 && eq([a, a + 1, a + 2]) ? s : null;
    case "corner":
      if (eq([0, 1, 2, 3])) return s;                                      // the first four
      return a >= 1 && a % 3 !== 0 && a <= 32 && eq([a, a + 1, a + 3, a + 4]) ? s : null;
    case "line":
      return a >= 1 && a % 3 === 1 && a <= 31 && eq(range(a, a + 5)) ? s : null;
    default: return null;
  }
}

// Payout to one (the stake comes back too) on a bet covering k numbers: 36/k - 1.
// straight 35, split 17, street 11, corner 8, line 5, dozen/column 2, even money 1.
export const payoutOf = (bet) => { const c = coverOf(bet); return c ? 36 / c.length - 1 : null; };
export const betLabel = (bet) => {
  const t = bet.type;
  if (OUTSIDE[t]) return t.toUpperCase();
  if (t === "dozen") return ["1ST 12", "2ND 12", "3RD 12"][bet.k - 1];
  if (t === "column") return `COLUMN ${bet.k}`;
  return `${t.toUpperCase()} ${(bet.n || []).slice().sort((a, b) => a - b).join("-")}`;
};

// ---- cards (shared shape) --------------------------------------------------------------------
// A card is an integer 0..51: rank = c >> 2 (0 = deuce .. 12 = ace), suit = c & 3.
export const RANKS = "23456789TJQKA";
export const SUITS = "shdc";
export const cardCode = (c) => RANKS[c >> 2] + SUITS[c & 3];
export const SUIT_GLYPH = { s: "♠", h: "♥", d: "♦", c: "♣" };

// ---- helpers ------------------------------------------------------------------------------------
export const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
// ISO week, e.g. "2026-W40": the leaderboard's window.
export function isoWeek(t = Date.now()) {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7;                      // Monday 0
  const th = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const y = th.getUTCFullYear();
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const wk = 1 + Math.round(((th - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${String(wk).padStart(2, "0")}`;
}
export const fmtChips = (centi) => {
  const v = centi / 100;
  return Number.isInteger(v) ? v.toLocaleString("en-US") : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
export const highUnlocked = (chipsCenti, tier) => HIGH_TIERS.includes(tier) || chipsCenti >= HIGH_UNLOCK_CHIPS * 100;
