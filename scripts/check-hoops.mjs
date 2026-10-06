// THE COURTS, playable (src/play/hoops/): the game sim (v2, the 2K-style game), the rosters and the
// calls, headless.
//   purity       sim.js uses no clock, no Math.random, no trig
//   rules        two inside the arc, three outside it and in the corners past 6.71 m; a forced make
//                adds 2 or 3; the shot clock and stepping out turn the ball over; FIRST TO 21 ends at
//                21; four quarters end untied
//   calibration  CPU v CPU over many games of NBA-like fives: team FG%, 3P%, rim% and FT% inside
//                realistic bands; an open GREEN three by a good shooter goes in 75%+; a heavily
//                contested LATE release 20% or less; a contested dunk is not automatic (blocked,
//                stripped, fouled or missed), an open one nearly is
//   fouls        a shooting foul sends the shooter to the line (two, three, or one after a make); a
//                reach in the bonus shoots two, out of it is a side-out with 14 on the shot clock;
//                a charge on a set defender turns it over; the sixth (scaled) foul brings a stand-in;
//                team fouls reset each quarter
//   free throws  the meter: a release at the top is GREEN and mostly goes in; ten seconds without a
//                shot is a violation; a make on the last gives the ball away, a miss is live
//   moves        a quick reversal of the stick is a crossover (sideways) or a hesitation (along);
//                the right stick: sideways crossover, back stepback, toward drive, round spin; a
//                good handler breaks a poor defender's ankles some of the time
//   determinism  a bot's game replays from {version, seed, cfg, inputLog} to the same result, twice;
//                a different seed differs; a doctored log does not reproduce; every v1 record in
//                scripts/fixtures/hoops-v1-records.json replays on the frozen v1 sim (replay.js)
//   strength     a stronger five beats a weaker one over N CPU games; dunks only by dunk-capable men
//   roster       team names equal the league's, the copied clock equals the city's, and so on
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
// A bot on the human's side: drives at the rim, holds X to the top of the jump, passes now and then,
// shoots its free throws at the top of the meter; on defence chases the ball and reaches.
function bot(mem) {
  return (st) => {
    const P = st.p[st.ctl], b = st.ball;
    if (st.phase === "tip") return st.t >= S.TIP_JUMP - 1 && st.t <= S.TIP_JUMP + 1 ? BTN.Y : 0;
    if (st.phase === "ft") { if (!st.ft || st.ft.g !== P.g || st.ft.t < 31) return 0; if (P.act?.kind === "ftshot") return P.act.f < S.FT_TOP - 1 ? BTN.X : 0; return BTN.X; }
    if (st.phase !== "live") return 0;
    let m = 0;
    if (b.st === "held" && b.own === P.g) {
      if (P.act?.kind === "jump") return P.act.f < S.TOP - 1 ? BTN.X : 0;
      if (P.act) return 0;
      const dx = C.rimX - P.x, dy = C.cy - P.y, r = Math.sqrt(dx * dx + dy * dy);
      if (r < 6.5 || st.shot < 200) return mem.lastA === st.frame - 1 ? 0 : (mem.lastA = st.frame, BTN.X);
      if (++mem.t % 97 === 50) return BTN.A;
      if (mem.t % 151 === 70) return BTN.RSU;
      m |= dx > 0.3 ? BTN.RIGHT : dx < -0.3 ? BTN.LEFT : 0;
      m |= dy > 0.5 ? BTN.UP : dy < -0.5 ? BTN.DOWN : 0;
      return m;
    }
    const dx = b.x - P.x, dy = b.y - P.y;
    m |= dx > 0.3 ? BTN.RIGHT : dx < -0.3 ? BTN.LEFT : 0;
    m |= dy > 0.3 ? BTN.UP : dy < -0.3 ? BTN.DOWN : 0;
    if (dx * dx + dy * dy < 1.4 && st.frame % 40 === 0) m |= BTN.X;
    if (b.st === "loose" && b.z > 2 && dx * dx + dy * dy < 1 && st.frame % 30 === 0) m |= BTN.Y;
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

// ---- v1 records still replay on the frozen v1 sim ----------------------------------------------------
{
  const RP = await import("../src/play/hoops/replay.js");
  const FIX = JSON.parse(readFileSync(new URL("./fixtures/hoops-v1-records.json", import.meta.url), "utf8"));
  assert.ok(FIX.records.length >= 3, "the v1 fixture games are on file");
  for (const rec of FIX.records) assert.deepEqual(RP.replayRecord(rec), rec.result, `v1 record seed ${rec.seed} replays on v1`);
  assert.equal(RP.simOf(1).VERSION, 1); assert.equal(RP.simOf(2).VERSION, S.VERSION);
  assert.ok(S.VERSION >= 2, "the live sim is v2 or later");
  ok("v1 replay");
}

// ---- calibration -------------------------------------------------------------------------------------
const NBA = (p, base) => [[p + "g", "G", base + 6, "guard"], [p + "w", "W", base + 3, "wing"], [p + "s", "S", base, "slasher"], [p + "w2", "W2", base - 2, "wing"], [p + "b", "B", base + 2, "big"]];
{
  const t = { fga: 0, fgm: 0, tpa: 0, tpm: 0, rima: 0, rimm: 0, fta: 0, ftm: 0, fouls: 0, games: 0 };
  for (let s = 0; s < 120; s++) {
    const st = S.newGame(5000 + s, { auto: true, home: NBA("a" + s, 74 + (s % 5)), away: NBA("b" + s, 74 + ((s * 3) % 5)) });
    run(st);
    for (const k of ["fga", "fgm", "tpa", "tpm", "rima", "rimm", "fta", "ftm", "fouls"]) t[k] += st[k][0] + st[k][1];
    t.games++;
  }
  const fg = t.fgm / t.fga, tp = t.tpm / t.tpa, rim = t.rimm / t.rima, ft = t.ftm / t.fta;
  const line = `FG ${(fg * 100).toFixed(1)}% 3P ${(tp * 100).toFixed(1)}% RIM ${(rim * 100).toFixed(1)}% FT ${(ft * 100).toFixed(1)}% fouls/team ${(t.fouls / t.games / 2).toFixed(1)} 3PA share ${(100 * t.tpa / t.fga).toFixed(0)}%`;
  if (process.env.VERBOSE) console.log(line);
  assert.ok(fg >= 0.44 && fg <= 0.495, `team FG% in the NBA band: ${line}`);
  assert.ok(tp >= 0.33 && tp <= 0.395, `3P% in the band: ${line}`);
  assert.ok(rim >= 0.58 && rim <= 0.72, `rim% in the band: ${line}`);
  assert.ok(ft >= 0.70 && ft <= 0.84, `FT% in the band: ${line}`);
  assert.ok(t.tpa / t.fga > 0.25, `threes are a real share of the shots: ${line}`);
  assert.ok(t.fouls / t.games / 2 > 1.5 && t.fouls / t.games / 2 < 8, `fouls are called at a sane rate: ${line}`);
  ok(`calibration ${line}`);
}
// A human shooter (cfg not auto) at a spot: release f frames after the gather; defenders cleared,
// or one placed in his face. -> make rate over n seeds.
function shooting({ x, y, rel, defender = null, n = 300, home = STARS, away = CELEBS }) {
  let made = 0, words = new Set(), grades = new Set();
  for (let s = 0; s < n; s++) {
    const st = S.newGame(20000 + s, { home, away });
    S.setUp(st, 0, x, y); clearDefence(st);
    if (defender) { const D = st.p[5]; D.x = x + defender[0]; D.y = y + defender[1]; D.hands = 60; }
    let f = 0, sc = st.score[0];
    S.step(st, BTN.X);
    while (st.p[0].act?.kind === "jump" && f < 60) { f++; S.step(st, st.p[0].act.f < rel ? BTN.X : 0); }
    if (st.lastRel) { words.add(st.lastRel.word); grades.add(st.lastRel.grade); }
    until(st, x2 => x2.ball.st !== "shot", 0, 200);
    if (st.score[0] > sc) made++;
  }
  return { rate: made / n, words, grades };
}
{
  const open = shooting({ x: C.rimX - 7.6, y: C.cy, rel: S.TOP });   // STAR ONE, 90, from the top of the key
  assert.ok(open.grades.has("GREEN") && open.words.has("WIDE OPEN"), `the release reads GREEN, WIDE OPEN (${[...open.grades]} ${[...open.words]})`);
  assert.ok(open.rate >= 0.75 && open.rate <= 0.95, `an open GREEN three by a good shooter goes in ${(open.rate * 100).toFixed(0)}% (75-95)`);
  const mid = shooting({ x: C.rimX - 5, y: C.cy + 1, rel: S.TOP });
  assert.ok(mid.rate >= 0.75, `an open GREEN mid-range ${(mid.rate * 100).toFixed(0)}%`);
  const bad = shooting({ x: C.rimX - 5, y: C.cy, rel: S.TOP + 12, defender: [0.6, 0], away: STARS });
  assert.ok([...bad.words].every(w => /HEAVILY|SMOTHERED/.test(w)), `the contest reads HEAVILY CONTESTED (${[...bad.words]})`);
  assert.ok([...bad.grades].every(g => /LATE/.test(g)), `the late release reads LATE (${[...bad.grades]})`);
  assert.ok(bad.rate <= 0.2, `a heavily contested late release ${(bad.rate * 100).toFixed(0)}% (20 or less)`);
  const early = shooting({ x: C.rimX - 7.6, y: C.cy, rel: S.TOP - 10 });
  assert.ok(early.rate < open.rate - 0.25, `an open EARLY three ${(early.rate * 100).toFixed(0)}% is well under a green one`);
  if (process.env.VERBOSE) console.log("open green 3", open.rate, "mid", mid.rate, "contested late", bad.rate, "open early", early.rate);
  // the probability itself: a better shooter, a closer defender, a worse release all cost
  const P = S.newGame(1, { home: STARS, away: CELEBS }).p[0];
  const pr = (o) => S.shotProb({ cfg: { assist: false, auto: false } }, P, { kind: "jump", r: 7.5, three: true, grade: "GREEN", c: 0, ...o });
  assert.ok(pr({}) > pr({ c: 0.5 }) && pr({ c: 0.5 }) > pr({ c: 0.9 }), "contest costs");
  assert.ok(pr({}) > pr({ grade: "SLIGHTLY LATE" }) && pr({ grade: "SLIGHTLY LATE" }) > pr({ grade: "LATE" }) && pr({ grade: "LATE" }) > pr({ grade: "VERY LATE" }), "timing costs");
  assert.ok(pr({ r: 7.5 }) > pr({ r: 9.5 }), "distance costs");
  assert.equal(S.gradeOf(0, 3), "GREEN"); assert.equal(S.gradeOf(-5, 3), "SLIGHTLY EARLY"); assert.equal(S.gradeOf(9, 3), "LATE"); assert.equal(S.gradeOf(20, 3), "VERY LATE");
  ok("shooting");
}
// Dunks: a dunker with a lane nearly always; a rim protector in the air makes it a contest.
function dunking(protector, n = 300) {
  let made = 0, ev = {};
  for (let s = 0; s < n; s++) {
    const st = S.newGame(30000 + s, { home: STARS, away: STARS });
    S.setUp(st, 0, C.rimX - 2.2, C.cy + 0.3); clearDefence(st);
    if (protector) { const D = st.p[5]; D.x = C.rimX - 0.9; D.y = C.cy + 0.2; }
    const sc = st.score[0];
    let f = 0;
    for (; f < 120; f++) {
      S.step(st, f === 0 ? BTN.X | BTN.RT : 0);
      if (protector && f === 6) { const D = st.p[5]; D.vz = 4; D.z = 0.01; D.act = { kind: "hop", f: 0 }; }
      for (const e of st.ev) ev[e] = (ev[e] || 0) + 1;
      if (st.ball.st !== "held" && st.ball.st !== "shot" && f > 20) break;
    }
    if (st.score[0] > sc) made++;
  }
  return { rate: made / n, ev };
}
{
  const open = dunking(false), cont = dunking(true);
  assert.ok(open.ev.slam > 250, "the dunker dunks");
  assert.ok(open.rate >= 0.9, `an open dunk ${(open.rate * 100).toFixed(0)}%`);
  assert.ok(cont.rate < 0.8 && cont.rate > 0.3, `a contested dunk is not automatic: ${(cont.rate * 100).toFixed(0)}%`);
  assert.ok((cont.ev.block || 0) > 0 && (cont.ev.shootfoul || 0) > 0, `contested dunks get blocked and fouled (${JSON.stringify(cont.ev)})`);
  // no lane, no dunk: a man planted between him and the rim turns it into a layup unless he goes hard
  const st = S.newGame(3, { home: STARS, away: STARS });
  S.setUp(st, 0, C.rimX - 2.4, C.cy); clearDefence(st);
  st.p[5].x = C.rimX - 1.3; st.p[5].y = C.cy;
  S.step(st, BTN.X);
  assert.equal(st.p[0].act?.kind, "jump", "no lane: a layup, not a dunk");
  const weak = S.newGame(3, { home: CELEBS, away: STARS }); S.setUp(weak, 0, C.rimX - 2, C.cy); clearDefence(weak); S.step(weak, BTN.X | BTN.RT);
  assert.equal(weak.p[0].act?.kind, "jump", "a man who cannot dunk lays it up");
  if (process.env.VERBOSE) console.log("dunk open", open.rate, "contested", cont.rate, cont.ev);
  ok("dunks");
}

// ---- fouls and free throws --------------------------------------------------------------------------------
{
  // a shooting foul: a jumping defender in the shooter's face, over seeds; the line follows
  let seen = 0, andone = 0;
  for (let s = 0; s < 400 && seen < 6; s++) {
    const st = S.newGame(40000 + s, { home: STARS, away: CELEBS });
    S.setUp(st, 0, C.rimX - 4.5, C.cy); clearDefence(st);
    const D = st.p[5]; D.x = C.rimX - 3.8; D.y = C.cy;
    S.step(st, BTN.X); D.vz = 4; D.z = 0.01; D.act = { kind: "hop", f: 0 };
    let ev = [];
    for (let f = 0; f < 400; f++) { S.step(st, st.p[0].act?.kind === "jump" && st.p[0].act.f < S.TOP ? BTN.X : 0); ev = ev.concat(st.ev); if (st.phase === "ft") break; }
    if (!ev.includes("shootfoul")) continue;
    seen++;
    assert.equal(st.phase, "ft", "a shooting foul sends him to the line");
    assert.equal(st.ft.g, 0);
    assert.equal(st.ft.n, ev.includes("andone") ? 1 : 2, "one after a make, two after a miss inside the arc");
    if (ev.includes("andone")) andone++;
    assert.equal(st.p[5].pf, 1, "the foul is on the defender");
    assert.equal(st.tf[1], 1, "and on his team");
  }
  assert.ok(seen >= 3, `shooting fouls happen (${seen})`);
  ok(`shooting fouls (${seen}, ${andone} and-ones)`);
}
// a reach: the human's defender pressing X at the dribbler; in the bonus it shoots two, else a side-out
function reachFoul(bonus) {
  for (let s = 0; s < 600; s++) {
    const st = S.newGame(50000 + s, { home: CELEBS, away: STARS });
    S.setUp(st, 5, -4, C.cy, { shot: 5 * 60 });
    for (const Q of st.p) if (Q.g !== 5) { Q.x = -12 + Q.i * 0.8 + (Q.t ? 6 : 0); Q.y = 2 + Q.i * 2; }
    st.ctl = 0; st.ctlFor = 5; const P = st.p[0]; P.x = -4.6; P.y = C.cy; P.cool = 0;
    if (bonus) st.tf[0] = S.FORMATS.quarters.bonus;
    let ev = [];
    for (let f = 0; f < 3; f++) { S.step(st, f === 1 ? BTN.X : 0); ev = ev.concat(st.ev); }
    if (!ev.includes("reachfoul")) continue;
    return st;
  }
  return null;
}
{
  const a = reachFoul(false);
  assert.ok(a, "a reach-in is called");
  assert.equal(a.phase, "dead"); assert.equal(a.after, "inbound"); assert.equal(a.afterTeam, 1, "out of the bonus: a side-out to the fouled team");
  assert.ok(a.shot >= 14 * 60, "with 14 on the shot clock at least");
  const b = reachFoul(true);
  assert.ok(b && b.after === "ft" && b.ft.n === 2, "in the bonus: two shots");
  ok("reach fouls and the bonus");
}
{
  // a charge: the human sprinting into a defender who has been set a while, outside the restricted arc
  let charge = 0, blockf = 0;
  for (let s = 0; s < 200; s++) {
    const st = S.newGame(60000 + s, { home: STARS, away: CELEBS });
    S.setUp(st, 0, C.rimX - 7, C.cy); clearDefence(st);
    const D = st.p[5]; D.x = C.rimX - 5.2; D.y = C.cy; D.still = 30; D.charge = 30;
    let ev = [];
    for (let f = 0; f < 50; f++) { S.step(st, BTN.RIGHT | BTN.RT); D.x = C.rimX - 5.2; D.y = C.cy; ev = ev.concat(st.ev); if (st.phase !== "live") break; }
    if (ev.includes("charge")) { charge++; assert.equal(st.afterTeam, 1, "a charge turns it over"); assert.equal(st.tf[0], 0, "and is not a team foul"); assert.equal(st.p[0].pf, 1); }
    if (ev.includes("blockfoul")) blockf++;
  }
  assert.ok(charge > 20, `a set defender draws charges (${charge}/200)`);
  ok(`charges ${charge}/200`);
}
{
  // fouling out: three (scaled from six over 48 minutes) and a stand-in comes on
  const st = S.newGame(7, { home: STARS, away: CELEBS });
  assert.equal(S.FORMATS.quarters.foulOut, 3);
  S.setUp(st, 0, C.rimX - 5, C.cy); clearDefence(st);
  const D = st.p[5]; D.pf = 2;
  st.tf[1] = 0;
  // force a shooting foul through the public path: forced free throws after a foul are the same machinery
  let out = false;
  for (let s = 0; s < 400 && !out; s++) {
    const g = S.newGame(70000 + s, { home: STARS, away: CELEBS });
    S.setUp(g, 0, C.rimX - 4.5, C.cy); clearDefence(g);
    const Q = g.p[5]; Q.x = C.rimX - 3.8; Q.y = C.cy; Q.pf = 2;
    S.step(g, BTN.X); Q.vz = 4; Q.z = 0.01; Q.act = { kind: "hop", f: 0 };
    let ev = [];
    for (let f = 0; f < 400; f++) { S.step(g, g.p[0].act?.kind === "jump" && g.p[0].act.f < S.TOP ? BTN.X : 0); ev = ev.concat(g.ev); if (g.phase === "ft") break; }
    if (ev.includes("foulout")) { out = true; assert.ok(ev.includes("standin") || g.p[5].key.startsWith("stand-in"), "a stand-in takes his place"); assert.equal(g.p[5].name, "A STAND-IN"); }
  }
  assert.ok(out, "a third foul fouls him out");
  ok("foul out");
}
{
  // free throws: the human at the line; release at the top of the meter
  let made = 0, n = 0, greens = 0;
  for (let s = 0; s < 150; s++) {
    const st = S.newGame(80000 + s, { home: STARS, away: CELEBS });
    S.setUp(st, 0, 0, C.cy); clearDefence(st);
    S.forceFreeThrows(st, 0, 2);
    const b = bot({ t: 0, lastA: -9 });
    let ev = [];
    for (let f = 0; f < 900 && ev.filter(e => e === "ftmade" || e === "ftmiss").length < 2; f++) { S.step(st, b(st)); ev = ev.concat(st.ev); if (st.ev.includes("ftshot") && st.lastRel.grade === "GREEN") greens++; }
    assert.ok(ev.includes("ftset") && ev.filter(e => e === "ftshot").length === 2, "two shots at the line");
    made += ev.filter(e => e === "ftmade").length; n += 2;
    const lastMade = ev.lastIndexOf("ftmade") > ev.lastIndexOf("ftmiss");
    if (lastMade) assert.ok(st.phase === "dead" && st.afterTeam === 1, "a make on the last: the other side inbounds");
    else assert.ok(st.phase === "live" && (st.ball.st === "loose" || st.ball.st === "held"), "a miss on the last is live");
  }
  assert.ok(greens / n > 0.95, "the bot's release at the top reads GREEN");
  assert.ok(made / n >= 0.85, `green free throws go in ${(made / n * 100).toFixed(0)}%`);
  // ten seconds with no shot
  const st = S.newGame(9, { home: STARS, away: CELEBS });
  S.setUp(st, 0, 0, C.cy); clearDefence(st); S.forceFreeThrows(st, 0, 1);
  let ev = [];
  for (let f = 0; f < 800; f++) { S.step(st, 0); ev = ev.concat(st.ev); }
  assert.ok(ev.includes("ftviolation"), "ten seconds at the line is a violation");
  ok(`free throws ${(made / n * 100).toFixed(0)}% green`);
}

// ---- dribble moves --------------------------------------------------------------------------------------------
function moveFrom(seq, { home = STARS, away = CELEBS, defender = true, seed = 11 } = {}) {
  const st = S.newGame(seed, { home, away });
  S.setUp(st, 0, -2, C.cy); clearDefence(st);
  if (defender) { const D = st.p[5]; D.x = -0.9; D.y = C.cy; }
  let ev = [];
  for (const m of seq) { S.step(st, m); ev = ev.concat(st.ev); }
  return { st, ev };
}
{
  const rep = (m, n) => Array(n).fill(m);
  assert.ok(moveFrom([...rep(BTN.UP, 6), ...rep(BTN.DOWN, 4)]).ev.some(e => e === "cross" || e === "btl" || e === "btb"), "up then down quickly: a crossover");
  assert.ok(moveFrom([...rep(BTN.RIGHT, 6), ...rep(BTN.LEFT, 4)]).ev.includes("hesi"), "toward then away quickly: a hesitation");
  assert.ok(!moveFrom([...rep(BTN.UP, 6), ...rep(0, 20), ...rep(BTN.DOWN, 4)]).ev.some(e => ["cross", "btl", "btb"].includes(e)), "a slow change of direction is just a turn");
  assert.ok(moveFrom([...rep(BTN.RSU, 3), ...rep(0, 20)]).ev.includes("cross"), "right stick sideways: crossover");
  assert.ok(moveFrom([...rep(BTN.RSL, 3), ...rep(0, 20)]).ev.includes("stepback"), "right stick back: stepback");
  assert.ok(moveFrom([...rep(BTN.RSR, 3), ...rep(0, 20)]).ev.includes("drive"), "right stick toward the rim: drive");
  assert.ok(moveFrom([BTN.RSU, BTN.RSU, BTN.RSU | BTN.RSR, BTN.RSR, BTN.RSR | BTN.RSD, BTN.RSD, ...rep(0, 24)]).ev.includes("spin"), "right stick round: spin");
  assert.ok(moveFrom([BTN.SPIN, ...rep(0, 24)]).ev.includes("spin"), "the spin key: spin");
  // the stepback then X: a stepback jumper
  const sb = moveFrom([...rep(BTN.RSL, 2), ...rep(0, 7), ...rep(BTN.X, 3)]);
  assert.equal(sb.st.p[0].act?.kind, "jump", "a stepback into the shot");
  // ankles: a great handler against a poor defender, sometimes; never automatic
  let broke = 0, lost = 0;
  for (let s = 0; s < 300; s++) { const r = moveFrom([...rep(BTN.RSU, 3), ...rep(0, 20)], { seed: 90000 + s }); if (r.ev.includes("ankles")) broke++; if (r.ev.includes("lostball")) lost++; }
  assert.ok(broke > 15 && broke < 200, `ankles broken ${broke}/300`);
  // overdoing it, with no handle: the ball goes
  let lost2 = 0;
  for (let s = 0; s < 200; s++) {
    const seq = []; for (let k = 0; k < 8; k++) seq.push(...rep(BTN.RSU, 2), ...rep(0, 20), ...rep(BTN.RSD, 2), ...rep(0, 20));
    const r = moveFrom(seq, { home: CELEBS, away: STARS, seed: 95000 + s }); if (r.ev.includes("lostball")) lost2++;
  }
  assert.ok(lost2 > 10, `a poor handler who keeps going loses it (${lost2}/200)`);
  // sprint drains, rest restores
  const st = S.newGame(5, { home: STARS, away: CELEBS }); S.setUp(st, 0, -12, C.cy); clearDefence(st);
  for (let f = 0; f < 120; f++) S.step(st, BTN.RIGHT | BTN.RT);
  const after = st.p[0].sta;
  assert.ok(after < 0.8, `sprinting tires (${after.toFixed(2)})`);
  for (let f = 0; f < 120; f++) S.step(st, 0);
  assert.ok(st.p[0].sta > after, "standing restores");
  if (process.env.VERBOSE) console.log("ankles", broke, "lost (good handler)", lost, "lost (poor handler)", lost2);
  ok(`moves (ankles ${broke}/300)`);
}

// ---- strength -------------------------------------------------------------------------------------------
{
  let wins = 0, dunks = 0, dunkers = true;
  const N = 12;
  for (let s = 1; s <= N; s++) {
    const st = S.newGame(1000 + s, { home: s % 2 ? STARS : CELEBS, away: s % 2 ? CELEBS : STARS, auto: true });
    run(st, (x) => { if (x.note?.k === "dunk" && x.note.frame === x.frame) { dunks++; if (!x.p[x.note.g].dunker) dunkers = false; } return 0; });
    const r = S.resultOf(st);
    if ((s % 2 ? 0 : 1) === r.winner) wins++;
  }
  assert.ok(wins >= N - 1, `the stronger five won ${wins} of ${N}`);
  assert.ok(dunks > 0 && dunkers, "dunks happen, and only by dunk-capable players");
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
