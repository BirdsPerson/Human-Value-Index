// THE BOWL, playable (docs/CITY_SPEC.md "PLAYABLE SPORTS", Football). The game itself: pure, no DOM,
// no clock, no Math.random, no trig. A fixed 60 Hz step over a seeded generator, so a game is a
// function of (version, seed, cfg, the human's input per frame, play calls included): the browser
// plays it, and anything holding the record plays it again to the same result
// (scripts/check-football.mjs does). Only + - * / and sqrt touch the state.
//
// The field is in yards: x along the length, team 0's goal line at 0 and team 1's at 100 (the end
// zones run to -10 and 110, the posts stand on the end lines); y across it, 0 to 53.33; z up. Team 0
// is the viewer's and attacks +x all game (ends do not change, as at the courts). Eleven a side, the
// league's drafted elevens, iron men: the same eleven plays offence, defence and the kicks.
//
// Modelled on the console football of the day (the rules, the play calling, the controls):
//   between downs  each side calls a play (offence: formation -> play; defence: a coverage). The
//                  human's call reaches the sim as a code in bits 16-23 of the frame's mask (CALL),
//                  so the input log holds the calls too. The CPU calls by situation and its coach.
//   pre-snap       A snaps; X opens the audibles, Y a hot route (then a receiver's button: a streak)
//   passing        each eligible receiver wears a button (A B X Y RB); tap it for a bullet, hold it
//                  (10 frames or more) for a lob, the throw going on the release
//   running        SPRINT (stamina), a juke (right stick left/right, or X), spin (B), truck (right
//                  stick up, or A), stiff arm (Y)
//   defence        B switches to the defender nearest the ball, A tackles, X dives, Y swats or
//                  jumps the route, right stick up is the hit stick (a big hit, a fumble chance)
//   kicks          a power-and-accuracy meter: A starts it, A sets the power, A again on the line
// Input: one bitmask a frame (BTN), plus the call code.

export const VERSION = 1;
export const HZ = 60;
const DT = 1 / HZ, G = 10.7;
export const FIELD = { w: 160 / 3, cy: 80 / 3, hash: [23.58, 29.75], post: 3.08, bar: 3.33 };
const W = FIELD.w, CY = FIELD.cy;
export const BTN = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, A: 16, B: 32, X: 64, Y: 128, R: 256, SPRINT: 512, RSU: 1024, RSL: 2048, RSR: 4096, RSD: 8192 };
export const CALL_SHIFT = 16;
export const CODE = { TIMEOUT: 60, PAT: 61, TWO: 62, COACH: 63, FLIP: 128 };
export const QLENS = [2, 3, 5];
// Offence slots and defence slots (an index into each team's eleven).
export const OS = { QB: 0, RB: 1, WR1: 2, WR2: 3, TE: 4, WR3: 5, LT: 6, LG: 7, C: 8, RG: 9, RT: 10 };
export const DS = { LE: 0, DT1: 1, DT2: 2, RE: 3, WLB: 4, MLB: 5, SLB: 6, CB1: 7, CB2: 8, FS: 9, SS: 10 };
export const OS_NAMES = ["QB", "HB", "WR", "WR", "TE", "WR", "LT", "LG", "C", "RG", "RT"];
export const DS_NAMES = ["DE", "DT", "DT", "DE", "LB", "MLB", "LB", "CB", "CB", "FS", "SS"];
// The receiver buttons: [label, offence slot, bit]. A is the back, B the right wideout, X the left,
// Y the tight end, RB the slot.
export const ICONS = [["A", OS.RB, BTN.A], ["B", OS.WR2, BTN.B], ["X", OS.WR1, BTN.X], ["Y", OS.TE, BTN.Y], ["RB", OS.WR3, BTN.R]];
const PASS_BITS = BTN.A | BTN.B | BTN.X | BTN.Y | BTN.R;
const LOB_HOLD = 10;
const RUNOFF = 12, HURRY = 5;      // game seconds off a running clock between plays (an accelerated clock)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const len = (x, y) => Math.sqrt(x * x + y * y);
export const dirOf = (t) => (t === 0 ? 1 : -1);
export const goalX = (t) => (t === 0 ? 100 : 0);           // the goal line team t attacks
export const ownGoalX = (t) => (t === 0 ? 0 : 100);
export const toGoal = (t, x) => (t === 0 ? 100 - x : x);   // yards to the goal team t attacks
export const fromOwn = (t, yd) => (t === 0 ? yd : 100 - yd);

// mulberry32 on the state's own word
function rnd(st) {
  let t = (st.rng = (st.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const gauss = (st) => (rnd(st) + rnd(st) + rnd(st) - 1.5) * 2;
function fnv(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
// a fraction from integers, no generator (the coordinator's suggestion, which the page may show)
function hash01(a, b, c) { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// ---- the players ---------------------------------------------------------------------------------
// A rating (0..99) and the key -> abilities. One rating does it all; the key tilts speed, strength
// and skill a little either way, so two 52s are not the same man.
export function abilities(r, key = "") {
  const k = clamp((r - 35) / 60, 0, 1), h = fnv(String(key));
  const tilt = (s) => (((h >>> s) & 255) / 255 - 0.5) * 0.18;
  const sp = clamp(k + tilt(0), 0, 1), stg = clamp(k + tilt(8), 0, 1), sk = clamp(k + tilt(16), 0, 1);
  return { k, spd: 6.7 + 1.5 * sp, acc: 12 + 6 * sp, str: stg, agi: clamp(k - tilt(0) * 0.5, 0, 1), hands: sk, cov: clamp((sk + sp) / 2, 0, 1), tak: clamp((stg + k) / 2, 0, 1), thp: sk, tha: k, kpw: stg, kac: sk, awr: k };
}
function mkPlayer(t, i, row) {
  const [key, name, r] = row;
  return {
    t, i, g: t * 11 + i, key: String(key), name: String(name), r: r | 0, ...abilities(r | 0, String(key)),
    os: -1, ds: -1, x: 0, y: 0, vx: 0, vy: 0, wx: 0, wy: 0, z: 0, vz: 0, stam: 1, role: null, eng: -1, shed: 0, cool: 0, down: 0,
    act: null, moveCool: 0, slow: 0, tkCool: 0, rdx: 0, rdy: 0, react: 0, seen: null, jam: 0, sprint: false,
  };
}
// Who plays where. Named football players take their own positions; the rest fill by rating, the
// best to the ball (QB, HB, the receivers), then the line. The defence by rating too, the
// quarterback last; the kicker is the eleven's lowest rated, as the league's box score has it.
const OFF_HINT = { "tom-brady": "QB", "jalen-hurts": "QB", "joe-namath": "QB", "nick-foles": "QB", "andy-dalton": "QB", "peyton-manning": "QB", "archie-manning": "QB", "walter-payton": "RB", "oj-simpson": "RB", "a-j-brown": "WR", "deion-sanders": "WR", "travis-kelce": "TE", "aaron-hernandez": "TE", "jason-kelce": "C" };
const DEF_HINT = { "fred-williamson": "DB", "deion-sanders": "DB", "andre-the-giant": "DL", "jason-kelce": "DL" };
export function lineup(rows) {
  const idx = rows.map((r, i) => i).sort((a, b) => rows[b][2] - rows[a][2] || (rows[a][0] < rows[b][0] ? -1 : 1));
  const os = new Array(11).fill(-1), used = new Set();
  const want = { QB: [OS.QB], RB: [OS.RB], WR: [OS.WR1, OS.WR2, OS.WR3], TE: [OS.TE], C: [OS.C] };
  for (const i of idx) { const h = OFF_HINT[rows[i][0]]; if (!h) continue; const s = want[h].find(q => os[q] < 0); if (s != null) { os[s] = i; used.add(i); } }
  let j = 0;
  for (const s of [OS.QB, OS.RB, OS.WR1, OS.TE, OS.WR2, OS.WR3, OS.C, OS.LT, OS.RT, OS.LG, OS.RG]) if (os[s] < 0) { while (used.has(idx[j])) j++; os[s] = idx[j]; used.add(idx[j]); }
  const ds = new Array(11).fill(-1), dused = new Set();
  const dwant = { DB: [DS.CB1, DS.CB2, DS.FS, DS.SS], DL: [DS.RE, DS.LE, DS.DT1, DS.DT2] };
  for (const i of idx) { const h = DEF_HINT[rows[i][0]]; if (!h) continue; const s = dwant[h].find(q => ds[q] < 0); if (s != null) { ds[s] = i; dused.add(i); } }
  const order = idx.filter(i => i !== os[OS.QB]).concat([os[OS.QB]]);
  j = 0;
  for (const s of [DS.CB1, DS.MLB, DS.FS, DS.RE, DS.CB2, DS.SS, DS.LE, DS.WLB, DS.SLB, DS.DT1, DS.DT2]) if (ds[s] < 0) { while (dused.has(order[j])) j++; ds[s] = order[j]; dused.add(order[j]); }
  let k = idx[idx.length - 1];
  if (k === os[OS.QB]) k = idx[idx.length - 2];
  return { os, ds, k };
}

// ---- the playbook ----------------------------------------------------------------------------------
// Formations: [lat (yards toward +y from the ball), back (yards behind the line)] per offence slot.
const OLINE = [[2.8, 0.75], [1.4, 0.75], [0, 0.55], [-1.4, 0.75], [-2.8, 0.75]];
const FORMS = {
  single: { name: "SINGLEBACK", at: [[0, 1.3], [0, 6.5], [17, 0.75], [-17, 0.75], [-4.3, 0.85], [9, 1.5], ...OLINE] },
  gun: { name: "SHOTGUN", at: [[0, 5], [-1.6, 5.2], [18, 0.75], [-18, 0.75], [-9, 1.5], [10, 1.5], ...OLINE] },
  goal: { name: "GOAL LINE", at: [[0, 1.3], [0, 6.5], [8, 0.75], [-8, 0.75], [-4.3, 0.85], [0, 4], ...OLINE] },
};
// Routes: waypoints [downfield, outward] from the receiver's spot; "settle" stops at the last one
// and turns back to the passer, otherwise the route runs on in the last leg's direction.
const R = {
  slant: { pts: [[1.5, 0], [5, -3.5], [22, -15]] },
  curl: { pts: [[12, 0], [10.5, -0.8]], settle: true },
  hitch: { pts: [[7, 0], [6, -0.5]], settle: true },
  go: { pts: [[45, 0.8]], deep: true },
  seam: { pts: [[45, -0.6]], deep: true },
  post: { pts: [[11, 0], [36, -11]], deep: true },
  dig: { pts: [[12, 0], [12.5, -16]] },
  drag: { pts: [[3, -1], [5.5, -24]] },
  flat: { pts: [[1, 2.5], [3, 10], [4, 18]] },
  out: { pts: [[8, 0], [8.5, 8], [8.5, 18]] },
  corner: { pts: [[10, 0], [25, 9]], deep: true },
  check: { pts: [[1, 3], [4.5, 4.5]], settle: true },
  screen: { pts: [[-1.5, 3.5], [-2, 8]], settle: true },
  wheel: { pts: [[0, 5], [3, 9], [30, 10]], deep: true },
};
export const ROUTES = R;
const BLOCK = "block";
// The plays. kind run | pass | sneak | kneel | punt | fg. side: the run's or the boot's side
// (+1 toward +y; a flipped call mirrors it).
export const PLAYS = {
  1: { id: 1, name: "HB DIVE", form: "single", kind: "run", run: "dive", side: -1, tip: "INSIDE RUN" },
  2: { id: 2, name: "HB STRETCH", form: "single", kind: "run", run: "stretch", side: -1, tip: "OUTSIDE RUN" },
  3: { id: 3, name: "HB DRAW", form: "gun", kind: "run", run: "draw", side: -1, tip: "DELAYED RUN AGAINST THE RUSH" },
  4: { id: 4, name: "PA POST", form: "single", kind: "pass", drop: 7, pa: true, side: -1, routes: { [OS.WR1]: "post", [OS.WR2]: "dig", [OS.WR3]: "drag", [OS.TE]: BLOCK, [OS.RB]: BLOCK }, reads: [OS.WR1, OS.WR2, OS.WR3], tip: "PLAY-ACTION, DEEP" },
  5: { id: 5, name: "SLANTS", form: "gun", kind: "pass", drop: 3, side: -1, routes: { [OS.WR1]: "slant", [OS.WR2]: "slant", [OS.WR3]: "slant", [OS.TE]: "hitch", [OS.RB]: "flat" }, reads: [OS.WR3, OS.WR1, OS.WR2, OS.TE, OS.RB], tip: "QUICK, INSIDE" },
  6: { id: 6, name: "CURLS", form: "single", kind: "pass", drop: 5, side: -1, routes: { [OS.WR1]: "curl", [OS.WR2]: "curl", [OS.WR3]: "flat", [OS.TE]: "hitch", [OS.RB]: "check" }, reads: [OS.WR1, OS.TE, OS.WR2, OS.WR3, OS.RB], tip: "INTERMEDIATE, SIDELINES" },
  7: { id: 7, name: "FOUR VERTICALS", form: "gun", kind: "pass", drop: 7, side: -1, routes: { [OS.WR1]: "go", [OS.WR2]: "go", [OS.WR3]: "seam", [OS.TE]: "seam", [OS.RB]: "check" }, reads: [OS.WR3, OS.TE, OS.WR1, OS.WR2, OS.RB], tip: "EVERYONE DEEP" },
  8: { id: 8, name: "HB SCREEN", form: "gun", kind: "pass", drop: 7, screen: true, side: -1, routes: { [OS.WR1]: "go", [OS.WR2]: "go", [OS.WR3]: "curl", [OS.TE]: BLOCK, [OS.RB]: "screen" }, reads: [OS.RB, OS.WR3], tip: "LET THEM IN, DUMP IT OFF" },
  9: { id: 9, name: "PA BOOT", form: "single", kind: "pass", drop: "boot", pa: true, side: -1, routes: { [OS.WR1]: "post", [OS.WR2]: "corner", [OS.WR3]: "drag", [OS.TE]: "out", [OS.RB]: "flat" }, reads: [OS.TE, OS.WR2, OS.WR3, OS.RB, OS.WR1], tip: "FAKE, ROLL OUT, FLOOD" },
  10: { id: 10, name: "QB SNEAK", form: "goal", kind: "sneak", side: 0, tip: "A YARD, BY FORCE" },
  14: { id: 14, name: "GL POWER", form: "goal", kind: "run", run: "dive", lead: true, side: -1, tip: "FULLBACK LEADS INSIDE" },
  11: { id: 11, name: "KNEEL", form: "single", kind: "kneel", side: 0, tip: "RUN OUT THE CLOCK" },
  12: { id: 12, name: "PUNT", form: "punt", kind: "punt", side: 0, tip: "GIVE IT BACK, FAR AWAY" },
  13: { id: 13, name: "FIELD GOAL", form: "fg", kind: "fg", side: 0, tip: "THREE POINTS" },
};
export const OFF_BOOK = [
  { form: "SINGLEBACK", plays: [1, 2, 4, 6, 9] },
  { form: "SHOTGUN", plays: [5, 7, 3, 8] },
  { form: "GOAL LINE", plays: [14, 10] },
  { form: "SPECIAL", plays: [12, 13, 11] },
];
// Defence: per defence slot an assignment. rush | man (an offence slot) | zone [depth, y] with y
// "s" + n (n yards toward the left wideout's side from the ball), "f" + n (fraction of the width,
// mirrored to that side) and a deep flag. depth0: where he lines up.
const z = (depth, y, deep = false) => ({ k: "zone", depth, y, deep });
const man = (on, press = false) => ({ k: "man", on, press });
const rush = { k: "rush" };
export const DEFS = {
  33: { id: 33, name: "COVER 2", tip: "TWO DEEP, FIVE UNDER", a: [rush, rush, rush, rush, z(9, "s6"), z(10, "s0"), z(9, "s-6"), z(5, "s14"), z(5, "s-14"), z(17, "f0.25", true), z(17, "f-0.25", true)] },
  34: { id: 34, name: "COVER 3", tip: "THREE DEEP, FOUR UNDER", a: [rush, rush, rush, rush, z(5, "s13"), z(9, "s4"), z(9, "s-4"), z(15, "f0.333", true), z(15, "f-0.333", true), z(16, "s0", true), z(5, "s-13")] },
  35: { id: 35, name: "MAN COVER 1", tip: "MAN UNDER, ONE SAFETY DEEP", a: [rush, rush, rush, rush, man(OS.RB), z(8, "s0"), man(OS.WR3), man(OS.WR1, true), man(OS.WR2, true), z(16, "s0", true), man(OS.TE)] },
  36: { id: 36, name: "BLITZ", tip: "SIX RUSH, NOBODY DEEP", a: [rush, rush, rush, rush, rush, man(OS.RB), rush, man(OS.WR1, true), man(OS.WR2, true), man(OS.WR3), man(OS.TE)] },
  37: { id: 37, name: "GOAL LINE", tip: "STOP THE RUN, MAN UP", tight: true, a: [rush, rush, rush, rush, rush, man(OS.RB), rush, man(OS.WR1, true), man(OS.WR2, true), man(OS.WR3), man(OS.TE)] },
  38: { id: 38, name: "PREVENT", tip: "NOTHING DEEP. EVERYTHING SHORT", a: [rush, rush, z(6, "s0"), rush, z(11, "s10"), z(12, "s0"), z(11, "s-10"), z(22, "f0.375", true), z(22, "f-0.375", true), z(25, "f0.125", true), z(25, "f-0.125", true)] },
};
export const DEF_BOOK = [33, 34, 35, 36, 37, 38];

// ---- a new game ------------------------------------------------------------------------------------
// cfg: {qlen: 2 | 3 | 5 (minutes), assist, auto (team 0 played by the CPU too: the checks and the
// attract mode), home: [[key, name, r] x 11], away: [...], ot (overtime when level, default true),
// coach: [0..1, 0..1] (each CPU coach's lean to the pass; the page passes one per district)}.
export function newGame(seed = 1, cfg = {}) {
  const qlen = QLENS.includes(cfg.qlen) ? cfg.qlen : 3;
  const rows = (r) => { const a = (Array.isArray(r) ? r : []).slice(0, 11); while (a.length < 11) a.push([`stand-in-${a.length}`, "A STAND-IN", 40]); return a; };
  const R0 = rows(cfg.home), R1 = rows(cfg.away);
  const st = {
    v: VERSION, seed: seed >>> 0, rng: seed | 0, frame: 0,
    cfg: { qlen, assist: Boolean(cfg.assist), auto: Boolean(cfg.auto), ot: cfg.ot !== false, coach: Array.isArray(cfg.coach) ? cfg.coach.map(Number) : [0.5, 0.5] },
    p: [...R0.map((r, i) => mkPlayer(0, i, r)), ...R1.map((r, i) => mkPlayer(1, i, r))],
    off: [], def: [], kicker: [], ret: [],
    phase: "pre", pt: 0, q: 1, clock: qlen * 60 * HZ, score: [0, 0], to: [3, 3], poss: 0, los: 35, ballY: CY, down: 1, togo: 10, fd: 45,
    play: null, calls: [null, null], need: -1, tryFor: -1, tryChoice: false, runoff: 0, recv1: 0, warned: {}, ot: false, playNo: 0,
    ball: { st: "dead", own: -1, x: 50, y: CY, z: 0, vx: 0, vy: 0, vz: 0, f: 0, T: 0, from: -1, to: -1, tx: 0, ty: 0, lob: false, kind: "" },
    carrier: -1, ctl: -1, ctlSlot: DS.MLB, menu: null, kick: null, flags: [], res: null, cur: null, mask: 0, prev: 0, prevCode: 0, held: {}, ev: [], note: null, over: false,
    stat: [mkStat(), mkStat()], ps: Array.from({ length: 22 }, () => ({ pa: 0, pc: 0, py: 0, ptd: 0, int: 0, ra: 0, ry: 0, rtd: 0, rec: 0, recy: 0, rectd: 0, tk: 0, sk: 0, pick: 0, fg: 0, fga: 0, xp: 0 })),
  };
  for (const [t, rows_] of [[0, R0], [1, R1]]) {
    const L = lineup(rows_);
    st.off[t] = L.os.map(i => t * 11 + i); st.def[t] = L.ds.map(i => t * 11 + i); st.kicker[t] = t * 11 + L.k;
    L.os.forEach((i, s) => { st.p[t * 11 + i].os = s; }); L.ds.forEach((i, s) => { st.p[t * 11 + i].ds = s; });
    // the returner: the fastest who is neither the passer nor the kicker
    st.ret[t] = st.p.filter(P => P.t === t && P.g !== st.off[t][OS.QB] && P.g !== st.kicker[t]).reduce((a, P) => (P.spd > a.spd ? P : a)).g;
  }
  // the toss
  st.recv1 = rnd(st) < 0.5 ? 0 : 1;
  setupKickoff(st, 1 - st.recv1, 35);
  say(st, "toss", -1, { team: st.recv1 });
  return st;
}
function mkStat() { return { plays: 0, yds: 0, ra: 0, ry: 0, pa: 0, pc: 0, py: 0, sacks: 0, sackYds: 0, ints: 0, fum: 0, td: 0, fd: 0, pen: 0, penYds: 0, punts: 0, fga: 0, fgm: 0, third: 0, thirdOk: 0, top: 0, big: 0 }; }
const human = (st, P) => !st.cfg.auto && P.t === 0 && P.g === st.ctl;
function say(st, k, g = -1, extra = {}) { st.ev.push(k); st.note = { k, g, team: g >= 0 ? st.p[g].t : (extra.team ?? -1), frame: st.frame, ...extra }; }
export const humanOn = (st) => (st.cfg.auto ? -1 : 0);

// ---- situation -----------------------------------------------------------------------------------
const lateSecs = (st) => Math.min(120, st.cfg.qlen * 60 * 0.4);
const isLate = (st) => (st.q === 2 || st.q >= 4) && st.clock <= lateSecs(st) * HZ;
// The offence is in a hurry: late in a half, behind or level (or at the end of the first half within reach).
export function hurry(st, O = st.poss) {
  if (!isLate(st)) return false;
  if (st.q === 2) return toGoal(O, st.los) < 65;
  return st.score[O] <= st.score[1 - O];
}
function setFirstDown(st, team, x, y) {
  st.poss = team; st.down = 1;
  const d = dirOf(team);
  st.los = clamp(x, team === 0 ? 1 : 1, 99);
  if (toGoal(team, st.los) < 1) st.los = goalX(team) - d * 1;
  if (toGoal(team, st.los) > 99) st.los = ownGoalX(team) + d * 1;
  st.ballY = clamp(y, FIELD.hash[0], FIELD.hash[1]);
  const tg = toGoal(team, st.los);
  st.togo = tg <= 10 ? tg : 10; st.fd = tg <= 10 ? goalX(team) : st.los + d * 10;
}
export const goalToGo = (st) => st.fd === goalX(st.poss);
export function downText(st) {
  const n = ["", "1ST", "2ND", "3RD", "4TH"][st.down] || `${st.down}TH`;
  const tg = st.togo;
  const t = goalToGo(st) ? "GOAL" : tg < 1 ? "INCHES" : String(Math.round(tg));
  return `${n} & ${t}`;
}
// "OWN 25", "OPP 40", "50"
export function spotText(t, x) {
  const own = t === 0 ? x : 100 - x, yd = Math.round(own > 50 ? 100 - own : own);
  return yd === 50 ? "MIDFIELD" : `${own < 50 ? "OWN" : "OPP"} ${yd}`;
}

// ---- the CPU's calls -------------------------------------------------------------------------------
// u in [0, 1): the choice's randomness, passed in so the coordinator's pick is a pure function of the
// state (the page may show it before the human picks).
function wpick(list, u) { let tot = 0; for (const [, w] of list) tot += Math.max(0, w); let a = u * tot; for (const [v, w] of list) { a -= Math.max(0, w); if (a < 0) return v; } return list[list.length - 1][0]; }
// -> play id (offence) for team O at this moment.
export function offenceCall(st, O, u, u2 = 0.5) {
  const tg = toGoal(O, st.los), lead = st.score[O] - st.score[1 - O], late4 = (st.q >= 4) && isLate(st), lean = st.cfg.coach[O] ?? 0.5;
  if (st.tryFor === O) return u < 0.5 ? 1 : 5;   // a two-point try: dive or slants
  // the clock is the opponent's last chance: kneel it out
  const defTO = st.to[1 - O];
  if (lead > 0 && st.q >= 4 && st.clock <= (4 - st.down - defTO) * (RUNOFF + 5) * HZ + 3 * HZ && st.down <= 3) return 11;
  if (st.q === 2 && st.clock <= 8 * HZ && tg > 55 && st.down <= 3) return 11;
  if (st.down === 4) {
    const fgOk = tg + 17 <= fgRange(st, O), need = -lead;
    const desperate = late4 && need > 0 && !(fgOk && need <= 3);
    if (!desperate) {
      if (fgOk && !(st.togo <= 1 && tg <= 3 && lean > 0.55)) return 13;
      if (toGoal(O, st.los) > 55 || st.togo > 2 + (lean > 0.6 ? 1 : 0)) return 12;
      if (toGoal(O, st.los) > 45 && st.togo > 1) return 12;
    }
  }
  if (tg <= 2 && st.togo <= 2) return wpick([[10, st.togo <= 1 ? 3 : 1], [14, 5], [9, 2], [5, 1]], u);
  if (hurry(st, O)) return wpick([[6, 4], [5, 3], [7, tg > 25 ? 3 : 1], [8, 1], [1, st.togo <= 3 ? 1 : 0.2]], u);
  if (late4 && lead > 0) return wpick([[1, 5], [2, 3], [3, 1], [6, 1]], u);
  const sh = st.togo <= 2, lg = st.togo >= 7;
  if (st.down >= 3 && lg) return wpick([[7, 3], [6, 3], [5, 2], [8, 1.5], [3, 1], [4, 1]], u);
  if (st.down >= 3 && sh) return wpick([[1, 4], [10, st.togo <= 1 ? 1.5 : 0], [5, 2], [2, 1.5], [9, 1]], u);
  const pass = clamp(0.35 + 0.35 * lean + (st.down === 2 && st.togo >= 8 ? 0.15 : 0) + (tg < 8 ? -0.1 : 0), 0.2, 0.8);
  if (u2 < pass) return wpick([[5, 3], [6, 3], [4, 2], [7, tg > 20 ? 1.5 : 0.3], [8, 1.2], [9, 1.5]], u);
  return wpick([[1, 4], [2, 3], [3, 1.5]], u);
}
// -> defence id for team D.
export function defenceCall(st, D, u) {
  const O = 1 - D, tg = toGoal(O, st.los), lead = st.score[D] - st.score[O], lean = st.cfg.coach[D] ?? 0.5;
  if (tg <= 4) return wpick([[37, 5], [36, 2], [35, 2]], u);
  if (isLate(st) && lead > 0 && lead <= 8 && tg > 25 && st.q >= 4) return wpick([[38, 5], [34, 3], [33, 2]], u);
  if (st.togo >= 8) return wpick([[34, 4], [33, 3.5], [35, 1.5], [36, 0.6 + lean], [38, st.togo >= 15 ? 1 : 0]], u);
  if (st.togo <= 2) return wpick([[36, 2 + lean], [35, 3], [34, 2], [37, st.togo <= 1 ? 2 : 0]], u);
  return wpick([[33, 3], [34, 3], [35, 2], [36, 1 + lean * 1.5]], u);
}
// Legal offence calls this down (no punt on a try, no field goal at midfield is legal but foolish).
export function legalOffence(st) {
  if (st.tryFor >= 0) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14];
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 11, 12, 13];
}
// The coordinator's pick for the human (team 0), without touching the generator.
export function coordinatorPick(st) {
  const u = hash01(st.seed, st.playNo, 7), u2 = hash01(st.seed, st.playNo, 11);
  if (st.need === 0 && st.poss === 0) return offenceCall(st, 0, u, u2);
  return defenceCall(st, 0, u);
}

// ---- formations ------------------------------------------------------------------------------------
const P_ = (st, t, slot) => st.p[st.off[t][slot]];
const D_ = (st, t, slot) => st.p[st.def[t][slot]];
function resetMan(P) { P.vx = 0; P.vy = 0; P.wx = 0; P.wy = 0; P.z = 0; P.vz = 0; P.eng = -1; P.shed = 0; P.cool = 0; P.down = 0; P.act = null; P.moveCool = 0; P.slow = 0; P.tkCool = 0; P.react = 0; P.jam = 0; P.seen = null; P.holdRolled = false; P.seenR = null; P.rdx = 0; P.rdy = 0; P.role = { k: "idle" }; }
function resetBall(st) { Object.assign(st.ball, { st: "dead", own: -1, z: 0, vx: 0, vy: 0, vz: 0, f: 0, T: 0, from: -1, to: -1, lob: false, kind: "", touched: false, ez: false }); }
// The scrimmage down: the offence's formation, the defence's alignment, everyone's job.
function setupScrimmage(st) {
  const O = st.poss, Dt = 1 - O, d = dirOf(O), call = st.calls[O], pl = PLAYS[call.id], fs = call.flip ? -1 : 1;
  st.play = { kind: pl.kind, id: pl.id, def: st.calls[Dt].id, flip: call.flip, side: (pl.side || -1) * fs, try: st.tryFor >= 0 };
  st.flags = []; st.res = null; st.carrier = -1; st.menu = null; st.kick = null; st.cur = { thrown: false, handed: false, sackable: pl.kind === "pass", passer: -1, target: -1, caught: false, turnover: false, gainedEz: false, scramble: false, pa: Boolean(pl.pa), runRead: false, rr: 0 };
  resetBall(st);
  for (const P of st.p) resetMan(P);
  if (pl.kind === "punt" || pl.kind === "fg") { setupKick(st, pl.kind); return; }
  const F = FORMS[pl.form].at;
  for (let s = 0; s < 11; s++) {
    const P = P_(st, O, s), [lat, back] = F[s];
    P.x = st.los - d * back; P.y = clamp(st.ballY + lat * fs, 1.5, W - 1.5);
    P.fx = P.x; P.fy = P.y; P.role = offRole(st, pl, s, fs);
  }
  alignDefence(st, Dt, DEFS[st.calls[Dt].id]);
  st.ball.x = st.los; st.ball.y = st.ballY; st.ball.z = 0.2; st.ball.st = "pre";
  st.phase = "pre"; st.pt = 0;
  st.snapAt = st.cfg.auto || O !== 0 ? (hurry(st, O) ? 25 : 55) + Math.floor(rnd(st) * 40) : -1;
  if (!st.cfg.auto) st.ctl = O === 0 ? P_(st, 0, OS.QB).g : D_(st, 0, st.ctlSlot).g;
}
function offRole(st, pl, s, fs) {
  if (s >= OS.LT) return { k: pl.kind === "pass" && !pl.pa ? "pblock" : pl.kind === "pass" ? "pblock" : "rblock" };
  if (s === OS.QB) return { k: "qb" };
  if (pl.kind === "run" || pl.kind === "sneak" || pl.kind === "kneel") {
    if (s === OS.RB) return pl.kind === "run" ? { k: "carry" } : { k: "rblock" };
    if (s === OS.WR3 && pl.lead) return { k: "lead" };
    return { k: "rblock", wr: s === OS.WR1 || s === OS.WR2 || s === OS.WR3 };
  }
  const rt = pl.routes[s];
  if (!rt || rt === BLOCK) return { k: "pblock", back: s === OS.RB || s === OS.TE };
  const P = { k: "route", r: rt, wp: 0 };
  return P;
}
// y spec -> absolute y. side: +1 when the left wideout (WR1) is on the +y side.
function zoneY(st, spec, side) {
  const n = Number(spec.slice(1));
  if (spec[0] === "s") return clamp(st.ballY + side * n, 3, W - 3);
  return clamp(CY + side * n * W, 4, W - 4);
}
function alignDefence(st, Dt, def) {
  const O = 1 - Dt, d = dirOf(O), wr1 = P_(st, O, OS.WR1), side = wr1.y >= st.ballY ? 1 : -1;
  const tight = def.tight;
  def.a.forEach((a, s) => {
    const D = D_(st, Dt, s);
    D.role = { ...a };
    let x, y;
    if (s <= DS.RE) {   // the line: over the gaps
      const lat = [3.6, 1.0, -1.0, -3.6][s] * side;
      x = st.los + d * 1.0; y = st.ballY + lat * (tight ? 0.85 : 1);
    } else if (a.k === "man") {
      const R = P_(st, O, a.on), inside = R.y > st.ballY ? -1 : 1;
      const deep = s <= DS.SLB ? 4.5 : a.press ? 1.6 : R.os === OS.WR1 || R.os === OS.WR2 ? 6 : 5;
      x = st.los + d * (tight ? Math.min(deep, 3) : deep); y = R.y + inside * (s <= DS.SLB && R.os === OS.RB ? 0 : 0.8);
      if (s <= DS.SLB && R.os === OS.RB) y = st.ballY + (s === DS.WLB ? side * 3 : s === DS.SLB ? -side * 3 : 0);
    } else if (a.k === "zone") {
      const zy = zoneY(st, a.y, side), dep = a.deep ? a.depth - 3 : s <= DS.SLB ? 4.5 : Math.min(a.depth, 6);
      // corners in zone still line up over a wideout
      if (s === DS.CB1 || s === DS.CB2) { const Rw = P_(st, O, s === DS.CB1 ? OS.WR1 : OS.WR2); y = Rw.y + (Rw.y > st.ballY ? -1 : 1) * 1; x = st.los + d * (a.deep ? 7 : 5.5); }
      else { x = st.los + d * dep; y = s <= DS.SLB ? st.ballY + [side * 4, 0, -side * 4][s - DS.WLB] : zy; }
      D.role.zx = st.los + d * a.depth; D.role.zy = zy;
    } else {   // a rushing linebacker
      x = st.los + d * (tight ? 2 : 3.5); y = st.ballY + (s === DS.WLB ? side * 3.5 : s === DS.SLB ? -side * 3.5 : 0);
    }
    D.x = x; D.y = clamp(y, 1, W - 1); D.fx = D.x; D.fy = D.y;
  });
}
// Kicks from scrimmage: the punt and the field goal (and the extra point).
function setupKick(st, kind) {
  const O = st.poss, Dt = 1 - O, d = dirOf(O), K = st.p[st.kicker[O]];
  const others = st.off[O].map(g => st.p[g]).filter(P => P !== K);
  const line = [0, 1.4, -1.4, 2.8, -2.8, 4.2, -4.2];
  if (kind === "punt") {
    const C = P_(st, O, OS.C);
    K.x = st.los - d * 14; K.y = st.ballY; K.role = { k: "punter" };
    const g1 = P_(st, O, OS.WR1), g2 = P_(st, O, OS.WR2), pp = others.find(P => P !== C && P !== g1 && P !== g2 && P.os === OS.RB) || others.find(P => P !== C && P !== g1 && P !== g2);
    const rest = others.filter(P => P !== g1 && P !== g2 && P !== pp && P !== C);
    C.x = st.los - d * 0.55; C.y = st.ballY; C.role = { k: "pblock", st: true };
    rest.forEach((P, i) => { P.x = st.los - d * 0.75; P.y = st.ballY + line[1 + (i % 6)]; P.role = { k: "pblock", st: true }; });
    if (K.os === OS.WR1 || K.os === OS.WR2) { /* the kicker was a gunner: the slot takes his place */ }
    g1.x = st.los - d * 0.75; g1.y = clamp(st.ballY + 20, 2, W - 2); g1.role = { k: "gunner" };
    g2.x = st.los - d * 0.75; g2.y = clamp(st.ballY - 20, 2, W - 2); g2.role = { k: "gunner" };
    if (g1 === K || g2 === K) { /* never: the kicker kicks */ }
    pp.x = st.los - d * 5; pp.y = st.ballY + 0.8; pp.role = { k: "pblock", st: true };
    // the return: six at the line, two on the gunners, the returner deep
    const recv = st.def[Dt].map(g => st.p[g]), Rt = st.p[st.ret[Dt]], rest2 = recv.filter(P => P !== Rt);
    Rt.x = clamp(st.los + d * 42, 3, 97); if (toGoal(O, Rt.x) < 3) Rt.x = goalX(O) - d * 3; Rt.y = CY; Rt.role = { k: "ret" };
    rest2.forEach((P, i) => {
      if (i < 6) { P.x = st.los + d * 1; P.y = st.ballY + [1, -1, 3, -3, 5, -5][i]; P.role = { k: "prush" }; }
      else if (i < 8) { const gg = i === 6 ? g1 : g2; P.x = st.los + d * 1.5; P.y = gg.y; P.role = { k: "jam", on: gg.g }; }
      else { P.x = clamp(st.los + d * 22, 2, 98); P.y = CY + (i === 8 ? 8 : -8); P.role = { k: "kblock" }; }
    });
  } else {
    const H = P_(st, O, OS.QB) === K ? others[0] : P_(st, O, OS.QB), C = P_(st, O, OS.C);
    H.x = st.los - d * 7; H.y = st.ballY; H.role = { k: "holder" };
    K.x = st.los - d * 9.5; K.y = st.ballY + 1.2; K.role = { k: "fgkicker" };
    C.x = st.los - d * 0.55; C.y = st.ballY; C.role = { k: "pblock", st: true };
    others.filter(P => P !== H && P !== C).forEach((P, i) => { P.x = st.los - d * 0.75; P.y = st.ballY + [1.4, -1.4, 2.8, -2.8, 4.2, -4.2, 5.4, -5.4][i]; P.role = { k: "pblock", st: true }; });
    st.def[Dt].map(g => st.p[g]).forEach((P, i) => {
      if (i < 8) { P.x = st.los + d * 1; P.y = st.ballY + [0.7, -0.7, 2.1, -2.1, 3.5, -3.5, 5, -5][i]; P.role = { k: "fgrush" }; }
      else { P.x = st.los + d * (8 + i); P.y = st.ballY + (i - 9) * 7; P.role = { k: "idle" }; }
    });
  }
  for (const P of st.p) { P.fx = P.x; P.fy = P.y; }
  st.ball.x = st.los; st.ball.y = st.ballY; st.ball.z = 0.2; st.ball.st = "pre";
  st.play.kind = st.tryFor >= 0 && kind === "fg" ? "pat" : kind;
  st.kick = { kind: st.play.kind, stage: 0, f: 0, pow: 0, e: 0, aim: 0, by: O, done: false };
  st.phase = "pre"; st.pt = 0;
  const hk = !st.cfg.auto && O === 0;
  st.snapAt = hk ? -1 : 50 + Math.floor(rnd(st) * 20);
  if (!hk) cpuKickValues(st);
  if (!st.cfg.auto) st.ctl = O === 0 ? K.g : st.p[st.ret[1]].g === -1 ? -1 : (kind === "punt" ? st.p[st.ret[0]].g : D_(st, 0, DS.MLB).g);
}
// A kickoff by team t from its own `from` (35; 20 after a safety).
function setupKickoff(st, t, from) {
  const d = dirOf(t), x0 = fromOwn(t, from), Rt = 1 - t;
  for (const P of st.p) resetMan(P);
  resetBall(st);
  st.flags = []; st.res = null; st.carrier = -1; st.menu = null; st.tryFor = -1; st.tryChoice = false;
  st.play = { kind: "ko", id: 0, def: 0, flip: false, side: 0, try: false, from };
  st.cur = { thrown: false, handed: false, sackable: false, passer: -1, target: -1, caught: false, turnover: false, gainedEz: false, scramble: false, runRead: true, rr: 0 };
  st.poss = t; st.los = x0; st.ballY = CY; st.down = 0;
  const K = st.p[st.kicker[t]], team = st.p.filter(P => P.t === t && P !== K);
  K.x = x0 - d * 6; K.y = CY; K.role = { k: "kicker" };
  team.forEach((P, i) => { const lane = 4 + (i * (W - 8)) / 9; P.x = x0 - d * 1; P.y = lane; P.role = { k: "cover", lane }; });
  const Rr = st.p[st.ret[Rt]], recv = st.p.filter(P => P.t === Rt && P !== Rr);
  Rr.x = fromOwn(Rt, 3); Rr.y = CY; Rr.role = { k: "ret" };
  const spots = [[45, 10], [45, 18], [45, CY], [45, W - 18], [45, W - 10], [32, CY - 9], [32, CY], [32, CY + 9], [20, CY - 5], [20, CY + 5]];
  recv.forEach((P, i) => { P.x = fromOwn(Rt, spots[i][0]); P.y = spots[i][1]; P.role = { k: "kblock", sx: P.x, sy: P.y }; });
  for (const P of st.p) { P.fx = P.x; P.fy = P.y; }
  Object.assign(st.ball, { x: x0, y: CY, z: 0.15, st: "tee" });
  st.kick = { kind: "ko", stage: 0, f: 0, pow: 0, e: 0, aim: 0, by: t, done: false };
  st.phase = "pre"; st.pt = 0;
  const hk = !st.cfg.auto && t === 0;
  st.snapAt = hk ? -1 : 70;
  if (!hk) cpuKickValues(st);
  if (!st.cfg.auto) st.ctl = t === 0 ? K.g : Rr.t === 0 ? Rr.g : -1;
}
function cpuKickValues(st) {
  const k = st.kick, K = st.p[st.kicker[k.by]], d = dirOf(k.by);
  const sigE = 0.45 - 0.25 * K.kac;
  if (k.kind === "fg" || k.kind === "pat") {
    const D = toGoal(k.by, st.los) + 17, Rmax = kickRmax(K), need = D / Math.max(0.2, 1 - 4.44 / D);
    k.pow = clamp((need * 1.07) / Rmax + gauss(st) * 0.035, 0.3, 1); k.e = gauss(st) * sigE;
  } else if (k.kind === "punt") {
    k.pow = clamp(0.86 + gauss(st) * 0.07, 0.4, 1); k.e = gauss(st) * sigE;
    const tg = toGoal(k.by, st.los);
    if (tg < 50) k.pow = clamp(k.pow * (0.55 + tg / 110), 0.35, 1);   // a short field: kick it shorter, inside the 20
    k.aim = 0;
  } else { k.pow = clamp(0.93 + gauss(st) * 0.05, 0.5, 1); k.e = gauss(st) * sigE; k.aim = (rnd(st) - 0.5) * 0.6; }
  k.stage = 3; k.cpu = true; void d;
}

// A kicker's full-power carry (yards) and the longest field goal he can clear the bar from.
export const kickRmax = (K) => 50 + 20 * K.kpw;
export function fgRange(st, t) { const R = kickRmax(st.p[st.kicker[t]]) * 0.97; return Math.floor(R - 4.6); }

// ---- motion ---------------------------------------------------------------------------------------
function want(P, x, y, sp) {
  const dx = x - P.x, dy = y - P.y, m = len(dx, dy);
  if (m < 0.05) { P.wx = 0; P.wy = 0; return; }
  const v = Math.min(sp, m * 5);
  P.wx = (dx / m) * v; P.wy = (dy / m) * v;
}
function integrate(st, P) {
  if (P.down > 0) { P.down--; P.vx *= 0.8; P.vy *= 0.8; P.x += P.vx * DT; P.y += P.vy * DT; return; }
  let wx = P.wx, wy = P.wy;
  if (P.slow > 0) { P.slow--; wx *= 0.55; wy *= 0.55; }
  if (P.jam > 0) { P.jam--; wx *= 0.35; wy *= 0.35; }
  const dvx = wx - P.vx, dvy = wy - P.vy, m = len(dvx, dvy), a = P.acc * DT * (P.act?.kind === "juke" ? 2.4 : P.role?.k === "route" || P.role?.k === "catch" ? 1.5 : 1);
  if (m > a) { P.vx += (dvx / m) * a; P.vy += (dvy / m) * a; } else { P.vx = wx; P.vy = wy; }
  P.x += P.vx * DT; P.y += P.vy * DT;
  // stamina: sprinting drains it, everything else gives it back
  const sp = len(P.vx, P.vy);
  if (P.sprint && sp > P.spd * 0.9) P.stam = Math.max(0, P.stam - 0.11 * DT); else P.stam = Math.min(1, P.stam + 0.05 * DT);
  if (P.z > 0 || P.vz) { P.vz -= G * DT; P.z += P.vz * DT; if (P.z <= 0) { P.z = 0; P.vz = 0; } }
}
// The routes: the next waypoint, or on along the last leg, or settled.
function routeTarget(st, P) {
  const r = R[P.role.r], O = P.t, d = dirOf(O), out = P.role.out ?? (P.fy >= st.ballY ? 1 : -1);
  P.role.out = out;
  const pts = r.pts;
  while (P.role.wp < pts.length) {
    const [u, v] = pts[P.role.wp], tx = P.fx + d * (u + (P.fx - st.los) * -d * 0), ty = P.fy + out * v;
    const ax = st.los + d * u, ay = clamp(ty, 0.8, W - 0.8);
    if (len(ax - P.x, ay - P.y) < 0.9) { P.role.wp++; continue; }
    void tx;
    return [ax, ay, false];
  }
  if (r.settle) { const [u, v] = pts[pts.length - 1]; return [st.los + d * u, clamp(P.fy + out * v, 0.8, W - 0.8), true]; }
  const a = pts[pts.length - 2] || [0, 0], b = pts[pts.length - 1];
  const ex = st.los + d * (b[0] + (b[0] - a[0]) * 3), ey = clamp(P.fy + out * (b[1] + (b[1] - a[1]) * 3), 0.8, W - 0.8);
  return [ex, ey, false];
}

// ---- the snap and the scripted backfield ------------------------------------------------------------
function snap(st) {
  const O = st.poss, pl = PLAYS[st.play.id] || {};
  st.phase = "live"; st.pt = 0; st.clockOn = true; st.playNo++;
  const Q = P_(st, O, OS.QB), C = P_(st, O, OS.C), b = st.ball;
  b.from = C.g;
  if (st.play.kind === "punt" || st.play.kind === "fg" || st.play.kind === "pat") {
    const to = st.play.kind === "punt" ? st.p[st.kicker[O]] : st.p.find(P => P.role?.k === "holder");
    Object.assign(b, { st: "snap", own: -1, to: to.g, x: C.x, y: C.y, z: 0.4, f: 0, T: st.play.kind === "punt" ? 45 : 24 });
    st.clockOn = st.play.kind !== "pat";
    say(st, "snap");
    return;
  }
  const gun = pl.form === "gun";
  Object.assign(b, { st: "snap", own: -1, to: Q.g, x: C.x, y: C.y, z: 0.4, f: 0, T: gun ? 16 : 3 });
  // the run: the back's path to the mesh, the quarterback's turn to meet him
  if (st.play.kind === "run") {
    const RB = P_(st, O, OS.RB);
    RB.role.mesh = pl.run === "stretch" ? 10 : pl.run === "draw" ? 40 : gun ? 22 : 30;
  }
  // a CPU lineman may move early: false start; a CPU defender may jump: offside
  const fsRate = st.cfg.auto || O !== 0 ? 0.006 : 0.004, offRate = 0.006;
  if (rnd(st) < fsRate) { const L = P_(st, O, OS.LT + Math.floor(rnd(st) * 5)); flag(st, { k: "falsestart", team: O, g: L.g, yards: 5, pre: true }); whistle(st, { k: "nop" }); return; }
  if ((st.cfg.auto || O === 0) && rnd(st) < offRate) { const D = D_(st, 1 - O, Math.floor(rnd(st) * 4)); flag(st, { k: "offside", team: 1 - O, g: D.g, yards: 5, pre: true }); whistle(st, { k: "nop" }); return; }
  say(st, "snap");
}
function flag(st, f) { if (!st.flags.some(x => x.k === f.k && x.team === f.team)) { st.flags.push(f); say(st, "flag", f.g ?? -1, { team: f.team, fk: f.k }); } }

// ---- the AI ----------------------------------------------------------------------------------------
const holder = (st) => (st.ball.st === "held" ? st.p[st.ball.own] : null);
function nearest(st, x, y, team, pred = () => true) { let best = null, bd = 1e9; for (const P of st.p) { if (P.t !== team || P.down > 0 || !pred(P)) continue; const k = len(P.x - x, P.y - y); if (k < bd) { bd = k; best = P; } } return best; }
// Pursuit: aim where the carrier will be.
function pursue(st, D, C, sp = D.spd) {
  let tx = C.x, ty = C.y;
  for (let k = 0; k < 2; k++) { const t = Math.min(1.3, len(tx - D.x, ty - D.y) / sp); tx = C.x + C.vx * t * 0.85; ty = C.y + C.vy * t * 0.85; }
  want(D, tx, ty, sp);
}
// The defence reads run: everyone not engaged chases, after his own reaction.
function chase(st, D, C) {
  if (D.react === 0) D.react = st.pt + Math.round((D.role.k === "zone" && D.role.deep ? 18 : D.role.k === "rush" ? 4 : 10) + (1 - D.awr) * 14 * (st.cfg.assist && D.t === 1 ? 1.4 : 1));
  if (st.pt < D.react) return false;
  pursue(st, D, C);
  return true;
}
// Openness of a receiver for a throw from Q now: the nearest defender's distance to the catch
// point when the ball gets there (yards), with the target and the flight time.
function leadOf(st, Q, Rr, lob) {
  const vh = lob ? 13 + 4 * Q.thp : 20 + 7 * Q.thp;
  let px = Rr.x, py = Rr.y, T = 0;
  for (let k = 0; k < 3; k++) { T = len(px - Q.x, py - Q.y) / vh; [px, py] = routePos(st, Rr, T); }
  return { px, py: clamp(py, 0.3, W - 0.3), T, vh };
}
// Where a receiver will be in t seconds: along the rest of his route (a curl stops, a slant runs
// on), or on his present heading when he has none.
function routePos(st, Rr, t) {
  if (Rr.role.k !== "route" || !R[Rr.role.r]) return [Rr.x + Rr.vx * t, Rr.y + Rr.vy * t];
  const r = R[Rr.role.r], d = dirOf(Rr.t), out = Rr.role.out ?? (Rr.fy >= st.ballY ? 1 : -1);
  const pts = r.pts.map(([u, v]) => [st.los + d * u, clamp(Rr.fy + out * v, 0.8, W - 0.8)]);
  if (!r.settle) { const a = r.pts[r.pts.length - 2] || [0, 0], b = r.pts[r.pts.length - 1]; pts.push([st.los + d * (b[0] + (b[0] - a[0]) * 3), clamp(Rr.fy + out * (b[1] + (b[1] - a[1]) * 3), 0.8, W - 0.8)]); }
  let x = Rr.x, y = Rr.y, left = Rr.spd * 0.82 * t;
  for (let i = Rr.role.wp; i < pts.length && left > 0; i++) {
    const [tx, ty] = pts[i], m = len(tx - x, ty - y);
    if (m <= left) { x = tx; y = ty; left -= m; if (i + 1 < pts.length) left -= Rr.spd * 0.18; } else { x += ((tx - x) / m) * left; y += ((ty - y) / m) * left; left = 0; }
  }
  return [x, y];
}
function openness(st, Q, Rr) {
  const lob = Boolean(R[Rr.role.r]?.deep) && toGoal(Rr.t, Rr.x) > 8 && Math.abs(Rr.x - Q.x) > 16;
  const L = leadOf(st, Q, Rr, lob);
  let sep = 99;
  for (const D of st.p) {
    if (D.t === Rr.t || D.down > 0) continue;
    const re = Math.min(L.T, 0.25), mo = Math.min(L.T, 0.7), fx = D.x + D.vx * mo, fy = D.y + D.vy * mo;
    const k = Math.max(0, len(fx - L.px, fy - L.py) - D.spd * clamp(L.T - re, 0, 0.75) * 0.95);
    if (k < sep) sep = k;
  }
  return { sep, lob, L };
}
function pressure(st, Q) {
  let m = 99;
  for (const D of st.p) { if (D.t === Q.t || D.eng >= 0 || D.down > 0) continue; const k = len(D.x - Q.x, D.y - Q.y); if (k < m) m = k; }
  return m;
}
function qbThink(st, Q) {
  const O = Q.t, d = dirOf(O), pl = PLAYS[st.play.id], b = st.ball, pt = st.pt;
  if (b.st !== "held" || b.own !== Q.g) {
    // after the throw or the handoff: carry out the fake, then watch
    if (st.cur.handed && pl.kind === "run") { want(Q, Q.x - d * 1.5, Q.y + (st.play.side || 1) * -2, 4); return; }
    Q.wx *= 0.9; Q.wy *= 0.9; return;
  }
  const hum = human(st, Q);
  if (pl.kind === "kneel") { if (pt > 20) { Q.z = 0; whistle(st, { k: "down", x: Q.x, y: Q.y, g: Q.g, kneel: true }); } return; }
  if (pl.kind === "sneak") { Q.role.k = "runner"; st.carrier = Q.g; st.cur.runRead = true; return; }
  const gun = pl.form === "gun";
  if (pl.kind === "run") {
    const RB = P_(st, O, OS.RB);
    const meshX = st.los - d * (pl.run === "stretch" ? 1.5 : pl.run === "draw" ? (gun ? 6 : 4) : (gun ? 5 : 3.2));
    want(Q, meshX, st.ballY + (pl.run === "stretch" ? st.play.side * 1.5 : 0), 5);
    if (pl.run === "stretch" && pt >= 10 && !st.cur.handed) { toss(st, Q, RB); return; }
    if (pt >= RB.role.mesh && len(RB.x - Q.x, RB.y - Q.y) < 1.6) handoff(st, Q, RB);
    return;
  }
  // the pass: the drop
  let dx, dy = st.ballY;
  if (pl.drop === "boot") {
    if (pt < 30) { dx = st.los - d * 3.5; dy = st.ballY + st.play.side * -0.5; }
    else { dx = st.los - d * 6; dy = st.ballY + st.play.side * 9; }
  } else if (pl.pa && pt < 28) { dx = st.los - d * 3.5; dy = st.ballY; }
  else { const depth = gun ? 5 + (pl.drop === 7 ? 2.5 : pl.drop === 5 ? 1.5 : 0.5) : pl.drop + 1; dx = st.los - d * depth; }
  if (hum && (st.mask & 15)) { /* the stick drives him: humanThink set wx/wy */ }
  else if (!(hum && st.held.moved)) want(Q, dx, dy, pl.drop === "boot" && pt >= 30 ? Q.spd * 0.85 : 5.5);
  // past the line he is a runner
  if (d * (Q.x - st.los) > 0.3) { Q.role.k = "runner"; st.carrier = Q.g; st.cur.scramble = true; st.cur.runRead = true; st.cur.sackable = false; return; }
  if (hum) return;   // the human throws with the buttons
  const readAt = pl.screen ? 80 : pl.drop === 3 ? (gun ? 34 : 40) : pl.drop === 5 ? 48 : pl.drop === "boot" ? 78 : pl.pa ? 80 : 64;
  if (pt < readAt) return;
  const reads = pl.reads.map(s => P_(st, O, s)).filter(P => P.role.k === "route");
  const step = 20, idx = Math.floor((pt - readAt) / step), pr = pressure(st, Q);
  const thr = (deep) => (deep ? 1.5 : 1.25) - (1 - Q.awr) * 0.4 + (st.cfg.assist && O === 1 ? -0.2 : 0);
  if (pl.screen) {
    const RB = P_(st, O, OS.RB), o = openness(st, Q, RB);
    if (o.sep > 0.9 || pt > 110) return throwTo(st, Q, RB, false);
    return;
  }
  if (idx < reads.length) {
    const Rr = reads[idx], o = openness(st, Q, Rr);
    if (o.sep >= thr(o.lob)) return throwTo(st, Q, Rr, o.lob);
  }
  const hot = pr < 2.2, done = idx >= reads.length + 1;
  if (hot || done) {
    let best = null, bs = -1, blob = false;
    for (const Rr of reads) { const o = openness(st, Q, Rr); const sc = o.sep + (R[Rr.role.r]?.deep ? 0.4 : 0); if (sc > bs) { bs = sc; best = Rr; blob = o.lob; } }
    const okThr = hot ? 0.45 : 0.7;
    if (best && bs >= okThr) return throwTo(st, Q, best, blob);
    // scramble when there is room in front, else throw it away (or hold it and pray)
    const room = !st.p.some(D => D.t !== O && D.down === 0 && d * (D.x - Q.x) > -1 && d * (D.x - Q.x) < 6 && Math.abs(D.y - Q.y) < 3.5);
    if (room && rnd(st) < (hot ? 0.06 : 0.04) * (0.5 + Q.k)) { Q.role.k = "runner"; st.carrier = Q.g; st.cur.scramble = true; st.cur.runRead = true; return; }
    if ((done && pt > readAt + (reads.length + 2.5) * step) || (hot && rnd(st) < 0.035 + 0.04 * Q.awr)) return throwAway(st, Q, best || reads[0]);
  }
}
function handoff(st, Q, RB) {
  const b = st.ball;
  Object.assign(b, { st: "held", own: RB.g });
  st.cur.handed = true; st.carrier = RB.g; RB.role.k = "runner"; st.cur.runRead = true; st.cur.sackable = false;
  if (!st.cfg.auto && RB.t === 0) st.ctl = RB.g;
  say(st, "handoff", RB.g);
}
function toss(st, Q, RB) {
  const b = st.ball, d = dirOf(Q.t);
  st.cur.handed = true; st.cur.sackable = false;
  const tx = RB.x + RB.vx * 0.4, ty = RB.y + RB.vy * 0.4;
  Object.assign(b, { st: "pitch", own: -1, from: Q.g, to: RB.g, x: Q.x, y: Q.y, z: 1.1, f: 0, T: 16, tx, ty });
  void d;
}
function aim(b, tx, ty, tz, s) { b.vx = (tx - b.x) / s; b.vy = (ty - b.y) / s; b.vz = (tz - b.z) / s + (G * s) / 2; }
function throwTo(st, Q, Rr, lob) {
  const b = st.ball, L = leadOf(st, Q, Rr, lob), maxD = 36 + 26 * Q.thp;
  let { px, py } = L;
  const dist = len(px - Q.x, py - Q.y);
  if (dist > maxD) { const k = maxD / dist; px = Q.x + (px - Q.x) * k; py = Q.y + (py - Q.y) * k; }
  const hum = !st.cfg.auto && Q.t === 0;
  let sig = (0.35 + 1.15 * (1 - Q.tha)) * (1 + dist / 28);
  if (pressure(st, Q) < 2.2) sig *= 1.6;
  if (len(Q.vx, Q.vy) > 2.5) sig *= 1.35;
  if (lob) sig *= 1.15;
  if (st.cfg.assist) sig *= hum ? 0.6 : 1.1;
  px += gauss(st) * sig * 1.12; py += gauss(st) * sig * 1.12;
  const T = Math.max(6, Math.round((len(px - Q.x, py - Q.y) / L.vh) * HZ));
  Object.assign(b, { st: "air", own: -1, from: Q.g, to: Rr.g, x: Q.x, y: Q.y, z: 2.0, f: 0, T, tx: px, ty: py, lob, away: false, swat: -99 });
  aim(b, px, py, 1.3, T / HZ);
  st.cur.thrown = true; st.cur.passer = Q.g; st.cur.target = Rr.g; st.cur.sackable = false; st.cur.airFrom = Q.x;
  st.stat[Q.t].pa++; st.ps[Q.g].pa++;
  Rr.role = { k: "catch", r: Rr.role.r };
  if (hum) st.ctl = Rr.g;
  for (const D of st.p) if (D.t !== Q.t) D.seen = st.pt + Math.round(5 + (1 - D.awr) * 12 + (st.cfg.assist && D.t === 1 ? 6 : 0));
  say(st, lob ? "lob" : "throw", Q.g, { to: Rr.g });
}
function throwAway(st, Q, Rr) {
  const b = st.ball, side = (Rr ? Rr.y : Q.y) > CY ? 1 : -1, tx = (Rr ? Rr.x : Q.x + dirOf(Q.t) * 8), ty = side > 0 ? W + 4 : -4;
  const T = Math.round((len(tx - Q.x, ty - Q.y) / 18) * HZ);
  Object.assign(b, { st: "air", own: -1, from: Q.g, to: -1, x: Q.x, y: Q.y, z: 2.0, f: 0, T, tx, ty, lob: false, away: true, swat: -99 });
  aim(b, tx, ty, 1.5, T / HZ);
  st.cur.thrown = true; st.cur.passer = Q.g; st.cur.sackable = false;
  st.stat[Q.t].pa++; st.ps[Q.g].pa++;
  say(st, "away", Q.g);
}
// The ball carrier's feet: look a little ahead along eleven headings, take the one with the most
// room and the most ground. A blocker's man counts for a quarter.
const HEAD = [[1, 0], [0.92, 0.38], [0.92, -0.38], [0.71, 0.71], [0.71, -0.71], [0.38, 0.92], [0.38, -0.92], [0, 1], [0, -1], [-0.5, 0.86], [-0.5, -0.86]];
function runnerThink(st, C) {
  const d = dirOf(C.t), sp = C.spd * (C.stam < 0.15 ? 0.93 : 0.97);
  if (st.frame % 3 === C.g % 3 || (!C.rdx && !C.rdy)) {
    const late = isLate(st) && st.score[C.t] <= st.score[1 - C.t] && st.q >= 2;
    const pre = st.play.kind === "run" && d * (C.x - st.los) < 0.5 && !st.cur.turnover;
    const side = st.play.side || 0, outside = PLAYS[st.play.id]?.run === "stretch";
    let best = -1e9, bx = 1, by = 0;
    for (const [f, l] of HEAD) {
      const ux = d * f, uy = l;
      let s = f * 2.3;
      const px = C.x + ux * sp * 0.5, py = C.y + uy * sp * 0.5, qx = C.x + ux * sp * 1.1, qy = C.y + uy * sp * 1.1;
      for (const D of st.p) {
        if (D.t === C.t || D.down > 0) continue;
        const e = D.eng >= 0 ? 0.22 : 1, a = len(D.x - px, D.y - py), c = len(D.x - qx, D.y - qy);
        if (a < 3.4) s -= e * (3.4 - a) * (3.4 - a) * 0.5;
        if (c < 4.6) s -= e * (4.6 - c) * (4.6 - c) * 0.13;
      }
      if (qy < 1.2 || qy > W - 1.2) s += late ? 0.6 : -2.5;
      if (pre && outside) s += uy * side * 0.9;
      else if (pre) s -= Math.abs(py - st.ballY) * 0.12;
      s += 0.3 * (ux * C.rdx + uy * C.rdy);
      if (s > best) { best = s; bx = ux; by = uy; }
    }
    C.rdx = bx; C.rdy = by;
  }
  C.wx = C.rdx * sp; C.wy = C.rdy * sp;
  // a move, now and then, when a tackler squares up
  if (C.moveCool === 0 && !C.act) {
    const D = st.p.find(Q => Q.t !== C.t && Q.down === 0 && Q.eng < 0 && len(Q.x - C.x, Q.y - C.y) < 2.3 && d * (Q.x - C.x) > 0);
    if (D && rnd(st) < 0.022 * (0.4 + C.k)) {
      const u = rnd(st), lat = D.y > C.y ? -1 : 1;
      startMove(st, C, u < 0.45 ? "juke" : u < 0.65 ? "spin" : C.str > 0.55 && u < 0.85 ? "truck" : "stiff", lat);
    }
  }
}
function startMove(st, C, kind, lat = 0) {
  if (C.moveCool > 0 || C.act) return;
  const dur = { juke: 14, spin: 22, truck: 22, stiff: 26 }[kind];
  C.act = { kind, f: 0, dur, lat: lat || (C.rdy > 0 ? 1 : -1) };
  C.moveCool = dur + 24;
  C.stam = Math.max(0, C.stam - 0.05);
  st.ev.push(kind);
}
// Blockers. Pass protection: stand between the nearest rusher and the passer. Run blocking: fire
// into the nearest defender in front. Return blocking: the nearest man closing on the returner.
function blockThink(st, B) {
  if (B.eng >= 0) return;
  const O = B.t, d = dirOf(O), Q = P_(st, O, OS.QB), C = st.carrier >= 0 ? st.p[st.carrier] : null;
  if (B.cool > 0) { B.cool--; B.wx *= 0.85; B.wy *= 0.85; return; }
  const k = B.role.k;
  if (k === "pblock" && !(B.role.st && st.pt > 70)) {
    if (st.cur.thrown && st.pt > 0) { B.wx *= 0.8; B.wy *= 0.8; return; }
    const screen = PLAYS[st.play.id]?.screen;
    if (screen && st.pt > 50 && B.os >= OS.LT && B.os !== OS.C) {   // release to lead the screen
      const RB = P_(st, O, OS.RB);
      if (st.carrier === RB.g) { B.role = { k: "rblock" }; return; }
      want(B, RB.x + d * 4, RB.y + (B.os === OS.LG || B.os === OS.RG ? 0 : (B.y > RB.y ? 2 : -2)), B.spd * 0.85); return;
    }
    let best = null, bd = 8;
    const anchor = Q.x, ay = B.role.back ? Q.y : B.fy;
    for (const D of st.p) {
      if (D.t === O || D.down > 0) continue;
      const rushing = D.role.k === "rush" || D.role.k === "fgrush" || D.role.k === "prush" || (d * (D.x - st.los) < 2.5 && st.pt > 20);
      if (!rushing) continue;
      const taken = st.p.filter(Q2 => Q2.eng === D.g).length;
      const k2 = len(D.x - B.x, D.y - ay) * 0.6 + len(D.x - B.x, D.y - B.y) * 0.4 + taken * 3;
      if (k2 < bd) { bd = k2; best = D; }
    }
    if (best) { const vx = anchor - best.x, vy = Q.y - best.y, m = len(vx, vy) || 1; want(B, best.x + (vx / m) * 1.0, best.y + (vy / m) * 1.0, B.spd * 0.85); }
    else want(B, st.los - d * (B.role.back ? 3 : 1.6), B.fy, 3);
    return;
  }
  // run blocking (and every block after the ball is past the line)
  let best = null, bd = 1e9;
  for (const D of st.p) {
    if (D.t === O || D.down > 0) continue;
    const taken = st.p.filter(Q2 => Q2.eng === D.g).length;
    if (taken >= 2) continue;
    const ahead = d * (D.x - B.x);
    if (ahead < -1.5 && !(C && len(D.x - C.x, D.y - C.y) < 4)) continue;
    let k2 = len(D.x - B.x, D.y - B.y) + taken * (k === "kblock" ? 2.5 : 7);
    if (C) k2 += len(D.x - C.x, D.y - C.y) * 0.35;
    if (k === "lead" && D.ds >= DS.WLB && D.ds <= DS.SLB) k2 -= 3;
    if (k2 < bd) { bd = k2; best = D; }
  }
  if (best && bd < 14) want(B, best.x - d * 0.4, best.y, B.spd * (k === "kblock" ? 0.95 : 0.9));
  else if (C) want(B, C.x + d * 4, C.y, B.spd * 0.8);
  else want(B, B.x + d * 1, B.y, 3);
}
// Coverage: man (mirror the receiver, re-reading him every few frames, so a sharp cut wins a step)
// and zone (drop to the spot, take the most dangerous man who comes into it).
function coverThink(st, D) {
  const O = 1 - D.t, d = dirOf(O), a = D.role, b = st.ball;
  if (st.cur.thrown && b.st === "air" && !b.away && D.seen != null && st.pt >= D.seen) {
    // the ball is up: go get it, if it can be got
    const T = (b.T - b.f) / HZ, reach = len(b.tx - D.x, b.ty - D.y), can = reach <= D.spd * (T + 0.45) + 1.5;
    if (can) { want(D, b.tx, b.ty, D.spd); return; }
    const Rr = st.p[b.to]; if (Rr) { pursue(st, D, Rr); return; }
  }
  if (a.k === "man") {
    const Rr = P_(st, O, a.on);
    if (Rr.role.k === "pblock" || Rr.role.k === "rblock") {   // he stays in to block: sit underneath and read
      want(D, st.los + d * 6, clamp(st.ballY + (D.fy - st.ballY) * 0.4, 2, W - 2), D.spd * 0.7); return;
    }
    const lag = Math.round(10 + (1 - D.cov) * 14 + (st.cfg.assist && D.t === 1 ? 6 : 0));
    if (!D.seenR || st.frame - D.seenR.f >= lag) D.seenR = { f: st.frame, vx: Rr.vx, vy: Rr.vy };
    const deep = d * (Rr.x - st.los) > 12 ? 0.9 : 0.6, inside = Rr.y > st.ballY ? -0.6 : 0.6;
    const tx = Rr.x + D.seenR.vx * 0.3 + d * deep, ty = Rr.y + D.seenR.vy * 0.3 + inside;
    want(D, tx, ty, D.spd * 0.95);
    if (a.press && st.pt === 1 && len(Rr.x - D.x, Rr.y - D.y) < 2.5) Rr.jam = Math.round(clamp(10 + (D.cov - Rr.k) * 30, 4, 24));
    return;
  }
  // zone
  const zx = a.zx, zy = a.zy, deepZ = a.deep;
  let threat = null, tv = -1e9;
  for (const Rr of st.p) {
    if (Rr.t !== O || Rr.role.k !== "route" && Rr.role.k !== "catch") continue;
    const fx = Rr.x + Rr.vx * 0.5, fy = Rr.y + Rr.vy * 0.5, depth = d * (fx - st.los);
    const lat = Math.abs(fy - zy), half = deepZ ? (a.y[0] === "f" && Math.abs(Number(a.y.slice(1))) < 0.2 ? 10 : 12) : 8;
    if (lat > half) continue;
    if (deepZ ? depth < 9 : depth > 16 || depth < -1) continue;
    const v = deepZ ? depth : -len(fx - zx, fy - zy);
    if (v > tv) { tv = v; threat = Rr; }
  }
  if (!threat || st.pt < (deepZ ? 12 : 22)) { want(D, zx, zy, D.spd * (st.pt < 40 ? 0.85 : 0.7)); return; }
  const tdep = d * (threat.x + threat.vx * 0.35 - st.los), ty = threat.y + threat.vy * 0.35;
  if (deepZ) { const dep = Math.max(tdep + 3, a.depth - 3); want(D, st.los + d * dep, ty * 0.7 + zy * 0.3, D.spd); }
  else { const dep = clamp(tdep + 1, 3, a.depth + 3); want(D, st.los + d * dep, ty * 0.8 + zy * 0.2, D.spd * 0.95); }
}
function rushThink(st, D) {
  const O = 1 - D.t, Q = P_(st, O, OS.QB), C = st.carrier >= 0 ? st.p[st.carrier] : null;
  if (D.eng >= 0) return;
  const tgt = C || (st.ball.st === "held" ? st.p[st.ball.own] : Q);
  const dist = len(tgt.x - D.x, tgt.y - D.y);
  // contain: the ends keep outside the passer until they are near him
  const lane = D.ds === DS.LE || D.ds === DS.RE ? (D.fy > st.ballY ? 1 : -1) * Math.min(2.5, dist * 0.3) : 0;
  if (C && C !== Q) { pursue(st, D, C); return; }
  want(D, tgt.x, tgt.y + lane, D.spd * 0.95);
}
// Kicks: coverage, returners, holders.
function kickAI(st, P) {
  const b = st.ball, k = P.role.k, d = dirOf(st.kick?.by ?? st.poss);
  if (k === "cover" || k === "gunner") {
    if (st.carrier >= 0) { pursue(st, P, st.p[st.carrier]); return; }
    if (b.st === "kick" || b.st === "kloose") {
      const lx = b.st === "kick" ? b.lx : b.x, ly = b.st === "kick" ? b.ly : b.y;
      const lane = k === "cover" ? P.role.lane : P.y;
      want(P, lx - d * (b.st === "kloose" ? 0 : 6), b.st === "kloose" ? ly : lane * 0.55 + ly * 0.45, P.spd);
      return;
    }
    if (k === "gunner" && st.phase === "live") want(P, P.x + d * 10, P.y, P.spd);
    return;
  }
  if (k === "ret") {
    if (b.st === "kick") { want(P, b.lx, b.ly, P.spd); return; }
    if (b.st === "kloose") { want(P, b.x, b.y, P.spd); return; }
    return;
  }
  if (k === "kicker") { if (st.phase === "live" && st.kick && !st.kick.done) want(P, b.x - d * 0.4, b.y, 4.5); else if (st.carrier >= 0) pursue(st, P, st.p[st.carrier], P.spd * 0.9); return; }
  if (k === "punter" || k === "holder" || k === "fgkicker") { if (st.carrier >= 0) pursue(st, P, st.p[st.carrier], P.spd * 0.85); else { P.wx = 0; P.wy = 0; } return; }
  if (k === "prush") { if (st.pt < 45) want(P, st.p[st.kicker[st.poss]].x, st.p[st.kicker[st.poss]].y, P.spd * 0.7); else P.role = { k: "kblock" }; return; }
  if (k === "jam") { const g = st.p[P.role.on]; want(P, g.x + d * 0.8, g.y, P.spd); if (st.pt > 60) P.role = { k: "kblock" }; return; }
  if (k === "fgrush") { want(P, st.los - d * 6, st.ballY, P.spd * 0.8); return; }
}
// Every man the CPU moves (and the human's man when the stick is idle).
function think(st, P) {
  const k = P.role.k, C = st.carrier >= 0 ? st.p[st.carrier] : null;
  if (P.down > 0) { P.wx = 0; P.wy = 0; return; }
  if (st.ball.st === "loose" && P.eng < 0 && len(st.ball.x - P.x, st.ball.y - P.y) < 18) { want(P, st.ball.x, st.ball.y, P.spd); return; }
  if (st.ball.st === "held" && st.ball.own === P.g && (k === "runner" || k === "ret" || k === "carrier")) { runnerThink(st, P); return; }
  if (k === "qb") { qbThink(st, P); return; }
  if (k === "carry") {   // the back to the mesh (or wide on the stretch)
    const pl = PLAYS[st.play.id], d = dirOf(P.t), side = st.play.side;
    if (pl.run === "stretch") want(P, st.los - d * 3.5, st.ballY + side * 7, P.spd);
    else if (pl.run === "draw" && st.pt < 24) want(P, P.fx, P.fy, 2);
    else { const Q = P_(st, P.t, OS.QB); want(P, Q.x - d * 0.2, Q.y + side * 0.2, st.pt < P.role.mesh - 6 ? 5.5 : 4); }
    return;
  }
  if (k === "route") {
    if (C && C.t === P.t && C !== P) { P.role = { k: "rblock" }; return; }
    if (C && C.t !== P.t) { pursue(st, P, C); return; }
    if (st.cur.thrown && st.ball.st === "air" && !st.ball.away) { want(P, P.x + P.vx * 0.1, P.y + P.vy * 0.1, P.spd * 0.6); }
    const [tx, ty, settled] = routeTarget(st, P);
    if (P.jam > 0 && st.pt < 30) { want(P, P.x + dirOf(P.t) * 1, P.y, 2); return; }
    if (settled) { const Q = P_(st, P.t, OS.QB); want(P, tx + (Q.x - tx) * 0.02, ty, len(tx - P.x, ty - P.y) > 0.6 ? P.spd * 0.9 : 1); }
    else {
      const r = R[P.role.r], nxt = r.pts[P.role.wp + 1], dist = len(tx - P.x, ty - P.y);
      want(P, tx, ty, P.spd * (nxt && dist < 1.6 ? 0.7 : 0.97));
    }
    return;
  }
  if (k === "catch") {   // the ball is his: get under it
    const b = st.ball;
    if (b.st === "air") want(P, b.tx, b.ty, P.spd);
    else if (C && C.t !== P.t) pursue(st, P, C);
    return;
  }
  if (k === "pblock" || k === "rblock" || k === "lead" || k === "kblock") {
    if (k === "pblock" && C && C.t === P.t && st.cur.handed && P.eng < 0) { P.role = { k: "rblock" }; }
    if (k === "kblock" && (st.ball.st === "kick" || st.ball.st === "kloose") && st.play.kind === "ko") { const Rr = st.p[st.ret[1 - st.kick.by]]; want(P, P.role.sx ?? P.x, P.role.sy ?? P.y, 2); void Rr; return; }
    if (C && C.t !== P.t) { pursue(st, P, C); return; }
    blockThink(st, P); return;
  }
  if (k === "rush" || k === "man" || k === "zone") {
    if (C && C.t === P.t) { P.role = { k: "kblock" }; return; }
    if (C && (st.cur.runRead || C.t !== 1 - P.t) && !(P.role.k === "rush" && C.role.k === "qb")) {
      if (P.eng >= 0) return;
      if (chase(st, P, C)) return;
    }
    // play-action: the linebackers step up first
    if (st.cur.pa && st.pt < 34 && P.ds >= DS.WLB && P.ds <= DS.SS && P.role.k !== "rush" && rnd(st) < 0.5 - P.awr * 0.4) { want(P, st.los + dirOf(1 - P.t) * 2, P.y, 4); return; }
    if (k === "rush") rushThink(st, P); else coverThink(st, P);
    return;
  }
  if (k === "pursue") { if (C) pursue(st, P, C); return; }
  if (k === "idle") { P.wx *= 0.9; P.wy *= 0.9; if (C && C.t !== P.t) pursue(st, P, C); return; }
  kickAI(st, P);
}

// ---- the human ---------------------------------------------------------------------------------------
function stick(mask) {
  let x = (mask & BTN.UP ? 1 : 0) - (mask & BTN.DOWN ? 1 : 0), y = (mask & BTN.LEFT ? 1 : 0) - (mask & BTN.RIGHT ? 1 : 0);
  if (x && y) { x *= 0.7071; y *= 0.7071; }
  return [x, y];
}
function humanMove(st, P, mask) {
  const [sx, sy] = stick(mask);
  P.sprint = Boolean(mask & BTN.SPRINT);
  const sp = P.spd * (P.sprint ? (P.stam > 0.12 ? 1 : 0.9) : 0.86);
  P.wx = sx * sp; P.wy = sy * sp;
  return Boolean(sx || sy);
}
// The pre-snap: snap, audibles, a hot route, the switch, the kick meter's aim.
function humanPre(st, mask, press) {
  const O = st.poss, k = st.kick;
  if (k) {
    if (k.by !== 0) return;
    if (mask & BTN.LEFT) k.aim = clamp(k.aim + 0.03, -1, 1);
    if (mask & BTN.RIGHT) k.aim = clamp(k.aim - 0.03, -1, 1);
    if (press & BTN.A && st.pt > 12) { k.stage = 1; k.f = 0; if (st.play.kind === "ko") { st.phase = "live"; st.pt = 0; st.clockOn = false; } else snap(st); }
    return;
  }
  if (O === 0) {
    if (st.menu === "aud") {
      const to = press & BTN.A ? 5 : press & BTN.B ? 1 : press & BTN.Y ? 7 : 0;
      if (to) { st.calls[0] = { id: to, flip: st.calls[0].flip }; const keep = st.pt; setupScrimmage(st); st.pt = keep; say(st, "audible", -1, { team: 0, id: to }); }
      if (press & BTN.X) st.menu = null;
      return;
    }
    if (st.menu === "hot") {
      for (const [, slot, bit] of ICONS) if (press & bit) { const P = P_(st, 0, slot); if (P.role.k === "route" || P.role.k === "pblock") { P.role = { k: "route", r: P.os === OS.RB ? "wheel" : "go", wp: 0 }; say(st, "hot", P.g); } st.menu = null; return; }
      return;
    }
    if (st.play.kind === "pass" || st.play.kind === "run") {
      if (press & BTN.X) { st.menu = "aud"; return; }
      if (press & BTN.Y && st.play.kind === "pass") { st.menu = "hot"; return; }
    }
    if (press & BTN.A && st.pt > 20) { st.held = {}; st.ignoreA = true; snap(st); }
    return;
  }
  // defence: move your man, switch with B; over the line is offside
  const P = st.p[st.ctl];
  if (press & BTN.B) {
    const order = [DS.MLB, DS.WLB, DS.SLB, DS.SS, DS.FS, DS.CB1, DS.CB2, DS.LE, DS.RE, DS.DT1, DS.DT2];
    const i = order.indexOf(P.ds); st.ctlSlot = order[(i + 1) % order.length]; st.ctl = D_(st, 0, st.ctlSlot).g;
    return;
  }
  if (humanMove(st, P, mask)) {
    P.wx *= 0.5; P.wy *= 0.5;
    const d = dirOf(O);
    if (d * (P.x - st.los) < 0.15) { flag(st, { k: "offside", team: 0, g: P.g, yards: 5, pre: true }); whistle(st, { k: "nop" }); }
  } else { P.wx = 0; P.wy = 0; }
}
function humanLive(st, mask, press, rel) {
  const P = st.p[st.ctl];
  if (!P) return;
  const b = st.ball, d = dirOf(P.t);
  // the kick meter
  const k = st.kick;
  if (k && k.by === 0 && !k.done && k.stage >= 1 && k.stage < 3) {
    if (press & BTN.A) {
      if (k.stage === 1) { k.pow = meterPow(k.f); k.stage = 2; k.f = 0; }
      else if (k.stage === 2) { const a = k.pow - k.f / 40; k.e = clamp(a / (st.cfg.assist ? 0.22 : 0.14), -2.5, 2.5); k.stage = 3; }
    }
    return;
  }
  const mine = P.t === 0, carrier = b.st === "held" && b.own === P.g;
  // a run's handoff is scripted: the stick waits for the back
  if (P.role.k === "qb" && (st.play.kind === "run" || st.play.kind === "kneel") && !st.cur.handed) { P.wx = 0; P.wy = 0; qbThink(st, P); return; }
  const moved = humanMove(st, P, mask);
  st.held.moved = moved;
  const attack = b.st === "held" ? st.p[b.own].t : st.kick ? 1 - st.kick.by : st.cur.turnover ? 1 - st.poss : st.poss;
  if (attack === 0 && !carrier && P.role.k !== "ret" && P.role.k !== "catch") {
    // the offence without the ball (the snap in the air, the receiver after another's catch): just run
    if (!moved) think(st, P);
    return;
  }
  if (carrier && P.role.k === "qb" && !st.cur.thrown) {
    // receivers: tap for a bullet, hold for a lob; the throw goes on the release
    for (const [, slot, bit] of ICONS) {
      if (press & bit) { if (st.ignoreA && bit === BTN.A) continue; st.held[bit] = st.frame; }
      if (rel & bit && st.held[bit] != null) {
        const Rr = P_(st, 0, slot), hold = st.frame - st.held[bit]; st.held[bit] = null;
        if (Rr.role.k === "route") { throwTo(st, P, Rr, hold >= LOB_HOLD); return; }
      }
    }
    if (rel & BTN.A) st.ignoreA = false;
    if (!moved) { P.role.k = "qb"; qbThink(st, P); }
    return;
  }
  if (carrier) {
    // the moves
    const lat = mask & BTN.LEFT ? 1 : mask & BTN.RIGHT ? -1 : 0;
    if (press & BTN.RSL) startMove(st, P, "juke", 1);
    else if (press & BTN.RSR) startMove(st, P, "juke", -1);
    else if (press & BTN.X) startMove(st, P, "juke", lat || (P.act?.lat ? -P.act.lat : 1));
    else if (press & BTN.B) startMove(st, P, "spin");
    else if (press & (BTN.RSU | BTN.A)) startMove(st, P, "truck");
    else if (press & BTN.Y) startMove(st, P, "stiff");
    if (!moved) { if (st.cfg.assist) runnerThink(st, P); else { P.wx *= 0.85; P.wy *= 0.85; } }
    // a returner in his own end zone who stays there kneels
    if (P.role.k === "ret" && st.play.kind === "ko" && dirOf(P.t) * (P.x - ownGoalX(P.t)) < 0) { st.kneelT = (st.kneelT || 0) + 1; if (st.kneelT > 50 && !moved) whistle(st, { k: "touchback", team: P.t }); } else st.kneelT = 0;
    return;
  }
  // a returner before the catch: the ball comes to him; Y calls a fair catch
  if (P.role.k === "ret") { if (press & BTN.Y && st.play.kind === "punt") st.fair = true; if (!moved) kickAI(st, P); return; }
  if (P.role.k === "catch" && b.st === "air") { if (!moved) want(P, b.tx, b.ty, P.spd); return; }
  // defence (or the offence after a turnover)
  const switchable = !(b.st === "held" && st.p[b.own].t === 0);
  if (press & BTN.B && switchable) {
    const C = b.st === "held" ? st.p[b.own] : null, bx = C ? C.x : b.st === "air" ? b.tx : b.x, by = C ? C.y : b.st === "air" ? b.ty : b.y;
    const N = nearest(st, bx, by, 0, Q => Q !== P && Q.g !== st.kicker[0] && Q.role.k !== "holder");
    if (N) { st.ctl = N.g; return; }
  }
  // engaged with a blocker: A or X is a pass-rush move (a swim, a rip), progress toward getting free
  if (P.eng >= 0 && press & (BTN.A | BTN.X)) { P.shed += 0.1 + 0.12 * P.k; return; }
  if (press & BTN.Y) { P.act = { kind: "swat", f: 0, dur: 18 }; if (P.z === 0) P.vz = 3.2; if (b.st === "air") b.swat = st.frame; }
  if (press & BTN.X) { P.act = { kind: "dive", f: 0, dur: 30 }; const C = holder(st); if (C) { const vx = C.x - P.x, vy = C.y - P.y, m = len(vx, vy) || 1; P.vx = (vx / m) * (P.spd + 2); P.vy = (vy / m) * (P.spd + 2); } }
  if (press & BTN.RSU) P.act = { kind: "hit", f: 0, dur: 16 };
  if (press & BTN.A) P.act = { kind: "wrap", f: 0, dur: 14 };
  if (!moved && !P.act) { if (mine && P.role.k !== "idle") think(st, P); }
  void d;
}
const meterPow = (f) => (f <= 48 ? f / 48 : Math.max(0, 2 - f / 48));

// ---- contact: blocks, tackles -----------------------------------------------------------------------
function engage(st) {
  const C = st.carrier >= 0 ? st.p[st.carrier] : null;
  for (const B of st.p) {
    const k = B.role.k;
    if (!(k === "pblock" || k === "rblock" || k === "lead" || k === "kblock") || B.down > 0 || B === C) continue;
    if (B.eng >= 0) {
      const D = st.p[B.eng];
      if (D.down > 0 || D.eng < 0 && D.engBy !== B.g) { B.eng = -1; continue; }
      continue;
    }
    if (B.cool > 0) continue;
    for (const D of st.p) {
      if (D.t === B.t || D.down > 0 || D === C || D.z > 0.3) continue;
      if (len(D.x - B.x, D.y - B.y) > 1.05) continue;
      if (st.p.filter(Q => Q.eng === D.g).length >= 2) continue;
      if (D.role.k === "ret" || D.role.k === "holder" || D.role.k === "punter" || D.role.k === "fgkicker" || D.role.k === "kicker" && st.carrier < 0) continue;
      B.eng = D.g; D.eng = B.g; D.engBy = B.g; if (!D.shed || D.shed < 0) D.shed = 0;
      break;
    }
  }
  for (const D of st.p) {
    if (D.eng < 0) continue;
    const bs = st.p.filter(B => B.eng === D.g);
    if (!bs.length) { D.eng = -1; continue; }
    const O = bs[0].t, d = dirOf(O), pass = bs[0].role.k === "pblock";
    const Dp = (D.k + D.str) / 2, Bp = bs.reduce((n, B) => n + (B.k + B.str) / 2, 0) / bs.length;
    let rate = (0.5 + 0.9 * Dp - 0.8 * Bp + 0.3 * gauss(st)) * (pass ? 1.25 : 0.6) * (bs.length > 1 ? 0.45 : 1);
    if (st.play.kind === "punt" || st.play.kind === "fg" || st.play.kind === "pat") rate *= 0.4;
    D.shed += Math.max(0, rate) * DT;
    // the defender is held up: barely moving, pushed back on a run
    D.wx *= 0.16; D.wy *= 0.16;
    if (!pass) { const push = 2.2 * (Bp - Dp + 0.45); D.wx += d * clamp(push, -0.6, 2); }
    for (const B of bs) {
      const tx = D.x - (pass ? (D.x - P_(st, O, OS.QB).x) : d) * 0, ty = D.y;
      const vx = pass ? P_(st, O, OS.QB).x - D.x : -d, vy = pass ? P_(st, O, OS.QB).y - D.y : 0, m = len(vx, vy) || 1;
      const gx = D.x + (vx / m) * 0.85, gy = D.y + (vy / m) * 0.85 + (bs.length > 1 ? (B === bs[0] ? -0.4 : 0.4) : 0);
      B.wx = (gx - B.x) * 9; B.wy = (gy - B.y) * 9; void tx; void ty;
    }
    // a tackler who sees the carrier come by may come off the block
    const near = C && C.t !== D.t && len(C.x - D.x, C.y - D.y) < 1.3;
    if (D.shed >= 1 || near && rnd(st) < 0.08 + 0.1 * D.k) {
      for (const B of bs) { B.eng = -1; B.cool = 35; }
      D.eng = -1; D.shed = 0; D.slow = 0;
      if (!near) st.ev.push("shed");
    } else if (D.shed > 0.72 && !D.holdRolled) {
      D.holdRolled = true;
      if (!st.flags.some(f => f.k === "hold") && st.play.kind !== "ko" && st.play.kind !== "punt" && rnd(st) < 0.006) flag(st, { k: "hold", team: bs[0].t, g: bs[0].g, yards: 10 });
    }
  }
}
function tackles(st) {
  const C = holder(st);
  if (!C || C.down > 0 || st.phase !== "live") return;
  const d = dirOf(C.t), hc = human(st, C);
  if (C.act) { C.act.f++; if (C.act.f >= C.act.dur) C.act = null; }
  if (C.moveCool > 0) C.moveCool--;
  // the moves move him
  if (C.act?.kind === "juke" && C.act.f < 10) { C.wx = d * C.spd * 0.35; C.wy = C.act.lat * C.spd * 0.95; }
  if (C.act?.kind === "spin") { C.wx *= 0.8; C.wy *= 0.8; }
  for (const D of st.p) {
    if (D.t === C.t || D.down > 0 || D.tkCool > 0) continue;
    const hd0 = human(st, D), dist = len(D.x - C.x, D.y - C.y);
    // the CPU dives at a man it cannot catch
    if (!hd0 && !D.act && dist < 2.1 && dist > 1.2 && D.eng < 0 && rnd(st) < 0.06) { D.act = { kind: "dive", f: 0, dur: 30 }; const vx = C.x + C.vx * 0.15 - D.x, vy = C.y + C.vy * 0.15 - D.y, mm = len(vx, vy) || 1; D.vx = (vx / mm) * (D.spd + 1.5); D.vy = (vy / mm) * (D.spd + 1.5); }
    const act = D.act?.kind, reach = act === "dive" ? 2.1 : act === "hit" ? 1.4 : hd0 ? 1.05 : 1.2;
    if (dist > reach) continue;
    if (D.eng >= 0 && (dist > 0.95 || rnd(st) > 0.3)) continue;
    const hd = human(st, D), engM = D.eng >= 0 ? 0.55 : 1;
    let p = 0.68 + 0.2 * D.tak - 0.24 * ((C.agi + C.k) / 2);
    const front = d * (D.x - C.x) > 0.2, cv = len(C.vx, C.vy);
    if (!front && cv > 3) p += 0.06;
    const m = C.act?.kind, f = C.act?.f ?? 99;
    let trucked = false, failTruck = false;
    if (m === "juke" && f >= 2 && f <= 14) p *= front ? 0.62 - 0.22 * C.agi : 0.85;
    else if (m === "spin" && f >= 4 && f <= 18) p *= 0.68 - 0.2 * C.agi;
    else if (m === "truck" && f <= 22 && front) { if ((C.str + C.k) - (D.str + D.k) + 0.25 + gauss(st) * 0.2 > 0) { p *= 0.4; trucked = true; } else { p *= 1.15; failTruck = true; } }
    else if (m === "stiff" && f <= 26) p *= 0.72;
    const gang = st.p.filter(Q => Q.t === D.t && Q !== D && Q.down === 0 && len(Q.x - C.x, Q.y - C.y) < 1.8).length;
    p += 0.12 * gang;
    if (hd) p += act === "wrap" ? 0.1 : act === "dive" ? -0.08 : act === "hit" ? -0.05 : -0.08;
    if (st.cfg.assist) { if (hd || D.t === 0) p += 0.06; if (hc) p -= 0.08; }
    if (C.role.k === "qb" || st.cur.sackable) p += 0.12;   // a passer in the pocket is not elusive
    p = clamp(p * engM, 0.05, 0.97);
    D.tkCool = 36;
    if (rnd(st) < p) {
      // down: falling forward a little, a fumble now and then (the hit stick shakes it loose)
      let fum = 0.006 + 0.01 * (1 - C.k) + (act === "hit" ? 0.06 + 0.06 * D.str : 0) + (failTruck ? 0.02 : 0);
      if (st.cur.sackable && !st.cur.thrown) fum += 0.03;
      const fx = C.x + clamp(C.vx * 0.12, -0.8, 0.8), fy = C.y + clamp(C.vy * 0.05, -0.4, 0.4);
      st.ps[D.g].tk++;
      if (act === "hit") say(st, "bighit", D.g);
      if (rnd(st) < fum) { fumble(st, C, D); return; }
      C.down = 50; D.down = 30;
      whistle(st, { k: "down", x: fx, y: fy, g: C.g, by: D.g });
      return;
    }
    // missed: he stumbles; the carrier loses a step
    D.slow = 22; if (act === "dive") D.down = 40;
    C.vx *= trucked ? 0.75 : 0.82; C.vy *= 0.82;
    if (trucked) { D.down = 35; say(st, "truck", C.g, { by: D.g }); }
    else if (m === "juke" || m === "spin") say(st, m === "juke" ? "juked" : "spun", C.g, { by: D.g });
    else st.ev.push("broke");
  }
}
function fumble(st, C, D) {
  const b = st.ball;
  Object.assign(b, { st: "loose", own: -1, from: C.g, x: C.x, y: C.y, z: 1, vx: C.vx * 0.5 + (rnd(st) - 0.5) * 6, vy: C.vy * 0.5 + (rnd(st) - 0.5) * 6, vz: 3, f: 0, lastTeam: C.t });
  C.down = 40; st.carrier = -1;
  say(st, "fumble", C.g, { by: D ? D.g : -1 });
}

// ---- the ball ---------------------------------------------------------------------------------------
function ballStep(st) {
  const b = st.ball;
  b.f++;
  if (b.st === "held") { const H = st.p[b.own]; b.x = H.x; b.y = H.y; b.z = 1.1 + H.z; return; }
  if (b.st === "snap") {
    const T = st.p[b.to], k = Math.min(1, b.f / b.T);
    b.x += (T.x - b.x) * k; b.y += (T.y - b.y) * k; b.z = 0.4 + 0.6 * k;
    if (b.f >= b.T) {
      if (st.play.kind === "punt" || st.play.kind === "fg" || st.play.kind === "pat") { b.st = "held"; b.own = T.g; return; }
      b.st = "held"; b.own = T.g;
      if (rnd(st) < 0.002) { fumble(st, T, null); return; }   // a bad exchange
    }
    return;
  }
  if (b.st === "pitch") {
    // the toss: an arc to the back's hands, a fumble only when he is nowhere near it
    const RB = st.p[b.to], k = Math.min(1, b.f / b.T);
    b.x += (RB.x - b.x) * k; b.y += (RB.y - b.y) * k; b.z = 1.1 + 1.2 * k * (1 - k) * 4 * 0.25;
    if (b.f >= b.T) {
      if (len(RB.x - b.x, RB.y - b.y) > 2.5 || rnd(st) < 0.004) { b.lastTeam = RB.t; fumble(st, RB, null); return; }
      b.st = "held"; b.own = RB.g; st.carrier = RB.g; RB.role.k = "runner"; st.cur.runRead = true; if (!st.cfg.auto && RB.t === 0) st.ctl = RB.g;
    }
    return;
  }
  if (b.st === "air") { airStep(st); return; }
  if (b.st === "kick") { kickFlight(st); return; }
  if (b.st === "loose" || b.st === "kloose") { looseStep(st); return; }
  if (b.st === "inc" && st.phase === "live") {
    b.vz -= G * DT; b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT;
    if (b.z <= 0) { b.z = 0; b.vx *= 0.3; b.vy *= 0.3; b.vz = 0; whistle(st, { k: "inc" }); }
    return;
  }
  if (b.st === "dead" || b.st === "inc") {
    if (b.z > 0) { b.vz -= G * DT; b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT; if (b.z <= 0) { b.z = 0; b.vx *= 0.3; b.vy *= 0.3; b.vz = 0; } }
  }
}
function airStep(st) {
  const b = st.ball;
  b.vz -= G * DT; b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT;
  if (!b.away && b.f === b.T) { resolveCatch(st); return; }
  if (b.z <= 0 || b.away && (b.y < -1 || b.y > W + 1)) { b.z = Math.max(0, b.z); b.st = "inc"; b.vx *= 0.3; b.vy *= 0.3; b.vz = 0; whistle(st, { k: "inc" }); b.st = "inc"; }
}
function resolveCatch(st) {
  const b = st.ball, Rr = st.p[b.to], O = Rr.t, Q = st.p[b.from], hR = !st.cfg.auto && O === 0;
  const dr = len(Rr.x - b.x, Rr.y - b.y);
  let D = null, dd = 1e9;
  for (const P of st.p) { if (P.t === O || P.down > 0) continue; const k = len(P.x - b.x, P.y - b.y); if (k < dd) { dd = k; D = P; } }
  const cr = 0.95 + 0.35 * Rr.hands + (st.cfg.assist && hR ? 0.5 : 0) + (Rr.down > 0 ? -0.6 : 0);
  const swatHum = D && human(st, D) && st.frame - b.swat < 16;
  const dcr = 0.85 + 0.35 * D.cov + (swatHum ? 0.45 : 0) + (st.cfg.assist && D.t === 0 ? 0.2 : 0);
  // pass interference: a defender all over him on the way, not playing the ball
  if (D && dd < 1.4 && len(D.x - Rr.x, D.y - Rr.y) < 0.75) {
    const early = D && human(st, D) && b.swat > 0 && st.frame - b.swat > 22;
    const pPI = early ? 0.35 : 0.035 + (D.slow > 0 ? 0.03 : 0);
    if (rnd(st) < pPI) flag(st, { k: "pi", team: D.t, g: D.g, spotX: b.x, spotY: b.y, yards: 0 });
  }
  const u = rnd(st);
  const contested = D && dd <= dcr;
  if (!contested) {
    if (dr <= cr && Rr.down === 0) {
      const p = clamp(0.9 + 0.08 * Rr.hands - 0.14 * (dr / cr) * (dr / cr) - (b.lob ? 0.02 : 0), 0.5, 0.995);
      if (u < p) return caught(st, Rr, Q);
      say(st, "drop", Rr.g);
    }
    b.st = "inc"; return;
  }
  const pos = dd - dr;
  const pInt = dr <= cr + 0.6 ? clamp(0.05 + 0.16 * D.cov - 0.1 * Rr.hands - 0.15 * pos + (b.lob ? 0.04 : 0) + (swatHum ? 0.12 : 0), 0.02, 0.4) : clamp(0.1 + 0.14 * D.cov + (swatHum ? 0.15 : 0), 0.08, 0.4);
  const pBreak = clamp(0.26 + 0.2 * D.cov - 0.22 * pos + (swatHum ? 0.15 : 0), 0.08, 0.65);
  if (u < pInt) return intercepted(st, D, Q);
  if (u < pInt + pBreak || dr > cr) { b.vx = -b.vx * 0.3 + (rnd(st) - 0.5) * 3; b.vy = (rnd(st) - 0.5) * 4; b.vz = 2.5; b.st = "inc"; say(st, "pbu", D.g); return; }
  if (rnd(st) < 0.55 + 0.4 * Rr.hands) return caught(st, Rr, Q, true);
  b.st = "inc"; say(st, "drop", Rr.g);
}
function caught(st, Rr, Q, contested = false) {
  const b = st.ball;
  if (Rr.y < 0 || Rr.y > W || Rr.x < -10 || Rr.x > 110) { b.st = "inc"; say(st, "oobcatch", Rr.g); return; }
  Object.assign(b, { st: "held", own: Rr.g });
  st.carrier = Rr.g; Rr.role = { k: "runner" }; st.cur.caught = true; st.cur.runRead = true;
  st.stat[Rr.t].pc++; st.ps[Q.g].pc++; st.ps[Rr.g].rec++;
  if (!st.cfg.auto && Rr.t === 0) st.ctl = Rr.g;
  say(st, contested ? "contested" : "catch", Rr.g, { qb: Q.g });
}
function intercepted(st, D, Q) {
  const b = st.ball;
  Object.assign(b, { st: "held", own: D.g });
  st.carrier = D.g; D.role = { k: "runner" }; st.cur.turnover = true; st.cur.runRead = true;
  st.cur.gainedEz = dirOf(D.t) * (D.x - ownGoalX(D.t)) < 0;
  st.stat[Q.t].ints++; st.ps[Q.g].int++; st.ps[D.g].pick++;
  for (const P of st.p) { if (P === D) continue; P.eng = -1; P.role = P.t === D.t ? { k: "kblock" } : { k: "pursue" }; }
  if (!st.cfg.auto) st.ctl = D.t === 0 ? D.g : (nearest(st, D.x, D.y, 0) || st.p[st.ctl]).g;
  say(st, "int", D.g, { qb: Q.g });
}
function looseStep(st) {
  const b = st.ball;
  b.vz -= G * DT; b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT;
  if (b.z <= 0) { b.z = 0; b.vz = Math.abs(b.vz) > 1.5 ? -b.vz * 0.4 : 0; b.vx *= 0.88; b.vy *= 0.88; }
  if (b.y < 0 || b.y > W) { whistle(st, { k: "down", x: b.x, y: b.y, team: b.lastTeam ?? st.poss, oob: true, loose: true }); return; }
  if (b.st === "kloose") {
    // a kick on the ground: the returner picks it up; the kicking side downs a punt once it settles
    const Rr = st.p[st.ret[1 - st.kick.by]];
    if (len(Rr.x - b.x, Rr.y - b.y) < 1.0 && b.z < 0.6 && st.play.kind === "ko") { b.st = "held"; b.own = Rr.g; st.carrier = Rr.g; Rr.role = { k: "runner" }; st.clockOn = true; if (!st.cfg.auto && Rr.t === 0) st.ctl = Rr.g; return; }
    const kicker = nearest(st, b.x, b.y, st.kick.by);
    if (st.play.kind === "punt" && (len(b.vx, b.vy) < 0.6 || kicker && len(kicker.x - b.x, kicker.y - b.y) < 1)) { whistle(st, { k: "down", x: b.x, y: b.y, team: 1 - st.kick.by, downed: true }); return; }
    if (dirOf(st.kick.by) * (b.x - goalX(st.kick.by)) > 0) { whistle(st, { k: "touchback", team: 1 - st.kick.by }); return; }
    return;
  }
  if (b.f > 300) { const N = nearest(st, b.x, b.y, b.lastTeam === 0 ? 1 : 0) || nearest(st, b.x, b.y, b.lastTeam); whistle(st, { k: "down", x: b.x, y: b.y, team: N.t, g: N.g, recovered: true }); if (N.t !== b.lastTeam) st.stat[b.lastTeam].fum++; return; }
  if (b.z < 0.7 && b.f > 8) {
    for (const P of st.p) {
      if (P.down > 0 || len(P.x - b.x, P.y - b.y) > 1.1) continue;
      if (rnd(st) < 0.18 * (0.5 + P.k)) {
        const lost = P.t !== b.lastTeam;
        if (lost) st.stat[b.lastTeam].fum++;
        say(st, lost ? "recover" : "recoverown", P.g);
        whistle(st, { k: "down", x: b.x, y: b.y, team: P.t, g: P.g, recovered: true, gainedEz: dirOf(P.t) * (b.x - ownGoalX(P.t)) < 0 });
        return;
      }
    }
  }
}
// The kick launches when the meter is done and the ball is in place.
function launchKick(st) {
  const k = st.kick, b = st.ball, O = k.by, d = dirOf(O), K = st.p[st.kicker[O]];
  k.done = true; b.touched = false;
  if (k.kind === "fg" || k.kind === "pat") {
    const Rmax = kickRmax(K), u = Math.sqrt(Math.max(0.05, k.pow) * Rmax * G / 1.5), Dx = Math.abs(goalX(O) + d * 10 - b.x);
    const slope = (CY - b.y) / Dx + k.e * 0.11 + k.aim * 0.02;
    Object.assign(b, { st: "kick", kind: k.kind, own: -1, z: 0.3, vx: d * u, vy: u * slope, vz: 0.75 * u, f: 0 });
    st.stat[O].fga += k.kind === "fg" ? 1 : 0; st.ps[K.g].fga += k.kind === "fg" ? 1 : 0;
    say(st, "kick", K.g, { kind: k.kind });
    return;
  }
  const kpw = K.kpw, pow = Math.max(0.1, k.pow);
  const dist = k.kind === "punt" ? pow * (36 + 16 * kpw) : pow * (54 + 16 * kpw), T = k.kind === "punt" ? 3.3 + 1.1 * pow : 3.4 + 0.7 * pow;
  const lat = (k.aim * 0.16 + k.e * 0.07) * dist;
  Object.assign(b, { st: "kick", kind: k.kind, own: -1, z: k.kind === "punt" ? 1.0 : 0.2, vx: (d * dist) / T, vy: lat / T, vz: (G * T) / 2, f: 0 });
  b.lx = b.x + b.vx * T; b.ly = clamp(b.y + b.vy * T, -2, W + 2); b.T = Math.round(T * HZ);
  if (k.kind === "punt") st.stat[O].punts++;
  say(st, k.kind === "punt" ? "punt" : "kickoff", K.g);
}
function kickFlight(st) {
  const b = st.ball, k = st.kick, O = k.by, d = dirOf(O);
  const px = b.x;
  b.vz -= G * DT; b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT;
  if (b.kind === "fg" || b.kind === "pat") {
    const plane = goalX(O) + d * 10;
    if (d * (b.x - plane) >= 0 && d * (px - plane) < 0) {
      const good = b.z >= FIELD.bar && Math.abs(b.y - CY) <= FIELD.post;
      whistle(st, { k: b.kind, good, x: st.los }); return;
    }
    if (b.z <= 0) whistle(st, { k: b.kind, good: false, x: st.los, short: true });
    return;
  }
  // punts and kickoffs: the returner meets it
  const Rr = st.p[st.ret[1 - O]];
  if (b.vz < 0 && b.z < 2.5 && len(Rr.x - b.x, Rr.y - b.y) < 1.4 && Rr.down === 0) {
    if (b.kind === "punt" && rnd(st) < 0.012) { b.st = "kloose"; b.vx *= -0.2; b.vz = 2; b.lastTeam = Rr.t; say(st, "muff", Rr.g); st.kick.muff = true; return; }
    const fairNow = b.kind === "punt" && (st.fair || (!human(st, Rr) && (() => { const N = nearest(st, b.x, b.y, O); return N && len(N.x - b.x, N.y - b.y) < 5; })()));
    if (fairNow) { whistle(st, { k: "down", x: b.x, y: Rr.y, team: Rr.t, fair: true }); return; }
    b.st = "held"; b.own = Rr.g; st.carrier = Rr.g; Rr.role = { k: "ret", caught: true }; st.clockOn = true;
    st.cur.gainedEz = dirOf(Rr.t) * (Rr.x - ownGoalX(Rr.t)) < 0;
    if (!st.cfg.auto && Rr.t === 0) st.ctl = Rr.g;
    for (const P of st.p) if (P.t === O) P.role = { k: "pursue" }; else if (P !== Rr) P.role = { k: "kblock" };
    say(st, "fielded", Rr.g);
    // deep in the end zone the CPU takes a knee
    if (b.kind === "ko" && !human(st, Rr) && dirOf(Rr.t) * (Rr.x - ownGoalX(Rr.t)) < -1.5) whistle(st, { k: "touchback", team: Rr.t, kneel: true });
    return;
  }
  if (b.z <= 0) {
    if (b.y < 0 || b.y > W) { whistle(st, { k: b.kind === "ko" ? "kooob" : "down", x: b.x, y: b.y, team: 1 - O, oob: true }); return; }
    if (d * (b.x - goalX(O)) >= 0) { whistle(st, { k: "touchback", team: 1 - O }); return; }
    b.z = 0; b.st = "kloose"; b.vz = 2.2; b.vx *= 0.45; b.vy *= 0.45; b.lastTeam = O;
  }
}

// ---- the whistle and the rules ---------------------------------------------------------------------
// res: {k: down | inc | td | safety | touchback | fg | pat | kooob | nop, x, y, team (holding at the
// whistle), g (the carrier), oob, ...}. A carrier past the goal line scores; down in his own end
// zone is a safety (a touchback when he took the ball there).
function whistle(st, res) {
  if (st.phase !== "live" && st.phase !== "pre") return;
  const b = st.ball;
  if (res.k === "down") {
    const P = res.g >= 0 && res.g != null ? st.p[res.g] : null, T = res.team ?? (P ? P.t : st.poss), d = dirOf(T);
    res.team = T;
    if (!res.fair && !res.downed && P && d * (P.x - goalX(T)) >= 0 && P.y >= 0 && P.y <= W) res.k = "td";
    else if (d * (res.x - ownGoalX(T)) <= 0 && !res.fair) res.k = (res.gainedEz || st.cur?.gainedEz || res.downed) ? "touchback" : "safety";
  }
  if (res.k === "inc") res.team = st.poss;
  st.res = res; st.phase = "dead"; st.pt = 0; st.clockOn = false;
  if (b.st === "held" || b.st === "loose" || b.st === "kloose" || b.st === "kick" || b.st === "air" || b.st === "pitch" || b.st === "snap") { b.st = "dead"; }
  st.carrier = -1;
  for (const P of st.p) { P.act = null; }
  tally(st, res);
  const k = res.k === "down" && res.oob ? "oob" : res.k;
  const yds = res.x != null && st.play && st.play.kind !== "ko" && st.play.kind !== "punt" ? Math.round(dirOf(st.poss) * (res.x - st.los)) : null;
  if (k !== "nop") say(st, `w_${k}`, res.g ?? -1, { team: res.team, good: res.good, yds, turnover: st.cur?.turnover, sack: st.cur?.sackable && !st.cur?.thrown });
}
// The stats of the play, at the whistle.
function tally(st, res) {
  const O = st.poss, d = dirOf(O), cur = st.cur, kind = st.play?.kind;
  if (!cur || !(kind === "run" || kind === "pass" || kind === "sneak" || kind === "kneel")) return;
  if (res.k === "nop") return;
  const S = st.stat[O];
  S.plays++;
  if (st.down === 3) S.third++;
  const spot = res.k === "td" ? goalX(res.team) : res.k === "safety" ? ownGoalX(res.team) : res.x ?? st.los;
  if (cur.turnover || (res.team != null && res.team !== O)) return;
  const gain = res.k === "inc" ? 0 : Math.round(d * (spot - st.los));
  S.yds += gain;
  if (gain >= 20) S.big++;
  if (cur.thrown && cur.caught) { S.py += gain; st.ps[cur.passer].py += gain; st.ps[cur.target].recy += gain; if (res.k === "td") { st.ps[cur.passer].ptd++; st.ps[cur.target].rectd++; } }
  else if (cur.sackable && !cur.thrown) { S.sacks++; S.sackYds -= gain; const by = res.by; if (by != null) st.ps[by].sk++; say(st, "sack", by ?? -1, { team: 1 - O }); }
  else if (!cur.thrown && res.g != null && res.g >= 0) { S.ra++; S.ry += gain; st.ps[res.g].ra++; st.ps[res.g].ry += gain; if (res.k === "td") st.ps[res.g].rtd++; }
}
// The penalty, enforced: -> {los, down, togo, fd, first} without touching st.
function enforce(st, f) {
  const O = st.poss, d = dirOf(O);
  let los = st.los, down = st.down, first = false;
  if (f.team === O) {
    const room = 100 - toGoal(O, los), y = Math.min(f.yards, room / 2);
    los -= d * y;
  } else if (f.k === "pi") {
    let spot = f.spotX;
    if (d * (spot - goalX(O)) >= -1) spot = goalX(O) - d * 1;
    if (d * (spot - los) < 0) spot = los;
    los = spot; first = true;
  } else {
    const y = Math.min(f.yards, toGoal(O, los) / 2);
    los += d * y;
  }
  let fd = st.fd;
  if (first || d * (los - st.fd) >= 0) { down = 1; const tg = toGoal(O, los); fd = tg <= 10 ? goalX(O) : los + d * 10; first = true; }
  return { los, down, fd, togo: Math.max(0, d * (fd - los)), first };
}
// The value of an outcome to the offence (for accepting or declining a flag).
function worth(st, out) {
  if (out.td === 1) return 100;
  if (out.td === -1 || out.turnover) return -60;
  const O = st.poss, d = dirOf(O);
  return d * (out.los - st.los) + (out.first ? 15 : 0) - (out.down - st.down) * 4;
}
function settle(st) {
  const r = st.res, kind = st.play.kind, O = st.poss, d = dirOf(O);
  st.res = null;
  const fl = st.flags[0] || null;
  let runoff = false;
  // dead-ball fouls: no play
  if (fl && fl.pre) {
    if (kind === "ko") { setupKickoff(st, O, st.play.from); return; }
    const e = enforce(st, fl);
    applyEnforced(st, e, fl);
    return nextSnap(st, false);
  }
  if (kind === "pat" || (st.play.try && kind !== "ko")) {
    let pts = 0;
    if (kind === "pat" && r.good) { pts = 1; st.ps[st.kicker[O]].xp++; }
    if (kind !== "pat" && r.k === "td" && r.team === O) pts = 2;
    if (kind !== "pat" && r.k === "td" && r.team !== O) { st.score[r.team] += 2; say(st, "defTwo", -1, { team: r.team }); }
    if (fl && fl.k === "hold" && pts === 2) pts = 0;
    st.score[O] += pts;
    say(st, kind === "pat" ? (pts ? "patgood" : "patmiss") : pts ? "twogood" : "twofail", -1, { team: O });
    st.tryFor = -1;
    return afterScore(st, O);
  }
  if (kind === "ko" || kind === "punt") {
    const Rt = 1 - st.kick.by;
    if (r.k === "kooob") { setFirstDown(st, Rt, fromOwn(Rt, 40), CY); say(st, "kooob", -1, { team: Rt }); return nextSnap(st, false); }
    if (r.k === "touchback") { setFirstDown(st, Rt, fromOwn(Rt, kind === "ko" ? 25 : 20), CY); say(st, "touchback", -1, { team: Rt }); return nextSnap(st, false); }
    if (r.k === "td") { st.score[r.team] += 6; st.stat[r.team].td++; say(st, "td", r.g ?? -1, { team: r.team, ret: true }); return afterTD(st, r.team); }
    if (r.k === "safety") { st.score[1 - r.team] += 2; say(st, "safety", -1, { team: 1 - r.team }); return safetyKick(st, r.team); }
    setFirstDown(st, r.team, r.x, r.y);
    return nextSnap(st, false);
  }
  if (kind === "fg") {
    const K = st.kicker[O];
    if (r.good) { st.score[O] += 3; st.stat[O].fgm++; st.ps[K].fg++; say(st, "fggood", K, { team: O }); return afterScore(st, O); }
    say(st, "fgmiss", K, { team: O });
    const spot = st.los - d * 7, D = 1 - O;
    setFirstDown(st, D, toGoal(D, spot) > 80 ? fromOwn(D, 20) : spot, st.ballY);
    return nextSnap(st, false);
  }
  // a down from scrimmage: the play, or the flag
  const play = outcome(st, r);
  if (fl) {
    const e = enforce(st, fl), pen = { los: e.los, down: e.down, first: e.first, td: 0, turnover: false };
    const take = fl.team === O ? worth(st, pen) < worth(st, play) : worth(st, pen) > worth(st, play);
    if (take) { applyEnforced(st, e, fl); return nextSnap(st, false); }
    say(st, "declined", -1, { team: fl.team, fk: fl.k });
  }
  if (r.k === "td") {
    st.score[r.team] += 6; st.stat[r.team].td++;
    if (r.team === O) { /* a first down's worth */ }
    say(st, "td", r.g ?? -1, { team: r.team });
    return afterTD(st, r.team);
  }
  if (r.k === "safety") { st.score[1 - r.team] += 2; say(st, "safety", -1, { team: 1 - r.team }); return safetyKick(st, r.team); }
  if (r.k === "touchback") { setFirstDown(st, r.team, fromOwn(r.team, 20), CY); say(st, "touchback", -1, { team: r.team }); return nextSnap(st, false); }
  if (r.team !== O) { setFirstDown(st, r.team, r.x, r.y); say(st, "change", -1, { team: r.team }); return nextSnap(st, false); }
  if (st.down === 3 && play.first) st.stat[O].thirdOk++;
  if (play.first) { st.stat[O].fd++; setFirstDown(st, O, play.los, r.k === "inc" ? st.ballY : r.y); if (play.gain > 0) say(st, "first", -1, { team: O }); runoff = r.k !== "inc"; }
  else if (play.down > 4) { setFirstDown(st, 1 - O, play.los, r.k === "inc" ? st.ballY : r.y); say(st, "downs", -1, { team: 1 - O }); return nextSnap(st, false); }
  else { st.down = play.down; st.los = play.los; st.togo = Math.max(0, d * (st.fd - st.los)); if (r.k !== "inc") st.ballY = clamp(r.y, FIELD.hash[0], FIELD.hash[1]); runoff = r.k !== "inc"; }
  if (r.oob && isLate(st)) runoff = false;
  nextSnap(st, runoff);
}
// The play as it stands: -> {los, down, first, td, turnover, gain}
function outcome(st, r) {
  const O = st.poss, d = dirOf(O);
  if (r.k === "td") return { td: r.team === O ? 1 : -1, los: st.los, down: 1, first: false, turnover: false, gain: 99 };
  if (r.k === "safety") return { td: 0, turnover: true, los: st.los, down: 1, first: false, gain: -99 };
  if (r.k === "inc") return { td: 0, turnover: st.down >= 4, los: st.los, down: st.down + 1, first: false, gain: 0 };
  if (r.team !== O) return { td: 0, turnover: true, los: r.x, down: 1, first: false, gain: 0 };
  const los = clamp(r.x, 0.5, 99.5), first = d * (los - st.fd) >= 0;
  return { td: 0, turnover: !first && st.down >= 4, los, down: first ? 1 : st.down + 1, first, gain: d * (los - st.los) };
}
function applyEnforced(st, e, fl) {
  const S = st.stat[fl.team];
  S.pen++; S.penYds += Math.round(Math.abs(e.los - st.los));
  st.los = e.los; st.down = e.down; st.fd = e.fd; st.togo = e.togo;
  if (e.first) st.stat[st.poss].fd += fl.team !== st.poss ? 1 : 0;
  say(st, "penalty", fl.g ?? -1, { team: fl.team, fk: fl.k, first: e.first });
}
function afterTD(st, T) {
  if (st.ot) return gameOver(st);
  st.tryFor = T; st.tryChoice = true; st.poss = T;
  setFirstDown(st, T, goalX(T) - dirOf(T) * 2, CY);
  st.down = 1;
  st.phase = "call"; st.pt = 0; enterCall(st);
}
function afterScore(st, T) {
  if (st.ot) return gameOver(st);
  if (st.clock <= 0) { if (endPeriod(st)) return; }
  setupKickoff(st, T, 35);
}
function safetyKick(st, T) {
  if (st.ot) return gameOver(st);
  if (st.clock <= 0) { if (endPeriod(st)) return; }
  setupKickoff(st, T, 20);
}
function nextSnap(st, running) {
  st.runoff = running ? (hurry(st) ? HURRY : RUNOFF) * HZ : 0;
  // the warning: the first stop at or under the mark in the 2nd and 4th
  const mark = lateSecs(st) * HZ;
  if ((st.q === 2 || st.q === 4) && !st.warned[st.q] && st.clock <= mark && st.clock > 0) { st.warned[st.q] = true; st.runoff = 0; say(st, "warning"); }
  if (st.clock <= 0) { if (endPeriod(st)) return; }
  st.phase = "call"; st.pt = 0;
  enterCall(st);
}
// The end of a quarter: -> true when something other than the next down follows (handled here).
function endPeriod(st) {
  const q = st.q, F = st.cfg.qlen * 60 * HZ;
  st.ev.push("quarter");
  if (q === 1 || q === 3) { st.q++; st.clock = F; say(st, "quarter", -1, { q }); return false; }
  if (q === 2) { st.q = 3; st.clock = F; st.to = [3, 3]; say(st, "half"); setupKickoff(st, st.recv1, 35); return true; }
  if (q >= 4 && !st.ot && st.score[0] === st.score[1] && st.cfg.ot) {
    st.ot = true; st.q = 5; st.clock = F; st.to = [2, 2];
    const recv = rnd(st) < 0.5 ? 0 : 1;
    say(st, "overtime", -1, { team: recv });
    setupKickoff(st, 1 - recv, 35); return true;
  }
  gameOver(st); return true;
}
function gameOver(st) { st.phase = "over"; st.over = true; st.pt = 0; say(st, "final"); }
// The call: the CPU calls now; the human's call (or a timeout) comes in a frame's code.
function enterCall(st) {
  const O = st.poss, Dt = 1 - O;
  st.calls = [null, null]; st.menu = null; st.kick = null;
  for (const P of st.p) { P.act = null; P.eng = -1; P.vx *= 0.3; P.vy *= 0.3; P.wx = 0; P.wy = 0; P.down = 0; P.z = 0; }
  // timeouts the CPU takes: the defence late and behind; the offence in a hurry and short of time
  if (st.runoff > 0 && isLate(st)) {
    for (const t of [Dt, O]) {
      if (!st.cfg.auto && t === 0) continue;
      const behind = st.score[t] < st.score[1 - t] || (st.score[t] === st.score[1 - t] && t === O);
      if (st.to[t] > 0 && behind && (t === Dt ? st.q >= 4 || toGoal(O, st.los) > 60 : st.clock < 50 * HZ)) { st.to[t]--; st.runoff = 0; say(st, "timeout", -1, { team: t }); break; }
    }
  }
  const tryNow = st.tryFor >= 0;
  if (tryNow && st.tryChoice) {
    if (st.cfg.auto || O !== 0) {
      const lead = st.score[O] - st.score[Dt], late = st.q >= 4 && isLate(st);
      const two = late && [-2, -5, -10, 1, 5, -1].includes(lead) && rnd(st) < 0.85;
      chooseTry(st, two ? CODE.TWO : CODE.PAT);
      return;
    }
    st.need = 0; return;
  }
  if (st.cfg.auto || O !== 0) st.calls[O] = { id: offenceCall(st, O, rnd(st), rnd(st)), flip: rnd(st) < 0.5 };
  if (st.cfg.auto || Dt !== 0) st.calls[Dt] = { id: defenceCall(st, Dt, rnd(st)), flip: false };
  if (st.calls[O] && (PLAYS[st.calls[O].id].kind === "punt" || PLAYS[st.calls[O].id].kind === "fg") && !st.calls[Dt]) st.calls[Dt] = { id: 34, flip: false };
  st.need = st.calls[0] && st.calls[1] ? -1 : 0;
  if (st.need < 0) startDown(st);
}
function chooseTry(st, code) {
  st.tryChoice = false;
  if (code === CODE.PAT) {
    const O = st.poss;
    setFirstDown(st, O, goalX(O) - dirOf(O) * 15, CY);
    st.calls[O] = { id: 13, flip: false }; st.calls[1 - O] = { id: 34, flip: false };
    st.need = -1; startDown(st); return;
  }
  say(st, "goingfor2", -1, { team: st.poss });
  enterCall(st);
}
function startDown(st) {
  // the running clock comes off before the snap; it may end the quarter (an offence in a hurry
  // always gets the snap off)
  if (st.runoff > 0) {
    let r = st.runoff;
    if (hurry(st)) r = Math.min(r, Math.max(0, st.clock - HZ));
    const mark = lateSecs(st) * HZ;
    if ((st.q === 2 || st.q === 4) && !st.warned[st.q] && st.clock > mark && st.clock - r <= mark) { r = st.clock - mark; st.warned[st.q] = true; st.clock -= r; st.runoff = 0; say(st, "warning"); st.calls = [null, null]; st.phase = "call"; return enterCall(st); }
    st.clock = Math.max(0, st.clock - r); st.runoff = 0;
    if (st.clock <= 0 && st.tryFor < 0) { if (endPeriod(st)) return; st.phase = "call"; return enterCall(st); }
  }
  setupScrimmage(st);
}
function humanCall(st, code) {
  if (st.phase !== "call" || st.need !== 0) return;
  if (code === CODE.TIMEOUT) { if (st.to[0] > 0 && st.runoff > 0) { st.to[0]--; st.runoff = 0; say(st, "timeout", -1, { team: 0 }); } return; }
  if (st.tryChoice) { if (code === CODE.PAT || code === CODE.TWO) chooseTry(st, code); return; }
  const flip = Boolean(code & CODE.FLIP), id = code & 127;
  const O = st.poss;
  if (O === 0) {
    const pick = id === CODE.COACH ? coordinatorPick(st) : id;
    if (!PLAYS[pick] || !legalOffence(st).includes(pick)) return;
    st.calls[0] = { id: pick, flip: id === CODE.COACH ? hash01(st.seed, st.playNo, 3) < 0.5 : flip };
    if (PLAYS[pick].kind === "punt" || PLAYS[pick].kind === "fg") st.calls[1] = { id: 34, flip: false };
  } else {
    const pick = id === CODE.COACH ? coordinatorPick(st) : id;
    if (!DEFS[pick]) return;
    st.calls[0] = { id: pick, flip: false };
  }
  if (st.calls[0] && st.calls[1]) { st.need = -1; startDown(st); }
}

// ---- the step ---------------------------------------------------------------------------------------
export function step(st, mask = 0) {
  st.ev = [];
  st.frame++; st.pt++;
  const auto = st.cfg.auto, m = auto ? 0 : mask & 0xffff, code = auto ? 0 : (mask >>> CALL_SHIFT) & 255;
  const press = m & ~st.prev, rel = st.prev & ~m;
  st.mask = m; st.prev = m;
  const newCode = code && code !== st.prevCode ? code : 0;
  st.prevCode = code;
  if (st.phase === "over") return st;
  if (st.phase === "call") {
    if (st.need === 0 && newCode) humanCall(st, newCode);
    return st;
  }
  if (st.phase === "dead") {
    for (const P of st.p) { P.wx = 0; P.wy = 0; integrate(st, P); }
    ballStep(st);
    if (st.pt >= 75) settle(st);
    return st;
  }
  if (st.phase === "pre") {
    if (!auto && (st.kick ? st.kick.by === 0 : true)) humanPre(st, m, press);
    else if (!auto && st.poss !== 0 && !st.kick) humanPre(st, m, press);
    if (st.phase === "pre") {
      if (st.snapAt >= 0 && st.pt >= st.snapAt) { if (st.kick && st.play.kind === "ko") { st.phase = "live"; st.pt = 0; st.clockOn = false; } else snap(st); }
      // the play clock: the human's offence has 25 seconds to snap
      else if (!auto && st.poss === 0 && st.pt >= 25 * HZ && st.phase === "pre" && !(st.kick && st.play.kind === "ko")) { flag(st, { k: "delay", team: 0, yards: 5, pre: true }); whistle(st, { k: "nop" }); }
      for (const P of st.p) if (!human(st, P)) { P.wx = 0; P.wy = 0; }
      for (const P of st.p) integrate(st, P);
    }
    return st;
  }
  // live
  if (st.clockOn) { st.clock = Math.max(0, st.clock - 1); st.stat[st.poss].top++; }
  const k = st.kick;
  if (k && !k.done) {
    if (k.stage === 1 || k.stage === 2) { k.f++; if (k.stage === 1 && k.f >= 96) { k.pow = 0.12; k.stage = 2; k.f = 0; } else if (k.stage === 2 && k.pow - k.f / 40 < -0.35) { k.e = -2.5; k.stage = 3; } }
    const b = st.ball, ready = k.kind === "ko" ? st.pt >= 45 : b.st === "held" && st.pt >= (k.kind === "punt" ? 70 : 50);
    if (k.stage === 3 && ready) launchKick(st);
  }
  if (!auto && st.ctl >= 0) humanLive(st, m, press, rel);
  for (const P of st.p) {
    if (human(st, P)) { if (P.wx || P.wy || P.act) continue; if (P.role.k === "runner" || P.role.k === "ret" && st.carrier === P.g) continue; }
    think(st, P);
  }
  engage(st);
  for (const P of st.p) {
    if (P.tkCool > 0) P.tkCool--;
    if (P.act && P !== holder(st)) { P.act.f++; if (P.act.f >= P.act.dur) P.act = null; }
    integrate(st, P);
  }
  // keep apart
  for (let i = 0; i < 22; i++) for (let j = i + 1; j < 22; j++) {
    const A = st.p[i], B = st.p[j];
    if (A.down > 0 || B.down > 0) continue;
    if ((A.g === st.carrier && (B.eng >= 0 || B.t === A.t)) || (B.g === st.carrier && (A.eng >= 0 || A.t === B.t))) continue;
    const dx = B.x - A.x, dy = B.y - A.y, d2 = dx * dx + dy * dy, min = A.eng === B.g || B.eng === A.g ? 0.8 : 0.62;
    if (d2 >= min * min) continue;
    const dd = Math.sqrt(d2) || 0.01, push = (min - dd) / 2, nx = d2 ? dx / dd : 1, ny = d2 ? dy / dd : 0;
    A.x -= nx * push; A.y -= ny * push; B.x += nx * push; B.y += ny * push;
  }
  ballStep(st);
  if (st.phase === "live") tackles(st);
  if (st.phase === "live") {
    const C = holder(st);
    if (C) {
      const d = dirOf(C.t);
      if (C.y < 0 || C.y > W) whistle(st, { k: "down", x: C.x, y: C.y, g: C.g, oob: true });
      else if (d * (C.x - goalX(C.t)) >= 0 && C.role.k !== "qb" && !(st.cur.sackable && !st.cur.thrown)) whistle(st, { k: "down", x: C.x, y: C.y, g: C.g });
      else if (C.x < -10.5 || C.x > 110.5) whistle(st, { k: "down", x: C.x, y: C.y, g: C.g, oob: true });
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
  return { done: st.phase === "over", winner: st.phase === "over" ? (s[0] > s[1] ? 0 : s[1] > s[0] ? 1 : -1) : null, score: [...s], q: st.q, frames: st.frame, stat: st.stat.map(x => ({ ...x })), ps: st.ps.map(x => ({ ...x })) };
}
export function replay(rec) {
  if (rec.version !== VERSION) throw new Error(`football record version ${rec.version}, sim ${VERSION}`);
  const st = newGame(rec.seed, rec.cfg);
  const log = rec.inputLog;
  for (let k = 0; k < log.length; k += 2) for (let n = 0; n < log[k + 1]; n++) step(st, log[k]);
  return resultOf(st);
}
// The context of the human's buttons right now (the page's touch pad and legend): call | pre-off |
// pre-def | kick | qb | run | def | watch.
export function contextOf(st) {
  if (st.cfg.auto) return "watch";
  if (st.phase === "call") return st.need === 0 ? "call" : "watch";
  const k = st.kick;
  if (k && k.by === 0 && !k.done) return "kick";
  if (st.phase === "pre") return st.poss === 0 && !k ? "pre-off" : k ? "watch" : "pre-def";
  if (st.phase !== "live") return "watch";
  const P = st.p[st.ctl];
  if (!P) return "watch";
  const b = st.ball;
  if (b.st === "held" && b.own === P.g) return P.role.k === "qb" && !st.cur.thrown ? "qb" : "run";
  if (P.role.k === "catch" || P.role.k === "ret") return "watch";
  return "def";
}
// The eligible receivers the buttons point at, while a pass can be thrown: [[label, g]].
export function iconsOf(st) {
  if (st.cfg.auto || st.poss !== 0 || st.kick || st.cur?.thrown) return [];
  if (!(st.play?.kind === "pass")) return [];
  if (st.phase === "live") { const b = st.ball, Q = P_(st, 0, OS.QB); if (!(b.st === "held" && b.own === Q.g && Q.role.k === "qb") && b.st !== "snap") return []; }
  else if (st.phase !== "pre") return [];
  return ICONS.map(([lab, slot]) => [lab, st.off[0][slot]]).filter(([, g]) => st.p[g].role.k === "route");
}

// ---- for the checks only ---------------------------------------------------------------------------
// A down at a spot: team `poss` has the ball at x (absolute), down, to go; the call phase follows.
export function setUp(st, { poss = 0, x = 25, down = 1, togo = 10, q = null, clock = null, score = null } = {}) {
  setFirstDown(st, poss, x, CY);
  st.down = down; const d = dirOf(poss);
  if (togo != null && toGoal(poss, x) > togo) { st.togo = togo; st.fd = x + d * togo; }
  if (q != null) st.q = q;
  if (clock != null) st.clock = clock;
  if (score) st.score = [...score];
  st.tryFor = -1; st.tryChoice = false; st.runoff = 0;
  st.phase = "call"; st.pt = 0; st.calls = [null, null]; st.need = 0; st.kick = null;
  for (const P of st.p) resetMan(P);
  if (!st.cfg.auto) st.calls[1] = poss === 1 ? { id: offenceCall(st, 1, rnd(st), rnd(st)), flip: false } : { id: defenceCall(st, 1, rnd(st)), flip: false };
  return st;
}
// Apply a whistle directly (the rules, without the play): res as whistle() takes it.
export function forceWhistle(st, res) {
  if (st.phase !== "live") { st.phase = "live"; st.pt = 0; if (!st.cur) st.cur = { thrown: false, caught: false, sackable: false, turnover: false }; }
  whistle(st, res);
  for (let i = 0; i < 80 && st.phase === "dead"; i++) step(st, 0);
  return st;
}
// The calls a check wants: {off, def} play ids for the next down (instead of the CPU's).
export function forceCalls(st, off, def) {
  if (st.phase !== "call") return st;
  st.calls[st.poss] = { id: off, flip: false }; st.calls[1 - st.poss] = { id: def, flip: false };
  st.need = -1; startDown(st);
  return st;
}
