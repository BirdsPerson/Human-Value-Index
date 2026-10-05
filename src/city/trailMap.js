// THE TRAIL MAP (#heights): the mountain drawn as a resort's map is drawn, from the one terrain
// (mountainGeo.js) at a fixed quarter turn, facing the trails: snow and forest, every trail in its
// rating's colour (the double blacks dashed, the glades dotted), the lifts in yellow (THE ASCENT in
// red), the lodges, the peaks with their elevations, the trails' names by their heads. What the
// mountain hides from this side is left off, as on a real map. Canvas 2D; pure apart from the ctx.

import { rot, project, STOREY, hiddenByTerrain } from "./iso.js";
import { MTN, terrainH, TREELINE, TRAILS, LIFTS, LODGES, PEAKS, PINES, RATING, feetAt, RACE_COURSE, GATES, trailStatus, liftStatus, along } from "./mountainGeo.js";

const R = 3;   // facing south-west: the trails' faces towards the reader
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const INK = { green: "#16a34a", blue: "#2563eb", black: "#111827", double: "#020617" };

function camFor(W, H) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let x = MTN.x0; x <= MTN.x1; x += 3) for (let y = MTN.y0; y <= MTN.y1; y += 3) {
    const [u, v] = rot(x, y, R), sx = u - v, sy = (u + v) / 2 - terrainH(x, y) * STOREY;
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy - 4); y1 = Math.max(y1, sy);
  }
  const z = Math.min((W - 24) / (x1 - x0), (H - 40) / (y1 - y0));
  return { z, ox: W / 2 - z * (x0 + x1) / 2, oy: H / 2 - z * (y0 + y1) / 2 + 10, r: R };
}
const VIS = new Map();
const seen = (x, y, h) => { const k = `${x.toFixed(1)}|${y.toFixed(1)}`; let v = VIS.get(k); if (v === undefined) { v = !hiddenByTerrain(x, y, h + 0.15, R); VIS.set(k, v); } return v; };

// -> {cam, hits: [{kind, id, x, y, r}]} for the page's taps and titles
export function drawTrailMap(ctx, W, H, mt) {
  const cam = camFor(W, H), Q = (x, y, h) => { const [u, v] = rot(x, y, R); return project(u, v, h, cam); };
  const hits = [];
  // the sky: the Department's, at dawn
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0b1a2a"); g.addColorStop(0.6, "#17324a"); g.addColorStop(1, "#24455e");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // the ground, back to front
  const step = 1.6, cells = [];
  for (let x = MTN.x0; x < MTN.x1; x += step) for (let y = MTN.y0; y < MTN.y1; y += step) {
    const [u, v] = rot(x + step / 2, y + step / 2, R);
    cells.push([u + v, x, y]);
  }
  cells.sort((a, b) => a[0] - b[0]);
  for (const [, x, y] of cells) {
    const h00 = terrainH(x, y), h10 = terrainH(x + step, y), h11 = terrainH(x + step, y + step), h01 = terrainH(x, y + step), hc = (h00 + h10 + h11 + h01) / 4;
    const gx = ((h10 + h11) - (h00 + h01)) / (2 * step), gy = ((h01 + h11) - (h00 + h10)) / (2 * step), steep = Math.hypot(gx, gy);
    const lit = clamp(0.93 + 0.15 * clamp(-(gx * -0.45 + gy * 0.89), -2.4, 2.4), 0.7, 1.12);
    const edge = TREELINE + (Math.sin(x * 0.41 + y * 0.23) + Math.sin(x * 0.13 - y * 0.37)) * 1.6;
    let base = steep > 2.4 ? [128, 132, 140] : hc < edge && hc > 0.4 ? [86, 120, 98] : [232, 239, 244];
    if (hc <= 0.05) base = [42, 52, 64];
    ctx.fillStyle = `rgb(${base.map(c => Math.round(clamp(c * lit, 0, 255))).join(",")})`;
    ctx.beginPath();
    for (const [i, [a, b, hh]] of [[x, y, h00], [x + step, y, h10], [x + step, y + step, h11], [x, y + step, h01]].entries()) { const [sx, sy] = Q(a, b, hh); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); }
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.5; ctx.stroke();
  }
  // the forest: a tuft for every other pine that this side can see
  ctx.fillStyle = "#1e4a2f";
  const tz = Math.max(1.2, cam.z * 0.45);
  for (let i = 0; i < PINES.length; i += 2) {
    const [x, y, h] = PINES[i];
    if (!seen(x, y, h + 0.3)) continue;
    const [sx, sy] = Q(x, y, h);
    ctx.beginPath(); ctx.moveTo(sx, sy - tz * 1.8); ctx.lineTo(sx - tz * 0.7, sy + tz * 0.2); ctx.lineTo(sx + tz * 0.7, sy + tz * 0.2); ctx.closePath(); ctx.fill();
  }
  // the trails, in their colours
  for (const T of TRAILS) {
    const st = trailStatus(T, mt), w = Math.max(2, cam.z * 0.55);
    for (let i = 1; i < T.pts.length; i++) {
      const [ax, ay] = T.pts[i - 1], [bx, by] = T.pts[i];
      if (!seen((ax + bx) / 2, (ay + by) / 2, (T.hs[i - 1] + T.hs[i]) / 2)) continue;
      const A = Q(ax, ay, T.hs[i - 1]), B = Q(bx, by, T.hs[i]);
      ctx.lineCap = "round"; ctx.globalAlpha = st.open ? 1 : 0.45;
      ctx.strokeStyle = "#f8fafc"; ctx.lineWidth = w + 2; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      ctx.strokeStyle = INK[T.rating]; ctx.lineWidth = w;
      if (T.rating === "double" || T.kind === "glades") ctx.setLineDash(T.kind === "glades" ? [w * 0.6, w * 0.9] : [w * 2, w * 0.8]);
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
  }
  // the race course's gates
  for (const gt of GATES) { const [sx, sy] = Q(gt.x, gt.y, terrainH(gt.x, gt.y)); ctx.fillStyle = gt.col; ctx.fillRect(sx - 1.5, sy - 4, 3, 4); }
  // the lifts: the line, towers as ticks, the name at its middle
  for (const L of LIFTS) {
    const A = Q(L.a[0], L.a[1], terrainH(...L.a) + 1.2), B = Q(L.b[0], L.b[1], terrainH(...L.b) + 1.2), open = liftStatus(L, mt).open;
    ctx.strokeStyle = L.kind === "gondola" ? "#ef4444" : "#facc15"; ctx.lineWidth = L.kind === "gondola" ? 2.5 : 1.8; ctx.globalAlpha = open ? 1 : 0.55;
    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); ctx.globalAlpha = 1;
    for (const end of [A, B]) { ctx.fillStyle = "#111827"; ctx.fillRect(end[0] - 3, end[1] - 3, 6, 6); }
    hits.push({ kind: "lift", id: L.id, x: (A[0] + B[0]) / 2, y: (A[1] + B[1]) / 2, r: 14 });
  }
  // labels: peaks, lodges, lifts, trails (greedy: no label over another)
  const placed = [];
  const fits = (x0, y0, w, h) => x0 > 2 && y0 > 2 && x0 + w < W - 2 && y0 + h < H - 2 && !placed.some(p => x0 < p[0] + p[2] && p[0] < x0 + w && y0 < p[1] + p[3] && p[1] < y0 + h);
  const fs = clamp(Math.round(W / 92), 8, 12);
  const tag = (text, x, y, col, bg = "rgba(6,10,6,0.82)", mark = null) => {
    ctx.font = `bold ${fs}px "Fira Mono", monospace`;
    const w = ctx.measureText(text).width + 8 + (mark ? fs + 2 : 0), h = fs + 6;
    for (const [dx, dy] of [[6, -h - 2], [6, 4], [-w - 6, -h - 2], [-w - 6, 4], [-w / 2, -h - 10], [-w / 2, 10]]) {
      const x0 = x + dx, y0 = y + dy;
      if (!fits(x0, y0, w, h)) continue;
      placed.push([x0, y0, w, h]);
      ctx.fillStyle = bg; ctx.fillRect(x0, y0, w, h);
      ctx.strokeStyle = "rgba(167,215,181,0.35)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x0 + (dx < 0 ? w : 0), y0 + h / 2); ctx.stroke();
      if (mark) symbol(ctx, mark, x0 + 4 + fs / 2, y0 + h / 2, fs * 0.42);
      ctx.fillStyle = col; ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.fillText(text, x0 + 4 + (mark ? fs + 2 : 0), y0 + h / 2 + 0.5);
      return true;
    }
    return false;
  };
  for (const P of PEAKS) { const [sx, sy] = Q(P.x, P.y, P.h); ctx.fillStyle = "#f8fafc"; ctx.beginPath(); ctx.moveTo(sx, sy - 6); ctx.lineTo(sx - 4, sy + 1); ctx.lineTo(sx + 4, sy + 1); ctx.closePath(); ctx.fill(); tag(`${P.name} ${feetAt(P.h).toLocaleString("en-US")} FT`, sx, sy, "#fef3c7"); }
  for (const L of Object.values(LODGES)) {
    if (L.id === "patrol") continue;
    const [sx, sy] = Q(L.cx, L.cy, L.base + L.h);
    ctx.fillStyle = "#7c2d12"; ctx.fillRect(sx - 5, sy - 4, 10, 7); ctx.fillStyle = "#f8fafc"; ctx.beginPath(); ctx.moveTo(sx - 7, sy - 4); ctx.lineTo(sx, sy - 9); ctx.lineTo(sx + 7, sy - 4); ctx.closePath(); ctx.fill();
    tag(L.name, sx, sy - 6, "#fde68a");
    hits.push({ kind: "lodge", id: L.building, x: sx, y: sy, r: 14 });
  }
  { const [sx, sy] = Q(64, -20, 3); tag("THE BASE LODGE // THE VILLAGE", sx, sy, "#fde68a"); }
  { const [fx, fy] = RACE_COURSE.finish, [sx, sy] = Q(fx, fy, terrainH(fx, fy)); tag("THE GAUNTLET // FINISH", sx, sy, "#fca5a5"); }
  for (const L of LIFTS) { const m = [L.a[0] + (L.b[0] - L.a[0]) * 0.55, L.a[1] + (L.b[1] - L.a[1]) * 0.55], [sx, sy] = Q(m[0], m[1], terrainH(...m) + 1.2); tag(L.name, sx, sy, L.kind === "gondola" ? "#fca5a5" : "#fde047"); }
  for (const T of TRAILS) {
    let done = false;
    for (const k of [0.3, 0.5, 0.18, 0.7, 0.85]) {
      const [x, y] = along(T.pts, k, T.len), h = terrainH(x, y);
      if (!seen(x, y, h)) continue;
      const [sx, sy] = Q(x, y, h);
      if (tag(T.name.replace(" (TERRAIN PARK)", "").replace(" (RACE COURSE)", ""), sx, sy, "#e5e7eb", "rgba(6,10,6,0.82)", T.rating)) { hits.push({ kind: "trail", id: T.id, x: sx, y: sy, r: 12 }); done = true; break; }
    }
    void done;
  }
  return { cam, hits };
}
// A rating's sign: green circle, blue square, black diamond, two black diamonds.
export function symbol(c, rating, x, y, s) {
  c.save(); c.fillStyle = INK[rating] === "#020617" ? "#000" : INK[rating]; c.strokeStyle = "#f8fafc"; c.lineWidth = 1;
  if (rating === "green") { c.beginPath(); c.arc(x, y, s, 0, Math.PI * 2); c.fill(); c.stroke(); }
  else if (rating === "blue") { c.fillRect(x - s, y - s, 2 * s, 2 * s); c.strokeRect(x - s, y - s, 2 * s, 2 * s); }
  else for (const o of rating === "double" ? [-s * 0.8, s * 0.8] : [0]) { c.beginPath(); c.moveTo(x + o, y - s * 1.2); c.lineTo(x + o + s * 0.85, y); c.lineTo(x + o, y + s * 1.2); c.lineTo(x + o - s * 0.85, y); c.closePath(); c.fill(); c.stroke(); }
  c.restore();
}
void RATING;
