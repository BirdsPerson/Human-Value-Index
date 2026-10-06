// THE MARKET's price engine (docs/design/ECONOMY_PROPERTY.md, "§ The Living Market"). Pure and
// deterministic: the same state and the same inputs give the same prices, bit for bit (every loop
// runs in sorted order; nothing reads a clock or Math.random). The tick (netlify/lib/market.js)
// feeds it one COMPLETED machine day at a time:
//   part     the builder's market input for that day (src/market/activity.js), or null ("no
//            news": a day built before the input existed; activity unchanged)
//   orders   the players' orders journaled for this tick (a batch auction, see step())
//   noise    (day, slug) -> -1..1, an HMAC under a server secret (replayable by the server, not
//            computable from a published plan)
// It never reads or writes a plan: the city is input, never output.
//
// The price is what they did times the mood about them: P = V e^x. V (fair value) follows the
// activity EMA, so news from the city passes straight into the price; x (the mispricing) is moved
// by order flow (whoever moves a price pays the moved price: NPCs and players fill after the move),
// by boycotts and by noise, and decays toward 0.
//
// Scott's rule for the NPCs (2026-10-05): behaviour comes from each figure's drive, concentration
// is allowed to build and polarize, and the stabilizer arrives as an in-world event (an antitrust
// order, a margin call, an audit, a revolutionary run, an emergency ballot), each deterministic
// from the state and each with a line that says why. Every move carries its "because" (whyOf).
import { because, DRIVE_REASONS } from "../city/drives.js";
import { FLOAT, BASE_PRICE, HVI_BASE, KNOBS, knobsOf, TERMS, WEIGHTS, NPC_ROSTER, NPC_CAPITAL, NPC_MAX, MACHINE_DAYS_PER_REAL_DAY, askOf, bidOf, TERM_WORDS } from "./rules.js";

export const ENGINE_V = 1;
export const ALPHA = 0.01;       // activity EMA per machine day (~69 machine days, ~28 real hours, half-life)
export const KAPPA = 0.03;       // the mispricing's decay per machine day
export const LAMBDA = 0.5;       // price impact of order flow (fraction of the float)
export const SIGMA = 0.005;      // the noise's scale per machine day (sd ~0.3%)
export const MOM = 0.1;          // momentum EMA weight
export const BOYCOTT = 0.002;    // a revolutionary's boycott: the mispricing it takes off a cornered human per tick
export const NPC_INVEST = 0.85;  // share of an NPC's wealth it keeps invested
export const NPC_TURN = 0.25;    // most of a position an NPC moves at one sitting
export const CLOSES_KEPT = 30;
export const EVENTS_KEPT = 40;
// How often each drive sits down to trade (machine days), and how many names it wants.
export const CADENCE = { acquisitive: 12, cautious: 12, revolutionary: 12, speculator: 4, contrarian: 6, fashion: 6, populist: 6 };
export const NAMES = { acquisitive: 2, cautious: 8, revolutionary: 6, speculator: 5, contrarian: 6, fashion: 5, populist: 4 };

const CITY_EPOCH = Date.UTC(2026, 8, 26, 0, 0, 0);   // src/city/sim.js CITY_EPOCH (check-market holds them equal)
// The real UTC day a machine day belongs to (60 machine days to a real day from a UTC midnight).
export const realDayOf = (d) => new Date(CITY_EPOCH + Math.floor((d - 1) / MACHINE_DAYS_PER_REAL_DAY) * 86_400_000).toISOString().slice(0, 10);
export const firstMachineDayOf = (realDay) => Math.round((Date.parse(`${realDay}T00:00:00Z`) - CITY_EPOCH) / 86_400_000) * MACHINE_DAYS_PER_REAL_DAY + 1;

const r2 = (x) => Math.round(x * 100) / 100;
const r4 = (x) => Math.round(x * 1e4) / 1e4;
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const sorted = (o) => Object.keys(o).sort();
export const fairValue = (s) => r2(BASE_PRICE * (0.25 + 0.75 * clamp(s, 0, 4)));
export function fnv(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ---- state ------------------------------------------------------------------------------------
export function initState(day, knobs = KNOBS) {
  return { v: ENGINE_V, day: day - 1, rd: realDayOf(day), knobs: knobsOf(knobs), next: null, hvi: { level: HVI_BASE, open: HVI_BASE, cl: [] }, inst: {}, npc: {}, levy: {}, events: [], emergency: null, ticks: 0, delist: [] };
}
export const clone = (s) => JSON.parse(JSON.stringify(s));

// A listed human. p: price, o: the real day's open, s: activity EMA, x: mispricing (log P/V),
// c: crowd EMA, m: momentum EMA, h: halted, u: untradable, pl / npc: shares held by players / NPCs,
// a: the last day's raw terms, A: the last day's activity, cl: real-day closes (newest last),
// d0: listed on, dead: 1 for the dead, w: today's "because" ledger {news, npc: {id: units},
// pl: units, ev: event code}, over: real days spent past the NPC guardrail.
function list(state, slug, name, dead, day) {
  const p = fairValue(1);
  state.inst[slug] = { n: name, dead: dead ? 1 : 0, p, o: p, s: 1, x: 0, c: 1, m: 0, h: 0, u: 0, pl: 0, npc: 0, a: null, A: 1, cl: [], d0: day, w: freshWhy(), over: 0, fresh: 1 };
}
const freshWhy = () => ({ news: 0, npc: {}, pl: 0, ev: null, flow: 0 });

function event(state, day, kind, line, extra = {}) {
  state.events.push({ day, rd: realDayOf(day), kind, line, ...extra });
  if (state.events.length > EVENTS_KEPT) state.events.splice(0, state.events.length - EVENTS_KEPT);
}

// ---- activity -----------------------------------------------------------------------------------
// part.a {slug: [work, crowd, sport, play, civic]} -> {slug: {A, crowd, top}} for the tradables, each
// term the person's figure over the day's mean (0..4), weighted, then A rescaled so the day's mean
// is exactly 1 (the average human is worth BASE_PRICE). Mean 0: the term is neutral for everyone.
export function activityOf(part, tradable) {
  const out = {};
  if (!part?.a) return out;
  const keys = sorted(part.a).filter(k => tradable(k));
  if (!keys.length) return out;
  const means = TERMS.map((_, j) => { let n = 0; for (const k of keys) n += Number(part.a[k][j]) || 0; return n / keys.length; });
  let total = 0;
  for (const k of keys) {
    let A = 0, top = 0, best = -1;
    TERMS.forEach((t, j) => {
      const ratio = means[j] > 0 ? clamp((Number(part.a[k][j]) || 0) / means[j], 0, 4) : 1;
      A += WEIGHTS[t] * ratio;
      if (means[j] > 0 && WEIGHTS[t] * ratio > best) { best = WEIGHTS[t] * ratio; top = j; }
    });
    out[k] = { A, crowd: means[1] > 0 ? clamp((Number(part.a[k][1]) || 0) / means[1], 0, 4) : 1, top };
    total += A;
  }
  const scale = total > 0 ? keys.length / total : 1;
  for (const k of keys) out[k].A = r6(out[k].A * scale);
  return out;
}

// ---- NPC investors ------------------------------------------------------------------------------
// Chosen from NPC_ROSTER by who is listed and tradable, in roster order, up to NPC_MAX and
// mogulMax; once seated an NPC keeps its id for good (one whose own file is barred sells out and
// sits). New ones join only at a real-day boundary (or the first tick).
export function seatNpcs(state) {
  let moguls = Object.values(state.npc).filter(n => n.cls === "mogul").length;
  for (const [slug, cls, drive, note] of NPC_ROSTER) {
    const id = `npc:${slug}`;
    if (state.npc[id] || Object.keys(state.npc).length >= NPC_MAX) continue;
    const I = state.inst[slug];
    if (!I || I.u) continue;
    if (cls === "mogul" && moguls >= state.knobs.mogulMax) continue;
    if (cls === "mogul") moguls++;
    state.npc[id] = { slug, n: I.n, cls, drive, note, cash: NPC_CAPITAL[cls], hold: {}, w: NPC_CAPITAL[cls], since: state.day + 1, held: 0, divest: null, panic: 0 };
  }
}
export const npcWealth = (state, n) => n.cash + (n.held || 0) + sorted(n.hold).reduce((s, k) => s + n.hold[k] * (state.inst[k]?.p || 0), 0);
const shareOfFloat = (I) => I.npc / FLOAT;

// Each drive's ranked candidates, from public state only.
function rank(state, drive, npc) {
  const out = [];
  for (const k of sorted(state.inst)) {
    const I = state.inst[k];
    if (I.u || I.h) continue;
    const V = fairValue(I.s), g = Math.log(V / I.p);
    let sc = null;
    if (drive === "cautious") { if (g > 0.02) sc = g; }
    else if (drive === "speculator") { if (I.m > 0.002) sc = I.m; }
    else if (drive === "contrarian") { if (I.m < -0.002) sc = -I.m; }
    else if (drive === "fashion") { if (I.c > 1.2 && I.m >= 0) sc = I.c * (1 + 20 * I.m); }
    else if (drive === "populist") { if (I.c > 1.4) sc = I.c; }
    else if (drive === "revolutionary") { if (I.c < 0.7 && g > -0.02 && shareOfFloat(I) < 0.05) sc = (0.7 - I.c) + g; }
    else if (drive === "acquisitive") {
      // what it already holds most of first (the corner), then what is cheap and seen
      const mine = npc.hold[k] || 0;
      sc = mine / FLOAT * 10 + (g > 0 ? g : 0) + (I.c > 1 ? 0.05 * I.c : 0);
      if (sc <= 0.02) sc = null;
    }
    if (sc != null) out.push([k, sc]);
  }
  return out.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(x => x[0]);
}

// One machine day of NPC orders, decided at the current prices and settled at the new ones
// (settleNpcs): whoever moves a price pays for the move. -> {slug: net units}
function npcOrders(state, day, trades) {
  const K = state.knobs, flow = {};
  const ranks = {};
  for (const id of sorted(state.npc)) {
    const n = state.npc[id];
    // an untradable human is sold out at its last price, whatever the drive
    for (const k of sorted(n.hold)) {
      const I = state.inst[k];
      if (I && I.u && n.hold[k] > 0) { const q = n.hold[k]; n.cash += Math.floor(q * bidOf(I.p, K)); I.npc -= q; delete n.hold[k]; trades.push([id, k, -q, 1]); }
    }
    if (!state.inst[n.slug] || state.inst[n.slug].u) continue;   // an NPC whose own file is barred does not trade
    const forced = Boolean(n.divest) || n.panic > day;
    if (!forced && (day + fnv(id)) % CADENCE[n.drive] !== 0) continue;
    const sellQ = (k, q) => {
      const I = state.inst[k];
      if (!I || I.h || q <= 0) return;
      I.npc -= q; n.hold[k] -= q; if (!n.hold[k]) delete n.hold[k];
      flow[k] = (flow[k] || 0) - q; I.w.npc[id] = (I.w.npc[id] || 0) - q; trades.push([id, k, -q]);
    };
    // the deus ex machina's orders first: a divestment (antitrust, scandal, a run), a margin call
    if (n.divest) {
      for (const k of sorted(n.divest)) {
        const I = state.inst[k], keep = n.divest[k];
        if (!I || (n.hold[k] || 0) <= keep) delete n.divest[k];
        else sellQ(k, Math.min(n.hold[k] - keep, Math.max(1, Math.ceil(NPC_TURN * n.hold[k]))));
      }
      if (!Object.keys(n.divest).length) n.divest = null;
    }
    if (n.panic > day) { for (const k of sorted(n.hold)) sellQ(k, Math.max(1, Math.ceil(0.5 * n.hold[k]))); continue; }
    if ((day + fnv(id)) % CADENCE[n.drive] !== 0) continue;
    const cand = n.drive === "acquisitive" ? rank(state, n.drive, n) : (ranks[n.drive] ||= rank(state, n.drive, n));
    const off = n.drive === "acquisitive" ? 0 : fnv(id) % 3;
    // a corner the Department broke stays broken a while: no buying back what it is selling
    const pick = cand.filter(k => !(n.divest && n.divest[k]) && !((n.ban?.[k] || 0) > day)).slice(off, off + NAMES[n.drive]);
    const want = new Set(pick), keep = new Set(cand.slice(0, 3 * NAMES[n.drive]));
    const W = npcWealth(state, n);
    const budget = (NPC_INVEST * W) / NAMES[n.drive];
    // sells only what has fallen well out of favour (no churn: the spread is the Department's)
    for (const k of sorted(n.hold)) if (!keep.has(k)) sellQ(k, Math.min(n.hold[k], Math.max(1, Math.ceil(NPC_TURN * n.hold[k]))));
    // buys toward the target: inside the walls always; inside the guardrails unless the drive
    // leans on them (the acquisitive and the populist)
    const leans = n.drive === "acquisitive" || n.drive === "populist";
    const each = Math.floor((leans ? K.npcEachHard : K.npcEach) * FLOAT), all = Math.floor((leans ? K.npcHard : K.npcCap) * FLOAT);
    for (const k of pick) {
      const I = state.inst[k], ask = askOf(I.p, K);
      const held = n.hold[k] || 0, target = Math.floor(budget / ask);
      if (held >= target) continue;
      const worst = ask * Math.exp(K.tickBand) * 1.001;   // cash held back at the worst the tick can reach
      let q = Math.min(target - held, Math.max(1, Math.ceil(NPC_TURN * target)));
      q = Math.min(q, each - held, all - I.npc, Math.floor(n.cash / worst));
      if (q <= 0) continue;
      n.cash -= Math.ceil(q * worst); n.held = (n.held || 0) + Math.ceil(q * worst); I.npc += q; n.hold[k] = held + q;
      flow[k] = (flow[k] || 0) + q; I.w.npc[id] = (I.w.npc[id] || 0) + q; trades.push([id, k, q]);
    }
  }
  return flow;
}

function settleNpcs(state, trades) {
  const K = state.knobs;
  for (const [id, k, q, done] of trades) {
    if (done) continue;
    const n = state.npc[id], I = state.inst[k];
    if (q > 0) n.cash -= Math.ceil(q * askOf(I.p, K));
    else n.cash += Math.floor(-q * bidOf(I.p, K));
  }
  for (const id of sorted(state.npc)) { const n = state.npc[id]; if (n.held) { n.cash += n.held; n.held = 0; } }
}

// ---- the stabilizers ----------------------------------------------------------------------------
// Checked at each real-day boundary from the state alone. Concentration may build past the
// guardrails and polarize; each of these brings it back as an event with a reason.
function stabilize(state, day) {
  const K = state.knobs, out = [];
  // 1. A CORNER BROKEN: a human held past the NPC guardrail for two real days. The deus ex machina
  //    varies with the day (an antitrust order, a scandal, a revolutionary run on the stock); each
  //    makes the biggest NPC holder sell down to its guardrail and keeps it off that human for
  //    three real days.
  for (const k of sorted(state.inst)) {
    const I = state.inst[k];
    if (I.u) continue;
    I.over = I.npc > K.npcCap * FLOAT || Object.values(state.npc).some(n => (n.hold[k] || 0) > K.npcEach * FLOAT * 2) ? I.over + 1 : 0;
    if (I.over < 2) continue;
    const holders = sorted(state.npc).map(id => [id, state.npc[id].hold[k] || 0]).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const big = holders[0];
    if (!big || big[1] <= 0) continue;
    const N = state.npc[big[0]], who = N.n.toUpperCase(), what = I.n.toUpperCase(), pctHeld = Math.round((big[1] / FLOAT) * 100);
    let kind = ["antitrust", "scandal", "run"][fnv(`${day}|${k}`) % 3];
    if (kind === "scandal" && Math.floor(big[1] * I.p * 0.05) > N.cash) kind = "antitrust";   // a fine nobody can pay is not a story
    // every NPC holder sells down to its own guardrail, and the class together to 90% of its
    // guardrail (pro rata: a herd of NPCs each at its limit is still a corner); the biggest stays
    // off it for three days
    const total = holders.reduce((s2, [, q]) => s2 + q, 0);
    for (const [id, q] of holders) {
      if (q <= 0) continue;
      const keep = Math.min(Math.floor(K.npcEach * FLOAT), total > K.npcCap * FLOAT ? Math.floor((q * 0.9 * K.npcCap * FLOAT) / total) : q);
      if (q <= keep) continue;
      const H = state.npc[id];
      (H.divest ||= {})[k] = keep;
      (H.ban ||= {})[k] = day + (id === big[0] ? 3 : 1) * MACHINE_DAYS_PER_REAL_DAY;
    }
    I.over = 0; I.w.ev = kind;
    let line;
    if (kind === "antitrust") line = `ANTITRUST. ${who} HELD ${pctHeld}% OF ${what}. THE DEPARTMENT ORDERS A SALE. IT DOES NOT ENJOY THIS. IT DOES NOT NOT ENJOY IT.`;
    else if (kind === "scandal") {
      const fine = Math.min(N.cash, Math.floor(big[1] * I.p * 0.05));
      N.cash -= fine; state.levy[state.rd] = (state.levy[state.rd] || 0) + fine;
      line = `SCANDAL ON THE FLOOR, AND IT IS ${who}'S: ${pctHeld}% OF THE SHARES IN ${what}, BOUGHT QUIETLY. FINED ${fine.toLocaleString("en-US")} CYCLES, PAID TO EVERY CITIZEN AS A DIVIDEND. THE SHARES GO BACK ON THE MARKET.`;
    } else {
      I.x = r6(I.x - 0.05);
      line = `A RUN ON ${what}. THE REVOLUTIONARIES CALLED IT A CORNER; ${who} CALLED IT A PORTFOLIO. THE FLOOR SIDED WITH THE REVOLUTIONARIES. ${who} SELLS.`;
    }
    event(state, day, kind, line, { slug: k, npc: big[0] });
    out.push(kind);
  }
  // 2. MARGIN CALL: the index up 20% in two real days (a bubble): the speculators and the crowd's
  //    followers sell half of everything, every tick, for the next sixth of a day.
  const cl = state.hvi.cl;
  if (cl.length >= 2 && state.hvi.level > cl[cl.length - 2] * 1.2 && !state.events.some(e => e.kind === "margin" && day - e.day < 180)) {
    for (const id of sorted(state.npc)) { const n = state.npc[id]; if (n.drive === "speculator" || n.drive === "fashion") n.panic = day + 10; }
    event(state, day, "margin", "MARGIN CALL. THE INDEX ROSE A FIFTH IN TWO DAYS. THE SPECULATORS REMEMBERED GRAVITY ALL AT ONCE.");
    out.push("margin");
  }
  // 3. THE EMERGENCY SESSION: three NPC fortunes hold more than half of all NPC wealth. The
  //    Assembly's emergency ballot triples the levy for three days and the revolutionaries take to
  //    the floor (their boycotts triple for a day). At most once a week.
  const wealth = sorted(state.npc).map(id => [state.npc[id], npcWealth(state, state.npc[id])]).sort((a, b) => b[1] - a[1]);
  const total = wealth.reduce((s, [, w]) => s + w, 0), top3 = wealth.slice(0, 3).reduce((s, [, w]) => s + w, 0);
  if (total > 0 && top3 / total > 0.5 && !(state.emergency && day - state.emergency.from < 7 * MACHINE_DAYS_PER_REAL_DAY)) {
    state.emergency = { from: day, until: day + 3 * MACHINE_DAYS_PER_REAL_DAY, rate: Math.min(0.01, K.levyRate * 3), run: day + MACHINE_DAYS_PER_REAL_DAY };
    const names = wealth.slice(0, 3).map(([n]) => n.n.toUpperCase()).join(", ");
    event(state, day, "emergency", `EMERGENCY SESSION. ${names} HOLD ${Math.round((top3 / total) * 100)}% OF THE FLOOR'S WEALTH. THE ASSEMBLY TRIPLES THE LEVY FOR THREE DAYS. THE REVOLUTIONARIES TAKE TO THE FLOOR.`);
    out.push("emergency");
  }
  return out;
}

// ---- the real-day boundary ---------------------------------------------------------------------
// Closes the day just ended: each human's close, the NPC levy (into state.levy[day], which the
// daily close pays out as the citizens' dividend), the knobs voted for the new day, the
// stabilizers, fresh opens and lifted halts. Then seats any NPC newly listed.
export function rollDay(state, newRd, day) {
  const K = state.knobs, closed = state.rd;
  for (const k of sorted(state.inst)) { const I = state.inst[k]; I.cl.push(I.p); if (I.cl.length > CLOSES_KEPT) I.cl.splice(0, I.cl.length - CLOSES_KEPT); }
  state.hvi.cl.push(state.hvi.level); if (state.hvi.cl.length > CLOSES_KEPT) state.hvi.cl.splice(0, state.hvi.cl.length - CLOSES_KEPT);
  const rate = state.emergency && day < state.emergency.until ? state.emergency.rate : K.levyRate;
  let pool = 0;
  for (const id of sorted(state.npc)) {
    const n = state.npc[id], W = npcWealth(state, n);
    n.w = Math.round(W);
    if (W > K.levyFloor) {
      const due = Math.floor((W - K.levyFloor) * rate * (n.drive === "populist" ? 0.5 : 1));   // the populist's loophole
      const L = Math.min(n.cash, due);
      if (L > 0) { n.cash -= L; pool += L; }
    }
  }
  if (pool) state.levy[closed] = (state.levy[closed] || 0) + pool;
  for (const d of sorted(state.levy).slice(0, -14)) delete state.levy[d];
  if (state.next) { state.knobs = knobsOf(state.next); state.next = null; }
  const fired = stabilize(state, day);
  for (const k of sorted(state.inst)) { const I = state.inst[k]; I.o = I.p; I.h = I.u ? 1 : 0; I.w = freshWhy(); }
  state.hvi.open = state.hvi.level;
  state.rd = newRd;
  seatNpcs(state);
  return { closed, levy: pool, fired };
}

// ---- one machine day ----------------------------------------------------------------------------
// orders: the players' batch for this tick, as journaled (netlify/lib/market.js), any order:
// [{id, case_hash, slug, side: buy|sell, amount (buy, CYCLES escrowed), units (sell), held (the
// holder's shares in that human when the batch was read)}]. A batch auction: every order's
// estimated shares (at the pre-tick price) join the NPCs' flow, the price moves once, and every
// order fills at the new price (ASK / BID). -> the tick, with fills [{id, units, cash, price, note}].
export function step(state, { day, part = null, orders = [], noise = () => 0 }) {
  if (day !== state.day + 1) throw new Error(`market: day ${day} after ${state.day}`);
  const rd = realDayOf(day);
  let roll = null;
  if (rd !== state.rd) roll = rollDay(state, rd, day);
  const K = state.knobs;
  // the universe: every human the part names; flags bit 1 = untradable
  if (part?.n) {
    for (const k of sorted(part.n)) {
      const [name, dead, fl] = part.n[k];
      if (!state.inst[k]) { if (fl & 1) continue; list(state, k, name, dead, day); }
      const I = state.inst[k];
      const off = (fl & 1) || (!K.listLiving && !dead) || (state.delist || []).includes(k);
      if (off) { I.u = 1; I.h = 1; } else if (I.u) { I.u = 0; }
    }
  }
  if (!state.ticks) seatNpcs(state);
  // the day's news
  const act = activityOf(part, (k) => state.inst[k] && !state.inst[k].u);
  for (const k of sorted(state.inst)) {
    const I = state.inst[k], x = act[k];
    if (!x) continue;
    if (I.fresh) {   // a new listing opens at what it did on its first day, not at the average
      I.s = x.A; I.r = x.A; I.c = x.crowd; I.p = I.o = fairValue(I.s); delete I.fresh;
    }
    const V0 = fairValue(I.s);
    I.A = x.A; I.a = part.a[k]; I.t = x.top;
    I.s = r6(I.s + ALPHA * (x.A - I.s));
    I.r = r6((I.r ?? I.s) + 0.2 * (x.A - (I.r ?? I.s)));   // RECENT: the last few machine days, what the board shows against the record
    I.c = r6(I.c + ALPHA * (x.crowd - I.c));
    I.w.news = r6(I.w.news + Math.log(fairValue(I.s) / V0));
  }
  // order flow: the NPCs, then the players' batch (estimated at the pre-tick price, inside the caps)
  const trades = [];
  const flow = npcOrders(state, day, trades);
  const est = [], held = new Map(), bought = {};
  const cap = Math.floor(K.positionCap * FLOAT);
  for (const o of [...orders].sort((a, b) => a.id - b.id)) {
    const I = state.inst[o.slug];
    // an unlisted human can still be sold, at its last price (a holder is never trapped); a halted one cannot
    if (!I || (I.u && o.side === "buy") || (I.h && !I.u)) { est.push([o, 0, !I || I.u ? "UNLISTED" : "HALTED"]); continue; }
    const hk = `${o.case_hash}|${o.slug}`;
    const have = held.has(hk) ? held.get(hk) : Number(o.held) || 0;
    let u;
    if (o.side === "buy") {
      u = Math.floor(Number(o.amount) / askOf(I.p, K));
      u = Math.max(0, Math.min(u, cap - have, FLOAT - I.pl - I.npc - (bought[o.slug] || 0)));
      bought[o.slug] = (bought[o.slug] || 0) + u;
      held.set(hk, have + u);
      flow[o.slug] = (flow[o.slug] || 0) + u;
    } else {
      u = Math.max(0, Math.min(Number(o.units) || 0, have));
      held.set(hk, have - u);
      flow[o.slug] = (flow[o.slug] || 0) - u;
    }
    I.w.pl += o.side === "buy" ? u : -u;
    est.push([o, u, u ? null : o.side === "buy" ? "CAP" : "NONE"]);
  }
  // the boycotts: each revolutionary takes a little off the most cornered human (a run triples it)
  const revs = sorted(state.npc).filter(id => state.npc[id].drive === "revolutionary" && state.inst[state.npc[id].slug] && !state.inst[state.npc[id].slug].u).length;
  let target = null;
  if (revs) {
    let best = K.npcCap * 0.6 * FLOAT;
    for (const k of sorted(state.inst)) { const I = state.inst[k]; if (!I.u && !I.h && I.npc > best) { best = I.npc; target = k; } }
  }
  const run = state.emergency && day < state.emergency.run ? 3 : 1;
  // the tick
  const halts = [];
  let sum = 0, n = 0;
  for (const k of sorted(state.inst)) {
    const I = state.inst[k];
    if (!I.u && !I.h) {
      const V = fairValue(I.s), f = (flow[k] || 0) / FLOAT;
      let x = (1 - KAPPA) * I.x + LAMBDA * f + SIGMA * 1.7 * noise(day, k);
      if (k === target) { x -= BOYCOTT * revs * run; I.w.ev ||= "boycott"; }
      // the audit: a human priced past 1.65x what they did is repriced (the scandal)
      if (x > 0.5) { x = 0.1; I.w.ev = "audit"; event(state, day, "audit", `AUDIT. ${I.n.toUpperCase()} TRADED AT ${(I.p / V).toFixed(1)}X WHAT THEY DID. THE DEPARTMENT LOOKED. THE PRICE LOOKED AWAY.`, { slug: k }); }
      I.w.flow = r6(I.w.flow + LAMBDA * f);
      const r = clamp(Math.log(V / I.p) + x, -K.tickBand, K.tickBand);
      let p = Math.max(1, r2(I.p * Math.exp(r)));
      const lo = r2(I.o * (1 - K.dayBand)), hi = r2(I.o * (1 + K.dayBand));
      if (p >= hi || p <= lo) { p = p >= hi ? hi : lo; if (K.halts) { I.h = 1; halts.push(k); I.w.ev ||= "halt"; } }
      I.x = r6(clamp(Math.log(p / V), -1, 1));
      I.m = r6((1 - MOM) * I.m + MOM * Math.log(p / I.p));
      I.p = p;
    }
    if (!I.u) { sum += I.p; n++; }
  }
  // the fills, at the new price: the NPCs', then the players'
  settleNpcs(state, trades);
  const fills = [];
  for (const [o, u, note] of est) {
    const I = state.inst[o.slug];
    if (!u) { fills.push({ id: o.id, units: 0, cash: 0, price: I ? I.p : null, note }); continue; }
    if (o.side === "buy") {
      const ask = askOf(I.p, K), uu = Math.min(u, Math.floor(Number(o.amount) / ask));
      I.pl += uu;
      fills.push({ id: o.id, units: uu, cash: uu ? Math.ceil(uu * ask) : 0, price: ask, note: uu ? null : "PRICE" });
    } else {
      const bid = bidOf(I.p, K);
      I.pl -= u;
      fills.push({ id: o.id, units: u, cash: Math.floor(u * bid), price: bid, note: null });
    }
  }
  state.hvi.level = n ? r4((HVI_BASE * sum) / n / BASE_PRICE) : state.hvi.level;
  state.day = day; state.ticks++;
  return { day, rd, roll, hvi: state.hvi.level, halts, trades, fills, news: part ? 1 : 0 };
}

// Replays days onto a copy of `from`: inputs [{day, part, orders}]. -> the state.
export function replay(from, inputs, noise) {
  const s = clone(from);
  for (const x of inputs) step(s, { ...x, noise });
  return s;
}

// ---- reading ------------------------------------------------------------------------------------
export const changeOf = (I) => (I.o > 0 ? I.p / I.o - 1 : 0);
// The richest NPCs, valued now.
export function npcBoard(state) {
  return sorted(state.npc).map(id => { const n = state.npc[id]; return { id, slug: n.slug, name: n.n, cls: n.cls, drive: n.drive, note: n.note, worth: Math.round(npcWealth(state, n)), cash: n.cash, held: sorted(n.hold).map(k => [k, n.hold[k]]).sort((a, b) => b[1] - a[1]) }; })
    .sort((a, b) => b.worth - a.worth || (a.id < b.id ? -1 : 1));
}

// "Because": one in-world line for today's move of a human, from the largest of what moved it
// (the city's news, an NPC's orders, the citizens' orders, an event). Living people get facts
// about their citizen's day in the city only; NPC names appear only as who bought or sold.
const TERM_LINES = {
  work: (v) => `WORKED ${Math.max(1, Math.round(v))} WEIGHTED HOURS.`,
  crowd: (v) => `SEEN BY ${Math.round(v * 2)} IN PUBLIC.`,
  sport: () => "STRONG FORM FOR THE DISTRICT.",
  play: (v) => `OUT ${Math.max(1, Math.round(v))}H AFTER WORK.`,
  civic: () => "HOLDS A COUNCIL SEAT.",
};
export function whyOf(state, k) {
  const I = state.inst[k];
  if (!I) return "";
  if (I.u) return "NOT LISTED. THE DEPARTMENT DOES NOT TRADE IN EVERYONE.";
  const w = I.w || freshWhy();
  const ev = { antitrust: "ANTITRUST: AN NPC HOLDER ORDERED TO SELL.", scandal: "SCANDAL: ITS BIGGEST HOLDER FINED AND SELLING.", run: "A RUN: THE REVOLUTIONARIES BROKE A CORNER.", audit: "AUDITED: THE PRICE HAD LEFT THE PERSON BEHIND.", boycott: "BOYCOTTED BY THE REVOLUTIONARIES: CORNERED BY THE RICH.", halt: "HALTED: THE DAY'S BAND HELD." }[w.ev];
  const top = sorted(w.npc).map(id => [id, w.npc[id]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || (a[0] < b[0] ? -1 : 1))[0];
  const npcMove = top ? Math.abs(LAMBDA * top[1] / FLOAT) : 0, plMove = Math.abs(LAMBDA * w.pl / FLOAT), news = Math.abs(w.news);
  const parts = [];
  if (ev && w.ev !== "halt") parts.push(ev);
  if (news >= npcMove && news >= plMove && news > 0.002 && I.a) {
    const t = TERMS[I.t ?? 0];
    parts.push(`${w.news > 0 ? "UP" : "DOWN"} ON THE CITY'S RECORD: ${TERM_LINES[t](Number(I.a[I.t ?? 0]) || 0)}`);
  } else if (top && npcMove >= plMove && npcMove > 0.002) {
    const n = state.npc[top[0]];
    const why = n?.divest?.[k] ? "THE DEPARTMENT ORDERED IT" : n && top[1] < 0 && n.panic ? "THE MARGIN CALL CAME" : n && top[1] < 0 ? "IT HAD STOPPED WANTING IT" : n ? DRIVE_REASONS[n.drive] : null;
    parts.push(because({ who: n ? n.n : "AN INVESTOR", did: `${top[1] > 0 ? "BOUGHT" : "SOLD"} ${Math.abs(top[1]).toLocaleString("en-US")} SHARES`, why }));
  } else if (plMove > 0.002) {
    parts.push(`CITIZENS ${w.pl > 0 ? "BOUGHT" : "SOLD"} ${Math.abs(w.pl).toLocaleString("en-US")} SHARES.`);
  } else if (!parts.length) {
    parts.push(I.a ? `A QUIET DAY ON THE RECORD. ${TERM_WORDS[TERMS[I.t ?? 0]]} LED.` : "NO NEWS FROM THE CITY. THE PRICE DRIFTS ON MOOD.");
  }
  if (w.ev === "halt") parts.push(ev);
  return parts.join(" ");
}
