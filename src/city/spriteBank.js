// Sprite sheets for the city views, shared by the map and every district. Same sources
// as the Holding Pen: the drawn sprite when one exists, the procedural file photo for
// citizens, the tier-coloured stand-in until either arrives. Browser only.

import { SPRITE_W, SPRITE_H, paintAvatar, paintPlaceholder, loadManifest, loadSprite, loadRepoSprite } from "../sprites.js";
import { getTier, slugify, slugCandidates, FAMOUS_FIGURES } from "../figures.js";
import { assignJob } from "./sim.js";
import { sectorsWanted, planMode } from "./planClient.js";

let manifestP = null;
const bank = new Map();   // name -> entry

// entry: { img, frames, real, mini, v } — v bumps when the image changes.
// A stand-in from the day summary (crowd.js) wears the likeness of one of the figures on
// file (their sprites ship with the site): a crowd seen from afar looks like a crowd, and
// costs no download. It never opens, so it is nobody.
const LOOKS = FAMOUS_FIGURES.map(f => ({ ...f, slug: slugify(f.name), kind: "figure" }));
const lookOf = (s) => { let h = 0; for (let i = 0; i < s.name.length; i++) h = (h * 31 + s.name.charCodeAt(i)) | 0; return LOOKS[Math.abs(h) % LOOKS.length]; };
export function sheetFor(s) {
  if (s.crowd) s = s.look || (s.look = lookOf(s));
  let e = bank.get(s.name);
  const slug = s.slug || slugify(s.name);
  if (e) {
    // A likeness drawn since we first looked (referrals get theirs within minutes).
    const src = srcOf(s);
    if (src && src !== e.src && !e.real) { e.src = src; attach(s, e, slug); }
    return e;
  }
  const img = s.avatar?.kind === "procedural" ? paintAvatar(s.avatar.spec, 2) : paintPlaceholder(slug, getTier(s.score).color, 2);
  e = { img, frames: 2, real: false, mini: null, v: 0, src: srcOf(s) };
  bank.set(s.name, e);
  attach(s, e, slug);
  return e;
}

const srcOf = (s) => (s.avatar?.kind === "sprite" && s.avatar.url) || (typeof s.sprite === "string" && s.sprite ? s.sprite : null);

// The production atlas packs a likeness with the others of its sector, the subject's work
// district (scripts/prod-atlas.mjs). A face whose sector the view has loaded counts toward
// buying that sector's sheet; any other face (a visitor from a district not in view) is
// fetched on its own. Without a split day (legacy: the whole census) every district is in
// view.
function sectorFor(s) {
  let d = null;
  try { d = assignJob(s).district; } catch { return null; }
  return planMode() === "legacy" || sectorsWanted().has(d) ? d : null;
}

function attach(s, e, slug) {
  manifestP = manifestP || loadManifest();
  manifestP.then(manifest => {
    const src = srcOf(s);
    const key = slugCandidates(s.name).concat(slug).find(k => manifest && manifest[k]);
    if (!src && !key) return;
    const meta = (key && manifest[key]) || {};
    (src ? loadSprite(src, { sector: sectorFor(s) }) : loadRepoSprite(key)).then(img => {
      if (!img) return;
      e.img = img; e.real = true; e.mini = null; e.v++;
      e.frames = Math.max(1, meta.frames || Math.floor(img.width / (meta.w || SPRITE_W)) || 1);
    });
  });
}

// Forget every sheet (City calls this on unmount). A later visit paints them again;
// sprite images come back from the browser cache.
export function clearBank() { bank.clear(); }

// A 16x24 thumbnail of the standing frame, averaged down once, for the map's middle zoom.
export function miniFor(s) {
  const e = sheetFor(s);
  if (e.mini) return e.mini;
  const c = document.createElement("canvas");
  c.width = SPRITE_W / 2; c.height = SPRITE_H / 2;
  const x = c.getContext("2d");
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = "high";
  try { x.drawImage(e.img, 0, 0, SPRITE_W, SPRITE_H, 0, 0, c.width, c.height); } catch { /* not decoded yet */ }
  e.mini = c;
  return c;
}
