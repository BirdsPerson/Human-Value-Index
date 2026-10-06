// DEEP ZOOM: the tower cutaway, closer. One camera over the whole tower (zoomCam.js): BUILDING,
// then a FLOOR (one storey fills the width, the residents legible), a FLAT (its rooms large), a
// ROOM (the furniture at full size, the residents with a pose and a tag, the pieces answering a
// tap). Pinch, wheel or trackpad to zoom, drag to pan, tap a floor / flat / room to fly to it;
// the breadcrumb says where you are and steps back. Keys: + - arrows Enter Esc; gamepad: triggers
// zoom, d-pad moves, A in, B out. The camera glides (instantly under reduced motion). Closer
// zooms are not a bigger bitmap: drawRoom paints at the room's real size, so the furniture, the
// paper and the floor boards get more pixels, with the scale snapped to half steps (crisp).
// Lazy: Cutaway.jsx fetches this chunk on the first zoom. The route follows the camera:
// #city/<district>/<tower>?flat=<id>&zoom=flat|room[&room=<purpose>].
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PURPOSE_NAME, nameplate, isDark } from "./tower.js";
import { floorStyle } from "./furniture.js";
import { roomIn, clockAt } from "./simApi.js";
import { placeAll } from "./tower.js";
import { FONT } from "./cityUi.jsx";
import { takeTvBoxes } from "./ebtvFrame.js";
import { drawRoom, lookOf, tagsOf, wallOf, lampRoom, fitText } from "./Cutaway.jsx";
import { displayName } from "../figures.js";
import { readCaseId } from "../caseFile.jsx";
import { useShops, Closet, playAtHome, injectShopStyles } from "../shops/parts.jsx";
import { withIssuedPc } from "../economy/shops.js";
import {
  worldOf, fitCam, clampCam, stepCam, levelAt, focusAt, hitWorld, screenToWorld, unitAt, roomAt, moveFocus, crumbs,
  nextLevel, itemBoxes, topBox, itemAction, linkParams, parseLink, LEVEL_NAME, GEO,
} from "./zoomCam.js";

const CSS = `
  .hvi-dz { position: fixed; inset: 0; z-index: 70; display: flex; flex-direction: column; background: #050a07; color: var(--fg); outline: none; touch-action: none; }
  .hvi-dz-bar { display: flex; align-items: center; gap: 4px; flex: none; padding: 4px 6px; border-bottom: var(--bw) solid var(--accent); background: var(--bg); }
  .hvi-dz-bar button { font: inherit; font-size: var(--t-xs); min-width: 44px; min-height: 44px; background: none; color: var(--accent); border: var(--bw) solid var(--line); cursor: pointer; padding: 0 8px; flex: none; }
  @media (max-width: 520px) { .hvi-dz-bar { gap: 2px; padding: 4px; } .hvi-dz-bar button { padding: 0 4px; } .hvi-dz-back { display: none; } }
  .hvi-dz-bar button[aria-current="step"] { background: var(--accent); color: var(--bg); border-color: var(--accent); }
  .hvi-dz-crumbs { display: flex; align-items: center; flex: 1; min-width: 0; overflow-x: auto; scrollbar-width: none; gap: 2px; }
  .hvi-dz-crumbs span { color: var(--fg-mute); flex: none; }
  .hvi-dz-crumbs button { max-width: 40vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hvi-dz-stage { position: relative; flex: 1; min-height: 0; }
  .hvi-dz-stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; touch-action: none; cursor: grab; }
  .hvi-dz-foot { flex: none; padding: 6px var(--s3) calc(var(--safe-b, 0px) + 6px); border-top: var(--bw) solid var(--line); background: var(--bg); font-size: var(--t-xs); color: var(--fg-dim); display: flex; gap: var(--s2); align-items: center; flex-wrap: wrap; min-height: 44px; }
  .hvi-dz-foot b { color: var(--accent); }
  .hvi-dz-foot button { font: inherit; font-size: var(--t-xs); min-height: 44px; padding: 0 10px; background: none; color: var(--accent); border: var(--bw) solid var(--accent); cursor: pointer; }
  .hvi-dz-panel { position: absolute; left: 0; right: 0; bottom: 0; max-height: 60%; overflow-y: auto; background: var(--bg); border-top: var(--bw) solid var(--accent); padding: var(--s3); z-index: 2; }
`;
const h01 = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const rd = Math.round;

function ClosetPanel({ onClose }) {
  const caseId = readCaseId();
  const S = useShops(caseId);
  useEffect(() => { injectShopStyles(); }, []);
  return (
    <div className="hvi-dz-panel">
      <button type="button" style={{ font: "inherit", minHeight: 44, minWidth: 44, background: "none", color: "var(--accent)", border: "var(--bw) solid var(--accent)", cursor: "pointer", float: "right" }} onClick={onClose} aria-label="Close the closet">[ X ]</button>
      <div className="hvi-tw-sub" style={{ margin: "0 0 var(--s2)" }}>THE BEDROOM CLOSET</div>
      <Closet caseId={caseId} S={S} />
    </div>
  );
}

export default function DeepZoom({ plan, name, censusRef, mine, start, onOpen, onClose }) {
  const world = useMemo(() => worldOf(plan), [plan]);
  const rootRef = useRef(null), wrapRef = useRef(null), canRef = useRef(null);
  const V = useRef({ vw: 360, vh: 600, dpr: 1, cam: null, tgt: null, f: start.f, level: start.level, place: null, seenV: -1, hits: [], pick: null, kbd: false, dirty: true, last: 0, reduced: false, drew: null, ptr: new Map(), gp: {} }).current;
  V.mine = mine; V.world = world;
  const [crumb, setCrumb] = useState({ level: start.level, f: start.f });
  const navRef = useRef(null);
  const [pick, setPick] = useState(null);     // {label, action}
  const [panel, setPanel] = useState(false);
  const [snap, setSnap] = useState(null);     // the placement, when it changes (for the words)

  // ---- looks, per unit: the dressing, your own flat with the Department's PC ----------------------
  const unitLook = (st, u) => {
    const L = lookOf(plan, st, u, tagsOf(V.place?.residents.get(u.id)));
    return L && u.id === V.mine ? withIssuedPc(L, u) : L;
  };
  const goLevel = useCallback((level, f, instant) => {
    const t = clampCam(world, fitCam(world, V.vw, V.vh, level, f || V.f), V.vw, V.vh);
    V.tgt = t; V.f = f || V.f; V.manual = false;
    if (instant || V.reduced) V.cam = { ...t };
    V.dirty = true;
  }, [world, V]);
  V.goLevel = goLevel;

  // ---- the route and the clock ------------------------------------------------------------------
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    V.reduced = !!mq?.matches;
    const on = () => { V.reduced = !!mq?.matches; };
    mq?.addEventListener?.("change", on);
    return () => mq?.removeEventListener?.("change", on);
  }, [V]);
  useEffect(() => {   // a new route while open (YOUR FLAT clicked from here): fly there
    if (!V.cam) return;
    goLevel(start.level, start.f);
  }, [start]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- input --------------------------------------------------------------------------------------
  const zoomBy = useCallback((k, sx, sy) => {
    const z0 = V.cam.z, p = screenToWorld(V.cam, V.vw, V.vh, sx, sy);
    const n = clampCam(world, { ...V.cam, z: z0 * k }, V.vw, V.vh);
    // keep the world point under the cursor still
    n.cx = p.x - (sx - V.vw / 2) / n.z; n.cy = p.y - (sy - V.vh / 2) / n.z;
    V.cam = clampCam(world, n, V.vw, V.vh); V.tgt = { ...V.cam }; V.dirty = true; V.manual = true;
  }, [V, world]);
  const panBy = useCallback((dx, dy) => {
    V.cam = clampCam(world, { ...V.cam, cx: V.cam.cx - dx / V.cam.z, cy: V.cam.cy - dy / V.cam.z }, V.vw, V.vh); V.tgt = { ...V.cam }; V.dirty = true; V.manual = true;
  }, [V, world]);
  const stepIn = useCallback(() => goLevel(nextLevel(world, V.vw, V.vh, V.level, V.f, 1), V.f), [goLevel, V, world]);
  const stepOut = useCallback(() => { if (V.level === "building") onClose(); else goLevel(nextLevel(world, V.vw, V.vh, V.level, V.f, -1), V.f); }, [goLevel, V, world, onClose]);
  const move = useCallback((dir) => { V.kbd = true; setPick(null); V.pick = null; goLevel(V.level, moveFocus(world, V.f, V.level, dir)); }, [goLevel, V, world]);
  V.stepIn = stepIn; V.stepOut = stepOut; V.move = move;

  const tap = useCallback((sx, sy) => {
    V.kbd = false;
    const p = screenToWorld(V.cam, V.vw, V.vh, sx, sy), h = hitWorld(world, p.x, p.y);
    if (!h || h.k < 0) { if (V.level !== "building" && !h) stepOut(); return; }
    const f = { i: h.i, k: h.k, j: h.j };
    if (V.level === "building") { goLevel("floor", f); return; }
    if (V.level === "floor") { goLevel("flat", f); return; }
    if (V.level === "flat") { goLevel("room", f); return; }
    // ROOM: a person, then a piece; a neighbouring room flies there
    const here = roomAt(world, V.f);
    const rm = world.at[f.i].units[f.k].rooms[f.j];
    if (rm.rm.id !== here.rm.id) { setPick(null); V.pick = null; goLevel("room", f); return; }
    for (let n = V.hits.length - 1; n >= 0; n--) { const q = V.hits[n]; if (sx >= q[0] && sx <= q[2] && sy >= q[1] && sy <= q[3]) { onOpen?.(q[4]); return; } }
    const row = world.at[f.i], u = row.units[f.k], st = row.st;
    const look = unitLook(st, u.u), furn = look ? look.rooms[rm.rm.id]?.furniture : rm.rm.furniture;
    const X0 = (rm.x - V.cam.cx) * V.cam.z + V.vw / 2, Y0 = (rm.y - V.cam.cy) * V.cam.z + V.vh / 2;
    const box = topBox(itemBoxes(furn, !!look, rd(X0), rd(Y0), rd(rm.w * V.cam.z), rd(rm.h * V.cam.z), true), sx, sy, 3);
    if (!box) { setPick(null); V.pick = null; V.dirty = true; return; }
    const action = itemAction(box, u.u.id === V.mine);
    V.pick = { roomId: rm.rm.id, item: box.item }; V.dirty = true;
    setPick({ label: box.name, action, item: box.item });
  }, [V, world, goLevel, stepOut, onOpen]);   // eslint-disable-line react-hooks/exhaustive-deps
  const activate = useCallback((pk) => {
    if (!pk) return;
    if (pk.action.kind === "closet") setPanel(true);
    else if (pk.action.play) playAtHome(pk.action.play);
  }, []);

  useEffect(() => {
    const el = canRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault(); V.kbd = false;
      const r = el.getBoundingClientRect(), dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomBy(Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0016)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [V, zoomBy]);
  const pt = (e) => { const r = canRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const onDown = (e) => {
    try { canRef.current.setPointerCapture?.(e.pointerId); } catch { /* a synthetic pointer */ }
    V.ptr.set(e.pointerId, { ...pt(e), x0: pt(e).x, y0: pt(e).y, t0: performance.now(), moved: false });
    if (V.ptr.size === 2) { const [a, b] = [...V.ptr.values()]; V.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; for (const q of V.ptr.values()) q.moved = true; }
  };
  const onMove = (e) => {
    const q = V.ptr.get(e.pointerId);
    if (!q) return;
    const p = pt(e);
    if (V.ptr.size === 2) {
      const prev = [...V.ptr.values()], ox = (prev[0].x + prev[1].x) / 2, oy = (prev[0].y + prev[1].y) / 2;
      q.x = p.x; q.y = p.y;
      const [a, b] = [...V.ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (V.pinch) { zoomBy(d / V.pinch.d, mx, my); panBy(mx - ox, my - oy); V.pinch.d = d; }
      return;
    }
    if (!q.moved && Math.hypot(p.x - q.x0, p.y - q.y0) > 6) q.moved = true;
    if (q.moved) { panBy(p.x - q.x, p.y - q.y); V.kbd = false; }
    q.x = p.x; q.y = p.y;
  };
  const onUp = (e) => {
    const q = V.ptr.get(e.pointerId);
    V.ptr.delete(e.pointerId);
    if (V.ptr.size < 2) V.pinch = null;
    if (q && !q.moved && performance.now() - q.t0 < 600 && e.type === "pointerup") tap(q.x, q.y);
  };
  const onKey = (e) => {
    const k = e.key;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    if (map[k]) { e.preventDefault(); move(map[k]); }
    else if (k === "+" || k === "=") { e.preventDefault(); stepIn(); }
    else if (k === "-" || k === "_") { e.preventDefault(); stepOut(); }
    else if (k === "Enter" || k === " ") {
      e.preventDefault();
      if (V.level === "room" && pick) activate(pick); else stepIn();
    } else if (k === "Escape" || k === "Backspace") {
      e.preventDefault();
      if (panel) setPanel(false); else if (pick) { setPick(null); V.pick = null; V.dirty = true; } else stepOut();
    } else if (k === "0" || k === "Home") { e.preventDefault(); goLevel("building", V.f); }
  };

  // ---- the loop -----------------------------------------------------------------------------------
  useEffect(() => {
    const cv = canRef.current, wrap = wrapRef.current;
    if (!cv || !wrap) return undefined;
    let raf = 0, alive = true, prev = performance.now();
    const size = () => {
      const w = Math.max(200, wrap.clientWidth), h = Math.max(160, wrap.clientHeight), dpr = Math.min(2, window.devicePixelRatio || 1);
      if (w === V.vw && h === V.vh && dpr === V.dpr && V.cam) return;
      const first = !V.cam;
      V.vw = w; V.vh = h; V.dpr = dpr;
      cv.width = rd(w * dpr); cv.height = rd(h * dpr);
      if (first) {   // open from the whole building and fly in
        V.cam = fitCam(world, w, h, "building");
        goLevel(start.level, start.f);
      } else { V.cam = clampCam(world, V.cam, w, h); V.tgt = clampCam(world, fitCam(world, w, h, V.level, V.f), w, h); }
      V.dirty = true;
    };
    const ro = window.ResizeObserver ? new ResizeObserver(size) : null;
    ro?.observe(wrap);
    function census() {
      const C = censusRef.current;
      if (C.v === V.seenV && V.place) return;
      V.seenV = C.v;
      const mt = C.mt ?? clockAt(Date.now()).mt, entries = [];
      for (const e of C.list) { if (!e.s || e.s.crowd) continue; entries.push({ s: e.s, w: e.w, r: roomIn(e.w, e.s) }); }
      const P = placeAll(plan, entries, mt);
      V.place = P; V.mt = mt; V.dirty = true;
      let sig = "";
      for (const [k, r] of P.at) sig += `${k}>${r};`;
      if (sig !== V.sig) { V.sig = sig; setSnap({ ...P, mt }); }
    }
    function pad() {
      const gps = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
      const g = gps[0];
      if (!g) return;
      const b = (n) => g.buttons[n]?.value || (g.buttons[n]?.pressed ? 1 : 0), edge = (n) => { const on = b(n) > 0.5, was = V.gp[n]; V.gp[n] = on; return on && !was; };
      const dt = Math.min(0.1, (performance.now() - prev) / 1000) || 0.016;
      const zin = b(7) - b(6);
      if (Math.abs(zin) > 0.08) zoomBy(Math.exp(zin * dt * 1.6), V.vw / 2, V.vh / 2);
      const ax = g.axes[0] || 0, ay = g.axes[1] || 0;
      if (Math.abs(ax) > 0.2 || Math.abs(ay) > 0.2) panBy(-ax * dt * 420, -ay * dt * 420);
      if (edge(12)) V.move("up"); if (edge(13)) V.move("down"); if (edge(14)) V.move("left"); if (edge(15)) V.move("right");
      if (edge(0)) V.stepIn(); if (edge(1)) V.stepOut();
    }
    function frame(now) {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
      census(); size();
      if (!V.cam) return;
      pad();
      if (!V.ptr.size) V.cam = stepCam(V.cam, V.tgt, dt, V.reduced);
      const moving = V.drew && (Math.abs(V.cam.z / V.drew.z - 1) > 1e-4 || Math.abs(V.cam.cx - V.drew.cx) > 1e-3 || Math.abs(V.cam.cy - V.drew.cy) > 1e-3);
      // the level and the focus are read off the camera
      const lvl = levelAt(world, V.cam, V.vw, V.vh);
      const f = V.manual ? focusAt(world, V.cam.cx, V.cam.cy) : V.f;
      const sh = V.shown;
      if (!sh || lvl !== sh.level || f.i !== sh.f.i || f.k !== sh.f.k || f.j !== sh.f.j) {
        V.level = lvl; V.f = f; V.shown = { level: lvl, f };
        setCrumb({ level: lvl, f });
        syncRoute(plan, f, lvl);
        if (V.pick && (lvl !== "room" || roomAt(world, f).rm.id !== V.pick.roomId)) { V.pick = null; setPick(null); }
      }
      if (!(V.dirty || moving || now - V.last > 110)) return;
      V.last = now; V.dirty = false; V.drew = { ...V.cam };
      paint(now);
    }
    function paint(now) {
      const { vw, vh, cam, dpr } = V, z = cam.z;
      const c = cv.getContext("2d");
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.imageSmoothingEnabled = false;
      const mt = censusRef.current.mt ?? clockAt(Date.now()).mt, hour = ((mt % 24) + 24) % 24, night = isDark(hour);
      c.fillStyle = night ? "#04080a" : "#0d1a16"; c.fillRect(0, 0, vw, vh);
      takeTvBoxes();
      V.hits = [];
      const t = V.reduced ? 0 : now / 1000, P = V.place;
      const X = (wx) => rd((wx - cam.cx) * z + vw / 2), Y = (wy) => rd((wy - cam.cy) * z + vh / 2);
      const storeyRows = world.rows.filter(r => r.kind === "storey");
      for (const row of world.rows) {
        const y0 = Y(row.y), y1 = Y(row.y + row.h);
        if (y1 < 0 || y0 > vh) continue;
        if (row.kind !== "storey") {
          c.fillStyle = row.kind === "roof" ? (night ? "#050a08" : "#0f2620") : row.kind === "street" ? "#121a15" : "#0d120f";
          c.fillRect(X(0), y0, rd(world.W * z), y1 - y0);
          if (row.kind === "street") { c.fillStyle = "#24332a"; c.fillRect(X(0), y0, rd(world.W * z), Math.max(1, rd(3 * z))); }
          if (row.kind === "roof" && night) { c.fillStyle = "#3d5a48"; for (let k = 0; k < 14; k++) c.fillRect(X(h01(`${plan.id}|star|${k}`) * world.W), y0 + rd(h01(`${plan.id}|sy|${k}`) * (y1 - y0 - 6)), Math.max(1, rd(z)), Math.max(1, rd(z))); }
          continue;
        }
        const st = row.st, sy0 = Y(row.iy), sy1 = Y(row.iy + row.ih), rh = sy1 - sy0;
        c.fillStyle = "#0c120e"; c.fillRect(X(GEO.SHAFT), y0, rd((world.W - GEO.SHAFT) * z), y1 - y0);
        c.fillStyle = wallOf(plan, st); c.fillRect(X(world.x0), y0, X(world.x1) - X(world.x0), y1 - y0);
        const fs = floorStyle(st.id, st.code === "PH");
        for (const un of row.units) {
          const ux0 = X(un.x), ux1 = X(un.x + un.w);
          if (ux1 < 0 || ux0 > vw) continue;
          const look = unitLook(st, un.u);
          const lamp = look && night && !(P?.units.get(un.u.id)) ? lampRoom(un.u, mt, (P?.residents.get(un.u.id) || []).length > 0) : null;
          if (!look) { c.fillStyle = h01(un.u.id) < 0.5 ? "rgba(255,240,200,0.07)" : "rgba(120,200,220,0.07)"; c.fillRect(ux0, sy0, ux1 - ux0, rh); }
          for (const q of un.rooms) {
            const rx0 = X(q.x), rx1 = X(q.x + q.w);
            if (rx1 < 0 || rx0 > vw) continue;
            const people = P?.rooms.get(q.rm.id) || [];
            if (rh < 20) {   // too small to dress: a block of its wall, lit when someone is up
              c.fillStyle = look ? look.wall : "#1b2328"; c.fillRect(rx0, sy0, rx1 - rx0, rh);
              if (night && (people.some(p => p.act !== "sleep") || lamp === q.rm.id)) { c.fillStyle = "rgba(255,200,110,0.5)"; c.fillRect(rx0 + 1, sy0 + 1, Math.max(1, rx1 - rx0 - 2), Math.max(1, rh - 3)); }
              else if (people.length) { c.fillStyle = "rgba(120,220,160,0.35)"; c.fillRect(rx0 + 1, sy0 + rh - 3, Math.max(1, rx1 - rx0 - 2), 2); }
            } else {
              c.save(); c.beginPath(); c.rect(rx0, sy0, rx1 - rx0, rh); c.clip();
              drawRoom(c, q.rm, rx0, sy0, rx1 - rx0, rh, { night, sprite: rh >= 36, t, reduced: V.reduced, people, look, lamp: lamp === q.rm.id, sheet: rh >= 36, snap: true, detail: rh >= 110, hits: V.hits });
              c.restore();
              if (V.pick && V.pick.roomId === q.rm.id) {
                const fur = look ? look.rooms[q.rm.id]?.furniture : q.rm.furniture;
                const bx = itemBoxes(fur, !!look, rx0, sy0, rx1 - rx0, rh, true).find(b => b.item === V.pick.item);
                if (bx) { c.strokeStyle = "#fbbf24"; c.lineWidth = 2; c.setLineDash([5, 3]); c.strokeRect(rd(bx.x0) - 2, rd(bx.y0) - 2, rd(bx.x1 - bx.x0) + 4, rd(bx.y1 - bx.y0) + 4); c.setLineDash([]); }
              }
            }
            if (q.j > 0) { c.fillStyle = "rgba(0,0,0,0.5)"; c.fillRect(rx0, sy0, Math.max(1, rd(z * 0.5)), rh); }
          }
          c.fillStyle = "#0a0f0a"; c.fillRect(ux1, y0, Math.max(1, rd(GEO.GAP * z)), y1 - y0);
        }
        // the slabs
        c.fillStyle = "#33433a"; c.fillRect(X(GEO.SHAFT - 4), y0, rd((world.W - GEO.SHAFT + 4) * z), Math.max(1, sy0 - y0));
        c.fillStyle = fs.corridor; c.fillRect(X(GEO.SHAFT - 4), sy1, rd((world.W - GEO.SHAFT + 4) * z), Math.max(1, y1 - sy1));
        if (fs.trim) { c.fillStyle = fs.trim; c.fillRect(X(world.x0), y0, X(world.x1) - X(world.x0), Math.max(1, rd(z))); }
        // the lift shaft: the code at the landing
        c.fillStyle = "#070c09"; c.fillRect(X(2), y0, rd((GEO.SHAFT - 4) * z), y1 - y0);
        c.fillStyle = "#1f4a2c"; c.fillRect(X(2), y0, rd((GEO.SHAFT - 4) * z), 1);
        if (rh >= 22) { c.font = `700 ${Math.max(9, Math.min(16, rd(9 * Math.sqrt(z))))}px ${FONT}`; c.textBaseline = "top"; c.fillStyle = st.level === V.f.i ? "#4ade80" : "#4d8a62"; c.fillText(st.code, X(6), sy0 + 3); c.textBaseline = "alphabetic"; }
        // labels: the plaque and the nameplates, where the storey is big enough to read
        if (rh >= 60) {
          const lead = Math.max(X(world.x0), 0), fsz = Math.max(9, Math.min(15, rd(8 * Math.sqrt(z))));
          c.textBaseline = "top";
          c.font = `700 ${fsz}px ${FONT}`;
          const bh = fsz + 5;
          c.fillStyle = "rgba(10,15,10,0.86)"; c.fillRect(Math.max(X(world.x0), 0), sy0, Math.min(X(world.x1), vw) - Math.max(X(world.x0), 0), bh);
          c.fillStyle = "#4ade80"; fitText(c, `${st.code} // ${st.name} // ${st.owner.label || `HELD BY ${st.owner.name}`}`, lead + 3, sy0 + 3, Math.min(X(world.x1), vw) - lead - 6);
          c.font = `${fsz - 1}px ${FONT}`;
          for (const un of row.units) {
            const ux0 = X(un.x), ux1 = X(un.x + un.w);
            if (ux1 < 0 || ux0 > vw || ux1 - ux0 < 40) continue;
            const yours = un.u.id === V.mine, u = un.u;
            const label = yours ? `${u.label} YOUR FLAT` : u.kind === "flat" ? `${u.label} ${nameplate(u, P?.residents || new Map())}` : u.kind === "suite" ? u.label : nameplate(u, P?.residents || new Map());
            const lx = Math.max(ux0, 0), lw = Math.min(ux1, vw) - lx;
            c.fillStyle = yours ? "rgba(60,46,8,0.9)" : "rgba(10,15,10,0.7)"; c.fillRect(lx, sy0 + bh + 1, lw, fsz + 4);
            c.fillStyle = yours ? "#fbbf24" : u.kind === "flat" && !(P?.residents.get(u.id) || []).length ? "#4d8a62" : "#c8f5d8";
            fitText(c, label, lx + 3, sy0 + bh + 3, lw - 6);
            // at ROOM and FLAT zoom each room says what it is
            if (rh >= 160) {
              for (const q of un.rooms) {
                const qx0 = X(q.x), qx1 = X(q.x + q.w); if (qx1 < 0 || qx0 > vw || qx1 - qx0 < 70) continue;
                const nx = Math.max(qx0, 0), nw = Math.min(qx1, vw) - nx;
                c.fillStyle = "rgba(10,15,10,0.7)"; c.fillRect(nx, sy0 + bh + fsz + 6, nw, fsz + 3);
                c.fillStyle = "#4d8a62"; fitText(c, PURPOSE_NAME[q.rm.purpose] || q.rm.purpose, nx + 3, sy0 + bh + fsz + 7, nw - 6);
              }
            }
          }
          c.textBaseline = "alphabetic";
        }
      }
      // the focus, outlined for the keyboard and the pad: the thing Enter or A flies to
      if (V.kbd && V.level !== "room") {
        const row = world.at[V.f.i], un = unitAt(world, V.f), q = roomAt(world, V.f), tgtRoom = V.level === "flat", r = tgtRoom ? q : un;
        c.strokeStyle = "#4ade80"; c.lineWidth = 2; c.setLineDash([5, 3]);
        if (V.level === "building") c.strokeRect(X(world.x0) + 1, Y(row.y) + 1, X(world.x1) - X(world.x0) - 2, Y(row.y + row.h) - Y(row.y) - 2);
        else c.strokeRect(X(r.x) + 1, Y(row.iy) + 1, X(r.x + r.w) - X(r.x) - 2, Y(row.iy + row.ih) - Y(row.iy) - 2);
        c.setLineDash([]);
      }
      takeTvBoxes();
      void storeyRows;
    }
    raf = requestAnimationFrame(frame);
    return () => { alive = false; cancelAnimationFrame(raf); ro?.disconnect(); };
  }, [plan, world, censusRef, V]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const n = navRef.current; if (n) n.scrollLeft = n.scrollWidth; }, [crumb]);
  // the page behind does not scroll; focus lands on the zoom; the route is cleared on the way out
  useEffect(() => {
    const prevOverflow = document.body.style.overflow, back = document.activeElement;
    document.body.style.overflow = "hidden";
    rootRef.current?.focus();
    return () => { document.body.style.overflow = prevOverflow; clearRoute(); try { back?.focus?.(); } catch { /* gone */ } };
  }, []);

  // ---- words --------------------------------------------------------------------------------------
  const P = snap;
  const trail = crumbs(world, name, crumb.f, crumb.level);
  const st = plan.storeys[crumb.f.i], u = st ? unitAt(world, crumb.f).u : null, rmNow = st ? roomAt(world, crumb.f).rm : null;
  const present = (list) => list.reduce((n, r) => n + (P?.rooms.get(r.id)?.length || 0), 0);
  const nHere = crumb.level === "room" ? present([rmNow]) : crumb.level === "flat" ? present(u.rooms) : crumb.level === "floor" ? st.units.reduce((n, q) => n + present(q.rooms), 0) : null;
  const who = crumb.level === "room" ? (P?.rooms.get(rmNow.id) || []).map(p => `${displayName(p.s)}${p.act === "sleep" ? " (asleep)" : ""}`).join(", ") : "";
  const status = `${trail.map(c => c.label).join(", ")}.${nHere != null ? ` ${nHere} present${who ? `: ${who}` : ""}.` : ""}`;
  const lookNow = crumb.level === "room" && u ? (u.kind === "flat" || u.kind === "suite" ? unitLook(st, u) : null) : null;
  const roomItems = crumb.level === "room" && u ? itemBoxes(lookNow ? lookNow.rooms[rmNow.id]?.furniture : rmNow.furniture, !!lookNow, 0, 0, 100, 45, true).map(b => ({ ...b, action: itemAction(b, u.id === V.mine) })).filter(b => b.action.kind !== "none") : [];
  const btn = { font: "inherit" };

  return (
    <div className="hvi-dz" ref={rootRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${name}, deep zoom`} onKeyDown={onKey}>
      <style>{CSS}</style>
      <div className="hvi-dz-bar">
        <button type="button" onClick={stepOut} aria-label={crumb.level === "building" ? "Close the zoom" : `Back out to the ${LEVEL_NAME[LEVEL_UP[crumb.level]].toLowerCase()}`}>‹<span className="hvi-dz-back"> BACK</span></button>
        <nav className="hvi-dz-crumbs" aria-label="Where you are" ref={navRef}>
          {trail.map((c, n) => (
            <span key={c.level} style={{ display: "contents" }}>
              {n > 0 && <span aria-hidden="true">›</span>}
              <button type="button" aria-current={n === trail.length - 1 ? "step" : undefined} style={btn} onClick={() => goLevel(c.level, crumb.f)}>{c.label}</button>
            </span>
          ))}
        </nav>
        <button type="button" onClick={stepOut} aria-label="Zoom out one level">−</button>
        <button type="button" onClick={stepIn} aria-label="Zoom in one level">+</button>
        <button type="button" onClick={onClose} aria-label="Close the zoom and return to the cross-section">[ X ]</button>
      </div>
      <div className="hvi-dz-stage" ref={wrapRef}>
        <canvas ref={canRef} aria-hidden="true" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
        {panel && <ClosetPanel onClose={() => setPanel(false)} />}
      </div>
      <div className="hvi-dz-foot">
        <span role="status" aria-live="polite" className="sr-only">{status}</span>
        <span aria-hidden="true"><b>{LEVEL_NAME[crumb.level]}</b>{nHere != null ? ` // ${nHere} PRESENT` : ""}{crumb.level === "room" && who ? ` // ${who.toUpperCase()}` : ""}</span>
        {pick ? (
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <b>{pick.label}</b>
            {pick.action.kind !== "none" && <button type="button" onClick={() => activate(pick)}>{pick.action.kind === "closet" ? "OPEN" : pick.action.kind === "ebtv" ? "WATCH" : "PLAY"}</button>}
          </span>
        ) : <span aria-hidden="true" style={{ color: "var(--fg-mute)" }}>{crumb.level === "room" ? "TAP A PIECE OR A PERSON." : "TAP TO ZOOM. PINCH OR SCROLL. DRAG TO PAN."}</span>}
        {roomItems.map(b => <button key={b.item} type="button" className="sr-only" onClick={() => activate({ label: b.name, action: b.action })}>{b.action.label}</button>)}
      </div>
    </div>
  );
}
const LEVEL_UP = { building: "building", floor: "building", flat: "floor", room: "flat" };

// ---- the route follows the camera ----------------------------------------------------------------
function writeHash(mut) {
  try {
    const [base, rest = ""] = window.location.hash.split("?");
    const q = new URLSearchParams(rest);
    mut(q);
    const qs = q.toString();
    const next = `${base}${qs ? "?" + qs : ""}`;
    if (next !== window.location.hash) window.history.replaceState(window.history.state, "", next);
  } catch { /* a hash that cannot be rewritten is a hash that stays */ }
}
function syncRoute(plan, f, level) {
  const p = linkParams(plan, f, level);
  writeHash(q => {
    for (const k of ["flat", "zoom", "room"]) { if (p[k] != null) q.set(k, p[k]); else q.delete(k); }
    if (level !== "building") { q.set("floor", String(plan.storeys[f.i].simFloor)); q.set("storey", String(plan.storeys[f.i].level)); }
  });
}
function clearRoute() { writeHash(q => { q.delete("flat"); q.delete("zoom"); q.delete("room"); }); }
export { parseLink };
