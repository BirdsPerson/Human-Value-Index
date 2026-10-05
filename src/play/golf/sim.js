// THE DEPARTMENT LINKS, the round: a pure, fixed-step (60 Hz) state machine. No DOM, no clock,
// no Math.random: newRound(cfg) and the same per-tick button bits give the same round, tick for
// tick, so a round is {cfg, inputLog} and can be replayed anywhere (scripts/check-golf.mjs does;
// a server can later). The renderer (render.js) only reads the state.
//
// A shot: AIM (left/right; B or down for a shorter club, up for a longer one), then the classic
// three-press meter: A starts the swing, A sets the power as the marker climbs, A sets the
// accuracy as it falls back through the line. Early is a hook, late a slice, missed a shank.
// Wind drifts the ball in flight; trees stop it; water costs a stroke and a drop; out of bounds
// costs a stroke and the shot again from where it was played. On the green the putter rolls the
// ball over the green's fall (course.js slopeAt).

import { COURSE, surfaceAt, slopeAt, treeAt, lineDist, pointAlong, rngStep, fnv } from "./course.js";

export const VERSION = 1;
export const HZ = 60;
const DT = 1 / HZ;
export const BTN = { L: 1, R: 2, U: 4, D: 8, A: 16, B: 32 };

// carry in yards at full power from a good lie; loft: apex as a share of carry; roll: share of
// carry run out on fairway
export const CLUBS = [
  { id: "1W", carry: 235, loft: 0.12, roll: 0.12 },
  { id: "3W", carry: 215, loft: 0.13, roll: 0.10 },
  { id: "3I", carry: 192, loft: 0.15, roll: 0.08 },
  { id: "5I", carry: 172, loft: 0.17, roll: 0.07 },
  { id: "7I", carry: 152, loft: 0.20, roll: 0.05 },
  { id: "9I", carry: 132, loft: 0.24, roll: 0.04 },
  { id: "PW", carry: 110, loft: 0.27, roll: 0.03 },
  { id: "SW", carry: 78, loft: 0.32, roll: 0.02 },
  { id: "PT", carry: 0, putt: true },
];
const PT = CLUBS.length - 1;
export const LIE = { tee: 1, fairway: 1, fringe: 0.95, green: 1, rough: 0.82, bunker: 0.6, trees: 0.55 };
export const FRIC = { green: 1.5, fringe: 2.6, fairway: 3.6, tee: 3.6, rough: 9, trees: 22, bunker: 30 };
const ROLLF = { green: 0.7, fringe: 0.8, fairway: 1, tee: 1, rough: 0.3, trees: 0, bunker: 0 };
export const PUTT_MAX = 22;          // yards on a flat green at full power
export const CUP_R = 0.075, CAPTURE_V = 2.1, MAX_STROKES = 10;
export const RISE = 54, RISE_PUTT = 90, ACC_ZONE = 0.12, ACC_END = -0.14;
const TREE_H = 11;

const lieFactor = (club, lie) => (lie === "bunker" && CLUBS[club].id === "SW" ? 0.92 : LIE[lie] ?? 1);
const flightT = (carry) => 1.1 + carry / 160;      // seconds in the air
export const reachOf = (club, lie) => { const c = CLUBS[club]; return c.putt ? PUTT_MAX : c.carry * lieFactor(club, lie) * (1 + c.roll * 0.8); };
export const holeOf = (st) => COURSE[st.holes[st.hi]];
export const dirOf = (aim) => [Math.sin(aim), Math.cos(aim)];   // aim 0 = straight up the hole, + = right

// ---- the shot a caddie would suggest -------------------------------------------------------------
// -> {club, aim, tx, ty, d (to the target), pin (to the pin)}
export function planShot(h, P) {
  const pin = Math.hypot(h.pin.x - P.x, h.pin.y - P.y);
  const aimAt = (tx, ty) => Math.atan2(tx - P.x, ty - P.y);
  if (P.lie === "green" || (P.lie === "fringe" && pin < 14)) return { club: PT, aim: aimAt(h.pin.x, h.pin.y), tx: h.pin.x, ty: h.pin.y, d: pin, pin };
  const longest = P.lie === "tee" ? 0 : 1;
  if (reachOf(longest, P.lie) >= pin * 0.97) {
    let club = longest;
    for (let c = PT - 1; c >= longest; c--) if (reachOf(c, P.lie) >= pin) { club = c; break; }
    return { club, aim: aimAt(h.pin.x, h.pin.y), tx: h.pin.x, ty: h.pin.y, d: pin, pin };
  }
  const { along } = lineDist(h.pts, P.x, P.y);
  const [tx, ty] = pointAlong(h.pts, along + reachOf(longest, P.lie) * 0.95);
  return { club: longest, aim: aimAt(tx, ty), tx, ty, d: Math.hypot(tx - P.x, ty - P.y), pin };
}

// ---- a new round -------------------------------------------------------------------------------
// cfg: {seed, mode: "stroke" | "match", start (0 or 9), count (9 or 18), player: {name, color},
//       cpu: {slug, name, rating, color} | null}
export function newRound(cfg) {
  const count = cfg.count === 9 ? 9 : 18, start = count === 9 && cfg.start === 9 ? 9 : 0;
  const seed = (cfg.seed >>> 0) || 1;
  const mk = (p, kind) => ({ name: String(p?.name || "SUBJECT").toUpperCase().slice(0, 18), kind, slug: p?.slug || null, rating: kind === "cpu" ? Math.max(0, Math.min(99, p.rating | 0)) : null, color: p?.color || null, card: [], x: 0, y: 0, lie: "tee", strokes: 0, holed: false, prev: null });
  const players = [mk(cfg.player, "human")];
  const mode = cfg.mode === "match" && cfg.cpu ? "match" : "stroke";
  if (mode === "match") players.push(mk(cfg.cpu, "cpu"));
  const st = {
    v: VERSION, cfg: { seed, mode, start, count, player: cfg.player || null, cpu: mode === "match" ? cfg.cpu : null },
    rng: fnv(`golf|${seed}`), mode, holes: Array.from({ length: count }, (_, i) => start + i), hi: 0,
    players, cur: 0, honor: players.map((_, i) => i), phase: "intro", t: 0, tick: 0, prev: 0, hold: 0,
    aim: 0, club: 0, meter: null, fl: null, ball: null, wind: null, msg: "", tone: "", ev: [], plan: null, result: null,
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
  for (const P of st.players) Object.assign(P, { x: 0, y: 0, lie: "tee", strokes: 0, holed: false, prev: null });
  st.cur = st.honor[0];
  st.phase = "intro"; st.t = 0; st.msg = ""; st.ball = null; st.fl = null; st.meter = null;
  st.ev.push("hole");
}
function startTurn(st) {
  const P = st.players[st.cur], h = holeOf(st);
  const plan = planShot(h, P);
  st.club = plan.club; st.phase = "aim"; st.t = 0; st.meter = null; st.fl = null; st.msg = ""; st.hold = 0;
  st.ball = { x: P.x, y: P.y, z: 0 };
  st.aim = plan.aim;
  st.plan = P.kind === "cpu" ? planCpu(st, h, P, plan) : null;
}

// ---- the CPU figure -----------------------------------------------------------------------------
// The caddie's plan, then the figure's own errors: the lower the rating, the wider every one.
// Pressing is quantised to the meter's ticks like anyone's.
function planCpu(st, h, P, plan) {
  const k = (100 - P.rating) / 100, skill = 0.35 + 0.65 * (P.rating / 100);
  const c = CLUBS[plan.club];
  let aim = plan.aim, p;
  if (c.putt) {
    const [dx, dy] = dirOf(aim), rx = dy, ry = -dx;
    const [sx, sy] = slopeAt(h, (P.x + h.pin.x) / 2, (P.y + h.pin.y) / 2);
    const along = sx * dx + sy * dy, perp = sx * rx + sy * ry;
    const decel = Math.max(0.6, FRIC.green - along);
    const v0 = Math.sqrt(2 * decel * (plan.pin + 0.3));
    p = (v0 * v0) / (2 * FRIC.green * PUTT_MAX);
    const tt = v0 / decel, drift = 0.25 * perp * tt * tt;
    aim -= Math.atan2(drift, Math.max(1, plan.pin)) * skill;
    p *= 1 + gauss(st) * (0.06 + 0.12 * k);
    aim += gauss(st) * (0.02 + 0.06 * k);
  } else {
    const lf = lieFactor(plan.club, P.lie), full = c.carry * lf;
    const toPin = plan.tx === h.pin.x && plan.ty === h.pin.y;
    const carry = toPin ? plan.d / (1 + c.roll * ROLLF.green) : plan.d / (1 + c.roll * 0.8);
    p = Math.min(1, carry / full);
    // wind: drift = wind * 0.45 * T at the end of the flight; the figure reads part of it
    const T = flightT(full * p), [dx, dy] = dirOf(aim);
    const wx = st.wind.x * 0.45 * T, wy = st.wind.y * 0.45 * T;
    const head = wx * dx + wy * dy, cross = wx * dy - wy * dx;
    aim -= Math.atan2(cross, Math.max(20, full * p)) * skill;
    p = Math.min(1, p - (head / full) * skill);
    p *= 1 + gauss(st) * (0.03 + 0.07 * k);
    aim += gauss(st) * (0.015 + 0.035 * k);
  }
  const a = gauss(st) * (0.2 + 0.6 * k);                 // normalised accuracy error: 0 is the line
  const rise = c.putt ? RISE_PUTT : RISE;
  const t1 = Math.max(2, Math.min(rise, Math.round(Math.max(0.02, p) * rise)));
  const pw = t1 / rise;
  const t2 = t1 + Math.max(1, Math.round((pw + a * ACC_ZONE) * rise));   // marker = pw - (t2 - t1)/rise = -a*ACC_ZONE
  return { aim, club: plan.club, t1, t2, wait: 30 + Math.floor(rand(st) * 30) };
}

// ---- the bot (scripts/check-golf.mjs, and an attract mode): input bits from the state alone ----------
// Never touches the state; plays the caddie's plan with perfect timing.
export function botBits(st) {
  if (st.prev & BTN.A) return 0;
  const P = st.players[st.cur];
  if (P.kind !== "human" && (st.phase === "aim" || st.phase === "meter")) return 0;
  if (st.phase === "intro" || st.phase === "holeEnd") return st.t > 20 ? BTN.A : 0;
  if (st.phase === "aim") {
    if (st.t < 8) return 0;
    return BTN.A;
  }
  if (st.phase === "meter") {
    const m = st.meter, h = holeOf(st), c = CLUBS[st.club];
    let p;
    if (c.putt) {
      const d = Math.hypot(h.pin.x - P.x, h.pin.y - P.y);
      p = (2 * FRIC.green * (d + 0.3)) / (2 * FRIC.green * PUTT_MAX);
    } else {
      const plan = planShot(h, P), full = c.carry * lieFactor(st.club, P.lie);
      const toPin = plan.tx === h.pin.x && plan.ty === h.pin.y;
      p = Math.min(1, (toPin ? plan.d / (1 + c.roll * ROLLF.green) : plan.d / (1 + c.roll * 0.8)) / full);
    }
    // the press lands on the next tick's marker: press on the tick that puts it nearest the mark
    if (m.stage === 1) return (m.k + 1.5) / m.rise >= p ? BTN.A : 0;
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
      const m = st.meter;
      m.k++;
      const press = human ? A : (m.stage === 1 ? m.k === st.plan.t1 : m.k === st.plan.t2);
      if (m.stage === 1) {
        m.m = Math.min(1, m.k / m.rise);
        if (press || m.k >= m.rise) { m.power = m.m; m.stage = 2; st.ev.push("tick"); }
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
  st.meter = { stage: 1, m: 0, k: 0, rise: CLUBS[st.club].putt ? RISE_PUTT : RISE, power: null, acc: null };
  st.ev.push("swing");
}

// The meter's reading -> the shot.
function strike(st) {
  const P = st.players[st.cur], h = holeOf(st), c = CLUBS[st.club], m = st.meter;
  const a = Math.max(-1.25, Math.min(1.25, -m.acc / ACC_ZONE));     // early (marker above the line): a < 0, a hook
  P.prev = { x: P.x, y: P.y, lie: P.lie };
  P.strokes++;
  st.ev.push(Math.abs(a) > 1 ? "shank" : "hit");
  st.t = 0;
  st.ball = { x: P.x, y: P.y, z: 0 };
  if (c.putt) {
    const aim = st.aim + a * 0.05;
    const v0 = Math.sqrt(2 * FRIC.green * PUTT_MAX * m.power);
    const [dx, dy] = dirOf(aim);
    st.fl = { vx: dx * v0, vy: dy * v0, ox: P.x, oy: P.y, putt: true };
    st.phase = "roll";
    return;
  }
  const carry = c.carry * lieFactor(st.club, P.lie) * m.power;
  const T = flightT(carry), ticks = Math.max(20, Math.round(T * HZ));
  const aim = st.aim + a * 0.035;
  st.fl = { ox: P.x, oy: P.y, aim, carry, ticks, T, apex: carry * c.loft, curve: a * carry * 0.17, a, club: st.club };
  st.phase = "flight";
}
// Where the ball is, f (0..1) of the way through its flight.
export function flightAt(fl, wind, f) {
  const [dx, dy] = dirOf(fl.aim), rx = dy, ry = -dx;
  const fwd = fl.carry * f, side = fl.curve * f * f, wk = 0.45 * fl.T * f * f;
  return { x: fl.ox + dx * fwd + rx * side + wind.x * wk, y: fl.oy + dy * fwd + ry * side + wind.y * wk, z: fl.apex * 4 * f * (1 - f) };
}
function flight(st) {
  const fl = st.fl, h = holeOf(st), f = Math.min(1, st.t / fl.ticks);
  const p = flightAt(fl, st.wind, f);
  st.ball = p;
  if (f > 0.06 && p.z < TREE_H && treeAt(h, p.x, p.y)) {   // into the branches: it drops where it hit
    st.ev.push("tree");
    st.fl = { ...fl, vx: 0, vy: 0 };
    return land(st, p.x, p.y, 0, 0);
  }
  if (f < 1) return;
  const q = flightAt(fl, st.wind, 0.97), vx = p.x - q.x, vy = p.y - q.y, n = Math.hypot(vx, vy) || 1;
  const s = surfaceAt(h, p.x, p.y);
  if (Math.hypot(p.x - h.pin.x, p.y - h.pin.y) < 0.1) return holed(st, h.pin.x, h.pin.y);   // in, on the fly
  const R = fl.carry * CLUBS[fl.club].roll * (ROLLF[s] ?? 0);
  const v0 = Math.sqrt(2 * (FRIC[s] ?? 30) * R);
  st.ev.push("land");
  land(st, p.x, p.y, (vx / n) * v0, (vy / n) * v0);
}
function land(st, x, y, vx, vy) {
  const h = holeOf(st), s = surfaceAt(h, x, y);
  if (s === "water") return penalty(st, "water", x, y);
  if (s === "ob") return penalty(st, "ob", x, y);
  st.fl = { ...st.fl, vx, vy };
  st.ball = { x, y, z: 0 };
  st.phase = "roll"; st.t = 0;
}
function roll(st) {
  const h = holeOf(st), fl = st.fl;
  let { x, y } = st.ball || { x: fl.ox, y: fl.oy };
  if (!st.ball) st.ball = { x, y, z: 0 };
  const s = surfaceAt(h, x, y);
  if (s === "water" || s === "ob") return penalty(st, s, x, y);
  const fr = FRIC[s] ?? 30, [gx, gy] = slopeAt(h, x, y);
  let vx = fl.vx, vy = fl.vy;
  const sp = Math.hypot(vx, vy);
  if (sp <= fr * DT && Math.hypot(gx, gy) < fr) return rest(st, x, y);
  vx += gx * DT; vy += gy * DT;
  const n = Math.hypot(vx, vy) || 1, dec = Math.min(n, fr * DT);
  vx -= (vx / n) * dec; vy -= (vy / n) * dec;
  const nx = x + vx * DT, ny = y + vy * DT;
  // the cup: the closest the path came to it this tick
  const ux = nx - x, uy = ny - y, L2 = ux * ux + uy * uy;
  const t = L2 ? Math.max(0, Math.min(1, ((h.pin.x - x) * ux + (h.pin.y - y) * uy) / L2)) : 0;
  if (Math.hypot(x + ux * t - h.pin.x, y + uy * t - h.pin.y) < CUP_R && sp < CAPTURE_V) return holed(st, h.pin.x, h.pin.y);
  fl.vx = vx; fl.vy = vy;
  st.ball = { x: nx, y: ny, z: 0 };
  if (st.t > HZ * 30) rest(st, nx, ny);           // never rolls forever
}
const LIE_MSG = { fairway: ["FAIRWAY.", "ACCEPTABLE."], rough: ["ROUGH.", "NOTED ON YOUR FILE."], bunker: ["BUNKER.", "SAND. AS PREDICTED."], trees: ["TREES.", "THE TREES WERE DISCLOSED."], green: ["ON THE GREEN.", "COMPLIANT."], fringe: ["FRINGE.", "NEARLY COMPLIANT."], tee: ["STILL ON THE TEE.", "THE DEPARTMENT SAW THAT."] };
function rest(st, x, y) {
  const P = st.players[st.cur], h = holeOf(st);
  P.x = Math.round(x * 100) / 100; P.y = Math.round(y * 100) / 100;
  P.lie = surfaceAt(h, P.x, P.y);
  st.ball = { x: P.x, y: P.y, z: 0 };
  const m = LIE_MSG[P.lie] || ["", ""];
  st.msg = st.fl?.putt && P.lie === "green" ? (Math.hypot(h.pin.x - P.x, h.pin.y - P.y) < 1 ? "TAP-IN. THE DEPARTMENT WAITS." : "MISSED. NOTED.") : `${m[0]} ${m[1]}`;
  st.tone = P.lie === "bunker" || P.lie === "trees" ? "warn" : "";
  if (P.strokes >= MAX_STROKES) { P.holed = true; P.strokes = MAX_STROKES; st.msg = "PICKED UP. THE DEPARTMENT HAS SEEN ENOUGH."; st.tone = "harm"; }
  st.phase = "rest"; st.t = 0;
}
function penalty(st, kind, x, y) {
  const P = st.players[st.cur], h = holeOf(st);
  P.strokes++;
  st.ev.push(kind === "water" ? "splash" : "ob");
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
    st.msg = "IN THE WATER. +1. THE POND WAS DISCLOSED.";
  }
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
  // honour on the tee, then the ball farthest from the hole plays
  const onTee = left.filter(([P]) => P.strokes === 0);
  if (onTee.length) st.cur = st.honor.find(i => onTee.some(([, j]) => j === i));
  else st.cur = left.sort((a, b) => Math.hypot(h.pin.x - b[0].x, h.pin.y - b[0].y) - Math.hypot(h.pin.x - a[0].x, h.pin.y - a[0].y) || a[1] - b[1])[0][1];
  startTurn(st);
}

// ---- the card --------------------------------------------------------------------------------------
export const toParText = (d) => (d === 0 ? "E" : d > 0 ? `+${d}` : String(d));
export function cardOf(st) {
  const rows = st.holes.map((hi, k) => ({ n: COURSE[hi].n, par: COURSE[hi].par, yards: COURSE[hi].yards, s: st.players.map(P => P.card[k] ?? null) }));
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
// Replay a round from its config and log. Ticks after the log are empty input; maxTicks bounds it.
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
