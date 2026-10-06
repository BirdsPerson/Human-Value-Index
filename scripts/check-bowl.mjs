// THE LANES (src/play/bowling/): ten-pin bowling, headless.
//   scoring      a perfect game is 300, all spares of five 150, all nines-and-spares 190, a gutter game 0,
//                a mixed sheet to its known total; the tenth frame (X X X, X 3 /, 7 / X, an open tenth that
//                ends after two); a foul is F and 0, and a foul then ten is a spare; splits (7-10, 4-6,
//                the baby splits) and not-splits (4-5, anything with the head pin)
//   purity       sim.js and score.js read no clock, no Math.random, no transcendental maths (sqrt only)
//   physics      a good ball into the pocket strikes in a realistic band; a light pocket leaves the 5 or
//                the 5-7, a high one the 4; head-on is split-prone; the Brooklyn side strikes sometimes;
//                the hook: skid in the oil, hook on the dry backend; more side roll, more hook; a gutter
//                ball scores 0 and the bumpers keep the same ball on the lane
//   game         1-4 players in turn to the end of the tenth; the keyboard's three presses throw; power
//                into the red is a foul: 0, the pins set up again
//   determinism  a whole game (two humans, scripted, and two figures) replays from {cfg, inputLog} to the
//                same result, twice, through JSON; another seed plays another game; a doctored log does
//                not reproduce the claim; another version is refused
//   records      the results shape (results.js) from a verified game; the roster's living say nothing;
//                the #play tile and its icon
// Run: node scripts/check-bowl.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const S = await import("../src/play/bowling/sim.js");
const SC = await import("../src/play/bowling/score.js");
const R = await import("../src/play/bowling/roster.js");
const RS = await import("../src/play/bowling/results.js");
const GE = await import("../src/play/bowling/gesture.js");
let n = 0;
const ok = (msg) => { n++; if (process.env.VERBOSE) console.log("ok", msg); };
const B = (a) => a.map(x => (typeof x === "object" ? x : { n: x }));

// ---- scoring ---------------------------------------------------------------------------------------------
{
  assert.equal(SC.frames(B(Array(12).fill(10))).total, 300); ok("a perfect game is 300");
  assert.equal(SC.frames(B(Array(21).fill(5))).total, 150); ok("all spares of five: 150");
  assert.equal(SC.frames(B([...Array(10).fill(0).flatMap(() => [9, 1]), 9])).total, 190); ok("nines and spares: 190");
  assert.equal(SC.frames(B(Array(20).fill(0))).total, 0); ok("a gutter game: 0");
  assert.equal(SC.frames(B([10, 7, 3, 9, 0, 10, 0, 8, 8, 2, 0, 6, 10, 10, 10, 8, 1])).total, 167); ok("a mixed sheet: 167");
  const ten = (t) => SC.frames(B([...Array(18).fill(0), ...t])).frames[9];
  assert.deepEqual(ten([10, 10, 10]).marks, ["X", "X", "X"]); assert.equal(SC.frames(B([...Array(18).fill(0), 10, 10, 10])).total, 30);
  assert.deepEqual(ten([10, 3, 7]).marks, ["X", "3", "/"]); assert.equal(SC.frames(B([...Array(18).fill(0), 10, 3, 7])).total, 20);
  assert.deepEqual(ten([7, 3, 10]).marks, ["7", "/", "X"]); assert.equal(SC.frames(B([...Array(18).fill(0), 7, 3, 10])).total, 20);
  const open = SC.frames(B([...Array(18).fill(0), 7, 2]));
  assert.ok(open.over && open.frames[9].balls.length === 2 && open.total === 9);
  assert.ok(!SC.frames(B([...Array(18).fill(0), 7, 3])).over, "a spare in the tenth earns a third ball");
  assert.ok(SC.position(B(Array(11).fill(10))).rackFresh && SC.position(B([...Array(9).fill(10), 10, 4])).rackFresh === false);
  ok("the tenth frame: X X X, X 3 /, 7 / X, an open tenth of two balls, its fresh racks");
  assert.deepEqual(SC.frames(B([{ n: 0, foul: true }, 10])).frames[0].marks, ["F", "/"]); ok("a foul then ten is a spare");
  assert.deepEqual(SC.frames(B([{ n: 0, foul: true }, 4])).frames[0].marks, ["F", "4"]);
  assert.equal(SC.frames(B([{ n: 0, foul: true }, 4, ...Array(18).fill(0)])).total, 4); ok("a foul counts 0");
  for (const s of [[7, 10], [4, 6], [2, 7], [3, 10], [5, 7], [4, 6, 7, 10], [6, 7, 10]]) assert.ok(SC.isSplit(s), `${s.join("-")} is a split`);
  for (const s of [[4, 5], [1, 7, 10], [10], [2, 4, 5, 8], [6, 10], [8, 10].slice(0, 1)]) assert.ok(!SC.isSplit(s), `${s.join("-")} is not a split`);
  ok("splits and not-splits");
  assert.equal(SC.maxPossible(B([9, 0])), 279); ok("the monitor's MAX");
}

// ---- purity ---------------------------------------------------------------------------------------------
for (const f of ["sim.js", "score.js"]) {
  const src = readFileSync(new URL(`../src/play/bowling/${f}`, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  for (const bad of [/Date\./, /Math\.random/, /performance\./, /Math\.(sin|cos|tan|atan2?|exp|log|pow|hypot|cbrt)\b/, /\*\*/]) assert.ok(!bad.test(src), `${f} uses ${bad}`);
}
ok("sim.js and score.js: no clock, no Math.random, sqrt the only transcendental");

// ---- physics ------------------------------------------------------------------------------------------------
// One ball from a fresh rack: aimed by the sim's own look-ahead at target x on the head pin's row.
function roll({ seed, x0 = 10, mph = 17, r = 0.5, tx = 2.6, weight = 14, hand = 1, bumpers = false, a = null }) {
  const st = S.newGame({ seed, players: [{ name: "T", weight, hand, bumpers }] });
  const aim = a ?? S.aimFor(st, x0, mph, r, tx, S.HEAD_Y, hand);
  S.act(st, { t: "throw", x: x0, a: aim, mph, r });
  const ev = [];
  for (let k = 0; k < 3000 && st.phase !== "result"; k++) { S.step(st, 0); ev.push(...st.events); }
  return { left: st.lastRoll.left, n: st.lastRoll.n, ev, st };
}
const spread = (i, w) => ((i % 9) - 4) / 4 * w;   // -w .. w across the seeds
function rate(N, opts, w = 1.0) {
  let strikes = 0, splits = 0; const leaves = new Map();
  for (let i = 0; i < N; i++) {
    const o = roll({ seed: 500 + i * 7, ...opts, tx: opts.tx + spread(i, w) });
    if (!o.left.length) strikes++;
    if (SC.isSplit(o.left)) splits++;
    const k = o.left.join("-") || "X"; leaves.set(k, (leaves.get(k) || 0) + 1);
  }
  return { strike: strikes / N, split: splits / N, leaves: [...leaves].sort((a, b) => b[1] - a[1]) };
}
{
  const pocket = rate(54, { tx: 2.6, r: 0.5, mph: 17.5 });
  assert.ok(pocket.strike >= 0.5 && pocket.strike <= 0.97, `a good pocket ball strikes ${(pocket.strike * 100).toFixed(0)}% (want 50-97)`);
  ok(`the pocket (1-3, 17.5 mph, a 15-pounder's hook, +-1 in): strikes ${(pocket.strike * 100).toFixed(0)}%; leaves ${pocket.leaves.slice(0, 5).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  const dead = rate(36, { tx: 2.6, r: 0.5, mph: 17.5 }, 0.15);
  assert.ok(dead.strike >= 0.75, `dead flush: ${dead.strike}`);
  ok(`dead in the pocket: strikes ${(dead.strike * 100).toFixed(0)}%`);
  const head = rate(36, { tx: 0, r: 0.5, mph: 17.5 }, 0.6);
  assert.ok(head.strike < 0.2 && head.split > 0.3, `head-on strikes ${head.strike}, splits ${head.split}`);
  ok(`head-on: strikes ${(head.strike * 100).toFixed(0)}%, splits ${(head.split * 100).toFixed(0)}%; leaves ${head.leaves.slice(0, 5).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  const light = rate(27, { tx: 4.2, r: 0.5, mph: 17.5 }, 0.3);
  assert.ok(light.leaves.slice(0, 3).some(([k]) => /^(5|5-7|5-10|10|8-10|5-8)$/.test(k)), `a light hit leaves the 5 or the corner: ${light.leaves.slice(0, 3)}`);
  const high = rate(27, { tx: 1.2, r: 0.5, mph: 17.5 }, 0.3);
  assert.ok(high.leaves.slice(0, 3).some(([k]) => /^4(-|$)/.test(k)), `a high hit leaves the 4: ${high.leaves.slice(0, 3)}`);
  ok(`light (${light.leaves[0][0]}, ${light.leaves[1]?.[0]}) and high (${high.leaves[0][0]}, ${high.leaves[1]?.[0]}) leaves`);
  const brook = rate(36, { tx: -2.6, r: 0.5, mph: 17.5 }, 0.5);
  assert.ok(brook.strike > 0 && brook.strike < 0.8, `the Brooklyn side strikes ${brook.strike}`);
  ok(`the Brooklyn side (1-2): strikes ${(brook.strike * 100).toFixed(0)}%`);
  // a left-hander mirrors: the 1-2 pocket from the left
  const lefty = rate(27, { tx: -2.6, x0: -10, hand: -1, r: 0.5, mph: 17.5 }, 0.5);
  assert.ok(lefty.strike >= 0.5, `a lefty's pocket ${lefty.strike}`);
  ok(`a left hand into the 1-2: strikes ${(lefty.strike * 100).toFixed(0)}%`);

  // the hook: skid in the oil, hook and roll on the dry; more revs, more hook
  const st = S.newGame({ seed: 3 });
  const path = (r) => [100, 300, 480, 600, 720].map(y => S.ballAt(st, { x: 10, a: 0.004, mph: 17, r }, y));
  const p0 = path(0), p5 = path(0.5), p9 = path(0.9);
  const early = Math.abs(p5[1] - p0[1]), late = Math.abs((p5[4] - p0[4]) - (p5[2] - p0[2]));
  assert.ok(late > early * 2, `hooks late, not early (${early.toFixed(1)} in by 25 ft, ${late.toFixed(1)} in more on the backend)`);
  assert.ok(p9[4] < p5[4] && p5[4] < p0[4], "more revs, more hook (to the left, right-handed)");
  assert.ok(S.muAt(0, 100) < S.muAt(0, 600) && S.muAt(0, 300) < S.muAt(18, 300), "the oil: fresh heads, a dry backend, more grip outside the crown");
  ok(`the hook: ${early.toFixed(1)} in of movement by 25 ft, ${late.toFixed(1)} in more after the oil (skid, hook, roll)`);
  // a gutter ball; the bumpers
  const g = roll({ seed: 9, x0: 14, a: 0.03, r: 0, mph: 16 });
  assert.equal(g.n, 0); assert.ok(g.ev.includes("gutter"));
  const gb = roll({ seed: 9, x0: 14, a: 0.03, r: 0, mph: 16, bumpers: true });
  assert.ok(gb.n > 0 && gb.ev.includes("bumper") && !gb.ev.includes("gutter"), `bumpers: ${gb.n}`);
  ok(`a gutter ball scores 0; with the bumpers up the same ball takes ${gb.n}`);
  // heavier carries at least as well as lighter on the same line
  const h16 = rate(27, { tx: 2.6, r: 0.5, mph: 17.5, weight: 16 }, 1), h8 = rate(27, { tx: 2.6, r: 0.5, mph: 17.5, weight: 8 }, 1);
  assert.ok(h16.strike >= h8.strike, `16 lb ${h16.strike} vs 8 lb ${h8.strike}`);
  ok(`weight: a 16-pounder strikes ${(h16.strike * 100).toFixed(0)}%, an 8-pounder ${(h8.strike * 100).toFixed(0)}% on the same line`);
}

// ---- a whole game, logged ---------------------------------------------------------------------------------
function play(cfg, bot = 1) {
  const st = S.newGame(cfg), L = new S.Logger();
  let r = bot >>> 0;
  const rnd = () => { r = (Math.imul(r ^ (r >>> 15), 2246822507) + 0x6d2b79f5) >>> 0; return r / 4294967296; };
  let k = 0, plan = null;
  while (!st.over && k++ < 200000) {
    const p = st.players[st.cur];
    let mask = 0;
    if (p.kind === "human" && st.phase === "aim") {
      if (p.name === "KEYS") {
        // the three presses: wait, press, wait, press...
        if (!plan) plan = [20 + Math.floor(rnd() * 10), 40 + Math.floor(rnd() * 30), 30 + Math.floor(rnd() * 20), 20 + Math.floor(rnd() * 40)];
        if (st.phaseT === 5) { const e = { t: "set", x: 9, a: 0.008 }; L.event(e); S.act(st, e); }
        if (st.phaseT === plan[0]) mask = S.BTN.A;
      } else if (st.phaseT === 30) {
        const left = S.standing(st), fresh = left.length === 10;
        const tx = fresh ? 2.6 : st.pins.filter(q => q.st === 0).sort((a, b) => a.y - b.y)[0].x;
        const a = S.aimFor(st, 9, 17, fresh ? 0.45 : 0.1, tx, fresh ? S.HEAD_Y : st.pins.filter(q => q.st === 0).sort((a, b) => a.y - b.y)[0].y);
        const e = { t: "throw", x: 9, a: Math.round((a + (rnd() - 0.5) * 0.003) * 1e6) / 1e6, mph: 17, r: fresh ? 0.45 : 0.1 };
        L.event(e); S.act(st, e);
      }
    } else if (p.kind === "human" && st.phase === "meter" && p.name === "KEYS") {
      const m = st.meter, at = plan[m.stage];
      if (m.t === at) mask = S.BTN.A;
    }
    if (st.phase === "result") plan = null;
    L.tick(mask); S.step(st, mask);
  }
  return { st, rec: { cfg, inputLog: L.log, result: S.resultOf(st) } };
}
{
  const cfg = { v: S.VERSION, seed: 4242, fouls: true, players: [{ name: "BOT", kind: "human", weight: 15 }, { name: "KEYS", kind: "human", weight: 12 }, { kind: "cpu", key: "league-secretary", name: "THE LEAGUE SECRETARY", rating: 90 }, { kind: "cpu", key: "party-guest", name: "A BIRTHDAY PARTY GUEST", rating: 8, bumpers: true, weight: 8 }] };
  const a = play(cfg, 7);
  assert.ok(a.st.over, "the game ends");
  for (const p of a.st.players) assert.ok(SC.frames(p.balls).over, `${p.name} bowled ten frames`);
  const tot = a.rec.result.players.map(p => p.total);
  ok(`four bowlers to the end of the tenth: ${a.st.players.map((p, i) => `${p.name} ${tot[i]}`).join(", ")} (${a.st.t} ticks, log ${a.rec.inputLog.length} entries)`);
  assert.ok(tot[2] > tot[3], "the league secretary outbowls the party guest");
  const keys = a.st.players[1].balls;
  assert.ok(keys.length >= 11, "the keyboard bowler threw every ball by three presses");
  assert.ok(a.st.players[0].balls.some(b => b.n === 10), "the bot strikes at least once");
  // determinism
  const r1 = S.replay(a.rec), r2 = S.replay(JSON.parse(JSON.stringify(a.rec)));
  assert.deepEqual(r1, a.rec.result); assert.deepEqual(r2, a.rec.result);
  ok("the game replays from its log to the same sheet, twice, through JSON");
  const b = play({ ...cfg, seed: 4243 }, 7);
  assert.notDeepEqual(b.rec.result.players.map(p => p.balls), a.rec.result.players.map(p => p.balls)); ok("another seed, another game");
  const t = JSON.parse(JSON.stringify(a.rec));
  const i = t.inputLog.findIndex(e => e && e.t === "throw"); t.inputLog[i].mph += 3; t.inputLog[i].a += 0.01;
  assert.notDeepEqual(S.replay(t), a.rec.result); ok("a doctored log does not reproduce the claim");
  assert.throws(() => S.replay({ ...a.rec, cfg: { ...a.rec.cfg, v: S.VERSION + 1 } }), /version/); ok("another version is refused");
  // results shape
  const shape = RS.shapeOf(a.rec, true, { lane: 7, now: Date.UTC(2026, 9, 6, 12) });
  assert.equal(shape.game, "bowling"); assert.equal(shape.players.length, 4); assert.equal(shape.players[2].total, tot[2]);
  assert.ok(shape.players.every(p => p.marks.length === 10 && typeof p.strikes === "number")); assert.ok(shape.day > 600 && shape.verified);
  assert.equal(shape.high, Math.max(...tot));
  ok(`the results shape for the sports page: ${RS.resultLine(shape)}`);
}
// a foul: the red on the power meter, the pins set up again
{
  const st = S.newGame({ seed: 77, players: [{ name: "F", kind: "human" }] });
  S.act(st, { t: "throw", x: 8, a: S.aimFor(st, 8, 21, 0.4, 2.6, S.HEAD_Y), mph: 21, r: 0.4, foul: true });
  for (let k = 0; k < 3000 && st.phase !== "result"; k++) S.step(st, 0);
  assert.ok(st.lastRoll.foul && st.lastRoll.n === 0 && S.standing(st).length === 10, "a foul counts nothing and the rack is restored");
  const g = GE.throwOf({ dx: 0, v: 9, curl: 0, power: GE.powerOfFlick(9) }, { x: 0, aim: 0, weight: 14, hand: 1 });
  assert.ok(g.foul, "a flick far too hard charges the line");
  assert.ok(!GE.throwOf({ dx: 0, v: 1.2, curl: 0, power: GE.powerOfFlick(1.2) }, { x: 0, aim: 0, weight: 14, hand: 1 }).foul, "a firm flick does not");
  ok("a foul: F, 0, the pins put back; a flick far too hard fouls, a firm one does not");
}
// the flick: down then up past the press; curl at the end hooks
{
  const S0 = [{ x: 200, y: 300, t: 0 }, { x: 200, y: 330, t: 40 }, { x: 200, y: 360, t: 80 }, { x: 200, y: 300, t: 130 }, { x: 196, y: 250, t: 170 }, { x: 186, y: 200, t: 210 }];
  const f = GE.readFlick(S0, false);
  assert.equal(f.kind, "throw"); assert.ok(f.curl > 0.05, `curl ${f.curl}`);
  const th = GE.throwOf(f, { x: 5, aim: 0, weight: 14, hand: 1 });
  assert.ok(th.r > 0.3 && th.mph > 12 && th.mph < 23, JSON.stringify(th));
  assert.equal(GE.readFlick(S0.slice(0, 3), true).kind, "cancel");
  const sw = GE.createStickSwing(); let got = null;
  for (const y of [0, 0.5, 0.9, 0.95, 0.9, 0.4, -0.2, -0.6, -0.9]) got = sw.feed({ x: -0.5, y }) || got;
  assert.ok(got && got.power > 0.5 && got.curl > 0, `the stick's swing ${JSON.stringify(got)}`);
  ok("the flick and the right stick read as throws (speed, line, the curl's hook)");
}

// ---- a casual human on the keyboard's three presses (Scott, 2026-10-06: the sports games are too hard) ----
// Aims at the pocket (or the front pin) with a sloppy eye (about 1.5 boards), presses with ~+-100 ms of
// timing noise. EASY with the bumpers off should give a casual average of about 120-150.
function rng(seed) { let r = seed >>> 0; return () => { r = (Math.imul(r ^ (r >>> 15), 2246822507) + 0x6d2b79f5) >>> 0; return r / 4294967296; }; }
const gauss = (rnd) => (rnd() + rnd() + rnd() + rnd() - 2) * 1.73;
function casualGame(seed, { easy, bumpers, aimSd = 1.5, tSd = 4 }){
  const rnd=rng(seed*7+3);
  const cfg={v:S.VERSION,seed,fouls:true,easy,players:[{name:"B",kind:"human",weight:14,hand:1,bumpers}]};
  const st=S.newGame(cfg); let plan=null,k=0;
  while(!st.over&&k++<200000){
    let mask=0;
    if(st.phase==="aim"){
      if(st.phaseT===20){
        const left=S.standing(st),fresh=left.length===10;
        const pins=st.pins.filter(q=>q.st===0).sort((a,b)=>a.y-b.y||Math.abs(a.x)-Math.abs(b.x));
        const tx=(fresh||left.includes(1))?2.6:pins[0].x, ty=(fresh||left.includes(1))?S.HEAD_Y:pins[0].y;
        const x0=(fresh||left.includes(1))?10:Math.max(-14,Math.min(14,-tx*0.8));
        const a=S.aimFor(st,x0,S.speedOf(0.85,14),0.4,tx+gauss(rnd)*aimSd,ty,1);
        const e={t:"set",x:x0,a}; S.act(st,e);
        const sl=easy?1.5:1;
        plan=[null, Math.round(110*sl*0.85*0.5)+ Math.round(gauss(rnd)*tSd), Math.round(56*sl/4)+Math.round(gauss(rnd)*tSd), Math.round(80*sl*0.5/1.5*0.5)];
        plan[3]=Math.round(0.3*80*sl)+Math.round(gauss(rnd)*tSd);
        st._p=plan;
      }
      if(st.phaseT===30) mask=S.BTN.A;
    } else if(st.phase==="meter"){
      const m=st.meter; if(m.t===Math.max(3,st._p[m.stage])) mask=S.BTN.A;
    }
    st.prevMask; S.step(st,mask);
  }
  const B=st.players[0].balls;const G={};const fr=SC.frames(B).frames;for(const x of fr.slice(0,9)){G.fr=(G.fr||0)+1;if(x.marks[0]==='X')G.x=(G.x||0)+1;else{G.o=(G.o||0)+1;if(x.marks[1]==='/')G.sp=(G.sp||0)+1;}G.p1=(G.p1||0)+(x.balls[0]?x.balls[0].n:0);}return SC.frames(B).total;
}

const casualAvg = (o, N = 40) => { let t = 0; for (let i = 0; i < N; i++) t += casualGame(100 + i, o); return t / N; };
{
  const easy = casualAvg({ easy: true, bumpers: false }), hard = casualAvg({ easy: false, bumpers: false });
  assert.ok(easy >= 115 && easy <= 160, `a casual human on EASY averages ${easy.toFixed(0)} (115-160)`);
  assert.ok(hard < easy, `EASY helps: ${hard.toFixed(0)} without it, ${easy.toFixed(0)} with`);
  ok(`casual human (keyboard, +-100 ms): EASY averages ${easy.toFixed(0)}, standard ${hard.toFixed(0)}`);
  const sloppy = { aimSd: 10, tSd: 6 }, nb = casualAvg({ easy: true, bumpers: false, ...sloppy }), wb = casualAvg({ easy: true, bumpers: true, ...sloppy });
  assert.ok(wb > nb, `bumpers help a sloppy bowler: ${nb.toFixed(0)} -> ${wb.toFixed(0)}`);
  ok(`bumpers help a very sloppy casual: ${nb.toFixed(0)} -> ${wb.toFixed(0)}`);
}

// ---- the roster and the tile -----------------------------------------------------------------------------
{
  const keys = new Set(R.OPPONENTS.map(o => o.key));
  assert.equal(keys.size, R.OPPONENTS.length);
  for (const o of R.OPPONENTS) { assert.ok(o.rating >= 0 && o.rating <= 99); assert.ok(!o.lines && !o.say, `${o.key} is given no words`); }
  assert.ok(!/"[^"]+"/.test(R.OPPONENTS.map(o => o.why).join(" ")), "no one is quoted");
  const G = await import("../src/play/games.js"), I = await import("../src/play/gameIcons.js");
  const tile = G.GAMES.find(g => g.href === "#bowling");
  assert.ok(tile && I.ICONS[tile.icon] && I.ICONS.bowling.length === 12 && I.ICONS.bowling.every(r => r.length === 12));
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.ok(G.routesIn(app).includes("#bowling"), "App.jsx serves #bowling");
  ok("the roster (no words for anyone), the #play tile, its 12x12 icon, the route");
}
console.log(`check-bowl: ${n} checks passed`);
