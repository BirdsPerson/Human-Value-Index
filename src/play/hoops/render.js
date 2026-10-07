// THE COURTS, playable: the picture. Browser only; reads the sim's state and never writes it.
// 320 x 200 logical pixels, fillRect and a few polygon fills, scaled by whole device pixels with
// smoothing off.
//
// The view (CAMS below; 2K is the default): a true perspective look-at camera. A pinhole at p looks
// at a target t (up = +z), focal length F, the optical centre in the middle of the frame. A point
// lands at x' = W/2 + X * F / d, y' = H/2 - Y * F / d, where (X, Y, d) is the point in the camera's
// frame (right, up, depth): one scale per depth for width, height and jump alike, so players, ball,
// rims and stands all shrink together with distance. Anything nearer than NEAR is clipped (floor
// polygons and lines in 3D against the near plane; billboards are skipped), so a camera can stand
// on the court (DRIVE, LOW) without the floor exploding. The camera eases toward where its preset
// wants it each frame (render-only; the sim never sees it). The heads are drawn a little large
// (0.5 m), the 16-bit habit, so a face reads at this size.
import { COURT as C, TOP, FT_TOP, dirOf, greenOf, kindAt, LEVELS, contestOf } from "./engine/index.js";
import { shrinkHead } from "../heads.js";
import { slotsAt } from "../../ads/inventory.js";
import { drawAdBoard, adGround } from "../../ads/boards.js";

export const W = 320, H = 200;
const NEAR = 0.4;

// ---- cameras --------------------------------------------------------------------------------------
// Each preset is a function of the focus (the ball, or the man with it), the half-court flag and the
// player's adjustments -> {p, t, F}. ZOOM scales F, HEIGHT the camera's elevation (the target stays,
// so the pitch follows), FOLLOW how far and how fast it tracks the ball.
export const CAMS = {
  "2k": { name: "2K", track: 0.85, limit: 9, rate: 0.07 },
  broadcast: { name: "BROADCAST", track: 0.6, limit: 7, rate: 0.04 },
  steady: { name: "STEADY", track: 0.8, limit: 6, rate: 0.03 },
  high: { name: "HIGH", track: 0.7, limit: 7.5, rate: 0.06 },
  low: { name: "LOW", track: 0.85, limit: 9, rate: 0.08 },
  drive: { name: "DRIVE", track: 1, limit: 99, rate: 0.12 },
  baseline: { name: "BASELINE", track: 1, limit: 99, rate: 0.07 },
  skybox: { name: "SKYBOX", track: 0.7, limit: 6, rate: 0.05 },
};
export const CAM_ORDER = ["2k", "broadcast", "steady", "high", "low", "drive", "baseline", "skybox"];
export const DEFAULT_CAM = "2k";
export const ADJ_DEFAULT = { zoom: 5, height: 5, follow: 5 };
const adjOf = (a) => {
  const A = { ...ADJ_DEFAULT, ...(a || {}) }, cl = (v) => Math.max(0, Math.min(10, Number(v) || 0));
  const z = cl(A.zoom), h = cl(A.height), f = cl(A.follow);
  return { zk: z <= 5 ? 0.7 + 0.06 * z : 1 + 0.09 * (z - 5), hk: h <= 5 ? 0.5 + 0.1 * h : 1 + 0.12 * (h - 5), fk: f / 5 };
};
const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);
// the focus: the ball (held: its handler), and the side attacking
function focusOf(st) {
  if (!st) return { bx: 0, by: C.cy, d: 1, half: false, H: null };
  const b = st.ball, half = Boolean(st.half);
  let H = b.st === "held" && b.own >= 0 ? st.p[b.own] : null;
  const bx = H ? H.x : b.x, by = H ? H.y : b.y;
  const t = H ? H.t : st.poss >= 0 ? st.poss : bx >= 0 ? 0 : 1;
  const d = half ? 1 : H ? (H.d ?? dirOf(H.t)) : dirOf(t);
  return { bx: Number.isFinite(bx) ? bx : 0, by: Number.isFinite(by) ? by : C.cy, d, half, H };
}
function wantOf(id, st, adj) {
  const P = CAMS[id] || CAMS[DEFAULT_CAM], { zk, hk, fk } = adjOf(adj), F = focusOf(st);
  // the half court: framed on the half in play (the top of the key to the rim), drifting a little with the ball
  const base = F.half ? 8.4 : 0, k = Math.min(1.25, P.track * fk) * (F.half ? 0.4 : 1);
  const tx = base + clampN((F.bx - base) * k, -P.limit, P.limit);
  const half = F.half;
  switch (CAMS[id] ? id : DEFAULT_CAM) {
    case "broadcast": return { p: [base + (tx - base) * 0.7, -25, 13 * hk], t: [tx, 7.2, 0], F: 540 * zk };
    case "steady": {
      const off = F.bx - base, sx = base + Math.sign(off) * Math.max(0, Math.abs(off) - (half ? 3 : 5)) * 0.8 * Math.min(1.5, fk);
      const x = clampN(sx, base - P.limit, base + P.limit);
      return { p: [x, -15, 9.5 * hk], t: [x, 7.2, 0], F: 330 * zk };
    }
    case "high": return { p: [tx, -9, 17 * hk], t: [tx, 8.3, 0], F: 300 * zk };
    case "low": return { p: [tx * 0.92 + (half ? 0.5 : 0), -5.5, 2.4 * hk], t: [base + clampN((F.bx - base) * Math.min(1.25, fk), -11, 11), 9.5, 1.1], F: 215 * zk };
    case "drive": {
      const H = F.H, x = H ? H.x : F.bx, y = H ? H.y : F.by, d = F.d, lag = 0.4 + 0.6 * Math.min(1.5, fk);
      return { p: [x - d * 5.2, y + (C.cy - y) * 0.2 * lag, 3.6 * hk], t: [x + d * 4.5, y + (C.cy - y) * 0.5, 0.9], F: 200 * zk };
    }
    case "baseline": {
      const d = F.d, f = Math.min(1.25, fk);
      return { p: [d * (C.hx + 5), C.cy + (F.by - C.cy) * 0.3 * f, 7.2 * hk], t: [d * C.rimX + (F.bx - d * C.rimX) * 0.55 * f - d * 3, C.cy + (F.by - C.cy) * 0.6 * f, 0.5], F: 225 * zk };
    }
    case "skybox": return { p: [tx, C.cy - 4, 22 * hk], t: [tx, C.cy + 0.6, 0], F: 330 * zk };
    default: {   // 2K: side-on, across the court, leaning toward the basket the ball is going at so the rim stays in frame
      const x = F.half ? tx : clampN(tx + Math.sign(F.bx) * Math.min(2.4, Math.abs(F.bx) * 0.4) * Math.min(1, fk), -P.limit - 1.5, P.limit + 1.5);
      return { p: [x, -13, 10.5 * hk], t: [x, 6.6, 0], F: 350 * zk };
    }
  }
}
// The eased state the page keeps between frames: {id, p, t, F, fresh}. adj optional.
export function camStart(id, adj) {
  const k = CAMS[id] ? id : DEFAULT_CAM, w = wantOf(k, null, adj);
  return { id: k, p: w.p, t: w.t, F: w.F, fresh: true };
}
export function camFollow(c, st, adj) {
  const id = CAMS[c?.id] ? c.id : DEFAULT_CAM, w = wantOf(id, st, adj), P = CAMS[id], { fk } = adjOf(adj);
  if (!c || c.fresh || !c.p) return { id, p: w.p, t: w.t, F: w.F, fresh: false };
  const r = P.rate * (0.25 + 0.75 * Math.min(1.6, fk)), mix = (a, b) => a.map((v, i) => v + (b[i] - v) * r);
  return { id, p: mix(c.p, w.p), t: mix(c.t, w.t), F: c.F + (w.F - c.F) * 0.08, fresh: false };
}
export function camOf(c) {
  const p = c.p || [0, -14, 9], t = c.t || [0, 7, 0];
  let f = [t[0] - p[0], t[1] - p[1], t[2] - p[2]];
  const fl = Math.hypot(f[0], f[1], f[2]) || 1; f = f.map(v => v / fl);
  let r = [f[1], -f[0], 0]; const rl = Math.hypot(r[0], r[1]);
  r = rl < 1e-4 ? [1, 0, 0] : [r[0] / rl, r[1] / rl, 0];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { px: p[0], py: p[1], pz: p[2], F: c.F || 330, cx: W / 2, cy: H / 2, f, r, u, id: c.id };
}
// -> camera space [X, Y, d]
const toCam = (x, y, z, k) => { const vx = x - k.px, vy = y - k.py, vz = z - k.pz; return [vx * k.r[0] + vy * k.r[1] + vz * k.r[2], vx * k.u[0] + vy * k.u[1] + vz * k.u[2], vx * k.f[0] + vy * k.f[1] + vz * k.f[2]]; };
const fromCam = (q, k) => { const s = k.F / q[2]; return [k.cx + q[0] * s, k.cy - q[1] * s, s, q[2]]; };
// -> [sx, sy, s, depth]; depth < NEAR means behind the near plane (do not draw it)
export function proj(x, y, z, k) {
  const q = toCam(x, y, z, k), d = Math.max(NEAR * 0.5, q[2]), s = k.F / d;
  return [k.cx + q[0] * s, k.cy - q[1] * s, s, q[2]];
}
const vis = (p) => p[3] >= NEAR;
// Sutherland-Hodgman against the near plane, in camera space -> screen points
function clipPoly(pts3, k) {
  const q = pts3.map(([x, y, z]) => toCam(x, y, z, k)), out = [];
  for (let i = 0; i < q.length; i++) {
    const a = q[i], b = q[(i + 1) % q.length], ia = a[2] >= NEAR, ib = b[2] >= NEAR;
    if (ia) out.push(a);
    if (ia !== ib) { const s = (NEAR - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, NEAR]); }
  }
  return out.map(v => fromCam(v, k));
}
function clipSeg(a3, b3, k) {
  let a = toCam(a3[0], a3[1], a3[2], k), b = toCam(b3[0], b3[1], b3[2], k);
  if (a[2] < NEAR && b[2] < NEAR) return null;
  if (a[2] < NEAR) { const s = (NEAR - a[2]) / (b[2] - a[2]); a = [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, NEAR]; }
  else if (b[2] < NEAR) { const s = (NEAR - b[2]) / (a[2] - b[2]); b = [b[0] + (a[0] - b[0]) * s, b[1] + (a[1] - b[1]) * s, NEAR]; }
  return [fromCam(a, k), fromCam(b, k)];
}

const PAL = {
  bg: "#0a0f0a", riser: "#141a24", riserHi: "#1a2130", floorDk: "#3a281a", apron: "#5c3b22", wood: "#c8945a", woodB: "#bb8850", grain: "#d6a46a",
  line: "#f2efe6", rim: "#e0581c", rimDk: "#9a3a10", net: "#e6e6e6", glass: "#bcd3df", glassEdge: "#f2f7fa", pole: "#3d4350", pad: "#1f2f5a",
  ball: "#d9692a", ballDk: "#7a3410", shadow: "#6e4a2a", skin: "#c68c5e", shoe: "#e6e6e6", outline: "#0a0f0a", mark: "#ffe14a",
  board: "#0d1310", boardInk: "#c8f5d8", boardAlt: "#1f4a2c", clock: "#ff4a3a", clockBox: "#141414", eye: "#5cff8a",
};
const SHIRTS = ["#b83232", "#3a6fd8", "#e6e6e6", "#e0c040", "#3c8a46", "#d97a2b", "#6b3fa0", "#d977a8", "#8a8a8a", "#45618f", "#262626", "#d9ccb0"];
const SKINS = ["#f6d5bc", "#f1c9a5", "#e0b088", "#c68c5e", "#8d5a36", "#5c3a22"];
const hash = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, "0");
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}
const lumOf = (h) => { const n = parseInt(String(h).slice(1), 16); return 0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255); };

function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
// edges rounded independently, so neighbouring parts meet without gaps
function box(ctx, x0, y0, x1, y1, c) { const a = Math.round(x0), b = Math.round(y0), w = Math.round(x1) - a, h = Math.round(y1) - b; if (w <= 0 || h <= 0) return; ctx.fillStyle = c; ctx.fillRect(a, b, w, h); }
function line(ctx, x0, y0, x1, y1, c, wpx = 1) {
  ctx.fillStyle = c;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  // keep the walk on (and near) the frame
  if ((x0 < -50 && x1 < -50) || (x0 > W + 50 && x1 > W + 50) || (y0 < -50 && y1 < -50) || (y0 > H + 50 && y1 > H + 50)) return;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let k = 0; k < 1200; k++) {
    if (x0 >= -2 && x0 <= W + 2 && y0 >= -2 && y0 <= H + 2) ctx.fillRect(x0, y0, wpx, wpx);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function poly2(ctx, pts, c) {
  if (pts.length < 3) return;
  ctx.fillStyle = c; ctx.beginPath();
  pts.forEach(([x, y], i) => { if (i) ctx.lineTo(Math.round(x), Math.round(y)); else ctx.moveTo(Math.round(x), Math.round(y)); });
  ctx.closePath(); ctx.fill();
}
// a world polygon, clipped at the near plane
const polyW = (ctx, pts3, cam, c) => poly2(ctx, clipPoly(pts3, cam), c);
const lineW = (ctx, a3, b3, cam, c, wpx = 1) => { const s = clipSeg(a3, b3, cam); if (s) line(ctx, s[0][0], s[0][1], s[1][0], s[1][1], c, wpx); };
const floorQuad = (ctx, x0, y0, x1, y1, cam, c) => polyW(ctx, [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], cam, c);
function floorLine(ctx, pts, cam, c) { for (let i = 1; i < pts.length; i++) lineW(ctx, [pts[i - 1][0], pts[i - 1][1], 0], [pts[i][0], pts[i][1], 0], cam, c); }
const arc = (cx, cy, r, a0, a1, n = 24) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });

// ---- a 3 x 5 type, for the boards, the shot clocks and the meter's word -----------------------------
const GL = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111", F: "111100110100100",
  G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111",
  M: "101111111101101", N: "110101101101101", O: "010101101101010", P: "110101110100100", Q: "010101101110011", R: "110101110101101",
  S: "011100010001110", T: "111010010010010", U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101",
  Y: "101101010010010", Z: "111001010100111", 0: "111101101101111", 1: "010110010010111", 2: "110001010100111", 3: "110001010001110",
  4: "101101111001001", 5: "111100110001110", 6: "011100111101111", 7: "111001010010010", 8: "111101111101111", 9: "111101111001110",
  ".": "000000000000010", "-": "000000111000000", ":": "000010000010000", "!": "010010010000010", "/": "001001010100100",
  "+": "000010111010000", "−": "000000111000000",
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
function textOutlined(ctx, s, x, y, c, k = 1, o = PAL.outline) {
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) text(ctx, s, x + ox, y + oy, o, k);
  text(ctx, s, x, y, c, k);
}

// ---- the stands: a tall far stand and two end stands, every seat counted -------------------------------
const STAND_Y0 = C.w + 2.6, ROW_DY = 0.85, ROW_DZ = 0.55, ROWS = 26, SEAT_DX = 0.8, STAND_X = 30;
const END_X0 = C.hx + 3.4, END_ROWS = 16, END_Y0 = -5, END_Y1 = C.w + 2.4;
let SEATS = null;
function seatOf(x, key, r) {
  const h = hash(Math.round(x * 10) + key, r + 3);
  if (h % 9 === 0) return null;   // an empty seat
  // the house lights are on the floor: the stand is in shadow, darker the higher it goes
  const dim = 0.62 - r * 0.012;
  return { shirt: shade(SHIRTS[h % SHIRTS.length], dim), skin: shade(SKINS[(h >>> 5) % SKINS.length], dim + 0.12), ph: (h >>> 9) % 16, keen: (h >>> 13) % 4 };
}
function seats() {
  if (SEATS) return SEATS;
  const rows = [];
  // the far stand: rows along x, rising away in y
  for (let r = 0; r < ROWS; r++) {
    const y = STAND_Y0 + r * ROW_DY, z = 0.55 + r * ROW_DZ, out = [];
    for (let x = -STAND_X + (r % 2) * SEAT_DX * 0.5; x <= STAND_X; x += SEAT_DX) { const s = seatOf(x, 0, r); if (s) out.push({ ...s, x, y, z }); }
    rows.push({ r, z, quad: [[-STAND_X, y, z], [STAND_X, y, z], [STAND_X, y - ROW_DY, z - ROW_DZ], [-STAND_X, y - ROW_DY, z - ROW_DZ]], seats: out });
  }
  // the end stands: rows along y behind each baseline, rising away in x
  for (const d of [-1, 1]) for (let r = 0; r < END_ROWS; r++) {
    const x = d * (END_X0 + r * ROW_DY), z = 0.55 + r * ROW_DZ, out = [];
    for (let y = END_Y0 + (r % 2) * SEAT_DX * 0.5; y <= END_Y1; y += SEAT_DX) { const s = seatOf(y, d * 977, r); if (s) out.push({ ...s, x, y, z }); }
    rows.push({ r, z, quad: [[x, END_Y0, z], [x, END_Y1, z], [x - d * ROW_DY, END_Y1, z - ROW_DZ], [x - d * ROW_DY, END_Y0, z - ROW_DZ]], seats: out });
  }
  SEATS = rows;
  return rows;
}
// The far apron's boards: the inventory's courts-apron-* slots (src/ads/inventory.js), six of 9 m.
// The ground's name, one small Electric Basement board, the rest AVAILABLE (some left bare).
const APRON = slotsAt("hoops");
const FONT = { text, textW };
function drawStands(ctx, cam, fx, reduced) {
  const rows = seats(), mood = fx?.mood || "idle", t = fx?.t || 0;
  // the farthest rows first: by the depth of each row's middle
  const order = rows.map(R => { const m = R.quad[0], n = R.quad[1]; return [toCam((m[0] + n[0]) / 2, (m[1] + n[1]) / 2, R.z, cam)[2], R]; }).sort((a, b) => b[0] - a[0]);
  // the risers first, then the people on them (a riser seen end-on must not cover the next row's seats)
  for (const [dep, R] of order) if (dep > -40) polyW(ctx, R.quad, cam, R.r % 2 ? PAL.riser : PAL.riserHi);
  for (const [dep, R] of order) {
    if (dep < -40) continue;
    for (const p of R.seats) {
      const q = toCam(p.x, p.y, p.z, cam);
      if (q[2] < 1) continue;
      const s = cam.F / q[2], px = cam.cx + q[0] * s, py = cam.cy - q[1] * s;
      if (px < -4 || px > W + 4 || py < -4 || py > H + 6) continue;
      const bw = Math.max(1, Math.round(0.42 * s)), bh = Math.max(1, Math.round(0.36 * s)), hw = Math.max(1, Math.round(0.26 * s));
      let up = 0;
      const beat = reduced ? 0 : ((t + p.ph * 3) >> 3) & 1;
      if (mood === "cheer" && p.keen > 0) up = 1 + beat;
      else if (mood === "stand" && p.keen > 1) up = 1;
      const x0 = Math.round(px - bw / 2), y0 = Math.round(py - bh - up);
      ctx.fillStyle = p.shirt; ctx.fillRect(x0, y0, bw, bh);
      ctx.fillStyle = p.skin; ctx.fillRect(Math.round(px - hw / 2), y0 - hw, hw, hw);
      if (mood === "groan" && p.keen > 1) { ctx.fillStyle = "#0a0f0a"; ctx.fillRect(Math.round(px - hw / 2), y0 - hw, hw, 1); }   // heads down
      if (up && s > 4) { ctx.fillStyle = p.skin; ctx.fillRect(x0 - 1, y0 - hw - 1 - beat, 1, 2); ctx.fillRect(x0 + bw, y0 - hw - 1 - (1 - beat), 1, 2); }
    }
  }
  // the front of the far stand: the boards along the far apron
  for (const slot of APRON) {
    const { x0, x1, y } = slot.at, a = proj(x0, y, 0, cam), b = proj(x1, y, 0, cam), at = proj(x0, y, 0.85, cam), bt = proj(x1, y, 0.85, cam);
    if (!vis(a) || !vis(b)) continue;
    const lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]);
    if (hi < -2 || lo > W + 2) continue;
    const pal = { board: PAL.boardAlt, ink: PAL.boardInk, dim: "#4f8a62" };
    poly2(ctx, [at, bt, b, a], adGround(slot, pal));
    // the content upright at the board's middle, as tall as its shorter end (only when it reads left to right)
    const h = Math.min(a[1] - at[1], b[1] - bt[1]), cy = (at[1] + a[1] + bt[1] + b[1]) / 4;
    if (b[0] > a[0] && h >= 2) drawAdBoard(ctx, slot, a[0], cy - h / 2, b[0] - a[0], h, FONT, pal, { ground: false });
  }
}

// ---- the floor -----------------------------------------------------------------------------------
function drawFloor(ctx, cam, paint, half) {
  floorQuad(ctx, -C.hx - 7, -9, C.hx + 7, C.w + 2.5, cam, PAL.floorDk);
  floorQuad(ctx, -C.hx - 2.2, -3, C.hx + 2.2, C.w + 1.9, cam, PAL.apron);
  // the boards of the court: planks across the depth, a little grain
  for (let y = 0, k = 0; y < C.w; y += 0.6, k++) floorQuad(ctx, -C.hx, y, C.hx, Math.min(C.w, y + 0.6), cam, k % 2 ? PAL.wood : PAL.woodB);
  for (let i = 0; i < 90; i++) {
    const h = hash(i, 77), x = ((h % 2860) / 100) - C.hx, y = ((h >>> 12) % 1524) / 100, p = proj(x, y, 0, cam);
    if (vis(p) && p[0] >= 0 && p[0] < W && p[1] >= 0 && p[1] < H) rect(ctx, p[0], p[1], Math.max(1, p[2] * 0.6), 1, PAL.grain);
  }
  // the paint, the centre circle
  for (const d of [-1, 1]) floorQuad(ctx, d * C.ftX, C.cy - C.laneHW, d * C.hx, C.cy + C.laneHW, cam, paint);
  polyW(ctx, arc(0, C.cy, 1.8, 0, Math.PI * 2, 32).map(([x, y]) => [x, y, 0]), cam, paint);
  const L = PAL.line;
  floorLine(ctx, [[-C.hx, 0], [C.hx, 0], [C.hx, C.w], [-C.hx, C.w], [-C.hx, 0]], cam, L);
  floorLine(ctx, [[0, 0], [0, C.w]], cam, L);
  floorLine(ctx, arc(0, C.cy, 1.8, 0, Math.PI * 2, 32), cam, L);
  for (const d of [-1, 1]) {
    floorLine(ctx, [[d * C.hx, C.cy - C.laneHW], [d * C.ftX, C.cy - C.laneHW], [d * C.ftX, C.cy + C.laneHW], [d * C.hx, C.cy + C.laneHW]], cam, L);
    floorLine(ctx, arc(d * C.ftX, C.cy, 1.8, 0, Math.PI * 2, 28), cam, L);
    const rx = d * C.rimX, a = Math.asin(C.corner / C.three);   // where the arc meets the corner lines
    floorLine(ctx, [[d * C.hx, C.cy - C.corner], [d * C.cornerX, C.cy - C.corner]], cam, L);
    floorLine(ctx, [[d * C.hx, C.cy + C.corner], [d * C.cornerX, C.cy + C.corner]], cam, L);
    const base = d > 0 ? Math.PI : 0;
    floorLine(ctx, arc(rx, C.cy, C.three, base - a, base + a, 40), cam, L);
    floorLine(ctx, arc(rx, C.cy, 1.22, base - Math.PI / 2, base + Math.PI / 2, 14), cam, L);
  }
  // the Department's eye at centre court
  const c = proj(0, C.cy, 0, cam);
  if (vis(c)) { rect(ctx, c[0] - 0.5 * c[2], c[1] - 1, c[2], 2, PAL.outline); rect(ctx, c[0] - 1, c[1] - 1, 2, 2, PAL.eye); }
  // half court: the far half is not in play; dim it
  if (half) { ctx.globalAlpha = 0.5; floorQuad(ctx, -C.hx - 2.2, -3, 0, C.w + 1.9, cam, PAL.bg); ctx.globalAlpha = 1; }
}

// ---- the baskets ------------------------------------------------------------------------------------
const BOARD_X = 13.105, BOARD_HW = 0.915, BOARD_Z0 = 2.9, BOARD_Z1 = 3.97, POLE_X = C.hx + 1.25;
function drawStanchion(ctx, d, cam, st) {
  const pb = proj(d * POLE_X, C.cy, 0, cam), pt = proj(d * POLE_X, C.cy, 3.75, cam), s = pb[2];
  // the padded base and the pole
  const B = (x0, x1, y0, y1, z0, z1) => [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]];
  const xa = d * (POLE_X - 0.5), xb = d * (POLE_X + 0.6);
  polyW(ctx, B(xa, xb, C.cy - 0.6, 0, 0, 0.95), cam, PAL.pad);
  polyW(ctx, [[xa, C.cy - 0.6, 0], [xa, C.cy + 0.6, 0], [xa, C.cy + 0.6, 0.95], [xa, C.cy - 0.6, 0.95]], cam, shade(PAL.pad, 0.8));
  polyW(ctx, [[xa, C.cy - 0.6, 0.95], [xb, C.cy - 0.6, 0.95], [xb, C.cy + 0.6, 0.95], [xa, C.cy + 0.6, 0.95]], cam, shade(PAL.pad, 1.4));
  if (vis(pb) && vis(pt)) box(ctx, pb[0] - Math.max(1, 0.09 * s), pt[1], pb[0] + Math.max(1, 0.09 * s), pb[1] - 0.95 * s * 0.9, PAL.pole);
  // the arm out to the board
  lineW(ctx, [d * POLE_X, C.cy, 3.75], [d * (BOARD_X + 0.05), C.cy, 3.6], cam, PAL.pole, 2);
  // the board: a pane of glass across the lane; seen at an angle from the side, face-on from the end
  const q = [[C.cy - BOARD_HW, BOARD_Z0], [C.cy + BOARD_HW, BOARD_Z0], [C.cy + BOARD_HW, BOARD_Z1], [C.cy - BOARD_HW, BOARD_Z1]].map(([y, z]) => [d * BOARD_X, y, z]);
  ctx.globalAlpha = 0.6; polyW(ctx, q, cam, PAL.glass); ctx.globalAlpha = 1;
  for (let i = 0; i < 4; i++) lineW(ctx, q[i], q[(i + 1) % 4], cam, PAL.glassEdge);
  const sq = [[C.cy - 0.3, 3.05], [C.cy + 0.3, 3.05], [C.cy + 0.3, 3.5], [C.cy - 0.3, 3.5]].map(([y, z]) => [d * (BOARD_X - 0.01), y, z]);
  for (let i = 0; i < 4; i++) lineW(ctx, sq[i], sq[(i + 1) % 4], cam, PAL.clock);
  // the shot clock over the board (half court: only over the basket in play)
  if (st.half && d < 0) return;
  const sc = proj(d * (BOARD_X + 0.1), C.cy, 4.3, cam);
  if (!vis(sc)) return;
  const n = String(Math.max(0, Math.ceil(st.shot / 60))).padStart(2, "0");
  box(ctx, sc[0] - 5, sc[1] - 4, sc[0] + 5, sc[1] + 3, PAL.clockBox);
  const live = st.half ? true : st.poss === (d > 0 ? 0 : 1);
  text(ctx, n, sc[0] - 4, sc[1] - 3, live || st.phase !== "live" ? PAL.clock : shade(PAL.clock, 0.45));
}
// half: "back" (the half of the ring farther from the camera) or "front" (the nearer half and the net)
function drawRim(ctx, d, cam, half, bend) {
  const rx = d * C.rimX, z = C.rimZ - (half === "front" ? bend : 0);
  // the ring's halves split across the camera's view: the nearer half is the one toward the camera
  const toCamX = cam.px - rx, toCamY = cam.py - C.cy, a0 = Math.atan2(toCamY, toCamX);
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const a = a0 + (half === "front" ? -Math.PI / 2 : Math.PI / 2) + (i / 16) * Math.PI;
    pts.push([[rx + C.rimR * Math.cos(a), C.cy + C.rimR * Math.sin(a), z], [rx + 0.13 * Math.cos(a), C.cy + 0.13 * Math.sin(a), z - 0.42]]);
  }
  if (half === "front") for (let i = 0; i <= 16; i += 2) lineW(ctx, pts[i][0], pts[i][1], cam, PAL.net);
  for (let i = 1; i < pts.length; i++) lineW(ctx, pts[i - 1][0], pts[i][0], cam, half === "back" ? PAL.rimDk : PAL.rim, half === "front" ? 2 : 1);
  if (half === "back") lineW(ctx, [rx + d * C.rimR, C.cy, C.rimZ], [d * BOARD_X, C.cy, C.rimZ], cam, PAL.rimDk);
}

// ---- the players --------------------------------------------------------------------------------------
// look: {jersey, trim, skin, hair, head (canvas | null), num}. The body follows the man: P.h (his
// height, the difference from 2 m drawn 1.3 times for readability), P.bw (his build: a centre is
// broad, a point guard slight), P.lefty (his hand, cosmetic).
const BUILD = { PG: 0.84, SG: 0.9, SF: 0.96, PF: 1.08, C: 1.2 };
function bodyOf(P) {
  const hv = 2 + ((P.h || 2) - 2) * 1.3, bw = P.bw ?? BUILD[P.pos] ?? 1;
  return { hv, bw };
}
function drawPlayer(ctx, P, look, st, cam, frame, ctl, gp) {
  const [gx, gy, s, dep] = gp;
  if (dep < NEAR + 0.6 || gx < -40 || gx > W + 40) return;
  const one = proj(P.x, P.y, 1, cam);
  // screen pixels per metre up (never let a top-down camera flatten a man to nothing)
  const sv = Math.max(gy - one[1], s * 0.45);
  const by = gy - P.z * sv;
  const { hv, bw } = bodyOf(P);
  // which way he faces on the screen
  const fp = proj(P.x + (P.face || 1) * 0.6, P.y, 0, cam), fd = fp[0] - gx, fs = Math.abs(fd) < 0.3 ? (P.face || 1) : fd > 0 ? 1 : -1;
  // the shadow stays on the floor
  rect(ctx, gx - 0.34 * bw * s, gy - Math.max(1, 0.06 * s), 0.68 * bw * s, Math.max(1, 0.12 * s), PAL.shadow);
  if (ctl) {
    // the man you steer: a bright ring on the floor round his feet, outlined so it reads on any paint
    const rx = Math.max(5, Math.round(0.6 * s)), ry = Math.max(2, Math.round(0.6 * Math.max(0.25, Math.min(1, sv / s - 0.1)) * s * 0.4));
    ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = PAL.outline; ctx.beginPath(); ctx.ellipse(Math.round(gx), Math.round(gy), rx, ry, 0, 0, 6.2832); ctx.stroke();
    ctx.lineWidth = 1.6; ctx.strokeStyle = PAL.mark; ctx.stroke(); ctx.restore();
  }
  // a man down (his ankles gone): flat on the floor for a moment
  if (P.stumble > 45) {
    box(ctx, gx - 0.9 * s, gy - 0.28 * sv, gx + 0.9 * s, gy, look.jersey); box(ctx, gx + 0.6 * s * fs - (fs < 0 ? 0.35 * s : 0), gy - 0.3 * sv, gx + 0.6 * s * fs + (fs > 0 ? 0.35 * s : 0), gy - 0.02 * sv, look.skin);
    return;
  }
  const lean = P.stumble > 0 ? ((frame >> 2) & 1 ? 0.12 : -0.12) : 0;
  // R(x, z, w, h): a box in metres beside his centre line (x forward in his facing), z up from his feet
  const R = (xm, zm, wm, hm, c) => {
    const xa = gx + (xm + lean * zm) * s * fs, xb = gx + (xm + wm + lean * zm) * s * fs;
    let x0 = Math.round(Math.min(xa, xb)), x1 = Math.round(Math.max(xa, xb)), y0 = Math.round(by - (zm + hm) * sv), y1 = Math.round(by - zm * sv);
    if (x1 <= x0) x1 = x0 + 1; if (y1 <= y0) y1 = y0 + 1;
    ctx.fillStyle = c; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  };
  const a = P.act?.kind, b = st.ball, has = b.st === "held" && b.own === P.g, sk = look.skin;
  const moving = P.mv && P.z === 0, step = moving ? ((frame >> 3) & 1) : 0;
  const nearBall = Math.hypot(b.x - P.x, b.y - P.y) < 3.2;
  const passing = P.passF != null && st.frame - P.passF < 10 && st.frame >= P.passF;
  const shooting = a === "jump" || a === "ftshot";
  const up = !shooting && (a === "hop" || P.z > 0.05 || (a === "follow" && P.act.f < 16) || a === "dunk" || (P.hands > 0 && !has && st.poss !== P.t));
  const guarding = !has && !up && st.phase === "live" && st.poss >= 0 && st.poss !== P.t && nearBall;
  const crouch = (has && !a ? 0.06 : 0) + (guarding ? 0.1 : 0) + (shooting && P.z === 0 && (P.act.f || 0) < 6 ? 0.08 : 0);
  // proportions (m): legs to the hip, the shorts, the vest, the head on top
  const hip = 0.47 * hv - crouch, sh = 0.79 * hv - crouch, wHip = 0.21 * bw, wSh = 0.25 * bw, leg = Math.max(0.075, 0.085 * bw), arm = Math.max(0.06, 0.07 * bw);
  const legC = sk, shoe = PAL.shoe;
  // shoes, legs (a walk cycle: one foot up), the knees bent when low
  const spread = guarding ? 0.08 : 0;
  const lx = -0.13 * bw - spread, rx2 = 0.05 * bw + spread;
  const liftL = moving && step ? 0.05 : 0, liftR = moving && !step ? 0.05 : 0;
  R(lx - 0.03, liftL, leg + 0.06, 0.05 * hv, shoe); R(rx2 - 0.01, liftR, leg + 0.06, 0.05 * hv, shoe);
  R(lx, 0.05 * hv + liftL, leg, hip - 0.05 * hv - liftL + 0.02, legC); R(rx2, 0.05 * hv + liftR, leg, hip - 0.05 * hv - liftR + 0.02, legC);
  // the shorts
  R(-wHip, hip - 0.04, 2 * wHip, 0.17 * hv, look.jersey); R(-wHip, hip - 0.04, 0.05, 0.17 * hv, look.trim); R(wHip - 0.05, hip - 0.04, 0.05, 0.17 * hv, look.trim);
  // arms behind the body first (the far arm of a dribble, a pass)
  const armLen = 0.37 * hv, shZ = sh - 0.04;
  const handSide = P.lefty ? -1 : 1;
  const drawArms = (layer) => {
    if (shooting) {
      // a set shot: both hands up, the ball over his head (the sim lifts it)
      if (layer === 0) R(-wSh + 0.02, shZ - 0.06, arm, armLen * 0.95, sk);
      else R(wSh - 0.02 - arm, shZ - 0.06, arm, armLen * 0.95, sk);
      return;
    }
    if (a === "dunk") {
      if (layer === 1) { R(0.05, shZ - 0.05, arm, armLen * 1.05, sk); R(-0.12, shZ - 0.05, arm, armLen * 0.9, sk); }
      return;
    }
    if (up) {
      if (layer === 0) R(-wSh - 0.02, shZ - 0.05, arm, armLen, sk);
      else R(wSh + 0.02 - arm, shZ - 0.05, arm, armLen, sk);
      return;
    }
    if (passing) {
      // arms out toward the man he passed to
      if (layer === 1) { R(0.05, shZ - 0.2, armLen * 0.95, arm, sk); R(0.05, shZ - 0.3, armLen * 0.9, arm, sk); }
      return;
    }
    if (has && !a) {
      // the dribble: the ball hand reaches down in front; the other arm guards across
      if (layer === (handSide > 0 ? 1 : 0)) { R(wSh * 0.6, shZ - armLen * 0.95, arm, armLen * 0.95, sk); R(wSh * 0.6, shZ - armLen * 0.95 - 0.04, arm + 0.04, 0.06, sk); }
      else { R(-wSh - 0.02, shZ - armLen * 0.55, arm, armLen * 0.55, sk); R(-wSh - 0.02, shZ - armLen * 0.55, armLen * 0.45 + 0.1, arm, sk); }
      return;
    }
    if (guarding) {
      // the stance: arms wide and low
      if (layer === 0) { R(-wSh - armLen * 0.7, shZ - 0.12, armLen * 0.7, arm, sk); R(-wSh - armLen * 0.7, shZ - 0.12 - armLen * 0.35, arm, armLen * 0.35, sk); }
      else { R(wSh, shZ - 0.12, armLen * 0.7, arm, sk); R(wSh + armLen * 0.7 - arm, shZ - 0.12 - armLen * 0.35, arm, armLen * 0.35, sk); }
      return;
    }
    // hanging at his sides, swinging a little on the run
    const sw = moving ? (step ? 0.06 : -0.06) : 0;
    if (layer === 0) R(-wSh - 0.01 - sw, shZ - armLen, arm, armLen, sk);
    else R(wSh + 0.01 - arm + sw, shZ - armLen, arm, armLen, sk);
  };
  drawArms(0);
  // the vest, its trim at the neck and the arm holes
  const vH = sh - (hip + 0.1);
  R(-wSh, hip + 0.1, 2 * wSh, vH, look.jersey);
  R(-wSh, sh - 0.05, 2 * wSh, 0.05, look.trim);
  R(-wSh, hip + 0.1, 0.04, vH, look.trim); R(wSh - 0.04, hip + 0.1, 0.04, vH, look.trim);
  // his number, as big as the vest allows
  const vPx = vH * sv, vW = 2 * wSh * s, n = String(look.num ?? "");
  if (n && vPx >= 5 && vW >= 5) {
    const kt = Math.max(1, Math.min(Math.floor((vPx - 1) / 6), Math.floor((vW - 1) / (textW(n) + 1))));
    if (kt >= 1 && textW(n, kt) <= vW + 2) {
      const ty = Math.round(by - (hip + 0.1 + vH / 2) * sv - (5 * kt) / 2);
      const ink = Math.abs(lumOf(look.trim) - lumOf(look.jersey)) > 50 ? look.trim : lumOf(look.jersey) > 128 ? "#141414" : "#f2efe6";
      text(ctx, n, Math.round(gx - textW(n, kt) / 2), ty, ink, kt);
    }
  }
  drawArms(1);
  // the head: the file photo's face, scaled to 0.5 m
  const hh = Math.max(3, Math.round(0.5 * sv)), top = Math.round(by - sh * sv) - hh + 1;
  if (look.head) {
    const hd = hh < look.head.height ? shrinkHead(look.head, hh) : look.head, hw = Math.max(2, Math.round((hd.width * hh) / hd.height));
    ctx.drawImage(hd, Math.round(gx - hw / 2), top, hw, hh);
  } else { R(-0.13, sh, 0.26, 0.38, sk); R(-0.14, sh + 0.28, 0.28, 0.12, look.hair || "#2a1a10"); }
  if (ctl) {
    const mx = Math.round(gx), my = top - 6 - ((frame >> 4) & 1);
    rect(ctx, mx - 4, my - 1, 9, 5, PAL.outline);
    rect(ctx, mx - 3, my, 7, 1, PAL.mark); rect(ctx, mx - 2, my + 1, 5, 1, PAL.mark); rect(ctx, mx - 1, my + 2, 3, 1, PAL.mark); rect(ctx, mx, my + 3, 1, 1, PAL.mark);
    if (P.pos) textOutlined(ctx, P.pos, Math.round(mx - textW(P.pos) / 2), my - 8, PAL.mark);
  }
  return top;
}

function drawBall(ctx, st, cam, frame) {
  const b = st.ball;
  if (b.st === "dead" && st.phase === "dead" && !st.p.some(P => P.act?.kind === "dunk")) { if (st.after === "inbound" || st.after === "period") return; }
  let x = b.x, y = b.y, z = b.z;
  if (b.st === "held") {
    const Hh = st.p[b.own];
    if (!Hh.act && Hh.z === 0) {
      const ph = frame % 18, tri = ph < 9 ? ph / 9 : (18 - ph) / 9; z = 0.13 + 0.8 * tri;
      // the dribble hand: a right-hander facing +x dribbles on his right (-y), a left-hander the other side
      y = Hh.y - (Hh.face || 1) * 0.18 * (Hh.lefty ? -1 : 1);
    }
  }
  const g = proj(x, y, 0, cam), p = proj(x, y, z, cam);
  if (!vis(p)) return;
  const bs = Math.max(2, Math.round(0.26 * p[2]));
  // the shadow on the floor, always: it reads a lob's height and a bounce pass's line
  if (vis(g)) { const sw = Math.max(2, Math.round(bs * 0.9)); rect(ctx, g[0] - sw / 2, g[1] - 1, sw, Math.max(1, sw / 3), b.z > 0.6 ? "rgba(40,24,12,0.55)" : PAL.shadow); }
  const x0 = Math.round(p[0] - bs / 2), y0 = Math.round(p[1] - bs);
  rect(ctx, x0, y0, bs, bs, PAL.ball);
  if (bs >= 4) { rect(ctx, x0, y0, 1, 1, PAL.ballDk); rect(ctx, x0 + bs - 1, y0 + bs - 1, 1, 1, PAL.ballDk); rect(ctx, x0 + (bs >> 1), y0, 1, bs, PAL.ballDk); }
}

// ---- icon passing: a pad button over each teammate -----------------------------------------------------
const ICON_COL = { A: "#5cb85c", B: "#d9534f", X: "#428bca", Y: "#f0ad4e", LB: "#8a8a8a" };
const SHAPES = {   // 5 x 5 pixel glyphs for the PlayStation buttons
  "✕": "1000101010001000101010001", "○": "0111010001100011000101110", "△": "0010000100010101000111111", "□": "1111110001100011000111111",
};
function disc(ctx, cx, cy, r, c) {
  ctx.fillStyle = c;
  for (let dy = -r; dy <= r; dy++) { const w = Math.round(Math.sqrt(r * r - dy * dy + r * 0.6)); ctx.fillRect(cx - w, cy + dy, 2 * w + 1, 1); }
}
function drawIcon(ctx, cx, cy, b, label, pos) {
  const col = ICON_COL[b] || "#8a8a8a", s = String(label ?? b), wide = !SHAPES[s] && s.length > 1;
  const r = wide ? 6 : 5;
  disc(ctx, cx, cy, r + 1, PAL.outline);
  disc(ctx, cx, cy, r, col);
  const ink = b === "Y" ? "#141414" : "#ffffff";
  if (SHAPES[s]) { ctx.fillStyle = ink; const g = SHAPES[s]; for (let i = 0; i < 25; i++) if (g[i] === "1") ctx.fillRect(cx - 2 + (i % 5), cy - 2 + Math.floor(i / 5), 1, 1); }
  else text(ctx, s, cx - Math.floor(textW(s) / 2), cy - 2, ink);
  if (pos) textOutlined(ctx, pos, cx - Math.floor(textW(pos) / 2), cy + r + 3, "#ffffff");
}

// The shot meter (and the free-throw meter): beside the human's shooter, filling from the gather,
// the green band at the top lit at its width for this shooter and shot. After the release: the
// grade (GREEN, SLIGHTLY EARLY, LATE ...) and how open it was.
function drawMeter(ctx, st, cam) {
  const P = st.p[st.ctl];
  if (!P || st.cfg.auto) return;
  const gp = proj(P.x, P.y, 0, cam);
  if (!vis(gp)) return;
  const [gx, gy, s] = gp, hgt = 36, x = Math.round(Math.min(W - 12, gx + 0.55 * s + 4)), y0 = Math.max(4, Math.round(gy - 2.6 * s));
  const a = P.act, ft = a?.kind === "ftshot";
  if (a?.kind === "jump" || ft) {
    const top = ft ? FT_TOP : TOP, full = 2 * top, r = Math.hypot((P.d ?? dirOf(P.t)) * C.rimX - P.x, C.cy - P.y);
    const win = greenOf(P, ft ? "ft" : kindAt(r, a.post), LEVELS[st.cfg.level]?.green || 0), yy = (f) => y0 + hgt - Math.round((Math.min(full, Math.max(0, f)) / full) * hgt);
    rect(ctx, x - 2, y0 - 2, 10, hgt + 4, PAL.outline);
    rect(ctx, x - 1, y0 - 1, 8, hgt + 2, "#ffffff");
    rect(ctx, x, y0, 6, hgt, "#22382a");
    rect(ctx, x, yy(a.f), 6, y0 + hgt - yy(a.f), a.f > top + win ? "#e05050" : "#e0c040");
    // the green band over the fill, so it stays visible as the fill passes it; ticks mark it outside
    const g0 = yy(top + win), g1 = yy(top - win);
    rect(ctx, x, g0, 6, g1 - g0 + 1, a.f >= top - win && a.f <= top + win ? "#7dff7a" : PAL.eye);
    rect(ctx, x - 4, g0, 3, 1, PAL.eye); rect(ctx, x - 4, g1, 3, 1, PAL.eye); rect(ctx, x + 7, g0, 3, 1, PAL.eye); rect(ctx, x + 7, g1, 3, 1, PAL.eye);
    rect(ctx, x - 3, yy(a.f), 12, 1, "#ffffff");
  }
  const L = st.lastRel, showing = L && L.g === P.g && st.frame - L.frame < 70;
  // before the shot: how open you are, from the nearest defender (the word the grade will carry)
  if (!showing && !a && st.phase === "live" && st.ball.st === "held" && st.ball.own === P.g && !st.iconOn) {
    const c = contestOf(st, P).c, w = c < 0.28 ? "OPEN" : c < 0.46 ? "LIGHTLY CONTESTED" : "CONTESTED";
    const hy = Math.max(2, Math.round(gy - 2.6 * s - 18));
    textOutlined(ctx, w, Math.max(1, Math.min(W - textW(w) - 1, gx - textW(w) / 2)), hy, c < 0.28 ? "#7dff7a" : c < 0.46 ? "#ffd040" : "#ff6050");
  }
  if (showing) {
    const green = L.grade === "GREEN", y = Math.max(2, gy - 2.6 * s - 22);
    textOutlined(ctx, L.grade, Math.max(1, Math.min(W - textW(L.grade) - 1, gx - textW(L.grade) / 2)), y, green ? PAL.eye : /VERY/.test(L.grade) ? "#ff6050" : "#ffd040");
    if (L.word) textOutlined(ctx, L.word, Math.max(1, Math.min(W - textW(L.word) - 1, gx - textW(L.word) / 2)), y + 7, L.c < 0.28 ? "#ffffff" : L.c < 0.66 ? "#ffd040" : "#ff6050");
  }
}

// The frame. looks: [one per player]. fx: {mood, t, dunk: {side, age} | null, shake, paint}. reduced:
// no shake, no sparks, a still crowd. ui: {iconLabel: {A, B, X, Y, LB} -> the label for this way of
// playing (a pad's glyph, a key)}; the icons themselves come from the sim (st.iconOn, st.icons).
export function draw(ctx, st, looks, camState, frame, fx = {}, reduced = false, ui = {}) {
  const cam = camOf(camState);
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  if (!reduced && fx.shake > 0) ctx.translate(((fx.shake >> 1) & 1) ? 1 : -1, 0);
  rect(ctx, 0, 0, W, H, PAL.bg);
  drawStands(ctx, cam, fx, reduced);
  drawFloor(ctx, cam, fx.paint || "#1f4a2c", Boolean(st.half));
  const items = [];
  // painter's order: farthest from the camera first
  const depth = (x, y, z = 0) => toCam(x, y, z, cam)[2];
  for (const d of [-1, 1]) {
    const bend = fx.dunk && fx.dunk.side === d && fx.dunk.age < 18 ? (fx.dunk.age < 9 ? 0.12 : 0.06) : 0;
    // the stanchion stands behind the board from the court; the rim's halves split toward the camera
    items.push({ s: depth(d * POLE_X, C.cy, 2), f: () => drawStanchion(ctx, d, cam, st) });
    const ux = cam.px - d * C.rimX, uy = cam.py - C.cy, ul = Math.hypot(ux, uy) || 1;
    items.push({ s: depth(d * C.rimX - (ux / ul) * 0.25, C.cy - (uy / ul) * 0.25, C.rimZ), f: () => drawRim(ctx, d, cam, "back", bend) });
    items.push({ s: depth(d * C.rimX + (ux / ul) * 0.25, C.cy + (uy / ul) * 0.25, C.rimZ), f: () => drawRim(ctx, d, cam, "front", bend) });
  }
  const tops = {};
  for (const P of st.p) {
    const gp = proj(P.x, P.y, 0, cam);
    items.push({ s: gp[3], f: () => { const t = drawPlayer(ctx, P, looks[P.g] || looks[0], st, cam, frame, !st.cfg.auto && P.t === 0 && P.i === st.ctl && st.phase !== "over", gp); if (t != null) tops[P.g] = [gp[0], t]; } });
  }
  const b = st.ball;
  if (b.st === "held" && b.own >= 0) {
    const Hh = st.p[b.own], by = Hh.y - (Hh.face || 1) * 0.18 * (Hh.lefty ? -1 : 1);
    items.push({ s: depth(Hh.x + (Hh.face || 1) * 0.32, by) - 0.01, f: () => drawBall(ctx, st, cam, frame) });
  } else items.push({ s: depth(b.x, b.y, b.z), f: () => drawBall(ctx, st, cam, frame) });
  items.sort((a, c) => c.s - a.s);
  for (const it of items) it.f();
  if (fx.dunk && !reduced && fx.dunk.age < 24) {
    const r = proj(fx.dunk.side * C.rimX, C.cy, C.rimZ, cam), n = fx.dunk.age;
    if (vis(r)) for (let i = 0; i < 8; i++) { const dx = [1, 0.7, 0, -0.7, -1, -0.7, 0, 0.7][i], dy = [0, 0.7, 1, 0.7, 0, -0.7, -1, -0.7][i], rr = 4 + n * 0.9; rect(ctx, r[0] + dx * rr, r[1] + dy * rr, 1, 1, n % 4 < 2 ? PAL.mark : "#ffffff"); }
  }
  // icon passing: the button for each teammate over his head
  if (st.iconOn && Array.isArray(st.icons)) {
    for (const ic of st.icons) {
      const P = st.p[ic.g]; if (!P) continue;
      const tp = tops[ic.g];
      if (!tp) continue;
      const cx = Math.round(Math.max(8, Math.min(W - 8, tp[0]))), cy = Math.round(Math.max(8, tp[1] - 16));
      drawIcon(ctx, cx, cy, ic.b, ui?.iconLabel?.[ic.b], P.pos || "");
    }
  }
  drawMeter(ctx, st, cam);
  ctx.restore();
}

// ---- faces -------------------------------------------------------------------------------------------
// The head comes off the file photo through the sports pages' shared cut (../heads.js): the head
// only, whatever the figure carries in daily life stays home.
export { headFrom as headOf } from "../heads.js";
// The face's own colour: the commonest opaque pixel in the head's lower middle.
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
export { dirOf };
