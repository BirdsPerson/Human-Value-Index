// THE HUNT, drawn: a 320x180 frame, every rectangle on the game-pixel grid (fillRect at whole pixels),
// so the canvas never antialiases anything and the picture stays crisp at any integer scale.
// Back to front: the sky in bands by the city's light, the mountain, the tree line, the ground of the
// scene (the meadow, the forest belt, THE ATTRITION, the ridge, the marsh, the tundra, the range), the
// animals far to near, the foreground cover, the shots, the HUD, the reticle. Pure drawing: reads the
// sim's state, never writes it.
import { drawText, textWidth } from "../golf/font.js";
import { SPECIES_BY, SCENES, TRIP, RULES } from "./data.js";
import { W, H, sceneOf, scaleOf, groundY, stageLen } from "./sim.js";
export { W, H };

function R(c, col, x, y, w, h) { const X = Math.round(x), Y = Math.round(y), w2 = Math.round(x + w) - X, h2 = Math.round(y + h) - Y; if (w2 <= 0 || h2 <= 0) return; c.fillStyle = col; c.fillRect(X, Y, w2, h2); }
function hk(n) { let h = (n | 0) ^ 0x9e3779b9; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const T = (c, s, x, y, col, k = 1, sh = "#000") => { if (sh) drawText(c, s, x + k, y + k, sh, k); drawText(c, s, x, y, col, k); };
const TC = (c, s, y, col, k = 1, sh = "#000") => T(c, s, Math.round((W - textWidth(s, k)) / 2), y, col, k, sh);

const SKY = {
  0: ["#2a2350", "#4a3266", "#7a4270", "#b85a66", "#e88a5e", "#f6b870"],
  1: ["#2c5cb8", "#3a70c8", "#4a86d6", "#62a0e2", "#86baea", "#b2d4ee"],
  2: ["#1c183c", "#3a2454", "#6a2e5a", "#a8445a", "#dc6a4a", "#f2a052"],
  3: ["#04070f", "#070c1c", "#0b1430", "#101c40", "#16244e", "#1e2e5a"],
};
const TINT = { 0: "rgba(255,150,100,0.10)", 1: null, 2: "rgba(120,40,80,0.18)", 3: "rgba(8,16,56,0.3)" };

// ---- the scenery ----------------------------------------------------------------------------------------
function sky(c, light, horizon) {
  const b = SKY[light] || SKY[1], n = b.length, bh = horizon / n;
  for (let i = 0; i < n; i++) R(c, b[i], 0, Math.floor(i * bh), W, Math.ceil(bh) + 1);
  // the band edges dithered: a row of every-other pixels of the next band
  for (let i = 1; i < n; i++) { c.fillStyle = b[i]; const y = Math.floor(i * bh) - 1; for (let x = (i & 1); x < W; x += 2) c.fillRect(x, y, 1, 1); }
  if (light === 3) for (let k = 0; k < 40; k++) R(c, k % 7 ? "#c8d0f0" : "#fff8c0", Math.floor(hk(k * 13) * W), Math.floor(hk(k * 29) * horizon * 0.8), 1, 1);
  if (light === 3) { R(c, "#e8e4c8", 262, 18, 10, 10); R(c, "#e8e4c8", 260, 20, 14, 6); R(c, "#c8c4a8", 266, 21, 3, 3); }
  else if (light === 1) { R(c, "#fff4c0", 40, 16, 12, 12); R(c, "#fff4c0", 38, 18, 16, 8); }
  else { const y = horizon - 30; R(c, light === 0 ? "#ffd890" : "#ffb070", 230, y, 18, 8); R(c, light === 0 ? "#ffd890" : "#ffb070", 232, y - 2, 14, 2); }
}
// THE MOUNTAIN behind everything (the city's own, snow on top), in 2-px columns; par: its parallax
function mountain(c, horizon, cam, par, tall, light) {
  const rock = light === 3 ? "#1a2034" : "#5a6478", rock2 = light === 3 ? "#141a2c" : "#4a5266", snow = light === 3 ? "#8a94b8" : "#eef2f8";
  const off = cam * par;
  for (let x = 0; x < W; x += 2) {
    const wx = x + off;
    // one big peak and its shoulders, from a sum of triangles (no trig)
    const tri = (cx, hw, ht) => Math.max(0, ht * (1 - Math.abs(wx - cx) / hw));
    const h = Math.max(tri(210, 170, tall), tri(60, 110, tall * 0.62), tri(380, 140, tall * 0.7), tri(520, 120, tall * 0.55)) + hk(Math.floor(wx / 2)) * 3;
    if (h <= 0) continue;
    const top = horizon - h;
    R(c, (Math.floor(wx / 6) & 1) ? rock : rock2, x, top, 2, h + 1);
    const sn = Math.max(0, h - tall * 0.62);
    if (sn > 0) R(c, snow, x, top, 2, Math.min(h, sn + (hk(Math.floor(wx / 4) + 7) * 4 | 0)));
  }
}
function pine(c, x, base, h, cols) {
  R(c, cols[3], x - 1, base - 3, 2, 3);
  for (let r = 0; r < h - 3; r++) {
    const k = r / (h - 3), w = Math.max(1, Math.round((1 - k) * h * 0.38) + ((r % 4) === 0 ? 1 : 0));
    R(c, r % 4 < 2 ? cols[0] : cols[1], x - w, base - 3 - r, w * 2, 1);
    if (w > 2) R(c, cols[2], x - w, base - 3 - r, 1, 1);
  }
}
const PINES = [["#1f4d2e", "#255a34", "#173a24", "#4a3222"], ["#183c26", "#1e4a2e", "#12301c", "#3a2618"]];
function treeLine(c, horizon, cam, par, dense, light) {
  const cols = light === 3 ? [["#0e2018", "#12281c", "#0a1810", "#1a120c"], ["#0c1c14", "#10221a", "#08140c", "#160f0a"]] : PINES;
  const off = cam * par, step = dense ? 7 : 11;
  for (let k = Math.floor(off / step) - 2; k < Math.floor((off + W) / step) + 3; k++) {
    const r = hk(k * 31 + 5);
    if (!dense && r < 0.25) continue;
    const x = k * step - off + Math.floor(r * 5), h = 14 + Math.floor(hk(k * 17) * (dense ? 22 : 14));
    pine(c, x, horizon + 2 + (k & 1), h, cols[k & 1]);
  }
  R(c, cols[0][2], 0, horizon, W, 3);
}
const GROUND = {
  meadow: ["#4a7a2a", "#548632", "#5e9238", "#6a9e40"], forest: ["#2a3e1c", "#30461e", "#364e22", "#3c5626"],
  river: ["#466e2a", "#507a30", "#5a8636", "#64923c"], ridge: ["#6a5a44", "#74644c", "#7e6e54", "#88785c"],
  marsh: ["#4a5e2a", "#526a2e", "#5a7432", "#627e36"], tundra: ["#8a8a70", "#949478", "#9e9e80", "#a8a88a"],
  range: ["#4e8a2e", "#5a9636", "#4e8a2e", "#5a9636"], ducks: ["#466e2a", "#507a30", "#5a8636", "#64923c"], forms: ["#4e8a2e", "#5a9636", "#4e8a2e", "#5a9636"],
};
function ground(c, id, scene, cam) {
  const g = GROUND[id] || GROUND.meadow, hz = scene.horizon;
  // bands, wider toward the viewer: the perspective of the field
  let y = hz;
  for (let i = 0; y < H; i++) { const bh = 3 + i * 2; R(c, g[i % g.length], 0, y, W, bh); y += bh; }
  // tufts and flowers that pass with the rail (the nearer, the faster)
  for (let k = 0; k < 90; k++) {
    const d = hk(k * 7 + 1), yy = hz + 4 + d * (H - hz - 6), par = 0.4 + d;
    const x = Math.floor((((hk(k * 11) * 640 - cam * par) % W) + W) % W);
    if (id === "tundra" || id === "ridge") { R(c, k % 3 ? "#5a4e3c" : "#e8ecf0", x, yy, 2 + d * 3, 1 + d); continue; }
    R(c, "#2e5a1a", x, yy - 1 - d * 2, 1, 1 + d * 2); R(c, "#3a6a20", x + 1, yy - 2 - d * 2, 1, 2 + d * 2);
    if (id === "meadow" && k % 5 === 0) R(c, k % 2 ? "#f4e86a" : "#f0f0f0", x + 2, yy - 2, 1, 1);
  }
}
function water(c, y0, y1, cam, light, t) {
  const cols = light === 3 ? ["#0e1c34", "#12243e", "#16284a"] : ["#2a5a8a", "#3a6e9e", "#4a82b0"];
  for (let y = y0, i = 0; y < y1; y += 2, i++) R(c, cols[i % 3], 0, y, W, 2);
  for (let k = 0; k < 26; k++) {
    const yy = y0 + 1 + Math.floor(hk(k * 3) * (y1 - y0 - 2)), x = Math.floor((((hk(k * 5) * 640 - cam * 0.8 + t * 0.25) % W) + W) % W);
    R(c, light === 3 ? "#3a4e78" : "#cfe6f6", x, yy, 4 + (k % 3) * 2, 1);
  }
}
function reeds(c, x, base, h, light) {
  for (let i = 0; i < 6; i++) { const xx = x + i * 2 - 5, hh = h - (i % 3) * 3; R(c, light === 3 ? "#1e2a14" : "#5a6a2a", xx, base - hh, 1, hh); if (i % 2) R(c, light === 3 ? "#2a1e10" : "#6a4a22", xx, base - hh - 3, 1, 3); }
}
function backdrop(c, st, t) {
  const scene = sceneOf(st), id = TRIP[st.cfg.trip].scenes[st.si], hz = scene.horizon, L = st.light, cam = st.cam;
  sky(c, L, hz);
  const tall = id === "ridge" || id === "tundra" ? 70 : id === "forest" ? 40 : 52;
  mountain(c, hz, cam, 0.15, tall, L);
  if (id === "tundra") { R(c, L === 3 ? "#2a3048" : "#dfe6ee", 0, hz - 3, W, 3); }
  else treeLine(c, hz, cam, 0.45, id === "forest", L);
  ground(c, id, scene, cam);
  if (id === "river" || id === "ducks") water(c, hz + (id === "ducks" ? 6 : 10), hz + (id === "ducks" ? 34 : 26), cam, L, t);
  if (id === "marsh") { for (let k = 0; k < 5; k++) { const x = Math.floor((((k * 90 + 30 - cam * 0.8) % (W + 60)) + W + 60) % (W + 60)) - 30; const y = hz + 12 + (k % 3) * 18; R(c, L === 3 ? "#0e1c34" : "#3a6e9e", x, y, 46, 6); R(c, L === 3 ? "#16284a" : "#62a0c8", x + 4, y + 2, 20, 1); } }
  if (id === "range" || id === "forms") {
    R(c, "#5a4a32", 0, hz - 10, W, 10); R(c, "#6a5a3e", 0, hz - 10, W, 2);   // the backstop berm
    R(c, "#f4f0e0", 128, hz - 30, 64, 14); R(c, "#1a1a1a", 128, hz - 17, 64, 1); R(c, "#3a3a3a", 158, hz - 16, 2, 8);
    drawText(c, "DEPT RANGE", 131, hz - 27, "#b91c1c", 1);
    if (id === "forms") { R(c, "#4a4a52", 150, H - 18, 20, 18); R(c, "#2a2a30", 154, H - 22, 12, 6); drawText(c, "FORMS", 146, H - 30, "#fbbf24", 1); }
  }
  if (id === "ducks") for (let k = 0; k < 12; k++) reeds(c, Math.floor((((k * 37 - cam) % (W + 20)) + W + 20) % (W + 20)) - 10, H, 18 + (k % 4) * 5, L);
}
// The foreground cover, in front of every animal: trunks, brush, rocks, reeds (shots stop in them).
function cover(c, st) {
  const scene = sceneOf(st), id = TRIP[st.cfg.trip].scenes[st.si], L = st.light;
  for (const [x, w, y0] of scene.cover) {
    const sx = Math.round(x - st.cam);
    if (sx > W || sx + w < 0) continue;
    if (y0 === 0) {   // a trunk, full height, its canopy off the top
      R(c, L === 3 ? "#1a120c" : "#3a2616", sx, 0, w, H); R(c, L === 3 ? "#24180e" : "#4e3420", sx + 2, 0, Math.max(1, w - 5), H);
      for (let k = 0; k < 14; k++) R(c, L === 3 ? "#120c08" : "#2a1a0e", sx + 1 + (k * 3) % Math.max(2, w - 2), (k * 23) % H, 1, 4 + (k % 3) * 2);
      R(c, L === 3 ? "#0a160e" : "#173a24", sx - 10, 0, w + 20, 10); R(c, L === 3 ? "#0e1c12" : "#1f4d2e", sx - 6, 8, w + 12, 4);
    } else if (id === "ridge" || id === "tundra") {   // a boulder
      R(c, L === 3 ? "#2a2e3a" : "#7a7a80", sx, y0 + 4, w, H - y0); R(c, L === 3 ? "#2a2e3a" : "#7a7a80", sx + 3, y0, w - 6, 4);
      R(c, L === 3 ? "#3a3e4a" : "#9a9aa0", sx + 3, y0 + 1, w * 0.4, 3); R(c, L === 3 ? "#1a1e28" : "#5a5a62", sx, H - 6, w, 6);
    } else if (id === "marsh" || id === "river") {
      for (let k = 0; k < Math.ceil(w / 4); k++) reeds(c, sx + 3 + k * 4, H, H - y0 + (k % 2) * 4, L);
    } else if (id === "range" || id === "forms") {   // a sandbag wall
      for (let r = 0; r < H - y0; r += 5) for (let k = ((r / 5) & 1) * -4; k < w; k += 8) { R(c, L === 3 ? "#3a3426" : "#a8946a", sx + k, y0 + r, 7, 4); R(c, L === 3 ? "#2a2418" : "#7a6a48", sx + k, y0 + r + 3, 7, 1); }
    } else {   // brush: a round clump, leaves catching the light
      const g = L === 3 ? ["#0c1a10", "#10221a", "#16301e"] : ["#24501a", "#2e6022", "#4a8a32"];
      const hh = H - y0;
      for (let r = 0; r < hh; r++) { const k = r / hh, ww = w * (r < 8 ? 0.55 + r * 0.055 : 1) + (hk(r + x) * 4 | 0); R(c, g[(r >> 2) & 1], sx + (w - ww) / 2, y0 + r, ww, 1); void k; }
      for (let k = 0; k < w / 2; k++) R(c, g[2], sx + 2 + Math.floor(hk(k * 7 + x) * (w - 4)), y0 + 2 + Math.floor(hk(k * 13 + x) * (hh - 4) * 0.6), 2, 1);
    }
  }
}

// ---- the animals --------------------------------------------------------------------------------------
// Drawn in their own frame (facing right, the feet at 0, units of the body's width and height), the
// same frame sim.regionAt hits: the body -0.50..0.34, the vitals behind the shoulder, the head forward.
function animal(c, a, scene, cam, t) {
  const s = scaleOf(a.d), fy = groundY(scene, a.d), ax = a.x - cam;
  if (a.kind === "critter") return critter(c, a, ax, fy, s, t);
  const sp = SPECIES_BY[a.sp], bw = sp.w * s, bh = sp.h * s, dir = a.dir;
  const [coat, light, dark] = a.kind === "decoy" ? ["#c8a878", "#e0c898", "#8a6a42"] : sp.coat;
  const box = (x0, x1, y0, y1, col) => { const X0 = ax + dir * x0 * bw, X1 = ax + dir * x1 * bw; R(c, col, Math.min(X0, X1), fy + y0 * bh, Math.abs(X1 - X0), (y1 - y0) * bh); };
  // the shadow
  R(c, "rgba(0,0,0,0.25)", ax - bw * 0.5, fy - Math.max(1, s), bw, Math.max(1, s * 1.5));
  if (a.state === "down") {   // on its side in the grass
    const k = Math.min(1, a.t / 12);
    box(-0.5, 0.4, -0.4 + 0.1 * k, -0.04, coat); box(-0.46, 0.36, -0.14, -0.04, light);
    box(0.36, 0.62, -0.34 + 0.1 * k, -0.06, coat); box(0.58, 0.66, -0.26, -0.12, dark);
    box(0.2, 0.7, -0.08, -0.02, dark); box(-0.6, -0.2, -0.08, -0.02, dark);
    if (a.male) antlers(c, a, sp, ax + dir * 0.4 * bw, fy - 0.36 * bh, bw, bh, dir, true);
    return;
  }
  if (a.kind === "decoy") {   // cardboard, on a stake: rises from the grass, drops when its time is up
    const k = a.state === "drop" ? Math.max(0, 1 - a.t / 10) : Math.min(1, a.t / 8);
    c.save(); c.beginPath(); c.rect(0, 0, W, Math.round(fy)); c.clip();
    const dy = (1 - k) * bh * 1.3;
    R(c, "#6a5a3e", ax - 1, fy - bh * 0.5 + dy, 2, bh * 0.5);
    const b2 = (x0, x1, y0, y1, col) => { const X0 = ax + dir * x0 * bw, X1 = ax + dir * x1 * bw; R(c, col, Math.min(X0, X1), fy + y0 * bh + dy, Math.abs(X1 - X0), (y1 - y0) * bh); };
    b2(-0.5, 0.34, -0.86, -0.44, coat); b2(0.2, 0.38, -1.0, -0.6, coat); b2(0.3, 0.56, -1.12, -0.88, coat);
    for (const [lx] of [[-0.42], [-0.3], [0.16], [0.26]]) b2(lx, lx + 0.06, -0.48, -0.05, coat);
    b2(0.08, 0.24, -0.78, -0.52, "#f4f0e0"); b2(0.12, 0.2, -0.72, -0.58, "#b91c1c");   // the painted ring
    if (s > 0.9) drawText(c, "DEPT", Math.round(ax - bw * 0.3), Math.round(fy - bh * 0.62 + dy), "#5a3a1a", 1);
    antlers(c, a, sp, ax + dir * 0.42 * bw, fy - 1.1 * bh + dy, bw, bh, dir, false, "#a88858");
    c.restore();
    return;
  }
  const run = a.state === "run", walk = a.state === "walk", ph = Math.floor((t + a.id * 7) / (run ? 4 : 8)) % 4;
  // legs: far pair darker, then near pair; the gait swings them
  const sw = run ? [0.1, -0.06, -0.1, 0.06][ph] : walk ? [0.04, 0, -0.04, 0][ph] : 0;
  const leg = (lx, off, col) => { box(lx + off, lx + off + 0.06, -0.5, -0.06, col); box(lx + off, lx + off + 0.07, -0.08, 0, "#1a120c"); };
  leg(-0.36, -sw, dark); leg(0.22, sw, dark);
  // the tail: a whitetail's flag goes up when it runs
  if (a.sp === "whitetail" && run) { box(-0.6, -0.48, -1.0, -0.8, "#f4f4f0"); box(-0.56, -0.5, -0.82, -0.76, coat); }
  else box(-0.56, -0.48, -0.84, -0.7, a.sp === "whitetail" ? "#f4f4f0" : dark);
  // the body: back, flank, the lighter belly, the rump patch on elk and caribou
  box(-0.5, 0.34, -0.82, -0.46, coat); box(-0.46, 0.3, -0.86, -0.82, coat); box(-0.44, 0.28, -0.52, -0.44, light);
  if (a.sp === "elk" || a.sp === "caribou") box(-0.5, -0.36, -0.82, -0.56, light);
  if (a.sp === "moose") box(0.0, 0.3, -0.92, -0.82, coat);   // the hump
  box(-0.46, 0.3, -0.84, -0.8, dark);   // the line of the back
  leg(-0.44, sw, coat); leg(0.14, -sw, coat);
  // the neck and the head (up and alert when it stops; low when it runs)
  const lift = a.state === "stop" ? -0.08 : run ? 0.12 : 0;
  box(0.18, 0.38, -1.0 - lift, -0.6, coat); box(0.2, 0.32, -0.7, -0.6, light);
  if (a.sp === "caribou") box(0.2, 0.38, -0.84 - lift, -0.6, "#f0ece0");   // the pale mane
  if (a.sp === "moose") box(0.3, 0.38, -0.7, -0.54, dark);                  // the bell
  box(0.32, 0.54, -1.12 - lift, -0.9 - lift, coat); box(0.48, 0.6, -1.04 - lift, -0.9 - lift, a.sp === "moose" ? coat : dark);
  box(0.56, 0.6, -1.04 - lift, -0.98 - lift, "#0a0a0a");                    // the nose
  box(0.42, 0.46, -1.08 - lift, -1.04 - lift, "#0a0a0a");                   // the eye
  box(0.32, 0.38, -1.24 - lift, -1.1 - lift, dark);                         // the ear
  if (a.male) { if (a.sp !== "moose") antlers(c, a, sp, ax + dir * 0.36 * bw, fy + (-1.1 - lift) * bh, bw, bh, dir, false, "#a89878"); antlers(c, a, sp, ax + dir * 0.42 * bw, fy + (-1.12 - lift) * bh, bw, bh, dir, false); }
}
// The antlers by species and points: tines up off a main beam (whitetail, elk), a palm (moose), a
// tall C with a brow shovel (caribou). x, y: the base on the head.
function antlers(c, a, sp, x, y, bw, bh, dir, down, col0) {
  const col = col0 || "#e8dcc0", col2 = col0 ? "#8a6a42" : "#b8a888", p = Math.max(1, Math.round(bw / 30));
  const n = Math.max(2, Math.ceil(a.pts / 2)), spread = sp.id === "elk" ? 0.7 : sp.id === "caribou" ? 0.55 : 0.5;
  if (down) { R(c, col, x - p, y - p, p * 3, p); return; }
  if (sp.id === "moose") {
    // two palms off short beams, spread either side of the head, points along their top edge
    const pw = bw * 0.26, ph = bh * 0.2;
    R(c, col2, x - pw * 0.15, y - ph * 0.45, pw * 0.3, ph * 0.45);
    for (const sd of [-1, 1]) {
      const x0 = sd < 0 ? x - pw * 1.15 : x + pw * 0.15;
      R(c, col, x0, y - ph * 1.1, pw, ph * 0.7); R(c, col, x0 + (sd < 0 ? pw * 0.5 : 0), y - ph * 0.5, pw * 0.5, ph * 0.2);
      for (let k = 0; k < Math.ceil(n / 2); k++) R(c, col, x0 + (k * pw) / Math.ceil(n / 2), y - ph * 1.1 - p * 2, p, p * 2);
    }
    return;
  }
  const len = bw * spread, rise = bh * (sp.id === "caribou" ? 0.9 : 0.55);
  // the main beam: up and back, then forward at the tip, in short steps
  const steps = 8;
  let px = x, py = y;
  for (let i = 1; i <= steps; i++) {
    const k = i / steps, bx = x - dir * len * (k < 0.7 ? k : 1.4 - k) * 0.9, by = y - rise * k;
    R(c, col, Math.min(px, bx), Math.min(py, by), Math.max(p, Math.abs(bx - px)) + p, Math.max(p, Math.abs(by - py)));
    px = bx; py = by;
    // a tine up off the beam at regular points
    if (i % Math.max(1, Math.floor(steps / n)) === 0 && i < steps) R(c, col, bx, by - bh * 0.18, p, bh * 0.18);
  }
  if (sp.id === "caribou") R(c, col, Math.min(x, x + dir * bw * 0.14), y - bh * 0.22, bw * 0.14, p * 2);   // the shovel
  R(c, col2, x - p, y - p, p * 2, p);
}
function critter(c, a, ax, fy, s, t) {
  const d = a.dir, hop = a.sp === "rabbit" && a.state !== "down" ? Math.abs(((Math.floor(t / 3) + a.id) % 8) - 4) * 0.5 * s : 0;
  const box = (x0, x1, y0, y1, col) => { const X0 = ax + d * x0 * s, X1 = ax + d * x1 * s; R(c, col, Math.min(X0, X1), fy + y0 * s - hop, Math.abs(X1 - X0), (y1 - y0) * s); };
  if (a.state === "down") { box(-5, 5, -3, 0, a.sp === "rabbit" ? "#8a7a68" : "#4a3a2a"); return; }
  if (a.sp === "rabbit") { box(-4, 3, -6, -1, "#8a7a68"); box(2, 5, -8, -4, "#8a7a68"); box(3, 4, -12, -7, "#8a7a68"); box(-5, -3, -5, -3, "#f0f0f0"); box(-3, 4, -1, 0, "#6a5a48"); box(4, 5, -7, -6, "#000"); }
  else { box(-6, 3, -10, -3, "#4a3a2a"); box(-8, -4, -12, -5, "#6a4a2a"); box(2, 5, -14, -9, "#3a4a6a"); box(4, 6, -13, -11, "#c83a2a"); box(-2, -1, -3, 0, "#c8a040"); box(1, 2, -3, 0, "#c8a040"); }
}
function bird(c, a, cam, t) {
  const x = a.x - cam, y = a.y, s = a.s, fl = Math.floor((t + a.id * 5) / 6) % 2, d = a.vx >= 0 ? 1 : -1;
  const body = a.gold ? "#f4c430" : "#5a4a3a", head = a.gold ? "#fff0a0" : "#1e6a3a";
  if (a.state === "down") { R(c, body, x - 4 * s, y - 2 * s, 8 * s, 4 * s); R(c, head, x + d * 3 * s, y - 3 * s, 2 * s, 2 * s); return; }
  R(c, body, x - 5 * s, y - 2 * s, 10 * s, 4 * s);
  R(c, head, d > 0 ? x + 4 * s : x - 7 * s, y - 4 * s, 3 * s, 3 * s);
  R(c, "#e8a020", d > 0 ? x + 7 * s : x - 9 * s, y - 3 * s, 2 * s, 1 * s);
  R(c, a.gold ? "#fff8d0" : "#8a7a68", x - 3 * s, fl ? y - 7 * s : y + 1 * s, 6 * s, (fl ? 5 : 3) * s);
}
function form(c, a, cam, t) {
  const x = a.x - cam, y = a.y, s = a.s;
  if (a.state === "down") { for (let k = 0; k < 4; k++) R(c, "#f4f0e0", x - 6 * s + k * 4 * s, y + (a.t + k * 3) * 0.6, 3 * s, 2 * s); return; }
  const tilt = (Math.floor(t / 5) + a.id) % 2;
  R(c, "#f4f0e0", x - 5 * s, y - 7 * s + tilt, 10 * s, 14 * s);
  for (let k = 0; k < 5; k++) R(c, "#8a8a9a", x - 3 * s, y - 5 * s + k * 2.4 * s + tilt, 6 * s, Math.max(1, 0.6 * s));
  if (a.gold) { R(c, "#f4c430", x + 1 * s, y + 3 * s + tilt, 4 * s, 4 * s); R(c, "#b8860b", x + 2 * s, y + 4 * s + tilt, 2 * s, 2 * s); }
  else R(c, "#b91c1c", x + 2 * s, y + 4 * s + tilt, 3 * s, 2 * s);
}

// ---- the HUD -------------------------------------------------------------------------------------------
function shell(c, x, y, full) { R(c, full ? "#c8281e" : "#3a2a2a", x, y, 4, 8); R(c, full ? "#e8b84a" : "#4a4a4a", x, y + 8, 4, 3); if (full) R(c, "#f06a5a", x + 1, y + 1, 1, 5); }
function hud(c, st, t) {
  const scene = sceneOf(st), trip = TRIP[st.cfg.trip];
  R(c, "rgba(0,0,0,0.45)", 0, 0, W, 11);
  T(c, `SCORE ${String(st.score).padStart(6, "0")}`, 3, 2, "#f8f8f8");
  const label = `${trip.name} ${st.si + 1}/${trip.scenes.length}`;
  T(c, label, W - textWidth(label) - 3, 2, "#fbbf24");
  if (st.phase === "play") { const len = stageLen(scene), k = 1 - st.pt / len; R(c, "#3a3a3a", 110, 4, 100, 3); R(c, k < 0.2 ? "#ef4444" : "#4ade80", 110, 4, Math.round(100 * k), 3); }
  // the tags: three, a strike crosses one out
  for (let i = 0; i < RULES.STRIKES; i++) {
    const x = 4 + i * 11, y = H - 13;
    R(c, "#f4e8b0", x, y, 8, 10); R(c, "#c8a040", x + 3, y + 1, 2, 2);
    if (i < st.strikes) { for (let k = 0; k < 8; k++) { R(c, "#dc2626", x + k, y + 1 + k, 1, 1); R(c, "#dc2626", x + 7 - k, y + 1 + k, 1, 1); } }
  }
  for (let i = 0; i < RULES.SHELLS; i++) shell(c, W - 8 - i * 6, H - 14, i < st.ammo && st.reload === 0);
  if (st.reload > 0) T(c, "RELOADING", W - 90, H - 12, "#fbbf24");
  else if (st.ammo === 0 && st.phase === "play" && Math.floor(t / 15) % 2) TC(c, "RELOAD!", H - 34, "#ef4444", 2);
  // the Department's line of the moment
  if (st.msg && st.tick - st.msgAt < 150 && st.phase === "play") {
    const w = Math.min(W - 8, textWidth(st.msg) + 8);
    R(c, "rgba(0,0,0,0.6)", (W - w) / 2, 14, w, 11);
    TC(c, st.msg.length > 50 ? st.msg.slice(0, 50) : st.msg, 16, "#fde68a", 1, null);
  }
}
function fx(c, st, t) {
  for (const f of st.fx) {
    const age = st.tick - f.t;
    if (f.k === "flash" && age < 5) { R(c, "#fff8c0", f.x - 3, f.y, 7, 1); R(c, "#fff8c0", f.x, f.y - 3, 1, 7); R(c, "#ffd060", f.x - 1, f.y - 1, 3, 3); }
    if (f.k === "chip" && age < 14) for (let k = 0; k < 4; k++) R(c, "#8a6a42", f.x + (k - 2) * 2, f.y - age * 0.5 + k, 1, 1);
    if (f.k === "pts" && age < 50) { const s = f.v > 0 ? `+${f.v}` : String(f.v); T(c, s, Math.round(f.x - textWidth(s) / 2), Math.round(f.y - 12 - age * 0.4), f.v > 0 ? "#fde047" : "#f87171"); }
  }
  void t;
}
export function reticle(c, x, y, kick = 0, col = "#f8f8f8") {
  if (x < 0 || y < 0) return;
  const r = 6 + kick;
  const ring = (cc, o) => { for (let k = -r; k <= r; k++) { const q = Math.round(Math.sqrt(Math.max(0, r * r - k * k))); R(c, cc, x + k + o, y - q + o, 1, 1); R(c, cc, x + k + o, y + q + o, 1, 1); R(c, cc, x - q + o, y + k + o, 1, 1); R(c, cc, x + q + o, y + k + o, 1, 1); } };
  ring("#000", 1); ring(col, 0);
  R(c, "#000", x - r - 3, y + 1, 5, 1); R(c, "#000", x + r - 1, y + 1, 5, 1); R(c, "#000", x + 1, y - r - 3, 1, 5); R(c, "#000", x + 1, y + r - 1, 1, 5);
  R(c, col, x - r - 3, y, 5, 1); R(c, col, x + r - 2, y, 5, 1); R(c, col, x, y - r - 3, 1, 5); R(c, col, x, y + r - 2, 1, 5);
  R(c, "#ef4444", x, y, 1, 1);
}

// ---- the cards: the stage's title, its tally, the trophy -------------------------------------------------
function panel(c, x, y, w, h) { R(c, "#000", x - 1, y - 1, w + 2, h + 2); R(c, "#3a2414", x, y, w, h); R(c, "#5a3a22", x + 2, y + 2, w - 4, h - 4); R(c, "#2a180c", x + 4, y + 4, w - 8, h - 8); }
function titleCard(c, st) {
  const scene = sceneOf(st), trip = TRIP[st.cfg.trip];
  panel(c, 40, 46, 240, 70);
  TC(c, scene.bonus ? "BONUS ROUND" : `STAGE ${st.si + 1}`, 54, "#fbbf24", 1);
  TC(c, scene.name, 68, "#f8f8f8", scene.name.length > 24 ? 1 : 2);
  TC(c, scene.bonus === "birds" ? "SHOOT THE DUCKS. THE GOLDEN ONE PAYS." : scene.bonus === "forms" ? "SHOOT THE FORMS. GOLD SEALS PAY." : trip.decoys ? "SHOOT THE CARDBOARD. NOT THE DEER." : `${SPECIES_BY[trip.sp].male}S ONLY. NOT THE ${SPECIES_BY[trip.sp].female}S.`, 92, "#fde68a");
  TC(c, "GET READY", 104, "#9ca3af");
}
function clearCard(c, st) {
  const s = st.stages[st.stages.length - 1]; if (!s) return;
  const scene = SCENES[s.scene], trip = TRIP[st.cfg.trip];
  panel(c, 50, 40, 220, 84);
  const head = st.end === "revoked" ? "LICENCE REVOKED" : st.end === "quota" ? "NO TAG FILLED" : scene.bonus ? "BONUS TALLY" : "TAG FILLED";
  TC(c, head, 50, st.end ? "#ef4444" : "#4ade80", 2);
  const rows = scene.bonus ? [[scene.bonus === "forms" ? "FORMS FILED" : "BIRDS", s.birds]] : [[trip.decoys ? "DECOYS" : `${SPECIES_BY[trip.sp].male}S`, s.males], ["STRIKES", s.females], ["CRITTERS", s.critters], ["TAG BONUS", s.bonus || 0]];
  rows.push(["STAGE POINTS", s.points]);
  rows.forEach(([k, v], i) => { T(c, k, 66, 72 + i * 9, "#d8d0c0"); const vs = String(v); T(c, vs, 254 - textWidth(vs), 72 + i * 9, "#fde68a"); });
}
// The trophy screen: the mount on a plaque, its score on the Department's scale, the trip's numbers.
export function trophyCard(c, st, t = 0) {
  R(c, "#1a100a", 0, 0, W, H);
  for (let y = 0; y < H; y += 6) R(c, (y / 6) & 1 ? "#24160c" : "#2a1a0e", 0, y, W, 6);   // the trophy room's boards
  for (let y = 0; y < H; y += 6) for (let x = ((y / 6) & 1) * 40; x < W; x += 80) R(c, "#140a06", x, y, 1, 6);
  const tr = st.trophy, trip = TRIP[st.cfg.trip];
  T(c, "THE TROPHY ROOM", 8, 6, "#fbbf24");
  const res = `${String(st.score).padStart(6, "0")}`;
  T(c, res, W - textWidth(res, 2) - 8, 4, "#f8f8f8", 2);
  // the plaque
  R(c, "#000", 31, 23, 122, 112); R(c, "#6a3a1a", 32, 24, 120, 110); R(c, "#8a4e24", 36, 28, 112, 102); R(c, "#7a4420", 40, 32, 104, 94);
  if (tr) {
    const sp = SPECIES_BY[tr.sp], k = 3.2, cx = 92, cy = 112;
    const a = { pts: tr.pts, sp: tr.sp, id: 1 };
    const [coat, light, dark] = tr.decoy ? ["#c8a878", "#e0c898", "#8a6a42"] : sp.coat;
    // the mount: the neck coming off the board, the head, the ears, the rack above
    R(c, coat, cx - 12, cy - 30, 24, 32); R(c, light, cx - 6, cy - 22, 12, 22);
    R(c, coat, cx - 10, cy - 52, 20, 26); R(c, dark, cx - 6, cy - 34, 12, 8); R(c, "#0a0a0a", cx - 3, cy - 30, 6, 3);
    R(c, "#0a0a0a", cx - 8, cy - 46, 3, 3); R(c, "#0a0a0a", cx + 5, cy - 46, 3, 3);
    R(c, dark, cx - 18, cy - 56, 8, 5); R(c, dark, cx + 10, cy - 56, 8, 5);
    if (sp.id === "caribou") R(c, "#f0ece0", cx - 12, cy - 24, 24, 10);
    antlers(c, a, sp, cx - 6, cy - 52, sp.w * k * 0.9, sp.h * k * 0.7, -1, false, tr.decoy ? "#c8a878" : null);
    antlers(c, a, sp, cx + 6, cy - 52, sp.w * k * 0.9, sp.h * k * 0.7, 1, false, tr.decoy ? "#c8a878" : null);
    R(c, "#c8a040", 62, 120, 60, 9); drawText(c, `${tr.pts} PTS`, 92 - textWidth(`${tr.pts} PTS`) / 2, 121, "#3a2414", 1);
  } else {
    drawText(c, "NO TROPHY", 66, 70, "#d8c8a8", 1); drawText(c, "THE WALL WAITS", 55, 82, "#a89878", 1);
  }
  // the card
  const x0 = 166;
  const line = (s, y, col = "#e8e0d0") => T(c, s, x0, y, col);
  line(trip.name, 28, "#fbbf24");
  if (tr) {
    const sp = SPECIES_BY[tr.sp];
    line(`${tr.pts} POINT ${tr.decoy ? "CARDBOARD" : sp.name}`, 40);
    line(`${tr.decoy ? "DECOY" : sp.male}, ${(tr.inches / 10).toFixed(1)} IN`, 50);
    line("(THE DEPARTMENT SCALE)", 60, "#a89878");
  }
  const acc = st.shots ? Math.round((st.hits * 100) / st.shots) : 0;
  line(`SHOTS ${st.shots}  HITS ${st.hits}`, 76);
  line(`ACCURACY ${acc}%  +${st.bonus}`, 86);
  line(`STRIKES ${st.strikes}/${RULES.STRIKES}`, 96, st.strikes ? "#f87171" : "#e8e0d0");
  line(`STAGES ${st.stages.length}/${trip.scenes.length}`, 106);
  const why = st.end === "revoked" ? "LICENCE REVOKED." : st.end === "quota" ? "THE SEASON CLOSED ON YOU." : "TRIP COMPLETE.";
  line(why, 120, st.end === "complete" ? "#4ade80" : "#f87171");
  TC(c, "TAGS ISSUED. THE DEER WERE NOT CONSULTED.", H - 14, "#9ca3af", 1, null);
  void t;
}

// ---- the frame -----------------------------------------------------------------------------------------
// o: {aim: [x, y] the live reticle (null: none), kick: the reticle's bloom, paused, reduced}
export function draw(c, st, frame, o = {}) {
  c.imageSmoothingEnabled = false;
  if (st.phase === "done") { trophyCard(c, st, frame); return; }
  const t = o.reduced ? 0 : frame;
  const scene = sceneOf(st);
  backdrop(c, st, t);
  const list = st.targets.filter(a => a.kind !== "bird" && a.kind !== "form").sort((a, b) => a.d - b.d || a.id - b.id);
  for (const a of list) animal(c, a, scene, st.cam, t);
  cover(c, st);
  for (const a of st.targets) if (a.kind === "bird") bird(c, a, st.cam, t); else if (a.kind === "form") form(c, a, st.cam, t);
  if (TINT[st.light]) R(c, TINT[st.light], 0, 0, W, H);
  fx(c, st, t);
  hud(c, st, t);
  if (st.phase === "title") titleCard(c, st);
  if (st.phase === "clear") clearCard(c, st);
  if (o.paused) { R(c, "rgba(0,0,0,0.5)", 0, 0, W, H); TC(c, "PAUSED", 80, "#f8f8f8", 2); }
  if (o.aim) reticle(c, Math.round(o.aim[0]), Math.round(o.aim[1]), o.kick || 0);
}
