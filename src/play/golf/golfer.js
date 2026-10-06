// The golfer on the course, seen from behind and to his right (the cartridge view: the camera
// behind the ball looking up the hole, the golfer left of the ball, facing it). Browser only,
// render-only.
//
// Kept simple on purpose (Scott: "keep it simple"): a classic 16-bit sprite at the scene's own
// scale, drawn from a handful of joints in sprite pixels as flat two-tone limbs with one dark
// outline. Ten key poses for a full swing (ADDRESS and its waggle, HALF BACK, THREE-QUARTER BACK,
// TOP, DOWN, IMPACT, RELEASE, THROUGH, FINISH) and four for the putter (ADDRESS, a short and a
// long BACK, THROUGH). The meter (or the mouse's drag, or the stick) picks the backswing frame and
// the downswing's; after contact the follow-through plays on the shot's own clock. The club is a
// dark-outlined light shaft so it reads against the grass. The head is the player's own
// (looks.js / heads.js). 2026-10-06: one notch up in our own style: broader shoulders on a
// narrower waist, a far arm, a collar, shoes with soles, a real clubhead, more frames.

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
  waggle: J({ h: [34, 22], s: [29, 31], p: [18, 49], k1: [24, 62], k2: [21, 63], f1: [22, 77], f2: [17, 78], w: [33, 51], c: [49, 75] }),
  half: J({ h: [33, 22], s: [28, 31], p: [18, 49], k1: [25, 62], k2: [21, 63], f1: [22, 77], f2: [17, 78], w: [25, 46], c: [8, 37] }),
  back: J({ h: [33, 22], s: [27, 31], p: [18, 49], k1: [25, 62], k2: [20, 63], f1: [22, 77], f2: [17, 78], w: [21, 30], c: [3, 22] }),
  top: J({ h: [32, 22], s: [27, 31], p: [18, 49], k1: [25, 62], k2: [20, 63], f1: [22, 77], f2: [17, 78], w: [22, 14], c: [6, 26] }),
  down: J({ h: [33, 23], s: [28, 32], p: [19, 49], k1: [25, 62], k2: [22, 63], f1: [22, 77], f2: [17, 78], w: [27, 38], c: [13, 57] }),
  impact: J({ h: [33, 23], s: [29, 32], p: [20, 49], k1: [25, 62], k2: [24, 63], f1: [22, 77], f2: [17, 78], w: [35, 52], c: [47, 77] }),
  release: J({ h: [32, 22], s: [29, 31], p: [21, 48], k1: [25, 62], k2: [25, 64], f1: [22, 77], f2: [18, 77], w: [41, 46], c: [58, 54] }),
  through: J({ h: [31, 20], s: [28, 30], p: [21, 48], k1: [25, 62], k2: [25, 64], f1: [22, 77], f2: [19, 77], w: [41, 34], c: [55, 14] }),
  finish: J({ h: [27, 15], s: [26, 24], p: [21, 46], k1: [23, 61], k2: [27, 63], f1: [22, 77], f2: [22, 76], w: [20, 12], c: [4, 30] }),
  pAddress: J({ h: [33, 24], s: [28, 33], p: [18, 50], k1: [23, 63], k2: [20, 63], f1: [22, 77], f2: [17, 78], w: [33, 54], c: [41, 77] }),
  pBack: J({ h: [33, 24], s: [28, 33], p: [18, 50], k1: [23, 63], k2: [20, 63], f1: [22, 77], f2: [17, 78], w: [30, 54], c: [35, 76] }),
  pBack2: J({ h: [33, 24], s: [28, 33], p: [18, 50], k1: [23, 63], k2: [20, 63], f1: [22, 77], f2: [17, 78], w: [27, 54], c: [29, 75] }),
  pThrough: J({ h: [33, 24], s: [28, 33], p: [18, 50], k1: [23, 63], k2: [20, 63], f1: [22, 77], f2: [17, 78], w: [36, 53], c: [47, 75] }),
};

// The frame for what the sim (or a drag) shows: -> {putt, frame}
// opts: {putt, m (the meter's marker, 0..1), stage, power, t (ticks since contact), still, waggle}
export function poseOf(phase, opts) {
  const { putt, m = 0, stage = 1, power = 0, t = 0, still = false, waggle = 0 } = opts;
  const after = phase === "flight" || phase === "roll" || phase === "rest";
  if (putt) {
    if (phase === "meter") return { putt, frame: stage === 2 ? "pAddress" : m < 0.1 ? "pAddress" : m < 0.5 ? "pBack" : "pBack2" };
    if (after) return { putt, frame: !still && t < 3 ? "pAddress" : "pThrough" };
    return { putt, frame: "pAddress" };
  }
  if (phase === "meter") {
    if (stage === 2) return { putt, frame: m > power * 0.55 ? "top" : "down" };
    return { putt, frame: m >= 0.68 ? "top" : m >= 0.38 ? "back" : m >= 0.12 ? "half" : "address" };
  }
  if (after) return { putt, frame: still ? "finish" : t <= 1 ? "impact" : t <= 4 ? "release" : t <= 9 ? "through" : "finish" };
  return { putt, frame: waggle > 0.3 ? "waggle" : "address" };
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
// a limb that tapers from ra at a to rb at b
function taper(d, a, b, ra, rb, base, lit) {
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
  for (let i = 0; i <= n; i++) { const t = i / n, q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; limb(d, q, q, ra + (rb - ra) * t, base, lit); }
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
  const shirtD = sh(shirt, 0.7), shirtL = sh(shirt, 1.25), pantsD = sh(pants, 0.72), pantsL = sh(pants, 1.2);
  const finish = pose.frame === "finish", clubUp = c[1] < w[1];
  // the far arm (the left, for a right-hander): behind everything, a darker sleeve from the far
  // shoulder to the hands
  const fs = [s[0] - 4, s[1] + 1];
  limb(d, fs, mid(fs, w, 0.5, -1, 1), 2.2, shirtD); limb(d, mid(fs, w, 0.5, -1, 1), w, 1.8, sh(skin, 0.8));
  // legs: the trail leg behind, then the lead; a tapered thigh, a shin, shoes with soles
  taper(d, p, k2, 3.4, 2.8, pantsD); limb(d, k2, f2, 2.6, pantsD);
  taper(d, p, k1, 3.6, 3, pants, pantsL); limb(d, k1, f1, 2.8, pants, pantsL);
  limb(d, [f2[0] - 1, f2[1]], [f2[0] + 4, f2[1]], 1.6, "#c8c8cc"); put(d, f2[0] + 4, f2[1] + 1, "#6c6c74"); put(d, f2[0] + 2, f2[1] + 1, "#6c6c74");
  limb(d, [f1[0] - 1, f1[1]], [f1[0] + 4, f1[1]], 1.7, "#fcfcfc"); put(d, f1[0] + 4, f1[1] + 1, "#8c8c94"); put(d, f1[0] + 1, f1[1] + 1, "#8c8c94");
  // the trunk: narrower at the waist, broader through the shoulders; a belt; a collar
  taper(d, p, mid(p, s, 0.55), 5.2, 6, shirt, shirtL);
  taper(d, mid(p, s, 0.55), s, 6, 6.6, shirt, shirtL);
  seg(d, mid(p, s, 0.1, -5, 0), mid(p, s, 0.1, 5, 0), "#24202a"); put(d, mid(p, s, 0.1, 1, 0)[0], mid(p, s, 0.1, 1, 0)[1], "#c8a850");
  limb(d, [s[0], s[1] - 4], [s[0], s[1] - 4], 2.4, shirtL); put(d, s[0], s[1] - 5, skin);
  // the club behind the arms when it is up (the top, the finish), under them otherwise
  const grip = mid(w, c, 0.14);
  const drawClub = () => {
    seg(d, w, grip, "#202024"); seg(d, grip, c, "#e0e4ec");
    if (pose.putt) { limb(d, [c[0] - 1, c[1]], [c[0] + 3, c[1]], 1.3, "#50505c", "#a0a4b0"); }
    else if (clubUp) { limb(d, c, [c[0] - 2, c[1] - 1], 1.6, "#3c3c48", "#8c90a0"); }
    else { limb(d, c, [c[0] + 3, c[1] - 1], 1.9, "#3c3c48", "#8c90a0"); put(d, c[0] + 1, c[1] - 2, "#c0c4d0"); }
  };
  if (clubUp && !finish) drawClub();
  // the near arm, shoulder to hands: sleeve then forearm, a glove on the hands
  const e = mid(s, w, 0.48, 1, 1);
  limb(d, s, e, 2.7, shirt, shirtL); limb(d, e, w, 2, skin, sh(skin, 1.12));
  limb(d, w, w, 2.1, glove); put(d, w[0] + 1, w[1] + 1, sh(glove, 0.8));
  if (!clubUp || finish) drawClub();
  // the head: hair, then the cap with its bill toward where he looks (round to the target at the finish)
  limb(d, h, h, 5, hair, sh(hair, 1.25));
  limb(d, [h[0], h[1] - 3], [h[0], h[1] - 3], 4.4, cap, sh(cap, 1.1));
  const bill = finish ? [h[0] - 1, h[1] - 6] : [h[0] + 7, h[1] - 2];
  seg(d, [h[0] + 1, h[1] - 2], bill, sh(cap, 0.75)); seg(d, [h[0] + 1, h[1] - 3], [bill[0], bill[1] - 1], sh(cap, 0.9));
  put(d, h[0] + 4, h[1] + 1, skin);   // an ear
  put(d, h[0] + 4, h[1] + 2, sh(skin, 0.85));
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
  if (CACHE.size > 160) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key, cv);
  return cv;
}
