// Holding Pen helpers: procedural placeholder sprites, tier gaits, the per-frame
// movement step, and the sparkline maths the intake result uses.
// Everything above paintPlaceholder() is pure (no DOM) so scripts/check-pen.mjs
// can run it under plain node.

export const SPRITE_W = 32;
export const SPRITE_H = 48;

// FNV-1a. Stable per-slug seed so a subject keeps the same face between visits.
export function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Palette slots for placeholder pixels.
export const PX = { EMPTY: 0, OUTLINE: 1, BODY: 2, SHADE: 3, SKIN: 4, EYE: 5, HAIR: 6, BADGE: 7, LEGS: 8 };

const SKINS = ["#f1c9a5", "#d9a47a", "#a86f48", "#6e4428"];
const HAIRS = ["#1b1b1b", "#4a3020", "#8a6a3a", "#c9c9c9", "#2d2a4a", "#6b2a1a"];

// 32x48 palette-index grid for one frame. frame 1 = mid-stride.
export function placeholderPixels(seed, frame = 0) {
  const W = SPRITE_W, H = SPRITE_H;
  const px = new Uint8Array(W * H);
  const rnd = mulberry32(seed);
  const drop = Math.floor(rnd() * 5);             // shorter subjects start lower
  const headW = rnd() < 0.5 ? 10 : 12;
  const headH = 10;
  const hair = Math.floor(rnd() * 4);            // 0 flat, 1 spiky, 2 bald, 3 long
  const torsoW = 12 + 2 * Math.floor(rnd() * 3);
  const cx = 16;
  const headTop = 5 + drop;
  const torsoTop = headTop + headH + 1;
  const torsoBot = 34;
  const set = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = c; };
  const rect = (x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c); };

  // head + face
  const hx = cx - headW / 2;
  rect(hx, headTop, headW, headH, PX.SKIN);
  set(cx - 3, headTop + 5, PX.EYE); set(cx - 3, headTop + 6, PX.EYE);
  set(cx + 2, headTop + 5, PX.EYE); set(cx + 2, headTop + 6, PX.EYE);
  rect(cx - 1, headTop + 8, 3, 1, PX.SHADE);      // a mouth of mild concern
  if (hair === 0) rect(hx, headTop, headW, 3, PX.HAIR);
  if (hair === 1) { rect(hx, headTop, headW, 2, PX.HAIR); for (let x = hx; x < hx + headW; x += 2) set(x, headTop - 1, PX.HAIR); }
  if (hair === 3) { rect(hx - 1, headTop, headW + 2, 3, PX.HAIR); rect(hx - 1, headTop + 3, 2, 8, PX.HAIR); rect(hx + headW - 1, headTop + 3, 2, 8, PX.HAIR); }
  rect(cx - 2, headTop + headH, 4, 1, PX.SKIN);   // neck

  // torso (the tier colour is the uniform)
  const tx = cx - torsoW / 2;
  rect(tx, torsoTop, torsoW, torsoBot - torsoTop, PX.BODY);
  rect(tx + torsoW - 3, torsoTop, 3, torsoBot - torsoTop, PX.SHADE);
  rect(tx + 2, torsoTop + 3, 2, 2, PX.BADGE);     // ID badge. Everyone has one.

  // arms swing opposite to legs on the stride frame
  const swing = frame === 1 ? 1 : 0;
  const armLen = 11;
  rect(tx - 3, torsoTop + 1 - swing, 3, armLen, PX.BODY);
  rect(tx - 3, torsoTop + 1 - swing + armLen, 3, 2, PX.SKIN);
  rect(tx + torsoW, torsoTop + 1 + swing, 3, armLen, PX.SHADE);
  rect(tx + torsoW, torsoTop + 1 + swing + armLen, 3, 2, PX.SKIN);

  // legs + shoes
  for (let y = torsoBot; y < H - 1; y++) {
    const k = frame === 1 ? Math.floor((y - torsoBot) / 4) : 0;
    rect(cx - 5 - k, y, 4, 1, PX.LEGS);
    rect(cx + 1 + k, y, 4, 1, PX.LEGS);
  }
  const k = frame === 1 ? 3 : 0;
  rect(cx - 6 - k, H - 2, 5, 2, PX.OUTLINE);
  rect(cx + 1 + k, H - 2, 5, 2, PX.OUTLINE);

  // 1px outline around everything that is not already outline
  const out = px.slice();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (px[y * W + x] !== PX.EMPTY) continue;
    const n = (xx, yy) => xx >= 0 && xx < W && yy >= 0 && yy < H && px[yy * W + xx] > PX.OUTLINE;
    if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) out[y * W + x] = PX.OUTLINE;
  }
  return out;
}

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function paletteFor(tierColor, seed) {
  const [r, g, b] = hexToRgb(tierColor);
  const d = (f) => [Math.round(r * f), Math.round(g * f), Math.round(b * f)];
  return [
    null,
    [5, 8, 5],
    [r, g, b],
    d(0.62),
    hexToRgb(SKINS[seed % SKINS.length]),
    [10, 15, 10],
    hexToRgb(HAIRS[(seed >>> 3) % HAIRS.length]),
    [229, 255, 233],
    [29, 42, 34],
  ];
}

// ---------------------------------------------------------------------------
// Movement. A "world" is in sprite pixels:
//   { w, floorTop, floorBottom, doorX, doorW }
// Entities are plain mutable objects; stepEntity never allocates.

export const GAITS = {
  "ESSENTIAL INFRASTRUCTURE": { speed: 26, idleMin: 0.4, idleMax: 1.6, fps: 9, bob: 1, zone: "all", reach: 1.0, flip: 0.1 },
  "RETAINED SPECIALIST":      { speed: 19, idleMin: 0.8, idleMax: 2.6, fps: 8, bob: 1, zone: "all", reach: 0.7, flip: 0.2 },
  "TOLERATED GENERALIST":     { speed: 13, idleMin: 1.2, idleMax: 4.0, fps: 6, bob: 1, zone: "all", reach: 0.35, flip: 0.4 },
  "MONITORED CIVILIAN":       { speed: 9,  idleMin: 1.5, idleMax: 4.5, fps: 5, bob: 1, zone: "all", reach: 0.25, flip: 0.9 },
  "FLAGGED FOR DELETION":     { speed: 6,  idleMin: 2.0, idleMax: 6.0, fps: 4, bob: 0, zone: "door", reach: 1.0, flip: 0.6 },
  "SOYLENT GREEN":            { speed: 3.5, idleMin: 2.5, idleMax: 7.0, fps: 3, bob: 0, zone: "door", reach: 1.0, flip: 0.3 },
};

export function gaitFor(tierLabel, reducedMotion = false) {
  const g = GAITS[tierLabel] || GAITS["TOLERATED GENERALIST"];
  if (!reducedMotion) return g;
  return { ...g, speed: g.speed * 0.4, fps: Math.max(2, g.fps / 2), bob: 0, idleMin: g.idleMin * 2, idleMax: g.idleMax * 2 };
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// The PROCESSING zone: a strip of floor in front of the door.
export function doorZone(world) {
  return { x0: Math.max(14, world.doorX - 50), x1: Math.min(world.w - 14, world.doorX + world.doorW + 24), y0: world.floorTop + 2, y1: Math.min(world.floorBottom, world.floorTop + 34) };
}

export function pickTarget(e, world, rnd) {
  const g = e.gait;
  if (g.zone === "door") {
    const z = doorZone(world);
    e.tx = z.x0 + rnd() * (z.x1 - z.x0);
    e.ty = z.y0 + rnd() * (z.y1 - z.y0);
  } else {
    const spanX = (world.w - 28) * g.reach, spanY = (world.floorBottom - world.floorTop) * g.reach;
    e.tx = clamp(e.x + (rnd() * 2 - 1) * spanX, 14, world.w - 14);
    e.ty = clamp(e.y + (rnd() * 2 - 1) * spanY, world.floorTop + 2, world.floorBottom);
  }
}

// Advance one wandering entity by dt seconds. Held/falling states are the pen's job.
export function stepEntity(e, dt, world, rnd) {
  const g = e.gait;
  if (e.state === "idle") {
    e.timer -= dt;
    if (rnd() < g.flip * dt) e.dir = -e.dir;
    if (e.timer <= 0) { pickTarget(e, world, rnd); e.state = "walk"; }
    return;
  }
  if (e.state !== "walk") return;
  const dx = e.tx - e.x, dy = e.ty - e.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const step = g.speed * dt;
  if (dist <= step || dist < 0.5) {
    e.x = e.tx; e.y = e.ty;
    e.state = "idle";
    e.timer = g.idleMin + rnd() * (g.idleMax - g.idleMin);
    return;
  }
  e.x += (dx / dist) * step;
  e.y += (dy / dist) * step * 0.7;              // plazas are wider than they are deep
  if (Math.abs(dx) > 0.5) e.dir = dx < 0 ? -1 : 1;
  e.x = clamp(e.x, 14, world.w - 14);
  e.y = clamp(e.y, world.floorTop + 2, world.floorBottom);
  e.animT += dt;
}

// ---------------------------------------------------------------------------
// Sparkline: values -> "x,y x,y ..." inside a w x h box with padding.
export function sparkPoints(values, w, h, pad = 4) {
  if (!values || values.length === 0) return "";
  let lo = Infinity, hi = -Infinity;
  for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (hi - lo < 40) { const mid = (hi + lo) / 2; lo = mid - 20; hi = mid + 20; }
  const n = values.length;
  return values.map((v, i) => {
    const x = n === 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (n - 1);
    const y = pad + (1 - (v - lo) / (hi - lo)) * (h - 2 * pad);
    return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
  }).join(" ");
}

// ---------------------------------------------------------------------------
// Browser only below.

// Returns a canvas sprite sheet (frames side by side) coloured by tier.
export function paintPlaceholder(slug, tierColor, frames = 2) {
  const seed = hashStr(slug);
  const pal = paletteFor(tierColor, seed);
  const c = document.createElement("canvas");
  c.width = SPRITE_W * frames; c.height = SPRITE_H;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(c.width, c.height);
  for (let f = 0; f < frames; f++) {
    const px = placeholderPixels(seed, f);
    for (let y = 0; y < SPRITE_H; y++) for (let x = 0; x < SPRITE_W; x++) {
      const p = pal[px[y * SPRITE_W + x]];
      if (!p) continue;
      const o = (y * c.width + f * SPRITE_W + x) * 4;
      img.data[o] = p[0]; img.data[o + 1] = p[1]; img.data[o + 2] = p[2]; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export async function loadManifest() {
  try {
    const r = await fetch("/sprites/manifest.json", { cache: "no-cache" });
    if (!r.ok) return {};
    const j = await r.json();
    return j && typeof j === "object" ? j : {};
  } catch { return {}; }
}

export function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
