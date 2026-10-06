// The EB SHOP's virtual copies as furniture (src/economy/ebvirtual.js): a media shelf with the
// cover facing out, a framed picture for the wall, a small object on a stand. The piece id is the
// copy's SKU body, "v-<h8>.<form>-<c1>-<c2>", so it draws from its own colours with no lookup; when
// the page has the copy's photo (setEbThumbs, src/shops/ebClient.js) the cover is the photo itself,
// pixelated to the room's scale. Pure: draw takes a 2D context, nothing here touches the page.

const RE = /^v-([0-9a-f]{8})\.(shelf|frame|desk)-([0-9a-f]{6})-([0-9a-f]{6})$/;
let THUMBS = null;   // (h8, px) -> a canvas | null
export function setEbThumbs(f) { THUMBS = typeof f === "function" ? f : null; }

// The cover: the photo when the page has it, else the copy's two colours as a sleeve.
function cover(c, x, y, w, h, s, h8, a, b) {
  const X = Math.round(x), Y = Math.round(y), W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h));
  const px = Math.max(2, Math.round(Math.max(W, H) / Math.max(1, s * 0.9)));
  const img = THUMBS ? THUMBS(h8, Math.min(24, px)) : null;
  if (img) {
    const sm = c.imageSmoothingEnabled; c.imageSmoothingEnabled = false;
    c.drawImage(img, X, Y, W, H);
    c.imageSmoothingEnabled = sm;
    return;
  }
  c.fillStyle = a; c.fillRect(X, Y, W, H);
  c.fillStyle = b; c.fillRect(X, Y + Math.round(H * 0.62), W, Math.max(1, Math.round(H * 0.18)));
  c.fillRect(X + Math.round(W * 0.2), Y + Math.round(H * 0.15), Math.max(1, Math.round(W * 0.6)), Math.max(1, Math.round(H * 0.12)));
}
const R = (c, cx, fy, s, dx, up, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(cx + dx * s), Math.round(fy - (up + h) * s), Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))); };

const FORM = {
  // a low media shelf: two boards, three spines, the copy's cover standing face-out on top
  shelf: { name: "MEDIA SHELF", fw: 10, top: 18, rooms: ["living", "bedroom", "study"], role: "shelf",
    draw(c, cx, fy, s, h8, a, b) {
      R(c, cx, fy, s, -5, 0, 10, 8, "#4a3a2a"); R(c, cx, fy, s, -4.5, 1, 9, 2.6, "#2a2018"); R(c, cx, fy, s, -4.5, 4.4, 9, 2.6, "#2a2018");
      for (let i = 0; i < 4; i++) R(c, cx, fy, s, -4 + i * 2.2, 4.4, 1.6, 2.6, ["#8a3a3a", "#3a5a8a", "#c9a34a", "#4a7a4a"][i]);
      R(c, cx, fy, s, -4 + 0.2, 1, 1.6, 2.6, a); R(c, cx, fy, s, -1.6, 1, 1.6, 2.6, b);
      cover(c, cx - 3 * s, fy - 18 * s, 6 * s, 9.5 * s, s, h8, a, b);
      R(c, cx, fy, s, -3.4, 8, 6.8, 0.6, "#1a1410");
    } },
  // a frame on the wall, the photo inside
  frame: { name: "FRAMED PIECE", fw: 10, top: 27, wall: true, rooms: ["living", "bedroom", "study", "kitchen"],
    draw(c, cx, fy, s, h8, a, b) {
      R(c, cx, fy, s, -5, 16, 10, 11, "#c9a34a"); R(c, cx, fy, s, -4.4, 16.6, 8.8, 9.8, "#f2ecd8");
      cover(c, cx - 3.6 * s, fy - 25.6 * s, 7.2 * s, 8.2 * s, s, h8, a, b);
    } },
  // a small object on a stand
  desk: { name: "OBJECT ON A STAND", fw: 8, top: 16, rooms: ["study", "bedroom", "living"],
    draw(c, cx, fy, s, h8, a, b) {
      R(c, cx, fy, s, -4, 0, 8, 9, "#3a3a44"); R(c, cx, fy, s, -4.5, 9, 9, 1, "#5a5a66");
      cover(c, cx - 3 * s, fy - 16 * s, 6 * s, 6 * s, s, h8, a, b);
    } },
};

const CACHE = new Map();
// A catalog-shaped entry (furniture.js CATALOG) for a copy's piece id, or null.
export function ebPiece(id) {
  if (typeof id !== "string" || !id.startsWith("v-")) return null;
  if (CACHE.has(id)) return CACHE.get(id);
  const m = RE.exec(id);
  const f = m && FORM[m[2]];
  const out = f ? Object.freeze({
    id, name: f.name, rooms: f.rooms, tiers: [0, 1, 2], role: f.role || m[2], footprint: { w: f.fw, h: f.top }, wall: !!f.wall, floor: false, glow: false, whole: false, tints: null, eb: true, form: m[2],
    draw(c, cx, fy, s) { f.draw(c, cx, fy, s, m[1], `#${m[3]}`, `#${m[4]}`); },
  }) : null;
  if (CACHE.size > 500) CACHE.clear();
  CACHE.set(id, out);
  return out;
}
