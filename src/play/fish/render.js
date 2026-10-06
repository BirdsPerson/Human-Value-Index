// THE WATERS on a 256x224 canvas, the way the 16-bit fishing games framed it (Black Bass, Legend of
// the River King): the angler on the left on the pier or the bank, the water in cross-section to
// the right, the fish visible under the surface, the sky by the machine clock's light and the day's
// weather. Reads the sim's state, changes nothing. Whole pixels only; Fish.jsx scales the canvas by
// whole device pixels with smoothing off.
import { LURES, LURE, SPECIES_BY, LIGHTS, SEASONS, lbText, inText } from "./data.js";
import { spotOf, bottomAt, METER_PERIOD } from "./sim.js";
import { drawFish, lenFor } from "./art.js";
import { drawText, textWidth, wrap } from "../golf/font.js";

export const W = 256, H = 224;
const SURF_Y = 84, FLOOR_Y = 162, PANEL_Y = 166, X0 = 46, X1 = 250;
export const PAL = {
  black: "#000000", white: "#fcfcfc", grey: "#bcbcbc", dgrey: "#7c7c7c", red: "#d82800", gold: "#f8b800", lime: "#b8f818",
  wood: "#7c4c1c", wood2: "#5c3410", sand: "#e4c890", sand2: "#c4a46c", grass: "#00a800", grass2: "#005800", rock: "#6c6c6c", mud: "#5c4c34",
};
const TONE = { harm: PAL.red, warn: PAL.gold, good: PAL.lime, "": PAL.white };
// sky bands per light: dawn, day, dusk, night
const SKY = [["#f8a4c0", "#fcbcb0", "#fce0a8"], ["#3cbcfc", "#68ccfc", "#a4e4fc"], ["#6844fc", "#d84c7c", "#f87858"], ["#000020", "#08082c", "#101444"]];
const WATER = { ocean: ["#0058f8", "#0040c8", "#002c90"], estuary: ["#2c7c74", "#1c5c5c", "#0c3c44"], river: ["#3c94a4", "#24747c", "#145058"], lake: ["#1c6cac", "#0c4c8c", "#08346c"] };

function px(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); }
function line(c, x0, y0, x1, y1, col) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  c.fillStyle = col;
  for (let k = 0; k < 800; k++) {
    c.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}
const hash = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
function text(c, s, x, y, col, shadow = true) { if (shadow) drawText(c, s, x + 1, y + 1, PAL.black); drawText(c, s, x, y, col); }
function centered(c, s, y, col) { text(c, s, Math.round((W - textWidth(s)) / 2), y, col); }

// screen position of a point x yards out, d feet down
export function toScreen(spot, x, d) {
  const sx = X0 + (x / (spot.cast * 1.1)) * (X1 - X0);
  const sy = SURF_Y + (d / spot.depth) * (FLOOR_Y - SURF_Y - 2);
  return [sx, sy];
}
const ROD_TIP = [54, 34];

export function draw(c, st, frame, paused, o = {}) {
  const spot = spotOf(st), cond = st.cond, still = Boolean(o.reduced);
  const f = still ? 0 : frame;
  c.imageSmoothingEnabled = false;
  sky(c, cond, f, spot);
  water(c, spot, cond, f);
  shore(c, spot, cond, st);
  // the fish under the surface (dim at night and in fog)
  const dim = cond.light === 3 ? 0.45 : cond.weather === "FOG" ? 0.6 : 0.85;
  c.save();
  for (const fi of st.fish) {
    const [sx, sy] = toScreen(spot, fi.x, fi.d);
    if (sx < X0 - 4 || sx > W + 10) continue;
    const s = SPECIES_BY[fi.sp], hooked = fi.st === "hooked";
    const len = Math.round(lenFor(fi.sp, fi.cw, s.legend ? 34 : 24) * (s.art.shape === "eel" ? 1.3 : 1));
    const dir = hooked ? 1 : fi.st === "look" || fi.st === "nibble" || fi.st === "bite" ? (st.bob && st.bob.x < fi.x ? -1 : 1) : fi.vx < 0 ? -1 : 1;
    c.globalAlpha = hooked ? 1 : dim;
    const jumpY = hooked && st.fight?.jump > 26 ? SURF_Y - 10 - Math.round(Math.sin(((40 - st.fight.jump) / 14) * Math.PI) * 14) : sy;
    drawFish(c, fi.sp, sx, jumpY, len, dir, still ? 0 : (frame + fi.id * 9) * (hooked ? 0.6 : 0.25));
  }
  c.restore();
  lineAndLure(c, st, spot, f);
  if (cond.weather === "RAIN" && !still) rain(c, frame);
  if (cond.weather === "FOG") fog(c, frame, still);
  hud(c, st, spot, cond);
  if (st.phase === "landed") catchCard(c, st, frame, still);
  if (paused) { px(c, 70, 92, 116, 28, PAL.black); centered(c, "PAUSED", 102, PAL.white); }
}

function sky(c, cond, f, spot) {
  let bands = SKY[cond.light];
  if (cond.weather === "OVERCAST" || cond.weather === "RAIN") bands = cond.light === 3 ? ["#08080c", "#101018", "#181824"] : ["#7c7c84", "#94949c", "#acacb4"];
  const hgt = SURF_Y;
  for (let i = 0; i < 3; i++) px(c, 0, Math.round((i * hgt) / 3), W, Math.ceil(hgt / 3) + 1, bands[i]);
  if (cond.light === 3) for (let i = 0; i < 24; i++) { const h = hash(i, 7); px(c, h % W, (h >>> 9) % 60, 1, 1, (h >>> 3) % 3 ? "#7c7c9c" : PAL.white); }
  // the sun or the moon, by the hour
  const t = ((cond.hour + cond.minute / 60) - 5) / 15;
  if (cond.light !== 3 && cond.weather !== "OVERCAST" && cond.weather !== "RAIN") {
    const sx = Math.round(20 + t * 216), sy = Math.round(70 - Math.sin(Math.max(0, Math.min(1, t)) * Math.PI) * 52);
    px(c, sx - 4, sy - 4, 9, 9, cond.light === 1 ? "#fcfcb0" : "#fc9838"); px(c, sx - 5, sy - 2, 11, 5, cond.light === 1 ? "#fcfcb0" : "#fc9838");
  } else if (cond.light === 3) { px(c, 196, 14, 7, 7, "#e4e4cc"); px(c, 199, 14, 4, 5, SKY[3][0]); }
  // clouds drift
  if (cond.weather !== "FOG") for (let i = 0; i < 4; i++) {
    const x = (((hash(i, 3) % 300) + f * (cond.weather === "WIND" ? 0.3 : 0.08)) % 300) - 30, y = 8 + (hash(i, 5) % 36);
    const col = cond.light === 3 ? "#1c1c3c" : cond.weather === "OVERCAST" || cond.weather === "RAIN" ? "#6c6c74" : PAL.white;
    px(c, x, y, 26, 4, col); px(c, x + 5, y - 3, 14, 3, col);
  }
  // the far side: the sea's horizon, the reservoir's trees, the river's hills, the marsh and the city
  const fy = SURF_Y - 1, w = spot.water;
  if (w === "lake") for (let x = 0; x < W; x += 6) { const h = 6 + (hash(x, 11) % 7); px(c, x, fy - h, 6, h, cond.light === 3 ? "#001800" : PAL.grass2); }
  if (w === "river") { for (let x = 0; x < W; x++) { const h = 16 + Math.round(Math.sin(x / 23) * 6 + Math.sin(x / 9) * 2); px(c, x, fy - h, 1, h, cond.light === 3 ? "#0c140c" : "#3c6c3c"); } for (let x = 0; x < W; x += 5) { const h = 4 + (hash(x, 13) % 5); px(c, x, fy - h, 5, h, cond.light === 3 ? "#001800" : PAL.grass2); } }
  if (w === "estuary") { for (let i = 0; i < 9; i++) { const x = 120 + i * 13, h = 8 + (hash(i, 17) % 18); px(c, x, fy - h, 9, h, cond.light === 3 ? "#1c1c2c" : "#7c7c8c"); if (cond.light >= 2) for (let k = 2; k < h - 2; k += 4) px(c, x + 2, fy - h + k, 1, 1, "#fce4a0"); } for (let x = 0; x < W; x += 2) px(c, x, fy - 3 - (hash(x, 19) % 3), 1, 4, "#8c9c4c"); }
  if (w === "ocean") { px(c, 228, fy - 26, 5, 26, PAL.white); px(c, 228, fy - 18, 5, 4, PAL.red); px(c, 227, fy - 29, 7, 3, PAL.black); if (cond.light >= 2 && (f >> 4) % 4 === 0) px(c, 222, fy - 29, 18, 2, "#fcfcb0"); }
}

function water(c, spot, cond, f) {
  const pal = WATER[spot.water];
  const night = cond.light === 3;
  for (let y = SURF_Y; y < FLOOR_Y; y++) px(c, 0, y, W, 1, night ? "#000c24" : pal[Math.min(2, Math.floor(((y - SURF_Y) / (FLOOR_Y - SURF_Y)) * 3))]);
  // the surface: a lighter line with a moving glint
  px(c, 0, SURF_Y, W, 1, night ? "#203c6c" : "#a4e4fc");
  for (let i = 0; i < 18; i++) { const x = (hash(i, 23) % W + f * (cond.weather === "WIND" ? 0.6 : 0.2)) % W; px(c, x, SURF_Y + 1 + (hash(i, 29) % 3), 4, 1, night ? "#103060" : "#68ccfc"); }
  if (cond.weather === "WIND") for (let i = 0; i < 6; i++) { const x = (hash(i, 31) % W + f * 0.8) % W; px(c, x, SURF_Y - 1, 5, 1, PAL.white); }
  // the bottom
  const bot = spot.water === "ocean" || spot.water === "estuary" ? [PAL.sand, PAL.sand2] : spot.water === "lake" ? [PAL.mud, "#3c3424"] : [PAL.rock, "#4c4c4c"];
  for (let sx = X0 - 8; sx < W; sx++) {
    const x = Math.max(0, ((sx - X0) / (X1 - X0)) * spot.cast * 1.1);
    const [, by] = toScreen(spot, x, bottomAt(spot, x));
    px(c, sx, by, 1, H - by, bot[0]);
    if (hash(sx, 37) % 5 === 0) px(c, sx, by + 1 + (hash(sx, 41) % 4), 1, 1, bot[1]);
    if (spot.water !== "ocean" && hash(sx, 43) % 23 === 0) px(c, sx, by - 6, 1, 6, night ? "#0c2c0c" : "#2c7c2c");   // weed
  }
}

function figure(c, x, y, shirt, pants, cast) {
  px(c, x - 2, y - 22, 5, 5, "#fca044");            // head
  px(c, x - 3, y - 24, 7, 2, "#5c3c1c");            // cap
  px(c, x - 3, y - 17, 7, 9, shirt);                // body
  px(c, x - 3, y - 8, 3, 8, pants); px(c, x + 1, y - 8, 3, 8, pants);
  px(c, x + 3, y - 15, cast ? 2 : 4, 2, "#fca044"); // arm to the rod
}
function shore(c, spot, cond, st) {
  const night = cond.light === 3;
  if (spot.id === "pier") {
    px(c, 0, 62, 52, 4, night ? "#3c2408" : PAL.wood); px(c, 0, 66, 52, 2, PAL.wood2);
    for (let x = 4; x < 52; x += 12) px(c, x, 68, 3, H - 68, night ? "#2c1c08" : PAL.wood2);
    px(c, 0, 52, 52, 1, PAL.wood2); for (let x = 2; x < 52; x += 10) px(c, x, 52, 1, 10, PAL.wood2);   // the rail
  } else if (spot.water === "ocean" || spot.water === "estuary") {
    for (let x = 0; x < 52; x++) { const y = 70 + Math.round(x * 0.3); px(c, x, y, 1, H - y, PAL.sand); }
  } else {
    for (let x = 0; x < 52; x++) { const y = 66 + Math.round(x * 0.35); px(c, x, y, 1, H - y, night ? "#002800" : PAL.grass); px(c, x, y + 3, 1, H - y - 3, PAL.mud); }
  }
  const footY = spot.id === "pier" ? 62 : spot.water === "ocean" || spot.water === "estuary" ? 78 : 76;
  // the background anglers: dawn and dusk only, at the rail or along the shore. They never speak.
  if (cond.light === 0 || cond.light === 2) {
    const shade = night ? "#202020" : "#3c3c44";
    for (const [x, dy] of [[10, -2], [24, -1]]) { figure(c, x, footY + dy, shade, shade, false); line(c, x + 4, footY + dy - 14, x + 16, footY + dy - 30, PAL.dgrey); }
  }
  const p = st.cfg.player || {};
  figure(c, 40, footY, p.color?.shirt || "#3cbcfc", p.color?.pants || "#7c7c7c", st.phase === "flight");
  // the rod: bends with a bite and with the fight's tension
  const bend = st.phase === "fight" ? Math.round((st.fight?.T || 0) * 10) : Math.round(st.tug / 3);
  const [tx, ty] = rodTip(st, bend);
  line(c, 44, footY - 14, tx, ty, "#2c2c2c");
}
function rodTip(st, bend) {
  if (st.phase === "power") { const m = st.meter?.m || 0; return [ROD_TIP[0] - 22 * m, ROD_TIP[1] - 4 + 6 * m]; }
  return [ROD_TIP[0] + Math.round(bend * 0.4), ROD_TIP[1] + bend];
}

function lineAndLure(c, st, spot, f) {
  const bend = st.phase === "fight" ? Math.round((st.fight?.T || 0) * 10) : Math.round(st.tug / 3);
  const [tx, ty] = rodTip(st, bend);
  const LC = "#e4e4e4";
  if (st.phase === "flight") {
    const k = Math.min(1, st.t / st.fl.ticks), [ex] = toScreen(spot, st.fl.x, 0);
    const x = tx + (ex - tx) * k, y = ty + (SURF_Y - ty) * k - Math.sin(k * Math.PI) * 30;
    line(c, tx, ty, x, y, LC); px(c, x - 1, y - 1, 3, 3, PAL.red);
    return;
  }
  if (st.phase === "fishing" && st.bob) {
    const b = st.bob, [sx, sy] = toScreen(spot, b.x, b.d), lure = LURE[b.lure];
    if (lure.bait) {
      // a bobber at the surface, the bait hanging under it
      const bob = st.tug > 0 ? 2 + (st.tug > 12 ? 3 : 0) : 0;
      line(c, tx, ty, sx, SURF_Y - 2, LC); line(c, sx, SURF_Y + 2, sx, sy, "#9cc4dc");
      px(c, sx - 2, SURF_Y - 3 + bob, 5, 3, PAL.red); px(c, sx - 2, SURF_Y + bob, 5, 2, PAL.white);
      if (b.bare) px(c, sx, sy, 1, 2, PAL.grey); else px(c, sx - 1, sy, b.lure === "worm" ? 4 : 5, 2, b.lure === "worm" ? "#d86c5c" : "#c4c4b4");
    } else {
      // a lure on the line: the line enters the water and runs down to it
      const ex = Math.max(sx - 6, X0);
      line(c, tx, ty, ex, SURF_Y, LC); line(c, ex, SURF_Y, sx, sy, "#9cc4dc");
      if (b.lure === "spoon") { px(c, sx - 2, sy - 1, 4, 3, PAL.grey); px(c, sx - 1, sy - 1, 1, 1, PAL.white); }
      else { px(c, sx - 3, sy - 3 + (b.pop > 10 ? -1 : 0), 6, 3, "#f8d830"); px(c, sx + 2, sy - 3, 1, 3, PAL.red); if (b.pop > 0) for (let i = 0; i < 3; i++) px(c, sx - 4 + i * 4, SURF_Y - 2 - (b.pop % 4), 1, 1, PAL.white); }
    }
    return;
  }
  if (st.phase === "fight" && st.fight) {
    const fi = st.fish.find(x => x.id === st.fight.fid);
    if (!fi) return;
    const [sx, sy0] = toScreen(spot, fi.x, fi.d), sy = st.fight.jump > 26 ? SURF_Y - 12 : sy0;
    if (st.fight.T < 0.2) {   // slack: the line sags
      const mx = (tx + sx) / 2, my = Math.max(ty, sy) + 18;
      line(c, tx, ty, mx, my, LC); line(c, mx, my, sx, sy, LC);
    } else line(c, tx, ty, sx, sy, st.fight.T >= 1 && f % 6 < 3 ? PAL.red : LC);
  }
}

function rain(c, frame) {
  for (let i = 0; i < 60; i++) { const h = hash(i, 47), x = (h % W + frame * 2) % W, y = ((h >>> 8) % H + frame * 5) % (SURF_Y + 4); px(c, x, y, 1, 3, "#a4c4e4"); }
}
function fog(c, frame, still) {
  c.save(); c.globalAlpha = 0.35;
  for (let i = 0; i < 5; i++) px(c, ((still ? 0 : frame * 0.1) + i * 61) % (W + 60) - 60, 40 + i * 9, 90, 6, PAL.grey);
  c.restore();
}

function gauge(c, x, y, w, v, zones) {
  px(c, x - 1, y - 1, w + 2, 8, PAL.black);
  for (const [a, b, col] of zones) px(c, x + Math.round(a * w), y, Math.max(1, Math.round((b - a) * w)), 6, col);
  const m = x + Math.round(Math.max(0, Math.min(1, v)) * (w - 1));
  px(c, m - 1, y - 2, 3, 10, PAL.white);
}
function hud(c, st, spot, cond) {
  px(c, 0, PANEL_Y, W, H - PANEL_Y, PAL.black);
  px(c, 0, PANEL_Y, W, 1, PAL.dgrey);
  const hh = String(cond.hour).padStart(2, "0"), mm = String(cond.minute).padStart(2, "0");
  text(c, `${spot.name}`, 4, PANEL_Y + 3, PAL.gold, false);
  const right = `DAY ${cond.day} ${hh}:${mm}`;
  text(c, right, W - 4 - textWidth(right), PANEL_Y + 3, PAL.white, false);
  const sub = `${SEASONS[cond.season]} ${LIGHTS[cond.light]} ${cond.weather}`;
  text(c, sub, W - 4 - textWidth(sub), PANEL_Y + 12, PAL.grey, false);
  const lure = st.bob ? LURE[st.bob.lure] : LURES[st.lure];
  text(c, `${st.phase === "ready" ? "< " : ""}${lure.short}${st.phase === "ready" ? " >" : ""}${st.bob?.bare ? " (BARE)" : ""}`, 4, PANEL_Y + 12, st.phase === "ready" ? PAL.lime : PAL.white, false);
  const y3 = PANEL_Y + 22;
  if (st.phase === "power") {
    text(c, "POWER", 4, y3, PAL.white, false);
    gauge(c, 40, y3, 120, st.meter.m, [[0, 0.7, "#3cbcfc"], [0.7, 1, PAL.lime]]);
    const yd = Math.round(Math.max(4, st.meter.m * spot.cast));
    text(c, `${yd} YD`, 168, y3, PAL.white, false);
  } else if (st.phase === "fight" && st.fight) {
    const F = st.fight;
    text(c, "LINE", 4, y3, PAL.white, false);
    gauge(c, 34, y3, 120, F.T / 1.15, [[0, 0.105, PAL.gold], [0.105, 0.87, "#3cbcfc"], [0.87, 1, PAL.red]]);
    text(c, `${Math.max(0, Math.round(F.D))} YD`, 162, y3, PAL.white, false);
    px(c, 200, y3, 50, 6, PAL.dgrey); px(c, 200, y3, Math.round(50 * F.stam), 6, F.stam > 0.45 ? PAL.gold : PAL.lime);
  } else {
    const best = st.catches.length ? `${st.catches.length} LANDED` : "NOTHING YET";
    text(c, best, 4, y3, PAL.dgrey, false);
  }
  const lines = wrap(st.msg || hint(st), 41).slice(0, 2);
  lines.forEach((l, i) => text(c, l, 4, PANEL_Y + 33 + i * 9, TONE[st.tone] || PAL.white, false));
}
function hint(st) {
  switch (st.phase) {
    case "ready": return "LEFT/RIGHT: LURE. A: CAST.";
    case "power": return "A: CAST NOW.";
    case "fishing": return "HOLD A: REEL. B: TWITCH, OR SET THE HOOK.";
    case "fight": return "HOLD A: REEL. LET GO WHEN IT RUNS.";
    default: return "";
  }
}

function catchCard(c, st, frame, still) {
  const k = st.catches[st.catches.length - 1];
  if (!k) return;
  const s = SPECIES_BY[k.sp];
  const x = 28, y = 20, w = 200, h = 140;
  px(c, x - 2, y - 2, w + 4, h + 4, s.legend ? PAL.gold : PAL.white);
  px(c, x, y, w, h, "#00002c");
  centered(c, s.legend ? "A LEGEND. ON FILE." : "LANDED", y + 6, s.legend ? PAL.gold : PAL.lime);
  drawFish(c, k.sp, W / 2, y + 48, Math.min(150, lenFor(k.sp, k.cw, s.legend ? 160 : 120)), 1, still ? 0 : frame * 0.3);
  centered(c, s.name, y + 78, PAL.white);
  centered(c, `${lbText(k.cw)}  //  ${inText(k.tl)}`, y + 90, PAL.gold);
  centered(c, `ON A ${LURE[k.lure].short}. ${(k.cw / 100).toFixed(2)} LB.`, y + 102, PAL.grey);
  if (st.t > 30) centered(c, s.protected ? "A: RELEASE (PROTECTED)   B: RELEASE" : "A: KEEP     B: RELEASE", y + 120, (frame >> 4) % 2 || still ? PAL.white : PAL.grey);
}
