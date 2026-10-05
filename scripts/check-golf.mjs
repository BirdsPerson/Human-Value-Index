// THE DEPARTMENT LINKS (src/play/golf/): the course and the round, headless.
//   course       eighteen holes from civicGeo GOLF, par 72 (36 + 36), every pin on its green, every
//                tee on its tee, the same course every time it is built
//   determinism  a scripted round (the bot's inputs) played twice gives the same log and the same
//                result; replaying the log alone gives the same result again, tick for tick
//   rules        a holed ball ends the hole; out of bounds costs a stroke and plays again from the
//                spot; water costs a stroke and drops the ball dry; score against par on the card
//   cpu          a stronger figure scores lower than a weaker one over a few rounds
//   the open     THE DEPARTMENT OPEN (holes/famous.js): eighteen famous holes, par 72, each with a
//                name, an after-credit, a note and a source; it builds the same every time; the bot
//                holes every hole on several seeds; a match on it replays tick for tick; the links
//                play exactly as before when a round names no course
// Run: node scripts/check-golf.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COURSE, PAR, OPEN, COURSES, parOf, surfaceAt } from "../src/play/golf/course.js";
import { FAMOUS } from "../src/play/golf/holes/famous.js";
import { newRound, step, autoplay, replay, cardOf, toParText, BTN, CLUBS, RISE_PUTT, PUTT_MAX, FRIC, holeOf, MAX_STROKES } from "../src/play/golf/sim.js";
import { GOLFERS } from "../src/play/golf/roster.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

// ---- the course
ok(COURSE.length === 18, "eighteen holes");
ok(PAR.front === 36 && PAR.back === 36, `par 36 + 36, got ${PAR.front} + ${PAR.back}`);
for (const h of COURSE) {
  ok(surfaceAt(h, h.pin.x, h.pin.y) === "green", `hole ${h.n}: the pin is on the green`);
  ok(surfaceAt(h, 0, 0) === "tee", `hole ${h.n}: the tee is the tee`);
  ok(h.par === 3 ? h.yards < 230 : h.par === 4 ? h.yards >= 300 && h.yards < 470 : h.yards >= 470, `hole ${h.n}: ${h.yards} yards fits par ${h.par}`);
}
const again = await import("../src/play/golf/course.js?again");
ok(JSON.stringify(again.COURSE) === JSON.stringify(COURSE), "the course builds the same every time");

// ---- determinism
const cfg = { seed: 0xdecaf, mode: "match", count: 9, start: 0, player: { name: "SUBJECT TEST" }, cpu: { slug: GOLFERS[4][0], name: GOLFERS[4][1], rating: GOLFERS[4][2] } };
const a = autoplay(cfg), b = autoplay(cfg);
ok(a.st.phase === "done" && b.st.phase === "done", "the scripted rounds finish");
ok(JSON.stringify(a.log) === JSON.stringify(b.log), "the same inputs, twice");
ok(JSON.stringify(a.st.result) === JSON.stringify(b.st.result), "the same result, twice");
const r = replay(cfg, a.log);
ok(JSON.stringify(r.result) === JSON.stringify(a.st.result) && r.tick === a.st.tick, "the log alone replays the round tick for tick");
ok(a.log.length < 4000, `the input log is compact (${a.log.length} numbers for nine holes)`);
const other = autoplay({ ...cfg, seed: 0xbeef });
ok(JSON.stringify(other.st.result) !== JSON.stringify(a.st.result), "another seed, another round (wind, the figure's errors)");

// ---- rules: drive the sim by hand
// A fresh round, sitting at a lie we choose: skip the intro, then place the ball.
function at(x, y, lie, hole = 0) {
  const st = newRound({ seed: 99, mode: "stroke", count: 18, start: 0, player: { name: "T" } });
  st.hi = hole;
  step(st, BTN.A); step(st, 0); step(st, 0);     // "intro" needs t > 10: tick a few
  while (st.phase === "intro") step(st, st.t > 12 && !(st.prev & BTN.A) ? BTN.A : 0);
  const P = st.players[0];
  Object.assign(P, { x, y, lie });
  return st;
}
// press A on the tick the meter reaches `p`, then on the red line (perfect accuracy)
function swing(st, aim, club, p) {
  st.aim = aim; st.club = club;
  while (st.phase === "aim") step(st, st.prev & BTN.A ? 0 : st.t > 7 ? BTN.A : 0);
  ok(st.phase === "meter", "A starts the meter");
  while (st.phase === "meter") {
    const m = st.meter;
    const want = m.stage === 1 ? (m.k + 1.5) / m.rise >= p : m.m - 1.5 / m.rise <= 0;
    step(st, want && !(st.prev & BTN.A) ? BTN.A : 0);
  }
  while (st.phase === "flight" || st.phase === "roll") step(st, 0);
  return st;
}
{ // a three-foot putt, straight at the cup, holes; the hole ends
  const h = COURSE[0];
  const st = at(h.pin.x, h.pin.y - 1, "green");
  st.players[0].strokes = 3;
  const v0 = Math.sqrt(2 * FRIC.green * 1.6);
  swing(st, Math.atan2(h.pin.x - st.players[0].x, h.pin.y - st.players[0].y), CLUBS.length - 1, (v0 * v0) / (2 * FRIC.green * PUTT_MAX));
  ok(st.players[0].holed, "a putt at the cup at the right pace drops");
  ok(st.players[0].strokes === 4, "and counts as a stroke");
  while (st.phase === "rest") step(st, 0);
  ok(st.phase === "holeEnd", "a holed ball ends the hole");
  ok(cardOf(st).rows[0].s[0] === 4 && cardOf(st).toPar[0] === 4 - h.par, `score v par: 4 on a par ${h.par} is ${toParText(4 - h.par)}`);
  ok(RISE_PUTT > 0);
}
{ // a driver hit straight out of bounds: one stroke, one penalty, back to the spot
  const h = COURSE[0];
  const st = at(0, 0, "tee");
  swing(st, Math.PI / 2, 0, 1);                  // ninety degrees right: over the trees and out
  const P = st.players[0];
  ok(/OUT OF BOUNDS/.test(st.msg), `the ball is out of bounds (${st.msg})`);
  ok(P.strokes === 2, "out of bounds: the stroke and a penalty stroke");
  ok(P.x === 0 && P.y === 0 && P.lie === "tee", "and the ball goes back where it was played");
  ok(holeOf(st) === h);
}
{ // water: find a hole with a pond, hit into it from just short, get a dry drop and a penalty
  const hi = COURSE.findIndex(h => h.water.length);
  const h = COURSE[hi], w = h.water[1];
  let found = null;
  for (let d = 30; d < 120 && !found; d += 5) for (let k = 0; k < 16 && !found; k++) {
    const a = (k / 16) * Math.PI * 2, x = w.x + Math.cos(a) * d, y = w.y + Math.sin(a) * d;
    if (["fairway", "rough"].includes(surfaceAt(h, x, y))) found = { x, y };
  }
  const st = at(found.x, found.y, surfaceAt(h, found.x, found.y), hi);
  const d = Math.hypot(w.x - found.x, w.y - found.y);
  let club = CLUBS.findIndex(c => !c.putt && c.carry * 0.82 < d * 1.6 && c.carry >= d) ; if (club < 0) club = 6;
  st.wind = { mph: 0, dir: 0, x: 0, y: 0 };
  const lf = st.players[0].lie === "rough" ? 0.82 : 1;
  swing(st, Math.atan2(w.x - found.x, w.y - found.y), club, Math.min(1, d / (CLUBS[club].carry * lf)));
  const P = st.players[0];
  if (/WATER/.test(st.msg)) {
    ok(P.strokes === 2, "water: the stroke and a penalty stroke");
    ok(!["water", "ob"].includes(surfaceAt(h, P.x, P.y)), "and a dry drop");
  } else ok(false, `the shot at the pond on hole ${h.n} found ${st.msg}`);
}

// ---- the CPU: rating means something
const avg = (rating) => { let t = 0; for (const seed of [1, 2, 3, 4]) t += autoplay({ ...cfg, seed, cpu: { name: "X", rating } }).st.result.total[1]; return t / 4; };
const strong = avg(97), weak = avg(20);
ok(strong < weak - 4, `a 97 beats a 20 over nine holes (${strong} v ${weak})`);
ok(GOLFERS.every(g => g[2] >= 0 && g[2] <= 99), "ratings 0..99");


// ---- THE DEPARTMENT OPEN
ok(OPEN.length === 18 && COURSES.open === OPEN && COURSES.links === COURSE, "the open: eighteen holes, both courses on file");
const op = parOf(OPEN);
ok(op.front + op.back === 72, `the open: par 72, got ${op.front} + ${op.back}`);
const srcText = readFileSync(new URL("../src/play/golf/holes/famous.js", import.meta.url), "utf8");
ok((srcText.match(/\/\/ source: https?:\/\//g) || []).length === FAMOUS.length, "the open: every hole names its source");
ok(new Set(FAMOUS.map(d => d.id)).size === FAMOUS.length, "the open: ids are unique");
for (const h of OPEN) {
  const d = FAMOUS[h.n - 1];
  ok(h.name && h.after && h.note && /NO\. \d+$/.test(h.after), `open ${h.n}: a name, an after-credit, a note`);
  ok(!/MASTERS|AMEN CORNER/.test(`${h.name} ${h.note}`), `open ${h.n}: no tournament marks in the name or note`);
  ok(h.yards === d.yards && Math.abs(h.pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - h.pts[i][0], p[1] - h.pts[i][1]), 0) - d.yards) < 0.6, `open ${h.n}: the centre line is ${d.yards} yards`);
  ok(surfaceAt(h, h.pin.x, h.pin.y) === "green", `open ${h.n}: the pin is on the green`);
  ok(surfaceAt(h, 0, 0) === "tee", `open ${h.n}: the tee is the tee`);
  ok(h.par === 3 ? h.yards < 250 : h.par === 4 ? h.yards >= 300 && h.yards < 530 : h.yards >= 480, `open ${h.n}: ${h.yards} yards fits par ${h.par}`);
}
ok(surfaceAt(OPEN[14], OPEN[14].green.x, OPEN[14].green.y - OPEN[14].green.r - 12) === "water", "the island green: water short of it");
ok(surfaceAt(OPEN[14], OPEN[14].green.x + OPEN[14].green.r + 12, OPEN[14].green.y) === "water", "the island green: water beside it");
const again2 = await import("../src/play/golf/course.js?again2");
ok(JSON.stringify(again2.OPEN) === JSON.stringify(OPEN), "the open builds the same every time");
// the bot holes every hole, on several seeds (wind changes), never picking up
const worst = OPEN.map(() => 0);
for (const seed of [3, 17, 2024, 0xfeed]) {
  const { st } = autoplay({ seed, course: "open", mode: "stroke", count: 18, start: 0, player: { name: "BOT" } });
  ok(st.phase === "done" && st.result.holes.length === 18, `the open: the bot finishes eighteen (seed ${seed})`);
  st.result.holes.forEach((r, i) => { worst[i] = Math.max(worst[i], r.s[0]); });
}
OPEN.forEach((h, i) => ok(worst[i] < MAX_STROKES && worst[i] <= h.par + 3, `open ${h.n} ${h.id}: holeable by the bot (worst ${worst[i]} on par ${h.par})`));
// a match on the open: twice the same, and the log replays it
const ocfg = { ...cfg, course: "open", count: 18 };
const oa = autoplay(ocfg), ob = autoplay(ocfg);
ok(JSON.stringify(oa.log) === JSON.stringify(ob.log) && JSON.stringify(oa.st.result) === JSON.stringify(ob.st.result), "the open: the same inputs and result, twice");
const orp = replay(ocfg, oa.log);
ok(JSON.stringify(orp.result) === JSON.stringify(oa.st.result) && orp.tick === oa.st.tick, "the open: the log alone replays the round tick for tick");
ok(JSON.stringify(oa.st.result) !== JSON.stringify(a.st.result), "the open is another course");
// a round that names no course is the links, exactly
const la = autoplay({ ...cfg, course: "links" });
ok(JSON.stringify(la.st.result) === JSON.stringify(a.st.result) && JSON.stringify(la.log) === JSON.stringify(a.log), "no course named: the links, tick for tick");
ok(replay({ ...cfg }, a.log).tick === a.st.tick, "old links rounds (no course in cfg) still replay");
// EASY SWING: off is the round exactly; on replays from its own log, and is kept in the record's cfg
const fa = autoplay({ ...cfg, easy: false });
ok(JSON.stringify(fa.st.result) === JSON.stringify(a.st.result) && JSON.stringify(fa.log) === JSON.stringify(a.log), "easy: false is the round, tick for tick");
const ea = autoplay({ ...cfg, easy: true }), erp = replay({ ...cfg, easy: true }, ea.log);
ok(ea.st.phase === "done" && ea.st.cfg.easy === true && !a.st.cfg.easy, "an easy round finishes and says so in its cfg");
ok(JSON.stringify(erp.result) === JSON.stringify(ea.st.result) && erp.tick === ea.st.tick, "an easy round replays tick for tick");

console.log(`check-golf: ${n} checks passed. 9 holes by the bot: ${a.st.result.total[0]} (${toParText(a.st.result.toPar[0])}); ${cfg.cpu.name}: ${a.st.result.total[1]}. The open, 18 by the bot: ${oa.st.result.total[0]} (${toParText(oa.st.result.toPar[0])}).`);
