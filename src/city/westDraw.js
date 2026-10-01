// THE PORT and THE OLD TOWN drawn (PHASE 2 step 3): the facades of westGeo.js's styles, the quay's
// gantries and the ship at the berth, the hull on the slipway, the yard's tower crane, the water
// of the berth and the slip. Merged into archDraw.js like the funnels' and the venues', with its
// kit (X: shade, faceText, windowGrid, door, glow, facesOf, rowFace, rowRoof, clockFace, chapelSpire).

import { rot } from "./iso.js";

export const WEST_STYLES_DRAWN = ["tenement", "terrace", "walkup", "shopflats", "tavern", "customs", "museum", "cathedral", "covered", "quay", "shipyard"];
export const WEST_PROPS_DRAWN = ["gantry", "ship", "hull", "tcrane"];

export function westDeco(X) {
  const { shade, faceText, windowGrid, door, glow, rowFace, rowRoof, clockFace, chapelSpire } = X;
  // shops under flats: the flats' windows above, a shopfront and a striped awning at the street
  function shopFace(K, p, faces) {
    for (const f of faces) {
      const front = f.s === "s";
      windowGrid(K, f, p, { bay: 0.78, w: 0.42, y0: 0.3, y1: 0.8, glass: "#35444e", sill: shade("#c9b9a0", K.nf), from: 1 });
      K.flush();
      if (!front) continue;
      K.G.poly(f.q(0.06, 0.94, 0.08, 0.82, 0.01), K.night ? (K.env.lit > 0.05 ? "#fcd34d" : "#2a2418") : shade("#2a3a40", f.sh));
      door(K, f, 0.5, 0.32, 0.8, "#2a1a14", { lit: true });
      if (p.awning && K.lod !== "far") {
        const cols = [["#b91c1c", "#f1ede0"], ["#1d4ed8", "#f1ede0"], ["#15803d", "#f1ede0"], ["#a16207", "#f1ede0"]][(p.house || 0) % 4];
        for (let i = 0; i < 6; i++) K.G.poly([f.F(i / 6, 1.0, 0), f.F((i + 1) / 6, 1.0, 0), f.F((i + 1) / 6, 0.86, 0.38), f.F(i / 6, 0.86, 0.38)], shade(cols[i % 2], 1.05 * K.nf));
      }
    }
  }
  // a pub: small-paned windows, the name over the door, warm inside after dark
  function tavernFace(K, p, faces) {
    for (const f of faces) {
      windowGrid(K, f, p, { bay: 0.9, w: 0.45, y0: 0.3, y1: 0.75, glass: "#3a3226", sill: shade("#c9b9a0", K.nf), warm: true });
      K.flush();
      if (f.s !== "s") continue;
      door(K, f, 0.5, 0.42, 0.8, "#3a1a10", { lit: true });
      if (K.lod !== "far") faceText(K, f, 0.5, 1.12, K.env.name || "THE PUB", 0.11, K.night ? "#fde68a" : "#f5ead8", { stroke: "#2a140c", glow: K.night ? "rgba(253,230,138,0.35)" : null });
    }
  }
  // limestone, tall windows; a portico of columns with the building's name on its frieze; a clock
  function civicStone(K, p, faces) {
    const G = K.G;
    for (const f of faces) {
      if (p.portico) {
        if (f.s !== "s") { G.poly(f.q(0, 1, p.h1 - 0.5, p.h1, 0), shade("#c2b89e", f.sh * K.nf)); continue; }
        for (let i = 0; i < 3; i++) G.poly(f.q(-0.02, 1.02, i * 0.08, (i + 1) * 0.08, 0.25 - i * 0.08), shade("#b8ae94", (1.1 - i * 0.05) * K.nf));
        for (let k = 0; k < 6; k++) { const tc = 0.08 + 0.84 * k / 5; G.poly(f.q(tc - 0.03, tc + 0.03, 0.24, p.h1 - 0.5, 0.05), shade("#e4dcc6", f.sh * K.nf)); }
        G.poly(f.q(0, 1, p.h1 - 0.5, p.h1, 0.02), shade("#d6ceb6", f.sh * K.nf));
        if (K.lod !== "far") faceText(K, f, 0.5, p.h1 - 0.25, K.env.name || "", 0.09, "#4a4232", { d: 0.03 });
        continue;
      }
      if (p.clock) { if (f.len > 1.2 && K.lod !== "far") clockFace(K, f, p.clock); continue; }
      windowGrid(K, f, p, { bay: 1.1, w: 0.36, y0: 0.2, y1: 0.85, glass: "#2d3942", sill: shade("#e0d8c0", K.nf), arch: 0.08 });
      K.flush();
      if (p.cornice && K.lod !== "far") G.poly(f.q(-0.005, 1.005, p.h1 - 0.2, p.h1, 0.12), shade("#d8cfb4", f.sh * 1.1 * K.nf));
    }
  }
  // the cathedral: lancet windows, glass that glows after dark, the great door under the rose
  function cathedralFace(K, p, faces) {
    for (const f of faces) {
      windowGrid(K, f, p, { bay: 0.9, w: 0.28, y0: 0.15, y1: 0.85, arch: 0.25, glass: K.night ? "#7a3a8a" : "#3a2e4a", warm: false });
      K.flush();
      if (f.s === "s" && p.door) door(K, f, 0.5, 0.6, 1.2, "#2a1c12", { arch: 0.35, lit: true });
    }
  }
  // the covered market: tall arched windows under the vault, the stalls' awning, the sign
  function coveredFace(K, p, faces) {
    for (const f of faces) {
      windowGrid(K, f, p, { bay: 1.3, w: 0.7, y0: 0.2, y1: 0.75, arch: 0.3, glass: "#3a3a36", from: 1 });
      K.flush();
      if (f.s !== "s") continue;
      K.G.poly(f.q(0.03, 0.97, 0, 0.9, 0.01), K.night ? "#3a2a14" : "#2a241c");
      for (let i = 0; i < 14; i++) K.G.poly([f.F(i / 14, 1.0, 0), f.F((i + 1) / 14, 1.0, 0), f.F((i + 1) / 14, 0.86, 0.35), f.F(i / 14, 0.86, 0.35)], shade(i % 2 ? "#f1ede0" : "#15803d", 1.05 * K.nf));
      if (K.lod !== "far") faceText(K, f, 0.5, 1.55, "THE COVERED MARKET // EST. BEFORE", 0.14, K.night ? "#fde68a" : "#f5f0e0", { stroke: "#2a1a10", glow: K.night ? "rgba(253,230,138,0.35)" : null });
    }
  }
  // the quay office and the yard's shed: plain windows, a door, the sign
  function portFace(K, p, faces) {
    for (const f of faces) {
      windowGrid(K, f, p, { bay: 1.0, w: 0.55, y0: 0.4, y1: 0.8, glass: "#3a4a4a", warm: false });
      K.flush();
      if (f.s !== p.door) continue;
      door(K, f, 0.5, p.win === "shed" ? 1.6 : 0.4, p.win === "shed" ? 1.6 : 0.8, p.win === "shed" ? "#2a2a28" : "#1f2d36", { lit: true });
      if (p.sign && K.lod !== "far") faceText(K, f, 0.5, p.h1 - 0.35, p.sign, 0.12, K.night ? "#fdba74" : "#f5e6d0", { glow: K.night ? "rgba(253,186,116,0.35)" : null });
    }
  }
  return {
    deco: {
      tenement: { face: rowFace, roof: rowRoof }, terrace: { face: rowFace, roof: rowRoof }, walkup: { face: rowFace, roof: rowRoof },
      shopflats: { face: shopFace, roof: rowRoof }, tavern: { face: tavernFace },
      customs: { face: civicStone, roof: chapelSpire }, museum: { face: civicStone },
      cathedral: { face: cathedralFace, roof: chapelSpire }, covered: { face: coveredFace },
      quay: { face: portFace }, shipyard: { face: portFace },
    },
    far: {},
  };
  void glow;
}

// ---- the ground: the berth's water, the slipway ------------------------------------------------
export function drawWestGround(G, g, env, shade) {
  const { Q, ctx } = G, nf = env.night ? 0.7 : 1, far = env.lod === "far";
  const rect = (fill) => G.poly([Q(g.x0, g.y0, 0.01), Q(g.x1, g.y0, 0.01), Q(g.x1, g.y1, 0.01), Q(g.x0, g.y1, 0.01)], fill);
  if (g.k === "water") {
    rect(shade("#1f5f86", nf));
    if (!far) { ctx.strokeStyle = "rgba(232,244,248,0.18)"; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 1; i < 4; i++) { const y = g.y0 + (g.y1 - g.y0) * i / 4; const A = Q(g.x0 + 0.3, y, 0.012), B = Q(g.x1 - 0.3, y, 0.012); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke(); }
    return true;
  }
  if (g.k === "slip") {
    rect(shade("#5a5852", nf));
    if (!far) { ctx.strokeStyle = "rgba(160,170,165,0.7)"; ctx.lineWidth = 1; ctx.beginPath(); for (const t of [0.3, 0.7]) { const x = g.x0 + (g.x1 - g.x0) * t, A = Q(x, g.y0 + 0.2, 0.013), B = Q(x, g.y1, 0.013); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke(); }
    return true;
  }
  return false;
}

// ---- yard props --------------------------------------------------------------------------------
export function drawWestYard(K, p, env, X) {
  const { G, ctx, Q } = K, far = env.lod === "far", nf = K.nf, { shade, facesOf } = X;
  const blockOf = (c, col) => { for (const f of facesOf(c, G)) G.poly(f.q(0, 1, c.h0, c.h1), shade(col, f.sh * nf)); G.poly([Q(c.x0, c.y0, c.h1), Q(c.x1, c.y0, c.h1), Q(c.x1, c.y1, c.h1), Q(c.x0, c.y1, c.h1)], shade(col, 1.15 * nf)); };
  const vline = (x, y, h0, h1, col, w) => K.line(Q(x, y, h0), Q(x, y, h1), col, w);
  const sorted = (list) => list.sort((a, b) => { const [ua, va] = rot((a.x0 + a.x1) / 2, (a.y0 + a.y1) / 2, G.r), [ub, vb] = rot((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, G.r); return (ua + va) - (ub + vb) || a.h0 - b.h0; });
  if (p.k === "gantry") {
    // a ship-to-shore crane: four legs straddling the quay's edge, the girder out over the water
    const H = 3.4, w = Math.max(1.5, K.z * 0.1), col = "#dc2626";
    for (const [x, y] of [[p.x0, p.y0], [p.x1, p.y0], [p.x0, p.y1], [p.x1, p.y1]]) vline(x, y, 0, H, col, w);
    K.line(Q(p.x0, p.y0, H), Q(p.x1, p.y0, H), col, w); K.line(Q(p.x0, p.y1, H), Q(p.x1, p.y1, H), col, w);
    const mx = (p.x0 + p.x1) / 2, reach = 5.2, back = 2;
    K.line(Q(mx, p.y0 - back, H + 0.6), Q(mx, p.y1 + reach, H + 0.6), col, w * 1.3);
    K.line(Q(mx, p.y0, H), Q(mx, p.y0 - back, H + 0.6), col, w); K.line(Q(mx, p.y1, H), Q(mx, p.y1 + reach * 0.5, H + 0.6), col, w);
    blockOf({ x0: mx - 0.35, y0: p.y0 + 0.2, x1: mx + 0.35, y1: p.y0 + 0.9, h0: H - 0.1, h1: H + 0.5 }, "#e5e7eb");
    const t = (Math.sin((K.t || 0) * 0.25) + 1) / 2, ty = p.y0 + (p.y1 + reach - p.y0) * t, hk = H - 0.4 - 1.6 * Math.abs(Math.sin((K.t || 0) * 0.5));
    if (!far) { K.line(Q(mx, ty, H + 0.55), Q(mx, ty, hk), "#333", 1); blockOf({ x0: mx - 0.3, y0: ty - 0.15, x1: mx + 0.3, y1: ty + 0.15, h0: hk - 0.42, h1: hk }, "#1d4ed8"); }
    if (env.night) { const [x, y] = Q(mx, p.y1 + reach, H + 0.7); ctx.fillStyle = "#f87171"; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3); }
    return true;
  }
  if (p.k === "ship") {
    // a container ship at the berth: the hull, the deck's stacks, the bridge at the stern
    const hull = { x0: p.x0, y0: p.y0 + 0.2, x1: p.x1, y1: p.y1 - 0.2, h0: -0.1, h1: 0.7 };
    for (const f of facesOf(hull, G)) { G.poly(f.q(0, 1, -0.1, 0.7), shade("#1f2937", f.sh * nf)); G.poly(f.q(0, 1, -0.1, 0.12), shade("#991b1b", f.sh * nf)); }
    G.poly([Q(hull.x0, hull.y0, 0.7), Q(hull.x1, hull.y0, 0.7), Q(hull.x1, hull.y1, 0.7), Q(hull.x0, hull.y1, 0.7)], shade("#4b5563", 1.1 * nf));
    const cols = ["#b91c1c", "#1d4ed8", "#c2410c", "#15803d", "#6d28d9", "#a16207"], boxes = [];
    const L = p.x1 - p.x0, bayW = 1.0, n = Math.floor((L - 4) / bayW);
    for (let i = 0; i < n; i++) for (let r = 0; r < 2; r++) { const tiers = 1 + ((i * 7 + r * 3) % 3); for (let l = 0; l < tiers; l++) boxes.push({ x0: p.x0 + 3.2 + i * bayW, y0: hull.y0 + 0.25 + r * 0.9, x1: p.x0 + 3.2 + i * bayW + 0.92, y1: hull.y0 + 1.05 + r * 0.9, h0: 0.7 + l * 0.4, h1: 1.1 + l * 0.4, c: cols[(i + r * 2 + l) % cols.length] }); }
    boxes.push({ x0: p.x0 + 0.6, y0: hull.y0 + 0.3, x1: p.x0 + 2.4, y1: hull.y1 - 0.3, h0: 0.7, h1: 2.6, c: "#e5e7eb", bridge: true });
    for (const c of sorted(boxes)) { blockOf(c, c.c); if (c.bridge && !far) for (const f of facesOf(c, G)) G.poly(f.q(0.1, 0.9, 2.2, 2.45, 0.01), env.night ? "#fde68a" : "#1f2937"); }
    if (env.night) { const [x, y] = Q(p.x0 + 1.5, (p.y0 + p.y1) / 2, 3.0); ctx.fillStyle = "#f5f5f5"; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2); }
    return true;
  }
  if (p.k === "hull") {
    // a hull on the slipway, plated in primer, ribs still showing aft, scaffolding along it
    const c = { x0: p.x0 + 0.6, y0: p.y0, x1: p.x1 - 0.6, y1: p.y1, h0: 0, h1: 1.6 };
    for (const f of facesOf(c, G)) {
      G.poly(f.q(0, 1, 0, 1.6), shade("#9a3412", f.sh * nf));
      if (!far) { ctx.strokeStyle = "rgba(40,20,10,0.5)"; ctx.lineWidth = 1; ctx.beginPath(); const m = Math.max(2, Math.round(f.len * 1.5)); for (let k = 1; k < m; k++) { const A = f.F(k / m, 0), B = f.F(k / m, 1.6); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke(); }
    }
    G.poly([Q(c.x0, c.y0, 1.6), Q(c.x1, c.y0, 1.6), Q(c.x1, c.y1, 1.6), Q(c.x0, c.y1, 1.6)], shade("#57534e", 1.1 * nf));
    if (!far) for (let y = p.y0 + 0.5; y < p.y1; y += 1.4) { vline(p.x0 + 0.2, y, 0, 2.0, "#a8a29e", 1); vline(p.x1 - 0.2, y, 0, 2.0, "#a8a29e", 1); }
    if (env.night) { const [x, y] = Q((c.x0 + c.x1) / 2, c.y0 + 1, 1.7); ctx.fillStyle = "rgba(253,186,116,0.8)"; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3); }   // a welder's arc
    return true;
  }
  if (p.k === "tcrane") {
    const base = 0, w = 0.16, top = 5.2;
    blockOf({ x0: p.x - w, y0: p.y - w, x1: p.x + w, y1: p.y + w, h0: base, h1: top }, "#eab308");
    const th = 1.2 + (K.t > 0 ? Math.sin(K.t * 0.05) * 0.7 : 0), dx = Math.cos(th), dy = Math.sin(th);
    K.line(Q(p.x - dx * 1.6, p.y - dy * 1.6, top), Q(p.x + dx * 7, p.y + dy * 7, top), "#eab308", Math.max(1.5, K.z * 0.1));
    if (!far) K.line(Q(p.x + dx * 4, p.y + dy * 4, top), Q(p.x + dx * 4, p.y + dy * 4, 1.8), "#9ca3af", 1);
    return true;
  }
  return false;
}
