// THE TENNIS CLUB, playable (docs/CITY_SPEC.md "PLAYABLE SPORTS", Tennis). The match itself:
// pure, no DOM, no clock, no Math.random, no trig. A fixed 60 Hz step over a seeded generator,
// so a match is a function of (version, seed, format, opponent, the human's input per frame):
// the browser plays it, and anything holding the record can play it again and get the same
// result (scripts/check-tennis.mjs does, twice). Only + - * / and sqrt touch the state, which
// IEEE 754 rounds the same everywhere.
//
// The court is in metres: x across (singles half-width 4.115), y along (the net at 0, the
// human's baseline at +11.885, the CPU's at -11.885), z up. Player 0 is the human (the near
// end, the bottom of the screen); player 1 the CPU. Ends do not change.
//
// Input: one bitmask a frame (BTN). A swings a drive (a smash when the ball is high), B a lob,
// B with DOWN held a slice; the d-pad at contact aims: LEFT / RIGHT for the lines, UP deep,
// DOWN short. Serving: A tosses, A again hits (best just under the top of the toss);
// LEFT / RIGHT at the hit aims at the T or wide; before the toss LEFT / RIGHT walk the baseline.

import { FORMATS, newScore, addPoint, serverOf, serveSide, callOf } from "./score.js";

export const VERSION = 1;
export const HZ = 60;
const DT = 1 / HZ, G = 9.8;
export const COURT = { hw: 4.115, dhw: 5.485, hl: 11.885, sv: 6.4, net: 0.914 };
export const BTN = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, A: 16, B: 32 };
const SWING_END = 22, WIN_FROM = 1, WIN_TO = 14, RACKET = 0.45;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// mulberry32 on the state's own word
function rnd(st) {
  let t = (st.rng = (st.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const gauss = (st) => (rnd(st) + rnd(st) + rnd(st) - 1.5) * 2;   // mean 0, sd 1, bounded at 3

// The human's legs and arm; a CPU's from its rating (0..99): faster, quicker to read the ball,
// cleaner, harder, and better at leaving the ball that is going out.
export const HUMAN = { speed: 6.2, power: 0.8, reach: 1.05 };
export function cpuProfile(rating) {
  const sk = clamp((rating - 30) / 70, 0, 1);
  return { rating, sk, speed: 4.6 + 2.0 * sk, react: Math.round(18 - 12 * sk), acc: 0.5 + 0.38 * sk, power: 0.35 + 0.6 * sk, judge: 0.55 + 0.43 * sk, reach: 1.0 + 0.08 * sk };
}

function mkPlayer(i, cpu) {
  const s = cpu || HUMAN;
  return { i, side: i === 0 ? 1 : -1, x: 0, y: 0, face: 1, swing: -1, kind: "A", done: false, mv: 0, cpu: cpu || null, speed: s.speed, power: s.power, reach: s.reach, plan: null, wait: 0, serveZ: 3, serveAim: 0 };
}

// opts: {seed, fmt: "set" | "short", cpu: cpuProfile(...), auto: a profile for player 0 (the
// demo and the checks: the CPU plays itself)}
export function newMatch({ seed = 1, fmt = "set", cpu, auto = null }) {
  const st = {
    v: VERSION, seed: seed >>> 0, rng: seed | 0, frame: 0, fmt: FORMATS[fmt] ? fmt : "set",
    p: [mkPlayer(0, auto), mkPlayer(1, cpu || cpuProfile(60))],
    ball: null, phase: "serve", sub: "ready", serveNo: 1, box: null, t: 0, deadFor: 0, after: null,
    call: "", next: "", prev: 0, mask: 0, ev: [], rally: 0, hitAt: 0, won: [0, 0],
  };
  st.sc = newScore(FORMATS[st.fmt], rnd(st) < 0.5 ? 0 : 1);
  setupPoint(st);
  st.next = "PLAY";
  return st;
}

// ---- the point -----------------------------------------------------------------------------
function setupPoint(st) {
  const sc = st.sc, s = serverOf(sc), S = st.p[s], R = st.p[1 - s];
  const right = serveSide(sc) === "deuce" ? 1 : -1;   // the server's right is +x at the near end
  for (const P of st.p) { P.swing = -1; P.plan = null; P.done = false; P.mv = 0; }
  S.x = S.side * right * 1.0; S.y = S.side * (COURT.hl + 0.25);
  st.box = { sx: -Math.sign(S.x), sy: R.side };
  R.x = st.box.sx * 2.2; R.y = R.side * (COURT.hl + 0.6);
  S.face = 1; R.face = 1;
  st.ball = null; st.phase = "serve"; st.sub = "ready"; st.t = 0; st.rally = 0;
  if (S.cpu) { S.wait = 40 + Math.floor(rnd(st) * 40); S.serveZ = clamp(3.0 - Math.abs(gauss(st)) * (1 - S.cpu.acc) * 1.2, 1.8, 3.2); S.serveAim = Math.floor(rnd(st) * 3) - 1; }
}

function toss(st, S) {
  st.ball = { x: S.x + 0.3 * S.side, y: S.y - 0.25 * S.side, z: 1.3, vx: 0, vy: 0, vz: 6.2, grav: 1, bounce: 0.7, keep: 0.85, bounces: 0, last: S.i, live: false, serve: true, netted: false, roll: false };
  st.sub = "toss"; S.swing = -1;
  st.ev.push("toss");
}

// The ball through the air for a step. -> "net" | "bounce" | null
export function ballStep(b) {
  const py = b.y;
  b.vz -= G * b.grav * DT; b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT;
  if (!b.netted && (py > 0) !== (b.y > 0) && Math.abs(b.x) < COURT.dhw + 0.9 && b.z < COURT.net) {
    b.netted = true; b.y = py > 0 ? 0.06 : -0.06; b.vy = -b.vy * 0.12; b.vx *= 0.3; b.vz = b.vz < 0 ? b.vz * 0.5 : 0;
    return "net";
  }
  if (b.z <= 0 && b.vz < 0) {
    b.z = 0;
    if (b.roll) { b.vz = 0; b.vx *= 0.97; b.vy *= 0.97; return null; }
    b.vz = -b.vz * b.bounce; b.vx *= b.keep; b.vy *= b.keep; b.bounces++;
    if (b.vz < 0.6) { b.vz = 0; b.roll = true; }
    return "bounce";
  }
  return null;
}

// Send the ball from where it is to (tx, ty) at a horizontal speed (or in lobT seconds), with
// the spin's gravity and bounce; slowed (a higher arc) until it clears the net by margin. A
// negative margin (a poor contact) lets it find the tape.
function launch(st, P, tx, ty, speed, spin, margin, lobT = 0) {
  const b = st.ball, dx = tx - b.x, dy = ty - b.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01, g = G * spin.grav;
  let t = lobT || d / speed, vz = 0;
  for (let k = 0; k < 30; k++) {
    vz = (g * t * t / 2 - b.z) / t;
    if ((b.y > 0) !== (ty > 0)) {
      const tn = -b.y / (dy / t), zn = b.z + vz * tn - g * tn * tn / 2;
      if (zn < COURT.net + margin) { t *= 1.05; continue; }
    }
    break;
  }
  Object.assign(b, { vx: dx / t, vy: dy / t, vz, grav: spin.grav, bounce: spin.bounce, keep: spin.keep, bounces: 0, last: P.i, live: true, netted: false, roll: false });
  st.hitAt = st.frame;
}

const SPIN = {
  serve: { grav: 1, bounce: 0.68, keep: 0.68 },
  drive: { grav: 1.3, bounce: 0.72, keep: 0.7 },
  slice: { grav: 0.8, bounce: 0.45, keep: 0.62 },
  lob: { grav: 1, bounce: 0.72, keep: 0.62 },
  smash: { grav: 1, bounce: 0.75, keep: 0.74 },
};

function serveHit(st, S, q, aimX) {
  const second = st.serveNo === 2, b = st.ball;
  const speed = (17 + 11 * q * S.power) * (second ? 0.8 : 1);
  const noise = (1 - q) * (second ? 0.55 : 1) + 0.1;
  let tx = st.box.sx * 2.06 + aimX * 1.45, ty = st.box.sy * (COURT.sv - 0.9);
  tx += gauss(st) * noise * 0.9; ty += gauss(st) * noise * 1.0;
  b.z = Math.max(b.z, 2.2);   // over the head, whatever the toss did
  launch(st, S, tx, ty, speed, SPIN.serve, 0.1 - (1 - q) * (second ? 0.15 : 0.45));
  b.serve = true;
  st.phase = "rally"; st.sub = null;
  S.swing = 0; S.kind = "S"; S.done = true;
  st.ev.push("hit");
  const R = st.p[1 - S.i];
  if (R.cpu) planFor(st, R);
}

function hitBall(st, P, d) {
  const b = st.ball, m = st.mask;
  let aimX, aimD, kind = P.kind, q;
  if (P.cpu) {
    aimX = P.plan?.aimX ?? 0; aimD = P.plan?.aimD ?? 0;
    q = clamp(P.cpu.acc + gauss(st) * 0.08 - 0.25 * (d / P.reach) * (d / P.reach), 0.2, 1);
  } else {
    aimX = (m & BTN.RIGHT ? 1 : 0) - (m & BTN.LEFT ? 1 : 0);
    aimD = (m & BTN.UP ? 1 : 0) - (m & BTN.DOWN ? 1 : 0);
    const tq = 1 - Math.max(0, Math.abs(P.swing - 7) - 1) * 0.09;   // the sweet spot: contact 6-8 frames into the swing
    q = tq * (1 - 0.35 * (d / P.reach));
  }
  let shot;
  if (kind === "B") shot = aimD < 0 ? "slice" : "lob";
  else shot = b.z > 2.3 ? "smash" : "drive";
  const e = 1 - q;
  let tx = aimX ? aimX * (COURT.hw - 0.8) : clamp(-b.x * 0.4, -1.5, 1.5);
  const depth = shot === "drive" ? [6.8, 9.3, 10.6][aimD + 1] : shot === "slice" ? [6.0, 8.8, 10.0][aimD + 1] : shot === "lob" ? 10.2 : 8.5 + aimD;
  let ty = -P.side * depth;
  tx += gauss(st) * e * 1.5; ty += gauss(st) * e * 1.6;
  if (shot === "lob") launch(st, P, tx, ty, 0, SPIN.lob, 2.0, 1.55 + 0.25 * rnd(st));
  else {
    const speed = shot === "smash" ? 24 + 6 * q : shot === "slice" ? 12 + 4 * P.power : 14 + 7 * P.power * q;
    launch(st, P, tx, ty, speed, SPIN[shot], shot === "smash" ? 0.05 - e * 0.4 : 0.25 - e * 0.6);
  }
  b.serve = false; P.done = true; st.rally++;
  st.ev.push(shot === "smash" ? "smash" : "hit");
  const O = st.p[1 - P.i];
  if (O.cpu) planFor(st, O);
  P.plan = null;
}

// Was the first bounce in? (the serve: the box)
function bounceIn(st, b) {
  const sR = st.p[1 - b.last].side, t = 0.03;
  if (b.y * sR <= 0) return false;
  if (b.serve) { const sx = st.box.sx; return b.y * sR <= COURT.sv + t && b.x * sx >= -t && b.x * sx <= COURT.hw + t; }
  return b.y * sR <= COURT.hl + t && Math.abs(b.x) <= COURT.hw + t;
}

function point(st, w, call) {
  if (st.phase !== "rally") return;
  const out = addPoint(st.sc, w);
  st.won[w]++;
  st.phase = "dead"; st.t = 0; st.deadFor = 80; st.after = out.match ? "over" : "point";
  if (st.ball) st.ball.live = false;
  st.call = call; st.lastWinner = w;
  st.next = out.match ? "GAME, SET AND MATCH" : out.set ? "GAME AND SET" : out.tiebreak ? "TIEBREAK" : out.game ? "GAME" : callOf(st.sc);
  st.ev.push("point");
  if (out.game) st.ev.push("game");
  if (out.match) st.ev.push("match");
}
function fault(st, call) {
  if (st.serveNo === 1) {
    st.serveNo = 2; st.phase = "dead"; st.t = 0; st.deadFor = 50; st.after = "serve2"; st.call = call === "NET" ? "NET. FAULT" : "FAULT"; st.next = "SECOND SERVE";
    if (st.ball) st.ball.live = false;
    st.ev.push("fault");
    return;
  }
  st.serveNo = 1;
  point(st, 1 - st.ball.last, "DOUBLE FAULT");
}

// ---- the CPU ---------------------------------------------------------------------------------
// Read the ball the moment it is struck: play the flight forward on a copy, find where it will
// be at a comfortable height after its bounce, decide whether it is going out, choose the reply.
function planFor(st, P) {
  const c = { ...st.ball }, lim = COURT.hl + 5.5;
  let f = st.frame, best = null, prev = null, firstIn = null, netted = false, slack = -1e9;
  for (let k = 0; k < 300; k++) {
    const r = ballStep(c); f++;
    if (r === "net") { netted = true; break; }
    if (r === "bounce" && c.bounces === 1) firstIn = bounceIn(st, c);
    if (c.bounces >= 2) break;
    if (c.bounces === 1 && c.z < 1.5 && c.z > 0.25 && c.y * P.side > 0.7 && c.y * P.side < lim) {
      // the earliest point after the bounce it can get to in time (the racket, not the body)
      const dx = c.x - P.x, dy = c.y - P.y, need = Math.max(0, Math.sqrt(dx * dx + dy * dy) - RACKET * 0.5) / P.speed, have = (f - st.frame - P.cpu.react) / HZ;
      if (have - need >= 0) { best = { f, x: c.x, y: c.y }; break; }
      if (have - need > slack) { slack = have - need; prev = { f, x: c.x, y: c.y }; }
    }
    if (!prev && c.bounces === 1) prev = { f, x: c.x, y: c.y };
  }
  best = best || prev || { f, x: c.x, y: c.y };
  const sk = P.cpu.sk, O = st.p[1 - P.i];
  const leave = netted || (firstIn === false && rnd(st) < P.cpu.judge);
  const rx = best.x + gauss(st) * (1 - sk) * 0.35;   // reading error
  const face = rx >= P.x ? 1 : -1;
  const r = rnd(st);
  const kind = Math.abs(O.y) < 5 && r < 0.45 ? "B" : r < 0.08 + 0.1 * (1 - sk) ? "S" : "A";
  const wide = rnd(st) < 0.35 + 0.45 * sk;
  const aimX = wide ? (O.x > 0 ? -1 : 1) : 0;
  const aimD = kind === "S" ? -1 : rnd(st) < 0.65 ? 1 : 0;
  P.plan = { f: best.f, x: rx - face * RACKET, y: best.y, face, go: st.frame + P.cpu.react, leave, kind: kind === "S" ? "B" : kind, aimX, aimD };
}

function moveTo(P, tx, ty, frac = 1) {
  const dx = tx - P.x, dy = ty - P.y, d = Math.sqrt(dx * dx + dy * dy), step = P.speed * DT * frac * (P.swing >= 0 ? 0.45 : 1);
  if (d < 0.02) { P.mv = 0; return; }
  const k = Math.min(1, step / d);
  P.x += dx * k; P.y += dy * k; P.mv++;
}

function cpuThink(st, P) {
  const b = st.ball;
  if (st.phase === "serve") {
    if (serverOf(st.sc) === P.i) {
      if (st.sub === "ready" && --P.wait <= 0) toss(st, P);
      else if (st.sub === "toss" && b.vz < 0 && b.z <= P.serveZ) {
        const q = clamp(1 - Math.abs(b.z - 3.0) / 1.3, 0.1, 1);
        serveHit(st, P, q, P.serveAim);
      }
    }
    return;
  }
  if (st.phase === "rally" && P.plan && b?.live) {
    const pl = P.plan;
    if (st.frame >= pl.go) moveTo(P, pl.x, pl.y);
    if (!pl.leave && P.swing < 0 && st.frame >= pl.f - 7) { P.swing = 0; P.kind = pl.kind; P.face = pl.face; P.done = false; }
    return;
  }
  // between shots: back to the middle of the baseline, a step inside it after a short ball
  if (st.frame - st.hitAt < (P.cpu.react >> 1)) return;
  const hx = b ? clamp(b.x * 0.3, -1.5, 1.5) : 0;
  moveTo(P, hx, P.side * (COURT.hl + 0.8), st.phase === "dead" ? 0.5 : 0.8);
}

function humanThink(st, P, m, press) {
  if (st.phase === "serve" && serverOf(st.sc) === P.i) {
    if (st.sub === "ready") {
      const dx = (m & BTN.RIGHT ? 1 : 0) - (m & BTN.LEFT ? 1 : 0);
      if (dx) { P.x += dx * P.speed * 0.5 * DT; P.mv++; } else P.mv = 0;
      const sg = Math.sign(P.x) || 1, lo = 0.25, hi = COURT.hw - 0.3;
      P.x = sg * clamp(Math.abs(P.x), lo, hi);
      if (press & BTN.A) toss(st, P);
    } else if (st.sub === "toss" && press & BTN.A && st.ball.z >= 1.6) {
      const q = clamp(1 - Math.abs(st.ball.z - 3.0) / 1.3, 0.1, 1);
      serveHit(st, P, q, (m & BTN.RIGHT ? 1 : 0) - (m & BTN.LEFT ? 1 : 0));
    }
    return;
  }
  const dx = (m & BTN.RIGHT ? 1 : 0) - (m & BTN.LEFT ? 1 : 0), dy = (m & BTN.DOWN ? 1 : 0) - (m & BTN.UP ? 1 : 0);
  if (dx || dy) {
    const n = dx && dy ? 0.70710678 : 1, sp = P.speed * DT * n * (P.swing >= 0 ? 0.45 : 1);
    P.x += dx * sp; P.y += dy * sp; P.mv++;
  } else P.mv = 0;
  if ((press & (BTN.A | BTN.B)) && P.swing < 0) {
    P.swing = 0; P.kind = press & BTN.A ? "A" : "B"; P.done = false;
    if (st.ball) P.face = st.ball.x >= P.x ? 1 : -1;
  }
}

function keepOnSide(P) {
  const lim = COURT.dhw + 3;
  P.x = clamp(P.x, -lim, lim);
  if (P.side > 0) P.y = clamp(P.y, 0.7, COURT.hl + 6); else P.y = clamp(P.y, -(COURT.hl + 6), -0.7);
}

// ---- one step ---------------------------------------------------------------------------------
export function step(st, mask = 0) {
  st.ev = [];
  const press = mask & ~st.prev;
  st.prev = mask; st.mask = mask; st.frame++;
  if (st.phase === "over") return st;
  for (const P of st.p) {
    if (P.cpu) cpuThink(st, P); else humanThink(st, P, mask, press);
    keepOnSide(P);
    if (P.swing >= 0 && ++P.swing > SWING_END) P.swing = -1;
  }
  const b = st.ball;
  if (b && st.phase === "serve" && st.sub === "toss") {
    b.vz -= G * DT; b.z += b.vz * DT;
    if (b.vz < 0 && b.z < 1.2) { st.ball = null; st.sub = "ready"; const S = st.p[serverOf(st.sc)]; if (S.cpu) S.wait = 20; }
  } else if (b) {
    const r = ballStep(b);
    if (b.live) {
      if (r === "net") { st.ev.push("net"); if (b.serve) fault(st, "NET"); else point(st, 1 - b.last, "NET"); }
      else if (r === "bounce") {
        st.ev.push("bounce");
        if (b.bounces === 1 && !bounceIn(st, b)) { if (b.serve) fault(st, "FAULT"); else point(st, 1 - b.last, "OUT"); }
        else if (b.bounces >= 2) point(st, b.last, b.serve ? "ACE" : "WINNER");
      } else if (st.frame - st.hitAt > 400) point(st, b.bounces ? b.last : 1 - b.last, "WINNER");
    }
    // contact: a live ball, not the striker's, on this side, within reach during the swing
    if (b.live && !b.netted && st.phase === "rally" && b.bounces < 2) {
      for (const P of st.p) {
        if (P.i === b.last || P.done || P.swing < WIN_FROM || P.swing > WIN_TO) continue;
        if (b.serve && b.bounces === 0) continue;
        if (b.y * P.side < -0.2) continue;
        const rx = P.x + P.face * RACKET, d = Math.sqrt((b.x - rx) * (b.x - rx) + (b.y - P.y) * (b.y - P.y));
        const zmax = P.kind === "A" ? 3.1 : 2.4;
        if (d < P.reach && b.z < zmax) { hitBall(st, P, d); break; }
      }
    }
  }
  if (st.phase === "dead" && ++st.t >= st.deadFor) {
    if (st.after === "over") { st.phase = "over"; st.ev.push("over"); }
    else { if (st.after === "point") st.serveNo = 1; setupPoint(st); }
  }
  return st;
}

// ---- the record -----------------------------------------------------------------------------
// A frame's mask, run-length encoded: [mask, count, mask, count, ...].
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
// Who serves the next point (the HUD's dot).
export const serverOfMatch = (st) => serverOf(st.sc);
export function resultOf(st) {
  return { done: st.phase === "over", winner: st.sc.winner, sets: st.sc.sets.map(s => [...s]), games: [...st.sc.games], pts: [...st.won], frames: st.frame };
}
// Play a record again from its seed and log: -> its result. A server check later compares this
// with the result the browser claims. cpu: the opponent's profile (cpuProfile(rating)).
export function replay(rec, cpu) {
  if (rec.version !== VERSION) throw new Error(`tennis record version ${rec.version}, sim ${VERSION}`);
  const st = newMatch({ seed: rec.seed, fmt: rec.fmt, cpu });
  let i = 0;
  const log = rec.inputLog;
  for (let k = 0; k < log.length; k += 2) for (let n = 0; n < log[k + 1]; n++, i++) step(st, log[k]);
  return resultOf(st);
}
