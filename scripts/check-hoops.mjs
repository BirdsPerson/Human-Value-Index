// THE COURTS, playable (src/play/hoops/): the game sim, the rosters and the calls, headless.
//   purity       sim.js uses no clock, no Math.random, no trig
//   rules        two inside the arc, three outside it and in the corners past 6.71 m; a forced make
//                adds 2 or 3 to the shooter's side; the shot clock running out turns the ball over;
//                stepping out with the ball turns it over; FIRST TO 21 ends at 21; four quarters end
//                untied (overtime when level); dunks only by players rated 75+
//   determinism  a game played by a bot on the human's side (recorded frame by frame) replays from
//                {version, seed, cfg, inputLog} to the same result, twice; a different seed plays
//                differently; the RLE log round-trips; a doctored log does not reproduce the result;
//                a record of another version is refused
//   strength     a stronger five beats a weaker one over N CPU games
//   roster       the team names equal the league's (city/leagues.js), the copied clock equals
//                city/sim.js, the fallback rosters are fives of distinct players, PLAY NOW pairs two
//                different teams, a citizen entrant is found on their team
//   calls        no line quotes anyone or has anyone speak
// Run: node scripts/check-hoops.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const S = await import("../src/play/hoops/sim.js");
const R = await import("../src/play/hoops/roster.js");
const K = await import("../src/play/hoops/calls.js");
const { BTN, COURT: C } = S;
let n = 0;
const ok = (msg) => { n++; if (process.env.VERBOSE) console.log("ok", msg); };

// ---- purity ------------------------------------------------------------------------------------------
{
  const src = readFileSync(new URL("../src/play/hoops/sim.js", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  for (const bad of ["Math.random", "Date.now", "performance", "Math.sin", "Math.cos", "Math.tan", "Math.atan", "Math.hypot", "Math.pow", "Math.exp", "Math.log", "document", "window"]) assert.ok(!src.includes(bad), `sim.js uses ${bad}`);
  ok("purity");
}

const STARS = [["s1", "STAR ONE", 90], ["s2", "STAR TWO", 87], ["s3", "STAR THREE", 85], ["s4", "STAR FOUR", 82], ["s5", "STAR FIVE", 80]];
const CELEBS = [["c1", "CELEB ONE", 56], ["c2", "CELEB TWO", 54], ["c3", "CELEB THREE", 53], ["c4", "CELEB FOUR", 51], ["c5", "CELEB FIVE", 50]];
const run = (st, fn = () => 0, max = 200000) => { const masks = []; for (let f = 0; st.phase !== "over" && f < max; f++) { const m = fn(st); masks.push(m); S.step(st, m); } return masks; };
const until = (st, pred, mask = 0, max = 600) => { for (let f = 0; f < max; f++) { S.step(st, typeof mask === "function" ? mask(st) : mask); if (pred(st)) return true; } return false; };
const clearDefence = (st) => { for (const P of st.p) if (P.t === 1) { P.x = -12 + P.i * 0.8; P.y = 2 + P.i * 2; } };

// ---- rules -------------------------------------------------------------------------------------------
{
  assert.equal(S.isThree(C.rimX - 8, C.cy, 1), true, "8 m out is a three");
  assert.equal(S.isThree(C.rimX - 6, C.cy, 1), false, "6 m out is a two");
  assert.equal(S.isThree(13.5, C.cy + 6.9, 1), true, "the corner past 6.71 m is a three");
  assert.equal(S.isThree(13.5, C.cy - 6.5, 1), false, "the corner inside the line is a two");
  assert.equal(S.isThree(-(C.rimX - 8), C.cy, -1), true, "the other end mirrors");
  assert.equal(S.isThree(C.rimX - 8, C.cy, -1), true, "your own half is a long way out");
  ok("the arc");
}
for (const [x, pts] of [[C.rimX - 8.2, 3], [C.rimX - 4.5, 2]]) {
  const st = S.newGame(7, { home: STARS, away: CELEBS });
  S.setUp(st, 0, x, C.cy); clearDefence(st);
  S.forceShot(st, 0, true);
  assert.ok(until(st, s => s.score[0] > 0, 0, 200), "the forced make goes in");
  assert.deepEqual(st.score, [pts, 0], `a make from ${(C.rimX - x).toFixed(1)} m is ${pts}`);
  assert.equal(st.pts[0], pts);
  // the other side inbounds after the basket
  assert.ok(until(st, s => s.phase === "live" && s.ball.st === "held", 0, 600));
  assert.equal(st.poss, 1, "after a basket the ball goes over");
  ok(`${pts} points`);
}
{
  const st = S.newGame(8, { home: STARS, away: CELEBS });
  S.setUp(st, 0, C.rimX - 6, C.cy); clearDefence(st);
  S.forceShot(st, 0, false);
  assert.ok(until(st, s => s.ball.st === "loose", 0, 200));
  assert.deepEqual(st.score, [0, 0], "a forced miss scores nothing");
  ok("a miss");
}
{
  const st = S.newGame(9, { home: STARS, away: CELEBS });
  S.setUp(st, 0, -6, C.cy, { shot: 4 }); clearDefence(st);
  let ev = [];
  until(st, s => { ev = ev.concat(s.ev); return s.phase === "dead"; }, 0, 30);
  assert.ok(ev.includes("shotclock"), "the shot clock ran out");
  assert.ok(until(st, s => s.phase === "live", 0, 600));
  assert.equal(st.poss, 1, "a shot-clock violation turns it over");
  ok("shot clock");
}
{
  const st = S.newGame(10, { home: STARS, away: CELEBS });
  S.setUp(st, 0, -4, 0.6); clearDefence(st);
  let ev = [];
  until(st, s => { ev = ev.concat(s.ev); return s.phase === "dead"; }, BTN.DOWN, 60);
  assert.ok(ev.includes("oob"), "walking over the sideline with the ball is out");
  assert.ok(until(st, s => s.phase === "live", 0, 600));
  assert.equal(st.poss, 1, "out of bounds turns it over");
  assert.ok(st.p[st.ball.own].y >= 0 && st.p[st.ball.own].y <= C.w, "the inbound is on the floor");
  ok("out of bounds");
}
{
  const st = S.newGame(11, { fmt: "to21", home: STARS, away: CELEBS, auto: true });
  run(st);
  assert.equal(st.phase, "over");
  assert.ok(Math.max(...st.score) >= 21 && Math.max(...st.score) <= 23, "first to 21 ends at 21 (a three may take it to 23)");
  ok("first to 21");
}
{
  const st = S.newGame(12, { home: STARS, away: STARS, auto: true });
  run(st);
  assert.equal(st.phase, "over");
  assert.ok(st.q >= 4 && st.score[0] !== st.score[1], "four quarters, no tie at the end");
  ok("four quarters");
}

// ---- determinism and the record ---------------------------------------------------------------------
// A bot on the human's side: drives at the rim, holds A to the top of the jump, passes now and then;
// on defence chases the ball and reaches.
function bot(mem) {
  return (st) => {
    const P = st.p[st.ctl], b = st.ball;
    if (st.phase === "tip") return st.t >= S.TIP_JUMP - 1 && st.t <= S.TIP_JUMP + 1 ? BTN.A : 0;
    if (st.phase !== "live") return 0;
    let m = 0;
    if (b.st === "held" && b.own === P.g) {
      if (P.act?.kind === "jump") return P.act.f < S.TOP - 1 ? BTN.A : 0;
      if (P.act) return 0;
      const dx = C.rimX - P.x, dy = C.cy - P.y, r = Math.sqrt(dx * dx + dy * dy);
      if (r < 6.5 || st.shot < 200) return mem.lastA === st.frame - 1 ? 0 : (mem.lastA = st.frame, BTN.A);
      if (++mem.t % 97 === 50) return BTN.B;
      m |= dx > 0.3 ? BTN.RIGHT : dx < -0.3 ? BTN.LEFT : 0;
      m |= dy > 0.5 ? BTN.UP : dy < -0.5 ? BTN.DOWN : 0;
      return m;
    }
    const dx = b.x - P.x, dy = b.y - P.y;
    m |= dx > 0.3 ? BTN.RIGHT : dx < -0.3 ? BTN.LEFT : 0;
    m |= dy > 0.3 ? BTN.UP : dy < -0.3 ? BTN.DOWN : 0;
    if (dx * dx + dy * dy < 1.4 && st.frame % 40 === 0) m |= BTN.B;
    if (b.st === "loose" && b.z > 2 && dx * dx + dy * dy < 1 && st.frame % 30 === 0) m |= BTN.A;
    return m;
  };
}
const LG = R.FALLBACK;
const cfgA = { fmt: "quarters", shot: 24, assist: true, home: R.sortFive(LG.teams.hq), away: R.sortFive(LG.teams.works) };
{
  const st = S.newGame(424242, cfgA);
  const masks = run(st, bot({ t: 0, lastA: -9 }));
  assert.equal(st.phase, "over", "the bot's game ends");
  const rec = { version: S.VERSION, seed: 424242, cfg: cfgA, inputLog: S.rleEncode(masks), result: S.resultOf(st) };
  assert.ok(rec.result.score[0] > 0, "the bot scores");
  assert.ok(rec.inputLog.length < masks.length, `the log compresses (${rec.inputLog.length} numbers for ${masks.length} frames)`); if (process.env.VERBOSE) console.log(rec.result, rec.inputLog.length, masks.length);
  assert.deepEqual(S.rleDecode(rec.inputLog), masks, "RLE round-trips");
  const json = JSON.parse(JSON.stringify(rec));
  assert.deepEqual(S.replay(json), rec.result, "the replay reproduces the result");
  assert.deepEqual(S.replay(json), rec.result, "and again");
  // a doctored log: the human's first half replaced with standing still
  const doctored = { ...json, inputLog: S.rleEncode(masks.map((m, i) => (i < masks.length / 2 ? 0 : m))) };
  assert.notDeepEqual(S.replay(doctored), rec.result, "a doctored log does not reproduce the claimed result");
  const other = S.newGame(424243, cfgA);
  run(other, bot({ t: 0, lastA: -9 }));
  assert.notDeepEqual(S.resultOf(other), rec.result, "another seed plays another game");
  assert.throws(() => S.replay({ ...json, version: S.VERSION + 1 }), /version/);
  ok("determinism and replay");
}

// ---- strength -------------------------------------------------------------------------------------------
{
  let wins = 0, dunks = 0, dunkers = true;
  const N = 12;
  for (let s = 1; s <= N; s++) {
    const st = S.newGame(1000 + s, { home: s % 2 ? STARS : CELEBS, away: s % 2 ? CELEBS : STARS, auto: true });
    run(st, (x) => { if (x.note?.k === "dunk" && x.note.frame === x.frame) { dunks++; if (x.p[x.note.g].r < 75) dunkers = false; } return 0; });
    const r = S.resultOf(st);
    if ((s % 2 ? 0 : 1) === r.winner) wins++;
  }
  assert.ok(wins >= N - 1, `the stronger five won ${wins} of ${N}`);
  assert.ok(dunks > 0 && dunkers, "dunks happen, and only by players rated 75+");
  ok(`strength ${wins}/${N}`);
}

// ---- roster -----------------------------------------------------------------------------------------------
{
  const L = await import("../src/city/leagues.js");
  const SIM = await import("../src/city/sim.js");
  assert.deepEqual(R.TEAM_IDS, L.DIST, "the districts are the league's");
  for (const id of R.TEAM_IDS) assert.deepEqual(R.TEAMS[id], L.TEAMS[id], `team ${id} named as the league names it`);
  assert.equal(R.teamName("hq"), L.sportTeamName("hq", "basketball"), "THE DEPARTMENT FIVE");
  assert.equal(R.CITY_EPOCH, SIM.CITY_EPOCH); assert.equal(R.CLOCK_SCALE, SIM.DEFAULT_SCALE);
  const now = Date.UTC(2026, 9, 5, 20, 0, 0);
  assert.equal(R.machineDay(now), SIM.machineClock(now).day, "the machine day matches the city's clock");
  const seen = new Set();
  for (const id of R.TEAM_IDS) {
    const t = R.FALLBACK.teams[id];
    assert.equal(t.length, 5, `${id} fields five`);
    for (const [k, nm, r] of t) { assert.ok(!seen.has(k), `${k} on one team only`); seen.add(k); assert.ok(typeof nm === "string" && r > 0 && r < 100); }
    assert.ok(R.KITS[id] && R.KITS[id].length === 2);
  }
  const [h, a] = R.playNowPair(R.FALLBACK, null);
  assert.ok(h === "hq" && a && a !== h, "PLAY NOW: the Department's five against another");
  const lg = { ...R.FALLBACK, teams: { ...R.FALLBACK.teams, works: [...R.FALLBACK.teams.works.slice(0, 4), ["citizen-ab12", "SUBJECT AB12", 66]] } };
  assert.equal(R.teamOfCase(lg, "HVI-XYZAB12"), "works", "a citizen entrant is found on their team");
  assert.equal(R.playNowPair(lg, "works")[0], "works", "and PLAY NOW picks it");
  assert.equal(R.shownName("Stephen Curry (basketball player)"), "STEPHEN CURRY");
  // the summary's shape, as the plan builder writes it
  const sum = { day: 9, civic: { leagues: { season: 3 }, districts: Object.fromEntries(R.TEAM_IDS.map(id => [id, { teams: { basketball: { roster: R.FALLBACK.teams[id], pos: 1 } } }])) } };
  const got = R.leagueFrom(sum);
  assert.ok(got && got.live && got.season === 3 && got.teams.arts.length === 5);
  assert.equal(R.leagueFrom({ civic: { districts: {} } }), null, "a summary without the league is no league");
  ok("roster");
}

// ---- calls ------------------------------------------------------------------------------------------------
{
  for (const line of K.ALL_LINES) {
    assert.ok(!/["“”]/.test(line), `no quotation in: ${line}`);
    assert.ok(!/\b(SAYS|SAID|SHOUTS|TELLS)\b/.test(line), `nobody speaks in: ${line}`);
  }
  const names = Array.from({ length: 10 }, (_, i) => `P${i}`);
  assert.match(K.callFor({ k: "dunk", g: 3, team: 0 }, names, ["A FIVE", "B FIVE"], 0), /P3/);
  assert.equal(K.callFor({ k: "pass", g: 1, team: 0 }, names, ["A", "B"]), null, "not every event is called");
  ok("calls");
}

console.log(`check-hoops: ${n} checks passed`);
