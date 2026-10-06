// THE MALL's buildings, drawn (the outside; the rooms are storefrontProps.js). archDraw.js hands
// over its kit (shade, faceText, neonOn, windowGrid, door, bladeSign, glow, facesOf) and merges
// these into its style table, so each is drawn like its neighbours: same light, same LOD, same
// neon rules. What a unit shows comes from the day's published summary (enterpriseClient.js):
//   OPEN      the business's awning in its trade's colour, the window dressed for the trade, the
//             name on the sign board, OPEN lit in the door while it trades (CLOSED after hours)
//   CLOSED    (the day a business shuts) boards over the glass, the old name, CLOSED. THE
//             DEPARTMENT EXPECTED THIS.
//   TO LET    whitewashed glass, a TO LET bill, the unit's number on a blank board
//   SAM'S PIZZA        the counter open to the boards, slices in the window, the big sign on the
//                      roof (lit at night), the heat shimmering off the ovens
//   GOODNIGHT IRENE'S  the long bar behind warm glass, the brewhouse's copper tanks upstairs, the
//                      name in neon across the fascia, string lights over the patio
// Also: the boards (ground), the yard props, and THE TRAM CAR on the old boardwalk.
import { unitView } from "./enterpriseClient.js";
import { TRAM } from "./storefrontSim.js";
import { STORE_FIXTURES, UNIT_SET } from "./storefrontSim.js";
import { SHELL_OF } from "./shorePlaza.js";   // THE SHORE PLAZA: the old lots' names, TO LET
import { weekdayOf } from "./sim.js";
import { clockAt } from "./simApi.js";
import { faceBrand, brandReady, brandFits } from "./brand.js";   // Irene's real lockup (public/brand)
import { STOREY } from "./iso.js";

export const STORE_MAT = { shopfront: "#7a6a58", pizzawall: "#e8e0d0", brewbrick: "#6a2a2a", plazawhite: "#ece6d8" };
export const STORE_ROOF = { shopfront: "#4a4440", pizzawall: "#8a3030", brewbrick: "#3a2424", plazawhite: "#a9bcbf" };
// THE SHORE PLAZA's doo-wop palette: cream stucco, aqua rails, a pink stripe, Sam's red and white
const PLAZA = { aqua: "#14b8a6", aquaLit: "#5eead4", pink: "#f472b6", glass: "#4f8cb0", red: "#b91c1c", cream: "#fef2f2" };
export const STORE_STYLES_DRAWN = ["storefront", "pizzeria", "brewpub"];
export const STORE_PROPS_DRAWN = ["skirack", "boardstool", "patiotable", "stringlights", "aboard"];
const IRENE = { red: "#8c1622", olive: "#a3a028", cream: "#f7f5ec", ink: "#231f20" };

// Is there live music at Irene's tonight (the sim's fixture: it pulls the crowd too)?
export function ireneMusic(mt) {
  const day = Math.floor(mt / 24) + 1, h = mt - (day - 1) * 24;
  return (STORE_FIXTURES["goodnight-irenes"] || []).some(g => g.days.includes(weekdayOf(day)) && h >= g.from && h < g.to);
}

export function storeDeco(X) {
  const { shade, faceText, neonOn, door, bladeSign, glow, windowGrid } = X;
  const hi = (...a) => { let h = 2166136261; for (const c of a.join("|")) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

  // the window display for a trade, painted in the glass between t0 and t1 (h 0.12 to 0.62)
  function display(K, f, group, t0, t1, seed) {
    if (K.lod === "far") return;
    const n = Math.max(3, Math.round((t1 - t0) * f.len * 2.4));
    const at = (k) => t0 + (t1 - t0) * (k + 0.5) / n, w = (t1 - t0) / n;
    const pal = ["#ef4444", "#3b82f6", "#facc15", "#22c55e", "#f472b6", "#a78bfa", "#f97316"];
    for (let k = 0; k < n; k++) {
      const t = at(k), c = pal[(k + seed) % pal.length];
      switch (group) {
        case "boards": K.bq(c, f.q(t - w * 0.18, t + w * 0.18, 0.1, 0.78 - (k % 2) * 0.12, 0.02)); K.bq("#e5e7eb", f.q(t - w * 0.18, t + w * 0.18, 0.66 - (k % 2) * 0.12, 0.72 - (k % 2) * 0.12, 0.021)); break;
        case "gear": K.bq("#1f2937", f.q(t - w * 0.3, t + w * 0.3, 0.14, 0.2, 0.02)); K.bq(c, f.q(t - w * 0.15, t + w * 0.15, 0.22, 0.36, 0.02)); if (k % 2) K.bq("#f5f5f5", f.q(t - w * 0.1, t + w * 0.1, 0.42, 0.52, 0.02)); break;
        case "food": K.bq("#f5f5f4", f.q(t - w * 0.32, t + w * 0.32, 0.2, 0.25, 0.02)); K.bq(["#d97706", "#b45309", "#f472b6", "#fde68a"][k % 4], f.q(t - w * 0.22, t + w * 0.22, 0.25, 0.37, 0.02)); break;
        case "records": K.bq(c, f.q(t - w * 0.34, t + w * 0.34, 0.22, 0.58, 0.02)); K.bq("#111", f.q(t - w * 0.12, t + w * 0.12, 0.34, 0.46, 0.021)); break;
        case "stage": if (k === Math.floor(n / 2)) { K.bq("#9ca3af", f.q(t - 0.004, t + 0.004, 0.1, 0.55, 0.02)); K.bq("#111", f.q(t - w * 0.12, t + w * 0.12, 0.52, 0.6, 0.021)); } else K.bq(k % 2 ? "#fde047" : "#7c3aed", f.q(t - w * 0.2, t + w * 0.2, 0.62, 0.7, 0.02)); break;
        case "art": K.bq("#c8a24a", f.q(t - w * 0.36, t + w * 0.36, 0.24, 0.62, 0.02)); K.bq(c, f.q(t - w * 0.28, t + w * 0.28, 0.29, 0.57, 0.021)); break;
        case "books": for (let r = 0; r < 2; r++) K.bq(pal[(k * 3 + r + seed) % pal.length], f.q(t - w * 0.38, t + w * 0.38, 0.15 + r * 0.24, 0.33 + r * 0.24, 0.02)); break;
        case "clothes": K.bq("#d6d3d1", f.q(t - w * 0.05, t + w * 0.05, 0.1, 0.4, 0.02)); K.bq(c, f.q(t - w * 0.24, t + w * 0.24, 0.38, 0.66, 0.02)); K.bq("#e7e5e4", f.q(t - w * 0.07, t + w * 0.07, 0.66, 0.74, 0.02)); break;
        case "tools": K.bq("#334155", f.q(t - w * 0.36, t + w * 0.36, 0.14, 0.42, 0.02)); K.bq(K.night ? "#67e8f9" : "#94a3b8", f.q(t - w * 0.26, t + w * 0.26, 0.2, 0.36, 0.021)); break;
        case "bottles": for (let r = 0; r < 2; r++) { K.bq(["#14532d", "#7f1d1d", "#78350f"][(k + r) % 3], f.q(t - w * 0.14, t + w * 0.14, 0.14 + r * 0.26, 0.32 + r * 0.26, 0.02)); K.bq("#1c1917", f.q(t - w * 0.05, t + w * 0.05, 0.32 + r * 0.26, 0.38 + r * 0.26, 0.02)); } break;
        default: K.bq(["#a16207", "#4d7c0f", "#b91c1c", "#1d4ed8"][k % 4], f.q(t - w * 0.34, t + w * 0.34, 0.14, 0.3, 0.02)); K.bq(["#facc15", "#e5e7eb", "#f97316"][k % 3], f.q(t - w * 0.28, t + w * 0.28, 0.34, 0.46, 0.02)); break;
      }
    }
    K.flush();
  }
  // the striped awning over [t0, t1] at height h, standing out d
  function awning(K, f, t0, t1, h, col, d = 0.35) {
    const n = Math.max(4, Math.round((t1 - t0) * f.len * 3));
    for (let i = 0; i < n; i++) {
      const a = t0 + (t1 - t0) * i / n, b = t0 + (t1 - t0) * (i + 1) / n;
      K.G.poly([f.F(a, h, 0), f.F(b, h, 0), f.F(b, h - 0.16, d), f.F(a, h - 0.16, d)], shade(i % 2 ? "#f1ede2" : col, 1.05 * K.nf));
    }
    if (K.lod !== "far") K.G.poly([f.F(t0, h - 0.16, d), f.F(t1, h - 0.16, d), f.F(t1, h - 0.24, d), f.F(t0, h - 0.24, d)], shade(col, 0.8 * K.nf));
  }
  const fit = (text, n) => (text.length > n ? text.slice(0, n - 1) + "." : text);
  // a sign's letters sized to its board (a storey-high letter is about 1.5 cells wide per 3.3 letters)
  const sizeFor = (text, cells, max) => Math.min(max, (0.62 * cells) / Math.max(4, text.length));

  function unitFace(K, p, faces) {
    const v = unitView(p.unit, undefined, K.env.hour);
    for (const f of faces) {
      // the street side is the front; the north rows are glazed both sides
      const front = f.s === p.door || (p.door === "n" && f.s === "s");
      if (!front) continue;
      const hi = p.h1 - p.h0, sb0 = hi - 0.36, sb1 = hi - 0.04;   // the sign board, under the parapet
      if (v.state === "TO LET") {
        K.G.poly(f.q(0.05, 0.95, 0.06, sb0 - 0.06, 0.01), shade("#cfcac0", f.sh * K.nf));   // whitewash
        K.G.poly(f.q(0.04, 0.96, sb0, sb1, 0.02), shade("#2a2a2a", K.nf));
        faceText(K, f, 0.5, (sb0 + sb1) / 2, fit(`${v.unit?.name || (SHELL_OF[p.unit] ? "BOARDWALK EAST" : "UNIT")}`, Math.max(8, Math.floor(f.len * 3.2))), 0.13, K.night ? "#9ca3af" : "#d6d3d1", { d: 0.03 });
        K.G.poly(f.q(0.3, 0.7, 0.24, 0.58, 0.015), "#f8fafc", "rgba(0,0,0,0.4)");
        faceText(K, f, 0.5, 0.45, "TO LET", 0.14, "#b91c1c", { d: 0.02 });
        faceText(K, f, 0.5, 0.33, "APPLY: DISSATISFACTION", 0.06, "#1f2937", { d: 0.02 });
        door(K, f, 0.86, 0.32, 0.72, "#3a3530");
        continue;
      }
      const t = v.type, col = t?.awning || "#475569", closed = v.state === "CLOSED";
      // the glass: warm inside while it trades
      K.G.poly(f.q(0.05, 0.95, 0.06, sb0 - 0.2, 0.01), K.night ? (v.open ? "#f6d58a" : "#1c2228") : shade(v.open ? "#9fbfcc" : "#6f8a96", f.sh));
      if (!closed) display(K, f, t?.group, 0.07, 0.7, (v.biz?.id || "").length);
      door(K, f, 0.84, 0.3, 0.72, closed ? "#3a3530" : "#2a1a10", { lit: v.open });
      // OPEN / CLOSED in the door
      if (K.lod !== "far") {
        const on = v.open;
        K.G.poly(f.q(0.76, 0.92, 0.5, 0.62, 0.025), on ? (K.night ? "#052e16" : "#14532d") : "#3f0d0d", null);
        faceText(K, f, 0.84, 0.56, on ? "OPEN" : "CLOSED", 0.07, on ? "#86efac" : "#fca5a5", { d: 0.03, glow: K.night && on ? "rgba(74,222,128,0.6)" : null });
      }
      if (closed) {
        // the boards over the glass, the notice
        for (let k = 0; k < 4; k++) K.G.poly(f.q(0.06, 0.72, 0.1 + k * 0.14, 0.2 + k * 0.14, 0.03), shade(k % 2 ? "#8a6a42" : "#7a5a36", K.nf));
        K.G.poly(f.q(0.18, 0.62, 0.62, 0.78, 0.035), "#f8fafc");
        faceText(K, f, 0.4, 0.72, "CLOSED.", 0.07, "#7f1d1d", { d: 0.04 });
        faceText(K, f, 0.4, 0.66, "THE DEPARTMENT EXPECTED THIS.", 0.035, "#1f2937", { d: 0.04 });
      }
      awning(K, f, 0.04, 0.96, sb0 - 0.04, closed ? "#57534e" : col);
      // the sign board: the name, the trade under it
      K.G.poly(f.q(0.03, 0.97, sb0, sb1, 0.02), shade(closed ? "#292524" : "#161616", K.nf), "rgba(0,0,0,0.5)");
      const name = v.biz?.sign || "";
      const lit = K.night && v.open ? neonOn(K, (v.biz?.id || "x").charCodeAt(3) * 7, 0.03) : 1;
      faceText(K, f, 0.5, sb0 + (sb1 - sb0) * 0.62, name, sizeFor(name, f.len * 0.94, 0.19), closed ? "#78716c" : K.night ? `${col}` : shade(col, 1.6), { d: 0.03, stroke: "#0a0a0a", glow: K.night && v.open && lit > 0.5 ? `${col}99` : null });
      faceText(K, f, 0.5, sb0 + (sb1 - sb0) * 0.2, fit(t?.label || "", Math.max(8, Math.floor(f.len * 4.2))), 0.06, closed ? "#57534e" : "#e7e5e4", { d: 0.03 });
      if (K.night && v.open && K.lod !== "far") { const c = f.F(0.5, sb0 * 0.5, 0.2); glow(K, c[0], c[1], K.z * f.len * 0.3, "rgba(252,211,77,0.16)"); }
    }
  }
  function unitRoof(K, p) {
    if (K.lod === "far") return;
    const { Q } = K, e = 0.08;
    if (p.snow) K.G.poly([Q(p.x0 + e, p.y0 + e, p.h1 + 0.02), Q(p.x1 - e, p.y0 + e, p.h1 + 0.02), Q(p.x1 - e, p.y1 - e, p.h1 + 0.02), Q(p.x0 + e, p.y1 - e, p.h1 + 0.02)], K.night ? "#9fb2c8" : "#eef3f7");
    // the name on a board standing on the parapet, over the street side (the north rows: facing south
    // too, so the default view reads it)
    const v = unitView(p.unit, undefined, K.env.hour);
    if (v.state === "TO LET") return;
    const closed = v.state === "CLOSED", col = closed ? "#78716c" : v.type?.awning || "#475569";
    const y = p.door === "n" ? (p.y0 + p.y1) / 2 : p.y1 - 0.12, x0 = p.x0 + 0.1, x1 = p.x1 - 0.1, h0 = p.h1 + 0.05, h1 = p.h1 + 0.5;
    const face = { F: (t, h, d = 0) => Q(x0 + (x1 - x0) * t, y + d, h), len: x1 - x0 };
    K.G.poly([face.F(0, h1), face.F(1, h1), face.F(1, h0), face.F(0, h0)], closed ? "#292524" : "#121212", col);
    const name = v.biz?.sign || "";
    faceText(K, face, 0.5, (h0 + h1) / 2, name, sizeFor(name, x1 - x0, 0.32), closed ? "#a8a29e" : K.night ? col : shade(col, 1.5), { stroke: "#050505", glow: K.night && v.open ? `${col}aa` : null });
    if (K.night && v.open) { const c = face.F(0.5, (h0 + h1) / 2); glow(K, c[0], c[1], K.z * 1.6, `${col}33`); }
  }

  // ---- SAM'S PIZZA -------------------------------------------------------------------------------
  function pizzaFace(K, p, faces) {
    const { ctx } = K;
    for (const f of faces) {
      if (f.s !== "s") {
        if (f.len > 2 && K.lod !== "far") faceText(K, f, 0.5, 0.9, "SAM'S", 0.3, "#b91c1c", { stroke: "#fef2f2" });
        continue;
      }
      // open to the boards: the counter, the dark of the shop behind, the ovens' glow
      K.G.poly(f.q(0.03, 0.97, 0.52, 1.18, 0.005), K.night ? "#3a1a0a" : shade("#2a1810", f.sh));
      if (K.lod !== "far") {
        for (let k = 0; k < 3; k++) { K.bq("#57534e", f.q(0.12 + k * 0.28, 0.32 + k * 0.28, 0.66, 1.0, 0.006)); K.bq(K.night ? "#fb923c" : "#c2410c", f.q(0.15 + k * 0.28, 0.29 + k * 0.28, 0.72, 0.84, 0.007)); }
        K.flush();
      }
      // the counter: red and white tile, a steel top; slices on trays in the window
      const tiles = Math.max(6, Math.round(f.len * 4));
      for (let k = 0; k < tiles; k++) K.bq(shade(k % 2 ? "#f5f5f4" : "#b91c1c", K.nf), f.q(k / tiles, (k + 1) / tiles, 0, 0.5, 0.06));
      K.bq(shade("#d4d4d8", K.nf), f.q(0, 1, 0.5, 0.56, 0.22));
      K.flush();
      if (K.lod !== "far") {
        const n = Math.max(4, Math.round(f.len * 1.6));
        for (let k = 0; k < n; k++) {
          const t = 0.06 + 0.88 * (k + 0.5) / n, w = 0.32 / n;
          K.G.poly([f.F(t - w, 0.57, 0.18), f.F(t + w, 0.57, 0.18), f.F(t, 0.7, 0.14)], shade("#fbbf24", K.nf));
          K.bq("#b91c1c", f.q(t - w * 0.3, t + w * 0.1, 0.6, 0.64, 0.181));
        }
        K.flush();
      }
      awning(K, f, 0.02, 0.98, 1.36, "#b91c1c", 0.5);
      K.G.poly(f.q(0.02, 0.98, 1.36, 1.58, 0.02), shade("#fef2f2", K.nf), "rgba(0,0,0,0.4)");
      faceText(K, f, 0.5, 1.47, "SAM'S PIZZA", 0.17, "#b91c1c", { d: 0.03, glow: K.night ? "rgba(239,68,68,0.5)" : null });
      if (K.night && K.lod !== "far") { const c = f.F(0.5, 0.8, 0.3); glow(K, c[0], c[1], K.z * 3, "rgba(251,146,60,0.22)"); }
      void ctx;
    }
  }
  function pizzaRoof(K, p) {
    if (K.lod === "far") return;
    const { Q, ctx } = K;
    // the big sign on the roof, on two posts, facing the boards
    const y = p.y1 - 0.5, x0 = p.x0 + 0.35, x1 = p.x1 - 0.35, h0 = p.h1 + 0.35, h1 = p.h1 + 1.05;
    for (const x of [x0 + 0.6, x1 - 0.6]) K.line(Q(x, y, p.h1), Q(x, y, h0), "#57534e", Math.max(1, K.z * 0.07));
    const face = { F: (t, h, d = 0) => Q(x0 + (x1 - x0) * t, y + d, h), len: x1 - x0 };
    K.G.poly([face.F(0, h1), face.F(1, h1), face.F(1, h0), face.F(0, h0)], "#fafaf9", "#facc15");
    const on = neonOn(K, 911, 0.02);
    faceText(K, face, 0.5, (h0 + h1) / 2 + 0.08, "SAM'S PIZZA", 0.42, K.night ? `rgba(220,38,38,${on})` : "#b91c1c", { glow: K.night ? "rgba(239,68,68,0.55)" : null });
    faceText(K, face, 0.5, h0 + 0.1, "BY THE SLICE", 0.1, K.night ? "#fde68a" : "#57534e");
    if (K.night) { const c = face.F(0.5, (h0 + h1) / 2); glow(K, c[0], c[1], K.z * 4, "rgba(239,68,68,0.16)"); }
    // the heat off the ovens: a shimmer rising from the roof vent
    if (K.t) {
      const [vx, vy] = Q(p.x0 + 1.2, p.y0 + 0.9, p.h1);
      ctx.strokeStyle = K.night ? "rgba(253,186,116,0.22)" : "rgba(255,255,255,0.28)"; ctx.lineWidth = Math.max(1, K.z * 0.05);
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        for (let i = 0; i <= 10; i++) { const yy = vy - i * K.z * 0.22, xx = vx + (k - 1) * K.z * 0.25 + Math.sin(K.t * 3 + i * 0.9 + k * 2) * K.z * 0.08; i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
        ctx.stroke();
      }
    }
  }

  // ---- GOODNIGHT IRENE'S -------------------------------------------------------------------------
  function ireneFace(K, p, faces) {
    const music = ireneMusic(clockAt(Date.now()).mt);
    const openNow = K.env.hour >= 11 || K.env.hour < 2;
    for (const f of faces) {
      const front = f.s === "s";
      // upstairs: the brewhouse's tall windows, the copper tanks behind them
      const n = Math.max(2, Math.round(f.len / 1.6));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, w = 0.36 / n;
        K.bq(K.night ? "#3a2a1a" : shade("#58707a", f.sh), f.q(t - w, t + w, 1.4, 2.25, 0.01));
        if (K.lod !== "far" && front) {
          K.bq(shade("#b45309", K.nf * 1.1), f.q(t - w * 0.6, t + w * 0.6, 1.5, 2.1, 0.012));
          K.bq(shade("#d97706", K.nf * 1.2), f.q(t - w * 0.6, t - w * 0.2, 1.5, 2.1, 0.013));
          K.bq(shade("#78350f", K.nf), f.q(t - w * 0.7, t + w * 0.7, 2.06, 2.12, 0.014));
        }
      }
      K.flush();
      if (!front) { if (f.len > 2 && K.lod !== "far") faceText(K, f, 0.5, 0.75, "BREWPUB", 0.22, IRENE.cream, { stroke: IRENE.ink }); continue; }
      // the fascia between the floors: GOODNIGHT IRENE'S in neon
      // the pub's own lockup (the specials sheets': oven arch, flame, Goodnight in olive, IRENE'S
      // in black) on a cream board, as the pub prints it; lit from the front at night, steady
      const sp0 = f.F(0.32, 1.23, 0.04), sp1 = f.F(0.68, 1.23, 0.04);
      if (brandReady() && brandFits("irenes", 0.47 * STOREY * K.z, Math.hypot(sp1[0] - sp0[0], sp1[1] - sp0[1]))) {
        K.G.poly(f.q(0.3, 0.7, 0.96, 1.5, 0.03), shade(IRENE.ink, K.nf), "rgba(0,0,0,0.5)");
        K.G.poly(f.q(0.31, 0.69, 0.98, 1.48, 0.035), K.night ? "#fff4dc" : shade(IRENE.cream, f.sh));
        faceBrand(K, f, 0.5, 1.23, "irenes", 0.47, { d: 0.04, span: [0.32, 0.68] });
        if (K.night) { const c = f.F(0.5, 1.23, 0.2); glow(K, c[0], c[1], K.z * 2.6, "rgba(255,236,190,0.2)"); }
      } else {
        K.G.poly(f.q(0.02, 0.98, 1.06, 1.36, 0.03), shade(IRENE.ink, K.nf), "rgba(0,0,0,0.5)");
        const on = neonOn(K, 1955, 0.03);
        faceText(K, f, 0.5, 1.22, "GOODNIGHT IRENE'S", 0.2, K.night ? `rgba(248,113,113,${on})` : IRENE.cream, { d: 0.04, glow: K.night ? "rgba(140,22,34,0.8)" : null });
      }
      // downstairs: warm glass, the long bar inside, the taps
      K.G.poly(f.q(0.04, 0.72, 0.08, 0.98, 0.01), K.night || openNow ? (K.night ? "#f6c46a" : shade("#c9a46a", f.sh)) : shade("#58707a", f.sh));
      if (K.lod !== "far") {
        K.bq(shade("#4a2a14", K.nf), f.q(0.06, 0.7, 0.1, 0.42, 0.012));
        K.bq(shade("#7c4a24", K.nf), f.q(0.06, 0.7, 0.42, 0.46, 0.013));
        for (let k = 0; k < 7; k++) K.bq("#d4d4d8", f.q(0.12 + k * 0.08, 0.13 + k * 0.08, 0.46, 0.6, 0.013));
        // the stage corner: on music nights, a kit and an amp, lit
        K.bq(music ? "#fde047" : shade("#3a3a3a", K.nf), f.q(0.6, 0.69, 0.48, 0.84, 0.012));
        K.flush();
      }
      door(K, f, 0.8, 0.5, 0.88, shade(IRENE.red, K.nf), { lit: true });
      // the chalkboard by the door (no claims: what kind of night it is)
      K.G.poly(f.q(0.88, 0.97, 0.12, 0.62, 0.05), "#1f2a24", shade("#7c4a24", K.nf));
      faceText(K, f, 0.925, 0.48, "ON", 0.05, IRENE.cream, { d: 0.06 });
      faceText(K, f, 0.925, 0.4, "TAP", 0.05, IRENE.cream, { d: 0.06 });
      if (music) faceText(K, f, 0.925, 0.28, "LIVE", 0.05, "#fde047", { d: 0.06 });
      bladeSign(K, f, 0.985, 0.95, 2.2, "PUB", "#f87171");
      if (K.night) { const c = f.F(0.4, 0.6, 0.4); glow(K, c[0], c[1], K.z * 3.4, "rgba(246,196,106,0.2)"); }
      if (p.cornice) K.G.poly(f.q(0, 1, p.h1 - 0.12, p.h1, 0.08), shade(IRENE.olive, f.sh * 0.9 * K.nf));
    }
  }

  // ---- THE SHORE PLAZA (archGeo.js "condo") ------------------------------------------------------
  // Sam's across the street level, open to the boards; Irene's brewhouse and taproom over it; the
  // suites behind curved balconies; the name on a blade at the corner and on the roof.
  function plazaFace(K, p, faces) {
    const { G, ctx } = K, near = K.lod === "near";
    const hour = K.env.hour ?? 12, irenesOpen = hour >= 11 || hour < 2;
    for (const f of faces) {
      const front = f.s === "s";
      if (p.win === "plaza-street") {
        if (!front) {
          windowGrid(K, f, p, { bay: 1.6, w: 0.6, y0: 0.3, y1: 0.8, glass: "#3f6c80", warm: true });
          if (f.len > 3 && K.lod !== "far") faceText(K, f, 0.5, 0.95, "SAM'S", 0.24, PLAZA.red, { stroke: PLAZA.cream });
          continue;
        }
        // SAM'S PIZZA PALACE, t 0.02..0.64: the counter open to the boards, the ovens behind
        const s0 = 0.02, s1 = 0.64;
        G.poly(f.q(s0, s1, 0.5, 0.92, 0.005), K.night ? "#9a3412" : shade("#2a1810", f.sh));
        if (K.lod !== "far") {
          for (let k = 0; k < 4; k++) { const t = s0 + 0.05 + k * 0.15; K.bq("#57534e", f.q(t, t + 0.11, 0.6, 0.9, 0.006)); K.bq(K.night ? "#fb923c" : "#c2410c", f.q(t + 0.015, t + 0.095, 0.66, 0.76, 0.007)); }
          K.flush();
        }
        const tiles = Math.max(6, Math.round(f.len * (s1 - s0) * 3));
        for (let k = 0; k < tiles; k++) K.bq(shade(k % 2 ? "#f5f5f4" : PLAZA.red, K.nf), f.q(s0 + (s1 - s0) * k / tiles, s0 + (s1 - s0) * (k + 1) / tiles, 0, 0.44, 0.05));
        K.bq(shade("#d4d4d8", K.nf), f.q(s0, s1, 0.44, 0.5, 0.18));
        K.flush();
        if (K.lod !== "far") {
          const n = Math.max(5, Math.round(f.len * 0.9));
          for (let k = 0; k < n; k++) { const t = s0 + 0.03 + (s1 - s0 - 0.06) * (k + 0.5) / n, w = 0.22 / n; G.poly([f.F(t - w, 0.51, 0.15), f.F(t + w, 0.51, 0.15), f.F(t, 0.6, 0.12)], shade("#fbbf24", K.nf)); }
        }
        // the sign: red and white over the counter, the real logo when Sam's sends it (brand "sams")
        G.poly(f.q(s0, s1, 0.94, 1.18, 0.04), shade(PLAZA.cream, K.nf), "rgba(0,0,0,0.4)");
        G.poly(f.q(s0, s1, 0.94, 0.98, 0.045), shade(PLAZA.red, K.nf));
        if (!faceBrand(K, f, (s0 + s1) / 2, 1.06, "sams", 0.2, { d: 0.05, span: [s0 + 0.02, s1 - 0.02] })) {
          faceText(K, f, (s0 + s1) / 2, 1.065, "SAM'S PIZZA PALACE", 0.15, PLAZA.red, { d: 0.05, glow: K.night ? "rgba(239,68,68,0.55)" : null });
        }
        if (K.night) { const c = f.F((s0 + s1) / 2, 0.7, 0.3); glow(K, c[0], c[1], K.z * 5.5, "rgba(251,146,60,0.4)"); const c2 = f.F((s0 + s1) / 2, 1.06, 0.1); glow(K, c2[0], c2[1], K.z * 3, "rgba(239,68,68,0.16)"); }
        // the residents' lobby (THE SHORE PLAZA) and Irene's stair door (GOODNIGHT IRENE'S, UPSTAIRS)
        G.poly(f.q(0.66, 0.84, 0.06, 0.9, 0.01), K.night ? "#f6d58a" : shade(PLAZA.glass, f.sh));
        door(K, f, 0.75, 0.6, 0.85, "#1a2a34", { lit: true });
        G.poly(f.q(0.66, 0.84, 0.94, 1.14, 0.03), shade(PLAZA.aqua, K.nf));
        faceText(K, f, 0.75, 1.04, "SHORE PLAZA", 0.09, "#f0fdfa", { d: 0.035, glow: K.night ? "rgba(94,234,212,0.5)" : null });
        door(K, f, 0.92, 0.55, 0.88, shade(IRENE.red, K.nf), { lit: true });
        G.poly(f.q(0.86, 0.98, 0.94, 1.14, 0.03), shade(IRENE.ink, K.nf));
        faceText(K, f, 0.92, 1.04, "IRENE'S UP", 0.07, IRENE.cream, { d: 0.035 });
        continue;
      }
      if (p.win === "plaza-irenes") {
        // the brewhouse (1F): tall glass, the copper behind it; the taproom (2F): warm glass, the bar
        const n = Math.max(3, Math.round(f.len / 1.5));
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n, w = 0.38 / n;
          K.bq(K.night ? "#2a1e14" : shade("#58707a", f.sh), f.q(t - w, t + w, 1.32, 2.0, 0.01));
          if (K.lod !== "far" && (front || f.len > 3)) {
            K.bq(shade("#b45309", K.nf * 1.1), f.q(t - w * 0.6, t + w * 0.6, 1.36, 1.92, 0.012));
            K.bq(shade("#d97706", K.nf * 1.2), f.q(t - w * 0.6, t - w * 0.2, 1.36, 1.92, 0.013));
            K.bq(shade("#78350f", K.nf), f.q(t - w * 0.7, t + w * 0.7, 1.9, 1.95, 0.014));
          }
          K.bq(K.night || irenesOpen ? (K.night ? "#f6c46a" : shade("#c9a46a", f.sh)) : shade("#58707a", f.sh), f.q(t - w, t + w, 2.18, 2.86, 0.01));
        }
        K.flush();
        G.poly(f.q(0, 1, 2.06, 2.12, 0.02), shade(IRENE.olive, f.sh * K.nf));
        if (!front) { if (f.len > 3 && K.lod !== "far") faceText(K, f, 0.5, 2.5, "BREWPUB", 0.2, IRENE.cream, { stroke: IRENE.ink }); continue; }
        // the fascia over Sam's: the pub's own lockup on a cream board (or its name in neon)
        const sp0 = f.F(0.3, 1.27, 0.04), sp1 = f.F(0.7, 1.27, 0.04);
        if (brandReady() && brandFits("irenes", 0.3 * STOREY * K.z, Math.hypot(sp1[0] - sp0[0], sp1[1] - sp0[1]))) {
          G.poly(f.q(0.28, 0.72, 1.2, 1.32, 0.03), shade(IRENE.ink, K.nf), "rgba(0,0,0,0.5)");
          faceBrand(K, f, 0.5, 1.26, "irenes", 0.11, { d: 0.035, span: [0.3, 0.7] });
        } else {
          G.poly(f.q(0.18, 0.82, 1.2, 1.32, 0.03), shade(IRENE.ink, K.nf), "rgba(0,0,0,0.5)");
          faceText(K, f, 0.5, 1.26, "GOODNIGHT IRENE'S BREWERY AND BREWPUB", 0.08, K.night ? "#fca5a5" : IRENE.cream, { d: 0.035, glow: K.night ? "rgba(140,22,34,0.8)" : null });
        }
        // string lights along the taproom's sills, a blade at the corner
        if (K.lod !== "far") for (let k = 0; k < 24; k++) { const c = f.F((k + 0.5) / 24, 2.92 - (k % 3 === 1 ? 0.04 : 0), 0.06); ctx.fillStyle = K.night ? "#fde68a" : "#d6d3d1"; ctx.fillRect(c[0] - 1, c[1] - 1, 2, 2); }
        bladeSign(K, f, 0.015, 1.3, 2.9, "BREWPUB", "#f87171");
        if (K.night) { const c = f.F(0.5, 2.5, 0.4); glow(K, c[0], c[1], K.z * 4, "rgba(246,196,106,0.18)"); }
        continue;
      }
      if (p.win === "plaza-suites") {
        // the doo-wop stripe at every slab, the sliders behind the balconies (lit at night)
        for (let st = Math.floor(p.h0); st < p.h1 - 0.2; st++) {
          K.bq(shade("#f8f5ee", f.sh * K.nf), f.q(0, 1, st, st + 0.1, 0.01));
          const cols = Math.max(2, Math.floor(f.len / 1.3));
          for (let k = 0; k < cols; k++) {
            const t = (k + 0.5) / cols, w = 0.34 / cols, lit = hi(K.env.bid, f.i * 31 + st, k) < K.env.lit;
            K.bq(K.night ? (lit ? "#fcd9a0" : "#12202c") : shade(PLAZA.glass, f.sh), f.q(t - w, t + w, st + 0.2, st + 0.86, 0.005));
          }
        }
        K.flush();
        if (front && K.lod !== "far") {
          // the curved balconies: two to a bay, round at the ends, aqua rails
          const D = 0.42, r = Math.min(0.32, D), rt = r / f.len, bays = Math.max(2, Math.floor(f.len / 2.6));
          for (let st = Math.floor(p.h0); st < p.h1 - 0.2; st++) for (let k = 0; k < bays; k++) {
            const t0 = k / bays + 0.012, t1 = (k + 1) / bays - 0.012;
            const arc = (tc, side) => Array.from({ length: 5 }, (_, i) => { const a = side < 0 ? (i / 4) * Math.PI / 2 : (1 - i / 4) * Math.PI / 2; return f.F(side < 0 ? tc + rt * (1 - Math.cos(a)) : tc - rt * (1 - Math.cos(a)), st + 0.02, D - r + r * Math.sin(a)); });
            const slab = [f.F(t0, st + 0.02, 0), ...arc(t0, -1), ...arc(t1, 1), f.F(t1, st + 0.02, 0)];
            G.poly(slab, shade("#f1ece0", 1.1 * K.nf));
            K.bq(shade(PLAZA.aqua, K.nf), f.q(t0 + rt, t1 - rt, st + 0.04, st + 0.3, D));
            if (near) K.line(f.F(t0 + rt, st + 0.3, D + 0.01), f.F(t1 - rt, st + 0.3, D + 0.01), K.night ? PLAZA.aquaLit : "#ccfbf1", Math.max(1, K.z * 0.04));
          }
          K.flush();
        }
        if (front) {
          // the name: a doo-wop blade at the east corner, pink and aqua neon after dark
          bladeSign(K, f, 0.975, p.h0 + 0.3, p.h1 - 0.3, "SHORE PLAZA", K.night ? PLAZA.aquaLit : PLAZA.aqua);
        } else if (f.len > 3 && K.lod !== "far") faceText(K, f, 0.5, p.h1 - 0.5, "SHORE PLAZA", 0.26, PLAZA.aqua, { stroke: "#f0fdfa" });
        continue;
      }
      if (p.win === "plaza-crown") {
        K.bq(shade(PLAZA.pink, f.sh * K.nf), f.q(0, 1, p.h1 - 0.14, p.h1 - 0.04, 0.01));
        K.bq(K.night ? "#5eead4" : shade("#cfeefa", f.sh), f.q(0.1, 0.9, p.h0 + 0.12, p.h0 + 0.42, 0.01));
        K.flush();
      }
    }
  }
  function plazaRoof(K, p) {
    if (K.lod === "far") return;
    const { Q, ctx, G } = K;
    if (p.pool) { const [a, b, c, d] = p.pool; G.poly([Q(a, b, p.h1 + 0.01), Q(c, b, p.h1 + 0.01), Q(c, d, p.h1 + 0.01), Q(a, d, p.h1 + 0.01)], K.night ? "#0e7490" : "#38bdf8", "rgba(255,255,255,0.7)"); }
    if (p.umbrellas) for (let k = 0; k < 3; k++) { const x = p.x0 + (k + 0.5) * (p.x1 - p.x0) / 3, y = (p.y0 + p.y1) / 2, [sx, sy] = Q(x, y, p.h1 + 0.45); ctx.fillStyle = [PLAZA.pink, "#f5f5f4", PLAZA.aqua][k]; ctx.beginPath(); ctx.ellipse(sx, sy, K.z * 0.35, K.z * 0.15, 0, 0, Math.PI * 2); ctx.fill(); }
    if (p.roofSign) {
      // SHORE PLAZA on the roof's edge over the boards, on two posts
      const y = p.y1 - 0.3, x0 = p.x0 + 0.5, x1 = p.x0 + 6.2, h0 = p.h1 + 0.2, h1 = p.h1 + 0.85;
      for (const x of [x0 + 0.5, x1 - 0.5]) K.line(Q(x, y, p.h1), Q(x, y, h0), "#57534e", Math.max(1, K.z * 0.07));
      const face = { F: (t, h, d = 0) => Q(x0 + (x1 - x0) * t, y + d, h), len: x1 - x0 };
      G.poly([face.F(0, h1), face.F(1, h1), face.F(1, h0), face.F(0, h0)], K.night ? "#0f172a" : "#f0fdfa", PLAZA.pink);
      const on = neonOn(K, 1957, 0.02);
      faceText(K, face, 0.5, (h0 + h1) / 2, "SHORE PLAZA", 0.4, K.night ? `rgba(94,234,212,${on})` : PLAZA.aqua, { glow: K.night ? "rgba(244,114,182,0.55)" : null });
      if (K.night) { const c = face.F(0.5, (h0 + h1) / 2); glow(K, c[0], c[1], K.z * 4, "rgba(94,234,212,0.14)"); }
    }
  }

  return {
    deco: { storefront: { face: unitFace, roof: unitRoof }, pizzeria: { face: pizzaFace, roof: pizzaRoof }, brewpub: { face: ireneFace }, condo: { face: plazaFace, roof: plazaRoof } },
    far: {
      storefront: (K, p, faces) => {
        const v = unitView(p.unit, undefined, K.env.hour);
        for (const f of faces) if (f.s === p.door || (p.door === "n" && f.s === "s")) K.G.poly(f.q(0.04, 0.96, p.h1 - 0.5, p.h1 - 0.3, 0.01), v.state === "OPEN" ? (v.type?.awning || "#475569") : "#57534e");
      },
      pizzeria: (K, p, faces) => { const f = faces.find(x => x.s === "s"); if (f) K.G.poly(f.q(0.02, 0.98, 1.2, 1.4, 0.01), "#b91c1c"); },
      brewpub: (K, p, faces) => { const f = faces.find(x => x.s === "s"); if (f) K.G.poly(f.q(0.02, 0.98, 1.06, 1.36, 0.01), K.night ? "#f87171" : IRENE.red); },
      // THE SHORE PLAZA far away: Sam's red band, Irene's warm glass, the aqua rails
      condo: (K, p, faces) => {
        const f = faces.find(x => x.s === "s");
        if (!f) return;
        if (p.win === "plaza-street") K.G.poly(f.q(0.02, 0.64, 0.94, 1.18, 0.01), "#b91c1c");
        else if (p.win === "plaza-irenes") K.G.poly(f.q(0.04, 0.96, 2.18, 2.86, 0.01), K.night ? "#f6c46a" : "#8c1622");
        else if (p.win === "plaza-suites") for (let st = Math.floor(p.h0); st < p.h1 - 0.2; st++) K.G.poly(f.q(0.02, 0.98, st + 0.04, st + 0.24, 0.02), "#14b8a6");
      },
    },
  };
}

// The label the iso view hangs over a storefront: the business, or the unit TO LET.
export function storeLabel(buildingId) {
  if (!UNIT_SET.has(buildingId)) return null;
  const v = unitView(buildingId);
  if (v.state === "TO LET") return `${v.unit.name} // TO LET`;
  if (v.state === "CLOSED") return `${v.biz?.sign || "UNIT"} // CLOSED`;
  return `${v.biz?.sign || ""} ${v.type?.label || ""}`.trim();
}

// The boards and the patio (the lots' ground). -> true when drawn.
export function drawStoreGround(G, g, env, shade) {
  const { Q, ctx } = G, far = env.lod === "far", nf = env.night ? 0.7 : 1;
  const rect = (fill, stroke) => G.poly([Q(g.x0, g.y0, 0.01), Q(g.x1, g.y0, 0.01), Q(g.x1, g.y1, 0.01), Q(g.x0, g.y1, 0.01)], fill, stroke);
  if (g.k === "boards") {
    rect(shade("#8a6a46", nf), null);
    if (!far) {
      ctx.strokeStyle = "rgba(40,24,10,0.35)"; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = Math.ceil(g.x0 * 3) / 3; x < g.x1; x += 1 / 3) { const A = Q(x, g.y0, 0.012), B = Q(x, g.y1, 0.012); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
      ctx.stroke();
    }
    return true;
  }
  if (g.k === "patio") {
    rect(shade("#5a3a2a", nf), "rgba(0,0,0,0.25)");
    return true;
  }
  return false;
}

// The yard props. -> true when drawn.
export function drawStoreYard(K, p, env, X) {
  const { shade, facesOf, glow } = X;
  const { ctx, Q, G } = K, nf = K.nf, far = env.lod === "far";
  const boxy = (c, col) => { for (const f of facesOf(c, G)) G.poly(f.q(0, 1, c.h0, c.h1), shade(col, f.sh * nf)); };
  switch (p.k) {
    case "skirack": {
      boxy({ x0: p.x - 0.32, y0: p.y - 0.04, x1: p.x + 0.32, y1: p.y + 0.04, h0: 0.25, h1: 0.3 }, "#57534e");
      if (!far) for (let i = 0; i < 5; i++) { const x = p.x - 0.26 + i * 0.13; K.line(Q(x, p.y, 0), Q(x + 0.02, p.y, 0.95), ["#ef4444", "#3b82f6", "#facc15", "#22c55e", "#f472b6"][i], Math.max(1, K.z * 0.05)); }
      return true;
    }
    case "boardstool": {
      K.line(Q(p.x, p.y, 0), Q(p.x, p.y, 0.38), "#a1a1aa", Math.max(1, K.z * 0.05));
      const [sx, sy] = Q(p.x, p.y, 0.4);
      ctx.fillStyle = shade("#b91c1c", nf); ctx.beginPath(); ctx.ellipse(sx, sy, K.z * 0.16, K.z * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      return true;
    }
    case "patiotable": {
      K.line(Q(p.x, p.y, 0), Q(p.x, p.y, 0.32), "#3f3f46", Math.max(1, K.z * 0.05));
      const [sx, sy] = Q(p.x, p.y, 0.33);
      ctx.fillStyle = shade("#f7f5ec", nf); ctx.beginPath(); ctx.ellipse(sx, sy, K.z * 0.28, K.z * 0.14, 0, 0, Math.PI * 2); ctx.fill();
      if (!far) { const [ux, uy] = Q(p.x, p.y, 1.05); K.line([sx, sy], [ux, uy], "#57534e", 1); ctx.fillStyle = shade("#8c1622", nf); ctx.beginPath(); ctx.moveTo(ux - K.z * 0.42, uy + K.z * 0.16); ctx.lineTo(ux, uy - K.z * 0.08); ctx.lineTo(ux + K.z * 0.42, uy + K.z * 0.16); ctx.closePath(); ctx.fill(); }
      return true;
    }
    case "stringlights": {
      if (far) return true;
      const x0 = p.x - (p.w || 6) / 2, x1 = p.x + (p.w || 6) / 2, n = Math.round((x1 - x0) * 2.5);
      ctx.strokeStyle = "rgba(30,30,30,0.6)"; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, sag = Math.sin((i % 5) / 5 * Math.PI) * 0.18, [sx, sy] = Q(x, p.y, 1.25 - sag); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }
      ctx.stroke();
      for (let i = 0; i <= n; i++) {
        const x = x0 + (x1 - x0) * i / n, sag = Math.sin((i % 5) / 5 * Math.PI) * 0.18, [sx, sy] = Q(x, p.y, 1.2 - sag);
        ctx.fillStyle = env.night ? "#fde68a" : "#d6d3d1"; ctx.fillRect(sx - 1, sy - 1, 2, 2);
        if (env.night && i % 3 === 0) glow(K, sx, sy, K.z * 0.5, "rgba(253,230,138,0.3)");
      }
      return true;
    }
    case "aboard": {
      const c = { x0: p.x - 0.16, y0: p.y - 0.04, x1: p.x + 0.16, y1: p.y + 0.04, h0: 0, h1: 0.5 };
      for (const f of facesOf(c, G)) G.poly(f.q(0, 1, 0, 0.5), shade("#3a2a1a", f.sh * nf));
      return true;
    }
    default: return false;
  }
}

// THE TRAM CAR: a little yellow-and-blue train of a tractor and two open cars, end to end along
// the old boardwalk and back. -> {x, y, dir} at real time t (seconds), or null.
export function tramAt(t) {
  const T = TRAM.period, ph = ((t % T) + T) % T / T;
  const along = ph < 0.5 ? ph * 2 : 2 - ph * 2;   // there, then back
  const s = along * along * (3 - 2 * along);        // easing in and out at the ends
  return { x: TRAM.x0 + (TRAM.x1 - TRAM.x0) * s, y: TRAM.y, dir: ph < 0.5 ? 1 : -1 };
}
const shadeHex = (hex, f) => { const n = parseInt(hex.slice(1), 16), c = (v) => Math.max(0, Math.min(255, Math.round(v * f))); return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`; };
// Draw it: G is CityIso's kit (ctx, Q, poly, z).
export function drawTram(G, at, lod, night) {
  const shade = shadeHex;
  const { Q, ctx } = G, cars = [[0, 1.1, "#facc15"], [1.25, 1.35, "#1d4ed8"], [2.75, 1.35, "#1d4ed8"]];
  for (const [dx, len, col] of cars) {
    const x0 = at.x - at.dir * dx - (at.dir > 0 ? len : 0), x1 = x0 + len, y0 = at.y - 0.32, y1 = at.y + 0.32;
    const pts = (h) => [Q(x0, y0, h), Q(x1, y0, h), Q(x1, y1, h), Q(x0, y1, h)];
    G.poly(pts(0.35), shade(col, night ? 0.6 : 1), "rgba(0,0,0,0.5)");
    if (lod !== "far") {
      // the canopy on posts, white
      for (const [x, y] of [[x0 + 0.05, y0], [x1 - 0.05, y0], [x0 + 0.05, y1], [x1 - 0.05, y1]]) { const A = Q(x, y, 0.35), B = Q(x, y, 0.85); ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); }
      G.poly(pts(0.88), shade("#f5f5f4", night ? 0.7 : 1), "rgba(0,0,0,0.3)");
    }
  }
  if (night && lod !== "far") { const [hx, hy] = Q(at.x + at.dir * 0.1, at.y, 0.5); ctx.fillStyle = "#fef3c7"; ctx.fillRect(hx - 1.5, hy - 1.5, 3, 3); }
}
