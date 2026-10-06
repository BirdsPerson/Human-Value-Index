// HEARTS: four at a table, you and three figures on file. A pure, deterministic rules engine:
// newHearts(cfg) and the same inputs give the same game in any engine; a game is {cfg, log} and
// replay(cfg, log) re-plays it, the figures' every choice included (their generator is in the state).
//
// Seats: 0 you (south), 1 west, 2 north, 3 east; play goes clockwise 0 -> 1 -> 2 -> 3. The rules,
// Windows Hearts' (1992) as most people learned them:
//   - the pass: three cards left, right, across, then a hand with no pass, in turn;
//   - the two of clubs leads the first trick; no hearts and no queen of spades on the first trick
//     unless a hand holds nothing else;
//   - follow suit if you can; hearts may not be led until one has been played ("broken"), unless
//     a hand holds only hearts;
//   - a heart is a point, the queen of spades thirteen; take all twenty-six (shoot the moon) and
//     everyone else takes twenty-six instead;
//   - the game ends when someone reaches the target (100) at the end of a hand; the fewest wins.
//
// Inputs (the log): {t: "pass", cards: [c, c, c]}, {t: "play", c}, {t: "next"} (deal the next hand).
// apply(st, input) -> the next state (the figures' turns played out up to yours), or null if illegal.
// st.events: what happened in that step, in order, for the page to animate and announce:
//   {k: "pass", dir, got: [c...]}, {k: "play", p, c}, {k: "trick", p, pts}, {k: "broken"},
//   {k: "hand", pts: [..4], moon: p | -1}, {k: "game", winners: [p...]}, {k: "deal", hand, dir}.

import { SP, HE, CL, card, rankOf, suitOf, fnv, draw, shuffleInto, fullDeck, sortHand, clone, trickWinner } from "./deck.js";

export const VERSION = 1;
export const QS = card(10, SP);
export const TWO_C = card(0, CL);
export const PASS_DIRS = ["left", "right", "across", "hold"];
export const passTarget = (p, dir) => (dir === "left" ? (p + 1) % 4 : dir === "right" ? (p + 3) % 4 : dir === "across" ? (p + 2) % 4 : p);
export const pointsOf = (c) => (c === QS ? 13 : suitOf(c) === HE ? 1 : 0);

// cfg: {seed, seats: [_, {key, rating 0..99, temper 0..1} x3], target}
// opts.step: leave the figures' turns for step() (the page plays them one at a time, with a pause).
export function newHearts(cfg, opts = {}) {
  const seed = (cfg.seed >>> 0) || 1;
  const seats = [null, ...[1, 2, 3].map(i => {
    const s = cfg.seats?.[i] || {};
    return { key: String(s.key || `cpu-${i}`), rating: Math.max(0, Math.min(99, Math.round(s.rating ?? 60))), temper: Math.max(0, Math.min(1, Number(s.temper ?? 0.5))) };
  })];
  const target = [50, 100].includes(cfg.target) ? cfg.target : 100;
  const st = { v: VERSION, cfg: { v: VERSION, seed, seats, target }, rng: fnv(`hearts|${seed}`), hand: 0, scores: [0, 0, 0, 0], events: [] };
  deal(st);
  if (!opts.step) advance(st);
  return st;
}

function deal(st) {
  const deck = shuffleInto(st, fullDeck());
  st.hands = [0, 1, 2, 3].map(p => sortHand(deck.slice(p * 13, p * 13 + 13)));
  st.dir = PASS_DIRS[st.hand % 4];
  st.trick = []; st.taken = [[], [], [], []]; st.tricks = 0; st.broken = false; st.played = []; st.last = null;
  st.handPts = null; st.moon = -1; st.moonTry = [false, false, false, false];
  st.events.push({ k: "deal", hand: st.hand, dir: st.dir });
  if (st.dir === "hold") startPlay(st);
  else st.phase = "pass";
}
function startPlay(st) {
  st.phase = "play";
  st.leader = st.turn = st.hands.findIndex(h => h.includes(TWO_C));
  for (let p = 1; p < 4; p++) st.moonTry[p] = wantsMoon(st, p);
}

// ---- the rules ----------------------------------------------------------------------------------
export function legal(st, p) {
  if (st.phase !== "play" || st.turn !== p) return [];
  const hand = st.hands[p];
  if (!st.trick.length) {
    if (st.tricks === 0) return hand.includes(TWO_C) ? [TWO_C] : hand.slice();
    if (!st.broken) { const nh = hand.filter(c => suitOf(c) !== HE); if (nh.length) return nh; }
    return hand.slice();
  }
  const led = suitOf(st.trick[0].c);
  const same = hand.filter(c => suitOf(c) === led);
  if (same.length) return same;
  if (st.tricks === 0) {
    const safe = hand.filter(c => !pointsOf(c));
    if (safe.length) return safe;
    const hearts = hand.filter(c => c !== QS);
    if (hearts.length) return hearts;
  }
  return hand.slice();
}

function play(st, p, c) {
  st.hands[p] = st.hands[p].filter(x => x !== c);
  st.trick.push({ p, c });
  st.played.push(c);
  st.events.push({ k: "play", p, c });
  if (suitOf(c) === HE && !st.broken) { st.broken = true; st.events.push({ k: "broken" }); }
  st.turn = (p + 1) % 4;
  if (st.trick.length < 4) return;
  const w = trickWinner(st.trick);
  const pts = st.trick.reduce((a, t) => a + pointsOf(t.c), 0);
  for (const t of st.trick) st.taken[w].push(t.c);
  st.last = { trick: st.trick, w };
  st.events.push({ k: "trick", p: w, pts, cards: st.trick.map(t => t.c) });
  if (pts) for (let q = 1; q < 4; q++) if (q !== w) st.moonTry[q] = false;
  st.trick = []; st.tricks++; st.leader = st.turn = w;
  if (st.tricks === 13) endHand(st);
}

export const takenPoints = (st, p) => st.taken[p].reduce((a, c) => a + pointsOf(c), 0);
function endHand(st) {
  let pts = [0, 1, 2, 3].map(p => takenPoints(st, p));
  const moon = pts.indexOf(26);
  if (moon >= 0) pts = pts.map((_, p) => (p === moon ? 0 : 26));
  st.handPts = pts; st.moon = moon;
  st.scores = st.scores.map((s, p) => s + pts[p]);
  st.events.push({ k: "hand", pts, moon });
  if (Math.max(...st.scores) >= st.cfg.target) {
    const lo = Math.min(...st.scores);
    st.phase = "over"; st.winners = [0, 1, 2, 3].filter(p => st.scores[p] === lo);
    st.events.push({ k: "game", winners: st.winners });
  } else st.phase = "scored";
}

// ---- inputs -------------------------------------------------------------------------------------
export function apply(st0, a, opts = {}) {
  if (!a || typeof a !== "object") return null;
  const st = clone(st0); st.events = [];
  if (a.t === "pass") {
    if (st.phase !== "pass" || !Array.isArray(a.cards) || a.cards.length !== 3) return null;
    const cs = a.cards.map(Number);
    if (new Set(cs).size !== 3 || !cs.every(c => st.hands[0].includes(c))) return null;
    const out = [cs, ...[1, 2, 3].map(p => cpuPass(st, p))];
    const got = [[], [], [], []];
    out.forEach((cards, p) => { got[passTarget(p, st.dir)] = cards; });
    for (let p = 0; p < 4; p++) st.hands[p] = sortHand(st.hands[p].filter(c => !out[p].includes(c)).concat(got[p]));
    st.events.push({ k: "pass", dir: st.dir, gave: cs, got: got[0] });
    startPlay(st);
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
// The figures play until it is your turn, or the hand is over.
function advance(st) {
  let guard = 0;
  while (st.phase === "play" && st.turn !== 0 && guard++ < 60) play(st, st.turn, cpuPlay(st, st.turn));
}

// One figure's turn (the page's pacing): -> the next state, or null when it is your turn or nothing moves.
export function step(st0) {
  if (st0.phase !== "play" || st0.turn === 0) return null;
  const st = clone(st0); st.events = [];
  play(st, st.turn, cpuPlay(st, st.turn));
  return st;
}
export const waiting = (st) => st.phase === "play" && st.turn !== 0;

export function replay(cfg, log) {
  let st = newHearts(cfg);
  for (const a of log || []) { const n = apply(st, a); if (!n) return null; st = n; }
  return st;
}

// ---- the figures --------------------------------------------------------------------------------
// rating 0..99: how well they play (a low rating slips: some choices at random); temper 0..1: how
// bold (passing for a run at the moon, holding the queen of spades, leading spades to flush her).
const prof = (st, p) => st.cfg.seats[p];
const slips = (st, p) => draw(st, 1000) < Math.max(0, 70 - prof(st, p).rating) * 4;   // rating 70+: never

function wantsMoon(st, p) {
  const h = st.hands[p], { temper, rating } = prof(st, p);
  if (temper < 0.6 || rating < 55) return false;
  const hearts = h.filter(c => suitOf(c) === HE), highH = hearts.filter(c => rankOf(c) >= 9).length;
  const highs = h.filter(c => rankOf(c) >= 11).length;
  return hearts.length >= 6 && highH >= 3 && highs >= 5 && (h.includes(QS) || h.includes(card(12, SP)));
}

export function cpuPass(st, p) {
  const h = st.hands[p], { temper } = prof(st, p);
  const len = (s) => h.filter(c => suitOf(c) === s).length;
  const spades = len(SP);
  const danger = (c) => {
    const r = rankOf(c), s = suitOf(c);
    if (c === QS) return spades >= 5 ? 5 : 100;
    if (s === SP && r > 10) return h.includes(QS) || spades >= 5 ? 10 : 90 - (temper > 0.7 ? 30 : 0);
    if (s === SP) return r;
    if (s === HE) return 40 + r * 3;
    const l = len(s);
    return r * 3 + (l <= 2 ? 25 : l === 3 ? 8 : 0);
  };
  let order = h.slice().sort((a, b) => danger(b) - danger(a) || b - a);
  if (wantsMoon(st, p)) order = h.slice().sort((a, b) => rankOf(a) - rankOf(b) || a - b);   // keep the big ones
  if (slips(st, p)) { const pool = order.slice(0, 6); return shuffleInto(st, pool).slice(0, 3); }
  return order.slice(0, 3);
}

const out = (st, c, p) => !st.played.includes(c) && !st.hands[p].includes(c);
export function cpuPlay(st, p) {
  const L = legal(st, p);
  if (L.length === 1) return L[0];
  if (slips(st, p)) return L[draw(st, L.length)];
  const h = st.hands[p], moon = st.moonTry[p];
  const lo = (cs) => cs.reduce((a, b) => (rankOf(b) < rankOf(a) ? b : a));
  const hi = (cs) => cs.reduce((a, b) => (rankOf(b) > rankOf(a) ? b : a));
  const qsOut = out(st, QS, p);
  // leading
  if (!st.trick.length) {
    if (moon) return hi(L);
    const bySuit = (s) => L.filter(c => suitOf(c) === s);
    // flush the queen: lead low spades when she is out and we hold nothing above her
    if (qsOut && !h.some(c => suitOf(c) === SP && rankOf(c) >= 10) && bySuit(SP).length && prof(st, p).temper >= 0.4) return lo(bySuit(SP));
    const safe = L.filter(c => c !== QS && !(suitOf(c) === SP && rankOf(c) > 10 && qsOut));
    const pool = safe.length ? safe : L;
    // the shortest side suit's lowest card (toward a void), hearts only if low
    const score = (c) => rankOf(c) * 4 + h.filter(x => suitOf(x) === suitOf(c)).length + (suitOf(c) === HE ? 6 : 0);
    return pool.reduce((a, b) => (score(b) < score(a) ? b : a));
  }
  const led = suitOf(st.trick[0].c);
  const winning = st.trick.filter(t => suitOf(t.c) === led).reduce((a, b) => (rankOf(b.c) > rankOf(a.c) ? b : a)).c;
  const pts = st.trick.reduce((a, t) => a + pointsOf(t.c), 0);
  const last = st.trick.length === 3;
  // a run at the moon: take everything
  if (moon) { const over = L.filter(c => suitOf(c) === led && rankOf(c) > rankOf(winning)); return over.length ? hi(over) : lo(L); }
  // stop someone else's run: late in the hand, one player holding every point
  const tp = [0, 1, 2, 3].map(q => takenPoints(st, q)), total = tp.reduce((a, b) => a + b, 0);
  const runner = tp.findIndex(x => x > 0 && x === total);
  const blocking = runner >= 0 && runner !== p && total >= 12 && st.tricks >= 6 && prof(st, p).rating >= 60;
  if (suitOf(L[0]) === led) {
    if (blocking && pts > 0) { const over = L.filter(c => rankOf(c) > rankOf(winning)); if (over.length) return lo(over); }
    if (led === SP && L.includes(QS) && rankOf(winning) > 10) return QS;   // the queen, onto a king or an ace
    const under = L.filter(c => rankOf(c) < rankOf(winning) && c !== QS);
    if (under.length) return hi(under);                                     // duck as high as possible
    const noQ = L.filter(c => c !== QS);
    if (last && pts === 0) return hi(noQ.length ? noQ : L);                 // it is ours anyway: shed the biggest
    return lo(noQ.length ? noQ : L);
  }
  // void: discard
  if (blocking && pts > 0) return lo(L);
  if (L.includes(QS)) return QS;
  const bigSpades = L.filter(c => suitOf(c) === SP && rankOf(c) > 10);
  if (bigSpades.length && qsOut) return hi(bigSpades);
  const hearts = L.filter(c => suitOf(c) === HE);
  if (hearts.length) return hi(hearts);
  // the highest card, from the shortest suit
  const score = (c) => rankOf(c) * 3 - h.filter(x => suitOf(x) === suitOf(c)).length * 2;
  return L.reduce((a, b) => (score(b) > score(a) ? b : a));
}

// The player's own helper (the page's HINT): what a careful figure would do in your seat.
export function hintFor(st) {
  if (st.phase === "pass") return cpuPass(clone({ ...st, cfg: { ...st.cfg, seats: [{ key: "you", rating: 99, temper: 0.3 }, ...st.cfg.seats.slice(1)] } }), 0);
  if (st.phase === "play" && st.turn === 0) {
    const s = clone(st); s.cfg.seats[0] = { key: "you", rating: 99, temper: 0.3 }; s.moonTry = [false, false, false, false];
    return cpuPlay(s, 0);
  }
  return null;
}
