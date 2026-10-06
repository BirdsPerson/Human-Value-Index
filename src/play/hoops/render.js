// THE COURTS, playable: the picture. Browser only; reads the sim's state and never writes it.
// 256 x 240 logical pixels (the NES's frame), fillRect and a few polygon fills, scaled by whole
// device pixels with smoothing off.
//
// The view is a true one-point perspective from a seat high in the near stand: the camera looks
// straight across the court (along +y), level, so every vertical stays vertical and every line
// across the court stays horizontal, while lines along the depth run to one vanishing point on the
// horizon. A point (x, y, z) in metres lands at x' = 128 + (x - cam) * s, y' = HY + (CAM_H - z) * s
// with s = F / (y + CAM_D) (the horizon itself sits just above the frame): one scale per depth for width, height and jump alike, so the players,
// the ball, the rims and the stands all shrink together with distance. At the near sideline a metre
// is 20 px, at the far one 8.4: a 2 m player is 40 px near and 17 px far, the rim 3.05 m up. The
// camera pans along the court with the ball (render-only; the sim never sees it). The heads are
// drawn a little large (0.5 m), the 16-bit habit, so a face reads at this size.
import { COURT as C, TOP, dirOf } from "./sim.js";

export const W = 256, H = 240;
export const CAM = { F: 220, D: 11, H: 12, HY: -14 };
export function proj(x, y, z, cam) {
  const s = CAM.F / (y + CAM.D);
  return [128 + (x - cam) * s, CAM.HY + (CAM.H - z) * s, s];
}
// The camera: follows the ball along the court, eased; never past the point where the far
// baseline leaves the picture.
export const CAM_LIMIT = 8.2;
export function camFollow(cam, st) {
  const b = st.ball, want = Math.max(-CAM_LIMIT, Math.min(CAM_LIMIT, b.x * 0.85));
  return cam + (want - cam) * 0.08;
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

function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
// edges rounded independently, so neighbouring parts meet without gaps
function box(ctx, x0, y0, x1, y1, c) { const a = Math.round(x0), b = Math.round(y0), w = Math.round(x1) - a, h = Math.round(y1) - b; if (w <= 0 || h <= 0) return; ctx.fillStyle = c; ctx.fillRect(a, b, w, h); }
function line(ctx, x0, y0, x1, y1, c, wpx = 1) {
  ctx.fillStyle = c;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let k = 0; k < 800; k++) {
    ctx.fillRect(x0, y0, wpx, wpx);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function poly(ctx, pts, c) {
  ctx.fillStyle = c; ctx.beginPath();
  pts.forEach(([x, y], i) => { if (i) ctx.lineTo(Math.round(x), Math.round(y)); else ctx.moveTo(Math.round(x), Math.round(y)); });
  ctx.closePath(); ctx.fill();
}
const floorQuad = (ctx, x0, y0, x1, y1, cam, c) => poly(ctx, [proj(x0, y0, 0, cam), proj(x1, y0, 0, cam), proj(x1, y1, 0, cam), proj(x0, y1, 0, cam)], c);
function floorLine(ctx, pts, cam, c) { for (let i = 1; i < pts.length; i++) { const a = proj(pts[i - 1][0], pts[i - 1][1], 0, cam), b = proj(pts[i][0], pts[i][1], 0, cam); line(ctx, a[0], a[1], b[0], b[1], c); } }
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
function textOutlined(ctx, s, x, y, c, k = 1) {
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) text(ctx, s, x + ox, y + oy, PAL.outline, k);
  text(ctx, s, x, y, c, k);
}

// ---- the stands: a tall far stand, every seat counted ---------------------------------------------
const STAND_Y0 = C.w + 2.6, ROW_DY = 0.85, ROW_DZ = 0.55, ROWS = 26, SEAT_DX = 0.8, STAND_X = 44;
let SEATS = null;
function seats() {
  if (SEATS) return SEATS;
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    const y = STAND_Y0 + r * ROW_DY, z = 0.55 + r * ROW_DZ, out = [];
    for (let x = -STAND_X + (r % 2) * SEAT_DX * 0.5; x <= STAND_X; x += SEAT_DX) {
      const h = hash(Math.round(x * 10), r + 3);
      if (h % 9 === 0) continue;   // an empty seat
      // the house lights are on the floor: the stand is in shadow, darker the higher it goes
      const dim = 0.62 - r * 0.012;
      out.push({ x, shirt: shade(SHIRTS[h % SHIRTS.length], dim), skin: shade(SKINS[(h >>> 5) % SKINS.length], dim + 0.12), ph: (h >>> 9) % 16, keen: (h >>> 13) % 4 });
    }
    rows.push({ r, y, z, seats: out });
  }
  SEATS = rows;
  return rows;
}
const BOARDS = ["HVI", "THE COURTS", "PICKUP PERMITTED", "APPLAUSE IS MONITORED", "HVI", "THE DEPARTMENT OF LEISURE", "NO DUNKING ON STAFF", "HVI", "YOUR SEAT IS ASSIGNED"];
function drawStands(ctx, cam, fx, reduced) {
  const rows = seats(), mood = fx?.mood || "idle", t = fx?.t || 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const R = rows[i], [, sy, s] = proj(0, R.y, R.z, cam), [, ny] = proj(0, R.y - ROW_DY, R.z - ROW_DZ, cam);
    if (sy < -6) continue;
    const L = proj(-STAND_X - 2, R.y, R.z, cam)[0], Rr = proj(STAND_X + 2, R.y, R.z, cam)[0];
    box(ctx, L, sy, Rr, ny + 1, R.r % 2 ? PAL.riser : PAL.riserHi);
    const bw = Math.max(1, Math.round(0.42 * s)), bh = Math.max(1, Math.round(0.36 * s)), hw = Math.max(1, Math.round(0.26 * s));
    for (const p of R.seats) {
      const px = 128 + (p.x - cam) * s;
      if (px < -4 || px > W + 4) continue;
      let up = 0;
      const beat = reduced ? 0 : ((t + p.ph * 3) >> 3) & 1;
      if (mood === "cheer" && p.keen > 0) up = 1 + beat;
      else if (mood === "stand" && p.keen > 1) up = 1;
      const x0 = Math.round(px - bw / 2), y0 = Math.round(sy - bh - up);
      ctx.fillStyle = p.shirt; ctx.fillRect(x0, y0, bw, bh);
      ctx.fillStyle = p.skin; ctx.fillRect(Math.round(px - hw / 2), y0 - hw, hw, hw);
      if (mood === "groan" && p.keen > 1) { ctx.fillStyle = "#0a0f0a"; ctx.fillRect(Math.round(px - hw / 2), y0 - hw, hw, 1); }   // heads down
      if (up && s > 4) { ctx.fillStyle = p.skin; ctx.fillRect(x0 - 1, y0 - hw - 1 - beat, 1, 2); ctx.fillRect(x0 + bw, y0 - hw - 1 - (1 - beat), 1, 2); }
    }
  }
  // the front of the stand: the boards along the far apron
  const by = C.w + 1.9, [, top] = proj(0, by, 0.85, cam), [, bot] = proj(0, by, 0, cam);
  let x = -27;
  BOARDS.forEach((msg, i) => {
    const wM = Math.max(3.2, msg.length * 0.55 + 1.2), a = proj(x, by, 0, cam)[0], b = proj(x + wM, by, 0, cam)[0];
    const alt = i % 2 === 0;
    box(ctx, a, top, b - 1, bot, alt ? PAL.board : PAL.boardAlt);
    text(ctx, msg, (a + b) / 2 - textW(msg) / 2, (top + bot) / 2 - 2, alt ? PAL.eye : PAL.boardInk);
    x += wM + 0.3;
  });
}

// ---- the floor -----------------------------------------------------------------------------------
function drawFloor(ctx, cam, paint) {
  const [, horizonCut] = proj(0, C.w + 1.9, 0, cam);
  box(ctx, 0, horizonCut, W, H, PAL.floorDk);
  floorQuad(ctx, -C.hx - 2.2, -3, C.hx + 2.2, C.w + 1.9, cam, PAL.apron);
  // the boards of the court: planks across the depth, a little grain
  for (let y = 0, k = 0; y < C.w; y += 0.6, k++) floorQuad(ctx, -C.hx, y, C.hx, Math.min(C.w, y + 0.6), cam, k % 2 ? PAL.wood : PAL.woodB);
  for (let i = 0; i < 90; i++) {
    const h = hash(i, 77), x = ((h % 2860) / 100) - C.hx, y = ((h >>> 12) % 1524) / 100, p = proj(x, y, 0, cam);
    if (p[0] >= 0 && p[0] < W) rect(ctx, p[0], p[1], Math.max(1, p[2] * 0.6), 1, PAL.grain);
  }
  // the paint, the centre circle
  for (const d of [-1, 1]) floorQuad(ctx, d * C.ftX, C.cy - C.laneHW, d * C.hx, C.cy + C.laneHW, cam, paint);
  poly(ctx, arc(0, C.cy, 1.8, 0, Math.PI * 2, 32).map(([x, y]) => proj(x, y, 0, cam)), paint);
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
    floorLine(ctx, arc(rx, C.cy, C.three, base - (Math.PI / 2 - (Math.PI / 2 - a)), base + a, 40).map(([x, y]) => [x, y]), cam, L);
    floorLine(ctx, arc(rx, C.cy, 1.22, base - Math.PI / 2, base + Math.PI / 2, 14), cam, L);
  }
  // the Department's eye at centre court
  const c = proj(0, C.cy, 0, cam);
  rect(ctx, c[0] - 0.5 * c[2], c[1] - 1, c[2], 2, PAL.outline); rect(ctx, c[0] - 1, c[1] - 1, 2, 2, PAL.eye);
}

// ---- the baskets ------------------------------------------------------------------------------------
const BOARD_X = 13.105, BOARD_HW = 0.915, BOARD_Z0 = 2.9, BOARD_Z1 = 3.97, POLE_X = C.hx + 1.25;
function drawStanchion(ctx, d, cam, st) {
  const pb = proj(d * POLE_X, C.cy, 0, cam), pt = proj(d * POLE_X, C.cy, 3.75, cam), s = pb[2];
  // the padded base and the pole
  const b0 = proj(d * (POLE_X - 0.5), C.cy - 0.6, 0, cam), b1 = proj(d * (POLE_X + 0.6), C.cy - 0.6, 0.95, cam);
  box(ctx, Math.min(b0[0], b1[0]), b1[1], Math.max(b0[0], b1[0]), b0[1], PAL.pad);
  poly(ctx, [proj(d * (POLE_X - 0.5), C.cy - 0.6, 0.95, cam), proj(d * (POLE_X + 0.6), C.cy - 0.6, 0.95, cam), proj(d * (POLE_X + 0.6), C.cy + 0.6, 0.95, cam), proj(d * (POLE_X - 0.5), C.cy + 0.6, 0.95, cam)], shade(PAL.pad, 1.4));
  box(ctx, pb[0] - 0.09 * s, pt[1], pb[0] + 0.09 * s, b1[1], PAL.pole);
  // the arm out to the board
  const ab = proj(d * (BOARD_X + 0.05), C.cy, 3.6, cam);
  line(ctx, pt[0], pt[1], ab[0], ab[1], PAL.pole, 2);
  // the board: a pane of glass edge-on to the court, seen at an angle because the camera is not
  // straight down the line; its near edge is wider than its far edge
  const q = [[C.cy - BOARD_HW, BOARD_Z0], [C.cy + BOARD_HW, BOARD_Z0], [C.cy + BOARD_HW, BOARD_Z1], [C.cy - BOARD_HW, BOARD_Z1]].map(([y, z]) => proj(d * BOARD_X, y, z, cam));
  ctx.globalAlpha = 0.6; poly(ctx, q, PAL.glass); ctx.globalAlpha = 1;
  for (let i = 0; i < 4; i++) line(ctx, q[i][0], q[i][1], q[(i + 1) % 4][0], q[(i + 1) % 4][1], PAL.glassEdge);
  const sq = [[C.cy - 0.3, 3.05], [C.cy + 0.3, 3.05], [C.cy + 0.3, 3.5], [C.cy - 0.3, 3.5]].map(([y, z]) => proj(d * (BOARD_X - 0.01), y, z, cam));
  for (let i = 0; i < 4; i++) line(ctx, sq[i][0], sq[i][1], sq[(i + 1) % 4][0], sq[(i + 1) % 4][1], PAL.clock);
  // the shot clock over the board
  const sc = proj(d * (BOARD_X + 0.1), C.cy, 4.3, cam), n = String(Math.max(0, Math.ceil(st.shot / 60))).padStart(2, "0");
  box(ctx, sc[0] - 5, sc[1] - 4, sc[0] + 5, sc[1] + 3, PAL.clockBox);
  text(ctx, n, sc[0] - 4, sc[1] - 3, st.poss === (d > 0 ? 0 : 1) || st.phase !== "live" ? PAL.clock : shade(PAL.clock, 0.45));
}
// half: "back" (the far half of the ring) or "front" (the near half and the net)
function drawRim(ctx, d, cam, half, bend) {
  const rx = d * C.rimX, pts = [], z = C.rimZ - (half === "front" ? bend : 0);
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * (half === "back" ? 1 : -1);
    pts.push([proj(rx + C.rimR * Math.cos(a), C.cy + C.rimR * Math.sin(a), z, cam), proj(rx + 0.13 * Math.cos(a), C.cy + 0.13 * Math.sin(a), z - 0.42, cam)]);
  }
  if (half === "front") for (let i = 0; i <= 16; i += 2) line(ctx, pts[i][0][0], pts[i][0][1], pts[i][1][0], pts[i][1][1], PAL.net);
  for (let i = 1; i < pts.length; i++) line(ctx, pts[i - 1][0][0], pts[i - 1][0][1], pts[i][0][0], pts[i][0][1], half === "back" ? PAL.rimDk : PAL.rim, half === "front" ? 2 : 1);
  if (half === "back") { const a = proj(rx + d * C.rimR, C.cy, C.rimZ, cam), b = proj(d * BOARD_X, C.cy, C.rimZ, cam); line(ctx, a[0], a[1], b[0], b[1], PAL.rimDk); }
}

// ---- the players --------------------------------------------------------------------------------------
// look: {jersey, trim, skin, hair, head (canvas | null), num}
function drawPlayer(ctx, P, look, st, cam, frame, ctl) {
  const [gx, gy, s] = proj(P.x, P.y, 0, cam), hk = P.h / 2, k = s * hk;
  if (gx < -30 || gx > W + 30) return;
  const by = gy - P.z * s;
  // the shadow stays on the floor
  rect(ctx, gx - 0.32 * s, gy - Math.max(1, 0.06 * s), 0.64 * s, Math.max(1, 0.12 * s), PAL.shadow);
  if (ctl) { const w = Math.round(0.9 * s); line(ctx, gx - w / 2, gy + 1, gx + w / 2, gy + 1, PAL.mark); }
  const R = (xm, zm, wm, hm, c) => box(ctx, gx + xm * k, by - (zm + hm) * k, gx + (xm + wm) * k, by - zm * k, c);
  const step = P.mv && P.z === 0 ? ((frame >> 3) & 1) : 0, sk = look.skin;
  // shoes, legs, shorts
  R(-0.22, 0, 0.19, 0.1, PAL.shoe); R(0.03, 0, 0.19, 0.1, PAL.shoe);
  R(-0.18, 0.1 + step * 0.04, 0.13, 0.62, sk); R(0.05, 0.1 + (1 - step) * 0.04, 0.13, 0.62, sk);
  R(-0.24, 0.66, 0.48, 0.42, look.jersey); R(-0.24, 0.66, 0.05, 0.42, look.trim); R(0.19, 0.66, 0.05, 0.42, look.trim);
  // the vest
  R(-0.22, 1.06, 0.44, 0.5, look.jersey); R(-0.22, 1.5, 0.44, 0.05, look.trim);
  if (k >= 14) { const n = String(look.num); text(ctx, n, gx - textW(n) / 2, by - 1.42 * k, look.trim); }
  // arms: up for a shot, a block or a dunk; one down to the ball on the dribble
  const a = P.act?.kind, b = st.ball, has = b.st === "held" && b.own === P.g;
  const up = a === "jump" || a === "hop" || (a === "follow" && P.act.f < 16) || a === "dunk";
  if (up) {
    const f = P.face;
    R(-0.3, 1.3, 0.1, 0.62, sk); R(0.2, 1.3, 0.1, 0.62, sk);
    if (a === "dunk") R(f > 0 ? 0.2 : -0.3, 1.9, 0.1, 0.3, sk);
  } else if (has) {
    const f = P.face;
    R(f > 0 ? -0.3 : 0.2, 0.92, 0.09, 0.55, sk);
    R(f > 0 ? 0.2 : -0.3, 1.08, 0.12, 0.38, sk); R(f > 0 ? 0.26 : -0.38, 0.98, 0.12, 0.14, sk);
  } else { R(-0.3, 0.9, 0.09, 0.58, sk); R(0.21, 0.9, 0.09, 0.58, sk); }
  // the head: the file photo's face, scaled to 0.5 m
  const hh = Math.max(3, Math.round(0.5 * k)), top = Math.round(by - 1.55 * k) - hh + 1;
  if (look.head) {
    const hd = look.head, hw = Math.max(2, Math.round((hd.width * hh) / hd.height));
    ctx.drawImage(hd, Math.round(gx - hw / 2), top, hw, hh);
  } else { R(-0.13, 1.55, 0.26, 0.4, sk); R(-0.14, 1.85, 0.28, 0.12, look.hair || "#2a1a10"); }
  if (ctl) {
    const mx = Math.round(gx), my = top - 4 - ((frame >> 4) & 1);
    rect(ctx, mx - 2, my, 5, 1, PAL.mark); rect(ctx, mx - 1, my + 1, 3, 1, PAL.mark); rect(ctx, mx, my + 2, 1, 1, PAL.mark);
  }
}

function drawBall(ctx, st, cam, frame) {
  const b = st.ball;
  if (b.st === "dead" && st.phase === "dead" && !st.p.some(P => P.act?.kind === "dunk")) { if (st.after === "inbound" || st.after === "period") return; }
  let x = b.x, y = b.y, z = b.z;
  if (b.st === "held") {
    const H = st.p[b.own];
    if (!H.act && H.z === 0) { const ph = frame % 18, tri = ph < 9 ? ph / 9 : (18 - ph) / 9; z = 0.13 + 0.8 * tri; }
  }
  const g = proj(x, y, 0, cam), p = proj(x, y, z, cam), bs = Math.max(2, Math.round(0.26 * p[2]));
  rect(ctx, g[0] - bs / 2, g[1] - 1, bs, Math.max(1, bs / 3), PAL.shadow);
  const x0 = Math.round(p[0] - bs / 2), y0 = Math.round(p[1] - bs);
  rect(ctx, x0, y0, bs, bs, PAL.ball);
  if (bs >= 4) { ctx.clearRect(x0, y0, 1, 1); rect(ctx, x0, y0, 1, 1, PAL.ballDk); rect(ctx, x0 + bs - 1, y0 + bs - 1, 1, 1, PAL.ballDk); rect(ctx, x0 + (bs >> 1), y0, 1, bs, PAL.ballDk); }
}

// The shot meter: beside the human's shooter, from the gather to the landing, the band at the top
// of the jump lit. After the release, a word for the timing.
function drawMeter(ctx, st, cam, assist) {
  const P = st.p[st.ctl];
  if (!P || st.cfg.auto) return;
  const [gx, gy, s] = proj(P.x, P.y, 0, cam), x = Math.round(gx + 0.55 * s + 3), hgt = 24, y0 = Math.round(gy - 2.4 * s);
  if (P.act?.kind === "jump") {
    const LAND = 2 * TOP, win = assist ? 5 : 3, yy = (f) => y0 + hgt - Math.round((Math.min(LAND, f) / LAND) * hgt);
    rect(ctx, x - 1, y0 - 1, 6, hgt + 2, PAL.outline);
    rect(ctx, x, y0, 4, hgt, "#22382a");
    rect(ctx, x, yy(TOP + win), 4, yy(TOP - win) - yy(TOP + win) + 1, PAL.eye);
    rect(ctx, x, yy(P.act.f), 4, y0 + hgt - yy(P.act.f), P.act.f > TOP + win ? "#e05050" : "#e0c040");
    rect(ctx, x - 2, yy(P.act.f), 8, 1, "#ffffff");
  }
  const L = st.lastRel;
  if (L && L.g === P.g && st.frame - L.frame < 50) {
    const w = L.q >= 0.999 ? "PERFECT" : L.f < TOP ? "EARLY" : "LATE";
    textOutlined(ctx, w, Math.max(1, Math.min(W - textW(w) - 1, gx - textW(w) / 2)), Math.max(2, gy - 2.6 * s - 10), L.q >= 0.999 ? PAL.eye : "#ffd040");
  }
}

// The frame. looks: [10] per player. fx: {mood, t, dunk: {side, age} | null, shake}. reduced: no
// shake, no sparks, a still crowd.
export function draw(ctx, st, looks, cam, frame, fx = {}, reduced = false) {
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  if (!reduced && fx.shake > 0) ctx.translate(((fx.shake >> 1) & 1) ? 1 : -1, 0);
  rect(ctx, 0, 0, W, H, PAL.bg);
  drawStands(ctx, cam, fx, reduced);
  drawFloor(ctx, cam, fx.paint || "#1f4a2c");
  const items = [];
  for (const d of [-1, 1]) {
    const bend = fx.dunk && fx.dunk.side === d && fx.dunk.age < 18 ? (fx.dunk.age < 9 ? 0.12 : 0.06) : 0;
    items.push({ y: C.cy + 1.2, f: () => drawStanchion(ctx, d, cam, st) });
    items.push({ y: C.cy + 0.2, f: () => drawRim(ctx, d, cam, "back", bend) });
    items.push({ y: C.cy - 0.25, f: () => drawRim(ctx, d, cam, "front", bend) });
  }
  for (const P of st.p) items.push({ y: P.y, f: () => drawPlayer(ctx, P, looks[P.g], st, cam, frame, !st.cfg.auto && P.t === 0 && P.i === st.ctl && st.phase !== "over") });
  const b = st.ball;
  items.push({ y: b.st === "held" ? st.p[b.own].y - 0.05 : b.y, f: () => drawBall(ctx, st, cam, frame) });
  items.sort((a, c) => c.y - a.y);
  for (const it of items) it.f();
  if (fx.dunk && !reduced && fx.dunk.age < 24) {
    const r = proj(fx.dunk.side * C.rimX, C.cy, C.rimZ, cam), n = fx.dunk.age;
    for (let i = 0; i < 8; i++) { const dx = [1, 0.7, 0, -0.7, -1, -0.7, 0, 0.7][i], dy = [0, 0.7, 1, 0.7, 0, -0.7, -1, -0.7][i], rr = 4 + n * 0.9; rect(ctx, r[0] + dx * rr, r[1] + dy * rr, 1, 1, n % 4 < 2 ? PAL.mark : "#ffffff"); }
  }
  drawMeter(ctx, st, cam, st.cfg.assist);
  ctx.restore();
}

// ---- faces -------------------------------------------------------------------------------------------
// The head off a 32 x 48 file photo (frame 0), with any everyday prop taken away: only the opaque
// pixels of the top rows connected to the face (a flood from the face's middle, kept above the
// neck), so a pizza peel, a guitar neck or a hat brim held beside the head is not part of it.
// crop: [x, y, w, h] when a prop crosses the head itself (roster.js CROPS).
export function headOf(sheet, crop = null) {
  if (!sheet) return null;
  try {
    const c = document.createElement("canvas"); c.width = 32; c.height = 48;
    const g = c.getContext("2d"); g.drawImage(sheet, 0, 0, 32, 48, 0, 0, 32, 48);
    if (crop) { const o = document.createElement("canvas"); o.width = crop[2]; o.height = crop[3]; o.getContext("2d").drawImage(c, crop[0], crop[1], crop[2], crop[3], 0, 0, crop[2], crop[3]); return o; }
    const HR = 14, img = g.getImageData(0, 0, 32, HR), d = img.data, solid = (x, y) => d[(y * 32 + x) * 4 + 3] > 0;
    // the face's middle: the opaque pixel nearest (16, 7)
    let sx = -1, sy = -1, bd = 1e9;
    for (let y = 0; y < HR; y++) for (let x = 0; x < 32; x++) if (solid(x, y)) { const k = (x - 16) * (x - 16) * 1.5 + (y - 7) * (y - 7); if (k < bd) { bd = k; sx = x; sy = y; } }
    if (sx < 0) return null;
    // flood within the top rows, no wider than 14 either side of the middle
    const keep = new Uint8Array(32 * HR), q = [[sx, sy]];
    keep[sy * 32 + sx] = 1;
    while (q.length) {
      const [x, y] = q.pop();
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= 32 || ny >= HR || Math.abs(nx - sx) > 7 || keep[ny * 32 + nx] || !solid(nx, ny)) continue;
        keep[ny * 32 + nx] = 1; q.push([nx, ny]);
      }
    }
    let x0 = 32, x1 = -1, y0 = HR, y1 = -1;
    for (let y = 0; y < HR; y++) for (let x = 0; x < 32; x++) {
      if (keep[y * 32 + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } else d[(y * 32 + x) * 4 + 3] = 0;
    }
    g.putImageData(img, 0, 0);
    // stop at the neck: the first row under the face narrower than half its widest
    let widest = 0, cut = y1;
    for (let y = y0; y <= y1; y++) { let n = 0; for (let x = 0; x < 32; x++) if (keep[y * 32 + x]) n++; if (n > widest) widest = n; else if (y > y0 + 6 && n < widest / 2) { cut = y - 1; break; } }
    const w = x1 - x0 + 1, h = Math.min(12, cut - y0 + 1);
    const o = document.createElement("canvas"); o.width = w; o.height = h;
    o.getContext("2d").drawImage(c, x0, y0, w, h, 0, 0, w, h);
    return o;
  } catch { return null; }
}
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
