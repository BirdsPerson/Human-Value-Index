import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SPRITE_W, SPRITE_H, gaitFor, stepEntity, mulberry32, statureOf } from "../sprites.js";
import { getTier } from "../figures.js";
import { activityLine, jobLine, clockAt, trainsAt, timetable, TRAIN } from "./simApi.js";
import { sheetFor } from "./spriteBank.js";
import { drawRoom, roomPlan, typeOf, assignAnchors, roleOf, actAt, ORDERED_TYPES } from "./props.js";
import { fieldRole } from "./parkGeo.js";
import { drawPose, phaseOf, fitStature } from "./poses.js";
import { greet } from "./rigReact.js";
import { casinoTap } from "../casino/cityRooms.js";
import { FONT, SubjectTip } from "./cityUi.jsx";

// Rooms as terminal boxes on one canvas, with the subjects the census puts in each one
// walking about inside. The district view tiles a district's rooms (and its station
// platform); the building view stacks one row per floor. The caller says where each
// room sits (layout) and who belongs in which (assign); this does the rest.
//
//   cells   [{id, title, tag, kind: work|leisure|mixed|home|platform, tint?}]
//   layout  (cssW) -> {rects: [{x, y, w, h}] (one per cell), height, gutter?: [{x, y, text, color}]}
//   assign  (w, s) -> {cell, mode} | null. mode: here | arrive (through the door) |
//           leave (out by the door) | alight (off a train, onto the platform)
// One rAF loop, paused offscreen; rooms scrolled out of the window are not drawn.
// Rooms are furnished (props.js): everyone present has an anchor, a stool, a desk, a bunk,
// and does its job there (poses.js); arrivals walk from the door to theirs, leavers back
// out. A room with more people than anchors shows the rest as a +K badge. The platform is
// a platform: people wait on it and walk to the car.

export const ROOM_H = 150;          // CSS px per room
const FLOOR_TOP = 86;               // feet stand between these two, room-relative
const FLOOR_PAD = 16;

const KIND_LABEL = { work: "WORK", leisure: "LEISURE", mixed: "WORK / LEISURE", home: "RESIDENTIAL", platform: "THE LOOP" };
const WALL = {
  work: ["╤══╤   ╤══╤   ╤══╤   ", "│▭▭│   │▭▭│   │▭▭│   "],
  leisure: ["¡!¡ ¡!¡ ¡¡! ¡!¡ !¡!   ", "────────────────────  "],
  mixed: ["╤══╤   ¡!¡ ¡!¡   ", "│▭▭│   ───────   "],
  home: ["▭ ▭ ▭ ▭ ▭ ▭ ▭ ▭ ", "═══════════════ "],
  platform: ["╪═══╪═══╪═══╪═══", "╪═══╪═══╪═══╪═══"],
};

const pad2 = (n) => String(n).padStart(2, "0");

export default memo(RoomStage);
function RoomStage({ cells, layout, assign, censusRef, onOpen, onCell, onPresent, focusId = null, stationId = null, ariaLabel, focusScroll }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const tipRef = useRef(null);
  const [tip, setTip] = useState(null);
  const [cursor, setCursor] = useState("");
  const cb = useRef({}); cb.current = { onOpen, onCell, onPresent, assign, layout, focusScroll };
  const api = useRef({});
  const tipSize = useRef([0, 0]);
  useLayoutEffect(() => {
    const el = tipRef.current;
    tipSize.current = el ? [el.offsetWidth, el.offsetHeight] : [0, 0];
    api.current.poke?.();
  }, [tip]);
  // A new focus repaints the frames and brings that room into the window.
  useEffect(() => { api.current.focus?.(focusId); }, [focusId]);

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");
    const bg = document.createElement("canvas");
    const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const rnd = mulberry32((Date.now() ^ 0xc17) >>> 0);
    const V = { cssW: 300, h: ROOM_H, dpr: 1, k: 1, rects: [], gutter: [], geo: [], seats: [], over: [], reduced: !!mq?.matches, seenV: -1, ents: new Map(), want: new Map(), counts: {}, tip: null, hover: null, cw: 7, top: 0, need: true, sig: "", focus: focusId, scrolled: false };
    const idx = Object.fromEntries(cells.map((c, i) => [c.id, i]));
    const plat = cells.map(c => c.kind === "platform");
    const placeOf = cells.map(c => c.placeId || c.id);
    const floorBot = (i) => V.rects[i].h - FLOOR_PAD;
    // Inside the drawn walls: the left wall is one character in, the right wall is the last
    // whole character column; a sprite is 16 px from its centre to its edge.
    const SPRITE_HALF = 16;
    const innerL = () => 2 + V.cw + SPRITE_HALF;
    const innerR = (i) => 2 + (Math.floor((V.rects[i].w - 4) / V.cw) - 1) * V.cw - SPRITE_HALF;
    const doorX = () => innerL();
    const worldFor = (i) => ({ w: V.rects[i].w, xMin: innerL(), xMax: Math.max(innerL(), innerR(i)), floorTop: FLOOR_TOP, floorBottom: floorBot(i), doorX: doorX(), doorW: 10 });

    // ---- sizing and the room backdrops -----------------------------------------------
    function resize() {
      const cssW = Math.max(280, Math.floor(wrap.clientWidth));
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      V.cssW = cssW; V.dpr = dpr; V.k = Math.max(1, Math.round(dpr));
      const L = cb.current.layout(cssW);
      V.rects = L.rects; V.gutter = L.gutter || []; V.h = L.height;
      canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(V.h * dpr);
      canvas.style.height = V.h + "px";
      bg.width = canvas.width; bg.height = canvas.height;
      paintRooms();
      for (const e of V.ents.values()) { const i = idx[e.room], lo = innerL(), hi = Math.max(lo, innerR(i)); e.x = Math.max(lo, Math.min(e.x, hi)); e.tx = Math.max(lo, Math.min(e.tx, hi)); }
      layoutRooms();
      measure();
      if (V.focus && !V.scrolled) scrollToFocus();
    }
    // The furnished inside of each room box (inside the drawn frame), its plan and sprite size.
    function layoutRooms() {
      const hh = SPRITE_H * V.k / V.dpr, sw = hh * (SPRITE_W / SPRITE_H), ch = 13;
      V.hh = hh;
      V.geo = cells.map((c, i) => {
        if (plat[i]) return null;
        const { w: rw, h: rh } = V.rects[i];
        const cols = Math.floor((rw - 4) / V.cw), rows = Math.floor((rh - 6) / ch);
        const ix = 2 + V.cw, iy = 16, iw = 2 + (cols - 1) * V.cw - ix, ih = 2 + (rows - 1) * ch + 4 - iy;
        return { ix, iy, iw, ih, plan: roomPlan(typeOf(placeOf[i], c.floorCode), iw, ih, sw, c.cap || null), u: Math.max(1, Math.round(ih / 50)) };
      });
      V.seats = cells.map(() => null);
      V.seenV = -1;   // re-seat everyone on the new plans
      for (const e of V.ents.values()) if (!plat[idx[e.room]] && !e.leaving) { e.anchor = null; e.state = "idle"; e.fresh = true; }
    }
    // where an anchor stands, room-relative
    const anchorXY = (i, a) => [V.geo[i].ix + a.x, V.geo[i].iy + a.y];
    const doorXY = (i) => [V.geo[i].ix + 5, V.geo[i].iy + V.geo[i].ih - 2];
    function measure() { V.top = canvas.getBoundingClientRect().top; V.dirty = false; V.need = true; }
    // Scrolling only marks the position stale; the next frame reads it once (one layout
    // read per frame, not one per scroll event).
    function onScroll() { V.dirty = true; V.need = true; }
    function scrollToFocus() {
      const i = idx[V.focus];
      if (i === undefined) return;
      V.scrolled = true;
      const y = canvas.getBoundingClientRect().top + window.scrollY + V.rects[i].y - 70;
      try { window.scrollTo({ top: Math.max(0, y), behavior: V.reduced ? "auto" : "smooth" }); } catch { window.scrollTo(0, Math.max(0, y)); }
    }
    function paintRooms() {
      const b = bg.getContext("2d");
      b.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
      b.fillStyle = "#060a06";
      b.fillRect(0, 0, V.cssW, V.h);
      b.font = `11px ${FONT}`;
      b.textBaseline = "top";
      const cw = Math.max(4, b.measureText("M").width), ch = 13;
      V.cw = cw;
      for (const g of V.gutter) { b.fillStyle = g.color || "#2f6a42"; b.font = g.bold ? `700 11px ${FONT}` : `11px ${FONT}`; b.fillText(g.text, g.x, g.y); }
      b.font = `11px ${FONT}`;
      cells.forEach((c, i) => {
        const { x: x0, y: y0, w: rw, h: rh } = V.rects[i];
        const cols = Math.floor((rw - 4) / cw);
        const kind = c.kind || "mixed";
        const focused = V.focus === c.id;
        const tint = focused ? "#4ade80" : c.tint || (kind === "platform" ? "#0e7490" : "#2f6a42");
        const name = ` ${c.title} `;
        const tag = ` ${c.tag || KIND_LABEL[kind] || kind.toUpperCase()} `;
        const room = cols - 2 - name.length - tag.length - 1;
        // Too narrow for name and tag: drop the tag and cut the name, but the corner still
        // lands on the right wall (it used to stop mid-room: "┌─ name ─┐   │").
        let top;
        if (room >= 0) top = "┌─" + name + "─".repeat(room) + tag + "┐";
        else {
          const fitN = Math.max(2, cols - 4);
          const nm = name.length <= fitN ? name : name.slice(0, Math.max(1, fitN - 2)) + "… ";
          top = "┌─" + nm + "─".repeat(Math.max(0, cols - 3 - nm.length)) + "┐";
        }
        b.fillStyle = tint;
        b.fillText(top.slice(0, cols), x0 + 2, y0 + 2);
        const rows = Math.floor((rh - 6) / ch);
        for (let r = 1; r < rows - 1; r++) { b.fillText(focused ? "║" : "│", x0 + 2, y0 + 2 + r * ch); b.fillText(focused ? "║" : "│", x0 + 2 + (cols - 1) * cw, y0 + 2 + r * ch); }
        b.fillText("└" + "─".repeat(cols - 2) + "┘", x0 + 2, y0 + 2 + (rows - 1) * ch);
        if (kind !== "platform") return;   // a room's inside is furnished and drawn live
        // back wall: decor by kind (the platform's is the track), a floor line, the floor
        const wall = WALL[kind] || WALL.mixed;
        b.fillStyle = kind === "platform" ? "#164e5a" : "#1f4a2c";
        for (let r = 0; r < wall.length; r++) b.fillText(wall[r].repeat(Math.ceil(cols / wall[r].length)).slice(0, cols - 6), x0 + 2 + 4 * cw, y0 + 2 + (2 + r) * ch);
        if (kind === "platform") {
          // the platform edge, painted, with the warning the Department is obliged to give
          // the platform edge, painted in the one colour the Department reserves for warnings
          b.fillStyle = "#5c4a0c";
          b.fillText("▀".repeat(cols - 2), x0 + 2 + cw, y0 + FLOOR_TOP - 16);
        } else {
          b.fillStyle = "#13251a";
          b.fillText("▓".repeat(cols - 2), x0 + 2 + cw, y0 + FLOOR_TOP - 16);
        }
        b.fillStyle = "#16291c";
        for (let y = y0 + FLOOR_TOP - 8, r = 0; y < y0 + rh - FLOOR_PAD; y += ch, r++) b.fillText((r % 2 ? " ·" : "· ").repeat(Math.ceil(cols / 2)).slice(0, cols - 2), x0 + 2 + cw, y);
        // the door, set into the left wall (the platform's is the way down to the street)
        b.fillStyle = "#060a06";
        b.fillRect(x0 + 2, y0 + FLOOR_TOP - 34, cw, 30);
        b.fillStyle = "#4ade80";
        b.fillText("▐", x0 + 2, y0 + FLOOR_TOP - 32); b.fillText("▐", x0 + 2, y0 + FLOOR_TOP - 19);
        b.fillStyle = "#2f6a42";
        b.fillText(kind === "platform" ? "STREET" : "IN/OUT", x0 + 2 + cw * 1.5, y0 + FLOOR_TOP - 32);
      });
    }

    // ---- who is where ------------------------------------------------------------------
    // Out by the door, or (from a platform, when the census has them aboard) into the car.
    const exit = (e, board) => {
      e.leaving = true; e.gone = false; e.state = "exit"; e.board = !!board;
      const i = idx[e.room];
      if (!plat[i]) { const [dx, dy] = doorXY(i); e.tx = dx; e.ty = dy; if (e.anchor != null) { const a = V.geo[i].plan.anchors[e.anchor]; if (a) { const [ax, ay] = anchorXY(i, a); e.x = ax; e.y = ay; } } e.anchor = null; return; }
      if (board) { e.tx = e.x; e.ty = FLOOR_TOP - 6; } else { e.tx = doorX(); e.ty = FLOOR_TOP + 6; }
    };
    function sync() {
      const C = censusRef.current;
      if (C.v === V.seenV) return;
      const firstLook = V.seenV === -1;
      V.seenV = C.v; V.need = true;
      const want = new Map(), aboard = new Set();
      const fn = cb.current.assign;
      for (const { s, w } of C.list) {
        if (s.crowd) continue;   // stand-ins (crowd.js) fill the map, never a room: the district's window brings its people
        const m = fn(w, s);
        if (m && idx[m.cell] !== undefined) want.set(s.name, { s, w, r: m.cell, mode: m.mode });
        else if (w.sub === "riding") aboard.add(s.name);
      }
      V.want = want;
      const counts = {}, lists = {};
      for (const { s, r } of want.values()) { counts[r] = (counts[r] || 0) + 1; (lists[r] = lists[r] || []).push(s); }
      V.counts = counts;
      for (const [name, e] of V.ents) {
        const w = want.get(name);
        if (!w || w.r !== e.room) { if (e.gone) V.ents.delete(name); else if (!e.leaving) exit(e, plat[idx[e.room]] && aboard.has(name)); }
      }
      for (const [name, { s, r, mode }] of want) {
        const e = V.ents.get(name);
        if (e) { e.s = s; e.q = statureOf(s); }
        if (e && e.room !== r) continue;   // still walking out of another room; enters next census
        if (e) {
          if (mode === "leave") { if (!e.leaving) exit(e, false); }
          else if (e.leaving) { e.leaving = false; e.gone = false; e.state = "idle"; e.timer = 0.5; }
          continue;
        }
        const i = idx[r], rw = V.rects[i].w;
        let g = gaitFor(getTier(s.score).label, V.reduced);
        // On a platform nobody strolls: they have a train to meet.
        if (plat[i] && !V.reduced) g = { ...g, speed: Math.max(g.speed, 48) };
        // Anyone already there when we first look is somewhere inside; later arrivals come
        // through the door, or step off the train onto the platform.
        const fromDoor = !firstLook && !V.reduced && (mode === "arrive" || mode === "here");
        const fromCar = !firstLook && !V.reduced && mode === "alight";
        const inside = !fromDoor && !fromCar;
        const ent = {
          s, q: statureOf(s), room: r, gait: g, dir: 1, animT: rnd() * 2, timer: rnd() * 2, state: inside ? "idle" : "walk", leaving: false, gone: false, board: false,
          x: inside || fromCar ? innerL() + rnd() * Math.max(0, innerR(i) - innerL()) : doorX(),
          y: fromCar ? FLOOR_TOP - 4 : FLOOR_TOP + 4 + rnd() * (floorBot(i) - FLOOR_TOP - 6), tx: 0, ty: 0,
        };
        ent.tx = inside ? ent.x : fromCar ? ent.x + (rnd() - 0.5) * 40 : 40 + rnd() * Math.max(20, rw - 70);
        ent.ty = fromCar ? FLOOR_TOP + 8 + rnd() * (floorBot(i) - FLOOR_TOP - 12) : ent.y;
        ent.tx = Math.max(innerL(), Math.min(Math.max(innerL(), innerR(i)), ent.tx));
        if (!plat[i]) { ent.x = fromDoor ? doorXY(i)[0] : ent.x; ent.y = doorXY(i)[1]; ent.state = fromDoor ? "walk" : "idle"; ent.anchor = null; ent.fresh = !fromDoor; }
        if (mode === "leave") exit(ent, false);
        V.ents.set(name, ent);
      }
      seat(want);
      const sig = cells.map(c => (lists[c.id] || []).map(s => s.name).join("\u0001")).join("\u0002");
      if (sig !== V.sig) { V.sig = sig; cb.current.onPresent?.(lists); }
      if (V.tip) { const e = V.ents.get(V.tip); if (e && !e.gone) showTip(e); }
    }

    // Everyone staying in a furnished room gets an anchor: those already seated keep theirs,
    // newcomers take a free one of their role (props.assignAnchors); the rest are overflow.
    const hourNow = () => { const mt = censusRef.current.mt ?? clockAt(Date.now()).mt; return ((mt % 24) + 24) % 24; };
    function seat(want) {
      const groups = cells.map(() => []);
      for (const [name, { s, w, r, mode }] of want) {
        const i = idx[r];
        if (plat[i] || mode === "leave") continue;
        const e = V.ents.get(name);
        if (e && (e.room !== r || e.leaving)) continue;
        // on a field the footballers play and the sporting take the field first
        const fr = V.geo[i] && ORDERED_TYPES.has(V.geo[i].plan.type) ? fieldRole(s, w) : null;
        groups[i].push(fr ? { key: name, role: fr.role, pri: fr.pri } : { key: name, role: roleOf(w) });
      }
      groups.forEach((people, i) => {
        if (plat[i] || !V.geo[i]) return;
        const { at, overflow } = assignAnchors(V.geo[i].plan.anchors, people, V.seats[i], hourNow(), ORDERED_TYPES.has(V.geo[i].plan.type));
        V.seats[i] = at; V.over[i] = overflow.length;
        for (const { key, role } of people) {
          const e = V.ents.get(key);
          if (!e) continue;
          e.role = role;
          const k = at.has(key) ? at.get(key) : null;
          if (k === e.anchor) continue;
          e.anchor = k;
          if (k == null) { e.state = "idle"; continue; }
          const [ax, ay] = anchorXY(i, V.geo[i].plan.anchors[k]);
          // already inside when we first looked (or motion reduced): at the anchor at once
          if (e.fresh || V.reduced) { e.x = ax; e.y = ay; e.state = "at"; e.fresh = false; }
          else { e.tx = ax; e.ty = ay; e.state = "walk"; }
        }
      });
    }

    // ---- step and draw -----------------------------------------------------------------
    function update(dt) {
      sync();
      for (const [name, e] of V.ents) {
        if (e.gone) continue;
        if (e.state === "exit") {
          const dx = e.tx - e.x, dy = e.ty - e.y, dist = Math.hypot(dx, dy), step = Math.max(e.gait.speed, 24) * dt;
          e.animT += dt;
          if (Math.abs(dx) > 0.5) e.dir = dx < 0 ? -1 : 1;
          if (dist <= step || V.reduced) {
            const w = V.want.get(name);
            if (w && w.r === e.room && w.mode === "leave") e.gone = true; else V.ents.delete(name);
            if (V.tip === name) hideTip();
            V.need = true;
            continue;
          }
          e.x += (dx / dist) * step; e.y += (dy / dist) * step;
          continue;
        }
        if (e.state === "walk" && !V.reduced && e.ty !== undefined && e.y < FLOOR_TOP) {
          // stepping off the car: straight onto the platform before wandering
          const dy = e.ty - e.y, step = Math.max(e.gait.speed, 24) * dt;
          e.animT += dt;
          if (Math.abs(dy) <= step) { e.y = e.ty; e.state = "idle"; e.timer = 0.5 + rnd(); } else e.y += Math.sign(dy) * step;
          continue;
        }
        if (!plat[idx[e.room]]) {
          if (e.state !== "walk") continue;
          const dx = e.tx - e.x, dy = e.ty - e.y, dist = Math.hypot(dx, dy), step = Math.max(e.gait.speed, 30) * dt;
          e.animT += dt;
          if (Math.abs(dx) > 0.5) e.dir = dx < 0 ? -1 : 1;
          if (dist <= step || V.reduced) { e.x = e.tx; e.y = e.ty; e.state = e.anchor != null ? "at" : "idle"; V.need = true; }
          else { e.x += (dx / dist) * step; e.y += (dy / dist) * step; }
          continue;
        }
        if (!V.reduced) stepEntity(e, dt, worldFor(idx[e.room]), rnd);
      }
    }
    function band() { return [Math.max(0, -V.top), Math.min(V.h, window.innerHeight - V.top)]; }
    function draw() {
      const { dpr, k } = V;
      const [top, bot] = band();
      if (bot <= top) return;
      const y0d = Math.floor(top * dpr), y1d = Math.ceil(bot * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bg, 0, y0d, canvas.width, y1d - y0d, 0, y0d, canvas.width, y1d - y0d);
      ctx.font = `${11 * dpr}px ${FONT}`;
      ctx.textBaseline = "top";
      const mtNow = V.reduced ? (censusRef.current.mt ?? clockAt(Date.now()).mt) : clockAt(Date.now()).mt;
      const vis = V.vis || (V.vis = []);
      vis.length = 0;
      drawRooms(top, bot, mtNow, vis);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = `${11 * dpr}px ${FONT}`;
      ctx.textBaseline = "top";
      cells.forEach((c, i) => {
        const { x: x0, y: ry, w: rw, h: rh } = V.rects[i];
        if (ry + rh < top || ry > bot) return;
        const n = V.counts[c.id] || 0, cap = c.cap || 0;
        const label = cap ? ` ${n}/${cap} ` : c.kind === "platform" ? ` ${n} ON PLATFORM ` : ` ${n} PRESENT `;
        const lw = ctx.measureText(label).width;
        const lx = (x0 + rw - 10) * dpr - lw, ly = (ry + 2 + 13) * dpr;
        ctx.fillStyle = "#060a06"; ctx.fillRect(lx, ly, lw, 13 * dpr);
        ctx.fillStyle = cap && n > cap ? "#f87171" : "#4d8a62";
        ctx.fillText(label, lx, ly);
        if (c.kind === "platform" && stationId) drawPlatform(x0, ry, rw, mtNow);
        // the overflow: more present than the room has places for
        const over = V.over[i] || 0;
        if (over && !plat[i]) {
          const b = ` +${over} `, bw = ctx.measureText(b).width;
          ctx.fillStyle = "#fbbf24"; ctx.fillRect(lx - bw - 4 * dpr, ly, bw, 13 * dpr);
          ctx.fillStyle = "#1a1206"; ctx.fillText(b, lx - bw - 4 * dpr, ly);
        }
      });
      const n0 = vis.length;
      for (const e of V.ents.values()) {
        if (e.gone || !plat[idx[e.room]]) continue;
        const r = V.rects[idx[e.room]];
        e.sx = r.x + e.x; e.sy = r.y + e.y;
        if (e.sy < top - 4 || e.sy - SPRITE_H * e.q > bot) continue;
        vis.push(e);
      }
      const plats = vis.slice(n0).sort((a, b) => a.sy - b.sy);
      vis.length = n0; vis.push(...plats);
      for (const e of plats) {
        const sh = sheetFor(e.s);
        let fi = 0, bob = 0;
        if (!V.reduced && (e.state === "walk" || e.state === "exit")) {
          const st = Math.floor(e.animT * e.gait.fps);
          fi = sh.frames > 1 ? st % sh.frames : 0;
          bob = e.gait.bob && st % 2 ? -1 : 0;
        }
        // to scale (statureOf) in whole sprite pixels, feet on the platform line
        const W = Math.round(SPRITE_W * e.q) * k, H = Math.round(SPRITE_H * e.q) * k;
        const dx = Math.round(e.sx * dpr) - Math.round(W / 2 / k) * k, dy = Math.round((e.sy + bob) * dpr) - H;
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(Math.round(e.sx * dpr) - 6 * k, Math.round(e.sy * dpr) - k, 12 * k, 2 * k);
        if (e.dir < 0) {
          ctx.setTransform(-1, 0, 0, 1, dx + W, 0);
          ctx.drawImage(sh.img, fi * SPRITE_W, 0, SPRITE_W, SPRITE_H, 0, dy, W, H);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        } else ctx.drawImage(sh.img, fi * SPRITE_W, 0, SPRITE_W, SPRITE_H, dx, dy, W, H);
        if (e.s.you) {
          ctx.fillStyle = "#4ade80";
          const ax = Math.round(e.sx * dpr), ay = dy - 7 * k;
          ctx.fillRect(ax - 3 * k, ay, 7 * k, k); ctx.fillRect(ax - 2 * k, ay + k, 5 * k, k); ctx.fillRect(ax - k, ay + 2 * k, 3 * k, k); ctx.fillRect(ax, ay + 3 * k, k, k);
        }
      }
      const tipEl = tipRef.current;
      if (tipEl) {
        const e = V.tip && V.ents.get(V.tip);
        if (e && vis.includes(e)) {
          const [tw, th] = tipSize.current;
          const tx = Math.max(2, Math.min(V.cssW - tw - 2, e.sx - tw / 2));
          const ty = Math.max(2, (e.box && !plat[idx[e.room]] ? e.box[1] : e.sy - SPRITE_H * e.q * (k / dpr)) - th - 4);
          tipEl.style.transform = `translate(${Math.round(tx)}px, ${Math.round(ty)}px)`;
          tipEl.style.visibility = "visible";
        } else tipEl.style.visibility = "hidden";
      }
    }

    // The furnished rooms in view: the room, its people at their anchors (between each row's
    // furniture), arrivals and leavers walking the floor, then the door. CSS px throughout.
    function drawRooms(top, bot, mt, vis) {
      const { dpr } = V, hh = V.hh || SPRITE_H;
      const t = V.reduced ? 0 : performance.now() / 1000, hour = ((mt % 24) + 24) % 24;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      const at = cells.map(() => null), walking = cells.map(() => null);
      for (const e of V.ents.values()) {
        const i = idx[e.room];
        if (e.gone || plat[i]) continue;
        if (e.state === "at" && e.anchor != null) (at[i] || (at[i] = new Map())).set(e.anchor, e);
        else if (e.state === "walk" || e.state === "exit") (walking[i] || (walking[i] = [])).push(e);
        else e.sx = -1e4;   // overflow: counted, not drawn
      }
      cells.forEach((c, i) => {
        const G = V.geo[i];
        if (!G) return;
        const r = V.rects[i];
        if (r.y + r.h < top || r.y > bot) return;
        const X = r.x + G.ix, Y = r.y + G.iy, here = at[i];
        if (here && here.size > 1) greet(placeOf[i], [...here.values()].map(e => ({ s: e.s, sheet: sheetFor(e.s) })), t);   // friends who just met wave (rigReact)
        drawRoom(ctx, placeOf[i], X, Y, G.iw, G.ih, G.u, {
          t, hour, plan: G.plan,
          people: here ? (row) => {
            for (const it of row.items) {
              const e = it.a && here.get(it.a.i);
              if (!e) continue;
              const bx = drawPose(ctx, sheetFor(e.s), it.a, actAt(it.a, hour, e.role, G.plan.type), X + it.a.x, Y + it.a.y, hh * it.a.s, t, phaseOf(e.s.name), fitStature(e.s, it.a.y, hh * it.a.s));
              e.box = bx; e.sx = (bx[0] + bx[2]) / 2; e.sy = bx[3];
              vis.push(e);
            }
          } : null,
        });
        // the door, set into the left wall
        const dh = Math.min(36, G.ih * 0.4), dy = Y + G.ih - dh - 1;
        ctx.fillStyle = "#060a06"; ctx.fillRect(r.x + 2, dy, V.cw + 4, dh);
        ctx.fillStyle = "#4ade80"; ctx.fillRect(r.x + 2, dy, 2, dh);
        ctx.fillStyle = "#1f4a2c"; ctx.fillRect(r.x + 2, dy, V.cw + 4, 1);
        for (const e of walking[i] || []) {
          const sh = sheetFor(e.s);
          let fi = 0, bob = 0;
          if (!V.reduced) { const st = Math.floor(e.animT * e.gait.fps); fi = sh.frames > 1 ? st % sh.frames : 0; bob = e.gait.bob && st % 2 ? -1 : 0; }
          const eh = hh * fitStature(e.s, e.y - (Y - r.y), hh), ww = eh * (SPRITE_W / SPRITE_H), x = r.x + e.x, y = r.y + e.y;
          try {
            if (e.dir > 0) { ctx.save(); ctx.translate(Math.round(x + ww / 2), 0); ctx.scale(-1, 1); ctx.drawImage(sh.img, fi * SPRITE_W, 0, SPRITE_W, SPRITE_H, 0, Math.round(y - eh + bob), Math.round(ww), Math.round(eh)); ctx.restore(); }
            else ctx.drawImage(sh.img, fi * SPRITE_W, 0, SPRITE_W, SPRITE_H, Math.round(x - ww / 2), Math.round(y - eh + bob), Math.round(ww), Math.round(eh));
          } catch { /* not decoded */ }
          e.box = [x - ww / 2, y - eh, x + ww / 2, y]; e.sx = x; e.sy = y;
          vis.push(e);
        }
        // you, marked
        for (const e of vis) if (e.s.you && e.room === c.id) {
          ctx.fillStyle = "#4ade80";
          const ax = Math.round(e.sx), ay = Math.round(e.box[1]) - 7;
          ctx.fillRect(ax - 3, ay, 7, 1); ctx.fillRect(ax - 2, ay + 1, 5, 1); ctx.fillRect(ax - 1, ay + 2, 3, 1); ctx.fillRect(ax, ay + 3, 1, 1);
        }
      });
    }

    // The platform, live: the board (next two trains) and, while one stands here, its cars
    // along the back of the platform with the doors open.
    function drawPlatform(x0, ry, rw, mt) {
      const { dpr } = V;
      const T = trainsAt(mt).find(t => t.dwell && t.stationId === stationId);
      if (T) {
        const n = T.cars.length, x1 = x0 + 12, span = rw - 24, gap = 6, cwid = (span - gap * (n - 1)) / n;
        const yT = ry + 30, hT = FLOOR_TOP - 48;
        for (let c = 0; c < n; c++) {
          const cx = x1 + c * (cwid + gap);
          ctx.fillStyle = "#0b3a45"; ctx.fillRect(cx * dpr, yT * dpr, cwid * dpr, hT * dpr);
          ctx.fillStyle = "#155e75"; ctx.fillRect(cx * dpr, (yT + hT - 3) * dpr, cwid * dpr, 3 * dpr);
          ctx.fillStyle = "#67e8f9";
          for (let wx = cx + 6; wx < cx + cwid - 10; wx += 14) ctx.fillRect(wx * dpr, (yT + 6) * dpr, 8 * dpr, 7 * dpr);
          // the open door, centred on the car
          ctx.fillStyle = "#060a06"; ctx.fillRect((cx + cwid / 2 - 5) * dpr, (yT + 4) * dpr, 10 * dpr, (hT - 7) * dpr);
          if (c === 0) { ctx.fillStyle = "#e0fbff"; ctx.fillRect((cx + cwid - 4) * dpr, (yT + 4) * dpr, 3 * dpr, 6 * dpr); }
        }
        ctx.fillStyle = "#060a06";
        const lab = ` ${T.name} // DOORS OPEN `;
        const lw = ctx.measureText(lab).width;
        ctx.fillRect((x1 + 4) * dpr, (ry + 16) * dpr, lw, 13 * dpr);
        ctx.fillStyle = "#67e8f9"; ctx.fillText(lab, (x1 + 4) * dpr, (ry + 16) * dpr);
      }
      if (T) return;
      // no train: the board, where the train will stand
      const next = timetable(stationId, mt, 2).map(a => {
        const m = Math.max(0, Math.round((a.arrive - mt) * 60));
        return `${TRAIN[a.trainId]?.name || a.trainId} ${m <= 0 ? "NOW" : pad2(m) + " MIN"}`;
      });
      const room = (rw - 110) * dpr;   // leaves the count, top right
      let text = ` NEXT: ${next.join(" · ")} `;
      if (ctx.measureText(text).width > room) text = ` NEXT: ${next[0]} `;
      const tw = ctx.measureText(text).width;
      const bx = (x0 + 14) * dpr, by = (ry + 16) * dpr;
      ctx.fillStyle = "#060a06"; ctx.fillRect(bx, by, tw, 13 * dpr);
      ctx.fillStyle = "#fbbf24"; ctx.fillText(text, bx, by);
    }

    // ---- input -------------------------------------------------------------------------
    function hit(mx, my, touch) {
      const hw = touch ? 16 : 11, pad = touch ? 6 : 2, hh = SPRITE_H * (V.k / V.dpr);
      let best = null, bd = Infinity;
      const vis = V.vis || [];
      for (let i = vis.length - 1; i >= 0; i--) {
        const e = vis[i];
        if (e.box && !plat[idx[e.room]]) {
          const [x0, y0, x1, y1] = e.box, cx = (x0 + x1) / 2;
          if (Math.abs(mx - cx) > Math.max(hw, (x1 - x0) * 0.35) || my < y0 - pad || my > y1 + pad) continue;
          if (!touch) return e;
          const dd = Math.abs(mx - cx) + Math.abs(my - (y0 + y1) / 2) * 0.5;
          if (dd < bd) { bd = dd; best = e; }
          continue;
        }
        const eh = hh * (e.q || 1);
        if (Math.abs(mx - e.sx) > hw || my < e.sy - eh - pad || my > e.sy + pad) continue;
        if (!touch) return e;
        const dd = Math.abs(mx - e.sx) + Math.abs(my - (e.sy - eh / 2)) * 0.5;
        if (dd < bd) { bd = dd; best = e; }
      }
      return best;
    }
    const cellAt = (x, y) => { const i = V.rects.findIndex(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h); return i >= 0 ? cells[i].id : null; };
    function showTip(e) {
      V.tip = e.s.name; V.need = true;
      const act = activityLine(e.s, censusRef.current.mt ?? clockAt(Date.now()).mt);
      setTip(t => (t && t.s === e.s && t.act === act ? t : { s: e.s, job: jobLine(e.s), act }));
    }
    function hideTip() { V.tip = null; V.need = true; setTip(null); }
    const local = (ev) => { const r = canvas.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    let down = null;
    function onDown(ev) { const [x, y] = local(ev); down = { x, y, type: ev.pointerType }; }
    function onUp(ev) {
      if (!down) return;
      const [x, y] = local(ev);
      const moved = Math.hypot(x - down.x, y - down.y) > 8;
      const touch = down.type !== "mouse";
      down = null;
      if (moved || ev.type === "pointercancel") return;
      const e = hit(x, y, touch);
      if (!e) {
        hideTip();
        // a casino table opens its game (src/casino/cityRooms.js)
        const ri = V.rects.findIndex(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h), G = ri >= 0 ? V.geo[ri] : null;
        const game = G && casinoTap(G.plan, x - V.rects[ri].x - G.ix, y - V.rects[ri].y - G.iy);
        if (game) { window.location.hash = game; return; }
        const c = cellAt(x, y);
        if (c && cb.current.onCell) cb.current.onCell(c);
        return;
      }
      if (!touch || V.tip === e.s.name) { showTip(e); cb.current.onOpen(e.s); } else showTip(e);
    }
    function onMove(ev) {
      if (ev.pointerType !== "mouse") return;
      const [x, y] = local(ev);
      const e = hit(x, y, false);
      if (e !== V.hover) { V.hover = e; if (e) showTip(e); }
      setCursor(e || (cb.current.onCell && cellAt(x, y) && cellAt(x, y) !== V.focus) ? "point" : "");
    }
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointermove", onMove);

    api.current = {
      poke: () => { V.need = true; },
      // focusScroll() false: the focus came from a list below the canvas, whose row keeps
      // the reader's place (and the keyboard's focus); the canvas does not pull the page up.
      focus: (id) => { if (id === V.focus) return; V.focus = id; V.gutter = cb.current.layout(V.cssW).gutter || []; paintRooms(); V.need = true; if (id && cb.current.focusScroll?.() !== false) scrollToFocus(); },
    };

    // ---- loop ---------------------------------------------------------------------------
    let raf = 0, last = 0, onScreen = true, dead = false;
    function frame(ts) {
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
      last = ts;
      update(dt);
      if (V.dirty) measure();
      if (!V.reduced || V.need) { V.need = false; draw(); }
      raf = requestAnimationFrame(frame);
    }
    function run() {
      const want = !dead && onScreen && !document.hidden;
      if (want && !raf) { last = 0; raf = requestAnimationFrame(frame); }
      if (!want && raf) { cancelAnimationFrame(raf); raf = 0; }
    }
    const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([en]) => { onScreen = en.isIntersecting; measure(); run(); }) : null;
    io?.observe(wrap);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    document.addEventListener("visibilitychange", run);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null;
    ro ? ro.observe(wrap) : window.addEventListener("resize", resize);
    const onMotion = () => { V.reduced = !!mq?.matches; V.need = true; for (const e of V.ents.values()) e.gait = gaitFor(getTier(e.s.score).label, V.reduced); };
    mq?.addEventListener?.("change", onMotion);
    resize();
    document.fonts?.load?.(`16px ${FONT}`).then(() => { if (!dead) paintRooms(); }).catch(() => {});
    run();
    return () => {
      dead = true; run();
      io?.disconnect();
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("scroll", onScroll, { capture: true });
      ro ? ro.disconnect() : window.removeEventListener("resize", resize);
      mq?.removeEventListener?.("change", onMotion);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointermove", onMove);
    };
    // cells, layout and stationId are fixed per mount (the parent keys on them); the
    // callbacks are read through cb, censusRef live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="hvi-city-stage" ref={wrapRef}>
      <canvas ref={canvasRef} className={`hvi-district-canvas${cursor ? " " + cursor : ""}`} role="img" aria-label={ariaLabel} />
      <SubjectTip ref={tipRef} tip={tip} onOpen={(s) => cb.current.onOpen(s)} />
    </div>
  );
}
