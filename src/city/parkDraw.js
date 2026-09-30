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
//
// The Bowl (a gridiron in a stadium) and the estate pitch follow the same rules: far = the
// stands, the green, the end zones; mid = the lines, posts, goals, benches, the crowd as
// small sprites, a colour under each player for their side; near = numbers, pylons, nets,
// flags, the scoreboard, the ball in play, everyone posed.

import { rot, STOREY } from "./iso.js";
import { SPRITE_W, SPRITE_H, statureOf } from "../sprites.js";
import { sheetFor, miniFor } from "./spriteBank.js";
import { FAMILY_COLOR, familyOf } from "./cityKit.js";
import { drawPose, phaseOf, PITCH_S, SHOT_S, PLAY_S, SNAP_F, THROW_F, CATCH_F } from "./poses.js";
import { assignAnchors, actAt, typeOf } from "./props.js";
import { DIAMOND, COURTS, REC, BOWL, PITCH, PARK_ANCHORS, PARK_LOTS, ringAt, fieldRole } from "./parkGeo.js";
import { gameAt, leagueTableAt } from "./simApi.js";
import { scoreCheer } from "./rigReact.js";

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
// the sides' colours: the gridiron's ENFORCERS and ASSETS, the pitch's SPRAWL UNITED and
// RECLAMATION ATHLETIC (and their keepers)
const KIT = { stadium: ["#eab308", "#8b5cf6"], pitch: ["#dc2626", "#2563eb"] };
const KEEPER_KIT = ["#22c55e", "#f59e0b"];
const ENDZONE = ["#8a6a0a", "#4c1d95"], TURF = "#2b7a2e", TURF_HI = "#318a35", SURROUND = "#1d5e22", CONCRETE = "#2e333b";

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
  // a score just changed: the stands are on their feet for a few seconds (rigReact.scoreCheer)
  const K = { G, lod, hour, game, put, ground, gline, gpath, vline, px, carried, t: G.t, mt, roar: scoreCheer(pid, game, G.t) };

  // who stands where (the order the anchors are listed: the battery first, then the field)
  const anchors = PARK_ANCHORS[pid];
  const list = people.map(o => { const r = fieldRole(o.s, o.w); return { key: who(o.s), role: r.role, pri: r.pri, s: o.s }; });
  const { at } = assignAnchors(anchors, list, prev, hour, true);
  const present = new Map();
  for (const p of list) { const i = at.get(p.key); if (i != null) present.set(anchors[i].id, { p, a: anchors[i] }); }
  K.present = present;

  if (pid === "ball-field") diamond(K); else if (pid === "courts") courts(K); else if (pid === "stadium") bowl(K); else if (pid === "pitch") pitchLot(K); else recGround(K);

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
    if (lod === "far") { G.ctx.fillStyle = FAMILY_COLOR[familyOf(p.s).family] || "#6b9a7c"; G.ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 2, 2, 2); return; }
    // a player's side, as a colour on the ground under them
    if (a.team != null && a.kind === "stand" && KIT[pid]) {
      const col = a.gk ? KEEPER_KIT[a.team] : KIT[pid][a.team], r = Math.max(2, G.z * 0.2);
      const [gx, gy] = G.Q(x, y, 0.02);
      G.ctx.fillStyle = col; G.ctx.globalAlpha = 0.75; G.ctx.beginPath(); G.ctx.ellipse(gx, gy, r, r * 0.5, 0, 0, Math.PI * 2); G.ctx.fill(); G.ctx.globalAlpha = 1;
    }
    const hh0 = G.z * STOREY * 0.95, k = statureOf(p.s), hpx = hh0 * k;
    if (lod === "mid" || hpx < 18) {
      const m = miniFor(p.s), sc = hpx / (SPRITE_H / 2);
      try { G.ctx.drawImage(m, Math.round(sx - (SPRITE_W / 4) * sc), Math.round(sy - hpx), Math.round((SPRITE_W / 2) * sc), Math.round(hpx)); } catch { /* not decoded yet */ }
      if (!p.s.crowd) G.hits.push({ kind: "p", s: p.s, box: [sx - hpx * 0.3, sy - hpx, sx + hpx * 0.3, sy] });   // a stand-in (crowd.js) never opens
      return;
    }
    let face = 0;
    if (look) { const [lx] = G.Q(look[0], look[1], a.h); face = lx > sx + 0.5 ? 1 : -1; }
    const fan = K.roar && FAN_ACTS.has(act);
    const box = drawPose(G.ctx, sheetFor(p.s), { kind: a.kind, act, face, walk: null, anim: fan ? (frac(ph * 5.3) < 0.7 ? "cheer" : "clap") : null }, act, sx, sy, hh0, G.t, ph, k);
    if (!p.s.crowd) G.hits.push({ kind: "p", s: p.s, box });
  };
  return { x, y, draw };
}
// who is watching rather than playing: they cheer a score
const FAN_ACTS = new Set(["cheer", "watch", "view", "eat", "drink", "sit", "rest", "wait", "listen"]);
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
    // mowing stripes across the fan, square to centre field, clipped to it
    const c = G.ctx;
    c.save(); c.beginPath(); D.outfield.forEach((p, i) => { const S = G.Q(p[0], p[1], 0.012); if (i) c.lineTo(S[0], S[1]); else c.moveTo(S[0], S[1]); }); c.closePath(); c.clip();
    for (const b of D.stripes) ground(b, GRASS_STRIPE, 0.012);
    c.restore();
    ground([...D.fence, ...D.track.slice().reverse()], DIRT_D, 0.013);   // the warning track
  }
  ground(D.dirt, DIRT, 0.014);
  ground(D.grassIn, GRASS_HI, 0.016);
  ground(circ(D.mound[0], D.mound[1], 0.42, 14), DIRT, 0.018);
  ground(circ(H[0], H[1], 0.62, 16), DIRT, 0.018);
  for (const b of [D.first, D.second, D.third]) ground(circ(b[0], b[1], 0.34, 10), DIRT, 0.017);
  if (lod === "far") {   // the stands as their footprints
    for (const s of D.stands) ground(s.foot, "#6b737c", 0.02);
    return;
  }
  for (const [a, b] of D.foul) gline(a, b, CHALK, Math.max(1, G.z * 0.05), 0.02);
  // bases, the plate, the rubber, the batter's boxes
  for (const b of D.bases) ground(b, CHALK, 0.022);
  ground(D.plate, CHALK, 0.022);
  if (lod === "near") {
    ground(D.rubber, CHALK, 0.022);
    for (const b of D.boxes) gpath(b, "rgba(241,245,240,0.8)", 1, true, 0.021);
  }

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
  // the backstop: chain-link on posts in front of the seats behind the plate
  for (let i = 0; i + 1 < D.backstop.length; i++) mesh(K, D.backstop[i], D.backstop[i + 1], 1.05, H);

  // dugouts: a sunk bench under a roof, the team on it
  for (const d of D.dugouts) {
    const ids = [0, 1, 2].map(k => `dug${d.side}${k}`);
    ids.forEach(id => K.carried.set(id, []));
    const R = (a0, a1, e0, e1) => { const p = (a, e) => (d.axis === "x" ? [a, d.d0 + (d.d1 - d.d0) * e] : [d.d0 + (d.d1 - d.d0) * e, a]); return [p(a0, e0), p(a1, e0), p(a1, e1), p(a0, e1)]; };
    put(d.axis === "x" ? (d.a0 + d.a1) / 2 : (d.d0 + d.d1) / 2, d.axis === "x" ? (d.d0 + d.d1) / 2 : (d.a0 + d.a1) / 2, () => {
      G.prism(R(d.a0, d.a1, 0.8, 1), 0, 0.5, "#3b4148", 1.2);          // back wall
      G.prism(R(d.a0, d.a1, 0.45, 0.7), 0, 0.2, "#4b5563", 1.3);       // the bench
      for (const id of ids) for (const f of K.carried.get(id)) f();
      G.prism(R(d.a0 - 0.05, d.a1 + 0.05, 0.62, 1), 0.5, 0.56, "#1d4ed8", 1.1);   // the roof over the back of the bench, team blue
    });
  }
  // the stands: aluminium tiers stepping up away from the field, a fan on each seat
  for (const s of D.stands) {
    if (s.seat) K.carried.set(s.seat, []);
    put(s.c[0], s.c[1], () => {
      G.prism(s.foot, 0, s.top, s.seat && s.seat.startsWith("of") ? "#7f8a94" : "#8a939c", 1.25);
      if (lod === "near") K.gpath([s.foot[0], s.foot[1]], "rgba(20,24,28,0.45)", 1, false, s.top + 0.001);
      if (s.seat) for (const f of K.carried.get(s.seat)) f();
    }, s.t * 0.01);
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
  // the scoreboard, up behind the outfield bleachers, facing the plate
  const bd = D.board, n = bd.n, T = 0.08;
  const fa = [bd.a[0] + n[0] * T, bd.a[1] + n[1] * T], fb = [bd.b[0] + n[0] * T, bd.b[1] + n[1] * T];
  put(bd.c[0], bd.c[1], () => {
    for (const k of [0.2, 0.8]) { const p = lerp(bd.a, bd.b, k); vline(p[0], p[1], 0, 1.3, "#4b5563", Math.max(1, G.z * 0.08)); }
    const f = G.facing ? G.facing(fa, fb, bd.c) : 1;
    // seen from behind it is steel; see-through only when it stands between the viewer and the field
    const [hu, hv] = rot(H[0], H[1], G.r), [bu, bv] = rot(bd.c[0], bd.c[1], G.r);
    const hides = (bu + bv - hu - hv) / (Math.SQRT2 * Math.hypot(bd.c[0] - H[0], bd.c[1] - H[1])) > 0.6;
    G.prism([[bd.a[0] - n[0] * T, bd.a[1] - n[1] * T], [bd.b[0] - n[0] * T, bd.b[1] - n[1] * T], fb, fa], 1.3, 2.4, f ? "#0f1a14" : "#39414a", 1.2, f || !hides ? 1 : 0.3);
    if (lod !== "near" || !f) return;
    const i0 = lerp(fa, fb, 0.06), i1 = lerp(fa, fb, 0.94);
    const A = G.Q(i0[0] + n[0] * 0.01, i0[1] + n[1] * 0.01, 2.25), B = G.Q(i1[0] + n[0] * 0.01, i1[1] + n[1] * 0.01, 2.25);
    const c = G.ctx, fs = Math.max(7, Math.round(G.z * 0.34));
    c.save(); c.font = `${fs}px "Fira Mono", monospace`; c.textBaseline = "top"; c.textAlign = "left";
    const ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
    c.translate(A[0], A[1]); c.rotate(ang);
    const rows = game ? [[game.sides?.[0] || "COMPLIANT", game.score[0]], [game.sides?.[1] || "ASSESSED", game.score[1]]] : [["HOME", "-"], ["AWAY", "-"]];
    rows.forEach(([nm, v], i) => { c.fillStyle = i ? "#f87171" : "#fbbf24"; c.fillText(nm, 0, i * fs * 1.15); c.fillText(String(v), Math.hypot(B[0] - A[0], B[1] - A[1]) - fs, i * fs * 1.15); });
    c.fillStyle = "#4ade80"; c.fillText(game ? `${game.top ? "TOP" : "BOT"} ${game.inning}` : "NO FIXTURE", 0, 2.3 * fs * 1.15);
    c.restore();
  });

  // the league's STANDINGS board beside it: the top four as the table stands this minute
  const sd = D.standings, sa = [sd.a[0] + n[0] * T, sd.a[1] + n[1] * T], sb = [sd.b[0] + n[0] * T, sd.b[1] + n[1] * T];
  put(sd.c[0], sd.c[1], () => {
    for (const k of [0.2, 0.8]) { const p = lerp(sd.a, sd.b, k); vline(p[0], p[1], 0, 1.3, "#4b5563", Math.max(1, G.z * 0.08)); }
    const f = G.facing ? G.facing(sa, sb, sd.c) : 1;
    const [hu, hv] = rot(H[0], H[1], G.r), [su, sv] = rot(sd.c[0], sd.c[1], G.r);
    const hides = (su + sv - hu - hv) / (Math.SQRT2 * Math.hypot(sd.c[0] - H[0], sd.c[1] - H[1])) > 0.6;
    G.prism([[sd.a[0] - n[0] * T, sd.a[1] - n[1] * T], [sd.b[0] - n[0] * T, sd.b[1] - n[1] * T], sb, sa], 1.3, 2.9, f ? "#0f1a14" : "#39414a", 1.2, f || !hides ? 1 : 0.3);
    if (lod !== "near" || !f) return;
    const tbl = leagueTableAt(K.mt);
    const i0 = lerp(sa, sb, 0.06), i1 = lerp(sa, sb, 0.94);
    const A = G.Q(i0[0] + n[0] * 0.01, i0[1] + n[1] * 0.01, 2.78), B = G.Q(i1[0] + n[0] * 0.01, i1[1] + n[1] * 0.01, 2.78);
    const c = G.ctx, fs = Math.max(6, Math.round(G.z * 0.27)), wpx = Math.hypot(B[0] - A[0], B[1] - A[1]);
    c.save(); c.font = `${fs}px "Fira Mono", monospace`; c.textBaseline = "top"; c.textAlign = "left";
    c.translate(A[0], A[1]); c.rotate(Math.atan2(B[1] - A[1], B[0] - A[0]));
    c.fillStyle = "#4ade80"; c.fillText(tbl ? "STANDINGS" : "STANDINGS // PENDING", 0, 0);
    (tbl || []).slice(0, 4).forEach((r, i) => {
      c.fillStyle = i ? "#d1d5db" : "#fbbf24";
      c.fillText(`${r.pos} ${r.short}`, 0, (i + 1) * fs * 1.15);
      c.textAlign = "right"; c.fillText(String(r.pts), wpx, (i + 1) * fs * 1.15); c.textAlign = "left";
    });
    c.restore();
  });

  // the ball: pitched, and now and then put in play
  if (lod === "near" && K.t > 0 && present.has("pitcher") && present.has("catcher")) {
    const cyc = Math.floor(K.t / PITCH_S), f = frac(K.t / PITCH_S);
    const plate = D.off(0, 0.35);
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


// ---- the Bowl ---------------------------------------------------------------------------------
// The stands in segments (so the painter's order holds along their length), each carrying the
// people sat on it. Built once from the anchors: which segment of which tier each seat is on.
const SEG = (() => {
  const B = BOWL, out = [];
  const byId = new Map(PARK_ANCHORS.stadium.map(a => [a.id, a]));
  for (const st of B.stands) {
    const n = st.axis === "y" ? 8 : 4, len = (st.a1 - st.a0) / n;
    for (let t = 0; t < st.tiers; t++) for (let k = 0; k < n; k++) {
      const a0 = st.a0 + k * len, a1 = a0 + len, b0 = st.b0 + (st.b1 - st.b0) * (t / st.tiers), b1 = st.b0 + (st.b1 - st.b0) * ((t + 1) / st.tiers);
      const foot = st.axis === "y" ? rectPts(a0, Math.min(b0, b1), a1, Math.max(b0, b1)) : rectPts(Math.min(b0, b1), a0, Math.max(b0, b1), a1);
      const ids = [...byId.values()].filter(a => a.id.startsWith(`st${st.side[0]}${t}`) && (st.axis === "y" ? a.x : a.y) >= a0 && (st.axis === "y" ? a.x : a.y) < a1).map(a => a.id);
      const c = foot.reduce((m, p) => [m[0] + p[0] / 4, m[1] + p[1] / 4], [0, 0]);
      // the seat edge (the tier's front, towards the field) for the painted seat line
      const edge = st.axis === "y" ? [[a0, b0], [a1, b0]] : [[b0, a0], [b0, a1]];
      out.push({ foot, top: st.tops[t], ids, c, edge, t });
    }
  }
  return out;
})();

function bowl(K) {
  const { G, lod, hour, game, ground, gline, gpath, vline, px, present, put } = K;
  const B = BOWL, L = B.lot, F = B.field, [g0, g1] = B.goal, T = B.ten;
  ground(rectPts(L.x + 0.1, L.y + 0.1, L.x + L.w - 0.1, L.y + L.h - 0.1), CONCRETE);
  ground(rectPts(B.floor.x0, B.floor.y0, B.floor.x1, B.floor.y1), SURROUND, 0.011);
  ground(rectPts(F.x0, F.y0, F.x1, F.y1), TURF, 0.012);
  if (lod !== "far") for (let k = 0; k < 20; k += 2) ground(rectPts(g0 + k * T / 2, F.y0, g0 + (k + 1) * T / 2, F.y1), TURF_HI, 0.0125);   // mown in five-yard bands
  ground(rectPts(F.x0, F.y0, g0, F.y1), ENDZONE[0], 0.013);
  ground(rectPts(g1, F.y0, F.x1, F.y1), ENDZONE[1], 0.013);
  const lw = Math.max(1, G.z * 0.04);
  if (lod !== "far") {
    for (let k = 0; k <= 10; k++) gline([g0 + k * T, F.y0], [g0 + k * T, F.y1], CHALK, k === 0 || k === 10 || k === 5 ? lw * 1.5 : lw, 0.02);   // every ten yards
    gpath(rectPts(F.x0, F.y0, F.x1, F.y1), CHALK, lw * 1.5, true, 0.02);
    if (game && !game.practice && !game.half) {   // the broadcast lines: scrimmage in blue, the first down in yellow
      const los = B.los, fd = Math.min(g1, los + (game.togo || 10) * T / 10);
      gline([los, F.y0], [los, F.y1], "rgba(59,130,246,0.85)", lw * 1.6, 0.021);
      gline([fd, F.y0], [fd, F.y1], "rgba(250,204,21,0.9)", lw * 1.6, 0.021);
    }
    if (lod === "near") {
      for (let k = 0; k < 10; k++) { const x = g0 + (k + 0.5) * T; gline([x, F.y0], [x, F.y0 + 0.12], "rgba(241,245,240,0.7)", 1, 0.02); gline([x, F.y1 - 0.12], [x, F.y1], "rgba(241,245,240,0.7)", 1, 0.02); }
      for (let k = 0; k < 50; k++) { const x = g0 + k * T / 5; for (const hy of [B.cy - 0.33, B.cy + 0.33]) gline([x, hy - 0.04], [x, hy + 0.04], "rgba(241,245,240,0.8)", 1, 0.02); }   // hash marks
      for (const [ex0, ex1] of [[F.x0, g0], [g1, F.x1]]) for (let k = 1; k < 6; k++) { const y = F.y0 + (F.y1 - F.y0) * k / 6; gline([ex0 + 0.08, y - 0.2], [ex1 - 0.08, y + 0.2], "rgba(255,255,255,0.18)", lw, 0.014); }   // end zone hatching
      gpath(circ(B.cx, B.cy, 0.42, 20), "rgba(241,245,240,0.9)", lw, true, 0.02);   // the Department's seal at midfield
      gpath(circ(B.cx, B.cy, 0.22, 3), "rgba(241,245,240,0.9)", lw, true, 0.02);
      // the numbers, both sidelines
      const c = G.ctx, fs = Math.max(7, Math.round(G.z * 0.3));
      c.save(); c.font = `${fs}px "Fira Mono", monospace`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "rgba(241,245,240,0.9)";
      for (let k = 1; k < 10; k++) for (const y of [F.y0 + 0.42, F.y1 - 0.42]) { const [nx, ny] = G.Q(g0 + k * T, y, 0.02); c.fillText(String(10 * Math.min(k, 10 - k)), Math.round(nx), Math.round(ny)); }
      c.restore();
    }
  }
  // the stands: concrete tiers stepping up away from the field, a seat line on each, fans on them
  for (const sg of SEG) {
    sg.ids.forEach(id => K.carried.set(id, []));
    put(sg.c[0], sg.c[1], () => {
      G.prism(sg.foot, 0, sg.top, sg.t % 2 ? "#6b7280" : "#7a838f", 1.25);
      if (lod !== "far") gline(sg.edge[0], sg.edge[1], sg.t === 1 ? "#1e3a8a" : "#b91c1c", Math.max(1, G.z * 0.08), sg.top + 0.002);
      for (const id of sg.ids) for (const f of K.carried.get(id)) f();
    });
  }
  if (lod === "far") return;
  // goalposts: a padded post behind the end line, the crossbar, two uprights (goal-post yellow)
  for (const [px0, py] of B.posts) {
    const back = px0 < B.cx ? -0.22 : 0.22, bx = px0 + back * 0.4, hw = B.postW, col = "#facc15";
    put(bx, py, () => {
      vline(px0 + back, py, 0, B.bar, col, Math.max(1, G.z * 0.1));
      gline([px0 + back, py], [bx, py], col, Math.max(1, G.z * 0.08), B.bar);
      gline([bx, py - hw], [bx, py + hw], col, Math.max(1, G.z * 0.08), B.bar);
      vline(bx, py - hw, B.bar, B.upright, col, Math.max(1, G.z * 0.06)); vline(bx, py + hw, B.bar, B.upright, col, Math.max(1, G.z * 0.06));
    }, back > 0 ? 0.3 : -0.3);
  }
  // pylons at the corners of each end zone
  if (lod === "near") for (const x of [F.x0, g0, g1, F.x1]) for (const y of [F.y0, F.y1]) put(x, y, () => { const [sx, sy] = G.Q(x, y, 0.1), w = Math.max(2, G.z * 0.1); G.ctx.fillStyle = "#f97316"; G.ctx.fillRect(Math.round(sx - w / 2), Math.round(sy - w), Math.round(w), Math.round(w * 1.4)); });
  // the benches, a team on each sideline
  B.benches.forEach((b, i) => {
    const ids = [0, 1, 2, 3, 4, 5].map(k => `bench${i}${k}`);
    ids.forEach(id => K.carried.set(id, []));
    const segs = 2, len = (b.x1 - b.x0) / segs;
    for (let s2 = 0; s2 < segs; s2++) {
      const x0 = b.x0 + s2 * len, x1 = x0 + len, mine = ids.slice(s2 * 3, s2 * 3 + 3);
      put((x0 + x1) / 2, b.y, () => {
        G.prism(rectPts(x0, b.y - 0.14, x1, b.y + 0.14), 0, 0.2, i ? "#7c2d12" : "#374151", 1.3);
        for (const id of mine) for (const f of K.carried.get(id)) f();
      });
    }
  });
  // the chain: ten yards of it between the rods
  if (present.has("chainA") && present.has("chainB")) gline([B.los - 0.45, F.y0 - 0.5], [B.los + 0.45, F.y0 - 0.5], "#f97316", Math.max(1, G.z * 0.03), 0.05);
  // the kicking net
  const nt = B.net;
  mesh(K, [nt.x, nt.y - 0.4], [nt.x, nt.y + 0.4], 1.2, [nt.x - 1, nt.y]);
  // light towers at the corners, lit for anything on after dark
  const lit = !!game && lightsOn(hour);
  for (const p of backMasts(G, B.lights)) put(p[0], p[1], () => tower(K, p, lit, 3.4));
  // the scoreboard over the north stand
  const bd = B.board;
  put((bd.x0 + bd.x1) / 2, bd.y, () => {
    for (const x of [bd.x0 + 0.4, bd.x1 - 0.4]) vline(x, bd.y, 0, 1.1, "#4b5563", Math.max(1, G.z * 0.08));
    // seen from behind it is a slab across the field: the back goes see-through
    const seen = !G.facing || G.facing([bd.x0, bd.y + 0.09], [bd.x1, bd.y + 0.09], [(bd.x0 + bd.x1) / 2, bd.y]);
    G.prism(rectPts(bd.x0, bd.y - 0.08, bd.x1, bd.y + 0.08), 1.1, 2.15, "#0b1210", 1.2, seen ? 1 : 0.3);
    if (lod !== "near") return;
    const S = game?.sides || SIDES_SHORT.gridiron;
    board(K, [bd.x0, bd.y + 0.09], [bd.x1, bd.y + 0.09], [(bd.x0 + bd.x1) / 2, bd.y], 2.0,
      game?.practice ? [["PRACTICE", ""], ["UNDER REVIEW", ""]] : game ? [[S[0], game.score[0]], [S[1], game.score[1]]] : [["ENFORCERS", "-"], ["ASSETS", "-"]],
      game?.practice ? "EFFORT: GRADED" : game ? (game.half ? "HALF TIME" : `Q${game.quarter} ${ordinalS(game.down)} & ${game.togo}`) : "NO FIXTURE");
  });
  // the ball: snapped, carried back, thrown, caught
  if (lod === "near" && K.t > 0 && present.has("c") && present.has("qb")) {
    const f = frac(K.t / PLAY_S), cyc = Math.floor(K.t / PLAY_S), C = present.get("c").a, QB = present.get("qb").a;
    const targets = ["wr1", "slot", "wr2", "te", "rb"].filter(id => present.has(id));
    const to = targets.length ? present.get(targets[Math.floor(h01(`play${cyc}`) * targets.length)]).a : null;
    const qbAt = [QB.x - (f > SNAP_F ? 0.25 : 0), QB.y];
    if (f < SNAP_F) ball(K, C.x + 0.2, C.y, 0.04, "#7c3f1a");
    else if (f < SNAP_F + 0.04) { const k = (f - SNAP_F) / 0.04, p = lerp([C.x, C.y], qbAt, k); ball(K, p[0], p[1], 0.2 + 0.4 * k, "#7c3f1a"); }
    else if (f < THROW_F || !to) ball(K, qbAt[0], qbAt[1], 0.7, "#7c3f1a");
    else if (f < CATCH_F) { const k = (f - THROW_F) / (CATCH_F - THROW_F), dest = [to.x + 0.35, to.y], p = lerp(qbAt, dest, k); ball(K, p[0], p[1], 0.75 + Math.sin(k * Math.PI) * 1.5, "#7c3f1a"); }
    else if (f < 0.96) ball(K, to.x + 0.35, to.y, 0.95, "#7c3f1a");
  }
}

// ---- the estate pitch ------------------------------------------------------------------------------
const TSEG = (() => {
  const P = PITCH, tr = P.terrace, n = 5, len = (tr.y1 - tr.y0) / n, dx = (tr.x1 - tr.x0) / tr.tiers, out = [];
  for (let t = 0; t < tr.tiers; t++) for (let k = 0; k < n; k++) {
    const x0 = tr.x0 + t * dx, x1 = x0 + dx, y0 = tr.y0 + k * len, y1 = y0 + len;
    const ids = PARK_ANCHORS.pitch.filter(a => a.id.startsWith(`ter${t}`) && a.y >= y0 && a.y < y1).map(a => a.id);
    out.push({ foot: rectPts(x0, y0, x1, y1), top: tr.tops[t], ids, c: [(x0 + x1) / 2, (y0 + y1) / 2], edge: [[x0, y0], [x0, y1]], t });
  }
  return out;
})();

function pitchLot(K) {
  const { G, lod, hour, game, ground, gline, gpath, vline, present, put } = K;
  const P = PITCH, L = P.lot, p = P.p, cx = P.cx, cy = P.cy;
  ground(rectPts(L.x + 0.1, L.y + 0.1, L.x + L.w - 0.1, L.y + L.h - 0.1), "#1c3a1f");
  ground(rectPts(p.x0 - 0.5, p.y0 - 0.5, p.x1 + 0.5, p.y1 + 0.5), "#276a2a", 0.011);
  ground(rectPts(p.x0, p.y0, p.x1, p.y1), "#2e7a30", 0.012);
  const lw = Math.max(1, G.z * 0.04);
  if (lod === "far") { gline([cx, p.y0], [cx, p.y1], "rgba(241,245,240,0.6)", 1, 0.02); }
  else {
    const n = 12, sw = (p.x1 - p.x0) / n;
    for (let k = 0; k < n; k += 2) ground(rectPts(p.x0 + k * sw, p.y0, p.x0 + (k + 1) * sw, p.y1), "#348a36", 0.0125);   // mown stripes
    gpath(rectPts(p.x0, p.y0, p.x1, p.y1), CHALK, lw, true, 0.02);
    gline([cx, p.y0], [cx, p.y1], CHALK, lw, 0.02);
    gpath(circ(cx, cy, P.circleR, 32), CHALK, lw, true, 0.02);
    ground(circ(cx, cy, 0.07, 8), CHALK, 0.021);
    for (const end of [-1, 1]) {
      const gx = end < 0 ? p.x0 : p.x1, dir = -end;   // dir: into the pitch
      gpath([[gx, cy - P.box.hw], [gx + dir * P.box.d, cy - P.box.hw], [gx + dir * P.box.d, cy + P.box.hw], [gx, cy + P.box.hw]], CHALK, lw, false, 0.02);
      gpath([[gx, cy - P.six.hw], [gx + dir * P.six.d, cy - P.six.hw], [gx + dir * P.six.d, cy + P.six.hw], [gx, cy + P.six.hw]], CHALK, lw, false, 0.02);
      const spot = [gx + dir * P.spot, cy];
      ground(circ(spot[0], spot[1], 0.06, 8), CHALK, 0.021);
      // the D: the part of the spot's circle outside the box
      const r = P.circleR, lim = Math.acos(Math.min(1, (P.box.d - P.spot) / r));
      gpath(Array.from({ length: 13 }, (_, k) => { const a = -lim + (2 * lim * k) / 12; return [spot[0] + dir * r * Math.cos(a), spot[1] + r * Math.sin(a)]; }), CHALK, lw, false, 0.02);
    }
    if (lod === "near") for (const [fx, fy] of P.flags) {   // corner arcs
      const sx = fx < cx ? 1 : -1, sy = fy < cy ? 1 : -1;
      gpath(Array.from({ length: 5 }, (_, k) => { const a = (k / 4) * Math.PI / 2; return [fx + sx * 0.16 * Math.cos(a), fy + sy * 0.16 * Math.sin(a)]; }), CHALK, 1, false, 0.02);
    }
  }
  // the terrace behind the east goal: three tiers, a crowd on them
  for (const sg of TSEG) {
    sg.ids.forEach(id => K.carried.set(id, []));
    put(sg.c[0], sg.c[1], () => {
      G.prism(sg.foot, 0, sg.top, sg.t % 2 ? "#6b7280" : "#7a838f", 1.25);
      if (lod !== "far") gline(sg.edge[0], sg.edge[1], "#b91c1c", Math.max(1, G.z * 0.08), sg.top + 0.002);
      for (const id of sg.ids) for (const f of K.carried.get(id)) f();
    });
  }
  if (lod === "far") return;
  // the goals: posts and bar, the net stretched back to its stanchions
  for (const end of [-1, 1]) {
    const gx = end < 0 ? p.x0 : p.x1, bx = gx + end * P.netD, hw = P.goalHW, H = P.goalH;
    put(gx + end * P.netD * 0.5, cy, () => {
      const c = G.ctx;
      const q = (pts, fill) => G.poly(pts.map(([x, y, h]) => G.Q(x, y, h)), fill);
      const net = "rgba(236,240,244,0.16)";
      q([[bx, cy - hw, 0], [bx, cy + hw, 0], [bx, cy + hw, H * 0.75], [bx, cy - hw, H * 0.75]], net);   // back
      q([[gx, cy - hw, H], [bx, cy - hw, H * 0.75], [bx, cy + hw, H * 0.75], [gx, cy + hw, H]], net);   // roof
      q([[gx, cy - hw, 0], [bx, cy - hw, 0], [bx, cy - hw, H * 0.75], [gx, cy - hw, H]], net);        // sides
      q([[gx, cy + hw, 0], [bx, cy + hw, 0], [bx, cy + hw, H * 0.75], [gx, cy + hw, H]], net);
      if (lod === "near") {
        c.strokeStyle = "rgba(236,240,244,0.28)"; c.lineWidth = 1; c.beginPath();
        for (let k = 1; k < 8; k++) { const y = cy - hw + (2 * hw * k) / 8, A = G.Q(bx, y, 0), Bq = G.Q(bx, y, H * 0.75), Cq = G.Q(gx, y, H); c.moveTo(A[0], A[1]); c.lineTo(Bq[0], Bq[1]); c.lineTo(Cq[0], Cq[1]); }
        for (let k = 1; k < 4; k++) { const h = (H * 0.75 * k) / 4, A = G.Q(bx, cy - hw, h), Bq = G.Q(bx, cy + hw, h); c.moveTo(A[0], A[1]); c.lineTo(Bq[0], Bq[1]); }
        c.stroke();
      }
      const w = Math.max(1, G.z * 0.08);
      vline(gx, cy - hw, 0, H, "#f5f5f5", w); vline(gx, cy + hw, 0, H, "#f5f5f5", w);
      gline([gx, cy - hw], [gx, cy + hw], "#f5f5f5", w, H);
      vline(bx, cy - hw, 0, H * 0.75, "#9ca3af", 1); vline(bx, cy + hw, 0, H * 0.75, "#9ca3af", 1);
    }, end < 0 ? -0.2 : 0.2);
  }
  // corner flags
  for (const [fx, fy] of P.flags) put(fx, fy, () => {
    vline(fx, fy, 0, 0.62, "#e5e7eb", Math.max(1, G.z * 0.05));
    const [ax, ay] = G.Q(fx, fy, 0.62), s2 = Math.max(3, G.z * 0.22), wv = K.t > 0 && lod === "near" ? Math.sin(K.t * 4 + fx) * s2 * 0.25 : 0;
    G.ctx.fillStyle = "#ef4444"; G.ctx.beginPath(); G.ctx.moveTo(ax, ay); G.ctx.lineTo(ax + s2, ay + s2 * 0.3 + wv); G.ctx.lineTo(ax, ay + s2 * 0.6); G.ctx.closePath(); G.ctx.fill();
  });
  // the dugouts on the north touchline: a bench under a perspex roof, the subs on it
  P.dugouts.forEach((d, i) => {
    const ids = [0, 1, 2].map(k => `dug${i}${k}`);
    ids.forEach(id => K.carried.set(id, []));
    put((d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, () => {
      G.prism(rectPts(d.x0, d.y0, d.x1, d.y0 + 0.12), 0, 0.55, "#3b4148", 1.2);   // back wall
      const by = (d.y0 + d.y1) / 2 + 0.1;
      G.prism(rectPts(d.x0 + 0.1, by - 0.12, d.x1 - 0.1, by + 0.12), 0, 0.2, "#4b5563", 1.3);
      for (const id of ids) for (const f of K.carried.get(id)) f();
      G.prism(rectPts(d.x0 - 0.05, d.y0, d.x1 + 0.05, d.y0 + 0.45), 0.55, 0.6, i ? "#1d4ed8" : "#b91c1c", 1.1, 0.85);   // the roof over the back of the bench, in the side's colour
    });
  });
  // the rail along the south touchline
  const rl = P.rail, nr = 10, rlen = (rl.x1 - rl.x0) / nr;
  for (let k = 0; k < nr; k++) {
    const x0 = rl.x0 + k * rlen, x1 = x0 + rlen;
    put((x0 + x1) / 2, rl.y, () => {
      gline([x0, rl.y], [x1, rl.y], "#9ca3af", Math.max(1, G.z * 0.06), 0.3);
      vline(x0, rl.y, 0, 0.3, "#6b7280", Math.max(1, G.z * 0.05));
      if (lod === "near") gline([x0, rl.y], [x1, rl.y], "rgba(30,64,175,0.8)", Math.max(1, G.z * 0.12), 0.18);   // the ad board, blank as required
    });
  }
  // floodlights for the evening fixture
  const lit = !!game && lightsOn(hour);
  for (const q of backMasts(G, P.lights)) put(q[0], q[1], () => tower(K, q, lit, 3.2));
  // the scoreboard behind the west goal, facing the pitch
  const bd = P.board;
  put(bd.x, (bd.y0 + bd.y1) / 2, () => {
    for (const y of [bd.y0 + 0.35, bd.y1 - 0.35]) vline(bd.x, y, 0, 0.9, "#4b5563", Math.max(1, G.z * 0.08));
    const seen = !G.facing || G.facing([bd.x + 0.09, bd.y1], [bd.x + 0.09, bd.y0], [bd.x, (bd.y0 + bd.y1) / 2]);
    G.prism(rectPts(bd.x - 0.08, bd.y0, bd.x + 0.08, bd.y1), 0.9, 1.9, "#0b1210", 1.2, seen ? 1 : 0.3);
    if (lod !== "near") return;
    const S = game?.sides || SIDES_SHORT.soccer;
    board(K, [bd.x + 0.09, bd.y1], [bd.x + 0.09, bd.y0], [bd.x, (bd.y0 + bd.y1) / 2], 1.75,
      game ? [[S[0], game.score[0]], [S[1], game.score[1]]] : [["HOME", "-"], ["AWAY", "-"]],
      game ? (game.half ? "HALF TIME" : `${Math.min(90, game.minute)}'`) : "NO FIXTURE");
  });
  // the ball: passed about, now and then a shot
  if (lod === "near" && K.t > 0) {
    const outfield = ["a-m2", "a-f1", "b-m2", "b-d1", "a-m1", "b-m1", "a-d1", "b-f1", "a-d2", "b-d2", "a-m3", "b-m3"].filter(id => present.has(id));
    if (outfield.length >= 2) {
      const PASS = 2.6, cyc = Math.floor(K.t / PASS), f = frac(K.t / PASS);
      const holder = (n) => outfield[Math.floor(h01(`pass${n}`) * outfield.length)];
      let from = holder(cyc), to = holder(cyc + 1);
      if (to === from) to = outfield[(outfield.indexOf(from) + 1) % outfield.length];
      const A0 = present.get(from).a, A1 = present.get(to).a;
      const at = (a) => [a.x + (a.team ? -0.22 : 0.22), a.y + 0.05];
      const shot = h01(`shot${cyc}`) < 0.14;
      if (f < 0.5) { const [bx, by] = at(A0); ball(K, bx, by, 0.05, "#f8fafc"); }
      else if (shot) {
        const goal = A0.team ? [p.x0 + 0.1, cy + (h01(`sh${cyc}`) - 0.5) * 1.6] : [p.x1 - 0.1, cy + (h01(`sh${cyc}`) - 0.5) * 1.6], k = (f - 0.5) / 0.5, q = lerp(at(A0), goal, k);
        ball(K, q[0], q[1], 0.08 + Math.sin(k * Math.PI) * 0.5, "#f8fafc");
      } else { const k = (f - 0.5) / 0.5, q = lerp(at(A0), at(A1), k), lofted = h01(`lob${cyc}`) < 0.3; ball(K, q[0], q[1], 0.05 + Math.sin(k * Math.PI) * (lofted ? 0.9 : 0.08), "#f8fafc"); }
    }
  }
}

// ---- shared pieces --------------------------------------------------------------------------------
const SIDES_SHORT = { gridiron: ["ENFORCERS", "ASSETS"], soccer: ["SPRAWL UTD", "RECLAMATION"] };
const ordinalS = (n) => `${n}${n === 1 ? "ST" : n === 2 ? "ND" : n === 3 ? "RD" : "TH"}`;
// The corner nearest the viewer keeps no mast: it would stand across the whole field.
const backMasts = (G, pts) => { const d = pts.map(p => { const [u, v] = rot(p[0], p[1], G.r); return u + v; }), m = Math.max(...d); return pts.filter((_, i) => d[i] < m - 1e-6); };
// A floodlight mast: the pole, the bank of lamps, a glow when lit.
function tower(K, p, lit, h) {
  const { G, lod } = K;
  K.vline(p[0], p[1], 0, h, "#6b7280", Math.max(1, G.z * 0.1));
  const [x, y] = G.Q(p[0], p[1], h + 0.1), w = G.z * 0.9, hgt = G.z * 0.45;
  G.ctx.fillStyle = "#374151"; G.ctx.fillRect(x - w / 2, y - hgt / 2, w, hgt);
  G.ctx.fillStyle = lit ? "#fff7d6" : "#1f2937"; G.ctx.fillRect(x - w / 2 + 1, y - hgt / 2 + 1, w - 2, hgt - 2);
  if (lit && lod === "near") {
    const r = G.z * 2.2, g = G.ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,247,214,0.35)"); g.addColorStop(1, "rgba(255,247,214,0)");
    G.ctx.fillStyle = g; G.ctx.beginPath(); G.ctx.arc(x, y, r, 0, Math.PI * 2); G.ctx.fill();
  }
}
// Scoreboard text on a board face from a to b (map points), when it faces the viewer.
function board(K, a, b, inside, h, rows, foot) {
  const { G } = K;
  const f = G.facing ? G.facing(a, b, inside) : 1;
  if (!f) return;
  const A = G.Q(a[0], a[1], h), B = G.Q(b[0], b[1], h);
  const c = G.ctx, fs = Math.max(7, Math.round(G.z * 0.3));
  c.save(); c.font = `${fs}px "Fira Mono", monospace`; c.textBaseline = "top"; c.textAlign = "left";
  const ang = Math.atan2(B[1] - A[1], B[0] - A[0]), wpx = Math.hypot(B[0] - A[0], B[1] - A[1]);
  c.translate(A[0], A[1]); c.rotate(ang);
  rows.forEach(([n, v], i) => { c.fillStyle = i ? "#f87171" : "#fbbf24"; c.fillText(n, fs * 0.4, i * fs * 1.15); c.fillText(String(v), wpx - fs * 1.4, i * fs * 1.15); });
  c.fillStyle = "#4ade80"; c.fillText(foot, fs * 0.4, 2.3 * fs * 1.15);
  c.restore();
}
