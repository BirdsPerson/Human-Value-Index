// THE MASTER PLAN's venues in the iso view (CityIso.jsx), drawn from venueGeo.js the way
// parkDraw.js draws the grounds: THE PIT (the ring, the octagon, the stands on four sides, the
// locker rooms, the fight board) and THE TENNIS CLUB (four courts in their fence, the clubhouse
// and its terrace, the umpire's chair); and the Dept of Planning's facade and yard (archDraw.js
// merges them: the slab, the sign, the notice board, THE PANORAMA's model of the city).
//
// Level of detail: far = the shapes and colours, people as dots; mid = lines, ropes, nets,
// stands, small sprites; near = everything, everyone posed. Painter's order inside a lot: the
// ground, then every standing thing back to front by u + v; a stand carries its own sitters.
//
// The fighters of the bout on now (pit.js) and the finalists of the club's fixture (tennis.js)
// are drawn by PROJECTION at their marks: they are not the sim's (it keeps them to their own
// schedule), so anyone present who is on the bill is left out of the crowd, never drawn twice.

import { rot, STOREY } from "./iso.js";
import { SPRITE_W, SPRITE_H, statureOf } from "../sprites.js";
import { sheetFor, miniFor } from "./spriteBank.js";
import { FAMILY_COLOR, familyOf } from "./cityKit.js";
import { drawPose, phaseOf } from "./poses.js";
import { drawRig } from "./rig.js";
import { assignAnchors, actAt, typeOf } from "./props.js";
import { PIT, TENNIS, VENUE_LOTS, VENUE_ANCHORS, venueRole } from "./venueGeo.js";
import { boutAt, fightersOf, resultLine, billLine, boutsOn, SLOT_H } from "./pit.js";
import { tennisAt } from "./tennis.js";
import { DISTRICTS, BUILDINGS, LOOP_LINE } from "./sim.js";
import { FAMOUS_FIGURES, slugify } from "../figures.js";

const who = (s) => s.slug || s.name;
const frac = (v) => ((v % 1) + 1) % 1;
const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const rectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16), c = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f))); return `rgb(${c(16)},${c(8)},${c(0)})`; };
const lightsOn = (hour) => hour >= 18.25 || hour < 6.5;
const CHALK = "#f1f5f0", MESH = "rgba(176,188,198,0.2)", RAIL = "#9aa6b2";
const FAN_ACTS = new Set(["cheer", "watch", "view", "drink", "sit"]);

// A fighter or a finalist on the bill, as a subject to draw: the census's own record when the
// view holds it (its sprite, its file on a tap), else a figure on file's (the repo's sprite) or
// the sprite the Department serves for the slug.
const REPO = new Set(FAMOUS_FIGURES.map(f => slugify(f.name)));
const PROJ = new Map();
export function projected(slug, name, lookup) {
  const s = lookup?.(slug);
  if (s) return s;
  let p = PROJ.get(slug);
  if (!p) { p = REPO.has(slug) ? { slug, name: FAMOUS_FIGURES.find(f => slugify(f.name) === slug).name } : { slug, name: titleCase(name), sprite: `/api/sprite/${slug}` }; PROJ.set(slug, p); }
  return p;
}
const titleCase = (n) => n.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());

// G: {ctx, Q, poly, prism, wall, facing, z, r, t, hits, w, h, lookup?(slug)}
// people: [{s, w}] on this lot now. prev: last frame's seats. -> {at}
export function drawVenueLot(G, lotId, lod, mt, people, prev) {
  const pid = VENUE_LOTS[lotId], hour = ((mt % 24) + 24) % 24;
  const items = [], carried = new Map();
  const put = (x, y, draw, bias = 0) => { const [u, v] = rot(x, y, G.r); items.push({ k: u + v + bias, draw }); };
  const ground = (pts, fill, h = 0.01) => G.poly(pts.map(p => G.Q(p[0], p[1], h)), fill);
  const gline = (a, b, col, w, h = 0.015) => { const A = G.Q(a[0], a[1], h), B = G.Q(b[0], b[1], h); G.ctx.strokeStyle = col; G.ctx.lineWidth = w; G.ctx.beginPath(); G.ctx.moveTo(A[0], A[1]); G.ctx.lineTo(B[0], B[1]); G.ctx.stroke(); };
  const vline = (x, y, h0, h1, col, w) => { const A = G.Q(x, y, h0), B = G.Q(x, y, h1); G.ctx.strokeStyle = col; G.ctx.lineWidth = w; G.ctx.beginPath(); G.ctx.moveTo(A[0], A[1]); G.ctx.lineTo(B[0], B[1]); G.ctx.stroke(); };
  const K = { G, lod, hour, mt, put, ground, gline, vline, carried, t: G.t, px: Math.max(1, G.z * 0.06), night: hour >= 19 || hour < 6.5 };

  // who is on the bill: never drawn twice
  const bout = pid === "pit" ? boutAt(mt) : null, match = pid === "tennis" ? tennisAt(mt) : null;
  const billed = new Set(bout ? fightersOf(bout.bout).map(f => f.key) : match && !match.done ? match.players.map(p => p.key) : []);
  const anchors = VENUE_ANCHORS[pid];
  const list = people.filter(o => !billed.has(who(o.s))).map(o => { const r = venueRole(pid, o.s, o.w); return { key: who(o.s), role: r.role, pri: r.pri, s: o.s }; });
  const { at } = assignAnchors(anchors, list, prev, hour, true);
  const present = new Map();
  for (const p of list) { const i = at.get(p.key); if (i != null) present.set(anchors[i].id, { p, a: anchors[i] }); }
  K.present = present; K.bout = bout; K.match = match;
  // a round just ended or a result read: the stands are on their feet
  K.roar = Boolean(bout && (bout.phase.phase === "decision" || bout.phase.phase === "break" || (bout.phase.phase === "round" && bout.phase.clock > 0.9)));

  if (pid === "pit") pitLot(K); else tennisLot(K);

  for (const [id, { p, a }] of present) {
    const d = personDraw(K, pid, a, p);
    if (carried.has(id)) carried.get(id).push(d.draw);
    else put(d.x, d.y, d.draw, 0.02);
  }
  items.sort((a, b) => a.k - b.k);
  for (const it of items) it.draw();
  return { at };
}

// ---- people -------------------------------------------------------------------------------------
function figure(K, s, x, y, h, act, face, o = {}) {
  const { G, lod } = K, c = G.ctx;
  const [sx, sy] = G.Q(x, y, h);
  if (sx < -40 || sx > G.w + 40 || sy < -60 || sy > G.h + 40) return;
  if (lod === "far") { c.fillStyle = FAMILY_COLOR[familyOf(s).family] || "#6b9a7c"; c.fillRect(Math.round(sx) - 1, Math.round(sy) - 2, 2, 2); return; }
  const hh0 = G.z * STOREY * 0.95, k = statureOf(s), hpx = hh0 * k;
  let box;
  if (lod === "mid" || hpx < 18) {
    const m = miniFor(s), sc = hpx / (SPRITE_H / 2);
    try { c.drawImage(m, Math.round(sx - (SPRITE_W / 4) * sc), Math.round(sy - hpx), Math.round((SPRITE_W / 2) * sc), Math.round(hpx)); } catch { /* not decoded yet */ }
    box = [sx - hpx * 0.3, sy - hpx, sx + hpx * 0.3, sy];
  } else if (o.anim) {
    box = drawRig(c, sheetFor(s), o.anim, K.t, sx, sy, (hh0 * k) / SPRITE_H, face, { ph: o.ph ?? phaseOf(who(s)) }) || drawPose(c, sheetFor(s), { kind: "stand", act: "stand", face, walk: null }, "stand", sx, sy, hh0, K.t, phaseOf(who(s)), k);
  } else {
    box = drawPose(c, sheetFor(s), { kind: o.seat ? "seat" : "stand", act, face, walk: null, anim: o.fan ? (frac(phaseOf(who(s)) * 5.3) < 0.7 ? "cheer" : "clap") : null }, act, sx, sy, hh0, K.t, phaseOf(who(s)), k);
  }
  if (!s.crowd && o.hit !== false && box) G.hits.push({ kind: "p", s, box });
}
function personDraw(K, pid, a, p) {
  const { G } = K;
  let x = a.x, y = a.y, h = a.h || 0;
  // in a bout the sparring partners step out to the apron and watch
  let act = actAt(a, K.hour, p.role, typeOf(pid)), stepped = false;
  if (a.venue && K.bout && K.bout.bout.ring === a.venue && a.alt) { [x, y] = a.alt; h = 0; act = "cheer"; stepped = true; }
  const face = a.look && !stepped ? (G.Q(a.look[0], a.look[1], 0)[0] > G.Q(x, y, 0)[0] ? 1 : -1) : 0;
  const fan = K.roar && FAN_ACTS.has(act);
  return { x, y, draw: () => figure(K, p.s, x, y, h, act, face, { seat: a.kind === "seat", fan }) };
}

// A chain-link panel from a to b on a base height.
function mesh(K, a, b, h0, h1) {
  const { G, lod } = K, m = lerp(a, b, 0.5);
  K.put(m[0], m[1], () => {
    const q = [G.Q(a[0], a[1], h0), G.Q(b[0], b[1], h0), G.Q(b[0], b[1], h1), G.Q(a[0], a[1], h1)];
    G.poly(q, MESH);
    if (lod === "near") {
      const c = G.ctx; c.strokeStyle = "rgba(190,200,210,0.16)"; c.lineWidth = 1; c.beginPath();
      const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25));
      for (let k = 0; k <= n; k++) { const p = lerp(a, b, k / n), A = G.Q(p[0], p[1], h0), B = G.Q(p[0], p[1], h1); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); }
      c.stroke();
    }
    K.vline(a[0], a[1], h0, h1, RAIL, K.px); K.vline(b[0], b[1], h0, h1, RAIL, K.px);
    const c = G.ctx; c.strokeStyle = RAIL; c.lineWidth = K.px; c.beginPath(); c.moveTo(q[3][0], q[3][1]); c.lineTo(q[2][0], q[2][1]); c.stroke();
  });
}
// A board of text on two posts, facing +y (a fight board, the club's scoreboard).
function board(K, a, b, h0, h1, rows, col = "#0f1a14") {
  const { G, lod } = K, m = lerp(a, b, 0.5);
  K.put(m[0], m[1], () => {
    for (const k of [0.15, 0.85]) { const p = lerp(a, b, k); K.vline(p[0], p[1], 0, h0, "#4b5563", Math.max(1, G.z * 0.08)); }
    const f = G.facing ? G.facing(a, b, [m[0], m[1] - 1]) : 1;
    G.prism([[a[0], a[1] - 0.08], [b[0], b[1] - 0.08], [b[0], b[1]], [a[0], a[1]]], h0, h1, f ? col : "#39414a", 1.2);
    if (lod !== "near" || !f) return;
    const A = G.Q(a[0] + (b[0] - a[0]) * 0.05, a[1] + 0.01, h1 - 0.12), B = G.Q(b[0] - (b[0] - a[0]) * 0.05, b[1] + 0.01, h1 - 0.12);
    const c = G.ctx, fs = Math.max(6, Math.round(G.z * 0.27)), wpx = Math.hypot(B[0] - A[0], B[1] - A[1]);
    c.save(); c.font = `${fs}px "Fira Mono", monospace`; c.textBaseline = "top"; c.textAlign = "left";
    c.translate(A[0], A[1]); c.rotate(Math.atan2(B[1] - A[1], B[0] - A[0]));
    rows.forEach(([txt, color], i) => { c.fillStyle = color; let t = txt; while (t.length > 3 && c.measureText(t).width > wpx) t = t.slice(0, -2); c.fillText(t, 0, i * fs * 1.15); });
    c.restore();
  });
}

// ---- THE PIT ----------------------------------------------------------------------------------------
function pitLot(K) {
  const { G, lod, ground, gline, vline, put, present } = K;
  const P = PIT, L = P.lot, F = P.floor, R = P.ring, O = P.oct, nf = K.night ? 0.7 : 1;
  ground(rectPts(L.x + 0.1, L.y + 0.1, L.x + L.w - 0.1, L.y + L.h - 0.1), shade("#2a2d33", nf));
  ground(rectPts(F.x0, F.y0, F.x1, F.y1), shade("#1b1e24", nf), 0.011);
  // the forecourt: paving, the entrance out of the south stand
  ground(rectPts(P.locker.x1 + 0.9, F.y1 + 2.6, L.x + L.w - 0.4, L.y + L.h - 0.2), shade("#3a3d42", nf), 0.011);
  // the octagon's mat and the ring's shadow on the floor
  ground(O.pts, shade("#20252c", nf), 0.012);
  if (lod === "far") {
    ground(rectPts(R.cx - R.hs, R.cy - R.hs, R.cx + R.hs, R.cy + R.hs), "#1d4ed8", 0.02);
    ground(O.pts, "#374151", 0.02);
    for (const s of P.segs) ground(s.foot, "#6b7280", 0.02);
    ground(rectPts(P.locker.x0, P.locker.y0, P.locker.x1, P.locker.y1), "#4b5563", 0.03);
    return;
  }
  // the walkout tunnel: a lit strip from the locker rooms to the floor
  ground(rectPts(P.tunnel.x - 0.35, P.tunnel.y0, P.tunnel.x + 0.35, P.tunnel.y1), shade("#57534e", nf), 0.012);
  // THE RING: the platform (blue apron, white canvas, the corner pads), drawn before anyone in it
  const [cu, cv] = rot(R.cx, R.cy, G.r), sq = rectPts(R.cx - R.hs, R.cy - R.hs, R.cx + R.hs, R.cy + R.hs);
  const ringKey = Math.min(...sq.map(([x, y]) => { const [u, v] = rot(x, y, G.r); return u + v; }));
  K.put(R.cx, R.cy, () => {
    G.prism(sq, 0, R.h, "#1e3a8a", 1.35);
    G.poly(rectPts(R.cx - R.hs + 0.1, R.cy - R.hs + 0.1, R.cx + R.hs - 0.1, R.cy + R.hs - 0.1).map(p => G.Q(p[0], p[1], R.h + 0.002)), shade("#e7e5e4", nf));
    if (lod === "near") { const [mx, my] = G.Q(R.cx, R.cy, R.h + 0.004); const c = G.ctx; c.font = `bold ${Math.max(6, Math.round(G.z * 0.45))}px 'Fira Mono', monospace`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "rgba(185,28,28,0.55)"; c.fillText("THE PIT", mx, my); }
  }, ringKey - (cu + cv) - 0.5);
  // posts and ropes: the four sides as their own pieces (the far ropes behind the fighters, the near in front)
  const corners = [[R.cx - R.hs, R.cy - R.hs, "#dc2626"], [R.cx + R.hs, R.cy - R.hs, "#f5f5f4"], [R.cx + R.hs, R.cy + R.hs, "#2563eb"], [R.cx - R.hs, R.cy + R.hs, "#f5f5f4"]];
  for (const [x, y, col] of corners) put(x, y, () => { vline(x, y, R.h, R.posts, "#9ca3af", Math.max(1, G.z * 0.1)); if (lod === "near") { const [a, b] = G.Q(x, y, R.posts - 0.08); G.ctx.fillStyle = col; G.ctx.fillRect(a - G.z * 0.08, b - G.z * 0.06, G.z * 0.16, G.z * 0.28); } }, 0.01);
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i], [bx, by] = corners[(i + 1) % 4], m = [(ax + bx) / 2, (ay + by) / 2];
    put(m[0], m[1], () => { for (const hr of R.ropes) gline([ax, ay], [bx, by], i % 2 ? "#e5e7eb" : "#ef4444", Math.max(1, G.z * 0.05), hr); }, 0.015);
  }
  // THE OCTAGON: the canvas raised a step, the fence in eight panels
  const octKey = Math.min(...O.pts.map(([x, y]) => { const [u, v] = rot(x, y, G.r); return u + v; }));
  const [ou, ov] = rot(O.cx, O.cy, G.r);
  K.put(O.cx, O.cy, () => {
    G.prism(O.pts, 0, O.h, "#111827", 1.3);
    G.poly(O.pts.map(p => G.Q(p[0], p[1], O.h + 0.002)), shade("#d6d3d1", nf));
    if (lod === "near") { const [mx, my] = G.Q(O.cx, O.cy, O.h + 0.004); const c = G.ctx; c.font = `bold ${Math.max(6, Math.round(G.z * 0.4))}px 'Fira Mono', monospace`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "rgba(17,24,39,0.45)"; c.fillText("HVI", mx, my); }
  }, octKey - (ou + ov) - 0.5);
  for (let i = 0; i < 8; i++) mesh(K, O.pts[i], O.pts[(i + 1) % 8], O.h, O.fence);
  // the judges' table; the locker rooms (a low block with its sign)
  const J = P.judges;
  put((J.x0 + J.x1) / 2, (J.y0 + J.y1) / 2, () => G.prism(rectPts(J.x0, J.y0, J.x1, J.y1), 0, J.h, "#374151", 1.2), 0.01);
  const Lk = P.locker;
  put((Lk.x0 + Lk.x1) / 2, (Lk.y0 + Lk.y1) / 2, () => {
    G.prism(rectPts(Lk.x0, Lk.y0, Lk.x1, Lk.y1), 0, Lk.h, "#52525b", 1.15);
    if (lod === "near") { const [mx, my] = G.Q((Lk.x0 + Lk.x1) / 2, Lk.y1 + 0.01, Lk.h * 0.6); const c = G.ctx; c.font = `bold ${Math.max(6, Math.round(G.z * 0.32))}px 'Fira Mono', monospace`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#fde68a"; c.fillText("LOCKER ROOMS", mx, my); }
  });
  // the stands: concrete tiers, a seat line in the corners' colours, fans on them
  for (const s of P.segs) {
    K.carried.set(s.seat, []);
    put(s.c[0], s.c[1], () => {
      G.prism(s.foot, 0, s.top, s.t % 2 ? "#6b7280" : "#7a838f", 1.25);
      for (const f of K.carried.get(s.seat)) f();
    });
  }
  // trees on the forecourt; light towers, lit for a bout after dark
  for (const [x, y] of P.trees) put(x, y, () => { vline(x, y, 0, 0.5, "#4a3222", Math.max(1, G.z * 0.08)); const [a, b] = G.Q(x, y, 0.9); const c = G.ctx; c.fillStyle = shade("#2f6b3e", nf); c.beginPath(); c.arc(a, b, G.z * 0.5, 0, Math.PI * 2); c.fill(); });
  const lit = Boolean(K.bout || boutsOn(Math.floor(K.mt / 24) + 1).some(b => { const t0 = Math.floor(K.mt / 24) * 24 + b.from; return K.mt >= t0 - 0.5 && K.mt < t0 + SLOT_H + 0.5; })) && lightsOn(K.hour);
  for (const [x, y] of P.lights) put(x, y, () => {
    vline(x, y, 0, 3, "#6b7280", Math.max(1, G.z * 0.1));
    const [sx, sy] = G.Q(x, y, 3.1), w = G.z * 0.8, hgt = G.z * 0.4, c = G.ctx;
    c.fillStyle = "#374151"; c.fillRect(sx - w / 2, sy - hgt / 2, w, hgt);
    c.fillStyle = lit ? "#fff7d6" : "#1f2937"; c.fillRect(sx - w / 2 + 1, sy - hgt / 2 + 1, w - 2, hgt - 2);
    if (lit && lod === "near") { const r = G.z * 2.2, g = c.createRadialGradient(sx, sy, 0, sx, sy, r); g.addColorStop(0, "rgba(255,247,214,0.35)"); g.addColorStop(1, "rgba(255,247,214,0)"); c.fillStyle = g; c.beginPath(); c.arc(sx, sy, r, 0, Math.PI * 2); c.fill(); }
  });
  // THE FIGHT BOARD on the forecourt: what is on, what is next, the last result
  board(K, P.board.a, P.board.b, P.board.h0, P.board.h1, fightBoard(K.mt));
  // the bout on now: the two in the ring or the octagon, by projection
  if (K.bout) drawBout(K);
  void present;
}
// The board's rows: [text, colour]
export function fightBoard(mt) {
  const day = Math.floor(mt / 24) + 1, list = boutsOn(day), rows = [["THE PIT // TONIGHT", "#fbbf24"]];
  const on = boutAt(mt);
  if (!list.length) return [...rows, ["NO BOUTS SCHEDULED", "#9ca3af"], ["FRIDAYS 20:00 // THE CARD", "#4ade80"], ["NIGHTLY 22:00 // GRIEVANCES", "#4ade80"]];
  for (const b of list.slice(0, 3)) {
    const t0 = (b.day - 1) * 24 + b.from, done = mt >= t0 + SLOT_H - 0.06;
    rows.push([done ? resultLine(b) : on && on.bout.id === b.id ? `NOW: ${billLine(b)}` : billLine(b), done ? "#9ca3af" : on && on.bout.id === b.id ? "#f87171" : "#e5e7eb"]);
  }
  return rows;
}
function drawBout(K) {
  const { G, lod } = K, { bout, phase } = K.bout;
  const P = PIT, marks = P.marks[bout.ring], hgt = bout.ring === "ring" ? P.ring.h : P.oct.h;
  const f = fightersOf(bout);
  f.forEach((fi, i) => {
    const s = projected(fi.key, fi.name, G.lookup);
    let [x, y] = marks[i], h = hgt, anim = bout.ring === "ring" ? "box" : "grapple", face = i === 0 ? 1 : -1;
    if (phase.phase === "walkout") {
      // out of the tunnel, one after the other, to their corner
      const k = Math.min(1, Math.max(0, phase.clock * 2 - i * 0.6));
      [x, y] = lerp([P.tunnel.x, P.tunnel.y1], marks[i], k); h = k > 0.92 ? hgt : 0; anim = null;
    } else if (phase.phase === "break") {
      // back to the corners
      const side = bout.ring === "ring" ? P.ring.hs - 0.45 : P.oct.r - 0.6;
      x = (bout.ring === "ring" ? P.ring.cx : P.oct.cx) + (i ? side : -side); anim = "idle";
    } else if (phase.phase === "decision" || phase.phase === "over") {
      // the result read: the winner's arms go up; the other applauds. A draw: both.
      anim = bout.win == null ? "clap" : bout.win === i ? "cheer" : "clap";
    }
    const [sx] = G.Q(x, y, h);
    K.put(x, y, () => {
      if (lod === "far") return;
      if (!anim) figure(K, s, x, y, h, "stand", face, {});
      else figure(K, s, x, y, h, "stand", G.Q(marks[1 - i][0], marks[1 - i][1], h)[0] > sx ? 1 : -1, { anim, ph: i * 0.37 });
    }, 0.03);
  });
}

// ---- THE TENNIS CLUB --------------------------------------------------------------------------------
function tennisLot(K) {
  const { G, lod, ground, gline, vline, put, present } = K;
  const T = TENNIS, L = T.lot, Fz = T.fence, nf = K.night ? 0.7 : 1, lw = Math.max(1, G.z * 0.045);
  ground(rectPts(L.x + 0.1, L.y + 0.1, L.x + L.w - 0.1, L.y + L.h - 0.1), shade("#1d3a22", nf));
  ground(rectPts(Fz.x0, Fz.y0, Fz.x1, Fz.y1), shade("#24392c", nf), 0.011);
  for (const c of T.courts) {
    ground(rectPts(c.x0, c.y0, c.x1, c.y1), shade(c.surface, nf), 0.012);
    // the playing area a shade lighter on the hard courts, the lines in chalk
    const x0 = c.cx - c.hw, x1 = c.cx + c.hw, s0 = c.cx - c.hs, s1 = c.cx + c.hs, y0 = c.cy - c.hl, y1 = c.cy + c.hl;
    if (c.surface === "#2f5f8f") ground(rectPts(x0, y0, x1, y1), shade("#3b6ea3", nf), 0.013);
    if (lod === "far") continue;
    for (const [a, b] of [[[x0, y0], [x1, y0]], [[x0, y1], [x1, y1]], [[x0, y0], [x0, y1]], [[x1, y0], [x1, y1]], [[s0, y0], [s0, y1]], [[s1, y0], [s1, y1]],
      [[s0, c.cy - c.sv], [s1, c.cy - c.sv]], [[s0, c.cy + c.sv], [s1, c.cy + c.sv]], [[c.cx, c.cy - c.sv], [c.cx, c.cy + c.sv]]]) gline(a, b, CHALK, lw, 0.02);
    // the net across the middle: posts, the band, the mesh
    put(c.cx, c.cy, () => {
      const a = [x0 - 0.15, c.cy], b = [x1 + 0.15, c.cy];
      vline(a[0], a[1], 0, 0.36, "#1f2937", Math.max(1, G.z * 0.06)); vline(b[0], b[1], 0, 0.36, "#1f2937", Math.max(1, G.z * 0.06));
      G.poly([G.Q(a[0], a[1], 0.02), G.Q(b[0], b[1], 0.02), G.Q(b[0], b[1], 0.34), G.Q(a[0], a[1], 0.34)], "rgba(20,20,20,0.35)");
      gline(a, b, "#f5f5f5", Math.max(1, G.z * 0.05), 0.34);
    }, 0.001);
  }
  if (lod === "far") { ground(rectPts(T.club.x0, T.club.y0, T.club.x1, T.club.y1), "#e7e5e4", 0.03); return; }
  // the enclosure: chain-link round the courts, a gate on the south side
  const Fe = [[Fz.x0, Fz.y0], [Fz.x1, Fz.y0], [Fz.x1, Fz.y1], [Fz.x0, Fz.y1]];
  for (let i = 0; i < 4; i++) {
    const a = Fe[i], b = Fe[(i + 1) % 4], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.6));
    for (let k = 0; k < n; k++) {
      const p = lerp(a, b, k / n), q = lerp(a, b, (k + 1) / n), m = lerp(p, q, 0.5);
      if (i === 2 && Math.abs(m[0] - T.gate[0]) < 0.9) continue;   // the gate
      mesh(K, p, q, 0, 0.75);
    }
  }
  // the clubhouse: white clapboard, a green roof, its name; the terrace with umbrellas
  const C = T.club;
  put((C.x0 + C.x1) / 2, (C.y0 + C.y1) / 2, () => {
    G.prism(rectPts(C.x0, C.y0, C.x1, C.y1), 0, C.h, "#e7e5e4", 1.15);
    G.prism(rectPts(C.x0 - 0.15, C.y0 - 0.15, C.x1 + 0.15, C.y1 + 0.15), C.h, C.h + 0.12, "#166534", 1.3);
    if (lod === "near") {
      const [mx, my] = G.Q((C.x0 + C.x1) / 2, C.y1 + 0.02, C.h * 0.62), c = G.ctx;
      c.font = `bold ${Math.max(6, Math.round(G.z * 0.3))}px 'Fira Mono', monospace`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#14532d"; c.fillText("THE TENNIS CLUB", mx, my);
    }
  });
  const Tr = T.terrace;
  ground(rectPts(Tr.x0, Tr.y0, Tr.x1, Tr.y1), shade("#a8a29e", nf), 0.012);
  for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) {
    const x = Tr.x0 + 0.5 + (k * 2 + 0.5) * ((Tr.x1 - Tr.x0 - 1) / 5), y = Tr.y0 + 0.5 + r * 1.2 - 0.02;
    put(x, y - 0.05, () => { vline(x, y - 0.05, 0, 0.75, "#e5e5e5", Math.max(1, G.z * 0.04)); const [sx, sy] = G.Q(x, y - 0.05, 0.8); const c = G.ctx; c.fillStyle = r ? "#166534" : "#f5f5f4"; c.beginPath(); c.ellipse(sx, sy, G.z * 0.45, G.z * 0.2, 0, 0, Math.PI * 2); c.fill(); }, -0.05);
  }
  // the umpire's chair at the show court's net
  const ch = T.chair;
  put(ch.x, ch.y, () => { for (const [dx, dy] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) vline(ch.x + dx, ch.y + dy, 0, ch.h, "#1f2937", Math.max(1, G.z * 0.04)); G.prism(rectPts(ch.x - 0.2, ch.y - 0.2, ch.x + 0.2, ch.y + 0.2), ch.h - 0.05, ch.h, "#166534", 1.2); }, -0.02);
  // the show court's board: the fixture's score, facing the terrace
  const show = T.courts.find(c => c.show), m = K.match;
  board(K, [show.x0 + 0.3, show.y0 - 0.05], [show.x1 - 0.3, show.y0 - 0.05], 0.6, 1.35, m ? [[m.name, "#4ade80"], [`${m.players[0].name} ${m.sets.map(s => s[0]).join(" ")}`, "#fbbf24"], [`${m.players[1].name} ${m.sets.map(s => s[1]).join(" ")}`, "#f87171"]] : [["THE TENNIS CLUB", "#4ade80"], ["SAT 14:00 CHAMPIONSHIP", "#e5e7eb"], ["WED 18:00 LADDER NIGHT", "#e5e7eb"]], "#0f2a1a");
  // rallies: a ball between the two players on each court, and on the show court in a fixture
  const rally = (a, b, seed) => {
    if (lod !== "near" || !K.t) return;
    const f = frac(K.t / 1.6 + seed), back = Math.floor(K.t / 1.6 + seed) % 2, k = back ? 1 - f : f;
    const p = lerp(a, b, k), h = 0.25 + Math.sin(k * Math.PI) * 0.6;
    put(p[0], p[1], () => { const [gx, gy] = G.Q(p[0], p[1], 0.01), [bx, by] = G.Q(p[0], p[1], h), c = G.ctx, r = Math.max(1.5, G.z * 0.08); c.fillStyle = "rgba(0,0,0,0.3)"; c.beginPath(); c.ellipse(gx, gy, r, r * 0.5, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = "#d9f99d"; c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.fill(); }, 0.05);
  };
  for (const c of T.courts.filter(c => !c.show)) {
    const n = present.get(`c${c.k}n`), s = present.get(`c${c.k}s`);
    if (n && s) rally([n.a.x, n.a.y], [s.a.x, s.a.y], c.k * 0.31);
  }
  if (m && !m.done) {
    const a = [show.cx - 0.3, show.cy - show.hl + 0.25], b = [show.cx + 0.3, show.cy + show.hl - 0.25];
    m.players.forEach((pl, i) => {
      const s = projected(pl.key, pl.name, G.lookup), [x, y] = i ? b : a;
      put(x, y, () => figure(K, s, x, y, 0, "stand", i ? -1 : 1, { anim: "tennis", ph: i * 0.5 }), 0.03);
    });
    rally(a, b, 0.5);
  } else if (m && m.done) {
    // the trophy: the winner at the net, arms up; the other applauds
    m.players.forEach((pl, i) => {
      const s = projected(pl.key, pl.name, G.lookup), x = show.cx + (i ? 0.45 : -0.45), y = show.cy + 0.4;
      put(x, y, () => figure(K, s, x, y, 0, "stand", i ? -1 : 1, { anim: m.winner === i ? "cheer" : "clap", ph: i * 0.5 }), 0.03);
    });
  }
}

// ---- labels and the cutaway line ------------------------------------------------------------------
export function venueLabel(lotId, mt) {
  if (VENUE_LOTS[lotId] === "pit") { const b = boutAt(mt); return b ? `THE PIT // ${b.phase.phase === "round" ? `ROUND ${b.phase.round}` : b.phase.phase === "walkout" ? "WALKOUT" : b.phase.phase === "break" ? "BETWEEN ROUNDS" : "THE DECISION"}` : "THE PIT"; }
  const m = tennisAt(mt);
  return m ? `THE TENNIS CLUB // ${m.label}` : "THE TENNIS CLUB";
}
export function venueLine(lotId, mt, n) {
  if (VENUE_LOTS[lotId] === "pit") {
    const b = boutAt(mt);
    if (!b) return `${n} AT THE PIT // FRIDAYS 20:00 THE CARD, NIGHTLY 22:00 GRIEVANCES. NOBODY IS HARMED. EVERYBODY IS ASSESSED.`;
    return b.phase.phase === "decision" || b.phase.phase === "over" ? `${n} AT THE PIT // ${resultLine(b.bout)}` : `${n} AT THE PIT // ${billLine(b.bout)}${b.phase.phase === "round" ? `, ROUND ${b.phase.round} OF 3` : ""}`;
  }
  const m = tennisAt(mt);
  return m ? `${n} AT THE CLUB // ${m.status}` : `${n} AT THE CLUB // NO FIXTURE. PRACTICE IS PERMITTED. SO IS LOVE, AS A SCORE.`;
}

// ---- the Dept of Planning (archDraw.js merges these) --------------------------------------------------
export const VENUE_STYLES_DRAWN = ["planning"];
export function venueDeco(X) {
  const { shade: sh, faceText, windowGrid, door } = X;
  function planningFace(K, p, faces) {
    for (const f of faces) {
      const front = f.s === "s";
      if (p.win === "planning") {
        // ribbon windows, the drawing office's lamps lit by who is at a desk
        windowGrid(K, f, p, { bay: 0.7, w: 0.62, y0: 0.35, y1: 0.8, from: 1, glass: "#2d4a5a", warm: false });
        K.flush();
        if (front) {
          // the ground floor recessed behind pilotis: dark glass, the public counter, the door
          K.G.poly(f.q(0.02, 0.98, 0.05, 0.9, -0.25), K.night ? "#fde68a" : sh("#314654", f.sh));
          for (let k = 0; k <= 8; k++) { const tc = 0.03 + 0.94 * k / 8; K.G.poly(f.q(tc - 0.006, tc + 0.006, 0, 1, 0.01), sh("#e7e5e4", f.sh * K.nf)); }
          door(K, f, 0.5, 0.9, 0.85, K.night ? "#fde68a" : "#1f2d36", { lit: true });
          faceText(K, f, 0.5, 2.35, p.sign || "DEPT OF PLANNING", 0.22, K.night ? "#e0f2fe" : "#1e3a5f", { d: 0.02, glow: K.night ? "rgba(186,230,253,0.35)" : null });
          faceText(K, f, 0.5, 1.12, "APPLICATIONS // OBJECTIONS // THE PANORAMA", 0.075, K.night ? "#bae6fd" : "#334155", { d: 0.02 });
        }
      }
    }
  }
  return { deco: { planning: { face: planningFace } }, far: {} };
}
// yard props: THE PANORAMA (the city in miniature on a stone plinth) and the notice board
export function drawVenueYard(K, p, env) {
  const { G, ctx, Q } = K, near = env.lod === "near", far = env.lod === "far", nf = K.nf;
  if (p.k === "noticeboard") {
    if (far) return true;
    for (const dx of [-0.25, 0.25]) K.line(Q(p.x + dx, p.y, 0), Q(p.x + dx, p.y, 0.9), "#4b5563", Math.max(1, K.z * 0.05));
    G.poly([Q(p.x - 0.3, p.y, 0.55), Q(p.x + 0.3, p.y, 0.55), Q(p.x + 0.3, p.y, 1.05), Q(p.x - 0.3, p.y, 1.05)], shade("#f5f5dc", nf), "#57534e");
    if (near) for (let k = 0; k < 3; k++) G.poly([Q(p.x - 0.25 + k * 0.17, p.y + 0.01, 0.62), Q(p.x - 0.12 + k * 0.17, p.y + 0.01, 0.62), Q(p.x - 0.12 + k * 0.17, p.y + 0.01, 0.95), Q(p.x - 0.25 + k * 0.17, p.y + 0.01, 0.95)], ["#fca5a5", "#fde68a", "#bfdbfe"][k]);
    return true;
  }
  if (p.k !== "panorama") return false;
  // the plinth
  const pl = { x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1 };
  const faces = [[[pl.x0, pl.y1], [pl.x1, pl.y1]], [[pl.x1, pl.y1], [pl.x1, pl.y0]], [[pl.x1, pl.y0], [pl.x0, pl.y0]], [[pl.x0, pl.y0], [pl.x0, pl.y1]]];
  const c = [(pl.x0 + pl.x1) / 2, (pl.y0 + pl.y1) / 2], H = 0.28;
  for (const [a, b] of faces) { const f = G.facing(a, b, c); if (f) G.poly([Q(a[0], a[1], 0), Q(b[0], b[1], 0), Q(b[0], b[1], H), Q(a[0], a[1], H)], shade("#a8a29e", f * nf)); }
  G.poly([Q(pl.x0, pl.y0, H), Q(pl.x1, pl.y0, H), Q(pl.x1, pl.y1, H), Q(pl.x0, pl.y1, H)], shade("#1f2a24", nf));
  if (far) return true;
  // the city, to scale: every district's ground, every building a block, the Loop in cyan
  const X0 = -3, Y0 = -44, X1 = 112, Y1 = 101, sx = (pl.x1 - pl.x0 - 0.3) / (X1 - X0), sy = (pl.y1 - pl.y0 - 0.3) / (Y1 - Y0);
  const M = (x, y) => [pl.x0 + 0.15 + (x - X0) * sx, pl.y0 + 0.15 + (y - Y0) * sy];
  const DCOL = { arts: "#4c3d7a", campus: "#2f5a3a", finance: "#3a5a7a", strip: "#7a2f4a", arena: "#4a6a2a", hq: "#1f5a3a", archive: "#6a6a3a", commons: "#3a6a2a", works: "#7a3a2a", sprawl: "#4a4a55", coast: "#c2a878", heights: "#dbe4ea" };
  for (const d of DISTRICTS) { const r = d.rect, a = M(r.x, r.y), b = M(r.x + r.w, r.y + r.h); G.poly([Q(a[0], a[1], H + 0.005), Q(b[0], a[1], H + 0.005), Q(b[0], b[1], H + 0.005), Q(a[0], b[1], H + 0.005)], shade(DCOL[d.id] || "#555", nf)); }
  if (near) {
    const r = LOOP_LINE.loop, a = M(r.x, r.y), b = M(r.x + r.w, r.y + r.h);
    ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 1; ctx.beginPath();
    [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]].forEach(([x, y], i) => { const [u, v] = Q(x, y, H + 0.03); if (i) ctx.lineTo(u, v); else ctx.moveTo(u, v); });
    ctx.closePath(); ctx.stroke();
    for (const bd of BUILDINGS) {
      if (bd.arch === "lot") continue;
      const [x, y] = M(bd.pos.x, bd.pos.y), [u, v] = Q(x, y, H + 0.01), [u2, v2] = Q(x, y, H + 0.01 + Math.min(0.35, 0.05 + (bd.floors.length * 0.04)));
      ctx.strokeStyle = shade(bd.district === "hq" ? "#0b0f0d" : "#e7e5e4", nf); ctx.lineWidth = Math.max(1, K.z * 0.08); ctx.beginPath(); ctx.moveTo(u, v); ctx.lineTo(u2, v2); ctx.stroke();
    }
  }
  return true;
}
