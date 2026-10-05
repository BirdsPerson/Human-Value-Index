// THE DEPARTMENT LINKS on a 256x224 canvas, NES-style: the golfer and the meter on the left, the
// hole from above on the right, the green close up for putting. Reads the sim's state; changes
// nothing in it. Colours are a handful of NES palette entries; every shape is whole pixels.
import { COURSE, surfaceAt, slopeAt } from "./course.js";
import { CLUBS, LIE, ACC_ZONE, ACC_END, PUTT_MAX, holeOf, dirOf, cardOf, toParText } from "./sim.js";
import { drawText, textWidth, wrap } from "./font.js";

export const W = 256, H = 224;
const MAP_X = 112, MAP_W = 144;
export const PAL = {
  black: "#000000", white: "#fcfcfc", grey: "#bcbcbc", dgrey: "#7c7c7c", red: "#d82800", gold: "#f8b800", lime: "#b8f818",
  ob: "#004000", ob2: "#005800", rough: "#00a800", rough2: "#009000", fairway: "#58d854", fringe: "#80d010", green: "#b8f818",
  bunker: "#fce0a8", bunker2: "#e4c890", water: "#0058f8", water2: "#3cbcfc", tree: "#005800", tree2: "#00a800", tee: "#58d854",
  sky: "#000088", skin: "#fca044", panel: "#000000", line: "#3cbcfc",
};
const SURF = { ob: [PAL.ob, PAL.ob2], rough: [PAL.rough, PAL.rough2], fairway: [PAL.fairway, PAL.fairway], fringe: [PAL.fringe, PAL.fringe], green: [PAL.green, PAL.green], bunker: [PAL.bunker, PAL.bunker2], water: [PAL.water, PAL.water2], tee: [PAL.tee, PAL.fairway], trees: [PAL.tree, PAL.tree2] };
const TONE = { harm: PAL.red, warn: PAL.gold, good: PAL.lime, "": PAL.white };
const yds = (v) => `${Math.round(v)}Y`;

// ---- the views: world (yards) <-> panel pixels -----------------------------------------------------
export function holeView(h) {
  const xs = h.pts.map(p => p[0]);
  const s = Math.max(1.1, (h.top - h.bottom) / 216);
  return { s, cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (h.top + h.bottom) / 2, kind: "hole" };
}
export function greenView(h, ball) {
  const d = Math.hypot(ball.x - h.pin.x, ball.y - h.pin.y);
  const s = Math.max((2 * (h.green.r + 7)) / MAP_W, (d + 8) / 190);
  const far = d > h.green.r + 4;
  return { s, cx: far ? (ball.x + h.pin.x) / 2 : h.green.x, cy: far ? (ball.y + h.pin.y) / 2 : h.green.y, kind: "green" };
}
const toPx = (v, x, y) => [Math.round(MAP_X + MAP_W / 2 + (x - v.cx) / v.s), Math.round(H / 2 - (y - v.cy) / v.s)];

const CACHE = new Map();
function terrain(h, v) {
  const key = `${h.n}|${v.kind}|${v.s.toFixed(3)}|${v.cx.toFixed(2)}|${v.cy.toFixed(2)}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const c = document.createElement("canvas");
  c.width = MAP_W; c.height = H;
  const g = c.getContext("2d"), img = g.createImageData(MAP_W, H), d = img.data;
  const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const RGB = Object.fromEntries(Object.entries(SURF).map(([k, [a, b]]) => [k, [rgb(a), rgb(b)]]));
  for (let py = 0; py < H; py++) for (let px = 0; px < MAP_W; px++) {
    const x = v.cx + (px + 0.5 - MAP_W / 2) * v.s, y = v.cy - (py + 0.5 - H / 2) * v.s;
    const s = surfaceAt(h, x, y);
    let alt = false;
    if (s === "rough") alt = (px + py * 3) % 7 === 0;
    else if (s === "ob") alt = (px + py) % 2 === 0;
    else if (s === "water") alt = (px * 3 + py * 5) % 23 === 0;
    else if (s === "bunker") alt = (px + py * 2) % 9 === 0;
    else if (s === "trees") { const t = h.trees.find(t => Math.hypot(x - t.x, y - t.y) <= t.r); alt = t && (x - t.x) - (y - t.y) < -t.r * 0.2 && (px + py) % 2 === 0; }
    else if (s === "fairway" || s === "green") alt = v.kind === "green" ? false : ((Math.floor(py / 4) + Math.floor(px / 8)) % 2 === 0);
    const col = RGB[s][alt ? 1 : 0], i = (py * MAP_W + px) * 4;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  // mown stripes on the fairway: a shade darker every other band
  if (v.kind === "hole") for (let py = 0; py < H; py++) for (let px = 0; px < MAP_W; px++) {
    const i = (py * MAP_W + px) * 4;
    if (d[i] === 0x58 && d[i + 1] === 0xd8 && Math.floor(py / 3) % 2) { d[i] = 0x48; d[i + 1] = 0xc8; d[i + 2] = 0x44; }
  }
  g.putImageData(img, 0, 0);
  if (v.kind === "green") {
    // the fall of the green: an arrow every 12 px, pointing downhill; a darker, longer arrow is steeper
    g.fillStyle = "#58a800";
    for (let py = 6; py < H; py += 12) for (let px = 6; px < MAP_W; px += 12) {
      const x = v.cx + (px - MAP_W / 2) * v.s, y = v.cy - (py - H / 2) * v.s;
      const sf = surfaceAt(h, x, y);
      if (sf !== "green" && sf !== "fringe") continue;
      const [sx, sy] = slopeAt(h, x, y), m = Math.hypot(sx, sy);
      if (m < 0.04) { g.fillRect(px, py, 1, 1); continue; }
      const ux = sx / m, uy = -sy / m, L = m > 0.35 ? 4 : 3;
      g.fillStyle = m > 0.35 ? "#007800" : "#58a800";
      for (let k = -L; k <= L; k++) g.fillRect(Math.round(px + ux * k), Math.round(py + uy * k), 1, 1);
      const hx = px + ux * L, hy = py + uy * L;
      g.fillRect(Math.round(hx - ux * 2 + uy * 1.5), Math.round(hy - uy * 2 - ux * 1.5), 1, 1);
      g.fillRect(Math.round(hx - ux * 2 - uy * 1.5), Math.round(hy - uy * 2 + ux * 1.5), 1, 1);
    }
  }
  if (CACHE.size > 12) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key, c);
  return c;
}

function px(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
function line(ctx, x0, y0, x1, y1, c, u = 1, ox = 0, oy = 0) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  ctx.fillStyle = c;
  for (let k = 0; k < 400; k++) {
    ctx.fillRect(ox + x0 * u, oy + y0 * u, u, u);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}
const flag = (ctx, x, y) => { px(ctx, x, y - 8, 1, 9, PAL.white); px(ctx, x + 1, y - 8, 4, 3, PAL.red); px(ctx, x - 1, y, 3, 1, PAL.black); };

// ---- the golfer (left panel), in 2-px units: the swing follows the meter ------------------------------
function swingPose(st) {
  const putt = CLUBS[st.club]?.putt, top = putt ? -0.7 : -3.0, addr = 0.3;
  const m = st.meter;
  if (st.phase === "meter" && m) { const k = Math.max(0, m.m); return { phi: addr + (top - addr) * k, hinge: putt ? 0 : -1.3 * k }; }
  if ((st.phase === "flight" || st.phase === "roll") && st.t < 24 && !st.fl?.putt) { const k = Math.min(1, st.t / 12); return { phi: addr + 3.1 * k, hinge: 0.9 * k }; }
  if ((st.phase === "flight" || st.phase === "roll" || st.phase === "rest") && !st.fl?.putt) return { phi: 3.4, hinge: 0.9 };
  if (st.phase === "roll" && st.fl?.putt) return { phi: addr + 0.5, hinge: 0 };
  return { phi: addr, hinge: 0 };
}
function golfer(ctx, st, P) {
  const u = 2, ox = 22, oy = 112, putt = CLUBS[st.club]?.putt;
  const shirt = P.color?.shirt || PAL.line, pants = P.color?.pants || PAL.dgrey;
  const r = (x, y, w, h, c) => px(ctx, ox + x * u, oy + y * u, w * u, h * u, c);
  r(-8, 0, 28, 1, PAL.fairway);                         // the turf
  r(-3, -1, 3, 1, PAL.black); r(1, -1, 3, 1, PAL.black);  // shoes
  r(-2, -10, 2, 9, pants); r(1, -10, 2, 9, pants);
  r(-3, -18, 6, 8, shirt);
  r(-2, -23, 4, 5, PAL.skin);
  r(-3, -24, 6, 2, PAL.white); r(3, -23, 2, 1, PAL.white);   // cap and brim
  r(1, -22, 1, 1, PAL.black);                                  // eye
  const { phi, hinge } = swingPose(st);
  const sx = 0, sy = -16, hx = sx + Math.sin(phi) * 7, hy = sy + Math.cos(phi) * 7;
  const ca = phi + (putt ? 0 : 0.25) + hinge, cl = putt ? 8 : 11;
  const kx = hx + Math.sin(ca) * cl, ky = hy + Math.cos(ca) * cl;
  line(ctx, sx, sy, hx, hy, shirt, u, ox, oy);
  line(ctx, hx, hy, kx, ky, PAL.grey, u, ox, oy);
  r(Math.round(kx), Math.round(ky), 2, 1, PAL.dgrey);
  r(Math.round(hx), Math.round(hy), 1, 1, PAL.skin);
  if (st.phase === "aim" || st.phase === "meter" || st.phase === "intro") r(putt ? 7 : 8, -1, 1, 1, PAL.white);
}

// ---- the meter -------------------------------------------------------------------------------------
const MX = 6, MY = 172, MW = 100;
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

function windIcon(ctx, x, y, w) {
  px(ctx, x, y, 13, 13, PAL.black);
  px(ctx, x + 6, y + 6, 1, 1, PAL.dgrey);
  if (!w.mph) return;
  const a = w.dir * Math.PI / 4, ux = Math.sin(a), uy = -Math.cos(a);
  line(ctx, x + 6 - ux * 5, y + 6 - uy * 5, x + 6 + ux * 5, y + 6 + uy * 5, PAL.white);
  line(ctx, x + 6 + ux * 5, y + 6 + uy * 5, x + 6 + ux * 2 - uy * 3, y + 6 + uy * 2 + ux * 3, PAL.white);
  line(ctx, x + 6 + ux * 5, y + 6 + uy * 5, x + 6 + ux * 2 + uy * 3, y + 6 + uy * 2 - ux * 3, PAL.white);
}

function panel(ctx, st, frame) {
  const h = holeOf(st), P = st.players[st.cur], c = CLUBS[st.club];
  px(ctx, 0, 0, MAP_X, H, PAL.panel);
  drawText(ctx, `HOLE ${h.n}`, 4, 4, PAL.gold);
  drawText(ctx, `PAR ${h.par}`, MAP_X - 4 - textWidth(`PAR ${h.par}`), 4, PAL.gold);
  drawText(ctx, `${h.yards} YDS`, 4, 14, PAL.grey);
  drawText(ctx, P.name.slice(0, 17), 4, 26, P.kind === "cpu" ? PAL.gold : PAL.white);
  const c0 = cardOf(st), tp = c0.toPar[st.cur];
  drawText(ctx, `SHOT ${Math.min(10, P.strokes + (st.phase === "rest" || st.phase === "holeEnd" ? 0 : 1))}`, 4, 36, PAL.white);
  drawText(ctx, c0.played ? toParText(tp) : "E", MAP_X - 4 - textWidth(c0.played ? toParText(tp) : "E"), 36, tp < 0 ? PAL.lime : tp > 0 ? PAL.red : PAL.white);
  golfer(ctx, st, P);
  const pin = Math.hypot(h.pin.x - P.x, h.pin.y - P.y);
  drawText(ctx, `CLUB ${c.id}`, 4, 120, PAL.white);
  if (!c.putt) drawText(ctx, yds(c.carry * (LIE[P.lie] ?? 1)), MAP_X - 4 - textWidth(yds(c.carry * (LIE[P.lie] ?? 1))), 120, PAL.grey);
  const pinTxt = pin < 30 ? `${Math.round(pin * 3)} FT` : yds(pin);
  drawText(ctx, "PIN", 4, 130, PAL.white); drawText(ctx, pinTxt, MAP_X - 4 - textWidth(pinTxt), 130, PAL.grey);
  drawText(ctx, "LIE", 4, 140, PAL.white); drawText(ctx, P.lie.toUpperCase(), MAP_X - 4 - textWidth(P.lie.toUpperCase()), 140, PAL.grey);
  windIcon(ctx, 4, 151, st.wind);
  drawText(ctx, st.wind.mph ? `WIND ${st.wind.mph} MPH` : "NO WIND", 22, 154, PAL.white);
  meter(ctx, st);
  const hint = st.phase === "aim" ? (P.kind === "cpu" ? "THE FIGURE AIMS." : "AIM. A TO SWING.") : st.phase === "meter" ? (P.kind === "cpu" ? "" : st.meter.stage === 1 ? "A: POWER" : "A: ON THE LINE") : "";
  const msg = st.msg || hint;
  const tone = st.msg ? TONE[st.tone] || PAL.white : PAL.grey;
  wrap(msg, 17).slice(0, 3).forEach((l, i) => drawText(ctx, l, 4, 190 + i * 10, tone));
  if (c.putt && st.phase !== "flight") drawText(ctx, `MAX ${Math.round(PUTT_MAX * 3)}FT`, MAP_X - 4 - textWidth(`MAX ${Math.round(PUTT_MAX * 3)}FT`), 162, PAL.dgrey);
  void frame;
}

// ---- the hole / the green (right panel) ----------------------------------------------------------------
export function viewFor(st) {
  const h = holeOf(st), P = st.players[st.cur];
  const near = P.lie === "green" || CLUBS[st.club]?.putt || Math.hypot(h.pin.x - P.x, h.pin.y - P.y) < 70;
  const onGreen = near && st.phase !== "intro" && st.phase !== "holeEnd";
  return onGreen ? greenView(h, P) : holeView(h);
}
function map(ctx, st, frame) {
  const h = holeOf(st), v = st.view || viewFor(st);
  ctx.drawImage(terrain(h, v), MAP_X, 0);
  // the tee box
  if (v.kind === "hole") { const [tx, ty] = toPx(v, h.tee.x, h.tee.y); px(ctx, tx - 3, ty - 2, 7, 4, PAL.fairway); px(ctx, tx - 3, ty - 2, 1, 1, PAL.white); px(ctx, tx + 3, ty - 2, 1, 1, PAL.white); }
  const [fx, fy] = toPx(v, h.pin.x, h.pin.y);
  if (v.kind === "green") px(ctx, fx - 1, fy - 1, 3, 3, PAL.black);
  flag(ctx, fx, fy);
  // the aim line and where a full swing would land
  const P = st.players[st.cur], c = CLUBS[st.club];
  if (st.phase === "aim" || st.phase === "meter") {
    const [dx, dy] = dirOf(st.aim);
    const L = c.putt ? Math.min(PUTT_MAX, Math.hypot(h.pin.x - P.x, h.pin.y - P.y) + 2) : c.carry * (LIE[P.lie] ?? 1);
    const [bx, by] = toPx(v, P.x, P.y), [ex, ey] = toPx(v, P.x + dx * L, P.y + dy * L);
    const n = Math.max(1, Math.round(Math.hypot(ex - bx, ey - by) / 3));
    for (let k = 1; k <= n; k++) if ((k + (frame >> 3)) % 2) px(ctx, bx + (ex - bx) * k / n, by + (ey - by) * k / n, 1, 1, PAL.white);
    if (!c.putt && (frame >> 4) % 2) { px(ctx, ex - 2, ey, 5, 1, PAL.red); px(ctx, ex, ey - 2, 1, 5, PAL.red); }
  }
  // every ball on the hole: the others as a coloured dot, the one in play white with its shadow
  st.players.forEach((Q, i) => {
    if (Q.holed || (i === st.cur && st.ball)) return;
    const [qx, qy] = toPx(v, Q.x, Q.y);
    px(ctx, qx - 1, qy - 1, 3, 3, Q.color?.shirt || PAL.gold); px(ctx, qx, qy, 1, 1, PAL.white);
  });
  const b = st.ball;
  if (b && !(st.phase === "rest" && P.holed && Math.hypot(b.x - h.pin.x, b.y - h.pin.y) < 0.2)) {
    const [bx, by] = toPx(v, b.x, b.y), lift = Math.min(40, Math.round((b.z || 0) / v.s * 0.8));
    if (lift > 0) px(ctx, bx - 1, by, 3, 1, PAL.black);
    const big = lift > 6 ? 3 : 2;
    px(ctx, bx - (big >> 1), by - lift - (big >> 1), big, big, PAL.white);
  }
  if (v.kind === "green") drawText(ctx, "THE GREEN", MAP_X + 4, 4, PAL.black);
}

// ---- overlays -------------------------------------------------------------------------------------------
function box(ctx, x, y, w, h) { px(ctx, x, y, w, h, PAL.white); px(ctx, x + 1, y + 1, w - 2, h - 2, PAL.black); }
function intro(ctx, st) {
  const h = holeOf(st);
  box(ctx, MAP_X + 12, 70, MAP_W - 24, 76);
  const cx = MAP_X + MAP_W / 2, ctr = (s, y, c) => drawText(ctx, s, Math.round(cx - textWidth(s) / 2), y, c);
  ctr(`HOLE ${h.n}`, 78, PAL.gold);
  ctr(`PAR ${h.par}  ${h.yards} YDS`, 90, PAL.white);
  ctr(st.wind.mph ? `WIND ${st.wind.mph} MPH` : "NO WIND", 102, PAL.grey);
  ctr(`${st.players[st.honor[0]].name.split(" ").pop()} ON THE TEE`.slice(0, 19), 116, PAL.white);
  ctr("A TO PLAY", 132, PAL.dgrey);
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

export function draw(ctx, st, frame, paused) {
  ctx.imageSmoothingEnabled = false;
  px(ctx, 0, 0, W, H, PAL.black);
  if (st.phase === "done") {
    scorecard(ctx, st, "FINAL CARD // EXHIBITION");
    wrap(st.result?.line || "", 40).slice(0, 3).forEach((l, i) => drawText(ctx, l, 10, 160 + i * 10, PAL.gold));
    drawText(ctx, "THE DEPARTMENT COUNTS IT ANYWAY.", 10, 196, PAL.grey);
    return;
  }
  map(ctx, st, frame);
  panel(ctx, st, frame);
  px(ctx, MAP_X, 0, 1, H, PAL.white);
  if (st.phase === "intro") intro(ctx, st);
  if (st.phase === "holeEnd") scorecard(ctx, st, `AFTER HOLE ${holeOf(st).n}`);
  if (paused) {
    box(ctx, 40, 90, W - 80, 40);
    drawText(ctx, "PAUSED", Math.round(W / 2 - textWidth("PAUSED") / 2), 98, PAL.gold);
    drawText(ctx, "THE DEPARTMENT WAITS.", Math.round(W / 2 - textWidth("THE DEPARTMENT WAITS.") / 2), 112, PAL.grey);
  }
}
export { COURSE };
