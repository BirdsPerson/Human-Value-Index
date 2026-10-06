// THE COURTS, playable (docs/CITY_SPEC.md "PLAYABLE SPORTS", Basketball). The game itself: pure,
// no DOM, no clock, no Math.random, no trig. A fixed 60 Hz step over a seeded generator, so a game
// is a function of (version, seed, cfg, the human's input per frame): the browser plays it, and
// anything holding the record plays it again to the same result (scripts/check-hoops.mjs does).
// Only + - * / and sqrt touch the state, which IEEE 754 rounds the same everywhere.
//
// SIM VERSION 2 (the 2K-style game). Version 1 records replay on the frozen ./v1/sim.js
// (./replay.js picks by version).
//
// The court is in metres, NBA lines: x along the length (the centre line at 0, the baselines at
// +-14.325), y across it (the near sideline, the camera's, at 0; the far one at 15.24), z up. The
// rims are 3.05 m up, 1.575 m in from each baseline. Team 0 is the viewer's and attacks +x all game;
// team 1 attacks -x. Five a side: the league's own drafted fives.
//
// Control (2K conventions on a virtual pad, one bitmask a frame, BTN): the human steers one player
// of team 0 (st.ctl): the ball carrier on offence; on defence the defender nearest the ball when it
// changed hands, A switches. Offence: left stick moves, RT sprints, X held = the shot (let go at the
// top: the release grade), A passes toward the stick, Y lobs (an alley-oop to a cutting dunker),
// B bounce-passes, LB calls a pick, LT posts up, the right stick does dribble moves (flick sideways:
// crossover; back: stepback; toward the rim: drive; rotate: spin). A quick reversal of the left
// stick is a dribble move too. Defence: X reaches for the steal, Y jumps (block, rebound), B takes a
// charge, LT is intense D, A switches. Every other player is the CPU, from its ratings.

export const VERSION = 2;
export const HZ = 60;
const DT = 1 / HZ, G = 9.8;
export const COURT = { hx: 14.325, w: 15.24, cy: 7.62, rimX: 12.75, rimZ: 3.05, rimR: 0.23, boardX: 13.125, three: 7.24, corner: 6.71, cornerX: 10.055, laneHW: 2.44, ftX: 8.535, circle: 1.8, ra: 1.22 };
export const BTN = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, X: 16, A: 32, Y: 64, B: 128, RT: 256, LT: 512, LB: 1024, RSU: 2048, RSD: 4096, RSL: 8192, RSR: 16384, SPIN: 32768 };
const RS = BTN.RSU | BTN.RSD | BTN.RSL | BTN.RSR;
// foulOut: personal fouls that end a player's game (six over 48 minutes, scaled; three at least);
// bonus: team fouls in a period after which every defensive foul shoots two.
export const FORMATS = {
  quarters: { id: "quarters", name: "FOUR 2-MINUTE QUARTERS", periods: 4, len: 120, ot: 60, target: 0, foulOut: 3, bonus: 2 },
  to21: { id: "to21", name: "FIRST TO 21", periods: 0, len: 0, ot: 0, target: 21, foulOut: 3, bonus: 4 },
};
export const SHOT_CLOCKS = [24, 14];
export const TOP = 20;            // frames from the gather to the top of the jump: the release to aim for
export const FT_TOP = 24;         // the free throw's set shot: frames from the dip to the release
export const TIP_JUMP = 44;       // the tip: jump this many frames after the whistle to meet the ball at its top
const LAND = 2 * TOP;
const PASS_MAX = 120, HOLD_MAX = LAND - 2;
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
function hashStr(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// A three from (x, y) at the basket team-direction d attacks: past the arc, or in a corner past
// the straight line 6.71 m from the basket.
export function isThree(x, y, d) {
  const dx = d * C.rimX - x, dy = C.cy - y;
  if (d * x > C.cornerX) return Math.abs(dy) > C.corner;
  return len(dx, dy) > C.three;
}

// ---- ratings ---------------------------------------------------------------------------------------
// The league gives one rating; the game spreads it over the skills by archetype (cfg row [3] when
// the page knows the player, else from the key's hash), plus a small fixed jitter per skill.
export const ARCHES = {
  guard: { three: 5, mid: 3, close: -2, dunk: -14, handle: 9, perD: 3, intD: -10, block: -14, steal: 6, ft: 7, pass: 7, spd: 0.35, h: -0.12, leap: 0 },
  wing: { three: 2, mid: 3, close: 2, dunk: 1, handle: 3, perD: 5, intD: -2, block: -3, steal: 3, ft: 3, pass: 0, spd: 0.2, h: 0.02, leap: 0.03 },
  slasher: { three: -6, mid: 0, close: 6, dunk: 6, handle: 5, perD: 0, intD: 0, block: 0, steal: 2, ft: -2, pass: 0, spd: 0.3, h: 0, leap: 0.08 },
  big: { three: -14, mid: -3, close: 7, dunk: 9, handle: -12, perD: -8, intD: 10, block: 12, steal: -6, ft: -9, pass: -4, spd: -0.3, h: 0.2, leap: 0 },
};
const ARCH_ORDER = ["guard", "wing", "wing", "slasher", "big", "guard", "big", "wing"];
const SKILLS = ["three", "mid", "close", "dunk", "handle", "perD", "intD", "block", "steal", "ft", "pass"];
export const sk = (v) => clamp((v - 40) / 55, 0, 1);
export function abilities(r, key = "", arch = null) {
  const h = hashStr(String(key));
  const a = ARCHES[arch] ? arch : ARCH_ORDER[h % ARCH_ORDER.length];
  const A = ARCHES[a], k = clamp((r - 35) / 60, 0, 1);
  const R = {};
  SKILLS.forEach((s, i) => { R[s] = clamp(Math.round(r + A[s] + (((h >>> (i % 24)) % 7) - 3)), 25, 99); });
  const S = {};
  for (const s of SKILLS) S[s] = sk(R[s]);
  return { arch: a, R, S, k, spd: 4.9 + 2.5 * k + A.spd, leap: 0.4 + 0.45 * k + A.leap, dunker: R.dunk >= 75, h: 1.9 + 0.2 * k + A.h, def: (S.perD + S.intD) / 2 };
}
function mkPlayer(t, i, row) {
  const [key, name, r, arch] = row;
  return {
    t, i, g: t * 5 + i, key: String(key), name: String(name), r: r | 0, ...abilities(r | 0, key, arch),
    x: 0, y: 0, z: 0, vz: 0, vx: 0, vy: 0, face: dirOf(t), mv: 0, act: null, cool: 0, jx: 0, jy: 0, jt: 0, hold: 0, think: 0, plan: null, jumpAt: -1,
    sta: 1, pf: 0, still: 0, hands: 0, stumble: 0, screened: 0, burst: 0, heat: 0, moveCool: 0, caught: -999, lastMove: -999, sb: 0, cut: null, close: 0,
    streak: 0, hot: false, charge: 0, intense: false, sprint: false, post: false, ld: 0, ldEnd: -99, ldStart: -99,
  };
}

// cfg: {fmt: "quarters" | "to21", shot: 24 | 14, assist, home: [[key, name, r, arch?] x 5], away,
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
    ball: { st: "dead", own: -1, x: 0, y: C.cy, z: 1, vx: 0, vy: 0, vz: 0, f: 0, from: -1, to: -1, made: false, pts: 0, T: 0, kind: "", rim: false, air: false, sx: 0, sy: 0, fouled: null, pass: "", alley: false },
    phase: "tip", t: 0, deadFor: 0, after: null, afterTeam: -1, spot: null,
    q: 1, clock: FORMATS[fmt].len * HZ, shot: shot * HZ, score: [0, 0], poss: -1, tipWinner: -1, lastTouch: -1,
    ctl: 0, ctlFor: null, lastRel: null, mask: 0, prev: 0, ev: [], note: null, buzzer: false, reset: null, pts: new Array(10).fill(0),
    fga: [0, 0], fgm: [0, 0], tpa: [0, 0], tpm: [0, 0], rima: [0, 0], rimm: [0, 0], fta: [0, 0], ftm: [0, 0], fouls: [0, 0], tov: [0, 0],
    tf: [0, 0], mark: [5, 6, 7, 8, 9, 0, 1, 2, 3, 4], pick: null, help: -1, ft: null, run: [-1, 0], out: [], gest: null, transT: 0,
  };
  setupTip(st);
  return st;
}
const human = (st, P) => P.t === 0 && !st.cfg.auto && P.i === st.ctl;
const holder = (st) => (st.ball.st === "held" ? st.p[st.ball.own] : null);
function say(st, k, P = null, extra = {}) { st.ev.push(k); st.note = { k, g: P ? P.g : -1, team: P ? P.t : -1, frame: st.frame, ...extra }; }
const rimOf = (t) => dirOf(t) * C.rimX;
const distRim = (P, t = P.t) => len(rimOf(t) - P.x, C.cy - P.y);
const markerOf = (st, M) => st.p.find(Q => Q.t !== M.t && st.mark[Q.g] === M.g) || null;

// ---- set pieces -------------------------------------------------------------------------------------
function setupTip(st) {
  const best = (t) => st.p.slice(t * 5, t * 5 + 5).reduce((a, P) => (P.h > a.h ? P : a));
  st.jumpers = [best(0).g, best(1).g];
  for (const P of st.p) {
    const d = dirOf(P.t), J = st.jumpers.includes(P.g);
    const ring = [[-2.6, 2.2], [-2.6, -2.2], [-5.5, 3.6], [-5.5, -3.6]];
    if (J) { P.x = -d * 0.55; P.y = C.cy; } else {
      const others = st.p.filter(Q => Q.t === P.t && !st.jumpers.includes(Q.g)), k = others.indexOf(P), [ax, ay] = ring[k] || [-4, 0];
      P.x = d * ax * (P.t === 0 ? 1 : 0.8); P.y = C.cy + ay * (P.t === 0 ? 1 : -1.1);
    }
    P.z = 0; P.vz = 0; P.act = null; P.face = d; P.mv = 0;
  }
  Object.assign(st.ball, { st: "tip", own: -1, x: 0, y: C.cy, z: 1.6, vx: 0, vy: 0, vz: 0, f: 0 });
  st.phase = "tip"; st.t = 0; st.tipPress = -1;
}
function giveBall(st, P) {
  const b = st.ball;
  Object.assign(b, { st: "held", own: P.g, f: 0, rim: false, air: false, x: P.x, y: P.y, z: 1, vx: 0, vy: 0, vz: 0, fouled: null, alley: false, cnt: null });
  if (st.poss !== P.t) { st.shot = st.cfg.shot * HZ; st.transT = 150; st.pick = null; for (const Q of st.p) Q.cut = null; }
  st.poss = P.t; st.lastTouch = P.t; P.hold = 0; P.think = 8; P.caught = st.frame; P.post = false; P.drive = null;
  if (P.t === 0 && !st.cfg.auto) st.ctl = P.i;
  // the man who now has it is closed out on
  const M = markerOf(st, P);
  if (M) M.close = 40;
}
// A dead ball: everyone walks to their places for `frames`, then `after` ("inbound" to team T at
// spot | "ft" | "period" | "over").
function dead(st, frames, after, T = -1, spot = null) {
  st.phase = "dead"; st.t = 0; st.deadFor = frames; st.after = after; st.afterTeam = T; st.spot = spot;
  for (const P of st.p) { if (P.act && P.act.kind !== "dunk") P.act = null; P.jumpAt = -1; P.plan = null; P.cut = null; P.charge = 0; P.post = false; }
  st.pick = null; st.help = -1;
  // a man out on fouls leaves now; a stand-in takes his place and his number
  for (const g of st.out) {
    const P = st.p[g], keep = { x: P.x, y: P.y };
    Object.assign(P, mkPlayer(P.t, P.i, [`stand-in-${g}`, "A STAND-IN", 40]), keep, { pf: 0 });
    say(st, "standin", P);
  }
  st.out = [];
  st.reset = after === "ft" ? ftSpots(st) : resetSpots(st, T, spot);
}
// The offence's spots, by the five: five out, or four out and one in when the five has a big.
const FIVE_OUT = [[7.6, 0], [6.0, 4.9], [6.0, -4.9], [1.0, 6.95], [1.0, -6.95]];
const FOUR_IN = [[7.6, 0], [6.0, 4.9], [6.0, -4.9], [1.0, -6.95], [1.6, 2.3]];
function spotOf(st, t, i) {
  const team = st.p.slice(t * 5, t * 5 + 5), big = team.find(P => P.arch === "big" && P.i !== 0);
  const s = big ? (big.i === i ? FOUR_IN[4] : FOUR_IN[team.filter(P => P !== big).indexOf(team[i])]) : FIVE_OUT[i];
  const d = dirOf(t);
  return [d * (C.rimX - s[0]), C.cy + s[1]];
}
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
      const [sx, sy] = spotOf(st, T, P.i);
      out[P.g] = spot ? [sx, sy] : [sx - d * 6, sy];
    } else {
      const M = st.p[st.mark[P.g]], [mx0, my] = spotOf(st, T, M.i), mx = spot ? mx0 : mx0 - d * 6;
      const rx = d * C.rimX, k = 1.6 / (len(rx - mx, C.cy - my) || 1);
      out[P.g] = [mx + (rx - mx) * k, my + (C.cy - my) * k];
    }
  }
  st.inbounder = inb.g;
  return out;
}
// The free-throw line-up: the shooter at the line, two defenders nearest the rim, the shooter's
// side next, the rest outside the arc.
function ftSpots(st) {
  const F = st.ft, S = st.p[F.g], d = dirOf(S.t), rx = d * C.rimX, out = new Array(10);
  const lane = (k, s) => [rx - d * (1.1 + k * 0.95), C.cy + s * (C.laneHW + 0.35)];
  const off = st.p.filter(P => P.t === S.t && P !== S), def = st.p.filter(P => P.t !== S.t);
  out[S.g] = [d * C.ftX, C.cy];
  [lane(0, 1), lane(0, -1), lane(2, 1), [rx - d * 6.6, C.cy + 1.4], [rx - d * 6.6, C.cy - 1.4]].forEach((p, k) => { out[def[k].g] = p; });
  [lane(1, 1), lane(1, -1), [rx - d * 7.8, C.cy + 3.6], [rx - d * 7.8, C.cy - 3.6]].forEach((p, k) => { out[off[k].g] = p; });
  return out;
}

// ---- the ball's flight ---------------------------------------------------------------------------
function aim(b, tx, ty, tz, T) {
  const s = T / HZ;
  b.vx = (tx - b.x) / s; b.vy = (ty - b.y) / s; b.vz = (tz - b.z) / s + (G * s) / 2;
}
function flight(b) { b.vz -= G * DT; b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT; }

// ---- the shot: quality = f(rating for the shot, distance, contest, timing, fatigue, type) --------
export const GRADES = ["GREEN", "SLIGHTLY EARLY", "SLIGHTLY LATE", "EARLY", "LATE", "VERY EARLY", "VERY LATE"];
// The green band (frames either side of the top): wider for a better shooter, wider still easy.
export function greenOf(P, kind, assist = false) {
  const s = kind === "ft" ? P.S.ft : kind === "lay" || kind === "float" || kind === "hook" ? P.S.close : P.S.mid > P.S.three ? (P.S.mid + P.S.three) / 2 : P.S.three;
  return 2 + Math.round(2 * s) + (assist ? 2 : 0);
}
export function gradeOf(e, w) {
  const a = e < 0 ? -e : e;
  if (a <= w) return "GREEN";
  if (a <= w + 3) return e < 0 ? "SLIGHTLY EARLY" : "SLIGHTLY LATE";
  if (a <= w + 8) return e < 0 ? "EARLY" : "LATE";
  return e < 0 ? "VERY EARLY" : "VERY LATE";
}
const TIMING = { GREEN: 1.38, "SLIGHTLY EARLY": 0.9, "SLIGHTLY LATE": 0.9, EARLY: 0.64, LATE: 0.64, "VERY EARLY": 0.3, "VERY LATE": 0.3 };
// How contested a shooter at (x, y) is: 0 (alone) .. 1 (smothered), from the nearest defenders'
// distance, whether they are between him and the rim, their height, their hands, their defence.
export function contestOf(st, S, x = S.x, y = S.y) {
  const rx = rimOf(S.t), r = len(rx - x, C.cy - y) || 1, ux = (rx - x) / r, uy = (C.cy - y) / r;
  let c = 0, who = null;
  for (const D of st.p) {
    if (D.t === S.t) continue;
    const dx = D.x - x, dy = D.y - y, d = len(dx, dy);
    if (d > 2.4) continue;
    const front = (dx * ux + dy * uy) / (d || 1);
    const clos = clamp((2.4 - d) / 2.0, 0, 1), fr = clamp((front + 0.4) / 1.2, 0, 1);
    const dskill = r < 3 ? (D.S.intD + D.S.block) / 2 : D.S.perD;
    let v = clos * (0.3 + 0.7 * fr) * (0.6 + 0.3 * dskill) * clamp(1 + 0.6 * (D.h - S.h), 0.7, 1.3) * (D.z > 0.1 ? 1.3 : D.hands > 0 ? 1.1 : 0.8);
    if (D.stumble > 0) v *= 0.1;
    if (D.screened > 0) v *= 0.6;
    if (v > c) { c = v; who = D; }
  }
  return { c: clamp(c, 0, 1), D: who };
}
export const CONTEST_WORDS = ["WIDE OPEN", "OPEN", "LIGHTLY CONTESTED", "CONTESTED", "HEAVILY CONTESTED", "SMOTHERED"];
export const contestWord = (c) => CONTEST_WORDS[c < 0.12 ? 0 : c < 0.28 ? 1 : c < 0.46 ? 2 : c < 0.66 ? 3 : c < 0.86 ? 4 : 5];
export function kindAt(r, post = false) { return r < 1.8 ? "lay" : r < 3.4 ? (post ? "hook" : "float") : "jump"; }
// o: {kind, r, grade, c, three, cs (catch and shoot), od (off a dribble move), sb (stepback),
// fade, moving}. -> the chance it goes in.
export function shotProb(st, P, o) {
  const { kind, r } = o, S = P.S;
  let base;
  if (kind === "lay") base = 0.8 + 0.2 * S.close - 0.04 * r;
  else if (kind === "float") base = 0.36 + 0.3 * (S.close * 0.6 + S.mid * 0.4) - 0.03 * (r - 1.8);
  else if (kind === "hook") base = 0.42 + 0.32 * S.close - 0.03 * (r - 1.8);
  else if (r > 11.5) base = 0.02;
  else if (o.three) base = 0.31 + 0.4 * S.three - 0.045 * Math.max(0, r - 7.24) - 0.07 * Math.max(0, r - 8.6);
  else base = 0.34 + 0.33 * S.mid - 0.012 * Math.max(0, r - 3.4);
  let tm = TIMING[o.grade] ?? 0.9;
  if (kind === "lay") tm = 1 + (tm - 1) * 0.5;
  const green = o.grade === "GREEN";
  const cm = 1 - (green ? 0.6 : kind === "lay" ? 0.45 : 0.75) * o.c;
  let p = base * tm * cm;
  if (o.cs) p *= 1.04;
  if (o.od) p *= 0.96;
  if (o.sb) p *= 0.95;
  if (o.fade) p *= 0.9;
  if (o.moving) p *= 0.93;
  if (P.sta < 0.5) p *= 0.85 + 0.3 * P.sta;
  if (P.hot) p *= 1.06;
  if (st.cfg.assist) p *= P.t === 0 && !st.cfg.auto ? 1.08 : 0.97;
  return clamp(p, 0.01, green && o.c < 0.3 ? 0.95 : 0.92);
}
// The chance of a free throw.
export function ftProb(st, P, grade) {
  const tm = { GREEN: 1.1, "SLIGHTLY EARLY": 0.92, "SLIGHTLY LATE": 0.92, EARLY: 0.7, LATE: 0.7, "VERY EARLY": 0.35, "VERY LATE": 0.35 }[grade] ?? 0.9;
  let p = (0.55 + 0.34 * P.S.ft) * tm;
  if (st.cfg.assist) p *= P.t === 0 && !st.cfg.auto ? 1.06 : 0.98;
  return clamp(p, 0.05, 0.98);
}

function release(st, P, e) {
  const b = st.ball, d = dirOf(P.t), rx = d * C.rimX;
  if (b.st !== "held" || b.own !== P.g) { P.act = null; return; }
  const r = len(rx - P.x, C.cy - P.y), kind = kindAt(r, P.act?.post);
  const three = isThree(P.x, P.y, d), pts = three ? 3 : 2;
  const grade = gradeOf(e, greenOf(P, kind, st.cfg.assist && human(st, P)));
  const { c, D } = contestOf(st, P);
  const a = P.act || {};
  const o = { kind, r, grade, c, three, cs: st.frame - P.caught < 50 && st.frame - P.lastMove > 60, od: st.frame - P.lastMove < 40, sb: P.sb > 0, fade: a.fade, moving: a.moving };
  let p = shotProb(st, P, o);
  // a shooting foul: a defender on top of the shot, more when he left his feet into it
  let fouled = null;
  if (D) {
    const dd = len(D.x - P.x, D.y - P.y);
    if (dd < 1.05) {
      let pf = (D.z > 0.1 ? 0.1 : 0.025) + (kind === "jump" ? 0 : 0.07) + 0.08 * (1 - D.def) + (D.intense ? 0.02 : 0);
      if (o.three) pf *= 0.6;
      if (rnd(st) < pf) { fouled = { g: D.g }; p *= 0.5; }
    }
  }
  const made = rnd(st) < p;
  const air = !made && kind === "jump" && r > 4 && (grade.startsWith("VERY") || c > 0.8) && rnd(st) < 0.5;
  Object.assign(b, { st: "shot", own: -1, from: P.g, f: 0, made, pts, kind, rim: false, air, sx: P.x, sy: P.y, x: P.x + d * 0.2, y: P.y, z: P.z + P.h + 0.25, fouled });
  const T = Math.round(kind === "lay" ? 24 : kind === "float" || kind === "hook" ? 30 : 30 + r * 3.0);
  b.T = T;
  let tx = rx, ty = C.cy, tz = C.rimZ + 0.05;
  if (!made && air) { const k = (r - 1.6) / r; tx = P.x + (rx - P.x) * k; ty = P.y + (C.cy - P.y) * k; tz = C.rimZ - 0.5; }
  else if (!made) { tx = rx + d * (rnd(st) < 0.5 ? -0.26 : 0.27); ty = C.cy + (rnd(st) - 0.5) * 0.44; }
  aim(b, tx, ty, tz, T);
  if (!fouled) countFga(st, P, pts, r);
  P.act = { kind: "follow", f: 0 };
  P.sb = 0;
  st.lastTouch = P.t;
  st.lastRel = { g: P.g, e, grade, c, word: contestWord(c), p, frame: st.frame };
  for (const Q of st.p) if (Q.t !== P.t && !human(st, Q) && Q.z === 0 && len(Q.x - P.x, Q.y - P.y) < 2.4 && rnd(st) < 0.2 + 0.4 * Q.S.block) Q.jumpAt = st.frame + Math.round(2 + (1 - Q.k) * 7);
  say(st, three ? "shoot3" : "shoot", P, { grade, c });
  if (fouled) foulCall(st, st.p[fouled.g], P, "shooting");
}
function countFga(st, P, pts, r) {
  st.fga[P.t]++; if (pts === 3) st.tpa[P.t]++; if (r < 1.9) st.rima[P.t]++;
  st.ball.cnt = { pts, rim: r < 1.9 };
}

// Near the rim: a dunk for a dunker with a lane (or going hard, RT), else a layup (the jump, timed).
function laneToRim(st, P) {
  const rx = rimOf(P.t), ax = rx - P.x, ay = C.cy - P.y, L2 = ax * ax + ay * ay || 1;
  for (const D of st.p) {
    if (D.t === P.t || D.stumble > 0) continue;
    const u = clamp(((D.x - P.x) * ax + (D.y - P.y) * ay) / L2, 0, 1.15), px = P.x + ax * u - D.x, py = P.y + ay * u - D.y;
    if (px * px + py * py < 0.75 * 0.75 && u > 0.05) return false;
  }
  return true;
}
function startShot(st, P, hard = false) {
  const d = dirOf(P.t), r = len(d * C.rimX - P.x, C.cy - P.y);
  P.face = d;
  if (P.dunker && r < 2.9 && !P.post && (laneToRim(st, P) || hard)) {
    P.act = { kind: "dunk", f: 0, x0: P.x, y0: P.y };
    for (const Q of st.p) if (Q.t !== P.t && !human(st, Q) && Q.z === 0 && len(Q.x - P.x, Q.y - P.y) < 2.8 && rnd(st) < 0.3 + 0.5 * Q.S.block) Q.jumpAt = st.frame + Math.round(2 + (1 - Q.k) * 6);
    say(st, "gather", P); return;
  }
  const kind = kindAt(r, P.post), sp = len(P.vx, P.vy);
  const fade = sp > 1 && (P.vx * (d * C.rimX - P.x) + P.vy * (C.cy - P.y)) / (sp * (r || 1)) < -0.4;
  let rel = -1;
  if (!human(st, P)) {
    const s = kind === "jump" ? (isThree(P.x, P.y, d) ? P.S.three : P.S.mid) : P.S.close;
    rel = clamp(Math.round(TOP + gauss(st) * (5.5 + 6 * (1 - s))), 4, HOLD_MAX);
  }
  P.act = { kind: "jump", f: 0, rel, fade, moving: sp > 3.2 && kind === "jump", post: P.post };
  P.vz = (G * TOP) / HZ; P.z = 0.0001;
  for (const Q of st.p) if (Q.t !== P.t && len(Q.x - P.x, Q.y - P.y) < 2.6) Q.hands = 40;
}
function dunkStep(st, P) {
  const a = P.act, d = dirOf(P.t), tx = d * (C.rimX - 0.45), ty = C.cy, b = st.ball;
  a.f++;
  const k = Math.min(1, a.f / 16);
  P.x = a.x0 + (tx - a.x0) * k; P.y = a.y0 + (ty - a.y0) * k;
  P.z = a.f <= 16 ? 1.05 * (1 - (1 - k) * (1 - k)) : a.f <= 26 ? 1.05 : Math.max(0, 1.05 - (a.f - 26) * 0.09);
  if (b.st === "held" && b.own === P.g) { b.x = P.x + d * 0.3; b.y = P.y; b.z = P.z + P.h + 0.3; }
  if (a.f === 12 && b.own === P.g) {
    // the rim protector: the nearest defender at the rim decides it, block, foul, strip or nothing
    let D = null, dd = 1.4;
    for (const Q of st.p) { if (Q.t === P.t || Q.stumble > 0) continue; const k2 = len(Q.x - P.x, Q.y - P.y); if (k2 < dd) { dd = k2; D = Q; } }
    a.contested = Boolean(D);
    if (D) {
      const up = D.z > 0.15;
      const pBlock = up ? clamp(0.05 + 0.25 * D.S.block + 0.4 * (D.h - P.h) - 0.2 * P.S.dunk, 0.03, 0.35) : 0.03;
      const pFoul = up ? 0.2 : 0.14, pStrip = 0.04 + 0.08 * (1 - P.S.handle);
      const u = rnd(st);
      if (u < pBlock) { blocked(st, D, P); a.blocked = true; return; }
      if (u < pBlock + pFoul) a.fouled = D.g;
      else if (u < pBlock + pFoul + pStrip) { stripped(st, D, P); a.blocked = true; return; }
    }
  }
  if (a.f === 16 && !a.blocked && b.own === P.g) {
    const p = a.fouled != null ? 0.45 + 0.35 * P.S.dunk : a.contested ? 0.72 + 0.15 * P.S.dunk : 0.95 + 0.04 * P.S.dunk;
    st.lastTouch = P.t;
    const fouled = a.fouled != null ? { g: a.fouled } : null;
    Object.assign(b, { st: "shot", own: -1, from: P.g, f: 0, kind: "dunk", pts: 2, made: rnd(st) < p, rim: false, air: false, T: 4, sx: a.x0, sy: a.y0, x: d * C.rimX - d * 0.15, y: C.cy, z: C.rimZ + 0.35, vx: d * 0.4, vy: 0, vz: -2.5, fouled });
    if (!fouled) countFga(st, P, 2, 0.5);
    say(st, "slam", P);
    if (fouled) foulCall(st, st.p[fouled.g], P, "shooting");
  }
  if (a.f >= 38) { P.act = null; P.z = 0; }
}
function blocked(st, D, S) {
  const b = st.ball, d = dirOf(S.t);
  if (b.st === "shot" && !b.fouled) { /* the attempt stands */ } else if (b.st === "held") countFga(st, S, 2, 0.5);
  Object.assign(b, { st: "loose", own: -1, f: 0, rim: false, fouled: null, x: b.x, y: b.y, z: Math.max(1.5, b.z), vx: -d * (2.5 + rnd(st) * 2), vy: (rnd(st) - 0.5) * 5, vz: 1.5 + rnd(st) * 1.5 });
  st.lastTouch = D.t;
  if (S.act) S.act = { kind: "follow", f: 0 };
  say(st, "block", D, { victim: S.g });
}
function stripped(st, D, S) {
  const b = st.ball;
  Object.assign(b, { st: "loose", own: -1, f: 0, rim: false, fouled: null, vx: (rnd(st) - 0.5) * 4, vy: (rnd(st) - 0.5) * 4, vz: 1 });
  st.lastTouch = D.t; st.tov[S.t]++;
  if (S.act) S.act = { kind: "follow", f: 0 };
  say(st, "strip", D, { victim: S.g });
}

// ---- fouls ------------------------------------------------------------------------------------------
// kind: "shooting" (free throws when the shot lands: one after a make, else two or three),
// "reach", "block", "loose" (the bonus shoots two, else a side-out), "charge" (the offence's foul: a
// turnover, a personal foul, not a team foul).
function foulCall(st, F, V, kind) {
  const Fm = FORMATS[st.cfg.fmt];
  F.pf++; st.fouls[F.t]++;
  if (kind !== "charge") st.tf[F.t]++;
  if (F.pf >= Fm.foulOut && !F.key.startsWith("stand-in")) st.out.push(F.g);
  say(st, kind === "shooting" ? "shootfoul" : kind === "charge" ? "charge" : kind === "block" ? "blockfoul" : kind === "reach" ? "reachfoul" : "loosefoul", F, { victim: V.g, pf: F.pf });
  if (F.pf >= Fm.foulOut) st.ev.push("foulout");
  if (kind === "shooting") return;   // resolved when the shot comes down
  const b = st.ball;
  if (b.st === "held" && b.own >= 0) { const H = st.p[b.own]; if (H.act && H.act.kind !== "dunk") H.act = null; }
  b.st = "dead"; b.own = -1;
  if (kind === "charge") { st.tov[F.t]++; dead(st, 80, "inbound", 1 - F.t, sideSpot(F.x)); return; }
  if (st.tf[F.t] > Fm.bonus) { st.ev.push("bonus"); toLine(st, V, 2, 90); return; }
  const sc = Math.min(st.cfg.shot, 14) * HZ;
  if (st.shot < sc) st.shot = sc;
  dead(st, 80, "inbound", V.t, sideSpot(V.x));
  st.keepShot = true;
}
const sideSpot = (x) => [clamp(x, -C.hx + 1.5, C.hx - 1.5), 0.3];
function toLine(st, S, n, wait = 80) {
  st.ft = { g: S.g, n, k: 0, team: S.t, t: 0, res: [] };
  dead(st, wait, "ft", S.t);
  say(st, "toline", S, { n });
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
// kind: "chest" | "bounce" (slower, harder to pick off) | "lob" (over the top; an alley-oop to a
// dunker going to the rim)
function passTo(st, P, Q, kind = "chest") {
  const b = st.ball, sp = (11 + 4 * P.k) * (kind === "bounce" ? 0.8 : kind === "lob" ? 0.62 : 1);
  const d0 = len(Q.x - P.x, Q.y - P.y), s = d0 / sp;
  let tx = Q.x + Q.vx * s * 0.8, ty = Q.y + Q.vy * s * 0.8, tz = 1.25;
  const qr = distRim(Q);
  const alley = kind === "lob" && Q.dunker && qr < 5.5 && (Q.vx * (rimOf(Q.t) - Q.x) + Q.vy * (C.cy - Q.y)) > 0;
  if (alley) { const d = dirOf(Q.t); tx = d * (C.rimX - 0.7); ty = C.cy + (Q.y - C.cy) * 0.2; tz = 3.3; Q.cut = { x: tx, y: ty, until: st.frame + 90 }; }
  else if (kind === "lob") tz = 2.2;
  const T = Math.max(kind === "lob" ? 26 : 6, Math.round((len(tx - P.x, ty - P.y) / sp) * HZ));
  Object.assign(b, { st: "pass", own: -1, from: P.g, to: Q.g, f: 0, x: P.x + P.face * 0.3, y: P.y, z: 1.3, pass: kind, alley, T });
  aim(b, tx, ty, tz, T);
  P.hold = 0; st.lastTouch = P.t;
  if (Q.t === 0 && !st.cfg.auto) st.ctl = Q.i;
  // give and go: the passer cuts to the rim when his man is behind him or asleep
  const M = markerOf(st, P);
  if (!alley && M && !human(st, P) && (st.frame & 1) === 0 && rnd(st) < 0.35 + (st.cfg.assist && P.t === 0 ? 0.15 : 0)) { const d = dirOf(P.t); P.cut = { x: d * (C.rimX - 1.2), y: C.cy + (P.y > C.cy ? 0.8 : -0.8), until: st.frame + 70 }; }
  say(st, alley ? "lob" : "pass", P, { to: Q.g });
}
function stealTry(st, P) {
  const H = holder(st);
  P.cool = 50;
  const b = st.ball;
  if (!H || H.t === P.t || H.act?.kind === "dunk" || len(b.x - P.x, b.y - P.y) > 0.95) { say(st, "reach", P); return; }
  // behind or beside the dribbler is a reach-in more often than a steal
  const hv = len(H.vx, H.vy), behind = hv > 0.5 && ((P.x - H.x) * H.vx + (P.y - H.y) * H.vy) / hv < -0.2;
  let p = 0.07 + 0.16 * P.S.steal - 0.09 * H.S.handle + (P.intense ? 0.03 : 0) + (H.act?.kind === "move" ? 0.03 : 0);
  if (st.cfg.assist) p += P.t === 0 && !st.cfg.auto ? 0.05 : -0.03;
  const u = rnd(st);
  if (u < p) { const from = H; H.act = null; P.cool = 0; st.tov[from.t]++; giveBall(st, P); say(st, "steal", P, { victim: from.g }); return; }
  const pf = 0.05 + 0.14 * (1 - P.S.steal) + (behind ? 0.12 : 0);
  if (u < p + pf * (1 - p)) { foulCall(st, P, H, "reach"); return; }
  say(st, "reach", P);
}

// ---- dribble moves ------------------------------------------------------------------------------------
// kind: cross | btl (between the legs) | btb (behind the back) | hesi | stepback | spin | drive.
// side: +1 / -1 across the court (y). The nearest defender may lose his ankles; a handler who
// overdoes it, or has no handle, may lose the ball.
const MOVE_LEN = { cross: 12, btl: 14, btb: 12, hesi: 16, stepback: 12, spin: 20, drive: 4 };
function startMove(st, P, kind, side = 0) {
  if (P.act || P.z > 0 || P.moveCool > 0 || P.post) return false;
  if (!side) side = P.y < C.cy ? 1 : -1;
  P.act = { kind: "move", m: kind, f: 0, side, n: MOVE_LEN[kind] };
  P.moveCool = MOVE_LEN[kind] + 8; P.heat += 1; P.lastMove = st.frame;
  say(st, kind, P);
  return true;
}
function moveStep(st, P) {
  const a = P.act, d = dirOf(P.t), rx = rimOf(P.t), r = len(rx - P.x, C.cy - P.y) || 1, ux = (rx - P.x) / r, uy = (C.cy - P.y) / r;
  a.f++;
  const sp = P.spd;
  let vx = 0, vy = 0;
  if (a.m === "cross" || a.m === "btl" || a.m === "btb") { vy = a.side * sp * 0.62; vx = ux * sp * (a.m === "btb" ? 0.6 : 0.25); }
  else if (a.m === "hesi") { if (a.f > 10) { vx = ux * sp; vy = uy * sp; } }
  else if (a.m === "stepback") { if (a.f <= 9) { vx = -ux * 4.2; vy = -uy * 4.2; } }
  else if (a.m === "spin") { const k = a.f < 10 ? 1 : 0.6; vx = ux * sp * 0.75 * k; vy = (uy * 0.5 + a.side * 0.75) * sp * k; }
  P.vx = vx; P.vy = vy; P.face = d;
  if (a.f === 6) {
    // the nearest defender in front: ankles, a poke, or nothing
    let D = null, dd = 1.9;
    for (const Q of st.p) { if (Q.t === P.t || Q.stumble > 0 || Q.z > 0) continue; const k = len(Q.x - P.x, Q.y - P.y); if (k < dd) { dd = k; D = Q; } }
    if (D) {
      const bonus = { cross: 0, btl: 0.03, btb: 0.04, hesi: 0.04, stepback: 0.07, spin: 0.06 }[a.m] || 0;
      const lean = D.vy * a.side < -0.5 ? 0.15 : 0;   // he was going the other way
      let p = clamp(0.008 + 0.3 * (P.S.handle - D.S.perD) + bonus * 0.5 + lean * 0.5 - 0.04 * Math.max(0, P.heat - 2), 0, 0.5) * (D.intense ? 0.7 : 1);
      if (st.cfg.assist && human(st, P)) p += 0.06;
      const u = rnd(st);
      if (u < p) { D.stumble = u < p * 0.3 ? 80 : 45; D.act = null; D.vx = 0; D.vy = 0; say(st, "ankles", D, { by: P.g, fall: D.stumble > 50 }); }
      else {
        const lose = Math.max(0, 0.035 * (P.heat - 2)) + 0.05 * (1 - P.S.handle) * (dd < 1 ? 1 : 0.4);
        if (rnd(st) < lose) { lostBall(st, P, D); return; }
      }
    }
  }
  if (a.f >= a.n) {
    P.act = null;
    if (a.m === "stepback") P.sb = 30;
    else P.burst = a.m === "drive" ? 36 : a.m === "hesi" ? 26 : 20;
  }
}
function lostBall(st, P, D) {
  const b = st.ball;
  P.act = null; st.tov[P.t]++;
  Object.assign(b, { st: "loose", own: -1, f: 0, rim: false, fouled: null, x: P.x, y: P.y, z: 0.6, vx: (D.x - P.x) * 2 + (rnd(st) - 0.5) * 2, vy: (D.y - P.y) * 2 + (rnd(st) - 0.5) * 2, vz: 1.2 });
  st.lastTouch = P.t;
  say(st, "lostball", P, { by: D.g });
}

// ---- screens ----------------------------------------------------------------------------------------
// The ball handler calls for a pick: a teammate (the big when there is one) sets it on the side of
// his man the drive will go, holds it, then rolls to the rim (or pops to the arc, a shooter).
function callPick(st, H) {
  if (st.pick || !holder(st) || holder(st) !== H) return;
  const D = markerOf(st, H);
  if (!D) return;
  let best = null, bs = 1e9;
  for (const Q of st.p) { if (Q.t !== H.t || Q === H) continue; const s = len(Q.x - H.x, Q.y - H.y) - (Q.arch === "big" ? 4 : 0); if (s < bs) { bs = s; best = Q; } }
  if (!best) return;
  st.pick = { s: best.g, h: H.g, d: D.g, ph: "go", t: 0, side: H.y < C.cy ? 1 : -1, x: best.x, y: best.y };
  say(st, "pick", best);
}
function pickStep(st) {
  const K = st.pick;
  if (!K) return;
  const S = st.p[K.s], H = st.p[K.h], D = st.p[K.d];
  if (st.phase !== "live" || holder(st) !== H) { if (K.ph !== "roll") { K.ph = "roll"; K.t = 0; } }
  K.t++;
  if (K.ph === "go") {
    const rx = rimOf(H.t), r = len(rx - D.x, C.cy - D.y) || 1;
    K.x = D.x + ((rx - D.x) / r) * 0.15; K.y = D.y + K.side * 0.6;
    if (len(S.x - K.x, S.y - K.y) < 0.35 || K.t > 110) { K.ph = "set"; K.t = 0; K.x = S.x; K.y = S.y; }
  } else if (K.ph === "set") {
    if (K.t > 55 || (holder(st) === H && len(H.x - S.x, H.y - S.y) > 2.6 && K.t > 20)) { K.ph = "roll"; K.t = 0; }
  } else if (K.ph === "roll" && K.t > 80) st.pick = null;
}
// A defender running into a set screen is hung up, unless the defence switches it.
function screens(st) {
  const K = st.pick;
  if (!K || K.ph !== "set") return;
  const S = st.p[K.s];
  for (const D of st.p) {
    if (D.t === S.t || D.screened > 0 || D.z > 0) continue;
    if (len(D.x - S.x, D.y - S.y) < 0.62 && (D.vx || D.vy)) {
      D.screened = 22;
      say(st, "screened", D, { by: S.g });
      // the switch: the screener's man takes the ball when both can guard it
      const SD = markerOf(st, S), H = st.p[K.h];
      if (SD && st.mark[D.g] === H.g && SD !== D && !human(st, SD) && rnd(st) < 0.15 + 0.6 * Math.min(SD.S.perD, D.S.perD)) {
        st.mark[SD.g] = H.g; st.mark[D.g] = S.g; say(st, "switch", SD);
      }
    }
  }
}

// ---- moving -------------------------------------------------------------------------------------
function goTo(P, tx, ty, frac = 1) {
  const dx = tx - P.x, dy = ty - P.y, d = len(dx, dy), step = P.spd * DT * frac;
  if (d < 0.05) { P.vx = 0; P.vy = 0; return; }
  const k = Math.min(1, step / d);
  P.vx = (dx * k) / DT; P.vy = (dy * k) / DT;
}
// The defender's place: between his man and the basket, closer to the man with the ball, sagging
// into the lane off a man far from it.
function markSpot(st, P) {
  const M = st.p[st.mark[P.g]], b = st.ball, rx = dirOf(M.t) * C.rimX;
  const hasBall = b.st === "held" && b.own === M.g;
  let gap = hasBall ? 1.0 : 1.6;
  const far = len(M.x - b.x, M.y - b.y);
  const r = len(rx - M.x, C.cy - M.y) || 1;
  gap = Math.min(gap, r * 0.6);
  let tx = M.x + ((rx - M.x) / r) * gap, ty = M.y + ((C.cy - M.y) / r) * gap;
  if (!hasBall && far > 6) { tx += (rx - dirOf(M.t) * 3 - tx) * 0.35; ty += (C.cy - ty) * 0.35; }
  return [tx, ty];
}
// Help: the ball is going to the rim past its man; the defender whose own man matters least steps in.
function helpStep(st) {
  st.help = -1;
  const H = holder(st);
  if (!H || st.phase !== "live") return;
  const r = distRim(H);
  if (r > 6) return;
  const D = markerOf(st, H);
  const beaten = !D || D.stumble > 0 || D.screened > 0 || distRim(D, H.t) > r + 0.3;
  if (!beaten) return;
  const rx = rimOf(H.t), px = H.x + (rx - H.x) * 0.35, py = H.y + (C.cy - H.y) * 0.35;
  let best = null, bs = 1e9;
  for (const Q of st.p) {
    if (Q.t === H.t || Q === D || Q.stumble > 0) continue;
    const M = st.p[st.mark[Q.g]], s = len(Q.x - px, Q.y - py) - 0.4 * len(M.x - H.x, M.y - H.y) * 0.3 - (Q.arch === "big" ? 1.2 : 0);
    if (s < bs) { bs = s; best = Q; }
  }
  if (best) { st.help = best.g; st.helpAt = [px, py]; }
}

function cpuThink(st, P) {
  const b = st.ball;
  P.vx = 0; P.vy = 0; P.sprint = false; P.intense = false;
  if (P.stumble > 0) return;
  if (P.act && P.act.kind !== "follow") return;
  if (st.phase === "dead" || st.phase === "ft") { const r = st.reset?.[P.g]; if (r) goTo(P, r[0], r[1], 0.85); return; }
  if (st.phase === "tip") return;
  if (P.jumpAt >= 0 && st.frame >= P.jumpAt) { P.jumpAt = -1; hop(P); return; }
  if (b.st === "held" && b.own === P.g) { carrier(st, P); return; }
  const off = st.poss === P.t;
  if (b.st === "pass" && b.to === P.g) { if (b.alley && P.cut) goTo(P, P.cut.x, P.cut.y); else goTo(P, b.x + b.vx * 0.15, b.y + b.vy * 0.15); return; }
  if (b.st === "loose" || (b.st === "shot" && b.kind !== "dunk")) { rebound(st, P); return; }
  if (off) offBall(st, P);
  else onDefence(st, P);
}
function offBall(st, P) {
  const K = st.pick, d = dirOf(P.t), rx = rimOf(P.t);
  if (K && K.s === P.g) {
    if (K.ph === "go") { goTo(P, K.x, K.y); P.sprint = true; return; }
    if (K.ph === "set") return;
    if (K.ph === "roll") {
      if (P.S.three > 0.6 && P.arch !== "big") { const [sx, sy] = spotOf(st, P.t, P.i); goTo(P, sx, sy); }
      else goTo(P, rx - d * 1.3, C.cy + (P.y > C.cy ? 0.6 : -0.6));
      return;
    }
  }
  if (P.cut && st.frame < P.cut.until) { goTo(P, P.cut.x, P.cut.y); if (len(P.x - P.cut.x, P.y - P.cut.y) < 0.4 && st.frame > P.cut.until - 20) P.cut = null; return; }
  P.cut = null;
  // a backdoor cut when his man is far off him (helping, ball-watching, beaten)
  const M = markerOf(st, P), think = (st.frame + P.g * 7) % 30 === 0;
  if (think && M && st.transT <= 0) {
    const gap = len(M.x - P.x, M.y - P.y), lane = st.p.filter(Q => Q.t !== P.t && distRim(Q, P.t) < 2.2).length;
    const want = (gap > 2.4 ? 0.12 : 0.015) + (st.cfg.assist && P.t === 0 ? 0.08 : 0);
    if (lane < 2 && distRim(P) > 3 && rnd(st) < want) { P.cut = { x: rx - d * 1.1, y: C.cy + (P.y > C.cy ? 0.9 : -0.9), until: st.frame + 60 }; say(st, "cut", P); return; }
  }
  // spacing: the spot, a little drift so it never stands like a statue; sprint in transition
  if (--P.jt <= 0) { P.jt = 80 + Math.floor(rnd(st) * 80); P.jx = gauss(st) * 0.5; P.jy = gauss(st) * 0.5; }
  const [sx, sy] = spotOf(st, P.t, P.i);
  const far = len(sx - P.x, sy - P.y) > 6;
  P.sprint = far && P.sta > 0.3;
  goTo(P, sx + P.jx, sy + P.jy, far ? 1 : 0.75);
}
function onDefence(st, P) {
  const H = holder(st), M = st.p[st.mark[P.g]];
  // a help man in the path of a hard drive plants his feet for the charge, now and then
  if (P.charge > 0) { P.vx = 0; P.vy = 0; return; }
  if (H && H.t !== P.t && st.help === P.g && len(H.vx, H.vy) > 4 && len(H.x - P.x, H.y - P.y) < 2.2 && distRim(P, H.t) > C.ra + 0.2 && rnd(st) < 0.03 * (0.5 + P.S.intD)) { P.charge = 30; P.still = 12; return; }
  if (st.help === P.g && st.helpAt) { goTo(P, st.helpAt[0], st.helpAt[1]); P.sprint = true; P.hands = 10; return; }
  let [tx, ty] = markSpot(st, P);
  if (P.close > 0 && H === M) {
    // the closeout: sprint at the catch, stop short with a hand up
    const dd = len(M.x - P.x, M.y - P.y);
    if (dd > 1.0) { P.sprint = true; } else P.hands = 20;
  }
  const back = st.transT > 0 && len(tx - P.x, ty - P.y) > 4;
  if (back) P.sprint = P.sta > 0.2;
  goTo(P, tx, ty);
  if (H === M && len(H.x - P.x, H.y - P.y) < 1.4) { P.intense = P.sta > 0.35; P.hands = Math.max(P.hands, 2); }
  if (H && H.t !== P.t && P.cool <= 0 && len(H.x - P.x, H.y - P.y) < 1.15) {
    let p = 0.001 * (0.3 + P.S.steal);
    if (st.cfg.assist && H.t === 0 && !st.cfg.auto) p *= 0.5;
    if (rnd(st) < p) stealTry(st, P);
  }
}
function hop(P) { if (P.z > 0 || P.stumble > 0) return; P.vz = Math.sqrt(2 * G * P.leap); P.z = 0.0001; P.act = { kind: "hop", f: 0 }; }

// Crash the glass: while the shot is up, the defence boxes out its men; the two nearest the ball on
// each side go for it, a big crashes, the rest get back or space out.
function rebound(st, P) {
  const b = st.ball, sh = b.st === "shot";
  const bx = sh ? b.x + (dirOf(st.p[b.from].t) * C.rimX - b.x) * 0.8 : b.x, by = sh ? b.y + (C.cy - b.y) * 0.8 : b.y;
  if (sh && st.poss !== P.t && b.f < b.T - 3) {
    const M = st.p[st.mark[P.g]], rx = rimOf(M.t), r = len(rx - M.x, C.cy - M.y) || 1;
    if (r < 7) { goTo(P, M.x + ((rx - M.x) / r) * 0.55, M.y + ((C.cy - M.y) / r) * 0.55); P.boxing = 30; return; }
  }
  const mine = st.p.filter(Q => Q.t === P.t).map(Q => [len(Q.x - bx, Q.y - by) - (Q.arch === "big" ? 1 : 0), Q.g]).sort((a, c) => a[0] - c[0] || a[1] - c[1]);
  const rank = mine.findIndex(([, g]) => g === P.g);
  if (rank < 2 && (st.poss !== P.t || rank === 0 || P.arch === "big")) {
    goTo(P, bx, by);
    if (b.st === "loose" && b.vz < 0 && b.z > 2.0 && b.z < 3.4 && len(b.x - P.x, b.y - P.y) < 1.2) hop(P);
    return;
  }
  if (st.poss === P.t) { const [sx, sy] = spotOf(st, P.t, P.i); goTo(P, sx, sy, 0.7); } else { const [tx, ty] = markSpot(st, P); goTo(P, tx, ty, 0.8); }
}

// The CPU with the ball: drive, pull up, beat its man with a move, call a pick, kick it out to the
// open man or the cutter, throw the lob, beat the shot clock.
function expect(st, P, x = P.x, y = P.y) {
  const d = dirOf(P.t), r = len(d * C.rimX - x, C.cy - y), three = isThree(x, y, d), kind = kindAt(r);
  const { c } = contestOf(st, P, x, y);
  if (P.dunker && r < 2.9) return (c < 0.5 ? 0.9 : 0.7) * 2;
  return shotProb(st, P, { kind, r, grade: "SLIGHTLY LATE", c, three }) * (three ? 3 : 2) * 1.05;
}
function carrier(st, P) {
  const d = dirOf(P.t), rx = d * C.rimX, r = len(rx - P.x, C.cy - P.y);
  P.hold++;
  let D = null, c = 1e9;
  for (const Q of st.p) if (Q.t !== P.t) { const k = len(Q.x - P.x, Q.y - P.y); if (k < c) { c = k; D = Q; } }
  if (P.think-- <= 0) {
    P.think = 5 + Math.round((1 - P.k) * 8);
    const urgent = st.shot < 120 || (FORMATS[st.cfg.fmt].periods && st.clock < 120 && st.clock > 0);
    if (P.dunker && r < 2.9 && (laneToRim(st, P) || rnd(st) < 0.3)) { startShot(st, P, true); return; }
    if (r < 1.7) { startShot(st, P); return; }
    const ep = expect(st, P);
    if (st.shot < 45) { startShot(st, P); return; }
    if (P.sb > 0) { startShot(st, P); return; }
    // the open man, the cutter, the roller: if the lane to him is clear
    if (P.hold > 14) {
      let best = null, bs = ep + 0.12, lob = false;
      for (const Q of st.p) {
        if (Q.t !== P.t || Q === P) continue;
        let qe = expect(st, Q);
        const qc = contestOf(st, Q).c;
        if (qc < 0.15) qe += 0.2;
        if (Q.cut || (st.pick && st.pick.s === Q.g && st.pick.ph === "roll")) qe += 0.08;
        if (qe > bs && laneClear(st, P, Q)) { bs = qe; best = Q; lob = Q.dunker && Boolean(Q.cut) && distRim(Q) < 5; }
      }
      const pressed = c < 0.8 || st.help >= 0;
      if (best && rnd(st) < (pressed ? 0.5 : 0.17) + (urgent ? 0.1 : 0)) { passTo(st, P, best, lob && rnd(st) < 0.5 ? "lob" : "chest"); return; }
    }
    // catch and shoot: open at the arc, let it go
    if (P.hold > 3 && P.hold < 30 && isThree(P.x, P.y, d) && r < 8.4 && contestOf(st, P).c < 0.3 && ep > 0.9 && rnd(st) < 0.3 + 0.5 * P.S.three) { startShot(st, P); return; }
    if (P.hold > 16 && (ep > 0.98 + 0.08 * (1 - P.k) || (urgent && ep > 0.55)) && rnd(st) < 0.4 + 0.35 * P.k) { startShot(st, P); return; }
    // beat the man in front with a move
    if (D && c < 1.4 && P.moveCool <= 0 && P.heat < 3 && rnd(st) < 0.01 + 0.025 * P.S.handle) {
      const side = (P.y - D.y) > 0 ? 1 : -1;
      const kinds = P.S.three > 0.6 && r > C.three && r < C.three + 1.5 ? ["stepback", "cross", "hesi"] : P.S.handle > 0.6 ? ["cross", "btl", "btb", "spin", "hesi"] : ["cross", "hesi"];
      if (startMove(st, P, kinds[Math.floor(rnd(st) * kinds.length)], side)) return;
    }
    // the pick and roll, now and then
    if (!st.pick && P.hold > 30 && r > 5 && rnd(st) < 0.05) callPick(st, P);
    // where to go: at the rim for a driver; to the arc for a shooter who isn't there yet; around a screen
    if (P.hold <= P.think + 8 || P.drive == null) P.drive = rnd(st) < (P.arch === "big" || P.arch === "slasher" ? 0.45 : 0.15);
    const go = P.drive || P.burst > 0 || (D && D.stumble > 0) || (D && D.screened > 0);
    const wantR = !go && r > C.three - 0.5 ? C.three + 0.4 : 0.8;
    let side = (P.y - C.cy) || (rnd(st) < 0.5 ? -0.5 : 0.5);
    if (D && c < 1.8) side += (P.y - D.y) * 1.5;
    if (st.pick && st.pick.h === P.g && st.pick.ph !== "go") side = -st.pick.side * 1.5;
    const ty = clamp(C.cy + clamp(side, -1, 1) * (r > 5 ? 3.2 : 1.2), 1, C.w - 1);
    P.plan = { x: rx - d * wantR, y: ty };
    P.sprint = st.transT > 0 && r > 9 && P.sta > 0.4;
  }
  if (P.act) return;
  if (st.pick && st.pick.h === P.g && st.pick.ph === "go") { P.vx = 0; P.vy = 0; return; }   // wait for the screen
  const pl = P.plan || { x: rx - d * 1, y: C.cy };
  goTo(P, clamp(pl.x, -C.hx + 0.6, C.hx - 0.6), clamp(pl.y, 0.6, C.w - 0.6), P.sprint ? 1 : 0.85);
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
const dirCode = (m) => { const dx = (m & BTN.RSR ? 1 : 0) - (m & BTN.RSL ? 1 : 0), dy = (m & BTN.RSU ? 1 : 0) - (m & BTN.RSD ? 1 : 0); return dx || dy ? (dx + 1) * 3 + (dy + 1) : 0; };
const codeXY = (c) => [Math.floor(c / 3) - 1, (c % 3) - 1];
// The pro stick: a gesture from the first push to the return to centre (or 8 frames held):
// one way = a move by direction; three or more ways in a row = a spin; held toward the rim = drive.
function proStick(st, P, m) {
  const code = dirCode(m);
  const g = st.gest;
  if (code) {
    if (!g) st.gest = { codes: [code], f0: st.frame, fired: false };
    else if (g.codes[g.codes.length - 1] !== code) g.codes.push(code);
    const G2 = st.gest;
    if (!G2.fired && st.frame - G2.f0 >= 8) { G2.fired = true; return resolveGesture(st, P, G2.codes); }
    return null;
  }
  if (g) { st.gest = null; if (!g.fired) return resolveGesture(st, P, g.codes); }
  return null;
}
function resolveGesture(st, P, codes) {
  const d = dirOf(P.t);
  if (new Set(codes).size >= 3) return ["spin", codeXY(codes[codes.length - 1])[1] || (P.y < C.cy ? 1 : -1)];
  const [x, y] = codeXY(codes[0]), along = x * d;
  if (y && along < 0) return ["btl", y];
  if (y && along > 0) return ["btb", y];
  if (y) return ["cross", y];
  if (along < 0) return ["stepback", 0];
  return ["drive", 0];
}
function humanThink(st, P, m, press) {
  const b = st.ball;
  P.vx = 0; P.vy = 0; P.intense = false;
  if (st.phase === "tip") { if (press & (BTN.X | BTN.Y | BTN.A) && st.tipPress < 0 && st.jumpers.includes(P.g)) st.tipPress = st.t; return; }
  if (st.phase === "ft") { ftHuman(st, P, m, press); return; }
  if (st.phase !== "live") return;
  if (P.stumble > 0) return;
  const has = b.st === "held" && b.own === P.g;
  if (!has && press & BTN.A && st.poss !== 0) {
    const N = nearestToBall(st, 0, P.g);
    if (N) { st.ctl = N.i; say(st, "switchman", N); }
    return;
  }
  if (P.act) {
    if (P.act.kind === "jump" && (!(m & BTN.X) || P.act.f >= HOLD_MAX)) release(st, P, P.act.f - TOP);
    if (P.act.kind === "move" && P.act.f >= 6 && press & BTN.X && P.act.m === "stepback") { P.act = null; P.sb = 30; startShot(st, P); }
    return;
  }
  const dx = (m & BTN.RIGHT ? 1 : 0) - (m & BTN.LEFT ? 1 : 0), dy = (m & BTN.UP ? 1 : 0) - (m & BTN.DOWN ? 1 : 0);
  P.sprint = Boolean(m & BTN.RT) && P.sta > 0.05;
  if (has) {
    P.post = Boolean(m & BTN.LT) && distRim(P) < 6.5;
    // a quick reversal of the stick: a dribble move
    const code = dx || dy ? (dx + 1) * 3 + (dy + 1) : 0;
    if (code) {
      if (code !== P.ld) {
        const [px, py] = P.ld ? codeXY(P.ld) : [0, 0];
        const rev = P.ld && px * dx + py * dy < 0 && st.frame - P.ldEnd <= 5 && P.ldEnd - P.ldStart >= 3;
        P.ld = code; P.ldStart = st.frame;
        if (rev && !P.post) {
          const kind = py * dy < 0 ? (len(P.vx, P.vy) > 4.5 || P.burst > 0 ? "btb" : P.S.handle > 0.6 && (st.frame & 3) === 0 ? "btl" : "cross") : "hesi";
          if (startMove(st, P, kind, dy || (P.y < C.cy ? 1 : -1))) { P.ldEnd = st.frame; return; }
        }
      }
      P.ldEnd = st.frame;
    }
    const gst = proStick(st, P, m) || (press & BTN.SPIN ? ["spin", dy || (P.y < C.cy ? 1 : -1)] : null);
    if (gst && !P.post) { if (startMove(st, P, gst[0], gst[1])) return; }
    if (press & BTN.X) { startShot(st, P, Boolean(m & BTN.RT)); return; }
    if (press & (BTN.A | BTN.B | BTN.Y)) { const Q = passTarget(st, P, m); if (Q) passTo(st, P, Q, press & BTN.Y ? "lob" : press & BTN.B ? "bounce" : "chest"); return; }
    if (press & BTN.LB) callPick(st, P);
  } else { st.gest = null; P.post = false; }
  if (dx || dy) {
    const n = dx && dy ? 0.70710678 : 1;
    let sp = P.spd * (has ? 0.88 : 1) * (st.cfg.assist ? 1.06 : 1) * n;
    if (P.post) sp *= 0.4;
    P.vx = dx * sp; P.vy = dy * sp;
  }
  if (has) {
    if (P.post) {
      // backing down: toward the rim, shoulder into the man
      const rx = rimOf(P.t), r = distRim(P) || 1, D = markerOf(st, P);
      if (D && len(D.x - P.x, D.y - P.y) < 0.9) { const push = 0.35 * clamp(0.5 + (P.h - D.h) * 2 + (P.S.close - D.S.intD) * 0.5, 0.1, 1); D.x += ((rx - P.x) / r) * push * DT * 3; D.y += ((C.cy - P.y) / r) * push * DT * 3; }
      P.face = -dirOf(P.t);
    }
    return;
  }
  // a pass coming to you: go and meet it unless you steer; on defence the easy assist guards for you
  if (!dx && !dy && b.st === "pass" && b.to === P.g) { if (b.alley && P.cut) goTo(P, P.cut.x, P.cut.y); else goTo(P, b.x + b.vx * 0.15, b.y + b.vy * 0.15); }
  else if (!dx && !dy && st.cfg.assist && st.poss === 1 && b.st === "held") { const [tx, ty] = markSpot(st, P); goTo(P, tx, ty); }
  if (st.poss === 1 || b.st === "loose") {
    P.intense = Boolean(m & BTN.LT) && P.sta > 0.05;
    if (P.intense) { P.vx *= 0.9; P.vy *= 0.9; P.hands = Math.max(P.hands, 2); }
    if (press & BTN.Y) hop(P);
    else if (press & BTN.X && P.cool <= 0) stealTry(st, P);
    else if (press & BTN.B && !dx && !dy) { P.charge = 40; say(st, "takecharge", P); }
    if (P.charge > 0) { P.vx = 0; P.vy = 0; }
  }
}

// ---- the free throw ---------------------------------------------------------------------------------
function ftHuman(st, P, m, press) {
  const F = st.ft;
  if (!F || F.g !== P.g || st.ball.st !== "held" || F.t < 30) return;
  if (!P.act && press & BTN.X) P.act = { kind: "ftshot", f: 0 };
  else if (P.act?.kind === "ftshot" && !(m & BTN.X)) ftRelease(st, P, P.act.f - FT_TOP);
}
function ftStep(st) {
  const F = st.ft, S = st.p[F.g], b = st.ball;
  F.t++;
  if (b.st === "held") {
    b.x = S.x + dirOf(S.t) * 0.3; b.y = S.y; b.z = S.act?.kind === "ftshot" ? 1.2 + Math.min(1, S.act.f / FT_TOP) * 1.2 : 1.0;
    if (S.act?.kind === "ftshot") { S.act.f++; if (S.act.f > FT_TOP + 30) ftRelease(st, S, S.act.f - FT_TOP); }
    else if (!human(st, S) && F.t === 50) S.act = { kind: "ftshot", f: 0, rel: clamp(Math.round(FT_TOP + gauss(st) * (3 + 6 * (1 - S.S.ft))), 4, FT_TOP + 30) };
    if (S.act?.kind === "ftshot" && S.act.rel >= 0 && S.act.f >= S.act.rel) ftRelease(st, S, S.act.f - FT_TOP);
    if (F.t > 600 && b.st === "held") { st.lastRel = { g: S.g, e: 99, grade: "VERY LATE", c: 0, word: "TEN SECONDS", ft: true, frame: st.frame }; ftLand(st, S, false, true); }
    return;
  }
  if (b.st === "ftshot") {
    flight(b);
    if (b.f++ >= b.T) ftLand(st, S, b.made);
  }
}
function ftRelease(st, S, e) {
  const b = st.ball, d = dirOf(S.t), rx = d * C.rimX;
  const grade = gradeOf(e, greenOf(S, "ft", st.cfg.assist && human(st, S)));
  const p = ftProb(st, S, grade), made = rnd(st) < p;
  S.act = null;
  st.lastRel = { g: S.g, e, grade, c: 0, word: "", p, ft: true, frame: st.frame };
  Object.assign(b, { st: "ftshot", own: -1, from: S.g, f: 0, made, x: S.x + d * 0.2, y: S.y, z: 2.3 });
  b.T = 40;
  aim(b, made ? rx : rx + d * (rnd(st) < 0.5 ? -0.26 : 0.27), made ? C.cy : C.cy + (rnd(st) - 0.5) * 0.4, C.rimZ + 0.05, b.T);
  st.fta[S.t]++;
  say(st, "ftshot", S, { grade });
}
function ftLand(st, S, made, violation = false) {
  const F = st.ft, b = st.ball, d = dirOf(S.t);
  F.k++; F.res.push(made);
  if (made) { st.score[S.t]++; st.pts[S.g]++; st.ftm[S.t]++; say(st, "ftmade", S, { k: F.k, n: F.n }); }
  else say(st, violation ? "ftviolation" : "ftmiss", S, { k: F.k, n: F.n });
  const Fm = FORMATS[st.cfg.fmt];
  if (Fm.target && st.score[S.t] >= Fm.target) { st.ft = null; b.st = "dead"; dead(st, 150, "over"); return; }
  if (F.k < F.n) { Object.assign(b, { st: "held", own: S.g, f: 0 }); F.t = 0; return; }
  st.ft = null;
  if (made || violation) { b.st = "through"; Object.assign(b, { x: d * C.rimX, y: C.cy, z: C.rimZ, vx: 0, vy: 0, vz: -1.5 }); if (violation) b.st = "dead"; endOrInbound(st, 1 - S.t); return; }
  // the last one off the iron: live
  Object.assign(b, { st: "loose", own: -1, f: 0, rim: true, x: d * C.rimX - d * 0.2, y: C.cy, z: C.rimZ, vx: -d * (1.2 + rnd(st) * 2.2), vy: (rnd(st) - 0.5) * 4, vz: 2.2 + rnd(st) * 1.8 });
  st.phase = "live"; st.t = 0; st.shot = st.cfg.shot * HZ; st.lastTouch = S.t; st.poss = S.t;
}
function endOrInbound(st, T) {
  if (st.buzzer || (FORMATS[st.cfg.fmt].periods && st.clock <= 0)) { endPeriod(st); return; }
  dead(st, 75, "inbound", T, null);
}

// ---- the rules ------------------------------------------------------------------------------------
const inBounds = (x, y) => Math.abs(x) <= C.hx && y >= 0 && y <= C.w;
function turnover(st, k, P, x, y) {
  const T = 1 - (P ? P.t : st.lastTouch);
  const sp = [clamp(x, -C.hx + 0.4, C.hx - 0.4), clamp(y, 0.3, C.w - 0.3)];
  say(st, k, P);
  st.tov[1 - T]++;
  st.ball.st = "dead"; st.ball.own = -1;
  dead(st, 70, "inbound", T, sp);
}
function scored(st, S, pts) {
  st.score[S.t] += pts; st.pts[S.g] += pts;
  const cnt = st.ball.cnt;
  if (st.ball.fouled) { st.fga[S.t]++; if (pts === 3) st.tpa[S.t]++; if (st.ball.kind === "dunk" || st.ball.kind === "lay") st.rima[S.t]++; }
  st.fgm[S.t]++; if (pts === 3) st.tpm[S.t]++;
  if ((cnt && cnt.rim) || (st.ball.fouled && (st.ball.kind === "dunk" || st.ball.kind === "lay"))) st.rimm[S.t]++;
  // the run, and the hot hand
  if (st.run[0] === S.t) st.run[1] += pts; else st.run = [S.t, pts];
  S.streak = Math.max(0, S.streak) + 1;
  if (S.streak >= 3 && !S.hot) { S.hot = true; st.ev.push("hot"); }
  say(st, st.ball.kind === "dunk" ? "dunk" : pts === 3 ? "three" : "two", S, { pts, run: st.run[1], andone: Boolean(st.ball.fouled) });
  const F = FORMATS[st.cfg.fmt];
  if (F.target && st.score[S.t] >= F.target) { st.ball.st = "dead"; dead(st, 150, "over"); return; }
  if (st.ball.fouled) { const sh = st.ball.fouled; st.ball.st = "through"; st.ev.push("andone"); toLine(st, S, 1, 90); st.ball.fouled = null; void sh; return; }
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
  st.tf = [0, 0];
  for (const P of st.p) P.sta = Math.min(1, P.sta + 0.35);
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
    const from = st.p[b.from];
    // a defender in the lane can pick it off (a lob only by a tall man in the air)
    for (const O of st.p) {
      if (O.t === from.t || O.stumble > 0) continue;
      const reach = b.pass === "lob" ? O.z + O.h + 0.4 : 2.3 + O.z;
      if (len(O.x - b.x, O.y - b.y) < 0.55 && b.z < reach && rnd(st) < (0.06 + 0.12 * O.S.steal) * (b.pass === "bounce" ? 0.6 : 1)) { st.tov[from.t]++; giveBall(st, O); say(st, "intercept", O); return; }
    }
    for (const Q of st.p) {
      if (Q.t !== from.t || Q.g === b.from) continue;
      const tgt = Q.g === b.to;
      if (len(Q.x - b.x, Q.y - b.y) < (tgt ? (b.alley ? 1.1 : 0.75) : 0.4) && b.z < (b.alley ? 3.9 : 2.6) + Q.z && (!b.alley || b.f >= b.T - 6)) {
        const alley = b.alley && tgt && b.z > 2.2;
        giveBall(st, Q);
        if (alley) { Q.act = { kind: "dunk", f: 6, x0: Q.x, y0: Q.y }; Q.cut = null; say(st, "alleyoop", Q, { from: from.g }); }
        return;
      }
    }
    if (b.z <= 0 || b.f > PASS_MAX) { if (b.alley) st.tov[from.t]++; loose(st); }
    return;
  }
  if (b.st === "shot") {
    if (b.kind !== "dunk" && b.f < 22) {
      const S = st.p[b.from];
      for (const D of st.p) {
        if (D.t === S.t || D.z < 0.15 || D.act?.blockTried) continue;
        if (len(D.x - b.x, D.y - b.y) < 0.75 && b.z < D.z + D.h + 0.7) {
          if (D.act) D.act.blockTried = true;
          if (rnd(st) < 0.05 + 0.2 * D.S.block + (b.kind === "jump" ? 0 : 0.04)) { blocked(st, D, S); return; }
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
      S.streak = Math.min(0, S.streak) - 1; if (S.streak <= -2) S.hot = false;
      if (b.fouled) { const n = b.pts; b.fouled = null; b.st = "dead"; say(st, "miss", S); toLine(st, S, n, 70); return; }
      if (b.air) { say(st, "airball", S); b.st = "loose"; return; }
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
    // the nearest hand within reach takes it; inside position (the defence of a missed shot) and
    // height count for something
    let best = null, bd = 1e9, rival = null;
    for (const P of st.p) {
      if (P.act?.kind === "jump" || P.act?.kind === "dunk" || P.stumble > 0) continue;
      const k = len(P.x - b.x, P.y - b.y);
      if (k > 0.85 || b.z >= P.z + P.h + 0.45) continue;
      const sc = k - (b.rim && P.t !== st.poss ? 0.45 : 0) - 0.4 * (P.h - 2);
      if (sc < bd) { bd = sc; best = P; }
    }
    if (best) {
      for (const P of st.p) if (P.t !== best.t && len(P.x - b.x, P.y - b.y) < 0.65 && b.z < 1.2) rival = P;
      // the scramble on the floor: now and then the loser fouls the winner
      if (rival && rnd(st) < 0.05) { const off = st.poss === best.t; giveBall(st, best); say(st, off ? "oreb" : "dreb", best); foulCall(st, rival, best, "loose"); return; }
      const off = st.poss === best.t, bf = b.f, wasShot = b.rim || b.air;
      giveBall(st, best);
      say(st, bf > 2 && wasShot ? (off ? "oreb" : "dreb") : "loosegrab", best);
      if (st.buzzer) endPeriod(st);
    }
    if (b.f > 600) turnover(st, "oob", null, b.x, b.y);
  }
  if (b.st === "through") { flight(b); if (b.z < 0) { b.z = 0; b.vz = 0; } }
}
function loose(st) {
  const b = st.ball;
  b.st = "loose"; b.f = 0; b.own = -1; b.alley = false;
}

// Contact on the drive: the ball handler running into a defender in front of him. A defender set
// (still, feet outside the restricted arc) draws the charge; one sliding into the path is a block.
function contact(st) {
  const H = holder(st);
  if (!H || H.act || H.z > 0) return;
  const v = len(H.vx, H.vy) * (H.burst > 0 ? 1.22 : 1) * (H.sprint ? 1.2 : 1);
  if (v < 4.2) return;
  for (const D of st.p) {
    if (D.t === H.t || D.z > 0 || D.stumble > 0 || D.cool > 30) continue;
    const ox = D.x - H.x, oy = D.y - H.y, d = len(ox, oy);
    if (d > 0.62 || (ox * H.vx + oy * H.vy) / (d * v || 1) < 0.65) continue;
    if (st.frame - (H.lastContact || -99) < 45) return;
    H.lastContact = st.frame;
    const ra = distRim(D, H.t) < C.ra, set = D.still >= 12 || D.charge > 0 && D.still >= 4;
    const u = rnd(st);
    if (set && !ra) { if (u < (D.charge > 0 ? 0.75 : 0.25)) { foulCall(st, H, D, "charge"); return; } }
    else if (!set) { if (u < 0.2 * (1.2 - D.S.perD * 0.6)) { foulCall(st, D, H, "block"); return; } }
    // no call: the drive is stopped dead
    H.vx *= 0.2; H.vy *= 0.2; H.burst = 0;
    return;
  }
}

// ---- one step ---------------------------------------------------------------------------------------
export function step(st, mask = 0) {
  st.ev = [];
  const press = mask & ~st.prev;
  st.prev = mask; st.mask = mask; st.frame++;
  if (st.phase === "over") return st;
  const b = st.ball, F = FORMATS[st.cfg.fmt];
  st.t++;

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
      st.phase = "live"; st.poss = w;
      passTo(st, J[w], to);
      Object.assign(b, { x: J[w].x + dirOf(w) * 0.3, y: C.cy, z: 3.3 });
      aim(b, to.x, to.y, 1.4, 30);
      say(st, "tip", J[w]);
    }
  }
  if (st.phase === "live" && !st.cfg.auto) {
    const H = holder(st);
    if (H && H.t === 0) st.ctl = H.i;
    else if ((H && H.t === 1 && st.ctlFor !== H.g) || (b.st === "loose" && st.ctlFor !== "loose")) { const N = nearestToBall(st, 0); if (N) st.ctl = N.i; }
    st.ctlFor = H ? H.g : b.st === "loose" ? "loose" : st.ctlFor;
  }
  if (st.phase === "ft" && !st.cfg.auto && st.ft && st.p[st.ft.g].t === 0) st.ctl = st.p[st.ft.g].i;
  if (st.transT > 0) st.transT--;
  if (st.phase === "live") { pickStep(st); helpStep(st); }
  for (const P of st.p) {
    if (P.cool > 0) P.cool--;
    if (P.hands > 0) P.hands--;
    if (P.screened > 0) P.screened--;
    if (P.close > 0) P.close--;
    if (P.burst > 0) P.burst--;
    if (P.sb > 0) P.sb--;
    if (P.charge > 0) P.charge--;
    if (P.boxing > 0) P.boxing--;
    if (P.moveCool > 0) P.moveCool--;
    if (P.stumble > 0) { P.stumble--; P.vx = 0; P.vy = 0; }
    if ((st.frame + P.g) % 90 === 0 && P.heat > 0) P.heat--;
    if ((st.phase === "live" || st.phase === "ft") && human(st, P)) humanThink(st, P, mask, press);
    else if (st.phase === "tip" && P.t === 0 && !st.cfg.auto && st.jumpers.includes(P.g)) humanThink(st, P, mask, press);
    else cpuThink(st, P);
  }
  // actions under way
  for (const P of st.p) {
    const a = P.act;
    if (!a) continue;
    if (a.kind === "dunk") { if (st.phase !== "dead" || a.f > 16) dunkStep(st, P); else P.act = null; continue; }
    if (a.kind === "move") { if (st.phase === "live" && st.ball.own === P.g && st.ball.st === "held") moveStep(st, P); else P.act = null; continue; }
    if (a.kind === "ftshot") continue;
    a.f++;
    if (a.kind === "jump" && st.phase === "live" && a.rel >= 0 && a.f >= a.rel) release(st, P, a.f - TOP);
    if (a.kind === "follow" && a.f > 30 && P.z === 0) P.act = null;
  }
  if (st.phase === "live") screens(st);
  // a defender squared up in front of the ball slows the drive (more for a good defender, intense D)
  const Hb = st.phase === "live" ? holder(st) : null;
  if (Hb && (Hb.vx || Hb.vy) && Hb.act?.kind !== "move" && !Hb.post) {
    const v = len(Hb.vx, Hb.vy);
    for (const D of st.p) {
      if (D.t === Hb.t || D.z > 0 || D.stumble > 0 || D.charge > 0) continue;
      const ox = D.x - Hb.x, oy = D.y - Hb.y, d = len(ox, oy);
      if (d < 0.95 && (ox * Hb.vx + oy * Hb.vy) / (d * v || 1) > 0.45) {
        const k = 0.55 - 0.3 * D.S.perD + 0.2 * Hb.S.handle + (st.cfg.assist && human(st, Hb) ? 0.2 : 0) - (D.intense ? 0.12 : 0) + (Hb.burst > 0 ? 0.25 : 0);
        Hb.vx *= clamp(k, 0.2, 0.95); Hb.vy *= clamp(k, 0.2, 0.95);
        break;
      }
    }
  }
  if (st.phase === "live") contact(st);
  // move, sprint and tire, jump, land, keep apart
  for (const P of st.p) {
    if (P.act?.kind !== "dunk") {
      const busy = P.act && (P.act.kind === "jump" || P.act.kind === "ftshot" || P.z > 0);
      if (P.cool > 22) { P.vx *= 0.45; P.vy *= 0.45; }
      if (P.screened > 0) { P.vx *= 0.25; P.vy *= 0.25; }
      // sealed off the glass: an attacker behind a defender boxing him out barely gets through
      if (st.ball.st === "shot" || (st.ball.st === "loose" && st.ball.rim)) for (const D of st.p) {
        if (D.t === P.t || !(D.boxing > 0) || st.poss !== P.t) continue;
        if (len(D.x - P.x, D.y - P.y) < 0.75 && distRim(D, P.t) < distRim(P)) { P.vx *= 0.35; P.vy *= 0.35; break; }
      }
      const moving = P.vx || P.vy;
      let mul = 1;
      if (moving && P.act?.kind !== "move") {
        if (P.sprint && P.sta > 0.05) { mul = 1.2 * (0.82 + 0.18 * P.sta); P.sta -= 0.0025; }
        if (P.burst > 0) mul *= 1.22;
      }
      if (P.intense) P.sta -= 0.0008;
      if (!(moving && P.sprint)) P.sta += moving ? 0.0005 : 0.0011;
      P.sta = clamp(P.sta, 0, 1);
      if (!busy) { P.x += P.vx * DT * mul; P.y += P.vy * DT * mul; }
      if (moving) { P.mv++; P.still = 0; if (!P.post) { if (P.vx > 0.2) P.face = 1; else if (P.vx < -0.2) P.face = -1; } } else { P.mv = 0; P.still++; }
      if (P.z > 0) { P.vz -= G * DT; P.z += P.vz * DT; if (P.z <= 0) { P.z = 0; P.vz = 0; if (P.act && P.act.kind !== "follow" && P.act.kind !== "move") P.act = P.act.kind === "jump" ? { kind: "follow", f: 99 } : null; } }
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
    if (H && !human(st, H)) { H.x = clamp(H.x, -C.hx + 0.2, C.hx - 0.2); H.y = clamp(H.y, 0.2, C.w - 0.2); }
  }
  if (st.phase === "ft") ftStep(st); else ballStep(st);

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
    else if (st.after === "ft") {
      const S = st.p[st.ft.g];
      for (const P of st.p) { if (P.act?.kind !== "dunk") P.act = null; const r = st.reset[P.g]; P.x = r[0]; P.y = r[1]; P.z = 0; P.vz = 0; }
      st.phase = "ft"; st.ft.t = 0;
      Object.assign(st.ball, { st: "held", own: S.g, f: 0, fouled: null });
      st.ev.push("ftset");
    } else if (st.after === "inbound") {
      const I = st.p[st.inbounder], r = st.reset[I.g];
      if (len(I.x - r[0], I.y - r[1]) < 0.4 || st.t >= st.deadFor + 150) {
        I.x = r[0]; I.y = r[1];
        for (const P of st.p) { if (P.act?.kind !== "dunk") P.act = null; }
        const keep = st.keepShot, sc = st.shot;
        st.phase = "live";
        st.poss = -1;
        giveBall(st, I);
        if (keep) st.shot = sc;
        st.keepShot = false;
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
  return {
    done: st.phase === "over", winner: st.phase === "over" ? (s[0] > s[1] ? 0 : 1) : null, score: [...s], periods: st.q, frames: st.frame, pts: [...st.pts],
    fga: [...st.fga], fgm: [...st.fgm], tpa: [...st.tpa], tpm: [...st.tpm], fta: [...st.fta], ftm: [...st.ftm], fouls: [...st.fouls], tov: [...st.tov],
  };
}
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
  for (const Q of st.p) { Q.act = null; Q.z = 0; Q.vz = 0; Q.jumpAt = -1; Q.stumble = 0; Q.cool = 0; }
  P.x = x; P.y = y; st.phase = "live"; st.t = 0;
  giveBall(st, P);
  P.caught = -999;
  if (shot != null) st.shot = shot;
  if (clock != null) st.clock = clock;
  return st;
}
// For the checks only: a release from where the player stands, its outcome forced.
export function forceShot(st, g, made) {
  const P = st.p[g];
  P.act = { kind: "jump", f: TOP };
  release(st, P, 0);
  st.ball.made = made; st.ball.air = false; st.ball.fouled = null;
  return st;
}
// For the checks only: send a player to the line for n shots.
export function forceFreeThrows(st, g, n) { toLine(st, st.p[g], n, 10); return st; }
