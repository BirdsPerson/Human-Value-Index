// SPADES: two partnerships, you (south) and the figure across from you (north) against west and
// east. A pure, deterministic rules engine like hearts.js: newSpades(cfg) + the log replay the game.
//
// The rules (the common American partnership game, as Windows shipped it later; pagat.com's
// "Spades" for the details):
//   - the deal rotates; bidding starts left of the dealer: each bids the tricks they will take,
//     0 = NIL (take none: +100, or -100 if you take one); the partnership's contract is the sum of
//     its non-nil bids;
//   - the player left of the dealer leads; follow suit if you can; spades are trumps, and may not
//     be led until one has been played on another suit ("broken"), unless a hand holds only spades;
//   - make the contract: 10 a trick bid, 1 for each trick over (a BAG); fall short (SET): minus 10
//     a trick bid. A nil bidder's tricks count to the partnership only as bags. Every ten bags
//     cost 100;
//   - first partnership to the target (300 or 500) at the end of a hand wins (the higher, if both);
//     a partnership at -200 or worse loses.
//
// Inputs: {t: "bid", n: 0..13}, {t: "play", c}, {t: "next"}. Events: {k: "bid", p, n}, {k: "play", p, c},
// {k: "broken"}, {k: "trick", p}, {k: "hand", rows: [team rows]}, {k: "game", team}, {k: "deal", hand, dealer}.

import { SP, card, rankOf, suitOf, fnv, draw, shuffleInto, fullDeck, sortHand, clone, trickWinner } from "./deck.js";

export const VERSION = 1;
export const teamOf = (p) => p % 2;            // 0: you and north; 1: west and east
export const partnerOf = (p) => (p + 2) % 4;
export const NIL = 0;

// opts.step: leave the figures' turns for step() (the page plays them one at a time, with a pause).
export function newSpades(cfg, opts = {}) {
  const seed = (cfg.seed >>> 0) || 1;
  const seats = [null, ...[1, 2, 3].map(i => {
    const s = cfg.seats?.[i] || {};
    return { key: String(s.key || `cpu-${i}`), rating: Math.max(0, Math.min(99, Math.round(s.rating ?? 60))), temper: Math.max(0, Math.min(1, Number(s.temper ?? 0.5))) };
  })];
  const target = [300, 500].includes(cfg.target) ? cfg.target : 300;
  const st = { v: VERSION, cfg: { v: VERSION, seed, seats, target }, rng: fnv(`spades|${seed}`), hand: 0, scores: [0, 0], bags: [0, 0], events: [] };
  deal(st);
  if (!opts.step) advance(st);
  return st;
}

function deal(st) {
  const deck = shuffleInto(st, fullDeck());
  st.hands = [0, 1, 2, 3].map(p => sortHand(deck.slice(p * 13, p * 13 + 13)));
  st.dealer = (st.hand + 3) % 4;                // the first hand: you bid first
  st.bids = [null, null, null, null];
  st.won = [0, 0, 0, 0]; st.trick = []; st.tricks = 0; st.broken = false; st.played = []; st.last = null; st.rows = null;
  st.phase = "bid"; st.turn = (st.dealer + 1) % 4;
  st.events.push({ k: "deal", hand: st.hand, dealer: st.dealer });
}

export function legal(st, p) {
  if (st.phase !== "play" || st.turn !== p) return [];
  const hand = st.hands[p];
  if (!st.trick.length) {
    if (!st.broken) { const ns = hand.filter(c => suitOf(c) !== SP); if (ns.length) return ns; }
    return hand.slice();
  }
  const led = suitOf(st.trick[0].c), same = hand.filter(c => suitOf(c) === led);
  return same.length ? same : hand.slice();
}
export const legalBids = (st, p) => {
  if (st.phase !== "bid" || st.turn !== p) return [];
  const partner = st.bids[partnerOf(p)] ?? 0;
  return Array.from({ length: 14 - partner }, (_, n) => n);   // the partnership never bids past 13
};

function bid(st, p, n) {
  st.bids[p] = n;
  st.events.push({ k: "bid", p, n });
  st.turn = (p + 1) % 4;
  if (st.bids.every(b => b !== null)) { st.phase = "play"; st.turn = st.leader = (st.dealer + 1) % 4; }
}
function play(st, p, c) {
  st.hands[p] = st.hands[p].filter(x => x !== c);
  st.trick.push({ p, c }); st.played.push(c);
  st.events.push({ k: "play", p, c });
  if (suitOf(c) === SP && !st.broken) { st.broken = true; st.events.push({ k: "broken" }); }
  st.turn = (p + 1) % 4;
  if (st.trick.length < 4) return;
  const w = trickWinner(st.trick, SP);
  st.won[w]++;
  st.last = { trick: st.trick, w };
  st.events.push({ k: "trick", p: w, cards: st.trick.map(t => t.c) });
  st.trick = []; st.tricks++; st.leader = st.turn = w;
  if (st.tricks === 13) endHand(st);
}

// One partnership's hand: -> {team, bid, took, made, nil: [{p, ok}], pts, bags}
export function scoreTeam(bids, won, team) {
  const ps = [team, team + 2];
  const row = { team, bid: 0, took: 0, made: true, nil: [], pts: 0, bags: 0 };
  let counted = 0;
  for (const p of ps) {
    if (bids[p] === NIL) { const ok = won[p] === 0; row.nil.push({ p, ok }); row.pts += ok ? 100 : -100; row.bags += won[p]; row.pts += won[p]; }
    else { row.bid += bids[p]; counted += won[p]; }
  }
  row.took = ps.reduce((a, p) => a + won[p], 0);
  if (row.bid > 0) {
    if (counted >= row.bid) { row.pts += 10 * row.bid + (counted - row.bid); row.bags += counted - row.bid; }
    else { row.made = false; row.pts -= 10 * row.bid; }
  } else { row.pts += counted; row.bags += counted; }
  return row;
}
function endHand(st) {
  const rows = [0, 1].map(t => scoreTeam(st.bids, st.won, t));
  for (const r of rows) {
    st.scores[r.team] += r.pts; st.bags[r.team] += r.bags;
    r.penalty = 0;
    while (st.bags[r.team] >= 10) { st.bags[r.team] -= 10; st.scores[r.team] -= 100; r.penalty -= 100; }
  }
  st.rows = rows;
  st.events.push({ k: "hand", rows });
  const [a, b] = st.scores, T = st.cfg.target;
  let team = -1;
  if (a >= T || b >= T) team = a === b ? -1 : a > b ? 0 : 1;
  if (team < 0 && (a <= -200 || b <= -200) && a !== b) team = a > b ? 0 : 1;
  if (team >= 0) { st.phase = "over"; st.winner = team; st.events.push({ k: "game", team }); }
  else st.phase = "scored";
}

export function apply(st0, a, opts = {}) {
  if (!a || typeof a !== "object") return null;
  const st = clone(st0); st.events = [];
  if (a.t === "bid") {
    const n = Number(a.n);
    if (!legalBids(st, 0).includes(n)) return null;
    bid(st, 0, n);
  } else if (a.t === "play") {
    const c = Number(a.c);
    if (!legal(st, 0).includes(c)) return null;
    play(st, 0, c);
  } else if (a.t === "next") {
    if (st.phase !== "scored") return null;
    st.hand++; deal(st);
  } else return null;
  if (!opts.step) advance(st);
  return st;
}
function advance(st) {
  let guard = 0;
  while ((st.phase === "bid" || st.phase === "play") && st.turn !== 0 && guard++ < 80) {
    if (st.phase === "bid") bid(st, st.turn, cpuBid(st, st.turn));
    else play(st, st.turn, cpuPlay(st, st.turn));
  }
}
export function step(st0) {
  if ((st0.phase !== "bid" && st0.phase !== "play") || st0.turn === 0) return null;
  const st = clone(st0); st.events = [];
  if (st.phase === "bid") bid(st, st.turn, cpuBid(st, st.turn));
  else play(st, st.turn, cpuPlay(st, st.turn));
  return st;
}
export const waiting = (st) => (st.phase === "bid" || st.phase === "play") && st.turn !== 0;

export function replay(cfg, log) {
  let st = newSpades(cfg);
  for (const a of log || []) { const n = apply(st, a); if (!n) return null; st = n; }
  return st;
}

// ---- the figures --------------------------------------------------------------------------------
const prof = (st, p) => st.cfg.seats[p] || { rating: 99, temper: 0.4 };
const slips = (st, p) => draw(st, 1000) < Math.max(0, 70 - prof(st, p).rating) * 4;

// The tricks a hand should take, counted the way club players count: aces, guarded kings and
// queens, the spade honours, long spades, and short side suits to trump in.
export function estimate(hand) {
  const by = [0, 1, 2, 3].map(s => hand.filter(c => suitOf(c) === s).map(rankOf).sort((a, b) => b - a));
  let est = 0;
  for (const s of [1, 2, 3]) {
    const r = by[s], n = r.length;
    if (r.includes(12)) est += n <= 6 ? 1 : 0.6;
    if (r.includes(11)) est += n >= 2 && n <= 5 ? 0.8 : n === 1 ? 0.25 : 0.4;
    if (r.includes(10) && n >= 3 && n <= 4) est += 0.4;
  }
  const sp = by[SP], ns = sp.length;
  if (sp.includes(12)) est += 1;
  if (sp.includes(11)) est += ns >= 2 ? 0.9 : 0.3;
  if (sp.includes(10)) est += ns >= 3 ? 0.6 : 0.2;
  const honours = sp.filter(r => r >= 10).length;
  if (ns > 3) est += (ns - 3) * 0.8;
  let spare = Math.max(0, ns - honours - (ns > 3 ? ns - 3 : 0));
  for (const s of [1, 2, 3]) {
    if (!spare) break;
    const n = by[s].length;
    const ruff = n === 0 ? 1 : n === 1 ? 0.6 : n === 2 ? 0.3 : 0;
    if (ruff) { est += ruff; spare--; }
  }
  return est;
}
export function nilSafe(hand) {
  const sp = hand.filter(c => suitOf(c) === SP);
  return sp.length <= 3 && !sp.some(c => rankOf(c) >= 9) && !hand.some(c => rankOf(c) >= 11) && hand.filter(c => rankOf(c) >= 9).length <= 2;
}
export function cpuBid(st, p) {
  const h = st.hands[p], { temper, rating } = prof(st, p);
  let est = estimate(h);
  const partner = st.bids[partnerOf(p)];
  const noise = (100 - rating) / 50;
  est += ((draw(st, 1001) / 1000) - 0.5) * noise;
  if (partner !== NIL && est < (temper > 0.6 ? 1.6 : 1.2) && nilSafe(h)) return NIL;
  est += temper > 0.65 ? 0.4 : temper < 0.3 ? -0.3 : 0;
  let n = Math.max(1, Math.round(est));
  if (partner === NIL) n = Math.max(n, Math.round(est + 0.5));   // cover a nil partner: bid what we will take
  return Math.min(n, 13 - (partner ?? 0));
}

// Is c the highest card left in its suit (from p's view)?
const boss = (st, p, c) => { for (let r = rankOf(c) + 1; r <= 12; r++) { const x = card(r, suitOf(c)); if (!st.played.includes(x) && !st.hands[p].includes(x)) return false; } return true; };
export function cpuPlay(st, p) {
  const L = legal(st, p);
  if (L.length === 1) return L[0];
  if (slips(st, p)) return L[draw(st, L.length)];
  const lo = (cs) => cs.reduce((a, b) => (rankOf(b) < rankOf(a) ? b : a));
  const hi = (cs) => cs.reduce((a, b) => (rankOf(b) > rankOf(a) ? b : a));
  const nonSp = (cs) => cs.filter(c => suitOf(c) !== SP);
  const t = teamOf(p), mate = partnerOf(p);
  const myNil = st.bids[p] === NIL && st.won[p] === 0;
  const mateNil = st.bids[mate] === NIL && st.won[mate] === 0;
  const contract = [p, mate].reduce((a, q) => a + (st.bids[q] === NIL ? 0 : st.bids[q]), 0);
  const took = [p, mate].reduce((a, q) => a + (st.bids[q] === NIL ? 0 : st.won[q]), 0);
  const need = contract - took > 0;
  // the trick so far
  const T = st.trick, led = T.length ? suitOf(T[0].c) : -1;
  const winP = T.length ? trickWinner(T, SP) : -1;
  const winC = T.length ? T.find(x => x.p === winP).c : -1;
  const beats = (c) => {
    if (!T.length) return true;
    const ws = suitOf(winC);
    if (suitOf(c) === SP && ws !== SP) return true;
    return suitOf(c) === ws && rankOf(c) > rankOf(winC);
  };
  const last = T.length === 3;
  // NIL: duck everything
  if (myNil) {
    if (!T.length) { const ns = nonSp(L); return lo(ns.length ? ns : L); }
    const under = L.filter(c => !beats(c)), ns = nonSp(under);
    if (under.length) return hi(suitOf(under[0]) === led || !ns.length ? under : ns);
    return lo(L);
  }
  if (!T.length) {
    // lead: a sure winner when we need tricks (or to rescue a nil partner), else low from the longest side suit
    if (need || mateNil) {
      const sure = L.filter(c => boss(st, p, c));
      const sideSure = sure.filter(c => suitOf(c) !== SP);
      if (sideSure.length) return hi(sideSure);
      if (sure.length && st.broken) return hi(sure);
    }
    const ns = nonSp(L), pool = ns.length ? ns : L;
    const len = (c) => st.hands[p].filter(x => suitOf(x) === suitOf(c)).length;
    return pool.reduce((a, b) => (len(b) > len(a) || (len(b) === len(a) && rankOf(b) < rankOf(a)) ? b : a));
  }
  const mateWinning = winP === mate;
  const followers = L.filter(c => suitOf(c) === led);
  // a nil partner who has played and is winning, or who is still to play: take it
  if (mateNil && (mateWinning || !T.some(x => x.p === mate))) {
    const win = L.filter(beats);
    if (win.length) return mateWinning || last ? lo(win) : hi(win);
  }
  if (followers.length) {
    if (mateWinning && (last || boss(st, p, winC))) return lo(followers);
    const win = followers.filter(beats);
    if (need && win.length) {
      if (last) return lo(win);
      const sure = win.filter(c => boss(st, p, c));
      return sure.length ? lo(sure) : lo(followers);
    }
    if (!need) { const under = followers.filter(c => !beats(c)); return under.length ? hi(under) : lo(followers); }
    return lo(followers);
  }
  // void in the suit led: trump, or discard
  const trumps = L.filter(c => suitOf(c) === SP && beats(c));
  if (need && !mateWinning && trumps.length) return lo(trumps);
  const ns = nonSp(L);
  if (ns.length) {
    // discard: the lowest card of the shortest side suit (or the biggest, if we are avoiding bags)
    const len = (c) => st.hands[p].filter(x => suitOf(x) === suitOf(c)).length;
    if (!need) return hi(ns);
    return ns.reduce((a, b) => (len(b) < len(a) || (len(b) === len(a) && rankOf(b) < rankOf(a)) ? b : a));
  }
  const under = L.filter(c => !beats(c));
  return under.length ? hi(under) : lo(L);
}

export function hintFor(st) {
  const s = clone(st); s.cfg.seats[0] = { key: "you", rating: 99, temper: 0.4 };
  if (st.phase === "bid" && st.turn === 0) return { bid: cpuBid(s, 0) };
  if (st.phase === "play" && st.turn === 0) return { c: cpuPlay(s, 0) };
  return null;
}
