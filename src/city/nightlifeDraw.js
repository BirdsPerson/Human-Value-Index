// THE NIGHTLIFE QUARTERS, drawn (the outside; the rooms are nightlifeProps.js). archDraw.js hands
// over its kit (shade, faceText, neonOn, windowGrid, door, bladeSign, glow, facesOf, figure) and
// merges these into its style table, so each is drawn like its neighbours: the same light, the
// same LOD, the same neon rules. What a front shows comes from the sim's own clock: open or shut by
// the venue's hours (nightlifeSim.js HOURS), tonight's bill on the marquees (lineupFor), and after
// dark the neon buzzing, the bass throbbing on the pavement in front of the clubs, the queue at
// the rope. docs/CITY_SPEC.md "THE NIGHTLIFE QUARTERS".
import { openAt, lineupFor, HOURS } from "./nightlifeSim.js";
import { weekdayOf } from "./sim.js";
import { clockAt } from "./simApi.js";

export const NIGHT_MAT = {
  marble: "#e4dfd4", blackmarble: "#24262b", decomarble: "#d8cdb8", hinokiwood: "#d3b27c", darkglass: "#2a3f52",
  brickdown: "#86402f", sootbrick: "#4c2b26", pinkpanel: "#8a2c6a", redfront: "#b3261e", liquorblock: "#5c5348",
};
export const NIGHT_ROOF = {
  marble: "#b9b2a4", blackmarble: "#151619", decomarble: "#a89c84", hinokiwood: "#4a4038", darkglass: "#3c5870",
  brickdown: "#3a2a26", sootbrick: "#2a1e1c", pinkpanel: "#4a1a3a", redfront: "#5a1a14", liquorblock: "#3a3430",
};
export const NIGHT_STYLES_DRAWN = ["nightclub", "rooftower", "cocktail", "steakhouse", "omakase", "supperclub", "danceclub", "hiphop", "punk", "karaoke", "poolhall", "comedy", "chicken", "liquor"];
export const NIGHT_PROPS_DRAWN = ["rope", "bouncer", "queue", "pine", "barrier", "halalcart", "lamppost", "flyerpole"];
const GOLD = "#d4af37";

// the bass, on the beat (124 to the minute): 0..1, a sharp attack and a long tail
const beat = (t, bpm = 124, ph = 0) => { const x = ((t * bpm) / 60 + ph) % 1; return Math.pow(1 - x, 3); };
// machine time now, its day and hour
function nowMt() { return clockAt(Date.now()).mt; }
// tonight's bill at a venue: the set on now, else the next one tonight
export function billAt(pid, mt = nowMt()) {
  const day = Math.floor(mt / 24) + 1, h = mt - (day - 1) * 24;
  // after midnight the bill is the night before's
  const night = h < 6 ? day - 1 : day, hh = h < 6 ? h + 24 : h;
  const sets = lineupFor(night).filter(g => g.venue === pid);
  return sets.find(g => hh < g.to) || null;
}
// How long the queue at a club door is (people), from the hour and the night of the week: nobody
// before the doors, building to midnight, gone by close. Pure clock math: every viewer the same.
export function queueLen(pid, mt = nowMt(), cheap = false) {
  if (!openAt(pid, mt)) return 0;
  const day = Math.floor(mt / 24) + 1, h = mt - (day - 1) * 24, wd = weekdayOf(h < 6 ? day - 1 : day);
  const hh = h < 6 ? h + 24 : h, o = HOURS[pid];
  if (!o || hh < o[0]) return 0;
  const shape = hh < 24.5 ? Math.min(1, (hh - o[0]) / 1.5) : Math.max(0, 1 - (hh - 24.5) / 1.2);
  const big = wd === 5 || wd === 6 ? 1 : wd === 4 ? 0.6 : 0.35;
  return Math.round((cheap ? 8 : 9) * shape * big);
}

export function nightDeco(X) {
  const { shade, faceText, neonOn, windowGrid, door, glow } = X;
  const fit = (text, n) => (text.length > n ? text.slice(0, n - 1) + "." : text);
  const isOpen = (K, p) => openAt(p.pid, K.env.hour);
  // the bass on the pavement: a pulse of the club's colour in front of the door while it is open after dark
  function throb(K, f, col, k = 1) {
    if (!K.night || K.lod === "far") return;
    const b = K.t ? beat(K.t) : 0.5, c = f.F(0.5, 0.02, 0.9);
    glow(K, c[0], c[1], K.z * (2.2 + 1.4 * b) * k, `${col}${Math.round(40 + 60 * b).toString(16).padStart(2, "0")}`);
  }
  // a sign board on a face: the name in neon (lit after dark while open), a dim ghost by day
  function neonSign(K, f, t, h, text, size, col, seed, open = true, o = {}) {
    const lit = K.night && open ? neonOn(K, seed, 0.03) : 0;
    faceText(K, f, t, h, text, size, K.night ? (lit > 0.5 ? col : shade(col.length === 7 ? col : "#888888", 0.45)) : (o.day || shade(col.length === 7 ? col : "#888888", 0.8)), { d: o.d ?? 0.04, stroke: o.stroke || "#0a0a0a", glow: lit > 0.5 ? `${col}aa` : null });
  }
  // a roll-down gate over [t0, t1] up to h, down by `down` (0 open .. 1 shut)
  function gate(K, f, t0, t1, h, down, col = "#8a8f94") {
    if (down <= 0) return;
    const hb = h - h * down;
    K.G.poly(f.q(t0, t1, hb, h, 0.02), shade(col, f.sh * K.nf));
    if (K.lod === "near") for (let y = hb + 0.06; y < h; y += 0.08) K.bq("rgba(0,0,0,0.25)", f.q(t0, t1, y, y + 0.015, 0.021));
    K.flush();
  }
  // a mural across [t0, t1] (h0..h1): bands and blocks in the downtown palette, by the building's seed
  function mural(K, f, t0, t1, h0, h1, seed) {
    if (K.lod === "far") return;
    const pal = ["#f43f5e", "#facc15", "#22d3ee", "#a3e635", "#a855f7", "#fb923c", "#f8fafc"];
    const n = Math.max(4, Math.round((t1 - t0) * f.len * 1.4));
    for (let k = 0; k < n; k++) {
      const a = t0 + (t1 - t0) * k / n, b = t0 + (t1 - t0) * (k + 1) / n, c = pal[(k * 3 + seed) % pal.length];
      const hh = h0 + (h1 - h0) * (0.35 + 0.65 * (((k * 7 + seed) % 5) / 4));
      K.bq(shade(c, 0.9 * K.nf), f.q(a, b, h0, hh, 0.012));
      if (k % 2) K.bq(shade(pal[(k + seed + 2) % pal.length], K.nf), f.q(a + (b - a) * 0.2, b - (b - a) * 0.2, h0 + (hh - h0) * 0.3, h0 + (hh - h0) * 0.6, 0.013));
    }
    K.flush();
  }
  const front = (faces) => faces.find(f => f.s === "s");

  // ---- UPTOWN ----------------------------------------------------------------------------------------
  function clubFace(K, p, faces) {
    const open = isOpen(K, p);
    for (const f of faces) {
      if (p.win === "vip") {
        // the mezzanine: tall glass, warm at night, gold mullions; bottle sparklers when it is busy
        K.G.poly(f.q(0.02, 0.98, p.h0 + 0.05, p.h1 - 0.08, 0.01), K.night ? (open ? "#f4c46a" : "#1b2430") : shade("#7aa4bf", f.sh));
        const n = Math.max(2, Math.round(f.len * 1.2));
        for (let k = 1; k < n; k++) K.bq(shade(GOLD, f.sh * K.nf), f.q(k / n - 0.006, k / n + 0.006, p.h0, p.h1, 0.012));
        K.bq(shade(GOLD, K.nf * 1.1), f.q(0, 1, p.h1 - 0.08, p.h1, 0.03));
        if (K.night && open && K.lod === "near" && K.t) for (let k = 0; k < 3; k++) { if (Math.sin(K.t * 3 + k * 2.1) > 0.6) { const c = f.F((k + 0.5) / 3, p.h0 + 0.35, 0.05); glow(K, c[0], c[1], K.z * 0.4, "rgba(255,240,180,0.8)"); } }
        K.flush();
        continue;
      }
      // marble with gold banding; tall blind arches on the long sides
      const n = Math.max(2, Math.round(f.len / 1.6));
      for (let k = 0; k < n; k++) { const t = (k + 0.5) / n, w = 0.32 / n; K.bq(shade("#cfc8ba", f.sh * K.nf), f.q(t - w, t + w, 0.25, p.h1 - 0.55, 0.01)); }
      K.bq(shade(GOLD, f.sh * K.nf), f.q(0, 1, p.h1 - 0.42, p.h1 - 0.34, 0.015));
      K.bq(shade(GOLD, f.sh * K.nf), f.q(0, 1, 0.12, 0.17, 0.015));
      K.flush();
      if (f.s !== "s") continue;
      // the doors: black glass under a gold canopy; the name in gold over it, lit from below at night
      K.G.poly(f.q(0.42, 0.58, 0.05, 1.25, 0.012), K.night && open ? "#3a2a10" : "#101014");
      K.G.poly(f.q(0.38, 0.62, 1.25, 1.36, 0.45), shade(GOLD, K.nf));
      faceText(K, f, 0.5, 1.85, "AURUM", 0.42, K.night ? "#fde68a" : "#a8862b", { d: 0.04, stroke: "#3a2a10", glow: K.night && open ? "rgba(253,230,138,0.65)" : null });
      if (K.lod !== "far") faceText(K, f, 0.5, 1.47, "TIER CHECKED AT THE ROPE", 0.07, K.night ? "#fef3c7" : "#57534e", { d: 0.04 });
      if (K.night && open) { const c = f.F(0.5, 1.6, 0.2); glow(K, c[0], c[1], K.z * 3, "rgba(253,224,71,0.18)"); throb(K, f, "#f59e0b", 1.2); }
      // tonight's DJ on a slim board by the door
      const bill = billAt("aurum");
      if (bill && K.lod === "near") faceText(K, f, 0.82, 0.95, fit(`TONIGHT: ${bill.name}`, 26), 0.075, K.night ? "#fde68a" : "#44403c", { d: 0.03 });
    }
  }
  function clubRoof(K, p) {
    if (p.win !== "vip" || !K.night || !isOpen(K, p) || K.lod === "far") return;
    // searchlights from the roof, crossing slowly
    const { ctx, Q } = K, [sx, sy] = Q((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, p.h1);
    for (let k = 0; k < 2; k++) {
      const a = -Math.PI / 2 + Math.sin((K.t || 0) * 0.5 + k * 2.4) * 0.5, L = K.z * 18;
      const g = ctx.createLinearGradient(sx, sy, sx + Math.cos(a) * L, sy + Math.sin(a) * L);
      g.addColorStop(0, "rgba(254,243,199,0.28)"); g.addColorStop(1, "rgba(254,243,199,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(a - 0.05) * L, sy + Math.sin(a - 0.05) * L); ctx.lineTo(sx + Math.cos(a + 0.05) * L, sy + Math.sin(a + 0.05) * L); ctx.closePath(); ctx.fill();
    }
  }
  function towerFace(K, p, faces) {
    const open = isOpen(K, p);
    for (const f of faces) {
      if (p.win === "deck") {
        // the roof deck's glass rail, lit warm while the lounge is open
        K.G.poly(f.q(0, 1, p.h0, p.h1, 0.01), K.night && open ? "rgba(253,224,160,0.55)" : "rgba(180,210,230,0.35)", "rgba(0,0,0,0.2)");
        continue;
      }
      windowGrid(K, f, p, { bay: 0.9, w: 0.8, y0: 0.08, y1: 0.92, warm: false, glass: "#4b84aa" });
      K.flush();
      // vertical gold fins
      const n = Math.max(2, Math.round(f.len / 0.9));
      for (let k = 0; k <= n; k++) K.bq(shade("#b9a46a", f.sh * K.nf), f.q(k / n - 0.01, k / n + 0.01, 0, p.h1, 0.02));
      K.flush();
      if (f.s === "s") {
        door(K, f, 0.5, 0.9, 0.85, "#0f1a22", { lit: true });
        neonSign(K, f, 0.5, p.h1 - 0.4, "THE CEILING", 0.26, "#fde68a", 4217, open, { day: "#e7e5e4" });
      }
    }
  }
  function towerRoof(K, p) {
    if (p.win !== "deck" || K.lod === "far") return;
    const { Q, ctx } = K, open = isOpen(K, p);
    // umbrellas and the bar on the roof; string lights round the edge at night
    const xs = [p.x0 + 0.8, (p.x0 + p.x1) / 2, p.x1 - 0.8];
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i], y = (p.y0 + p.y1) / 2 + (i % 2 ? -0.6 : 0.6);
      K.line(Q(x, y, p.h1), Q(x, y, p.h1 + 0.75), "#d6d3d1", Math.max(1, K.z * 0.04));
      const [ux, uy] = Q(x, y, p.h1 + 0.8);
      ctx.fillStyle = shade(i % 2 ? "#f5f5f4" : "#1f2937", K.nf); ctx.beginPath(); ctx.ellipse(ux, uy, K.z * 0.45, K.z * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (K.night && open) {
      for (let k = 0; k < 14; k++) { const t = k / 14, [sx, sy] = Q(p.x0 + (p.x1 - p.x0) * t, p.y1, p.h1 + 0.45); ctx.fillStyle = "#fde68a"; ctx.fillRect(sx - 1, sy - 1, 2, 2); }
      const [cx, cy] = Q((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, p.h1 + 0.4); glow(K, cx, cy, K.z * 3.2, "rgba(253,186,116,0.22)");
    }
  }
  function cocktailFace(K, p, faces) {
    const open = isOpen(K, p);
    for (const f of faces) {
      // black marble veined in brass; a deco fin on the front with the name down it
      for (let k = 1; k < 4; k++) K.bq(shade("#8a6d2f", f.sh * K.nf), f.q(0, 1, k * p.h1 / 4 - 0.02, k * p.h1 / 4, 0.01));
      K.flush();
      if (f.s !== "s") continue;
      K.G.poly(f.q(0.08, 0.7, 0.15, 1.35, 0.01), K.night && open ? "#b8742a" : shade("#3a4a44", f.sh));   // the glass: amber inside
      if (K.lod !== "far") for (let k = 0; k < 4; k++) K.bq(K.night ? "#fde68a" : "#9ca3af", f.q(0.14 + k * 0.14, 0.18 + k * 0.14, 0.62, 0.7, 0.012));   // the bottles on the back bar
      K.flush();
      door(K, f, 0.82, 0.55, 1.1, "#0b0b0d", { lit: open });
      // the fin: a tall narrow sign standing proud of the front
      K.G.poly(f.q(0.9, 0.97, 0.6, p.h1 + 0.5, 0.35), shade("#111", K.nf), shade(GOLD, K.nf));
      neonSign(K, f, 0.5, p.h1 - 0.35, "THE BITTERS", 0.2, "#34d399", 777, open, { day: "#a8862b" });
      if (K.night && open) { const c = f.F(0.4, 0.7, 0.4); glow(K, c[0], c[1], K.z * 2.2, "rgba(251,191,36,0.2)"); }
    }
  }
  function steakFace(K, p, faces) {
    const open = isOpen(K, p);
    for (const f of faces) {
      windowGrid(K, f, p, { bay: 1.1, w: 0.7, y0: 0.25, y1: 0.8, sill: shade("#9a9284", K.nf) });
      K.flush();
      if (f.s !== "s") continue;
      // the oxblood awning across the front, THE CUT in brass on it, carriage lamps either side
      const h = 1.3;
      K.G.poly([f.F(0.06, h, 0), f.F(0.94, h, 0), f.F(0.94, h - 0.22, 0.42), f.F(0.06, h - 0.22, 0.42)], shade("#5a1018", 1.05 * K.nf));
      K.G.poly(f.q(0.06, 0.94, h - 0.32, h - 0.22, 0.42), shade("#3a0a10", K.nf));
      faceText(K, f, 0.5, h - 0.27, "THE CUT", 0.13, K.night ? "#fde68a" : "#d4af37", { d: 0.43 });
      door(K, f, 0.5, 0.55, 0.95, "#2a1810", { lit: open });
      neonSign(K, f, 0.5, p.h1 - 0.3, "STEAKHOUSE", 0.12, "#fbbf24", 919, open, { day: "#57534e" });
      if (K.night && open) { const c = f.F(0.5, 0.6, 0.3); glow(K, c[0], c[1], K.z * 2.4, "rgba(251,191,36,0.16)"); }
    }
  }
  function omakaseFace(K, p, faces) {
    const open = isOpen(K, p);
    for (const f of faces) {
      // vertical cypress slats over paper-lit glass
      K.G.poly(f.q(0.04, 0.96, 0.1, p.h1 - 0.15, 0.005), K.night && open ? "#f8e7c0" : shade("#e9dcc0", f.sh * K.nf));
      const n = Math.max(6, Math.round(f.len * 5));
      for (let k = 0; k < n; k++) K.bq(shade("#b48a52", f.sh * K.nf), f.q((k + 0.1) / n, (k + 0.45) / n, 0.1, p.h1 - 0.15, 0.012));
      K.flush();
      if (f.s !== "s") continue;
      // the noren: indigo half-curtains over the door
      for (let k = 0; k < 3; k++) K.G.poly(f.q(0.4 + k * 0.07, 0.46 + k * 0.07, 0.62, 1.05, 0.04), shade("#1e3a8a", K.nf));
      faceText(K, f, 0.5, 0.85, "ひのき", 0.1, "#f8fafc", { d: 0.05 });
      neonSign(K, f, 0.5, p.h1 - 0.08, "HINOKI", 0.16, "#fca5a5", 303, open, { day: "#44403c", d: 0.05 });
      if (K.night && open) { const c = f.F(0.2, 0.9, 0.3); glow(K, c[0], c[1], K.z * 1.2, "rgba(248,113,113,0.5)"); }   // the red lantern
    }
  }
  function supperFace(K, p, faces) {
    const open = isOpen(K, p);
    for (const f of faces) {
      // deco: stepped pilasters in cream, black glass between
      const n = Math.max(3, Math.round(f.len / 1.4));
      for (let k = 0; k < n; k++) { const t = (k + 0.5) / n, w = 0.28 / n; K.bq(K.night && open ? "#3a2810" : "#1a1c22", f.q(t - w, t + w, 0.3, p.h1 - 0.45, 0.01)); if (K.night && open && k % 2 === 0) K.bq("#f6c46a", f.q(t - w * 0.7, t + w * 0.7, 0.4, 0.95, 0.011)); }
      K.bq(shade("#b9a77f", f.sh * K.nf), f.q(0, 1, p.h1 - 0.3, p.h1 - 0.22, 0.02));
      K.flush();
      if (f.s !== "s") continue;
      // the marquee: a canopy edged in bulbs, tonight's bill on it
      const h = 1.45, d = 0.55;
      K.G.poly([f.F(0.2, h, 0), f.F(0.8, h, 0), f.F(0.8, h, d), f.F(0.2, h, d)], shade("#1c1917", K.nf));
      K.G.poly(f.q(0.2, 0.8, h - 0.32, h, d), shade("#f5f0e6", K.nf));
      const bill = billAt("minor-key");
      faceText(K, f, 0.5, h - 0.11, "THE MINOR KEY", 0.1, "#111827", { d: d + 0.01 });
      faceText(K, f, 0.5, h - 0.24, fit(bill ? `TONIGHT ${bill.name}` : "SUPPER AND JAZZ", 22), 0.075, "#7f1d1d", { d: d + 0.01 });
      if (K.lod !== "far") { const nb = Math.round(f.len * 0.6 * 3); for (let k = 0; k <= nb; k++) { const on = !K.night || !open || !K.t || (Math.floor(K.t * 6) + k) % 4 !== 0; const [bx, by] = f.F(0.2 + 0.6 * k / nb, h - 0.34, d + 0.01); K.ctx.fillStyle = on ? (K.night && open ? "#fff7cc" : "#d6d3d1") : "#7c6f50"; K.ctx.fillRect(bx - 1, by - 1, 2, 2); } }
      door(K, f, 0.5, 0.8, 1.05, "#1c1410", { lit: open });
      // the blade: JAZZ, down the corner
      X.bladeSign(K, f, 0.96, 0.6, p.h1 + 0.6, "JAZZ", "#60a5fa");
      if (K.night && open) { const c = f.F(0.5, 1.2, 0.6); glow(K, c[0], c[1], K.z * 3, "rgba(255,247,204,0.2)"); }
    }
  }

  // ---- DOWNTOWN ----------------------------------------------------------------------------------------
  function brickCourses(K, f, p) {
    if (K.lod !== "near") return;
    for (let y = 0.2; y < p.h1; y += 0.22) K.bq("rgba(0,0,0,0.12)", f.q(0, 1, y, y + 0.02, 0.005));
    K.flush();
  }
  function danceFace(K, p, faces) {
    const open = isOpen(K, p), strobe = p.club === "strobe", col = strobe ? "#e879f9" : "#38bdf8";
    for (const f of faces) {
      brickCourses(K, f, p);
      if (f.s !== "s") {
        // the flank: a mural the length of the wall
        if (f.len > 2.5) mural(K, f, 0.06, 0.94, 0.15, p.h1 - 0.25, strobe ? 3 : 0);
        continue;
      }
      // blacked-out glass, the neon edging the front, the name in big letters, a roll-down gate on the side door
      K.G.poly(f.q(0.06, 0.94, 0.15, 1.4, 0.008), "#0a0a0f");
      if (K.night && open) {
        const b = K.t ? beat(K.t) : 0.6;
        // the light inside: a slow colour wash, and on STROBE the flash
        const wash = strobe ? (K.t && Math.floor(K.t * 8) % 3 === 0 ? "#fdf4ff" : "#7e22ce") : `hsl(${Math.round(((K.t || 0) * 40) % 360)},80%,${35 + 20 * b}%)`;
        K.G.poly(f.q(0.1, 0.3, 0.2, 1.3, 0.009), wash); K.G.poly(f.q(0.7, 0.9, 0.2, 1.3, 0.009), wash);
      }
      const on = K.night && open ? neonOn(K, strobe ? 51 : 52, 0.02) : 0.3;
      K.G.poly(f.q(0, 1, p.h1 - 0.05, p.h1, 0.02), on > 0.5 ? col : shade("#555555", K.nf));
      K.G.poly(f.q(0, 1, 0, 0.05, 0.02), on > 0.5 ? col : shade("#555555", K.nf));
      neonSign(K, f, 0.5, 1.82, strobe ? "STROBE" : "VOLTAGE", 0.38, col, strobe ? 61 : 62, open, { day: shade(col, 0.7) });
      door(K, f, 0.5, 0.8, 1.1, "#050505", { lit: open });
      gate(K, f, 0.86, 0.97, 1.0, open ? 0 : 1);
      if (K.night && open) throb(K, f, strobe ? "#d946ef" : "#0ea5e9", 1.4);
    }
  }
  function hiphopFace(K, p, faces) {
    const open = isOpen(K, p);
    for (const f of faces) {
      brickCourses(K, f, p);
      // the tags: bubble letters sprayed low on every wall
      if (K.lod !== "far") { const tags = ["CYPHER", "0xE2", "BARS", "MIC"]; faceText(K, f, 0.3, 0.45, tags[f.i % tags.length], 0.2, ["#facc15", "#22d3ee", "#f472b6", "#a3e635"][f.i % 4], { d: 0.01, stroke: "#111" }); }
      if (f.s !== "s") continue;
      K.G.poly(f.q(0.55, 0.95, 0.12, 1.2, 0.008), "#0b0b0b");
      gate(K, f, 0.55, 0.95, 1.2, open ? 0.15 : 1, "#6b7280");   // the gate up (a hand's width left down) while open
      door(K, f, 0.35, 0.6, 1.0, "#0b0b0b", { lit: open });
      neonSign(K, f, 0.5, 1.75, "THE CYPHER", 0.24, "#facc15", 71, open, { day: "#a16207" });
      if (K.night && open) throb(K, f, "#eab308", 1);
    }
  }
  function punkFace(K, p, faces) {
    const open = isOpen(K, p);
    for (const f of faces) {
      brickCourses(K, f, p);
      // flyers, layered, on every wall
      if (K.lod !== "far") { const n = Math.max(3, Math.round(f.len * 2.2)); for (let k = 0; k < n; k++) { const t = (k + 0.5) / n, w = 0.32 / n, y = 0.3 + ((k * 37) % 5) * 0.12; K.bq(["#f5f5f4", "#fde047", "#f87171", "#e5e7eb"][(k + f.i) % 4], f.q(t - w, t + w, y, y + 0.3, 0.01)); K.bq("#111", f.q(t - w * 0.6, t + w * 0.6, y + 0.18, y + 0.24, 0.011)); } K.flush(); }
      if (f.s !== "s") continue;
      K.G.poly(f.q(0.3, 0.7, 1.02, 1.3, 0.02), "#0a0a0a");
      faceText(K, f, 0.5, 1.16, "BASEMENT 0x00", 0.1, K.night && open ? "#f87171" : "#d6d3d1", { d: 0.03, glow: K.night && open ? "rgba(248,113,113,0.6)" : null });
      door(K, f, 0.15, 0.55, 0.95, "#1a1a1a");
      if (K.night && open) { const c = f.F(1.05, 0.1, 0.6); glow(K, c[0], c[1], K.z * (1.6 + (K.t ? beat(K.t, 168) : 0.5)), "rgba(239,68,68,0.35)"); }   // red light up the stairwell, at punk tempo
    }
  }
  function karaokeFace(K, p, faces) {
    const open = isOpen(K, p);
    for (const f of faces) {
      if (f.s !== "s") { windowGrid(K, f, p, { bay: 0.9, w: 0.5, y0: 0.35, y1: 0.75 }); K.flush(); continue; }
      K.G.poly(f.q(0.08, 0.92, 0.15, 1.25, 0.008), K.night && open ? "#4c1d95" : shade("#3b2a4a", f.sh));
      if (K.night && open && K.lod !== "far") { const k = Math.floor((K.t || 0) * 1.5) % 3; for (let i = 0; i < 3; i++) K.bq(i === k ? "#f0abfc" : "#7e22ce", f.q(0.12 + i * 0.27, 0.34 + i * 0.27, 0.3, 1.1, 0.009)); K.flush(); }   // the rooms, one lit by the screen
      // the neon microphone and the name
      const on = K.night && open ? neonOn(K, 81, 0.04) : 0.3;
      K.line(f.F(0.88, 1.35, 0.06), f.F(0.88, 1.75, 0.06), on > 0.5 ? "#f472b6" : "#6b7280", Math.max(1, K.z * 0.08));
      const [mx, my] = f.F(0.88, 1.85, 0.06); K.ctx.fillStyle = on > 0.5 ? "#f9a8d4" : "#9ca3af"; K.ctx.beginPath(); K.ctx.arc(mx, my, K.z * 0.16, 0, Math.PI * 2); K.ctx.fill();
      neonSign(K, f, 0.42, 1.6, "KARAOKE BOX", 0.2, "#f472b6", 82, open, { day: "#be185d" });
      door(K, f, 0.5, 0.5, 0.95, "#1a0a1a", { lit: open });
    }
  }
  function poolFace(K, p, faces) {
    const open = isOpen(K, p);
    for (const f of faces) {
      brickCourses(K, f, p);
      windowGrid(K, f, p, { bay: 1.1, w: 0.6, y0: 0.3, y1: 0.75, from: 1 });
      K.flush();
      if (f.s !== "s") continue;
      K.G.poly(f.q(0.08, 0.72, 0.15, 0.95, 0.008), K.night && open ? "#14532d" : shade("#334b3a", f.sh));   // green-lit glass: the tables' lamps
      neonSign(K, f, 0.4, 0.55, "POOL", 0.22, "#4ade80", 91, open, { day: "#166534" });
      // the eight ball on a round sign
      const [bx, by] = f.F(0.86, 1.4, 0.3), r = K.z * 0.32;
      K.ctx.fillStyle = "#0a0a0a"; K.ctx.beginPath(); K.ctx.arc(bx, by, r, 0, Math.PI * 2); K.ctx.fill();
      K.ctx.fillStyle = "#f8fafc"; K.ctx.beginPath(); K.ctx.arc(bx, by, r * 0.45, 0, Math.PI * 2); K.ctx.fill();
      if (r > 5) { K.ctx.fillStyle = "#0a0a0a"; K.ctx.font = `bold ${Math.round(r * 0.6)}px monospace`; K.ctx.textAlign = "center"; K.ctx.textBaseline = "middle"; K.ctx.fillText("8", bx, by + 0.5); }
      neonSign(K, f, 0.42, p.h1 - 0.3, "EIGHT BALL", 0.15, "#f8fafc", 92, open, { day: "#e7e5e4" });
      door(K, f, 0.86, 0.45, 0.95, "#111", { lit: open });
    }
  }
  function comedyFace(K, p, faces) {
    const open = isOpen(K, p);
    for (const f of faces) {
      brickCourses(K, f, p);
      if (f.s !== "s") continue;
      // the marquee in bulbs, tonight's headliner under it; the neon mic in the window
      const h = 1.35, d = 0.45, bill = billAt("the-heckle");
      K.G.poly([f.F(0.1, h, 0), f.F(0.9, h, 0), f.F(0.9, h, d), f.F(0.1, h, d)], shade("#111", K.nf));
      K.G.poly(f.q(0.1, 0.9, h - 0.4, h, d), shade("#fef3c7", K.nf));
      faceText(K, f, 0.5, h - 0.12, "THE HECKLE", 0.12, "#7f1d1d", { d: d + 0.01 });
      faceText(K, f, 0.5, h - 0.29, fit(bill ? bill.name : "OPEN MIC", 18), 0.085, "#111827", { d: d + 0.01 });
      if (K.lod !== "far") { const nb = 14; for (let k = 0; k <= nb; k++) { const on = !K.night || !open || !K.t || (Math.floor(K.t * 5) + k) % 3 !== 0; const [bx, by] = f.F(0.1 + 0.8 * k / nb, h + 0.02, d); K.ctx.fillStyle = on ? (K.night && open ? "#fff7cc" : "#d6d3d1") : "#6b5a3a"; K.ctx.fillRect(bx - 1, by - 1, 2, 2); } }
      K.G.poly(f.q(0.1, 0.4, 0.1, 0.8, 0.008), K.night && open ? "#3a1010" : "#141414");
      const on = K.night && open ? neonOn(K, 101, 0.05) : 0.3;
      K.line(f.F(0.25, 0.25, 0.02), f.F(0.25, 0.6, 0.02), on > 0.5 ? "#f87171" : "#57534e", Math.max(1, K.z * 0.06));
      door(K, f, 0.7, 0.55, 0.95, "#1a0a0a", { lit: open });
      neonSign(K, f, 0.5, p.h1 - 0.25, "COMEDY", 0.14, "#f87171", 102, open, { day: "#991b1b" });
    }
  }
  function chickenFace(K, p, faces) {
    for (const f of faces) {
      if (f.s !== "s") { if (f.len > 2) faceText(K, f, 0.5, 0.8, "24H", 0.3, "#fde047", { d: 0.01, stroke: "#7f1d1d" }); continue; }
      // the bright counter window, the menu board lit over it (no prices: the Department sets them)
      K.G.poly(f.q(0.06, 0.94, 0.12, 0.95, 0.008), K.night ? "#fff1c1" : shade("#f3e3b0", f.sh));
      if (K.lod !== "far") { for (let k = 0; k < 4; k++) K.bq(["#f59e0b", "#dc2626", "#fbbf24", "#b45309"][k], f.q(0.12 + k * 0.2, 0.26 + k * 0.2, 0.62, 0.86, 0.009)); K.flush(); }
      K.G.poly(f.q(0.02, 0.98, 0.98, 1.3, 0.03), "#fde047", "#7f1d1d");
      faceText(K, f, 0.5, 1.14, "THE COOP 24H", 0.15, "#b91c1c", { d: 0.04, glow: K.night ? "rgba(253,224,71,0.5)" : null });
      if (K.night) { const c = f.F(0.5, 0.5, 0.4); glow(K, c[0], c[1], K.z * 2.6, "rgba(255,241,193,0.22)"); }
    }
  }
  function liquorFace(K, p, faces) {
    const open = isOpen(K, p), cheap = p.sign === "CUT-RATE SPIRITS";
    for (const f of faces) {
      if (f.s !== "s") { brickCourses(K, f, p); continue; }
      K.G.poly(f.q(0.06, 0.94, 0.1, 0.92, 0.008), open ? (K.night ? "#f8fafc" : shade("#cbd5e1", f.sh)) : "#0b0b0b");
      if (K.lod !== "far" && open) { for (let k = 0; k < 8; k++) K.bq(["#14532d", "#7f1d1d", "#78350f", "#1e3a8a"][k % 4], f.q(0.1 + k * 0.1, 0.14 + k * 0.1, 0.2, 0.55, 0.009)); K.flush(); }
      // the bars over the glass
      if (K.lod !== "far") { for (let k = 0; k <= 10; k++) K.bq("#3f3f46", f.q(0.06 + k * 0.088 - 0.005, 0.06 + k * 0.088 + 0.005, 0.1, 0.92, 0.02)); K.flush(); }
      gate(K, f, 0.04, 0.96, 0.95, open ? 0 : 1, "#9ca3af");
      neonSign(K, f, 0.5, 1.1, cheap ? "CUT-RATE" : "LIQUOR 24", 0.15, cheap ? "#fbbf24" : "#ef4444", cheap ? 111 : 112, open, { day: cheap ? "#a16207" : "#b91c1c" });
    }
  }

  const sideSign = (name, col) => (K, p, faces) => { for (const f of faces) if (f.s === "s") K.G.poly(f.q(0.1, 0.9, p.h1 - 0.45, p.h1 - 0.2, 0.01), K.night && openAt(p.pid, K.env.hour) ? col : shade(col, 0.5)); };
  return {
    deco: {
      nightclub: { face: clubFace, roof: clubRoof }, rooftower: { face: towerFace, roof: towerRoof }, cocktail: { face: cocktailFace }, steakhouse: { face: steakFace },
      omakase: { face: omakaseFace }, supperclub: { face: supperFace }, danceclub: { face: danceFace }, hiphop: { face: hiphopFace }, punk: { face: punkFace },
      karaoke: { face: karaokeFace }, poolhall: { face: poolFace }, comedy: { face: comedyFace }, chicken: { face: chickenFace }, liquor: { face: liquorFace },
    },
    far: {
      nightclub: sideSign("AURUM", "#fde68a"), rooftower: sideSign("CEILING", "#fde68a"), cocktail: sideSign("BITTERS", "#34d399"), steakhouse: sideSign("CUT", "#fbbf24"),
      omakase: sideSign("HINOKI", "#fca5a5"), supperclub: sideSign("JAZZ", "#60a5fa"), danceclub: (K, p, faces) => sideSign("", p.club === "strobe" ? "#e879f9" : "#38bdf8")(K, p, faces),
      hiphop: sideSign("", "#facc15"), punk: sideSign("", "#f87171"), karaoke: sideSign("", "#f472b6"), poolhall: sideSign("", "#4ade80"), comedy: sideSign("", "#f87171"),
      chicken: sideSign("", "#fde047"), liquor: sideSign("", "#ef4444"),
    },
  };
}

// The quarters' ground. -> true when drawn.
export function drawNightGround(G, g, env, shade) {
  const { Q, ctx } = G, far = env.lod === "far", nf = env.night ? 0.7 : 1;
  const rect = (fill, stroke) => G.poly([Q(g.x0, g.y0, 0.01), Q(g.x1, g.y0, 0.01), Q(g.x1, g.y1, 0.01), Q(g.x0, g.y1, 0.01)], fill, stroke);
  switch (g.k) {
    case "marbleplaza": {
      rect(shade("#cfc9bd", nf), null);
      if (!far) { ctx.strokeStyle = "rgba(120,110,90,0.35)"; ctx.lineWidth = 1; ctx.beginPath(); for (let x = Math.ceil(g.x0); x < g.x1; x += 1) { const A = Q(x, g.y0, 0.012), B = Q(x, g.y1, 0.012); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke(); }
      return true;
    }
    case "redcarpet": rect(shade("#9b1c2c", nf), "rgba(212,175,55,0.6)"); return true;
    case "gravel": {
      rect(shade("#bfb8a8", nf), null);
      if (!far) { ctx.strokeStyle = "rgba(90,80,60,0.35)"; ctx.lineWidth = 1; ctx.beginPath(); for (let y = g.y0 + 0.25; y < g.y1; y += 0.3) { const A = Q(g.x0 + 0.05, y, 0.012), B = Q(g.x1 - 0.05, y, 0.012); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke(); }
      return true;
    }
    case "stairwell": {
      rect("#0c0a0a", "rgba(0,0,0,0.6)");
      if (!far) for (let k = 0; k < 5; k++) { const y = g.y0 + (g.y1 - g.y0) * k / 5; G.poly([Q(g.x0 + 0.08, y, -0.05 * k), Q(g.x1 - 0.08, y, -0.05 * k), Q(g.x1 - 0.08, y + 0.3, -0.05 * k), Q(g.x0 + 0.08, y + 0.3, -0.05 * k)], shade("#3a3634", nf * (1 - k * 0.15))); }
      if (env.night) { const [x, y] = Q((g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2, 0); const gr = ctx.createRadialGradient(x, y, 0, x, y, G.z * 1.4); gr.addColorStop(0, "rgba(239,68,68,0.35)"); gr.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, G.z * 1.4, 0, Math.PI * 2); ctx.fill(); }
      return true;
    }
    case "tarmac": {
      rect(shade("#2c2c30", nf), null);
      if (!far) { ctx.fillStyle = "rgba(255,255,255,0.08)"; for (let i = 0; i < 6; i++) { const [x, y] = Q(g.x0 + (g.x1 - g.x0) * ((i * 0.618 + 0.13) % 1), g.y0 + (g.y1 - g.y0) * ((i * 0.382 + 0.41) % 1), 0.012); ctx.fillRect(x, y, Math.max(1, G.z * 0.25), 1); } }
      return true;
    }
    default: return false;
  }
}

// The yard props. -> true when drawn.
export function drawNightYard(K, p, env, X) {
  const { shade, facesOf, glow, figure } = X;
  const { ctx, Q, G } = K, nf = K.nf, far = env.lod === "far", near = env.lod === "near";
  const mt = nowMt();
  switch (p.k) {
    case "rope": {
      // brass stanchions and the velvet rope sagging between them
      const n = Math.max(2, Math.round(Math.hypot(p.bx - p.ax, p.by - p.ay) / 0.9));
      const pts = Array.from({ length: n + 1 }, (_, i) => [p.ax + (p.bx - p.ax) * i / n, p.ay + (p.by - p.ay) * i / n]);
      for (const [x, y] of pts) K.line(Q(x, y, 0), Q(x, y, 0.42), shade(GOLD, nf), Math.max(1, K.z * 0.06));
      if (!far) {
        ctx.strokeStyle = shade("#9b1c2c", nf); ctx.lineWidth = Math.max(1, K.z * 0.07); ctx.beginPath();
        for (let i = 0; i < n; i++) for (let s = 0; s <= 6; s++) { const u = s / 6, x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u, [sx, sy] = Q(x, y, 0.38 - Math.sin(u * Math.PI) * 0.1); (i || s) ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }
        ctx.stroke();
      }
      return true;
    }
    case "bouncer": {
      if (far) return true;
      // the door supervisor: black suit, an earpiece, a clipboard (the tiers, alphabetised)
      figure(K, p.x, p.y, 0, "#111114", "#8a5a3a", { arm: near });
      if (near) { const [sx, sy] = Q(p.x + 0.12, p.y, 0.45); ctx.fillStyle = "#e7e5e4"; ctx.fillRect(sx, sy, Math.max(2, K.z * 0.12), Math.max(2, K.z * 0.16)); }
      return true;
    }
    case "queue": {
      // the queue along the rope: as long as the hour and the night make it (nightlifeDraw queueLen)
      const n = queueLen(p.pid, mt, Boolean(p.cheap));
      if (!n || far) return true;
      const L = Math.hypot(p.bx - p.ax, p.by - p.ay), step = Math.min(0.42, L / Math.max(1, n));
      const cols = p.cheap ? ["#1f2937", "#7c2d12", "#365314", "#1e3a8a", "#701a75", "#78350f"] : ["#111827", "#f5f5f4", "#7f1d1d", "#1e1b4b", "#d4af37", "#0f766e"];
      for (let i = 0; i < n; i++) {
        const u = Math.min(1, (i * step) / Math.max(0.01, L)), x = p.ax + (p.bx - p.ax) * u, y = p.ay + (p.by - p.ay) * u + ((i * 7) % 3 - 1) * 0.06;
        const sway = K.t ? Math.sin(K.t * 2 + i) * 0.02 : 0;
        figure(K, x + sway, y, 0, cols[(i * 5 + (p.cheap ? 1 : 0)) % cols.length], ["#c89a78", "#8a5a3a", "#e0b48c", "#5a3a26"][(i * 3) % 4], { arm: near && i % 4 === 1 });
      }
      return true;
    }
    case "barrier": {
      // steel crowd barriers along the pavement
      const n = Math.max(1, Math.round(Math.hypot(p.bx - p.ax, p.by - p.ay) / 1.1));
      for (let i = 0; i < n; i++) {
        const a = [p.ax + (p.bx - p.ax) * i / n, p.ay + (p.by - p.ay) * i / n], b = [p.ax + (p.bx - p.ax) * (i + 1) / n, p.ay + (p.by - p.ay) * (i + 1) / n];
        K.line(Q(a[0], a[1], 0.4), Q(b[0], b[1], 0.4), shade("#a1a1aa", nf), Math.max(1, K.z * 0.05));
        K.line(Q(a[0], a[1], 0.12), Q(b[0], b[1], 0.12), shade("#a1a1aa", nf), Math.max(1, K.z * 0.04));
        if (!far) for (let s = 1; s < 5; s++) { const x = a[0] + (b[0] - a[0]) * s / 5, y = a[1] + (b[1] - a[1]) * s / 5; K.line(Q(x, y, 0.12), Q(x, y, 0.4), shade("#71717a", nf), 1); }
        K.line(Q(a[0], a[1], 0), Q(a[0], a[1], 0.42), shade("#71717a", nf), Math.max(1, K.z * 0.05));
      }
      return true;
    }
    case "pine": {
      K.line(Q(p.x, p.y, 0), Q(p.x, p.y, 0.5), "#4a3020", Math.max(1, K.z * 0.08));
      for (let k = 0; k < 3; k++) { const [sx, sy] = Q(p.x + (k - 1) * 0.12, p.y, 0.55 + k * 0.22); ctx.fillStyle = shade(["#1f4a2a", "#2a5a34", "#24502e"][k], nf); ctx.beginPath(); ctx.ellipse(sx, sy, K.z * (0.42 - k * 0.08), K.z * 0.14, -0.2, 0, Math.PI * 2); ctx.fill(); }
      return true;
    }
    case "lamppost": {
      K.line(Q(p.x, p.y, 0), Q(p.x, p.y, 1.3), shade("#1c1917", nf), Math.max(1, K.z * 0.06));
      const [sx, sy] = Q(p.x, p.y, 1.35);
      ctx.fillStyle = env.night ? "#fde68a" : "#57534e"; ctx.fillRect(sx - K.z * 0.09, sy - K.z * 0.12, K.z * 0.18, K.z * 0.2);
      if (env.night) glow(K, sx, sy, K.z * 1.2, "rgba(253,230,138,0.3)");
      return true;
    }
    case "flyerpole": {
      K.line(Q(p.x, p.y, 0), Q(p.x, p.y, 1.4), shade("#3f3f46", nf), Math.max(1, K.z * 0.07));
      if (!far) for (let k = 0; k < 4; k++) { const [sx, sy] = Q(p.x, p.y + 0.06, 0.4 + k * 0.22); ctx.fillStyle = ["#fde047", "#f5f5f4", "#f87171", "#a5f3fc"][k]; ctx.fillRect(sx - K.z * 0.08, sy - K.z * 0.18, K.z * 0.16, K.z * 0.18); }
      return true;
    }
    case "halalcart": {
      // the cart: steel, the griddle's steam, the red-and-yellow umbrella; open all night
      const c = { x0: p.x - 0.32, y0: p.y - 0.18, x1: p.x + 0.32, y1: p.y + 0.18, h0: 0.1, h1: 0.5 };
      for (const f of facesOf(c, G)) { G.poly(f.q(0, 1, c.h0, c.h1), shade("#c0c4c8", f.sh * nf)); if (!far && f.s === "s") G.poly(f.q(0.1, 0.9, 0.2, 0.42, 0.005), env.night ? "#fde68a" : "#e7e5e4"); }
      G.poly([Q(c.x0, c.y0, c.h1), Q(c.x1, c.y0, c.h1), Q(c.x1, c.y1, c.h1), Q(c.x0, c.y1, c.h1)], shade("#8a8f94", 1.1 * nf));
      K.line(Q(p.x, p.y, c.h1), Q(p.x, p.y, 1.25), "#57534e", 1);
      const [ux, uy] = Q(p.x, p.y, 1.25);
      for (let k = 0; k < 6; k++) { ctx.fillStyle = shade(k % 2 ? "#facc15" : "#dc2626", nf); ctx.beginPath(); ctx.moveTo(ux, uy - K.z * 0.08); const a0 = (k / 6) * Math.PI * 2, a1 = ((k + 1) / 6) * Math.PI * 2; ctx.lineTo(ux + Math.cos(a0) * K.z * 0.6, uy + Math.sin(a0) * K.z * 0.28 + K.z * 0.14); ctx.lineTo(ux + Math.cos(a1) * K.z * 0.6, uy + Math.sin(a1) * K.z * 0.28 + K.z * 0.14); ctx.closePath(); ctx.fill(); }
      if (K.t && !far) { ctx.strokeStyle = env.night ? "rgba(253,230,138,0.25)" : "rgba(255,255,255,0.35)"; ctx.lineWidth = 1; for (let k = 0; k < 2; k++) { ctx.beginPath(); for (let i = 0; i <= 6; i++) { const [sx, sy] = Q(p.x + (k - 0.5) * 0.2, p.y, 0.55 + i * 0.1); const xx = sx + Math.sin(K.t * 3 + i + k) * K.z * 0.06; i ? ctx.lineTo(xx, sy) : ctx.moveTo(xx, sy); } ctx.stroke(); } }
      if (env.night) glow(K, ...Q(p.x, p.y, 0.5), K.z * 1.6, "rgba(253,230,138,0.3)");
      if (near) figure(K, p.x + 0.45, p.y - 0.05, 0, "#e7e5e4", "#8a5a3a", { arm: true });
      return true;
    }
    default: return false;
  }
}
