// Brand atlas checks: Scott's real marks (public/brand/atlas.{png,json}, scripts/brand_atlas.py).
//   - the atlas decodes, every rect sits inside it, none overlap, none is empty
//   - every mark the code draws (drawBrand / faceBrand / brandFits / the ad and marquee tables)
//     has sprites in the atlas
//   - a draw is always a whole-number scale of a 1x sprite, never taller than it was given
//   - neon variants carry their 2px halo round the same ink as the plain sprite
//   - every mark's source is recorded in public/brand/BRAND_SOURCES.md
//   - every reserved billboard site has an ad, and every ad a mark
//   node scripts/check-brand.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { decodePng } from "./sprite-atlas.mjs";

const root = new URL("..", import.meta.url).pathname;
let n = 0, failed = 0;
const ok = (c, msg) => { n++; if (!c) { failed++; console.log("  FAIL " + msg); } };

const dir = join(root, "public/brand");
const j = JSON.parse(readFileSync(join(dir, "atlas.json"), "utf8"));
const png = decodePng(readFileSync(join(dir, "atlas.png")));
ok(png && png.w === j.w && png.h === j.h, `atlas.png decodes at the json's size (${j.w}x${j.h})`);
ok(/^atlas\.png\?v=[0-9a-f]{10}$/.test(j.png), "the png is cache-busted by its hash");
ok(j.w * j.h <= 512 * 512, `one small atlas (${j.w}x${j.h})`);

// 1. rects: inside, disjoint, not empty
const seen = new Uint8Array(j.w * j.h);
for (const [k, s] of Object.entries(j.sprites)) {
  ok(Number.isInteger(s.x) && Number.isInteger(s.y) && s.w > 0 && s.h > 0 && s.x + s.w <= j.w && s.y + s.h <= j.h, `${k}: rect inside the atlas`);
  let ink = 0, clash = false;
  for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) {
    const i = y * j.w + x;
    if (seen[i]) clash = true;
    seen[i] = 1;
    if (png.rgba[i * 4 + 3] === 255) ink++;
  }
  ok(!clash, `${k}: no overlap`);
  ok(ink >= Math.min(8, s.w * s.h / 4), `${k}: has ink (${ink} px)`);
  ok(k === `${s.mark}${s.neon ? "-neon" : ""}-${s.size}`, `${k}: key is mark-size`);
  ok(s.neon ? s.h === s.size + 4 : s.h === s.size, `${k}: height ${s.h} matches its size ${s.size}${s.neon ? " + 2px halo each side" : ""}`);
}
// neon sprites: the plain sprite's ink, exactly, inside the halo
for (const [k, s] of Object.entries(j.sprites)) {
  if (!s.neon) continue;
  const base = j.sprites[`${s.mark}-${s.size}`];
  ok(Boolean(base) && base.w + 4 === s.w, `${k}: has its plain sprite, 2px wider each side`);
  if (!base) continue;
  let same = true;
  for (let y = 0; y < base.h && same; y++) for (let x = 0; x < base.w; x++) {
    const a = ((base.y + y) * j.w + base.x + x) * 4, b = ((s.y + y + 2) * j.w + s.x + x + 2) * 4;
    if (png.rgba[a + 3] === 255 && (png.rgba[b + 3] !== 255 || png.rgba[a] !== png.rgba[b] || png.rgba[a + 1] !== png.rgba[b + 1] || png.rgba[a + 2] !== png.rgba[b + 2])) { same = false; break; }
  }
  ok(same, `${k}: the halo keeps the plain ink pixel for pixel`);
}

// 2. every referenced mark exists
const brand = await import("../src/city/brand.js");
brand._setAtlas(j);
const marks = new Set(Object.values(j.sprites).map(s => s.mark));
for (const m of brand.BRAND_MARKS) ok(marks.has(m), `BRAND_MARKS ${m} is in the atlas`);
for (const m of marks) ok(brand.BRAND_MARKS.includes(m), `atlas mark ${m} is listed in BRAND_MARKS`);
const refs = new Map();
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|jsx)$/.test(e.name)) refs.set(p, readFileSync(p, "utf8")); } };
walk(join(root, "src"));
const used = new Set();
for (const [p, src] of refs) {
  for (const m of src.matchAll(/(?:drawBrand|faceBrand|brandFits)\((?:[^,()]+,\s*){0,5}?"([a-z][a-z-]*)"/g)) used.add(`${m[1]}|${p}`);
  for (const m of src.matchAll(/\b(?:mark|logo|sub):\s*"([a-z][a-z-]*)"/g)) if (/brand\.js/.test(src)) used.add(`${m[1]}|${p}`);
  // a sign's lettering mapped to its mark: { "EB SHOP": "ebshop-cart", ... }
  if (/brand\.js/.test(src)) for (const m of src.matchAll(/"[A-Z][A-Z !']*":\s*"([a-z][a-z-]*)"/g)) used.add(`${m[1]}|${p}`);
}
ok(used.size >= 15, `the code draws the marks (${used.size} references found)`);
for (const u of used) { const [m, p] = u.split("|"); ok(marks.has(m), `${p.replace(root, "")}: draws "${m}", which is in the atlas`); }

// 3. whole-number scales only, never past the room given
for (const m of marks) for (const neon of [false, true]) for (let px = 1; px <= 200; px++) {
  const r = brand.pickBrand(m, px, neon);
  if (!r) continue;
  if (!(Number.isInteger(r.k) && r.k >= 1 && r.ink * r.k <= px)) { ok(false, `${m}${neon ? " neon" : ""} at ${px}px: scale ${r.k} of ${r.ink}`); break; }
}
for (const m of marks) for (const maxW of [6, 13, 29, 64]) {
  const r = brand.pickBrand(m, 96, false, maxW);
  if (r && (r.s.w - 2 * (r.s.pad || 0)) * r.k > maxW) ok(false, `${m}: ${maxW}px of width is never overrun`);
}
ok(brand.pickBrand("eb-logo", 4) === null, "a mark asked smaller than its smallest sprite is not drawn (the text sign stays)");
ok(brand.pickBrand("eb-logo", 100).s.h === 96 && brand.pickBrand("eb-logo", 100).k === 1, "100px of EB logo is the 96 at 1x");
ok(brand.pickBrand("ebshop", 20).s.h === 16, "detail beats blow-up: 20px of EB Shop is the 16, not the 6 at 3x");
ok(brand.pickBrand("eb-bolt", 50).s.h === 24 && brand.pickBrand("eb-bolt", 50).k === 2, "a clear gain still scales: 50px of bolt is the 24 at 2x");

// 4. sources recorded
const doc = existsSync(join(dir, "BRAND_SOURCES.md")) ? readFileSync(join(dir, "BRAND_SOURCES.md"), "utf8") : "";
ok(doc.length > 0, "public/brand/BRAND_SOURCES.md exists");
for (const [k, p] of Object.entries(j.sources || {})) ok(doc.includes(p), `source ${k} (${p}) is recorded in BRAND_SOURCES.md`);
for (const m of marks) ok(doc.includes("`" + m + "`"), `mark ${m} is documented in BRAND_SOURCES.md`);
ok(existsSync(join(root, "scripts/brand_atlas.py")), "the builder is in the repo");

// 5. billboards: every site carries an ad with a mark
const bb = await import("../src/city/billboards.js");
const src = refs.get(join(root, "src/city/billboardDraw.js")) || "";
const { BILLBOARD_ADS } = await import("../src/city/billboardDraw.js");
for (const s of bb.BILLBOARD_SITES) ok(Boolean(BILLBOARD_ADS[s.id]), `billboard ${s.id} has an ad`);
for (const [id, a] of Object.entries(BILLBOARD_ADS)) ok(new RegExp(`\\b${a.ad}: \\{ bg:`).test(src), `billboard ${id}: ad ${a.ad} is defined`);
ok(/prefers-reduced-motion|steady|no flicker/.test(src), "billboards say they do not flicker");

console.log(`check-brand: ${n - failed}/${n} passed`);
process.exit(failed ? 1 : 0);
