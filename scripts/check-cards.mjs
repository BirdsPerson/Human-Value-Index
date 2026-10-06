// THE CARD ROOM (src/play/cards/): the four rules engines are pure and deterministic (the same
// seed deals the same game; a game's input log replays to the same state), the rules hold (hearts:
// the pass, the two of clubs, hearts broken, the first trick, the queen, the moon; spades: bids,
// nil, bags, sets, spades broken; Klondike: alternating colours, kings to empty piles, draw three,
// Vegas passes, the score; Spider: one-suit runs, deals, runs off the table), the figures play by
// their rating, every card has an accessible name and a pixel face, and the deck is sold at
// EASTGATE HOME and plays at home.
// Run: node scripts/check-cards.mjs
import { readFileSync } from "node:fs";

const D = await import("../src/play/cards/deck.js");
const HT = await import("../src/play/cards/hearts.js");
const SPD = await import("../src/play/cards/spades.js");
const K = await import("../src/play/cards/klondike.js");
const SP = await import("../src/play/cards/spider.js");
const ART = await import("../src/play/cards/art.js");
const RO = await import("../src/play/cards/roster.js");
const SH = await import("../src/economy/shops.js");
const FURN = await import("../src/city/furniture.js");

let n = 0, failed = 0;
const ok = (c, msg) => { n++; if (!c) { failed++; console.log(`  FAIL ${msg}`); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const strip = (st) => { const { events, ...rest } = st; return rest; };

// ---- the deck -----------------------------------------------------------------------------------
{
  const a = D.shuffleInto({ rng: D.fnv("x") }, D.fullDeck()), b = D.shuffleInto({ rng: D.fnv("x") }, D.fullDeck()), c = D.shuffleInto({ rng: D.fnv("y") }, D.fullDeck());
  ok(same(a, b) && !same(a, c) && new Set(a).size === 52, "deck: a seeded shuffle is the same shuffle, a different seed a different one, 52 distinct cards");
  ok(D.nameOf(D.card(10, D.SP)) === "queen of spades" && D.nameOfCode("Th") === "ten of hearts" && D.nameOfCode("??") === "face-down card", "deck: accessible names");
  ok(D.codeOf(D.fromCode("Ac")) === "Ac" && D.solRank(D.fromCode("Ad")) === 1 && D.solRank(D.fromCode("Ks")) === 13, "deck: codes round-trip; aces low in solitaire");
  ok(D.trickWinner([{ p: 0, c: D.fromCode("2h") }, { p: 1, c: D.fromCode("Ah") }, { p: 2, c: D.fromCode("Kc") }, { p: 3, c: D.fromCode("3h") }]) === 1, "deck: the highest of the suit led takes the trick");
  ok(D.trickWinner([{ p: 0, c: D.fromCode("Ah") }, { p: 1, c: D.fromCode("2s") }, { p: 2, c: D.fromCode("Kh") }, { p: 3, c: D.fromCode("3s") }], D.SP) === 3, "deck: the highest trump takes it");
}

// ---- hearts ---------------------------------------------------------------------------------------
const SEATS = [null, { key: "a", rating: 80, temper: 0.5 }, { key: "b", rating: 60, temper: 0.8 }, { key: "c", rating: 40, temper: 0.2 }];
function playHearts(cfg, maxSteps = 4000) {
  let st = HT.newHearts(cfg); const log = [];
  for (let k = 0; k < maxSteps && st.phase !== "over"; k++) {
    let a;
    if (st.phase === "pass") a = { t: "pass", cards: HT.hintFor(st) };
    else if (st.phase === "play") a = { t: "play", c: HT.hintFor(st) };
    else a = { t: "next" };
    const nx = HT.apply(st, a);
    if (!nx) return { st, log, stuck: a };
    st = nx; log.push(a);
  }
  return { st, log };
}
{
  const cfg = { seed: 77, seats: SEATS, target: 100 };
  const A = playHearts(cfg), B = playHearts(cfg);
  ok(!A.stuck && A.st.phase === "over", "hearts: a full game to 100 plays out");
  ok(same(strip(A.st), strip(B.st)) && same(A.log, B.log), "hearts: the same seed and inputs give the same game");
  ok(same(strip(HT.replay(A.st.cfg, A.log)), strip(A.st)), "hearts: the log replays to the same game");
  ok(Math.max(...A.st.scores) >= 100 && same(A.st.winners, [0, 1, 2, 3].filter(p => A.st.scores[p] === Math.min(...A.st.scores))), "hearts: over at 100; the fewest points win");
  // invariants, hand by hand
  let st = HT.newHearts({ seed: 5, seats: SEATS }), hands = 0, okPts = true, okLead2c = true, okBroken = true, okFollow = true, okFirst = true, dirs = [];
  for (let k = 0; k < 3000 && st.phase !== "over"; k++) {
    if (st.phase === "pass") { dirs.push(st.dir); st = HT.apply(st, { t: "pass", cards: HT.hintFor(st) }); }
    else if (st.phase === "play") st = HT.apply(st, { t: "play", c: HT.hintFor(st) });
    else { if (st.phase === "scored" && st.hand % 4 === 3) dirs.push("hold"); st = HT.apply(st, { t: "next" }); }
    for (const e of st.events) {
      if (e.k === "hand") { hands++; const s = e.pts.reduce((a, b) => a + b, 0); if (!(e.moon < 0 ? s === 26 : s === 78)) okPts = false; }
    }
  }
  ok(hands >= 3 && okPts, `hearts: every hand deals out 26 points (78 on a moon), ${hands} hands`);
  ok(dirs.slice(0, 4).join() === "left,right,across,hold", `hearts: the pass goes left, right, across, then holds (${dirs.slice(0, 4).join()})`);
  // trick-by-trick rules over many seeded hands, watching every play event
  let plays = 0;
  for (let seed = 1; seed <= 40; seed++) {
    let s = HT.newHearts({ seed, seats: SEATS });
    s = HT.apply(s, { t: "pass", cards: HT.hintFor(s) });
    let broken = false, tricks = 0, trick = [], hands4 = null;
    // reconstruct from events: the state before the human's pass is lost, so watch from here
    const watch = (evs, handsBefore) => {
      for (const e of evs) {
        if (e.k === "play") {
          plays++;
          if (!trick.length) {
            if (tricks === 0 && e.c !== HT.TWO_C) okLead2c = false;
            if (!broken && D.suitOf(e.c) === D.HE && handsBefore[e.p].some(c => D.suitOf(c) !== D.HE)) okBroken = false;
          } else {
            const led = D.suitOf(trick[0].c);
            if (D.suitOf(e.c) !== led && handsBefore[e.p].some(c => D.suitOf(c) === led)) okFollow = false;
            if (tricks === 0 && HT.pointsOf(e.c) && handsBefore[e.p].some(c => D.suitOf(c) !== led && !HT.pointsOf(c) && !handsBefore[e.p].some(x => D.suitOf(x) === led))) okFirst = false;
          }
          handsBefore[e.p] = handsBefore[e.p].filter(c => c !== e.c);
          trick.push(e);
          if (D.suitOf(e.c) === D.HE) broken = true;
        } else if (e.k === "trick") { trick = []; tricks++; }
      }
    };
    // the hands as they were after the pass: the current hands plus what has been played
    hands4 = s.hands.map(h => h.slice());
    for (const e of s.events) if (e.k === "play") hands4[e.p].push(e.c);
    watch(s.events, hands4);
    while (s.phase === "play") {
      const hb = s.hands.map(h => h.slice());
      const nx = HT.apply(s, { t: "play", c: HT.hintFor(s) });
      watch(nx.events, hb);
      s = nx;
    }
  }
  ok(plays > 1500, `hearts: ${plays} plays watched`);
  ok(okLead2c, "hearts: the two of clubs leads the first trick");
  ok(okBroken, "hearts: no heart is led before hearts are broken, unless the hand holds only hearts");
  ok(okFollow, "hearts: everyone follows suit when they can");
  ok(okFirst, "hearts: no points on the first trick when a hand has a choice");
  // the human's illegal plays are refused
  let s = HT.newHearts({ seed: 9, seats: SEATS });
  ok(HT.apply(s, { t: "play", c: s.hands[0][0] }) === null, "hearts: no play during the pass");
  ok(HT.apply(s, { t: "pass", cards: s.hands[0].slice(0, 2) }) === null && HT.apply(s, { t: "pass", cards: [s.hands[1][0], s.hands[0][0], s.hands[0][1]] }) === null, "hearts: the pass is three of your own cards");
  s = HT.apply(s, { t: "pass", cards: s.hands[0].slice(0, 3) });
  ok(s && s.phase === "play", "hearts: after the pass, play begins");
  ok(s.hands.reduce((a, h) => a + h.length, 0) + s.trick.length === 52, "hearts: 52 cards accounted for after the pass");
  const bad = s.hands[0].find(c => !HT.legal(s, 0).includes(c));
  if (bad != null) ok(HT.apply(s, { t: "play", c: bad }) === null, "hearts: an illegal card is refused");
  ok(HT.apply(s, { t: "next" }) === null, "hearts: no next hand mid-hand");
  // the moon, scored
  const moonSt = { taken: [[], [], [], []] };
  moonSt.taken[2] = D.fullDeck().filter(c => HT.pointsOf(c));
  {
    const s2 = HT.newHearts({ seed: 3, seats: SEATS });
    const t = JSON.parse(JSON.stringify(s2)); t.taken = moonSt.taken; t.events = [];
    // drive endHand through a crafted last trick: the public effect is in the 'hand' event
    t.phase = "play"; t.tricks = 12; t.trick = []; t.hands = [[D.fromCode("2c")], [D.fromCode("3c")], [D.fromCode("Ac")], [D.fromCode("4c")]]; t.turn = 0; t.leader = 0; t.played = [];
    t.taken[2] = t.taken[2].filter(c => c !== D.fromCode("2c"));
    const r = HT.apply(t, { t: "play", c: D.fromCode("2c") });
    const h = r.events.find(e => e.k === "hand");
    ok(h && h.moon === 2 && same(h.pts, [26, 26, 0, 26]), "hearts: shooting the moon gives everyone else 26");
  }
  ok(HT.pointsOf(HT.QS) === 13 && HT.pointsOf(D.fromCode("Ah")) === 1 && HT.pointsOf(D.fromCode("Ks")) === 0, "hearts: the queen of spades is 13, a heart is 1");
  // the figures play by their rating: the strong take fewer points than the weak over many hands
  const tot = [0, 0, 0, 0];
  for (let seed = 100; seed < 160; seed++) {
    let g = HT.newHearts({ seed, seats: [null, { key: "x", rating: 99, temper: 0.4 }, { key: "y", rating: 5, temper: 0.4 }, { key: "z", rating: 99, temper: 0.4 }] });
    if (g.phase === "pass") g = HT.apply(g, { t: "pass", cards: HT.hintFor(g) });
    while (g.phase === "play") g = HT.apply(g, { t: "play", c: HT.hintFor(g) });
    g.handPts.forEach((p, i) => { tot[i] += p; });
  }
  ok(tot[2] > tot[1] && tot[2] > tot[3], `hearts: a rating-5 figure takes more points than rating-99 ones (${tot.join("/")})`);
}

// the page's pacing: playing the figures one step at a time is the same game as the engine's own advance
{
  for (const [E, mk, inp] of [[HT, (c) => HT.newHearts(c, { step: true }), (st) => (st.phase === "pass" ? { t: "pass", cards: HT.hintFor(st) } : st.phase === "play" ? { t: "play", c: HT.hintFor(st) } : { t: "next" })],
    [SPD, (c) => SPD.newSpades(c, { step: true }), (st) => { const h = SPD.hintFor(st); return st.phase === "bid" ? { t: "bid", n: h.bid } : st.phase === "play" ? { t: "play", c: h.c } : { t: "next" }; }]]) {
    const cfg = { seed: 2024, seats: SEATS };
    let st = mk(cfg); const log = [];
    const drain = () => { let n; while ((n = E.step(st))) st = n; };
    drain();
    for (let k = 0; k < 400 && st.phase !== "over" && log.length < 120; k++) { const a = inp(st); const nx = E.apply(st, a, { step: true }); if (!nx) break; st = nx; log.push(a); drain(); }
    ok(log.length > 30 && same(strip(E.replay(cfg, log)), strip(st)), `${E === HT ? "hearts" : "spades"}: stepping the figures one at a time replays exactly (${log.length} inputs)`);
  }
}

// ---- spades ---------------------------------------------------------------------------------------
{
  const row = (bids, won, t) => SPD.scoreTeam(bids, won, t);
  let r = row([4, 3, 3, 3], [5, 3, 3, 2], 0);
  ok(r.made && r.pts === 71 && r.bags === 1, `spades: bid 7, took 8: 70 + 1 bag (${r.pts})`);
  r = row([4, 3, 3, 3], [2, 3, 3, 5], 0);
  ok(!r.made && r.pts === -70, `spades: bid 7, took 5: set, -70 (${r.pts})`);
  r = row([0, 3, 4, 3], [0, 3, 5, 5], 0);
  ok(r.pts === 100 + 41 && r.bags === 1, `spades: a nil made +100; the partner's 4 bid took 5 (${r.pts})`);
  r = row([0, 3, 4, 3], [1, 3, 4, 5], 0);
  ok(r.pts === -100 + 40 + 1 && r.bags === 1, `spades: a nil failed -100; its trick is a bag (${r.pts})`);
  // a game: deterministic, replayable, legal
  const cfg = { seed: 41, seats: SEATS, target: 300 };
  function playSpades(cfg) {
    let st = SPD.newSpades(cfg); const log = [];
    for (let k = 0; k < 5000 && st.phase !== "over"; k++) {
      let a;
      const h = SPD.hintFor(st);
      if (st.phase === "bid") a = { t: "bid", n: h.bid };
      else if (st.phase === "play") a = { t: "play", c: h.c };
      else a = { t: "next" };
      const nx = SPD.apply(st, a);
      if (!nx) return { st, log, stuck: a };
      st = nx; log.push(a);
    }
    return { st, log };
  }
  const A = playSpades(cfg), B = playSpades(cfg);
  ok(!A.stuck && A.st.phase === "over", `spades: a full game to 300 plays out (${A.st.scores})`);
  ok(same(strip(A.st), strip(B.st)), "spades: the same seed and inputs give the same game");
  ok(same(strip(SPD.replay(A.st.cfg, A.log)), strip(A.st)), "spades: the log replays to the same game");
  // rules by events
  let okLead = true, okFollow = true, okBids = true, plays = 0, sumErr = 0, nBids = 0;
  for (let seed = 1; seed <= 40; seed++) {
    let s = SPD.newSpades({ seed, seats: SEATS });
    const handsAt = s.hands.map(h => h.slice());
    let broken = false, trick = [];
    const watch = (evs) => {
      for (const e of evs) {
        if (e.k === "bid") { if (!(e.n >= 0 && e.n <= 13)) okBids = false; }
        if (e.k === "play") {
          plays++;
          if (!trick.length) { if (!broken && D.suitOf(e.c) === D.SP && handsAt[e.p].some(c => D.suitOf(c) !== D.SP)) okLead = false; }
          else { const led = D.suitOf(trick[0].c); if (D.suitOf(e.c) !== led && handsAt[e.p].some(c => D.suitOf(c) === led)) okFollow = false; }
          handsAt[e.p] = handsAt[e.p].filter(c => c !== e.c); trick.push(e);
          if (D.suitOf(e.c) === D.SP) broken = true;
        } else if (e.k === "trick") trick = [];
      }
    };
    watch(s.events);
    while (s.phase === "bid" || s.phase === "play") { const h = SPD.hintFor(s); s = SPD.apply(s, s.phase === "bid" ? { t: "bid", n: h.bid } : { t: "play", c: h.c }); watch(s.events); }
    ok(s.won.reduce((a, b) => a + b, 0) === 13, `spades seed ${seed}: 13 tricks`);
    for (const p of [1, 2, 3]) if (s.bids[p] > 0) { sumErr += Math.abs(s.bids[p] - s.won[p]); nBids++; }
  }
  ok(plays >= 40 * 52, `spades: ${plays} plays watched`);
  ok(okLead, "spades: no spade is led before spades are broken, unless the hand holds only spades");
  ok(okFollow, "spades: everyone follows suit when they can");
  ok(okBids, "spades: bids are 0 (nil) to 13");
  ok(sumErr / nBids < 1.6, `spades: the figures bid near what they take (mean miss ${(sumErr / nBids).toFixed(2)})`);
  let s = SPD.newSpades({ seed: 2, seats: SEATS });
  ok(s.phase === "bid" && s.turn === 0, "spades: the first hand, you bid first");
  ok(SPD.apply(s, { t: "bid", n: 14 }) === null && SPD.apply(s, { t: "play", c: s.hands[0][0] }) === null, "spades: no bid over 13; no play while bidding");
  ok(SPD.nilSafe([0, 4, 8, 1, 5, 9, 2, 6, 3, 7, 13, 17, 21]) && !SPD.nilSafe([D.card(12, 0), 4, 8, 1, 5, 9, 2, 6, 3, 7, 13, 17, 21]), "spades: a hand of low cards may bid nil; one with the ace of spades may not");
}

// ---- klondike -------------------------------------------------------------------------------------
{
  const st = K.newKlondike({ seed: 1, draw: 1 });
  ok(st.tab.reduce((a, t) => a + t.down.length + t.up.length, 0) === 28 && st.stock.length === 24 && st.tab.every((t, i) => t.down.length === i && t.up.length === 1), "klondike: 28 dealt in seven piles, 24 in the stock");
  ok(same(K.newKlondike({ seed: 1 }).tab, st.tab) && !same(K.newKlondike({ seed: 2 }).tab, st.tab), "klondike: a seed is a deal");
  let s = K.apply(st, { t: "draw" });
  ok(s.waste.length === 1 && s.stock.length === 23, "klondike: draw one turns one");
  const s3 = K.apply(K.newKlondike({ seed: 1, draw: 3 }), { t: "draw" });
  ok(s3.waste.length === 3, "klondike: draw three turns three");
  // rules on a crafted table
  const C = D.fromCode;
  const t = K.newKlondike({ seed: 1 });
  t.tab[0] = { down: [], up: [C("8h")] }; t.tab[1] = { down: [C("2c")], up: [C("7s")] }; t.tab[2] = { down: [], up: [] }; t.tab[3] = { down: [], up: [C("Kd"), C("Qs")] };
  t.waste = [C("Ac")]; t.found = [[], [], [], []];
  ok(K.accepts(t, "t0", [C("7s")]) && !K.accepts(t, "t0", [C("7d")]) && !K.accepts(t, "t0", [C("6s")]), "klondike: down in alternating colours, one rank at a time");
  ok(K.accepts(t, "t2", [C("Kd"), C("Qs")]) && !K.accepts(t, "t2", [C("Qs")]), "klondike: only a king (or its run) to an empty pile");
  ok(K.accepts(t, "f3", [C("Ac")]) && !K.accepts(t, "f0", [C("Ac")]) && !K.accepts(t, "f3", [C("2c")]), "klondike: aces start their own suit's foundation");
  let u = K.apply(t, { t: "move", from: "t1", to: "t0", n: 1 });
  ok(u && u.tab[1].up.length === 1 && u.tab[1].up[0] === C("2c") && u.score === 5, `klondike: a move turns the card beneath (+5, score ${u?.score})`);
  u = K.apply(u, { t: "move", from: "w", to: "f" });
  ok(u && u.found[3].length === 1 && u.score === 15, "klondike: waste to its foundation +10");
  u = K.apply(u, { t: "move", from: "t1", to: "f" });
  ok(u && u.found[3].length === 2 && u.score === 25 && u.tab[1].up.length === 0, "klondike: tableau to foundation +10");
  u = K.apply(u, { t: "move", from: "t3", to: "t1", n: 2 });
  ok(u && u.tab[1].up.length === 2, "klondike: a king's run to an empty pile");
  const back = K.apply(u, { t: "move", from: "f3", to: "t0" });
  ok(back === null, "klondike: a card off the foundation must fit");
  // the stock cycles; Vegas limits the passes
  const runOut = (cfg) => { let s = K.newKlondike(cfg), passes = 0; for (let k = 0; k < 200; k++) { const n = K.apply(s, { t: "draw" }); if (!n) break; if (n.events.some(e => e.k === "recycle")) passes++; s = n; } return { s, passes }; };
  ok(runOut({ seed: 3, draw: 1, scoring: "standard" }).passes > 5, "klondike: standard, the stock cycles as long as you like");
  ok(runOut({ seed: 3, draw: 1, scoring: "vegas" }).passes === 0, "klondike: Vegas draw one, one pass");
  ok(runOut({ seed: 3, draw: 3, scoring: "vegas" }).passes === 2, "klondike: Vegas draw three, three passes");
  ok(K.newKlondike({ seed: 3, scoring: "vegas" }).score === -52, "klondike: Vegas starts at -52");
  const std = runOut({ seed: 3, draw: 1 }).s; ok(std.score === 0, "klondike: the standard score never goes below zero");
  // the win: a crafted last card
  const w = K.newKlondike({ seed: 4 });
  w.found = [0, 1, 2, 3].map(s => [12, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(r => D.card(r, s)));
  w.found[0].pop(); w.tab = Array.from({ length: 7 }, () => ({ down: [], up: [] })); w.tab[0].up = [D.card(11, 0)]; w.stock = []; w.waste = [];
  ok(K.solved(w) && K.nextHome(w)?.from === "t0", "klondike: solved, the last card goes home");
  const won = K.apply(w, K.nextHome(w));
  ok(won.won && won.events.some(e => e.k === "won"), "klondike: 52 home is a win");
  // replay; a greedy player finishes some deals
  let wins = 0;
  for (let seed = 1; seed <= 60; seed++) {
    let s = K.newKlondike({ seed, draw: 1 }); const log = [];
    for (let k = 0; k < 600 && !s.won; k++) {
      let a = K.nextHome(s);
      if (!a) for (let i = 0; i < 7 && !a; i++) { const tt = s.tab[i]; if (!tt.up.length) continue; const tgt = K.bestTarget(s, `t${i}`, tt.up.length); if (tgt && tgt[0] === "t" && tt.down.length) a = { t: "move", from: `t${i}`, to: tgt, n: tt.up.length }; }
      if (!a && s.waste.length) { const tgt = K.bestTarget(s, "w", 1); if (tgt) a = { t: "move", from: "w", to: tgt, n: 1 }; }
      if (!a) a = { t: "draw" };
      const nx = K.apply(s, a); if (!nx) break; s = nx; log.push(a);
    }
    if (s.won) wins++;
    if (seed === 7) ok(same(strip(K.replay(s.cfg, log)), strip(s)), "klondike: the log replays to the same table");
  }
  ok(wins >= 1, `klondike: a plain greedy player solves some deals (${wins}/60): the deals are fair`);
}

// ---- spider ---------------------------------------------------------------------------------------
{
  for (const suits of [1, 2, 4]) {
    const st = SP.newSpider({ seed: 9, suits });
    const all = [...st.stock, ...st.tab.flatMap(t => [...t.down, ...t.up])];
    ok(all.length === 104 && st.stock.length === 50 && st.tab.slice(0, 4).every(t => t.down.length + t.up.length === 6) && st.tab.slice(4).every(t => t.down.length + t.up.length === 5), `spider ${suits}: 54 dealt (6,6,6,6,5...), 50 in the stock`);
    const bySuit = [0, 1, 2, 3].map(s => all.filter(c => D.suitOf(c) === s).length);
    ok(bySuit.filter(x => x).length === suits && bySuit.filter(x => x).every(x => x === 104 / suits), `spider ${suits}: ${suits} suit(s), evenly`);
  }
  const C = D.card;
  const t = SP.newSpider({ seed: 1, suits: 2 });
  t.tab = Array.from({ length: 10 }, () => ({ down: [C(0, 1)], up: [C(5, 0)] }));
  t.tab[0] = { down: [C(3, 1)], up: [C(8, 0), C(7, 0), C(6, 1)] };   // 10s 9s 8h
  t.tab[1] = { down: [], up: [C(9, 1)] };                              // Jh
  ok(SP.runLen(t, 0) === 1 && !SP.canMove(t, 0, 2, 1), "spider: a mixed-suit stack does not move together");
  t.tab[0].up = [C(8, 0), C(7, 0), C(6, 0)];
  ok(SP.runLen(t, 0) === 3 && SP.canMove(t, 0, 3, 1), "spider: a one-suit run moves together, onto any suit one higher");
  const m = SP.apply(t, { t: "move", from: 0, n: 3, to: 1 });
  ok(m && m.tab[0].up.length === 1 && m.score === 499, "spider: the move turns the card beneath; -1 a move");
  // a run off the table
  const r = SP.newSpider({ seed: 1, suits: 1 });
  r.tab[0] = { down: [C(2, 0)], up: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(k => C(k - 1 < 0 ? 12 : k - 1, 0)).slice(0, 12) };
  // K..2 as solRank 13..2: rank index 11 (K) .. 0 (2)
  r.tab[0].up = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map(k => C(k, 0));
  r.tab[1] = { down: [], up: [C(5, 0), C(12, 0)] };   // an ace on top
  const done = SP.apply(r, { t: "move", from: 1, n: 1, to: 0 });
  ok(done && done.done.length === 1 && done.tab[0].up.length === 1 && done.score === 500 - 1 + 100, `spider: king to ace in one suit goes off the table, +100 (score ${done?.score})`);
  // deals need every pile filled
  const e = SP.newSpider({ seed: 1, suits: 1 });
  ok(SP.canDeal(e), "spider: a deal with every pile filled");
  e.tab[3] = { down: [], up: [] };
  ok(!SP.canDeal(e) && SP.apply(e, { t: "deal" }) === null, "spider: no deal onto an empty pile");
  // the win
  const w = SP.newSpider({ seed: 1, suits: 1 });
  w.done = [0, 0, 0, 0, 0, 0, 0]; w.stock = []; w.tab = Array.from({ length: 10 }, () => ({ down: [], up: [] }));
  w.tab[0].up = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map(k => C(k, 0)); w.tab[1].up = [C(12, 0)];
  const ww = SP.apply(w, { t: "move", from: 1, n: 1, to: 0 });
  ok(ww && ww.won, "spider: eight runs off the table wins");
  // replay
  let s = SP.newSpider({ seed: 12, suits: 1 }); const log = [];
  for (let k = 0; k < 300 && !s.won; k++) { const a = SP.hint(s); if (!a) break; const nx = SP.apply(s, a); if (!nx) break; s = nx; log.push(a); }
  ok(log.length > 20 && same(strip(SP.replay(s.cfg, log)), strip(s)), `spider: the log replays to the same table (${log.length} inputs, ${s.done.length} runs off)`);
}

// ---- the pixel cards ------------------------------------------------------------------------------
{
  let all = true, named = true, distinct = new Set();
  for (let c = 0; c < 52; c++) {
    const code = D.codeOf(c);
    const L = ART.cardLayers(code, { four: false });
    if (!L.length || L.some(l => !/^#[0-9a-f]{6}$/i.test(l.fill) || !l.rects.length)) all = false;
    for (const l of L) for (const [x, y, w, h] of l.rects) if (x < 0 || y < 0 || x + w > ART.CW || y + h > ART.CH) all = false;
    distinct.add(JSON.stringify(L));
    if (!/^(two|three|four|five|six|seven|eight|nine|ten|jack|queen|king|ace) of (spades|hearts|diamonds|clubs)$/.test(D.nameOfCode(code))) named = false;
  }
  ok(all, "pixel cards: every face draws inside the card, in solid colours");
  ok(distinct.size === 52, "pixel cards: 52 different faces");
  ok(named, "pixel cards: every card has an accessible name");
  const four = ART.cardLayers("Qd", { four: true }).map(l => l.fill), two = ART.cardLayers("Qd", { four: false }).map(l => l.fill);
  ok(!same(four, two), "pixel cards: the four-colour deck changes diamonds");
  ok(ART.backLayers("dept").length && ART.backLayers("eb").length, "pixel cards: two backs (the Department's, the EB house deck)");
  // contrast: every ink on the card's face is AA (4.5:1) against the paper
  const lum = (hex) => { const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const four of [false, true]) for (const s of [0, 1, 2, 3]) {
    const ink = ART.suitInk(s, four);
    ok(ratio(ink, ART.PAPER) >= 4.5, `pixel cards: ${four ? "four" : "two"}-colour ${D.SUIT_WORD[s]} ink ${ink} is AA on the paper (${ratio(ink, ART.PAPER).toFixed(2)}:1)`);
  }
}

// ---- the figures at the tables --------------------------------------------------------------------
{
  ok(RO.FIGURES.length >= 12 && RO.FIGURES.every(f => f.key && f.name && f.rating >= 0 && f.rating <= 99 && f.temper >= 0 && f.temper <= 1), "roster: figures with ratings and tempers");
  ok(RO.FIGURES.every(f => readFileSync(new URL(`../public/sprites/${f.key}.png`, import.meta.url)).length > 0), "roster: every figure has a file photo to cut a head from");
  ok(RO.FIGURES.filter(f => !f.past).every(f => !RO.emoteFor(f, "win", 0) && !RO.emoteFor(f, "moon", 0)), "roster: figures on the living register never emote");
  ok(RO.FIGURES.filter(f => f.past).some(f => RO.emoteFor(f, "win", 0)), "roster: the others may emote, silently");
  const allEmotes = RO.FIGURES.flatMap(f => ["start", "win", "lose", "moon", "set"].map(m => RO.emoteFor(f, m, 0)?.text || ""));
  ok(allEmotes.every(t => !/["“”]|\bSAYS\b|\bSPEAKS\b/.test(t)), "roster: an emote is silent (no quotation, nothing said)");
  for (const at of ["casino", "bar", "union", "home"]) {
    const tables = RO.tablesFor(at, "2026-10-05");
    ok(tables.length === 3 && tables.every(t => t.seats.length === 3 && new Set(t.seats.map(s => s.key)).size === 3), `roster: ${at} has three tables of three`);
    ok(same(tables, RO.tablesFor(at, "2026-10-05")), `roster: ${at}'s tables are the day's (deterministic)`);
  }
}

// ---- the deck of cards: sold at EASTGATE HOME, played at home -------------------------------------
{
  ok(SH.FURNITURE_PRICES.deck >= 50 && SH.FURNITURE_PRICES.deck <= 60 && FURN.CATALOG.deck?.name === "DECK OF CARDS", "the DECK OF CARDS: in the catalog, ~50 CYCLES");
  ok(SH.FURNITURE_PRICES["deck-eb"] >= 300 && SH.FURNITURE_PRICES["deck-eb"] <= 500, "the EB house deck: ~400 CYCLES");
  ok(SH.itemOf("f:deck")?.store === "eastgate-home" && SH.onSale("f:deck", 617) && SH.onSale("f:deck-eb", 617), "the decks are on sale at EASTGATE HOME");
  ok(SH.PLAY_AT_HOME.deck?.go?.startsWith("#cards") && SH.PLAY_AT_HOME["deck-eb"]?.go?.startsWith("#cards"), "a deck on your table plays SOLITAIRE and SPIDER");
  ok(SH.chainOf("deck").join() === "deck,card-table,poker-table", "the upgrade chain: deck -> card table -> poker table");
  ok(RO.DECK_ITEMS.every(id => FURN.CATALOG[id]) && RO.ownsDeck([{ kind: "furn", ref: "card-table" }]) && !RO.ownsDeck([{ kind: "furn", ref: "sofa" }]) && !RO.ownsDeck(null), "owning a deck (or what it became) opens the home games");
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  ok(/routePath === "#cards"/.test(app) && /lazy\(\(\) => import\("\.\/play\/cards\/Cards\.jsx"\)\)/.test(app), "App.jsx serves #cards, lazily");
  const games = readFileSync(new URL("../src/play/games.js", import.meta.url), "utf8");
  ok(/href: "#cards"/.test(games), "the #play grid has a CARDS tile");
}

// ---- the card tables in the city (src/casino/cityRooms.js): a tap sits you at that room's tables
{
  const CR = await import("../src/casino/cityRooms.js");
  const plan = (type) => ({ type, sw: 32, h: 100, rows: [{ s: 1, y: 60, items: [{ prop: "cardTable", x0: 0, x1: 40 }] }] });
  ok(CR.casinoTap(plan("bar"), 20, 50) === "#cards?at=bar" && CR.casinoTap(plan("union"), 20, 50) === "#cards?at=union" && CR.casinoTap(plan("casinoTables"), 20, 50) === "#cards?at=casino", "city: a card table opens its room's card tables");
  ok(CR.casinoTap(plan("office"), 20, 50) === null, "city: no card tables where there are none");
  const P = await import("../src/city/props.js");
  for (const t of ["casinoTables", "bar", "union", "brewpub"]) {
    const plan = P.roomPlan(t, 640, 90, 34, 12);
    ok(plan.rows.some(r => r.items.some(it => it.prop === "cardTable")) && CR.casinoHits(plan).some(h => h.go.startsWith("#cards?at=")), `city: a card table stands in ${t}, and takes a tap`);
  }
}

// ---- a casual human at the easiest table (Scott, 2026-10-06: the sports games are too hard) -------------------
// A simple heuristic player (hearts: pass the queen and the highest cards, duck high, dump the queen and hearts when
// void; spades: bid the estimate, win cheaply or play low) should win a fair share against the room's three weakest
// figures at FRIENDLY ratings (RO.FRIENDLY_CAP): hearts >= 40% of games on average, and a spread of rooms.
{
  const { rankOf, suitOf } = D;
  function simplePass(h){ const o=h.slice().sort((a,b)=>(b===HT.QS)-(a===HT.QS)||rankOf(b)-rankOf(a)); return o.slice(0,3); }
  function simplePlay(st){
    const L=HT.legal(st,0); if(L.length===1)return L[0];
    const lo=(cs)=>cs.reduce((a,b)=>rankOf(b)<rankOf(a)?b:a), hi=(cs)=>cs.reduce((a,b)=>rankOf(b)>rankOf(a)?b:a);
    if(!st.trick.length) return lo(L);
    const led=suitOf(st.trick[0].c);
    if(suitOf(L[0])===led){ const win=st.trick.filter(t=>suitOf(t.c)===led).reduce((a,b)=>rankOf(b.c)>rankOf(a.c)?b:a).c; const un=L.filter(c=>rankOf(c)<rankOf(win)&&c!==HT.QS); return un.length?hi(un):lo(L.filter(c=>c!==HT.QS).length?L.filter(c=>c!==HT.QS):L); }
    if(L.includes(HT.QS))return HT.QS; const he=L.filter(c=>suitOf(c)===D.HE); return he.length?hi(he):hi(L);
  }
  function heartsGame(seed,seats,target=100){
    let g=HT.newHearts({seed,seats:[null,...seats],target}); let n=0;
    while(g.phase!=="over"&&n++<5000){
      if(g.phase==="pass")g=HT.apply(g,{t:"pass",cards:simplePass(g.hands[0])});
      else if(g.phase==="play")g=HT.apply(g,{t:"play",c:simplePlay(g)});
      else if(g.phase==="scored")g=HT.apply(g,{t:"next"});
      else break;
    }
    return g;
  }
  
  function simpleSpadesPlay(st){
    const L=SPD.legal(st,0); if(L.length===1)return L[0];
    const lo=(cs)=>cs.reduce((a,b)=>rankOf(b)<rankOf(a)?b:a);
    if(!st.trick.length) return lo(L);
    const led=suitOf(st.trick[0].c);
    const best=st.trick.reduce((a,b)=>{const ka=(suitOf(a.c)===0?100:0)+(suitOf(a.c)===led||suitOf(a.c)===0?rankOf(a.c):-1);const kb=(suitOf(b.c)===0?100:0)+(suitOf(b.c)===led||suitOf(b.c)===0?rankOf(b.c):-1);return kb>ka?b:a;});
    const key=(c)=>(suitOf(c)===0?100:0)+(suitOf(c)===led||suitOf(c)===0?rankOf(c):-1);
    const win=L.filter(c=>key(c)>key(best.c));
    return win.length?lo(win):lo(L);
  }
  function spadesGame(seed,seats,target){
    let g=SPD.newSpades({seed,seats:[null,...seats],target}),n=0;
    while(g.phase!=="over"&&n++<5000){
      if(g.phase==="bid"){const ls=SPD.legalBids(g,0);let b=Math.max(1,Math.round(SPD.estimate(g.hands[0])));if(!ls.includes(b))b=ls.find(x=>x>=1)??ls[0];g=SPD.apply(g,{t:"bid",n:b});}
      else if(g.phase==="play")g=SPD.apply(g,{t:"play",c:simpleSpadesPlay(g)});
      else if(g.phase==="scored")g=SPD.apply(g,{t:"next"});
      else break;
    }
    return g;
  }
  
  const easiest = (r) => r.pool.map(x => RO.FIGURE_BY.get(x)).sort((a, b) => a.rating - b.rating).slice(0, 3);
  let hw = 0, hn = 0, sw = 0, sn = 0;
  const per = [];
  for (const [k, r] of Object.entries(RO.ROOMS)) {
    const seats = RO.friendlySeats(easiest(r).map(s => ({ key: s.key, rating: s.rating, temper: s.temper })), true);
    let w = 0; const N = 60;
    for (let i = 0; i < N; i++) { const g = heartsGame(1000 + i * 7, seats, 100); if (g.winners.includes(0)) w++; }
    per.push(`${k} ${(w / N * 100).toFixed(0)}%`); hw += w; hn += N;
    let w2 = 0; for (let i = 0; i < 40; i++) { const g = spadesGame(3000 + i * 7, seats, 300); if (g.scores[0] > g.scores[1]) w2++; }
    sw += w2; sn += 40;
  }
  ok(hw / hn >= 0.40, `a simple hearts player wins ${(hw / hn * 100).toFixed(0)}% of games at the easiest friendly tables (>= 40%): ${per.join(", ")}`);
  ok(sw / sn >= 0.35, `a simple spades player's team wins ${(sw / sn * 100).toFixed(0)}% of games at the easiest friendly tables (>= 35%)`);
  if (process.env.VERBOSE) console.log(`  casual hearts ${(hw / hn * 100).toFixed(0)}% (${per.join(", ")}), spades ${(sw / sn * 100).toFixed(0)}%`);
}

console.log(failed ? `check-cards: ${failed} of ${n} FAILED` : `check-cards: ${n} checks passed`);
process.exit(failed ? 1 : 0);
