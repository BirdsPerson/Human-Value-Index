// After the last hole: a short scene, chosen by how the round went, then the final card over it.
// Render-only (browser): it reads the finished round and touches nothing in it. The choice is
// pure (endScene: the result and the seed), so a replay shows the same scene.
//
//   champagne   under par, or the match won: the trophy, a cork, the bartender rings the bell,
//               the gallery cheers in the window
//   nineteenth  about par: the 19th hole: a beer, then a hot dog; the opponent beside you doing
//               their own thing (a sip, a hot dog, the scorecard)
//   alone       a poor round: the end of the bar, staring into the beer; the bartender wipes a glass
//   snap        a terrible round: by the pond, a club over the knee, the bag into the water, the
//               caddie quietly driving off with the cart
//   goose       about one round in ten, whatever the score: the 19th hole, and a goose takes the
//               hot dog
// Figures on file stay silent in every one (no speech): they eat, drink, read the card. Any button
// skips to the card (skipEnd). Reduced motion: one still frame.
import { fnv } from "./course.js";
import { drawText, textWidth, wrap } from "./font.js";
import { spectator } from "./render.js";

export const SCENES = ["champagne", "nineteenth", "alone", "snap", "goose"];
// One light line each (2026-10-06: the satire takes a break in the sports games; a wink, no more)
export const CAPTION = {
  champagne: "UNDER PAR. THE BELL GETS RUNG, AND THE FIRST ROUND IS ON YOU.",
  nineteenth: "ABOUT PAR. A BEER, A HOT DOG, AND NOBODY MENTIONS THE SEVENTH.",
  alone: "A LONG DAY. THE BARTENDER HAS SEEN WORSE. NOT THIS WEEK, BUT WORSE.",
  snap: "ONE CLUB, ONE BAG, ONE CADDIE GONE. THE POND IS KEEPING THE FIRST TWO.",
  goose: "A GOOSE HAS YOUR HOT DOG. THE GOOSE IS NOT SORRY.",
};
// What the gallery does (Golf.jsx plays it): a sound per scene, at a frame
export const SCENE_SOUND = { champagne: [["bell", 70], ["roar", 90]], nineteenth: [["thin", 40]], alone: [["crickets", 30]], snap: [["crickets", 60]], goose: [["ooh", 150]] };
export const SCENE_LEN = 420;   // frames before the card comes up on its own

// The scene for a finished round: -> one of SCENES
export function endScene(st) {
  const r = st.result;
  if (!r) return "nineteenth";
  const n = Math.max(1, r.holes.length), over = r.toPar[0];
  if (fnv(`end|${st.cfg.seed}|${r.total.join(",")}`) % 10 === 0) return "goose";
  const won = r.mode === "match" && r.winner != null ? r.winner === 0 : null;
  if (won === true || over < 0) return "champagne";
  if (over >= Math.max(15, n * 1.6)) return "snap";
  if (over <= n * 0.45 && won !== false) return "nineteenth";
  return "alone";
}

const MEM = new WeakMap();
const memOf = (st) => { let m = MEM.get(st); if (!m) MEM.set(st, m = { f0: null, skip: false }); return m; };
// Any button: straight to the card. -> true if this press did something
export function skipEnd(st) { const m = memOf(st); if (m.skip) return false; m.skip = true; return true; }
export const endFrame = (st, frame) => { const m = memOf(st); if (m.f0 == null) m.f0 = frame; return frame - m.f0; };

// ---- little drawing kit ---------------------------------------------------------------------------
function R(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
const WOOD = ["#3a200e", "#4c2c14", "#5e381a", "#704422", "#86542c"];
function panelWall(ctx, K, x0, y0, w, h) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x += 1) {
    const plank = Math.floor((x - x0) / 14), edge = (x - x0) % 14 === 0;
    const v = edge ? 0.3 : 2 + ((plank * 7) % 3) * 0.4 - ((y - y0) / h) * 0.9 + Math.sin(y * 0.35 + plank) * 0.25;
    const c = K.dith(WOOD.map(h2 => [parseInt(h2.slice(1, 3), 16), parseInt(h2.slice(3, 5), 16), parseInt(h2.slice(5, 7), 16)]), v, x, y);
    ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.fillRect(x, y, 1, 1);
  }
}
const WALL_CACHE = new Map();
function cachedWall(K, kind) {
  const key = `${kind}|${K.W}`;
  if (WALL_CACHE.has(key)) return WALL_CACHE.get(key);
  const c = document.createElement("canvas"); c.width = K.W; c.height = K.H;
  const g = c.getContext("2d");
  panelWall(g, K, 0, 0, K.W, K.H);
  // the window onto the 18th: sky, the green, a flag
  const wx = 18, wy = 22, ww = 112, wh = 64;
  R(g, wx - 3, wy - 3, ww + 6, wh + 6, "#24140a");
  const RG = (a) => a.map(h2 => [parseInt(h2.slice(1, 3), 16), parseInt(h2.slice(3, 5), 16), parseInt(h2.slice(5, 7), 16)]);
  const sky = RG(K.RAMP.sky), grass = RG(K.RAMP.fairway), grn = RG(K.RAMP.green);
  for (let y = 0; y < wh; y++) for (let x = 0; x < ww; x++) {
    const hz = 30;
    let c;
    if (y < hz) c = K.dith(sky, 2 + (y / hz) * 6, x, y);
    else { const gx = x - 70, gy = (y - 44) * 2.4; c = gx * gx + gy * gy < 26 * 26 ? K.dith(grn, 2.6 + (y - hz) * 0.05, x, y) : K.dith(grass, 1.5 + (y - hz) * 0.08, x, y); }
    g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; g.fillRect(wx + x, wy + y, 1, 1);
  }
  R(g, wx + 70, wy + 30, 1, 12, "#fcfcfc"); R(g, wx + 71, wy + 30, 5, 3, "#d82800");
  R(g, wx + ww / 2 - 1, wy, 2, wh, "#24140a"); R(g, wx, wy + wh / 2 - 1, ww, 2, "#24140a");
  // the shelves: bottles in a row, a sign
  for (const sy of [38, 70]) {
    R(g, 160, sy + 18, 144, 3, "#24140a"); R(g, 160, sy + 18, 144, 1, "#9c6c3c");
    for (let i = 0; i < 12; i++) {
      const bx = 164 + i * 12, col = ["#2c6c2c", "#7c2c1c", "#c89c3c", "#3c3c7c", "#d8d8e0", "#5c3418"][(i * 5 + sy) % 6], bh = 12 + ((i * 7) % 5);
      R(g, bx, sy + 18 - bh, 6, bh, col); R(g, bx + 2, sy + 18 - bh - 4, 2, 4, col); R(g, bx + 1, sy + 18 - bh + 2, 1, bh - 4, "#fcfcfc80");
      R(g, bx, sy + 18 - bh + 5, 6, 3, "#ece4c8");
    }
  }
  R(g, 176, 8, 112, 18, "#120806"); R(g, 177, 9, 110, 16, "#2a1408");
  drawText(g, "THE 19TH HOLE", 232 - textWidth("THE 19TH HOLE") / 2, 13, "#f8b800");
  WALL_CACHE.set(key, c);
  return c;
}
function counter(ctx, K, y) {
  R(ctx, 0, y, K.W, K.H - y, "#2a160a");
  R(ctx, 0, y, K.W, 5, "#86542c"); R(ctx, 0, y, K.W, 1, "#c08048"); R(ctx, 0, y + 5, K.W, 2, "#1a0c04");
  for (let x = 6; x < K.W; x += 40) R(ctx, x, y + 14, 30, K.H - y - 22, "#341c0c");
}
// A patron behind the counter, facing us: the top of their card (head, polo), 2x; the counter hides
// the rest. arm: null | {x, y} where the right hand is (relative to the figure's origin), holding `held`.
function patron(ctx, K, look, x, y, { arm = null, held = null, slump = 0, gen = "#7c7c7c" } = {}) {
  const card = look?.card;
  if (card) ctx.drawImage(card, 0, 0, 32, 30, x, y + slump, 64, 60);
  else { R(ctx, x + 22, y + 4 + slump, 20, 22, look?.skin || "#e8a070"); R(ctx, x + 22, y + slump, 20, 8, "#503000"); R(ctx, x + 14, y + 28 + slump, 36, 32, gen); }
  if (arm) {
    const sx = x + 50, sy = y + 32 + slump, shirt = look?.shirt || gen, skin = look?.skin || "#e8a070";
    const hx = x + arm.x, hy = y + arm.y + slump;
    // the upper arm from the shoulder, the forearm to the hand (thick pixel lines)
    const seg = (ax, ay, bx, by, c, r) => { const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay))); for (let i = 0; i <= n; i++) R(ctx, ax + ((bx - ax) * i) / n - r, ay + ((by - ay) * i) / n - r, r * 2, r * 2, c); };
    const ex = (sx + hx) / 2 + 6, ey = Math.max(sy, hy) + 4;
    seg(sx, sy, ex, ey, shirt, 3);
    seg(ex, ey, hx, hy, skin, 2.5);
    if (held) held(hx, hy);
  }
}
function mug(ctx, x, y, full = 1) {
  R(ctx, x - 5, y - 12, 11, 14, "#e8f0f8"); R(ctx, x - 4, y - 11 + (1 - full) * 10, 9, 12 - (1 - full) * 10, "#f0b020"); R(ctx, x - 4, y - 11 + (1 - full) * 10, 9, 2, "#fcfcf0");
  R(ctx, x + 6, y - 9, 3, 7, "#e8f0f8"); R(ctx, x + 7, y - 8, 1, 5, "#5c3418"); R(ctx, x - 4, y - 8, 1, 8, "#fcfcfc");
}
function hotdog(ctx, x, y, bitten = 0) {
  const w = 22 - bitten * 6;
  R(ctx, x - 11, y - 3, w, 6, "#d8a058"); R(ctx, x - 12, y - 2, w + 2, 3, "#8c3018"); R(ctx, x - 10, y - 2, w - 3, 1, "#f8d800");
  R(ctx, x - 11, y + 2, w, 2, "#b07838");
}
function bartender(ctx, K, x, y, f, mode) {
  R(ctx, x + 6, y, 12, 12, "#d8a070"); R(ctx, x + 6, y - 2, 12, 4, "#2c1c10"); R(ctx, x + 8, y + 5, 2, 2, "#1c1c1c"); R(ctx, x + 14, y + 5, 2, 2, "#1c1c1c");
  R(ctx, x + 9, y + 9, 6, 1, "#7c3c2c");
  R(ctx, x, y + 12, 24, 30, "#fcfcfc"); R(ctx, x + 3, y + 12, 18, 30, "#202028"); R(ctx, x + 9, y + 12, 6, 4, "#fcfcfc"); R(ctx, x + 9, y + 13, 6, 2, "#c01818");
  if (mode === "wipe") {
    const a = f / 7, gx = x + 30 + Math.cos(a) * 3, gy = y + 24 + Math.sin(a) * 2;
    R(ctx, x + 22, y + 16, 10, 4, "#202028"); R(ctx, gx - 4, gy - 8, 9, 12, "#cce0f0"); R(ctx, gx - 5, gy - 2, 11, 6, "#fcfcfc");
  } else if (mode === "bell") {
    R(ctx, x + 20, y - 8, 4, 22, "#202028"); R(ctx, x + 21, y - 30, 1, 24, "#c8a868");
  }
}
function bell(ctx, x, y, swing) {
  R(ctx, x - 1, y - 10, 2, 10, "#5c3418");
  const dx = Math.round(Math.sin(swing) * 3);
  R(ctx, x - 6 + dx, y, 12, 9, "#e8b820"); R(ctx, x - 7 + dx, y + 8, 14, 2, "#c89010"); R(ctx, x - 3 + dx, y + 1, 2, 6, "#fcf0a0"); R(ctx, x - 1 + dx * 2, y + 10, 2, 2, "#5c4010");
}
function goose(ctx, x, y, f, carrying) {
  const step = (f >> 3) & 1;
  R(ctx, x, y - 10, 18, 9, "#f4f4f4"); R(ctx, x + 2, y - 4, 14, 3, "#d8d8dc");
  R(ctx, x - 2, y - 22, 4, 14, "#f4f4f4"); R(ctx, x - 4, y - 26, 7, 6, "#f4f4f4"); R(ctx, x - 9, y - 24, 6, 3, "#f08c18"); R(ctx, x - 2, y - 25, 1, 1, "#000000");
  R(ctx, x + 5 + step * 3, y - 1, 2, 4, "#f08c18"); R(ctx, x + 11 - step * 3, y - 1, 2, 4, "#f08c18");
  R(ctx, x + 14, y - 12, 6, 4, "#e8e8ec");
  if (carrying) hotdog(ctx, x - 12, y - 22, 0);
}
function confetti(ctx, K, f, n = 40) {
  for (let i = 0; i < n; i++) {
    const x = (i * 53 + Math.sin(i * 1.7 + f / 20) * 8 + 1000) % K.W, y = ((i * 31 + f * (0.6 + (i % 5) * 0.15)) % (K.H + 20)) - 10;
    R(ctx, x, y, 2, 2, ["#f8b800", "#d82800", "#3cbcfc", "#b8f818", "#fcfcfc"][i % 5]);
  }
}
function generic(shirt) { return { shirt, skin: "#d8a070", pants: "#202028" }; }

// ---- the scenes ---------------------------------------------------------------------------------------
function bar(ctx, K, st, f, looks, kind) {
  ctx.drawImage(cachedWall(K, "bar"), 0, 0);
  const me = looks?.[0] || generic(st.players[0].color?.shirt || "#3cbcfc"), them = st.players[1] ? (looks?.[1] || generic(st.players[1].color?.shirt || "#f8b800")) : null;
  const cy = 150;
  if (kind === "alone") {
    // the end of the bar: the golfer slumped over the beer, the bartender wiping a glass, far off
    bartender(ctx, K, 24, 92, f, "wipe");
    patron(ctx, K, me, 214, 92, { slump: 6, arm: { x: 30, y: 54 }, held: (hx, hy) => mug(ctx, hx - 6, hy + 2, 0.95) });
    counter(ctx, K, cy);
    mug(ctx, 238, cy, 0.95);
    // a single moth over the lamp
    R(ctx, 250 + Math.round(Math.sin(f / 9) * 8), 30 + Math.round(Math.cos(f / 7) * 5), 2, 1, "#c8c0a0");
    return;
  }
  if (kind === "champagne") {
    const swing = f > 70 && f < 200 ? (f - 70) / 6 : 0;
    bell(ctx, 60, 96, swing);
    bartender(ctx, K, 70, 104, f, "bell");
    // the window: the gallery cheering
    for (let i = 0; i < 12; i++) spectator(ctx, { skin: ["#f0b080", "#a86c3c", "#d89868"][i % 3], shirt: ["#d82800", "#fcfcfc", "#3cbcfc", "#f8b800"][i % 4], ph: i, hat: i % 3 === 0 }, 26 + i * 8, 86, 9, f > 80 ? "roar" : "polite", f);
    // the trophy on the bar, the golfer with the bottle (the cork goes at 60)
    const lift = f < 50 ? f / 50 : 1;
    patron(ctx, K, me, 150, 96, { arm: { x: 62, y: 40 - 20 * lift }, held: (hx, hy) => {
      R(ctx, hx - 3, hy - 22, 7, 22, "#1c5c2c"); R(ctx, hx - 2, hy - 28, 5, 7, "#e8c040"); R(ctx, hx - 2, hy - 18, 5, 6, "#ece4c8");
      if (f > 60) for (let i = 0; i < 14; i++) { const t = (f - 60 + i * 3) % 40; R(ctx, hx + Math.sin(i * 2.1) * t * 0.6, hy - 30 - t * 1.4 + t * t * 0.03, 2, 2, "#fcfce0"); }
      if (f > 60 && f < 110) R(ctx, hx + (f - 60) * 0.8, hy - 30 - (f - 60) * 1.6 + (f - 60) ** 2 * 0.04, 3, 3, "#a87c48");
    } });
    if (them) patron(ctx, K, them, 228, 100, { arm: { x: 8, y: 56 }, held: (hx, hy) => mug(ctx, hx, hy + 4, 0.8) });
    counter(ctx, K, cy);
    R(ctx, 128, cy - 26, 18, 6, "#e8b820"); R(ctx, 132, cy - 20, 10, 12, "#e8b820"); R(ctx, 126, cy - 30, 22, 5, "#f8d050"); R(ctx, 130, cy - 8, 14, 4, "#c89010"); R(ctx, 134, cy - 26, 2, 10, "#fcf0a0");
    if (f > 90) confetti(ctx, K, f - 90);
    return;
  }
  // nineteenth / goose: a beer, then a hot dog; the opponent beside you doing their own thing
  bartender(ctx, K, 16, 100, f, "wipe");
  const sip = (f % 180) < 40 && f % 360 < 180;
  const eatT = f % 360 >= 180 && kind !== "goose" ? ((f % 360) - 180) : -1;
  const goneDog = kind === "goose" && f > 160;
  patron(ctx, K, me?.street ? { ...me, card: me.street } : me, 120, 96, {   // the 19th hole: out of the uniform, into your own clothes (THE SHOPS)
    arm: sip ? { x: 40, y: 30 } : eatT >= 0 && eatT % 60 < 30 ? { x: 38, y: 32 } : kind === "goose" && f > 165 && f < 260 ? { x: 70, y: 18 } : { x: 54, y: 56 },
    held: (hx, hy) => { if (sip) mug(ctx, hx, hy + 6, 0.7); else if (eatT >= 0) hotdog(ctx, hx, hy, Math.min(2, Math.floor(eatT / 60))); },
  });
  if (them) {
    // the figure: silent; a sip, a hot dog or the scorecard, chosen once by the seed
    const act = fnv(`act|${st.cfg.seed}`) % 3;
    const up = (f + 90) % 240 < 50;
    patron(ctx, K, them, 200, 98, {
      arm: act === 2 ? { x: 30, y: 44 } : up ? { x: 40, y: 30 } : { x: 52, y: 56 },
      held: (hx, hy) => { if (act === 2) { R(ctx, hx - 12, hy - 10, 18, 12, "#fcfcf0"); for (let i = 0; i < 4; i++) R(ctx, hx - 10, hy - 8 + i * 3, 14, 1, "#7c7c7c"); } else if (act === 1 && up) hotdog(ctx, hx, hy, 0); else if (up) mug(ctx, hx, hy + 6, 0.6); },
    });
  }
  counter(ctx, K, cy);
  if (!sip) mug(ctx, 172, cy, 0.7);
  if (them && !((f + 90) % 240 < 50)) mug(ctx, 252, cy, 0.6);
  // the hot dog on its plate, until it is eaten (or taken)
  R(ctx, 140, cy - 2, 26, 3, "#fcfcfc");
  if (kind === "goose") {
    if (!goneDog) hotdog(ctx, 153, cy - 4, 0);
    const gx = f < 160 ? 330 - (f / 160) * 170 : 160 - (f - 160) * 1.4;
    if (gx > -40) { ctx.save(); ctx.translate(Math.round(gx), cy + 1); ctx.scale(2, 2); goose(ctx, 0, 0, f, goneDog); ctx.restore(); }
  } else if (eatT < 0) hotdog(ctx, 153, cy - 4, 0);
}
function pond(ctx, K, st, f, looks) {
  // by the pond behind the 18th: sky, the tree line, the water, the grass
  const RG = (a) => a.map(h2 => [parseInt(h2.slice(1, 3), 16), parseInt(h2.slice(3, 5), 16), parseInt(h2.slice(5, 7), 16)]);
  const sky = RG(K.RAMP.sky), grass = RG(K.RAMP.rough), water = RG(K.RAMP.water), tree = RG(K.RAMP.tree);
  const img = ctx.createImageData(K.W, K.H), d = img.data;
  for (let y = 0; y < K.H; y++) for (let x = 0; x < K.W; x++) {
    let c;
    const tl = 70 + Math.round(Math.sin(x / 13) * 4 + Math.sin(x / 5) * 2);
    if (y < tl) c = K.dith(sky, (y / 70) * 7, x, y);
    else if (y < 86) c = K.dith(tree, 2.5 - (y - tl) * 0.08, x, y);
    else { const px0 = (x - 230) / 90, py0 = (y - 120) / 22; c = px0 * px0 + py0 * py0 < 1 ? K.dith(water, 2.5 + py0 * 0.8 + (((x + y + (f >> 3)) % 29) === 0 ? 2 : 0), x, y) : K.dith(grass, 1.6 + (y - 86) * 0.02 + ((x * 7 + y * 13) % 11 === 0 ? 1 : 0), x, y); }
    const i = (y * K.W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const me = looks?.[0];
  const gx = 70, gy = 104;
  K.shadow(ctx, gx + 34, gy + 96, 26, 4, 0.3);
  if (me?.card) ctx.drawImage(me.card, gx, gy, 64, 96);
  else { R(ctx, gx + 22, gy + 4, 20, 22, "#e8a070"); R(ctx, gx + 14, gy + 28, 36, 30, st.players[0].color?.shirt || "#3cbcfc"); R(ctx, gx + 16, gy + 58, 32, 36, "#7c7c7c"); }
  // the club: held up, then over the knee, then two pieces
  if (f < 90) { R(ctx, gx + 4, gy + 40, 56, 2, "#c8ccd4"); R(ctx, gx + 58, gy + 38, 5, 6, "#50505c"); }
  else if (f < 104) { R(ctx, gx + 6, gy + 62, 26, 2, "#c8ccd4"); R(ctx, gx + 32, gy + 56, 2, 8, "#c8ccd4"); }
  else { R(ctx, gx - 14, gy + 92, 24, 2, "#c8ccd4"); R(ctx, gx + 50, gy + 90, 22, 2, "#c8ccd4"); R(ctx, gx + 70, gy + 88, 5, 5, "#50505c"); }
  // the bag: on the grass, then in an arc into the pond, then a splash, then gone
  const t = f - 130;
  if (t < 0) { R(ctx, gx - 30, gy + 56, 14, 40, "#a81c1c"); R(ctx, gx - 28, gy + 46, 2, 12, "#c8ccd4"); R(ctx, gx - 23, gy + 44, 2, 14, "#c8ccd4"); R(ctx, gx - 18, gy + 48, 2, 10, "#c8ccd4"); }
  else if (t < 50) { const u = t / 50, bx = gx - 24 + u * 230, by = gy + 60 - Math.sin(u * Math.PI) * 70; R(ctx, bx - 7, by - 20, 14, 40, "#a81c1c"); R(ctx, bx - 4, by - 30, 2, 12, "#c8ccd4"); }
  else if (t < 80) { for (let i = 0; i < 10; i++) R(ctx, 206 + Math.cos(i) * (t - 50) * 0.8, 120 - Math.abs(Math.sin(i * 1.3)) * (30 - Math.abs(t - 65) * 1.6), 2, 3, "#d0e8fc"); }
  else R(ctx, 202 + Math.round(Math.sin(f / 6)) * 2, 122, 10, 1, "#a8d0fa");
  // the caddie and the cart, quietly leaving
  const cx = f < 200 ? 250 : 250 + (f - 200) * 0.9;
  if (cx < K.W + 40) {
    R(ctx, cx, 150, 44, 20, "#fcfcfc"); R(ctx, cx + 2, 138, 40, 3, "#e8e8e8"); R(ctx, cx + 4, 141, 2, 10, "#9c9ca4"); R(ctx, cx + 38, 141, 2, 10, "#9c9ca4");
    R(ctx, cx + 4, 168, 9, 9, "#202024"); R(ctx, cx + 31, 168, 9, 9, "#202024");
    R(ctx, cx + 16, 136, 10, 10, "#d8a070"); R(ctx, cx + 15, 134, 12, 3, "#fcfcfc"); R(ctx, cx + 14, 146, 14, 8, "#3c6c3c");
  }
}

// The whole end: the scene with its caption, then (on a press, or after SCENE_LEN) the card over it.
export function drawEnd(ctx, st, frame, looks, opts, K) {
  const kind = endScene(st), f = opts.still ? 150 : endFrame(st, frame);
  const m = memOf(st), card = m.skip || f >= SCENE_LEN;
  const loop = f < SCENE_LEN ? f : SCENE_LEN - 180 + ((f - SCENE_LEN) % 360);
  if (kind === "snap") pond(ctx, K, st, opts.still ? 150 : Math.min(loop, 300), looks);
  else bar(ctx, K, st, opts.still ? 150 : loop, looks, kind);
  if (!card) {
    R(ctx, 0, K.H - 32, K.W, 32, "#000000c0");
    wrap(CAPTION[kind], 52).slice(0, 2).forEach((l, i) => drawText(ctx, l, 6, K.H - 28 + i * 10, K.PAL.gold));
    if ((frame >> 5) % 2 && !opts.still) drawText(ctx, "A: THE CARD", K.W - 4 - textWidth("A: THE CARD"), 4, K.PAL.white);
    return;
  }
  R(ctx, 0, 0, K.W, K.H, "#000000a8");
  K.scorecard(ctx, st, "FINAL CARD // EXHIBITION");
  wrap(st.result?.line || "", 50).slice(0, 2).forEach((l, i) => drawText(ctx, l, 30, 154 + i * 10, K.PAL.gold));
  wrap(CAPTION[kind], 50).slice(0, 2).forEach((l, i) => drawText(ctx, l, 30, 180 + i * 10, K.PAL.grey));
  drawText(ctx, "EXHIBITION. THE CARD STAYS IN THIS BROWSER.", 30, 206, K.PAL.dgrey);
}
