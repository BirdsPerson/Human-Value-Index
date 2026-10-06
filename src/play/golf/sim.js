// THE DEPARTMENT LINKS, the round: a pure, fixed-step (60 Hz) state machine. No DOM, no clock,
// no Math.random: newRound(cfg) and the same per-tick button bits give the same round, tick for
// tick, so a round is {cfg, inputLog} and can be replayed anywhere (scripts/check-golf.mjs does;
// a server can later). The renderer (render.js) only reads the state.
//
// SIM VERSION 2. Version 1 rounds (circle greens, three-press putts, the first flight and roll)
// replay through the frozen ./v1/sim.js (./replay.js picks by version); cfg.v says which.
//
// A shot: AIM (left/right; B or down for a shorter club, up for a longer one), then the meter. A
// full swing is the classic three presses: A starts the swing, A sets the power as the marker
// climbs, A sets the accuracy as it falls back through the line (early hooks, late slices, missed
// is a shank). A PUTT IS TWO: A starts the stroke, A sets the pace; there is no accuracy press on
// the green. Leave the putter's marker alone and it climbs, falls back, and the stroke is called
// off (no stroke counted).
//
// The ball (v2):
//   flight   carry, height and the landing angle are the club's; WIND acts in proportion to how
//            high the ball flies and how long it stays up: into the wind the ball comes up short
//            (about twice as much as the same wind behind adds), a crosswind drifts it, a low or
//            soft shot is moved less than a high full one
//   landing  every surface has its own bounce (restitution), grip (friction), how much a steep
//            ball ploughs in, and how it rolls; backspin (wedges, short irons) checks the ball on
//            the first bounces, a driver runs out; a steep landing stops quicker than a shallow one
//   roll     deceleration = a constant (the grass) + a share of the speed (the drag of the blades),
//            so the ball slows in a smooth curve and stops, never slides or halts dead; the ground's
//            fall pulls it everywhere (course.js slopeAt), the green's most
//   hazards  water is a splash and a drop (+1), out of bounds is +1 and the shot again; a steep ball
//            into a bunker can plug; the Road Hole's road is in play and fast

import { COURSE, COURSES, surfaceAt, slopeAt, treeTop, lineDist, pointAlong, rngStep, fnv } from "./course.js";

export const VERSION = 2;
export const HZ = 60;
const DT = 1 / HZ;
export const BTN = { L: 1, R: 2, U: 4, D: 8, A: 16, B: 32 };

// carry in yards at full power from a good lie; loft: apex as a share of carry; land: the landing
// angle in degrees; spin: backspin, 0..1; roll: the run-out a caddie expects on fairway (planning)
export const CLUBS = [
  { id: "1W", carry: 235, loft: 0.12, land: 37, spin: 0.12, roll: 0.11 },
  { id: "3W", carry: 215, loft: 0.13, land: 40, spin: 0.2, roll: 0.09 },
  { id: "3I", carry: 192, loft: 0.15, land: 43, spin: 0.38, roll: 0.06 },
  { id: "5I", carry: 172, loft: 0.17, land: 46, spin: 0.5, roll: 0.05 },
  { id: "7I", carry: 152, loft: 0.2, land: 49, spin: 0.64, roll: 0.04 },
  { id: "9I", carry: 132, loft: 0.24, land: 51, spin: 0.8, roll: 0.03 },
  { id: "PW", carry: 110, loft: 0.27, land: 52, spin: 0.9, roll: 0.02 },
  { id: "SW", carry: 78, loft: 0.32, land: 54, spin: 1, roll: 0.015 },
  { id: "PT", carry: 0, putt: true },
];
const PT = CLUBS.length - 1;
export const LIE = { tee: 1, fairway: 1, fringe: 0.95, green: 1, rough: 0.82, bunker: 0.6, trees: 0.55, waste: 0.8, path: 0.97 };
// the ground, per surface: e (bounce), mu (grip), plough (a steep ball's loss), c0 + c1 * speed
// (rolling deceleration, yards/s^2)
export const GROUND = {
  green: { e: 0.22, mu: 0.55, plough: 0.25, c0: 0.62, c1: 0.1 },
  fringe: { e: 0.22, mu: 0.6, plough: 0.35, c0: 1.1, c1: 0.3 },
  fairway: { e: 0.25, mu: 0.5, plough: 0.35, c0: 2.2, c1: 0.5 },
  tee: { e: 0.25, mu: 0.5, plough: 0.35, c0: 2.2, c1: 0.5 },
  rough: { e: 0.12, mu: 0.9, plough: 0.8, c0: 5.5, c1: 1.8 },
  trees: { e: 0.1, mu: 1, plough: 0.9, c0: 8, c1: 2.5 },
  waste: { e: 0.08, mu: 1, plough: 0.85, c0: 7, c1: 2 },
  bunker: { e: 0.03, mu: 1, plough: 0.98, c0: 16, c1: 4 },
  path: { e: 0.58, mu: 0.15, plough: 0.05, c0: 0.9, c1: 0.12 },
};
const SPIN_LIE = { rough: 0.4, trees: 0.3, bunker: 0.6, waste: 0.7, fringe: 0.9 };
export const GRAV = 10.7;            // yards/s^2
export const PUTT_MAX = 22;          // yards a full putt rolls on a flat green
export const CUP_R = 0.075, CAPTURE_V = 2.1, MAX_STROKES = 10;
export const RISE = 54, RISE_PUTT = 90, ACC_ZONE = 0.12, ACC_END = -0.14;
const TREE_H = 11;

const lieFactor = (club, lie, plug) => (lie === "bunker" ? (plug ? 0.45 : CLUBS[club].id === "SW" ? 0.92 : LIE.bunker) : LIE[lie] ?? 1);
const flightT = (carry) => 1.1 + carry / 160;      // seconds in the air
export const reachOf = (club, lie) => { const c = CLUBS[club]; return c.putt ? PUTT_MAX : c.carry * lieFactor(club, lie) * (1 + c.roll); };
export const courseOf = (st) => COURSES[st.course] || COURSE;
export const holeOf = (st) => courseOf(st)[st.holes[st.hi]];
export const dirOf = (aim) => [Math.sin(aim), Math.cos(aim)];   // aim 0 = straight up the hole, + = right

// ---- wind --------------------------------------------------------------------------------------
// The wind as the shot feels it: -> {tail (mph, + behind the ball), cross (mph, + blowing to the
// right of the aim)}
export function windRel(wind, aim) {
  const [dx, dy] = dirOf(aim);
  return { tail: wind.x * dx + wind.y * dy, cross: wind.x * dy - wind.y * dx };
}
// How much of the wind a shot feels: a high ball more, a low one less (0.35 .. 1.25)
const exposure = (apex) => Math.max(0.35, Math.min(1.25, Math.sqrt(Math.max(0, apex) / 28)));

// ---- the flight (pure): from a club, power, aim and lie to the curve through the air ------------
export function makeFlight(h, P, club, aim, power, acc, wind) {
  const c = CLUBS[club];
  const carry0 = c.carry * lieFactor(club, P.lie, P.plug) * power;
  const apex0 = carry0 * c.loft, ex = exposure(apex0);
  const { tail, cross } = windRel(wind, aim);
  const carry = carry0 * (1 + (tail >= 0 ? 0.0048 : 0.0085) * tail * ex);
  const apex = apex0 * (1 - 0.006 * tail * ex);
  const drift = 0.0056 * cross * carry0 * ex;
  const T = flightT(carry), ticks = Math.max(20, Math.round(T * HZ));
  const a = acc;
  const vh = 0.11 * carry0 + 2;
  const land = Math.min(70, Math.max(20, c.land - 0.35 * tail * ex)) * (Math.PI / 180);
  const s = c.spin * 2.2 * vh * (SPIN_LIE[P.lie] ?? 1) * (0.5 + 0.5 * power) * (P.lie === "bunker" && c.id === "SW" ? 1.3 : 1);
  return { ox: P.x, oy: P.y, aim: aim + a * 0.035, carry, carry0, ticks, T, apex, curve: a * carry0 * 0.17, drift, a, club, vh, vz: vh * Math.tan(land), spin: s, ex };
}
// Where the ball is, f (0..1) of the way through its flight. The ball climbs to its apex 60% of
// the way out and falls more steeply than it rose; it slows as it goes.
export function flightAt(fl, wind, f) {
  const [dx, dy] = dirOf(fl.aim), rx = dy, ry = -dx;
  const fwd = fl.carry * f * (1.35 - 0.35 * f), side = (fl.curve + fl.drift) * f * f;
  void wind;
  return { x: fl.ox + dx * fwd + rx * side, y: fl.oy + dy * fwd + ry * side, z: Math.max(0, fl.apex * 5.379 * Math.pow(f, 1.5) * (1 - f)) };
}
// The ball at the end of its flight: where, and its velocity (horizontal along the flight's last
// heading; vertical down), and its backspin.
function landingOf(fl, wind) {
  const p = flightAt(fl, wind, 1), q = flightAt(fl, wind, 0.98);
  const vx = p.x - q.x, vy = p.y - q.y, n = Math.hypot(vx, vy) || 1;
  return { x: p.x, y: p.y, z: 0, vx: (vx / n) * fl.vh, vy: (vy / n) * fl.vh, vz: -fl.vz, s: fl.spin, hops: 0, putt: false };
}

// ---- the ground (pure): one tick of a ball on or just above the ground --------------------------
// b: {x, y, z, vx, vy, vz, s, hops, putt}. -> null (still going) | "rest" | "water" | "ob" | "cup" |
// "lip" (it caught the cup and spun out; still going)
export function groundStep(h, b) {
  if (b.z > 0 || b.vz > 0) {   // a hop
    b.vz -= GRAV * DT; b.z += b.vz * DT; b.x += b.vx * DT; b.y += b.vy * DT;
    if (b.z > 0) return null;
    b.z = 0;
    const s = surfaceAt(h, b.x, b.y);
    if (s === "water" || s === "ob") return s;
    return bounce(h, b, s);
  }
  const s = surfaceAt(h, b.x, b.y);
  if (s === "water" || s === "ob") return s;
  const g = GROUND[s] || GROUND.rough, [gx, gy] = slopeAt(h, b.x, b.y);
  const sp = Math.hypot(b.vx, b.vy);
  if (sp < 0.04 && Math.hypot(gx, gy) < g.c0 * 0.85) return "rest";
  let vx = b.vx + gx * DT, vy = b.vy + gy * DT;
  const n = Math.hypot(vx, vy) || 1, dec = Math.min(n, (g.c0 + g.c1 * n) * DT);
  vx -= (vx / n) * dec; vy -= (vy / n) * dec;
  const x0 = b.x, y0 = b.y, nx = x0 + vx * DT, ny = y0 + vy * DT;
  // the cup: the closest the path came to it this tick
  const ux = nx - x0, uy = ny - y0, L2 = ux * ux + uy * uy;
  const t = L2 ? Math.max(0, Math.min(1, ((h.pin.x - x0) * ux + (h.pin.y - y0) * uy) / L2)) : 0;
  const off = Math.hypot(x0 + ux * t - h.pin.x, y0 + uy * t - h.pin.y);
  b.vx = vx; b.vy = vy; b.x = nx; b.y = ny;
  if (off < CUP_R && !b.lipped) {
    // dead centre drops at up to CAPTURE_V; an edge only at a crawl
    const edge = off / CUP_R;
    if (sp < CAPTURE_V * (1 - 0.65 * edge * edge)) { b.x = h.pin.x; b.y = h.pin.y; return "cup"; }
    // caught the lip: turned off line and slowed, round the back of the cup
    const side = (ux * (h.pin.y - y0) - uy * (h.pin.x - x0)) >= 0 ? -1 : 1, turn = side * (0.5 + 0.9 * edge);
    const cs = Math.cos(turn), sn = Math.sin(turn);
    b.vx = (vx * cs - vy * sn) * 0.6; b.vy = (vx * sn + vy * cs) * 0.6;
    b.lipped = 12;
    return "lip";
  }
  if (b.lipped) b.lipped--;
  return null;
}
function bounce(h, b, s) {
  const g = GROUND[s] || GROUND.rough;
  const vz = -b.vz, vh = Math.hypot(b.vx, b.vy), ux = vh ? b.vx / vh : 0, uy = vh ? b.vy / vh : 0;
  const sinT = vz / (Math.hypot(vh, vz) || 1);
  const fr = g.mu * (1 + g.e) * vz, slip = vh + b.s;
  let v2;
  if (fr >= (slip * 2) / 7) { v2 = (5 * vh - 2 * b.s) / 7; b.s = 0; }   // it grips: spin can pull it back
  else { v2 = vh - fr; b.s *= 0.35; }
  v2 *= 1 - g.plough * sinT;
  if (s === "bunker" && vz > 14 && sinT > 0.6) { b.plug = true; v2 = 0; }
  b.vx = ux * v2; b.vy = uy * v2;
  b.vz = g.e * vz;
  if (b.vz < 1.2) b.vz = 0;
  b.hops++;
  return null;
}
// A ball rolled out to rest on the hole (the predictor's; the sim runs the same steps tick by tick).
function runOut(h, b, maxT = 30) {
  for (let k = 0; k < HZ * maxT; k++) {
    const r = groundStep(h, b);
    if (r && r !== "lip") return r;
  }
  return "rest";
}
// The full path of a shot without the round: -> {x, y, status}
export function predict(h, P, club, aim, power, wind) {
  const c = CLUBS[club];
  if (c.putt) {
    const v0 = puttSpeed(power), [dx, dy] = dirOf(aim);
    const b = { x: P.x, y: P.y, z: 0, vx: dx * v0, vy: dy * v0, vz: 0, s: 0, hops: 0, putt: true };
    const r = runOut(h, b);
    return { x: b.x, y: b.y, status: r };
  }
  const fl = makeFlight(h, P, club, aim, power, 0, wind);
  const b = landingOf(fl, wind);
  const s0 = surfaceAt(h, b.x, b.y);
  if (s0 === "water" || s0 === "ob") return { x: b.x, y: b.y, status: s0, carry: true };
  if (Math.hypot(b.x - h.pin.x, b.y - h.pin.y) < 0.1) return { x: h.pin.x, y: h.pin.y, status: "cup" };
  bounce(h, b, s0);
  const r = runOut(h, b);
  return { x: b.x, y: b.y, status: r, lx: fl.ox, ly: fl.oy };
}
// The pace a putt is struck at, from the meter: power is the share of PUTT_MAX it would roll on a
// flat green. (Closed form of the roll: v(t) = (v0 + c0/c1) e^(-c1 t) - c0/c1.)
const GREEN = GROUND.green;
const flatRoll = (v0) => { const q = GREEN.c0 / GREEN.c1, t = Math.log((v0 + q) / q) / GREEN.c1; return ((v0 + q) * (1 - Math.exp(-GREEN.c1 * t))) / GREEN.c1 - q * t; };
// The putter's meter is finer at the short end: the marker's position m gives pace m^1.5 (a two-foot
// putt is a dozen ticks up the meter, not three).
export const puttPace = (m) => Math.pow(Math.max(0, m), 1.5);
export const puttMark = (pace) => Math.pow(Math.max(0, pace), 1 / 1.5);
export function puttSpeed(power) {
  const want = Math.max(0, power) * PUTT_MAX;
  let lo = 0, hi = 12;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (flatRoll(m) < want) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// ---- the shot a caddie would suggest -------------------------------------------------------------
// -> {club, aim, tx, ty, d (to the target), pin (to the pin)}
export function planShot(h, P, wind = null) {
  const pin = Math.hypot(h.pin.x - P.x, h.pin.y - P.y);
  const aimAt = (tx, ty) => Math.atan2(tx - P.x, ty - P.y);
  if (P.lie === "green" || (P.lie === "fringe" && pin < 14)) return { club: PT, aim: aimAt(h.pin.x, h.pin.y), tx: h.pin.x, ty: h.pin.y, d: pin, pin };
  const longest = P.lie === "tee" ? 0 : 1;
  // the wind along the line to the pin stretches or shortens every club's reach
  const wk = (club) => { if (!wind) return 1; const c = CLUBS[club], ex = exposure(c.carry * c.loft), { tail } = windRel(wind, aimAt(h.pin.x, h.pin.y)); return 1 + (tail >= 0 ? 0.0048 : 0.0085) * tail * ex; };
  const reach = (club) => reachOf(club, P.lie) * (P.plug && P.lie === "bunker" ? 0.5 : 1) * wk(club);
  if (reach(longest) >= pin * 0.97) {
    let club = longest;
    for (let c = PT - 1; c >= longest; c--) if (reach(c) >= pin) { club = c; break; }
    return { club, aim: aimAt(h.pin.x, h.pin.y), tx: h.pin.x, ty: h.pin.y, d: pin, pin };
  }
  const { along } = lineDist(h.pts, P.x, P.y);
  let [tx, ty] = pointAlong(h.pts, along + reach(longest) * 0.95);
  if (h.famous) [tx, ty] = safeLayup(h, along + reach(longest) * 0.95, tx, ty);
  return { club: longest, aim: aimAt(tx, ty), tx, ty, d: Math.hypot(tx - P.x, ty - P.y), pin };
}
function safeLayup(h, along, tx, ty) {
  const ok = (x, y) => {
    const s = surfaceAt(h, x, y);
    if (s !== "fairway" && s !== "rough") return false;
    for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4, q = surfaceAt(h, x + Math.cos(a) * 9, y + Math.sin(a) * 9); if (q === "water" || q === "ob") return false; }
    return true;
  };
  const total = h.lineLen || h.yards;
  for (let back = 0; back <= 120; back += 8) for (const lat of [0, -6, 6, -12, 12]) {
    const a = Math.min(along - back, total - h.green.r - 12);
    const [x, y] = pointAlong(h.pts, a);
    const [x2, y2] = pointAlong(h.pts, a + 1), n = Math.hypot(x2 - x, y2 - y) || 1;
    const px = x + ((y2 - y) / n) * lat, py = y - ((x2 - x) / n) * lat;
    if (ok(px, py) && surfaceAt(h, px, py) === "fairway") return [px, py];
    if (back >= 64 && ok(px, py)) return [px, py];
  }
  return [tx, ty];
}
// The swing that puts the ball at rest nearest (tx, ty): -> {aim, power}. Reads the wind (`read`
// of it: 1 all, 0 none) and, on the green, the break, by playing the shot out in its head.
// A putt read by rolling it in the head: where the line passes the cup (how far left or right,
// how fast) -> {aim, power} that drops it, dying a foot or so past.
function puttPass(h, P, aim, power) {
  const v0 = puttSpeed(power), [dx, dy] = dirOf(aim);
  const b = { x: P.x, y: P.y, z: 0, vx: dx * v0, vy: dy * v0, vz: 0, s: 0, hops: 0, putt: true };
  let best = Infinity, side = 0, speed = 0, past = false;
  for (let k = 0; k < HZ * 30; k++) {
    const r = groundStep(h, b);
    if (r === "cup") return { cup: true, side, speed, best: 0, reached: true };
    const ox = b.x - h.pin.x, oy = b.y - h.pin.y, d = Math.hypot(ox, oy);
    // the side the line passes the cup on, across the ball's own heading there
    const sp = Math.hypot(b.vx, b.vy) || 1;
    if (d < best) { best = d; side = (ox * b.vy - oy * b.vx) / sp; speed = sp; past = false; }
    else if (d > best + 0.05) past = true;
    if (r && r !== "lip") break;
  }
  return { cup: false, side, speed, best, reached: past };
}
function solvePutt(h, P, tx, ty) {
  const dist = Math.hypot(tx - P.x, ty - P.y);
  let aim = Math.atan2(tx - P.x, ty - P.y), power = Math.max(0.02, Math.min(1, (dist + 0.4) / PUTT_MAX));
  let best = { aim, power, err: Infinity };
  for (let it = 0; it < 16; it++) {
    const r = puttPass(h, P, aim, power);
    // the pace: through the cup's spot at about half a yard a second (a foot past), never short;
    // the line: dead centre (an edge that drops at one pace lips out at the next)
    const err = Math.abs(r.side) * 3 + (r.reached ? Math.abs(r.speed - 0.55) * 0.1 : 1 + (r.best || 0)) - (r.cup ? 0.05 : 0);
    if (err < best.err) best = { aim, power, err };
    if (r.cup && Math.abs(r.side) < 0.012 && Math.abs(r.speed - 0.55) < 0.35) break;
    aim += Math.atan2(-r.side, Math.max(0.5, dist)) * 0.9;
    if (!r.reached) power = Math.min(1, power + Math.max(0.01, (r.best || 0.3) / PUTT_MAX));
    else power = Math.max(0.005, power * Math.max(0.6, Math.min(1.5, Math.pow(0.55 / Math.max(0.05, r.speed), 0.7))));
  }
  return { aim: best.aim, power: best.power };
}
// The line for a putt struck at a pace already fixed (the meter's tick): aim only.
export function lineFor(h, P, power, aim) {
  let best = { aim, err: Infinity };
  for (let it = 0; it < 10; it++) {
    const r = puttPass(h, P, aim, power);
    const err = Math.abs(r.side) - (r.cup ? 1 : 0);
    if (err < best.err) best = { aim, err };
    if (r.cup && Math.abs(r.side) < 0.01) break;
    aim += Math.atan2(-r.side, Math.max(0.5, Math.hypot(h.pin.x - P.x, h.pin.y - P.y))) * 0.9;
  }
  return best.aim;
}
export function solveShot(h, P, club, tx, ty, wind, read = 1) {
  const c = CLUBS[club], w = { x: wind.x * read, y: wind.y * read };
  if (c.putt && tx === h.pin.x && ty === h.pin.y) return solvePutt(h, P, tx, ty);
  const dist = Math.hypot(tx - P.x, ty - P.y);
  let aim = Math.atan2(tx - P.x, ty - P.y);
  const full = c.putt ? PUTT_MAX : c.carry * lieFactor(club, P.lie, P.plug) * (1 + c.roll);
  let power = Math.max(0.03, Math.min(1, (c.putt ? dist + 0.35 : dist) / full));
  let best = { aim, power, err: Infinity };
  for (let it = 0; it < 7; it++) {
    const r = predict(h, P, club, aim, power, w);
    const ex = (r.status === "cup" ? h.pin.x : r.x) - P.x, ey = (r.status === "cup" ? h.pin.y : r.y) - P.y;
    const [dx, dy] = dirOf(aim);
    const want = [tx - P.x, ty - P.y];
    const ea = (want[0] - ex) * dx + (want[1] - ey) * dy, ec = (want[0] - ex) * dy - (want[1] - ey) * dx;
    // a putt aims to finish a foot past: firm enough to hold its line
    const err = Math.hypot(ea + (c.putt ? 0.3 : 0), ec) + (r.status === "water" || r.status === "ob" ? 40 : 0);
    if (r.status === "cup") return { aim, power };
    if (err < best.err) best = { aim, power, err };
    power = Math.max(0.03, Math.min(1, power + (ea + (c.putt ? 0.33 : 0)) / full));
    aim += Math.atan2(ec, Math.max(1, dist)) * (c.putt ? 1 : 0.9);
  }
  return { aim: best.aim, power: best.power };
}

// ---- a new round -------------------------------------------------------------------------------
// cfg: {seed, course: "links" (default) | "open", mode: "stroke" | "match", start (0 or 9), count (9 or 18), player: {name, color},
//       cpu: {slug, name, rating, color} | null, easy, v (sim version; this module plays 2)}
export function newRound(cfg) {
  const count = cfg.count === 9 ? 9 : 18, start = count === 9 && cfg.start === 9 ? 9 : 0;
  const seed = (cfg.seed >>> 0) || 1;
  const course = cfg.course === "open" ? "open" : "links";
  const mk = (p, kind) => ({ name: String(p?.name || "SUBJECT").toUpperCase().slice(0, 18), kind, slug: p?.slug || null, rating: kind === "cpu" ? Math.max(0, Math.min(99, p.rating | 0)) : null, color: p?.color || null, card: [], x: 0, y: 0, lie: "tee", strokes: 0, holed: false, prev: null, plug: false, putts: 0 });
  const players = [mk(cfg.player, "human")];
  const mode = cfg.mode === "match" && cfg.cpu ? "match" : "stroke";
  if (mode === "match") players.push(mk(cfg.cpu, "cpu"));
  const st = {
    v: VERSION, cfg: { v: VERSION, seed, course, mode, start, count, player: cfg.player || null, cpu: mode === "match" ? cfg.cpu : null, ...(cfg.easy ? { easy: true } : {}) },
    rng: fnv(`golf|${seed}`), mode, course, holes: Array.from({ length: count }, (_, i) => start + i), hi: 0,
    players, cur: 0, honor: players.map((_, i) => i), phase: "intro", t: 0, tick: 0, prev: 0, hold: 0,
    aim: 0, club: 0, meter: null, fl: null, ball: null, wind: null, msg: "", tone: "", ev: [], plan: null, result: null, shot: null,
  };
  startHole(st);
  return st;
}
function rand(st) { const [v, n] = rngStep(st.rng); st.rng = n; return v; }
function gauss(st) { return (rand(st) + rand(st) + rand(st) + rand(st) - 2) * 1.732; }   // sd ~1, bounded

function startHole(st) {
  const sp = Math.round(rand(st) * 14), dir = Math.floor(rand(st) * 8);
  const a = dir * Math.PI / 4;                    // 0 = blowing up the screen (toward the green)
  st.wind = { mph: sp, dir, x: Math.sin(a) * sp, y: Math.cos(a) * sp };
  for (const P of st.players) Object.assign(P, { x: 0, y: 0, lie: "tee", strokes: 0, holed: false, prev: null, plug: false, putts: 0 });
  st.cur = st.honor[0];
  st.phase = "intro"; st.t = 0; st.msg = ""; st.ball = null; st.fl = null; st.meter = null; st.shot = null;
  st.ev.push("hole");
}
function startTurn(st) {
  const P = st.players[st.cur], h = holeOf(st);
  const plan = planShot(h, P, st.wind);
  st.club = plan.club; st.phase = "aim"; st.t = 0; st.meter = null; st.fl = null; st.msg = ""; st.hold = 0;
  st.ball = { x: P.x, y: P.y, z: 0 };
  st.aim = plan.aim;
  st.plan = P.kind === "cpu" ? planCpu(st, h, P, plan) : null;
}

// ---- the CPU figure -----------------------------------------------------------------------------
// The caddie's plan played out in the figure's head (reading only part of the wind, the weaker the
// less), then the figure's own errors: the lower the rating, the wider every one. Pressing is
// quantised to the meter's ticks like anyone's.
function planCpu(st, h, P, plan) {
  const k = (100 - P.rating) / 100, skill = 0.35 + 0.65 * (P.rating / 100);
  const c = CLUBS[plan.club];
  const sol = solveShot(h, P, plan.club, plan.tx, plan.ty, st.wind, c.putt ? 1 : 0.35 + 0.65 * skill);
  let aim = plan.aim + (sol.aim - plan.aim) * (c.putt ? skill : 1), p = sol.power;
  if (c.putt) { p *= 1 + gauss(st) * (0.06 + 0.12 * k); aim += gauss(st) * (0.02 + 0.06 * k); }
  else { p *= 1 + gauss(st) * (0.03 + 0.07 * k); aim += gauss(st) * (0.015 + 0.035 * k); }
  const a = c.putt ? 0 : gauss(st) * (0.2 + 0.6 * k);    // normalised accuracy error: 0 is the line
  const rise = c.putt ? RISE_PUTT : RISE;
  const t1 = Math.max(2, Math.min(rise, Math.round((c.putt ? puttMark(Math.max(0.001, Math.min(1, p))) : Math.max(0.02, Math.min(1, p))) * rise)));
  const pw = t1 / rise;
  const t2 = c.putt ? 0 : t1 + Math.max(1, Math.round((pw + a * ACC_ZONE) * rise));
  return { aim, club: plan.club, t1, t2, wait: 30 + Math.floor(rand(st) * 30) };
}

// ---- the bot (scripts/check-golf.mjs, the caddie's attract mode): input bits from the state alone --
// Never touches the state; plays the caddie's plan with perfect timing, reading wind and break,
// steering the aim with the arrows like a player would.
const BOT = new WeakMap();
function botPlan(st) {
  const P = st.players[st.cur], key = `${st.hi}|${st.cur}|${P.strokes}|${P.x}|${P.y}|${st.club}`;
  const m = BOT.get(st);
  if (m && m.key === key) return m.sol;
  const h = holeOf(st), plan = planShot(h, P, st.wind);
  const tx = st.club === plan.club ? plan.tx : h.pin.x, ty = st.club === plan.club ? plan.ty : h.pin.y;
  let sol = solveShot(h, P, st.club, tx, ty, st.wind, 1);
  if (CLUBS[st.club].putt && tx === h.pin.x && ty === h.pin.y) {
    // the meter only stops on ticks: take the tick's pace, then read the line for that pace
    const rise = Math.round(RISE_PUTT * (st.cfg.easy && P.kind === "human" ? 1.5 : 1));
    const k = Math.max(1, Math.round(puttMark(sol.power) * rise)), power = puttPace(k / rise);
    sol = { aim: lineFor(h, P, power, sol.aim), power };
  }
  BOT.set(st, { key, sol });
  return sol;
}
export function botBits(st) {
  if (st.prev & BTN.A) return 0;
  const P = st.players[st.cur];
  if (P.kind !== "human" && (st.phase === "aim" || st.phase === "meter")) return 0;
  if (st.phase === "intro" || st.phase === "holeEnd") return st.t > 20 ? BTN.A : 0;
  if (st.phase === "aim") {
    if (st.t < 8) return 0;
    const sol = botPlan(st), fine = CLUBS[st.club].putt ? 0.0035 : 0.006, d = sol.aim - st.aim;
    if (Math.abs(d) > fine * 0.55) {
      const bit = d > 0 ? BTN.R : BTN.L;
      // hold for the fast sweep when far off; tap (one fine step a press) when close
      if (Math.abs(d) > fine * 4 * 3) return bit;
      return st.prev & (BTN.L | BTN.R) ? 0 : bit;
    }
    return BTN.A;
  }
  if (st.phase === "meter") {
    const m = st.meter, p0 = botPlan(st).power, p = CLUBS[st.club].putt ? puttMark(p0) : p0;
    // the press lands on the next tick's marker: press on the tick that puts it nearest the mark
    if (m.stage === 1) return m.dir > 0 && (m.k + 1.5) / m.rise >= p ? BTN.A : 0;
    if (m.stage === 2) return m.m - 1.5 / m.rise <= 0 ? BTN.A : 0;
  }
  return 0;
}

// ---- one tick ------------------------------------------------------------------------------------
export function step(st, bits = 0) {
  if (st.phase === "done") return st;
  bits &= 63;
  const pressed = bits & ~st.prev;
  st.prev = bits; st.tick++; st.t++;
  const P = st.players[st.cur], human = P.kind === "human";
  const A = Boolean(pressed & BTN.A);
  switch (st.phase) {
    case "intro":
      if (st.t >= 150 || (A && st.t > 10)) startTurn(st);
      break;
    case "aim": {
      if (human) {
        const dir = (bits & BTN.R ? 1 : 0) - (bits & BTN.L ? 1 : 0);
        if (dir) {
          st.hold = st.hold * Math.sign(st.hold) * dir > 0 ? st.hold + dir : dir;
          const fine = CLUBS[st.club].putt ? 0.0035 : 0.006;
          st.aim += dir * (Math.abs(st.hold) > 14 ? fine * 4 : fine);
        } else st.hold = 0;
        if (pressed & (BTN.B | BTN.D)) { st.club = (st.club + 1) % CLUBS.length; st.ev.push("club"); }
        if (pressed & BTN.U) { st.club = (st.club + CLUBS.length - 1) % CLUBS.length; st.ev.push("club"); }
        if (A && st.t > 6) beginMeter(st);
      } else {
        const pl = st.plan;
        st.club = pl.club;
        const d = pl.aim - st.aim;
        st.aim += Math.abs(d) < 0.02 ? d : Math.sign(d) * 0.02;
        if (st.t >= pl.wait && Math.abs(pl.aim - st.aim) < 1e-6) beginMeter(st);
      }
      break;
    }
    case "meter": {
      const m = st.meter, putt = CLUBS[st.club].putt;
      m.k++;
      const press = human ? A : (m.stage === 1 ? m.k === st.plan.t1 : m.k === st.plan.t2);
      if (m.stage === 1) {
        if (m.dir > 0) m.m = Math.min(1, m.k / m.rise);
        else m.m = Math.max(0, 1 - (m.k - m.rise) / m.rise);
        if (press) {
          m.power = m.m; st.ev.push("tick");
          if (putt) m.pace = puttPace(m.m);
          if (putt) { m.acc = 0; strike(st); }          // the putter: two taps, no accuracy press
          else m.stage = 2;
        } else if (m.k >= m.rise && m.dir > 0) {
          if (putt) m.dir = -1;                            // left alone, the putter's marker falls back
          else { m.power = m.m; m.stage = 2; st.ev.push("tick"); }
        } else if (putt && m.dir < 0 && m.m <= 0) {       // ... and the stroke is called off
          st.phase = "aim"; st.t = 7; st.meter = null; st.ev.push("club");
        }
      } else {
        m.m = m.power - (m.k - Math.round(m.power * m.rise)) / m.rise;
        if (press || m.m <= ACC_END) { m.acc = Math.max(ACC_END, m.m); strike(st); }
      }
      break;
    }
    case "flight": flight(st); break;
    case "roll": roll(st); break;
    case "rest":
      if (st.t >= 70) nextTurn(st);
      break;
    case "holeEnd":
      if (st.t >= 300 || (A && st.t > 30)) {
        st.hi++;
        if (st.hi >= st.holes.length) finish(st);
        else startHole(st);
      }
      break;
  }
  return st;
}

function beginMeter(st) {
  st.phase = "meter"; st.t = 0;
  // EASY SWING (cfg.easy, the player's side only): the marker climbs a third slower
  const easy = st.cfg.easy && st.players[st.cur].kind === "human";
  st.meter = { stage: 1, dir: 1, m: 0, k: 0, rise: Math.round((CLUBS[st.club].putt ? RISE_PUTT : RISE) * (easy ? 1.5 : 1)), power: null, acc: null };
  st.ev.push("swing");
}

// The meter's reading -> the shot.
function strike(st) {
  const P = st.players[st.cur], h = holeOf(st), c = CLUBS[st.club], m = st.meter;
  // early (marker above the line): a < 0, a hook. EASY SWING keeps two fifths of the miss.
  const a = c.putt ? 0 : Math.max(-1.25, Math.min(1.25, (-m.acc / ACC_ZONE) * (st.cfg.easy && P.kind === "human" ? 0.4 : 1)));
  P.prev = { x: P.x, y: P.y, lie: P.lie };
  P.strokes++;
  if (c.putt) P.putts++;
  st.ev.push(Math.abs(a) > 1 ? "shank" : "hit");
  st.t = 0;
  st.ball = { x: P.x, y: P.y, z: 0 };
  // what the gallery (render.js, audio) weighs the shot by, read-only
  st.shot = { from: Math.hypot(h.pin.x - P.x, h.pin.y - P.y), putt: Boolean(c.putt), shank: Math.abs(a) > 1, lie: P.lie, lip: false, splash: false };
  if (c.putt) {
    const v0 = puttSpeed(m.pace ?? puttPace(m.power)), [dx, dy] = dirOf(st.aim);
    st.fl = { ox: P.x, oy: P.y, putt: true, aim: st.aim, b: { x: P.x, y: P.y, z: 0, vx: dx * v0, vy: dy * v0, vz: 0, s: 0, hops: 0, putt: true } };
    P.plug = false;
    st.phase = "roll";
    return;
  }
  st.fl = makeFlight(h, P, st.club, st.aim, m.power, a, st.wind);
  P.plug = false;
  st.phase = "flight";
}
function flight(st) {
  const fl = st.fl, h = holeOf(st), f = Math.min(1, st.t / fl.ticks);
  const p = flightAt(fl, st.wind, f);
  st.ball = p;
  if (f > 0.06 && p.z < TREE_H && p.z < treeTop(h, p.x, p.y)) {   // into the branches: it drops where it hit
    st.ev.push("tree");
    fl.b = { x: p.x, y: p.y, z: Math.min(p.z, 3), vx: 0, vy: 0, vz: 0, s: 0, hops: 0 };
    st.phase = "roll"; st.t = 0;
    return;
  }
  if (f < 1) return;
  if (Math.hypot(p.x - h.pin.x, p.y - h.pin.y) < 0.1) return holed(st, h.pin.x, h.pin.y);   // in, on the fly
  const b = landingOf(fl, st.wind), s = surfaceAt(h, b.x, b.y);
  st.ev.push("land");
  if (s === "water") return penalty(st, "water", b.x, b.y);
  if (s === "ob") return penalty(st, "ob", b.x, b.y);
  bounce(h, b, s);
  fl.b = b;
  st.ball = { x: b.x, y: b.y, z: 0 };
  st.phase = "roll"; st.t = 0;
}
function roll(st) {
  const h = holeOf(st), b = st.fl.b;
  const hops = b.hops;
  const r = groundStep(h, b);
  st.ball = { x: b.x, y: b.y, z: b.z };
  if (b.hops > hops && b.hops > 1) st.ev.push("bounce");
  if (r === "lip") { st.ev.push("lip"); if (st.shot) st.shot.lip = true; return; }
  if (r === "water" || r === "ob") return penalty(st, r, b.x, b.y);
  if (r === "cup") return holed(st, h.pin.x, h.pin.y);
  if (r === "rest" || st.t > HZ * 30) rest(st, b.x, b.y, b.plug);   // never rolls forever
}
const LIE_MSG = { fairway: ["FAIRWAY.", "ACCEPTABLE."], rough: ["ROUGH.", "NOTED ON YOUR FILE."], bunker: ["BUNKER.", "SAND. AS PREDICTED."], trees: ["TREES.", "THE TREES WERE DISCLOSED."], green: ["ON THE GREEN.", "COMPLIANT."], fringe: ["FRINGE.", "NEARLY COMPLIANT."], tee: ["STILL ON THE TEE.", "THE DEPARTMENT SAW THAT."], waste: ["WASTE AREA.", "THE DEPARTMENT DID NOT WASTE IT."], path: ["THE ROAD.", "IT IS IN PLAY. SO ARE YOU."] };
function rest(st, x, y, plug) {
  const P = st.players[st.cur], h = holeOf(st);
  P.x = Math.round(x * 100) / 100; P.y = Math.round(y * 100) / 100;
  P.lie = surfaceAt(h, P.x, P.y);
  P.plug = Boolean(plug) && P.lie === "bunker";
  st.ball = { x: P.x, y: P.y, z: 0 };
  const m = LIE_MSG[P.lie] || ["", ""];
  st.msg = st.fl?.putt && P.lie === "green" ? (Math.hypot(h.pin.x - P.x, h.pin.y - P.y) < 1 ? "TAP-IN. THE DEPARTMENT WAITS." : "MISSED. NOTED.") : P.plug ? "PLUGGED. THE SAND HAS FILED A CLAIM." : `${m[0]} ${m[1]}`;
  st.tone = P.lie === "bunker" || P.lie === "trees" ? "warn" : "";
  if (P.strokes >= MAX_STROKES) { P.holed = true; P.strokes = MAX_STROKES; st.msg = "PICKED UP. THE DEPARTMENT HAS SEEN ENOUGH."; st.tone = "harm"; }
  st.phase = "rest"; st.t = 0;
}
function penalty(st, kind, x, y) {
  const P = st.players[st.cur], h = holeOf(st);
  P.strokes++;
  st.ev.push(kind === "water" ? "splash" : "ob");
  if (st.shot) st.shot.splash = true;
  if (kind === "ob") {
    P.x = P.prev.x; P.y = P.prev.y; P.lie = P.prev.lie;
    st.msg = "OUT OF BOUNDS. +1. PLAY IT AGAIN.";
  } else {
    // a drop where it went in: back along the line it came in on until dry
    const ox = st.fl.ox, oy = st.fl.oy, d = Math.hypot(x - ox, y - oy) || 1;
    let px = x, py = y;
    for (let k = 0; k < 400 && surfaceAt(h, px, py) === "water"; k++) { px -= (x - ox) / d; py -= (y - oy) / d; }
    px -= (x - ox) / d * 2; py -= (y - oy) / d * 2;
    const s = surfaceAt(h, px, py);
    if (s === "ob" || s === "water") { px = P.prev.x; py = P.prev.y; }
    P.x = Math.round(px * 100) / 100; P.y = Math.round(py * 100) / 100;
    P.lie = surfaceAt(h, P.x, P.y);
    st.msg = "IN THE WATER. +1. THE WATER WAS DISCLOSED.";
  }
  P.plug = false;
  st.tone = "harm";
  st.ball = { x: P.x, y: P.y, z: 0 };
  if (P.strokes >= MAX_STROKES) { P.holed = true; P.strokes = MAX_STROKES; st.msg = "PICKED UP. THE DEPARTMENT HAS SEEN ENOUGH."; }
  st.phase = "rest"; st.t = 0;
}
export const SCORE_NAME = (d, strokes) => strokes === 1 ? "HOLE IN ONE. AN AUDIT IS OPEN." : d <= -3 ? "ALBATROSS. UNDER REVIEW." : d === -2 ? "EAGLE. UNDER REVIEW." : d === -1 ? "BIRDIE. SUSPICIOUS." : d === 0 ? "PAR. COMPLIANT." : d === 1 ? "BOGEY. EXPECTED." : d === 2 ? "DOUBLE BOGEY. FILED." : `+${d}. FILED WITHOUT COMMENT.`;
function holed(st, x, y) {
  const P = st.players[st.cur], h = holeOf(st);
  P.x = x; P.y = y; P.holed = true; P.lie = "green";
  st.ball = { x, y, z: 0 };
  st.msg = SCORE_NAME(P.strokes - h.par, P.strokes);
  st.tone = P.strokes - h.par < 0 ? "good" : "";
  st.ev.push("cup");
  st.phase = "rest"; st.t = 0;
}
function nextTurn(st) {
  const h = holeOf(st), left = st.players.map((P, i) => [P, i]).filter(([P]) => !P.holed);
  if (!left.length) {
    st.players.forEach(P => { P.card[st.hi] = P.strokes; });
    if (st.players.length > 1) {
      const [a, b] = st.players.map(P => P.strokes);
      if (a !== b) st.honor = a < b ? [0, 1] : [1, 0];
    }
    st.phase = "holeEnd"; st.t = 0; st.msg = "";
    st.ev.push("holeEnd");
    return;
  }
  const onTee = left.filter(([P]) => P.strokes === 0);
  if (onTee.length) st.cur = st.honor.find(i => onTee.some(([, j]) => j === i));
  else st.cur = left.sort((a, b) => Math.hypot(h.pin.x - b[0].x, h.pin.y - b[0].y) - Math.hypot(h.pin.x - a[0].x, h.pin.y - a[0].y) || a[1] - b[1])[0][1];
  startTurn(st);
}

// ---- the card --------------------------------------------------------------------------------------
export const toParText = (d) => (d === 0 ? "E" : d > 0 ? `+${d}` : String(d));
export function cardOf(st) {
  const C = courseOf(st);
  const rows = st.holes.map((hi, k) => ({ n: C[hi].n, par: C[hi].par, yards: C[hi].yards, s: st.players.map(P => P.card[k] ?? null) }));
  const done = rows.filter(r => r.s.every(v => v != null));
  const total = st.players.map((_, i) => done.reduce((a, r) => a + r.s[i], 0));
  const par = done.reduce((a, r) => a + r.par, 0);
  let won = [0, 0], halved = 0;
  if (st.players.length > 1) for (const r of done) { if (r.s[0] < r.s[1]) won[0]++; else if (r.s[1] < r.s[0]) won[1]++; else halved++; }
  return { rows, total, par, toPar: total.map(t => t - par), played: done.length, won, halved };
}
function finish(st) {
  const c = cardOf(st);
  let winner = null, line;
  if (st.mode === "match") {
    winner = c.won[0] > c.won[1] ? 0 : c.won[1] > c.won[0] ? 1 : null;
    const m = Math.abs(c.won[0] - c.won[1]);
    line = winner == null ? "MATCH HALVED. NOBODY IS PROMOTED." : `${st.players[winner].name} WINS THE MATCH ${m} UP. EXHIBITION: IT COUNTS FOR NOTHING.`;
  } else line = `${toParText(c.toPar[0])} OVER ${c.played} HOLES. EXHIBITION: IT COUNTS FOR NOTHING.`;
  st.result = { v: VERSION, mode: st.mode, holes: c.rows.map(r => ({ n: r.n, par: r.par, s: r.s })), total: c.total, par: c.par, toPar: c.toPar, won: c.won, halved: c.halved, winner, line, ticks: st.tick };
  st.phase = "done"; st.t = 0;
  st.ev.push("done");
}

// ---- the input log: run-length button bits, flat [bits, count, bits, count, ...] ----------------------
export function logPush(log, bits) {
  const n = log.length;
  if (n && log[n - 2] === bits) log[n - 1]++;
  else log.push(bits, 1);
  return log;
}
// Replay a v2 round from its config and log (./replay.js routes a v1 record to ./v1/sim.js).
export function replay(cfg, log, maxTicks = 2_000_000) {
  const st = newRound(cfg);
  for (let i = 0; i < log.length && st.phase !== "done"; i += 2) for (let k = 0; k < log[i + 1] && st.phase !== "done"; k++) { step(st, log[i]); st.ev.length = 0; }
  while (st.phase !== "done" && st.tick < maxTicks) { step(st, 0); st.ev.length = 0; }
  return st;
}
// A whole round played by the bot: -> {st, log}
export function autoplay(cfg, maxTicks = 2_000_000) {
  const st = newRound(cfg), log = [];
  while (st.phase !== "done" && st.tick < maxTicks) { const b = botBits(st); logPush(log, b); step(st, b); st.ev.length = 0; }
  return { st, log };
}
