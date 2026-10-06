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

export { ATLAS_URL, BRAND_MARKS, BRAND_PENDING, _setAtlas, brandReady, pickBrand, brandFits, drawBrand } from "../ads/marks.js";
import { brandReady, brandFits, drawBrand } from "../ads/marks.js";

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
