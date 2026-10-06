// A figure's head for the sports pages, cut from their 32 x 48 file photo (frame 0). Shared by
// THE TENNIS CLUB and THE DEPARTMENT LINKS: in a sport the body is the sport's own outfit, drawn
// by the page, so only the head comes off the photo, and whatever the figure carries in daily life
// (a pizza peel, a bat, a staff, a speech bubble) stays at home.
//
// The cut (cutHead, pure, no DOM, so scripts/check-tennis.mjs runs it on the real PNGs):
//   1. the body's axis: the middle of the widest run of each torso row, the median of them;
//   2. the head: of the opaque blobs in the top rows, the one most on that axis (a prop held
//      beside the head, a raised hand, is its own blob and is left behind);
//   3. each row keeps only its run through the crown's centre (anything across a gap goes);
//   4. the width: the face's median width, plus a pixel each side; a row wider than that is a
//      prop touching the head (a bat on a shoulder) and is trimmed; stop at the shoulders.
// If more than a few rows had to be trimmed, or the face itself is too wide, the prop is part of
// the head: -> null, and the page draws a head from the photo's skin and hair (hintsFrom).

const SW = 32, SH = 48, MAX_W = 17, MAX_H = 12;

// rgba: a Uint8ClampedArray / Buffer of the 32 x 48 frame (row stride 32 * 4, or `stride` bytes).
// -> {x0, y0, w, h, keep: Uint8Array(w * h) of 1 for kept pixels} | null
export function cutHead(rgba, stride = SW * 4) {
  const op = (x, y) => x >= 0 && y >= 0 && x < SW && y < SH && rgba[y * stride + x * 4 + 3] > 0;
  // 1. the axis
  const mids = [];
  for (let y = 22; y < 36; y++) {
    let best = 0, mid = -1;
    for (let x = 0; x < SW;) {
      if (!op(x, y)) { x++; continue; }
      let e = x; while (e < SW && op(e, y)) e++;
      if (e - x > best) { best = e - x; mid = (x + e - 1) / 2; }
      x = e;
    }
    if (best >= 4) mids.push(mid);
  }
  mids.sort((a, b) => a - b);
  const bx = mids.length ? mids[mids.length >> 1] : 15.5;
  // 2. the blob on the axis, in the top rows
  const TOP = 16, lab = new Int16Array(SW * TOP).fill(-1);
  let bestLab = -1, bestScore = 0;
  for (let y = 0, n = 0; y < TOP; y++) for (let x = 0; x < SW; x++) {
    if (!op(x, y) || lab[y * SW + x] >= 0) continue;
    const st = [[x, y]]; lab[y * SW + x] = n;
    let score = 0;
    while (st.length) {
      const [px, py] = st.pop();
      if (Math.abs(px - bx) <= 4 && py < 14) score++;
      for (const [qx, qy] of [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]]) {
        if (qy < 0 || qy >= TOP || !op(qx, qy) || lab[qy * SW + qx] >= 0) continue;
        lab[qy * SW + qx] = n; st.push([qx, qy]);
      }
    }
    if (score > bestScore) { bestScore = score; bestLab = n; }
    n++;
  }
  if (bestLab < 0 || bestScore < 6) return null;
  const inC = (x, y) => x >= 0 && x < SW && y >= 0 && y < TOP && lab[y * SW + x] === bestLab;
  let y0 = -1;
  for (let y = 0; y < TOP && y0 < 0; y++) for (let x = 0; x < SW; x++) if (inC(x, y)) { y0 = y; break; }
  // 3. the run through the crown's centre, row by row
  const runAt = (y, c) => {
    let s = Math.round(c), best = null;
    for (let d = 0; d <= 3 && !best; d++) for (const x of [s - d, s + d]) if (inC(x, y)) { best = x; break; }
    if (best === null) return null;
    let a = best, b = best;
    while (inC(a - 1, y)) a--;
    while (inC(b + 1, y)) b++;
    return [a, b];
  };
  // the crown's run; the face's width (a low third of the rows' widths: a prop or a raised arm only
  // ever widens a row); then the centre of the rows no wider than the face
  let cx = bx;
  { const r = runAt(y0, cx); if (r) cx = (r[0] + r[1]) / 2; }
  const rowsAt = (c) => { const out = []; for (let y = y0; y < Math.min(TOP, y0 + MAX_H); y++) out.push(runAt(y, c)); return out; };
  const faceOf = (rs) => { const w = rs.slice(2, 11).filter(Boolean).map(([a, b]) => b - a + 1).sort((a, b) => a - b); return w.length < 4 ? 0 : w[Math.floor(w.length / 3)]; };
  let runs = rowsAt(cx), face = faceOf(runs);
  if (!face) return null;
  { const cs = runs.slice(1, 11).filter(r => r && r[1] - r[0] + 1 <= face + 2).map(r => (r[0] + r[1]) / 2).sort((a, b) => a - b); if (cs.length) { cx = cs[cs.length >> 1]; runs = rowsAt(cx); face = faceOf(runs) || face; } }
  if (face > MAX_W - 1) return null;
  // 4. trim to the face's width (and a little hair); stop at the shoulders
  const half = (face >> 1) + 1, L = Math.max(0, Math.round(cx) - half), R = Math.min(SW - 1, Math.round(cx) + half);
  let trimmed = 0, h = 0;
  const kept = [];
  for (let k = 0; k < runs.length; k++) {
    const r = runs[k];
    if (!r) { if (k > 3) break; kept.push(null); h++; continue; }
    const w = r[1] - r[0] + 1;
    if (k > 9 && w > face + 4) break;   // the shoulders
    const a = Math.max(r[0], L), b = Math.min(r[1], R);
    if (r[0] < L - 1 || r[1] > R + 1) trimmed++;
    kept.push(a <= b ? [a, b] : null); h++;
  }
  if (trimmed > 6 || h < 6) return null;
  const W = R - L + 1, keep = new Uint8Array(W * h);
  kept.forEach((r, k) => { if (r) for (let x = r[0]; x <= r[1]; x++) keep[k * W + (x - L)] = 1; });
  return { x0: L, y0, w: W, h, keep };
}

const hex = (r, g, b) => `#${[r, g, b].map(v => v.toString(16).padStart(2, "0")).join("")}`;
// The commonest opaque colours of the photo's head rows: {skin, hair} (either may be null), for a
// head the page draws itself.
export function hintsFrom(rgba, stride = SW * 4) {
  const count = (y0, y1, x0, x1) => {
    const n = new Map();
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const o = y * stride + x * 4; if (rgba[o + 3] < 200 || rgba[o] + rgba[o + 1] + rgba[o + 2] < 60) continue;
      const k = hex(rgba[o], rgba[o + 1], rgba[o + 2]); n.set(k, (n.get(k) || 0) + 1);
    }
    return [...n].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  };
  let y0 = 0; for (; y0 < 20; y0++) { let any = false; for (let x = 8; x < 24; x++) if (rgba[y0 * stride + x * 4 + 3] > 0) any = true; if (any) break; }
  const skin = count(y0 + 4, y0 + 10, 11, 21)[0] || null;
  const hair = count(y0, y0 + 3, 9, 23).find(k => k !== skin) || null;
  return { skin, hair };
}

// ---- the browser side --------------------------------------------------------------------------
function frame0(sheet) {
  const c = document.createElement("canvas"); c.width = SW; c.height = SH;
  const x = c.getContext("2d"); x.drawImage(sheet, 0, 0, SW, SH, 0, 0, SW, SH);
  return { c, d: x.getImageData(0, 0, SW, SH).data };
}
// The head off a sheet -> canvas | null. crop: [x, y, w, h], a hand-set box that wins (golf's
// roster.js CROPS, for a figure whose prop needs a person's eye).
export function headFrom(sheet, crop = null) {
  if (!sheet) return null;
  try {
    const { c, d } = frame0(sheet);
    if (crop) { const o = document.createElement("canvas"); o.width = crop[2]; o.height = crop[3]; o.getContext("2d").drawImage(c, crop[0], crop[1], crop[2], crop[3], 0, 0, crop[2], crop[3]); return o; }
    const cut = cutHead(d);
    if (!cut) return null;
    const o = document.createElement("canvas"); o.width = cut.w; o.height = cut.h;
    const g = o.getContext("2d"), img = g.createImageData(cut.w, cut.h);
    for (let y = 0; y < cut.h; y++) for (let x = 0; x < cut.w; x++) {
      if (!cut.keep[y * cut.w + x]) continue;
      const s = ((cut.y0 + y) * SW + cut.x0 + x) * 4, t = (y * cut.w + x) * 4;
      img.data[t] = d[s]; img.data[t + 1] = d[s + 1]; img.data[t + 2] = d[s + 2]; img.data[t + 3] = d[s + 3];
    }
    g.putImageData(img, 0, 0);
    return o;
  } catch { return null; }
}
// {skin, hair} off a sheet, for the drawn head when headFrom says no.
export function sheetHints(sheet) {
  if (!sheet) return { skin: null, hair: null };
  try { return hintsFrom(frame0(sheet).d); } catch { return { skin: null, hair: null }; }
}

// A head made smaller for a far or small figure: each new pixel takes the commonest colour of the
// pixels it covers, and is opaque when at least half of them are. Cached per head and height.
const SMALL = new WeakMap();
export function shrinkHead(head, th) {
  if (!head || th >= head.height) return head;
  th = Math.max(2, th | 0);
  let m = SMALL.get(head); if (!m) { m = new Map(); SMALL.set(head, m); }
  if (m.has(th)) return m.get(th);
  const sw = head.width, sh = head.height, k = th / sh, tw = Math.max(2, Math.round(sw * k));
  const src = head.getContext("2d").getImageData(0, 0, sw, sh).data;
  const o = document.createElement("canvas"); o.width = tw; o.height = th;
  const g = o.getContext("2d"), img = g.createImageData(tw, th);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const ax = Math.floor(x / k), bx = Math.max(ax + 1, Math.floor((x + 1) / k)), ay = Math.floor(y / k), by = Math.max(ay + 1, Math.floor((y + 1) / k));
    const n = new Map(); let tot = 0, opq = 0;
    for (let yy = ay; yy < Math.min(sh, by); yy++) for (let xx = ax; xx < Math.min(sw, bx); xx++) {
      tot++; const s = (yy * sw + xx) * 4; if (src[s + 3] < 128) continue; opq++;
      const key = (src[s] << 16) | (src[s + 1] << 8) | src[s + 2]; n.set(key, (n.get(key) || 0) + 1);
    }
    if (!tot || opq * 2 < tot) continue;
    let best = 0, bn = -1; for (const [key, v] of n) if (v > bn) { bn = v; best = key; }
    const t = (y * tw + x) * 4; img.data[t] = best >> 16; img.data[t + 1] = (best >> 8) & 255; img.data[t + 2] = best & 255; img.data[t + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  m.set(th, o);
  return o;
}
