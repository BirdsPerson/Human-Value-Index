// THE WATERS, a fishing trip: a pure, fixed-step (60 Hz) state machine, like the links (golf/sim.js).
// No DOM, no clock, no Math.random, no transcendental Math: newTrip(cfg) and the same per-tick
// button bits give the same trip, tick for tick, in any engine. A trip is {cfg, inputLog}; the
// aquarium's endpoint (netlify/functions/aquarium.js) replays it to check a donated catch.
//
// cfg: {seed, spot, at (real ms the trip began: the machine clock, the season, the light and the
// weather all follow from it and the tick), player: {name}}.
//
// A cast: LEFT/RIGHT picks the lure; A starts the power meter and A again casts (the marker swings
// up and down). In the water: hold A to reel (the lure swims toward you and rises), let go and it
// sinks (a popper floats); B jerks the rod: a twitch of the lure, or, when a fish has taken it, the
// hook set. Too early (while it only nibbles) and the fish is gone. Then the fight: hold A to
// reel, let go to give line. The tension gauge must stay off the red (the line snaps) and off the
// floor (slack: the fish throws the hook). Tire it, bring it to the net, then KEEP (A) or RELEASE (B).

import { SPOT, SPECIES_BY, LURES, LURE, speciesAt, appetite, conditionsAt, lengthOf, rngStep, fnv, HZ, WX_CAST } from "./data.js";

export const VERSION = 1;
export { HZ };
export const BTN = { L: 1, R: 2, U: 4, D: 8, A: 16, B: 32 };
export const TRIP_TICKS = 2 * 3600 * HZ;          // two real hours (two machine days); then the water closes
export const METER_PERIOD = 100;                   // ticks for the power marker up and back
export const REEL = 0.05, LAND_AT = 1.5;           // yards a tick on the reel; the net's reach
export const SNAP_TICKS = 18, SLACK_TICKS = 100, SLACK_CRAB = 40, SLACK_JUMP = 45, SLACK_T = 0.12;
const SHELF = { pier: 0.65, break: 0.2, estuary: 0.3, river: 0.4, lake: 0.25 };

export const spotOf = (st) => SPOT[st.cfg.spot] || SPOT.pier;
// the bottom, feet under the surface, x yards out
export function bottomAt(spot, x) {
  const s = SHELF[spot.id] ?? 0.3, f = Math.max(0, Math.min(1, x / (spot.cast * 0.7)));
  return spot.depth * (s + (1 - s) * f);
}

// ---- a new trip -------------------------------------------------------------------------------------
export function newTrip(cfg) {
  const seed = (cfg.seed >>> 0) || 1;
  const spot = SPOT[cfg.spot] ? cfg.spot : "pier";
  const at = Number.isFinite(cfg.at) ? Math.floor(cfg.at) : 0;
  const st = {
    v: VERSION, cfg: { seed, spot, at, player: cfg.player || null },
    rng: fnv(`fish|${seed}|${spot}|${at}`), tick: 0, t: 0, prev: 0, phase: "ready",
    lure: 0, meter: null, fl: null, bob: null, fish: [], nextId: 1, fight: null, catches: [], last: null,
    cond: conditionsAt(at, 0), msg: "", tone: "", ev: [], tug: 0,
  };
  const n = target(st);
  for (let i = 0; i < n; i++) spawn(st);
  return st;
}
function rand(st) { const [v, n] = rngStep(st.rng); st.rng = n; return v; }
const target = (st) => 4 + (st.cond.weather === "OVERCAST" || st.cond.weather === "RAIN" ? 1 : 0);

// A fish arrives: its species by the hour's appetites, its weight fixed now (hundredths of a pound).
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
  const A = BTN.A, B = BTN.B;
  switch (st.phase) {
    case "ready": return st.prev & A || st.t < 12 ? 0 : A;
    case "power": { if (st.prev & A) return 0; const k = (st.meter.k + 1) % METER_PERIOD; return k === 36 ? A : 0; }
    case "fishing": {
      if (st.fish.some(f => f.st === "bite")) return st.prev & B ? 0 : B;
      if (st.bob?.bare || st.t > 1500) return A;
      return 0;
    }
    case "fight": { const F = st.fight; return F.T < 0.7 && F.over === 0 ? A : 0; }
    case "landed": return st.t > 32 && !(st.prev & A) ? A : 0;
    default: return 0;
  }
}

// ---- one tick -----------------------------------------------------------------------------------------
export function step(st, bits = 0) {
  if (st.phase === "done") return st;
  bits &= 63;
  const pressed = bits & ~st.prev;
  st.prev = bits; st.tick++; st.t++;
  if (st.tug > 0) st.tug--;
  if (st.tick % HZ === 0) st.cond = conditionsAt(st.cfg.at, st.tick);
  if (st.tick >= TRIP_TICKS) { st.phase = "done"; st.msg = `${spotOf(st).name} CLOSES. THE TRIP IS FILED.`; st.ev.push("done"); return st; }
  const spot = spotOf(st);
  switch (st.phase) {
    case "ready":
      if (pressed & BTN.R) { st.lure = (st.lure + 1) % LURES.length; st.ev.push("lure"); st.msg = LURES[st.lure].name; }
      if (pressed & BTN.L) { st.lure = (st.lure + LURES.length - 1) % LURES.length; st.ev.push("lure"); st.msg = LURES[st.lure].name; }
      if (pressed & BTN.A && st.t > 6) { st.phase = "power"; st.t = 0; st.meter = { k: 0, m: 0 }; st.ev.push("wind"); }
      break;
    case "power": {
      const m = st.meter;
      m.k++;
      const k = m.k % METER_PERIOD, half = METER_PERIOD / 2;
      m.m = k < half ? k / half : (METER_PERIOD - k) / half;
      if (pressed & BTN.A) {
        const dist = Math.max(4, m.m * spot.cast * (WX_CAST[st.cond.weather] ?? 1));
        st.fl = { x: dist, p: m.m, ticks: 24 + Math.round(dist * 0.6) };
        st.phase = "flight"; st.t = 0; st.ev.push("cast");
      }
      break;
    }
    case "flight":
      if (st.t >= st.fl.ticks) {
        const lure = LURES[st.lure];
        st.bob = { x: st.fl.x, d: 0, motion: 0, pop: 0, bare: false, lure: lure.id };
        st.phase = "fishing"; st.t = 0; st.ev.push("splash");
        st.msg = `${Math.round(st.fl.x)} YARDS. ${lure.bait ? "LET IT SINK. WAIT FOR THE TAKE." : lure.id === "popper" ? "TWITCH IT WITH B. LET IT REST." : "HOLD A TO SWIM IT BACK."}`;
        st.tone = "";
        // a wary fish right under the splash bolts
        for (const f of st.fish) if (f.st === "roam" && Math.abs(f.x - st.bob.x) < 2 && SPECIES_BY[f.sp].wary > 0.5 && rand(st) < 0.6) flee(st, f);
      }
      break;
    case "fishing": fishing(st, bits, pressed, spot); break;
    case "fight": fight(st, bits, spot); break;
    case "landed":
      if (st.t > 30 && (pressed & (BTN.A | BTN.B))) {
        const c = st.catches[st.catches.length - 1], s = SPECIES_BY[c.sp];
        if (pressed & BTN.A && !s.protected) { c.fate = "keep"; st.msg = "KEPT. IN THE TACKLE BOX. THE DEPARTMENT HAS WEIGHED IT TOO."; }
        else { c.fate = "release"; st.msg = s.protected && pressed & BTN.A ? "PROTECTED. RELEASED BY LAW. THE LAW THANKS YOU." : "RELEASED. IT WILL REMEMBER YOU."; }
        st.ev.push(c.fate);
        st.phase = "ready"; st.t = 0; st.bob = null; st.tone = "";
      }
      break;
    case "lost":
      if (st.t >= 90) { st.phase = "ready"; st.t = 0; st.bob = null; }
      break;
  }
  waters(st, spot);
  return st;
}

// the lure in the water, and the fish that come to it
function fishing(st, bits, pressed, spot) {
  const b = st.bob, lure = LURE[b.lure];
  let moved = 0;
  if (bits & BTN.A) {
    b.x -= REEL; moved += REEL;
    b.d = Math.max(0, b.d - 0.06);
  } else if (lure.sink > 0) b.d = Math.min(bottomAt(spot, b.x), b.d + lure.sink);
  else b.d = 0;
  if (b.pop > 0) b.pop--;
  if (pressed & BTN.B) {
    const biter = st.fish.find(f => f.st === "bite");
    if (biter) return hook(st, biter);
    const nibbler = st.fish.find(f => f.st === "nibble");
    if (nibbler) { flee(st, nibbler); st.msg = "TOO EARLY. IT FELT THE HOOK AND LEFT."; st.tone = "warn"; st.ev.push("miss"); }
    b.pop = 20; b.x -= 0.4; moved += 0.4; st.ev.push("pop");
  }
  b.motion = b.motion * 0.9 + moved * 0.1;
  if (b.x <= 1) {
    st.msg = b.bare ? "LURE IN. REBAITED. THE BAIT WAS NOT CONSULTED." : "LURE IN. NOTHING. NOTED.";
    st.phase = "ready"; st.t = 0; st.bob = null; st.tone = "";
    for (const f of st.fish) if (f.st !== "roam" && f.st !== "flee") { f.st = "roam"; f.t = 0; }
    return;
  }
  for (const f of st.fish) {
    if (f.st === "roam") {
      if ((st.tick + f.id) % 15) continue;
      const s = SPECIES_BY[f.sp];
      const sense = 7 * (st.cond.weather === "FOG" ? 0.75 : 1);
      const dist = Math.abs(f.x - b.x) + Math.abs(f.d - b.d) / 3;
      if (dist >= sense || b.bare) continue;
      let taste = (s.lures[b.lure] || 0) * (b.motion > 0.02 ? lure.moving : lure.still);
      if (b.pop > 0 && lure.pop) taste *= lure.pop;
      if (b.lure === "popper" && s.band[0] > 0.4) taste *= 0.15;   // bottom fish do not look up
      const hungry = Math.max(0.2, Math.min(2, appetite(s, st.cond) / s.rate));
      if (rand(st) < taste * 0.2 * (1 - dist / sense) * hungry) { f.st = "look"; f.t = 0; }
    } else if (f.st === "look") {
      const dx = b.x - f.x, dd = b.d - f.d;
      f.x += Math.max(-0.045, Math.min(0.045, dx));
      f.d += Math.max(-0.09, Math.min(0.09, dd));
      const s = SPECIES_BY[f.sp];
      if (f.t % 30 === 0 && b.motion > 0.035 && rand(st) < s.wary * 0.35) { flee(st, f); continue; }
      if (Math.abs(dx) < 0.5 && Math.abs(dd) < 1.2) {
        f.st = "nibble"; f.t = 0; f.nib = Math.floor(rand(st) * 3) + (s.wary > 0.5 ? 1 : 0);
        f.next = 20 + Math.floor(rand(st) * 30);
      } else if (f.t > 900) { f.st = "roam"; f.t = 0; }
    } else if (f.st === "nibble") {
      f.x = b.x; f.d = b.d;
      const s = SPECIES_BY[f.sp];
      if (b.motion > 0.04 && f.t % 20 === 0 && rand(st) < s.wary * 0.25) { flee(st, f); continue; }
      if (f.t >= f.next) {
        if (f.nib > 0) { f.nib--; st.tug = 8; st.ev.push("nibble"); f.next = f.t + 25 + Math.floor(rand(st) * 35); st.msg = "A NIBBLE. NOT YET."; st.tone = ""; }
        else { f.st = "bite"; f.t = 0; f.next = Math.round(30 - 18 * s.wary); st.tug = 24; st.ev.push("bite"); st.msg = "IT HAS TAKEN IT. SET THE HOOK (B)."; st.tone = "good"; }
      }
    } else if (f.st === "bite") {
      f.x = b.x; f.d = b.d;
      if (f.t > f.next) {
        if (lure.bait) { b.bare = true; st.msg = "IT TOOK THE BAIT AND LEFT. REEL IN (A) AND REBAIT."; }
        else st.msg = "IT SPAT THE LURE. TOO SLOW. NOTED.";
        st.tone = "warn"; st.ev.push("miss");
        flee(st, f);
      }
    }
  }
}
function flee(st, f) { f.st = "flee"; f.t = 0; f.vx = f.x > 20 ? 0.12 : -0.12; }

function hook(st, f) {
  const s = SPECIES_BY[f.sp], frac = (f.cw / 100 - s.lb[0]) / (s.lb[1] - s.lb[0] || 1);
  f.st = "hooked";
  for (const o of st.fish) if (o !== f && o.st !== "roam" && o.st !== "flee") { o.st = "roam"; o.t = 0; }
  st.fight = { fid: f.id, D: Math.max(LAND_AT + 0.5, st.bob.x), T: 0.3, over: 0, slack: 0, run: 0, stam: 1, jump: 0, pow: s.power * (0.65 + 0.45 * frac) };
  st.phase = "fight"; st.t = 0; st.tug = 0;
  st.msg = "HOOKED. HOLD A TO REEL. LET GO WHEN IT RUNS.";
  st.tone = "good";
  st.ev.push("hook");
}

// the fight: tension follows the reel and the fish; too high too long snaps, too low too long frees it
function fight(st, bits, spot) {
  const F = st.fight, f = st.fish.find(x => x.id === F.fid), s = SPECIES_BY[f.sp];
  if (F.run > 0) F.run--;
  else if (rand(st) < 0.006 + 0.01 * F.pow * F.stam) {
    F.run = 40 + Math.floor(rand(st) * 80 * (0.4 + F.stam));
    st.ev.push("run");
    if (s.jumps && rand(st) < 0.35) { F.jump = 40; st.ev.push("jump"); st.msg = "IT JUMPED. KEEP IT TIGHT."; }
    else st.msg = "IT RUNS. GIVE IT LINE.";
    st.tone = "warn";
  }
  const pull = F.pow * (F.run > 0 ? 1 : 0.35) * (0.5 + 0.5 * F.stam);
  const reeling = Boolean(bits & BTN.A);
  let tgt = reeling ? 0.3 + pull * 1.1 : pull * 0.5 - 0.06;
  if (F.jump > 0) { F.jump--; tgt -= 0.25; }
  F.T = Math.max(0, F.T + (tgt - F.T) * 0.06);
  if (reeling) F.D -= 0.055 * (1 - Math.min(0.9, pull * 0.8));
  else F.D += pull * 0.04;
  if (F.T > 0.35) F.stam = Math.max(0, F.stam - (0.0004 + 0.0009 * F.T) / s.stamina);
  else F.stam = Math.min(1, F.stam + 0.0004);
  f.x = F.D;
  f.d = Math.max(0, Math.min(bottomAt(spot, Math.max(0, F.D)), f.d + (F.run > 0 ? 0.05 : -0.04)));
  if (F.jump > 30) f.d = 0;
  if (F.T >= 1) { F.over++; if (F.over % 6 === 1) st.ev.push("strain"); if (F.over >= SNAP_TICKS) return lose(st, "snap"); }
  else F.over = Math.max(0, F.over - 2);
  const limit = s.crab ? SLACK_CRAB : F.jump > 0 ? SLACK_JUMP : SLACK_TICKS;
  if (F.T < SLACK_T) { F.slack++; if (F.slack >= limit) return lose(st, "escape"); }
  else F.slack = Math.max(0, F.slack - 2);
  if (F.D > spot.cast * 1.6 + 20) return lose(st, "spooled");
  if (F.D <= LAND_AT) {
    if (F.stam > 0.45) { F.run = 60; F.D = 3; st.msg = "IT SAW THE NET. IT RUNS AGAIN."; st.tone = "warn"; st.ev.push("run"); }
    else land(st, f, s);
  }
}
const LOSE_MSG = { snap: "SNAP. THE LINE PARTED. TOO TIGHT.", escape: "GONE. IT THREW THE HOOK ON A SLACK LINE.", spooled: "SPOOLED. IT TOOK EVERY YARD YOU HAD." };
function lose(st, why) {
  const f = st.fish.find(x => x.id === st.fight.fid);
  if (f) flee(st, f);
  st.last = { lost: why, sp: f?.sp || null };
  st.msg = LOSE_MSG[why]; st.tone = "harm";
  st.ev.push(why === "escape" ? "escape" : "snap");
  st.phase = "lost"; st.t = 0; st.fight = null; st.bob = null;
}
function land(st, f, s) {
  const c = st.cond;
  const k = { n: st.catches.length, sp: s.id, cw: f.cw, tl: lengthOf(s, f.cw), lure: st.bob.lure, spot: st.cfg.spot, tick: st.tick, day: c.day, hour: c.hour, fate: null };
  if (s.legend) k.legend = true;
  st.catches.push(k);
  st.fish = st.fish.filter(x => x !== f);
  st.fight = null; st.last = { caught: k.n };
  st.phase = "landed"; st.t = 0;
  st.msg = `${s.name}. ${(f.cw / 100).toFixed(2)} LB, ${(k.tl / 10).toFixed(1)} IN. KEEP (A) OR RELEASE (B).`;
  st.tone = "good";
  st.ev.push(s.legend ? "legend" : "land");
}

// everything else in the water: drift, leave, arrive
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

// ---- the input log: run-length button bits, flat [bits, count, bits, count, ...] -------------------------
export function logPush(log, bits) {
  const n = log.length;
  if (n && log[n - 2] === bits) log[n - 1]++;
  else log.push(bits, 1);
  return log;
}
export const logTicks = (log) => { let t = 0; for (let i = 1; i < log.length; i += 2) t += log[i]; return t; };
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

// The check a server makes (netlify/functions/aquarium.js): does this log, under this config, land
// catch n exactly as claimed, and was it not released? -> {ok, catch} | {ok: false, error}
export function verifyCatch(cfg, log, n, claim, { maxTicks = TRIP_TICKS } = {}) {
  if (!Array.isArray(log) || log.length % 2 || log.some((v, i) => !Number.isInteger(v) || v < 0 || (i % 2 ? v < 1 : v > 63))) return { ok: false, error: "THE LOG IS NOT LEGIBLE." };
  if (logTicks(log) > maxTicks) return { ok: false, error: "THE LOG RUNS LONGER THAN THE TRIP." };
  const st = replay(cfg, log, { maxTicks });
  const c = st.catches[n];
  if (!c) return { ok: false, error: "THE DEPARTMENT REPLAYED YOUR TRIP. NO SUCH CATCH." };
  if (!claim || c.sp !== claim.sp || c.cw !== claim.cw || c.tl !== claim.tl) return { ok: false, error: "THE DEPARTMENT REPLAYED YOUR TRIP. THE FISH DOES NOT MATCH THE CLAIM." };
  if (c.fate === "release") return { ok: false, error: "THAT FISH WAS RELEASED. IT IS NOT YOURS TO DONATE." };
  return { ok: true, catch: c, ticks: st.tick };
}
