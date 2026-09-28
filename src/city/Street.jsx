// STREET: walk the Substrate at shoulder height. Buildings stand as boxes of flat 2D
// planes (windows lit by who is inside), people are pixel billboards, the Loop runs on
// its raised deck. Passive by default: a slow auto-tour glides the streets. WASD /
// arrows or the d-pad to walk, drag to turn, walk into a door (or tap a building) to go
// in, or TAKE THE LOOP to a district. One rAF loop; paused off screen and in a hidden tab.

import { memo, useCallback, useEffect, useRef, useState } from "react";
import TouchGate, { isTouchOnly } from "../ui/TouchGate.jsx";
import { Chip, Chips } from "../ui/index.js";
import { DISTRICTS, DISTRICT, clockAt, whereOf, jobLine, activityLine } from "./simApi.js";
import { familyOf, FAMILY_COLOR } from "./cityKit.js";
import { sheetFor } from "./spriteBank.js";
import { SPRITE_W, SPRITE_H } from "../sprites.js";
import { locate, trains, carArc, STATIONS as ST3D } from "./city3d.js";
import {
  FLOOR_H, LOOP_H, PERSON_H, EYE_H, RIDE_H, NEAR, FAR, WALK_SPEED, TURN_SPEED, RIDE_SPEED, TOUR_SPEED,
  STREET_BUILDINGS, wallsOf, wallFaces, toCam, project, viewFor, clipNear, clipSeg, fogAt, inFov,
  RING_L, ringAt, ringTangent, nearestArc, arcDelta, tourPose, onStreet, heightOf, buildingAt, clampToWorld,
  districtAt, compass, occupancyByFloor, BOUNDS,
} from "./streetKit.js";

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
  const occ = useRef({ v: -1, map: {} });
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

    function render(now) {
      const c = cam.current;
      const view = viewFor(W, H);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      // sky: the machine's ceiling, faint scan bands above the horizon
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
      for (let y = view.horizon - 4; y > 0; y -= 7) { ctx.fillStyle = alpha(C.accent, 0.018 + 0.03 * (y / view.horizon)); ctx.fillRect(0, y, W, 1); }
      ctx.fillStyle = alpha(C.accent, 0.22); ctx.fillRect(0, view.horizon, W, 1);

      const census = censusRef.current;
      const mt = census.mt != null ? census.mt + (performance.now() - census.t) / 60000 : clockAt(Date.now()).mt;

      // ground: the street grid, clipped to the near plane, fogged
      ctx.lineWidth = 1;
      const seg = (x0, y0, x1, y1, z, color, a0 = 1) => {
        const s = clipSeg(toCam(c, x0, y0, z), toCam(c, x1, y1, z));
        if (!s) return;
        const p = project(s[0], view), q = project(s[1], view);
        if (!p || !q) return;
        const f = Math.min(p.f, q.f);
        if (f > FAR) return;
        ctx.strokeStyle = alpha(color, a0 * fogAt(f));
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      };
      const G = 4;
      const gx0 = Math.max(BOUNDS.x0, Math.floor((c.x - FAR) / G) * G), gx1 = Math.min(BOUNDS.x1, c.x + FAR);
      const gy0 = Math.max(BOUNDS.y0, Math.floor((c.y - FAR) / G) * G), gy1 = Math.min(BOUNDS.y1, c.y + FAR);
      for (let x = gx0; x <= gx1; x += G) seg(x, gy0, x, gy1, 0, C.ghost, 0.9);
      for (let y = gy0; y <= gy1; y += G) seg(gx0, y, gx1, y, 0, C.ghost, 0.9);
      for (const d of DISTRICTS) { const r = d.rect; seg(r.x, r.y, r.x + r.w, r.y, 0, C.line, 1.4); seg(r.x + r.w, r.y, r.x + r.w, r.y + r.h, 0, C.line, 1.4); seg(r.x + r.w, r.y + r.h, r.x, r.y + r.h, 0, C.line, 1.4); seg(r.x, r.y + r.h, r.x, r.y, 0, C.line, 1.4); }

      // ---- drawables, sorted far to near ----
      const items = [];
      // buildings
      if (occ.current.v !== census.v) occ.current = { v: census.v, map: occupancyByFloor(census.list || [], locate) };
      for (const b of STREET_BUILDINGS) {
        const cx = b.rect.x + b.rect.w / 2, cy = b.rect.y + b.rect.h / 2;
        const p = toCam(c, cx, cy, 0);
        const rad = Math.hypot(b.rect.w, b.rect.h) / 2;
        if (p.f < -rad || p.f > FAR + rad) continue;
        if (p.f > rad && Math.abs(p.s / p.f) > Math.tan(0.8) + rad / p.f) continue;
        items.push({ k: "b", d: Math.hypot(cx - c.x, cy - c.y), b });
      }
      // the Loop deck, in short segments so it sorts against buildings
      for (let s = 0; s < RING_L; s += 2.5) {
        const a = ringAt(s), e = ringAt(s + 2.5);
        const m = { x: (a.x + e.x) / 2, y: (a.y + e.y) / 2 };
        const dd = Math.hypot(m.x - c.x, m.y - c.y);
        if (dd > FAR) continue;
        items.push({ k: "rail", d: dd, a, e, pillar: Math.round(s / 2.5) % 4 === 0 });
      }
      for (const st of ST3D) { const dd = Math.hypot(st.x - c.x, st.y - c.y); if (dd < FAR) items.push({ k: "st", d: dd, st }); }
      for (const t of trains(mt)) for (let k = 0; k < t.cars; k++) {
        const sArc = carArc(t, k), p = ringAt(sArc);
        const dd = Math.hypot(p.x - c.x, p.y - c.y);
        if (dd < FAR) items.push({ k: "car", d: dd, p, s: sArc, lead: k === 0, t });
      }
      // people on the street, platforms and trains
      const list = census.list || [];
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!onStreet(e.w)) continue;
        if (Math.abs(e.w.x - c.x) > FAR || Math.abs(e.w.y - c.y) > FAR) continue;
        // walkers are re-placed every frame so they move smoothly between census ticks
        const w = e.w.activity === "commute" && Math.hypot(e.w.x - c.x, e.w.y - c.y) < 40 ? whereOf(e.s, mt) : e.w;
        if (!w || !onStreet(w)) continue;
        const dd = Math.hypot(w.x - c.x, w.y - c.y);
        if (dd > FAR) continue;
        items.push({ k: "p", d: dd, s: e.s, w });
      }
      // district signs
      for (const d of DISTRICTS) { const x = d.rect.x + d.rect.w / 2, y = d.rect.y - 0.6; const dd = Math.hypot(x - c.x, y - c.y); if (dd < FAR) items.push({ k: "sign", d: dd, x, y, text: d.name }); }
      items.sort((a, b) => b.d - a.d);
      // Labels: nearest first, a label that would overlap a nearer one is dropped.
      const labels = new Set(), taken = [];
      ctx.textBaseline = "bottom";
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        let pos = null, text = null, px = 0;
        if (it.k === "b") { text = it.b.name; pos = project(toCam(c, it.b.rect.x + it.b.rect.w / 2, it.b.rect.y + it.b.rect.h / 2, it.b.height + 0.9), view); if (pos) px = Math.min(15, (0.9 / pos.f) * view.focal); }
        else if (it.k === "sign") { text = it.text; pos = project(toCam(c, it.x, it.y, 3.6), view); if (pos) px = Math.min(18, (1.1 / pos.f) * view.focal); }
        else if (it.k === "st") { text = it.st.name; const n = it.st.n || { x: 0, y: -1 }; pos = project(toCam(c, it.st.x + n.x * 1.2, it.st.y + n.y * 1.2, LOOP_H + 2.2), view); if (pos) px = Math.min(14, (0.8 / pos.f) * view.focal); }
        else continue;
        if (!pos || px < 8.5 || pos.f > 46) continue;
        ctx.font = `${Math.round(px)}px ${FONT}`;
        const tw = ctx.measureText(text).width + 10;
        const r = { x0: pos.x - tw / 2, x1: pos.x + tw / 2, y0: pos.y - px - 5, y1: pos.y + 2 };
        if (r.x1 < 0 || r.x0 > W || r.y0 < 26 || r.y0 > H) continue;
        if (taken.some(t => r.x0 < t.x1 && r.x1 > t.x0 && r.y0 < t.y1 && r.y1 > t.y0)) continue;
        taken.push(r); labels.add(it);
      }

      const hp = [], hb = [];
      for (const it of items) {
        if (it.k === "b") drawBuilding(it.b, view, hb, labels.has(it));
        else if (it.k === "rail") drawRail(it, view);
        else if (it.k === "st") drawStation(it.st, view, labels.has(it));
        else if (it.k === "car") drawCar(it, view);
        else if (it.k === "p") drawPerson(it, view, now, hp);
        else if (it.k === "sign" && labels.has(it)) drawSign(it, view);
      }
      hits.current = { people: hp, buildings: hb };

      // vignette + a whisper of scanlines (static, cheap)
      ctx.fillStyle = "rgba(0,0,0,0.06)";
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);

      function poly(pts, fill, stroke, lw = 1) {
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath();
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
      }
      // A vertical quad from (ax,ay) to (bx,by), z0..z1 -> projected polygon or null
      function quad(ax, ay, bx, by, z0, z1) {
        const cp = clipNear([toCam(c, ax, ay, z0), toCam(c, bx, by, z0), toCam(c, bx, by, z1), toCam(c, ax, ay, z1)]);
        if (cp.length < 3) return null;
        const pr = cp.map(p => project(p, view));
        if (pr.some(p => !p)) return null;
        return pr;
      }
      function drawBuilding(b, v, hb, labelOk) {
        const walls = wallsOf(b.rect).filter(w => wallFaces(w, c.x, c.y));
        const floorsLit = occ.current.map[b.id] || {};
        const minF = Math.max(NEAR, toCam(c, b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2).f);
        const fog = fogAt(minF);
        if (fog <= 0.02) return;
        const outline = alpha(b.outdoor ? C.mute : C.accent, 0.35 + 0.55 * fog);
        const polys = [];
        for (const w of walls) {
          const pr = quad(w.a[0], w.a[1], w.b[0], w.b[1], 0, b.height);
          if (!pr) continue;
          polys.push(pr);
          // lit faces (east/south, toward the imagined morning) a touch brighter
          const shade = w.n[0] > 0 || w.n[1] > 0 ? 0.42 : 0.3;
          poly(pr, mix(C.bg, C.line, shade * (0.35 + 0.65 * fog)), outline, 1);
          if (b.outdoor) continue;
          const pa = project(toCam(c, w.a[0], w.a[1], 0), v), pb = project(toCam(c, w.b[0], w.b[1], 0), v);
          const ph = pa && pb ? Math.max(Math.abs(pa.y - project(toCam(c, w.a[0], w.a[1], b.height), v)?.y || 0), 0) : 0;
          const tall = ph > 28;
          // storey lines
          for (let l = 1; l < b.storeys; l++) {
            const q = clipSeg(toCam(c, w.a[0], w.a[1], l * FLOOR_H), toCam(c, w.b[0], w.b[1], l * FLOOR_H));
            if (!q) continue;
            const p0 = project(q[0], v), p1 = project(q[1], v);
            if (p0 && p1) { ctx.strokeStyle = alpha(C.line, 0.9 * fog); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); }
          }
          if (!tall || !pa || !pb) continue;
          // windows: lit by who is on that storey
          const cols = Math.max(1, Math.floor(w.len / 1.7));
          for (let l = 0; l < b.storeys; l++) {
            const n = floorsLit[l] || 0;
            const litShare = Math.min(1, n / Math.max(1, cols * 0.6));
            for (let k = 0; k < cols; k++) {
              const t0 = (k + 0.28) / cols, t1 = (k + 0.72) / cols;
              const x0 = w.a[0] + (w.b[0] - w.a[0]) * t0, y0 = w.a[1] + (w.b[1] - w.a[1]) * t0;
              const x1 = w.a[0] + (w.b[0] - w.a[0]) * t1, y1 = w.a[1] + (w.b[1] - w.a[1]) * t1;
              const wq = quad(x0, y0, x1, y1, l * FLOOR_H + 0.7, l * FLOOR_H + 1.75);
              if (!wq) continue;
              const lit = hash01(`${b.id}|${l}|${k}|${w.n}`) < litShare;
              poly(wq, lit ? alpha(l % 3 === 0 ? C.warn : C.accent, 0.55 * fog) : alpha(C.ghost, 0.55 * fog), null);
            }
          }
          // a door on every long wall: walk into it
          if (w.len >= 2.5) {
            const t0 = 0.5 - 0.55 / w.len, t1 = 0.5 + 0.55 / w.len;
            const dq = quad(w.a[0] + (w.b[0] - w.a[0]) * t0, w.a[1] + (w.b[1] - w.a[1]) * t0, w.a[0] + (w.b[0] - w.a[0]) * t1, w.a[1] + (w.b[1] - w.a[1]) * t1, 0, 1.6);
            if (dq) poly(dq, alpha(C.accent, 0.18 * fog), alpha(C.accent, 0.9 * fog), 1);
          }
        }
        if (b.outdoor) {
          // an open lot: a few pixel trees for the green, lamp posts elsewhere
          const r = b.rect, n = Math.max(2, Math.round((r.w * r.h) / 12));
          for (let i = 0; i < n; i++) {
            const x = r.x + r.w * hash01(b.id + "tx" + i), y = r.y + r.h * hash01(b.id + "ty" + i);
            const p = project(toCam(c, x, y, 0), v), q = project(toCam(c, x, y, b.id === "the-green" ? 2.2 : 3), v);
            if (!p || !q || !inFov(toCam(c, x, y))) continue;
            ctx.strokeStyle = alpha(C.mute, fog); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
            const rr = Math.max(1.5, (0.7 / p.f) * v.focal);
            ctx.fillStyle = alpha(b.id === "the-green" ? C.accent : C.warn, 0.45 * fog);
            ctx.fillRect(q.x - rr, q.y - rr, rr * 2, rr * 2);
          }
        }
        // the sign on the roofline
        const top = labelOk ? project(toCam(c, b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2, b.height + 0.9), v) : null;
        if (top) {
          const px = Math.min(15, (0.9 / top.f) * v.focal);
          if (px >= 7) {
            ctx.font = `${Math.round(px)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
            ctx.fillStyle = alpha(b.outdoor ? C.dim : C.fg, 0.95 * fog);
            ctx.fillText(b.name, top.x, top.y);
          }
        }
        if (polys.length) hb.push({ b, polys });
      }
      function drawRail(it, v) {
        const fog = fogAt(it.d);
        for (const off of [-0.45, 0.45]) {
          const tan = Math.atan2(it.e.y - it.a.y, it.e.x - it.a.x), nx = -Math.sin(tan) * off, ny = Math.cos(tan) * off;
          const s = clipSeg(toCam(c, it.a.x + nx, it.a.y + ny, LOOP_H), toCam(c, it.e.x + nx, it.e.y + ny, LOOP_H));
          if (!s) continue;
          const p = project(s[0], v), q = project(s[1], v);
          if (!p || !q) continue;
          ctx.strokeStyle = alpha(C.dim, 0.75 * fog); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
        if (it.pillar) {
          const p = project(toCam(c, it.a.x, it.a.y, 0), v), q = project(toCam(c, it.a.x, it.a.y, LOOP_H - 0.1), v);
          if (p && q && p.f > 1.5) { ctx.strokeStyle = alpha(C.line, 0.9 * fog); ctx.lineWidth = Math.min(10, Math.max(1, (0.35 / p.f) * v.focal)); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
        }
        ctx.lineWidth = 1;
      }
      function drawStation(st, v, labelOk) {
        const fog = fogAt(Math.hypot(st.x - c.x, st.y - c.y));
        const n = st.n || { x: 0, y: -1 };
        const tx = -n.y, ty = n.x;   // along the track
        const cx = st.x + n.x * 1.2, cy = st.y + n.y * 1.2;
        const L = 3.2, Wd = 0.9;
        const pts = [[cx - tx * L - n.x * Wd, cy - ty * L - n.y * Wd], [cx + tx * L - n.x * Wd, cy + ty * L - n.y * Wd], [cx + tx * L + n.x * Wd, cy + ty * L + n.y * Wd], [cx - tx * L + n.x * Wd, cy - ty * L + n.y * Wd]];
        // the platform: a slab with a visible edge face, on two legs
        for (let i = 0; i < 4; i++) {
          const a = pts[i], e = pts[(i + 1) % 4];
          const mx = (a[0] + e[0]) / 2 - cx, my = (a[1] + e[1]) / 2 - cy;
          if ((c.x - (cx + mx)) * mx + (c.y - (cy + my)) * my <= 0) continue;
          const q = quad(a[0], a[1], e[0], e[1], LOOP_H - 0.75, LOOP_H - 0.15);
          if (q) poly(q, alpha(C.panel, 0.95), alpha(C.accent, 0.55 * fog));
        }
        for (const t of [-0.7, 0.7]) {
          const lx = cx + tx * L * t, ly = cy + ty * L * t;
          const p = project(toCam(c, lx, ly, 0), v), q = project(toCam(c, lx, ly, LOOP_H - 0.75), v);
          if (p && q && p.f > 1.5) { ctx.strokeStyle = alpha(C.line, 0.9 * fog); ctx.lineWidth = Math.min(8, Math.max(1, (0.3 / p.f) * v.focal)); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.lineWidth = 1; }
        }
        const cp = clipNear(pts.map(([x, y]) => toCam(c, x, y, LOOP_H - 0.15)));
        if (cp.length >= 3) { const pr = cp.map(p => project(p, v)); if (pr.every(Boolean)) poly(pr, alpha(C.accent, 0.12 * fog), alpha(C.accent, 0.7 * fog)); }
        const sp = labelOk ? project(toCam(c, cx, cy, LOOP_H + 2.2), v) : null;
        if (sp) {
          const px = Math.min(14, (0.8 / sp.f) * v.focal);
          if (px >= 7) { ctx.font = `${Math.round(px)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillStyle = alpha(C.warn, 0.95 * fog); ctx.fillText(st.name, sp.x, sp.y); }
        }
      }
      function drawCar(it, v) {
        const fog = fogAt(it.d);
        const yaw = ringTangent(it.s), fx = Math.sin(yaw), fy = -Math.cos(yaw), rx = Math.cos(yaw), ry = Math.sin(yaw);
        const hl = 1.15, hw = 0.6, z0 = LOOP_H + 0.1, z1 = LOOP_H + 1.5;
        const corners = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].map(([a, b]) => [it.p.x + fx * a + rx * b, it.p.y + fy * a + ry * b]);
        for (let i = 0; i < 4; i++) {
          const a = corners[i], b = corners[(i + 1) % 4];
          const mx = (a[0] + b[0]) / 2 - it.p.x, my = (a[1] + b[1]) / 2 - it.p.y;
          if ((c.x - (it.p.x + mx)) * mx + (c.y - (it.p.y + my)) * my <= 0) continue;
          const q = quad(a[0], a[1], b[0], b[1], z0, z1);
          if (!q) continue;
          poly(q, alpha(C.panel, 0.95), alpha(C.warn, 0.85 * fog), 1);
          const wq = quad(a[0] + (b[0] - a[0]) * 0.15, a[1] + (b[1] - a[1]) * 0.15, a[0] + (b[0] - a[0]) * 0.85, a[1] + (b[1] - a[1]) * 0.85, z0 + 0.55, z0 + 1.05);
          if (wq) poly(wq, alpha(C.warn, 0.35 * fog), null);
        }
      }
      function drawPerson(it, v, now, hp) {
        const z = heightOf(it.w);
        const base = toCam(c, it.w.x, it.w.y, z);
        if (!inFov(base)) return;
        const p = project(base, v), q = project(toCam(c, it.w.x, it.w.y, z + PERSON_H), v);
        if (!p || !q) return;
        const fog = fogAt(p.f);
        const hpx = p.y - q.y;
        if (hpx < 11) {
          const col = FAMILY_COLOR[familyOf(it.s)] || C.dim;
          ctx.fillStyle = alpha(col, fog);
          const r = Math.max(1.2, hpx / 5);
          ctx.fillRect(p.x - r, p.y - r * 2.5, r * 2, r * 2.5);
          hp.push({ s: it.s, w: it.w, x: p.x - 4, y: p.y - 10, w2: 8, h: 10, f: p.f });
          return;
        }
        const e = sheetFor(it.s);
        const wpx = hpx * (SPRITE_W / SPRITE_H);
        const walking = it.w.activity === "commute" && (it.w.sub === "walking" || !it.w.sub) && !reduce.current;
        const fr = walking && e.frames > 1 ? Math.floor(now / 260 + hash01(it.s.name) * 4) % 2 : 0;
        ctx.globalAlpha = Math.max(0.25, fog);
        try { ctx.drawImage(e.img, fr * SPRITE_W, 0, SPRITE_W, SPRITE_H, Math.round(p.x - wpx / 2), Math.round(q.y), Math.round(wpx), Math.round(hpx)); } catch { /* not decoded */ }
        ctx.globalAlpha = 1;
        if (it.s.you) {
          ctx.fillStyle = C.accent; ctx.font = `${Math.round(Math.min(14, Math.max(9, hpx / 5)))}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
          ctx.fillText("▼ YOU", p.x, q.y - 2);
        }
        hp.push({ s: it.s, w: it.w, x: p.x - wpx / 2, y: q.y, w2: wpx, h: hpx, f: p.f });
      }
      function drawSign(it, v) {
        const p = project(toCam(c, it.x, it.y, 3.6), v), b = project(toCam(c, it.x, it.y, 0), v);
        if (!p || !b) return;
        const fog = fogAt(p.f), px = Math.min(18, (1.1 / p.f) * v.focal);
        if (px < 7) return;
        ctx.strokeStyle = alpha(C.mute, fog); ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.font = `${Math.round(px)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        const tw = ctx.measureText(it.text).width;
        ctx.fillStyle = alpha(C.bg, 0.85 * fog); ctx.fillRect(p.x - tw / 2 - 4, p.y - px - 4, tw + 8, px + 6);
        ctx.strokeStyle = alpha(C.accent, 0.8 * fog); ctx.strokeRect(p.x - tw / 2 - 4, p.y - px - 4, tw + 8, px + 6);
        ctx.fillStyle = alpha(C.accent, fog); ctx.fillText(it.text, p.x, p.y);
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
    return () => { cancelAnimationFrame(raf); ro?.disconnect(); io?.disconnect(); document.removeEventListener("visibilitychange", onVis); };
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
