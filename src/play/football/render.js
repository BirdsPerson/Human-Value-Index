// THE BOWL, playable: the picture. Browser only; reads the sim's state and never writes it (the
// `_` fields it leaves on a player are its own caches: screen spots, a stride phase).
// 320 x 240 logical pixels, fillRect and polygon fills, scaled by whole device pixels with smoothing
// off: the same plain pixel look as the courts and the tennis club, drawn a size up.
//
// The camera: the broadcast angle from behind the play, a true perspective. It stands behind the
// line of scrimmage (team 0 always attacks +x, so the camera always looks +x: behind the
// quarterback on offence, behind the defence on defence), raised and pitched down. A point (x, y, z)
// in yards: depth = dx cos(p) - dz sin(p), up = dx sin(p) + dz cos(p); x' = 160 + (camY - y) F/depth,
// y' = Y0 - up F/depth. One scale per depth, so the players shrink with distance. HIGH is the same
// camera higher and steeper, for the whole field of play.
// The shot moves with the play (camFollow): wide and high while a pass develops, tight on the man
// with the ball once he is past the line or has caught it (leading his run), wide under a kick,
// eased so nothing cuts. Every value proj() reads is eased together, so the perspective stays true.
import { FIELD, OS, DS, ICONS, iconsOf, dirOf, goalX, PLAYS, ROUTES, toGoal } from "./sim.js";
import { shrinkHead } from "../heads.js";

export const W = 320, H = 240;
const CY = FIELD.cy, FW = FIELD.w;
export const CAMS = {
  broadcast: { h: 9.5, back: 12.5, backD: 15.5, pitch: 0.43, F: 118, Y0: 130, lat: 0.5, dyn: 1 },
  high: { h: 26, back: 12, backD: 18, pitch: 0.95, F: 175, Y0: 96, lat: 0.35, dyn: 0.45 },
};
export const CAM_NAMES = { broadcast: "BROADCAST", high: "HIGH AND WIDE" };
// The shots (multipliers on the preset): set, drop (the pass developing), air (the ball on its way,
// closing on the catch), run (the carrier), kick.
const SHOTS = {
  set: { F: 1, h: 1, pitch: 0, back: 1 },
  drop: { F: 0.9, h: 1.22, pitch: 0.07, back: 1.05 },
  air: { F: 1.18, h: 1.05, pitch: 0.02, back: 0.95 },
  run: { F: 1.42, h: 0.92, pitch: -0.02, back: 0.78 },
  kick: { F: 0.82, h: 1.35, pitch: 0.1, back: 1.1 },
};
// cam: {mode, x, y, F, h, pitch, s, c, Y0} (eased by camFollow)
export function camInit(st, mode = "broadcast") {
  const K = CAMS[mode] || CAMS.broadcast;
  const c = { mode, F: K.F, h: K.h, pitch: K.pitch, s: Math.sin(K.pitch), c: Math.cos(K.pitch), Y0: K.Y0, x: 0, y: CY };
  const [fx, fy, back] = focusOf(st, K, "set");
  c.x = fx - back; c.y = CY + (fy - CY) * K.lat;
  return c;
}
// What the moment is: set | drop | run | kick.
function shotOf(st) {
  if (st.phase !== "live" && st.phase !== "dead") return "set";
  const b = st.ball;
  if (b.st === "kick" || (st.kick && !st.kick.done && st.phase === "live")) return "kick";
  if (b.st === "held") {
    const P = st.p[b.own];
    if (!P) return "set";
    if (P.role.k === "qb" && st.play?.kind === "pass" && !st.cur?.thrown) return "drop";
    if (P.role.k === "qb" && (st.play?.kind === "run" || st.play?.kind === "kneel") && !st.cur?.handed) return "set";
    const past = dirOf(P.t) * (P.x - st.los) > -0.5;
    if (past || st.cur?.caught || st.cur?.turnover || P.role.k === "ret" || st.play?.kind === "ko" || st.play?.kind === "punt") return "run";
    return "set";
  }
  if (b.st === "air") return b.away ? "drop" : "air";   // the ball on its way: closing on the catch
  if (st.phase === "dead" && st.res?.g >= 0) return "run";
  return "set";
}
function focusOf(st, K, shot) {
  const b = st.ball, off0 = st.poss === 0;
  let fx = st.los, fy = st.ballY, back = off0 ? K.back : K.backD;
  if (st.phase === "live" || st.phase === "dead") {
    if (b.st === "held") {
      const P = st.p[b.own]; fx = P.x; fy = P.y; back = P.t === 0 ? K.back : K.backD;
      if (shot === "run") { fx += P.vx * 0.32; fy += P.vy * 0.22; }   // lead the runner
    }
    else if (b.st === "air") { const u = b.away ? 0.5 : 0.5 + 0.4 * Math.min(1, b.f / Math.max(1, b.T)); fx = b.x + (b.tx - b.x) * u; fy = b.y + (b.ty - b.y) * u; }
    else if (b.st === "kick") { fx = b.lx ?? b.x; fy = b.ly ?? b.y; back = K.back + 6; if (st.play.kind === "fg" || st.play.kind === "pat") { fx = st.los; fy = st.ballY; } }
    else { fx = b.x; fy = b.y; }
    if (st.play?.kind === "pass" && (b.st === "held" || b.st === "snap") && st.cur && !st.cur.thrown && b.own >= 0 && st.p[b.own]?.role.k === "qb") { fx = st.los; back = off0 ? K.back : K.backD; }
  }
  if (st.phase === "pre" && st.kick?.kind === "ko") { fx = st.ball.x; back = st.kick.by === 0 ? K.back : K.backD + 25; }
  return [fx, fy, back];
}
export function camFollow(cam, st) {
  const K = CAMS[cam.mode] || CAMS.broadcast, shot = shotOf(st), S = SHOTS[shot], d = K.dyn;
  const [fx, fy, back0] = focusOf(st, K, shot);
  const back = back0 * (1 + (S.back - 1) * d);
  const tx = fx - back, ty = CY + (fy - CY) * K.lat, k = st.phase === "pre" || st.phase === "call" ? 0.2 : shot === "run" ? 0.11 : 0.09;
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  const e = 0.07;
  cam.F += (K.F * (1 + (S.F - 1) * d) - cam.F) * e;
  cam.h += (K.h * (1 + (S.h - 1) * d) - cam.h) * e;
  cam.pitch += (K.pitch + S.pitch * d - cam.pitch) * e;
  cam.s = Math.sin(cam.pitch); cam.c = Math.cos(cam.pitch);
  cam.shot = shot;
  return cam;
}
export function proj(cam, x, y, z) {
  const dx = x - cam.x, dz = z - cam.h, depth = dx * cam.c - dz * cam.s;
  if (depth < 0.4) return null;
  const k = cam.F / depth, up = dx * cam.s + dz * cam.c;
  return [W / 2 + (cam.y - y) * k, cam.Y0 - up * k, k];
}
const nearX = (cam) => cam.x + 1.2;

const PAL = {
  bg: "#0a0f0a", sky: "#0d1418", stand: "#151b24", standHi: "#1b2230", grass: "#3c7a32", grassB: "#367030", surround: "#2a5524",
  line: "#f2efe6", los: "#3a6fd8", fd: "#ffe14a", post: "#e0c040", shadow: "#1e3a18", ball: "#8a4a22", ballLace: "#f2efe6",
  outline: "#0a0f0a", mark: "#ffe14a", eye: "#5cff8a", meter: "#22382a", hot: "#e05050", sock: "#e6e6e6", shoe: "#1a1a1a", mask: "#3a3f46", carrier: "#f2efe6",
  lane: "rgba(255, 225, 74, 0.11)",
};
const ICON_COL = { A: "#3c8a46", B: "#b83232", X: "#3a6fd8", Y: "#e0c040", RB: "#9aa0a8" };
const SHIRTS = ["#b83232", "#3a6fd8", "#e6e6e6", "#e0c040", "#3c8a46", "#d97a2b", "#6b3fa0", "#d977a8", "#8a8a8a", "#45618f", "#262626", "#d9ccb0"];
const SKINS = ["#f6d5bc", "#f1c9a5", "#e0b088", "#c68c5e", "#8d5a36", "#5c3a22"];
const hash = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, "0");
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}
function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
function box(ctx, x0, y0, x1, y1, c) { const a = Math.round(x0), b = Math.round(y0), w = Math.round(x1) - a, h = Math.round(y1) - b; if (w <= 0 || h <= 0) return; ctx.fillStyle = c; ctx.fillRect(a, b, w, h); }
// Bresenham, with each row's (or column's) run of pixels as one fillRect: a yard line across the
// field is a handful of rects, not hundreds.
function line(ctx, x0, y0, x1, y1, c, wpx = 1) {
  ctx.fillStyle = c;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  if (Math.max(x0, x1) < -2 || Math.min(x0, x1) > W + 2 || Math.max(y0, y1) < -2 || Math.min(y0, y1) > H + 2) return;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, flat = dx >= -dy;
  let err = dx + dy, rx = x0, ry = y0, run = 0;
  const flush = () => { if (!run) return; if (flat) ctx.fillRect(sx > 0 ? rx : rx - run + 1, ry, run, wpx); else ctx.fillRect(rx, sy > 0 ? ry : ry - run + 1, wpx, run); run = 0; };
  for (let k = 0; k < 1400; k++) {
    if (!run) { rx = x0; ry = y0; }
    run++;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    let mx = false, my = false;
    if (e2 >= dy) { err += dy; x0 += sx; mx = true; }
    if (e2 <= dx) { err += dx; y0 += sy; my = true; }
    if (flat ? my : mx) flush();
  }
  flush();
}
function poly(ctx, pts, c) {
  if (pts.some(p => !p)) return;
  ctx.fillStyle = c; ctx.beginPath();
  pts.forEach(([x, y], i) => { if (i) ctx.lineTo(Math.round(x), Math.round(y)); else ctx.moveTo(Math.round(x), Math.round(y)); });
  ctx.closePath(); ctx.fill();
}
// a ground quad x0..x1 by y0..y1, clipped at the camera's feet
function quad(ctx, cam, x0, x1, y0, y1, c) {
  const n = nearX(cam);
  if (x1 <= n) return;
  x0 = Math.max(x0, n);
  poly(ctx, [proj(cam, x0, y0, 0), proj(cam, x1, y0, 0), proj(cam, x1, y1, 0), proj(cam, x0, y1, 0)], c);
}
function gline(ctx, cam, x0, y0, x1, y1, c, w = 1) {
  const n = nearX(cam);
  if (x0 < n && x1 < n) return;
  if (x0 < n) { const t = (n - x0) / (x1 - x0); y0 += (y1 - y0) * t; x0 = n; }
  if (x1 < n) { const t = (n - x1) / (x0 - x1); y1 += (y0 - y1) * t; x1 = n; }
  const a = proj(cam, x0, y0, 0), b = proj(cam, x1, y1, 0);
  if (a && b) line(ctx, a[0], a[1], b[0], b[1], c, w);
}
// A pixel ring on the turf round (x, y): 20 segments of the projected ellipse.
function ring(ctx, cam, x, y, r, c, w = 1) {
  let prev = null, first = null;
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * 6.2832, p = proj(cam, x + Math.cos(a) * r, y + Math.sin(a) * r, 0);
    if (!p) { prev = null; continue; }
    if (prev) line(ctx, prev[0], prev[1], p[0], p[1], c, w);
    else first = p;
    prev = p;
  }
  void first;
}

// ---- type: the courts' 3 x 5 -----------------------------------------------------------------------
const GL = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111", F: "111100110100100",
  G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111",
  M: "101111111101101", N: "110101101101101", O: "010101101101010", P: "110101110100100", Q: "010101101110011", R: "110101110101101",
  S: "011100010001110", T: "111010010010010", U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101",
  Y: "101101010010010", Z: "111001010100111", 0: "111101101101111", 1: "010110010010111", 2: "110001010100111", 3: "110001010001110",
  4: "101101111001001", 5: "111100110001110", 6: "011100111101111", 7: "111001010010010", 8: "111101111101111", 9: "111101111001110",
  ".": "000000000000010", "-": "000000111000000", ":": "000010000010000", "!": "010010010000010", "/": "001001010100100", "&": "010101010101011", "'": "010010000000000", ",": "000000000010100",
  "[": "111101101101111", "^": "010010101101111",
};
export const textW = (s, k = 1) => (String(s).length * 4 - 1) * k;
export function text(ctx, s, x, y, c, k = 1) {
  ctx.fillStyle = c;
  let cx = Math.round(x);
  for (const ch of String(s).toUpperCase()) {
    const g = GL[ch];
    if (g) for (let i = 0; i < 15; i++) if (g[i] === "1") ctx.fillRect(cx + (i % 3) * k, Math.round(y) + Math.floor(i / 3) * k, k, k);
    cx += 4 * k;
  }
}
function outlined(ctx, s, x, y, c, k = 1) {
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1]]) text(ctx, s, x + ox, y + oy, PAL.outline, k);
  text(ctx, s, x, y, c, k);
}

// ---- the stadium ----------------------------------------------------------------------------------
let CROWD = null;
function crowd() {
  if (CROWD) return CROWD;
  const out = [];
  for (const side of [-1, 1]) for (let r = 0; r < 9; r++) {
    const y = side < 0 ? -6 - r * 1.2 : FW + 6 + r * 1.2, z = 0.8 + r * 0.95;
    for (let x = -24; x <= 136; x += 1.5) { const h = hash(Math.round(x * 10), r * 7 + (side > 0 ? 3 : 0)); if (h % 7 === 0) continue; out.push({ x: x + ((r & 1) ? 0.5 : 0), y, z, c: shade(SHIRTS[h % SHIRTS.length], 0.55 - r * 0.015), sk: shade(SKINS[(h >>> 5) % SKINS.length], 0.6), ph: (h >>> 9) % 16, keen: (h >>> 13) % 4 }); }
  }
  for (const end of [-1, 1]) for (let r = 0; r < 8; r++) {
    const x = end > 0 ? 116 + r * 1.1 : -16 - r * 1.1, z = 0.8 + r * 0.85;
    for (let y = -6; y <= FW + 6; y += 1.4) { const h = hash(Math.round(y * 10) + 999 * end, r * 5); if (h % 6 === 0) continue; out.push({ x, y, z, c: shade(SHIRTS[h % SHIRTS.length], 0.5 - r * 0.015), sk: shade(SKINS[(h >>> 5) % SKINS.length], 0.55), ph: (h >>> 9) % 16, keen: (h >>> 13) % 4 }); }
  }
  CROWD = out;
  return out;
}
function drawStands(ctx, cam, fx, reduced) {
  // the bowl's walls: dark slopes behind each sideline and end
  const n = nearX(cam);
  for (const side of [-1, 1]) {
    const y0 = side < 0 ? -5.5 : FW + 5.5, y1 = side < 0 ? -17 : FW + 17;
    const xa = Math.max(n, -24), xb = 136;
    poly(ctx, [proj(cam, xa, y0, 0), proj(cam, xb, y0, 0), proj(cam, xb, y1, 9), proj(cam, xa, y1, 9)], PAL.stand);
  }
  if (cam.x < 110) poly(ctx, [proj(cam, 115, -17, 0), proj(cam, 115, FW + 17, 0), proj(cam, 126, FW + 17, 8), proj(cam, 126, -17, 8)], PAL.standHi);
  const mood = fx?.mood || "idle", t = fx?.t || 0;
  for (const p of crowd()) {
    if (p.x < n + 2) continue;
    const q = proj(cam, p.x, p.y, p.z);
    if (!q || q[0] < -3 || q[0] > W + 3 || q[1] < -3 || q[1] > H) continue;
    const s = Math.max(1, Math.round(q[2] * 0.45));
    let up = 0;
    if (!reduced && mood === "cheer" && p.keen > 0) up = 1 + (((t + p.ph * 3) >> 3) & 1);
    else if (mood === "stand" && p.keen > 1) up = 1;
    ctx.fillStyle = p.c; ctx.fillRect(Math.round(q[0]), Math.round(q[1]) - s - up, s, s);
    if (s >= 2 || q[2] > 3) { ctx.fillStyle = p.sk; ctx.fillRect(Math.round(q[0]), Math.round(q[1]) - 2 * s - up, s, Math.max(1, s - (s > 2 ? 1 : 0))); }
  }
}
function drawField(ctx, cam, st, kits) {
  // the surround, the stripes, the end zones in the home side's colour (team 0's end at -10..0)
  quad(ctx, cam, -16, 126, -5.5, FW + 5.5, PAL.surround);
  for (let x = 0; x < 100; x += 5) quad(ctx, cam, x, x + 5, 0, FW, (x / 5) % 2 ? PAL.grassB : PAL.grass);
  quad(ctx, cam, -10, 0, 0, FW, shade(kits[0][0], 0.55));
  quad(ctx, cam, 100, 110, 0, FW, shade(kits[1][0], 0.55));
  const L = PAL.line;
  gline(ctx, cam, -10, 0, 110, 0, L); gline(ctx, cam, -10, FW, 110, FW, L);
  for (const x of [-10, 110]) gline(ctx, cam, x, 0, x, FW, L);
  for (let x = 0; x <= 100; x += 5) gline(ctx, cam, x, 0, x, FW, L, x % 50 === 0 ? 2 : 1);
  // hash marks and the sideline ticks, every yard
  for (let x = 1; x < 100; x++) {
    if (x % 5 === 0) continue;
    for (const hy of FIELD.hash) gline(ctx, cam, x, hy - 0.35, x, hy + 0.35, L);
    gline(ctx, cam, x, 0.3, x, 1.0, L); gline(ctx, cam, x, FW - 1.0, x, FW - 0.3, L);
  }
  // the numbers, flat on the grass (upright glyphs, scaled with depth)
  for (let x = 10; x <= 90; x += 10) {
    const v = String(x <= 50 ? x : 100 - x);
    for (const ny of [9, FW - 9]) {
      const q = proj(cam, x, ny, 0);
      if (!q || cam.x > x - 1.2) continue;
      const k = Math.max(1, Math.round(q[2] * 0.3));
      if (q[2] < 2.2) continue;
      text(ctx, v, q[0] - textW(v, k) / 2, q[1] - 5 * k * 0.6, shade(L, 0.9), k);
    }
  }
  // the line of scrimmage and the line to gain
  if (st.phase === "pre" || st.phase === "live" || st.phase === "call" || st.phase === "dead") {
    if (st.play?.kind !== "ko" && !(st.kick?.kind === "ko")) {
      gline(ctx, cam, st.los, 0, st.los, FW, PAL.los, 2);
      if (st.fd !== goalX(st.poss) && st.tryFor < 0 && st.down >= 1) gline(ctx, cam, st.fd, 0, st.fd, FW, PAL.fd, 2);
    }
  }
}
function drawPosts(ctx, cam, x) {
  const top = 3.33 + 7, base = proj(cam, x, CY, 0), bar = proj(cam, x, CY, 3.33);
  if (!base || !bar) return;
  const w = Math.max(1, Math.round(base[2] * 0.12));
  box(ctx, base[0] - w / 2, bar[1], base[0] + w / 2 + 1, base[1], PAL.post);
  const l = proj(cam, x, CY - FIELD.post, 3.33), r = proj(cam, x, CY + FIELD.post, 3.33), lt = proj(cam, x, CY - FIELD.post, top), rt = proj(cam, x, CY + FIELD.post, top);
  if (!l || !r || !lt || !rt) return;
  line(ctx, l[0], l[1], r[0], r[1], PAL.post, w); line(ctx, l[0], l[1], lt[0], lt[1], PAL.post, w); line(ctx, r[0], r[1], rt[0], rt[1], PAL.post, w);
}

// ---- the players --------------------------------------------------------------------------------------
// The figures are drawn 1.5 times life size (the 16-bit habit: a man you can read at this
// resolution); every figure the same factor, so depth still sizes them. Each is built from boxes in
// yards (x across, z up, origin at his feet), so one description draws at every depth.
//
// Facing: 0 away from the camera (+x, the offence's natural way), 1 toward it (the defence's), 2 to
// screen left (+y), 3 to screen right. A man faces his own way until he is plainly running
// somewhere else; a defender in coverage keeps facing the passer (so he backpedals), the passer in
// the pocket keeps facing downfield (so he drops back).
// Poses: stance (three-point for the lines, two-point for the backs), the run cycle (legs and arms
// over four phases, paced by his speed), carry, the throw (cocked, then released), the catch (hands
// up), block (arms out, leaning in), wrap / hit / dive, swat, stiff arm, the fall and the lying
// figure, the celebration (arms up, a hop, facing the crowd).
const BIG = 1.5;
const len = (x, y) => Math.sqrt(x * x + y * y);
function facingOf(st, P) {
  const nat = P.t === 0 ? 0 : 1, sp = len(P.vx, P.vy);
  if (st.phase === "dead" && st.res?.k === "td" && st.res.g === P.g) return 1;   // the scorer turns to the crowd
  if (sp < 2.2 || P.eng >= 0) return nat;
  const k = P.role?.k;
  if ((k === "man" || k === "zone") && !st.cur?.thrown && !st.cur?.runRead) return nat;   // backpedal, shuffle
  if (k === "qb" && !st.cur?.scramble) return nat;
  if (k === "pblock" && !st.cur?.handed) return nat;
  if (Math.abs(P.vx) >= Math.abs(P.vy) * 0.9) return P.vx > 0 ? 0 : 1;
  return P.vy > 0 ? 2 : 3;
}
// The arms' job this frame.
function poseOf(st, P, has) {
  const a = P.act?.kind, k = P.role?.k, b = st.ball;
  if (st.phase === "dead" && st.res?.k === "td" && st.res.g === P.g) return "celebrate";
  if (a === "dive") return "dive";
  if (a === "swat" || (P.z > 0.2 && !has)) return "swat";
  if (a === "stiff") return "stiff";
  if (a === "wrap" || a === "hit") return "tackle";
  if (P.eng >= 0) return "block";
  if (has) return k === "qb" && st.play?.kind === "pass" && !st.cur?.thrown ? "cock" : "carry";
  if (b.st === "air" && b.from === P.g && b.f < 12) return "throw";
  if (b.st === "air" && k === "catch" && b.to === P.g && b.T - b.f < 28) return "catch";
  if (b.st === "kick" && k === "ret" && b.T && b.T - b.f < 40 && len(b.lx - P.x, b.ly - P.y) < 3) return "catch";
  if (st.phase === "pre" && !st.kick) {
    if (P.t === st.poss ? P.os >= OS.LT : P.ds <= DS.RE) return "three";
    if (P.t === st.poss ? P.os === OS.QB : P.ds <= DS.SLB) return "two";
    return "set";
  }
  return "run";
}
// look: {jersey, trim, pants, helmet, skin, hair, head (canvas | null), num}
function drawPlayer(ctx, cam, P, look, st, frame, ctl, hasBall, carrierRing) {
  const g = proj(cam, P.x, P.y, 0);
  if (!g) return;
  const [gx, gy, k0] = g, k = k0 * BIG;
  if (gx < -30 || gx > W + 30 || gy < -10) return;
  const lying = P.down > 0 && st.phase !== "pre", falling = lying && P.down > 42;
  const face = facingOf(st, P), pose = lying ? "down" : poseOf(st, P, hasBall);
  const crouch = pose === "three" ? 0.72 : pose === "two" ? 0.86 : pose === "block" || pose === "tackle" ? 0.9 : pose === "set" ? 0.95 : 1;
  const top = proj(cam, P.x, P.y, 2.0 + P.z);
  if (!top) return;
  const hp = ((gy - top[1]) / (2.0 + P.z) || k0) * BIG;   // px per yard of height at this spot (drawn a size up)
  // the shadow, the rings: the man you hold in yellow, the man with the ball in white
  rect(ctx, gx - 0.4 * k, gy - Math.max(1, 0.1 * k), 0.8 * k, Math.max(1, 0.2 * k), PAL.shadow);
  if (ctl || carrierRing) {
    ring(ctx, cam, P.x, P.y, 0.78, PAL.outline, 3);
    ring(ctx, cam, P.x, P.y, 0.78, ctl ? PAL.mark : PAL.carrier, 1);
  }
  const sk = look.skin;
  if (lying) {
    // on the ground: a figure laid along the turf (the first frames: on his knees)
    const L = 0.95 * k, T = Math.max(2, 0.32 * k);
    if (falling) {
      const R0 = (xm, zm, wm, hm, c) => box(ctx, gx + xm * k, gy - (zm + hm) * hp * 0.55, gx + (xm + wm) * k, gy - zm * hp * 0.55, c);
      R0(-0.32, 0, 0.64, 0.5, look.pants); R0(-0.3, 0.5, 0.6, 0.6, look.jersey); R0(-0.42, 0.9, 0.84, 0.2, look.jersey);
      R0(-0.5, 0.3, 0.14, 0.7, sk); R0(0.36, 0.3, 0.14, 0.7, sk);
      R0(-0.16, 1.1, 0.32, 0.4, look.helmet);
      return;
    }
    box(ctx, gx - L, gy - T, gx + L * 0.3, gy, look.jersey);
    box(ctx, gx + L * 0.3, gy - T, gx + L * 0.9, gy, look.pants);
    box(ctx, gx + L * 0.9, gy - T, gx + L * 1.05, gy, PAL.shoe);
    box(ctx, gx - L - 0.42 * k, gy - T - 1, gx - L, gy, look.helmet);
    return;
  }
  if (pose === "dive") {
    // in the air, flat out, arms ahead
    const z0 = Math.max(0.35, P.z + 0.35), by0 = gy - z0 * hp, L = 1.0 * k, T = Math.max(2, 0.34 * k), dir = face === 1 ? 1 : -1;
    box(ctx, gx - L * 0.2 * dir - (dir > 0 ? 0 : L), by0 - T, gx - L * 0.2 * dir + (dir > 0 ? L : 0), by0, look.jersey);
    box(ctx, gx + (dir > 0 ? L * 0.8 : -L * 1.1), by0 - T, gx + (dir > 0 ? L * 1.1 : -L * 0.8), by0, look.pants);
    box(ctx, gx + (dir > 0 ? -L * 0.55 : L * 0.2), by0 - T * 1.2, gx + (dir > 0 ? -L * 0.2 : L * 0.55), by0 - T * 0.2, look.helmet);
    box(ctx, gx + (dir > 0 ? -L * 0.95 : L * 0.55), by0 - T * 0.9, gx + (dir > 0 ? -L * 0.55 : L * 0.95), by0 - T * 0.4, sk);
    P._sx = gx; P._sy = by0 - T * 1.2;
    return;
  }
  const hop = pose === "celebrate" ? ((frame >> 3) & 1) * 0.18 : 0;
  const by = gy - (P.z + hop) * hp;
  const z = (zm) => by - zm * hp * crouch;
  const R = (xm, zm, wm, hm, c) => box(ctx, gx + xm * k, z(zm + hm), gx + (xm + wm) * k, z(zm), c);
  // the stride: paced by his speed, held still when he stands
  const sp = len(P.vx, P.vy), moving = sp > 1 && P.z === 0 && pose !== "block" && pose !== "three" && pose !== "two" && pose !== "set";
  P._ph = ((P._ph || 0) + (moving ? sp * 0.055 : 0)) % 4;
  const ph = moving ? Math.floor(P._ph) : -1;
  const side = face >= 2, dir = face === 2 ? -1 : 1;   // side views: dir is screen-forward (-1 left)
  const liftL = ph === 0 ? 0.3 : 0, liftR = ph === 2 ? 0.3 : 0, swing = ph === 0 ? 1 : ph === 2 ? -1 : 0;
  // legs: cleats, socks, pants (a lifted leg shows shorter, its foot up)
  if (!side) {
    const stanceW = pose === "three" || pose === "two" ? 0.08 : 0;
    R(-0.3 - stanceW, liftL, 0.22, 0.1, PAL.shoe); R(0.08 + stanceW, liftR, 0.22, 0.1, PAL.shoe);
    R(-0.26 - stanceW, 0.1 + liftL, 0.16, 0.36, PAL.sock); R(0.1 + stanceW, 0.1 + liftR, 0.16, 0.36, PAL.sock);
    R(-0.3 - stanceW, 0.44 + liftL * 0.5, 0.26, 0.56 - liftL * 0.5, look.pants); R(0.04 + stanceW, 0.44 + liftR * 0.5, 0.26, 0.56 - liftR * 0.5, look.pants);
    R(-0.1, 0.7, 0.2, 0.3, look.pants);
  } else {
    const sc = ph === 0 ? 0.26 : ph === 2 ? -0.26 : 0;   // the scissor: front leg forward, back leg back
    R(dir * sc - 0.1, 0, 0.26, 0.1, PAL.shoe); R(-dir * sc - 0.1, 0, 0.22, 0.1, PAL.shoe);
    R(dir * sc - 0.08, 0.1, 0.16, 0.36, PAL.sock); R(-dir * sc - 0.08, 0.1, 0.16, 0.36, PAL.sock);
    R(dir * sc * 0.6 - 0.14, 0.44, 0.28, 0.56, look.pants); R(-dir * sc * 0.6 - 0.14, 0.44, 0.28, 0.56, look.pants);
  }
  // the torso: jersey over the pads (narrower from the side), the stripe on the pads
  const tw = side ? 0.22 : 0.3;
  R(-tw, 0.95, tw * 2, 0.56, look.jersey);
  R(-tw - 0.1, 1.33, tw * 2 + 0.2, 0.22, look.jersey); R(-tw - 0.1, 1.5, tw * 2 + 0.2, 0.05, look.trim);
  if (!side && k >= 9) { const n = String(look.num); text(ctx, n, gx - textW(n) / 2, z(1.3) - 1, look.trim); }
  // the arms
  const arm = (xm, zm, hm, c = look.jersey) => { R(xm, zm, 0.13, hm, c); };
  const hand = (xm, zm) => R(xm, zm, 0.13, 0.1, sk);
  const armL = -tw - 0.14, armR = tw + 0.01;
  if (pose === "catch" || pose === "celebrate") { arm(armL, 1.5, 0.55); arm(armR, 1.5, 0.55); hand(armL, 2.05); hand(armR, 2.05); }
  else if (pose === "swat") { arm(armR, 1.5, 0.6); hand(armR, 2.1); arm(armL, 0.95, 0.5); hand(armL, 0.9); }
  else if (pose === "cock") { arm(armR + 0.08, 1.45, 0.5); hand(armR + 0.08, 1.95); R(armR + 0.04, 2.0, 0.2, 0.16, PAL.ball); arm(armL - 0.1, 1.2, 0.3); hand(armL - 0.1, 1.15); }
  else if (pose === "throw") { arm(armR + 0.14, 1.5, 0.45); hand(armR + 0.3, 1.9); arm(armL, 1.0, 0.4); hand(armL, 0.95); }
  else if (pose === "stiff") { arm(armL, 1.0, 0.45); hand(armL, 0.95); R(armR, 1.3, 0.5, 0.12, look.jersey); hand(armR + 0.5, 1.3); }
  else if (pose === "block" || pose === "tackle") {
    // both arms out ahead at the chest: from behind or in front they show bent, hands at the sides
    const w = pose === "tackle" ? 0.62 : 0.5;
    R(-tw - 0.22, 1.18, 0.14, 0.3, look.jersey); R(tw + 0.08, 1.18, 0.14, 0.3, look.jersey);
    R(-w, 1.12, 0.26, 0.12, sk); R(w - 0.26, 1.12, 0.26, 0.12, sk);
  }
  else if (pose === "three") { arm(armL, 0.55, 0.65); hand(armL, 0.0); arm(armR, 0.75, 0.55); hand(armR, 0.7); }
  else if (pose === "two") { arm(armL, 0.85, 0.5); hand(armL, 0.8); arm(armR, 0.85, 0.5); hand(armR, 0.8); }
  else if (pose === "carry" && !side) {
    // the ball tucked under the right arm, the left pumping
    arm(armL, 0.9 + swing * 0.12, 0.5); hand(armL, 0.85 + swing * 0.12);
    R(armR - 0.04, 1.05, 0.26, 0.14, look.jersey); hand(armR + 0.1, 1.08);
    R(armR - 0.02, 1.0, 0.22, 0.26, PAL.ball); if (k >= 10) R(armR + 0.07, 1.08, 0.04, 0.12, PAL.ballLace);
  }
  else if (pose === "carry") {
    R(-0.08, 1.02, 0.3, 0.26, PAL.ball); arm(dir > 0 ? armR : armL, 1.0, 0.4); hand(dir > 0 ? armR : armL, 0.95);
  }
  else if (side) {
    const a = -dir * swing * 0.2;
    arm(a - 0.06, 0.95 - swing * 0.05, 0.52); hand(a - 0.06, 0.9 - swing * 0.05);
  }
  else {
    arm(armL, 0.92 + swing * 0.14, 0.5 - Math.abs(swing) * 0.06); hand(armL, 0.86 + swing * 0.14);
    arm(armR, 0.92 - swing * 0.14, 0.5 - Math.abs(swing) * 0.06); hand(armR, 0.86 - swing * 0.14);
  }
  // the head: a helmet in the team's colour; the file photo's face under its crown when he faces
  // the camera, the stripe down the back of it when he does not
  const hh = Math.max(3, Math.round(0.46 * hp * crouch)), hy = Math.round(z(1.55)) - hh;
  const hw = Math.max(2, Math.round(0.36 * k));
  R(-0.07, 1.5, 0.14, 0.07, sk);   // the neck
  if (face === 1 && look.head) {
    const hd = hh < look.head.height ? shrinkHead(look.head, hh) : look.head, w2 = Math.max(2, Math.round((hd.width * hh) / hd.height));
    ctx.drawImage(hd, Math.round(gx - w2 / 2), hy, w2, hh);
    const cap = Math.max(1, Math.round(hh * 0.36)), ear = hh >= 8 ? 1 : 0;
    box(ctx, gx - w2 / 2 - ear, hy - ear, gx + w2 / 2 + ear, hy + cap, look.helmet);
    if (hh >= 7) { box(ctx, gx - w2 / 2 - ear, hy + cap, gx - w2 / 2 + 1 - ear, hy + hh, look.helmet); box(ctx, gx + w2 / 2 - 1 + ear, hy + cap, gx + w2 / 2 + ear, hy + hh, look.helmet); }
    if (hh >= 6) box(ctx, gx - w2 / 2 - ear, hy + hh - Math.max(1, Math.round(hh * 0.3)), gx + w2 / 2 + ear, hy + hh - Math.max(1, Math.round(hh * 0.3)) + 1, PAL.mask);   // the face mask
  } else if (face === 1) {
    box(ctx, gx - hw / 2, hy, gx + hw / 2, hy + hh, sk);
    box(ctx, gx - hw / 2 - 1, hy - 1, gx + hw / 2 + 1, hy + Math.max(1, Math.round(hh * 0.4)), look.helmet);
    if (hh >= 6) box(ctx, gx - hw / 2 - 1, hy + hh - 2, gx + hw / 2 + 1, hy + hh - 1, PAL.mask);
  } else if (side) {
    box(ctx, gx - hw / 2 - 1, hy - 1, gx + hw / 2 + 1, hy + hh, look.helmet);
    const fx0 = dir > 0 ? gx + hw / 2 - 1 : gx - hw / 2 - 1;
    box(ctx, fx0, hy + Math.round(hh * 0.4), fx0 + 2, hy + hh, sk);   // the face at the front of the helmet
    if (hh >= 6) box(ctx, dir > 0 ? gx + hw / 2 : gx - hw / 2 - 2, hy + hh - 2, dir > 0 ? gx + hw / 2 + 2 : gx - hw / 2, hy + hh - 1, PAL.mask);
  } else {
    box(ctx, gx - hw / 2 - 1, hy - 1, gx + hw / 2 + 1, hy + hh, look.helmet);
    if (hh >= 5) box(ctx, gx, hy - 1, gx + 1, hy + hh - 1, look.jersey);   // the stripe
  }
  if (ctl) {
    const mx = Math.round(gx), my = hy - 6 - ((frame >> 4) & 1);
    rect(ctx, mx - 2, my, 5, 1, PAL.mark); rect(ctx, mx - 1, my + 1, 3, 1, PAL.mark); rect(ctx, mx, my + 2, 1, 1, PAL.mark);
  }
  P._sx = gx; P._sy = hy;
}
function drawBall(ctx, cam, st) {
  const b = st.ball;
  if (b.st === "held" && st.p[b.own]) return;   // in his arms (drawn with him)
  const g = proj(cam, b.x, b.y, 0), p = proj(cam, b.x, b.y, Math.max(0, b.z));
  if (!g || !p) return;
  const s = Math.max(2, Math.round(0.42 * p[2]));
  if (b.z > 0.2) rect(ctx, g[0] - s / 2, g[1] - 1, s, Math.max(1, s / 3), PAL.shadow);
  rect(ctx, p[0] - s / 2, p[1] - s / 2, s, Math.max(2, Math.round(s * 0.6)), PAL.ball);
  if (s >= 4) rect(ctx, p[0] - 1, p[1] - s / 2, 2, 1, PAL.ballLace);
}
// The receivers' buttons: a disc over each eligible man in the button's colour.
const PS_GLYPH = { A: "X", B: "O", X: "[", Y: "^", RB: "R1" };
function drawIcons(ctx, st, labels) {
  for (const [lab, g] of iconsOf(st)) {
    const P = st.p[g];
    if (P._sx == null) continue;
    const t = labels?.[lab] ?? lab, x = Math.round(P._sx), y = Math.round(P._sy) - 10, w = Math.max(7, textW(t) + 4);
    box(ctx, x - w / 2 - 1, y - 1, x + w / 2 + 1, y + 8, PAL.outline);
    box(ctx, x - w / 2, y, x + w / 2, y + 7, ICON_COL[lab] || "#888");
    text(ctx, t, x - textW(t) / 2, y + 1, lab === "Y" ? PAL.outline : "#ffffff");
  }
}
// The play art before the snap: each receiver's route, in his button's colour; the back's path.
function drawArt(ctx, cam, st) {
  if (st.phase !== "pre" || st.poss !== 0 || st.cfg.auto || st.kick) return;
  const pl = PLAYS[st.play.id], d = dirOf(0);
  for (const [lab, g] of iconsOf(st)) {
    const P = st.p[g], r = ROUTES[P.role.r];
    if (!r) continue;
    const out = P.fy >= st.ballY ? 1 : -1;
    let px = P.x, py = P.y;
    const pts = r.pts.concat(r.settle ? [] : [[r.pts[r.pts.length - 1][0] + 6 * (r.deep ? 1 : 0.4), r.pts[r.pts.length - 1][1] + (r.pts.length > 1 ? (r.pts[r.pts.length - 1][1] - r.pts[r.pts.length - 2][1]) * 0.3 : 0)]]);
    for (const [u, v] of pts) { const nx = st.los + d * u, ny = Math.max(0.5, Math.min(FW - 0.5, P.fy + out * v)); gline(ctx, cam, px, py, nx, ny, ICON_COL[lab]); px = nx; py = ny; }
  }
  if (pl.kind === "run") {
    const RB = st.p[st.off[0][OS.RB]], side = st.play.side, tx = st.los + 4, ty = pl.run === "stretch" ? st.ballY + side * 9 : st.ballY + side * 1;
    gline(ctx, cam, RB.x, RB.y, tx, ty, PAL.fd);
  }
}
// EASY: the open lanes ahead of your runner, faint on the turf (where no defender stands within
// reach of the next six yards).
const LANES = [[1, 0], [0.9, 0.44], [0.9, -0.44], [0.64, 0.77], [0.64, -0.77]];
function drawLanes(ctx, cam, st) {
  if (!st.cfg.assist || st.cfg.auto || st.phase !== "live" || st.ball.st !== "held") return;
  const C = st.p[st.ball.own];
  if (!C || C.g !== st.ctl || C.t !== 0 || C.role.k === "qb") return;
  const d = dirOf(0);
  for (const [f, l] of LANES) {
    const ux = d * f, uy = l;
    let open = true;
    for (const D of st.p) {
      if (D.t === C.t || D.down > 0 || D.eng >= 0) continue;
      const rx = D.x - C.x, ry = D.y - C.y, t = rx * ux + ry * uy;
      if (t < -0.5 || t > 7) continue;
      const off = Math.abs(rx * uy - ry * ux);
      if (off < 1.6 + t * 0.12) { open = false; break; }
    }
    if (!open) continue;
    const a = 1.4, b = 6, hw = 0.42, nx = -uy, ny = ux;
    const p = (t, s) => proj(cam, C.x + ux * t + nx * s, C.y + uy * t + ny * s, 0);
    poly(ctx, [p(a, -hw), p(b, -hw * 0.35), p(b, hw * 0.35), p(a, hw)], PAL.lane);
  }
}
// The kick meter: power up the bar, then the needle back down to the line.
function drawMeter(ctx, st, assist) {
  const k = st.kick;
  if (!k || k.by !== 0 || st.cfg.auto || k.done && k.stage >= 3 && st.phase !== "live") return;
  const x = W - 22, y0 = 70, h = 110, val = (a) => y0 + h - Math.round(((a + 0.35) / 1.35) * h);
  box(ctx, x - 2, y0 - 2, x + 12, y0 + h + 2, PAL.outline);
  box(ctx, x, y0, x + 10, y0 + h, PAL.meter);
  const win = assist ? 0.22 : 0.14;
  box(ctx, x, val(win), x + 10, val(-win), "#2f6b3e");
  rect(ctx, x - 3, val(0), 16, 1, "#ffffff");
  if (k.stage === 1) { const p = k.f <= 48 ? k.f / 48 : Math.max(0, 2 - k.f / 48); box(ctx, x, val(p), x + 10, val(0), "#e0c040"); }
  if (k.stage >= 2) {
    box(ctx, x, val(k.pow), x + 10, val(0), "#8a6d1e");
    rect(ctx, x - 2, val(k.pow), 14, 1, "#e0c040");
    const a = k.stage === 2 ? k.pow - k.f / 40 : k.pow - 0;
    if (k.stage === 2) rect(ctx, x - 3, val(Math.max(-0.35, a)), 16, 2, PAL.hot);
  }
  text(ctx, k.stage === 0 ? "A" : k.stage === 1 ? "PWR" : k.stage === 2 ? "AIM" : "", x - 1, y0 - 9, PAL.mark);
}

// fx: {mood, t, banner: {text, t, c}, shake}; looks: [22]; labels: icon label per button
export function draw(ctx, st, looks, cam, frame, fx = {}, reduced = false, labels = null, kits = [["#888", "#fff"], ["#888", "#fff"]]) {
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  if (!reduced && fx.shake > 0) ctx.translate(((fx.shake >> 1) & 1) ? 1 : -1, 0);
  rect(ctx, 0, 0, W, H, PAL.bg);
  // the sky band above the far stand
  const hz = cam.Y0 - cam.F * (cam.s / cam.c);
  box(ctx, 0, 0, W, Math.max(0, hz), PAL.sky);
  drawStands(ctx, cam, fx, reduced);
  drawField(ctx, cam, st, kits);
  drawArt(ctx, cam, st);
  drawLanes(ctx, cam, st);
  const items = [];
  const held = st.ball.st === "held" ? st.ball.own : -1, showCtl = !st.cfg.auto && st.phase !== "over" && st.phase !== "call";
  for (const x of [-10, 110]) if (x > cam.x + 2) items.push({ d: x + 0.01, f: () => drawPosts(ctx, cam, x) });
  for (const P of st.p) {
    P._sx = null;
    if (P.x > cam.x + 1.5) items.push({ d: P.x, f: () => drawPlayer(ctx, cam, P, looks[P.g], st, frame, showCtl && P.g === st.ctl, P.g === held, P.g === held && st.phase === "live" && !(showCtl && P.g === st.ctl)) });
  }
  items.push({ d: st.ball.x - 0.05, f: () => drawBall(ctx, cam, st) });
  items.sort((a, b) => b.d - a.d);
  for (const it of items) it.f();
  drawIcons(ctx, st, labels);
  drawMeter(ctx, st, st.cfg.assist);
  // the kick's aim
  const k = st.kick;
  if (k && k.by === 0 && !st.cfg.auto && k.stage <= 1 && (k.kind === "ko" || k.kind === "punt")) {
    const d = dirOf(0), b = st.ball, a = proj(cam, b.x + d * 2, b.y, 0), e = proj(cam, b.x + d * 14, b.y + k.aim * 0.16 * 12 * 3, 0);
    if (a && e) line(ctx, a[0], a[1], e[0], e[1], PAL.fd);
  }
  // the pre-snap menus
  if (st.menu) {
    const s = st.menu === "aud" ? (labels?.menuAud || "AUDIBLE: A SLANTS  B HB DIVE  Y VERTICALS  X CANCEL") : (labels?.menuHot || "HOT ROUTE: PRESS A RECEIVER'S BUTTON FOR A STREAK");
    box(ctx, 0, H - 12, W, H, "rgba(10,15,10,0.85)");
    text(ctx, s, Math.max(2, W / 2 - textW(s) / 2), H - 9, PAL.mark);
  }
  if (fx.banner && fx.banner.t < 100) {
    const s = fx.banner.text, kk = textW(s, 2) > W - 8 ? 1 : 2, y = 40 + (reduced ? 0 : Math.max(0, 10 - fx.banner.t));
    outlined(ctx, s, W / 2 - textW(s, kk) / 2, y, fx.banner.c || PAL.mark, kk);
  }
  ctx.restore();
}

// ---- faces -------------------------------------------------------------------------------------------
export { headFrom as headOf } from "../heads.js";
export function skinOf(h) {
  try {
    const d = h.getContext("2d").getImageData(0, 0, h.width, h.height).data, n = new Map();
    for (let y = Math.floor(h.height / 2); y < h.height - 1; y++) for (let x = 2; x < h.width - 2; x++) {
      const o = (y * h.width + x) * 4; if (d[o + 3] < 200 || d[o] + d[o + 1] + d[o + 2] < 60) continue;
      const k = `#${[d[o], d[o + 1], d[o + 2]].map(v => v.toString(16).padStart(2, "0")).join("")}`; n.set(k, (n.get(k) || 0) + 1);
    }
    let best = null, bn = 0; for (const [k, v] of n) if (v > bn) { bn = v; best = k; }
    return best;
  } catch { return null; }
}
export { toGoal, ICONS, PS_GLYPH };
