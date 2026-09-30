// THE SHARED ANIMATION RIG (docs/CITY_SPEC.md "Animation rig"; ROADMAP item 10). Every
// subject's own sprite, cut into body parts at load time and moved by one set of keyframed
// animations: wave, clap, cheer, dance, run, swim, ski, golf, deal, type... No image is
// generated and nobody is redrawn; the face and the outfit stay theirs.
//
// The cut (splitParts), from the style-C proportions (docs/avatar-design-system.md: 45 px
// body, head about a quarter, feet on row 46) and the sprite's own pixels:
//   head     rows above the NECK (the narrowest row just under the head), the run of pixels
//            around the head's centre; anything beside it at that height is a raised hand
//   arms     from the neck to the hands (about hip + 4), everything outside the TORSO CORE:
//            the core is the shoulder row's width less an arm on each side, nudged to the
//            outline seam between arm and body where the sprite draws one. A held prop is
//            outside the core, so it stays with its hand; a long prop (a staff, a bat) that
//            runs below the hands, clear of the legs, goes with the hand too. Each arm is two
//            segments, upper and fore, split at the elbow (halfway).
//   legs     from the hip (27 rows under the head top, poses.js HIP) down, split left and
//            right at the gap between the feet
//   torso    everything else
// A long dress, a robe or a chair (the lower body as wide as the shoulders) keeps its
// skirt: the legs are one piece and move only as a whole, the arms stop at the waist.
// Every opaque pixel is in exactly one part (scripts/check-rig.mjs holds that for every
// repo sprite and a sample of referral sprites).
//
// An animation is a few keyframes (4 to 8, each held, never tweened: crisp) of small
// transforms on those parts: an offset for the body, the head, the torso; an angle for each
// arm segment and leg. Angles are in degrees, 0 = hanging as drawn, positive = OUTWARD (away
// from the body's middle, up through the side), for either arm; a forearm's angle is
// relative to its upper arm. Rotated parts are cut once per angle (15-degree steps) with
// nearest-neighbour sampling and cached, so a frame is only drawImage calls: no pixel work.
//
// Pure down to "Browser only" (node checks run it); the rest draws on a 2D context.

export const RW = 32, RH = 48;
export const HIP_ROWS = 27;            // poses.js HIP: rows kept above a seat
export const SHIN_ROW = 38;            // poses.js SHIN: from here down the lower legs show on a seat
export const INK = [24, 16, 32, 255];  // #181020, the house outline
export const PART = { head: 1, torso: 2, uaL: 3, faL: 4, uaR: 5, faR: 6, legL: 7, legR: 8 };
export const PART_NAMES = ["", "head", "torso", "uaL", "faL", "uaR", "faR", "legL", "legR"];
const STEP = 15;                       // rotation cache step, degrees

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

// rgba: Uint8(Clamped)Array of the whole sheet (sheetW x RH); frame 0 is cut.
// -> {label: Uint8Array(RW*RH) (PART ids, 0 = empty), top, bottom, neck, hip, cx, skirt,
//     shoulder: {L:[x,y], R:[x,y]}, elbow: {L:[x,y], R:[x,y]}, hipPivot: {L,R}, px: Uint32Array
//     (the frame's pixels as 0xAABBGGRR... packed RGBA bytes), heavy: {L, R}}
export function splitParts(rgba, sheetW = RW) {
  const W = RW, H = RH;
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = (y * sheetW + x) * 4, d = (y * W + x) * 4;
    px[d] = rgba[s]; px[d + 1] = rgba[s + 1]; px[d + 2] = rgba[s + 2]; px[d + 3] = rgba[s + 3];
  }
  const op = (x, y) => x >= 0 && x < W && y >= 0 && y < H && px[(y * W + x) * 4 + 3] > 0;
  const ink = (x, y) => { const o = (y * W + x) * 4; return px[o + 3] > 0 && lum(px[o], px[o + 1], px[o + 2]) < 48; };
  const label = new Uint8Array(W * H);
  let top = -1, bottom = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (op(x, y)) { if (top < 0) top = y; bottom = y; }
  if (top < 0) return { label, top: 0, bottom: 0, empty: true, px };
  const bodyH = bottom - top + 1;
  // the run of opaque pixels through column cx on row y
  const runAt = (y, cx) => {
    if (!op(cx, y)) { let best = null; for (let d = 1; d < 5 && !best; d++) { if (op(cx - d, y)) cx = cx - d, best = 1; else if (op(cx + d, y)) cx = cx + d, best = 1; } if (!best) return null; }
    let a = cx, b = cx; while (op(a - 1, y)) a--; while (op(b + 1, y)) b++; return [a, b];
  };

  // the head: its centre from the top rows, the neck the narrowest row under it
  // (a prop reaching the top rows, a paddle or a staff, is a separate run: take the run
  // nearest the middle of the frame on each row, at least 5 wide)
  let sx = 0, n = 0;
  for (let y = top + 2; y < top + 9; y++) {
    let bestRun = null;
    for (let x = 0; x < W; x++) {
      if (!op(x, y) || op(x - 1, y)) continue;
      let e = x; while (op(e + 1, y)) e++;
      const c = (x + e) / 2;
      if (e - x + 1 >= 5 && (!bestRun || Math.abs(c - 15.5) < Math.abs(bestRun - 15.5))) bestRun = c;
    }
    if (bestRun != null) { sx += bestRun; n++; }
  }
  let hx = n ? Math.round(sx / n) : 16;
  hx = Math.max(10, Math.min(21, hx));
  const scale = bodyH / 46;
  const n0 = top + Math.round(8 * scale), n1 = top + Math.round(14 * scale);
  let neck = top + Math.round(11 * scale), best = 1e9;
  for (let y = n0; y <= n1; y++) { const r = runAt(y, hx), w = r ? r[1] - r[0] + 1 : 0; if (w && w < best) { best = w; neck = y; } }
  // head: the run through hx on each row above the neck; the rest of those rows is a hand
  let headX0 = W, headX1 = -1;
  for (let y = top; y < neck; y++) {
    const r = runAt(y, hx);
    if (!r) continue;
    for (let x = r[0]; x <= r[1]; x++) label[y * W + x] = PART.head;
    headX0 = Math.min(headX0, r[0]); headX1 = Math.max(headX1, r[1]);
  }

  // the shoulders and the torso core
  const shoulderY = Math.min(bottom, neck + Math.max(2, Math.round(3 * scale)));
  let sr = null;
  for (let y = shoulderY; y <= shoulderY + 3 && !sr; y++) { const r = runAt(y, hx); if (r && r[1] - r[0] >= 8) sr = r; }
  if (!sr) sr = [hx - 8, hx + 8];
  // a prop at shoulder height widens the run: clamp to a plausible shoulder span
  const s0 = Math.max(sr[0], hx - 11), s1 = Math.min(sr[1], hx + 11);
  const hip = Math.min(bottom - 4, top + Math.round(HIP_ROWS * scale));
  const armW = Math.max(3, Math.round(4 * scale));
  const seam = (from, to, dir) => {
    // the column (from..to) with the most outline pixels between the shoulder and the hip,
    // counting only pixels with body on both sides (an inner line, not the silhouette edge)
    let bc = -1, bn = 0;
    for (let c = from; dir > 0 ? c <= to : c >= to; c += dir) {
      let k = 0;
      for (let y = shoulderY + 2; y < hip; y++) if (ink(c, y) && op(c - 1, y) && op(c + 1, y)) k++;
      if (k > bn) { bn = k; bc = c; }
    }
    return bn >= Math.max(4, (hip - shoulderY) * 0.35) ? bc : -1;
  };
  let coreL = s0 + armW, coreR = s1 - armW;
  const sl = seam(s0 + 2, s0 + armW + 2, 1), srr = seam(s1 - 2, s1 - armW - 2, -1);
  if (sl >= 0) coreL = sl; if (srr >= 0) coreR = srr;
  if (coreR - coreL < 5) { const m = (coreL + coreR) >> 1; coreL = m - 3; coreR = m + 3; }

  // skirt: the lower body (below the hands) about as wide as the shoulders
  // (wider than the widest row of the torso, arms included: trousers never are)
  let wide = 0, rows = 0, upper = 0;
  for (let y = shoulderY; y < hip; y++) { const r = runAt(y, hx); if (r) upper = Math.max(upper, Math.min(r[1], hx + 12) - Math.max(r[0], hx - 12) + 1); }
  for (let y = hip + 8; y <= bottom - 3; y++) { const r = runAt(y, hx); if (r) { wide += r[1] - r[0] + 1; rows++; } }
  const skirt = rows > 0 && wide / rows >= upper - 1;
  const handY = skirt ? Math.min(hip, top + Math.round(25 * scale)) : Math.min(bottom - 6, hip + Math.round(4 * scale));

  // the legs' columns (at the feet) and the gap between them
  const lr0 = Math.max(hip + 4, bottom - 10);
  let fx0 = W, fx1 = -1;
  for (let y = bottom - 3; y <= bottom; y++) { const r = runAt(y, hx); if (r) { fx0 = Math.min(fx0, r[0]); fx1 = Math.max(fx1, r[1]); } }
  if (fx1 < 0) { fx0 = coreL; fx1 = coreR; }
  let gap = hx, gn = 1e9;
  for (let c = hx - 3; c <= hx + 3; c++) { let k = 0; for (let y = lr0; y <= bottom - 1; y++) if (op(c, y)) k++; if (k < gn) { gn = k; gap = c; } }

  // assign the rest
  // each arm ends where its side of the core stops carrying colour (an outline alone is the
  // body's edge): a hand hanging at the hip runs to handY, arms folded over the chest end there
  const handOf = (left) => {
    let last = shoulderY + 3;
    for (let y = shoulderY; y <= handY; y++) {
      let k = 0;
      for (let x = 0; x < W; x++) if ((left ? x < coreL : x > coreR) && op(x, y) && !ink(x, y)) k++;
      if (k >= 2) last = y; else if (y > last + 1) break;
    }
    return Math.max(shoulderY + 4, last);
  };
  const hand = { L: handOf(true), R: handOf(false) };
  const elbowOf = (k) => Math.round((shoulderY + hand[k]) / 2);
  const elb = { L: elbowOf("L"), R: elbowOf("R") };
  const elbowY = Math.round((elb.L + elb.R) / 2);
  const beside = { L: 0, R: 0 };
  for (let y = top; y <= bottom; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!op(x, y) || label[i]) continue;
    const left = x < coreL, right = x > coreR;
    if (y < neck) { label[i] = PART.head; beside[x < hx ? "L" : "R"]++; continue; }   // beside the head: a raised hand, a bat on the shoulder; it stays put
    if (left && y <= hand.L) { label[i] = y < elb.L ? PART.uaL : PART.faL; continue; }
    if (right && y <= hand.R) { label[i] = y < elb.R ? PART.uaR : PART.faR; continue; }
    if (y >= hip) { label[i] = skirt || x < gap ? PART.legL : PART.legR; continue; }
    label[i] = PART.torso;
  }
  // a long prop below the hands, clear of the legs and touching a forearm, goes with it
  if (!skirt) {
    let grew = true;
    while (grew) {
      grew = false;
      for (let y = handY + 1; y <= bottom; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, l = label[i];
        if (!(l === PART.legL || l === PART.legR || l === PART.torso) || (x >= fx0 - 1 && x <= fx1 + 1)) continue;
        // thin only (a staff, a bat, a crook): a coat's hem is wide and stays with the body
        let a = x, b = x;
        while (a > 0 && op(a - 1, y) && (a - 1 < fx0 - 1 || a - 1 > fx1 + 1)) a--;
        while (b < W - 1 && op(b + 1, y) && (b + 1 < fx0 - 1 || b + 1 > fx1 + 1)) b++;
        if (b - a + 1 > 3) continue;
        const nb = [label[i - W], x > 0 ? label[i - 1] : 0, x < W - 1 ? label[i + 1] : 0];
        const f = nb.find(v => v === PART.faL || v === PART.faR);
        if (f) { label[i] = f; grew = true; }
      }
    }
  }

  // pivots, in pixel-centre coordinates
  const centreOf = (part, y0, y1) => { let s = 0, k = 0; for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) if (label[y * W + x] === part) { s += x + 0.5; k++; } return k ? s / k : null; };
  // the shoulder joint sits at the arm's inner edge, against the body, so a raised arm
  // stays on its shoulder
  const shL = coreL - 0.5, shR = coreR + 1.5;
  const elL = centreOf(PART.uaL, elb.L - 2, elb.L - 1) ?? shL;
  const elR = centreOf(PART.uaR, elb.R - 2, elb.R - 1) ?? shR;
  const lgL = centreOf(PART.legL, hip, hip + 2) ?? gap - 2;
  const lgR = centreOf(PART.legR, hip, hip + 2) ?? gap + 2;
  const count = (p) => { let k = 0; for (const v of label) if (v === p) k++; return k; };
  // heavy: an arm with a big prop swings only a little; posed: an arm drawn raised (its hand
  // beside the head, kept with the head) does not move at all
  const reach = (a, b) => { let x0 = W, x1 = -1, y0 = H, y1 = -1; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = label[y * W + x]; if (v === a || v === b) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } } return { w: x1 - x0 + 1, y0, y1 }; };
  const isHeavy = (a, b) => { const r = reach(a, b); return count(a) + count(b) > 170 || r.w > 13 || r.y1 > handY + 6 || r.y0 < shoulderY - 4 || (count(a) + count(b)) / Math.max(1, r.y1 - r.y0 + 1) > 6.5; };   // (a sleeve that wide is a cape or a robe)
  void elbowY;
  const heavy = { L: isHeavy(PART.uaL, PART.faL), R: isHeavy(PART.uaR, PART.faR) };
  const posed = { L: beside.L >= 4, R: beside.R >= 4 };
  return {
    label, px, top, bottom, neck, hip, handY, hand, shoulderY, cx: hx, gap, skirt, heavy, posed, coreL, coreR,
    shoulder: { L: [shL, shoulderY + 0.5], R: [shR, shoulderY + 0.5] },
    elbow: { L: [elL, elb.L + 0.5], R: [elR, elb.R + 0.5] },
    hipPivot: { L: [lgL, hip + 0.5], R: [lgR, hip + 0.5] },
  };
}

// The pixels of one part, optionally with an outline where it met the listed other parts
// (a limb swung away shows an edge, not a cut). -> [{x, y, c: [r,g,b,a]}]
export function partPixels(sp, part, outlineAgainst = null) {
  const out = [], W = RW, L = sp.label;
  for (let y = 0; y < RH; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (L[i] === part) { const o = i * 4; out.push({ x, y, c: [sp.px[o], sp.px[o + 1], sp.px[o + 2], sp.px[o + 3]] }); }
  }
  if (outlineAgainst) {
    const seen = new Set();
    for (const p of out.slice()) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + dx, y = p.y + dy;
      if (x < 0 || y < 0 || x >= W || y >= RH) continue;
      const k = y * W + x;
      if (L[k] === part || !outlineAgainst.includes(L[k]) || seen.has(k)) continue;
      seen.add(k); out.push({ x, y, c: INK, edge: true });
    }
  }
  return out;
}

// Rotate a pixel list about a pivot (pixel-centre coords) by deg, nearest-neighbour, into
// an image: -> {x0, y0, w, h, rgba} where pixel (i, j) sits at (x0 + i, y0 + j).
export function rotatePixels(pixels, pivot, deg) {
  if (!pixels.length) return { x0: 0, y0: 0, w: 0, h: 0, rgba: new Uint8ClampedArray(0) };
  const a = (deg * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
  if (deg % 360 === 0) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pixels) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, rgba = new Uint8ClampedArray(w * h * 4);
    for (const p of pixels) rgba.set(p.c, ((p.y - y0) * w + (p.x - x0)) * 4);
    return { x0, y0, w, h, rgba };
  }
  const src = new Map();
  for (const p of pixels) src.set(p.y * 1000 + p.x, p);
  const [px, py] = pivot;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pixels) for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const dx = p.x + ox - px, dy = p.y + oy - py;
    const X = px + dx * cs - dy * sn, Y = py + dx * sn + dy * cs;
    x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y);
  }
  x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.ceil(x1); y1 = Math.ceil(y1);
  const w = x1 - x0, h = y1 - y0, rgba = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const dx = x0 + i + 0.5 - px, dy = y0 + j + 0.5 - py;
    const sx = Math.floor(px + dx * cs + dy * sn), sy = Math.floor(py - dx * sn + dy * cs);
    const p = src.get(sy * 1000 + sx);
    if (p) rgba.set(p.c, (j * w + i) * 4);
  }
  return { x0, y0, w, h, rgba };
}

// ---- the animations -------------------------------------------------------------------------
// A frame: {b: [dx,dy] whole body, t: [dx,dy] torso+head+arms, h: [dx,dy] head extra,
//   aL/aR: [upper, fore] degrees (outward; fore relative), lL/lR: degrees (outward) | [deg, dx, dy],
//   p: a prop overlay name, clip: sprite row below which the upper body is under water}
// An anim: {fps, frames, key (the held pose under reduced motion), seat?, props?}
const F = (o) => o;
export const ANIMS = {
  // the standing breath: shoulders up a pixel now and then
  idle:    { fps: 2, key: 0, frames: [F({}), F({}), F({ h: [0, 1] }), F({})] },
  wave:    { fps: 6, key: 1, frames: [F({ aL: [150, 20] }), F({ aL: [150, -10] }), F({ aL: [150, 25] }), F({ aL: [150, -15] })] },
  clap:    { fps: 6, key: 1, front: true, frames: [F({ aL: [25, -95], aR: [25, -95] }), F({ aL: [15, -125], aR: [15, -125] }), F({ aL: [25, -95], aR: [25, -95] }), F({ aL: [15, -125], aR: [15, -125], b: [0, -1] })] },
  cheer:   { fps: 5, key: 1, frames: [F({ aL: [140, 10], aR: [140, 10] }), F({ aL: [155, 0], aR: [155, 0], b: [0, -2], lL: 10, lR: 10 }), F({ aL: [140, 10], aR: [140, 10] }), F({ aL: [155, 0], aR: [155, 0], b: [0, -2], lL: 10, lR: 10 })] },
  point:   { fps: 3, key: 1, frames: [F({ aL: [75, 0] }), F({ aL: [90, 0], h: [-1, 0] }), F({ aL: [90, 0], h: [-1, 0] }), F({ aL: [85, 0] })] },
  talk:    { fps: 3, key: 0, front: true, frames: [F({ aL: [30, -60] }), F({ aL: [40, -50], h: [0, 1] }), F({ aL: [20, -70], aR: [25, -55] }), F({ aR: [35, -45], h: [0, 1] }), F({}), F({ aL: [30, -60] })] },
  dance:   { fps: 5, key: 0, frames: [F({ aL: [140, 20], aR: [30, -40], b: [-1, 0], t: [-1, 0] }), F({ aL: [60, 60], aR: [60, 60], b: [0, -1], lL: 15 }), F({ aR: [140, 20], aL: [30, -40], b: [1, 0], t: [1, 0] }), F({ aL: [60, 60], aR: [60, 60], b: [0, -1], lR: 15 })] },
  dance2:  { fps: 5, key: 0, frames: [F({ aR: [150, 0], aL: [20, -30], b: [1, 0], lR: 20 }), F({ aR: [150, 0], aL: [20, -30], b: [1, 0] }), F({ aL: [60, -80], aR: [10, 0], b: [-1, 0], lL: 20 }), F({ aL: [60, -80], aR: [10, 0], b: [-1, 0] })] },
  run:     { fps: 10, key: 0, frames: [F({ aL: [45, -70], aR: [-35, 20], lL: 30, lR: -25, t: [-1, 0], b: [0, -1] }), F({ aL: [15, -60], aR: [-10, 30], lL: 10, lR: -5, t: [-1, 0] }), F({ aL: [-35, 20], aR: [45, -70], lL: -25, lR: 30, t: [-1, 0], b: [0, -1] }), F({ aL: [-10, 30], aR: [15, -60], lL: -5, lR: 10, t: [-1, 0] })] },
  jump:    { fps: 6, key: 2, frames: [F({ t: [0, 2], aL: [20, 0], aR: [20, 0] }), F({ b: [0, -3], aL: [120, 0], aR: [120, 0], lL: 15, lR: 15 }), F({ b: [0, -5], aL: [160, 0], aR: [160, 0], lL: 25, lR: 25 }), F({ b: [0, -3], aL: [120, 0], aR: [120, 0], lL: 10, lR: 10 }), F({ t: [0, 2], aL: [30, 0], aR: [30, 0] }), F({})] },
  shrug:   { fps: 3, key: 1, front: true, frames: [F({}), F({ aL: [10, 75], aR: [10, 75], h: [0, 1] }), F({ aL: [10, 75], aR: [10, 75], h: [0, 1] }), F({})] },
  sittalk: { fps: 3, key: 0, front: true, seat: true, frames: [F({ aL: [20, -60] }), F({ aL: [35, -50], h: [0, 1] }), F({ aL: [20, -70], aR: [20, -60] }), F({ h: [0, 1] }), F({}), F({ aR: [30, -50] })] },
  facepalm:{ fps: 3, key: 2, front: true, frames: [F({}), F({ aL: [40, 120] }), F({ aL: [45, 150], h: [0, 1], t: [0, 1] }), F({ aL: [45, 150], h: [0, 1], t: [0, 1] }), F({ aL: [45, 150], h: [1, 1], t: [0, 1] }), F({ aL: [40, 120] })] },
  stumble: { fps: 5, key: 2, frames: [F({}), F({ t: [-1, 0], h: [-1, 0], lL: 20 }), F({ b: [-2, 0], t: [-2, 1], h: [-1, 0], aL: [110, 30], aR: [120, 20], lL: 25, lR: -10 }), F({ b: [-3, 0], t: [-2, 2], aL: [130, 10], aR: [100, 40], lR: -20 }), F({ b: [-3, 0], t: [-1, 0], aL: [40, 0], aR: [60, 0] }), F({ b: [-3, 0] }), F({ b: [-2, 0] }), F({ b: [-1, 0] })] },
  swim:    { fps: 5, key: 0, clip: true, frames: [F({ b: [0, 9], aL: [170, 0], aR: [20, 0], p: "water" }), F({ b: [0, 9], aL: [110, 0], aR: [70, 0], p: "water" }), F({ b: [0, 9], aL: [20, 0], aR: [170, 0], p: "water" }), F({ b: [0, 9], aL: [70, 0], aR: [110, 0], p: "water" })] },
  ski:     { fps: 4, key: 0, frames: [F({ t: [-1, 2], aL: [35, -20], aR: [20, 10], lL: 5, lR: -5, p: "skis" }), F({ t: [-1, 2], aL: [40, -25], aR: [15, 10], lL: 5, lR: -5, p: "skis", b: [-1, 0] }), F({ t: [-1, 2], aL: [35, -20], aR: [20, 10], lL: 5, lR: -5, p: "skis" }), F({ t: [-1, 2], aL: [30, -15], aR: [25, 10], lL: 5, lR: -5, p: "skis", b: [1, 0] })] },
  snowboard: { fps: 3, key: 0, frames: [F({ t: [0, 2], aL: [80, 0], aR: [70, 0], lL: 15, lR: 15, p: "board" }), F({ t: [-1, 2], aL: [90, 0], aR: [60, 0], lL: 15, lR: 15, p: "board", h: [-1, 0] }), F({ t: [0, 2], aL: [80, 0], aR: [70, 0], lL: 15, lR: 15, p: "board" }), F({ t: [1, 2], aL: [70, 0], aR: [85, 0], lL: 15, lR: 15, p: "board", h: [1, 0] })] },
  golf:    { fps: 5, key: 0, frames: [F({ aL: [-10, 0], aR: [10, 0], p: "club" }), F({ aL: [-10, 0], aR: [10, 0], p: "club" }), F({ aL: [-70, 0], aR: [70, 0], p: "club", t: [1, 0] }), F({ aL: [-140, 0], aR: [140, 0], p: "club", t: [1, 0] }), F({ aL: [-10, 0], aR: [10, 0], p: "club" }), F({ aL: [70, 0], aR: [-70, 0], p: "club", t: [-1, 0] }), F({ aL: [140, 0], aR: [-140, 0], p: "club", t: [-1, 0], h: [-1, 0] }), F({ aL: [140, 0], aR: [-140, 0], p: "club", t: [-1, 0], h: [-1, 0] })] },
  deal:    { fps: 5, key: 0, front: true, frames: [F({ aL: [45, -30], aR: [20, -80], p: "deck" }), F({ aL: [70, -20], aR: [20, -80], p: "card" }), F({ aL: [85, 0], aR: [20, -80], p: "cardout" }), F({ aL: [45, -30], aR: [20, -80], p: "deck" })] },
  chips:   { fps: 3, key: 0, front: true, frames: [F({ aL: [40, -40], aR: [35, -60], p: "chips" }), F({ aL: [55, -35], aR: [45, -55], t: [-1, 0], p: "chips" }), F({ aL: [70, -25], aR: [55, -50], t: [-1, 0], p: "chipsout" }), F({ aL: [40, -40], aR: [35, -60] })] },
  arcade:  { fps: 8, key: 0, front: true, frames: [F({ aL: [55, -45], aR: [30, -75] }), F({ aL: [60, -45], aR: [30, -75] }), F({ aL: [55, -45], aR: [30, -70] }), F({ aL: [50, -45], aR: [30, -75], h: [0, 1] }), F({ aL: [55, -40], aR: [30, -75] }), F({ aL: [55, -45], aR: [30, -80] })] },
  type:    { fps: 8, key: 0, front: true, frames: [F({ aL: [35, -55], aR: [20, -75] }), F({ aL: [35, -60], aR: [20, -75] }), F({ aL: [35, -55], aR: [20, -70] }), F({ aL: [35, -55], aR: [20, -75] })] },
  sweep:   { fps: 3, key: 0, front: true, frames: [F({ aL: [30, -10], aR: [10, -35], p: "broom" }), F({ aL: [45, -10], aR: [25, -35], p: "broom", t: [-1, 0] }), F({ aL: [30, -10], aR: [10, -35], p: "broom" }), F({ aL: [15, -10], aR: [0, -35], p: "broom", t: [1, 0] })] },
  carry:   { fps: 6, key: 0, front: true, frames: [F({ aL: [40, -60], aR: [20, -85], p: "box", lL: 15, lR: -10 }), F({ aL: [40, -60], aR: [20, -85], p: "box", b: [0, -1] }), F({ aL: [40, -60], aR: [20, -85], p: "box", lL: -10, lR: 15 }), F({ aL: [40, -60], aR: [20, -85], p: "box", b: [0, -1] })] },
  phone:   { fps: 2, key: 0, front: true, frames: [F({ aL: [60, 150], p: "phone" }), F({ aL: [60, 150], p: "phone", h: [0, 1] }), F({ aL: [60, 150], p: "phone" }), F({ aL: [60, 150], aR: [20, -60], p: "phone" })] },
  // THE PIT (the master plan, 2026-09-30): stylised, non-graphic. The guard up, a bob, a jab
  // into the air in front (the leading hand, the facing side), back to the guard; nobody is
  // struck and nobody falls. Gloves drawn by the rig.
  box:     { fps: 6, key: 0, front: true, frames: [F({ aL: [30, -115], aR: [25, -120], p: "gloves" }), F({ aL: [30, -115], aR: [25, -120], b: [0, 1], p: "gloves" }), F({ aL: [80, -15], aR: [25, -120], t: [-1, 0], p: "gloves" }), F({ aL: [30, -115], aR: [25, -120], p: "gloves" }), F({ aL: [30, -115], aR: [25, -120], b: [1, 0], p: "gloves" }), F({ aL: [35, -110], aR: [65, -40], t: [-1, 0], h: [-1, 0], p: "gloves" })] },
  // the octagon: a low stance, hands open and forward, circling; a check kick now and then
  grapple: { fps: 5, key: 0, front: true, frames: [F({ t: [0, 1], aL: [45, -70], aR: [35, -80], lL: 8, lR: 8 }), F({ t: [0, 1], aL: [50, -65], aR: [40, -75], lL: 8, lR: 8, b: [-1, 0] }), F({ t: [0, 1], aL: [55, -60], aR: [35, -80], lL: 30, lR: 5 }), F({ t: [0, 1], aL: [45, -70], aR: [35, -80], lL: 8, lR: 8 }), F({ t: [0, 1], aL: [45, -70], aR: [40, -75], lL: 8, lR: 8, b: [1, 0] })] },
  // the tennis club: ready, the backswing, contact, the follow-through; the racket drawn by the rig
  tennis:  { fps: 5, key: 0, frames: [F({ aL: [30, -40], aR: [20, -50], p: "racket", t: [0, 1] }), F({ aL: [-30, 0], aR: [30, -40], p: "racket", t: [1, 0] }), F({ aL: [70, 0], aR: [20, -30], p: "racket", t: [-1, 0] }), F({ aL: [135, -10], aR: [20, -30], p: "racket", t: [-1, 0] }), F({ aL: [30, -40], aR: [20, -50], p: "racket" }), F({ aL: [30, -40], aR: [20, -50], p: "racket", b: [0, -1] })] },
};
// seated variants: the same moves from the waist up, on a seat (poses.js sit)
export const SEATED = new Set(["sittalk"]);
export const ANIM_NAMES = Object.keys(ANIMS);

const frac = (v) => ((v % 1) + 1) % 1;
// The frame at time t (seconds) for a subject at phase ph (0..1, poses.phaseOf). t <= 0
// (reduced motion) holds the key pose.
export function frameOf(name, t, ph = 0) {
  const A = ANIMS[name];
  if (!A) return null;
  if (!(t > 0)) return A.frames[A.key || 0];
  const n = A.frames.length;
  return A.frames[Math.floor(frac(t * A.fps / n + ph) * n) % n];
}

// Where every part lands in frame f: -> {parts: [{part, deg, pivot, to: [x,y]}], hands: {L,R}, ...}
// pivot: the rotation pivot in the part's own (rest) coords; to: where that pivot goes.
// Used by the drawing and by the bounds check.
const rotV = (v, deg) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; };
const q = (d) => Math.round(d / STEP) * STEP || 0;   // (never -0)
export function layout(sp, f, seat = false, front = false) {
  const b = f.b || [0, 0], t = f.t || [0, 0], hd = f.h || [0, 0];
  const up = seat ? SHIN_ROW - HIP_ROWS : 0;   // a seat: the upper body sits down onto the shins
  const tx = b[0] + t[0], ty = b[1] + t[1] + up;
  const out = [];
  const add = (part, deg, pivot, to) => out.push({ part, deg: q(deg), pivot, to });
  // legs (hip pivot); a skirt only moves as a whole
  const leg = (v) => (Array.isArray(v) ? v : [v || 0, 0, 0]);
  const [dl, lx, ly] = leg(f.lL), [dr, rx, ry] = leg(f.lR);
  if (sp.skirt || seat) add(PART.legL, 0, sp.hipPivot.L, [sp.hipPivot.L[0] + b[0] + (seat ? 0 : lx), sp.hipPivot.L[1] + (seat ? 0 : b[1] + ly)]);
  else add(PART.legL, dl, sp.hipPivot.L, [sp.hipPivot.L[0] + b[0] + lx, sp.hipPivot.L[1] + b[1] + ly]);
  if (seat) add(PART.legR, 0, sp.hipPivot.R, [sp.hipPivot.R[0] + b[0], sp.hipPivot.R[1]]);
  else add(PART.legR, -dr, sp.hipPivot.R, [sp.hipPivot.R[0] + b[0] + rx, sp.hipPivot.R[1] + b[1] + ry]);
  add(PART.torso, 0, [0, 0], [tx, ty]);
  // the head goes over raised arms (a cheer never hides the face); over the head only when the
  // hands come to the front: a clap, a facepalm, a phone at the ear (anim.front)
  const head = () => add(PART.head, 0, [0, 0], [tx + hd[0], ty + hd[1]]);
  if (front) head();
  const hands = {};
  // a one-handed move (wave, point, phone) goes to the free hand when the leading one is busy
  const busy = (k) => sp.posed[k] || sp.heavy[k];
  const swap = busy("L") && !busy("R") && f.aL && !f.aR;
  for (const side of ["L", "R"]) {
    const sgn = side === "L" ? 1 : -1;
    let [u, fo] = f["a" + (swap ? (side === "L" ? "R" : "L") : side)] || [0, 0];
    if (sp.posed[side]) { u = 0; fo = 0; }
    else if (sp.heavy[side]) { u = Math.max(-30, Math.min(30, u)); fo = Math.max(-40, Math.min(40, u + fo)) - u; }   // a big prop swings a little, not overhead
    const S = sp.shoulder[side], E = sp.elbow[side];
    const S2 = [S[0] + tx, S[1] + ty];
    const du = q(u) * sgn, df = q(u + fo) * sgn;
    const ev = rotV([E[0] - S[0], E[1] - S[1]], du);
    const E2 = [S2[0] + ev[0], S2[1] + ev[1]];
    add(side === "L" ? PART.uaL : PART.uaR, du, S, S2);
    add(side === "L" ? PART.faL : PART.faR, df, E, E2);
    const len = Math.max(4, (sp.hand[side] - sp.elbow[side][1]) + 1);
    const hv = rotV([0, len], df);
    hands[side] = [E2[0] + hv[0], E2[1] + hv[1]];
  }
  if (!front) head();
  return { parts: out, hands, tx, ty, b };
}

// The box (sprite coords) a frame covers: -> [x0, y0, x1, y1]. rotated: cache (part, deg) -> image
export function frameBox(sp, f, seat, rotated, front = false) {
  const L = layout(sp, f, seat, front);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of L.parts) {
    const img = rotated(p.part, p.deg, p.pivot);
    if (!img.w) continue;
    const ox = Math.round(p.to[0] - p.pivot[0]), oy = Math.round(p.to[1] - p.pivot[1]);
    x0 = Math.min(x0, img.x0 + ox); y0 = Math.min(y0, img.y0 + oy); x1 = Math.max(x1, img.x0 + ox + img.w); y1 = Math.max(y1, img.y0 + oy + img.h);
  }
  return [x0, y0, x1, y1];
}

// A leg swung out keeps its foot on the ground: lifted by however far the turn dropped it.
export function lift(rig, p) {
  if (!p.deg || (p.part !== PART.legL && p.part !== PART.legR)) return 0;
  const a = rig.rotated(p.part, 0, p.pivot), b = rig.rotated(p.part, p.deg, p.pivot);
  return Math.max(0, (b.y0 + b.h) - (a.y0 + a.h));
}

// A rig from raw pixels, with its rotation cache (pure; the browser wraps each image in a canvas).
export function makeRig(rgba, sheetW = RW) {
  const sp = splitParts(rgba, sheetW);
  const moving = { [PART.uaL]: [PART.torso, PART.head, PART.legL, PART.legR, PART.uaR, PART.faR], [PART.faL]: [PART.torso, PART.head, PART.legL, PART.legR, PART.uaR, PART.faR],
    [PART.uaR]: [PART.torso, PART.head, PART.legL, PART.legR, PART.uaL, PART.faL], [PART.faR]: [PART.torso, PART.head, PART.legL, PART.legR, PART.uaL, PART.faL],
    [PART.legL]: [PART.legR, PART.torso], [PART.legR]: [PART.legL, PART.torso] };
  const pix = new Map(), cache = new Map();
  const pixelsOf = (part, moved) => {
    const k = part * 2 + (moved ? 1 : 0);
    if (!pix.has(k)) pix.set(k, partPixels(sp, part, moved ? moving[part] || null : null));
    return pix.get(k);
  };
  const rotated = (part, deg, pivot) => {
    const k = `${part}|${deg}`;
    let r = cache.get(k);
    if (!r) { r = rotatePixels(pixelsOf(part, deg !== 0), pivot, deg); cache.set(k, r); }
    return r;
  };
  // the torso with an edge where a swung arm was: drawn under the arms when either moves
  const torsoEdge = { L: partPixels(sp, PART.torso, [PART.uaL, PART.faL]).filter(p => p.edge), R: partPixels(sp, PART.torso, [PART.uaR, PART.faR]).filter(p => p.edge) };
  return { sp, rotated, torsoEdge, cache };
}

// A frame composited in software at sprite scale (no props, no seat clipping): the checks'
// view of what drawRig draws. -> {x0, y0, w, h, rgba}, pad sprite px of margin all round.
export function renderFrame(rig, f, seat = false, pad = 16, clip = false, front = false) {
  const L = layout(rig.sp, f, seat, front);
  const water = clip ? rig.sp.hip - 2 + (f.b ? f.b[1] : 0) : null;
  const w = RW + 2 * pad, h = RH + 2 * pad, rgba = new Uint8ClampedArray(w * h * 4);
  let lost = 0;
  const put = (img, dx, dy, lo = -1e9, hi = 1e9) => {
    for (let j = 0; j < img.h; j++) for (let i = 0; i < img.w; i++) {
      const o = (j * img.w + i) * 4;
      if (!img.rgba[o + 3]) continue;
      if (img.y0 + dy + j < lo || img.y0 + dy + j >= hi) continue;
      const X = img.x0 + dx + i + pad, Y = img.y0 + dy + j + pad;
      if (X < 0 || Y < 0 || X >= w || Y >= h) { lost++; continue; }
      rgba.set(img.rgba.subarray(o, o + 4), (Y * w + X) * 4);
    }
  };
  for (const p of L.parts) {
    const img = rig.rotated(p.part, p.deg, p.pivot);
    const leg = p.part === PART.legL || p.part === PART.legR;
    if (leg && water != null) continue;
    const dx = Math.round(p.to[0] - p.pivot[0]), dy = Math.round(p.to[1] - p.pivot[1]) - lift(rig, p);
    if (leg && seat) put(img, dx, dy, SHIN_ROW);
    else if (p.part === PART.torso) {
      put(img, dx, dy, -1e9, water ?? (seat ? SHIN_ROW : 1e9));
      for (const side of ["L", "R"]) {
        const moved = L.parts.some(o => (o.part === (side === "L" ? PART.uaL : PART.uaR) || o.part === (side === "L" ? PART.faL : PART.faR)) && o.deg !== 0);
        if (moved && rig.torsoEdge[side].length) put(rotatePixels(rig.torsoEdge[side], [0, 0], 0), dx, dy, -1e9, water ?? (seat ? SHIN_ROW : 1e9));
      }
    }
    else put(img, dx, dy, -1e9, water ?? 1e9);
  }
  return { x0: -pad, y0: -pad, w, h, rgba, lost };
}

// ---- Browser only below ------------------------------------------------------------------
const rigs = new WeakMap();   // sheet image -> rig (or false: cannot be read)
function toCanvas(img) {
  if (!img.w) return null;
  const c = document.createElement("canvas");
  c.width = img.w; c.height = img.h;
  c.getContext("2d").putImageData(new ImageData(img.rgba, img.w, img.h), 0, 0);
  return c;
}
// The rig for a sheet ({img, frames} from spriteBank, or an image): cut once and cached.
export function rigFor(sheet) {
  const img = sheet && (sheet.img || sheet);
  if (!img || typeof document === "undefined") return null;
  let r = rigs.get(img);
  if (r !== undefined) return r || null;
  try {
    const w = img.width || RW, h = img.height || RH;
    if (!(w >= RW && h >= RH)) return null;   // not decoded yet: try again next frame
    const c = document.createElement("canvas");
    c.width = RW; c.height = RH;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(img, 0, 0, RW, RH, 0, 0, RW, RH);
    const core = makeRig(x.getImageData(0, 0, RW, RH).data, RW);
    const canv = new Map();
    const edge = (list) => toCanvas(rotatePixels(list, [0, 0], 0));
    r = {
      ...core,
      canvasOf(part, deg, pivot) {
        const k = `${part}|${deg}`;
        if (!canv.has(k)) canv.set(k, { img: core.rotated(part, deg, pivot), c: null });
        const e = canv.get(k);
        if (e.c === null) e.c = toCanvas(e.img) || false;
        return e;
      },
      edges: { L: core.torsoEdge.L.length ? { c: edge(core.torsoEdge.L), img: rotatePixels(core.torsoEdge.L, [0, 0], 0) } : null, R: core.torsoEdge.R.length ? { c: edge(core.torsoEdge.R), img: rotatePixels(core.torsoEdge.R, [0, 0], 0) } : null },
    };
    if (core.sp.empty) r = false;
  } catch { r = false; }   // a tainted or broken image: the caller falls back to poses.js
  rigs.set(img, r);
  return r || null;
}

const PROP_COL = { glove: "#dc2626", gloveD: "#7f1d1d", racket: "#e5e7eb", strings: "#fde68a", card: "#f5f5f5", deck: "#b91c1c", chip: "#facc15", chip2: "#dc2626", box: "#a16207", boxD: "#78350f", phone: "#111827", screen: "#22d3ee", wood: "#8a6a42", straw: "#d6b35a", ski: "#ef4444", pole: "#d1d5db", board: "#2563eb", club: "#d1d5db", water: "#2a5f8a", foam: "#bfe3f5" };

// Draw one subject doing an animation.
//   ctx      a 2D context
//   sheet    the subject's sheet ({img, frames} from spriteBank.sheetFor) or image
//   anim     a name in ANIMS
//   t        seconds (0 = reduced motion: the key pose, held)
//   x, y     the feet (canvas px), as poses.drawPose
//   scale    canvas px per sprite px
//   facing   1 turned right, -1/0 as drawn (the sprites face left)
//   opts     {ph: phase 0..1 (poses.phaseOf), seat: true to sit (seatY: the seat's top, canvas px)}
// -> the box drawn [x0, y0, x1, y1], or null when the sheet cannot be rigged (draw it as before).
export function drawRig(ctx, sheet, anim, t, x, y, scale, facing = 0, opts = {}) {
  const rig = rigFor(sheet);
  const A = ANIMS[anim];
  if (!rig || !A) return null;
  const f = frameOf(anim, t, opts.ph || 0);
  const seat = Boolean(opts.seat || A.seat);
  const L = layout(rig.sp, f, seat, Boolean(A.front));
  const s = scale, flip = facing === 1;
  // sprite (col, row) -> canvas: col 16 on x, row 48 on y; a seat puts sprite row 38 on seatY
  const oy = seat && opts.seatY != null ? opts.seatY - SHIN_ROW * s : y - RH * s;
  const ox = x - (RW / 2) * s;
  const X = (c) => Math.round(ox + c * s), Y = (r) => Math.round(oy + r * s);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  if (flip) { ctx.translate(Math.round(x) * 2, 0); ctx.scale(-1, 1); }
  let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
  const blit = (c, img, dx, dy, clipRow = null) => {
    if (!c) return;
    const c0 = img.x0 + dx, r0 = img.y0 + dy;
    const X0 = X(c0), Y0 = Y(r0), X1 = X(c0 + img.w), Y1 = Y(r0 + img.h);
    if (clipRow != null && r0 + img.h > clipRow) {
      const keep = clipRow - r0;
      if (keep <= 0) return;
      ctx.drawImage(c, 0, 0, img.w, keep, X0, Y0, X1 - X0, Y(clipRow) - Y0);
    } else ctx.drawImage(c, X0, Y0, X1 - X0, Y1 - Y0);
    bx0 = Math.min(bx0, X0); by0 = Math.min(by0, Y0); bx1 = Math.max(bx1, X1); by1 = Math.max(by1, Y1);
  };
  const water = A.clip ? rig.sp.hip - 2 + (f.b ? f.b[1] : 0) : null;   // swimming: under water from the waist
  const seatLine = seat ? SHIN_ROW : null;
  const moved = (side) => L.parts.some(p => (p.part === (side === "L" ? PART.uaL : PART.uaR) || p.part === (side === "L" ? PART.faL : PART.faR)) && p.deg !== 0);
  for (const p of L.parts) {
    const e = rig.canvasOf(p.part, p.deg, p.pivot);
    const dx = Math.round(p.to[0] - p.pivot[0]), dy = Math.round(p.to[1] - p.pivot[1]) - lift(rig, p);
    const isLeg = p.part === PART.legL || p.part === PART.legR;
    if (isLeg && water != null) continue;
    if (isLeg && seat) {   // on a seat only the shins show, from the seat's edge down
      if (!e.c) continue;
      const cut = SHIN_ROW - e.img.y0;
      if (cut >= e.img.h) continue;
      const from = Math.max(0, cut);
      const r0 = e.img.y0 + from, X0 = X(e.img.x0 + dx), X1 = X(e.img.x0 + dx + e.img.w);
      const Yb = Math.round(y), Yt = opts.seatY != null ? Math.round(opts.seatY) : Y(r0);
      ctx.drawImage(e.c, 0, from, e.img.w, e.img.h - from, X0, Yt, X1 - X0, Math.max(1, Yb - Yt));
      bx0 = Math.min(bx0, X0); by0 = Math.min(by0, Yt); bx1 = Math.max(bx1, X1); by1 = Math.max(by1, Yb);
      continue;
    }
    if (p.part === PART.torso) {
      blit(e.c, e.img, dx, dy, water ?? (seatLine != null ? seatLine : null));
      for (const side of ["L", "R"]) if (rig.edges[side] && moved(side)) blit(rig.edges[side].c, rig.edges[side].img, dx, dy, water ?? seatLine);
      continue;
    }
    blit(e.c, e.img, dx, dy, water);
  }
  if (f.p) prop(ctx, f.p, L, X, Y, s, t, rig.sp);
  ctx.restore();
  ctx.imageSmoothingEnabled = smooth;
  if (bx0 > bx1) return [x - 8 * s, y - RH * s, x + 8 * s, y];
  return flip ? [2 * Math.round(x) - bx1, by0, 2 * Math.round(x) - bx0, by1] : [bx0, by0, bx1, by1];
}

function prop(c, name, L, X, Y, s, t, sp) {
  const R = (col, x0, y0, w, h) => { c.fillStyle = col; c.fillRect(X(x0), Y(y0), Math.max(1, X(x0 + w) - X(x0)), Math.max(1, Y(y0 + h) - Y(y0))); };
  const [hlx, hly] = L.hands.L, [hrx, hry] = L.hands.R;
  const feet = sp.bottom + 1 + L.b[1];
  switch (name) {
    case "gloves": for (const [hx, hy] of [[hlx, hly], [hrx, hry]]) { R(PROP_COL.glove, hx - 1.5, hy - 1.5, 3, 3); R(PROP_COL.gloveD, hx - 1.5, hy + 1, 3, 1); } break;
    case "racket": {
      // the handle out past the hand along the forearm, the head an open frame with its strings
      const ax = hlx - (sp.shoulder.L[0] + L.tx), ay = hly - (sp.shoulder.L[1] + L.ty), n = Math.hypot(ax, ay) || 1;
      for (let k = 1; k <= 3; k++) R(PROP_COL.racket, hlx + (ax / n) * k, hly + (ay / n) * k, 1, 1);
      const cx = hlx + (ax / n) * 5.5, cy = hly + (ay / n) * 5.5;
      R(PROP_COL.strings, cx - 1, cy - 1, 3, 3); R(PROP_COL.racket, cx - 2, cy - 2, 5, 1); R(PROP_COL.racket, cx - 2, cy + 2, 5, 1); R(PROP_COL.racket, cx - 2, cy - 1, 1, 3); R(PROP_COL.racket, cx + 2, cy - 1, 1, 3);
      break;
    }
    case "deck": R(PROP_COL.deck, hrx - 2, hry - 1, 3, 2); break;
    case "card": R(PROP_COL.deck, hrx - 2, hry - 1, 3, 2); R(PROP_COL.card, hlx - 1, hly - 1, 2, 2); break;
    case "cardout": R(PROP_COL.deck, hrx - 2, hry - 1, 3, 2); R(PROP_COL.card, hlx - 4, hly, 2, 2); break;
    case "chips": R(PROP_COL.chip, hlx - 3, hly, 3, 1); R(PROP_COL.chip2, hlx - 3, hly - 1, 3, 1); break;
    case "chipsout": R(PROP_COL.chip, hlx - 5, hly, 3, 1); R(PROP_COL.chip2, hlx - 5, hly - 1, 3, 1); break;
    case "box": { const cx = (hlx + hrx) / 2 - 4, cy = Math.min(hly, hry) - 5; R(PROP_COL.box, cx, cy, 8, 6); R(PROP_COL.boxD, cx, cy + 2, 8, 1); break; }
    case "phone": R(PROP_COL.phone, hlx - 1, hly - 2, 2, 3); R(PROP_COL.screen, hlx - 1, hly - 2, 1, 1); break;
    case "broom": {
      const bx = (hlx + hrx) / 2;
      for (let k = 0; k < 14; k++) R(PROP_COL.wood, bx - 1 - Math.round(k * 0.45), Math.min(hly, hry) + k, 1, 1);
      const ex = bx - 1 - Math.round(14 * 0.45);
      R(PROP_COL.straw, Math.min(ex, bx - 8) - 1, feet - 3, 5, 3);
      break;
    }
    case "club": {
      const hx = (hlx + hrx) / 2, hy = (hly + hry) / 2;   // along the arms, out past the hands
      const ax = L.hands.L[0] - (sp.shoulder.L[0] + L.tx), ay = L.hands.L[1] - (sp.shoulder.L[1] + L.ty);
      const n = Math.hypot(ax, ay) || 1;
      for (let k = 1; k <= 11; k++) R(PROP_COL.club, hx + (ax / n) * k, hy + (ay / n) * k, 1, 1);
      R("#374151", hx + (ax / n) * 11 - 1, hy + (ay / n) * 11, 3, 1);
      break;
    }
    case "skis": {
      const x0 = sp.cx - 12 + L.b[0];
      R(PROP_COL.ski, x0, feet - 1, 24, 1);
      R(PROP_COL.pole, hlx - 1, hly, 1, feet - hly - 1); R(PROP_COL.pole, hrx, hry, 1, feet - hry - 1);
      break;
    }
    case "board": R(PROP_COL.board, sp.cx - 11 + L.b[0], feet - 1, 22, 2); break;
    case "water": {
      const wl = sp.hip - 2 + L.b[1];
      R(PROP_COL.water, sp.cx - 13, wl, 26, 2);
      const k = t > 0 ? Math.floor(t * 4) % 3 : 0;
      R(PROP_COL.foam, sp.cx - 11 + k * 2, wl, 3, 1); R(PROP_COL.foam, sp.cx + 4 - k, wl, 3, 1);
      break;
    }
    default:
  }
}
