import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SPRITE_W, SPRITE_H, hashStr } from "../sprites.js";
import { DISTRICTS, PLACES, BUS, placesOf, placeName, districtCap, activityLine, jobLine, clockAt, whereOf } from "./simApi.js";
import { CELL_W, CELL_H, layoutDistricts, FAMILY_COLOR, familyOf, lodFor, roomLabel } from "./cityKit.js";
import { sheetFor, miniFor } from "./spriteBank.js";
import { FONT, SubjectTip } from "./cityUi.jsx";

// THE SUBSTRATE: the whole city as one canvas. District blocks drawn in box characters,
// the data-bus loop as a dotted ring with cars on it, and every subject as a dot (far),
// a small sprite (nearer) or a full sprite (close). Drag to pan, pinch or wheel to zoom,
// tap a district to enter it. One rAF loop, paused offscreen; the static layer is only
// redrawn when the camera moves.

// Interior textures per district, one pattern per row, repeated across.
const TEXTURE = {
  hq: ["░"], arts: ["~ ", " ~"], campus: ["· "], finance: ["$ ", " ."], strip: ["·˙", "˙·"],
  arena: ["═ "], commons: ["♣ ", "  ", " ♣", "  "], archive: ["▒"], works: ["▓▒"], sprawl: ["▫ ", "  "],
};
const TEX_COLOR = { works: "#1c0e0e", archive: "#101d14", hq: "#13251a" };
const BORDER = { works: "#7f1d1d", hq: "#3d6b50", archive: "#2f5a45" };

const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);

// Memoized: City re-renders every census tick (the clock); the canvas needs none of it.
export default memo(CityMap);
function CityMap({ censusRef, onDistrict, onOpen }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const tipRef = useRef(null);
  const apiRef = useRef({});
  const [tip, setTip] = useState(null);
  const [cursor, setCursor] = useState("");
  const onDistrictRef = useRef(onDistrict); onDistrictRef.current = onDistrict;
  const onOpenRef = useRef(onOpen); onOpenRef.current = onOpen;
  // The tooltip's size, measured once per content change instead of every frame.
  const tipSize = useRef([0, 0]);
  useLayoutEffect(() => {
    const el = tipRef.current;
    tipSize.current = el ? [el.offsetWidth, el.offsetHeight] : [0, 0];
    apiRef.current.poke?.();
  }, [tip]);

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");
    const bg = document.createElement("canvas");
    const bctx = bg.getContext("2d");
    const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

    // ---- geometry, fixed for the session -------------------------------------------
    const layout = layoutDistricts(DISTRICTS);
    const { toMap } = layout;
    const loopAt = (s) => toMap(BUS.at(s));
    const stops = {};
    for (const id in BUS.stops) { const st = BUS.stops[id], a = toMap(st), g = toMap(st.gate); stops[id] = { s: st.s, x: a.x, y: a.y, doorX: g.x, doorY: g.y }; }
    const slots = {};
    for (const b of layout.blocks) {
      slots[b.id] = {};
      for (const id of placesOf(b.id)) { const r = PLACES[id]?.rect; if (r) { const o = toMap(r); slots[b.id][id] = { x: o.x, y: o.y, w: r.w, h: r.h }; } }
    }
    const caps = Object.fromEntries(layout.blocks.map(b => [b.id, districtCap(b.id)]));
    const WW = layout.cols * CELL_W, WH = layout.rows * CELL_H;

    const V = {
      cssW: 300, cssH: 300, dpr: 1, cam: { x: 0, y: 0, z: 1 }, fitZ: 1, dirty: true, reduced: !!mq?.matches,
      adv: 0.6, t: 0, busT: 0, seenV: -1, ents: new Map(), vis: [], tip: null, hover: null, need: true,
    };
    const { ox, oy } = layout;

    // ---- camera -------------------------------------------------------------------
    function clampCam() {
      const c = V.cam;
      c.z = clampN(c.z, V.fitZ * 0.8, 40 / CELL_H);
      const vw = V.cssW / c.z, vh = V.cssH / c.z;
      c.x = vw >= WW ? (WW - vw) / 2 : clampN(c.x, -vw * 0.25, WW - vw * 0.75);
      c.y = vh >= WH ? (WH - vh) / 2 : clampN(c.y, -vh * 0.25, WH - vh * 0.75);
      V.dirty = true; V.need = true;
    }
    function fit() {
      V.fitZ = Math.min(V.cssW / WW, V.cssH / WH);
      V.cam.z = V.fitZ; V.cam.x = 0; V.cam.y = 0;
      clampCam();
    }
    function zoomAt(mx, my, f) {
      const c = V.cam, wx = c.x + mx / c.z, wy = c.y + my / c.z;
      c.z *= f; clampCam();
      c.x = wx - mx / c.z; c.y = wy - my / c.z; clampCam();
    }
    apiRef.current = {
      zoom: (f) => zoomAt(V.cssW / 2, V.cssH / 2, f),
      fit: () => fit(),
      poke: () => { V.need = true; },
    };

    function resize() {
      const cssW = Math.max(280, Math.floor(wrap.clientWidth));
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const cssH = Math.round(clampN(cssW * (WH / WW), 300, Math.min(760, window.innerHeight * 0.72)));
      const first = V.cssW === 300 && V.cssH === 300;
      const oldZ = V.cam.z, oldFit = V.fitZ;
      V.cssW = cssW; V.cssH = cssH; V.dpr = dpr;
      canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
      canvas.style.height = cssH + "px";
      bg.width = canvas.width; bg.height = canvas.height;
      V.fitZ = Math.min(cssW / WW, cssH / WH);
      if (first || Math.abs(oldZ - oldFit) < 1e-6) fit(); else clampCam();
      measureFont();
    }
    function measureFont() {
      ctx.font = `100px ${FONT}`;
      V.adv = Math.max(0.4, ctx.measureText("M").width / 100);
      V.dirty = true;
    }

    // ---- static layer: blocks, rooms, the loop ---------------------------------------
    function drawStatic() {
      const { dpr, cam } = V, z = cam.z;
      const b = bctx;
      b.setTransform(dpr, 0, 0, dpr, 0, 0);
      b.fillStyle = "#060a06";
      b.fillRect(0, 0, V.cssW, V.cssH);
      const cw = CELL_W * z, ch = CELL_H * z;
      const fpx = Math.min(cw / V.adv, ch * 0.98);
      const textLod = fpx >= 5.5;
      const SX = (cx) => (cx * CELL_W - cam.x) * z, SY = (cy) => (cy * CELL_H - cam.y) * z;
      b.textBaseline = "top";
      b.font = `${fpx}px ${FONT}`;

      // the substrate itself: a faint grid of solder points
      if (textLod) {
        const c0 = Math.max(0, Math.floor(cam.x / CELL_W)), c1 = Math.min(layout.cols, Math.ceil((cam.x + V.cssW / z) / CELL_W));
        const r0 = Math.max(0, Math.floor(cam.y / CELL_H)), r1 = Math.min(layout.rows, Math.ceil((cam.y + V.cssH / z) / CELL_H));
        b.fillStyle = "#0e1a11";
        const line = "·   ".repeat(Math.ceil((c1 - c0) / 4) + 1);
        for (let r = r0 - (r0 % 2); r < r1; r += 2) b.fillText(line, SX(c0 - (c0 % 4)), SY(r));
      }

      // the data bus: a dotted ring, spurs to each district, a stop marker per district
      const dot = Math.max(1, Math.round(ch * 0.14));
      b.fillStyle = "#2f6a42";
      for (let s = 0; s < BUS.length; s += 1) {
        const { x, y } = loopAt(s);
        const px = SX(x), py = SY(y);
        if (px < -4 || py < -4 || px > V.cssW + 4 || py > V.cssH + 4) continue;
        const big = Math.round(s) % 4 === 0;
        b.fillRect(px - (big ? dot : dot / 2), py - (big ? dot : dot / 2), big ? dot * 2 : dot, big ? dot * 2 : dot);
      }
      b.fillStyle = "#1f4a2c";
      for (const id in stops) {
        const st = stops[id];
        const d = Math.hypot(st.doorX - st.x, st.doorY - st.y), n = Math.max(1, Math.round(d / 0.7));
        for (let i = 1; i < n; i++) b.fillRect(SX(st.x + ((st.doorX - st.x) * i) / n) - dot / 2, SY(st.y + ((st.doorY - st.y) * i) / n) - dot / 2, dot, dot);
      }
      // stops: hollow boxes in the bus's own green, so none reads as a subject at the gate
      b.strokeStyle = "#3d6b50"; b.lineWidth = Math.max(1, dot * 0.6);
      for (const id in stops) { const st = stops[id]; b.strokeRect(SX(st.x) - dot * 1.5, SY(st.y) - dot * 1.5, dot * 3, dot * 3); }
      if (textLod) {
        b.fillStyle = "#3d6b50";
        const { x: lx, y: ly } = loopAt(BUS.loop.w * 0.02);
        b.fillText(" DATA BUS // LOOP 0xB05 // NO STANDING ", SX(lx), SY(ly) - ch * 1.05);
      }

      // districts
      for (const bl of layout.blocks) {
        const x0 = SX(bl.x), y0 = SY(bl.y), x1 = SX(bl.x + bl.w), y1 = SY(bl.y + bl.h);
        if (x1 < 0 || y1 < 0 || x0 > V.cssW || y0 > V.cssH) continue;
        const border = BORDER[bl.id] || "#2f6a42";
        b.fillStyle = "#080e09";
        b.fillRect(x0, y0, x1 - x0, y1 - y0);
        if (!textLod) {
          b.strokeStyle = border; b.lineWidth = 1;
          b.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(x1 - x0) - 1, Math.round(y1 - y0) - 1);
          b.strokeStyle = "#16291c";
          for (const id in slots[bl.id]) { const sl = slots[bl.id][id]; b.strokeRect(Math.round(SX(sl.x)) + 0.5, Math.round(SY(sl.y)) + 0.5, Math.max(1, Math.round(sl.w * cw) - 2), Math.max(1, Math.round(sl.h * ch) - 2)); }
          continue;
        }
        const w = bl.w, tex = TEXTURE[bl.id] || ["· "];
        const top = "┌" + "─".repeat(w - 2) + "┐";
        b.fillStyle = border;
        b.fillText(top, x0, y0);
        b.fillText("└" + "─".repeat(w - 2) + "┘", x0, SY(bl.y + bl.h - 1));
        for (let r = 1; r < bl.h - 1; r++) {
          const y = SY(bl.y + r);
          if (y > V.cssH || y + ch < 0) continue;
          b.fillStyle = border;
          b.fillText("│", x0, y); b.fillText("│", SX(bl.x + w - 1), y);
          const pat = tex[r % tex.length];
          b.fillStyle = TEX_COLOR[bl.id] || "#13251a";
          b.fillText(pat.repeat(Math.ceil((w - 2) / pat.length)).slice(0, w - 2), SX(bl.x + 1), y);
        }
        // rooms: boxes inside the block, named on their top border
        for (const id in slots[bl.id]) {
          const sl = slots[bl.id][id];
          const rx = Math.round(sl.x), ry = Math.round(sl.y), rw = Math.max(4, Math.floor(sl.x + sl.w) - rx - 1), rh = Math.max(2, Math.floor(sl.y + sl.h) - ry);
          b.fillStyle = "#070c08";
          b.fillRect(SX(rx), SY(ry), rw * cw, rh * ch);
          const label = roomLabel(id, placeName(id), rw);
          b.fillStyle = "#1f4a2c";
          b.fillText("┌" + " ".repeat(label.length) + "─".repeat(Math.max(0, rw - 2 - label.length)) + "┐", SX(rx), SY(ry));
          if (label) { b.fillStyle = "#4d8a62"; b.fillText(label, SX(rx + 1), SY(ry)); b.fillStyle = "#1f4a2c"; }
          for (let r = 1; r < rh - 1; r++) {
            b.fillText("╎", SX(rx), SY(ry + r)); b.fillText("╎", SX(rx + rw - 1), SY(ry + r));
          }
          if (rh > 1) b.fillText("└" + "─".repeat(Math.max(0, rw - 2)) + "┘", SX(rx), SY(ry + rh - 1));
        }
      }
      V.textLod = textLod; V.fpx = fpx;
      V.dirty = false;
    }

    // ---- subjects -----------------------------------------------------------------
    function entFor(entry) {
      let e = V.ents.get(entry.s.name);
      if (!e) {
        const seed = hashStr(entry.s.slug || entry.s.name);
        const fam = familyOf(entry.s);
        e = { s: entry.s, seed, fam: FAMILY_COLOR[fam.family], rated: fam.rated, x: NaN, y: NaN, tx: 0, ty: 0, sx: 0, sy: 0, dir: 1, animT: 0, moving: false, w: entry.w };
        V.ents.set(entry.s.name, e);
      }
      setW(e, entry.w);
      if (e.s !== entry.s) { e.s = entry.s; const fam = familyOf(entry.s); e.fam = FAMILY_COLOR[fam.family]; e.rated = fam.rated; }
      return e;
    }

    // Target in world px, cached per census entry (not per frame).
    function setW(e, w) { e.w = w; e.tx = (w.x + ox) * CELL_W; e.ty = (w.y + oy) * CELL_H; }

    function update(dt) {
      V.t += dt;
      if (!V.reduced) V.busT += dt;
      const C = censusRef.current;
      if (C.v !== V.seenV) {
        V.seenV = C.v; V.need = true;
        const live = new Set();
        for (const entry of C.list) { entFor(entry); live.add(entry.s.name); }
        for (const k of V.ents.keys()) if (!live.has(k)) V.ents.delete(k);
        if (V.tip) { const e = V.ents.get(V.tip); if (e) refreshTip(e, C.mt); }
      }
      // Commuters in view (plus a margin) are placed from the machine clock every frame,
      // since the bus covers several cells a second; everyone else, and every commuter
      // off screen, holds the spot the last census gave them.
      const mt = V.reduced ? 0 : clockAt(Date.now()).mt;
      const k = Math.min(1, dt * 4);
      const c = V.cam, mx = 12 * CELL_W;
      const vx0 = c.x - mx, vy0 = c.y - mx, vx1 = c.x + V.cssW / c.z + mx, vy1 = c.y + V.cssH / c.z + mx;
      for (const e of V.ents.values()) {
        if (e.w.activity === "commute" && !V.reduced && e.tx > vx0 && e.tx < vx1 && e.ty > vy0 && e.ty < vy1) setW(e, whereOf(e.s, mt));
        const w = e.w;
        if (Number.isNaN(e.x) || V.reduced) { e.x = e.tx; e.y = e.ty; e.moving = false; continue; }
        const dx = e.tx - e.x, dy = e.ty - e.y, d = Math.abs(dx) + Math.abs(dy);
        if (d > 40 * CELL_W) { e.x = e.tx; e.y = e.ty; e.moving = false; continue; }
        if (w.activity === "commute") { e.x = e.tx; e.y = e.ty; } else { e.x += dx * k; e.y += dy * k; }
        e.moving = d > 0.6;
        if (Math.abs(dx) > 0.05) e.dir = dx < 0 ? -1 : 1;
        if (e.moving) e.animT += dt;
      }
    }

    // screen position (CSS px) of a subject's feet, with a little idle drift -> e.sx, e.sy
    function screenOf(e) {
      const c = V.cam;
      let x = e.x, y = e.y;
      if (!V.reduced && e.w.activity !== "commute") {
        const amp = e.w.activity === "leisure" ? 1.1 : e.w.activity === "work" ? 0.45 : 0.15;
        x += Math.sin(V.t * 0.35 + e.seed % 97) * amp * CELL_W;
        y += Math.cos(V.t * 0.27 + e.seed % 53) * amp * 0.3 * CELL_H;
      }
      e.sx = (x - c.x) * c.z; e.sy = (y - c.y) * c.z;
    }

    function spriteBox(lod) {
      const ch = CELL_H * V.cam.z, dpr = V.dpr;
      if (lod === "mini") { const m = Math.max(1, Math.floor((ch * 1.6 * dpr) / 24)); return [16 * m / dpr, 24 * m / dpr]; }
      const k = Math.max(1, Math.floor((ch * 2.8 * dpr) / 48));
      return [SPRITE_W * k / dpr, SPRITE_H * k / dpr];
    }

    function youArrow(sx, ay) {
      ctx.fillStyle = "#4ade80";
      const ax = Math.round(sx);
      ctx.fillRect(ax - 3, ay, 7, 1); ctx.fillRect(ax - 2, ay + 1, 5, 1); ctx.fillRect(ax - 1, ay + 2, 3, 1); ctx.fillRect(ax, ay + 3, 1, 1);
    }
    // Drawn as a dot (far away, or dormant indoors) rather than a sprite.
    const asDot = (e, lod) => lod === "dot" || e.w.activity === "home";

    function draw() {
      if (V.dirty) drawStatic();
      const { dpr } = V;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(bg, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      const c = V.cam, ch = CELL_H * c.z, cw = CELL_W * c.z;

      // bus cars, evenly spaced, one lap in about 45 seconds
      const L = BUS.length, N = Math.max(3, Math.round(L / 26));
      const lapSec = BUS.lapHours * 60;   // 1 real minute = 1 machine hour
      for (let i = 0; i < N; i++) {
        const s = (V.busT / lapSec) * L + (i * L) / N;
        const { x: ax, y: ay } = loopAt(s), { x: bx, y: by } = loopAt(s + 0.5);
        const horiz = Math.abs(bx - ax) > Math.abs(by - ay);
        const px = (ax * CELL_W - c.x) * c.z, py = (ay * CELL_H - c.y) * c.z;
        const w = horiz ? cw * 2.4 : cw * 1.2, h = horiz ? ch * 0.6 : ch * 1.3;
        if (px + w < 0 || py + h < 0 || px - w > V.cssW || py - h > V.cssH) continue;
        // cyan: outside the octant palette, so a car never reads as a charm subject
        ctx.fillStyle = "#155e75";
        ctx.fillRect(px - w / 2, py - h / 2, w, h);
        ctx.fillStyle = "#67e8f9";
        const fx = horiz ? (bx > ax ? px + w / 2 - Math.max(1, cw * 0.3) : px - w / 2) : px - w / 2;
        const fy = horiz ? py - h / 2 : (by > ay ? py + h / 2 - Math.max(1, ch * 0.15) : py - h / 2);
        ctx.fillRect(fx, fy, horiz ? Math.max(1, cw * 0.3) : w, horiz ? h : Math.max(1, ch * 0.15));
      }

      // subjects: cull to the viewport, sort the visible by depth
      const lod = lodFor(ch);
      V.lod = lod;
      const [bw, bh] = lod === "dot" ? [4, 4] : spriteBox(lod);
      const vis = V.vis; vis.length = 0;
      for (const e of V.ents.values()) {
        screenOf(e);
        if (e.sx < -bw || e.sx > V.cssW + bw || e.sy < -4 || e.sy - bh > V.cssH + 4) continue;
        vis.push(e);
      }
      vis.sort((a, b) => a.sy - b.sy);
      if (lod === "dot") {
        const r = Math.max(1.5, ch * 0.28);
        ctx.lineWidth = 1 / dpr * Math.max(1, Math.round(dpr));
        for (const e of vis) {
          if (e.rated) { ctx.fillStyle = e.fam; ctx.fillRect(Math.round((e.sx - r / 2) * dpr) / dpr, Math.round((e.sy - r / 2) * dpr) / dpr, r, r); }
          else { ctx.strokeStyle = e.fam; ctx.strokeRect(Math.round((e.sx - r / 2) * dpr) / dpr + 0.5 / dpr, Math.round((e.sy - r / 2) * dpr) / dpr + 0.5 / dpr, r - 1 / dpr, r - 1 / dpr); }
          if (e.s.you) { ctx.fillStyle = "#e5ffe9"; ctx.fillRect(e.sx - 0.5, e.sy - r * 2.2, 1, r); }
        }
      } else {
        const wr = Math.max(2, Math.round(ch * 0.3));
        for (const e of vis) {
          // Dormant subjects are indoors: a lit window in their colour, not a sprite. A
          // sleeping block reads as a block of windows instead of a mob on the roof.
          if (e.w.activity === "home") {
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = e.fam;
            ctx.fillRect(Math.round((e.sx - wr / 2) * dpr) / dpr, Math.round((e.sy - wr) * dpr) / dpr, wr, wr);
            ctx.globalAlpha = 1;
            if (e.s.you) youArrow(e.sx, e.sy - wr - 7);
            continue;
          }
          const x = Math.round((e.sx - bw / 2) * dpr) / dpr, y = Math.round((e.sy - bh) * dpr) / dpr;
          // the family mark at the feet: the octant colour, hollow when unrated
          ctx.fillStyle = e.fam;
          ctx.fillRect(e.sx - bw * 0.3, e.sy - 1, bw * 0.6, e.rated ? 2 : 1);
          if (lod === "mini") {
            const img = miniFor(e.s);
            if (e.dir < 0) { ctx.save(); ctx.translate(x + bw, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, bw, bh); ctx.restore(); }
            else ctx.drawImage(img, x, y, bw, bh);
          } else {
            const sh = sheetFor(e.s);
            const fi = e.moving && sh.frames > 1 ? Math.floor(e.animT * 6) % sh.frames : 0;
            if (e.dir < 0) { ctx.save(); ctx.translate(x + bw, y); ctx.scale(-1, 1); ctx.drawImage(sh.img, fi * SPRITE_W, 0, SPRITE_W, SPRITE_H, 0, 0, bw, bh); ctx.restore(); }
            else ctx.drawImage(sh.img, fi * SPRITE_W, 0, SPRITE_W, SPRITE_H, x, y, bw, bh);
          }
          if (e.s.you) youArrow(e.sx, y - 6);
        }
      }

      // room names again, over the subjects, on a plate: a standing sprite must not eat them
      if (V.textLod && lod !== "dot") {
        ctx.font = `${V.fpx}px ${FONT}`;
        ctx.textBaseline = "top";
        for (const bl of layout.blocks) {
          for (const id in slots[bl.id]) {
            const sl = slots[bl.id][id];
            const rx = Math.round(sl.x), ry = Math.round(sl.y), rw = Math.max(4, Math.floor(sl.x + sl.w) - rx - 1);
            const label = roomLabel(id, placeName(id), rw);
            if (!label) continue;
            const x = (rx + 1) * cw - c.x * c.z, y = ry * ch - c.y * c.z;
            if (x > V.cssW || y > V.cssH || x + label.length * cw < 0 || y + ch < 0) continue;
            ctx.fillStyle = "#070c08"; ctx.fillRect(x, y, label.length * cw, ch);
            ctx.fillStyle = "#4d8a62"; ctx.fillText(label, x, y);
          }
        }
      }

      // district labels with live counts, fixed screen size, pinned inside each block.
      // Counts only: capacity lives in the directory, where it can be compared.
      const C = censusRef.current;
      ctx.font = `700 10px ${FONT}`;
      ctx.textBaseline = "top";
      const lcw = ctx.measureText("M").width;
      for (const bl of layout.blocks) {
        const x0 = (bl.x * CELL_W - c.x) * c.z, y0 = (bl.y * CELL_H - c.y) * c.z, wpx = bl.w * cw;
        if (x0 + wpx < 0 || y0 + bl.h * ch < 0 || x0 > V.cssW || y0 > V.cssH || wpx < 34) continue;
        const n = C.districtCounts?.[bl.id] || 0, cap = caps[bl.id] || 0;
        const cnt = `${n}`;
        const maxC = Math.floor((wpx - 8) / lcw);
        let name = bl.name.length + cnt.length + 1 <= maxC ? bl.name : bl.name.replace(/^THE /, "");
        const two = name.length + cnt.length + 1 > maxC;
        if (name.length > maxC) name = name.split(" ")[0];   // "ARTS QUARTER" -> "ARTS"
        name = name.slice(0, Math.max(1, maxC));
        // pinned to the visible part of the block, so a zoomed-in district keeps its name
        const lx = Math.max(x0 + (V.textLod ? cw * 1.5 : 4), Math.min(4, x0 + wpx - 60));
        const ly = Math.max(V.textLod ? y0 + ch * 0.5 - 6 : y0 + 3, Math.min(4, y0 + bl.h * ch - 30));
        const lw = (two ? Math.max(name.length, cnt.length) : name.length + cnt.length + 1) * lcw + 6, lh = two ? 25 : 13;
        ctx.fillStyle = "rgba(6,10,6,0.86)";
        ctx.fillRect(lx - 3, ly - 1, lw, lh);
        ctx.fillStyle = "#86efac";
        ctx.fillText(name, lx, ly);
        ctx.fillStyle = cap && n > cap ? "#f87171" : "#4d8a62";
        ctx.fillText(cnt, two ? lx : lx + (name.length + 1) * lcw, two ? ly + 12 : ly);
        // the district's address, right on the frame, when there is room for it
        const aw = (bl.addr.length + 2) * lcw, ax = x0 + wpx - cw * 1.5 - aw;
        if (V.textLod && ax > lx - 3 + lw + lcw) {
          ctx.fillStyle = "rgba(6,10,6,0.86)"; ctx.fillRect(ax, ly - 1, aw, 13);
          ctx.fillStyle = "#3d6b50"; ctx.fillText(` ${bl.addr} `, ax, ly);
        }
      }

      // the tooltip follows its subject
      const tipEl = tipRef.current;
      if (tipEl) {
        const e = V.tip && V.ents.get(V.tip);
        if (e && vis.includes(e)) {
          const [tw, th] = tipSize.current;
          const top = e.sy - (asDot(e, lod) ? 8 : bh) - th - 6;
          const tx = clampN(e.sx - tw / 2, 2, V.cssW - tw - 2);
          const ty = top < 2 ? Math.min(V.cssH - th - 2, e.sy + 8) : top;
          tipEl.style.transform = `translate(${Math.round(tx)}px, ${Math.round(ty)}px)`;
          tipEl.style.visibility = "visible";
        } else tipEl.style.visibility = "hidden";
      }
    }

    // ---- input ----------------------------------------------------------------------
    const pts = new Map();
    let g = null;
    const local = (ev) => { const r = canvas.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    function hitSubject(mx, my, touch) {
      const lod = V.lod;
      if (lod === "dot" && touch) return null;
      const dotBox = [touch ? 16 : 8, touch ? 16 : 8], sprBox = lod === "dot" ? dotBox : spriteBox(lod);
      const pad = touch ? 6 : 1;
      let best = null, bd = Infinity;
      for (let i = V.vis.length - 1; i >= 0; i--) {
        const e = V.vis[i];
        const dotE = asDot(e, lod), [bw, bh] = dotE ? dotBox : sprBox;
        const top = dotE ? e.sy - bh / 2 : e.sy - bh;
        if (mx < e.sx - bw / 2 - pad || mx > e.sx + bw / 2 + pad || my < top - pad || my > (dotE ? e.sy + bh / 2 : e.sy) + pad) continue;
        if (!touch) return e;
        const d = Math.abs(mx - e.sx) + Math.abs(my - (top + bh / 2));
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }
    function hitDistrict(mx, my) {
      const c = V.cam, wx = (c.x + mx / c.z) / CELL_W, wy = (c.y + my / c.z) / CELL_H;
      return layout.blocks.find(b => wx >= b.x && wx < b.x + b.w && wy >= b.y && wy < b.y + b.h) || null;
    }
    function refreshTip(e, mt) {
      const act = activityLine(e.s, mt);
      setTip(t => (t && t.s === e.s && t.act === act ? t : { s: e.s, job: jobLine(e.s), act }));
    }
    function showTip(e) {
      V.tip = e ? e.s.name : null; V.need = true;
      if (e) refreshTip(e, censusRef.current.mt ?? clockAt(Date.now()).mt); else setTip(null);
    }
    function onDown(ev) {
      if (ev.button !== undefined && ev.button !== 0 && ev.pointerType === "mouse") return;
      try { canvas.setPointerCapture(ev.pointerId); } catch { /* fine */ }
      const [x, y] = local(ev);
      pts.set(ev.pointerId, { x, y });
      if (pts.size === 1) g = { mode: "pan", sx: x, sy: y, cam: { ...V.cam }, moved: false, type: ev.pointerType };
      else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        g = { mode: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cam: { ...V.cam }, moved: true };
      }
    }
    function onMove(ev) {
      const [x, y] = local(ev);
      if (pts.has(ev.pointerId)) pts.set(ev.pointerId, { x, y });
      if (g && g.mode === "pan" && pts.has(ev.pointerId)) {
        const dx = x - g.sx, dy = y - g.sy;
        if (!g.moved && Math.hypot(dx, dy) > 6) { g.moved = true; setCursor("pan"); }
        if (g.moved) { V.cam.x = g.cam.x - dx / V.cam.z; V.cam.y = g.cam.y - dy / V.cam.z; clampCam(); }
        return;
      }
      if (g && g.mode === "pinch" && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const wx = g.cam.x + g.mx / g.cam.z, wy = g.cam.y + g.my / g.cam.z;
        V.cam.z = g.cam.z * (d / g.d0); clampCam();
        V.cam.x = wx - mx / V.cam.z; V.cam.y = wy - my / V.cam.z; clampCam();
        return;
      }
      if (ev.pointerType === "mouse" && !g) {
        const e = hitSubject(x, y, false);
        if (e !== V.hover) {
          V.hover = e;
          if (e) showTip(e);
          setCursor(e || hitDistrict(x, y) ? "point" : "");
        } else if (!e) setCursor(hitDistrict(x, y) ? "point" : "");
      }
    }
    function onUp(ev) {
      const had = pts.delete(ev.pointerId);
      if (!had || !g) return;
      if (g.mode === "pinch") {
        if (pts.size === 1) { const [p] = [...pts.values()]; g = { mode: "pan", sx: p.x, sy: p.y, cam: { ...V.cam }, moved: true }; }
        else if (pts.size === 0) g = null;
        return;
      }
      const tap = !g.moved && ev.type !== "pointercancel";
      const type = g.type;
      g = null;
      setCursor("");
      if (!tap) return;
      const [x, y] = local(ev);
      const touch = type !== "mouse";
      const e = hitSubject(x, y, touch);
      if (e) {
        if (!touch || V.tip === e.s.name) { showTip(e); onOpenRef.current(e.s); }
        else showTip(e);
        return;
      }
      const d = hitDistrict(x, y);
      if (d) { onDistrictRef.current(d.id); return; }
      showTip(null);
    }
    function onLeave() { if (V.hover) { V.hover = null; } }
    function onWheel(ev) {
      ev.preventDefault();
      const [x, y] = local(ev);
      zoomAt(x, y, Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015)));
    }
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // ---- loop: one rAF, running only while the map is on screen and the tab is visible --
    let raf = 0, last = 0, onScreen = true, dead = false;
    function frame(ts) {
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
      last = ts;
      update(dt);
      // Under reduced motion nothing moves between events (census, camera, tooltip), so
      // the frame is only redrawn when one of them happened.
      if (!V.reduced || V.need || V.dirty) { V.need = false; draw(); }
      raf = requestAnimationFrame(frame);
    }
    function sync() {
      const want = !dead && onScreen && !document.hidden;
      if (want && !raf) { last = 0; raf = requestAnimationFrame(frame); }
      if (!want && raf) { cancelAnimationFrame(raf); raf = 0; }
    }
    const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([en]) => { onScreen = en.isIntersecting; sync(); }) : null;
    io?.observe(wrap);
    document.addEventListener("visibilitychange", sync);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null;
    ro ? ro.observe(wrap) : window.addEventListener("resize", resize);
    const onMotion = () => { V.reduced = !!mq?.matches; V.need = true; };
    mq?.addEventListener?.("change", onMotion);
    resize();
    document.fonts?.load?.(`16px ${FONT}`).then(() => { if (!dead) measureFont(); }).catch(() => {});
    sync();

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
    };
    // censusRef is a stable ref; the loop reads it live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="hvi-city-stage" ref={wrapRef}>
      <canvas ref={canvasRef} className={`hvi-city-canvas${cursor ? " " + cursor : ""}`} role="img"
        aria-label="The Substrate: a map of the city's districts, the data-bus loop and every subject on it. By keyboard: the bus list below names everyone riding and finds your own file; the district directory enters a district." />
      <div className="hvi-city-zoom">
        <button className="hvi-cmd" aria-label="Zoom in" onClick={() => apiRef.current.zoom?.(1.4)}>[+]</button>
        <button className="hvi-cmd" aria-label="Zoom out" onClick={() => apiRef.current.zoom?.(1 / 1.4)}>[-]</button>
        <button className="hvi-cmd" aria-label="Fit the whole city" onClick={() => apiRef.current.fit?.()}>[FIT]</button>
      </div>
      <SubjectTip ref={tipRef} tip={tip} onOpen={(s) => onOpenRef.current(s)} />
    </div>
  );
}

