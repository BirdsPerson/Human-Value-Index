// The production sprite atlas: every ready referral/engine sprite in the hvi-sprites store,
// packed into small PNG sheets, one SECTOR (district) to a sheet, so a view can fetch the
// faces of the districts it shows instead of the roster. The 62 repo sprites have their own
// build-time atlas (scripts/sprite-atlas.mjs); this is its production twin.
//
//   node scripts/prod-atlas.mjs            rebuild if any ready sprite (or its sector) changed
//   node scripts/prod-atlas.mjs --force    rebuild regardless
//   node scripts/prod-atlas.mjs --dry-run  say what would change, write nothing
//
// Run by scripts/referral_sprites.py after each pass (and after takedowns/redraws). An
// unchanged roster costs two Blobs reads (the figure index and the current atlas).
//
// A subject's sector is their WORK district (sim.js assignJob, from the census record, the
// same answer the plan builder gives: the `cj` a sector window carries). Measured (scaling
// step 5, docs/CITY_SPEC.md "Sector sheets"): of the faces a zoom draws, the work district
// holds as many as any stable rule does (home is useless: four in five live in the Sprawl),
// and it is a pure function of the record, so the browser knows it without a lookup. Within
// a sector, a sheet holds the workers of the same workplace where it can, so a room's
// cutaway draws from one or two sheets.
//
// Blobs (store hvi-atlas):
//   current         { v, sig, at, count, maps: {sector: hash}, sheets: [[hash, sector, bytes]],
//                     sprites: {slug: [v, sheet, x, y, w, h, frames]}, skipped: {slug: v} } (the packer's own
//                     record; /api/atlas.json serves only v, at, count, maps)
//   map-<hash>      one sector's map, served at /api/atlas/<hash>.json (immutable):
//                     { sector, sheets: [[hash, bytes]], sprites: {slug: [v, i, x, y, w, h, frames]} }
//                     i indexes the map's own sheets, so a map changes only with its sector
//   sheet-<hash>    one PNG sheet, content-addressed, served at /api/atlas/<hash>.png
//   v       the ?v= of the sprite URL a rect holds; a card whose ?v= differs (redrawn since
//           the pack) loads its own /api/sprite URL until the next pack.
//
// Sheets keep their members between runs: a sprite stays in its sheet while its ?v= and its
// sector hold, and a new one goes into a sheet of its sector with room (the one holding most
// of its workplace), so one referral re-encodes one sheet and changes one map; every other
// sheet and map stays byte-identical (same hash, same URL, still in every browser's cache).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { decodePng, packSheets } from "./sprite-atlas.mjs";
import { assignJob, DISTRICTS } from "../src/city/sim.js";

export const SHEET_CAP = 64;           // 8 x 8 cells of 64x48: a 512x384 sheet, ~40 KB
export const SHEET_W = 512;
const SPRITE_URL = /^\/api\/sprite\/([a-z0-9-]{1,80})\?v=([A-Za-z0-9._-]{1,40})$/;
const CACHE = join(process.env.HVI_SPRITE_CACHE || join(homedir(), ".cache", "hvi-sprites"), "atlas-src");
const SECTOR_ORDER = Object.fromEntries(DISTRICTS.map((d, i) => [d.id, i]));

// slug -> v for every card whose sprite is drawn and served from /api/sprite.
export function readySprites(cards) {
  const out = new Map();
  for (const c of cards || []) {
    if (!c || c.removed || c.spriteStatus !== "ready" || typeof c.sprite !== "string") continue;
    const m = SPRITE_URL.exec(c.sprite);
    if (m && m[1] === c.slug) out.set(c.slug, m[2]);
  }
  return out;
}

// slug -> {sector, place}: the subject's work district and workplace (census records).
export function sectorsOf(records, want) {
  const out = new Map();
  for (const s of records || []) {
    if (!s || !want.has(s.slug) || out.has(s.slug)) continue;
    const j = assignJob(s);
    out.set(s.slug, { sector: j.district, place: j.place });
  }
  return out;
}
const UNKNOWN = { sector: "-", place: "-" };

export const signature = (want, where = new Map()) => createHash("sha1").update([...want].map(([s, v]) => `${s}@${v}@${(where.get(s) || UNKNOWN).sector}`).sort().join("\n")).digest("hex").slice(0, 16);

const sheetSector = (prev, i) => (Array.isArray(prev?.sheets?.[i]) ? prev.sheets[i][1] : null);

// Which sheet each wanted sprite lives in: -> [{sector, members: [slug...]}] (no empty sheet).
// A member of the previous atlas stays put while its v and sector are unchanged; the rest go,
// by sector, workplace and slug, into the sheet of their sector with room that holds most of
// their workplace (the first such), else a new sheet.
export function assignSheets(want, prev, where, cap = SHEET_CAP) {
  const at = (slug) => where.get(slug) || UNKNOWN;
  const groups = [];
  const placed = new Set();
  for (const [slug, r] of Object.entries(prev?.sprites || {})) {
    if (!Array.isArray(r) || !want.has(slug) || want.get(slug) !== r[0] || sheetSector(prev, r[1]) !== at(slug).sector) continue;
    (groups[r[1]] ||= { sector: at(slug).sector, members: [] }).members.push(slug);
    placed.add(slug);
  }
  const sheets = groups.filter(g => g && g.members.length);
  // a sprite the last pack could not read stays out until it is redrawn (it keeps its URL)
  const bad = (s) => prev?.skipped?.[s] === want.get(s);
  const fresh = [...want.keys()].filter(s => !placed.has(s) && !bad(s)).sort((a, b) => {
    const A = at(a), B = at(b);
    return (SECTOR_ORDER[A.sector] ?? 99) - (SECTOR_ORDER[B.sector] ?? 99) || (A.place < B.place ? -1 : A.place > B.place ? 1 : 0) || (a < b ? -1 : a > b ? 1 : 0);
  });
  const places = new Map(sheets.map(g => [g, g.members.reduce((m, s) => m.set(at(s).place, (m.get(at(s).place) || 0) + 1), new Map())]));
  for (const slug of fresh) {
    const { sector, place } = at(slug);
    let best = null, bestN = -1;
    for (const g of sheets) {
      if (g.sector !== sector || g.members.length >= cap) continue;
      const n = places.get(g).get(place) || 0;
      if (n > bestN) { best = g; bestN = n; }
    }
    if (!best) { best = { sector, members: [] }; sheets.push(best); places.set(best, new Map()); }
    best.members.push(slug);
    places.get(best).set(place, (places.get(best).get(place) || 0) + 1);
  }
  for (const g of sheets) g.members.sort();
  return sheets;
}

const hash16 = (buf) => createHash("sha1").update(buf).digest("hex").slice(0, 16);

// Pack assigned sheets. load(slug, v) -> PNG bytes or null. A sprite that won't load or
// decode is left out (it keeps its own URL). reuse: members key -> previous sheet, so an
// unchanged sheet is neither downloaded nor re-encoded.
// -> { json (the `current` record), maps: Map(hash -> map json), pngs: Map(hash -> png), skipped }
// carry: the previous pack's skipped sprites (kept out while their v holds).
export async function packAtlas(want, groups, load, { reuse = new Map(), carry = {} } = {}) {
  const sheets = [], sprites = {}, pngs = new Map(), skipped = [];
  for (const { sector, members } of groups) {
    const key = members.map(s => `${s}@${want.get(s)}`).join(",");
    const old = reuse.get(key);
    if (old && old.sector === sector) {
      const idx = sheets.push([old.hash, sector, old.bytes]) - 1;
      for (const s of members) sprites[s] = [want.get(s), idx, ...old.rects[s].slice(2)];
      continue;
    }
    const decoded = [];
    for (const slug of members) {
      let img = null;
      try { const buf = await load(slug, want.get(slug)); img = buf ? decodePng(Buffer.from(buf)) : null; } catch { img = null; }
      if (!img) { skipped.push(slug); continue; }
      decoded.push({ slug, img, fw: 32, frames: Math.max(1, Math.floor(img.w / 32)) });
    }
    if (!decoded.length) continue;
    const { png, rects } = packSheets(decoded, { maxWidth: SHEET_W });
    const hash = hash16(png);
    const idx = sheets.push([hash, sector, png.length]) - 1;
    pngs.set(hash, png);
    for (const d of decoded) { const r = rects[d.slug]; sprites[d.slug] = [want.get(d.slug), idx, r.x, r.y, r.w, r.h, r.frames]; }
  }
  const sorted = Object.fromEntries(Object.keys(sprites).sort().map(k => [k, sprites[k]]));
  // one map per sector, its sheets indexed locally
  const maps = new Map(), mapOf = {};
  for (const sector of [...new Set(sheets.map(s => s[1]))].sort()) {
    const local = [], at = new Map();
    sheets.forEach(([h, sec, bytes], i) => { if (sec === sector) { at.set(i, local.length); local.push([h, bytes]); } });
    const m = { sector, sheets: local, sprites: {} };
    for (const [slug, r] of Object.entries(sorted)) if (at.has(r[1])) m.sprites[slug] = [r[0], at.get(r[1]), ...r.slice(2)];
    const hash = hash16(JSON.stringify(m));
    maps.set(hash, m);
    mapOf[sector] = hash;
  }
  const v = hash16(JSON.stringify([sheets, sorted])).slice(0, 12);
  return { json: { v, count: Object.keys(sorted).length, maps: mapOf, sheets, sprites: sorted, skipped: Object.fromEntries([...Object.entries(carry || {}).filter(([s, v]) => want.get(s) === v && !sorted[s]), ...skipped.map(s => [s, want.get(s)])].sort()) }, maps, pngs, skipped };
}

// members key -> { hash, sector, bytes, rects } for every sheet of a previous atlas (sector
// sheets only: a sheet of the old roster-wide packing is never reused).
export function reusable(prev) {
  const bySheet = new Map();
  for (const [slug, r] of Object.entries(prev?.sprites || {})) {
    if (!Array.isArray(r) || !Array.isArray(prev.sheets?.[r[1]])) continue;
    if (!bySheet.has(r[1])) bySheet.set(r[1], []);
    bySheet.get(r[1]).push([slug, r]);
  }
  const out = new Map();
  for (const [i, list] of bySheet) {
    const [hash, sector, bytes] = prev.sheets[i];
    list.sort((a, b) => a[0].localeCompare(b[0]));
    out.set(list.map(([s, r]) => `${s}@${r[0]}`).join(","), { hash, sector, bytes, rects: Object.fromEntries(list) });
  }
  return out;
}

async function main() {
  const { store, figureIndex, retry } = await import("./roster/prod.mjs");
  const { censusFigure } = await import("../netlify/lib/refer.js");
  const force = process.argv.includes("--force"), dry = process.argv.includes("--dry-run");
  const atlas = store("hvi-atlas"), sprites = store("hvi-sprites");
  const [cards, prev] = await Promise.all([retry(figureIndex), retry(() => atlas.get("current", { type: "json" }))]);
  const want = readySprites(cards);
  // the census record (what /api/pen and the plan builder read), so the sector here is the
  // work district the builder gives the same subject
  const where = sectorsOf(cards.filter(c => c && !c.removed && want.has(c.slug)).map(censusFigure), want);
  const sig = signature(want, where);
  if (!force && prev?.sig === sig) { console.log(`atlas: unchanged (${want.size} sprites, ${prev.sheets.length} sheets, v=${prev.v})`); return; }

  const groups = assignSheets(want, prev, where);
  mkdirSync(CACHE, { recursive: true });
  let downloaded = 0;
  const load = async (slug, v) => {
    const file = join(CACHE, `${slug}@${v}.png`);
    if (existsSync(file)) return readFileSync(file);
    const buf = await retry(() => sprites.get(slug, { type: "arrayBuffer" }));
    if (!buf) return null;
    downloaded++;
    writeFileSync(file, Buffer.from(buf));
    return Buffer.from(buf);
  };
  const { json, maps, pngs, skipped } = await packAtlas(want, groups, load, { reuse: force ? new Map() : reusable(prev), carry: force ? {} : prev?.skipped });
  json.sig = sig;
  json.at = new Date().toISOString();
  const kb = [...pngs.values()].reduce((a, p) => a + p.length, 0) / 1024;
  const newMaps = [...maps.keys()].filter(h => !Object.values(prev?.maps || {}).includes(h));
  console.log(`atlas: ${json.count} sprites in ${json.sheets.length} sheets over ${maps.size} sectors (${pngs.size} re-encoded, ${Math.round(kb)} KB new, ${newMaps.length} maps new, ${downloaded} downloaded)${skipped.length ? `; left out ${skipped.join(", ")}` : ""}`);
  if (dry) return;
  // Sheets and maps first, then the record that names them, so a reader never sees a
  // missing file.
  for (const [hash, png] of pngs) await retry(() => atlas.set(`sheet-${hash}`, png));
  for (const h of newMaps) await retry(() => atlas.set(`map-${h}`, JSON.stringify(maps.get(h))));
  await retry(() => atlas.setJSON("current", json));
  // Keep this atlas's and the previous one's sheets and maps (a page loaded a minute ago
  // still asks for those); drop the rest.
  const hashOf = (x) => (Array.isArray(x) ? x[0] : x);
  const keep = new Set([...[...json.sheets, ...(prev?.sheets || [])].map(x => `sheet-${hashOf(x)}`), ...[...maps.keys(), ...Object.values(prev?.maps || {})].map(h => `map-${h}`)]);
  for (const prefix of ["sheet-", "map-"]) {
    const { blobs } = await retry(() => atlas.list({ prefix }));
    for (const b of blobs) if (!keep.has(b.key)) await retry(() => atlas.delete(b.key));
  }
  console.log(`atlas: published v=${json.v}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(`atlas: FAILED ${e?.message || e}`); process.exit(1); });
}
