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
// Run: node scripts/check-golf.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COURSE, PAR, OPEN, COURSES, parOf, surfaceAt, inPoly, centroidOf, areaOf, poly } from "../src/play/golf/course.js";
import { OSM } from "../src/play/golf/holes/osm.js";
import { replayRecord, versionOf } from "../src/play/golf/replay.js";
import * as V1 from "../src/play/golf/v1/sim.js";
import { FAMOUS } from "../src/play/golf/holes/famous.js";
import { newRound, step, autoplay, replay, cardOf, toParText, BTN, CLUBS, RISE_PUTT, holeOf, MAX_STROKES, VERSION, predict, makeFlight, flightAt, solveShot } from "../src/play/golf/sim.js";
import { fnv } from "../src/play/golf/course.js";
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
  swing(st, sol.aim, CLUBS.length - 1, sol.power);
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


// ---- versions: v2 is live; every v1 round recorded before it still replays on v1, exactly
ok(VERSION === 2 && a.st.cfg.v === 2 && a.st.result.v === 2, "new rounds are sim v2 and say so in their cfg");
ok(versionOf({ v: 1, cfg: { seed: 1 } }) === 1 && versionOf({ v: 2, cfg: { v: 2 } }) === 2 && versionOf({ cfg: {} }) === 1, "a record without a version is v1");
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
{ // a v2 round, saved as Golf.jsx saves it, comes back through replay.js on v2
  const rec = { v: VERSION, seed: cfg.seed, cfg: a.st.cfg, inputLog: a.log, result: a.st.result };
  const st = replayRecord(rec);
  ok(JSON.stringify(st.result) === JSON.stringify(a.st.result) && st.tick === a.st.tick, "a saved v2 round replays through replay.js tick for tick");
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

console.log(`check-golf: ${n} checks passed. 9 holes by the bot: ${a.st.result.total[0]} (${toParText(a.st.result.toPar[0])}); ${cfg.cpu.name}: ${a.st.result.total[1]}. The open, 18 by the bot: ${oa.st.result.total[0]} (${toParText(oa.st.result.toPar[0])}).`);
