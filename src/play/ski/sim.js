// THE MOUNTAIN, skiable: the rider. A pure, fixed-step (60 Hz) state machine: no DOM, no clock, no
// Math.random, no trig (Math.sqrt only, which every engine rounds the same). newGame(cfg) and the
// same per-tick input words give the same run, tick for tick, so a run is {v, cfg, inputLog} and
// re-plays anywhere (scripts/check-ski.mjs does; /api/ski does, for the verified boards). The
// renderer only reads the state. The state is plain JSON (a snapshot is JSON.parse(JSON.stringify)).
//
// THE INPUT WORD, one integer a tick: the left stick (steer; in the air, with no right stick, the
// tricks), the right stick (tricks), each axis -15..15; and the buttons:
//   A      hold: crouch (tuck and charge); let go: pop (a jump). On a lift: hold to run the ride on.
//   TUCK   hold: tuck (less drag)
//   BRAKE  hold: snowplough / hockey stop (more friction; turns pivot)
//   GL GR  hold in the air: grab (one, the other, both)
//   ONE    the word came from one stick (keys, touch): in the air the left stick does the tricks,
//          once it has moved from where it was held at take-off
//
// THE STEERING is by the screen: the stick says which way on the screen to go (down the screen is
// down the hill: the camera stands downhill of the rider, looking up at them); the skis turn toward
// it. The camera's heading (cx, cy: which world direction is screen-down) is part of the state, so a
// re-play steers the same.
//
// THE PHYSICS (metres, seconds, on the ground world.js builds from the city's mountain):
//   gravity     along the surface: -g grad h / (1 + |grad h|^2) across the ground
//   snow        friction mu g (groomed 0.035, off-piste powder 0.075, water 0.12 and a skim's drag)
//               and air drag k v^2 (upright 0.006; a tuck or a crouch 0.003; a board's crouch 0.0036)
//   carving     the skis turn at a rate the stick asks (more stick, faster); the velocity turns with
//               them while the edge holds (grip: centripetal up to ~1.25 g on a groomer); a turn
//               asked faster than the grip leaves the velocity behind: the skis slide sideways (a
//               skid), and the sideways speed is scrubbed off: skidded turns are slow turns
//   the ground  ridden while the rider would not leave it: when the ballistic path rises clear of
//               the ground (a lip, a kicker, a cliff, a mogul at speed) the rider is in the air;
//               a landing keeps the speed along the ground and loses the part driven into it
//   the air     tricks: spin (the stick's left/right), flip (up: front, down: back), grabs; the
//               landing must come round (spin to a half turn, flip to a whole), not mid-grab, not
//               sideways to the direction of travel, not flat from a height: else a wipeout
//   a wipeout   the rider tumbles and slides for a second and a half, then stands (where they stopped)
//   the rails   ridden on to (the ramp at their start) or landed on, skis along: a grind
//   the lifts   stop in the line at a lift's foot: the next chair (or cabin) takes you up; a held A
//               runs the ride on at six times; you are put off at the top
//   the water   THE RETENTION POOL and THE BURNOUT hold a fast rider (a skim) and take a slow one
// Every run segment, every challenge: the same rules. (The weather and the hour are the picture's.)

import {
  G, q, W0, heightAt, gradAt, gradBack, fallAt, surfaceAt, RUNS, treesNear, BLOCKS, TOWERS, waterAt, RAILS, baseH, inPipe, pipeLocal, PIPE,
  LIFTS_W, LIFT_W, LOAD_R, LIFT_FF, liftWait, liftRideTicks, POIS, POI, FIND_R, FILES, FILE_R, KICKERS, BIG_AIR, crosses, POOL, BASE_LINE,
} from "./world.js";
import { CHALLENGE, RUNNABLE, gatesOf, linesOf, PENALTY, FOLLOW_R, PIPE_LIMIT, MAX_RUN, LEAVE_R, instructorAt, fieldTimes, medalOf, SUMMIT_FINISH } from "./challenges.js";

export const VERSION = 1;
export const HZ = 60;
const DT = 1 / HZ, sqrt = Math.sqrt, abs = Math.abs;
export const BTN = { A: 1 << 20, TUCK: 1 << 21, BRAKE: 1 << 22, GL: 1 << 23, GR: 1 << 24, ONE: 1 << 25 };
export const CAM_SIDE = 1;   // +1: the camera downhill of the rider (down the screen is down the hill)

// ---- the input word ---------------------------------------------------------------------------------
const qs = (v) => Math.max(-15, Math.min(15, Math.round((v || 0) * 15)));
export function pack({ lx = 0, ly = 0, rx = 0, ry = 0, a = false, tuck = false, brake = false, gl = false, gr = false, one = false } = {}) {
  return (qs(lx) + 15) | ((qs(ly) + 15) << 5) | ((qs(rx) + 15) << 10) | ((qs(ry) + 15) << 15) | (a ? BTN.A : 0) | (tuck ? BTN.TUCK : 0) | (brake ? BTN.BRAKE : 0) | (gl ? BTN.GL : 0) | (gr ? BTN.GR : 0) | (one ? BTN.ONE : 0);
}
export function unpack(w) {
  return { lx: ((w & 31) - 15) / 15, ly: (((w >> 5) & 31) - 15) / 15, rx: (((w >> 10) & 31) - 15) / 15, ry: (((w >> 15) & 31) - 15) / 15, a: (w & BTN.A) !== 0, tuck: (w & BTN.TUCK) !== 0, brake: (w & BTN.BRAKE) !== 0, gl: (w & BTN.GL) !== 0, gr: (w & BTN.GR) !== 0, one: (w & BTN.ONE) !== 0 };
}
export const IDLE = pack();
export function rleEncode(words) { const out = []; for (const m of words) { const n = out.length; if (n && out[n - 2] === m) out[n - 1]++; else out.push(m, 1); } return out; }
export function rleDecode(rle) { const out = []; for (let i = 0; i < rle.length; i += 2) for (let k = 0; k < rle[i + 1]; k++) out.push(rle[i]); return out; }
export function logTicks(rle) { let n = 0; for (let i = 1; i < rle.length; i += 2) n += rle[i]; return n; }

// ---- vector helpers (no trig) ------------------------------------------------------------------------
const norm = (x, y) => { const n = sqrt(x * x + y * y); return n > 1e-9 ? [x / n, y / n, n] : [0, 0, 0]; };
// cos and sin of a small angle (|a| < 0.3), by series
const cosS = (a) => { const a2 = a * a; return 1 - a2 / 2 + (a2 * a2) / 24 - (a2 * a2 * a2) / 720; };
const sinS = (a) => { const a2 = a * a; return a * (1 - a2 / 6 + (a2 * a2) / 120 - (a2 * a2 * a2) / 5040); };
const rot = (x, y, a) => { const c = cosS(a), s = sinS(a); return [x * c - y * s, x * s + y * c]; };
// turn unit (hx, hy) toward unit (tx, ty) by at most a radians -> [hx, hy, turned]
function turnToward(hx, hy, tx, ty, a) {
  const c = hx * tx + hy * ty, s = hx * ty - hy * tx;
  if (c >= cosS(a)) return [tx, ty, 0];
  const [x, y] = rot(hx, hy, s >= 0 ? a : -a), [nx, ny] = norm(x, y);
  return [nx, ny, s >= 0 ? a : -a];
}

// ---- tuning ------------------------------------------------------------------------------------------
export const PHYS = {
  muGroom: 0.035, muPowder: 0.075, muWater: 0.12, kUp: 0.006, kTuck: 0.003, kTuckBoard: 0.0036,
  grip: 1.25, gripPowder: 0.9, gripBoard: 1.1, skid: 0.55, brake: 0.45,
  turnLow: 1.3, turnOver: 1.6, pivot: 3.2, skate: 3.5, skateMax: 6, walk: 1.4,
  pop: 2.4, popMore: 4.6, crouchMax: 36, airEps: 0.12, impactMax: 16.5,
  crashTicks: 96, skimMin: 7.5, pumpV: 13.5, pump: 3.2, parkV: 13, spinRate: 10, flipRate: 8,
};
const SPIN_PTS = [0, 100, 250, 400, 600, 800, 1100, 1400, 1800, 2200];
const GRAB = { ski: ["", "MUTE", "SAFETY", "JAPAN"], board: ["", "INDY", "MELON", "STALEFISH"] };

// ---- the start -----------------------------------------------------------------------------------------
// cfg: {board, at: poi id} (free ride) | {board, ch: challenge id}
export function newGame(cfg = {}) {
  const c = cfg.ch ? CHALLENGE[cfg.ch] : null;
  const p = c?.start || POI[cfg.at] || POI.base;
  const st = {
    v: VERSION, t: 0, board: Boolean(cfg.board), x: p.x, y: p.y, z: 0, vx: 0, vy: 0, vz: 0, hx: p.hx ?? 0, hy: p.hy ?? 1, sw: false,
    mode: "ski", crouch: 0, air: null, grind: null, crash: 0, lift: null, cx: 0, cy: 1,
    found: [], files: 0, ch: null, score: 0, chain: 0, chainT: 0, last: null, land: [p.x, p.y], skim: 0,
    stats: { top: 0, jump: 0, air: 0 }, ev: [], run: -1, slip: 0, edge: 0, a0: false, ff: false,
  };
  if (!p.hx && !p.hy) { const [fx, fy, s] = fallAt(st.x, st.y); if (s > 0.01) { const [nx, ny] = norm(fx, fy); st.hx = nx; st.hy = ny; } }
  st.z = heightAt(st.x, st.y);
  { const [fx, fy, s] = fallAt(st.x, st.y); if (s > 0.02) { const [nx, ny] = norm(fx * CAM_SIDE, fy * CAM_SIDE); st.cx = nx; st.cy = ny; } else { st.cx = st.hx * CAM_SIDE; st.cy = st.hy * CAM_SIDE; } }
  // a challenge starts with a push out of the gate
  if (c && c.kind !== "skim") { st.vx = st.hx * 5; st.vy = st.hy * 5; }
  if (c) st.ch = { id: c.id, ph: "count", n: 180, tc: 0, gi: 0, miss: 0, cp: 0, score: 0, dist: 0, inT: 0, res: null };
  return st;
}
// Fast travel: only to a place already found -> a fresh free-ride state there, or null
// (a challenge's flag, once found, is a place too: "ch:<id>" starts that challenge)
export function warp(cfg, poiId, found) {
  const has = found instanceof Set ? found.has(poiId) : (found || []).includes(poiId);
  if (!has) return null;
  if (poiId.startsWith("ch:")) { const c = CHALLENGE[poiId.slice(3)]; return c?.start ? newGame({ board: cfg.board, ch: c.id }) : null; }
  if (!POI[poiId]) return null;
  return newGame({ board: cfg.board, at: poiId });
}
// The challenge whose flag the rider stands by (to start it with one press), or null
export function challengeNear(st, r = 40) {
  for (const C of RUNNABLE) { const dx = st.x - C.start.x, dy = st.y - C.start.y; if (dx * dx + dy * dy < r * r) return C; }
  return null;
}

// ---- one tick -------------------------------------------------------------------------------------------
export function step(st, word) {
  st.ev = [];
  const inp = unpack(word);
  st.t++;
  if (st.ch && st.ch.ph === "count") {
    if (--st.ch.n <= 0) { st.ch.ph = "run"; st.ev.push(["go"]); }
    camera(st, 1);
    st.a0 = inp.a;
    return st;
  }
  const px = st.x, py = st.y;
  if (st.mode === "lift") liftTick(st, inp);
  else if (st.mode === "crash") crashTick(st);
  else if (st.mode === "grind") grindTick(st, inp);
  else if (st.mode === "air") airTick(st, inp);
  else groundTick(st, inp);
  st.a0 = inp.a;
  if (st.mode !== "lift") { obstacles(st); bounds(st); }
  camera(st, 0.016);
  const sp = sqrt(st.vx * st.vx + st.vy * st.vy + st.vz * st.vz);
  if (sp > st.stats.top) st.stats.top = sp;
  if (st.t % 15 === 0) discover(st);
  if (st.ch && st.ch.ph === "run") challengeTick(st, px, py);
  if (st.chainT > 0 && --st.chainT === 0) st.chain = 0;
  return st;
}

function camera(st, k) {
  if (st.mode === "air") return;
  const [fx, fy, s] = fallAt(st.x, st.y);
  if (s < 0.03) return;
  const [tx, ty] = norm(fx * CAM_SIDE, fy * CAM_SIDE), [nx, ny] = norm(st.cx + (tx - st.cx) * k, st.cy + (ty - st.cy) * k);
  if (nx || ny) { st.cx = nx; st.cy = ny; }
}
// The stick in world terms: screen-down is (cx, cy), screen-right is (cy, -cx)
function stickWorld(st, sx, sy) {
  const wx = sx * st.cy + sy * st.cx, wy = -sx * st.cx + sy * st.cy;
  const [tx, ty, m] = norm(wx, wy);
  return [tx, ty, Math.min(1, m)];
}

// ---- on the ground ------------------------------------------------------------------------------------------
function groundTick(st, inp) {
  const sf = surfaceAt(st.x, st.y), R = sf.trail >= 0 ? RUNS[sf.trail] : null;
  st.run = sf.trail;
  const water = waterAt(st.x, st.y);
  const [gx, gy] = gradBack(st.x, st.y, st.vx, st.vy), N2 = 1 + gx * gx + gy * gy, N = sqrt(N2);
  // the velocity is 3D, along the ground; the steering works on its level part
  let vx = st.vx, vy = st.vy;
  let sp = sqrt(vx * vx + vy * vy);
  const grip = G * (st.board ? PHYS.gripBoard : R && R.kind !== "glades" ? PHYS.grip : PHYS.gripPowder) * (R?.kind === "moguls" ? 0.85 : 1) / N;
  // the stick: turn the skis toward it
  const [tx, ty, mag] = stickWorld(st, inp.lx, inp.ly);
  let turned = 0;
  if (mag > 0.05) {
    let w = mag * Math.max(PHYS.turnOver * grip / Math.max(sp, 1), PHYS.turnLow);
    if (inp.brake) w = Math.max(w, PHYS.pivot * mag);
    if (sp < 4) w = Math.max(w, 3);
    const r = turnToward(st.hx, st.hy, tx, ty, w * DT);
    st.hx = r[0]; st.hy = r[1]; turned = r[2];
    // the velocity follows the skis while the edge holds (a carve)
    if (turned && sp > 0.5) {
      const maxA = (grip * DT) / sp, a = abs(turned) <= maxA ? turned : turned > 0 ? maxA : -maxA;
      const [rx, ry] = rot(vx, vy, a);
      vx = rx; vy = ry;
    }
  }
  // gravity along the surface
  vx += (-G * gx / N2) * DT; vy += (-G * gy / N2) * DT;
  // skating and walking on the flat (or uphill): the stick pushes
  if (mag > 0.3 && sp < PHYS.skateMax + 0.5) {
    const up = gx * tx + gy * ty;
    if (up > 0.12) { vx = tx * PHYS.walk; vy = ty * PHYS.walk; st.hx = tx; st.hy = ty; }
    else { const along = vx * tx + vy * ty; if (along < PHYS.skateMax) { vx += tx * PHYS.skate * DT; vy += ty * PHYS.skate * DT; } }
  }
  // the edge: sideways speed (relative to the skis) is held off (dissipated), then scrubbed (a skid)
  const lx = -st.hy, ly = st.hx;
  let lat = vx * lx + vy * ly;
  const hold = grip * DT * (inp.brake ? 0.6 : 1), scrub = PHYS.skid * G * DT * (inp.brake ? 1.6 : 1);
  st.slip = abs(lat);
  const cut = Math.min(abs(lat), hold + (abs(lat) > hold ? scrub : 0));
  lat = lat > 0 ? lat - cut : lat + cut;
  const along0 = vx * st.hx + vy * st.hy;
  vx = st.hx * along0 + lx * lat; vy = st.hy * along0 + ly * lat;
  let vz = gx * vx + gy * vy;
  // friction and drag (on the speed along the ground)
  const sp3 = sqrt(vx * vx + vy * vy + vz * vz);
  sp = sqrt(vx * vx + vy * vy);
  const tuck = inp.tuck || inp.a;
  const mu = water ? PHYS.muWater : R && R.kind !== "glades" ? PHYS.muGroom : PHYS.muPowder;
  let dec = (mu * G) / N + (tuck ? (st.board ? PHYS.kTuckBoard : PHYS.kTuck) : PHYS.kUp) * sp3 * sp3 + (inp.brake ? PHYS.brake * G : 0);
  if (water) dec += 0.004 * sp3 * sp3;
  // THE PIPELINE's pitch is the slope's (a gentle one): in the pipe the rider pumps the transitions
  // (an arcade's assist, said so on the card): below PUMP_V, a push along the line of travel
  // THE SANDBOX's in-runs are kept fast (the same assist): a rider in the park holds about 13 m/s
  if (R?.kind === "park" && sp3 > 2 && sp3 < PHYS.parkV && !inp.brake) dec -= PHYS.pump * 0.8;
  if (inPipe(st.x, st.y)) { if (sp3 > 2 && sp3 < PHYS.pumpV) dec -= PHYS.pump; else if (sp3 > PHYS.pumpV + 2) dec += 1.6; }
  if (sp3 > 1e-6) { const k = Math.max(0, sp3 - dec * DT) / sp3; vx *= k; vy *= k; vz *= k; }
  st.edge = mag * (turned > 0 ? 1 : turned < 0 ? -1 : 0);
  // the crouch and the pop
  if (inp.a) st.crouch = Math.min(PHYS.crouchMax, st.crouch + 1);
  const popping = !inp.a && st.a0 && st.crouch > 0;
  if (popping) { vz += PHYS.pop + (PHYS.popMore * st.crouch) / PHYS.crouchMax; st.crouch = 0; st.ev.push(["pop"]); }
  else if (!inp.a) st.crouch = 0;
  // move; stay on the ground or leave it (a lip, a crest, a cliff: the ballistic path clears it)
  const nx = st.x + vx * DT, ny = st.y + vy * DT, gz = heightAt(nx, ny), bz = st.z + vz * DT - 0.5 * G * DT * DT;
  st.x = nx; st.y = ny;
  if (popping || bz > gz + PHYS.airEps) { st.z = bz; st.vx = vx; st.vy = vy; st.vz = vz - G * DT; takeoff(st); return; }
  st.z = gz;
  // along the new ground: the same speed, turned to follow it (driven into it: a little lost)
  {
    const [hx2, hy2] = gradBack(nx, ny, vx, vy), M = sqrt(1 + hx2 * hx2 + hy2 * hy2), ux = -hx2 / M, uy = -hy2 / M, uz = 1 / M;
    const s0 = sqrt(vx * vx + vy * vy + vz * vz), vn = vx * ux + vy * uy + vz * uz;
    let px = vx - vn * ux, py = vy - vn * uy, pz = vz - vn * uz;
    const s1 = sqrt(px * px + py * py + pz * pz), keep = vn < 0 ? sqrt(Math.max(0, s0 * s0 - 0.35 * vn * vn)) : s0;
    if (s1 > 1e-9) { px *= keep / s1; py *= keep / s1; pz *= keep / s1; }
    st.vx = px; st.vy = py; st.vz = pz;
  }
  sp = sqrt(st.vx * st.vx + st.vy * st.vy);
  // water: fast holds, slow sinks
  if (water) {
    if (sp < PHYS.skimMin) { wipeout(st, "THE WATER TOOK YOU", true); return; }
    st.skim += sp * DT;
  } else {
    st.skim = 0;
    if (st.t % 30 === 0 && sp < 25) st.land = [st.x, st.y];
  }
  // a lift line
  if (sp < 9 && !st.ch) for (const L of LIFTS_W) {
    const dx = st.x - L.load[0], dy = st.y - L.load[1];
    if (dx * dx + dy * dy < LOAD_R * LOAD_R) { boardLift(st, L); return; }
  }
  railMount(st);
}

function takeoff(st) {
  st.mode = "air";
  const lip = KICKERS.find(K => { const dx = st.x - K.x, dy = st.y - K.y; return dx * dx + dy * dy < (K.w + 6) * (K.w + 6); });
  st.air = { spin: 0, flip: 0, sr: 0, fr: 0, grab: 0, gk: 0, t: 0, x0: st.x, y0: st.y, sw0: st.sw, k: lip ? lip.id : null, pipe: inPipe(st.x, st.y), hx: st.hx, hy: st.hy };
  // THE PIPELINE: off the top of a wall the rider goes straight up (and comes back down the wall)
  if (st.air.pipe && st.vz > 2) {
    const [, t] = pipeLocal(st.x, st.y);
    if (abs(t) > PIPE.F + PIPE.R * 0.6) { const nx = -PIPE.dy, ny = PIPE.dx, across = st.vx * nx + st.vy * ny, side = t > 0 ? 1 : -1; const keep = -side * 0.6; st.vx += nx * (keep - across); st.vy += ny * (keep - across); }
  }
  st.ev.push(["air"]);
}

// ---- in the air ---------------------------------------------------------------------------------------------
function airTick(st, inp) {
  const A = st.air;
  A.t++;
  // the trick stick: the right stick, or (keys, touch: one stick) the left, once it has moved
  // from where the steering held it at take-off
  if (A.lk == null) A.lk = [inp.lx, inp.ly];
  if (!A.lfree && (abs(inp.lx - A.lk[0]) > 0.3 || abs(inp.ly - A.lk[1]) > 0.3 || (!inp.lx && !inp.ly))) A.lfree = true;
  const left = inp.one && A.lfree && !(inp.rx || inp.ry);
  const sx = left ? inp.lx : inp.rx, sy = left ? inp.ly : inp.ry;
  const spinT = sx * PHYS.spinRate, flipT = -sy * PHYS.flipRate;
  if (abs(sx) > 0.2) A.sr += (spinT - A.sr) * 0.3;
  else { const tgt = complete(A.spin, A.sr, 180, 75); A.sr = tgt == null ? A.sr * 0.8 : Math.max(-6, Math.min(6, tgt - A.spin)); }
  if (abs(sy) > 0.2) A.fr += (flipT - A.fr) * 0.3;
  else { const tgt = complete(A.flip, A.fr, 360, 110); A.fr = tgt == null ? A.fr * 0.8 : Math.max(-6, Math.min(6, tgt - A.flip)); }
  A.spin += A.sr; A.flip += A.fr;
  const g = (inp.gl ? 1 : 0) | (inp.gr ? 2 : 0);
  if (g) { A.grab++; A.gk = g; A.holding = true; } else A.holding = false;
  if (inp.a) st.crouch = Math.min(PHYS.crouchMax, st.crouch + 1); else st.crouch = 0;
  // ballistics
  const sp = sqrt(st.vx * st.vx + st.vy * st.vy + st.vz * st.vz), k = Math.max(0, 1 - (inp.tuck ? PHYS.kTuck : PHYS.kUp) * sp * DT);
  st.vx *= k; st.vy *= k; st.vz = st.vz * k - G * DT;
  st.x += st.vx * DT; st.y += st.vy * DT; st.z += st.vz * DT;
  if (railMount(st)) return;
  const gz = heightAt(st.x, st.y);
  if (st.z <= gz) { st.z = gz; land(st); }
}
// where a rotation left alone would come round to: the nearest whole `unit` ahead, if within `win`
function complete(a, rate, unit, win) {
  const r = a / unit, ahead = rate > 0.5 ? Math.ceil(r) * unit : rate < -0.5 ? Math.floor(r) * unit : Math.round(r) * unit;
  if (abs(ahead - a) <= win) return ahead;
  const near = Math.round(r) * unit;
  return abs(near - a) <= win * 0.5 ? near : null;
}

function land(st) {
  const A = st.air, [gx, gy] = gradAt(st.x, st.y), N = sqrt(1 + gx * gx + gy * gy);
  const impact = -((-gx * st.vx - gy * st.vy + st.vz) / N);   // speed into the ground
  const n180 = Math.round(A.spin / 180), nflip = Math.round(A.flip / 360);
  const spinErr = abs(A.spin - n180 * 180), flipErr = abs(A.flip - nflip * 360);
  const [vdx, vdy, hs] = norm(st.vx, st.vy);
  const align = abs(A.hx * vdx + A.hy * vdy);
  const airS = A.t / HZ;
  st.stats.air = Math.max(st.stats.air, airS);
  let why = null;
  if (flipErr > 55) why = nflip || abs(A.flip) > 90 ? "OVER-ROTATED" : "UNDER-ROTATED";
  else if (spinErr > 42) why = "LANDED SIDEWAYS";
  else if (A.holding && A.t > 20) why = "STILL GRABBING";
  else if (impact > PHYS.impactMax) why = "LANDED FLAT FROM A HEIGHT";
  else if (!A.pipe && hs > 6 && align < 0.62) why = "CAUGHT AN EDGE";
  // the ground takes the speed driven into it; the rest carries on along it
  const nx = -gx / N, ny = -gy / N, nz = 1 / N, vn = st.vx * nx + st.vy * ny + st.vz * nz;
  st.vx -= vn * nx; st.vy -= vn * ny; st.vz -= vn * nz;
  const dist = sqrt((st.x - A.x0) * (st.x - A.x0) + (st.y - A.y0) * (st.y - A.y0));
  if (A.k && A.t > 30) st.stats.jump = Math.max(st.stats.jump, why ? 0 : dist);
  if (why) { if (st.ch && CHALLENGE[st.ch.id].kind === "jump" && A.k === BIG_AIR.id) finishCh(st, 0, why); wipeout(st, why); return; }
  st.mode = "ski"; st.air = null;
  if (n180 & 1) st.sw = !st.sw;
  // the skis come down along the direction of travel
  if (hs > 1) { const s = A.hx * vdx + A.hy * vdy >= 0 || A.pipe ? 1 : 1; st.hx = vdx * s; st.hy = vdy * s; }
  st.ev.push(["land", Math.round(impact * 10) / 10]);
  if (A.k === BIG_AIR.id && st.ch && CHALLENGE[st.ch.id].kind === "jump") { st.ch.dist = Math.round(dist * 10) / 10; finishCh(st, st.ch.dist); }
  // the trick
  const grabS = A.grab / HZ, pts0 = SPIN_PTS[Math.min(SPIN_PTS.length - 1, abs(n180))] + abs(nflip) * 500 + (abs(nflip) > 1 ? 400 * (abs(nflip) - 1) : 0) + (A.grab > 8 ? 100 + Math.round(grabS * 120) : 0) + (airS > 0.7 ? Math.round((airS - 0.7) * 80) : 0);
  if (pts0 > 0 && (n180 || nflip || A.grab > 8)) {
    const mult = (n180 && nflip ? 1.5 : 1) * (A.sw0 ? 1.2 : 1) * (1 + 0.25 * Math.min(4, st.chain));
    const pts = Math.round(pts0 * mult), name = trickName(st, A, n180, nflip);
    award(st, name, pts);
  }
}
function trickName(st, A, n180, nflip) {
  const parts = [];
  if (A.sw0) parts.push("SWITCH");
  if (nflip) { const f = abs(nflip), dir = nflip > 0 ? "FRONT" : "BACK"; parts.push(n180 ? `${f > 1 ? (f === 2 ? "DOUBLE " : "TRIPLE ") : ""}${dir} CORK ${abs(n180) * 180}` : `${f === 1 ? "" : f === 2 ? "DOUBLE " : "TRIPLE "}${dir}FLIP`); }
  else if (n180) parts.push(String(abs(n180) * 180));
  if (A.grab > 8) parts.push(`${GRAB[st.board ? "board" : "ski"][A.gk]} GRAB`);
  if (!parts.length || (parts.length === 1 && A.sw0)) parts.push("AIR");
  return parts.join(" ");
}
function award(st, name, pts) {
  st.score += pts; st.chain++; st.chainT = 180;
  st.last = { name, pts, t: st.t };
  if (st.ch && st.ch.ph === "run") st.ch.score += pts;
  st.ev.push(["trick", name, pts]);
}

// ---- the rails ----------------------------------------------------------------------------------------------
function railZ(Rl, s) {
  if (Rl.za == null) { Rl.za = baseH(Rl.ax, Rl.ay) + Rl.top; Rl.zb = baseH(Rl.bx, Rl.by) + Rl.top; }
  return Rl.za + (Rl.zb - Rl.za) * (s / Rl.len);
}
function railMount(st) {
  for (let i = 0; i < RAILS.length; i++) {
    const Rl = RAILS[i], rx = st.x - Rl.ax, ry = st.y - Rl.ay, s = rx * Rl.dx + ry * Rl.dy, t = rx * -Rl.dy + ry * Rl.dx;
    if (s < 0 || s > Rl.len || abs(t) > 0.9) continue;
    const z = railZ(Rl, s);
    if (st.z < z - 0.45 || st.z > z + 0.75 || (st.mode === "air" && st.vz > 1.5)) continue;
    const al = st.hx * Rl.dx + st.hy * Rl.dy;
    const slide = st.board && abs(al) < 0.4;
    if (abs(al) < 0.72 && !slide) continue;
    const v = st.vx * Rl.dx + st.vy * Rl.dy;
    if (abs(v) < 2) continue;
    if (st.mode === "air") { st.air = null; }
    st.mode = "grind"; st.grind = { r: i, s, v, pts: 0, slide };
    st.ev.push(["grind", Rl.name]);
    return true;
  }
  return false;
}
function grindTick(st, inp) {
  const Gd = st.grind, Rl = RAILS[Gd.r], slope = (railZ(Rl, Rl.len) - railZ(Rl, 0)) / Rl.len;
  Gd.v += (-G * slope - (Gd.v > 0 ? 1 : -1) * 0.07 * G) * DT;
  Gd.s += Gd.v * DT; Gd.pts += abs(Gd.v) * DT * 30;
  st.x = Rl.ax + Rl.dx * Gd.s; st.y = Rl.ay + Rl.dy * Gd.s; st.z = railZ(Rl, Math.max(0, Math.min(Rl.len, Gd.s)));
  st.vx = Rl.dx * Gd.v; st.vy = Rl.dy * Gd.v; st.vz = slope * Gd.v;
  if (inp.a) st.crouch = Math.min(PHYS.crouchMax, st.crouch + 1);
  const popping = !inp.a && st.a0 && st.crouch > 0;
  if (popping || Gd.s < 0 || Gd.s > Rl.len || abs(Gd.v) < 0.5) {
    const name = `${Gd.slide ? "BOARDSLIDE" : "50-50"} ON ${Rl.name}`;
    if (popping) { st.vz += PHYS.pop + (PHYS.popMore * st.crouch) / PHYS.crouchMax * 0.6; st.crouch = 0; }
    st.grind = null;
    if (Gd.pts > 15) award(st, name, Math.round(Gd.pts) + 50);
    st.z += 0.05; st.mode = "air";
    st.air = { spin: 0, flip: 0, sr: 0, fr: 0, grab: 0, gk: 0, t: 0, x0: st.x, y0: st.y, sw0: st.sw, k: null, pipe: false, hx: st.hx, hy: st.hy };
  }
}

// ---- wipeouts -----------------------------------------------------------------------------------------------
function wipeout(st, why, water = false) {
  st.mode = "crash"; st.crash = PHYS.crashTicks; st.air = null; st.grind = null; st.crouch = 0; st.chain = 0;
  st.wipe = { why, water };
  if (water) { st.vx = 0; st.vy = 0; st.vz = 0; }
  st.last = { name: why, pts: 0, t: st.t, crash: true };
  st.ev.push(["crash", why, water ? 1 : 0]);
}
function crashTick(st) {
  if (st.wipe?.water) { st.crash--; if (st.crash <= 0) { st.x = st.land[0]; st.y = st.land[1]; st.z = heightAt(st.x, st.y); stand(st); } return; }
  // tumbling: the body slides on, slowing hard
  const sp = sqrt(st.vx * st.vx + st.vy * st.vy), k = sp > 0 ? Math.max(0, sp - 7 * DT) / sp : 0;
  st.vx *= k; st.vy *= k;
  const [gx, gy] = gradAt(st.x, st.y);
  st.x += st.vx * DT; st.y += st.vy * DT;
  const gz = heightAt(st.x, st.y);
  st.z = Math.max(gz, st.z + st.vz * DT); st.vz = st.z > gz + 0.01 ? st.vz - G * DT : gx * st.vx + gy * st.vy;
  if (--st.crash <= 0) stand(st);
}
function stand(st) {
  st.mode = "ski"; st.crash = 0; st.wipe = null;
  const [vx, vy, sp] = norm(st.vx, st.vy);
  if (sp > 0.3) { st.hx = vx; st.hy = vy; }
  else { const [fx, fy, s] = fallAt(st.x, st.y); if (s > 0.01) { const [a, b] = norm(fx, fy); st.hx = a; st.hy = b; } }
  st.vx = 0; st.vy = 0; st.vz = 0; st.sw = false;
  st.ev.push(["stand"]);
}

// ---- trees, buildings, towers, the edge of the map --------------------------------------------------------------
function obstacles(st) {
  if (st.mode === "crash" && st.wipe?.water) return;
  const sp = sqrt(st.vx * st.vx + st.vy * st.vy), above = st.z - baseH(st.x, st.y);
  for (const T of treesNear(st.x, st.y)) {
    const dx = st.x - T.x, dy = st.y - T.y, r = T.r + 0.4;
    if (dx * dx + dy * dy < r * r && above < 9 * T.s) {
      const [nx, ny] = norm(dx, dy);
      st.x = T.x + nx * r; st.y = T.y + ny * r;
      if (sp > 5 && st.mode !== "crash") { st.vx = nx * 1.5; st.vy = ny * 1.5; wipeout(st, "MET A TREE"); }
      else { const vn = st.vx * nx + st.vy * ny; if (vn < 0) { st.vx -= vn * nx; st.vy -= vn * ny; } }
      return;
    }
  }
  for (const T of TOWERS) {
    const dx = st.x - T.x, dy = st.y - T.y, r = T.r + 0.4;
    if (dx * dx + dy * dy < r * r && above < 12) { const [nx, ny] = norm(dx, dy); st.x = T.x + nx * r; st.y = T.y + ny * r; if (sp > 5 && st.mode !== "crash") { st.vx = nx; st.vy = ny; wipeout(st, "MET A LIFT TOWER"); } else { st.vx = 0; st.vy = 0; } return; }
  }
  for (const B of BLOCKS) {
    if (st.x <= B.x0 || st.x >= B.x1 || st.y <= B.y0 || st.y >= B.y1 || st.z > B.base + B.h) continue;
    const dl = st.x - B.x0, dr = B.x1 - st.x, dt = st.y - B.y0, db = B.y1 - st.y, m = Math.min(dl, dr, dt, db);
    if (m === dl) { st.x = B.x0 - 0.01; if (st.vx > 0) st.vx = 0; } else if (m === dr) { st.x = B.x1 + 0.01; if (st.vx < 0) st.vx = 0; }
    else if (m === dt) { st.y = B.y0 - 0.01; if (st.vy > 0) st.vy = 0; } else { st.y = B.y1 + 0.01; if (st.vy < 0) st.vy = 0; }
    if (sp > 9 && st.mode !== "crash") wipeout(st, "MET A BUILDING");
    return;
  }
}
function bounds(st) {
  const m = 40;
  if (st.x < W0.x0 + m) { st.x = W0.x0 + m; st.vx = Math.max(0, st.vx); }
  if (st.x > W0.x1 - m) { st.x = W0.x1 - m; st.vx = Math.min(0, st.vx); }
  if (st.y < W0.y0 + m) { st.y = W0.y0 + m; st.vy = Math.max(0, st.vy); }
  if (st.y > W0.y1 - 20) { st.y = W0.y1 - 20; st.vy = Math.min(0, st.vy); }
}

// ---- the lifts ----------------------------------------------------------------------------------------------
function boardLift(st, L) {
  st.mode = "lift"; st.lift = { id: L.id, ph: "wait", n: liftWait(L, st.t), k: 0 };
  st.x = L.load[0]; st.y = L.load[1]; st.z = heightAt(st.x, st.y); st.vx = st.vy = st.vz = 0; st.crouch = 0;
  st.ev.push(["queue", L.name]);
}
function liftTick(st, inp) {
  const Lf = st.lift, L = LIFT_W[Lf.id];
  st.ff = inp.a;
  if (Lf.ph === "wait") { if (--Lf.n <= 0) { Lf.ph = "ride"; Lf.k = 0; st.ev.push(["board", L.name]); } return; }
  const total = liftRideTicks(L);
  Lf.k += inp.a ? LIFT_FF : 1;
  const f = Math.min(1, Lf.k / total);
  st.x = L.ax + (L.bx - L.ax) * f + L.n[0] * L.gap; st.y = L.ay + (L.by - L.ay) * f + L.n[1] * L.gap;
  if (Lf.k >= total) {
    st.mode = "ski"; st.lift = null; st.ff = false;
    st.x = L.off[0]; st.y = L.off[1]; st.z = heightAt(st.x, st.y);
    const [fx, fy, s] = fallAt(st.x, st.y), [hx, hy] = s > 0.01 ? norm(fx, fy) : [-L.d[0], -L.d[1]];
    st.hx = hx; st.hy = hy; st.vx = hx * 3; st.vy = hy * 3; st.vz = 0;
    st.land = [st.x, st.y];
    st.ev.push(["unload", L.name]);
  }
}
// where the rider is on a lift, for the picture: -> fraction up the line
export const liftFrac = (st) => (st.lift && st.lift.ph === "ride" ? Math.min(1, st.lift.k / liftRideTicks(LIFT_W[st.lift.id])) : 0);

// ---- finding things -----------------------------------------------------------------------------------------
function discover(st) {
  for (const P of POIS) {
    if (st.found.includes(P.id)) continue;
    const dx = st.x - P.x, dy = st.y - P.y;
    if (dx * dx + dy * dy < FIND_R * FIND_R) { st.found.push(P.id); st.ev.push(["found", P.id, P.name]); }
  }
  // a challenge's flag, passed near: found (it can be started from the map after)
  for (const C of RUNNABLE) {
    const id = `ch:${C.id}`;
    if (st.found.includes(id)) continue;
    const dx = st.x - C.start.x, dy = st.y - C.start.y;
    if (dx * dx + dy * dy < FIND_R * FIND_R) { st.found.push(id); st.ev.push(["found", id, C.name]); }
  }
  for (const F of FILES) {
    if (st.files & (1 << F.i)) continue;
    const dx = st.x - F.x, dy = st.y - F.y;
    if (dx * dx + dy * dy < (FILE_R + 6) * (FILE_R + 6) && st.mode !== "lift") { st.files |= 1 << F.i; st.ev.push(["file", F.i, F.name]); }
  }
}

// ---- the challenges ------------------------------------------------------------------------------------------
function challengeTick(st, px, py) {
  const C = st.ch, D = CHALLENGE[C.id];
  C.tc++;
  if (st.mode === "lift") return finishCh(st, null, "LEFT FOR THE LIFT");
  if (C.tc > MAX_RUN) return finishCh(st, null, "OUT OF TIME");
  const S = D.start, dx = st.x - S.x, dy = st.y - S.y;
  if (D.kind !== "descent" && D.kind !== "skim" && D.run == null && D.kind !== "pipe" && D.kind !== "jump") { /* no course */ }
  const gates = gatesOf(D);
  if (gates) {
    while (C.gi < gates.length) {
      const g = gates[C.gi];
      if (crosses(px, py, st.x, st.y, g.ax, g.ay, g.bx, g.by)) { C.gi++; st.ev.push(["gate", C.gi, gates.length]); continue; }
      // passed it by (below its line, outside the poles): missed
      const dir = linesOf(D).finish, along = (st.x - g.x) * (dir.x - S.x) + (st.y - g.y) * (dir.y - S.y);
      if (along > 0 && sideOf(px, py, g) !== sideOf(st.x, st.y, g)) { C.gi++; C.miss++; st.ev.push(["miss", C.gi, gates.length]); continue; }
      break;
    }
  }
  const { cps, finish } = linesOf(D);
  cps.forEach((c, i) => { if (!(C.cp & (1 << i)) && crosses(px, py, st.x, st.y, c.ax, c.ay, c.bx, c.by)) { C.cp |= 1 << i; st.ev.push(["checkpoint", i + 1, cps.length]); } });
  const secs = C.tc / HZ;
  if (D.kind === "follow") {
    const I = instructorAt(C.tc), ix = st.x - I.x, iy = st.y - I.y;
    if (ix * ix + iy * iy < FOLLOW_R * FOLLOW_R) C.inT++;
    if (I.done) return finishCh(st, Math.round((C.inT / C.tc) * 1000) / 10);
  }
  if (D.kind === "pipe") { if (C.tc >= PIPE_LIMIT) return finishCh(st, C.score); if (!inPipe(st.x, st.y) && st.mode !== "air") { const [s] = pipeLocal(st.x, st.y); if (s > PIPE.len) return finishCh(st, C.score); } }
  if (D.kind === "skim") {
    if (st.skim > C.dist) C.dist = st.skim;
    if (st.mode === "crash" && st.wipe?.water) return finishCh(st, Math.round(C.dist * 10) / 10);
    const ex = (st.x - POOL.x) / POOL.rx, ey = (st.y - POOL.y) / POOL.ry;
    if (C.dist > 5 && st.skim === 0 && st.mode === "ski") return finishCh(st, Math.round(C.dist * 10) / 10);
    if (C.dist === 0 && ex * ex + ey * ey > 9 && C.tc > 600) return finishCh(st, 0, "MISSED THE POOL");
  }
  if (D.kind === "jump" && C.tc > 60 * 40) return finishCh(st, 0, "NO JUMP");
  if (D.kind === "descent" && st.y >= SUMMIT_FINISH) return finishCh(st, Math.round(secs * 100) / 100);
  if (finish && crosses(px, py, st.x, st.y, finish.ax, finish.ay, finish.bx, finish.by)) {
    if (D.kind === "score") return finishCh(st, C.score);
    if (D.kind === "trial" && C.cp !== (1 << cps.length) - 1) return finishCh(st, null, "MISSED A CHECKPOINT");
    if (D.kind === "gates" || D.kind === "race" || D.kind === "trial") {
      const t = Math.round((secs + C.miss * PENALTY) * 100) / 100;
      if (D.kind === "race") { const place = 1 + fieldTimes().filter(f => f.t < t).length; C.time = t; return finishCh(st, place); }
      return finishCh(st, t);
    }
  }
  if (D.kind !== "descent" && D.kind !== "jump" && D.kind !== "skim") {
    // left the course?
    const R = D.run ? RUNS.find(r => r.id === D.run) : null;
    if (R) { const fx = st.x - finish.x, fy = st.y - finish.y; if (dx * dx + dy * dy > R.len * R.len * 1.4 && fx * fx + fy * fy > LEAVE_R * LEAVE_R) return finishCh(st, null, "LEFT THE COURSE"); }
  }
}
function sideOf(x, y, g) { return (g.bx - g.ax) * (y - g.ay) - (g.by - g.ay) * (x - g.ax) > 0; }
function finishCh(st, value, why = null) {
  const C = st.ch, D = CHALLENGE[C.id];
  if (C.ph === "done") return;
  C.ph = "done";
  C.res = { id: D.id, value: why ? null : value, unit: D.unit, medal: why ? 0 : medalOf(D, value), why, ticks: C.tc, miss: C.miss, time: C.time ?? null, score: C.score };
  st.ev.push(["finish", C.res]);
}
// The result a challenge run comes to: {id, value, unit, medal, why, ticks} | null (still running)
export const resultOf = (st) => (st.ch && st.ch.res ? { ...st.ch.res } : null);
// Re-play a challenge run (the server's check): -> {res, ticks}
export function replay(rec, maxTicks = MAX_RUN + 600) {
  if (Number(rec?.v) !== VERSION) throw new Error(`ski run version ${rec?.v}, sim ${VERSION}`);
  const st = newGame({ board: rec.board, ch: rec.ch }), log = rec.inputLog;
  let n = 0;
  for (let k = 0; k < log.length && !st.ch?.res; k += 2) for (let i = 0; i < log[k + 1] && !st.ch?.res; i++) { if (++n > maxTicks) return { res: null, ticks: n }; step(st, log[k]); }
  return { res: resultOf(st), ticks: n, st };
}
export const speedKmh = (st) => Math.round(sqrt(st.vx * st.vx + st.vy * st.vy + st.vz * st.vz) * 3.6);
export { CHALLENGE, LIFT_W };
