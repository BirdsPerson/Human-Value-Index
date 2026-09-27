// Sprite atlas checks (scripts/sprite-atlas.mjs). Pure node, no network.
//   node scripts/check-atlas.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAtlas, decodePng, encodePng } from "./sprite-atlas.mjs";

const dir = new URL("../public/sprites/", import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(dir + "manifest.json", "utf8"));

// encode -> decode is lossless
const w = 5, h = 3, px = Buffer.alloc(w * h * 4);
for (let i = 0; i < px.length; i++) px[i] = (i * 37) & 255;
const rt = decodePng(encodePng(w, h, px));
assert.equal(rt.w, w); assert.equal(rt.h, h); assert.ok(rt.rgba.equals(px), "png round trip");

const { png, json, skipped } = buildAtlas(dir);
assert.deepEqual(skipped, [], `sprites the atlas could not read: ${skipped.join(", ")}`);
for (const slug of Object.keys(manifest)) assert.ok(json.sprites[slug], `manifest sprite missing from atlas: ${slug}`);
assert.match(json.png, /^atlas\.png\?v=[0-9a-f]{10}$/);

// every rect is the source sheet, pixel for pixel, and rects never overlap
const atlas = decodePng(png);
assert.equal(atlas.w, json.w); assert.equal(atlas.h, json.h);
const seen = new Uint8Array(atlas.w * atlas.h);
for (const [slug, r] of Object.entries(json.sprites)) {
  const src = decodePng(readFileSync(dir + slug + ".png"));
  assert.equal(r.w, src.w, slug); assert.equal(r.h, src.h, slug);
  assert.equal(r.fw * r.frames, r.w, `${slug}: frames x frame width = sheet width`);
  if (manifest[slug]) assert.equal(r.frames, manifest[slug].frames || r.frames, `${slug}: frames match the manifest`);
  for (let y = 0; y < r.h; y++) {
    const a = atlas.rgba.subarray(((r.y + y) * atlas.w + r.x) * 4, ((r.y + y) * atlas.w + r.x + r.w) * 4);
    const b = src.rgba.subarray(y * r.w * 4, (y + 1) * r.w * 4);
    assert.ok(a.equals(b), `${slug}: row ${y} differs from its PNG`);
    for (let x = 0; x < r.w; x++) { const k = (r.y + y) * atlas.w + r.x + x; assert.equal(seen[k], 0, `${slug} overlaps another sheet`); seen[k] = 1; }
  }
}
// deterministic: same input, same bytes (the version hash is a content hash)
assert.equal(buildAtlas(dir).json.v, json.v);
console.log(`check-atlas: ok (${json.count} sheets, ${json.w}x${json.h}, ${png.length} bytes)`);
