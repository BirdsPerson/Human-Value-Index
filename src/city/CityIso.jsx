import { memo, useEffect, useRef, useState } from "react";
import TouchGate from "../ui/TouchGate.jsx";
import { SPRITE_W, SPRITE_H } from "../sprites.js";
import { DISTRICTS, BUILDINGS, BUILDING, PLACES, LOOP_LINE, STATIONS, OPEN_LOTS, clockAt, whereOf, trainsAt, roomIn } from "./simApi.js";
import { FAMILY_COLOR, familyOf } from "./cityKit.js";
import { sheetFor, miniFor } from "./spriteBank.js";
import { FONT } from "./cityUi.jsx";
import { rot, rotRect, project, screenToMap, cityExtent, depthOrder, slotFor, boxHull, inPoly, lodFor, STOREY, DECK, mod4 } from "./iso.js";
import { drawRoom, roomPlan, typeOf, assignAnchors, roleOf, actAt } from "./props.js";
import { drawPose, phaseOf } from "./poses.js";

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

// The Loop, sampled once into short deck segments (map cells).
const TRACK = (() => {
  const L = LOOP_LINE.length, step = 2.5, pts = [];
  for (let s = 0; s <= L + 1e-6; s += step) pts.push(LOOP_LINE.at(s % L));
  return pts;
})();

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
      seats: new Map(), plans: new Map(), wheelHint: 0,
    };

    // ---- geometry for the current quarter turn ----------------------------------------
    function buildGeo(r) {
      const items = [];
      for (const b of BUILDINGS) {
        // Footprints shrink inside their lots so the blocks read as towers with streets between.
        const ix = Math.min(1.6, b.rect.w * 0.14), iy = Math.min(1.6, b.rect.h * 0.14);
        const R = rotRect({ x: b.rect.x + ix, y: b.rect.y + iy, w: b.rect.w - 2 * ix, h: b.rect.h - 2 * iy }, r);
        items.push({ kind: "b", b, R, h: OPEN_LOTS.has(b.id) ? 0.05 : ABOVE[b.id], x0: R.x0, y0: R.y0, x1: R.x1, y1: R.y1 });
      }
      for (let i = 0; i + 1 < TRACK.length; i++) {
        const [u0, v0] = rot(TRACK[i].x, TRACK[i].y, r), [u1, v1] = rot(TRACK[i + 1].x, TRACK[i + 1].y, r);
        items.push({ kind: "t", a: [u0, v0], c: [u1, v1], x0: Math.min(u0, u1) - 0.25, y0: Math.min(v0, v1) - 0.25, x1: Math.max(u0, u1) + 0.25, y1: Math.max(v0, v1) + 0.25, pillar: i % 3 === 0 });
      }
      const order = depthOrder(items);
      const districts = DISTRICTS.map(d => ({ d, R: rotRect(d.rect, r) }));
      const stations = Object.values(STATIONS).map(st => { const [u, v] = rot(st.x, st.y, r); return { kind: "st", u, v, h: DECK, slot: slotFor(u, v, items, order) }; });
      return { r, items, order, districts, stations };
    }

    // ---- census -> occupancy, outdoor subjects, who is in which room -------------------
    // One rule with the header, the district list and the building view (simApi.roomIn):
    // a building counts whoever is on one of its floors, walking in, or walking out.
    function readCensus() {
      const c = censusRef.current;
      if (!c || c.v === V.censusV) return;
      V.censusV = c.v;
      const occ = {}, inside = new Map(), outdoors = [];
      for (const { s, w } of c.list || []) {
        if (!w) continue;
        const r = roomIn(w, s);
        if (r) {
          occ[r.buildingId] = (occ[r.buildingId] || 0) + 1;
          const rk = `${r.buildingId}|${r.floor}|${r.placeId}`;
          (inside.get(rk) || inside.set(rk, []).get(rk)).push({ s, w, mode: r.mode });
          if (r.mode === "here" && OUTDOOR_PLACES.has(w.placeId)) outdoors.push({ s, open: w.placeId });
        }
        if (w.activity === "commute" && w.sub !== "riding") outdoors.push({ s });
      }
      V.occ = occ; V.inside = inside; V.outdoors = outdoors;
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
        const [x, y] = P((R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2, h + 0.5);
        const L = { id: b.id, text: b.name.length > 24 ? b.name.slice(0, 23) + "…" : b.name, x, y, selected, rank };
        if (top) drawLabel(L, 1); else V.labels.push(L);
      };
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

    function drawTrack(it) {
      const [u0, v0] = it.a, [u1, v1] = it.c;
      const a = P(u0, v0, DECK), b = P(u1, v1, DECK);
      if (!onScreen([a, b])) return;
      if (it.pillar) {
        const g = P(u0, v0, 0);
        ctx.strokeStyle = "rgba(120,140,130,0.45)"; ctx.lineWidth = Math.max(1, V.cam.z * 0.18);
        ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.lineTo(a[0], a[1]); ctx.stroke();
      }
      ctx.strokeStyle = "rgba(34,211,238,0.55)"; ctx.lineWidth = Math.max(1.5, V.cam.z * 0.3);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }

    // Everything that moves or sits on the deck, as points to slot into the painter's order:
    // train cars, station platforms, and subjects outdoors (streets, lots, stairs, platforms).
    function movers(mt) {
      const out = [];
      for (const t of trainsAt(mt)) for (const c of t.cars) {
        const [u, v] = rot(c.x, c.y, V.cam.r);
        out.push({ kind: "car", u, v, h: DECK + 0.35 });
      }
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
          // up on the deck: waiting, stepping off, or on the stairs (climb 0..1)
          if (w.sub === "waiting" || w.sub === "alighting") h = DECK;
          else if (w.climb) h = w.climb * DECK;
        }
        const [u, v] = rot(x, y, V.cam.r);
        out.push({ kind: "p", s: o.s, u, v, h });
      }
      return out;
    }

    function drawCar(c) {
      const [x, y] = P(c.u, c.v, c.h);
      if (x < -30 || x > V.cssW + 30 || y < -30 || y > V.cssH + 30) return;
      const w = Math.max(3, V.cam.z * 1.6), hh = Math.max(2, V.cam.z * 0.8);
      ctx.fillStyle = "#0e7490"; ctx.fillRect(Math.round(x - w / 2), Math.round(y - hh / 2), Math.round(w), Math.round(hh));
      ctx.fillStyle = "#67e8f9"; ctx.fillRect(Math.round(x - w / 2 + 1), Math.round(y - hh / 2 + 1), Math.round(w - 2), Math.max(1, Math.round(hh * 0.3)));
    }
    function drawStation(st) {
      if (lodFor(V.cam.z) === "far") return;
      const [x, y] = P(st.u, st.v, st.h);
      ctx.fillStyle = "rgba(34,211,238,0.25)"; ctx.fillRect(Math.round(x - V.cam.z), Math.round(y - 2), Math.round(V.cam.z * 2), 3);
    }
    function drawPerson(p, lod) {
      const [x, y] = P(p.u, p.v, p.h);
      if (x < -20 || x > V.cssW + 20 || y < -40 || y > V.cssH + 20) return;
      if (lod === "far") {
        ctx.fillStyle = FAMILY_COLOR[familyOf(p.s)] || "#6b9a7c";
        ctx.fillRect(Math.round(x) - 1, Math.round(y) - 2, 2, 2);
        return;
      }
      const hpx = V.cam.z * STOREY * 0.95;
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
    function drawMover(m, lod) { if (m.kind === "p") drawPerson(m, lod); else if (m.kind === "car") drawCar(m); else drawStation(m); }

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
      ctx.fillStyle = L.selected ? "#4ade80" : "#a7d7b5"; ctx.fillText(L.text, Math.round(L.x), Math.round(L.y));
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
      ctx.fillText(b.id === "hq" ? "CENSUS CLASSIFIED" : `${V.occ[b.id] || 0} INSIDE // ${nF} FLOOR${nF === 1 ? "" : "S"}`, x0 + 10, y0 + 24);
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
      const { at, overflow } = assignAnchors(plan.anchors, people, prev && prev.plan === plan ? prev.at : null, hour);
      V.seats.set(rk, { plan, at });
      const byAnchor = new Array(plan.anchors.length);
      for (const p of people) { const i = at.get(p.key); if (i != null) byAnchor[i] = p; }
      drawRoom(ctx, pid, rx, ry, rw, rh, u, {
        t: now, hour, plan, lit: true,
        people: (row) => {
          for (const it of row.items) {
            const a = it.a, p = a && byAnchor[a.i];
            if (!p) continue;
            const box = drawPose(ctx, sheetFor(p.s), a, actAt(a, hour, p.role, plan.type), rx + a.x, ry + a.y, sh * a.s, now, phaseOf(p.key));
            if (live) V.hits.push({ kind: "p", panel: true, s: p.s, box });
          }
        },
      });
      nameTab(many ? PLACES[pid].name : f.name, rx, ry, rw);
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
      const lod = lodFor(V.cam.z);
      ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#060a06"; ctx.fillRect(0, 0, V.cssW, V.cssH);
      V.hits = []; V.labels = [];
      drawGround();
      // movers slot between buildings and track by depth
      const { items, order, stations } = V.geo;
      const slots = new Map();
      const put = (k, m) => (slots.get(k) || slots.set(k, []).get(k)).push(m);
      for (const st of stations) put(st.slot, st);
      for (const m of movers(mt)) put(slotFor(m.u, m.v, items, order), m);
      for (const m of slots.get(-1) || []) drawMover(m, lod);
      for (let k = 0; k < order.length; k++) {
        const it = items[order[k]];
        if (it.kind === "b") drawBuilding(it, lod, k);
        else drawTrack(it);
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
    if (import.meta.env?.DEV) window.__hviIso = { V, turn, select, zoomAt, fit, tap };
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
