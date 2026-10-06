// FOURTH AND LONG (#tecmo): the arcade football cabinet's game, pure. Eleven a side on a side-scrolling
// field, four plays a team (two runs, two passes), the defence guessing the play, button-mash to break
// a tackle. Our own game in the 8-bit sports tradition; nothing here is anyone else's: the teams are
// the city's football league, the art is drawn in render.js.
//
// Pure and deterministic: a seeded generator on the state, a fixed 60 Hz step, only + - * / and
// Math.sqrt on numbers. The whole game is (cfg, seed, one input word per frame): replay() re-runs it.
// The input word: player 1's buttons in the low byte, player 2's in the next. A CPU side's byte is
// ignored (its choices come from the generator), so a side's buttons can only move its own men.
//
// Field: x in yards, 0 = the left goal line, 100 = the right; the end zones are -10..0 and 100..110.
// Team 0 attacks right (+x) all game, team 1 left. y across, 0 (far sideline, top of the screen) to
// FW (the near sideline).

export const VERSION = 1;
export const HZ = 60;
const DT = 1 / HZ;
export const BTN = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, A: 16, B: 32 };
export const FW = 160 / 3;
export const CY = FW / 2;
export const QLENS = [1, 2, 3];   // minutes a quarter, on a running arcade clock

// Offence and defence slots (a team's eleven fill both: the league plays both ways).
export const O = { QB: 0, RB: 1, FB: 2, WR1: 3, WR2: 4, TE: 5, LT: 6, LG: 7, C: 8, RG: 9, RT: 10 };
export const D = { LE: 0, NT: 1, RE: 2, LOLB: 3, LILB: 4, RILB: 5, ROLB: 6, LCB: 7, RCB: 8, FS: 9, SS: 10 };
export const O_NAMES = ["QB", "RB", "FB", "WR", "WR", "TE", "LT", "LG", "C", "RG", "RT"];
export const D_NAMES = ["DE", "NT", "DE", "OLB", "ILB", "ILB", "OLB", "CB", "CB", "FS", "SS"];
const OL = [O.LT, O.LG, O.C, O.RG, O.RT];
export const ELIGIBLE = [O.WR1, O.WR2, O.TE, O.RB];   // B cycles them in this order
// [lat (yards across from the ball, + is toward the near sideline), back (yards behind the line)]
const OFF_FORM = [[0, 1.3], [0, 6.4], [0, 3.9], [-19, 0.8], [19, 0.8], [4.8, 0.8], [-3.2, 0.7], [-1.6, 0.7], [0, 0.5], [1.6, 0.7], [3.2, 0.7]];
const DEF_FORM = [[-2.6, 1.1], [0, 1.1], [2.8, 1.1], [-6.5, 3.2], [-2, 4.6], [2, 4.6], [6.8, 3.2], [-19, 6.5], [19, 6.5], [-5, 13], [5, 11]];
// the order the defence's B cycles the man you control
export const D_CYCLE = [D.RILB, D.LILB, D.ROLB, D.LOLB, D.RE, D.NT, D.LE, D.LCB, D.RCB, D.SS, D.FS];

// ---- the playbook -------------------------------------------------------------------------------------
// Runs: the carrier's path, [down (toward the goal), lat] from where he stands. Passes: each receiver's
// route, [down, lat] from his spot; "settle" stops at the end and turns to the ball, otherwise he runs on.
export const PLAYS = {
  dive: { name: "DIVE", kind: "run", path: [[5.5, 0.7], [40, 0.9]] },
  sweepL: { name: "SWEEP LEFT", kind: "run", path: [[3, -6], [6, -12], [40, -13]] },
  sweepR: { name: "SWEEP RIGHT", kind: "run", path: [[3, 6], [6, 12], [40, 13]] },
  power: { name: "OFF TACKLE", kind: "run", path: [[5, -3.4], [40, -4.4]] },
  slants: { name: "SLANTS", kind: "pass", routes: { [O.WR1]: { pts: [[2, 0], [14, 10], [30, 22]] }, [O.WR2]: { pts: [[2, 0], [14, -10], [30, -22]] }, [O.TE]: { pts: [[6, 0], [5, -0.6]], settle: true }, [O.RB]: { pts: [[1, -3], [3, -12], [5, -22]] } } },
  bomb: { name: "BOMB", kind: "pass", routes: { [O.WR1]: { pts: [[50, 1]] }, [O.WR2]: { pts: [[50, -1]] }, [O.TE]: { pts: [[12, 0], [40, -8]] }, [O.RB]: { pts: [[1, 3], [4, 6]], settle: true } } },
  outs: { name: "QUICK OUTS", kind: "pass", routes: { [O.WR1]: { pts: [[8, 0], [8.5, -8], [9, -20]] }, [O.WR2]: { pts: [[8, 0], [8.5, 8], [9, 20]] }, [O.TE]: { pts: [[10, 0], [26, 6]] }, [O.RB]: { pts: [[1, 4], [3, 14], [5, 24]] } } },
  cross: { name: "CROSSERS", kind: "pass", routes: { [O.WR1]: { pts: [[4, 2], [8, 34]] }, [O.WR2]: { pts: [[10, 0], [11, -30]] }, [O.TE]: { pts: [[18, 0], [40, 2]] }, [O.RB]: { pts: [[2, -4], [4, -6]], settle: true } } },
};
const RUNS = ["dive", "sweepL", "sweepR", "power"], PASSES = ["slants", "bomb", "outs", "cross"];
function fnv(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
// Each team's four, fixed for the team: two runs over two passes (the 2 x 2 card on the call screen).
export function bookOf(teamId) {
  const h = fnv(`book|${teamId}`);
  const r1 = h % 4, r2 = (r1 + 1 + ((h >>> 4) % 3)) % 4, p1 = (h >>> 8) % 4, p2 = (p1 + 1 + ((h >>> 12) % 3)) % 4;
  return [RUNS[r1], RUNS[r2], PASSES[p1], PASSES[p2]];
}
export const KICK_PUNT = 4, KICK_FG = 5;

// ---- the numbers ------------------------------------------------------------------------------------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const len = (x, y) => Math.sqrt(x * x + y * y);
export const dirOf = (t) => (t === 0 ? 1 : -1);
export const goalOf = (t) => (t === 0 ? 100 : 0);        // the goal line team t attacks
export const ownGoal = (t) => (t === 0 ? 0 : 100);
export const toGoal = (t, x) => (t === 0 ? 100 - x : x);
export const fromOwn = (t, yd) => (t === 0 ? yd : 100 - yd);
// mulberry32 on the state's own word
function rnd(st) {
  let t = (st.rng = (st.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
// A rating (0..99) -> what a man can do. One rating does it all; the key tilts it a little, so two
// 52s are not the same man. A star really is faster: 6.2 yards a second at the bottom, 9.6 at the top.
export function abilities(r, key = "") {
  const k = clamp((r - 40) / 50, 0, 1), h = fnv(String(key));
  const tilt = (s) => (((h >>> s) & 255) / 255 - 0.5) * 0.16;
  const sp = clamp(k + tilt(0), 0, 1), sg = clamp(k + tilt(8), 0, 1), sk = clamp(k + tilt(16), 0, 1);
  return { k, spd: 6.2 + 3.4 * sp, str: sg, tak: clamp((sg + k) / 2, 0, 1), hands: sk, cov: clamp((sk + sp) / 2, 0, 1), arm: sk, kick: sg };
}
// Who plays where: named football players take their own spots; the rest by rating, the best to the
// ball. The defence by rating too, the quarterback last. The kicker: the eleven's lowest rated (the
// league's box score says so); the returner: the fastest of the backs and the wideouts.
const OFF_HINT = { "tom-brady": "QB", "jalen-hurts": "QB", "joe-namath": "QB", "nick-foles": "QB", "andy-dalton": "QB", "peyton-manning": "QB", "archie-manning": "QB", "walter-payton": "RB", "oj-simpson": "RB", "a-j-brown": "WR", "deion-sanders": "WR", "travis-kelce": "TE", "aaron-hernandez": "TE", "jason-kelce": "C" };
const DEF_HINT = { "fred-williamson": "DB", "deion-sanders": "DB", "andre-the-giant": "DL", "jason-kelce": "DL" };
export function lineup(rows) {
  const n = rows.length;
  const idx = [...Array(n).keys()].sort((a, b) => rows[b][2] - rows[a][2] || (rows[a][0] < rows[b][0] ? -1 : 1));
  const os = new Array(11).fill(-1), used = new Set();
  const want = { QB: [O.QB], RB: [O.RB, O.FB], WR: [O.WR1, O.WR2], TE: [O.TE], C: [O.C] };
  for (const i of idx) { const h = OFF_HINT[rows[i][0]]; if (!h) continue; const s = want[h].find(q => os[q] < 0); if (s != null) { os[s] = i; used.add(i); } }
  let j = 0;
  for (const s of [O.QB, O.RB, O.WR1, O.WR2, O.TE, O.FB, O.C, O.LG, O.RG, O.LT, O.RT]) if (os[s] < 0) { while (used.has(idx[j])) j++; os[s] = idx[j]; used.add(idx[j]); }
  const ds = new Array(11).fill(-1), dused = new Set();
  const dwant = { DB: [D.LCB, D.RCB, D.FS, D.SS], DL: [D.RE, D.LE, D.NT] };
  for (const i of idx) { const h = DEF_HINT[rows[i][0]]; if (!h) continue; const s = dwant[h].find(q => ds[q] < 0); if (s != null) { ds[s] = i; dused.add(i); } }
  const order = idx.filter(i => i !== os[O.QB]).concat([os[O.QB]]);
  j = 0;
  for (const s of [D.RILB, D.LCB, D.FS, D.RE, D.RCB, D.SS, D.LE, D.LILB, D.ROLB, D.LOLB, D.NT]) if (ds[s] < 0) { while (dused.has(order[j])) j++; ds[s] = order[j]; dused.add(order[j]); }
  let k = idx[n - 1];
  if (k === os[O.QB]) k = idx[n - 2];
  const backs = [O.RB, O.WR1, O.WR2].map(s => os[s]);
  const ret = backs.sort((a, b) => rows[b][2] - rows[a][2] || a - b)[0];
  return { os, ds, k, ret };
}

// ---- a new game ------------------------------------------------------------------------------------
// cfg: { qlen, sides: ["human" | "cpu", ...] x 2, teams: [{id, rows: [[key, name, rating] x 11]}, x 2] }
export function newGame(cfg, seed) {
  const st = {
    v: VERSION, seed: seed >>> 0, rng: (seed >>> 0) || 1, frame: 0, cfg,
    p: [], lu: [], books: [], score: [0, 0], q: 1, clock: cfg.qlen * 60 * HZ, poss: 0, los: 25, down: 1, firstAt: 35,
    phase: "kick", pf: 0, lf: 0, prev: [0, 0], ev: [], ctrl: [-1, -1], dsel: [D.RILB, D.RILB], sel: [0, 0],
    call: null, play: null, ball: null, grab: null, freeze: 0, kick: null, dead: null, msg: null, td: null, firstKick: 1,
    stat: [0, 1].map(() => ({ rush: 0, pass: 0, breaks: 0, hits: 0, reads: 0, ints: 0, plays: 0 })), over: false,
  };
  for (let t = 0; t < 2; t++) {
    const rows = cfg.teams[t].rows;
    st.lu.push(lineup(rows));
    st.books.push(bookOf(cfg.teams[t].id));
    rows.forEach((row, i) => {
      const [key, name, r] = row;
      st.p.push({ t, i, g: t * 11 + i, key: String(key), name: String(name), r: r | 0, ...abilities(r | 0, String(key)), x: 0, y: 0, vx: 0, vy: 0, face: dirOf(t), down: 0, eng: -1, engF: 0, shedCD: 0, dive: 0, boost: 0, role: "", wp: 0, sx: 0, sy: 0, mark: -1, path: null, settle: false });
    });
  }
  setupKickoff(st, 1, false);   // the visitors kick off; the home side receives first
  return st;
}
const P = (st, t, i) => st.p[t * 11 + i];
export const offMan = (st, t, slot) => P(st, t, st.lu[t].os[slot]);
export const defMan = (st, t, slot) => P(st, t, st.lu[t].ds[slot]);
export const carrierOf = (st) => (st.ball && st.ball.state === "held" ? st.p[st.ball.g] : null);
const say = (st, text) => st.ev.push({ k: "say", text });
const ev = (st, k) => st.ev.push({ k });
export const spotName = (x) => { const yd = Math.round(x); return yd === 50 ? "50" : yd < 50 ? `${yd}` : `${100 - yd}`; };

// ---- setting up ------------------------------------------------------------------------------------
function resetMen(st) {
  for (const p of st.p) { p.vx = 0; p.vy = 0; p.down = 0; p.eng = -1; p.engF = 0; p.shedCD = 0; p.dive = 0; p.boost = 0; p.role = ""; p.wp = 0; p.mark = -1; p.path = null; p.settle = false; }
  st.grab = null; st.freeze = 0; st.lf = 0; st.dead = null;
}
function setupKickoff(st, kt, safety) {
  resetMen(st);
  const rt = 1 - kt, d = dirOf(kt), kx = safety ? fromOwn(kt, 20) : fromOwn(kt, 35);
  st.poss = rt;
  for (let i = 0; i < 11; i++) {
    const k = P(st, kt, i), isK = i === st.lu[kt].k;
    k.x = kx - d * (isK ? 5 : 1); k.y = isK ? CY : 3 + (i < st.lu[kt].k ? i : i - 1) * ((FW - 6) / 9); k.face = d; k.role = "cover";
  }
  const ret = st.lu[rt].ret;
  const spots = [[12, -16], [12, -8], [12, 0], [12, 8], [12, 16], [26, -12], [26, -4], [26, 4], [26, 12], [38, -8]];
  let s = 0;
  for (let i = 0; i < 11; i++) {
    const r = P(st, rt, i);
    if (i === ret) { r.x = kx + d * 55; r.y = CY + 6; r.role = "ret"; }
    else { const [dn, lat] = spots[s++]; r.x = kx + d * dn; r.y = CY + lat; r.role = "wall"; }
    r.face = -d;
  }
  st.kick = { kind: safety ? "free" : "kickoff", t: kt, x: kx, power: -1, cpuAt: 40 + Math.floor(rnd(st) * 30) };
  st.phase = "kick"; st.pf = 0; st.play = { kind: "kick", ret: true, scrim: false };
  st.ball = { state: "tee", x: kx, y: CY, z: 0 };
  st.ctrl = [-1, -1];
}
function newSeries(st, t, x, why = null) {
  st.poss = t; st.los = clamp(x, 1, 99); st.down = 1;
  st.firstAt = t === 0 ? Math.min(100, st.los + 10) : Math.max(0, st.los - 10);
  if (why) say(st, why);
}
// formation for a scrimmage down (or a punt, from the same set)
function lineUp(st) {
  resetMen(st);
  const o = st.poss, df = 1 - o, d = dirOf(o), los = st.los;
  for (let s = 0; s < 11; s++) {
    const p = offMan(st, o, s), [lat, back] = OFF_FORM[s];
    p.x = los - d * back; p.y = CY + lat; p.face = d; p.sx = p.x; p.sy = p.y;
  }
  for (let s = 0; s < 11; s++) {
    const p = defMan(st, df, s), [lat, dep] = DEF_FORM[s];
    p.x = los + d * dep; p.y = CY + lat; p.face = -d; p.sx = p.x; p.sy = p.y;
  }
  st.ball = { state: "spot", x: los, y: CY, z: 0 };
}
export const kicksOpen = (st) => (st.down === 4 ? { punt: true, fg: toGoal(st.poss, st.los) + 17 <= 58 } : { punt: false, fg: false });
function setupCall(st) {
  lineUp(st);
  st.phase = "call"; st.pf = 0;
  st.call = { cur: [0, 0], lock: [false, false], pick: [-1, -1], cpuAt: [30 + Math.floor(rnd(st) * 40), 30 + Math.floor(rnd(st) * 40)] };
  const o = st.poss;
  say(st, `${downName(st.down)} AND ${togoText(st)} ON THE ${sideOf(st)}. CHOOSE A PLAY.`);
  void o;
}
export const downName = (n) => ["", "1ST", "2ND", "3RD", "4TH"][n] || `${n}TH`;
export function togoText(st) { const g = st.poss === 0 ? st.firstAt >= 100 : st.firstAt <= 0; return g ? "GOAL" : String(Math.max(1, Math.round(Math.abs(st.firstAt - st.los)))); }
export function sideOf(st) { const yd = Math.round(st.los); if (yd === 50) return "50"; const own = st.poss === 0 ? yd < 50 : yd > 50; return `${own ? "OWN" : "THEIR"} ${yd < 50 ? yd : 100 - yd}`; }

// ---- the CPU's choices --------------------------------------------------------------------------------
function passLean(st) {
  const togo = Math.abs(st.firstAt - st.los), behind = st.score[1 - st.poss] - st.score[st.poss], late = st.q >= 4 && st.clock < 50 * HZ;
  let p = 0.42 + (togo > 7 ? 0.25 : 0) + (st.down === 3 && togo > 4 ? 0.2 : 0) - (togo <= 2 ? 0.25 : 0) + (late && behind > 0 ? 0.25 : 0);
  return clamp(p, 0.1, 0.92);
}
function cpuOffence(st) {
  const o = st.poss, k = kicksOpen(st), togo = Math.abs(st.firstAt - st.los), tg = toGoal(o, st.los);
  const behind = st.score[1 - o] - st.score[o], late = st.q >= 4 && st.clock < 70 * HZ;
  if (st.down === 4) {
    const goFor = (togo <= 2 && tg < 55) || (late && behind > 0 && !(k.fg && behind <= 3));
    if (!goFor) return k.fg ? KICK_FG : KICK_PUNT;
  }
  const pass = rnd(st) < passLean(st);
  return (pass ? 2 : 0) + (rnd(st) < 0.5 ? 0 : 1);
}
function cpuDefence(st) {
  const pass = rnd(st) < 0.5 + (passLean(st) - 0.5) * 0.6;
  return (pass ? 2 : 0) + (rnd(st) < 0.5 ? 0 : 1);
}

// ---- the step ---------------------------------------------------------------------------------------
export function step(st, input = 0) {
  st.ev = [];
  if (st.over) return st;
  st.frame++;
  const m = [input & 255, (input >>> 8) & 255].map((x, s) => (st.cfg.sides[s] === "human" ? x : 0));
  const e = m.map((x, s) => x & ~st.prev[s]);
  st.prev = m;
  st.pf++;
  if (st.msg && --st.msg.f <= 0) st.msg = null;
  switch (st.phase) {
    case "call": stepCall(st, e); break;
    case "pre": stepPre(st, m, e); break;
    case "kick": stepKick(st, e); break;
    case "fg": stepFg(st); break;
    case "live": stepLive(st, m, e); break;
    case "dead": if (st.freeze > 0) st.freeze--; if (st.pf >= 75 || (st.pf >= 30 && (e[0] | e[1]) & BTN.A)) afterPlay(st); break;
    case "td": if (st.pf >= 170 || (st.pf >= 45 && (e[0] | e[1]) & BTN.A)) setupPat(st); break;
    case "quarter": if (st.pf >= 110 || (st.pf >= 35 && (e[0] | e[1]) & BTN.A)) afterQuarter(st); break;
    default: break;
  }
  return st;
}

function stepCall(st, e) {
  const c = st.call, o = st.poss, k = kicksOpen(st);
  for (let s = 0; s < 2; s++) {
    if (c.lock[s]) continue;
    const isO = s === o;
    if (st.cfg.sides[s] === "human") {
      const ok = (i) => i >= 0 && (i < 4 || (isO && ((i === KICK_PUNT && k.punt) || (i === KICK_FG && k.fg))));
      let i = c.cur[s];
      const row = Math.floor(i / 2), col = i % 2;
      if (e[s] & (BTN.LEFT | BTN.RIGHT) && ok(row * 2 + 1 - col)) { i = row * 2 + 1 - col; ev(st, "cursor"); }
      for (const [bit, dr] of [[BTN.DOWN, 1], [BTN.UP, 2]]) {
        if (!(e[s] & bit)) continue;
        for (let n = 1; n <= 2; n++) { const r = (row + dr * n) % 3; const j = ok(r * 2 + col) ? r * 2 + col : ok(r * 2 + 1 - col) ? r * 2 + 1 - col : -1; if (j >= 0) { i = j; ev(st, "cursor"); break; } }
      }
      c.cur[s] = i;
      if ((e[s] & BTN.A && st.pf >= 12) || st.pf >= 25 * HZ) { c.pick[s] = i; c.lock[s] = true; ev(st, "lock"); }
    } else if (st.pf >= c.cpuAt[s]) {
      c.pick[s] = isO ? cpuOffence(st) : cpuDefence(st); c.lock[s] = true; c.cur[s] = c.pick[s];
    }
  }
  if (c.lock[0] && c.lock[1] && st.pf >= 20) beginPlay(st);
}

function beginPlay(st) {
  const o = st.poss, df = 1 - o, pick = st.call.pick[o], guess = st.call.pick[df];
  st.stat[o].plays++;
  if (pick === KICK_PUNT) return setupPunt(st);
  if (pick === KICK_FG) return setupFg(st, false);
  const id = st.books[o][pick], pl = PLAYS[id], read = guess === pick;
  st.play = { id, name: pl.name, kind: pl.kind, read, ret: false, scrim: true, idx: pick, thrown: false, handF: 10, target: -1 };
  if (read) st.stat[df].reads++;
  const d = dirOf(o);
  // the offence's jobs
  for (let s = 0; s < 11; s++) {
    const p = offMan(st, o, s);
    if (OL.includes(s)) p.role = pl.kind === "pass" ? "protect" : "block";
    else if (s === O.QB) p.role = "qb";
    else if (pl.kind === "run") p.role = s === O.RB ? "runner" : s === O.FB ? "lead" : "block";
    else if (pl.routes[s]) { p.role = "route"; p.path = pl.routes[s].pts; p.settle = Boolean(pl.routes[s].settle); }
    else p.role = "protect";
  }
  if (pl.kind === "run") { const rb = offMan(st, o, O.RB); rb.path = pl.path; rb.wp = 0; }
  // the defence's: the line rushes, the backers read, the corners and safeties take a man
  for (let s = 0; s < 11; s++) {
    const p = defMan(st, df, s);
    p.role = s <= D.RE ? "rush" : s <= D.ROLB ? (s === D.LOLB || s === D.ROLB ? "rushlb" : "zone") : "man";
    p.mark = -1;
  }
  const mk = (ds, os) => { defMan(st, df, ds).mark = offMan(st, o, os).g; };
  mk(D.LCB, O.WR1); mk(D.RCB, O.WR2); mk(D.SS, O.TE); mk(D.FS, O.WR1);
  defMan(st, df, D.LOLB).mark = offMan(st, o, O.RB).g;
  // the blocking: each blocker takes the nearest front man nobody has (the line, then the backers)
  const front = [D.LE, D.NT, D.RE, D.LOLB, D.ROLB, D.LILB, D.RILB].map(s => defMan(st, df, s));
  const blockers = (pl.kind === "run" ? [...OL, O.TE, O.FB] : [...OL]).map(s => offMan(st, o, s));
  const taken = new Set();
  for (const bl of blockers) {
    let best = null, bd = 1e9;
    for (const q of front) { if (taken.has(q.g)) continue; const k = len(q.x - bl.x, (q.y - bl.y) * 1.3); if (k < bd) { bd = k; best = q; } }
    if (best) { taken.add(best.g); bl.mark = best.g; }
  }
  // the targets B cycles: the first open man on the card
  st.sel[o] = 0;
  st.ball = { state: "spot", x: st.los, y: CY, z: 0 };
  st.phase = "pre"; st.pf = 0;
  st.ctrl[o] = offMan(st, o, pl.kind === "run" ? O.RB : O.QB).g;
  st.ctrl[df] = defMan(st, df, st.dsel[df]).g;
  say(st, `${st.cfg.teams[o].short || "OFFENCE"}: ${pl.name}.`);
}

function stepPre(st, m, e) {
  const o = st.poss, df = 1 - o;
  if (st.cfg.sides[df] === "human" && e[df] & BTN.B) {
    const k = (D_CYCLE.indexOf(st.dsel[df]) + 1) % D_CYCLE.length;
    st.dsel[df] = D_CYCLE[k]; st.ctrl[df] = defMan(st, df, st.dsel[df]).g; ev(st, "cursor");
  }
  const human = st.cfg.sides[o] === "human";
  const go = human ? (st.pf >= 18 && e[o] & BTN.A) || st.pf >= 10 * HZ : st.pf >= 45;
  if (!go) return;
  st.phase = "live"; st.pf = 0; st.lf = 0;
  const qb = offMan(st, o, O.QB);
  st.ball = { state: "held", g: qb.g, x: qb.x, y: qb.y, z: 0 };
  ev(st, "snap");
  if (st.play.read) { st.msg = { text: "PLAY READ!", f: 70 }; ev(st, "read"); say(st, "THE DEFENCE READ THE PLAY."); }
}

// ---- kicks ------------------------------------------------------------------------------------------
export const meterAt = (pf) => { const u = (pf % 70) / 35; return u <= 1 ? u : 2 - u; };
function setupPunt(st) {
  const o = st.poss, d = dirOf(o);
  st.play = { kind: "kick", ret: true, scrim: false, name: "PUNT" };
  const k = P(st, o, st.lu[o].k);
  k.x = st.los - d * 12; k.y = CY;
  const r = P(st, 1 - o, st.lu[1 - o].ret);
  r.x = st.los + d * 40; r.y = CY;
  for (const p of st.p) { if (p.t === o && p !== k) p.role = "cover"; else if (p.t !== o) p.role = p === r ? "ret" : "wall"; }
  st.kick = { kind: "punt", t: o, x: k.x, power: -1, cpuAt: 40 + Math.floor(rnd(st) * 25) };
  st.ball = { state: "tee", x: k.x, y: CY, z: 0 };
  st.phase = "kick"; st.pf = 0;
  say(st, "PUNT. PRESS A AT THE TOP OF THE METER.");
}
function setupFg(st, pat) {
  const o = st.poss, d = dirOf(o);
  if (pat) { lineUp(st); }
  st.play = { kind: "kick", ret: false, scrim: false, name: pat ? "EXTRA POINT" : "FIELD GOAL", pat };
  const k = P(st, o, st.lu[o].k);
  k.x = st.los - d * 7; k.y = CY;
  st.kick = { kind: pat ? "pat" : "fg", t: o, x: k.x, dist: toGoal(o, st.los) + 17, power: -1, cpuAt: 40 + Math.floor(rnd(st) * 25) };
  st.ball = { state: "tee", x: k.x, y: CY, z: 0 };
  st.phase = "kick"; st.pf = 0;
  if (!pat) say(st, `FIELD GOAL TRY FROM ${Math.round(st.kick.dist)} YARDS.`);
}
function setupPat(st) {
  newSeries(st, st.td.t, fromOwn(st.td.t, 97));
  setupFg(st, true);
}
function stepKick(st, e) {
  const K = st.kick, t = K.t;
  if (K.power >= 0) return;
  if (st.cfg.sides[t] === "human") {
    if (st.pf >= 12 && e[t] & BTN.A) K.power = meterAt(st.pf);
    else if (st.pf >= 12 * HZ) K.power = 0.5;
    else return;
  } else if (st.pf >= K.cpuAt) K.power = clamp(0.62 + 0.3 * rnd(st) + 0.08 * P(st, t, st.lu[t].k).kick, 0, 1);
  else return;
  launchKick(st);
}
function launchKick(st) {
  const K = st.kick, t = K.t, d = dirOf(t), kk = P(st, t, st.lu[t].k);
  ev(st, "kick");
  if (K.kind === "fg" || K.kind === "pat") {
    const range = 20 + 38 * K.power + 6 * kk.kick;
    K.good = K.kind === "pat" ? K.power >= 0.12 : range >= K.dist;
    st.ball = { state: "air", kind: "fg", x0: st.ball.x, y0: CY, x1: goalOf(t) + d * 10, y1: CY + (K.good ? 0 : (rnd(st) < 0.5 ? -1 : 1) * 4.5), f: 0, T: 54, h: 12, x: st.ball.x, y: CY, z: 0 };
    st.phase = "fg"; st.pf = 0;
    return;
  }
  // a kickoff or a punt: the ball goes up, the returner gets under it, the coverage runs
  const dist = K.kind === "punt" ? 30 + 22 * K.power + 4 * kk.kick : K.kind === "free" ? 38 + 18 * K.power : 44 + 26 * K.power + 4 * kk.kick;
  let x1 = K.x + d * dist;
  x1 = clamp(x1, -9, 109);
  const y1 = clamp(CY + (rnd(st) - 0.5) * 18, 6, FW - 6);
  const T = Math.round(HZ * (2.4 + dist / 45));
  st.ball = { state: "air", kind: "kick", x0: K.x, y0: CY, x1, y1, f: 0, T, h: 6 + dist * 0.25, x: K.x, y: CY, z: 0 };
  st.phase = "live"; st.pf = 0; st.lf = 0;
  st.poss = 1 - t;
  const rt = 1 - t;
  st.ctrl[rt] = P(st, rt, st.lu[rt].ret).g;
  // the kicking side's man: the one in the middle of the coverage
  let best = null, bd = 1e9;
  for (let i = 0; i < 11; i++) { const p = P(st, t, i); const dd = Math.abs(p.y - CY); if (i !== st.lu[t].k && dd < bd) { bd = dd; best = p; } }
  st.ctrl[t] = best.g;
}
function stepFg(st) {
  const b = st.ball;
  b.f++;
  const u = b.f / b.T;
  b.x = b.x0 + (b.x1 - b.x0) * u; b.y = b.y0 + (b.y1 - b.y0) * u; b.z = b.h * 4 * u * (1 - u) + 3 * u;
  if (b.f < b.T) return;
  const K = st.kick, t = K.t;
  if (K.good) {
    st.score[t] += K.kind === "pat" ? 1 : 3; ev(st, "good");
    say(st, `${K.kind === "pat" ? "THE EXTRA POINT" : "THE FIELD GOAL"} IS GOOD. ${scoreLine(st)}`);
    deadBall(st, K.kind === "pat" ? "pat" : "fg", b.x, K.kind === "pat" ? "GOOD!" : "IT'S GOOD!");
  } else {
    ev(st, "nogood");
    say(st, `NO GOOD. ${scoreLine(st)}`);
    deadBall(st, K.kind === "pat" ? "patmiss" : "fgmiss", b.x, "NO GOOD");
  }
}
export function scoreLine(st) { const n = st.cfg.teams; return `${n[0].short} ${st.score[0]}, ${n[1].short} ${st.score[1]}.`; }

// ---- the live ball ----------------------------------------------------------------------------------
function dpad(mask) {
  let x = (mask & BTN.RIGHT ? 1 : 0) - (mask & BTN.LEFT ? 1 : 0), y = (mask & BTN.DOWN ? 1 : 0) - (mask & BTN.UP ? 1 : 0);
  if (x && y) { x *= 0.7071; y *= 0.7071; }
  return [x, y];
}
// steer a man toward a velocity: dx, dy a unit direction (or zero to stop), mult his top speed
function drive(p, dx, dy, mult) {
  const sp = p.spd * mult * (p.boost > 0 ? 1.12 : 1);
  const tx = dx * sp, ty = dy * sp, k = 0.16;
  p.vx += (tx - p.vx) * k; p.vy += (ty - p.vy) * k;
}
function toward(p, x, y, mult = 1, stop = 0.25) {
  const dx = x - p.x, dy = y - p.y, l = len(dx, dy);
  if (l < stop) { drive(p, 0, 0, 0); return; }
  drive(p, dx / l, dy / l, mult * (l < 1.5 ? 0.6 + 0.4 * (l / 1.5) : 1));
}
// where to run to meet a moving man
function lead(p, c, k = 1) {
  const d = len(c.x - p.x, c.y - p.y), t = clamp(d / (p.spd + 0.1), 0, 1.2) * k;
  return [c.x + c.vx * t, c.y + c.vy * t];
}
const isUp = (p) => p.down <= 0 && p.dive <= 0;

function stepLive(st, m, e) {
  st.lf++;
  if (st.clock > 0) st.clock--;
  const o = st.poss, df = 1 - o, b = st.ball, pl = st.play;
  let c = carrierOf(st);
  // run play: the handoff
  if (pl.kind === "run" && b.state === "held" && st.lf === pl.handF) {
    const rb = offMan(st, o, O.RB); b.g = rb.g; c = rb; st.ctrl[o] = rb.g; ev(st, "hand");
  }
  // who the humans hold: the carrier on the side with the ball; in the air, the man it is thrown to
  if (c && c.t === o && !(pl.kind === "run" && c.role === "qb")) st.ctrl[o] = c.g;   // a run: you hold the back from the snap
  if (b.state === "air" && b.kind === "pass" && b.target >= 0) st.ctrl[o] = b.target;
  // the humans' buttons
  for (let s = 0; s < 2; s++) {
    if (st.cfg.sides[s] !== "human" || st.ctrl[s] < 0) continue;
    const me = st.p[st.ctrl[s]];
    if (me === c) {
      if (pl.kind === "pass" && me.role === "qb" && !pl.thrown && behindLine(st, me)) {
        if (e[s] & BTN.B) { st.sel[s] = (st.sel[s] + 1) % ELIGIBLE.length; ev(st, "cursor"); }
        if (e[s] & BTN.A && st.lf >= 6 && !st.grab) throwTo(st, offMan(st, o, ELIGIBLE[st.sel[s]]));
      }
      if (st.grab && e[s] & BTN.A) mash(st, me);
    } else if (s !== (c ? c.t : o)) {
      // defence: A dives, B takes the man nearest the ball
      if (e[s] & BTN.A && isUp(me) && me.eng < 0) { const [dx, dy] = dpad(m[s]); startDive(st, me, dx, dy, c); }
      if (e[s] & BTN.B) { const n = nearestTo(st, s, ballX(st), ballY(st)); if (n) { st.ctrl[s] = n.g; ev(st, "cursor"); } }
    }
  }
  c = carrierOf(st);
  // everybody moves
  for (const p of st.p) {
    if (p.down > 0) { p.down--; p.vx *= 0.8; p.vy *= 0.8; continue; }
    if (p.dive > 0) { p.dive--; if (p.dive === 0) p.down = 40; continue; }
    if (p.boost > 0) p.boost--;
    if (p.shedCD > 0) p.shedCD--;
    if (p.eng >= 0) { holdBlock(st, p); continue; }
    const human = st.cfg.sides[p.t] === "human" && st.ctrl[p.t] === p.g;
    const [dx, dy] = human ? dpad(m[p.t]) : [0, 0];
    // a hand off the stick: the thrown-to man goes for the ball, the back follows his path to the
    // handoff, the passer takes his drop
    // the back of a called run: he takes the handoff and hits the hole on his own, then he is yours
    const toHole = p.role === "runner" && pl.kind === "run" && p.path && p.wp < p.path.length - 1 && st.lf < 70 && !(st.grab && st.grab.g === p.g);
    const idle = human && (toHole || (!dx && !dy && ((b.state === "air" && b.target === p.g) || (p.role === "qb" && p === c && pl.kind === "pass" && st.lf < 26))));
    if (human && !idle && !(p.role === "ret" && b.state === "air")) {
      const mult = st.grab && st.grab.g === p.g ? 0.22 : p.role === "qb" && c === p ? 0.85 : 1;
      drive(p, dx, dy, mult);
      if (dx) p.face = dx > 0 ? 1 : -1;
    } else ai(st, p, c);
  }
  // integrate, keep the men apart
  for (const p of st.p) { p.x += p.vx * DT; p.y += p.vy * DT; if (p.vx > 0.3) p.face = 1; else if (p.vx < -0.3) p.face = -1; }
  separate(st, c);
  // the ball
  if (b.state === "held") { const h = st.p[b.g]; b.x = h.x; b.y = h.y; b.z = 1; }
  else if (b.state === "air") flyBall(st);
  if (st.phase !== "live") return;
  c = carrierOf(st);
  blocks(st, c);
  if (c) { tackles(st, c); if (st.phase === "live") lines(st, c); }
}
const behindLine = (st, p) => dirOf(p.t) * (p.x - st.los) <= 0.4;
const ballX = (st) => st.ball.x, ballY = (st) => st.ball.y;
function nearestTo(st, t, x, y) { let best = null, bd = 1e9; for (let i = 0; i < 11; i++) { const p = P(st, t, i); if (!isUp(p)) continue; const d = len(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } } return best; }
function startDive(st, p, dx, dy, c) {
  if (!dx && !dy) { if (c) { const l = len(c.x - p.x, c.y - p.y) || 1; dx = (c.x - p.x) / l; dy = (c.y - p.y) / l; } else { dx = p.face; dy = 0; } }
  const sp = p.spd * 1.45; p.vx = dx * sp; p.vy = dy * sp; p.dive = 16; ev(st, "dive");
}

// The CPU's men (and a human side's other ten).
function ai(st, p, c) {
  const o = st.poss, d = dirOf(p.t), b = st.ball, pl = st.play, read = pl.read;
  const onBall = c && c.t === p.t;
  if (p === c) return runAI(st, p);
  if (b.state === "air" && b.kind === "kick") {
    if (p.role === "ret") return toward(p, b.x1, b.y1, 1, 0.1);
    if (p.role === "cover") return toward(p, b.x1 - d * 2, b.y1 + (p.y - CY) * 0.5, 1, 0);
    return toward(p, b.x1 - (b.x1 - p.x) * 0.5, p.y + (b.y1 - p.y) * 0.3, 0.7);   // the wall turns and sets up
  }
  if (p.t === o) {
    // the offence
    if (onBall || b.state === "air") {
      if (p.role === "runner" && p !== c) return pathRun(st, p);
      if (p.role === "qb" && p === c && st.lf < 26) return drive(p, -d, 0, 0.7);
      if (p.role === "route" && b.state === "air" && b.target === p.g) return toward(p, b.x1, b.y1, 1, 0.1);
      if (p.role === "route" && b.state !== "held") return routeRun(st, p);
      if (p.role === "protect" && c && c.role === "qb") return protect(st, p, c);
      if (p.role === "route" && c && c.role === "qb") return routeRun(st, p);
      if (p.role === "qb") return drive(p, 0, 0, 0);
      return blockFor(st, p, c);
    }
    return toward(p, ballX(st), ballY(st), 1);   // the ball has gone the other way: chase it
  }
  // the defence
  if (!c) {
    if (b.state === "air" && b.kind === "pass") {
      const near = len(b.x1 - p.x, b.y1 - p.y) < 14;
      if (p.role === "man" || near) return toward(p, b.x1, b.y1, 1, 0.1);
    }
    return drive(p, 0, 0, 0);
  }
  if (c.t === p.t) return blockFor(st, p, c);   // a turnover: the old offence's men now block
  const mult = read ? 1.08 : 1;
  const qbHas = c.role === "qb" && pl.kind === "pass" && !pl.thrown && behindLine(st, c);
  if (p.role === "rush" || p.role === "rushlb" || read) {
    if (read && pl.kind === "pass" && p.role === "man" && p.mark >= 0 && qbHas) { const r = st.p[p.mark]; return toward(p, r.x + dirOf(r.t) * 0.6, r.y, mult, 0.05); }
    if (p.role === "rushlb" && !read && st.lf < (pl.kind === "run" ? 30 : 18)) return drive(p, 0, 0, 0);
    const [tx, ty] = lead(p, c, 0.6); return toward(p, tx, ty, mult, 0);
  }
  if (p.role === "zone") {
    if (qbHas) { const zx = st.los + dirOf(c.t) * 7, zy = p.sy + (c.y - p.sy) * 0.3; return toward(p, zx, zy, 0.9); }
    if (st.lf < 24) return drive(p, 0, 0, 0);
    const [tx, ty] = lead(p, c, 0.8); return toward(p, tx, ty, 1, 0);
  }
  // man: stay with him while the passer has it; then everyone to the ball
  if (qbHas && p.mark >= 0) {
    const r = st.p[p.mark], back = dirOf(r.t) * (1.6 - 0.8 * p.cov);
    return toward(p, r.x + back + r.vx * 0.25 * p.cov, r.y + r.vy * 0.25 * p.cov, 1, 0.05);
  }
  if (pl.kind === "run" && st.lf < 22 && !read && p.mark >= 0) { const r = st.p[p.mark]; return toward(p, r.x + dirOf(r.t) * 2, r.y, 0.7); }
  const [tx, ty] = lead(p, c, 1); return toward(p, tx, ty, 1, 0);
}
function routeRun(st, p) {
  const d = dirOf(p.t);
  if (!p.path) return drive(p, d, 0, 0.6);
  if (p.wp < p.path.length) {
    const [dn, lat] = p.path[p.wp], tx = p.sx + d * dn, ty = p.sy + lat;
    if (len(tx - p.x, ty - p.y) < 0.9) p.wp++;
    return toward(p, tx, ty, 1, 0);
  }
  if (p.settle) return drive(p, 0, 0, 0);
  // past the last point: run on the last leg's way
  const n = p.path.length, [a0, b0] = n > 1 ? p.path[n - 2] : [0, 0], [a1, b1] = p.path[n - 1];
  const vx = d * (a1 - a0), vy = b1 - b0, l = len(vx, vy) || 1;
  if (p.y < 2 || p.y > FW - 2) return drive(p, d, 0, 1);
  return drive(p, vx / l, vy / l, 1);
}
function protect(st, p, qb) {
  if (p.mark >= 0) { const q = st.p[p.mark]; if (isUp(q) && q.eng < 0 && q.shedCD <= 0 && len(q.x - qb.x, q.y - qb.y) < 9) return toward(p, q.x + (qb.x - q.x) * 0.3, q.y + (qb.y - q.y) * 0.3, 1, 0.02); }
  // stand between the passer and the nearest man coming
  let best = null, bd = 1e9;
  for (let i = 0; i < 11; i++) { const r = P(st, 1 - p.t, i); if (!isUp(r) || r.eng >= 0) continue; const dd = len(r.x - qb.x, r.y - qb.y); if (dd < 12 && len(r.x - p.x, r.y - p.y) < 6 && dd < bd) { bd = dd; best = r; } }
  if (!best) return toward(p, p.sx - dirOf(p.t) * 1, p.sy, 0.5);
  return toward(p, best.x + (qb.x - best.x) * 0.25, best.y + (qb.y - best.y) * 0.25, 1, 0.05);
}
function blockFor(st, p, c) {
  if (!c) return drive(p, 0, 0, 0);
  // his own man first, while he is still coming
  if (p.mark >= 0 && st.play.scrim) {
    const q = st.p[p.mark];
    if (isUp(q) && q.eng < 0 && q.shedCD <= 0) return toward(p, q.x + (c.x - q.x) * 0.25, q.y + (c.y - q.y) * 0.25, 1, 0.02);
  }
  // then the man nearest the carrier's way that nobody has: meet him
  const d = dirOf(c.t);
  let best = null, bd = 1e9;
  for (let i = 0; i < 11; i++) {
    const r = P(st, 1 - p.t, i);
    if (!isUp(r) || r.eng >= 0) continue;
    const ahead = d * (r.x - c.x);
    const dd = len(r.x - p.x, r.y - p.y) + len(r.x - c.x, r.y - c.y) * 0.6 - (ahead > 0 ? 2 : 0);
    if (dd < bd) { bd = dd; best = r; }
  }
  if (!best) return drive(p, d, 0, 0.8);
  return toward(p, best.x + (c.x - best.x) * 0.3, best.y + (c.y - best.y) * 0.3, 1, 0.05);
}
function pathRun(st, p) {
  const d = dirOf(p.t);
  if (!p.path || p.wp >= p.path.length) return drive(p, d, 0, 0.8);
  const [dn, lat] = p.path[p.wp], tx = p.sx + d * dn, ty = p.sy + lat;
  if (len(tx - p.x, ty - p.y) < 1.2) p.wp++;
  return toward(p, tx, ty, 1, 0);
}
// the carrier, when nobody is holding the stick: follow the play's path, then run for daylight
function runAI(st, p) {
  const d = dirOf(p.t), pl = st.play;
  if (st.grab && st.grab.g === p.g) return drive(p, d, 0, 0.22);
  if (p.role === "qb" && pl.kind === "pass" && !pl.thrown && behindLine(st, p)) return qbAI(st, p);
  if (p.path && pl.kind === "run" && p.role === "runner" && p.wp < p.path.length - 1) {
    const [dn, lat] = p.path[p.wp], tx = p.sx + d * dn, ty = p.sy + lat;
    if (len(tx - p.x, ty - p.y) < 1.2) p.wp++;
    return toward(p, tx, ty, 1, 0);
  }
  let ax = d * 1.2, ay = 0;
  for (let i = 0; i < 11; i++) {
    const r = P(st, 1 - p.t, i);
    if (!isUp(r) || r.eng >= 0) continue;
    const wx = p.x - r.x, wy = p.y - r.y, dd = len(wx, wy);
    if (dd > 7 || d * (r.x - p.x) < -1.5) continue;
    const k = (7 - dd) / 7;
    ay += (wy >= 0 ? 1 : -1) * k * 1.4; ax -= d * k * 0.3;
  }
  if (p.y < 5) ay += (5 - p.y) / 5 * 1.5;
  if (p.y > FW - 5) ay -= (p.y - (FW - 5)) / 5 * 1.5;
  const l = len(ax, ay) || 1;
  drive(p, ax / l, ay / l, 1);
}
function qbAI(st, p) {
  const d = dirOf(p.t), pl = st.play;
  if (st.lf < 26) return drive(p, -d, 0, 0.7);
  drive(p, 0, 0, 0);
  let pressure = false;
  for (let i = 0; i < 11; i++) { const r = P(st, 1 - p.t, i); if (isUp(r) && r.eng < 0 && len(r.x - p.x, r.y - p.y) < 2.6) pressure = true; }
  if (st.lf < 40 || (st.lf % 6 && !pressure)) return;
  let best = null, bs = -1e9;
  for (const s of ELIGIBLE) {
    const r = offMan(st, p.t, s);
    if (!isUp(r)) continue;
    let open = 1e9;
    for (let i = 0; i < 11; i++) { const q = P(st, 1 - p.t, i); if (isUp(q)) open = Math.min(open, len(q.x - r.x, q.y - r.y)); }
    const depth = clamp(d * (r.x - st.los), -3, 25);
    const sc = Math.min(open, 7) + depth * 0.12;
    if (sc > bs) { bs = sc; best = r; best.open = open; }
  }
  if (!best) return;
  const ready = (best.open > 3 && st.lf > 50) || st.lf > 140 || (pressure && st.lf > 45);
  if (!ready) return;
  st.sel[p.t] = ELIGIBLE.indexOf(ELIGIBLE.find(s => offMan(st, p.t, s) === best));
  if (best.open < 1.3 && pressure && rnd(st) < 0.35) { pl.thrown = true; return; }   // tucks it and runs
  throwTo(st, best);
}
function throwTo(st, r) {
  const qb = carrierOf(st);
  if (!qb) return;
  const vb = 14 + 8 * qb.arm;
  let ax = r.x, ay = r.y;
  for (let k = 0; k < 2; k++) { const t = len(ax - qb.x, ay - qb.y) / vb; ax = r.x + r.vx * t; ay = r.y + r.vy * t; }
  const miss = (1 - qb.arm) * 1.6;
  ax += (rnd(st) - 0.5) * miss; ay += (rnd(st) - 0.5) * miss;
  ay = clamp(ay, -0.5, FW + 0.5);
  const dist = len(ax - qb.x, ay - qb.y), T = Math.max(12, Math.round((dist / vb) * HZ));
  st.ball = { state: "air", kind: "pass", x0: qb.x, y0: qb.y, x1: ax, y1: ay, f: 0, T, h: 1 + dist * 0.09, x: qb.x, y: qb.y, z: 1, target: r.g, from: qb.g };
  st.play.thrown = true; st.play.target = r.g;
  ev(st, "throw"); say(st, `THROWN FOR ${r.name.toUpperCase()}.`);
}
function flyBall(st) {
  const b = st.ball;
  b.f++;
  const u = Math.min(1, b.f / b.T);
  b.x = b.x0 + (b.x1 - b.x0) * u; b.y = b.y0 + (b.y1 - b.y0) * u; b.z = 1 + b.h * 4 * u * (1 - u) - (b.kind === "kick" ? u : 0);
  if (b.f < b.T) return;
  if (b.kind === "kick") return fieldKick(st);
  catchOrNot(st);
}
function fieldKick(st) {
  const b = st.ball, K = st.kick, rt = 1 - K.t, own = ownGoal(rt), d = dirOf(rt);
  // into the end zone (or through it): a touchback
  if (d * (b.x1 - own) < -1) {
    const spot = fromOwn(rt, K.kind === "punt" ? 20 : 25);
    say(st, "TOUCHBACK.");
    return deadBall(st, "touchback", spot, "TOUCHBACK");
  }
  const r = P(st, rt, st.lu[rt].ret);
  r.x = b.x1; r.y = b.y1; r.vx = 0; r.vy = 0;
  st.ball = { state: "held", g: r.g, x: r.x, y: r.y, z: 1 };
  st.play.retFrom = r.x;
  st.ctrl[rt] = r.g;
  ev(st, "catch");
}
function catchOrNot(st) {
  const b = st.ball, r = st.p[b.target], o = r.t, read = st.play.read;
  let df = null, dd = 1e9;
  for (let i = 0; i < 11; i++) { const q = P(st, 1 - o, i); if (!isUp(q) && q.dive <= 0) continue; const k = len(q.x - b.x1, q.y - b.y1); if (k < dd) { dd = k; df = q; } }
  const rd = len(r.x - b.x1, r.y - b.y1);
  const reach = 1.7, u = rnd(st);
  let out = "inc";
  if (rd <= reach && isUp(r)) {
    if (dd <= 2.2) {
      const pInt = 0.12 + 0.3 * df.cov - 0.1 * r.hands + (read ? 0.12 : 0) + (dd < 1 ? 0.06 : 0), pCatch = 0.4 + 0.34 * r.hands - 0.24 * df.cov;
      out = u < pInt ? "int" : u < pInt + pCatch ? "catch" : "inc";
    } else out = u < 0.82 + 0.15 * r.hands ? "catch" : "inc";
  } else if (df && dd <= 1.3) out = u < 0.32 + 0.4 * df.cov ? "int" : "inc";
  if (out === "catch") {
    st.ball = { state: "held", g: r.g, x: r.x, y: r.y, z: 1 };
    r.role = "carrier"; st.ctrl[o] = r.g; ev(st, "catch");
    st.play.catchX = r.x;
    say(st, `CAUGHT BY ${r.name.toUpperCase()}.`);
  } else if (out === "int") {
    st.ball = { state: "held", g: df.g, x: df.x, y: df.y, z: 1 };
    df.dive = 0; df.down = 0; df.eng = -1; df.role = "carrier";
    st.poss = df.t; st.play.ret = true; st.play.scrim = false; st.play.intAt = df.x;
    st.ctrl[df.t] = df.g; st.stat[df.t].ints++;
    const n = nearestTo(st, o, df.x, df.y); if (n) st.ctrl[o] = n.g;
    st.msg = { text: "INTERCEPTED!", f: 80 }; ev(st, "int");
    say(st, `INTERCEPTED BY ${df.name.toUpperCase()}.`);
  } else {
    st.ball = { state: "dead", x: b.x1, y: b.y1, z: 0 };
    ev(st, "inc"); say(st, "INCOMPLETE.");
    deadBall(st, "inc", st.los, "INCOMPLETE");
  }
}
// a blocked man: the block holds for a while, then he sheds it
function holdBlock(st, p) {
  const q = st.p[p.eng];
  p.vx *= 0.6; p.vy *= 0.6;
  if (p.t !== st.poss && p.role !== "wall") {
    if (--p.engF <= 0 || !q || q.eng !== p.g) { if (q && q.eng === p.g) { q.eng = -1; q.shedCD = 30; } p.eng = -1; p.shedCD = 40; }
  } else if (!q || q.eng !== p.g) p.eng = -1;
}
function blocks(st, c) {
  const read = st.play.read && st.lf < 80;
  for (const bl of st.p) {
    if (bl.t !== st.poss || bl === c || bl.eng >= 0 || !isUp(bl) || bl.shedCD > 0 || bl.role === "qb" || bl.role === "route" && !(c && c !== bl && c.role !== "qb")) continue;
    for (let i = -1; i < 11; i++) {
      const q = i < 0 ? (bl.mark >= 0 ? st.p[bl.mark] : null) : P(st, 1 - bl.t, i);
      if (!q || q.t === bl.t || q.eng >= 0 || !isUp(q) || q.shedCD > 0) continue;
      if (len(q.x - bl.x, q.y - bl.y) > 1.3) continue;
      if (read && st.play.scrim) continue;   // the play was read: they go straight through
      const hold = Math.max(st.play.scrim ? 20 : 10, Math.round((st.play.scrim ? 45 : 20) + 50 * (bl.str - q.str) + 30 * rnd(st)));
      bl.eng = q.g; q.eng = bl.g; q.engF = hold; bl.engF = hold;
      break;
    }
  }
}
// contact with the carrier: a grab (mash A to shake it), a big hit (down at once)
function tackles(st, c) {
  for (let i = 0; i < 11; i++) {
    const q = P(st, 1 - c.t, i);
    if (q.down > 0 || q.eng >= 0) continue;
    const R = q.dive > 0 ? 1.35 : 0.9, dd = len(q.x - c.x, q.y - c.y);
    if (dd > R) continue;
    if (st.grab) {
      if (!st.grab.tk.includes(q.g)) { st.grab.tk.push(q.g); st.grab.need += 1.5 + 6 * q.tak + (q.dive > 0 ? 1.5 : 0); }
      q.vx = c.vx; q.vy = c.vy;
      continue;
    }
    const nx = (c.x - q.x) / (dd || 1), ny = (c.y - q.y) / (dd || 1), close = q.vx * nx + q.vy * ny;   // his own speed into the man: a back running into a standing man is not hit hard
    if ((close > 6.2 && q.tak > 0.35 && rnd(st) < 0.25 + 0.45 * q.tak) || (q.dive > 0 && close > 9 && q.tak > 0.6)) {
      st.freeze = 26; st.stat[q.t].hits++;
      st.msg = { text: "BIG HIT!", f: 60 }; ev(st, "bighit");
      say(st, `BIG HIT BY ${q.name.toUpperCase()}.`);
      c.down = 60; q.down = 20; q.dive = 0;
      return downed(st, c);
    }
    st.grab = { g: c.g, f: 0, mash: 0, need: GRAB_NEED + 8 * q.tak + (q.dive > 0 ? 1.5 : 0), tk: [q.g] };
    q.vx = c.vx * 0.5; q.vy = c.vy * 0.5;
    ev(st, "grab");
  }
  const g = st.grab;
  if (!g) return;
  if (g.g !== c.g) { st.grab = null; return; }
  g.f++;
  if (st.cfg.sides[c.t] !== "human" && rnd(st) < 0.05 + 0.08 * c.str) mash(st, c);
  if (g.mash >= g.need) {
    for (const k of g.tk) { const q = st.p[k]; q.down = 45; q.dive = 0; }
    st.grab = null; c.boost = 24; st.stat[c.t].breaks++; ev(st, "break");
    say(st, `${c.name.toUpperCase()} BREAKS THE TACKLE.`);
    return;
  }
  if (g.f >= GRAB_F) { c.down = 50; for (const k of g.tk) st.p[k].down = 18; return downed(st, c); }
}
// A grab: the carrier has GRAB_F frames to mash A past GRAB_NEED + 8 x the tackler's tackling (1.5 + 6 x
// for each man who piles on); a tap is worth 1 + 0.8 x his strength. A human taps 6 to 10 a second.
export const GRAB_F = 40, GRAB_NEED = 4;
function mash(st, c) { if (st.grab && st.grab.g === c.g) { st.grab.mash += 1 + 0.8 * c.str; ev(st, "mash"); } }
// the lines: out of bounds, the goal line
function lines(st, c) {
  const d = dirOf(c.t);
  if (d * (c.x - goalOf(c.t)) >= 0) return touchdown(st, c);
  if (c.y < -0.3 || c.y > FW + 0.3) { ev(st, "oob"); say(st, "OUT OF BOUNDS."); return deadBall(st, "oob", c.x, "OUT OF BOUNDS"); }
  if (c.x < -10.5 || c.x > 110.5) return deadBall(st, "oob", c.x, "OUT OF BOUNDS");
}
function downed(st, c) {
  st.grab = null;
  ev(st, "tackle");
  const own = ownGoal(c.t), d = dirOf(c.t);
  if (d * (c.x - own) < 0) {
    if (st.play.scrim) {
      st.score[1 - c.t] += 2; ev(st, "safety"); say(st, `SAFETY. ${scoreLine(st)}`);
      return deadBall(st, "safety", c.x, "SAFETY!");
    }
    say(st, "TOUCHBACK.");
    return deadBall(st, "touchback", fromOwn(c.t, 20), "TOUCHBACK");
  }
  say(st, `DOWN AT THE ${spotName(c.x)}.`);
  deadBall(st, "tackle", c.x, null);
}
function touchdown(st, c) {
  st.score[c.t] += 6;
  st.td = { t: c.t, g: c.g, name: c.name, key: c.key };
  st.grab = null; ev(st, "td");
  addYards(st, c, goalOf(c.t));
  say(st, `TOUCHDOWN, ${st.cfg.teams[c.t].short}! ${c.name.toUpperCase()}. ${scoreLine(st)}`);
  st.phase = "td"; st.pf = 0; st.dead = { kind: "td", x: goalOf(c.t) };
}
function addYards(st, c, x) {
  const pl = st.play;
  if (!pl || !pl.scrim) return;
  const g = Math.round(dirOf(c.t) * (x - st.los));
  if (pl.kind === "pass" && pl.thrown && pl.catchX != null) st.stat[c.t].pass += g; else st.stat[c.t].rush += g;
}
function deadBall(st, kind, x, text) {
  const c = carrierOf(st);
  if (c && kind === "tackle") addYards(st, c, x);
  if (c && kind === "oob") addYards(st, c, clamp(x, 0, 100));
  st.dead = { kind, x, t: c ? c.t : st.poss };
  st.ball = { ...st.ball, state: "dead" };
  if (text) st.msg = { text, f: 70 };
  if (kind !== "td") ev(st, "whistle");
  st.phase = "dead"; st.pf = 0;
}

// After the whistle: the score, the downs, the clock.
function afterPlay(st) {
  const dd = st.dead, pl = st.play, o = st.poss;
  let stopClock = true;
  switch (dd.kind) {
    case "pat": case "patmiss": case "fg": setupKickoff(st, st.kick.t, false); return endCheck(st, true);
    case "fgmiss": newSeries(st, 1 - st.kick.t, clamp(st.los, 20, 80), "TURNOVER."); break;
    case "safety": setupKickoff(st, dd.t, true); return endCheck(st, true);
    case "touchback": newSeries(st, st.poss, dd.x); break;
    case "inc": nextDown(st, st.los); break;
    case "oob": case "tackle": {
      const x = clamp(dd.x, 0.5, 99.5);
      stopClock = dd.kind === "oob";
      if (pl.ret || !pl.scrim) newSeries(st, st.poss, x);
      else nextDown(st, x);
      break;
    }
    default: break;
  }
  void o;
  if (!stopClock && st.clock > 0) st.clock = Math.max(0, st.clock - 5 * HZ);
  endCheck(st, false);
}
function nextDown(st, x) {
  const o = st.poss, d = dirOf(o);
  st.los = clamp(x, 0.5, 99.5);
  if (d * (st.los - st.firstAt) >= 0) { newSeries(st, o, st.los); ev(st, "first"); say(st, "FIRST DOWN."); return; }
  st.down++;
  if (st.down > 4) { st.msg = { text: "TURNOVER ON DOWNS", f: 70 }; newSeries(st, 1 - o, st.los, "TURNOVER ON DOWNS."); }
}
// the quarter ends at the first whistle after the clock runs out
function endCheck(st, kicked) {
  if (st.clock <= 0) {
    st.phase = "quarter"; st.pf = 0; st.qEnd = { q: st.q, resume: kicked ? "kick" : "call" };
    ev(st, st.q >= 4 ? "final" : "quarter");
    say(st, st.q === 2 ? `HALFTIME. ${scoreLine(st)}` : st.q >= 4 ? `FINAL. ${scoreLine(st)}` : `END OF THE ${["", "1ST", "2ND", "3RD"][st.q]} QUARTER. ${scoreLine(st)}`);
    return;
  }
  if (!kicked) setupCall(st);
}
function afterQuarter(st) {
  const r = st.qEnd;
  if (st.q >= 4) { st.over = true; st.phase = "over"; return; }
  st.q++; st.clock = st.cfg.qlen * 60 * HZ;
  if (st.q === 3) { setupKickoff(st, 1 - st.firstKick, false); return; }
  if (r.resume === "kick") { st.phase = "kick"; st.pf = 0; return; }
  setupCall(st);
}

// keep the men from standing in each other
function separate(st, c) {
  const ps = st.p;
  for (let i = 0; i < 22; i++) {
    const a = ps[i];
    for (let j = i + 1; j < 22; j++) {
      const b = ps[j];
      if (a.eng === b.g) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      if (dx > 0.75 || dx < -0.75 || dy > 0.75 || dy < -0.75) continue;
      const dd = len(dx, dy);
      if (dd >= 0.75 || dd === 0) continue;
      if (a === c || b === c) continue;   // the carrier slips his own blockers; contact with the other side is the tackle's business
      const k = (0.75 - dd) / 2 / dd;
      a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k;
    }
  }
}

// ---- the record --------------------------------------------------------------------------------------
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
  return { done: st.over, winner: st.over ? (s[0] > s[1] ? 0 : s[1] > s[0] ? 1 : -1) : null, score: [...s], q: st.q, frames: st.frame, stat: st.stat.map(x => ({ ...x })) };
}
// Re-run a game from its record -> the result (and the state it ends in).
export function replay(rec) {
  if (rec.v !== VERSION) return { ok: false, why: `version ${rec.v}, this cabinet runs ${VERSION}` };
  const st = newGame(rec.cfg, rec.seed);
  const masks = rleDecode(rec.rle);
  for (const m of masks) step(st, m);
  return { ok: true, st, result: resultOf(st) };
}
// A hash of the whole state (positions to the millimetre), for the checks.
export function stateHash(st) {
  let h = 2166136261;
  const mix = (v) => { h ^= v | 0; h = Math.imul(h, 16777619); };
  for (const p of st.p) { mix(Math.round(p.x * 1000)); mix(Math.round(p.y * 1000)); mix(p.down); }
  mix(st.score[0]); mix(st.score[1]); mix(st.frame); mix(st.clock); mix(st.rng);
  return h >>> 0;
}
// The rule internals, for scripts/check-tecmo.mjs only.
export const _rules = { newSeries, nextDown, afterPlay, touchdown, downed, setupKickoff, deadBall, setupCall, endCheck };
