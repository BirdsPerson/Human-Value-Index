// STREET: walk the Substrate at shoulder height. Buildings stand as boxes of flat 2D
// planes (windows lit by who is inside), people are pixel billboards, the Loop runs on
// its raised deck. Passive by default: a slow auto-tour glides the streets. WASD /
// arrows or the d-pad to walk, drag to turn, walk into a door (or tap a building) to go
// in, or TAKE THE LOOP to a district. One rAF loop; paused off screen and in a hidden tab.

import { memo, useCallback, useEffect, useRef, useState } from "react";
import TouchGate, { isTouchOnly } from "../ui/TouchGate.jsx";
import { Chip, Chips } from "../ui/index.js";
import { DISTRICTS, DISTRICT, jobLine, activityLine } from "./simApi.js";
import { wantSectors } from "./planClient.js";
import { STATIONS as ST3D } from "./city3d.js";
import {
  EYE_H, WALK_SPEED, TURN_SPEED, RIDE_SPEED, TOUR_SPEED,
  ringAt, ringTangent, nearestArc, arcDelta, tourPose, buildingAt, clampToWorld, districtAt, compass, RIDE_H,
} from "./streetKit.js";
import { makeStreetScene, tokens } from "./streetScene.js";   // the renderer (DRIVE YOURSELF's third person draws with it too)

const IDLE_TO_TOUR = 30;   // seconds of no input before the tour resumes


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
    const scene = makeStreetScene(ctx);
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

    function render(now) {
      const c = cam.current;
      wantView(c, now);
      hits.current = scene({ c, W, H, dpr, census: censusRef.current, now, reduced: reduce.current });
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
