// THE TENNIS CLUB, playable: the picture. Browser only, reads the sim's state (and the broadcast's,
// show.js) and never writes either. 256 x 240 logical pixels (the NES's own frame), drawn with
// fillRect only, scaled by whole device pixels with smoothing off.
//
// One camera for everything (2026-10-05, Scott: "not considering linear perspective"): a pinhole
// high behind the near baseline, looking up the court, solved from where the two baselines sit on
// the frame and how wide each is. Every place on screen comes from proj(x, y, z) in court metres:
// the lines, the net's height, the walls and stands, the crowd's seats, the officials, the ball kids,
// the players and the ball, so the far end is shorter and narrower in the one proportion and
// everything standing on it shrinks with it. The sim's court is in metres and never sees this.
// Three surfaces (sim.js SURFACES): the hard court (the show court's blue), clay (brushed red,
// white tape, the ball's marks where it lands), grass (mown stripes, worn at the baselines).
import { COURT, serverOfMatch, ptrOf, gestureShot, gestureServe } from "./sim.js";
import { CHAIR, NET_JUDGE, JUDGES, REVIEW, BRAND } from "./show.js";
import { shrinkHead } from "../heads.js";
import { SLOT } from "../../ads/inventory.js";
import { drawAdBoard } from "../../ads/boards.js";
export { headFrom } from "../heads.js";

export const W = 256, H = 240;
const BASE = {
  bg: "#0a0f0a", stand: "#132013", seat: "#1c2e1f", step: "#0f1a10", wall: "#0f1a10", rim: "#2a4a30", board: "#1f4a2c", boardInk: "#c8f5d8", boardAlt: "#0a0f0a", boardAltInk: "#3fae5a",
  net: "#c8f5d8", post: "#8a8a8a", ball: "#e0e040", ballHi: "#ffffff",
  skin: "#c68c5e", racket: "#e6e6e6", grip: "#6b4a2e", shoe: "#e6e6e6", outline: "#0a0f0a",
  chair: "#9a9a9a", chairDk: "#5f5f5f", blazer: "#1f2f5a", trouser: "#262626", hat: "#e6e6e6", kid: "#6b3fa0", kidCap: "#e0c040",
  ump: "#33503a", umpDk: "#1d261e", umpSkin: "#c8c6b4", visor: "#0a0f0a", eye: "#5cff8a", gold: "#e0c040", mic: "#ff5050",
};
// Each surface's floor: court, its lighter and darker grain, the run-off, the lines, the shadows.
const SURF = {
  hard: { name: "THE SHOW COURT", court: "#2f5f8f", hi: "#36699b", lo: "#2a5683", out: "#1d4a6e", outHi: "#22527a", wear: "#3a6e9f", line: "#e6e6e6", shadow: "#15334f" },
  clay: { name: "THE RED CLAY COURT", court: "#b8562f", hi: "#c4653a", lo: "#a84c29", out: "#ad4f2b", outHi: "#b95b33", wear: "#cf7a4e", line: "#f2eee4", shadow: "#7a3519", mark: "#94401f", markHi: "#d98a5e", dust: "#d99a70" },
  grass: { name: "THE LAWN", court: "#4f9a3a", hi: "#5aa843", lo: "#478f34", out: "#468a33", outHi: "#509a3c", wear: "#a39a58", wearLo: "#8c8448", line: "#f4f4f4", shadow: "#2c5a22", mark: "#6fb455" },
};
export const SURFACE_NAMES = Object.fromEntries(Object.entries(SURF).map(([k, v]) => [k, v.name]));
let PAL = { ...BASE, ...SURF.hard };
const SHIRTS = ["#b83232", "#3a6fd8", "#e6e6e6", "#e0c040", "#3c8a46", "#d97a2b", "#6b3fa0", "#d977a8", "#8a8a8a", "#45618f", "#262626", "#d9ccb0"];
const SKINS = ["#f6d5bc", "#f1c9a5", "#e0b088", "#c68c5e", "#8d5a36", "#5c3a22"];

// ---- the camera ----------------------------------------------------------------------------------
// Where the baselines sit on the frame (screen y) and their scale (px per metre); the rest follows.
// The far baseline is where the old picture had it ("the back is good"); the near one narrower.
const NEAR_Y = 206, FAR_Y = 66, S_NEAR = 11.5, S_FAR = 8.6;
const CAM_H = (NEAR_Y - FAR_Y) / (S_NEAR - S_FAR);              // the camera's height, m (~48)
const DIST = S_FAR * 2 * COURT.hl / (S_NEAR - S_FAR);          // from the near baseline, m (~70)
const FOCAL = S_NEAR * DIST, HORIZON = NEAR_Y - CAM_H * S_NEAR, CX = 128;
const CAM_Y = COURT.hl + DIST;                                   // the camera's court y
// metres -> logical pixels: [x, y, scale (px per metre at that depth)]
export function proj(x, y, z = 0) {
  const s = FOCAL / (CAM_Y - y);
  return [Math.round(CX + x * s), Math.round(HORIZON + (CAM_H - z) * s), s];
}
// logical pixels -> the court floor, metres (the pointer: where a click on the picture lands), or null above the horizon
export function unproj(px, py) {
  const s = (py - HORIZON) / CAM_H;
  if (s <= 0) return null;
  return { x: (px - CX) / s, y: CAM_Y - FOCAL / s };
}
const projF = (x, y, z = 0) => { const s = FOCAL / (CAM_Y - y); return [CX + x * s, HORIZON + (CAM_H - z) * s, s]; };
// The arena, metres: the side walls, the back wall, how high each is, the stands' tiers behind them.
export const ARENA = { sideX: COURT.dhw + 3.9, sideH: 2.4, backY: -(COURT.hl + 5.2), backH: 2.6, tier: 0.9, rise: 0.6 };

function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
// A drawing in its own units at k px a unit, origin (ox, oy): each rect's edges rounded (not its
// size), so pieces meet at any scale; anything given a size keeps at least a pixel.
function pen(ctx, ox, oy, k) {
  return (x, y, w, h, c) => {
    const x0 = Math.round(ox + x * k), y0 = Math.round(oy + y * k);
    const x1 = Math.max(x0 + 1, Math.round(ox + (x + w) * k)), y1 = Math.max(y0 + 1, Math.round(oy + (y + h) * k));
    ctx.fillStyle = c; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  };
}
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
const hash = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
const rgbOf = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ---- a 3 x 5 type, for the boards and the broadcast's furniture ----------------------------------
const GL = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111", F: "111100110100100",
  G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111",
  M: "101111111101101", N: "110101101101101", O: "010101101101010", P: "110101110100100", Q: "010101101110011", R: "110101110101101",
  S: "011100010001110", T: "111010010010010", U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101",
  Y: "101101010010010", Z: "111001010100111", 0: "111101101101111", 1: "010110010010111", 2: "110001010100111", 3: "110001010001110",
  4: "101101111001001", 5: "111100110001110", 6: "011100111101111", 7: "111001010010010", 8: "111101111101111", 9: "111101111001110",
  ".": "000000000000010", ",": "000000000010100", "-": "000000111000000", "\u2014": "000000111000000", "?": "110001010000010", ":": "000010000010000", "!": "010010010000010", "'": "010010000000000", "/": "001001010100100",
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

// ---- the static layer: stands, walls, the floor, the lines ---------------------------------------
// Cast once per surface, a ray a pixel: whatever the camera sees first (the floor, a side wall, the
// back wall, a stand's tiers) gives the pixel its colour from where it is in metres.
const LAYERS = new Map();
function floorRGB(sf, X, Y, sx, sy) {
  const { dhw, hl } = COURT, ax = Math.abs(X), ay = Math.abs(Y), inC = ax <= dhw + 0.02 && ay <= hl + 0.02, h = hash(sx, sy + 7);
  if (sf === "clay") {
    // the drag mat's brushing: bands across the court, broken into long streaks
    const band = Math.floor(Y * 5), seg = Math.floor((X + (hash(band, 3) % 100) / 30) / 1.4), t = hash(band, seg) % 9;
    let c = t === 0 ? PAL.hi : t === 1 ? PAL.lo : inC ? PAL.court : PAL.out;
    if (h % 17 === 0) c = PAL.hi; else if (h % 19 === 0) c = PAL.lo;
    // scuffed behind the baselines, where the serving and the sliding happen
    if (ax < 2.8 && ay > hl - 1.2 && ay < hl + 2.6) { const p = (1 - ax / 2.8) * (1 - Math.abs(ay - (hl + 0.5)) / 2.1); if ((h % 100) / 100 < p * 0.6) c = PAL.wear; }
    return c;
  }
  if (sf === "grass") {
    // mown stripes across the court, the run-off darker; worn to earth at the baselines
    const stripe = Math.floor((Y + 40) / 2.2) & 1;
    let c = inC || ay <= hl + 3 ? (stripe ? PAL.hi : PAL.court) : (stripe ? PAL.outHi : PAL.out);
    if (h % 13 === 0) c = PAL.lo;
    if (ax < 2.6 && ay > hl - 1.3 && ay < hl + 2.2) {
      const p = (1 - ax / 2.6) * (1 - Math.abs(ay - (hl + 0.35)) / 1.85);
      const r = (h % 100) / 100;
      if (r < p * 0.9) c = r < p * 0.45 ? PAL.wearLo : PAL.wear;
    } else if (ax < 0.9 && Math.abs(ay - COURT.sv) < 0.5 && h % 3 === 0) c = PAL.lo;   // the T, lightly
    return c;
  }
  let c = inC ? PAL.court : PAL.out;
  if (inC) { if (h % 11 === 0) c = PAL.hi; else if (h % 13 === 0) c = PAL.lo; } else if (h % 9 === 0) c = PAL.outHi;
  if (inC && ax < 1.9 && ay > hl - 1.1) { const p = (1 - ax / 1.9) * 0.55 * (1 - (hl - ay) / 1.1); if ((hash(sx * 3, sy) % 100) / 100 < p) c = PAL.wear; }
  return c;
}
function courtLayer(sf) {
  if (LAYERS.has(sf)) return LAYERS.get(sf);
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d"); ctx.imageSmoothingEnabled = false;
  const { sideX, sideH, backY, backH, tier, rise } = ARENA, SL = rise / tier, dB = CAM_Y - backY;
  const img = ctx.createImageData(W, H), d = img.data, cache = new Map();
  const put = (o, hex) => { let v = cache.get(hex); if (!v) { v = rgbOf(hex); cache.set(hex, v); } d[o] = v[0]; d[o + 1] = v[1]; d[o + 2] = v[2]; d[o + 3] = 255; };
  for (let sy = 0; sy < H; sy++) for (let sx = 0; sx < W; sx++) {
    const a = (sx + 0.5 - CX) / FOCAL, b = (sy + 0.5 - HORIZON) / FOCAL, aa = Math.abs(a), o = (sy * W + sx) * 4;
    let best = Infinity, col = BASE.bg;
    const at = (dd) => [a * dd, CAM_Y - dd, CAM_H - b * dd];
    if (b > 0) { const dd = CAM_H / b, [X, Y] = at(dd); if (Math.abs(X) <= sideX && Y >= backY && dd < best) { best = dd; col = floorRGB(sf, X, Y, sx, sy); } }
    if (aa > 1e-9) {
      const dd = sideX / aa, [, Y, Z] = at(dd);
      if (Z >= 0 && Z <= sideH && Y >= backY && dd < best) {
        best = dd;
        // the side wall: a rim, and one quiet run of board along it (the inventory's tennis-side-*
        // slots, src/ads/inventory.js: plain until sold), a dark seam every 4.2 m
        col = Z > sideH - 0.18 ? BASE.rim : Z > 0.35 && Z < sideH - 0.4 ? (((Y + 40) / 4.2) % 1 < 0.04 ? BASE.wall : BASE.board) : BASE.wall;
      }
    }
    { const dd = dB, [X, , Z] = at(dd); if (Math.abs(X) <= sideX && Z >= 0 && Z <= backH && dd < best) { best = dd; col = Z > backH - 0.15 ? BASE.rim : BASE.wall; } }
    const tiers = (dist) => { const r = Math.floor(dist / tier), f = dist / tier - r; return f < 0.22 ? BASE.step : r & 1 ? BASE.seat : BASE.stand; };
    { const den = b + aa * SL; if (den > 0) { const dd = (CAM_H - sideH + sideX * SL) / den, X = aa * dd; if (X >= sideX && dd < best) { best = dd; col = tiers(X - sideX); } } }
    { const den = b + SL; if (den > 0) { const dd = (CAM_H - backH + dB * SL) / den; if (dd >= dB && dd < best) { best = dd; col = tiers(dd - dB); } } }
    put(o, col);
  }
  ctx.putImageData(img, 0, 0);
  const { hw, dhw, hl, sv } = COURT;
  for (const x of [-dhw, -hw, hw, dhw]) cline(ctx, x, -hl, x, hl);
  for (const y of [-hl, hl]) cline(ctx, -dhw, y, dhw, y);
  for (const y of [-sv, sv]) cline(ctx, -hw, y, hw, y);
  cline(ctx, 0, -sv, 0, sv);
  for (const y of [-hl, hl]) cline(ctx, 0, y, 0, y + (y < 0 ? 0.35 : -0.35));   // the centre marks
  LAYERS.set(sf, c);
  return c;
}

// The back wall's boards: three, from the ad inventory (src/ads/inventory.js, tennis-back-*), in
// one row with the wall's dark showing round them. Today a small Electric Basement mark in the
// middle and two plain boards; drawn each frame (not in the cached layer) so the mark appears the
// moment the brand atlas lands.
const BACK = ["tennis-back-left", "tennis-back-centre", "tennis-back-right"].map(id => SLOT[id]);
const FONT = { text, textW };
function drawBackBoards(ctx) {
  const { sideX, backY, backH } = ARENA, gap = 0.6, span = BACK.reduce((a, b) => a + b.size.w, 0) + gap * (BACK.length - 1);
  const [, top] = proj(0, backY, backH), [, bot] = proj(0, backY, 0), h = 10, y = Math.round((top + bot) / 2 - h / 2);
  let m = -span / 2;
  for (const slot of BACK) {
    const [a] = proj(Math.max(-sideX, m), backY, 0), [b] = proj(Math.min(sideX, m + slot.size.w), backY, 0);
    drawAdBoard(ctx, slot, a, y, b - a, h, FONT, { board: BASE.board, ink: BASE.boardInk, dim: BASE.boardAltInk });
    m += slot.size.w + gap;
  }
}

// ---- the crowd: every seat counted, every seat on the camera --------------------------------------
let SEATS = null;
function seats() {
  if (SEATS) return SEATS;
  const { sideX, sideH, backY, backH, tier, rise } = ARENA, out = [];
  const add = (x, y, z, side, h) => {
    if (h % 10 < 2) return;   // an empty seat
    const [px, py, s] = projF(x, y, z);
    if (px < -4 || px > W + 4 || py < 2 || py > H + 2) return;
    out.push({ px: Math.round(px), py: Math.round(py), s, d: CAM_Y - y + Math.abs(x) * 0.01, side, shirt: SHIRTS[h % SHIRTS.length], skin: SKINS[(h >>> 5) % SKINS.length], ph: (h >>> 9) % 12, tall: (h >>> 12) % 5 });
  };
  for (let r = 0; r < 14; r++) for (let x = -sideX + 0.3 + (r % 2) * 0.25; x < sideX - 0.2; x += 0.5) add(x, backY - tier * (r + 0.7), backH + rise * (r + 0.7), 0, hash(Math.round(x * 10), r + 1));
  for (const sg of [-1, 1]) for (let r = 0; r < 24; r++) for (let y = backY + 0.4 + (r % 2) * 0.33; y < CAM_Y - 30; y += 0.66) add(sg * (sideX + tier * (r + 0.7)), y, sideH + rise * (r + 0.7), sg, hash(Math.round(y * 10) * 3 + sg, r + 50));
  out.sort((a, b) => b.d - a.d);
  SEATS = out;
  return out;
}
function drawCrowd(ctx, show, ballPx) {
  const S = show?.state, t = S ? S.t : 0, mood = S?.crowd.mood || "idle";
  const [bx, by] = ballPx || [128, 120];
  for (const p of seats()) {
    const bw = Math.max(2, Math.round(p.s * 0.42)), bh = Math.max(2, Math.round(p.s * 0.3)), hs = Math.max(2, Math.round(p.s * 0.24));
    const up = mood === "stand" && p.tall > 0, dy = up ? -1 : 0, x = p.px - (bw >> 1), y = p.py - bh + dy;
    rect(ctx, x, y, bw, bh, p.shirt);
    // the head turns with the ball: the dark pixel is the back of the head
    let hx = x + ((bw - hs) >> 1), eye;
    if (p.side === 0) { const look = bx < p.px - 24 ? -1 : bx > p.px + 24 ? 1 : 0; hx += look > 0 ? 1 : 0; eye = look; } else eye = by < p.py - 30 ? -1 : by > p.py + 30 ? 1 : 0;
    const hy = y - hs;
    rect(ctx, hx, hy, hs, hs, p.skin);
    if (p.side === 0) rect(ctx, eye < 0 ? hx + hs - 1 : hx, hy, eye === 0 ? hs : 1, 1, "#2a1a10");
    else rect(ctx, p.side < 0 ? hx : hx + hs - 1, eye < 0 ? hy + 1 : hy, 1, 1, "#2a1a10");
    if (mood === "clap" || mood === "stand") {
      const beat = ((t + p.ph * 2) >> 2) & 1;
      if (up) { rect(ctx, x - 1, hy - (beat ? 1 : 0), 1, 2, p.skin); rect(ctx, x + bw, hy - (beat ? 0 : 1), 1, 2, p.skin); }
      else rect(ctx, x + (beat ? 0 : 1), y + 1, beat ? bw : 1, 1, p.skin);
    } else if (((t >> 5) + p.ph) % 23 === 0) rect(ctx, x + bw, y, 1, 1, p.skin);   // a fidget
  }
}

// ---- the marks on the floor: the ball's on clay, and a slide's ------------------------------------
const MARKS = new WeakMap();
function trackMarks(st) {
  let m = MARKS.get(st);
  if (!m) { m = { ball: null, n: 0, list: [], skid: [0, 0] }; MARKS.set(st, m); }
  if (st.surface !== "clay") return m;
  const b = st.ball;
  if (b !== m.ball) { m.ball = b; m.n = b ? b.bounces : 0; }
  if (b && b.bounces > m.n) { if (m.n < 2 && b.y > ARENA.backY + 0.3 && Math.abs(b.x) < ARENA.sideX - 0.3) m.list.push({ x: b.x, y: b.y, kind: 0, r: hash(m.list.length, st.frame) }); m.n = b.bounces; }
  for (const P of st.p) if (P.slide > 0 && st.frame - m.skid[P.i] >= 3) { m.skid[P.i] = st.frame; m.list.push({ x: P.x, y: P.y, kind: 1, r: hash(P.i, st.frame) }); }
  if (m.list.length > 70) m.list.splice(0, m.list.length - 70);
  return m;
}
function drawMarks(ctx, m) {
  for (const k of m.list) {
    const [x, y, s] = proj(k.x, k.y);
    if (k.kind === 0) {
      // an oval pressed into the clay, its lip pushed up on the far side
      const w = Math.max(3, Math.round(s * 0.32)), h = Math.max(2, Math.round(s * 0.15)), x0 = x - (w >> 1);
      rect(ctx, x0, y, w, h, PAL.mark); rect(ctx, x0 + 1, y - 1, w - 2, 1, PAL.markHi); rect(ctx, x0 + w, y, 1, h - 1, PAL.markHi);
    } else rect(ctx, x - 1 + (k.r % 3) - 1, y, 2, 1, (k.r & 4) ? PAL.wear : PAL.lo);
  }
}

// ---- the officials ------------------------------------------------------------------------------
// The chair's official, in units of k px, origin at the seat's top centre; it faces the court (left).
export function drawUmpire(ctx, ox, oy, k, look, talking, t) {
  const R = pen(ctx, ox, oy, k);
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
// The high chair: its seat 2.2 m up, on the same camera as the court; the unit sits on it.
const CHAIR_Z = 2.2, UMP_K = 0.072;
function chairGeo() {
  const [ux, uy, s] = projF(CHAIR.x, CHAIR.y), top = Math.round(uy - CHAIR_Z * s);
  return { ux: Math.round(ux), uy: Math.round(uy), s, top, k: s * UMP_K };
}
function drawChair(ctx, ump, frame) {
  const { ux, uy, s, top, k } = chairGeo(), hw = Math.round(0.5 * s), u = Math.max(1, Math.round(s / 6));
  rect(ctx, ux - hw - 2, uy - 1, 2 * hw + 4, 2, PAL.shadow);
  rect(ctx, ux - hw, top, u, uy - top, PAL.chair); rect(ctx, ux + hw - u + 1, top - Math.round(1.1 * s), u, uy - top + Math.round(1.1 * s), PAL.chair);
  for (let y = top + Math.round(0.5 * s); y < uy; y += Math.max(3, Math.round(0.5 * s))) rect(ctx, ux - hw, y, 2 * hw + 1, 1, PAL.chairDk);
  rect(ctx, ux - hw - 2, top - 1, 2 * hw + 4, 2, PAL.chairDk); rect(ctx, ux - hw - 4, uy - Math.round(1.3 * s), 4, 1, PAL.chairDk);
  const bw = Math.max(13, 2 * hw + 1);
  rect(ctx, ux - (bw >> 1), uy - Math.round(1.25 * s), bw, 7, PAL.board); text(ctx, "HVI", ux - 5, uy - Math.round(1.25 * s) + 1, PAL.boardInk);
  drawUmpire(ctx, ux, top - 1, k, ump.look, ump.talking, frame);
}
// A line judge (or the net judge): seated, or up with the arm out for a call.
function drawJudge(ctx, J, i, call, hand) {
  const [x, y, s] = projF(J.x, J.y), R = pen(ctx, Math.round(x), Math.round(y), s * 0.075), skin = SKINS[(i * 5 + 2) % SKINS.length];
  R(-4, -1, 9, 2, PAL.shadow);
  if (call) {
    R(-2, -7, 1, 7, PAL.trouser); R(1, -7, 1, 7, PAL.trouser);
    R(-2, -13, 4, 6, PAL.blazer); R(-1, -17, 3, 4, skin); R(-2, -18, 5, 2, PAL.hat);
    const d = call.dir;
    R(d > 0 ? 2 : -8, -12, 6, 1, PAL.blazer); R(d > 0 ? 8 : -9, -12, 1, 1, skin);
    return;
  }
  R(-3, -6, 6, 1, PAL.chairDk); R(-3, -5, 1, 5, PAL.chairDk); R(2, -5, 1, 5, PAL.chairDk);
  R(-2 + J.face, -8, 4, 2, PAL.trouser); R(-2, -13, 4, 5, PAL.blazer);
  R(-1, -17, 3, 4, skin); R(-2, -18, 5, 2, PAL.hat);
  if (hand) { R(J.face * 2, -19, 1, 6, PAL.blazer); R(J.face * 2, -20, 1, 1, skin); }
}
function drawKid(ctx, K, frame, ball) {
  const [x, y, s] = projF(K.x, K.y), R = pen(ctx, Math.round(x), Math.round(y), s * 0.075), skin = "#c68c5e";
  R(-3, -1, 6, 2, PAL.shadow);
  if (K.mv) {
    const st = (frame >> 2) & 1;
    R(-2, -5 + st, 1, 5 - st, PAL.trouser); R(1, -5 + (1 - st), 1, 4 + st, PAL.trouser);
    R(-2, -10, 4, 5, PAL.kid); R(-1, -13, 3, 3, skin); R(-2, -14, 4, 1, PAL.kidCap);
    if (ball) R(2, -8, 2, 2, PAL.ball);
  } else {
    R(-2, -3, 4, 3, PAL.trouser); R(-2, -6, 4, 3, PAL.kid);
    R(-1, -9, 3, 3, skin); R(-2, -10, 4, 1, PAL.kidCap);
  }
}

// The net: 0.914 m at the strap on the camera, posts a little higher, the mesh, the tape.
function drawNet(ctx) {
  const ex = COURT.dhw + 0.914, L = proj(-ex, 0), Rt = proj(ex, 0), s = L[2], h = Math.round(COURT.net * s), hp = Math.round(1.07 * s);
  rect(ctx, L[0], L[1], Rt[0] - L[0], 2, PAL.shadow);
  for (let y = L[1] - h + 2; y < L[1]; y += 2) for (let x = L[0]; x <= Rt[0]; x += 2) rect(ctx, x + ((y >> 1) % 2), y, 1, 1, PAL.net);
  rect(ctx, L[0], L[1] - h, Rt[0] - L[0] + 1, 1, PAL.line);
  rect(ctx, CX - 1, L[1] - h, 2, h, PAL.line);   // the centre strap
  rect(ctx, L[0] - 1, L[1] - hp, 2, hp, PAL.post); rect(ctx, Rt[0], L[1] - hp, 2, hp, PAL.post);
}

// The racket's head for a swing frame, in the player's units: where the hand is, where the head points.
function racketPose(P, back) {
  const f = P.swing, side = P.face, q = (hx, hy, ex, ey) => ({ hx: hx * 0.66, hy: hy * 0.66, ex: ex * 0.66, ey: ey * 0.66 });
  if (f < 0) return q(side * 5, -8, side * 7, -15);
  if (P.kind === "S") {
    if (f < 6) return q(side * 3, -18, side * 4, -25);
    if (f < 12) return q(side * 2, -16, side * -2, -10);
    return q(-side * 3, -7, -side * 7, -2);
  }
  const k = back ? -1 : 1;
  if (f < 5) return q(side * 6, -9, side * 11, -9 + k * 3);
  if (f < 11) return q(side * 5, -9, side * 6, -9 - k * 6);
  return q(-side * 3, -9, -side * 9, -12);
}

// A player, 1.8 m on the camera (about a third to a half of a service box's depth at the near
// baseline, less at the far one): shadow, shoes, legs, the sport's kit, arms, the racket, and the
// head cut from the file photo (heads.js: the head only; what they carry in daily life stays home),
// made smaller with the distance. Units of k px, k from the depth.
const PK = 0.1, P_H = 18;
function drawPlayer(ctx, P, look, frame) {
  const [fx, fy, s] = projF(P.x, P.y), sx = Math.round(fx), sy = Math.round(fy), k = s * PK, far = P.side < 0, R = pen(ctx, sx, sy, k);
  const step = P.mv ? ((frame >> 3) & 1) : 0;
  const shirt = look.kit[0], shorts = look.kit[1];
  R(-4.5, -0.6, 9, 1.4, PAL.shadow);
  if (P.slide > 0 && PAL.dust) { const d = -Math.sign(P.vx || P.face) || 1; R(d * 4, -1.4, 1.2, 1, PAL.dust); R(d * 5.6, -2.4, 1, 1, PAL.dust); if ((frame >> 2) & 1) R(d * 6.6, -1, 1, 1, PAL.dust); }
  R(-2.8, -6.2 + step * 0.8, 2, 4.8, look.skin); R(0.8, -6.2 + (1 - step) * 0.8, 2, 4.8, look.skin);
  R(-3.4, -1.6, 2.8, 1.6, PAL.shoe); R(0.6, -1.6, 2.8, 1.6, PAL.shoe);
  R(-3.2, -8.8, 6.4, 3, shorts);
  R(-3.2, -13.4, 6.4, 4.8, shirt);
  const r = racketPose(P, far), hx = sx + r.hx * k, hy = sy + r.hy * k, ex = sx + r.ex * k, ey = sy + r.ey * k;
  line(ctx, sx + P.face * 2.4 * k, sy - 12.6 * k, hx, hy, look.skin, k > 1.05 ? 2 : 1);
  line(ctx, hx, hy, ex, ey, PAL.grip);
  const rk = pen(ctx, ex, ey, k);
  rk(-1.6, -1.6, 3.2, 3.2, PAL.racket); rk(-0.6, -0.6, 1.2, 1.2, PAL.court);
  if (P.appeal > 8) { const a = -P.face; R(a * 3.4 - 0.6, -21.6, 1.4, 8.6, look.skin); R(a * 3.4 - 0.9, -23, 2, 1.8, look.skin); }   // a hand up to the chair
  else R(-P.face * 4.2 - (P.face > 0 ? 0.6 : 0), -12.8, 1.4, 4.4, look.skin);
  const th = Math.max(4, Math.round(5.8 * k)), hd = look.head ? shrinkHead(look.head, th) : null;
  if (hd) ctx.drawImage(hd, Math.round(sx - hd.width / 2), Math.round(sy - 13.4 * k) - hd.height + 1);
  else {
    R(-2.4, -18.6, 4.8, 5.4, look.skin); R(-2.6, -19.2, 5.2, 2, look.hair || "#3b2417");
    if (!far) { R(-1.4, -16.4, 0.8, 0.8, PAL.outline); R(0.8, -16.4, 0.8, 0.8, PAL.outline); }
  }
}
export const playerPx = (y) => Math.round(projF(0, y)[2] * PK * P_H);   // a player's height on screen at y

function drawBall(ctx, b) {
  const [gx, gy] = proj(b.x, b.y), [bx, by, s] = proj(b.x, b.y, b.z);
  const n = s > 10.4 ? 3 : 2, hi = b.z > 2.5;
  rect(ctx, gx - 1, gy, hi ? 2 : n, 1, PAL.shadow);
  rect(ctx, bx - 1, by - n + 1, n, n, PAL.ball);
  rect(ctx, bx - 1, by - n + 1, 1, 1, PAL.ballHi);
}

// The serve's timing hint: the toss's height against the band where it is best struck.
function drawTossMeter(ctx, st) {
  const P = st.p[0], [sx, sy] = proj(P.x, P.y), x = sx + (P.x > 0 ? -16 : 12), y0 = sy - 32, hgt = 26;
  const zy = (z) => y0 + hgt - Math.round((Math.max(1.2, Math.min(3.4, z)) - 1.2) / 2.2 * hgt);
  rect(ctx, x - 1, y0 - 1, 5, hgt + 2, PAL.outline);
  rect(ctx, x, y0, 3, hgt, "#22382a");
  rect(ctx, x, zy(3.15), 3, zy(2.6) - zy(3.15), PAL.eye);
  if (st.ball && st.sub === "toss") rect(ctx, x - 1, zy(st.ball.z), 5, 1, PAL.ball);
}

// The frame. looks: [{kit, skin, head (canvas | null), hair}] for players 0 and 1. show: the
// broadcast (show.js), or null for the bare court.
const PALS = new Map();
export function draw(ctx, st, looks, frame, show = null) {
  const sf = SURF[st.surface] ? st.surface : "hard";
  if (!PALS.has(sf)) PALS.set(sf, { ...BASE, ...SURF[sf] });
  PAL = PALS.get(sf);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(courtLayer(sf), 0, 0);
  drawBackBoards(ctx);
  drawMarks(ctx, trackMarks(st));
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
  if (st.v >= 3 && !st.p[0].cpu) drawAim(ctx, st);
}

// The pointer, held: where the player is running (a small cross on the floor) and, from the
// player, the shot the drag is setting (its direction and colour: topspin green, slice blue, flat
// white, lob gold). Nothing when the pointer is not down.
const SPIN_INK = { drive: "#5cff8a", slice: "#6fb0ff", flat: "#e6e6e6", lob: "#e0c040", kick: "#5cff8a", sserve: "#6fb0ff", serve: "#e6e6e6" };
const SPIN_TAG = { drive: "TOP", slice: "SLICE", flat: "FLAT", lob: "LOB", kick: "KICK", sserve: "SLICE", serve: "FLAT" };
function drawAim(ctx, st) {
  const P = st.p[0];
  if (P.goal) { const [gx, gy] = proj(P.goal.x, P.goal.y); rect(ctx, gx - 2, gy, 5, 1, PAL.ball); rect(ctx, gx, gy - 2, 1, 5, PAL.ball); }
  const pt = ptrOf(st.mask);
  if (!pt) return;
  const serving = st.phase === "serve" && serverOfMatch(st) === 0, kind = serving ? gestureServe(pt.gx, pt.gy).spin : gestureShot(pt.gx, pt.gy).shot;
  // beside the player (the side the drag leans to), clear of the head
  const [sx, sy, s] = proj(P.x, P.y), dir = pt.gx < 0 ? -1 : 1, ox = sx + dir * Math.round(s * 0.8), oy = Math.round(sy - s * 0.9), len = Math.hypot(pt.gx, pt.gy);
  const ink = SPIN_INK[kind] || "#e6e6e6", tag = SPIN_TAG[kind] || "";
  let tx = ox + dir * 4, ty = oy - 2;
  if (len < 0.5) { rect(ctx, ox - 2, oy - 2, 5, 5, PAL.outline); rect(ctx, ox - 1, oy - 1, 3, 3, ink); }
  else {
    const ux = pt.gx / len, uy = pt.gy / len, L = 6 + 4 * len, ex = ox + ux * L, ey = oy + uy * L;
    line(ctx, ox + 1, oy + 1, ex + 1, ey + 1, PAL.outline); line(ctx, ox, oy, ex, ey, ink);
    line(ctx, ex, ey, ex - ux * 3 - uy * 2, ey - uy * 3 + ux * 2, ink); line(ctx, ex, ey, ex - ux * 3 + uy * 2, ey - uy * 3 - ux * 2, ink);
    tx = ex + dir * 4; ty = ey + (uy > 0.3 ? 2 : uy < -0.3 ? -6 : -2);
  }
  if (dir < 0) tx -= textW(tag);
  rect(ctx, tx - 1, ty - 1, textW(tag) + 2, 7, PAL.outline);
  text(ctx, tag, tx, ty, ink);
}

// Where a speaker's head is on the 256 x 240 frame (the page puts the speech box there).
export function speakerAt(who, j = 0) {
  if (who === "chair") { const { ux, top, k } = chairGeo(); return [ux - 6, Math.round(top - 24 * k)]; }
  const J = who === "net" ? NET_JUDGE : JUDGES[j] || JUDGES[0], [x, y, s] = proj(J.x, J.y);
  return [x, Math.round(y - 20 * s * 0.075)];
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
    // both arms up: a sleeve from the shoulder out to the elbow, the forearm up past the head, an
    // open hand; outlined like the photo. The hands pump on a beat.
    const w = (age >> 3) & 1, sl = box.shirt || "#8a8a8a", ink = "#141414";
    const limb = (pts, c) => {
      for (let k = 1; k < pts.length; k++) {
        const [ax, ay] = pts[k - 1], [bx, by] = pts[k], n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) || 1;
        for (let i = 0; i <= n; i++) { const x = Math.round(ax + ((bx - ax) * i) / n), y = Math.round(ay + ((by - ay) * i) / n); R(x - 1, y - 1, 4, 4, ink); }
      }
      for (let k = 1; k < pts.length; k++) {
        const [ax, ay] = pts[k - 1], [bx, by] = pts[k], n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) || 1;
        for (let i = 0; i <= n; i++) { const x = Math.round(ax + ((bx - ax) * i) / n), y = Math.round(ay + ((by - ay) * i) / n); R(x, y, 2, 2, typeof c === "function" ? c(k) : c); }
      }
    };
    for (const sd of [-1, 1]) {
      const sh = [cx + sd * 7 - (sd < 0 ? 1 : 0), y0 + 17], el = [cx + sd * 12 - (sd < 0 ? 1 : 0), y0 + 9], hd = [cx + sd * (10 + w) - (sd < 0 ? 1 : 0), y0 - 1 - w];
      limb([sh, el, hd], (k) => (k === 1 ? sl : sk));
      const hx = hd[0] - 1, hy = hd[1] - 3;
      R(hx - 1, hy - 1, 5, 5, ink); R(hx, hy, 3, 3, sk); R(hx + (sd < 0 ? 0 : 2), hy - 1, 1, 1, sk);   // the hand, a thumb out
    }
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
  const box = { cx: 16, y0: 2, skin: null, shirt: null };
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
    // the shirt: the commonest colour across the chest, for a raised arm's sleeve
    const cd = x.getImageData(0, 0, 32, 34).data, m = new Map();
    for (let y = Math.min(33, y0 + 18); y < Math.min(34, y0 + 22); y++) for (let i = box.cx - 6; i <= box.cx + 6; i++) {
      const o = (y * 32 + i) * 4; if (cd[o + 3] < 200 || cd[o] + cd[o + 1] + cd[o + 2] < 60) continue;
      const k = `#${[cd[o], cd[o + 1], cd[o + 2]].map(v => v.toString(16).padStart(2, "0")).join("")}`; if (k === box.skin) continue; m.set(k, (m.get(k) || 0) + 1);
    }
    let sn = 0; for (const [k, v] of m) if (v > sn) { sn = v; box.shirt = k; }
  } catch { /* the default box */ }
  return box;
}

// ---- THE DEPARTMENT'S EYE: a challenge's review ---------------------------------------------------
// The broadcast's own ball-tracking replay (no one else's): the flight drawn as a trail, slowing to
// the bounce; the camera coming down onto the mark; the measurement; the verdict; the brand line.
// d: show.js S.review.d (the sim's challenge, copied: the bounce, the velocity into it, the flight's
// time, the margin m and the line). Every pixel of floor is ray-cast from a camera of its own, so a
// 5 cm line and a 3 mm gap are the size they are at any zoom. reduced: still frames, no camera move.
const RV = { bg: [6, 12, 8], grid: [16, 40, 24], ink: "#c8f5d8", dim: "#3fae5a", eye: "#5cff8a", warn: "#ffe14a", ball: "#e0e040", trail: "#d97a2b" };
const LW = 0.05;   // a line's width, m
function eyeCam(T, psi, th, dist) {
  const hx = Math.sin(psi), hy = Math.cos(psi), c = Math.cos(th), sn = Math.sin(th);
  const C = [T[0] + dist * hx * c, T[1] + dist * hy * c, T[2] + dist * sn];
  const f = [-hx * c, -hy * c, -sn], r = [hy, -hx, 0], u = [-hx * sn, -hy * sn, c];
  return { C, f, r, u, F: 210 };
}
function eyeProj(cam, x, y, z) {
  const dx = x - cam.C[0], dy = y - cam.C[1], dz = z - cam.C[2];
  const zc = dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2];
  if (zc <= 0.01) return null;
  const xc = dx * cam.r[0] + dy * cam.r[1], yc = dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2];
  return [W / 2 + cam.F * xc / zc, H / 2 - cam.F * yc / zc, cam.F / zc];
}
// The floor, a ray a pixel: the court, its lines at their width, the run-off, the mark (mark: null or
// {x, y, ax, ay}: an ellipse's half-axes along x and y).
let EYE_IMG = null;
function eyeFloor(ctx, cam, sf, mark) {
  if (!EYE_IMG) EYE_IMG = ctx.createImageData(W, H);
  const d = EYE_IMG.data, P = SURF[sf] || SURF.hard, court = rgbOf(P.court), out = rgbOf(P.out), ln = rgbOf(P.line), mk = rgbOf("#e0e040"), mkE = rgbOf("#8a7a10");
  const { hw, dhw, hl, sv } = COURT;
  for (let sy = 0; sy < H; sy++) {
    const b = (sy + 0.5 - H / 2) / cam.F;
    for (let sx = 0; sx < W; sx++) {
      const a = (sx + 0.5 - W / 2) / cam.F, o = (sy * W + sx) * 4;
      const rx = cam.f[0] + cam.r[0] * a - cam.u[0] * b, ry = cam.f[1] + cam.r[1] * a - cam.u[1] * b, rz = cam.f[2] - cam.u[2] * b;
      let c = RV.bg;
      if (rz < -1e-6) {
        const t = -cam.C[2] / rz, X = cam.C[0] + rx * t, Y = cam.C[1] + ry * t, ax = Math.abs(X), ay = Math.abs(Y);
        if (ax < dhw + 4 && ay < hl + 6) {
          const inC = ax <= dhw && ay <= hl;
          c = inC ? court : out;
          const onLine = (ay <= hl && ay >= hl - LW && ax <= dhw) || (ay <= hl && ((ax <= hw && ax >= hw - LW) || (ax <= dhw && ax >= dhw - LW))) ||
            (ax <= hw && ay <= sv && ay >= sv - LW) || (ay <= sv && ax <= LW / 2) || (ax <= LW / 2 && ay >= hl - 0.1 && ay <= hl);
          if (onLine) c = ln;
          if (mark) {
            const ex = (X - mark.x) / mark.ax, ey = (Y - mark.y) / mark.ay, e = ex * ex + ey * ey;
            if (e <= 1) c = e > 0.72 ? mkE : mk;
          }
        } else if ((Math.round(X) + Math.round(Y)) % 4 === 0) c = RV.grid;
      } else if (sy % 12 === 0 || sx % 16 === 0) c = RV.grid;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
  }
  ctx.putImageData(EYE_IMG, 0, 0);
}
// The flight, from the bounce back to the racket: s 0 (the hit) .. 1 (the bounce) -> [x, y, z].
function flightAt(d, s) {
  const tau = (1 - s) * d.t, g = 9.8 * (d.grav || 1);
  return [d.x - d.vx * tau, d.y - d.vy * tau, Math.max(0, -d.vz * tau - 0.5 * g * tau * tau)];
}
const ease = (k) => (k < 0 ? 0 : k > 1 ? 1 : k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k));
function centred(ctx, s, y, c, k = 1) { text(ctx, s, Math.round((W - textW(s, k)) / 2), y, c, k); }

export function drawReview(ctx, d, age, reduced = false) {
  ctx.imageSmoothingEnabled = false;
  const R2 = REVIEW, alongX = d.line === "BASELINE" || d.line === "SERVICE LINE";
  const start = flightAt(d, 0), sgn = start[1] >= d.y ? 1 : -1;
  const psi0 = Math.atan2(0.55 * (d.x >= 0 ? 1 : -1), 0.85 * sgn);
  let psi1 = alongX ? (sgn > 0 ? 0 : Math.PI) : (d.x >= 0 ? Math.PI / 2 : -Math.PI / 2);
  while (psi1 - psi0 > Math.PI) psi1 -= 2 * Math.PI;
  while (psi0 - psi1 > Math.PI) psi1 += 2 * Math.PI;
  const span = Math.hypot(start[0] - d.x, start[1] - d.y), mid = [(start[0] + d.x) / 2, (start[1] + d.y) / 2, 0.6];
  const dist0 = span * 0.75 + 7, dist1 = 0.42, th0 = 0.38, th1 = 1.5707;
  // where the review is: the flight's progress u, the zoom's k
  let u, k;
  if (reduced) { u = 1; k = age < R2.ZOOM ? 0 : 1; }
  else { const f = Math.min(1, Math.max(0, (age - R2.FLIGHT) / (R2.ZOOM - R2.FLIGHT))); u = 1 - (1 - f) * (1 - f) * (1 - f); k = ease((age - R2.ZOOM) / (R2.MARK - R2.ZOOM - 20)); }
  // the camera finds the bounce first, then comes down onto it
  const kt = ease(Math.min(1, k * 2.2)), kd = k * k;
  const T = [mid[0] + (d.x - mid[0]) * kt, mid[1] + (d.y - mid[1]) * kt, mid[2] * (1 - kt)];
  const cam = eyeCam(T, psi0 + (psi1 - psi0) * k, th0 + (th1 - th0) * k, Math.exp(Math.log(dist0) + (Math.log(dist1) - Math.log(dist0)) * kd));
  const landed = u >= 0.999;
  // the mark: its half-width across the line is the ball's 3 cm exactly (the call's own rule), so
  // the gap or the overlap on screen is the margin measured
  const mark = landed ? (alongX ? { x: d.x, y: d.y, ax: 0.05, ay: 0.03 } : { x: d.x, y: d.y, ax: 0.03, ay: 0.05 }) : null;
  eyeFloor(ctx, cam, d.surface, mark);
  // the trail, then the ball (drawn four times its size, as the television does)
  if (k < 0.95) {
    const n = 48;
    for (let i = 0; i <= n; i++) {
      const s = (i / n) * u, p = flightAt(d, s), q = eyeProj(cam, p[0], p[1], p[2]);
      if (!q) continue;
      const sz = Math.max(1, Math.min(3, Math.round(q[2] * 0.03)));
      rect(ctx, q[0] - (sz >> 1), q[1] - (sz >> 1), sz, sz, i / n > u - 0.12 ? RV.ball : RV.trail);
      const g = eyeProj(cam, p[0], p[1], 0);
      if (g && i % 4 === 0) rect(ctx, g[0], g[1], 1, 1, "#0a0f0a");
    }
    if (!landed) {
      const p = flightAt(d, u), q = eyeProj(cam, p[0], p[1], p[2]);
      if (q) { const r = Math.max(2, Math.min(9, Math.round(q[2] * 0.033 * 4))); rect(ctx, q[0] - r, q[1] - r, 2 * r, 2 * r, RV.ball); rect(ctx, q[0] - r, q[1] - r, Math.max(1, r >> 1), Math.max(1, r >> 1), "#ffffff"); }
    }
  }
  // the measurement
  if ((age >= R2.MARK || (reduced && age >= R2.ZOOM)) && age < R2.VERDICT) {
    const on = reduced || age - R2.MARK > 24 || ((age >> 3) & 1);
    rect(ctx, 0, 176, W, 22, "rgba(5,10,7,0.85)");
    if (on) centred(ctx, d.words.short, 180, d.m < 0 ? RV.warn : RV.eye, 2);
  }
  // the furniture: the name, the line, the call under review
  rect(ctx, 0, 0, W, 24, "#050a07"); rect(ctx, 0, 24, W, 1, RV.dim);
  text(ctx, "THE DEPARTMENT'S EYE", 6, 4, RV.eye, 2);
  text(ctx, "// LINE REVIEW", 6, 16, RV.dim);
  const eyeX = W - 22; rect(ctx, eyeX, 6, 16, 10, "#0a0f0a"); rect(ctx, eyeX + 1, 9, 14, 4, RV.ink); rect(ctx, eyeX + 6, 8, 4, 6, RV.eye); rect(ctx, eyeX + 7, 10, 2, 2, "#050a07");
  rect(ctx, 0, H - 16, W, 16, "#050a07");
  text(ctx, `${d.line} // CALLED ${d.called ? "IN" : "OUT"} // ${d.serve ? "SERVE" : "RALLY"}`, 6, H - 11, RV.ink);
  if (!reduced && age < 300 && (age >> 4) & 1) rect(ctx, W - 12, H - 12, 5, 5, "#e04040");
  ctx.globalAlpha = 0.12; ctx.fillStyle = "#000";
  for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
  ctx.globalAlpha = 1;
  // the verdict, then the brand line
  if (age >= R2.VERDICT) {
    ctx.globalAlpha = 0.72; rect(ctx, 0, 25, W, H - 41, "#050a07"); ctx.globalAlpha = 1;
    const v = d.overturned ? "CALL OVERTURNED" : "CALL STANDS", c = d.overturned ? RV.eye : RV.warn;
    const pop = reduced ? 3 : age - R2.VERDICT < 6 ? 4 : 3;
    centred(ctx, v, 80, c, pop);
    centred(ctx, d.words.short, 108, RV.ink, 1);
    if (age >= R2.BRAND) {
      const [a, b] = [BRAND.slice(0, BRAND.indexOf(".") + 1), BRAND.slice(BRAND.indexOf(".") + 2)];
      centred(ctx, a, 140, RV.dim); centred(ctx, b, 150, RV.dim);
      const ex = W / 2 - 8; rect(ctx, ex, 164, 16, 10, "#0a0f0a"); rect(ctx, ex + 1, 167, 14, 4, RV.ink); rect(ctx, ex + 6, 166, 4, 6, RV.eye); rect(ctx, ex + 7, 168, 2, 2, "#050a07");
    }
  }
  if (!reduced && age < R2.FLIGHT) { const n = Math.round(H * (1 - age / R2.FLIGHT)); for (let y = 0; y < n; y += 4) rect(ctx, 0, y, W, 2, "#c8f5d8"); }
}
