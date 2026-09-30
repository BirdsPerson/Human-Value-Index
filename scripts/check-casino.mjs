// HOUSE EDGE CASINO: the math and the money. Roulette payouts per bet type and the exact
// edge; blackjack rules (S17, 3:2, double, split once, insurance, reshuffle) and a basic-
// strategy Monte Carlo; the baccarat tableau, exhaustively, and its exact 8-deck edges; the
// poker evaluator on known hands, side pots, and thousands of random hands conserving chips;
// then /api/casino on in-memory Blobs: allowance, limits, the high limit room, CAS under
// concurrent requests, and that no purchase / cash-out / transfer path exists.
// Run: node scripts/check-casino.mjs
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync, readdirSync } from "node:fs";

globalThis.__blobs = new Map();
const blobsSrc = `
let n = 0;
export function getStore({ name }) {
  const m = globalThis.__blobs;
  if (!m.has(name)) m.set(name, new Map());
  const s = m.get(name);
  const read = k => (s.has(k) ? JSON.parse(JSON.stringify(s.get(k).data)) : null);
  const tick = () => new Promise(r => setImmediate(r));
  return {
    async get(k) { await tick(); return read(k); },
    async getWithMetadata(k) { await tick(); return s.has(k) ? { data: read(k), etag: s.get(k).etag, metadata: {} } : null; },
    async setJSON(k, v, o = {}) {
      await tick();
      if (o.onlyIfNew && s.has(k)) return { modified: false };
      if (o.onlyIfMatch && (!s.has(k) || s.get(k).etag !== o.onlyIfMatch)) return { modified: false };
      const etag = "e" + ++n; s.set(k, { data: JSON.parse(JSON.stringify(v)), etag }); return { modified: true, etag };
    },
    async delete(k) { s.delete(k); },
    async list({ prefix = "" } = {}) { return { blobs: [...s.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; },
  };
}`;
registerHooks({ resolve(spec, ctx, next) { return spec === "@netlify/blobs" ? { url: "data:text/javascript," + encodeURIComponent(blobsSrc), shortCircuit: true } : next(spec, ctx); } });
const __err = console.error; console.error = console.warn = (...a) => { if (process.env.DEBUG_CHECK) __err(...a); };

const R = await import("../src/casino/rules.js");
const G = await import("../netlify/lib/casino-games.js");
const P = await import("../netlify/lib/casino-poker.js");
const F = await import("../netlify/lib/casino-figures.js");

let checks = 0;
const ok = (c, m) => { checks++; assert.ok(c, m); };
// A seeded generator, so the Monte Carlo figures are reproducible (the server uses node:crypto).
function seeded(seed) {
  let a = seed >>> 0;
  const f = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { rnd: f, rng: (n) => Math.floor(f() * n) };
}

// ==== ROULETTE ============================================================================================
{
  ok(R.WHEEL.length === 37 && new Set(R.WHEEL).size === 37 && R.WHEEL[0] === 0, "wheel: 37 distinct pockets from zero");
  ok(R.RED.size === 18 && R.colorOf(0) === "green" && R.colorOf(32) === "red" && R.colorOf(15) === "black", "wheel colours");
  // alternate colours round the wheel
  for (let i = 1; i < 36; i++) ok(R.colorOf(R.WHEEL[i]) !== R.colorOf(R.WHEEL[i + 1]), `wheel alternates at ${i}`);
  const count = (type, k) => {
    let n = 0; const all = Array.from({ length: 37 }, (_, i) => i);
    const rec = (start, pick) => {
      if (pick.length === k) { if (R.coverOf({ type, n: pick.slice() })) n++; return; }
      for (let i = start; i < 37; i++) { pick.push(all[i]); rec(i + 1, pick); pick.pop(); }
    };
    rec(0, []); return n;
  };
  ok(count("straight", 1) === 37, "37 straights");
  ok(count("split", 2) === 60, "60 splits (24 across, 33 up, 3 on the zero)");
  ok(count("street", 3) === 14, "14 streets (12 rows, 2 zero trios)");
  ok(count("corner", 4) === 23, "23 corners (22 squares and the first four)");
  let lines = 0; for (let a = 0; a <= 31; a++) if (R.coverOf({ type: "line", n: Array.from({ length: 6 }, (_, i) => a + i) })) lines++;
  ok(lines === 11, "11 six-lines");
  for (const bad of [{ type: "split", n: [3, 4] }, { type: "split", n: [0, 4] }, { type: "street", n: [2, 3, 4] }, { type: "corner", n: [3, 4, 6, 7] }, { type: "line", n: [2, 3, 4, 5, 6, 7] }, { type: "straight", n: [37] }, { type: "dozen", k: 4 }, { type: "column", k: 0 }, { type: "lucky" }, { type: "straight", n: [1.5] }])
    ok(R.coverOf(bad) === null, `not a bet: ${JSON.stringify(bad)}`);
  const pays = { straight: [[17], 35], split: [[17, 20], 17], street: [[13, 14, 15], 11], corner: [[13, 14, 16, 17], 8], line: [[13, 14, 15, 16, 17, 18], 5] };
  for (const [t, [n, p]] of Object.entries(pays)) ok(R.payoutOf({ type: t, n }) === p, `${t} pays ${p}:1`);
  ok(R.payoutOf({ type: "dozen", k: 2 }) === 2 && R.payoutOf({ type: "column", k: 3 }) === 2, "dozens and columns pay 2:1");
  for (const t of ["red", "black", "odd", "even", "low", "high"]) ok(R.payoutOf({ type: t }) === 1 && R.coverOf({ type: t }).length === 18, `${t} pays 1:1 on 18`);
  ok(!R.coverOf({ type: "red" }).includes(0) && !R.coverOf({ type: "even" }).includes(0), "zero loses the outside bets");
  // settle: the exact return over the 37 pockets is 36/37 of the stake for every bet type
  const every = [{ type: "straight", n: [0] }, { type: "split", n: [0, 2] }, { type: "street", n: [0, 2, 3] }, { type: "corner", n: [0, 1, 2, 3] }, { type: "line", n: [31, 32, 33, 34, 35, 36] },
    { type: "dozen", k: 3 }, { type: "column", k: 1 }, ...["red", "black", "odd", "even", "low", "high"].map(type => ({ type }))];
  for (const b of every) {
    let back = 0; for (let n = 0; n <= 36; n++) back += G.settleRoulette([{ ...b, amount: 100 }], n).returned;
    ok(back === 3600, `${R.betLabel(b)}: returns 3600 of 3700 staked over the wheel (edge 1/37)`);
  }
  // Monte Carlo on the server's own RNG (node:crypto): an even-money bet's edge near 2.70%
  let staked = 0, back = 0; const hits = new Array(37).fill(0);
  for (let i = 0; i < 400000; i++) { const r = G.spinRoulette([{ type: "red", amount: 1 }], G.cryptoRng); staked += 1; back += r.returned; hits[r.n]++; }
  const edge = 1 - back / staked;
  ok(Math.abs(edge - 1 / 37) < 0.006, `roulette Monte Carlo edge ${(edge * 100).toFixed(2)}% within 0.6 of 2.70%`);
  const exp = 400000 / 37, chi = hits.reduce((t, h) => t + (h - exp) ** 2 / exp, 0);
  ok(chi < 80, `wheel uniform (chi-square ${chi.toFixed(1)} on 36 df)`);
  console.log(`  roulette: edge ${(edge * 100).toFixed(2)}% over 400k crypto spins, chi-square ${chi.toFixed(1)}`);
}

// ==== BLACKJACK ==========================================================================================
const C = (s) => P.parseCards(s);
// A state whose shoe deals `cards` in order (pop from the end), padded so it will not reshuffle.
const rig = (cards) => ({ shoe: [...Array(200).fill(0), ...C(cards).reverse()] });
{
  const tot = (s) => G.bjTotal(C(s));
  ok(tot("As 6h").total === 17 && tot("As 6h").soft, "A6 is soft 17");
  ok(tot("As 6h Kd").total === 17 && !tot("As 6h Kd").soft, "A6K is hard 17");
  ok(tot("As Ad 9c").total === 21, "AA9 is 21");
  ok(G.dealerPlays(C("As 6h"), () => { throw new Error("hit"); }).length === 2, "dealer stands on soft 17 (S17)");
  ok(G.dealerPlays(C("Ts 6h"), () => C("2c")[0]).length === 3, "dealer hits 16");
  ok(G.dealerPlays(C("As 7h"), () => { throw new Error("hit"); }).length === 2, "dealer stands on soft 18");
  const noRng = () => { throw new Error("reshuffled"); };
  // player blackjack pays 3:2
  let s = rig("As 9d Kh 7c"); G.bjDeal(s, 1000, noRng);
  ok(s.round.phase === "done" && s.round.outcome.returned === 2500, "blackjack pays 3:2");
  // dealer blackjack under a ten: settled before the player acts
  s = rig("9s Kd 8h Ac"); G.bjDeal(s, 1000, noRng);
  ok(s.round.phase === "done" && s.round.outcome.returned === 0 && s.round.outcome.dealerBJ, "dealer peeks under a ten");
  // under an ace: insurance offered; taken, it pays 2:1 on a dealer blackjack
  s = rig("9s Ad 8h Kc"); G.bjDeal(s, 1000, noRng);
  ok(s.round.phase === "insurance", "insurance offered under an ace");
  G.bjInsurance(s, true, noRng);
  ok(s.round.phase === "done" && s.round.outcome.returned === 1500 && s.round.outcome.insurancePaid, "insurance pays 2:1");
  s = rig("9s Ad 8h 7c 2d"); G.bjDeal(s, 1000, noRng); G.bjInsurance(s, true, noRng);
  ok(s.round.phase === "play", "no dealer blackjack: insurance lost, the hand plays on");
  // double: one card, twice the stake
  s = rig("6s Td 5h 7c Tc"); G.bjDeal(s, 1000, noRng);
  ok(G.bjView(s).canDouble, "double offered on two cards");
  G.bjAct(s, "double", noRng);
  ok(s.round.phase === "done" && s.round.hands[0].cards.length === 3 && s.round.hands[0].bet === 2000 && s.round.outcome.returned === 4000, "double: one card, doubled stake paid 1:1 (21 v 17)");
  // split once: 8-8 against a 6
  s = rig("8s 6d 8h Tc 3c 2d 9h Td");
  G.bjDeal(s, 1000, noRng);
  ok(G.bjView(s).canSplit, "8-8 splits");
  G.bjAct(s, "split", noRng);
  ok(s.round.hands.length === 2 && s.round.hands[0].cards.length === 2, "split makes two hands of two");
  ok(!G.bjView(s).canSplit, "only one split");
  G.bjAct(s, "stand", noRng);   // 8+3 = 11 stands (odd, but legal)
  G.bjAct(s, "double", noRng);  // 8+2 doubles, draws 9 -> 19
  ok(s.round.phase === "done", "both split hands played, then the dealer");
  const out = s.round.outcome;   // dealer 6 T -> 16 draws T -> bust
  ok(out.dealerTotal > 21 && out.results[0].r === "win" && out.results[1].r === "win" && out.returned === 2000 + 4000, "split hands paid separately, the doubled one double");
  // split aces: one card each, and 21 is not a blackjack
  s = rig("As 9d Ah Tc Kc 5d 7s"); G.bjDeal(s, 1000, noRng);
  ok(s.round.phase === "insurance" || s.round.phase === "play", "aces dealt");
  if (s.round.phase === "insurance") G.bjInsurance(s, false, noRng);
  G.bjAct(s, "split", noRng);
  ok(s.round.phase === "done" && s.round.hands.every(h => h.cards.length === 2), "split aces take one card each");
  ok(s.round.outcome.results[0].r === "win" && s.round.outcome.results[0].back === 2000, "A-K after a split pays 1:1, not 3:2");
  // 10-value cards split (K and T)
  s = rig("Ks 6d Th 7c"); G.bjDeal(s, 1000, noRng); ok(G.bjView(s).canSplit, "K-T splits (equal value)");
  // penetration: a short shoe is replaced before the deal
  const seq = seeded(7);
  s = { shoe: C("2c 3c 4c 5c 6c") }; G.bjDeal(s, 1000, seq.rng);
  ok(s.shuffled && s.shoe.length === 312 - 4 - (s.round.hands[0].cards.length - 2), "reshuffle at 75% penetration");
  ok(G.BJ_RESHUFFLE_AT === 78, "cut card: 78 left of 312");
  // the hole card stays hidden until the dealer plays
  s = rig("Ts 9d 7h 8c"); G.bjDeal(s, 1000, noRng);
  ok(G.bjView(s).dealer[1] === "??" && JSON.stringify(G.bjView(s)).indexOf("8c") < 0, "hole card never sent mid-hand");

  // Monte Carlo: basic strategy (6D S17 DAS, no surrender), 400k rounds, seeded.
  const up = (c) => G.bjValue(c);
  function basic(h, d, canD, canS) {
    const { total, soft } = G.bjTotal(h);
    if (canS) {
      const v = G.bjValue(h[0]);
      if (v === 11 || v === 8) return "split";
      if ((v === 9 && ![7, 10, 11].includes(d)) || ((v === 7) && d <= 7) || ((v === 6) && d <= 6) || ((v === 2 || v === 3) && d <= 7) || (v === 4 && (d === 5 || d === 6))) return "split";
    }
    if (soft) {
      if (total >= 19) return total === 19 && d === 6 && canD ? "double" : "stand";
      if (total === 18) return d <= 6 && d >= 2 && canD ? "double" : d <= 8 ? "stand" : "hit";
      if (canD && ((total === 17 && d >= 3 && d <= 6) || ((total === 15 || total === 16) && d >= 4 && d <= 6) || ((total === 13 || total === 14) && d >= 5 && d <= 6))) return "double";
      return "hit";
    }
    if (total >= 17) return "stand";
    if (total >= 13) return d <= 6 ? "stand" : "hit";
    if (total === 12) return d >= 4 && d <= 6 ? "stand" : "hit";
    if (total === 11) return canD ? "double" : "hit";
    if (total === 10) return canD && d <= 9 ? "double" : "hit";
    if (total === 9) return canD && d >= 3 && d <= 6 ? "double" : "hit";
    return "hit";
  }
  const mc = seeded(20260930);
  let wag = 0, ret = 0; const st = {};
  for (let r = 0; r < 400000; r++) {
    G.bjDeal(st, 100, mc.rng);
    if (st.round.phase === "insurance") G.bjInsurance(st, false, mc.rng);
    let guard = 0;
    while (st.round.phase === "play" && guard++ < 20) {
      const R_ = st.round, h = R_.hands[R_.i];
      let a = basic(h.cards, up(R_.dealer[0]), G.bjCanDouble(R_), G.bjCanSplit(R_));
      if (a === "double" && !G.bjCanDouble(R_)) a = "hit";
      G.bjAct(st, a, mc.rng);
    }
    wag += st.round.hands.reduce((t, h) => t + h.bet, 0);   // doubled and split stakes included
    ret += st.round.outcome.returned;
  }
  const edge = 1 - ret / wag;
  ok(edge > -0.003 && edge < 0.012, `blackjack basic-strategy edge ${(edge * 100).toFixed(2)}% (expected about 0.4-0.6%)`);
  console.log(`  blackjack: basic strategy edge ${(edge * 100).toFixed(2)}% over 400k seeded rounds`);
}

// ==== BACCARAT ==========================================================================================
{
  // The banker's third-card chart, as printed on every punto banco layout.
  // rows: banker total 0..7; columns: player's third card none, 0..9. D = draw, S = stand.
  const CHART = {
    0: "D DDDDDDDDDD", 1: "D DDDDDDDDDD", 2: "D DDDDDDDDDD",
    3: "D DDDDDDDDSD", 4: "D SSDDDDDDSS", 5: "D SSSSDDDDSS", 6: "S SSSSSSDDSS", 7: "S SSSSSSSSSS",
  };
  for (let b = 0; b <= 7; b++) {
    const row = CHART[b].replace(" ", "");
    ok(G.bankerDraws(b, null) === (row[0] === "D"), `banker ${b}, player stood`);
    for (let t = 0; t <= 9; t++) ok(G.bankerDraws(b, t) === (row[t + 1] === "D"), `banker ${b}, player's third ${t}`);
  }
  for (let p = 0; p <= 9; p++) ok(G.playerDraws(p) === p <= 5, `player draws on ${p}: ${p <= 5}`);
  ok(G.bacValue(C("Ks")[0]) === 0 && G.bacValue(C("As")[0]) === 1 && G.bacValue(C("9s")[0]) === 9, "card values");
  // Exact 8-deck probabilities, card removal included, over every sequence the tableau can deal.
  const counts = [128, 32, 32, 32, 32, 32, 32, 32, 32, 32];
  let pw = 0, bw = 0, tw = 0;
  function take(v, cnt, left) { return cnt[v] / left; }
  const cnt = counts.slice(); let left = 416;
  const cards = [];
  function deal(depth, prob) {
    // cards: P1 B1 P2 B2 [P3] [B3] as values; we branch lazily
    if (depth < 4) {
      for (let v = 0; v < 10; v++) { if (!cnt[v]) continue; const p = take(v, cnt, left); cnt[v]--; left--; cards.push(v); deal(depth + 1, prob * p); cards.pop(); cnt[v]++; left++; }
      return;
    }
    const [p1, b1, p2, b2] = cards;
    const pt = (p1 + p2) % 10, bt = (b1 + b2) % 10;
    if (pt >= 8 || bt >= 8) return score(pt, bt, prob);
    if (G.playerDraws(pt)) {
      for (let v = 0; v < 10; v++) {
        if (!cnt[v]) continue; const p = take(v, cnt, left); cnt[v]--; left--;
        const pt3 = (pt + v) % 10;
        if (G.bankerDraws(bt, v)) for (let u = 0; u < 10; u++) { if (!cnt[u]) continue; score(pt3, (bt + u) % 10, prob * p * cnt[u] / left); }
        else score(pt3, bt, prob * p);
        cnt[v]++; left++;
      }
    } else if (G.bankerDraws(bt, null)) for (let u = 0; u < 10; u++) { if (!cnt[u]) continue; score(pt, (bt + u) % 10, prob * cnt[u] / left); }
    else score(pt, bt, prob);
  }
  function score(pt, bt, prob) { if (pt > bt) pw += prob; else if (bt > pt) bw += prob; else tw += prob; }
  deal(0, 1);
  ok(Math.abs(pw + bw + tw - 1) < 1e-9, "probabilities sum to 1");
  const eB = -(bw * 0.95 - pw), eP = -(pw - bw), eT = -(tw * 8 - (1 - tw));
  ok(Math.abs(eB - 0.010579) < 2e-6, `banker edge ${(eB * 100).toFixed(4)}% = 1.0579%`);
  ok(Math.abs(eP - 0.012351) < 2e-6, `player edge ${(eP * 100).toFixed(4)}% = 1.2351%`);
  ok(Math.abs(eT - 0.143596) < 2e-6, `tie edge ${(eT * 100).toFixed(4)}% = 14.3596%`);
  // settlement: commission and pushes
  ok(G.bacSettle({ banker: 1000 }, "banker") === 1950 && G.bacSettle({ player: 1000 }, "player") === 2000 && G.bacSettle({ tie: 1000 }, "tie") === 9000, "banker 0.95:1, player 1:1, tie 8:1");
  ok(G.bacSettle({ banker: 1000, player: 500 }, "tie") === 1500 && G.bacSettle({ banker: 1000 }, "player") === 0, "player and banker push on a tie; losers lose");
  // naturals stand; rigged coup
  const src = (s) => { const a = C(s); return () => a.shift(); };
  let c = G.bacCoup(src("4s 5s 4h 3h"));          // P 8 natural, B 8 natural
  ok(c.player.length === 2 && c.banker.length === 2 && c.winner === "tie", "naturals stand: 8 v 8 ties");
  c = G.bacCoup(src("As 3s 2h 3h 8c"));       // P 3 draws 8 -> 1; B 6, third 8 -> stands
  ok(c.player.length === 3 && c.banker.length === 2 && c.winner === "banker", "banker 6 stands on a player's 8");
  // Monte Carlo on the real shoe path (seeded): banker edge near 1.06%
  const mc = seeded(99), st = {}; let w = 0, back = 0;
  for (let i = 0; i < 300000; i++) { const r = G.bacPlay(st, { banker: 100 }, mc.rng); w += 100; back += r.returned; }
  const eMC = 1 - back / w;
  ok(Math.abs(eMC - 0.010579) < 0.006, `baccarat Monte Carlo banker edge ${(eMC * 100).toFixed(2)}%`);
  console.log(`  baccarat: exact edges banker ${(eB * 100).toFixed(4)}% player ${(eP * 100).toFixed(4)}% tie ${(eT * 100).toFixed(4)}%; Monte Carlo banker ${(eMC * 100).toFixed(2)}%`);
}

// ==== POKER ==============================================================================================
{
  const sc = (s) => P.score(C(s));
  const better = [
    ["As Ks Qs Js Ts 2d 3c", "9h 8h 7h 6h 5h Ad Ac", "royal flush beats a straight flush"],
    ["6h 5h 4h 3h 2h Kd Kc", "5s 4s 3s 2s As Kh Qd", "six-high straight flush beats the steel wheel"],
    ["5s 4s 3s 2s As Kh Qd", "Ac Ad Ah As Kd 2c 3c", "steel wheel beats four aces"],
    ["2c 2d 2h 2s 3c 4d 5h", "Ac Ad Ah Kd Kc 2c 3c", "quads beat a full house"],
    ["Ac Ad Ah 2d 2c 7h 9s", "Kc Kd Kh Ad Ac 7s 9s", "aces full beat kings full"],
    ["Kc Kd Kh Ad Ac 7s 9s", "Kc Kd Kh Qd Qc 7s 9s", "kings full of aces beat kings full of queens"],
    ["2c 2d 2h 7s 7d 9c 4h", "As Ks Qs Js 8s 2d 3c", "a full house beats a flush"],
    ["As Ks Qs Js 8s 2d 3c", "Ah Kh Qh Jh 7h 2d 3c", "A-K-Q-J-8 flush beats A-K-Q-J-7"],
    ["As Kh Qh Jh 7h 6h 3c", "Ts 9d 8c 7h 6s 2d 2c", "a flush beats a straight"],
    ["6s 5d 4c 3h 2s Kd Qc", "5s 4d 3c 2h As Kd Qc", "six-high straight beats the wheel"],
    ["As Kd Qc Jh Ts 2d 2c", "Ks Qd Jc Th 9s 2h 2s", "broadway beats king-high"],
    ["7s 7d 7c Ah 2s 4d 9c", "As Ad Kc Kh Qs Qd 2c", "trips beat two pair"],
    ["As Ad Kc Kh 2s 3d 7c", "As Ad Qc Qh Js Td 9c", "aces up beat aces over queens"],
    ["As Ad Kc Kh Qs Qd 2c", "As Ad Kc Kh Js Jd Tc", "three pairs: best two pair, the third pair as kicker (Q beats J)"],
    ["Ks Kd Ac 9h 7s 4d 2c", "Ks Kd Qc Jh 9s 4d 2c", "pair of kings, ace kicker beats queen kicker"],
    ["Ks Kd Ac Jh 7s 4d 2c", "Ks Kd Ac Th 9s 4d 2c", "second kicker decides"],
    ["As Kd 9c 7h 5s 4d 2c", "As Kd 9c 7h 4s 3d 2c", "high card to the fifth card"],
    ["Ah 8h 7h 3h 2h Ks Kc", "Ks Kd Kc 5h 7d 2c 3s", "a flush over three kings"],
  ];
  for (const [a, b, m] of better) ok(sc(a) > sc(b), m);
  const same = [
    ["As Ks Qs Js Ts 2d 3c", "Ah Kh Qh Jh Th 4d 5c", "two royal flushes split"],
    ["2c 3d 9h Th Jh Qh Kh", "4c 5d 9h Th Jh Qh Kh", "the board plays: split"],
    ["As Ad Kc Kh Qs 3d 2c", "As Ad Kc Kh Qd 4d 2c", "same two pair, same kicker: split"],
    ["As Kd Qc Jh 9s 3d 2c", "Ad Kh Qs Jc 9h 3c 2s", "same high cards split"],
  ];
  for (const [a, b, m] of same) ok(sc(a) === sc(b), m);
  const names = [["5s 4s 3s 2s As", "STRAIGHT FLUSH, FIVE HIGH"], ["As Ks Qs Js Ts", "ROYAL FLUSH"], ["Ac Ad Ah 2d 2c", "FULL HOUSE, ACES OVER TWOS"], ["6c 6d 9h 9s Kd", "TWO PAIR, NINES AND SIXES"], ["5s 4d 3c 2h Ah", "STRAIGHT, FIVE HIGH"]];
  for (const [h, n] of names) ok(P.handName(P.score(C(h))) === n, `named: ${n}`);
  // Category frequencies over every 5-card hand would take a while; 7-card sample vs known shares.
  const mc = seeded(5), tally = new Array(9).fill(0);
  for (let i = 0; i < 200000; i++) {
    const d = Array.from({ length: 52 }, (_, k) => k); for (let k = 0; k < 7; k++) { const j = k + mc.rng(52 - k); [d[k], d[j]] = [d[j], d[k]]; }
    tally[P.categoryOf(P.score(d.slice(0, 7)))]++;
  }
  const share = tally.map(t => t / 200000);
  const known = [0.1741, 0.4382, 0.2350, 0.0483, 0.0462, 0.0303, 0.0260, 0.00168, 0.00031];
  known.forEach((k, i) => ok(Math.abs(share[i] - k) < Math.max(0.004, k * 0.25), `7-card ${P.CATEGORY[i]} ${(share[i] * 100).toFixed(2)}% vs ${(k * 100).toFixed(2)}%`));

  // side pots: A all-in 100, B all-in 300, C and D in for 500; D folds
  let pots = P.buildPots([100, 300, 500, 500], [true, true, true, false]);
  ok(pots.length === 3 && pots[0].amount === 400 && pots[1].amount === 600 && pots[2].amount === 400, `main 400, side 600, side 400 (${pots.map(p => p.amount)})`);
  ok(pots[0].eligible.join() === "0,1,2" && pots[1].eligible.join() === "1,2" && pots[2].eligible.join() === "2", "eligibility by what each covered");
  let won = P.awardPots(pots, [900, 500, 100, -1], 3, 4);
  ok(won.join() === "400,600,400,0", "short stack wins the main, B the side, C gets its uncalled 400");
  pots = P.buildPots([50, 50, 50], [true, true, true]);
  won = P.awardPots(pots, [7, 7, 3], 0, 3);   // 150 split two ways: 75 each
  ok(won.join() === "75,75,0", "split pot");
  pots = P.buildPots([51, 50, 50, 0], [true, true, false, false]);
  won = P.awardPots(pots, [7, 7, -1, -1], 1, 4);
  ok(won[0] + won[1] === 151 && won[0] === 76, `odd chip to the first winner left of the button (${won})`);
  pots = P.buildPots([200, 60, 0], [true, false, false]);
  ok(pots.length === 1 && pots[0].amount === 260, "folded money above every live level goes to the last pot");

  // betting rules on a scripted table
  const mk = (stacks) => ({ level: "floor", sb: 5, bb: 10, button: 2, handNo: 0, seats: stacks.map((s, i) => ({ id: i ? `b${i}` : "you", name: i ? `B${i}` : "YOU", stack: s, bot: P.styleOf({}, 50) })) });
  const r1 = seeded(3);
  let T = mk([1000, 1000, 1000]); P.startHand(T, r1.rng);
  // button 0 after rotate from 2: sb 1, bb 2, first to act is seat 0
  ok(T.button === 0 && T.hand.sbSeat === 1 && T.hand.bbSeat === 2 && T.hand.cur === 0, "blinds left of the button, action on the button three-handed");
  ok(P.legal(T, 0).minTo === 20 && P.act(T, 0, { type: "raise", to: 15 }).error, "min raise is a full big blind");
  P.act(T, 0, { type: "raise", to: 30 });
  ok(P.legal(T, 1).minTo === 50, "re-raise at least the last raise (20)");
  P.act(T, 1, { type: "call" }); P.act(T, 2, { type: "call" });
  ok(T.hand.street === 1 && T.hand.board.length === 3 && T.hand.cur === 1, "flop dealt, first live seat left of the button acts");
  // short all-in does not reopen the raising
  T = mk([1000, 1000, 35]); T.button = 2; P.startHand(T, r1.rng);   // button 0, sb 1, bb 2 (35 stack)
  P.act(T, 0, { type: "raise", to: 25 });   // +15 over 10: a full raise? 15 >= 10, yes
  P.act(T, 1, { type: "call" });
  P.act(T, 2, { type: "raise", to: 35 });   // all in for 35: +10 < 15, short
  ok(T.hand.cur === 0 && !P.legal(T, 0).canRaise && P.legal(T, 0).canCall, "a short all-in: call or fold, no re-raise");
  // chips are conserved over thousands of random hands (random legal play, bots too)
  const cons = seeded(11);
  let hands = 0, showdowns = 0, sidepots = 0;
  for (let t = 0; t < 60; t++) {
    const n = 3 + (t % 4);
    const T2 = mk(Array.from({ length: n }, () => 200 + cons.rng(1800)));
    for (const s of T2.seats) s.bot = P.styleOf({ threat: cons.rng(100), care: cons.rng(100), alignment: cons.rng(100), adaptability: cons.rng(100) }, cons.rng(100));
    const total = T2.seats.reduce((a, s) => a + s.stack, 0);
    for (let h = 0; h < 40; h++) {
      if (T2.seats.filter(s => s.stack > 0).length < 2) break;
      const r = P.startHand(T2, cons.rng); if (r.error) break;
      let guard = 0;
      while (!T2.hand.done && guard++ < 500) {
        const i = T2.hand.cur;
        if (i === 0) {
          const L = P.legal(T2, 0), x = cons.rnd();
          const a = x < 0.15 && !L.canCheck ? { type: "fold" } : x < 0.55 ? (L.canCheck ? { type: "check" } : { type: "call" }) : L.canRaise ? { type: "raise", to: x > 0.93 ? L.maxTo : L.minTo + cons.rng(Math.max(1, L.maxTo - L.minTo)) } : (L.canCheck ? { type: "check" } : { type: "call" });
          const e = P.act(T2, 0, a); assert.ok(!e.error, `legal action refused: ${e.error}`);
        } else P.runBots(T2, cons.rng, cons.rnd);
      }
      ok(T2.hand.done, "hand terminates");
      const now = T2.seats.reduce((a, s) => a + s.stack, 0);
      ok(now === total, `chips conserved (${now} vs ${total})`);
      ok(T2.seats.every(s => s.stack >= 0), "no negative stacks");
      hands++; if (T2.hand.result.showdown) showdowns++; if (T2.hand.result.pots.length > 1) sidepots++;
    }
  }
  ok(sidepots > 5, `side pots occurred (${sidepots})`);
  console.log(`  poker: ${hands} random hands, ${showdowns} showdowns, ${sidepots} with side pots; chips conserved`);
  // the figures: styles from their files; living figures never talk
  for (const lv of ["floor", "high"]) {
    const pool = F.poolOf(lv);
    ok(pool.length >= 8, `${lv} pool has figures (${pool.length})`);
    for (const c of pool) {
      const seat = F.seatFor(c, lv, 1000);
      if (!c.dead) ok(!seat.talks && ["sit", "raise", "win", "fold"].every(m => F.lineFor(seat, m) === null), `${c.name} (living) never speaks`);
      else ok(seat.talks && ["sit", "raise", "win", "fold"].every(m => typeof F.lineFor(seat, m) === "string"), `${c.name} (dead) has lines`);
      ok(c.breakdown && Number.isFinite(c.breakdown.threat), `${c.name} has a file`);
    }
  }
  for (const slug of Object.keys(F.LINES)) { const c = F.figureCard(slug); ok(c && c.dead, `lines only for dead figures (${slug})`); }
  ok(F.figureCard("jeffrey-epstein") === null && F.figureCard("vladimir-putin") === null, "grave-harm files are not seated");
  const hi = F.seatFor(F.figureCard("sun-tzu"), "high", 1).bot, lo = F.seatFor(F.figureCard("sun-tzu"), "floor", 1).bot;
  ok(hi.skill > lo.skill && hi.honesty <= lo.honesty, "the high limit room plays harder");
  ok(F.seatFor(F.figureCard("dennis-rodman"), "floor", 1).bot.honesty > F.seatFor(F.figureCard("benjamin-franklin"), "high", 1).bot.honesty, "the less competent leak more");
  const agg = (slug) => F.seatFor(F.figureCard(slug), "floor", 1).bot;
  ok(agg("winston-churchill").aggression > agg("keanu-reeves").aggression, "threat drives aggression");
  ok(agg("keanu-reeves").tightness > agg("elon-musk").tightness, "care and alignment drive tightness");
}

// ==== /api/casino ============================================================================================
{
  process.env.HVI_IP_SALT = "t";
  const fn = (await import("../netlify/functions/casino.js")).default;
  const M = await import("../netlify/functions/casino.js");
  const S = await import("../netlify/lib/store.js");
  const HOST = "https://humanvalueindex.com";
  let ipN = 1;
  const call = async (method, body, { ip, q = "" } = {}) => {
    const r = await fn(new Request(HOST + "/api/casino" + q, method === "GET" ? { method, headers: { origin: HOST } } : { method, headers: { "content-type": "application/json", origin: HOST }, body: JSON.stringify(body) }), { ip: ip || `198.51.100.${ipN}` });
    return { status: r.status, body: await r.json() };
  };
  const cases = () => globalThis.__blobs.get("hvi-cases");
  const seed = async (id, history) => { await S.updateCase(id, () => ({ caseId: id, created: "2026-09-30", history })); };
  const A = "HVI-CASINOAA", B = "HVI-CASINOBB", U = "HVI-CASINOUU", HI = "HVI-CASINOHH";
  await seed(A, [{ score: 500, tier: "MONITORED CIVILIAN" }]);
  await seed(B, [{ score: 500, tier: "MONITORED CIVILIAN" }]);
  await seed(U, []);
  await seed(HI, [{ score: 790, tier: "ESSENTIAL INFRASTRUCTURE" }]);
  void cases;

  // no purchase, cash-out or transfer path
  ok(!M.ACTIONS.some(a => /buy|purchase|cash|transfer|gift|send|withdraw|deposit|redeem|payout|sell|give|trade/.test(a)), "no action buys, cashes out or transfers chips");
  for (const a of ["buy", "purchase", "cashout", "transfer", "gift", "withdraw", "deposit", "redeem"]) {
    const r = await call("POST", { caseId: A, action: a, to: B, amount: 100 });
    ok(r.status === 400, `${a} refused`);
  }
  const src = readdirSync(new URL("../netlify/functions/", import.meta.url)).filter(f => /\.js$/.test(f)).map(f => [f, readFileSync(new URL(`../netlify/functions/${f}`, import.meta.url), "utf8")]);
  for (const [f, s] of src) if (/hvi-casino|casino-store/.test(s)) ok(["casino.js", "purge.js"].includes(f), `only the casino (and purge) touch the chip ledger: ${f}`);
  const cas = readFileSync(new URL("../netlify/functions/casino.js", import.meta.url), "utf8") + readFileSync(new URL("../netlify/lib/casino-store.js", import.meta.url), "utf8");
  ok(!/stripe|checkout|paypal|price_|payment/i.test(cas), "no payment code anywhere near the chips");

  // the file gate
  ok((await call("GET", null, { q: `?caseId=${U}` })).status === 403, "unassessed file: 403");
  ok((await call("GET", null, { q: "?caseId=HVI-NOSUCHAA" })).status === 404, "no such file: 404");
  ok((await call("GET", null, { q: "?caseId=nope" })).status === 400, "not a case number: 400");
  let g = await call("GET", null, { q: `?caseId=${A}` });
  ok(g.status === 200 && g.body.chips === 0 && g.body.claimable && !g.body.high, "fresh wallet: 0 chips, allowance claimable, floor only");
  const pub = await call("GET", null);
  ok(pub.status === 200 && pub.body.edges.length === 4 && pub.body.legal[0].includes("CANNOT BE BOUGHT"), "public view: edges and the legal line");

  // allowance: once per day, even when ten tabs claim at once
  const claims = await Promise.all(Array.from({ length: 10 }, (_, i) => call("POST", { caseId: A, action: "claim" }, { ip: `192.0.2.${i}` })));
  // the rest lose the wallet race (409 already claimed) or the per-file limiter's race (429)
  ok(claims.filter(r => r.status === 200).length <= 1 && claims.every(r => [200, 409, 429].includes(r.status)), `at most one claim credited of ten concurrent (${claims.map(r => r.status)})`);
  if (!claims.some(r => r.status === 200)) ok((await call("POST", { caseId: A, action: "claim" })).status === 200, "the claim, once the rush is over");
  g = await call("GET", null, { q: `?caseId=${A}` });
  ok(g.body.chips === 100000 && !g.body.claimable, "1,000 chips after the claim");

  // limits and rooms
  ok((await call("POST", { caseId: A, action: "roulette", level: "floor", bets: [{ type: "red", amount: 501 }] })).status === 400, "floor roulette max 500");
  ok((await call("POST", { caseId: A, action: "roulette", level: "floor", bets: [{ type: "split", n: [3, 4], amount: 5 }] })).status === 400, "an impossible split refused");
  ok((await call("POST", { caseId: A, action: "roulette", level: "high", bets: [{ type: "red", amount: 25 }] })).status === 403, "high limit room locked for a monitored file under 5,000 chips");
  ok((await call("POST", { caseId: A, action: "bj-deal", level: "floor", bet: 4 })).status === 400, "blackjack min 5");
  await call("POST", { caseId: HI, action: "claim" });
  const hr = await call("POST", { caseId: HI, action: "roulette", level: "high", bets: [{ type: "black", amount: 25 }] });
  ok(hr.status === 200 && hr.body.high, "an ESSENTIAL file enters the high limit room");

  // concurrency: thirty spins at once, 100 chips each, on 1,000 chips. The ledger must balance.
  ipN = 50;
  const spins = await Promise.all(Array.from({ length: 30 }, (_, i) => call("POST", { caseId: A, action: "roulette", level: "floor", bets: [{ type: i % 2 ? "red" : "black", amount: 100 }] }, { ip: `203.0.113.${i}` })));
  const okSpins = spins.filter(r => r.status === 200);
  const net = okSpins.reduce((t, r) => t + r.body.last.roulette.returned - r.body.last.roulette.staked, 0);
  const w = (await call("GET", null, { q: `?caseId=${A}` })).body;
  ok(w.chips === 100000 + net && w.chips >= 0, `CAS ledger balances under 30 concurrent spins (${okSpins.length} played, ${spins.filter(r => r.status === 402).length} refused for chips, ${spins.filter(r => r.status === 409).length} busy; ${w.chips / 100} chips)`);
  ok(spins.every(r => [200, 402, 409, 429].includes(r.status)), `every concurrent spin answered cleanly (${[...new Set(spins.map(r => r.status))]})`);
  ok(w.stats.wagered - w.stats.returned === 100000 - w.chips, "stats agree with the balance");
  console.log(`  api: 30 concurrent spins on one file -> ${okSpins.length} played, ${spins.filter(r => r.status === 402).length} refused for chips, ${spins.filter(r => r.status !== 200 && r.status !== 402).length} told to wait; ledger balances`);

  // the ledger itself, without the limiter in front: 40 concurrent spends of 100 on 1,000
  const CS = await import("../netlify/lib/casino-store.js");
  await CS.updateWallet("HVI-CASINOLL", w0 => ({ wallet: { ...w0, c: 100000 }, out: {} }));
  const spends = await Promise.allSettled(Array.from({ length: 40 }, () => CS.updateWallet("HVI-CASINOLL", w0 => (w0.c < 10000 ? { out: { refused: true } } : { wallet: { ...w0, c: w0.c - 10000 }, out: { spent: true } }))));
  const spent = spends.filter(r => r.status === "fulfilled" && r.value.out.spent).length;
  const refused = spends.filter(r => r.status === "fulfilled" && r.value.out.refused).length;
  const busyN = spends.filter(r => r.status === "rejected").length;
  const fin = await CS.getWallet("HVI-CASINOLL");
  ok(spent <= 10 && fin.c === 100000 - spent * 10000 && fin.c >= 0, `CAS: ${spent} spends landed, ${refused} refused, ${busyN} busy; balance ${fin.c / 100}`);
  ok(spent + refused + busyN === 40 && (spent === 10 || busyN > 0), "every chip spent exactly once, never twice");
  console.log(`  ledger: 40 concurrent spends of 100 on 1,000 -> ${spent} landed, ${refused} refused for chips, ${busyN} busy; final ${fin.c / 100}`);

  // blackjack through the function: play to the end, the balance follows the ledger
  await call("POST", { caseId: B, action: "claim" });
  for (let r = 0; r < 8; r++) {
    let s = await call("POST", { caseId: B, action: "bj-deal", level: "floor", bet: 10 });
    if (s.status === 402) break;
    ok(s.status === 200, `bj deal ${s.status} ${s.body.error || ""}`);
    ok(s.body.bj.phase === "done" || s.body.bj.dealer[1] === "??", "hole card hidden in play");
    let guard = 0;
    while (s.body.bj.phase !== "done" && guard++ < 10) {
      const a = s.body.bj.phase === "insurance" ? { action: "bj-insurance", take: r % 2 === 0 } : s.body.bj.canSplit ? { action: "bj-split" } : s.body.bj.canDouble && r % 3 === 0 ? { action: "bj-double" } : s.body.bj.hands[s.body.bj.i].total < 17 ? { action: "bj-hit" } : { action: "bj-stand" };
      s = await call("POST", { caseId: B, ...a });
      ok(s.status === 200, `bj ${a.action}: ${s.status} ${s.body.error || ""}`);
    }
    ok(s.body.bj.phase === "done", "blackjack hand finishes");
  }
  ok((await call("POST", { caseId: B, action: "bj-hit" })).status === 409, "no hand, no hit");
  // baccarat
  const bc = await call("POST", { caseId: B, action: "baccarat", level: "floor", bets: { banker: 20, tie: 5 } });
  ok(bc.status === 200 && ["player", "banker", "tie"].includes(bc.body.last.baccarat.winner), "baccarat coup");
  ok((await call("POST", { caseId: B, action: "baccarat", level: "floor", bets: { banker: 3 } })).status === 400, "baccarat min 5");
  let wb = (await call("GET", null, { q: `?caseId=${B}` })).body;
  ok(wb.chips === 100000 - wb.stats.wagered + wb.stats.returned, `B's balance is allowance - wagered + returned (${wb.chips})`);

  // poker through the function: sit, play, leave; chips come back
  const Cc = "HVI-CASINOCC";
  await seed(Cc, [{ score: 610, tier: "TOLERATED GENERALIST" }]);
  await call("POST", { caseId: Cc, action: "claim" });
  const before = 100000;
  let p = await call("POST", { caseId: Cc, action: "poker-sit", level: "floor", seats: 3, buyIn: 200 });
  ok(p.status === 200 && p.body.poker.seats.length === 4 && p.body.atTable > 0, `sat at a table of four (${p.status} ${p.body.error || ""})`);
  ok(p.body.poker.seats.slice(1).every(s => s.cards === null || s.cards.join() === "??,??"), "the figures' cards are never sent mid-hand");
  ok(p.body.poker.dossiers.length === 3 && p.body.poker.dossiers[0].lines[0].startsWith("AGGRESSION"), "each figure's dossier: style from its file");
  let hands = 0, guard = 0;
  while (hands < 6 && guard++ < 200) {
    const H = p.body.poker.hand;
    if (H.done) { if (p.body.poker.seats[0].stack < 10) break; p = await call("POST", { caseId: Cc, action: "poker-deal" }); hands++; continue; }
    const L = H.legal;
    ok(L, "the subject's turn when the hand waits");
    p = await call("POST", { caseId: Cc, action: "poker-act", ...(L.canCheck ? { type: "check" } : { type: "call" }) });
    ok(p.status === 200, `poker act ${p.status} ${p.body.error || ""}`);
    const talk = p.body.poker.hand.log.filter(e => e.act === "say");
    for (const e of talk) ok(F.figureCard(p.body.poker.seats[e.seat].id)?.dead, "only dead figures talk");
    ok(p.body.poker.seats.every(s => !("dead" in s)), "nobody is labelled by whether they are alive");
  }
  ok(hands >= 1 || p.body.poker.seats[0].stack < 10, `played ${hands + 1} hands`);
  let reloaded = 0;
  if (p.body.poker.hand.done && p.body.poker.seats[0].stack < 10) {
    const rl = await call("POST", { caseId: Cc, action: "poker-reload", buyIn: 200 });
    ok(rl.status === 200 && rl.body.poker.seats[0].stack >= 200, "busted at the table: reload from the wallet");
    p = rl; reloaded = 200;
  }
  if (!p.body.poker.hand.done) p = await call("POST", { caseId: Cc, action: "poker-act", type: p.body.poker.hand.legal?.canCheck ? "check" : "fold" });
  const stack = p.body.poker.seats[0].stack;
  const left = await call("POST", { caseId: Cc, action: "poker-leave" });
  ok(left.status === 200 && left.body.poker === null, "left the table");
  if (p.body.poker.hand.done) ok(left.body.chips === before - 20000 - reloaded * 100 + stack * 100, `chips back from the table (${left.body.chips} = ${before} - 20000 + ${stack * 100})`);

  // the board: last four only
  const board = (await call("GET", null)).body.board;
  ok(board.rows.length >= 2 && board.rows.every(r => /^…[A-Z0-9]{4}$/.test(r.case)), "the board shows case last-4 only");
  ok(!JSON.stringify(board).includes("HVI-"), "no case number on the board");

  // rate limit per file per minute
  let last = null;
  for (let i = 0; i < M.CASINO_CASE_PER_MINUTE + 2; i++) last = await call("GET", null, { q: `?caseId=${HI}` });
  ok(last.status === 429, "per-file minute limit");
}

// ==== the legal copy ==========================================================================================
{
  const terms = readFileSync(new URL("../docs/legal/terms.md", import.meta.url), "utf8");
  ok(/## 10\. The casino/.test(terms) && /play chips/i.test(terms) && /cannot be (bought|purchased)/i.test(terms) && /transfer/i.test(terms) && /no prizes/i.test(terms) && /16/.test(terms), "terms: the casino clause (play chips, no purchase, no transfer, no prizes, 16+)");
  ok(R.LEGAL_LINES[0].includes("16 OR OLDER") && R.RESPONSIBLE_LINE.includes("1-800-GAMBLER"), "casino page: the legal and responsible-play lines");
}
console.log(`check-casino: ${checks} checks passed`);
