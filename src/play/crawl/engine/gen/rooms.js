// Room templates as cell masks: {cells: [[x, y]...], w, h, feature?: [x, y]}. A template's holes
// (the cage in the ring, the shelving) stay walls. Drawn from the gen stream only.
import { drawInt, draw } from "../rng.js";

const rect = (w, h, ox = 0, oy = 0) => { const c = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) c.push([x + ox, y + oy]); return c; };
function mask(cells, feature = null) {
  const seen = new Set(), out = [];
  let w = 0, h = 0;
  for (const [x, y] of cells) { const k = y * 64 + x; if (seen.has(k)) continue; seen.add(k); out.push([x, y]); if (x + 1 > w) w = x + 1; if (y + 1 > h) h = y + 1; }
  return { cells: out, w, h, feature, set: seen };
}
export const hasCell = (m, x, y) => x >= 0 && y >= 0 && m.set.has(y * 64 + x);

export const TEMPLATES = {
  "lift-lobby": () => mask(rect(6, 5), [3, 2]),
  "stairwell": (r) => { const w = drawInt(r, 4, 5), h = drawInt(r, 4, 5); return mask(rect(w, h), [w >> 1, h >> 1]); },
  "storeroom": (r) => mask(rect(drawInt(r, 4, 8), drawInt(r, 3, 6))),
  "offices": (r) => {
    const aw = drawInt(r, 4, 6), ah = drawInt(r, 3, 5), bw = drawInt(r, 4, 6), bh = drawInt(r, 3, 5);
    const dx = drawInt(r, 2, aw - 1), dy = drawInt(r, 1, ah - 1);
    return mask(rect(aw, ah).concat(rect(bw, bh, dx, dy)));
  },
  "shelving": (r) => {
    const w = drawInt(r, 7, 9), h = drawInt(r, 5, 7), sy = h >> 1, gap = drawInt(r, 3, w - 4);
    return mask(rect(w, h).filter(([x, y]) => !(y === sy && x >= 2 && x <= w - 3 && x !== gap)));
  },
  "ring": (r) => { const w = drawInt(r, 7, 8), h = 7; return mask(rect(w, h).filter(([x, y]) => !(x >= 2 && x <= w - 3 && y >= 2 && y <= 4))); },
  "hall": (r) => {
    const w = drawInt(r, 10, 13), sx = drawInt(r, 2, w - 3), len = drawInt(r, 3, 4), down = draw(r) < 0.5;
    const hall = rect(w, 3, 0, down ? 0 : len), stub = []; for (let k = 0; k < len; k++) stub.push([sx, down ? 3 + k : k]);
    return mask(hall.concat(stub));
  },
};
