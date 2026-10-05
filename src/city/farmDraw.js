// THE FARMLAND drawn (PHASE 2 step 5): the facades of farmGeo.js's styles, their ground (the cottage
// gardens, the pasture), their yard props (the cows, the bales) and the open lots: the fields (furrows
// by crop, a tractor at work), the orchards (rows of fruit trees). Merged into archDraw.js like the
// Suburbs', with its kit (X: shade, faceText, windowGrid, door, glow, facesOf). THE COMMUNITY FARM is
// a civic parcel (civicDraw.js), drawn there with LOT 0x6F07.

export const FARM_STYLES_DRAWN = ["cottage", "manor", "dairy", "elevator"];
export const FARM_PROPS_DRAWN = ["cow", "bale"];
export const FARM_MAT = { whitewash: "#e4ddcc", barnred: "#9b2c22" };
export const FARM_ROOF = { whitewash: "#5a4a3a", barnred: "#3f3f46" };
const frac = (v) => ((v % 1) + 1) % 1;
const h1 = (a, b = 0) => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 4294967296; };

export function farmDeco(X) {
  const { shade, faceText, windowGrid, door } = X;
  function cottageFace(K, p, faces) {
    for (const f of faces) {
      const front = f.s === p.door;
      windowGrid(K, f, p, { bay: 0.9, w: 0.32, y0: 0.35, y1: 0.7, glass: "#3a4048", sill: shade("#f2ede2", K.nf), warm: true, skip: front ? (s, k, cols) => s === 0 && k === Math.floor(cols / 2) : null });
      K.flush();
      if (front) door(K, f, 0.5, 0.3, 0.75, ["#365314", "#7f1d1d", "#1e3a8a", "#713f12"][(p.house || 0) % 4], { lit: true });
    }
  }
  function manorFace(K, p, faces) {
    for (const f of faces) {
      windowGrid(K, f, p, { bay: 0.85, w: 0.34, y0: 0.25, y1: 0.8, glass: "#2f3a42", sill: shade("#e8e0cc", K.nf), warm: true });
      K.flush();
      if (f.s === p.door) {
        door(K, f, 0.5, 0.5, 0.95, "#2a1a10", { lit: true });
        if (K.lod !== "far") faceText(K, f, 0.5, p.h1 - 0.25, "THE MANOR", 0.11, "#f5ead8", { stroke: "#2a2018" });
      }
    }
  }
  function barnFace(K, p, faces) {
    const { G, ctx } = K;
    for (const f of faces) {
      if (p.win === "parlour") { windowGrid(K, f, p, { bay: 0.8, w: 0.4, y0: 0.4, y1: 0.75, glass: "#3c4a52" }); K.flush(); if (f.s === p.door) door(K, f, 0.5, 0.5, 0.85, "#1f2937", { lit: true }); continue; }
      // the white trim, the big doors with their X, the loft hatch
      G.poly(f.q(0, 1, p.h1 - 0.08, p.h1, 0.01), shade("#f1ede4", f.sh * K.nf));
      if (f.s !== p.door) continue;
      for (const t of [0.3, 0.7]) {
        G.poly(f.q(t - 0.08, t + 0.08, 0, 1.25, 0.01), shade("#7f1d1d", f.sh * K.nf));
        if (K.lod !== "far") { const a = f.F(t - 0.08, 0.02, 0.02), b = f.F(t + 0.08, 1.23, 0.02), c = f.F(t - 0.08, 1.23, 0.02), d = f.F(t + 0.08, 0.02, 0.02); ctx.strokeStyle = shade("#f5f5f5", K.nf); ctx.lineWidth = Math.max(1, K.z * 0.04); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.stroke(); }
      }
      if (p.sign && K.lod !== "far") faceText(K, f, 0.5, p.h1 + 0.35, p.sign, 0.2, "#f8fafc", { stroke: "#3f0f0a" });
    }
  }
  function elevatorFace(K, p, faces) {
    for (const f of faces) {
      if (p.win === "headhouse") {
        windowGrid(K, f, p, { bay: 0.9, w: 0.3, y0: p.h0 + 0.5, y1: p.h0 + 1.6, glass: "#2f3a40" });
        K.flush();
        if (p.sign && f.s === "s" && K.lod !== "far") faceText(K, f, 0.5, p.h0 + 1.2, p.sign, 0.3, "#f8fafc", { stroke: "#1f2937" });
        continue;
      }
      windowGrid(K, f, p, { bay: 1, w: 0.5, y0: 0.4, y1: 0.8, glass: "#3a3a3a" });
      K.flush();
      if (f.s === p.door) door(K, f, 0.5, 0.6, 0.9, "#3f3f46");
    }
  }
  return { deco: { cottage: { face: cottageFace }, manor: { face: manorFace }, dairy: { face: barnFace }, elevator: { face: elevatorFace } }, far: {} };
}

// ---- the ground: the cottage gardens, the pasture -----------------------------------------------
export function drawFarmGround(G, g, env, shade) {
  const { Q, ctx } = G, nf = env.night ? 0.7 : 1, far = env.lod === "far";
  const rect = (fill, h = 0.011) => G.poly([Q(g.x0, g.y0, h), Q(g.x1, g.y0, h), Q(g.x1, g.y1, h), Q(g.x0, g.y1, h)], fill);
  if (g.k === "garden") {
    rect(shade("#3f6b2c", nf));
    if (!far) { ctx.strokeStyle = "rgba(240,235,220,0.5)"; ctx.lineWidth = 1; ctx.beginPath(); const A = Q(g.x0, g.y1 - 0.1, 0.25), B = Q(g.x1, g.y1 - 0.1, 0.25); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); }   // the picket fence
    return true;
  }
  if (g.k === "pasture") {
    rect(shade("#4a7a34", nf));
    if (!far) { ctx.strokeStyle = "rgba(120,90,60,0.8)"; ctx.lineWidth = 1; ctx.beginPath(); for (const [a, b] of [[[g.x0, g.y0], [g.x1, g.y0]], [[g.x1, g.y0], [g.x1, g.y1]], [[g.x1, g.y1], [g.x0, g.y1]], [[g.x0, g.y1], [g.x0, g.y0]]]) { const A = Q(a[0], a[1], 0.3), B = Q(b[0], b[1], 0.3); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke(); }
    return true;
  }
  return false;
}

// ---- yard props: a cow, a round bale ---------------------------------------------------------------
export function drawFarmYard(K, p, env, X) {
  const { G, Q, ctx } = K, { shade, facesOf } = X, nf = K.nf;
  if (p.k === "cow") {
    const ax = (p.c || 0) % 2 === 0, L = 0.7, W = 0.3, c = ax ? { x0: p.x - L / 2, y0: p.y - W / 2, x1: p.x + L / 2, y1: p.y + W / 2, h0: 0.2, h1: 0.5 } : { x0: p.x - W / 2, y0: p.y - L / 2, x1: p.x + W / 2, y1: p.y + L / 2, h0: 0.2, h1: 0.5 };
    const col = (p.c || 0) % 3 === 1 ? "#5a3a24" : "#f2f2ee";
    for (const f of facesOf(c, G)) G.poly(f.q(0, 1, c.h0, c.h1), shade(col, f.sh * nf));
    G.poly([Q(c.x0, c.y0, c.h1), Q(c.x1, c.y0, c.h1), Q(c.x1, c.y1, c.h1), Q(c.x0, c.y1, c.h1)], shade(col, 1.15 * nf));
    if (K.lod !== "far" && col !== "#5a3a24") { const s = Q(p.x + (ax ? 0.08 : 0), p.y + (ax ? 0 : 0.08), c.h1 + 0.01); ctx.fillStyle = "#111"; ctx.fillRect(s[0] - K.z * 0.08, s[1] - K.z * 0.05, K.z * 0.16, K.z * 0.08); }   // a patch
    const hd = ax ? [c.x1 + 0.08, p.y] : [p.x, c.y1 + 0.08], h = Q(hd[0], hd[1], 0.5); ctx.fillStyle = shade(col, 0.9 * nf); ctx.fillRect(h[0] - K.z * 0.09, h[1] - K.z * 0.09, K.z * 0.18, K.z * 0.16);
    return true;
  }
  if (p.k === "bale") {
    const [x, y] = Q(p.x, p.y, 0.3), r = Math.max(2, K.z * 0.32);
    ctx.fillStyle = shade("#d6b25e", nf); ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    if (K.lod !== "far") { ctx.strokeStyle = "rgba(120,90,40,0.6)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y, r * 0.5, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke(); }
    return true;
  }
  return false;
}

// ---- the open lots: the fields and the orchards (CityIso calls this over the lot's fill) ----------
export const FARM_LOT_FILL = { "the-fields": "#6a5a2a", "the-orchards": "#2c5a2a" };
const CROPS = [["#c9a227", "#e0bc3a"], ["#8a9a3a", "#a3b44a"], ["#6a8a2a", "#86a83a"], ["#b08a3a", "#c9a24a"]];
export function drawFarmLot(G, b, lod, mt, night) {
  const { ctx, Q } = G, r = b.rect, far = lod === "far", z = G.z, nf = night ? 0.6 : 1;
  if (!FARM_LOT_FILL[b.id]) return false;
  const dim = (hex) => { const n = parseInt(hex.slice(1), 16), k = (c) => Math.round(((n >> c) & 255) * nf); return `rgb(${k(16)},${k(8)},${k(0)})`; };
  if (b.id === "the-fields") {
    // four fields of crop, their furrows along y, hedges between; a tractor working the first
    const n = 4, w = (r.w - 1.2) / n;
    for (let i = 0; i < n; i++) {
      const x0 = r.x + 0.6 + i * w + 0.25, x1 = x0 + w - 0.5, [a, c] = CROPS[i];
      G.poly([Q(x0, r.y + 0.6, 0.012), Q(x1, r.y + 0.6, 0.012), Q(x1, r.y + r.h - 0.6, 0.012), Q(x0, r.y + r.h - 0.6, 0.012)], dim(a));
      if (!far) { ctx.strokeStyle = dim(c); ctx.lineWidth = Math.max(1, z * 0.12); ctx.beginPath(); for (let x = x0 + 0.35; x < x1; x += 0.7) { const A = Q(x, r.y + 0.8, 0.014), B = Q(x, r.y + r.h - 0.8, 0.014); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke(); }
    }
    if (!far && mt != null) {
      // the tractor runs up and down the first field, a furrow an hour
      const t = frac(mt / 2), up = Math.floor(mt / 2) % 2 === 0, tx = r.x + 1.3 + (Math.floor(mt) % 8) * 0.7, ty = r.y + 1 + (up ? t : 1 - t) * (r.h - 2);
      const box = (x0, y0, x1, y1, h0, h1, col) => { G.poly([Q(x0, y1, h0), Q(x1, y1, h0), Q(x1, y1, h1), Q(x0, y1, h1)], dim(col)); G.poly([Q(x1, y0, h0), Q(x1, y1, h0), Q(x1, y1, h1), Q(x1, y0, h1)], dim(col)); G.poly([Q(x0, y0, h1), Q(x1, y0, h1), Q(x1, y1, h1), Q(x0, y1, h1)], dim(col)); };
      box(tx - 0.3, ty - 0.45, tx + 0.3, ty + 0.35, 0.15, 0.5, "#15803d"); box(tx - 0.25, ty - 0.45, tx + 0.25, ty - 0.05, 0.5, 0.85, "#166534");
    }
    return true;
  }
  // the orchards: rows of fruit trees on the grass, apples in season
  const seed = 17;
  for (let y = r.y + 1.4; y < r.y + r.h - 0.8; y += 2.2) for (let x = r.x + 1.2 + ((Math.round(y) % 2) ? 1.1 : 0); x < r.x + r.w - 0.8; x += 2.2) {
    const [tx, ty] = Q(x, y, 0), [cx, cy] = Q(x, y, 0.95), R = Math.max(far ? 1.5 : 2, z * 0.48);
    if (!far) { ctx.strokeStyle = "#4a3222"; ctx.lineWidth = Math.max(1, z * 0.08); ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(cx, cy); ctx.stroke(); }
    ctx.fillStyle = night ? "#173d1f" : "#2f7a34"; ctx.beginPath(); ctx.arc(cx, cy - z * 0.1, R, 0, Math.PI * 2); ctx.fill();
    if (!far) { ctx.fillStyle = h1(seed, Math.round(x * 7 + y * 13)) < 0.5 ? "#dc2626" : "#facc15"; for (let k = 0; k < 3; k++) ctx.fillRect(cx - R * 0.5 + k * R * 0.45, cy - R * 0.2 + (k % 2) * R * 0.35, Math.max(1, z * 0.08), Math.max(1, z * 0.08)); }
  }
  return true;
}
