// Sprite sheets for the city views, shared by the map and every district. Same sources
// as the Holding Pen: the drawn sprite when one exists, the procedural file photo for
// citizens, the tier-coloured stand-in until either arrives. Browser only.

import { SPRITE_W, SPRITE_H, paintAvatar, paintPlaceholder, loadManifest, loadSprite, loadRepoSprite } from "../sprites.js";
import { getTier, slugify, slugCandidates, FAMOUS_FIGURES } from "../figures.js";
import { assignJob, machineClock } from "./sim.js";
import { sectorsWanted, planMode, summaryOf } from "./planClient.js";

let manifestP = null;
const bank = new Map();   // name -> entry

// entry: { img, frames, real, mini, v } — v bumps when the image changes.
// A stand-in from the day summary (crowd.js) wears the likeness of one of the figures on
// file (their sprites ship with the site): a crowd seen from afar looks like a crowd, and
// costs no download. It never opens, so it is nobody.
const LOOKS = FAMOUS_FIGURES.map(f => ({ ...f, slug: slugify(f.name), kind: "figure" }));
const lookOf = (s) => { let h = 0; for (let i = 0; i < s.name.length; i++) h = (h * 31 + s.name.charCodeAt(i)) | 0; return LOOKS[Math.abs(h) % LOOKS.length]; };
export function sheetFor(s) {
  // a stand-in wears a likeness under its own entry: a council sash stays on the real holder
  if (s.crowd) return sheetRaw(s.look || (s.look = lookOf(s)), "~");
  return sashed(s, sheetRaw(s));
}
function sheetRaw(s, pre = "") {
  let e = bank.get(pre + s.name);
  const slug = s.slug || slugify(s.name);
  if (e) {
    // A likeness drawn since we first looked (referrals get theirs within minutes).
    const src = srcOf(s);
    if (src && src !== e.src && !e.real) { e.src = src; attach(s, e, slug); }
    return e;
  }
  const img = s.avatar?.kind === "procedural" ? paintAvatar(s.avatar.spec, 2) : paintPlaceholder(slug, getTier(s.score).color, 2);
  e = { img, frames: 2, real: false, mini: null, v: 0, src: srcOf(s) };
  bank.set(pre + s.name, e);
  attach(s, e, slug);
  return e;
}

// THE COUNCIL SASH (docs/CITY_SPEC.md "Council elections"): a seat holder wears a sash over the
// shoulder in every view, from the day's civic record (summary.civic, seat.holder). Drawn onto a
// copy of the sheet, across each frame's chest, only where the likeness is (source-atop).
let sashDay = -1, sashKeys = new Set();
function holders() {
  const day = machineClock(Date.now()).day;
  if (day !== sashDay) {
    const civ = summaryOf(day)?.civic;
    if (civ?.districts) { sashDay = day; sashKeys = new Set(Object.values(civ.districts).map(x => x.seat?.holder).filter(Boolean)); }
  }
  return sashKeys;
}
export const isCouncil = (s) => Boolean(s && !s.crowd && holders().has(s.slug || slugify(s.name)));
function sashed(s, e) {
  const on = isCouncil(s);
  if (!on) { if (e.sash) { if (e.img === e.sashImg) e.img = e.base; e.mini = null; e.sash = 0; e.sashImg = null; } return e; }
  if (e.sash && e.sash === e.v + 1 && e.img === e.sashImg) return e;
  const base = e.sash && e.img === e.sashImg ? e.base : e.img;
  try {
    const w = base.width, h = base.height, fw = w / (e.frames || 1);
    if (!w || !h) return e;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x = c.getContext("2d");
    x.drawImage(base, 0, 0);
    x.globalCompositeOperation = "source-atop";
    const px = Math.max(1, Math.round(fw / 32));
    for (let f = 0; f < (e.frames || 1); f++) {
      const x0 = f * fw + fw * 0.34, y0 = h * 0.4, x1 = f * fw + fw * 0.66, y1 = h * 0.6;
      const n = Math.max(2, Math.round((x1 - x0) / px));
      for (let k = 0; k <= n; k++) {
        const xx = x0 + ((x1 - x0) * k) / n, yy = y0 + ((y1 - y0) * k) / n;
        x.fillStyle = "#b91c1c"; x.fillRect(Math.round(xx), Math.round(yy - px), px, px * 3);
        x.fillStyle = "#facc15"; x.fillRect(Math.round(xx), Math.round(yy - px), px, px);
      }
    }
    e.base = base; e.img = c; e.sashImg = c; e.sash = e.v + 1; e.mini = null;
  } catch { /* not decoded yet: the next frame tries again */ }
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
