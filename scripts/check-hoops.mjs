// THE COURTS, playable (src/play/hoops/): the game sim (v4, the 2K20-style game), the rosters and the
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
//                a different seed differs; a doctored log does not reproduce; every v1, v2 and v3
//                record in scripts/fixtures/hoops-v{1,2,3}-records.json replays on its frozen sim
//                (replay.js); a one on one game replays too
//   difficulty   a simulated casual human (noisy release about 100 ms either side of the top, a
//                quarter-second late on defence, loose passes, random dribble moves, no pro stick),
//                steering one man a possession like a person, against an equal side, 100 games a
//                level in each mode (one worker per level and mode): 5v5 wins ROOKIE 65-75%, PRO
//                45-55%, ALL-STAR 30-40%, HALL OF FAME 15-25%, shoots 45-50% on ROOKIE, harder levels
//                shoot worse and turn it over more; 3v3 and 1v1 (the half court) ROOKIE 65-75% and
//                every level harder than the one before; a CPU v CPU game is the same at every level;
//                EASY MODE records read as ROOKIE
//   passing      (v4) a pass to a cutter is thrown where he will be: it reaches him within 0.5 m of
//                its aim while he is still running; a bounce pass hits the floor on the way; a lob
//                arcs a metre and more over a chest pass; a defender in the lane gets hands on some;
//                icon passing (RB + a face button) hits the teammate wearing that button; a double
//                tap of Y throws the alley-oop to the cutter
//   street       (v4) the half court: ones and twos, the check at the top after a basket (the
//                scorer's side again under make-it-take-it), a defensive rebound must be taken back
//                past the arc (a shot before that is a turnover), out at the half line, no free
//                throws, to 11 ends at 11
//   positions    a centre is taller and broader than a point guard; the roster's position holds
//   strength     a stronger five beats a weaker one over N CPU games; dunks only by dunk-capable men
//   roster       team names equal the league's, the copied clock equals the city's, and so on
//   calls        no line quotes anyone or has anyone speak
// Run: node scripts/check-hoops.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const S = await import("../src/play/hoops/sim.js");
const R = await import("../src/play/hoops/roster.js");
const K = await import("../src/play/hoops/calls.js");
const { BTN, COURT: C } = S;

// ---- difficulty: a casual human (Scott, 2026-10-06: "the basketball game is way too hard") ---------------
// Plays the human's man the way a person new to the game does: picks a plan on the catch (drive, a spot
// to shoot from, or look to pass), reads the OPEN tag but not always, lets go of X about 100 ms either
// side of the top (sd 6 frames), flicks the right stick at random now and then, passes toward a
// teammate with his thumb 30 degrees off; on defence chases where the ball was a quarter-second ago,
// reaches now and then, jumps at shots late, and ball-watches with the stick let go.
function casualHuman(seed) {
  const { BTN, COURT: C } = S;
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const g = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.732;
  const LAG = 15;                                                   // 250 ms on defence
  const hist = [];
  let prev = 0, plan = null, rel = 0, tipAt = -1, ftKey = "", ftRel = 0, rs = 0, rsT = 0, watch = 0, jumped = -99;
  const stickTo = (P, tx, ty, slop = 0.35) => { const dx = tx - P.x, dy = ty - P.y; let m = 0; if (dx > slop) m |= BTN.RIGHT; else if (dx < -slop) m |= BTN.LEFT; if (dy > slop) m |= BTN.UP; else if (dy < -slop) m |= BTN.DOWN; return m; };
  const press = (bit) => (prev & bit ? 0 : bit);
  const out = (m) => { prev = m; return m; };
  return (st) => {
    const b = st.ball, P = st.p[st.ctl];
    hist.push({ x: b.x, y: b.y, st: b.st, own: b.own, ot: b.own >= 0 ? st.p[b.own].t : -1, hx: b.own >= 0 ? st.p[b.own].x : b.x, hy: b.own >= 0 ? st.p[b.own].y : b.y, shooting: b.own >= 0 && st.p[b.own].act?.kind === "jump" });
    if (hist.length > LAG + 1) hist.shift();
    const seen = hist[0];
    if (st.phase === "tip") { if (tipAt < 0) tipAt = S.TIP_JUMP + Math.round(g() * 9); return out(st.t === tipAt ? BTN.Y : 0); }
    if (st.phase === "ft") {
      if (!st.ft || st.ft.g !== P.g) return out(0);
      const key = `${st.ft.g}|${st.frame - st.ft.t}|${st.ft.k}`;
      if (key !== ftKey) { ftKey = key; ftRel = S.FT_TOP + Math.round(g() * 6); }
      if (st.ft.t < 40 + (st.ft.k ? 0 : 10)) return out(0);
      if (P.act?.kind === "ftshot") return out(P.act.f < ftRel - 1 ? BTN.X : 0);
      return out(st.ball.st === "held" ? press(BTN.X) : 0);
    }
    if (st.phase !== "live") { plan = null; return out(0); }
    const has = b.st === "held" && b.own === P.g, rx = C.rimX;
    if (has) {
      if (P.act?.kind === "jump") return out(P.act.f < rel - 1 ? BTN.X : 0);
      if (P.act) return out(0);
      if (!plan || plan.g !== P.g || plan.caught !== P.caught) {
        const u = rnd();
        const ang = (rnd() - 0.5) * 2.6, dist = rnd() < 0.5 ? 7.6 + rnd() * 0.6 : 4.8 + rnd() * 1.6;
        plan = { g: P.g, caught: P.caught, kind: u < 0.4 ? "drive" : u < 0.85 || st.n === 1 ? "spot" : "swing", tx: rx - dist * Math.cos(ang), ty: C.cy + dist * Math.sin(ang), patience: 30 + Math.floor(rnd() * 90), passAt: 20 + Math.floor(rnd() * 40), think: 0 };
      }
      const r = Math.hypot(rx - P.x, C.cy - P.y), held = P.hold;
      // the street: take it back past the arc first, as the tip says
      if (st.half && st.clear === 0) return out(stickTo(P, rx - 8.4, C.cy + (P.y - C.cy) * 0.5));
      if (rsT > 0) { rsT--; return out(rs); }
      const shoot = () => { rel = S.TOP + Math.round(g() * 6); return out(BTN.X | (r < 2.6 && rnd() < 0.3 ? BTN.RT : 0)); };
      if (prev & BTN.X) return out(0);
      if (st.shot < 100 + rnd() * 60) return shoot();
      if (r < 1.9 && rnd() < 0.2) return shoot();
      let D = null, dd = 9;
      for (const Q of st.p) if (Q.t === 1) { const k = Math.hypot(Q.x - P.x, Q.y - P.y); if (k < dd) { dd = k; D = Q; } }
      if (dd < 1.6 && rnd() < 0.006) { rs = [BTN.RSU, BTN.RSD, BTN.RSL, BTN.RSR][Math.floor(rnd() * 4)]; rsT = 2; return out(rs); }
      const c = S.contestOf(st, P).c;
      if (--plan.think <= 0) {
        plan.think = 8 + Math.floor(rnd() * 10);
        const mates = st.p.filter(Q => Q.t === 0 && Q !== P);
        if (plan.kind === "swing" && held > plan.passAt && mates.length) {
          const Q = mates[Math.floor(rnd() * mates.length)];
          const a = Math.atan2(Q.y - P.y, Q.x - P.x) + g() * 0.5, m = stickTo({ x: 0, y: 0 }, Math.cos(a), Math.sin(a), 0.38);
          plan.kind = rnd() < 0.5 ? "spot" : "drive";
          return out(press(BTN.A) | m);
        }
        if (plan.kind === "spot" && (Math.hypot(plan.tx - P.x, plan.ty - P.y) < 0.9 || held > plan.patience)) {
          if (c < 0.46 || rnd() < 0.3) return shoot();
          plan.kind = rnd() < 0.5 || !mates.length ? "drive" : "swing"; plan.passAt = held + 10;
        }
        if (plan.kind === "drive" && r < 4.5 && c > 0.66 && rnd() < 0.25) {
          if (rnd() < 0.5 || !mates.length) return shoot();
          plan.kind = "swing"; plan.passAt = held;
        }
        if (plan.kind === "drive" && r < 3.2 && rnd() < 0.5) return shoot();
      }
      const [tx, ty] = plan.kind === "drive" ? [rx - 0.6, C.cy + (P.y > C.cy ? 0.4 : -0.4)] : [plan.tx, plan.ty];
      let m = stickTo(P, tx, ty);
      if (rnd() < 0.04) m = [BTN.UP, BTN.DOWN, BTN.LEFT, BTN.RIGHT][Math.floor(rnd() * 4)];
      if (plan.kind === "drive" && r > 3.5 && P.sta > 0.3) m |= BTN.RT;
      return out(m);
    }
    plan = null;
    if (b.st === "pass" && b.to === P.g) return out(0);
    if (st.poss === 0 && b.st === "held") return out(0);
    if (watch > 0) { watch--; return out(0); }
    if (rnd() < 0.004) { watch = 30 + Math.floor(rnd() * 40); return out(0); }
    let m = 0;
    if (seen.st === "held" && seen.ot === 1) {
      // between the man and the rim he attacks (-x on the full court, +x on a half court)
      const orx = st.half ? C.rimX : -C.rimX, od = Math.hypot(orx - seen.hx, C.cy - seen.hy) || 1;
      const tx = seen.hx + ((orx - seen.hx) / od) * 1.0, ty = seen.hy + ((C.cy - seen.hy) / od) * 1.0;
      m = stickTo(P, tx, ty, 0.4);
      const k = Math.hypot(seen.hx - P.x, seen.hy - P.y);
      if (seen.shooting && k < 2.2 && st.frame - jumped > 40) { jumped = st.frame; return out(m | press(BTN.Y)); }
      if (k < 1.1 && rnd() < 1 / 45) m |= press(BTN.X);
      if (k > 4 && P.sta > 0.3) m |= BTN.RT;
      return out(m);
    }
    m = stickTo(P, seen.x, seen.y, 0.3);
    if (seen.st === "loose" && b.z > 2 && Math.hypot(b.x - P.x, b.y - P.y) < 1 && st.frame - jumped > 30) { jumped = st.frame; m |= press(BTN.Y); }
    return out(m);
  };
}
const DIFF_N = Number(process.env.HOOPS_DIFF_N) || 100;   // fewer only to iterate; the bands are for 100
// equal sides: the same ratings and archetypes, and the human's side alternates between them; three
// and one a side are drawn from the five in rotation (a guard, a wing, a slasher, a big)
const five = (p, base) => [[p + "g", "G", base + 6, "guard"], [p + "w", "W", base + 3, "wing"], [p + "s", "S", base, "slasher"], [p + "w2", "W2", base - 2, "wing"], [p + "b", "B", base + 2, "big"]];
const PICKS = { 1: [[0], [1], [2], [4]], 3: [[0, 1, 4], [0, 2, 3], [1, 2, 4]] };
function measureLevel(mode, level, n) {
  const size = S.MODES[mode].n;
  const t = { mode, level, n, w: 0, fga: 0, fgm: 0, tov: 0, pts: 0, opp: 0, ofga: 0, ofgm: 0 };
  for (let k = 0; k < n; k++) {
    const pick = (p, b) => { const all = five(p, b); return size === 5 ? all : PICKS[size][k % PICKS[size].length].map(i => all[i]); };
    const A = pick("x" + k, 74 + (k % 5)), B = pick("y" + k, 74 + (k % 5));
    const st = S.newGame(9100 + k, { mode, level, home: k % 2 ? A : B, away: k % 2 ? B : A });
    const bot = casualHuman(777 + k * 13);
    for (let f = 0; st.phase !== "over" && f < 200000; f++) S.step(st, bot(st));
    if (st.score[0] > st.score[1]) t.w++;
    t.fga += st.fga[0]; t.fgm += st.fgm[0]; t.tov += st.tov[0]; t.pts += st.score[0]; t.opp += st.score[1]; t.ofga += st.fga[1]; t.ofgm += st.fgm[1];
  }
  return t;
}
if (!isMainThread) { parentPort.postMessage(measureLevel(workerData.mode, workerData.level, workerData.n)); process.exit(0); }
// started now, read near the end: every level of every mode in parallel while the rest of the checks run
const DIFF = Object.keys(S.MODES).flatMap(mode => S.LEVEL_ORDER.map(level => new Promise((res, rej) => { const w = new Worker(new URL(import.meta.url), { workerData: { mode, level, n: DIFF_N } }); w.once("message", res); w.once("error", rej); })));
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
const cfgA = { fmt: "quarters", shot: 24, level: "rookie", home: R.sortFive(LG.teams.hq), away: R.sortFive(LG.teams.works) };
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
  assert.equal(RP.simOf(1).VERSION, 1);
  assert.ok(S.VERSION >= 4, "the live sim is v4 or later");
  const FIX2 = JSON.parse(readFileSync(new URL("./fixtures/hoops-v2-records.json", import.meta.url), "utf8"));
  assert.ok(FIX2.records.length >= 3, "the v2 fixture games are on file");
  for (const rec of FIX2.records) assert.deepEqual(RP.replayRecord(rec), rec.result, `v2 record seed ${rec.seed} replays on v2`);
  assert.equal(RP.simOf(2).VERSION, 2);
  const FIX3 = JSON.parse(readFileSync(new URL("./fixtures/hoops-v3-records.json", import.meta.url), "utf8"));
  assert.ok(FIX3.records.length >= 3, "the v3 fixture games are on file");
  for (const rec of FIX3.records) assert.deepEqual(RP.replayRecord(rec), rec.result, `v3 record seed ${rec.seed} replays on v3`);
  assert.equal(RP.simOf(3).VERSION, 3); assert.equal(RP.simOf(4).VERSION, S.VERSION);
  assert.equal(S.VERSION, 4);
  ok("v1, v2 and v3 replay");
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
  const pr = (o) => S.shotProb({ cfg: { auto: false } }, P, { kind: "jump", r: 7.5, three: true, grade: "GREEN", c: 0, ...o });
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

// ---- passing (v4): the lead, the arcs, the lane, icon passing, the alley-oop --------------------------
// The human at the top with the ball; a teammate cutting from the wing to the rim; nobody else near.
function cutter(seed, { wing = 5, kind = "A", defender = null } = {}) {
  const st = S.newGame(seed, { home: STARS, away: CELEBS });
  S.setUp(st, 0, C.rimX - 8.5, C.cy); clearDefence(st);
  for (const Q of st.p) if (Q.t === 0 && Q.i > 1) { Q.x = -6; Q.y = 1 + Q.i * 3; }
  const Q = st.p[1]; Q.x = C.rimX - 6.5; Q.y = C.cy + wing;
  Q.cut = { x: C.rimX - 1.2, y: C.cy + Math.sign(wing) * 0.8, until: 999999 };
  if (defender) { const D = st.p[5]; D.x = defender[0]; D.y = defender[1]; }
  for (let f = 0; f < 12; f++) S.step(st, 0);   // he is running now
  const P = st.p[0], dx = Q.x - P.x, dy = Q.y - P.y;
  const stick = (dx > 0.5 ? BTN.RIGHT : dx < -0.5 ? BTN.LEFT : 0) | (dy > 0.5 ? BTN.UP : dy < -0.5 ? BTN.DOWN : 0);
  const at = { x: Q.x, y: Q.y }, v = Math.hypot(Q.ax, Q.ay);
  S.step(st, stick | BTN[kind]);
  const b = st.ball, flight = [];
  for (let f = 0; f < 16 && b.st === "held"; f++) S.step(st, stick);   // a single Y waits a beat for a second tap
  for (let f = 0; f < 120 && b.st === "pass"; f++) { flight.push(b.z); S.step(st, 0); }
  return { st, Q, at, v, flight, ev: st.ev };
}
{
  const misses = [], dists = [], speeds = [], ran = [];
  for (let s = 0; s < 40; s++) {
    const r = cutter(130000 + s, { wing: s % 2 ? 5 : -5 });
    const L = r.st.lastCatch;
    assert.ok(L && L.g === 1, `the cutter catches the pass (seed ${130000 + s})`);
    misses.push(L.miss); dists.push(L.d); speeds.push(L.v); ran.push(Math.hypot(r.Q.x - r.at.x, r.Q.y - r.at.y));
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const within = misses.filter(m => m < 0.5).length;
  assert.ok(within >= 36, `the lead pass reaches the cutter within 0.5 m of where it was thrown ${within}/40 (mean ${avg(misses).toFixed(2)} m)`);
  assert.ok(avg(dists) < 0.6, `the ball is in his hands when caught (mean ${avg(dists).toFixed(2)} m)`);
  assert.ok(Math.min(...speeds) > 2, `he catches it running (slowest ${Math.min(...speeds).toFixed(1)} m/s, mean ${avg(speeds).toFixed(1)})`);
  assert.ok(avg(ran) > 1.5, `a pass thrown at where he stood would have missed him by ${avg(ran).toFixed(1)} m`);
  if (process.env.VERBOSE) console.log("lead pass miss", avg(misses).toFixed(2), "catch d", avg(dists).toFixed(2), "speed", avg(speeds).toFixed(1), "ran", avg(ran).toFixed(1));
  // the arcs: a bounce pass meets the floor, a lob goes well over a chest pass
  const chest = cutter(131000), bounce = cutter(131000, { kind: "B" }), lob = cutter(131000, { kind: "Y" });
  assert.ok(Math.min(...bounce.flight) < 0.15 && bounce.st.lastCatch?.g === 1, `the bounce pass hits the floor (lowest ${Math.min(...bounce.flight).toFixed(2)} m) and is caught`);
  assert.ok(Math.max(...lob.flight) > Math.max(...chest.flight) + 1, `the lob arcs over a chest pass (${Math.max(...lob.flight).toFixed(1)} m against ${Math.max(...chest.flight).toFixed(1)} m)`);
  // the lane: a defender standing in it gets a hand on some passes, none without him
  let hands = 0, clean = 0;
  for (let s = 0; s < 120; s++) {
    const r = cutter(132000 + s, { wing: 5, defender: [C.rimX - 7.4, C.cy + 2.6] });
    if (r.st.ball.st !== "held" || r.st.p[r.st.ball.own]?.t !== 0) hands++;
    const r2 = cutter(132000 + s, { wing: 5 });
    if (r2.st.lastCatch?.g === 1) clean++;
  }
  assert.ok(hands >= 8 && hands <= 80, `a defender in the lane deflects or steals ${hands}/120`);
  assert.equal(clean, 120, "an open lane: every pass arrives");
  ok(`passing (lead within 0.5 m ${within}/40, lane ${hands}/120)`);
}
{
  // icon passing: RB held shows a button over each teammate; RB + that button passes to him
  const st = S.newGame(140000, { home: STARS, away: CELEBS });
  S.setUp(st, 0, C.rimX - 8, C.cy); clearDefence(st);
  S.step(st, BTN.RB);
  assert.ok(st.iconOn, "RB held: the icons are up");
  assert.deepEqual(st.icons.map(i => i.b), ["A", "B", "X", "Y"], "four teammates wear A, B, X, Y");
  assert.deepEqual(st.icons.map(i => i.g), [1, 2, 3, 4]);
  S.step(st, BTN.RB | BTN.X);
  assert.ok(st.ball.st === "pass" && st.ball.to === 3, "RB + X passes to the man wearing X (not a shot)");
  assert.ok(st.ev.includes("iconpass"));
  S.step(st, 0);
  assert.ok(!st.iconOn, "let go of RB: the icons are gone");
  const st1 = S.newGame(140001, { mode: "1v1", home: STARS.slice(0, 1), away: CELEBS.slice(0, 1) });
  S.setUp(st1, 0, C.rimX - 8, C.cy); S.step(st1, BTN.RB);
  assert.ok(!st1.iconOn, "one on one: nobody to pass to, no icons");
  // the alley-oop: Y twice quickly lobs to the dunker cutting at the rim; Y once is a plain lob, a beat later
  let oops = 0, slams = 0;
  for (let s = 0; s < 30; s++) {
    const g = S.newGame(141000 + s, { home: STARS, away: CELEBS });
    S.setUp(g, 0, C.rimX - 7.5, C.cy - 2); clearDefence(g);
    const Q = g.p[1]; Q.x = C.rimX - 4.5; Q.y = C.cy + 3; Q.dunker = true;
    S.step(g, BTN.Y); S.step(g, 0); S.step(g, 0); S.step(g, BTN.Y);
    if (g.ball.st === "pass" && g.ball.alley && g.ball.to === 1) oops++;
    for (let f = 0; f < 120; f++) { S.step(g, 0); if (g.ev.includes("alleyoop")) slams++; }
  }
  assert.ok(oops === 30, `double-tap Y throws the alley-oop to the cutter (${oops}/30)`);
  assert.ok(slams >= 20, `and he finishes it (${slams}/30)`);
  const one = S.newGame(142000, { home: STARS, away: CELEBS });
  S.setUp(one, 0, C.rimX - 7.5, C.cy - 2); clearDefence(one);
  S.step(one, BTN.Y | BTN.UP);
  assert.equal(one.ball.st, "held", "one tap: the lob waits a beat for a second tap");
  for (let f = 0; f < 14; f++) S.step(one, 0);
  assert.ok(one.ball.st === "pass" && one.ball.pass === "lob", "then goes up as a lob");
  ok(`icon passing, alley-oop ${slams}/30`);
}

// ---- the street (v4): the half court's rules ---------------------------------------------------------------------
const ONE = (p, r = 80, arch = "guard") => [[p, p.toUpperCase(), r, arch]];
{
  // ones and twos
  for (const [x, pts] of [[C.rimX - 8.2, 2], [C.rimX - 4.5, 1]]) {
    const st = S.newGame(150000, { mode: "1v1", home: ONE("a"), away: ONE("b") });
    assert.ok(st.half && st.n === 1 && st.p.length === 2 && st.cfg.fmt === "street");
    S.setUp(st, 0, x, C.cy); clearDefence(st);
    S.forceShot(st, 0, true);
    assert.ok(until(st, s => s.score[0] > 0, 0, 200));
    assert.deepEqual(st.score, [pts, 0], `on the street a make from ${(C.rimX - x).toFixed(1)} m is ${pts}`);
    // the check: the other side, at the top of the key
    assert.ok(until(st, s => s.phase === "live" && s.ball.st === "held", 0, 600));
    const H = st.p[st.ball.own];
    assert.equal(H.t, 1, "after a basket the other side checks it");
    assert.ok(Math.hypot(H.x - S.TOP_SPOT[0], H.y - S.TOP_SPOT[1]) < 0.5, "at the top of the key");
  }
  // make-it-take-it: the scorer checks it again
  const m = S.newGame(150001, { mode: "3v3", mitt: true, home: STARS.slice(0, 3), away: CELEBS.slice(0, 3) });
  assert.equal(m.p.length, 6);
  S.setUp(m, 0, C.rimX - 5, C.cy); clearDefence(m); S.forceShot(m, 0, true);
  assert.ok(until(m, s => s.score[0] > 0, 0, 200) && until(m, s => s.phase === "live" && s.ball.st === "held", 0, 600));
  assert.equal(m.p[m.ball.own].t, 0, "make-it-take-it: the scorer's side keeps it");
  // clear it: a defensive board must go back past the arc; a shot before that is a turnover
  const c = S.newGame(150002, { mode: "1v1", home: ONE("a"), away: ONE("b") });
  S.setUp(c, 1, C.rimX - 4, C.cy); c.p[0].x = C.rimX - 2; c.p[0].y = C.cy;
  S.forceShot(c, 1, false);
  assert.ok(until(c, s => s.ball.st === "loose", 0, 200));
  // the board comes off to the defender, the shooter caught under the rim
  Object.assign(c.ball, { x: c.p[0].x, y: c.p[0].y, z: 1.2, vx: 0, vy: 0, vz: 0 }); c.p[1].x = C.rimX + 0.8; c.p[1].y = C.cy + 3;
  assert.ok(until(c, s => s.ball.st === "held" && s.p[s.ball.own].t === 0, 0, 30), "the defender takes the board");
  assert.equal(c.clear, 0, "a defensive rebound: take it back");
  const c2 = JSON.parse(JSON.stringify(c));   // the same moment, two ways
  let ev = [];
  S.step(c, BTN.X); for (let f = 0; f < 60; f++) { S.step(c, f < S.TOP ? BTN.X : 0); ev = ev.concat(c.ev); }
  assert.ok(ev.includes("noclear") && c.score[0] === 0, "a shot before clearing is a turnover");
  assert.ok(until(c2, s => s.clear < 0, BTN.LEFT, 400), "walking it out past the arc clears it");
  assert.ok(S.isThree(c2.p[0].x, c2.p[0].y, 1));
  // out at the half line
  const o = S.newGame(150003, { mode: "1v1", home: ONE("a"), away: ONE("b") });
  S.setUp(o, 0, 0.6, C.cy); o.p[1].x = 10; let oev = [];
  until(o, s => { oev = oev.concat(s.ev); return s.phase === "dead"; }, BTN.LEFT, 80);
  assert.ok(oev.includes("oob"), "the half line is out");
  // no free throws: a shooting foul gives the ball back, checked
  let fouled = 0;
  for (let s = 0; s < 300 && fouled < 3; s++) {
    const g = S.newGame(151000 + s, { mode: "1v1", home: ONE("a", 90), away: ONE("b", 50, "big") });
    S.setUp(g, 0, C.rimX - 4.5, C.cy); const D = g.p[1]; D.x = C.rimX - 3.8; D.y = C.cy;
    S.step(g, BTN.X); D.vz = 4; D.z = 0.01; D.act = { kind: "hop", f: 0 };
    let e2 = [];
    for (let f = 0; f < 300; f++) { S.step(g, g.p[0].act?.kind === "jump" && g.p[0].act.f < S.TOP ? BTN.X : 0); e2 = e2.concat(g.ev); assert.notEqual(g.phase, "ft", "no free throws on the street"); if (g.phase === "live" && e2.includes("check")) break; }
    if (!e2.includes("shootfoul")) continue;
    fouled++;
    assert.ok(e2.includes("check") && g.p[g.ball.own].t === 0, "the fouled side checks it again");
  }
  assert.ok(fouled >= 1, `street fouls happen (${fouled})`);
  // to 11; a CPU game on the half court plays sensibly
  const t = { fga: 0, fgm: 0, games: 0 };
  for (let s = 0; s < 30; s++) {
    const mode = s % 2 ? "1v1" : "3v3", n = S.MODES[mode].n;
    const g = S.newGame(152000 + s, { mode, to: 11, auto: true, home: NBA("a" + s, 76).slice(0, n), away: NBA("b" + s, 76).slice(0, n) });
    run(g);
    assert.equal(g.phase, "over"); assert.ok(Math.max(...g.score) >= 11 && Math.max(...g.score) <= 12, `to 11 ends at 11 (${g.score})`);
    t.fga += g.fga[0] + g.fga[1]; t.fgm += g.fgm[0] + g.fgm[1]; t.games++;
  }
  const fg = t.fgm / t.fga;
  assert.ok(fg > 0.38 && fg < 0.56, `the street CPU shoots ${(fg * 100).toFixed(1)}%`);
  // a one on one game replays from its record
  const cfg1 = { mode: "1v1", level: "rookie", to: 11, home: ONE("me", 70), away: ONE("you", 70, "wing") };
  const st1 = S.newGame(153000, cfg1), masks = run(st1, casualHuman(5));
  const rec = { version: S.VERSION, seed: 153000, cfg: cfg1, inputLog: S.rleEncode(masks), result: S.resultOf(st1) };
  assert.deepEqual(S.replay(JSON.parse(JSON.stringify(rec))), rec.result, "a one on one game replays");
  ok(`street (CPU FG ${(fg * 100).toFixed(1)}%)`);
}
{
  // positions and builds: a centre is taller and broader than a point guard; a roster's position holds
  const st = S.newGame(1, { home: [["a", "A", 80, null, "PG"], ["b", "B", 80, null, "SG"], ["c", "C", 80, null, "SF"], ["d", "D", 80, null, "PF"], ["e", "E", 80, null, "C", "L"]], away: CELEBS });
  const [pg, , , pf, c] = st.p;
  assert.deepEqual(st.p.slice(0, 5).map(P => P.pos), ["PG", "SG", "SF", "PF", "C"]);
  assert.ok(c.h > pf.h && pf.h > pg.h && c.bw > pf.bw && pf.bw > pg.bw, "C taller and broader than PF, PF than PG");
  assert.ok(c.lefty && !pg.lefty, "the roster's hand is carried (cosmetic)");
  for (const P of S.newGame(2, { home: NBA("x", 75), away: NBA("y", 75) }).p) assert.ok(S.POSITIONS.includes(P.pos) && P.bw > 0.7 && P.bw < 1.3);
  ok("positions");
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

// ---- difficulty ---------------------------------------------------------------------------------------------
{
  assert.deepEqual(S.LEVEL_ORDER, ["rookie", "pro", "allstar", "hof"]);
  assert.equal(S.newGame(1, { assist: true }).cfg.level, "rookie", "an EASY MODE cfg reads as ROOKIE");
  assert.equal(S.newGame(1, {}).cfg.level, "allstar");
  // the CPU v CPU game ignores the level: the calibration is the same at every level
  const auto = (level) => { const st = S.newGame(4321, { auto: true, level, home: NBA("p", 76), away: NBA("q", 76) }); run(st); return S.resultOf(st); };
  assert.deepEqual(auto("rookie"), auto("hof"), "a CPU v CPU game plays the same at every level");
  const all = await Promise.all(DIFF), res = all.filter(r => r.mode === "5v5"), by = Object.fromEntries(res.map(r => [r.level, r]));
  const pc = (a, b) => (b ? (100 * a) / b : 0);
  const line = res.map(r => `${S.LEVELS[r.level].name} win ${pc(r.w, r.n).toFixed(0)}% FG ${pc(r.fgm, r.fga).toFixed(1)}% TOV ${(r.tov / r.n).toFixed(1)} pts ${(r.pts / r.n).toFixed(1)}-${(r.opp / r.n).toFixed(1)} oppFG ${pc(r.ofgm, r.ofga).toFixed(1)}%`).join("; ");
  if (process.env.VERBOSE) console.log(line);
  const band = (lv, lo, hi) => { const w = pc(by[lv].w, by[lv].n); assert.ok(w >= lo && w <= hi, `a casual human on ${S.LEVELS[lv].name} wins ${w.toFixed(0)}% (${lo}-${hi}): ${line}`); };
  band("rookie", 65, 75); band("pro", 45, 55); band("allstar", 30, 40); band("hof", 15, 25);
  const fg = (lv) => pc(by[lv].fgm, by[lv].fga);
  assert.ok(fg("rookie") >= 45 && fg("rookie") <= 50, `a casual human shoots ${fg("rookie").toFixed(1)}% on ROOKIE (45-50): ${line}`);
  assert.ok(fg("rookie") > fg("hof") && by.hof.tov > by.rookie.tov && by.hof.opp > by.rookie.opp, `HALL OF FAME is harder all round: ${line}`);
  ok(`difficulty 5v5 ${line}`);
  // the half court: ROOKIE wins 65-75% one on one and three on three too, and each level is harder
  for (const mode of ["3v3", "1v1"]) {
    const rs = all.filter(r => r.mode === mode), w = Object.fromEntries(rs.map(r => [r.level, pc(r.w, r.n)]));
    const ln = rs.map(r => `${S.LEVELS[r.level].name} win ${pc(r.w, r.n).toFixed(0)}% FG ${pc(r.fgm, r.fga).toFixed(1)}% pts ${(r.pts / r.n).toFixed(1)}-${(r.opp / r.n).toFixed(1)}`).join("; ");
    if (process.env.VERBOSE) console.log(mode, ln);
    assert.ok(w.rookie >= 65 && w.rookie <= 75, `${mode}: a casual human on ROOKIE wins ${w.rookie.toFixed(0)}% (65-75): ${ln}`);
    assert.ok(w.rookie > w.pro && w.pro > w.allstar && w.allstar > w.hof && w.hof >= 10 && w.hof <= 30, `${mode}: each level harder, HALL OF FAME 10-30%: ${ln}`);
    ok(`difficulty ${mode} ${ln}`);
  }
}

console.log(`check-hoops: ${n} checks passed`);
