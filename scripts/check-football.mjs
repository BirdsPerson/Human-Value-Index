// THE BOWL, playable (src/play/football/): the game sim, the rosters and the calls, headless.
//   purity       sim.js uses no clock, no Math.random, no trig
//   rules        a first down resets the chains; short of the line the down advances; an incompletion
//                keeps the spot; a fourth-down failure turns it over on downs; a touchdown is 6, the
//                extra point 1, a two-point try 2, a field goal 3, a safety 2 (and the free kick from
//                the 20); kickoff and punt touchbacks at the 25 and the 20; a missed field goal gives
//                the ball back at the spot of the kick; holding moves it back 10 and replays the down;
//                pass interference is a spot foul and a first down; a perfect kick clears the bar, a
//                shank does not; the end of the 4th quarter ends a decided game
//   determinism  a game played by a bot on the human's side (play calls in the mask, snaps, throws,
//                kick meters) replays from {version, seed, cfg, inputLog} to the same result, twice;
//                a different seed plays differently; the RLE log round-trips; a doctored log does not
//                reproduce the result; a record of another version is refused
//   strength     a stronger eleven beats a weaker one over CPU games
//   calibration  over many CPU games: yards a play 5 to 6.5, completions 58 to 70 percent, sacks a few
//                a game, interceptions near the league's 2 percent, rushing at least 2 yards a carry
//   roster       the team names equal the league's (city/leagues.js), the copied clock equals
//                city/sim.js, the fallback rosters are elevens of distinct players, PLAY NOW pairs two
//                different teams, a citizen entrant is found on their team, named quarterbacks play QB
//   calls        no line quotes anyone or has anyone speak
// Run: node scripts/check-football.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const S = await import("../src/play/football/sim.js");
const R = await import("../src/play/football/roster.js");
const K = await import("../src/play/football/calls.js");
const { BTN, OS, CODE } = S;
let n = 0;
const ok = (msg) => { n++; if (process.env.VERBOSE) console.log("ok", msg); };

// ---- purity ------------------------------------------------------------------------------------------
{
  const src = readFileSync(new URL("../src/play/football/sim.js", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  for (const bad of ["Math.random", "Date.now", "performance", "Math.sin", "Math.cos", "Math.tan", "Math.atan", "Math.hypot", "Math.pow", "Math.exp", "Math.log", "document", "window"]) assert.ok(!src.includes(bad), `sim.js uses ${bad}`);
  ok("purity");
}

const mk = (p, r) => Array.from({ length: 11 }, (_, i) => [`${p}${i}`, `${p.toUpperCase()} ${i}`, r - i]);
const STARS = mk("star", 88), CELEBS = mk("celeb", 56);
const fresh = (seed = 5) => S.newGame(seed, { auto: true, home: STARS, away: CELEBS });
const carrier = (st, t = st.poss) => st.p[st.off[t][OS.RB]];

// ---- rules -------------------------------------------------------------------------------------------
{
  const st = fresh();
  S.setUp(st, { poss: 0, x: 30, down: 1, togo: 10 }); S.forceCalls(st, 1, 34);
  S.forceWhistle(st, { k: "down", x: 41, y: 26, g: carrier(st).g });
  assert.equal(st.poss, 0); assert.equal(st.down, 1); assert.equal(Math.round(st.los), 41); assert.equal(Math.round(st.fd), 51);
  ok("a first down moves the chains");
  S.setUp(st, { poss: 0, x: 30, down: 1, togo: 10 }); S.forceCalls(st, 1, 34);
  S.forceWhistle(st, { k: "down", x: 33, y: 26, g: carrier(st).g });
  assert.equal(st.down, 2); assert.equal(Math.round(st.togo), 7);
  ok("short of the line: 2nd & 7");
  S.setUp(st, { poss: 0, x: 30, down: 2, togo: 7 }); S.forceCalls(st, 5, 34);
  S.forceWhistle(st, { k: "inc" });
  assert.equal(st.down, 3); assert.equal(Math.round(st.los), 30); assert.equal(Math.round(st.togo), 7);
  ok("an incompletion keeps the spot");
  S.setUp(st, { poss: 0, x: 30, down: 4, togo: 5 }); S.forceCalls(st, 1, 34);
  S.forceWhistle(st, { k: "down", x: 32, y: 26, g: carrier(st).g });
  assert.equal(st.poss, 1); assert.equal(st.down, 1); assert.equal(Math.round(st.los), 32);
  ok("turnover on downs");
  // team 1 attacks -x: its gains reduce x
  S.setUp(st, { poss: 1, x: 60, down: 1, togo: 10 }); S.forceCalls(st, 1, 34);
  S.forceWhistle(st, { k: "down", x: 48, y: 26, g: carrier(st, 1).g });
  assert.equal(st.poss, 1); assert.equal(st.down, 1); assert.equal(Math.round(st.fd), 38);
  ok("the other direction");
}
{
  // touchdown 6, then the extra point 1
  const st = fresh();
  S.setUp(st, { poss: 0, x: 95, down: 1, togo: 5 }); S.forceCalls(st, 1, 34);
  const C = carrier(st); C.x = 100.5;
  S.forceWhistle(st, { k: "down", x: 100.5, y: 26, g: C.g });
  assert.deepEqual(st.score, [6, 0], "a touchdown is six");
  assert.equal(st.stat[0].td, 1);
  // the CPU kicks the point: a perfect kick
  for (let i = 0; i < 20 && !(st.phase === "pre" && st.play.kind === "pat"); i++) S.step(st, 0);
  assert.equal(st.play.kind, "pat", "the try is a kick from the 15");
  assert.equal(Math.round(S.toGoal(0, st.los)), 15);
  st.kick.pow = 1; st.kick.e = 0;
  for (let i = 0; i < 600 && st.score[0] === 6; i++) S.step(st, 0);
  assert.deepEqual(st.score, [7, 0], "the extra point is one");
  assert.equal(st.play.kind, "ko"); assert.equal(st.kick.by, 0, "the scorer kicks off");
  ok("touchdown and extra point");
}
{
  // two-point try
  const st = fresh();
  S.setUp(st, { poss: 0, x: 98, down: 1, togo: 2 }); st.tryFor = 0; S.forceCalls(st, 1, 34);
  assert.ok(st.play.try);
  const C = carrier(st); C.x = 100.2;
  S.forceWhistle(st, { k: "down", x: 100.2, y: 26, g: C.g });
  assert.deepEqual(st.score, [2, 0], "a two-point try is two");
  ok("two-point try");
}
{
  // field goal 3, a perfect kick through, a shank wide
  const st = fresh();
  S.setUp(st, { poss: 0, x: 75, down: 4, togo: 6 }); S.forceCalls(st, 13, 34);
  st.kick.pow = 1; st.kick.e = 0;
  for (let i = 0; i < 600 && st.phase !== "dead"; i++) S.step(st, 0);
  assert.equal(st.res?.k, "fg"); assert.equal(st.res.good, true, "a perfect 42-yarder is good");
  for (let i = 0; i < 100 && st.phase === "dead"; i++) S.step(st, 0);
  assert.deepEqual(st.score, [3, 0], "a field goal is three");
  S.setUp(st, { poss: 0, x: 75, down: 4, togo: 6 }); S.forceCalls(st, 13, 34);
  st.kick.pow = 1; st.kick.e = 2.5;
  for (let i = 0; i < 600 && st.phase !== "dead"; i++) S.step(st, 0);
  assert.equal(st.res.good, false, "a shank is wide");
  for (let i = 0; i < 100 && st.phase === "dead"; i++) S.step(st, 0);
  assert.equal(st.poss, 1); assert.equal(Math.round(st.los), 68, "a miss: the ball at the spot of the kick");
  S.setUp(st, { poss: 0, x: 60, down: 4, togo: 6 }); S.forceCalls(st, 13, 34);
  st.kick.pow = 0.4; st.kick.e = 0;
  for (let i = 0; i < 600 && st.phase !== "dead"; i++) S.step(st, 0);
  assert.equal(st.res.good, false, "a weak kick from 57 falls short");
  ok("field goals");
}
{
  // safety: 2 to the defence, then the free kick from the 20
  const st = fresh();
  S.setUp(st, { poss: 0, x: 3, down: 1, togo: 10 }); S.forceCalls(st, 1, 34);
  const C = carrier(st); C.x = -1;
  S.forceWhistle(st, { k: "down", x: -1, y: 26, g: C.g });
  assert.deepEqual(st.score, [0, 2], "a safety is two");
  assert.equal(st.play.kind, "ko"); assert.equal(st.kick.by, 0); assert.equal(st.play.from, 20, "the free kick from the 20");
  ok("safety");
}
{
  // touchbacks
  const st = fresh();
  for (let i = 0; i < 400 && st.phase !== "live"; i++) S.step(st, 0);
  const recv = 1 - st.kick.by;
  S.forceWhistle(st, { k: "touchback", team: recv });
  assert.equal(st.poss, recv); assert.equal(Math.round(S.toGoal(recv, st.los)), 75, "kickoff touchback at the 25");
  S.setUp(st, { poss: 0, x: 40, down: 4, togo: 8 }); S.forceCalls(st, 12, 34);
  S.forceWhistle(st, { k: "touchback", team: 1 });
  assert.equal(st.poss, 1); assert.equal(Math.round(S.toGoal(1, st.los)), 80, "punt touchback at the 20");
  ok("touchbacks");
}
{
  // holding: 10 back, replay the down; pass interference: the spot and a first down
  const st = fresh();
  S.setUp(st, { poss: 0, x: 40, down: 2, togo: 6 }); S.forceCalls(st, 5, 34);
  st.flags.push({ k: "hold", team: 0, g: st.off[0][OS.LG], yards: 10 });
  S.forceWhistle(st, { k: "down", x: 43, y: 26, g: carrier(st).g });
  assert.equal(Math.round(st.los), 30); assert.equal(st.down, 2); assert.equal(Math.round(st.togo), 16, "holding: 2nd & 16");
  S.setUp(st, { poss: 0, x: 40, down: 3, togo: 9 }); S.forceCalls(st, 7, 34);
  st.flags.push({ k: "pi", team: 1, g: st.def[1][7], spotX: 62, spotY: 20, yards: 0 });
  S.forceWhistle(st, { k: "inc" });
  assert.equal(Math.round(st.los), 62); assert.equal(st.down, 1, "interference: first down at the spot");
  S.setUp(st, { poss: 0, x: 40, down: 1, togo: 10 }); S.forceCalls(st, 5, 34);
  st.flags.push({ k: "hold", team: 0, g: st.off[0][OS.LG], yards: 10 });
  S.forceWhistle(st, { k: "down", x: 28, y: 26, g: carrier(st).g });
  assert.equal(Math.round(st.los), 28, "a loss worse than the flag: declined");
  assert.equal(st.down, 2);
  ok("penalties");
}
{
  // a decided game ends with the 4th quarter; a CPU game always finishes
  const st = S.newGame(21, { auto: true, qlen: 2, home: STARS, away: CELEBS });
  let f = 0; while (st.phase !== "over" && f < 400000) { S.step(st, 0); f++; }
  assert.equal(st.phase, "over"); assert.ok(st.q >= 4);
  if (st.q === 4) assert.notEqual(st.score[0], st.score[1]);
  ok("a game ends");
}

// ---- determinism and the record ---------------------------------------------------------------------
// A bot on the human's side: calls plays by code, snaps, throws to the button of the most open man,
// runs straight ahead, kicks with the meter, idles on defence.
function bot() {
  let code = 0, lastCall = -1;
  return (st) => {
    if (st.phase === "call" && st.need === 0) {
      if (st.frame - lastCall < 20) return 0;
      lastCall = st.frame;
      const off = st.poss === 0;
      code = st.tryChoice ? (st.playNo % 3 === 0 ? CODE.TWO : CODE.PAT) : off ? [5, 6, 1, 2, 7, CODE.COACH][st.playNo % 6] : [34, 33, 35, 36, CODE.COACH][st.playNo % 5];
      if (off && st.down === 4 && !st.tryChoice) code = S.toGoal(0, st.los) < 35 ? 13 : 12;
      return code << S.CALL_SHIFT;
    }
    const k = st.kick;
    if (k && k.by === 0 && !k.done) {
      if (k.stage === 0) return st.pt > 20 && st.pt % 2 === 0 ? BTN.A : 0;
      if (k.stage === 1) return k.f === 40 ? BTN.A : 0;
      if (k.stage === 2) return k.pow - k.f / 40 < 0.02 ? BTN.A : 0;
      return 0;
    }
    if (st.phase === "pre" && st.poss === 0) return st.pt > 30 && st.pt % 2 === 0 ? BTN.A : 0;
    if (st.phase !== "live") return 0;
    const P = st.p[st.ctl];
    if (!P) return 0;
    if (st.ball.st === "held" && st.ball.own === P.g && P.role.k === "qb" && st.play.kind === "pass") {
      if (st.pt < 70) return 0;
      const pick = S.ICONS[(st.playNo + Math.floor(st.pt / 30)) % S.ICONS.length];
      return st.pt % 8 < 4 ? pick[2] : 0;
    }
    if (st.ball.st === "held" && st.ball.own === P.g) return BTN.UP | (st.pt % 40 === 10 ? BTN.RSL : 0) | BTN.SPRINT;
    return 0;
  };
}
const humanCfg = (qlen = 2) => ({ qlen, home: R.FALLBACK.teams.hq, away: R.FALLBACK.teams.works, coach: [0.5, 0.5] });
function playBot(seed, cfg) {
  const st = S.newGame(seed, cfg), b = bot(), log = [];
  for (let f = 0; st.phase !== "over" && f < 500000; f++) { const m = b(st); log.push(m); S.step(st, m); }
  return { st, log };
}
{
  const cfg = humanCfg(2);
  const { st, log } = playBot(1234, cfg);
  assert.equal(st.phase, "over", "the bot's game finishes");
  assert.ok(st.stat[0].plays > 10, "the bot ran plays");
  assert.ok(st.stat[0].pa > 0, "the bot threw");
  const rle = S.rleEncode(log);
  assert.deepEqual(S.rleDecode(rle), log, "the RLE log round-trips");
  const rec = { version: S.VERSION, seed: 1234, cfg, inputLog: rle, result: S.resultOf(st) };
  assert.deepEqual(S.replay(rec), rec.result, "the record replays to the same result");
  assert.deepEqual(S.replay(JSON.parse(JSON.stringify(rec))), rec.result, "and again, through JSON");
  const other = playBot(4321, cfg);
  assert.notDeepEqual(S.resultOf(other.st), rec.result, "another seed plays another game");
  // doctor the log: a different call on the first down, a held button later
  const bad = rle.slice(), at = bad.findIndex((v, i) => i % 2 === 0 && v >>> S.CALL_SHIFT);
  assert.ok(at >= 0, "the log holds play calls");
  bad[at] = (bad[at] & 0xffff) | (((bad[at] >>> S.CALL_SHIFT) === 1 ? 7 : 1) << S.CALL_SHIFT);
  assert.notDeepEqual(S.replay({ ...rec, inputLog: bad }), rec.result, "a doctored log does not reproduce the result");
  assert.throws(() => S.replay({ ...rec, version: S.VERSION + 1 }), /version/, "another version is refused");
  ok("determinism");
}

// ---- strength and calibration ------------------------------------------------------------------------
function cpuGame(seed, home, away, qlen = 3) {
  const st = S.newGame(seed, { auto: true, qlen, home, away });
  for (let f = 0; st.phase !== "over" && f < 500000; f++) S.step(st, 0);
  assert.equal(st.phase, "over");
  return st;
}
{
  let w = 0;
  const N = 10;
  for (let g = 0; g < N; g++) { const swap = g % 2 === 1, st = cpuGame(700 + g, swap ? mk("lo", 62) : mk("hi", 74), swap ? mk("hi", 74) : mk("lo", 62), 2); const hi = swap ? 1 : 0; if (st.score[hi] > st.score[1 - hi]) w++; }
  assert.ok(w >= 7, `the stronger eleven won ${w} of ${N}`);
  ok("strength");
}
{
  const T = { plays: 0, yds: 0, pa: 0, pc: 0, sacks: 0, ints: 0, ra: 0, ry: 0 };
  const ids = R.TEAM_IDS, G = 24;
  for (let g = 0; g < G; g++) {
    const h = ids[g % 10], a = ids[(g + 3) % 10];
    const st = cpuGame(2000 + g, R.FALLBACK.teams[h], R.FALLBACK.teams[a]);
    for (const s of st.stat) for (const k of Object.keys(T)) T[k] += s[k];
  }
  const ypp = T.yds / T.plays, comp = (100 * T.pc) / T.pa, sacks = T.sacks / G, ints = (100 * T.ints) / T.pa, ypc = T.ry / T.ra;
  const line = `yards/play ${ypp.toFixed(2)}, completions ${comp.toFixed(1)}%, sacks ${sacks.toFixed(2)} a game, interceptions ${ints.toFixed(1)}% of throws, ${ypc.toFixed(2)} a carry`;
  if (process.env.VERBOSE) console.log(line);
  assert.ok(ypp >= 5 && ypp <= 6.5, `yards a play: ${line}`);
  assert.ok(comp >= 58 && comp <= 70, `completion rate: ${line}`);
  assert.ok(sacks >= 0.8 && sacks <= 6, `sacks: ${line}`);
  assert.ok(ints >= 0.8 && ints <= 4.5, `interceptions: ${line}`);
  assert.ok(ypc >= 2, `rushing: ${line}`);
  ok("calibration");
}

// ---- roster -------------------------------------------------------------------------------------------
{
  const L = await import("../src/city/leagues.js");
  const SIM = await import("../src/city/sim.js");
  for (const id of R.TEAM_IDS) assert.equal(R.teamName(id), L.sportTeamName(id, "football"), `team name ${id}`);
  assert.equal(R.CITY_EPOCH, SIM.CITY_EPOCH); assert.equal(R.CLOCK_SCALE, SIM.DEFAULT_SCALE);
  const now = Date.UTC(2026, 9, 5, 12);
  assert.equal(R.machineDay(now), SIM.machineClock(now).day, "the machine day matches the city's clock");
  for (const id of R.TEAM_IDS) { const t = R.FALLBACK.teams[id]; assert.equal(t.length, 11); assert.equal(new Set(t.map(r => r[0])).size, 11); }
  const [h, a] = R.playNowPair(R.FALLBACK);
  assert.equal(h, "hq"); assert.notEqual(h, a);
  const lg = JSON.parse(JSON.stringify(R.FALLBACK));
  lg.teams.arena[10] = ["citizen-ab12", "SUBJECT AB12", 60];
  assert.equal(R.teamOfCase(lg, "HVI-XYZAB12"), "arena");
  assert.equal(R.playNowPair(lg, "arena")[0], "arena", "PLAY NOW puts a rostered viewer on their team");
  const lu = S.lineup(R.FALLBACK.teams.archive);
  assert.equal(R.FALLBACK.teams.archive[lu.os[OS.QB]][0], "tom-brady", "the named quarterback plays quarterback");
  const lw = S.lineup(R.FALLBACK.teams.works);
  assert.equal(R.FALLBACK.teams.works[lw.os[OS.RB]][0], "walter-payton");
  ok("roster");
}

// ---- calls -------------------------------------------------------------------------------------------
{
  for (const line of K.ALL_LINES) {
    assert.ok(!/["“”]/.test(line), `a line quotes: ${line}`);
    assert.ok(!/\b(SAYS|SAID|TELLS|ASKS|SHOUTS)\b/.test(line), `a line has someone speak: ${line}`);
  }
  const line = K.callFor({ k: "td", g: 0, team: 0 }, ["TOM BRADY"], ["A", "B"], 0);
  assert.ok(line.includes("TOM BRADY"));
  ok("calls");
}
console.log(`check-football: ${n} checks passed`);
