// SOLITAIRE (Klondike), the home game: a deck of cards on your own table (THE SHOPS sells the
// deck). A pure, deterministic rules engine: newKlondike(cfg) deals the same layout from the same
// seed; a game is {cfg, log} and replay() re-plays it. UNDO is the page's: it drops the last input
// from the log and replays.
//
// cfg: {seed, draw: 1 | 3, scoring: "standard" | "vegas"}.
// The layout: seven tableau piles (1..7 cards, the top one face up), the stock, the waste, four
// foundations (one per suit, ace up to king). Tableau builds down in alternating colours; only a
// king (or a run headed by one) goes to an empty pile.
// Scoring, the way Windows (1990) kept it:
//   standard  waste -> tableau +5, to a foundation +10, turning a tableau card +5, foundation ->
//             tableau -15, each pass back through the stock -100 (draw one) or, after the third
//             pass, -20 (draw three); never below zero.
//   vegas     -52 to start (the "buy-in", in nothing); +5 a card on a foundation, -5 a card taken
//             back off; one pass through the stock (draw one) or three (draw three). An
//             exhibition: no CYCLES move, ever.
// Inputs: {t: "draw"} (turn the stock, or put the waste back), {t: "move", from, to, n}:
//   from "w" | "t0".."t6" | "f0".."f3"; to "t0".."t6" | "f0".."f3" | "f" (the suit's own); n cards
//   off a tableau pile (default 1).

import { suitOf, solRank, isRed, fnv, shuffleInto, fullDeck, clone } from "./deck.js";

export const VERSION = 1;
export const PILES = 7;

export function newKlondike(cfg = {}) {
  const seed = (cfg.seed >>> 0) || 1;
  const drawN = cfg.draw === 3 ? 3 : 1, scoring = cfg.scoring === "vegas" ? "vegas" : "standard";
  const st = { v: VERSION, cfg: { v: VERSION, seed, draw: drawN, scoring }, rng: fnv(`klondike|${seed}`) };
  const deck = shuffleInto(st, fullDeck());
  st.tab = Array.from({ length: PILES }, () => ({ down: [], up: [] }));
  let k = 0;
  for (let r = 0; r < PILES; r++) for (let c = r; c < PILES; c++) st.tab[c].down.push(deck[k++]);
  for (const t of st.tab) t.up.push(t.down.pop());
  st.stock = deck.slice(k).reverse();   // the top of the stock is the end of the list
  st.waste = []; st.found = [[], [], [], []];
  st.passes = 0; st.moves = 0; st.score = scoring === "vegas" ? -52 : 0; st.won = false; st.events = [];
  return st;
}

export const passLimit = (cfg) => (cfg.scoring === "vegas" ? (cfg.draw === 3 ? 3 : 1) : Infinity);
export const canRecycle = (st) => !st.stock.length && st.waste.length > 0 && st.passes + 1 < passLimit(st.cfg);
const pen = (st, d) => { st.score += d; if (st.cfg.scoring === "standard" && st.score < 0) st.score = 0; };

// The cards a source would hand over: [cards], or null.
export function takeFrom(st, from, n = 1) {
  if (from === "w") return st.waste.length && n === 1 ? [st.waste[st.waste.length - 1]] : null;
  const m = /^([tf])(\d)$/.exec(String(from || ""));
  if (!m) return null;
  const i = +m[2];
  if (m[1] === "f") { const f = st.found[i]; return f && f.length && n === 1 ? [f[f.length - 1]] : null; }
  const t = st.tab[i];
  if (!t || n < 1 || n > t.up.length) return null;
  return t.up.slice(t.up.length - n);
}
// May these cards go there?
export function accepts(st, to, cards) {
  if (!cards?.length) return false;
  const c0 = cards[0];
  const m = /^([tf])(\d)$/.exec(String(to || ""));
  if (!m) return false;
  const i = +m[2];
  if (m[1] === "f") {
    if (cards.length !== 1 || i > 3 || suitOf(c0) !== i) return false;
    const f = st.found[i];
    return f.length ? solRank(f[f.length - 1]) + 1 === solRank(c0) : solRank(c0) === 1;
  }
  const t = st.tab[i];
  if (!t) return false;
  if (!t.up.length) return !t.down.length && solRank(c0) === 13;
  const top = t.up[t.up.length - 1];
  return solRank(top) === solRank(c0) + 1 && isRed(top) !== isRed(c0);
}

export function apply(st0, a) {
  if (!a || typeof a !== "object" || st0.won) return null;
  const st = clone(st0); st.events = [];
  if (a.t === "draw") {
    if (st.stock.length) {
      const k = Math.min(st.cfg.draw, st.stock.length);
      for (let j = 0; j < k; j++) st.waste.push(st.stock.pop());
      st.events.push({ k: "draw", n: k });
    } else if (canRecycle(st)) {
      st.stock = st.waste.reverse(); st.waste = []; st.passes++;
      if (st.cfg.scoring === "standard") pen(st, st.cfg.draw === 1 ? -100 : st.passes > 3 ? -20 : 0);
      st.events.push({ k: "recycle" });
    } else return null;
    st.moves++;
    return st;
  }
  if (a.t !== "move") return null;
  const n = Number.isInteger(a.n) ? a.n : 1;
  const cards = takeFrom(st, a.from, n);
  let to = a.to;
  if (to === "f" && cards?.length === 1) to = `f${suitOf(cards[0])}`;
  if (!cards || to === a.from || !accepts(st, to, cards)) return null;
  // off the source
  if (a.from === "w") st.waste.pop();
  else if (a.from[0] === "f") st.found[+a.from[1]].pop();
  else st.tab[+a.from[1]].up.splice(-n, n);
  // onto the target
  if (to[0] === "f") st.found[+to[1]].push(cards[0]);
  else st.tab[+to[1]].up.push(...cards);
  // the score
  const V = st.cfg.scoring === "vegas";
  if (to[0] === "f") pen(st, V ? 5 : a.from[0] === "f" ? 0 : 10);
  else if (a.from === "w") pen(st, V ? 0 : 5);
  else if (a.from[0] === "f") pen(st, V ? -5 : -15);
  st.events.push({ k: "move", from: a.from, to, cards });
  // turn the card underneath
  if (a.from[0] === "t") {
    const t = st.tab[+a.from[1]];
    if (!t.up.length && t.down.length) { t.up.push(t.down.pop()); if (!V) pen(st, 5); st.events.push({ k: "flip", pile: a.from, c: t.up[0] }); }
  }
  st.moves++;
  if (st.found.every(f => f.length === 13)) { st.won = true; st.events.push({ k: "won" }); }
  return st;
}

export function replay(cfg, log) {
  let st = newKlondike(cfg);
  for (const a of log || []) { const n = apply(st, a); if (!n) return null; st = n; }
  return st;
}

// ---- help for the page ---------------------------------------------------------------------------
// The best place for the cards a tap picked up: their foundation (a single card), else the first
// tableau pile that takes them (a pile with cards before an empty one). -> "f2" | "t4" | null
export function bestTarget(st, from, n = 1) {
  const cards = takeFrom(st, from, n);
  if (!cards) return null;
  if (cards.length === 1 && from[0] !== "f") { const f = `f${suitOf(cards[0])}`; if (accepts(st, f, cards)) return f; }
  const order = [...Array(PILES).keys()].map(i => `t${i}`).filter(t => t !== from);
  const full = order.filter(t => st.tab[+t[1]].up.length), empty = order.filter(t => !st.tab[+t[1]].up.length);
  // a king that already heads its pile gains nothing from an empty one
  const headsPile = from[0] === "t" && st.tab[+from[1]].down.length === 0 && n === st.tab[+from[1]].up.length;
  for (const t of [...full, ...(headsPile ? [] : empty)]) if (accepts(st, t, cards)) return t;
  return null;
}
// Every card that can go up now, one at a time (the AUTO FINISH, and the double tap). -> input | null
export function nextHome(st) {
  const srcs = ["w", ...[...Array(PILES).keys()].map(i => `t${i}`)];
  for (const s of srcs) { const c = takeFrom(st, s, 1); if (c && accepts(st, `f${suitOf(c[0])}`, c)) return { t: "move", from: s, to: `f${suitOf(c[0])}`, n: 1 }; }
  return null;
}
// Nothing face down and nothing in the stock or the waste: the rest plays itself.
export const solved = (st) => !st.stock.length && !st.waste.length && st.tab.every(t => !t.down.length);
// The size of the run a tap on tableau card index i (in up) picks up.
export const runFrom = (st, pile, i) => st.tab[pile].up.length - i;
