// THE DEPARTMENT LINKS / THE DEPARTMENT OPEN on a 256x224 canvas, NES-style, framed the way the
// old cartridge golf games framed it: the golfer large, from behind, the hole running away from
// him in perspective to a horizon (sky, clouds, a far tree line or the sea), and the hole from
// above in a small bordered window in the corner. After contact the camera follows the ball down
// the hole; on the green it drops low behind the putter and the green's fall is drawn on the turf.
//
// Reads the sim's state and changes nothing in it (a camera and a ball trail are kept here, per
// round, for the picture only). Every pixel is a whole pixel; the canvas is scaled by whole
// device pixels with smoothing off (Golf.jsx).
import { surfaceAt, slopeAt, frameOf, fnv, rngOf } from "./course.js";
import { CLUBS, LIE, ACC_ZONE, ACC_END, PUTT_MAX, holeOf, dirOf, cardOf, toParText } from "./sim.js";
import { drawText, textWidth, wrap } from "./font.js";
import { shade } from "./looks.js";

export const W = 256, H = 224;
const PANEL_Y = 168;                          // the HUD strip along the bottom
export const PAL = {
  black: "#000000", white: "#fcfcfc", grey: "#bcbcbc", dgrey: "#7c7c7c", red: "#d82800", gold: "#f8b800", lime: "#b8f818",
  ob: "#004000", ob2: "#005800", rough: "#00a800", rough2: "#008800", rough3: "#20b820", fairway: "#58d854", fairway2: "#48c444",
  fringe: "#80d010", green: "#b8f818", green2: "#a8e410", bunker: "#fce0a8", bunker2: "#ecd098", lipD: "#c09050", lipL: "#fcf4dc",
  waste: "#e4c890", scrub: "#8c7400", water: "#0058f8", water2: "#3cbcfc", deep: "#0040c8", tree: "#005800", tree2: "#00a800",
  under: "#006c00", tee: "#58d854", skin: "#fca044", line: "#3cbcfc",
  sky0: "#5c7cf8", sky1: "#3cbcfc", sky2: "#a4e4fc", cloud: "#fcfcfc", cloud2: "#bcd8fc",
};
const SURF = { ob: [PAL.ob, PAL.ob2], rough: [PAL.rough, PAL.rough2], fairway: [PAL.fairway, PAL.fairway], fringe: [PAL.fringe, PAL.fringe], green: [PAL.green, PAL.green], bunker: [PAL.bunker, PAL.bunker2], water: [PAL.water, PAL.water2], tee: [PAL.tee, PAL.fairway], trees: [PAL.tree, PAL.tree2] };
const TONE = { harm: PAL.red, warn: PAL.gold, good: PAL.lime, "": PAL.white };
const yds = (v) => `${Math.round(v)}Y`;
const RGB = {};
const rgbOf = (h) => RGB[h] || (RGB[h] = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const hash = (a, b, c = 0) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };

function px(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
function line(ctx, x0, y0, x1, y1, c, u = 1, ox = 0, oy = 0) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  ctx.fillStyle = c;
  for (let k = 0; k < 600; k++) {
    ctx.fillRect(ox + x0 * u, oy + y0 * u, u, u);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}
function box(ctx, x, y, w, h) { px(ctx, x, y, w, h, PAL.white); px(ctx, x + 1, y + 1, w - 2, h - 2, PAL.black); }

// =====================================================================================================
// The top-down map (the corner window, the hole card at the tee): world yards <-> window pixels.
export function holeView(h, w, hh) {
  const xs = h.pts.map(p => p[0]);
  const s = Math.max(0.6, (h.top - h.bottom) / hh, (Math.max(...xs) - Math.min(...xs) + 70) / w);
  return { s, cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (h.top + h.bottom) / 2, kind: "hole", w, h: hh };
}
export function greenView(h, ball, w, hh) {
  const d = Math.hypot(ball.x - h.pin.x, ball.y - h.pin.y);
  const s = Math.max((2 * (h.green.r + 6)) / w, (d + 8) / (hh * 0.85));
  const far = d > h.green.r + 4;
  return { s, cx: far ? (ball.x + h.pin.x) / 2 : h.green.x, cy: far ? (ball.y + h.pin.y) / 2 : h.green.y, kind: "green", w, h: hh };
}
const toPx = (v, x, y, ox, oy) => [Math.round(ox + v.w / 2 + (x - v.cx) / v.s), Math.round(oy + v.h / 2 - (y - v.cy) / v.s)];

const CACHE = new Map();
function terrain(h, v) {
  const key = `${h.id || h.n}|${h.famous ? "o" : "l"}|${v.kind}|${v.w}x${v.h}|${v.s.toFixed(3)}|${v.cx.toFixed(2)}|${v.cy.toFixed(2)}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const c = document.createElement("canvas");
  c.width = v.w; c.height = v.h;
  const g = c.getContext("2d"), img = g.createImageData(v.w, v.h), d = img.data;
  const RG = Object.fromEntries(Object.entries(SURF).map(([k, [a, b]]) => [k, [rgbOf(a), rgbOf(b)]]));
  for (let py = 0; py < v.h; py++) for (let qx = 0; qx < v.w; qx++) {
    const x = v.cx + (qx + 0.5 - v.w / 2) * v.s, y = v.cy - (py + 0.5 - v.h / 2) * v.s;
    const s = surfaceAt(h, x, y);
    let alt = false;
    if (s === "rough") alt = (qx + py * 3) % 7 === 0;
    else if (s === "ob") alt = (qx + py) % 2 === 0;
    else if (s === "water") alt = (qx * 3 + py * 5) % 23 === 0;
    else if (s === "bunker") alt = (qx + py * 2) % 9 === 0;
    else if (s === "trees") alt = (qx + py) % 2 === 0;
    else if (s === "fairway") alt = v.kind !== "green" && Math.floor(py / 3) % 2 === 1;
    let col = RG[s][alt ? 1 : 0];
    if (s === "fairway" && alt) col = rgbOf(PAL.fairway2);
    const i = (py * v.w + qx) * 4;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  if (v.kind === "green") {
    // the fall of the green: an arrow every 12 px, pointing downhill; darker and longer is steeper
    for (let py = 6; py < v.h; py += 12) for (let qx = 6; qx < v.w; qx += 12) {
      const x = v.cx + (qx - v.w / 2) * v.s, y = v.cy - (py - v.h / 2) * v.s;
      const sf = surfaceAt(h, x, y);
      if (sf !== "green" && sf !== "fringe") continue;
      const [sx, sy] = slopeAt(h, x, y), m = Math.hypot(sx, sy);
      g.fillStyle = m > 0.35 ? "#007800" : "#58a800";
      if (m < 0.04) { g.fillRect(qx, py, 1, 1); continue; }
      const ux = sx / m, uy = -sy / m, L = m > 0.35 ? 4 : 3;
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
  if (v.kind === "hole") { const [tx, ty] = toPx(v, 0, 0, ox, oy); px(ctx, tx - 2, ty - 1, 5, 3, PAL.fairway); px(ctx, tx - 2, ty - 1, 1, 1, PAL.white); px(ctx, tx + 2, ty - 1, 1, 1, PAL.white); }
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
// The view from behind the golfer. A camera behind the ball, looking along the aim: a screen row
// below the horizon is a distance, a column a distance across. The rows are the old cartridge
// cheat, not a lens: depth d sits sqrt(K / d) rows under the horizon, so the far half of a hole
// gets rows enough to read (a green 140 yards out is a shape, not a line). Across is plain
// perspective (F / d px a yard), and so are heights. Rows are sampled from a lazily filled raster
// of the hole (half-yard cells), two pixels wide.
const MODES = {
  // grip: where the clubhead sits at address, in px from the golfer's feet (golferSprite at k = 1)
  drive: { F: 160, back: 8.7, ballY: 164, side: -1.7, grip: [17.4, -0.2] },
  putt: { F: 184, back: 5.2, ballY: 152, side: -0.9, grip: [12.4, -7.7] },
};
const horizonOf = (h) => 62 - Math.round((h.elev || 0) * 7);
const rowOf = (cam, d) => cam.H0 + Math.sqrt(cam.K / d);

const CODE = { water: 0, bunker: 1, green: 2, fringe: 3, tee: 4, ob: 5, trees: 6, fairway: 7, rough: 8, waste: 9 };
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
  if (c === 255) {
    const wx = R.x0 + (ix + 0.5) / 2, wy = R.y0 + (iy + 0.5) / 2, s = surfaceAt(h, wx, wy);
    c = CODE[s];
    if (s === "bunker" && h.famous && !h.bunkers.some(b => Math.hypot(wx - b.x, wy - b.y) <= b.r)) {
      const { along } = frameOf(h.pts, wx, wy);
      if (h.z.some(z => z.k === "cross" && z.a[2] === "waste" && along >= z.a[0] && along <= z.a[1])) c = CODE.waste;
    }
    R.d[i] = c;
  }
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
  // follow the ball down the hole once it is well away (never on a putt)
  const mem = memOf(st);
  let adv = 0, lat = 0;
  if (moving && !putt && st.ball) {
    const bx = st.ball.x - ox, by = st.ball.y - oy, along = bx * dx + by * dy, across = bx * rx + by * ry;
    adv = Math.max(0, along - 48); lat = across * Math.min(1, adv / 60);
  }
  if (!moving) { mem.adv = 0; mem.lat = 0; mem.trail = []; }
  else { mem.adv += (adv - mem.adv) * 0.12; mem.lat += (lat - mem.lat) * 0.12; }
  const cx = ox + dx * (mem.adv - M.back) + rx * (mem.lat - M.side), cy = oy + dy * (mem.adv - M.back) + ry * (mem.lat - M.side);
  const H0 = horizonOf(h);
  return { ...M, putt, x: cx, y: cy, dx, dy, rx, ry, aim, ox, oy, H0, K: M.back * (M.ballY - H0) ** 2, adv: mem.adv };
}
const MEM = new WeakMap();
function memOf(st) { let m = MEM.get(st); if (!m) MEM.set(st, m = { adv: 0, lat: 0, trail: [], floorKey: "", floor: null, water: [] }); return m; }
// world -> screen: [x, ground y, scale (px per yard), depth]
function project(cam, x, y, z = 0) {
  const qx = x - cam.x, qy = y - cam.y, d = qx * cam.dx + qy * cam.dy, l = qx * cam.rx + qy * cam.ry;
  if (d < 0.3) return null;
  const s = cam.F / d;
  return [128 + l * s, rowOf(cam, d) - z * s, s, d];
}

// the turf: one colour per sample, from the cell, its neighbours and where it is in the world
function floor(ctx, st, h, cam, frame) {
  const mem = memOf(st), R = rasterOf(h);
  const key = `${h.id || h.n}|${cam.x.toFixed(2)}|${cam.y.toFixed(2)}|${cam.aim.toFixed(4)}|${cam.putt}`;
  const top = cam.H0 + 1, rows = PANEL_Y - top;
  if (mem.floorKey !== key || !mem.floor) {
    const img = mem.floor && mem.floor.height === rows ? mem.floor : ctx.createImageData(W, rows), d = img.data;
    const water = [];
    const ocean = h.scene === "ocean";
    for (let r = 0; r < rows; r++) {
      const y = top + r, z = cam.K / (y - cam.H0 + 0.5) ** 2;
      for (let x = 0; x < W; x += 2) {
        const l = ((x + 1 - 128) * z) / cam.F;
        const wx = cam.x + cam.dx * z + cam.rx * l, wy = cam.y + cam.dy * z + cam.ry * l;
        let c = cellAt(h, R, wx, wy);
        if (c === 10) c = ocean ? CODE.water : CODE.ob;
        const fx = Math.floor(wx * 2), fy = Math.floor(wy * 2), hv = hash(fx, fy) % 13;
        let col;
        switch (c) {
          case CODE.fairway: col = Math.floor(wy / 5) & 1 ? PAL.fairway2 : PAL.fairway; break;
          case CODE.green: col = (Math.floor(wx / 2.5) + Math.floor(wy / 2.5)) & 1 ? PAL.green2 : PAL.green; break;
          case CODE.fringe: col = PAL.fringe; break;
          case CODE.tee: col = PAL.tee; break;
          case CODE.rough: col = hv === 0 ? PAL.rough2 : hv === 1 ? PAL.rough3 : PAL.rough; break;
          case CODE.trees: col = hv < 6 ? PAL.under : PAL.ob2; break;
          case CODE.ob: col = hv < 5 ? PAL.ob : PAL.ob2; break;
          case CODE.waste: col = hv === 0 || hv === 1 ? PAL.scrub : hv < 5 ? PAL.bunker2 : PAL.waste; break;
          case CODE.bunker: {
            // the lip: the far edge in shadow, the near edge lit
            const far = cellAt(h, R, wx + cam.dx * 0.7, wy + cam.dy * 0.7), nr = cellAt(h, R, wx - cam.dx * 0.6, wy - cam.dy * 0.6);
            col = far !== CODE.bunker && far !== CODE.waste ? PAL.lipD : nr !== CODE.bunker && nr !== CODE.waste ? PAL.lipL : hv === 0 ? PAL.bunker2 : PAL.bunker;
            break;
          }
          case CODE.water: col = z > 220 && (x >> 1) % 2 === r % 2 ? PAL.deep : PAL.water; if ((hv === 3 || hv === 7) && r % 2 === 0) water.push(r * W + x); break;
          default: col = PAL.rough;
        }
        const [R0, G0, B0] = rgbOf(col), i = (r * W + x) * 4;
        d[i] = d[i + 4] = R0; d[i + 1] = d[i + 5] = G0; d[i + 2] = d[i + 6] = B0; d[i + 3] = d[i + 7] = 255;
      }
    }
    mem.floor = img; mem.floorKey = key; mem.water = water;
  }
  ctx.putImageData(mem.floor, 0, top);
  // the water's shimmer: a few of the water's pixels catch the light each frame
  const t = frame >> 3;
  for (const p of mem.water) {
    const hv = hash(p, t) % 11;
    if (hv > 1) continue;
    px(ctx, p % W, top + Math.floor(p / W), 2, 1, hv ? PAL.water2 : PAL.white);
  }
}

// The sky, the clouds, the far edge of the world.
function noise1(seed, v) { const i = Math.floor(v), f = v - i, a = hash(seed, i) / 4294967296, b = hash(seed, i + 1) / 4294967296; return a + (b - a) * (f * f * (3 - 2 * f)); }
function sky(ctx, st, h, cam, frame) {
  const H0 = cam.H0;
  px(ctx, 0, 0, W, H0 + 1, PAL.sky0);
  const b1 = Math.round(H0 * 0.38), b2 = H0 - 12;
  px(ctx, 0, b1, W, b2 - b1, PAL.sky1);
  px(ctx, 0, b2, W, H0 + 1 - b2, PAL.sky2);
  // dithered seams between the bands
  for (let x = 0; x < W; x += 2) { px(ctx, x + ((b1 >> 0) & 1), b1 - 1, 1, 1, PAL.sky1); px(ctx, x, b1 - 2, 1, 1, PAL.sky0); px(ctx, x + 1, b2 - 1, 1, 1, PAL.sky2); }
  // clouds: fixed per hole, drifting with the wind across the view, turning with the aim
  const seed = fnv(`clouds|${h.id || h.n}`), rnd = rngOf(seed);
  const wl = (st.wind.x * cam.rx + st.wind.y * cam.ry);
  for (let i = 0; i < 5; i++) {
    const bx = rnd() * 512, by = 6 + rnd() * (H0 - 34), cw = 18 + Math.floor(rnd() * 26);
    let x = bx - cam.aim * cam.F * 1.2 + frame * wl * 0.004;
    x = (((x % 512) + 512) % 512) - 128;
    const y = Math.round(by);
    for (let k = 0; k < 4; k++) {
      const ox = Math.round(x + (k * cw) / 4), r = Math.round(cw / 5 + ((k * 7 + i) % 3) * 2);
      for (let yy = -r; yy <= 0; yy += 2) { const ww = Math.round(Math.sqrt(r * r - yy * yy)) * 2; px(ctx, ox - (ww >> 1), y + yy, ww, 2, yy > -3 ? PAL.cloud2 : PAL.cloud); }
    }
    px(ctx, Math.round(x) - 2, y, cw + 8, 2, PAL.cloud2);
  }
  // the far edge: per column, sea where the hole runs out to water, else trees, dunes or pines
  const R = rasterOf(h), sd = fnv(`edge|${h.id || h.n}`);
  for (let x = 0; x < W; x += 2) {
    const ang = cam.aim + Math.atan((x + 1 - 128) / cam.F);
    const zf = 330, l = ((x + 1 - 128) * zf) / cam.F;
    const c = cellAt(h, R, cam.x + cam.dx * zf + cam.rx * l, cam.y + cam.dy * zf + cam.ry * l);
    const sea = c === CODE.water || (c === 10 && h.scene === "ocean");
    if (sea) { px(ctx, x, H0 - 1, 2, 2, (hash(x, frame >> 4) % 7) ? PAL.water : PAL.water2); continue; }
    const scene = h.scene || "parkland";
    const n = noise1(sd, ang * 34), n2 = noise1(sd + 1, ang * 120);
    if (scene === "links") {
      const ht = 2 + Math.round(n * 5);
      px(ctx, x, H0 - ht, 2, ht + 1, "#88a830"); px(ctx, x, H0 - ht, 2, 1, "#c8c070");
    } else if (scene === "pines" || scene === "ocean") {
      const ht = 5 + Math.round(n * 9 + (n2 > 0.6 ? 4 : 0) + ((x >> 1) % 3 === 0 ? 2 : 0));
      px(ctx, x, H0 - ht, 2, ht + 1, PAL.tree); if (n2 > 0.5) px(ctx, x, H0 - ht + 2, 1, ht - 2, "#007800");
    } else {
      const ht = 6 + Math.round(n * 8 + n2 * 3);
      px(ctx, x, H0 - ht, 2, ht + 1, "#007800"); px(ctx, x, H0 - ht, 2, 2, PAL.tree2); px(ctx, x, H0 - ht + 4, 2, ht - 3, PAL.tree);
    }
  }
}

// ---- sprites: trees, the crowd, the flag ------------------------------------------------------------
const SPR = {};
function sprite(kind) {
  if (SPR[kind]) return SPR[kind];
  const mk = (w, h, f) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); f((x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); }); return c; };
  const D = PAL.tree, L = PAL.tree2, M = "#007800", T = "#7c4c00", T2 = "#503000";
  let c;
  if (kind === "pine") c = mk(14, 30, (r) => {
    r(6, 25, 2, 5, T);
    for (let i = 0; i < 26; i++) { const tier = Math.floor(i / 7), w = 2 + (i % 7) + tier * 2; r(7 - (w >> 1), i, w, 1, D); r(7, i, Math.max(1, w >> 2), 1, (i % 7) < 2 ? L : M); }
  });
  else if (kind === "oak") c = mk(20, 22, (r) => {
    r(9, 15, 3, 7, T); r(9, 15, 1, 7, T2);
    for (let y = 0; y < 17; y++) { const w = Math.round(2 * Math.sqrt(Math.max(0, 64 - (y - 8) * (y - 8)))) + 2; r(10 - (w >> 1), y, w, 1, y > 11 ? D : M); }
    r(11, 2, 4, 3, L); r(13, 5, 4, 3, L); r(6, 4, 3, 2, L); r(4, 10, 3, 2, D); r(14, 11, 3, 2, D);
  });
  else if (kind === "cypress") c = mk(26, 18, (r) => {
    r(11, 8, 2, 10, T); r(13, 11, 3, 2, T); r(9, 13, 2, 2, T);
    r(2, 3, 22, 4, D); r(0, 5, 26, 3, D); r(4, 1, 15, 3, M); r(5, 1, 6, 1, L); r(14, 2, 6, 1, L); r(1, 7, 8, 2, M); r(16, 7, 9, 2, M);
  });
  else if (kind === "palm") c = mk(16, 28, (r) => {
    for (let y = 6; y < 28; y++) r(7 + Math.round(Math.sin(y / 9) * 2), y, 2, 1, y % 3 ? "#a87c3c" : "#7c5420");
    r(2, 3, 12, 2, L); r(0, 5, 5, 2, D); r(11, 5, 5, 2, D); r(5, 1, 6, 2, M); r(1, 7, 3, 2, D); r(12, 7, 3, 2, D); r(7, 5, 3, 2, "#7c5420");
  });
  else if (kind === "gorse") c = mk(12, 7, (r) => {
    r(1, 2, 10, 5, D); r(3, 0, 6, 2, M); r(0, 4, 12, 3, D); r(3, 1, 1, 1, PAL.gold); r(7, 3, 1, 1, PAL.gold); r(9, 1, 1, 1, PAL.gold); r(2, 4, 1, 1, PAL.gold);
  });
  else if (kind === "person") c = mk(3, 6, (r) => { r(1, 0, 1, 1, "#fca044"); r(0, 1, 3, 3, "#fcfcfc"); r(0, 4, 1, 2, "#000000"); r(2, 4, 1, 2, "#000000"); });
  SPR[kind] = c;
  return c;
}
const TREE_W = { pine: 14, oak: 20, cypress: 26, palm: 16, gorse: 12 };
const treeKind = (h, t) => t.k || (hash(Math.round(t.x * 10), Math.round(t.y * 10)) % 3 === 0 ? "oak" : "pine");
const SHIRTS = ["#d82800", "#fcfcfc", "#f8b800", "#0058f8", "#00a800", "#f878f8", "#7c7c7c", "#000000", "#3cbcfc"];

// The crowd: a few dozen people round the green, on the side the hole names, out of the water.
const CROWD = new Map();
function crowdOf(h) {
  const key = h.id || `l${h.n}`;
  if (CROWD.has(key)) return CROWD.get(key);
  const rnd = rngOf(fnv(`crowd|${key}`)), out = [];
  const side = h.gallery ?? (h.n % 2 ? 1 : -1);
  const [ux, uy] = (() => { const a = h.pts[h.pts.length - 2], b = h.pts[h.pts.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; })();
  const c0 = side === 0 ? 150 : side > 0 ? 40 : 230, span = side === 0 ? 80 : 100;
  for (let i = 0; i < 46; i++) {
    const deg = c0 + rnd() * span, a = (deg * Math.PI) / 180, dist = h.green.r + 9 + rnd() * 7;
    const x = h.green.x - ux * Math.cos(a) * dist + uy * Math.sin(a) * dist, y = h.green.y - uy * Math.cos(a) * dist - ux * Math.sin(a) * dist;
    const s = surfaceAt(h, x, y);
    if (s === "water" || s === "bunker" || s === "green") continue;
    out.push({ x, y, shirt: SHIRTS[Math.floor(rnd() * SHIRTS.length)], skin: ["#fca044", "#e4a070", "#a86c3c", "#6c4420"][Math.floor(rnd() * 4)] });
  }
  CROWD.set(key, out);
  return out;
}

// ---- the golfer, from behind, in 2-px units ------------------------------------------------------------
const GW = 72, GH = 100, GOX = 36, GOY = 98;
let GC = null;
function swingPose(st, frame) {
  const putt = st.fl?.putt || (!st.fl && CLUBS[st.club]?.putt) || (st.phase !== "flight" && st.phase !== "roll" && st.phase !== "rest" && CLUBS[st.club]?.putt);
  const addr = 0.05, top = putt ? 0.55 : 2.55;
  const m = st.meter;
  if (st.phase === "meter" && m) { const k = Math.max(0, m.m); return { a: addr + (top - addr) * k, hinge: putt ? 0.42 : 0.45 + 0.95 * k, putt, k }; }
  if ((st.phase === "flight" || st.phase === "roll" || st.phase === "rest") && !st.fl?.putt) {
    const k = Math.min(1, (st.phase === "flight" ? st.t : 30) / 12);
    return { a: addr - 2.7 * k, hinge: 0.45 - 1.6 * k, putt: false, k: 0 };
  }
  if ((st.phase === "roll" || st.phase === "rest") && st.fl?.putt) return { a: addr - 0.45, hinge: 0.42, putt: true, k: 0 };
  const sway = st.phase === "aim" ? Math.sin(frame / 11) * 0.05 : 0;
  return { a: addr + sway, hinge: (putt ? 0.42 : 0.45) + sway, putt, k: 0 };
}
function golferSprite(st, look, frame) {
  if (!GC) { GC = document.createElement("canvas"); GC.width = GW; GC.height = GH; }
  const g = GC.getContext("2d");
  g.clearRect(0, 0, GW, GH);
  const u = 2;
  const r = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(GOX + Math.round(x * u), GOY + Math.round(y * u), Math.round(w * u), Math.round(h * u)); };
  const L = look || {};
  const shirt = L.shirt || "#3cbcfc", shirtD = shade(shirt, 0.7), pants = L.pants || "#7c7c7c", pantsD = shade(pants, 0.7);
  const skin = L.skin || PAL.skin, hair = L.hair || "#503000", cap = L.cap || PAL.white, capD = shade(cap, 0.75);
  const pose = swingPose(st, frame);
  const twist = pose.k > 0.5 ? 1 : 0, bob = st.phase === "aim" && (frame >> 5) % 2 ? 0.5 : 0;
  // feet, legs, belt
  r(-7, -1, 5, 1, "#202020"); r(2, -1, 5, 1, "#202020"); r(-7, -1, 2, 1, PAL.white); r(5, -1, 2, 1, PAL.white);
  r(-6, -15, 4, 14, pants); r(2, -15, 4, 14, pants); r(-3, -15, 1, 14, pantsD); r(2, -15, 1, 6, pantsD); r(-2, -15, 4, 3, pants);
  r(-6, -16 + bob, 12, 1, "#202020");
  // torso (the back of the polo), turned a touch at the top of the swing
  const tx = twist;
  r(-6 + tx, -28 + bob, 12, 12, shirt); r(-6 + tx, -28 + bob, 2, 12, shirtD); r(-1 + tx, -26 + bob, 1, 8, shirtD);
  r(-8 + tx, -28 + bob, 2, 4, shirtD); r(6 + tx, -28 + bob, 2, 4, shirt);
  r(-2 + tx, -29 + bob, 4, 1, shirtD); r(-1 + tx, -30 + bob, 2, 1, skin);
  // the head from behind: hair, ears, the cap and its strap
  const hx = tx * 0.5;
  r(-3 + hx, -36 + bob, 6, 6, hair); r(-4 + hx, -34 + bob, 1, 2, skin); r(3 + hx, -34 + bob, 1, 2, skin);
  r(-3 + hx, -31 + bob, 6, 1, shade(hair, 0.8));
  r(-3 + hx, -38 + bob, 6, 3, cap); r(-3 + hx, -36 + bob, 6, 1, capD); r(-1 + hx, -36 + bob, 2, 1, shade(cap, 0.55));
  // arms and club: the hands swing round the shoulders' middle; the club hinges at the wrists
  const sx = 0 + tx, sy = -26 + bob, R = 11, a = pose.a;
  const hxp = sx + Math.sin(a) * R, hyp = sy + Math.cos(a) * R;
  const ca = a + pose.hinge, cl = pose.putt ? 12.5 : 17;
  const kx = hxp + Math.sin(ca) * cl, ky = hyp + Math.cos(ca) * cl;
  const lineU = (x0, y0, x1, y1, c) => line(g, x0, y0, x1, y1, c, u, GOX, GOY);
  lineU(-5 + tx, -26 + bob, hxp, hyp, skin); lineU(5 + tx, -26 + bob, hxp, hyp, skin);
  lineU(-5 + tx, -27 + bob, -4 + tx, -24 + bob, shirt); lineU(5 + tx, -27 + bob, 4 + tx, -24 + bob, shirt);
  lineU(hxp, hyp, kx, ky, PAL.grey);
  r(Math.round(kx) - 0.5, Math.round(ky) - 0.5, 2, 1, "#505050");
  r(Math.round(hxp) - 0.5, Math.round(hyp) - 0.5, 1, 1, L.glove || PAL.white); r(Math.round(hxp) + 0.5, Math.round(hyp) - 0.5, 1, 1, skin);
  return GC;
}

// The view itself.
function behindView(ctx, st, frame, looks) {
  const h = holeOf(st), cam = cameraOf(st, h), P = st.players[st.cur];
  sky(ctx, st, h, cam, frame);
  floor(ctx, st, h, cam, frame);
  const items = [];
  const vis = (p, rad) => p && p[3] < 700 && p[0] + rad * p[2] > -8 && p[0] - rad * p[2] < W + 8;
  // trees, in play and beyond
  for (const list of [h.trees, h.decor || []]) for (const t of list) {
    const p = project(cam, t.x, t.y);
    if (!p || p[3] < 2.5 || !vis(p, t.r)) continue;
    const k = treeKind(h, t), sp = sprite(k), w = Math.max(2, Math.round(2 * t.r * p[2] * (k === "gorse" ? 1 : 1.15))), hh = Math.max(2, Math.round((w * sp.height) / sp.width * (k === "gorse" ? 0.8 : (t.h || 11) / 11)));
    items.push({ d: p[3], f: () => ctx.drawImage(sp, Math.round(p[0] - w / 2), Math.round(p[1] - hh + 1), w, hh) });
  }
  // the crowd
  for (const c of crowdOf(h)) {
    const p = project(cam, c.x, c.y);
    if (!p || p[3] < 3 || !vis(p, 1)) continue;
    const hh = Math.max(3, Math.round(1.8 * p[2])), w = Math.max(1, Math.round(hh / 2.2));
    items.push({ d: p[3], f: () => { px(ctx, p[0] - (w >> 1), p[1] - hh + 1, w, Math.max(1, Math.round(hh * 0.25)), c.skin); px(ctx, p[0] - (w >> 1), p[1] - hh + 1 + Math.max(1, Math.round(hh * 0.25)), w, Math.max(1, Math.round(hh * 0.45)), c.shirt); px(ctx, p[0] - (w >> 1), p[1] - Math.round(hh * 0.3) + 1, w, Math.max(1, Math.round(hh * 0.3)), "#202020"); } });
  }
  // the tee markers
  if (Math.hypot(P.x, P.y) < 40) for (const tx of [-3.5, 3.5]) {
    const p = project(cam, tx, 0.5);
    if (p && p[3] > 1) { const s = Math.max(2, Math.round(0.35 * p[2])); items.push({ d: p[3], f: () => { px(ctx, p[0] - s / 2, p[1] - s + 1, s, s, PAL.red); px(ctx, p[0] - s / 2, p[1] - s + 1, Math.max(1, s >> 1), Math.max(1, s >> 1), PAL.white); } }); }
  }
  // the flag: a pole, a cloth that streams with the wind across the view, the cup when close
  {
    const p = project(cam, h.pin.x, h.pin.y);
    if (p) {
      const pole = Math.max(9, Math.round(2.6 * p[2])), fw = Math.max(4, Math.round(pole * 0.45)), fh = Math.max(3, Math.round(pole * 0.28));
      const wl = st.wind.x * cam.rx + st.wind.y * cam.ry, dir = st.wind.mph < 1 ? 0 : wl >= 0 ? 1 : -1, wave = (frame >> (st.wind.mph > 8 ? 2 : 3)) % 3;
      items.push({ d: p[3], f: () => {
        if (p[3] < 30) px(ctx, p[0] - Math.max(1, p[2] * 0.12), p[1] - 1, Math.max(2, Math.round(p[2] * 0.25)), Math.max(1, Math.round(p[2] * 0.06)), PAL.black);
        px(ctx, p[0], p[1] - pole + 1, 1, pole, PAL.white);
        if (!dir) { px(ctx, p[0] + 1, p[1] - pole + 1, Math.max(2, fh >> 1), fh + 1, PAL.red); return; }
        for (let i = 0; i < fw; i++) {
          const dy = Math.round(Math.sin((i / fw) * 3.1 + wave * 2.1) * (fh * 0.3) * (i / fw));
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
  // the golfer: stands left of the ball where it was played, drawn at full size at address
  const moving = st.phase === "flight" || st.phase === "roll" || st.phase === "rest";
  const showGolfer = !moving || cam.adv < 40;
  if (showGolfer && st.phase !== "holeEnd") {
    // placed from the ball he is playing, so the clubhead sits on it at address
    const p = project(cam, cam.ox, cam.oy);
    if (p) {
      const k = Math.min(1, p[2] / (cam.F / cam.back)), fx = p[0] - cam.grip[0] * k, fy = p[1] - cam.grip[1] * k;
      const look = looks?.[st.cur];
      items.push({ d: p[3] + 0.05, f: () => { const sp = golferSprite(st, look, frame), w = Math.round(GW * k), hh = Math.round(GH * k); ctx.drawImage(sp, Math.round(fx - GOX * k), Math.round(fy - GOY * k), w, hh); } });
    }
  }
  // the ball: its shadow on the ground, a trail through the air
  const mem = memOf(st), b = st.ball;
  const holedNow = st.phase === "rest" && P.holed && b && Math.hypot(b.x - h.pin.x, b.y - h.pin.y) < 0.2;
  if (b && !holedNow) {
    if (st.phase === "flight") { mem.trail.push([b.x, b.y, b.z || 0]); if (mem.trail.length > 40) mem.trail.shift(); }
    const ps = project(cam, b.x, b.y), pb = project(cam, b.x, b.y, b.z || 0);
    if (pb) items.push({ d: pb[3] - 0.01, f: () => {
      mem.trail.forEach((q, i) => { if (i % 3) return; const pq = project(cam, q[0], q[1], q[2]); if (pq) px(ctx, pq[0], pq[1], 1, 1, i > mem.trail.length - 10 ? PAL.white : PAL.grey); });
      const s = Math.max(2, Math.min(4, Math.round(pb[2] * 0.22)));
      if (ps && (b.z || 0) > 0.3) px(ctx, ps[0] - s / 2, ps[1] - 1, s, Math.max(1, s >> 1), "#004400");
      if (pb[1] < cam.H0 + 4 || (b.z || 0) > 0.3) px(ctx, pb[0] - s / 2 - 1, pb[1] - s, s + 2, s + 2, "#000000");   // in the sky: an outline so it reads
      px(ctx, pb[0] - s / 2, pb[1] - s + 1, s, s, PAL.white);
      if (s > 2) px(ctx, pb[0] - s / 2 + s - 1, pb[1], 1, 1, PAL.grey);
    } });
  }
  // the aim line on the turf (under everything standing), slope arrows on a green
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
  if (!c.putt) {
    const p = project(cam, P.x + dx * L, P.y + dy * L);
    if (p && (frame >> 4) % 2) { const r = Math.max(2, Math.round(3 * p[2])); px(ctx, p[0] - r, p[1], 2 * r + 1, 1, PAL.red); px(ctx, p[0], p[1] - Math.max(1, r >> 1), 1, 2 * Math.max(1, r >> 1) + 1, PAL.red); }
  }
}
function slopeArrows(ctx, h, cam) {
  const g = h.green, step = 1.6;
  for (let y = g.y - g.r; y <= g.y + g.r; y += step) for (let x = g.x - g.r; x <= g.x + g.r; x += step) {
    if (Math.hypot(x - g.x, y - g.y) > g.r - 0.4) continue;
    const [sx, sy] = slopeAt(h, x, y), m = Math.hypot(sx, sy);
    const p = project(cam, x, y);
    if (!p || p[3] > 40 || p[1] >= PANEL_Y - 2 || m < 0.04) continue;
    const q = project(cam, x + (sx / m) * 0.9, y + (sy / m) * 0.9);
    if (!q) continue;
    const col = m > 0.35 ? "#005800" : "#388800";
    line(ctx, p[0], p[1], q[0], q[1], col);
    px(ctx, q[0] - 1, q[1] - 1, 3, 2, col);
  }
}

// ---- the HUD -------------------------------------------------------------------------------------------
const MX = 6, MY = 184, MW = 100;
const mPos = (m) => MX + Math.round(((m - ACC_END) / (1 - ACC_END)) * MW);
function meter(ctx, st) {
  px(ctx, MX - 1, MY - 1, MW + 3, 10, PAL.white);
  px(ctx, MX, MY, MW + 1, 8, PAL.black);
  px(ctx, mPos(-ACC_ZONE), MY, mPos(ACC_ZONE) - mPos(-ACC_ZONE), 8, "#000088");
  for (const q of [0.25, 0.5, 0.75, 1]) px(ctx, mPos(q), MY + 6, 1, 2, PAL.dgrey);
  const m = st.meter;
  if (m) {
    const top = m.stage === 1 ? m.m : m.power;
    px(ctx, mPos(0), MY + 1, Math.max(0, mPos(top) - mPos(0)), 6, PAL.gold);
    if (m.stage === 2) px(ctx, mPos(m.power), MY - 3, 1, 3, PAL.white);
    px(ctx, mPos(m.m), MY - 2, 2, 12, PAL.white);
  }
  px(ctx, mPos(0), MY - 2, 1, 12, PAL.red);
}
function windIcon(ctx, x, y, w, rot = 0) {
  px(ctx, x, y, 13, 13, PAL.black);
  px(ctx, x + 6, y + 6, 1, 1, PAL.dgrey);
  if (!w.mph) return;
  const a = w.dir * Math.PI / 4 - rot, ux = Math.sin(a), uy = -Math.cos(a);
  line(ctx, x + 6 - ux * 5, y + 6 - uy * 5, x + 6 + ux * 5, y + 6 + uy * 5, PAL.white);
  line(ctx, x + 6 + ux * 5, y + 6 + uy * 5, x + 6 + ux * 2 - uy * 3, y + 6 + uy * 2 + ux * 3, PAL.white);
  line(ctx, x + 6 + ux * 5, y + 6 + uy * 5, x + 6 + ux * 2 + uy * 3, y + 6 + uy * 2 - ux * 3, PAL.white);
}
function portrait(ctx, look, x, y) {
  box(ctx, x, y, 32, 28);
  px(ctx, x + 1, y + 1, 30, 26, "#000088");
  const hd = look?.head;
  if (hd) ctx.drawImage(hd, x + 16 - hd.width, y + 26 - hd.height * 2, hd.width * 2, hd.height * 2);
  else { px(ctx, x + 10, y + 6, 12, 14, look?.skin || PAL.skin); px(ctx, x + 10, y + 4, 12, 4, look?.hair || "#503000"); }
}
function hud(ctx, st, frame, looks) {
  const h = holeOf(st), P = st.players[st.cur], c = CLUBS[st.club];
  // top left: the golfer's face, who, where
  portrait(ctx, looks?.[st.cur], 4, 4);
  px(ctx, 38, 4, 126, h.name ? 44 : 34, PAL.black);
  drawText(ctx, P.name.slice(0, 20), 41, 7, P.kind === "cpu" ? PAL.gold : PAL.white);
  drawText(ctx, `HOLE ${h.n} PAR ${h.par} ${h.yards}Y`, 41, 17, PAL.grey);
  const c0 = cardOf(st), tp = c0.toPar[st.cur];
  drawText(ctx, `SHOT ${Math.min(10, P.strokes + (st.phase === "rest" || st.phase === "holeEnd" ? 0 : 1))}`, 41, 27, PAL.white);
  const tpt = c0.played ? toParText(tp) : "E";
  drawText(ctx, tpt, 161 - textWidth(tpt), 27, tp < 0 ? PAL.lime : tp > 0 ? PAL.red : PAL.white);
  if (h.name) drawText(ctx, h.name.slice(0, 20), 41, 38, PAL.gold);
  // the strip along the bottom
  px(ctx, 0, PANEL_Y, W, H - PANEL_Y, PAL.black);
  px(ctx, 0, PANEL_Y, W, 1, PAL.white);
  const carry = c.putt ? "" : yds(c.carry * (LIE[P.lie] ?? 1));
  drawText(ctx, `${c.id} ${carry}`, 4, 172, PAL.white);
  const pin = Math.hypot(h.pin.x - P.x, h.pin.y - P.y), pinTxt = `PIN ${pin < 30 ? `${Math.round(pin * 3)}FT` : yds(pin)}`;
  drawText(ctx, pinTxt, 70, 172, PAL.white);
  const lie = `LIE ${P.lie.toUpperCase()}`;
  drawText(ctx, lie, W - 4 - textWidth(lie), 172, P.lie === "bunker" || P.lie === "trees" ? PAL.gold : PAL.grey);
  meter(ctx, st);
  // the wind as the golfer feels it: turned to the view
  const aim = st.fl?.aim ?? st.aim;
  windIcon(ctx, 116, 181, st.wind, aim);
  drawText(ctx, st.wind.mph ? `WIND ${st.wind.mph}` : "CALM", 133, 184, PAL.white);
  if (c.putt && st.phase !== "flight") drawText(ctx, `MAX ${Math.round(PUTT_MAX * 3)}FT`, W - 4 - textWidth(`MAX ${Math.round(PUTT_MAX * 3)}FT`), 184, PAL.dgrey);
  const hint = st.phase === "aim" ? (P.kind === "cpu" ? "THE FIGURE AIMS." : "AIM LEFT/RIGHT. A TO SWING. X CHANGES CLUB.") : st.phase === "meter" ? (P.kind === "cpu" ? "" : st.meter.stage === 1 ? "A: SET THE POWER." : "A: ON THE RED LINE.") : "";
  const msg = st.msg || hint;
  const tone = st.msg ? TONE[st.tone] || PAL.white : PAL.grey;
  wrap(msg, 41).slice(0, 2).forEach((l, i) => drawText(ctx, l, 4, 200 + i * 10, tone));
  void frame;
}
// the corner window: the hole from above (the green close up when putting or near it)
const PIP = { x: 172, y: 4, w: 80, h: 100 };
export function pipView(st) {
  const h = holeOf(st), P = st.players[st.cur], iw = PIP.w - 2, ih = PIP.h - 2;
  const near = P.lie === "green" || CLUBS[st.club]?.putt || st.fl?.putt;
  return near && st.phase !== "intro" && st.phase !== "holeEnd" ? greenView(h, P, iw, ih) : holeView(h, iw, ih);
}
function pip(ctx, st, frame) {
  const v = pipView(st);
  px(ctx, PIP.x - 1, PIP.y - 1, PIP.w + 2, PIP.h + 2, PAL.black);
  px(ctx, PIP.x, PIP.y, PIP.w, PIP.h, PAL.white);
  mapIn(ctx, st, v, PIP.x + 1, PIP.y + 1, frame, true);
  windIcon(ctx, PIP.x + PIP.w - 15, PIP.y + PIP.h - 15, st.wind);
}

// ---- overlays -------------------------------------------------------------------------------------------
function intro(ctx, st, frame, looks) {
  const h = holeOf(st);
  px(ctx, 0, 0, W, H, PAL.black);
  const v = holeView(h, 104, 216);
  box(ctx, 3, 3, 108, 218);
  mapIn(ctx, st, v, 5, 4 + 1, frame, false);
  const x = 118, w = 22;
  let y = 8;
  const put = (s, c, gap = 10) => { drawText(ctx, s, x, y, c); y += gap; };
  put(`HOLE ${h.n} // PAR ${h.par}`, PAL.gold, 12);
  for (const l of wrap(h.name || "THE DEPARTMENT LINKS", w)) put(l, PAL.white);
  for (const l of wrap(h.after ? `AFTER: ${h.after}` : "AFTER: APPLICATION 001", w)) put(l, PAL.dgrey);
  y += 2;
  put(`${h.yards} YARDS`, PAL.white);
  put(st.wind.mph ? `WIND ${st.wind.mph} MPH` : "NO WIND", PAL.grey, 13);
  for (const l of wrap(h.note || "THE ASSEMBLY DECLINED THIS HOLE. THE DEPARTMENT KEPT THE DRAWINGS.", w).slice(0, 7)) put(l, PAL.lime);
  // who plays: each golfer as they look today
  const cards = st.players.map((Q, i) => looks?.[i]?.card).filter(Boolean);
  const cy = 150;
  cards.forEach((c, i) => ctx.drawImage(c, x + i * 40, cy, 32, 48));
  drawText(ctx, `${st.players[st.honor[0]].name.split(" ").pop()} ON THE TEE`.slice(0, 22), x, 202, PAL.white);
  if ((frame >> 5) % 2) drawText(ctx, "A TO PLAY", x, 213, PAL.dgrey);
  if (h.osm) drawText(ctx, "MAP DATA (C) OPENSTREETMAP CONTRIBUTORS", 4, H - 9, PAL.dgrey);
}
export function scorecard(ctx, st, title) {
  const c = cardOf(st), k = Math.min(st.hi, st.holes.length - 1), nine = Math.floor(k / 9) * 9;
  const rows = c.rows.slice(nine, nine + 9);
  box(ctx, 4, 28, W - 8, 30 + 12 * (2 + st.players.length) + 30);
  drawText(ctx, title, Math.round(W / 2 - textWidth(title) / 2), 34, PAL.gold);
  const x0 = 10, colW = 18, lx = 58, y0 = 50;
  drawText(ctx, "HOLE", x0, y0, PAL.grey);
  drawText(ctx, "PAR", x0, y0 + 12, PAL.grey);
  rows.forEach((r, i) => {
    const s = String(r.n), x = lx + i * colW + Math.round((colW - textWidth(s)) / 2);
    drawText(ctx, s, x, y0, PAL.grey);
    drawText(ctx, String(r.par), lx + i * colW + 6, y0 + 12, PAL.white);
  });
  const tw = lx + 9 * colW + 2;
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
  drawText(ctx, `THRU ${c.played}: ${totals}`.slice(0, 40), x0, yb, PAL.white);
  if (st.players.length > 1 && c.played) {
    const d = c.won[0] - c.won[1];
    const s = d === 0 ? "MATCH ALL SQUARE" : `${st.players[d > 0 ? 0 : 1].name.split(" ").pop()} ${Math.abs(d)} UP`;
    drawText(ctx, s, x0, yb + 12, PAL.gold);
  }
}

// looks: per player {head, skin, hair, shirt, pants, cap, glove, card} (looks.js), or nothing yet
export function draw(ctx, st, frame, paused, looks) {
  ctx.imageSmoothingEnabled = false;
  px(ctx, 0, 0, W, H, PAL.black);
  if (st.phase === "done") {
    scorecard(ctx, st, "FINAL CARD // EXHIBITION");
    wrap(st.result?.line || "", 40).slice(0, 3).forEach((l, i) => drawText(ctx, l, 10, 160 + i * 10, PAL.gold));
    drawText(ctx, "THE DEPARTMENT COUNTS IT ANYWAY.", 10, 196, PAL.grey);
    return;
  }
  if (st.phase === "intro") { intro(ctx, st, frame, looks); }
  else {
    behindView(ctx, st, frame, looks);
    hud(ctx, st, frame, looks);
    pip(ctx, st, frame);
  }
  if (st.phase === "holeEnd") scorecard(ctx, st, `AFTER HOLE ${holeOf(st).n}`);
  if (paused) {
    box(ctx, 40, 90, W - 80, 40);
    drawText(ctx, "PAUSED", Math.round(W / 2 - textWidth("PAUSED") / 2), 98, PAL.gold);
    drawText(ctx, "THE DEPARTMENT WAITS.", Math.round(W / 2 - textWidth("THE DEPARTMENT WAITS.") / 2), 112, PAL.grey);
  }
}
