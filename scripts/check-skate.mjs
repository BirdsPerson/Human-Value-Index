// THE PARK, skateable (src/play/skate/): the sim, the levels and the rules, headless.
//   purity       sim.js uses no clock, no Math.random, no trig, no pow / exp / hypot
//   levels       three levels, each start on the ground and inside; every letter and the tape over
//                reachable ground; every goal is a kind the sim knows; rails named, the coping added
//   determinism  a bot's whole two-minute RUN on every level replays from {v, cfg, inputLog} to the same
//                result, twice; the RLE round-trips; a doctored log does not reproduce; another
//                version is refused; verify() accepts the true claim and refuses an inflated one
//   physics      a quarter pipe launches straight up and comes back down the same wall; pumping the
//                halfpipe climbs; you cannot push up a ramp; an ollie clears a 0.5 ledge
//   combos       a trick adds its points and 1 to the multiplier; landing banks base x multiplier;
//                a manual on landing links (the combo continues); a revert on a ramp landing links;
//                the same trick twice is worth less; a bail (unfinished flip, sideways spin) loses it
//   balance      a manual / grind / lip trick left alone falls off within two seconds; held against the
//                needle it lasts; the grind earns per tick; the meter starts from the seeded wobble
//   goals        letters, the tape, a grind goal, a lip-trick goal, the score goal; the result shape
//   the city     the tile, the icon, the route, the house cabinet, the E-prompt, the building's door
//   version 2    the classic layout and rules: multi-flips, L1 / R1 spin, goofy, three difficulties, the goals sized
//                to them; version-1 runs (a fixture) replay on the frozen sim1.js
//   the casual   a casual-human bot (timing noise +-100 ms, a reaction time on the balance needle, rare manuals):
//   human        on ROOKIE it does the first two goals of a run and lands 70%+ of simple tricks
// Run: node scripts/check-skate.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const S = await import("../src/play/skate/sim.js");
const { casual } = await import("./skate-bot.mjs");
const { LEVELS, LEVEL_IDS, LETTERS } = await import("../src/play/skate/levels.js");
const B = S.BIT;
const NG = (c) => S.newGame({ diff: "pro", ...c });   // the rules these groups were written on: PRO (ROOKIE is the default)
let n = 0;
const ok = (msg) => { n++; if (process.env.VERBOSE) console.log("ok", msg); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ---- purity ----------------------------------------------------------------------------------------------------
{
  for (const f of ["sim.js", "sim1.js"]) {
  const src = read(`src/play/skate/${f}`).replace(/\/\/.*$/gm, "");
  for (const bad of ["Math.random", "Date.now", "performance", "Math.sin", "Math.cos", "Math.tan", "Math.atan", "Math.hypot", "Math.pow", "Math.exp", "Math.log", "**", "document", "window"]) assert.ok(!src.includes(bad), `${f} uses ${bad}`);
  }
  for (let i = 0; i < 64; i++) assert.ok(Math.abs(S.COS[i] - Math.cos((i * Math.PI) / 32)) < 1e-9 && Math.abs(S.SIN[i] - Math.sin((i * Math.PI) / 32)) < 1e-9, "the compass by series");
  ok("purity");
}

// ---- the levels ----------------------------------------------------------------------------------------------------
const KINDS = new Set(["score", "combo", "letters", "tape", "grind", "trick", "spin"]);
for (const id of LEVEL_IDS) {
  const D = LEVELS[id], L = S.levelOf(id);
  const st = NG({ level: id });
  assert.ok(st.x > 0 && st.x < D.W && st.y >= 0 && st.y < D.H, `${id}: the start is inside`);
  for (const c of [...LETTERS, "tape"]) {
    const it = D.items[c]; assert.ok(it, `${id}: ${c} placed`);
    const g = S.ground(L, it.x, it.y);
    assert.ok(g.o !== -2 && it.z - 0.9 > g.h, `${id}: ${c} floats over ground (${it.z} over ${g.h.toFixed(2)}): it takes air or a grind`);
  }
  for (const G of D.goals) {
    assert.ok(KINDS.has(G.kind), `${id}: goal ${G.id} is a kind the sim knows`);
    if (G.kind === "grind") assert.ok(L.railIx[G.rail] >= 0, `${id}: goal ${G.id} names a real rail`);
  }
  assert.ok(L.rails.every(r => r.name && r.len > 0.5), `${id}: every rail named, none a stub`);
  assert.ok(L.rails.filter(r => r.coping).length === D.objs.filter(o => o.k === "qp").length, `${id}: every quarter pipe's lip is THE COPING`);
  ok(`level ${id}`);
}
assert.equal(LEVEL_IDS.length, 3, "three levels: the park, the vert ramp, the plaza");
assert.ok(LEVELS.street.rails.some(r => r.id === "hq-rail") && LEVELS.street.goals.some(g => g.rail === "hq-rail"), "THE PLAZA: GRIND THE HQ RAIL");

// ---- helpers -------------------------------------------------------------------------------------------------------
const W = (o) => S.pack(o);
function play(st, fn, max = 3000) { const words = [], evs = []; for (let i = 0; i < max && !st.done; i++) { const w = fn(st, i); if (w === null) break; words.push(w); S.step(st, w); for (const e of st.ev) evs.push(e); } return { words, evs }; }
const has = (evs, k, v) => evs.some(e => e[0] === k && (v === undefined || e[1] === v));
const banks = (evs) => evs.filter(e => e[0] === "bank");
// the balance hand: hold the key away from where the needle leans
const counter = (B0, neg, pos) => (B0.b > 0.02 ? neg : B0.b < -0.02 ? pos : 0);
function at(level, x, y, h, extra = {}) { const st = NG({ level, mode: "free", seed: 11 }); const L = S.levelOf(level), g = S.ground(L, x, y); Object.assign(st, { x, y, h, z: g.h, o: g.o }, extra); return st; }

// ---- physics -------------------------------------------------------------------------------------------------------
{
  // push north from the park's start: up the north quarter pipe, straight up, back down
  const st = NG({ level: "park", mode: "free" });
  let apex = 0, launchX = null, landed = false;
  play(st, (s) => { if (s.st === "air") { apex = Math.max(apex, s.z); if (launchX === null) launchX = s.x; } if (landed) return null; return B.up; }, 600).evs;
  const st2 = NG({ level: "park", mode: "free" }), ev2 = play(st2, () => B.up, 400).evs;
  assert.ok(has(ev2, "launch") && has(ev2, "land"), "the quarter pipe launches and you land back on it");
  const st3 = NG({ level: "park", mode: "free" }); let a3 = 0, x3 = new Set();
  play(st3, (s) => { if (s.st === "air") { a3 = Math.max(a3, s.z); x3.add(s.y.toFixed(3)); } return B.up; }, 260);
  assert.ok(a3 > 1.6 + 0.4 && a3 < 1.6 + 2.5, `vert air over the park's coping (${a3.toFixed(2)})`);
  assert.ok(x3.size === 1, "straight up: the skater stays over the lip in the air");
  // you cannot push up a quarter pipe (a pump only)
  const q = at("park", 18, 2.2, 48);
  play(q, () => B.up, 1);
  assert.ok(Math.abs(q.vy) < 0.01, "no push on a ramp");
  // the halfpipe: pumping climbs, air after air
  const v = NG({ level: "vert", mode: "free" }), launches = [];
  play(v, (s) => { for (const e of s.ev) if (e[0] === "launch") launches.push(s.vz); return B.up; }, 900);
  assert.ok(launches.length >= 4 && launches[3] > launches[0] + 0.05 && launches.every(x => x <= S.P.VZ_MAX + 1e-9), `pumping climbs the vert ramp (${launches.map(x => x.toFixed(2)).join(" ")})`);
  const idle = NG({ level: "vert", mode: "free" }), ei = play(idle, () => 0, 600).evs;
  assert.ok(!has(ei, "launch"), "dropping in without a pump does not clear the far coping");
  // an ollie clears a 0.5 box (the funbox): charge and pop, land on top
  const o = at("park", 10.5, 13.5, 48);
  let onTop = false;
  play(o, (s, i) => { if (s.st === "ground" && s.z > 0.45) onTop = true; return i < 20 ? B.up | B.a : i < 60 ? B.up : null; }, 60);
  assert.ok(onTop, "a charged ollie lands on the funbox");
  ok("physics");
}

// ---- combos --------------------------------------------------------------------------------------------------------
{
  // a kickflip off the park's quarter pipe, landed: 100 x 1
  const st = NG({ level: "park", mode: "free" });
  const { evs } = play(st, (s) => (s.st === "air" && s.vz > 0.05 && !s.tr ? B.x | B.left : s.st === "air" ? 0 : B.up), 400);
  const b0 = banks(evs)[0];
  assert.ok(b0 && b0[1] === 100 && b0[3] === 1 && has(evs, "trick", "KICKFLIP"), `a kickflip banks 100 x 1 (${JSON.stringify(b0)})`);
  assert.equal(st.score, banks(evs).reduce((a, e) => a + e[1], 0), "the score is the banked combos");

  // ollie + kickflip, MANUAL in the air (up, down), land into it, hold it, ollie out, kickflip again, land
  const m = at("park", 20, 20, 32);
  let phase = 0, mt = 0;
  const em = play(m, (s, i) => {
    if (i < 30) return B.up;                                  // roll
    if (phase === 0) { phase = 1; return B.a; }               // crouch a tick
    if (phase === 1) { phase = 2; return 0; }                 // pop
    if (phase === 2 && s.st === "air") { phase = 3; return B.x; }   // kickflip
    if (phase === 3 && s.st === "air" && s.tr?.done) { phase = 4; return B.up; }
    if (phase === 4) { phase = 5; return B.down; }            // the manual, buffered
    if (phase === 5 && s.st === "manual") { if (++mt > 50) { phase = 6; return B.a; } return counter(s.m, B.up, B.down); }
    if (phase === 6) { phase = 7; return 0; }                 // ollie out of the manual
    if (phase === 7 && s.st === "air") { phase = 8; return B.x; }
    if (phase === 8 && s.st === "air") return 0;
    if (phase === 8 && s.st === "ground") return 0;
    return 0;
  }, 400).evs;
  const bm = banks(em);
  assert.equal(bm.length, 1, `the manual linked it all into one combo (${JSON.stringify(bm)})`);
  const names = em.filter(e => e[0] === "trick").map(e => e[1]);
  assert.deepEqual(names, ["KICKFLIP", "MANUAL", "KICKFLIP"], `the combo's tricks (${names})`);
  assert.equal(bm[0][3], 3, "the multiplier is the number of tricks");
  assert.ok(bm[0][2] === 100 + 100 + 75 + mt - 1 || Math.abs(bm[0][2] - (100 + 100 + 75 + mt)) <= 2, `base: kickflip 100 + manual 100 + the manual's ticks + a repeated kickflip at 75 (${bm[0][2]}, ${mt})`);
  assert.equal(bm[0][1], bm[0][2] * 3, "banked = base x multiplier");

  // a bail loses the combo: a flip started too late
  const b = at("park", 20, 20, 32);
  const eb = play(b, (s, i) => (i < 30 ? B.up : i === 30 ? B.a : s.st === "air" && s.vz < -0.04 && !s.tr ? B.x | B.right : 0), 200).evs;
  assert.ok(has(eb, "bail", "UNDER-ROTATED") && !banks(eb).length && b.score === 0, "an unfinished flip at the landing bails, and the combo is lost");
  // a spin: 180 lands, 90 bails
  const s1 = at("park", 20, 20, 32);
  const e1 = play(s1, (s, i) => (i < 30 ? B.up : i === 30 ? B.a | B.up : i === 31 ? 0 : s.st === "air" && Math.abs(s.face) < 31 ? B.right : 0), 120).evs;
  assert.ok(has(e1, "trick", "BS 180") && banks(e1)[0]?.[1] === 100, `a backside 180 lands (${JSON.stringify(banks(e1))})`);
  assert.equal(s1.fakie, true, "a 180 rides away fakie");
  const s2 = at("park", 20, 20, 32);
  const e2 = play(s2, (s, i) => (i < 30 ? B.up : i === 30 ? B.a : s.st === "air" && Math.abs(s.face) < 15 ? B.left : 0), 200).evs;
  assert.ok(has(e2, "bail", "SIDEWAYS"), "a quarter turn lands sideways: a bail");
  // a grab held through the landing bails; released in time it banks, and a held grab earns per tick
  const g1 = at("park", 20, 20, 32);
  const eg = play(g1, (s, i) => (i < 30 ? B.up : i === 30 ? B.a : i === 31 ? 0 : s.st === "air" ? B.b : null), 200).evs;
  assert.ok(has(eg, "bail", "STILL GRABBING"), "still grabbing at the landing: a bail");
  const g2 = at("park", 20, 20, 32);
  const eg2 = play(g2, (s, i) => (i < 30 ? B.up : i === 30 ? B.a : i === 31 ? 0 : s.st === "air" && i < 45 ? B.b : 0), 200).evs;
  assert.ok(banks(eg2)[0]?.[1] > 200 && has(eg2, "trick", "INDY"), `an indy, let go in time, banks its 200 and its held ticks (${JSON.stringify(banks(eg2))})`);
  // the same trick again in one combo is worth less (REPEAT)
  assert.deepEqual(S.REPEAT.slice(0, 3), [1, 0.75, 0.5]);
  ok("combos");
}

// ---- a revert on vert links the combo ------------------------------------------------------------------------------
{
  const v = NG({ level: "vert", mode: "free" });
  let n2 = 0, revd = false, done = false, mult = 0;
  const ev = play(v, (s) => {
    if (done) return null;
    mult = Math.max(mult, s.combo?.mult || 0);
    if (s.st === "air") { if (!s.tr && s.vz > 0.1) return B.b; if (s.tr && !s.tr.done && s.vz > 0) return B.b; return s.vz < 0 && s.z < 3.2 + 0.5 ? B.r : 0; }
    if (s.st === "ground" && s.combo && s.pend > 0) { revd = true; return n2++ % 2 ? B.up : B.down; }
    if (revd && !s.combo) { done = true; return 0; }
    return B.up;
  }, 1600).evs;
  const names = ev.filter(e => e[0] === "trick").map(e => e[1]);
  assert.ok(names.includes("REVERT"), `a revert pressed at the landing (${names.join(", ")})`);
  const k = names.indexOf("REVERT");
  assert.ok(names.slice(k + 1).some(x => /MANUAL/.test(x)), "the revert into a manual: the combo goes on");
  assert.ok(mult >= 3 && banks(ev).length === 0 || banks(ev)[0][3] >= 3, `one combo: grab, revert, manual (x${mult})`);
  ok("revert");
}

// ---- grinds, balance -----------------------------------------------------------------------------------------------
{
  // the park's flat rail: roll along it, ollie, hold Y, balance, off the end
  const run = (hand) => {
    const st = at("park", 19.5, 16.5, 32);
    let popped = false, gt = 0;
    const evs = play(st, (s, i) => {
      if (i < 40) return B.up | (i > 25 ? B.a : 0);
      if (!popped) { popped = true; return B.up; }
      if (s.st === "air") return B.y;
      if (s.st === "grind") { gt++; return hand(s); }
      return 0;
    }, 400).evs;
    return { st, evs, gt };
  };
  const good = run((s) => counter(s.g, B.left, B.right));
  assert.ok(has(good.evs, "grind", "flat-rail") && has(good.evs, "trick", "50-50"), "an ollie onto the flat rail and a 50-50");
  assert.ok(has(good.evs, "off") && !has(good.evs, "bail"), "held against the needle, it rides off the end");
  const bk = banks(good.evs)[0];
  assert.ok(bk && bk[2] >= 100 + 2 * (good.gt - 2) && bk[3] === 1, `the grind earns per tick (${JSON.stringify(bk)}, ${good.gt} ticks)`);
  const lazy = run(() => 0);
  assert.ok(has(lazy.evs, "bail", "OFF BALANCE") || has(lazy.evs, "off"), "left alone, the grind ends");
  // the meter: alone it falls inside two seconds; held, it lasts ten
  const B0 = { b: 0.05, bv: 0, t: 0 }; let k = 0;
  const bal = (Bx, hand, max) => { let i = 0; for (; i < max; i++) { const h = hand(Bx); Bx.t++; const side = Bx.b > 0 ? 1 : Bx.b < 0 ? -1 : 0; Bx.bv += side * (S.BAL.drift + S.BAL.grow * Bx.t) + Bx.b * S.BAL.lean; if (h < 0) Bx.bv -= S.BAL.push; if (h > 0) Bx.bv += S.BAL.push; Bx.bv *= S.BAL.damp; Bx.b += Bx.bv; if (Math.abs(Bx.b) >= 1) break; } return i; };
  k = bal({ ...B0 }, () => 0, 600);
  assert.ok(k > 20 && k < 120, `a meter left alone falls in ${k} ticks`);
  k = bal({ ...B0 }, (Bx) => (Bx.b > 0.02 ? -1 : Bx.b < -0.02 ? 1 : 0), 600);
  assert.ok(k >= 600, `a meter held against lasts ten seconds (${k})`);
  // a manual left alone bails
  const m = at("park", 20, 20, 32);
  let started = false;
  const em = play(m, (s, i) => (i < 20 ? B.up : i < 23 ? 0 : i === 23 ? B.up : i === 24 ? B.down : s.st === "manual" ? ((started = true), 0) : started ? null : 0), 300).evs;
  assert.ok(has(em, "trick", "MANUAL") && has(em, "bail", "MANUAL"), "a manual on flat ground, left alone, bails");
  // the wobble is the seed's
  const w1 = at("park", 20, 20, 32), w2 = at("park", 20, 20, 32); w2.rng = 999;
  const startM = (s) => play(s, (x, i) => (i < 20 ? B.up : i < 23 ? 0 : i === 23 ? B.up : i === 24 ? B.down : null), 40);
  startM(w1); startM(w2);
  assert.ok(w1.m && w2.m && w1.m.b !== w2.m.b, "the meter's first wobble comes from the seed");
  ok("grinds and balance");
}

// ---- lip tricks ------------------------------------------------------------------------------------------------------
{
  const v = at("vert", 10, 1.4, 48);
  v.vy = -0.14;   // slow up the north wall: a little air over the coping
  let t = 0, dropped = false;
  const ev = play(v, (s) => {
    if (s.st === "air") return s.vz < 0.03 ? B.y | B.up : 0;
    if (s.st === "lip") { if (++t > 50) return t > 51 ? 0 : B.a; return counter(s.lip, B.left, B.right); }
    if (t > 50) { dropped = true; return 0; }
    return 0;
  }, 300).evs;
  assert.ok(has(ev, "lip", "INVERT"), `an invert on the coping (${ev.filter(e => e[0] !== "bump").map(e => e[0]).join(" ")})`);
  assert.ok(dropped && banks(ev)[0]?.[1] > 300 && v.goals.includes("invert"), "dropped back in, banked, and the vert ramp's INVERT goal");
  ok("lip trick");
}

// ---- letters, tape, goals ---------------------------------------------------------------------------------------------
{
  const st = NG({ level: "park", mode: "run" });
  const it = LEVELS.park.items;
  for (const c of [...LETTERS, "tape"]) { Object.assign(st, { x: it[c].x, y: it[c].y, z: it[c].z - 0.3, st: "air", vz: 0.02 }); S.step(st, 0); }
  assert.equal(st.letters, 31); assert.ok(st.tape);
  assert.ok(st.goals.includes("skate") && st.goals.includes("tape"), "S-K-A-T-E and the tape are goals done");
  const r = S.resultOf(st);
  assert.deepEqual(Object.keys(r).sort(), ["best", "diff", "done", "game", "goals", "goalsOf", "letters", "level", "mode", "score", "seed", "tape", "ticks", "v"].sort(), "the results shape");
  assert.equal(r.letters, "SKATE"); assert.equal(r.game, "skate"); assert.equal(r.goalsOf, 6);
  // the HQ rail (THE PLAZA): down the steps from the terrace
  const p = at("street", 15, 1.5, 16);
  let popped = false;
  const ep = play(p, (s, i) => { if (i < 30) return B.up | (i > 10 ? B.a : 0); if (!popped) { popped = true; return B.up; } if (s.st === "air") return B.y; if (s.st === "grind") return counter(s.g, B.left, B.right); return 0; }, 300).evs;
  assert.ok(has(ep, "grind", "hq-rail") && p.goals.includes("hq"), `GRIND THE HQ RAIL (${ep.filter(e => e[0] === "grind").map(e => e[1])})`);
  ok("letters, tape, goals");
}

// ---- determinism: a bot's whole RUN on every level ------------------------------------------------------------------
function botWords(level, seed) {
  // a jittery skater: pushes, turns, ollies, tricks, grinds, manuals, from its own seeded generator
  let r = seed >>> 0; const R = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 4294967296; };
  const st = NG({ level, mode: "run", seed }), words = [];
  let cur = 0, hold = 0;
  while (!st.done && words.length < S.RUN_TICKS + 2000) {
    if (hold-- <= 0) {
      const k = R(); hold = 2 + Math.floor(R() * 18);
      cur = k < 0.35 ? B.up : k < 0.45 ? B.up | B.left : k < 0.55 ? B.up | B.right : k < 0.62 ? B.a : k < 0.68 ? B.x | (R() < 0.5 ? B.left : B.up) : k < 0.74 ? B.b | B.down : k < 0.8 ? B.y : k < 0.85 ? B.r : k < 0.9 ? B.down : k < 0.95 ? B.left : 0;
    }
    const w = st.st === "grind" || st.st === "lip" ? counter(st.st === "grind" ? st.g : st.lip, B.left, B.right) | (R() < 0.01 ? B.a : 0) : st.st === "manual" ? counter(st.m, B.up, B.down) : cur;
    words.push(w); S.step(st, w);
  }
  return { st, words };
}
for (const level of ["park", "vert", "street"]) {
  const { st, words } = botWords(level, 4242 + level.length);
  assert.ok(st.done && st.t >= S.RUN_TICKS, `${level}: the run ends at the horn (${st.t})`);
  const res = S.resultOf(st);
  const rec = { v: S.VERSION, cfg: { level, mode: "run", seed: st.seed, diff: "pro" }, inputLog: S.rleEncode(words) };
  assert.deepEqual(S.rleDecode(rec.inputLog), words, "RLE round-trips");
  assert.equal(S.logTicks(rec.inputLog), words.length);
  const a = S.replay(rec), b = S.replay(JSON.parse(JSON.stringify(rec)));
  assert.deepEqual(a.res, res, `${level}: the replay comes to the same result`);
  assert.deepEqual(b.res, res, `${level}: twice`);
  assert.ok(S.verify(rec, res), "verify() accepts the true claim");
  assert.ok(!S.verify(rec, { ...res, score: res.score + 10 }), "verify() refuses an inflated score");
  assert.ok(!S.verify(rec, { ...res, letters: "SKATE" }) || res.letters === "SKATE", "verify() refuses letters not collected");
  const bad = words.slice(); for (let i = 600; i < 1800; i++) bad[i] = B.up | B.a | ((i >> 3) & 1 ? B.x : B.b);
  const c = S.replay({ ...rec, inputLog: S.rleEncode(bad) });
  assert.notDeepEqual(c.res, res, `${level}: a doctored log does not reproduce the result`);
  assert.throws(() => S.replay({ ...rec, v: S.VERSION + 1 }), /version/);
  assert.ok(st.stats.tricks > 10, `${level}: the bot did tricks (${st.stats.tricks}, score ${res.score})`);
  ok(`determinism ${level}`);
}

// ---- version 2: the layout and the rules ------------------------------------------------------------------------------
{
  assert.equal(S.VERSION, 2);
  // the fixture: runs made on version 1 replay to the same result (on the frozen sim1.js, whatever sim.js becomes)
  const fx = JSON.parse(read("scripts/fixtures/skate-v1-runs.json"));
  assert.equal(fx.length, 3);
  for (const { rec, res } of fx) {
    assert.equal(rec.v, 1);
    assert.deepEqual(S.replay(rec).res, res, `a version-1 ${rec.cfg.level} run replays as it was`);
    assert.ok(S.verify(rec, res) && !S.verify(rec, { ...res, score: res.score + 1 }), "and verifies");
  }
  assert.throws(() => S.replay({ v: 3, cfg: {}, inputLog: [] }), /version/);

  // multi-flips: the flip held on goes round again. A double is worth more and needs the air; landing mid-turn bails.
  const flip = (hold, tail = 0) => {   // ollie off the park's flat, kickflip held `hold` ticks (then `tail` of nothing), land
    const st = NG({ level: "park", mode: "free", seed: 5 });
    Object.assign(st, { x: 20, y: 20, h: 32, z: 0 });
    let k = 0;
    const { evs } = play(st, (s, i) => { if (i < 30) return B.up; if (i === 30) return B.a; if (s.st === "air") { k++; return k <= hold ? B.x | B.left : 0; } return k ? null : 0; }, 300);
    return { st, evs };
  };
  // a high ollie (a quarter pipe's air) gives the time for a double and a triple
  const vertFlip = (hold) => {   // a big air (the pumped halfpipe's): flip pressed on the 6th tick, held `hold` ticks
    const st = NG({ level: "park", mode: "free" });
    Object.assign(st, { x: 20, y: 12, z: 0, st: "air", vz: 0.26, vert: -1 });
    let air = 0;
    const { evs } = play(st, (s) => { if (s.st === "air") { air++; return air > 5 && air <= 5 + hold ? B.x | B.left : 0; } return 0; }, 150);
    return { st, evs };
  };
  const one = vertFlip(6), two = vertFlip(24), three = vertFlip(38);
  const nm = (e) => e.filter(x => x[0] === "trick").map(x => x[1]);
  assert.deepEqual(nm(one.evs), ["KICKFLIP"]); assert.deepEqual([...new Set(nm(two.evs))].pop(), "DOUBLE KICKFLIP", `held on: a double (${nm(two.evs)})`); assert.equal([...new Set(nm(three.evs))].pop(), "TRIPLE KICKFLIP", `held on: a triple (${nm(three.evs)})`);
  const pts = (r) => banks(r.evs)[0]?.[2];
  assert.ok(pts(one) === 100 && pts(two) >= 240 && pts(three) >= 420, `each turn is worth more (${pts(one)}, ${pts(two)}, ${pts(three)})`);
  assert.ok(pts(two) > pts(one) && pts(three) > pts(two));
  // a tap, then another tap mid-air: a double
  const tapTap = NG({ level: "park", mode: "free" });
  let ta = 0;
  const et = play(tapTap, (s) => { if (s.st === "air") { ta++; return ta === 7 || ta === 15 ? B.x | B.left : 0; } return ta ? null : B.up; }, 600).evs;
  assert.ok(nm(et).includes("DOUBLE KICKFLIP"), `tap again mid-air: a double (${nm(et)})`);
  // a flip that is not through its turn when you land: a bail (PRO), or the rookie's 60% is done
  const late = (diff) => { const st = NG({ level: "park", mode: "free", diff }); Object.assign(st, { x: 20, y: 20, h: 32 }); let a = 0; return { st, evs: play(st, (s, i) => { if (i < 30) return B.up; if (i === 30) return B.a; if (s.st === "air") { a++; return a === 16 ? B.x | B.left : 0; } return 0; }, 200).evs }; };
  const lp = late("pro"), lr = late("rookie");
  assert.ok(has(lp.evs, "bail", "UNDER-ROTATED"), "pro: landing mid-flip is a bail");
  assert.ok(!has(lr.evs, "bail") && banks(lr.evs)[0], "rookie: a flip past 60% of its turn is landed");

  // L1 / R1 spin in the air (and the d-pad still does), and goofy mirrors the tricks
  const spin = (bit, extra = {}) => { const st = NG({ level: "park", mode: "free", ...extra }); Object.assign(st, { x: 20, y: 20, h: 32 }); return { st, evs: play(st, (s, i) => (i < 30 ? B.up : i === 30 ? B.a : s.st === "air" && Math.abs(s.face) < 31 ? bit : 0), 120).evs }; };
  assert.ok(has(spin(B.sr).evs, "trick", "BS 180") && has(spin(B.sl).evs, "trick", "FS 180"), "R1 spins one way, L1 the other");
  assert.ok(has(spin(B.sr, { goofy: true }).evs, "trick", "FS 180"), "goofy names the spin the other way");
  const gf = (goofy) => { const st = NG({ level: "park", mode: "free", goofy }); Object.assign(st, { x: 20, y: 20, h: 32 }); return nm(play(st, (s, i) => (i < 30 ? B.up : i === 30 ? B.a : s.st === "air" && !s.tr ? B.x | B.left : 0), 120).evs); };
  assert.deepEqual(gf(false), ["KICKFLIP"]); assert.deepEqual(gf(true), ["HEELFLIP"], "goofy: the d-pad's left and right swap in every trick");

  // the difficulties: ROOKIE is the default; its meters are wider and its landings kinder; SICK is harder than PRO
  assert.equal(S.newGame({ level: "park" }).diff, "rookie");
  const fall = (diff) => { const st = NG({ level: "park", mode: "free", diff }); Object.assign(st, { x: 20, y: 20, h: 32 }); let n2 = 0; play(st, (s, i) => (i < 20 ? B.up : i < 23 ? 0 : i === 23 ? B.up : i === 24 ? B.down : s.st === "manual" ? (n2++, 0) : null), 600); return n2; };
  assert.ok(fall("rookie") > fall("pro") && fall("pro") >= fall("sick"), `a manual left alone lasts longer on ROOKIE (${fall("rookie")} / ${fall("pro")} / ${fall("sick")} ticks)`);
  const grabLand = (diff) => { const st = NG({ level: "park", mode: "free", diff }); Object.assign(st, { x: 20, y: 20, h: 32 }); return play(st, (s, i) => (i < 30 ? B.up : i === 30 ? B.a : i === 31 ? 0 : s.st === "air" ? B.b : 0), 200).evs; };
  assert.ok(has(grabLand("pro"), "bail", "STILL GRABBING") && !has(grabLand("rookie"), "bail") && banks(grabLand("rookie")).length === 1, "rookie lets go of the grab for you");
  const sideways = (diff) => { const st = NG({ level: "park", mode: "free", diff }); Object.assign(st, { x: 20, y: 20, h: 32 }); return play(st, (s, i) => (i < 30 ? B.up : i === 30 ? B.a : s.st === "air" && Math.abs(s.face) < 21 ? B.right : 0), 200).evs; };   // 9 of 16: a little over a quarter turn off
  assert.ok(has(sideways("pro"), "bail", "SIDEWAYS") && !has(sideways("rookie"), "bail", "SIDEWAYS"), "rookie forgives a spin that is not quite straight");
  const gr = S.goalsFor("park", "rookie"), gp = S.goalsFor("park", "pro"), gs = S.goalsFor("park", "sick");
  assert.deepEqual(gp, LEVELS.park.goals);
  assert.ok(gr[0].n < gp[0].n && gr[1].n < gp[1].n && gs[0].n > gp[0].n, `goals sized to the level (${gr[0].n} / ${gp[0].n} / ${gs[0].n})`);
  assert.ok(/1,000/.test(gr[0].name) && /2,500/.test(gr[1].name), `the names follow (${gr[0].name}, ${gr[1].name})`);
  // the keys and the pad (input.js): by position
  const inp = read("src/play/skate/input.js");
  assert.ok(/a: btn\(pad, 0\), b: btn\(pad, 1\), x: btn\(pad, 2\), y: btn\(pad, 3\)/.test(inp), "face buttons by position: bottom ollie, right grab, left flip, top grind");
  assert.ok(/sl: btn\(pad, 4\), sr: btn\(pad, 5\), r: btn\(pad, 6\) \|\| btn\(pad, 7\)/.test(inp), "L1 / R1 spin, the triggers revert");
  const G = await import("../src/play/skate/Guide.jsx").catch(() => null);
  ok("version 2");
}

// ---- the casual human --------------------------------------------------------------------------------------------------
const casualRun = (seed, diff, level = "park") => {
  const st = NG({ level, mode: "run", seed, diff }), bot = casual(seed * 77 + 5, { level }), words = [];
  while (!st.done && words.length < S.RUN_TICKS + 2000) { const w = bot(st); words.push(w); S.step(st, w); }
  return { st, words };
};
{
  const stats = {};
  for (const diff of ["rookie", "pro", "sick"]) {
    const sc = [], two = [];
    for (let seed = 1; seed <= 30; seed++) { const { st } = casualRun(seed, diff); sc.push(st.score); two.push(st.goals.includes("score") && st.goals.includes("pro")); }
    sc.sort((a, b) => a - b);
    stats[diff] = { median: sc[15], min: sc[0], two: two.filter(Boolean).length };
  }
  assert.ok(stats.rookie.two >= 27, `the casual bot does ROOKIE's first two goals in ${stats.rookie.two} of 30 runs`);
  assert.ok(stats.rookie.median > 2 * stats.pro.median && stats.pro.median >= stats.sick.median, "ROOKIE is easier than PRO is easier than SICK");
  // and its record replays
  const { st, words } = casualRun(7, "rookie"); const rec = { v: S.VERSION, cfg: { level: "park", mode: "run", seed: 7, diff: "rookie", goofy: false }, inputLog: S.rleEncode(words) };
  assert.deepEqual(S.replay(rec).res, S.resultOf(st), "a ROOKIE run replays from its log");
  if (process.env.VERBOSE || process.env.SKATE_REPORT) console.log("casual bot, 30 two-minute runs on THE PARK:", JSON.stringify(stats));

  // simple tricks: an ollie on the flat with one kickflip (a tap) or one grab (held a while, let go), with +-100 ms noise
  const simple = (diff, kind, n2 = 300) => {
    let landed = 0;
    for (let i = 0; i < n2; i++) {
      let r = (i * 2654435761 + 12345) >>> 0; const R = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 4294967296; };
      const jit = () => Math.round((R() * 2 - 1) * 6);
      const st = NG({ level: "park", mode: "free", seed: i + 1, diff }); Object.assign(st, { x: 20, y: 20, h: 32 });
      const crouch = 6 + Math.floor(R() * 8), a = Math.max(0, 9 + jit()), len = kind === "flip" ? 5 + Math.floor(R() * 4) : 10 + Math.floor(R() * 14), dir = [B.left, B.right, B.down, B.up][Math.floor(R() * 4)];
      let e = -1, did = false;
      const evs = play(st, (s, t) => {
        if (t < 30) return B.up;
        if (t < 30 + crouch) return B.a | B.up;
        if (s.st === "air") { e++; if (e >= a && e < a + len) { did = true; return (kind === "flip" ? B.x : B.b) | dir; } return 0; }
        return 0;
      }, 400).evs;
      if (did && banks(evs).length && !has(evs, "bail")) landed++;
    }
    return landed / n2;
  };
  const rates = {};
  for (const diff of ["rookie", "pro", "sick"]) rates[diff] = { flip: simple(diff, "flip"), grab: simple(diff, "grab") };
  for (const k of ["flip", "grab"]) assert.ok(rates.rookie[k] >= 0.7, `ROOKIE lands ${Math.round(rates.rookie[k] * 100)}% of simple ${k}s (>= 70%)`);
  assert.ok(rates.rookie.flip >= rates.pro.flip && rates.pro.flip >= rates.sick.flip - 0.02, "the rates fall with the level");
  if (process.env.VERBOSE || process.env.SKATE_REPORT) console.log("casual simple tricks landed:", JSON.stringify(rates));
  ok("the casual human");
}

// ---- the city ---------------------------------------------------------------------------------------------------------
{
  const games = read("src/play/games.js"), icons = await import("../src/play/gameIcons.js"), app = read("src/App.jsx");
  assert.ok(/href: "#skate"/.test(games), "a #play tile for #skate");
  assert.ok(icons.ICONS.skate?.length === 12 && icons.ICONS.skate.every(r => r.length === 12), "the skate icon, 12 x 12");
  const { routesIn } = await import("../src/play/games.js");
  assert.ok(routesIn(app).includes("#skate") && /lazy\(\(\) => import\("\.\/play\/skate\/Skate\.jsx"\)\)/.test(app), "App serves #skate, lazily (its own chunk)");
  const arcade = JSON.parse(read("src/city/arcade.json"));
  const cab = arcade.find(g => g.slug === "house-skate");
  assert.ok(cab && cab.house === true && cab.route === "#skate" && cab.status === "live", "a SKATE cabinet among the house games (THE ARCADE's back row)");
  const HG = await import("../src/city/houseGames.js");
  assert.ok(HG.HOUSE_COLORS["house-skate"] && /case "house-skate"/.test(read("src/city/houseGames.js")), "the cabinet's marquee colours and its attract screen");
  assert.ok(/kind: "skate"/.test(read("src/city/controlIso.js")), "E in DRIVE YOURSELF: skate the park, skate the plaza");
  assert.ok(/"rec-ground": \[[^\]]*#skate/.test(read("src/city/BuildingView.jsx")), "the Recreation Ground's page: a way in");
  ok("the city");
}

console.log(`check-skate: ${n} groups ok`);
