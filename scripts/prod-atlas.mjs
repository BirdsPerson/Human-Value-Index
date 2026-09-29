// The production sprite atlas: every ready referral/engine sprite in the hvi-sprites store,
// packed into a few PNG sheets plus one JSON rect map, so a screen full of subjects costs
// a handful of requests instead of one /api/sprite/<slug> per face. The 62 repo sprites
// have their own build-time atlas (scripts/sprite-atlas.mjs); this is its production twin.
//
//   node scripts/prod-atlas.mjs            rebuild if any ready sprite changed, else exit
//   node scripts/prod-atlas.mjs --force    rebuild regardless
//   node scripts/prod-atlas.mjs --dry-run  say what would change, write nothing
//
// Run by scripts/referral_sprites.py after each pass (and after takedowns/redraws). An
// unchanged roster costs two Blobs reads (the figure index and the current atlas).
//
// Blobs (store hvi-atlas):
//   current         the JSON /api/atlas.json serves (below)
//   sheet-<hash>    one PNG sheet, content-addressed, served at /api/atlas/<hash>.png
// JSON: { v, sig, at, count, sheets: [hash...], sprites: { slug: [v, sheet, x, y, w, h, frames] } }
//   v       the ?v= of the sprite URL this rect holds; a card whose ?v= differs (redrawn
//           since the pack) loads its own /api/sprite URL until the next pack.
//
// Sheets keep their members between runs: a new sprite goes into the first sheet with
// room, so one referral re-encodes one sheet and every other sheet stays byte-identical
// (same hash, same URL, still in every browser's cache).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { decodePng, packSheets } from "./sprite-atlas.mjs";

export const SHEET_CAP = 256;          // 16 x 16 cells of 64x48: a 1024x768 sheet, ~200 KB
const SPRITE_URL = /^\/api\/sprite\/([a-z0-9-]{1,80})\?v=([A-Za-z0-9._-]{1,40})$/;
const CACHE = join(process.env.HVI_SPRITE_CACHE || join(homedir(), ".cache", "hvi-sprites"), "atlas-src");

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

export const signature = want => createHash("sha1").update([...want].map(([s, v]) => `${s}@${v}`).sort().join("\n")).digest("hex").slice(0, 16);

// Which sheet each wanted sprite lives in. Members of the previous atlas whose v is
// unchanged stay put; the rest fill the first sheet with room, then new sheets.
// Returns an array of slug lists (empty sheets dropped).
export function assignSheets(want, prev, cap = SHEET_CAP) {
  const groups = [];
  const placed = new Set();
  for (const [slug, r] of Object.entries(prev?.sprites || {})) {
    if (!Array.isArray(r) || want.get(slug) !== r[0]) continue;
    (groups[r[1]] ||= []).push(slug);
    placed.add(slug);
  }
  const sheets = groups.filter(g => g && g.length);
  const fresh = [...want.keys()].filter(s => !placed.has(s)).sort((a, b) => want.get(a).localeCompare(want.get(b)) || a.localeCompare(b));
  for (const slug of fresh) {
    let g = sheets.find(x => x.length < cap);
    if (!g) sheets.push(g = []);
    g.push(slug);
  }
  return sheets.map(g => g.sort());
}

// Pack assigned sheets. load(slug, v) -> PNG bytes or null. A sprite that won't load or
// decode is left out (it keeps its own URL). reuse: members key -> previous hash, so an
// unchanged sheet is neither downloaded nor re-encoded.
export async function packAtlas(want, groups, load, { reuse = new Map() } = {}) {
  const sheets = [], sprites = {}, pngs = new Map(), skipped = [];
  for (const members of groups) {
    const key = members.map(s => `${s}@${want.get(s)}`).join(",");
    const old = reuse.get(key);
    if (old) {
      const idx = sheets.push(old.hash) - 1;
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
    const { png, rects } = packSheets(decoded, { maxWidth: 1024 });
    const hash = createHash("sha1").update(png).digest("hex").slice(0, 16);
    const idx = sheets.push(hash) - 1;
    pngs.set(hash, png);
    for (const d of decoded) { const r = rects[d.slug]; sprites[d.slug] = [want.get(d.slug), idx, r.x, r.y, r.w, r.h, r.frames]; }
  }
  const sorted = Object.fromEntries(Object.keys(sprites).sort().map(k => [k, sprites[k]]));
  const v = createHash("sha1").update(JSON.stringify([sheets, sorted])).digest("hex").slice(0, 12);
  return { json: { v, count: Object.keys(sorted).length, sheets, sprites: sorted }, pngs, skipped };
}

// members key -> { hash, rects } for every sheet of a previous atlas.
export function reusable(prev) {
  const bySheet = new Map();
  for (const [slug, r] of Object.entries(prev?.sprites || {})) {
    if (!Array.isArray(r)) continue;
    if (!bySheet.has(r[1])) bySheet.set(r[1], []);
    bySheet.get(r[1]).push([slug, r]);
  }
  const out = new Map();
  for (const [i, list] of bySheet) {
    const hash = prev.sheets?.[i];
    if (!hash) continue;
    list.sort((a, b) => a[0].localeCompare(b[0]));
    out.set(list.map(([s, r]) => `${s}@${r[0]}`).join(","), { hash, rects: Object.fromEntries(list) });
  }
  return out;
}

async function main() {
  const { store, figureIndex, retry } = await import("./roster/prod.mjs");
  const force = process.argv.includes("--force"), dry = process.argv.includes("--dry-run");
  const atlas = store("hvi-atlas"), sprites = store("hvi-sprites");
  const [cards, prev] = await Promise.all([retry(figureIndex), retry(() => atlas.get("current", { type: "json" }))]);
  const want = readySprites(cards);
  const sig = signature(want);
  if (!force && prev?.sig === sig) { console.log(`atlas: unchanged (${want.size} sprites, ${prev.sheets.length} sheets, v=${prev.v})`); return; }

  const groups = assignSheets(want, prev);
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
  const { json, pngs, skipped } = await packAtlas(want, groups, load, { reuse: force ? new Map() : reusable(prev) });
  json.sig = sig;
  json.at = new Date().toISOString();
  const kb = [...pngs.values()].reduce((a, p) => a + p.length, 0) / 1024;
  console.log(`atlas: ${json.count} sprites in ${json.sheets.length} sheets (${pngs.size} re-encoded, ${Math.round(kb)} KB new, ${downloaded} downloaded)${skipped.length ? `; left out ${skipped.join(", ")}` : ""}`);
  if (dry) return;
  // Sheets first, then the JSON that names them, so a reader never sees a missing sheet.
  for (const [hash, png] of pngs) await retry(() => atlas.set(`sheet-${hash}`, png));
  await retry(() => atlas.setJSON("current", json));
  // Keep this atlas's and the previous one's sheets (a page loaded a minute ago still
  // asks for those); drop the rest.
  const keep = new Set([...json.sheets, ...(prev?.sheets || [])].map(h => `sheet-${h}`));
  const { blobs } = await retry(() => atlas.list({ prefix: "sheet-" }));
  for (const b of blobs) if (!keep.has(b.key)) await retry(() => atlas.delete(b.key));
  console.log(`atlas: published v=${json.v}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(`atlas: FAILED ${e?.message || e}`); process.exit(1); });
}
