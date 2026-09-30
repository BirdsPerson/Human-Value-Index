// The funnel buildings, drawn (the outside; the rooms are funnelProps.js). archDraw.js hands
// over its kit (shade, faceText, neonOn, windowGrid, door, bladeSign, glow...) and merges
// these into its style table, so each building is drawn like its neighbours: same light,
// same LOD, same neon rules (lit after dusk and flickering, a pale ghost by day).
//   THE ARCADE  the cabinet floor seen through the shopfront, screens glowing in each game's
//               colours; THE ARCADE in chasing neon; a pixel invader on the roof; PLAY blade
//   EB SHOP     display windows (sleeves, a turntable turning), the EB SHOP neon, the Union
//               lounge's lettering upstairs, dollar crates and a board on the pavement
//   EBTV        the sound stage with ELECTRIC BASEMENT TV on it, ON AIR when the channel is up
//               (now.json read by FunnelHost), a dish on the roof, the mast with its beacons
import { GAMES, cabColors, ebtvLive } from "./funnels.js";

export const FUNNEL_MAT = { arcadewall: "#2a1f3d" };
export const FUNNEL_ROOF = { arcadewall: "#1c1428" };
export const FUNNEL_STYLES_DRAWN = ["arcade", "recordshop", "station"];
export const FUNNEL_PROPS = ["aframe", "recordbin", "mast"];

const NEON = ["#f472b6", "#22d3ee", "#a78bfa", "#fbbf24"];
// The invader on the arcade's roof, 11 x 8.
const INVADER = ["00100000100", "00010001000", "00111111100", "01101110110", "11111111111", "10111111101", "10100000101", "00011011000"];

export function funnelDeco(X) {
  const { shade, faceText, neonOn, windowGrid, door, bladeSign, glow } = X;
  // Is the EBTV studio on air: the channel's now-playing answered lately; before it has
  // been asked (or in a check) the studio keeps its working hours.
  const onAir = (K) => { const l = ebtvLive(); return l == null ? K.env.hour >= 8 && K.env.hour < 20 : l; };

  function arcadeFace(K, p, faces) {
    const { ctx } = K;
    for (const f of faces) {
      const front = f.s === "s";
      if (front) {
        // the shopfront: dark glass, the cabinets behind it, each screen in its game's colours
        K.G.poly(f.q(0.05, 0.95, 0.12, 1.3, 0.01), K.night ? "#140d20" : shade("#3a3050", f.sh));
        const n = Math.max(4, Math.floor(f.len * 0.9));
        for (let k = 0; k < n; k++) {
          const tc = 0.08 + 0.84 * (k + 0.5) / n;
          if (Math.abs(tc - 0.5) < 0.07) continue;   // the door
          const g = GAMES[k % GAMES.length], [c1] = cabColors(g.slug), dark = g.status === "dev";
          K.bq("#07050c", f.q(tc - 0.022, tc + 0.022, 0.14, 1.02, 0.012));
          const lit = !dark && (!K.night || neonOn(K, k * 13 + 5, 0.03) > 0.5);
          K.bq(dark ? "#1a1a1e" : lit ? c1 : shade(c1, 0.5), f.q(tc - 0.017, tc + 0.017, 0.62, 0.86, 0.013));
          if (K.lod === "near") K.bq(dark ? "#3a2a2a" : "#fef3c7", f.q(tc - 0.019, tc + 0.019, 0.9, 0.98, 0.013));   // the marquee
        }
        K.flush();
        if (K.night && K.lod !== "far") { const c = f.F(0.5, 0.7, 0.2); glow(K, c[0], c[1], K.z * f.len * 0.35, "rgba(167,139,250,0.18)"); }
        door(K, f, 0.5, 0.8, 1.0, K.night ? "#f0abfc" : "#20182c", { lit: true });
        // the neon band: THE ARCADE, its colour chasing letter by letter
        const txt = "THE ARCADE", step = Math.floor((K.t || 0) * 3);
        const on = neonOn(K, 71, 0.04);
        for (let i = 0; i < txt.length; i++) {
          if (txt[i] === " ") continue;
          const col = NEON[(i + step) % NEON.length];
          faceText(K, f, 0.22 + 0.56 * i / (txt.length - 1), 1.62, txt[i], 0.3, K.night ? col : shade(col, 0.55), { d: 0.05, glow: K.night ? `${col}${on > 0.5 ? "88" : "22"}` : null });
        }
        faceText(K, f, 0.5, 1.4, "TOKENS // PRIZES // HIGH SCORES LOGGED", 0.075, K.night ? "#67e8f9" : "#3c6a74", { d: 0.05 });
        bladeSign(K, f, 0.96, 0.4, 2.2, "PLAY", "#22d3ee");
      } else {
        windowGrid(K, f, { ...p, h0: 1.7 }, { bay: 1.1, w: 0.4, y0: 0.15, y1: 0.7, glass: "#231a36", warm: false });
        K.flush();
      }
      // a neon rule under the cornice, chasing round the building
      if (K.lod !== "far") {
        const n = Math.max(3, Math.round(f.len * 2)), step = Math.floor((K.t || 0) * 4);
        for (let k = 0; k < n; k++) K.bq(K.night ? NEON[(k + step) % NEON.length] : shade(NEON[k % NEON.length], 0.45), f.q(k / n + 0.01, (k + 1) / n - 0.01, p.h1 - 0.3, p.h1 - 0.24, 0.02));
        K.flush();
      }
      if (p.cornice) K.G.poly(f.q(0, 1, p.h1 - 0.14, p.h1, 0.08), shade("#1a1226", f.sh * 1.3 * K.nf));
    }
    void ctx;
  }
  function arcadeRoof(K, p, faces) {
    if (!p.arcadeSign || K.lod === "far") return;
    const { Q } = K;
    const f = faces.find(x => x.s === "s") || faces[0];
    const y = f && f.s === "s" ? p.y1 - 1.1 : p.y0 + 1.1;
    const x0 = p.x0 + 3.2, x1 = p.x1 - 3.2, h0 = p.h1 + 0.2, h1 = p.h1 + 1.5;
    for (const x of [x0 + 0.3, x1 - 0.3]) K.line(Q(x, y, p.h1), Q(x, y, h0), "#3a3a3a", Math.max(1, K.z * 0.07));
    const face = { F: (t, h, d = 0) => Q(x0 + (x1 - x0) * t, y + d, h), len: x1 - x0 };
    K.G.poly([face.F(0, h1), face.F(1, h1), face.F(1, h0), face.F(0, h0)], "#120a1c", "#a78bfa");
    // the invader, pixel by pixel, bobbing a pixel as it marches
    const on = neonOn(K, 97, 0.03), bob = Math.floor((K.t || 0) * 1.5) % 2;
    const col = K.night ? `rgba(74,222,128,${on})` : "#3f7a52";
    const W = 11, H = 8, pw = 0.42 / W * 1.0, ph = (h1 - h0 - 0.3) / H;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (INVADER[r][c] !== "1") continue;
      const t0 = 0.08 + c * pw, hh = h1 - 0.15 - (r + bob * 0.3) * ph;
      K.bq(col, [face.F(t0, hh), face.F(t0 + pw, hh), face.F(t0 + pw, hh - ph), face.F(t0, hh - ph)]);
    }
    K.flush();
    faceText(K, face, 0.74, (h0 + h1) / 2 + 0.2, "1UP", 0.28, K.night ? `rgba(251,191,36,${on})` : "#8a6a2a", { glow: K.night ? "rgba(251,191,36,0.4)" : null });
    faceText(K, face, 0.74, (h0 + h1) / 2 - 0.3, "INSERT COIN", 0.12, K.night ? "#f472b6" : "#7a4a62");
    if (K.night) { const [sx, sy] = face.F(0.5, (h0 + h1) / 2); glow(K, sx, sy, K.z * 3.5, "rgba(167,139,250,0.2)"); }
  }

  function recordFace(K, p, faces) {
    const { ctx } = K;
    for (const f of faces) {
      const front = f.s === "s";
      windowGrid(K, f, { ...p, h0: 1.2 }, { bay: 1.1, w: 0.45, y0: 0.2, y1: 0.75, glass: "#34414a", sill: shade("#c8b8a0", K.nf) });
      K.flush();
      if (!front) { if (p.cornice) K.G.poly(f.q(0, 1, p.h1 - 0.12, p.h1, 0.08), shade("#6a3a2a", f.sh * 1.15 * K.nf)); continue; }
      // two display windows either side of the door, warm inside
      const win = K.night ? "#f6d58a" : shade("#8fb3c2", f.sh);
      for (const [a, b] of [[0.05, 0.41], [0.59, 0.95]]) {
        K.G.poly(f.q(a, b, 0.12, 1.02, 0.01), shade("#2a1a10", K.nf));
        K.G.poly(f.q(a + 0.01, b - 0.01, 0.16, 0.98, 0.012), win);
      }
      if (K.lod !== "far") {
        // left: sleeves on a rail; right: a turntable, the record turning, and a stack of LPs
        const sleeves = ["#dc2626", "#2563eb", "#eab308", "#16a34a", "#9333ea"];
        sleeves.forEach((c, i) => K.bq(c, f.q(0.08 + i * 0.064, 0.13 + i * 0.064, 0.46, 0.8, 0.014)));
        K.bq("#111", f.q(0.64, 0.8, 0.3, 0.42, 0.014));   // the deck
        K.bq("#6a4a2a", f.q(0.64, 0.8, 0.22, 0.3, 0.014));
        K.flush();
        if (K.lod === "near") {
          const c = f.F(0.72, 0.5, 0.016), r = K.z * 0.32, a = (K.t || 0) * 3.5;
          ctx.fillStyle = "#0a0a0a"; ctx.beginPath(); ctx.ellipse(c[0], c[1], r, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#dc2626"; ctx.beginPath(); ctx.ellipse(c[0], c[1], r * 0.3, r * 0.14, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(c[0] + Math.cos(a) * r * 0.7 - 1, c[1] + Math.sin(a) * r * 0.3 - 1, 2, 2);
        }
        for (let i = 0; i < 4; i++) K.bq(["#1f2937", "#7c2d12", "#1e3a8a", "#3f3f46"][i], f.q(0.84, 0.92, 0.2 + i * 0.07, 0.26 + i * 0.07, 0.014));
        K.flush();
      }
      door(K, f, 0.5, 0.55, 0.95, "#2a1a10", { lit: true });
      // the sign board and its neon
      K.G.poly(f.q(0.08, 0.92, 1.1, 1.5, 0.06), "#140a12", "rgba(0,0,0,0.6)");
      const on = neonOn(K, 53, 0.05);
      faceText(K, f, 0.4, 1.3, "EB SHOP", 0.26, K.night ? `rgba(244,114,182,${on})` : "#c05a8a", { d: 0.07, glow: K.night ? `rgba(244,114,182,${0.5 * on})` : null });
      faceText(K, f, 0.76, 1.33, "RECORDS", 0.08, K.night ? "#67e8f9" : "#9fd8e2", { d: 0.07 });
      faceText(K, f, 0.76, 1.22, "TAPES · ODDITIES", 0.07, K.night ? "#67e8f9" : "#9fd8e2", { d: 0.07 });
      faceText(K, f, 0.5, 2.0, "THE UNION LOUNGE", 0.09, K.night ? "#fde68a" : "#f5f0e0", { stroke: "#2a1a10", d: 0.02 });
      if (p.cornice) K.G.poly(f.q(0, 1, p.h1 - 0.12, p.h1, 0.08), shade("#6a3a2a", f.sh * 1.15 * K.nf));
    }
  }

  function stationFace(K, p, faces) {
    const { ctx } = K;
    for (const f of faces) {
      const front = f.s === "s";
      if (K.lod !== "far") { ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 1; ctx.beginPath(); const n = Math.floor(f.len * 4); for (let k = 1; k < n; k++) { const A = f.F(k / n, 0), B = f.F(k / n, p.h1); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke(); }
      if (!front) {
        if (f.len > 3 && K.lod !== "far") faceText(K, f, 0.5, 1.1, "EBTV", 0.55, K.night ? "#f472b6" : "#e5e7eb", { stroke: "#1a1a1e", glow: K.night ? "rgba(244,114,182,0.35)" : null });
        continue;
      }
      // the roller door, ON AIR over it, the name down the front
      K.G.poly(f.q(0.06, 0.32, 0, 1.4, 0.01), shade("#8a8a90", f.sh * K.nf));
      if (K.lod !== "far") { ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); for (let k = 1; k < 10; k++) { const A = f.F(0.06, 1.4 * k / 10, 0.012), B = f.F(0.32, 1.4 * k / 10, 0.012); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke(); }
      const live = onAir(K);
      K.G.poly(f.q(0.13, 0.25, 1.52, 1.84, 0.04), live ? "#b91c1c" : "#3a1414", "rgba(0,0,0,0.6)");
      faceText(K, f, 0.19, 1.68, "ON AIR", 0.13, live ? "#fee2e2" : "#6a3a3a", { d: 0.05, glow: live ? "rgba(239,68,68,0.7)" : null });
      if (live && K.night) { const c = f.F(0.19, 1.68, 0.1); glow(K, c[0], c[1], K.z * 2.2, "rgba(239,68,68,0.35)"); }
      faceText(K, f, 0.66, 1.45, "ELECTRIC BASEMENT", 0.17, K.night ? "#f9a8d4" : "#f1f5f9", { d: 0.02, stroke: "#1a1a1e", glow: K.night ? "rgba(244,114,182,0.35)" : null });
      faceText(K, f, 0.66, 1.08, "TELEVISION // EBSN", 0.1, K.night ? "#67e8f9" : "#cbd5e1", { d: 0.02, stroke: "#1a1a1e" });
      door(K, f, 0.9, 0.4, 0.8, "#1a1a1e", { lit: true });
    }
  }
  function stationRoof(K, p) {
    if (!p.dish || K.lod === "far") return;
    const { ctx, Q } = K;
    // the dish: a tilted bowl on a post, looking south-west at the sky
    const x = p.x0 + (p.x1 - p.x0) * 0.72, y = p.y0 + (p.y1 - p.y0) * 0.45;
    K.line(Q(x, y, p.h1 + 0.4), Q(x, y, p.h1 + 1.1), "#9ca3af", Math.max(1, K.z * 0.08));
    const [sx, sy] = Q(x, y, p.h1 + 1.3), r = K.z * 0.95;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(-0.5);
    ctx.fillStyle = shade("#e5e7eb", K.nf); ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade("#b8bec6", K.nf); ctx.beginPath(); ctx.ellipse(r * 0.1, 0, r * 0.75, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#6b7280"; ctx.lineWidth = Math.max(1, K.z * 0.05); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-r * 0.9, -r * 0.3); ctx.stroke();
    ctx.restore();
  }

  return {
    deco: {
      arcade: { face: arcadeFace, roof: arcadeRoof },
      recordshop: { face: recordFace },
      station: { face: stationFace, roof: stationRoof },
    },
    far: {
      arcade: (K, p, faces) => { const f = faces.find(x => x.s === "s"); if (f) K.G.poly(f.q(0.2, 0.8, 1.5, 1.8, 0.01), K.night ? "#a78bfa" : "#5a4a7a"); },
      recordshop: (K, p, faces) => { const f = faces.find(x => x.s === "s"); if (f) K.G.poly(f.q(0.08, 0.92, 1.1, 1.5, 0.01), K.night ? "#f472b6" : "#140a12"); },
      station: (K, p, faces) => { const f = faces.find(x => x.s === "s"); if (f && onAir(K)) K.G.poly(f.q(0.13, 0.25, 1.52, 1.84, 0.01), "#ef4444"); },
    },
  };
}

// The yard props: the A-frame board, the dollar crates, the broadcast mast.
export function drawFunnelYard(K, p, env, X) {
  const { shade, facesOf, glow } = X;
  const { ctx, Q, G } = K, nf = K.nf, far = env.lod === "far";
  switch (p.k) {
    case "aframe": {
      const c = { x0: p.x - 0.18, y0: p.y - 0.05, x1: p.x + 0.18, y1: p.y + 0.05, h0: 0, h1: 0.55 };
      for (const f of facesOf(c, G)) {
        G.poly(f.q(0, 1, 0, 0.55), shade("#3a2a1a", f.sh * nf));
        if (f.s === "s" && !far) {
          G.poly(f.q(0.1, 0.9, 0.08, 0.5, 0.005), "#1c2420");
          const [sx, sy] = f.F(0.5, 0.3, 0.01), fpx = Math.max(0, K.z * 0.22);
          if (fpx >= 4) { ctx.font = `bold ${Math.round(fpx)}px 'Fira Mono', monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#f1f5f9"; ctx.fillText(p.text || "OPEN", sx, sy); }
        }
      }
      break;
    }
    case "recordbin": {
      const c = { x0: p.x - 0.3, y0: p.y - 0.12, x1: p.x + 0.3, y1: p.y + 0.12, h0: 0, h1: 0.32 };
      for (const f of facesOf(c, G)) G.poly(f.q(0, 1, 0, 0.32), shade("#8a6a42", f.sh * nf));
      if (!far) {
        const cols = ["#dc2626", "#1d4ed8", "#eab308", "#111827", "#15803d", "#9333ea"];
        for (let i = 0; i < 6; i++) { const x = c.x0 + 0.06 + i * 0.09; G.poly([Q(x, c.y0 + 0.03, 0.32), Q(x + 0.05, c.y0 + 0.03, 0.32), Q(x + 0.05, c.y0 + 0.03, 0.48 + (i % 2) * 0.04), Q(x, c.y0 + 0.03, 0.48 + (i % 2) * 0.04)], shade(cols[i], nf)); }
        if (env.lod === "near") { const [sx, sy] = Q(p.x, p.y + 0.13, 0.2); ctx.font = `bold ${Math.max(6, Math.round(K.z * 0.16))}px 'Fira Mono', monospace`; ctx.textAlign = "center"; ctx.fillStyle = "#fef3c7"; ctx.fillText("$1", sx, sy); }
      }
      break;
    }
    case "mast": {
      // a lattice tower on three legs, braced, the beacons blinking red; the dish halfway up
      const H = 7.2, legs = [[-0.35, 0.3], [0.35, 0.3], [0, -0.35]];
      const leg = (i, h) => { const k = 1 - h / H * 0.85; return [p.x + legs[i][0] * k, p.y + legs[i][1] * k]; };
      const col = shade("#c0392b", nf), col2 = shade("#e5e7eb", nf), w = Math.max(1, K.z * 0.07);
      for (let i = 0; i < 3; i++) { const a = leg(i, 0), b = leg(i, H); K.line(Q(a[0], a[1], 0), Q(b[0], b[1], H), col, w); }
      if (!far) {
        ctx.strokeStyle = col2; ctx.lineWidth = Math.max(1, K.z * 0.03); ctx.beginPath();
        for (let h = 0; h < H - 0.4; h += 0.6) for (let i = 0; i < 3; i++) {
          const a = leg(i, h), b = leg((i + 1) % 3, h + 0.6), A = Q(a[0], a[1], h), B = Q(b[0], b[1], h + 0.6);
          ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]);
        }
        ctx.stroke();
        const [dx, dy] = Q(p.x + 0.25, p.y + 0.2, 4.2);
        ctx.fillStyle = shade("#e5e7eb", nf); ctx.beginPath(); ctx.ellipse(dx, dy, K.z * 0.35, K.z * 0.5, -0.3, 0, Math.PI * 2); ctx.fill();
      }
      K.line(Q(p.x, p.y, H), Q(p.x, p.y, H + 1.2), col2, Math.max(1, K.z * 0.05));
      const blink = Math.floor((K.t || 0) * 1.2) % 2 === 0;
      for (const h of [H + 1.2, H * 0.55]) {
        const [bx, by] = Q(p.x, p.y, h);
        ctx.fillStyle = blink || !env.night ? "#ef4444" : "#5a1414"; ctx.fillRect(bx - 1.5, by - 1.5, 3, 3);
        if (env.night && blink) glow(K, bx, by, K.z * 1.2, "rgba(239,68,68,0.45)");
      }
      break;
    }
    default: break;
  }
}
