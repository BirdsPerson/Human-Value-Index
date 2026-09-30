// THE ASSEMBLY and LOT 0x6F07 in the iso view (CityIso.jsx), from civicGeo.js. Same rules as
// parkDraw.js: the ground first, then every standing thing back to front by u + v; far =
// shapes and colours, people as dots; mid = props, small sprites; near = the detail, the
// text on the boards and signs, everyone posed.
//
// The Assembly: a paved forum, the dais and lectern, THE CHAIR (the Overlord's obelisk, one
// green eye, bored), the banner, the debate board with the live tally, benches full of
// whoever came to watch. While the polls are open the two advocates stand at the lectern by
// projection from their files (they are also elsewhere in the city: this is a projection).
//
// The lot: scrub and a PROPOSED DEVELOPMENT sign until the vote; then APPROVED; then the
// site (hoarding, a tower crane, the site office, a digger, a crew in hard hats) while the
// work goes on; then the golf course or the farm with people using it. All of it from the
// recorded outcome (sim.lotPhase): every viewer sees the same construction.

import { rot, STOREY } from "./iso.js";
import { SPRITE_W, SPRITE_H, statureOf } from "../sprites.js";
import { sheetFor, miniFor } from "./spriteBank.js";
import { FAMILY_COLOR, familyOf } from "./cityKit.js";
import { drawPose, phaseOf } from "./poses.js";
import { assignAnchors } from "./props.js";
import { lotPhase } from "./sim.js";
import { CIVIC_LOTS, CIVIC_ANCHORS, FORUM, SIGN, VACANT, SITE, GOLF, FARM, faceOf } from "./civicGeo.js";
import { assemblyNow } from "../assembly/client.js";
import { ADVOCATES, APPLICATIONS } from "../assembly/content.js";

const who = (s) => s.slug || s.name;
const frac = (v) => ((v % 1) + 1) % 1;
const circ = (cx, cy, r, n = 16) => Array.from({ length: n }, (_, k) => [cx + r * Math.cos((k / n) * Math.PI * 2), cy + r * Math.sin((k / n) * Math.PI * 2)]);
const rectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const STONE = "#5b6068", STONE_HI = "#666b73", DIRT = "#5a4630", DIRT_D = "#46361f", SCRUB = "#3f5a26";
const ROUGH = "#2c6a2a", FAIRWAY = "#3a8a36", GREEN = "#4fae4a", SAND = "#d8c48a", WATER = "#2a5f8a";
const HAT = "#facc15", CYAN = "#22d3ee";
// The advocates as the city projects them: their files' likenesses (never tappable: nobody).
const ADV = Object.fromEntries(Object.entries(ADVOCATES).map(([k, a]) => [k, { name: a.name.replace(/\b(\w)(\w*)/g, (_, x, y) => x + y.toLowerCase()), slug: a.slug, sprite: a.sprite, score: a.score, kind: "figure" }]));

// prev: what the last frame returned ({at, face}): seats are kept while the face holds.
// -> {at, face}
export function drawCivicLot(G, lotId, lod, mt, people, prev) {
  const pid = CIVIC_LOTS[lotId], hour = ((mt % 24) + 24) % 24;
  const phase = pid === "dev-lot" ? lotPhase(mt) : null;
  const face = pid === "forum" ? "forum" : faceOf(phase);
  const items = [], carried = new Map();
  const put = (x, y, draw, bias = 0) => { const [u, v] = rot(x, y, G.r); items.push({ k: u + v + bias, draw }); };
  const ground = (pts, fill, h = 0.01) => G.poly(pts.map(p => G.Q(p[0], p[1], h)), fill);
  const vline = (x, y, h0, h1, col, w) => { const A = G.Q(x, y, h0), B = G.Q(x, y, h1); G.ctx.strokeStyle = col; G.ctx.lineWidth = w; G.ctx.beginPath(); G.ctx.moveTo(A[0], A[1]); G.ctx.lineTo(B[0], B[1]); G.ctx.stroke(); };
  const K = { G, lod, hour, put, ground, vline, carried, t: G.t, px: Math.max(1, G.z * 0.06), phase };

  const anchors = CIVIC_ANCHORS[face] || [];
  const list = people.map(o => ({ key: who(o.s), role: "patron", pri: 0, s: o.s }));
  const { at } = assignAnchors(anchors, list, prev && prev.face === face ? prev.at : null, hour, true);
  const present = new Map();
  for (const p of list) { const i = at.get(p.key); if (i != null) present.set(anchors[i].id, { p, a: anchors[i] }); }

  if (face === "forum") forum(K);
  else if (face === "site") site(K);
  else if (face === "golf") golf(K);
  else if (face === "farm") farm(K);
  else vacant(K);
  if (pid === "dev-lot") sign(K);

  for (const [id, { p, a }] of present) {
    const fn = personDraw(K, a, p, face === "site");
    if (carried.has(id)) carried.get(id).push(fn.draw);
    else put(fn.x, fn.y, fn.draw, 0.02);
  }
  items.sort((a, b) => a.k - b.k);
  for (const it of items) it.draw();
  return { at, face };
}

// A label for the lot and a line for its cutaway, from the phase.
export function civicLabel(lotId, mt) {
  if (CIVIC_LOTS[lotId] === "forum") {
    const v = assemblyNow();
    if (v?.session?.state === "open") return `THE ASSEMBLY // ${v.tally.votes.golf}-${v.tally.votes.farm}`;
    return "THE ASSEMBLY";
  }
  const p = lotPhase(mt);
  if (p.phase === "vacant") return "LOT 0x6F07 // PROPOSED DEVELOPMENT";
  const app = APPLICATIONS[p.winner];
  if (p.phase === "approved") return `LOT 0x6F07 // APPROVED: ${app.no}`;
  if (p.phase === "site") return `LOT 0x6F07 // BUILDING: ${Math.round(p.progress * 100)}%`;
  return app.built;
}
export function civicLine(lotId, mt, n) {
  if (CIVIC_LOTS[lotId] === "forum") {
    const v = assemblyNow();
    return v?.session?.state === "open" ? `${n} WATCHING // IN SESSION: GOLF ${v.tally.votes.golf}, FARM ${v.tally.votes.farm}. VOTE AT #ASSEMBLY.` : `${n} ON THE FLOOR // ADJOURNED. THE BENCHES REMAIN.`;
  }
  const p = lotPhase(mt);
  if (p.phase === "vacant") return "VACANT // TWO APPLICATIONS BEFORE THE ASSEMBLY";
  if (p.phase === "approved") return `APPROVED: ${APPLICATIONS[p.winner].proposal} // GROUNDBREAKING MACHINE DAY ${p.breakDay}`;
  if (p.phase === "site") return `${n} ON SITE // ${Math.round(p.progress * 100)}% BUILT // OPENS MACHINE DAY ${p.openDay}`;
  return `${n} ${p.winner === "golf" ? "ON THE COURSE" : "IN THE FIELDS"} // ${p.winner === "golf" ? "MEMBERSHIP BY ASSESSMENT" : "THE HARVEST IS COUNTED"}`;
}

// ---- people ----------------------------------------------------------------------------------
function personDraw(K, a, p, hat) {
  const { G, lod } = K;
  const x = a.x, y = a.y, look = a.look, act = a.act, ph = phaseOf(p.key);
  const draw = () => {
    const [sx, sy] = G.Q(x, y, a.h);
    if (sx < -40 || sx > G.w + 40 || sy < -60 || sy > G.h + 40) return;
    if (lod === "far") { G.ctx.fillStyle = hat ? HAT : FAMILY_COLOR[familyOf(p.s).family] || "#6b9a7c"; G.ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 2, 2, 2); return; }
    const hh0 = G.z * STOREY * 0.95, k = statureOf(p.s), hpx = hh0 * k;
    let box;
    if (lod === "mid" || hpx < 18) {
      const m = miniFor(p.s), sc = hpx / (SPRITE_H / 2);
      try { G.ctx.drawImage(m, Math.round(sx - (SPRITE_W / 4) * sc), Math.round(sy - hpx), Math.round((SPRITE_W / 2) * sc), Math.round(hpx)); } catch { /* not decoded yet */ }
      box = [sx - hpx * 0.3, sy - hpx, sx + hpx * 0.3, sy];
    } else {
      let face = 0;
      if (look) { const [lx] = G.Q(look[0], look[1], a.h); face = lx > sx + 0.5 ? 1 : -1; }
      box = drawPose(G.ctx, sheetFor(p.s), { kind: a.kind, act, face, walk: null }, act, sx, sy, hh0, G.t, ph, k);
    }
    if (hat) hardHat(G.ctx, box);
    if (!p.s.crowd) G.hits.push({ kind: "p", s: p.s, box });
  };
  return { x, y, draw };
}
function hardHat(c, box) {
  const w = box[2] - box[0], h = box[3] - box[1];
  const hw = w * 0.62, hx = (box[0] + box[2]) / 2 - hw / 2, hy = box[1] + h * 0.005;
  c.fillStyle = HAT; c.fillRect(Math.round(hx), Math.round(hy), Math.max(2, Math.round(hw)), Math.max(1, Math.round(h * 0.075)));
  c.fillStyle = "#ca8a04"; c.fillRect(Math.round(hx - hw * 0.12), Math.round(hy + h * 0.065), Math.max(2, Math.round(hw * 1.24)), Math.max(1, Math.round(h * 0.02)));
}
// An advocate at the lectern, by projection: a disc of light, the likeness a little
// translucent and flickering, scan lines through it. Speaking in turn.
function projected(K, side, x, y) {
  const { G, lod } = K;
  K.put(x, y, () => {
    const [sx, sy] = G.Q(x, y, FORUM.dais.h);
    const c = G.ctx, r = Math.max(2, G.z * 0.32);
    c.fillStyle = "rgba(34,211,238,0.35)"; c.beginPath(); c.ellipse(sx, sy, r, r * 0.5, 0, 0, Math.PI * 2); c.fill();
    if (lod === "far") { c.fillStyle = CYAN; c.fillRect(Math.round(sx) - 1, Math.round(sy) - 3, 2, 3); return; }
    const hh0 = G.z * STOREY * 0.95;
    const speaking = Math.floor((K.t || 0) / 7) % 2 === (side === "golf" ? 0 : 1);
    const flick = K.t > 0 && frac(K.t * 0.37 + (side === "golf" ? 0 : 0.5)) < 0.04;
    c.globalAlpha = flick ? 0.35 : 0.78;
    let box;
    if (lod === "mid" || hh0 < 18) {
      const m = miniFor(ADV[side]), sc = hh0 / (SPRITE_H / 2);
      try { c.drawImage(m, Math.round(sx - (SPRITE_W / 4) * sc), Math.round(sy - hh0), Math.round((SPRITE_W / 2) * sc), Math.round(hh0)); } catch { /* not decoded yet */ }
      box = [sx - hh0 * 0.3, sy - hh0, sx + hh0 * 0.3, sy];
    } else {
      box = drawPose(c, sheetFor(ADV[side]), { kind: "stand", act: speaking ? "speak" : "view", face: side === "golf" ? 1 : -1, walk: null }, speaking ? "speak" : "view", sx, sy, hh0, K.t, side === "golf" ? 0.1 : 0.6, 1);
    }
    c.globalAlpha = 1;
    if (lod === "near") {
      c.fillStyle = "rgba(34,211,238,0.16)";
      for (let yy = box[1]; yy < box[3]; yy += Math.max(2, G.z * 0.12)) c.fillRect(Math.round(box[0]), Math.round(yy), Math.round(box[2] - box[0]), 1);
      if (speaking && K.t > 0) { c.fillStyle = CYAN; const d = Math.max(1, G.z * 0.06); for (let k = 0; k < 3; k++) if (frac(K.t * 1.5 + k / 3) < 0.6) c.fillRect(Math.round(box[2] + d * (1 + k * 2)), Math.round(box[1] + d * 2), Math.round(d), Math.round(d)); }
    }
  }, 0.03);
}

// Text across a board or sign from a to b (map points) at height h: legible from either side.
function boardText(K, a, b, h, rows, colors, h0 = null) {
  const { G } = K;
  let A = G.Q(a[0], a[1], h), B = G.Q(b[0], b[1], h);
  const tall = h0 == null ? Infinity : Math.abs(G.Q(a[0], a[1], h0)[1] - A[1]);
  if (B[0] < A[0]) [A, B] = [B, A];
  const c = G.ctx, wpx = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const fs = Math.min(Math.max(6, Math.round(G.z * 0.26)), Math.floor((wpx - 4) / Math.max(...rows.map(r => r.length)) / 0.62), Math.floor((tall - 3) / (rows.length * 1.2)));
  if (fs < 6) return;
  c.save(); c.font = `${fs}px "Fira Mono", monospace`; c.textBaseline = "top"; c.textAlign = "left";
  c.translate(A[0], A[1]); c.rotate(Math.atan2(B[1] - A[1], B[0] - A[0]));
  rows.forEach((t, i) => { c.fillStyle = colors[i] || colors[colors.length - 1]; c.fillText(t, fs * 0.35, 2 + i * fs * 1.15); });
  c.restore();
}
// A flat upright panel from a to b between h0 and h1 (both faces), with text on it.
function panel(K, a, b, h0, h1, fill, rows = null, colors = ["#f5f5f5"]) {
  const { G, lod } = K;
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  K.put(m[0], m[1], () => {
    for (const p of [a, b]) K.vline(p[0], p[1], 0, h1, "#4b5563", Math.max(1, G.z * 0.07));
    G.poly([G.Q(a[0], a[1], h0), G.Q(b[0], b[1], h0), G.Q(b[0], b[1], h1), G.Q(a[0], a[1], h1)], fill);
    if (rows && lod === "near") boardText(K, a, b, h1 - 0.04, rows, colors, h0);
  }, 0.01);
}

// ---- THE ASSEMBLY ---------------------------------------------------------------------------
function forum(K) {
  const { G, lod, ground, put, vline, hour } = K;
  const L = FORUM.lot, D = FORUM.dais;
  ground(rectPts(L.x + 0.1, L.y + 0.1, L.x + L.w - 0.1, L.y + L.h - 0.1), STONE);
  if (lod !== "far") for (let i = 1; i < 8; i++) { const x = L.x + (L.w * i) / 8; ground(rectPts(x - 0.02, L.y + 0.1, x + 0.02, L.y + L.h - 0.1), STONE_HI, 0.011); }
  ground(rectPts(L.x + 0.1 + (L.w - 0.2) / 2 - 0.35, D.y1, L.x + (L.w) / 2 + 0.35, L.y + L.h - 0.1), "#7a2020", 0.012);   // the aisle's red carpet
  // the dais, the chair, the lectern, the banner
  put((D.x0 + D.x1) / 2, D.y0, () => G.prism(rectPts(D.x0, D.y0, D.x1, D.y1), 0, D.h, "#4a4036", 1.3), -1.2);
  const [cx, cy] = FORUM.chair;
  put(cx, cy, () => {
    G.prism(rectPts(cx - 0.22, cy - 0.18, cx + 0.22, cy + 0.18), 0, 1.9, "#101412", 1.4);
    const [ex, ey] = G.Q(cx, cy + 0.18, 1.55), r = Math.max(1.5, G.z * 0.1);
    const sweep = K.t > 0 ? Math.sin(K.t * 0.3) * r * 0.8 : 0;   // bored: it looks round slowly
    G.ctx.fillStyle = "#14532d"; G.ctx.fillRect(ex - r * 2, ey - r * 0.6, r * 4, r * 1.2);
    G.ctx.fillStyle = "#4ade80"; G.ctx.beginPath(); G.ctx.arc(ex + sweep, ey, r * 0.55, 0, Math.PI * 2); G.ctx.fill();
  }, -0.9);
  const [lx, ly] = FORUM.lectern;
  put(lx, ly, () => {
    G.prism(rectPts(lx - 0.2, ly - 0.14, lx + 0.2, ly + 0.14), D.h, D.h + 0.62, "#6b4a2a", 1.3);
    G.prism(rectPts(lx - 0.26, ly - 0.2, lx + 0.26, ly + 0.2), D.h + 0.62, D.h + 0.68, "#8a6a42", 1.3);
    if (lod === "near") { const [sx, sy] = G.Q(lx, ly + 0.14, D.h + 0.4); G.ctx.fillStyle = "#4ade80"; G.ctx.fillRect(Math.round(sx - G.z * 0.06), Math.round(sy - G.z * 0.06), Math.max(1, Math.round(G.z * 0.12)), Math.max(1, Math.round(G.z * 0.12))); }
  }, 0.05);
  const [ba, bb] = FORUM.banner;
  panel(K, ba, bb, 1.35, 1.8, "#14261a", ["THE ASSEMBLY // SESSION 001 // NON-BINDING"], ["#4ade80"]);
  // the board: the running tally while the polls are open, the result after
  const v = assemblyNow(), open = v?.session?.state === "open";
  const g = v?.tally?.votes?.golf ?? 0, f = v?.tally?.votes?.farm ?? 0;
  const rows = v?.result ? ["THE RESULT", `001 GOLF ${String(v.result.votes.golf).padStart(4)}`, `002 FARM ${String(v.result.votes.farm).padStart(4)}`, `APPROVED: ${APPLICATIONS[v.result.winner].no}`]
    : ["DEBATE BOARD", `001 GOLF ${String(g).padStart(4)}`, `002 FARM ${String(f).padStart(4)}`, open ? "VOTE: #ASSEMBLY" : "…"];
  panel(K, FORUM.board.a, FORUM.board.b, 0.55, 1.45, "#0b120c", rows, ["#86c9a0", "#fbbf24", "#4ade80", "#86c9a0"]);
  // the advocates, by projection, while the polls are open
  if (open) for (const side of ["golf", "farm"]) projected(K, side, ...FORUM.podium[side]);
  // benches carry their sitters
  for (const b of FORUM.benches) {
    const ids = CIVIC_ANCHORS.forum.filter(a => a.seat === b).map(a => a.id);
    ids.forEach(id => K.carried.set(id, []));
    put((b.x0 + b.x1) / 2, b.y, () => {
      G.prism(rectPts(b.x0, b.y + 0.12, b.x1, b.y + 0.2), 0, 0.42, "#5a3a22", 1.2);   // back rest, on the far side from the dais
      G.prism(rectPts(b.x0, b.y - 0.14, b.x1, b.y + 0.12), 0.16, 0.21, "#7a5232", 1.3);
      for (const id of ids) for (const fn of K.carried.get(id)) fn();
    }, -0.05);
  }
  const dark = hour >= 19 || hour < 6.5;
  for (const [x, y] of FORUM.lamps) put(x, y, () => {
    vline(x, y, 0, 1.5, "#374151", Math.max(1, G.z * 0.07));
    const [sx, sy] = G.Q(x, y, 1.55);
    G.ctx.fillStyle = dark ? "#fde68a" : "#4b5563"; G.ctx.fillRect(sx - G.z * 0.14, sy - G.z * 0.12, G.z * 0.28, G.z * 0.2);
  });
}

// ---- the lot, vacant ----------------------------------------------------------------------------
function vacant(K) {
  const { G, lod, ground } = K, L = VACANT.lot;
  ground(rectPts(L.x + 0.1, L.y + 0.1, L.x + L.w - 0.1, L.y + L.h - 0.1), DIRT);
  for (const [x, y] of VACANT.tufts) ground(circ(x, y, 0.35 + ((x * 7) % 1) * 0.4, 8), SCRUB, 0.011);
  if (lod === "far") return;
  for (const [x, y] of VACANT.rubble) K.put(x, y, () => G.prism(rectPts(x - 0.12, y - 0.09, x + 0.12, y + 0.09), 0, 0.1, "#7b7468", 1.2));
  // a low chain on posts along the front, sagging, ignored
  for (let k = 0; k <= 10; k++) { const x = L.x + 0.3 + k * ((L.w - 0.6) / 10); K.put(x, L.y + L.h - 0.2, () => K.vline(x, L.y + L.h - 0.2, 0, 0.35, "#6b7280", Math.max(1, G.z * 0.05))); }
}
function sign(K) {
  const p = K.phase;
  const rows = p.phase === "vacant" ? ["PROPOSED DEVELOPMENT", "APPLICATIONS 001 + 002", "THE ASSEMBLY DECIDES"]
    : p.phase === "approved" ? [`APPROVED: APPLICATION ${APPLICATIONS[p.winner].no}`, APPLICATIONS[p.winner].proposal, `GROUNDBREAKING DAY ${p.breakDay}`]
      : p.phase === "site" ? [`${APPLICATIONS[p.winner].proposal}`, `WORKS IN PROGRESS ${Math.round(p.progress * 100)}%`, `OPENS MACHINE DAY ${p.openDay}`]
        : [APPLICATIONS[p.winner].built, p.winner === "golf" ? "MEMBERS ASSESSED" : "YIELD MONITORED", "BY ORDER OF THE ASSEMBLY"];
  panel(K, SIGN.a, SIGN.b, SIGN.h0, SIGN.h1, p.phase === "built" ? "#14261a" : "#e5e1d3", rows, p.phase === "built" ? ["#4ade80", "#86c9a0"] : ["#7f1d1d", "#1f2937"]);
}

// ---- the site ----------------------------------------------------------------------------------
function site(K) {
  const { G, lod, ground, put, vline, phase } = K, L = SITE.lot, P = SITE.pit, pr = phase.progress || 0;
  ground(rectPts(L.x + 0.1, L.y + 0.1, L.x + L.w - 0.1, L.y + L.h - 0.1), DIRT);
  ground(rectPts(P.x0, P.y0, P.x1, P.y1), DIRT_D, 0.012);
  // what is going in, growing with the work: greens and sand, or furrows
  if (phase.winner === "golf") {
    const n = Math.floor(pr * 18);
    GOLF.holes.slice(0, n).forEach(h => ground(circ(h.green[0], h.green[1], 0.32, 10), pr > 0.6 ? GREEN : "#6b7d3a", 0.014));
    if (pr > 0.4) GOLF.bunkers.forEach(([x, y, r]) => ground(circ(x, y, r, 12), SAND, 0.013));
  } else {
    const n = Math.floor(pr * 4 + 0.5);
    FARM.beds.slice(0, n).forEach(b => { for (let y = b.y0 + 0.1; y < b.y1; y += 0.28) ground(rectPts(b.x0, y, b.x1, y + 0.1), pr > 0.6 ? "#3f6a22" : "#6a5234", 0.014); });
  }
  if (lod === "far") return;
  // the hoarding round the site, a gap at the gate
  const H = 0.55, segs = [];
  const edge = (a, b) => { const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.2)); for (let k = 0; k < n; k++) segs.push([[a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], [a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n]]); };
  const x0 = L.x + 0.15, y0 = L.y + 0.15, x1 = L.x + L.w - 0.15, y1 = L.y + L.h - 0.15, gx = SITE.gate[0];
  edge([x0, y0], [x1, y0]); edge([x1, y0], [x1, y1]); edge([x0, y1], [gx - 0.6, y1]); edge([gx + 0.6, y1], [x1, y1]); edge([x0, y0], [x0, y1]);
  segs.forEach(([a, b], i) => put((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, () => {
    G.poly([G.Q(a[0], a[1], 0), G.Q(b[0], b[1], 0), G.Q(b[0], b[1], H), G.Q(a[0], a[1], H)], i % 2 ? "#b08a58" : "#a07c4c");
    if (lod === "near" && i % 3 === 1) { const [sx, sy] = G.Q((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, H * 0.6); G.ctx.fillStyle = "#1f2937"; G.ctx.font = `${Math.max(6, Math.round(G.z * 0.16))}px "Fira Mono", monospace`; G.ctx.textAlign = "center"; G.ctx.fillText("HARD HAT AREA", sx, sy); }
  }, 0.1));
  // the site office, the piles, the digger
  const C = SITE.cabin;
  put((C.x0 + C.x1) / 2, (C.y0 + C.y1) / 2, () => { G.prism(rectPts(C.x0, C.y0, C.x1, C.y1), 0, C.h, "#d4a017", 1.3); if (lod === "near") { const [sx, sy] = G.Q((C.x0 + C.x1) / 2, C.y1, C.h * 0.7); G.ctx.fillStyle = "#1f2937"; G.ctx.font = `${Math.max(6, Math.round(G.z * 0.15))}px "Fira Mono", monospace`; G.ctx.textAlign = "center"; G.ctx.fillText("SITE OFFICE", sx, sy); } });
  for (const [x, y, kind] of SITE.piles) put(x, y, () => {
    if (kind === "pipes") for (let k = 0; k < 3; k++) G.prism(rectPts(x - 0.6, y - 0.3 + k * 0.2, x + 0.6, y - 0.14 + k * 0.2), 0, 0.16, "#9ca3af", 1.25);
    else { G.prism(rectPts(x - 0.4, y - 0.3, x + 0.4, y + 0.3), 0, 0.12, "#8a6a42", 1.2); G.prism(rectPts(x - 0.34, y - 0.24, x + 0.34, y + 0.24), 0.12, 0.42, "#b91c1c", 1.2); }
  });
  const Dg = SITE.digger, swing = K.t > 0 ? Math.sin(K.t * 0.5) * 0.4 : 0;
  put(Dg.x, Dg.y, () => {
    G.prism(rectPts(Dg.x - 0.55, Dg.y - 0.35, Dg.x + 0.55, Dg.y + 0.35), 0, 0.18, "#1f2937", 1.2);   // tracks
    G.prism(rectPts(Dg.x - 0.4, Dg.y - 0.3, Dg.x + 0.3, Dg.y + 0.3), 0.18, 0.62, "#eab308", 1.3);
    const a = G.Q(Dg.x - 0.4, Dg.y, 0.55), m = G.Q(Dg.x - 1.2, Dg.y - 0.3 + swing, 1.1), e = G.Q(Dg.x - 1.7, Dg.y - 0.5 + swing, 0.25);
    G.ctx.strokeStyle = "#ca8a04"; G.ctx.lineWidth = Math.max(1.5, G.z * 0.12); G.ctx.beginPath(); G.ctx.moveTo(a[0], a[1]); G.ctx.lineTo(m[0], m[1]); G.ctx.lineTo(e[0], e[1]); G.ctx.stroke();
  });
  // the tower crane, turning slowly, a load on the hook
  const Cr = SITE.crane;
  put(Cr.x, Cr.y, () => {
    const w = 0.16;
    G.prism(rectPts(Cr.x - w, Cr.y - w, Cr.x + w, Cr.y + w), 0, Cr.mast, "#eab308", 1.2);
    if (lod === "near") for (let h = 0.3; h < Cr.mast; h += 0.35) { const a = G.Q(Cr.x - w, Cr.y + w, h), b = G.Q(Cr.x + w, Cr.y + w, h + 0.35); G.ctx.strokeStyle = "#854d0e"; G.ctx.lineWidth = 1; G.ctx.beginPath(); G.ctx.moveTo(a[0], a[1]); G.ctx.lineTo(b[0], b[1]); G.ctx.stroke(); }
    const th = 2.4 + (K.t > 0 ? Math.sin(K.t * 0.05) * 0.9 : 0), dx = Math.cos(th), dy = Math.sin(th);
    const tip = [Cr.x + dx * Cr.jib, Cr.y + dy * Cr.jib], back = [Cr.x - dx * Cr.counter, Cr.y - dy * Cr.counter];
    const A = G.Q(back[0], back[1], Cr.mast), B = G.Q(tip[0], tip[1], Cr.mast);
    G.ctx.strokeStyle = "#eab308"; G.ctx.lineWidth = Math.max(1.5, G.z * 0.1); G.ctx.beginPath(); G.ctx.moveTo(A[0], A[1]); G.ctx.lineTo(B[0], B[1]); G.ctx.stroke();
    G.prism(rectPts(back[0] - 0.2, back[1] - 0.2, back[0] + 0.2, back[1] + 0.2), Cr.mast - 0.35, Cr.mast, "#6b7280", 1.2);
    const d = 0.45 + 0.4 * (K.t > 0 ? (Math.sin(K.t * 0.11) + 1) / 2 : 0.5), hk = [Cr.x + dx * Cr.jib * d, Cr.y + dy * Cr.jib * d];
    const hh = 1.2 + (K.t > 0 ? Math.sin(K.t * 0.17) * 0.5 : 0);
    vline(hk[0], hk[1], hh, Cr.mast, "#9ca3af", 1);
    G.prism(rectPts(hk[0] - 0.25, hk[1] - 0.12, hk[0] + 0.25, hk[1] + 0.12), hh - 0.25, hh, "#9ca3af", 1.2);   // a bundle of beams
  }, 0.5);
}

// ---- the golf course ------------------------------------------------------------------------------
function golf(K) {
  const { G, lod, ground, put, vline } = K, L = GOLF.lot;
  ground(rectPts(L.x + 0.1, L.y + 0.1, L.x + L.w - 0.1, L.y + L.h - 0.1), ROUGH);
  for (const h of GOLF.holes) {
    const a = h.tee, b = h.green, d = [b[0] - a[0], b[1] - a[1]], n = Math.hypot(...d) || 1, q = [-d[1] / n * 0.3, d[0] / n * 0.3];
    ground([[a[0] + q[0], a[1] + q[1]], [b[0] + q[0], b[1] + q[1]], [b[0] - q[0], b[1] - q[1]], [a[0] - q[0], a[1] - q[1]]], FAIRWAY, 0.011);
    ground(circ(b[0], b[1], 0.34, 12), GREEN, 0.013);
    ground(rectPts(a[0] - 0.18, a[1] - 0.14, a[0] + 0.18, a[1] + 0.14), "#5cc254", 0.013);
  }
  GOLF.bunkers.forEach(([x, y, r]) => ground(circ(x, y, r, 14), SAND, 0.014));
  const [px, py, pr] = GOLF.pond;
  ground(circ(px, py, pr, 18), WATER, 0.014);
  if (lod === "far") return;
  // flags: a pin on every green, the hole's number on it up close
  for (const h of GOLF.holes) put(h.green[0], h.green[1], () => {
    const [x, y] = h.green;
    vline(x, y, 0, 0.7, "#e5e7eb", Math.max(1, G.z * 0.04));
    const A = G.Q(x, y, 0.7), B = G.Q(x, y, 0.55), C = G.Q(x + 0.28, y, 0.62);
    G.ctx.fillStyle = h.n % 2 ? "#dc2626" : "#facc15"; G.ctx.beginPath(); G.ctx.moveTo(A[0], A[1]); G.ctx.lineTo(C[0], C[1]); G.ctx.lineTo(B[0], B[1]); G.ctx.closePath(); G.ctx.fill();
    if (lod === "near") { G.ctx.fillStyle = "#f5f5f5"; G.ctx.font = `${Math.max(6, Math.round(G.z * 0.16))}px "Fira Mono", monospace`; G.ctx.textAlign = "center"; G.ctx.fillText(String(h.n), A[0], A[1] - 2); }
  });
  const C = GOLF.clubhouse;
  put((C.x0 + C.x1) / 2, (C.y0 + C.y1) / 2, () => {
    G.prism(rectPts(C.x0, C.y0, C.x1, C.y1), 0, C.h, "#e7e5df", 1.2);
    G.prism(rectPts(C.x0 - 0.08, C.y0 - 0.08, C.x1 + 0.08, C.y1 + 0.08), C.h, C.h + 0.12, "#166534", 1.3);
    if (lod === "near") { const [sx, sy] = G.Q((C.x0 + C.x1) / 2, C.y1, C.h * 0.55); G.ctx.fillStyle = "#14532d"; G.ctx.font = `${Math.max(6, Math.round(G.z * 0.14))}px "Fira Mono", monospace`; G.ctx.textAlign = "center"; G.ctx.fillText("CLUBHOUSE", sx, sy); }
  });
  for (const [x, y] of GOLF.carts) put(x, y, () => { G.prism(rectPts(x - 0.3, y - 0.18, x + 0.3, y + 0.18), 0.08, 0.3, "#f5f5f4", 1.2); G.prism(rectPts(x - 0.3, y - 0.18, x + 0.05, y + 0.18), 0.55, 0.6, "#166534", 1.3); });
}

// ---- the farm ----------------------------------------------------------------------------------------
const CROP = { lettuce: ["#4d7c0f", "#84cc16"], wheat: ["#a16207", "#eab308"], tomato: ["#3f6212", "#dc2626"], corn: ["#365314", "#65a30d"] };
function farm(K) {
  const { G, lod, ground, put, vline } = K, L = FARM.lot;
  ground(rectPts(L.x + 0.1, L.y + 0.1, L.x + L.w - 0.1, L.y + L.h - 0.1), "#6a5234");
  for (const b of FARM.beds) {
    ground(rectPts(b.x0, b.y0, b.x1, b.y1), "#5a4228", 0.011);
    const [leaf, fruit] = CROP[b.crop];
    for (let y = b.y0 + 0.12; y < b.y1 - 0.05; y += 0.3) ground(rectPts(b.x0 + 0.1, y, b.x1 - 0.1, y + 0.14), b.crop === "wheat" ? fruit : leaf, 0.013);
    if (lod === "near" && (b.crop === "tomato" || b.crop === "lettuce")) for (let k = 0; k < 24; k++) { const x = b.x0 + 0.3 + ((k * 0.618) % 1) * (b.x1 - b.x0 - 0.6), y = b.y0 + 0.15 + ((k * 0.382) % 1) * (b.y1 - b.y0 - 0.3); ground(circ(x, y, 0.06, 6), fruit, 0.015); }
    if (b.crop === "corn" && lod !== "far") for (let x = b.x0 + 0.3; x < b.x1 - 0.2; x += 0.55) for (let y = b.y0 + 0.2; y < b.y1; y += 0.3) put(x, y, () => vline(x, y, 0, 0.55, "#4d7c0f", Math.max(1, G.z * 0.06)));
  }
  if (lod === "far") return;
  // the barn: red walls, a gable roof, the white X on the door
  const Bn = FARM.barn;
  put((Bn.x0 + Bn.x1) / 2, (Bn.y0 + Bn.y1) / 2, () => {
    G.prism(rectPts(Bn.x0, Bn.y0, Bn.x1, Bn.y1), 0, Bn.h, "#9b1c1c", 1.2);
    const my = (Bn.y0 + Bn.y1) / 2, top = Bn.h + Bn.ridge;
    G.poly([G.Q(Bn.x0, Bn.y1, Bn.h), G.Q(Bn.x1, Bn.y1, Bn.h), G.Q(Bn.x1, my, top), G.Q(Bn.x0, my, top)], "#3f3f46");
    G.poly([G.Q(Bn.x0, Bn.y0, Bn.h), G.Q(Bn.x1, Bn.y0, Bn.h), G.Q(Bn.x1, my, top), G.Q(Bn.x0, my, top)], "#52525b");
    for (const ex of [Bn.x0, Bn.x1]) G.poly([G.Q(ex, Bn.y0, Bn.h), G.Q(ex, Bn.y1, Bn.h), G.Q(ex, my, top)], "#7f1d1d");
    if (lod === "near") { const a = G.Q(Bn.x0 + 0.7, Bn.y1, 0.05), b = G.Q(Bn.x0 + 1.4, Bn.y1, 0.7), c = G.Q(Bn.x0 + 0.7, Bn.y1, 0.7), d = G.Q(Bn.x0 + 1.4, Bn.y1, 0.05); G.ctx.strokeStyle = "#f5f5f5"; G.ctx.lineWidth = Math.max(1, G.z * 0.05); G.ctx.beginPath(); G.ctx.moveTo(a[0], a[1]); G.ctx.lineTo(b[0], b[1]); G.ctx.moveTo(c[0], c[1]); G.ctx.lineTo(d[0], d[1]); G.ctx.stroke(); }
  });
  const S = FARM.silo;
  put(S.x, S.y, () => {
    const pts = circ(S.x, S.y, S.r, 10);
    G.prism(pts, 0, S.h, "#9ca3af", 1.25);
    G.prism(circ(S.x, S.y, S.r * 0.7, 10), S.h, S.h + 0.25, "#6b7280", 1.35);
  });
  const St = FARM.stand;
  put((St.x0 + St.x1) / 2, (St.y0 + St.y1) / 2, () => {
    G.prism(rectPts(St.x0, St.y0, St.x1, St.y1), 0, 0.42, "#8a6a42", 1.2);
    for (let k = 0; k < 4; k++) { const x = St.x0 + 0.25 + k * 0.4; G.prism(rectPts(x - 0.14, St.y0 + 0.1, x + 0.14, St.y1 - 0.1), 0.42, 0.52, ["#dc2626", "#84cc16", "#eab308", "#f97316"][k], 1.3); }
    G.poly([G.Q(St.x0 - 0.1, St.y0 - 0.1, 1.05), G.Q(St.x1 + 0.1, St.y0 - 0.1, 1.05), G.Q(St.x1 + 0.1, St.y1 + 0.2, 0.85), G.Q(St.x0 - 0.1, St.y1 + 0.2, 0.85)], "#15803d");
    for (const [x, y] of [[St.x0, St.y1], [St.x1, St.y1]]) K.vline(x, y, 0, 0.9, "#4b3621", Math.max(1, G.z * 0.05));
  });
  const [sx0, sy0] = FARM.scarecrow;
  put(sx0, sy0, () => {
    vline(sx0, sy0, 0, 1.0, "#6b4a2a", Math.max(1, G.z * 0.07));
    const a = G.Q(sx0 - 0.35, sy0, 0.75), b = G.Q(sx0 + 0.35, sy0, 0.75);
    G.ctx.strokeStyle = "#6b4a2a"; G.ctx.lineWidth = Math.max(1, G.z * 0.06); G.ctx.beginPath(); G.ctx.moveTo(a[0], a[1]); G.ctx.lineTo(b[0], b[1]); G.ctx.stroke();
    const h = G.Q(sx0, sy0, 1.08), r = Math.max(1.5, G.z * 0.12);
    G.ctx.fillStyle = "#eab308"; G.ctx.beginPath(); G.ctx.arc(h[0], h[1], r, 0, Math.PI * 2); G.ctx.fill();
    G.ctx.fillStyle = "#1f2937"; G.ctx.fillRect(h[0] - r * 1.4, h[1] - r * 1.1, r * 2.8, r * 0.5);
  });
  const [tx, ty] = FARM.tractor;
  put(tx, ty, () => {
    G.prism(rectPts(tx - 0.45, ty - 0.25, tx + 0.35, ty + 0.25), 0.15, 0.5, "#15803d", 1.25);
    G.prism(rectPts(tx - 0.45, ty - 0.2, tx - 0.05, ty + 0.2), 0.5, 0.85, "#166534", 1.3);
    for (const [wx, r] of [[tx - 0.35, 0.28], [tx + 0.25, 0.18]]) { const [x, y] = G.Q(wx, ty + 0.26, r); G.ctx.fillStyle = "#111827"; G.ctx.beginPath(); G.ctx.arc(x, y, G.z * r * 0.7, 0, Math.PI * 2); G.ctx.fill(); }
  });
  for (const [x, y] of FARM.trees) put(x, y, () => {
    vline(x, y, 0, 0.7, "#4a3018", Math.max(1, G.z * 0.12));
    const [cx, cy] = G.Q(x, y, 1.05), r = G.z * 0.5;
    G.ctx.fillStyle = "#15803d"; G.ctx.beginPath(); G.ctx.ellipse(cx, cy, r, r * 0.8, 0, 0, Math.PI * 2); G.ctx.fill();
    G.ctx.fillStyle = "#dc2626"; for (let k = 0; k < 4; k++) G.ctx.fillRect(cx - r * 0.5 + k * r * 0.3, cy - r * 0.2 + (k % 2) * r * 0.3, Math.max(1, G.z * 0.07), Math.max(1, G.z * 0.07));   // apples
  });
}
