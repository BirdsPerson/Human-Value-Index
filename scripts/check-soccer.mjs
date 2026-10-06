// THE ESTATE PITCH, playable (src/play/soccer/): the match sim, the rosters and the calls, headless.
//   purity       sim.js uses no clock, no Math.random, no trig
//   laws         offside (in front of the second-last defender and the ball when a teammate plays it;
//                not from behind the line, not from a throw-in; a save does not reset it); the ball over
//                the touchline is a throw-in to the side that did not touch it last, over the goal line
//                a goal kick or a corner by who touched it last, between the posts and under the bar a
//                goal; a foul in the area is a penalty from the spot, outside it a free kick where it
//                happened; two yellows are a red and the side plays a man short; a professional foul on
//                a man through on goal can be a red; the shootout ends by the usual arithmetic
//   controls     the human's player: a power-bar shot goes toward goal (more power, more pace), a pass
//                goes to the teammate the stick points at and takes control with it, a trick above a
//                player's stars is a stumble
//   determinism  a match played by a bot on the human's side (pressing every button, recorded frame by
//                frame) replays from {version, seed, cfg, inputLog} to the same result, twice; another
//                seed plays differently; a doctored log does not reproduce; another version is refused
//   strength     a stronger eleven beats a weaker one, and has more of the ball
//   calibration  CPU v CPU at the default length lands in football's bands per match (goals, shots, on
//                target, fouls, cards, offsides, corners)
//   roster       the team names equal the league's, the copied clock equals the city's, the fallback
//                elevens are elevens of distinct players, PLAY NOW pairs two sides, a citizen is found
//   calls        no line quotes anyone or has anyone speak
// Run: node scripts/check-soccer.mjs   (QUICK=1 skips the calibration's long run)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const S = await import("../src/play/soccer/sim.js");
const R = await import("../src/play/soccer/roster.js");
const K = await import("../src/play/soccer/calls.js");
const T = S._test, { BTN, PITCH: P_ } = S;
let n = 0;
const ok = (msg) => { n++; if (process.env.VERBOSE) console.log("ok", msg); };

// ---- purity -------------------------------------------------------------------------------------------------
{
  const src = readFileSync(new URL("../src/play/soccer/sim.js", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  for (const bad of ["Math.random", "Date.now", "performance", "Math.sin", "Math.cos", "Math.tan", "Math.atan", "Math.acos", "Math.hypot", "Math.pow", "Math.exp", "Math.log", "**", "document", "window", "globalThis"]) {
    if (bad === "**") continue;   // 2 ** n is exact for the bit sets
    assert.ok(!src.includes(bad), `sim.js uses ${bad}`);
  }
  ok("purity");
}

const eleven = (p, r) => Array.from({ length: 11 }, (_, i) => [`${p}${i}`, `${p.toUpperCase()} ${i}`, r - (i % 4)]);
const STARS = eleven("star", 86), CELEBS = eleven("celeb", 52), EVEN_A = eleven("a", 60), EVEN_B = eleven("b", 60);
const fresh = (cfg = {}) => { const st = S.newGame(cfg.seed || 7, { auto: true, home: EVEN_A, away: EVEN_B, ...cfg }); st.phase = "live"; st.rs = null; return st; };
// Clear the pitch: everyone to the far corners, then the actors placed.
// (team 1's spare men behind the play, near team 0's own goal, so they set no line)
function clearOut(st) { const a = S.att(st, 0); for (const P of st.p) T.place(P, a * (P.t === 0 ? -48 : -40), P.i < 6 ? 1 + P.i : 61 + (P.i - 6)); }
const run = (st, frames, mask = 0) => { for (let f = 0; f < frames && st.phase !== "over"; f++) S.step(st, typeof mask === "function" ? mask(st) : mask); };
const until = (st, pred, frames = 600, mask = 0) => { for (let f = 0; f < frames; f++) { S.step(st, typeof mask === "function" ? mask(st) : mask); if (pred(st)) return true; } return false; };

// ---- laws: offside --------------------------------------------------------------------------------------------
{
  // a pass to a man beyond the second-last defender: offside, an indirect free kick to the defence
  const st = fresh(), a = S.att(st, 0);
  clearOut(st);
  T.place(st.p[11], a * 51, 34); T.place(st.p[12], a * 20, 20); T.place(st.p[13], a * 20, 48);
  const P = st.p[5], Q = st.p[9];
  T.place(P, 0, 34); T.place(Q, a * 30, 34);
  st.ball.x = P.x; st.ball.y = P.y; T.own(st, P);
  assert.equal(S.offsideLine(st, 0), 20, "the line is the second-last defender");
  T.passTo(st, P, Q.x, Q.y, Q);
  assert.ok(st.ofs && st.ofs.set & (1 << Q.i), "the receiver was beyond the line when it was played");
  assert.ok(until(st, s => s.phase !== "live", 400), "the flag goes up");
  assert.equal(st.rs.type, "ifk"); assert.equal(st.rs.team, 1); assert.equal(st.stats.off[0], 1);
  ok("offside: beyond the line");
}
{
  // level or behind: play on; and a throw-in cannot be offside
  const st = fresh(), a = S.att(st, 0);
  clearOut(st);
  T.place(st.p[11], a * 51, 34); T.place(st.p[12], a * 20, 20); T.place(st.p[13], a * 20, 48);
  const P = st.p[5], Q = st.p[9];
  T.place(P, 0, 34); T.place(Q, a * 19, 34);
  st.ball.x = P.x; st.ball.y = P.y; T.own(st, P);
  T.passTo(st, P, Q.x, Q.y, Q);
  assert.equal(st.ofs, null, "nobody beyond the line");
  assert.ok(until(st, s => s.ball.own === Q.g, 300), "the receiver takes it");
  assert.equal(st.stats.off[0], 0);
  const st2 = fresh();
  clearOut(st2);
  S.restart(st2, "throw", 0, a * 10, 0);
  T.place(st2.p[9], a * 40, 30);
  st2.t = 999;
  const taker = st2.p[st2.rs.taker];
  T.kick(st2, taker, 0, 6, 2, "throw", st2.p[9].g, 0, true);
  st2.phase = "live";
  assert.equal(st2.ofs, null, "no offside from a throw-in");
  ok("offside: onside and throw-ins");
}
{
  // a keeper's save does not reset it: the rebound to a man who was offside is still offside
  const st = fresh(), a = S.att(st, 0);
  clearOut(st);
  const K0 = st.p[11];
  T.place(K0, a * 51, 34); T.place(st.p[12], a * 30, 20); T.place(st.p[13], a * 30, 50);
  const P = st.p[5], Q = st.p[9];
  T.place(P, a * 25, 34); T.place(Q, a * 40, 34);
  st.ball.x = P.x; st.ball.y = P.y; T.own(st, P);
  T.kick(st, P, a * 20, 0, 1, "pass", -1);
  assert.ok(st.ofs.set & (1 << Q.i));
  T.touch(st, K0, true);
  assert.ok(st.ofs, "the save leaves the snapshot");
  assert.equal(T.touch(st, Q), true, "the offside man's touch is offside");
  ok("offside: through a save");
}

// ---- laws: out of play and goals --------------------------------------------------------------------------------
for (const [label, setup, expect] of [
  ["touchline", (st, a) => { const P = st.p[5]; T.place(P, a * 0, 60); st.ball.x = 0; st.ball.y = 60.5; T.kick(st, P, 0, 9, 0, "pass"); }, (st) => st.rs?.type === "throw" && st.rs.team === 1],
  ["goal kick", (st, a) => { const P = st.p[5]; T.place(P, a * 40, 50); st.ball.x = P.x; st.ball.y = 50; T.kick(st, P, a * 20, 3, 0, "pass"); }, (st) => st.rs?.type === "goal" && st.rs.team === 1],
  ["corner", (st, a) => { const P = st.p[14]; T.place(P, a * 40, 50); st.ball.x = P.x; st.ball.y = 50; T.kick(st, P, a * 20, 3, 0, "pass"); }, (st) => st.rs?.type === "corner" && st.rs.team === 0],
  ["goal", (st, a) => { const P = st.p[9]; T.place(P, a * 40, 34); st.ball.x = P.x; st.ball.y = 34; T.place(st.p[11], a * 51, 20); T.kick(st, P, a * 25, 0, 1.5, "pass"); }, (st) => st.phase === "goal" && st.score[0] === 1],
]) {
  const st = fresh(), a = S.att(st, 0);
  clearOut(st);
  T.place(st.p[11], a * 51, 10);
  setup(st, a);
  assert.ok(until(st, s => s.phase !== "live", 400), `${label}: the ball goes out`);
  assert.ok(expect(st), `${label}: ${st.phase} ${st.rs?.type} team ${st.rs?.team} score ${st.score}`);
  ok(`out of play: ${label}`);
}
{
  // the woodwork: off the post is not a goal
  const st = fresh(), a = S.att(st, 0);
  clearOut(st);
  T.place(st.p[11], a * 51, 10);
  const P = st.p[9]; T.place(P, a * 40, P_.cy + P_.gw);
  st.ball.x = P.x; st.ball.y = P.y; T.kick(st, P, a * 25, 0, 1.2, "pass");
  assert.ok(until(st, s => s.note?.k === "post" || s.phase !== "live", 200));
  assert.equal(st.note.k, "post"); assert.equal(st.score[0], 0);
  ok("the post");
}

// ---- laws: fouls, cards, penalties ----------------------------------------------------------------------------------
{
  const st = fresh(), a = S.att(st, 0);
  clearOut(st);
  const V = st.p[9], O = st.p[13];
  T.place(V, a * 45, 34); T.place(O, a * 44, 34.5);
  st.ball.x = V.x; st.ball.y = V.y; T.own(st, V);
  S.foul(st, O, V, 0, false);
  assert.equal(st.rs.type, "pen", "a foul in the area is a penalty");
  assert.equal(st.ball.x, a * (P_.hx - P_.spot)); assert.equal(st.ball.y, 34);
  assert.equal(st.stats.fouls[1], 1);
  // the kick: a bot's, resolved one way or the other
  st.t = 9999; st.cfg.auto = true;
  assert.ok(until(st, s => s.phase !== "dead", 600));
  assert.ok(until(st, s => s.phase !== "live" || s.ball.own >= 0, 600), "the penalty is resolved");
  ok("penalty");
}
{
  const st = fresh(), a = S.att(st, 0);
  clearOut(st);
  const V = st.p[9], O = st.p[13];
  T.place(V, a * 0, 34); T.place(O, a * 1, 34.5);
  st.ball.x = V.x; st.ball.y = V.y; T.own(st, V);
  const at = V.x;
  assert.equal(S.foul(st, O, V, 1, false), "yellow");
  assert.equal(st.rs.type, "fk"); assert.ok(Math.abs(st.rs.x - at) < 0.5, "the free kick is where it happened");
  st.phase = "live"; st.rs = null;
  assert.equal(S.foul(st, O, V, 1, false), "second", "a second yellow");
  assert.ok(O.off, "sent off"); assert.equal(st.stats.red[1], 1); assert.equal(st.stats.yel[1], 2);
  assert.equal(st.p.filter(P => P.t === 1 && !P.off).length, 10, "ten men");
  assert.ok(S.offsideLine(st, 0) >= 0);
  const st2 = fresh(); clearOut(st2);
  const V2 = st2.p[9], O2 = st2.p[13];
  T.place(V2, a * 25, 34); T.place(O2, a * 24, 34);
  st2.ball.x = V2.x; st2.ball.y = V2.y; T.own(st2, V2);
  assert.equal(S.foul(st2, O2, V2, 2, false), "red", "serious foul play is a straight red");
  ok("cards");
}
{
  assert.equal(S.shootoutOver({ kicks: [[true, true, true], [false, false, false]] }), true, "3-0 after three each: over");
  assert.equal(S.shootoutOver({ kicks: [[true, true, true, true, true], [true, true, true, true, true]] }), false, "5-5: sudden death");
  assert.equal(S.shootoutOver({ kicks: [[true, true, true, true, true, true], [true, true, true, true, true, false]] }), true);
  assert.equal(S.shootoutOver({ kicks: [[true, true, true, true], [true, true, true]] }), false);
  // a knockout level at full time: extra time, then penalties, then a winner
  const st = S.newGame(11, { auto: true, ko: true, half: 3, home: EVEN_A, away: EVEN_B });
  st.half = 2; st.clock = st.halfLen; st.added = 0; st.score = [1, 1];
  run(st, 200);
  assert.equal(st.half, 3, "extra time");
  st.half = 4; st.clock = st.halfLen; st.added = 0; st.score = [1, 1];
  assert.ok(until(st, s => s.phase === "over", 40000), "the shootout ends");
  const r = S.resultOf(st);
  assert.ok(r.pens && r.pens[0] !== r.pens[1] && r.winner >= 0, `penalties decide it: ${r.pens}`);
  ok("extra time and penalties");
}

// ---- the human's controls ---------------------------------------------------------------------------------------------
{
  // the power bar: hold B, let go; it goes toward goal, harder with more power
  const speeds = [];
  for (const hold of [10, 40]) {
    const st = S.newGame(5, { home: EVEN_A, away: EVEN_B }); st.phase = "live";
    clearOut(st);
    const a = S.att(st, 0), P = st.p[9];
    T.place(P, a * 30, 34); P.fx = a; P.fy = 0; st.ctl = P.i;
    st.ball.x = P.x + a * 0.5; st.ball.y = 34; T.own(st, P);
    for (let f = 0; f < hold; f++) S.step(st, BTN.B);
    S.step(st, 0);
    assert.equal(st.ball.kind, "shot", "released B shoots");
    assert.ok(st.ball.vx * a > 0, "toward goal");
    speeds.push(Math.sqrt(st.ball.vx ** 2 + st.ball.vy ** 2));
    assert.equal(st.stats.shots[0], 1);
  }
  assert.ok(speeds[1] > speeds[0] + 4, `more power, more pace: ${speeds.map(v => v.toFixed(1))}`);
  ok("power-bar shot");
}
{
  // A passes to the man the stick points at; control goes with the ball
  const st = S.newGame(5, { home: EVEN_A, away: EVEN_B }); st.phase = "live";
  clearOut(st);
  const a = S.att(st, 0), P = st.p[6], up = st.p[7], down = st.p[8];
  T.place(P, 0, 34); T.place(up, a * 5, 50); T.place(down, a * 5, 18);
  st.ctl = P.i; st.ball.x = P.x; st.ball.y = 34; T.own(st, P);
  S.step(st, BTN.UP | BTN.A);
  assert.equal(st.ball.recv, up.g, "the pass goes up the screen");
  assert.equal(st.ctl, up.i, "control goes with it");
  ok("assisted pass");
}
{
  // stars gate the tricks: a 1-star player's roulette is a stumble; a 5-star's is a roulette
  for (const [r, want] of [[52, "stumble"], [95, "roulette"]]) {
    const st = S.newGame(5, { home: eleven("t", r), away: EVEN_B }); st.phase = "live";
    clearOut(st);
    const a = S.att(st, 0), P = st.p[9];
    T.place(P, 0, 34); st.ctl = P.i; st.ball.x = P.x; st.ball.y = 34; T.own(st, P);
    S.step(st, 0);
    S.step(st, a > 0 ? BTN.RL : BTN.RR);
    assert.equal(P.act?.kind, want, `rated ${r}: ${P.act?.kind}`);
  }
  ok("skill moves gated by stars");
}

// ---- determinism and the record --------------------------------------------------------------------------------------
// A bot on the human's side, pressing everything a person would: steering at goal, shooting with the
// bar, passing, crosses and through balls, tricks, tackles, slides and switches, the set pieces.
function humanBot(st) {
  const f = st.frame, P = st.p[st.ctl], a = S.att(st, 0), b = st.ball;
  let m = 0;
  if (st.phase === "kickoff") return f % 50 === 0 ? BTN.A : 0;
  if (st.phase === "dead" && st.rs?.team === 0) return (st.t % 40 < 20 ? BTN.B : 0) | ((f >> 4) % 3 === 0 ? BTN.UP : 0) | (st.t % 90 === 70 ? BTN.A : 0) | (st.t % 130 === 120 ? BTN.X : 0);
  if (!P) return 0;
  const dx = b.x - P.x, dy = b.y - P.y;
  if (b.own === P.g) {
    m |= a > 0 ? BTN.RIGHT : BTN.LEFT;
    if (P.y < 30) m |= BTN.UP; else if (P.y > 38) m |= BTN.DOWN;
    if (f % 23 < 10) m |= BTN.RT;
    const u = a * P.x;
    if (u > 16 && (f >> 3) % 6 < 3) m |= BTN.B;                 // hold B to shoot, let go
    else if (f % 37 === 0) m |= BTN.A;
    else if (f % 53 < 12 && f % 53 > 2) m |= BTN.Y;
    else if (f % 71 < 8 && f % 71 > 1) m |= BTN.X;
    else if (f % 97 === 5) m |= BTN.RR;
    else if (f % 89 === 7) m |= BTN.LB;
  } else {
    if (dx > 0.5) m |= BTN.RIGHT; else if (dx < -0.5) m |= BTN.LEFT;
    if (dy > 0.5) m |= BTN.UP; else if (dy < -0.5) m |= BTN.DOWN;
    if (dx * dx + dy * dy > 16) m |= BTN.RT;
    if (dx * dx + dy * dy < 2 && f % 19 === 0) m |= BTN.A;
    if (dx * dx + dy * dy < 4 && f % 151 === 0) m |= BTN.B;
    if (f % 120 === 60) m |= BTN.LB;
    if (f % 40 < 15) m |= BTN.X;
  }
  return m;
}
function playRecorded(seed, cfg) {
  const st = S.newGame(seed, cfg), masks = [];
  while (st.phase !== "over" && masks.length < 400000) { const m = humanBot(st); masks.push(m); S.step(st, m); }
  return { st, rec: { version: S.VERSION, seed, cfg, inputLog: S.rleEncode(masks), result: S.resultOf(st) } };
}
{
  const cfg = { half: 3, form: "433", easy: false, home: EVEN_A, away: EVEN_B };
  const { st, rec } = playRecorded(1234, cfg);
  assert.equal(st.phase, "over");
  const r = rec.result;
  assert.ok(r.stats.passes[0] > 20 && r.stats.shots[0] > 0, `the bot played: ${JSON.stringify(r.stats.passes)} passes, ${r.stats.shots[0]} shots`);
  assert.deepEqual(S.replay(rec), r, "the record replays to the same result");
  assert.deepEqual(S.replay(JSON.parse(JSON.stringify(rec))), r, "and again, through JSON");
  assert.deepEqual(S.rleDecode(S.rleEncode([1, 1, 2, 0, 0, 0, 5])), [1, 1, 2, 0, 0, 0, 5], "RLE round trip");
  const other = playRecorded(4321, cfg).rec.result;
  assert.notDeepEqual(other, r, "another seed plays differently");
  // a doctored log: a few frames of the human's input changed
  const masks = S.rleDecode(rec.inputLog);
  let changed = 0;
  for (let i = 3000; i < masks.length && changed < 40; i += 97) { masks[i] = masks[i] ^ (BTN.B | BTN.RIGHT); changed++; }
  assert.notDeepEqual(S.replay({ ...rec, inputLog: S.rleEncode(masks) }), r, "a doctored log does not reproduce the result");
  assert.throws(() => S.replay({ ...rec, version: S.VERSION + 1 }), /another version/);
  // easy mode and player lock are part of the record too
  const e = playRecorded(77, { ...cfg, half: 3, easy: true, lock: 9 });
  assert.deepEqual(S.replay(e.rec), e.rec.result, "easy + player lock replays");
  ok("determinism and the record");
}

// ---- strength ---------------------------------------------------------------------------------------------------------
{
  let wins = 0, gf = 0, ga = 0, poss = 0, N = 8;
  for (let s = 1; s <= N; s++) {
    const st = S.newGame(s * 101, { auto: true, half: 3, home: STARS, away: CELEBS });
    run(st, 400000);
    const r = S.resultOf(st);
    if (r.winner === 0) wins++;
    gf += r.score[0]; ga += r.score[1]; poss += r.stats.poss[0] / (r.stats.poss[0] + r.stats.poss[1]);
  }
  assert.ok(wins >= 6, `the stronger eleven wins ${wins} of ${N}`);
  assert.ok(gf > ga * 2, `and outscores them ${gf}-${ga}`);
  assert.ok(poss / N > 0.5, `and has more of the ball: ${(100 * poss / N).toFixed(1)}%`);
  ok("strength");
}

// ---- calibration ------------------------------------------------------------------------------------------------------------
{
  const N = process.env.QUICK ? 6 : 24, agg = {};
  const rows = (p) => [[`${p}a`, "A", 83], [`${p}b`, "B", 78], [`${p}c`, "C", 63], [`${p}d`, "D", 58], [`${p}e`, "E", 58], [`${p}f`, "F", 55], [`${p}g`, "G", 53], [`${p}h`, "H", 52], [`${p}i`, "I", 51], [`${p}j`, "J", 50], [`${p}k`, "K", 49]];
  for (let s = 1; s <= N; s++) {
    const st = S.newGame(s * 7919, { auto: true, home: rows("h"), away: rows("w") });
    run(st, 400000);
    const r = S.resultOf(st);
    const add = (k, v) => (agg[k] = (agg[k] || 0) + v / N);
    add("goals", r.score[0] + r.score[1]);
    for (const k of ["shots", "on", "fouls", "yel", "red", "off", "corners"]) add(k, r.stats[k][0] + r.stats[k][1]);
  }
  const bands = { goals: [2.0, 3.8], shots: [19, 34], on: [6.5, 13], fouls: [6, 16], yel: [1, 4], red: [0, 0.8], off: [1, 5], corners: [4, 12] };
  if (process.env.QUICK) for (const k of Object.keys(bands)) bands[k] = [bands[k][0] * 0.5, bands[k][1] * 1.6];
  for (const [k, [lo, hi]] of Object.entries(bands)) assert.ok(agg[k] >= lo && agg[k] <= hi, `calibration: ${k} ${agg[k].toFixed(2)} per match, wanted ${lo}-${hi}`);
  if (process.env.VERBOSE) console.log("calibration", Object.entries(agg).map(([k, v]) => `${k} ${v.toFixed(2)}`).join("  "));
  ok("calibration");
}

// ---- roster --------------------------------------------------------------------------------------------------------------
{
  const L = await import("../src/city/leagues.js");
  const SIM = await import("../src/city/sim.js");
  assert.deepEqual(R.TEAM_IDS, L.DIST, "the districts are the league's");
  for (const id of R.TEAM_IDS) assert.equal(R.teamName(id), L.sportTeamName(id, "soccer"), `team ${id} named as the league names it`);
  assert.equal(R.CITY_EPOCH, SIM.CITY_EPOCH); assert.equal(R.CLOCK_SCALE, SIM.DEFAULT_SCALE);
  const now = Date.UTC(2026, 9, 5, 20, 0, 0);
  assert.equal(R.machineDay(now), SIM.machineClock(now).day, "the machine day matches the city's clock");
  const seen = new Set();
  for (const id of R.TEAM_IDS) {
    const t = R.FALLBACK.teams[id];
    assert.equal(t.length, 11, `${id} fields eleven`);
    for (const [k, nm, r] of t) { assert.ok(!seen.has(k), `${k} on one team only`); seen.add(k); assert.ok(typeof nm === "string" && r > 0 && r < 100); }
    assert.ok(R.KITS[id] && R.KITS[id].length === 2);
  }
  const [h, w] = R.playNowPair(R.FALLBACK);
  assert.equal(h, "hq"); assert.notEqual(h, w);
  const lg = { ...R.FALLBACK, teams: { ...R.FALLBACK.teams, works: [...R.FALLBACK.teams.works.slice(0, 10), ["citizen-ab12", "SUBJECT AB12", 55]] } };
  assert.equal(R.teamOfCase(lg, "HVI-XXXXAB12"), "works");
  assert.deepEqual(R.playNowPair(lg, "works")[0], "works");
  const sum = { day: 9, civic: { leagues: { season: 3 }, districts: Object.fromEntries(R.TEAM_IDS.map(id => [id, { teams: { soccer: { roster: R.FALLBACK.teams[id], pos: 1 } } }])) } };
  assert.equal(R.leagueFrom(sum).teams.hq.length, 11);
  // the keeper is the league's: the lowest rated keeps goal
  const XI = S.lineUp(R.FALLBACK.teams.hq, "442");
  assert.equal(XI[0][2], Math.min(...R.FALLBACK.teams.hq.map(r => r[2])), "the lowest rated keeps goal");
  const kits = R.kitsFor("hq", "works"), gks = R.keeperKits(kits);
  assert.ok(gks[0] !== gks[1] && !kits.flat().includes(gks[0]), "the keepers wear their own colours");
  ok("roster");
}

// ---- calls --------------------------------------------------------------------------------------------------------------
{
  for (const line of K.ALL_LINES) {
    assert.ok(!/["“”‘’]/.test(line), `a quotation: ${line}`);
    assert.ok(!/\b(SAYS|SAID|TELLS|TOLD|ASKS|SHOUTS|SCREAMS|WHISPERS)\b/.test(line), `someone speaks: ${line}`);
  }
  const names = Array.from({ length: 22 }, (_, i) => `P${i}`);
  assert.match(K.callFor({ k: "goal", g: 9, team: 0 }, names, ["HOME F.C.", "AWAY F.C."], 1), /P9/);
  assert.match(K.callFor({ k: "foul", g: 13, team: 1, card: "second" }, names, ["H", "A"], 0), /SECOND YELLOW/);
  assert.equal(K.callFor({ k: "nothing" }, names, ["H", "A"]), null);
  ok("calls");
}

console.log(`check-soccer: ${n} checks passed`);
