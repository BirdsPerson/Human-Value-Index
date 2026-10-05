// THE SUBURBS and THE AIRPORT drawn (PHASE 2 step 4): the facades of eastGeo.js's styles, their
// ground (the cul-de-sacs, the running track, the car parks), their yard props (cars, the tugs, the
// windsock), the open lots (the parks: paths, trees, the pond; the airfield: the runway, its markings
// and lights, the taxiway, the stands) and the aircraft (airport.js), parked and taxiing with the
// airfield, flying in the sky pass. Merged into archDraw.js like the Port's and the Old Town's, with
// its kit (X: shade, faceText, windowGrid, door, glow, facesOf).

import { rot, STOREY } from "./iso.js";
import { planesAt, flightBoard, RUNWAY, TAXI_Y, STAND_Y, STANDS, CURFEW } from "./airport.js";

export const EAST_STYLES_DRAWN = ["house", "townhouse", "highschool", "mall", "clinic", "terminal", "tower", "hangar", "hotel"];
export const EAST_PROPS_DRAWN = ["car", "tug", "windsock"];
export const EAST_MAT = {
  siding: "#d8ccb0", sidingblue: "#8fb0c4", sidingyellow: "#d8c47e", sidingsage: "#a3b89a", sidingrose: "#c9a4a0", brickhouse: "#9a5a44",
  garage: "#d6d0c2", foliage: "#2f6b34", mallwall: "#bdb4a2", mallanchor: "#8f8272", glassteel: "#5f8fa8", hangar: "#8d979e", hotelwall: "#d5d0c6",
};
export const EAST_ROOF = {
  siding: "#5a4740", sidingblue: "#3c4350", sidingyellow: "#6a5040", sidingsage: "#474c43", sidingrose: "#4a3c40", brickhouse: "#3a3434",
  garage: "#5a5a58", foliage: "#2f6b34", mallwall: "#77756e", mallanchor: "#625a52", glassteel: "#a9cfe0", hangar: "#a3acb3", hotelwall: "#8a8680",
};
const CAR_COLS = ["#b91c1c", "#1d4ed8", "#e5e7eb", "#111827", "#a3a3a3", "#15803d", "#f59e0b", "#7c3aed"];
const frac = (v) => ((v % 1) + 1) % 1;
const h1 = (a, b = 0) => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 4294967296; };

export function eastDeco(X) {
  const { shade, faceText, windowGrid, door, glow } = X;
  // a house: two windows a storey on each side, the front door with its porch light; a garage's up-and-over door
  function houseFace(K, p, faces) {
    const { G } = K;
    for (const f of faces) {
      const front = f.s === p.door;
      if (p.win === "garage") {
        if (front) { G.poly(f.q(0.12, 0.88, 0, 0.72, 0.01), shade("#e9e4d8", f.sh * K.nf)); if (K.lod === "near") for (let k = 1; k < 4; k++) K.line(f.F(0.12, k * 0.18, 0.012), f.F(0.88, k * 0.18, 0.012), "rgba(0,0,0,0.18)", 1); }
        continue;
      }
      windowGrid(K, f, p, { bay: 0.95, w: 0.38, y0: 0.32, y1: 0.72, glass: "#3c5664", sill: shade("#f4f1ea", K.nf), skip: front ? (s, k, cols) => s === 0 && k === Math.floor(cols / 2) : null });
      K.flush();
      if (front) {
        door(K, f, 0.5, 0.36, 0.78, ["#7f1d1d", "#1e3a8a", "#14532d", "#3f3f46"][(p.house || 0) % 4], { lit: true });
        if (K.lod !== "far") G.poly([f.F(0.34, 0.95, 0), f.F(0.66, 0.95, 0), f.F(0.66, 0.9, 0.3), f.F(0.34, 0.9, 0.3)], shade("#efe9dc", 1.1 * K.nf));   // the porch's little roof
        if (K.night && K.lod !== "far") { const c = f.F(0.5, 0.85, 0.05); glow(K, c[0], c[1], K.z * 0.7, "rgba(253,224,150,0.45)"); }
      }
      if (K.lod === "near" && !p.mat.startsWith("brick")) {   // the siding's clapboard lines
        K.ctx.strokeStyle = "rgba(0,0,0,0.10)"; K.ctx.lineWidth = 1; K.ctx.beginPath();
        for (let h = 0.18; h < p.h1; h += 0.18) { const A = f.F(0, h), B = f.F(1, h); K.ctx.moveTo(A[0], A[1]); K.ctx.lineTo(B[0], B[1]); }
        K.ctx.stroke();
      }
    }
  }
  // a townhouse: narrow, two storeys, the door to one side, a window beside it
  function townFace(K, p, faces) {
    for (const f of faces) {
      const front = f.s === p.door;
      windowGrid(K, f, p, { bay: 0.75, w: 0.3, y0: 0.32, y1: 0.74, glass: "#3a5260", sill: shade("#ece6da", K.nf), skip: front ? (s, k) => s === 0 && k === 0 : null });
      K.flush();
      if (front && f.len < 2.5) door(K, f, 0.25, 0.3, 0.76, (p.house || 0) % 2 ? "#334155" : "#713f12", { lit: true });
    }
  }
  // the school: rows of classroom windows, the name over the doors; the gym's high band of glass
  function schoolFace(K, p, faces) {
    for (const f of faces) {
      if (p.win === "gym") {
        K.G.poly(f.q(0.04, 0.96, p.h1 - 0.7, p.h1 - 0.35, 0.01), K.night && K.env.lit > 0.1 ? "#fde68a" : shade("#4e6a78", f.sh));
        if (p.sign && f.s === "s" && K.lod !== "far") faceText(K, f, 0.5, 1.0, p.sign, 0.16, "#f8fafc", { stroke: "#7f1d1d" });
        continue;
      }
      windowGrid(K, f, p, { bay: 0.85, w: 0.5, y0: 0.3, y1: 0.78, glass: "#36505e", sill: shade("#e8e0d0", K.nf) });
      K.flush();
      if (p.cornice && K.lod !== "far") K.G.poly(f.q(-0.005, 1.005, p.h1 - 0.16, p.h1, 0.08), shade("#d8cfb4", f.sh * K.nf));
      if (f.s === p.door) door(K, f, 0.5, 0.9, 0.85, "#1f2937", { lit: true });
      if (p.sign && (f.s === p.door || f.s === "s") && K.lod !== "far") faceText(K, f, 0.5, p.h1 - 0.42, p.sign, 0.22, "#fef3c7", { stroke: "#3a1a10" });
    }
  }
  // the mall: blank anchor walls with their names, the concourse's band of shopfronts, the atrium's glass
  function mallFace(K, p, faces) {
    const { G } = K;
    for (const f of faces) {
      if (p.win === "atrium") {
        G.poly(f.q(0, 1, p.h0, p.h1), K.night ? shade("#f6d58a", 0.9) : shade("#8fc3dc", f.sh));
        if (K.lod !== "far") for (let k = 1; k < 6; k++) K.line(f.F(k / 6, 0), f.F(k / 6, p.h1), "rgba(240,248,255,0.5)", 1);
        if (f.s === "s") { door(K, f, 0.5, 1.4, 0.9, "#1c2a30", { lit: true }); if (K.lod !== "far") faceText(K, f, 0.5, p.h1 + 0.35, p.sign, 0.34, K.night ? "#fef08a" : "#f8fafc", { stroke: "#1e3a8a", glow: K.night ? "rgba(254,240,138,0.4)" : null }); }
        continue;
      }
      if (p.win === "anchor") {
        G.poly(f.q(0, 1, p.h1 - 0.4, p.h1, 0.01), shade("#6b5f52", f.sh * K.nf));
        if (f.s === "s") {
          G.poly(f.q(0.3, 0.7, 0, 0.95, 0.01), K.night ? "#fcd9a0" : shade("#3f5866", f.sh));
          if (K.lod !== "far") faceText(K, f, 0.5, 1.75, p.sign, 0.3, K.night ? "#fecaca" : "#fff7ed", { stroke: "#7f1d1d", glow: K.night ? "rgba(248,113,113,0.4)" : null });
        }
        continue;
      }
      // the concourse: a band of shopfronts under a fascia
      G.poly(f.q(0.02, 0.98, 0.15, 1.0, 0.01), K.night ? (K.env.lit > 0.05 ? "#fde3a7" : "#2a2418") : shade("#5a7380", f.sh));
      G.poly(f.q(0, 1, 1.0, 1.3, 0.02), shade("#e7e0d0", f.sh * K.nf));
      if (f.s === p.door) door(K, f, 0.5, 0.9, 0.95, "#1c2a30", { lit: true });
    }
  }
  function mallRoof(K, p) {
    if (!p.skylights || K.lod === "far") return;
    const { G, Q } = K, n = Math.max(2, Math.floor((p.x1 - p.x0) / 2.4));
    for (let i = 0; i < n; i++) { const x = p.x0 + (i + 0.5) * (p.x1 - p.x0) / n; G.poly([Q(x - 0.5, p.y0 + 1.2, p.h1 + 0.02), Q(x + 0.5, p.y0 + 1.2, p.h1 + 0.02), Q(x + 0.5, p.y1 - 1.2, p.h1 + 0.02), Q(x - 0.5, p.y1 - 1.2, p.h1 + 0.02)], K.night ? "#f6d58a" : "#9cc9de", "rgba(255,255,255,0.4)"); }
  }
  function clinicFace(K, p, faces) {
    for (const f of faces) {
      windowGrid(K, f, p, { bay: 1.0, w: 0.6, y0: 0.3, y1: 0.75, glass: "#3d5a68" });
      K.flush();
      if (f.s === p.door) {
        door(K, f, 0.35, 0.8, 0.85, "#1f2d36", { lit: true });
        if (K.lod !== "far") faceText(K, f, 0.62, 1.3, "EASTSIDE CLINIC", 0.17, "#14532d");
      }
      if (p.cross && (f.s === p.door || f.s === "e")) { const c = 0.86, h = 1.15; K.G.poly(f.q(c - 0.025, c + 0.025, h - 0.25, h + 0.25, 0.02), "#16a34a"); K.G.poly(f.q(c - 0.07, c + 0.07, h - 0.08, h + 0.08, 0.02), "#16a34a"); }
    }
  }
  // the departures hall: glass from the floor to the wave, mullions, the board, the name
  function terminalFace(K, p, faces) {
    const { G, ctx } = K;
    for (const f of faces) {
      if (p.seg === "bridge") continue;
      const top = f.F(0.5, p.h1), bot = f.F(0.5, 0), g = ctx.createLinearGradient(top[0], top[1], bot[0], bot[1]);
      if (K.night) { g.addColorStop(0, shade("#24425a", f.sh)); g.addColorStop(1, "#f3d79a"); } else { g.addColorStop(0, shade("#b8dcee", f.sh)); g.addColorStop(1, shade("#4f86a6", f.sh)); }
      G.poly(f.q(0, 1, 0, p.h1), g);
      if (K.lod === "far") continue;
      const cols = Math.max(2, Math.round(f.len / 0.9));
      ctx.strokeStyle = K.night ? "rgba(255,240,200,0.35)" : "rgba(240,248,255,0.6)"; ctx.lineWidth = 1; ctx.beginPath();
      for (let k = 1; k < cols; k++) { const A = f.F(k / cols, 0), B = f.F(k / cols, p.h1); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
      const A = f.F(0, 1.2), B = f.F(1, 1.2); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      if (f.s !== p.door) continue;
      for (const t of [0.3, 0.7]) door(K, f, t, 0.9, 0.95, "#16232c", { lit: true });
      faceText(K, f, 0.5, p.h1 - 0.35, p.sign, 0.24, K.night ? "#fef08a" : "#0f172a", { glow: K.night ? "rgba(254,240,138,0.4)" : null });
      if (K.lod === "near" && K.env.mt != null) {   // the departures board by the doors
        const rows = flightBoard(K.env.mt, 3), hh = (t) => { const h = ((t % 24) + 24) % 24; return `${String(Math.floor(h)).padStart(2, "0")}${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`; };
        G.poly(f.q(0.42, 0.58, 1.3, 1.95, 0.03), "#0b0f14");
        const lines = rows.length ? rows.map(r => `${hh(r.t)} ${r.kind} ${r.id}`) : [CURFEW.split(".")[0]];
        lines.forEach((l, i) => faceText(K, f, 0.5, 1.82 - i * 0.2, l, 0.07, "#fbbf24", { d: 0.04 }));
      }
    }
  }
  function terminalRoof(K, p) {
    if (p.seg === "bridge" && K.lod !== "far") { const { G, Q } = K; G.poly([Q(p.x0, p.y0, p.h1), Q(p.x1, p.y0, p.h1), Q(p.x1, p.y1, p.h1), Q(p.x0, p.y1, p.h1)], shade("#9aa5ad", 1.1 * K.nf)); }
  }
  // the tower: the base's windows; the cab's glass all round, green at night
  function towerFace(K, p, faces) {
    for (const f of faces) {
      if (p.win === "cab") {
        K.G.poly(f.q(0, 1, p.h0 + 0.15, p.h1 - 0.1, 0.01), K.night ? "#86efac" : shade("#6fa3bf", f.sh));
        if (K.lod !== "far") K.G.poly(f.q(-0.03, 1.03, p.h1 - 0.12, p.h1, 0.08), shade("#e5e7eb", f.sh * K.nf));
        continue;
      }
      windowGrid(K, f, p, { bay: 0.9, w: 0.45, y0: 0.35, y1: 0.75, glass: "#3d5563" });
      K.flush();
      if (f.s === p.door) door(K, f, 0.5, 0.6, 0.8, "#1f2937", { lit: true });
    }
  }
  function towerRoof(K, p) {
    if (!p.antenna) return;
    const { Q, ctx } = K, cx = (p.x0 + p.x1) / 2, cy = (p.y0 + p.y1) / 2;
    K.line(Q(cx, cy, p.h1), Q(cx, cy, p.h1 + p.antenna), "#9ca3af", Math.max(1, K.z * 0.06));
    if (K.lod !== "far") { const [x, y] = Q(cx + 0.6, cy, p.h1 + 0.25); ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = Math.max(1, K.z * 0.05); ctx.beginPath(); ctx.ellipse(x, y, K.z * 0.5, K.z * 0.18, (K.t || 0) * 0.8, 0, Math.PI * 2); ctx.stroke(); }   // the radar, turning
    const on = !K.t || frac(K.t * 0.7) < 0.5, [bx, by] = Q(cx, cy, p.h1 + p.antenna);
    ctx.fillStyle = on ? "#ef4444" : "#7f1d1d"; ctx.fillRect(Math.round(bx) - 1, Math.round(by) - 1, 3, 3);
  }
  // a hangar: the sliding doors across the end to the airfield, the number; corrugated sides
  function hangarFace(K, p, faces) {
    const { G, ctx } = K;
    for (const f of faces) {
      if (f.s === p.door) {
        G.poly(f.q(0.06, 0.94, 0, p.h1 - 0.15, 0.01), shade("#5b6670", f.sh * K.nf));
        if (K.lod !== "far") { ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1; ctx.beginPath(); for (let k = 1; k < 6; k++) { const A = f.F(0.06 + 0.88 * k / 6, 0), B = f.F(0.06 + 0.88 * k / 6, p.h1 - 0.15); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke(); faceText(K, f, 0.5, p.h1 + 0.45, p.sign, 0.22, "#f8fafc", { stroke: "#1f2937" }); }
        if (K.night && K.env.lit > 0.05) { const c = f.F(0.5, 0.6, 0.3); glow(K, c[0], c[1], K.z * 2.2, "rgba(220,235,255,0.25)"); }
        continue;
      }
      if (K.lod === "near") { ctx.strokeStyle = "rgba(0,0,0,0.12)"; ctx.lineWidth = 1; ctx.beginPath(); for (let t = 0.05; t < 1; t += 0.05) { const A = f.F(t, 0), B = f.F(t, p.h1); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke(); }
    }
  }
  // the hotel: storey after storey of rooms; the lobby lit; the name on the roof
  function hotelFace(K, p, faces) {
    for (const f of faces) {
      if (p.win === "lobby") {
        K.G.poly(f.q(0.05, 0.95, 0.1, 1.15, 0.01), K.night ? "#f8d9a0" : shade("#6c8e9f", f.sh));
        if (f.s === p.door) door(K, f, 0.5, 0.9, 0.9, "#1c2a30", { lit: true });
        continue;
      }
      windowGrid(K, f, p, { bay: 0.7, w: 0.42, y0: 0.25, y1: 0.75, glass: "#3a5666", warm: true });
      K.flush();
    }
  }
  function hotelRoof(K, p, faces) {
    if (!p.sign || K.lod === "far") return;
    const f = faces.find(x => x.s === "s") || faces[0];
    if (f) faceText(K, f, 0.5, p.h1 + 0.35, p.sign, 0.3, K.night ? "#fda4af" : "#9f1239", { glow: K.night ? "rgba(253,164,175,0.45)" : null });
  }
  return {
    deco: {
      house: { face: houseFace }, townhouse: { face: townFace }, highschool: { face: schoolFace }, mall: { face: mallFace, roof: mallRoof },
      clinic: { face: clinicFace }, terminal: { face: terminalFace, roof: terminalRoof }, tower: { face: towerFace, roof: towerRoof },
      hangar: { face: hangarFace }, hotel: { face: hotelFace, roof: hotelRoof },
    },
    far: {
      terminal: (K, p, faces) => { if (p.seg !== "bridge") for (const f of faces) K.G.poly(f.q(0, 1, 0.2, p.h1 - 0.2, 0.01), K.night ? "#f3d79a" : "#8fc3dc"); },
      tower: (K, p, faces) => { if (p.win === "cab") for (const f of faces) K.G.poly(f.q(0, 1, p.h0 + 0.2, p.h1 - 0.1, 0.01), K.night ? "#86efac" : "#6fa3bf"); },
    },
  };
}

// ---- the ground: the cul-de-sac, the track and the field, the car park --------------------------
export function drawEastGround(G, g, env, shade) {
  const { Q, ctx } = G, nf = env.night ? 0.7 : 1, far = env.lod === "far";
  const rect = (x0, y0, x1, y1, fill, h = 0.011) => G.poly([Q(x0, y0, h), Q(x1, y0, h), Q(x1, y1, h), Q(x0, y1, h)], fill);
  if (g.k === "cul") {
    // the street in from the front, bending to a turning circle among the houses
    const cx = (g.x0 + g.x1) / 2, w = g.x1 - g.x0, top = g.y0 + g.turn, pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([cx + Math.sin(t * Math.PI) * w * 0.35, g.y1 - (g.y1 - top) * t]); }
    ctx.strokeStyle = shade("#3c3f44", nf); ctx.lineWidth = Math.max(2, G.z * w * 0.9); ctx.lineCap = "round"; ctx.beginPath();
    pts.forEach(([x, y], i) => { const [sx, sy] = Q(x, y, 0.011); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); });
    ctx.stroke(); ctx.lineCap = "butt";
    const ring = []; for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2; ring.push(Q(cx + Math.cos(a) * g.turn, top + Math.sin(a) * g.turn, 0.011)); }
    G.poly(ring, shade("#3c3f44", nf));
    if (!far) { const isl = []; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; isl.push(Q(cx + Math.cos(a) * g.turn * 0.35, top + Math.sin(a) * g.turn * 0.35, 0.012)); } G.poly(isl, shade("#2f6b34", nf)); }
    return true;
  }
  if (g.k === "track") {
    // the oval: red all-weather lanes round a green field with its yard lines
    const cx = (g.x0 + g.x1) / 2, cy = (g.y0 + g.y1) / 2, rx = (g.x1 - g.x0) / 2, ry = (g.y1 - g.y0) / 2;
    const oval = (sx, sy, h) => { const out = []; for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2; out.push(Q(cx + Math.cos(a) * sx, cy + Math.sin(a) * sy, h)); } return out; };
    G.poly(oval(rx, ry, 0.011), shade("#a34a3a", nf));
    G.poly(oval(rx - 0.9, ry - 0.9, 0.012), shade("#2f7a35", nf));
    if (!far) {
      ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i <= 10; i++) { const y = cy - (ry - 1.6) + (2 * (ry - 1.6)) * i / 10, A = Q(cx - (rx - 1.8), y, 0.013), B = Q(cx + (rx - 1.8), y, 0.013); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); for (const s of [0.3, 0.6]) { const o = oval(rx - s, ry - s, 0.013); o.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); } ctx.stroke();
    }
    return true;
  }
  if (g.k === "parking") {
    rect(g.x0, g.y0, g.x1, g.y1, shade("#3a3d42", nf));
    if (!far) {
      ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 1; ctx.beginPath();
      const rows = g.rows || 1, n = g.bays || 8;
      for (let r = 0; r < rows; r++) {
        const ya = g.y0 + (g.y1 - g.y0) * r / rows, yb = ya + (g.y1 - g.y0) / rows * 0.45;
        for (let i = 0; i <= n; i++) { const x = g.x0 + (g.x1 - g.x0) * i / n, A = Q(x, ya + 0.1, 0.012), B = Q(x, yb, 0.012); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
        const yc = g.y1 - (g.y1 - g.y0) / rows * (rows - 1 - r) - 0.1, yd = yc - (g.y1 - g.y0) / rows * 0.45;
        if (rows > 1) for (let i = 0; i <= n; i++) { const x = g.x0 + (g.x1 - g.x0) * i / n, A = Q(x, yc, 0.012), B = Q(x, yd, 0.012); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
      }
      ctx.stroke();
    }
    return true;
  }
  return false;
}

// ---- yard props ----------------------------------------------------------------------------------
// a vehicle: a body box, a cabin, the windows; along x or y
function vehicle(K, X, x, y, along, L, W, H, col, cabin = true) {
  const { G, Q } = K, { shade, facesOf } = X, nf = K.nf;
  const ax = along === "x", c = ax ? { x0: x - L / 2, y0: y - W / 2, x1: x + L / 2, y1: y + W / 2, h0: 0.06, h1: H * 0.55 } : { x0: x - W / 2, y0: y - L / 2, x1: x + W / 2, y1: y + L / 2, h0: 0.06, h1: H * 0.55 };
  for (const f of facesOf(c, G)) G.poly(f.q(0, 1, c.h0, c.h1), shade(col, f.sh * nf));
  G.poly([Q(c.x0, c.y0, c.h1), Q(c.x1, c.y0, c.h1), Q(c.x1, c.y1, c.h1), Q(c.x0, c.y1, c.h1)], shade(col, 1.15 * nf));
  if (!cabin) return;
  const k = 0.28, cb = ax ? { x0: x - L * k, y0: c.y0 + 0.04, x1: x + L * k, y1: c.y1 - 0.04, h0: c.h1, h1: H } : { x0: c.x0 + 0.04, y0: y - L * k, x1: c.x1 - 0.04, y1: y + L * k, h0: c.h1, h1: H };
  for (const f of facesOf(cb, G)) G.poly(f.q(0, 1, cb.h0, cb.h1), K.night ? "#1a2430" : shade("#3d5a6a", f.sh));
  G.poly([Q(cb.x0, cb.y0, cb.h1), Q(cb.x1, cb.y0, cb.h1), Q(cb.x1, cb.y1, cb.h1), Q(cb.x0, cb.y1, cb.h1)], shade(col, 1.2 * nf));
}
export function drawEastYard(K, p, env, X) {
  const { Q, ctx } = K;
  if (p.k === "car") { vehicle(K, X, p.x, p.y, p.along || "x", 0.8, 0.42, 0.45, CAR_COLS[(p.c || 0) % CAR_COLS.length]); return true; }
  if (p.k === "tug") { vehicle(K, X, p.x, p.y, "x", 0.6, 0.4, 0.35, "#facc15", false); return true; }
  if (p.k === "windsock") {
    K.line(Q(p.x, p.y, 0), Q(p.x, p.y, 1.6), "#d4d4d8", Math.max(1, K.z * 0.05));
    const sway = K.t ? Math.sin(K.t * 1.3) * 0.15 : 0, tip = Q(p.x - 0.9, p.y + 0.2 + sway, 1.45), A = Q(p.x, p.y - 0.12, 1.6), B = Q(p.x, p.y + 0.12, 1.45);
    ctx.fillStyle = "#f97316"; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(tip[0], tip[1]); ctx.closePath(); ctx.fill();
    return true;
  }
  return false;
}

// ---- the open lots: the parks and the airfield (CityIso calls this over the lot's fill) -----------
export const EAST_LOT_FILL = { "north-park": "#1d4d23", "village-green": "#215224", "south-park": "#1d4d23", "the-airfield": "#2b3a2a" };
const ptsOf = (Q, list, h) => list.map(([x, y]) => Q(x, y, h));
function tree(G, x, y, z, night, r = 0.5) {
  const { ctx, Q } = G, [tx, ty] = Q(x, y, 0), [cx, cy] = Q(x, y, 1.0);
  ctx.strokeStyle = "#4a3222"; ctx.lineWidth = Math.max(1, z * 0.08); ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(cx, cy); ctx.stroke();
  ctx.fillStyle = night ? "#173d1f" : "#2f7a3c"; ctx.beginPath(); ctx.arc(cx, cy - z * 0.1, Math.max(2, z * r), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = night ? "#1f4a27" : "#3f9a4c"; ctx.beginPath(); ctx.arc(cx - z * r * 0.25, cy - z * r * 0.35, Math.max(1, z * r * 0.55), 0, Math.PI * 2); ctx.fill();
}
export function drawEastLot(G, b, lod, mt, night) {
  const { ctx, Q } = G, r = b.rect, far = lod === "far", z = G.z;
  if (!EAST_LOT_FILL[b.id]) return false;
  const line = (pts, col, w, h = 0.012) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ptsOf(Q, pts, h).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); };
  if (b.id === "the-airfield") { drawAirfield(G, r, lod, mt, night); return true; }
  const seed = b.id.length * 31 + b.id.charCodeAt(0);
  // paths: a loop round the park, a cross path
  const inset = 1.0, x0 = r.x + inset, y0 = r.y + inset, x1 = r.x + r.w - inset, y1 = r.y + r.h - inset;
  if (!far) {
    line([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]], night ? "#5a5240" : "#9a8a68", Math.max(1.5, z * 0.3));
    line([[x0, (y0 + y1) / 2], [x1, (y0 + y1) / 2]], night ? "#5a5240" : "#9a8a68", Math.max(1.5, z * 0.25));
  }
  if (b.id === "south-park") {   // the pond, with its reeds
    const cx = r.x + r.w / 2, cy = r.y + r.h * 0.3, ring = [];
    for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2; ring.push([cx + Math.cos(a) * r.w * 0.28, cy + Math.sin(a) * r.h * 0.13]); }
    G.poly(ptsOf(Q, ring, 0.013), night ? "#12324a" : "#3b82b6", "rgba(255,255,255,0.25)");
  }
  if (b.id === "village-green" && !far) {   // the playground: a frame, the swings, the slide
    const px = r.x + r.w * 0.5, py = r.y + r.h * 0.72;
    G.poly(ptsOf(Q, [[px - 2, py - 1.2], [px + 2, py - 1.2], [px + 2, py + 1.2], [px - 2, py + 1.2]], 0.012), night ? "#4a3a2a" : "#b8925a");
    for (const dx of [-1.4, 1.4]) line([[px + dx, py - 0.6], [px + dx, py - 0.6]], "#000", 1);
    ctx.strokeStyle = "#dc2626"; ctx.lineWidth = Math.max(1, z * 0.07); ctx.beginPath(); const A = Q(px - 1.5, py, 1.1), B = Q(px + 0.2, py, 1.1), C = Q(px - 1.5, py, 0), D = Q(px + 0.2, py, 0); ctx.moveTo(C[0], C[1]); ctx.lineTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(D[0], D[1]); ctx.stroke();
    const sw = mt != null ? Math.sin(mt * 60 * 2) * 0.25 : 0; ctx.strokeStyle = "#9ca3af"; ctx.lineWidth = 1; ctx.beginPath(); for (const sx of [px - 1.1, px - 0.4]) { const T = Q(sx, py, 1.1), S = Q(sx + sw, py, 0.35); ctx.moveTo(T[0], T[1]); ctx.lineTo(S[0], S[1]); } ctx.stroke();
    line([[px + 0.8, py - 0.6], [px + 1.9, py + 0.8]], "#facc15", Math.max(1.5, z * 0.18), 0.6);
  }
  if (b.id === "north-park" && !far) {   // the dog run's fence
    const fx0 = r.x + r.w * 0.62, fy0 = r.y + r.h * 0.58, fx1 = r.x + r.w - 1.8, fy1 = r.y + r.h - 1.8;
    line([[fx0, fy0], [fx1, fy0], [fx1, fy1], [fx0, fy1], [fx0, fy0]], "rgba(200,200,200,0.7)", 1, 0.35);
  }
  // trees round the edges and in groves, fixed per park
  const n = Math.round((r.w * r.h) / 14);
  for (let i = 0; i < n; i++) {
    const u = h1(seed, i), v = h1(seed + 7, i);
    const x = r.x + 0.8 + u * (r.w - 1.6), y = r.y + 0.8 + v * (r.h - 1.6);
    if (b.id === "south-park" && Math.abs(x - (r.x + r.w / 2)) < r.w * 0.33 && Math.abs(y - (r.y + r.h * 0.3)) < r.h * 0.17) continue;   // not in the pond
    if (b.id === "village-green" && Math.abs(x - (r.x + r.w * 0.5)) < 2.4 && Math.abs(y - (r.y + r.h * 0.72)) < 1.6) continue;
    if (far) { const [sx, sy] = Q(x, y, 0.8); ctx.fillStyle = night ? "#173d1f" : "#2f7a3c"; ctx.beginPath(); ctx.arc(sx, sy, Math.max(1.5, z * 0.45), 0, Math.PI * 2); ctx.fill(); }
    else tree(G, x, y, z, night, 0.42 + 0.2 * h1(seed + 3, i));
  }
  return true;
}

// The airfield: grass, the runway (09/27) with its thresholds, numbers and centreline, the taxiway
// and its yellow line, the apron and its stands, the edge lights at night; the aircraft on the ground.
function drawAirfield(G, r, lod, mt, night) {
  const { ctx, Q } = G, far = lod === "far", z = G.z, Y = RUNWAY.y, hw = RUNWAY.w / 2;
  const quad = (x0, y0, x1, y1, fill, h = 0.012) => G.poly([Q(x0, y0, h), Q(x1, y0, h), Q(x1, y1, h), Q(x0, y1, h)], fill);
  quad(RUNWAY.x0 - 1.5, Y - hw, RUNWAY.x1 + 1.2, Y + hw, night ? "#1b1d21" : "#3a3c40");
  quad(STANDS[0] - 3.5, TAXI_Y - 0.6, RUNWAY.x1 - 6, TAXI_Y + 0.6, night ? "#1d1f23" : "#45474b");   // the taxiway
  quad(RUNWAY.x0 - 0.2, Y + hw, RUNWAY.x0 + 3.2, TAXI_Y, night ? "#1d1f23" : "#45474b");            // the link to the runway's west end
  quad(EXIT(), Y + hw, EXIT() + 2.4, TAXI_Y, night ? "#1d1f23" : "#45474b");                          // the rapid exit
  quad(STANDS[0] - 3.4, TAXI_Y + 0.6, STANDS[STANDS.length - 1] + 3.0, r.y + r.h - 0.3, night ? "#26282c" : "#5a5c5e");   // the apron
  if (!far) {
    ctx.lineWidth = 1;
    // the centreline dashes, the threshold stripes, the numbers
    ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.beginPath();
    for (let x = RUNWAY.x0 + 6; x < RUNWAY.x1 - 6; x += 3) { const A = Q(x, Y, 0.014), B = Q(x + 1.5, Y, 0.014); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
    for (const tx of [RUNWAY.x0 + 0.6, RUNWAY.x1 - 2.4]) for (let k = -3; k <= 3; k++) { if (!k) continue; const y = Y + k * hw / 4, A = Q(tx, y, 0.014), B = Q(tx + 1.8, y, 0.014); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
    ctx.stroke();
    ctx.strokeStyle = "rgba(250,204,21,0.85)"; ctx.beginPath();
    const ty = [[STANDS[0] - 3, TAXI_Y], [RUNWAY.x1 - 6.5, TAXI_Y]];
    ptsOf(Q, ty, 0.014).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    for (const sx of STANDS) { const A = Q(sx, TAXI_Y, 0.014), B = Q(sx, STAND_Y + 1.6, 0.014); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
    ctx.stroke();
    const num = (t, x, a) => { const [sx, sy] = Q(x, Y, 0.015); ctx.save(); ctx.font = `bold ${Math.max(6, Math.round(z * 0.9))}px 'Fira Mono', monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.fillText(t, sx, sy); ctx.restore(); void a; };
    num("09", RUNWAY.x0 + 4.2); num("27", RUNWAY.x1 - 4.4);
  }
  if (night) {   // the edge lights, the threshold greens and the far end's reds
    for (let x = RUNWAY.x0; x <= RUNWAY.x1; x += 2.5) for (const s of [-1, 1]) { const [sx, sy] = Q(x, Y + s * (hw + 0.15), 0.05); ctx.fillStyle = "#fef9c3"; ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 2, 2); }
    for (let k = -3; k <= 3; k++) { const [a, b2] = Q(RUNWAY.x0 - 0.3, Y + k * hw / 3.5, 0.05), [c, d] = Q(RUNWAY.x1 + 0.3, Y + k * hw / 3.5, 0.05); ctx.fillStyle = "#4ade80"; ctx.fillRect(Math.round(a) - 1, Math.round(b2) - 1, 2, 2); ctx.fillStyle = "#4ade80"; ctx.fillRect(Math.round(c) - 1, Math.round(d) - 1, 2, 2); }
    for (let x = STANDS[0] - 3; x < RUNWAY.x1 - 6.5; x += 2) { const [sx, sy] = Q(x, TAXI_Y, 0.05); ctx.fillStyle = "#60a5fa"; ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 2, 2); }
  }
  if (mt != null) for (const p of planesAt(mt)) if (p.alt <= 0.01) drawPlane(G, p, lod, night);
}
const EXIT = () => 236 - 1.2;

// ---- the aircraft ----------------------------------------------------------------------------------
// A twin-jet seen from above and the side: the fuselage (a long box, rounded off at the nose), the
// wings swept back, the tailplane, the fin with the airline's colour, the engines under the wings.
// x, y on the map, alt in storeys over the ground; heading (hx, hy).
export function drawPlane(G, p, lod, night) {
  const { ctx, Q } = G, z = G.z, far = lod === "far";
  const L = 6.2, Wf = 0.62, span = 6.4, H = 0.55, h0 = p.alt + 0.35;
  const fx = p.hx, fy = p.hy, sx = -fy, sy = fx;   // forward, starboard
  const P = (a, s, h) => Q(p.x + fx * a + sx * s, p.y + fy * a + sy * s, h);
  const poly = (pts, fill, stroke) => { ctx.fillStyle = fill; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); } };
  const line = p.line, body = night ? "#9aa3ad" : line.body, sh = night ? "#6b7280" : "#a1a1aa";
  if (p.alt > 0.05) {   // its shadow on the ground
    ctx.globalAlpha = Math.max(0.08, 0.35 - p.alt * 0.03);
    poly([P(L / 2, 0, 0.02), P(-L / 2, Wf, 0.02), P(-L / 2, -Wf, 0.02)], "#000");
    poly([P(0.4, -span / 2, 0.02), P(0.9, 0, 0.02), P(0.4, span / 2, 0.02), P(-0.5, 0, 0.02)], "#000");
    ctx.globalAlpha = 1;
  }
  // wings (below the fuselage's top), then the fuselage, then the fin
  const wing = [P(0.9, 0, h0 + 0.2), P(-0.6, span / 2, h0 + 0.15), P(-1.3, span / 2, h0 + 0.15), P(-0.9, 0, h0 + 0.2), P(-1.3, -span / 2, h0 + 0.15), P(-0.6, -span / 2, h0 + 0.15)];
  poly(wing, night ? "#7b838c" : "#c7ccd2", far ? null : "rgba(0,0,0,0.25)");
  if (!far) for (const s of [-1.3, 1.3]) { const c = P(0.1, s, h0 + 0.05); ctx.fillStyle = night ? "#4b5563" : "#9ca3af"; ctx.beginPath(); ctx.ellipse(c[0], c[1], z * 0.32, z * 0.18, 0, 0, Math.PI * 2); ctx.fill(); }
  poly([P(-L / 2 + 0.4, 0, h0 + 0.25), P(-L / 2, span * 0.18, h0 + 0.25), P(-L / 2 - 0.2, 0, h0 + 0.25), P(-L / 2, -span * 0.18, h0 + 0.25)], night ? "#7b838c" : "#c7ccd2");
  // the fuselage: its side (the visible one) and its top
  const side = [P(L / 2, 0, h0 + H * 0.4), P(L / 2 - 0.6, Wf / 2, h0 + H), P(-L / 2, Wf / 2, h0 + H), P(-L / 2, Wf / 2, h0), P(L / 2 - 0.6, Wf / 2, h0)];
  const side2 = [P(L / 2, 0, h0 + H * 0.4), P(L / 2 - 0.6, -Wf / 2, h0 + H), P(-L / 2, -Wf / 2, h0 + H), P(-L / 2, -Wf / 2, h0), P(L / 2 - 0.6, -Wf / 2, h0)];
  poly(side, sh); poly(side2, sh);
  poly([P(L / 2, 0, h0 + H * 0.6), P(L / 2 - 0.6, Wf / 2, h0 + H), P(-L / 2, Wf / 2, h0 + H), P(-L / 2 - 0.1, 0, h0 + H), P(-L / 2, -Wf / 2, h0 + H), P(L / 2 - 0.6, -Wf / 2, h0 + H)], body, far ? null : "rgba(0,0,0,0.3)");
  if (!far) {
    // the cheat line and the windows
    ctx.strokeStyle = line.stripe; ctx.lineWidth = Math.max(1, z * 0.08); ctx.beginPath(); for (const s of [Wf / 2, -Wf / 2]) { const A = P(L / 2 - 0.7, s, h0 + H * 0.55), B = P(-L / 2 + 0.3, s, h0 + H * 0.55); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke();
    const cock = P(L / 2 - 0.5, 0, h0 + H * 0.95); ctx.fillStyle = night ? "#fde68a" : "#1f2937"; ctx.fillRect(cock[0] - z * 0.12, cock[1] - z * 0.05, z * 0.24, Math.max(1, z * 0.08));
  }
  // the fin, in the airline's colour
  poly([P(-L / 2 + 0.9, 0, h0 + H), P(-L / 2 - 0.1, 0, h0 + H + 1.3), P(-L / 2 - 0.5, 0, h0 + H + 1.3), P(-L / 2 - 0.2, 0, h0 + H)], line.tail);
  if (!far && p.alt > 0.01 || night) {   // the beacons: red on top, the strobes at the wingtips
    const on = (Math.floor(Date.now() / 600) % 2) === 0;
    const top = P(0, 0, h0 + H + 0.05); ctx.fillStyle = on ? "#ef4444" : "#7f1d1d"; ctx.fillRect(Math.round(top[0]) - 1, Math.round(top[1]) - 1, 2, 2);
    if (night) { const l = P(-0.9, span / 2, h0 + 0.2), r2 = P(-0.9, -span / 2, h0 + 0.2); ctx.fillStyle = "#22c55e"; ctx.fillRect(Math.round(l[0]) - 1, Math.round(l[1]) - 1, 2, 2); ctx.fillStyle = "#ef4444"; ctx.fillRect(Math.round(r2[0]) - 1, Math.round(r2[1]) - 1, 2, 2); }
  }
}
// The sky pass (CityIso, after the city): the aircraft in the air, over everything.
export function drawSky(G, lod, mt, night) {
  for (const p of planesAt(mt)) if (p.alt > 0.01) drawPlane(G, p, lod, night);
}
void rot; void STOREY;
