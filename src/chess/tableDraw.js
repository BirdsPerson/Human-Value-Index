// The stone chess tables in the iso view (park.js places them and runs their games): a stone top
// on a pedestal with the board inlaid, two stone stools, the two players on them doing the game
// (the one to move reaches over the board with a piece and taps the clock, the other strokes a
// chin), the kibitzers standing round, the clock at the table's edge. When a game ends the winner
// talks it through and the loser holds a head; a draw is two shrugs.
//
// Level of detail: far = a grey square and two dots; mid = the table, the stools, small sprites;
// near = the inlaid squares, the pieces left on the board, the clock, everyone rigged.
// Tap a table: #chess?vs=<the stronger figure at it> (sit across them). Tap a player or a
// kibitzer who is a figure: their file, as anywhere in the city. The regulars never open.
//
// G: {ctx, Q(x, y, h) -> [sx, sy], prism(foot, h0, h1, base, topF), poly(pts, fill), z, r, t,
//     hits, w, h, lookup?(slug)}. put(x, y, draw, bias): the lot's painter list when it has one
//     (parkDraw.js); without one the tables sort and draw themselves (the open lots in CityIso).
import { rot, STOREY } from "../city/iso.js";
import { SPRITE_W, SPRITE_H, statureOf } from "../sprites.js";
import { sheetFor, miniFor } from "../city/spriteBank.js";
import { drawPose, phaseOf } from "../city/poses.js";
import { projected } from "../city/venueDraw.js";
import { TABLES_BY_LOT, gameAt, pairingsAt, tableGo, TOP_R } from "./park.js";
import { LADDER, regular } from "./roster.js";

const STONE = "#8d949c", STONE_D = "#6b737c", SQ_L = "#d8d2c2", SQ_D = "#4b5563";
const rectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
function h01(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

// A player as a subject to draw: a figure by projection (the census's record when the view holds
// it), a regular as a citizen with its own avatar (never opens).
const REGS = new Map();
function subjectOf(p, lookup) {
  if (p.kind === "regular") {
    let s = REGS.get(p.key);
    if (!s) { const r = regular(p.key); s = { slug: p.key, name: r.name, kind: "citizen", score: 500, tier: "TOLERATED GENERALIST", avatar: { kind: "procedural", spec: r.spec }, regular: true }; REGS.set(p.key, s); }
    return s;
  }
  return projected(p.key, p.name, lookup);
}

// The kibitzers at each table this slot: ladder players who are not at a board, a few per table
// (more round a chess player on file), hashed per slot. -> Map tableId -> [ladder entries]
const KIB_MEMO = new Map();
function kibitzers(day, slot, tables) {
  const id = `${day}|${slot}`;
  if (KIB_MEMO.has(id)) return KIB_MEMO.get(id);
  const games = pairingsAt(day, slot), busy = new Set(games.flatMap(g => [g.white, g.black]));
  const free = LADDER.filter(p => !busy.has(p.key)).map(p => ({ p, k: h01(`kib|${day}|${slot}|${p.key}`) })).sort((a, b) => a.k - b.k).map(x => x.p);
  const out = new Map();
  let i = 0;
  for (const t of tables) {
    const g = games.find(x => x.table === t.id);
    const star = g && [g.white, g.black].some(k => LADDER.find(p => p.key === k)?.chess);
    const n = Math.min(t.kib.length, (star ? 2 : 1) + Math.floor(h01(`kibn|${day}|${slot}|${t.id}`) * 2));
    out.set(t.id, free.slice(i, i + n));
    i += n;
  }
  KIB_MEMO.set(id, out);
  if (KIB_MEMO.size > 30) KIB_MEMO.delete(KIB_MEMO.keys().next().value);
  return out;
}
const ALL_TABLES = Object.values(TABLES_BY_LOT).flat();

// Draw the tables on one lot. -> nothing (hits pushed onto G.hits)
export function drawChessTables(G, lotId, lod, mt, put = null) {
  const tables = TABLES_BY_LOT[lotId];
  if (!tables) return;
  const own = !put ? [] : null;
  const add = put || ((x, y, draw, bias = 0) => { const [u, v] = rot(x, y, G.r); own.push({ k: u + v + bias, draw }); });
  const day = Math.floor(mt / 24) + 1;
  const late = [];
  G = { ...G, mt, late };
  for (const t of tables) {
    const g = gameAt(t.id, mt);
    const kib = g ? kibitzers(day, g.slot, ALL_TABLES).get(t.id) || [] : [];
    tableItem(G, t, g, lod, add);
    kib.forEach((p, i) => { const [x, y] = t.kib[i]; add(x, y, () => person(G, p, x, y, t, g, lod, false, i), 0.02); });
  }
  add(tables[0].x, tables[0].y, () => { for (const h of late) G.hits?.push(h); late.length = 0; }, 1e6);
  if (own) { own.sort((a, b) => a.k - b.k); for (const it of own) it.draw(); }
}

function tableItem(G, t, g, lod, add) {
  const [x, y] = [t.x, t.y];
  add(x, y, () => {
    const { ctx, Q } = G;
    const [sx, sy] = Q(x, y, 0.4);
    if (sx < -60 || sx > G.w + 60 || sy < -80 || sy > G.h + 60) return;
    if (lod === "far") {
      ctx.fillStyle = STONE; const s = Math.max(2, G.z * 0.5); ctx.fillRect(Math.round(sx - s / 2), Math.round(sy - s / 4), Math.round(s), Math.round(s / 2));
      if (g) for (const [px, py] of t.seats) { const [a, b] = Q(px, py, 0.2); ctx.fillStyle = "#d6d3d1"; ctx.fillRect(Math.round(a) - 1, Math.round(b) - 2, 2, 2); }
      return;
    }
    // which seat is further from the viewer: its stool and player go first, the table, then the nearer
    const d = t.seats.map(([px, py]) => { const [u, v] = rot(px, py, G.r); return u + v; });
    const order = d[0] <= d[1] ? [0, 1] : [1, 0];
    const seat = (i) => {
      const [px, py] = t.seats[i];
      G.prism(rectPts(px - 0.17, py - 0.17, px + 0.17, py + 0.17), 0, 0.19, STONE_D, 1.25);
      if (g) person(G, i === 0 ? g.white : g.black, px, py, t, g, lod, true, i);
    };
    seat(order[0]);
    // the table: a pedestal, the stone top, the board inlaid
    G.prism(rectPts(x - 0.14, y - 0.14, x + 0.14, y + 0.14), 0, 0.33, STONE_D, 1.2);
    G.prism(rectPts(x - TOP_R, y - TOP_R, x + TOP_R, y + TOP_R), 0.33, 0.38, STONE, 1.3);
    const n = lod === "near" ? 8 : 2, s0 = 0.33, step = (2 * s0) / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x0 = x - s0 + i * step, y0 = y - s0 + j * step;
      G.poly(rectPts(x0, y0, x0 + step, y0 + step).map(p => Q(p[0], p[1], 0.382)), (i + j) % 2 ? SQ_D : SQ_L);
    }
    if (lod === "near") {
      if (g) pieces(G, t, g);
      // the clock at the table's edge, between the players' right hands
      const cx = x + TOP_R - 0.04, cy = y;
      G.prism(rectPts(cx - 0.04, cy - 0.09, cx + 0.04, cy + 0.09), 0.38, 0.44, "#1f2937", 1.3);
      const tapWhite = g && g.phase === "play" && turnOf(G.t, t) === 0;
      for (const [k, dy] of [[0, -0.05], [1, 0.05]]) { const [bx, by] = Q(cx, cy + dy, 0.455); ctx.fillStyle = (k === 0) === tapWhite ? "#fbbf24" : "#9ca3af"; ctx.fillRect(Math.round(bx) - 1, Math.round(by) - 1, Math.max(2, Math.round(G.z * 0.06)), Math.max(1, Math.round(G.z * 0.04))); }
    }
    // tap the table: sit across the stronger figure at it
    const top = rectPts(x - TOP_R, y - TOP_R, x + TOP_R, y + TOP_R).map(p => Q(p[0], p[1], 0.4));
    const xs = top.map(p => p[0]), ys = top.map(p => p[1]);
    // the board answers a tap before whoever sits or stands over it (pushed last, after every person)
    G.late?.push({ kind: "chess", table: t.id, go: tableGo(t, G.mt ?? 0).go, box: [Math.min(...xs), Math.min(...ys) - G.z * 0.1, Math.max(...xs), Math.max(...ys)] });
    seat(order[1]);
  });
}

// the pieces still on the board: fewer as the game goes on, scattered by the game's hash
function pieces(G, t, g) {
  const { ctx, Q } = G;
  const left = Math.max(6, 32 - Math.floor(g.move * 0.42));
  const s0 = 0.33, step = (2 * s0) / 8, px = Math.max(1, Math.round(G.z * 0.05));
  const used = new Set();
  for (let k = 0; k < left; k++) {
    let sq = Math.floor(h01(`pc|${g.day}|${g.slot}|${t.id}|${k}`) * 64);
    // the opening's shape early on: the back ranks; later, anywhere
    if (g.move < 6) sq = k < 16 ? (k < 8 ? k : 48 + (k - 8)) : (k < 24 ? 8 + (k - 16) : 40 + (k - 24));
    while (used.has(sq)) sq = (sq + 7) % 64;
    used.add(sq);
    const i = sq % 8, j = Math.floor(sq / 8), white = g.move < 6 ? j >= 4 : k % 2 === 0;
    const [bx, by] = Q(t.x - s0 + (i + 0.5) * step, t.y - s0 + (j + 0.5) * step, 0.39);
    ctx.fillStyle = white ? "#f5f5f4" : "#111827";
    ctx.fillRect(Math.round(bx) - px, Math.round(by) - 2 * px, 2 * px, 2 * px);
  }
}

// whose move it is on screen: White for five seconds, then Black (a table's own offset)
const turnOf = (t, table) => (t > 0 ? Math.floor((t + h01(table.id) * 10) / 5) % 2 : 0);
function animOf(G, t, g, seated, i, key) {
  const now = G.t;
  if (!g) return null;
  if (!seated) {   // a kibitzer: strokes the chin, points at the board now and then, claps a result
    if (g.phase === "over") return h01(`kc|${key}|${g.slot}`) < 0.5 ? "clap" : "shrug";
    const b = now > 0 ? Math.floor((now + h01(key) * 13) / 6.5) : 0;
    const r = h01(`k|${key}|${b}`);
    return r < 0.45 ? "chinstroke" : r < 0.6 ? "point" : null;
  }
  if (g.phase === "over") {
    if (g.result === "1/2-1/2") return "shrug";
    const won = (g.result === "1-0") === (i === 0);
    return won ? "sittalk" : "facepalm";
  }
  const mover = turnOf(now, t) === i;
  if (!mover) return h01(`th|${key}|${Math.floor(now / 10)}`) < 0.6 ? "chinstroke" : null;
  const u = now > 0 ? (now + h01(t.id) * 10) % 5 : 0;
  return u < 2.67 ? { anim: "chessmove", t: u + 0.001 } : u < 4.17 ? { anim: "clocktap", t: u - 2.67 + 0.001 } : null;
}

function person(G, p, x, y, t, g, lod, seated, i) {
  const { ctx, Q } = G;
  const s = subjectOf(p, G.lookup);
  const [sx, sy] = Q(x, y, 0);
  if (sx < -40 || sx > G.w + 40 || sy < -70 || sy > G.h + 40) return;
  if (lod === "far") { ctx.fillStyle = "#d6d3d1"; ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 2, 2, 2); return; }
  const hh0 = G.z * STOREY * 0.95, k = statureOf(s), hpx = hh0 * k;
  const opens = !s.regular && !s.crowd;
  if (lod === "mid" || hpx < 18) {
    const m = miniFor(s), sc = hpx / (SPRITE_H / 2), top = seated ? sy - hpx * 0.78 : sy - hpx;
    try { ctx.drawImage(m, Math.round(sx - (SPRITE_W / 4) * sc), Math.round(top), Math.round((SPRITE_W / 2) * sc), Math.round(hpx * (seated ? 0.78 : 1))); } catch { /* not decoded yet */ }
    if (opens) G.hits?.push({ kind: "p", s, box: [sx - hpx * 0.3, sy - hpx, sx + hpx * 0.3, sy] });
    return;
  }
  // face the board (a kibitzer too)
  const [tx] = Q(t.x, t.y, 0);
  const face = tx > sx + 0.5 ? 1 : -1;
  const a = animOf(G, t, g, seated, i, p.key);
  const anim = a && typeof a === "object" ? a.anim : a;
  const tt = a && typeof a === "object" ? (G.t > 0 ? a.t : 0) : G.t;
  const ph = a && typeof a === "object" ? 0 : phaseOf(p.key);   // a move runs from its first frame
  const box = drawPose(ctx, sheetFor(s), { kind: seated ? "seat" : "stand", act: seated ? "sit" : "watch", face, anim }, seated ? "sit" : "watch", sx, sy, hh0, tt, ph, k);
  if (opens && box) G.hits?.push({ kind: "p", s, box });
}
