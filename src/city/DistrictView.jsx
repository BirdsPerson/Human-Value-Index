import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SPRITE_W, SPRITE_H, gaitFor, stepEntity, mulberry32 } from "../sprites.js";
import { getTier, displayName } from "../figures.js";
import Pen from "../Pen.jsx";
import { DISTRICT, PLACES, atDistrict, placesOf, placeName, placeCap, placeKind, activityLine, jobLine, clockAt } from "./simApi.js";
import { roomGrid } from "./cityKit.js";
import { sheetFor } from "./spriteBank.js";
import { FONT, SubjectTip } from "./cityUi.jsx";

// One district from the inside: its places as terminal rooms, stacked on phones and
// tiled on wide screens, with the subjects the census puts there wandering each room.
// They come in through the door on the left and leave by it. DEPT HQ is the Holding
// Pen's six-floor building, embedded as it is.

const ROOM_H = 150;          // CSS px per room
const FLOOR_TOP = 86;        // feet stand between these two, room-relative
const FLOOR_BOT = ROOM_H - 16;
const DOOR_X = 18;

const KIND_LABEL = { work: "WORK", leisure: "LEISURE", mixed: "WORK / LEISURE", home: "RESIDENTIAL" };
const WALL = {
  work: ["╤══╤   ╤══╤   ╤══╤   ", "│▭▭│   │▭▭│   │▭▭│   "],
  leisure: ["¡!¡ ¡!¡ ¡¡! ¡!¡ !¡!   ", "────────────────────  "],
  mixed: ["╤══╤   ¡!¡ ¡!¡   ", "│▭▭│   ───────   "],
  home: ["▭ ▭ ▭ ▭ ▭ ▭ ▭ ▭ ", "═══════════════ "],
};

// Which room of this district a census entry puts the subject in, and how: {r, mode}.
// Same rule as the header's count (atDistrict): a commuter still walking inside this
// district counts here. Walking in, they arrive through the door ('arrive'); walking
// out to the gate, they are shown heading for it ('leave'). On the bus: nowhere here.
function roomOf(w, districtId) {
  if (w.activity !== "commute") return PLACES[w.placeId]?.district === districtId ? { r: w.placeId, mode: "here" } : null;
  if (atDistrict(w) !== districtId) return null;
  if (PLACES[w.placeId]?.district === districtId) return { r: w.placeId, mode: "arrive" };
  if (PLACES[w.fromPlaceId]?.district === districtId) return { r: w.fromPlaceId, mode: "leave" };
  return null;
}
const embeddedCard = (s) => ({ where: "THE SUBSTRATE // DEPT HQ", back: "Return subject to the Substrate", assignment: `ASSIGNMENT: ${jobLine(s)}` });

// Memoized: City re-renders every census tick (the clock); the canvas needs none of it.
export default memo(DistrictView);
function DistrictView({ districtId, censusRef, onOpen }) {
  const d = DISTRICT[districtId];
  if (districtId === "hq") {
    return (
      <div>
        <div className="hvi-case-note" style={{ marginBottom: "0.8em" }}>{d?.blurb} THE BUILDING BELOW IS THE HOLDING PEN. IT IS ALSO HEADQUARTERS. THE DEPARTMENT DOES NOT WASTE REAL ESTATE. IT HOLDS EVERY FILE, NOT EVERY BODY: THE BODIES ARE AT WORK.</div>
        <Pen embedded cardProps={embeddedCard} />
      </div>
    );
  }
  return <Rooms key={districtId} districtId={districtId} censusRef={censusRef} onOpen={onOpen} />;
}

function Rooms({ districtId, censusRef, onOpen }) {
  const d = DISTRICT[districtId];
  const places = useMemo(() => placesOf(districtId), [districtId]);
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const tipRef = useRef(null);
  const [tip, setTip] = useState(null);
  const [cursor, setCursor] = useState("");
  const [present, setPresent] = useState({});   // placeId -> [subject], for the directory
  const onOpenRef = useRef(onOpen); onOpenRef.current = onOpen;
  // The tooltip's size, measured when its content changes rather than every frame.
  const tipSize = useRef([0, 0]);
  const poke = useRef(null);
  useLayoutEffect(() => {
    const el = tipRef.current;
    tipSize.current = el ? [el.offsetWidth, el.offsetHeight] : [0, 0];
    poke.current?.();
  }, [tip]);

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");
    const bg = document.createElement("canvas");
    const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const rnd = mulberry32((Date.now() ^ 0xc17) >>> 0);
    const V = { cssW: 300, dpr: 1, k: 1, grid: roomGrid(places.length, 300), reduced: !!mq?.matches, seenV: -1, ents: new Map(), want: new Map(), counts: {}, tip: null, hover: null, fpx: 11, cw: 7, top: 0, need: true, sig: "" };
    poke.current = () => { V.need = true; };
    const idx = Object.fromEntries(places.map((p, i) => [p, i]));

    const roomOrigin = (i) => [(i % V.grid.cols) * V.grid.w, Math.floor(i / V.grid.cols) * ROOM_H];
    const worldFor = () => ({ w: V.grid.w, floorTop: FLOOR_TOP, floorBottom: FLOOR_BOT, doorX: DOOR_X, doorW: 10 });

    // ---- sizing and the room backdrops -----------------------------------------------
    function resize() {
      const cssW = Math.max(280, Math.floor(wrap.clientWidth));
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      V.cssW = cssW; V.dpr = dpr; V.k = Math.max(1, Math.round(dpr));
      V.grid = roomGrid(places.length, cssW);
      const cssH = V.grid.rows * ROOM_H;
      canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
      canvas.style.height = cssH + "px";
      bg.width = canvas.width; bg.height = canvas.height;
      for (const e of V.ents.values()) { e.x = Math.min(e.x, V.grid.w - 14); e.tx = Math.min(e.tx, V.grid.w - 14); }
      paintRooms();
      measure();
    }
    // Where the canvas sits in the viewport: read on scroll and resize, not every frame.
    function measure() { V.top = canvas.getBoundingClientRect().top; V.need = true; }
    function paintRooms() {
      const b = bg.getContext("2d");
      b.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
      b.fillStyle = "#060a06";
      b.fillRect(0, 0, V.cssW, V.grid.rows * ROOM_H);
      b.font = `11px ${FONT}`;
      b.textBaseline = "top";
      const cw = Math.max(4, b.measureText("M").width), ch = 13;
      V.cw = cw;
      const cols = Math.floor((V.grid.w - 4) / cw);
      places.forEach((id, i) => {
        const [x0, y0] = roomOrigin(i);
        const kind = placeKind(id);
        const tint = kind === "work" && districtId === "works" ? "#7f1d1d" : "#2f6a42";
        const name = ` ${placeName(id)} `;
        const tag = ` ${KIND_LABEL[kind] || kind.toUpperCase()} `;
        const room = cols - 2 - name.length - tag.length - 1;
        const top = room >= 0 ? "┌─" + name + "─".repeat(room) + tag + "┐" : "┌─" + name.slice(0, Math.max(3, cols - 4)) + "─┐";
        b.fillStyle = tint;
        b.fillText(top.slice(0, cols), x0 + 2, y0 + 2);
        const rows = Math.floor((ROOM_H - 6) / ch);
        for (let r = 1; r < rows - 1; r++) { b.fillText("│", x0 + 2, y0 + 2 + r * ch); b.fillText("│", x0 + 2 + (cols - 1) * cw, y0 + 2 + r * ch); }
        b.fillText("└" + "─".repeat(cols - 2) + "┘", x0 + 2, y0 + 2 + (rows - 1) * ch);
        // back wall: decor by kind, then a floor line, then the dotted floor
        const wall = WALL[kind] || WALL.mixed;
        b.fillStyle = "#1f4a2c";
        for (let r = 0; r < wall.length; r++) b.fillText(wall[r].repeat(Math.ceil(cols / wall[r].length)).slice(0, cols - 6), x0 + 2 + 4 * cw, y0 + 2 + (2 + r) * ch);
        b.fillStyle = "#13251a";
        b.fillText("▓".repeat(cols - 2), x0 + 2 + cw, y0 + FLOOR_TOP - 16);
        b.fillStyle = "#16291c";
        for (let y = y0 + FLOOR_TOP - 8, r = 0; y < y0 + FLOOR_BOT; y += ch, r++) b.fillText((r % 2 ? " ·" : "· ").repeat(Math.ceil(cols / 2)).slice(0, cols - 2), x0 + 2 + cw, y);
        // the door, set into the left wall
        b.fillStyle = "#060a06";
        b.fillRect(x0 + 2, y0 + FLOOR_TOP - 34, cw, 30);
        b.fillStyle = "#4ade80";
        b.fillText("▐", x0 + 2, y0 + FLOOR_TOP - 32); b.fillText("▐", x0 + 2, y0 + FLOOR_TOP - 19);
        b.fillStyle = "#2f6a42";
        b.fillText("IN/OUT", x0 + 2 + cw * 1.5, y0 + FLOOR_TOP - 32);
      });
    }

    // ---- who is where ------------------------------------------------------------------
    const exit = (e) => { e.leaving = true; e.gone = false; e.tx = DOOR_X; e.ty = FLOOR_TOP + 6; e.state = "exit"; };
    function sync() {
      const C = censusRef.current;
      if (C.v === V.seenV) return;
      V.seenV = C.v; V.need = true;
      const want = new Map();
      for (const { s, w } of C.list) { const m = roomOf(w, districtId); if (m && idx[m.r] !== undefined) want.set(s.name, { s, r: m.r, mode: m.mode }); }
      V.want = want;
      const counts = {}, lists = {};
      for (const { s, r } of want.values()) { counts[r] = (counts[r] || 0) + 1; (lists[r] = lists[r] || []).push(s); }
      V.counts = counts;
      for (const [name, e] of V.ents) {
        const w = want.get(name);
        if (!w || w.r !== e.room) { if (e.gone) V.ents.delete(name); else if (!e.leaving) exit(e); }
      }
      for (const [name, { s, r, mode }] of want) {
        const e = V.ents.get(name);
        if (e) e.s = s;   // the roster may have learned more (your own file, a new sprite)
        if (e && e.room !== r) continue;   // still walking out of another room; enters next census
        if (e) {
          if (mode === "leave") { if (!e.leaving) exit(e); }
          else if (e.leaving) { e.leaving = false; e.gone = false; e.state = "idle"; e.timer = 0.5; }
          continue;
        }
        const tier = getTier(s.score);
        const g = gaitFor(tier.label, V.reduced);
        // Only someone the sim has walking in from the gate comes through the door; anyone
        // already at the place when we look is already somewhere inside it.
        const first = mode !== "arrive" || V.reduced;
        const ent = {
          s, room: r, gait: g, dir: 1, animT: rnd() * 2, timer: rnd() * 2, state: first ? "idle" : "walk", leaving: false, gone: false,
          x: first ? 20 + rnd() * (V.grid.w - 40) : DOOR_X, y: FLOOR_TOP + 4 + rnd() * (FLOOR_BOT - FLOOR_TOP - 6), tx: 0, ty: 0,
        };
        ent.tx = first ? ent.x : 40 + rnd() * Math.max(20, V.grid.w - 70); ent.ty = ent.y;
        if (mode === "leave") exit(ent);
        V.ents.set(name, ent);
      }
      // The directory only re-renders when who is in which room changes.
      const sig = places.map(id => (lists[id] || []).map(s => s.name).join("\u0001")).join("\u0002");
      if (sig !== V.sig) { V.sig = sig; setPresent(lists); }
      if (V.tip) { const e = V.ents.get(V.tip); if (e && !e.gone) showTip(e); }
    }

    // ---- step and draw -----------------------------------------------------------------
    function update(dt) {
      sync();
      const world = worldFor();
      for (const [name, e] of V.ents) {
        if (e.gone) continue;
        if (e.state === "exit") {
          const dx = e.tx - e.x, dy = e.ty - e.y, dist = Math.hypot(dx, dy), step = Math.max(e.gait.speed, 24) * dt;
          e.animT += dt;
          if (Math.abs(dx) > 0.5) e.dir = dx < 0 ? -1 : 1;
          if (dist <= step || V.reduced) {
            // Out through the door. Someone the census still has on the way out waits
            // beyond it, off the canvas, until the census moves them on.
            const w = V.want.get(name);
            if (w && w.r === e.room && w.mode === "leave") e.gone = true; else V.ents.delete(name);
            if (V.tip === name) hideTip();
            V.need = true;
            continue;
          }
          e.x += (dx / dist) * step; e.y += (dy / dist) * step;
          continue;
        }
        // Reduced motion: subjects stand where they are, and nothing redraws without cause.
        if (!V.reduced) stepEntity(e, dt, world, rnd);
      }
    }
    // visible band of the canvas, in CSS px, so rooms scrolled off the page are skipped
    function band() {
      const h = V.grid.rows * ROOM_H;
      return [Math.max(0, -V.top), Math.min(h, window.innerHeight - V.top)];
    }
    function draw() {
      const { dpr, k } = V;
      const [top, bot] = band();
      if (bot <= top) return;
      const y0d = Math.floor(top * dpr), y1d = Math.ceil(bot * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bg, 0, y0d, canvas.width, y1d - y0d, 0, y0d, canvas.width, y1d - y0d);
      // occupancy per room, top right of its frame
      ctx.font = `${11 * dpr}px ${FONT}`;
      ctx.textBaseline = "top";
      places.forEach((id, i) => {
        const [x0, ry] = roomOrigin(i);
        if (ry + ROOM_H < top || ry > bot) return;
        const n = V.counts[id] || 0, cap = placeCap(id);
        const label = ` ${n}/${cap} `;
        const lw = ctx.measureText(label).width;
        const lx = (x0 + V.grid.w - 10) * dpr - lw, ly = (ry + 2 + 13) * dpr;
        ctx.fillStyle = "#060a06"; ctx.fillRect(lx, ly, lw, 13 * dpr);
        ctx.fillStyle = cap && n > cap ? "#f87171" : "#4d8a62";
        ctx.fillText(label, lx, ly);
      });
      // subjects, depth-sorted within the visible band
      const vis = V.vis || (V.vis = []);
      vis.length = 0;
      for (const e of V.ents.values()) {
        const i = idx[e.room];
        const [x0, ry] = roomOrigin(i);
        if (e.gone) continue;
        e.sx = x0 + e.x; e.sy = ry + e.y;
        if (e.sy < top - 4 || e.sy - SPRITE_H > bot) continue;
        vis.push(e);
      }
      vis.sort((a, b) => a.sy - b.sy);
      for (const e of vis) {
        const sh = sheetFor(e.s);
        let fi = 0, bob = 0;
        if (!V.reduced && (e.state === "walk" || e.state === "exit")) {
          const st = Math.floor(e.animT * e.gait.fps);
          fi = sh.frames > 1 ? st % sh.frames : 0;
          bob = e.gait.bob && st % 2 ? -1 : 0;
        }
        const dx = Math.round(e.sx * dpr) - 16 * k, dy = Math.round((e.sy + bob) * dpr) - SPRITE_H * k;
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(dx + 10 * k, Math.round(e.sy * dpr) - k, 12 * k, 2 * k);
        if (e.dir < 0) {
          ctx.setTransform(-1, 0, 0, 1, dx + SPRITE_W * k, 0);
          ctx.drawImage(sh.img, fi * SPRITE_W, 0, SPRITE_W, SPRITE_H, 0, dy, SPRITE_W * k, SPRITE_H * k);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        } else ctx.drawImage(sh.img, fi * SPRITE_W, 0, SPRITE_W, SPRITE_H, dx, dy, SPRITE_W * k, SPRITE_H * k);
        if (e.s.you) {
          ctx.fillStyle = "#4ade80";
          const ax = Math.round(e.sx * dpr), ay = dy - 7 * k;
          ctx.fillRect(ax - 3 * k, ay, 7 * k, k); ctx.fillRect(ax - 2 * k, ay + k, 5 * k, k); ctx.fillRect(ax - k, ay + 2 * k, 3 * k, k); ctx.fillRect(ax, ay + 3 * k, k, k);
        }
      }
      // the tooltip follows its subject
      const tipEl = tipRef.current;
      if (tipEl) {
        const e = V.tip && V.ents.get(V.tip);
        if (e && vis.includes(e)) {
          const [tw, th] = tipSize.current;
          const tx = Math.max(2, Math.min(V.cssW - tw - 2, e.sx - tw / 2));
          const ty = Math.max(2, e.sy - SPRITE_H * (k / dpr) - th - 4);
          tipEl.style.transform = `translate(${Math.round(tx)}px, ${Math.round(ty)}px)`;
          tipEl.style.visibility = "visible";
        } else tipEl.style.visibility = "hidden";
      }
    }

    // ---- input: hover shows the tooltip, click (or a second tap) opens the file --------
    function hit(mx, my, touch) {
      const hw = touch ? 16 : 11, pad = touch ? 6 : 2, hh = SPRITE_H * (V.k / V.dpr);
      let best = null, bd = Infinity;
      const vis = V.vis || [];
      for (let i = vis.length - 1; i >= 0; i--) {
        const e = vis[i];
        if (Math.abs(mx - e.sx) > hw || my < e.sy - hh - pad || my > e.sy + pad) continue;
        if (!touch) return e;
        const dd = Math.abs(mx - e.sx) + Math.abs(my - (e.sy - hh / 2)) * 0.5;
        if (dd < bd) { bd = dd; best = e; }
      }
      return best;
    }
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
      if (!e) { hideTip(); return; }
      if (!touch || V.tip === e.s.name) { showTip(e); onOpenRef.current(e.s); } else showTip(e);
    }
    function onMove(ev) {
      if (ev.pointerType !== "mouse") return;
      const [x, y] = local(ev);
      const e = hit(x, y, false);
      if (e !== V.hover) { V.hover = e; setCursor(e ? "point" : ""); if (e) showTip(e); }
    }
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointermove", onMove);

    // ---- loop ---------------------------------------------------------------------------
    let raf = 0, last = 0, onScreen = true, dead = false;
    function frame(ts) {
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
      last = ts;
      update(dt);
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
    window.addEventListener("scroll", measure, { passive: true, capture: true });
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
      window.removeEventListener("scroll", measure, { capture: true });
      ro ? ro.disconnect() : window.removeEventListener("resize", resize);
      mq?.removeEventListener?.("change", onMotion);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointermove", onMove);
    };
    // censusRef is a stable ref read live; places follow districtId (the parent keys on it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = Object.values(present).reduce((n, l) => n + l.length, 0);
  return (
    <div>
      <div className="hvi-case-note" style={{ marginBottom: "0.8em" }}>{d?.blurb}</div>
      <div className="hvi-city-stage" ref={wrapRef}>
        <canvas ref={canvasRef} className={`hvi-district-canvas${cursor ? " " + cursor : ""}`} role="img"
          aria-label={`${d?.name || "District"}: ${places.length} rooms, ${total} subjects present. The room directory below lists them by keyboard.`} />
        <SubjectTip ref={tipRef} tip={tip} onOpen={(s) => onOpenRef.current(s)} />
      </div>
      <details className="hvi-city-rooms">
        <summary>Room directory ({total} present) // keyboard access</summary>
        {places.map(id => (
          <div key={id}>
            <div className="hvi-city-room-h">{placeName(id)} // {(present[id] || []).length}/{placeCap(id)}</div>
            {(present[id] || []).length === 0
              ? <div className="hvi-case-note">EMPTY. THE ROOM IS ALSO BEING ASSESSED.</div>
              : (present[id] || []).map(s => (
                <button key={s.name} className="hvi-row-btn" onClick={() => onOpen(s)} aria-label={`${displayName(s)}. ${jobLine(s)}. Open file.`}>
                  <span className="name">{displayName(s)}{s.you ? " (YOU)" : ""}</span>
                  <span className="dots" aria-hidden="true">{" " + ".".repeat(120)}</span>
                  <span className="tag">{jobLine(s)}</span>
                </button>
              ))}
          </div>
        ))}
      </details>
    </div>
  );
}
