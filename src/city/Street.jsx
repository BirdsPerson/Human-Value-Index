// STREET: walk the Substrate at shoulder height. Buildings stand as boxes of flat 2D
// planes (windows lit by who is inside), people are pixel billboards, the Loop runs on
// its raised deck. Passive by default: a slow auto-tour glides the streets. WASD /
// arrows or the d-pad to walk, drag to turn, walk into a door (or tap a building) to go
// in, or TAKE THE LOOP to a district. One rAF loop; paused off screen and in a hidden tab.

import { memo, useCallback, useEffect, useRef, useState } from "react";
import TouchGate, { isTouchOnly } from "../ui/TouchGate.jsx";
import { Chip, Chips } from "../ui/index.js";
import { DISTRICTS, DISTRICT, BUILDING, BUILDINGS, clockAt, whereOf, jobLine, activityLine, roomIn, gameAt } from "./simApi.js";
import { sheetFor, miniFor } from "./spriteBank.js";
import { wantSectors } from "./planClient.js";
import { SPRITE_W, SPRITE_H, statureOf } from "../sprites.js";
import { trains, carArc, STATIONS as ST3D } from "./city3d.js";
import { lodFor, DECK } from "./iso.js";
import { massingOf } from "./archGeo.js";
import { drawBody, drawYardProp, drawArchGround } from "./archDraw.js";
import { PARK_LOTS, PARK_PLACES } from "./parkGeo.js";
import { drawParkLot } from "./parkDraw.js";
import { DECK_HW, CAR_HW } from "./loopGeo.js";
import { streetKitG, SH, shade } from "./streetArch.js";
import {
  PERSON_H, EYE_H, NEAR, FAR, FOV, WALK_SPEED, TURN_SPEED, RIDE_SPEED, TOUR_SPEED,
  STREET_BUILDINGS, toCam, project, viewFor, clipNear, clipSeg, inFov,
  RING_L, ringAt, ringTangent, nearestArc, arcDelta, tourPose, onStreet, heightOf, buildingAt, clampToWorld,
  districtAt, compass, BOUNDS, RIDE_H,
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

const IDLE_TO_TOUR = 30;   // seconds of no input before the tour resumes
const C = { bg: "#0a0f0a", ghost: "#2d5040", line: "#1f4a2c", mute: "#4b7c5e", dim: "#86c9a0", fg: "#c8f5d8", accent: "#4ade80", warn: "#fbbf24", harm: "#f87171", panel: "#0d140d" };
const FONT = "'Fira Mono', ui-monospace, Menlo, monospace";

function tokens() {
  try {
    const cs = getComputedStyle(document.documentElement);
    for (const k of Object.keys(C)) { const v = cs.getPropertyValue(`--${k === "dim" ? "fg-dim" : k === "mute" ? "fg-mute" : k === "ghost" ? "fg-ghost" : k}`).trim(); if (v) C[k] = v; }
  } catch { /* defaults */ }
}
const alpha = (hex, a) => {
  const h = hex.replace("#", ""); const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
};
// Opaque mix of two hex colours (walls must occlude what stands behind them).
const mix = (a, b, t) => {
  const p = (h) => { const x = h.replace("#", ""); const n = parseInt(x.length === 3 ? x.split("").map(c => c + c).join("") : x, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const [a1, a2, a3] = p(a), [b1, b2, b3] = p(b);
  return `rgb(${Math.round(a1 + (b1 - a1) * t)},${Math.round(a2 + (b2 - a2) * t)},${Math.round(a3 + (b3 - a3) * t)})`;
};
const hash01 = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };

export default memo(Street);
function Street({ censusRef, onOpen, onEnter }) {
  const wrapRef = useRef(null), canvasRef = useRef(null);
  const reduce = useRef(false);
  const cam = useRef(null);
  const input = useRef({ keys: new Set(), pad: new Set(), drag: null, lastInput: -1e9, bump: 0, bumpId: null });
  const hits = useRef({ people: [], buildings: [] });
  const occ = useRef({ v: -1, byB: {}, park: new Map(), riders: new Map() });
  const parkSeats = useRef(new Map());
  const perf = useRef({ n: 0, sum: 0, max: 0 });
  const [hud, setHud] = useState({ district: "", heading: "N", mode: "tour" });
  const [tip, setTip] = useState(null);
  const [touch] = useState(() => (typeof window === "undefined" ? false : isTouchOnly()));

  useEffect(() => {
    let el = document.getElementById("hvi-street-styles");
    if (!el) { el = document.createElement("style"); el.id = "hvi-street-styles"; document.head.appendChild(el); }
    if (el.textContent !== streetCss) el.textContent = streetCss;
    tokens();
    try { reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* no */ }
    const t0 = reduce.current ? 0 : Date.now() / 1000;
    const p = tourPose(t0);
    cam.current = { x: p.x, y: p.y, yaw: p.yaw, h: EYE_H, mode: reduce.current ? "walk" : "tour", tourT: t0, ride: null, entering: null };
  }, []);

  const enter = useCallback((b) => { if (!b) return; cam.current.entering = { b, at: performance.now() }; onEnter?.(b.districtId, b.id); }, [onEnter]);

  // ---- the loop -------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;
    const ctx = canvas.getContext("2d");
    let raf = 0, visible = true, last = performance.now(), W = 0, H = 0, dpr = 1, hudT = 0;
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(280, Math.floor(r.width)); H = Math.max(260, Math.floor(r.height));
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
    };
    resize();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro?.observe(wrap);
    const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }) : null;
    io?.observe(wrap);

    function update(dt, now) {
      const c = cam.current, inp = input.current;
      const k = inp.keys, pad = inp.pad;
      const fwd = (k.has("w") || k.has("arrowup") || pad.has("up") ? 1 : 0) - (k.has("s") || k.has("arrowdown") || pad.has("down") ? 1 : 0);
      const strafe = (k.has("d") ? 1 : 0) - (k.has("a") ? 1 : 0);
      const turn = (k.has("arrowright") || k.has("e") || pad.has("right") ? 1 : 0) - (k.has("arrowleft") || k.has("q") || pad.has("left") ? 1 : 0);
      const drag = inp.drag;
      const moving = fwd || strafe || turn || (drag && drag.walk);
      if (moving) { inp.lastInput = now; if (c.mode === "tour") c.mode = "walk"; if (c.ride) { c.ride = null; } }

      if (c.ride) {
        // Aboard the Loop: rise to the deck, run the ring, come down at the station.
        const r = c.ride; r.t += dt;
        const total = Math.abs(r.d) / RIDE_SPEED;
        const k01 = Math.min(1, r.t / Math.max(0.01, total));
        const e = k01 < 0.5 ? 2 * k01 * k01 : 1 - (-2 * k01 + 2) ** 2 / 2;
        const s = r.s0 + r.d * e;
        const p = ringAt(s);
        c.x = p.x; c.y = p.y;
        c.yaw = ringTangent(s) + (r.d < 0 ? Math.PI : 0);
        c.h = EYE_H + (RIDE_H - EYE_H) * Math.min(1, Math.sin(Math.PI * k01) * 3);
        if (k01 >= 1) {
          const st = r.station; c.ride = null; c.h = EYE_H; c.mode = "walk"; inp.lastInput = now;
          const d = DISTRICT[st.districtId];
          if (d) { const cx = d.rect.x + d.rect.w / 2, cy = d.rect.y + d.rect.h / 2; c.yaw = Math.atan2(cx - c.x, -(cy - c.y)); }
        }
        return;
      }
      if (c.mode === "tour") {
        c.tourT += dt;
        const p = tourPose(c.tourT);
        // ease toward the tour pose (it may be resuming from elsewhere)
        const g = Math.min(1, dt * 1.6);
        c.x += (p.x - c.x) * g; c.y += (p.y - c.y) * g;
        let dy = ((p.yaw - c.yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        c.yaw += dy * g; c.h += (EYE_H - c.h) * g;
        return;
      }
      // on foot
      c.h += (EYE_H - c.h) * Math.min(1, dt * 4);
      c.yaw += turn * TURN_SPEED * dt;
      if (drag && drag.turn) { c.yaw += drag.turn; drag.turn = 0; }
      let f = fwd, st = strafe;
      if (drag && drag.walk) { f += drag.walk; }
      if (f || st) {
        const fx = Math.sin(c.yaw), fy = -Math.cos(c.yaw), rx = Math.cos(c.yaw), ry = Math.sin(c.yaw);
        const len = Math.hypot(f, st) || 1;
        const vx = (fx * f + rx * st) / len * WALK_SPEED * dt * Math.min(1, Math.hypot(f, st));
        const vy = (fy * f + ry * st) / len * WALK_SPEED * dt * Math.min(1, Math.hypot(f, st));
        let nx = c.x + vx, ny = c.y + vy;
        const hit = buildingAt(nx, ny, 0.3);
        if (hit) {
          // bumping a wall: slide along it; lean on a door long enough and you are in
          if (!buildingAt(nx, c.y, 0.3)) ny = c.y; else if (!buildingAt(c.x, ny, 0.3)) nx = c.x; else { nx = c.x; ny = c.y; }
          if (f > 0) {
            if (inp.bumpId === hit.id) inp.bump += dt; else { inp.bumpId = hit.id; inp.bump = dt; }
            if (inp.bump > 0.45 && !c.entering) { enter(hit); inp.bump = 0; }
          }
        } else { inp.bumpId = null; inp.bump = 0; }
        [c.x, c.y] = clampToWorld(nx, ny);
      }
      if (now - inp.lastInput > IDLE_TO_TOUR * 1000 && !reduce.current) {
        // idle: resume the tour from the nearest point of the ring
        const s = nearestArc(c.x, c.y);
        c.tourT = s / TOUR_SPEED; c.mode = "tour";
      }
    }

    // Which districts to load (planClient.wantSectors): those within sight of the walk.
    let wantAt = 0;
    function wantView(c, now) {
      if (now - wantAt < 500) return;
      wantAt = now;
      const R = 45;
      wantSectors("street", DISTRICTS.filter(d => { const r = d.rect, dx = Math.max(r.x - c.x, 0, c.x - r.x - r.w), dy = Math.max(r.y - c.y, 0, c.y - r.y - r.h); return Math.hypot(dx, dy) < R; }).map(d => d.id));
    }

    // The census, counted the city's way (simApi.roomIn): lit windows per building, who is
    // on each ground (parkDraw poses them), riders per car (silhouettes in the windows).
    function readCensus(census) {
      if (occ.current.v === census.v) return;
      const byB = {}, park = new Map(PARK_PLACES.map(id => [id, []])), riders = new Map();
      for (const { s, w } of census.list || []) {
        if (!w) continue;
        if (w.sub === "riding" && w.trainId) { const k = `${w.trainId}|${w.car}`; riders.set(k, (riders.get(k) || 0) + 1); }
        const r = roomIn(w, s);
        if (!r) continue;
        byB[r.buildingId] = (byB[r.buildingId] || 0) + 1;
        if (r.mode === "here" && park.has(w.placeId)) park.get(w.placeId).push({ s, w });
      }
      occ.current = { v: census.v, byB, park, riders };
    }
    const ST_ARC = new Map(ST3D.map(st => [st, st.s ?? nearestArc(st.x, st.y)]));
    let trainCache = { mt: -1, list: [] };
    const trainList = (mt) => { if (trainCache.mt !== mt) trainCache = { mt, list: trains(mt) }; return trainCache.list; };
    const trainIn = (st, mt) => trainList(mt).some(tr => Math.abs(arcDelta(tr.s ?? 0, ST_ARC.get(st))) < 4);

    function render(now) {
      const c = cam.current;
      wantView(c, now);
      const view = viewFor(W, H);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 1;

      const census = censusRef.current;
      const mt = census.mt != null ? census.mt + (performance.now() - census.t) / 60000 : clockAt(Date.now()).mt;
      const hour = ((mt % 24) + 24) % 24, night = nightAt(hour);
      const t = reduce.current ? 0 : now / 1000;
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
        if (Math.max(r.x - c.x, 0, c.x - r.x - r.w) > FAR || Math.max(r.y - c.y, 0, c.y - r.y - r.h) > FAR) continue;
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
      const gx0 = Math.max(BOUNDS.x0, Math.floor((c.x - FAR) / GS) * GS), gx1 = Math.min(BOUNDS.x1, c.x + FAR);
      const gy0 = Math.max(BOUNDS.y0, Math.floor((c.y - FAR) / GS) * GS), gy1 = Math.min(BOUNDS.y1, c.y + FAR);
      for (let x = gx0; x <= gx1; x += GS) seg(x, gy0, x, gy1, "rgba(74,222,128,0.05)");
      for (let y = gy0; y <= gy1; y += GS) seg(gx0, y, gx1, y, "rgba(74,222,128,0.05)");

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
        if (d > FAR || !seen(r.x, r.y, r.x + r.w, r.y + r.h)) continue;
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
        if (dd > FAR || !seen(Math.min(a.x, e.x) - 0.7, Math.min(a.y, e.y) - 0.7, Math.max(a.x, e.x) + 0.7, Math.max(a.y, e.y) + 0.7)) continue;
        items.push({ k: "rail", d: dd, a, e, pier: Math.round(s / 2.5) % 2 === 0 });
      }
      for (const st of ST3D) { const dd = Math.hypot(st.x - c.x, st.y - c.y); if (dd < FAR) items.push({ k: "st", d: Math.max(0, dd - 3), st }); }
      for (const tr of trainList(mt)) for (let k = 0; k < tr.cars; k++) {
        const sArc = carArc(tr, k), p = ringAt(sArc);
        const dd = Math.hypot(p.x - c.x, p.y - c.y);
        if (dd < FAR) items.push({ k: "car", d: Math.max(0, dd - 1), p, s: sArc, lead: k === 0, last: k === tr.cars - 1, t: tr, car: k });
      }
      // people on the street and the platforms (the grounds draw their own, posed)
      const list = census.list || [];
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!onStreet(e.w) || PARK_PLACE_SET.has(e.w.placeId) || e.w.sub === "riding") continue;
        if (Math.abs(e.w.x - c.x) > FAR || Math.abs(e.w.y - c.y) > FAR) continue;
        const w = e.w.activity === "commute" && Math.hypot(e.w.x - c.x, e.w.y - c.y) < 40 ? whereOf(e.s, mt) : e.w;
        if (!w || !onStreet(w) || w.sub === "riding") continue;
        const dd = Math.hypot(w.x - c.x, w.y - c.y);
        if (dd > FAR) continue;
        items.push({ k: "p", d: dd, s: e.s, w });
      }
      for (const d of DISTRICTS) { const x = d.rect.x + d.rect.w / 2, y = d.rect.y - 0.6; const dd = Math.hypot(x - c.x, y - c.y); if (dd < FAR) items.push({ k: "sign", d: dd, x, y, text: d.name }); }
      items.sort((a, b) => b.d - a.d);

      // ---- the ground's own dressing: lots, courts, plazas, lawns -------------------------
      for (const g of ground) {
        if (g.k === "lot") {
          const r = g.b.rect;
          flat(r.x, r.y, r.x + r.w, r.y + r.h, shade(LOT_FILL[g.b.id] || "#20241f", night ? 1 : 1.3), "rgba(74,222,128,0.3)");
        } else drawArchGround(G.aim(g.cx, g.cy), g.m, { ...env, lod: "near" });
      }

      const hp = [], hb = [];
      const fade = (d) => Math.max(0, Math.min(1, (FAR - d) / 14));
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
      for (const h of G.hits) if (h.kind === "p") hp.push({ s: h.s, x: h.box[0], y: h.box[1], w2: h.box[2] - h.box[0], h: h.box[3] - h.box[1], f: 1 });
      hits.current = { people: hp, buildings: hb };

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
        const lit = b.id === "hq" ? 0.45 : Math.min(1, (occ.current.byB[b.id] || 0) / (CAP[b.id] * 0.55));
        drawBody(G, sb, m, { ...env, lod: lodFor(G.z * 0.7), lit, bid: bidOf(b.id), name: sb.name, style: m.style });
        hb.push({ b, box: hullOf(m.box.x0, m.box.y0, m.box.x1, m.box.y1, m.rise * 0.85), d: it.d, solid: true });
      }
      function drawPark(it) {
        const pid = PARK_LOTS[it.b.id];
        G.aim(it.cx, it.cy);
        const res = drawParkLot(G, it.b.id, lodFor(G.z * 0.7), mt, occ.current.park.get(pid) || [], parkSeats.current.get(pid) || null);
        parkSeats.current.set(pid, res.at);
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
        const riders = occ.current.riders.get(`${it.t.id}|${it.car}`) || 0;
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
        const walking = it.w.activity === "commute" && (it.w.sub === "walking" || !it.w.sub) && !reduce.current;
        const fr = walking && e.frames > 1 ? Math.floor(now2 / 260 + hash01(it.s.name) * 4) % 2 : 0;
        try { ctx.drawImage(e.img, fr * SPRITE_W, 0, SPRITE_W, SPRITE_H, Math.round(p.x - wpx / 2), Math.round(q.y), Math.round(wpx), Math.round(hpx)); } catch { /* not decoded */ }
        if (it.s.you) {
          ctx.fillStyle = C.accent; ctx.font = `${Math.round(Math.min(14, Math.max(9, hpx / 5)))}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
          ctx.fillText("▼ YOU", p.x, q.y - 2);
        }
        if (!it.s.crowd) hp2.push({ s: it.s, w: it.w, x: p.x - wpx / 2, y: q.y, w2: wpx, h: hpx, f: p.f });
      }
    }
    function frame(now) {
      raf = 0;
      if (!visible || document.hidden) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const t0 = performance.now();
      if (cam.current) { update(dt, now); render(now); }
      const ms = performance.now() - t0;
      const pf = perf.current; pf.n++; pf.sum += ms; pf.max = Math.max(pf.max, ms);
      if (now - hudT > 400 && cam.current) {
        hudT = now;
        const c = cam.current, d = districtAt(c.x, c.y);
        setHud(h => {
          const next = { district: c.ride ? "ABOARD THE LOOP" : d ? d.name : "THE STREETS", heading: compass(c.yaw), mode: c.ride ? "ride" : c.mode };
          return h.district === next.district && h.heading === next.heading && h.mode === next.mode ? h : next;
        });
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    const onVis = () => { if (!document.hidden && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    document.addEventListener("visibilitychange", onVis);
    if (import.meta.env?.DEV) window.__hviStreet = { cam, input, perf, reset: () => { perf.current = { n: 0, sum: 0, max: 0 }; } };
    return () => { cancelAnimationFrame(raf); ro?.disconnect(); io?.disconnect(); document.removeEventListener("visibilitychange", onVis); wantSectors("street", []); };
  }, [censusRef, enter]);

  // ---- input ----------------------------------------------------------------------
  const onKeyDown = (e) => {
    const k = e.key.toLowerCase();
    if (["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
      e.preventDefault(); input.current.keys.add(k); input.current.lastInput = performance.now();
    } else if (k === "enter" || k === " ") {
      // enter the building straight ahead, if one is close
      const c = cam.current; const fx = Math.sin(c.yaw), fy = -Math.cos(c.yaw);
      for (let d = 0.5; d < 4; d += 0.5) { const b = buildingAt(c.x + fx * d, c.y + fy * d, 0.3); if (b) { e.preventDefault(); enter(b); break; } }
    }
  };
  const onKeyUp = (e) => input.current.keys.delete(e.key.toLowerCase());
  const onBlur = () => input.current.keys.clear();

  const pick = (x, y) => {
    const { people, buildings } = hits.current;
    let best = null;
    for (const p of people) if (x >= p.x && x <= p.x + p.w2 && y >= p.y && y <= p.y + p.h && (!best || p.f < best.f)) best = p;
    if (best) return { kind: "p", ...best };
    for (let i = buildings.length - 1; i >= 0; i--) {
      for (const pr of buildings[i].polys) if (inPoly(x, y, pr)) return { kind: "b", b: buildings[i].b };
    }
    return null;
  };
  const onPointerDown = (e) => {
    canvasRef.current?.focus({ preventScroll: true });
    const r = canvasRef.current.getBoundingClientRect();
    input.current.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false, walk: 0, turn: 0, rx: r.left, ry: r.top };
    try { canvasRef.current.setPointerCapture(e.pointerId); } catch { /* ok */ }
  };
  const onPointerMove = (e) => {
    const d = input.current.drag;
    const r = canvasRef.current.getBoundingClientRect();
    if (d && d.id === e.pointerId) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) > 6) d.moved = true;
      if (d.moved) {
        d.turn += dx * 0.006; d.x = e.clientX; d.y = e.clientY;
        // drag up to walk forward, down to step back (touch); mouse drags only turn
        if (e.pointerType !== "mouse") d.walk = Math.max(-1, Math.min(1, -(e.clientY - d.y0) / 80));
        input.current.lastInput = performance.now();
        if (cam.current.mode === "tour") cam.current.mode = "walk";
        cam.current.ride = null;
      }
      setTip(null);
      return;
    }
    if (e.pointerType === "mouse") {
      const h = pick(e.clientX - r.left, e.clientY - r.top);
      setTip(h?.kind === "p" ? { x: e.clientX - r.left, y: e.clientY - r.top, s: h.s } : h?.kind === "b" ? { x: e.clientX - r.left, y: e.clientY - r.top, b: h.b } : null);
    }
  };
  const onPointerUp = (e) => {
    const d = input.current.drag;
    input.current.drag = null;
    if (!d || d.moved) return;
    const r = canvasRef.current.getBoundingClientRect();
    const h = pick(e.clientX - r.left, e.clientY - r.top);
    if (h?.kind === "p") onOpen?.(h.s);
    else if (h?.kind === "b") enter(h.b);
  };
  const padDown = (dir) => (e) => { e.preventDefault(); input.current.pad.add(dir); input.current.lastInput = performance.now(); };
  const padUp = (dir) => () => input.current.pad.delete(dir);

  const takeLoop = (districtId) => {
    const c = cam.current, st = ST3D.find(x => x.districtId === districtId);
    if (!c || !st) return;
    const s0 = nearestArc(c.x, c.y), s1 = st.s ?? nearestArc(st.x, st.y);
    c.ride = { s0, d: arcDelta(s0, s1), t: 0, station: st };
    c.mode = "walk"; input.current.lastInput = performance.now();
    if (reduce.current) { c.ride.t = 1e9; }
  };
  const tour = () => { const c = cam.current; if (!c) return; c.ride = null; c.tourT = nearestArc(c.x, c.y) / TOUR_SPEED; c.mode = "tour"; };

  const modeText = hud.mode === "tour" ? "AUTO-TOUR // TOUCH A KEY OR DRAG TO WALK" : hud.mode === "ride" ? "ABOARD THE LOOP // STAND CLEAR OF YOUR OPINIONS" : "ON FOOT // WALK INTO A DOOR TO ENTER";

  return (
    <div className="hvi-street">
      <TouchGate label="TAP TO WALK" hint="DRAG TO TURN · DRAG UP TO WALK">
        <div ref={wrapRef} className="hvi-street-stage">
          <canvas ref={canvasRef} tabIndex={0} className="hvi-street-canvas" role="img"
            aria-label={`Street view of the Substrate, ${hud.district}, facing ${hud.heading}. Use W A S D or the arrow keys to walk and turn, Enter to go into the building ahead. The district directory below lists every district.`}
            onKeyDown={onKeyDown} onKeyUp={onKeyUp} onBlur={onBlur}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { input.current.drag = null; }}
            onPointerLeave={() => setTip(null)} />
          <div className="hvi-street-hud" aria-live="polite">
            <span>{hud.district} // FACING {hud.heading}</span>
            <span className="hvi-street-mode">{modeText}</span>
          </div>
          {tip && (
            <div className="hvi-street-tip" style={{ left: Math.min(tip.x + 12, 9999), top: tip.y + 12 }}>
              {tip.s ? (<><b>{tip.s.name}</b><br />{jobLine(tip.s)}<br /><span className="dim">{activityLine(tip.s, censusRef.current.mt ?? 0)}</span></>)
                : (<><b>{tip.b.name}</b><br /><span className="dim">{tip.b.outdoor ? "OPEN LOT" : `${tip.b.storeys} STOREY${tip.b.storeys === 1 ? "" : "S"}`} // CLICK TO ENTER</span></>)}
            </div>
          )}
          {touch && (
            <div className="hvi-street-pad" aria-hidden="true">
              <button className="u" onPointerDown={padDown("up")} onPointerUp={padUp("up")} onPointerLeave={padUp("up")}>▲</button>
              <button className="l" onPointerDown={padDown("left")} onPointerUp={padUp("left")} onPointerLeave={padUp("left")}>◀</button>
              <button className="r" onPointerDown={padDown("right")} onPointerUp={padUp("right")} onPointerLeave={padUp("right")}>▶</button>
              <button className="d" onPointerDown={padDown("down")} onPointerUp={padUp("down")} onPointerLeave={padUp("down")}>▼</button>
            </div>
          )}
        </div>
      </TouchGate>
      <div className="hvi-street-travel">
        <span className="hvi-street-travel-h">TAKE THE LOOP TO</span>
        <Chips role="group" aria-label="Take the Loop to a district">
          {DISTRICTS.map(d => <Chip key={d.id} onClick={() => takeLoop(d.id)}>{d.name.replace(/^THE /, "")}</Chip>)}
          <Chip onClick={tour}>RESUME TOUR</Chip>
        </Chips>
      </div>
    </div>
  );
}

function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export const streetCss = `
.hvi-street-stage { position: relative; height: min(64vh, 560px); min-height: 300px; background: var(--bg); }
.hvi-street-canvas { display: block; width: 100%; height: 100%; outline: none; cursor: grab; touch-action: none; }
.hvi-street-canvas:focus-visible { box-shadow: inset 0 0 0 2px var(--accent); }
.hvi-street-hud { position: absolute; left: 8px; right: 8px; top: 6px; display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap;
  font-size: var(--t-xs); letter-spacing: .06em; color: var(--fg-dim); pointer-events: none; text-shadow: 0 0 2px var(--bg); }
.hvi-street-mode { color: var(--fg-mute); }
.hvi-street-tip { position: absolute; pointer-events: none; background: var(--panel); border: 1px solid var(--line); padding: 6px 8px;
  font-size: var(--t-xs); color: var(--fg); max-width: 260px; z-index: 3; }
.hvi-street-tip .dim { color: var(--fg-mute); }
.hvi-street-pad { position: absolute; right: 10px; bottom: 10px; display: grid; grid-template-columns: 48px 48px 48px; grid-template-rows: 48px 48px 48px; gap: 2px; }
.hvi-street-pad button { background: rgba(10,15,10,.78); border: 1px solid var(--line); color: var(--accent); font: inherit; font-size: 16px; touch-action: none; }
.hvi-street-pad button:active { background: var(--accent); color: var(--bg); }
.hvi-street-pad .u { grid-column: 2; grid-row: 1; } .hvi-street-pad .l { grid-column: 1; grid-row: 2; }
.hvi-street-pad .r { grid-column: 3; grid-row: 2; } .hvi-street-pad .d { grid-column: 2; grid-row: 3; }
.hvi-street-travel { padding: var(--s2) var(--s3) var(--s3); display: flex; flex-direction: column; gap: var(--s1); }
.hvi-street-travel-h { font-size: var(--t-xs); color: var(--fg-mute); letter-spacing: .08em; }
@media (max-width: 720px) { .hvi-street-stage { height: 58vh; } .hvi-street-mode { display: none; } }
`;
