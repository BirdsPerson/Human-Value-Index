// THE TENNIS CLUB, playable: the picture. Browser only, reads the sim's state and never writes
// it. 256 x 240 logical pixels (the NES's own frame), drawn with fillRect only, scaled by whole
// device pixels with smoothing off. A behind-the-baseline three-quarter view: the far end
// narrower and higher up the screen, height lifting a thing up the screen by its own scale.
// The show court's colours (venueGeo.js: hard, blue) and the terminal's greens round it.
import { COURT } from "./sim.js";

export const W = 256, H = 240;
const PAL = {
  bg: "#0a0f0a", stand: "#132013", standDot: "#2f6a42", fence: "#1f4a2c", surround: "#1d4a6e", court: "#2f5f8f",
  line: "#e6e6e6", net: "#c8f5d8", netDark: "#0a0f0a", post: "#8a8a8a", ball: "#e0e040", ballHi: "#ffffff", shadow: "#15334f", shadowOut: "#13314a",
  skin: "#c68c5e", racket: "#e6e6e6", grip: "#6b4a2e", shoe: "#e6e6e6", outline: "#0a0f0a", chair: "#3d3d3d",
};

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
// a court line from (x0,y0) to (x1,y1) in metres
const cline = (ctx, a, b, c, d) => { const p = proj(a, b), q = proj(c, d); line(ctx, p[0], p[1], q[0], q[1], PAL.line); };
function quad(ctx, pts, c) {
  ctx.fillStyle = c; ctx.beginPath();
  pts.forEach(([x, y], i) => { const p = proj(x, y); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
  ctx.closePath(); ctx.fill();
}

// The static court, drawn once into its own canvas.
let COURT_CACHE = null;
function courtLayer() {
  if (COURT_CACHE) return COURT_CACHE;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d"); ctx.imageSmoothingEnabled = false;
  rect(ctx, 0, 0, W, H, PAL.bg);
  // the stand behind the far end: rows of seated dots, every seat counted
  rect(ctx, 0, 0, W, 20, PAL.stand);
  for (let r = 0; r < 4; r++) for (let x = 4 + (r % 2) * 3; x < W - 2; x += 6) if (((x * 7 + r * 13) % 11) > 2) rect(ctx, x, 3 + r * 4, 2, 2, PAL.standDot);
  const [, fy] = proj(0, -15.5);
  rect(ctx, 0, 20, W, fy - 20, PAL.fence);
  for (let x = 0; x < W; x += 4) rect(ctx, x, 20, 1, fy - 20, PAL.bg);
  // the surround, then the court
  rect(ctx, 0, fy, W, H - fy, PAL.surround);
  quad(ctx, [[-COURT.dhw, -COURT.hl], [COURT.dhw, -COURT.hl], [COURT.dhw, COURT.hl], [-COURT.dhw, COURT.hl]], PAL.court);
  const { hw, dhw, hl, sv } = COURT;
  for (const x of [-dhw, -hw, hw, dhw]) cline(ctx, x, -hl, x, hl);
  for (const y of [-hl, hl]) cline(ctx, -dhw, y, dhw, y);
  for (const y of [-sv, sv]) cline(ctx, -hw, y, hw, y);
  cline(ctx, 0, -sv, 0, sv);
  for (const y of [-hl, hl]) cline(ctx, 0, y, 0, y + (y < 0 ? 0.35 : -0.35));   // the centre marks
  // the umpire's chair, east of the net
  const [ux, uy] = proj(dhw + 1.4, 0);
  rect(ctx, ux - 1, uy - 18, 1, 18, PAL.chair); rect(ctx, ux + 4, uy - 18, 1, 18, PAL.chair); rect(ctx, ux - 1, uy - 22, 6, 4, PAL.chair);
  COURT_CACHE = c;
  return c;
}

function drawNet(ctx) {
  const L = proj(-COURT.dhw - 0.9, 0), R = proj(COURT.dhw + 0.9, 0), s = L[2], h = Math.round(COURT.net * s * 0.95);
  for (let y = L[1] - h + 2; y < L[1]; y += 2) for (let x = L[0]; x <= R[0]; x += 2) rect(ctx, x + ((y >> 1) % 2), y, 1, 1, PAL.net);
  rect(ctx, L[0], L[1] - h, R[0] - L[0] + 1, 2, PAL.line);
  rect(ctx, L[0] - 1, L[1] - h - 1, 2, h + 1, PAL.post); rect(ctx, R[0], L[1] - h - 1, 2, h + 1, PAL.post);
}

// The racket's head for a swing frame: where the hand is, where the head points.
// face: +1 forehand to the screen right, -1 left. kind S: the serve, overhead.
function racketPose(P, back) {
  const f = P.swing, side = P.face;
  if (f < 0) return { hx: side * 5, hy: -8, ex: side * 7, ey: -15 };
  if (P.kind === "S") {
    if (f < 6) return { hx: side * 3, hy: -18, ex: side * 4, ey: -25 };
    if (f < 12) return { hx: side * 2, hy: -16, ex: side * -2, ey: -10 };
    return { hx: -side * 3, hy: -7, ex: -side * 7, ey: -2 };
  }
  const k = back ? -1 : 1;   // the far player swings toward the camera
  if (f < 5) return { hx: side * 6, hy: -9, ex: side * 11, ey: -9 + k * 3 };
  if (f < 11) return { hx: side * 5, hy: -9, ex: side * 6, ey: -9 - k * 6 };
  return { hx: -side * 3, hy: -9, ex: -side * 9, ey: -12 };
}

// A player: shoes, legs, shirt, arms, the head cut from the file photo, the racket.
function drawPlayer(ctx, P, look, frame) {
  const [sx, sy] = proj(P.x, P.y), far = P.side < 0;
  const step = P.mv ? ((frame >> 3) & 1) : 0;
  const shirt = look.kit[0], shorts = look.kit[1];
  // shadow
  rect(ctx, sx - 5, sy - 1, 10, 2, PAL.shadow);
  // legs and shoes
  rect(ctx, sx - 3, sy - 7 + (step ? 1 : 0), 2, 6, look.skin);
  rect(ctx, sx + 1, sy - 7 + (step ? 0 : 1), 2, 6, look.skin);
  rect(ctx, sx - 4, sy - 2 + (step ? 0 : 0), 3, 2, PAL.shoe); rect(ctx, sx + 1, sy - 2, 3, 2, PAL.shoe);
  // shorts, shirt
  rect(ctx, sx - 4, sy - 11, 8, 4, shorts);
  rect(ctx, sx - 4, sy - 19, 8, 8, shirt);
  rect(ctx, sx - 4, sy - 19, 8, 1, PAL.outline);
  // racket arm and the racket
  const r = racketPose(P, far);
  const hx = sx + r.hx, hy = sy + r.hy;
  line(ctx, sx + P.face * 3, sy - 17, hx, hy, look.skin, 2);
  line(ctx, hx, hy, sx + r.ex, sy + r.ey, PAL.grip);
  rect(ctx, sx + r.ex - 2, sy + r.ey - 2, 5, 5, PAL.racket); rect(ctx, sx + r.ex - 1, sy + r.ey - 1, 3, 3, PAL.court);
  // the other arm
  rect(ctx, sx - P.face * 5 - (P.face > 0 ? 1 : 0), sy - 18, 2, 6, look.skin);
  // head: the file photo's face, else a plain one
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
  const big = s > 11;
  rect(ctx, gx - 1, gy, big ? 3 : 2, 1, PAL.shadow);
  rect(ctx, bx - 1, by - 2, big ? 3 : 2, big ? 3 : 2, PAL.ball);
  rect(ctx, bx - 1, by - 2, 1, 1, PAL.ballHi);
}

// The frame. looks: [{kit, skin, head (canvas | null), hair}] for players 0 and 1.
export function draw(ctx, st, looks, frame) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(courtLayer(), 0, 0);
  const b = st.ball;
  const items = st.p.map(P => ({ y: P.y, f: () => drawPlayer(ctx, P, looks[P.i], frame) }));
  items.push({ y: 0, f: () => drawNet(ctx) });
  if (b) items.push({ y: b.y + 0.01, f: () => drawBall(ctx, b) });
  items.sort((a, c) => a.y - c.y);
  for (const it of items) it.f();
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
    // the head is the widest thing up there only above the shoulders: centre on the top rows' middle
    let tx0 = 32, tx1 = -1;
    for (let y = y0; y < y0 + 5; y++) for (let i = 0; i < 32; i++) if (d[(y * 32 + i) * 4 + 3] > 0) { tx0 = Math.min(tx0, i); tx1 = Math.max(tx1, i); }
    const cx = Math.round((tx0 + tx1) / 2), w = Math.min(14, x1 - x0 + 1), hx0 = Math.max(0, Math.min(32 - w, cx - (w >> 1)));
    const h = Math.min(12, 13 - y0);
    const o = document.createElement("canvas"); o.width = w; o.height = h;
    o.getContext("2d").drawImage(c, hx0, y0, w, h, 0, 0, w, h);
    return o;
  } catch { return null; }
}
