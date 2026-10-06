// SPIDER SOLITAIRE, the other home game (two decks' worth, from the same deck of cards: the
// Department does not ask how). A pure, deterministic rules engine like klondike.js.
//
// cfg: {seed, suits: 1 | 2 | 4}. 104 cards: eight runs of thirteen in one suit (spades), two
// (spades and hearts) or all four. Ten piles: 54 cards dealt (six to the first four piles, five to
// the rest), the top of each face up; the other 50 wait in the stock, ten at a time.
// Build down regardless of suit; only a run in ONE suit moves together. A full run, king down to
// ace in one suit, goes off the table by itself. A deal puts one card on every pile, and needs
// every pile to hold at least one card. Eight runs off the table wins.
// Scoring, Windows' (1998): 500 to start, -1 a move (a deal is a move), +100 a run off.
// Inputs: {t: "deal"}, {t: "move", from: 0..9, n, to: 0..9}.

import { card, suitOf, solRank, fnv, shuffleInto, clone } from "./deck.js";

export const VERSION = 1;
export const PILES = 10;
const SUITS_FOR = { 1: [0], 2: [0, 1], 4: [0, 1, 2, 3] };

export function newSpider(cfg = {}) {
  const seed = (cfg.seed >>> 0) || 1;
  const suits = [1, 2, 4].includes(cfg.suits) ? cfg.suits : 1;
  const st = { v: VERSION, cfg: { v: VERSION, seed, suits }, rng: fnv(`spider|${seed}|${suits}`) };
  const ss = SUITS_FOR[suits], cards = [];
  for (let k = 0; k < 8; k++) for (let r = 0; r < 13; r++) cards.push(card(r, ss[k % ss.length]));
  const deck = shuffleInto(st, cards);
  st.tab = Array.from({ length: PILES }, () => ({ down: [], up: [] }));
  let i = 0;
  for (let k = 0; k < 54; k++) st.tab[k % PILES].down.push(deck[i++]);
  for (const t of st.tab) t.up.push(t.down.pop());
  st.stock = deck.slice(i);   // 50: five deals
  st.done = []; st.score = 500; st.moves = 0; st.won = false; st.events = [];
  return st;
}

// The longest run in one suit at the top of a pile.
export function runLen(st, i) {
  const up = st.tab[i]?.up || [];
  let n = up.length ? 1 : 0;
  for (let k = up.length - 1; k > 0; k--) {
    const a = up[k - 1], b = up[k];
    if (suitOf(a) === suitOf(b) && solRank(a) === solRank(b) + 1) n++; else break;
  }
  return n;
}
export function canMove(st, from, n, to) {
  if (from === to || !st.tab[from] || !st.tab[to] || n < 1 || n > runLen(st, from)) return false;
  const up = st.tab[from].up, head = up[up.length - n], dst = st.tab[to];
  if (!dst.up.length) return !dst.down.length;
  return solRank(dst.up[dst.up.length - 1]) === solRank(head) + 1;
}
export const canDeal = (st) => st.stock.length >= PILES && st.tab.every(t => t.up.length > 0);

function settle(st, i) {
  const t = st.tab[i];
  if (runLen(st, i) >= 13 && solRank(t.up[t.up.length - 1]) === 1 && solRank(t.up[t.up.length - 13]) === 13) {
    const run = t.up.splice(-13, 13);
    st.done.push(suitOf(run[0])); st.score += 100;
    st.events.push({ k: "run", pile: i, suit: suitOf(run[0]) });
  }
  if (!t.up.length && t.down.length) { t.up.push(t.down.pop()); st.events.push({ k: "flip", pile: i, c: t.up[0] }); }
}

export function apply(st0, a) {
  if (!a || typeof a !== "object" || st0.won) return null;
  const st = clone(st0); st.events = [];
  if (a.t === "deal") {
    if (!canDeal(st)) return null;
    for (let i = 0; i < PILES; i++) st.tab[i].up.push(st.stock.pop());
    st.events.push({ k: "deal" });
    for (let i = 0; i < PILES; i++) settle(st, i);
  } else if (a.t === "move") {
    const from = Number(a.from), to = Number(a.to), n = Number.isInteger(a.n) ? a.n : 1;
    if (!canMove(st, from, n, to)) return null;
    const cards = st.tab[from].up.splice(-n, n);
    st.tab[to].up.push(...cards);
    st.events.push({ k: "move", from, to, cards });
    settle(st, from); settle(st, to);
  } else return null;
  st.moves++; st.score -= 1;
  if (st.done.length === 8) { st.won = true; st.events.push({ k: "won" }); }
  return st;
}

export function replay(cfg, log) {
  let st = newSpider(cfg);
  for (const a of log || []) { const n = apply(st, a); if (!n) return null; st = n; }
  return st;
}

// The best place for a run a tap picked up: a pile whose top continues the suit, then any pile it
// fits, then an empty pile. -> pile index | -1
export function bestTarget(st, from, n) {
  if (n < 1 || n > runLen(st, from)) return -1;
  const head = st.tab[from].up[st.tab[from].up.length - n];
  const fits = [...Array(PILES).keys()].filter(j => canMove(st, from, n, j));
  const same = fits.find(j => st.tab[j].up.length && suitOf(st.tab[j].up[st.tab[j].up.length - 1]) === suitOf(head));
  if (same != null) return same;
  const any = fits.find(j => st.tab[j].up.length);
  if (any != null) return any;
  const wholePile = st.tab[from].down.length === 0 && n === st.tab[from].up.length;
  return wholePile ? -1 : (fits[0] ?? -1);
}
// A move worth showing (HINT): the longest same-suit continuation, else any move that turns a card.
export function hint(st) {
  let best = null;
  for (let i = 0; i < PILES; i++) {
    const L = runLen(st, i);
    for (let n = L; n >= 1; n--) {
      const j = bestTarget(st, i, n);
      if (j < 0) continue;
      const head = st.tab[i].up[st.tab[i].up.length - n], dst = st.tab[j];
      const sameSuit = dst.up.length && suitOf(dst.up[dst.up.length - 1]) === suitOf(head);
      const reveals = n === st.tab[i].up.length && st.tab[i].down.length > 0;
      const val = (sameSuit ? 20 : 0) + (reveals ? 10 : 0) + n - (dst.up.length ? 0 : 15);
      if (n < st.tab[i].up.length && !sameSuit && !reveals) {
        // breaking a run onto another suit gains nothing unless it frees a same-suit join
        continue;
      }
      if (!best || val > best.val) best = { val, a: { t: "move", from: i, n, to: j } };
      break;
    }
  }
  return best && best.val > 0 ? best.a : canDeal(st) ? { t: "deal" } : null;
}
