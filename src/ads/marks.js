// THE BRAND ATLAS, the core: Scott's real marks (public/brand/atlas.{png,json}, built by
// scripts/brand_atlas.py; sources in public/brand/BRAND_SOURCES.md), loaded once, lazily, and drawn
// at whole-number scales. No imports, so the games (their ad boards, src/ads/) can draw a mark
// without pulling the city into their bundles. src/city/brand.js re-exports all of it and adds
// faceBrand (the iso faces). The full notes are there.
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

