// What is actually on Electric Basement TV, as one pixelated frame for every TV in the city
// (the wall TVs in funnelProps.ebtvTv, the station's screen in funnelDraw.js). The always-on
// Mac grabs it every 30 s (scripts/ebtv_frame.py) and /api/ebtv-frame serves it.
//   - one shared fetch for every TV, asked for only by a TV being drawn (so: only while one is
//     on screen) and at most every REFRESH_MS, never from a hidden tab
//   - a frame older than STALE_MS (or none) is the OFF AIR test card: a stream that moved or
//     died never reads as a confident picture
//   - a tap on a TV: the real channel in a new tab (CityIso takes the boxes drawn this frame)
// The pure parts (frameFresh, fetchDue) are what scripts/check-ebtv-frame.mjs checks.
import { utm } from "./funnels.js";

export const FRAME_URL = "/api/ebtv-frame";
export const WATCH_URL = "https://electricbasement.tv/watch";
export const REFRESH_MS = 30 * 1000;
export const STALE_MS = 3 * 60 * 1000;

// fresh: a frame with a timestamp under STALE_MS old (a clock a minute fast is forgiven)
export const frameFresh = (f, now) => Boolean(f && Number.isFinite(f.at) && now - f.at < STALE_MS && f.at - now < 60 * 1000);
// due: never asked, or the last ask is REFRESH_MS old, and the tab is visible
export const fetchDue = (last, now, hidden = false) => !hidden && (last == null || now - last >= REFRESH_MS);

let F = null, img = null, last = null;
function ask(now) {
  last = now;
  fetch(FRAME_URL).then(r => (r.ok ? r.json() : null)).then(j => {
    if (!j?.png || !Number.isFinite(j.at) || (F && j.at <= F.at)) return;   // nothing new: the old frame ages out
    const im = new Image();
    im.onload = () => { img = im; F = { at: j.at, title: j.title || null }; };
    im.src = j.png;
  }).catch(() => { /* off the air is the stale frame's to say */ });
}

// -> {img, at, title} while fresh, else null (the test card). Calling it is what asks.
export function ebtvFrame(now = Date.now()) {
  if (typeof window === "undefined") return null;
  if (fetchDue(last, now, document.hidden)) ask(now);
  return img && frameFresh(F, now) ? { img, ...F } : null;
}
export const ebtvTitle = () => (F && frameFresh(F, Date.now()) ? F.title : null);
export const ebtvLabel = () => { const t = ebtvTitle(); return `Watch Electric Basement TV live${t ? `: ${t}` : ""}`; };
export const watchHref = (campaign = "ebtv-tv") => utm(WATCH_URL, campaign);

// The TVs drawn this frame, in canvas px: [x0, y0, x1, y1]. Capped: a view that never takes them
// (the tower, the room stage) cannot grow the list.
const BOXES = [];
export function tvBox(x0, y0, x1, y1) { if (BOXES.length < 32) BOXES.push([x0, y0, x1, y1]); }
export function takeTvBoxes() { return BOXES.splice(0); }

// Draw the frame into (x, y, w, h), cropped to fill (the 16:9 frame's sides go first). -> true if drawn
export function drawFrame(c, f, x, y, w, h) {
  const iw = f.img.naturalWidth || f.img.width, ih = f.img.naturalHeight || f.img.height;
  let sw = iw, sh = ih;
  if (iw / ih > w / h) sw = ih * (w / h); else sh = iw / (w / h);
  const smooth = c.imageSmoothingEnabled;
  c.imageSmoothingEnabled = false;
  c.drawImage(f.img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
  c.imageSmoothingEnabled = smooth;
  return true;
}
