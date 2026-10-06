// THE LANES: ten-pin bowling as a pure, deterministic 60Hz sim. No DOM, no clock, no Math.random:
// a game is (cfg, input log) and replays tick for tick (scripts/check-bowl.mjs). The step uses only
// + - * / and Math.sqrt (exact in IEEE), never sin/cos/atan, so every engine plays the same game.
//
// UNITS. Inches and seconds. x across the lane (0 the centre board, + to the bowler's right), y down
// the lane from the foul line. The lane is 41.5 in wide (39 boards), the head pin's spot 60 ft out.
//
// THE BALL. A solid sphere that skids, hooks and rolls. Its centre moves at v; its spin is carried as
// w, the velocity it would have if it were rolling without slipping. The lane's friction acts on the
// slip s = v - w: dv = -mu g dt s^, dw = +5/2 mu g dt s^ (a solid sphere), so the slip dies at 7/2 mu g
// and the ball ends rolling at (5 v0 + 2 w0) / 7. A release with side rotation (w across the lane) and
// little forward roll skids through the oil (mu small), the slip turns towards the side as the forward
// slip wears away, and on the dry backend (mu large) the ball hooks and then rolls: skid, hook, roll,
// with nothing scripted. The oil (a house shot): fresh in the heads, a crown of extra oil on the middle
// boards, thinning to 40 ft, dry after it.
//
// THE PINS. 2D rigid bodies, "lite": a standing pin is a disc at its belly (4.77 in); hit hard enough
// it falls the way it was pushed and becomes a capsule that grows as it topples (to 15 in lying) and
// slides, spins and sweeps the deck. Ball-pin, pin-pin and capsule-capsule contacts are impulses with
// restitution and the capsules' turning; the kickbacks (the side walls of the pin deck) throw pins back
// in. A light knock rocks a pin and it stays up; a firmer one may wobble it down (the seeded rng). The
// pocket (1-3 for a right-hander) at 4-6 degrees carries all ten more often than not; a head-on hit
// leaves splits (4-6, 7-10, the big four); the Brooklyn side (1-2) strikes now and then.
//
// THE GAME. 1-4 players in turn (hot seat), humans and CPU figures; ten frames; fouls; bumpers.

import { frames, position, isSplit } from "./score.js";

export const VERSION = 1;
export const VERSIONS = [1];
export const HZ = 60;
const SUB = 16, DT = 1 / (HZ * SUB);

// ---- the lane --------------------------------------------------------------------------------------
export const LANE_HW = 20.75;            // half the lane's width
export const BOARD = 41.5 / 39;          // one board
export const GUTTER_W = 9.25;
export const KICK_X = LANE_HW + GUTTER_W + 0.5;   // the kickbacks (side walls of the pin deck)
export const HEAD_Y = 720;               // the 1 pin's spot (60 ft)
export const PIT_Y = 756;                // the end of the pin deck: the pit
export const KICK_Y0 = HEAD_Y - 28;      // where the kickbacks start
export const ARROWS_Y = 180;             // the target arrows (about 15 ft)
export const OIL_LEN = 480;              // 40 ft of oil
export const APPROACH = 180;             // 15 ft of approach behind the foul line (drawn)
export const R_BALL = 4.25, R_PIN = 2.383, L_PIN = 15, R_LYING = 2.0;
export const G = 386.1;                  // in/s^2
export const MPH = 17.6;                 // in/s per mph
const ROW = 12 * Math.sqrt(3) / 2;       // pin rows are 10.39 in apart
// The ten spots: [n, x, y] (the 7 at the back left, the 10 at the back right).
export const PIN_SPOTS = [
  [1, 0, HEAD_Y],
  [2, -6, HEAD_Y + ROW], [3, 6, HEAD_Y + ROW],
  [4, -12, HEAD_Y + 2 * ROW], [5, 0, HEAD_Y + 2 * ROW], [6, 12, HEAD_Y + 2 * ROW],
  [7, -18, HEAD_Y + 3 * ROW], [8, -6, HEAD_Y + 3 * ROW], [9, 6, HEAD_Y + 3 * ROW], [10, 18, HEAD_Y + 3 * ROW],
];
export const BTN = { L: 1, R: 2, AL: 4, AR: 8, A: 16, B: 32 };
export const WEIGHTS = [8, 10, 12, 14, 16];
const M_PIN = 3.5;
const I_PIN = M_PIN * L_PIN * L_PIN / 12;
// the ball drives through the deck harder than its weight alone: it rolls and turns (its own inertia
// and the spin the friction keeps), and it meets a pin low while the pin's mass is in its belly
const BALL_DRIVE = 1.35;

// the oil's friction at (x, y): the heads fresh, a crown of oil on the middle boards, dry from 40 ft
const MU_OIL = 0.035, MU_DRY = 0.19;
export function muAt(x, y, k = 1) {
  if (y > OIL_LEN + 36) return MU_DRY * k;
  const edge = Math.abs(x) / LANE_HW;                       // 0 middle .. 1 the gutter
  let m = MU_OIL * (1 + 0.9 * edge * edge);                 // less oil outside the crown: more grip
  if (y < 180) m *= 0.85;                                    // fresh in the heads
  if (y > OIL_LEN) { const f = (y - OIL_LEN) / 36; m = m + (MU_DRY - m) * f * f * (3 - 2 * f); }
  return m * k;
}

// ---- the seeded rng (mulberry32) ----------------------------------------------------------------------
function rnd(st) {
  let a = (st.rs = (st.rs + 0x6d2b79f5) | 0);
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---- a game ---------------------------------------------------------------------------------------------
// cfg: {seed, players: [{name, kind: "human" | "cpu", key, rating, weight, hand: 1 | -1, bumpers}], fouls,
//       easy, v}
export function newGame(cfg) {
  const players = (cfg.players || [{ name: "YOU", kind: "human" }]).slice(0, 4).map((p, i) => ({
    name: String(p.name || `PLAYER ${i + 1}`).slice(0, 24), kind: p.kind === "cpu" ? "cpu" : "human", key: p.key || null,
    rating: clamp(Number(p.rating) || 60, 0, 99), weight: WEIGHTS.includes(Number(p.weight)) ? Number(p.weight) : 14,
    hand: p.hand === -1 ? -1 : 1, bumpers: !!p.bumpers, balls: [], posX: 0, aim: 0,
  }));
  const st = {
    v: VERSION, seed: (Number(cfg.seed) >>> 0) || 1, rs: (Number(cfg.seed) >>> 0) || 1, fouls: cfg.fouls !== false, easy: !!cfg.easy,
    players, cur: 0, phase: "aim", t: 0, frame: 0, oilK: 1, pins: [], ball: null, throw: null, meter: null,
    lastRoll: null, events: [], over: false, rollT: 0, phaseT: 0, standingBefore: null,
  };
  st.oilK = 0.95 + rnd(st) * 0.1;          // tonight's oil: a little more or less
  rack(st, true);
  beginTurn(st);
  return st;
}
const P = (st) => st.players[st.cur];

// A fresh rack (jittered a hair by the pinsetter) or the standing pins kept where they stand.
function rack(st, fresh) {
  if (fresh) {
    st.pins = PIN_SPOTS.map(([n, x, y]) => ({ n, x: x + (rnd(st) - 0.5) * 0.25, y: y + (rnd(st) - 0.5) * 0.25, vx: 0, vy: 0, st: 0, ux: 0, uy: 1, top: 0, w: 0, hl: 0 }));
  } else {
    st.pins = st.pins.filter(p => p.st === 0).map(p => ({ ...p, vx: 0, vy: 0, w: 0 }));
  }
}
export const standing = (st) => st.pins.filter(p => p.st === 0).map(p => p.n).sort((a, b) => a - b);

function beginTurn(st) {
  const p = P(st);
  st.phase = "aim"; st.phaseT = 0; st.ball = null; st.throw = null; st.meter = null;
  if (p.kind === "cpu") st.cpuPlan = cpuPlan(st, p);
}

// ---- the throw -----------------------------------------------------------------------------------------
// {x: release (in, + right), a: line (dx per dy), mph, r: rev -0.5..1 (+ hooks to the glove side's
// left for a right-hander), foul}
export const HOOK = 120;                 // in/s of side roll at r = 1 and 18 mph
function release(st, th) {
  const p = P(st);
  const x = clamp(th.x, -LANE_HW + R_BALL, LANE_HW - R_BALL);
  const a = clamp(th.a, -0.08, 0.08), mph = clamp(th.mph, 6, 24), r = clamp(th.r, -0.5, 1);
  const v = mph * MPH, n = Math.sqrt(1 + a * a);
  const vx = v * a / n, vy = v / n;
  st.ball = { x, y: 0, vx, vy, wx: -p.hand * r * HOOK * (mph / 18), wy: vy * 0.35, m: p.weight, gutter: false, gone: false, d: 0, hit: false, passT: -1 };
  st.throw = { x, a, mph, r, foul: !!th.foul && st.fouls };
  st.standingBefore = standing(st);
  st.phase = "roll"; st.phaseT = 0; st.events.push("release");
}

// ---- the physics ------------------------------------------------------------------------------------
function ballStep(st, b, dt) {
  if (b.gone) return;
  const p = P(st);
  if (!b.gutter) {
    const sx = b.vx - b.wx, sy = b.vy - b.wy, s = Math.sqrt(sx * sx + sy * sy);
    if (s > 1e-6) {
      const dv = muAt(b.x, b.y, st.oilK) * G * dt;
      if (3.5 * dv >= s) { const rx = (5 * b.vx + 2 * b.wx) / 7, ry = (5 * b.vy + 2 * b.wy) / 7; b.vx = b.wx = rx; b.vy = b.wy = ry; }
      else { b.vx -= dv * sx / s; b.vy -= dv * sy / s; b.wx += 2.5 * dv * sx / s; b.wy += 2.5 * dv * sy / s; }
    }
  }
  b.x += b.vx * dt; b.y += b.vy * dt;
  b.d += Math.sqrt(b.vx * b.vx + b.vy * b.vy) * dt;
  if (!b.gutter && b.y < PIT_Y && Math.abs(b.x) > LANE_HW - (p.bumpers ? R_BALL : 0)) {
    if (p.bumpers) {
      // the bumper rail: back onto the lane, the side roll mostly spent
      b.x = Math.sign(b.x) * (LANE_HW - R_BALL); b.vx = -b.vx * 0.55; b.wx = b.wx * 0.4;
      st.events.push("bumper");
    } else {
      b.gutter = true; b.x = Math.sign(b.x) * (LANE_HW + GUTTER_W / 2); b.vx = 0; b.wx = 0;
      if (b.y < HEAD_Y) st.events.push("gutter");
    }
  }
  if (b.y > PIT_Y + 14) { b.gone = true; st.events.push(b.gutter ? "pitsoft" : "pit"); }
}

// the closest points between segments p1-q1 and p2-q2 -> [s, t] (parameters 0..1)
function segSeg(p1x, p1y, q1x, q1y, p2x, p2y, q2x, q2y) {
  const d1x = q1x - p1x, d1y = q1y - p1y, d2x = q2x - p2x, d2y = q2y - p2y, rx = p1x - p2x, ry = p1y - p2y;
  const a = d1x * d1x + d1y * d1y, e = d2x * d2x + d2y * d2y, f = d2x * rx + d2y * ry;
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) return [0, 0];
  if (a <= 1e-9) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = d1x * rx + d1y * ry;
    if (e <= 1e-9) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = d1x * d2x + d1y * d2y, den = a * e - b * b;
      s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  return [s, t];
}
// A pin's shape now: a disc (standing) or a capsule from its base along u (falling, lying).
function shapeOf(p) {
  if (p.st === 0) return { ax: p.x, ay: p.y, bx: p.x, by: p.y, r: R_PIN, cx: p.x, cy: p.y };
  const len = L_PIN * p.top;
  return { ax: p.x, ay: p.y, bx: p.x + p.ux * len, by: p.y + p.uy * len, r: p.top < 0.5 ? R_PIN : R_LYING, cx: p.x + p.ux * len / 2, cy: p.y + p.uy * len / 2 };
}
// One contact between bodies A and B (either may turn): -> impulse applied, or 0.
// A body: {m, I (0: does not turn), vx, vy, w, cx, cy}; n points from B to A; (px, py) the contact.
function impulse(A, B, nx, ny, px, py, e) {
  const rax = px - A.cx, ray = py - A.cy, rbx = px - B.cx, rby = py - B.cy;
  const vax = A.vx - A.w * ray, vay = A.vy + A.w * rax, vbx = B.vx - B.w * rby, vby = B.vy + B.w * rbx;
  const vn = (vax - vbx) * nx + (vay - vby) * ny;
  if (vn >= 0) return 0;
  const ra = rax * ny - ray * nx, rb = rbx * ny - rby * nx;
  const k = 1 / A.m + 1 / B.m + (A.I ? ra * ra / A.I : 0) + (B.I ? rb * rb / B.I : 0);
  const j = -(1 + e) * vn / k;
  A.vx += j * nx / A.m; A.vy += j * ny / A.m; B.vx -= j * nx / B.m; B.vy -= j * ny / B.m;
  if (A.I) A.w += ra * j / A.I;
  if (B.I) B.w -= rb * j / B.I;
  return j;
}
// a pin as a body: its moving point is its base; it turns about its middle
function bodyOf(p) {
  const s = shapeOf(p);
  return { m: M_PIN, I: p.st === 0 ? 0 : I_PIN, vx: p.vx, vy: p.vy, w: p.st === 0 ? 0 : p.w, cx: s.cx, cy: s.cy, s };
}
const putBody = (p, B) => { p.vx = B.vx; p.vy = B.vy; if (p.st !== 0) p.w = B.w; };

// a standing pin pushed this hard falls (the way it was pushed); a softer push may wobble it down
const V_FALL = 26, V_WOB = 9;
function knock(st, p, how) {
  if (p.st !== 0) return;
  const v = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  if (v < V_WOB) return;
  if (v < V_FALL && rnd(st) > (v - V_WOB) / (V_FALL - V_WOB)) { p.wob = 1; return; }
  p.st = 1; p.top = 0; p.ux = p.vx / v; p.uy = p.vy / v; p.w = 0;
  st.events.push(how === "ball" ? "hit" : "pin");
}

function pinsStep(st, dt) {
  const b = st.ball, pins = st.pins;
  // the ball against each pin (a gutter ball runs under the deck's edge: it touches nothing)
  if (b && !b.gone && !b.gutter && b.y > HEAD_Y - 40) {
    const Bb = { m: b.m * BALL_DRIVE, I: 0, vx: b.vx, vy: b.vy, w: 0, cx: b.x, cy: b.y };
    for (const p of pins) {
      if (p.st === 2) continue;
      const s = shapeOf(p);
      const [u] = segSeg(s.ax, s.ay, s.bx, s.by, b.x, b.y, b.x, b.y);
      const qx = s.ax + (s.bx - s.ax) * u, qy = s.ay + (s.by - s.ay) * u;
      const dx = b.x - qx, dy = b.y - qy, d2 = dx * dx + dy * dy, rr = R_BALL + s.r;
      if (d2 >= rr * rr || d2 < 1e-12) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
      const P0 = bodyOf(p);
      Bb.vx = b.vx; Bb.vy = b.vy; Bb.cx = b.x; Bb.cy = b.y;
      const j = impulse(Bb, P0, nx, ny, qx + nx * s.r, qy + ny * s.r, 0.72);
      // push apart, mostly the pin
      const over = rr - d, km = M_PIN / (b.m * BALL_DRIVE + M_PIN);
      b.x += nx * over * km; b.y += ny * over * km; p.x -= nx * over * (1 - km); p.y -= ny * over * (1 - km);
      b.vx = Bb.vx; b.vy = Bb.vy; putBody(p, P0);
      if (j > 0) { if (!b.hit) st.events.push("first"); b.hit = true; knock(st, p, "ball"); }
    }
  }
  // pin against pin
  for (let i = 0; i < pins.length; i++) {
    const p = pins[i];
    if (p.st === 2) continue;
    for (let k = i + 1; k < pins.length; k++) {
      const q = pins[k];
      if (q.st === 2) continue;
      if (p.st === 0 && q.st === 0 && p.vx === 0 && p.vy === 0 && q.vx === 0 && q.vy === 0) continue;
      const A = shapeOf(p), B = shapeOf(q);
      const [s, t] = segSeg(A.ax, A.ay, A.bx, A.by, B.ax, B.ay, B.bx, B.by);
      const ax = A.ax + (A.bx - A.ax) * s, ay = A.ay + (A.by - A.ay) * s, bx = B.ax + (B.bx - B.ax) * t, by = B.ay + (B.by - B.ay) * t;
      const dx = ax - bx, dy = ay - by, d2 = dx * dx + dy * dy, rr = A.r + B.r;
      if (d2 >= rr * rr || d2 < 1e-12) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
      const PA = bodyOf(p), PB = bodyOf(q);
      const j = impulse(PA, PB, nx, ny, bx + nx * B.r, by + ny * B.r, 0.6);
      const over = (rr - d) / 2;
      p.x += nx * over; p.y += ny * over; q.x -= nx * over; q.y -= ny * over;
      putBody(p, PA); putBody(q, PB);
      if (j > 0) { knock(st, p, "pin"); knock(st, q, "pin"); if (j > 400 && p.st && q.st) st.events.push("clack"); }
    }
  }
  // move, topple, slide, the kickbacks, the pit, the gutters
  for (const p of pins) {
    if (p.st === 2) continue;
    const v = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    const dec = (p.st === 0 ? 420 : p.top < 1 ? 110 : 260) * dt;
    if (v <= dec) { p.vx = 0; p.vy = 0; } else { p.vx -= p.vx / v * dec; p.vy -= p.vy / v * dec; }
    if (p.st === 1) {
      if (p.top < 1) p.top = Math.min(1, p.top + clamp(2.5 + v / 90, 2.5, 7) * dt);
      if (p.w) {
        // turn u by w dt (small angle, renormalised: sqrt only)
        const nx = p.ux - p.uy * p.w * dt, ny = p.uy + p.ux * p.w * dt, n = Math.sqrt(nx * nx + ny * ny);
        // keep the middle where it is while the pin turns about it
        const hl = L_PIN * p.top / 2, mx = p.x + p.ux * hl, my = p.y + p.uy * hl;
        p.ux = nx / n; p.uy = ny / n; p.x = mx - p.ux * hl; p.y = my - p.uy * hl;
        p.w *= 1 - 2.2 * dt;
        if (p.w > -0.05 && p.w < 0.05) p.w = 0;
      }
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    const s = shapeOf(p);
    // the kickbacks: pins come back in off the side walls
    for (const [ex, ey] of [[s.ax, s.ay], [s.bx, s.by]]) {
      if (ey < KICK_Y0 || ey > PIT_Y + 4) continue;
      if (ex > KICK_X - s.r && p.vx > 0) { p.x -= ex - (KICK_X - s.r); p.vx = -p.vx * 0.5; p.w = -p.w * 0.5 + (p.vy > 0 ? 3 : -3); st.events.push("kick"); }
      else if (ex < -KICK_X + s.r && p.vx < 0) { p.x += (-KICK_X + s.r) - ex; p.vx = -p.vx * 0.5; p.w = -p.w * 0.5 - (p.vy > 0 ? 3 : -3); st.events.push("kick"); }
    }
    if (p.st === 0 && (Math.abs(p.x) > LANE_HW || p.y > PIT_Y)) { p.st = 1; p.top = 0.6; const n = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1; p.ux = p.vx / n || 0; p.uy = p.vy / n || 1; }
    if (Math.min(s.ay, s.by) > PIT_Y + 2 || p.y < HEAD_Y - 120) { p.st = 2; p.vx = 0; p.vy = 0; }
  }
}

const settled = (st) => st.pins.every(p => p.st === 2 || (Math.abs(p.vx) < 2 && Math.abs(p.vy) < 2 && (p.st === 0 || p.top >= 1)));

// ---- the CPU ----------------------------------------------------------------------------------------------
// A figure throws a line it has worked out (the aim that carries its ball to its target), and misses it
// by an amount its rating sets. Planned once per ball, from the seeded rng: a replay plans the same.
export function cpuProfile(rating) {
  const k = clamp(rating, 0, 99) / 99, q = (1 - k) * (1 - k);
  return { aimErr: 0.0024 + 0.058 * q, speedErr: 0.3 + 2 * (1 - k), mph: 11 + 7 * k, r: 0.08 + 0.55 * k, xErr: 0.5 + 5 * q };
}
// Where a throw's ball crosses row y (no pins): -> x at y, or null (the gutter)
export function ballAt(st, th, y, hand = 1, bumpers = false) {
  const p = { hand, bumpers, weight: 14 };
  const s = { players: [p], cur: 0, oilK: st.oilK, events: [], fouls: false };
  const x = clamp(th.x, -LANE_HW + R_BALL, LANE_HW - R_BALL), a = clamp(th.a, -0.08, 0.08);
  const v = th.mph * MPH, n = Math.sqrt(1 + a * a);
  const b = { x, y: 0, vx: v * a / n, vy: v / n, wx: -hand * th.r * HOOK * (th.mph / 18), wy: v / n * 0.35, gutter: false, gone: false, d: 0 };
  for (let k = 0; k < 12000 && b.y < y && !b.gutter; k++) ballStep(s, b, DT * 4);
  return b.gutter ? null : b.x;
}
// the line that lands the ball on target x at row y: bisection on the aim
export function aimFor(st, x0, mph, r, tx, ty, hand = 1) {
  let lo = -0.08, hi = 0.08;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2, at = ballAt(st, { x: x0, a: mid, mph, r }, ty, hand);
    const v = at == null ? (mid > 0 ? 99 : -99) : at;
    if (v < tx) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
function cpuPlan(st, p) {
  const pr = cpuProfile(p.rating), h = p.hand;
  const left = standing(st);
  const fresh = left.length === 10 && st.pins.every(q => q.st === 0);
  let x0, mph = pr.mph, r = pr.r, tx, ty;
  if (fresh || left.includes(1)) {
    // the pocket: the 1-3 (the 1-2 for a lefty), a little in from the line of the 3
    x0 = h * 10; tx = h * 2.6; ty = HEAD_Y;
  } else {
    // a spare: at the front pin of what is left, straighter and a touch harder; a corner pin cross-lane
    const pins = st.pins.filter(q => q.st === 0).sort((a, b) => a.y - b.y || Math.abs(a.x) - Math.abs(b.x));
    const front = pins[0], xs = pins.map(q => q.x);
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    tx = front.x + (mid - front.x) * 0.35; ty = front.y;
    r = pr.r * 0.35; mph = pr.mph + 1.5;
    x0 = clamp(-tx * 0.8, -14, 14);
  }
  const a = aimFor(st, x0, mph, r, tx, ty, h);
  const g = () => (rnd(st) + rnd(st) + rnd(st) - 1.5) / 1.5;   // a rough bell, -1..1
  return { x: x0 + g() * pr.xErr, a: a + g() * pr.aimErr, mph: mph + g() * pr.speedErr, r: clamp(r + g() * 0.08, -0.5, 1), at: 40 + Math.floor(rnd(st) * 30) };
}

// ---- the keyboard's three-press meter --------------------------------------------------------------------
// power (rises past full into the red: over the line), accuracy (a needle that swings), spin
const tri = (t, period) => { const f = (t % period) / period; return f < 0.5 ? f * 2 : 2 - f * 2; };
export function meterValue(st) {
  const m = st.meter; if (!m) return null;
  const slow = st.easy ? 1.5 : 1;
  if (m.stage === 1) return tri(m.t, Math.round(110 * slow)) * 1.12;          // 0 .. 1.12 (red past 1)
  if (m.stage === 2) return tri(m.t, Math.round(56 * slow)) * 2 - 1;          // -1 .. 1 (0 is true)
  if (m.stage === 3) return tri(m.t, Math.round(80 * slow)) * 1.5 - 0.5;      // -0.5 .. 1 (rev)
  return null;
}
export const speedOf = (power, weight = 14) => 10 + clamp(power, 0, 1) * 12 - (weight - 12) * 0.2;   // mph

// ---- events from the browser (the mouse, the finger, the pad's sticks): applied between ticks ------------
// {t: "set", x, a}: position and aim. {t: "throw", x, a, mph, r, foul}: a whole throw, computed from a
// gesture (gesture.js); the log holds these numbers, never the pointer's samples.
export function act(st, e) {
  if (!e || st.over || P(st).kind !== "human") return;
  if (e.t === "set" && (st.phase === "aim")) {
    P(st).posX = clamp(Number(e.x) || 0, -LANE_HW + R_BALL, LANE_HW - R_BALL);
    P(st).aim = clamp(Number(e.a) || 0, -0.06, 0.06);
  } else if (e.t === "throw" && st.phase === "aim") {
    const th = { x: Number(e.x) || 0, a: Number(e.a) || 0, mph: Number(e.mph) || 14, r: Number(e.r) || 0, foul: !!e.foul };
    st.pendingThrow = th; st.phase = "approach"; st.phaseT = 0;
  }
}

// ---- the step ----------------------------------------------------------------------------------------
export function step(st, mask = 0) {
  st.events = [];
  if (st.over) return st;
  st.t++; st.phaseT++;
  const p = P(st);
  const human = p.kind === "human";
  if (st.phase === "aim") {
    if (!human) {
      const plan = st.cpuPlan;
      // walk to the spot and turn the arrow, then go
      p.posX += clamp(plan.x - p.posX, -0.6, 0.6); p.aim += clamp(plan.a - p.aim, -0.0008, 0.0008);
      if (st.phaseT >= plan.at && Math.abs(plan.x - p.posX) < 0.01) { st.pendingThrow = { ...plan }; st.phase = "approach"; st.phaseT = 0; }
    } else {
      if (mask & BTN.L) p.posX = clamp(p.posX - 0.35, -LANE_HW + R_BALL, LANE_HW - R_BALL);
      if (mask & BTN.R) p.posX = clamp(p.posX + 0.35, -LANE_HW + R_BALL, LANE_HW - R_BALL);
      if (mask & BTN.AL) p.aim = clamp(p.aim - 0.0004, -0.06, 0.06);
      if (mask & BTN.AR) p.aim = clamp(p.aim + 0.0004, -0.06, 0.06);
      if ((mask & BTN.A) && !(st.prevMask & BTN.A)) { st.phase = "meter"; st.meter = { stage: 1, t: 0, power: 0, acc: 0, rev: 0 }; st.events.push("tick"); }
    }
  } else if (st.phase === "meter") {
    const m = st.meter;
    if ((mask & BTN.B) && !(st.prevMask & BTN.B)) { st.phase = "aim"; st.meter = null; }
    else {
      m.t++;
      if ((mask & BTN.A) && !(st.prevMask & BTN.A) && m.t > 2) {
        const v = meterValue(st);
        st.events.push("tick");
        if (m.stage === 1) { m.power = v; m.stage = 2; m.t = 0; }
        else if (m.stage === 2) { m.acc = v; m.stage = 3; m.t = 0; }
        else {
          m.rev = v;
          const err = st.easy ? 0.5 : 1;
          st.pendingThrow = { x: p.posX, a: p.aim + m.acc * 0.006 * err, mph: speedOf(m.power, p.weight), r: m.rev, foul: m.power > 1 };
          st.phase = "approach"; st.phaseT = 0;
        }
      }
    }
  } else if (st.phase === "approach") {
    if (st.phaseT >= 30) release(st, st.pendingThrow);
  } else if (st.phase === "roll") {
    const b = st.ball;
    for (let k = 0; k < SUB; k++) { ballStep(st, b, DT); pinsStep(st, DT); }
    if (b.passT < 0 && (b.y > HEAD_Y || b.gone)) b.passT = st.phaseT;
    const done = (b.gone && settled(st)) || (b.passT >= 0 && st.phaseT - b.passT > 200) || st.phaseT > 60 * 9;
    if (done) endRoll(st);
  } else if (st.phase === "result") {
    if (st.phaseT >= (st.lastRoll?.n === 10 ? 110 : 80)) nextBall(st);
  }
  st.prevMask = mask;
  return st;
}

function endRoll(st) {
  const p = P(st), before = st.standingBefore;
  const left = standing(st);
  const foul = st.throw.foul;
  const n = foul ? 0 : before.length - left.length;
  const pos = position(p.balls);
  const split = !foul && pos.rackFresh && isSplit(left);
  const ball = { n, foul, split: split || undefined, left: foul ? before : left };
  p.balls.push({ n, foul: foul || undefined, split: split || undefined });
  st.lastRoll = { n, foul, split, left: ball.left, before, frame: pos.frame, ball: pos.ball, player: st.cur, mph: st.throw.mph };
  if (foul) {
    // a foul counts nothing: what it knocked down is set up again where it stood
    st.pins = PIN_SPOTS.filter(([k]) => before.includes(k)).map(([k, x, y]) => ({ n: k, x, y, vx: 0, vy: 0, st: 0, ux: 0, uy: 1, top: 0, w: 0, hl: 0 }));
  }
  st.events.push(foul ? "foul" : n === 10 && pos.rackFresh ? "strike" : left.length === 0 ? "spare" : split ? "split" : n === 0 ? "miss" : "count");
  st.phase = "result"; st.phaseT = 0;
}

function nextBall(st) {
  const p = P(st);
  const pos = position(p.balls);
  if (!pos.over && pos.frame === st.lastRoll.frame) {
    // the same player throws again in this frame
    rack(st, pos.rackFresh);
    beginTurn(st);
    return;
  }
  // the frame is done: the next player who still has frames to bowl
  for (let k = 1; k <= st.players.length; k++) {
    const i = (st.cur + k) % st.players.length;
    if (!position(st.players[i].balls).over) {
      st.cur = i; st.frame = position(st.players[i].balls).frame;
      rack(st, true); beginTurn(st); return;
    }
  }
  st.over = true; st.phase = "over"; st.events.push("over");
}

// ---- the record ----------------------------------------------------------------------------------------
// The input log: [mask, count, mask, count, ...] with event objects ({t: "set" | "throw", ...})
// between the runs, applied before the next tick. Encoded as it is played (Logger).
export class Logger {
  constructor() { this.log = []; }
  tick(mask) { const L = this.log, n = L.length; if (n >= 2 && typeof L[n - 2] === "number" && typeof L[n - 1] === "number" && L[n - 2] === mask) L[n - 1]++; else L.push(mask, 1); }
  event(e) { this.log.push(e); }
}
export function resultOf(st) {
  return {
    v: st.v, over: st.over, ticks: st.t,
    players: st.players.map(p => ({ name: p.name, kind: p.kind, key: p.key, balls: p.balls.map(b => [b.n, b.foul ? 1 : 0, b.split ? 1 : 0]), total: frames(p.balls).total })),
  };
}
// Play a record again from its cfg and log: -> its result (a server check compares the claim).
export function replay(rec, maxTicks = Infinity) {
  if (!VERSIONS.includes(Number(rec?.cfg?.v ?? VERSION))) throw new Error(`bowling record version ${rec?.cfg?.v}, sim ${VERSION}`);
  const st = newGame(rec.cfg);
  const L = rec.inputLog || [];
  let i = 0;
  while (i < L.length && st.t < maxTicks) {
    const x = L[i];
    if (typeof x !== "number") { act(st, x); i++; continue; }
    const n = L[i + 1];
    for (let k = 0; k < n && st.t < maxTicks; k++) step(st, x);
    i += 2;
  }
  return resultOf(st);
}
// Run a throw from a state copy with no input until the roll ends (the CPU's look-ahead, checks, the
// instant replay): -> the state after the roll
export function clone(st) { return JSON.parse(JSON.stringify(st)); }
