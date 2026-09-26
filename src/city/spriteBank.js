// Sprite sheets for the city views, shared by the map and every district. Same sources
// as the Holding Pen: the drawn sprite when one exists, the procedural file photo for
// citizens, the tier-coloured stand-in until either arrives. Browser only.

import { SPRITE_W, SPRITE_H, paintAvatar, paintPlaceholder, loadManifest, loadImage } from "../sprites.js";
import { getTier, slugify, slugCandidates } from "../figures.js";

let manifestP = null;
const bank = new Map();   // name -> entry

// entry: { img, frames, real, mini, v } — v bumps when the image changes.
export function sheetFor(s) {
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

function attach(s, e, slug) {
  manifestP = manifestP || loadManifest();
  manifestP.then(manifest => {
    const src = srcOf(s);
    const key = slugCandidates(s.name).concat(slug).find(k => manifest && manifest[k]);
    if (!src && !key) return;
    const meta = (key && manifest[key]) || {};
    loadImage(src || `/sprites/${key}.png`).then(img => {
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
