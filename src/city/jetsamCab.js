// JETSAM!'s own cabinet: the miniature render made for the game (JETSAM!/store-assets/jettison-cards/
// mini, a 3/4 upright with the JETSAM! marquee, a dark empty screen and the cyan trim), drawn
// wherever the city stands a JETSAM! cabinet (funnelProps.js cabinet(): the Union Lounge, the bars,
// the diner, the casino corner, the boardwalk, THE ARCADE, THE LANES; furniture.js "arcade": the
// flats). Its screen stays ours: the attract mode (the ring, the ship slinging round it) is drawn
// into the render's screen rectangle.
//
// Lazy: the PNGs (public/funnels/jetsam-cabinet-{64,128,256}.png, 4-45 KB) are asked for the first
// time a cabinet is drawn, never by the entry bundle. Until one lands (and in node, where there is
// no Image) drawJetsamCab answers null and the caller draws the procedural cabinet it drew before.
//
// Pixels: the render is drawn at a whole-number multiple of one of its sizes when one is within
// reach of the height asked for (nearest neighbour, the city's look); otherwise the next size up,
// scaled down smoothly (a nearest-neighbour downscale drops the trim's single pixels).

export const JETSAM_CAB_SIZES = [64, 128, 256];   // source heights; each is half as wide
export const jetsamCabSrc = (h) => `/funnels/jetsam-cabinet-${h}.png`;
// The screen, measured in the PNGs (a flood fill of the dark glass, the same at 128, 256 and 512):
// x 49-102 of 128, y 60-135 of 256. Fractions of the image.
export const JETSAM_CAB_SCREEN = { x: 49 / 128, y: 60 / 256, w: 54 / 128, h: 76 / 256 };
export const JETSAM_CAB_ASPECT = 0.5;   // width / height
const SNAP = 0.12;                        // how far a whole-number scale may move the height asked for

// Which source, at what drawn height (device pixels): {src, h, smooth}. Pure (checked).
export function jetsamCabFit(hDev) {
  const H = Math.max(1, hDev);
  // the largest source that a whole-number scale brings within reach (the most detail, the fewest
  // doubled pixels)
  for (const S of [...JETSAM_CAB_SIZES].reverse()) {
    const k = Math.max(1, Math.round(H / S));
    if (Math.abs(k * S - H) / H <= SNAP) return { src: S, h: k * S, smooth: false };
  }
  const up = JETSAM_CAB_SIZES.find(S => S >= H);
  return up ? { src: up, h: H, smooth: true } : { src: JETSAM_CAB_SIZES[JETSAM_CAB_SIZES.length - 1], h: H, smooth: false };
}

const IMG = new Map();
function image(S) {
  if (typeof Image === "undefined") return null;
  let im = IMG.get(S);
  if (!im) { im = new Image(); im.decoding = "async"; im.src = jetsamCabSrc(S); IMG.set(S, im); }
  return im.complete && im.naturalWidth ? im : null;
}

// The cabinet standing on (cx, by) (bottom centre), about h tall, in the context's units.
// o.flip mirrors it. -> {x, y, w, h, screen: {x, y, w, h}} | null (not loaded: draw your own).
export function drawJetsamCab(c, cx, by, h, o = {}) {
  if (typeof Image === "undefined" || !(h > 4)) return null;
  let scale = 1;
  try { const m = c.getTransform?.(); if (m && m.a) scale = Math.abs(m.a); } catch { /* no transform */ }
  const fit = jetsamCabFit(h * scale);
  let im = image(fit.src), smooth = fit.smooth, dh = fit.h / scale;
  if (!im) {   // the size wanted is still on its way: any size already here, smoothed
    im = JETSAM_CAB_SIZES.map(S => (IMG.get(S)?.complete && IMG.get(S).naturalWidth ? IMG.get(S) : null)).find(Boolean);
    if (!im) return null;
    smooth = true; dh = h;
  }
  const dw = dh * JETSAM_CAB_ASPECT;
  const x = Math.round((cx - dw / 2) * scale) / scale, y = Math.round((by - dh) * scale) / scale;
  c.save();
  c.imageSmoothingEnabled = smooth;
  if (smooth) c.imageSmoothingQuality = "high";
  if (o.flip) { c.translate(x + dw, y); c.scale(-1, 1); c.drawImage(im, 0, 0, dw, dh); }
  else c.drawImage(im, x, y, dw, dh);
  c.restore();
  const S = JETSAM_CAB_SCREEN;
  const sx = o.flip ? x + dw * (1 - S.x - S.w) : x + dw * S.x;
  return { x, y, w: dw, h: dh, screen: { x: sx, y: y + dh * S.y, w: dw * S.w, h: dh * S.h } };
}

const hk = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
// The attract screen: stars, the ring, the ship slinging round it. p: the pixel; i: which cabinet
// (a phase, so a row of them is not in lockstep); ring: the ring's colour.
export function jetsamAttract(c, sx, sy, sw, sh, p, t, i = 0, ring = "#f472b6") {
  const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
  c.save();
  c.beginPath(); c.rect(sx, sy, sw, sh); c.clip();
  for (let k = 0; k < 6; k++) R(sx + ((hk("st" + k) % 97) / 97) * sw, sy + ((hk("sy" + k) % 89) / 89) * sh, p * 0.8, p * 0.8, "#e0f2fe");
  const cx = sx + sw / 2, cy = sy + sh / 2, an = t * 2.2 + i;
  c.strokeStyle = ring; c.lineWidth = Math.max(1, p * 0.6); c.beginPath(); c.ellipse(cx, cy, sw * 0.3, sh * 0.3, 0, 0, Math.PI * 2); c.stroke();
  R(cx + Math.cos(an) * sw * 0.3 - p, cy + Math.sin(an) * sh * 0.3 - p, 2 * p, 2 * p, "#fbbf24");
  c.restore();
}
