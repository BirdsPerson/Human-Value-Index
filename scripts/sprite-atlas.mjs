// Sprite atlas: every repo sprite sheet (public/sprites/<slug>.png) packed into one PNG
// plus a JSON of rects, so the pen and the city make one image request instead of ~65.
// Pure node (zlib only): Netlify builds it with `npm run build`, and the Vite plugin in
// vite.config.js serves it live on the dev server. Production referral sprites are
// separate URLs drawn later by the Mac job; they stay individual and are not in here.
//
//   node scripts/sprite-atlas.mjs            write dist-free preview to stdout (sizes)
//   import { buildAtlas } from "./sprite-atlas.mjs"
//
// Output: { png: Buffer, json: { v, png, w, h, sprites: { slug: { x, y, w, h, fw, frames } } } }
//   x,y,w,h  the sheet's rect in the atlas (w = fw * frames)
//   fw       one frame's width; h is one frame's height

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { inflateSync, deflateSync, crc32 as zcrc32 } from "node:zlib";
import { createHash } from "node:crypto";

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// ---- CRC (node >= 22 ships zlib.crc32; keep a fallback) ----
let CRC_TABLE = null;
function crc32(buf) {
  if (typeof zcrc32 === "function") return zcrc32(buf) >>> 0;
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Decode an 8-bit, non-interlaced PNG to RGBA. Colour types 6 (RGBA), 2 (RGB),
// 3 (palette, with tRNS), 0 and 4 (grey). Returns null for anything else, and the
// caller leaves that sprite out of the atlas (it still loads on its own).
export function decodePng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) return null;
  let o = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0, plte = null, trns = null;
  const idat = [];
  while (o + 8 <= buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString("latin1", o + 4, o + 8), data = buf.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; interlace = data[12]; }
    else if (type === "PLTE") plte = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    o += 12 + len;
  }
  const chans = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (depth !== 8 || interlace !== 0 || !chans || !w || !h) return null;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * chans, px = Buffer.alloc(stride * h);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), out = px.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= chans ? out[i - chans] : 0, b = prev[i], c = i >= chans ? prev[i - chans] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      else if (f !== 0) return null;
      out[i] = v & 255;
    }
    prev = out;
  }
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const s = i * chans, d = i * 4;
    if (ctype === 6) { rgba[d] = px[s]; rgba[d + 1] = px[s + 1]; rgba[d + 2] = px[s + 2]; rgba[d + 3] = px[s + 3]; }
    else if (ctype === 2) { rgba[d] = px[s]; rgba[d + 1] = px[s + 1]; rgba[d + 2] = px[s + 2]; rgba[d + 3] = 255; }
    else if (ctype === 3) { const k = px[s]; if (!plte || k * 3 + 2 >= plte.length) return null; rgba[d] = plte[k * 3]; rgba[d + 1] = plte[k * 3 + 1]; rgba[d + 2] = plte[k * 3 + 2]; rgba[d + 3] = trns && k < trns.length ? trns[k] : 255; }
    else if (ctype === 0) { rgba[d] = rgba[d + 1] = rgba[d + 2] = px[s]; rgba[d + 3] = 255; }
    else { rgba[d] = rgba[d + 1] = rgba[d + 2] = px[s]; rgba[d + 3] = px[s + 1]; }
  }
  return { w, h, rgba };
}

export function encodePng(w, h, rgba) {
  const stride = w * 4, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// Pack every sheet in `dir` into rows (shelf packing, tallest first). Sheets here are all
// 64x48 today, so this is a grid in practice; the packer does not assume it.
export function buildAtlas(dir, { maxWidth = 1024 } = {}) {
  let manifest = {};
  try { manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) || {}; } catch { /* no manifest: frames from width */ }
  const files = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith(".png") && !f.startsWith("atlas")).sort() : [];
  const sheets = [], skipped = [];
  for (const f of files) {
    const slug = f.slice(0, -4);
    let img = null;
    try { img = decodePng(readFileSync(join(dir, f))); } catch { img = null; }
    if (!img) { skipped.push(slug); continue; }
    const meta = manifest[slug] || {};
    const fw = meta.w || 32, frames = Math.max(1, meta.frames || Math.floor(img.w / fw) || 1);
    sheets.push({ slug, img, fw, frames });
  }
  sheets.sort((a, b) => b.img.h - a.img.h || a.slug.localeCompare(b.slug));
  const rects = {};
  let x = 0, y = 0, rowH = 0, W = 0;
  for (const s of sheets) {
    if (x > 0 && x + s.img.w > maxWidth) { y += rowH; x = 0; rowH = 0; }
    rects[s.slug] = { x, y, w: s.img.w, h: s.img.h, fw: s.fw, frames: s.frames };
    x += s.img.w; rowH = Math.max(rowH, s.img.h); W = Math.max(W, x);
  }
  const H = y + rowH;
  const rgba = Buffer.alloc(Math.max(1, W) * Math.max(1, H) * 4);
  for (const s of sheets) {
    const r = rects[s.slug];
    for (let row = 0; row < s.img.h; row++) s.img.rgba.copy(rgba, ((r.y + row) * W + r.x) * 4, row * s.img.w * 4, (row + 1) * s.img.w * 4);
  }
  const png = encodePng(Math.max(1, W), Math.max(1, H), rgba);
  const v = createHash("sha1").update(png).digest("hex").slice(0, 10);
  const sprites = Object.fromEntries(Object.keys(rects).sort().map(k => [k, rects[k]]));
  return { png, json: { v, png: `atlas.png?v=${v}`, w: W, h: H, count: sheets.length, sprites }, skipped };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = new URL("../public/sprites/", import.meta.url).pathname;
  const { png, json, skipped } = buildAtlas(dir);
  console.log(`atlas: ${json.count} sheets, ${json.w}x${json.h}, ${png.length} bytes, v=${json.v}${skipped.length ? `; skipped ${skipped.join(", ")}` : ""}`);
}
