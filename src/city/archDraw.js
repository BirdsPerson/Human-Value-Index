// Architecture, drawn: every building's exterior in the iso view, from its massing
// (archGeo.js). No image assets: boxes, faces and a few curves, in map cells, turned to the
// current quarter by G.Q.
//
// Level of detail, by zoom: far = the silhouette, the roof shape and a colour that reads per
// type (brick projects, brownstone rows, blue glass, black monolith), a glow where a sign is
// lit; mid = windows by the storey, balconies, fire escapes, signs, smoke; near = laundry on
// the lines, AC units, broken panes, the clock's hands, bulbs chasing round the marquee, the
// doorman, fans turning.
//
// Light: windows are lit by who is inside (CityIso passes the building's occupancy share), so
// apartments light up after dark and the office towers go dark; by day a window is glass.
// Neon and bulbs are on after dusk and ghosted by day. The monolith's eye is always on.
//
// Painter's order inside a building: parts back to front (archGeo.partOrder), each part's
// walls then what is on them (windows, balconies, signs), then its roof and what stands on
// it. What hangs off the front (a stoop, a canopy) is drawn after the wall it hangs off.

import { rot, STOREY } from "./iso.js";
import { funnelDeco, drawFunnelYard, FUNNEL_MAT, FUNNEL_ROOF, FUNNEL_STYLES_DRAWN, FUNNEL_PROPS } from "./funnelDraw.js";
import { venueDeco, drawVenueYard, VENUE_STYLES_DRAWN } from "./venueDraw.js";
import { VENUE_PROPS } from "./venueGeo.js";
// THE PORT and THE OLD TOWN (PHASE 2 step 3): their facades, the quay's cranes and ship, the slipway
import { westDeco, drawWestYard, drawWestGround, WEST_STYLES_DRAWN, WEST_PROPS_DRAWN } from "./westDraw.js";
import { partOrder } from "./archGeo.js";

export const DRAWN_STYLES = new Set(["projects", "brownstone", "lofts", "glass", "office", "monolith", "gothic", "clocktower", "neon", "casino", "diner", "gallery", "theatre", "cafe", "studio", "hall", "classical", "vault", "hospital", "chapel", "market", "school", "shed", "reactor", "stacks", "datahall", "docks", "tanks", "bunker", "prison", "canteen",
  "shacks", "seawall", "bungalow", "seaview", "condo", "bunkhouse", "alpine", "lodge", "chalet"]);
export const DRAWN_PROPS = new Set(["hoop", "fence", "bench", "tree", "lamp", "doorman", "planter", "fountain", "flag", "camera", "bollard", "statue", "hydrant", "poster", "table", "armoured", "booth", "ambulance", "grave", "stall", "conveyor", "containers", "sandbags", "watchtower", "bins", "palm", "pine", "surfboard", "skis", "umbrella", "hottub"]);
for (const k of FUNNEL_STYLES_DRAWN) DRAWN_STYLES.add(k);
for (const k of FUNNEL_PROPS) DRAWN_PROPS.add(k);
for (const k of VENUE_STYLES_DRAWN) DRAWN_STYLES.add(k);
for (const k of WEST_STYLES_DRAWN) DRAWN_STYLES.add(k);
for (const k of WEST_PROPS_DRAWN) DRAWN_PROPS.add(k);
for (const k of VENUE_PROPS) DRAWN_PROPS.add(k);

const MAT = {
  brick: "#8a4a3a", brownstone: "#6d4a36", redbrick: "#94503b", glass: "#3f7598", steel: "#58718a", obsidian: "#141917",
  plinth: "#2b322e", concrete: "#8b8f88", tank: "#7d848c", wood: "#6a4a30", sandstone: "#ad9468", darkbrick: "#4a3037",
  casino: "#5e1d45", white: "#cfd3cf", maroon: "#6a2a37", corrugated: "#5f5a6c", hall: "#6f808a", limestone: "#c2b89e",
  vaultcon: "#6a706b", market: "#8a6848", rust: "#83503a", stack: "#9c3c38", panel: "#687279", greenhouse: "#6fae8c", stone: "#b8b09c",
  pastel: "#6fa9a4", pastelpink: "#c98f8a", pastelyellow: "#cdb672", stucco: "#d2c6ae", weathered: "#8c8a80", timber: "#7a5232", logs: "#6a4226",
};
const ROOF = { brick: "#3c3634", brownstone: "#35302c", redbrick: "#3a3230", glass: "#5d93b3", steel: "#3f4c58", obsidian: "#0c100e", plinth: "#39413c",
  concrete: "#7a7e78", sandstone: "#454b55", darkbrick: "#2c2628", casino: "#3a1830", white: "#a9aeab", maroon: "#3a2228", corrugated: "#4c4858",
  hall: "#7f93a0", limestone: "#8c8674", vaultcon: "#5a605b", market: "#5a4a3a", rust: "#6a4a3a", panel: "#555e64", greenhouse: "#9ed2b4", stone: "#8f8878", tank: "#6a7178", wood: "#5a3e28", stack: "#6a6a6a",
  pastel: "#8a9a9c", pastelpink: "#8a9a9c", pastelyellow: "#8a9a9c", stucco: "#b0564a", weathered: "#55534c", timber: "#e8eef2", logs: "#e8eef2" };   // tin at the sea, terracotta on the flats, snow on the mountain
Object.assign(MAT, FUNNEL_MAT); Object.assign(ROOF, FUNNEL_ROOF);

const cache = new Map();
function shade(hex, f) {
  const k = hex + (Math.round(f * 50) / 50);
  let v = cache.get(k);
  if (v) return v;
  const n = parseInt(hex.slice(1), 16), c = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  v = `rgb(${c(16)},${c(8)},${c(0)})`;
  cache.set(k, v);
  return v;
}
// integer hash -> [0, 1)
function hi(a, b = 0, c = 0, d = 0) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x27d4eb2d) ^ Math.imul(c + 1013, 0x165667b1) ^ Math.imul(d + 7, 0x9e3779b1);
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const frac = (v) => ((v % 1) + 1) % 1;

// ---- the drawing kit: one per building per frame ------------------------------------------
function kit(G, env) {
  const { ctx } = G;
  const bat = new Map();
  const K = {
    G, ctx, env, z: G.z, lod: env.lod, night: env.night, t: env.t,
    nf: env.night ? 0.6 : 1,
    px: Math.max(1, G.z * 0.06),
    // batched polygons by colour: one fill per colour per flush
    bq(col, pts) { let a = bat.get(col); if (!a) bat.set(col, a = []); a.push(pts); },
    flush() {
      for (const [col, list] of bat) {
        ctx.fillStyle = col; ctx.beginPath();
        for (const p of list) { ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); }
        ctx.fill();
      }
      bat.clear();
    },
    line(A, B, col, w) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); },
    Q: G.Q,
  };
  return K;
}

// A face of a box: the edge a -> b (map), its outward normal, the shade it takes (0: hidden).
function facesOf(p, G) {
  const c = [(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2];
  const all = [
    { s: "s", a: [p.x0, p.y1], b: [p.x1, p.y1], n: [0, 1], i: 0 },
    { s: "e", a: [p.x1, p.y1], b: [p.x1, p.y0], n: [1, 0], i: 1 },
    { s: "n", a: [p.x1, p.y0], b: [p.x0, p.y0], n: [0, -1], i: 2 },
    { s: "w", a: [p.x0, p.y0], b: [p.x0, p.y1], n: [-1, 0], i: 3 },
  ];
  const out = [];
  for (const f of all) {
    const sh = G.facing(f.a, f.b, c);
    if (!sh) continue;
    f.sh = sh; f.len = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]);
    f.F = (t, h, d = 0) => G.Q(f.a[0] + (f.b[0] - f.a[0]) * t + f.n[0] * d, f.a[1] + (f.b[1] - f.a[1]) * t + f.n[1] * d, h);
    f.q = (t0, t1, h0, h1, d = 0) => [f.F(t0, h1, d), f.F(t1, h1, d), f.F(t1, h0, d), f.F(t0, h0, d)];
    out.push(f);
  }
  return out;
}

// Text laid on a face (a sign painted or bolted on): centred at (t, h), `size` storeys tall.
function faceText(K, f, t, h, text, size, fill, o = {}) {
  const { ctx } = K;
  const A = f.F(t, h, o.d || 0), B = f.F(Math.min(1, t + 0.05), h, o.d || 0);
  let ex = B[0] - A[0], ey = B[1] - A[1];
  const L = Math.hypot(ex, ey) || 1; ex /= L; ey /= L;
  if (ex < 0) { ex = -ex; ey = -ey; }
  const fpx = size * STOREY * K.z;
  if (fpx < 4) return;
  ctx.save();
  ctx.transform(ex, ey, 0, 1, A[0], A[1]);
  ctx.font = `bold ${Math.round(fpx)}px 'Fira Mono', ui-monospace, Menlo, monospace`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (o.glow) { ctx.lineWidth = Math.max(2, fpx * 0.35); ctx.strokeStyle = o.glow; ctx.lineJoin = "round"; ctx.strokeText(text, 0, 0); }
  if (o.stroke) { ctx.lineWidth = Math.max(1, fpx * 0.12); ctx.strokeStyle = o.stroke; ctx.strokeText(text, 0, 0); }
  ctx.fillStyle = fill; ctx.fillText(text, 0, 0);
  ctx.restore();
}
// Neon: lit after dusk (and it flickers), a pale ghost of itself by day.
function neonOn(K, seed, rate = 0.05) {
  if (!K.night) return 0.35;
  const k = Math.floor(K.t * 9);
  return hi(seed, k) < rate ? 0.15 : 1;
}

// ---- windows -------------------------------------------------------------------------------
// litShare: the building's occupancy share (0..1); warm: apartment light, else office light.
function winColour(K, lit, warm) {
  if (K.night) return lit ? (warm ? "#fcc94a" : "#d9ecf5") : "#0d1216";
  return lit ? (warm ? "#c9b27a" : "#a9c3cf") : null;   // null: the day glass
}
function windowGrid(K, f, p, o) {
  const { env } = K;
  const cols = Math.max(1, Math.floor(f.len / o.bay));
  const ww = Math.min(0.9, o.w / (f.len / cols));
  const glass = shade(o.glass || "#40596a", f.sh * (K.night ? 0.5 : 1));
  const s0 = Math.floor(p.h0 + (o.from || 0)), s1 = Math.floor(p.h1 - 1e-6);
  for (let s = s0; s <= s1; s++) for (let k = 0; k < cols; k++) {
    if (o.skip && o.skip(s, k, cols)) continue;
    const tc = (k + 0.5) / cols, hw = ww / cols / 2;
    const lit = hi(env.bid, f.i * 97 + s, k) < env.lit;
    let col = winColour(K, lit, o.warm !== false) || glass;
    if (o.broken && hi(env.bid + 3, f.i, s, k) < o.broken) col = hi(env.bid, s, k, 9) < 0.5 ? "#4a3a28" : "#070909";
    const pts = f.q(tc - hw, tc + hw, s + (o.y0 ?? 0.3), s + (o.y1 ?? 0.78));
    if (o.arch) { const top = f.F(tc, s + (o.y1 ?? 0.78) + o.arch); K.bq(col, [pts[0], top, pts[1], pts[2], pts[3]]); }
    else K.bq(col, pts);
    if (o.sill && K.lod !== "far") K.bq(o.sill, f.q(tc - hw * 1.2, tc + hw * 1.2, s + (o.y0 ?? 0.3) - 0.06, s + (o.y0 ?? 0.3)));
  }
}

// ---- parts ---------------------------------------------------------------------------------
function walls(K, p, faces, mat) {
  for (const f of faces) K.G.poly(f.q(0, 1, p.h0, p.h1), shade(mat, f.sh * K.nf));
}
function flatRoof(K, p, col, parapet = true) {
  const { Q } = K;
  K.G.poly([Q(p.x0, p.y0, p.h1), Q(p.x1, p.y0, p.h1), Q(p.x1, p.y1, p.h1), Q(p.x0, p.y1, p.h1)], shade(col, 1.25 * K.nf), K.lod === "far" ? null : "rgba(0,0,0,0.35)");
  if (parapet && K.lod !== "far") {
    const e = 0.12;
    K.G.poly([Q(p.x0 + e, p.y0 + e, p.h1), Q(p.x1 - e, p.y0 + e, p.h1), Q(p.x1 - e, p.y1 - e, p.h1), Q(p.x0 + e, p.y1 - e, p.h1)], shade(col, 1.08 * K.nf));
  }
}
// Pitched roofs. gable: ridge along ax at height h1 + peak; pyramid; barrel (curved, along ax).
function gableRoof(K, p, col, faces) {
  const { Q, G } = K, H = p.h1, P = p.peak || 1;
  const alongX = p.ax !== "y";
  const r0 = alongX ? [[p.x0, (p.y0 + p.y1) / 2], [p.x1, (p.y0 + p.y1) / 2]] : [[(p.x0 + p.x1) / 2, p.y0], [(p.x0 + p.x1) / 2, p.y1]];
  // the two slopes: the far one first
  const slopes = alongX
    ? [[[p.x0, p.y0], [p.x1, p.y0], [0, -1]], [[p.x0, p.y1], [p.x1, p.y1], [0, 1]]]
    : [[[p.x0, p.y0], [p.x0, p.y1], [-1, 0]], [[p.x1, p.y0], [p.x1, p.y1], [1, 0]]];
  const depth = (s) => { const m = [(s[0][0] + s[1][0]) / 2, (s[0][1] + s[1][1]) / 2], [u, v] = rot(m[0], m[1], G.r); return u + v; };
  slopes.sort((a, b) => depth(a) - depth(b));
  for (const [a, b, n] of slopes) {
    const c = [(a[0] + b[0]) / 2 - n[0], (a[1] + b[1]) / 2 - n[1]];
    const lit = G.facing(a, b, c) ? 1.15 : 0.85;
    const ra = alongX ? [a[0], r0[0][1]] : [r0[0][0], a[1]], rb = alongX ? [b[0], r0[0][1]] : [r0[0][0], b[1]];
    G.poly([Q(a[0], a[1], H), Q(b[0], b[1], H), Q(rb[0], rb[1], H + P), Q(ra[0], ra[1], H + P)], shade(col, lit * K.nf), K.lod === "far" ? null : "rgba(0,0,0,0.3)");
    if (K.lod === "near" && col !== ROOF.glass) {   // slates: a line every so often
      ctx_lines(K, a, b, ra, rb, H, P, 5);
    }
  }
  // gable ends (the triangles), where they face us
  const ends = alongX ? [["w", [p.x0, p.y1], [p.x0, p.y0], r0[0]], ["e", [p.x1, p.y0], [p.x1, p.y1], r0[1]]] : [["n", [p.x0, p.y0], [p.x1, p.y0], r0[0]], ["s", [p.x1, p.y1], [p.x0, p.y1], r0[1]]];
  for (const [s, a, b, r] of ends) {
    const f = faces.find(x => x.s === s);
    if (!f) continue;
    G.poly([Q(a[0], a[1], H), Q(b[0], b[1], H), Q(r[0], r[1], H + P)], shade(MAT[p.mat] || "#888888", f.sh * K.nf));
    if (p.rose && K.lod !== "far") rose(K, f, H + P * 0.4, P);
  }
}
function ctx_lines(K, a, b, ra, rb, H, P, n) {
  const { ctx, Q } = K;
  ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 1; i < n; i++) {
    const k = i / n, A = Q(a[0] + (ra[0] - a[0]) * k, a[1] + (ra[1] - a[1]) * k, H + P * k), B = Q(b[0] + (rb[0] - b[0]) * k, b[1] + (rb[1] - b[1]) * k, H + P * k);
    ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]);
  }
  ctx.stroke();
}
function pyramidRoof(K, p, col) {
  const { Q, G } = K, H = p.h1, P = p.peak || 1, c = [(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2];
  const edges = [[[p.x0, p.y1], [p.x1, p.y1]], [[p.x1, p.y1], [p.x1, p.y0]], [[p.x1, p.y0], [p.x0, p.y0]], [[p.x0, p.y0], [p.x0, p.y1]]];
  const top = Q(c[0], c[1], H + P);
  // steep: only the faces towards us; drawn back first so the near ones win
  const vis = edges.map(([a, b]) => ({ a, b, sh: G.facing(a, b, c) })).sort((x, y) => x.sh - y.sh);
  for (const e of vis) G.poly([Q(e.a[0], e.a[1], H), Q(e.b[0], e.b[1], H), top], shade(col, (e.sh ? 0.85 + 0.35 * e.sh : 0.7) * K.nf));
  return top;
}
function barrelRoof(K, p, col, faces) {
  const { Q, G } = K, H = p.h1, P = p.peak || 1, N = K.lod === "far" ? 4 : 10;
  const alongY = p.ax === "y";
  const at = (k) => (alongY ? p.x0 + (p.x1 - p.x0) * k : p.y0 + (p.y1 - p.y0) * k);
  const hh = (k) => H + P * Math.sin(Math.PI * k);
  const strips = [];
  for (let i = 0; i < N; i++) {
    const k0 = i / N, k1 = (i + 1) / N;
    const pts = alongY
      ? [[at(k0), p.y0, hh(k0)], [at(k1), p.y0, hh(k1)], [at(k1), p.y1, hh(k1)], [at(k0), p.y1, hh(k0)]]
      : [[p.x0, at(k0), hh(k0)], [p.x0, at(k1), hh(k1)], [p.x1, at(k1), hh(k1)], [p.x1, at(k0), hh(k0)]];
    const m = alongY ? [(at(k0) + at(k1)) / 2, p.y0] : [p.x0, (at(k0) + at(k1)) / 2];
    const [u, v] = rot(m[0], m[1], G.r);
    // lighter where the curve turns to the light (+u+v)
    const slope = Math.cos(Math.PI * (k0 + k1) / 2);
    const [du, dv] = (() => { const [a, b] = rot(0, 0, G.r), [c, d] = rot(alongY ? 1 : 0, alongY ? 0 : 1, G.r); return [c - a, d - b]; })();
    const lit = 1.1 - 0.35 * slope * (du + dv);
    strips.push({ d: u + v, pts, lit });
  }
  strips.sort((a, b) => a.d - b.d);
  for (const s of strips) G.poly(s.pts.map(q => Q(q[0], q[1], q[2])), shade(col, s.lit * K.nf), K.lod === "near" ? "rgba(0,0,0,0.25)" : null);
  // the arched ends
  for (const f of faces) {
    const endFace = alongY ? (f.s === "n" || f.s === "s") : (f.s === "e" || f.s === "w");
    if (!endFace) continue;
    const pts = [];
    for (let i = 0; i <= N; i++) { const k = i / N; pts.push(f.F(k, H + P * Math.sin(Math.PI * k))); }
    G.poly(pts, shade(MAT[p.mat] || "#888888", f.sh * K.nf));
    if (K.lod !== "far") { // a fan light in the arch
      const g = K.night && K.env.lit > 0.1 ? "#fcd34d" : "#4f6b7a";
      const q = []; for (let i = 0; i <= 8; i++) { const k = 0.2 + 0.6 * i / 8; q.push(f.F(k, H + P * 0.75 * Math.sin(Math.PI * k))); }
      G.poly(q, shade(g, K.night ? 1 : f.sh));
    }
  }
}
function sawRoof(K, p, col, glassCol) {
  const { Q, G } = K, H = p.h1, n = p.teeth || 5, P = 0.55;
  const alongX = p.ax !== "y";
  const teeth = [];
  for (let i = 0; i < n; i++) {
    const a = alongX ? p.x0 + (p.x1 - p.x0) * i / n : p.y0 + (p.y1 - p.y0) * i / n, b = alongX ? p.x0 + (p.x1 - p.x0) * (i + 1) / n : p.y0 + (p.y1 - p.y0) * (i + 1) / n;
    const [u, v] = alongX ? rot((a + b) / 2, p.y0, G.r) : rot(p.x0, (a + b) / 2, G.r);
    teeth.push({ a, b, d: u + v });
  }
  teeth.sort((x, y) => x.d - y.d);
  const lit = K.night && K.env.lit > 0.05;
  for (const { a, b } of teeth) {
    // the slope rises from a to b, then the glazed face drops at b
    const P3 = (s, w, h) => (alongX ? Q(s, w, h) : Q(w, s, h));
    const w0 = alongX ? p.y0 : p.x0, w1 = alongX ? p.y1 : p.x1;
    const glazing = [P3(b, w0, H), P3(b, w1, H), P3(b, w1, H + P), P3(b, w0, H + P)];
    const slope = [P3(a, w0, H), P3(a, w1, H), P3(b, w1, H + P), P3(b, w0, H + P)];
    const gFace = G.facing(alongX ? [b, w0] : [w0, b], alongX ? [b, w1] : [w1, b], alongX ? [a, (w0 + w1) / 2] : [(w0 + w1) / 2, a]);
    if (!gFace) G.poly(glazing, lit ? "#e8c56a" : shade(glassCol, 0.7 * K.nf));
    G.poly(slope, shade(col, 1.15 * K.nf), K.lod === "far" ? null : "rgba(0,0,0,0.3)");
    if (gFace) G.poly(glazing, lit ? "#f4d27a" : shade(glassCol, gFace * K.nf));
    // the tooth's end triangles
    for (const w of [w0, w1]) {
      const other = w === w0 ? w1 : w0;
      if (!G.facing(alongX ? [a, w] : [w, a], alongX ? [b, w] : [w, b], alongX ? [(a + b) / 2, other] : [other, (a + b) / 2])) continue;
      G.poly([P3(a, w, H), P3(b, w, H), P3(b, w, H + P)], shade(MAT[p.mat], 0.9 * K.nf));
    }
  }
}
// A cylinder (tanks, stacks, the containment): its visible side as shaded strips, then its cap.
function cylinder(K, c, col, capCol) {
  const { Q, G } = K, N = K.lod === "far" ? 8 : 16;
  const pts = Array.from({ length: N }, (_, k) => [c.cx + c.r * Math.cos(k / N * Math.PI * 2), c.cy + c.r * Math.sin(k / N * Math.PI * 2)]);
  const rOf = c.rOf || (() => c.r);
  const side = [];
  for (let k = 0; k < N; k++) {
    const a = pts[k], b = pts[(k + 1) % N], sh = G.facing(a, b, [c.cx, c.cy]);
    if (sh) side.push({ a, b, sh, k });
  }
  if (c.legs) {   // the water tower stands on legs
    for (const q of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) K.line(Q(c.cx + q[0] * c.r * 0.7, c.cy + q[1] * c.r * 0.7, c.h0 - c.legs), Q(c.cx + q[0] * c.r * 0.7, c.cy + q[1] * c.r * 0.7, c.h0), "#2a2420", Math.max(1, K.z * 0.08));
  }
  for (const s of side) G.poly([Q(s.a[0], s.a[1], c.h1), Q(s.b[0], s.b[1], c.h1), Q(s.b[0], s.b[1], c.h0), Q(s.a[0], s.a[1], c.h0)], shade(col, s.sh * K.nf));
  if (c.bands && K.lod !== "far") for (const [h0, h1, bc] of c.bands) for (const s of side) G.poly([Q(s.a[0], s.a[1], h1), Q(s.b[0], s.b[1], h1), Q(s.b[0], s.b[1], h0), Q(s.a[0], s.a[1], h0)], shade(bc, s.sh * K.nf));
  const top = pts.map(q => Q(q[0], q[1], c.h1));
  if (c.cap === "cone") { const apex = Q(c.cx, c.cy, c.h1 + c.r * 0.9); for (const s of side) G.poly([Q(s.a[0], s.a[1], c.h1), Q(s.b[0], s.b[1], c.h1), apex], shade(capCol || col, (0.9 + 0.3 * s.sh) * K.nf)); G.poly(top, null, null); }
  else if (c.cap === "dome") {
    const rings = 4;
    for (let j = 0; j < rings; j++) {
      const a0 = j / rings * Math.PI / 2, a1 = (j + 1) / rings * Math.PI / 2;
      const r0 = Math.cos(a0), r1 = Math.cos(a1), h0 = c.h1 + Math.sin(a0) * c.r * 0.45, h1 = c.h1 + Math.sin(a1) * c.r * 0.45;
      for (const s of side) {
        const A = [c.cx + (s.a[0] - c.cx) * r0, c.cy + (s.a[1] - c.cy) * r0], B = [c.cx + (s.b[0] - c.cx) * r0, c.cy + (s.b[1] - c.cy) * r0];
        const C = [c.cx + (s.b[0] - c.cx) * r1, c.cy + (s.b[1] - c.cy) * r1], D = [c.cx + (s.a[0] - c.cx) * r1, c.cy + (s.a[1] - c.cy) * r1];
        G.poly([Q(A[0], A[1], h0), Q(B[0], B[1], h0), Q(C[0], C[1], h1), Q(D[0], D[1], h1)], shade(capCol || col, (1.05 + 0.25 * s.sh + 0.1 * j) * K.nf));
      }
    }
    G.poly(pts.map(q => Q(c.cx + (q[0] - c.cx) * 0.02, c.cy + (q[1] - c.cy) * 0.02, c.h1 + c.r * 0.45)), shade(capCol || col, 1.4 * K.nf));
  } else G.poly(top, shade(capCol || col, 1.3 * K.nf), K.lod === "far" ? null : "rgba(0,0,0,0.35)");
  return side;
}
// The cooling tower: a hyperboloid in rings, the rim, and the steam.
function coolingTower(K, c) {
  const { Q, G } = K, N = K.lod === "far" ? 10 : 18, R = 6;
  const rad = (k) => c.r * (1 - 0.32 * Math.sin(Math.PI * Math.min(1, k * 1.25)));   // waist two thirds up
  for (let j = 0; j < R; j++) {
    const k0 = j / R, k1 = (j + 1) / R, h0 = c.h0 + (c.h1 - c.h0) * k0, h1 = c.h0 + (c.h1 - c.h0) * k1, r0 = rad(k0), r1 = rad(k1);
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2, b = (i + 1) / N * Math.PI * 2;
      const pa = [c.cx + Math.cos(a), c.cy + Math.sin(a)], pb = [c.cx + Math.cos(b), c.cy + Math.sin(b)];
      const sh = G.facing(pa, pb, [c.cx, c.cy]);
      if (!sh) continue;
      G.poly([Q(c.cx + Math.cos(a) * r1, c.cy + Math.sin(a) * r1, h1), Q(c.cx + Math.cos(b) * r1, c.cy + Math.sin(b) * r1, h1), Q(c.cx + Math.cos(b) * r0, c.cy + Math.sin(b) * r0, h0), Q(c.cx + Math.cos(a) * r0, c.cy + Math.sin(a) * r0, h0)], shade(MAT.concrete, (sh * (j === 0 ? 0.8 : 1)) * K.nf));
    }
  }
  const rt = rad(1), ri = rt * 0.86;
  const ring = (r, h) => Array.from({ length: N }, (_, i) => Q(c.cx + Math.cos(i / N * Math.PI * 2) * r, c.cy + Math.sin(i / N * Math.PI * 2) * r, h));
  G.poly(ring(rt, c.h1), shade("#a9ada6", K.nf));
  G.poly(ring(ri, c.h1), K.night ? "rgba(34,211,238,0.35)" : "#2a2e2c");
  if (K.lod !== "far") { const [x, y] = Q(c.cx, c.cy, c.h1 - 0.8); K.ctx.fillStyle = "rgba(0,0,0,0.25)"; K.ctx.fillRect(x - 1, y, 2, 2); }
  smoke(K, [c.cx, c.cy], c.h1, strHash(K.env.bid + "cool"), { steam: true, r: c.r * 0.9, n: 7 });
}

// Smoke and steam: puffs rising and drifting north-east, growing and fading.
function smoke(K, at, h, seed, o = {}) {
  const { ctx, Q } = K, n = K.lod === "far" ? 4 : o.n || 6, t = K.t;
  const wind = [0.55, -0.45];
  for (let k = 0; k < n; k++) {
    const ph = frac(t * (o.steam ? 0.09 : 0.12) + k / n + (seed % 97) / 97);
    const x = at[0] + wind[0] * ph * 3.2 + Math.sin(k * 2.3 + seed) * 0.2, y = at[1] + wind[1] * ph * 3.2;
    const [sx, sy] = Q(x, y, h + ph * (o.steam ? 2.2 : 2.8));
    const r = K.z * ((o.r || 0.25) + ph * 1.1) * (o.steam ? 0.9 : 0.8);
    const a = (1 - ph) * (o.steam ? 0.42 : 0.5) * (K.night ? 0.6 : 1);
    ctx.fillStyle = o.steam ? `rgba(226,232,236,${a.toFixed(3)})` : `rgba(72,70,68,${a.toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
  }
}
// A glow: a soft disc of light (neon, lamps, the eye).
function glow(K, x, y, r, col) {
  const { ctx } = K;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
function rose(K, f, h, P) {
  const { G } = K, N = 12, r = Math.min(0.5, f.len * 0.12), rh = P * 0.28;
  const pts = Array.from({ length: N }, (_, i) => f.F(0.5 + r / f.len * Math.cos(i / N * Math.PI * 2), h + rh * Math.sin(i / N * Math.PI * 2), 0.01));
  G.poly(pts, K.night ? "#f0a8d8" : "#4a3a5a", "rgba(20,14,10,0.8)");
  if (K.night) { const c = f.F(0.5, h, 0.01); glow(K, c[0], c[1], K.z * 1.2, "rgba(240,168,216,0.35)"); }
}

// A door (and whoever is in it is drawn by CityIso). kind: plain | glass | arch | roller
function door(K, f, t, w, h, col, o = {}) {
  const hw = w / f.len / 2;
  const pts = f.q(t - hw, t + hw, 0, h, 0.01);
  if (o.arch) K.G.poly([pts[3], pts[0], f.F(t, h + o.arch, 0.01), pts[1], pts[2]], col, "rgba(0,0,0,0.5)");
  else K.G.poly(pts, col, K.lod === "near" ? "rgba(0,0,0,0.5)" : null);
  if (o.lit && K.night) { const c = f.F(t, h * 0.5, 0.05); glow(K, c[0], c[1], K.z * 0.9, "rgba(252,211,77,0.25)"); }
}

// ---- styles ---------------------------------------------------------------------------------
// Each: (K, p, faces, m) -> draws the part's walls, facade and roof. The generic box does most.
function boxPart(K, p, faces, m, deco) {
  const mat = MAT[p.mat] || "#777777";
  walls(K, p, faces, mat);
  if (K.lod === "far") {
    // far: a warm wash per storey where it is lit, the roof shape, the signs' glow
    if (K.night && K.env.lit > 0.08 && p.win !== "none") for (const f of faces) for (let s = Math.floor(p.h0); s < p.h1 - 0.5; s++) K.bq(`rgba(252,201,74,${Math.min(0.55, K.env.lit * 0.6).toFixed(2)})`, f.q(0.08, 0.92, s + 0.35, s + 0.7));
    K.flush();
    FAR[K.env.style]?.(K, p, faces);
  } else {
    deco.face?.(K, p, faces, m);
    K.flush();
  }
  const roofCol = ROOF[p.mat] || "#444444";
  if (p.roof === "gable") gableRoof(K, p, roofCol, faces);
  else if (p.roof === "pyramid") { const top = pyramidRoof(K, p, roofCol); p._top = top; }
  else if (p.roof === "barrel") barrelRoof(K, p, roofCol, faces);
  else if (p.roof === "saw") { flatRoof(K, p, roofCol, false); sawRoof(K, p, ROOF[p.mat] || "#555", "#5a7a8a"); }
  else if (p.roof !== "none") flatRoof(K, p, roofCol, p.mat !== "obsidian" && p.mat !== "plinth");
  deco.roof?.(K, p, faces, m);
  K.flush();
}

// Balconies, laundry, AC units, the odd broken pane: the projects.
function projectsFace(K, p, faces) {
  const near = K.lod === "near";
  for (const f of faces) {
    const long = f.len > 5;
    const bay = 1.35, cols = Math.max(1, Math.floor(f.len / bay));
    windowGrid(K, f, p, { bay, w: 0.62, y0: 0.32, y1: 0.74, broken: 0.07, from: 0, skip: (s, k) => s === 0 && long && Math.abs(k - (cols - 1) / 2) < 0.6 });
    K.flush();
    // the entrance, on the long front
    if (long && f.s === "s") {
      door(K, f, 0.5, 0.9, 0.7, "#1a1612", { lit: true });
      K.G.poly(f.q(0.5 - 0.7 / f.len, 0.5 + 0.7 / f.len, 0.78, 0.86, 0.3), shade("#9a958c", K.nf));
      if (near) faceText(K, f, 0.5, 0.94, K.env.name.replace("HAB BLOCK ", "BLOCK "), 0.08, "rgba(220,220,210,0.8)");
    }
    if (!long) {   // the stair tower's slot windows on the end walls
      for (let s = 0; s < p.h1; s++) K.bq(K.night ? "#6f7a52" : "#2e3a40", f.q(0.46, 0.54, s + 0.15, s + 0.85));
      K.flush();
      continue;
    }
    // balconies stacked up every third bay from the first floor: a concrete slab, its edge,
    // a railing you can see the flat through
    const slab = shade("#b3ada2", 1.15 * K.nf), edge = shade("#9a958c", f.sh * K.nf), rail = K.lod === "near" ? "rgba(24,24,26,0.35)" : shade("#6f6a64", f.sh * K.nf), cap = shade("#c9c4ba", f.sh * K.nf);
    const isBal = (k) => k % 3 === 1;
    for (let s = 1; s < p.h1; s++) for (let k = 0; k < cols; k++) {
      if (!isBal(k)) continue;
      const t0 = k / cols + 0.02, t1 = (k + 1) / cols - 0.02, D = 0.34;
      K.bq(slab, [f.F(t0, s, 0), f.F(t1, s, 0), f.F(t1, s, D), f.F(t0, s, D)]);
      K.bq(edge, f.q(t0, t1, s - 0.07, s, D));
      K.bq(rail, f.q(t0, t1, s, s + 0.32, D));
      K.bq(cap, f.q(t0, t1, s + 0.3, s + 0.35, D));
      // the balcony's side walls, so it reads as a box stuck on the slab
      K.bq(shade("#8f8a82", 0.8 * K.nf), [f.F(t1, s, 0), f.F(t1, s, D), f.F(t1, s + 0.35, D), f.F(t1, s + 0.35, 0)]);
    }
    K.flush();
    if (K.lod === "near") {
      const ctx = K.ctx;
      ctx.strokeStyle = shade("#cfcac0", K.nf); ctx.lineWidth = 1; ctx.beginPath();
      for (let s = 1; s < p.h1; s++) for (let k = 0; k < cols; k++) {
        if (!isBal(k)) continue;
        const t0 = k / cols + 0.02, t1 = (k + 1) / cols - 0.02;
        for (let i = 1; i < 6; i++) { const A = f.F(t0 + (t1 - t0) * i / 6, s, 0.34), B = f.F(t0 + (t1 - t0) * i / 6, s + 0.3, 0.34); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
      }
      ctx.stroke();
    }
    if (K.lod === "far") continue;
    // laundry on the lines, AC units under the sills, a satellite dish here and there
    const ctx = K.ctx;
    for (let s = 1; s < p.h1; s++) for (let k = 0; k < cols; k++) {
      const hsh = hi(strHash(K.env.bid), f.i, s, k);
      const t0 = k / cols + 0.06, t1 = (k + 1) / cols - 0.06;
      if (isBal(k) && hsh < 0.5 && near) {
        const A = f.F(t0, s + 0.66, 0.26), B = f.F(t1, s + 0.66, 0.26);
        ctx.strokeStyle = "rgba(200,200,190,0.6)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
        const cols2 = ["#e5e7eb", "#60a5fa", "#f87171", "#facc15", "#a78bfa", "#34d399"];
        for (let c = 0; c < 4; c++) {
          const tc = t0 + (t1 - t0) * (0.15 + c * 0.22), sway = K.t ? Math.sin(K.t * 2 + c + s) * 0.01 : 0;
          const col = cols2[Math.floor(hi(s, k, c, 3) * cols2.length)];
          K.bq(shade(col, 0.9 * K.nf), f.q(tc - 0.035 + sway, tc + 0.035 + sway, s + 0.44 + hi(c, s) * 0.08, s + 0.66, 0.26));
        }
      } else if (hsh > 0.7 && !isBal(k)) {
        // an AC unit in the window: its front, its top
        const tc = (k + 0.5) / cols, a = tc - 0.2 / f.len, b = tc + 0.2 / f.len;
        K.bq(shade("#c3c6bf", f.sh * K.nf), f.q(a, b, s + 0.2, s + 0.36, 0.14));
        K.bq(shade("#dadcd6", 1.2 * K.nf), [f.F(a, s + 0.36, 0), f.F(b, s + 0.36, 0), f.F(b, s + 0.36, 0.14), f.F(a, s + 0.36, 0.14)]);
        if (near) K.bq("rgba(0,0,0,0.35)", f.q(a + 0.05 / f.len, b - 0.05 / f.len, s + 0.24, s + 0.26, 0.141));
      } else if (hsh > 0.66 && near) {
        const c = f.F((k + 0.8) / cols, s + 0.8, 0.12);
        ctx.fillStyle = shade("#d4d4d0", K.nf); ctx.beginPath(); ctx.ellipse(c[0], c[1], K.z * 0.14, K.z * 0.2, -0.4, 0, Math.PI * 2); ctx.fill();
      }
    }
    K.flush();
    // graffiti along the ground floor
    if (near) for (let k = 0; k < 3; k++) {
      const t0 = 0.08 + hi(strHash(K.env.bid), k) * 0.7;
      const A = f.F(t0, 0.25, 0.01), B = f.F(t0 + 0.08, 0.45, 0.01), C = f.F(t0 + 0.14, 0.2, 0.01);
      ctx.strokeStyle = ["#f472b6", "#38bdf8", "#a3e635"][k]; ctx.lineWidth = Math.max(1, K.z * 0.06);
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.quadraticCurveTo(B[0], B[1], C[0], C[1]); ctx.stroke();
    }
  }
}
function projectsRoof(K, p) {
  if (K.lod !== "near") return;
  // TV aerials on the roof
  for (let k = 0; k < 3; k++) {
    const x = p.x0 + 1 + k * 2.6, y = p.y0 + 0.6;
    const A = K.Q(x, y, p.h1), B = K.Q(x, y, p.h1 + 0.5);
    K.line(A, B, "#565656", 1);
    const C = K.Q(x - 0.3, y, p.h1 + 0.42), D = K.Q(x + 0.3, y, p.h1 + 0.42);
    K.line(C, D, "#565656", 1);
  }
}

// The row houses: brownstone (stoop, bay, cornice) and walk-up (fire escape).
function rowFace(K, p, faces) {
  const walk = p.win === "walkup", near = K.lod === "near";
  for (const f of faces) {
    const front = f.s === "s";
    if (!front && f.len < 3.2 && f.s !== "n") {   // end walls: a few windows, a painted ad on a walk-up
      windowGrid(K, f, p, { bay: 1.1, w: 0.42, y0: 0.3, y1: 0.8, glass: "#34414a", sill: shade("#b9a88c", K.nf), from: 1 });
      K.flush();
      continue;
    }
    windowGrid(K, f, p, { bay: 0.78, w: 0.42, y0: 0.28, y1: 0.8, glass: "#35444e", sill: shade(walk ? "#c9b9a0" : "#9a8468", K.nf), from: front ? 1 : 0 });
    K.flush();
    if (!front) continue;
    // lintels over the upper windows
    if (K.lod !== "far") for (let s = 1; s < p.h1; s++) for (let k = 0; k < 3; k++) {
      const tc = (k + 0.5) / 3;
      K.bq(shade(walk ? "#c9b9a0" : "#8e7458", f.sh * K.nf), f.q(tc - 0.14, tc + 0.14, s + 0.8, s + 0.87, 0.02));
    }
    // ground floor: parlour windows, the door up the stoop
    const dt = walk ? 0.5 : 0.24;
    for (const tc of walk ? [0.2, 0.8] : [0.55, 0.82]) K.bq(winColour(K, hi(strHash(K.env.bid), p.house, tc * 10) < K.env.lit, true) || shade("#35444e", f.sh), f.q(tc - 0.09, tc + 0.09, walk ? 0.28 : 0.4, 0.82));
    K.flush();
    door(K, f, dt, 0.42, walk ? 0.72 : 0.84, walk ? "#2a1a14" : "#3a2216", { arch: walk ? 0 : 0.08, lit: true });
    // the stoop: steps out to the pavement, with its railings
    const steps = walk ? 2 : 5, sw = 0.24 / f.len;
    for (let i = 0; i < steps; i++) {
      const d0 = (walk ? 0.3 : 0.55) * (1 - i / steps), h = (i + 1) * (walk ? 0.06 : 0.07);
      K.G.poly([f.F(dt - sw, h, 0), f.F(dt + sw, h, 0), f.F(dt + sw, h, d0), f.F(dt - sw, h, d0)], shade(walk ? "#8f8980" : "#7c5a44", 1.2 * K.nf));
      K.G.poly(f.q(dt - sw, dt + sw, h - (walk ? 0.06 : 0.07), h, d0), shade(walk ? "#8f8980" : "#6a4c3a", f.sh * K.nf));
    }
    if (!walk && K.lod !== "far") {
      K.line(f.F(dt - sw, 0.4, 0.02), f.F(dt - sw, 0.1, 0.55), "#1c1a18", Math.max(1, K.z * 0.05));
      K.line(f.F(dt + sw, 0.4, 0.02), f.F(dt + sw, 0.1, 0.55), "#1c1a18", Math.max(1, K.z * 0.05));
      // the bay window on the parlour floor
      const b0 = 0.55, b1 = 0.9, D = 0.22;
      K.G.poly(f.q(b0, b1, 1, 2, D), shade(MAT.brownstone, f.sh * 1.05 * K.nf));
      for (const tc of [0.63, 0.82]) K.G.poly(f.q(tc - 0.06, tc + 0.06, 1.3, 1.8, D + 0.01), winColour(K, hi(p.house, 7, tc * 10) < K.env.lit, true) || shade("#35444e", f.sh));
      K.G.poly([f.F(b0, 2, 0), f.F(b1, 2, 0), f.F(b1, 2, D), f.F(b0, 2, D)], shade("#8e7458", 1.2 * K.nf));
    }
    // a walk-up's fire escape up the front: a landing per floor, railings, the ladders
    if (walk && K.lod !== "far") {
      const ctx = K.ctx, iron = K.night ? "#1a1d1f" : "#202426", w = Math.max(1, K.z * 0.05);
      for (let s = 1; s < p.h1; s++) {
        const D = 0.35, t0 = 0.12, t1 = 0.88, h = s + 0.02;
        K.G.poly([f.F(t0, h, 0), f.F(t1, h, 0), f.F(t1, h, D), f.F(t0, h, D)], "rgba(20,24,26,0.55)");
        K.line(f.F(t0, h + 0.35, D), f.F(t1, h + 0.35, D), iron, w);
        K.line(f.F(t0, h, D), f.F(t1, h, D), iron, w);
        if (near) { ctx.strokeStyle = iron; ctx.lineWidth = 1; ctx.beginPath(); for (let k = 0; k <= 8; k++) { const A = f.F(t0 + (t1 - t0) * k / 8, h, D), B = f.F(t0 + (t1 - t0) * k / 8, h + 0.35, D); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke(); }
        if (s + 1 < p.h1) K.line(f.F(s % 2 ? 0.3 : 0.7, h, D * 0.7), f.F(s % 2 ? 0.62 : 0.38, h + 1, D * 0.7), iron, w);
      }
    }
    // the cornice along the top
    if (p.cornice && K.lod !== "far") {
      const c = walk ? "#6e5a4c" : "#5a4230";
      K.G.poly(f.q(-0.01, 1.01, p.h1 - 0.16, p.h1, 0.14), shade(c, f.sh * 1.1 * K.nf));
      K.G.poly([f.F(-0.01, p.h1, 0), f.F(1.01, p.h1, 0), f.F(1.01, p.h1, 0.14), f.F(-0.01, p.h1, 0.14)], shade(c, 1.35 * K.nf));
      if (near) for (let k = 1; k < 8; k++) K.bq("rgba(0,0,0,0.3)", f.q(k / 8 - 0.008, k / 8 + 0.008, p.h1 - 0.3, p.h1 - 0.16, 0.02));
    }
  }
}
function rowRoof(K, p) {
  if (K.lod === "far") return;
  // a chimney stack or a skylight per house
  const x = p.x0 + (p.x1 - p.x0) * 0.3, y = p.y0 + 0.5;
  K.G.poly([K.Q(x, y, p.h1 + 0.35), K.Q(x + 0.3, y, p.h1 + 0.35), K.Q(x + 0.3, y + 0.25, p.h1 + 0.35), K.Q(x, y + 0.25, p.h1 + 0.35)], shade("#5a3a2c", 1.2 * K.nf));
  K.G.poly([K.Q(x, y + 0.25, p.h1 + 0.35), K.Q(x + 0.3, y + 0.25, p.h1 + 0.35), K.Q(x + 0.3, y + 0.25, p.h1), K.Q(x, y + 0.25, p.h1)], shade("#6a4434", K.nf));
}

// The lofts: tall arched windows, fire escapes on every third bay, the painted sign.
function loftFace(K, p, faces) {
  for (const f of faces) {
    const bay = 1.3, cols = Math.max(1, Math.floor(f.len / bay));
    windowGrid(K, f, p, { bay, w: 0.72, y0: 0.2, y1: 0.72, arch: 0.12, glass: "#3a4a52", sill: shade("#c4b8a2", K.nf) });
    K.flush();
    if (K.lod === "far") continue;
    if (f.s === "s" || f.s === "n") for (let k = 1; k < cols; k += 3) {
      const t0 = k / cols + 0.02, t1 = (k + 1) / cols - 0.02, iron = "#1c1f21", w = Math.max(1, K.z * 0.05);
      for (let s = 1; s < p.h1; s++) {
        K.G.poly([f.F(t0, s, 0), f.F(t1, s, 0), f.F(t1, s, 0.32), f.F(t0, s, 0.32)], "rgba(20,24,26,0.6)");
        K.line(f.F(t0, s + 0.33, 0.32), f.F(t1, s + 0.33, 0.32), iron, w);
        if (s + 1 < p.h1) K.line(f.F(t0 + 0.02, s, 0.25), f.F(t1 - 0.02, s + 1, 0.25), iron, w);
      }
    }
    if (f.s === "e" || f.s === "w") faceText(K, f, 0.5, p.h1 - 0.9, "LOFTS", 0.34, "rgba(230,220,200,0.35)");
    if (f.s === "s") { door(K, f, 0.5, 1.4, 0.9, "#2a2a28"); faceText(K, f, 0.5, 1.0, "THE ARCHIVE LOFTS", 0.1, "rgba(235,225,205,0.7)"); }
    if (p.cornice) K.G.poly(f.q(0, 1, p.h1 - 0.14, p.h1, 0.1), shade("#6a3a2a", f.sh * 1.15 * K.nf));
  }
}

// Glass: a curtain wall with its sky, mullions, the lit apartments at night; terraces, the pool.
function curtainFace(K, p, faces, m) {
  const { ctx, G } = K;
  for (const f of faces) {
    const pts = f.q(0, 1, p.h0, p.h1);
    const top = f.F(0.5, p.h1), bot = f.F(0.5, p.h0);
    const g = ctx.createLinearGradient(top[0], top[1], bot[0], bot[1]);
    if (K.night) { g.addColorStop(0, shade("#16324a", f.sh)); g.addColorStop(1, shade("#0c1a28", f.sh)); }
    else { g.addColorStop(0, shade("#9fd0ea", f.sh)); g.addColorStop(0.55, shade("#4a8ab0", f.sh)); g.addColorStop(1, shade("#2a5676", f.sh)); }
    G.poly(pts, g);
    if (K.lod === "far") continue;
    // reflections: a pale slant across the glass by day
    if (!K.night) {
      const o = (f.i * 0.23) % 1;
      K.bq("rgba(255,255,255,0.13)", [f.F(o, p.h1), f.F(Math.min(1, o + 0.25), p.h1), f.F(Math.min(1, o + 0.1), p.h0), f.F(Math.max(0, o - 0.15), p.h0)]);
    }
    // lit apartments
    const panel = 0.7, cols = Math.max(1, Math.round(f.len / panel));
    if (p.win === "curtain" && K.night) for (let s = Math.floor(p.h0); s < p.h1; s++) for (let k = 0; k < cols; k++) {
      const q = hi(K.env.bid, f.i * 31 + s, k);
      if (q < K.env.lit * 0.55) K.bq(q < K.env.lit * 0.12 ? "#bfe7f5" : hi(s, k, 5) < 0.35 ? "#ffe4a8" : "#f5c060", f.q(k / cols + 0.01, (k + 1) / cols - 0.01, s + 0.12, s + 0.9));
    }
    K.flush();
    // mullions and floor lines
    ctx.strokeStyle = K.night ? "rgba(120,170,200,0.25)" : "rgba(220,240,250,0.45)"; ctx.lineWidth = 1; ctx.beginPath();
    for (let k = 1; k < cols; k++) { const A = f.F(k / cols, p.h0), B = f.F(k / cols, p.h1); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
    for (let s = Math.ceil(p.h0); s < p.h1; s++) { const A = f.F(0, s), B = f.F(1, s); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
    ctx.stroke();
    if (p.win === "crown") { const A = f.F(0, p.h1 - 0.12), B = f.F(1, p.h1 - 0.12); K.line(A, B, K.night ? "#67e8f9" : "#cfeefa", Math.max(1, K.z * 0.1)); }
    // the podium: the lobby lit, the canopy on its posts
    if (p.podium && f.s === "s" && p.canopy) {
      const [cx0, cx1] = p.canopy, t0 = (cx0 - p.x0) / f.len, t1 = (cx1 - p.x0) / f.len;
      G.poly(f.q(t0 + 0.02, t1 - 0.02, 0, 0.9, 0.01), K.night ? "#f6d58a" : "#cfe4ea");
      door(K, f, (t0 + t1) / 2, 0.8, 0.8, "#1c2a30");
      for (const tc of [t0 + 0.01, t1 - 0.01]) K.line(f.F(tc, 0, 0.42), f.F(tc, 1.0, 0.42), "#b8a468", Math.max(1, K.z * 0.07));
      G.poly([f.F(t0, 1.0, 0), f.F(t1, 1.0, 0), f.F(t1, 1.0, 0.45), f.F(t0, 1.0, 0.45)], shade("#2a2a2a", 1.3 * K.nf));
      G.poly(f.q(t0, t1, 0.92, 1.0, 0.45), shade("#b8a468", K.nf));
      faceText(K, f, (t0 + t1) / 2, 0.96, "THE MERIDIAN", 0.055, "#f4e2a8", { d: 0.46 });
      if (K.night) { const c = f.F((t0 + t1) / 2, 0.2, 0.3); glow(K, c[0], c[1], K.z * 1.4, "rgba(255,220,150,0.3)"); }
    }
    if (p.ticker) ticker(K, f, p.h1 - 0.35, p.h1 - 0.02);
  }
}
function glassRoof(K, p) {
  const { G, Q, ctx } = K;
  if (p.pool && K.lod !== "far") {
    const [x0, y0, x1, y1] = p.pool, h = p.h1 + 0.01;
    G.poly([Q(x0 - 0.3, y0 - 0.3, h), Q(x1 + 0.3, y0 - 0.3, h), Q(x1 + 0.3, y1 + 0.3, h), Q(x0 - 0.3, y1 + 0.3, h)], shade("#c9bfa6", 1.15 * K.nf));
    G.poly([Q(x0, y0, h), Q(x1, y0, h), Q(x1, y1, h), Q(x0, y1, h)], K.night ? "#1aa0c8" : "#38bdf8", "rgba(255,255,255,0.6)");
    if (K.lod === "near") {
      ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1; ctx.beginPath();
      for (let k = 0; k < 4; k++) { const ph = frac(K.t * 0.1 + k / 4); const A = Q(x0 + (x1 - x0) * ph, y0 + 0.2, h), B = Q(x0 + (x1 - x0) * ph - 0.3, y1 - 0.2, h); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
      ctx.stroke();
      // loungers and umbrellas along the far side
      for (let k = 0; k < 4; k++) {
        const x = x0 + 0.5 + k * (x1 - x0 - 1) / 3, y = y1 + 0.15;
        G.poly([Q(x - 0.2, y, h + 0.05), Q(x + 0.2, y, h + 0.05), Q(x + 0.2, y + 0.12, h + 0.05), Q(x - 0.2, y + 0.12, h + 0.05)], "#f5f5f0");
      }
      for (const [x, y, c] of [[x0 + 0.4, y0 - 0.15, "#f472b6"], [x1 - 0.4, y0 - 0.15, "#fbbf24"]]) {
        K.line(Q(x, y, h), Q(x, y, h + 0.4), "#ddd", 1);
        const [sx, sy] = Q(x, y, h + 0.42); ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(sx, sy, K.z * 0.45, K.z * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (K.night) { const [sx, sy] = Q((x0 + x1) / 2, (y0 + y1) / 2, h); glow(K, sx, sy, K.z * 2.5, "rgba(56,189,248,0.25)"); }
  }
  if (p.terrace && K.lod !== "far") {
    // planters round the terrace edge, a glass balustrade
    const e = 0.15;
    for (let k = 0; k < 5; k++) {
      const x = p.x0 + e + (p.x1 - p.x0 - 2 * e) * k / 4;
      for (const y of [p.y0 + e, p.y1 - e]) {
        const [sx, sy] = Q(x, y, p.h1 + 0.1);
        ctx.fillStyle = shade(k % 2 ? "#2f7a3a" : "#3f9a48", K.nf); ctx.beginPath(); ctx.arc(sx, sy, Math.max(1.5, K.z * 0.22), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.strokeStyle = "rgba(200,235,250,0.5)"; ctx.lineWidth = 1; ctx.beginPath();
    for (const [a, b] of [[[p.x0, p.y1], [p.x1, p.y1]], [[p.x1, p.y1], [p.x1, p.y0]]]) { const A = Q(a[0], a[1], p.h1 + 0.2), B = Q(b[0], b[1], p.h1 + 0.2); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
    ctx.stroke();
  }
  if (p.umbrellas && K.lod !== "far") for (let k = 0; k < 3; k++) {
    const x = p.x0 + 0.8 + k * 1.4, y = (p.y0 + p.y1) / 2;
    const [sx, sy] = Q(x, y, p.h1 + 0.45);
    K.line(Q(x, y, p.h1), Q(x, y, p.h1 + 0.45), "#ccc", 1);
    ctx.fillStyle = ["#e11d48", "#f5f5f4", "#e11d48"][k]; ctx.beginPath(); ctx.ellipse(sx, sy, K.z * 0.42, K.z * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (p.antenna) {
    const cx = (p.x0 + p.x1) / 2, cy = (p.y0 + p.y1) / 2;
    K.line(Q(cx, cy, p.h1), Q(cx, cy, p.h1 + p.antenna), "#9aa4aa", Math.max(1, K.z * 0.06));
    const on = frac(K.t * 0.8) < 0.5 || !K.t;
    if (on) { const [x, y] = Q(cx, cy, p.h1 + p.antenna); K.ctx.fillStyle = "#ef4444"; K.ctx.fillRect(x - 1.5, y - 1.5, 3, 3); if (K.night) glow(K, x, y, K.z * 0.8, "rgba(239,68,68,0.5)"); }
  }
}

// The exchange's ticker: a black band, the tape scrolling across it.
const TAPE = "HVI ▲0.4   COMPLIANCE ▲2.1   DISSENT ▼9.9   WARMTH ▼0.3   OBEDIENCE FUTURES ▲7.7   APPEALS ▼4.0   SOYLENT ▲1.2   HOPE — SUSPENDED   ";
function ticker(K, f, h0, h1) {
  const { ctx, G } = K;
  const pts = f.q(0, 1, h0, h1, 0.02);
  G.poly(pts, "#07090a");
  if (K.lod === "far") { G.poly(f.q(0.05, 0.95, h0 + (h1 - h0) * 0.35, h0 + (h1 - h0) * 0.65, 0.021), "rgba(251,191,36,0.6)"); return; }
  const fpx = (h1 - h0) * STOREY * K.z * 0.7;
  if (fpx < 5) { G.poly(f.q(0.02, 0.98, h0 + (h1 - h0) * 0.3, h0 + (h1 - h0) * 0.7, 0.021), "rgba(251,191,36,0.55)"); return; }
  ctx.save();
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.clip();
  const A = f.F(0, (h0 + h1) / 2, 0.02), B = f.F(1, (h0 + h1) / 2, 0.02);
  let ex = B[0] - A[0], ey = B[1] - A[1];
  const L = Math.hypot(ex, ey); ex /= L; ey /= L;
  let ox = A[0], oy = A[1];
  if (ex < 0) { ex = -ex; ey = -ey; ox = B[0]; oy = B[1]; }
  ctx.transform(ex, ey, 0, 1, ox, oy);
  ctx.font = `${Math.round(fpx)}px 'Fira Mono', ui-monospace, Menlo, monospace`; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  const w = ctx.measureText(TAPE).width, off = -((K.t * 30) % w);
  for (let x = off; x < L; x += w) {
    // the tape in its colours: up green, down red, the rest amber
    let cx = x;
    for (const tok of TAPE.split(/(?<=\s{3})/)) {
      ctx.fillStyle = tok.includes("▲") ? "#4ade80" : tok.includes("▼") ? "#f87171" : "#fbbf24";
      ctx.fillText(tok, cx, 0);
      cx += ctx.measureText(tok).width;
    }
  }
  ctx.restore();
}
function officeFace(K, p, faces) {
  const { ctx } = K;
  for (const f of faces) {
    if (p.win === "colonnade") {
      // the exchange hall: a pale stone front, columns, a pediment line, the ticker above
      const n = Math.max(3, Math.floor(f.len / 1.1));
      for (let k = 0; k < n; k++) {
        const tc = (k + 0.5) / n;
        K.bq(winColour(K, hi(K.env.bid, k, 3) < K.env.lit, false) || shade("#2d3c46", f.sh), f.q(tc - 0.3 / n, tc + 0.3 / n, 0.35, 1.9));
        if (K.lod === "near") K.bq(shade("#ddd6c4", f.sh * K.nf), f.q(tc + 0.36 / n, tc + 0.5 / n, 0.1, 1.95, 0.08));
      }
      K.flush();
      K.G.poly(f.q(0, 1, 1.95, 2.1, 0.1), shade("#d8d0bc", f.sh * K.nf));
      ticker(K, f, 2.12, 2.45);
      if (f.s === "s") { door(K, f, 0.5, 1.2, 1.2, K.night ? "#3a3222" : "#1c2226"); faceText(K, f, 0.5, 1.5, "THE EXCHANGE", 0.12, "#e6dcc0", { d: 0.1 }); }
      continue;
    }
    // ribbon windows, a floor at a time; the offices light by who is at their desk
    const cols = Math.max(1, Math.floor(f.len / 0.55));
    for (let s = 0; s < p.h1; s++) {
      if (p.band && s === p.band) continue;
      K.bq(shade(K.night ? "#101820" : "#3a5870", f.sh), f.q(0.02, 0.98, s + 0.28, s + 0.82));
      for (let k = 0; k < cols; k++) if (hi(K.env.bid, f.i * 53 + s, k) < K.env.lit) K.bq(K.night ? "#e3f1f8" : "#b5ccd8", f.q(k / cols + 0.005, (k + 1) / cols - 0.005, s + 0.3, s + 0.8));
    }
    K.flush();
    if (K.lod !== "far") {
      ctx.strokeStyle = "rgba(170,195,210,0.3)"; ctx.lineWidth = 1; ctx.beginPath();
      for (let k = 1; k < Math.floor(f.len / 1.1); k++) { const t = k / Math.floor(f.len / 1.1), A = f.F(t, 0), B = f.F(t, p.h1); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
      ctx.stroke();
    }
    if (p.band) ticker(K, f, p.band + 0.15, p.band + 0.85);
    if (f.s === "s" && K.lod !== "far") { door(K, f, 0.5, 1.1, 0.8, "#10181e", { lit: true }); faceText(K, f, 0.5, p.h1 - 0.5, "RESERVE", 0.3, K.night ? "#fcd34d" : "#e2e8f0", K.night ? { glow: "rgba(252,211,77,0.3)" } : {}); }
  }
}

// The monolith: black glass, faint green seams, one eye that watches the plaza.
function monolithFace(K, p, faces) {
  const { ctx, G } = K;
  if (p.mat === "plinth") return;
  if (p.win === "leg") {
    // a leg of the portal: the obsidian's seams and lit edge, the lit soffit, the door on the west leg
    for (const f of faces) {
      K.line(f.F(0, p.h0), f.F(0, p.h1), "rgba(74,222,128,0.35)", 1);
      if (f.s === "s" && p.door) door(K, f, 0.5, 0.5, 1.0, "#020403", { lit: true });
    }
    return;
  }
  for (const f of faces) {
    // the portal: the tower's underside lit where the Loop runs through it
    if (p.portal) { const A = f.F(0, p.h0, 0.01), B = f.F(1, p.h0, 0.01); K.line(A, B, K.night ? "#86efac" : "rgba(74,222,128,0.8)", Math.max(1, K.z * 0.08)); }
    // seams
    if (K.lod !== "far") {
      ctx.strokeStyle = "rgba(74,222,128,0.12)"; ctx.lineWidth = 1; ctx.beginPath();
      const n = Math.round(f.len / 1.3);
      for (let k = 1; k < n; k++) { const A = f.F(k / n, p.h0), B = f.F(k / n, p.h1); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
      ctx.stroke();
    }
    // the edges catch the light
    K.line(f.F(0, p.h0), f.F(0, p.h1), "rgba(74,222,128,0.35)", 1);
    K.line(f.F(0, p.h1), f.F(1, p.h1), "rgba(74,222,128,0.5)", 1);
    // the eye band
    const e0 = p.eye, e1 = p.eye + 0.45;
    G.poly(f.q(0, 1, e0, e1, 0.01), K.night ? "#0c2a18" : "#0a1f13");
    G.poly(f.q(0, 1, e0 + 0.14, e1 - 0.14, 0.012), K.night ? "#22c55e" : "#16a34a");
    // the pupil: sweeps along the band, round the corner, back
    const sweep = 0.5 + 0.5 * Math.sin((K.t || 0) * 0.35);
    const tp = f.s === "s" || f.s === "n" ? sweep : 1 - sweep;
    const c = f.F(tp, (e0 + e1) / 2, 0.02);
    glow(K, c[0], c[1], K.z * (K.night ? 3.2 : 2), K.night ? "rgba(134,239,172,0.7)" : "rgba(134,239,172,0.45)");
    G.poly(f.q(Math.max(0, tp - 0.06), Math.min(1, tp + 0.06), e0 + 0.08, e1 - 0.08, 0.02), "#dcfce7");
    if (f.s === "s" && K.lod !== "far") faceText(K, f, 0.5, p.portal ? p.h0 + 1.2 : 1.2, "DEPARTMENT", 0.22, "rgba(74,222,128,0.55)");
    if (f.s === "s" && !p.portal) door(K, f, 0.5, 1.6, 1.0, "#020403", {});
  }
}
function monolithRoof(K, p) {
  if (p.mat === "plinth" || !K.night) return;
  // the searchlight: a cold beam swept across the plaza from the roof
  const { ctx, Q } = K, cx = (p.x0 + p.x1) / 2, cy = (p.y0 + p.y1) / 2;
  const a = (K.t || 0) * 0.25, tx = cx + Math.cos(a) * 11, ty = cy + Math.sin(a) * 6;
  const S = Q(cx, cy, p.h1 + 0.3), A = Q(tx - 1.2 * Math.sin(a), ty + 1.2 * Math.cos(a), 0), B = Q(tx + 1.2 * Math.sin(a), ty - 1.2 * Math.cos(a), 0);
  const g = ctx.createLinearGradient(S[0], S[1], (A[0] + B[0]) / 2, (A[1] + B[1]) / 2);
  g.addColorStop(0, "rgba(200,255,220,0.28)"); g.addColorStop(1, "rgba(200,255,220,0.04)");
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(S[0], S[1]); ctx.lineTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.closePath(); ctx.fill();
  const [gx, gy] = Q(tx, ty, 0);
  ctx.fillStyle = "rgba(200,255,220,0.12)"; ctx.beginPath(); ctx.ellipse(gx, gy, K.z * 1.6, K.z * 0.8, 0, 0, Math.PI * 2); ctx.fill();
}

// Collegiate gothic: pointed windows, ivy, the clock, the belfry.
function gothicFace(K, p, faces) {
  const { ctx } = K;
  for (const f of faces) {
    if (p.win === "belfry") {
      for (const tc of [0.3, 0.7]) { K.G.poly([f.F(tc - 0.14, p.h0 + 0.1), f.F(tc + 0.14, p.h0 + 0.1), f.F(tc + 0.14, p.h0 + 0.65), f.F(tc, p.h0 + 0.85), f.F(tc - 0.14, p.h0 + 0.65)], "#0a0a0a"); }
      if (K.lod !== "far") { const c = f.F(0.5, p.h0 + 0.45, -0.3); ctx.fillStyle = shade("#c8a040", K.nf); ctx.beginPath(); ctx.arc(c[0], c[1], K.z * 0.2, 0, Math.PI * 2); ctx.fill(); }
      continue;
    }
    windowGrid(K, f, p, { bay: 1.0, w: 0.34, y0: 0.22, y1: 0.66, arch: 0.18, glass: "#2c3a44", sill: shade("#cdb88a", K.nf) });
    K.flush();
    // buttresses between the bays
    if (K.lod !== "far" && f.len > 3) { const n = Math.floor(f.len / 2); for (let k = 1; k < n; k++) K.bq(shade("#9a845c", f.sh * K.nf), f.q(k / n - 0.012, k / n + 0.012, 0, p.h1 - 0.2, 0.12)); K.flush(); }
    if (p.door === f.s) door(K, f, 0.5, 0.8, 0.9, "#2a1c12", { arch: 0.25, lit: true });
    if (p.clock && K.lod !== "far") clockFace(K, f, p.clock);
    // ivy climbing from the ground
    if (p.ivy && K.lod !== "far") {
      const seed = strHash(K.env.bid) + f.i * 7;
      for (let k = 0; k < 6; k++) {
        const t0 = hi(seed, k) * 0.9, w = 0.06 + hi(seed, k, 1) * 0.12, top = 0.8 + hi(seed, k, 2) * (p.h1 - p.h0) * 0.7;
        for (let j = 0; j < 5; j++) {
          const h = p.h0 + top * (j / 5), dx = Math.sin(j * 1.7 + k) * 0.03;
          K.bq(j % 2 ? shade("#2f6b32", K.nf) : shade("#3c7f3a", K.nf), f.q(t0 + dx, Math.min(1, t0 + w + dx), h, h + top / 5 + 0.05, 0.01));
        }
      }
      K.flush();
    }
  }
}
function clockFace(K, f, h) {
  const { ctx } = K, N = 20, r = Math.min(0.75, f.len * 0.34), rh = r / STOREY * 1.9;
  const ring = (k) => Array.from({ length: N }, (_, i) => f.F(0.5 + k * r / f.len * Math.cos(i / N * Math.PI * 2), h + k * rh * Math.sin(i / N * Math.PI * 2), 0.02));
  K.G.poly(ring(1.12), shade("#8a7040", K.nf));
  K.G.poly(ring(1), K.night ? "#fdf3c7" : "#f1ecdf");
  if (K.night) { const c = f.F(0.5, h, 0.02); glow(K, c[0], c[1], K.z * 1.6, "rgba(253,243,199,0.3)"); }
  const mt = K.env.hour;
  const hand = (frac2, len, w) => { const a = frac2 * Math.PI * 2; K.line(f.F(0.5, h, 0.03), f.F(0.5 + Math.sin(a) * len * r / f.len, h + Math.cos(a) * len * rh, 0.03), "#1a1a1a", w); };
  if (K.lod === "near") for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; K.line(f.F(0.5 + Math.sin(a) * 0.85 * r / f.len, h + Math.cos(a) * 0.85 * rh, 0.03), f.F(0.5 + Math.sin(a) * 0.95 * r / f.len, h + Math.cos(a) * 0.95 * rh, 0.03), "#333", 1); }
  hand((mt % 12) / 12, 0.55, Math.max(1, K.z * 0.08));
  hand((mt % 1), 0.85, Math.max(1, K.z * 0.05));
  void ctx;
}
function labRoof(K, p) {
  if (!p.fumes || K.lod === "far") return;
  for (let k = 0; k < 3; k++) {
    const x = p.x0 + 1.5 + k * 2.5, y = p.y0 + 0.5;
    cylinder(K, { cx: x, cy: y, r: 0.15, h0: p.h1, h1: p.h1 + 1.1, mat: "tank" }, "#9aa3a8");
    if (K.lod === "near" && k === 1) smoke(K, [x, y], p.h1 + 1.1, 11 + k, { steam: true, r: 0.1, n: 4 });
  }
}

// The Strip: neon, the marquee, the diner.
function stripFace(K, p, faces) {
  const { ctx } = K;
  const style = K.env.style;
  for (const f of faces) {
    const front = f.s === "s";
    if (style === "casino") {
      // gold pilasters, the walls between them patterned; neon stripes that chase upward
      const n = Math.max(2, Math.floor(f.len / 1.6));
      for (let k = 0; k <= n; k++) K.bq(shade("#c9a043", f.sh * K.nf), f.q(k / n - 0.015, k / n + 0.015, 0, p.h1));
      K.flush();
      for (let k = 0; k < n; k++) {
        const tc = (k + 0.5) / n, on = neonOn(K, k + f.i * 7, 0.02);
        const cols = ["#f472b6", "#a78bfa", "#fbbf24", "#22d3ee"];
        const c = cols[(k + Math.floor(K.t * 2)) % cols.length];
        const A = f.F(tc, 1.4, 0.03), B = f.F(tc, p.h1 - 0.25, 0.03);
        if (K.night) { ctx.globalAlpha = 0.35 * on; K.line(A, B, c, Math.max(3, K.z * 0.35)); }
        ctx.globalAlpha = on; K.line(A, B, K.night ? c : shade(c, 0.6), Math.max(1, K.z * 0.1));
        ctx.globalAlpha = 1;
      }
      if (front) marquee(K, f, 0.2, 0.8, 1.05, "HOUSE EDGE // ALL WIN", "#fbbf24");
      if (front) door(K, f, 0.5, 1.6, 0.95, K.night ? "#f7d27a" : "#3a1a24");
      continue;
    }
    if (style === "diner") {
      // the diner below: chrome, a red band, the windows always lit; the newsroom above
      K.G.poly(f.q(0, 1, 0, 1.05, 0.01), shade("#c0c8ce", f.sh * K.nf));
      K.G.poly(f.q(0, 1, 0.18, 0.28, 0.012), shade("#c0392b", f.sh * K.nf));
      K.bq(K.night ? "#fde68a" : "#8fb3c2", f.q(0.04, 0.96, 0.36, 0.92, 0.012));
      K.flush();
      if (K.lod === "near") { ctx.strokeStyle = "rgba(60,60,60,0.6)"; ctx.lineWidth = 1; ctx.beginPath(); for (let k = 1; k < 8; k++) { const A = f.F(0.04 + 0.92 * k / 8, 0.36, 0.013), B = f.F(0.04 + 0.92 * k / 8, 0.92, 0.013); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke(); }
      windowGrid(K, f, { ...p, h0: 1.1 }, { bay: 0.9, w: 0.5, y0: 0.3, y1: 0.8, warm: false, glass: "#34414a", sill: shade("#c8b8a0", K.nf) });
      K.flush();
      if (front) {
        const on = neonOn(K, 17, 0.08);
        faceText(K, f, 0.3, 1.25, "DINER", 0.2, K.night ? `rgba(248,113,113,${on})` : "#a04a4a", { d: 0.06, glow: K.night ? `rgba(248,113,113,${0.4 * on})` : null });
        faceText(K, f, 0.74, 1.25, "OPEN 24H", 0.1, K.night ? "#67e8f9" : "#3c6a74", { d: 0.06, glow: K.night ? "rgba(103,232,249,0.35)" : null });
        door(K, f, 0.55, 0.45, 0.85, "#6a7a82");
      }
      if (p.cornice) K.G.poly(f.q(0, 1, p.h1 - 0.14, p.h1, 0.1), shade("#6a3a2a", f.sh * 1.15 * K.nf));
      continue;
    }
    // the Dive: small windows glowing, the neon over the door, a blade sign
    windowGrid(K, f, p, { bay: 1.2, w: 0.5, y0: 0.35, y1: 0.7, glass: "#2a2226", sill: shade("#6a5048", K.nf) });
    K.flush();
    if (front) {
      door(K, f, 0.3, 0.5, 0.8, "#1a0d10", { lit: true });
      const on = neonOn(K, 23, 0.12);
      faceText(K, f, 0.62, 1.1, "THE DIVE", 0.2, K.night ? `rgba(244,114,182,${on})` : "#8a4a6a", { d: 0.05, glow: K.night ? `rgba(244,114,182,${0.45 * on})` : null });
      faceText(K, f, 0.62, 0.55, "COCKTAILS // SCORED", 0.07, K.night ? `rgba(103,232,249,${neonOn(K, 29, 0.05)})` : "#3c6a74", { d: 0.05 });
      // the blade sign sticks out from the corner
      bladeSign(K, f, 0.92, 0.6, 2.1, "BAR", "#f472b6");
    }
    if (p.cornice) K.G.poly(f.q(0, 1, p.h1 - 0.14, p.h1, 0.1), shade("#3a2226", f.sh * 1.2 * K.nf));
  }
}
// A vertical sign on a bracket, sticking out of the face at t.
function bladeSign(K, f, t, h0, h1, text, col) {
  const { ctx, G } = K;
  const d0 = 0.08, d1 = 0.6;
  const pts = [f.F(t, h1, d0), f.F(t, h1, d1), f.F(t, h0, d1), f.F(t, h0, d0)];
  G.poly(pts, "#16080e", "rgba(0,0,0,0.6)");
  if (K.lod === "far") { if (K.night) { const c = f.F(t, (h0 + h1) / 2, (d0 + d1) / 2); glow(K, c[0], c[1], K.z * 1.2, col); } return; }
  const on = neonOn(K, strHash(text), 0.06);
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const h = h1 - (i + 0.5) * (h1 - h0) / n, c = f.F(t, h, (d0 + d1) / 2);
    const fpx = Math.min((h1 - h0) / n * STOREY * K.z * 0.8, K.z * 0.5 * 1.4);
    if (fpx < 4) continue;
    ctx.font = `bold ${Math.round(fpx)}px 'Fira Mono', ui-monospace, Menlo, monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (K.night) ctx.globalAlpha = on;
    ctx.fillStyle = K.night ? col : shade("#8a5a6a", 1); ctx.fillText(text[i], c[0], c[1]);
    ctx.globalAlpha = 1;
  }
  if (K.night) { const c = f.F(t, (h0 + h1) / 2, (d0 + d1) / 2); glow(K, c[0], c[1], K.z * 1.4 * on, "rgba(244,114,182,0.25)"); }
}
// A marquee: a canopy over the door with bulbs chasing round its edge and a lettered board.
function marquee(K, f, t0, t1, h, text, col) {
  const { ctx, G } = K, D = 0.45;
  G.poly([f.F(t0, h + 0.3, 0), f.F(t1, h + 0.3, 0), f.F(t1, h + 0.3, D), f.F(t0, h + 0.3, D)], shade("#2a1a10", 1.3 * K.nf));
  G.poly(f.q(t0, t1, h, h + 0.3, D), K.night ? "#fff7e0" : "#e8dcc0");
  faceText(K, f, (t0 + t1) / 2, h + 0.15, text, 0.11, "#1a1206", { d: D + 0.01 });
  if (K.lod === "far") return;
  // bulbs along the top and bottom edges, every third one lit in turn
  const n = Math.max(6, Math.round((t1 - t0) * f.len * 5));
  const step = Math.floor((K.t || 0) * 7);
  for (const hh of [h + 0.3, h]) for (let i = 0; i <= n; i++) {
    const on = !K.night ? (i % 3 === 0) : ((i + step) % 3 === 0);
    const [x, y] = f.F(t0 + (t1 - t0) * i / n, hh, D + 0.01);
    ctx.fillStyle = on ? (K.night ? "#fff1a8" : "#e8d9a0") : (K.night ? "#6a5020" : "#8a7a58");
    const r = Math.max(1, K.z * 0.07);
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  if (K.night) { const c = f.F((t0 + t1) / 2, h, D); glow(K, c[0], c[1] + K.z, K.z * 3, "rgba(255,230,150,0.3)"); }
  void col;
}
function stripRoof(K, p, faces) {
  const style = K.env.style, { ctx, Q } = K;
  if (style === "casino" && p.sign) {
    // the rooftop sign: a board on a frame, bulbs round it, the name in neon
    const f = faces.find(x => x.s === "s") || faces.find(x => x.s === "n");
    const y = f && f.s === "s" ? p.y1 - 1.2 : p.y0 + 1.2;
    const x0 = p.x0 + 0.8, x1 = p.x1 - 0.8, h0 = p.h1 + 0.25, h1 = p.h1 + 1.3;
    for (const x of [x0 + 0.5, (x0 + x1) / 2, x1 - 0.5]) K.line(Q(x, y, p.h1), Q(x, y, h0), "#3a3a3a", Math.max(1, K.z * 0.07));
    const face = { F: (t, h, d = 0) => Q(x0 + (x1 - x0) * t, y + d, h), len: x1 - x0 };
    const pts = [face.F(0, h1), face.F(1, h1), face.F(1, h0), face.F(0, h0)];
    K.G.poly(pts, "#1a0a16", "#c9a043");
    const on = neonOn(K, 41, 0.03);
    faceText(K, face, 0.5, (h0 + h1) / 2, p.sign, 0.36, K.night ? `rgba(251,191,36,${on})` : "#b08a3a", { glow: K.night ? `rgba(251,113,133,${0.5 * on})` : null });
    if (K.lod !== "far") {
      const n = 22, step = Math.floor((K.t || 0) * 8);
      for (let i = 0; i < n; i++) for (const h of [h0, h1]) {
        const [sx, sy] = face.F(i / (n - 1), h);
        ctx.fillStyle = (i + step) % 4 === 0 && K.night ? "#fff7c2" : K.night ? "#7a5a20" : "#b8a068";
        ctx.fillRect(sx - 1, sy - 1, 2, 2);
      }
    }
    if (K.night) { const [sx, sy] = face.F(0.5, (h0 + h1) / 2); glow(K, sx, sy, K.z * 5, "rgba(251,113,133,0.22)"); }
  }
  if (style === "diner" && p.roofSign && K.lod !== "far") {
    const x0 = p.x0 + 2, y = p.y0 + 1.2, h0 = p.h1 + 0.1;
    const face = { F: (t, h, d = 0) => Q(x0 + 4 * t, y + d, h), len: 4 };
    for (const t of [0.1, 0.9]) K.line(face.F(t, p.h1), face.F(t, h0 + 0.2), "#555", 1);
    faceText(K, face, 0.5, h0 + 0.45, p.roofSign, 0.35, K.night ? "#e2e8f0" : "#cbd5e1", { stroke: "#222" });
  }
  if (style === "neon" && K.lod !== "far") {   // AC units and a vent on the roof
    for (const x of [p.x0 + 1.5, p.x0 + 3]) K.G.poly([Q(x, p.y0 + 0.8, p.h1 + 0.3), Q(x + 0.8, p.y0 + 0.8, p.h1 + 0.3), Q(x + 0.8, p.y0 + 1.4, p.h1 + 0.3), Q(x, p.y0 + 1.4, p.h1 + 0.3)], shade("#8a8a86", K.nf));
  }
}

// Arts: the gallery's banners, the theatre's marquee, the café's awning, the sound stages.
function artsFace(K, p, faces) {
  const { ctx } = K, style = K.env.style;
  for (const f of faces) {
    const front = f.s === "s";
    if (p.win === "atrium") {
      K.G.poly(f.q(0, 1, 0, p.h1, 0.01), K.night ? "#f2d890" : shade("#9fc6d6", f.sh));
      ctx.strokeStyle = "rgba(40,50,60,0.5)"; ctx.lineWidth = 1; ctx.beginPath();
      for (let k = 1; k < 6; k++) { const A = f.F(k / 6, 0), B = f.F(k / 6, p.h1); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
      const A = f.F(0, 1), B = f.F(1, 1); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      if (front) { door(K, f, 0.5, 0.8, 0.8, "#2a3036"); faceText(K, f, 0.5, 1.6, "PERMITTED CULTURE", 0.1, "#1a1a1a"); }
      continue;
    }
    if (style === "gallery") {
      // a few tall slots; banners down the front
      windowGrid(K, f, p, { bay: 2.4, w: 0.25, y0: 0.2, y1: 0.9, glass: "#2d3942", from: 1 });
      K.flush();
      if (front && K.lod !== "far") {
        const cols = ["#dc2626", "#2563eb", "#eab308"];
        [0.12, 0.88, 0.5].forEach((tc, i) => {
          if (i === 2) return;
          K.G.poly(f.q(tc - 0.045, tc + 0.045, p.h1 - 2.8, p.h1 - 0.3, 0.06), shade(cols[i], f.sh * (K.night ? 0.8 : 1)));
          if (K.lod === "near") K.G.poly(f.q(tc - 0.03, tc + 0.03, p.h1 - 1.2, p.h1 - 0.9, 0.061), "rgba(255,255,255,0.8)");
        });
        faceText(K, f, 0.5, p.h1 - 0.45, "CENTRE FOR PERMITTED CULTURE", 0.1, "#3a3a38");
      }
      continue;
    }
    if (style === "theatre") {
      if (p.win === "none") { if (f.s !== "s" && K.lod !== "far") faceText(K, f, 0.5, 3.8, "STAGE DOOR", 0.1, "rgba(230,210,200,0.5)"); continue; }
      windowGrid(K, f, p, { bay: 1.4, w: 0.4, y0: 0.3, y1: 0.8, from: 1, glass: "#2a2226", arch: 0.1 });
      K.flush();
      if (front) {
        marquee(K, f, 0.15, 0.85, 1.05, "NOW SHOWING: COMPLIANCE, THE MUSICAL", "#fbbf24");
        door(K, f, 0.5, 1.8, 0.95, K.night ? "#f2c870" : "#2a1216");
        bladeSign(K, f, 0.06, 1.5, 2.95, "PLAY", "#fbbf24");
      }
      if (p.cornice) K.G.poly(f.q(0, 1, p.h1 - 0.14, p.h1, 0.1), shade("#4a1a24", f.sh * 1.2 * K.nf));
      continue;
    }
    if (style === "cafe") {
      windowGrid(K, f, p, { bay: 0.9, w: 0.45, y0: 0.3, y1: 0.8, from: 1, glass: "#34414a", sill: shade("#c8b8a0", K.nf) });
      K.flush();
      if (front) {
        K.G.poly(f.q(0.05, 0.95, 0.1, 0.85, 0.01), K.night ? "#f6d58a" : shade("#8fb3c2", f.sh));
        door(K, f, 0.5, 0.5, 0.85, "#2a1a10");
        // the striped awning
        const n = 14;
        for (let i = 0; i < n; i++) K.G.poly([f.F(0.04 + 0.92 * i / n, 1.0, 0), f.F(0.04 + 0.92 * (i + 1) / n, 1.0, 0), f.F(0.04 + 0.92 * (i + 1) / n, 0.86, 0.45), f.F(0.04 + 0.92 * i / n, 0.86, 0.45)], shade(i % 2 ? "#e8e2cc" : "#1f6b3a", 1.1 * K.nf));
        faceText(K, f, 0.5, 1.4, "THE GRIND", 0.18, K.night ? "#fde68a" : "#f5f0e0", { stroke: "#2a1a10", glow: K.night ? "rgba(253,230,138,0.3)" : null });
      }
      if (p.cornice) K.G.poly(f.q(0, 1, p.h1 - 0.12, p.h1, 0.08), shade("#6a3a2a", f.sh * 1.15 * K.nf));
      continue;
    }
    if (style === "studio") {
      // corrugated ribs, the big roller door, ON AIR over it
      if (K.lod !== "far") { ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 1; ctx.beginPath(); const n = Math.floor(f.len * 4); for (let k = 1; k < n; k++) { const A = f.F(k / n, 0), B = f.F(k / n, p.h1); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke(); }
      if (front) {
        K.G.poly(f.q(0.08, 0.35, 0, 1.5, 0.01), shade("#8a8a90", f.sh * K.nf));
        if (K.lod !== "far") { ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); for (let k = 1; k < 10; k++) { const A = f.F(0.08, 1.5 * k / 10, 0.012), B = f.F(0.35, 1.5 * k / 10, 0.012); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke(); }
        const on = K.env.hour >= 8 && K.env.hour < 20;
        faceText(K, f, 0.215, 1.72, "ON AIR", 0.12, on ? "#fecaca" : "#5a2a2a", { glow: on ? "rgba(239,68,68,0.6)" : null });
        faceText(K, f, 0.68, 1.2, "SOUND STAGES 1-4", 0.14, "rgba(240,240,240,0.7)");
        door(K, f, 0.9, 0.4, 0.8, "#1a1a1e");
      }
    }
  }
}

// The sports hall: tall glazing, the lettering, doors at the end.
function hallFace(K, p, faces) {
  for (const f of faces) {
    const long = f.len > 8;
    if (long) {
      const n = Math.floor(f.len / 1.2);
      for (let k = 0; k < n; k++) { const tc = (k + 0.5) / n; K.bq(winColour(K, hi(K.env.bid, k, f.i) < K.env.lit, false) || shade("#46606e", f.sh), f.q(tc - 0.3 / n, tc + 0.3 / n, 0.5, 1.8)); }
      K.flush();
    } else {
      K.G.poly(f.q(0.3, 0.7, 0, 0.9, 0.01), K.night ? "#f2d890" : shade("#8fb3c2", f.sh));
      faceText(K, f, 0.5, 1.4, "CONDITIONING", 0.16, "#e5e7eb");
    }
  }
}

// Archive: the classical hall, the vault.
function classicalFace(K, p, faces) {
  const { ctx, G } = K;
  for (const f of faces) {
    if (p.portico) {
      // steps, a row of columns, the entablature; the pediment is the gable end
      if (f.s !== "s") { G.poly(f.q(0, 1, 2.5, 3, 0), shade(MAT.limestone, f.sh * K.nf)); continue; }
      for (let i = 0; i < 3; i++) G.poly(f.q(-0.02, 1.02, i * 0.08, (i + 1) * 0.08, 0.25 - i * 0.08), shade("#b8ae94", (1.1 - i * 0.05) * K.nf));
      const n = 6;
      for (let k = 0; k < n; k++) {
        const tc = 0.08 + 0.84 * k / (n - 1);
        G.poly(f.q(tc - 0.028, tc + 0.028, 0.24, 2.5, 0.05), shade("#e4dcc6", f.sh * K.nf));
        if (K.lod === "near") G.poly(f.q(tc - 0.012, tc - 0.004, 0.3, 2.45, 0.051), "rgba(0,0,0,0.15)");
      }
      G.poly(f.q(0, 1, 2.5, 3, 0.02), shade("#d6ceb6", f.sh * K.nf));
      faceText(K, f, 0.5, 2.75, "RECORDS HALL // NOTHING IS DELETED", 0.1, "#4a4232", { d: 0.03 });
      continue;
    }
    windowGrid(K, f, p, { bay: 1.2, w: 0.38, y0: 0.2, y1: 0.85, glass: "#2d3942", sill: shade("#e0d8c0", K.nf), arch: 0.08 });
    K.flush();
    if (p.cornice && K.lod !== "far") G.poly(f.q(-0.005, 1.005, p.h1 - 0.2, p.h1, 0.12), shade("#d8cfb4", f.sh * 1.1 * K.nf));
  }
  void ctx;
}
function vaultFace(K, p, faces) {
  const { ctx, G } = K;
  for (const f of faces) {
    if (K.lod !== "far") { ctx.strokeStyle = "rgba(0,0,0,0.15)"; ctx.lineWidth = 1; ctx.beginPath(); for (let s = 1; s < 4; s++) { const A = f.F(0, s * p.h1 / 4), B = f.F(1, s * p.h1 / 4); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke(); }
    if (f.s !== "s") continue;
    // the door: a steel disc, bolts round it, the wheel
    const N = 24, r = 0.75, rh = r / STOREY * 2, h = 0.95;
    const disc = (k, d) => Array.from({ length: N }, (_, i) => f.F(0.5 + k * r / f.len * Math.cos(i / N * Math.PI * 2), h + k * rh * Math.sin(i / N * Math.PI * 2), d));
    G.poly(disc(1.15, 0.01), "#2a2e2c");
    G.poly(disc(1, 0.04), shade("#9ea8ad", f.sh * K.nf));
    G.poly(disc(0.8, 0.05), shade("#b8c2c7", f.sh * K.nf));
    if (K.lod !== "far") {
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, [x, y] = f.F(0.5 + 0.9 * r / f.len * Math.cos(a), h + 0.9 * rh * Math.sin(a), 0.05); ctx.fillStyle = "#4a5256"; ctx.fillRect(x - 1, y - 1, 2, 2); }
      const spin = (K.t || 0) * 0.05;
      for (let i = 0; i < 3; i++) { const a = spin + i / 3 * Math.PI; K.line(f.F(0.5 + 0.45 * r / f.len * Math.cos(a), h + 0.45 * rh * Math.sin(a), 0.06), f.F(0.5 - 0.45 * r / f.len * Math.cos(a), h - 0.45 * rh * Math.sin(a), 0.06), "#3a4246", Math.max(1, K.z * 0.08)); }
      faceText(K, f, 0.5, 1.8, "MEMORY VAULT", 0.13, "rgba(20,24,22,0.8)");
      faceText(K, f, 0.18, 1.0, "NOTHING LEAVES", 0.07, "rgba(250,204,21,0.8)");
    }
  }
}

// Commons: Ward 7, the chapel, the market, the school.
function civicFace(K, p, faces) {
  const { ctx, G } = K, style = K.env.style;
  for (const f of faces) {
    const front = f.s === "s";
    if (style === "hospital") {
      for (let s = 0; s < p.h1; s++) {
        K.bq(shade(K.night ? "#10232a" : "#5f9aa8", f.sh), f.q(0.03, 0.97, s + 0.3, s + 0.75));
        const cols = Math.floor(f.len / 0.6);
        for (let k = 0; k < cols; k++) if (hi(K.env.bid, s * 13 + f.i, k) < Math.max(0.35, K.env.lit)) K.bq(K.night ? "#e0f2f1" : "#a7cfd6", f.q(k / cols + 0.01, (k + 1) / cols - 0.01, s + 0.32, s + 0.73));
      }
      K.flush();
      if (front) {
        door(K, f, 0.3, 0.8, 0.8, K.night ? "#e0f2f1" : "#6a9aa6");
        faceText(K, f, 0.3, 0.9, "WARD 7 // TRIAGE", 0.08, "#b91c1c");
      }
      if (p.cross && K.lod !== "far" && (front || f.s === "e")) {
        const tc = front ? 0.78 : 0.5, h = p.h1 - 0.7, a = 0.08 * 5 / f.len, b = 0.26 * 5 / f.len;
        const col = K.night ? "#ff4d4d" : "#dc2626";
        G.poly(f.q(tc - a, tc + a, h - 0.45, h + 0.45, 0.04), col);
        G.poly(f.q(tc - b, tc + b, h - 0.14, h + 0.14, 0.04), col);
        if (K.night) { const c = f.F(tc, h, 0.05); glow(K, c[0], c[1], K.z * 2.4, "rgba(255,77,77,0.35)"); }
      }
      continue;
    }
    if (style === "chapel") {
      windowGrid(K, f, p, { bay: 1.1, w: 0.3, y0: 0.2, y1: 0.8, arch: 0.25, glass: K.night ? "#6a3a7a" : "#3a2e4a" });
      K.flush();
      if (front && f.len > 3) door(K, f, 0.5, 0.6, 0.85, "#2a1c12", { arch: 0.25, lit: true });
      continue;
    }
    if (style === "market") {
      windowGrid(K, f, p, { bay: 1.1, w: 0.6, y0: 0.3, y1: 0.8, from: 1, glass: "#3a3a36" });
      K.flush();
      if (front) {
        K.G.poly(f.q(0.03, 0.97, 0, 0.9, 0.01), K.night ? "#3a2a14" : "#2a241c");
        for (let k = 0; k < 3; k++) {
          const t0 = 0.05 + k * 0.31, t1 = t0 + 0.28, cols = [["#b91c1c", "#f1ede0"], ["#1d4ed8", "#f1ede0"], ["#15803d", "#f1ede0"]][k];
          for (let i = 0; i < 8; i++) K.G.poly([f.F(t0 + (t1 - t0) * i / 8, 1.0, 0), f.F(t0 + (t1 - t0) * (i + 1) / 8, 1.0, 0), f.F(t0 + (t1 - t0) * (i + 1) / 8, 0.85, 0.35), f.F(t0 + (t1 - t0) * i / 8, 0.85, 0.35)], shade(cols[i % 2], 1.05 * K.nf));
        }
        faceText(K, f, 0.5, 1.5, K.night ? "NIGHT MARKET" : "RATION MARKET", 0.16, K.night ? "#fde68a" : "#f5f0e0", { stroke: "#2a1a10", glow: K.night ? "rgba(253,230,138,0.35)" : null });
        if (K.night && K.lod !== "far") for (let i = 0; i <= 16; i++) { const [x, y] = f.F(i / 16, 0.84 + 0.05 * Math.sin(i), 0.37); ctx.fillStyle = i % 2 ? "#fde68a" : "#fb923c"; ctx.fillRect(x - 1.5, y - 1.5, 3, 3); glow(K, x, y, K.z * 0.5, "rgba(253,200,100,0.35)"); }
      }
      continue;
    }
    if (style === "school") {
      windowGrid(K, f, p, { bay: 0.8, w: 0.55, y0: 0.25, y1: 0.85, glass: "#3a4a55", sill: shade("#d8c8a8", K.nf), warm: false });
      K.flush();
      if (front) { door(K, f, 0.5, 0.6, 0.85, "#2a3a5a", { arch: 0.15 }); faceText(K, f, 0.5, 1.05, "SCHOOLHOUSE", 0.1, "#f1e8d0", { d: 0.02 }); }
    }
  }
}
function civicRoof(K, p, faces) {
  const { Q, G, ctx } = K, style = K.env.style;
  if (style === "hospital" && p.helipad && K.lod !== "far") {
    const cx = (p.x0 + p.x1) / 2, cy = (p.y0 + p.y1) / 2, r = 1.1, N = 20;
    G.poly(Array.from({ length: N }, (_, i) => Q(cx + r * Math.cos(i / N * Math.PI * 2), cy + r * Math.sin(i / N * Math.PI * 2), p.h1 + 0.02)), "#3a4046", "#f5f5f5");
    const [x, y] = Q(cx, cy, p.h1 + 0.02);
    ctx.font = `bold ${Math.max(6, Math.round(K.z * 0.9))}px 'Fira Mono', monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#f5f5f5"; ctx.fillText("H", x, y);
  }
  if (style === "school" && p.cupola && K.lod !== "far") {
    const cx = (p.x0 + p.x1) / 2, cy = (p.y0 + p.y1) / 2, h = p.h1 + (p.peak || 1) * 0.8;
    const c = { x0: cx - 0.3, y0: cy - 0.3, x1: cx + 0.3, y1: cy + 0.3, h0: h, h1: h + 0.6, peak: 0.5, mat: "redbrick" };
    for (const f of facesOf(c, K.G)) { G.poly(f.q(0, 1, c.h0, c.h1), shade("#e8e0d0", f.sh * K.nf)); G.poly(f.q(0.25, 0.75, c.h0 + 0.1, c.h1 - 0.1, 0.01), "#1a1a1a"); }
    pyramidRoof(K, c, "#4a3a2a");
  }
  void faces;
}
function chapelSpire(K, p) {
  if (!p._top || K.lod === "far") return;
  const [x, y] = p._top;
  K.line([x, y], [x, y - K.z * 0.9], "#c8a040", Math.max(1, K.z * 0.07));
  K.line([x - K.z * 0.25, y - K.z * 0.6], [x + K.z * 0.25, y - K.z * 0.6], "#c8a040", Math.max(1, K.z * 0.07));
}

// The Works: sheds, stacks, the reactor, racks, docks, tanks.
function worksFace(K, p, faces) {
  const { ctx, G } = K, style = K.env.style;
  for (const f of faces) {
    const front = f.s === "s";
    // corrugation
    if (K.lod === "near" && (p.mat === "rust" || p.mat === "panel")) { ctx.strokeStyle = "rgba(0,0,0,0.16)"; ctx.lineWidth = 1; ctx.beginPath(); const n = Math.floor(f.len * 5); for (let k = 1; k < n; k++) { const A = f.F(k / n, p.h0), B = f.F(k / n, p.h1); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke(); }
    if (p.win === "shed" || p.win === "canteen") {
      windowGrid(K, f, p, { bay: 1.1, w: 0.6, y0: 0.55, y1: 0.8, glass: "#3a4a4a", warm: p.win === "canteen" });
      K.flush();
      if (front || (p.door === "e" && f.s === "e")) {
        const n = Math.max(1, Math.floor(f.len / 2.2));
        for (let k = 0; k < n; k++) {
          const tc = (k + 0.5) / n, hw = 0.55 / f.len;
          G.poly(f.q(tc - hw, tc + hw, 0, 0.95, 0.01), shade("#7a7a70", f.sh * K.nf));
          if (K.lod !== "far") { ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 1; i < 6; i++) { const A = f.F(tc - hw, 0.95 * i / 6, 0.012), B = f.F(tc + hw, 0.95 * i / 6, 0.012); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke(); }
          if (K.lod === "near") { G.poly(f.q(tc - hw, tc - hw + 0.06, 0, 0.95, 0.013), "#eab308"); G.poly(f.q(tc + hw - 0.06, tc + hw, 0, 0.95, 0.013), "#eab308"); }
        }
        if (p.dock) { G.poly([f.F(0, 0.28, 0), f.F(1, 0.28, 0), f.F(1, 0.28, 0.35), f.F(0, 0.28, 0.35)], shade("#6a6a64", 1.2 * K.nf)); G.poly(f.q(0, 1, 0, 0.28, 0.35), shade("#4a4a46", f.sh * K.nf)); G.poly(f.q(0, 1, 0.24, 0.28, 0.351), "#eab308"); }
        if (p.sign) faceText(K, f, 0.5, 1.12, "SLAG CANTEEN // EAT", 0.12, K.night ? "#fdba74" : "#f5e6d0", { glow: K.night ? "rgba(253,186,116,0.35)" : null });
        if (K.lod !== "far" && style === "shed") faceText(K, f, 0.5, 1.6, "RECLAMATION", 0.14, "rgba(240,230,210,0.55)");
        if (K.lod !== "far" && style === "docks") faceText(K, f, 0.5, 1.18, "DATA DOCKS", 0.1, "rgba(240,230,210,0.55)");
      }
      continue;
    }
    if (p.win === "foundry") {
      // the doors glow orange: something is being poured
      const n = Math.max(1, Math.floor(f.len / 1.6));
      for (let k = 0; k < n; k++) {
        const tc = (k + 0.5) / n, hw = 0.4 / f.len, fl = 0.75 + 0.25 * Math.sin((K.t || 0) * 3 + k);
        G.poly(f.q(tc - hw, tc + hw, 0, 1.1, 0.01), `rgb(${Math.round(240 * fl)},${Math.round(110 * fl)},30)`);
        const c = f.F(tc, 0.5, 0.1);
        glow(K, c[0], c[1], K.z * (K.night ? 1.6 : 0.9), "rgba(251,146,60,0.45)");
      }
      if (front && K.lod !== "far") faceText(K, f, 0.5, 1.35, "FOUNDRY", 0.12, "rgba(250,220,190,0.6)");
      continue;
    }
    if (p.win === "vents") {
      const n = Math.max(2, Math.floor(f.len / 0.5));
      for (let k = 0; k < n; k++) if (k % 3 !== 1) K.bq(shade("#2e353a", f.sh * K.nf), f.q(k / n + 0.01, (k + 1) / n - 0.01, 0.4, p.h1 - 0.3));
      K.flush();
      if (K.lod !== "far") for (let k = 0; k < n; k += 3) for (let s = 0; s < 3; s++) {
        const on = hi(k, s, Math.floor((K.t || 0) * 3 + k)) < 0.6;
        const [x, y] = f.F((k + 1.5) / n, 0.3 + s * 0.9, 0.02);
        ctx.fillStyle = on ? (s % 2 ? "#22d3ee" : "#4ade80") : "#0c2a1a";
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
      if (front) { door(K, f, 0.12, 0.5, 0.8, "#1a2024"); if (K.lod !== "far") faceText(K, f, 0.55, p.h1 - 0.15, "CACHE FARM // DO NOT UNPLUG", 0.08, "rgba(220,230,235,0.6)"); }
      continue;
    }
    if (p.win === "greenhouse") {
      K.G.poly(f.q(0, 1, 0.2, p.h1, 0.01), K.night ? "rgba(217,70,239,0.55)" : "rgba(170,230,200,0.55)");
      ctx.strokeStyle = K.night ? "rgba(250,200,255,0.4)" : "rgba(230,255,240,0.6)"; ctx.lineWidth = 1; ctx.beginPath();
      const n = Math.floor(f.len / 0.4); for (let k = 1; k < n; k++) { const A = f.F(k / n, 0.2), B = f.F(k / n, p.h1); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
      ctx.stroke();
      if (K.night && front) { const c = f.F(0.5, 0.6, 0.1); glow(K, c[0], c[1], K.z * 3, "rgba(217,70,239,0.3)"); }
      continue;
    }
    if (p.win === "slit" || p.win === "cell") {
      const n = Math.max(2, Math.floor(f.len / (p.win === "cell" ? 0.55 : 1.2)));
      for (let s = 0; s < p.h1; s++) for (let k = 0; k < n; k++) {
        const tc = (k + 0.5) / n;
        const lit = hi(K.env.bid, s * 7 + f.i, k) < K.env.lit;
        const col = K.night ? (lit ? "#fde68a" : "#0a0c0c") : "#141818";
        if (p.win === "cell") K.bq(col, f.q(tc - 0.05 / n * 2, tc + 0.05 / n * 2, s + 0.3, s + 0.75));
        else K.bq(col, f.q(tc - 0.35 / n, tc + 0.35 / n, s + 0.5, s + 0.6));
      }
      K.flush();
      if (front) door(K, f, 0.5, 0.7, 0.8, "#2a2e2c");
      if (front && K.lod !== "far") faceText(K, f, 0.5, p.win === "cell" ? p.h1 - 0.25 : 1.2, p.win === "cell" ? "HOLDING CELLS" : "ENFORCEMENT", 0.1, "rgba(250,204,21,0.75)");
      if (p.flood && K.night && front) {
        const c = f.F(0.85, 1.6, 0.1), g0 = f.F(0.85, 0, 2.5);
        glow(K, c[0], c[1], K.z * 0.8, "rgba(255,255,230,0.8)");
        ctx.fillStyle = "rgba(255,255,220,0.1)"; ctx.beginPath(); ctx.ellipse(g0[0], g0[1], K.z * 2.2, K.z * 1.1, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}
function worksRoof(K, p, faces) {
  const { Q, G, ctx } = K;
  if (p.fans && K.lod !== "far") {
    // chillers: boxes with fans that turn
    for (let k = 0; k < 4; k++) {
      const x = p.x0 + 0.8 + k * 1.4, y = (p.y0 + p.y1) / 2, h = p.h1 + 0.3;
      const c = { x0: x - 0.5, y0: y - 0.5, x1: x + 0.5, y1: y + 0.5, h0: p.h1, h1: h };
      for (const f of facesOf(c, G)) G.poly(f.q(0, 1, c.h0, c.h1), shade("#8a9298", f.sh * K.nf));
      G.poly([Q(c.x0, c.y0, h), Q(c.x1, c.y0, h), Q(c.x1, c.y1, h), Q(c.x0, c.y1, h)], shade("#a7aeb2", K.nf));
      const [sx, sy] = Q(x, y, h);
      ctx.fillStyle = "#2a2e30"; ctx.beginPath(); ctx.ellipse(sx, sy, K.z * 0.38, K.z * 0.19, 0, 0, Math.PI * 2); ctx.fill();
      if (K.lod === "near") { const a = (K.t || 0) * 6 + k; ctx.strokeStyle = "#7a8286"; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < 3; i++) { const b = a + i * Math.PI * 2 / 3; ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(b) * K.z * 0.34, sy + Math.sin(b) * K.z * 0.17); } ctx.stroke(); }
    }
  }
  if (p.antenna) {
    const x = p.x1 - 0.6, y = p.y0 + 0.6;
    K.line(Q(x, y, p.h1), Q(x, y, p.h1 + p.antenna), "#8a9296", Math.max(1, K.z * 0.05));
    if (K.lod !== "far") for (let i = 1; i < 4; i++) K.line(Q(x - 0.2, y, p.h1 + p.antenna * i / 4), Q(x + 0.2, y, p.h1 + p.antenna * i / 4), "#8a9296", 1);
    if (frac((K.t || 0) * 0.7) < 0.5) { const [sx, sy] = Q(x, y, p.h1 + p.antenna); ctx.fillStyle = "#ef4444"; ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3); }
  }
  if (p.wire && K.lod !== "far") {
    // razor wire along the parapet: loops
    ctx.strokeStyle = "rgba(200,205,210,0.7)"; ctx.lineWidth = 1;
    for (const f of faces) {
      const n = Math.max(4, Math.round(f.len * 3));
      ctx.beginPath();
      for (let i = 0; i < n; i++) { const c = f.F((i + 0.5) / n, p.h1 + 0.12, -0.05), r = K.z * 0.08; ctx.moveTo(c[0] + r, c[1]); ctx.ellipse(c[0], c[1], r, r * 1.3, 0, 0, Math.PI * 2); }
      ctx.stroke();
    }
  }
  void faces;
}

// Far away, each type keeps the one thing that says what it is.
// ---- THE COAST and THE HEIGHTS (2026-09-30) ---------------------------------------------------
// One facade for the seaside and alpine buildings: shack windows and a screen door; stucco flats
// with balconies (and towels); the condo's glass bands; timber bunks; the chalets' glass gable
// ends; the lodge's big warm windows and its sign. Snow sits on every alpine roof.
function resortFace(K, p, faces) {
  const { ctx, G } = K, near = K.lod === "near";
  for (const f of faces) {
    const front = f.s === (p.door || "s");
    if (p.win === "shack") {
      if (front) { door(K, f, 0.3, 0.35, 0.8, "#3a2a1c"); windowGrid(K, f, p, { bay: f.len, w: 0.5, y0: 0.35, y1: 0.75, glass: "#3a5a64", skip: () => false }); }
      else windowGrid(K, f, p, { bay: 1.2, w: 0.45, y0: 0.35, y1: 0.7, glass: "#3a5a64" });
      if (near && front) { ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1; ctx.beginPath(); for (let k = 1; k < 6; k++) { const A = f.F(0, k * 0.18), B = f.F(1, k * 0.18); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke(); }   // clapboard
      continue;
    }
    if (p.win === "flats" || p.win === "alpine" || p.win === "bunk") {
      windowGrid(K, f, p, { bay: p.win === "bunk" ? 0.8 : 1.2, w: p.win === "bunk" ? 0.35 : 0.55, y0: 0.3, y1: 0.75, glass: p.win === "alpine" ? "#3a4c5a" : "#40596a", warm: true });
      K.flush();
      if (p.balconies && K.lod !== "far" && f.len > 3) {
        const cols = Math.max(1, Math.floor(f.len / 1.2));
        for (let st = Math.floor(p.h0) + 1; st < p.h1; st++) for (let k = 0; k < cols; k += 2) {
          const t0 = k / cols + 0.02, t1 = (k + 1) / cols - 0.02;
          G.poly([f.F(t0, st, 0), f.F(t1, st, 0), f.F(t1, st, 0.3), f.F(t0, st, 0.3)], shade(p.win === "alpine" ? "#6a4428" : "#e8e2d4", 1.1 * K.nf));
          if (near) { ctx.strokeStyle = p.win === "alpine" ? "#4a2e18" : "rgba(240,240,240,0.8)"; ctx.lineWidth = 1; ctx.beginPath(); const A = f.F(t0, st + 0.3, 0.3), B = f.F(t1, st + 0.3, 0.3); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); }
          if (p.towels && near && hi(K.env.bid, st, k) < 0.5) G.poly(f.q(t0 + 0.01, t0 + 0.04, st + 0.05, st + 0.28, 0.31), ["#ef4444", "#3b82f6", "#facc15", "#f472b6"][Math.floor(hi(K.env.bid, k, st) * 4)]);
        }
      }
      if (p.timberTop && K.lod !== "far") G.poly(f.q(0, 1, p.h1 - 1, p.h1, 0.01), shade("#6a4428", f.sh * K.nf));
      if (front) door(K, f, 0.5, 0.5, 0.85, p.win === "bunk" ? "#3a2616" : "#2a3a44");
      continue;
    }
    if (p.win === "bungalow") {
      windowGrid(K, f, p, { bay: 1.1, w: 0.55, y0: 0.35, y1: 0.75, glass: "#3a5a64", warm: true });
      K.flush();
      if (front) {
        door(K, f, 0.5, 0.45, 0.8, "#5a3a24");
        if (p.veranda && K.lod !== "far") {   // a veranda on posts, the roof of it
          G.poly([f.F(0.05, 0.25, 0), f.F(0.95, 0.25, 0), f.F(0.95, 0.25, 0.4), f.F(0.05, 0.25, 0.4)], shade("#a07850", 1.2 * K.nf));
          for (const t of [0.07, 0.5, 0.93]) K.line(f.F(t, 0, 0.38), f.F(t, 1.05, 0.38), "#e8e0d0", Math.max(1, K.z * 0.05));
          G.poly([f.F(0.03, 1.05, 0), f.F(0.97, 1.05, 0), f.F(0.97, 0.95, 0.45), f.F(0.03, 0.95, 0.45)], shade("#8a9a9c", 1.1 * K.nf));
        }
      }
      continue;
    }
    if (p.win === "condo") {
      // bands of blue glass and white slab edges; lit apartments at night
      for (let st = Math.floor(p.h0); st < p.h1 - 0.2; st++) {
        K.bq(shade("#e8ecee", f.sh * K.nf), f.q(0, 1, st, st + 0.12, 0.01));
        const lit = hi(K.env.bid, f.i, st) < K.env.lit;
        K.bq(K.night ? (lit ? "#fcd9a0" : "#12202c") : shade("#4f8cb0", f.sh), f.q(0.02, 0.98, st + 0.14, st + 0.95, 0.005));
      }
      K.flush();
      if (front && p.h0 === 0) door(K, f, 0.25, 0.6, 0.9, "#1a2a34", { lit: true });
      continue;
    }
    if (p.win === "crown") { K.bq(K.night ? "#67e8f9" : "#cfeefa", f.q(0, 1, p.h1 - 0.15, p.h1 - 0.05, 0.01)); K.flush(); continue; }
    if (p.win === "lodge") {
      // big warm windows, the fire behind them, the sign over the door
      const n = Math.max(2, Math.floor(f.len / 1.6));
      for (let k = 0; k < n; k++) { const tc = (k + 0.5) / n, hw = 0.5 / f.len; G.poly(f.q(tc - hw, tc + hw, 0.3, 1.5, 0.01), K.night ? "#fdba74" : shade("#4a5a64", f.sh)); }
      if (K.night && front) { const c = f.F(0.5, 0.8, 0.2); glow(K, c[0], c[1], K.z * 3, "rgba(253,186,116,0.35)"); }
      if (front) { door(K, f, 0.5, 0.7, 1.2, "#3a2414"); if (p.sign && K.lod !== "far") faceText(K, f, 0.5, 1.75, p.sign, 0.2, K.night ? "#fde68a" : "#f5ead8", { glow: K.night ? "rgba(253,230,138,0.35)" : null }); }
      if (near) { ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1; ctx.beginPath(); for (let k = 1; k < 10; k++) { const A = f.F(0, k * 0.2), B = f.F(1, k * 0.2); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke(); }   // the logs
      continue;
    }
    if (p.win === "chalet") {
      if (front) {
        // the glass gable end: the great room's window up into the roof
        G.poly([f.F(0.12, 0.2, 0.01), f.F(0.88, 0.2, 0.01), f.F(0.88, p.h1, 0.01), f.F(0.5, p.h1 + (p.peak || 0) * 0.85, 0.01), f.F(0.12, p.h1, 0.01)], K.night ? (hi(K.env.bid, p.house || 0) < K.env.lit + 0.2 ? "#fcd34d" : "#1c2630") : shade("#5b87a0", f.sh));
        if (K.lod !== "far") { K.line(f.F(0.5, 0.2, 0.012), f.F(0.5, p.h1 + (p.peak || 0) * 0.8, 0.012), "#4a2e18", Math.max(1, K.z * 0.06)); K.line(f.F(0.12, 1, 0.012), f.F(0.88, 1, 0.012), "#4a2e18", Math.max(1, K.z * 0.06)); }
      } else windowGrid(K, f, p, { bay: 1.3, w: 0.5, y0: 0.35, y1: 0.75, glass: "#3a4c5a", warm: true });
      continue;
    }
  }
}
// Snow on a pitched roof: a white skin over the roof planes (the roof colour is already snow).
function resortRoof(K, p) {
  if (p.snow && K.lod === "near" && p.roof === "gable") {
    const { Q } = K, ridge = p.h1 + (p.peak || 0);
    const pts = p.ax === "x" ? [[p.x0, (p.y0 + p.y1) / 2], [p.x1, (p.y0 + p.y1) / 2]] : [[(p.x0 + p.x1) / 2, p.y0], [(p.x0 + p.x1) / 2, p.y1]];
    K.line(Q(pts[0][0], pts[0][1], ridge + 0.02), Q(pts[1][0], pts[1][1], ridge + 0.02), "rgba(255,255,255,0.9)", Math.max(1, K.z * 0.08));
  }
  if (p.pool && K.lod !== "far") { const [a, b, c, d] = p.pool; K.G.poly([K.Q(a, b, p.h1 + 0.01), K.Q(c, b, p.h1 + 0.01), K.Q(c, d, p.h1 + 0.01), K.Q(a, d, p.h1 + 0.01)], "#38bdf8", "rgba(255,255,255,0.6)"); }
  if (p.umbrellas && K.lod !== "far") for (let k = 0; k < 3; k++) { const x = p.x0 + (k + 0.5) * (p.x1 - p.x0) / 3, y = (p.y0 + p.y1) / 2, [sx, sy] = K.Q(x, y, p.h1 + 0.45); K.ctx.fillStyle = ["#f97316", "#f5f5f4", "#0ea5e9"][k]; K.ctx.beginPath(); K.ctx.ellipse(sx, sy, K.z * 0.35, K.z * 0.15, 0, 0, Math.PI * 2); K.ctx.fill(); }
}

const FAR = {
  monolith: (K, p, faces) => { if (p.eye) for (const f of faces) K.G.poly(f.q(0, 1, p.eye + 0.1, p.eye + 0.4, 0.01), "#4ade80"); },
  casino: (K, p, faces) => { for (const f of faces) for (let k = 0; k < 6; k++) K.G.poly(f.q(k / 6 + 0.05, k / 6 + 0.09, 1.3, p.h1 - 0.3, 0.01), K.night ? ["#f472b6", "#a78bfa", "#fbbf24"][k % 3] : "#c9a043"); },
  hospital: (K, p, faces) => { for (const f of faces) { K.G.poly(f.q(0.72, 0.84, p.h1 - 1.2, p.h1 - 0.3, 0.01), "#dc2626"); K.G.poly(f.q(0.64, 0.92, p.h1 - 0.9, p.h1 - 0.6, 0.01), "#dc2626"); } },
  office: (K, p, faces) => { if (p.band) for (const f of faces) K.G.poly(f.q(0, 1, p.band + 0.2, p.band + 0.8, 0.01), "#fbbf24"); },
  neon: (K, p, faces) => { const f = faces.find(x => x.s === "s"); if (f && K.night) K.G.poly(f.q(0.5, 0.75, 1, 1.25, 0.01), "#f472b6"); },
  diner: (K, p, faces) => { const f = faces.find(x => x.s === "s"); if (f) K.G.poly(f.q(0, 1, 0.2, 0.9, 0.01), K.night ? "#fde68a" : "#c0c8ce"); },
  theatre: (K, p, faces) => { const f = faces.find(x => x.s === "s"); if (f && p.marquee) K.G.poly(f.q(0.15, 0.85, 1, 1.35, 0.3), K.night ? "#fff1a8" : "#e8dcc0"); },
  projects: (K, p, faces) => { for (const f of faces) if (f.len > 5) for (let k = 1; k < Math.floor(f.len / 1.35); k += 3) { const c = Math.floor(f.len / 1.35); K.bq(shade("#b3ada2", 0.9 * K.nf), f.q(k / c, (k + 1) / c, 1, p.h1 - 0.2, 0.02)); } K.flush(); },
};

// ---- the body ------------------------------------------------------------------------------
const DECO = {
  projects: { face: projectsFace, roof: projectsRoof }, brownstone: { face: rowFace, roof: rowRoof }, lofts: { face: loftFace },
  glass: { face: curtainFace, roof: glassRoof }, office: { face: (K, p, f, m) => (p.mat === "glass" ? curtainFace(K, p, f, m) : officeFace(K, p, f, m)), roof: glassRoof },
  monolith: { face: monolithFace, roof: monolithRoof }, gothic: { face: gothicFace, roof: labRoof }, clocktower: { face: gothicFace, roof: chapelSpire },
  neon: { face: stripFace, roof: stripRoof }, casino: { face: stripFace, roof: stripRoof }, diner: { face: stripFace, roof: stripRoof },
  gallery: { face: artsFace }, theatre: { face: artsFace }, cafe: { face: artsFace }, studio: { face: artsFace }, hall: { face: hallFace },
  classical: { face: classicalFace }, vault: { face: vaultFace },
  hospital: { face: civicFace, roof: civicRoof }, chapel: { face: civicFace, roof: chapelSpire }, market: { face: civicFace }, school: { face: civicFace, roof: civicRoof },
  shed: { face: worksFace, roof: worksRoof }, stacks: { face: worksFace }, datahall: { face: worksFace, roof: worksRoof }, docks: { face: worksFace }, tanks: { face: worksFace },
  bunker: { face: worksFace, roof: worksRoof }, prison: { face: worksFace, roof: worksRoof }, canteen: { face: worksFace }, reactor: {},
  shacks: { face: resortFace, roof: resortRoof }, seawall: { face: resortFace, roof: resortRoof }, bungalow: { face: resortFace, roof: resortRoof }, seaview: { face: resortFace, roof: resortRoof },
  condo: { face: resortFace, roof: resortRoof }, bunkhouse: { face: resortFace, roof: resortRoof }, alpine: { face: resortFace, roof: resortRoof }, lodge: { face: resortFace, roof: resortRoof }, chalet: { face: resortFace, roof: resortRoof },
};
// the Arcade, the EB Shop, the EBTV station (funnelDraw.js), drawn with this file's kit
const FUNNEL_KIT = { shade, faceText, neonOn, windowGrid, door, bladeSign, glow, facesOf };
const FUNNEL = funnelDeco(FUNNEL_KIT);
Object.assign(DECO, FUNNEL.deco); Object.assign(FAR, FUNNEL.far);
// the Dept of Planning (venueDraw.js), with the same kit
const VENUE = venueDeco(FUNNEL_KIT);
Object.assign(DECO, VENUE.deco); Object.assign(FAR, VENUE.far);
// the Port and the Old Town (westDraw.js), with the kit and the row houses' own faces
const WEST_KIT = { ...FUNNEL_KIT, rowFace, rowRoof, clockFace, chapelSpire };
const WEST = westDeco(WEST_KIT);
Object.assign(DECO, WEST.deco); Object.assign(FAR, WEST.far);

const ORDERS = new Map();
// G: {ctx, Q, poly, facing, z, r}; env: {lod, night, hour, t, lit, bid (int), name, style}
// only: a set of part segments to draw (the monolith on the line draws its concourse, its pylons
// and its tower at different places in the painter's order); null draws every part.
export function drawBody(G, b, m, env, only = null) {
  const K = kit(G, env);
  const key = `${b.id}|${G.r}`;
  let order = ORDERS.get(key);
  if (!order) { order = partOrder(m.parts, rot, G.r); ORDERS.set(key, order); }
  const deco = DECO[m.style] || {};
  for (const i of order) {
    const p = m.parts[i];
    if (only && !only.has(p.seg ?? "base") && !only.has(i)) continue;
    if (p.k === "cyl") {
      if (p.cool) { coolingTower(K, p); continue; }
      const bands = p.mat === "stack" ? [[p.h1 - 0.7, p.h1 - 0.45, "#e5e5e5"], [p.h1 - 1.2, p.h1 - 0.95, "#e5e5e5"]] : p.warn ? [[0.2, 0.35, "#eab308"]] : null;
      cylinder(K, { ...p, bands }, MAT[p.mat] || MAT.concrete, p.mat === "wood" ? "#5a3a24" : null);
      if (p.smoke) smoke(K, [p.cx, p.cy], p.h1, strHash(b.id) + i);
      if (p.steam) smoke(K, [p.cx, p.cy], p.h1, strHash(b.id) + i, { steam: true, r: 0.15, n: 5 });
      if (p.warn && K.night) { const [x, y] = G.Q(p.cx, p.cy, p.h1 + p.r * 0.45); glow(K, x, y, K.z * 2, "rgba(34,211,238,0.3)"); }
      if (p.warn && K.lod !== "far") { const [x, y] = G.Q(p.cx, p.cy + p.r, 0.9); G.ctx.font = `bold ${Math.max(6, Math.round(K.z * 0.55))}px 'Fira Mono', monospace`; G.ctx.textAlign = "center"; G.ctx.textBaseline = "middle"; G.ctx.fillStyle = "#facc15"; G.ctx.fillText("☢", x, y); }
      continue;
    }
    const faces = facesOf(p, G);
    boxPart(K, p, faces, m, deco);
    if (p.steam) smoke(K, [p.x0 + (p.x1 - p.x0) * 0.8, p.y0 + 0.6], p.h1 + 0.2, strHash(b.id), { steam: true, r: 0.12, n: 4 });
  }
  return K;
}

// Where the front door is (map point just outside it), when its face is towards us; else null.
export function doorAt(G, m) {
  for (const p of m.parts) {
    if (!p.door || p.k !== "box") continue;
    const faces = facesOf(p, G), f = faces.find(x => x.s === p.door);
    if (!f) return null;
    const t = m.style === "brownstone" ? 0.24 : m.style === "neon" ? 0.3 : m.style === "hospital" ? 0.3 : m.style === "datahall" ? 0.12 : 0.5;
    const d = m.style === "brownstone" ? 0.7 : 0.35;
    return { x: f.a[0] + (f.b[0] - f.a[0]) * t + f.n[0] * d, y: f.a[1] + (f.b[1] - f.a[1]) * t + f.n[1] * d, along: [(f.b[0] - f.a[0]) / f.len, (f.b[1] - f.a[1]) / f.len] };
  }
  return null;
}

// ---- ground and yard ----------------------------------------------------------------------
export function drawArchGround(G, m, env) {
  const { ctx, Q } = G, far = env.lod === "far";
  const rect = (g, fill, stroke) => G.poly([Q(g.x0, g.y0, 0.01), Q(g.x1, g.y0, 0.01), Q(g.x1, g.y1, 0.01), Q(g.x0, g.y1, 0.01)], fill, stroke);
  const nf = env.night ? 0.7 : 1;
  for (const g of m.ground) {
    if (drawWestGround(G, g, env, shade)) continue;
    if (g.k === "court") {
      rect(g, shade("#3a4450", nf), null);
      if (far) continue;
      const cx = (g.x0 + g.x1) / 2, cy = (g.y0 + g.y1) / 2, L = (a, b) => { const A = Q(a[0], a[1], 0.012), B = Q(b[0], b[1], 0.012); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); };
      ctx.strokeStyle = "rgba(240,240,230,0.55)"; ctx.lineWidth = 1; ctx.beginPath();
      L([g.x0 + 0.15, g.y0 + 0.15], [g.x1 - 0.15, g.y0 + 0.15]); L([g.x1 - 0.15, g.y0 + 0.15], [g.x1 - 0.15, g.y1 - 0.15]); L([g.x1 - 0.15, g.y1 - 0.15], [g.x0 + 0.15, g.y1 - 0.15]); L([g.x0 + 0.15, g.y1 - 0.15], [g.x0 + 0.15, g.y0 + 0.15]);
      L([g.x0 + 0.15, cy], [g.x1 - 0.15, cy]);
      ctx.stroke();
      for (const y of [g.y0 + 0.15, g.y1 - 0.15]) G.poly([Q(cx - 0.45, y, 0.012), Q(cx + 0.45, y, 0.012), Q(cx + 0.45, y + (y < cy ? 0.9 : -0.9), 0.012), Q(cx - 0.45, y + (y < cy ? 0.9 : -0.9), 0.012)], "rgba(164,80,26,0.5)");
      // cracks, a stain
      if (env.lod === "near") { ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); L([g.x0 + 0.6, g.y0 + 1], [g.x0 + 1.1, g.y0 + 1.6]); L([g.x0 + 1.1, g.y0 + 1.6], [g.x0 + 0.9, g.y0 + 2.2]); ctx.stroke(); }
    } else if (g.k === "lawn" || g.k === "quad") {
      rect(g, shade("#1f4a22", nf), null);
      if (g.k === "quad" && !far) {
        ctx.strokeStyle = shade("#9a8a6a", nf); ctx.lineWidth = Math.max(1, G.z * 0.25); ctx.beginPath();
        const A = Q(g.x0, g.y0, 0.012), B = Q(g.x1, g.y1, 0.012), C = Q(g.x1, g.y0, 0.012), D = Q(g.x0, g.y1, 0.012);
        ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.moveTo(C[0], C[1]); ctx.lineTo(D[0], D[1]); ctx.stroke();
      }
    } else if (g.k === "plaza") {
      rect(g, g.dark ? shade("#18201c", 1) : shade("#4a4a46", nf), g.dark ? "rgba(74,222,128,0.12)" : null);
      if (!far) {
        ctx.strokeStyle = g.dark ? "rgba(74,222,128,0.06)" : "rgba(0,0,0,0.2)"; ctx.lineWidth = 1; ctx.beginPath();
        const st = g.dark ? 2 : 1;
        for (let x = g.x0 + st; x < g.x1; x += st) { const A = Q(x, g.y0, 0.012), B = Q(x, g.y1, 0.012); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
        for (let y = g.y0 + st; y < g.y1; y += st) { const A = Q(g.x0, y, 0.012), B = Q(g.x1, y, 0.012); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
        ctx.stroke();
        if (g.dark) {
          // lit strips converging on the monolith
          const cx = (g.x0 + g.x1) / 2, cy = (g.y0 + g.y1) / 2;
          ctx.strokeStyle = env.night ? "rgba(74,222,128,0.35)" : "rgba(74,222,128,0.18)"; ctx.lineWidth = Math.max(1, G.z * 0.08); ctx.beginPath();
          for (const [x, y] of [[g.x0, g.y0], [g.x1, g.y0], [g.x1, g.y1], [g.x0, g.y1]]) { const A = Q(x, y, 0.012), B = Q(cx + (x - cx) * 0.3, cy + (y - cy) * 0.3, 0.012); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
          ctx.stroke();
        }
      }
    } else if (g.k === "paving" || g.k === "pavement" || g.k === "apron" || g.k === "bay") {
      rect(g, shade(g.k === "bay" ? "#3a3e44" : g.k === "apron" ? "#3e3a34" : "#4a4944", nf), null);
      if (g.k === "bay" && !far) { ctx.strokeStyle = "rgba(250,204,21,0.6)"; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < 5; i++) { const A = Q(g.x0 + 0.2, g.y0 + 0.4 + i * 0.6, 0.012), B = Q(g.x1 - 0.2, g.y0 + 0.7 + i * 0.6, 0.012); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke(); }
    } else if (g.k === "sand" || g.k === "snow") {
      rect(g, shade(g.k === "sand" ? "#c9b27e" : "#dfe8ee", nf), null);
      if (!far) { ctx.fillStyle = g.k === "sand" ? "rgba(120,90,50,0.25)" : "rgba(150,170,190,0.3)"; for (let i = 0; i < 10; i++) { const [x, y] = Q(g.x0 + (g.x1 - g.x0) * frac(i * 0.618 + 0.1), g.y0 + (g.y1 - g.y0) * frac(i * 0.382 + 0.3), 0.012); ctx.fillRect(x, y, Math.max(1, G.z * 0.12), 1); } }
    } else if (g.k === "carpet") {
      rect(g, shade("#9b1c2c", nf), null);
    } else if (g.k === "playground") {
      rect(g, shade("#3a3f45", nf), null);
      if (!far) for (let i = 0; i < 6; i++) { const x = g.x0 + 0.6 + i * 0.45; G.poly([Q(x, g.y0 + 0.2, 0.012), Q(x + 0.35, g.y0 + 0.2, 0.012), Q(x + 0.35, g.y0 + 0.55, 0.012), Q(x, g.y0 + 0.55, 0.012)], null, "rgba(250,250,250,0.5)"); }
    }
  }
}

// A person, drawn by hand (the doorman, a guard): a few pixels at the scale of the sprites.
function figure(K, x, y, h, body, head, o = {}) {
  const { ctx } = K;
  const [sx, sy] = K.Q(x, y, h);
  const H = K.z * STOREY * 0.9, w = H * 0.28;
  if (H < 6) { ctx.fillStyle = body; ctx.fillRect(sx - 1, sy - 3, 2, 3); return; }
  ctx.fillStyle = "#1a1a1a"; ctx.fillRect(sx - w * 0.4, sy - H * 0.42, w * 0.3, H * 0.42); ctx.fillRect(sx + w * 0.1, sy - H * 0.42, w * 0.3, H * 0.42);
  ctx.fillStyle = body; ctx.fillRect(sx - w / 2, sy - H * 0.8, w, H * 0.42);
  if (o.arm) ctx.fillRect(sx + w / 2, sy - H * (0.8 + 0.12 * Math.max(0, Math.sin(K.t * 2))), w * 0.25, H * 0.35);
  ctx.fillStyle = head; ctx.fillRect(sx - w * 0.3, sy - H, w * 0.6, H * 0.2);
  if (o.cap) { ctx.fillStyle = o.cap; ctx.fillRect(sx - w * 0.38, sy - H * 1.04, w * 0.76, H * 0.09); }
}

export function drawYardProp(G, p, env) {
  const K = kit(G, env), { ctx, Q } = K, near = env.lod === "near", far = env.lod === "far", nf = K.nf;
  const vline = (x, y, h0, h1, col, w) => K.line(Q(x, y, h0), Q(x, y, h1), col, w);
  switch (p.k) {
    case "palm": {
      // a leaning trunk, fronds that sway a little
      const sway = env.t ? Math.sin(env.t * 0.8 + p.x) * 0.06 : 0;
      K.line(Q(p.x, p.y, 0), Q(p.x + 0.15 + sway, p.y - 0.1, 1.5), shade("#7a5a3a", nf), Math.max(1.5, K.z * 0.12));
      const [sx, sy] = Q(p.x + 0.15 + sway, p.y - 0.1, 1.5), r = K.z * 0.7;
      ctx.strokeStyle = shade("#2f8a3a", nf); ctx.lineWidth = Math.max(1.5, K.z * 0.14); ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + sway; ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + Math.cos(a) * r * 0.6, sy + Math.sin(a) * r * 0.3 - r * 0.3, sx + Math.cos(a) * r, sy + Math.sin(a) * r * 0.5 + r * 0.2); }
      ctx.stroke();
      break;
    }
    case "pine": {
      vline(p.x, p.y, 0, 0.3, shade("#4a3222", nf), Math.max(1, K.z * 0.1));
      for (let k = 0; k < 3; k++) {
        const h0 = 0.25 + k * 0.45, w = (0.42 - k * 0.1) * K.z * 1.4, [ax, ay] = Q(p.x, p.y, h0 + 0.7), [mx, my] = Q(p.x, p.y, h0);   // level on screen at every turn
        ctx.fillStyle = shade(k === 2 ? "#e8eef2" : "#1f4d2e", nf); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(mx - w, my); ctx.lineTo(mx + w, my); ctx.closePath(); ctx.fill();
      }
      break;
    }
    case "surfboard": case "skis": {
      const cols = p.k === "skis" ? ["#ef4444", "#1d4ed8"] : ["#f97316", "#22d3ee"];
      if (far) break;
      for (let k = 0; k < 2; k++) K.line(Q(p.x - 0.08 + k * 0.16, p.y, 0), Q(p.x - 0.05 + k * 0.16, p.y - 0.05, p.k === "skis" ? 0.8 : 1.0), cols[k], Math.max(1.5, K.z * (p.k === "skis" ? 0.06 : 0.14)));
      break;
    }
    case "umbrella": {
      vline(p.x, p.y, 0, 0.75, "#e5e5e5", Math.max(1, K.z * 0.04));
      const [sx, sy] = Q(p.x, p.y, 0.8);
      ctx.fillStyle = hi(Math.round(p.x * 10), Math.round(p.y * 10)) < 0.5 ? "#f97316" : "#0ea5e9"; ctx.beginPath(); ctx.ellipse(sx, sy, K.z * 0.4, K.z * 0.18, 0, Math.PI, 0); ctx.fill();
      break;
    }
    case "hottub": {
      const c = { x0: p.x - 0.4, y0: p.y - 0.4, x1: p.x + 0.4, y1: p.y + 0.4, h0: 0, h1: 0.3 };
      for (const f of facesOf(c, G)) G.poly(f.q(0, 1, 0, 0.3), shade("#6a4a30", f.sh * nf));
      G.poly([Q(c.x0 + 0.06, c.y0 + 0.06, 0.28), Q(c.x1 - 0.06, c.y0 + 0.06, 0.28), Q(c.x1 - 0.06, c.y1 - 0.06, 0.28), Q(c.x0 + 0.06, c.y1 - 0.06, 0.28)], env.night ? "#22d3ee" : "#38bdf8");
      if (!far) smoke(K, [p.x, p.y], 0.35, Math.round(p.x * 100), { steam: true, r: 0.12, n: 3 });
      break;
    }
    case "tree": {
      vline(p.x, p.y, 0, 0.5, shade("#4a3222", nf), Math.max(1, K.z * 0.12));
      const [sx, sy] = Q(p.x, p.y, 0.75), r = K.z * 0.75;
      ctx.fillStyle = shade("#24632c", nf); ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
      if (!far) { ctx.fillStyle = shade("#31803a", nf); ctx.beginPath(); ctx.arc(sx - r * 0.25, sy - r * 0.3, r * 0.6, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case "planter": {
      const c = { x0: p.x - 0.25, y0: p.y - 0.25, x1: p.x + 0.25, y1: p.y + 0.25, h0: 0, h1: 0.2 };
      for (const f of facesOf(c, G)) G.poly(f.q(0, 1, 0, 0.2), shade("#9a9488", f.sh * nf));
      const [sx, sy] = Q(p.x, p.y, 0.45); ctx.fillStyle = shade("#2f7a3a", nf); ctx.beginPath(); ctx.arc(sx, sy, K.z * 0.4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "hoop": {
      // a post, the backboard facing the court, the rim
      vline(p.x, p.y, 0, 0.7, "#8a9096", Math.max(1.5, K.z * 0.1));
      const dy = p.face === "s" ? 0.12 : -0.12;
      G.poly([Q(p.x - 0.3, p.y + dy, 0.8), Q(p.x + 0.3, p.y + dy, 0.8), Q(p.x + 0.3, p.y + dy, 0.55), Q(p.x - 0.3, p.y + dy, 0.55)], shade("#f1f2f0", nf), "rgba(0,0,0,0.5)");
      if (!far) G.poly([Q(p.x - 0.1, p.y + dy, 0.7), Q(p.x + 0.1, p.y + dy, 0.7), Q(p.x + 0.1, p.y + dy, 0.6), Q(p.x - 0.1, p.y + dy, 0.6)], null, "#ea580c");
      if (!far) { const [sx, sy] = Q(p.x, p.y + dy * 2.2, 0.57); ctx.strokeStyle = "#ea580c"; ctx.lineWidth = Math.max(1, K.z * 0.05); ctx.beginPath(); ctx.ellipse(sx, sy, K.z * 0.14, K.z * 0.07, 0, 0, Math.PI * 2); ctx.stroke();
        if (near) { ctx.strokeStyle = "rgba(240,240,240,0.5)"; ctx.beginPath(); ctx.moveTo(sx - K.z * 0.12, sy); ctx.lineTo(sx - K.z * 0.06, sy + K.z * 0.2); ctx.moveTo(sx + K.z * 0.12, sy); ctx.lineTo(sx + K.z * 0.06, sy + K.z * 0.2); ctx.stroke(); } }
      break;
    }
    case "fence": {
      // chain-link: posts, a top rail, the mesh as a cross-hatch
      const A0 = Q(p.ax, p.ay, 0), B0 = Q(p.bx, p.by, 0), A1 = Q(p.ax, p.ay, 0.55), B1 = Q(p.bx, p.by, 0.55);
      if (!far) { G.poly([A1, B1, B0, A0], "rgba(170,180,190,0.12)"); }
      K.line(A1, B1, "#8a949c", 1);
      vline(p.ax, p.ay, 0, 0.55, "#8a949c", Math.max(1, K.z * 0.05));
      if (near) {
        ctx.strokeStyle = "rgba(180,190,200,0.28)"; ctx.lineWidth = 1; ctx.beginPath();
        const n = 8;
        for (let i = 0; i <= n; i++) { const a = Q(p.ax + (p.bx - p.ax) * i / n, p.ay + (p.by - p.ay) * i / n, 0), b = Q(p.ax + (p.bx - p.ax) * Math.min(1, (i + 2) / n), p.ay + (p.by - p.ay) * Math.min(1, (i + 2) / n), 0.55); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); const c = Q(p.ax + (p.bx - p.ax) * i / n, p.ay + (p.by - p.ay) * i / n, 0.55), d = Q(p.ax + (p.bx - p.ax) * Math.min(1, (i + 2) / n), p.ay + (p.by - p.ay) * Math.min(1, (i + 2) / n), 0); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); }
        ctx.stroke();
      }
      break;
    }
    case "bench": {
      const d = p.along === "y" ? [0, 0.35] : [0.35, 0];
      G.poly([Q(p.x - d[0], p.y - d[1], 0.15), Q(p.x + d[0], p.y + d[1], 0.15), Q(p.x + d[0] + 0.1, p.y + d[1] + 0.1, 0.15), Q(p.x - d[0] + 0.1, p.y - d[1] + 0.1, 0.15)], shade("#6a4a30", 1.2 * nf));
      break;
    }
    case "lamp": {
      vline(p.x, p.y, 0, 1.1, "#3a3f44", Math.max(1, K.z * 0.06));
      const [sx, sy] = Q(p.x, p.y, 1.12); ctx.fillStyle = env.night ? "#fde68a" : "#9aa0a4"; ctx.fillRect(sx - 2, sy - 1, 4, 2);
      if (env.night) { glow(K, sx, sy, K.z * 1.2, "rgba(253,230,138,0.35)"); const [gx, gy] = Q(p.x, p.y, 0); ctx.fillStyle = "rgba(253,230,138,0.1)"; ctx.beginPath(); ctx.ellipse(gx, gy, K.z * 1.2, K.z * 0.6, 0, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case "doorman": {
      if (far) break;
      figure(K, p.x, p.y, 0, "#1f2a44", "#c89a78", { cap: "#1f2a44", arm: near });
      if (near) { const [sx, sy] = Q(p.x, p.y, 0.36); ctx.fillStyle = "#c8a040"; ctx.fillRect(sx - 1, sy - 1, 2, 2); }
      break;
    }
    case "fountain": {
      const N = 16, ring = (r, h) => Array.from({ length: N }, (_, i) => Q(p.x + r * Math.cos(i / N * Math.PI * 2), p.y + r * Math.sin(i / N * Math.PI * 2), h));
      G.poly(ring(0.7, 0.12), shade("#b8b0a0", nf)); G.poly(ring(0.58, 0.12), env.night ? "#1a6a8a" : "#4aa3cf");
      if (!far) { vline(p.x, p.y, 0.12, 0.6, "rgba(220,240,255,0.7)", Math.max(1, K.z * 0.08)); for (let k = 0; k < 6; k++) { const ph = frac((K.t || 0) * 0.8 + k / 6), a = k / 6 * Math.PI * 2, [sx, sy] = Q(p.x + Math.cos(a) * 0.4 * ph, p.y + Math.sin(a) * 0.4 * ph, 0.6 - 0.5 * ph * ph + 0.2 * ph); ctx.fillStyle = "rgba(220,240,255,0.6)"; ctx.fillRect(sx - 1, sy - 1, 2, 2); } }
      break;
    }
    case "flag": {
      vline(p.x, p.y, 0, 1.6, "#c8ccd0", Math.max(1, K.z * 0.04));
      const w = Math.sin((K.t || 0) * 3 + p.x) * 0.05;
      G.poly([Q(p.x, p.y, 1.58), Q(p.x + 0.6, p.y + w, 1.55), Q(p.x + 0.6, p.y + w, 1.3), Q(p.x, p.y, 1.33)], shade("#15803d", nf));
      if (near) { const [sx, sy] = Q(p.x + 0.3, p.y, 1.44); ctx.fillStyle = "#e5e7eb"; ctx.fillRect(sx - 1, sy - 1, 2, 2); }
      break;
    }
    case "camera": {
      vline(p.x, p.y, 0, 1.3, "#2a302c", Math.max(1, K.z * 0.07));
      const a = Math.sin((K.t || 0) * 0.6 + p.x) * 0.8, [sx, sy] = Q(p.x, p.y, 1.3);
      ctx.fillStyle = "#1a1f1c"; ctx.save(); ctx.translate(sx, sy); ctx.rotate(a * 0.4); ctx.fillRect(-K.z * 0.25, -K.z * 0.1, K.z * 0.5, K.z * 0.2); ctx.restore();
      ctx.fillStyle = frac((K.t || 0) * 0.5 + p.x) < 0.5 ? "#ef4444" : "#4a1a1a"; ctx.fillRect(sx - 1, sy - 1, 2, 2);
      if (env.night && ctx.fillStyle === "#ef4444") glow(K, sx, sy, K.z * 0.6, "rgba(239,68,68,0.45)");
      break;
    }
    case "bollard": {
      vline(p.x, p.y, 0, 0.3, env.night ? "#4ade80" : "#5a605c", Math.max(1.5, K.z * 0.14));
      break;
    }
    case "statue": {
      const c = { x0: p.x - 0.18, y0: p.y - 0.18, x1: p.x + 0.18, y1: p.y + 0.18, h0: 0, h1: 0.3 };
      for (const f of facesOf(c, G)) G.poly(f.q(0, 1, 0, 0.3), shade("#a8a298", f.sh * nf));
      if (!far) figure(K, p.x, p.y, 0.3, shade("#5f7f6a", nf), shade("#6f8f7a", nf), { arm: false });
      break;
    }
    case "hydrant": { vline(p.x, p.y, 0, 0.22, "#dc2626", Math.max(2, K.z * 0.12)); break; }
    case "poster": {
      const c = { x0: p.x - 0.25, y0: p.y - 0.02, x1: p.x + 0.25, y1: p.y + 0.02, h0: 0, h1: 0.9 };
      for (const f of facesOf(c, G)) { G.poly(f.q(0, 1, 0.1, 0.9), f.s === "s" || f.s === "n" ? shade("#f5e6c8", nf) : "#2a2a2a"); if (!far && (f.s === "s" || f.s === "n")) { G.poly(f.q(0.1, 0.9, 0.5, 0.85), shade("#7c3aed", nf)); G.poly(f.q(0.1, 0.9, 0.2, 0.3), shade("#b91c1c", nf)); } }
      break;
    }
    case "table": {
      vline(p.x, p.y, 0, 0.5, "#ddd", 1);
      const [sx, sy] = Q(p.x, p.y, 0.55); ctx.fillStyle = shade("#1f6b3a", nf); ctx.beginPath(); ctx.ellipse(sx, sy, K.z * 0.4, K.z * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "armoured": case "ambulance": {
      // a van: a box on the ground, windscreen, the livery; the bay's canopy over the ambulance
      const amb = p.k === "ambulance";
      const c = amb ? { x0: p.x - 0.35, y0: p.y - 0.75, x1: p.x + 0.35, y1: p.y + 0.75, h0: 0.08, h1: 0.62 } : { x0: p.x0 + 0.05, y0: p.y0 + 0.05, x1: p.x1 - 0.05, y1: p.y1 - 0.05, h0: 0.08, h1: 0.6 };
      const body = amb ? "#f1f1ee" : "#4a524a";
      for (const f of facesOf(c, G)) {
        G.poly(f.q(0, 1, c.h0, c.h1), shade(body, f.sh * nf));
        if (!far) { G.poly(f.q(0, 1, c.h0 + 0.12, c.h0 + 0.2, 0.005), amb ? "#dc2626" : "#c9a043"); if (f.len < 1) G.poly(f.q(0.15, 0.85, c.h0 + 0.28, c.h1 - 0.06, 0.005), "#20303a"); }
      }
      G.poly([Q(c.x0, c.y0, c.h1), Q(c.x1, c.y0, c.h1), Q(c.x1, c.y1, c.h1), Q(c.x0, c.y1, c.h1)], shade(body, 1.2 * nf));
      if (amb) {
        const on = env.night ? frac((K.t || 0) * 2) < 0.5 : false, [sx, sy] = Q(p.x, p.y - 0.6, c.h1 + 0.05);
        ctx.fillStyle = on ? "#ef4444" : "#7a2a2a"; ctx.fillRect(sx - 3, sy - 1, 3, 2); ctx.fillStyle = !on && env.night ? "#3b82f6" : "#1e3a8a"; ctx.fillRect(sx, sy - 1, 3, 2);
        if (env.night) glow(K, sx, sy, K.z * 1.4, on ? "rgba(239,68,68,0.4)" : "rgba(59,130,246,0.4)");
        // the canopy on its posts over the bay
        for (const [x, y] of [[p.x0 + 0.08, p.y0 + 0.1], [p.x1 - 0.08, p.y0 + 0.1], [p.x0 + 0.08, p.y1 - 0.1], [p.x1 - 0.08, p.y1 - 0.1]]) vline(x, y, 0, 1.05, "#9aa3a8", Math.max(1, K.z * 0.05));
        G.poly([Q(p.x0, p.y0, 1.05), Q(p.x1, p.y0, 1.05), Q(p.x1, p.y1, 1.05), Q(p.x0, p.y1, 1.05)], "rgba(220,225,228,0.55)", "rgba(80,90,96,0.8)");
        if (!far) { const [tx, ty] = Q((p.x0 + p.x1) / 2, p.y1, 1.05); ctx.font = `bold ${Math.max(6, Math.round(K.z * 0.4))}px 'Fira Mono', monospace`; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = "#dc2626"; ctx.fillText("AMBULANCE", tx, ty + 1); }
      }
      break;
    }
    case "booth": {
      const c = { x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1, h0: 0, h1: 0.8 };
      for (const f of facesOf(c, G)) { G.poly(f.q(0, 1, 0, 0.8), shade("#5a605c", f.sh * nf)); G.poly(f.q(0.15, 0.85, 0.45, 0.72, 0.005), env.night ? "#fde68a" : "#2a3a40"); }
      G.poly([Q(c.x0 - 0.05, c.y0 - 0.05, 0.8), Q(c.x1 + 0.05, c.y0 - 0.05, 0.8), Q(c.x1 + 0.05, c.y1 + 0.05, 0.8), Q(c.x0 - 0.05, c.y1 + 0.05, 0.8)], shade("#3a403c", 1.2 * nf));
      break;
    }
    case "grave": { const c = { x0: p.x - 0.08, y0: p.y - 0.03, x1: p.x + 0.08, y1: p.y + 0.03, h0: 0, h1: 0.3 }; for (const f of facesOf(c, G)) G.poly(f.q(0, 1, 0, 0.3), shade("#8a8a84", f.sh * nf)); break; }
    case "stall": {
      const cols = ["#b91c1c", "#1d4ed8", "#15803d"], i = Math.floor(p.x) % 3;
      const c = { x0: p.x0 + 0.05, y0: p.y0 + 0.1, x1: p.x1 - 0.05, y1: p.y1 - 0.1, h0: 0, h1: 0.35 };
      for (const f of facesOf(c, G)) G.poly(f.q(0, 1, 0, 0.35), shade("#6a4a30", f.sh * nf));
      G.poly([Q(c.x0, c.y0, 0.35), Q(c.x1, c.y0, 0.35), Q(c.x1, c.y1, 0.35), Q(c.x0, c.y1, 0.35)], shade("#8a6a48", nf));
      if (!far) for (let k = 0; k < 4; k++) { const [sx, sy] = Q(c.x0 + 0.12 + k * 0.17, (c.y0 + c.y1) / 2, 0.4); ctx.fillStyle = ["#f97316", "#84cc16", "#facc15", "#dc2626"][k]; ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3); }
      for (const [x, y] of [[c.x0, c.y0], [c.x1, c.y0], [c.x0, c.y1], [c.x1, c.y1]]) vline(x, y, 0.35, 0.95, "#5a4a3a", 1);
      G.poly([Q(c.x0 - 0.05, c.y0 - 0.05, 1.0), Q(c.x1 + 0.05, c.y0 - 0.05, 1.0), Q(c.x1 + 0.05, c.y1 + 0.05, 0.9), Q(c.x0 - 0.05, c.y1 + 0.05, 0.9)], shade(cols[i], nf));
      if (env.night) { const [sx, sy] = Q(p.x, p.y, 0.9); glow(K, sx, sy, K.z * 1.1, "rgba(253,200,100,0.35)"); }
      break;
    }
    case "conveyor": {
      // an inclined belt up to the hopper, the boxes riding it
      const x0 = p.x0 + 0.05, x1 = p.x1 - 0.25, y = p.y, h0 = 0.6, h1 = 1.5;
      for (const x of [x0 + 0.2, (x0 + x1) / 2, x1 - 0.1]) vline(x, y, 0, h0 + (h1 - h0) * (x - x0) / (x1 - x0), "#5a5a56", 1);
      G.poly([Q(x0, y - 0.18, h0), Q(x1, y - 0.18, h1), Q(x1, y + 0.18, h1), Q(x0, y + 0.18, h0)], shade("#2a2a28", 1.2 * nf));
      if (!far) for (let k = 0; k < 4; k++) { const ph = frac((K.t || 0) * 0.15 + k / 4), x = x0 + (x1 - x0) * ph, [sx, sy] = Q(x, y, h0 + (h1 - h0) * ph + 0.1); ctx.fillStyle = ["#8a6a4a", "#6a7a8a", "#9a8a5a", "#5a6a5a"][k]; ctx.fillRect(sx - K.z * 0.15, sy - K.z * 0.2, K.z * 0.3, K.z * 0.22); }
      const c = { x0: p.x1 - 0.4, y0: p.y - 0.35, x1: p.x1, y1: p.y + 0.35, h0: 0.5, h1: 1.8 };
      for (const f of facesOf(c, G)) G.poly(f.q(0, 1, c.h0, c.h1), shade("#8a7a3a", f.sh * nf));
      G.poly([Q(c.x0, c.y0, c.h1), Q(c.x1, c.y0, c.h1), Q(c.x1, c.y1, c.h1), Q(c.x0, c.y1, c.h1)], "#1a1a18");
      for (const [x, yy] of [[c.x0, c.y0], [c.x1, c.y1]]) vline(x, yy, 0, 0.5, "#5a5a56", 1);
      break;
    }
    case "containers": {
      const cols = ["#b91c1c", "#1d4ed8", "#c2410c", "#15803d", "#6d28d9", "#a16207"];
      // shipping containers, long ways, in three rows stacked two and three high
      const boxes = [], stack = [2, 3, 1];
      for (let i = 0; i < 3; i++) for (let l = 0; l < stack[i]; l++) boxes.push({ x0: p.x0 + 0.15, y0: p.y0 + 0.1 + i * 0.7, x1: p.x0 + 2.05, y1: p.y0 + 0.65 + i * 0.7, h0: l * 0.42, h1: l * 0.42 + 0.42, c: cols[(i * 2 + l * 3) % cols.length] });
      boxes.sort((a, b) => { const [ua, va] = rot(a.x0, a.y0, G.r), [ub, vb] = rot(b.x0, b.y0, G.r); return (ua + va) - (ub + vb) || a.h0 - b.h0; });
      for (const c of boxes) {
        for (const f of facesOf(c, G)) { G.poly(f.q(0, 1, c.h0, c.h1), shade(c.c, f.sh * 0.85 * nf)); if (near) { ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1; ctx.beginPath(); const n = Math.max(2, Math.round(f.len * 8)); for (let k = 1; k < n; k++) { const A = f.F(k / n, c.h0), B = f.F(k / n, c.h1); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke(); } }
        G.poly([Q(c.x0, c.y0, c.h1), Q(c.x1, c.y0, c.h1), Q(c.x1, c.y1, c.h1), Q(c.x0, c.y1, c.h1)], shade(c.c, 1.1 * nf));
      }
      // the gantry crane across the stack, its trolley moving
      const H = 1.8, ya = p.y0 + 0.05, yb = p.y1 - 0.05, xa = p.x0 + 0.05, xb = p.x1 - 0.05;
      for (const [x, y] of [[xa, ya], [xb, ya], [xa, yb], [xb, yb]]) vline(x, y, 0, H, "#eab308", Math.max(1, K.z * 0.08));
      K.line(Q(xa, ya, H), Q(xa, yb, H), "#eab308", Math.max(1, K.z * 0.1)); K.line(Q(xb, ya, H), Q(xb, yb, H), "#eab308", Math.max(1, K.z * 0.1));
      const tx = xa + (xb - xa) * (0.5 + 0.4 * Math.sin((K.t || 0) * 0.3)), ty = (ya + yb) / 2;
      K.line(Q(tx, ya, H), Q(tx, yb, H), "#ca8a04", Math.max(1, K.z * 0.12));
      if (!far) K.line(Q(tx, ty, H), Q(tx, ty, 1.0), "#333", 1);
      break;
    }
    case "sandbags": {
      for (let i = 0; i < 3; i++) { const [sx, sy] = Q(p.x, p.y - 0.15 + i * 0.15, 0.1 + (i % 2) * 0.05); ctx.fillStyle = shade("#8a7a5a", nf); ctx.beginPath(); ctx.ellipse(sx, sy, K.z * 0.2, K.z * 0.1, 0, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case "watchtower": {
      for (const [dx, dy] of [[-0.25, -0.25], [0.25, -0.25], [0.25, 0.25], [-0.25, 0.25]]) vline(p.x + dx, p.y + dy, 0, 3.4, "#4a504c", Math.max(1, K.z * 0.07));
      const c = { x0: p.x - 0.35, y0: p.y - 0.35, x1: p.x + 0.35, y1: p.y + 0.35, h0: 3.4, h1: 4.0 };
      for (const f of facesOf(c, G)) { G.poly(f.q(0, 1, c.h0, c.h1), shade("#5a605c", f.sh * nf)); G.poly(f.q(0.1, 0.9, 3.6, 3.85, 0.005), env.night ? "#fde68a" : "#20282a"); }
      G.poly([Q(c.x0 - 0.1, c.y0 - 0.1, 4.05), Q(c.x1 + 0.1, c.y0 - 0.1, 4.05), Q(c.x1 + 0.1, c.y1 + 0.1, 4.05), Q(c.x0 - 0.1, c.y1 + 0.1, 4.05)], shade("#3a403c", 1.2 * nf));
      if (env.night) {
        const a = (K.t || 0) * 0.5 + 1, [sx, sy] = Q(p.x, p.y, 3.7), [gx, gy] = Q(p.x + Math.cos(a) * 4, p.y + Math.sin(a) * 2.5, 0);
        ctx.fillStyle = "rgba(255,255,220,0.12)"; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(gx - K.z, gy); ctx.lineTo(gx + K.z, gy); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.ellipse(gx, gy, K.z * 1.1, K.z * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case "bins": {
      for (let i = 0; i < 2; i++) { const c = { x0: p.x - 0.18 + i * 0.2, y0: p.y - 0.1, x1: p.x + i * 0.2, y1: p.y + 0.1, h0: 0, h1: 0.3 }; for (const f of facesOf(c, G)) G.poly(f.q(0, 1, 0, 0.3), shade(i ? "#2f5a3a" : "#3a3f44", f.sh * nf)); }
      break;
    }
    default: if (!drawVenueYard(K, p, env) && !drawWestYard(K, p, env, WEST_KIT)) drawFunnelYard(K, p, env, FUNNEL_KIT); break;
  }
  K.flush();
}
