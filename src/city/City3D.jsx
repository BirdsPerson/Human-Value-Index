import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import TouchGate from "../ui/TouchGate.jsx";
import { Button, Chip, Chips, ListRow } from "../ui/index.js";
import { SPRITE_W, SPRITE_H } from "../sprites.js";
import { clockAt, whereOf, jobLine, activityLine, roomIn, DISTRICT, DISTRICTS } from "./simApi.js";
import { FAMILY_COLOR, familyOf } from "./cityKit.js";
import { sheetFor, miniFor } from "./spriteBank.js";
import { FONT, SubjectTip, ZoomBar } from "./cityUi.jsx";
import {
  buildScene, viewFor, P, depthOf, panTarget, pointInPoly, hull, locate, subjectPoint, trains, carArc, loopAt, toWorld,
  floorHeight, clampPitch3, clampZoom, ease, buildingHref, floorLabel, BUILDING, BUILDINGS, REST3D, FLOOR_H, LOOP_H, SPAN, CAR_LEN, EMPTY_FLOOR,
  levelOf, carDepth, CLASSIFIED,
} from "./city3d.js";

// THE SUBSTRATE, IN DEPTH. The city as the cube is drawn: a green wireframe built from
// flat planes. Ground plate and district outlines, each building a stack of floor
// rectangles, the Loop a raised ring with stations and trains, subjects as dots on the
// floor they stand on (sprites up close). Drag turns it, wheel or pinch zooms, it orbits
// slowly when left alone. Tap a building and its floors come apart; tap a floor to go in.
// Painter's order: everything is sorted far to near each frame. One rAF loop, paused
// offscreen and in hidden tabs; under reduced motion it only redraws when something changes.

const IDLE_AFTER = 4000;     // ms without input before the slow orbit resumes
const ORBIT = 0.055;         // rad/s
const REST_NARROW = { yaw: -0.95, pitch: -0.95, zoom: 1.05 };
const BORDER = { works: "#7f1d1d", hq: "#3d6b50", archive: "#2f5a45" };
const C = {
  bg: "#060a06", ground: "#070c08", grid: "#0d1810", district: "#2f6a42", fill: "rgba(12,24,15,0.55)",
  floor: "#2f6a42", floorHi: "#4ade80", slab: "rgba(6,10,6,0.35)", roof: "rgba(6,10,6,0.2)", slabOpen: "rgba(6,12,8,0.86)", edge: "#1f4a2c",
  rail: "#3d6b50", pillar: "#16291c", station: "#86efac", car: "#155e75", carHi: "#67e8f9",
  label: "#86efac", labelDim: "#4d8a62", plate: "rgba(6,10,6,0.86)", amber: "#fbbf24",
};

const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);
const NEAR = 80;   // CSS px past the frame inside which a commuter is re-placed every frame

// Keyboard order for [ and ]: district by district (the directory's order), then address.
const D_ORDER = Object.fromEntries(DISTRICTS.map((d, i) => [d.id, i]));
const KEY_ORDER = BUILDINGS.slice().sort((a, b) => (D_ORDER[a.districtId] - D_ORDER[b.districtId]) || String(a.addr || a.id).localeCompare(String(b.addr || b.id))).map(b => b.id);

// ---- the [2D MAP] / [3D] toggle, for City.jsx -----------------------------------------
// Remembered per viewer (a convenience, so it lives in localStorage and survives without it).
const MODE_KEY = "hvi-city-view";
export function useCityViewMode(initial = "2d") {
  const [mode, setMode] = useState(() => {
    try { const m = window.localStorage.getItem(MODE_KEY); return m === "3d" || m === "2d" ? m : initial; } catch { return initial; }
  });
  const set = useCallback((m) => { setMode(m); try { window.localStorage.setItem(MODE_KEY, m); } catch { /* private mode */ } }, []);
  return [mode, set];
}
export function ViewToggle({ mode, onChange }) {
  return (
    <Chips role="group" aria-label="City view">
      <Chip pressed={mode === "2d"} onClick={() => onChange("2d")}>2D MAP</Chip>
      <Chip pressed={mode === "3d"} onClick={() => onChange("3d")}>3D</Chip>
    </Chips>
  );
}

// Styles for the floor panel live with the rest of the city's (cityUi.jsx).
const css3d = "";
function injectCss() {
  let el = document.getElementById("hvi-city3d-styles");
  if (!el) { el = document.createElement("style"); el.id = "hvi-city3d-styles"; document.head.appendChild(el); }
  if (el.textContent !== css3d) el.textContent = css3d;
}

// Memoized: City re-renders on every census tick; the canvas reads the census from the ref.
export default memo(City3D);
function City3D({ censusRef, onDistrict, onOpen, onFloor, query = "" }) {
  const wrapRef = useRef(null), canvasRef = useRef(null), tipRef = useRef(null), apiRef = useRef({});
  const [tip, setTip] = useState(null);
  const [sel, setSel] = useState(null);   // { id, name, districtId, floors: [{index, label, count}] }
  const [cursor, setCursor] = useState("");
  const [status, setStatus] = useState("");   // said aloud when a building opens or closes
  const floorsRef = useRef(null);
  const cb = useRef({}); cb.current = { onDistrict, onOpen, onFloor, query, focusFloors: () => floorsRef.current?.querySelector("button")?.focus() };
  const tipSize = useRef([0, 0]);
  useLayoutEffect(() => { const el = tipRef.current; tipSize.current = el ? [el.offsetWidth, el.offsetHeight] : [0, 0]; apiRef.current.poke?.(); }, [tip]);

  const goFloor = useCallback((districtId, buildingId, floor) => {
    const { onFloor: f, query: q } = cb.current;
    if (CLASSIFIED(BUILDING[buildingId])) floor = null;   // HQ: the Pen, no floor to focus
    if (f) f(districtId, buildingId, floor);
    else window.location.hash = buildingHref(districtId, buildingId, floor, q);
  }, []);

  useEffect(() => {
    injectCss();
    const canvas = canvasRef.current, wrap = wrapRef.current, ctx = canvas.getContext("2d");
    const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const scene = buildScene();
    const V = {
      w: 300, h: 300, dpr: 1, reduced: !!mq?.matches, need: true,
      cam: { ...REST3D, tx: 0, tz: 0 }, goal: null, lastInput: -1e9, drag: null,
      sel: null, open: new Map(),   // buildingId -> explode factor (0..1), animating
      ents: new Map(), seenV: -1, mt: 0,
      hitB: [], hitF: [], hitS: [], hoverB: null, tip: null, t: 0,
    };

    // ---- subjects -----------------------------------------------------------------
    function ent(entry) {
      let e = V.ents.get(entry.s.name);
      if (!e) {
        const fam = familyOf(entry.s);
        e = { s: entry.s, col: FAMILY_COLOR[fam.family] || FAMILY_COLOR.dim, rated: fam.rated, w: entry.w, loc: null, sx: 0, sy: 0 };
        V.ents.set(entry.s.name, e);
      }
      if (e.s !== entry.s) { e.s = entry.s; const fam = familyOf(entry.s); e.col = FAMILY_COLOR[fam.family] || FAMILY_COLOR.dim; e.rated = fam.rated; }
      place(e, entry.w);
      return e;
    }
    // Where the entity stands. On a floor its ground position only changes with the census,
    // so it is kept (bx, bz, level) and only the height is worked out per frame (a building
    // opening lifts its floors). Commuters are re-placed per frame from the machine clock.
    function place(e, w) {
      e.w = w; e.loc = locate(e.s, w);
      if (e.loc) {
        const p = subjectPoint(e.s, w, e.loc, () => 0, () => null);
        e.bx = p[0]; e.bz = p[2]; e.lvl = levelOf(BUILDING[e.loc.buildingId], e.loc.floor);
      }
    }
    function syncCensus() {
      const Cn = censusRef.current;
      if (Cn.v === V.seenV) return;
      V.seenV = Cn.v; V.need = true;
      if (Cn.mt != null) V.mt = Cn.mt;
      const live = new Set();
      for (const entry of Cn.list) { ent(entry); live.add(entry.s.name); }
      for (const k of V.ents.keys()) if (!live.has(k)) V.ents.delete(k);
      publishSel();
      if (V.tip) { const e = V.ents.get(V.tip); if (e) refreshTip(e); }
    }
    // The floor directory under the canvas: counts per floor of the opened building.
    // Counted by simApi.roomIn, the rule the building view and the header use.
    function publishSel() {
      if (!V.sel) {
        if (V.said) { setStatus(`${BUILDING[V.said]?.name || "BUILDING"} SEALED. THE CITY RESUMES.`); V.said = null; }
        V.selCounts = {}; setSel(null); return;
      }
      const b = BUILDING[V.sel];
      const counts = {};
      for (const e of V.ents.values()) { const r = roomIn(e.w, e.s); if (r && r.buildingId === b.id) counts[r.floor] = (counts[r.floor] || 0) + 1; }
      V.selCounts = counts;
      const floors = b.floors.slice().reverse().map(f => ({ index: f.index, label: floorLabel(b, f, counts[f.index] || 0), count: counts[f.index] || 0 }));
      if (V.said !== b.id) {
        V.said = b.id;
        const total = Object.values(counts).reduce((n, x) => n + x, 0);
        setStatus(`${b.name} OPENED // ${b.floors.length} FLOOR${b.floors.length === 1 ? "" : "S"} // ${CLASSIFIED(b) ? "CENSUS CLASSIFIED" : `${total} PRESENT`}. ITS FLOORS ARE LISTED BELOW THE MAP.`);
      }
      setSel(prev => {
        const next = { id: b.id, name: b.name, districtId: b.districtId, floors };
        return prev && prev.id === next.id && JSON.stringify(prev.floors) === JSON.stringify(floors) ? prev : next;
      });
    }

    // ---- camera -------------------------------------------------------------------
    const touch = () => { V.lastInput = performance.now(); V.need = true; };
    function select(id) {
      if (V.sel && V.sel !== id) V.open.set(V.sel, V.open.get(V.sel) ?? 1);
      V.sel = id;
      if (id) {
        if (!V.open.has(id)) V.open.set(id, 0);
        const b = BUILDING[id], c = toWorld(b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2);
        // zoom so the opened stack and its footprint fill most of the frame, no more
        const tall = floorHeight(b.topLevel + 1, 1) - floorHeight(b.bottomLevel, 1);
        const size = Math.max(Math.hypot(b.rect.w, b.rect.h) / SPAN, tall * 1.15);
        const base = viewFor({ ...V.cam, zoom: 1 }, V.w, V.h).scale;
        const zoom = clampN((0.8 * V.h) / (size * base), 1.2, 3.2);
        // and never from so steep that the opened floors stack back onto each other
        V.goal = { tx: c[0], tz: c[2], ty: (floorHeight(b.topLevel + 1, 1) + floorHeight(b.bottomLevel, 1)) / 2, zoom, pitch: clampN(V.cam.pitch, -0.95, -0.45) };
      } else V.goal = { ty: 0 };
      publishSel(); touch();
    }
    function reset() { const r = V.w < 480 ? REST_NARROW : REST3D; select(null); V.goal = { tx: 0, tz: 0, ty: 0, zoom: r.zoom, yaw: r.yaw, pitch: r.pitch }; }
    apiRef.current = {
      zoom: (f) => { V.goal = null; V.cam.zoom = clampZoom(V.cam.zoom * f); touch(); },
      reset,
      close: () => select(null),
      poke: () => { V.need = true; },
    };

    function resize() {
      const w = Math.max(280, Math.floor(wrap.clientWidth));
      const h = Math.round(clampN(w * (w < 480 ? 1.05 : 0.78), 320, Math.min(720, window.innerHeight * 0.72)));
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      // A phone gets the city turned on its diagonal, so it fills the taller frame.
      if (V.w === 300 && w < 480) Object.assign(V.cam, REST_NARROW);
      V.w = w; V.h = h; V.dpr = dpr;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.height = h + "px";
      V.need = true;
    }

    function update(dt) {
      V.t += dt;
      syncCensus();
      const cam = V.cam;
      const idle = !V.reduced && !V.drag && performance.now() - V.lastInput > IDLE_AFTER;
      if (idle) { cam.yaw += ORBIT * dt; V.need = true; }
      if (V.goal) {
        const g = V.goal;
        let done = true;
        for (const k of ["tx", "tz", "ty", "zoom", "yaw", "pitch"]) {
          if (g[k] == null) continue;
          cam[k] = V.reduced ? g[k] : ease(cam[k] ?? 0, g[k], dt, 5);
          if (Math.abs(cam[k] - g[k]) > 1e-4) done = false; else cam[k] = g[k];
        }
        if (done) V.goal = null;
        V.need = true;
      }
      for (const [id, e] of V.open) {
        const to = id === V.sel ? 1 : 0;
        const n = V.reduced ? to : ease(e, to, dt, 5);
        if (to === 0 && n < 0.01) V.open.delete(id); else V.open.set(id, Math.abs(n - to) < 0.002 ? to : n);
        if (n !== e) V.need = true;
      }
      if (!V.reduced) {
        V.mt = clockAt(Date.now()).mt;
        // commuters move every frame: re-place them from the machine clock
        for (const e of V.ents.values()) if (e.w.activity === "commute" && e.near !== false) place(e, whereOf(e.s, V.mt));
        V.need = true;
      }
    }

    // ---- drawing ------------------------------------------------------------------
    const opened = (id) => V.open.get(id) || 0;
    function quad(pts) { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath(); }
    function line(a, b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    const off = (pts, m = 20) => { let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; } return x1 < -m || y1 < -m || x0 > V.w + m || y0 > V.h + m; };

    function draw() {
      const { dpr, w, h } = V;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
      const v = viewFor(V.cam, w, h);
      const Q = (p) => P(p, v);
      const storeyPx = FLOOR_H * v.scale;
      const narrow = w < 480;
      ctx.lineJoin = "round";

      // ground plate, a coarse grid of solder lines, then the district outlines
      const g = scene.ground.map(Q);
      quad(g); ctx.fillStyle = C.ground; ctx.fill();
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
      const [a0, a1, , a3] = scene.ground;
      for (let i = 1; i < 12; i++) { const t = i / 12; line(Q(lerp3(a0, a1, t)), Q(lerp3(a3, scene.ground[2], t))); }
      for (let i = 1; i < 7; i++) { const t = i / 7; line(Q(lerp3(a0, a3, t)), Q(lerp3(a1, scene.ground[2], t))); }
      for (const d of scene.districts) {
        const q = d.quad.map(Q);
        if (off(q)) continue;
        quad(q); ctx.fillStyle = C.fill; ctx.fill();
        ctx.strokeStyle = BORDER[d.id] || C.district; ctx.lineWidth = 1.2; ctx.stroke();
      }

      // everything that stands up, sorted far to near. The opened building is not in the
      // sort: it is drawn last, over a scrim, as the foreground.
      const items = [];
      for (const b of scene.buildings) if (b.id !== V.sel) items.push({ d: depthOf(b.centre, v), k: 0, b });
      // rail pieces sort by their middle; a car sorts nearer than every piece under it
      const segD = scene.segs.map(sg => depthOf(sg.mid, v));
      scene.segs.forEach((sg, i) => items.push({ d: segD[i], k: 1, sg }));
      const TR = trains(V.mt);
      const dwellAt = new Set();
      for (const t of TR) if (t.dwell && t.stationId) dwellAt.add(t.stationId);
      V.dwellAt = dwellAt;
      for (const st of scene.stations) items.push({ d: depthOf(st.at, v) - 0.001, k: 2, st, lit: dwellAt.has(st.districtId) });
      const carWorld = {}, carD = {};
      for (const t of TR) {
        for (let c = 0; c < t.cars; c++) {
          const s = carArc(t, c), A = loopAt(s - CAR_LEN / 2), B = loopAt(s + CAR_LEN / 2), M = loopAt(s);
          const pa = toWorld(A.x, A.y, LOOP_H), pb = toWorld(B.x, B.y, LOOP_H), pm = toWorld(M.x, M.y, LOOP_H + 0.004);
          const key = `${t.id}|${c}`, d = carDepth(s, segD, depthOf(pm, v));
          carWorld[key] = pm; carD[key] = d;
          items.push({ d, k: 3, pa, pb, lead: c === 0, lit: t.dwell });
        }
      }
      const carPos = (id, c) => carWorld[`${id}|${c}`] || null;
      // subjects: inside a building they draw with it (per floor); outside, on their own
      const inB = new Map();
      for (const e of V.ents.values()) {
        let pt;
        if (e.loc) {
          pt = e.pt && e.pt.length === 3 ? e.pt : [0, 0, 0];
          pt[0] = e.bx; pt[1] = floorHeight(e.lvl, opened(e.loc.buildingId)) + 0.0015; pt[2] = e.bz;
          e.pt = pt;
          let m = inB.get(e.loc.buildingId); if (!m) inB.set(e.loc.buildingId, m = new Map());
          let arr = m.get(e.loc.floor); if (!arr) m.set(e.loc.floor, arr = []);
          arr.push(e);
          continue;
        }
        pt = e.pt = subjectPoint(e.s, e.w, e.loc, opened, carPos);
        const S = Q(pt);
        e.near = S.x > -NEAR && S.y > -NEAR && S.x < w + NEAR && S.y < h + NEAR;
        if (S.x < -20 || S.y < -20 || S.x > w + 20 || S.y > h + 20) continue;   // off the frame
        const ck = e.w.leg === "ride" ? `${e.w.trainId}|${e.w.car || 0}` : null;
        items.push({ d: ck && carD[ck] != null ? carD[ck] - 1e-5 : depthOf(pt, v) - 0.003, k: 4, e, S });
      }
      items.sort((x, y) => y.d - x.d);

      V.hitB.length = 0; V.hitF.length = 0; V.hitS.length = 0;
      const anySel = !!V.sel;
      const back = anySel ? 0.6 : 1;   // with a building open, the rest of the city steps back
      const spriteH = (open) => clampN(storeyPx * (open ? 2.2 : 0.95), 0, 64);

      for (const it of items) {
        ctx.globalAlpha = back;
        if (it.k === 0) drawBuilding(it.b, it.d, Q, v, inB.get(it.b.id), anySel, spriteH, storeyPx);
        else if (it.k === 1) {
          const A = Q(it.sg.a), B = Q(it.sg.b);
          if (off([A, B])) continue;
          if (it.sg.pillar) { ctx.strokeStyle = C.pillar; ctx.lineWidth = 1; line(Q(it.sg.pillar), A); }
          ctx.strokeStyle = C.rail; ctx.lineWidth = clampN(storeyPx * 0.35, 1.5, 4); line(A, B);
        } else if (it.k === 2) {
          // a platform with a train standing at it is lit, as on the 2D map
          const st = it.st, q = st.platform.map(Q);
          if (off(q)) continue;
          quad(q); ctx.fillStyle = it.lit ? "rgba(14,116,144,0.6)" : "rgba(10,20,12,0.9)"; ctx.fill();
          ctx.strokeStyle = it.lit ? C.carHi : C.station; ctx.lineWidth = it.lit ? 1.5 : 1; ctx.stroke();
          ctx.strokeStyle = C.pillar; ctx.lineWidth = 1; line(Q(st.foot), Q(st.at));
        } else if (it.k === 3) {
          const A = Q(it.pa), B = Q(it.pb);
          if (off([A, B])) continue;
          const lw = clampN(storeyPx * 0.9, 3, 14);
          ctx.lineCap = "butt"; ctx.strokeStyle = it.lit ? "#0e7490" : C.car; ctx.lineWidth = lw; line(A, B);
          ctx.strokeStyle = it.lit ? "#e0fbff" : C.carHi; ctx.lineWidth = Math.max(1, lw * 0.22);
          const up = { x: 0, y: -lw * 0.35 };
          line({ x: A.x + up.x, y: A.y + up.y }, { x: B.x + up.x, y: B.y + up.y });
          if (it.lead) { ctx.fillStyle = C.carHi; ctx.beginPath(); ctx.arc(B.x, B.y, Math.max(1.5, lw * 0.3), 0, Math.PI * 2); ctx.fill(); }
          ctx.lineCap = "round";
        } else drawSubject(it.e, it.S, false, spriteH(false), back);
      }
      ctx.globalAlpha = 1;
      // the opened building: a scrim over the city, then the stack in front of everything
      if (V.sel) {
        const sb = scene.buildings.find(x => x.id === V.sel);
        ctx.fillStyle = C.bg; ctx.globalAlpha = 0.5 * Math.min(1, opened(V.sel) * 1.5);
        ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
        if (sb) drawBuilding(sb, depthOf(sb.centre, v), Q, v, inB.get(sb.id), anySel, spriteH, storeyPx);
      }

      drawLabels(Q, v, storeyPx, narrow);
      placeTip();
    }

    function drawBuilding(b, depth, Q, v, byFloor, anySel, spriteH, storeyPx) {
      const e = opened(b.id), n = b.storeys;
      const top = floorHeight(b.topLevel, e) + FLOOR_H, bot = floorHeight(b.bottomLevel, e);
      const base = b.base.map(p => Q([p[0], bot, p[2]])), roof = b.base.map(p => Q([p[0], top, p[2]]));
      if (off(base.concat(roof))) return;
      const hl = hull(base.concat(roof));
      V.hitB.push({ id: b.id, hull: hl, d: depth });
      const selected = V.sel === b.id, hover = V.hoverB === b.id;
      const dim = anySel && !selected ? 0.6 : 1;
      ctx.globalAlpha = dim;
      const edge = selected || hover ? C.floorHi : C.floor;
      const apart = e > 0.5;
      // vertical corner edges while the building is closed; guides while it opens
      ctx.strokeStyle = selected ? "rgba(74,222,128,0.35)" : C.edge; ctx.lineWidth = 1;
      if (e > 0.02) ctx.setLineDash([2, 4]);
      for (let i = 0; i < 4; i++) line(base[i], roof[i]);
      ctx.setLineDash([]);
      for (let fi = 0; fi < n; fi++) {
        const f = b.floors[fi], y = floorHeight(f.level, e);
        const q = b.base.map(p => Q([p[0], y, p[2]]));
        const below = f.level < 0 && e <= 0.02;   // basements: under the street, drawn as a ghost
        quad(q); ctx.fillStyle = e > 0.02 ? C.slabOpen : C.slab; if (!below) ctx.fill();
        ctx.strokeStyle = edge; ctx.lineWidth = selected ? 1.4 : 1;
        if (below) { ctx.globalAlpha = dim * 0.35; ctx.setLineDash([2, 3]); }
        ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = dim;
        if (e > 0.02) {
          // a low wall on each opened floor, so the slab reads as a room and not a sheet
          const qt = b.base.map(p => Q([p[0], y + FLOOR_H * 0.45, p[2]]));
          ctx.strokeStyle = "rgba(74,222,128,0.35)";
          for (let i = 0; i < 4; i++) line(q[i], qt[i]);
          quad(qt); ctx.stroke();
          if (selected) V.hitF.push({ b, f, poly: hull(q.concat(qt)), q, top: qt });
        }
        // apart, each floor's people stand on it; closed, they are drawn after the whole
        // stack (below), so the slabs above them do not bury them
        const occ = apart && byFloor?.get(f.index);
        if (occ) for (const s of occ) drawSubject(s, Q(s.pt), true, spriteH(true), dim);
        ctx.globalAlpha = dim;
      }
      // the roof: an outline, so the stack reads as glass from above
      quad(roof); ctx.fillStyle = e > 0.02 ? "rgba(0,0,0,0)" : C.roof; ctx.fill();
      ctx.strokeStyle = edge; ctx.lineWidth = selected ? 1.4 : 1; ctx.stroke();
      if (!apart && byFloor) {
        const levels = [...byFloor.keys()].sort((x, y) => levelOf(b, x) - levelOf(b, y));
        for (const fl of levels) for (const s of byFloor.get(fl)) drawSubject(s, Q(s.pt), false, spriteH(false), dim);
      }
      ctx.globalAlpha = 1;
    }

    function drawSubject(e, S, open, sh, alpha) {
      const home = e.w.activity === "home";
      ctx.globalAlpha = alpha * (home && !open ? 0.8 : 1);
      if (sh >= 18 && (open || !home)) {
        const img = sh < 34 ? miniFor(e.s) : sheetFor(e.s).img;
        const bh = sh, bw = bh * (SPRITE_W / SPRITE_H);
        const x = Math.round(S.x - bw / 2), y = Math.round(S.y - bh);
        ctx.imageSmoothingEnabled = false;
        try {
          if (sh < 34) ctx.drawImage(img, x, y, bw, bh);
          else ctx.drawImage(img, 0, 0, SPRITE_W, SPRITE_H, x, y, bw, bh);
        } catch { /* sheet not decoded yet */ }
        ctx.fillStyle = e.col; ctx.fillRect(S.x - bw * 0.3, S.y - 1, bw * 0.6, e.rated ? 2 : 1);
        V.hitS.push({ e, x: S.x, y: S.y - bh / 2, rx: bw / 2 + 2, ry: bh / 2 + 2 });
      } else {
        const r = clampN(S.f * 2.1 * Math.sqrt(V.cam.zoom), 1.6, 3.6);
        ctx.beginPath(); ctx.arc(S.x, S.y, r, 0, Math.PI * 2);
        if (e.rated) { ctx.fillStyle = e.col; ctx.fill(); } else { ctx.strokeStyle = e.col; ctx.lineWidth = 1; ctx.stroke(); }
        V.hitS.push({ e, x: S.x, y: S.y, rx: r + 3, ry: r + 3 });
      }
      if (e.s.you) { ctx.fillStyle = "#e5ffe9"; ctx.fillRect(S.x - 0.5, S.y - (sh >= 18 ? sh + 7 : 9), 1, 5); }
      e.sx = S.x; e.sy = S.y;
      ctx.globalAlpha = 1;
    }

    // Labels last, screen-aligned on plates, in priority order; one that would overlap a
    // label already placed is skipped, so 400px stays legible.
    function drawLabels(Q, v, storeyPx, narrow) {
      const placed = [];
      const fs = narrow ? 11 : 12;
      ctx.font = `700 ${fs}px ${FONT}`; ctx.textBaseline = "top"; ctx.textAlign = "left";
      // lead: {x, y} a leader line runs from, to the plate's near edge (drawn under the plate)
      const lab = (text, x, y, col, force, lead) => {
        const tw = ctx.measureText(text).width, bw = tw + 6, bh = fs + 4;
        x = clampN(x, 2, V.w - bw - 2); y = clampN(y, 2, V.h - bh - 2);
        const r = { x0: x - 3, y0: y - 2, x1: x - 3 + bw, y1: y - 2 + bh };
        if (!force && placed.some(p => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0)) return false;
        placed.push(r);
        if (lead) {
          const ex = lead.x <= r.x0 ? r.x0 : lead.x >= r.x1 ? r.x1 : null;
          if (ex != null) { ctx.strokeStyle = "rgba(134,239,172,0.5)"; ctx.lineWidth = 1; line(lead, { x: ex, y: y + fs / 2 }); }
        }
        ctx.fillStyle = C.plate; ctx.fillRect(r.x0, r.y0, bw, bh);
        ctx.fillStyle = col; ctx.fillText(text, x, y);
        return true;
      };
      // the opened building: its name over the roof, then each floor, top down. Floors are
      // labelled beside the stack, on whichever side has the room; when narrow, by code and
      // count only (the directory under the map has the names). The top and bottom floors
      // always get a label; the ones between give way rather than pile up.
      if (V.sel) {
        const b = scene.buildings.find(x => x.id === V.sel), e = opened(b.id);
        const floorsDesc = V.hitF.slice().reverse();
        floorsDesc.forEach((hf, i) => {
          const n = V.selCounts?.[hf.f.index] || 0;
          const text = floorLabel(b, hf.f, n, narrow);
          const bw = ctx.measureText(text).width + 6;
          const right = hf.top.reduce((a, p) => (p.x > a.x ? p : a), hf.top[0]);
          const left = hf.top.reduce((a, p) => (p.x < a.x ? p : a), hf.top[0]);
          let at = right, tx = right.x + 10;
          if (tx + bw > V.w - 2 && left.x - 10 - bw >= 2) { at = left; tx = left.x - 10 - bw + 3; }
          const edge = i === 0 || i === floorsDesc.length - 1;
          lab(text, tx, at.y - fs / 2, n || CLASSIFIED(b) ? C.label : C.labelDim, edge, at);
        });
        if (e > 0.2) {
          const top = b.base.map(p => Q([p[0], floorHeight(b.topLevel, e) + FLOOR_H * 1.3, p[2]]));
          const hi = top.reduce((a, p) => (p.y < a.y ? p : a), top[0]);
          lab(`${b.name} // ${DISTRICT[b.districtId]?.name || ""}`, hi.x - 40, hi.y - fs - 10, C.amber, true);
        }
      }
      if (V.hoverB && V.hoverB !== V.sel) {
        const b = BUILDING[V.hoverB], hb = V.hitB.find(x => x.id === V.hoverB);
        if (b && hb) { const tp = hb.hull.reduce((a, p) => (p.y < a.y ? p : a), hb.hull[0]); lab(`${b.name} // ${b.floors.length}F // CLICK TO OPEN. THE DEPARTMENT ALREADY HAS.`, tp.x - 30, tp.y - fs - 8, C.label, true); }
      }
      if (V.sel) return;   // the open building has the floor; the rest of the city waits
      // districts with live counts
      const counts = censusRef.current.districtCounts || {};
      for (const d of scene.districts) {
        const p = Q(d.centre);
        const name = narrow ? d.name.replace(/^THE /, "") : d.name;
        lab(`${name} ${counts[d.id] || 0}`, p.x - (name.length * fs * 0.3), p.y - fs / 2, C.label, false);
      }
      // stations: a short tag at the rest view, the full sign up close; a station with a
      // train standing at it first, and marked
      const full = V.cam.zoom > (narrow ? 1.7 : 1.15);
      const dw = V.dwellAt || new Set();
      const sts = scene.stations.slice().sort((x, y) => dw.has(y.districtId) - dw.has(x.districtId));
      for (const st of sts) {
        const p = Q(st.at), here = dw.has(st.districtId);
        const name = full ? `[${st.addr}] ${st.name}` : st.name.replace(/ STATION$/, " STN");
        lab(here ? `${name} // TRAIN IN` : name, p.x + 6, p.y - fs - 6, here ? "#e0fbff" : "#67e8f9", false);
      }
    }

    // ---- tooltip (the same card the 2D map uses) -------------------------------------
    function refreshTip(e) {
      const act = activityLine(e.s, V.mt);
      setTip(t => (t && t.s === e.s && t.act === act ? t : { s: e.s, job: jobLine(e.s), act }));
    }
    function showTip(e) { V.tip = e ? e.s.name : null; V.need = true; if (e) refreshTip(e); else setTip(null); }
    function placeTip() {
      const el = tipRef.current; if (!el) return;
      const e = V.tip && V.ents.get(V.tip);
      if (!e || !Number.isFinite(e.sx)) { el.style.visibility = "hidden"; return; }
      const [tw, th] = tipSize.current;
      const tx = clampN(e.sx - tw / 2, 2, V.w - tw - 2);
      let ty = e.sy - th - 18; if (ty < 2) ty = Math.min(V.h - th - 2, e.sy + 10);
      el.style.transform = `translate(${Math.round(tx)}px, ${Math.round(ty)}px)`;
      el.style.visibility = "visible";
    }

    // ---- input ----------------------------------------------------------------------
    const pts = new Map();
    const local = (ev) => { const r = canvas.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    function hitSubject(x, y, isTouch) {
      const pad = isTouch ? 5 : 0;
      let best = null, bd = Infinity;
      for (let i = V.hitS.length - 1; i >= 0; i--) {
        const s = V.hitS[i];
        const dx = Math.abs(x - s.x), dy = Math.abs(y - s.y);
        if (dx > s.rx + pad || dy > s.ry + pad) continue;
        if (!isTouch) return s.e;
        if (dx + dy < bd) { bd = dx + dy; best = s.e; }
      }
      return best;
    }
    function hitBuilding(x, y) {
      // the opened building is drawn in front of everything, so it wins any overlap
      const sh = V.sel && V.hitB.find(hb => hb.id === V.sel);
      if (sh && pointInPoly(x, y, sh.hull)) return sh.id;
      let best = null;
      for (const hb of V.hitB) if (pointInPoly(x, y, hb.hull) && (!best || hb.d < best.d)) best = hb;
      return best?.id || null;
    }
    function hitFloor(x, y) {
      for (let i = V.hitF.length - 1; i >= 0; i--) if (pointInPoly(x, y, V.hitF[i].poly)) return V.hitF[i];
      return null;
    }
    function hitDistrict(x, y) {
      const v = viewFor(V.cam, V.w, V.h);
      for (const d of scene.districts) if (pointInPoly(x, y, d.quad.map(p => P(p, v)))) return d.id;
      return null;
    }
    // Close enough to pick out one person: sprites are showing, or the building is open.
    const canPickSubjects = () => FLOOR_H * viewFor(V.cam, V.w, V.h).scale >= 28 || (V.sel && opened(V.sel) > 0.5);

    function onDown(ev) {
      try { canvas.setPointerCapture(ev.pointerId); } catch { /* fine */ }
      const [x, y] = local(ev);
      pts.set(ev.pointerId, { x, y });
      V.goal = null; touch();
      if (pts.size === 1) {
        const pan = ev.shiftKey || ev.button === 1 || ev.button === 2;
        V.drag = { mode: pan ? "pan" : "turn", sx: x, sy: y, cam: { ...V.cam }, moved: false, type: ev.pointerType };
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        V.drag = { mode: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cam: { ...V.cam }, moved: true };
      }
    }
    function onMove(ev) {
      const [x, y] = local(ev);
      if (pts.has(ev.pointerId)) pts.set(ev.pointerId, { x, y });
      const g = V.drag;
      if (g && pts.has(ev.pointerId)) {
        if (g.mode === "pinch" && pts.size >= 2) {
          const [a, b] = [...pts.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          const c = { ...g.cam, zoom: clampZoom(g.cam.zoom * (d / g.d0)) };
          Object.assign(V.cam, panTarget(c, mx - g.mx, my - g.my, viewFor(c, V.w, V.h)));
          touch(); return;
        }
        const dx = x - g.sx, dy = y - g.sy;
        if (!g.moved && Math.hypot(dx, dy) > 6) { g.moved = true; setCursor("pan"); }
        if (!g.moved) return;
        if (g.mode === "pan") Object.assign(V.cam, panTarget(g.cam, dx, dy, viewFor(g.cam, V.w, V.h)));
        else { V.cam.yaw = g.cam.yaw + dx * 0.008; V.cam.pitch = clampPitch3(g.cam.pitch - dy * 0.006); }
        touch(); return;
      }
      if (ev.pointerType === "mouse") {
        const s = canPickSubjects() ? hitSubject(x, y, false) : null;
        const b = s ? null : hitBuilding(x, y);
        const f = V.sel ? hitFloor(x, y) : null;
        if (s && V.tip !== s.s.name) showTip(s);
        if (b !== V.hoverB) { V.hoverB = b; V.need = true; }
        setCursor(s || b || f ? "point" : "");
      }
    }
    function onUp(ev) {
      const had = pts.delete(ev.pointerId);
      const g = V.drag;
      if (!had || !g) return;
      if (g.mode === "pinch") {
        if (pts.size === 1) { const [p] = [...pts.values()]; V.drag = { mode: "turn", sx: p.x, sy: p.y, cam: { ...V.cam }, moved: true }; }
        else if (pts.size === 0) V.drag = null;
        return;
      }
      V.drag = null; setCursor(""); touch();
      if (g.moved || ev.type === "pointercancel") return;
      const [x, y] = local(ev);
      const isTouch = g.type !== "mouse";
      // 1. a person
      const s = canPickSubjects() ? hitSubject(x, y, isTouch) : null;
      if (s) {
        if (!isTouch || V.tip === s.s.name) { showTip(s); cb.current.onOpen?.(s.s); } else showTip(s);
        return;
      }
      showTip(null);
      // 2. a floor of the opened building: go in
      const f = V.sel ? hitFloor(x, y) : null;
      if (f) { goFloor(f.b.districtId, f.b.id, f.f.index); return; }
      // 3. a building: open it (a second tap on the open one closes it)
      const b = hitBuilding(x, y);
      if (b) { select(b === V.sel ? null : b); return; }
      // 4. empty ground: close what is open, else enter the district
      if (V.sel) { select(null); return; }
      const d = hitDistrict(x, y);
      if (d) cb.current.onDistrict?.(d);
    }
    function onLeave() { if (V.hoverB) { V.hoverB = null; V.need = true; } }
    function onWheel(ev) {
      ev.preventDefault();
      V.goal = null;
      V.cam.zoom = clampZoom(V.cam.zoom * Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015)));
      touch();
    }
    function onKey(ev) {
      const k = ev.key, c = V.cam, step = 0.12;
      if (ev.shiftKey && k.startsWith("Arrow")) {
        const d = 40, [dx, dy] = k === "ArrowLeft" ? [d, 0] : k === "ArrowRight" ? [-d, 0] : k === "ArrowUp" ? [0, d] : [0, -d];
        Object.assign(c, panTarget(c, dx, dy, viewFor(c, V.w, V.h)));
      } else if (k === "ArrowLeft") c.yaw -= step;
      else if (k === "ArrowRight") c.yaw += step;
      else if (k === "ArrowUp") c.pitch = clampPitch3(c.pitch - step);
      else if (k === "ArrowDown") c.pitch = clampPitch3(c.pitch + step);
      else if (k === "+" || k === "=") c.zoom = clampZoom(c.zoom * 1.25);
      else if (k === "-" || k === "_") c.zoom = clampZoom(c.zoom / 1.25);
      else if (k === "0") { reset(); }
      else if (k === "Escape") { select(null); showTip(null); }
      else if (k === "[" || k === "]") {
        // step through the buildings, district by district: each one opens as it is reached
        const i = V.sel ? KEY_ORDER.indexOf(V.sel) : -1, n = KEY_ORDER.length;
        select(KEY_ORDER[i < 0 ? (k === "]" ? 0 : n - 1) : (i + (k === "]" ? 1 : -1) + n) % n]);
        ev.preventDefault(); touch(); return;
      } else if (k === "Enter" || k === " ") {
        // Enter: into the opened building's floor list (or open the first building)
        if (!V.sel) { select(KEY_ORDER[0]); ev.preventDefault(); touch(); return; }
        ev.preventDefault();
        cb.current.focusFloors?.();
        return;
      } else return;
      ev.preventDefault(); V.goal = k === "0" ? V.goal : null; touch();
    }
    const noMenu = (ev) => ev.preventDefault();
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("keydown", onKey);
    canvas.addEventListener("contextmenu", noMenu);

    // ---- one rAF loop, only while on screen and the tab is visible -----------------------
    let raf = 0, last = 0, onScreen = true, dead = false;
    function frame(ts) {
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
      last = ts;
      update(dt);
      if (V.need) { V.need = false; draw(); }
      raf = requestAnimationFrame(frame);
    }
    function sync() {
      const want = !dead && onScreen && !document.hidden;
      if (want && !raf) { last = 0; V.need = true; raf = requestAnimationFrame(frame); }
      if (!want && raf) { cancelAnimationFrame(raf); raf = 0; }
    }
    const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([en]) => { onScreen = en.isIntersecting; sync(); }) : null;
    io?.observe(wrap);
    document.addEventListener("visibilitychange", sync);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro ? ro.observe(wrap) : window.addEventListener("resize", resize);
    const onMotion = () => { V.reduced = !!mq?.matches; V.need = true; };
    mq?.addEventListener?.("change", onMotion);
    resize();
    sync();
    if (import.meta.env?.DEV) window.__city3d = V;   // dev: inspect the camera and hit lists

    return () => {
      dead = true; sync();
      io?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      ro ? ro.disconnect() : window.removeEventListener("resize", resize);
      mq?.removeEventListener?.("change", onMotion);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("keydown", onKey);
      canvas.removeEventListener("contextmenu", noMenu);
    };
    // censusRef is a stable ref; callbacks are read through cb.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const secret = sel && CLASSIFIED(BUILDING[sel.id]);
  return (
    <div className="hvi-city-stage" ref={wrapRef}>
      <TouchGate>
        <canvas ref={canvasRef} className={`hvi-city-canvas${cursor ? " " + cursor : ""}`} tabIndex={0} role="application" aria-roledescription="3D city map"
          aria-label="The Substrate in three dimensions: district outlines on the ground, every building a stack of floors, the Loop train on its raised ring. Arrow keys turn it, shift and arrows move it, plus and minus zoom, zero resets. Right and left square brackets open the next or previous building; Enter moves to its floor list; Escape seals it again. The district directory below also enters any district." />
      </TouchGate>
      <div className="sr-only" role="status" aria-live="polite">{status}</div>
      <ZoomBar api={apiRef} resetLabel="RESET" resetAria="Reset the view" hint="TAP A BUILDING TO OPEN IT" />
      <SubjectTip ref={tipRef} tip={tip} onOpen={(s) => cb.current.onOpen?.(s)} />
      {sel && (
        <div className="hvi-city3d-floors" ref={floorsRef} role="region" aria-label={`${sel.name}: floors`}
          onKeyDown={(ev) => { if (ev.key === "Escape") { apiRef.current.close?.(); canvasRef.current?.focus(); } }}>
          <div className="h">{sel.name} // {DISTRICT[sel.districtId]?.name} // {sel.floors.length} FLOOR{sel.floors.length === 1 ? "" : "S"} // {secret ? "CENSUS CLASSIFIED. ENTRY IS BY THE HOLDING PEN." : "SELECT A FLOOR. YOUR VISIT IS LOGGED."}</div>
          <div role="list">
            {sel.floors.map(f => (
              <div role="listitem" key={f.index}>
                <ListRow label={f.label} tag={secret ? "RESTRICTED" : f.count ? "INSPECT" : "VACANT (MONITORED)"} tagOptional={!secret && !f.count}
                  onClick={() => goFloor(sel.districtId, sel.id, f.index)} aria-label={`${f.label}. ${secret ? "Enter the building" : "Enter this floor"}.`} />
              </div>
            ))}
          </div>
          {!secret && sel.floors.every(f => !f.count) && <div className="note">{EMPTY_FLOOR}</div>}
          <Button variant="back" onClick={() => { apiRef.current.close?.(); canvasRef.current?.focus(); }}>Seal building</Button>
        </div>
      )}
    </div>
  );
}

function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
