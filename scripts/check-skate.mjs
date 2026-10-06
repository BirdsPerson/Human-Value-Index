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
// Run: node scripts/check-skate.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const S = await import("../src/play/skate/sim.js");
const { LEVELS, LEVEL_IDS, LETTERS } = await import("../src/play/skate/levels.js");
const B = S.BIT;
let n = 0;
const ok = (msg) => { n++; if (process.env.VERBOSE) console.log("ok", msg); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ---- purity ----------------------------------------------------------------------------------------------------
{
  const src = read("src/play/skate/sim.js").replace(/\/\/.*$/gm, "");
  for (const bad of ["Math.random", "Date.now", "performance", "Math.sin", "Math.cos", "Math.tan", "Math.atan", "Math.hypot", "Math.pow", "Math.exp", "Math.log", "**", "document", "window"]) assert.ok(!src.includes(bad), `sim.js uses ${bad}`);
  for (let i = 0; i < 64; i++) assert.ok(Math.abs(S.COS[i] - Math.cos((i * Math.PI) / 32)) < 1e-9 && Math.abs(S.SIN[i] - Math.sin((i * Math.PI) / 32)) < 1e-9, "the compass by series");
  ok("purity");
}

// ---- the levels ----------------------------------------------------------------------------------------------------
const KINDS = new Set(["score", "combo", "letters", "tape", "grind", "trick", "spin"]);
for (const id of LEVEL_IDS) {
  const D = LEVELS[id], L = S.levelOf(id);
  const st = S.newGame({ level: id });
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
function at(level, x, y, h, extra = {}) { const st = S.newGame({ level, mode: "free", seed: 11 }); const L = S.levelOf(level), g = S.ground(L, x, y); Object.assign(st, { x, y, h, z: g.h, o: g.o }, extra); return st; }

// ---- physics -------------------------------------------------------------------------------------------------------
{
  // push north from the park's start: up the north quarter pipe, straight up, back down
  const st = S.newGame({ level: "park", mode: "free" });
  let apex = 0, launchX = null, landed = false;
  play(st, (s) => { if (s.st === "air") { apex = Math.max(apex, s.z); if (launchX === null) launchX = s.x; } if (landed) return null; return B.up; }, 600).evs;
  const st2 = S.newGame({ level: "park", mode: "free" }), ev2 = play(st2, () => B.up, 400).evs;
  assert.ok(has(ev2, "launch") && has(ev2, "land"), "the quarter pipe launches and you land back on it");
  const st3 = S.newGame({ level: "park", mode: "free" }); let a3 = 0, x3 = new Set();
  play(st3, (s) => { if (s.st === "air") { a3 = Math.max(a3, s.z); x3.add(s.y.toFixed(3)); } return B.up; }, 260);
  assert.ok(a3 > 1.6 + 0.4 && a3 < 1.6 + 2.5, `vert air over the park's coping (${a3.toFixed(2)})`);
  assert.ok(x3.size === 1, "straight up: the skater stays over the lip in the air");
  // you cannot push up a quarter pipe (a pump only)
  const q = at("park", 18, 2.2, 48);
  play(q, () => B.up, 1);
  assert.ok(Math.abs(q.vy) < 0.01, "no push on a ramp");
  // the halfpipe: pumping climbs, air after air
  const v = S.newGame({ level: "vert", mode: "free" }), launches = [];
  play(v, (s) => { for (const e of s.ev) if (e[0] === "launch") launches.push(s.vz); return B.up; }, 900);
  assert.ok(launches.length >= 4 && launches[3] > launches[0] + 0.05 && launches.every(x => x <= S.P.VZ_MAX + 1e-9), `pumping climbs the vert ramp (${launches.map(x => x.toFixed(2)).join(" ")})`);
  const idle = S.newGame({ level: "vert", mode: "free" }), ei = play(idle, () => 0, 600).evs;
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
  const st = S.newGame({ level: "park", mode: "free" });
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
  const v = S.newGame({ level: "vert", mode: "free" });
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
  const st = S.newGame({ level: "park", mode: "run" });
  const it = LEVELS.park.items;
  for (const c of [...LETTERS, "tape"]) { Object.assign(st, { x: it[c].x, y: it[c].y, z: it[c].z - 0.3, st: "air", vz: 0.02 }); S.step(st, 0); }
  assert.equal(st.letters, 31); assert.ok(st.tape);
  assert.ok(st.goals.includes("skate") && st.goals.includes("tape"), "S-K-A-T-E and the tape are goals done");
  const r = S.resultOf(st);
  assert.deepEqual(Object.keys(r).sort(), ["best", "done", "game", "goals", "goalsOf", "letters", "level", "mode", "score", "seed", "tape", "ticks", "v"].sort(), "the results shape");
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
  const st = S.newGame({ level, mode: "run", seed }), words = [];
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
  const rec = { v: S.VERSION, cfg: { level, mode: "run", seed: st.seed }, inputLog: S.rleEncode(words) };
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
