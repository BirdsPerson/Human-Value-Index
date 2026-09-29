import { memo, useEffect, useRef, useState } from "react";
import TouchGate from "../ui/TouchGate.jsx";
import { SPRITE_W, SPRITE_H, statureOf } from "../sprites.js";
import { DISTRICTS, BUILDINGS, BUILDING, PLACES, LOOP_LINE, STATIONS, OPEN_LOTS, clockAt, whereOf, trainsAt, roomIn, gameAt } from "./simApi.js";
import { FAMILY_COLOR, familyOf } from "./cityKit.js";
import { sheetFor, miniFor } from "./spriteBank.js";
import { FONT } from "./cityUi.jsx";
import { rot, rotRect, project, screenToMap, cityExtent, depthOrder, slotForBox, boxHull, inPoly, lodFor, STOREY, DECK, mod4 } from "./iso.js";
import { loopPieces, trainPoses, carCorners, carBox, stationGeo, CORNER_R, DECK_HW, CAR_HL, CAR_HW, PLAT_IN, PLAT_OUT, PLAT_HL, STAIR_W, STAIR_L } from "./loopGeo.js";
import { drawRoom, roomPlan, typeOf, assignAnchors, roleOf, actAt, ORDERED_TYPES } from "./props.js";
import { drawPose, phaseOf, fitStature } from "./poses.js";
import { PARK_LOTS, PARK_PLACES, insetOf } from "./parkGeo.js";
import { drawParkLot } from "./parkDraw.js";

// THE SUBSTRATE, SimCity-style: every building a solid block (facade, roof, lit windows by
// occupancy, a sign up close), the Loop on its deck with trains, subjects on the streets.
// Drag to pan, pinch or wheel to zoom, Q/E or the buttons to turn it a quarter. Select a
// building and it lifts out into a Fallout Shelter / SimTower cutaway: every floor, every
// room furnished, every occupant at a seat or a station, walking in and out through the
// door, working at it while they are there. Deselect and it closes.
//
// Painter's order: the ground, then buildings and track segments back to front, with
// anything that moves (people, train cars, platform strips) slotted in between by depth.
// Labels go on top of the finished scene, nearest first, never over each other. A tap asks
// the same order front to back, so what you see on top is what you get.

const WALL = { arts: "#2e2744", campus: "#21392a", finance: "#1e3040", strip: "#40202a", arena: "#2c3822", hq: "#234434", archive: "#2e2e24", commons: "#2c3426", works: "#3e1e16", sprawl: "#2a2a30" };
const GROUND = { arts: "#141224", campus: "#0f1c14", finance: "#0e1820", strip: "#1c0e14", arena: "#141c10", hq: "#10221a", archive: "#16160f", commons: "#121a0f", works: "#1c0e0a", sprawl: "#131316" };
const LOT_FILL = { "the-green": "#123a18", "the-allotment": "#1a2e12", "the-street": "#20241f", "the-plaza": "#24261f" };
const OUTDOOR_PLACES = new Set(["park", "the-street", "the-plaza", "allotment"]);
const PANEL_BG = "#060a06";
const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (s) => clampN(Math.round(((n >> s) & 255) * f), 0, 255);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
};
function h01(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; }
const who = (s) => s.slug || s.name;

// Storeys above ground (the street facade) per building.
const ABOVE = Object.fromEntries(BUILDINGS.map(b => [b.id, Math.max(1, b.floors.filter(f => f.level >= 0).length)]));
const CAP = Object.fromEntries(BUILDINGS.map(b => [b.id, Math.max(1, b.floors.reduce((n, f) => n + (f.cap || 0), 0))]));

// The Loop's palette: poured concrete in the city's greens, steel cars, the line's cyan
// as a thin accent (the legend's THE LOOP), warm windows after dark.
const LOOP = {
  deck: "#343f39", pier: "#2e3833", parapet: "#48554e", rail: "#a3b8ae", sleeper: "#221c16", cyan: "#22d3ee", cyanHi: "#67e8f9",
  body: "#a9bab1", roof: "#cfdcd5", stripe: "#22d3ee", door: "#5d6b64", glassDay: "#3f6f78", glassNight: "#fcd34d", sil: "#0c1512",
  plat: "#4a5650", platLit: "#5b6c63", edge: "#fbbf24", canopy: "#2a3a32", stair: "#4a554f",
};
const DECK_T = 0.16;          // deck slab thickness, storeys
const CAR_H = 0.62;           // car body height, storeys
const CAR_Z = DECK + 0.05;    // the car's floor, on the rails
const CANOPY = DECK + 1.1;    // the station canopy's underside
const SGEO = Object.fromEntries(Object.values(STATIONS).map(st => [st.id, stationGeo(st)]));

// Where the view was when it unmounted (ENTER a building, then Back): the camera, the
// quarter turn and the open cutaway come back as they were. One per page load.
let SAVED = null;

export default memo(CityIso);
function CityIso({ censusRef, onOpen, onEnter }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const apiRef = useRef({});
  const [sel, setSel] = useState(null);
  const onOpenRef = useRef(onOpen); onOpenRef.current = onOpen;
  const onEnterRef = useRef(onEnter); onEnterRef.current = onEnter;
  const setSelRef = useRef(setSel); setSelRef.current = setSel;

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");
    const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const V = {
      cssW: 0, cssH: 0, dpr: 1, cam: { z: 6, ox: 0, oy: 0, r: 0 }, camTo: null, fitZ: 6, reduced: !!mq?.matches, need: true,
      sel: null, shown: null, lift: 0, geo: null, censusV: -1, inside: new Map(), occ: {}, outdoors: [], hits: [], labels: [], panel: null,
      seats: new Map(), plans: new Map(), wheelHint: 0, riders: new Map(), park: new Map(), parkSeats: new Map(),
    };

    // ---- geometry for the current quarter turn ----------------------------------------
    function buildGeo(r) {
      const items = [];
      for (const b of BUILDINGS) {
        // Footprints shrink inside their lots so the blocks read as towers with streets between.
        const [ix, iy] = insetOf(b);
        const R = rotRect({ x: b.rect.x + ix, y: b.rect.y + iy, w: b.rect.w - 2 * ix, h: b.rect.h - 2 * iy }, r);
        // an open lot is ground: whoever walks across it is drawn after it (iso.slotForBox's deck rule)
        const open = OPEN_LOTS.has(b.id);
        items.push({ kind: "b", b, R, h: open ? 0.05 : ABOVE[b.id], x0: R.x0, y0: R.y0, x1: R.x1, y1: R.y1, ...(open ? { deck: true, top: 0 } : {}) });
      }
      // the viaduct: straight deck pieces, curved corners, a station at every district
      items.push(...loopPieces(r));
      const order = depthOrder(items);
      const districts = DISTRICTS.map(d => ({ d, R: rotRect(d.rect, r) }));
      return { r, items, order, districts };
    }

    // ---- census -> occupancy, outdoor subjects, who is in which room -------------------
    // One rule with the header, the district list and the building view (simApi.roomIn):
    // a building counts whoever is on one of its floors, walking in, or walking out.
    function readCensus() {
      const c = censusRef.current;
      if (!c || c.v === V.censusV) return;
      V.censusV = c.v;
      const occ = {}, inside = new Map(), outdoors = [], riders = new Map(), park = new Map(PARK_PLACES.map(id => [id, []]));
      for (const { s, w } of c.list || []) {
        if (!w) continue;
        if (w.sub === "riding" && w.trainId) { const k = `${w.trainId}|${w.car}`; riders.set(k, (riders.get(k) || 0) + 1); }
        const r = roomIn(w, s);
        if (r) {
          occ[r.buildingId] = (occ[r.buildingId] || 0) + 1;
          const rk = `${r.buildingId}|${r.floor}|${r.placeId}`;
          (inside.get(rk) || inside.set(rk, []).get(rk)).push({ s, w, mode: r.mode });
          if (r.mode === "here" && OUTDOOR_PLACES.has(w.placeId)) outdoors.push({ s, open: w.placeId });
          if (r.mode === "here" && park.has(w.placeId)) park.get(w.placeId).push({ s, w });
        }
        if (w.activity === "commute" && w.sub !== "riding") outdoors.push({ s });
      }
      V.occ = occ; V.inside = inside; V.outdoors = outdoors; V.riders = riders; V.park = park;
      V.need = true;
    }

    // ---- camera -------------------------------------------------------------------------
    // Moves ease (camTo) unless reduced motion; any hand on the controls cancels the ease.
    function setCam(z, ox, oy, now = false) {
      if (now || V.reduced) { V.cam.z = z; V.cam.ox = ox; V.cam.oy = oy; V.camTo = null; } else V.camTo = { z, ox, oy };
      V.need = true;
    }
    function easeCam() {
      const t = V.camTo;
      if (!t) return;
      const k = 0.2, c = V.cam;
      c.z += (t.z - c.z) * k; c.ox += (t.ox - c.ox) * k; c.oy += (t.oy - c.oy) * k;
      if (Math.abs(t.z - c.z) < 0.01 && Math.abs(t.ox - c.ox) < 0.5 && Math.abs(t.oy - c.oy) < 0.5) { c.z = t.z; c.ox = t.ox; c.oy = t.oy; V.camTo = null; }
      V.need = true;
    }
    const hands = () => { if (V.camTo) { V.camTo = null; } };
    function fitCam() {
      const e = cityExtent(V.cam.r);
      const z = Math.min(V.cssW / (e.x1 - e.x0), V.cssH / (e.y1 - e.y0)) * 0.96;
      V.fitZ = z;
      return { z, ox: V.cssW / 2 - z * (e.x0 + e.x1) / 2, oy: V.cssH / 2 - z * (e.y0 + e.y1) / 2 };
    }
    function fit(now = false) { const f = fitCam(); setCam(f.z, f.ox, f.oy, now); }
    function centreOn(x, y, z = V.cam.z, side = false) {
      const [u, v] = rot(x, y, V.cam.r);
      // with the cutaway open, the building sits in the visible part of the view
      const cx = side ? (V.cssW < 640 ? V.cssW / 2 : V.cssW * 0.24) : V.cssW / 2;
      const cy = side && V.cssW < 640 ? V.cssH * 0.16 : V.cssH / 2;
      setCam(z, cx - (u - v) * z, cy - (u + v) * z * 0.5 + 2 * STOREY * z);
    }
    function zoomAt(sx, sy, f) {
      hands();
      const z0 = V.cam.z, z1 = clampN(z0 * f, V.fitZ * 0.7, 42);
      V.cam.ox = sx - (sx - V.cam.ox) * (z1 / z0);
      V.cam.oy = sy - (sy - V.cam.oy) * (z1 / z0);
      V.cam.z = z1; V.need = true;
    }
    // A quarter turn about a screen point (the view's centre, or the pinch): the map point
    // under it stays under it.
    function turn(dir, sx = V.cssW / 2, sy = V.cssH / 2) {
      hands();
      const [mx, my] = screenToMap(sx, sy, V.cam);
      V.cam.r = mod4(V.cam.r + dir);
      V.geo = buildGeo(V.cam.r);
      const [u, v] = rot(mx, my, V.cam.r);
      V.cam.ox = sx - (u - v) * V.cam.z;
      V.cam.oy = sy - (u + v) * V.cam.z * 0.5;
      V.need = true;
    }
    function select(id) {
      if (id === V.sel) return;
      const wasOpen = !!V.sel;
      V.sel = id;
      setSelRef.current(id);
      if (id) {
        V.shown = id;
        if (!wasOpen) V.lift = 0;   // switching buildings keeps the panel up; only a fresh open lifts
        if (V.shown !== V.seatsFor) { V.seats.clear(); V.seatsFor = V.shown; }
        const b = BUILDING[id];
        centreOn(b.pos.x, b.pos.y, Math.max(V.cam.z, V.fitZ * 1.6), true);
      }
      V.need = true;
    }
    apiRef.current = {
      zoom: (f) => zoomAt(V.cssW / 2, V.cssH / 2, f), fit: () => { select(null); fit(); }, turn: (d) => turn(d), close: () => select(null),
      enter: () => { const b = V.sel && BUILDING[V.sel]; if (b) onEnterRef.current?.(b.district, b.id); },
    };

    // Only a real change of size resets the canvas (assigning width/height clears it): the
    // toolbar's hint changing under a phone's canvas must not blank the picture.
    function resize() {
      const cssW = Math.max(280, Math.floor(wrap.clientWidth));
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const cssH = Math.round(clampN(cssW * 0.62, 360, Math.min(780, window.innerHeight * 0.74)));
      const first = V.cssW === 0;
      if (!first && cssW === V.cssW && cssH === V.cssH && dpr === V.dpr) return;
      const was = first ? 1 : V.cam.z / V.fitZ;
      V.cssW = cssW; V.cssH = cssH; V.dpr = dpr;
      canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
      canvas.style.height = cssH + "px";
      if (first || Math.abs(was - 1) < 1e-3) fit(true); else { fitCam(); V.need = true; }
      draw();
    }

    // ---- drawing --------------------------------------------------------------------------
    const P = (u, v, h) => project(u, v, h, V.cam);
    function poly(pts, fill, stroke) {
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
    }
    function onScreen(pts, pad = 20) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return x1 > -pad && x0 < V.cssW + pad && y1 > -pad && y0 < V.cssH + pad;
    }

    function drawGround() {
      const g = V.geo;
      for (const { d, R } of g.districts) {
        const pts = [P(R.x0, R.y0, 0), P(R.x1, R.y0, 0), P(R.x1, R.y1, 0), P(R.x0, R.y1, 0)];
        if (!onScreen(pts)) continue;
        poly(pts, GROUND[d.id] || "#101410", "rgba(74,222,128,0.18)");
      }
      // a faint street grid between the blocks
      if (lodFor(V.cam.z) !== "far") {
        ctx.strokeStyle = "rgba(74,222,128,0.05)"; ctx.lineWidth = 1;
        const e = { x0: -4, y0: -4, x1: 116, y1: 64 };
        for (let x = e.x0; x <= e.x1; x += 4) { const [u0, v0] = rot(x, e.y0, g.r), [u1, v1] = rot(x, e.y1, g.r); const a = P(u0, v0, 0), b = P(u1, v1, 0); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
        for (let y = e.y0; y <= e.y1; y += 4) { const [u0, v0] = rot(e.x0, y, g.r), [u1, v1] = rot(e.x1, y, g.r); const a = P(u0, v0, 0), b = P(u1, v1, 0); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
      }
    }

    // top: redrawn over the veil for the open cutaway (no hit, no queued label).
    function drawBuilding(it, lod, rank, top = false) {
      const { b, R } = it, h = it.h;
      const hull = boxHull(R, h, V.cam);
      if (!onScreen(hull)) return;
      if (!top) V.hits.push({ kind: "b", id: b.id, hull });
      const base = WALL[b.district] || "#26302a";
      const selected = V.sel === b.id;
      const label = () => {
        if (lod === "far" && !selected) return;
        // a playing field keeps its label off the play: over its back corner
        const [x, y] = PARK_LOTS[b.id] ? P(R.x0 + 0.6, R.y0 + 0.6, 0.4) : P((R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2, h + 0.5);
        // the recreation ground's labels carry the fixture: "THE DIAMOND // BOT 5TH 3-2"
        const g = PARK_LOTS[b.id] && gameAt(PARK_LOTS[b.id], V.mt);
        const text = g ? `${b.name} // ${g.kind === "ball" ? `${g.top ? "TOP" : "BOT"} ${g.inning} ${g.score[0]}-${g.score[1]}` : `GAME ${g.game} ${g.score[0]}-${g.score[1]}`}` : b.name;
        const L = { id: b.id, text: text.length > 34 ? text.slice(0, 33) + "…" : text, x, y, selected, rank };
        if (top) drawLabel(L, 1); else V.labels.push(L);
      };
      if (PARK_LOTS[b.id]) {
        const pid = PARK_LOTS[b.id];
        const G = { ctx, Q, poly, prism, wall, facing, z: V.cam.z, r: V.cam.r, t: V.reduced ? 0 : performance.now() / 1000, hits: top ? [] : V.hits, w: V.cssW, h: V.cssH };
        const res = drawParkLot(G, b.id, lod, V.mt, V.park.get(pid) || [], V.parkSeats.get(pid) || null);
        V.parkSeats.set(pid, res.at);
        if (selected) poly([P(R.x0, R.y0, 0.02), P(R.x1, R.y0, 0.02), P(R.x1, R.y1, 0.02), P(R.x0, R.y1, 0.02)], null, "#4ade80");
        label();
        return;
      }
      if (OPEN_LOTS.has(b.id)) {
        const pts = [P(R.x0, R.y0, 0), P(R.x1, R.y0, 0), P(R.x1, R.y1, 0), P(R.x0, R.y1, 0)];
        poly(pts, LOT_FILL[b.id] || "#20241f", selected ? "#4ade80" : "rgba(74,222,128,0.3)");
        if (lod !== "far" && (b.id === "the-green" || b.id === "the-allotment")) {
          for (let i = 0; i < 9; i++) {
            const u = R.x0 + (R.x1 - R.x0) * (0.15 + 0.7 * h01(b.id + i)), v = R.y0 + (R.y1 - R.y0) * (0.15 + 0.7 * h01(b.id + "v" + i));
            const [x, y] = P(u, v, 0.7);
            ctx.fillStyle = i % 2 ? "#22c55e" : "#15803d"; ctx.beginPath(); ctx.arc(x, y, Math.max(2, V.cam.z * (b.id === "the-green" ? 0.6 : 0.3)), 0, Math.PI * 2); ctx.fill();
          }
        }
        label();
        return;
      }
      // HQ's census is classified: its windows keep office hours, not a head count.
      const lit = b.id === "hq" ? 0.45 : Math.min(1, (V.occ[b.id] || 0) / (CAP[b.id] * 0.55));
      // right face (+u) and left face (+v), then the roof
      const right = [P(R.x1, R.y0, h), P(R.x1, R.y1, h), P(R.x1, R.y1, 0), P(R.x1, R.y0, 0)];
      const left = [P(R.x0, R.y1, h), P(R.x1, R.y1, h), P(R.x1, R.y1, 0), P(R.x0, R.y1, 0)];
      const roof = [P(R.x0, R.y0, h), P(R.x1, R.y0, h), P(R.x1, R.y1, h), P(R.x0, R.y1, h)];
      poly(right, shade(base, 0.72));
      poly(left, shade(base, 1.0));
      poly(roof, shade(base, 1.45), selected ? "#4ade80" : "rgba(160,220,180,0.35)");
      // windows: one per cell of facade per storey, lit by occupancy
      if (lod !== "far") {
        const faces = [
          { a: [R.x0, R.y1], d: [1, 0], len: R.x1 - R.x0, key: "L" },
          { a: [R.x1, R.y1], d: [0, -1], len: R.y1 - R.y0, key: "R" },
        ];
        const ww = Math.max(1, V.cam.z * 0.42), wh = Math.max(1, V.cam.z * STOREY * 0.42);
        for (const f of faces) {
          const cols = Math.max(1, Math.floor(f.len / 1.1));
          for (let s = 0; s < h; s++) for (let k = 0; k < cols; k++) {
            const t = (k + 0.5) / cols * f.len;
            const u = f.a[0] + f.d[0] * t, v = f.a[1] + f.d[1] * t;
            const [x, y] = P(u, v, s + 0.55);
            const on = h01(`${b.id}${f.key}${s}.${k}`) < lit;
            ctx.fillStyle = on ? (f.key === "L" ? "#fbbf24" : "#c9951a") : "rgba(0,0,0,0.45)";
            ctx.fillRect(Math.round(x - ww / 2), Math.round(y - wh / 2), Math.round(ww), Math.round(wh));
          }
        }
      } else if (lit > 0.05) {
        const [x, y] = P((R.x0 + R.x1) / 2, R.y1, h * 0.5);
        ctx.fillStyle = "#fbbf24"; ctx.fillRect(x - 1, y - 1, 2, 2);
      }
      if (lod === "near") {
        // a door on the front face
        const du = (R.x0 + R.x1) / 2;
        const d0 = P(du - 0.35, R.y1, 0), d1 = P(du + 0.35, R.y1, 0), d2 = P(du + 0.35, R.y1, 0.7), d3 = P(du - 0.35, R.y1, 0.7);
        poly([d0, d1, d2, d3], "#0a0f0a", "rgba(74,222,128,0.5)");
      }
      label();
    }

    // ---- the Loop: viaduct, stations, trains --------------------------------------------
    // Everything here is built in map cells (loopGeo.js) and turned to the current quarter
    // on the way to the screen. A face is drawn when it faces the viewer (its turned normal
    // points to +u+v) and shaded like the buildings: +u faces 0.72, +v faces 1.0, tops 1.4.
    const Q = (x, y, h) => { const [u, v] = rot(x, y, V.cam.r); return P(u, v, h); };
    const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const add = (a, d, k) => [a[0] + d[0] * k, a[1] + d[1] * k];
    // Turned normal of the map edge a->b, pointing away from `inside`; -> shade factor, or 0 if hidden.
    function facing(a, b, inside) {
      const [au, av] = rot(a[0], a[1], V.cam.r), [bu, bv] = rot(b[0], b[1], V.cam.r), [iu, iv] = rot(inside[0], inside[1], V.cam.r);
      let nu = bv - av, nv = -(bu - au);
      if (nu * (iu - au) + nv * (iv - av) > 0) { nu = -nu; nv = -nv; }
      const n = Math.hypot(nu, nv) || 1;
      nu /= n; nv /= n;
      return nu + nv > 1e-6 ? 0.86 + 0.14 * (nv - nu) : 0;
    }
    function wall(a, b, inside, h0, h1, base) {
      const f = facing(a, b, inside);
      if (f) poly([Q(a[0], a[1], h1), Q(b[0], b[1], h1), Q(b[0], b[1], h0), Q(a[0], a[1], h0)], shade(base, f));
      return f;
    }
    // A convex prism on a map footprint: its visible walls, then its top.
    function prism(foot, h0, h1, base, topF = 1.4, alpha = 1) {
      let cx = 0, cy = 0;
      for (const p of foot) { cx += p[0]; cy += p[1]; }
      const c = [cx / foot.length, cy / foot.length];
      if (alpha < 1) ctx.globalAlpha = alpha;
      for (let i = 0; i < foot.length; i++) wall(foot[i], foot[(i + 1) % foot.length], c, h0, h1, base);
      poly(foot.map(p => Q(p[0], p[1], h1)), shade(base, topF));
      if (alpha < 1) ctx.globalAlpha = 1;
    }
    function line(a, b, h, color, w) {
      const A = Q(a[0], a[1], h), B = Q(b[0], b[1], h);
      ctx.strokeStyle = color; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
    }
    function polyline(pts, h, color, w) {
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath();
      pts.forEach((p, i) => { const S = Q(p[0], p[1], h); if (i) ctx.lineTo(S[0], S[1]); else ctx.moveTo(S[0], S[1]); });
      ctx.stroke();
    }
    const px1 = () => Math.max(1, V.cam.z * 0.07);
    // A pier: a square column to the ground and a cap across the deck's width.
    function pier(m, d, lod) {
      const p = [-d[1], d[0]], top = DECK - DECK_T;
      const sq = (a, b, la, lb) => [add(add(m, d, a), p, la), add(add(m, d, b), p, la), add(add(m, d, b), p, lb), add(add(m, d, a), p, lb)];
      prism(sq(-0.19, 0.19, 0.19, -0.19), 0, top - (lod === "far" ? 0 : 0.14), LOOP.pier, 1.1);
      if (lod !== "far") prism(sq(-0.26, 0.26, DECK_HW * 0.85, -DECK_HW * 0.85), top - 0.14, top, LOOP.pier, 1.1);
    }
    // Deck edge details along a centreline polyline (map points, with its unit normals):
    // parapets, rails, sleepers, the cyan fascia; the far parapet first, the near one last.
    function deckDressing(pts, nrm, lod, len) {
      const off = (k) => pts.map((p, i) => add(p, nrm[i], k));
      const mid = Math.floor(pts.length / 2);
      // which lateral side faces the viewer: the one whose outward normal turns towards +u+v
      const [nu, nv] = (() => { const [a, b] = rot(0, 0, V.cam.r), [e, f] = rot(nrm[mid][0], nrm[mid][1], V.cam.r); return [e - a, f - b]; })();
      const near = nu + nv > 0 ? 1 : -1;
      const fascia = (sgn) => polyline(off(sgn * DECK_HW), DECK - 0.03, "rgba(34,211,238,0.6)", Math.max(1, V.cam.z * 0.06));
      fascia(near);
      if (lod === "far") return;
      const parapet = (sgn) => {
        const e = off(sgn * (DECK_HW - 0.04));
        for (let i = 0; i + 1 < e.length; i++) poly([Q(e[i][0], e[i][1], DECK), Q(e[i + 1][0], e[i + 1][1], DECK), Q(e[i + 1][0], e[i + 1][1], DECK + 0.13), Q(e[i][0], e[i][1], DECK + 0.13)], LOOP.parapet);
        polyline(e, DECK + 0.13, "#65756c", 1);
      };
      parapet(-near);
      if (lod === "near") {
        // sleepers across the two tracks' bed
        ctx.strokeStyle = LOOP.sleeper; ctx.lineWidth = Math.max(1, V.cam.z * 0.1);
        ctx.beginPath();
        const n = Math.max(1, Math.round(len / 0.55));
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(t)), f = t - i;
          const m = lerp2(pts[i], pts[i + 1], f), nn = nrm[i];
          const A = Q(...add(m, nn, 0.4), DECK + 0.01), B = Q(...add(m, nn, -0.4), DECK + 0.01);
          ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]);
        }
        ctx.stroke();
      }
      polyline(off(0.26), DECK + 0.03, LOOP.rail, px1());
      polyline(off(-0.26), DECK + 0.03, LOOP.rail, px1());
      parapet(near);
    }

    function drawDeckPiece(it, lod) {
      const { a, b, d, len } = it.map, p = [-d[1], d[0]];
      const slab = [add(a, p, DECK_HW), add(b, p, DECK_HW), add(b, p, -DECK_HW), add(a, p, -DECK_HW)];
      const m = lerp2(a, b, 0.5);
      if (!onScreen([Q(...slab[0], DECK), Q(...slab[1], DECK), Q(...slab[2], DECK), Q(...slab[3], DECK), Q(m[0], m[1], 0)])) return;
      if (it.pillar) pier(m, d, lod);
      prism(slab, DECK - DECK_T, DECK, LOOP.deck, 1.12);
      deckDressing([a, b], [p, p], lod, len);
    }
    function drawCorner(it, lod) {
      const c = it.corner, N = lod === "far" ? 4 : 10;
      const at = (th, rad) => [c.cx + rad * (-c.dout[0] * Math.cos(th) + c.din[0] * Math.sin(th)), c.cy + rad * (-c.dout[1] * Math.cos(th) + c.din[1] * Math.sin(th))];
      const th = Array.from({ length: N + 1 }, (_, k) => (k / N) * Math.PI / 2);
      const Ro = CORNER_R + DECK_HW, Ri = CORNER_R - DECK_HW;
      if (!onScreen([Q(...at(0, Ro), DECK), Q(...at(Math.PI / 2, Ro), DECK), Q(...at(Math.PI / 4, Ri), 0)])) return;
      const midT = Math.PI / 4, cm = at(midT, CORNER_R);
      pier(cm, [(c.dout[0] + c.din[0]) * Math.SQRT1_2, (c.dout[1] + c.din[1]) * Math.SQRT1_2], lod);
      for (let k = 0; k < N; k++) {
        wall(at(th[k], Ro), at(th[k + 1], Ro), [c.cx, c.cy], DECK - DECK_T, DECK, LOOP.deck);
        wall(at(th[k], Ri), at(th[k + 1], Ri), at((th[k] + th[k + 1]) / 2, CORNER_R), DECK - DECK_T, DECK, LOOP.deck);
      }
      poly([...th.map(t => Q(...at(t, Ro), DECK)), ...th.slice().reverse().map(t => Q(...at(t, Ri), DECK))], shade(LOOP.deck, 1.12));
      // outward normal at each sample: from the arc's centre
      const pts = th.map(t => at(t, CORNER_R));
      const nrm = th.map(t => [-c.dout[0] * Math.cos(t) + c.din[0] * Math.sin(t), -c.dout[1] * Math.cos(t) + c.din[1] * Math.sin(t)]);
      deckDressing(pts, nrm, lod, CORNER_R * Math.PI / 2);
    }

    // A station: the platform on the district side, a glass-roofed canopy on posts, the name
    // board on the roof, stairs down beside the platform. Lit (TRAIN IN) while a train stands.
    function drawStation(it, lod, rank) {
      const g = it.geo, st = g.st, at = g.at;
      const lit = V.trainIn?.has(st.id);
      if (!onScreen([Q(...at(-PLAT_HL, PLAT_OUT), CANOPY + 0.4), Q(...at(PLAT_HL, PLAT_IN), DECK), Q(...at(0, PLAT_OUT + STAIR_W), 0)])) return;
      const [a0, b0] = rot(0, 0, V.cam.r), [a1, b1] = rot(g.n[0], g.n[1], V.cam.r);
      const outFront = (a1 - a0) + (b1 - b0) > 0;   // the district side faces the viewer
      const rect = (al0, al1, la0, la1) => [at(al0, la0), at(al1, la0), at(al1, la1), at(al0, la1)];
      const stairs = () => {
        if (lod === "far") return;
        const [s0, s1, s2, s3] = g.stairs;   // s0,s3 at the top (platform end), s1,s2 at the street
        // the stringer under the visible long side, a triangle to the ground
        const side = outFront ? [s3, s2] : [s0, s1];
        poly([Q(...side[0], DECK), Q(...side[1], 0), Q(...side[0], 0)], shade(LOOP.stair, 0.62));
        poly([Q(...s0, DECK), Q(...s1, 0), Q(...s2, 0), Q(...s3, DECK)], shade(LOOP.stair, 1.25));
        ctx.strokeStyle = "rgba(8,14,10,0.7)"; ctx.lineWidth = 1; ctx.beginPath();
        const n = lod === "near" ? 12 : 6;
        for (let k = 1; k < n; k++) { const t = k / n, A = Q(...lerp2(s0, s1, t), DECK * (1 - t)), B = Q(...lerp2(s3, s2, t), DECK * (1 - t)); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
        ctx.stroke();
        // handrail on the open side
        const hs = outFront ? [s3, s2] : [s0, s1];
        const A = Q(...hs[0], DECK + 0.4), B = Q(...hs[1], 0.4);
        ctx.strokeStyle = "rgba(160,190,175,0.7)"; ctx.lineWidth = px1(); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      };
      if (!outFront) stairs();
      // supports under the outer edge
      for (const al of [-PLAT_HL + 1, PLAT_HL - 1]) {
        const m = at(al, (PLAT_IN + PLAT_OUT) / 2);
        prism([add(add(m, g.d, -0.15), g.n, 0.15), add(add(m, g.d, 0.15), g.n, 0.15), add(add(m, g.d, 0.15), g.n, -0.15), add(add(m, g.d, -0.15), g.n, -0.15)], 0, DECK - DECK_T, LOOP.pier, 1.1);
      }
      prism(rect(-PLAT_HL, PLAT_HL, PLAT_IN, PLAT_OUT), DECK - DECK_T, DECK + 0.03, lit ? LOOP.platLit : LOOP.plat, 1.3);
      // the yellow edge strip on the track side
      poly([Q(...at(-PLAT_HL, PLAT_IN), DECK + 0.031), Q(...at(PLAT_HL, PLAT_IN), DECK + 0.031), Q(...at(PLAT_HL, PLAT_IN + 0.1), DECK + 0.031), Q(...at(-PLAT_HL, PLAT_IN + 0.1), DECK + 0.031)], LOOP.edge);
      if (lit) poly(rect(-PLAT_HL + 0.2, PLAT_HL - 0.2, PLAT_IN + 0.12, PLAT_OUT - 0.05).map(p => Q(p[0], p[1], DECK + 0.032)), "rgba(103,232,249,0.16)");
      // canopy: posts on the outer edge, a glazed roof, a lit fascia on the track side
      const posts = lod === "far" ? [] : [-PLAT_HL + 1.2, -PLAT_HL / 3, PLAT_HL / 3, PLAT_HL - 1.2];
      ctx.strokeStyle = "#6f7f77"; ctx.lineWidth = Math.max(1, V.cam.z * 0.09);
      ctx.beginPath();
      for (const al of posts) { const A = Q(...at(al, PLAT_OUT - 0.14), DECK + 0.03), B = Q(...at(al, PLAT_OUT - 0.14), CANOPY); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
      ctx.stroke();
      prism(rect(-PLAT_HL + 0.6, PLAT_HL - 0.6, PLAT_IN + 0.18, PLAT_OUT + 0.06), CANOPY, CANOPY + 0.07, LOOP.canopy, 1.6, lod === "far" ? 1 : 0.8);
      line(at(-PLAT_HL + 0.6, PLAT_IN + 0.18), at(PLAT_HL - 0.6, PLAT_IN + 0.18), CANOPY, lit ? LOOP.cyanHi : "rgba(34,211,238,0.6)", Math.max(1, V.cam.z * (lit ? 0.12 : 0.07)));
      // the name board over the roof: drawn in the label pass (legible, never overlapped)
      if (lod !== "far") {
        const [x, y] = Q(...at(0, (PLAT_IN + PLAT_OUT) / 2), CANOPY + 0.35);
        V.labels.push({ id: `st:${st.id}`, station: true, lit, text: lit ? `${st.name} // TRAIN IN` : st.name, x, y, rank: 1e5 + rank });
      }
      if (outFront) stairs();
    }

    // Everything that moves on or under the deck, as boxes to slot into the painter's order:
    // train cars, and subjects outdoors (streets, lots, the stairs, the platforms).
    function movers(mt, trains) {
      const out = [], r = V.cam.r;
      const night = (() => { const h = ((mt % 24) + 24) % 24; return h >= 19 || h < 6.5; })();
      for (const t of trains) t.cars.forEach((c, i) => {
        out.push({ kind: "car", t, c, prev: i ? t.cars[i - 1].pose : null, night, riders: V.riders.get(`${t.id}|${c.index}`) || 0, box: carBox(c.pose, r, c.lead && night ? 1.4 : 0), h: CAR_Z });
      });
      for (const o of V.outdoors) {
        let x, y, h = 0;
        if (o.open) {
          const p = PLACES[o.open], k = who(o.s);
          const wob = V.reduced ? 0 : Math.sin(mt * 6 + h01(k) * 10) * 0.4;
          x = p.rect.x + p.rect.w * (0.12 + 0.76 * h01(k + "x")) + wob;
          y = p.rect.y + p.rect.h * (0.2 + 0.6 * h01(k + "y"));
        } else {
          const w = whereOf(o.s, mt);
          if (!w || w.activity !== "commute" || w.sub === "riding") continue;
          x = w.x; y = w.y;
          // up on the deck: waiting, stepping off; on the stairs (climb 0..1, gate to platform):
          // across the pavement to the foot of the flight, up it, along the platform.
          if (w.sub === "waiting" || w.sub === "alighting") h = DECK;
          else if (w.climb > 0 && SGEO[w.stationId]) {
            const g = SGEO[w.stationId], c = Math.min(1, w.climb), mid = PLAT_OUT + STAIR_W / 2;
            const foot = g.at(0.2 + STAIR_L, mid), head = g.at(0.2, mid), plat = g.at(0, LOOP_LINE.platformOffset);
            let q;
            if (c < 0.25) { q = lerp2([g.st.gate.x, g.st.gate.y], foot, c / 0.25); h = 0; }
            else if (c < 0.9) { q = lerp2(foot, head, (c - 0.25) / 0.65); h = DECK * (c - 0.25) / 0.65; }
            else { q = lerp2(head, plat, (c - 0.9) / 0.1); h = DECK; }
            [x, y] = q;
          }
        }
        const [u, v] = rot(x, y, r);
        out.push({ kind: "p", s: o.s, u, v, h, box: { x0: u, y0: v, x1: u, y1: v } });
      }
      return out;
    }

    // One car: a steel box on the rails, turned to the track. Far: body, roof, the cyan
    // stripe. Mid: a window band and the doors, the gangway to the car ahead. Near: each
    // window, riders in them, the cab's windscreen and lamps, roof units.
    function drawCar(m, lod) {
      const { c, t, night } = m, p = c.pose;
      const [x, y] = Q(p.x, p.y, CAR_Z);
      const pad = V.cam.z * 3;
      if (x < -pad || x > V.cssW + pad || y < -pad || y > V.cssH + pad) return;
      const h0 = CAR_Z, h1 = CAR_Z + CAR_H, H = (k) => h0 + k * CAR_H;
      const [FL, FR, BR, BL] = carCorners(p), ctr = [p.x, p.y], dir = [p.dx, p.dy];
      const glass = night ? LOOP.glassNight : LOOP.glassDay;
      // headlight pool on the deck ahead, at night
      if (c.lead && night) {
        const [gx, gy] = Q(...add(ctr, dir, CAR_HL + 0.9), DECK);
        const r = V.cam.z * 1.3, gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
        gr.addColorStop(0, "rgba(255,244,200,0.32)"); gr.addColorStop(1, "rgba(255,244,200,0)");
        ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(gx, gy, r, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      }
      // gangway to the car ahead (narrower than the body, so the coupling reads)
      if (m.prev && lod !== "far") {
        const q = m.prev, pp = [-p.dy, p.dx], qp = [-q.dy, q.dx];
        const f = add(ctr, dir, CAR_HL), bk = add([q.x, q.y], [q.dx, q.dy], -CAR_HL);
        prism([add(f, pp, 0.22), add(bk, qp, 0.22), add(bk, qp, -0.22), add(f, pp, -0.22)], h0 + 0.08, h1 - 0.1, "#262e2a", 1.1);
      }
      // underframe
      if (lod !== "far") prism(carCorners(p, CAR_HL - 0.3, CAR_HW - 0.1), DECK + 0.02, h0 + 0.04, "#1a201d", 1);
      const faces = [
        { a: FL, b: FR, kind: c.lead ? "cab" : "end" },
        { a: BR, b: FR, kind: "side" },
        { a: BR, b: BL, kind: c.tail ? "tail" : "end" },
        { a: BL, b: FL, kind: "side" },
      ];
      const quad = (F, t0, t1, k0, k1, fill, stroke) => poly([F(t0, k1), F(t1, k1), F(t1, k0), F(t0, k0)], fill, stroke);
      for (const fc of faces) {
        const f = facing(fc.a, fc.b, ctr);
        if (!f) continue;
        const F = (t, k) => { const q = lerp2(fc.a, fc.b, t); return Q(q[0], q[1], H(k)); };
        quad(F, 0, 1, 0, 1, shade(LOOP.body, f));
        quad(F, 0, 1, 0, 0.13, shade(LOOP.body, f * 0.45));                    // skirt
        if (fc.kind === "side") {
          quad(F, 0, 1, 0.24, 0.32, LOOP.stripe);                                // the Loop's stripe
          if (lod === "far") { if (night) quad(F, 0.08, 0.92, 0.48, 0.72, glass); continue; }
          const doors = [0.27, 0.73];
          if (lod === "mid") {
            quad(F, 0.05, 0.95, 0.44, 0.78, glass);
            for (const dc of doors) { quad(F, dc - 0.055, dc + 0.055, 0.14, 0.86, shade(LOOP.door, f)); quad(F, dc - 0.035, dc + 0.035, 0.46, 0.76, glass); }
            continue;
          }
          // near: each window, and riders standing or seated in them
          const WIN = [[0.05, 0.19], [0.35, 0.44], [0.455, 0.545], [0.56, 0.65], [0.81, 0.95]];
          const n = m.riders ? Math.max(1, Math.min(WIN.length, Math.round(m.riders / 12 * WIN.length))) : 0;
          WIN.forEach(([t0, t1], i) => {
            quad(F, t0, t1, 0.42, 0.8, glass, "rgba(20,28,24,0.9)");
            const seat = Math.floor(h01(`${t.id}${c.index}${i}`) * 97) % WIN.length;
            if ((i + seat) % WIN.length < n) {
              const B = F((t0 + t1) / 2, 0.42), T = F((t0 + t1) / 2, 0.8), hh = B[1] - T[1];
              if (hh >= 5) {
                ctx.fillStyle = night ? "rgba(40,26,6,0.85)" : LOOP.sil;
                ctx.beginPath(); ctx.arc(B[0], B[1] - hh * 0.6, hh * 0.15, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(B[0], B[1], hh * 0.26, hh * 0.3, 0, Math.PI, 0); ctx.fill();
              }
            }
          });
          for (const dc of doors) {
            quad(F, dc - 0.055, dc + 0.055, 0.14, 0.86, shade(LOOP.door, f), "rgba(20,28,24,0.9)");
            quad(F, dc - 0.04, dc - 0.006, 0.46, 0.76, glass); quad(F, dc + 0.006, dc + 0.04, 0.46, 0.76, glass);
          }
          continue;
        }
        if (lod === "far") continue;
        if (fc.kind === "cab") {
          quad(F, 0.1, 0.9, 0.46, 0.86, night ? "#1d2a22" : "#10262b", "rgba(160,220,230,0.5)");
          quad(F, 0.12, 0.26, 0.17, 0.27, "#fff4c2"); quad(F, 0.74, 0.88, 0.17, 0.27, "#fff4c2");
        } else if (fc.kind === "tail") {
          quad(F, 0.14, 0.86, 0.46, 0.8, glass);
          quad(F, 0.12, 0.24, 0.17, 0.26, "#f87171"); quad(F, 0.76, 0.88, 0.17, 0.26, "#f87171");
        } else {
          quad(F, 0.32, 0.68, 0.14, 0.84, "#262e2a");
        }
      }
      // roof, and at street zoom its units
      poly([FL, FR, BR, BL].map(q => Q(q[0], q[1], h1)), LOOP.roof, lod === "far" ? null : "rgba(40,52,46,0.8)");
      if (lod === "near") for (const al of [-0.7, 0.7]) {
        const m0 = add(ctr, dir, al), pp = [-p.dy, p.dx];
        prism([add(add(m0, dir, -0.32), pp, 0.2), add(add(m0, dir, 0.32), pp, 0.2), add(add(m0, dir, 0.32), pp, -0.2), add(add(m0, dir, -0.32), pp, -0.2)], h1, h1 + 0.07, "#7f8f87", 1.25);
      }
      // tail lamps glow at night
      if (c.tail && night) {
        const [gx, gy] = Q(...add(ctr, dir, -CAR_HL - 0.1), h0 + CAR_H * 0.22);
        ctx.fillStyle = "rgba(248,113,113,0.35)"; ctx.beginPath(); ctx.arc(gx, gy, Math.max(2, V.cam.z * 0.35), 0, Math.PI * 2); ctx.fill();
      }
    }
    function drawPerson(p, lod) {
      const [x, y] = P(p.u, p.v, p.h);
      if (x < -20 || x > V.cssW + 20 || y < -40 || y > V.cssH + 20) return;
      if (lod === "far") {
        ctx.fillStyle = FAMILY_COLOR[familyOf(p.s)] || "#6b9a7c";
        ctx.fillRect(Math.round(x) - 1, Math.round(y) - 2, 2, 2);
        return;
      }
      const hpx = V.cam.z * STOREY * 0.95 * statureOf(p.s);   // to scale, feet on the ground
      if (lod === "mid" || hpx < 18) {
        const m = miniFor(p.s);
        const s = hpx / (SPRITE_H / 2);
        try { ctx.drawImage(m, Math.round(x - (SPRITE_W / 4) * s), Math.round(y - hpx), Math.round((SPRITE_W / 2) * s), Math.round(hpx)); } catch { /* not ready */ }
      } else {
        const e = sheetFor(p.s);
        const s = hpx / SPRITE_H;
        try { ctx.drawImage(e.img, 0, 0, SPRITE_W, SPRITE_H, Math.round(x - (SPRITE_W / 2) * s), Math.round(y - hpx), Math.round(SPRITE_W * s), Math.round(hpx)); } catch { /* not ready */ }
      }
      V.hits.push({ kind: "p", s: p.s, box: [x - hpx * 0.3, y - hpx, x + hpx * 0.3, y] });
    }
    function drawMover(m, lod) { if (m.kind === "p") drawPerson(m, lod); else drawCar(m, lod); }

    // ---- labels: one pass on top, nearest first, none over another --------------------------
    // They fade in over a zoom range instead of all switching on at once.
    function labelAlpha(L) { return L.selected || lodFor(V.cam.z) === "near" ? 1 : clampN((V.cam.z - 5.8) / 1.2, 0, 1); }
    function labelBox(L) {
      const fs = clampN(Math.round(V.cam.z * 0.95), 8, 13);
      ctx.font = `${fs}px ${FONT}`;
      const w = ctx.measureText(L.text).width + 6;
      return { fs, x0: Math.round(L.x - w / 2), y0: Math.round(L.y - fs - 3), w: Math.round(w), h: fs + 4 };
    }
    function drawLabel(L, a, box = labelBox(L)) {
      ctx.globalAlpha = a;
      ctx.font = `${box.fs}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.fillStyle = "rgba(6,10,6,0.86)"; ctx.fillRect(box.x0, box.y0, box.w, box.h);
      if (L.station) { ctx.fillStyle = L.lit ? "#67e8f9" : "rgba(34,211,238,0.55)"; ctx.fillRect(box.x0, box.y0 + box.h - 1, box.w, 1); }
      ctx.fillStyle = L.station ? (L.lit ? "#e0fbff" : "#67e8f9") : L.selected ? "#4ade80" : "#a7d7b5"; ctx.fillText(L.text, Math.round(L.x), Math.round(L.y));
      ctx.globalAlpha = 1;
    }
    function drawLabels() {
      const list = V.labels.filter(L => labelAlpha(L) > 0.02).sort((a, b) => (b.selected - a.selected) || b.rank - a.rank);
      const placed = [];
      for (const L of list) {
        const bx = labelBox(L);
        if (bx.x0 + bx.w < 0 || bx.x0 > V.cssW || bx.y0 + bx.h < 0 || bx.y0 > V.cssH) continue;
        if (placed.some(p => bx.x0 < p.x0 + p.w + 3 && p.x0 < bx.x0 + bx.w + 3 && bx.y0 < p.y0 + p.h + 1 && p.y0 < bx.y0 + bx.h + 1)) continue;
        placed.push(bx);
        drawLabel(L, labelAlpha(L), bx);
      }
    }

    // ---- the cutaway ------------------------------------------------------------------------
    function panelRect() {
      const narrow = V.cssW < 640;
      return narrow
        ? { x: 6, y: Math.round(V.cssH * 0.3), w: V.cssW - 12, h: Math.round(V.cssH * 0.7) - 6 }
        : { x: Math.round(V.cssW * 0.48), y: 8, w: Math.round(V.cssW * 0.52) - 8, h: V.cssH - 72 };
    }
    function fitText(text, maxW) {
      if (ctx.measureText(text).width <= maxW) return text;
      let t = text;
      while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
      return t + "…";
    }
    function drawCutaway(b, mt, e, live) {
      const pr = panelRect();
      // floors, top storey first; basements below a ground line. A short building gets a
      // short panel (no dead space under it for the city to show through).
      const floors = b.floors.slice().sort((a, c) => c.level - a.level);
      const fh = clampN(Math.floor((pr.h - 52) / floors.length), 34, 190);
      pr.h = Math.min(pr.h, 52 + floors.length * fh);
      const x0 = pr.x, y0 = Math.round(pr.y + (1 - e) * 40);
      ctx.globalAlpha = e;
      ctx.fillStyle = PANEL_BG; ctx.fillRect(x0, y0, pr.w, pr.h);
      ctx.strokeStyle = "#4ade80"; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, pr.w - 1, pr.h - 1);
      // header: name and address, cut to fit, clear of the close target
      const closeW = 48;
      ctx.font = `12px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillStyle = "#4ade80";
      ctx.fillText(fitText(`${b.name} // ${b.addr}`, pr.w - 20 - closeW), x0 + 10, y0 + 8);
      ctx.fillStyle = "#6b9a7c";
      const nF = b.floors.length;
      const game = PARK_LOTS[b.id] && gameAt(PARK_LOTS[b.id], mt);
      const sub = b.id === "hq" ? "CENSUS CLASSIFIED"
        : PARK_LOTS[b.id] ? `${V.occ[b.id] || 0} ON THE GROUND // ${game ? game.short : PARK_LOTS[b.id] === "rec-park" ? "LEISURE IN PROGRESS. IT IS BEING ENJOYED." : "NO FIXTURE. PRACTICE IS PERMITTED."}`
        : `${V.occ[b.id] || 0} INSIDE // ${nF} FLOOR${nF === 1 ? "" : "S"}`;
      ctx.fillText(fitText(sub, pr.w - 20 - closeW), x0 + 10, y0 + 24);
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `13px ${FONT}`;
      ctx.strokeStyle = "rgba(74,222,128,0.5)"; ctx.strokeRect(x0 + pr.w - closeW - 2.5, y0 + 4.5, closeW - 4, 32);
      ctx.fillStyle = "#a7d7b5"; ctx.fillText("[ X ]", x0 + pr.w - closeW / 2 - 4, y0 + 21);
      if (live) V.hits.push({ kind: "close", panel: true, box: [x0 + pr.w - closeW - 6, y0, x0 + pr.w, y0 + 44] });
      const top = y0 + 44;
      const labW = 34;
      const now = V.reduced ? 0 : performance.now() / 1000;
      ctx.save(); ctx.beginPath(); ctx.rect(x0 + 1, top, pr.w - 2, pr.h - 46); ctx.clip();
      floors.forEach((f, i) => {
        const fy = top + i * fh;
        if (f.level === -1 || (i > 0 && floors[i - 1].level >= 0 && f.level < 0)) {
          ctx.fillStyle = "#3a2a1a"; ctx.fillRect(x0 + 1, fy - 2, pr.w - 2, 2);   // the ground line
        }
        ctx.fillStyle = f.level < 0 ? "#0b0906" : "#0a0f0a"; ctx.fillRect(x0 + 1, fy, labW, fh - 2);
        ctx.font = `11px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#6b9a7c";
        ctx.fillText(f.code, x0 + 1 + labW / 2, fy + fh / 2);
        const rw0 = pr.w - labW - 6;
        if (!f.places.length) { drawSealed(f, b, x0 + labW + 3, fy, rw0 - 2, fh - 2); return; }
        const rw = rw0 / f.places.length;
        f.places.forEach((pid, k) => drawRoomCut(b, f, pid, x0 + labW + 3 + k * rw, fy, rw - 2, fh - 2, f.places.length > 1, mt, now, live));
      });
      ctx.restore();
      ctx.globalAlpha = 1;
      V.panel = live ? { x0, y0, w: pr.w, h: pr.h } : null;
    }
    // A floor with no rooms on the census (HQ's bar and archive): shut, and it says so.
    function drawSealed(f, b, rx, ry, rw, rh) {
      ctx.fillStyle = "#0c110c"; ctx.fillRect(rx, ry, rw, rh);
      ctx.save(); ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
      ctx.strokeStyle = "rgba(74,222,128,0.08)"; ctx.lineWidth = 1;
      for (let x = rx - rh; x < rx + rw; x += 10) { ctx.beginPath(); ctx.moveTo(x, ry + rh); ctx.lineTo(x + rh, ry); ctx.stroke(); }
      ctx.restore();
      ctx.font = `10px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#6b9a7c";
      ctx.fillText(fitText(`${f.name} // ${b.id === "hq" ? "CLASSIFIED" : "SEALED"}`, rw - 8), rx + rw / 2, ry + rh / 2);
    }
    function nameTab(text, rx, ry, rw) {
      ctx.font = `10px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "top";
      const t = fitText(text, Math.max(30, rw - 10));
      const w = ctx.measureText(t).width + 6;
      ctx.fillStyle = "rgba(6,10,6,0.78)"; ctx.fillRect(rx + 1, ry + 1, w, 13);
      ctx.fillStyle = "rgba(230,240,230,0.8)"; ctx.fillText(t, rx + 4, ry + 2);
    }
    // One room: furniture from its plan (props.roomPlan), everyone present at an anchor of
    // their role (props.assignAnchors, seats kept while they stay), each doing their job
    // there (poses.drawPose). Sprites cap at 64 px: a room holds a workforce, not two giants.
    function drawRoomCut(b, f, pid, rx, ry, rw, rh, many, mt, now, live) {
      const u = Math.max(1, Math.round(rh / 40));
      const sh = clampN(Math.round(rh * 0.42), 16, 64), sw = sh * (SPRITE_W / SPRITE_H);
      const pk = `${pid}|${Math.round(rw)}|${rh}|${sh}`;
      let plan = V.plans.get(pk);
      if (!plan) { plan = roomPlan(typeOf(pid), rw, rh, sw, Math.round(PLACES[pid].cap / PLACES[pid].floors.length)); V.plans.set(pk, plan); }
      const hour = ((mt % 24) + 24) % 24;
      const hq = b.id === "hq";
      const rk = `${b.id}|${f.index}|${pid}`;
      // HQ's census is classified; everyone else walking in counts, walking out does not sit
      const list = hq ? [] : (V.inside.get(rk) || []).filter(o => o.mode !== "leave");
      const people = list.map(o => ({ key: who(o.s), role: roleOf(o.w), s: o.s }));
      const prev = V.seats.get(rk);
      const { at, overflow } = assignAnchors(plan.anchors, people, prev && prev.plan === plan ? prev.at : null, hour, ORDERED_TYPES.has(plan.type));
      V.seats.set(rk, { plan, at });
      const byAnchor = new Array(plan.anchors.length);
      for (const p of people) { const i = at.get(p.key); if (i != null) byAnchor[i] = p; }
      drawRoom(ctx, pid, rx, ry, rw, rh, u, {
        t: now, hour, plan, lit: true,
        people: (row) => {
          for (const it of row.items) {
            const a = it.a, p = a && byAnchor[a.i];
            if (!p) continue;
            const box = drawPose(ctx, sheetFor(p.s), a, actAt(a, hour, p.role, plan.type), rx + a.x, ry + a.y, sh * a.s, now, phaseOf(p.key), fitStature(p.s, a.y, sh * a.s));
            if (live) V.hits.push({ kind: "p", panel: true, s: p.s, box });
          }
        },
      });
      const fx = PARK_LOTS[b.id] && gameAt(pid, mt);
      nameTab(fx ? `${fx.name} // IN PLAY` : many ? PLACES[pid].name : f.name, rx, ry, rw);
      if (hq) {
        ctx.font = `9px ${FONT}`; ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillStyle = "rgba(107,154,124,0.8)";
        ctx.fillText("OCCUPANCY CLASSIFIED", rx + rw - 4, ry + rh - 3);
        return;
      }
      if (overflow.length) {
        const lab = `+${overflow.length}`;
        ctx.font = `11px ${FONT}`; const tw = ctx.measureText(lab).width + 6;
        ctx.fillStyle = "rgba(251,191,36,0.9)"; ctx.fillRect(Math.round(rx + rw - tw - 6), ry + 3, Math.round(tw), 14);
        ctx.fillStyle = "#1a1206"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(lab, Math.round(rx + rw - tw / 2 - 6), ry + 10);
      }
    }

    function draw() {
      const t = performance.now();
      readCensus();
      easeCam();
      if (!V.geo || V.geo.r !== V.cam.r) V.geo = buildGeo(V.cam.r);
      const mt = censusRef.current?.mt != null && V.reduced ? censusRef.current.mt : clockAt(Date.now()).mt;
      V.mt = mt;
      const lod = lodFor(V.cam.z);
      ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#060a06"; ctx.fillRect(0, 0, V.cssW, V.cssH);
      V.hits = []; V.labels = [];
      drawGround();
      // movers slot between buildings and track by depth
      const { items, order } = V.geo;
      const trains = trainPoses(trainsAt(mt));
      V.trainIn = new Set(trains.filter(t => t.dwell).map(t => t.stationId));
      const slots = new Map();
      const put = (k, m) => (slots.get(k) || slots.set(k, []).get(k)).push(m);
      for (const m of movers(mt, trains)) put(slotForBox(m.box, m.h, items, order), m);
      for (const m of slots.get(-1) || []) drawMover(m, lod);
      for (let k = 0; k < order.length; k++) {
        const it = items[order[k]];
        if (it.kind === "b") drawBuilding(it, lod, k);
        else if (it.kind === "t") drawDeckPiece(it, lod);
        else if (it.kind === "k") drawCorner(it, lod);
        else drawStation(it, lod, k);
        for (const m of slots.get(k) || []) drawMover(m, lod);
      }
      drawLabels();
      // compass
      ctx.font = `11px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillStyle = "rgba(107,154,124,0.8)";
      ctx.fillText(`FACING ${["NW", "NE", "SE", "SW"][V.cam.r]} // ${lod === "far" ? "OVERVIEW" : lod === "mid" ? "DISTRICT" : "STREET"}`, 8, 8);
      if (V.wheelHint > t) {
        const msg = "CLICK THE CITY FIRST TO ZOOM WITH THE WHEEL. OR HOLD CTRL.";
        ctx.font = `11px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const w = ctx.measureText(msg).width + 16;
        ctx.fillStyle = "rgba(6,10,6,0.9)"; ctx.fillRect(Math.round(V.cssW / 2 - w / 2), V.cssH - 64, Math.round(w), 22);
        ctx.fillStyle = "#a7d7b5"; ctx.fillText(msg, Math.round(V.cssW / 2), V.cssH - 53);
        V.need = true;
      }
      // the cutaway: the rest of the city steps back under a veil, the building comes forward
      V.panel = null;
      V.lift = V.sel ? (V.reduced ? 1 : Math.min(1, V.lift + 0.08)) : (V.reduced ? 0 : Math.max(0, V.lift - 0.12));
      if (!V.sel && V.lift <= 0) V.shown = null;
      const b = V.shown && BUILDING[V.shown];
      if (b) {
        const e = 1 - Math.pow(1 - V.lift, 3);
        ctx.fillStyle = `rgba(4,8,4,${(0.62 * e).toFixed(3)})`; ctx.fillRect(0, 0, V.cssW, V.cssH);
        const it = items.find(x => x.kind === "b" && x.b.id === b.id);
        if (it && V.sel) drawBuilding(it, lod, 0, true);
        drawCutaway(b, mt, e, !!V.sel);
        V.need = true;
      }
    }

    // ---- input -------------------------------------------------------------------------------
    const pts = new Map();
    let drag = null, pinch = null;
    const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    function onDown(e) {
      try { canvas.setPointerCapture?.(e.pointerId); } catch { /* synthetic or already gone */ }
      if (document.activeElement !== canvas) canvas.focus({ preventScroll: true });
      pts.set(e.pointerId, local(e));
      if (pts.size === 1) { const [x, y] = local(e); drag = { x, y, ox: V.cam.ox, oy: V.cam.oy, moved: false }; }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), ang0: Math.atan2(b[1] - a[1], b[0] - a[0]), prev: 0, total: 0, done: 0, z: V.cam.z };
        drag = null;
        hands();
      }
    }
    function onMove(e) {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, local(e));
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
        zoomAt(cx, cy, (pinch.z * (d / pinch.d)) / V.cam.z);
        // Twist: the total angle, unwrapped, in quarter turns, rounded, with a little
        // hysteresis. 150 degrees of fingers is two quarter turns, never three.
        let da = ang - pinch.ang0 - pinch.prev;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        pinch.total += da; pinch.prev = ang - pinch.ang0;
        const q = Math.PI / 2, want = pinch.total / q;
        if (Math.abs(want - pinch.done) > 0.62) { const dir = want > pinch.done ? 1 : -1; pinch.done += dir; turn(dir, cx, cy); }
        return;
      }
      if (drag) {
        const [x, y] = local(e);
        if (Math.abs(x - drag.x) + Math.abs(y - drag.y) > 4) { if (!drag.moved) hands(); drag.moved = true; }
        if (drag.moved) { V.cam.ox = drag.ox + (x - drag.x); V.cam.oy = drag.oy + (y - drag.y); V.need = true; }
      }
    }
    function onUp(e) {
      const wasTap = drag && !drag.moved && pts.size === 1;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (wasTap) tap(...local(e));
      if (!pts.size) drag = null;
    }
    // Front-most first, in the order things were painted: whatever covers a spot owns the
    // tap. Inside the open cutaway only the cutaway answers (its people, its close box).
    function tap(x, y) {
      const inBox = (h) => h.box && x >= h.box[0] && x <= h.box[2] && y >= h.box[1] && y <= h.box[3];
      if (V.panel && x >= V.panel.x0 && x <= V.panel.x0 + V.panel.w && y >= V.panel.y0 && y <= V.panel.y0 + V.panel.h) {
        for (let i = V.hits.length - 1; i >= 0; i--) {
          const h = V.hits[i];
          if (!h.panel || !inBox(h)) continue;
          if (h.kind === "close") select(null); else onOpenRef.current?.(h.s);
          return;
        }
        return;
      }
      for (let i = V.hits.length - 1; i >= 0; i--) {
        const h = V.hits[i];
        if (h.panel) continue;
        if (h.kind === "p" && inBox(h)) { onOpenRef.current?.(h.s); return; }
        if (h.kind === "b" && inPoly(x, y, h.hull)) { select(V.sel === h.id ? null : h.id); return; }
      }
      if (V.sel) select(null);
    }
    // The wheel scrolls the page unless the city has been clicked (focused) or ctrl is held
    // (a trackpad pinch sends ctrl): a 600 px canvas must not trap the page.
    function onWheel(e) {
      if (!(e.ctrlKey || e.metaKey || document.activeElement === canvas)) { V.wheelHint = performance.now() + 1600; V.need = true; return; }
      e.preventDefault();
      const [x, y] = local(e);
      zoomAt(x, y, Math.exp(-e.deltaY * 0.0015));
    }
    function onKey(e) {
      if (e.key === "q" || e.key === "Q") { turn(-1); e.preventDefault(); }
      else if (e.key === "e" || e.key === "E") { turn(1); e.preventDefault(); }
      else if (e.key === "+" || e.key === "=") zoomAt(V.cssW / 2, V.cssH / 2, 1.3);
      else if (e.key === "-") zoomAt(V.cssW / 2, V.cssH / 2, 1 / 1.3);
      else if (e.key === "Escape" && V.sel) select(null);
      else if (e.key === "Enter" && V.sel) apiRef.current.enter();
      else if (e.key.startsWith("Arrow")) {
        hands();
        const d = 40;
        if (e.key === "ArrowLeft") V.cam.ox += d; if (e.key === "ArrowRight") V.cam.ox -= d;
        if (e.key === "ArrowUp") V.cam.oy += d; if (e.key === "ArrowDown") V.cam.oy -= d;
        V.need = true; e.preventDefault();
      } else return;
    }
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("keydown", onKey);

    // ---- loop --------------------------------------------------------------------------------
    let raf = 0, onScreenNow = true, dead = false;
    function frame() {
      if (!V.reduced || V.need || censusRef.current?.v !== V.censusV) { V.need = false; draw(); }
      raf = requestAnimationFrame(frame);
    }
    function sync() {
      const want = !dead && onScreenNow && !document.hidden;
      if (want && !raf) raf = requestAnimationFrame(frame);
      if (!want && raf) { cancelAnimationFrame(raf); raf = 0; }
    }
    const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([en]) => { onScreenNow = en.isIntersecting; sync(); }) : null;
    io?.observe(wrap);
    document.addEventListener("visibilitychange", sync);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null;
    ro ? ro.observe(wrap) : window.addEventListener("resize", resize);
    const onMotion = () => { V.reduced = !!mq?.matches; V.need = true; };
    mq?.addEventListener?.("change", onMotion);
    resize();
    // Back from a building: the same camera, turn and cutaway (same width only).
    if (SAVED && SAVED.cssW === V.cssW) {
      V.cam = { ...SAVED.cam };
      V.geo = null;
      if (SAVED.sel) { V.sel = SAVED.sel; V.shown = SAVED.sel; V.lift = 1; V.seatsFor = SAVED.sel; setSelRef.current(SAVED.sel); }
      V.need = true;
    }
    SAVED = null;
    sync();
    if (import.meta.env?.DEV) window.__hviIso = { V, turn, select, zoomAt, fit, tap, draw };
    return () => {
      SAVED = { cam: { ...(V.camTo ? { ...V.cam, ...V.camTo } : V.cam) }, sel: V.sel, cssW: V.cssW };
      dead = true; sync();
      io?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      ro ? ro.disconnect() : window.removeEventListener("resize", resize);
      mq?.removeEventListener?.("change", onMotion);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const b = sel && BUILDING[sel];
  return (
    <div className="hvi-city-stage" ref={wrapRef}>
      <TouchGate>
        <canvas ref={canvasRef} tabIndex={0} className="hvi-city-canvas" role="img"
          aria-label="The Substrate from above, SimCity-style: solid buildings with lit windows, the Loop train on its deck, subjects in the streets. Drag to pan, pinch to zoom, click then wheel to zoom, Q and E to turn. Select a building to open its cutaway: every floor and room, and who is in it. The district directory below lists every district by keyboard." />
      </TouchGate>
      <div className="hvi-city-zoom" role="toolbar" aria-label="City view controls">
        <span className="hint" title={b ? b.name : undefined}>{b ? b.name : "TAP A BUILDING"}</span>
        <button type="button" className="hvi-city-zb" aria-label="Turn left" onClick={() => apiRef.current.turn?.(-1)}><TurnIcon dir={-1} /></button>
        <button type="button" className="hvi-city-zb" aria-label="Turn right" onClick={() => apiRef.current.turn?.(1)}><TurnIcon dir={1} /></button>
        <button type="button" className="hvi-city-zb" aria-label="Zoom in" onClick={() => apiRef.current.zoom?.(1.4)}>+</button>
        <button type="button" className="hvi-city-zb" aria-label="Zoom out" onClick={() => apiRef.current.zoom?.(1 / 1.4)}>−</button>
        {b
          ? <>
              <button type="button" className="hvi-city-zb txt" onClick={() => apiRef.current.enter?.()}>ENTER</button>
              <button type="button" className="hvi-city-zb txt" aria-label="Close the cutaway" onClick={() => apiRef.current.close?.()}>CLOSE</button>
            </>
          : <button type="button" className="hvi-city-zb txt" aria-label="Fit the whole city" onClick={() => apiRef.current.fit?.()}>FIT</button>}
      </div>
      {b && <p className="sr-only" role="status">{`${b.name} open. ${b.floors.length} floor${b.floors.length === 1 ? "" : "s"}. ${b.floors.map(f => `${f.code} ${f.name}`).join(", ")}.`}</p>}
    </div>
  );
}

// A quarter-turn arrow, drawn (the ⟲ ⟳ glyphs are missing from the terminal font and fall
// back to small circles).
function TurnIcon({ dir }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" style={dir > 0 ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M5 5.5A6 6 0 1 1 3.2 10" />
      <path d="M1.5 2.5v4h4" />
    </svg>
  );
}
