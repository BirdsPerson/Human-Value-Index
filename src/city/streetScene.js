// The STREET view's renderer: the Substrate at street level, drawn from a camera {x, y, yaw, h}
// (streetKit.js). Street.jsx drives it with its drone (the auto-tour, keys, the on-screen pad);
// DRIVE YOURSELF's third-person view (controlIso.js) drives it from behind your own citizen.
// makeStreetScene(ctx) keeps the census tally and the park seats between frames; its render()
// paints one frame and returns what can be tapped: {people, buildings}.

import { DISTRICTS, BUILDING, BUILDINGS, clockAt, whereOf, roomIn, gameAt } from "./simApi.js";
import { sheetFor, miniFor } from "./spriteBank.js";
import { SPRITE_W, SPRITE_H, statureOf } from "../sprites.js";
import { trains, carArc, STATIONS as ST3D } from "./city3d.js";
import { lodFor, DECK } from "./iso.js";
import { massingOf } from "./archGeo.js";
import { drawBody, drawYardProp, drawArchGround } from "./archDraw.js";
import { PARK_LOTS, PARK_PLACES } from "./parkGeo.js";
import { drawParkLot } from "./parkDraw.js";
import { DECK_HW, CAR_HW } from "./loopGeo.js";
import { streetKitG, SH, shade } from "./streetArch.js";
import { riverShown, MAIN, BRIDGES } from "./river.js";   // THE ATTRITION: the water on the ground, from its day
import {
  PERSON_H, NEAR, FAR, FOV, STREET_BUILDINGS, toCam, project, viewFor, clipNear, clipSeg, inFov,
  RING_L, ringAt, ringTangent, nearestArc, arcDelta, onStreet, heightOf, BOUNDS,
} from "./streetKit.js";

// The city's palette (CityIso.jsx): district ground, open lots, the Loop's concrete and steel.
const GROUND = { arts: "#141224", campus: "#0f1c14", finance: "#0e1820", strip: "#1c0e14", arena: "#141c10", hq: "#10221a", archive: "#16160f", commons: "#121a0f", works: "#1c0e0a", sprawl: "#131316" };
const LOT_FILL = { "the-green": "#123a18", "the-allotment": "#1a2e12", "the-street": "#20241f", "the-plaza": "#24261f" };
const LOOP = {
  deck: "#343f39", pier: "#2e3833", parapet: "#48554e", rail: "#a3b8ae", cyan: "#22d3ee", cyanHi: "#67e8f9",
  body: "#a9bab1", roof: "#cfdcd5", stripe: "#22d3ee", door: "#5d6b64", glassDay: "#3f6f78", glassNight: "#fcd34d", sil: "#0c1512",
  plat: "#4a5650", platLit: "#5b6c63", edge: "#fbbf24", canopy: "#2a3a32", stair: "#4a554f",
};
const DECK_T = 0.16, CAR_H = 0.62, CANOPY = DECK + 1.1;   // storeys, as the city draws them
const nightAt = (hour) => hour >= 19 || hour < 6.5;
const PARK_PLACE_SET = new Set(PARK_PLACES);
const CAP = Object.fromEntries(BUILDINGS.map(b => [b.id, Math.max(1, b.floors.reduce((n, f) => n + (f.cap || 0), 0))]));
const BID = new Map();
const bidOf = (id) => { let v = BID.get(id); if (v == null) { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } v = h >>> 0; BID.set(id, v); } return v; };

const C = { bg: "#0a0f0a", ghost: "#2d5040", line: "#1f4a2c", mute: "#4b7c5e", dim: "#86c9a0", fg: "#c8f5d8", accent: "#4ade80", warn: "#fbbf24", harm: "#f87171", panel: "#0d140d" };
const FONT = "'Fira Mono', ui-monospace, Menlo, monospace";

export function tokens() {
  try {
    const cs = getComputedStyle(document.documentElement);
    for (const k of Object.keys(C)) { const v = cs.getPropertyValue(`--${k === "dim" ? "fg-dim" : k === "mute" ? "fg-mute" : k === "ghost" ? "fg-ghost" : k}`).trim(); if (v) C[k] = v; }
  } catch { /* defaults */ }
}
const hash01 = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };

// far: the draw distance (a phone's third person draws less); pitch: px the horizon moves down
// (or feet: the fraction of the height the avatar's feet stand at, which sets it);
// me: {x, y, z, s, moving, face, show} the driven avatar, drawn among the rest (and the
// scheduled self left out).
export function makeStreetScene(ctx) {
  let occ = { v: -1, byB: {}, park: new Map(), riders: new Map() };
  const parkSeats = new Map();
  // The census, counted the city's way (simApi.roomIn): lit windows per building, who is
  // on each ground (parkDraw poses them), riders per car (silhouettes in the windows).
  function readCensus(census) {
    if (occ.v === census.v) return;
    const byB = {}, park = new Map(PARK_PLACES.map(id => [id, []])), riders = new Map();
    for (const { s, w } of census.list || []) {
      if (!w) continue;
      if (w.sub === "riding" && w.trainId) { const k = `${w.trainId}|${w.car}`; riders.set(k, (riders.get(k) || 0) + 1); }
      const r = roomIn(w, s);
      if (!r) continue;
      byB[r.buildingId] = (byB[r.buildingId] || 0) + 1;
      if (r.mode === "here" && park.has(w.placeId)) park.get(w.placeId).push({ s, w });
    }
    occ = { v: census.v, byB, park, riders };
  }
  const ST_ARC = new Map(ST3D.map(st => [st, st.s ?? nearestArc(st.x, st.y)]));
  let trainCache = { mt: -1, list: [] };
  const trainList = (mt) => { if (trainCache.mt !== mt) trainCache = { mt, list: trains(mt) }; return trainCache.list; };
  const trainIn = (st, mt) => trainList(mt).some(tr => Math.abs(arcDelta(tr.s ?? 0, ST_ARC.get(st))) < 4);

  return function render({ c, W, H, dpr, census, now, reduced = false, far = FAR, pitch = 0, feet = 0, me = null }) {
    // feet (third person): the horizon drops (or rises) so the avatar's feet sit there on screen
    if (me && feet) { const v0 = viewFor(W, H), d = Math.max(0.5, Math.hypot(me.x - c.x, me.y - c.y)); pitch = Math.round(H * feet - v0.horizon - ((c.h - (me.z || 0)) / d) * v0.focal); }
    const view = viewFor(W, H, pitch);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;

    const mt = census.mt != null ? census.mt + (performance.now() - census.t) / 60000 : clockAt(Date.now()).mt;
    const hour = ((mt % 24) + 24) % 24, night = nightAt(hour);
    const t = reduced ? 0 : now / 1000;
    readCensus(census);
    const G = streetKitG(ctx, c, view, { t, hits: [] });
    const Q = G.Q;
    const eyeZ = c.h;

    // ---- sky and ground: the city's dark ground under a machine sky ----------------
    const hz = Math.max(0, Math.min(H, view.horizon));
    const sky = ctx.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, night ? "#020403" : "#050b08"); sky.addColorStop(1, night ? "#0a1512" : "#17281f");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hz);
    ctx.fillStyle = night ? "#07090a" : "#101413"; ctx.fillRect(0, hz, W, H - hz);
    // flat ground: clipped at the near plane (a street runs under your feet)
    const flat = (x0, y0, x1, y1, fill, stroke) => {
      const cp = clipNear([toCam(c, x0, y0, 0), toCam(c, x1, y0, 0), toCam(c, x1, y1, 0), toCam(c, x0, y1, 0)]);
      if (cp.length < 3) return;
      ctx.beginPath();
      cp.forEach((p, i) => { const q = project(p, view); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
    };
    const gk = night ? 1 : 1.45;
    for (const d of DISTRICTS) {
      const r = d.rect;
      if (Math.max(r.x - c.x, 0, c.x - r.x - r.w) > far || Math.max(r.y - c.y, 0, c.y - r.y - r.h) > far) continue;
      flat(r.x - 0.35, r.y - 0.35, r.x + r.w + 0.35, r.y + r.h + 0.35, night ? "#1c211f" : "#2a302d");   // the kerb and pavement
      flat(r.x, r.y, r.x + r.w, r.y + r.h, shade(GROUND[d.id] || "#101410", gk), "rgba(74,222,128,0.14)");
    }
    // a faint street grid, as in the city
    ctx.lineWidth = 1;
    const seg = (x0, y0, x1, y1, color) => {
      const s = clipSeg(toCam(c, x0, y0, 0), toCam(c, x1, y1, 0));
      if (!s) return;
      const p = project(s[0], view), q = project(s[1], view);
      if (!p || !q) return;
      ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    };
    const GS = 4;
    const gx0 = Math.max(BOUNDS.x0, Math.floor((c.x - far) / GS) * GS), gx1 = Math.min(BOUNDS.x1, c.x + far);
    const gy0 = Math.max(BOUNDS.y0, Math.floor((c.y - far) / GS) * GS), gy1 = Math.min(BOUNDS.y1, c.y + far);
    for (let x = gx0; x <= gx1; x += GS) seg(x, gy0, x, gy1, "rgba(74,222,128,0.05)");
    for (let y = gy0; y <= gy1; y += GS) seg(gx0, y, gx1, y, "rgba(74,222,128,0.05)");
    // THE ATTRITION: its water near the eye (a flat band down the gaps), its road and foot bridges' decks
    if (riverShown(mt)) {
      const polyFlat = (pts, fill) => {
        const cp = clipNear(pts.map(([x, y]) => toCam(c, x, y, 0.004)));
        if (cp.length < 3) return;
        ctx.beginPath(); cp.forEach((p, i) => { const q = project(p, view); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }); ctx.closePath();
        ctx.fillStyle = fill; ctx.fill();
      };
      const P = MAIN.pts, water = night ? "#173a52" : "#2f7397";
      for (let i = 1; i < P.length; i++) {
        const a = P[i - 1], b = P[i];
        if (Math.hypot(a.x - c.x, a.y - c.y) > far + 4 || Math.hypot(b.x - a.x, b.y - a.y) > 4) continue;
        const q = (p, k) => [p.x - p.dy * p.w / 2 * k, p.y + p.dx * p.w / 2 * k];
        polyFlat([q(a, 1.06), q(b, 1.06), q(b, -1.06), q(a, -1.06)], water);
      }
      for (const B of BRIDGES) {
        if (B.kind === "rail" || B.kind === "boardwalk" || Math.hypot(B.x - c.x, B.y - c.y) > far) continue;
        const ax = B.dx * B.deck / 2, ay = B.dy * B.deck / 2, nx = -B.dy * B.span / 2, ny = B.dx * B.span / 2;
        polyFlat([[B.x - ax + nx, B.y - ay + ny], [B.x + ax + nx, B.y + ay + ny], [B.x + ax - nx, B.y + ay - ny], [B.x - ax - nx, B.y - ay - ny]], night ? "#3a3e42" : "#5d6267");
      }
    }

    // ---- what stands: gather, then paint far to near --------------------------------
    const tanH = Math.tan(FOV / 2) + 0.2;
    const nearD = (x0, y0, x1, y1) => Math.hypot(Math.max(x0 - c.x, 0, c.x - x1), Math.max(y0 - c.y, 0, c.y - y1));
    const seen = (x0, y0, x1, y1) => {
      // any corner (or the eye inside the footprint) within the horizontal field of view
      if (c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1) return true;
      let front = false, left = false, right = false;
      for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) {
        const p = toCam(c, x, y, 0);
        if (p.f <= NEAR) { if (p.s < 0) left = true; else right = true; continue; }
        front = true;
        const k = p.s / p.f;
        if (Math.abs(k) < tanH) return true;
        if (k < 0) left = true; else right = true;
      }
      return front && left && right;
    };
    const items = [], ground = [];
    const env = { lod: "near", night, hour, t };
    for (const b of STREET_BUILDINGS) {
      const sb = BUILDING[b.id], m = sb ? massingOf(sb) : null, r = b.rect;
      const d = nearD(r.x, r.y, r.x + r.w, r.y + r.h);
      if (d > far || !seen(r.x, r.y, r.x + r.w, r.y + r.h)) continue;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      if (PARK_LOTS[b.id]) { items.push({ k: "park", d, b, cx, cy }); continue; }
      if (!m) { ground.push({ k: "lot", b }); items.push({ k: "tag", d, b, cx, cy, top: 0.3 }); continue; }
      if (m.ground.length) ground.push({ k: "arch", b, m, cx, cy });
      const bx = m.box;
      items.push({ k: "arch", d: nearD(bx.x0, bx.y0, bx.x1, bx.y1), b, sb, m, cx: (bx.x0 + bx.x1) / 2, cy: (bx.y0 + bx.y1) / 2 });
      for (const p of m.yard) {
        const dd = nearD(p.x0, p.y0, p.x1, p.y1);
        if (dd < 45) items.push({ k: "yard", d: dd, p, m });
      }
    }
    // the Loop's deck, in short pieces so it sorts against the buildings
    for (let s = 0; s < RING_L; s += 2.5) {
      const a = ringAt(s), e = ringAt(s + 2.5);
      const dd = nearD(Math.min(a.x, e.x), Math.min(a.y, e.y), Math.max(a.x, e.x), Math.max(a.y, e.y));
      if (dd > far || !seen(Math.min(a.x, e.x) - 0.7, Math.min(a.y, e.y) - 0.7, Math.max(a.x, e.x) + 0.7, Math.max(a.y, e.y) + 0.7)) continue;
      items.push({ k: "rail", d: dd, a, e, pier: Math.round(s / 2.5) % 2 === 0 });
    }
    for (const st of ST3D) { const dd = Math.hypot(st.x - c.x, st.y - c.y); if (dd < far) items.push({ k: "st", d: Math.max(0, dd - 3), st }); }
    for (const tr of trainList(mt)) for (let k = 0; k < tr.cars; k++) {
      const sArc = carArc(tr, k), p = ringAt(sArc);
      const dd = Math.hypot(p.x - c.x, p.y - c.y);
      if (dd < far) items.push({ k: "car", d: Math.max(0, dd - 1), p, s: sArc, lead: k === 0, last: k === tr.cars - 1, t: tr, car: k });
    }
    // people on the street and the platforms (the grounds draw their own, posed)
    const list = census.list || [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!onStreet(e.w) || PARK_PLACE_SET.has(e.w.placeId) || e.w.sub === "riding") continue;
      if (me && e.s.you) continue;   // DRIVE YOURSELF: the scheduled self steps out while you drive it
      if (Math.abs(e.w.x - c.x) > far || Math.abs(e.w.y - c.y) > far) continue;
      const w = e.w.activity === "commute" && Math.hypot(e.w.x - c.x, e.w.y - c.y) < 40 ? whereOf(e.s, mt) : e.w;
      if (!w || !onStreet(w) || w.sub === "riding") continue;
      const dd = Math.hypot(w.x - c.x, w.y - c.y);
      if (dd > far) continue;
      items.push({ k: "p", d: dd, s: e.s, w });
    }
    for (const d of DISTRICTS) { const x = d.rect.x + d.rect.w / 2, y = d.rect.y - 0.6; const dd = Math.hypot(x - c.x, y - c.y); if (dd < far) items.push({ k: "sign", d: dd, x, y, text: d.name }); }
    items.sort((a, b) => b.d - a.d);

    // ---- the ground's own dressing: lots, courts, plazas, lawns -------------------------
    for (const g of ground) {
      if (g.k === "lot") {
        const r = g.b.rect;
        flat(r.x, r.y, r.x + r.w, r.y + r.h, shade(LOT_FILL[g.b.id] || "#20241f", night ? 1 : 1.3), "rgba(74,222,128,0.3)");
      } else drawArchGround(G.aim(g.cx, g.cy), g.m, { ...env, lod: "near" });
    }

    const hp = [], hb = [];
    const fade = (d) => Math.max(0, Math.min(1, (far - d) / 14));
    for (const it of items) {
      const a = fade(it.d);
      if (a <= 0.02) continue;
      ctx.globalAlpha = a;
      if (it.k === "arch") drawArch(it);
      else if (it.k === "yard") drawYardProp(G.aim(it.p.x, it.p.y), it.p, { ...env, lod: lodFor(G.z * 0.8) });
      else if (it.k === "park") drawPark(it);
      else if (it.k === "rail") drawRail(it);
      else if (it.k === "st") drawStation(it.st);
      else if (it.k === "car") drawCar(it);
      else if (it.k === "p") drawPerson(it, now, hp);
      else if (it.k === "tag") hb.push({ b: it.b, box: hullOf(it.b.rect.x, it.b.rect.y, it.b.rect.x + it.b.rect.w, it.b.rect.y + it.b.rect.h, 0.3), d: it.d });
    }
    ctx.globalAlpha = 1;
    if (me && me.show !== false) drawMe();   // DRIVE YOURSELF, third person: your citizen, over whatever stands nearer
    for (const h of G.hits) if (h.kind === "p") hp.push({ s: h.s, x: h.box[0], y: h.box[1], w2: h.box[2] - h.box[0], h: h.box[3] - h.box[1], f: 1 });

    // ---- labels on top, nearest first, never over each other (the city's label style) ----
    const taken = [];
    ctx.textBaseline = "bottom"; ctx.textAlign = "center";
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      let pos = null, text = null, px = 0, kind = "b";
      if (it.k === "arch" || it.k === "tag" || it.k === "park") {
        const top = it.k === "arch" ? it.m.rise * SH : it.k === "park" ? 1.2 * SH : 0.6 * SH;
        const g = PARK_LOTS[it.b.id] && gameAt(PARK_LOTS[it.b.id], mt);
        text = g ? `${it.b.name} // ${g.label}` : it.b.name;
        const p = toCam(c, it.cx, it.cy, top + 0.9);
        pos = project(p, view); if (pos) px = Math.min(14, (0.9 / pos.f) * view.focal);
      } else if (it.k === "st") { kind = "st"; text = it.st.name; const n = it.st.n || { x: 0, y: -1 }; pos = project(toCam(c, it.st.x + n.x * 1.2, it.st.y + n.y * 1.2, CANOPY * SH + 1.4), view); if (pos) px = Math.min(13, (0.8 / pos.f) * view.focal); }
      else if (it.k === "sign") { kind = "sign"; text = it.text; pos = project(toCam(c, it.x, it.y, 3.2), view); if (pos) px = Math.min(15, (1.1 / pos.f) * view.focal); }
      else continue;
      if (!pos || px < 8.5 || pos.f > 42) continue;
      if (text.length > 34) text = text.slice(0, 33) + "…";
      ctx.font = `${Math.round(px)}px ${FONT}`;
      const tw = ctx.measureText(text).width + 10;
      const r = { x0: pos.x - tw / 2, x1: pos.x + tw / 2, y0: pos.y - px - 5, y1: pos.y + 2 };
      if (r.x1 < 0 || r.x0 > W || r.y0 < 26 || r.y0 > H) continue;
      if (taken.some(q => r.x0 < q.x1 + 3 && r.x1 > q.x0 - 3 && r.y0 < q.y1 + 1 && r.y1 > q.y0 - 1)) continue;
      // behind a nearer building: no label through its walls
      if (hb.some(h => h.solid && h.d < it.d - 1 && h.b !== it.b && pos.x > h.box[0] && pos.x < h.box[2] && pos.y > h.box[1] && pos.y < h.box[3])) continue;
      taken.push(r);
      const a = Math.min(1, fade(it.d) * 1.2);
      ctx.globalAlpha = a;
      ctx.fillStyle = "rgba(6,10,6,0.86)"; ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
      if (kind === "st") { ctx.fillStyle = "rgba(34,211,238,0.6)"; ctx.fillRect(r.x0, r.y1 - 1, r.x1 - r.x0, 1); }
      if (kind === "sign") { ctx.strokeStyle = "rgba(74,222,128,0.6)"; ctx.lineWidth = 1; ctx.strokeRect(r.x0 + 0.5, r.y0 + 0.5, r.x1 - r.x0 - 1, r.y1 - r.y0 - 1); }
      ctx.fillStyle = kind === "st" ? "#67e8f9" : kind === "sign" ? "#4ade80" : "#a7d7b5";
      ctx.fillText(text, Math.round(pos.x), Math.round(pos.y));
      ctx.globalAlpha = 1;
    }

    // a whisper of scanlines (static, cheap), as on every terminal surface
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    return { people: hp, buildings: hb };

    // ---- drawers --------------------------------------------------------------------
    // A screen box round a map box (for taps): its corners, clamped to the screen.
    function hullOf(x0, y0, x1, y1, h) {
      let a = Infinity, b = Infinity, e = -Infinity, f = -Infinity;
      for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) for (const z of [0, h]) {
        const p = toCam(c, x, y, z * SH);
        if (p.f < NEAR) { const s = p.s < 0 ? -1e5 : 1e5; a = Math.min(a, s); e = Math.max(e, s); continue; }
        const q = project(p, view);
        a = Math.min(a, q.x); e = Math.max(e, q.x); b = Math.min(b, q.y); f = Math.max(f, q.y);
      }
      return [Math.max(0, a), Math.max(0, b), Math.min(W, e), Math.min(H, f)];
    }
    function drawArch(it) {
      const { b, sb, m } = it;
      G.aim(it.cx, it.cy);
      // HQ's census is classified: its windows keep office hours, not a head count.
      const lit = b.id === "hq" ? 0.45 : Math.min(1, (occ.byB[b.id] || 0) / (CAP[b.id] * 0.55));
      drawBody(G, sb, m, { ...env, lod: lodFor(G.z * 0.7), lit, bid: bidOf(b.id), name: sb.name, style: m.style });
      hb.push({ b, box: hullOf(m.box.x0, m.box.y0, m.box.x1, m.box.y1, m.rise * 0.85), d: it.d, solid: true });
    }
    function drawPark(it) {
      const pid = PARK_LOTS[it.b.id];
      G.aim(it.cx, it.cy);
      const res = drawParkLot(G, it.b.id, lodFor(G.z * 0.7), mt, occ.park.get(pid) || [], parkSeats.get(pid) || null);
      parkSeats.set(pid, res.at);
      const r = it.b.rect;
      hb.push({ b: it.b, box: hullOf(r.x, r.y, r.x + r.w, r.y + r.h, 1.5), d: it.d });
    }
    // The Loop, in the city's concrete and steel: deck slab with the line's cyan on the
    // fascia, piers, the rails on top (seen from the platform or aboard).
    function under(pts, fill) {
      // the deck's underside: horizontal and above the eye, so poly() would hide it
      const cp = clipNear(pts.map(([x, y, h]) => toCam(c, x, y, h * SH)));
      if (cp.length < 3) return;
      ctx.beginPath(); cp.forEach((p, i) => { const q = project(p, view); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
    }
    function drawRail(it) {
      const { a, e } = it;
      const L = Math.hypot(e.x - a.x, e.y - a.y) || 1, dx = (e.x - a.x) / L, dy = (e.y - a.y) / L, nx = -dy, ny = dx;
      const W2 = DECK_HW;
      const foot = [[a.x + nx * W2, a.y + ny * W2], [e.x + nx * W2, e.y + ny * W2], [e.x - nx * W2, e.y - ny * W2], [a.x - nx * W2, a.y - ny * W2]];
      const nf = night ? 0.7 : 1;
      if (it.pier) {
        G.prism([[a.x - 0.19, a.y - 0.19], [a.x + 0.19, a.y - 0.19], [a.x + 0.19, a.y + 0.19], [a.x - 0.19, a.y + 0.19]], 0, DECK - DECK_T, LOOP.pier, 1.1);
      }
      if (eyeZ < (DECK - DECK_T) * SH) under(foot.map(([x, y]) => [x, y, DECK - DECK_T]), shade(LOOP.deck, 0.62 * nf));
      G.prism(foot, DECK - DECK_T, DECK, LOOP.deck, 1.12);
      // the cyan line along each fascia that faces us
      for (const [p0, p1] of [[foot[0], foot[1]], [foot[2], foot[3]]]) {
        if (!G.facing(p0, p1, [(a.x + e.x) / 2, (a.y + e.y) / 2])) continue;
        const A = Q(p0[0], p0[1], DECK - DECK_T * 0.45), B = Q(p1[0], p1[1], DECK - DECK_T * 0.45);
        ctx.strokeStyle = night ? LOOP.cyanHi : LOOP.cyan; ctx.lineWidth = Math.max(1, Math.min(4, G.z * 0.05));
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      }
      // parapets, and the rails when the deck top is in view
      for (const s of [1, -1]) {
        const p0 = [a.x + nx * W2 * s, a.y + ny * W2 * s], p1 = [e.x + nx * W2 * s, e.y + ny * W2 * s];
        if (eyeZ < DECK * SH && !G.facing(p0, p1, [(a.x + e.x) / 2, (a.y + e.y) / 2])) continue;   // the far parapet hides behind the deck
        const A = Q(p0[0], p0[1], DECK + 0.12), B = Q(p1[0], p1[1], DECK + 0.12);
        ctx.strokeStyle = shade(LOOP.parapet, nf); ctx.lineWidth = Math.max(1, Math.min(5, G.z * 0.06));
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      }
      if (eyeZ > DECK * SH) for (const s of [0.28, -0.28]) {
        const A = Q(a.x + nx * s, a.y + ny * s, DECK + 0.02), B = Q(e.x + nx * s, e.y + ny * s, DECK + 0.02);
        ctx.strokeStyle = LOOP.rail; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      }
    }
    function drawStation(st) {
      const n = st.n || { x: 0, y: -1 };
      const tx = -n.y, ty = n.x;
      const cx = st.x + n.x * 1.0, cy = st.y + n.y * 1.0;
      const Lh = 4.5, Wd = 0.35;
      const rect = (l, w0, w1) => [[cx - tx * l + n.x * w0, cy - ty * l + n.y * w0], [cx + tx * l + n.x * w0, cy + ty * l + n.y * w0], [cx + tx * l + n.x * w1, cy + ty * l + n.y * w1], [cx - tx * l + n.x * w1, cy - ty * l + n.y * w1]];
      const lit = trainIn(st, mt);
      const plat = rect(Lh, -Wd, Wd);
      if (eyeZ < (DECK - DECK_T) * SH) under(plat.map(([x, y]) => [x, y, DECK - DECK_T]), shade(LOOP.plat, 0.55));
      G.prism(plat, DECK - DECK_T, DECK + 0.03, lit ? LOOP.platLit : LOOP.plat, 1.3);
      // the yellow edge along the track side
      const A = Q(plat[0][0], plat[0][1], DECK + 0.035), B = Q(plat[1][0], plat[1][1], DECK + 0.035);
      ctx.strokeStyle = LOOP.edge; ctx.lineWidth = Math.max(1, Math.min(3, G.z * 0.04)); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      // posts and the canopy, its fascia lit while a train stands
      for (const l of [-Lh + 0.8, 0, Lh - 0.8]) {
        const px2 = cx + tx * l + n.x * Wd * 0.6, py2 = cy + ty * l + n.y * Wd * 0.6;
        const P0 = Q(px2, py2, DECK), P1 = Q(px2, py2, CANOPY);
        ctx.strokeStyle = shade(LOOP.stair, 1); ctx.lineWidth = Math.max(1, Math.min(4, G.z * 0.05)); ctx.beginPath(); ctx.moveTo(P0[0], P0[1]); ctx.lineTo(P1[0], P1[1]); ctx.stroke();
      }
      const can = rect(Lh - 0.5, -Wd - 0.1, Wd + 0.15);
      if (eyeZ < CANOPY * SH) under(can.map(([x, y]) => [x, y, CANOPY]), lit ? "#2f5a52" : shade(LOOP.canopy, 0.7));
      G.prism(can, CANOPY, CANOPY + 0.07, LOOP.canopy, 1.6, 0.9);
      const f0 = Q(can[0][0], can[0][1], CANOPY + 0.035), f1 = Q(can[1][0], can[1][1], CANOPY + 0.035);
      ctx.strokeStyle = lit ? LOOP.cyanHi : "rgba(34,211,238,0.5)"; ctx.lineWidth = Math.max(1, Math.min(3, G.z * 0.04)); ctx.beginPath(); ctx.moveTo(f0[0], f0[1]); ctx.lineTo(f1[0], f1[1]); ctx.stroke();
    }
    function drawCar(it) {
      const yaw = ringTangent(it.s), fx = Math.sin(yaw), fy = -Math.cos(yaw), rx = Math.cos(yaw), ry = Math.sin(yaw);
      const hl = 1.15, hw = CAR_HW, z0 = DECK + 0.05, z1 = z0 + CAR_H;
      const corners = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].map(([a, b]) => [it.p.x + fx * a + rx * b, it.p.y + fy * a + ry * b]);
      const ctr = [it.p.x, it.p.y];
      const nf = night ? 0.72 : 1;
      const riders = occ.riders.get(`${it.t.id}|${it.car}`) || 0;
      for (let i = 0; i < 4; i++) {
        const a = corners[i], b = corners[(i + 1) % 4];
        const sh = G.facing(a, b, ctr);
        if (!sh) continue;
        G.poly([Q(a[0], a[1], z1), Q(b[0], b[1], z1), Q(b[0], b[1], z0), Q(a[0], a[1], z0)], shade(LOOP.body, sh * nf));
        const along = i % 2 === 0;   // edges 0 and 2 run along the car; 1 and 3 are its ends
        const q = (t0, t1, h0, h1) => [Q(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0, h1), Q(a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1, h1), Q(a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1, h0), Q(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0, h0)];
        G.poly(q(0, 1, z0 + 0.08, z0 + 0.14), LOOP.stripe);
        if (along) {
          const win = night ? LOOP.glassNight : shade(LOOP.glassDay, sh);
          for (let k = 0; k < 5; k++) G.poly(q(0.08 + k * 0.18, 0.2 + k * 0.18, z0 + 0.26, z0 + 0.5), win);
          if (riders && night) for (let k = 0; k < Math.min(5, riders); k++) G.poly(q(0.12 + k * 0.18, 0.16 + k * 0.18, z0 + 0.26, z0 + 0.42), LOOP.sil);
          G.poly(q(0.47, 0.53, z0 + 0.05, z0 + 0.52), shade(LOOP.door, sh * nf));
        } else {
          // the cab: windscreen, headlamps on the lead car, tail lamps on the last
          G.poly(q(0.18, 0.82, z0 + 0.3, z0 + 0.52), night ? "#1c2a26" : shade(LOOP.glassDay, 1.1));
          const front = (a[0] + b[0]) / 2 - it.p.x, frontY = (a[1] + b[1]) / 2 - it.p.y;
          const ahead = front * fx + frontY * fy > 0;
          if ((ahead && it.lead) || (!ahead && it.last)) for (const tt of [0.2, 0.8]) G.poly(q(tt - 0.06, tt + 0.06, z0 + 0.14, z0 + 0.22), ahead ? "#fff7d6" : "#f87171");
        }
      }
      G.poly(corners.map(([x, y]) => Q(x, y, z1)), shade(LOOP.roof, nf));
    }
    // DRIVE YOURSELF, third person: your citizen from behind, the YOU tag over the head.
    function drawMe() {
      const base = toCam(c, me.x, me.y, me.z || 0);
      if (base.f < NEAR) return;
      const p = project(base, view), q = project(toCam(c, me.x, me.y, (me.z || 0) + PERSON_H * statureOf(me.s)), view);
      if (!p || !q) return;
      const hpx = p.y - q.y, e = sheetFor(me.s), wpx = hpx * (SPRITE_W / SPRITE_H);
      ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(2, hpx * 0.22), Math.max(1, hpx * 0.07), 0, 0, Math.PI * 2); ctx.fill();
      const fr = me.moving && !reduced && e.frames > 1 ? Math.floor(now / 160) % 2 : 0;
      try {
        if (me.face === 1) { ctx.save(); ctx.translate(Math.round(p.x + wpx / 2), 0); ctx.scale(-1, 1); ctx.drawImage(e.img, fr * SPRITE_W, 0, SPRITE_W, SPRITE_H, 0, Math.round(q.y), Math.round(wpx), Math.round(hpx)); ctx.restore(); }
        else ctx.drawImage(e.img, fr * SPRITE_W, 0, SPRITE_W, SPRITE_H, Math.round(p.x - wpx / 2), Math.round(q.y), Math.round(wpx), Math.round(hpx));
      } catch { /* not decoded */ }
      ctx.font = `bold 11px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      const tw = ctx.measureText("YOU").width + 8;
      ctx.fillStyle = "#e5ffe9"; ctx.fillRect(Math.round(p.x - tw / 2), Math.round(q.y - 17), Math.round(tw), 13);
      ctx.fillStyle = "#06210f"; ctx.fillText("YOU", Math.round(p.x), Math.round(q.y - 5));
    }
    function drawPerson(it, now2, hp2) {
      const z = heightOf(it.w);
      const base = toCam(c, it.w.x, it.w.y, z);
      if (!inFov(base)) return;
      const p = project(base, view), q = project(toCam(c, it.w.x, it.w.y, z + PERSON_H * statureOf(it.s)), view);   // to scale, from the feet
      if (!p || !q) return;
      const hpx = p.y - q.y;
      // a shadow on the ground under them, as in the city
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(1.5, hpx * 0.2), Math.max(0.8, hpx * 0.06), 0, 0, Math.PI * 2); ctx.fill();
      // a stand-in from the day's summary (crowd.js) is drawn like anyone, and never opens
      if (hpx < 11) {
        const m2 = miniFor(it.s), sc = hpx / (SPRITE_H / 2);
        try { ctx.drawImage(m2, Math.round(p.x - (SPRITE_W / 4) * sc), Math.round(p.y - hpx), Math.max(1, Math.round((SPRITE_W / 2) * sc)), Math.max(1, Math.round(hpx))); } catch { /* not decoded */ }
        if (!it.s.crowd) hp2.push({ s: it.s, w: it.w, x: p.x - 4, y: p.y - 10, w2: 8, h: 10, f: p.f });
        return;
      }
      const e = sheetFor(it.s);
      const wpx = hpx * (SPRITE_W / SPRITE_H);
      const walking = it.w.activity === "commute" && (it.w.sub === "walking" || !it.w.sub) && !reduced;
      const fr = walking && e.frames > 1 ? Math.floor(now2 / 260 + hash01(it.s.name) * 4) % 2 : 0;
      try { ctx.drawImage(e.img, fr * SPRITE_W, 0, SPRITE_W, SPRITE_H, Math.round(p.x - wpx / 2), Math.round(q.y), Math.round(wpx), Math.round(hpx)); } catch { /* not decoded */ }
      if (it.s.you) {
        ctx.fillStyle = C.accent; ctx.font = `${Math.round(Math.min(14, Math.max(9, hpx / 5)))}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillText("▼ YOU", p.x, q.y - 2);
      }
      if (!it.s.crowd) hp2.push({ s: it.s, w: it.w, x: p.x - wpx / 2, y: q.y, w2: wpx, h: hpx, f: p.f });
    }
  };
}
