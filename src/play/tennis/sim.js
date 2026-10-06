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
//
// Versions. 1: the hard court only. 2 (2026-10-05): the surface is part of the match (and the
// record): HARD plays exactly as version 1 did; CLAY bounces higher and slower, spin bites harder
// and the players slide; GRASS skids through low and fast. A record replays under the physics of
// its own version, so a version-1 record still plays to the same result.
// 3 (2026-10-05): the line judges are human. A ball landing within a few centimetres of a line is
// sometimes called wrong (seeded; less often on clay, where the ball leaves a mark), and the player
// a close call went against may CHALLENGE it (BTN.C, or a CPU by its rating and temper): three
// wrong challenges a set, one more in a tiebreak. A right one overturns the call (the point goes to
// whoever the true call favoured; a serve wrongly called a fault is replayed; a first serve wrongly
// called good is a fault, and the second serve follows). Holding C too long,
// or challenging with none left, is a code violation (two warnings, then a point penalty). And the
// pointer: press on the court to run there, hold, drag for spin and aim, release to swing (PTR and
// its packed target and gesture, ptrBits()). Versions 1 and 2 never read any of it.

import { FORMATS, newScore, addPoint, serverOf, serveSide, callOf } from "./score.js";

export const VERSION = 3;
export const VERSIONS = [1, 2, 3];
// The surface at the bounce: bz scales the ball's rebound, keep how much pace it keeps, spin how far
// a shot's own bounce departs from a flat one (topspin kicks up, slice stays down); slide: the
// players slide into the ball and out of a turn; zlo: the lowest the CPU will plan to meet it.
// HARD is the identity: version 1's numbers, untouched.
export const SURFACES = {
  hard: { id: "hard", bz: 1, keep: 1, spin: 1, slide: 0, zlo: 0.25 },
  clay: { id: "clay", bz: 1.16, keep: 0.84, spin: 1.45, slide: 1, zlo: 0.3 },
  grass: { id: "grass", bz: 0.7, keep: 1.12, spin: 0.8, slide: 0, zlo: 0.1 },
};
export const HZ = 60;
const DT = 1 / HZ, G = 9.8;
export const COURT = { hw: 4.115, dhw: 5.485, hl: 11.885, sv: 6.4, net: 0.914 };
export const BTN = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, A: 16, B: 32, C: 64, PTR: 128 };
// The pointer, packed into the frame's mask beside the buttons (version 3): PTR while pressed, the
// court spot pressed (x, y to 10 cm) and the drag since (gx, gy: -3..3 each, up = toward the net
// is negative). Everything above bit 7 is the pointer's; the mask stays a positive 30-bit integer.
export function ptrBits(x, y, gx = 0, gy = 0) {
  const q = (v, a, b) => (v < a ? a : v > b ? b : v);
  const qx = q(Math.round(x * 10) + 90, 0, 180), qy = q(Math.round(y * 10), 0, 255);
  return BTN.PTR | (qx << 8) | (qy << 16) | ((q(gx | 0, -3, 3) + 3) << 24) | ((q(gy | 0, -3, 3) + 3) << 27);
}
export function ptrOf(m) {
  if (!(m & BTN.PTR)) return null;
  return { x: (((m >>> 8) & 255) - 90) / 10, y: ((m >>> 16) & 255) / 10, gx: ((m >>> 24) & 7) - 3, gy: ((m >>> 27) & 7) - 3 };
}
// The drag at release -> the shot. Up (toward the net) topspin, further up deep topspin, a big flick
// up a lob; down a slice; still, flat. Left / right aims for the lines.
export function gestureShot(gx, gy) {
  const aimX = gx >= 1 ? 1 : gx <= -1 ? -1 : 0;
  if (gy <= -3) return { kind: "B", shot: "lob", aimX, aimD: 0 };
  if (gy <= -1) return { kind: "A", shot: "drive", aimX, aimD: gy <= -2 ? 1 : 0 };
  if (gy >= 1) return { kind: "B", shot: "slice", aimX, aimD: -1 };
  return { kind: "A", shot: "flat", aimX, aimD: 0 };
}
// ... and the serve: left / right places it (the T or wide, by the box), up kicks, down slices.
export function gestureServe(gx, gy) {
  return { aimX: gx >= 1 ? 1 : gx <= -1 ? -1 : 0, spin: gy <= -1 ? "kick" : gy >= 1 ? "sserve" : "serve" };
}
// The line calls (version 3): a ball within BAND of a line may be called wrong, at most MISS of the
// time on the line itself, less the further off it; a call within CH_CLOSE is challengeable.
export const CALLS = { BAND: 0.08, MISS: 0.6, CH_CLOSE: 0.2, PER_SET: 3, HOLD: 90 };
const SURF_MISS = { hard: 1, clay: 0.4, grass: 1.2 };
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
  return { rating, sk, speed: 4.6 + 2.0 * sk, react: Math.round(18 - 12 * sk), acc: 0.5 + 0.38 * sk, power: 0.35 + 0.6 * sk, judge: 0.55 + 0.43 * sk, reach: 1.0 + 0.08 * sk, temper: 0.3 };
}

function mkPlayer(i, cpu) {
  const s = cpu || HUMAN;
  return { i, side: i === 0 ? 1 : -1, x: 0, y: 0, vx: 0, vy: 0, slide: 0, face: 1, swing: -1, kind: "A", done: false, mv: 0, cpu: cpu || null, speed: s.speed, power: s.power, reach: s.reach, plan: null, wait: 0, serveZ: 3, serveAim: 0 };
}

// opts: {seed, fmt: "set" | "short", cpu: cpuProfile(...), auto: a profile for player 0 (the
// demo and the checks: the CPU plays itself), surface: "hard" | "clay" | "grass", version (a
// record's own, for a replay; version 1 is hard only)}
export function newMatch({ seed = 1, fmt = "set", cpu, auto = null, surface = "hard", version = VERSION, win = 120 }) {
  if (!VERSIONS.includes(version)) throw new Error(`tennis sim has no version ${version}`);
  const st = {
    v: version, surface: version === 1 || !SURFACES[surface] ? "hard" : surface, seed: seed >>> 0, rng: seed | 0, frame: 0, fmt: FORMATS[fmt] ? fmt : "set",
    p: [mkPlayer(0, auto), mkPlayer(1, cpu || cpuProfile(60))],
    ball: null, phase: "serve", sub: "ready", serveNo: 1, box: null, t: 0, deadFor: 0, after: null,
    call: "", next: "", prev: 0, mask: 0, ev: [], rally: 0, hitAt: 0, won: [0, 0],
  };
  st.sc = newScore(FORMATS[st.fmt], rnd(st) < 0.5 ? 0 : 1);
  if (version >= 3) Object.assign(st, { win: clamp(win | 0, 60, 240), chLeft: [CALLS.PER_SET, CALLS.PER_SET], viol: [0, 0], chal: null, cHold: 0, pen: null, tone: null, mis: [] });
  setupPoint(st);
  st.next = "PLAY";
  return st;
}

// ---- the point -----------------------------------------------------------------------------
function setupPoint(st) {
  const sc = st.sc, s = serverOf(sc), S = st.p[s], R = st.p[1 - s];
  const right = serveSide(sc) === "deuce" ? 1 : -1;   // the server's right is +x at the near end
  for (const P of st.p) { P.swing = -1; P.plan = null; P.done = false; P.mv = 0; P.vx = 0; P.vy = 0; P.slide = 0; }
  if (st.v >= 3) { st.chal = null; for (const P of st.p) { P.appeal = 0; P.goal = null; P.gest = null; P.charge = 0; } }
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
    b.ivz = b.vz; b.vz = -b.vz * b.bounce; b.vx *= b.keep; b.vy *= b.keep; b.bounces++;
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
  const sp = onSurface(st, spin);
  Object.assign(b, { vx: dx / t, vy: dy / t, vz, grav: spin.grav, bounce: sp.bounce, keep: sp.keep, bounces: 0, last: P.i, live: true, netted: false, roll: false });
  st.hitAt = st.frame;
}

const SPIN = {
  serve: { grav: 1, bounce: 0.68, keep: 0.68 },
  drive: { grav: 1.3, bounce: 0.72, keep: 0.7 },
  slice: { grav: 0.8, bounce: 0.45, keep: 0.62 },
  lob: { grav: 1, bounce: 0.72, keep: 0.62 },
  smash: { grav: 1, bounce: 0.75, keep: 0.74 },
  // version 3, the pointer's shots: flat (no spin), and the serve's kick and slice
  flat: { grav: 1, bounce: 0.7, keep: 0.74 },
  kick: { grav: 1.25, bounce: 0.82, keep: 0.66 },
  sserve: { grav: 0.9, bounce: 0.55, keep: 0.66 },
};

// A shot's bounce on this match's surface. Version 1 and the hard court: the shot's own numbers.
const surf = (st) => SURFACES[st.surface] || SURFACES.hard;
function onSurface(st, spin) {
  const f = surf(st);
  if (st.v === 1 || f.id === "hard") return spin;
  const flat = SPIN.serve;
  return {
    bounce: Math.min(0.92, (spin.bounce + (spin.bounce - flat.bounce) * (f.spin - 1)) * f.bz),
    keep: Math.min(0.95, (spin.keep + (spin.keep - flat.keep) * (f.spin - 1)) * f.keep),
  };
}

function serveHit(st, S, q, aimX, spin = "serve") {
  const second = st.serveNo === 2, b = st.ball;
  const speed = (17 + 11 * q * S.power) * (second ? 0.8 : 1) * (spin === "kick" ? 0.86 : spin === "sserve" ? 0.93 : 1);
  const noise = (1 - q) * (second ? 0.55 : 1) + 0.1;
  let tx = st.box.sx * 2.06 + aimX * 1.45, ty = st.box.sy * (COURT.sv - 0.9);
  tx += gauss(st) * noise * 0.9; ty += gauss(st) * noise * 1.0;
  b.z = Math.max(b.z, 2.2);   // over the head, whatever the toss did
  launch(st, S, tx, ty, speed, SPIN[spin] || SPIN.serve, 0.1 - (1 - q) * (second ? 0.15 : 0.45) + (spin === "kick" ? 0.25 : 0));
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
  } else if (P.gest) {
    aimX = P.gest.aimX; aimD = P.gest.aimD;
    const tq = 1 - Math.max(0, Math.abs(P.swing - 7) - 1) * 0.09;
    q = tq * (1 - 0.35 * (d / P.reach));
  } else {
    aimX = (m & BTN.RIGHT ? 1 : 0) - (m & BTN.LEFT ? 1 : 0);
    aimD = (m & BTN.UP ? 1 : 0) - (m & BTN.DOWN ? 1 : 0);
    const tq = 1 - Math.max(0, Math.abs(P.swing - 7) - 1) * 0.09;   // the sweet spot: contact 6-8 frames into the swing
    q = tq * (1 - 0.35 * (d / P.reach));
  }
  let shot;
  const g = P.cpu ? null : P.gest;
  if (g) shot = g.shot !== "lob" && b.z > 2.3 ? "smash" : g.shot;
  else if (kind === "B") shot = aimD < 0 ? "slice" : "lob";
  else shot = b.z > 2.3 ? "smash" : "drive";
  const charge = g ? 0.92 + 0.13 * Math.min(1, g.charge / 40) : 1;   // the pointer's held swing
  const e = 1 - q;
  let tx = aimX ? aimX * (COURT.hw - 0.8) : clamp(-b.x * 0.4, -1.5, 1.5);
  const depth = shot === "drive" || shot === "flat" ? [6.8, 9.3, 10.6][aimD + 1] : shot === "slice" ? [6.0, 8.8, 10.0][aimD + 1] : shot === "lob" ? 10.2 : 8.5 + aimD;
  let ty = -P.side * depth;
  tx += gauss(st) * e * 1.5; ty += gauss(st) * e * 1.6;
  if (shot === "lob") launch(st, P, tx, ty, 0, SPIN.lob, 2.0, 1.55 + 0.25 * rnd(st));
  else {
    const speed = (shot === "smash" ? 24 + 6 * q : shot === "slice" ? 12 + 4 * P.power : shot === "flat" ? 15 + 8 * P.power * q : 14 + 7 * P.power * q) * charge;
    launch(st, P, tx, ty, speed, SPIN[shot], shot === "smash" ? 0.05 - e * 0.4 : shot === "flat" ? 0.15 - e * 0.6 : 0.25 - e * 0.6);
  }
  if (g) P.gest = null;
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

// The point to w: the score, and (version 3) the challenges: three again with each set, one more
// in a tiebreak.
export function award(st, w) {
  const out = addPoint(st.sc, w);
  st.won[w]++;
  if (st.v >= 3) {
    if (out.set) st.chLeft = [CALLS.PER_SET, CALLS.PER_SET];
    if (out.tiebreak) st.chLeft = st.chLeft.map(n => n + 1);
  }
  return out;
}
const nextCall = (st, out) => (out.match ? "GAME, SET AND MATCH" : out.set ? "GAME AND SET" : out.tiebreak ? "TIEBREAK" : out.game ? "GAME" : callOf(st.sc));
const snapOf = (st) => ({ sc: { ...st.sc, pts: [...st.sc.pts], games: [...st.sc.games], sets: st.sc.sets.map(x => [...x]), setsWon: [...st.sc.setsWon] }, won: [...st.won], serveNo: st.serveNo, chLeft: [...st.chLeft] });

function point(st, w, call, ch = null) {
  if (st.phase !== "rally") return;
  const snap = st.v >= 3 && ch ? snapOf(st) : null;
  const out = award(st, w);
  st.phase = "dead"; st.t = 0; st.deadFor = 80; st.after = out.match ? "over" : "point";
  if (st.ball) st.ball.live = false;
  st.call = call; st.lastWinner = w;
  st.next = nextCall(st, out);
  st.ev.push("point");
  if (out.game) st.ev.push("game");
  if (out.match) st.ev.push("match");
  if (st.v >= 3) openChallenge(st, ch, snap, call);
}
function fault(st, call, ch = null) {
  if (st.serveNo === 1) {
    const snap = st.v >= 3 && ch ? snapOf(st) : null;
    st.serveNo = 2; st.phase = "dead"; st.t = 0; st.deadFor = 50; st.after = "serve2"; st.call = call === "NET" ? "NET. FAULT" : "FAULT"; st.next = "SECOND SERVE";
    if (st.ball) st.ball.live = false;
    st.ev.push("fault");
    if (st.v >= 3) openChallenge(st, ch, snap, st.call);
    return;
  }
  st.serveNo = 1;
  point(st, 1 - st.ball.last, "DOUBLE FAULT", ch);
}

// ---- the line calls and the challenges (version 3) ---------------------------------------------
// How far inside (+) or outside (-) the nearest line the bounce was, in metres, by the rule the
// judges call to (bounceIn: the ball touching the line is in), and which line.
export function lineMargin(st, b) {
  const sR = st.p[1 - b.last].side, t = 0.03, yy = b.y * sR;
  if (yy <= 0) return { m: -1, line: "NET" };
  let c;
  if (b.serve) { const xx = b.x * st.box.sx; c = [[COURT.sv + t - yy, "SERVICE LINE"], [xx + t, "CENTRE LINE"], [COURT.hw + t - xx, "SIDELINE"]]; }
  else c = [[COURT.hl + t - yy, "BASELINE"], [COURT.hw + t - Math.abs(b.x), "SIDELINE"]];
  let best = c[0];
  for (const k of c) if (k[0] < best[0]) best = k;
  return { m: best[0], line: best[1] };
}
// The judge's call on a first bounce: the truth, unless the ball was close and the seed says the
// judge missed it. Everything the review needs is kept on the ball.
function judge(st, b, truth) {
  const L = lineMargin(st, b), a = L.m < 0 ? -L.m : L.m;
  let called = truth;
  if (a < CALLS.BAND && rnd(st) < CALLS.MISS * (1 - a / CALLS.BAND) * (SURF_MISS[st.surface] || 1)) { called = !truth; st.mis.push(Math.round(L.m * 1000)); }
  const k = b.keep || 1;
  b.call = { m: L.m, line: L.line, truth, called, x: b.x, y: b.y, vx: b.vx / k, vy: b.vy / k, vz: b.ivz, grav: b.grav, t: (st.frame - st.hitAt) / HZ, serve: b.serve, hitter: b.last, frame: st.frame };
  return called;
}
function openChallenge(st, ch, snap, call) {
  st.chal = null;
  if (!ch || !snap || (ch.m < 0 ? -ch.m : ch.m) >= CALLS.CH_CLOSE) return;
  const against = ch.called ? 1 - ch.hitter : ch.hitter;
  const c = st.chal = { ...ch, call, against, by: -1, until: st.frame + st.win, snap, cpuAt: -1, after0: null, overturned: false, outcome: null };
  const P = st.p[against];
  if (P.cpu) {
    if (st.chLeft[against] > 0) {
      const wrong = ch.called !== ch.truth, a = ch.m < 0 ? -ch.m : ch.m, tp = P.cpu.temper ?? 0.3;
      const p = wrong ? 0.35 + 0.4 * P.cpu.sk + 0.2 * tp : tp * 0.7 * (1 - a / CALLS.CH_CLOSE);
      if (rnd(st) < p) { c.cpuAt = st.frame + 36; st.deadFor = Math.max(st.deadFor, 50); }
    }
  } else st.deadFor = Math.max(st.deadFor, st.win + 8);
}
function challenge(st, i) {
  const c = st.chal;
  c.by = i; c.after0 = st.after;
  st.after = "review"; st.t = 0; st.deadFor = 80;
  st.ev.push("challenge");
}
// The review: the truth was always known; now it is applied.
function resolve(st) {
  const c = st.chal, wrong = c.called !== c.truth;
  c.overturned = wrong;
  st.phase = "dead"; st.t = 0; st.deadFor = 110;
  if (!wrong) { st.chLeft[c.by]--; st.after = c.after0; c.outcome = "stands"; }
  else {
    const s = c.snap;
    st.sc = s.sc; st.won = s.won; st.serveNo = s.serveNo; st.chLeft = s.chLeft;
    if (!c.called && c.serve) { st.serveNo = 1; st.after = "point"; st.next = "REPLAY THE POINT"; c.outcome = "replay"; }
    else if (c.called && c.serve && s.serveNo === 1) { st.serveNo = 2; st.after = "serve2"; st.next = "SECOND SERVE"; c.outcome = "fault"; }   // the ace was out: a fault
    else {
      const w = c.called ? 1 - c.hitter : c.hitter, out = award(st, w);   // (a second serve called good and out: a double fault)
      st.lastWinner = w; st.next = nextCall(st, out); st.after = out.match ? "over" : "point"; c.outcome = "point";
      if (out.game) st.ev.push("game");
    }
  }
  st.call = wrong ? "CALL OVERTURNED" : "CALL STANDS";
  st.ev.push("review");
}
function violation(st, i, why) {
  st.viol[i]++;
  const pen = st.viol[i] >= 3;
  st.tone = { i, n: st.viol[i], why, pen, frame: st.frame };
  st.ev.push("violation");
  if (pen) {
    st.pen = i;
    if (st.phase === "serve") { st.phase = "dead"; st.t = 0; st.deadFor = 40; st.after = "point"; st.ball = null; }
  }
}
// The hands and the chair, before anyone moves: a challenge pressed in its window, a challenge with
// none left, a button held at the umpire; a CPU's challenge when its moment comes.
function rules(st, m, press) {
  if (!st.p[0].cpu) {
    const quiet = st.phase === "dead" || st.phase === "serve";
    st.cHold = m & BTN.C && quiet ? st.cHold + 1 : 0;
    if (st.cHold === CALLS.HOLD) violation(st, 0, "HOLD");
    const c = st.chal;
    if (press & BTN.C && c && c.against === 0 && c.by < 0 && st.phase === "dead" && st.after !== "review" && st.frame <= c.until) {
      if (st.chLeft[0] > 0) challenge(st, 0); else violation(st, 0, "NONE LEFT");
    }
  }
  const c = st.chal;
  if (c && c.cpuAt === st.frame && c.by < 0 && st.phase === "dead") challenge(st, c.against);
}
// Whether the human may challenge now (the page's prompt).
export function canChallenge(st, i = 0) {
  const c = st.v >= 3 ? st.chal : null;
  return Boolean(c && c.against === i && c.by < 0 && st.phase === "dead" && st.after !== "review" && st.frame <= c.until && !st.p[i].cpu);
}
// The challenger walks to the chair, turned to it, a hand up.
function appeal(st, P) {
  moveTo(st, P, COURT.dhw + 1.0, P.side * 1.6, 0.8);
  P.face = 1; P.appeal++;
}

// ---- the CPU ---------------------------------------------------------------------------------
// Read the ball the moment it is struck: play the flight forward on a copy, find where it will
// be at a comfortable height after its bounce, decide whether it is going out, choose the reply.
function planFor(st, P) {
  const c = { ...st.ball }, lim = COURT.hl + 5.5, zlo = st.v === 1 ? 0.25 : surf(st).zlo;
  let f = st.frame, best = null, prev = null, firstIn = null, netted = false, slack = -1e9;
  for (let k = 0; k < 300; k++) {
    const r = ballStep(c); f++;
    if (r === "net") { netted = true; break; }
    if (r === "bounce" && c.bounces === 1) firstIn = bounceIn(st, c);
    if (c.bounces >= 2) break;
    if (c.bounces === 1 && c.z < 1.5 && c.z > zlo && c.y * P.side > 0.7 && c.y * P.side < lim) {
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

// A step of the legs: (ux, uy) is where they want to go this frame. Off clay, there. On clay the
// feet carry what they had: quick to get going, slow to stop or turn (a slide, drawn as one).
function legs(st, P, ux, uy) {
  if (!surf(st).slide || st.v === 1) { P.x += ux; P.y += uy; return; }
  const want = ux * ux + uy * uy, had = P.vx * P.vx + P.vy * P.vy, a = want >= had ? 0.32 : 0.09;
  P.vx += (ux - P.vx) * a; P.vy += (uy - P.vy) * a;
  P.x += P.vx; P.y += P.vy;
  P.slide = had > 0.0016 && want < had * 0.5 ? P.slide + 1 : 0;
}
function moveTo(st, P, tx, ty, frac = 1) {
  const dx = tx - P.x, dy = ty - P.y, d = Math.sqrt(dx * dx + dy * dy), step = P.speed * DT * frac * (P.swing >= 0 ? 0.45 : 1);
  if (d < 0.02) { P.mv = 0; legs(st, P, 0, 0); return; }
  const k = Math.min(1, step / d);
  legs(st, P, dx * k, dy * k); P.mv++;
}

function cpuThink(st, P) {
  const b = st.ball;
  if (st.phase === "serve") {
    if (serverOf(st.sc) === P.i) {
      if (st.sub === "ready" && !(st.v >= 3 && st.cHold > 0) && --P.wait <= 0) toss(st, P);   // no one serves while the umpire is being held at
      else if (st.sub === "toss" && b.vz < 0 && b.z <= P.serveZ) {
        const q = clamp(1 - Math.abs(b.z - 3.0) / 1.3, 0.1, 1);
        serveHit(st, P, q, P.serveAim);
      }
    }
    return;
  }
  if (st.phase === "rally" && P.plan && b?.live) {
    const pl = P.plan;
    if (st.frame >= pl.go) moveTo(st, P, pl.x, pl.y);
    if (!pl.leave && P.swing < 0 && st.frame >= pl.f - 7) { P.swing = 0; P.kind = pl.kind; P.face = pl.face; P.done = false; }
    return;
  }
  // between shots: back to the middle of the baseline, a step inside it after a short ball
  if (st.frame - st.hitAt < (P.cpu.react >> 1)) return;
  const hx = b ? clamp(b.x * 0.3, -1.5, 1.5) : 0;
  moveTo(st, P, hx, P.side * (COURT.hl + 0.8), st.phase === "dead" ? 0.5 : 0.8);
}

function humanThink(st, P, m, press, prev) {
  // the pointer (version 3): pressed this frame, released this frame (the drag it let go with)
  const pt = st.v >= 3 ? ptrOf(m) : null, was = st.v >= 3 ? ptrOf(prev) : null;
  const pPress = pt && !was, pRel = was && !pt ? was : null;
  if (st.phase === "serve" && serverOf(st.sc) === P.i) {
    if (st.sub === "ready") {
      const dx = (m & BTN.RIGHT ? 1 : 0) - (m & BTN.LEFT ? 1 : 0);
      if (dx) { P.x += dx * P.speed * 0.5 * DT; P.mv++; } else P.mv = 0;
      const sg = Math.sign(P.x) || 1, lo = 0.25, hi = COURT.hw - 0.3;
      P.x = sg * clamp(Math.abs(P.x), lo, hi);
      if (press & BTN.A || pPress) toss(st, P);
    } else if (st.sub === "toss" && press & BTN.A && st.ball.z >= 1.6) {
      const q = clamp(1 - Math.abs(st.ball.z - 3.0) / 1.3, 0.1, 1);
      serveHit(st, P, q, (m & BTN.RIGHT ? 1 : 0) - (m & BTN.LEFT ? 1 : 0));
    } else if (st.sub === "toss" && pRel && st.ball.z >= 1.6 && (st.ball.vz < 0 || st.ball.z >= 2.6)) {
      // a quick click's release on the way up is not the hit; a release from the top down is
      const q = clamp(1 - Math.abs(st.ball.z - 3.0) / 1.3, 0.1, 1), g = gestureServe(pRel.gx, pRel.gy);
      serveHit(st, P, q, g.aimX, g.spin);
    }
    return;
  }
  if (pPress) { P.goal = { x: clamp(pt.x, -(COURT.dhw + 3), COURT.dhw + 3), y: P.side * clamp(pt.y * P.side, 0.7, COURT.hl + 6) }; P.charge = 0; }
  const dx = (m & BTN.RIGHT ? 1 : 0) - (m & BTN.LEFT ? 1 : 0), dy = (m & BTN.DOWN ? 1 : 0) - (m & BTN.UP ? 1 : 0);
  if (dx || dy) {
    if (P.goal) P.goal = null;
    const n = dx && dy ? 0.70710678 : 1, sp = P.speed * DT * n * (P.swing >= 0 ? 0.45 : 1);
    legs(st, P, dx * sp, dy * sp); P.mv++;
  } else if (P.goal) {
    moveTo(st, P, P.goal.x, P.goal.y);
    const gx = P.goal.x - P.x, gy = P.goal.y - P.y;
    if (gx * gx + gy * gy < 0.0025) { P.goal = null; P.mv = 0; }
  } else { P.mv = 0; legs(st, P, 0, 0); }
  if (pt) P.charge++;
  if ((press & (BTN.A | BTN.B)) && P.swing < 0) {
    P.swing = 0; P.kind = press & BTN.A ? "A" : "B"; P.done = false;
    if (st.v >= 3) P.gest = null;
    if (st.ball) P.face = st.ball.x >= P.x ? 1 : -1;
  } else if (pRel && P.swing < 0) {
    const g = gestureShot(pRel.gx, pRel.gy);
    P.swing = 0; P.kind = g.kind; P.done = false; P.gest = { ...g, charge: P.charge };
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
  const prev = st.prev, press = mask & ~prev & 255;
  st.prev = mask; st.mask = mask; st.frame++;
  if (st.phase === "over") return st;
  if (st.v >= 3) rules(st, mask, press);
  for (const P of st.p) {
    if (st.v >= 3 && st.chal && st.chal.by === P.i && st.phase === "dead") appeal(st, P);
    else if (P.cpu) cpuThink(st, P); else humanThink(st, P, mask, press, prev);
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
        const v3 = st.v >= 3;
        if (b.bounces === 1 && !(v3 ? judge(st, b, bounceIn(st, b)) : bounceIn(st, b))) { const ch = v3 ? b.call : null; if (b.serve) fault(st, "FAULT", ch); else point(st, 1 - b.last, "OUT", ch); }
        else if (b.bounces >= 2) point(st, b.last, b.serve ? "ACE" : "WINNER", v3 && b.call && b.call.frame > st.hitAt ? b.call : null);
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
    if (st.v >= 3 && st.after === "review") resolve(st);
    else if (st.v >= 3 && st.pen !== null && st.after !== "over") {
      // the point penalty, between points
      const w = 1 - st.pen, out = award(st, w);
      st.pen = null; st.lastWinner = w; st.call = "POINT PENALTY"; st.next = nextCall(st, out);
      st.t = 0; st.deadFor = 100; st.after = out.match ? "over" : "point"; st.chal = null;
      st.ev.push("penalty");
      if (out.game) st.ev.push("game");
    } else if (st.after === "over") { st.phase = "over"; st.ev.push("over"); }
    else { if (st.after === "point") st.serveNo = 1; setupPoint(st); }
  }
  return st;
}

// ---- the surfaces, measured --------------------------------------------------------------------
// One shot struck the same way on a surface: from the near baseline at 1 m to 9.3 m deep on the far
// side at 21 m/s (a drive) -> after its first bounce, how high it rises, its pace across the court,
// and the frames from the hit until it passes the far baseline (the receiver's time). The check compares
// the surfaces with it; it is the court's own physics, not a copy.
export function bounceOf(surface, shot = "drive", version = VERSION) {
  const st = newMatch({ seed: 1, fmt: "short", cpu: cpuProfile(60), surface, version });
  const P = st.p[0];
  st.ball = { x: 0, y: COURT.hl, z: 1, vx: 0, vy: 0, vz: 0, grav: 1, bounce: 0.7, keep: 0.7, bounces: 0, last: 0, live: true, serve: false, netted: false, roll: false };
  launch(st, P, 0, -9.3, shot === "slice" ? 15 : 21, SPIN[shot], 0.25);
  const b = st.ball;
  let peak = 0, pace = 0, base = 0, k = 0;
  for (; k < 600 && b.bounces < 1; k++) ballStep(b);
  pace = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  for (; k < 900 && b.bounces < 2; k++) { ballStep(b); if (b.z > peak) peak = b.z; if (!base && b.y < -COURT.hl) base = k + 1; }
  return { peak, pace, base, bounce: b.bounce, keep: b.keep };
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
  const r = { done: st.phase === "over", winner: st.sc.winner, sets: st.sc.sets.map(s => [...s]), games: [...st.sc.games], pts: [...st.won], frames: st.frame };
  if (st.v >= 3) { r.chLeft = [...st.chLeft]; r.viol = [...st.viol]; r.mis = st.mis.length; }
  return r;
}
// Play a record again from its seed and log: -> its result. A server check later compares this
// with the result the browser claims. cpu: the opponent's profile (cpuProfile(rating)).
export function replay(rec, cpu) {
  if (!VERSIONS.includes(rec.version)) throw new Error(`tennis record version ${rec.version}, sim ${VERSION}`);
  const st = newMatch({ seed: rec.seed, fmt: rec.fmt, cpu, version: rec.version, surface: rec.surface || "hard", win: rec.win || 120 });
  let i = 0;
  const log = rec.inputLog;
  for (let k = 0; k < log.length; k += 2) for (let n = 0; n < log[k + 1]; n++, i++) step(st, log[k]);
  return resultOf(st);
}
