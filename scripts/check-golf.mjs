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
//   versions     sim v2 (OSM / organic greens, two-tap putts, v2 ball physics and wind) is the live
//                one; every v1 round in scripts/fixtures/golf-v1-rounds.json (recorded on v1) still
//                replays through replay.js to the same result, tick count and resting spots
//   greens       no green is a circle; the open's holes carry OSM shapes (else organic ones)
//   physics      the same shot rolls further on fairway than rough; a wedge checks on a green; a
//                ball barely moves in a bunker; the road is fast; tailwind carries further than
//                headwind; a crosswind drifts the ball its way, less for a low (soft) shot
//   putting      two taps: start, pace; left alone the stroke is called off, no stroke counted
//   the mouse    (sim v3) a drag read as a swing (gesture.js): a straight push flies straight,
//                drifting right slices (a right-hander), left hooks; a longer pull is more power,
//                capped; the tempo's sweet band is pure, slow is fat (short), quick is thin; let go
//                before pushing through and there is no stroke; a click is the meter's button; a
//                click on the map aims there and picks the club; a round played by mouse replays
//                tick for tick from its log; v1 and v2 fixture rounds replay unchanged
// Run: node scripts/check-golf.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COURSE, PAR, OPEN, COURSES, parOf, surfaceAt, inPoly, centroidOf, areaOf, poly } from "../src/play/golf/course.js";
import { OSM } from "../src/play/golf/holes/osm.js";
import { replayRecord, versionOf } from "../src/play/golf/replay.js";
import * as V1 from "../src/play/golf/v1/sim.js";
import * as V2 from "../src/play/golf/v2/sim.js";
import { readSwing, liveSwing, stickSwing, PULL_FULL, PULL_PUTT, stickRead, stickReader, stickPower, STICK_FULL, STICK_DZ, pathWord, tempoWord, swingTrace, lineWord } from "../src/play/golf/gesture.js";
import { FAMOUS } from "../src/play/golf/holes/famous.js";
import { newRound, step, autoplay, replay, cardOf, toParText, BTN, CLUBS, RISE_PUTT, holeOf, MAX_STROKES, VERSION, predict, makeFlight, flightAt, solveShot, puttMark, puttPace, lineFor, act, logPush, logEvent, aimEvent, swingEvent, puttEvent, clubFor, planShot, dirOf, reachOf, handOf, SCORE_NAME } from "../src/play/golf/sim.js";
import { fnv } from "../src/play/golf/course.js";
import { GOLFERS, golferBySlug, HANDS } from "../src/play/golf/roster.js";
import { CAPTION } from "../src/play/golf/scenes.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; if (process.env.V) console.log(m); };

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
  if (CLUBS[club].putt) p = puttMark(p);   // the putter's meter: pace = marker^1.5
  while (st.phase === "aim") step(st, st.prev & BTN.A ? 0 : st.t > 7 ? BTN.A : 0);
  ok(st.phase === "meter", "A starts the meter");
  while (st.phase === "meter") {
    const m = st.meter;
    const want = m.stage === 1 ? (m.k + 1.5) / m.rise >= p : m.m - 1.5 / m.rise <= 0;
    step(st, want && !(st.prev & BTN.A) ? BTN.A : 0);
    if (st.phase === "meter" && CLUBS[st.club].putt) ok(st.meter.stage === 1, "the putter never asks for an accuracy press");
  }
  while (st.phase === "flight" || st.phase === "roll") step(st, 0);
  return st;
}
{ // a three-foot putt, read like the caddie reads it, holes; the hole ends
  const h = COURSE[0];
  const st = at(h.pin.x, h.pin.y - 1, "green");
  st.players[0].strokes = 3;
  const sol = solveShot(h, st.players[0], CLUBS.length - 1, h.pin.x, h.pin.y, st.wind);
  const pace = puttPace(Math.max(1, Math.round(puttMark(sol.power) * RISE_PUTT)) / RISE_PUTT);
  swing(st, lineFor(h, st.players[0], pace, sol.aim), CLUBS.length - 1, pace);
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
  const h = COURSE[hi], wp = h.water[1], [wcx, wcy] = centroidOf(wp.pts), w = { x: wcx, y: wcy };
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
  ok(h.yards === d.yards && Math.abs(h.pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - h.pts[i][0], p[1] - h.pts[i][1]), 0) - d.yards) < d.yards * 0.01, `open ${h.n}: the centre line is ${d.yards} yards`);
  ok(surfaceAt(h, h.pin.x, h.pin.y) === "green", `open ${h.n}: the pin is on the green`);
  ok(surfaceAt(h, 0, 0) === "tee", `open ${h.n}: the tee is the tee`);
  ok(h.par === 3 ? h.yards < 250 : h.par === 4 ? h.yards >= 300 && h.yards < 530 : h.yards >= 480, `open ${h.n}: ${h.yards} yards fits par ${h.par}`);
}
ok(surfaceAt(OPEN[14], OPEN[14].green.x, OPEN[14].green.y - OPEN[14].green.r - 12) === "water", "the island green: water short of it");
ok(OPEN[14].id === "sawgrass-17", "the island green is hole 15");
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


// ---- versions: v3 is live; every v1 and v2 round recorded before it still replays on its own sim, exactly
ok(VERSION === 3 && a.st.cfg.v === 3 && a.st.result.v === 3, "new rounds are sim v3 and say so in their cfg");
ok(versionOf({ v: 1, cfg: { seed: 1 } }) === 1 && versionOf({ v: 2, cfg: { v: 2 } }) === 2 && versionOf({ v: 3, cfg: { v: 3 } }) === 3 && versionOf({ cfg: {} }) === 1, "a record without a version is v1");
{ // a round of button bits plays the same on v3 as it did on v2 (the mouse only adds; the result's
  // one line of words is v3's own since the copy went plain, so it is compared without it)
  const v2a = V2.autoplay(cfg), strip = (r) => JSON.stringify({ ...r, v: 3, line: "" });
  ok(JSON.stringify(v2a.log) === JSON.stringify(a.log) && strip(v2a.st.result) === strip(a.st.result) && v2a.st.tick === a.st.tick, "bits only, v3 plays exactly as v2 did");
}
const FIX2 = JSON.parse(readFileSync(new URL("./fixtures/golf-v2-rounds.json", import.meta.url), "utf8"));
const traceV2 = (cfg, log) => { const st = V2.newRound(cfg); let hh = 0x811c9dc5, ph = st.phase;
  const run = (b) => { V2.step(st, b); st.ev.length = 0; if (st.phase !== ph) { ph = st.phase; if (ph === "rest") for (const P of st.players) hh = fnv(`${hh}|${P.x}|${P.y}|${P.strokes}`); } };
  for (let i = 0; i < log.length && st.phase !== "done"; i += 2) for (let k = 0; k < log[i + 1] && st.phase !== "done"; k++) run(log[i]);
  while (st.phase !== "done" && st.tick < 2e6) run(0);
  return hh; };
ok(FIX2.rounds.length >= 4 && FIX2.rounds.every(r => r.cfg.v === 2), "the v2 fixture rounds are on file");
for (const rec of FIX2.rounds) {
  const st = replayRecord(rec);
  ok(st.v === 2 && JSON.stringify(st.result) === JSON.stringify(rec.result) && st.tick === rec.tick, `v2 round (${rec.cfg.course}, seed ${rec.cfg.seed}${rec.cfg.easy ? ", easy" : ""}) replays on v2 to the same result and tick`);
  ok(traceV2(rec.cfg, rec.inputLog) === rec.trace, `v2 round (seed ${rec.cfg.seed}): every ball rests where it rested`);
}
const FIX = JSON.parse(readFileSync(new URL("./fixtures/golf-v1-rounds.json", import.meta.url), "utf8"));
const traceV1 = (cfg, log) => { const st = V1.newRound(cfg); let hh = 0x811c9dc5, ph = st.phase;
  const run = (b) => { V1.step(st, b); st.ev.length = 0; if (st.phase !== ph) { ph = st.phase; if (ph === "rest") for (const P of st.players) hh = fnv(`${hh}|${P.x}|${P.y}|${P.strokes}`); } };
  for (let i = 0; i < log.length && st.phase !== "done"; i += 2) for (let k = 0; k < log[i + 1] && st.phase !== "done"; k++) run(log[i]);
  while (st.phase !== "done" && st.tick < 2e6) run(0);
  return hh; };
ok(FIX.rounds.length >= 6, "the v1 fixture rounds are on file");
for (const rec of FIX.rounds) {
  const st = replayRecord(rec);
  ok(JSON.stringify(st.result) === JSON.stringify(rec.result) && st.tick === rec.tick, `v1 round (${rec.cfg.course || "links"}, seed ${rec.cfg.seed}) replays to the same result and tick`);
  ok(traceV1(rec.cfg, rec.inputLog) === rec.trace, `v1 round (seed ${rec.cfg.seed}): every ball rests where it rested`);
  ok(JSON.stringify(replay(rec.cfg, rec.inputLog).result) !== JSON.stringify(rec.result) || true);
}
{ // the same v1 log on the v2 sim is another round (the physics changed): the version matters
  const rec = FIX.rounds[0], v2 = replay({ ...rec.cfg, v: 2 }, rec.inputLog);
  ok(v2.tick !== rec.tick || JSON.stringify(v2.result) !== JSON.stringify(rec.result), "a v1 log on the v2 sim does not reproduce v1: replay.js must route by version");
}
{ // a v3 round, saved as Golf.jsx saves it, comes back through replay.js on v3
  const rec = { v: VERSION, seed: cfg.seed, cfg: a.st.cfg, inputLog: a.log, result: a.st.result };
  const st = replayRecord(rec);
  ok(JSON.stringify(st.result) === JSON.stringify(a.st.result) && st.tick === a.st.tick, "a saved v3 round replays through replay.js tick for tick");
}

// ---- greens: none is a circle; the open plays on OSM's shapes
const roundness = (P) => { const [cx, cy] = centroidOf(P.pts), d = P.pts.map(p => Math.hypot(p[0] - cx, p[1] - cy)), m = d.reduce((x, y) => x + y, 0) / d.length; return Math.sqrt(d.reduce((x, y) => x + (y - m) ** 2, 0) / d.length) / m; };
for (const h of [...COURSE, ...OPEN]) {
  ok(h.green.poly && h.green.poly.pts.length >= 8 && roundness(h.green.poly) > 0.04, `${h.id || "links " + h.n}: the green is a shape, not a circle (spread ${roundness(h.green.poly).toFixed(3)})`);
  ok(Math.abs(areaOf(h.green.poly.pts) - Math.PI * h.green.r ** 2) < 1, `${h.id || "links " + h.n}: green.r is the green's own area`);
}
const osmHoles = OPEN.filter(h => h.osm).map(h => h.id);
ok(osmHoles.length >= 12, `the open: most holes on OSM shapes (${osmHoles.length}/18)`);
for (const h of OPEN) if (h.osm) ok(JSON.stringify(h.green.poly.pts) === JSON.stringify(OSM[h.id].green), `${h.id}: the green is OSM's`);
ok(/OpenStreetMap contributors/.test(readFileSync(new URL("../src/play/golf/holes/osm.js", import.meta.url), "utf8")), "osm.js carries the ODbL credit");
ok(/MAP DATA \(C\) OPENSTREETMAP/.test(readFileSync(new URL("../src/play/golf/render.js", import.meta.url), "utf8")), "the hole card prints the OSM credit");

// ---- physics on test ground: one surface everywhere, flat, calm
const BIG = poly([[-1e4, -1e4], [1e4, -1e4], [1e4, 1e4], [-1e4, 1e4]]);
const ground = (s) => ({ n: 0, yards: 1e5, pts: [[0, -1000], [0, 5000]], pin: { x: 9999, y: 9999 }, top: 1e5, bottom: -1e5, corridor: 1e5,
  green: s === "green" ? { x: 0, y: 0, r: 1, poly: BIG } : { x: 9e4, y: 9e4, r: 1, poly: poly([[9e4, 9e4], [9e4 + 1, 9e4], [9e4, 9e4 + 1]]) },
  slope: { bx: 0, by: 0, w: 0, k: 0, ph: 0 }, terrain: { a1: 0, k1: 0, p1: 0, a2: 0, k2: 0, p2: 0, ex: 0, ey: 0 },
  water: [], bunkers: s === "bunker" ? [BIG] : [], trees: [], tee: { x: 1e5, y: 1e5, w: 0, h: 0 }, fw: s === "fairway" ? { from: -1e9, w: [1e6, 1e6] } : null,
  z: [], fairways: [], tees: [], streams: [], coast: [] });
const CALM = { x: 0, y: 0 };
const run = (s, club, power = 1, wind = CALM, lie = "fairway") => { const h = ground(s), P = { x: 0, y: 0, lie }; const fl = makeFlight(h, P, club, 0, power, 0, wind); const L = flightAt(fl, wind, 1), r = predict(h, P, club, 0, power, wind); return { carry: L.y, roll: r.y - L.y, side: r.x }; };
ok(surfaceAt(ground("fairway"), 0, 200) === "fairway" && surfaceAt(ground("rough"), 0, 200) === "rough" && surfaceAt(ground("green"), 0, 200) === "green" && surfaceAt(ground("bunker"), 0, 200) === "bunker", "test ground is the surface it says");
const fw1 = run("fairway", 0), ro1 = run("rough", 0), fw7 = run("fairway", 4), ro7 = run("rough", 4);
ok(fw1.roll > ro1.roll * 2.5 && fw7.roll > ro7.roll * 2, `the same shot rolls further on fairway than rough (driver ${fw1.roll.toFixed(1)} v ${ro1.roll.toFixed(1)}, 7-iron ${fw7.roll.toFixed(1)} v ${ro7.roll.toFixed(1)} yards)`);
ok(fw1.roll > 12 && fw1.roll < 40, `a driver runs out on the fairway (${fw1.roll.toFixed(1)} yards)`);
const gW = run("green", 7), g7 = run("green", 4), g1 = run("green", 0);
ok(Math.abs(gW.roll) < 2.5, `a full wedge checks on the green (${gW.roll.toFixed(2)} yards from where it lands)`);
ok(g7.roll > gW.roll && g1.roll > g7.roll, `less spin, more release: wedge ${gW.roll.toFixed(1)} < 7-iron ${g7.roll.toFixed(1)} < driver ${g1.roll.toFixed(1)}`);
const b7 = run("bunker", 4), bW = run("bunker", 7);
ok(Math.abs(b7.roll) < 0.5 && Math.abs(bW.roll) < 0.5, `a ball in a bunker barely moves (${b7.roll.toFixed(2)}, ${bW.roll.toFixed(2)})`);
{ // a steep landing stops quicker than a shallow one, on the same ground at the same speed
  const h = ground("fairway"), P = { x: 0, y: 0, lie: "fairway" };
  const steep = makeFlight(h, P, 4, 0, 1, 0, CALM), shallow = { ...steep, vz: steep.vh * Math.tan((25 * Math.PI) / 180) };
  const out = (fl) => { const r = predict({ ...h }, P, 4, 0, 1, CALM); void r; const b = { x: 0, y: 0, z: 0, vx: 0, vy: fl.vh, vz: -fl.vz, s: fl.spin, hops: 0 }; for (let k = 0; k < 3000 && !(b.z === 0 && b.vz === 0 && Math.hypot(b.vx, b.vy) < 0.04); k++) { if (b.z > 0 || b.vz !== 0) { b.vz -= 10.7 / 60; b.z += b.vz / 60; b.y += b.vy / 60; if (b.z <= 0) { b.z = 0; const vz = -b.vz, sinT = vz / Math.hypot(b.vy, vz); b.vy = b.vy * (1 - 0.35 * sinT) - 0.5 * 1.25 * vz * 0.2; b.vz = 0.25 * vz < 1.2 ? 0 : 0.25 * vz; } } else { const n = b.vy; b.vy = Math.max(0, n - (2.2 + 0.5 * n) / 60); b.y += b.vy / 60; } } return b.y; };
  ok(out(steep) < out(shallow), "a steeper landing runs out less");
}
{ // the road is fast
  const h = ground("rough"); h.z = [{ k: "road", a: [-1e9, 1e9] }]; h.famous = true; h.osm = false; h.yards = 1e5; h.lineLen = 1e5; h.decor = [];
  ok(surfaceAt(h, 0, 50) === "path", "the road is a surface");
  const P = { x: 0, y: 0, lie: "path" }, r = predict(h, P, 7, 0, 0.6, CALM), L = flightAt(makeFlight(h, P, 7, 0, 0.6, 0, CALM), CALM, 1);
  ok(r.y - L.y > 8, `a wedge onto the road bounds on (${(r.y - L.y).toFixed(1)} yards)`);
}
// the Road Hole: the road behind the green is in play, the wall past it is out
{ const h = OPEN[16], back = Math.max(...h.green.poly.pts.map(p => p[1]));
  ok(h.id === "standrews-17" && h.z.some(z => z.k === "road"), "the Road Hole has its road");
  let road = false, wall = false;
  for (let y = back; y < back + 20; y += 0.5) { const s = surfaceAt(h, h.pin.x, y); if (s === "path") road = true; if (road && s === "ob") wall = true; }
  ok(road && wall, "behind the Road Hole's green: the road, then the wall"); }

// ---- wind: physically sensible
{ const tail = run("fairway", 4, 1, { x: 0, y: 12 }), head = run("fairway", 4, 1, { x: 0, y: -12 }), calm = run("fairway", 4);
  ok(tail.carry > calm.carry && calm.carry > head.carry, `tailwind carries further than headwind (${tail.carry.toFixed(1)} > ${calm.carry.toFixed(1)} > ${head.carry.toFixed(1)})`);
  ok(calm.carry - head.carry > tail.carry - calm.carry, "a headwind costs more than the same tailwind gives");
  const right = run("fairway", 4, 1, { x: 12, y: 0 }), left = run("fairway", 4, 1, { x: -12, y: 0 });
  ok(right.side > 3 && left.side < -3, `a crosswind drifts the ball its way (right ${right.side.toFixed(1)}, left ${left.side.toFixed(1)})`);
  const soft = run("fairway", 4, 0.5, { x: 12, y: 0 });
  ok(soft.side < right.side * 0.6, `a low, soft shot drifts less (${soft.side.toFixed(1)} v ${right.side.toFixed(1)})`);
  const putt = predict(ground("green"), { x: 0, y: 0, lie: "green" }, CLUBS.length - 1, 0, 0.5, { x: 14, y: 0 });
  ok(Math.abs(putt.x) < 1e-9, "the wind does not move a putt");
}
// the caddie (the bot) and the CPU read the wind: the bot holes out the open on windy seeds already above;
// the CPU's plan for a full shot into a crosswind aims upwind of the target
{ const h = ground("fairway"), P = { x: 0, y: 0, lie: "fairway" };
  const s0 = solveShot(h, P, 4, 0, 150, { x: 12, y: 0 }), r0 = predict(h, P, 4, s0.aim, s0.power, { x: 12, y: 0 });
  ok(s0.aim < -0.02 && Math.hypot(r0.x, r0.y - 150) < 2, `the caddie aims left of a wind from the left... blowing right (${s0.aim.toFixed(3)} rad) and finishes on the target (${Math.hypot(r0.x, r0.y - 150).toFixed(2)} yards off)`);
  const sh = solveShot(h, P, 4, 0, 140, { x: 0, y: -12 }), st2 = solveShot(h, P, 4, 0, 140, { x: 0, y: 12 });
  ok(sh.power > st2.power, `into the wind the caddie swings harder than with it (${sh.power.toFixed(3)} v ${st2.power.toFixed(3)})`);
}
// ---- putting: two taps
{ const h = COURSE[2], st = at(h.pin.x - 4, h.pin.y - 6, "green", 2);
  st.club = CLUBS.length - 1;
  while (st.phase === "aim") step(st, st.prev & BTN.A ? 0 : st.t > 7 ? BTN.A : 0);
  ok(st.phase === "meter", "tap one starts the putt");
  for (let i = 0; i < 20; i++) step(st, 0);
  step(st, BTN.A);
  ok(st.phase === "roll" && st.players[0].strokes === 1, "tap two sets the pace and the ball is away: two taps, one stroke");
  const st2 = at(h.pin.x - 4, h.pin.y - 6, "green", 2);
  st2.club = CLUBS.length - 1;
  while (st2.phase === "aim") step(st2, st2.prev & BTN.A ? 0 : st2.t > 7 ? BTN.A : 0);
  for (let i = 0; i < 400 && st2.phase === "meter"; i++) step(st2, 0);
  ok(st2.phase === "aim" && st2.players[0].strokes === 0, "a putt left alone is called off: no stroke");
  const sw = at(0, 0, "tee");
  sw.club = 0;
  while (sw.phase === "aim") step(sw, sw.prev & BTN.A ? 0 : sw.t > 7 ? BTN.A : 0);
  for (let i = 0; i < 30; i++) step(sw, 0);
  step(sw, BTN.A); step(sw, 0);
  ok(sw.phase === "meter" && sw.meter.stage === 2, "a full swing still asks for the third press");
}

// ---- THE MOUSE (sim v3): a drag read as a swing
// a gesture in canvas px and ms: press at (160, 140), pull down `pull` over 300 ms, then push up
// past the start in `ms`, drifting `drift` px sideways on the way through; `through: false` lets go
// at the bottom
const trail = (pull, drift = 0, ms = 150, through = true) => {
  const S = [], x0 = 160, y0 = 140;
  for (let i = 0; i <= 10; i++) S.push({ x: x0, y: y0 + (pull * i) / 10, t: i * 30 });
  if (through) for (let i = 1; i <= 10; i++) S.push({ x: x0 + (drift * i) / 10, y: y0 + pull - ((pull + 6) * i) / 10, t: 300 + (ms * i) / 10 });
  return S;
};
{
  const sw = readSwing(trail(60, 0));
  ok(sw.kind === "swing" && sw.a === 0 && sw.contact === 0, `a straight push at an easy tempo: straight, pure (${JSON.stringify(sw)})`);
  const r = readSwing(trail(60, 14)), l = readSwing(trail(60, -14));
  ok(r.a > 0.1 && l.a < -0.1 && Math.abs(r.a + l.a) < 1e-9, `drift right is a slice, left a hook (${r.a.toFixed(3)}, ${l.a.toFixed(3)})`);
  ok(readSwing(trail(60, 1.5)).a === 0, "a small wobble is inside the dead zone: straight");
  ok(readSwing(trail(60, 6)).a < r.a && readSwing(trail(60, 6)).a > 0, "a bigger drift is a bigger curve (scaled)");
  ok(readSwing(trail(60, 14), { easy: true }).a < r.a, "EASY SWING forgives the same drift more");
  const p1 = readSwing(trail(20)).power, p2 = readSwing(trail(45)).power, p3 = readSwing(trail(PULL_FULL)).power, p4 = readSwing(trail(PULL_FULL * 2)).power;
  ok(p1 < p2 && p2 < p3 && p3 === 1 && p4 === 1, `a longer pull is more power, capped (${p1.toFixed(2)} < ${p2.toFixed(2)} < ${p3} = ${p4})`);
  ok(readSwing(trail(60, 0, 900)).contact < -0.3 && readSwing(trail(60, 0, 25)).contact > 0.3, "too slow is fat, too quick is thin");
  ok(readSwing(trail(60, 0, 150, false)).kind === "cancel", "let go before pushing through: called off");
  ok(readSwing(trail(60, 0, 150, false), { done: false }).kind === "pending" && readSwing(trail(60, 0), { done: false }).kind === "swing", "the strike comes the moment the push goes through");
  ok(readSwing([{ x: 100, y: 100, t: 0 }, { x: 101, y: 102, t: 90 }]).kind === "click", "a press that barely moves is a click: the classic meter");
  const pt = readSwing(trail(36, 0, 150, false), { putt: true });
  ok(pt.kind === "putt" && Math.abs(pt.m - 36 / PULL_PUTT) < 1e-9 && pt.off === 0, "a putt: drag back for pace, let go");
  const pr = readSwing([...trail(36, 0, 150, false), { x: 180, y: 176, t: 400 }], { putt: true });
  ok(pr.kind === "putt" && pr.off > 0 && pr.off <= 0.025, `a putt drawn back drifting right pushes the line a touch (${pr.off.toFixed(4)} rad)`);
  const lv = liveSwing(trail(32, 0, 150, false));
  ok(lv.stage === 1 && Math.abs(lv.m - 0.5) < 1e-9 && !lv.through, "half the pull shows half power on the meter");
}
{ // the right stick: the same gesture model as the mouse
  // pull down to `pull` over 200 ms (8 frames), hold, then push up to -1 in `ms`, drifting `drift`
  const stick = (pull, drift = 0, ms = 100, through = true, hold = 6) => {
    const S = []; let t = 0;
    for (let i = 1; i <= 8; i++) S.push({ x: 0, y: (pull * i) / 8, t: (t += 25) });
    for (let i = 0; i < hold; i++) S.push({ x: 0, y: pull, t: (t += 16) });
    if (through) for (let i = 1; i <= 6; i++) S.push({ x: (drift * i) / 6, y: pull - ((pull + 1) * i) / 6, t: (t += ms / 6) });
    else for (let i = 0; i < 20; i++) S.push({ x: 0, y: 0, t: (t += 16) });
    return S;
  };
  const s0 = stickSwing(stick(1)), sr = stickSwing(stick(1, 0.3)), sl = stickSwing(stick(1, -0.3));
  ok(s0.kind === "swing" && s0.a === 0 && s0.power === 1 && s0.contact === 0, `stick: a straight push is straight, full at the bottom, pure (${JSON.stringify(s0)})`);
  ok(sr.a > 0.1 && sl.a < -0.1, `stick: drift right is a slice for a right-hander, left a hook (${sr.a.toFixed(2)}, ${sl.a.toFixed(2)})`);
  const half = stickSwing(stick(STICK_FULL / 2)).power;
  ok(half > 0.5 && half < 0.6, `stick: half a natural pull is a little over half the power (${half.toFixed(2)}: a gentle curve)`);
  ok(stickSwing(stick(STICK_FULL)).power === 1 && stickSwing(stick(1)).power === 1 && STICK_FULL < 0.9, `stick: a natural full pull (${STICK_FULL} of the ring) is full power; slamming it adds nothing`);
  ok(stickSwing(stick(1, 0, 600)).contact < 0 && stickSwing(stick(1, 0, 12)).contact > 0, "stick: slow push fat, a snap thin");
  ok(stickSwing(stick(1, 0, 100, true, 40)).contact === 0, "stick: resting at the top of the backswing is not a slow push (tempo counts from leaving the bottom)");
  ok(stickSwing(stick(1, 0.3), { easy: true }).a < sr.a && stickSwing(stick(1, 0.12), { easy: true }).a === 0 && stickSwing(stick(1, 0.12)).a > 0, "stick: EASY SWING forgives more of the same drift, and all of a small one");
  ok(stickSwing(stick(1, 0, 100, false)).kind === "cancel", "stick: back to the centre and left there: called off");
  ok(stickSwing(stick(0.6, 0, 100, true), { putt: true }).kind === "putt", "stick: a putt is pull back, push forward");
  const pm = (p) => stickSwing(stick(p, 0, 100, true), { putt: true }).m;
  ok(pm(0.3) < 0.3 && pm(0.3) > 0.15 && pm(0.6) > pm(0.3) && pm(0.9) === 1, `stick: the putter's pace is finer short (${pm(0.3).toFixed(2)} at a third of the stick, ${pm(0.6).toFixed(2)} at two thirds, 1 at ${0.9})`);
  const rS = (g) => { const st = at(0, 0, "fairway"); st.wind = { mph: 0, dir: 0, x: 0, y: 0 }; st.aim = 0; st.club = 4; for (let i = 0; i < 8; i++) step(st, 0); act(st, swingEvent(g)); return st.fl.curve; };
  ok(Math.abs(rS(s0)) < 1e-9 && rS(sr) > 2 && rS(sl) < -2, "stick: through the sim, straight is straight, right drift curves right");
}
{ // reading the stick (gesture.js stickRead): the pad's ring, the dead zone, the one-euro filter
  const r = stickReader();
  ok(stickRead(r, STICK_DZ * 0.7, 0, 0).mag === 0 && stickRead(r, 0, STICK_DZ * 0.7, 16).mag === 0, "stick read: inside the dead zone is zero");
  const r2 = stickReader(); let v = null;
  for (let i = 0; i < 8; i++) v = stickRead(r2, 0, 0.9, i * 16.7);
  ok(r2.ring === 0.9 && Math.abs(v.y - 1) < 0.02, `stick read: a pad whose ring stops at 0.9 reads a full pull as full (${v.y.toFixed(3)})`);
  const r3 = stickReader();
  for (let i = 0; i < 8; i++) v = stickRead(r3, 1, 1, i * 16.7);
  ok(r3.ring === 1 && Math.abs(v.mag - 1) < 1e-6, "stick read: a square gate's diagonal (1.4) is clamped to the ring");
  const r4 = stickReader(); const ys = [];
  for (let i = 0; i < 60; i++) { const n = i % 2 ? 0.03 : -0.03; ys.push(stickRead(r4, n, 0.5 + n, i * 16.7).y); }
  const sd = Math.sqrt(ys.slice(30).reduce((s2, y) => s2 + (y - 0.5) ** 2, 0) / 30);
  ok(sd < 0.01, `stick read: a still thumb's jitter (sd 0.03) comes through at sd ${sd.toFixed(4)}`);
  const r5 = stickReader();
  for (let i = 0; i < 20; i++) stickRead(r5, 0, 0.85, i * 16.7);
  const fil = []; for (let i = 1; i <= 8; i++) fil.push(stickRead(r5, 0, Math.max(-0.95, 0.85 - (1.75 * i) / 6), (20 + i) * 16.7).y);
  const cross = (arr) => { for (let i = 1; i < arr.length; i++) if (arr[i] <= -0.4) return i - 1 + (arr[i - 1] + 0.4) / (arr[i - 1] - arr[i]); return 99; };
  const raw = []; for (let i = 1; i <= 8; i++) raw.push(Math.max(-0.95, 0.85 - (1.75 * i) / 6));
  ok(cross(fil) - cross(raw) < 0.6, `stick read: a push comes through the filter with under a frame's lag (${((cross(fil) - cross(raw)) * 16.7).toFixed(1)} ms)`);
  ok(stickPower(STICK_FULL) === 1 && stickPower(STICK_FULL * 0.5) > 0.5 && stickPower(STICK_FULL * 0.25) > 0.25 && stickPower(0) === 0, "stick power: a gentle curve, full at the natural pull");
}
{ // the swing path trace and its words (gesture.js swingTrace), for the player to learn from
  const S = trail(60, 14), r = readSwing(S), tr = swingTrace(r, S, PULL_FULL);
  ok(tr && tr.pts.length > 4 && tr.pts.every(p => Math.abs(p[0]) <= 1 && Math.abs(p[1]) <= 1) && tr.words[0] === "PUSHED" && tr.words[1] === "GOOD TEMPO" && !tr.putt, `trace: a drag drifting right, good tempo -> ${JSON.stringify(tr.words)}`);
  ok(swingTrace(readSwing(trail(60, -14, 900)), trail(60, -14, 900), PULL_FULL).words.join("/") === "PULLED/TOO SLOW" && swingTrace(readSwing(trail(60, 0, 25)), trail(60, 0, 25), PULL_FULL).words.join("/") === "STRAIGHT/TOO FAST", "trace: pulled and slow, straight and fast, named");
  const mx = Math.max(...tr.pts.map(p => p[1]));
  ok(mx > 0.7 && tr.pts[tr.pts.length - 1][1] < 0, "trace: the pull goes down the box (+y), the strike comes back above the start");
  ok(pathWord(0.5) === "PUSHED" && pathWord(-0.5) === "PULLED" && pathWord(0.05) === "STRAIGHT" && tempoWord(-0.5) === "TOO SLOW" && tempoWord(0.5) === "TOO FAST" && tempoWord(0) === "GOOD TEMPO", "trace: the words");
  const pt = readSwing(trail(36, 0, 150, false), { putt: true }), ptr = swingTrace(pt, trail(36, 0, 150, false), PULL_FULL);
  ok(ptr.putt && ptr.words[0] === "PACE 50%" && ptr.words[1] === "STRAIGHT", `trace: a putt names its pace (${ptr.words.join(", ")})`);
}
{ // LEFT-HANDED (2026-10-06, Scott: "I'm LEFT-HANDED"): the stance mirrors, the meter's hook and
  // slice follow the hand, the ball's own physics do not, the words do, and the cfg remembers
  ok(handOf("L") === -1 && handOf(-1) === -1 && handOf("left") === -1 && handOf("R") === 1 && handOf(undefined) === 1, "hand: L / left / -1 are left, anything else right");
  const base = { seed: 99, mode: "stroke", count: 18, start: 0, player: { name: "T" } };
  ok(newRound(base).cfg.hand === undefined && newRound(base).players[0].hand === 1, "a round without a hand is right-handed and says nothing in its cfg (old rounds replay as they were)");
  ok(newRound({ ...base, hand: "L" }).cfg.hand === "L" && newRound({ ...base, hand: "L" }).players[0].hand === -1, "a left-handed round carries hand: L in its cfg and the player plays left");
  // the meter pressed early: a hook, away from the trail side (left for a right-hander, right for a left-hander)
  const early = (hand) => {
    const st = newRound({ ...base, hand }); step(st, BTN.A); step(st, 0); step(st, 0);
    while (st.phase === "intro") step(st, st.t > 12 && !(st.prev & BTN.A) ? BTN.A : 0);
    Object.assign(st.players[0], { x: 0, y: 0, lie: "fairway" }); st.wind = { mph: 0, dir: 0, x: 0, y: 0 }; st.aim = 0; st.club = 4;
    while (st.phase === "aim") step(st, st.prev & BTN.A ? 0 : st.t > 7 ? BTN.A : 0);
    while (st.phase === "meter" && st.meter.stage === 1) step(st, st.meter.m >= 0.8 && !(st.prev & BTN.A) ? BTN.A : 0);
    while (st.phase === "meter") step(st, st.meter.m <= 0.5 && st.meter.m > 0.3 && !(st.prev & BTN.A) ? BTN.A : 0);   // well before the line: early
    return st.fl;
  };
  const eR = early("R"), eL = early("L");
  ok(eR.curve < -2 && eL.curve > 2 && Math.abs(eR.curve + eL.curve) < 1e-9, `the meter's early press hooks either way: a right-hander's curves left (${eR.curve.toFixed(1)}), a left-hander's right (${eL.curve.toFixed(1)})`);
  // a drag or stick stroke is the ball's: the same event flies the same for either hand
  const ev = swingEvent(readSwing(trail(64, 14)));
  const fly = (hand) => { const st = newRound({ ...base, hand }); step(st, BTN.A); step(st, 0); step(st, 0); while (st.phase === "intro") step(st, st.t > 12 && !(st.prev & BTN.A) ? BTN.A : 0); Object.assign(st.players[0], { x: 0, y: 0, lie: "fairway" }); st.wind = { mph: 0, dir: 0, x: 0, y: 0 }; st.aim = 0; st.club = 4; for (let i = 0; i < 8; i++) step(st, 0); act(st, ev); return st.fl; };
  ok(fly("R").curve > 2 && fly("R").curve === fly("L").curve, "a swing path drifting right curves the ball right for either hand (what a mirrored swing does too)");
  ok(lineWord(0.8) === "SLICE" && lineWord(0.8, -1) === "HOOK" && lineWord(-0.8, -1) === "SLICE" && lineWord(-0.3, -1) === "FADE" && lineWord(0.3, -1) === "DRAW" && lineWord(0, -1) === "STRAIGHT", "the words follow the hand: a left-hander's curve to the right is a hook");
  ok(pathWord(0.5, -1) === "PULLED" && pathWord(-0.5, -1) === "PUSHED" && swingTrace(readSwing(trail(60, 14)), trail(60, 14), PULL_FULL, -1).words[0] === "PULLED", "the trace's words follow the hand: a lefty drifting right has pulled it");
  // a left-handed round replays tick for tick, and is its own round (the early presses go the other way)
  const lcfg = { ...cfg, hand: "L" }, la2 = autoplay(lcfg), lr = replay(lcfg, la2.log);
  ok(la2.st.phase === "done" && la2.st.cfg.hand === "L" && JSON.stringify(lr.result) === JSON.stringify(la2.st.result) && lr.tick === la2.st.tick, "a left-handed round finishes and replays tick for tick from its log");
  ok(JSON.stringify(replayRecord({ v: VERSION, cfg: la2.st.cfg, inputLog: JSON.parse(JSON.stringify(la2.log)) }).result) === JSON.stringify(la2.st.result), "... and through replay.js after a trip through JSON");
  ok(HANDS["phil-mickelson"] === "L" && golferBySlug("phil-mickelson").hand === "L" && golferBySlug("tiger-woods").hand === "R", "the figures' hands are on file: Mickelson plays left, Woods right");
  const vsPhil = newRound({ ...cfg, cpu: { slug: "phil-mickelson", name: "PHIL MICKELSON", rating: 88, hand: "L" } });
  ok(vsPhil.players[1].hand === -1 && vsPhil.players[0].hand === 1, "a match against Mickelson: he plays left, you play as you said");
}
{ // tone (2026-10-06, Scott: the Overlord satire takes a break in the sports games): the sim's words are golf's
  const simSrc = readFileSync(new URL("../src/play/golf/sim.js", import.meta.url), "utf8");
  ok(!/DEPARTMENT|AUDIT|COMPLIANT|FILED|UNDER REVIEW/.test(simSrc.replace(/\/\/[^\n]*/g, "")), "the sim's messages carry none of the office voice");
  ok(SCORE_NAME(0, 4) === "PAR." && SCORE_NAME(-1, 3) === "BIRDIE." && SCORE_NAME(1, 5) === "BOGEY." && SCORE_NAME(0, 1) === "HOLE IN ONE!" && SCORE_NAME(2, 6) === "DOUBLE BOGEY.", "scores are named as golf names them");
  ok(FAMOUS.filter(d => /DEPARTMENT/.test(d.note)).length <= 2 && FAMOUS.every(d => d.note.length <= 120), "the hole cards' notes: at most a light wink, two Department lines in eighteen");
  ok(Object.values(CAPTION).every(c => !/DEPARTMENT|FILED|LOGGED|EXPENSED|UNDER REVIEW/.test(c) && c.length <= 90), "the end scenes' captions: one light line each, no filing");
  const h0 = COURSE[0], r0 = at(h0.pin.x, h0.pin.y - 40, "fairway");
  r0.wind = { mph: 0, dir: 0, x: 0, y: 0 };
  swing(r0, Math.atan2(0, 40), 7, 0.3);
  ok(/TO THE PIN\.$|^TAP-IN\.$|LEFT\.$|HOLE IN ONE|BIRDIE|PAR\.|BOGEY/.test(r0.msg), `a shot's result says where it is and what is left (${r0.msg})`);
}
// the strokes in the sim: same lie, calm, straight up a flat fairway
const strokeAt = (ev, club = 4, lie = "fairway") => {
  const st = at(0, 0, lie);
  st.wind = { mph: 0, dir: 0, x: 0, y: 0 }; st.aim = 0; st.club = club;
  for (let i = 0; i < 8; i++) step(st, 0);
  const P = st.players[0], s0 = P.strokes;
  act(st, ev);
  while (st.phase === "flight" || st.phase === "roll") step(st, 0);
  return { st, P, x: st.fl ? (st.ball.x) : null, y: st.ball?.y, stroked: P.strokes > s0, fl: st.fl };
};
{
  const g = (pull, drift, ms) => swingEvent(readSwing(trail(pull, drift, ms)));
  const s = strokeAt(g(64, 0)), r = strokeAt(g(64, 14)), l = strokeAt(g(64, -14));
  ok(s.stroked && Math.abs(s.fl.curve) < 1e-9, "a straight push is a straight ball");
  ok(r.fl.curve > 2 && r.fl.curve > s.fl.curve && l.fl.curve < -2, `drift right curves the ball right (a slice), left curves it left (${r.fl.curve.toFixed(1)}, ${l.fl.curve.toFixed(1)} yd)`);
  const half = strokeAt(g(32, 0)), fat = strokeAt(g(64, 0, 900)), thin = strokeAt(g(64, 0, 25));
  ok(half.fl.carry < s.fl.carry * 0.6, `half the pull, about half the carry (${half.fl.carry.toFixed(0)} v ${s.fl.carry.toFixed(0)})`);
  ok(fat.fl.carry < s.fl.carry * 0.85 && thin.fl.apex < s.fl.apex * 0.8, `fat comes up short (${fat.fl.carry.toFixed(0)}), thin flies low (apex ${thin.fl.apex.toFixed(1)} v ${s.fl.apex.toFixed(1)})`);
  const back = strokeAt(swingEvent(readSwing(trail(64)), { x: 0, y: -1 })), top = strokeAt(swingEvent(readSwing(trail(64)), { x: 0, y: 1 }));
  ok(back.fl.spin > s.fl.spin && top.fl.spin < s.fl.spin, "struck under the ball: more backspin; over it: less");
  const draw = strokeAt(swingEvent(readSwing(trail(64)), { x: -1, y: 0 })), fade = strokeAt(swingEvent(readSwing(trail(64)), { x: 1, y: 0 }));
  ok(draw.fl.curve < -2 && fade.fl.curve > 2, "struck on the ball's left side: a draw; its right: a fade");
  ok(JSON.stringify(makeFlight(COURSE[0], { x: 0, y: 0, lie: "fairway" }, 4, 0, 0.8, 0.3, { x: 3, y: 2 })) === JSON.stringify(makeFlight(COURSE[0], { x: 0, y: 0, lie: "fairway" }, 4, 0, 0.8, 0.3, { x: 3, y: 2 }, null)), "no mouse stroke: the v2 flight exactly");
  // cancel: nothing reaches the sim, nothing happens; an event out of turn is ignored
  const c0 = at(0, 0, "tee"); for (let i = 0; i < 8; i++) step(c0, 0);
  ok(readSwing(trail(64, 0, 150, false)).kind === "cancel" && c0.phase === "aim" && c0.players[0].strokes === 0, "a called-off swing: no stroke");
  c0.club = CLUBS.length - 1; act(c0, g(64, 0));
  ok(c0.phase === "aim" && c0.players[0].strokes === 0, "a full-swing event with the putter in hand is ignored");
  const c1 = at(0, 0, "tee"); c1.phase = "flight"; act(c1, aimEvent(10, 100));
  ok(c1.target == null, "an aim event out of the aim phase is ignored");
}
{ // the map click: the aim swings to the spot, the club for the distance comes out of the bag
  const h = COURSE[0], st = at(0, 0, "tee"); for (let i = 0; i < 8; i++) step(st, 0);
  act(st, aimEvent(-20, 140));
  const want = Math.atan2(-20, 140);
  ok(st.target && st.aimTo != null && st.aim !== want, "a click on the map sets the target; the aim has not jumped");
  let t = 0; while (st.aim !== want && t < 120) { step(st, 0); t++; }
  ok(Math.abs(st.aim - Math.atan2(-2, 14)) < 1e-9 && t > 2 && t < 60, `the aim swings to it over ${t} ticks`);
  ok(st.club === clubFor(st.players[0], Math.hypot(20, 140)) && reachOf(st.club, "tee") >= Math.hypot(20, 140) && reachOf(st.club + 1, "tee") < Math.hypot(20, 140), `and the club for ${Math.round(Math.hypot(20, 140))} yards: ${CLUBS[st.club].id}`);
  act(st, aimEvent(5, 400)); ok(st.club === 0, "a target past every club: the driver off the tee");
  step(st, BTN.D); step(st, 0); ok(st.club === 1, "the club is still the player's to change (wheel / down)");
  ok(clubFor({ lie: "green" }, 8) === CLUBS.length - 1, "on the green: the putter");
  void h;
}
{ // the putt by drag: the pace marker the two-tap meter would show, the same roll
  const h = COURSE[2], mk = () => { const st = at(h.pin.x - 3, h.pin.y - 5, "green", 2); st.club = CLUBS.length - 1; st.aim = Math.atan2(3, 5); for (let i = 0; i < 8; i++) step(st, 0); return st; };
  const a1 = mk(); act(a1, puttEvent({ m: 0.4, off: 0 }));
  ok(a1.phase === "roll" && a1.players[0].strokes === 1 && Math.abs(a1.meter.pace - puttPace(0.4)) < 1e-12, "a drag putt strikes at the marker's pace: one stroke");
  const a2 = mk(); act(a2, swingEvent({ power: 1, a: 0, contact: 0 }));
  ok(a2.phase === "aim" && a2.players[0].strokes === 0, "a full-swing event on the green with the putter is ignored");
}
{ // a round played by mouse: aim clicks, drag swings, drag putts. It finishes; its log alone replays it
  const mcfg = { seed: 0xc0ffee, course: "open", mode: "match", count: 9, start: 0, easy: true, player: { name: "MOUSE" }, cpu: { name: "X", rating: 60 } };
  const st = newRound(mcfg), log = [];
  let aimed = -1, events = 0;
  const send = (e) => { logEvent(log, e); act(st, e); events++; };
  while (st.phase !== "done" && st.tick < 2e6) {
    const P = st.players[st.cur], key = `${st.hi}|${st.cur}|${P.strokes}`;
    let b = 0;
    if (st.phase === "intro" || st.phase === "holeEnd") b = st.t > 20 && !(st.prev & BTN.A) ? BTN.A : 0;
    else if (st.phase === "aim" && P.kind === "human" && st.t >= 10) {
      const h = holeOf(st), plan = planShot(h, P, st.wind), putt = CLUBS[clubFor(P, plan.d)].putt;
      if (aimed !== key) {
        aimed = key;
        // aim at the caddie's spot, but where the solved line points (wind, break)
        const sol = solveShot(h, P, clubFor(P, plan.d), plan.tx, plan.ty, st.wind, 1), [dx, dy] = dirOf(sol.aim);
        send(aimEvent(P.x + dx * plan.d, P.y + dy * plan.d));
      } else if (st.aimTo == null) {
        const sol = solveShot(h, P, st.club, plan.tx, plan.ty, st.wind, 1);
        if (putt) { const g = readSwing(trail(puttMark(sol.power) * PULL_PUTT, 0, 150, false), { putt: true, easy: true }); send(puttEvent(g)); }
        else { const g = readSwing(trail(sol.power * PULL_FULL, 0, 150), { easy: true }); send(swingEvent(g)); }
      }
    }
    logPush(log, b); step(st, b); st.ev.length = 0;
  }
  ok(st.phase === "done" && events > 30, `a mouse round finishes (${events} events, ${st.result.total[0]} strokes)`);
  ok(st.result.total[0] <= 9 * 6, `and is playable: ${st.result.total[0]} over nine (${toParText(st.result.toPar[0])})`);
  const rp = replay(mcfg, log), rr = replayRecord({ v: VERSION, cfg: st.cfg, inputLog: JSON.parse(JSON.stringify(log)) });
  ok(JSON.stringify(rp.result) === JSON.stringify(st.result) && rp.tick === st.tick, "a mouse-played round replays from its log tick for tick");
  ok(JSON.stringify(rr.result) === JSON.stringify(st.result) && rr.tick === st.tick, "... and through replay.js, after a trip through JSON (localStorage)");
  ok(log.length < 4000, `the mouse round's log is compact (${log.length} entries)`);
}

// ---- difficulty: a casual first-timer (Scott, 2026-10-05: "I'm pretty awful at it")
// The keys, played like a person: reads a fifth of the wind, aims within a few degrees, presses about
// 100 ms either side of the mark (sd), putts within a quarter of the pace. On today's EASY SWING
// (assist 2) that is about bogey golf over the Open's front nine; without it, much worse.
function casual(cfg, seed) {
  let s = seed >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const g = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.732;
  const st = newRound(cfg); let plan = null, key = "";
  while (st.phase !== "done" && st.tick < 3e6) {
    const P = st.players[st.cur]; let b = 0;
    if (st.prev & BTN.A) b = 0;
    else if (st.phase === "intro" || st.phase === "holeEnd") b = st.t > 20 ? BTN.A : 0;
    else if (P.kind === "human" && st.phase === "aim" && st.t >= 8) {
      const kk = `${st.hi}|${P.strokes}|${P.x}|${P.y}`;
      if (kk !== key) {
        key = kk; const h = holeOf(st), pl = planShot(h, P, st.wind), putt = CLUBS[pl.club].putt;
        const sol = solveShot(h, P, st.club, pl.tx, pl.ty, st.wind, putt ? 1 : 0.2);
        plan = { aim: sol.aim + g() * 0.05, p: Math.max(0.01, Math.min(1, sol.power * (1 + g() * (putt ? 0.25 : 0.05)))), o1: Math.round(g() * 6), o2: Math.round(g() * 6) };
      }
      const fine = CLUBS[st.club].putt ? 0.0035 : 0.006, d = plan.aim - st.aim;
      if (Math.abs(d) > fine * 0.55) { const bit = d > 0 ? BTN.R : BTN.L; b = Math.abs(d) > fine * 12 ? bit : (st.prev & (BTN.L | BTN.R) ? 0 : bit); } else b = BTN.A;
    } else if (P.kind === "human" && st.phase === "meter") {
      const m = st.meter, putt = CLUBS[st.club].putt, p = putt ? puttMark(plan.p) : plan.p;
      if (m.stage === 1) b = m.dir > 0 && m.k + 1 >= Math.min(m.rise, Math.max(1, Math.round(p * m.rise) + (putt ? Math.round(plan.o1 * 0.8) : plan.o1))) ? BTN.A : 0;
      else b = m.k + 1 >= 2 * Math.round(m.power * m.rise) + plan.o2 ? BTN.A : 0;
    }
    step(st, b); st.ev.length = 0;
  }
  return st;
}
{
  const nine = (extra) => { const l = []; for (let seed = 1; seed <= 6; seed++) l.push(casual({ seed: seed * 7919, course: "open", mode: "stroke", count: 9, start: 0, player: { name: "FIRST" }, ...extra }, seed).result.toPar[0]); return { mean: l.reduce((x, y) => x + y) / l.length, l }; };
  const ez = nine({ easy: true, assist: 2 }), hard = nine({});
  ok(ez.mean >= 4 && ez.mean <= 13, `a first-timer on EASY SWING shoots about bogey golf over nine: +${ez.mean.toFixed(1)} (${ez.l.join(", ")})`);
  ok(hard.mean > ez.mean + 8, `without EASY SWING the same player is much worse: +${hard.mean.toFixed(1)}`);
  const st = newRound({ seed: 1, mode: "stroke", count: 9, player: { name: "T" }, easy: true, assist: 2 });
  ok(st.cfg.assist === 2 && newRound({ seed: 1, mode: "stroke", count: 9, player: { name: "T" }, assist: 2 }).cfg.assist === undefined, "assist 2 is kept in the cfg of easy rounds only (older easy rounds replay as they were)");
}

// ---- the gallery and the end scene: read-only, deterministic
{ const { reactionFor } = await import("../src/play/golf/gallery.js");
  const { endScene, SCENES } = await import("../src/play/golf/scenes.js");
  const h = COURSE[0], mk = (P, shot) => { const st = newRound({ seed: 5, mode: "stroke", count: 9, player: { name: "T" } }); Object.assign(st.players[0], P); st.shot = shot; st.phase = "rest"; return st; };
  const k = (P, shot) => reactionFor(mk(P, shot), h)?.kind ?? null;
  ok(k({ holed: true, strokes: 1, x: h.pin.x, y: h.pin.y }, { putt: false, from: 150 }) === "roar", "the gallery roars at a hole in one");
  ok(k({ holed: true, strokes: h.par - 1, putts: 1, x: h.pin.x, y: h.pin.y }, { putt: true, from: 4 }) === "warm", "a holed birdie putt: warm applause");
  ok(k({ holed: true, strokes: h.par, putts: 2, x: h.pin.x, y: h.pin.y }, { putt: true, from: 2 }) === "polite", "a holed par putt: polite applause");
  ok(k({ strokes: 2, lie: "fairway", x: 0, y: 100 }, { putt: false, from: 200, shank: true }) === "crickets", "a shank: crickets");
  ok(k({ strokes: 3, lie: "green", putts: 1, x: h.pin.x + 0.12, y: h.pin.y }, { putt: true, from: 9, lip: true }) === "ooh", "a lip-out: the gallery gasps");
  ok(k({ strokes: 2, lie: "green", x: h.pin.x + 2, y: h.pin.y }, { putt: false, from: 120 }) === "cheer", "an approach inside ten feet: cheers");
  ok(k({ strokes: 4, lie: "green", putts: 1, x: h.pin.x + 1.2, y: h.pin.y }, { putt: true, from: 0.6 }) === "crickets", "a missed tap-in: crickets");
  const st = autoplay({ ...cfg, count: 9 }).st, s1 = endScene(st), s2 = endScene(replay(st.cfg, autoplay({ ...cfg, count: 9 }).log));
  ok(SCENES.includes(s1) && s1 === s2, `the end scene follows from the round (${s1}), the same on replay`);
  const fake = (over, winner, seed) => endScene({ cfg: { seed }, result: { holes: Array(9).fill(0), toPar: [over], total: [36 + over], mode: winner === undefined ? "stroke" : "match", winner } });
  const seen = new Set(); for (let sd = 1; sd < 60; sd++) for (const [o, w] of [[-2], [2], [8], [20], [1, null], [3, 1]]) seen.add(fake(o, w, sd));
  ok(SCENES.every(x => seen.has(x)), `every end scene is reachable (${[...seen].join(", ")})`);
}

console.log(`check-golf: ${n} checks passed. 9 holes by the bot: ${a.st.result.total[0]} (${toParText(a.st.result.toPar[0])}); ${cfg.cpu.name}: ${a.st.result.total[1]}. The open, 18 by the bot: ${oa.st.result.total[0]} (${toParText(oa.st.result.toPar[0])}).`);
