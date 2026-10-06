// THE MARKET's simulation harness (scripts/check-market.mjs and tuning): a synthetic city's
// activity and a population of players with named strategies, driven through the real engine
// (src/market/engine.js). Deterministic: every draw is a hash of its inputs.
import * as E from "../src/market/engine.js";
import { KNOBS, NPC_ROSTER, FLOAT, askOf, bidOf, TARGETS } from "../src/market/rules.js";

const u01 = (s) => E.fnv(s) / 4294967296;
const gauss = (s) => { let x = 0; for (let i = 0; i < 6; i++) x += u01(`${s}|${i}`); return (x - 3) / Math.sqrt(0.5); };
export const hashNoise = (salt = "sim") => (day, slug) => { let x = 0; for (let i = 0; i < 3; i++) x += u01(`${salt}|${day}|${slug}|${i}`) * 2 - 1; return x / 3; };

// A synthetic city of `n` humans plus the NPC roster's slugs (so the NPC class is seated), with
// persistent talents, a weekly rhythm, streaks (a good run of matches or shows) and bad spells.
export function cityOf(n = 160, seed = "c") {
  const slugs = [...NPC_ROSTER.map(r => r[0]), ...Array.from({ length: n }, (_, i) => `h${String(i).padStart(4, "0")}`)];
  const talent = Object.fromEntries(slugs.map(k => [k, Math.exp(0.45 * gauss(`${seed}|t|${k}`))]));
  return {
    slugs,
    part(day) {
      const a = {}, nn = {};
      for (const k of slugs) {
        nn[k] = [k.toUpperCase(), NPC_ROSTER.some(r => r[0] === k) ? 1 : 0, k === "h0003" ? 1 : 0];   // h0003: untradable
        // measured on production days 601-604: per-person sd of log activity ~0.22 day to day
        const streak = Math.floor(day / 90) % 7 === E.fnv(`${seed}|${k}`) % 7 ? 1.35 : 1;
        const slump = Math.floor(day / 130) % 9 === E.fnv(`${seed}|s|${k}`) % 9 ? 0.7 : 1;
        const t = talent[k] * streak * slump * Math.exp(0.18 * gauss(`${seed}|d|${day}|${k}`));
        const r = (j) => Math.max(0, Math.round(t * (1 + 0.15 * gauss(`${seed}|${j}|${day}|${k}`)) * 100) / 100);
        a[k] = [r(0) * 3, r(1) * 40, E.fnv(k) % 3 === 0 ? r(2) * 0.6 : 0, r(3) * 4.5, E.fnv(k) % 40 === 0 ? r(4) : 0];
      }
      return { v: 1, day, n: nn, a };
    },
  };
}

// Players. Each acts once a real day (at the first tick of it), from public state only.
//   idle      collects weekly, never invests          saver   collects daily, never invests
//   worker    collects daily + the labour wage         savvy   collects daily, buys V > P, sells V <= P
//   both      savvy + the wage                         chaser  buys yesterday's biggest risers
export function runSim({ days = 30, n = 160, players = [], knobs = KNOBS, seed = "c", start = 601, onDay = null } = {}) {
  const city = cityOf(n, seed), noise = hashNoise(seed);
  const s = E.initState(start, knobs);
  const P = players.map((p, i) => ({ ...p, h: `p${i}`, cash: 0, esc: 0, hold: {}, lock: {}, orders: [], worth: [], wage: 0 }));
  let oid = 0;
  const T = days * 60;
  for (let t = 0; t < T; t++) {
    const day = start + t;
    // the players' decisions at the start of each real day
    if (t % 60 === 0) {
      const rdIdx = t / 60;
      for (const p of P) {
        const ubi = 700;
        if (p.kind === "idle") { if (rdIdx % 7 === 6) p.cash += ubi * 7; }
        else p.cash += ubi;
        if (p.kind === "worker" || p.kind === "both") { p.cash += TARGETS.wagePerDay; p.wage += TARGETS.wagePerDay; }
        // holder: puts half of each allowance into one human a day (its own pick by a hash), holds a week
        if (p.kind === "holder") {
          const inst = Object.keys(s.inst).filter(k => !s.inst[k].u && !s.inst[k].h);
          for (const [k, units] of Object.entries(p.hold)) if (units && (p.lock[k] || 0) + 6 * 60 <= t && !s.inst[k]?.h) { p.orders.push({ id: ++oid, case_hash: p.h, slug: k, side: "sell", units, held: units }); p.hold[k] = 0; }
          const k = inst[E.fnv(`${p.h}|${rdIdx}`) % Math.max(1, inst.length)];
          const amt = Math.floor(p.cash / 2);
          if (k && amt >= 100) { p.orders.push({ id: ++oid, case_hash: p.h, slug: k, side: "buy", amount: amt, held: p.hold[k] || 0 }); p.cash -= amt; p.esc += amt; }
        }
        if (p.kind === "savvy" || p.kind === "both" || p.kind === "chaser") {
          const inst = Object.entries(s.inst).filter(([, I]) => !I.u && !I.h);
          for (const [k, units] of Object.entries(p.hold)) {
            const I = s.inst[k];
            if (!units || (p.lock[k] || 0) > t || !I || I.h) continue;
            const sell = true;   // both read the board afresh each morning: everything unlocked goes back
            if (sell) { p.orders.push({ id: ++oid, case_hash: p.h, slug: k, side: "sell", units, held: units }); p.hold[k] = 0; }
          }
          let ranked;
          if (p.kind === "chaser") ranked = inst.sort((a, b) => E.changeOf(b[1]) - E.changeOf(a[1]) || (a[0] < b[0] ? -1 : 1));
          // savvy: reads the board (today's activity against the record's average, and the price against fair value)
          else { const sc = ([, I]) => Math.log(Math.max(0.05, I.r ?? I.s) / Math.max(0.05, I.s)) - I.x; ranked = inst.filter(x => sc(x) > 0.05).sort((a, b) => sc(b) - sc(a) || (a[0] < b[0] ? -1 : 1)); }
          const off = (E.fnv(p.h) % 2) * 3;   // players differ: each takes its own three from the top six
          const pick = ranked.slice(off, off + 3).length ? ranked.slice(off, off + 3) : ranked.slice(0, 3);
          p.cash += 0;
          const each = Math.floor(p.cash / Math.max(1, pick.length));
          for (const [k] of pick) if (each >= 100) { p.orders.push({ id: ++oid, case_hash: p.h, slug: k, side: "buy", amount: each, held: p.hold[k] || 0 }); p.cash -= each; p.esc += each; }
        }
      }
    }
    const orders = P.flatMap(p => p.orders);
    const tick = E.step(s, { day, part: city.part(day), orders, noise });
    const byId = new Map(orders.map(o => [o.id, o]));
    for (const f of tick.fills) {
      const o = byId.get(f.id), p = P.find(x => x.h === o.case_hash);
      if (o.side === "buy") { p.esc -= o.amount; p.cash += o.amount - f.cash; if (f.units) { p.hold[o.slug] = (p.hold[o.slug] || 0) + f.units; p.lock[o.slug] = t + 60; } }
      else { p.cash += f.cash; p.hold[o.slug] = (p.hold[o.slug] || 0) + (o.units - f.units); }
    }
    for (const p of P) p.orders = [];
    if ((t + 1) % 60 === 0) for (const p of P) p.worth.push(Math.round(p.cash + p.esc + Object.entries(p.hold).reduce((x, [k, u]) => x + u * (s.inst[k]?.p || 0), 0)));
    if (onDay) onDay(s, tick, t);
  }
  return { state: s, players: P };
}

export const worthOf = (state, p) => Math.round(p.cash + p.esc + Object.entries(p.hold).reduce((x, [k, u]) => x + u * (state.inst[k]?.p || 0), 0));
export { askOf, bidOf, FLOAT };
