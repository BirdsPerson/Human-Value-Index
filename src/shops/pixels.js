// The shops' pixels (browser only): a garment as it lies off the body (the avatar's own clothes
// layer, cut to the garment's colours: what is on the rail is exactly what you will wear), a
// furniture piece from the catalog, and the file photo wearing an outfit. Cached canvases.
import { avatarLayers, avatarPalette, DEFAULT_SPEC, sanitizeSpec, AX } from "../avatar.js";
import { WEAR_KEYS, wearOf } from "../wear.js";
import { paintAvatar } from "../sprites.js";
import { pieceOf } from "../city/furniture.js";

const SLOT_INK = {
  top: [AX.TOP, AX.TOPS, AX.TRIM], bottom: [AX.BOT, AX.BTRIM], shoes: [AX.SHOE, AX.SOLE],
  outer: [AX.OUT, AX.OUTS, AX.OTRIM], head: [AX.HAT, AX.HAT2], acc: [AX.WACC, AX.WACC2],
};
const GARMENTS = new Map();
// A garment, cropped, outlined, 1 px per pixel: {canvas, w, h}. sku: "<id>.<way>" (no "w:").
export function garmentSprite(sku) {
  if (GARMENTS.has(sku)) return GARMENTS.get(sku);
  const w = wearOf(sku);
  if (!w) return null;
  const spec = { ...DEFAULT_SPEC, build: "average", [`wear_${w.slot}`]: sku };
  const layer = avatarLayers(spec, 0).find(l => l.name === (w.slot === "head" || w.slot === "acc" ? "accessories" : "clothes"));
  const ink = new Set(SLOT_INK[w.slot]);
  const pal = avatarPalette(spec);
  let x0 = 32, y0 = 48, x1 = -1, y1 = -1;
  for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) if (ink.has(layer.px[y * 32 + x])) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < 0) return null;
  const cw = x1 - x0 + 3, ch = y1 - y0 + 3;
  const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
  const g = cv.getContext("2d"), img = g.createImageData(cw, ch);
  const on = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && ink.has(layer.px[y * 32 + x]);
  for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
    let c = null;
    if (on(x, y)) c = pal[layer.px[y * 32 + x]];
    else if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) c = [5, 8, 5];
    if (!c) continue;
    const o = ((y - y0 + 1) * cw + (x - x0 + 1)) * 4;
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const out = { canvas: cv, w: cw, h: ch };
  GARMENTS.set(sku, out);
  return out;
}

// A furniture piece drawn at scale s on its own canvas: {canvas, w, h} (CSS px at s).
const PIECES = new Map();
export function pieceSprite(id, s = 2) {
  const k = `${id}|${s}`;
  if (PIECES.has(k)) return PIECES.get(k);
  const it = pieceOf(id);
  if (!it) return null;
  const w = Math.ceil((it.footprint.w + 4) * s), h = Math.ceil((Math.max(it.footprint.h, 6) + 3) * s);
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d"); g.imageSmoothingEnabled = false;
  it.draw(g, w / 2, h - s, s, { on: true, tint: it.tints ? it.tints[0] : null });
  const out = { canvas: cv, w, h, wall: it.wall };
  PIECES.set(k, out);
  return out;
}

// The file photo wearing an outfit ({top: sku, ...} | null): a 32x48 canvas, frame 0.
export function wearingSpec(base, outfit) {
  const spec = Object.fromEntries(Object.entries(sanitizeSpec(base) || DEFAULT_SPEC).filter(([k]) => !WEAR_KEYS.includes(k)));
  for (const [slot, v] of Object.entries(outfit || {})) if (v) spec[`wear_${slot}`] = v;
  return spec;
}
export const avatarSheet = (spec) => paintAvatar(spec, 1);

// Draw a 1x canvas onto a visible one, scaled by whole pixels and centred.
export function blitScaled(target, src, { fill = null } = {}) {
  if (!target || !src) return;
  const g = target.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, target.width, target.height);
  if (fill) { g.fillStyle = fill; g.fillRect(0, 0, target.width, target.height); }
  const k = Math.max(1, Math.floor(Math.min(target.width / src.width, target.height / src.height)));
  const w = src.width * k, h = src.height * k;
  g.drawImage(src, 0, 0, src.width, src.height, Math.round((target.width - w) / 2), Math.round((target.height - h) / 2), w, h);
}
