// The fish, drawn pixel by pixel from each species' art (data.js): no image files. One painter for
// the water, the catch card, the aquarium's tanks and the mounted fish. (x, y) is the fish's middle;
// len its length in pixels; dir 1 faces right; phase wiggles the tail (0 holds it still, for a
// reduced-motion viewer or a mount); silhouette paints it one flat colour (a tank not yet filled).
import { SPECIES_BY } from "./data.js";

const px = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };

// half-height of the body at t (0 tail end .. 1 nose), 0..1
function profile(shape, t) {
  if (shape === "pan") return t < 0.12 ? 0.35 + t * 2 : Math.max(0, Math.sqrt(Math.max(0, 1 - ((t - 0.5) / 0.52) ** 2)));
  if (shape === "long") return t < 0.1 ? 0.45 + t * 3 : Math.min(1, 0.75 + t * 0.4) * (t > 0.9 ? (1 - t) * 8 : 1);
  if (shape === "flat") return Math.max(0, Math.sqrt(Math.max(0, 1 - ((t - 0.5) / 0.5) ** 2)));
  // "fish": a peduncle at the back, deepest a third from the nose, a pointed snout
  if (t < 0.14) return 0.32 + t * 1.2;
  if (t > 0.86) return Math.max(0.15, (1 - t) * 6);
  const u = (t - 0.14) / 0.72;
  return 0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, u * 1.15));
}

export function drawFish(c, spId, x, y, len, dir = 1, phase = 0, { silhouette = null } = {}) {
  const s = SPECIES_BY[spId];
  if (!s) return;
  const a = s.art, L = Math.max(6, Math.round(len));
  const col = (k) => silhouette || a[k] || a.body;
  if (a.shape === "crab") return crab(c, a, x, y, L, phase, silhouette);
  if (a.shape === "eel") return eel(c, a, x, y, L, dir, phase, silhouette);
  const H = Math.max(3, Math.round(L * a.h));
  const tail = Math.max(3, Math.round(L * 0.16)), body = L - tail;
  const x0 = Math.round(x - L / 2);
  const wag = phase ? Math.round(Math.sin(phase) * Math.max(1, H * 0.12)) : 0;
  const X = (i) => (dir > 0 ? x0 + i : x0 + L - 1 - i);   // i counts from the tail
  // the tail fan
  for (let i = 0; i < tail; i++) {
    const spread = Math.round((H / 2) * (1 - i / tail) * (a.fork ? 1.1 : 0.9)) + 1;
    const cy = Math.round(y) + Math.round(wag * (1 - i / tail));
    if (a.fork && i < tail * 0.45) { px(c, X(i), cy - spread, 1, Math.max(1, Math.round(spread * 0.6)), col("fin")); px(c, X(i), cy + spread - Math.max(1, Math.round(spread * 0.6)) + 1, 1, Math.max(1, Math.round(spread * 0.6)), col("fin")); }
    else px(c, X(i), cy - spread, 1, spread * 2 + 1, col("fin"));
  }
  // the body, column by column: back, flank, belly
  for (let i = 0; i < body; i++) {
    const t = i / body, hh = Math.max(1, Math.round((H / 2) * profile(a.shape, t)));
    const xx = X(tail + i), top = Math.round(y) - hh, tot = hh * 2 + 1;
    const backH = Math.max(1, Math.round(tot * (a.shape === "flat" ? 0.7 : 0.38))), bellyH = Math.max(1, Math.round(tot * (a.shape === "flat" ? 0.12 : 0.28)));
    px(c, xx, top, 1, tot, col("body"));
    px(c, xx, top, 1, backH, col("back"));
    px(c, xx, top + tot - bellyH, 1, bellyH, col("belly"));
    if (silhouette) continue;
    // markings
    if (a.pattern === "stripes") for (let k = 1; k <= 3; k++) { const yy = top + Math.round((tot * k) / 4.5); if (yy < top + tot - bellyH) px(c, xx, yy, 1, 1, a.mark); }
    if (a.pattern === "bars" && t > 0.15 && t < 0.8 && Math.floor(t * 12) % 2 === 0) px(c, xx, top + 1, 1, Math.max(1, tot - bellyH - 1), a.mark);
    if (a.pattern === "spots" && ((i * 7 + 3) % 5 === 0)) px(c, xx, top + 1 + ((i * 3) % Math.max(1, tot - bellyH - 1)), 1, 1, a.mark);
    if (a.pattern === "scutes" && i % 3 === 0) px(c, xx, top, 1, 1, a.mark);
    if (a.pattern === "stripe" || a.stripe) px(c, xx, Math.round(y) - (a.stripe ? 0 : 0), 1, 1, a.stripe || a.mark);
    if (a.pattern === "eyespot" && Math.abs(t - 0.06) < 0.04) px(c, xx, Math.round(y) - 1, 1, 2, a.mark);
  }
  if (silhouette) return;
  // the dorsal fin, the eye, the gill, the whiskers, the big mouth
  const fin0 = Math.round(body * (a.shape === "long" ? 0.12 : 0.35)), finW = Math.max(2, Math.round(body * (a.shape === "long" ? 0.14 : 0.3)));
  const ft = (fin0 + finW / 2) / body, fh = Math.round((H / 2) * profile(a.shape, ft));
  for (let i = 0; i < finW; i++) px(c, X(tail + fin0 + i), Math.round(y) - fh - Math.max(1, Math.round((H / 4) * (1 - i / finW))), 1, Math.max(1, Math.round((H / 4) * (1 - i / finW))), a.fin);
  const eyeI = tail + body - Math.max(2, Math.round(body * 0.1)), eyeY = Math.round(y) - Math.max(1, Math.round(H * (a.shape === "flat" ? 0.25 : 0.12)));
  px(c, X(eyeI), eyeY, 1, 1, "#000000");
  if (H >= 8) px(c, X(eyeI) + (dir > 0 ? 1 : -1), eyeY, 1, 1, "#fcfcfc");
  if (a.shape === "flat") px(c, X(eyeI - 2), eyeY - 1, 1, 1, "#000000");
  if (a.gill) px(c, X(eyeI - 2), eyeY + 1, 1, 2, a.gill);
  if (a.mouth) px(c, X(tail + body - 3), Math.round(y) + 1, 3, 1, "#1c1c1c");
  if (a.whiskers) { px(c, X(tail + body - 1) + (dir > 0 ? 1 : -2), Math.round(y) + 1, 2, 1, a.back); px(c, X(tail + body - 1) + (dir > 0 ? 1 : -2), Math.round(y) + 3, 2, 1, a.back); }
}

function eel(c, a, x, y, L, dir, phase, sil) {
  const H = Math.max(2, Math.round(L * a.h));
  const x0 = Math.round(x - L / 2);
  for (let i = 0; i < L; i++) {
    const t = i / L, yy = Math.round(y + Math.sin(t * 9 + phase * 1.5) * Math.max(1, H * 0.8));
    const xx = dir > 0 ? x0 + i : x0 + L - 1 - i;
    const hh = t > 0.9 ? Math.max(1, Math.round(H * (1 - t) * 8)) : H;
    px(c, xx, yy - Math.floor(hh / 2), 1, hh, sil || a.body);
    if (!sil) { px(c, xx, yy - Math.floor(hh / 2), 1, 1, a.back); if (hh > 2) px(c, xx, yy + Math.ceil(hh / 2) - 1, 1, 1, a.belly); }
    if (!sil && i === L - 3) px(c, xx, yy - 1, 1, 1, "#000000");
  }
}

function crab(c, a, x, y, L, phase, sil) {
  const W = L, H = Math.max(3, Math.round(L * 0.45)), x0 = Math.round(x - W / 2), y0 = Math.round(y - H / 2);
  const leg = sil || a.fin, step = phase ? (Math.round(phase * 2) % 2) : 0;
  for (let k = 0; k < 3; k++) {   // legs, either side
    const lx = x0 + Math.round(W * (0.2 + k * 0.22));
    px(c, lx - 1, y0 + H - 1 + step, 1, 3, leg); px(c, lx + 1, y0 + H - 1 + (1 - step), 1, 3, leg);
  }
  px(c, x0 - 2, y0 - 2, 3, 3, leg); px(c, x0 + W - 1, y0 - 2, 3, 3, leg);   // claws
  for (let i = 0; i < W; i++) {
    const t = i / (W - 1), e = Math.sqrt(Math.max(0, 1 - ((t - 0.5) / 0.5) ** 2)), hh = Math.max(1, Math.round(H * (0.35 + 0.65 * e)));
    const pt = t < 0.08 || t > 0.92 ? 1 : 0;
    px(c, x0 + i, y0 + H - hh - pt, 1, hh, sil || a.back);
    if (!sil) px(c, x0 + i, y0 + H - 1, 1, 1, a.belly);
  }
  if (!sil) { px(c, x0 + Math.round(W * 0.38), y0 - 1, 1, 1, "#000000"); px(c, x0 + Math.round(W * 0.62), y0 - 1, 1, 1, "#000000"); }
}

// a fish's drawn size in a given box (pixels), scaled by its weight within the species' range
export function lenFor(spId, cw, box) {
  const s = SPECIES_BY[spId];
  if (!s) return box * 0.6;
  const f = Math.max(0, Math.min(1, (cw / 100 - s.lb[0]) / (s.lb[1] - s.lb[0] || 1)));
  return box * (0.62 + 0.3 * f);
}
