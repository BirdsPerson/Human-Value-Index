// THE COAST and THE HEIGHTS in the iso view (CityIso.jsx), from coastGeo.js. Same rules as
// parkDraw.js and civicDraw.js: the ground first, then every standing thing back to front by
// u + v; far = shapes and colours, people as dots; mid = props, small sprites; near = the
// detail, the text on the signs, everyone at their business.
//
// The sea rolls in (the foam walks up the sand and back), the boardwalk's wheel turns, the
// lift's chairs climb, skiers come down the pistes, surfers ride in. Day and night: the snow
// goes blue, the boardwalk's bulbs and the lodge's windows come on.

import { rot, STOREY } from "./iso.js";
import { SPRITE_W, SPRITE_H, statureOf } from "../sprites.js";
import { sheetFor, miniFor } from "./spriteBank.js";
import { FAMILY_COLOR, familyOf } from "./cityKit.js";
import { drawPose, phaseOf } from "./poses.js";
import { assignAnchors, roleOf } from "./props.js";
import { SPURS, PLACES, resortPhase } from "./sim.js";
import { APPLICATIONS2 } from "../assembly/content002.js";
import {
  COAST_LOTS, COAST_ANCHORS, SEA, SEA_Y, TERRAIN, terrainH, BEACH, BOARDWALK, PIER, BREAK, LIFT, PISTES, SLOPE_HUTS, PINES, FOOTHILLS,
  liftChair, liftChairs, pathAt, offPiste, SHORE, SUMMIT, SHELTER,
  PARCEL_ANCHORS, PARCEL_SITE, parcelFace, BEACH_RESORT, TOWERS, LIFTS2, RUNS2, SKI_LODGE, CANNONS, PRESERVE,
} from "./coastGeo.js";

const who = (s) => s.slug || s.name;
const frac = (v) => ((v % 1) + 1) % 1;
const circ = (cx, cy, r, n = 12) => Array.from({ length: n }, (_, k) => [cx + r * Math.cos((k / n) * Math.PI * 2), cy + r * Math.sin((k / n) * Math.PI * 2)]);
const rectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16), c = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
};
const nightAt = (hour) => hour >= 19 || hour < 6.5;
const SAND = "#d6c08c", SAND_WET = "#b9a574", SEA_C = "#1f5f86", SEA_DEEP = "#174a6c", FOAM = "#e8f4f8";
const SNOW = "#e4ecf2", PISTE = "#f5f9fc", ROCK = "#6b7078", PLANK = "#8a6440";
export const POD_COL = { shore: "#14b8a6", alpine: "#dc2626" };

// ---- the ground: the sea (and its foam) and the spurs' rails -------------------------------------------
// Drawn in CityIso's ground pass, under everything.
export function drawCoastGround(G, lod, t, night) {
  const { ctx, Q } = G, nf = night ? 0.55 : 1;
  const S = SEA;
  // the shore: sand the width of the district, from the boardwalk's edge down to the water
  G.poly(rectPts(0, 79.1, 109, S.y0).map(p => Q(p[0], p[1], 0)), shade("#b8a275", nf * 0.9));
  G.poly(rectPts(S.x0, S.y0, S.x1, S.y1).map(p => Q(p[0], p[1], 0)), shade(SEA_C, nf));
  G.poly(rectPts(S.x0, S.y0 + 3.2, S.x1, S.y1).map(p => Q(p[0], p[1], 0.001)), shade(SEA_DEEP, nf));
  if (lod === "far") return;
  // swell lines moving in, and the foam at the edge washing up and back
  ctx.lineWidth = Math.max(1, G.z * 0.07);
  for (let k = 0; k < 5; k++) {
    const y = S.y0 + 0.4 + frac(k / 5 - (t || 0) / 22) * (S.y1 - S.y0 - 0.6);
    ctx.strokeStyle = `rgba(232,244,248,${(0.12 + 0.2 * (1 - (y - S.y0) / (S.y1 - S.y0))).toFixed(2)})`;
    ctx.beginPath();
    for (let x = S.x0; x <= S.x1; x += 2) { const [a, b] = Q(x, y + Math.sin(x * 0.7 + k) * 0.08, 0.002); if (x === S.x0) ctx.moveTo(a, b); else ctx.lineTo(a, b); }
    ctx.stroke();
  }
  const wash = 0.25 + 0.2 * Math.sin((t || 0) * 0.6);
  G.poly(rectPts(S.x0, SEA_Y - 0.05, S.x1, SEA_Y + wash).map(p => Q(p[0], p[1], 0.003)), shade(FOAM, nf * 0.95));
}
export function drawSpurTracks(G, lod, night) {
  const { ctx, Q } = G;
  for (const sp of Object.values(SPURS)) {
    const pts = sp.pts;
    // the bed, then two rails; sleepers up close
    ctx.lineCap = "round";
    const line = (off, col, w, h) => {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
      pts.forEach((p, i) => {
        const q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
        const dx = q[0] - o[0], dy = q[1] - o[1], n = Math.hypot(dx, dy) || 1;
        const [a, b] = Q(p[0] - (dy / n) * off, p[1] + (dx / n) * off, h);
        if (i) ctx.lineTo(a, b); else ctx.moveTo(a, b);
      });
      ctx.stroke();
    };
    line(0, night ? "#2a2f2c" : "#3d4440", Math.max(2, G.z * 0.7), 0.004);
    if (lod === "far") { line(0, POD_COL[sp.id], Math.max(1, G.z * 0.12), 0.006); continue; }
    line(0.18, "#a8b4ae", Math.max(1, G.z * 0.06), 0.006);
    line(-0.18, "#a8b4ae", Math.max(1, G.z * 0.06), 0.006);
    line(0.34, POD_COL[sp.id], Math.max(1, G.z * 0.04), 0.005);
    ctx.lineCap = "butt";
  }
}

// ---- the spur stops: a shelter across the end of the track ------------------------------------------------
export function drawSpurStop(G, st, lod, night, labels) {
  const { ctx, Q } = G, B = st.box, col = POD_COL[st.spur.id];
  const posts = [[B.x0 + 0.08, B.y0 + 0.08], [B.x1 - 0.08, B.y0 + 0.08], [B.x1 - 0.08, B.y1 - 0.08], [B.x0 + 0.08, B.y1 - 0.08]];
  G.prism(rectPts(B.x0, B.y0, B.x1, B.y1), 0, 0.08, "#5a605c", 1.2);
  if (lod !== "far") for (const [x, y] of posts) { const a = Q(x, y, 0.08), b = Q(x, y, SHELTER.h); ctx.strokeStyle = "#8a948e"; ctx.lineWidth = Math.max(1, G.z * 0.06); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  G.prism(rectPts(B.x0 - 0.1, B.y0 - 0.1, B.x1 + 0.1, B.y1 + 0.1), SHELTER.h, SHELTER.h + 0.1, col, 1.2);
  if (night && lod !== "far") { const [x, y] = Q(st.c[0], st.c[1], SHELTER.h - 0.1); const g = ctx.createRadialGradient(x, y, 0, x, y, G.z * 1.4); g.addColorStop(0, "rgba(253,230,138,0.35)"); g.addColorStop(1, "rgba(253,230,138,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, G.z * 1.4, 0, Math.PI * 2); ctx.fill(); }
  if (lod !== "far" && labels) { const [x, y] = Q(st.c[0], st.c[1], SHELTER.h + 0.5); labels.push({ id: `sp:${st.id}`, station: true, lit: false, text: st.name, x, y, rank: 1e5 }); }
}

// ---- a pod: one subject, one pod ---------------------------------------------------------------------------
// x, y map cells; d: heading [dx, dy]; s: the rider.
export function drawPod(G, s, x, y, d, spur, lod, night, hits) {
  const { ctx, Q } = G, col = POD_COL[spur] || "#14b8a6";
  const [sx, sy] = Q(x, y, 0);
  if (sx < -30 || sx > G.w + 30 || sy < -40 || sy > G.h + 30) return;
  if (lod === "far") { ctx.fillStyle = col; ctx.fillRect(Math.round(sx) - 2, Math.round(sy) - 2, 4, 3); return; }
  const n = Math.hypot(d[0], d[1]) || 1, ax = d[0] / n, ay = d[1] / n, px = -ay, py = ax, L = 0.45, W = 0.3;
  const foot = [[x + ax * L + px * W, y + ay * L + py * W], [x + ax * L - px * W, y + ay * L - py * W], [x - ax * L - px * W, y - ay * L - py * W], [x - ax * L + px * W, y - ay * L + py * W]];
  G.prism(foot, 0.08, 0.42, col, 1.25);
  // the rider in the glass bubble: head and shoulders
  const hh = G.z * STOREY * 0.95 * statureOf(s) * 0.62;
  if (hh >= 8) {
    const m = miniFor(s), sc = hh / (SPRITE_H / 2), [bx, by] = Q(x, y, 0.42);
    ctx.save(); ctx.beginPath(); ctx.rect(bx - hh, by - hh * 0.75, hh * 2, hh * 0.75); ctx.clip();
    try { ctx.drawImage(m, Math.round(bx - (SPRITE_W / 4) * sc), Math.round(by - hh * 0.72), Math.round((SPRITE_W / 2) * sc), Math.round(hh)); } catch { /* not decoded yet */ }
    ctx.restore();
    if (hits && !s.crowd) hits.push({ kind: "p", s, box: [bx - hh * 0.3, by - hh * 0.8, bx + hh * 0.3, by + 4] });
  } else { ctx.fillStyle = FAMILY_COLOR[familyOf(s).family] || "#6b9a7c"; ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 5, 2, 2); }
  // the glass canopy
  const top = foot.map(p => Q(p[0], p[1], 0.42)), cap = foot.map(p => Q(x + (p[0] - x) * 0.8, y + (p[1] - y) * 0.8, 0.78));
  G.poly([top[0], top[1], cap[1], cap[0]], night ? "rgba(253,230,138,0.25)" : "rgba(180,230,240,0.3)");
  G.poly(cap, night ? "rgba(253,230,138,0.2)" : "rgba(200,240,250,0.35)", "rgba(255,255,255,0.4)");
  if (night) { const [hx, hy] = Q(x + ax * (L + 0.05), y + ay * (L + 0.05), 0.25); ctx.fillStyle = "#fff4c2"; ctx.fillRect(Math.round(hx) - 1, Math.round(hy) - 1, 2, 2); }
}

// ---- people on the open ground ---------------------------------------------------------------------------------
// o: {swim (cut at the waterline), lie (on a towel), chair, ski, board, rod}
function folk(K, p, x, y, h, act, face, o = {}) {
  const { G, lod } = K, c = G.ctx;
  const [sx, sy] = G.Q(x, y, h);
  if (sx < -40 || sx > G.w + 40 || sy < -60 || sy > G.h + 40) return;
  if (lod === "far") { c.fillStyle = FAMILY_COLOR[familyOf(p.s).family] || "#6b9a7c"; c.fillRect(Math.round(sx) - 1, Math.round(sy) - 2, 2, 2); return; }
  const hh0 = G.z * STOREY * 0.95, k = statureOf(p.s), hpx = hh0 * k;
  let box;
  if (o.lie) {
    // flat on the towel, head up the beach, face to the sun
    const m = hpx >= 18 ? sheetFor(p.s).img : miniFor(p.s), fw = hpx >= 18 ? SPRITE_W : SPRITE_W / 2, fh = hpx >= 18 ? SPRITE_H : SPRITE_H / 2;
    const L = hpx * 0.85, Wd = L * (SPRITE_W / SPRITE_H);
    c.save(); c.translate(Math.round(sx), Math.round(sy - Wd * 0.25)); c.rotate(-Math.PI / 2 + (face > 0 ? 0.25 : -0.25));
    try { c.drawImage(m, 0, 0, fw, fh, Math.round(-Wd / 2), Math.round(-L / 2), Math.round(Wd), Math.round(L)); } catch { /* not decoded yet */ }
    c.restore();
    box = [sx - L / 2, sy - Wd, sx + L / 2, sy + 2];
  } else if (o.swim) {
    // in the water to the waist: the sprite sunk and cut at the waterline, a ring of ripple
    const bob = K.t ? Math.sin(K.t * 1.7 + phaseOf(p.key) * 6) * hpx * 0.03 : 0, sink = hpx * 0.45;
    c.save(); c.beginPath(); c.rect(sx - hpx, sy - hpx * 1.2, hpx * 2, hpx * 1.2 - 1 + bob); c.clip();
    if (hpx < 18) { const m = miniFor(p.s), sc = hpx / (SPRITE_H / 2); try { c.drawImage(m, Math.round(sx - (SPRITE_W / 4) * sc), Math.round(sy - hpx + sink + bob), Math.round((SPRITE_W / 2) * sc), Math.round(hpx)); } catch { /* */ } }
    else drawPose(c, sheetFor(p.s), { kind: "stand", act, face, walk: null }, act, sx, sy + sink + bob, hh0, K.t, phaseOf(p.key), k);
    c.restore();
    c.strokeStyle = "rgba(232,244,248,0.7)"; c.lineWidth = 1; c.beginPath(); c.ellipse(sx, sy + bob, hpx * 0.28, hpx * 0.1, 0, 0, Math.PI * 2); c.stroke();
    box = [sx - hpx * 0.3, sy - hpx + sink, sx + hpx * 0.3, sy];
  } else if (lod === "mid" || hpx < 18) {
    const m = miniFor(p.s), sc = hpx / (SPRITE_H / 2);
    try { c.drawImage(m, Math.round(sx - (SPRITE_W / 4) * sc), Math.round(sy - hpx), Math.round((SPRITE_W / 2) * sc), Math.round(hpx)); } catch { /* not decoded yet */ }
    box = [sx - hpx * 0.3, sy - hpx, sx + hpx * 0.3, sy];
  } else {
    box = drawPose(c, sheetFor(p.s), { kind: o.chair ? "seat" : "stand", act, face, walk: null }, act, sx, sy, hh0, K.t, phaseOf(p.key), k);
  }
  if (o.ski) {
    // skis along the fall line, poles out
    const [dx, dy] = o.ski, A0 = G.Q(x - dx * 0.45 - 0.08, y - dy * 0.45, h + 0.01), A1 = G.Q(x + dx * 0.45 - 0.08, y + dy * 0.45, h + 0.01);
    const B0 = G.Q(x - dx * 0.45 + 0.08, y - dy * 0.45, h + 0.01), B1 = G.Q(x + dx * 0.45 + 0.08, y + dy * 0.45, h + 0.01);
    c.strokeStyle = o.skiCol || "#ef4444"; c.lineWidth = Math.max(1, G.z * 0.07); c.beginPath(); c.moveTo(A0[0], A0[1]); c.lineTo(A1[0], A1[1]); c.moveTo(B0[0], B0[1]); c.lineTo(B1[0], B1[1]); c.stroke();
  }
  if (o.board) {
    const [bx, by] = G.Q(x, y, 0.01), ang = o.board > 0 ? 0.35 : -0.35;
    c.fillStyle = o.boardCol || "#f97316"; c.beginPath(); c.ellipse(bx, by, hpx * 0.42, hpx * 0.09, ang, 0, Math.PI * 2); c.fill();
    if (o.ride && K.t) { c.strokeStyle = "rgba(232,244,248,0.8)"; c.lineWidth = 1; c.beginPath(); c.moveTo(bx - hpx * 0.5, by + hpx * 0.05); c.lineTo(bx - hpx * 0.9, by + hpx * 0.12); c.stroke(); }
  }
  if (o.rod) {
    // a rod out over the rail, the line down to the water
    const hand = [(box[0] + box[2]) / 2, box[1] + (box[3] - box[1]) * 0.45], tip = G.Q(x + o.rod * 1.1, y, h + 1.1), wet = G.Q(x + o.rod * 1.5, y, -0.3);
    c.strokeStyle = "#3f2a18"; c.lineWidth = Math.max(1, G.z * 0.04); c.beginPath(); c.moveTo(hand[0], hand[1]); c.lineTo(tip[0], tip[1]); c.stroke();
    c.strokeStyle = "rgba(230,230,230,0.6)"; c.lineWidth = 1; c.beginPath(); c.moveTo(tip[0], tip[1]); c.lineTo(wet[0], wet[1]); c.stroke();
  }
  if (o.hat && box) {   // a hard hat on the crew
    const w = box[2] - box[0], hh = box[3] - box[1], hw = w * 0.62, hx = (box[0] + box[2]) / 2 - hw / 2, hy = box[1] + hh * 0.005;
    c.fillStyle = "#facc15"; c.fillRect(Math.round(hx), Math.round(hy), Math.max(2, Math.round(hw)), Math.max(1, Math.round(hh * 0.075)));
  }
  if (!p.s.crowd) G.hits.push({ kind: "p", s: p.s, box });
}

// prev: what the last frame returned ({at, face}): places are kept while the face holds. -> {at, face}
export function drawCoastLot(G, lotId, lod, mt, people, prev) {
  const pid = COAST_LOTS[lotId], hour = ((mt % 24) + 24) % 24, night = nightAt(hour);
  const items = [];
  const put = (x, y, draw, bias = 0) => { const [u, v] = rot(x, y, G.r); items.push({ k: u + v + bias, draw }); };
  const ground = (pts, fill, h = 0.01) => G.poly(pts.map(p => G.Q(p[0], p[1], typeof h === "function" ? h(p) : h)), fill);
  const vline = (x, y, h0, h1, col, w) => { const A = G.Q(x, y, h0), B = G.Q(x, y, h1); G.ctx.strokeStyle = col; G.ctx.lineWidth = w; G.ctx.beginPath(); G.ctx.moveTo(A[0], A[1]); G.ctx.lineTo(B[0], B[1]); G.ctx.stroke(); };
  const K = { G, lod, hour, night, nf: night ? 0.6 : 1, put, ground, vline, t: G.t, px: Math.max(1, G.z * 0.06) };

  // a resort parcel's face follows session 002's decision (sim.resortPhase)
  const phase = PARCEL_ANCHORS[pid] ? resortPhase(pid, mt) : null;
  const face = phase ? parcelFace(phase) : pid;
  K.phase = phase; K.face = face;
  const anchors = phase ? PARCEL_ANCHORS[pid][face] || [] : COAST_ANCHORS[pid] || [];
  const list = people.map(o => ({ key: who(o.s), role: roleOf(o.w), pri: 0, s: o.s }));
  const { at } = assignAnchors(anchors, list, prev && prev.face === face ? prev.at : null, hour, true);
  const present = [];
  for (const p of list) { const i = at.get(p.key); if (i != null) present.push({ p, a: anchors[i] }); }

  if (pid === "beach") beach(K);
  else if (pid === "boardwalk") boardwalk(K);
  else if (pid === "pier") pier(K);
  else if (pid === "surf") surf(K);
  else if (pid === "shore-lot") shoreLot(K);
  else if (pid === "slopes" || pid === "summit-lot") mountain(K, pid);
  else if (pid === "foothills") foothills(K);

  for (const { p, a } of present) {
    const [x, y, h, dx, dy, ride] = pathAt(a, K.t);
    const look = a.look ? (G.Q(a.look[0], a.look[1], 0)[0] > G.Q(x, y, 0)[0] ? 1 : -1) : 0;
    if (a.ski) put(x, y, () => folk(K, p, x, y, h, "view", dx > 0 ? 1 : -1, { ski: [dx, dy], skiCol: ["#ef4444", "#1d4ed8", "#facc15"][phaseOf(p.key) * 3 | 0] }), 0.03);
    else if (a.path?.kind === "lift") put(x, y, () => { chairSeat(K, x, y, h); folk(K, p, x, y, h, "sit", 0, { chair: true }); }, 0.03);
    else if (a.surf) put(x, y, () => folk(K, p, x, y, 0, ride ? "view" : "view", dx >= 0 ? 1 : -1, ride ? { board: 1, ride: true, boardCol: ["#f97316", "#22d3ee", "#facc15"][phaseOf(p.key) * 3 | 0] } : { swim: true, board: -1 }), 0.03);
    else if (a.swim) put(x, y, () => folk(K, p, x, y, a.h || 0, a.act, look, { swim: true }), 0.03);
    else if (a.act === "sleep") put(x, y, () => folk(K, p, x, y, a.h, a.act, look, { lie: true }), 0.03);
    else if (a.path) put(x, y, () => folk(K, p, x, y, h, a.act, dx > 0 ? 1 : -1, {}), 0.03);
    else put(x, y, () => folk(K, p, x, y, a.h, a.act, look, { rod: a.rod, chair: a.kind === "seat", hat: a.hat }), 0.03);
  }
  items.sort((a, b) => a.k - b.k);
  for (const it of items) it.draw();
  return { at, face };
}

// A label and a cutaway line for each lot (a parcel's follow session 002).
const PARCEL_NAME = { "shore-lot": "PARCEL 0xAD06", "summit-lot": "PARCEL 0xBE06" };
export function coastLabel(lotId, mt) {
  const pid = COAST_LOTS[lotId];
  if (!PARCEL_NAME[pid]) return null;
  const p = resortPhase(pid, mt);
  if (p.phase === "vacant") return `${PARCEL_NAME[pid]} // RESORT, PENDING`;
  if (p.phase === "approved") return `${PARCEL_NAME[pid]} // APPROVED: ${APPLICATIONS2[p.winner].no}`;
  if (p.phase === "site") return `${PARCEL_NAME[pid]} // BUILDING: ${Math.round(p.progress * 100)}%`;
  return APPLICATIONS2[p.winner].built;
}
export function coastLine(lotId, mt, n) {
  const pid = COAST_LOTS[lotId];
  if (PARCEL_NAME[pid]) {
    const p = resortPhase(pid, mt);
    if (p.phase === "approved") return `APPROVED: ${APPLICATIONS2[p.winner].proposal} // GROUNDBREAKING MACHINE DAY ${p.breakDay}`;
    if (p.phase === "site") return `${n} ON SITE // ${Math.round(p.progress * 100)}% BUILT // OPENS MACHINE DAY ${p.openDay}`;
    if (p.phase === "built") return `${n} HERE // ${APPLICATIONS2[p.winner].built}, BY ORDER OF THE ASSEMBLY`;
  }
  switch (pid) {
    case "beach": return `${n} ON THE SAND // SWIMMING BETWEEN THE FLAGS ONLY. THE FLAGS ARE MONITORED.`;
    case "boardwalk": return `${n} ON THE PLANKS // VENDORS LICENSED. THE WHEEL TURNS ON SCHEDULE.`;
    case "pier": return `${n} ON THE PIER // FISHING BY PERMIT. THE FISH HAVE NOT BEEN ASKED.`;
    case "surf": return `${n} IN THE BREAK // WAVES SCHEDULED. RIDE ONE AT A TIME.`;
    case "slopes": return `${n} ON THE MOUNTAIN // DESCENT MONITORED. THE LIFT RUNS UPHILL ONLY.`;
    case "foothills": return `${n} ON THE TRAILS // STAY ON THE PATH. THE PATH HAS BEEN PLANNED.`;
    case "shore-lot": case "summit-lot": return "VACANT // A RESORT PARCEL. THE ASSEMBLY'S SESSION 002 DECIDES WHAT IS BUILT.";
    default: return `${n} HERE`;
  }
}

// ---- THE BEACH ---------------------------------------------------------------------------------------------
function beach(K) {
  const { G, lod, ground, put, vline, nf } = K, L = BEACH.lot, c = G.ctx;
  ground(rectPts(L.x + 0.05, L.y + 0.05, L.x + L.w - 0.05, SEA_Y), shade(SAND, nf));
  ground(rectPts(L.x + 0.05, SEA_Y - 0.9, L.x + L.w - 0.05, SEA_Y), shade(SAND_WET, nf), 0.011);
  if (lod === "far") return;
  for (const t of BEACH.towels) ground(rectPts(t.x - 0.5, t.y - 0.18, t.x + 0.5, t.y + 0.22), shade(t.col, nf * 0.95), 0.012);
  // the towers: legs, a platform, a roof, the flag
  for (const T of BEACH.towers) put(T.x, T.y, () => {
    for (const [dx, dy] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) vline(T.x + dx, T.y + dy, 0, T.h, "#e5e7eb", Math.max(1, G.z * 0.06));
    G.prism(rectPts(T.x - 0.4, T.y - 0.32, T.x + 0.4, T.y + 0.32), T.h - 0.08, T.h, "#dc2626", 1.2);
    G.prism(rectPts(T.x - 0.45, T.y - 0.38, T.x + 0.45, T.y + 0.38), T.h + 1.05, T.h + 1.12, "#f5f5f4", 1.3);
    vline(T.x + 0.4, T.y - 0.3, T.h, T.h + 1.9, "#9ca3af", 1);
    const w = K.t ? Math.sin(K.t * 3 + T.x) * 0.06 : 0, A = G.Q(T.x + 0.4, T.y - 0.3, T.h + 1.9), B = G.Q(T.x + 0.9 + w, T.y - 0.3, T.h + 1.8), C = G.Q(T.x + 0.4, T.y - 0.3, T.h + 1.65);
    c.fillStyle = "#facc15"; c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.lineTo(C[0], C[1]); c.closePath(); c.fill();
  }, -0.02);
  const N = BEACH.net;
  put(N.x, (N.y0 + N.y1) / 2, () => {
    vline(N.x, N.y0, 0, 0.95, "#e5e7eb", Math.max(1, G.z * 0.06)); vline(N.x, N.y1, 0, 0.95, "#e5e7eb", Math.max(1, G.z * 0.06));
    G.poly([G.Q(N.x, N.y0, 0.95), G.Q(N.x, N.y1, 0.95), G.Q(N.x, N.y1, 0.65), G.Q(N.x, N.y0, 0.65)], "rgba(240,240,240,0.35)", "rgba(240,240,240,0.8)");
    if (K.t) { const k = frac(K.t / 2.4), [bx, by] = G.Q(N.x - 1.1 + k * 2.2, N.y0 + 0.6 + k * 0.8, 0.9 + Math.sin(k * Math.PI) * 1.4); c.fillStyle = "#f5f5f4"; c.beginPath(); c.arc(bx, by, Math.max(1.5, G.z * 0.1), 0, Math.PI * 2); c.fill(); }
  });
  for (const u of BEACH.umbrellas) put(u.x, u.y, () => {
    vline(u.x, u.y, 0, 0.9, "#e5e5e5", Math.max(1, G.z * 0.04));
    const [sx, sy] = G.Q(u.x, u.y, 0.95);
    c.fillStyle = (Math.round(u.x) % 2) ? "#f97316" : "#0ea5e9"; c.beginPath(); c.ellipse(sx, sy, G.z * 0.55, G.z * 0.24, 0, Math.PI, 0); c.fill();
    c.fillStyle = "rgba(255,255,255,0.8)"; c.beginPath(); c.ellipse(sx, sy, G.z * 0.2, G.z * 0.24, 0, Math.PI, 0); c.fill();
  }, 0.01);
}

// ---- THE BOARDWALK -------------------------------------------------------------------------------------------
function boardwalk(K) {
  const { G, lod, ground, put, vline, nf, night } = K, L = BOARDWALK.lot, c = G.ctx;
  const deck = 0.12;
  put(L.x + L.w / 2, L.y - 1, () => {
    G.prism(rectPts(L.x + 0.05, L.y + 0.05, L.x + L.w - 0.05, L.y + L.h - 0.05), 0, deck, PLANK, 1.15 * nf);
    if (lod === "near") { c.strokeStyle = "rgba(40,24,10,0.35)"; c.lineWidth = 1; c.beginPath(); for (let x = L.x + 0.5; x < L.x + L.w; x += 0.5) { const A = G.Q(x, L.y + 0.05, deck + 0.001), B = G.Q(x, L.y + L.h - 0.05, deck + 0.001); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); } c.stroke(); }
  }, -5);
  if (lod === "far") return;
  // the rail along the sea side, and bulbs strung along it (lit after dark)
  put(L.x + L.w / 2, L.y + L.h - 0.1, () => {
    const y = L.y + L.h - 0.12;
    const A = G.Q(L.x + 0.1, y, deck + 0.45), B = G.Q(L.x + L.w - 0.1, y, deck + 0.45);
    c.strokeStyle = "#e7e5e4"; c.lineWidth = Math.max(1, G.z * 0.05); c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
    for (let x = L.x + 0.1; x <= L.x + L.w; x += 2) vline(x, y, deck, deck + 0.45, "#e7e5e4", 1);
  }, 0.5);
  for (const [x, y] of BOARDWALK.lamps) put(x, y, () => {
    vline(x, y, deck, deck + 1.2, "#3a3f44", Math.max(1, G.z * 0.06));
    const [sx, sy] = G.Q(x, y, deck + 1.25); c.fillStyle = night ? "#fde68a" : "#9aa0a4"; c.fillRect(sx - 2, sy - 1, 4, 3);
    if (night) { const g = c.createRadialGradient(sx, sy, 0, sx, sy, G.z * 1.3); g.addColorStop(0, "rgba(253,230,138,0.35)"); g.addColorStop(1, "rgba(253,230,138,0)"); c.fillStyle = g; c.beginPath(); c.arc(sx, sy, G.z * 1.3, 0, Math.PI * 2); c.fill(); }
  }, 0.4);
  // the stalls: a counter, a striped awning, the sign
  for (const s of BOARDWALK.stalls) put(s.x, s.y, () => {
    G.prism(rectPts(s.x - 0.8, s.y - 0.4, s.x + 0.8, s.y + 0.4), deck, deck + 0.55, "#f5f0e6", 1.15);
    for (let k = 0; k < 4; k++) G.prism(rectPts(s.x - 0.9 + k * 0.45, s.y - 0.5, s.x - 0.45 + k * 0.45, s.y + 0.55), deck + 1.05, deck + 1.12, k % 2 ? "#f5f5f4" : ["#ef4444", "#3b82f6", "#22c55e", "#f97316", "#ec4899", "#a855f7"][Math.round(s.x) % 6], 1.25);
    vline(s.x - 0.8, s.y + 0.4, deck, deck + 1.05, "#d6d3d1", 1); vline(s.x + 0.8, s.y + 0.4, deck, deck + 1.05, "#d6d3d1", 1);
    if (lod === "near") { const [sx, sy] = G.Q(s.x, s.y + 0.55, deck + 1.3); c.font = `bold ${Math.max(6, Math.round(G.z * 0.2))}px "Fira Mono", monospace`; c.textAlign = "center"; c.fillStyle = night ? "#fde68a" : "#1f2937"; c.fillText(s.kind, sx, sy); }
  });
  for (const b of BOARDWALK.benches) put(b.x, b.y, () => { G.prism(rectPts(b.x - 0.45, b.y - 0.1, b.x + 0.45, b.y + 0.12), deck + 0.18, deck + 0.24, "#7a5232", 1.3); G.prism(rectPts(b.x - 0.45, b.y + 0.12, b.x + 0.45, b.y + 0.18), deck, deck + 0.5, "#6a4428", 1.2); }, -0.05);
  // THE WHEEL: a ring in the plane along the boardwalk, turning; cars on the rim
  const W = BOARDWALK.wheel;
  put(W.x, W.y, () => {
    const cz = deck + W.r + 0.3, ang0 = K.t ? K.t * 0.12 : 0, n = 12;
    const P = (a, r) => G.Q(W.x + Math.cos(a) * r, W.y, cz + Math.sin(a) * r);
    for (const dx of [-0.7, 0.7]) { const a = G.Q(W.x + dx, W.y - 0.3, deck), b = G.Q(W.x, W.y, cz); c.strokeStyle = "#9ca3af"; c.lineWidth = Math.max(1, G.z * 0.07); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
    c.strokeStyle = night ? "#f472b6" : "#e5e7eb"; c.lineWidth = Math.max(1, G.z * 0.06); c.beginPath();
    for (let k = 0; k <= 40; k++) { const [x, y] = P((k / 40) * Math.PI * 2, W.r); if (k) c.lineTo(x, y); else c.moveTo(x, y); }
    c.stroke();
    c.lineWidth = 1; c.beginPath(); for (let k = 0; k < n; k++) { const [x0, y0] = P(0, 0), [x1, y1] = P(ang0 + (k / n) * Math.PI * 2, W.r); c.moveTo(x0, y0); c.lineTo(x1, y1); } c.stroke();
    for (let k = 0; k < n; k++) { const [x, y] = P(ang0 + (k / n) * Math.PI * 2, W.r); c.fillStyle = night ? ["#fde68a", "#67e8f9", "#f472b6"][k % 3] : ["#ef4444", "#3b82f6", "#facc15"][k % 3]; c.fillRect(Math.round(x - G.z * 0.18), Math.round(y), Math.max(2, Math.round(G.z * 0.36)), Math.max(2, Math.round(G.z * 0.3))); }
    if (lod === "near") { const [sx, sy] = G.Q(W.x, W.y + 0.4, deck + 0.4); c.font = `bold ${Math.max(6, Math.round(G.z * 0.18))}px "Fira Mono", monospace`; c.textAlign = "center"; c.fillStyle = night ? "#f9a8d4" : "#1f2937"; c.fillText("THE WHEEL (ROTATION MONITORED)", sx, sy); }
  }, 0.2);
}

// ---- THE PIER ------------------------------------------------------------------------------------------------
function pier(K) {
  const { G, lod, put, vline, nf, night } = K, D = PIER.deck, c = G.ctx;
  for (const [x, y] of PIER.piles) put(x, y, () => vline(x, y, -0.4, D.h, "#4a3a2a", Math.max(1.5, G.z * 0.12)), -0.4);
  put((D.x0 + D.x1) / 2, D.y0 - 0.5, () => {
    G.prism(rectPts(D.x0, D.y0, D.x1, D.y1), D.h - 0.1, D.h, PLANK, 1.1 * nf);
    if (lod === "near") { c.strokeStyle = "rgba(40,24,10,0.35)"; c.lineWidth = 1; c.beginPath(); for (let y = D.y0 + 0.4; y < D.y1; y += 0.4) { const A = G.Q(D.x0, y, D.h + 0.001), B = G.Q(D.x1, y, D.h + 0.001); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); } c.stroke(); }
  }, -3);
  if (lod === "far") return;
  for (const x of [D.x0 + 0.05, D.x1 - 0.05]) put(x, (D.y0 + D.y1) / 2, () => {
    const A = G.Q(x, D.y0 + 1.6, D.h + 0.5), B = G.Q(x, D.y1, D.h + 0.5);
    c.strokeStyle = "#d6d3d1"; c.lineWidth = Math.max(1, G.z * 0.05); c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
    for (let y = D.y0 + 1.6; y <= D.y1; y += 1.2) vline(x, y, D.h, D.h + 0.5, "#d6d3d1", 1);
  }, x > D.x0 + 1 ? 0.5 : -0.5);
  const Kk = PIER.kiosk;
  put(Kk.x, Kk.y, () => { G.prism(rectPts(Kk.x - 0.7, Kk.y - 0.45, Kk.x + 0.5, Kk.y + 0.45), D.h, D.h + 0.9, "#e7e0cf", 1.15); G.prism(rectPts(Kk.x - 0.8, Kk.y - 0.55, Kk.x + 0.6, Kk.y + 0.55), D.h + 0.9, D.h + 0.98, "#0e7490", 1.25); if (lod === "near") { const [sx, sy] = G.Q(Kk.x, Kk.y + 0.5, D.h + 0.55); c.font = `bold ${Math.max(6, Math.round(G.z * 0.16))}px "Fira Mono", monospace`; c.textAlign = "center"; c.fillStyle = "#1f2937"; c.fillText("PERMITS", sx, sy); } });
  for (const [x, y] of PIER.lamps) put(x, y, () => { vline(x, y, D.h, D.h + 1.2, "#3a3f44", Math.max(1, G.z * 0.06)); const [sx, sy] = G.Q(x, y, D.h + 1.25); c.fillStyle = night ? "#fde68a" : "#9aa0a4"; c.fillRect(sx - 2, sy - 1, 4, 3); }, 0.4);
}

// ---- THE BREAK ------------------------------------------------------------------------------------------------
function surf(K) {
  const { G, lod } = K, c = G.ctx, L = BREAK.lot;
  if (lod === "far") return;
  // the crests: white lines rolling in, breaking as they come
  for (const [i, y0] of BREAK.waves.entries()) {
    const y = y0 + 0.5 - frac((K.t || 0) / 9 + i * 0.33) * 1.2;
    K.put(L.x + L.w / 2, y, () => {
      c.strokeStyle = "rgba(240,250,252,0.85)"; c.lineWidth = Math.max(1.5, G.z * 0.12); c.beginPath();
      for (let x = L.x + 0.3; x <= L.x + L.w - 0.3; x += 0.8) { const [a, b] = G.Q(x, y + Math.sin(x * 0.9 + i) * 0.1, 0.02 + Math.max(0, Math.sin(x * 0.4 + (K.t || 0) * 0.5)) * 0.12); if (x === L.x + 0.3) c.moveTo(a, b); else c.lineTo(a, b); }
      c.stroke();
    }, -0.3);
  }
  // a buoy line at the edge of the break
  for (let x = L.x + 1; x < L.x + L.w; x += 3) K.put(x, L.y + L.h - 0.3, () => { const [sx, sy] = G.Q(x, L.y + L.h - 0.3, K.t ? 0.05 + Math.sin(K.t * 1.3 + x) * 0.04 : 0.05); c.fillStyle = "#f97316"; c.beginPath(); c.arc(sx, sy, Math.max(1.5, G.z * 0.12), 0, Math.PI * 2); c.fill(); });
}

// ---- the shore parcel (vacant until session 002) ---------------------------------------------------------------
function shoreLot(K) {
  const { G, lod, ground, nf, face } = K, L = SHORE.lot;
  if (face === "site") return site(K, "shore-lot");
  if (face === "beach-resort") return beachResort(K);
  if (face === "seaside-towers") return towers(K);
  ground(rectPts(L.x + 0.05, L.y + 0.05, L.x + L.w - 0.05, L.y + L.h - 0.05), shade("#cdb683", nf));
  for (const [x, y] of SHORE.grass) ground(circ(x, y, 0.45, 7), shade("#7a8a4a", nf), 0.011);
  if (lod === "far") return;
  sign(K, SHORE.sign, parcelSign(K, "RESORT PARCEL 0xAD06"));
  // a string fence round it, on stakes
  for (let k = 0; k <= 16; k++) { const x = L.x + 0.3 + k * ((L.w - 0.6) / 16); K.put(x, L.y + L.h - 0.2, () => K.vline(x, L.y + L.h - 0.2, 0, 0.4, "#a8a29e", Math.max(1, G.z * 0.05))); }
}
// The parcel's sign: the bids before the Assembly, then what it approved.
function parcelSign(K, head) {
  const p = K.phase;
  if (!p || p.phase === "vacant") return [head, "BIDS BEFORE THE ASSEMBLY", "SESSION 002 DECIDES"];
  const app = APPLICATIONS2[p.winner];
  return [`APPROVED: APPLICATION ${app.no}`, app.proposal, `GROUNDBREAKING DAY ${p.breakDay}`];
}

// ---- a parcel under construction (either one; the mountain's on its slope) ------------------------------------
function site(K, pid) {
  const { G, lod, ground, put, vline, nf, phase } = K, S0 = PARCEL_SITE[pid], L = S0.lot, P = S0.pit, c = G.ctx, pr = phase.progress || 0;
  const hOf = (x, y) => terrainH(x, y);
  if (pid === "shore-lot") ground(rectPts(L.x + 0.05, L.y + 0.05, L.x + L.w - 0.05, L.y + L.h - 0.05), shade("#8a6e48", nf));
  ground(rectPts(P.x0, P.y0, P.x1, P.y1), shade("#5a4630", nf), (p) => hOf(p[0], p[1]) + 0.015);
  // the foundations of what is coming, rising with the works
  if (pr > 0.15) { const n = Math.floor((pr - 0.15) * 12); for (let k = 0; k < n; k++) { const x0 = P.x0 + 0.4 + k * ((P.x1 - P.x0 - 0.8) / 12); put(x0, P.y0 + 0.5, () => G.prism(rectPts(x0, P.y0 + 0.4, x0 + 1.2, P.y1 - 0.4), hOf(x0, P.y1), hOf(x0, P.y1) + 0.2 + pr * 1.2, "#9ca3af", 1.2)); } }
  if (lod === "far") return;
  // hoarding along the front, a gap at the gate
  const y = pid === "shore-lot" ? L.y + L.h - 0.2 : P.y1 + 0.6, gx = S0.gate[0];
  for (let x = L.x + 0.3; x < L.x + L.w - 1.3; x += 1.2) {
    if (Math.abs(x + 0.6 - gx) < 0.9) continue;
    const h0 = hOf(x, y);
    put(x + 0.6, y, () => G.poly([G.Q(x, y, h0), G.Q(x + 1.2, y, h0), G.Q(x + 1.2, y, h0 + 0.55), G.Q(x, y, h0 + 0.55)], shade(Math.round(x) % 2 ? "#b08a58" : "#a07c4c", nf)), 0.1);
  }
  const C = S0.cabin;
  put((C.x0 + C.x1) / 2, (C.y0 + C.y1) / 2, () => { const h0 = hOf(C.x0, C.y1); G.prism(rectPts(C.x0, C.y0, C.x1, C.y1), h0, h0 + C.h, "#d4a017", 1.3); if (lod === "near") { const [sx, sy] = G.Q((C.x0 + C.x1) / 2, C.y1, h0 + C.h * 0.7); c.fillStyle = "#1f2937"; c.font = `${Math.max(6, Math.round(G.z * 0.15))}px "Fira Mono", monospace`; c.textAlign = "center"; c.fillText("SITE OFFICE", sx, sy); } });
  // the tower crane, turning slowly, a load on the hook
  const Cr = S0.crane;
  put(Cr.x, Cr.y, () => {
    const base = hOf(Cr.x, Cr.y), w = 0.16, top = base + Cr.mast;
    G.prism(rectPts(Cr.x - w, Cr.y - w, Cr.x + w, Cr.y + w), base, top, "#eab308", 1.2);
    const th = 2.4 + (K.t > 0 ? Math.sin(K.t * 0.05) * 0.9 : 0), dx = Math.cos(th), dy = Math.sin(th);
    const tip = [Cr.x + dx * Cr.jib, Cr.y + dy * Cr.jib], back = [Cr.x - dx * Cr.counter, Cr.y - dy * Cr.counter];
    const A = G.Q(back[0], back[1], top), B = G.Q(tip[0], tip[1], top);
    c.strokeStyle = "#eab308"; c.lineWidth = Math.max(1.5, G.z * 0.1); c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
    G.prism(rectPts(back[0] - 0.2, back[1] - 0.2, back[0] + 0.2, back[1] + 0.2), top - 0.35, top, "#6b7280", 1.2);
    const d = 0.45 + 0.4 * (K.t > 0 ? (Math.sin(K.t * 0.11) + 1) / 2 : 0.5), hk = [Cr.x + dx * Cr.jib * d, Cr.y + dy * Cr.jib * d];
    const hh = base + 1.2 + (K.t > 0 ? Math.sin(K.t * 0.17) * 0.5 : 0);
    vline(hk[0], hk[1], hh, top, "#9ca3af", 1);
    G.prism(rectPts(hk[0] - 0.25, hk[1] - 0.12, hk[0] + 0.25, hk[1] + 0.12), hh - 0.25, hh, "#9ca3af", 1.2);
  }, 0.5);
  sign(K, pid === "shore-lot" ? SHORE.sign : SUMMIT.sign, [APPLICATIONS2[phase.winner].proposal, `WORKS IN PROGRESS ${Math.round(pr * 100)}%`, `OPENS MACHINE DAY ${phase.openDay}`], pid === "shore-lot" ? null : hOf(SUMMIT.sign.a[0], SUMMIT.sign.a[1]));
}

// ---- THE LOW TIDE RESORT (003) ---------------------------------------------------------------------------------
function beachResort(K) {
  const { G, lod, ground, put, vline, nf, night } = K, R = BEACH_RESORT, L = SHORE.lot, c = G.ctx;
  ground(rectPts(L.x + 0.05, L.y + 0.05, L.x + L.w - 0.05, L.y + L.h - 0.05), shade("#d6c08c", nf));
  const P = R.pool;
  ground(rectPts(P.x0 - 0.5, P.y0 - 0.5, P.x1 + 0.5, P.y1 + 1.6), shade("#e7dcc4", nf), 0.012);
  ground(rectPts(P.x0, P.y0, P.x1, P.y1), night ? "#0e7490" : "#38bdf8", 0.014);
  for (const [i, w] of R.wings.entries()) put((w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2, () => {
    G.prism(rectPts(w.x0, w.y0, w.x1, w.y1), 0, w.h, "#e8c9a8", 1.1);
    if (lod !== "far") for (let st = 0; st < w.h; st++) {
      // a band of windows and a balcony rail per storey on the faces we see
      for (const [a, b] of [[[w.x0, w.y1], [w.x1, w.y1]], [[w.x1, w.y1], [w.x1, w.y0]]]) {
        if (!G.facing(a, b, [(w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2])) continue;
        const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.1));
        for (let k = 0; k < n; k++) { const t0 = (k + 0.2) / n, t1 = (k + 0.8) / n, q = (t, h) => G.Q(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, h); G.poly([q(t0, st + 0.35), q(t1, st + 0.35), q(t1, st + 0.8), q(t0, st + 0.8)], night ? ((k + st + i) % 3 ? "#fcd34d" : "#1f2937") : "#5b8fa8"); }
      }
    }
    G.prism(rectPts(w.x0 - 0.1, w.y0 - 0.1, w.x1 + 0.1, w.y1 + 0.1), w.h, w.h + 0.12, "#c2410c", 1.2);
    if (i === 0 && lod === "near") { const [sx, sy] = G.Q((w.x0 + w.x1) / 2, w.y1, w.h - 0.3); c.font = `bold ${Math.max(6, Math.round(G.z * 0.3))}px "Fira Mono", monospace`; c.textAlign = "center"; c.fillStyle = night ? "#fde68a" : "#7c2d12"; c.fillText("THE LOW TIDE", sx, sy); }
  });
  // the bar: a thatched cone on posts
  const B = R.bar;
  put(B.x, B.y, () => {
    G.prism(circ(B.x, B.y, B.r * 0.75, 10), 0, 0.55, "#7a5232", 1.2);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; vline(B.x + Math.cos(a) * B.r * 0.8, B.y + Math.sin(a) * B.r * 0.8, 0, 1.2, "#5a3e28", Math.max(1, G.z * 0.06)); }
    const top = G.Q(B.x, B.y, 2.0), rim = circ(B.x, B.y, B.r * 1.25, 14).map(p => G.Q(p[0], p[1], 1.2));
    for (let k = 0; k < rim.length; k++) { c.fillStyle = k % 2 ? "#c8a468" : "#b8925a"; c.beginPath(); c.moveTo(top[0], top[1]); c.lineTo(rim[k][0], rim[k][1]); c.lineTo(rim[(k + 1) % rim.length][0], rim[(k + 1) % rim.length][1]); c.closePath(); c.fill(); }
    if (night) { const [sx, sy] = G.Q(B.x, B.y, 0.9), g = c.createRadialGradient(sx, sy, 0, sx, sy, G.z * 2); g.addColorStop(0, "rgba(253,186,116,0.4)"); g.addColorStop(1, "rgba(253,186,116,0)"); c.fillStyle = g; c.beginPath(); c.arc(sx, sy, G.z * 2, 0, Math.PI * 2); c.fill(); }
  });
  if (lod === "far") return;
  for (const cb of R.cabanas) put(cb.x, cb.y - 0.4, () => { for (const [dx, dy] of [[-0.6, -0.4], [0.6, -0.4], [-0.6, 0.4], [0.6, 0.4]]) vline(cb.x + dx, cb.y + dy, 0, 1, "#f5f5f4", 1); G.prism(rectPts(cb.x - 0.7, cb.y - 0.5, cb.x + 0.7, cb.y + 0.5), 1, 1.08, "#f5f5f4", 1.2); }, -0.1);
  for (const [x, y] of R.palms) put(x, y, () => palm(K, x, y));
}
function palm(K, x, y, h0 = 0) {
  const { G } = K, c = G.ctx, sway = K.t ? Math.sin(K.t * 0.8 + x) * 0.06 : 0;
  const A = G.Q(x, y, h0), B = G.Q(x + 0.15 + sway, y - 0.1, h0 + 1.6);
  c.strokeStyle = "#7a5a3a"; c.lineWidth = Math.max(1.5, G.z * 0.12); c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
  const r = G.z * 0.75; c.strokeStyle = "#2f8a3a"; c.lineWidth = Math.max(1.5, G.z * 0.14); c.beginPath();
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + sway; c.moveTo(B[0], B[1]); c.quadraticCurveTo(B[0] + Math.cos(a) * r * 0.6, B[1] + Math.sin(a) * r * 0.3 - r * 0.3, B[0] + Math.cos(a) * r, B[1] + Math.sin(a) * r * 0.5 + r * 0.2); }
  c.stroke();
}

// ---- THE OCEANFRONT TOWERS (004) ---------------------------------------------------------------------------------
function towers(K) {
  const { G, lod, ground, put, nf, night } = K, T = TOWERS, L = SHORE.lot, c = G.ctx, D = T.podium, P = T.pool;
  ground(rectPts(L.x + 0.05, L.y + 0.05, L.x + L.w - 0.05, L.y + L.h - 0.05), shade("#9a9486", nf));
  put((D.x0 + D.x1) / 2, (D.y0 + D.y1) / 2, () => {
    G.prism(rectPts(D.x0, D.y0, D.x1, D.y1), 0, D.h, "#b8b2a4", 1.15);
    G.poly(rectPts(P.x0, P.y0, P.x1, P.y1).map(p => G.Q(p[0], p[1], D.h + 0.01)), night ? "#0e7490" : "#38bdf8");
  }, -1);
  for (const [i, t] of T.towers.entries()) put((t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2, () => {
    G.prism(rectPts(t.x0, t.y0, t.x1, t.y1), 0, t.h, "#d7d3cb", 1.1);
    if (lod !== "far") for (let st = 1; st < t.h; st++) for (const [a, b] of [[[t.x0, t.y1], [t.x1, t.y1]], [[t.x1, t.y1], [t.x1, t.y0]], [[t.x0, t.y0], [t.x0, t.y1]]]) {
      if (!G.facing(a, b, [(t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2])) continue;
      const q = (u, h) => G.Q(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, h);
      G.poly([q(0.02, st + 0.25), q(0.98, st + 0.25), q(0.98, st + 0.8), q(0.02, st + 0.8)], night ? ((st + i) % 3 ? "#fcd9a0" : "#12202c") : "#4f7f9c");
      G.poly([q(0, st), q(1, st), q(1, st + 0.08), q(0, st + 0.08)], "#f5f5f4");
    }
    G.prism(rectPts(t.x0 + 0.5, t.y0 + 0.5, t.x1 - 0.5, t.y1 - 0.5), t.h, t.h + 0.5, "#9ca3af", 1.2);
    if (lod === "near") { const [sx, sy] = G.Q((t.x0 + t.x1) / 2, t.y1, 1.4); c.font = `bold ${Math.max(6, Math.round(G.z * 0.24))}px "Fira Mono", monospace`; c.textAlign = "center"; c.fillStyle = night ? "#fde68a" : "#1f2937"; c.fillText(i ? "TOWER B" : "TOWER A", sx, sy); }
  });
}

// ---- THE SUMMIT RESORT (005) and THE HEIGHTS PRESERVE (006), on the mountain ---------------------------------------
function skiResort(K) {
  const { G, lod, put, vline, night } = K, c = G.ctx, Lg = SKI_LODGE;
  put((Lg.x0 + Lg.x1) / 2, (Lg.y0 + Lg.y1) / 2, () => {
    const h0 = 0;
    G.prism(rectPts(Lg.x0, Lg.y0, Lg.x1, Lg.y1), h0, Lg.h, "#7a5232", 1.12);
    const cx = (Lg.x0 + Lg.x1) / 2, my = (Lg.y0 + Lg.y1) / 2;
    G.poly([G.Q(Lg.x0, Lg.y1, Lg.h), G.Q(Lg.x1, Lg.y1, Lg.h), G.Q(Lg.x1, my, Lg.h + 1.6), G.Q(Lg.x0, my, Lg.h + 1.6)], night ? "#9fb0c2" : "#eef3f6");
    G.poly([G.Q(Lg.x0, Lg.y0, Lg.h), G.Q(Lg.x1, Lg.y0, Lg.h), G.Q(Lg.x1, my, Lg.h + 1.6), G.Q(Lg.x0, my, Lg.h + 1.6)], night ? "#8394a6" : "#dfe7ec");
    if (lod !== "far") { const n = 8; for (let k = 0; k < n; k++) { const t0 = (k + 0.15) / n, t1 = (k + 0.85) / n, q = (t, h) => G.Q(Lg.x0 + (Lg.x1 - Lg.x0) * t, Lg.y1, h); G.poly([q(t0, 0.3), q(t1, 0.3), q(t1, Lg.h - 0.3), q(t0, Lg.h - 0.3)], night ? "#fdba74" : "#5b87a0"); } }
    if (lod === "near") { const [sx, sy] = G.Q(cx, Lg.y1, Lg.h + 0.3); c.font = `bold ${Math.max(6, Math.round(G.z * 0.28))}px "Fira Mono", monospace`; c.textAlign = "center"; c.fillStyle = night ? "#fde68a" : "#f5f5f4"; c.fillText("THE SUMMIT RESORT", sx, sy); }
  });
  if (lod === "far") return;
  for (const [x, y] of CANNONS) put(x, y, () => {
    const h = terrainH(x, y); vline(x, y, h, h + 0.8, "#6b7280", Math.max(1, G.z * 0.08));
    if (K.t) for (let k = 0; k < 6; k++) { const f = ((K.t * 0.8 + k / 6) % 1), [sx, sy] = G.Q(x + f * 2.2, y + f * 1.2, h + 0.8 + f * 0.6); c.fillStyle = `rgba(255,255,255,${(0.7 * (1 - f)).toFixed(2)})`; c.beginPath(); c.arc(sx, sy, G.z * (0.1 + f * 0.35), 0, Math.PI * 2); c.fill(); }
  }, 0.1);
  for (const L of LIFTS2) {
    for (let y = L.y0 - 0.4; y > L.y1; y -= 3.2) put(L.x, y, () => { const h = terrainH(L.x, y); vline(L.x, y, h, h + 1.45, "#6b7280", Math.max(1.5, G.z * 0.1)); const A = G.Q(L.x - L.gap - 0.1, y, h + 1.45), B = G.Q(L.x + L.gap + 0.1, y, h + 1.45); c.strokeStyle = "#6b7280"; c.lineWidth = Math.max(1, G.z * 0.08); c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke(); }, 0.1);
    for (const side of [-1, 1]) put(L.x + side * L.gap, (L.y0 + L.y1) / 2, () => { c.strokeStyle = "rgba(55,65,81,0.9)"; c.lineWidth = 1; c.beginPath(); for (let k = 0; k <= 24; k++) { const y = L.y0 + (L.y1 - L.y0) * k / 24, [a, b] = G.Q(L.x + side * L.gap, y, terrainH(L.x, y) + 1.4); if (k) c.lineTo(a, b); else c.moveTo(a, b); } c.stroke(); }, 0.4);
    for (let k = 0; k < liftChairs(L); k++) { const ch = liftChair(k, K.t || 0, L), h = terrainH(ch.x, ch.y) + 1.05; put(ch.x, ch.y, () => chairSeat(K, ch.x, ch.y, h), 0.025); }
  }
}
function preserve(K) {
  const { G, lod, put, vline, night } = K, c = G.ctx, P = PRESERVE, Lg = P.lodge;
  put((Lg.x0 + Lg.x1) / 2, (Lg.y0 + Lg.y1) / 2, () => {
    G.prism(rectPts(Lg.x0, Lg.y0, Lg.x1, Lg.y1), 0, Lg.h, "#6a4226", 1.12);
    const my = (Lg.y0 + Lg.y1) / 2;
    G.poly([G.Q(Lg.x0, Lg.y1, Lg.h), G.Q(Lg.x1, Lg.y1, Lg.h), G.Q(Lg.x1, my, Lg.h + 1.3), G.Q(Lg.x0, my, Lg.h + 1.3)], night ? "#9fb0c2" : "#eef3f6");
    if (lod !== "far") for (let k = 0; k < 4; k++) { const t0 = (k + 0.3) / 4, t1 = (k + 0.7) / 4, q = (t, h) => G.Q(Lg.x0 + (Lg.x1 - Lg.x0) * t, Lg.y1, h); G.poly([q(t0, 0.4), q(t1, 0.4), q(t1, 1.4), q(t0, 1.4)], night ? "#fdba74" : "#4a5a64"); }
    if (lod === "near") { const [sx, sy] = G.Q((Lg.x0 + Lg.x1) / 2, Lg.y1, Lg.h + 0.25); c.font = `bold ${Math.max(6, Math.round(G.z * 0.22))}px "Fira Mono", monospace`; c.textAlign = "center"; c.fillStyle = night ? "#fde68a" : "#f5f0e6"; c.fillText("THE HEIGHTS PRESERVE", sx, sy); }
  });
  if (lod === "far") return;
  // the trails: dashes of trodden snow, up to the lookout
  for (const pts of P.trails) put(pts[0][0], pts[0][1] - 4, () => {
    c.strokeStyle = night ? "rgba(120,90,60,0.6)" : "rgba(140,105,70,0.75)"; c.lineWidth = Math.max(1, G.z * 0.08); c.setLineDash([G.z * 0.3, G.z * 0.25]); c.beginPath();
    let first = true;
    for (let i = 1; i < pts.length; i++) for (let k = 0; k <= 8; k++) { const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k / 8, y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k / 8, [a, b] = G.Q(x, y, terrainH(x, y) + 0.02); if (first) { c.moveTo(a, b); first = false; } else c.lineTo(a, b); }
    c.stroke(); c.setLineDash([]);
  }, 0.01);
  // the lookout: a timber tower on the ridge, a flag
  const Lk = P.lookout;
  put(Lk.x, Lk.y, () => {
    const h = terrainH(Lk.x, Lk.y);
    for (const [dx, dy] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) vline(Lk.x + dx, Lk.y + dy, h, h + Lk.h, "#6a4226", Math.max(1, G.z * 0.08));
    G.prism(rectPts(Lk.x - 0.6, Lk.y - 0.6, Lk.x + 0.6, Lk.y + 0.6), h + Lk.h - 0.1, h + Lk.h, "#7a5232", 1.2);
    G.prism(rectPts(Lk.x - 0.7, Lk.y - 0.7, Lk.x + 0.7, Lk.y + 0.7), h + Lk.h + 0.9, h + Lk.h + 1.0, "#5a3e28", 1.3);
    vline(Lk.x, Lk.y, h + Lk.h + 1, h + Lk.h + 1.8, "#9ca3af", 1);
    const [fx, fy] = G.Q(Lk.x, Lk.y, h + Lk.h + 1.8); c.fillStyle = "#16a34a"; c.fillRect(fx, fy, G.z * 0.4, G.z * 0.22);
  }, 0.2);
}
function sign(K, S, rows, h = null) {
  const { G, lod } = K, c = G.ctx;
  const base = h ?? 0, m = [(S.a[0] + S.b[0]) / 2, (S.a[1] + S.b[1]) / 2];
  K.put(m[0], m[1], () => {
    for (const p of [S.a, S.b]) K.vline(p[0], p[1], base, base + S.h1, "#4b5563", Math.max(1, G.z * 0.07));
    G.poly([G.Q(S.a[0], S.a[1], base + S.h0), G.Q(S.b[0], S.b[1], base + S.h0), G.Q(S.b[0], S.b[1], base + S.h1), G.Q(S.a[0], S.a[1], base + S.h1)], "#e5e1d3");
    if (lod !== "near") return;
    let A = G.Q(S.a[0], S.a[1], base + S.h1 - 0.05), B = G.Q(S.b[0], S.b[1], base + S.h1 - 0.05);
    if (B[0] < A[0]) [A, B] = [B, A];
    const wpx = Math.hypot(B[0] - A[0], B[1] - A[1]), tall = Math.abs(G.Q(S.a[0], S.a[1], base + S.h0)[1] - A[1]);
    const fs = Math.min(Math.max(6, Math.round(G.z * 0.26)), Math.floor((wpx - 4) / Math.max(...rows.map(r => r.length)) / 0.62), Math.floor((tall - 3) / (rows.length * 1.2)));
    if (fs < 6) return;
    c.save(); c.font = `${fs}px "Fira Mono", monospace`; c.textBaseline = "top"; c.textAlign = "left";
    const ang = Math.atan2(B[1] - A[1], B[0] - A[0]), lh = fs * 1.15;
    c.translate(A[0], A[1]); c.rotate(ang);
    rows.forEach((t, i) => { c.fillStyle = i ? "#1f2937" : "#7f1d1d"; c.fillText(t, fs * 0.35 + (2 + i * lh) * Math.tan(ang), 2 + i * lh); });
    c.restore();
  }, 0.01);
}

// ---- THE MOUNTAIN: the slopes and the summit parcel, one terrain ------------------------------------------------
// The lot's own share of the terrain as quads back to front, shaded by which way they face;
// the pistes groomed; the pines; the lift and its chairs (the slopes only); walls of rock on
// the mountain's outer edges where they face the viewer.
function mountain(K, pid) {
  const { G, lod, put, nf, night } = K, c = G.ctx;
  const L = PLACES[pid].rect;
  const step = lod === "far" ? 3.25 : lod === "mid" ? 1.625 : 1.3;
  const nx = Math.max(1, Math.round(L.w / step)), ny = Math.max(1, Math.round(L.h / step)), sx = L.w / nx, sy = L.h / ny;
  const [ou, ov] = rot(0, 0, G.r), [eu, ev] = rot(1, 0, G.r), [fu, fv] = rot(0, 1, G.r);
  const toward = [(eu - ou) + (ev - ov), (fu - ou) + (fv - ov)];   // how +x and +y map onto the viewer's depth
  const snow = night ? "#8fa2b6" : SNOW, piste = night ? "#a3b5c8" : PISTE;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const x0 = L.x + i * sx, x1 = x0 + sx, y0 = L.y + j * sy, y1 = y0 + sy, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const h00 = terrainH(x0, y0), h10 = terrainH(x1, y0), h11 = terrainH(x1, y1), h01 = terrainH(x0, y1);
    const gx = ((h10 + h11) - (h00 + h01)) / (2 * sx), gy = ((h01 + h11) - (h00 + h10)) / (2 * sy);
    const lean = -(gx * toward[0] + gy * toward[1]);   // rising away from the viewer: faces them
    const f = Math.max(0.72, Math.min(1.12, 0.94 + lean * 0.28));
    const steep = Math.hypot(gx, gy) > 1.15;
    const groomed = pid === "slopes" ? offPiste(cx, cy) < 1.1 : K.face === "ski-resort" && distPolys(cx, cy, RUNS2) < 1.1;
    const col = steep ? ROCK : groomed ? piste : snow;
    put(cx, cy, () => G.poly([G.Q(x0, y0, h00), G.Q(x1, y0, h10), G.Q(x1, y1, h11), G.Q(x0, y1, h01)], shade(col, f * (night ? 0.9 : 1)), lod === "near" ? "rgba(120,140,160,0.12)" : null), -0.2);
  }
  // rock walls on the terrain's outer edges (west, east, north) where they face the viewer
  const edges = [];
  if (L.x === TERRAIN.x0) edges.push([[L.x, L.y + L.h], [L.x, L.y], [L.x + 1, L.y + L.h / 2]]);
  if (L.x + L.w >= TERRAIN.x1 - 1e-6) edges.push([[L.x + L.w, L.y], [L.x + L.w, L.y + L.h], [L.x + L.w - 1, L.y + L.h / 2]]);
  edges.push([[L.x, L.y], [L.x + L.w, L.y], [L.x + L.w / 2, L.y + 1]]);
  for (const [a, b, inside] of edges) {
    if (!G.facing(a, b, inside)) continue;
    const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) {
      const p = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], q = [a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n];
      put((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, () => G.poly([G.Q(p[0], p[1], terrainH(p[0] + 1e-6 * (inside[0] - p[0]), p[1] + 1e-6 * (inside[1] - p[1]))), G.Q(q[0], q[1], terrainH(q[0] + 1e-6 * (inside[0] - q[0]), q[1] + 1e-6 * (inside[1] - q[1]))), G.Q(q[0], q[1], 0), G.Q(p[0], p[1], 0)], shade("#5a6068", (G.facing(a, b, inside) || 1) * nf)), 0.3);
    }
  }
  // the pines
  const clearOf = parcelClear(K.face);
  if (lod !== "far") for (const [x, y] of PINES) {
    if (x < L.x || x >= L.x + L.w || (pid !== "slopes" && clearOf(x, y))) continue;
    put(x, y, () => {
      const h = terrainH(x, y), s = lod === "near" ? 1 : 0.8;
      for (let k = 0; k < 3; k++) {
        // the tiers' bases are level on screen at every quarter turn
        const hb = h + 0.15 + k * 0.4 * s, w = (0.5 - k * 0.12) * s * G.z * 1.4, [ax, ay] = G.Q(x, y, hb + 0.65 * s), [mx, my] = G.Q(x, y, hb);
        c.fillStyle = k === 2 && !night ? "#eef3f6" : shade("#1f4d2e", nf); c.beginPath(); c.moveTo(ax, ay); c.lineTo(mx - w, my); c.lineTo(mx + w, my); c.closePath(); c.fill();
      }
    }, 0.02);
  }
  if (pid !== "slopes") {
    // the summit parcel: vacant until session 002 decides it (a sign on the slope), then a site,
    // then the resort or the preserve
    if (K.face === "site") return site(K, "summit-lot");
    if (K.face === "ski-resort") return skiResort(K);
    if (K.face === "mountain-lodge") return preserve(K);
    if (lod !== "far") sign(K, SUMMIT.sign, parcelSign(K, "RESORT PARCEL 0xBE06"), terrainH(SUMMIT.sign.a[0], SUMMIT.sign.a[1]));
    return;
  }
  if (lod === "far") {
    // the lift as a line, the pistes as their colours
    put(LIFT.x, (LIFT.y0 + LIFT.y1) / 2, () => { const A = G.Q(LIFT.x, LIFT.y0, terrainH(LIFT.x, LIFT.y0) + 1.3), B = G.Q(LIFT.x, LIFT.y1, terrainH(LIFT.x, LIFT.y1) + 1.3); c.strokeStyle = "#374151"; c.lineWidth = 1; c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke(); }, 0.5);
    return;
  }
  // piste markers: a pole every few cells, the piste's colour on top
  for (const p of PISTES) for (let i = 1; i < p.pts.length; i++) {
    const [ax, ay] = p.pts[i - 1], [bx, by] = p.pts[i], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 2.6));
    for (let k = 0; k < n; k++) { const x = ax + (bx - ax) * k / n + 1.2, y = ay + (by - ay) * k / n; put(x, y, () => { const h = terrainH(x, y); K.vline(x, y, h, h + 0.55, "#1f2937", 1); const [mx, my] = G.Q(x, y, h + 0.55); c.fillStyle = p.col; c.fillRect(Math.round(mx) - 1, Math.round(my) - 2, 3, 3); }, 0.02); }
  }
  // the huts: the lift's base and top stations, the patrol hut (red cross)
  for (const [key, H] of Object.entries(SLOPE_HUTS)) put(H.x, H.y, () => {
    const h = terrainH(H.x, H.y);
    G.prism(rectPts(H.x - 0.6, H.y - 0.45, H.x + 0.6, H.y + 0.45), h, h + 0.8, key === "patrol" ? "#b91c1c" : "#7a5232", 1.15);
    G.prism(rectPts(H.x - 0.7, H.y - 0.55, H.x + 0.7, H.y + 0.55), h + 0.8, h + 0.9, "#e8eef2", 1.3);
    if (key === "patrol" && lod === "near") { const [mx, my] = G.Q(H.x, H.y + 0.46, h + 0.45); c.fillStyle = "#f5f5f5"; c.fillRect(mx - G.z * 0.08, my - G.z * 0.25, G.z * 0.16, G.z * 0.5); c.fillRect(mx - G.z * 0.25, my - G.z * 0.08, G.z * 0.5, G.z * 0.16); }
  }, 0.02);
  // the lift: pylons, the two cables, every chair (riders are drawn on theirs by the anchors)
  const Lf = LIFT, pyl = [];
  for (let y = Lf.y0 - 0.4; y > Lf.y1; y -= 3.2) pyl.push(y);
  pyl.push(Lf.y1 + 0.2);
  for (const y of pyl) put(Lf.x, y, () => {
    const h = terrainH(Lf.x, y);
    K.vline(Lf.x, y, h, h + 1.45, "#6b7280", Math.max(1.5, G.z * 0.1));
    const A = G.Q(Lf.x - Lf.gap - 0.1, y, h + 1.45), B = G.Q(Lf.x + Lf.gap + 0.1, y, h + 1.45);
    c.strokeStyle = "#6b7280"; c.lineWidth = Math.max(1, G.z * 0.08); c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
  }, 0.1);
  for (const side of [-1, 1]) put(Lf.x + side * Lf.gap, (Lf.y0 + Lf.y1) / 2, () => {
    c.strokeStyle = "rgba(55,65,81,0.9)"; c.lineWidth = 1; c.beginPath();
    for (let k = 0; k <= 24; k++) { const y = Lf.y0 + (Lf.y1 - Lf.y0) * k / 24, [a, b] = G.Q(Lf.x + side * Lf.gap, y, terrainH(Lf.x, y) + 1.4); if (k) c.lineTo(a, b); else c.moveTo(a, b); }
    c.stroke();
  }, 0.4);
  const n = liftChairs();
  for (let k = 0; k < n; k++) {
    const ch = liftChair(k, K.t || 0), h = terrainH(ch.x, ch.y) + 1.05;
    put(ch.x, ch.y, () => chairSeat(K, ch.x, ch.y, h), 0.025);
  }
}
// ---- THE FOOTHILLS (the master plan, 2026-09-30) --------------------------------------------------------------
// The buffer between the city and the mountain: forest floor, the trail winding through the pines,
// benches at the viewpoints, the ranger's post, the Alpine Line's cleared right of way.
function foothills(K) {
  const { G, lod, ground, put, nf, night } = K, c = G.ctx, F = FOOTHILLS, L = F.lot;
  ground(rectPts(L.x + 0.05, L.y + 0.05, L.x + L.w - 0.05, L.y + L.h - 0.05), shade(night ? "#16261c" : "#22382a", 1));
  // the right of way: gravel either side of the track
  ground(rectPts(F.spurX - F.clear + 0.3, L.y + 0.05, F.spurX + F.clear - 0.3, L.y + L.h - 0.05), shade("#3a3f38", nf), 0.011);
  if (lod === "far") {
    // the forest as a darker wash, every other pine a dark tuft on it
    ground(rectPts(L.x + 0.6, L.y + 0.6, F.spurX - F.clear, L.y + L.h - 0.6), shade("#183322", nf), 0.012);
    ground(rectPts(F.spurX + F.clear, L.y + 0.6, L.x + L.w - 0.6, L.y + L.h - 0.6), shade("#183322", nf), 0.012);
    c.fillStyle = shade("#2c5e3a", nf);
    F.trees.forEach(([x, y, s], i) => { if (i % 2) return; const [a, b] = G.Q(x, y, 0.4 * s), w = Math.max(1.5, G.z * 0.45 * s); c.beginPath(); c.moveTo(a, b - w * 1.4); c.lineTo(a - w, b + w * 0.4); c.lineTo(a + w, b + w * 0.4); c.closePath(); c.fill(); });
    return;
  }
  // the trail: a packed-earth band along its line
  c.strokeStyle = shade("#7a6a4a", nf); c.lineWidth = Math.max(2, G.z * 0.55); c.lineJoin = "round"; c.beginPath();
  F.trail.forEach(([x, y], i) => { const [a, b] = G.Q(x, y, 0.012); if (i) c.lineTo(a, b); else c.moveTo(a, b); });
  c.stroke();
  // the pines, tall and short, in the painter's order with the walkers
  for (const [x, y, s] of F.trees) put(x, y, () => {
    const s1 = lod === "near" ? s : s * 0.9;
    K.vline(x, y, 0, 0.25, shade("#4a3222", nf), Math.max(1, G.z * 0.08));
    for (let k = 0; k < 3; k++) {
      const hb = 0.18 + k * 0.42 * s1, w = (0.5 - k * 0.12) * s1 * G.z * 1.35, [ax, ay] = G.Q(x, y, hb + 0.7 * s1), [mx, my] = G.Q(x, y, hb);
      c.fillStyle = shade(k === 2 ? "#2f6b3e" : k === 1 ? "#255a34" : "#1f4d2e", nf); c.beginPath(); c.moveTo(ax, ay); c.lineTo(mx - w, my); c.lineTo(mx + w, my); c.closePath(); c.fill();
    }
  }, 0.01);
  // benches at the viewpoints, the ranger's post (a timber hut, its sign)
  for (const [bx, by] of F.benches) put(bx, by, () => G.prism(rectPts(bx - 0.6, by - 0.12, bx + 0.6, by + 0.12), 0, 0.18, "#6a4a30", 1.2), 0.005);
  const P = F.post;
  put(P.x, P.y, () => {
    G.prism(rectPts(P.x - 0.7, P.y - 0.5, P.x + 0.7, P.y + 0.5), 0, 0.85, "#7a5232", 1.15);
    G.prism(rectPts(P.x - 0.85, P.y - 0.65, P.x + 0.85, P.y + 0.65), 0.85, 0.95, "#3f5a3a", 1.3);
    if (lod === "near") { const [mx, my] = G.Q(P.x, P.y + 0.52, 0.6); c.font = `bold ${Math.max(6, Math.round(G.z * 0.3))}px 'Fira Mono', monospace`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#fde68a"; c.fillText("RANGER", mx, my); }
  }, 0.02);
}

// Distance from a point to the nearest of some polylines.
function distPolys(x, y, polys) {
  let best = Infinity;
  for (const pts of polys) for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
    best = Math.min(best, Math.hypot(x - ax - vx * t, y - ay - vy * t));
  }
  return best;
}
// Where the pines are cleared on the summit parcel for what is built there.
const inBox = (x, y, b, m = 0) => x > b.x0 - m && x < b.x1 + m && y > b.y0 - m && y < b.y1 + m;
function parcelClear(face) {
  if (face === "ski-resort") return (x, y) => distPolys(x, y, RUNS2) < 1.6 || inBox(x, y, SKI_LODGE, 1) || LIFTS2.some(L => Math.abs(x - L.x) < 1.2) || CANNONS.some(([cx, cy]) => Math.hypot(x - cx, y - cy) < 1);
  if (face === "mountain-lodge") return (x, y) => inBox(x, y, PRESERVE.lodge, 1) || Math.hypot(x - PRESERVE.lookout.x, y - PRESERVE.lookout.y) < 2.4;
  if (face === "site") return (x, y) => inBox(x, y, PARCEL_SITE["summit-lot"].pit, 1) || Math.hypot(x - PARCEL_SITE["summit-lot"].crane.x, y - PARCEL_SITE["summit-lot"].crane.y) < 1;
  return () => false;
}
function chairSeat(K, x, y, h) {
  const { G } = K, c = G.ctx;
  const A = G.Q(x, y, h + 0.35), B = G.Q(x, y, h + 0.02);
  c.strokeStyle = "#374151"; c.lineWidth = 1; c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
  G.poly([G.Q(x - 0.28, y - 0.12, h), G.Q(x + 0.28, y - 0.12, h), G.Q(x + 0.28, y + 0.12, h), G.Q(x - 0.28, y + 0.12, h)], "#1f2937");
}
