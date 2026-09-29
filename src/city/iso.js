// The Substrate as SimCity sees it: an isometric (2:1 dimetric) projection of the sim's
// map cells, turned in 90-degree steps. Pure: no DOM, testable in node.
//
// Frames: map cells (x, y) from sim.js -> rotated cells (u, v) for the current quarter
// turn -> screen pixels. Nearer to the viewer = larger u + v = lower on screen, so the
// painter draws in ascending depth.

import { DISTRICTS } from "./sim.js";

export const MARGIN = 3;
export const BOUNDS = (() => {
  const xs = DISTRICTS.flatMap(d => [d.rect.x, d.rect.x + d.rect.w]);
  const ys = DISTRICTS.flatMap(d => [d.rect.y, d.rect.y + d.rect.h]);
  return { x0: Math.min(...xs) - MARGIN, y0: Math.min(...ys) - MARGIN, x1: Math.max(...xs) + MARGIN, y1: Math.max(...ys) + MARGIN };
})();
export const CX = (BOUNDS.x0 + BOUNDS.x1) / 2, CY = (BOUNDS.y0 + BOUNDS.y1) / 2;

// One storey is this many cells of screen rise (in cell units, scaled by zoom).
export const STOREY = 2.1;
// The Loop's deck height, in storeys.
export const DECK = 1.5;

export const mod4 = (r) => ((r % 4) + 4) % 4;

// Map cell -> rotated cell, about the city's centre. r = quarter turns clockwise.
export function rot(x, y, r) {
  const dx = x - CX, dy = y - CY;
  switch (mod4(r)) {
    case 0: return [CX + dx, CY + dy];
    case 1: return [CX - dy, CY + dx];
    case 2: return [CX - dx, CY - dy];
    default: return [CX + dy, CY - dx];
  }
}
export function unrot(u, v, r) { return rot(u, v, 4 - mod4(r)); }

// An axis-aligned map rect stays axis-aligned under quarter turns.
export function rotRect(rect, r) {
  const [a, b] = rot(rect.x, rect.y, r), [c, d] = rot(rect.x + rect.w, rect.y + rect.h, r);
  return { x0: Math.min(a, c), y0: Math.min(b, d), x1: Math.max(a, c), y1: Math.max(b, d) };
}

// cam = { z: px per cell, ox, oy: screen offset of rotated cell (0,0), r }
export function project(u, v, h, cam) {
  return [(u - v) * cam.z + cam.ox, (u + v) * cam.z * 0.5 - h * STOREY * cam.z + cam.oy];
}
// Screen -> rotated cell on the ground plane (h = 0).
export function unproject(sx, sy, cam) {
  const a = (sx - cam.ox) / cam.z, b = (sy - cam.oy) / (cam.z * 0.5);
  return [(a + b) / 2, (b - a) / 2];
}
// Screen -> map cell on the ground.
export function screenToMap(sx, sy, cam) { const [u, v] = unproject(sx, sy, cam); return unrot(u, v, cam.r); }

// Screen extent of the whole city at zoom 1 (for fitting), for rotation r.
export function cityExtent(r) {
  const R = rotRect({ x: BOUNDS.x0, y: BOUNDS.y0, w: BOUNDS.x1 - BOUNDS.x0, h: BOUNDS.y1 - BOUNDS.y0 }, r);
  const pts = [[R.x0, R.y0], [R.x1, R.y0], [R.x1, R.y1], [R.x0, R.y1]].map(([u, v]) => [u - v, (u + v) / 2]);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys) - 6 * STOREY, y1: Math.max(...ys) };
}

// Level of detail by zoom (px per map cell). Far: silhouettes and lit windows as dots.
// Mid: window grids and roofs. Near: signs, doors, people as sprites.
export const LOD_MID = 4, LOD_NEAR = 9;
export const lodFor = (z) => (z < LOD_MID ? "far" : z < LOD_NEAR ? "mid" : "near");

// Painter's order for boxes with disjoint footprints (in rotated cells): A is behind B if
// A ends before B starts on either axis. Topological sort; ties by centre depth.
// boxes: [{ x0, y0, x1, y1, ... }] -> array of indices, back to front.
export function depthOrder(boxes, eps = 1e-6) {
  const n = boxes.length;
  const behind = (a, b) => a.x1 <= b.x0 + eps || a.y1 <= b.y0 + eps;
  const indeg = new Array(n).fill(0), out = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i === j) continue;
    const a = boxes[i], b = boxes[j];
    // Only order pairs whose screen shadows can overlap: disjoint in one axis, not both behind each other.
    if (behind(a, b) && !behind(b, a)) { out[i].push(j); indeg[j]++; }
  }
  const key = (i) => (boxes[i].x0 + boxes[i].x1 + boxes[i].y0 + boxes[i].y1) / 2;
  const ready = [];
  for (let i = 0; i < n; i++) if (!indeg[i]) ready.push(i);
  const order = [];
  while (ready.length) {
    ready.sort((a, b) => key(b) - key(a));
    const i = ready.pop();
    order.push(i);
    for (const j of out[i]) if (--indeg[j] === 0) ready.push(j);
  }
  // A cycle (only possible with overlapping footprints) falls back to centre depth.
  if (order.length < n) {
    const seen = new Set(order);
    const rest = [...Array(n).keys()].filter(i => !seen.has(i)).sort((a, b) => key(a) - key(b));
    order.push(...rest);
  }
  return order;
}

// Where a point (a person, a lamp) slots into a back-to-front box order: after the last
// box that is behind it and not in front of it. Returns an index into `order` (-1 = first).
export function slotFor(u, v, boxes, order) {
  let slot = -1;
  for (let k = 0; k < order.length; k++) {
    const b = boxes[order[k]];
    const boxBehind = b.x1 <= u || b.y1 <= v;
    const boxFront = u <= b.x0 || v <= b.y0;
    if (boxBehind && !boxFront) slot = k;
  }
  return slot;
}

// The same for a box at height h (a train car, a person as a point box): a deck it stands
// on (an item with deck: true whose footprint it overlaps, at or above its top) counts as
// behind it, so a car is painted after every piece of track under it and still before any
// building in front of it.
export function slotForBox(B, h, boxes, order) {
  let slot = -1;
  for (let k = 0; k < order.length; k++) {
    const b = boxes[order[k]];
    const behind = b.x1 <= B.x0 || b.y1 <= B.y0;
    const front = B.x1 <= b.x0 || B.y1 <= b.y0;
    const under = b.deck && h >= b.top && b.x0 <= B.x1 && B.x0 <= b.x1 && b.y0 <= B.y1 && B.y0 <= b.y1;
    if ((behind && !front) || under) slot = k;
  }
  return slot;
}

// The screen silhouette of a box (a hexagon), for hit-testing a tap.
export function boxHull(R, h, cam) {
  const P = (u, v, z) => project(u, v, z, cam);
  return [P(R.x0, R.y0, h), P(R.x1, R.y0, h), P(R.x1, R.y0, 0), P(R.x1, R.y1, 0), P(R.x0, R.y1, 0), P(R.x0, R.y1, h)];
}
export function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
