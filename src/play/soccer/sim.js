// THE ESTATE PITCH, playable (docs/CITY_SPEC.md "PLAYABLE SPORTS", Soccer). The match itself: pure,
// no DOM, no clock, no Math.random, no trig. A fixed 60 Hz step over a seeded generator, so a match is
// a function of (version, seed, cfg, the human's input per frame): the browser plays it, and anything
// holding the record plays it again to the same result (scripts/check-soccer.mjs does). Only + - * /
// and sqrt touch the state, which IEEE 754 rounds the same everywhere.
//
// The pitch is in metres, 105 x 68: x along the length (halfway line at 0, goal lines at +-52.5), y
// across it (the near touchline, the camera's, at 0; the far one at 68), z up. Goals 7.32 x 2.44.
// Team 0 is the viewer's; ends change at half time (att()). Eleven a side: the league's drafted XI.
//
// Control is the FC convention: the human steers one player of team 0 (st.ctl), the ball carrier when
// team 0 has it (a pass switches to its receiver), on defence the player chosen by LB / the right
// stick (or the nearest when the ball is lost). Input: one 16-bit mask a frame (BTN):
// the buttons by position, EA SPORTS FC's default ("Classic") layout from version 2:
//   attack   A pass (to the mate the stick points at)  B shoot (hold: power; release)  X lob / cross
//            Y through ball (hold: further)  RT sprint  LT protect / close control  RB+B finesse
//            LB+B chip  LB+Y lobbed through  LB tapped alone: trigger a run  right stick: skill moves
//            B then A: fake shot
//   defence  A contain (hold)  B tackle (chasing, close: push / pull)  X slide  RB teammate contain
//            (hold)  Y rush the keeper out (hold)  RT sprint  LT jockey  LB / right stick switch
//   keeper   A throw  X or B drop kick      free kick: right stick left / right curl, up / down height
// Version 1 (the first release): defence A tackle (hold: contain), B slide, X teammate press; LT the
// chip / lobbed-through modifier; LB the run on the press; free kick curl on LB / RB. Its records
// replay on its own rules.
// Everyone else, both sides, is the CPU, from the league rating: formation shape, pressing, marking,
// off-ball runs, the offside line, a goalkeeper who positions, dives, catches, parries and distributes.

export const VERSION = 2;   // 2: EA SPORTS FC's default buttons on defence and the LB modifiers; the six levels
export const VERSIONS = [1, 2];
export const HZ = 60;
const DT = 1 / HZ, G = 9.81;
export const PITCH = { hx: 52.5, w: 68, cy: 34, gw: 3.66, bar: 2.44, boxD: 16.5, boxW: 20.16, sixD: 5.5, sixW: 9.16, spot: 11, circle: 9.15 };
const P_ = PITCH;
export const BTN = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, A: 16, B: 32, X: 64, Y: 128, RT: 256, LT: 512, LB: 1024, RB: 2048, RU: 4096, RD: 8192, RL: 16384, RR: 32768 };
export const LENGTHS = [3, 4, 6, 8];         // real minutes a half (4: the default, where the match is calibrated)
export const SHOT_FULL = 48;                 // frames of B held to a full power bar
const THRU_FULL = 40, LOB_FULL = 40;
export const SKILLS = { stepover: 2, ballroll: 2, roulette: 3, heelflick: 3, fakeshot: 1 };   // the stars each needs

// Formations: [role, u, v] in the team's own frame (u toward the goal it attacks, -52.5 its own goal
// line; v across, 0 its left touchline), the shape with the ball near halfway.
export const FORMATIONS = {
  "442": { name: "4-4-2", n: [4, 4, 2], slots: [["GK", -50, 34], ["FB", -36, 8], ["CB", -39, 26], ["CB", -39, 42], ["FB", -36, 60], ["WM", -19, 9], ["CM", -21, 28], ["CM", -21, 40], ["WM", -19, 59], ["FW", -5, 28], ["FW", -5, 40]] },
  "433": { name: "4-3-3", n: [4, 3, 3], slots: [["GK", -50, 34], ["FB", -36, 8], ["CB", -39, 26], ["CB", -39, 42], ["FB", -36, 60], ["CM", -23, 22], ["CM", -26, 34], ["CM", -23, 46], ["WF", -6, 10], ["FW", -3, 34], ["WF", -6, 58]] },
  "352": { name: "3-5-2", n: [3, 5, 2], slots: [["GK", -50, 34], ["CB", -39, 20], ["CB", -40, 34], ["CB", -39, 48], ["WM", -20, 6], ["CM", -23, 24], ["CM", -27, 34], ["CM", -23, 44], ["WM", -20, 62], ["FW", -5, 28], ["FW", -5, 40]] },
};
const LINE = { GK: 0, FB: 1, CB: 1, WM: 2, CM: 2, WF: 3, FW: 3 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const len = (x, y) => Math.sqrt(x * x + y * y);
// mulberry32 on the state's own word
function rnd(st) {
  let t = (st.rng = (st.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const gauss = (st) => (rnd(st) + rnd(st) + rnd(st) - 1.5) * 2;   // mean 0, sd 1, bounded at 3
function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// The direction team t attacks this half: +1 toward x = +52.5.
export const att = (st, t) => ((t === 0) === (st.half % 2 === 1) ? 1 : -1);
const uOf = (st, t, x) => att(st, t) * x;
const vOf = (st, t, y) => (att(st, t) > 0 ? y : P_.w - y);
const xOf = (st, t, u) => att(st, t) * u;
const yOf = (st, t, v) => (att(st, t) > 0 ? v : P_.w - v);

// ---- the players -------------------------------------------------------------------------------------
export function stars(r) { return clamp(1 + Math.floor(Math.max(0, r - 50) / 10), 1, 5); }
export function attrs(key, r, role) {
  const k = clamp((r - 35) / 60, 0, 1), h = strHash(String(key));
  const jit = (n) => ((((h >>> (n * 4)) & 15) - 7.5) / 7.5) * 0.07;
  const line = LINE[role];
  const a = {
    k,
    pace: clamp(k + jit(0), 0, 1),
    shoot: clamp(k + jit(1) + (line === 3 ? 0.06 : line === 1 ? -0.1 : 0), 0, 1),
    pass: clamp(k + jit(2) + (line === 2 ? 0.05 : 0), 0, 1),
    drib: clamp(k + jit(3) + (line === 3 ? 0.04 : line === 1 ? -0.05 : 0), 0, 1),
    def: clamp(k + jit(4) + (line === 1 ? 0.1 : line === 3 ? -0.12 : 0), 0, 1),
    phys: clamp(k + jit(5), 0, 1),
    gk: role === "GK" ? clamp(k + 0.12 + jit(6), 0, 1) : 0.05,
    stars: stars(r),
  };
  a.spd = 6.7 + 2.1 * a.pace;          // top sprint, m/s
  a.acc = 7 + 4 * a.pace;              // m/s^2
  return a;
}
function mkPlayer(t, i, row, slot) {
  const [key, name, r] = row, [role, u, v] = slot;
  return {
    t, i, g: t * 11 + i, key: String(key), name: String(name), r: r | 0, role, su: u, sv: v,
    ...attrs(key, r | 0, role),
    x: 0, y: 0, z: 0, vx: 0, vy: 0, fx: 1, fy: 0, tx: 0, ty: 0, sprint: false, act: null, cool: 0, think: 0, run: null,
    stun: 0, yc: 0, off: false, goals: 0, burst: 0, jockey: false,
  };
}
// cfg rows: [[key, name, r] x 11] in any order. The league's convention (city/leagues.js): the lowest
// rated keeps goal; of the rest, best first, the forwards, then midfield, then defence.
export function lineUp(rows, form) {
  const F = FORMATIONS[form] || FORMATIONS["442"];
  const all = [...rows].sort((a, b) => b[2] - a[2] || (a[0] < b[0] ? -1 : 1));
  const gk = all.pop(), out = all;
  const [nd, nm, nf] = F.n;
  const fw = out.slice(0, nf), mf = out.slice(nf, nf + nm), df = out.slice(nf + nm, nf + nm + nd);
  return [gk, ...df, ...mf, ...fw];
}

// cfg: {half (real minutes a half: 3 | 4 | 6 | 8), form: "442" | "433" | "352" (yours), formB (theirs),
// ko (extra time and penalties if level), easy, lock (your player index to lock control to, or -1),
// home: [[key, name, r] x 11], away: [...], auto (team 0 played by the CPU too: checks, attract)}.
// Difficulty: EA SPORTS FC's six levels, as data (a league division can map to a default level).
// Every lever is a number the sim reads; on version 1 records the old EASY MODE switch picks the old
// pair (easy / not) and the levels do not exist. A CPU-v-CPU match (auto) plays neutral, as rated.
//   hz      the speed the page runs the match at (the sim is per frame; fewer frames a second is slower)
//   pass lob shot pen fk   the error on your side's passes, lofted balls, shots, penalties, free kicks (x)
//   cone    how wide your pass looks for a teammate around the stick (cos; lower is more forgiving)
//   heavy   less chance of your side's heavy first touch (subtracted)
//   gkCpu   frames later the CPU keeper reacts to your shots; gkMine: frames sooner yours reacts to theirs
//   eager   the CPU's appetite for a tackle (x); think: frames the CPU carrier waits longer to decide
//   cpuErr  the error on the CPU's passes and shots (x)
//   help    0: you defend alone; 1: your man keeps his place when you let go, and goes to a loose ball;
//           2: and a teammate presses with you all the time (FC's teammate contain, held for you)
//   keep    less chance a CPU standing tackle takes the ball off your side (subtracted)
//   win     more chance your side's standing tackle wins it (added)
//   lane    your pass picks the open man near the stick over the one exactly on it (FC's assisted passing)
//   rate    the CPU side plays as if its league ratings were this much higher (FC's CPU ability)
//   auto    your defender's own tackle, a chance a frame when in reach and you have not (FC's legacy help)
// A level is a point e (0..1) between the sim as rated (e = 0: no help, the CPU at its ratings; what
// CPU v CPU plays) and EASE_END (e = 1), each lever straight between the two. The yardstick is a
// casual human (scripts/check-soccer.mjs plays one): he wins about seven in ten on BEGINNER, half on
// AMATEUR and SEMI-PRO, one in six on LEGENDARY. The sim as rated is harder than LEGENDARY for him.
const NEUTRAL = { pass: 1, lob: 1, shot: 1, pen: 1, fk: 1, cone: 0.45, heavy: 0, gkCpu: 0, gkMine: 0, eager: 1, think: 0, cpuErr: 1, help: 0, keep: 0, win: 0, auto: 0, lane: 0, rate: 0 };
const EASE_END = { pass: 0.4, lob: 0.45, shot: 0.35, pen: 0.5, fk: 0.55, cone: 0.1, heavy: 0.06, gkCpu: 7, gkMine: 4, eager: 0.4, think: 14, cpuErr: 2.2, keep: 0.25, win: 0.15, auto: 0.15, lane: 1.2, rate: -26 };
const INT = new Set(["gkCpu", "gkMine", "think", "rate"]);
// The levers at ease e: for a league pyramid's divisions, or a level of its own.
export function leversAt(e, hz = 60) {
  e = clamp(e, 0, 1);
  const L = { e, hz, help: e >= 0.75 ? 2 : e > 0.2 ? 1 : 0 };
  for (const k of Object.keys(EASE_END)) {
    const v = NEUTRAL[k] + e * (EASE_END[k] - NEUTRAL[k]);
    L[k] = INT.has(k) ? Math.round(v) : Math.round(v * 1000) / 1000;
  }
  return L;
}
export const LEVELS = [
  { id: "beginner", name: "BEGINNER", ...leversAt(0.85, 48) },
  { id: "amateur", name: "AMATEUR", ...leversAt(0.56, 54) },
  { id: "semipro", name: "SEMI-PRO", ...leversAt(0.47) },
  { id: "pro", name: "PROFESSIONAL", ...leversAt(0.38) },
  { id: "worldclass", name: "WORLD CLASS", ...leversAt(0.27) },
  { id: "legendary", name: "LEGENDARY", ...leversAt(0.1) },
];
export const DEFAULT_LEVEL = 0;
const EASY_V1 = { pass: 0.5, lob: 0.55, shot: 0.6, pen: 0.6, fk: 0.65, cone: 0.2, heavy: 0.04, gkCpu: 2, gkMine: 2, eager: 0.7, think: 6, cpuErr: 1, help: 1, keep: 0, win: 0, auto: 0, lane: 0, rate: 0 };
export const levelOf = (cfg) => (Number.isInteger(cfg?.level) && cfg.level >= 0 && cfg.level < LEVELS.length ? cfg.level : DEFAULT_LEVEL);
function leversOf(v, cfg) {
  if (v < 2) return cfg.easy ? EASY_V1 : NEUTRAL;
  return cfg.auto ? NEUTRAL : LEVELS[cfg.level];
}

// v: the rules version (a record replays on its own; 1 is the first release's buttons and EASY MODE).
export function newGame(seed = 1, cfg = {}, v = VERSION) {
  if (!VERSIONS.includes(v)) throw new Error("soccer: a record of another version");
  const half = LENGTHS.includes(cfg.half) ? cfg.half : 4;
  const form = FORMATIONS[cfg.form] ? cfg.form : "442", formB = FORMATIONS[cfg.formB] ? cfg.formB : "442";
  const rows = (r) => { const a = (Array.isArray(r) ? r : []).slice(0, 11); while (a.length < 11) a.push([`stand-in-${a.length}`, "A STAND-IN", 40]); return a; };
  const D = leversOf(v, { easy: cfg.easy, auto: cfg.auto, level: levelOf(cfg) });
  const A = lineUp(rows(cfg.home), form), B = lineUp(rows(cfg.away), formB).map(([k, n, r]) => [k, n, D.rate ? clamp((r | 0) + D.rate, 1, 99) : r]);
  const st = {
    v, seed: seed >>> 0, rng: seed | 0, frame: 0,
    cfg: { half, form, formB, ko: Boolean(cfg.ko), ...(v < 2 ? { easy: Boolean(cfg.easy) } : { level: levelOf(cfg) }), auto: Boolean(cfg.auto), lock: Number.isInteger(cfg.lock) && cfg.lock >= 0 && cfg.lock < 11 ? cfg.lock : -1 },
    p: [...A.map((r, i) => mkPlayer(0, i, r, FORMATIONS[form].slots[i])), ...B.map((r, i) => mkPlayer(1, i, r, FORMATIONS[formB].slots[i]))],
    ball: { x: 0, y: 34, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, own: -1, by: -1, kind: "", recv: -1, id: 0, at: 0, lastT: -1, lastG: -1, tx: 0, ty: 0, rolled: 0 },
    phase: "kickoff", t: 0, half: 1, clock: 0, halfLen: half * 3600, added: -1, stops: 0, firstKick: 0, kickTeam: 0,
    score: [0, 0], pens: null, goals: [],
    stats: { shots: [0, 0], on: [0, 0], poss: [0, 0], fouls: [0, 0], yel: [0, 0], red: [0, 0], off: [0, 0], corners: [0, 0], saves: [0, 0], passes: [0, 0], passOk: [0, 0] },
    ctl: 0, mask: 0, prev: 0, held: { A: 0, B: 0, X: 0, Y: 0 }, rsLast: 0, rsAt: -99, bAt: -99, lbUse: 0, rushGK: false,
    ev: [], note: null, rs: null, ofs: null, plan: null, path: [], pathAt: 0, so: null, poss: -1, possT: -1, aim: null, celebrate: null,
  };
  st.D = D;
  st.firstKick = rnd(st) < 0.5 ? 0 : 1;
  setKickoff(st, st.firstKick);
  return st;
}
const human = (st, P) => P.t === 0 && !st.cfg.auto && P.i === st.ctl;
const alive = (P) => !P.off;
const team = (st, t) => st.p.slice(t * 11, t * 11 + 11);
const gkOf = (st, t) => st.p[t * 11];
const minuteOf = (st) => {
  const base = [0, 0, 45, 90, 105][st.half] ?? 120, span = st.half <= 2 ? 45 : 15, L = st.half <= 2 ? st.halfLen : st.halfLen / 3;
  return base + Math.min(span, Math.floor((st.clock * span) / L)) + (st.clock >= L ? Math.floor(((st.clock - L) * span) / L) : 0);
};
export { minuteOf };
function say(st, k, P = null, extra = {}) { st.ev.push(k); st.note = { k, g: P ? P.g : -1, team: P ? P.t : -1, frame: st.frame, min: minuteOf(st), ...extra }; }

// ---- the ball ----------------------------------------------------------------------------------------
// One step of a free ball (shared by the game and its forecast, st.path).
function ballPhys(b) {
  if (b.z > 0.001 || b.vz > 0) {
    b.vz -= G * DT;
    const s = len(b.vx, b.vy);
    if (s > 0.1) {
      const drag = 1 - 0.0045 * (1 + s / 30);
      b.vx *= drag; b.vy *= drag;
      if (b.spin) { b.vx += (-b.vy / s) * b.spin * DT; b.vy += (b.vx / s) * b.spin * DT; b.spin *= 0.99; }
    }
    b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT;
    if (b.z <= 0) {
      b.z = 0;
      if (b.vz < -1.6) { b.vz = -b.vz * 0.48; b.vx *= 0.82; b.vy *= 0.82; b.spin *= 0.5; } else { b.vz = 0; b.spin = 0; }
    }
  } else {
    const s = len(b.vx, b.vy);
    if (s > 0) {
      const ns = Math.max(0, s - (2.3 + 0.07 * s) * DT), k = ns / s;
      b.vx *= k; b.vy *= k;
      if (b.spin && s > 1) { b.vx += (-b.vy / s) * b.spin * 0.4 * DT; b.vy += (b.vx / s) * b.spin * 0.4 * DT; b.spin *= 0.97; }
    }
    b.x += b.vx * DT; b.y += b.vy * DT;
  }
}
// The ball's next 150 frames, if nobody touches it.
function forecast(st) {
  const b = st.ball, c = { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, spin: b.spin }, out = [];
  for (let k = 0; k < 150; k++) { ballPhys(c); out.push(c.x, c.y, c.z); }
  st.path = out; st.pathAt = st.frame;
}
// The forecast k frames from now -> [x, y, z].
function ahead(st, k) {
  const i = clamp(k + (st.frame - st.pathAt), 0, 149) * 3, p = st.path;
  if (!p.length) return [st.ball.x, st.ball.y, st.ball.z];
  return [p[i], p[i + 1], p[i + 2]];
}
// The ground speed a pass needs to cover d metres and arrive at `end` m/s (the roll's deceleration).
const passSpeed = (d, end = 7) => Math.sqrt(end * end + 2 * (2.3 + 0.07 * (end + 4)) * d * 1.06);
// A lofted ball from (b) landing at (tx, ty) in T frames, ignoring drag (corrected a little).
function loft(b, tx, ty, tz, T) {
  const s = T / HZ, dx = tx - b.x, dy = ty - b.y;
  b.vx = (dx / s) * 1.06; b.vy = (dy / s) * 1.06; b.vz = (tz - b.z) / s + (G * s) / 2;
}

// The kick. P plays the ball: velocity, kind ("pass" | "through" | "lob" | "cross" | "shot" | "clear" |
// "throw" | "corner" | "gk" | "fk" | "pen" | "header"), the intended receiver (or -1).
function kick(st, P, vx, vy, vz, kind, recv = -1, spin = 0, restart = false) {
  const b = st.ball;
  b.own = -1; b.vx = vx; b.vy = vy; b.vz = vz; b.spin = spin; b.kind = kind; b.recv = recv; b.by = P.g; b.at = st.frame; b.id++;
  b.lastT = P.t; b.lastG = P.g; b.rolled = 0; b.z = Math.max(b.z, vz > 0 ? 0.05 : 0); b.deflect = false;
  P.cool = 14; P.act = { kind: "kick", f: 0 };
  if (!restart) offsideSnap(st, P); else st.ofs = null;
  if (kind !== "shot" && kind !== "pen" && kind !== "clear" && kind !== "header-shot") st.stats.passes[P.t]++;
  st.plan = null;
  forecast(st);
  if (recv >= 0 && st.p[recv].t === 0 && !st.cfg.auto && st.cfg.lock < 0 && st.p[recv].i !== 0) st.ctl = st.p[recv].i;   // the pass takes control with it
  if (kind === "shot" || kind === "pen" || kind === "header-shot" || kind === "fk-shot") shotTaken(st, P);
}
function own(st, P) {
  const b = st.ball;
  if (b.own !== P.g) {
    if (b.kind && b.kind !== "shot" && b.lastT === P.t && b.by !== P.g && st.p[b.by] && !b.deflect) st.stats.passOk[P.t]++;
    touch(st, P);
  }
  b.own = P.g; b.kind = ""; b.recv = -1; b.spin = 0; b.z = 0; b.vz = 0; b.lastT = P.t; b.lastG = P.g;
  P.think = Math.min(P.think, 6);
  st.plan = null;
  if (P.t === 0 && !st.cfg.auto && st.cfg.lock < 0 && P.i !== 0) st.ctl = P.i;
}
// Any touch by P: the offside snapshot is judged, then forgotten (a save does not reset it).
function touch(st, P, save = false) {
  const o = st.ofs;
  if (o && o.team === P.t && (o.set & (1 << P.i))) { offside(st, P); return true; }
  if (o && (o.team === P.t || !save)) st.ofs = null;
  st.ball.lastT = P.t; st.ball.lastG = P.g;
  return false;
}

// ---- offside -------------------------------------------------------------------------------------------
// The line for team T's attackers: the second-last opponent (the keeper counts), the ball, or halfway,
// whichever is furthest forward, in T's direction.
export function offsideLine(st, T) {
  const us = [];
  for (const Q of team(st, 1 - T)) if (alive(Q)) us.push(uOf(st, T, Q.x));
  us.sort((a, b) => b - a);
  return Math.max(us[1] ?? 0, uOf(st, T, st.ball.x), 0);
}
function offsideSnap(st, P) {
  const line = offsideLine(st, P.t);
  let set = 0;
  for (const Q of team(st, P.t)) if (Q !== P && alive(Q) && uOf(st, P.t, Q.x) > line + 0.15) set |= 1 << Q.i;
  st.ofs = set ? { team: P.t, set } : null;
}
function offside(st, P) {
  st.ofs = null; st.stats.off[P.t]++;
  say(st, "offside", P);
  restart(st, "ifk", 1 - P.t, P.x, P.y, 50);
}

// ---- set pieces ------------------------------------------------------------------------------------
function place(P, x, y) { P.x = x; P.y = y; P.vx = 0; P.vy = 0; P.z = 0; P.act = null; P.run = null; P.stun = 0; }
function setKickoff(st, T) {
  st.phase = "kickoff"; st.t = 0; st.kickTeam = T; st.rs = null; st.ofs = null; st.plan = null; st.celebrate = null;
  for (const P of st.p) {
    if (!alive(P)) continue;
    let u = clamp(P.su + 6, -50, -2), v = P.sv;
    if (P.t !== T && len(u, v - 34) < P_.circle + 0.8) u = -P_.circle - 1;
    if (P.t === T && P.role !== "GK" && u > -12 && (P.role === "FW" || P.role === "WF")) u = -1;
    place(P, xOf(st, P.t, u), yOf(st, P.t, v));
    P.fx = att(st, P.t); P.fy = 0;
  }
  const fw = team(st, T).filter(P => alive(P) && P.role !== "GK").sort((a, b) => uOf(st, T, b.x) - uOf(st, T, a.x) || a.i - b.i)[0];
  place(fw, -att(st, T) * 0.3, 34);
  Object.assign(st.ball, { x: 0, y: 34, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, own: fw.g, kind: "", recv: -1 });
  st.taker = fw.g;
  if (T === 0 && !st.cfg.auto && st.cfg.lock < 0) st.ctl = fw.i;
  forecast(st);
}
// A restart: type "throw" | "corner" | "goal" (goal kick) | "fk" | "ifk" | "pen"; to team T at (x, y).
export function restart(st, type, T, x, y, wait = 0) {
  const b = st.ball;
  st.phase = "dead"; st.t = 0; st.ofs = null; st.plan = null;
  Object.assign(b, { x, y, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, own: -1, kind: "", recv: -1 });
  let taker;
  const mine = team(st, T).filter(P => alive(P) && P.role !== "GK");
  const nearest = (L) => L.reduce((a, P) => (len(P.x - x, P.y - y) < len(a.x - x, a.y - y) ? P : a));
  if (type === "goal") taker = gkOf(st, T);
  else if (type === "pen") taker = mine.reduce((a, P) => (P.shoot > a.shoot ? P : a));
  else if (type === "corner") taker = mine.reduce((a, P) => (P.pass + (P.role === "WM" || P.role === "CM" ? 0.1 : 0) > a.pass + (a.role === "WM" || a.role === "CM" ? 0.1 : 0) ? P : a));
  else if (type === "fk" && fkShootable(st, T, x, y)) taker = mine.reduce((a, P) => (P.shoot + P.pass > a.shoot + a.pass ? P : a));
  else taker = nearest(mine.length ? mine : [gkOf(st, T)]);
  if (type === "goal") { const a = att(st, T); b.x = -a * (P_.hx - 5.5); b.y = 34 + (y > 34 ? 4 : -4); }
  if (type === "corner") { b.x = x > 0 ? P_.hx - 0.4 : -P_.hx + 0.4; b.y = y > 34 ? P_.w - 0.4 : 0.4; }
  if (type === "pen") { const a = att(st, T); b.x = a * (P_.hx - P_.spot); b.y = 34; }
  if (type === "throw") { b.y = y > 34 ? P_.w : 0; b.x = clamp(x, -P_.hx + 1, P_.hx - 1); }
  b.x = clamp(b.x, -P_.hx + 0.3, P_.hx - 0.3); b.y = clamp(b.y, 0, P_.w);
  // the taker stands at the ball, behind it
  const a = att(st, T), back = type === "throw" ? [0, b.y > 34 ? 0.4 : -0.4] : type === "corner" ? [b.x > 0 ? 0.6 : -0.6, b.y > 34 ? 0.6 : -0.6] : [-a * 1.2, 0];
  place(taker, b.x + back[0], b.y + back[1]);
  const fx = (type === "corner" || type === "throw" ? 34 - b.y : 0) ? 0 : a, fy = type === "corner" || type === "throw" ? (b.y > 34 ? -1 : 1) : 0;
  taker.fx = type === "corner" || type === "throw" ? 0 : fx; taker.fy = fy; if (!taker.fx && !taker.fy) taker.fx = a;
  st.rs = { type, team: T, taker: taker.g, wait: Math.max(wait, { throw: 30, corner: 75, goal: 60, fk: 70, ifk: 50, pen: 90 }[type] || 40), x: b.x, y: b.y, cpuAt: 0 };
  st.stops++;
  if (type === "corner") st.stats.corners[T]++;
  if (type === "pen" || type === "fk") { setWall(st); }
  if (T === 0 && !st.cfg.auto && st.cfg.lock < 0) st.ctl = taker.i;
  st.aim = type === "fk" && fkShootable(st, T, b.x, b.y) || type === "pen" ? { y: 34, z: type === "pen" ? 0.6 : 1.4, curl: 0 } : null;
  if (type === "pen") for (const P of st.p) if (alive(P) && P !== taker && P.role !== "GK") {
    // everyone outside the area, behind the ball
    const u = uOf(st, T, P.x);
    if (u > P_.hx - P_.boxD - 1.5) place(P, xOf(st, T, P_.hx - P_.boxD - 2.5 - (P.i % 4)), clamp(P.y, 14, 54));
  }
  if (type === "pen") { const K = gkOf(st, 1 - T); place(K, a * (P_.hx - 0.2), 34); K.fx = -a; K.fy = 0; }
  forecast(st);
}
export function fkShootable(st, T, x, y) {
  const a = att(st, T), dx = P_.hx - a * x, dy = Math.abs(y - 34);
  return dx > 0 && dx < 33 && len(dx, dy) < 34 && dy < dx * 1.1 + 6 && !(dx < P_.boxD && dy < P_.boxW);
}
// The wall: 2-5 of the defending side 9.15 m from the ball on the line to the near post, shoulder to shoulder.
function setWall(st) {
  const rs = st.rs, b = st.ball, D = 1 - rs.team, a = att(st, rs.team);
  st.wall = null;
  if (rs.type !== "fk" || !fkShootable(st, rs.team, b.x, b.y)) return;
  const gx = a * P_.hx, gy = 34 + (b.y > 34 ? 1.8 : -1.8) * 0, dx = gx - b.x, dy = gy - b.y, d = len(dx, dy);
  const ux = dx / d, uy = dy / d, n = d < 22 ? 5 : d < 27 ? 4 : 3;
  const cx = b.x + ux * 9.15, cy = b.y + uy * 9.15, px = -uy, py = ux;
  // shifted to cover the near post side
  const side = b.y > 34 ? -1 : 1, shift = (n - 1) * 0.3 * side * (Math.abs(b.y - 34) > 6 ? 1 : 0);
  const men = team(st, D).filter(P => alive(P) && P.role !== "GK").sort((p, q) => len(p.x - cx, p.y - cy) - len(q.x - cx, q.y - cy)).slice(0, n);
  men.forEach((P, k) => { const o = (k - (n - 1) / 2) * 0.6 + shift; place(P, cx + px * o, cy + py * o); P.fx = -ux; P.fy = -uy; P.wall = true; });
  st.wall = { g: men.map(P => P.g), cx, cy, px, py, n, id: -1 };
}

// ---- shots and the keeper ------------------------------------------------------------------------------
function shotTaken(st, P) {
  st.stats.shots[P.t]++;
  st.lastShot = { g: P.g, t: P.t, frame: st.frame, id: st.ball.id };
  keeperPlan(st, P.t);
  say(st, "shot", P);
}
// Where the ball meets the goal line of the side team T attacks (from the forecast) -> {f, y, z} | null.
function crossing(st, T, plane = null) {
  const a = att(st, T), gx = plane ?? a * P_.hx, p = st.path;
  for (let k = 0; k < 149; k++) {
    const x0 = p[k * 3], x1 = p[k * 3 + 3];
    if ((x1 - gx) * a >= 0 && (x0 - gx) * a < 0) {
      const w = (gx - x0) / (x1 - x0 || 1e-9);
      return { f: k + 1, y: p[k * 3 + 1] + (p[k * 3 + 4] - p[k * 3 + 1]) * w, z: p[k * 3 + 2] + (p[k * 3 + 5] - p[k * 3 + 2]) * w };
    }
  }
  return null;
}
export const onTarget = (c) => Boolean(c && Math.abs(c.y - 34) < P_.gw - 0.11 && c.z < P_.bar - 0.11);
// The keeper reads the shot: whether he gets there and what he does with it, decided once from the
// shot (its speed, where it crosses his line, his rating and how far he must go); played out by the
// dive and the save when the ball arrives.
function keeperPlan(st, T) {
  const K = gkOf(st, 1 - T), b = st.ball;
  st.plan = null;
  if (!alive(K)) return;
  const gl = crossing(st, T);
  if (!onTarget(gl)) { st.plan = { k: K.g, miss: true, id: b.id, f: gl ? st.frame + gl.f : st.frame + 60, y: gl?.y ?? 34, z: gl?.z ?? 1 }; return; }
  const kc = crossing(st, T, K.x) || gl;
  const sp = len(b.vx, b.vy), react = Math.round(3 + (1 - K.gk) * 5 + (T === 0 && !st.cfg.auto ? st.D.gkCpu : 0) - (T === 1 ? st.D.gkMine : 0));
  const dy = Math.abs(kc.y - K.y), dz = kc.z > 1.7 ? (kc.z - 1.7) * 1.1 : 0, need = dy + dz;
  const ta = Math.max(0, (kc.f - react) / HZ), reach = Math.min(3.1 + 0.5 * K.gk, 1.75 + (4.5 + 2 * K.gk) * ta);
  let save = false, hold = false;
  if (need <= reach) {
    const q = need / reach;
    const p = clamp(0.96 + 0.1 * K.gk - 0.32 * q * q * clamp(0.5 / (ta + 0.15), 0.45, 1.3) - 0.008 * Math.max(0, sp - 22) - (kc.f < 14 ? 0.06 : 0), 0.04, 0.97);
    save = rnd(st) < p;
    hold = save && sp < 25 + 6 * K.gk && need < 1.5 && rnd(st) < 0.8;
  }
  st.plan = { k: K.g, id: b.id, f: st.frame + kc.f, react: st.frame + react, y: kc.y, z: kc.z, save, hold, sp };
}
// The keeper's moment: the planned save, when the ball reaches his line.
function keeperAct(st) {
  const pl = st.plan, b = st.ball;
  if (!pl || pl.miss || pl.id !== b.id || b.own >= 0) return;
  const K = st.p[pl.k];
  if (st.frame >= pl.react && !K.act) {
    const dy = pl.y - K.y;
    if (Math.abs(dy) > 0.7 || pl.z > 1.9) K.act = { kind: "dive", f: 0, dir: dy > 0 ? 1 : -1, y0: K.y, y1: clamp(pl.y, K.y - 3.4, K.y + 3.4), n: Math.max(6, pl.f - st.frame), hi: pl.z > 1.3 };
    else K.act = { kind: "set", f: 0 };
  }
  if (st.frame < pl.f) return;
  st.plan = null;
  if (!pl.save) { if (K.act?.kind === "dive") K.act.late = true; return; }
  st.stats.saves[K.t]++; st.stats.on[1 - K.t]++;   // on target: saved or scored
  touch(st, K, true);
  if (pl.hold) {
    b.x = K.x + att(st, K.t) * 0.3; b.y = K.y; own(st, K); b.z = 1;
    K.hold = 0; K.act = { kind: "hold", f: 0 };
    say(st, "catch", K);
  } else {
    // parried: back out and wide, sometimes round the post
    const a = att(st, K.t), side = pl.y >= 34 ? 1 : -1, wide = rnd(st);
    b.x = K.x + a * 0.4; b.y = pl.y;
    b.vx = a * (3 + rnd(st) * 6); b.vy = side * (2 + wide * 9); b.vz = 1 + rnd(st) * 3.5; b.spin = 0;
    if (wide > 0.42) { b.vx = -a * (2 + rnd(st) * 3); b.vy = side * (5 + rnd(st) * 4); }   // tipped round the post
    b.kind = "parry"; b.recv = -1; b.id++; b.at = st.frame; b.rolled = 0; b.by = K.g; b.lastT = K.t; b.lastG = K.g; b.deflect = true;
    K.cool = 20;
    forecast(st);
    say(st, "save", K);
  }
}

// ---- fouls and cards -----------------------------------------------------------------------------------
// A foul by O on V. sev: 0 careless, 1 reckless, 2 serious; dogso: denied an obvious goal-scoring chance.
export function foul(st, O, V, sev = 0, dogso = false) {
  st.stats.fouls[O.t]++;
  const a = att(st, V.t), u = uOf(st, V.t, V.x), inBox = u > P_.hx - P_.boxD && Math.abs(V.y - 34) < P_.boxW;
  let card = null;
  if (sev >= 2 || (dogso && !inBox && rnd(st) < 0.15)) card = "red";
  else if (sev >= 1 || dogso) card = "yellow";
  if (card === "yellow" && O.yc && !dogso && sev < 1 && rnd(st) < 0.7) card = null;   // a booked man gets a word, once
  if (card === "yellow") {
    O.yc++; st.stats.yel[O.t]++;
    if (O.yc >= 2) { card = "second"; st.stats.red[O.t]++; sendOff(st, O); }
  } else if (card === "red") { st.stats.red[O.t]++; sendOff(st, O); }
  say(st, inBox ? "penfoul" : "foul", O, { card, victim: V.g });
  st.stops += card ? 2 : 1;
  V.stun = 30; V.act = { kind: "down", f: 0, n: 40 };
  if (inBox) restart(st, "pen", V.t, a * (P_.hx - P_.spot), 34, 80);
  else restart(st, "fk", V.t, V.x, V.y, card ? 110 : 60);
  return card;
}
function sendOff(st, O) {
  O.off = true; O.act = null; O.x = 0; O.y = -6; O.vx = 0; O.vy = 0;
  if (st.ball.own === O.g) st.ball.own = -1;
  if (O.t === 0 && st.ctl === O.i) { const q = team(st, 0).find(P => alive(P) && P.role !== "GK"); if (q) st.ctl = q.i; }
  if (O.t === 0 && st.cfg.lock === O.i) st.cfg.lock = -1;
}
// Is V through on goal? (nobody but the keeper between him and the goal, within 30 m, ball at his feet)
function dogsoOf(st, V) {
  const a = att(st, V.t), u = uOf(st, V.t, V.x);
  if (u < P_.hx - 32 || st.ball.own !== V.g) return false;
  for (const Q of team(st, 1 - V.t)) if (alive(Q) && Q.role !== "GK" && uOf(st, V.t, Q.x) > u - 1 && Math.abs(Q.y - V.y) < 14) return false;
  return Math.abs(V.y - 34) < 22 && a !== 0;
}

// ---- challenges ----------------------------------------------------------------------------------------
// From behind: the tackler is behind the carrier's back.
function behindness(O, V) {
  const dx = O.x - V.x, dy = O.y - V.y, d = len(dx, dy) || 1, vs = len(V.vx, V.vy);
  const fx = vs > 0.5 ? V.vx / vs : V.fx, fy = vs > 0.5 ? V.vy / vs : V.fy;
  return -(dx * fx + dy * fy) / d;   // 1: straight behind, -1: head on
}
function standingTackle(st, O) {
  const b = st.ball, V = b.own >= 0 ? st.p[b.own] : null;
  if (!V || V.t === O.t) return;
  const d = len(b.x - O.x, b.y - O.y), dv = len(V.x - O.x, V.y - O.y);
  if (d > 1.45 && dv > 1.3) return;
  const beh = behindness(O, V), shield = V.act?.kind === "roulette" ? 0.4 : 1, tight = V.close ? -0.12 : 0, loose = V.sprint ? 0.12 : 0;
  const p = clamp((0.5 + 0.42 * O.def - 0.55 * V.drib + loose + tight - (beh > 0.4 ? 0.25 : 0) + (O.jockeyF > 20 ? 0.1 : 0) + (d < 0.9 ? 0.1 : 0)) * shield - (V.t === 0 && !st.cfg.auto ? st.D.keep : 0) + (O.t === 0 && !st.cfg.auto ? st.D.win : 0), 0.05, 0.9);
  const r = rnd(st);
  O.act.done = true;
  if (r < p) {
    // won it: the ball pops loose toward the tackler's side, or he takes it
    st.stats.tackles = (st.stats.tackles || 0) + 1;
    if (rnd(st) < 0.5 + 0.3 * O.def) { b.x = O.x + O.fx * 0.5; b.y = O.y + O.fy * 0.5; own(st, O); }
    else { const edge = V.y < 5 ? -1 : V.y > P_.w - 5 ? 1 : 0; loose_(st, O, O.fx * 5 + (rnd(st) - 0.5) * 7, O.fy * 5 + (rnd(st) - 0.5) * 7 + edge * (2 + rnd(st) * 5), 0); }   // by the line it often goes out
    V.stun = 12;
    say(st, "tackle", O);
    return;
  }
  const pf = (beh > 0.4 ? 0.42 : d > 1.15 ? 0.15 : 0.06) * (inOwnBox(st, O) ? 0.55 : 1);   // more careful in his own area
  if (rnd(st) < pf) { foul(st, O, V, beh > 0.55 && rnd(st) < 0.2 ? 1 : 0, dogsoOf(st, V) && beh > 0.2); return; }
  O.stun = 22;   // missed, off balance
}
function slideContact(st, O) {
  const b = st.ball, V = b.own >= 0 ? st.p[b.own] : null;
  // the ball first?
  const fxp = O.x + O.fx * 1.0, fyp = O.y + O.fy * 1.0;
  const db = len(b.x - fxp, b.y - fyp);
  if (b.z < 0.5 && db < 1.0 && (!V || V.t !== O.t)) {
    const beh = V ? behindness(O, V) : -1;
    if (!V || rnd(st) < clamp(0.55 + 0.35 * O.def - 0.25 * (V?.drib || 0) - (beh > 0.4 ? 0.3 : 0), 0.08, 0.9)) {
      O.act.done = true;
      if (V) V.stun = 30;
      touch(st, O);
      loose_(st, O, O.fx * 7 + (rnd(st) - 0.5) * 3, O.fy * 7 + (rnd(st) - 0.5) * 3, 0.5);
      say(st, "slide", O);
      if (V && beh > 0.55 && rnd(st) < 0.25) { foul(st, O, V, 0, false); }
      return;
    }
  }
  if (V && V.t !== O.t && len(V.x - fxp, V.y - fyp) < 0.9) {
    O.act.done = true;
    const beh = behindness(O, V), sp = len(O.vx, O.vy);
    const sev = beh > 0.5 ? (rnd(st) < 0.015 + 0.02 * (sp > 6) ? 2 : rnd(st) < 0.5 ? 1 : 0) : rnd(st) < 0.15 ? 1 : 0;
    foul(st, O, V, sev, dogsoOf(st, V));
  }
}
function shoulder(st, O) {
  const b = st.ball, V = b.own >= 0 ? st.p[b.own] : null;
  if (!V || V.t === O.t || len(V.x - O.x, V.y - O.y) > 1.3) return;
  O.act.done = true;
  const beh = behindness(O, V);
  if (beh > 0.5 && rnd(st) < 0.45) { foul(st, O, V, 0, false); return; }
  if (rnd(st) < clamp(0.32 + 0.45 * (O.phys - V.phys) + 0.1 * O.def, 0.08, 0.75)) { V.stun = 18; loose_(st, O, V.vx * 0.8 + O.fx * 2, V.vy * 0.8 + O.fy * 2, 0); say(st, "shoulder", O); }
  else O.stun = 12;
}
function loose_(st, P, vx, vy, vz) {
  const b = st.ball;
  b.own = -1; b.vx = vx; b.vy = vy; b.vz = vz; b.spin = 0; b.kind = "loose"; b.recv = -1; b.id++; b.at = st.frame; b.rolled = 0; b.by = P.g; b.lastT = P.t; b.lastG = P.g; b.deflect = true;
  st.plan = null;
  forecast(st);
}

// ---- skill moves --------------------------------------------------------------------------------------
// kind -> the carrier's move, if his stars allow it; else a stumble. Defenders near enough may bite.
function skill(st, P, kind, dx, dy) {
  if (P.act || P.stun) return;
  const need = SKILLS[kind] || 5;
  if (P.stars < need) {
    P.act = { kind: "stumble", f: 0, n: 26 };
    if (rnd(st) < 0.35) loose_(st, P, P.fx * 3, P.fy * 3, 0);
    say(st, "stumble", P);
    return;
  }
  const n = { stepover: 20, ballroll: 18, roulette: 24, heelflick: 16, fakeshot: 16 }[kind];
  P.act = { kind, f: 0, n, dx, dy };
  const a = att(st, P.t);
  if (kind === "heelflick") { const b = st.ball; loose_(st, P, (dx || a) * 8.5, dy * 8.5, 0.6); b.recv = P.g; P.cool = 10; P.burst = 40; }
  // who bites: opponents within 4 m in front of him
  for (const Q of team(st, 1 - P.t)) {
    if (!alive(Q) || Q.role === "GK" || Q.stun) continue;
    const d = len(Q.x - P.x, Q.y - P.y);
    if (d > 4.2) continue;
    const p = clamp(0.25 + 0.09 * P.stars + 0.15 * P.drib - 0.4 * Q.def + (kind === "fakeshot" ? 0.12 : 0), 0.05, 0.85);
    if (rnd(st) < p) { Q.stun = kind === "fakeshot" ? 24 : 20; Q.fooled = 1; }
  }
  say(st, kind, P);
}

// ---- the human's player --------------------------------------------------------------------------------
const dirIn = (m) => { let x = 0, y = 0; if (m & BTN.RIGHT) x++; if (m & BTN.LEFT) x--; if (m & BTN.UP) y++; if (m & BTN.DOWN) y--; const l = len(x, y); return l ? [x / l, y / l] : null; };
const rsIn = (m) => { let x = 0, y = 0; if (m & BTN.RR) x++; if (m & BTN.RL) x--; if (m & BTN.RU) y++; if (m & BTN.RD) y--; const l = len(x, y); return l ? [x / l, y / l] : null; };
// The teammate a direction points at (FC's assisted passing): angle first, then distance and space.
function mateToward(st, P, dx, dy, opts = {}) {
  let best = null, bs = -1e9;
  for (const Q of team(st, P.t)) {
    if (Q === P || !alive(Q) || (Q.role === "GK" && !opts.gk)) continue;
    const ox = Q.x - P.x, oy = Q.y - P.y, d = len(ox, oy);
    if (d < 2.5 || d > (opts.max || 50)) continue;
    const c = (ox * dx + oy * dy) / d;
    if (c < (opts.cone ?? 0.45)) continue;
    const s = c * 3 - d / (opts.far ? 40 : 18) + (opts.fwd ? uOf(st, P.t, Q.x) / 40 : 0) - (opts.runner && !Q.run ? 0.3 : 0) + (opts.lane ? opts.lane * clamp(laneMargin(st, 1 - P.t, P.x, P.y, Q.x, Q.y, 12), -3, 2) : 0);
    if (s > bs) { bs = s; best = Q; }
  }
  return best;
}
// The ground pass to Q (or the spot): its error by the passer's rating, the pressure on him and his body shape.
function passTo(st, P, tx, ty, Q, kind = "pass", power = 0) {
  const d = len(tx - P.x, ty - P.y) || 1, ux = (tx - P.x) / d, uy = (ty - P.y) / d;
  const pr = pressureOn(st, P), shape = clamp(-(ux * P.fx + uy * P.fy), 0, 1);
  const easy = P.t === 0 && !st.cfg.auto ? st.D.pass : st.D.cpuErr;
  const err = (0.02 + 0.12 * (1 - P.pass)) * (1 + 0.9 * pr + 0.7 * shape) * easy;
  const e = gauss(st) * err, ex = ux - uy * e, ey = uy + ux * e, el = len(ex, ey);
  const sp = clamp(passSpeed(d, kind === "through" ? 5.5 : 7.5) * (1 + gauss(st) * 0.05 * (1 - P.pass)) + power * 3, 6, 30);
  kick(st, P, (ex / el) * sp, (ey / el) * sp, 0, kind, Q ? Q.g : -1);
  say(st, kind === "through" ? "through" : "pass", P);
}
function lobTo(st, P, tx, ty, Q, kind = "lob", hi = 1) {
  if (kind === "cross") {
    let O = null, od = 2.2;
    for (const Z of team(st, 1 - P.t)) if (alive(Z) && !Z.stun) { const d = len(Z.x - P.x, Z.y - P.y); if (d < od && (Z.x - P.x) * (tx - P.x) + (Z.y - P.y) * (ty - P.y) > 0) { od = d; O = Z; } }
    if (O && rnd(st) < 0.55 * (1 - od / 2.2) + 0.2 * O.def) {
      // charged down: the ball spins off him, usually behind for a corner
      const a = att(st, P.t);
      st.ball.x = P.x; st.ball.y = P.y;
      kick(st, P, 0, 0, 0, "cross", -1); st.stats.passes[P.t]--;
      touch(st, O); loose_(st, O, a * (4 + rnd(st) * 7), (P.y > 34 ? 1 : -1) * (rnd(st) * 4 - 1), 1 + rnd(st) * 2.5);
      say(st, "block", O);
      return;
    }
  }
  const d = len(tx - P.x, ty - P.y) || 1;
  const pr = pressureOn(st, P), easy = P.t === 0 && !st.cfg.auto ? st.D.lob : st.D.cpuErr;
  const err = (0.4 + 1.6 * (1 - P.pass)) * (1 + pr) * (0.5 + d / 40) * easy;
  const ex = tx + gauss(st) * err, ey = ty + gauss(st) * err;
  const T = Math.round(clamp((0.75 + d / 24) * hi, 0.7, 2.4) * HZ);
  const b = st.ball, sb = { x: b.x, y: b.y, z: b.z };
  loft(sb, ex, ey, kind === "cross" ? 1.6 : 0.4, T);
  kick(st, P, sb.vx, sb.vy, sb.vz, kind, Q ? Q.g : -1, kind === "cross" ? (ey > P.y ? 1 : -1) * (rnd(st) * 1.5) * 0 : 0);
  say(st, kind, P);
}
// The shot: power 0..1, aim: target y on the goal line (or null: the far corner), kind "shot" | "finesse" | "chip".
function shoot(st, P, power, aimY = null, kind = "drive", aimZ = null) {
  const a = att(st, P.t), gx = a * P_.hx, b = st.ball;
  const dx = gx - P.x, dy = 34 - P.y, d = len(dx, dy);
  if (aimY === null) aimY = 34 + (P.y < 34 ? 1 : -1) * 2.6;   // across the keeper, to the far post
  const pr = pressureOn(st, P), ux = dx / d, uy = dy / d;
  const shape = clamp(1 - (ux * P.fx + uy * P.fy), 0, 1.6);   // shooting across or behind the body
  const easy = P.t === 0 && !st.cfg.auto ? st.D.shot : st.D.cpuErr;
  const over = power > 0.82 ? 1 + (power - 0.82) * 6 : 1, weak = power < 0.25 ? 1.2 : 1;
  let err = d * (1 + d / 30) * (0.058 + 0.108 * (1 - P.shoot)) * (1 + 1.9 * pr) * (1 + 0.45 * shape) * over * weak * easy;
  if (kind === "finesse") err *= 0.75;
  if (kind === "header") err *= 1.5;
  let ty = aimY + gauss(st) * err, tz = aimZ ?? (0.25 + power * 1.3 + (kind === "chip" ? 0 : 0));
  tz += Math.abs(gauss(st)) * err * 0.5 * over + (power > 0.9 ? (power - 0.9) * 9 : 0);
  let speed = kind === "finesse" ? 15 + power * 11 : kind === "chip" ? 11 + power * 6 : kind === "header" ? 12 + power * 6 : 15 + power * 17;
  speed *= 0.9 + 0.12 * P.shoot;
  const tdx = gx - b.x, tdy = ty - b.y, td = len(tdx, tdy), T = td / speed;
  let vx = (tdx / td) * speed, vy = (tdy / td) * speed, vz = (tz - b.z) / T + (G * T) / 2;
  let spin = 0;
  if (kind === "finesse") {
    // curled: start it outside the target and let the spin bring it back (the same drift as a free kick)
    const side = ty > b.y ? 1 : -1;
    spin = -a * side * 3.2;
    const lateral = spin * T * T * 0.45, px = -tdy / td, py = tdx / td;
    const ax = gx - px * lateral, ay = ty - py * lateral, ad = len(ax - b.x, ay - b.y);
    vx = ((ax - b.x) / ad) * speed; vy = ((ay - b.y) / ad) * speed;
  }
  if (kind === "chip") { vz = (tz - b.z) / T + (G * T) / 2 + 2.5 + power * 2; }
  kick(st, P, vx, vy, vz, kind === "header" ? "header-shot" : "shot", -1, spin);
  if (kind === "header") say(st, "header", P);
}
export function pressureOn(st, P) {
  let c = 99;
  for (const Q of team(st, 1 - P.t)) if (alive(Q)) { const d = len(Q.x - P.x, Q.y - P.y); if (d < c) c = d; }
  return clamp(1 - (c - 0.8) / 3.2, 0, 1);
}

function humanPlay(st, P, pressed) {
  const m = st.mask, b = st.ball, has = b.own === P.g, a = att(st, P.t);
  const dir = dirIn(m), rs = rsIn(m), rsNew = rs && !rsIn(st.prev);
  const released = st.prev & ~m, v2 = st.v >= 2;
  // v2 (FC): LB is the chip and lobbed-through modifier, and a tap of it on its own triggers a run;
  // v1: LT was the modifier and LB the run on the press.
  const MOD = v2 ? BTN.LB : BTN.LT;
  if (v2) st.rushGK = false;
  if (v2) { if (pressed & BTN.LB) st.lbUse = 0; if (m & BTN.LB && pressed & (BTN.A | BTN.B | BTN.X | BTN.Y)) st.lbUse = 1; }
  // the held buttons: power bars
  for (const k of ["B", "X", "Y"]) st.held[k] = m & BTN[k] ? st.held[k] + 1 : 0;
  P.sprint = Boolean(m & BTN.RT); P.close = Boolean(m & BTN.LT) && has; P.jockey = Boolean(m & BTN.LT) && !has;
  if (P.stun || (P.act && P.act.kind !== "kick" && P.act.kind !== "contain")) { P.wantX = 0; P.wantY = 0; return; }
  const sp = P.close ? 0.55 : P.sprint ? 1 : 0.72;
  P.wantX = dir ? dir[0] * P.spd * sp : 0; P.wantY = dir ? dir[1] * P.spd * sp : 0;
  P.manual = Boolean(dir);
  if (has) {
    if (released & BTN.B && st.shotArm) {
      const pw = Math.min(1, st.shotArm.f / SHOT_FULL), aimY = dir && Math.abs(dir[1]) > 0.3 ? 34 + (dir[1] > 0 ? 1 : -1) * 2.9 : null;
      const kind = m & BTN.RB || st.shotArm.rb ? "finesse" : m & MOD || st.shotArm.lt ? "chip" : "drive";
      st.shotArm = null; shoot(st, P, pw, aimY, kind); return;
    }
    if (m & BTN.B) {
      if (!st.shotArm) st.shotArm = { f: 0, rb: Boolean(m & BTN.RB), lt: Boolean(m & MOD), at: st.frame };
      st.shotArm.f++;
      if (pressed & BTN.A && st.shotArm.f < 10) { st.shotArm = null; skill(st, P, "fakeshot", 0, 0); return; }
      P.wantX *= 0.6; P.wantY *= 0.6;
      return;
    }
    st.shotArm = null;
    if (pressed & BTN.A) {
      const d = dir || [P.fx, P.fy], Q = mateToward(st, P, d[0], d[1], { cone: st.D.cone, lane: st.D.lane }) || mateToward(st, P, d[0], d[1], { cone: -0.3 });
      if (Q) passTo(st, P, Q.x + Q.vx * 0.3, Q.y + Q.vy * 0.3, Q); else passTo(st, P, P.x + d[0] * 15, P.y + d[1] * 15, null);
      return;
    }
    if (released & BTN.Y) {
      const d = dir || [a, 0], Q = mateToward(st, P, d[0], d[1], { cone: 0.2, fwd: true, far: true }) || mateToward(st, P, a, 0, { cone: -0.2, fwd: true, far: true });
      const pw = Math.min(1, (st.yHeld || 0) / THRU_FULL);
      if (Q) {
        const lead = 5 + pw * 10, rx = Q.run ? (Q.run.tx - Q.x) : a, ry = Q.run ? (Q.run.ty - Q.y) : 0, rl = len(rx, ry) || 1;
        let tx = Q.x + (rx / rl) * lead, ty = Q.y + (ry / rl) * lead;
        tx = clamp(tx, -P_.hx + 2, P_.hx - 2); ty = clamp(ty, 2, P_.w - 2);
        Q.run = { ...(Q.run || { f: 12, n: 80 }), tx, ty };
        if (m & MOD || st.ltOnY) lobTo(st, P, tx, ty, Q, "through-lob"); else passTo(st, P, tx, ty, Q, "through", pw * 0.6);
      } else passTo(st, P, P.x + d[0] * 18, P.y + d[1] * 18, null, "through");
      return;
    }
    if (m & BTN.Y) { st.yHeld = st.held.Y; st.ltOnY = Boolean(m & MOD); }
    if (released & BTN.X) {
      const pw = Math.min(1, (st.xHeld || 0) / LOB_FULL), u = uOf(st, P.t, P.x), wide = Math.abs(P.y - 34) > 13;
      if (u > 22 && wide) {
        // a cross: to the head the stick points at, else the best placed in the box
        const tgt = boxTarget(st, P, dir);
        lobTo(st, P, tgt[0], tgt[1], tgt[2], "cross", 0.85 + pw * 0.3);
      } else {
        const d = dir || [P.fx, P.fy], Q = mateToward(st, P, d[0], d[1], { cone: 0.3, far: true, max: 60 });
        if (Q) lobTo(st, P, Q.x + Q.vx * 0.8, Q.y + Q.vy * 0.8, Q, "lob"); else lobTo(st, P, P.x + d[0] * (18 + pw * 25), P.y + d[1] * (18 + pw * 25), null, "lob");
      }
      return;
    }
    if (m & BTN.X) st.xHeld = st.held.X;
    if (rsNew) {
      const fwd = rs[0] * a;
      if (fwd > 0.6) { if (st.frame - st.rsAt < 18 && st.rsKind === "fwd") skill(st, P, "heelflick", a, 0); else skill(st, P, "stepover", 0, 0); st.rsKind = "fwd"; }
      else if (fwd < -0.6) { skill(st, P, "roulette", dir ? dir[0] : a, dir ? dir[1] : 0); st.rsKind = "back"; }
      else { skill(st, P, "ballroll", 0, rs[1] > 0 ? 1 : -1); st.rsKind = "side"; }
      st.rsAt = st.frame;
    }
    if (v2 ? released & BTN.LB && !st.lbUse : pressed & BTN.LB) callRun(st, P.t, P);
    return;
  }
  st.shotArm = null;
  const bt = ballTeam(st);
  if (bt === P.t) {
    // off the ball with the team in possession (player lock): A asks for it, Y asks for it in behind
    if (pressed & (BTN.A | BTN.Y)) st.callFor = { g: P.g, through: Boolean(pressed & BTN.Y), f: st.frame };
    return;
  }
  // defending
  if (pressed & BTN.LB && st.cfg.lock < 0) { switchTo(st, nearestToBall(st, 0, P)); return; }
  if (rsNew && st.cfg.lock < 0) { const Q = mateToward(st, P, rs[0], rs[1], { cone: 0.3, max: 60 }); if (Q) switchTo(st, Q); return; }
  const V = b.own >= 0 ? st.p[b.own] : null;
  if (v2) {
    // FC: B tackles (chasing him, close: a push or pull), X slides, A holds contain, RB holds a
    // teammate on him too, Y holds the keeper rushing out
    st.rushGK = Boolean(m & BTN.Y);
    if (pressed & BTN.B && !P.act) {
      const chasing = V && len(V.x - P.x, V.y - P.y) < 1.4 && (V.x - P.x) * V.vx + (V.y - P.y) * V.vy > 0;
      P.act = chasing ? { kind: "shoulder", f: 0, n: 12 } : { kind: "tackle", f: 0, n: 16 };
      return;
    }
    if (pressed & BTN.X && !P.act) { slideStart(st, P, dir); return; }
    if (m & BTN.A && V) contain(st, P, V);
    // the lower levels' assisted defending: in reach of the carrier, your man goes in by himself
    if (st.D.auto && V && !P.act && !P.stun && len(V.x - P.x, V.y - P.y) < 1.5 && rnd(st) < st.D.auto) { P.act = { kind: "tackle", f: 0, n: 16 }; return; }
    st.held.A = m & BTN.A ? st.held.A + 1 : 0;
    st.press2 = Boolean(m & BTN.RB) || st.D.help >= 2;
    if (P.jockey && V) { const k = 0.62; contain(st, P, V); P.wantX *= k / 0.9; P.wantY *= k / 0.9; P.jockeyF = (P.jockeyF || 0) + 1; } else P.jockeyF = 0;
    if (!dir && st.D.help && !(m & BTN.A) && !P.jockey) P.manual = false;
    return;
  }
  if (pressed & BTN.A && !P.act) { P.act = { kind: "tackle", f: 0, n: 16 }; return; }
  if (pressed & BTN.B && !P.act) { slideStart(st, P, dir); return; }
  if (m & BTN.A && st.held.A > 10 && V) contain(st, P, V);
  st.held.A = m & BTN.A ? st.held.A + 1 : 0;
  if (pressed & BTN.X && V && len(V.x - P.x, V.y - P.y) < 1.4 && !P.act) { P.act = { kind: "shoulder", f: 0, n: 12 }; return; }
  st.press2 = Boolean(m & BTN.X);
  if (P.jockey && V) { const k = 0.62; contain(st, P, V); P.wantX *= k / 0.9; P.wantY *= k / 0.9; P.jockeyF = (P.jockeyF || 0) + 1; } else P.jockeyF = 0;
  if (!dir && st.D.help && !(m & BTN.A) && !P.jockey) P.manual = false;   // easy: your man keeps his place when you let go
}
// FC's contain: shadow the carrier goal-side at a step's distance.
function contain(st, P, V) {
  const a = att(st, P.t), gx = -a * P_.hx, dx = gx - V.x, dy = 34 - V.y, d = len(dx, dy) || 1;
  const tx = V.x + (dx / d) * 1.6, ty = V.y + (dy / d) * 1.6, ox = tx - P.x, oy = ty - P.y, od = len(ox, oy);
  const s = Math.min(P.spd * 0.9, od * 4);
  P.wantX = od > 0.05 ? (ox / od) * s : 0; P.wantY = od > 0.05 ? (oy / od) * s : 0; P.manual = true;
  const fx = V.x - P.x, fy = V.y - P.y, fl = len(fx, fy) || 1; P.fx = fx / fl; P.fy = fy / fl; P.faceLock = true;
}
function slideStart(st, P, dir) {
  const b = st.ball;
  let dx = dir ? dir[0] : P.fx, dy = dir ? dir[1] : P.fy;
  if (!dir) { const ox = b.x - P.x, oy = b.y - P.y, l = len(ox, oy) || 1; dx = ox / l; dy = oy / l; }
  P.fx = dx; P.fy = dy;
  const s = Math.max(len(P.vx, P.vy), 5.5) + 1.2;
  P.vx = dx * s; P.vy = dy * s;
  P.act = { kind: "slide", f: 0, n: 34 };
}
function switchTo(st, Q) { if (Q && Q.t === 0 && Q.role !== "GK" && alive(Q)) { st.ctl = Q.i; say(st, "switch", Q); } }
function nearestToBall(st, t, not = null) {
  const b = st.ball;
  let best = null, bd = 1e9;
  for (const Q of team(st, t)) { if (!alive(Q) || Q === not || Q.role === "GK") continue; const d = len(Q.x - b.x, Q.y - b.y); if (d < bd) { bd = d; best = Q; } }
  return best;
}
function boxTarget(st, P, dir) {
  const a = att(st, P.t), mates = team(st, P.t).filter(Q => Q !== P && alive(Q) && uOf(st, P.t, Q.x) > P_.hx - 20 && Math.abs(Q.y - 34) < 16);
  let zoneY = 34;
  if (dir && Math.abs(dir[1]) > 0.3) zoneY = 34 + (dir[1] > 0 ? 1 : -1) * 4.5;   // far or near post
  else if (dir && dir[0] * a < -0.5) zoneY = 34 + (P.y > 34 ? 1 : -1) * 6;
  let Q = null, bs = -1e9;
  for (const M of mates) { const s = -Math.abs(M.y - zoneY) - Math.abs(uOf(st, P.t, M.x) - (P_.hx - 9)) * 0.5 + M.phys * 2; if (s > bs) { bs = s; Q = M; } }
  const tx = a * (P_.hx - (Q ? clamp(P_.hx - uOf(st, P.t, Q.x), 6, 13) : 9)), ty = Q ? clamp(Q.y * 0.6 + zoneY * 0.4, 26, 42) : zoneY;
  return [tx, ty, Q];
}
function callRun(st, t, P) {
  const a = att(st, t);
  let best = null, bu = -1e9;
  for (const Q of team(st, t)) { if (Q === P || !alive(Q) || Q.role === "GK" || Q.run) continue; const u = uOf(st, t, Q.x); if (u > bu) { bu = u; best = Q; } }
  if (best) startRun(st, best);
  void a;
}
function startRun(st, Q) {
  const t = Q.t, line = offsideLine(st, t), u = Math.min(P_.hx - 6, line + 12 + rnd(st) * 8), v = clamp(vOf(st, t, Q.y) + (34 - vOf(st, t, Q.y)) * 0.35 + (rnd(st) - 0.5) * 8, 6, 62);
  Q.run = { f: rnd(st) < 0.45 * (1.25 - Q.k) ? 12 : 0, n: 70 + Math.floor(rnd(st) * 40), drift: (rnd(st) - 0.35) * (1.3 - Q.k) * 2.2, tx: xOf(st, t, u), ty: yOf(st, t, v) };   // some go too soon
}

// ---- who has it -----------------------------------------------------------------------------------------
export function ballTeam(st) {
  const b = st.ball;
  if (b.own >= 0) return st.p[b.own].t;
  if (b.recv >= 0 && b.kind !== "shot") return st.p[b.recv].t;
  return -1;
}

// ---- the CPU ------------------------------------------------------------------------------------------------
// Where the shape wants P: the formation slot moved with the ball and with who has it.
function shapeSpot(st, P, poss) {
  const t = P.t, b = st.ball, bu = uOf(st, t, b.x), bv = vOf(st, t, b.y);
  let u, v;
  if (poss === t) {
    const shift = clamp(bu * 0.6 + 17, -4, 36);
    u = P.su + shift; v = 34 + (P.sv - 34) * 1.12 + (bv - 34) * 0.18;
    if (P.role === "FB" && bu > 0) u += 8;   // the full backs push on
    // the forwards read the line now and then (the better, the more often): a line that steps up
    // between looks leaves them offside
    if (P.lineAt === undefined || st.frame - P.lineAt > 24 + 40 * (1 - P.k)) { P.lineAt = st.frame; P.lineSeen = offsideLine(st, t); }
    const line = LINE[P.role] === 3 ? P.lineSeen : offsideLine(st, t);
    if (LINE[P.role] === 3) u = Math.max(u, line - 1.4);   // the forwards play on the last man's shoulder
    if (LINE[P.role] === 2) u = Math.max(u, line - 20);
    if (LINE[P.role] >= 2) u = Math.min(u, line - 0.8 + (P.loiter || 0));   // a lazy forward drifts past it
  } else {
    const shift = clamp(bu * 0.55 + 13, -2, 31);
    u = P.su + shift; v = 34 + (P.sv - 34) * 0.78 + (bv - 34) * 0.32;
    if (LINE[P.role] === 1) u = Math.min(u, clamp(bu - 14, -47, -6) + (P.role === "FB" ? 1 : 0));
    if (LINE[P.role] === 3) u = Math.max(u, -14);
  }
  return [xOf(st, t, clamp(u, -51, 50)), yOf(st, t, clamp(v, 2, 66))];
}
// The earliest point on the ball's forecast P can reach -> [x, y, frames].
function intercept(st, P, react = 5) {
  const spd = P.spd * 0.93;
  for (let k = 0; k < 150; k += 3) {
    const [x, y, z] = ahead(st, k);
    if (y < 0.3 || y > P_.w - 0.3 || x < -P_.hx + 0.2 || x > P_.hx - 0.2) break;   // nobody chases it out of play
    if (z > (P.role === "GK" ? 2.6 : 2.0)) continue;
    const d = len(x - P.x, y - P.y) - 0.5, need = react + (d > 0 ? (d / spd) * HZ : 0);
    if (need <= k) return [x, y, k];
  }
  let [x, y] = ahead(st, 149);
  x = clamp(x, -P_.hx + 0.5, P_.hx - 0.5); y = clamp(y, 0.5, P_.w - 0.5);
  return [x, y, 160];
}

// Every frame: who chases the ball, who presses, who holds the line. Thinking is staggered.
function teamThink(st) {
  const b = st.ball, poss = ballTeam(st), carrier = b.own >= 0 ? st.p[b.own] : null;
  // free ball: each side's quickest goes to it (and the intended receiver always does)
  st.chase = [-1, -1];
  if (!carrier) {
    for (const t of [0, 1]) {
      let best = -1, bf = 1e9;
      for (const Q of team(st, t)) {
        if (!alive(Q) || (Q.role === "GK" && !gkMayCome(st, Q))) continue;
        if (Q.icpt === undefined || (st.frame + Q.i) % 6 === 0 || b.at === st.frame - 1) Q.icpt = intercept(st, Q, Q.role === "GK" ? 4 : 6);
        const f = Q.icpt[2] - (b.recv === Q.g ? 30 : 0);
        if (f < bf) { bf = f; best = Q.g; }
      }
      st.chase[t] = best;
    }
  }
  // the press: on the carrier, the nearest of the side without it, and a second man covering
  st.press = [-1, -1]; st.cover = [-1, -1];
  if (carrier) {
    const D = 1 - carrier.t, ds = team(st, D).filter(Q => alive(Q) && Q.role !== "GK").map(Q => [len(Q.x - carrier.x, Q.y - carrier.y) + (Q.stun ? 6 : 0), Q.g]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    st.press[D] = ds[0]?.[1] ?? -1; st.cover[D] = ds[1]?.[1] ?? -1;
  }
}
function gkMayCome(st, K) {
  const b = st.ball, u = uOf(st, K.t, b.x), [x, y] = ahead(st, 30), uu = uOf(st, K.t, x);
  return (u < -P_.hx + P_.boxD + 1 || uu < -P_.hx + P_.boxD) && Math.abs(y - 34) < P_.boxW + 1;
}

function aiMove(st, P) {
  const b = st.ball, t = P.t, a = att(st, t), carrier = b.own >= 0 ? st.p[b.own] : null, poss = ballTeam(st);
  let tx, ty, sprint = false;
  if (P.think > 0) P.think--;
  if ((st.frame + P.g * 7) % 90 === 0) P.loiter = LINE[P.role] === 3 ? (rnd(st) - 0.4) * 5 * (1.25 - P.k) : 0;
  if (P.role === "GK") return gkMove(st, P);
  if (carrier === P) return;   // the carrier's feet are decided in carrierThink
  if (st.phase === "dead") { [tx, ty] = deadSpot(st, P); sprint = len(tx - P.x, ty - P.y) > 8; return setTarget(P, tx, ty, sprint); }
  if (!carrier && st.chase[t] === P.g) {
    [tx, ty] = P.icpt || [b.x, b.y]; sprint = true;
    return setTarget(P, tx, ty, sprint, 0.2);
  }
  if (carrier && carrier.t !== t) {
    // defending
    if (st.press[t] === P.g || (P.t === 0 && st.press2 && st.cover[t] === P.g)) {
      const gx = -a * P_.hx, dx = gx - carrier.x, dy = 34 - carrier.y, d = len(dx, dy) || 1;
      const close = len(carrier.x - P.x, carrier.y - P.y);
      const off = close > 4 ? 0.9 : 0.5;
      tx = carrier.x + (dx / d) * off + carrier.vx * 0.25; ty = carrier.y + (dy / d) * off + carrier.vy * 0.25;
      sprint = close > 2.5;
      setTarget(P, tx, ty, sprint, 0.1);
      // the challenge: when in reach, by his defending, and patience
      if (!P.act && !P.stun && close < 1.5 && P.think <= 0) {
        const facing = behindness(P, carrier);
        const eager = (0.15 + 0.22 * P.def) * (facing > 0.4 ? (P.yc ? 0.25 : 0.8) : 1) * (t === 1 ? st.D.eager : 1);
        const box = inOwnBox(st, P) ? 0.8 : 1;   // in his own area a defender is careful
        if (rnd(st) < eager * box) P.act = { kind: "tackle", f: 0, n: 16 };
        else if (facing > -0.2 && rnd(st) < (dogsoOf(st, carrier) ? 0.06 : 0.05 * (1.2 - P.def)) * box * box) slideStart(st, P, null);
        P.think = 6 + Math.floor((1 - P.def) * 8);
      }
      return;
    }
    if (st.cover[t] === P.g) {
      const gx = -a * P_.hx, dx = gx - carrier.x, dy = 34 - carrier.y, d = len(dx, dy) || 1;
      tx = carrier.x + (dx / d) * 6; ty = carrier.y + (dy / d) * 6;
      return setTarget(P, tx, ty, len(tx - P.x, ty - P.y) > 6);
    }
    [tx, ty] = shapeSpot(st, P, poss);
    // mark the most dangerous man near my spot, goal side
    let M = null, md = 9;
    for (const Q of team(st, 1 - t)) { if (!alive(Q) || Q === carrier || Q.role === "GK") continue; const d = len(Q.x - tx, Q.y - ty); if (d < md) { md = d; M = Q; } }
    if (M && LINE[P.role] <= 2) {
      const gx = -a * P_.hx, dx = gx - M.x, dy = 34 - M.y, d = len(dx, dy) || 1, k = LINE[P.role] === 1 ? 0.55 : 0.4;
      tx = tx * (1 - k) + (M.x + (dx / d) * 1.8) * k; ty = ty * (1 - k) + (M.y + (dy / d) * 1.8) * k;
      // the line holds: a defender does not drop behind the line for a man already offside
      if (LINE[P.role] === 1) {
        // the back four hold their line and leave a forward offside; they drop when the ball carrier
        // has time to pick a pass (nobody on him)
        const pr = st.press[t] >= 0 ? st.p[st.press[t]] : null, free = !pr || len(pr.x - carrier.x, pr.y - carrier.y) > 3.5;
        const lineU = uOf(st, t, shapeSpot(st, P, poss)[0]) - (free ? 4 : 0);
        if (uOf(st, t, tx) < lineU) tx = xOf(st, t, lineU);
      }
    }
    return setTarget(P, tx, ty, len(tx - P.x, ty - P.y) > 5);
  }
  // attacking (or a ball in flight to us)
  if (b.recv === P.g && !carrier) { [tx, ty] = P.icpt || intercept(st, P); return setTarget(P, tx, ty, true, 0.15); }
  if (P.run) {
    P.run.f++;
    const line = offsideLine(st, t);
    // hold the line until the run is on: a runner waits level, then goes
    if (P.run.f < 12 && uOf(st, t, P.x) > line - 0.3) { tx = xOf(st, t, line - 0.6 + (P.run.drift ?? 0)); return setTarget(P, tx, P.y, false); }
    if (P.run.f > P.run.n || len(P.run.tx - P.x, P.run.ty - P.y) < 1.5) P.run = null;
    else return setTarget(P, P.run.tx, P.run.ty, true);
  }
  [tx, ty] = shapeSpot(st, P, poss);
  // support: the two nearest the carrier offer an angle
  if (carrier && carrier.t === t) {
    const d = len(P.x - carrier.x, P.y - carrier.y);
    if (d < 16 && LINE[P.role] === 2) {
      const ox = P.x - carrier.x, oy = P.y - carrier.y, l = d || 1, want = 11;
      tx = tx * 0.5 + (carrier.x + (ox / l) * want) * 0.5; ty = ty * 0.5 + (carrier.y + (oy / l) * want) * 0.5;
    }
    // runs in behind, by the forwards and wide men, when the carrier is facing up the pitch
    if (!P.run && (P.role === "FW" || P.role === "WF" || P.role === "WM" || (P.role === "FB" && uOf(st, t, b.x) > 10)) && P.think <= 0) {
      P.think = 20 + Math.floor(rnd(st) * 20);
      const cu = uOf(st, t, carrier.x);
      if (cu > -20 && rnd(st) < (P.role === "FW" || P.role === "WF" ? 0.32 : 0.12)) startRun(st, P);
    }
  }
  return setTarget(P, tx, ty, len(tx - P.x, ty - P.y) > 7);
}
function setTarget(P, tx, ty, sprint, slow = 1) {
  P.tx = tx; P.ty = ty; P.sprint = sprint;
  const dx = tx - P.x, dy = ty - P.y, d = len(dx, dy);
  const top = P.spd * (sprint ? 1 : 0.62), s = Math.min(top, d * (slow < 1 ? 6 : 2.2));
  P.wantX = d > 0.15 ? (dx / d) * s : 0; P.wantY = d > 0.15 ? (dy / d) * s : 0;
}

// Restart positions: corners crowd the box, the rest keep their shape around the ball; 9.15 m off.
function deadSpot(st, P) {
  const rs = st.rs, b = st.ball, t = P.t, a = att(st, t);
  if (P.wall) return [P.x, P.y];
  let [tx, ty] = shapeSpot(st, P, rs ? rs.team : -1);
  if (rs && (rs.type === "corner" || (rs.type === "fk" && Math.abs(b.x) > 20))) {
    const attackers = rs.team === t, A = att(st, rs.team);
    const slotsA = [[P_.hx - 6, 30], [P_.hx - 7, 38], [P_.hx - 11, 34], [P_.hx - 5, 34.5], [P_.hx - 14, 26], [P_.hx - 14, 42], [P_.hx - 20, 34]];
    const slotsD = [[P_.hx - 1.5, 30.5], [P_.hx - 1.5, 37.5], [P_.hx - 6, 30], [P_.hx - 6, 38], [P_.hx - 10, 34], [P_.hx - 6, 34], [P_.hx - 12, 28], [P_.hx - 12, 40], [P_.hx - 18, 34]];
    const order = team(st, t).filter(Q => alive(Q) && Q.role !== "GK" && Q.g !== rs.taker && !Q.wall).sort((p, q) => (attackers ? q.phys + q.r / 100 - p.phys - p.r / 100 : q.def - p.def) || p.i - q.i);
    const k = order.indexOf(P), S = attackers ? slotsA : slotsD;
    if (k >= 0 && k < S.length) { tx = A * S[k][0]; ty = S[k][1] + (k * 7 % 3 - 1) * 0.6; }
    else if (attackers) { tx = A * 5; ty = P.sv; } else { tx = A * 12; ty = clamp(P.sv, 20, 48); }
  }
  if (rs && rs.type === "pen") { tx = clamp(P.x, -P_.hx + P_.boxD + 2, P_.hx - P_.boxD - 2); ty = clamp(P.y, 12, 56); }
  if (rs && rs.team !== t) {
    const keep = rs.type === "throw" ? 2 : 9.4, dx = tx - b.x, dy = ty - b.y, d = len(dx, dy);
    if (d < keep) { if (d < 0.01) { tx = b.x - a * keep; } else { tx = b.x + (dx / d) * keep; ty = b.y + (dy / d) * keep; } }
  }
  void a;
  return [clamp(tx, -P_.hx + 0.5, P_.hx - 0.5), clamp(ty, 0.5, P_.w - 0.5)];
}

// The keeper: on the line between the ball and his goal's centre, further out the further the ball is;
// out to the ball in his area; out to narrow the angle one on one.
function gkMove(st, K) {
  const b = st.ball, a = att(st, K.t), gx = -a * P_.hx;
  if (b.own === K.g) return;
  if (K.act?.kind === "dive" || K.act?.kind === "hold") return;
  if (st.phase === "dead" && st.rs?.type === "goal" && st.rs.team === K.t) return;
  if (st.chase[K.t] === K.g && b.own < 0 && st.phase === "live") { const [x, y] = K.icpt || [b.x, b.y]; return setTarget(K, x, y, true, 0.2); }
  // FC's Y held on defence: your keeper rushes out at the ball (to the edge of his area)
  if (st.rushGK && K.t === 0 && st.phase === "live" && !st.cfg.auto) {
    const u = clamp(uOf(st, 0, b.x), -P_.hx, -P_.hx + P_.boxD), y = clamp(b.y, 34 - P_.boxW, 34 + P_.boxW);
    return setTarget(K, xOf(st, 0, u), y, true, 0.2);
  }
  const bx = b.x, by = b.y, dx = bx - gx, dy = by - 34, d = len(dx, dy) || 1;
  let out = clamp(d * 0.09, 0.6, 4.2);
  const C = b.own >= 0 ? st.p[b.own] : null;
  if (C && C.t !== K.t && d < 18 && st.phase === "live") {
    let clear = true;
    for (const Q of team(st, K.t)) if (Q !== K && alive(Q) && uOf(st, K.t, Q.x) < uOf(st, K.t, C.x) && len(Q.x - C.x, Q.y - C.y) < 6) clear = false;
    if (clear) out = clamp(d * 0.42, 1.5, 8);
  }
  let tx = gx + (dx / d) * out, ty = 34 + (dy / d) * out;
  ty = clamp(ty, 34 - P_.gw + 0.4, 34 + P_.gw - 0.4);
  setTarget(K, tx, ty, len(tx - K.x, ty - K.y) > 3, 0.2);
  const fl = len(bx - K.x, by - K.y) || 1; K.fx = (bx - K.x) / fl; K.fy = (by - K.y) / fl; K.faceLock = true;
}

// The carrier's mind (the CPU's, and team 0's with auto): shoot, pass, cross, dribble, a trick.
export function xgOf(st, P, x = P.x, y = P.y) {
  const a = att(st, P.t), dx = P_.hx - a * x, dy = Math.abs(y - 34), d = len(dx, dy) || 1;
  if (dx < 0.5) return 0;
  const ang = (7.32 * dx) / (d * d);
  const c = 0.75 * ang * ang;
  return c / (1 + c);
}
// How much a spot is worth to the side attacking from it: up the pitch, and central only near goal
// (wide is where the room is in the build-up).
const zoneVal = (st, t, x, y) => { const u = (uOf(st, t, x) + P_.hx) / 105, c = Math.abs(y - 34) / 34, w = 1 - c * c * 0.6 * u * u; return u * u * w + (u > 1 - P_.boxD / 105 && Math.abs(y - 34) < P_.boxW ? 0.25 : 0); };
// Is the lane from (x0, y0) to (x1, y1) safe from team D? -> margin in metres (negative: cut out)
function laneMargin(st, D, x0, y0, x1, y1, speed) {
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
  let m = 99;
  for (const O of team(st, D)) {
    if (!alive(O)) continue;
    const tt = clamp(((O.x - x0) * dx + (O.y - y0) * dy) / L2, 0, 1), cx = x0 + dx * tt, cy = y0 + dy * tt;
    const od = len(O.x - cx, O.y - cy), time = (Math.sqrt(L2) * tt) / speed;
    const reach = 0.7 + Math.min(O.spd * 0.62 * Math.max(0, time - 0.18), 6) * (O.role === "GK" ? 0.8 : 1) + (O.stun ? -1 : 0);
    if (od - reach < m) m = od - reach;
  }
  return m;
}
const DIRS = [[1, 0], [0.866, 0.5], [0.866, -0.5], [0.5, 0.866], [0.5, -0.866], [0, 1], [0, -1], [-0.5, 0.866], [-0.5, -0.866]];
function carrierThink(st, P) {
  const b = st.ball, a = att(st, P.t), t = P.t, D = 1 - t;
  if (P.role === "GK") return gkDistribute(st, P);
  if (P.stun) { P.wantX = 0; P.wantY = 0; return; }
  if (P.act && P.act.kind !== "kick") return;
  P.think--;
  const pr = pressureOn(st, P);
  if (P.think > 0 && !(pr > 0.75 && P.think > 4)) return steer(st, P);
  P.think = Math.round(7 + (1 - P.k) * 10 + rnd(st) * 6) + (t === 1 ? st.D.think : 0);
  const u = uOf(st, t, P.x), xg = xgOf(st, P), noise = () => (rnd(st) - 0.5) * (0.12 + 0.2 * (1 - P.k));
  let best = { s: -1e9 };
  let lab = "";
  const consider = (s, f) => { if (s > best.s) best = { s, f, lab }; };
  // shoot
  lab = "shoot";
  if (u > 12) {
    const xga = xg * (1 - 0.55 * pr) * (0.7 + 0.5 * P.shoot);
    consider(xga * 9 - 0.62 + noise() + (u > P_.hx - P_.boxD ? 0.2 : 0) + (pr < 0.45 && u > P_.hx - 32 && u < P_.hx - 16 ? 0.5 * P.shoot : 0), () => shoot(st, P, clamp(0.55 + rnd(st) * 0.32 + (u < 30 ? 0.1 : 0), 0, 0.9), 34 + (rnd(st) < 0.68 ? (P.y < 34 ? 1 : -1) : (P.y < 34 ? -1 : 1)) * (2.2 + rnd(st) * 1.2), rnd(st) < 0.3 * P.k && u > 30 ? "finesse" : "drive"));
  }
  const here = zoneVal(st, t, P.x, P.y);
  // asked for it (the human's player, locked)
  const call = st.callFor && st.frame - st.callFor.f < 30 && st.p[st.callFor.g].t === t ? st.p[st.callFor.g] : null;
  // pass and through ball
  lab = "pass";
  for (const Q of team(st, t)) {
    if (Q === P || !alive(Q) || Q.stun) continue;
    const d = len(Q.x - P.x, Q.y - P.y);
    if (d < 4 || d > 42) continue;
    const qu = uOf(st, t, Q.x), line = offsideLine(st, t), seen = qu - Math.max(0, Q.vx * a) * (0.12 + 0.3 * (1 - P.pass)), onside = seen < line + (rnd(st) - 0.3) * (3.4 - P.pass * 1.8);   // he sees the runner a moment late
    if (Q.role === "GK" && pr < 0.6) continue;
    const ps = passSpeed(d, 7.5), lane = laneMargin(st, D, P.x, P.y, Q.x, Q.y, ps), space = -pressureOn(st, Q);
    const gain = zoneVal(st, t, Q.x, Q.y) - here;
    const safety = lane > 1.2 ? 0.3 : lane > 0.2 ? 0 : lane > -0.6 ? -0.6 : -1.8;
    let s = gain * 3.2 + safety + space * 0.5 + noise() + (pr > 0.5 ? 0.35 : -0.02) - (d > 30 ? 0.3 : 0) + (call === Q ? 1.2 : 0);
    if (!onside && seen > line) s -= 2;
    lab = "pass"; consider(s, () => passTo(st, P, Q.x + Q.vx * 0.35, Q.y + Q.vy * 0.35, Q));
    // the ball in behind, to a runner (or a forward on the shoulder)
    lab = "through";
    if ((Q.run || Q.role === "FW" || Q.role === "WF" || call === Q && st.callFor.through) && qu > u - 12) {
      const lead = 7 + rnd(st) * 5, rx = Q.run ? Q.run.tx - Q.x : a, ry = Q.run ? Q.run.ty - Q.y : 0, rl = len(rx, ry) || 1;
      const tx = clamp(Q.x + (rx / rl) * lead, -P_.hx + 3, P_.hx - 3), ty = clamp(Q.y + (ry / rl) * lead, 3, P_.w - 3);
      if (uOf(st, t, tx) < u + 4) continue;
      const dd = len(tx - P.x, ty - P.y), lane2 = laneMargin(st, D, P.x, P.y, tx, ty, passSpeed(dd, 5.5));
      // can a defender or the keeper get there first?
      let first = 99; for (const O of team(st, D)) if (alive(O)) first = Math.min(first, len(O.x - tx, O.y - ty) / O.spd - len(Q.x - tx, Q.y - ty) / Q.spd);
      const s2 = (zoneVal(st, t, tx, ty) - here) * 3.4 + (lane2 > 0.6 ? 0.2 : lane2 > -0.3 ? -0.3 : -1.5) + (first > 0.25 ? 0.35 : first > 0 ? 0 : -1.2) + (onside ? 0 : -2.4) + noise() - 0.15 + (call === Q && st.callFor.through ? 1 : 0);
      consider(s2, () => { Q.run = { ...(Q.run || { f: 20, n: 80 }), tx, ty }; passTo(st, P, tx, ty, Q, "through", 0); });
    }
  }
  // the cross from wide
  lab = "cross";
  if (u > P_.hx - 30 && Math.abs(P.y - 34) > 12) {
    const [tx, ty, Q] = boxTarget(st, P, null);
    if (Q) consider(0.6 + Q.phys * 0.3 + noise() - pr * 0.1, () => lobTo(st, P, tx, ty, Q, "cross", 1));
  }
  // dribble: the way with the most room
  lab = "dribble";
  for (const [fx, fy] of DIRS) {
    const dx = fx * a, dy = fy, px = P.x + dx * 6, py = P.y + dy * 6;
    if (py < 1.5 || py > P_.w - 1.5 || Math.abs(px) > P_.hx - 1) continue;
    let room = 99; for (const O of team(st, D)) if (alive(O)) room = Math.min(room, len(O.x - px, O.y - py));
    const s = (zoneVal(st, t, px, py) - here) * 3 + clamp((room - 2.5) / 5, -1, 0.5) * (0.8 + 0.4 * P.drib) - 0.1 + noise();
    consider(s, () => { P.dx = dx; P.dy = dy; P.dribT = 18 + Math.floor(rnd(st) * 18); });
  }
  // a trick when a man is on him
  lab = "trick";
  if (pr > 0.55 && P.stars >= 2 && rnd(st) < 0.06 * P.stars) consider(0.2 + noise(), () => skill(st, P, rnd(st) < 0.5 ? "stepover" : "ballroll", 0, rnd(st) < 0.5 ? 1 : -1));
  // clear it: a defender under pressure in his own third
  lab = "clear";
  if (u < -30 && pr > 0.6) consider(-0.2 + (1 - P.pass) * 0.6 + noise(), () => lobTo(st, P, P.x + a * (25 + rnd(st) * 20), rnd(st) < 0.5 ? (P.y > 34 ? 66 + rnd(st) * 12 : 2 - rnd(st) * 12) : clamp(P.y + (rnd(st) - 0.5) * 30, 6, 62), null, "clear"));
  if (best.f) best.f();
  steer(st, P);
}
function steer(st, P) {
  if (st.ball.own !== P.g) return;
  const t = P.t, a = att(st, t);
  let dx = P.dx ?? a, dy = P.dy ?? 0;
  // keep away from the nearest man and the touchline
  let O = null, od = 99; for (const Q of team(st, 1 - t)) if (alive(Q)) { const d = len(Q.x - P.x, Q.y - P.y); if (d < od) { od = d; O = Q; } }
  if (O && od < 3) { const ox = P.x - O.x, oy = P.y - O.y; dx += (ox / od) * (3 - od) * 0.35; dy += (oy / od) * (3 - od) * 0.35; }
  if (P.y < 3) dy += 0.6; if (P.y > P_.w - 3) dy -= 0.6;
  if (uOf(st, t, P.x) > P_.hx - 3) dx -= a * 0.8;
  const l = len(dx, dy) || 1;
  const sp = P.spd * (od > 5 && uOf(st, t, P.x) < P_.hx - 20 ? 0.92 : 0.7);
  P.sprint = sp > P.spd * 0.8;
  P.wantX = (dx / l) * sp; P.wantY = (dy / l) * sp;
}
// The keeper with the ball in his hands: a few seconds, then out to an open man, or long.
function gkDistribute(st, K) {
  K.wantX = 0; K.wantY = 0;
  K.hold = (K.hold || 0) + 1;
  if (human(st, K)) {
    const m = st.mask, pressed = m & ~st.prev, dir = dirIn(m);
    const kickB = pressed & BTN.X || (st.v >= 2 && pressed & BTN.B);   // FC: A throws, X or B drop-kicks
    if (pressed & BTN.A || kickB) {
      const d = dir || [att(st, K.t), 0], Q = mateToward(st, K, d[0], d[1], { cone: 0, far: kickB });
      if (Q) { if (kickB) lobTo(st, K, Q.x, Q.y, Q, "gk"); else throwTo(st, K, Q); }
      return;
    }
    if (K.hold < 240) return;
  }
  if (K.hold < 55 + ((st.frame * 7) % 30)) return;
  const D = 1 - K.t, a = att(st, K.t);
  let best = null, bs = -1e9;
  for (const Q of team(st, K.t)) {
    if (Q === K || !alive(Q)) continue;
    const d = len(Q.x - K.x, Q.y - K.y), lane = laneMargin(st, D, K.x, K.y, Q.x, Q.y, 14), s = (lane > 1.5 ? 1 : lane > 0 ? 0.2 : -1) - d / 60 + rnd(st) * 0.3;
    if (d < 40 && s > bs) { bs = s; best = Q; }
  }
  if (best && bs > 0.4) throwTo(st, K, best);
  else { const fw = team(st, K.t).filter(Q => alive(Q) && LINE[Q.role] === 3).sort((p, q) => p.i - q.i)[Math.floor(rnd(st) * 2)] || team(st, K.t)[10]; lobTo(st, K, fw.x + a * 4, fw.y, fw, "gk", 1.15); }
  K.act = null;
}
function throwTo(st, K, Q) {
  const d = len(Q.x - K.x, Q.y - K.y), sp = clamp(passSpeed(d, 8), 8, 22), ux = (Q.x - K.x) / d, uy = (Q.y - K.y) / d;
  st.ball.z = 1; kick(st, K, ux * sp, uy * sp, 1.2, "pass", Q.g);
  K.act = { kind: "throw", f: 0 };
}

// ---- the ball meets the players --------------------------------------------------------------------------
function contacts(st) {
  const b = st.ball;
  if (b.own >= 0) return;
  const sp = len(b.vx, b.vy);
  // headers: a dropping ball at head height near men of both sides
  if (b.z > 1.15 && b.z < 2.9 && b.vz < 2 && (b.kind === "cross" || b.kind === "lob" || b.kind === "corner" || b.kind === "gk" || b.kind === "clear" || b.kind === "through-lob" || b.kind === "fk" || b.kind === "throw" || b.kind === "parry" || b.kind === "loose")) {
    let cands = [];
    for (const P of st.p) {
      if (!alive(P) || P.cool > 0 || P.stun || P.act?.kind === "slide" || P.act?.kind === "down") continue;
      const d = len(P.x - b.x, P.y - b.y);
      if (d < 1.1 && b.z < 2.0 + 0.6 * P.phys + (P.role === "GK" ? 0.8 : 0)) cands.push([P, d]);
    }
    if (cands.length) {
      const keeper = cands.find(([P]) => P.role === "GK" && inOwnBox(st, P));
      if (keeper && rnd(st) < 0.55 + 0.4 * keeper[0].gk) { const K = keeper[0]; touch(st, K, true); b.x = K.x; b.y = K.y; own(st, K); K.hold = 0; K.act = { kind: "hold", f: 0 }; say(st, "claim", K); return; }
      // the duel: strength, timing, position
      let W = null, ws = -1;
      for (const [P, d] of cands) { const s = (0.4 + P.phys * 0.6) * (1.2 - d) * (0.6 + rnd(st)); if (s > ws) { ws = s; W = P; } }
      if (W) { header(st, W); return; }
    }
  }
  if (b.z > 1.15) return;
  // feet: the nearest man in reach who has not had his go at this ball
  let C = null, cd = 1e9;
  for (const P of st.p) {
    if (!alive(P) || P.cool > 0 || P.stun || (sp > 4 && (Math.floor(b.rolled / 2 ** P.g) % 2))) continue;   // one go each at a moving ball; a slow one is anyone's
    if (P.act && (P.act.kind === "down" || P.act.kind === "dive")) continue;
    const reach = P.act?.kind === "slide" ? 1.1 : P.role === "GK" && inOwnBox(st, P) ? 1.4 : 0.85;
    const d = len(P.x - b.x, P.y - b.y);
    if (d < reach && d < cd) { cd = d; C = P; }
  }
  if (!C) return;
  if (!(Math.floor(b.rolled / 2 ** C.g) % 2)) b.rolled += 2 ** C.g;
  const shot = b.kind === "shot" || b.kind === "header-shot" || b.kind === "fk-shot" || b.kind === "pen";
  const mine = b.lastT === C.t;
  // the keeper's own ball in his area: gathered (not a deliberate pass back from a teammate)
  if (C.role === "GK" && inOwnBox(st, C) && !(mine && (b.kind === "pass" || b.kind === "through"))) {
    if (shot && st.plan && st.plan.id === b.id) return;   // the planned save decides
    if (rnd(st) < 0.9 - Math.max(0, sp - 18) * 0.03) { touch(st, C, true); b.x = C.x; b.y = C.y; own(st, C); C.hold = 0; C.act = { kind: "hold", f: 0 }; say(st, "claim", C); return; }
    loose_(st, C, -b.vx * 0.3, b.vy * 0.5 + (rnd(st) - 0.5) * 6, 1); touch(st, C, true); return;
  }
  if (shot && !mine) {
    // a block
    if (rnd(st) < 0.5 + 0.3 * C.def) { touch(st, C); const on = rnd(st) < 0.7 ? 0.45 : -0.25; loose_(st, C, b.vx * on + (rnd(st) - 0.5) * 6, b.vy * 0.4 + (rnd(st) < 0.5 ? -1 : 1) * (3 + rnd(st) * 7), 0.5 + rnd(st) * 3); C.cool = 10; st.stats.blocks = (st.stats.blocks || 0) + 1; say(st, "block", C); }
    return;
  }
  if (shot && mine && sp > 14) return;   // a teammate does not stop his own man's shot
  const intended = b.recv === C.g;
  if (!mine && sp > 3.5 && C.act?.kind !== "slide") {
    // an interception: reading it, against its pace
    const by = st.p[b.by], q = by && by.t !== C.t ? 1.45 - 0.9 * by.pass : 1;
    const p = clamp((0.3 + 0.5 * C.def - (sp - 9) * 0.035 + (cd < 0.5 ? 0.15 : 0)) * q, 0.06, 0.92);
    if (rnd(st) >= p) { if (rnd(st) < 0.25) { touch(st, C); b.vx *= 0.6; b.vy = b.vy * 0.6 + (rnd(st) - 0.5) * 3; b.deflect = true; b.recv = -1; forecast(st); } return; }
  }
  if (C.act?.kind === "slide") { touch(st, C); loose_(st, C, C.fx * 6, C.fy * 6, 0.3); return; }
  // a defender meeting a cross in his own area hooks it away, often behind
  if (!mine && (b.kind === "cross" || b.kind === "corner" || b.kind === "fk") && inOwnBox(st, C) && rnd(st) < 0.6) {
    touch(st, C);
    const a = att(st, C.t), behind = rnd(st) < 0.5;
    loose_(st, C, behind ? -a * (6 + rnd(st) * 6) : a * (10 + rnd(st) * 8), (C.y > 34 ? 1 : -1) * (2 + rnd(st) * 8), 1 + rnd(st) * 4);
    say(st, "headclear", C);
    return;
  }
  // the first touch: control by his touch, against its pace
  if (touch(st, C)) return;
  const heavy = clamp(0.015 + Math.max(0, sp - 8) * 0.018 * (1.25 - C.drib) + (intended ? 0 : 0.05) + (C.sprint ? 0.04 : 0) - (C.t === 0 && !st.cfg.auto ? st.D.heavy : 0), 0, 0.6);
  if (rnd(st) < heavy) {
    const fx = b.vx * 0.3 + C.fx * 2.5 + (rnd(st) - 0.5) * 5, fy = b.vy * 0.3 + C.fy * 2.5 + (rnd(st) - 0.5) * 5;
    loose_(st, C, fx, fy, 0.2); b.rolled = 2 ** C.g; C.cool = 8;
    say(st, "heavy", C);
    return;
  }
  own(st, C);
}
const inOwnBox = (st, P) => uOf(st, P.t, P.x) < -P_.hx + P_.boxD && Math.abs(P.y - 34) < P_.boxW;
function header(st, P) {
  const b = st.ball, t = P.t, a = att(st, t), u = uOf(st, t, P.x);
  if (touch(st, P)) return;
  P.act = { kind: "head", f: 0, n: 22 }; P.cool = 12;
  if (u > P_.hx - 15 && Math.abs(P.y - 34) < 12 && b.lastT === t) {
    // at goal: down and toward a post
    const aimY = 34 + (rnd(st) < 0.5 ? 1 : -1) * (1.2 + rnd(st) * 2);
    b.z = Math.max(b.z, 1.8);
    shoot(st, P, 0.5 + 0.3 * rnd(st), aimY, "header", 0.2 + rnd(st) * 1.6);
    return;
  }
  if (b.lastT !== t || u < -20) {
    // a defender's header: away from goal, up and out
    const vy = (P.y > 34 ? 1 : -1) * (3 + rnd(st) * 6), behind = u < -38 && rnd(st) < 0.42;
    kick(st, P, behind ? -a * (5 + rnd(st) * 4) : a * (9 + rnd(st) * 6), vy, 5 + rnd(st) * 3, "clear");
    say(st, "headclear", P);
    return;
  }
  // a header on to a teammate
  const Q = mateToward(st, P, a, 0, { cone: -0.2, max: 25 });
  if (Q) { const d = len(Q.x - P.x, Q.y - P.y) || 1; kick(st, P, ((Q.x - P.x) / d) * 9, ((Q.y - P.y) / d) * 9, 3, "pass", Q.g); }
  else kick(st, P, a * 9, 0, 4, "clear");
}

// ---- movement ----------------------------------------------------------------------------------------------
function movePlayer(st, P) {
  if (!alive(P)) return;
  if (P.cool > 0) P.cool--;
  if (P.stun > 0) { P.stun--; P.wantX = (P.wantX || 0) * 0.2; P.wantY = (P.wantY || 0) * 0.2; }
  const act = P.act;
  if (act) {
    act.f++;
    if (act.kind === "slide") {
      const s = len(P.vx, P.vy), k = act.f < 18 ? 0.985 : 0.88;
      P.vx *= k; P.vy *= k;
      if (act.f >= 3 && act.f <= 20 && !act.done) slideContact(st, P);
      if (act.f >= act.n) { P.act = { kind: "down", f: 0, n: 22 }; }
      void s;
      P.x += P.vx * DT; P.y += P.vy * DT; clampIn(P); return;
    }
    if (act.kind === "tackle") { if (act.f >= 4 && act.f <= 9 && !act.done) standingTackle(st, P); P.wantX *= 0.5; P.wantY *= 0.5; if (act.f >= act.n) P.act = null; }
    else if (act.kind === "shoulder") { if (act.f >= 3 && !act.done) shoulder(st, P); if (act.f >= act.n) P.act = null; }
    else if (act.kind === "down") { P.vx *= 0.8; P.vy *= 0.8; P.x += P.vx * DT; P.y += P.vy * DT; if (act.f >= act.n) P.act = null; return; }
    else if (act.kind === "dive") {
      const k = Math.min(1, act.f / act.n);
      P.y = act.y0 + (act.y1 - act.y0) * k * (act.late ? 0.85 : 1); P.z = act.hi ? 0.4 * k : 0;
      if (act.f > act.n + 40) { P.act = null; P.z = 0; }
      return;
    }
    else if (act.kind === "hold") { if (st.ball.own !== P.g) P.act = null; }
    else if (act.kind === "stumble") { P.wantX *= 0.3; P.wantY *= 0.3; if (act.f >= act.n) P.act = null; }
    else if (SKILLS[act.kind] !== undefined) {
      const n = act.n;
      if (act.kind === "ballroll") { P.wantX = 0; P.wantY = act.dy * 4.2; }
      else if (act.kind === "roulette") { const l = len(act.dx, act.dy) || 1; P.wantX = (act.dx / l) * 4; P.wantY = (act.dy / l) * 4; }
      else if (act.kind === "stepover") { P.wantX *= 0.4; P.wantY *= 0.4; }
      else if (act.kind === "heelflick") { const a = att(st, P.t); P.wantX = a * P.spd; P.wantY = 0; }
      else if (act.kind === "fakeshot") { P.wantX *= 0.3; P.wantY *= 0.3; }
      if (act.f >= n) { P.act = null; if (act.kind === "stepover" || act.kind === "ballroll" || act.kind === "roulette") P.burst = 24; }
    }
    else if (act.f >= (act.n || 10)) P.act = null;
  }
  let wx = P.wantX || 0, wy = P.wantY || 0;
  if (P.burst > 0) { P.burst--; wx *= 1.12; wy *= 1.12; }
  const has = st.ball.own === P.g;
  if (has) {
    // a man standing in his way slows him: he has to go round, or through
    const ws = len(wx, wy);
    if (ws > 3) for (const Q of st.p) {
      if (Q.t === P.t || !alive(Q) || Q.stun) continue;
      const dx = Q.x - P.x, dy = Q.y - P.y, d = len(dx, dy);
      if (d < 1.3 && (dx * wx + dy * wy) / (d * ws) > 0.35) { const k = (2.6 + 1.2 * P.drib + 0.8 * (P.phys - Q.phys)) / ws; wx *= k; wy *= k; break; }
    }
  }
  const acc = (P.acc * (has ? 0.85 : 1)) * DT;
  let ax = wx - P.vx, ay = wy - P.vy;
  const al = len(ax, ay);
  if (al > acc) { ax = (ax / al) * acc; ay = (ay / al) * acc; }
  P.vx += ax; P.vy += ay;
  P.x += P.vx * DT; P.y += P.vy * DT;
  const s = len(P.vx, P.vy);
  if (!P.faceLock && s > 0.4) { P.fx = P.vx / s; P.fy = P.vy / s; }
  P.faceLock = false;
  if (P.z > 0) P.z = Math.max(0, P.z - 0.05);
  clampIn(P);
}
const clampIn = (P) => { P.x = clamp(P.x, -P_.hx - 3, P_.hx + 3); P.y = clamp(P.y, -3, P_.w + 3); };
function separate(st) {
  const ps = st.p;
  for (let i = 0; i < 22; i++) {
    const A = ps[i]; if (!alive(A)) continue;
    for (let j = i + 1; j < 22; j++) {
      const B = ps[j]; if (!alive(B)) continue;
      const dx = B.x - A.x, dy = B.y - A.y;
      if (dx > 0.7 || dx < -0.7 || dy > 0.7 || dy < -0.7) continue;
      const d = len(dx, dy);
      if (d < 0.7 && d > 1e-6) { const k = (0.7 - d) * 0.5 / d; A.x -= dx * k; A.y -= dy * k; B.x += dx * k; B.y += dy * k; }
    }
  }
}
function carry(st) {
  const b = st.ball;
  if (b.own < 0) return;
  const P = st.p[b.own], s = len(P.vx, P.vy);
  const off = P.role === "GK" && P.act?.kind === "hold" ? 0.3 : P.close ? 0.42 : 0.5 + s * (P.sprint ? 0.09 : 0.05);
  b.x = P.x + P.fx * off; b.y = P.y + P.fy * off; b.z = P.act?.kind === "hold" ? 1 : 0; b.vx = P.vx; b.vy = P.vy; b.vz = 0;
}

// ---- the whistle: out of play and goals -----------------------------------------------------------------
function lines(st) {
  const b = st.ball;
  if (b.own >= 0) {
    const P = st.p[b.own];
    if (Math.abs(b.x) <= P_.hx && b.y >= 0 && b.y <= P_.w) return;
    // a carrier stepping the ball out: he lost it over the line
    b.own = -1; b.lastT = P.t; b.lastG = P.g;
  }
  // the woodwork
  if (Math.abs(b.x) > P_.hx - 0.2 && Math.abs(b.x) < P_.hx + 0.3) {
    const py = Math.abs(Math.abs(b.y - 34) - P_.gw), pz = b.z - P_.bar;
    if (py < 0.18 && b.z < P_.bar + 0.1 && b.hit !== b.id && b.hitF !== st.frame - 1) { b.vx = -b.vx * 0.55; b.vy = b.vy * 0.6 + (b.y > 34 ? -1 : 1) * 1.5 * (Math.abs(b.y - 34) > P_.gw ? -1 : 1); b.id++; b.hit = b.id; b.hitF = st.frame; st.plan = null; forecast(st); say(st, "post", st.p[b.lastG] || null); return; }
    if (pz > -0.12 && pz < 0.16 && Math.abs(b.y - 34) < P_.gw && b.hit !== b.id) { b.vx = -b.vx * 0.5; b.vz = -Math.abs(b.vz) * 0.5 - 1; b.id++; b.hit = b.id; st.plan = null; forecast(st); say(st, "bar", st.p[b.lastG] || null); return; }
  }
  if (Math.abs(b.x) > P_.hx) {
    const end = b.x > 0 ? 1 : -1;
    if (Math.abs(b.y - 34) < P_.gw && b.z < P_.bar) {
      // a goal for the side attacking this end
      const T = att(st, 0) === end ? 0 : 1;
      return goal(st, T);
    }
    // whose end: the defenders' (goal kick or corner)
    const D = att(st, 0) === end ? 1 : 0;
    // a shot that goes wide through a crowd has usually brushed somebody: the corner is given
    if (b.lastT !== D && (b.kind === "shot" || b.kind === "header-shot") && Math.abs(b.y - 34) < 16) {
      let near = 0; for (const Q of team(st, D)) if (alive(Q) && Q.role !== "GK" && len(Q.x - (st.p[b.by]?.x ?? b.x), Q.y - (st.p[b.by]?.y ?? b.y)) < 7) near++;
      if (near && rnd(st) < 0.18 + 0.08 * near) b.lastT = D;
    }
    if (b.lastT === D) restart(st, "corner", 1 - D, b.x, b.y);
    else restart(st, "goal", D, b.x, b.y);
    say(st, b.lastT === D ? "corner" : "goalkick", null, { team: b.lastT === D ? 1 - D : D });
    return;
  }
  if (b.y < 0 || b.y > P_.w) {
    const T = 1 - (b.lastT < 0 ? 1 : b.lastT);
    restart(st, "throw", T, b.x, b.y);
    say(st, "throw", null, { team: T });
  }
}
function goal(st, T) {
  const b = st.ball, by = st.p[b.lastG], og = by && by.t !== T;
  const scorer = og ? by : by && by.t === T ? by : null;
  st.score[T]++;
  if (!og) st.stats.on[T]++;
  if (scorer && !og) scorer.goals++;
  if (st.lastShot && st.lastShot.t === T && st.plan === null && !(st.lastShot.id === b.id || st.lastShot.counted)) { /* counted at the shot */ }
  st.goals.push({ t: T, g: scorer ? scorer.g : -1, min: minuteOf(st), og, pen: b.kind === "pen" || st.penGoal === b.id });
  st.phase = "goal"; st.t = 0; st.ofs = null; st.plan = null; st.rs = null; st.stops += 2;
  st.celebrate = { t: T, g: scorer && !og ? scorer.g : team(st, T).filter(alive).sort((p, q) => q.r - p.r)[0].g };
  b.vx *= 0.15; b.vy *= 0.15; b.vz = 0; b.own = -1;
  if (st.so) return;
  say(st, og ? "owngoal" : "goal", scorer, { team: T });
}

// ---- restarts, played ------------------------------------------------------------------------------------
function restartPlay(st, pressed) {
  const rs = st.rs, b = st.ball, P = st.p[rs.taker], a = att(st, rs.team);
  st.t++;
  b.x = rs.x; b.y = rs.y; b.z = 0; b.vx = 0; b.vy = 0; b.vz = 0;
  if (st.t < rs.wait) return;
  const isHuman = rs.team === 0 && !st.cfg.auto && (st.cfg.lock < 0 || st.cfg.lock === P.i);
  if (isHuman && st.t < rs.wait + 600) return humanRestart(st, P, pressed);
  if (st.t < rs.wait + 15 + (rs.cpuAt || 0)) return;
  cpuRestart(st, P);
}
function go(st) { st.phase = "live"; st.rs = null; st.t = 0; for (const P of st.p) P.wall = false; st.wall = st.wall ? { ...st.wall, id: st.ball.id } : null; }
function humanRestart(st, P, pressed) {
  const rs = st.rs, m = st.mask, dir = dirIn(m), a = att(st, rs.team), released = st.prev & ~m;
  const aim = st.aim;
  if (rs.type === "pen" || (rs.type === "fk" && aim)) {
    // aim on the goal mouth (the stick), curl (LB / RB, free kicks), then hold B for power
    if (dir && !(m & BTN.B)) {
      aim.y = clamp(aim.y + dir[1] * 0.09, 34 - P_.gw - 1.2, 34 + P_.gw + 1.2);
      if (rs.type === "fk") aim.z = clamp(aim.z + (dir[0] * a) * -0.0, 0.2, 2.8);
    }
    if (rs.type === "fk" && st.v >= 2) { const s = att(st, rs.team) > 0 ? 1 : -1; if (m & BTN.RL) aim.curl = clamp(aim.curl - 0.05 * s, -3, 3); if (m & BTN.RR) aim.curl = clamp(aim.curl + 0.05 * s, -3, 3); if (m & BTN.RU) aim.z = clamp(aim.z + 0.03, 0.2, 2.8); if (m & BTN.RD) aim.z = clamp(aim.z - 0.03, 0.2, 2.8); }
    else if (rs.type === "fk") { if (pressed & BTN.LB) aim.curl = clamp(aim.curl - 1, -3, 3); if (pressed & BTN.RB) aim.curl = clamp(aim.curl + 1, -3, 3); if (m & BTN.RU) aim.z = clamp(aim.z + 0.03, 0.2, 2.8); if (m & BTN.RD) aim.z = clamp(aim.z - 0.03, 0.2, 2.8); }
    if (m & BTN.B) { st.held.B++; return; }
    if (released & BTN.B && st.held.B > 0) {
      const pw = Math.min(1, st.held.B / SHOT_FULL); st.held.B = 0;
      go(st);
      if (rs.type === "pen") return penaltyKick(st, P, aim.y, pw);
      return freeKickShot(st, P, aim.y, aim.z, aim.curl, pw);
    }
    if (rs.type === "pen") return;
  }
  if (pressed & BTN.A) {
    const d = dir || [a, 0], Q = mateToward(st, P, d[0], d[1], { cone: 0.1, max: rs.type === "throw" ? 25 : 45 }) || mateToward(st, P, d[0], d[1], { cone: -0.5 });
    go(st);
    if (rs.type === "throw") return throwIn(st, P, Q, false);
    if (Q) passTo(st, P, Q.x, Q.y, Q); else passTo(st, P, P.x + d[0] * 12, P.y + d[1] * 12, null);
    restartKind(st, rs);
    return;
  }
  if (pressed & (BTN.X | BTN.Y)) {
    const d = dir || [a, 0];
    go(st);
    if (rs.type === "throw") return throwIn(st, P, mateToward(st, P, d[0], d[1], { cone: 0.1, max: 40, far: true }), true);
    if (rs.type === "corner" || (rs.type === "fk" && uOf(st, rs.team, P.x) > 10)) { const [tx, ty, Q] = boxTarget(st, P, dir); lobTo(st, P, tx, ty, Q, "cross", 1); st.ball.kind = rs.type === "corner" ? "corner" : "fk"; restartKind(st, rs); return; }
    const Q = mateToward(st, P, d[0], d[1], { cone: 0.2, far: true, max: 70, fwd: true });
    if (Q) lobTo(st, P, Q.x + a * 3, Q.y, Q, "lob"); else lobTo(st, P, P.x + d[0] * 35, P.y + d[1] * 35, null, "lob");
    restartKind(st, rs);
  }
}
const restartKind = (st, rs) => { if (rs.type === "throw" || rs.type === "corner" || rs.type === "goal") st.ofs = null; };
function cpuRestart(st, P) {
  const rs = st.rs, a = att(st, rs.team), D = 1 - rs.team;
  go(st);
  if (rs.type === "pen") {
    const side = rnd(st) < 0.5 ? 1 : -1, r = rnd(st);
    return penaltyKick(st, P, r < 0.15 ? 34 : 34 + side * (1.5 + rnd(st) * 1.9), 0.45 + rnd(st) * 0.4);
  }
  if (rs.type === "fk" && st.aim && rnd(st) < 0.75) {
    const side = st.wall ? (rnd(st) < 0.6 ? (P.y > 34 ? 1 : -1) : (P.y > 34 ? -1 : 1)) : 1;
    return freeKickShot(st, P, 34 + side * (2.0 + rnd(st) * 1.3), 1.5 + rnd(st) * 0.7, side * (P.y > 34 ? 1 : -1) * 2, 0.6 + rnd(st) * 0.3);
  }
  if (rs.type === "throw") { let best = null, bs = -1e9; for (const Q of team(st, rs.team)) { if (Q === P || !alive(Q) || Q.role === "GK") continue; const d = len(Q.x - P.x, Q.y - P.y); if (d > 22) continue; const s = laneMargin(st, D, P.x, P.y, Q.x, Q.y, 12) + uOf(st, rs.team, Q.x) * 0.03 - d * 0.05; if (s > bs) { bs = s; best = Q; } } return throwIn(st, P, best, false); }
  if (rs.type === "corner" || (rs.type === "fk" && uOf(st, rs.team, P.x) > 12)) {
    if (rs.type === "corner" && rnd(st) < 0.15) { const Q = nearestMate(st, P); if (Q) { passTo(st, P, Q.x, Q.y, Q); st.ofs = null; return; } }
    const [tx, ty, Q] = boxTarget(st, P, null); lobTo(st, P, tx, ty, Q, "cross", 1); st.ball.kind = rs.type === "corner" ? "corner" : "fk"; restartKind(st, rs); return;
  }
  if (rs.type === "goal") {
    if (rnd(st) < 0.4) { const Q = team(st, rs.team).filter(Q => alive(Q) && LINE[Q.role] === 1).sort((p, q) => laneMargin(st, D, P.x, P.y, q.x, q.y, 12) - laneMargin(st, D, P.x, P.y, p.x, p.y, 12))[0]; if (Q && laneMargin(st, D, P.x, P.y, Q.x, Q.y, 12) > 1) { passTo(st, P, Q.x, Q.y, Q); st.ofs = null; return; } }
    const fw = team(st, rs.team).filter(Q => alive(Q) && LINE[Q.role] >= 2).sort((p, q) => q.phys - p.phys)[Math.floor(rnd(st) * 3)] || team(st, rs.team)[9];
    lobTo(st, P, fw.x + a * 3, fw.y, fw, "gk", 1.1); st.ofs = null; return;
  }
  // a free kick or a quick one: to the best open man
  const Q = mateToward(st, P, a, 0, { cone: -0.4, max: 40, fwd: true });
  if (Q && laneMargin(st, D, P.x, P.y, Q.x, Q.y, 12) > 0) passTo(st, P, Q.x, Q.y, Q);
  else { const N = nearestMate(st, P); if (N) passTo(st, P, N.x, N.y, N); else lobTo(st, P, a * 20, 34, null, "clear"); }
}
const nearestMate = (st, P) => team(st, P.t).filter(Q => Q !== P && alive(Q) && Q.role !== "GK").sort((p, q) => len(p.x - P.x, p.y - P.y) - len(q.x - P.x, q.y - P.y))[0] || null;
function throwIn(st, P, Q, long) {
  const b = st.ball;
  b.z = 1.9;
  const tx = Q ? Q.x + Q.vx * 0.3 : P.x + att(st, P.t) * 8, ty = Q ? Q.y : b.y > 34 ? b.y - 8 : b.y + 8;
  const d = len(tx - b.x, ty - b.y), T = clamp(0.45 + d / (long ? 22 : 18), 0.5, 1.6) * HZ;
  const sb = { x: b.x, y: b.y, z: b.z }; loft(sb, tx, ty, 0.3, T);
  kick(st, P, sb.vx, sb.vy, sb.vz, "throw", Q ? Q.g : -1, 0, true);
  P.act = { kind: "throw", f: 0, n: 14 };
  say(st, "throwin", P);
}
export function penaltyKick(st, P, aimY, power) {
  const a = att(st, P.t), b = st.ball, K = gkOf(st, 1 - P.t);
  const easy = P.t === 0 && !st.cfg.auto ? st.D.pen : 1;
  const err = (0.35 + 0.9 * (1 - P.shoot)) * easy * (power > 0.8 ? 1 + (power - 0.8) * 4 : 1);
  const ty = aimY + gauss(st) * err, tz = clamp(0.15 + power * 1.9 + Math.abs(gauss(st)) * 0.25 + (power > 0.9 ? (power - 0.9) * 8 : 0), 0.1, 5);
  const gx = a * P_.hx, speed = 17 + power * 13, dx = gx - b.x, dy = ty - b.y, d = len(dx, dy), T = d / speed;
  // the keeper goes early: a guess (the human keeper: the stick held at the kick)
  let dive;
  if (P.t === 1 && !st.cfg.auto) { const dr = dirIn(st.mask); dive = dr && Math.abs(dr[1]) > 0.3 ? (dr[1] > 0 ? 1 : -1) : 0; }
  else { const read = rnd(st) < 0.18 + 0.2 * K.gk; const side = ty > 34.6 ? 1 : ty < 33.4 ? -1 : 0; dive = read ? side : [1, -1, 0, 1, -1][Math.floor(rnd(st) * 5)]; }
  st.penGoal = b.id + 1;
  kick(st, P, (dx / d) * speed, (dy / d) * speed, (tz - b.z) / T + (G * T) / 2, "pen", -1, 0, true);
  // the save: overrides the open-play plan
  const gl = crossing(st, P.t);
  if (st.plan && !st.plan.miss && gl) {
    const side = gl.y > 34.6 ? 1 : gl.y < 33.4 ? -1 : 0, off = Math.abs(gl.y - 34), hiCorner = gl.z > 1.7 && off > 2.4;
    let p = 0;
    if (dive === side && side !== 0) p = clamp(0.62 + 0.25 * K.gk - (off - 1.5) * 0.18 - (hiCorner ? 0.35 : 0) - (speed - 22) * 0.02, 0.05, 0.85);
    else if (dive === 0 && side === 0) p = 0.8;
    else if (dive === 0 && off < 1.6) p = 0.45;
    st.plan.save = rnd(st) < p; st.plan.hold = st.plan.save && rnd(st) < 0.4;
    st.plan.react = st.frame;
    K.act = dive ? { kind: "dive", f: 0, dir: dive, y0: K.y, y1: 34 + dive * 2.9, n: 14, hi: gl.z > 1.2 } : { kind: "set", f: 0 };
  }
}
function freeKickShot(st, P, aimY, aimZ, curl, power) {
  const a = att(st, P.t), b = st.ball, gx = a * P_.hx;
  const easy = P.t === 0 && !st.cfg.auto ? st.D.fk : 1;
  const d0 = len(gx - b.x, aimY - b.y);
  const err = d0 * (0.014 + 0.04 * (1 - P.shoot)) * easy * (power > 0.85 ? 1 + (power - 0.85) * 6 : 1);
  const ty = aimY + gauss(st) * err, tz = aimZ + gauss(st) * err * 0.6 + (power > 0.9 ? (power - 0.9) * 10 : 0) - (power < 0.4 ? (0.4 - power) * 3 : 0);
  const speed = 18 + power * 12;
  // the curl bends the flight: aim off by what the spin will take back
  const spin = curl * 1.7 * -a;
  const sb = { x: b.x, y: b.y, z: 0 };
  const dx = gx - b.x, dy = ty - b.y, d = len(dx, dy), T = d / speed;
  const lateral = spin * T * T * 0.5 * 0.9;   // the spin's sideways drift over the flight (approx.)
  const px = -dy / d, py = dx / d;
  const ax = gx - px * lateral, ay = ty - py * lateral, ad = len(ax - b.x, ay - b.y);
  sb.vx = ((ax - b.x) / ad) * speed; sb.vy = ((ay - b.y) / ad) * speed; sb.vz = (tz + 0.6 - 0) / T + (G * T) / 2;
  kick(st, P, sb.vx, sb.vy, sb.vz, "fk-shot", -1, spin * 1.0, true);
  st.wall = st.wall ? { ...st.wall, id: st.ball.id } : null;
  say(st, "fkshot", P);
}
// The wall: a ball through it below the jump is charged down.
function wallCheck(st) {
  const W = st.wall, b = st.ball;
  if (!W || W.id !== b.id || b.own >= 0) return;
  const rx = b.x - W.cx, ry = b.y - W.cy, ux = W.py, uy = -W.px;   // ux,uy: toward the goal
  const along = rx * ux + ry * uy, across = rx * W.px + ry * W.py;
  if (Math.abs(along) < 0.45) {
    st.wall = null;
    if (Math.abs(across) < (W.n * 0.6) / 2 + 0.25 && b.z < 2.05) {
      const M = st.p[W.g[0]];
      touch(st, M); loose_(st, M, -b.vx * 0.25 + (rnd(st) - 0.5) * 6, -b.vy * 0.25 + (rnd(st) - 0.5) * 6, 2 + rnd(st) * 3);
      say(st, "wall", M);
    }
  }
}

// ---- the match ----------------------------------------------------------------------------------------------
export function step(st, mask = 0) {
  st.ev = [];
  if (st.phase === "over") return st;
  st.frame++;
  st.prev = st.mask; st.mask = st.cfg.auto ? 0 : mask & 0xffff;
  const pressed = st.mask & ~st.prev;
  if (st.cfg.lock >= 0 && !st.cfg.auto && alive(st.p[st.cfg.lock])) st.ctl = st.cfg.lock;
  if (st.phase === "break") { st.t++; if (st.t >= 150) secondHalf(st); return st; }
  if (st.phase === "shootout") { shootout(st, pressed); return st; }
  if (st.phase === "goal") return celebrate(st);
  if (st.phase === "kickoff") kickoffPhase(st, pressed);
  else if (st.phase === "dead") { teamThink(st); for (const P of st.p) if (alive(P) && P.g !== st.rs.taker) aiMove(st, P); restartPlay(st, pressed); if (st.phase === "dead") { for (const P of st.p) if (P.g !== st.rs?.taker) movePlayer(st, P); separate(st); } }
  if (st.phase === "live") live(st, pressed);
  // the clock runs through stoppages (the FC habit), and the added time is shown at the end of a half
  if (st.phase !== "goal" || st.t < 2) st.clock++;
  const L = st.half <= 2 ? st.halfLen : st.halfLen / 3;
  if (st.clock >= L && st.added < 0) { st.added = clamp(1 + Math.floor(st.stops / 6), 1, 5); say(st, "added", null, { mins: st.added }); }
  if (st.clock >= L + (st.added * L) / (st.half <= 2 ? 45 : 15) && st.added >= 0) {
    // the referee waits for a shot in flight and for a set piece in the box
    const b = st.ball, flying = b.own < 0 && (b.kind === "shot" || b.kind === "fk-shot" || b.kind === "header-shot" || b.kind === "pen" || b.kind === "cross" || b.kind === "corner");
    const pen = st.phase === "dead" && st.rs?.type === "pen";
    if (!flying && !pen && st.phase !== "goal") endHalf(st);
  }
  return st;
}
function live(st, pressed) {
  const b = st.ball;
  teamThink(st);
  const ctlP = st.p[st.ctl];
  for (const P of st.p) {
    if (!alive(P)) continue;
    if (human(st, P) && !(P.role === "GK" && b.own !== P.g)) {
      humanPlay(st, P, pressed);
      if (!P.manual && !P.act) {
        // nobody on the stick: a receiver still goes to meet the ball; on easy, your man keeps his place
        if (b.recv === P.g || (b.own < 0 && st.chase[0] === P.g && st.D.help)) { const [x, y] = P.icpt || intercept(st, P); setTarget(P, x, y, true, 0.15); }
        else if (st.D.help && ballTeam(st) !== 0) aiMove(st, P);
        else if (st.cfg.lock >= 0 && b.own !== P.g) aiMove(st, P);
      }
    } else if (b.own === P.g) carrierThink(st, P);
    else aiMove(st, P);
  }
  void ctlP;
  for (const P of st.p) movePlayer(st, P);
  separate(st);
  carry(st);
  if (b.own < 0) {
    ballPhys(b);
    if ((st.frame - st.pathAt) >= 30) forecast(st);
  }
  wallCheck(st);
  keeperAct(st);
  if (st.phase !== "live") return;
  contacts(st);
  if (st.phase !== "live") return;
  lines(st);
  // possession: time on the ball, and a pass in flight to a teammate (a clearance or a loose ball is nobody's)
  const bt = b.own >= 0 ? st.p[b.own].t : b.recv >= 0 && st.p[b.recv].t === b.lastT ? b.lastT : -1;
  if (bt >= 0) st.stats.poss[bt]++;
  // on losing the ball, your control goes to the nearest man
  if (b.own >= 0 && st.p[b.own].t === 1 && st.possT === 0 && st.cfg.lock < 0 && !st.cfg.auto) { const Q = nearestToBall(st, 0); if (Q) st.ctl = Q.i; }
  st.possT = b.own >= 0 ? st.p[b.own].t : st.possT;
}
function kickoffPhase(st, pressed) {
  st.t++;
  const T = st.kickTeam, P = st.p[st.taker], b = st.ball;
  b.x = 0; b.y = 34; P.x = -att(st, T) * 0.3; P.y = 34;
  const hum = T === 0 && !st.cfg.auto && (st.cfg.lock < 0 || st.cfg.lock === P.i);
  if (st.t < 40) return;
  if (hum && !(pressed & (BTN.A | BTN.X | BTN.Y | BTN.B)) && st.t < 300) return;
  if (!hum && st.t < 70) return;
  st.phase = "live"; st.t = 0;
  const dir = hum ? dirIn(st.mask) : null, a = att(st, T);
  const Q = mateToward(st, P, dir ? dir[0] : -a * 0.6, dir ? dir[1] : (rnd(st) < 0.5 ? 0.8 : -0.8), { cone: -0.1, max: 30 });
  if (Q) passTo(st, P, Q.x, Q.y, Q); else passTo(st, P, -a * 8, 34, null);
  st.ofs = null;
  say(st, "kickoff", P);
}
function celebrate(st) {
  st.t++;
  const c = st.celebrate, S = st.p[c.g], a = att(st, c.t);
  // the scorer runs for the corner flag, arms out; his teammates chase him; the others trudge
  const cx = a * (P_.hx - 2), cy = S.y > 34 ? P_.w - 3 : 3;
  for (const P of st.p) {
    if (!alive(P)) continue;
    if (P === S) setTarget(P, cx, cy, true, 0.2);
    else if (P.t === c.t && P.role !== "GK") setTarget(P, cx - a * 1.5 * ((P.i % 3) + 1), cy + (cy > 34 ? -1 : 1) * (P.i % 4), true, 0.3);
    else { P.wantX = 0; P.wantY = 0; }
    P.act = P === S ? { kind: "celebrate", f: st.t } : P.act?.kind === "dive" ? P.act : null;
  }
  for (const P of st.p) if (alive(P)) movePlayer(st, P);
  const b = st.ball; if (b.own < 0) ballPhys(b);
  if (Math.abs(b.x) > P_.hx + 1.6) { b.x = Math.sign(b.x) * (P_.hx + 1.6); b.vx = 0; }
  st.clock++;
  if (st.t >= 260) {
    for (const P of st.p) P.act = null;
    setKickoff(st, 1 - c.t);
  }
  return st;
}
function endHalf(st) {
  const lvl = st.score[0] === st.score[1];
  if (st.half === 1 || st.half === 3) { st.phase = "break"; st.t = 0; say(st, st.half === 1 ? "halftime" : "etbreak"); return; }
  if (st.half === 2 && lvl && st.cfg.ko) { st.phase = "break"; st.t = 0; st.etNext = true; say(st, "fulltime-level"); return; }
  if (st.half === 4 && lvl) { startShootout(st); return; }
  st.phase = "over"; say(st, "final");
}
function secondHalf(st) {
  st.half++; st.clock = 0; st.added = -1; st.stops = 0; st.etNext = false;
  for (const P of st.p) { P.act = null; P.run = null; P.stun = 0; }
  setKickoff(st, st.half % 2 === 1 ? st.firstKick : 1 - st.firstKick);
  say(st, st.half === 2 ? "secondhalf" : "extratime");
}

// ---- the shootout ---------------------------------------------------------------------------------------
function startShootout(st) {
  st.phase = "shootout"; st.half = 5; st.so = { kicks: [[], []], n: 0, first: rnd(st) < 0.5 ? 0 : 1, stage: "next", t: 0, taker: -1 };
  st.pens = [0, 0];
  say(st, "shootout");
}
export function shootoutOver(so) {
  const [A, B] = so.kicks, ga = A.filter(Boolean).length, gb = B.filter(Boolean).length, na = A.length, nb = B.length;
  if (na <= 5 && nb <= 5) {
    if (ga + (5 - na) < gb || gb + (5 - nb) < ga) return true;
    if (na === 5 && nb === 5) return ga !== gb;
    return false;
  }
  return na === nb && ga !== gb;
}
function shootout(st, pressed) {
  const so = st.so, b = st.ball;
  if (so.stage === "next") {
    if (shootoutOver(so)) { st.phase = "over"; say(st, "final"); return; }
    const T = so.n % 2 === 0 ? so.first : 1 - so.first, k = so.kicks[T].length;
    // takers: best shooters first, the keeper last; every kick at the same goal (the right-hand one)
    const order = team(st, T).filter(alive).sort((p, q) => (p.role === "GK") - (q.role === "GK") || q.shoot - p.shoot || p.i - q.i);
    const P = order[k % order.length];
    st.half = T === 0 ? 5 : 6;
    so.T = T; so.taker = P.g;
    for (const Q of st.p) if (alive(Q)) place(Q, (Q.i - 5) * 0.9, 34 + (Q.t ? 6 : -6));
    restart(st, "pen", T, P_.hx - P_.spot, 34, 60);
    st.rs.taker = P.g; place(P, P_.hx - P_.spot - 1.2, 34); P.fx = 1; P.fy = 0;
    if (T === 0 && !st.cfg.auto) st.ctl = P.i;
    st.phase = "shootout"; so.stage = "set";
    return;
  }
  if (so.stage === "set") {
    st.phase = "dead";
    restartPlay(st, pressed);
    const kicked = st.phase === "live";
    st.phase = "shootout";
    if (kicked) { so.stage = "live"; so.t = 0; so.id = b.id; }
    return;
  }
  for (const P of st.p) movePlayer(st, P);
  if (b.own < 0) ballPhys(b);
  if (so.stage === "live") {
    so.t++;
    keeperAct(st);
    const crossed = b.x > P_.hx;
    let res = null;
    if (crossed) res = Math.abs(b.y - 34) < P_.gw && b.z < P_.bar;
    else if (b.own >= 0 || so.t > 110 || (b.id !== so.id && len(b.vx, b.vy) < 2) || b.y < 0 || b.y > P_.w) res = false;
    if (res !== null) {
      so.kicks[so.T].push(res); so.n++;
      if (res) st.pens[so.T]++;
      say(st, res ? "pengoal" : "penmiss", st.p[so.taker], { team: so.T });
      so.stage = "wait"; so.wait = 100;
      if (b.own >= 0) b.own = -1;
    }
    return;
  }
  if (so.stage === "wait" && --so.wait <= 0) so.stage = "next";
}

// ---- the record -------------------------------------------------------------------------------------------------
export function resultOf(st) {
  const s = st.score, pens = st.pens;
  const winner = s[0] > s[1] ? 0 : s[1] > s[0] ? 1 : pens ? (pens[0] > pens[1] ? 0 : 1) : -1;
  return { score: [...s], pens: pens ? [...pens] : null, winner, goals: st.goals.map(g => ({ ...g })), stats: JSON.parse(JSON.stringify(st.stats)), frames: st.frame };
}
export function rleEncode(masks) {
  const out = [];
  for (let i = 0; i < masks.length;) { let j = i; while (j < masks.length && masks[j] === masks[i]) j++; out.push(masks[i], j - i); i = j; }
  return out;
}
export function rleDecode(log) {
  const out = [];
  for (let i = 0; i + 1 < log.length; i += 2) for (let k = 0; k < log[i + 1]; k++) out.push(log[i]);
  return out;
}
// {version, seed, cfg, inputLog} -> the result, replayed frame by frame on its own version's rules;
// a version this sim does not know is refused.
export function replay(rec) {
  if (!rec || !VERSIONS.includes(rec.version)) throw new Error("soccer: a record of another version");
  const st = newGame(rec.seed, rec.cfg, rec.version), masks = rleDecode(rec.inputLog);
  let i = 0;
  while (st.phase !== "over" && i < masks.length) step(st, masks[i++]);
  while (st.phase !== "over" && i < masks.length + 400000) { step(st, 0); i++; }
  return resultOf(st);
}

// ---- for the checks -----------------------------------------------------------------------------------------------
export const _test = { kick, own, offsideSnap, touch, standingTackle, slideStart, foul, keeperPlan, forecast, shoot, team, gkOf, setKickoff, uOf, xOf, place, passTo, lines, crossing, endHalf, startShootout };
