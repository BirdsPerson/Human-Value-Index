// THE BOWL, playable: the play art on the call sheet. Pure (no DOM): draws onto any 2D context that
// has fillStyle and fillRect, so scripts/check-football.mjs runs every play through a stub. One
// small picture per play, the chalkboard way: the offence as O's (the centre a square, the man who
// gets the ball filled), routes as lines in the receivers' button colours with an arrow where they
// end (a square where they settle: a curl, a hitch), blocks as a short line with a bar, the run as a
// thick amber path through the hole, a dashed line for a play-action fake. The defence as X's over
// a standard offence: red arrows for the rush, bubbles for zones (deep in blue, underneath in
// yellow), a dotted line from a man defender to the man he takes.
// The picture is laid out the way the field is seen from behind the play: +y (the left wideout's
// side) is screen left, the defence at the top. Lateral yards squeeze a little so both wideouts fit.
import { FORMS, ROUTES, PLAYS, DEFS, OS, DS, ICONS } from "./sim.js";

export const ART_W = 72, ART_H = 44;
const COL = { o: "#c8f5d8", dim: "#4b7c5e", los: "#3a6fd8", run: "#ffe14a", x: "#f2efe6", rush: "#ff6a5a", deep: "rgba(58, 111, 216, 0.38)", under: "rgba(255, 225, 74, 0.3)", man: "#86c9a0", ball: "#8a4a22", ghost: "#2d5040" };
const ICON_COL = { A: "#3c8a46", B: "#e05050", X: "#4f86ff", Y: "#e0c040", RB: "#9aa0a8" };
const SLOT_COL = Object.fromEntries(ICONS.map(([lab, slot]) => [slot, ICON_COL[lab]]));
const BLOCK = "block";

const px = (ctx, x, y, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); };
function ln(ctx, x0, y0, x1, y1, c, dash = 0) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, n = 0;
  for (let k = 0; k < 400; k++) {
    if (!dash || (n++ % (dash * 2)) < dash) px(ctx, x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function thick(ctx, x0, y0, x1, y1, c) { ln(ctx, x0, y0, x1, y1, c); ln(ctx, x0 + 1, y0, x1 + 1, y1, c); }
// an arrowhead at (x, y) pointing along (dx, dy)
function arrow(ctx, x, y, dx, dy, c, big = false) {
  const m = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / m, uy = dy / m, L = big ? 3 : 2;
  const lx = -uy, ly = ux;
  for (let i = 0; i <= L; i++) { px(ctx, x - ux * i + lx * i, y - uy * i + ly * i, c); px(ctx, x - ux * i - lx * i, y - uy * i - ly * i, c); }
}
function O(ctx, x, y, c, filled = false) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = c; ctx.fillRect(x - 1, y - 1, 3, 3);
  if (!filled) px(ctx, x, y, COL.ghost);
}
function SQ(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3); px(ctx, x, y, c); }
function X(ctx, x, y, c) { x = Math.round(x); y = Math.round(y); for (const [a, b] of [[-1, -1], [1, 1], [-1, 1], [1, -1], [0, 0]]) px(ctx, x + a, y + b, c); }
function bubble(ctx, x, y, rx, ry, c) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = c;
  for (let j = -ry; j <= ry; j++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (j / (ry + 0.5)) ** 2))); if (w > 0) ctx.fillRect(x - w, y + j, 2 * w + 1, 1); }
}
// the chalkboard: lateral yards -> x (left wideout's side to the left), downfield yards -> y
function board(w, h) {
  const cx = w / 2, y0 = h - 11, sx = w / 46, sy = (h - 14) / 20;
  return { cx, y0, sx, sy, X: (lat) => cx - lat * sx, Y: (depth) => y0 - depth * sy, w, h };
}
function clear(ctx, w, h) { ctx.fillStyle = "#0a0f0a"; ctx.fillRect(0, 0, w, h); }
function losLine(ctx, B) { ln(ctx, 0, B.y0, B.w - 1, B.y0, COL.los); }

// The offence's play. flip mirrors it (as the FLIP call does).
export function drawOffArt(ctx, id, flip = false, w = ART_W, h = ART_H) {
  const pl = PLAYS[id];
  clear(ctx, w, h);
  if (!pl) return;
  const B = board(w, h), fs = flip ? -1 : 1;
  losLine(ctx, B);
  if (pl.kind === "punt" || pl.kind === "fg") return kickArt(ctx, pl, B);
  const F = FORMS[pl.form]?.at || FORMS.single.at;
  const at = (s) => [B.X(F[s][0] * fs), B.Y(-F[s][1])];
  const side = (pl.side || -1) * fs;
  // the line's blocks (angled toward the run's side on a run)
  for (let s = OS.LT; s <= OS.RT; s++) {
    const [x, y] = at(s);
    const lean = pl.kind === "run" || pl.kind === "sneak" ? -side * 0.9 : 0;
    blockMark(ctx, x, y, lean, B, pl.kind === "kneel" ? COL.ghost : COL.dim);
  }
  // receivers and backs: routes, blocks, the carry
  for (let s = OS.RB; s <= OS.WR3; s++) {
    const [x, y] = at(s), lat = F[s][0] * fs, out = lat >= 0 ? 1 : -1;
    const rt = pl.kind === "pass" ? pl.routes[s] : null;
    if (pl.kind === "pass" && rt && rt !== BLOCK) {
      const r = ROUTES[rt], c = SLOT_COL[s] || COL.o;
      let px0 = x, py0 = y, lx = x, ly = y;
      const pts = r.pts.map(([u, v]) => [B.X(lat + out * v), B.Y(u)]);
      if (!r.settle) { const a = r.pts[r.pts.length - 2] || [0, 0], b = r.pts[r.pts.length - 1]; pts.push([B.X(lat + out * (b[1] + (b[1] - a[1]) * 0.6)), B.Y(b[0] + (b[0] - a[0]) * 0.6 + (r.deep ? 6 : 1.5))]); }
      for (const [qx, qy] of pts) { const ex = Math.max(1, Math.min(B.w - 2, qx)), ey = Math.max(1, qy); ln(ctx, px0, py0, ex, ey, c); lx = px0; ly = py0; px0 = ex; py0 = ey; }
      if (r.settle) { ctx.fillStyle = c; ctx.fillRect(Math.round(px0) - 1, Math.round(py0) - 1, 3, 3); }
      else arrow(ctx, px0, py0, px0 - lx, py0 - ly, c);
    } else if (pl.kind === "pass" || (pl.kind === "run" && s !== OS.RB && !(pl.lead && s === OS.WR3)) || pl.kind === "sneak") {
      blockMark(ctx, x, y, s === OS.RB || s === OS.TE ? 0 : 0, B, COL.dim, s === OS.RB);
    }
  }
  // the men
  for (let s = 0; s < 11; s++) {
    const [x, y] = at(s);
    if (s === OS.C) SQ(ctx, x, y, COL.o);
    else if (s === OS.QB) O(ctx, x, y, COL.o, pl.kind === "sneak" || pl.kind === "kneel");
    else if (s === OS.RB && pl.kind === "run") O(ctx, x, y, COL.run, true);
    else O(ctx, x, y, pl.kind === "pass" && pl.routes[s] && pl.routes[s] !== BLOCK ? SLOT_COL[s] || COL.o : COL.o);
  }
  // the ball's path: the run through the hole, the sneak, the fake
  if (pl.kind === "run") {
    const [rx, ry] = at(OS.RB), hole = pl.run === "stretch" ? side * 8 : side * 1.2;
    const hx = B.X(hole), hy = B.Y(pl.run === "stretch" ? 0.5 : 0.3), ex = B.X(hole + (pl.run === "stretch" ? side * 2 : 0)), ey = B.Y(pl.run === "draw" ? 7 : 8);
    if (pl.run === "draw") { thick(ctx, rx, ry, rx, ry - 2, COL.run); ln(ctx, rx, ry - 1, hx, hy, COL.run, 1); }
    else thick(ctx, rx, ry, hx, hy, COL.run);
    thick(ctx, hx, hy, ex, ey, COL.run);
    arrow(ctx, ex + 1, ey, ex - hx, ey - hy, COL.run, true);
    if (pl.lead) { const [lx, ly] = at(OS.WR3); ln(ctx, lx, ly, hx + side * 0, hy - 2, COL.o); blockMark(ctx, hx, hy - 3, 0, B, COL.o); }
  } else if (pl.kind === "sneak") {
    const [qx, qy] = at(OS.QB); thick(ctx, qx, qy, qx, B.Y(2.5), COL.run); arrow(ctx, qx + 1, B.Y(2.5), 0, -1, COL.run, true);
  } else if (pl.kind === "kneel") {
    const [qx, qy] = at(OS.QB); ln(ctx, qx - 2, qy + 3, qx + 2, qy + 3, COL.dim); ln(ctx, qx, qy + 1, qx, qy + 4, COL.dim);
  } else if (pl.pa) {
    const [rx, ry] = at(OS.RB), [qx, qy] = at(OS.QB); ln(ctx, rx, ry, qx + (pl.drop === "boot" ? -side * 2 : 0), qy - 2, COL.dim, 1);
    if (pl.drop === "boot") ln(ctx, qx, qy, B.X(side * -9), B.Y(-4), COL.o, 1);
  }
}
function blockMark(ctx, x, y, lean, B, c, back = false) {
  const ex = x + lean, ey = y - (back ? 4 : 3);
  ln(ctx, x, y - 1, ex, ey, c);
  ln(ctx, ex - 1, ey, ex + 1, ey, c);
}
function kickArt(ctx, pl, B) {
  const row = [0, 1.4, -1.4, 2.8, -2.8, 4.2, -4.2];
  for (const lat of row) { if (lat === 0) SQ(ctx, B.X(0), B.Y(-0.75), COL.o); else O(ctx, B.X(lat), B.Y(-0.75), COL.o); }
  if (pl.kind === "punt") {
    O(ctx, B.X(20), B.Y(-0.75), COL.o); O(ctx, B.X(-20), B.Y(-0.75), COL.o);
    O(ctx, B.X(0.8), B.Y(-4), COL.o);
    const kx = B.X(0), ky = B.h - 3;
    O(ctx, kx, ky, COL.run, true);
    ln(ctx, kx, ky - 2, kx, B.Y(1), COL.ball, 1); ln(ctx, kx, B.Y(1), kx + 10, 2, COL.ball, 1); arrow(ctx, kx + 10, 2, 1, -1, COL.ball);
    ln(ctx, B.X(20), B.Y(-0.5), B.X(16), 3, COL.dim); ln(ctx, B.X(-20), B.Y(-0.5), B.X(-16), 3, COL.dim);
  } else {
    O(ctx, B.X(5.4), B.Y(-0.75), COL.o); O(ctx, B.X(-5.4), B.Y(-0.75), COL.o);
    O(ctx, B.X(0), B.Y(-5.5), COL.o);                       // the holder
    O(ctx, B.X(-1.6), B.Y(-7.5), COL.run, true);            // the kicker
    const hx = B.X(0), hy = B.Y(-5.5);
    ln(ctx, hx, hy - 2, hx, 3, COL.ball, 1); arrow(ctx, hx, 3, 0, -1, COL.ball);
    // the posts
    ln(ctx, hx - 4, 1, hx - 4, 4, COL.run); ln(ctx, hx + 4, 1, hx + 4, 4, COL.run); ln(ctx, hx - 4, 4, hx + 4, 4, COL.run);
  }
}

// A standard offence for the defence's art to line up over (singleback).
const GHOST = FORMS.single.at;
// The defence's call, as the field sees it: X's at their alignments, arrows for the rush, bubbles
// for zones, dotted lines to the men they take.
export function drawDefArt(ctx, id, w = ART_W, h = ART_H) {
  const D = DEFS[id];
  clear(ctx, w, h);
  if (!D) return;
  const B = board(w, h);
  losLine(ctx, B);
  for (let s = 0; s < 11; s++) { const [lat, back] = GHOST[s]; if (s === OS.C) SQ(ctx, B.X(lat), B.Y(-back), COL.ghost); else O(ctx, B.X(lat), B.Y(-back), COL.ghost, true); }
  const tight = D.tight;
  const spots = D.a.map((a, s) => {
    if (s <= DS.RE) return [[3.6, 1.0, -1.0, -3.6][s] * (tight ? 0.85 : 1), 1.0];
    if (a.k === "man") { const [rl] = GHOST[a.on], inside = rl > 0 ? -1 : 1; const dep = s <= DS.SLB ? 4.5 : a.press ? 1.6 : a.on === OS.WR1 || a.on === OS.WR2 ? 6 : 5; const lat = s <= DS.SLB && a.on === OS.RB ? (s === DS.WLB ? 3 : s === DS.SLB ? -3 : 0) : rl + inside * 0.8; return [lat, tight ? Math.min(dep, 3) : dep]; }
    if (a.k === "zone") { const zy = zoneLat(a.y); if (s === DS.CB1 || s === DS.CB2) { const rl = GHOST[s === DS.CB1 ? OS.WR1 : OS.WR2][0]; return [rl + (rl > 0 ? -1 : 1), a.deep ? 7 : 5.5]; } const dep = a.deep ? a.depth - 3 : s <= DS.SLB ? 4.5 : Math.min(a.depth, 6); return [s <= DS.SLB ? [4, 0, -4][s - DS.WLB] : zy, dep]; }
    return [s === DS.WLB ? 3.5 : s === DS.SLB ? -3.5 : 0, tight ? 2 : 3.5];
  });
  // zones first (under everything), then the lines, then the X's on top
  D.a.forEach((a, s) => {
    if (a.k !== "zone") return;
    const zx = B.X(zoneLat(a.y)), zy = B.Y(Math.min(a.depth, 17));
    bubble(ctx, zx, zy, a.deep ? 7 : 5, a.deep ? 4 : 3, a.deep ? COL.deep : COL.under);
  });
  D.a.forEach((a, s) => {
    const [lat, dep] = spots[s], x = B.X(lat), y = B.Y(dep);
    if (a.k === "rush") { const ey = B.Y(-2.2); ln(ctx, x, y - 1, x, ey, COL.rush); arrow(ctx, x, ey, 0, -1, COL.rush); }
    else if (a.k === "man") { const [rl, rb] = GHOST[a.on]; ln(ctx, x, y, B.X(rl), B.Y(-rb) - 1, COL.man, 1); }
    else if (a.k === "zone") { const zx = B.X(zoneLat(a.y)), zy = B.Y(Math.min(a.depth, 17)); if (Math.abs(zx - x) + Math.abs(zy - y) > 3) ln(ctx, x, y, zx, zy, COL.dim, 1); }
  });
  D.a.forEach((a, s) => { const [lat, dep] = spots[s]; X(ctx, B.X(lat), B.Y(dep), a.k === "rush" ? COL.rush : COL.x); });
}
// y spec -> lateral yards from the ball ("s" + n straight; "f" + n a fraction of the field's width)
function zoneLat(spec) { const n = Number(spec.slice(1)); return spec[0] === "s" ? n : n * 53.33; }
