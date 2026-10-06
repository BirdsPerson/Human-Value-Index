// THE MOUNTAIN, skiable: the trail map (fast travel). A top-down picture of the ground (shaded relief,
// the trails in their ratings' colours, the forest, the water), drawn once and kept; over it the lifts,
// the lodges, the places found (tap one to go there), the challenges' flags, the files found, you.
// Places not yet found are not shown: fast travel goes only where you have been.
import { GRID, gridIndex, RUNS, LIFTS_W, LODGES_W, POIS, POI, FILES, W0, TREELINE_M, waterAt, polyAt } from "./world.js";
import { RUNNABLE } from "./challenges.js";
import { drawText, textWidth } from "../golf/font.js";

const RATING = { green: [22, 163, 74], blue: [37, 99, 235], black: [17, 24, 39], double: [0, 0, 0] };
export const MAP_STEP = 2;   // samples per map pixel (30 m)
export const MAP_W = Math.ceil(GRID.NX / MAP_STEP), MAP_H = Math.ceil(GRID.NY / MAP_STEP);
let BASE = null;
export function mapBase() {
  if (BASE) return BASE;
  const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(MAP_W, MAP_H) : Object.assign(document.createElement("canvas"), { width: MAP_W, height: MAP_H });
  const g = c.getContext("2d"), img = g.createImageData(MAP_W, MAP_H), d = img.data;
  const H = (i, j) => { const [T, o] = gridIndex(i * MAP_STEP, j * MAP_STEP); return T.h[o]; };
  for (let j = 0; j < MAP_H; j++) for (let i = 0; i < MAP_W; i++) {
    const [T, o] = gridIndex(i * MAP_STEP, j * MAP_STEP), h = T.h[o], tr = T.trail[o] - 1, e = T.edge[o];
    const dx = H(i + 1, j) - H(i - 1, j), dy = H(i, j + 1) - H(i, j - 1), sh = Math.max(0.45, Math.min(1.15, 0.85 - (dx * 0.6 + dy * 0.9) / (4 * MAP_STEP * GRID.GS) * 3));
    let c3;
    if (waterAt(GRID.x0 + i * MAP_STEP * GRID.GS, GRID.y0 + j * MAP_STEP * GRID.GS)) c3 = [70, 140, 175];
    else if (tr >= 0) c3 = e < 10 ? RATING[RUNS[tr].rating].map(v => v * 0.6 + 245 * 0.4) : [250, 252, 255];
    else if (h < TREELINE_M && h > 4) c3 = [150, 178, 160];
    else c3 = [222, 230, 240];
    const k = (j * MAP_W + i) * 4;
    d[k] = Math.min(255, c3[0] * sh); d[k + 1] = Math.min(255, c3[1] * sh); d[k + 2] = Math.min(255, c3[2] * sh); d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // the trails' lines, in their colours
  g.lineWidth = 1.5;
  for (const R of RUNS) {
    g.strokeStyle = `rgb(${RATING[R.rating].join(",")})`; g.setLineDash(R.kind === "glades" ? [2, 2] : R.kind === "moguls" ? [4, 1] : []);
    g.beginPath(); R.pts.forEach(([x, y], i) => { const [px, py] = toMap(x, y); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.stroke();
  }
  g.setLineDash([]);
  // the lifts, in black
  for (const L of LIFTS_W) { g.strokeStyle = "#0f172a"; g.lineWidth = L.kind === "gondola" ? 2 : 1; g.beginPath(); g.moveTo(...toMap(L.ax, L.ay)); g.lineTo(...toMap(L.bx, L.by)); g.stroke(); }
  for (const B of LODGES_W) { const [x0, y0] = toMap(B.x0, B.y0), [x1, y1] = toMap(B.x1, B.y1); g.fillStyle = B.roof; g.fillRect(x0, y0, Math.max(2, x1 - x0), Math.max(2, y1 - y0)); }
  BASE = c;
  return c;
}
export const toMap = (x, y) => [(x - GRID.x0) / (GRID.GS * MAP_STEP), (y - GRID.y0) / (GRID.GS * MAP_STEP)];
export const fromMap = (px, py) => [GRID.x0 + px * GRID.GS * MAP_STEP, GRID.y0 + py * GRID.GS * MAP_STEP];

// The markers a map shows, found ones only: -> [{id, name, kind, x, y, ch?}]
export function markers(found) {
  const out = POIS.filter(p => found.has(p.id)).map(p => ({ id: p.id, name: p.name, kind: p.kind, x: p.x, y: p.y, rating: p.rating }));
  for (const C of RUNNABLE) if (found.has(`ch:${C.id}`)) out.push({ id: `ch:${C.id}`, name: C.name, kind: "challenge", x: C.start.x, y: C.start.y, ch: C.id });
  return out;
}
// Draw the map (scale: screen pixels per map pixel) with the markers, the files found and you.
export function drawMap(g, W, H, { found, files, you, medals, focus, scale, ox, oy, time = 0 }) {
  g.imageSmoothingEnabled = false;
  g.fillStyle = "#0b1220"; g.fillRect(0, 0, W, H);
  g.drawImage(mapBase(), ox, oy, MAP_W * scale, MAP_H * scale);
  const S = (x, y) => { const [mx, my] = toMap(x, y); return [ox + mx * scale, oy + my * scale]; };
  for (const L of LIFTS_W) if (found.has(`${L.id}@a`) || found.has(`${L.id}@b`)) { const [x, y] = S((L.ax + L.bx) / 2, (L.ay + L.by) / 2); drawText(g, L.name.replace(/^THE /, ""), Math.round(x + 3), Math.round(y), "#0f172a"); }
  for (const F of FILES) if (files & (1 << F.i)) { const [x, y] = S(F.x, F.y); g.fillStyle = "#facc15"; g.fillRect(Math.round(x - 2), Math.round(y - 2), 4, 4); }
  const ms = markers(found);
  for (const m of ms) {
    const [x, y] = S(m.x, m.y), on = focus === m.id;
    const col = m.kind === "challenge" ? ["#f97316", "#b45309", "#cbd5e1", "#facc15"][medals?.[m.ch]?.medal || 0] : m.kind === "lift" || m.kind === "top" ? "#0ea5e9" : m.kind === "lodge" || m.kind === "base" ? "#7c2d12" : m.kind === "trail" ? `rgb(${RATING[m.rating].join(",")})` : "#334155";
    const r = on ? 6 : 4;
    g.fillStyle = "#020617"; g.fillRect(Math.round(x - r - 1), Math.round(y - r - 1), r * 2 + 2, r * 2 + 2);
    g.fillStyle = col; g.fillRect(Math.round(x - r), Math.round(y - r), r * 2, r * 2);
    if (m.kind === "challenge") { g.fillStyle = "#020617"; g.fillRect(Math.round(x - 1), Math.round(y - r + 1), 2, r * 2 - 2); }
    if (on) { const w = textWidth(m.name); g.fillStyle = "rgba(2,6,23,0.85)"; g.fillRect(Math.round(x - w / 2 - 3), Math.round(y - r - 14), w + 6, 11); drawText(g, m.name, Math.round(x - w / 2), Math.round(y - r - 12), "#f8fafc"); }
  }
  if (you) { const [x, y] = S(you.x, you.y), b = Math.floor(time * 3) % 2; g.fillStyle = b ? "#f97316" : "#fff7ed"; g.fillRect(Math.round(x - 3), Math.round(y - 3), 6, 6); g.fillStyle = "#020617"; g.fillRect(Math.round(x - 1), Math.round(y - 1), 2, 2); }
  void POI; void W0; void polyAt;
  return ms;
}
// The fit: the whole mountain in W x H -> {scale, ox, oy}
export function fitMap(W, H) { const scale = Math.min(W / MAP_W, H / MAP_H); return { scale, ox: (W - MAP_W * scale) / 2, oy: (H - MAP_H * scale) / 2 }; }
