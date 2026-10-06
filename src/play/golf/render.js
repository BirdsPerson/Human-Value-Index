// THE DEPARTMENT LINKS / THE DEPARTMENT OPEN on a 320x224 canvas (the 16-bit consoles' wide mode),
// framed the way the cartridge golf games framed it: the golfer large, from behind, the hole
// running away from him in perspective to a horizon (a dithered sky, far hills that slide slower
// than the near tree line, clouds, the sea), and the hole from above in a small window in the
// corner. After contact the camera follows the ball down the hole; on the green it drops low
// behind the putter and the green's fall is shaded into the turf and drawn as arrows.
//
// The look is 16-bit, the cost is not: every material has a ramp of four to nine shades, picked
// per pixel through a 4x4 ordered (Bayer) dither (mowing stripes, the green's slopes, the sky,
// the haze toward the horizon); static layers (the sky, the maps, sprites, the golfer's poses)
// are cached; the turf is re-sampled only when the camera moves. Soft shadows are a few rows of
// translucent black. Every pixel is a whole pixel; the canvas is scaled by whole device pixels
// with smoothing off (Golf.jsx).
//
// Reads the sim's state and changes nothing in it (a camera, a ball trail, the gallery's mood are
// kept here, per round, for the picture only). THE MOUSE (Golf.jsx, gesture.js) asks it the other
// way round: which world spot a pixel of the map or the view is (pipToWorld, screenToWorld), and
// whether a press landed on the spin ball or the club chip; a drag in progress is drawn from opts.ui.
import { surfaceAt, slopeAt, fnv, rngOf, inPoly } from "./course.js";
import { CLUBS, LIE, ACC_ZONE, ACC_END, PUTT_MAX, holeOf, dirOf, cardOf, toParText, windRel, puttMark } from "./sim.js";
import { drawText, textWidth, wrap } from "./font.js";
import { golferCanvas, poseOf, GW, GH, ballPx, FEET } from "./golfer.js";
import { reactionFor } from "./gallery.js";
import { drawEnd } from "./scenes.js";

export const W = 320, H = 224;
const CX = W / 2;
const PANEL_Y = 168;                          // the HUD strip along the bottom
export const PAL = {
  black: "#000000", white: "#fcfcfc", grey: "#bcbcbc", dgrey: "#7c7c7c", red: "#d82800", gold: "#f8b800", lime: "#b8f818",
  ink: "#0c0a14", panel: "#10101c", panel2: "#1c1c30", line: "#3cbcfc", skin: "#e8a070",
};
// the ramps, dark to light
export const RAMP = {
  rough: ["#0e4a16", "#14601c", "#1c7424", "#26882c", "#349c36"],
  fairway: ["#2a8a2a", "#38a034", "#48b440", "#5cc64e", "#74d662"],
  green: ["#4caa2c", "#62be36", "#7ad042", "#92e050", "#acee66", "#c6f88a"],
  fringe: ["#3c9a28", "#4cae30", "#5cbe38", "#70ce44"],
  tee: ["#38a034", "#48b440", "#5cc64e", "#74d662"],
  sand: ["#a87c48", "#c49a5c", "#dab676", "#ead094", "#f6e6b8"],
  waste: ["#8c7440", "#a88c54", "#c2a66a", "#d6bc84"],
  water: ["#08246c", "#0c368e", "#144cb2", "#2066cc", "#3a86e2", "#6caaf2", "#a8d0fa"],
  woods: ["#06260e", "#0a3214", "#0e3e1a", "#144c20"],
  tree: ["#04200e", "#0a3418", "#124a22", "#1c602c", "#2a7838", "#3e9046"],
  path: ["#5c5c62", "#76767c", "#909096", "#aaaab0"],
  sky: ["#2c3ca8", "#3450bc", "#3e64cc", "#4c7ad8", "#5e90e2", "#74a6ea", "#90bcf0", "#b0d2f6", "#d0e6fa"],
  hills: ["#4c6c9c", "#587aa6", "#6688b0", "#7896bc", "#8aa6c8"],
  dunes: ["#7c8c50", "#8e9c5c", "#a2ae6c", "#b8be80"],
  cloud: ["#9cb4dc", "#c0d2ee", "#e2ecfa", "#fcfcfc"],
};
const RGBC = new Map();
const rgbOf = (h) => { let v = RGBC.get(h); if (!v) { v = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; RGBC.set(h, v); } return v; };
const RR = Object.fromEntries(Object.entries(RAMP).map(([k, a]) => [k, a.map(rgbOf)]));
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
// a shade v (0 .. ramp length - 1, fractional) at pixel (x, y): two neighbours, ordered dither
export function dith(ramp, v, x, y) {
  const n = ramp.length - 1;
  if (v <= 0) return ramp[0];
  if (v >= n) return ramp[n];
  let i = Math.floor(v);
  if (v - i > BAY[((y & 3) << 2) | (x & 3)]) i++;
  return ramp[i];
}
const TONE = { harm: PAL.red, warn: PAL.gold, good: PAL.lime, "": PAL.white };
const yds = (v) => `${Math.round(v)}Y`;
const hash = (a, b, c = 0) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
const LIGHT = [-0.55, 0.83];                  // the sun, in the hole's yards (upper left of the map)

function px(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
function line(ctx, x0, y0, x1, y1, c, u = 1, ox = 0, oy = 0) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  ctx.fillStyle = c;
  for (let k = 0; k < 800; k++) {
    ctx.fillRect(ox + x0 * u, oy + y0 * u, u, u);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}
function box(ctx, x, y, w, h) { px(ctx, x, y, w, h, PAL.white); px(ctx, x + 1, y + 1, w - 2, h - 2, PAL.black); }
// a soft shadow: an ellipse of translucent black, a few rows deep, darker in its middle
export function shadow(ctx, cx, cy, rx, ry, a = 0.32) {
  if (rx < 0.6) return;
  ctx.save();
  for (const [k, al] of [[1, a * 0.55], [0.62, a * 0.5]]) {
    ctx.globalAlpha = al; ctx.fillStyle = "#000000";
    const RX = rx * k, RY = Math.max(0.5, ry * k);
    for (let y = -Math.ceil(RY); y <= Math.ceil(RY); y++) {
      const w = Math.round(RX * Math.sqrt(Math.max(0, 1 - (y / (RY + 0.5)) ** 2)));
      if (w > 0) ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2, 1);
    }
  }
  ctx.restore();
}

// The shade of a surface at a world point: -> a ramp and a fractional shade on it (dith picks the
// pixel). Split so the turf works the shade out once per sample and dithers two pixels from it.
let TR = null, TV = 0;
function turfShade(h, s, wx, wy, extra = 0) {
  const hv = hash(Math.floor(wx * 2), Math.floor(wy * 2)) % 97 / 97;
  switch (s) {
    case "fairway": TR = RR.fairway; TV = 2.1 + ((Math.floor(wy / 6) & 1) ? 0.85 : -0.35) + extra + (hv - 0.5) * 0.4; return;
    case "tee": TR = RR.tee; TV = 2 + extra + (hv - 0.5) * 0.3; return;
    case "green": {
      const [sx, sy] = slopeAt(h, wx, wy), lit = -(sx * LIGHT[0] + sy * LIGHT[1]);
      TR = RR.green; TV = 2.5 + lit * 5 + ((Math.floor(wx / 2.2) + Math.floor(wy / 2.2)) & 1 ? 0.3 : -0.2) + extra; return;
    }
    case "fringe": TR = RR.fringe; TV = 1.6 + extra + (hv - 0.5) * 0.5; return;
    case "rough": TR = RR.rough; TV = 1.9 + extra + (hv - 0.5) * 1.6; return;
    case "bunker": TR = RR.sand; TV = 2.6 + extra + (hv - 0.5) * 0.8; return;
    case "waste": if (hv < 0.06) { TR = RR.rough; TV = 1; } else { TR = RR.waste; TV = 2 + extra + (hv - 0.5) * 1.4; } return;
    case "path": TR = RR.path; TV = 1.7 + extra + (hv - 0.5) * 0.6; return;
    case "water": TR = RR.water; TV = 2.4 + extra + (hv > 0.94 ? 2 : 0); return;
    case "trees": TR = RR.tree; TV = 1.2 + extra + (hv - 0.5) * 1.2; return;
    default: TR = RR.woods; TV = 1.4 + extra + (hv - 0.5) * 2;
  }
}
function turf(h, s, wx, wy, x, y, extra = 0) { turfShade(h, s, wx, wy, extra); return dith(TR, TV, x, y); }

// =====================================================================================================
// The top-down map (the corner window, the hole card at the tee): world yards <-> window pixels.
export function holeView(h, w, hh) {
  const xs = h.pts.map(p => p[0]).concat(h.green.poly.pts.map(p => p[0]));
  const s = Math.max(0.6, (h.top - h.bottom) / hh, (Math.max(...xs) - Math.min(...xs) + 70) / w);
  return { s, cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (h.top + h.bottom) / 2, kind: "hole", w, h: hh };
}
const toPx = (v, x, y, ox, oy) => [Math.round(ox + v.w / 2 + (x - v.cx) / v.s), Math.round(oy + v.h / 2 - (y - v.cy) / v.s)];

const CACHE = new Map();
export function terrain(h, v) {
  const key = `${h.id || h.n}|${h.famous ? "o" : "l"}|${v.kind}|${v.w}x${v.h}|${v.s.toFixed(3)}|${v.cx.toFixed(2)}|${v.cy.toFixed(2)}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const c = document.createElement("canvas");
  c.width = v.w; c.height = v.h;
  const g = c.getContext("2d"), img = g.createImageData(v.w, v.h), d = img.data;
  for (let py = 0; py < v.h; py++) for (let qx = 0; qx < v.w; qx++) {
    const x = v.cx + (qx + 0.5 - v.w / 2) * v.s, y = v.cy - (py + 0.5 - v.h / 2) * v.s;
    const s = surfaceAt(h, x, y);
    const col = turf(h, s, x, y, qx, py, s === "fairway" && v.kind === "green" ? -0.3 : 0);
    const i = (py * v.w + qx) * 4;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  // the trees from above: a dark crown with a lit edge
  for (const t of h.trees) {
    const cx = (t.x - v.cx) / v.s + v.w / 2, cy = v.h / 2 - (t.y - v.cy) / v.s, r = Math.max(1, t.r / v.s);
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= v.w || y >= v.h) continue;
      const u = (x + 0.5 - cx) / r, w2 = (y + 0.5 - cy) / r, q = u * u + w2 * w2;
      if (q > 1) continue;
      const col = dith(RR.tree, 2.6 - (u * LIGHT[0] - w2 * LIGHT[1]) * 2 - q, x, y), i = (y * v.w + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2];
    }
  }
  g.putImageData(img, 0, 0);
  if (v.kind === "green") {
    // the fall of the green: an arrow every 12 px, pointing downhill; darker and longer is steeper
    for (let py = 6; py < v.h; py += 12) for (let qx = 6; qx < v.w; qx += 12) {
      const x = v.cx + (qx - v.w / 2) * v.s, y = v.cy - (py - v.h / 2) * v.s;
      const sf = surfaceAt(h, x, y);
      if (sf !== "green" && sf !== "fringe") continue;
      const [sx, sy] = slopeAt(h, x, y), m = Math.hypot(sx, sy);
      g.fillStyle = m > 0.22 ? "#1c5a10" : "#3a8a1c";
      if (m < 0.03) { g.fillRect(qx, py, 1, 1); continue; }
      const ux = sx / m, uy = -sy / m, L = m > 0.22 ? 4 : 3;
      for (let k = -L; k <= L; k++) g.fillRect(Math.round(qx + ux * k), Math.round(py + uy * k), 1, 1);
      const hx = qx + ux * L, hy = py + uy * L;
      g.fillRect(Math.round(hx - ux * 2 + uy * 1.5), Math.round(hy - uy * 2 - ux * 1.5), 1, 1);
      g.fillRect(Math.round(hx - ux * 2 - uy * 1.5), Math.round(hy - uy * 2 + ux * 1.5), 1, 1);
    }
  }
  if (CACHE.size > 16) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key, c);
  return c;
}
const flagTop = (ctx, x, y) => { px(ctx, x, y - 8, 1, 9, PAL.white); px(ctx, x + 1, y - 8, 4, 3, PAL.red); px(ctx, x - 1, y, 3, 1, PAL.black); };

// The map in a window at (ox, oy): terrain, tee, flag, the aim line, every ball.
function mapIn(ctx, st, v, ox, oy, frame, small) {
  const h = holeOf(st);
  ctx.drawImage(terrain(h, v), ox, oy);
  ctx.save();
  ctx.beginPath(); ctx.rect(ox, oy, v.w, v.h); ctx.clip();
  const P = st.players[st.cur], c = CLUBS[st.club];
  if (v.kind === "hole") { const [tx, ty] = toPx(v, 0, 0, ox, oy); px(ctx, tx - 2, ty - 1, 5, 3, RAMP.tee[2]); px(ctx, tx - 2, ty - 1, 1, 1, PAL.white); px(ctx, tx + 2, ty - 1, 1, 1, PAL.white); }
  const [fx, fy] = toPx(v, h.pin.x, h.pin.y, ox, oy);
  if (v.kind === "green") px(ctx, fx - 1, fy - 1, 3, 3, PAL.black);
  if (small) { px(ctx, fx, fy - 5, 1, 6, PAL.white); px(ctx, fx + 1, fy - 5, 3, 2, PAL.red); } else flagTop(ctx, fx, fy);
  if (st.phase === "aim" || st.phase === "meter") {
    const [dx, dy] = dirOf(st.aim);
    const L = c.putt ? Math.min(PUTT_MAX, Math.hypot(h.pin.x - P.x, h.pin.y - P.y) + 2) : c.carry * (LIE[P.lie] ?? 1);
    const [bx, by] = toPx(v, P.x, P.y, ox, oy), [ex, ey] = toPx(v, P.x + dx * L, P.y + dy * L, ox, oy);
    const n = Math.max(1, Math.round(Math.hypot(ex - bx, ey - by) / 2));
    for (let k = 1; k <= n; k++) if ((k + (frame >> 3)) % 2) px(ctx, bx + (ex - bx) * k / n, by + (ey - by) * k / n, 1, 1, PAL.white);
    if (!c.putt && (frame >> 4) % 2) { px(ctx, ex - 1, ey, 3, 1, PAL.red); px(ctx, ex, ey - 1, 1, 3, PAL.red); }
    if (st.target) { const [gx, gy] = toPx(v, st.target.x, st.target.y, ox, oy); px(ctx, gx - 2, gy, 2, 1, PAL.gold); px(ctx, gx + 1, gy, 2, 1, PAL.gold); px(ctx, gx, gy - 2, 1, 2, PAL.gold); px(ctx, gx, gy + 1, 1, 2, PAL.gold); }
  }
  st.players.forEach((Q, i) => {
    if (Q.holed || (i === st.cur && st.ball)) return;
    const [qx, qy] = toPx(v, Q.x, Q.y, ox, oy);
    px(ctx, qx - 1, qy - 1, 3, 3, Q.color?.shirt || PAL.gold); px(ctx, qx, qy, 1, 1, PAL.white);
  });
  const b = st.ball;
  if (b && !(st.phase === "rest" && P.holed && Math.hypot(b.x - h.pin.x, b.y - h.pin.y) < 0.2)) {
    const [bx, by] = toPx(v, b.x, b.y, ox, oy), lift = Math.min(small ? 14 : 40, Math.round((b.z || 0) / v.s * 0.8));
    if (lift > 0) px(ctx, bx - 1, by, 3, 1, PAL.black);
    px(ctx, bx - 1, by - lift - 1, 2, 2, PAL.white);
  }
  ctx.restore();
}

// =====================================================================================================
// The view from behind the golfer. A camera behind the ball (and a little to the golfer's back),
// looking along the aim: a screen row below the horizon is a distance, a column a distance across.
// The rows are the old cartridge cheat, not a lens: depth d sits sqrt(K / d) rows under the
// horizon, so the far half of a hole gets rows enough to read. Across is plain perspective (F / d
// px a yard), and so are heights. Rows are sampled from a lazily filled raster of the hole
// (half-yard cells).
const MODES = {
  drive: { F: 176, back: 8.7, ballY: 162, side: 1.15 },
  putt: { F: 196, back: 5.2, ballY: 150, side: 0.75 },
};
const horizonOf = (h) => 62 - Math.round((h.elev || 0) * 7);
const rowOf = (cam, d) => cam.H0 + Math.sqrt(cam.K / d);

const CODE = { water: 0, bunker: 1, green: 2, fringe: 3, tee: 4, ob: 5, trees: 6, fairway: 7, rough: 8, waste: 9, path: 11 };
const NAME = Object.fromEntries(Object.entries(CODE).map(([k, v]) => [v, k]));
const RASTERS = new Map();
function rasterOf(h) {
  const key = h.id || `l${h.n}`;
  let R = RASTERS.get(key);
  if (R) return R;
  const xs = h.pts.map(p => p[0]);
  const x0 = Math.min(...xs) - h.corridor - 70, x1 = Math.max(...xs) + h.corridor + 70, y0 = -80, y1 = h.top + 60;
  const w = Math.ceil((x1 - x0) * 2), hh = Math.ceil((y1 - y0) * 2);
  R = { x0, y0, w, h: hh, d: new Uint8Array(w * hh).fill(255) };
  if (RASTERS.size > 4) RASTERS.delete(RASTERS.keys().next().value);
  RASTERS.set(key, R);
  return R;
}
function cellAt(h, R, x, y) {
  const ix = Math.floor((x - R.x0) * 2), iy = Math.floor((y - R.y0) * 2);
  if (ix < 0 || iy < 0 || ix >= R.w || iy >= R.h) return 10;
  const i = iy * R.w + ix;
  let c = R.d[i];
  if (c === 255) { c = CODE[surfaceAt(h, R.x0 + (ix + 0.5) / 2, R.y0 + (iy + 0.5) / 2)] ?? CODE.rough; R.d[i] = c; }
  return c;
}

function cameraOf(st, h) {
  const P = st.players[st.cur], fl = st.fl;
  const moving = st.phase === "flight" || st.phase === "roll" || st.phase === "rest";
  const putt = moving ? Boolean(fl?.putt) : Boolean(CLUBS[st.club]?.putt);
  const M = putt ? MODES.putt : MODES.drive;
  const ox = moving && fl ? fl.ox : P.x, oy = moving && fl ? fl.oy : P.y;
  const aim = moving && fl?.aim != null ? fl.aim : st.aim;
  const [dx, dy] = dirOf(aim), rx = dy, ry = -dx;
  const mem = memOf(st);
  let adv = 0, lat = 0;
  if (moving && !putt && st.ball) {
    const bx = st.ball.x - ox, by = st.ball.y - oy, along = bx * dx + by * dy, across = bx * rx + by * ry;
    adv = Math.max(0, along - 48); lat = across * Math.min(1, adv / 60);
  }
  if (!moving) { mem.adv = 0; mem.lat = 0; mem.trail = []; }
  else { mem.adv += (adv - mem.adv) * 0.12; mem.lat += (lat - mem.lat) * 0.12; }
  const side = M.side * Math.max(0, 1 - mem.adv / 60);
  const cx = ox + dx * (mem.adv - M.back) + rx * (mem.lat - side), cy = oy + dy * (mem.adv - M.back) + ry * (mem.lat - side);
  const H0 = horizonOf(h);
  return { ...M, putt, x: cx, y: cy, dx, dy, rx, ry, aim, ox, oy, H0, K: M.back * (M.ballY - H0) ** 2, adv: mem.adv };
}
const MEM = new WeakMap();
function memOf(st) { let m = MEM.get(st); if (!m) MEM.set(st, m = { adv: 0, lat: 0, trail: [], floorKey: "", floor: null, water: [], react: null, reactKey: "", shotT: 0 }); return m; }
// world -> screen: [x, ground y, scale (px per yard), depth]
function project(cam, x, y, z = 0) {
  const qx = x - cam.x, qy = y - cam.y, d = qx * cam.dx + qy * cam.dy, l = qx * cam.rx + qy * cam.ry;
  if (d < 0.3) return null;
  const s = cam.F / d;
  return [CX + l * s, rowOf(cam, d) - z * s, s, d];
}

// the turf: a colour per pixel, from the cell under it, the haze of distance and the dither
function floor(ctx, st, h, cam, frame, still) {
  const mem = memOf(st), R = rasterOf(h);
  const key = `${h.id || h.n}|${cam.x.toFixed(2)}|${cam.y.toFixed(2)}|${cam.aim.toFixed(4)}|${cam.putt}`;
  const top = cam.H0 + 1, rows = PANEL_Y - top;
  if (mem.floorKey !== key || !mem.floor) {
    const img = mem.floor && mem.floor.height === rows ? mem.floor : ctx.createImageData(W, rows), d = img.data;
    const water = [];
    const ocean = h.scene === "ocean";
    for (let r = 0; r < rows; r++) {
      const y = top + r, z = cam.K / (y - cam.H0 + 0.5) ** 2;
      const haze = z > 120 ? Math.min(1.1, (z - 120) / 260) : 0;   // far turf lightens toward the horizon
      for (let x = 0; x < W; x += 2) {
        const l = ((x + 1 - CX) * z) / cam.F;
        const wx = cam.x + cam.dx * z + cam.rx * l, wy = cam.y + cam.dy * z + cam.ry * l;
        let c = cellAt(h, R, wx, wy);
        if (c === 10) c = ocean ? CODE.water : CODE.ob;
        const s = NAME[c];
        let extra = haze * 0.9;
        if (s === "bunker" || s === "waste") {
          // the lip: the far edge in shadow, the near edge lit
          const far = cellAt(h, R, wx + cam.dx * 0.7, wy + cam.dy * 0.7), nr = cellAt(h, R, wx - cam.dx * 0.6, wy - cam.dy * 0.6);
          if (far !== CODE.bunker && far !== CODE.waste) extra -= 1.6;
          else if (nr !== CODE.bunker && nr !== CODE.waste) extra += 1.1;
        } else if (s === "water") {
          extra = z > 220 ? -0.8 : (z < 40 ? 0.4 : 0);
          if ((hash(Math.floor(wx * 2), Math.floor(wy * 2)) % 13 === 3) && (r & 1) === 0) water.push(r * W + x);
        } else if (s === "fairway" || s === "rough" || s === "fringe") {
          // the ground's own swell, lit from the upper left
          const [sx, sy] = slopeAt(h, wx, wy);
          extra += -(sx * LIGHT[0] + sy * LIGHT[1]) * 3;
        }
        const i = (r * W + x) * 4;
        turfShade(h, s, wx, wy, extra);
        const c0 = dith(TR, TV, x, y), c1 = dith(TR, TV, x + 1, y);
        d[i] = c0[0]; d[i + 1] = c0[1]; d[i + 2] = c0[2]; d[i + 3] = 255;
        d[i + 4] = c1[0]; d[i + 5] = c1[1]; d[i + 6] = c1[2]; d[i + 7] = 255;
      }
    }
    mem.floor = img; mem.floorKey = key; mem.water = water;
  }
  ctx.putImageData(mem.floor, 0, top);
  // the water's shimmer: a few of the water's pixels catch the light each frame
  if (still) return;
  const t = frame >> 3;
  for (const p of mem.water) {
    const hv = hash(p, t) % 11;
    if (hv > 1) continue;
    px(ctx, p % W, top + Math.floor(p / W), 2, 1, hv ? RAMP.water[5] : PAL.white);
  }
}

// ---- the sky, the far hills (slow), the tree line (with the view), clouds --------------------------
function noise1(seed, v) { const i = Math.floor(v), f = v - i, a = hash(seed, i) / 4294967296, b = hash(seed, i + 1) / 4294967296; return a + (b - a) * (f * f * (3 - 2 * f)); }
const SKY = new Map();
function skyLayer(H0) {
  let c = SKY.get(H0);
  if (c) return c;
  c = document.createElement("canvas"); c.width = W; c.height = H0 + 1;
  const g = c.getContext("2d"), img = g.createImageData(W, H0 + 1), d = img.data;
  for (let y = 0; y <= H0; y++) for (let x = 0; x < W; x++) {
    const col = dith(RR.sky, (y / H0) ** 1.3 * (RR.sky.length - 1.01), x, y), i = (y * W + x) * 4;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  SKY.set(H0, c);
  return c;
}
const CLOUDS = new Map();
function cloudSprite(seed) {
  let c = CLOUDS.get(seed);
  if (c) return c;
  const rnd = rngOf(seed), w = 34 + Math.floor(rnd() * 34), hh = 12 + Math.floor(rnd() * 8);
  c = document.createElement("canvas"); c.width = w; c.height = hh;
  const g = c.getContext("2d"), img = g.createImageData(w, hh), d = img.data;
  const puffs = Array.from({ length: 5 }, (_, i) => [w * (0.15 + i * 0.17 + rnd() * 0.06), hh * (0.45 + rnd() * 0.2), hh * (0.32 + rnd() * 0.22) * (i === 2 ? 1.25 : 1)]);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    let best = -1;
    for (const [cx, cy, r] of puffs) { const q = 1 - Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.25) / r; if (q > best) best = q; }
    if (best < 0 || y > hh * 0.78) continue;
    const col = dith(RR.cloud, 1 + best * 3 - (y / hh) * 1.6, x, y), i = (y * w + x) * 4;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  CLOUDS.set(seed, c);
  return c;
}
// The far hills for a hole, a strip twice the view wide (cached), slid at a third of the near
// line's rate: the parallax.
const HILLS = new Map();
function hillLayer(h, H0) {
  const key = `${h.id || h.n}|${H0}`;
  let c = HILLS.get(key);
  if (c) return c;
  const scene = h.scene || "parkland", sd = fnv(`edge|${h.id || h.n}`), hill = scene === "links" ? RR.dunes : RR.hills;
  const LW = W * 3;
  c = document.createElement("canvas"); c.width = LW; c.height = H0 + 1;
  const g = c.getContext("2d"), img = g.createImageData(LW, H0 + 1), d = img.data;
  for (let x = 0; x < LW; x++) {
    const a = x / 40;
    const ht = (scene === "ocean" ? 5 : scene === "links" ? 7 : 13) + Math.round(noise1(sd + 7, a * 0.9) * (scene === "links" ? 6 : 16) + noise1(sd + 9, a * 3) * 4);
    for (let y = Math.max(0, H0 - ht); y <= H0; y++) {
      const col = dith(hill, 1.2 + ((y - (H0 - ht)) / Math.max(1, ht)) * 2.6 - (y === H0 - ht ? 1 : 0), x, y), i = (y * LW + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  if (HILLS.size > 6) HILLS.delete(HILLS.keys().next().value);
  HILLS.set(key, c);
  return c;
}
function sky(ctx, st, h, cam, frame, still) {
  const H0 = cam.H0;
  ctx.drawImage(skyLayer(H0), 0, 0);
  // clouds: fixed per hole, drifting with the wind across the view, turning with the aim (slowly:
  // they are far)
  const seed = fnv(`clouds|${h.id || h.n}`), rnd = rngOf(seed);
  const wl = st.wind.x * cam.rx + st.wind.y * cam.ry;
  for (let i = 0; i < 5; i++) {
    const sp = cloudSprite(seed + i), bx = rnd() * 640, by = 4 + rnd() * (H0 - 30);
    let x = bx - cam.aim * cam.F * 0.6 + (still ? 0 : frame * wl * 0.004);
    x = (((x % 640) + 640) % 640) - 160;
    ctx.drawImage(sp, Math.round(x), Math.round(by));
  }
  // far hills, slid at a third of the rate
  const HL = hillLayer(h, H0), off = (((Math.round(-cam.aim * cam.F * 0.35) + W) % W) + W) % W;
  ctx.drawImage(HL, off, 0, W, H0 + 1, 0, 0, W, H0 + 1);
  // the near edge: per column, sea where the hole runs out to water, else trees, dunes or pines;
  // written as pixels into one strip and laid over the sky in a single draw
  const R = rasterOf(h), scene = h.scene || "parkland", sd = fnv(`edge|${h.id || h.n}`);
  const SH = 34, y0 = H0 - SH + 1;
  if (!EDGE || EDGE.height !== SH) { EDGE = document.createElement("canvas"); EDGE.width = W; EDGE.height = SH; EDGE_IMG = EDGE.getContext("2d").createImageData(W, SH); }
  const d = EDGE_IMG.data;
  d.fill(0);
  const put = (x, y, col) => { if (y < y0 || y > H0) return; const i = ((y - y0) * W + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; d[i + 4] = col[0]; d[i + 5] = col[1]; d[i + 6] = col[2]; d[i + 7] = 255; };
  for (let x = 0; x < W; x += 2) {
    const ang = cam.aim + Math.atan((x + 1 - CX) / cam.F);
    const zf = 330, l = ((x + 1 - CX) * zf) / cam.F;
    const c = cellAt(h, R, cam.x + cam.dx * zf + cam.rx * l, cam.y + cam.dy * zf + cam.ry * l);
    const sea = c === CODE.water || (c === 10 && h.scene === "ocean");
    if (sea) { const col = (hash(x, still ? 0 : frame >> 4) % 7) ? RR.water[3] : RR.water[5]; put(x, H0 - 1, col); put(x, H0, col); continue; }
    const n = noise1(sd, ang * 34), n2 = noise1(sd + 1, ang * 120);
    if (scene === "links") {
      const ht = 2 + Math.round(n * 5);
      for (let y = H0 - ht; y <= H0; y++) put(x, y, y === H0 - ht ? RR.dunes[3] : RR.dunes[1]);
    } else {
      const ht = (scene === "pines" || scene === "ocean" ? 5 + Math.round(n * 9 + (n2 > 0.6 ? 4 : 0) + ((x >> 1) % 3 === 0 ? 2 : 0)) : 6 + Math.round(n * 8 + n2 * 3));
      for (let y = H0 - ht; y <= H0; y++) put(x, y, dith(RR.tree, 3.2 - ((y - (H0 - ht)) / ht) * 2.4 + (n2 > 0.5 ? 0.4 : 0), x, y));
    }
  }
  EDGE.getContext("2d").putImageData(EDGE_IMG, 0, 0);
  ctx.drawImage(EDGE, 0, y0);
}
let EDGE = null, EDGE_IMG = null;

// ---- sprites: trees (crown and trunk apart, so the crown can sway) -------------------------------------
const SPR = {};
function sprite(kind) {
  if (SPR[kind]) return SPR[kind];
  const mk = (w, h, f) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"), img = g.createImageData(w, h), d = img.data;
    const set = (x, y, col) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; };
    f(set);
    // a dark outline round the shape
    const o = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (d[i + 3]) continue; const s = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && d[(yy * w + xx) * 4 + 3] === 255; if (s(x - 1, y) || s(x + 1, y) || s(x, y - 1) || s(x, y + 1)) o.push(x, y); }
    for (let i = 0; i < o.length; i += 2) { const j = (o[i + 1] * w + o[i]) * 4; d[j] = 4; d[j + 1] = 18; d[j + 2] = 10; d[j + 3] = 254; }
    g.putImageData(img, 0, 0);
    return c;
  };
  const T = RR.tree, BARK = ["#3c2410", "#5c3a1c", "#7c5430"].map(rgbOf);
  let c, trunk = 0.25;
  if (kind === "pine") { trunk = 0.16; c = mk(18, 36, (set) => {
    for (let y = 30; y < 36; y++) for (let x = 8; x < 10; x++) set(x, y, BARK[x === 8 ? 1 : 0]);
    for (let y = 0; y < 31; y++) { const tier = Math.floor(y / 8), k = y % 8, w = 1 + k + tier * 1.6; for (let x = Math.round(9 - w); x <= Math.round(8 + w); x++) { const u = (x - 8.5) / (w + 0.5); set(x, y, dith(T, 3.4 - u * 2.2 - (k / 8) * 1.4 - tier * 0.2, x, y)); } }
  }); }
  else if (kind === "oak") { trunk = 0.3; c = mk(24, 26, (set) => {
    for (let y = 17; y < 26; y++) for (let x = 10; x < 14; x++) set(x, y, BARK[x === 10 ? 2 : x === 13 ? 0 : 1]);
    const lobes = [[12, 9, 9], [6, 12, 6], [18, 12, 6], [9, 5, 6], [15, 5, 6], [12, 15, 6]];
    for (let y = 0; y < 21; y++) for (let x = 0; x < 24; x++) { let q = -1; for (const [cx, cy, r] of lobes) q = Math.max(q, 1 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r); if (q < 0) continue; set(x, y, dith(T, 1.4 + q * 2.2 - ((x - 12) * -0.06 + (y - 10) * 0.09) * 1.6, x, y)); }
  }); }
  else if (kind === "cypress") { trunk = 0.4; c = mk(30, 22, (set) => {
    for (let y = 9; y < 22; y++) for (let x = 13; x < 16; x++) set(x + ((y < 14) ? (14 - y) >> 2 : 0), y, BARK[x === 13 ? 2 : 1]);
    const pads = [[8, 6, 8, 3.2], [20, 5, 9, 3], [14, 3, 7, 2.6], [4, 9, 5, 2.4], [25, 9, 5, 2.2]];
    for (let y = 0; y < 14; y++) for (let x = 0; x < 30; x++) { let q = -1; for (const [cx, cy, rx, ry] of pads) q = Math.max(q, 1 - Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry)); if (q < 0) continue; set(x, y, dith(T, 1.2 + q * 2.6 - (y - 5) * 0.12, x, y)); }
  }); }
  else if (kind === "palm") { trunk = 0.7; c = mk(20, 32, (set) => {
    for (let y = 7; y < 32; y++) { const x = 9 + Math.round(Math.sin(y / 9) * 2); set(x, y, BARK[y % 3 ? 2 : 1]); set(x + 1, y, BARK[0]); }
    const fr = [[-8, 3], [8, 3], [-6, -3], [6, -3], [0, -5], [-9, 7], [9, 7]];
    for (const [fx, fy] of fr) for (let k = 0; k <= 10; k++) { const t = k / 10, x = Math.round(10 + fx * t), y = Math.round(7 + fy * t + 3 * t * t); set(x, y, dith(T, 3.6 - t * 2, x, y)); set(x, y + 1, T[1]); }
  }); }
  else { trunk = 0; c = mk(14, 9, (set) => {
    for (let y = 0; y < 9; y++) for (let x = 0; x < 14; x++) { const q = 1 - Math.hypot((x + 0.5 - 7) / 7, (y + 0.5 - 6) / 5.5); if (q < 0) continue; set(x, y, (hash(x, y, 9) % 9 === 0) ? rgbOf(PAL.gold) : dith(T, 1.2 + q * 2.4, x, y)); }
  }); }
  SPR[kind] = { c, trunk };
  return SPR[kind];
}
const treeKind = (h, t) => t.k || (hash(Math.round(t.x * 10), Math.round(t.y * 10)) % 3 === 0 ? "oak" : "pine");
const SHIRTS = ["#d82800", "#fcfcfc", "#f8b800", "#0058f8", "#00a800", "#f878f8", "#7c7c7c", "#202020", "#3cbcfc", "#a85000"];

// The crowd: a few dozen people round the green, on the side the hole names, out of the water.
const CROWD = new Map();
function crowdOf(h) {
  const key = h.id || `l${h.n}`;
  if (CROWD.has(key)) return CROWD.get(key);
  const rnd = rngOf(fnv(`crowd|${key}`)), out = [];
  const side = h.gallery ?? (h.n % 2 ? 1 : -1);
  const [ux, uy] = (() => { const a = h.pts[h.pts.length - 2], b = h.pts[h.pts.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; })();
  const c0 = side === 0 ? 150 : side > 0 ? 40 : 230, span = side === 0 ? 80 : 100;
  for (let i = 0; i < 52; i++) {
    const deg = c0 + rnd() * span, a = (deg * Math.PI) / 180, dist = h.green.r + 9 + rnd() * 8;
    const x = h.green.x - ux * Math.cos(a) * dist + uy * Math.sin(a) * dist, y = h.green.y - uy * Math.cos(a) * dist - ux * Math.sin(a) * dist;
    const s = surfaceAt(h, x, y);
    if (s === "water" || s === "bunker" || s === "green" || s === "fringe") continue;
    out.push({ x, y, shirt: SHIRTS[Math.floor(rnd() * SHIRTS.length)], skin: ["#f0b080", "#d89868", "#a86c3c", "#6c4420"][Math.floor(rnd() * 4)], ph: rnd() * 6.28, hat: rnd() < 0.3 });
  }
  CROWD.set(key, out);
  return out;
}
// One spectator, hh px tall with feet at (x, y), in the gallery's mood
export function spectator(ctx, c, x, y, hh, mood, f) {
  const w = Math.max(1, Math.round(hh / 2.4)), head = Math.max(1, Math.round(hh * 0.22)), body = Math.max(1, Math.round(hh * 0.4));
  let sit = 0, arms = 0;
  const t = f + c.ph * 10;
  if (mood === "roar" || mood === "cheer") { arms = 2; y -= ((t >> 3) & 1) && hh > 6 ? 1 : 0; }
  else if (mood === "warm" || mood === "polite" || mood === "thin") arms = ((t >> 2) & 1) && (mood !== "thin" || c.ph < 1.5) ? 1 : 0;
  else if (mood === "ooh" || mood === "groan") arms = 3;
  else if (mood === "crickets") sit = c.ph < 3 ? Math.round(hh * 0.25) : 0;
  const top = y - hh + 1 + sit;
  px(ctx, x - (w >> 1), top, w, head, c.skin);
  if (c.hat && hh > 6) px(ctx, x - (w >> 1), top, w, 1, PAL.white);
  px(ctx, x - (w >> 1), top + head, w, body, c.shirt);
  px(ctx, x - (w >> 1), top + head + body, w, Math.max(1, hh - head - body - sit), "#202020");
  if (hh < 5) return;
  if (arms === 2) { px(ctx, x - (w >> 1) - 1, top - 2, 1, head + 2, c.skin); px(ctx, x + (w >> 1) + (w & 1), top - 2, 1, head + 2, c.skin); }
  else if (arms === 3) { px(ctx, x - (w >> 1) - 1, top, 1, 2, c.skin); px(ctx, x + (w >> 1) + (w & 1), top, 1, 2, c.skin); px(ctx, x - (w >> 1), top - 1, w, 1, c.skin); }
  else if (arms === 1) px(ctx, x - 1, top + head + 1, 2, 1, c.skin);
}

// ---- the golfer -------------------------------------------------------------------------------------
function poseFor(st, frame, still, drag) {
  const putt = st.fl?.putt || (!st.fl && CLUBS[st.club]?.putt) || (st.phase !== "flight" && st.phase !== "roll" && st.phase !== "rest" && CLUBS[st.club]?.putt);
  // a drag in progress: the club goes back as far as the pull, and comes down with the push
  if (drag && st.phase === "aim") return poseOf("meter", { putt: Boolean(putt), m: drag.m, stage: 1, power: drag.m, still });
  const m = st.meter;
  const waggle = st.phase === "aim" && !still ? Math.sin(frame / 11) * 0.5 : 0;
  const mem = memOf(st);
  const after = st.phase === "flight" || st.phase === "roll" || st.phase === "rest";
  if (after) { if (mem.shotT === 0) mem.shotT = frame; } else mem.shotT = 0;
  const t = after ? frame - mem.shotT : 0;
  return poseOf(st.phase, { putt: Boolean(putt), m: m ? Math.max(0, m.m) : 0, stage: m?.stage ?? 1, power: m?.power ?? 0, dir: m?.dir ?? 1, t, still, waggle });
}

// The view itself.
function behindView(ctx, st, frame, looks, still, ui) {
  const h = holeOf(st), cam = cameraOf(st, h), P = st.players[st.cur], mem = memOf(st);
  sky(ctx, st, h, cam, frame, still);
  floor(ctx, st, h, cam, frame, still);
  const items = [];
  const vis = (p, rad) => p && p[3] < 700 && p[0] + rad * p[2] > -8 && p[0] - rad * p[2] < W + 8;
  // the wind in the trees: a crown leans and sways with the breeze across the view
  const wl = st.wind.x * cam.rx + st.wind.y * cam.ry, gust = st.wind.mph / 14;
  for (const list of [h.trees, h.decor || []]) for (const t of list) {
    const p = project(cam, t.x, t.y);
    if (!p || p[3] < 2.5 || !vis(p, t.r)) continue;
    const k = treeKind(h, t), sp = sprite(k), img = sp.c;
    const w = Math.max(2, Math.round(2 * t.r * p[2] * (k === "gorse" ? 1 : 1.15))), hh = Math.max(2, Math.round((w * img.height) / img.width * (k === "gorse" ? 0.8 : (t.h || 11) / 11)));
    const lean = still ? 0 : Math.round((Math.sign(wl) * gust * 0.6 + Math.sin(frame / (9 - gust * 3) + t.x * 0.7) * gust * 0.8) * Math.min(4, hh / 14));
    items.push({ d: p[3], f: () => {
      const x0 = Math.round(p[0] - w / 2), y0 = Math.round(p[1] - hh + 1), cut = Math.round(hh * (1 - sp.trunk));
      if (p[3] < 60 && w > 6) shadow(ctx, p[0] + w * 0.25, p[1], w * 0.45, Math.max(1, w * 0.1), 0.28);
      if (!lean || cut < 2) { ctx.drawImage(img, x0, y0, w, hh); return; }
      const shh = Math.round(img.height * (1 - sp.trunk));
      ctx.drawImage(img, 0, shh, img.width, img.height - shh, x0, y0 + cut, w, hh - cut);
      ctx.drawImage(img, 0, 0, img.width, shh, x0 + lean, y0, w, cut);
    } });
  }
  // the crowd, in the gallery's mood
  const mood = mem.react && frame - mem.react.f0 < 260 ? mem.react.kind : null;
  for (const c of crowdOf(h)) {
    const p = project(cam, c.x, c.y);
    if (!p || p[3] < 3 || !vis(p, 1)) continue;
    const hh = Math.max(3, Math.round(1.85 * p[2]));
    items.push({ d: p[3], f: () => spectator(ctx, c, Math.round(p[0]), Math.round(p[1]), hh, mood, still ? 0 : frame) });
  }
  // the tee markers
  if (Math.hypot(P.x, P.y) < 40) for (const tx of [-3.5, 3.5]) {
    const p = project(cam, tx, 0.5);
    if (p && p[3] > 1) { const s = Math.max(2, Math.round(0.35 * p[2])); items.push({ d: p[3], f: () => { shadow(ctx, p[0] + s * 0.4, p[1], s * 0.7, Math.max(1, s * 0.2)); px(ctx, p[0] - s / 2, p[1] - s + 1, s, s, PAL.red); px(ctx, p[0] - s / 2, p[1] - s + 1, Math.max(1, s >> 1), Math.max(1, s >> 1), "#fc7460"); } }); }
  }
  // the flag: a pole, a cloth that streams with the wind across the view (further and faster the
  // harder it blows, drooping in a breeze), the cup when close
  {
    const p = project(cam, h.pin.x, h.pin.y);
    if (p) {
      const pole = Math.max(9, Math.round(2.6 * p[2])), fw = Math.max(4, Math.round(pole * (0.32 + 0.02 * Math.min(14, st.wind.mph)))), fh = Math.max(3, Math.round(pole * 0.26));
      const dir = st.wind.mph < 1 ? 0 : wl >= 0 ? 1 : -1, wave = still ? 0 : (frame >> (st.wind.mph > 8 ? 2 : 3)) % 3;
      const droop = Math.max(0, 1 - st.wind.mph / 10);
      items.push({ d: p[3], f: () => {
        if (p[3] < 30) px(ctx, p[0] - Math.max(1, p[2] * 0.12), p[1] - 1, Math.max(2, Math.round(p[2] * 0.25)), Math.max(1, Math.round(p[2] * 0.06)), PAL.black);
        px(ctx, p[0], p[1] - pole + 1, 1, pole, PAL.white);
        if (pole > 14) px(ctx, p[0] + 1, p[1] - pole + 1, 1, pole, "#a8a8a8");
        if (!dir) { px(ctx, p[0] + 1, p[1] - pole + 1, Math.max(2, fh >> 1), fh + 1, PAL.red); return; }
        for (let i = 0; i < fw; i++) {
          const dy = Math.round(Math.sin((i / fw) * 3.1 + wave * 2.1) * (fh * 0.3) * (i / fw) + droop * i * 0.6);
          const hgt = Math.max(1, Math.round(fh * (1 - (i / fw) * 0.45)));
          px(ctx, dir > 0 ? p[0] + 1 + i : p[0] - 1 - i, p[1] - pole + 1 + dy, 1, hgt, i % 3 === 2 && fw > 6 ? "#a81800" : PAL.red);
        }
      } });
    }
  }
  // the other balls on the hole
  st.players.forEach((Q, i) => {
    if (Q.holed || i === st.cur) return;
    const p = project(cam, Q.x, Q.y);
    if (p) items.push({ d: p[3], f: () => { const s = Math.max(2, Math.min(4, Math.round(p[2] * 0.15))); px(ctx, p[0] - s / 2, p[1] - s + 1, s, s, Q.color?.shirt || PAL.gold); } });
  });
  // the golfer: left of the ball he is playing, the clubhead on it at address
  const moving = st.phase === "flight" || st.phase === "roll" || st.phase === "rest";
  const showGolfer = !moving || cam.adv < 40;
  if (showGolfer && st.phase !== "holeEnd") {
    const p = project(cam, cam.ox, cam.oy);
    if (p) {
      const k = Math.min(1, p[2] / (cam.F / cam.back)), look = looks?.[st.cur] || { shirt: P.color?.shirt, pants: P.color?.pants };
      const pose = poseFor(st, frame, still, ui?.drag), [bx, by] = ballPx(pose.putt);
      items.push({ d: p[3] + 0.05, f: () => {
        const sp = golferCanvas(pose, look), w = Math.round(GW * k), hh = Math.round(GH * k);
        const x0 = Math.round(p[0] - bx * k), y0 = Math.round(p[1] + 1 - by * k);
        // his shadow: on the turf down and to the right of his feet (the sun is behind his left shoulder)
        shadow(ctx, x0 + (FEET[0] + 6) * k, y0 + FEET[1] * k, 13 * k, 2.5 * k, 0.3);
        ctx.drawImage(sp, x0, y0, w, hh);
      } });
    }
  }
  // the ball: its soft shadow on the ground, a trail through the air
  const b = st.ball;
  const holedNow = st.phase === "rest" && P.holed && b && Math.hypot(b.x - h.pin.x, b.y - h.pin.y) < 0.2;
  if (b && !holedNow) {
    if (st.phase === "flight") { mem.trail.push([b.x, b.y, b.z || 0]); if (mem.trail.length > 40) mem.trail.shift(); }
    const ps = project(cam, b.x, b.y), pb = project(cam, b.x, b.y, b.z || 0);
    if (pb) items.push({ d: pb[3] - 0.01, f: () => {
      mem.trail.forEach((q, i) => { if (i % 3) return; const pq = project(cam, q[0], q[1], q[2]); if (pq) px(ctx, pq[0], pq[1], 1, 1, i > mem.trail.length - 10 ? PAL.white : PAL.grey); });
      const s = Math.max(2, Math.min(4, Math.round(pb[2] * 0.22)));
      if (ps) { const z = b.z || 0, k = Math.max(0.35, 1 - z / 40); shadow(ctx, ps[0], ps[1] - 0.5, Math.max(1, s * 0.8 * k), Math.max(0.6, s * 0.3 * k), 0.4 * k); }
      if (pb[1] < cam.H0 + 4 || (b.z || 0) > 0.3) px(ctx, pb[0] - s / 2 - 1, pb[1] - s, s + 2, s + 2, PAL.ink);   // in the sky: an outline so it reads
      px(ctx, pb[0] - s / 2, pb[1] - s + 1, s, s, PAL.white);
      if (s > 2) px(ctx, pb[0] - s / 2 + s - 1, pb[1], 1, 1, PAL.grey);
    } });
  }
  if (st.phase === "aim" || st.phase === "meter") aimLine(ctx, st, h, cam, frame);
  if (cam.putt) slopeArrows(ctx, h, cam);
  items.sort((a, b2) => b2.d - a.d).forEach(it => it.f());
}
function aimLine(ctx, st, h, cam, frame) {
  const P = st.players[st.cur], c = CLUBS[st.club], [dx, dy] = dirOf(st.aim);
  const L = c.putt ? Math.min(PUTT_MAX, Math.hypot(h.pin.x - P.x, h.pin.y - P.y) + 2) : c.carry * (LIE[P.lie] ?? 1);
  const step = c.putt ? 0.5 : 4;
  for (let s = step * 2; s <= L; s += step) {
    if (((s / step) | 0) % 2 === ((frame >> 3) & 1)) continue;
    const p = project(cam, P.x + dx * s, P.y + dy * s);
    if (p && p[1] < PANEL_Y) px(ctx, p[0] - 1, p[1], 2, 1, PAL.white);
  }
  if (st.target && !c.putt) {   // the spot clicked on the map
    const p = project(cam, st.target.x, st.target.y);
    if (p && p[1] < PANEL_Y - 1) { const r = Math.max(2, Math.round(2 * p[2])); px(ctx, p[0] - r, p[1], r - 1, 1, PAL.gold); px(ctx, p[0] + 2, p[1], r - 1, 1, PAL.gold); px(ctx, p[0], p[1] - r, 1, r - 1, PAL.gold); }
  }
  if (!c.putt) {
    const p = project(cam, P.x + dx * L, P.y + dy * L);
    if (p && (frame >> 4) % 2) { const r = Math.max(2, Math.round(3 * p[2])); px(ctx, p[0] - r, p[1], 2 * r + 1, 1, PAL.red); px(ctx, p[0], p[1] - Math.max(1, r >> 1), 1, 2 * Math.max(1, r >> 1) + 1, PAL.red); }
  }
}
function slopeArrows(ctx, h, cam) {
  const G = h.green.poly, b = G.bb, step = 1.6;
  for (let y = b[1]; y <= b[3]; y += step) for (let x = b[0]; x <= b[2]; x += step) {
    if (!inPoly(G, x, y)) continue;
    const [sx, sy] = slopeAt(h, x, y), m = Math.hypot(sx, sy);
    const p = project(cam, x, y);
    if (!p || p[3] > 40 || p[1] >= PANEL_Y - 2 || m < 0.03) continue;
    const q = project(cam, x + (sx / m) * 0.9, y + (sy / m) * 0.9);
    if (!q) continue;
    const col = m > 0.22 ? "#1c5a10" : "#3a8a1c";
    line(ctx, p[0], p[1], q[0], q[1], col);
    px(ctx, q[0] - 1, q[1] - 1, 3, 2, col);
  }
}

// ---- the HUD -------------------------------------------------------------------------------------------
const MX = 6, MY = 184, MW = 120;
const mPos = (m) => MX + Math.round(((m - ACC_END) / (1 - ACC_END)) * MW);
function meter(ctx, st, h, P, drag) {
  const putt = CLUBS[st.club]?.putt;
  px(ctx, MX - 1, MY - 1, MW + 3, 10, PAL.white);
  px(ctx, MX, MY, MW + 1, 8, PAL.black);
  if (!putt) px(ctx, mPos(-ACC_ZONE), MY, mPos(ACC_ZONE) - mPos(-ACC_ZONE), 8, "#1c1c88");
  for (const q of [0.25, 0.5, 0.75, 1]) px(ctx, mPos(q), MY + 6, 1, 2, PAL.dgrey);
  // the putter's meter is pace only: a mark where a flat putt would just reach the cup
  // (the meter is finer at the short end: pace = marker^1.5, sim.js puttPace)
  if (putt) { const d = Math.hypot(h.pin.x - P.x, h.pin.y - P.y) / PUTT_MAX; if (d <= 1) px(ctx, mPos(puttMark(d)), MY + 1, 1, 6, PAL.lime); }
  const m = st.meter || (drag && st.phase === "aim" ? { stage: 1, m: drag.m, power: drag.power } : null);
  if (m) {
    const top = m.stage === 1 ? m.m : m.power;
    for (let x = mPos(0); x < mPos(top); x++) px(ctx, x, MY + 1, 1, 6, x & 1 ? "#f8b800" : (x - mPos(0)) > MW * 0.7 ? "#f86800" : "#f8d000");
    if (m.stage === 2) px(ctx, mPos(m.power), MY - 3, 1, 3, PAL.white);
    px(ctx, mPos(m.m), MY - 2, 2, 12, PAL.white);
  }
  if (!putt) px(ctx, mPos(0), MY - 2, 1, 12, PAL.red);
}
// the wind as the golfer feels it: an arrow turned to the view (up = toward the target)
function windIcon(ctx, x, y, w, rot = 0) {
  px(ctx, x, y, 13, 13, PAL.black);
  px(ctx, x + 6, y + 6, 1, 1, PAL.dgrey);
  if (!w.mph) return;
  const a = w.dir * Math.PI / 4 - rot, ux = Math.sin(a), uy = -Math.cos(a);
  const col = w.mph >= 10 ? PAL.gold : PAL.white;
  line(ctx, x + 6 - ux * 5, y + 6 - uy * 5, x + 6 + ux * 5, y + 6 + uy * 5, col);
  line(ctx, x + 6 + ux * 5, y + 6 + uy * 5, x + 6 + ux * 2 - uy * 3, y + 6 + uy * 2 + ux * 3, col);
  line(ctx, x + 6 + ux * 5, y + 6 + uy * 5, x + 6 + ux * 2 + uy * 3, y + 6 + uy * 2 - ux * 3, col);
}
// "HELP 6 L>R 9": the wind along and across the aim, in mph
export function windWords(w, aim) {
  if (!w.mph) return "";
  const { tail, cross } = windRel(w, aim), out = [];
  if (Math.abs(tail) >= 1) out.push(`${tail > 0 ? "HELP" : "INTO"} ${Math.round(Math.abs(tail))}`);
  if (Math.abs(cross) >= 1) out.push(`${cross > 0 ? "L>R" : "R>L"} ${Math.round(Math.abs(cross))}`);
  return out.join(" ");
}
function portrait(ctx, look, x, y) {
  box(ctx, x, y, 32, 28);
  px(ctx, x + 1, y + 1, 30, 26, "#1c1c88");
  const hd = look?.head;
  if (hd) ctx.drawImage(hd, x + 16 - hd.width, y + 26 - hd.height * 2, hd.width * 2, hd.height * 2);
  else { px(ctx, x + 10, y + 6, 12, 14, look?.skin || PAL.skin); px(ctx, x + 10, y + 4, 12, 4, look?.hair || "#503000"); }
}
function hud(ctx, st, frame, looks, ui) {
  const h = holeOf(st), P = st.players[st.cur], c = CLUBS[st.club];
  portrait(ctx, looks?.[st.cur], 4, 4);
  px(ctx, 38, 4, 150, h.name ? 44 : 34, PAL.black);
  drawText(ctx, P.name.slice(0, 24), 41, 7, P.kind === "cpu" ? PAL.gold : PAL.white);
  drawText(ctx, `HOLE ${h.n} PAR ${h.par} ${h.yards}Y`, 41, 17, PAL.grey);
  const c0 = cardOf(st), tp = c0.toPar[st.cur];
  drawText(ctx, `SHOT ${Math.min(10, P.strokes + (st.phase === "rest" || st.phase === "holeEnd" ? 0 : 1))}`, 41, 27, PAL.white);
  const tpt = c0.played ? toParText(tp) : "E";
  drawText(ctx, tpt, 185 - textWidth(tpt), 27, tp < 0 ? PAL.lime : tp > 0 ? PAL.red : PAL.white);
  if (h.name) drawText(ctx, h.name.slice(0, 24), 41, 38, PAL.gold);
  // the strip along the bottom
  px(ctx, 0, PANEL_Y, W, H - PANEL_Y, PAL.panel);
  px(ctx, 0, PANEL_Y, W, 1, PAL.white);
  px(ctx, 0, PANEL_Y + 1, W, 1, PAL.panel2);
  const carry = c.putt ? "" : yds(c.carry * (LIE[P.lie] ?? 1));
  drawText(ctx, `${c.id} ${carry}`, 4, 172, PAL.white);
  // the club chip (the mouse): a click on it, or the wheel, changes the club
  if (ui?.mouse && st.phase === "aim" && P.kind === "human") { const w = textWidth(`${c.id} ${carry}`) + 5; px(ctx, CLUB_CHIP.x, CLUB_CHIP.y, w, 1, PAL.dgrey); px(ctx, CLUB_CHIP.x, CLUB_CHIP.y + CLUB_CHIP.h - 1, w, 1, PAL.dgrey); px(ctx, CLUB_CHIP.x, CLUB_CHIP.y, 1, CLUB_CHIP.h, PAL.dgrey); px(ctx, CLUB_CHIP.x + w - 1, CLUB_CHIP.y, 1, CLUB_CHIP.h, PAL.dgrey); }
  const pin = Math.hypot(h.pin.x - P.x, h.pin.y - P.y), pinTxt = `PIN ${pin < 30 ? `${Math.round(pin * 3)}FT` : yds(pin)}`;
  drawText(ctx, pinTxt, 84, 172, PAL.white);
  const lie = `LIE ${P.lie === "path" ? "ROAD" : P.lie.toUpperCase()}${P.plug ? " PLUGGED" : ""}`;
  drawText(ctx, lie, W - 4 - textWidth(lie), 172, P.lie === "bunker" || P.lie === "trees" || P.plug ? PAL.gold : PAL.grey);
  meter(ctx, st, h, P, ui?.drag);
  const aim = st.fl?.aim ?? st.aim;
  if (c.putt && st.phase !== "flight") {
    const mx = `PACE // MAX ${Math.round(PUTT_MAX * 3)}FT`;
    drawText(ctx, mx, W - 4 - textWidth(mx), 184, PAL.dgrey);
  } else {
    windIcon(ctx, 134, 181, st.wind, aim);
    drawText(ctx, st.wind.mph ? `${st.wind.mph} MPH` : "CALM", 151, 184, st.wind.mph >= 10 ? PAL.gold : PAL.white);
    const ww = windWords(st.wind, aim);
    if (ww) drawText(ctx, ww, W - 4 - textWidth(ww), 184, PAL.grey);
  }
  const hint = st.phase === "aim" && ui?.mouse && P.kind === "human" ? (ui.drag ? (c.putt ? "LET GO TO PUTT." : ui.drag.stage === 2 ? "PUSH UP THROUGH THE BALL." : "NOW PUSH UP TO SWING. LET GO TO CALL IT OFF.") : ui.hint || (c.putt ? "DRAG DOWN FOR PACE. LET GO TO PUTT." : "CLICK THE MAP TO AIM. DRAG DOWN, PUSH UP TO SWING."))
    : st.phase === "aim" ? (P.kind === "cpu" ? "THE FIGURE AIMS." : c.putt ? "PUTTER: A STARTS THE STROKE, A AGAIN SETS THE PACE." : "AIM LEFT/RIGHT. A TO SWING. X CHANGES CLUB.")
    : st.phase === "meter" ? (P.kind === "cpu" ? "" : c.putt ? "A: SET THE PACE." : st.meter.stage === 1 ? "A: SET THE POWER." : "A: ON THE RED LINE.") : "";
  const msg = st.msg || hint;
  const tone = st.msg ? TONE[st.tone] || PAL.white : PAL.grey;
  wrap(msg, 52).slice(0, 2).forEach((l, i) => drawText(ctx, l, 4, 200 + i * 10, tone));
  void frame;
}
// the corner window: the hole from above (the green close up when putting or near it)
export const PIP = { x: W - 86, y: 4, w: 82, h: 104 };
// the mouse's targets on the picture: the spin ball (under the window; full swings only) and the club chip
export const SPIN = { x: W - 19, y: 118, r: 7 };
export const CLUB_CHIP = { x: 1, y: 169, w: 78, h: 12 };
export const showSpin = (st, ui) => Boolean(ui?.mouse) && st.phase === "aim" && st.players[st.cur].kind === "human" && !CLUBS[st.club]?.putt;
export const onSpin = (gx, gy) => Math.hypot(gx - SPIN.x, gy - SPIN.y) <= SPIN.r + 4;
export const onClubChip = (gx, gy) => gx >= CLUB_CHIP.x && gx < CLUB_CHIP.x + CLUB_CHIP.w && gy >= CLUB_CHIP.y - 2 && gy < CLUB_CHIP.y + CLUB_CHIP.h + 2;
// a press on the spin ball -> where on the ball (-1..1 each way, y up; snapped to the centre near it)
export function spinAt(gx, gy) {
  let x = (gx - SPIN.x) / SPIN.r, y = -(gy - SPIN.y) / SPIN.r;
  const n = Math.hypot(x, y);
  if (n < 0.3) return { x: 0, y: 0 };
  if (n > 1) { x /= n; y /= n; }
  return { x: Math.round(x * 4) / 4, y: Math.round(y * 4) / 4 };
}
function spinBall(ctx, spin) {
  const { x, y, r } = SPIN;
  for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) {
    const d = Math.hypot(dx, dy);
    if (d <= r + 1.2) px(ctx, x + dx, y + dy, 1, 1, d > r - 0.2 ? PAL.black : (dx + dy) > 4 ? PAL.grey : PAL.white);
  }
  px(ctx, x, y, 1, 1, PAL.dgrey);
  px(ctx, x + Math.round((spin?.x || 0) * (r - 2)) - 1, y - Math.round((spin?.y || 0) * (r - 2)) - 1, 3, 3, PAL.red);
}
// a pixel of the corner map -> a spot on the hole (yards), or null: through the map's own framing
// as last drawn (zoom, turn), so a click lands where it looks
export function pipToWorld(st, gx, gy) {
  if (gx < PIP.x + 1 || gy < PIP.y + 1 || gx >= PIP.x + PIP.w - 1 || gy >= PIP.y + PIP.h - 1) return null;
  const f = memOf(st).pip || pipFrame(st);
  const across = (gx - f.bx) * f.s, along = (f.by - gy) * f.s, [ux, uy] = dirOf(f.a);
  return { x: f.ox + ux * along + uy * across, y: f.oy + uy * along - ux * across };
}
// cam: a camera snapshot (viewCam) to read a drag through, so the view turning under the pointer
// does not chase it
export const viewCam = (st) => ({ ...cameraOf(st, holeOf(st)) });
export function screenToWorld(st, gx, gy, cam = viewCam(st)) {
  const yy = Math.max(cam.H0 + 1.5, Math.min(PANEL_Y - 1, gy));      // the sky: toward the horizon
  const d = cam.K / (yy - cam.H0) ** 2, l = ((gx - CX) * d) / cam.F;
  return { x: cam.x + cam.dx * d + cam.rx * l, y: cam.y + cam.dy * d + cam.ry * l, sky: gy <= cam.H0 + 1 };
}
// THE CORNER MAP, ADAPTIVE: it frames the shot, not the hole. The ball near the bottom, the aim
// running straight up, and the scale set so the far edge sits a little past the target (the spot
// clicked, else where the club carries) and the pin when the pin is near enough to matter; as the
// ball gets closer it zooms in (the green complex on an approach, the green itself with its fall
// arrows on or near it). Rings every 50 / 25 / 10 / 5 yards by the scale, the club's carry marked.
// Zoom and turn ease between shots (snap with reduced motion). The turf is the world-aligned
// terrain() round the ball at a stepped scale, drawn turned and scaled: one build per shot.
const PIP_IN = { w: PIP.w - 2, h: PIP.h - 2 }, PIP_BALL = 12;   // the ball sits 12 px off the bottom
function pipFrame(st) {
  const h = holeOf(st), P = st.players[st.cur], c = CLUBS[st.club];
  const moving = st.phase === "flight" || st.phase === "roll" || st.phase === "rest";
  const ox = moving && st.fl ? st.fl.ox : P.x, oy = moving && st.fl ? st.fl.oy : P.y;
  const a = moving && st.fl?.aim != null ? st.fl.aim : st.aim;
  const pin = Math.hypot(h.pin.x - ox, h.pin.y - oy);
  const putt = moving ? Boolean(st.fl?.putt) : Boolean(c?.putt);
  const carry = putt ? 0 : (c?.carry || 0) * (LIE[P.lie] ?? 1);
  const T = !moving && st.target ? Math.hypot(st.target.x - ox, st.target.y - oy) : putt ? pin : carry;
  let far = Math.max(T, pin <= T * 1.35 + 25 ? pin : 0);
  far = putt ? Math.max(far + 3, 9) : far + Math.max(8, far * 0.12);
  const near = putt || P.lie === "green" || pin < 45;
  return { ox, oy, a, s: far / (PIP_IN.h - PIP_BALL - 4), bx: PIP.x + 1 + PIP_IN.w / 2, by: PIP.y + 1 + PIP_IN.h - PIP_BALL, near, carry, putt, pin };
}
const STEP = 1.25, stepOf = (s) => Math.pow(STEP, Math.round(Math.log(s) / Math.log(STEP)));
function pip(ctx, st, frame, still, ui) {
  const h = holeOf(st), mem = memOf(st), want = pipFrame(st);
  let f = mem.pip;
  if (ui?.pipHold && f) { /* a drag on the map: the map holds still under the pointer */ }
  else if (!f || still || f.hi !== st.hi) f = { ...want, hi: st.hi };
  else {
    const k = 0.18, da = Math.atan2(Math.sin(want.a - f.a), Math.cos(want.a - f.a));
    const ls = Math.log(f.s) + (Math.log(want.s) - Math.log(f.s)) * k;
    f = { ...want, hi: st.hi, ox: f.ox + (want.ox - f.ox) * k, oy: f.oy + (want.oy - f.oy) * k, a: Math.abs(da) < 0.002 ? want.a : f.a + da * k, s: Math.abs(Math.log(want.s) - ls) < 0.004 ? want.s : Math.exp(ls) };
    if (Math.hypot(f.ox - want.ox, f.oy - want.oy) < 0.05) { f.ox = want.ox; f.oy = want.oy; }
  }
  mem.pip = f;
  const [ux, uy] = dirOf(f.a);
  const to = (x, y) => { const dx = x - f.ox, dy = y - f.oy; return [f.bx + (dx * uy - dy * ux) / f.s, f.by - (dx * ux + dy * uy) / f.s]; };
  px(ctx, PIP.x - 1, PIP.y - 1, PIP.w + 2, PIP.h + 2, PAL.black);
  px(ctx, PIP.x, PIP.y, PIP.w, PIP.h, PAL.white);
  const x0 = PIP.x + 1, y0 = PIP.y + 1;
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, PIP_IN.w, PIP_IN.h); ctx.clip();
  px(ctx, x0, y0, PIP_IN.w, PIP_IN.h, RAMP.rough[1]);
  // the turf: built round the ball the map is settling on, at the scale it is settling to
  const sb = stepOf(want.s), R = Math.ceil((Math.hypot(PIP_IN.w / 2, PIP_IN.h) * want.s * 1.15) / sb);
  const cx = Math.round(want.ox * 4) / 4, cy = Math.round(want.oy * 4) / 4;
  const T = terrain(h, { s: sb, cx, cy, kind: want.near ? "green" : "hole", w: 2 * R, h: 2 * R });
  const [tx, ty] = to(cx, cy);
  ctx.translate(tx, ty); ctx.rotate(-f.a); ctx.scale(sb / f.s, sb / f.s);
  ctx.drawImage(T, -R, -R);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, PIP_IN.w, PIP_IN.h); ctx.clip();
  // the yardage rings round the ball, numbered up the aim line
  const span = (PIP_IN.h - PIP_BALL) * f.s, ring = span > 160 ? 50 : span > 70 ? 25 : span > 22 ? 10 : 5;
  for (let r = ring; r < span * 1.6; r += ring) {
    const rp = r / f.s, n = Math.max(24, Math.round(rp * 0.9));
    for (let i = 0; i < n; i++) {
      if (i % 2) continue;
      const t = (i / n) * Math.PI * 2, qx = f.bx + Math.sin(t) * rp, qy = f.by - Math.cos(t) * rp;
      if (qy < f.by + 1) px(ctx, qx, qy, 1, 1, "#d8f0c0");
    }
    const ly = Math.round(f.by - rp), lab = String(r);
    if (ly > y0 + 3 && ly < f.by - 8) { px(ctx, f.bx + 3, ly - 3, textWidth(lab) + 2, 9, PAL.black); drawText(ctx, lab, f.bx + 4, ly - 2, PAL.grey); }
  }
  // the aim line, the club's carry, the spot clicked
  const P = st.players[st.cur], aiming = st.phase === "aim" || st.phase === "meter";
  if (aiming) {
    const L = f.putt ? Math.min(PUTT_MAX, f.pin + 2) : f.carry;
    for (let k = 3; k < L / f.s; k += 2) if (((k >> 1) + (frame >> 3)) % 2) px(ctx, f.bx, f.by - k, 1, 1, PAL.white);
    if (!f.putt) { const ey = Math.round(f.by - f.carry / f.s); px(ctx, f.bx - 3, ey, 7, 1, PAL.red); px(ctx, f.bx, ey - 2, 1, 5, PAL.red); }
    if (st.target) { const [gx, gy] = to(st.target.x, st.target.y); px(ctx, gx - 3, gy, 2, 1, PAL.gold); px(ctx, gx + 2, gy, 2, 1, PAL.gold); px(ctx, gx, gy - 3, 1, 2, PAL.gold); px(ctx, gx, gy + 2, 1, 2, PAL.gold); }
  }
  // the pin, the other balls, the ball
  const [fx, fy] = to(h.pin.x, h.pin.y);
  if (f.near) px(ctx, fx - 1, fy - 1, 3, 3, PAL.black);
  px(ctx, fx, fy - 6, 1, 7, PAL.white); px(ctx, fx + 1, fy - 6, 3, 2, PAL.red);
  st.players.forEach((Q, i) => {
    if (Q.holed || (i === st.cur && st.ball)) return;
    const [qx, qy] = to(Q.x, Q.y);
    px(ctx, qx - 1, qy - 1, 3, 3, Q.color?.shirt || PAL.gold); px(ctx, qx, qy, 1, 1, PAL.white);
  });
  const b = st.ball;
  if (b && !(st.phase === "rest" && P.holed && Math.hypot(b.x - h.pin.x, b.y - h.pin.y) < 0.2)) {
    const [bx, by] = to(b.x, b.y), lift = Math.min(14, Math.round(((b.z || 0) / f.s) * 0.8));
    if (lift > 0) px(ctx, bx - 1, by, 3, 1, PAL.black);
    px(ctx, bx - 1, by - lift - 1, 2, 2, PAL.white);
  }
  ctx.restore();
  // the scale, bottom left: the ring spacing in words
  const sc = `${ring}Y`;
  px(ctx, x0, PIP.y + PIP.h - 10, textWidth(sc) + 3, 9, PAL.black);
  drawText(ctx, sc, x0 + 1, PIP.y + PIP.h - 9, PAL.grey);
  // the wind as it meets this shot (the map is turned to the aim)
  windIcon(ctx, PIP.x + PIP.w - 15, PIP.y + PIP.h - 15, st.wind, f.a);
}

// ---- overlays -------------------------------------------------------------------------------------------
function intro(ctx, st, frame, looks) {
  const h = holeOf(st);
  px(ctx, 0, 0, W, H, PAL.black);
  const v = holeView(h, 112, 200);
  box(ctx, 3, 3, 116, 204);
  mapIn(ctx, st, v, 5, 5, frame, false);
  const x = 128, w = 31;
  let y = 8;
  const put = (s, c, gap = 10) => { drawText(ctx, s, x, y, c); y += gap; };
  put(`HOLE ${h.n} // PAR ${h.par}`, PAL.gold, 12);
  for (const l of wrap(h.name || "THE DEPARTMENT LINKS", w)) put(l, PAL.white);
  for (const l of wrap(h.after ? `AFTER: ${h.after}` : "AFTER: APPLICATION 001", w)) put(l, PAL.dgrey);
  y += 2;
  put(`${h.yards} YARDS`, PAL.white);
  put(st.wind.mph ? `WIND ${st.wind.mph} MPH ${windWords(st.wind, 0)}` : "NO WIND", PAL.grey, 13);
  for (const l of wrap(h.note || "THE ASSEMBLY DECLINED THIS HOLE. THE DEPARTMENT KEPT THE DRAWINGS.", w).slice(0, 6)) put(l, PAL.lime);
  const cards = st.players.map((Q, i) => looks?.[i]?.card).filter(Boolean);
  cards.forEach((c, i) => ctx.drawImage(c, x + i * 40, 148, 32, 48));
  drawText(ctx, `${st.players[st.honor[0]].name.split(" ").pop()} ON THE TEE`.slice(0, 22), x, 200, PAL.white);
  if ((frame >> 5) % 2) drawText(ctx, "A TO PLAY", W - 4 - textWidth("A TO PLAY"), 200, PAL.dgrey);
  // the shapes' source, in the small print (ODbL)
  if (h.osm) drawText(ctx, "MAP DATA (C) OPENSTREETMAP CONTRIBUTORS", 4, H - 10, PAL.dgrey);
  else drawText(ctx, h.famous ? "SHAPES DRAWN BY THE DEPARTMENT" : "THE DEPARTMENT'S DRAWINGS", 4, H - 10, PAL.dgrey);
}
export function scorecard(ctx, st, title) {
  const c = cardOf(st), k = Math.min(st.hi, st.holes.length - 1), nine = Math.floor(k / 9) * 9;
  const rows = c.rows.slice(nine, nine + 9);
  const bx = 24, bw = W - 48;
  box(ctx, bx, 28, bw, 30 + 12 * (2 + st.players.length) + 30);
  drawText(ctx, title, Math.round(W / 2 - textWidth(title) / 2), 34, PAL.gold);
  const x0 = bx + 6, colW = 20, lx = bx + 54, y0 = 50;
  drawText(ctx, "HOLE", x0, y0, PAL.grey);
  drawText(ctx, "PAR", x0, y0 + 12, PAL.grey);
  rows.forEach((r, i) => {
    const s = String(r.n), x = lx + i * colW + Math.round((colW - textWidth(s)) / 2);
    drawText(ctx, s, x, y0, PAL.grey);
    drawText(ctx, String(r.par), lx + i * colW + 7, y0 + 12, PAL.white);
  });
  const tw = lx + 9 * colW + 4;
  drawText(ctx, "TOT", tw, y0, PAL.grey);
  drawText(ctx, String(rows.reduce((a, r) => a + r.par, 0)), tw, y0 + 12, PAL.white);
  st.players.forEach((P, pi) => {
    const y = y0 + 24 + pi * 12;
    drawText(ctx, P.name.split(" ").pop().slice(0, 7), x0, y, P.kind === "cpu" ? PAL.gold : PAL.white);
    let sum = 0, n = 0;
    rows.forEach((r, i) => {
      const s = r.s[pi];
      if (s == null) return;
      sum += s; n++;
      const d = s - r.par, col = d < 0 ? PAL.lime : d > 0 ? PAL.red : PAL.white;
      const t = String(s), x = lx + i * colW + Math.round((colW - textWidth(t)) / 2);
      if (d < 0) { px(ctx, x - 2, y - 2, textWidth(t) + 4, 11, "#005800"); }
      drawText(ctx, t, x, y, col);
    });
    if (n) drawText(ctx, String(sum), tw, y, PAL.white);
  });
  const yb = y0 + 24 + st.players.length * 12 + 8;
  const totals = st.players.map((P, i) => `${P.name.split(" ").pop().slice(0, 9)} ${c.played ? toParText(c.toPar[i]) : "E"}`).join("  ");
  drawText(ctx, `THRU ${c.played}: ${totals}`.slice(0, 44), x0, yb, PAL.white);
  if (st.players.length > 1 && c.played) {
    const d = c.won[0] - c.won[1];
    const s = d === 0 ? "MATCH ALL SQUARE" : `${st.players[d > 0 ? 0 : 1].name.split(" ").pop()} ${Math.abs(d)} UP`;
    drawText(ctx, s, x0, yb + 12, PAL.gold);
  }
}

// The gallery's mood for the shot that just came to rest (render's copy; Golf.jsx asks the same
// gallery.js for the sound and the screen reader's line).
function trackGallery(st, frame) {
  const mem = memOf(st);
  if (st.phase !== "rest") return;
  const P = st.players[st.cur], key = `${st.hi}|${st.cur}|${P.strokes}|${P.holed}`;
  if (mem.reactKey === key) return;
  mem.reactKey = key;
  const r = reactionFor(st, holeOf(st));
  mem.react = r ? { kind: r.kind, f0: frame } : null;
}

// looks: per player {head, skin, hair, shirt, pants, cap, glove, card} (looks.js), or nothing yet
// opts: {still (reduced motion: no sway, no shimmer; the end scene one frame)}
// opts.ui (the mouse): {mouse (a pointer is in use), drag ({m, power, stage}: a swing being dragged),
// spin ({x, y}), hint (the first-time line)}
export function draw(ctx, st, frame, paused, looks, opts = {}) {
  ctx.imageSmoothingEnabled = false;
  px(ctx, 0, 0, W, H, PAL.black);
  if (st.phase === "done") { drawEnd(ctx, st, frame, looks, opts, { W, H, scorecard, PAL, RAMP, dith, shadow }); return; }
  trackGallery(st, frame);
  if (st.phase === "intro") { intro(ctx, st, frame, looks); }
  else {
    behindView(ctx, st, frame, looks, Boolean(opts.still), opts.ui);
    hud(ctx, st, frame, looks, opts.ui);
    pip(ctx, st, frame, Boolean(opts.still), opts.ui);
    if (showSpin(st, opts.ui)) spinBall(ctx, opts.ui.spin);
  }
  if (st.phase === "holeEnd") scorecard(ctx, st, `AFTER HOLE ${holeOf(st).n}`);
  if (paused) {
    box(ctx, 60, 90, W - 120, 40);
    drawText(ctx, "PAUSED", Math.round(W / 2 - textWidth("PAUSED") / 2), 98, PAL.gold);
    drawText(ctx, "THE DEPARTMENT WAITS.", Math.round(W / 2 - textWidth("THE DEPARTMENT WAITS.") / 2), 112, PAL.grey);
  }
}
