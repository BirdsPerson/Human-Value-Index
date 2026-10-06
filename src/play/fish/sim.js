// THE WATERS, a fishing trip, sim v2 (the simple one): a pure, fixed-step (60 Hz) state machine like
// the links (golf/sim.js). No DOM, no clock, no Math.random, no transcendental Math: newTrip(cfg) and
// the same per-tick input give the same trip, tick for tick, in any engine. A trip is
// {v, cfg, inputLog}; the aquarium (netlify/functions/aquarium.js, via replay.js) replays it to check
// a donated catch. v1 (the power meter, four lures, the tension gauge) is frozen in ./v1/sim.js and
// is the page's EXPERT mode; its trips still replay and verify there.
//
// cfg: {seed, spot, at (real ms the trip began: the machine clock, the season, the light and the
// weather follow from it and the tick), player: {name}}.
//
// One button, Animal Crossing's way. AIM with LEFT/RIGHT (or a click on the water: the log carries
// the aim, see AIM_CODES); A casts there. The bobber sits; a fish comes to it, NIBBLES (small dips),
// then BITES (the float plunges): A inside the window hooks it. A on a nibble scares that fish off,
// the one bit of skill; A with nothing on the line reels in to cast again. Then hold A (or mash it)
// to reel: a few seconds, longer for a big or rare fish, which tugs (reeling slows). Nothing snaps,
// nothing throws the hook. Landed: KEEP (A) or RELEASE (B), as in v1.
//
// The water is v1's water: the same seeding, the same spawn (species by the hour's appetites, the
// weight fixed at spawn with the same draws), so the odds and sizes on the record board compare.

import { SPOT, SPECIES_BY, speciesAt, appetite, conditionsAt, lengthOf, rngStep, fnv, HZ, WX_CAST } from "./data.js";
import { spotOf, bottomAt, logPush, logTicks } from "./v1/sim.js";

export const VERSION = 2;
export { HZ, spotOf, bottomAt, logPush, logTicks };
export const BTN = { L: 1, R: 2, U: 4, D: 8, A: 16, B: 32 };
export const TRIP_TICKS = 2 * 3600 * HZ;          // two real hours (two machine days); then the water closes
// The log's numbers: button bits (0-63), plus, on the tick a click picks the spot, an aim code
// (1..AIM_STEPS+1, the aim (code-1)/AIM_STEPS) in the bits above: bits | code << 6.
export const AIM_STEPS = 32, MAX_BITS = 63 | ((AIM_STEPS + 1) << 6);
export const aimBits = (aim) => (Math.max(0, Math.min(AIM_STEPS, Math.round(aim * AIM_STEPS))) + 1) << 6;
export const AIM_RATE = 1 / 70;                    // aim per tick with LEFT/RIGHT held (a sweep in ~1.2 s)
export const BITE_WINDOW = 48;                     // ticks to answer a bite (0.8 s; v1 gave 12-30)
export const LAND_AT = 1.5;
// the bait each water gets (shown, and written on the catch); the fish take it as their favourite
export const SPOT_LURE = { pier: "minnow", break: "minnow", estuary: "minnow", river: "worm", lake: "worm" };
export const lureAt = (spotId) => SPOT_LURE[spotId] || "worm";

// a fish's work at the reel: seconds of holding A. 2.5 s for a small one, up to ~9 s for a big
// strong one, +3 s for a legend.
export function reelSecs(s, cw) {
  const frac = (cw / 100 - s.lb[0]) / (s.lb[1] - s.lb[0] || 1);
  return 2.5 + 4.5 * s.power * (0.4 + 0.6 * frac) + (s.legend ? 3 : 0);
}
export const castX = (spot, aim, weather) => 4 + aim * (spot.cast * (WX_CAST[weather] ?? 1) - 4);

// ---- a new trip -------------------------------------------------------------------------------------
export function newTrip(cfg) {
  const seed = (cfg.seed >>> 0) || 1;
  const spot = SPOT[cfg.spot] ? cfg.spot : "pier";
  const at = Number.isFinite(cfg.at) ? Math.floor(cfg.at) : 0;
  const st = {
    v: VERSION, cfg: { seed, spot, at, player: cfg.player || null },
    rng: fnv(`fish|${seed}|${spot}|${at}`), tick: 0, t: 0, prev: 0, phase: "ready",
    aim: 0.6, lure: lureAt(spot), fl: null, bob: null, fish: [], nextId: 1, reel: null, catches: [], last: null,
    cond: conditionsAt(at, 0), msg: "", tone: "", ev: [], tug: 0,
  };
  const n = target(st);
  for (let i = 0; i < n; i++) spawn(st);
  return st;
}
function rand(st) { const [v, n] = rngStep(st.rng); st.rng = n; return v; }
const target = (st) => 4 + (st.cond.weather === "OVERCAST" || st.cond.weather === "RAIN" ? 1 : 0);

// A fish arrives: v1's spawn, draw for draw (the species by the hour's appetites, its weight fixed now).
function spawn(st) {
  const spot = spotOf(st), list = speciesAt(spot.id);
  const w = list.map(s => appetite(s, st.cond));
  const tot = w.reduce((a, b) => a + b, 0);
  if (!(tot > 0)) return null;
  let r = rand(st) * tot, i = 0;
  while (i < list.length - 1 && r >= w[i]) { r -= w[i]; i++; }
  const s = list[i];
  const x = 4 + rand(st) * (spot.cast * 1.05 - 4);
  const b = bottomAt(spot, x), d = b * (s.band[0] + rand(st) * (s.band[1] - s.band[0]));
  const u = rand(st);
  const cw = Math.round((s.lb[0] + (s.lb[1] - s.lb[0]) * (u * u + u * u * u) / 2) * 100);
  const f = { id: st.nextId++, sp: s.id, cw, x, d, vx: (rand(st) - 0.5) * 0.03, st: "roam", t: 0, nib: 0, next: 0, life: 1800 + Math.floor(rand(st) * 3600) };
  st.fish.push(f);
  return f;
}

// ---- the bot (scripts/check-fish.mjs, and WATCH THE WARDEN FISH): bits from the state alone ----------
export function botBits(st) {
  const A = BTN.A;
  switch (st.phase) {
    case "ready": return st.prev & A || st.t < 12 ? 0 : A;
    case "fishing": return st.fish.some(f => f.st === "bite" && f.t >= 8) && !(st.prev & A) ? A : 0;
    case "reel": return A;
    case "landed": return st.t > 32 && !(st.prev & A) ? A : 0;
    default: return 0;
  }
}

// ---- one tick -----------------------------------------------------------------------------------------
export function step(st, input = 0) {
  if (st.phase === "done") return st;
  const code = (input >>> 6) & 63, bits = input & 63;
  const pressed = bits & ~st.prev;
  st.prev = bits; st.tick++; st.t++;
  if (st.tug > 0) st.tug--;
  if (st.tick % HZ === 0) st.cond = conditionsAt(st.cfg.at, st.tick);
  if (st.tick >= TRIP_TICKS) { st.phase = "done"; st.msg = `${spotOf(st).name} CLOSES. THE TRIP IS FILED.`; st.ev.push("done"); return st; }
  const spot = spotOf(st);
  switch (st.phase) {
    case "ready":
      if (code >= 1 && code <= AIM_STEPS + 1) st.aim = (code - 1) / AIM_STEPS;
      if (bits & (BTN.R | BTN.U)) st.aim = Math.min(1, st.aim + AIM_RATE);
      if (bits & (BTN.L | BTN.D)) st.aim = Math.max(0, st.aim - AIM_RATE);
      if (pressed & BTN.A && st.t > 6) {
        const x = castX(spot, st.aim, st.cond.weather);
        st.fl = { x, ticks: 24 + Math.round(x * 0.6) };
        st.phase = "flight"; st.t = 0; st.ev.push("cast");
      }
      break;
    case "flight":
      if (st.t >= st.fl.ticks) {
        const x = st.fl.x;
        st.bob = { x, d: bottomAt(spot, x) * 0.55, motion: 0, pop: 0, bare: false, lure: st.lure, wait: 0 };
        st.phase = "fishing"; st.t = 0; st.ev.push("splash");
        st.msg = `${Math.round(x)} YARDS. WAIT FOR THE FLOAT TO GO UNDER. A NIBBLE IS NOT A BITE.`;
        st.tone = "";
        // a wary fish right under the splash bolts
        for (const f of st.fish) if (f.st === "roam" && Math.abs(f.x - x) < 2 && SPECIES_BY[f.sp].wary > 0.5 && rand(st) < 0.6) flee(st, f);
      }
      break;
    case "fishing": fishing(st, pressed, spot); break;
    case "reel": reel(st, bits, pressed, spot); break;
    case "landed":
      if (st.t > 30 && (pressed & (BTN.A | BTN.B))) {
        const c = st.catches[st.catches.length - 1], s = SPECIES_BY[c.sp];
        if (pressed & BTN.A && !s.protected) { c.fate = "keep"; st.msg = "KEPT. IN THE TACKLE BOX. THE DEPARTMENT HAS WEIGHED IT TOO."; }
        else { c.fate = "release"; st.msg = s.protected && pressed & BTN.A ? "PROTECTED. RELEASED BY LAW. THE LAW THANKS YOU." : "RELEASED. IT WILL REMEMBER YOU."; }
        st.ev.push(c.fate);
        st.phase = "ready"; st.t = 0; st.bob = null; st.tone = "";
      }
      break;
  }
  waters(st, spot);
  return st;
}

// the float in the water, and the fish that come to it (one at a time)
function fishing(st, pressed, spot) {
  const b = st.bob;
  b.wait++;
  if (pressed & BTN.A) {
    const biter = st.fish.find(f => f.st === "bite");
    if (biter) return hook(st, biter);
    const nibbler = st.fish.find(f => f.st === "nibble");
    if (nibbler) { flee(st, nibbler); st.msg = "TOO EARLY. THAT WAS A NIBBLE. IT LEFT. ANOTHER WILL COME."; st.tone = "warn"; st.ev.push("miss"); return; }
    const looker = st.fish.find(f => f.st === "look");
    if (looker) { looker.st = "roam"; looker.t = 0; }
    st.msg = "REELED IN. NOTHING. NOTED."; st.tone = "";
    st.phase = "ready"; st.t = 0; st.bob = null; st.ev.push("reel");
    return;
  }
  const busy = st.fish.some(f => f.st === "look" || f.st === "nibble" || f.st === "bite");
  for (const f of st.fish) {
    if (f.st === "roam") {
      if (busy || (st.tick + f.id) % 15) continue;
      const s = SPECIES_BY[f.sp];
      // the float draws them in: the reach grows a yard a second while you wait
      const sense = (8 + b.wait / HZ) * (st.cond.weather === "FOG" ? 0.75 : 1);
      const dist = Math.abs(f.x - b.x);
      if (dist >= sense) continue;
      const hungry = Math.max(0.3, Math.min(2, appetite(s, st.cond) / s.rate));
      if (rand(st) < 0.3 * (1 - dist / sense) * hungry) { f.st = "look"; f.t = 0; return; }
    } else if (f.st === "look") {
      const dx = b.x - f.x, dd = b.d - f.d;
      f.x += Math.max(-0.05, Math.min(0.05, dx));
      f.d += Math.max(-0.08, Math.min(0.08, dd));
      if (Math.abs(dx) < 0.4 && Math.abs(dd) < 0.6) {
        const s = SPECIES_BY[f.sp];
        f.st = "nibble"; f.t = 0; f.nib = 1 + Math.floor(rand(st) * 3) + (s.wary > 0.5 ? 1 : 0);
        f.next = 40 + Math.floor(rand(st) * 50);
      } else if (f.t > 1200) { f.st = "roam"; f.t = 0; }
    } else if (f.st === "nibble") {
      f.x = b.x; f.d = b.d;
      if (f.t >= f.next) {
        if (f.nib > 0) { f.nib--; st.tug = 10; st.ev.push("nibble"); f.next = f.t + 45 + Math.floor(rand(st) * 55); st.msg = "A NIBBLE. NOT YET."; st.tone = ""; }
        else { f.st = "bite"; f.t = 0; f.next = BITE_WINDOW; st.tug = BITE_WINDOW; st.ev.push("bite", "splash"); st.msg = "IT BIT. PRESS A."; st.tone = "good"; }
      }
    } else if (f.st === "bite") {
      f.x = b.x; f.d = b.d;
      if (f.t > f.next) { st.msg = "TOO SLOW. IT TOOK A LOOK AT YOU AND LEFT."; st.tone = "warn"; st.ev.push("miss"); flee(st, f); }
    }
  }
}
function flee(st, f) { f.st = "flee"; f.t = 0; f.vx = f.x > 20 ? 0.12 : -0.12; }

function hook(st, f) {
  const s = SPECIES_BY[f.sp];
  f.st = "hooked";
  for (const o of st.fish) if (o !== f && o.st !== "roam" && o.st !== "flee") { o.st = "roam"; o.t = 0; }
  const secs = reelSecs(s, f.cw);
  st.reel = { fid: f.id, x0: Math.max(LAND_AT + 0.5, st.bob.x), p: 0, rate: 1 / (secs * HZ), secs, tugT: 0, tap: -99, big: secs > 4.5 };
  st.phase = "reel"; st.t = 0; st.tug = 0;
  st.msg = s.legend ? "HOOKED. SOMETHING OLD. HOLD A TO REEL." : "HOOKED. HOLD A TO REEL.";
  st.tone = "good";
  st.ev.push("hook");
}

// the reel: hold A to bring it in; a big fish tugs now and then (reeling slows to a third). Letting go
// costs nothing but time: it drifts back a little.
function reel(st, bits, pressed, spot) {
  const R = st.reel, f = st.fish.find(x => x.id === R.fid), s = SPECIES_BY[f.sp];
  if (R.tugT > 0) R.tugT--;
  else if (R.big && R.p > 0.1 && R.p < 0.9 && rand(st) < 0.012) { R.tugT = 30 + Math.floor(rand(st) * 30); st.ev.push("run"); st.msg = "IT TUGS. KEEP REELING."; st.tone = "warn"; }
  if (pressed & BTN.A) R.tap = st.t;
  if (bits & BTN.A || st.t - R.tap < 12) {   // held, or mashed (a press reels for a fifth of a second)
    R.p += R.rate * (R.tugT > 0 ? 0.35 : 1);
    if (st.t % 8 === 0) st.ev.push("click");
  } else R.p = Math.max(0, R.p - R.rate * 0.25);
  const x = LAND_AT + (R.x0 - LAND_AT) * (1 - Math.min(1, R.p));
  f.x = x;
  f.d = Math.max(0.5, bottomAt(spot, Math.max(0, x)) * 0.5 * (1 - R.p));
  if (R.p >= 1) land(st, f, s);
}
function land(st, f, s) {
  const c = st.cond;
  const k = { n: st.catches.length, sp: s.id, cw: f.cw, tl: lengthOf(s, f.cw), lure: st.bob.lure, spot: st.cfg.spot, tick: st.tick, day: c.day, hour: c.hour, fate: null };
  if (s.legend) k.legend = true;
  st.catches.push(k);
  st.fish = st.fish.filter(x => x !== f);
  st.reel = null; st.last = { caught: k.n };
  st.phase = "landed"; st.t = 0;
  st.msg = `${s.name}. ${(f.cw / 100).toFixed(2)} LB, ${(k.tl / 10).toFixed(1)} IN. KEEP (A) OR RELEASE (B).`;
  st.tone = "good";
  st.ev.push(s.legend ? "legend" : "land");
}

// everything else in the water: drift, leave, arrive (v1's)
function waters(st, spot) {
  for (const f of st.fish) {
    if (f.st === "hooked") continue;
    f.t++;
    if (f.st === "roam") {
      f.life--;
      if ((st.tick + f.id * 7) % 120 === 0) f.vx = (rand(st) - 0.5) * 0.03;
      f.x += f.vx;
      if (f.x < 3 || f.x > spot.cast * 1.1) { f.vx = -f.vx; f.x = Math.max(3, Math.min(spot.cast * 1.1, f.x)); }
      const s = SPECIES_BY[f.sp], b = bottomAt(spot, f.x), mid = b * (s.band[0] + s.band[1]) / 2;
      f.d += (mid - f.d) * 0.01;
    } else if (f.st === "flee") { f.x += f.vx; f.d += 0.05; }
  }
  st.fish = st.fish.filter(f => f.st === "hooked" || (f.st === "flee" ? f.t < 120 : f.life > 0 || f.st !== "roam"));
  if (st.tick % 120 === 0 && st.fish.length < target(st)) spawn(st);
}

// ---- replay -------------------------------------------------------------------------------------------
// Replay a trip from its config and log, to the end of the log (or `until(st)`), never past maxTicks.
export function replay(cfg, log, { until = null, maxTicks = TRIP_TICKS } = {}) {
  const st = newTrip(cfg);
  outer: for (let i = 0; i < log.length; i += 2) {
    for (let k = 0; k < log[i + 1]; k++) {
      if (st.phase === "done" || st.tick >= maxTicks) break outer;
      step(st, log[i]); st.ev.length = 0;
      if (until && until(st)) break outer;
    }
  }
  return st;
}
// A trip played by the bot for `ticks`: -> {st, log}
export function autoplay(cfg, ticks) {
  const st = newTrip(cfg), log = [];
  while (st.phase !== "done" && st.tick < ticks) { const b = botBits(st); logPush(log, b); step(st, b); st.ev.length = 0; }
  return { st, log };
}

// The check a server makes (replay.js, for netlify/functions/aquarium.js): does this log, under this
// config, land catch n exactly as claimed, and was it not released? -> {ok, catch} | {ok: false, error}
export function verifyCatch(cfg, log, n, claim, { maxTicks = TRIP_TICKS } = {}) {
  if (!Array.isArray(log) || log.length % 2 || log.some((v, i) => !Number.isInteger(v) || v < 0 || (i % 2 ? v < 1 : v > MAX_BITS))) return { ok: false, error: "THE LOG IS NOT LEGIBLE." };
  if (logTicks(log) > maxTicks) return { ok: false, error: "THE LOG RUNS LONGER THAN THE TRIP." };
  const st = replay(cfg, log, { maxTicks });
  const c = st.catches[n];
  if (!c) return { ok: false, error: "THE DEPARTMENT REPLAYED YOUR TRIP. NO SUCH CATCH." };
  if (!claim || c.sp !== claim.sp || c.cw !== claim.cw || c.tl !== claim.tl) return { ok: false, error: "THE DEPARTMENT REPLAYED YOUR TRIP. THE FISH DOES NOT MATCH THE CLAIM." };
  if (c.fate === "release") return { ok: false, error: "THAT FISH WAS RELEASED. IT IS NOT YOURS TO DONATE." };
  return { ok: true, catch: c, ticks: st.tick };
}
