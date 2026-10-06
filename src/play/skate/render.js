// THE PARK, skateable: the picture. A fixed isometric camera over a pixel level (the handheld skate
// games' view), drawn once into a big canvas and scrolled; the skater, the letters and the meters drawn
// over it every frame; anything in front of the skater (a funbox you are behind) drawn again on top.
// Browser-only, nothing here feeds back into the sim. 1 tile = 32 x 16 pixels; 1 tile up = 16 pixels.
import { levelOf, headVec, FLIPS, LIPS } from "./sim.js";
import { LETTERS } from "./levels.js";
import { drawText, textWidth } from "../golf/font.js";
import { shrinkHead } from "../heads.js";

const TW = 16, TH = 8, ZH = 16, MARGIN = 72, TOPZ = 9;
const R = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
const hash = (a, b = 0) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const comma = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => f(v).toString(16).padStart(2, "0")).join("")}`; };

// a crisp polygon: scanlines, whole pixels, no antialiasing
function poly(g, pts, col) {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  g.fillStyle = col;
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    const yc = y + 0.5, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) { const xa = Math.round(xs[k]), xb = Math.round(xs[k + 1]); if (xb > xa) g.fillRect(xa, y, xb - xa, 1); }
  }
}
function line(g, x0, y0, x1, y1, col, w = 1) {
  g.fillStyle = col;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy, n = 0;
  for (;;) {
    g.fillRect(x0 - (w >> 1), y0 - (w >> 1), w, w);
    if ((x0 === x1 && y0 === y1) || n++ > 2000) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}

// ---- the level, drawn once ---------------------------------------------------------------------------------------
export function makeView(levelId) {
  const L = levelOf(levelId), look = L.look;
  const w = (L.W + L.H) * TW + MARGIN * 2, h = (L.W + L.H) * TH + TOPZ * ZH + MARGIN * 2;
  const ox = L.H * TW + MARGIN, oy = TOPZ * ZH + MARGIN;
  const P = (x, y, z = 0) => [ox + (x - y) * TW, oy + (x + y) * TH - z * ZH];
  const base = document.createElement("canvas"); base.width = w; base.height = h;
  const g = base.getContext("2d");
  // around the level
  g.fillStyle = look.grass; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { const x = hash(i, 1) * w, y = hash(i, 2) * h; R(g, x, y, 1, 1, shade(look.grass, 0.8 + hash(i, 3) * 0.4)); }
  surroundings(g, L, P);
  // the floor
  poly(g, [P(0, 0), P(L.W, 0), P(L.W, L.H), P(0, L.H)], look.floor);
  floorPattern(g, L, P);
  // the edge you can see (the near sides): a kerb
  poly(g, [P(L.W, 0), P(L.W, L.H), P(L.W, L.H, -0.35), P(L.W, 0, -0.35)], shade(look.floor, 0.62));
  poly(g, [P(0, L.H), P(L.W, L.H), P(L.W, L.H, -0.35), P(0, L.H, -0.35)], shade(look.floor, 0.5));
  // the objects, back to front, each also kept as its own sprite (for drawing over the skater)
  const order = L.objs.map(o => o).sort((a, b) => (a.x0 + a.y0 + a.x1 + a.y1) - (b.x0 + b.y0 + b.x1 + b.y1));
  const sprites = [];
  for (const o of order) {
    const box = objBounds(o, P);
    const c = document.createElement("canvas"); c.width = box.w; c.height = box.h;
    const sg = c.getContext("2d");
    sg.translate(-box.x, -box.y);
    drawObj(sg, o, L, P);
    g.drawImage(c, box.x, box.y);
    if (!o.xray) sprites.push({ o, c, x: box.x, y: box.y });
  }
  for (const r of L.rails) drawRail(g, r, L, P);
  signs(g, L, P);
  return { L, base, P, ox, oy, sprites, cam: null, pops: [], parts: [], t: 0, w, h, heads: new Map() };
}
function objBounds(o, P) {
  const top = o.k === "qp" ? o.H : o.k === "slope" ? Math.max(o.z0, o.z1) : o.z;
  const pts = [P(o.x0, o.y0, 0), P(o.x1, o.y0, 0), P(o.x1, o.y1, 0), P(o.x0, o.y1, 0), P(o.x0, o.y0, top + 0.4), P(o.x1, o.y0, top + 0.4), P(o.x1, o.y1, top + 0.4), P(o.x0, o.y1, top + 0.4)];
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x = Math.floor(Math.min(...xs)) - 2, y = Math.floor(Math.min(...ys)) - 2;
  return { x, y, w: Math.ceil(Math.max(...xs)) - x + 3, h: Math.ceil(Math.max(...ys)) - y + 3 };
}
function floorPattern(g, L, P) {
  const look = L.look;
  if (L.id === "vert") {   // the flat bottom: planks along the pipe
    for (let y = 3.5; y <= 8.5; y += 0.5) { const a = P(0, y), b = P(L.W, y); line(g, a[0], a[1], b[0], b[1], look.joint); }
    for (let x = 0; x < L.W; x += 2.4) for (let y = 3.5; y < 8.5; y += 0.5) { const a = P(x + (y * 7) % 2.4, y), b = P(x + (y * 7) % 2.4, y + 0.5); line(g, a[0], a[1], b[0], b[1], look.joint); }
    return;
  }
  if (L.id === "street") {
    // paving: one-tile flags, the boardwalk's planks at the front, a crossing in the curb's gap
    for (let x = 0; x <= L.W; x += 1) { const a = P(x, 0), b = P(x, 18.6); line(g, a[0], a[1], b[0], b[1], look.joint); }
    for (let y = 0; y <= 18.6; y += 1) { const a = P(0, y), b = P(L.W, y); line(g, a[0], a[1], b[0], b[1], look.joint); }
    poly(g, [P(0, 18.6), P(L.W, 18.6), P(L.W, L.H), P(0, L.H)], look.plank);
    for (let y = 18.6; y <= L.H; y += 0.4) { const a = P(0, y), b = P(L.W, y); line(g, a[0], a[1], b[0], b[1], look.plankLo); }
    for (let k = 0; k < 4; k++) poly(g, [P(13.4 + k, 17.5), P(13.9 + k, 17.5), P(13.9 + k, 18.4), P(13.4 + k, 18.4)], "#f5f5f4");
    // the Strip's road beyond the curb
    poly(g, [P(0, 18), P(L.W, 18), P(L.W, 18.6), P(0, 18.6)], "#44403c");
    return;
  }
  for (let x = 0; x <= L.W; x += 2) { const a = P(x, 0), b = P(x, L.H); line(g, a[0], a[1], b[0], b[1], look.joint); }
  for (let y = 0; y <= L.H; y += 2) { const a = P(0, y), b = P(L.W, y); line(g, a[0], a[1], b[0], b[1], look.joint); }
  for (let i = 0; i < 260; i++) { const [x, y] = P(hash(i, 7) * L.W, hash(i, 8) * L.H); R(g, x, y, 1, 1, shade(look.floor, 0.9)); }
}
// what stands around the level: the fence, the HQ's front, the deck, the sea
function surroundings(g, L, P) {
  const look = L.look;
  if (L.id === "street") {
    // the beach and the sea beyond the boardwalk
    poly(g, [P(-4, L.H), P(L.W + 6, L.H), P(L.W + 6, L.H + 3), P(-4, L.H + 3)], "#e7cf96");
    poly(g, [P(-4, L.H + 3), P(L.W + 6, L.H + 3), P(L.W + 6, L.H + 12), P(-4, L.H + 12)], "#1d4e89");
    for (let i = 0; i < 80; i++) { const [x, y] = P(-4 + hash(i, 4) * (L.W + 10), L.H + 3.5 + hash(i, 5) * 8); R(g, x, y, 3, 1, "#7fb2e5"); }
    // HQ: the Department's front behind the terrace, seven storeys of it
    const H = 6.5;
    poly(g, [P(0, 0), P(L.W, 0), P(L.W, 0, H), P(0, 0, H)], "#57534e");
    poly(g, [P(0, 0), P(0, L.H), P(0, L.H, 1.2), P(0, 0, 1.2)], "#78716c");
    for (let x = 0.6; x < L.W - 0.4; x += 1.2) for (let z = 1.6; z < H - 0.4; z += 1.1) {
      const lit = hash(Math.round(x * 10), Math.round(z * 10)) > 0.55;
      poly(g, [P(x, 0, z), P(x + 0.7, 0, z), P(x + 0.7, 0, z + 0.7), P(x, 0, z + 0.7)], lit ? "#fde68a" : "#292524");
    }
    // the doors on the terrace
    poly(g, [P(13, 0, 0.98), P(17, 0, 0.98), P(17, 0, 2.6), P(13, 0, 2.6)], "#1c1917");
    for (let x = 13.2; x < 17; x += 0.95) poly(g, [P(x, 0, 1.0), P(x + 0.75, 0, 1.0), P(x + 0.75, 0, 2.4), P(x, 0, 2.4)], "#44403c");
    const [hx, hy] = P(15, 0, 3.4); drawText(g, "DEPARTMENT", hx - textWidth("DEPARTMENT") / 2, hy - 10, "#fafaf9");
    return;
  }
  if (L.id === "vert") {
    // the decks: a platform behind the north wall, the rails along it
    poly(g, [P(0, -2.2, 3.2), P(L.W, -2.2, 3.2), P(L.W, 0, 3.2), P(0, 0, 3.2)], "#a3743f");
    for (let x = 0; x <= L.W; x += 1.5) { const a = P(x, -2.2, 3.2), b = P(x, -2.2, 4.4); line(g, a[0], a[1], b[0], b[1], "#9ca3af"); }
    { const a = P(0, -2.2, 4.4), b = P(L.W, -2.2, 4.4); line(g, a[0], a[1], b[0], b[1], "#d1d5db"); }
    poly(g, [P(0, L.H, 3.2), P(L.W, L.H, 3.2), P(L.W, L.H + 2.2, 3.2), P(0, L.H + 2.2, 3.2)], "#8b5e2f");
    poly(g, [P(0, L.H + 2.2, 3.2), P(L.W, L.H + 2.2, 3.2), P(L.W, L.H + 2.2, 0), P(0, L.H + 2.2, 0)], "#5b3b1c");
    return;
  }
  // the park: a chain-link fence along the back
  const F = 1.4;
  for (let x = 0; x <= L.W; x += 0.5) { const a = P(x, -0.6, 1.6), b = P(x, -0.6, 1.6 + F); line(g, a[0], a[1], b[0], b[1], x % 2 === 0 ? "#6b7280" : "#4b5563"); }
  for (let y = 0; y <= L.H; y += 0.5) { const a = P(-0.6, y, 1.6), b = P(-0.6, y, 1.6 + F); line(g, a[0], a[1], b[0], b[1], y % 2 === 0 ? "#6b7280" : "#4b5563"); }
  for (const z of [1.6 + F, 1.6 + F / 2]) { let a = P(0, -0.6, z), b = P(L.W, -0.6, z); line(g, a[0], a[1], b[0], b[1], "#9ca3af"); a = P(-0.6, 0, z); b = P(-0.6, L.H, z); line(g, a[0], a[1], b[0], b[1], "#9ca3af"); }
  poly(g, [P(-0.6, -0.6, 1.6), P(L.W, -0.6, 1.6), P(L.W, 0, 1.6), P(0, 0, 1.6), P(0, L.H, 1.6), P(-0.6, L.H, 1.6)], "#8a929c");
}
function drawObj(g, o, L, P) {
  const look = L.look;
  if (o.k === "box") {
    const z = o.z, top = o.solid ? "#1e3a8a" : look.box;
    poly(g, [P(o.x1, o.y0, z), P(o.x1, o.y1, z), P(o.x1, o.y1, 0), P(o.x1, o.y0, 0)], o.solid ? "#1e40af" : look.boxSide);
    poly(g, [P(o.x0, o.y1, z), P(o.x1, o.y1, z), P(o.x1, o.y1, 0), P(o.x0, o.y1, 0)], o.solid ? "#172554" : look.boxFront);
    poly(g, [P(o.x0, o.y0, z), P(o.x1, o.y0, z), P(o.x1, o.y1, z), P(o.x0, o.y1, z)], top);
    if (o.id === "fountain") {   // the water in the basin, the spout
      poly(g, [P(o.x0 + 0.35, o.y0 + 0.35, z), P(o.x1 - 0.35, o.y0 + 0.35, z), P(o.x1 - 0.35, o.y1 - 0.35, z), P(o.x0 + 0.35, o.y1 - 0.35, z)], "#3b82c4");
      const [sx, sy] = P((o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2, z); R(g, sx - 1, sy - 14, 3, 14, "#bfdbfe"); R(g, sx - 3, sy - 15, 7, 2, "#dbeafe");
    }
    if (o.id.startsWith("planter")) for (let i = 0; i < 9; i++) { const [px, py] = P(o.x0 + 0.4 + hash(i, o.x0) * (o.x1 - o.x0 - 0.8), o.y0 + 0.4 + hash(i, o.y0 + 9) * (o.y1 - o.y0 - 0.8), z); R(g, px - 2, py - 6, 5, 6, i % 3 ? "#3f6212" : "#4d7c0f"); R(g, px - 1, py - 8, 3, 2, "#65a30d"); }
    if (o.id === "newsstand") { const [nx, ny] = P(o.x1, (o.y0 + o.y1) / 2, o.z - 0.3); drawText(g, "NEWS", nx - 10, ny - 4, "#fde047"); }
    edge(g, P(o.x0, o.y1, z), P(o.x1, o.y1, z), shade(top, 1.18)); edge(g, P(o.x1, o.y0, z), P(o.x1, o.y1, z), shade(top, 1.18));
    return;
  }
  if (o.k === "slope") {
    const zt = (x, y) => { const f = o.f, span = f.ax === "x" ? o.x1 - o.x0 : o.y1 - o.y0, p = f.ax === "x" ? x : y, t = f.sgn > 0 ? (p - f.foot) / span : (f.foot - p) / span; return o.z0 + (o.z1 - o.z0) * t; };
    const c = (x, y) => P(x, y, zt(x, y));
    // the visible side faces (the +x side and the +y side)
    poly(g, [c(o.x1, o.y0), c(o.x1, o.y1), P(o.x1, o.y1, 0), P(o.x1, o.y0, 0)], look.boxSide);
    poly(g, [c(o.x0, o.y1), c(o.x1, o.y1), P(o.x1, o.y1, 0), P(o.x0, o.y1, 0)], look.boxFront);
    if (o.stairs) {
      const n = 7, f = o.f;
      for (let k = 0; k < n; k++) {
        const a = k / n, b = (k + 1) / n, at = (t) => f.ax === "x" ? (f.sgn > 0 ? o.x0 + t * (o.x1 - o.x0) : o.x1 - t * (o.x1 - o.x0)) : (f.sgn > 0 ? o.y0 + t * (o.y1 - o.y0) : o.y1 - t * (o.y1 - o.y0));
        const zA = o.z0 + (o.z1 - o.z0) * b;   // each tread flat at its top height
        const p = (t, side) => (f.ax === "x" ? P(at(t), side ? o.y1 : o.y0, zA) : P(side ? o.x1 : o.x0, at(t), zA));
        poly(g, [p(a, 0), p(b, 0), p(b, 1), p(a, 1)], k % 2 ? look.box : shade(look.box, 0.93));
        const q = (t, side, z) => (f.ax === "x" ? P(at(t), side ? o.y1 : o.y0, z) : P(side ? o.x1 : o.x0, at(t), z));
        poly(g, [q(a, 0, zA), q(a, 1, zA), q(a, 1, o.z0 + (o.z1 - o.z0) * a), q(a, 0, o.z0 + (o.z1 - o.z0) * a)], look.boxFront);
      }
      return;
    }
    poly(g, [c(o.x0, o.y0), c(o.x1, o.y0), c(o.x1, o.y1), c(o.x0, o.y1)], look.ramp);
    for (let k = 1; k < 4; k++) { const t = k / 4; const f = o.f; const a = f.ax === "x" ? c(o.x0 + (o.x1 - o.x0) * t, o.y0) : c(o.x0, o.y0 + (o.y1 - o.y0) * t), b = f.ax === "x" ? c(o.x0 + (o.x1 - o.x0) * t, o.y1) : c(o.x1, o.y0 + (o.y1 - o.y0) * t); line(g, a[0], a[1], b[0], b[1], look.rampLo); }
    // a metal lip on a kicker's high edge
    const f = o.f, hi = f.sgn > 0 ? (f.ax === "x" ? [c(o.x1, o.y0), c(o.x1, o.y1)] : [c(o.x0, o.y1), c(o.x1, o.y1)]) : (f.ax === "x" ? [c(o.x0, o.y0), c(o.x0, o.y1)] : [c(o.x0, o.y0), c(o.x1, o.y0)]);
    if (o.z1 > o.z0 + 0.3) line(g, hi[0][0], hi[0][1], hi[1][0], hi[1][1], look.coping, 2);
    return;
  }
  // a quarter pipe: the curved face in strips, the end you can see, the coping
  const f = o.f, N = 12;
  const along = (t) => (f.sgn > 0 ? f.foot + t * (f.lip - f.foot) : f.foot - t * (f.foot - f.lip));
  const pt = (t, side) => (f.ax === "x" ? P(along(t), side ? o.y1 : o.y0, o.H * t * t) : P(side ? o.x1 : o.x0, along(t), o.H * t * t));
  // the end faces: x1 for a north/south pipe, y1 for a west/east one
  const prof = [];
  for (let k = 0; k <= N; k++) prof.push(pt(k / N, 1));
  const endFoot = f.ax === "x" ? [P(f.foot, o.y1, 0), P(f.lip, o.y1, 0)] : [P(o.x1, f.foot, 0), P(o.x1, f.lip, 0)];
  const strips = () => {
    for (let k = 0; k < N; k++) {
      const a = k / N, b = (k + 1) / N, t = (a + b) / 2;
      const col = t < 0.33 ? look.ramp : t < 0.7 ? shade(look.ramp, 1.06) : look.rampHi;
      poly(g, [pt(a, 0), pt(a, 1), pt(b, 1), pt(b, 0)], o.xray ? shade(col, 0.82) : col);
      if (k % 3 === 2) { const p0 = pt(b, 0), p1 = pt(b, 1); line(g, p0[0], p0[1], p1[0], p1[1], look.rampLo); }
    }
  };
  if (o.xray) {
    strips();
    // the back wall drawn as an outline only, so the skater shows through
    const l0 = pt(1, 0), l1 = pt(1, 1);
    const b0 = f.ax === "x" ? P(f.lip, o.y0, 0) : P(o.x0, f.lip, 0), b1 = f.ax === "x" ? P(f.lip, o.y1, 0) : P(o.x1, f.lip, 0);
    line(g, b0[0], b0[1], b1[0], b1[1], shade(look.side, 0.8)); line(g, l0[0], l0[1], b0[0], b0[1], shade(look.side, 0.8));
    poly(g, [...prof, endFoot[1], endFoot[0]], look.side);
    line(g, l0[0], l0[1], l1[0], l1[1], look.coping, 2);
    return;
  }
  strips();
  if (f.sgn < 0) poly(g, [...prof, endFoot[1], endFoot[0]], look.side);
  for (let k = 0; k < prof.length - 1; k++) line(g, prof[k][0], prof[k][1], prof[k + 1][0], prof[k + 1][1], shade(look.side, 1.3));
  const l0 = pt(1, 0), l1 = pt(1, 1);
  line(g, l0[0], l0[1], l1[0], l1[1], look.coping, 2);
}
function edge(g, a, b, col) { line(g, a[0], a[1], b[0], b[1], col); }
function drawRail(g, r, L, P) {
  if (r.coping) return;
  const a = P(...r.a), b = P(...r.b);
  if (r.rail) {   // a rail on posts
    const n = Math.max(2, Math.round(r.len / 1.6));
    for (let k = 0; k <= n; k++) {
      const u = k / n, x = r.a[0] + r.dx * u, y = r.a[1] + r.dy * u, z = r.a[2] + r.dz * u, gz = groundUnder(L, x, y);
      const p = P(x, y, z), q = P(x, y, gz); line(g, p[0], p[1], q[0], q[1], shade(L.look.rail, 0.6), 2);
    }
    line(g, a[0], a[1] + 1, b[0], b[1] + 1, shade(L.look.rail, 0.55), 1);
    line(g, a[0], a[1], b[0], b[1], L.look.rail, 2);
  } else line(g, a[0], a[1], b[0], b[1], shade(L.look.box, 1.25), 1);   // a ledge's waxed edge
}
function groundUnder(L, x, y) { let h = 0; for (const o of L.objs) if (x >= o.x0 && x <= o.x1 && y >= o.y0 && y <= o.y1 && o.k === "box") h = Math.max(h, o.z); return h; }
function signs(g, L, P) {
  if (L.id === "park") { const [x, y] = P(14, 0, 1.6); drawText(g, "THE PARK // RECREATION GROUND", x - 70, y - 30, "#e5e7eb"); }
  if (L.id === "vert") { const [x, y] = P(15, -2.2, 4.6); drawText(g, "THE VERT RAMP", x - 38, y - 12, "#fde68a"); }
  if (L.id === "street") { const [x, y] = P(15, 21.5, 0); drawText(g, "THE BOARDWALK", x - 38, y - 4, "#fef3c7"); }
}

// ---- every frame -------------------------------------------------------------------------------------------------
// the view's own motion (the camera, the pops, the sparks): call once per drawn frame
export function advance(V, st, dt = 1 / 60) {
  V.t += dt;
  const [sx, sy] = V.P(st.x, st.y, st.z * 0.7);
  if (!V.cam) V.cam = [sx, sy];
  V.cam[0] += (sx - V.cam[0]) * 0.14; V.cam[1] += (sy - V.cam[1]) * 0.12;
  for (const p of V.parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--; }
  V.parts = V.parts.filter(p => p.life > 0);
  if (st.st === "grind") { const [px, py] = V.P(st.x, st.y, st.z); for (let k = 0; k < 2; k++) V.parts.push({ x: px + (Math.random() - 0.5) * 4, y: py, vx: (Math.random() - 0.5) * 2.4, vy: -Math.random() * 1.6, life: 10 + Math.random() * 8, c: Math.random() < 0.5 ? "#fde047" : "#fb923c" }); }
  for (const p of V.pops) p.life -= dt;
  V.pops = V.pops.filter(p => p.life > 0);
}
// a message over the picture: kind "bank" | "bail" | "goal" | "letter" | "info"
export function pop(V, text, kind = "info", life = 1.6) { V.pops.push({ text, kind, life, max: life }); if (V.pops.length > 4) V.pops.shift(); }

export function draw(ctx, W, H, st, V, opts = {}) {
  const L = V.L, look = L.look;
  ctx.imageSmoothingEnabled = false;
  // the sky and the city behind (a slow parallax)
  const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, look.sky[0]); sky.addColorStop(1, look.sky[1]);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  skyline(ctx, W, H, V);
  // the level
  let cx = Math.round(V.cam[0] - W / 2), cy = Math.round(V.cam[1] - H * 0.56);
  cx = Math.max(0, Math.min(V.w - W, cx)); cy = Math.max(-40, Math.min(V.h - H, cy));
  ctx.drawImage(V.base, cx, Math.max(0, cy), W, H - Math.max(0, -cy), 0, Math.max(0, -cy), W, H - Math.max(0, -cy));
  const S = (x, y, z) => { const [a, b] = V.P(x, y, z); return [a - cx, b - cy]; };
  // the letters and the tape, bobbing
  const bob = Math.round(Math.sin(V.t * 4) * 1.5);
  LETTERS.forEach((c, i) => { if (st.letters & (1 << i)) return; const it = L.items[c]; const [x, y] = S(it.x, it.y, it.z); itemShadow(ctx, S, L, it); letter(ctx, x, y + bob, c); });
  if (!st.tape) { const it = L.items.tape; const [x, y] = S(it.x, it.y, it.z); itemShadow(ctx, S, L, it); tape(ctx, x, y + bob, V.t); }
  // the skater and the shadow
  const gz = groundZ(L, st.x, st.y);
  const [shx, shy] = S(st.x, st.y, Math.min(gz, st.z));
  ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(shx - 6, shy - 1, 12, 3); ctx.fillRect(shx - 4, shy - 2, 8, 5);
  const [px, py] = S(st.x, st.y, st.z);
  // the skater, drawn on their own little sheet, then set down with a dark outline (readable on anything)
  if (!V.sk) { V.sk = document.createElement("canvas"); V.sk.width = 64; V.sk.height = 64; V.sil = document.createElement("canvas"); V.sil.width = 64; V.sil.height = 64; }
  const sg = V.sk.getContext("2d"); sg.clearRect(0, 0, 64, 64);
  skater(sg, 32, 46, st, V, opts.look || {});
  const lg = V.sil.getContext("2d"); lg.globalCompositeOperation = "source-over"; lg.clearRect(0, 0, 64, 64); lg.drawImage(V.sk, 0, 0); lg.globalCompositeOperation = "source-in"; lg.fillStyle = "#0b0b12"; lg.fillRect(0, 0, 64, 64);
  const qx = Math.round(px) - 32, qy = Math.round(py) - 46;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.drawImage(V.sil, qx + dx, qy + dy);
  ctx.drawImage(V.sk, qx, qy);
  // anything standing in front of the skater, drawn again over them
  for (const sp of V.sprites) {
    const o = sp.o, top = o.k === "qp" ? o.H : o.k === "slope" ? Math.max(o.z0, o.z1) : o.z;
    if (st.z >= top - 0.05) continue;
    const inside = st.x >= o.x0 && st.x <= o.x1 && st.y >= o.y0 && st.y <= o.y1;
    if (inside) continue;
    if (st.x < o.x1 && st.y < o.y1 && (st.x < o.x0 || st.y < o.y0)) ctx.drawImage(sp.c, sp.x - cx, sp.y - cy);
  }
  for (const p of V.parts) R(ctx, p.x - cx, p.y - cy, 1, 1, p.c);
  hud(ctx, W, H, st, V, px, py, opts);
}
function groundZ(L, x, y) {
  let h = 0;
  for (const o of L.objs) {
    if (x < o.x0 || x > o.x1 || y < o.y0 || y > o.y1) continue;
    let z = 0;
    if (o.k === "box") z = o.z;
    else { const f = o.f, span = f.ax === "x" ? o.x1 - o.x0 : o.y1 - o.y0, p = f.ax === "x" ? x : y, t = f.sgn > 0 ? (p - f.foot) / span : (f.foot - p) / span; z = o.k === "qp" ? o.H * t * t : o.z0 + (o.z1 - o.z0) * t; }
    h = Math.max(h, z);
  }
  return h;
}
function itemShadow(ctx, S, L, it) { const [x, y] = S(it.x, it.y, groundZ(L, it.x, it.y)); ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x - 3, y - 1, 6, 2); }
function letter(ctx, x, y, c) {
  R(ctx, x - 5, y - 12, 11, 11, "#7c2d12"); R(ctx, x - 4, y - 13, 11, 11, "#f97316"); R(ctx, x - 3, y - 12, 9, 9, "#fdba74");
  drawText(ctx, c, x - 1, y - 11, "#431407");
}
function tape(ctx, x, y, t) {
  R(ctx, x - 7, y - 11, 14, 9, "#111827"); R(ctx, x - 6, y - 10, 12, 4, "#e5e7eb"); R(ctx, x - 4, y - 5, 3, 2, "#6b7280"); R(ctx, x + 1, y - 5, 3, 2, "#6b7280");
  if ((t * 3) % 1 < 0.5) R(ctx, x - 9, y - 14, 1, 1, "#fef08a"), R(ctx, x + 8, y - 4, 1, 1, "#fef08a");
}
function skyline(ctx, W, H, V) {
  const off = V.cam ? -V.cam[0] * 0.08 : 0, base = Math.round(H * 0.36 - (V.cam ? V.cam[1] * 0.03 : 0));
  for (let i = -2; i < 22; i++) {
    const x = Math.round(((i * 37 + off) % (W + 80) + W + 80) % (W + 80) - 40), bw = 14 + Math.floor(hash(i, 3) * 18), bh = 18 + Math.floor(hash(i, 4) * 44) + (i === 7 ? 40 : 0);
    R(ctx, x, base - bh, bw, bh + H, i === 7 ? "#1f2937" : "#111827");
    for (let wy = base - bh + 4; wy < base - 2; wy += 5) for (let wx = x + 2; wx < x + bw - 2; wx += 4) if (hash(wx * 3 + i, wy) > 0.72) R(ctx, wx, wy, 1, 2, "#fcd34d");
    if (i === 7) { R(ctx, x + bw / 2 - 1, base - bh - 10, 2, 10, "#9ca3af"); R(ctx, x + bw / 2 - 1, base - bh - 11, 2, 1, (V.t * 2) % 1 < 0.5 ? "#ef4444" : "#7f1d1d"); }
  }
}

// ---- the skater -------------------------------------------------------------------------------------------------------
// The city figure's head on the standard skate outfit (a tee, cargo trousers, skate shoes). Poses: ride,
// push, crouch, air, flip, grab, grind, manual, lip, bail. The board points the way it really points (the
// heading plus the spin in the air), in the iso view; the body faces left or right on the screen.
function skater(ctx, x, y, st, V, look) {
  const shirt = look.shirt || "#dc2626", pants = look.pants || "#1e3a8a", skin = look.skin || "#c68c5e", hair = look.hair || "#3b2414", shoe = "#f8fafc", deck = look.deck || "#facc15";
  const spin = st.st === "air" ? st.face : 0;
  let [hx, hy] = headVec(st.h + spin);
  if (st.fakie) { hx = -hx; hy = -hy; }
  let bx = (hx - hy) * 5.5, by = (hx + hy) * 2.75;           // half the board, on the screen
  const fr = (hx - hy) >= 0 ? 1 : -1;                        // the body faces screen-right or screen-left
  let crouch = 0.15, armL = [-5, -12], armR = [5, -12], lean = 0, liftBoard = 0, flipK = null, upside = false, lying = false, tilt = 0, legSpread = 3, push = 0;
  const T = st.tr;
  if (st.st === "ground") {
    if (st.charge > 0) crouch = 0.2 + (st.charge / 30) * 0.65;
    const sp = Math.sqrt(st.vx * st.vx + st.vy * st.vy);
    if ((st.pw & 1) && sp < 0.128 && st.o < 0) push = Math.sin(V.t * 10) * 0.5 + 0.5;
    armL = [-6, -11]; armR = [6, -11];
  } else if (st.st === "manual") { tilt = st.m.k === 2 ? -1 : 1; lean = st.m.k === 2 ? 2 : -2; armL = [-8, -15]; armR = [8, -14]; crouch = 0.25; }
  else if (st.st === "air") {
    crouch = 0.45; armL = [-6, -18]; armR = [7, -17];
    if (T && T.k === "flip" && !T.done) { flipK = T.t / T.dur; crouch = 0.55; armL = [-7, -14]; armR = [7, -14]; }
    if (T && T.k === "grab" && !T.done) { const k = T.rel ? Math.max(0, 1 - (T.t - T.rel) / 5) : Math.min(1, T.t / 4); crouch = 0.45 + 0.5 * k; liftBoard = 5 * k; armR = [3 + 2 * fr, -6 + 2 * k]; armL = [-8, -17]; }
  } else if (st.st === "grind") { crouch = 0.3; armL = [-9, -14]; armR = [9, -13]; lean = Math.round((st.g?.b || 0) * 3); }
  else if (st.st === "lip") { const name = LIPS[st.lip.k][0]; upside = /INVERT|PLANT/.test(name); crouch = 0.4; lean = Math.round(st.lip.b * 3); }
  else if (st.st === "bail") lying = true;
  if (lying) { bail(ctx, x, y, st, { shirt, pants, skin, hair, shoe, deck }, look, V); return; }
  if (upside) { invert(ctx, x, y, { shirt, pants, skin, hair, shoe, deck }, look, lean, fr); return; }
  // the board
  const by0 = y - liftBoard;
  if (flipK !== null) {
    const kind = FLIPS[T.d][0], a = flipK * Math.PI * 2 * (/360|IMPOSSIBLE/.test(kind) ? 1 : 1);
    const sw = /SHOVE|VARIAL|360 FLIP/.test(kind) ? Math.cos(flipK * Math.PI * (/360/.test(kind) ? 2 : 1)) : 1;
    const ex = bx * sw, ey = by * sw, th = Math.abs(Math.sin(a)) * 3;
    line(ctx, x - ex, by0 - 3 - ey - th, x + ex, by0 - 3 + ey + th, Math.cos(a) > 0 ? "#111827" : deck, 2);
  } else {
    const t1 = tilt * 2;
    line(ctx, x - bx, by0 - by - (tilt > 0 ? 0 : -t1), x + bx, by0 + by - (tilt > 0 ? t1 : 0), "#111827", 2);
    line(ctx, x - bx, by0 - by + 1, x + bx, by0 + by + 1, deck, 1);
    R(ctx, x - bx * 0.7 - 1, by0 - by * 0.7 + 1, 2, 2, "#e5e7eb"); R(ctx, x + bx * 0.7 - 1, by0 + by * 0.7 + 1, 2, 2, "#e5e7eb");
  }
  // the body
  const hipY = y - 8 - liftBoard * 0.4 + Math.round(crouch * 4), shY = hipY - 7 + Math.round(crouch * 1), hx0 = x + lean;
  const fa = [x - legSpread * fr - push * 4 * fr, by0 - 2 - (push ? push * 2 : 0)], fb = [x + legSpread * fr, by0 - 2];
  const knee = (f, k) => [(f[0] + hx0) / 2 + fr * crouch * 4 * k, (f[1] + hipY) / 2 - crouch * 2];
  const k1 = knee(fa, 1), k2 = knee(fb, 1);
  line(ctx, fa[0], fa[1], k1[0], k1[1], pants, 2); line(ctx, k1[0], k1[1], hx0 - 1, hipY, pants, 2);
  line(ctx, fb[0], fb[1], k2[0], k2[1], shade(pants, 0.8), 2); line(ctx, k2[0], k2[1], hx0 + 1, hipY, shade(pants, 0.8), 2);
  R(ctx, fa[0] - 1, fa[1] - 1, 3, 2, shoe); R(ctx, fb[0] - 1, fb[1] - 1, 3, 2, shoe);
  R(ctx, hx0 - 3, shY, 6, hipY - shY + 1, shirt); R(ctx, hx0 - 3, shY, 6, 1, shade(shirt, 1.2)); R(ctx, hx0 - 3, hipY - 1, 6, 1, shade(shirt, 0.7));
  R(ctx, hx0 - 3, shY + 3, 6, 1, shade(shirt, 0.72)); R(ctx, hx0 - 3 - (fr < 0 ? 1 : 0), shY + 1, 1, 3, shade(shirt, 0.85)); R(ctx, hx0 + 2 + (fr > 0 ? 1 : 0), shY + 1, 1, 3, shade(shirt, 0.85));
  line(ctx, hx0 - 2 * fr, shY + 1, hx0 + armL[0] * fr * 0.8, hipY + armL[1] + 8, skin, 1);
  line(ctx, hx0 + 2 * fr, shY + 1, hx0 + armR[0] * fr * 0.8, hipY + armR[1] + 8, skin, 1);
  head(ctx, hx0, shY, fr, { skin, hair }, look, V);
}
function head(ctx, x, shY, fr, c, look, V) {
  const hd = look.head ? shrinkHead(look.head, 8) : null;
  if (hd) { ctx.save(); if (fr < 0) { ctx.translate(Math.round(x) * 2, 0); ctx.scale(-1, 1); } ctx.drawImage(hd, Math.round(x - hd.width / 2), Math.round(shY - hd.height)); ctx.restore(); return; }
  R(ctx, x - 3, shY - 7, 6, 7, c.skin); R(ctx, x - 3, shY - 8, 6, 3, c.hair); R(ctx, x + (fr > 0 ? 1 : -2), shY - 5, 1, 1, "#111827");
}
function invert(ctx, x, y, c, look, lean, fr) {
  // a hand on the coping, the body straight up over it, the board held to the feet
  R(ctx, x - 1, y - 4, 2, 4, c.skin);
  R(ctx, x - 3 + lean, y - 11, 6, 7, c.shirt);
  line(ctx, x - 1 + lean, y - 11, x - 2 + lean, y - 19, c.pants, 2); line(ctx, x + 1 + lean, y - 11, x + 2 + lean, y - 19, shade(c.pants, 0.8), 2);
  line(ctx, x - 6 + lean, y - 21, x + 6 + lean, y - 21, "#111827", 2); line(ctx, x - 6 + lean, y - 22, x + 6 + lean, y - 22, c.deck, 1);
  const hd = look.head ? shrinkHead(look.head, 8) : null;
  if (hd) { ctx.save(); ctx.translate(0, Math.round(y - 4) * 2); ctx.scale(1, -1); ctx.drawImage(hd, Math.round(x + fr * 3 - hd.width / 2), Math.round(y - 4 - hd.height)); ctx.restore(); }
  else { R(ctx, x + fr * 3 - 3, y - 4, 6, 6, c.skin); R(ctx, x + fr * 3 - 3, y + 1, 6, 2, c.hair); }
}
function bail(ctx, x, y, st, c, look, V) {
  const k = 1 - st.bailT / 75, roll = st.bailT > 55;
  // the board, gone on ahead
  const off = Math.min(14, (1 - st.bailT / 75) * 40);
  line(ctx, x + off - 5, y - 1, x + off + 5, y + 1, "#111827", 2); line(ctx, x + off - 5, y - 2, x + off + 5, y, c.deck, 1);
  if (roll) {   // tumbling
    const a = (75 - st.bailT) * 0.6;
    for (let i = 0; i < 4; i++) { const r = 2 + i * 2.2; R(ctx, x + Math.cos(a + i) * r - 1, y - 6 + Math.sin(a + i) * r - 1, 3, 3, i < 2 ? c.shirt : c.pants); }
    R(ctx, x + Math.cos(a - 1.4) * 6 - 2, y - 6 + Math.sin(a - 1.4) * 6 - 2, 5, 5, c.skin);
    return;
  }
  const up = st.bailT < 14 ? (14 - st.bailT) / 14 : 0;
  R(ctx, x - 8, y - 3 - up * 6, 7, 3, c.pants); R(ctx, x - 1, y - 4 - up * 8, 7, 4, c.shirt);
  const hd = look.head ? shrinkHead(look.head, 7) : null;
  if (hd) ctx.drawImage(hd, Math.round(x + 6), Math.round(y - 7 - up * 10));
  else R(ctx, x + 6, y - 6 - up * 10, 5, 5, c.skin);
  if (k < 0.7 && (V.t * 6) % 1 < 0.5) { R(ctx, x + 2, y - 14, 1, 1, "#fde047"); R(ctx, x + 6, y - 15, 1, 1, "#fde047"); R(ctx, x + 10, y - 13, 1, 1, "#fde047"); }
}

// ---- the HUD (in the picture, in the 5x7 font) -----------------------------------------------------------------------
const OUT = (ctx, s, x, y, col, sc = 1) => { drawText(ctx, s, x + sc, y + sc, "#0b0b12", sc); drawText(ctx, s, x, y, col, sc); };
function hud(ctx, W, H, st, V, px, py, opts) {
  const L = V.L;
  // the score, top left; the clock (or FREE SKATE), top right
  OUT(ctx, comma(st.score), 4, 4, "#f8fafc", W >= 300 ? 2 : 1);
  if (st.end) {
    const left = Math.max(0, st.end - st.t), s = Math.ceil(left / 60), txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    const sc = W >= 300 ? 2 : 1;
    OUT(ctx, left === 0 ? "TIME!" : txt, W - 4 - textWidth(left === 0 ? "TIME!" : txt, sc), 4, left < 600 && (V.t * 2) % 1 < 0.5 ? "#f87171" : "#f8fafc", sc);
  } else OUT(ctx, "FREE SKATE", W - 4 - textWidth("FREE SKATE"), 4, "#a5f3fc");
  // the letters and the tape
  const ly = W >= 300 ? 22 : 14;
  LETTERS.forEach((c, i) => { const got = st.letters & (1 << i); R(ctx, 4 + i * 9, ly, 8, 9, got ? "#f97316" : "rgba(15,23,42,0.6)"); drawText(ctx, c, 5 + i * 9, ly + 1, got ? "#431407" : "#64748b"); });
  R(ctx, 4 + 5 * 9 + 2, ly, 10, 9, st.tape ? "#e5e7eb" : "rgba(15,23,42,0.6)"); R(ctx, 4 + 5 * 9 + 4, ly + 5, 2, 2, st.tape ? "#111827" : "#475569"); R(ctx, 4 + 5 * 9 + 8, ly + 5, 2, 2, st.tape ? "#111827" : "#475569");
  // the combo, at the foot of the picture: the tricks, then BASE X MULT
  const C = st.combo;
  if (C) {
    const names = C.names.slice(-3).join(" + ");
    const shown = (C.names.length > 3 ? "... " : "") + names;
    const fit = shown.length * 6 > W - 8 ? "..." + shown.slice(-Math.floor((W - 26) / 6)) : shown;
    OUT(ctx, fit, Math.round(W / 2 - textWidth(fit) / 2), H - 30, "#fde68a");
    const line2 = `${comma(C.base)} X ${C.mult}`;
    OUT(ctx, line2, Math.round(W / 2 - textWidth(line2, 2) / 2), H - 20, "#fef08a", 2);
  }
  // the balance meter: across over the head (grind, lip), up and down beside you (manual)
  const B = st.st === "grind" ? st.g : st.st === "lip" ? st.lip : st.st === "manual" ? st.m : null;
  if (B) {
    const b = Math.max(-1, Math.min(1, B.b)), hot = Math.abs(b) > 0.7;
    if (st.st === "manual") {
      const x0 = Math.round(px + 12), y0 = Math.round(py - 34);
      R(ctx, x0 - 1, y0 - 1, 6, 30, "#0b0b12"); R(ctx, x0, y0, 4, 28, "#334155"); R(ctx, x0, y0 + 11, 4, 6, "#16a34a");
      R(ctx, x0 - 2, y0 + 13 + Math.round(b * 13), 8, 2, hot ? "#ef4444" : "#f8fafc");
    } else {
      const x0 = Math.round(px - 20), y0 = Math.round(py - 36);
      R(ctx, x0 - 1, y0 - 1, 42, 6, "#0b0b12"); R(ctx, x0, y0, 40, 4, "#334155"); R(ctx, x0 + 16, y0, 8, 4, "#16a34a");
      R(ctx, x0 + 19 + Math.round(b * 19), y0 - 2, 2, 8, hot ? "#ef4444" : "#f8fafc");
    }
  }
  // the charge (holding A)
  if (st.charge > 3 && (st.st === "ground" || st.st === "grind")) { const k = st.charge / 30; R(ctx, px - 8, py + 4, 16, 2, "#0b0b12"); R(ctx, px - 8, py + 4, Math.round(16 * k), 2, k >= 1 ? "#fde047" : "#38bdf8"); }
  // the pops
  let k = 0;
  for (const p of V.pops) {
    const col = p.kind === "bail" ? "#f87171" : p.kind === "goal" ? "#86efac" : p.kind === "letter" ? "#fdba74" : p.kind === "bank" ? "#fde047" : "#e2e8f0";
    const sc = p.kind === "bank" || p.kind === "bail" ? 2 : 1;
    const rise = Math.round((1 - p.life / p.max) * 8);
    const y = Math.round(H * 0.28) + k * (sc * 9 + 3) - rise;
    if (p.kind === "goal") { const w = textWidth(p.text) + 8; R(ctx, W / 2 - w / 2, y - 2, w, 11, "rgba(5,46,22,0.85)"); }
    OUT(ctx, p.text, Math.round(W / 2 - textWidth(p.text, sc) / 2), y, col, sc);
    k++;
  }
  if (opts.banner) { const s = opts.banner, w = textWidth(s, 2) + 12; R(ctx, W / 2 - w / 2, H / 2 - 14, w, 22, "rgba(2,6,23,0.8)"); OUT(ctx, s, Math.round(W / 2 - textWidth(s, 2) / 2), H / 2 - 10, "#fde68a", 2); }
  if (opts.replay && (V.t * 1.5) % 1 < 0.7) OUT(ctx, "REPLAY", 4, H - 12, "#f87171");
}
