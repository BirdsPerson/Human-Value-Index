// The recreation ground in the iso view (CityIso.jsx): the Diamond, the Courts and the
// Recreation Ground drawn from parkGeo.js, with everyone present at an anchor doing the
// thing the anchor is for: pitching, swinging, crouched behind the plate, ready in the
// field, in the stands; shooting, dribbling, defending, on the bench; walking the
// fountain, eating at the tables, feeding the pigeons.
//
// Level of detail, by zoom: far = the field shapes and colours (a green fan, a brown
// diamond, two blue courts, paths round a fountain) with people as dots; mid = lines,
// bases, fences, stands, hoops, trees and tables, people as small sprites; near = the
// chain-link, nets, the scoreboard, the lights, the ball in play, people in their poses.
//
// Painter's order inside a lot: the ground first, then every standing thing (a fence
// panel, a hoop, a tree, a person) back to front by u + v. Stands, dugouts, benches and
// tables carry their own sitters, so a sitter is drawn on their seat, never under it.

import { rot, STOREY } from "./iso.js";
import { SPRITE_W, SPRITE_H, statureOf } from "../sprites.js";
import { sheetFor, miniFor } from "./spriteBank.js";
import { FAMILY_COLOR, familyOf } from "./cityKit.js";
import { drawPose, phaseOf, PITCH_S, SHOT_S } from "./poses.js";
import { assignAnchors, roleOf, actAt, typeOf } from "./props.js";
import { DIAMOND, COURTS, REC, PARK_ANCHORS, PARK_LOTS, ringAt } from "./parkGeo.js";
import { gameAt } from "./simApi.js";

const who = (s) => s.slug || s.name;
function h01(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; }
const frac = (v) => ((v % 1) + 1) % 1;
const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const circ = (cx, cy, r, n = 16) => Array.from({ length: n }, (_, k) => [cx + r * Math.cos((k / n) * Math.PI * 2), cy + r * Math.sin((k / n) * Math.PI * 2)]);
const rectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const GRASS = "#1f5a22", GRASS_HI = "#2a7a2c", GRASS_STRIPE = "#308a32", DIRT = "#9a6a3a", DIRT_D = "#7a5230", CHALK = "#f1f5f0";
const COURT = "#2c4a6e", PAINT = "#a4501a", ASPHALT = "#2a2f36", PATH = "#8a7a5a", STONE = "#7b848f", WATER = "#2a5f8a";
const MESH = "rgba(176,188,198,0.2)", RAIL = "#9aa6b2";
const lightsOn = (hour) => hour >= 18.25 || hour < 6.5;

// G: {ctx, Q(x, y, h) -> [sx, sy], poly, prism, wall, z, r, t, hits, w, h}
// people: [{s, w}] on this lot now. prev: last frame's seats (kept while they stay).
// -> {at, game} (at: Map person -> anchor index)
export function drawParkLot(G, lotId, lod, mt, people, prev) {
  const pid = PARK_LOTS[lotId], hour = ((mt % 24) + 24) % 24;
  const game = gameAt(pid, mt);
  const items = [], carried = new Map();
  const put = (x, y, draw, bias = 0) => { const [u, v] = rot(x, y, G.r); items.push({ k: u + v + bias, draw }); };
  const ground = (pts, fill, h = 0.01) => G.poly(pts.map(p => G.Q(p[0], p[1], h)), fill);
  const gline = (a, b, col, w, h = 0.015) => { const A = G.Q(a[0], a[1], h), B = G.Q(b[0], b[1], h); G.ctx.strokeStyle = col; G.ctx.lineWidth = w; G.ctx.beginPath(); G.ctx.moveTo(A[0], A[1]); G.ctx.lineTo(B[0], B[1]); G.ctx.stroke(); };
  const gpath = (pts, col, w, close = false, h = 0.015) => { const c = G.ctx; c.strokeStyle = col; c.lineWidth = w; c.beginPath(); pts.forEach((p, i) => { const S = G.Q(p[0], p[1], h); if (i) c.lineTo(S[0], S[1]); else c.moveTo(S[0], S[1]); }); if (close) c.closePath(); c.stroke(); };
  const vline = (x, y, h0, h1, col, w) => { const A = G.Q(x, y, h0), B = G.Q(x, y, h1); G.ctx.strokeStyle = col; G.ctx.lineWidth = w; G.ctx.beginPath(); G.ctx.moveTo(A[0], A[1]); G.ctx.lineTo(B[0], B[1]); G.ctx.stroke(); };
  const px = Math.max(1, G.z * 0.06);
  const K = { G, lod, hour, game, put, ground, gline, gpath, vline, px, carried, t: G.t };

  // who stands where (the order the anchors are listed: the battery first, then the field)
  const anchors = PARK_ANCHORS[pid];
  const list = people.map(o => ({ key: who(o.s), role: roleOf(o.w), s: o.s }));
  const { at } = assignAnchors(anchors, list, prev, hour, true);
  const present = new Map();
  for (const p of list) { const i = at.get(p.key); if (i != null) present.set(anchors[i].id, { p, a: anchors[i] }); }
  K.present = present;

  if (pid === "ball-field") diamond(K); else if (pid === "courts") courts(K); else recGround(K);

  // people: carried by their seat's prop, or standing on their own
  for (const [id, { p, a }] of present) {
    const fn = personDraw(K, pid, a, p);
    if (carried.has(id)) carried.get(id).push(fn.draw);
    else put(fn.x, fn.y, fn.draw, 0.02);
  }
  items.sort((a, b) => a.k - b.k);
  for (const it of items) it.draw();
  return { at, game };
}

// ---- people -------------------------------------------------------------------------------
function personDraw(K, pid, a, p) {
  const { G, lod, hour, game } = K;
  let x = a.x, y = a.y, look = a.look;
  let act = actAt(a, hour, p.role, typeOf(pid));
  const ph0 = phaseOf(p.key);
  let ph = ph0;
  if (a.ring) { const r = ringAt(a, G.t, ph0); x = r.x; y = r.y; look = [x + r.dx, y + r.dy]; act = "amble"; }
  if (act === "umpire" && !game) act = "rake";                  // between fixtures the umpire keeps the plate
  if (act === "shoot") { act = "jump"; ph = courtPhase(a); }    // the ball itself is drawn on the court
  if (act === "dribble") act = "hustle";
  if (act === "stroll") act = "amble";
  const draw = () => {
    const [sx, sy] = G.Q(x, y, a.h);
    if (sx < -40 || sx > G.w + 40 || sy < -60 || sy > G.h + 40) return;
    if (lod === "far") { G.ctx.fillStyle = FAMILY_COLOR[familyOf(p.s)] || "#6b9a7c"; G.ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 2, 2, 2); return; }
    const hh0 = G.z * STOREY * 0.95, k = statureOf(p.s), hpx = hh0 * k;
    if (lod === "mid" || hpx < 18) {
      const m = miniFor(p.s), sc = hpx / (SPRITE_H / 2);
      try { G.ctx.drawImage(m, Math.round(sx - (SPRITE_W / 4) * sc), Math.round(sy - hpx), Math.round((SPRITE_W / 2) * sc), Math.round(hpx)); } catch { /* not decoded yet */ }
      G.hits.push({ kind: "p", s: p.s, box: [sx - hpx * 0.3, sy - hpx, sx + hpx * 0.3, sy] });
      return;
    }
    let face = 0;
    if (look) { const [lx] = G.Q(look[0], look[1], a.h); face = lx > sx + 0.5 ? 1 : -1; }
    const box = drawPose(G.ctx, sheetFor(p.s), { kind: a.kind, act, face, walk: null }, act, sx, sy, hh0, G.t, ph, k);
    G.hits.push({ kind: "p", s: p.s, box });
  };
  return { x, y, draw };
}
const courtPhase = (a) => (a.id.endsWith("1") ? 0.37 : 0);

// A ball in play: an orange or white dot at a map point and height, with its shadow.
function ball(K, x, y, h, col) {
  K.put(x, y, () => {
    const { G } = K, r = Math.max(1.5, G.z * 0.09);
    const [gx, gy] = G.Q(x, y, 0.01), [bx, by] = G.Q(x, y, h);
    G.ctx.fillStyle = "rgba(0,0,0,0.3)"; G.ctx.beginPath(); G.ctx.ellipse(gx, gy, r, r * 0.5, 0, 0, Math.PI * 2); G.ctx.fill();
    G.ctx.fillStyle = col; G.ctx.beginPath(); G.ctx.arc(bx, by, r, 0, Math.PI * 2); G.ctx.fill();
  }, 0.05);
}

// A chain-link panel from a to b: a see-through mesh, a top rail, posts at the ends.
function mesh(K, a, b, h1, inside) {
  const { G, lod } = K;
  const m = lerp(a, b, 0.5);
  K.put(m[0], m[1], () => {
    const q = [G.Q(a[0], a[1], 0), G.Q(b[0], b[1], 0), G.Q(b[0], b[1], h1), G.Q(a[0], a[1], h1)];
    G.poly(q, MESH);
    const c = G.ctx;
    if (lod === "near") {
      c.strokeStyle = "rgba(190,200,210,0.16)"; c.lineWidth = 1; c.beginPath();
      const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25));
      for (let k = 0; k <= n; k++) { const p = lerp(a, b, k / n), A = G.Q(p[0], p[1], 0), B = G.Q(p[0], p[1], h1); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); }
      c.stroke();
    }
    K.vline(a[0], a[1], 0, h1, RAIL, K.px); K.vline(b[0], b[1], 0, h1, RAIL, K.px);
    c.strokeStyle = RAIL; c.lineWidth = K.px; c.beginPath(); c.moveTo(q[3][0], q[3][1]); c.lineTo(q[2][0], q[2][1]); c.stroke();
    void inside;
  });
}

// ---- the Diamond ---------------------------------------------------------------------------
function diamond(K) {
  const { G, lod, hour, game, ground, gline, gpath, vline, px, present, put } = K;
  const D = DIAMOND, L = D.lot, H = D.home;
  ground(rectPts(L.x + 0.1, L.y + 0.1, L.x + L.w - 0.1, L.y + L.h - 0.1), GRASS);
  ground(D.outfield, GRASS_HI);
  if (lod !== "far") {
    // mowing stripes across the fan, clipped to it
    const c = G.ctx;
    c.save(); c.beginPath(); D.outfield.forEach((p, i) => { const S = G.Q(p[0], p[1], 0.012); if (i) c.lineTo(S[0], S[1]); else c.moveTo(S[0], S[1]); }); c.closePath(); c.clip();
    const n = D.stripes, y0 = H[1] - D.fenceR, step = D.fenceR / n;
    for (let k = 0; k < n; k += 2) ground(rectPts(L.x, y0 + k * step, L.x + L.w, y0 + (k + 1) * step), GRASS_STRIPE, 0.012);
    c.restore();
    ground([...D.fence, ...D.track.slice().reverse()], DIRT_D, 0.013);   // the warning track
  }
  ground(D.dirt, DIRT, 0.014);
  ground(D.grassIn, GRASS_HI, 0.016);
  ground(circ(D.mound[0], D.mound[1], 0.42, 14), DIRT, 0.018);
  ground(circ(H[0], H[1], 0.62, 16), DIRT, 0.018);
  for (const b of [D.first, D.second, D.third]) ground(circ(b[0], b[1], 0.34, 10), DIRT, 0.017);
  if (lod !== "far") {
    for (const [a, b] of D.foul) gline(a, b, CHALK, Math.max(1, G.z * 0.05), 0.02);
    // bases, the plate, the rubber, the batter's boxes
    const sq = (p, r) => [[p[0], p[1] - r], [p[0] + r, p[1]], [p[0], p[1] + r], [p[0] - r, p[1]]];
    for (const b of [D.first, D.second, D.third]) ground(sq(b, 0.16), CHALK, 0.022);
    ground([[H[0] - 0.13, H[1] - 0.1], [H[0] + 0.13, H[1] - 0.1], [H[0] + 0.13, H[1] + 0.02], [H[0], H[1] + 0.13], [H[0] - 0.13, H[1] + 0.02]], CHALK, 0.022);
    if (lod === "near") {
      ground(rectPts(D.mound[0] - 0.12, D.mound[1] - 0.03, D.mound[0] + 0.12, D.mound[1] + 0.03), CHALK, 0.022);
      for (const s of [-1, 1]) gpath(rectPts(H[0] + s * 0.22 - 0.14, H[1] - 0.3, H[0] + s * 0.22 + 0.14, H[1] + 0.3), "rgba(241,245,240,0.8)", 1, true, 0.021);
    }
  }
  if (lod === "far") return;

  // the outfield wall, a panel at a time; the foul poles
  for (let i = 0; i + 1 < D.fence.length; i++) {
    const a = D.fence[i], b = D.fence[i + 1], m = lerp(a, b, 0.5);
    put(m[0], m[1], () => {
      G.poly([G.Q(a[0], a[1], 0), G.Q(b[0], b[1], 0), G.Q(b[0], b[1], 0.32), G.Q(a[0], a[1], 0.32)], i % 5 === 2 ? "#1a5e33" : "#14532d");
      const A = G.Q(a[0], a[1], 0.32), B = G.Q(b[0], b[1], 0.32);
      G.ctx.strokeStyle = "#fbbf24"; G.ctx.lineWidth = px; G.ctx.beginPath(); G.ctx.moveTo(A[0], A[1]); G.ctx.lineTo(B[0], B[1]); G.ctx.stroke();
    });
  }
  for (const p of D.poles) put(p[0], p[1], () => vline(p[0], p[1], 0, 1.7, "#fbbf24", Math.max(1, G.z * 0.07)));
  // the backstop: chain-link on posts behind the plate
  for (let i = 0; i + 1 < D.backstop.length; i++) mesh(K, D.backstop[i], D.backstop[i + 1], 1.05, H);

  // dugouts: a sunk bench under a roof, the team on it
  for (const d of D.dugouts) {
    const ids = [0, 1, 2].map(k => `dug${d.side}${k}`);
    ids.forEach(id => K.carried.set(id, []));
    put((d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, () => {
      G.prism(rectPts(d.x0, d.y1 - 0.12, d.x1, d.y1), 0, 0.5, "#3b4148", 1.2);   // back wall
      G.prism(rectPts(d.x0, d.y0 + 0.3, d.x1, d.y0 + 0.5), 0, 0.2, "#4b5563", 1.3);   // the bench
      for (const id of ids) for (const f of K.carried.get(id)) f();
      G.prism(rectPts(d.x0 - 0.05, d.y0 + 0.45, d.x1 + 0.05, d.y1), 0.5, 0.56, "#1d4ed8", 1.1);   // the roof over the back of the bench, team blue
    });
  }
  // the stands: aluminium tiers stepping up away from the field, fans on each
  for (const b of D.bleachers) for (let t = b.tiers - 1; t >= 0; t--) {
    const x0 = b.side < 0 ? b.x1 - 0.75 * (t + 1) : b.x0 + 0.75 * t, x1 = x0 + 0.75, top = 0.12 + t * 0.2;
    const ids = [0, 1, 2].map(k => `bl${b.side}${t}${k}`);
    ids.forEach(id => K.carried.set(id, []));
    put((x0 + x1) / 2, (b.y0 + b.y1) / 2, () => {
      G.prism(rectPts(x0, b.y0, x1, b.y1), 0, top, "#8a939c", 1.25);
      if (lod === "near") { const s0 = b.side < 0 ? x1 - 0.02 : x0 + 0.02; K.gline([s0, b.y0], [s0, b.y1], "rgba(20,24,28,0.6)", 1, top + 0.001); }
      for (const id of ids) for (const f of K.carried.get(id)) f();
    });
  }
  // light towers: lit for a fixture after dark
  const lit = !!game && lightsOn(hour);
  for (const p of D.lights) put(p[0], p[1], () => {
    vline(p[0], p[1], 0, 3.1, "#6b7280", Math.max(1, G.z * 0.1));
    const [x, y] = G.Q(p[0], p[1], 3.2), w = G.z * 0.9, hgt = G.z * 0.45;
    G.ctx.fillStyle = "#374151"; G.ctx.fillRect(x - w / 2, y - hgt / 2, w, hgt);
    G.ctx.fillStyle = lit ? "#fff7d6" : "#1f2937"; G.ctx.fillRect(x - w / 2 + 1, y - hgt / 2 + 1, w - 2, hgt - 2);
    if (lit && lod === "near") {
      const r = G.z * 2.2, g = G.ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,247,214,0.35)"); g.addColorStop(1, "rgba(255,247,214,0)");
      G.ctx.fillStyle = g; G.ctx.beginPath(); G.ctx.arc(x, y, r, 0, Math.PI * 2); G.ctx.fill();
    }
  });
  // the scoreboard, over the left-field corner
  const bd = D.board;
  put((bd.x0 + bd.x1) / 2, bd.y, () => {
    for (const x of [bd.x0 + 0.3, bd.x1 - 0.3]) vline(x, bd.y, 0, 1.0, "#4b5563", Math.max(1, G.z * 0.08));
    G.prism(rectPts(bd.x0, bd.y - 0.08, bd.x1, bd.y + 0.08), 1.0, 2.1, "#0f1a14", 1.2);
    if (lod !== "near") return;
    const f = G.facing ? G.facing([bd.x0, bd.y + 0.08], [bd.x1, bd.y + 0.08], [(bd.x0 + bd.x1) / 2, bd.y]) : 1;
    if (!f) return;
    const A = G.Q(bd.x0 + 0.15, bd.y + 0.09, 1.95), B = G.Q(bd.x1 - 0.15, bd.y + 0.09, 1.95);
    const c = G.ctx, fs = Math.max(7, Math.round(G.z * 0.34));
    c.save(); c.font = `${fs}px "Fira Mono", monospace`; c.textBaseline = "top"; c.textAlign = "left";
    const ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
    c.translate(A[0], A[1]); c.rotate(ang);
    const rows = game ? [["COMPLIANT", game.score[0]], ["ASSESSED", game.score[1]]] : [["HOME", "-"], ["AWAY", "-"]];
    rows.forEach(([n, v], i) => { c.fillStyle = i ? "#f87171" : "#fbbf24"; c.fillText(n, 0, i * fs * 1.15); c.fillText(String(v), Math.hypot(B[0] - A[0], B[1] - A[1]) - fs, i * fs * 1.15); });
    c.fillStyle = "#4ade80"; c.fillText(game ? `${game.top ? "TOP" : "BOT"} ${game.inning}` : "NO FIXTURE", 0, 2.3 * fs * 1.15);
    c.restore();
  });

  // the ball: pitched, and now and then put in play
  if (lod === "near" && K.t > 0 && present.has("pitcher") && present.has("catcher")) {
    const cyc = Math.floor(K.t / PITCH_S), f = frac(K.t / PITCH_S);
    const plate = [H[0], H[1] + 0.35];
    if (f >= 0.72 && f < 0.87) { const k = (f - 0.72) / 0.15, p = lerp(D.mound, plate, k); ball(K, p[0], p[1], 0.62 - 0.12 * k, "#f8fafc"); }
    if (present.has("batter") && h01(`hit${cyc}`) < 0.4 && f >= 0.87) {
      const fielders = ["first", "second", "short", "third", "centre", "left", "right"].filter(id => present.has(id));
      if (fielders.length) {
        const to = present.get(fielders[Math.floor(h01(`to${cyc}`) * fielders.length)]).a, k = (f - 0.87) / 0.13;
        const p = lerp(H, [to.x, to.y], k);
        ball(K, p[0], p[1], 0.5 + Math.sin(k * Math.PI) * 2.4, "#f8fafc");
      }
    }
  }
}

// ---- the Courts ----------------------------------------------------------------------------
function courts(K) {
  const { G, lod, ground, gline, gpath, vline, px, present, put } = K;
  const C = COURTS, F = C.fence, L = C.lot;
  ground(rectPts(L.x + 0.1, L.y + 0.1, L.x + L.w - 0.1, L.y + L.h - 0.1), "#1c3a1f");
  ground(rectPts(F.x0, F.y0, F.x1, F.y1), ASPHALT, 0.012);
  const lw = Math.max(1, G.z * 0.045);
  for (const c of C.courts) {
    ground(rectPts(c.x0, c.y0, c.x1, c.y1), COURT, 0.014);
    for (const [hx, hy] of c.hoops) {
      const dir = hy < (c.y0 + c.y1) / 2 ? 1 : -1, base = dir > 0 ? c.y0 : c.y1;
      ground(rectPts(c.cx - 0.55, Math.min(base, base + dir * 1.35), c.cx + 0.55, Math.max(base, base + dir * 1.35)), PAINT, 0.016);
      if (lod !== "far") {
        const arc = Array.from({ length: 17 }, (_, k) => { const a = -Math.PI / 2 + (k / 16) * Math.PI; return [hx + Math.sin(a) * 1.5, hy + dir * Math.cos(a) * 1.5]; });
        gpath([[hx - 1.5, base], ...arc, [hx + 1.5, base]], CHALK, lw, false, 0.02);
        gpath(circ(c.cx, base + dir * 1.35, 0.45, 14), CHALK, lw, true, 0.02);
      }
    }
    if (lod !== "far") {
      gpath(rectPts(c.x0, c.y0, c.x1, c.y1), CHALK, lw, true, 0.02);
      const my = (c.y0 + c.y1) / 2;
      gline([c.x0, my], [c.x1, my], CHALK, lw, 0.02);
      gpath(circ(c.cx, my, 0.45, 14), CHALK, lw, true, 0.02);
    }
  }
  if (lod === "far") return;
  // hoops: a pole behind the baseline, the arm, the backboard, the rim and its net
  for (const c of C.courts) for (const [hx, hy] of c.hoops) {
    const dir = hy < (c.y0 + c.y1) / 2 ? 1 : -1, pole = [hx, (dir > 0 ? c.y0 : c.y1) - dir * 0.18], bb = hy - dir * 0.25;
    put(pole[0], pole[1], () => {
      vline(pole[0], pole[1], 0, 1.75, "#4b5563", Math.max(1, G.z * 0.09));
      const A = G.Q(pole[0], pole[1], 1.72), B = G.Q(hx, bb, 1.72);
      G.ctx.strokeStyle = "#4b5563"; G.ctx.lineWidth = Math.max(1, G.z * 0.07); G.ctx.beginPath(); G.ctx.moveTo(A[0], A[1]); G.ctx.lineTo(B[0], B[1]); G.ctx.stroke();
      G.poly([G.Q(hx - 0.36, bb, 1.45), G.Q(hx + 0.36, bb, 1.45), G.Q(hx + 0.36, bb, 1.95), G.Q(hx - 0.36, bb, 1.95)], "rgba(236,240,244,0.88)", "#9ca3af");
      if (lod === "near") G.poly([G.Q(hx - 0.13, bb, 1.55), G.Q(hx + 0.13, bb, 1.55), G.Q(hx + 0.13, bb, 1.72), G.Q(hx - 0.13, bb, 1.72)], null, "#dc2626");
      const rim = circ(hx, hy, 0.2, 12).map(p => G.Q(p[0], p[1], 1.55));
      G.ctx.strokeStyle = "#f97316"; G.ctx.lineWidth = Math.max(1, G.z * 0.06); G.ctx.beginPath(); rim.forEach((p, i) => (i ? G.ctx.lineTo(p[0], p[1]) : G.ctx.moveTo(p[0], p[1]))); G.ctx.closePath(); G.ctx.stroke();
      if (lod === "near") { G.ctx.strokeStyle = "rgba(236,240,244,0.6)"; G.ctx.lineWidth = 1; G.ctx.beginPath(); for (const p of circ(hx, hy, 0.2, 6)) { const A = G.Q(p[0], p[1], 1.55), B = G.Q(hx + (p[0] - hx) * 0.5, hy + (p[1] - hy) * 0.5, 1.3); G.ctx.moveTo(A[0], A[1]); G.ctx.lineTo(B[0], B[1]); } G.ctx.stroke(); }
    }, dir > 0 ? -0.3 : 0.3);
  }
  // the fence, in panels; the gate in the aisle stays open
  const sides = [[[F.x0, F.y0], [F.x1, F.y0]], [[F.x1, F.y0], [F.x1, F.y1]], [[F.x1, F.y1], [F.x0, F.y1]], [[F.x0, F.y1], [F.x0, F.y0]]];
  const gate = C.gate, mid = [(F.x0 + F.x1) / 2, (F.y0 + F.y1) / 2];
  for (const [a, b] of sides) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(len / 1.5));
    for (let k = 0; k < n; k++) {
      const p0 = lerp(a, b, k / n), p1 = lerp(a, b, (k + 1) / n);
      if (Math.abs(p0[1] - gate[1]) < 1e-6 && Math.abs(p1[1] - gate[1]) < 1e-6 && Math.min(p0[0], p1[0]) < gate[0] && Math.max(p0[0], p1[0]) > gate[0]) {
        const g0 = [gate[0] - 0.4, gate[1]], g1 = [gate[0] + 0.4, gate[1]], lo = p0[0] < p1[0] ? [p0, p1] : [p1, p0];
        mesh(K, lo[0], g0, 1.25, mid); mesh(K, g1, lo[1], 1.25, mid);
      } else mesh(K, p0, p1, 1.25, mid);
    }
  }
  // benches down the aisle, their sitters on them
  const ax = (C.aisle.x0 + C.aisle.x1) / 2;
  for (let k = 0; k < 4; k++) {
    const id = `bench${k}`, y = F.y0 + 2.8 + k * 0.85;
    K.carried.set(id, []);
    put(ax, y, () => { G.prism(rectPts(ax - 0.14, y - 0.34, ax + 0.14, y + 0.34), 0, 0.2, "#6b7280", 1.35); for (const f of K.carried.get(id)) f(); });
  }
  // the ball, one per game: dribbled, set, shot at the rim
  if (lod === "near" && K.t > 0) for (const c of C.courts) {
    const sh = present.get(`sh${c.k}`), dr = present.get(`dr${c.k}`);
    if (!sh && !dr) continue;
    const f = frac(K.t / SHOT_S + (c.k ? 0.37 : 0)), [hx, hy] = c.hoops[c.end];
    if (dr && (f < 0.6 || !sh)) { const b = Math.abs(Math.sin(K.t * 1.7 * Math.PI)); ball(K, dr.a.x + 0.25, dr.a.y, 0.05 + b * 0.38, "#f97316"); }
    else if (sh && f < 0.82) ball(K, sh.a.x, sh.a.y, 1.05, "#f97316");
    else if (sh) { const k = (f - 0.82) / 0.18, p = lerp([sh.a.x, sh.a.y], [hx, hy], k); ball(K, p[0], p[1], 1.05 + 0.5 * k + Math.sin(k * Math.PI) * 0.8, "#f97316"); }
  }
}

// ---- the Recreation Ground -------------------------------------------------------------------
function recGround(K) {
  const { G, lod, hour, ground, vline, put, px } = K;
  const R = REC, L = R.lot, [cx, cy] = R.c, pw = R.pathW / 2;
  ground(rectPts(L.x + 0.1, L.y + 0.1, L.x + L.w - 0.1, L.y + L.h - 0.1), "#24632a");
  if (lod !== "far") for (let i = 0; i < 7; i++) {   // the lawn, patchy where it is walked on
    const x = L.x + 0.6 + h01(`lawn${i}`) * (L.w - 1.2), y = L.y + 0.6 + h01(`lawnv${i}`) * (L.h - 1.2);
    ground(circ(x, y, 0.5 + h01(`lr${i}`) * 0.5, 10), "#2b7331", 0.011);
  }
  // the paths: a ring round the fountain, four spokes out to the gates
  ground([...circ(cx, cy, R.ringR + pw, 28), ...circ(cx, cy, R.ringR - pw, 28).reverse()], PATH, 0.013);
  for (const [a, b] of R.spokes) {
    const d = [b[0] - a[0], b[1] - a[1]], n = Math.hypot(...d), q = [-d[1] / n * pw, d[0] / n * pw];
    ground([[a[0] + q[0], a[1] + q[1]], [b[0] + q[0], b[1] + q[1]], [b[0] - q[0], b[1] - q[1]], [a[0] - q[0], a[1] - q[1]]], PATH, 0.013);
  }
  // the fountain: a stone basin, water, the jet
  ground(circ(cx, cy, R.fountainR + 0.08, 20), STONE, 0.014);
  ground(circ(cx, cy, R.fountainR - 0.06, 20), WATER, 0.016);
  if (lod === "far") return;
  // the picnic blanket, and a pile of leaves by the keeper
  const [bx, by] = R.blanket;
  ground(rectPts(bx - 0.45, by - 0.3, bx + 0.45, by + 0.3), "#b91c1c", 0.017);
  if (lod === "near") for (let k = 0; k < 3; k++) ground(rectPts(bx - 0.45 + k * 0.3 + 0.1, by - 0.3, bx - 0.45 + k * 0.3 + 0.2, by + 0.3), "#f5f5f5", 0.018);
  put(cx, cy, () => {
    // the basin rim stands a little, the jet plays over it
    const rim = circ(cx, cy, R.fountainR + 0.08, 20);
    G.ctx.strokeStyle = "#9aa3ad"; G.ctx.lineWidth = Math.max(1, G.z * 0.1); G.ctx.beginPath(); rim.forEach((p, i) => { const S = G.Q(p[0], p[1], 0.14); if (i) G.ctx.lineTo(S[0], S[1]); else G.ctx.moveTo(S[0], S[1]); }); G.ctx.closePath(); G.ctx.stroke();
    vline(cx, cy, 0, 0.55, "#9aa3ad", Math.max(1, G.z * 0.12));
    if (lod === "near") for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, f = K.t > 0 ? frac(K.t * 0.8 + k / 8) : 0.5, r = 0.1 + f * 0.5;
      const [x, y] = G.Q(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.6 + Math.sin(f * Math.PI) * 0.35 - f * 0.4);
      G.ctx.fillStyle = `rgba(165,210,250,${(0.85 * (1 - f * 0.7)).toFixed(2)})`; G.ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(G.z * 0.08)), Math.max(1, Math.round(G.z * 0.08)));
    }
  }, -0.4);
  // picnic tables: the benches either side carry the diners
  for (const [tx, ty] of R.tables) {
    const ids = [0, 1, 2, 3].map(k => `pt${tx.toFixed(1)}${k}`);
    ids.forEach(id => K.carried.set(id, []));
    const far = ids.slice(0, 2), near = ids.slice(2);
    const bench = (y) => G.prism(rectPts(tx - 0.65, y - 0.1, tx + 0.65, y + 0.1), 0, 0.2, "#6a4a2a", 1.3);
    put(tx, ty, () => {
      // whichever side of the table is further from the viewer goes first
      const [, v0] = rot(tx, ty - 0.55, G.r), [, v1] = rot(tx, ty + 0.55, G.r), [u0] = rot(tx, ty - 0.55, G.r), [u1] = rot(tx, ty + 0.55, G.r);
      const topFirst = u0 + v0 < u1 + v1;
      const side = (y, list) => { bench(y); for (const id of list) for (const f of K.carried.get(id)) f(); };
      if (topFirst) side(ty - 0.55, far);
      else side(ty + 0.55, near);
      G.prism(rectPts(tx - 0.7, ty - 0.28, tx + 0.7, ty + 0.28), 0.34, 0.4, "#8a6a42", 1.3);
      if (lod === "near") {
        const [x, y] = G.Q(tx, ty, 0.41), s = G.z * 0.22;
        G.ctx.fillStyle = "#dc2626"; G.ctx.fillRect(x - s, y - s * 0.5, s, s * 0.5); G.ctx.fillStyle = "#f5f5f5"; G.ctx.fillRect(x, y - s * 0.5, s, s * 0.5);
        G.ctx.fillStyle = "#a16207"; G.ctx.fillRect(x - s * 0.4, y - s * 1.2, s * 0.8, s * 0.6);
      }
      if (topFirst) side(ty + 0.55, near);
      else side(ty - 0.55, far);
    });
  }
  // benches along the cross path
  for (const [bx0, by0] of R.benches) {
    const ids = [0, 1].map(k => `bn${bx0.toFixed(1)}${k}`);
    ids.forEach(id => K.carried.set(id, []));
    put(bx0, by0, () => {
      G.prism(rectPts(bx0 - 0.55, by0 - 0.24, bx0 + 0.55, by0 - 0.16), 0, 0.42, "#5a3a22", 1.2);   // back rest
      G.prism(rectPts(bx0 - 0.55, by0 - 0.16, bx0 + 0.55, by0 + 0.1), 0.16, 0.21, "#7a5232", 1.3);
      for (const id of ids) for (const f of K.carried.get(id)) f();
    }, -0.05);
  }
  // trees and lamps
  for (const [x, y] of R.trees) put(x, y, () => {
    vline(x, y, 0, 0.8, "#4a3018", Math.max(1, G.z * 0.14));
    const [sx, sy] = G.Q(x, y, 1.25), r = G.z * 0.62;
    G.ctx.fillStyle = "#15803d"; G.ctx.beginPath(); G.ctx.ellipse(sx, sy, r, r * 0.8, 0, 0, Math.PI * 2); G.ctx.fill();
    G.ctx.fillStyle = "#22a04d"; G.ctx.beginPath(); G.ctx.ellipse(sx - r * 0.25, sy - r * 0.3, r * 0.55, r * 0.45, 0, 0, Math.PI * 2); G.ctx.fill();
  });
  const dark = hour >= 19 || hour < 6.5;
  for (const [x, y] of R.lamps) put(x, y, () => {
    vline(x, y, 0, 1.5, "#374151", Math.max(1, G.z * 0.07));
    const [sx, sy] = G.Q(x, y, 1.55);
    G.ctx.fillStyle = dark ? "#fde68a" : "#4b5563"; G.ctx.fillRect(sx - G.z * 0.14, sy - G.z * 0.12, G.z * 0.28, G.z * 0.2);
    if (dark && lod === "near") { const g = G.ctx.createRadialGradient(sx, sy, 0, sx, sy, G.z * 1.6); g.addColorStop(0, "rgba(253,230,138,0.3)"); g.addColorStop(1, "rgba(253,230,138,0)"); G.ctx.fillStyle = g; G.ctx.beginPath(); G.ctx.arc(sx, sy, G.z * 1.6, 0, Math.PI * 2); G.ctx.fill(); }
  });
  void px;
}
