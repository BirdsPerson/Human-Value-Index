// THE MOUNTAIN, skiable: the picture. Browser only; reads the sim's state and never writes it.
// A small canvas (320 px across, as tall as the screen's shape allows), scaled up by whole pixels with
// smoothing off: flat-shaded ground, pixel trees and pixel people.
//
// THE CAMERA stands downhill of the rider, high, looking up the fall line at them (the sim's cx, cy:
// which way down the screen is), and backs off as the speed rises. True perspective: a point lands
// at W/2 + f (p.R)/(p.F), H/2 - f (p.U)/(p.F), one scale per depth for the ground, the trees, the
// lifts and the people alike. Everything is drawn far to near (a painter), the ground in three
// levels of detail (15 m, 45 m and 135 m squares), each square shaded by the sun of the city's
// hour. Trails are the groomed snow; their edges carry their rating's colour. At night the lit
// trails glow under their lamps; the weather is the city's day.
import {
  GRID, gridIndex, baseH, heightAt, RUNS, TREE_BUCKETS, LIFTS_W, TOWERS, BLOCKS, KICKERS, RAILS, PIPE, pipeLocal, POOL, waterAt, GS_GATES, SL_GATES,
  MOG_L, FILES, FILE_R, TREELINE_M, W0, SHOP, BASE_LODGE, POIS, surfaceAt, polyAt, trailAt, LOAD_R2,
} from "./world.js";
import { CHALLENGES, CHALLENGE, linesOf, instructorAt, fieldTimes } from "./challenges.js";
import { liftFrac } from "./sim.js";
import { drawText, textWidth } from "../golf/font.js";
import { HEADS } from "./guide.js";

const RATING_RGB = { green: [22, 163, 74], blue: [37, 99, 235], black: [17, 24, 39], double: [0, 0, 0] };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const CSTR = new Map();
const rgb = (c) => { const k = ((c[0] | 0) << 16) | ((c[1] | 0) << 8) | (c[2] | 0); let s = CSTR.get(k); if (!s) { s = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; CSTR.set(k, s); } return s; };
const hash = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };

// ---- the light: the city's hour and weather -> sky, sun, ambient, fog --------------------------------
export function lightOf(hour, weather) {
  const day = clamp((Math.min(hour - 6.2, 19.2 - hour)) / 1.6, 0, 1);   // 0 night .. 1 day
  const dusk = clamp(1 - Math.abs(hour - 18.4) / 1.3, 0, 1) + clamp(1 - Math.abs(hour - 6.8) / 1.0, 0, 1);
  const az = ((hour - 6) / 12) * Math.PI, el = 0.25 + 0.75 * Math.sin(clamp((hour - 6) / 13, 0, 1) * Math.PI) * 0.9;
  const sun = [-Math.cos(az) * 0.8, -0.35, el];
  const n = Math.hypot(...sun);
  const grey = weather === "WHITEOUT" ? 1 : weather === "FRESH SNOW" ? 0.55 : 0;
  let top = mix([12, 18, 40], [70, 130, 210], day), hor = mix([30, 40, 70], [190, 215, 240], day);
  if (dusk > 0) { hor = mix(hor, [240, 150, 90], dusk * 0.6); top = mix(top, [90, 80, 140], dusk * 0.4); }
  top = mix(top, [200, 205, 212], grey * day * 0.8); hor = mix(hor, [225, 228, 232], grey * day);
  const amb = 0.3 + 0.32 * day, dir = (0.36 * day + 0.08) * (1 - grey * 0.7);
  const fog = mix(hor, [230, 233, 238], grey * 0.8);
  const fogNear = weather === "WHITEOUT" ? 60 : weather === "FRESH SNOW" ? 500 : 900, fogFar = weather === "WHITEOUT" ? 420 : weather === "FRESH SNOW" ? 2600 : 4200;
  return { day, night: day < 0.35, sun: [sun[0] / n, sun[1] / n, sun[2] / n], amb, dir, top, hor, fog, fogNear, fogFar, tint: mix([105, 115, 150], [255, 255, 255], day), grey };
}

// ---- the view: render-only state (the camera's ease, the tracks, the spray) ----------------------------
export function makeView() {
  return { dist: 115, px: null, tracks: [], parts: [], frame: 0, seed: 1, lastT: -1, shake: 0 };
}
// Ease the camera (render only) and remember tracks and spray from the state.
export function advance(V, st, reduced) {
  V.frame++;
  const sp = Math.hypot(st.vx, st.vy, st.vz);
  const want = 115 + clamp(sp, 0, 32) * 2.6 + (st.mode === "lift" ? 30 : 0) + (st.mode === "air" ? 10 : 0);
  V.dist += (want - V.dist) * 0.03;
  const p = riderPos(st);
  if (!V.px) V.px = { ...p, cx: st.cx, cy: st.cy };
  const k = st.mode === "lift" ? 0.12 : 0.35;
  V.px.x += (p.x - V.px.x) * k; V.px.y += (p.y - V.px.y) * k; V.px.z += (p.z - V.px.z) * (st.mode === "air" ? 0.12 : 0.3);
  if (Math.hypot(p.x - V.px.x, p.y - V.px.y) > 80) Object.assign(V.px, p);
  V.px.cx += (st.cx - V.px.cx) * 0.1; V.px.cy += (st.cy - V.px.cy) * 0.1;
  const cn = Math.hypot(V.px.cx, V.px.cy) || 1; V.px.cx /= cn; V.px.cy /= cn;
  if (st.t === V.lastT) return;
  V.lastT = st.t;
  if (st.mode === "ski" && sp > 1 && st.t % 2 === 0) { V.tracks.push([st.x, st.y, st.z + 0.05, st.hx, st.hy]); if (V.tracks.length > 700) V.tracks.splice(0, 100); }
  if (st.mode === "ski" && V.tracks.length && sp <= 1) V.tracks.push(null);
  if (st.mode !== "ski") { const L = V.tracks[V.tracks.length - 1]; if (L) V.tracks.push(null); }
  // spray: a skid, a hard carve, a landing, a wipeout
  const n = reduced ? 0 : st.mode === "ski" ? Math.min(6, Math.floor(st.slip * 0.8 + (Math.abs(st.edge) > 0.5 && sp > 10 ? 1.5 : 0))) : st.mode === "crash" && sp > 2 ? 3 : 0;
  for (const e of st.ev) if (e[0] === "land" || e[0] === "crash") { burst(V, st, e[0] === "crash" ? 26 : 14); if (e[0] === "crash" && !reduced) V.shake = 8; }
  for (let i = 0; i < n; i++) spray(V, st, 1);
  for (const P of V.parts) { P.vz -= 9.8 / 60; P.x += P.vx / 60; P.y += P.vy / 60; P.z += P.vz / 60; P.life--; }
  V.parts = V.parts.filter(P => P.life > 0);
  if (V.shake > 0) V.shake--;
}
function rnd(V) { V.seed = (V.seed * 1103515245 + 12345) >>> 0; return (V.seed >>> 8) / 16777216; }
function spray(V, st, k) {
  const lx = -st.hy, ly = st.hx, side = (st.vx * lx + st.vy * ly) > 0 ? 1 : -1;
  V.parts.push({ x: st.x, y: st.y, z: st.z + 0.2, vx: st.vx * 0.3 + lx * side * (2 + rnd(V) * 3) * k, vy: st.vy * 0.3 + ly * side * (2 + rnd(V) * 3) * k, vz: 1.5 + rnd(V) * 2.5, life: 24 + (rnd(V) * 18 | 0) });
}
function burst(V, st, n) { for (let i = 0; i < n; i++) V.parts.push({ x: st.x, y: st.y, z: st.z + 0.3, vx: st.vx * 0.2 + (rnd(V) - 0.5) * 8, vy: st.vy * 0.2 + (rnd(V) - 0.5) * 8, vz: 1 + rnd(V) * 4, life: 30 + (rnd(V) * 20 | 0) }); }

// Where the rider is drawn (on a lift: on the chair)
export function riderPos(st) {
  if (st.mode === "lift" && st.lift.ph === "ride") {
    const L = LIFTS_W.find(l => l.id === st.lift.id), f = liftFrac(st);
    const x = L.ax + (L.bx - L.ax) * f + L.n[0] * L.gap, y = L.ay + (L.by - L.ay) * f + L.n[1] * L.gap;
    return { x, y, z: ropeZ(L, f) - 2.4 };
  }
  return { x: st.x, y: st.y, z: st.z };
}

// ---- the lifts' ropes: supported at the stations and the towers ----------------------------------------
const ROPE = new Map();
function ropeSupports(L) {
  let r = ROPE.get(L.id);
  if (r) return r;
  const pts = [[0, baseH(L.ax, L.ay) + 7]];
  for (const k of L.towers) { const x = L.ax + (L.bx - L.ax) * k, y = L.ay + (L.by - L.ay) * k; pts.push([k, baseH(x, y) + L.rope]); }
  pts.push([1, baseH(L.bx, L.by) + 7]);
  ROPE.set(L.id, pts);
  return pts;
}
export function ropeZ(L, k) {
  const P = ropeSupports(L);
  for (let i = 1; i < P.length; i++) if (k <= P[i][0]) { const a = P[i - 1], b = P[i], f = (k - a[0]) / (b[0] - a[0] || 1); return a[1] + (b[1] - a[1]) * f - Math.sin(f * Math.PI) * 1.2; }
  return P[P.length - 1][1];
}

// ---- the camera ------------------------------------------------------------------------------------------
function cameraOf(V, W, H) {
  const p = V.px, Dx = p.cx, Dy = p.cy, pitch = 0.92, d = V.dist * (W < 300 ? 0.74 : 1);
  // (the look point well downhill of the rider: the rider sits high on the screen, the way ahead below)
  const lx = p.x + Dx * d * 0.22, ly = p.y + Dy * d * 0.22, lz = p.z + 1;
  const C = [p.x + Dx * d * Math.cos(pitch), p.y + Dy * d * Math.cos(pitch), p.z + d * Math.sin(pitch) + 2];
  let F = [lx - C[0], ly - C[1], lz - C[2]]; const fn = Math.hypot(...F); F = F.map(v => v / fn);
  const R = [Dy, -Dx, 0];
  const dz = F[2]; let U = [-dz * F[0], -dz * F[1], 1 - dz * F[2]]; const un = Math.hypot(...U); U = U.map(v => v / un);
  const f = (W / 2) / Math.tan((70 * Math.PI) / 360);
  if (V.shake) { C[0] += (Math.random() - 0.5) * 0.4; C[2] += (Math.random() - 0.5) * 0.4; }
  return { C, F, R, U, f, W, H, cx: W / 2, cy: H * 0.5 };
}
const NEAR = 1.5;
function proj(K, x, y, z, out, o) {
  const px = x - K.C[0], py = y - K.C[1], pz = z - K.C[2];
  const d = px * K.F[0] + py * K.F[1] + pz * K.F[2];
  out[o + 2] = d;
  if (d < NEAR) return false;
  out[o] = K.cx + ((px * K.R[0] + py * K.R[1]) * K.f) / d;
  out[o + 1] = K.cy - ((px * K.U[0] + py * K.U[1] + pz * K.U[2]) * K.f) / d;
  return true;
}
const TMP = new Float64Array(12);

// ---- sprites ---------------------------------------------------------------------------------------------
const TREE_SPR = new Map();
function treeSprite(h, night, snow) {
  h = clamp(Math.round(h), 3, 64);
  const key = `${h}|${night ? 1 : 0}|${snow ? 1 : 0}`;
  let c = TREE_SPR.get(key);
  if (c) return c;
  const w = Math.max(3, Math.round(h * 0.56)) | 1;
  c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const g = c.getContext("2d"), dk = night ? "#0c2118" : "#174a2c", md = night ? "#123222" : "#22603a", sn = night ? "#8796ad" : "#e9f1f8", tr = night ? "#2a1d14" : "#4a3020";
  const trunk = Math.max(1, Math.round(h * 0.12));
  g.fillStyle = tr; g.fillRect((w >> 1) - (h > 14 ? 1 : 0), h - trunk, h > 14 ? 2 : 1, trunk);
  const tiers = h < 8 ? 1 : h < 18 ? 2 : 3, body = h - trunk;
  for (let r = 0; r < body; r++) {
    const t = r / body, tier = Math.min(tiers - 1, Math.floor(t * tiers)), u = t * tiers - tier, half = Math.max(0.5, (w / 2) * (0.35 + 0.65 * u) * (0.55 + 0.45 * (tier + 1) / tiers));
    const x0 = Math.round(w / 2 - half), x1 = Math.round(w / 2 + half);
    g.fillStyle = dk; g.fillRect(x0, r, x1 - x0, 1);
    g.fillStyle = md; g.fillRect(x0, r, Math.max(1, ((x1 - x0) * 0.45) | 0), 1);
    if (snow && u < 0.22 && r > 0) { g.fillStyle = sn; g.fillRect(x0 + 1, r, Math.max(1, x1 - x0 - 2), 1); }
  }
  TREE_SPR.set(key, c);
  return c;
}

// A person, in pixels. foot at (sx, sy); u: one pixel-unit; ang: the skis' angle on the screen.
// look: {jacket, pants, helmet, skin, board, crouch, lean, flip, tumble, sit, alpha}
function person(g, sx, sy, u, ang, look) {
  const cos = Math.cos(ang), sin = Math.sin(ang);
  g.save();
  g.globalAlpha = look.alpha ?? 1;
  g.translate(Math.round(sx), Math.round(sy));
  if (look.tumble != null) g.rotate(look.tumble);
  else if (look.flip) { g.translate(0, -5 * u); g.rotate(look.flip); g.translate(0, 5 * u); }
  // skis (or the board): along the screen direction of travel
  if (!look.sit || look.board != null) {
    g.fillStyle = look.skis || "#1e293b";
    const len = look.board ? 4.2 * u : 5.2 * u, off = look.board ? [0] : [-0.7 * u, 0.7 * u];
    // a board stands across the line a little, its nose to the lead foot (regular: left; goofy: right)
    const ba = look.board ? (look.goofy ? -0.45 : 0.45) : 0, bc = Math.cos(ba), bs = Math.sin(ba), C2 = cos * bc - sin * bs, S2 = sin * bc + cos * bs;
    for (const o of off) {
      for (let s = -len; s <= len; s += Math.max(1, u * 0.7)) {
        const x = C2 * s - S2 * o, y = (S2 * s + C2 * o) * 0.5;
        g.fillRect(Math.round(x - u * 0.5), Math.round(y - u * 0.5), Math.max(1, Math.round(u * (look.board ? 1.4 : 0.9))), Math.max(1, Math.round(u * 0.8)));
      }
    }
  }
  const cr = look.crouch ? 1.6 * u : 0, lean = (look.lean || 0) * u * 1.6 + (look.board ? (look.goofy ? 0.5 : -0.5) * u : 0);
  const bx = Math.round(-1.5 * u + lean * 0.4);
  // legs
  g.fillStyle = look.pants || "#1f2937";
  g.fillRect(bx, Math.round(-4 * u + cr), Math.round(3 * u), Math.round(4 * u - cr));
  // torso
  g.fillStyle = look.jacket;
  const ty = Math.round(-8 * u + cr * 1.4);
  g.fillRect(Math.round(bx + lean * 0.6 - 0.5 * u), ty, Math.round(4 * u), Math.round(4.2 * u - cr * 0.3));
  // arms and poles
  if (!look.board) { g.fillStyle = "#94a3b8"; g.fillRect(Math.round(bx - 1.6 * u + lean), Math.round(ty + 2 * u), Math.max(1, Math.round(u * 0.6)), Math.round(4.5 * u)); g.fillRect(Math.round(bx + 4.2 * u + lean), Math.round(ty + 2 * u), Math.max(1, Math.round(u * 0.6)), Math.round(4.5 * u)); }
  // head and helmet
  g.fillStyle = look.skin || "#e0b088";
  g.fillRect(Math.round(bx + lean + 0.2 * u), Math.round(ty - 2.4 * u), Math.round(2.6 * u), Math.round(2.4 * u));
  g.fillStyle = look.helmet || "#0f172a";
  g.fillRect(Math.round(bx + lean), Math.round(ty - 3 * u), Math.round(3 * u), Math.max(1, Math.round(1.3 * u)));
  g.fillStyle = "#38bdf8"; g.fillRect(Math.round(bx + lean + 0.4 * u), Math.round(ty - 1.8 * u), Math.round(2.2 * u), Math.max(1, Math.round(0.7 * u)));
  g.restore();
}
// (no orange: orange is the player's alone)
const JACKETS = ["#dc2626", "#2563eb", "#16a34a", "#9333ea", "#eab308", "#0891b2", "#db2777", "#f8fafc", "#65a30d", "#475569"];
export const PLAYER_LOOK = { jacket: "#f97316", pants: "#111827", helmet: "#e5e7eb" };

// ---- the frame -------------------------------------------------------------------------------------------
// env: {hour, weather, reduced, npcs: [{x, y, z, d, mode, board, key, cabin, fallen}], found: Set, files: bits,
//       medals: {id: 0..3}, ghosts: bool, time (seconds, for animation)}
export function draw(g, W, H, st, V, env) {
  const Lgt = lightOf(env.hour, env.weather);
  const K = cameraOf(V, W, H);
  // the sky
  const sky = g.createLinearGradient(0, 0, 0, H * 0.7);
  sky.addColorStop(0, rgb(Lgt.top)); sky.addColorStop(1, rgb(Lgt.hor));
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  if (Lgt.night && Lgt.grey < 0.5) { g.fillStyle = "#cbd5e1"; for (let i = 0; i < 60; i++) { const h = hash(i, 7); g.fillRect(h % W, (h >>> 9) % Math.floor(H * 0.6), 1, 1); } }
  const items = [];
  terrain(K, items, Lgt, env);
  features(K, items, Lgt, env, st);
  trees(K, items, Lgt, env);
  lifts(K, items, st, env);
  buildings(K, items, Lgt);
  signage(K, items, Lgt, env, st);
  people(K, items, st, V, env);
  items.sort((a, b) => b.d - a.d);
  // the ground first (it is all far behind the people near it); tracks over the ground
  for (const it of items) {
    if (it.k === 0) {
      g.fillStyle = it.c; g.beginPath(); g.moveTo(it.p[0], it.p[1]); g.lineTo(it.p[2], it.p[3]); g.lineTo(it.p[4], it.p[5]); g.lineTo(it.p[6], it.p[7]); g.closePath(); g.fill();
      // the snow's grain: corduroy on the groomers, wind streaks off them, both down the fall line
      if (it.cord) { g.strokeStyle = it.cc; g.lineWidth = 1; g.beginPath(); for (let i = 0; i < it.cord.length; i += 4) { g.moveTo(it.cord[i], it.cord[i + 1]); g.lineTo(it.cord[i + 2], it.cord[i + 3]); } g.stroke(); }
      if (it.zones) paintZone(g, it);
      continue;
    }
    if (it.tracks) { drawTracks(g, K, V, Lgt); continue; }
    it.draw(g);
  }
  // spray
  g.fillStyle = Lgt.night ? "#9aa8c0" : "#ffffff";
  for (const P of V.parts) { if (!proj(K, P.x, P.y, P.z, TMP, 0)) continue; const s = Math.max(1, Math.round(K.f / TMP[2] * 0.18)); g.fillRect(Math.round(TMP[0]), Math.round(TMP[1]), s, s); }
  // the weather in the air
  if (!env.reduced && (env.weather === "FRESH SNOW" || env.weather === "WHITEOUT" || env.weather === "COLD")) {
    const n = env.weather === "WHITEOUT" ? 160 : env.weather === "FRESH SNOW" ? 90 : 25, t = env.time || 0;
    g.fillStyle = Lgt.night ? "rgba(200,210,230,0.7)" : "rgba(255,255,255,0.85)";
    for (let i = 0; i < n; i++) { const h = hash(i, 99), x = ((h % 1000) / 1000 * W + t * (8 + (h % 7)) * (env.weather === "WIND" ? 3 : 1)) % W, y = (((h >>> 10) % 1000) / 1000 * H + t * (18 + (h >>> 20) % 14)) % H; g.fillRect(x | 0, y | 0, h % 3 ? 1 : 2, 1); }
  }
  if (env.weather === "WHITEOUT") { g.fillStyle = "rgba(235,238,242,0.28)"; g.fillRect(0, 0, W, H); }
  if (env.guide?.goal && !env.noGoal && env.guide.phase !== "lift" && env.guide.phase !== "wait") goalMarker(g, K, env.guide.goal, env.time || 0, st);
  return K;
}

// ---- the ground --------------------------------------------------------------------------------------------
const LODS = [{ step: 1, r: 20 }, { step: 3, r: 60 }, { step: 9, r: 216 }];
const WATER = new WeakMap();
function waterFlag(T, gx, gy, o) {
  let a = WATER.get(T);
  if (!a) { a = new Int8Array(T.h.length).fill(-1); WATER.set(T, a); }
  if (a[o] < 0) { const w = waterAt(GRID.x0 + gx * GRID.GS, GRID.y0 + gy * GRID.GS); a[o] = w ? 1 : 0; }
  return a[o] === 1;
}
const SNOW_G = [248, 250, 254], SNOW_P = [212, 222, 238], SNOW_F = [196, 207, 225], ROCK = [104, 98, 94], ROCK2 = [132, 124, 116], WATER_C = [52, 112, 140];
// the lifts' zones on the screen this frame: [{x, y, r, P (screen ring), fill}]
function zoneRings(K, env) {
  const out = [], pulse = 0.55 + 0.45 * Math.sin((env.time || 0) * 4), N = 28;
  for (const L of LIFTS_W) {
    const [zx, zy] = L.zone;
    if (!near(K, zx, zy, 900)) continue;
    const P = new Float64Array(N * 3); let ok = true;
    for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2, x = zx + Math.cos(a) * LOAD_R2, y = zy + Math.sin(a) * LOAD_R2; if (!proj(K, x, y, baseH(x, y) + 0.08, P, i * 3)) { ok = false; break; } }
    if (ok) out.push({ x: zx, y: zy, P, N, fill: `rgba(250,204,21,${(0.22 + 0.16 * pulse).toFixed(2)})` });
  }
  return out;
}
function paintZone(g, it) {
  g.save();
  g.beginPath(); g.moveTo(it.p[0], it.p[1]); g.lineTo(it.p[2], it.p[3]); g.lineTo(it.p[4], it.p[5]); g.lineTo(it.p[6], it.p[7]); g.closePath(); g.clip();
  for (const Z of it.zones) {
    g.beginPath(); g.moveTo(Z.P[0], Z.P[1]); for (let i = 1; i < Z.N; i++) g.lineTo(Z.P[i * 3], Z.P[i * 3 + 1]); g.closePath();
    g.fillStyle = Z.fill; g.fill(); g.strokeStyle = "#facc15"; g.lineWidth = 2; g.stroke();
  }
  g.restore();
}
function terrain(K, items, Lgt, env) {
  GK = K;
  const ZR = zoneRings(K, env);
  const GS = GRID.GS, cgx = Math.round((K.C[0] + K.F[0] * 160 - GRID.x0) / GS), cgy = Math.round((K.C[1] + K.F[1] * 160 - GRID.y0) / GS);
  const lights = env.lightsOn, specks = [];
  let inner = null;
  for (const { step, r } of LODS) {
    const gx0 = Math.floor((cgx - r) / step) * step, gy0 = Math.floor((cgy - r) / step) * step, n = Math.floor((2 * r) / step) + 1;
    const P = new Float64Array(n * n * 3), Z = new Float64Array(n * n), ok = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const gx = gx0 + i * step, gy = gy0 + j * step, o = j * n + i;
      const [T, ti] = gridIndex(gx, gy), z = T.h[ti];
      Z[o] = z;
      ok[o] = proj(K, GRID.x0 + gx * GS, GRID.y0 + gy * GS, z, P, o * 3) ? 1 : 0;
    }
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      if (!(ok[a] && ok[b] && ok[c] && ok[d])) continue;
      const gx = gx0 + i * step, gy = gy0 + j * step;
      if (inner && gx >= inner[0] && gx + step <= inner[1] && gy >= inner[2] && gy + step <= inner[3]) continue;
      const xs = [P[a * 3], P[b * 3], P[d * 3], P[c * 3]], ys = [P[a * 3 + 1], P[b * 3 + 1], P[d * 3 + 1], P[c * 3 + 1]];
      if (Math.max(...xs) < 0 || Math.min(...xs) > K.W || Math.max(...ys) < 0 || Math.min(...ys) > K.H) continue;
      // in the pipe's footprint the pipe draws itself
      if (step === 1) { const wx = GRID.x0 + (gx + 0.5) * GS, wy = GRID.y0 + (gy + 0.5) * GS, [s, t] = pipeLocal(wx, wy); if (s > -12 && s < PIPE.len + 12 && Math.abs(t) < PIPE.F + PIPE.R + PIPE.deck + 10.6) continue; }
      const s = step * GS, hx = ((Z[b] - Z[a]) + (Z[d] - Z[c])) / (2 * s), hy = ((Z[c] - Z[a]) + (Z[d] - Z[b])) / (2 * s);
      const nn = Math.sqrt(1 + hx * hx + hy * hy), lam = Math.max(0, (-hx * Lgt.sun[0] - hy * Lgt.sun[1] + Lgt.sun[2]) / nn);
      const hh = hash(gx, gy);
      const [T, ti] = gridIndex(gx, gy), tr = T.trail[ti] - 1, edge = T.edge[ti], steep = Math.sqrt(hx * hx + hy * hy), zmid = (Z[a] + Z[d]) / 2;
      // the light, and the pitch: the steeper the face, the deeper its blue (so a slope reads as one)
      let shade = Lgt.amb + Lgt.dir * Math.min(1.1, lam * 1.3) - Math.min(0.2, steep * 0.32);
      shade = Math.min(1, Math.round(shade * 16) / 16);
      let col;
      if (step < 9 && waterFlag(T, gx, gy, ti)) col = WATER_C;
      else if (steep > 1.05 && tr < 0) col = (gx + gy) & 1 ? ROCK : ROCK2;
      else if (tr >= 0) {
        col = SNOW_G;
        if (edge < 7) col = mix(col, RATING_RGB[RUNS[tr].rating], 0.2);
      } else { col = zmid < TREELINE_M ? SNOW_F : SNOW_P; if (step === 1 && (hh & 3) === 1) col = mix(col, [196, 208, 228], 0.35); }
      // snow in shade goes blue, not grey
      let cc = col === ROCK || col === ROCK2 || col === WATER_C ? [col[0] * shade, col[1] * shade, col[2] * shade] : mix([col[0] * 0.55, col[1] * 0.62, col[2] * 0.8], col, clamp((shade - 0.25) / 0.75, 0, 1));
      cc = [cc[0] * Lgt.tint[0] / 255, cc[1] * Lgt.tint[1] / 255, cc[2] * Lgt.tint[2] / 255];
      if (Lgt.night && lights && tr >= 0 && T.lit[ti]) cc = mix(cc, [255, 226, 170], 0.45);
      const dep = (P[a * 3 + 2] + P[d * 3 + 2]) / 2, fog = clamp((dep - Lgt.fogNear) / (Lgt.fogFar - Lgt.fogNear), 0, 1);
      if (fog > 0) cc = mix(cc, Lgt.fog, fog);
      // close the seams: each square pushed out half a pixel from its middle
      const mx = (xs[0] + xs[1] + xs[2] + xs[3]) / 4, my = (ys[0] + ys[1] + ys[2] + ys[3]) / 4;
      for (let q = 0; q < 4; q++) { const ex = xs[q] - mx, ey = ys[q] - my, el = Math.hypot(ex, ey) || 1; xs[q] += (ex / el) * 0.6; ys[q] += (ey / el) * 0.6; }
      if (step === 1 && (hh & 3) === 0 && tr < 0) specks.push([GRID.x0 + (gx + ((hh >> 4) & 15) / 16) * GS, GRID.y0 + (gy + ((hh >> 8) & 15) / 16) * GS]);
      const it = { k: 0, d: Math.max(P[a * 3 + 2], P[b * 3 + 2], P[c * 3 + 2], P[d * 3 + 2]) + step * 0.01, c: rgb(cc), p: [xs[0], ys[0], xs[1], ys[1], xs[2], ys[2], xs[3], ys[3]] };
      if (step === 1 && tr >= 0 && col !== WATER_C && it.d < 420 && Math.abs(xs[2] - xs[0]) + Math.abs(ys[2] - ys[0]) > 7) grain(it, gx, gy, cc);
      if (ZR.length && step < 9) { const wx = GRID.x0 + (gx + step / 2) * GS, wy = GRID.y0 + (gy + step / 2) * GS, reach = LOAD_R2 + step * GS * 0.75; const zs = ZR.filter(Z => (Z.x - wx) * (Z.x - wx) + (Z.y - wy) * (Z.y - wy) < reach * reach); if (zs.length) it.zones = zs; }
      items.push(it);
    }
    inner = [gx0 + step, gx0 + (n - 2) * step, gy0 + step, gy0 + (n - 2) * step];
  }
  // a few specks on the off-piste snow near (wind crust, sastrugi): something to pass at speed
  for (const [x, y] of specks) {
    const z = baseH(x, y);
    if (!proj(K, x, y, z, TMP, 0)) continue;
    const sx = TMP[0], sy = TMP[1], d = TMP[2];
    items.push({ d: d - 0.5, draw: (g) => { g.fillStyle = Lgt.night ? "#56627a" : "#b4c2d6"; g.fillRect(Math.round(sx), Math.round(sy), 2, 1); } });
  }
  // the tracks, drawn just over the ground nearest them
  items.push({ k: 1, d: 0.5, tracks: true });
}
// the grain of a near groomed square: three corduroy lines down the fall line, in screen points on
// the item (drawn with its square)
// (the lines lie on a world grid across the fall line, so a square's lines meet its neighbours': stripes)
let GK = null;
const CORD = 3.2, FALLS = new Map();
function grain(it, gx, gy, cc) {
  const K = GK, GS = GRID.GS, cx = GRID.x0 + (gx + 0.5) * GS, cy = GRID.y0 + (gy + 0.5) * GS;
  // the fall line, broadly (the same over neighbouring squares), cached by 60 m cell
  const fk = Math.floor(cx / 60) * 4096 + Math.floor(cy / 60);
  let F = FALLS.get(fk);
  if (!F) { const x = (Math.floor(cx / 60) + 0.5) * 60, y = (Math.floor(cy / 60) + 0.5) * 60, gxx = (baseH(x + 60, y) - baseH(x - 60, y)) / 120, gyy = (baseH(x, y + 60) - baseH(x, y - 60)) / 120, n = Math.hypot(gxx, gyy); F = n > 0.01 ? [-gxx / n, -gyy / n] : [0, 1]; FALLS.set(fk, F); }
  const [fx, fy] = F, ax = -fy, ay = fx, c = cx * ax + cy * ay, first = -((c % CORD) + CORD) % CORD, half = GS * 0.5, out = [];
  for (let o = first - CORD * 2; o <= half; o += CORD) {
    if (o < -half) continue;
    const x0 = cx + ax * o - fx * half, y0 = cy + ay * o - fy * half, x1 = cx + ax * o + fx * half, y1 = cy + ay * o + fy * half;
    if (!proj(K, x0, y0, baseH(x0, y0) + 0.03, TMP, 0) || !proj(K, x1, y1, baseH(x1, y1) + 0.03, TMP, 3)) continue;
    out.push(TMP[0], TMP[1], TMP[3], TMP[4]);
  }
  if (!out.length) return;
  it.cord = out;
  it.cc = rgb([cc[0] * 0.88, cc[1] * 0.9, cc[2] * 0.95]);
}
function drawTracks(g, K, V, Lgt) {
  g.strokeStyle = Lgt.night ? "rgba(70,80,110,0.5)" : "rgba(150,165,195,0.55)";
  g.lineWidth = 1;
  g.beginPath();
  let pen = false;
  for (const p of V.tracks) {
    if (!p || !proj(K, p[0], p[1], p[2], TMP, 0)) { pen = false; continue; }
    if (pen) g.lineTo(TMP[0], TMP[1]); else g.moveTo(TMP[0], TMP[1]);
    pen = true;
  }
  g.stroke();
}
// a filled polygon among the items (world points), shaded
function poly(K, items, pts, col, extra = 0) {
  const P = new Float64Array(pts.length * 3);
  let dmax = 0;
  for (let i = 0; i < pts.length; i++) { if (!proj(K, pts[i][0], pts[i][1], pts[i][2], P, i * 3)) return; dmax = Math.max(dmax, P[i * 3 + 2]); }
  items.push({ d: dmax - extra, draw: (g) => { g.fillStyle = col; g.beginPath(); g.moveTo(P[0], P[1]); for (let i = 1; i < pts.length; i++) g.lineTo(P[i * 3], P[i * 3 + 1]); g.closePath(); g.fill(); } });
}
function near(K, x, y, r) { const dx = x - K.C[0], dy = y - K.C[1]; return dx * dx + dy * dy < r * r; }
const shadeC = (base, k, Lgt) => rgb([base[0] * k * Lgt.tint[0] / 255, base[1] * k * Lgt.tint[1] / 255, base[2] * k * Lgt.tint[2] / 255]);

// ---- the park, the pipe, the moguls, the gates, the markers ----------------------------------------------------------
function features(K, items, Lgt, env, st) {
  // THE PIPELINE
  if (near(K, PIPE.ax + PIPE.dx * PIPE.len / 2, PIPE.ay + PIPE.dy * PIPE.len / 2, 1400)) {
    const nx = -PIPE.dy, ny = PIPE.dx, hw = PIPE.F + PIPE.R + PIPE.deck;
    const T = [-hw - 12, -hw - 6, -hw + 2, -(PIPE.F + PIPE.R), -(PIPE.F + PIPE.R * 0.92), -(PIPE.F + PIPE.R * 0.75), -(PIPE.F + PIPE.R * 0.5), -(PIPE.F + PIPE.R * 0.25), -PIPE.F, PIPE.F, PIPE.F + PIPE.R * 0.25, PIPE.F + PIPE.R * 0.5, PIPE.F + PIPE.R * 0.75, PIPE.F + PIPE.R * 0.92, PIPE.F + PIPE.R, hw - 2, hw + 6, hw + 12];
    const step = near(K, PIPE.ax, PIPE.ay, 900) ? 10 : 30;
    for (let s = -12; s < PIPE.len + 12; s += step) {
      const s2 = Math.min(PIPE.len + 12, s + step);
      for (let i = 0; i < T.length - 1; i++) {
        const pt = (ss, tt) => { const x = PIPE.ax + PIPE.dx * ss + nx * tt, y = PIPE.ay + PIPE.dy * ss + ny * tt; return [x, y, heightAt(x, y)]; };
        const a = pt(s, T[i]), b = pt(s, T[i + 1]), c = pt(s2, T[i + 1]), d = pt(s2, T[i]);
        const wall = Math.abs(a[2] - b[2]) / Math.abs(T[i + 1] - T[i]);
        const side = (T[i] + T[i + 1]) / 2, face = side * (nx * K.F[0] + ny * K.F[1]);
        const k = Lgt.amb + Lgt.dir * (wall > 0.3 ? (face > 0 ? 0.9 : 0.35) : 0.75);
        poly(K, items, [a, b, c, d], shadeC(wall > 0.3 ? [232, 238, 248] : [244, 247, 252], Math.round(k * 7) / 7, Lgt));
      }
    }
  }
  // the kickers
  for (const Kk of KICKERS) {
    if (!near(K, Kk.x, Kk.y, 1200)) continue;
    const nx = -Kk.dy, ny = Kk.dx, hw = Kk.w / 2;
    const prof = [-Kk.L, -Kk.L * 0.66, -Kk.L * 0.33, -0.01, 0.01, Kk.T, Kk.T + Kk.D * 0.5, Kk.T + Kk.D];
    const P = (s, t, top) => { const x = Kk.x + Kk.dx * s + nx * t, y = Kk.y + Kk.dy * s + ny * t; return [x, y, top ? heightAt(x, y) : baseH(x, y)]; };
    for (let i = 0; i < prof.length - 1; i++) {
      const a = P(prof[i], -hw, 1), b = P(prof[i], hw, 1), c = P(prof[i + 1], hw, 1), d = P(prof[i + 1], -hw, 1);
      const climb = (c[2] - b[2]) / Math.max(0.01, prof[i + 1] - prof[i]);
      poly(K, items, [a, b, c, d], shadeC([240, 244, 250], Lgt.amb + Lgt.dir * (climb > 0.1 ? 0.95 : climb < -0.1 ? 0.55 : 0.75), Lgt));
      for (const sd of [-1, 1]) { const e = P(prof[i], hw * sd, 1), f = P(prof[i + 1], hw * sd, 1), h = P(prof[i + 1], hw * sd, 0), j = P(prof[i], hw * sd, 0); if (e[2] - j[2] > 0.15 || f[2] - h[2] > 0.15) poly(K, items, [e, f, h, j], shadeC([200, 210, 225], Lgt.amb + Lgt.dir * 0.4, Lgt), -0.5); }
    }
    // the lip, painted (so it reads from above)
    const l0 = P(0, -hw, 1), l1 = P(0, hw, 1);
    line3(K, items, l0, l1, Kk.id === "big" ? "#f97316" : "#2563eb", 2);
  }
  // the rails
  for (const Rl of RAILS) {
    if (!near(K, Rl.ax, Rl.ay, 900)) continue;
    const za = baseH(Rl.ax, Rl.ay) + Rl.top, zb = baseH(Rl.bx, Rl.by) + Rl.top;
    line3(K, items, [Rl.ax, Rl.ay, za], [Rl.bx, Rl.by, zb], Rl.col, Rl.kind === "box" ? 3 : 2);
    for (let k = 0; k <= 1; k += 0.5) { const x = Rl.ax + (Rl.bx - Rl.ax) * k, y = Rl.ay + (Rl.by - Rl.ay) * k; line3(K, items, [x, y, baseH(x, y)], [x, y, za + (zb - za) * k], "#475569", 1); }
  }
  // moguls: a highlight and a shadow on each bump near the camera
  {
    const r = 170, x0 = K.C[0] + K.F[0] * 90, y0 = K.C[1] + K.F[1] * 90;
    const j0 = Math.floor((y0 - r) / MOG_L), j1 = Math.floor((y0 + r) / MOG_L);
    for (let j = j0; j <= j1; j++) {
      const off = j & 1 ? 0.5 : 0, i0 = Math.floor((x0 - r) / MOG_L - off), i1 = Math.floor((x0 + r) / MOG_L - off);
      for (let i = i0; i <= i1; i++) {
        const x = (i + off + 0.5) * MOG_L, y = (j + 0.5) * MOG_L;
        const sf = surfaceAt(x, y);
        if (sf.trail < 0 || RUNS[sf.trail].kind !== "moguls" || sf.edge < 7) continue;
        const z = heightAt(x, y);
        if (!proj(K, x, y, z, TMP, 0)) continue;
        const sx = TMP[0], sy = TMP[1], d = TMP[2], s = clamp(K.f / d * 3.2, 1, 9);
        if (sx < -10 || sx > K.W + 10 || sy < -10 || sy > K.H + 10) continue;
        items.push({ d: d - 1, draw: (g) => { g.fillStyle = Lgt.night ? "#6d7a94" : "#c3cfe0"; g.fillRect(Math.round(sx - s * 0.6), Math.round(sy + s * 0.15), Math.round(s * 1.2), Math.max(1, Math.round(s * 0.35))); g.fillStyle = Lgt.night ? "#a7b3c9" : "#ffffff"; g.fillRect(Math.round(sx - s * 0.4), Math.round(sy - s * 0.25), Math.round(s * 0.8), Math.max(1, Math.round(s * 0.3))); } });
      }
    }
  }
  // the gates: the race course's always; the slalom set in the slalom
  const C = st.ch ? CHALLENGE[st.ch.id] : null;
  const gateSet = C?.gates === "sl" ? SL_GATES : GS_GATES;
  gateSet.forEach((Gt, i) => {
    if (!near(K, Gt.x, Gt.y, 1100)) return;
    const done = C && C.gates && st.ch && i < st.ch.gi, za = heightAt(Gt.ax, Gt.ay), zb = heightAt(Gt.bx, Gt.by), col = done ? "#94a3b8" : Gt.col;
    for (const [x, y, z] of [[Gt.ax, Gt.ay, za], [Gt.bx, Gt.by, zb]]) { line3(K, items, [x, y, z], [x, y, z + 3.4], col, 2); poly(K, items, [[x, y, z + 3.4], [x + 1.6, y, z + 3], [x + 1.6, y, z + 2.2], [x, y, z + 2.2]], col, 0.2); }
    // the gate's line on the snow, faint, between its poles
    line3(K, items, [Gt.ax, Gt.ay, za + 0.05], [Gt.bx, Gt.by, zb + 0.05], done ? "rgba(148,163,184,0.35)" : Gt.col === "#2563eb" ? "rgba(37,99,235,0.35)" : "rgba(220,38,38,0.35)", 1);
    // the next gate, pointed out
    if (C && C.gates && st.ch && i === st.ch.gi) { const t = (env.time || 0) * 4, zz = (za + zb) / 2 + 6 + Math.sin(t) * 0.8; poly(K, items, [[Gt.x - 1.5, Gt.y, zz + 2], [Gt.x + 1.5, Gt.y, zz + 2], [Gt.x, Gt.y, zz]], "#facc15", -0.5); }
  });
  // the challenge lines: checkpoints and the finish, when running one
  if (C && C.run) {
    const { cps, finish } = linesOf(C);
    cps.forEach((c, i) => { if (!(st.ch.cp & (1 << i))) banner(K, items, c, "#eab308", "CHECKPOINT", Lgt); });
    if (finish) banner(K, items, finish, "#dc2626", "FINISH", Lgt);
  }
  // the challenges' starts: a tall flag each (a medal colour once won)
  // (challenges sharing a start stand their flags in a row; only the nearest flag is named, and none in a run)
  const seen = new Map();
  let nearest = null, nd = 70 * 70;
  for (const Ch of CHALLENGES) {
    if (!Ch.start) continue;
    const key = `${Math.round(Ch.start.x)}|${Math.round(Ch.start.y)}`, k = seen.get(key) || 0;
    seen.set(key, k + 1);
    const o = 9 + k * 7, fx = Ch.start.x - Ch.start.hy * o, fy = Ch.start.y + Ch.start.hx * o;
    if (!near(K, fx, fy, 1500)) continue;
    const m = env.medals?.[Ch.id] || 0, col = ["#f97316", "#b45309", "#cbd5e1", "#facc15"][m];
    const dx = fx - st.x, dy = fy - st.y;
    if (!st.ch && dx * dx + dy * dy < nd) { nd = dx * dx + dy * dy; nearest = [fx, fy, Ch.name, col]; }
    flag(K, items, fx, fy, heightAt(fx, fy), col, null);
  }
  if (nearest) label(K, items, nearest[0], nearest[1], heightAt(nearest[0], nearest[1]) + 12, nearest[2], nearest[3]);
  // LOST PROPERTY: the files not yet found, glowing a little
  for (const F of FILES) {
    if (env.files & (1 << F.i) || !near(K, F.x, F.y, 700)) continue;
    const z = heightAt(F.x, F.y) + 0.6 + Math.sin((env.time || 0) * 3 + F.i) * 0.25;
    if (!proj(K, F.x, F.y, z, TMP, 0)) continue;
    const sx = TMP[0], sy = TMP[1], d = TMP[2], s = clamp(K.f / d * 1.2, 2, 14);
    items.push({ d, draw: (g) => { g.fillStyle = "rgba(250,204,21,0.35)"; g.fillRect(Math.round(sx - s), Math.round(sy - s), Math.round(s * 2), Math.round(s * 2)); g.fillStyle = "#fef08a"; g.fillRect(Math.round(sx - s * 0.5), Math.round(sy - s * 0.6), Math.round(s), Math.round(s * 1.2)); g.fillStyle = "#a16207"; g.fillRect(Math.round(sx - s * 0.3), Math.round(sy - s * 0.2), Math.round(s * 0.6), 1); } });
  }
  // THE RETENTION POOL's name on the bank, near
  if (near(K, POOL.x, POOL.y, 500)) label(K, items, POOL.x, POOL.y + POOL.ry * 0.2, heightAt(POOL.x, POOL.y) + 6, "THE RETENTION POOL", "#e0f2fe");
}
function line3(K, items, a, b, col, w) {
  const P = new Float64Array(6);
  if (!proj(K, a[0], a[1], a[2], P, 0) || !proj(K, b[0], b[1], b[2], P, 3)) return;
  items.push({ d: Math.max(P[2], P[5]) - 0.3, draw: (g) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(P[0], P[1]); g.lineTo(P[3], P[4]); g.stroke(); } });
}
function banner(K, items, c, col, text, Lgt) {
  const za = heightAt(c.ax, c.ay), zb = heightAt(c.bx, c.by);
  line3(K, items, [c.ax, c.ay, za], [c.ax, c.ay, za + 5], "#334155", 2);
  line3(K, items, [c.bx, c.by, zb], [c.bx, c.by, zb + 5], "#334155", 2);
  poly(K, items, [[c.ax, c.ay, za + 5], [c.bx, c.by, zb + 5], [c.bx, c.by, zb + 3.8], [c.ax, c.ay, za + 3.8]], col, 0.3);
  void Lgt;
  label(K, items, c.x, c.y, (za + zb) / 2 + 6.5, text, col);
}
function flag(K, items, x, y, z, col, name) {
  line3(K, items, [x, y, z], [x, y, z + 9], "#e2e8f0", 1);
  poly(K, items, [[x, y, z + 9], [x + 3.2, y, z + 8.2], [x, y, z + 7.2]], col, 0.2);
  if (name) label(K, items, x, y, z + 11, name, col);
}
function label(K, items, x, y, z, text, col) {
  if (!proj(K, x, y, z, TMP, 0)) return;
  const sx = TMP[0], sy = TMP[1], d = TMP[2], w = textWidth(text);
  items.push({ d: d - 2, draw: (g) => { g.fillStyle = "rgba(2,6,23,0.6)"; g.fillRect(Math.round(sx - w / 2 - 2), Math.round(sy - 10), w + 4, 10); drawText(g, text, Math.round(sx - w / 2), Math.round(sy - 9), col); } });
}

// ---- the trees ----------------------------------------------------------------------------------------------
function trees(K, items, Lgt, env) {
  const R = 1100, TB = 60, cx = K.C[0] + K.F[0] * 500, cy = K.C[1] + K.F[1] * 500;
  const bx0 = Math.floor((cx - R) / TB), bx1 = Math.floor((cx + R) / TB), by0 = Math.floor((cy - R) / TB), by1 = Math.floor((cy + R) / TB);
  const snowy = env.weather !== "CLEAR" || true;
  for (let bx = bx0; bx <= bx1; bx++) for (let by = by0; by <= by1; by++) {
    const L = TREE_BUCKETS.get(bx * 4096 + by);
    if (!L) continue;
    for (const T of L) {
      const z = T.z ?? (T.z = baseH(T.x, T.y));
      if (!proj(K, T.x, T.y, z, TMP, 0)) continue;
      const sx = TMP[0], sy = TMP[1], d = TMP[2];
      if (d > 2600) continue;
      const h = (K.f / d) * 13 * T.s;
      if (sx < -h || sx > K.W + h || sy < 0 || sy - h > K.H) continue;
      if (h < 2.2) { const fog = clamp((d - Lgt.fogNear) / (Lgt.fogFar - Lgt.fogNear), 0, 1); const c = mix(Lgt.night ? [14, 30, 22] : [30, 72, 46], Lgt.fog, fog); items.push({ d, draw: (g) => { g.fillStyle = rgb(c); g.fillRect(Math.round(sx), Math.round(sy - 2), 1, 2); } }); continue; }
      const spr = treeSprite(h, Lgt.night, snowy), fog = clamp((d - Lgt.fogNear) / (Lgt.fogFar - Lgt.fogNear), 0, 1);
      const sh = h >= 6 ? Math.round(spr.width * 0.7) : 0;
      items.push({ d, draw: (g) => { if (sh) { g.fillStyle = "rgba(40,55,95,0.25)"; g.fillRect(Math.round(sx - sh * 0.3), Math.round(sy - 1), sh, Math.max(1, Math.round(h * 0.1))); } g.drawImage(spr, Math.round(sx - spr.width / 2), Math.round(sy - spr.height)); if (fog > 0.15) { g.globalAlpha = fog * 0.85; g.fillStyle = rgb(Lgt.fog); g.fillRect(Math.round(sx - spr.width / 2), Math.round(sy - spr.height), spr.width, spr.height); g.globalAlpha = 1; } } });
    }
  }
}

// ---- the lifts ---------------------------------------------------------------------------------------------
function lifts(K, items, st, env) {
  const t = st.t / 60;
  for (const L of LIFTS_W) {
    const mx = (L.ax + L.bx) / 2, my = (L.ay + L.by) / 2;
    if (!near(K, mx, my, L.len / 2 + 2000)) continue;
    const S = ropeSupports(L);
    for (const [k, z] of S.slice(1, -1)) {
      const x = L.ax + (L.bx - L.ax) * k, y = L.ay + (L.by - L.ay) * k, g0 = baseH(x, y);
      line3(K, items, [x, y, g0], [x, y, z], "#475569", 2);
      line3(K, items, [x - L.n[0] * (L.gap + 1), y - L.n[1] * (L.gap + 1), z], [x + L.n[0] * (L.gap + 1), y + L.n[1] * (L.gap + 1), z], "#475569", 1);
    }
    // the haul rope, both sides
    for (const sd of [1, -1]) for (let i = 1; i < S.length; i++) {
      const a = S[i - 1], b = S[i], pa = [L.ax + (L.bx - L.ax) * a[0] + L.n[0] * L.gap * sd, L.ay + (L.by - L.ay) * a[0] + L.n[1] * L.gap * sd, a[1]], pb = [L.ax + (L.bx - L.ax) * b[0] + L.n[0] * L.gap * sd, L.ay + (L.by - L.ay) * b[0] + L.n[1] * L.gap * sd, b[1]];
      line3(K, items, pa, pb, "#1e293b", 1);
    }
    // the chairs (cabins), going round
    const loop = 2 * L.len, cars = Math.floor(loop / L.spacing);
    for (let i = 0; i < cars; i++) {
      const s = (((i * L.spacing + L.speed * t) % loop) + loop) % loop, up = s < L.len, k = up ? s / L.len : 2 - s / L.len, sd = up ? 1 : -1;
      const x = L.ax + (L.bx - L.ax) * k + L.n[0] * L.gap * sd, y = L.ay + (L.by - L.ay) * k + L.n[1] * L.gap * sd, z = ropeZ(L, k);
      if (!near(K, x, y, 900) || !proj(K, x, y, z, TMP, 0)) continue;
      const sx = TMP[0], sy = TMP[1], d = TMP[2], u = clamp(K.f / d * 0.55, 0.5, 6), gond = L.kind === "gondola";
      const riders = !gond && hash(i, L.len | 0) % 3 === 0 ? 1 + (hash(i, 3) % L.seats) : 0;
      items.push({ d, draw: (g) => {
        g.fillStyle = "#334155"; g.fillRect(Math.round(sx), Math.round(sy), 1, Math.round(u * 3));
        if (gond) { g.fillStyle = "#b91c1c"; g.fillRect(Math.round(sx - u * 1.6), Math.round(sy + u * 3), Math.round(u * 3.2), Math.round(u * 3)); g.fillStyle = "#bae6fd"; g.fillRect(Math.round(sx - u * 1.2), Math.round(sy + u * 3.6), Math.round(u * 2.4), Math.max(1, Math.round(u))); }
        else { g.fillStyle = "#1f2937"; g.fillRect(Math.round(sx - u * 2), Math.round(sy + u * 3), Math.round(u * 4), Math.max(1, Math.round(u * 0.8))); for (let r = 0; r < riders; r++) { g.fillStyle = JACKETS[hash(i, r) % JACKETS.length]; g.fillRect(Math.round(sx - u * 1.8 + r * u * 1.3), Math.round(sy + u * 1.6), Math.max(1, Math.round(u)), Math.round(u * 1.5)); } }
      } });
    }
  }
}

// ---- the buildings: lodges, stations, the shop ------------------------------------------------------------------
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function buildings(K, items, Lgt) {
  for (const B of BLOCKS) {
    const cx = (B.x0 + B.x1) / 2, cy = (B.y0 + B.y1) / 2;
    if (!near(K, cx, cy, 2400)) continue;
    const z0 = B.base - 1, z1 = B.base + B.h, wall = hexRgb(B.wall || "#64748b"), roof = hexRgb(B.roof || "#334155");
    const faces = [
      [[B.x0, B.y1], [B.x1, B.y1], [0, 1]], [[B.x1, B.y0], [B.x0, B.y0], [0, -1]], [[B.x1, B.y1], [B.x1, B.y0], [1, 0]], [[B.x0, B.y0], [B.x0, B.y1], [-1, 0]],
    ];
    for (const [a, b, n] of faces) {
      const mxx = (a[0] + b[0]) / 2, myy = (a[1] + b[1]) / 2;
      if ((mxx - K.C[0]) * n[0] + (myy - K.C[1]) * n[1] > 0) continue;
      const lam = Math.max(0, n[0] * Lgt.sun[0] + n[1] * Lgt.sun[1]);
      poly(K, items, [[a[0], a[1], z1], [b[0], b[1], z1], [b[0], b[1], z0], [a[0], a[1], z0]], shadeC(wall, Lgt.amb + Lgt.dir * lam * 0.9, Lgt));
      // windows: lit at night
      if (B.h > 4 && Lgt.night) { const P = new Float64Array(3); if (proj(K, mxx, myy, z0 + B.h * 0.55, P, 0)) { const s = clamp(K.f / P[2] * 1.4, 1, 10); items.push({ d: P[2] - 0.6, draw: (g) => { g.fillStyle = "#fde68a"; g.fillRect(Math.round(P[0] - s * 1.5), Math.round(P[1]), Math.round(s * 3), Math.max(1, Math.round(s * 0.7))); } }); } }
    }
    // the roof, under snow (a dark roof seen from above reads as a hole in the ground)
    poly(K, items, [[B.x0 - 1, B.y0 - 1, z1], [B.x1 + 1, B.y0 - 1, z1], [B.x1 + 1, B.y1 + 1, z1], [B.x0 - 1, B.y1 + 1, z1]], shadeC(mix(roof, [236, 241, 248], 0.55), Lgt.amb + Lgt.dir * 0.7, Lgt), 0.5);
    poly(K, items, [[B.x0 + 2, B.y0 + 2, z1 + 0.05], [B.x1 - 2, B.y0 + 2, z1 + 0.05], [B.x1 - 2, B.y1 - 2, z1 + 0.05], [B.x0 + 2, B.y1 - 2, z1 + 0.05]], shadeC([244, 247, 252], Lgt.amb + Lgt.dir * 0.75, Lgt), 0.6);
    if (B === SHOP || B === BASE_LODGE || B.name && near(K, cx, cy, 380)) if (B.name) label(K, items, cx, cy, z1 + 4, B === SHOP ? "SHAUN WHITE // BOARDS AND SKIS" : B.name, "#fde68a");
  }
  void W0;
}

// ---- the signage: piste poles and their ropes, the trail signs, the lifts' zones -------------------------------
// Poles stand along both edges of every trail, one every POLE_GAP m, in the trail's colour (green,
// blue, black), a rope between them; none where the edge runs inside another trail (a junction).
const POLE_GAP = 34, PB = 150, POLE_COL = { green: "#16a34a", blue: "#2563eb", black: "#0f172a", double: "#0f172a" };
let POLES = null;
function polesIn() {
  if (POLES) return POLES;
  POLES = new Map();
  for (const R of RUNS) for (const side of [-1, 1]) {
    let prev = null;
    for (let s = 12; s < R.len - 8; s += POLE_GAP) {
      const [x0, y0, dx, dy] = polyAt(R, s), o = (R.hw - 1.5) * side, x = x0 - dy * o, y = y0 + dx * o;
      const [, e] = trailAt(x, y);
      if (e > 5) { prev = null; continue; }
      const P = { x, y, z: baseH(x, y), col: POLE_COL[R.rating], top: R.rating === "black" || R.rating === "double" ? "#facc15" : "#f8fafc", prev, rope: R.kind !== "glades" };
      prev = P;
      const k = Math.floor(x / PB) * 4096 + Math.floor(y / PB);
      if (!POLES.has(k)) POLES.set(k, []);
      POLES.get(k).push(P);
    }
  }
  // and down the middle, a tall marker every 48 m: the line to follow (the trails are wide)
  for (const R of RUNS) for (let s = 40; s < R.len - 20; s += 48) {
    const [x, y] = polyAt(R, s), [ti, e] = trailAt(x, y);
    if (ti !== R.i || e < R.hw * 0.6) continue;
    const P = { x, y, z: baseH(x, y), col: POLE_COL[R.rating], top: R.rating === "black" || R.rating === "double" ? "#facc15" : "#f8fafc", mark: R.rating };
    const k = Math.floor(x / PB) * 4096 + Math.floor(y / PB);
    if (!POLES.has(k)) POLES.set(k, []);
    POLES.get(k).push(P);
  }
  return POLES;
}
// the trail signs: one at every trail's head, its name on its colour and an arrow down it
let SIGNS = null;
function signsOf() {
  if (SIGNS) return SIGNS;
  SIGNS = RUNS.map(R => {
    const [x0, y0, dx, dy] = polyAt(R, 26), o = -(R.hw - 5), x = x0 - dy * o, y = y0 + dx * o, [ax, ay] = polyAt(R, 60);
    return { x, y, z: baseH(x, y), name: R.name, rating: R.rating, cx: x0, cy: y0, ax, ay };
  });
  return SIGNS;
}
const SIGN_BG = { green: "#15803d", blue: "#1d4ed8", black: "#0f172a", double: "#0f172a" };
function signage(K, items, Lgt, env, st) {
  const lx = K.C[0] + K.F[0] * 220, ly = K.C[1] + K.F[1] * 220, PL = polesIn();
  const b0x = Math.floor((lx - 600) / PB), b1x = Math.floor((lx + 600) / PB), b0y = Math.floor((ly - 600) / PB), b1y = Math.floor((ly + 600) / PB);
  const P2 = new Float64Array(6);
  for (let bx = b0x; bx <= b1x; bx++) for (let by = b0y; by <= b1y; by++) {
    const L = PL.get(bx * 4096 + by);
    if (!L) continue;
    for (const P of L) {
      if (!proj(K, P.x, P.y, P.z, P2, 0) || !proj(K, P.x, P.y, P.z + (P.mark ? 3.6 : 2.6), P2, 3)) continue;
      const sx = P2[0], sy = P2[1], tx = P2[3], ty = P2[4], d = P2[2];
      if (sx < -20 || sx > K.W + 20 || sy < -10 || ty > K.H + 10 || d > 900) continue;
      if (P.mark) {
        // the middle marker: a pole and the trail's sign on it (a circle, a square, a diamond)
        const r = clamp(Math.round(K.f / d * 1.1), 2, 8), w = d < 160 ? 2 : 1;
        items.push({ d: d - 0.4, draw: (g) => { g.strokeStyle = "#334155"; g.lineWidth = w; g.beginPath(); g.moveTo(sx, sy); g.lineTo(tx, ty); g.stroke(); markSign(g, Math.round(tx), Math.round(ty - r), r, P.mark); } });
        continue;
      }
      const w = d < 110 ? 2 : 1, cut = (sy - ty) * 0.25;
      items.push({ d: d - 0.4, draw: (g) => { g.strokeStyle = P.col; g.lineWidth = w; g.beginPath(); g.moveTo(sx, sy); g.lineTo(tx, ty + cut); g.stroke(); g.strokeStyle = P.top; g.beginPath(); g.moveTo(tx, ty + cut); g.lineTo(tx, ty); g.stroke(); } });
      // the rope to the pole before, near
      if (P.rope && P.prev && d < 320) {
        const Q = P.prev, R2 = new Float64Array(6);
        if (proj(K, P.x, P.y, P.z + 0.9, R2, 0) && proj(K, Q.x, Q.y, Q.z + 0.9, R2, 3)) {
          const dd = Math.max(R2[2], R2[5]), mx = (R2[0] + R2[3]) / 2, my = (R2[1] + R2[4]) / 2 + Math.max(1, Math.abs(R2[0] - R2[3]) * 0.05);
          items.push({ d: dd - 0.3, draw: (g) => { g.strokeStyle = Lgt.night ? "#9a5b2a" : "#f97316"; g.lineWidth = 1; g.beginPath(); g.moveTo(R2[0], R2[1]); g.quadraticCurveTo(mx, my, R2[3], R2[4]); g.stroke(); } });
        }
      }
    }
  }
  // the trail signs
  for (const S of signsOf()) {
    if (!near(K, S.x, S.y, 700)) continue;
    const pa = new Float64Array(9);
    if (!proj(K, S.x, S.y, S.z, pa, 0) || !proj(K, S.x, S.y, S.z + 4.4, pa, 3)) continue;
    if (pa[2] > 520) continue;
    const sx = pa[0], sy = pa[1], tx = pa[3], ty = pa[4], d = pa[2];
    // the arrow: the trail's way down, on the screen
    const pc = new Float64Array(6); let ang = Math.PI / 2;
    if (proj(K, S.cx, S.cy, baseH(S.cx, S.cy), pc, 0) && proj(K, S.ax, S.ay, baseH(S.ax, S.ay), pc, 3)) ang = Math.atan2(pc[4] - pc[1], pc[3] - pc[0]);
    const text = S.name, w = textWidth(text) + 14, big = d < 140;
    items.push({ d: d - 1.5, draw: (g) => {
      g.strokeStyle = "#475569"; g.lineWidth = 1; g.beginPath(); g.moveTo(sx, sy); g.lineTo(tx, ty); g.stroke();
      const bx = Math.round(tx - w / 2), by = Math.round(ty - 11);
      g.fillStyle = "#f8fafc"; g.fillRect(bx - 1, by - 1, w + 2, 12);
      g.fillStyle = SIGN_BG[S.rating]; g.fillRect(bx, by, w, 10);
      drawText(g, text, bx + 2, by + 2, "#f8fafc");
      arrowHead(g, bx + w - 6, by + 5, ang, big ? 4 : 3, "#facc15");
    } });
  }
  // the lifts: a glowing zone at each line and a big sign
  for (const L of LIFTS_W) {
    const [zx, zy] = L.zone;
    if (!near(K, zx, zy, 900)) continue;
    // (the glowing circle itself is painted with the ground: terrain() hands it to the squares under it)
    // the sign stands at the zone's lift side (behind a rider standing in it)
    const sgx = zx + L.d[0] * (LOAD_R2 + 3), sgy = zy + L.d[1] * (LOAD_R2 + 3), sgz = baseH(sgx, sgy), pa = new Float64Array(6);
    if (proj(K, sgx, sgy, sgz, pa, 0) && proj(K, sgx, sgy, sgz + 6.5, pa, 3) && pa[2] < 800) {
      const sx = pa[0], sy = pa[1], tx = pa[3], ty = pa[4], d = pa[2], sc = d < 260 ? 2 : 1;
      const l1 = "LIFT", l2 = L.name, w = Math.max(textWidth(l1, sc), textWidth(l2)) + 18, h = 10 * sc + 12;
      items.push({ d: d - 2, draw: (g) => {
        g.strokeStyle = "#334155"; g.lineWidth = 2; g.beginPath(); g.moveTo(sx, sy); g.lineTo(tx, ty); g.stroke();
        const bx = Math.round(tx - w / 2), by = Math.round(ty - h);
        g.fillStyle = "#0f172a"; g.fillRect(bx - 1, by - 1, w + 2, h + 2);
        g.fillStyle = "#facc15"; g.fillRect(bx, by, w, h);
        drawText(g, l1, Math.round(tx - textWidth(l1, sc) / 2), by + 2, "#0f172a", sc);
        drawText(g, l2, Math.round(tx - textWidth(l2) / 2), by + 10 * sc + 3, "#0f172a");
        arrowHead(g, bx + 6, by + 6, -Math.PI / 2, 3, "#0f172a"); arrowHead(g, bx + w - 6, by + 6, -Math.PI / 2, 3, "#0f172a");
      } });
    }
  }
  // just off a lift: the trail heads, pointed out
  const heads = env.guide?.phase === "top" ? env.guide.heads : null;
  if (heads) for (const Hd of heads) {
    const z = baseH(Hd.x, Hd.y) + 6 + Math.sin((env.time || 0) * 5) * 0.8, pa = new Float64Array(3);
    if (!proj(K, Hd.x, Hd.y, z, pa, 0)) continue;
    const sx = pa[0], sy = pa[1], col = POLE_COL[Hd.rating] === "#0f172a" ? "#f8fafc" : POLE_COL[Hd.rating];
    items.push({ d: pa[2] - 3, draw: (g) => { arrowHead(g, sx, sy, Math.PI / 2, 6, "#0f172a"); arrowHead(g, sx, sy - 1, Math.PI / 2, 5, col); } });
  }
  void st; void HEADS;
}
// a trail's rating mark: green circle, blue square, black diamond (two for a double), on a white plate
function markSign(g, x, y, r, rating) {
  g.fillStyle = "#f8fafc"; g.fillRect(x - r - 1, y - r - 1, r * 2 + 2, r * 2 + 2);
  g.fillStyle = POLE_COL[rating];
  if (rating === "green") { g.beginPath(); g.arc(x, y, r * 0.8, 0, Math.PI * 2); g.fill(); }
  else if (rating === "blue") g.fillRect(x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5);
  else { const k = rating === "double" ? 0.55 : 0.85, o = rating === "double" ? r * 0.5 : 0; for (const dx of rating === "double" ? [-o, o] : [0]) { g.beginPath(); g.moveTo(x + dx, y - r * k); g.lineTo(x + dx + r * k, y); g.lineTo(x + dx, y + r * k); g.lineTo(x + dx - r * k, y); g.closePath(); g.fill(); } }
}
// a filled arrowhead at (x, y) pointing at angle a (screen radians), r pixels
function arrowHead(g, x, y, a, r, col) {
  const c = Math.cos(a), s = Math.sin(a);
  g.fillStyle = col; g.beginPath();
  g.moveTo(x + c * r, y + s * r); g.lineTo(x - c * r * 0.7 - s * r * 0.8, y - s * r * 0.7 + c * r * 0.8); g.lineTo(x - c * r * 0.7 + s * r * 0.8, y - s * r * 0.7 - c * r * 0.8);
  g.closePath(); g.fill();
}
// THE OBJECTIVE: over it, a bouncing arrow and how far; off the screen, an arrow at the edge toward it
function goalMarker(g, K, G0, t, st) {
  if (G0.dist < 28) return;   // there: the prompt says what to do
  const pa = new Float64Array(3), W = K.W, H = K.H, m = 16, bob = Math.round(Math.sin(t * 5) * 2);
  const label = `${G0.name}${G0.dist > 30 ? ` ${G0.dist} M` : ""}`;
  const on = proj(K, G0.x, G0.y, G0.z + 7, pa, 0) && pa[0] > m && pa[0] < W - m && pa[1] > m + 10 && pa[1] < H - m;
  if (on) {
    const x = Math.round(pa[0]), y = Math.round(pa[1]) + bob;
    arrowHead(g, x, y, Math.PI / 2, 8, "#0f172a"); arrowHead(g, x, y - 1, Math.PI / 2, 6, G0.col);
    if (G0.dist > 30) { const w = textWidth(label); g.fillStyle = "rgba(2,6,23,0.7)"; g.fillRect(Math.round(x - w / 2 - 2), y - 21, w + 4, 10); drawText(g, label, Math.round(x - w / 2), y - 20, "#f8fafc"); }
    return;
  }
  // off the screen: from the middle toward it (behind the camera: the guide's screen direction)
  let dx, dy;
  if (pa[2] >= NEAR) { dx = pa[0] - W / 2; dy = pa[1] - H / 2; } else { dx = G0.arrow[0]; dy = G0.arrow[1]; }
  const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
  const kx = dx ? (W / 2 - m) / Math.abs(dx) : Infinity, ky = dy ? (H / 2 - m - 6) / Math.abs(dy) : Infinity, k = Math.min(kx, ky);
  let x = Math.round(W / 2 + dx * k), y = Math.round(H / 2 + dy * k);
  // (clear of the mini-map in the bottom right corner, and of the HUD's top line)
  if (x > W * 0.7 && y > H - W * 0.26 - 14) { y = Math.round(H - W * 0.26 - 14); x = Math.min(x, W - m); }
  const a = Math.atan2(dy, dx), pul = 8 + (Math.floor(t * 4) % 2);
  arrowHead(g, x, y, a, pul + 2, "#0f172a"); arrowHead(g, x, y, a, pul, G0.col);
  const w = textWidth(label), lx = clamp(Math.round(x - dx * (w / 2 + 16) - w / 2), 2, W - w - 2), ly = clamp(Math.round(y - dy * 18 - 4), 2, H - 10);
  g.fillStyle = "rgba(2,6,23,0.75)"; g.fillRect(lx - 2, ly - 1, w + 4, 10); drawText(g, label, lx, ly, "#f8fafc");
  void st;
}

// ---- the people: the rider, the city's skiers, the instructor, the field ------------------------------------------
function people(K, items, st, V, env) {
  const add = (x, y, z, hx, hy, look, extra = 0, grow = 1) => {
    if (!proj(K, x, y, z, TMP, 0)) return;
    const sx = TMP[0], sy = TMP[1], d = TMP[2];
    if (sx < -40 || sx > K.W + 40 || sy < -40 || sy > K.H + 60) return;
    const P2 = new Float64Array(3);
    proj(K, x + hx * 2, y + hy * 2, z, P2, 0);
    const ang = Math.atan2((P2[1] - sy) * 2, P2[0] - sx);
    const u = clamp((K.f / d) * 0.62 * grow, 0.6, 4);
    items.push({ d: d - 0.8 - extra, draw: (g) => person(g, sx, sy, u, ang, look) });
  };
  // the city's skiers on the mountain
  for (const N of env.npcs || []) {
    if (!near(K, N.x, N.y, 900)) continue;
    const jacket = JACKETS[hash(N.k || 1, 5) % JACKETS.length];
    if (N.mode === "lift") continue;   // the chairs carry the riders (drawn with them)
    add(N.x, N.y, N.z, N.d?.[0] ?? 0, N.d?.[1] ?? 1, { jacket, board: N.board, sit: false, tumble: N.fallen ? 1.4 : null, alpha: 1 });
  }
  // the instructor
  if (st.ch && st.ch.id === "instructor" && st.ch.ph !== "done") {
    const I = instructorAt(st.ch.tc), z = heightAt(I.x, I.y);
    add(I.x, I.y, z, I.hx, I.hy, { jacket: "#b91c1c", pants: "#f8fafc", helmet: "#b91c1c" });
    label(K, items, I.x, I.y, z + 4, "INSTRUCTOR", "#fecaca");
  }
  // THE WEEKEND RACE: the three nearest the rider's pace, as ghosts down the gates
  if (st.ch && st.ch.id === "race" && st.ch.ph === "run") {
    const secs = st.ch.tc / 60, field = fieldTimes().sort((a, b) => a.t - b.t);
    for (const f of field.slice(0, 3)) {
      const k = clamp(secs / f.t, 0, 1), p = gatePath(k);
      add(p[0], p[1], heightAt(p[0], p[1]), p[2], p[3], { jacket: f.disc === "BOARD" ? "#0ea5e9" : "#e11d48", board: f.disc === "BOARD", alpha: 0.55 });
      if (near(K, p[0], p[1], 200)) label(K, items, p[0], p[1], heightAt(p[0], p[1]) + 4, f.name, "#e2e8f0");
    }
  }
  // the rider
  const p = riderPos(st);
  const A = st.air, sw = st.sw ? Math.PI : 0;
  let hx = st.hx, hy = st.hy;
  if (A) { const a = (A.spin * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); hx = A.hx * c - A.hy * s; hy = A.hx * s + A.hy * c; }
  if (sw) { hx = -hx; hy = -hy; }
  const look = { ...PLAYER_LOOK, board: st.board, goofy: env.goofy, crouch: st.crouch > 4 || (st.mode === "ski" && Math.hypot(st.vx, st.vy) > 18), lean: st.edge, flip: A ? (A.flip * Math.PI) / 180 : 0, tumble: st.mode === "crash" && !st.wipe?.water ? (st.crash * 0.35) % (Math.PI * 2) : null, sit: st.mode === "lift" };
  if (st.mode === "crash" && st.wipe?.water) { look.alpha = clamp(st.crash / 60, 0.2, 1); }
  // a shadow under a rider in the air
  // the rider's shadow (always: it says where on the ground they are, in the air and out of it)
  if (st.mode !== "lift") { const gz = heightAt(st.x, st.y); if (proj(K, st.x, st.y, gz + 0.05, TMP, 0)) { const sx = TMP[0], sy = TMP[1], d = TMP[2], s = clamp(K.f / d * 1.1, 2, 12); items.push({ d: d - 0.2, draw: (g) => { g.fillStyle = "rgba(40,55,95,0.38)"; g.beginPath(); g.ellipse(sx + s * 0.3, sy, s, Math.max(1, s * 0.32), 0, 0, Math.PI * 2); g.fill(); } }); } }
  if (st.mode === "lift" && st.lift.ph === "ride") { const L = LIFTS_W.find(l => l.id === st.lift.id); hx = L.d[0]; hy = L.d[1]; }
  // in the air the rider grows a little (nearer the camera, the old top-down habit), so the air reads
  add(p.x, p.y, p.z, hx, hy, look, 2, A ? 1 + clamp((p.z - heightAt(st.x, st.y)) / 7, 0, 0.7) : 1);
  // the first seconds of a run: YOU, over the rider (which of the people on the slope is you)
  if (env.you && proj(K, p.x, p.y, p.z + 5.5, TMP, 0)) { const sx = Math.round(TMP[0]), sy = Math.round(TMP[1]), d = TMP[2]; items.push({ d: d - 4, draw: (g) => { const w = textWidth("YOU"); g.fillStyle = "#f97316"; g.fillRect(sx - w / 2 - 2, sy - 12, w + 4, 10); drawText(g, "YOU", sx - w / 2, sy - 11, "#0f172a"); arrowHead(g, sx, sy + 1, Math.PI / 2, 3, "#f97316"); } }); }
  void POIS; void V;
}
// along THE GAUNTLET through the giant slalom gates (the field's line), k 0..1 -> [x, y, hx, hy]
let GPATH = null;
function gatePath(k) {
  if (!GPATH) { const C = CHALLENGE.gs, f = linesOf(C).finish; const pts = [[C.start.x, C.start.y], ...GS_GATES.map(g => [g.x, g.y]), [f.x, f.y]]; let L = 0; const cum = [0]; for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(L); } GPATH = { pts, cum, L }; }
  const want = k * GPATH.L;
  for (let i = 1; i < GPATH.pts.length; i++) if (want <= GPATH.cum[i] || i === GPATH.pts.length - 1) { const a = GPATH.pts[i - 1], b = GPATH.pts[i], seg = GPATH.cum[i] - GPATH.cum[i - 1] || 1, f = clamp((want - GPATH.cum[i - 1]) / seg, 0, 1); return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, (b[0] - a[0]) / seg, (b[1] - a[1]) / seg]; }
  return [GPATH.pts[0][0], GPATH.pts[0][1], 0, 1];
}
export { lightOf as light };
