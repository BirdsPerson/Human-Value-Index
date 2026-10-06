// FROZEN: hoops sim VERSION 1, exactly as shipped 2026-10-05 (no fouls, the first make model). Kept
// so a v1 record replays to its result (./replay.js picks the sim by version; scripts/fixtures/
// hoops-v1-records.json holds games recorded on it). Never edit; the live sim is ../sim.js.
// THE COURTS, playable (docs/CITY_SPEC.md "PLAYABLE SPORTS", Basketball). The game itself: pure,
// no DOM, no clock, no Math.random, no trig. A fixed 60 Hz step over a seeded generator, so a game
// is a function of (version, seed, cfg, the human's input per frame): the browser plays it, and
// anything holding the record plays it again to the same result (scripts/check-hoops.mjs does).
// Only + - * / and sqrt touch the state, which IEEE 754 rounds the same everywhere.
//
// The court is in metres, NBA lines: x along the length (the centre line at 0, the baselines at
// +-14.325), y across it (the near sideline, the camera's, at 0; the far one at 15.24), z up. The
// rims are 3.05 m up, 1.575 m in from each baseline. Team 0 is the viewer's and attacks +x all game
// (ends do not change); team 1 attacks -x. Five a side: the league's own drafted fives.
//
// Tecmo-style control: the human steers one player of team 0 (st.ctl): the ball carrier on offence,
// on defence the defender nearest the ball when the ball changed hands, C to switch to another.
// Input: one bitmask a frame (BTN). Offence: A held gathers a jump shot, released at the top of the
// jump (TOP frames in) is cleanest; A near the rim is a layup, or a dunk for a player rated 75+.
// B passes to the teammate the d-pad points at (the nearest when none). Defence: A jumps (a block,
// a rebound), B reaches for a steal. Every other player is the CPU, from its rating.

export const VERSION = 1;
export const HZ = 60;
const DT = 1 / HZ, G = 9.8;
export const COURT = { hx: 14.325, w: 15.24, cy: 7.62, rimX: 12.75, rimZ: 3.05, rimR: 0.23, boardX: 13.125, three: 7.24, corner: 6.71, cornerX: 10.055, laneHW: 2.44, ftX: 8.535, circle: 1.8 };
export const BTN = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, A: 16, B: 32, C: 64 };
export const FORMATS = {
  quarters: { id: "quarters", name: "FOUR 2-MINUTE QUARTERS", periods: 4, len: 120, ot: 60, target: 0 },
  to21: { id: "to21", name: "FIRST TO 21", periods: 0, len: 0, ot: 0, target: 21 },
};
export const SHOT_CLOCKS = [24, 14];
export const TOP = 20;
export const TIP_JUMP = 44;       // the tip: jump this many frames after the whistle to meet the ball at its top            // frames from the gather to the top of the jump: the release to aim for
const LAND = 2 * TOP;             // the jump shot's feet back on the floor
const PASS_MAX = 100, HOLD_MAX = LAND - 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const C = COURT;
export const dirOf = (t) => (t === 0 ? 1 : -1);

// mulberry32 on the state's own word
function rnd(st) {
  let t = (st.rng = (st.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const gauss = (st) => (rnd(st) + rnd(st) + rnd(st) - 1.5) * 2;   // mean 0, sd 1, bounded at 3
const len = (x, y) => Math.sqrt(x * x + y * y);

// A three from (x, y) at the basket team-direction d attacks: past the arc, or in a corner past
// the straight line 6.71 m from the basket.
export function isThree(x, y, d) {
  const dx = d * C.rimX - x, dy = C.cy - y;
  if (d * x > C.cornerX) return Math.abs(dy) > C.corner;
  return len(dx, dy) > C.three;
}

// A rating (0..99) -> what the CPU and the human's player can do with it.
export function abilities(r) {
  const k = clamp((r - 35) / 60, 0, 1);
  return { k, spd: 4.9 + 2.5 * k, shoot: k, def: k, hands: k, leap: 0.4 + 0.45 * k, dunker: r >= 75, h: 1.9 + 0.2 * k };
}
function mkPlayer(t, i, row) {
  const [key, name, r] = row;
  return { t, i, g: t * 5 + i, key: String(key), name: String(name), r: r | 0, ...abilities(r | 0), x: 0, y: 0, z: 0, vz: 0, vx: 0, vy: 0, face: dirOf(t), mv: 0, act: null, cool: 0, jx: 0, jy: 0, jt: 0, hold: 0, think: 0, plan: null, jumpAt: -1 };
}

// cfg: {fmt: "quarters" | "to21", shot: 24 | 14, assist, home: [[key, name, r] x 5], away: [...],
// auto (team 0 played by the CPU too: the checks and the attract mode)}. Rows are taken in the
// order given (the page sorts each five best first: the best brings the ball up).
export function newGame(seed = 1, cfg = {}) {
  const fmt = FORMATS[cfg.fmt] ? cfg.fmt : "quarters";
  const shot = SHOT_CLOCKS.includes(cfg.shot) ? cfg.shot : 24;
  const rows = (r) => { const a = (Array.isArray(r) ? r : []).slice(0, 5); while (a.length < 5) a.push([`stand-in-${a.length}`, "A STAND-IN", 40]); return a; };
  const st = {
    v: VERSION, seed: seed >>> 0, rng: seed | 0, frame: 0,
    cfg: { fmt, shot, assist: Boolean(cfg.assist), auto: Boolean(cfg.auto) },
    p: [...rows(cfg.home).map((r, i) => mkPlayer(0, i, r)), ...rows(cfg.away).map((r, i) => mkPlayer(1, i, r))],
    ball: { st: "dead", own: -1, x: 0, y: C.cy, z: 1, vx: 0, vy: 0, vz: 0, f: 0, from: -1, to: -1, made: false, pts: 0, T: 0, kind: "", rim: false, air: false, sx: 0, sy: 0 },
    phase: "tip", t: 0, deadFor: 0, after: null, afterTeam: -1, spot: null,
    q: 1, clock: FORMATS[fmt].len * HZ, shot: shot * HZ, score: [0, 0], poss: -1, tipWinner: -1, lastTouch: -1,
    ctl: 0, ctlFor: null, lastRel: null, mask: 0, prev: 0, ev: [], note: null, buzzer: false, reset: null, pts: new Array(10).fill(0), fga: [0, 0], fgm: [0, 0],
  };
  setupTip(st);
  return st;
}
const human = (st, P) => P.t === 0 && !st.cfg.auto && P.i === st.ctl;
const holder = (st) => (st.ball.st === "held" ? st.p[st.ball.own] : null);
function say(st, k, P = null, extra = {}) { st.ev.push(k); st.note = { k, g: P ? P.g : -1, team: P ? P.t : -1, frame: st.frame, ...extra }; }

// ---- set pieces -------------------------------------------------------------------------------------
function setupTip(st) {
  const best = (t) => st.p.slice(t * 5, t * 5 + 5).reduce((a, P) => (P.h > a.h ? P : a));
  st.jumpers = [best(0).g, best(1).g];
  for (const P of st.p) {
    const d = dirOf(P.t), J = st.jumpers.includes(P.g);
    const ring = [[-2.6, 2.2], [-2.6, -2.2], [-5.5, 3.6], [-5.5, -3.6]];
    if (J) { P.x = -d * 0.55; P.y = C.cy; } else {
      const others = st.p.filter(Q => Q.t === P.t && !st.jumpers.includes(Q.g)), k = others.indexOf(P), [ax, ay] = ring[k] || [-4, 0];
      // one side's ring is on its own half, staggered with the other's so nobody overlaps
      P.x = d * ax * (P.t === 0 ? 1 : 0.8); P.y = C.cy + ay * (P.t === 0 ? 1 : -1.1);
    }
    P.z = 0; P.vz = 0; P.act = null; P.face = d; P.mv = 0;
  }
  Object.assign(st.ball, { st: "tip", own: -1, x: 0, y: C.cy, z: 1.6, vx: 0, vy: 0, vz: 0, f: 0 });
  st.phase = "tip"; st.t = 0; st.tipPress = -1;
}
// The ball to team T's player i at (x, y): the game goes live.
function giveBall(st, P) {
  const b = st.ball;
  Object.assign(b, { st: "held", own: P.g, f: 0, rim: false, air: false, x: P.x, y: P.y, z: 1, vx: 0, vy: 0, vz: 0 });
  if (st.poss !== P.t) { st.shot = st.cfg.shot * HZ; }
  st.poss = P.t; st.lastTouch = P.t; P.hold = 0; P.think = 8;
  if (P.t === 0 && !st.cfg.auto) st.ctl = P.i;
}
// A dead ball: everyone walks to their places for `frames`, then `after` ("inbound" to team T at
// spot | "period" | "over").
function dead(st, frames, after, T = -1, spot = null) {
  st.phase = "dead"; st.t = 0; st.deadFor = frames; st.after = after; st.afterTeam = T; st.spot = spot;
  for (const P of st.p) { if (P.act && P.act.kind !== "dunk") P.act = null; P.jumpAt = -1; P.plan = null; }
  st.reset = resetSpots(st, T, spot);
}
const SPOTS = [[7.4, 0], [5.6, 4.6], [5.6, -4.6], [1.9, 2.4], [1.0, -5.9]];
function spotOf(t, i) { const d = dirOf(t), s = SPOTS[i]; return [d * (C.rimX - s[0]), C.cy + s[1]]; }
// Where everyone stands for an inbound to T at spot (null: T's own backcourt, after a basket).
function resetSpots(st, T, spot) {
  const out = new Array(10);
  if (T < 0) { for (const P of st.p) out[P.g] = [P.x, P.y]; return out; }
  const d = dirOf(T), sp = spot || [-d * 11.2, C.cy - 1.5];
  const offence = st.p.filter(P => P.t === T);
  let inb = offence[0], bd = 1e9;
  if (spot) for (const P of offence) { const k = len(P.x - sp[0], P.y - sp[1]); if (k < bd) { bd = k; inb = P; } }
  for (const P of st.p) {
    if (P === inb) { out[P.g] = sp; continue; }
    if (P.t === T) {
      const [sx, sy] = spotOf(T, P.i);
      out[P.g] = spot ? [sx, sy] : [sx - d * 6, sy];   // after a basket, the five come up the floor
    } else {
      const [mx, my] = spot ? spotOf(T, P.i) : [spotOf(T, P.i)[0] - d * 6, spotOf(T, P.i)[1]];
      const rx = d * C.rimX;
      const k = 1.6 / (len(rx - mx, C.cy - my) || 1);
      out[P.g] = [mx + (rx - mx) * k, my + (C.cy - my) * k];
    }
  }
  st.inbounder = inb.g;
  return out;
}

// ---- the ball's flight ---------------------------------------------------------------------------
// Launch from (b.x, b.y, b.z) to (tx, ty, tz) in T frames under gravity.
function aim(b, tx, ty, tz, T) {
  const s = T / HZ;
  b.vx = (tx - b.x) / s; b.vy = (ty - b.y) / s; b.vz = (tz - b.z) / s + (G * s) / 2;
}
function flight(b) { b.vz -= G * DT; b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT; }

// The chance a shot goes in, decided at the release.
export function makeProb(st, P, r, q, kind) {
  let p;
  if (kind === "dunk") p = 0.8 + 0.12 * P.k;
  else if (kind === "lay") p = 0.56 + 0.22 * P.k;
  else if (r > 11.5) p = 0.03;
  else p = (0.6 - 0.034 * Math.max(0, r - 1.5)) * (0.45 + 0.75 * P.shoot) * (0.4 + 0.65 * q);
  // the nearest defender's hand in the face
  let c = 1e9, D = null;
  for (const Q of st.p) if (Q.t !== P.t) { const k = len(Q.x - P.x, Q.y - P.y); if (k < c) { c = k; D = Q; } }
  if (D && c < 1.6) p *= 1 - 0.45 * (1 - c / 1.6) * (0.6 + 0.4 * D.def) * (kind === "dunk" ? 0.8 : 1);
  if (D && c < 1.6 && D.z > 0.15 && kind !== "dunk") p *= 0.85;
  if (st.cfg.assist) p *= P.t === 0 && !st.cfg.auto ? 1.12 : 0.95;
  return clamp(p, 0.02, 0.97);
}

function release(st, P, q) {
  const b = st.ball, d = dirOf(P.t), rx = d * C.rimX;
  if (b.st !== "held" || b.own !== P.g) { P.act = null; return; }
  const r = len(rx - P.x, C.cy - P.y), close = r < 2.0;
  const kind = close ? "lay" : "jump", three = isThree(P.x, P.y, d), pts = three ? 3 : 2;
  const p = makeProb(st, P, r, q, kind);
  const made = rnd(st) < p;
  const air = !made && !close && r > 4 && q < 0.3 && rnd(st) < 0.6;
  Object.assign(b, { st: "shot", own: -1, from: P.g, f: 0, made, pts, kind, rim: false, air, sx: P.x, sy: P.y, x: P.x + d * 0.2, y: P.y, z: P.z + P.h + 0.25 });
  const T = Math.round(close ? 26 : 30 + r * 3.0);
  b.T = T;
  let tx = rx, ty = C.cy, tz = C.rimZ + 0.05;
  if (!made && air) { const k = (r - 1.6) / r; tx = P.x + (rx - P.x) * k; ty = P.y + (C.cy - P.y) * k; tz = C.rimZ - 0.5; }
  else if (!made) { tx = rx + d * (rnd(st) < 0.5 ? -0.26 : 0.27); ty = C.cy + (rnd(st) - 0.5) * 0.44; }
  aim(b, tx, ty, tz, T);
  st.fga[P.t]++;
  P.act = { kind: "follow", f: 0 };
  st.lastTouch = P.t;
  // the CPU's defenders near the shooter decide whether to go up for it
  for (const Q of st.p) if (Q.t !== P.t && !human(st, Q) && Q.z === 0 && len(Q.x - P.x, Q.y - P.y) < 2.4 && rnd(st) < 0.3 + 0.45 * Q.def) Q.jumpAt = st.frame + Math.round(2 + (1 - Q.k) * 7);
  say(st, three ? "shoot3" : "shoot", P, { q });
}

function startShot(st, P) {
  const d = dirOf(P.t), r = len(d * C.rimX - P.x, C.cy - P.y);
  P.face = d;
  if (P.dunker && r < 2.7) {
    P.act = { kind: "dunk", f: 0, x0: P.x, y0: P.y };
    for (const Q of st.p) if (Q.t !== P.t && !human(st, Q) && Q.z === 0 && len(Q.x - P.x, Q.y - P.y) < 2.6 && rnd(st) < 0.35 + 0.5 * Q.def) Q.jumpAt = st.frame + Math.round(1 + (1 - Q.k) * 6);
    say(st, "gather", P); return;
  }
  P.act = { kind: "jump", f: 0, rel: P.t === 0 && !st.cfg.auto ? -1 : clamp(Math.round(TOP + gauss(st) * (1 - P.k) * 6 + (rnd(st) - 0.5) * 3), 4, HOLD_MAX) };
  P.vz = (G * TOP) / HZ; P.z = 0.0001;
}
// The timing of a release f frames into the jump -> 0..1 (1 inside the window either side of TOP).
export function releaseQ(f, wide = false) {
  const e = Math.abs(f - TOP), win = wide ? 5 : 3;
  return e <= win ? 1 : clamp(1 - (e - win) / 11, 0, 1);
}

function dunkStep(st, P) {
  const a = P.act, d = dirOf(P.t), tx = d * (C.rimX - 0.45), ty = C.cy, b = st.ball;
  a.f++;
  const k = Math.min(1, a.f / 16);
  P.x = a.x0 + (tx - a.x0) * k; P.y = a.y0 + (ty - a.y0) * k;
  P.z = a.f <= 16 ? 1.05 * (1 - (1 - k) * (1 - k)) : a.f <= 26 ? 1.05 : Math.max(0, 1.05 - (a.f - 26) * 0.09);
  if (b.st === "held" && b.own === P.g) { b.x = P.x + d * 0.3; b.y = P.y; b.z = P.z + P.h + 0.3; }
  if (a.f === 12) {
    // a defender in the air at the rim can stop it
    for (const Q of st.p) {
      if (Q.t === P.t || Q.z < 0.2 || len(Q.x - P.x, Q.y - P.y) > 1.1) continue;
      if (rnd(st) < 0.2 + 0.3 * Q.def - 0.15 * P.k) { blocked(st, Q, P); a.blocked = true; return; }
    }
  }
  if (a.f === 16 && !a.blocked && b.own === P.g) {
    const p = makeProb(st, P, 0.5, 1, "dunk");
    st.fga[P.t]++; st.lastTouch = P.t;
    Object.assign(b, { st: "shot", own: -1, from: P.g, f: 0, kind: "dunk", pts: 2, made: rnd(st) < p, rim: false, air: false, T: 4, sx: a.x0, sy: a.y0, x: d * C.rimX - d * 0.15, y: C.cy, z: C.rimZ + 0.35, vx: d * 0.4, vy: 0, vz: -2.5 });
    say(st, "slam", P);
  }
  if (a.f >= 38) { P.act = null; P.z = 0; }
}

function blocked(st, D, S) {
  const b = st.ball, d = dirOf(S.t);
  Object.assign(b, { st: "loose", own: -1, f: 0, rim: false, x: b.x, y: b.y, z: Math.max(1.5, b.z), vx: -d * (2.5 + rnd(st) * 2), vy: (rnd(st) - 0.5) * 5, vz: 1.5 + rnd(st) * 1.5 });
  st.lastTouch = D.t;
  if (S.act) S.act = { kind: "follow", f: 0 };
  say(st, "block", D, { victim: S.g });
}

// ---- passes, steals --------------------------------------------------------------------------------
function passTarget(st, P, m) {
  const dx = (m & BTN.RIGHT ? 1 : 0) - (m & BTN.LEFT ? 1 : 0), dy = (m & BTN.UP ? 1 : 0) - (m & BTN.DOWN ? 1 : 0);
  let best = null, bs = -1e9;
  for (const Q of st.p) {
    if (Q.t !== P.t || Q === P) continue;
    const ox = Q.x - P.x, oy = Q.y - P.y, dd = len(ox, oy) || 0.01;
    const s = dx || dy ? (ox * dx + oy * dy) / (dd * len(dx, dy)) * 10 - dd * 0.15 : -dd;
    if (s > bs) { bs = s; best = Q; }
  }
  return best;
}
function passTo(st, P, Q) {
  const b = st.ball, sp = 11 + 4 * P.k;
  const d0 = len(Q.x - P.x, Q.y - P.y), s = d0 / sp;
  const tx = Q.x + Q.vx * s * 0.8, ty = Q.y + Q.vy * s * 0.8, T = Math.max(6, Math.round((len(tx - P.x, ty - P.y) / sp) * HZ));
  Object.assign(b, { st: "pass", own: -1, from: P.g, to: Q.g, f: 0, x: P.x + P.face * 0.3, y: P.y, z: 1.3 });
  aim(b, tx, ty, 1.25, T);
  P.hold = 0; st.lastTouch = P.t;
  if (Q.t === 0 && !st.cfg.auto) st.ctl = Q.i;
  say(st, "pass", P, { to: Q.g });
}
function stealTry(st, P) {
  const H = holder(st);
  P.cool = 50;
  // the hand has to get to the ball, which the dribbler keeps on the side away from you
  const b = st.ball;
  if (!H || H.t === P.t || H.act?.kind === "dunk" || len(b.x - P.x, b.y - P.y) > 0.9) { say(st, "reach", P); return; }
  // a reach is a gamble: one in eight or so comes away with it; a miss leaves the reacher flat-footed
  let p = 0.08 + 0.14 * P.def - 0.08 * H.hands;
  if (st.cfg.assist) p += P.t === 0 && !st.cfg.auto ? 0.06 : -0.03;
  if (rnd(st) < p) { const from = H; H.act = null; P.cool = 0; giveBall(st, P); say(st, "steal", P, { victim: from.g }); }
  else say(st, "reach", P);
}

// ---- moving -------------------------------------------------------------------------------------
function goTo(P, tx, ty, frac = 1) {
  const dx = tx - P.x, dy = ty - P.y, d = len(dx, dy), step = P.spd * DT * frac;
  if (d < 0.05) { P.vx = 0; P.vy = 0; P.mv = 0; return; }
  const k = Math.min(1, step / d);
  P.vx = (dx * k) / DT; P.vy = (dy * k) / DT;
}
// The defender's place: between the man and the basket, closer to the man with the ball, sagging
// into the lane off a man far from it.
function markSpot(st, P) {
  const M = st.p[(1 - P.t) * 5 + P.i], b = st.ball, rx = dirOf(M.t) * C.rimX;
  const hasBall = b.st === "held" && b.own === M.g;
  let gap = hasBall ? 1.0 : 1.7;
  const far = len(M.x - b.x, M.y - b.y);
  const r = len(rx - M.x, C.cy - M.y) || 1;
  gap = Math.min(gap, r * 0.6);
  let tx = M.x + ((rx - M.x) / r) * gap, ty = M.y + ((C.cy - M.y) / r) * gap;
  if (!hasBall && far > 7) { tx += (rx - dirOf(M.t) * 3 - tx) * 0.3; ty += (C.cy - ty) * 0.3; }
  return [tx, ty];
}

function cpuThink(st, P) {
  const b = st.ball;
  P.vx = 0; P.vy = 0;
  if (P.act && P.act.kind !== "follow") return;
  if (st.phase === "dead") { const r = st.reset?.[P.g]; if (r) goTo(P, r[0], r[1], 0.8); return; }
  if (st.phase === "tip") return;
  if (P.jumpAt >= 0 && st.frame >= P.jumpAt) { P.jumpAt = -1; hop(P); return; }
  if (b.st === "held" && b.own === P.g) { carrier(st, P); return; }
  const off = st.poss === P.t;
  if (b.st === "pass" && b.to === P.g) { goTo(P, b.x + b.vx * 0.15, b.y + b.vy * 0.15); return; }
  if (b.st === "loose" || (b.st === "shot" && b.kind !== "dunk")) { rebound(st, P); return; }
  if (off) {
    if (--P.jt <= 0) { P.jt = 80 + Math.floor(rnd(st) * 80); P.jx = gauss(st) * 0.9; P.jy = gauss(st) * 0.9; }
    const [sx, sy] = spotOf(P.t, P.i);
    goTo(P, sx + P.jx, sy + P.jy, 0.75);
    return;
  }
  const [tx, ty] = markSpot(st, P);
  goTo(P, tx, ty);
  const H = holder(st);
  if (H && H.t !== P.t && P.cool <= 0 && len(H.x - P.x, H.y - P.y) < 1.15) {
    let p = 0.0012 * (0.4 + P.def);
    if (st.cfg.assist && H.t === 0 && !st.cfg.auto) p *= 0.5;
    if (rnd(st) < p) stealTry(st, P);
  }
}
function hop(P) { if (P.z > 0) return; P.vz = Math.sqrt(2 * G * P.leap); P.z = 0.0001; P.act = { kind: "hop", f: 0 }; }

// Crash the glass: the two nearest the ball on each side go for it, the rest get back or space out.
function rebound(st, P) {
  const b = st.ball, bx = b.st === "shot" ? b.x + (dirOf(st.p[b.from].t) * C.rimX - b.x) * 0.8 : b.x, by = b.st === "shot" ? b.y + (C.cy - b.y) * 0.8 : b.y;
  const mine = st.p.filter(Q => Q.t === P.t).map(Q => [len(Q.x - bx, Q.y - by), Q.g]).sort((a, c) => a[0] - c[0] || a[1] - c[1]);
  const rank = mine.findIndex(([, g]) => g === P.g);
  if (rank < 2) {
    goTo(P, bx, by);
    if (b.st === "loose" && b.vz < 0 && b.z > 2.0 && b.z < 3.4 && len(b.x - P.x, b.y - P.y) < 1.2) hop(P);
    return;
  }
  if (st.poss === P.t) { const [sx, sy] = spotOf(P.t, P.i); goTo(P, sx, sy, 0.7); } else { const [tx, ty] = markSpot(st, P); goTo(P, tx, ty, 0.8); }
}

// The CPU with the ball: drive, pull up, kick it out, or beat the shot clock.
function carrier(st, P) {
  const d = dirOf(P.t), rx = d * C.rimX, r = len(rx - P.x, C.cy - P.y);
  P.hold++;
  let D = null, c = 1e9;
  for (const Q of st.p) if (Q.t !== P.t) { const k = len(Q.x - P.x, Q.y - P.y); if (k < c) { c = k; D = Q; } }
  if (P.think-- <= 0) {
    P.think = 6 + Math.round((1 - P.k) * 8);
    const urgent = st.shot < 100 || (FORMATS[st.cfg.fmt].periods && st.clock < 100 && st.clock > 0);
    if (P.dunker && r < 2.7 && (c > 1.0 || rnd(st) < 0.3)) { startShot(st, P); return; }
    if (r < 1.9) { startShot(st, P); return; }
    const three = isThree(P.x, P.y, d), ep = makeProb(st, P, r, 0.85, "jump") * (three ? 3 : 2);
    if (st.shot < 45) { startShot(st, P); return; }
    if (P.hold > 20 && (ep > 1.0 + 0.1 * (1 - P.k) || (urgent && ep > 0.5)) && rnd(st) < 0.45 + 0.35 * P.k) { startShot(st, P); return; }
    if (P.hold > 26 && rnd(st) < (urgent ? 0.1 : 0.2)) {
      // the open man with the best look, if the lane to him is clear
      let best = null, bs = ep + 0.15;
      for (const Q of st.p) {
        if (Q.t !== P.t || Q === P) continue;
        let qc = 1e9; for (const O of st.p) if (O.t !== P.t) qc = Math.min(qc, len(O.x - Q.x, O.y - Q.y));
        const qr = len(rx - Q.x, C.cy - Q.y), qe = makeProb(st, Q, qr, 0.85, qr < 1.9 ? "lay" : "jump") * (isThree(Q.x, Q.y, d) ? 3 : 2) + (qc > 2 ? 0.25 : 0);
        if (qe > bs && laneClear(st, P, Q)) { bs = qe; best = Q; }
      }
      if (best) { passTo(st, P, best); return; }
    }
    // where to go: at the rim for a driver; to the arc for a shooter who isn't there yet
    const wantR = P.shoot > 0.6 && !P.dunker && r > C.three + 0.3 ? C.three + 0.4 : 0.8;
    let side = (P.y - C.cy) || (rnd(st) < 0.5 ? -0.5 : 0.5);
    if (D && c < 1.8) side += (P.y - D.y) * 1.5;
    const ty = clamp(C.cy + clamp(side, -1, 1) * (r > 5 ? 3.2 : 1.2), 1, C.w - 1);
    P.plan = { x: rx - d * wantR, y: ty };
  }
  if (P.act) return;
  const pl = P.plan || { x: rx - d * 1, y: C.cy };
  goTo(P, clamp(pl.x, -C.hx + 0.6, C.hx - 0.6), clamp(pl.y, 0.6, C.w - 0.6), 0.85);
}
function laneClear(st, P, Q) {
  const ax = Q.x - P.x, ay = Q.y - P.y, L2 = ax * ax + ay * ay || 1;
  for (const O of st.p) {
    if (O.t === P.t) continue;
    const u = clamp(((O.x - P.x) * ax + (O.y - P.y) * ay) / L2, 0, 1), px = P.x + ax * u - O.x, py = P.y + ay * u - O.y;
    if (px * px + py * py < 0.8 * 0.8) return false;
  }
  return true;
}

// ---- the human ------------------------------------------------------------------------------------
function nearestToBall(st, t, skip = -1) {
  const b = st.ball;
  let best = null, bd = 1e9;
  for (const P of st.p) if (P.t === t && P.g !== skip) { const k = len(P.x - b.x, P.y - b.y); if (k < bd) { bd = k; best = P; } }
  return best;
}
function humanThink(st, P, m, press) {
  const b = st.ball;
  P.vx = 0; P.vy = 0;
  if (st.phase === "tip") { if (press & BTN.A && st.tipPress < 0 && st.jumpers.includes(P.g)) st.tipPress = st.t; return; }
  if (st.phase !== "live") return;
  if (press & BTN.C && !(b.st === "held" && b.own === P.g)) {
    const N = nearestToBall(st, 0, P.g);
    if (N) { st.ctl = N.i; say(st, "switch", N); }
    return;
  }
  if (P.act) {
    if (P.act.kind === "jump" && (!(m & BTN.A) || P.act.f >= HOLD_MAX)) { const f = P.act.f, q = releaseQ(f, st.cfg.assist); st.lastRel = { g: P.g, f, q, frame: st.frame }; release(st, P, q); }
    return;
  }
  const dx = (m & BTN.RIGHT ? 1 : 0) - (m & BTN.LEFT ? 1 : 0), dy = (m & BTN.UP ? 1 : 0) - (m & BTN.DOWN ? 1 : 0);
  const has = b.st === "held" && b.own === P.g;
  if (dx || dy) {
    const n = dx && dy ? 0.70710678 : 1, sp = P.spd * (has ? 0.88 : 1) * (st.cfg.assist ? 1.06 : 1) * n;
    P.vx = dx * sp; P.vy = dy * sp;
  }
  if (has) {
    if (press & BTN.A) startShot(st, P);
    else if (press & BTN.B) { const Q = passTarget(st, P, m); if (Q) passTo(st, P, Q); }
    return;
  }
  // a pass coming to you: go and meet it unless you steer; on defence the easy assist guards for you
  if (!dx && !dy && b.st === "pass" && b.to === P.g) goTo(P, b.x + b.vx * 0.15, b.y + b.vy * 0.15);
  else if (!dx && !dy && st.cfg.assist && st.poss === 1 && b.st === "held") { const [tx, ty] = markSpot(st, P); goTo(P, tx, ty); }
  if (press & BTN.A) hop(P);
  else if (press & BTN.B && P.cool <= 0) stealTry(st, P);
}

// ---- the rules ------------------------------------------------------------------------------------
const inBounds = (x, y) => Math.abs(x) <= C.hx && y >= 0 && y <= C.w;
function turnover(st, k, P, x, y) {
  const T = 1 - (P ? P.t : st.lastTouch);
  const sp = [clamp(x, -C.hx + 0.4, C.hx - 0.4), clamp(y, 0.3, C.w - 0.3)];
  say(st, k, P);
  st.ball.st = "dead"; st.ball.own = -1;
  dead(st, 70, "inbound", T, sp);
}
function scored(st, S, pts) {
  st.score[S.t] += pts; st.pts[S.g] += pts; st.fgm[S.t]++;
  say(st, st.ball.kind === "dunk" ? "dunk" : pts === 3 ? "three" : "two", S, { pts });
  const F = FORMATS[st.cfg.fmt];
  if (F.target && st.score[S.t] >= F.target) { st.ball.st = "dead"; dead(st, 150, "over"); return; }
  if (st.buzzer) { endPeriod(st); return; }
  dead(st, 75, "inbound", 1 - S.t, null);
  st.ball.st = "through";
}
function endPeriod(st) {
  const F = FORMATS[st.cfg.fmt];
  st.buzzer = false;
  if (st.q >= F.periods && st.score[0] !== st.score[1]) { say(st, "final"); dead(st, 150, "over"); return; }
  say(st, st.q >= F.periods ? "overtime" : "period");
  if (st.ball.st !== "through") st.ball.st = "dead";
  st.q++;
  const T = st.q >= 5 ? (st.q % 2 ? st.tipWinner : 1 - st.tipWinner) : st.q === 4 ? st.tipWinner : 1 - st.tipWinner;
  dead(st, 150, "inbound", T, null);
  st.clock = (st.q > F.periods ? F.ot : F.len) * HZ;
}

function ballStep(st) {
  const b = st.ball;
  b.f++;
  if (b.st === "tip") {
    if (st.t >= 30) { if (st.t === 30) b.vz = 6.2; flight(b); }
    return;
  }
  if (b.st === "held") {
    const H = st.p[b.own];
    if (H.act?.kind !== "dunk") { b.x = H.x + H.face * 0.32; b.y = H.y - 0.05; b.z = H.act?.kind === "jump" ? H.z + H.h + 0.15 : 0.95; }
    return;
  }
  if (b.st === "pass") {
    flight(b);
    // a defender in the lane can pick it off; the target (or a teammate on the line) catches
    for (const O of st.p) {
      if (O.t === st.p[b.from].t) continue;
      if (len(O.x - b.x, O.y - b.y) < 0.55 && b.z < 2.3 + O.z && rnd(st) < 0.07 + 0.12 * O.def) { giveBall(st, O); say(st, "intercept", O); return; }
    }
    for (const Q of st.p) {
      if (Q.t !== st.p[b.from].t || Q.g === b.from) continue;
      if (len(Q.x - b.x, Q.y - b.y) < (Q.g === b.to ? 0.75 : 0.4) && b.z < 2.6 + Q.z) { giveBall(st, Q); return; }
    }
    if (b.z <= 0 || b.f > PASS_MAX) loose(st);
    return;
  }
  if (b.st === "shot") {
    // a block: early in the flight, a defender in the air under the ball
    if (b.kind !== "dunk" && b.f < 22) {
      const S = st.p[b.from];
      for (const D of st.p) {
        if (D.t === S.t || D.z < 0.15 || D.act?.blockTried) continue;
        if (len(D.x - b.x, D.y - b.y) < 0.75 && b.z < D.z + D.h + 0.7) {
          if (D.act) D.act.blockTried = true;
          if (rnd(st) < 0.18 + 0.3 * D.def) { blocked(st, D, S); return; }
        }
      }
    }
    flight(b);
    if (b.f >= b.T) {
      const S = st.p[b.from];
      if (b.made) {
        const d = dirOf(S.t);
        Object.assign(b, { x: d * C.rimX, y: C.cy, z: C.rimZ, vx: 0, vy: 0, vz: -1.5 });
        scored(st, S, b.pts);
        if (b.kind !== "dunk") st.ev.push("swish");
        return;
      }
      if (b.air) { say(st, "airball", S); b.st = "loose"; b.air = false; return; }
      // off the iron
      const d = dirOf(S.t);
      b.vx = -d * (1.2 + rnd(st) * 2.6); b.vy = (rnd(st) - 0.5) * 5; b.vz = 2.0 + rnd(st) * 2.4;
      b.st = "loose"; b.rim = true; st.shot = st.cfg.shot * HZ;
      say(st, b.kind === "dunk" ? "rimout" : "miss", S);
      if (st.buzzer) { endPeriod(st); }
    }
    return;
  }
  if (b.st === "loose") {
    const wasUp = b.z > 0.01;
    flight(b);
    if (b.z <= 0) {
      b.z = 0;
      if (b.vz < -0.8) { b.vz = -b.vz * 0.6; b.vx *= 0.85; b.vy *= 0.85; if (wasUp) st.ev.push("bounce"); } else { b.vz = 0; b.vx *= 0.96; b.vy *= 0.96; }
      if (st.phase === "live" && !inBounds(b.x, b.y)) { turnover(st, "oob", null, b.x, b.y); return; }
    }
    if (st.phase !== "live") return;
    // the nearest hand within reach takes it
    let best = null, bd = 0.7;
    for (const P of st.p) {
      if (P.act?.kind === "jump" || P.act?.kind === "dunk") continue;
      const k = len(P.x - b.x, P.y - b.y);
      if (k < bd && b.z < P.z + P.h + 0.45) { bd = k; best = P; }
    }
    if (best) {
      const off = st.poss === best.t;
      giveBall(st, best);
      say(st, b.f > 2 ? (off ? "oreb" : "dreb") : "loosegrab", best);
      if (st.buzzer) endPeriod(st);
    }
    if (b.f > 600) turnover(st, "oob", null, b.x, b.y);
  }
  if (b.st === "through") { flight(b); if (b.z < 0) { b.z = 0; b.vz = 0; } }
}
function loose(st) {
  const b = st.ball;
  b.st = "loose"; b.f = 0; b.own = -1;
}

// ---- one step ---------------------------------------------------------------------------------------
export function step(st, mask = 0) {
  st.ev = [];
  const press = mask & ~st.prev;
  st.prev = mask; st.mask = mask; st.frame++;
  if (st.phase === "over") return st;
  const b = st.ball, F = FORMATS[st.cfg.fmt];
  st.t++;

  // the tip: the ball goes up at 30 frames, the jumpers meet it at the top
  if (st.phase === "tip") {
    for (const g of st.jumpers) {
      const P = st.p[g], go = P.t === 0 && !st.cfg.auto ? st.tipPress >= 0 && st.t >= st.tipPress : st.t === TIP_JUMP + Math.round((1 - P.k) * 6);
      if (go && P.z === 0 && !P.tipped) { P.tipped = true; P.vz = Math.sqrt(2 * G * (P.leap + 0.2)); P.z = 0.0001; }
    }
    if (st.t === 30) st.ev.push("toss");
    if (st.t === 63) {
      const J = st.jumpers.map(g => st.p[g]);
      let p0 = 0.5 + 0.35 * (J[0].k - J[1].k);
      if (!st.cfg.auto) { const e = st.tipPress < 0 ? 99 : Math.abs(st.tipPress - TIP_JUMP); p0 += e <= 6 ? 0.2 : e <= 14 ? 0.05 : -0.15; if (st.cfg.assist) p0 += 0.1; }
      const w = rnd(st) < clamp(p0, 0.05, 0.95) ? 0 : 1;
      st.tipWinner = w;
      const to = st.p.filter(Q => Q.t === w && !st.jumpers.includes(Q.g)).reduce((a, Q) => (len(Q.x, Q.y - C.cy) < len(a.x, a.y - C.cy) ? Q : a));
      for (const P of J) P.tipped = false;
      // the winner taps it to the nearest teammate
      st.phase = "live"; st.poss = w;
      passTo(st, J[w], to);
      Object.assign(b, { x: J[w].x + dirOf(w) * 0.3, y: C.cy, z: 3.3 });
      aim(b, to.x, to.y, 1.4, 30);
      say(st, "tip", J[w]);
    }
  }
  if (st.phase === "live") {
    // control follows the ball (Tecmo): a loose ball or a lost one hands the human the nearest man
    if (!st.cfg.auto) {
      const H = holder(st);
      if (H && H.t === 0) st.ctl = H.i;
      else if ((H && H.t === 1 && st.ctlFor !== H.g) || (b.st === "loose" && st.ctlFor !== "loose")) { const N = nearestToBall(st, 0); if (N) st.ctl = N.i; }
      st.ctlFor = H ? H.g : b.st === "loose" ? "loose" : st.ctlFor;
    }
  }
  for (const P of st.p) {
    if (P.cool > 0) P.cool--;
    if (st.phase === "live" && human(st, P)) humanThink(st, P, mask, press);
    else if (st.phase === "tip" && P.t === 0 && !st.cfg.auto && st.jumpers.includes(P.g)) humanThink(st, P, mask, press);
    else cpuThink(st, P);
  }
  // actions under way
  for (const P of st.p) {
    const a = P.act;
    if (!a) continue;
    if (a.kind === "dunk") { if (st.phase !== "dead" || a.f > 16) dunkStep(st, P); else P.act = null; continue; }
    a.f++;
    if (a.kind === "jump" && st.phase === "live" && a.rel >= 0 && a.f >= a.rel) { const q = releaseQ(a.f); a.q = q; release(st, P, q); }
    if (a.kind === "follow" && a.f > 30 && P.z === 0) P.act = null;
  }
  // a defender squared up in front of the ball slows the drive (more for a good defender)
  const Hb = st.phase === "live" ? holder(st) : null;
  if (Hb && (Hb.vx || Hb.vy)) {
    const v = len(Hb.vx, Hb.vy);
    for (const D of st.p) {
      if (D.t === Hb.t || D.z > 0) continue;
      const ox = D.x - Hb.x, oy = D.y - Hb.y, d = len(ox, oy);
      if (d < 0.95 && (ox * Hb.vx + oy * Hb.vy) / (d * v || 1) > 0.45) {
        const k = 0.55 - 0.3 * D.def + 0.2 * Hb.k + (st.cfg.assist && human(st, Hb) ? 0.2 : 0);
        Hb.vx *= clamp(k, 0.2, 0.9); Hb.vy *= clamp(k, 0.2, 0.9);
        break;
      }
    }
  }
  // move, jump, land, keep apart
  for (const P of st.p) {
    if (P.act?.kind !== "dunk") {
      const busy = P.act && (P.act.kind === "jump" || P.z > 0);
      if (P.cool > 22) { P.vx *= 0.45; P.vy *= 0.45; }   // off balance after a reach
      if (!busy) { P.x += P.vx * DT; P.y += P.vy * DT; }
      if (P.vx || P.vy) { P.mv++; if (P.vx > 0.2) P.face = 1; else if (P.vx < -0.2) P.face = -1; } else P.mv = 0;
      if (P.z > 0) { P.vz -= G * DT; P.z += P.vz * DT; if (P.z <= 0) { P.z = 0; P.vz = 0; if (P.act && P.act.kind !== "follow") P.act = P.act.kind === "jump" ? { kind: "follow", f: 99 } : null; } }
    }
    P.x = clamp(P.x, -C.hx - 1.2, C.hx + 1.2); P.y = clamp(P.y, -1.2, C.w + 1.2);
  }
  for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) {
    const A = st.p[i], B = st.p[j];
    if (A.act?.kind === "dunk" || B.act?.kind === "dunk") continue;
    const dx = B.x - A.x, dy = B.y - A.y, d2 = dx * dx + dy * dy;
    if (d2 >= 0.5 * 0.5) continue;
    const d = Math.sqrt(d2) || 0.01, push = (0.5 - d) / 2, nx = d2 ? dx / d : 1, ny = d2 ? dy / d : 0;
    A.x -= nx * push; A.y -= ny * push; B.x += nx * push; B.y += ny * push;
  }
  if (st.phase === "live") {
    const H = holder(st);
    // keep the CPU's carrier inside the lines it never meant to cross; the human's steps are their own
    if (H && !human(st, H)) { H.x = clamp(H.x, -C.hx + 0.2, C.hx - 0.2); H.y = clamp(H.y, 0.2, C.w - 0.2); }
  }
  ballStep(st);

  if (st.phase === "live") {
    const H = holder(st);
    if (H && !inBounds(H.x, H.y)) turnover(st, "oob", H, H.x, H.y);
    else {
      if (b.st !== "shot" && b.st !== "dead" && b.st !== "through") {
        if (--st.shot <= 0) { const P = H || st.p[st.p.findIndex(Q => Q.t === st.poss)]; turnover(st, "shotclock", P, P.x, P.y); }
      }
      if (st.phase === "live" && F.periods && --st.clock <= 0) {
        st.clock = 0;
        const inAir = b.st === "shot" || st.p.some(P => P.act?.kind === "dunk" && P.act.f < 16) || st.p.some(P => P.act?.kind === "jump" && b.st === "held" && b.own === P.g);
        if (inAir && !st.buzzer) { st.buzzer = true; st.ev.push("buzzer"); }
        else if (!inAir) { st.ev.push("buzzer"); endPeriod(st); }
      }
    }
  }
  if (st.phase === "dead" && st.t >= st.deadFor) {
    if (st.after === "over") { st.phase = "over"; st.ev.push("over"); }
    else if (st.after === "inbound") {
      // the inbounder must reach the spot (the rest keep running into the play); a long walk is cut short
      const I = st.p[st.inbounder], r = st.reset[I.g];
      if (len(I.x - r[0], I.y - r[1]) < 0.4 || st.t >= st.deadFor + 150) {
        I.x = r[0]; I.y = r[1];
        for (const P of st.p) { if (P.act?.kind !== "dunk") P.act = null; }
        st.phase = "live";
        giveBall(st, I);
        st.ev.push("inbound");
      }
    }
  }
  return st;
}

// ---- the record -----------------------------------------------------------------------------------
export function rleEncode(masks) {
  const out = [];
  for (const m of masks) { const n = out.length; if (n && out[n - 2] === m) out[n - 1]++; else out.push(m, 1); }
  return out;
}
export function rleDecode(rle) {
  const out = [];
  for (let i = 0; i < rle.length; i += 2) for (let k = 0; k < rle[i + 1]; k++) out.push(rle[i]);
  return out;
}
export function resultOf(st) {
  const s = st.score;
  return { done: st.phase === "over", winner: st.phase === "over" ? (s[0] > s[1] ? 0 : 1) : null, score: [...s], periods: st.q, frames: st.frame, pts: [...st.pts], fga: [...st.fga], fgm: [...st.fgm] };
}
// Play a record again: {version, seed, cfg, inputLog} -> its result.
export function replay(rec) {
  if (rec.version !== VERSION) throw new Error(`hoops record version ${rec.version}, sim ${VERSION}`);
  const st = newGame(rec.seed, rec.cfg);
  const log = rec.inputLog;
  for (let k = 0; k < log.length; k += 2) for (let n = 0; n < log[k + 1]; n++) step(st, log[k]);
  return resultOf(st);
}

// For the checks only: put the ball in a player's hands at (x, y), live, with the clocks set.
export function setUp(st, g, x, y, { shot = null, clock = null } = {}) {
  const P = st.p[g];
  for (const Q of st.p) { Q.act = null; Q.z = 0; Q.vz = 0; Q.jumpAt = -1; }
  P.x = x; P.y = y; st.phase = "live"; st.t = 0;
  giveBall(st, P);
  if (shot != null) st.shot = shot;
  if (clock != null) st.clock = clock;
  return st;
}
// For the checks only: a release from where the player stands, its outcome forced.
export function forceShot(st, g, made) {
  const P = st.p[g];
  release(st, P, 1);
  st.ball.made = made; st.ball.air = false;
  return st;
}
