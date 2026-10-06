// FOURTH AND LONG (src/play/tecmo/): the arcade football cabinet's game, headless.
//   1. the rules: downs and distance both ways, the first down, turnover on downs, goal to go; a
//      touchdown (6 + the try), a field goal (3), a safety (2, then the free kick), touchbacks; the
//      quarters, halftime's kickoff, the final whistle
//   2. determinism: the same seed and inputs give the same game to the bit; the record (seed, cfg,
//      run-length input log) replays to the same result; a record from another version is refused;
//      the sim reads no clock and no Math.random
//   3. the play guess: a defence that calls the offence's play reads it (and only then); read plays
//      gain less; the CPU guesses at about the rate a guess should
//   4. two players: player 1's byte moves only player 1's side, player 2's only player 2's; a CPU side
//      ignores its byte entirely
//   5. the feel: ratings drive speed (a star really is faster), mashing A breaks tackles, every team's
//      card is two runs over two passes
//   6. the cabinet: FOURTH AND LONG is #tecmo, in the bars, the Union and THE ARCADE; #football stays
// Run: node scripts/check-tecmo.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const S = await import("../src/play/tecmo/sim.js");
const R = await import("../src/play/football/roster.js");
let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); };
const team = (id) => ({ id, short: R.TEAMS[id][1], rows: R.sortEleven(R.FALLBACK.teams[id]) });
const cfgOf = (a, b, sides = ["cpu", "cpu"], qlen = 1) => ({ qlen, sides, teams: [team(a), team(b)] });
const until = (st, f, word = () => 0, max = 60 * 60 * 30) => { for (let i = 0; i < max && !f(st); i++) S.step(st, word(st)); return f(st); };
const { BTN, HZ } = S;

// ---- 0. the source --------------------------------------------------------------------------------------
{
  const src = readFileSync(new URL("../src/play/tecmo/sim.js", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  for (const bad of ["Math.random", "Date.now", "performance.", "Math.sin", "Math.cos", "Math.atan", "Math.hypot", "Math.pow", "Math.exp", "Math.log"]) ok(!src.includes(bad), `sim.js does not use ${bad}`);
  ok(!/\bimport\b/.test(src), "sim.js imports nothing (pure)");
}

// ---- 1. the rules ---------------------------------------------------------------------------------------------
{
  const { newSeries, nextDown, touchdown, downed, afterPlay, setupKickoff } = S._rules;
  const st = S.newGame(cfgOf("hq", "works"), 11);
  ok(st.phase === "kick" && st.kick.t === 1 && st.poss === 0, "the visitors kick off to the home side");
  newSeries(st, 0, 25);
  ok(st.los === 25 && st.firstAt === 35 && st.down === 1, "team 0: 1st and 10 at its own 25, the marker at 35");
  nextDown(st, 30);
  ok(st.down === 2 && st.los === 30 && S.togoText(st) === "5", "a 5-yard gain: 2nd and 5");
  nextDown(st, 36);
  ok(st.down === 1 && st.firstAt === 46 && st.poss === 0, "past the marker: a first down, a new marker");
  newSeries(st, 1, 75);
  ok(st.firstAt === 65 && S.dirOf(1) === -1 && S.sideOf(st) === "OWN 25", "team 1 goes the other way: its own 25 is x = 75");
  nextDown(st, 71); nextDown(st, 70); nextDown(st, 69);
  ok(st.down === 4 && S.togoText(st) === "4", "three short gains: 4th and 4");
  ok(S.kicksOpen(st).punt && !S.kicksOpen(st).fg, "4th down at their own 31: the punt is on, a 86-yard field goal is not");
  nextDown(st, 68);
  ok(st.poss === 0 && st.los === 68 && st.down === 1, "short on 4th: turnover on downs at the spot");
  newSeries(st, 0, 95);
  ok(st.firstAt === 100 && S.togoText(st) === "GOAL", "inside the 10: goal to go");
  st.down = 4; ok(S.kicksOpen(st).fg, "4th and goal at the 5: a 22-yard field goal is open");
  // a touchdown: 6, the try, the kickoff by the scorer
  const c = S.offMan(st, 0, S.O.RB);
  st.ball = { state: "held", g: c.g, x: 100.5, y: 20, z: 1 }; st.phase = "live"; st.play = { scrim: true, kind: "run" }; c.x = 100.5;
  const before = st.score[0];
  touchdown(st, c);
  ok(st.score[0] === before + 6 && st.phase === "td" && st.td.g === c.g, "into the end zone: six, and the touchdown screen");
  ok(until(st, s => s.phase === "kick" && s.kick?.kind === "pat"), "after the celebration: the try");
  ok(until(st, s => s.phase === "kick" && s.kick?.kind === "kickoff"), "the try taken, the kickoff");
  ok(st.score[0] === before + 7 && st.kick.t === 0, "the CPU's try is good (7) and the scorer kicks off");
  // a safety: tackled in his own end zone on a scrimmage down
  newSeries(st, 0, 3);
  const q = S.offMan(st, 0, S.O.QB); q.x = -1; st.ball = { state: "held", g: q.g, x: -1, y: 20, z: 1 }; st.play = { scrim: true, kind: "pass" }; st.phase = "live";
  const s1 = st.score[1];
  downed(st, q);
  ok(st.score[1] === s1 + 2 && st.dead.kind === "safety", "downed in his own end zone from scrimmage: a safety, two points");
  afterPlay(st);
  ok(st.phase === "kick" && st.kick.kind === "free" && st.kick.t === 0 && st.kick.x === 20, "then the free kick, by the side that gave it up, from its own 20");
  // the same spot on a return is a touchback, not a safety
  setupKickoff(st, 1, false);
  const r = S.offMan(st, 0, S.O.RB); r.x = -3; st.ball = { state: "held", g: r.g, x: -3, y: 20, z: 1 }; st.play = { scrim: false, ret: true, kind: "kick" }; st.phase = "live";
  const sc = [...st.score];
  downed(st, r);
  ok(st.score.join() === sc.join() && st.dead.kind === "touchback" && st.dead.x === 20, "a returner downed in his end zone: a touchback at the 20");
  // a kickoff into the end zone: touchback at the 25
  const k = S.newGame(cfgOf("hq", "works"), 5);
  let tb = 0, fielded = 0;
  for (let seed = 1; seed < 40; seed++) {
    const g = S.newGame(cfgOf("hq", "works"), seed);
    until(g, s => s.phase !== "kick");
    if (until(g, s => s.phase === "dead" || (s.ball.state === "held"), () => 0, 600) && g.phase === "dead" && g.dead.kind === "touchback") { tb++; ok(g.dead.x === 25, "a kickoff touchback: the 25"); } else fielded++;
  }
  ok(tb > 0 && fielded > 0, `kickoffs: some touchbacks (${tb}), some returned (${fielded})`);
  void k;
}

// a whole game, CPU v CPU: four quarters, sane scores, halftime's kickoff, the final whistle
{
  const totals = [];
  for (const [a, b, seed] of [["works", "archive", 1], ["hq", "campus", 7], ["arts", "sprawl", 99], ["finance", "strip", 5], ["arena", "commons", 3]]) {
    const st = S.newGame(cfgOf(a, b, ["cpu", "cpu"], 2), seed);
    let half = null, quarters = 0;
    const seen = new Set();
    for (let i = 0; i < 60 * 60 * 40 && !st.over; i++) {
      const q = st.q; S.step(st, 0); seen.add(st.phase);
      if (st.q !== q) quarters++;
      if (q === 2 && st.q === 3) half = { kt: st.kick?.t, phase: st.phase };
    }
    ok(st.over && st.q === 4 && quarters === 3, `${a} v ${b}: four quarters and a final whistle`);
    ok(half && half.phase === "kick" && half.kt === 0, `${a} v ${b}: the home side kicks off the second half`);
    for (const ph of ["call", "pre", "live", "dead", "kick", "quarter"]) ok(seen.has(ph), `${a} v ${b}: the game passes through ${ph}`);
    ok(st.score.every(x => x >= 0 && x <= 90), `${a} v ${b}: a sane score ${st.score}`);
    totals.push(st.score[0] + st.score[1]);
    const r = S.resultOf(st);
    ok(r.done && (r.winner === (st.score[0] > st.score[1] ? 0 : st.score[1] > st.score[0] ? 1 : -1)), "the result names the winner");
  }
  const avg = totals.reduce((x, y) => x + y, 0) / totals.length;
  ok(avg > 8 && avg < 110, `arcade scoring: ${avg.toFixed(1)} points a game on average`);
}

// ---- 2. determinism and the replay ---------------------------------------------------------------------------
// a scripted pair of humans: picks, snaps, steers, throws, mashes, dives; a word a frame from (frame, seed)
function bot(seed) {
  let h = seed >>> 0;
  const r = () => { h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return h / 4294967296; };
  const hold = [0, 0], left = [0, 0];
  return (st) => {
    let w = 0;
    for (let s = 0; s < 2; s++) {
      if (left[s] <= 0) { hold[s] = [BTN.UP, BTN.DOWN, BTN.LEFT, BTN.RIGHT, BTN.RIGHT | BTN.UP, 0][Math.floor(r() * 6)]; left[s] = 10 + Math.floor(r() * 30); }
      left[s]--;
      let m = hold[s];
      if (st.frame % 2 === 0 && r() < 0.5) m |= BTN.A;
      if (r() < 0.03) m |= BTN.B;
      w |= m << (8 * s);
    }
    return w;
  };
}
function play(cfg, seed, botSeed, maxF = 60 * 60 * 20) {
  const st = S.newGame(cfg, seed), log = [], w = bot(botSeed);
  for (let i = 0; i < maxF && !st.over; i++) { const m = w(st); log.push(m); S.step(st, m); }
  return { st, log };
}
{
  const cfg = cfgOf("archive", "works", ["human", "human"], 1);
  const a = play(cfg, 1234, 77), b = play(cfg, 1234, 77);
  ok(a.st.over, "a two-human game of button-mashing still ends");
  ok(S.stateHash(a.st) === S.stateHash(b.st) && a.st.frame === b.st.frame, "same seed, same inputs: the same game to the bit");
  const c = play(cfg, 1235, 77, a.st.frame);
  ok(S.stateHash(c.st) !== S.stateHash(a.st), "another seed: another game");
  const rle = S.rleEncode(a.log);
  ok(JSON.stringify(S.rleDecode(rle)) === JSON.stringify(a.log), "the input log run-length encodes and decodes exactly");
  const calm = [...Array(600).fill(0), ...Array(40).fill(BTN.RIGHT), ...Array(600).fill(0)];
  ok(S.rleEncode(calm).length === 6, "a held stick is one run, not forty words");
  const rec = { v: S.VERSION, seed: 1234, cfg: JSON.parse(JSON.stringify(cfg)), rle };
  const rp = S.replay(rec);
  ok(rp.ok && rp.result.score.join() === a.st.score.join() && rp.result.frames === a.st.frame && S.stateHash(rp.st) === S.stateHash(a.st), "the record replays to the same final state");
  ok(!S.replay({ ...rec, v: S.VERSION + 1 }).ok, "a record from another version is refused, not misread");
  // a CPU v CPU game is the same twice, and a 1P game against the CPU too
  const x = S.newGame(cfgOf("hq", "campus"), 9), y = S.newGame(cfgOf("hq", "campus"), 9);
  until(x, s => s.over); until(y, s => s.over);
  ok(S.stateHash(x) === S.stateHash(y), "CPU v CPU: deterministic");
}

// ---- 3. the play guess ------------------------------------------------------------------------------------------
{
  // both human: pick by cursor. P1 (offence, team 0) takes play i, P2 guesses j.
  const callWith = (i, j) => {
    const st = S.newGame(cfgOf("hq", "works", ["human", "human"]), 21);
    S._rules.newSeries(st, 0, 30); S._rules.setupCall(st);
    const moves = (k) => [k >= 2 ? BTN.DOWN : 0, k % 2 ? BTN.RIGHT : 0].filter(Boolean);
    const seq = [];
    for (const b of moves(i)) seq.push(b, 0);
    const seq2 = [];
    for (const b of moves(j)) seq2.push(b, 0);
    for (let f = 0; f < 40; f++) { const a = seq[f] ?? (f === 20 ? BTN.A : 0), b = seq2[f] ?? (f === 22 ? BTN.A : 0); S.step(st, a | (b << 8)); }
    return st;
  };
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const st = callWith(i, j);
    ok(st.phase === "pre" && st.call.pick[0] === i && st.call.pick[1] === j, `called ${i}, guessed ${j}`);
    ok(st.play.read === (i === j), `guess ${j} v call ${i}: ${i === j ? "read" : "not read"}`);
    ok(st.play.id === st.books[0][i], "the offence runs the play it called");
  }
  // a read play swarms: on many CPU v CPU games, read plays gain far less than the rest
  const gain = { read: [], open: [] };
  let calls = 0, reads = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const st = S.newGame(cfgOf(R.TEAM_IDS[seed % 10], R.TEAM_IDS[(seed * 3 + 1) % 10]), seed);
    let los = 0, read = false, on = false;
    for (let i = 0; i < 60 * 60 * 12 && !st.over; i++) {
      const ph = st.phase; S.step(st, 0);
      if (ph === "pre" && st.phase === "live") { los = st.los; read = st.play.read; on = true; calls++; if (read) reads++; }
      if (on && ph === "live" && st.phase !== "live") {
        on = false;
        if (st.play.scrim && st.dead && ["tackle", "oob", "inc"].includes(st.dead.kind)) (read ? gain.read : gain.open).push(st.dead.kind === "inc" ? 0 : S.dirOf(st.poss) * (st.dead.x - los));
      }
    }
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  ok(gain.read.length > 20 && gain.open.length > 50, `enough plays to judge (${gain.read.length} read, ${gain.open.length} not)`);
  ok(mean(gain.read) < mean(gain.open) - 2, `a read play gains less: ${mean(gain.read).toFixed(1)} yards v ${mean(gain.open).toFixed(1)}`);
  ok(reads / calls > 0.15 && reads / calls < 0.45, `the CPU reads ${(100 * reads / calls).toFixed(0)}% of calls (a blind guess is 25%)`);
}

// ---- 4. two players: separate hands -------------------------------------------------------------------------
{
  // the call screen: P1's d-pad moves P1's cursor only, P2's only P2's
  const st = S.newGame(cfgOf("hq", "works", ["human", "human"]), 3);
  S._rules.newSeries(st, 0, 30); S._rules.setupCall(st);
  S.step(st, BTN.DOWN); S.step(st, 0);
  ok(st.call.cur[0] === 2 && st.call.cur[1] === 0, "P1's DOWN moves P1's cursor (to a pass), not P2's");
  S.step(st, BTN.RIGHT << 8); S.step(st, 0);
  ok(st.call.cur[0] === 2 && st.call.cur[1] === 1, "P2's RIGHT moves P2's cursor, not P1's");
  for (let i = 0; i < 12; i++) S.step(st, 0);
  S.step(st, BTN.A); S.step(st, 0);
  ok(st.call.lock[0] && !st.call.lock[1], "P1's A locks P1's call only");
  // the field: P1's stick moves team 0's man, P2's moves team 1's
  S.step(st, BTN.A << 8);
  until(st, s => s.phase === "pre");
  for (let i = 0; i < 20; i++) S.step(st, 0);
  S.step(st, BTN.A);
  ok(st.phase === "live" && st.play.kind === "pass" && st.p[st.ctrl[0]] === S.offMan(st, 0, S.O.QB), "P1 snaps; on a pass P1 holds the passer");
  const p1 = st.p[st.ctrl[0]], p2 = st.p[st.ctrl[1]];
  const y1 = p1.y, y2 = p2.y;
  for (let i = 0; i < 12; i++) S.step(st, BTN.UP);
  ok(p1.y < y1 - 0.3 && Math.abs(p2.y - y2) < 0.3, "P1's UP moves P1's man; P2's man stays where he was");
  const y1b = st.p[st.ctrl[0]].y, y2b = st.p[st.ctrl[1]].y;
  for (let i = 0; i < 12; i++) S.step(st, BTN.DOWN << 8);
  ok(st.p[st.ctrl[1]].y > y2b + 0.3, "P2's DOWN moves P2's man");
  void y1b;
  // against the CPU, the second byte is nobody's
  const a = S.newGame(cfgOf("hq", "works", ["human", "cpu"]), 8), b = S.newGame(cfgOf("hq", "works", ["human", "cpu"]), 8);
  const w = bot(5);
  for (let i = 0; i < 60 * 60 * 3; i++) { const m = w(a) & 255; S.step(a, m); S.step(b, m | (((i * 37) & 255) << 8)); }
  ok(S.stateHash(a) === S.stateHash(b), "a CPU side ignores its byte: garbage on P2's half changes nothing");
}

// ---- 5. the feel ---------------------------------------------------------------------------------------------------
{
  const star = S.abilities(88, "walter-payton"), avg = S.abilities(52, "nobody"), slow = S.abilities(45, "x");
  ok(star.spd > avg.spd + 2 && avg.spd > slow.spd, `a star is faster: ${star.spd.toFixed(1)} v ${avg.spd.toFixed(1)} yards a second`);
  ok(star.str > avg.str && star.tak > avg.tak && star.arm > avg.arm, "and stronger, a harder tackler, a better arm");
  for (const id of R.TEAM_IDS) {
    const L = S.lineup(R.sortEleven(R.FALLBACK.teams[id]));
    ok(new Set(L.os).size === 11 && L.os.every(i => i >= 0) && new Set(L.ds).size === 11 && L.ds.every(i => i >= 0), `${id}: eleven men in eleven spots, both ways`);
    const book = S.bookOf(id);
    ok(book.length === 4 && S.PLAYS[book[0]].kind === "run" && S.PLAYS[book[1]].kind === "run" && S.PLAYS[book[2]].kind === "pass" && S.PLAYS[book[3]].kind === "pass" && new Set(book).size === 4, `${id}: two runs over two passes, all different`);
  }
  const arch = R.sortEleven(R.FALLBACK.teams.archive), L = S.lineup(arch);
  ok(arch[L.os[S.O.QB]][0] === "tom-brady", "a named quarterback plays quarterback");
  const works = R.sortEleven(R.FALLBACK.teams.works);
  ok(works[S.lineup(works).os[S.O.RB]][0] === "walter-payton", "a named back carries it");
  // mashing breaks tackles: the same human runner, mashing or not
  const runs = (mashA) => {
    let breaks = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const st = S.newGame(cfgOf("works", "hq", ["human", "cpu"], 1), seed);
      for (let i = 0; i < 60 * 60 * 6 && !st.over; i++) {
        let m = 0;
        if (st.phase === "call" && st.poss === 0) m = st.pf === 20 ? BTN.A : 0;          // call play 1 (a run)
        else if (st.phase === "call") m = st.pf === 20 ? BTN.A : 0;
        else if (st.phase === "pre") m = st.pf === 25 ? BTN.A : 0;
        else if (st.phase === "kick") m = st.pf === 40 ? BTN.A : 0;
        else if (st.phase === "live") { const c = S.carrierOf(st); if (c && c.t === 0) { m = BTN.RIGHT; if (st.grab && mashA && st.frame % 2) m |= BTN.A; } }
        S.step(st, m);
      }
      breaks += st.stat[0].breaks;
    }
    return breaks;
  };
  const withMash = runs(true), without = runs(false);
  ok(withMash > without + 3, `mashing A breaks tackles: ${withMash} broken mashing, ${without} not`);
  ok(S.GRAB_F >= 30 && S.GRAB_NEED > 0, "a grab lasts long enough to mash out of");
}

// ---- 6. the cabinet ---------------------------------------------------------------------------------------------------
{
  const arcade = JSON.parse(readFileSync(new URL("../src/city/arcade.json", import.meta.url), "utf8"));
  const cab = arcade.find(g => g.slug === "house-football");
  ok(cab && cab.house === true && cab.title === "FOURTH AND LONG" && cab.route === "#tecmo", "the house cabinet FOURTH AND LONG plays #tecmo");
  const { GAMES, routesIn, isLive } = await import("../src/play/games.js");
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8"), routes = new Set(routesIn(app));
  const tile = GAMES.find(g => g.href === "#tecmo");
  ok(tile && tile.title === "FOURTH AND LONG" && isLive(tile, routes), "a #play tile, FOURTH AND LONG, and App.jsx serves #tecmo");
  ok(/lazy\(\(\) => import\("\.\/play\/tecmo\/Tecmo\.jsx"\)\)/.test(app), "the game is its own lazy chunk");
  const fb = GAMES.find(g => g.href === "#football");
  ok(fb && fb.title === "FOOTBALL" && routes.has("#football"), "the full game stays #football, its own tile");
  const HG = await import("../src/city/houseGames.js");
  for (const t of ["bar", "brewpub", "union"]) ok(HG.HOUSE_PLACES[t].includes("house-football"), `FOURTH AND LONG stands in the ${t}`);
  ok(HG.houseLive(routes).some(g => g.slug === "house-football"), "and is live wherever the house games are (THE ARCADE's back row too)");
  const F = await import("../src/city/funnels.js");
  ok(F.HOUSE_BUILDINGS["the-dive"].includes("house-football"), "THE DIVE's toolbar offers it");
  const hs = F.highScore("house-football", null, 640);
  ok(/^\d+-\d+$/.test(hs.score) && hs.initials.length === 3, `the marquee's score is a football score: ${hs.initials} ${hs.score}`);
}

// ---- 7. a casual human (scripts/tecmoBot.mjs) against the CPU, equal teams (each club against itself) ------
// ROOKIE, the default, is beatable most of the time; PRO is not.
{
  const { casualHuman } = await import("./tecmoBot.mjs");
  const rate = (level, games, qlen) => {
    let w = 0, pf = 0, pa = 0;
    for (let i = 0; i < games; i++) {
      const id = R.TEAM_IDS[i % 10], side = i % 2;
      const st = S.newGame({ qlen, level, sides: side ? ["cpu", "human"] : ["human", "cpu"], teams: [team(id), team(id)] }, 1000 + i);
      const bot = casualHuman(side, i + 7);
      for (let f = 0; f < 60 * 60 * 15 && !st.over; f++) S.step(st, bot(st) << (8 * side));
      ok(st.over, "the casual human's game ends");
      const me = st.score[side], cpu = st.score[1 - side];
      pf += me; pa += cpu; w += me > cpu ? 1 : me === cpu ? 0.5 : 0;
    }
    return { win: w / games, pf: pf / games, pa: pa / games };
  };
  const rookie = rate(undefined, 40, 1), pro = rate("pro", 20, 1);
  ok(rookie.win >= 0.58 && rookie.win <= 0.82, `ROOKIE (the default): a casual human wins ${(100 * rookie.win).toFixed(0)}% against an equal team (${rookie.pf.toFixed(1)}-${rookie.pa.toFixed(1)} a game); aim 65-75%`);
  ok(pro.win < rookie.win - 0.25, `PRO is the real thing: ${(100 * pro.win).toFixed(0)}%`);
  console.log(`  casual human v CPU, equal teams: ROOKIE ${(100 * rookie.win).toFixed(0)}%, PRO ${(100 * pro.win).toFixed(0)}%`);
}

console.log(`check-tecmo: ${n} checks passed`);
