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
const { readySprites, signature, assignSheets, packAtlas, reusable, sectorsOf, SHEET_CAP, SHEET_W } = await import("./prod-atlas.mjs");
const { prodAtlasRect, repoSpriteSlug, buyNow, RENT_BYTES } = await import("../src/sprites.js");
const { assignJob } = await import("../src/city/sim.js");
const fake = (seed) => { const px = Buffer.alloc(64 * 48 * 4); for (let i = 0; i < px.length; i++) px[i] = (i * 7 + seed * 131) & 255; return encodePng(64, 48, px); };
const card = (slug, v, extra = {}) => ({ slug, spriteStatus: "ready", sprite: `/api/sprite/${slug}?v=${v}`, ...extra });
const cards = [card("ada", "100"), card("bo", "101"), card("cy", "102"), card("di", "103"), card("ed", "104"),
  { slug: "pend", spriteStatus: "pending", sprite: null }, card("gone", "105", { removed: true }), card("odd", "106", { sprite: "/sprites/odd.png" }),
  card("mis", "107", { sprite: "/api/sprite/other?v=107" })];
const want = readySprites(cards);
assert.deepEqual([...want.keys()].sort(), ["ada", "bo", "cy", "di", "ed"], "only ready /api/sprite sprites of their own slug");
const seedOf = (slug) => [...slug].reduce((n, c) => n * 31 + c.charCodeAt(0), 7) & 255;
let loads = 0;
const load = async (slug) => { loads++; return slug === "di" ? Buffer.from("not a png") : fake(seedOf(slug)); };
const W = (pairs) => new Map(Object.entries(pairs).map(([k, [sector, place]]) => [k, { sector, place }]));
const where1 = W({ ada: ["arts", "gallery"], bo: ["arts", "studio"], cy: ["works", "docks"], di: ["arts", "studio"], ed: ["arts", "gallery"] });
const mapOf = (atlas, maps, slug) => maps.get(atlas.maps[where1.get(slug)?.sector]) || null;
const a1 = await packAtlas(want, assignSheets(want, null, where1, 2), load);
assert.deepEqual(a1.skipped, ["di"], "an undecodable sprite is left out (it keeps its own URL)");
assert.equal(a1.json.count, 4);
// one sector to a sheet, the sheets of a sector hold the same workplace together
for (const [slug, r] of Object.entries(a1.json.sprites)) assert.equal(a1.json.sheets[r[1]][1], where1.get(slug).sector, `${slug} sits in a sheet of its sector`);
assert.equal(a1.json.sprites.ada[1], a1.json.sprites.ed[1], "the same workplace shares a sheet");
for (const slug of ["ada", "bo", "cy", "ed"]) {
  const r = prodAtlasRect(mapOf(a1.json, a1.maps, slug), `/api/sprite/${slug}?v=${want.get(slug)}`);
  assert.ok(r, `${slug} is in its sector's map`);
  assert.ok(r.bytes > 0, "a map carries each sheet's bytes");
  const sheet = decodePng(a1.pngs.get(r.sheet)), src = decodePng(fake(seedOf(slug)));
  assert.ok(sheet.w <= SHEET_W);
  assert.equal(r.w, 64); assert.equal(r.h, 48); assert.equal(r.frames, 2);
  for (let y = 0; y < 48; y++) assert.ok(sheet.rgba.subarray(((r.y + y) * sheet.w + r.x) * 4, ((r.y + y) * sheet.w + r.x + 64) * 4).equals(src.rgba.subarray(y * 256, (y + 1) * 256)), `${slug} row ${y}`);
}
// every ready sprite in exactly one canonical sheet: the maps partition the atlas
const inMaps = [...a1.maps.values()].flatMap(m => Object.keys(m.sprites));
assert.deepEqual(inMaps.slice().sort(), Object.keys(a1.json.sprites).sort(), "every packed sprite in exactly one map");
assert.equal(new Set(inMaps).size, inMaps.length);
// the lookup falls back (null) whenever the map can't vouch for that exact sprite
const arts = mapOf(a1.json, a1.maps, "ada");
assert.equal(prodAtlasRect(arts, "/api/sprite/ada?v=999"), null, "redrawn since the pack: its own URL");
assert.equal(prodAtlasRect(arts, "/api/sprite/di?v=103"), null, "left out of the pack: its own URL");
assert.equal(prodAtlasRect(arts, "/api/sprite/cy?v=102"), null, "another sector's map: its own URL");
assert.equal(prodAtlasRect(arts, "/api/sprite/nobody?v=1"), null);
assert.equal(prodAtlasRect(arts, "/api/sprite/constructor?v=1"), null);
assert.equal(prodAtlasRect(null, "/api/sprite/ada?v=100"), null, "no map: its own URL");
assert.equal(prodAtlasRect(arts, "/sprites/ada.png"), null);
assert.equal(prodAtlasRect({ sheets: [], sprites: { ada: ["100", 0, 0, 0, 64, 48, 2] } }, "/api/sprite/ada?v=100"), null, "a map naming a missing sheet: its own URL");
assert.equal(repoSpriteSlug("/sprites/scott.png?v=1790389943"), "scott");
assert.equal(repoSpriteSlug("/sprites/atlas.png?v=1"), null);
assert.equal(repoSpriteSlug("/api/sprite/ada?v=1"), null);
// rent, then buy: the sheet once its faces would have cost as much on their own
assert.equal(buyNow(1, 40000), false); assert.equal(buyNow(Math.ceil(40000 / RENT_BYTES), 40000), true);
assert.equal(buyNow(1, 0), true, "a sheet of unknown weight is bought (the old behaviour)");
// the signature moves with a new or redrawn sprite, and with a change of sector
assert.equal(signature(readySprites(cards), where1), signature(want, where1));
assert.notEqual(signature(readySprites([...cards, card("fi", "108")]), where1), signature(want, where1));
assert.notEqual(signature(want, W({ ...Object.fromEntries([...where1].map(([k, v]) => [k, [v.sector, v.place]])), bo: ["works", "docks"] })), signature(want, where1));
// stable: the same roster packs the same sheets and maps, nothing re-encoded or fetched
loads = 0;
const again = await packAtlas(want, assignSheets(want, a1.json, where1, 2), load, { reuse: reusable(a1.json), carry: a1.json.skipped });
assert.equal(again.pngs.size, 0, "unchanged roster: no sheet re-encoded"); assert.equal(loads, 0);
assert.deepEqual(again.json.sheets, a1.json.sheets); assert.deepEqual(again.json.skipped, { di: "103" }, "the unreadable one stays out, remembered");
const third = await packAtlas(want, assignSheets(want, { ...again.json }, where1, 2), load, { reuse: reusable(again.json), carry: again.json.skipped });
assert.equal(third.pngs.size + loads, 0, "and is not retried every run"); assert.deepEqual(again.json.maps, a1.json.maps, "unchanged roster: every map keeps its hash");
// one new sprite re-encodes only the sheet it lands in, and changes only its sector's map
const prev = a1.json;
const want2 = readySprites([...cards.filter(c => c.slug !== "di"), card("fi", "108")]);
const where2 = new Map([...where1, ["fi", { sector: "works", place: "docks" }]]);
loads = 0;
const a2 = await packAtlas(want2, assignSheets(want2, prev, where2, 2), load, { reuse: reusable(prev) });
assert.equal(a2.pngs.size, 1, "one sheet re-encoded");
assert.equal(loads, 2, "only the re-encoded sheet's members were fetched (cy, fi)");
assert.equal(a2.json.sheets.filter(s => prev.sheets.some(p => p[0] === s[0])).length, a2.json.sheets.length - 1, "every other sheet kept its hash");
assert.equal(a2.json.maps.arts, prev.maps.arts, "another sector's map kept its hash"); assert.notEqual(a2.json.maps.works, prev.maps.works);
assert.ok(prodAtlasRect(a2.maps.get(a2.json.maps.works), "/api/sprite/fi?v=108"));
assert.deepEqual(prodAtlasRect(a2.maps.get(a2.json.maps.arts), "/api/sprite/ada?v=100"), prodAtlasRect(arts, "/api/sprite/ada?v=100"), "an untouched sprite keeps its rect and sheet");
// a redraw moves the sprite out of its old slot; a takedown drops it; a new job moves it to its new sector
const want3 = new Map(want2); want3.set("ada", "200"); want3.delete("bo");
const where3 = new Map([...where2, ["ed", { sector: "works", place: "docks" }]]);
const a3 = await packAtlas(want3, assignSheets(want3, a2.json, where3, 2), load, { reuse: reusable(a2.json) });
const m3 = (sec) => a3.maps.get(a3.json.maps[sec]);
assert.ok(prodAtlasRect(m3("arts"), "/api/sprite/ada?v=200")); assert.equal(prodAtlasRect(m3("arts"), "/api/sprite/ada?v=100"), null);
assert.equal(prodAtlasRect(m3("arts"), "/api/sprite/bo?v=101"), null, "taken down: gone from the atlas");
assert.ok(prodAtlasRect(m3("works"), "/api/sprite/ed?v=104"), "a new sector: moved to its sheets"); assert.equal(prodAtlasRect(m3("arts"), "/api/sprite/ed?v=104"), null);
assert.equal(a3.json.count, want3.size);
// the old roster-wide atlas (sheets as bare hashes) is repacked by sector, once
const old = { v: "x", sheets: ["0123456789abcdef"], sprites: { ada: ["100", 0, 0, 0, 64, 48, 2] } };
const g0 = assignSheets(want, old, where1, 2);
assert.equal(reusable(old).size, 0, "an old sheet is never reused");
assert.ok(g0.every(g => g.members.every(s => where1.get(s).sector === g.sector)));
// at scale: every ready sprite in exactly one sheet of its own sector (work district), none
// over the cap, and the next run from the same census keeps every sheet as it was
{
  const { baseRoster } = await import("../src/city/roster.js");
  const base = baseRoster();
  const census = Array.from({ length: 900 }, (_, i) => ({ ...structuredClone(base[i % base.length]), slug: `s-${i.toString(36)}`, name: `S ${i}`, kind: "figure", referred: true, spriteStatus: "ready", sprite: `/api/sprite/s-${i.toString(36)}?v=${1000 + i}` }));
  const wantN = readySprites(census), whereN = sectorsOf(census, wantN);
  assert.equal(whereN.size, wantN.size);
  for (const s of census.slice(0, 50)) assert.equal(whereN.get(s.slug).sector, assignJob(s).district, "the sector is the work district");
  const asJson = (groups) => ({ sheets: groups.map((g, i) => [`h${i}`, g.sector, 1]), sprites: Object.fromEntries(groups.flatMap((g, i) => g.members.map(m => [m, [wantN.get(m), i, 0, 0, 64, 48, 2]]))) });
  const g1 = assignSheets(wantN, null, whereN);
  const seen = new Map();
  for (const g of g1) {
    assert.ok(g.members.length > 0 && g.members.length <= SHEET_CAP, "no sheet over the cap");
    for (const m of g.members) { assert.equal(whereN.get(m).sector, g.sector); seen.set(m, (seen.get(m) || 0) + 1); }
  }
  assert.equal(seen.size, wantN.size, "every ready sprite has a sheet"); assert.ok([...seen.values()].every(n => n === 1), "and only one");
  const sectors = new Set([...whereN.values()].map(w => w.sector));
  assert.ok(sectors.size >= 5, `sheets spread over the districts (${sectors.size})`);
  assert.deepEqual(assignSheets(wantN, asJson(g1), whereN), g1, "the same census: the same assignment");
  // a new subject only joins a sheet; every other membership holds
  const plus = new Map([...wantN, ["s-new", "1"]]), wherePlus = new Map([...whereN, ["s-new", whereN.get("s-0")]]);
  const g2 = assignSheets(plus, asJson(g1), wherePlus);
  assert.equal(g2.filter((g, i) => JSON.stringify(g) !== JSON.stringify(g1[i])).length, 1, "one new sprite touches one sheet");
}

console.log(`check-atlas: ok (${json.count} sheets, ${json.w}x${json.h}, ${png.length} bytes; production atlas: sector sheets, stable membership, maps, lookup fallback, rent-then-buy)`);
