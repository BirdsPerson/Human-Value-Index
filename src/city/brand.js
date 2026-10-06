// Scott's real brand marks in the city: Electric Basement, EB Shop, JETSAM!, Goodnight Irene's,
// Iridescent, Beacon, Brainforest, ANAMNESIS. One atlas (public/brand/atlas.{png,json}, built by
// scripts/brand_atlas.py from the real artwork; sources in public/brand/BRAND_SOURCES.md), asked
// for the first time a sign is drawn, cached for the session. Until it lands every caller keeps
// drawing what it drew before (the text sign), so a slow or failed load never blanks a sign.
//
// Sprites are 1x pixel art at a few heights per mark; a draw picks the size whose whole-number
// multiple best fills the room it is given, so a mark is never smeared by a fractional scale
// (smoothing off). Neon (night) variants carry their halo in the pixels: steady, never strobing.
//
//   drawBrand(c, mark, x, y, px, {neon, align, valign, alpha, max, maxW})  screen space; -> {x, y, w, h} | null
//   faceBrand(K, f, t, h, mark, size, {neon, d, alpha, span})         on an iso face, like faceText
//   brandFits(mark, px)                                               would a draw at px show it
//   BRAND_MARKS                                                       the marks the atlas carries
import { STOREY } from "./iso.js";

export const ATLAS_URL = "/brand/atlas.json";
export const BRAND_MARKS = ["eb-logo", "eb-bolt", "ebshop", "ebshop-cart", "jetsam", "jetsam-j", "irenes", "irenes-arch",
  "iridescent", "beacon", "beacon-mark", "brainforest", "anamnesis"];
// Marks the city already asks for that the atlas does not carry yet: every call falls back to the
// lettering it draws today. "sams": SAM'S PIZZA PALACE's logo (THE SHORE PLAZA's storefront and its
// sign over the counter), when Scott sends the artwork; then it moves up into BRAND_MARKS.
export const BRAND_PENDING = ["sams"];

let A = null, IMG = null, asked = false;
const BY = new Map();   // "mark|neon" -> sprites sorted by height
function ask() {
  asked = true;
  fetch(ATLAS_URL).then(r => (r.ok ? r.json() : null)).then(j => {
    if (!j?.sprites) return;
    const im = new Image();
    im.decoding = "async";
    im.onload = () => { index(j); IMG = im; };
    im.src = "/brand/" + j.png;
  }).catch(() => { /* the text signs stay up */ });
}
function index(j) {
  A = j; BY.clear();
  for (const [key, s] of Object.entries(j.sprites)) {
    const k = `${s.mark}|${s.neon ? 1 : 0}`;
    if (!BY.has(k)) BY.set(k, []);
    BY.get(k).push({ key, ...s });
  }
  for (const list of BY.values()) list.sort((a, b) => a.h - b.h);
}
// For the checks: index an atlas without a browser.
export function _setAtlas(j) { index(j); }

export function brandReady() {
  if (typeof window === "undefined") return false;
  if (!asked) ask();
  return Boolean(IMG);
}

// The sprite and whole-number scale that best fill px of height (ink height: a neon sprite's
// halo spills past it), and no more than maxW of width. -> {s, k, ink} or null when even the
// smallest sprite is too big.
export function pickBrand(mark, px, neon = false, maxW = Infinity) {
  const list = BY.get(`${mark}|${neon ? 1 : 0}`) || (neon ? BY.get(`${mark}|0`) : null);
  if (!list) return null;
  // the most detailed sprite that fits wins; a smaller one blown up only when it fills
  // clearly more (a third more) of the room than that
  let best = null;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i], ink = s.h - 2 * (s.pad || 0), inkW = s.w - 2 * (s.pad || 0);
    if (ink > px) continue;
    const k = Math.min(Math.floor(px / ink), Math.floor(maxW / inkW));
    if (k < 1) continue;
    if (!best || ink * k > best.ink * best.k * 1.34) best = { s, k, ink };
  }
  return best;
}
export const brandFits = (mark, px, maxW) => Boolean(pickBrand(mark, px, false, maxW));

// Draw a mark px tall at (x, y): align left/center/right on x, valign top/middle/bottom on y.
export function drawBrand(c, mark, x, y, px, o = {}) {
  if (!brandReady()) return null;
  const p = pickBrand(mark, o.max ? Math.min(px, o.max) : px, o.neon, o.maxW ?? Infinity);
  if (!p) return null;
  const { s, k } = p, pad = (s.pad || 0) * k;
  const w = (s.w * k) - 2 * pad, h = (s.h * k) - 2 * pad;
  let dx = o.align === "left" ? x : o.align === "right" ? x - w : x - w / 2;
  let dy = o.valign === "top" ? y : o.valign === "bottom" ? y - h : y - h / 2;
  // whole device pixels only, so the pixel grid lands on the screen's
  const tr = c.getTransform ? c.getTransform() : null;
  if (!tr || (tr.b === 0 && tr.c === 0)) { dx = Math.round(dx); dy = Math.round(dy); }
  const smooth = c.imageSmoothingEnabled, ga = c.globalAlpha;
  c.imageSmoothingEnabled = false;
  if (o.alpha != null) c.globalAlpha = ga * o.alpha;
  c.drawImage(IMG, s.x, s.y, s.w, s.h, dx - pad, dy - pad, s.w * k, s.h * k);
  c.imageSmoothingEnabled = smooth; c.globalAlpha = ga;
  return { w, h, x: dx, y: dy };
}

// A mark laid on a building face, centred at (t, h), `size` storeys tall: the same shear as
// faceText (archDraw.js), so a logo sits on the wall the way the lettering beside it does.
export function faceBrand(K, f, t, h, mark, size, o = {}) {
  if (!brandReady()) return null;
  const A0 = f.F(t, h, o.d || 0), B0 = f.F(Math.min(1, t + 0.05), h, o.d || 0);
  let ex = B0[0] - A0[0], ey = B0[1] - A0[1];
  const L = Math.hypot(ex, ey) || 1; ex /= L; ey /= L;
  if (ex < 0) { ex = -ex; ey = -ey; }
  const px = size * STOREY * K.z;
  // span: [t0, t1], the stretch of the face the mark may take (a sign board's width)
  let maxW = Infinity;
  if (o.span) { const P0 = f.F(o.span[0], h, o.d || 0), P1 = f.F(o.span[1], h, o.d || 0); maxW = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]); }
  if (!brandFits(mark, px, maxW)) return null;
  const { ctx } = K;
  ctx.save();
  ctx.transform(ex, ey, 0, 1, A0[0], A0[1]);
  const r = drawBrand(ctx, mark, 0, 0, px, { ...o, maxW });
  ctx.restore();
  return r;
}
