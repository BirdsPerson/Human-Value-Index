// THE PARK, skateable: the sim. Pure and deterministic: 60 ticks a second, one input word a tick, a
// seeded generator (the balance meters' first wobble), no clock, no Math.random, no trig (a 64-way
// table built by series below), only + - * / and sqrt. The same {v, cfg, inputLog} always gives the
// same run, so a run is its input log (run-length encoded) and anyone can re-skate it: the replay, the
// check of a result before it is kept, and later a server, or the tournaments' async events.
//
// The feel is the handheld isometric skate games' (a fixed camera, tank steering, the trick buttons),
// the rules the classic combo system's:
//   - every trick adds its points to the combo's BASE and 1 to its MULTIPLIER; the same trick again in
//     one combo is worth less each time (REPEAT)
//   - the combo is BANKED (base x multiplier into the score) when you land and ride away
//   - a MANUAL on landing, or a REVERT on landing in a quarter pipe, keeps the combo going; grinds,
//     lip tricks and air off a grind or a manual chain it too
//   - a BAIL (a bad landing, a meter run out) loses the whole combo
//
// THE INPUT WORD (pack/unpack): up 1, down 2, left 4, right 8, A (ollie) 16, B (grab) 32, X (flip) 64,
// Y (grind) 128, R (revert) 256.
//
// THE RESULT (resultOf): {game: "skate", v, level, mode, seed, score, best, letters: "SK_T_", tape,
// goals: [id...], goalsOf, ticks, done} -- what the tournaments and the results list read.
import { LEVELS, LETTERS } from "./levels.js";

export const VERSION = 1;
export const HZ = 60;
export const RUN_TICKS = 120 * HZ;          // a RUN: two minutes
const OVERTIME = 10 * HZ;                    // a combo in the air at the horn gets this long to land
const sqrt = Math.sqrt, abs = Math.abs, floor = Math.floor, round = Math.round, min = Math.min, max = Math.max;

// ---- the input ------------------------------------------------------------------------------------------
export const BIT = { up: 1, down: 2, left: 4, right: 8, a: 16, b: 32, x: 64, y: 128, r: 256 };
export function pack(o = {}) { let w = 0; for (const k in BIT) if (o[k]) w |= BIT[k]; return w; }
export function unpack(w) { const o = {}; for (const k in BIT) o[k] = (w & BIT[k]) !== 0; return o; }
// the d-pad as one of nine: 0 none, 1 up, 2 down, 3 left, 4 right, 5 up-left, 6 up-right, 7 down-left, 8 down-right
export function dirOf(w) {
  const dx = (w & BIT.right ? 1 : 0) - (w & BIT.left ? 1 : 0), dy = (w & BIT.down ? 1 : 0) - (w & BIT.up ? 1 : 0);
  if (!dx && !dy) return 0;
  if (!dx) return dy < 0 ? 1 : 2;
  if (!dy) return dx < 0 ? 3 : 4;
  return dy < 0 ? (dx < 0 ? 5 : 6) : (dx < 0 ? 7 : 8);
}

// ---- the tricks ------------------------------------------------------------------------------------------
// by d-pad direction (dirOf): [name, points] (flips also their length in ticks)
export const FLIPS = [["KICKFLIP", 100, 16], ["IMPOSSIBLE", 150, 20], ["POP SHOVE-IT", 100, 14], ["KICKFLIP", 100, 16], ["HEELFLIP", 100, 16], ["HARDFLIP", 250, 22], ["VARIAL HEELFLIP", 250, 22], ["VARIAL KICKFLIP", 200, 20], ["360 FLIP", 300, 24]];
export const GRABS = [["INDY", 200], ["NOSEGRAB", 150], ["TAILGRAB", 150], ["METHOD", 250], ["MELON", 200], ["MADONNA", 300], ["BENIHANA", 300], ["STALEFISH", 250], ["CROSSBONE", 250]];
export const GRINDS = [["50-50", 100], ["NOSEGRIND", 150], ["5-0", 150], ["BOARDSLIDE", 150], ["LIPSLIDE", 150], ["CROOKED", 200], ["SMITH", 200], ["FEEBLE", 200], ["BLUNTSLIDE", 250]];
export const LIPS = [["AXLE STALL", 150], ["INVERT", 300], ["ROCK TO FAKIE", 150], ["NOSE STALL", 150], ["DISASTER", 200], ["EGGPLANT", 400], ["HANDPLANT", 400], ["BLUNT TO FAKIE", 250], ["NOSE PICK", 250]];
export const MANUALS = [null, ["MANUAL", 100], ["NOSE MANUAL", 120]];
export const REVERT = ["REVERT", 100];
export const SPIN_PTS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500];
export const REPEAT = [1, 0.75, 0.5, 0.25, 0.1];
export const PER_TICK = { grind: 2, manual: 1, lip: 3, grab: 2 };
const GRAB_SET = 10, GRAB_UNWIND = 5;

// ---- the physics (tiles, ticks) ----------------------------------------------------------------------------
export const P = {
  G: 0.0075,          // gravity in the air
  GR: 0.004,          // gravity along a ramp
  OLLIE: 0.105, CHARGE: 30, CHARGE_K: 0.0011, LIP_K: 0.8,
  PUSH: 0.0035, PUSH_MAX: 0.13, MAXV: 0.27, FRICTION: 0.9985, BRAKE: 0.95,
  PUMP_DOWN: 0.0016, PUMP_UP: 0.0005,
  VERT_K: 1.55, VZ_MAX: 0.27,
  STEP: 0.12, SPIN: 2.4, TURN: 1.25,
  BAIL_T: 75,
};
export const BAL = { kick: 0.2, drift: 0.00045, grow: 0.0000035, lean: 0.003, push: 0.0028, damp: 0.94 };

// the compass: 64 headings, cos and sin by series (exact arithmetic, the same in every engine)
const N = 64, TAU = Math.PI * 2;
function sc(a) {   // -> [cos a, sin a], |a| <= pi
  let c = 0, s = 0, term = 1;
  for (let k = 0; k < 30; k++) { if (k % 2 === 0) c += (k % 4 === 0 ? 1 : -1) * term; else s += ((k - 1) % 4 === 0 ? 1 : -1) * term; term = (term * a) / (k + 1); }
  return [c, s];
}
export const COS = [], SIN = [];
for (let i = 0; i < N; i++) { let a = (i * TAU) / N; if (a > Math.PI) a -= TAU; const [c, s] = sc(a); COS.push(c); SIN.push(s); }
const wrap64 = (h) => { h %= N; return h < 0 ? h + N : h; };
// the heading h (0..64, fractional) as a unit vector, between the table's entries
export function headVec(h) {
  h = wrap64(h);
  const i = floor(h), f = h - i, j = (i + 1) % N;
  const x = COS[i] * (1 - f) + COS[j] * f, y = SIN[i] * (1 - f) + SIN[j] * f, n = sqrt(x * x + y * y);
  return [x / n, y / n];
}
// the nearest of the 64 headings to a vector
export function headOf(x, y) { let best = 0, bd = -2; for (let i = 0; i < N; i++) { const d = COS[i] * x + SIN[i] * y; if (d > bd) { bd = d; best = i; } } return best; }

// ---- the level, compiled -------------------------------------------------------------------------------------
const COMPILED = new Map();
// a quarter pipe's frame: which way is up the ramp, the lip's coordinate, its depth
function qpFrame(o) {
  switch (o.dir) {
    case "w": return { ax: "x", sgn: -1, lip: o.x0, foot: o.x1 };
    case "e": return { ax: "x", sgn: 1, lip: o.x1, foot: o.x0 };
    case "n": return { ax: "y", sgn: -1, lip: o.y0, foot: o.y1 };
    default: return { ax: "y", sgn: 1, lip: o.y1, foot: o.y0 };
  }
}
export function levelOf(id) {
  if (COMPILED.has(id)) return COMPILED.get(id);
  const D = LEVELS[id];
  if (!D) throw new Error(`no level ${id}`);
  const objs = D.objs.map((o, i) => ({ ...o, i, ...(o.k === "qp" || o.k === "slope" ? { f: qpFrame(o) } : {}) }));
  const rails = D.rails.map(r => ({ ...r, q: -1 }));
  objs.forEach(o => {   // THE COPING: every quarter pipe's lip
    if (o.k !== "qp") return;
    const f = o.f, a = f.ax === "x" ? [f.lip, o.y0, o.H] : [o.x0, f.lip, o.H], b = f.ax === "x" ? [f.lip, o.y1, o.H] : [o.x1, f.lip, o.H];
    rails.push({ id: `coping-${o.id}`, name: "THE COPING", a, b, q: o.i, coping: true });
  });
  for (const r of rails) {
    const dx = r.b[0] - r.a[0], dy = r.b[1] - r.a[1], len = sqrt(dx * dx + dy * dy);
    Object.assign(r, { dx, dy, len, ux: dx / len, uy: dy / len, dz: r.b[2] - r.a[2] });
  }
  const L = { ...D, objs, rails, railIx: Object.fromEntries(rails.map((r, i) => [r.id, i])) };
  COMPILED.set(id, L);
  return L;
}

const WALL = 50;
// the ground at (x, y): {h, gx, gy, o} (o: the object index, -1 the floor, -2 out of bounds)
export function ground(L, x, y) {
  if (x < 0 || y < 0 || x > L.W || y > L.H) return { h: WALL, gx: 0, gy: 0, o: -2 };
  let h = 0, gx = 0, gy = 0, o = -1;
  for (const b of L.objs) {
    if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
    let bh, bgx = 0, bgy = 0;
    if (b.k === "box") bh = b.z;
    else {
      const f = b.f, span = f.ax === "x" ? b.x1 - b.x0 : b.y1 - b.y0, p = f.ax === "x" ? x : y;
      const t = f.sgn > 0 ? (p - f.foot) / span : (f.foot - p) / span;
      let dhdt;
      if (b.k === "qp") { bh = b.H * t * t; dhdt = 2 * b.H * t; } else { bh = b.z0 + (b.z1 - b.z0) * t; dhdt = b.z1 - b.z0; }
      const g = (dhdt * f.sgn) / span;
      if (f.ax === "x") bgx = g; else bgy = g;
    }
    if (bh > h || o === -1) { if (bh >= h) { h = bh; gx = bgx; gy = bgy; o = b.i; } }
  }
  return { h, gx, gy, o };
}

// ---- the generator -------------------------------------------------------------------------------------------
function rnd(st) {
  let t = (st.rng = (st.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---- a new game ------------------------------------------------------------------------------------------------
export function newGame({ level = "park", mode = "run", seed = 1 } = {}) {
  const L = levelOf(level), S = L.start;
  const st = {
    v: VERSION, level, mode, seed: seed >>> 0, rng: (seed >>> 0) || 1, t: 0, end: mode === "run" ? RUN_TICKS : 0, done: false,
    x: S.x, y: S.y, z: 0, vx: 0, vy: 0, vz: 0, h: S.h, face: 0, fakie: false, st: "ground", o: -1, dz: 0,
    charge: 0, pw: 0, vert: -1, tr: null, g: null, m: null, lip: null, bailT: 0,
    pend: 0, pendRamp: false, mq: 0, lastUp: -99, lastDown: -99, lastR: -99, lastY: -99, lastRail: -1, railCool: 0,
    combo: null, score: 0, best: 0, letters: 0, tape: false, goals: [], ev: [],
    stats: { tricks: 0, bails: 0, combos: 0, maxSpin: 0, maxMult: 0 },
  };
  const g = ground(L, st.x, st.y); st.z = g.h; st.o = g.o;
  return st;
}

// ---- the combo ---------------------------------------------------------------------------------------------------
function addTrick(st, name, pts) {
  if (!st.combo) st.combo = { base: 0, mult: 0, names: [], counts: {}, spin: 0 };
  const C = st.combo, k = C.counts[name] || 0, v = floor(pts * REPEAT[min(k, REPEAT.length - 1)]);
  C.counts[name] = k + 1; C.base += v; C.mult += 1; C.names.push(name);
  if (C.names.length > 40) C.names.shift();
  st.stats.tricks++;
  st.ev.push(["trick", name, v]);
}
const tickPts = (st, n) => { if (st.combo) st.combo.base += n; };
function bank(st, L) {
  const C = st.combo; if (!C) return;
  const pts = C.base * C.mult;
  st.score += pts; st.combo = null; st.pend = 0; st.stats.combos++;
  if (pts > st.best) st.best = pts;
  if (C.mult > st.stats.maxMult) st.stats.maxMult = C.mult;
  st.ev.push(["bank", pts, C.base, C.mult]);
  for (const G of L.goals) {
    if (G.kind === "combo" && pts >= G.n) goal(st, G);
    if (G.kind === "score" && st.score >= G.n) goal(st, G);
    if (G.kind === "trick" && C.counts[G.trick]) goal(st, G);
    if (G.kind === "spin" && C.spin >= G.halves) goal(st, G);
  }
}
function goal(st, G) { if (st.goals.includes(G.id)) return; st.goals.push(G.id); st.ev.push(["goal", G.id, G.name]); }
function bail(st, why) {
  const lost = st.combo ? st.combo.base * st.combo.mult : 0;
  st.combo = null; st.pend = 0; st.mq = 0; st.tr = null; st.g = null; st.m = null; st.lip = null; st.vert = -1;
  st.st = "bail"; st.bailT = P.BAIL_T; st.vz = 0; st.vx *= 0.5; st.vy *= 0.5; st.charge = 0; st.stats.bails++;
  st.ev.push(["bail", why, lost]);
}

// ---- balance (grind, manual, lip) ----------------------------------------------------------------------------------
// b: -1..1 (the meter's needle; past either end you fall). The key that matches the needle's side pushes
// it further; the other pulls it back: hold the one AWAY from where it leans.
function newBal(st) { const r = rnd(st); return { b: (r - 0.5) * BAL.kick, bv: 0, t: 0 }; }
function balance(B, neg, pos) {
  B.t++;
  const side = B.b > 0 ? 1 : B.b < 0 ? -1 : 0;
  B.bv += side * (BAL.drift + BAL.grow * B.t) + B.b * BAL.lean;
  if (neg) B.bv -= BAL.push;
  if (pos) B.bv += BAL.push;
  B.bv *= BAL.damp; B.b += B.bv;
  return abs(B.b) < 1;
}

// ---- the step -------------------------------------------------------------------------------------------------------
export function step(st, w) {
  st.ev = [];
  if (st.done) return st;
  const L = levelOf(st.level);
  const p = st.pw; st.pw = w;
  const on = (k) => (w & k) !== 0, edge = (k) => (w & k) !== 0 && (p & k) === 0, rel = (k) => (w & k) === 0 && (p & k) !== 0;
  st.t++;
  // a manual is UP then DOWN (or DOWN then UP: a nose manual) inside a quarter second, no trick button held
  let seq = 0;
  if (!on(BIT.b) && !on(BIT.x)) {
    if (edge(BIT.down) && st.t - st.lastUp <= 14) seq = 1;
    else if (edge(BIT.up) && st.t - st.lastDown <= 14) seq = 2;
  }
  if (edge(BIT.up)) st.lastUp = st.t;
  if (edge(BIT.down)) st.lastDown = st.t;
  if (edge(BIT.r)) st.lastR = st.t;
  if (edge(BIT.y)) st.lastY = st.t;
  if (st.railCool > 0) st.railCool--;
  const I = { w, on, edge, rel, seq };
  switch (st.st) {
    case "ground": case "manual": groundTick(st, L, I); break;
    case "air": airTick(st, L, I); break;
    case "grind": grindTick(st, L, I); break;
    case "lip": lipTick(st, L, I); break;
    case "bail": bailTick(st, L); break;
  }
  collect(st, L);
  // the horn
  if (st.end && st.t >= st.end) {
    const settled = !st.combo && (st.st === "ground" || st.st === "bail");
    if (settled) { st.done = true; st.ev.push(["end", st.score]); }
    else if (st.t >= st.end + OVERTIME) {
      if (st.combo && (st.st === "ground" || st.st === "manual")) bank(st, L); else if (st.combo) { st.ev.push(["bail", "TIME", st.combo.base * st.combo.mult]); st.combo = null; }
      st.done = true; st.ev.push(["end", st.score]);
    }
  }
  return st;
}

// ---- on the ground (and in a manual) ----------------------------------------------------------------------------------
function groundTick(st, L, I) {
  const manual = st.st === "manual";
  const turn = (I.on(BIT.right) ? 1 : 0) - (I.on(BIT.left) ? 1 : 0);
  let sp0 = sqrt(st.vx * st.vx + st.vy * st.vy);
  // steering: tank style, a little slower when fast
  if (turn) st.h = wrap64(st.h + turn * max(0.75, P.TURN - sp0 * 2.5));
  // the ramp pulls you down it
  const g0 = ground(L, st.x, st.y);
  st.vx -= P.GR * g0.gx; st.vy -= P.GR * g0.gy;
  let [hx, hy] = headVec(st.h);
  let along = st.vx * hx + st.vy * hy;
  if (along < -0.003) { st.h = wrap64(st.h + 32); st.fakie = !st.fakie; along = -along; hx = -hx; hy = -hy; }   // rolled back: fakie
  const Q = g0.o >= 0 && L.objs[g0.o].k === "qp" ? L.objs[g0.o] : null;
  const up = I.on(BIT.up), down = I.on(BIT.down);
  if (!manual) {
    if (up && !Q && along < P.PUSH_MAX) along = min(P.PUSH_MAX, along + P.PUSH);   // no pushing up a quarter pipe: pump it
    if (down) along *= P.BRAKE;
  }
  if (Q && up && !manual) {   // pumping a quarter pipe: down it hard, up it a little
    const toLip = Q.f.ax === "x" ? hx * Q.f.sgn : hy * Q.f.sgn;
    along += toLip < 0 ? P.PUMP_DOWN : P.PUMP_UP;
  }
  along *= P.FRICTION;
  if (along < 0.0015 && !g0.gx && !g0.gy) along = 0;
  along = min(along, P.MAXV);
  st.vx = hx * along; st.vy = hy * along;
  // the ollie: hold A to crouch (charge), let go to pop
  if (I.on(BIT.a)) st.charge = min(P.CHARGE, st.charge + 1);
  if (I.rel(BIT.a)) {
    if (st.pend > 0 && st.combo && !manual) bank(st, L);
    const vz = P.OLLIE + st.charge * P.CHARGE_K + max(0, st.dz) * P.LIP_K;
    st.charge = 0; takeOff(st, vz, -1);
    if (manual) { st.m = null; st.ev.push(["ollie", 1]); } else st.ev.push(["ollie", 0]);
    return;
  }
  // a manual, a revert, or the combo banks
  if (manual) {
    const M = st.m;
    tickPts(st, PER_TICK.manual);
    if (!balance(M, I.on(BIT.up), I.on(BIT.down))) { bail(st, "MANUAL"); return; }
    if (along < 0.02) { st.st = "ground"; st.m = null; st.pend = 7; st.pendRamp = false; }
  } else if (I.seq && along >= 0.02) { startManual(st, I.seq); }
  else if (st.combo && st.pend > 0) {
    if (st.pendRamp && I.edge(BIT.r)) revert(st);
    else if (--st.pend <= 0) bank(st, L);
  } else if (st.combo && !st.pend) bank(st, L);
  // move
  moveGround(st, L);
}
function startManual(st, kind) {
  const [name, pts] = MANUALS[kind];
  st.st = "manual"; st.m = { ...newBal(st), k: kind }; st.pend = 0; st.mq = 0;
  addTrick(st, name, pts);
}
function revert(st) {
  addTrick(st, REVERT[0], REVERT[1]);
  st.fakie = !st.fakie; st.pend = 30; st.pendRamp = false;
  st.ev.push(["revert"]);
}
function takeOff(st, vz, vert) {
  st.st = "air"; st.vz = vz; st.vert = vert; st.face = 0; st.tr = null; st.pend = 0;
}
function moveGround(st, L) {
  const zPrev = st.z;
  let nx = st.x + st.vx, ny = st.y + st.vy;
  // a quarter pipe's lip: over it, straight up
  const cur = st.o >= 0 ? L.objs[st.o] : null;
  if (cur && cur.k === "qp") {
    const f = cur.f, past = f.ax === "x" ? (f.sgn < 0 ? nx < f.lip : nx > f.lip) : (f.sgn < 0 ? ny < f.lip : ny > f.lip);
    if (past) {
      const vp = (f.ax === "x" ? st.vx : st.vy) * f.sgn;
      if (f.ax === "x") { nx = f.lip - f.sgn * 0.01; st.vx = 0; } else { ny = f.lip - f.sgn * 0.01; st.vy = 0; }
      const g = ground(L, nx, ny);
      if (g.o === cur.i) {
        st.x = nx; st.y = ny; st.z = g.h;
        if (vp > 0.02) {
          if (st.st === "manual") { st.m = null; }
          takeOff(st, min(P.VZ_MAX, vp * P.VERT_K), cur.i);
          st.ev.push(["launch", cur.i]);
        }
        return;
      }
    }
  }
  const tryAt = (x, y) => { const g = ground(L, x, y); return g.o === st.o || g.h <= st.z + P.STEP ? g : null; };
  let g = tryAt(nx, ny);
  if (!g) {
    const gx = tryAt(nx, st.y), gy = tryAt(st.x, ny);
    if (gx && !gy) { ny = st.y; st.vy = -st.vy * 0.25; g = gx; }
    else if (gy && !gx) { nx = st.x; st.vx = -st.vx * 0.25; g = gy; }
    else { nx = st.x; ny = st.y; st.vx = -st.vx * 0.25; st.vy = -st.vy * 0.25; g = ground(L, st.x, st.y); }
    const sp = sqrt(st.vx * st.vx + st.vy * st.vy);
    if (sp > 0.01) { const nh = headOf(st.vx, st.vy); if (((nh - st.h + 96) % 64) - 32 > 16 || ((nh - st.h + 96) % 64) - 32 < -16) st.fakie = !st.fakie; st.h = nh; }
    st.ev.push(["bump", sp]);
    if (st.st === "manual") { st.st = "ground"; st.m = null; st.pend = 7; st.pendRamp = false; }
  }
  st.x = nx; st.y = ny;
  if (st.z - g.h > P.STEP && g.o !== st.o) {   // rolled off an edge (or off a kicker's lip)
    const vz = max(0, st.dz);
    st.m = null;
    takeOff(st, vz, -1);
    st.ev.push(["drop"]);
    return;
  }
  st.z = g.h; st.dz = st.z - zPrev; st.o = g.o;
}

// ---- in the air ---------------------------------------------------------------------------------------------------------
function airTick(st, L, I) {
  const Q = st.vert >= 0 ? L.objs[st.vert] : null;
  const busy = I.on(BIT.b) || I.on(BIT.x);
  if (!busy) { if (I.on(BIT.left)) st.face -= P.SPIN; if (I.on(BIT.right)) st.face += P.SPIN; }
  // the tricks
  const T = st.tr, free = !T || T.done;
  if (free && I.edge(BIT.x)) { const d = dirOf(I.w), F = FLIPS[d]; st.tr = { k: "flip", d, t: 0, dur: F[2], done: false }; addTrick(st, F[0], F[1]); }
  else if (free && I.edge(BIT.b)) { const d = dirOf(I.w), Gr = GRABS[d]; st.tr = { k: "grab", d, t: 0, rel: 0, done: false }; addTrick(st, Gr[0], Gr[1]); }
  if (st.tr && !st.tr.done) {
    const R = st.tr; R.t++;
    if (R.k === "flip") { if (R.t >= R.dur) R.done = true; }
    else {
      if (I.on(BIT.b) && !R.rel) { if (R.t > GRAB_SET) tickPts(st, PER_TICK.grab); }
      else if (!R.rel && R.t >= GRAB_SET) R.rel = R.t;
      if (R.rel && R.t - R.rel >= GRAB_UNWIND) R.done = true;
    }
  }
  if (I.seq) st.mq = I.seq;
  // a grind, a lip trick
  if ((I.on(BIT.y) || st.t - st.lastY <= 6) && (!st.tr || st.tr.done || st.tr.k === "grab")) {
    if (Q && tryLip(st, L, Q, I)) return;
    if (tryGrind(st, L, I)) return;
  }
  // fly: across first (against the walls at the height you are), then down
  if (Q) {
    const f = Q.f;
    if (f.ax === "x") { const ny = st.y + st.vy; if (ny >= Q.y0 && ny <= Q.y1) st.y = ny; else { st.y = ny; st.vert = -1; } }
    else { const nx = st.x + st.vx; if (nx >= Q.x0 && nx <= Q.x1) st.x = nx; else { st.x = nx; st.vert = -1; } }
    if (st.x < 0 || st.x > L.W) { st.x = max(0.01, min(L.W - 0.01, st.x)); st.vx = 0; }
    if (st.y < 0 || st.y > L.H) { st.y = max(0.01, min(L.H - 0.01, st.y)); st.vy = 0; }
  } else {
    let nx = st.x + st.vx, ny = st.y + st.vy;
    const blocked = (x, y) => ground(L, x, y).h > st.z + 0.02;
    if (blocked(nx, ny)) {
      if (!blocked(nx, st.y)) { ny = st.y; st.vy = -st.vy * 0.2; }
      else if (!blocked(st.x, ny)) { nx = st.x; st.vx = -st.vx * 0.2; }
      else { nx = st.x; ny = st.y; st.vx = -st.vx * 0.2; st.vy = -st.vy * 0.2; }
      st.ev.push(["bump", 0]);
    }
    st.x = nx; st.y = ny;
  }
  st.vz = max(-0.6, st.vz - P.G);
  st.z += st.vz;
  const g = ground(L, st.x, st.y);
  if (st.vz <= 0 && st.z <= g.h) land(st, L, g, Q);
}
function land(st, L, g, Q) {
  const R = st.tr;
  const r = ((st.face % 32) + 32) % 32;
  let why = null;
  if (R && !R.done) why = R.k === "flip" ? "UNDER-ROTATED" : "STILL GRABBING";
  else if (r > 8 && r < 24) why = "SIDEWAYS";
  st.z = g.h; st.o = g.o; st.dz = 0;
  if (why) { bail(st, why); st.ev.push(["land", 2]); return; }
  const halves = round(abs(st.face) / 32);
  if (halves > 0) {
    addTrick(st, `${st.face < 0 ? "FS" : "BS"} ${halves * 180}`, SPIN_PTS[min(halves, SPIN_PTS.length - 1)]);
    if (st.combo) st.combo.spin = max(st.combo.spin, halves);
    if (halves > st.stats.maxSpin) st.stats.maxSpin = halves;
  }
  const ramp = g.o >= 0 && L.objs[g.o].k === "qp";
  if (Q) {   // down the wall again: the height you had, as speed away from the lip
    const f = Q.f, sp = min(P.MAXV, (abs(st.vz) / P.VERT_K) * 0.98);
    if (f.ax === "x") st.vx = -f.sgn * sp; else st.vy = -f.sgn * sp;
    if (halves % 2 === 0) st.fakie = !st.fakie;
  } else if (halves % 2 === 1) st.fakie = !st.fakie;
  const sp = sqrt(st.vx * st.vx + st.vy * st.vy);
  if (sp > 0.004) st.h = headOf(st.vx, st.vy);
  st.st = "ground"; st.vz = 0; st.vert = -1; st.face = 0; st.tr = null; st.charge = 0;
  st.ev.push(["land", st.combo ? 1 : 0]);
  if (st.combo) {
    if (st.mq && sp >= 0.02) startManual(st, st.mq);
    else if (ramp && st.t - st.lastR <= 6) revert(st);
    else { st.pend = ramp ? 14 : 7; st.pendRamp = ramp; }
  }
  st.mq = 0;
}

// ---- grinds -----------------------------------------------------------------------------------------------------------------
function tryGrind(st, L, I) {
  if (st.vz > 0.06) return false;
  let best = null, bd = 0.45 * 0.45;
  const sp = sqrt(st.vx * st.vx + st.vy * st.vy);
  for (let i = 0; i < L.rails.length; i++) {
    const r = L.rails[i];
    if (i === st.lastRail && st.railCool > 0) continue;
    const u = max(0, min(1, ((st.x - r.a[0]) * r.dx + (st.y - r.a[1]) * r.dy) / (r.len * r.len)));
    const px = r.a[0] + r.dx * u, py = r.a[1] + r.dy * u, pz = r.a[2] + r.dz * u;
    const d2 = (st.x - px) * (st.x - px) + (st.y - py) * (st.y - py);
    if (d2 > bd || st.z < pz - 0.45 || st.z > pz + 0.55) continue;
    const along = st.vx * r.ux + st.vy * r.uy;
    if (sp > 0.03 && abs(along) < 0.35 * sp && !r.coping) continue;
    if ((u <= 0 || u >= 1) && d2 > 0.04) continue;
    best = { i, u, px, py, pz, along }; bd = d2;
  }
  if (!best) return false;
  const r = L.rails[best.i];
  let dir = best.along > 0.01 ? 1 : best.along < -0.01 ? -1 : 0;
  if (!dir) { const [hx, hy] = headVec(st.h); dir = hx * r.ux + hy * r.uy >= 0 ? 1 : -1; }
  // a spin into a grind counts, rounded to the half turn
  const halves = round(abs(st.face) / 32);
  if (halves > 0) { addTrick(st, `${st.face < 0 ? "FS" : "BS"} ${halves * 180}`, SPIN_PTS[min(halves, SPIN_PTS.length - 1)]); if (st.combo) st.combo.spin = max(st.combo.spin, halves); }
  const d = dirOf(I.w), Gd = GRINDS[d];
  st.st = "grind"; st.tr = null; st.face = 0; st.mq = 0;
  st.g = { ...newBal(st), r: best.i, u: best.u, dir, sp: max(0.06, abs(best.along)), k: d, gt: 0 };
  st.x = best.px; st.y = best.py; st.z = best.pz; st.vz = 0;
  st.h = headOf(r.ux * dir, r.uy * dir);
  addTrick(st, Gd[0], Gd[1]);
  st.ev.push(["grind", r.id]);
  return true;
}
function grindTick(st, L, I) {
  const G = st.g, r = L.rails[G.r];
  G.gt++;
  const rise = (G.dir * r.dz) / r.len;   // per tile along the way you go
  G.sp = min(P.MAXV, max(0, G.sp * 0.998 - P.GR * rise * 1.5));
  G.u += (G.dir * G.sp) / r.len;
  tickPts(st, PER_TICK.grind);
  for (const Gl of L.goals) if (Gl.kind === "grind" && Gl.rail === r.id && G.gt >= Gl.ticks) goal(st, Gl);
  const tx = r.ux * G.dir, ty = r.uy * G.dir;
  if (I.on(BIT.a)) st.charge = min(P.CHARGE, st.charge + 1);
  const leave = (vz, side) => {
    st.lastRail = G.r; st.railCool = 14; st.g = null;
    st.vx = tx * G.sp + side * -ty * 0.035; st.vy = ty * G.sp + side * tx * 0.035;
    takeOff(st, vz, r.coping && G.u > 0 && G.u < 1 ? r.q : -1);
    if (st.vert >= 0) { const f = L.objs[st.vert].f; if (f.ax === "x") st.vx = 0; else st.vy = 0; }
  };
  if (I.rel(BIT.a)) { const side = (I.on(BIT.right) ? 1 : 0) - (I.on(BIT.left) ? 1 : 0); const c = st.charge; st.charge = 0; leave(P.OLLIE * 0.95 + c * P.CHARGE_K * 0.5, side); st.ev.push(["ollie", 1]); return; }
  if (!balance(G, I.on(BIT.left), I.on(BIT.right))) { bail(st, "OFF BALANCE"); return; }
  if (G.u <= 0 || G.u >= 1) { G.u = max(0, min(1, G.u)); place(st, r, G.u); leave(0.02, 0); st.ev.push(["off"]); return; }
  if (G.sp < 0.02) { leave(0.015, 0); st.ev.push(["off"]); return; }
  place(st, r, G.u);
  st.vx = tx * G.sp; st.vy = ty * G.sp;
}
function place(st, r, u) { st.x = r.a[0] + r.dx * u; st.y = r.a[1] + r.dy * u; st.z = r.a[2] + r.dz * u; }

// ---- lip tricks (on vert) -------------------------------------------------------------------------------------------------------
function tryLip(st, L, Q, I) {
  const f = Q.f, par = f.ax === "x" ? st.vy : st.vx;
  if (abs(par) >= 0.05 || st.vz > 0.04 || st.z < Q.H - 0.1 || st.z > Q.H + 0.8) return false;
  const d = dirOf(I.w), Lp = LIPS[d];
  const halves = round(abs(st.face) / 32);
  if (halves > 0) { addTrick(st, `${st.face < 0 ? "FS" : "BS"} ${halves * 180}`, SPIN_PTS[min(halves, SPIN_PTS.length - 1)]); if (st.combo) st.combo.spin = max(st.combo.spin, halves); }
  st.st = "lip"; st.tr = null; st.face = 0; st.mq = 0; st.vx = 0; st.vy = 0; st.vz = 0; st.z = Q.H;
  st.lip = { ...newBal(st), q: Q.i, k: d };
  addTrick(st, Lp[0], Lp[1]);
  st.ev.push(["lip", Lp[0]]);
  return true;
}
function lipTick(st, L, I) {
  const Lp = st.lip, Q = L.objs[Lp.q], f = Q.f;
  tickPts(st, PER_TICK.lip);
  if (!balance(Lp, I.on(BIT.left), I.on(BIT.right))) { bail(st, "OFF THE LIP"); return; }
  if (I.rel(BIT.a) || Lp.t > 240) {   // drop back in
    const sp = 0.05;
    if (f.ax === "x") { st.vx = -f.sgn * sp; st.x = f.lip - f.sgn * 0.02; } else { st.vy = -f.sgn * sp; st.y = f.lip - f.sgn * 0.02; }
    const g = ground(L, st.x, st.y);
    st.z = g.h; st.o = g.o; st.lip = null; st.st = "ground"; st.h = headOf(st.vx, st.vy); st.dz = 0;
    st.pend = 14; st.pendRamp = true; st.charge = 0;
    st.ev.push(["land", 1]);
  }
}

// ---- a bail ----------------------------------------------------------------------------------------------------------------------------
function bailTick(st, L) {
  const g0 = ground(L, st.x, st.y);
  st.vx = (st.vx - P.GR * g0.gx) * 0.92; st.vy = (st.vy - P.GR * g0.gy) * 0.92;
  const nx = st.x + st.vx, ny = st.y + st.vy, g = ground(L, nx, ny);
  if (g.o === st.o || g.h <= st.z + P.STEP) { st.x = nx; st.y = ny; st.z = g.h; st.o = g.o; } else { st.vx = 0; st.vy = 0; }
  if (--st.bailT <= 0) { st.st = "ground"; st.vx = 0; st.vy = 0; st.fakie = false; st.face = 0; st.dz = 0; st.ev.push(["up"]); }
}

// ---- the letters and the tape ----------------------------------------------------------------------------------------------------------
function collect(st, L) {
  const near = (it) => { const dx = st.x - it.x, dy = st.y - it.y; return dx * dx + dy * dy <= 0.36 && st.z >= it.z - 0.9 && st.z <= it.z + 0.4; };
  LETTERS.forEach((c, i) => {
    if (st.letters & (1 << i)) return;
    if (near(L.items[c])) {
      st.letters |= 1 << i; st.ev.push(["letter", c]);
      if (st.letters === 31) for (const G of L.goals) if (G.kind === "letters") goal(st, G);
    }
  });
  if (!st.tape && near(L.items.tape)) { st.tape = true; st.ev.push(["tape"]); for (const G of L.goals) if (G.kind === "tape") goal(st, G); }
}

// ---- the record --------------------------------------------------------------------------------------------------------------------------
export function rleEncode(words) { const out = []; for (const m of words) { const n = out.length; if (n && out[n - 2] === m) out[n - 1]++; else out.push(m, 1); } return out; }
export function rleDecode(rle) { const out = []; for (let i = 0; i < rle.length; i += 2) for (let k = 0; k < rle[i + 1]; k++) out.push(rle[i]); return out; }
export function logTicks(rle) { let n = 0; for (let i = 1; i < rle.length; i += 2) n += rle[i]; return n; }
export const lettersOf = (mask) => LETTERS.map((c, i) => (mask & (1 << i) ? c : "_")).join("");
export function resultOf(st) {
  const L = levelOf(st.level);
  return { game: "skate", v: st.v, level: st.level, mode: st.mode, seed: st.seed, score: st.score, best: st.best, letters: lettersOf(st.letters), tape: st.tape, goals: [...st.goals], goalsOf: L.goals.length, ticks: st.t, done: st.done };
}
// a record: {v, cfg: {level, mode, seed}, inputLog (RLE)} -> {st, res}. Another version is refused.
export function replay(rec, maxTicks = Infinity) {
  const v = Number(rec?.v ?? rec?.cfg?.v);
  if (v !== VERSION) throw new Error(`skate: version ${v} is not this sim's (${VERSION})`);
  const st = newGame(rec.cfg);
  let n = 0;
  for (let i = 0; i < rec.inputLog.length; i += 2) for (let k = 0; k < rec.inputLog[i + 1]; k++) { if (n++ >= maxTicks || st.done) return { st, res: resultOf(st) }; step(st, rec.inputLog[i]); }
  return { st, res: resultOf(st) };
}
// a claimed result checked against its own log: the score, the goals and the letters must come out the same
export function verify(rec, claim) {
  try {
    const { res } = replay(rec);
    return res.score === claim.score && res.best === claim.best && res.letters === claim.letters && res.tape === claim.tape && res.goals.join() === (claim.goals || []).join();
  } catch { return false; }
}
