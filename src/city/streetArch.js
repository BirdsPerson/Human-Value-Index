// The city's drawing kit, seen from the street. archDraw.js (buildings), parkDraw.js (the
// grounds) and CityIso.jsx all draw through a small kit G = {ctx, Q, poly, prism, wall,
// facing, z, r, ...} where Q(x, y, h) turns a map point at h storeys into a screen point.
// Here Q is the STREET camera's perspective instead of the iso projection, so the same
// drawers paint the same facades, windows, signs and fields at street level. No DOM beyond
// the canvas context it is handed; scripts/check-street.mjs checks the rules below in node.
//
// What changes from iso to perspective, and how the kit absorbs it:
// - Which faces show: facing() asks the camera (the outward side of a wall), not the quarter.
// - The painter's order inside a building (archGeo.partOrder, the slopes of a roof, the teeth
//   of a saw roof) is decided by archDraw from G.r as "nearer = larger u + v". quarterFor()
//   picks, per building, the quarter turn that puts the camera at +u+v, so it holds.
// - Scale: iso z is px per cell everywhere; in perspective it is focal / depth. G.z reads the
//   depth of the last point Q projected, so a figure, a tree or a player drawn at its own
//   point (Q first, then z) comes out at its own size.
// - Tops: from below, a roof is hidden behind its walls. poly() drops an upward-facing
//   surface the eye is under (a flat roof, a slope turned away), unless it is thin (a
//   balcony slab or a canopy, whose underside would show in the same place).
// - Behind the camera: Q clamps depth to the near plane; a face wholly behind it is hidden.

import { STOREY } from "./iso.js";
import { NEAR } from "./streetKit.js";

export const SH = STOREY;   // one storey, in cells: the iso view's own proportion

// The quarter turn r (archDraw's G.r) that puts a viewer offset (dx, dy) from a point at +u+v.
export function quarterFor(dx, dy) {
  const c = [dx + dy, dx - dy, -dx - dy, dy - dx];
  let best = 0;
  for (let i = 1; i < 4; i++) if (c[i] > c[best]) best = i;
  return best;
}

// Light from the south, a touch east: the iso view's lit fronts (south 1.0) and darker sides.
export const faceShade = (nx, ny) => 0.8 + 0.2 * ny + 0.06 * nx;

const shadeCache = new Map();
export function shade(hex, f) {
  const k = hex + "|" + Math.round(f * 50);
  let v = shadeCache.get(k);
  if (v) return v;
  const n = parseInt(hex.slice(1), 16), c = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  v = `rgb(${c(16)},${c(8)},${c(0)})`;
  shadeCache.set(k, v);
  return v;
}

// Should an up-facing surface through world points pts ([.., .., x, y, z]) be drawn from
// eye (ex, ey, ez)? Walls (mostly vertical) always pass; the caller culls them by facing.
export function topVisible(pts, ex, ey, ez) {
  const n = pts.length;
  if (n < 3 || pts[0].length < 5) return true;
  let nx = 0, ny = 0, nz = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    nx += (a[3] - b[3]) * (a[4] + b[4]);
    ny += (a[4] - b[4]) * (a[2] + b[2]);
    nz += (a[2] - b[2]) * (a[3] + b[3]);
    if (a[2] < x0) x0 = a[2]; if (a[2] > x1) x1 = a[2]; if (a[3] < y0) y0 = a[3]; if (a[3] > y1) y1 = a[3];
  }
  const L = Math.hypot(nx, ny, nz);
  if (L < 1e-9 || Math.abs(nz) < 0.35 * L) return true;
  if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
  const p = pts[0];
  if ((ex - p[2]) * nx + (ey - p[3]) * ny + (ez - p[4]) * nz > 0) return true;
  return Math.min(x1 - x0, y1 - y0) < 0.8;   // thin: a slab's underside shows where its top would
}

// The kit. cam: {x, y, yaw, h (cells)}; view: {w, h, focal, horizon}.
export function streetKitG(ctx, cam, view, o = {}) {
  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw), F = view.focal, X0 = view.w / 2, HZ = view.horizon;
  let lastF = 10;
  const depth = (x, y) => (x - cam.x) * sy - (y - cam.y) * cy;
  function Q(x, y, h) {
    const dx = x - cam.x, dy = y - cam.y, z = h * SH;
    let f = dx * sy - dy * cy;
    if (f < NEAR) f = NEAR;
    lastF = f;
    const s = dx * cy + dy * sy;
    return [X0 + (s / f) * F, HZ - ((z - cam.h) / f) * F, x, y, z];
  }
  function poly(pts, fill, stroke) {
    if (!topVisible(pts, cam.x, cam.y, cam.h)) return;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  // The outward normal of map edge a -> b (away from `inside`) -> a shade, or 0 when hidden.
  function facing(a, b, inside) {
    let nx = b[1] - a[1], ny = -(b[0] - a[0]);
    if (nx * (inside[0] - a[0]) + ny * (inside[1] - a[1]) > 0) { nx = -nx; ny = -ny; }
    const L = Math.hypot(nx, ny) || 1;
    nx /= L; ny /= L;
    if ((cam.x - a[0]) * nx + (cam.y - a[1]) * ny <= 1e-6) return 0;
    if (depth(a[0], a[1]) < NEAR && depth(b[0], b[1]) < NEAR) return 0;
    return faceShade(nx, ny);
  }
  function wall(a, b, inside, h0, h1, base) {
    const f = facing(a, b, inside);
    if (f) poly([Q(a[0], a[1], h1), Q(b[0], b[1], h1), Q(b[0], b[1], h0), Q(a[0], a[1], h0)], shade(base, f));
    return f;
  }
  function prism(foot, h0, h1, base, topF = 1.4, alpha = 1) {
    let cx = 0, cy2 = 0;
    for (const p of foot) { cx += p[0]; cy2 += p[1]; }
    const c = [cx / foot.length, cy2 / foot.length];
    if (alpha < 1) ctx.globalAlpha *= alpha;
    for (let i = 0; i < foot.length; i++) wall(foot[i], foot[(i + 1) % foot.length], c, h0, h1, base);
    poly(foot.map(p => Q(p[0], p[1], h1)), shade(base, topF));
    if (alpha < 1) ctx.globalAlpha /= alpha;
  }
  const G = {
    ctx, Q, poly, prism, wall, facing, depth, r: 0, t: o.t || 0, hits: o.hits || [], w: view.w, h: view.h,
    // px per cell at the depth of the last point projected (see the header)
    get z() { return Math.min(260, F / Math.max(0.6, lastF)); },
    // aim the kit at a thing standing at (x, y): its quarter turn, and its scale
    aim(x, y) { G.r = quarterFor(cam.x - x, cam.y - y); Q(x, y, 0); return G; },
  };
  return G;
}
