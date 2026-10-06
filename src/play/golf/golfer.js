// The golfer on the course, seen from behind and to his right (the cartridge view: the camera
// behind the ball looking up the hole, the golfer left of the ball, facing it). Browser only,
// render-only.
//
// Kept simple on purpose (Scott: "keep it simple"): a classic 16-bit sprite at the scene's own
// scale, six key poses for a full swing (ADDRESS, HALF BACK, TOP, IMPACT, THROUGH, FINISH) and
// three for the putter (ADDRESS, BACK, THROUGH), each a handful of joints in sprite pixels drawn
// with flat two-tone limbs and a dark outline. The meter (or the mouse's drag, or the stick) picks
// the backswing frame; the downswing plays on the shot's own clock. The club is a dark-outlined
// light shaft so it reads against the grass. The head is the player's own (looks.js / heads.js).

export const GW = 60, GH = 80;                 // the sprite buffer; the feet sit on its bottom rows
const OUT = "#120c14";
// the ball, in buffer pixels (the caller puts it on the ball on the course)
const BALL = { drive: [47, 77], putt: [41, 77] };
export const ballPx = (putt) => BALL[putt ? "putt" : "drive"];
export const FEET = [20, 78];

// The key poses: joints in buffer pixels. h head (centre), s shoulders, p hips, k1/k2 lead/trail
// knee, f1/f2 lead/trail foot, w hands, c clubhead.
const J = (o) => o;
export const POSES = {
  address: J({ h: [34, 22], s: [29, 31], p: [18, 49], k1: [24, 62], k2: [21, 63], f1: [22, 77], f2: [17, 78], w: [33, 52], c: [47, 77] }),
  half: J({ h: [33, 22], s: [28, 31], p: [18, 49], k1: [25, 62], k2: [21, 63], f1: [22, 77], f2: [17, 78], w: [25, 46], c: [8, 37] }),
  top: J({ h: [32, 22], s: [27, 31], p: [18, 49], k1: [25, 62], k2: [20, 63], f1: [22, 77], f2: [17, 78], w: [22, 14], c: [6, 26] }),
  impact: J({ h: [33, 23], s: [29, 32], p: [20, 49], k1: [25, 62], k2: [24, 63], f1: [22, 77], f2: [17, 78], w: [35, 52], c: [47, 77] }),
  through: J({ h: [31, 20], s: [28, 30], p: [21, 48], k1: [25, 62], k2: [25, 64], f1: [22, 77], f2: [19, 77], w: [41, 34], c: [55, 14] }),
  finish: J({ h: [26, 13], s: [25, 22], p: [22, 46], k1: [24, 61], k2: [26, 62], f1: [22, 77], f2: [22, 76], w: [31, 10], c: [10, 22] }),
  pAddress: J({ h: [33, 24], s: [28, 33], p: [18, 50], k1: [23, 63], k2: [20, 63], f1: [22, 77], f2: [17, 78], w: [33, 54], c: [41, 77] }),
  pBack: J({ h: [33, 24], s: [28, 33], p: [18, 50], k1: [23, 63], k2: [20, 63], f1: [22, 77], f2: [17, 78], w: [30, 54], c: [35, 76] }),
  pThrough: J({ h: [33, 24], s: [28, 33], p: [18, 50], k1: [23, 63], k2: [20, 63], f1: [22, 77], f2: [17, 78], w: [36, 53], c: [47, 75] }),
};

// The frame for what the sim (or a drag) shows: -> {putt, frame}
// opts: {putt, m (the meter's marker, 0..1), stage, t (ticks since contact), still}
export function poseOf(phase, opts) {
  const { putt, m = 0, stage = 1, t = 0, still = false } = opts;
  const after = phase === "flight" || phase === "roll" || phase === "rest";
  if (putt) {
    if (phase === "meter") return { putt, frame: m < 0.12 ? "pAddress" : "pBack" };
    if (after) return { putt, frame: !still && t < 3 ? "pAddress" : "pThrough" };
    return { putt, frame: "pAddress" };
  }
  if (phase === "meter") return { putt, frame: stage === 2 || m >= 0.55 ? "top" : m >= 0.12 ? "half" : "address" };
  if (after) return { putt, frame: still ? "finish" : t <= 2 ? "impact" : t <= 9 ? "through" : "finish" };
  return { putt, frame: "address" };
}

// ---- the rasteriser: flat two-tone capsules, then one dark outline round everything ---------------
const RGB = new Map();
const rgb = (h) => { let v = RGB.get(h); if (!v) { v = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; RGB.set(h, v); } return v; };
const sh = (h, k) => { const [r, g, b] = rgb(h); const c = (v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, "0"); return `#${c(r)}${c(g)}${c(b)}`; };
function put(d, x, y, col) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= GW || y >= GH) return;
  const i = (y * GW + x) * 4, [r, g, b] = rgb(col);
  d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
}
// a limb from a to b, radius r; its upper-left half lit, the rest the base colour
function limb(d, a, b, r, base, lit) {
  const x0 = Math.floor(Math.min(a[0], b[0]) - r - 1), x1 = Math.ceil(Math.max(a[0], b[0]) + r + 1);
  const y0 = Math.floor(Math.min(a[1], b[1]) - r - 1), y1 = Math.ceil(Math.max(a[1], b[1]) + r + 1);
  const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy || 1e-6;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const t = Math.max(0, Math.min(1, ((x + 0.5 - a[0]) * vx + (y + 0.5 - a[1]) * vy) / L2));
    const ox = x + 0.5 - a[0] - t * vx, oy = y + 0.5 - a[1] - t * vy;
    if (ox * ox + oy * oy > r * r) continue;
    put(d, x, y, lit && (ox + oy) < -r * 0.35 ? lit : base);
  }
}
function seg(d, a, b, col) {
  let x0 = Math.round(a[0]), y0 = Math.round(a[1]);
  const x1 = Math.round(b[0]), y1 = Math.round(b[1]);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (let k = 0; k < 200; k++) {
    put(d, x0, y0, col);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}
function outline(d) {
  const solid = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH && d[(y * GW + x) * 4 + 3] === 255;
  const o = [];
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) o.push(x, y);
  for (let i = 0; i < o.length; i += 2) put(d, o[i], o[i + 1], OUT);
}
const mid = (a, b, k = 0.5, ox = 0, oy = 0) => [a[0] + (b[0] - a[0]) * k + ox, a[1] + (b[1] - a[1]) * k + oy];

// ---- the golfer --------------------------------------------------------------------------------------
const CACHE = new Map();
// look: {head (a canvas: the player's own), skin, hair, shirt, pants, cap, glove}; -> a GW x GH canvas
export function golferCanvas(pose, look = {}) {
  const key = `${pose.frame}|${look.shirt}|${look.pants}|${look.skin}|${look.hair}|${look.cap}|${look.head ? 1 : 0}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const J0 = POSES[pose.frame] || POSES.address, d = new Uint8ClampedArray(GW * GH * 4);
  const shirt = look.shirt || "#3cbcfc", pants = look.pants || "#7c7c7c", skin = look.skin || "#e8a070", hair = look.hair || "#503000", cap = look.cap || "#fcfcfc", glove = look.glove || "#fcfcfc";
  const { h, s, p, k1, k2, f1, f2, w, c } = J0;
  // legs: the trail leg behind, then the lead; white shoes
  limb(d, p, k2, 3.2, sh(pants, 0.72)); limb(d, k2, f2, 2.8, sh(pants, 0.72));
  limb(d, p, k1, 3.4, pants, sh(pants, 1.2)); limb(d, k1, f1, 3, pants, sh(pants, 1.2));
  limb(d, f2, [f2[0] + 4, f2[1]], 1.6, "#c8c8cc"); limb(d, f1, [f1[0] + 4, f1[1]], 1.7, "#fcfcfc");
  // the trunk: the polo's back, a belt
  limb(d, p, s, 6, shirt, sh(shirt, 1.25));
  seg(d, mid(p, s, 0.12, -5, 0), mid(p, s, 0.12, 5, 0), "#24202a");
  // the club under the arms: a dark-cored light shaft, a head
  const grip = mid(w, c, 0.14);
  seg(d, w, grip, "#202024"); seg(d, grip, c, "#e0e4ec");
  limb(d, c, [c[0] + (pose.putt ? 2 : 3), c[1] - (pose.putt ? 0 : 1)], pose.putt ? 1.3 : 1.7, "#50505c", "#a0a4b0");
  // the arms, shoulder to hands: sleeve then forearm, a glove on the hands
  const e = mid(s, w, 0.48, 1, 1);
  limb(d, s, e, 2.6, shirt, sh(shirt, 1.25)); limb(d, e, w, 2, skin);
  limb(d, w, w, 2, glove);
  // the head: hair, then the cap, its brim toward where he looks
  limb(d, h, h, 5, hair, sh(hair, 1.25));
  limb(d, [h[0], h[1] - 3], [h[0], h[1] - 3], 4.4, cap, sh(cap, 1.1));
  const brim = pose.frame === "finish" ? [h[0] + 1, h[1] - 6] : [h[0] + 6, h[1] - 2];
  seg(d, [h[0] + 1, h[1] - 2], brim, sh(cap, 0.75));
  put(d, h[0] + 4, h[1] + 1, skin);   // an ear
  outline(d);
  const cv = document.createElement("canvas");
  cv.width = GW; cv.height = GH;
  const g = cv.getContext("2d"), img = g.createImageData(GW, GH);
  img.data.set(d);
  g.putImageData(img, 0, 0);
  // the player's own head over the drawn one (heads.js cut), at the sprite's scale, cap kept on top
  if (look.head) {
    const hd = look.head, sc = Math.min(1, 12 / Math.max(hd.width, hd.height));
    const hw = Math.round(hd.width * sc), hh = Math.round(hd.height * sc);
    g.imageSmoothingEnabled = false;
    g.drawImage(hd, Math.round(h[0] - hw / 2), Math.round(h[1] + 5 - hh), hw, hh);
  }
  if (CACHE.size > 120) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key, cv);
  return cv;
}
