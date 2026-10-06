// The golfer on the course, seen from behind and a little to his back (the cartridge view: the
// camera behind the ball looking up the hole, the golfer left of the ball, facing it). Browser
// only, render-only.
//
// The swing is posed in 3D and projected through the same view as the course, so it reads true:
// a right-hander stands left of the ball facing it (the target is his left, straight up the
// screen); the club goes BACK toward the camera and up over his right shoulder (his back turns to
// the target at the top), comes down the same plane through the ball, and FINISHES with his chest
// to the target (his back to us), hands high over his left shoulder and the club behind his neck.
// The putter is the same model, upright, with a short pendulum.
//
// Pose space (yards): f = the way he faces (toward the ball), t = toward the target, z = up; the
// origin is between his feet. Drawn into a small pixel buffer with a tiny rasteriser (capsules,
// quads, ellipses), lit from the upper left, outlined dark: no canvas antialiasing anywhere.

export const GW = 150, GH = 156, GOX = 62, GOY = 148;   // the buffer, and where the feet go in it
export const PXY = 52;                                   // pixels per yard on the sprite
const YAW = (24 * Math.PI) / 180, PITCH = (15 * Math.PI) / 180;
const cy = Math.cos(YAW), sy = Math.sin(YAW), cp = Math.cos(PITCH), sp = Math.sin(PITCH);
// project a pose point (f, t, z) -> [sx, sy, depth] in buffer pixels
function proj([f, t, z]) {
  const right = cy * f - sy * t, fwd = cy * t + sy * f;
  return [GOX + right * PXY, GOY - (z * cp + fwd * sp) * PXY, fwd * cp - z * sp];
}
export const BALL = { drive: [1.05, 0.08, 0], putt: [0.66, 0.02, 0] };
// where the ball sits in the buffer, so the caller can put the clubhead on it
export const ballPx = (putt) => proj(BALL[putt ? "putt" : "drive"]);

const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const D = Math.PI / 180;

// The swing, from what the sim shows: -> {th (hands round the plane, deg: + back, - through),
// hinge (deg), turn (shoulders, deg), hipT, stand (0 bent .. 1 tall), putt}
export function poseOf(phase, opts) {
  const { putt, m = 0, stage = 1, power = 0, t = 0, dir = 1, still = false, waggle = 0 } = opts;
  if (putt) {
    if (phase === "meter") return { putt, th: 26 * m, hinge: 0, turn: 14 * m, hipT: 0, stand: 0.15 };
    if (phase === "roll" || phase === "rest" || phase === "flight") { const k = still ? 1 : smooth(t / 10); return { putt, th: -24 * k, hinge: 0, turn: -12 * k, hipT: 0, stand: 0.15 }; }
    return { putt, th: waggle * 3, hinge: 0, turn: 0, hipT: 0, stand: 0.15 };
  }
  void dir; void stage;
  const top = 152;
  if (phase === "meter") {
    const k = stage === 1 ? m : power;   // stage 2: he waits at the top for the third press
    const th = top * Math.max(0.04, k);
    return { putt, th, hinge: 92 * smooth(th / 120), turn: 92 * smooth(th / top), hipT: 40 * smooth(th / top), stand: 0 };
  }
  if (phase === "flight" || phase === "roll" || phase === "rest") {
    // the downswing is all but instant (the ball is already away); then through to the finish
    const k = still ? 1 : t <= 0 ? 0 : smooth((t - 0.5) / 15);
    if (t <= 0 && !still) return { putt, th: 0, hinge: 4, turn: -18, hipT: -35, stand: 0.05 };
    const th = -200 * k;
    return { putt, th, hinge: -95 * smooth((k - 0.35) / 0.6), turn: -18 - 92 * k, hipT: -35 - 55 * k, stand: 0.75 * k };
  }
  return { putt, th: 3 + waggle * 6, hinge: waggle * 8, turn: 0, hipT: 0, stand: 0 };
}

// The joints for a pose.
function skeleton(P) {
  const putt = P.putt, ball = BALL[putt ? "putt" : "drive"];
  const tilt = (putt ? 34 : 36 - 28 * P.stand) * D;
  const pelvis = [-0.08 + 0.05 * P.stand, 0.02 * Math.sin(P.hipT * D), 1.0 + 0.04 * P.stand];
  const sc = add(pelvis, [Math.sin(tilt) * 0.6, 0, Math.cos(tilt) * 0.6]);
  const ax = (deg) => [Math.sin(deg * D), Math.cos(deg * D), 0];      // the shoulder (or hip) line, left end
  const sh = ax(P.turn), hp = ax(P.hipT);
  const Ls = add(sc, sh, 0.2), Rs = add(sc, sh, -0.2);
  const Lh = add(pelvis, hp, 0.15), Rh = add(pelvis, hp, -0.15);
  // the swing plane: through the ball and the shoulders' middle, along the target line
  const C = putt ? add(sc, [0.02, 0, -0.05]) : sc;
  const u = norm(sub(C, ball)), T = [0, 1, 0];
  const R = putt ? 0.62 : 0.66, L = len(sub(C, ball)) - R;
  const th = P.th * D, hands = add(C, add([-u[0] * Math.cos(th), -u[1] * Math.cos(th) - T[1] * Math.sin(th), -u[2] * Math.cos(th)], [0, 0, 0]), R);
  const ph = (P.th + P.hinge) * D;
  const cd = [-u[0] * Math.cos(ph), -u[1] * Math.cos(ph) - Math.sin(ph), -u[2] * Math.cos(ph)];
  const head = add(hands, cd, L);
  // the head: over the ball until it is struck, then up with the body
  const neck = add(sc, [Math.sin(tilt) * 0.1, 0, Math.cos(tilt) * 0.1]);
  const hd = add(neck, [Math.sin(tilt + 0.25) * 0.13 * (1 - 0.6 * P.stand), 0.1 * P.stand * (P.th < 0 ? 1 : 0), 0.13]);
  const knee = (s) => [0.1 - 0.06 * P.stand + (s > 0 ? 0 : 0.02), s * 0.19 + (s > 0 ? -0.04 : 0.06) * Math.sin(P.hipT * D) * -1, 0.52 + 0.04 * P.stand];
  const foot = (s) => [0.02, s * 0.21, 0.04];
  // the trail heel comes up in the finish
  const rFoot = P.th < -60 ? [0.02 + 0.05 * P.stand, -0.19, 0.04 + 0.08 * P.stand] : foot(-1);
  const rKnee = P.th < -60 ? add(knee(-1), [0.05 * P.stand, 0.08 * P.stand, -0.03 * P.stand]) : knee(-1);
  return { pelvis, sc, Ls, Rs, Lh, Rh, hands, club: head, hd, neck, Lk: knee(1), Rk: rKnee, Lf: foot(1), Rf: rFoot, cd, faceDir: P.turn, tilt };
}

// ---- the rasteriser ---------------------------------------------------------------------------------
const RGB = new Map();
const rgb = (h) => { let v = RGB.get(h); if (!v) { v = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; RGB.set(h, v); } return v; };
const sh = (h, k) => { const [r, g, b] = rgb(h); const c = (v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, "0"); return `#${c(r)}${c(g)}${c(b)}`; };
const LX = -0.62, LY = -0.78;   // the light, from the upper left
function makeBuf() { return { d: new Uint8ClampedArray(GW * GH * 4) }; }
function put(B, x, y, col) {
  if (x < 0 || y < 0 || x >= GW || y >= GH) return;
  const i = (y * GW + x) * 4, [r, g, b] = rgb(col);
  B.d[i] = r; B.d[i + 1] = g; B.d[i + 2] = b; B.d[i + 3] = 255;
}
// a capsule from a to b, radius r (px), three tones across it
function capsule(B, a, b, r, [lo, mid, hi]) {
  const x0 = Math.floor(Math.min(a[0], b[0]) - r - 1), x1 = Math.ceil(Math.max(a[0], b[0]) + r + 1);
  const y0 = Math.floor(Math.min(a[1], b[1]) - r - 1), y1 = Math.ceil(Math.max(a[1], b[1]) + r + 1);
  const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy || 1e-6;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5;
    const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / L2));
    const ox = px - a[0] - t * vx, oy = py - a[1] - t * vy, d = Math.hypot(ox, oy);
    if (d > r) continue;
    const l = r > 1.2 ? (ox * LX + oy * LY) / r : 0;
    put(B, x, y, l > 0.35 ? hi : l < -0.3 ? lo : mid);
  }
}
function quad(B, pts, [lo, mid, hi], fold = null) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const cx = (x0 + x1) / 2, w = Math.max(1, x1 - x0);
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
    const px = x + 0.5, py = y + 0.5;
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
    }
    if (!c) continue;
    const k = (px - cx) / w;
    let col = k < -0.28 ? hi : k > 0.3 ? lo : mid;
    if (fold && Math.abs(px - fold) < 0.6 && py > y0 + 3) col = lo;
    put(B, x, y, col);
  }
}
function ellipse(B, cx, cy, rx, ry, fill) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
    const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
    if (u * u + v * v <= 1) put(B, x, y, fill(u, v));
  }
}
function line(B, a, b, col) {
  let x0 = Math.round(a[0]), y0 = Math.round(a[1]);
  const x1 = Math.round(b[0]), y1 = Math.round(b[1]);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy2 = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (let k = 0; k < 400; k++) {
    put(B, x0, y0, col);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy2; }
  }
}
function outline(B, col = "#120c14") {
  const d = B.d, o = [];
  const solid = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH && d[(y * GW + x) * 4 + 3] === 255;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    if (solid(x, y)) continue;
    if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) o.push(x, y);
  }
  for (let i = 0; i < o.length; i += 2) { put(B, o[i], o[i + 1], col); d[(o[i + 1] * GW + o[i]) * 4 + 3] = 254; }
}

// ---- the golfer -----------------------------------------------------------------------------------
const CACHE = new Map();
let CANVAS = null;
// look: {skin, hair, shirt, pants, cap, glove}; -> a canvas GW x GH, feet at (GOX, GOY)
export function golferCanvas(pose, look = {}) {
  const key = `${pose.putt ? 1 : 0}|${pose.th.toFixed(1)}|${pose.hinge.toFixed(1)}|${pose.turn.toFixed(1)}|${pose.hipT.toFixed(1)}|${pose.stand.toFixed(2)}|${look.shirt}|${look.pants}|${look.skin}|${look.hair}|${look.cap}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const B = makeBuf(), S = skeleton(pose);
  const shirt = look.shirt || "#3cbcfc", pants = look.pants || "#7c7c7c", skin = look.skin || "#e8a070", hair = look.hair || "#503000", cap = look.cap || "#fcfcfc", glove = look.glove || "#fcfcfc";
  const T3 = (c) => [sh(c, 0.62), c, sh(c, 1.22)];
  const SH = T3(shirt), PA = T3(pants), SK = T3(skin), CP = T3(cap);
  const P = (q) => proj(q);
  const parts = [];
  const part = (pts3, f) => { const d = pts3.reduce((a, q) => a + P(q)[2], 0) / pts3.length; parts.push({ d, f }); };
  // legs and feet
  for (const [hip, knee, foot] of [[S.Lh, S.Lk, S.Lf], [S.Rh, S.Rk, S.Rf]]) {
    part([hip, knee, foot], () => {
      capsule(B, P(hip), P(knee), 4.4, PA); capsule(B, P(knee), P(foot), 3.8, PA);
      const f = P(foot), toe = P(add(foot, [0.12, 0, -0.01]));
      capsule(B, f, toe, 2.6, ["#5c5c64", "#e8e8ec", "#fcfcfc"]);
      put(B, Math.round(f[0]) - 1, Math.round(f[1]) + 2, "#202024");
    });
  }
  // the hips and the trunk (the back of the polo): solid capsules, so a turned body keeps its bulk
  part([S.pelvis, S.sc], () => {
    const pv = P(S.pelvis), sc = P(S.sc), mid = P(add(S.pelvis, sub(S.sc, S.pelvis), 0.35));
    capsule(B, P(S.Lh), P(S.Rh), 6.2, PA);
    capsule(B, [pv[0], pv[1] - 3], mid, 7.4, SH);
    capsule(B, mid, sc, 8.6, SH);
    capsule(B, P(S.Ls), P(S.Rs), 5.4, SH);
    // the belt, and the polo's centre seam down the back
    line(B, [P(S.Lh)[0], P(S.Lh)[1] - 5], [P(S.Rh)[0], P(S.Rh)[1] - 5], "#24202a");
    line(B, [pv[0], pv[1] - 8], [sc[0], sc[1] + 3], SH[0]);
    capsule(B, P(S.neck), P(add(S.sc, sub(S.neck, S.sc), 0.4)), 2.8, SK);
  });
  // the head: hair at the nape, an ear, the cap (its brim the way he looks)
  part([S.hd], () => {
    const h = P(S.hd), bx = Math.cos(S.tilt) * 0.0;
    void bx;
    ellipse(B, h[0], h[1], 5.6, 6.4, (u, v) => (v > 0.25 ? (u < -0.1 ? sh(hair, 1.15) : hair) : u > 0.55 ? SK[0] : hair));
    put(B, Math.round(h[0] + 4), Math.round(h[1] + 1), SK[1]); put(B, Math.round(h[0] + 4), Math.round(h[1] + 2), SK[0]);
    ellipse(B, h[0], h[1] - 3.2, 6, 3.6, (u, v) => (v < -0.3 && u < 0 ? CP[2] : u > 0.4 ? CP[0] : CP[1]));
    // the brim: toward the ball at address, toward the target in the finish
    const face = (S.faceDir < -60 ? [0, 1, 0] : [1, 0, -0.4]);
    const br = P(add(S.hd, face, 0.12));
    capsule(B, [h[0], h[1] - 2.2], [br[0], br[1] - 2.2], 1.6, CP);
    line(B, [h[0] - 5, h[1] - 0.5], [h[0] + 5, h[1] - 0.5], sh(cap, 0.5));
  });
  // the arms: the lead arm straight, the trail arm folding; a glove on the lead hand
  const elbow = (s, hnd) => { const m = add(s, sub(hnd, s), 0.5); return add(m, [-0.03, 0, -0.07]); };
  for (const [s, gl] of [[S.Ls, true], [S.Rs, false]]) part([s, S.hands], () => {
    const e = elbow(s, S.hands);
    capsule(B, P(s), P(e), 3.1, SH);
    capsule(B, P(add(e, sub(e, s), -0.15)), P(S.hands), 2.5, SK);
    if (gl) ellipse(B, P(S.hands)[0], P(S.hands)[1], 2.3, 2.3, (u) => (u > 0.3 ? sh(glove, 0.75) : glove));
  });
  // the club: grip, shaft, head
  part([S.hands, S.club], () => {
    const a = P(S.hands), b = P(S.club), g = P(add(S.hands, S.cd, 0.14));
    line(B, a, g, "#202024");
    line(B, g, b, "#c8ccd4");
    line(B, [g[0] + 1, g[1]], [b[0] + 1, b[1]], "#7c808c");
    const toe = P(add(S.club, pose.putt ? [0, 0.06, 0] : [0.04, 0.05, 0]));
    capsule(B, b, toe, pose.putt ? 1.6 : 2.2, ["#24242c", "#50505c", "#a0a4b0"]);
  });
  parts.sort((p, q) => q.d - p.d).forEach(p => p.f());
  outline(B);
  if (!CANVAS || typeof document === "undefined") { /* browser only */ }
  const c = document.createElement("canvas");
  c.width = GW; c.height = GH;
  const g = c.getContext("2d"), img = g.createImageData(GW, GH);
  img.data.set(B.d);
  g.putImageData(img, 0, 0);
  if (CACHE.size > 90) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key, c);
  return c;
}
