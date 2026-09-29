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

// ---- the production atlas (scripts/prod-atlas.mjs) and the client's lookup (src/sprites.js)
const { readySprites, signature, assignSheets, packAtlas, reusable } = await import("./prod-atlas.mjs");
const { prodAtlasRect, repoSpriteSlug } = await import("../src/sprites.js");
const fake = (seed) => { const px = Buffer.alloc(64 * 48 * 4); for (let i = 0; i < px.length; i++) px[i] = (i * 7 + seed * 131) & 255; return encodePng(64, 48, px); };
const card = (slug, v, extra = {}) => ({ slug, spriteStatus: "ready", sprite: `/api/sprite/${slug}?v=${v}`, ...extra });
const cards = [card("ada", "100"), card("bo", "101"), card("cy", "102"), card("di", "103"), card("ed", "104"),
  { slug: "pend", spriteStatus: "pending", sprite: null }, card("gone", "105", { removed: true }), card("odd", "106", { sprite: "/sprites/odd.png" }),
  card("mis", "107", { sprite: "/api/sprite/other?v=107" })];
const want = readySprites(cards);
assert.deepEqual([...want.keys()].sort(), ["ada", "bo", "cy", "di", "ed"], "only ready /api/sprite sprites of their own slug");
const seeds = { ada: 1, bo: 2, cy: 3, di: 4, ed: 5, fi: 6 };
let loads = 0;
const load = async (slug) => { loads++; return slug === "di" ? Buffer.from("not a png") : fake(seeds[slug]); };
const a1 = await packAtlas(want, assignSheets(want, null, 2), load);
assert.deepEqual(a1.skipped, ["di"], "an undecodable sprite is left out (it keeps its own URL)");
assert.equal(a1.json.sheets.length, 3); assert.equal(a1.json.count, 4);
for (const slug of ["ada", "bo", "cy", "ed"]) {
  const r = prodAtlasRect(a1.json, `/api/sprite/${slug}?v=${want.get(slug)}`);
  assert.ok(r, `${slug} is in the atlas`);
  const sheet = decodePng(a1.pngs.get(r.sheet)), src = decodePng(fake(seeds[slug]));
  assert.equal(r.w, 64); assert.equal(r.h, 48); assert.equal(r.frames, 2);
  for (let y = 0; y < 48; y++) assert.ok(sheet.rgba.subarray(((r.y + y) * sheet.w + r.x) * 4, ((r.y + y) * sheet.w + r.x + 64) * 4).equals(src.rgba.subarray(y * 256, (y + 1) * 256)), `${slug} row ${y}`);
}
// the lookup falls back (null) whenever the atlas can't vouch for that exact sprite
assert.equal(prodAtlasRect(a1.json, "/api/sprite/ada?v=999"), null, "redrawn since the pack: its own URL");
assert.equal(prodAtlasRect(a1.json, "/api/sprite/di?v=103"), null, "left out of the pack: its own URL");
assert.equal(prodAtlasRect(a1.json, "/api/sprite/nobody?v=1"), null);
assert.equal(prodAtlasRect(a1.json, "/api/sprite/constructor?v=1"), null);
assert.equal(prodAtlasRect(null, "/api/sprite/ada?v=100"), null, "no atlas: its own URL");
assert.equal(prodAtlasRect(a1.json, "/sprites/ada.png"), null);
assert.equal(repoSpriteSlug("/sprites/scott.png?v=1790389943"), "scott");
assert.equal(repoSpriteSlug("/sprites/atlas.png?v=1"), null);
assert.equal(repoSpriteSlug("/api/sprite/ada?v=1"), null);
// an unchanged roster has an unchanged signature; any new or redrawn sprite changes it
assert.equal(signature(readySprites(cards)), signature(want));
assert.notEqual(signature(readySprites([...cards, card("fi", "108")])), signature(want));
// stable sheets: one new sprite re-encodes only the sheet it lands in; the rest keep their hash
const prev = { ...a1.json };
const want2 = readySprites([...cards.filter(c => c.slug !== "di"), card("fi", "108")]);
const groups2 = assignSheets(want2, prev, 2);
loads = 0;
const a2 = await packAtlas(want2, groups2, load, { reuse: reusable(prev) });
assert.equal(a2.pngs.size, 1, "one sheet re-encoded");
assert.equal(loads, 2, "only the re-encoded sheet's members were fetched (cy, fi)");
assert.equal(a2.json.sheets.filter(h => prev.sheets.includes(h)).length, a2.json.sheets.length - 1, "every other sheet kept its hash");
assert.ok(prodAtlasRect(a2.json, "/api/sprite/fi?v=108"));
assert.deepEqual(prodAtlasRect(a2.json, "/api/sprite/ada?v=100"), prodAtlasRect(prev, "/api/sprite/ada?v=100"), "an untouched sprite keeps its rect and sheet");
// a redraw moves the sprite out of its old slot; a takedown drops it
const want3 = new Map(want2); want3.set("ada", "200"); want3.delete("bo");
const a3 = await packAtlas(want3, assignSheets(want3, a2.json, 2), load, { reuse: reusable(a2.json) });
assert.ok(prodAtlasRect(a3.json, "/api/sprite/ada?v=200")); assert.equal(prodAtlasRect(a3.json, "/api/sprite/ada?v=100"), null);
assert.equal(prodAtlasRect(a3.json, "/api/sprite/bo?v=101"), null, "taken down: gone from the atlas");
assert.equal(a3.json.count, want3.size);

console.log(`check-atlas: ok (${json.count} sheets, ${json.w}x${json.h}, ${png.length} bytes; production atlas packing, reuse and lookup fallback)`);
