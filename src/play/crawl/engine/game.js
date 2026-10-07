// The crawl as one pure function of its record: newRun(cfg), step(st, words) with one word per seat
// in seat order, claimOf(st) (what a server compares), resultOf(st), replay(record). No clock, no
// Math.random, no DOM: everything the sim reads is in cfg and the logs. Every transition emits a
// typed event in st.ev (cleared each step) for the render, the audio, the HUD and the checks.
import { fnv } from "./rng.js";
import { T } from "./grid.js";
import { unpack, BTN_MASK } from "./input/word.js";
import { newSeat } from "./input/seats.js";
import { emptyPack } from "./items.js";
import { levelOf } from "./rules/levels.js";
import { themeOf, bandOf, validateTheme } from "./themes/index.js";
import { enterFloor, reveal, sealCheck, loiterTick } from "./rules/floor.js";
import { lose, callLift, claimOf, SHIFT, SHIFT_WARN, DESCENT_F } from "./rules/run.js";
import { playerFrame, shotFrame, pickupFrame } from "./combat.js";
import { monFrame } from "./ai/archetypes.js";
import { rebuildFlow, FLOW_EVERY } from "./ai/brain.js";
import { rleDecode } from "./record.js";

export const VERSION = 1;
export { claimOf };

// cfg: {runId, theme, level, entry, day, cleared, seats: [caseHash], seed, at, v, hand, controls}
export function newRun(cfg) {
  const th = themeOf(cfg.theme || "subbasements");
  if (!th) throw new Error(`no theme ${cfg.theme}`);
  const bad = validateTheme(th); if (bad.length) throw new Error(bad.join("; "));
  const seats = Array.isArray(cfg.seats) && cfg.seats.length ? cfg.seats : [null];
  // the run's seed folds in the machine day and the frontier count: a record whose cfg differs in
  // either plays a different floor
  const runSeed = fnv(`${cfg.seed >>> 0}|${cfg.day ?? 0}|${cfg.cleared ?? 0}`);
  const st = {
    v: VERSION, cfg, runSeed, frame: 0, phase: "landing", phaseT: 0, floor: 0, deepest: 0,
    rng: { loot: fnv(`${runSeed}|loot`), ai: fnv(`${runSeed}|ai`) },
    seats: seats.map((h, k) => newSeat(k, -1, h, emptyPack())), ents: [], nextId: 1, flow: [], flowDirty: false,
    lv: levelOf(cfg.level), band: null, fl: null, rev: [], loiter: 0, stalker: false, sealed: false, hatch: null,
    cabTotal: 0, cabLeft: 0, crates: 0, shift: 0, hitstop: 0, lifts: [], exit: null, why: null, filedAt: -1,
    drops: [], ev: [], hash: 0x811c9dc5, stats: { kills: 0, cabs: 0, hatches: 0, floors: 0, hurt: 0 },
  };
  const entry = cfg.entry >= th.entry ? cfg.entry : th.entry;
  st.band = bandOf(th, entry);
  enterFloor(st, th, entry);
  st.ev = [];
  return st;
}
export const themeOfState = (st) => themeOf(st.cfg.theme || "subbasements");

const near = (P, x, y, r) => { const dx = P.x - x, dy = P.y - y; return dx * dx + dy * dy <= r * r; };
function interact(st, th, seat, P) {
  const fl = st.fl, g = fl.g, here = g.t[Math.floor(P.y) * g.w + Math.floor(P.x)];
  if (fl.lift && (here === T.LIFT || near(P, fl.descent.x, fl.descent.y, 1.0))) { callLift(st); return; }
  const onStairs = !fl.lift && (here === T.STAIRS || near(P, fl.descent.x, fl.descent.y, 1.0));
  const onHatch = st.hatch && (here === T.HATCH || near(P, st.hatch.x, st.hatch.y, 0.9));
  if (onStairs || onHatch) {
    if (onStairs && st.sealed) { st.ev.push({ t: "sealed", seat: seat.k }); return; }
    if (onHatch && !onStairs) st.stats.hatches++;
    st.phase = "descent"; st.phaseT = DESCENT_F;
    st.ev.push({ t: "descend", f: st.floor, via: onStairs ? "stairs" : "hatch" });
    return;
  }
  if (fl.storeDoor >= 0 && g.t[fl.storeDoor] === T.LOCKED) {
    const dx = (fl.storeDoor % g.w) + 0.5, dy = Math.floor(fl.storeDoor / g.w) + 0.5;
    if (near(P, dx, dy, 1.4)) {
      if (seat.keycard === st.floor) { g.t[fl.storeDoor] = T.DOOR; st.flowDirty = true; st.ev.push({ t: "door.open", x: dx, y: dy }); }
      else st.ev.push({ t: "locked", seat: seat.k });
    }
  }
}
function use(st, seat, P) {
  const it = seat.pack[seat.slot];
  if (!it) return;
  if (it.k === "coffee") {
    if (P.hp >= P.hpMax) { st.ev.push({ t: "full.hearts", seat: seat.k }); return; }
    P.hp = Math.min(P.hpMax, P.hp + 8); seat.pack[seat.slot] = null; st.ev.push({ t: "use", item: "coffee", seat: seat.k });
  } else if (it.k === "form00") {
    seat.pack[seat.slot] = null;
    for (const e of st.ents) {
      if (e.dead) continue;
      if (e.k === "shot" && e.by === "mon") e.dead = true;
      if (e.k === "mon" && e.a !== "stalker" && Math.abs(e.x - P.x) <= 12 && Math.abs(e.y - P.y) <= 7) { e.stun = 90; if (e.s === "tele" || e.s === "charge" || e.s === "wind") e.s = "chase"; }
    }
    st.ev.push({ t: "use", item: "form00", seat: seat.k, x: P.x, y: P.y });
  } else if (it.k === "crate") st.ev.push({ t: "crate.note", seat: seat.k });
}

function mix(h, v) { h ^= v | 0; return Math.imul(h, 0x01000193) >>> 0; }
export function hashOf(st) {
  let h = mix(st.hash, st.frame);
  h = mix(h, st.floor); h = mix(h, st.ents.length); h = mix(h, st.rng.loot); h = mix(h, st.rng.ai);
  for (const e of st.ents) { h = mix(h, e.id); h = mix(h, Math.round(e.x * 1024)); h = mix(h, Math.round(e.y * 1024)); h = mix(h, e.hp | 0); }
  return h;
}

// One frame. words: one input word per seat, in seat order (a missing seat's word is IDLE).
export function step(st, words) {
  st.ev = [];
  if (st.phase === "filed") return st;
  const th = themeOfState(st);
  st.frame++; st.shift++;
  const ws = st.seats.map((s, k) => {
    const raw = (Array.isArray(words) ? words[k] : k === 0 ? words : 0) >>> 0, w = unpack(raw);
    const btn = raw & BTN_MASK, pressed = btn & ~s.prev;
    if (pressed) { s.buf |= pressed; s.bufT = 0; } else if (s.buf && ++s.bufT > 6) s.buf = 0;
    s.prev = btn;
    return w;
  });
  if (st.phase === "lift" || st.phase === "lost") {
    if (--st.phaseT <= 0) { st.phase = "filed"; st.filedAt = st.frame; st.ev.push({ t: "filed", exit: st.exit, why: st.why }); }
    st.hash = hashOf(st); return st;
  }
  if (st.phase === "descent") {
    if (--st.phaseT <= 0) { st.stats.floors++; st.band = bandOf(th, st.floor + 1); enterFloor(st, th, st.floor + 1); }
    st.hash = hashOf(st); return st;
  }
  if (st.shift >= SHIFT) { lose(st, "shift"); st.hash = hashOf(st); return st; }
  if (SHIFT_WARN.includes(st.shift)) st.ev.push({ t: "shift.warn", left: SHIFT - st.shift });
  if (st.hitstop > 0) { st.hitstop--; st.hash = hashOf(st); return st; }
  if (st.phase === "landing" && --st.phaseT <= 0) st.phase = "floor";
  // the seats
  st.seats.forEach((s, k) => {
    const P = st.ents.find(e => e.id === s.ent);
    if (!P || P.dead) return;
    const w = ws[k];
    if (s.buf & (1 << 9)) { s.buf &= ~(1 << 9); if (P.stun === 0 && P.roll === 0) interact(st, th, s, P); }
    if (s.buf & (1 << 10)) { s.buf &= ~(1 << 10); use(st, s, P); }
    if (st.phase !== "floor" && st.phase !== "landing") return;
    playerFrame(st, th, s, P, w);
    pickupFrame(st, s, P);
  });
  if (st.phase !== "floor" && st.phase !== "landing") { st.hash = hashOf(st); return st; }
  reveal(st);
  // the monsters (asleep through the landing's grace) and the projectiles
  if (st.frame % FLOW_EVERY === 0 || st.flowDirty) rebuildFlow(st);
  const n = st.ents.length;
  for (let i = 0; i < n; i++) {
    const e = st.ents[i];
    if (e.dead) continue;
    if (e.k === "mon" && (st.phase === "floor" || e.a === "stalker")) monFrame(st, th, e);
    else if (e.k === "shot") shotFrame(st, th, e);
    else if (e.k === "cab" && e.flash > 0) e.flash--;
  }
  if (st.ents.some(e => e.dead)) st.ents = st.ents.filter(e => !e.dead || (e.k === "player"));
  sealCheck(st);
  loiterTick(st, th);
  // hearts at zero: the party is down (solo: the run is lost)
  let alive = 0;
  for (const s of st.seats) { const P = st.ents.find(e => e.id === s.ent); if (P && P.hp > 0) alive++; else if (P && !s.down) { s.down = true; st.ev.push({ t: "down", seat: s.k }); } }
  if (!alive) lose(st, "hearts");
  st.hash = hashOf(st);
  return st;
}

// -> the result (the claim plus what the page shows)
export function resultOf(st) {
  const c = claimOf(st);
  return { ...c, level: st.cfg.level, frames: st.frame, floor: st.floor, bountyPaid: Math.round(c.bounty * st.lv.bounty), kills: st.stats.kills, cabs: st.stats.cabs, hatches: st.stats.hatches, drops: st.drops.length };
}
// A record {v, cfg, logs: [rle per seat]} -> its claim. The words past the end of a log are IDLE.
export function replay(rec) {
  if (Number(rec?.v) !== VERSION) throw new Error(`crawl record v${rec?.v} is not engine v${VERSION}`);
  const st = newRun(rec.cfg), logs = rec.logs.map(rleDecode), n = Math.max(...logs.map(l => l.length));
  for (let f = 0; f < n && st.phase !== "filed"; f++) step(st, logs.map(l => l[f] ?? 0));
  return claimOf(st);
}
export function replayState(rec) {
  const st = newRun(rec.cfg), logs = rec.logs.map(rleDecode), n = Math.max(...logs.map(l => l.length));
  for (let f = 0; f < n && st.phase !== "filed"; f++) step(st, logs.map(l => l[f] ?? 0));
  return st;
}
