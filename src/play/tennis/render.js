// THE TENNIS CLUB, playable: the picture. Browser only, reads the sim's state (and the broadcast's,
// show.js) and never writes either. 256 x 240 logical pixels (the NES's own frame), drawn with
// fillRect only, scaled by whole device pixels with smoothing off. A behind-the-baseline
// three-quarter view: the far end narrower and higher up the screen, height lifting a thing up the
// screen by its own scale. The show court's colours (venueGeo.js: hard, blue), the terminal's
// greens round it; the stand, the boards, the officials and the ball kids are the event's.
import { COURT, serverOfMatch } from "./sim.js";
import { CHAIR, NET_JUDGE, JUDGES } from "./show.js";

export const W = 256, H = 240;
const PAL = {
  bg: "#0a0f0a", stand: "#132013", seat: "#1c2e1f", wall: "#0f1a10", board: "#1f4a2c", boardInk: "#c8f5d8", boardAlt: "#0a0f0a", boardAltInk: "#3fae5a",
  surround: "#1d4a6e", surroundHi: "#22527a", court: "#2f5f8f", courtHi: "#36699b", courtLo: "#2a5683", wear: "#3a6e9f",
  line: "#e6e6e6", net: "#c8f5d8", post: "#8a8a8a", ball: "#e0e040", ballHi: "#ffffff", shadow: "#15334f",
  skin: "#c68c5e", racket: "#e6e6e6", grip: "#6b4a2e", shoe: "#e6e6e6", outline: "#0a0f0a",
  chair: "#9a9a9a", chairDk: "#5f5f5f", blazer: "#1f2f5a", trouser: "#262626", hat: "#e6e6e6", kid: "#6b3fa0", kidCap: "#e0c040",
  ump: "#33503a", umpDk: "#1d261e", umpSkin: "#c8c6b4", visor: "#0a0f0a", eye: "#5cff8a", gold: "#e0c040", mic: "#ff5050",
};
const SHIRTS = ["#b83232", "#3a6fd8", "#e6e6e6", "#e0c040", "#3c8a46", "#d97a2b", "#6b3fa0", "#d977a8", "#8a8a8a", "#45618f", "#262626", "#d9ccb0"];
const SKINS = ["#f6d5bc", "#f1c9a5", "#e0b088", "#c68c5e", "#8d5a36", "#5c3a22"];

// metres -> logical pixels: [x, y, scale (px per metre at that depth)]
export function proj(x, y, z = 0) {
  const t = (y + 16.5) / 34, s = 8.5 + t * 7.5;
  return [Math.round(128 + x * s), Math.round(24 + t * 206 - z * s * 0.95), s];
}

function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
// a 1-px line, Bresenham, in fillRects
function line(ctx, x0, y0, x1, y1, c, wpx = 1) {
  ctx.fillStyle = c;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let k = 0; k < 600; k++) {
    ctx.fillRect(x0, y0, wpx, wpx);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
const cline = (ctx, a, b, c, d) => { const p = proj(a, b), q = proj(c, d); line(ctx, p[0], p[1], q[0], q[1], PAL.line); };
function quad(ctx, pts, c) {
  ctx.fillStyle = c; ctx.beginPath();
  pts.forEach(([x, y], i) => { const p = proj(x, y); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
  ctx.closePath(); ctx.fill();
}
const hash = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };

// ---- a 3 x 5 type, for the boards and the broadcast's furniture ----------------------------------
const GL = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111", F: "111100110100100",
  G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111",
  M: "101111111101101", N: "110101101101101", O: "010101101101010", P: "110101110100100", Q: "010101101110011", R: "110101110101101",
  S: "011100010001110", T: "111010010010010", U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101",
  Y: "101101010010010", Z: "111001010100111", 0: "111101101101111", 1: "010110010010111", 2: "110001010100111", 3: "110001010001110",
  4: "101101111001001", 5: "111100110001110", 6: "011100111101111", 7: "111001010010010", 8: "111101111101111", 9: "111101111001110",
  ".": "000000000000010", ",": "000000000010100", "-": "000000111000000", ":": "000010000010000", "!": "010010010000010", "'": "010010000000000", "/": "001001010100100",
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

// ---- the static layer: stand shells, boards, surround, court, lines -----------------------------
const STAND_H = 21, BOARD_Y = 21, SIDE_W = 14;
let COURT_CACHE = null;
function courtLayer() {
  if (COURT_CACHE) return COURT_CACHE;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d"); ctx.imageSmoothingEnabled = false;
  rect(ctx, 0, 0, W, H, PAL.bg);
  // the far stand: tiers of seats
  rect(ctx, 0, 0, W, STAND_H, PAL.stand);
  for (let r = 0; r < 5; r++) rect(ctx, 0, 4 + r * 4, W, 1, PAL.seat);
  // the boards: sponsor-free, the Department's own
  const [, fy] = proj(0, -15.5);
  rect(ctx, 0, BOARD_Y, W, fy - BOARD_Y, PAL.wall);
  const boards = [["HVI", 1], ["THE DEPARTMENT OF LEISURE", 0], ["APPLAUSE IS MONITORED", 1], ["QUIET", 0], ["HVI", 1]];
  let bx = 1;
  for (const [s, alt] of boards) {
    const w = textW(s) + 6;
    rect(ctx, bx, BOARD_Y + 1, w, 7, alt ? PAL.boardAlt : PAL.board);
    text(ctx, s, bx + 3, BOARD_Y + 2, alt ? PAL.boardAltInk : PAL.boardInk);
    bx += w + 2;
  }
  // the surround, the side stands' walls
  rect(ctx, 0, fy, W, H - fy, PAL.surround);
  rect(ctx, 0, fy, SIDE_W, H - fy, PAL.stand); rect(ctx, W - SIDE_W, fy, SIDE_W, H - fy, PAL.stand);
  rect(ctx, SIDE_W, fy, 1, H - fy, PAL.wall); rect(ctx, W - SIDE_W - 1, fy, 1, H - fy, PAL.wall);
  for (let y = fy + 3; y < H; y += 6) { rect(ctx, 0, y, SIDE_W, 1, PAL.seat); rect(ctx, W - SIDE_W, y, SIDE_W, 1, PAL.seat); }
  // side boards, vertical, low on the wall
  for (const [x0] of [[SIDE_W + 1], [W - SIDE_W - 4]]) { rect(ctx, x0, fy + 30, 3, 60, PAL.board); for (let k = 0; k < 6; k++) rect(ctx, x0 + 1, fy + 34 + k * 9, 1, 5, PAL.boardInk); }
  const { hw, dhw, hl, sv } = COURT;
  quad(ctx, [[-dhw, -hl], [dhw, -hl], [dhw, hl], [-dhw, hl]], PAL.court);
  // the surface: a grain, and the wear behind each baseline where the serving happens
  try {
    const img = ctx.getImageData(0, fy, W, H - fy), d = img.data;
    const C = [0x2f, 0x5f, 0x8f], S = [0x1d, 0x4a, 0x6e];
    for (let i = 0, n = d.length / 4; i < n; i++) {
      const o = i * 4, x = i % W, y = Math.floor(i / W), h = hash(x, y + 7);
      if (d[o] === C[0] && d[o + 1] === C[1] && d[o + 2] === C[2]) {
        if (h % 11 === 0) { d[o] = 0x36; d[o + 1] = 0x69; d[o + 2] = 0x9b; } else if (h % 13 === 0) { d[o] = 0x2a; d[o + 1] = 0x56; d[o + 2] = 0x83; }
      } else if (d[o] === S[0] && d[o + 1] === S[1] && d[o + 2] === S[2] && h % 9 === 0) { d[o] = 0x22; d[o + 1] = 0x52; d[o + 2] = 0x7a; }
    }
    ctx.putImageData(img, 0, fy);
  } catch { /* a tainted or headless canvas: plain blue */ }
  for (const sg of [-1, 1]) for (let x = -1.8; x <= 1.8; x += 0.12) for (let dy = -1.1; dy <= -0.05; dy += 0.1) {
    const p = proj(x, sg * (hl + dy));
    const fall = 1 - Math.abs(x) / 1.9;
    if ((hash(p[0], p[1]) % 100) / 100 < fall * 0.55) rect(ctx, p[0], p[1], 1, 1, PAL.wear);
  }
  for (const x of [-dhw, -hw, hw, dhw]) cline(ctx, x, -hl, x, hl);
  for (const y of [-hl, hl]) cline(ctx, -dhw, y, dhw, y);
  for (const y of [-sv, sv]) cline(ctx, -hw, y, hw, y);
  cline(ctx, 0, -sv, 0, sv);
  for (const y of [-hl, hl]) cline(ctx, 0, y, 0, y + (y < 0 ? 0.35 : -0.35));   // the centre marks
  COURT_CACHE = c;
  return c;
}

// ---- the crowd: every seat counted ----------------------------------------------------------------
let SEATS = null;
function seats() {
  if (SEATS) return SEATS;
  const out = [], [, fy] = proj(0, -15.5);
  for (let r = 0; r < 5; r++) for (let x = 2 + (r % 2) * 2; x < W - 3; x += 5) {
    const h = hash(x, r + 1);
    if (h % 10 < 2) continue;   // an empty seat
    out.push({ x, y: r * 4, side: 0, shirt: SHIRTS[h % SHIRTS.length], skin: SKINS[(h >>> 5) % SKINS.length], ph: (h >>> 9) % 12, tall: (h >>> 12) % 5 });
  }
  for (const [sx0, side] of [[1, -1], [W - SIDE_W + 1, 1]]) for (let y = fy + 1; y < H - 4; y += 6) for (let c = 0; c < 3; c++) {
    const x = sx0 + c * 4, h = hash(x * 3 + side, y);
    if (h % 10 < 2) continue;
    out.push({ x, y, side, shirt: SHIRTS[h % SHIRTS.length], skin: SKINS[(h >>> 5) % SKINS.length], ph: (h >>> 9) % 12, tall: (h >>> 12) % 5 });
  }
  SEATS = out;
  return out;
}
function drawCrowd(ctx, show, ballPx) {
  const S = show?.state, t = S ? S.t : 0, mood = S?.crowd.mood || "idle";
  const [bx, by] = ballPx || [128, 120];
  for (const p of seats()) {
    const up = mood === "stand" && p.tall > 0, dy = up ? -1 : 0;
    rect(ctx, p.x, p.y + 2 + dy, 3, 2, p.shirt);
    // the head turns with the ball: the dark pixel is the back of the head
    let hx = p.x, eye;
    if (p.side === 0) { const look = bx < p.x - 24 ? -1 : bx > p.x + 24 ? 1 : 0; hx += look > 0 ? 1 : 0; eye = look; } else eye = by < p.y - 30 ? -1 : by > p.y + 30 ? 1 : 0;
    rect(ctx, hx, p.y + dy, 2, 2, p.skin);
    if (p.side === 0) rect(ctx, eye < 0 ? hx + 1 : eye > 0 ? hx : hx, p.y + dy, eye === 0 ? 2 : 1, 1, "#2a1a10");
    else rect(ctx, p.side < 0 ? hx : hx + 1, eye < 0 ? p.y + dy + 1 : p.y + dy, 1, 1, "#2a1a10");
    if (mood === "clap" || mood === "stand") {
      const beat = ((t + p.ph * 2) >> 2) & 1;
      if (up) { rect(ctx, p.x - 1, p.y + dy - (beat ? 1 : 0), 1, 2, p.skin); rect(ctx, p.x + 3, p.y + dy - (beat ? 0 : 1), 1, 2, p.skin); }
      else rect(ctx, p.x + (beat ? 0 : 1), p.y + 1, beat ? 3 : 1, 1, p.skin);
    } else if (((t >> 5) + p.ph) % 23 === 0) rect(ctx, p.x + 3, p.y + 1, 1, 1, p.skin);   // a fidget
  }
}

// ---- the officials ------------------------------------------------------------------------------
// The chair's official, in units of k px, origin at the seat's top centre; it faces the court (left).
export function drawUmpire(ctx, ox, oy, k, look, talking, t) {
  const R = (x, y, w, h, c) => rect(ctx, ox + x * k, oy + y * k, w * k, h * k, c);
  const lean = talking ? 1 : 0, hx = -lean, hy = lean;
  R(-4, 0, 3, 7, PAL.umpDk); R(0, 0, 3, 7, PAL.umpDk);
  R(-5, 7, 4, 2, PAL.outline); R(-1, 7, 4, 2, PAL.outline);
  R(-5, -10, 10, 10, PAL.ump);
  R(-1, -10, 2, 3, "#e6e6e6"); R(2, -8, 2, 2, PAL.gold);
  R(-7, -9, 2, 7, PAL.ump); R(5, -9, 2, 7, PAL.ump);
  R(-7, -2, 2, 2, PAL.umpSkin); R(5, -2, 2, 2, PAL.umpSkin);
  // head, cap, the visor's scanning eye (it follows the ball: far end left, near end right)
  R(-4 + hx, -19 + hy, 9, 9, PAL.umpSkin);
  R(-5 + hx, -21 + hy, 10, 3, PAL.umpDk); R(-5 + hx, -19 + hy, 10, 1, PAL.eye); R(-8 + hx, -19 + hy, 3, 1, PAL.umpDk);
  R(-4 + hx, -16 + hy, 9, 2, PAL.visor);
  const ex = Math.max(0, Math.min(7, Math.round(3.5 + look * 3.5)));
  R(-4 + hx + ex, -16 + hy, 2, 2, PAL.eye);
  const open = talking && ((t >> 3) & 1);
  R(-2 + hx, -12 + hy, 3, open ? 2 : 1, "#3a2a2a");
  // the headset and its microphone, lit while it speaks
  R(4 + hx, -17 + hy, 2, 4, "#3d3d3d"); R(-1 + hx, -13 + hy, 6, 1, "#8a8a8a"); R(-2 + hx, -14 + hy, 2, 2, talking ? PAL.mic : "#6b6b6b");
}
function drawChair(ctx, ump, frame) {
  const [ux, uy] = proj(CHAIR.x, CHAIR.y), top = uy - 28;
  rect(ctx, ux - 9, uy - 1, 20, 3, PAL.shadow);
  rect(ctx, ux - 6, top, 2, 28, PAL.chair); rect(ctx, ux + 5, top - 12, 2, 40, PAL.chair);
  for (let y = top + 6; y < uy; y += 6) rect(ctx, ux - 6, y, 13, 1, PAL.chairDk);
  rect(ctx, ux - 8, top - 1, 16, 2, PAL.chairDk); rect(ctx, ux - 10, uy - 14, 5, 1, PAL.chairDk);
  rect(ctx, ux - 6, uy - 12, 13, 7, PAL.board); text(ctx, "HVI", ux - 5, uy - 11, PAL.boardInk);
  drawUmpire(ctx, ux, top - 1, 1, ump.look, ump.talking, frame);
}
// A line judge (or the net judge): seated, or up with the arm out for a call.
function drawJudge(ctx, J, i, call, hand) {
  const [x, y] = proj(J.x, J.y), skin = SKINS[(i * 5 + 2) % SKINS.length];
  rect(ctx, x - 4, y - 1, 9, 2, PAL.shadow);
  if (call) {
    rect(ctx, x - 2, y - 7, 1, 7, PAL.trouser); rect(ctx, x + 1, y - 7, 1, 7, PAL.trouser);
    rect(ctx, x - 2, y - 13, 4, 6, PAL.blazer); rect(ctx, x - 1, y - 17, 3, 4, skin); rect(ctx, x - 2, y - 18, 5, 2, PAL.hat);
    const d = call.dir;
    rect(ctx, d > 0 ? x + 2 : x - 8, y - 12, 6, 1, PAL.blazer); rect(ctx, d > 0 ? x + 8 : x - 9, y - 12, 1, 1, skin);
    return;
  }
  rect(ctx, x - 3, y - 6, 6, 1, PAL.chairDk); rect(ctx, x - 3, y - 5, 1, 5, PAL.chairDk); rect(ctx, x + 2, y - 5, 1, 5, PAL.chairDk);
  rect(ctx, x - 2 + J.face, y - 8, 4, 2, PAL.trouser); rect(ctx, x - 2, y - 13, 4, 5, PAL.blazer);
  rect(ctx, x - 1, y - 17, 3, 4, skin); rect(ctx, x - 2, y - 18, 5, 2, PAL.hat);
  if (hand) { rect(ctx, x + J.face * 2, y - 19, 1, 6, PAL.blazer); rect(ctx, x + J.face * 2, y - 20, 1, 1, skin); }
}
function drawKid(ctx, K, frame, ball) {
  const [x, y] = proj(K.x, K.y), skin = "#c68c5e";
  rect(ctx, x - 3, y - 1, 6, 2, PAL.shadow);
  if (K.mv) {
    const s = (frame >> 2) & 1;
    rect(ctx, x - 2, y - 5 + s, 1, 5 - s, PAL.trouser); rect(ctx, x + 1, y - 5 + (1 - s), 1, 4 + s, PAL.trouser);
    rect(ctx, x - 2, y - 10, 4, 5, PAL.kid); rect(ctx, x - 1, y - 13, 3, 3, skin); rect(ctx, x - 2, y - 14, 4, 1, PAL.kidCap);
    if (ball) rect(ctx, x + 2, y - 8, 2, 2, PAL.ball);
  } else {
    rect(ctx, x - 2, y - 3, 4, 3, PAL.trouser); rect(ctx, x - 2, y - 6, 4, 3, PAL.kid);
    rect(ctx, x - 1, y - 9, 3, 3, skin); rect(ctx, x - 2, y - 10, 4, 1, PAL.kidCap);
  }
}

function drawNet(ctx) {
  const L = proj(-COURT.dhw - 0.9, 0), R = proj(COURT.dhw + 0.9, 0), s = L[2], h = Math.round(COURT.net * s * 0.95);
  rect(ctx, L[0], L[1], R[0] - L[0], 2, PAL.shadow);
  for (let y = L[1] - h + 2; y < L[1]; y += 2) for (let x = L[0]; x <= R[0]; x += 2) rect(ctx, x + ((y >> 1) % 2), y, 1, 1, PAL.net);
  rect(ctx, L[0], L[1] - h, R[0] - L[0] + 1, 2, PAL.line);
  rect(ctx, 127, L[1] - h, 2, h, PAL.line);   // the centre strap
  rect(ctx, L[0] - 1, L[1] - h - 1, 2, h + 1, PAL.post); rect(ctx, R[0], L[1] - h - 1, 2, h + 1, PAL.post);
}

// The racket's head for a swing frame: where the hand is, where the head points.
function racketPose(P, back) {
  const f = P.swing, side = P.face;
  if (f < 0) return { hx: side * 5, hy: -8, ex: side * 7, ey: -15 };
  if (P.kind === "S") {
    if (f < 6) return { hx: side * 3, hy: -18, ex: side * 4, ey: -25 };
    if (f < 12) return { hx: side * 2, hy: -16, ex: side * -2, ey: -10 };
    return { hx: -side * 3, hy: -7, ex: -side * 7, ey: -2 };
  }
  const k = back ? -1 : 1;
  if (f < 5) return { hx: side * 6, hy: -9, ex: side * 11, ey: -9 + k * 3 };
  if (f < 11) return { hx: side * 5, hy: -9, ex: side * 6, ey: -9 - k * 6 };
  return { hx: -side * 3, hy: -9, ex: -side * 9, ey: -12 };
}

// A player: shadow, shoes, legs, shirt, arms, the head cut from the file photo, the racket.
function drawPlayer(ctx, P, look, frame) {
  const [sx, sy] = proj(P.x, P.y), far = P.side < 0;
  const step = P.mv ? ((frame >> 3) & 1) : 0;
  const shirt = look.kit[0], shorts = look.kit[1];
  rect(ctx, sx - 5, sy - 1, 11, 2, PAL.shadow); rect(ctx, sx - 3, sy + 1, 7, 1, PAL.shadow);
  rect(ctx, sx - 3, sy - 7 + (step ? 1 : 0), 2, 6, look.skin);
  rect(ctx, sx + 1, sy - 7 + (step ? 0 : 1), 2, 6, look.skin);
  rect(ctx, sx - 4, sy - 2, 3, 2, PAL.shoe); rect(ctx, sx + 1, sy - 2, 3, 2, PAL.shoe);
  rect(ctx, sx - 4, sy - 11, 8, 4, shorts);
  rect(ctx, sx - 4, sy - 19, 8, 8, shirt);
  rect(ctx, sx - 4, sy - 19, 8, 1, PAL.outline);
  const r = racketPose(P, far);
  const hx = sx + r.hx, hy = sy + r.hy;
  line(ctx, sx + P.face * 3, sy - 17, hx, hy, look.skin, 2);
  line(ctx, hx, hy, sx + r.ex, sy + r.ey, PAL.grip);
  rect(ctx, sx + r.ex - 2, sy + r.ey - 2, 5, 5, PAL.racket); rect(ctx, sx + r.ex - 1, sy + r.ey - 1, 3, 3, PAL.court);
  rect(ctx, sx - P.face * 5 - (P.face > 0 ? 1 : 0), sy - 18, 2, 6, look.skin);
  if (look.head) {
    const h = look.head;
    ctx.drawImage(h, Math.round(sx - h.width / 2), Math.round(sy - 19 - h.height + 2));
  } else {
    rect(ctx, sx - 3, sy - 27, 7, 8, look.skin); rect(ctx, sx - 3, sy - 28, 7, 3, look.hair || "#3b2417");
    if (!far) { rect(ctx, sx - 2, sy - 24, 1, 1, PAL.outline); rect(ctx, sx + 2, sy - 24, 1, 1, PAL.outline); }
  }
}

function drawBall(ctx, b) {
  const [gx, gy] = proj(b.x, b.y), [bx, by, s] = proj(b.x, b.y, b.z);
  const big = s > 11, hi = b.z > 2.5;
  rect(ctx, gx - 1, gy, hi ? 2 : big ? 4 : 3, 1, PAL.shadow);
  rect(ctx, bx - 1, by - 2, big ? 3 : 2, big ? 3 : 2, PAL.ball);
  rect(ctx, bx - 1, by - 2, 1, 1, PAL.ballHi);
}

// The serve's timing hint: the toss's height against the band where it is best struck.
function drawTossMeter(ctx, st) {
  const P = st.p[0], [sx, sy] = proj(P.x, P.y), x = sx + (P.x > 0 ? -16 : 12), y0 = sy - 36, hgt = 26;
  const zy = (z) => y0 + hgt - Math.round((Math.max(1.2, Math.min(3.4, z)) - 1.2) / 2.2 * hgt);
  rect(ctx, x - 1, y0 - 1, 5, hgt + 2, PAL.outline);
  rect(ctx, x, y0, 3, hgt, "#22382a");
  rect(ctx, x, zy(3.15), 3, zy(2.6) - zy(3.15), PAL.eye);
  if (st.ball && st.sub === "toss") rect(ctx, x - 1, zy(st.ball.z), 5, 1, PAL.ball);
}

// The frame. looks: [{kit, skin, head (canvas | null), hair}] for players 0 and 1. show: the
// broadcast (show.js), or null for the bare court.
export function draw(ctx, st, looks, frame, show = null) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(courtLayer(), 0, 0);
  const b = st.ball, S = show?.state;
  drawCrowd(ctx, show, b ? proj(b.x, b.y, b.z) : null);
  const items = st.p.map(P => ({ y: P.y, f: () => drawPlayer(ctx, P, looks[P.i], frame) }));
  items.push({ y: 0, f: () => drawNet(ctx) });
  if (b && !(S && S.taken === b)) items.push({ y: b.y + 0.01, f: () => drawBall(ctx, b) });
  if (S) {
    const tf = S.t;
    items.push({ y: 0.02, f: () => drawChair(ctx, { look: S.look, talking: S.bubble?.who === "chair" && tf - S.bubble.from < 90 }, tf) });
    JUDGES.forEach((J, i) => items.push({ y: J.y, f: () => drawJudge(ctx, J, i, S.judge && S.judge.j === i && tf < S.judge.until ? S.judge : null, false) }));
    items.push({ y: NET_JUDGE.y, f: () => drawJudge(ctx, NET_JUDGE, 9, null, tf < S.netHand) });
    for (const K of S.kids) items.push({ y: K.y, f: () => drawKid(ctx, K, tf, K.back && S.taken) });
  } else items.push({ y: 0.02, f: () => drawChair(ctx, { look: 0, talking: false }, frame) });
  items.sort((a, c) => a.y - c.y);
  for (const it of items) it.f();
  if (st.phase === "serve" && serverOfMatch(st) === 0 && !st.p[0].cpu) drawTossMeter(ctx, st);
}

// Where a speaker's head is on the 256 x 240 frame (the page puts the speech box there).
export function speakerAt(who, j = 0) {
  if (who === "chair") { const [x, y] = proj(CHAIR.x, CHAIR.y); return [x - 9, y - 50]; }
  const J = who === "net" ? NET_JUDGE : JUDGES[j] || JUDGES[0], [x, y] = proj(J.x, J.y);
  return [x, y - 20];
}

// ---- the cutaway: the broadcast finds someone in the stand -------------------------------------
// art: {sheet (a 32 x 48 file photo, frame 0), box: faceBox(sheet)} or null while it loads.
export function drawCutaway(ctx, cut, t, art) {
  ctx.imageSmoothingEnabled = false;
  const age = t - cut.from;
  rect(ctx, 0, 0, W, H, "#0e160f");
  // the rows behind, out of focus
  for (let r = 0; r < 3; r++) for (let x = -10 + r * 13; x < W; x += 34) {
    const h = hash(x, r + cut.n * 7), y = 6 + r * 34, bob = ((age + h % 30) >> 4) & 1;
    rect(ctx, x, y + 14 + bob, 24, 22, shade(SHIRTS[h % SHIRTS.length], 0.45));
    rect(ctx, x + 6, y + bob, 12, 14, shade(SKINS[(h >>> 4) % SKINS.length], 0.45));
  }
  // the seats: the subject's and the neighbours'
  rect(ctx, 0, 112, W, 6, "#3a1418");
  for (const sx of [-48, 60, 196]) rect(ctx, sx, 96, 104, 96, sx === 60 ? "#5a1f24" : "#46181c");
  // neighbours, cut off by the frame
  for (const [nx, h] of [[-26, 3], [218, 8]]) {
    rect(ctx, nx, 120, 64, 70, SHIRTS[h]); rect(ctx, nx + 18, 82, 28, 32, SKINS[h % SKINS.length]); rect(ctx, nx + 18, 80, 28, 8, "#2a1a10");
    const clap = cut.react === "cheer" || cut.react === "clap";
    if (clap && ((age >> 3) & 1)) rect(ctx, nx + 24, 112, 16, 10, SKINS[h % SKINS.length]);
  }
  const ox = 64, oy = 44, P = 4;
  if (cut.s.key === "umpire") {
    rect(ctx, 60, 96, 136, 96, "#2c3a2e");
    drawUmpire(ctx, 132, 140, 5, ((age >> 5) & 1) ? 0.8 : -0.8, ((age >> 4) % 4) !== 3, age);
  } else if (art?.sheet) {
    ctx.drawImage(art.sheet, 0, 0, 32, 34, ox, oy, 32 * P, 34 * P);
    react(ctx, cut.react, age, art.box, ox, oy, P);
  } else {
    // no photo on file here (or not yet): the Department's own placeholder
    rect(ctx, ox + 36, oy + 10, 56, 56, "#2a3a2c"); rect(ctx, ox + 20, oy + 66, 88, 70, "#2a3a2c");
    rect(ctx, ox + 46, oy + 30, 10, 4, "#0a0f0a"); rect(ctx, ox + 72, oy + 30, 10, 4, "#0a0f0a");
    text(ctx, "PHOTO", ox + 45, oy + 84, "#c8f5d8", 2); text(ctx, "WITHHELD", ox + 33, oy + 98, "#c8f5d8", 2);
  }
  // scanlines, and the broadcast's furniture
  ctx.globalAlpha = 0.14; ctx.fillStyle = "#000";
  for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
  ctx.globalAlpha = 1;
  if ((age >> 4) & 1) rect(ctx, 8, 9, 5, 5, "#e04040");
  text(ctx, "LIVE", 16, 8, "#e6e6e6", 2);
  const tag = "DEPT. OF LEISURE TV // CAM 4";
  text(ctx, tag, W - textW(tag) - 8, 10, "#c8f5d8");
  // the wipe in
  if (age < 10) rect(ctx, 0, 0, Math.round(W * (1 - age / 10)), H, "#e6e6e6");
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = (v) => Math.round(v * k).toString(16).padStart(2, "0");
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}
// What the subject does, drawn over the photo in its own pixels (P to one). box: faceBox.
function react(ctx, kind, age, box, ox, oy, P) {
  const R = (x, y, w, h, c) => rect(ctx, ox + x * P, oy + y * P, w * P, h * P, c);
  const { cx, y0, skin } = box, sk = skin || "#c68c5e";
  const mouthY = y0 + 9;
  if (kind === "cheer") {
    const w = (age >> 3) & 1;
    R(cx - 10 - w, y0 - 2, 2, 16, sk); R(cx + 8 + w, y0 - 2, 2, 16, sk);
    R(cx - 11 - w, y0 - 4, 4, 3, sk); R(cx + 7 + w, y0 - 4, 4, 3, sk);
    R(cx - 1, mouthY, 3, 2, "#3a1a1a");
  } else if (kind === "clap") {
    const k = ((age >> 2) & 3);
    const g = k === 0 ? 0 : k === 2 ? 3 : 1;
    R(cx - 4 - g, y0 + 18, 3, 4, sk); R(cx + 1 + g, y0 + 18, 3, 4, sk);
  } else if (kind === "yawn") {
    const c = age % 150, o = c < 30 ? c / 10 : c < 80 ? 3 : c < 100 ? (100 - c) / 7 : 0;
    if (o >= 1) R(cx - 1, mouthY - 1, 3, Math.round(o) + 1, "#3a1a1a");
    if (c > 35 && c < 85) R(cx - 3, mouthY - 1, 6, 4, sk);   // the polite hand
  } else if (kind === "hotdog") {
    const c = age % 90, lift = c < 30 ? c / 30 : c < 55 ? 1 : 1 - (c - 55) / 35, y = Math.round(y0 + 21 - lift * 11);
    const bites = Math.min(3, Math.floor(age / 90));
    R(cx - 5 + bites, y, 10 - bites, 2, "#d9a85c"); R(cx - 6 + bites, y, 11 - bites, 1, "#b8452e"); R(cx - 3, y + 2, 4, 3, sk);
    if (c > 30 && c < 55) R(cx - 1, mouthY, 3, 1, "#3a1a1a");
  } else if (kind === "watch") {
    const up = ((age % 120) < 70) ? 1 : 0;
    R(cx - 9, y0 + 20 - up * 3, 12, 2, sk); R(cx - 2, y0 + 19 - up * 3, 3, 3, "#d9d9d9"); R(cx - 1, y0 + 20 - up * 3, 1, 1, "#262626");
  }
}

// The face's place in a 32 x 48 file photo: the head's top row, its centre column, its colour.
export function faceBox(sheet) {
  const box = { cx: 16, y0: 2, skin: null };
  if (!sheet) return box;
  try {
    const c = document.createElement("canvas"); c.width = 32; c.height = 48;
    const x = c.getContext("2d"); x.drawImage(sheet, 0, 0, 32, 48, 0, 0, 32, 48);
    const d = x.getImageData(0, 0, 32, 20).data;
    let y0 = -1, a = 32, b = -1;
    for (let y = 0; y < 20 && y0 < 0; y++) for (let i = 0; i < 32; i++) if (d[(y * 32 + i) * 4 + 3] > 0) { y0 = y; break; }
    if (y0 < 0) return box;
    for (let y = y0; y < y0 + 5; y++) for (let i = 0; i < 32; i++) if (d[(y * 32 + i) * 4 + 3] > 0) { a = Math.min(a, i); b = Math.max(b, i); }
    box.y0 = y0; box.cx = Math.round((a + b) / 2);
    const n = new Map();
    for (let y = y0 + 6; y < y0 + 12; y++) for (let i = box.cx - 3; i <= box.cx + 3; i++) {
      const o = (y * 32 + i) * 4; if (d[o + 3] < 200) continue;
      const k = `#${[d[o], d[o + 1], d[o + 2]].map(v => v.toString(16).padStart(2, "0")).join("")}`; n.set(k, (n.get(k) || 0) + 1);
    }
    let bn = 0; for (const [k, v] of n) if (v > bn) { bn = v; box.skin = k; }
  } catch { /* the default box */ }
  return box;
}

// The face, cut from a 32 x 48 file photo (frame 0): the opaque pixels of the top rows, as tight
// as they come, no wider than 14. -> canvas | null
export function headFrom(sheet) {
  if (!sheet) return null;
  try {
    const c = document.createElement("canvas"); c.width = 32; c.height = 48;
    const x = c.getContext("2d"); x.drawImage(sheet, 0, 0, 32, 48, 0, 0, 32, 48);
    const d = x.getImageData(0, 0, 32, 14).data;
    let x0 = 32, x1 = -1, y0 = 14, y1 = -1;
    for (let y = 0; y < 13; y++) for (let i = 0; i < 32; i++) if (d[(y * 32 + i) * 4 + 3] > 0) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 < 0) return null;
    let tx0 = 32, tx1 = -1;
    for (let y = y0; y < y0 + 5; y++) for (let i = 0; i < 32; i++) if (d[(y * 32 + i) * 4 + 3] > 0) { tx0 = Math.min(tx0, i); tx1 = Math.max(tx1, i); }
    const cx = Math.round((tx0 + tx1) / 2), w = Math.min(14, x1 - x0 + 1), hx0 = Math.max(0, Math.min(32 - w, cx - (w >> 1)));
    const h = Math.min(12, 13 - y0);
    const o = document.createElement("canvas"); o.width = w; o.height = h;
    o.getContext("2d").drawImage(c, hx0, y0, w, h, 0, 0, w, h);
    return o;
  } catch { return null; }
}
