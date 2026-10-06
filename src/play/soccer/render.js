// THE ESTATE PITCH, playable: the picture. Browser only; reads a view of the match (the sim's state,
// or a replay's snapshot of it) and never writes the sim. 320 x 200 logical pixels, fillRect and a few
// polygon fills, scaled by whole device pixels with smoothing off. The simple pixel look of the other
// sports pages; the camera is the broadcast's.
//
// The camera: a one-point perspective from the near side, level, looking across the pitch (+y). A
// point (x, y, z) in metres lands at x' = 160 + (x - cx) * s, y' = hy + (CH - z) * s with s = F / (y + D):
// one scale per depth for width, height and jump alike, so players shrink with distance and every
// vertical stays vertical. Three presets (BROADCAST, the default; TELE, lower and closer; CO-OP, high
// and wide). The camera follows the ball along the pitch, leading it a little, and tilts (hy) to keep
// it in the frame. Players are drawn 1.4x life size and their heads larger still (the 16-bit habit),
// so a face reads at this size.
import { PITCH as P_, SHOT_FULL } from "./sim.js";
import { shrinkHead } from "../heads.js";

export const W = 320, H = 200;
export const CAMS = {
  broadcast: { id: "broadcast", name: "BROADCAST", F: 380, D: 40, CH: 26, lead: 0.35 },
  tele: { id: "tele", name: "TELE", F: 420, D: 26, CH: 13, lead: 0.3 },
  coop: { id: "coop", name: "CO-OP", F: 280, D: 40, CH: 36, lead: 0.2 },
};
const BIG = 1.4;   // players drawn larger than life

export function makeCam(id = "broadcast") { return { ...(CAMS[id] || CAMS.broadcast), x: 0, hy: null }; }
export function proj(cam, x, y, z) {
  const s = cam.F / (y + cam.D);
  return [160 + (x - cam.x) * s, cam.hy + (cam.CH - z) * s, s];
}
// Ease the camera toward the ball (and, in a replay or a set piece, wherever it is told).
export function camFollow(cam, v, snap = false) {
  const b = v.ball, s0 = cam.F / cam.D, halfW = 160 / s0;
  const want = Math.max(-P_.hx - 4 + halfW * 0.7, Math.min(P_.hx + 4 - halfW * 0.7, b.x + (b.vx || 0) * cam.lead));
  cam.x = snap ? want : cam.x + (want - cam.x) * 0.06;
  // the tilt: the ball a little below the middle, the pitch never leaving the frame
  const ys = (cam.CH - Math.min(b.z, 3)) * (cam.F / (b.y + cam.D));
  const near = cam.CH * s0, far = cam.CH * (cam.F / (P_.w + cam.D));
  const lo = H - 10 - near, hi = 40 - far;   // the near touchline at the bottom margin .. the far one at y' = 40
  const hy = lo >= hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, H * 0.56 - ys));
  cam.hy = cam.hy === null || snap ? hy : cam.hy + (hy - cam.hy) * 0.08;
}

const PAL = {
  bg: "#0a0f0a", stand: "#141a24", standHi: "#1a2130", grassA: "#2f7a32", grassB: "#2a6e2d", edge: "#24602a", line: "#eef2e6",
  post: "#f4f4f0", net: "#c8ccc8", shadow: "#1d4a20", ball: "#f4f4f0", ballDk: "#3a3a3a", outline: "#0a0f0a", mark: "#ffe14a", eye: "#5cff8a",
  board: "#0d1310", boardInk: "#c8f5d8", boardAlt: "#1f4a2c", flag: "#ffe14a", ref: "#202020", red: "#e04040", yel: "#ffd640",
};
const SHIRTS = ["#b83232", "#3a6fd8", "#e6e6e6", "#e0c040", "#3c8a46", "#d97a2b", "#6b3fa0", "#d977a8", "#8a8a8a", "#45618f", "#262626", "#d9ccb0"];
const SKINS = ["#f6d5bc", "#f1c9a5", "#e0b088", "#c68c5e", "#8d5a36", "#5c3a22"];
const hash = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, "0");
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}
function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
function box(ctx, x0, y0, x1, y1, c) { const a = Math.round(x0), b = Math.round(y0), w = Math.round(x1) - a, h = Math.round(y1) - b; if (w <= 0 || h <= 0) return; ctx.fillStyle = c; ctx.fillRect(a, b, w, h); }
function line(ctx, x0, y0, x1, y1, c) {
  ctx.fillStyle = c;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let k = 0; k < 1200; k++) {
    if (x0 >= -2 && x0 <= W + 2 && y0 >= -2 && y0 <= H + 2) ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function poly(ctx, pts, c) {
  ctx.fillStyle = c; ctx.beginPath();
  pts.forEach(([x, y], i) => { if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.closePath(); ctx.fill();
}
const gp = (cam, x, y) => proj(cam, x, y, 0);
function gline(ctx, cam, pts, c) { for (let i = 1; i < pts.length; i++) { const a = gp(cam, ...pts[i - 1]), b = gp(cam, ...pts[i]); line(ctx, a[0], a[1], b[0], b[1], c); } }
const arc = (cx, cy, r, a0, a1, n = 24) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });

// ---- a 3 x 5 type --------------------------------------------------------------------------------------
const GL = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111", F: "111100110100100",
  G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111",
  M: "101111111101101", N: "110101101101101", O: "010101101101010", P: "110101110100100", Q: "010101101110011", R: "110101110101101",
  S: "011100010001110", T: "111010010010010", U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101",
  Y: "101101010010010", Z: "111001010100111", 0: "111101101101111", 1: "010110010010111", 2: "110001010100111", 3: "110001010001110",
  4: "101101111001001", 5: "111100110001110", 6: "011100111101111", 7: "111001010010010", 8: "111101111101111", 9: "111101111001110",
  ",": "000000000010100", ".": "000000000000010", "-": "000000111000000", ":": "000010000010000", "!": "010010010000010", "/": "001001010100100", "+": "000010111010000", "'": "010010000000000",
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
function textO(ctx, s, x, y, c, k = 1) {
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) text(ctx, s, x + ox, y + oy, PAL.outline, k);
  text(ctx, s, x, y, c, k);
}

// ---- the stand: a far stand of pixel people who rise for a goal ----------------------------------------------
const ROWS = 18, ROW_DY = 0.9, ROW_DZ = 0.62, STAND_Y0 = P_.w + 5, SEAT = 0.85, SPAN = 70;
let SEATS = null;
function seats() {
  if (SEATS) return SEATS;
  SEATS = [];
  for (let r = 0; r < ROWS; r++) {
    const out = [];
    for (let x = -SPAN + (r % 2) * SEAT * 0.5; x <= SPAN; x += SEAT) {
      const h = hash(Math.round(x * 10), r + 11);
      if (h % 7 === 0) continue;
      const dim = 0.6 - r * 0.012;
      out.push({ x, shirt: shade(SHIRTS[h % SHIRTS.length], dim), skin: shade(SKINS[(h >>> 5) % SKINS.length], dim + 0.12), ph: (h >>> 9) % 16, keen: (h >>> 13) % 4 });
    }
    SEATS.push({ r, y: STAND_Y0 + r * ROW_DY, z: 0.9 + r * ROW_DZ, seats: out });
  }
  return SEATS;
}
const BOARDS = ["HVI", "THE ESTATE PITCH", "THE DEPARTMENT OF LEISURE", "APPLAUSE IS MONITORED", "HVI", "OFFSIDE IS A STATE OF MIND", "STAY BEHIND THE LINE", "HVI", "YOUR SEAT IS ASSIGNED"];
function drawStand(ctx, cam, mood, t, reduced) {
  rect(ctx, 0, 0, W, H, PAL.bg);
  const rows = seats();
  for (let i = rows.length - 1; i >= 0; i--) {
    const R = rows[i], [, sy, s] = proj(cam, 0, R.y, R.z), [, ny] = proj(cam, 0, R.y - ROW_DY, R.z - ROW_DZ);
    if (sy > H) continue;
    box(ctx, 0, sy, W, ny + 1, R.r % 2 ? PAL.stand : PAL.standHi);
    const bw = Math.max(1, Math.round(0.45 * s)), bh = Math.max(1, Math.round(0.4 * s)), hw = Math.max(1, Math.round(0.3 * s));
    for (const p of R.seats) {
      const px = 160 + (p.x - cam.x) * s;
      if (px < -3 || px > W + 3) continue;
      let up = 0;
      const beat = reduced ? 0 : ((t + p.ph * 3) >> 3) & 1;
      if (mood === "roar" && p.keen > 0) up = 1 + beat;
      else if (mood === "cheer" && p.keen > 1) up = 1;
      const x0 = Math.round(px - bw / 2), y0 = Math.round(sy - bh - up);
      ctx.fillStyle = p.shirt; ctx.fillRect(x0, y0, bw, bh);
      ctx.fillStyle = p.skin; ctx.fillRect(Math.round(px - hw / 2), y0 - hw, hw, hw);
      if (up && s > 3) { ctx.fillRect(x0 - 1, y0 - hw - 1 - beat, 1, 2); ctx.fillRect(x0 + bw, y0 - hw - 1 - (1 - beat), 1, 2); }
    }
  }
  // the boards along the far touchline
  const by = P_.w + 3, [, bot] = proj(cam, 0, by, 0), top = bot - 8;
  let x = -60;
  BOARDS.concat(BOARDS).forEach((msg, i) => {
    const wM = msg.length * 1.75 + 3, a = proj(cam, x, by, 0)[0], b = proj(cam, x + wM, by, 0)[0];
    if (b > -2 && a < W + 2) { box(ctx, a, top, b - 1, bot, i % 2 ? PAL.boardAlt : PAL.board); text(ctx, msg, (a + b) / 2 - textW(msg) / 2, (top + bot) / 2 - 2, i % 2 ? PAL.boardInk : PAL.eye); }
    x += wM + 0.4;
  });
}

// ---- the pitch ------------------------------------------------------------------------------------------------
function drawPitch(ctx, cam) {
  const [, farY] = gp(cam, 0, P_.w + 3);
  box(ctx, 0, farY, W, H, PAL.edge);
  // mown stripes across the pitch, 12 of them a half
  const n = 20, w = (2 * P_.hx) / n;
  for (let i = 0; i < n; i++) {
    const x0 = -P_.hx + i * w, x1 = x0 + w;
    poly(ctx, [gp(cam, x0, -1), gp(cam, x1, -1), gp(cam, x1, P_.w + 1), gp(cam, x0, P_.w + 1)], i % 2 ? PAL.grassA : PAL.grassB);
  }
  const L = PAL.line, hx = P_.hx, cy = P_.cy;
  gline(ctx, cam, [[-hx, 0], [hx, 0], [hx, P_.w], [-hx, P_.w], [-hx, 0]], L);
  gline(ctx, cam, [[0, 0], [0, P_.w]], L);
  gline(ctx, cam, arc(0, cy, P_.circle, 0, Math.PI * 2, 40), L);
  for (const d of [-1, 1]) {
    const g = d * hx;
    gline(ctx, cam, [[g, cy - P_.boxW], [g - d * P_.boxD, cy - P_.boxW], [g - d * P_.boxD, cy + P_.boxW], [g, cy + P_.boxW]], L);
    gline(ctx, cam, [[g, cy - P_.sixW], [g - d * P_.sixD, cy - P_.sixW], [g - d * P_.sixD, cy + P_.sixW], [g, cy + P_.sixW]], L);
    // the D: the part of the arc outside the area
    const sx = g - d * P_.spot, k = (P_.boxD - P_.spot) / P_.circle, a = Math.acos(k);
    gline(ctx, cam, arc(sx, cy, P_.circle, d > 0 ? Math.PI - a : -a, d > 0 ? Math.PI + a : a, 16), L);
    const s = gp(cam, sx, cy); rect(ctx, s[0], s[1], 1, 1, L);
    for (const cyy of [0, P_.w]) gline(ctx, cam, arc(g, cyy, 1, d > 0 ? (cyy ? Math.PI : Math.PI / 2) : (cyy ? -Math.PI / 2 : 0), d > 0 ? (cyy ? Math.PI * 1.5 : Math.PI) : (cyy ? 0 : Math.PI / 2), 6), L);
  }
  const c = gp(cam, 0, cy); rect(ctx, c[0], c[1], 1, 1, L);
}
// The goal at end d: the back of the net first (behind the players), the frame after.
function drawGoalBack(ctx, cam, d) {
  const g = d * P_.hx, back = g + d * 2, y0 = P_.cy - P_.gw, y1 = P_.cy + P_.gw, Z = P_.bar;
  const q = (x, y, z) => proj(cam, x, y, z);
  // the net: back panel and roof as a mesh
  for (let i = 0; i <= 8; i++) { const y = y0 + ((y1 - y0) * i) / 8, a = q(back, y, 0), b = q(back, y, Z * 0.85), c = q(g, y, Z); line(ctx, a[0], a[1], b[0], b[1], PAL.net); line(ctx, b[0], b[1], c[0], c[1], PAL.net); }
  for (let j = 0; j <= 4; j++) { const z = (Z * 0.85 * j) / 4, a = q(back, y0, z), b = q(back, y1, z); line(ctx, a[0], a[1], b[0], b[1], PAL.net); }
  for (const y of [y0, y1]) { const a = q(g, y, Z), b = q(back, y, Z * 0.85), c = q(back, y, 0); line(ctx, a[0], a[1], b[0], b[1], PAL.net); line(ctx, b[0], b[1], c[0], c[1], PAL.net); }
  // the far post (behind everything nearer the camera)
  const fp = q(g, y1, 0), ft = q(g, y1, Z); box(ctx, fp[0] - Math.max(1, fp[2] * 0.06), ft[1], fp[0] + Math.max(1, fp[2] * 0.06), fp[1], PAL.post);
}
function drawGoalFront(ctx, cam, d) {
  const g = d * P_.hx, y0 = P_.cy - P_.gw, y1 = P_.cy + P_.gw, Z = P_.bar;
  const np = proj(cam, g, y0, 0), nt = proj(cam, g, y0, Z), ft = proj(cam, g, y1, Z), w = Math.max(1, np[2] * 0.07);
  box(ctx, np[0] - w, nt[1], np[0] + w, np[1], PAL.post);
  line(ctx, nt[0], nt[1], ft[0], ft[1], PAL.post); line(ctx, nt[0], nt[1] + 1, ft[0], ft[1] + 1, PAL.post);
  // the corner flags
  for (const y of [0, P_.w]) { const b = proj(cam, g, y, 0), t = proj(cam, g, y, 1.5); line(ctx, b[0], b[1], t[0], t[1], PAL.post); rect(ctx, t[0], t[1], Math.max(2, t[2] * 0.4), Math.max(1, t[2] * 0.25), PAL.flag); }
}

// ---- the players ------------------------------------------------------------------------------------------------
// look: {shirt, shorts, socks, num, skin, hair, head (canvas | null)}
function drawPlayer(ctx, cam, P, look, frame, ctl, ball) {
  const [gx, gy, s0] = proj(cam, P.x, P.y, 0);
  if (gx < -30 || gx > W + 30 || P.off) return;
  const s = s0 * BIG, k = s * 0.9, act = P.act?.kind, by = gy - (P.z || 0) * s0;
  // the shadow on the grass
  rect(ctx, gx - 0.3 * s, gy - Math.max(1, 0.05 * s), 0.6 * s, Math.max(1, 0.1 * s), PAL.shadow);
  if (ctl) { const w = Math.round(0.9 * s); rect(ctx, gx - w / 2, gy + 1, w, 1, PAL.mark); }
  const R = (xm, zm, wm, hm, c) => box(ctx, gx + xm * k, by - (zm + hm) * k, gx + (xm + wm) * k, by - zm * k, c);
  const face = P.fx >= 0 ? 1 : -1, sk = look.skin;
  const hh = Math.max(3, Math.round(0.5 * s)), hw = hh;
  const headAt = (cx, top) => {
    if (look.head) { const hd = hh < look.head.height ? shrinkHead(look.head, hh) : look.head, w = Math.max(2, Math.round((hd.width * hh) / hd.height)); ctx.drawImage(hd, Math.round(cx - w / 2), Math.round(top), w, hh); }
    else { box(ctx, cx - hw / 2, top, cx + hw / 2, top + hh, sk); box(ctx, cx - hw / 2, top, cx + hw / 2, top + Math.max(1, hh / 3), look.hair || "#2a1a10"); }
  };
  if (act === "slide" || act === "down" || (act === "dive" && P.z > 0.05) || act === "dive") {
    // on the ground (or flying across goal): the body laid along its facing on screen
    const dir = act === "dive" ? (P.act.dir > 0 ? -1 : 1) * 0 + face : face;
    const L = 1.5 * k, y = act === "dive" ? by - (0.5 + (P.act.hi ? 0.7 : 0)) * k : gy - 0.35 * k;
    box(ctx, gx - (dir > 0 ? 0.4 * L : 0.6 * L), y - 0.3 * k, gx + (dir > 0 ? 0.6 * L : 0.4 * L), y, look.shirt);
    box(ctx, gx + dir * 0.35 * L - 0.12 * L, y - 0.3 * k, gx + dir * 0.35 * L + 0.12 * L, y, look.shorts);
    const hx = gx - dir * 0.55 * L;
    headAt(hx, y - 0.3 * k - hh * 0.8);
    return;
  }
  const run = Math.abs(P.vx || 0) + Math.abs(P.vy || 0) > 0.6 ? ((frame + P.g * 3) >> 3) & 1 : 0;
  // boots, socks, legs, shorts, shirt
  const kick = act === "kick" && P.act.f < 8;
  R(-0.2, 0, 0.16, 0.08, "#1a1a1a"); R(0.04 + (kick ? face * 0.15 : 0), kick ? 0.12 : 0, 0.16, 0.08, "#1a1a1a");
  R(-0.18, 0.08 + run * 0.04, 0.12, 0.3, look.socks); R(0.06 + (kick ? face * 0.12 : 0), 0.08 + (1 - run) * 0.04 + (kick ? 0.1 : 0), 0.12, 0.3, look.socks);
  R(-0.18, 0.38 + run * 0.04, 0.12, 0.2, sk); R(0.06, 0.38 + (1 - run) * 0.04, 0.12, 0.2, sk);
  R(-0.22, 0.56, 0.44, 0.24, look.shorts);
  R(-0.24, 0.8, 0.48, 0.6, look.shirt);
  if (k >= 9 && look.num) { const n = String(look.num); text(ctx, n, gx - textW(n) / 2, by - 1.28 * k, look.trim); }
  const up = act === "celebrate" || act === "head";
  if (up) { R(-0.34, 1.3, 0.1, 0.45, look.shirt); R(0.24, 1.3, 0.1, 0.45, look.shirt); R(-0.34, 1.72, 0.1, 0.1, sk); R(0.24, 1.72, 0.1, 0.1, sk); }
  else if (act === "throw") { R(-0.3, 1.35, 0.1, 0.4, look.shirt); R(0.2, 1.35, 0.1, 0.4, look.shirt); }
  else if (act === "hold") { R(face > 0 ? 0.18 : -0.34, 0.95, 0.16, 0.12, sk); }
  else { R(-0.32, 0.86 + run * 0.06, 0.09, 0.48, look.shirt); R(0.23, 0.86 + (1 - run) * 0.06, 0.09, 0.48, look.shirt); }
  if (P.role === "GK") { R(-0.34, 0.84, 0.1, 0.08, look.gloves || "#e6e6e6"); R(0.24, 0.84, 0.1, 0.08, look.gloves || "#e6e6e6"); }
  // the head, a little big
  const top = Math.round(by - 1.38 * k) - hh + 1;
  headAt(gx, top);
  if (P.yc && !P.off && k > 6) rect(ctx, gx + hw / 2 + 1, top, 1, 2, PAL.yel);
  if (ctl) {
    const mx = Math.round(gx), my = top - 5 - ((frame >> 4) & 1);
    rect(ctx, mx - 2, my, 5, 1, PAL.mark); rect(ctx, mx - 1, my + 1, 3, 1, PAL.mark); rect(ctx, mx, my + 2, 1, 1, PAL.mark);
  }
  void ball;
}
function drawBall(ctx, cam, b) {
  const g = proj(cam, b.x, b.y, 0), p = proj(cam, b.x, b.y, b.z + 0.11), bs = Math.max(2, Math.round(0.3 * p[2] * 1.2));
  rect(ctx, g[0] - bs / 2, g[1] - 1, bs, Math.max(1, bs / 3), PAL.shadow);
  const x0 = Math.round(p[0] - bs / 2), y0 = Math.round(p[1] - bs / 2);
  rect(ctx, x0, y0, bs, bs, PAL.ball);
  if (bs >= 3) { rect(ctx, x0 + 1, y0 + 1, 1, 1, PAL.ballDk); rect(ctx, x0 + bs - 1, y0 + bs - 1, 1, 1, "#9a9a9a"); }
}

// ---- the overlays: power bar, aim, radar ---------------------------------------------------------------------------
function drawPower(ctx, cam, P, f, full, color = "#ffd040") {
  const [gx, gy, s0] = proj(cam, P.x, P.y, 0), s = s0 * BIG, x = Math.round(gx - 10), y = Math.round(gy + 3);
  const k = Math.min(1, f / full);
  rect(ctx, x - 1, y - 1, 22, 5, PAL.outline);
  rect(ctx, x, y, 20, 3, "#2a2a2a");
  rect(ctx, x, y, Math.round(20 * k), 3, k > 0.85 ? "#e05050" : color);
  rect(ctx, x + 16, y, 1, 3, "#ffffff");
  void s;
}
function drawAim(ctx, cam, v, aim, T) {
  const a = v.attOf(T), g = a * P_.hx, p = proj(cam, g, aim.y, aim.z);
  const c = (v.frame >> 3) & 1 ? PAL.mark : "#ffffff";
  rect(ctx, p[0] - 3, p[1], 7, 1, c); rect(ctx, p[0], p[1] - 3, 1, 7, c);
  if (aim.curl) { const t = `CURL ${aim.curl > 0 ? "+" : ""}${aim.curl}`; textO(ctx, t, Math.max(1, Math.min(W - textW(t) - 1, p[0] - textW(t) / 2)), p[1] - 12, PAL.mark); }
}
function drawRadar(ctx, v, kits, ctl) {
  const w = 56, h = 36, x0 = Math.round(W / 2 - w / 2), y0 = H - h - 2;
  ctx.globalAlpha = 0.55; rect(ctx, x0, y0, w, h, "#0a1a0c"); ctx.globalAlpha = 1;
  const X = (x) => x0 + ((x + P_.hx) / (2 * P_.hx)) * (w - 1), Y = (y) => y0 + h - 1 - (y / P_.w) * (h - 1);
  line(ctx, X(0), y0, X(0), y0 + h - 1, "#2f5a33");
  for (const P of v.p) if (!P.off) { const c = P.g === ctl; rect(ctx, X(P.x), Y(P.y), c ? 2 : 1, c ? 2 : 1, c ? PAL.mark : kits[P.t]); }
  rect(ctx, X(v.ball.x), Y(v.ball.y), 1, 1, "#ffffff");
}

// The frame. v: the view (the sim's state or a snapshot, with attOf(t)). looks: [22]. o: {cam, frame, mood,
// moodT, reduced, kits [2 radar colours], ctl (g or -1), power {g, f, full} | null, aim {y, z, curl, team} | null,
// radar, banner}.
export function draw(ctx, v, looks, o) {
  const cam = o.cam;
  ctx.imageSmoothingEnabled = false;
  drawStand(ctx, cam, o.mood, o.moodT || 0, o.reduced);
  drawPitch(ctx, cam);
  const items = [];
  for (const d of [-1, 1]) { items.push({ y: P_.cy + P_.gw + 0.1, f: () => drawGoalBack(ctx, cam, d) }); items.push({ y: P_.cy - P_.gw - 0.2, f: () => drawGoalFront(ctx, cam, d) }); }
  for (const P of v.p) if (!P.off) items.push({ y: P.y, f: () => drawPlayer(ctx, cam, P, looks[P.g], o.frame, o.ctl === P.g, v.ball) });
  const b = v.ball;
  items.push({ y: b.y - 0.05, f: () => drawBall(ctx, cam, b) });
  items.sort((p, q) => q.y - p.y);
  for (const it of items) it.f();
  if (o.power) { const P = v.p[o.power.g]; if (P) drawPower(ctx, cam, P, o.power.f, o.power.full, o.power.color); }
  if (o.aim) drawAim(ctx, cam, v, o.aim, o.aim.team);
  if (o.radar) drawRadar(ctx, v, o.kits || ["#ffffff", "#ff4040"], o.ctl);
  if (o.banner) { const t = o.banner; rect(ctx, 0, 6, W, 11, "rgba(10,15,10,0.8)"); textO(ctx, t, W / 2 - textW(t) / 2, 9, PAL.mark); }
}
export { SHOT_FULL };
