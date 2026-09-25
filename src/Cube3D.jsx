import { useEffect, useRef, useState } from "react";
import { CORNERS, EDGES, crossLines, project, clampPitch, REST, MACHINE_Z, PEOPLE_Z, worldPoint, distToSegment } from "./cube3d.js";

// The two-judge cube as a WarGames vector display: green phosphor wireframe, one
// segment per subject from the MACHINE face (front) to the PEOPLE face (back).
// One rAF loop that runs only while something moves; paused offscreen.
const SWING = 0.6;             // rad either side of the idle angle
const SWING_RATE = 0.22;       // rad/s of swing phase
const IDLE_AFTER = 3000;       // ms after the last interaction before auto-rotation resumes
const HIT = 9;                 // px hover radius

function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n, f) => (cs.getPropertyValue(n).trim() || f);
  return {
    green: v("--green", "#4ade80"), amber: v("--amber", "#fbbf24"), text: v("--text", "#c8f5d8"),
    muted: v("--text-muted", "#4b7c5e"), ghost: v("--text-ghost", "#2d5040"), bg: v("--bg", "#0a0f0a"),
    font: v("--mono", "ui-monospace, Menlo, monospace"),
  };
}

const QUAD_LABELS = [
  [75, 90, "ADMIRED"], [25, 90, "ENVIED"], [25, 10, "DISMISSED"], [75, 10, "TRUSTED RESERVE"],
];

export default function Cube3D({ segments, highlight = null, single = false, height = 360, label, onHover }) {
  const wrapRef = useRef(null), canvasRef = useRef(null), tipRef = useRef(null);
  const st = useRef({ yaw: REST.yaw, pitch: REST.pitch, w: 0, h: 0, dpr: 1, visible: true, dragging: null,
    lastInput: 0, hover: null, raf: 0, last: 0, dirty: true, reduced: false, tok: null, screen: [], phase: 0, base: REST.yaw });
  const [hover, setHover] = useState(null);
  const segsRef = useRef(segments); segsRef.current = segments;
  const hiRef = useRef(highlight); hiRef.current = highlight;

  useEffect(() => { st.current.dirty = true; kick(); }, [segments, highlight]);   // eslint-disable-line react-hooks/exhaustive-deps

  function draw() {
    const s = st.current, c = canvasRef.current;
    if (!c || !s.w) return;
    const ctx = c.getContext("2d"), T = s.tok || (s.tok = tokens());
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    ctx.clearRect(0, 0, s.w, s.h);
    const view = { yaw: s.yaw, pitch: s.pitch, scale: Math.min(s.w, s.h) * (single ? (s.w < 440 ? 0.31 : 0.27) : 0.3), cx: s.w / 2, cy: s.h / 2 };
    const P = p => project(p, view);
    const fs = s.w < 440 ? 9.5 : 11;
    ctx.font = `${fs}px ${T.font}`;
    ctx.lineCap = "round";

    // faces' quadrant crosses and labels first, faint
    for (const z of [MACHINE_Z, PEOPLE_Z]) {
      ctx.strokeStyle = T.ghost; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      for (const [a, b] of crossLines(z)) { const A = P(a), B = P(b); ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); }
      ctx.setLineDash([]);
      // quadrant names: the machine face always; the people face only in the full view
      if (z === MACHINE_Z || !single) {
        ctx.fillStyle = T.ghost; ctx.textAlign = "center";
        for (const [x, y, t] of QUAD_LABELS) { const q = P(worldPoint(x, y, z)); ctx.globalAlpha = z === MACHINE_Z ? 0.95 : 0.5; ctx.fillText(t, q.x, q.y); }
        ctx.globalAlpha = 1;
      }
    }
    // the 12 edges
    ctx.strokeStyle = T.muted; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const [i, j] of EDGES) { const A = P(CORNERS[i]), B = P(CORNERS[j]); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); }
    ctx.stroke();
    // face and axis labels
    ctx.fillStyle = T.green; ctx.textAlign = "left";
    const mLab = P([-1, -1, MACHINE_Z]), pLab = P([-1, 1, PEOPLE_Z]);
    ctx.fillText("MACHINE", mLab.x + 4, mLab.y + fs + 3);
    ctx.fillStyle = T.amber; ctx.fillText("PEOPLE", pLab.x + 4, pLab.y - 5);
    ctx.fillStyle = T.muted;
    const xa = P([0.2, -1, MACHINE_Z]); ctx.textAlign = "center"; ctx.fillText("CONDUCT / LIKABILITY →", xa.x, xa.y + 2 * fs + 6);
    const ya = P([-1, 0.55, MACHINE_Z]); ctx.textAlign = "right"; ctx.fillText("COMPETENCE ↑", ya.x - 5, ya.y);

    // subjects, far first so near lines paint over
    const segs = segsRef.current || [];
    const hi = hiRef.current, hov = s.hover;
    const screen = [];
    for (const g of segs) {
      const M = P(g.m), E = P(g.p || g.stub);
      screen.push({ g, M, E, depth: (M.depth + E.depth) / 2 });
    }
    screen.sort((a, b) => b.depth - a.depth);
    const anyFocus = hi || hov;
    for (const it of screen) {
      const { g, M, E } = it;
      const focused = (hi && g.name === hi) || (hov && hov === g);
      const col = g.judge === "CONTESTED" ? T.amber : g.judge === "RATIFIED" ? T.green : T.muted;
      ctx.globalAlpha = anyFocus && !focused ? 0.28 : 1;
      ctx.strokeStyle = focused ? T.text : col;
      ctx.lineWidth = focused ? 2.2 : single ? 1.8 : 1.2;
      ctx.setLineDash(g.p ? [] : [2, 3]);
      ctx.beginPath(); ctx.moveTo(M.x, M.y); ctx.lineTo(E.x, E.y); ctx.stroke();
      ctx.setLineDash([]);
      const r = single ? 4 : focused ? 3.5 : 2.4;
      ctx.fillStyle = focused ? T.text : T.green; ctx.beginPath(); ctx.arc(M.x, M.y, r * M.f, 0, Math.PI * 2); ctx.fill();
      if (g.p) { ctx.fillStyle = focused ? T.text : T.amber; ctx.beginPath(); ctx.arc(E.x, E.y, r * E.f, 0, Math.PI * 2); ctx.fill(); }
      if (single && !g.p) { ctx.fillStyle = T.muted; ctx.textAlign = "left"; ctx.fillText("NOT YET RATED", E.x + 6, E.y - 4); }
      if (focused && !single) { ctx.fillStyle = T.text; ctx.textAlign = "left"; ctx.fillText(g.name.toUpperCase(), M.x + 7, M.y - 6); }
    }
    ctx.globalAlpha = 1;
    s.screen = screen;
    s.dirty = false;
  }

  function frame(t) {
    const s = st.current;
    s.raf = 0;
    const dt = s.last ? Math.min(0.05, (t - s.last) / 1000) : 0;
    s.last = t;
    const idle = !s.reduced && !s.dragging && performance.now() - s.lastInput > IDLE_AFTER;
    // idle: swing gently around the last resting angle so the MACHINE face stays toward the viewer
    if (idle && s.visible) { s.phase += SWING_RATE * dt; s.yaw = s.base + SWING * Math.sin(s.phase); s.dirty = true; }
    if (s.dirty && s.visible) draw();
    if (s.visible && (idle || s.dragging || s.dirty)) s.raf = requestAnimationFrame(frame);
    else s.last = 0;
  }
  function kick() {
    const s = st.current;
    if (!s.raf && s.visible) s.raf = requestAnimationFrame(frame);
  }

  useEffect(() => {
    const s = st.current, wrap = wrapRef.current, c = canvasRef.current;
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    s.reduced = !!mq?.matches;
    const onMq = () => { s.reduced = !!mq.matches; kick(); };
    mq?.addEventListener?.("change", onMq);
    const size = () => {
      const w = wrap.clientWidth, h = Math.min(height, Math.round(w * (single ? 0.82 : 0.78)));
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      s.w = w; s.h = h; s.dpr = dpr;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      c.style.height = h + "px";
      s.dirty = true; kick();
    };
    const ro = new ResizeObserver(size); ro.observe(wrap); size();
    const io = new IntersectionObserver(([e]) => { s.visible = e.isIntersecting; if (s.visible) { s.dirty = true; kick(); } });
    io.observe(c);
    return () => {
      ro.disconnect(); io.disconnect(); mq?.removeEventListener?.("change", onMq);
      if (s.raf) cancelAnimationFrame(s.raf); s.raf = 0;
    };
  }, [height, single]);   // eslint-disable-line react-hooks/exhaustive-deps

  function pick(px, py) {
    let best = null, bd = HIT;
    for (const it of st.current.screen) {
      const d = distToSegment(px, py, it.M.x, it.M.y, it.E.x, it.E.y);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  function setHov(it, px, py) {
    const s = st.current, g = it ? it.g : null;
    if (s.hover !== g) { s.hover = g; s.dirty = true; kick(); setHover(g); onHover?.(g); }
    const tip = tipRef.current;
    if (tip && it) {
      const left = Math.min(Math.max(4, px + 12), s.w - 230);
      tip.style.left = left + "px"; tip.style.top = Math.max(4, py - 70) + "px";
    }
  }
  const pos = e => { const r = canvasRef.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function onDown(e) {
    const s = st.current; s.lastInput = performance.now();
    s.dragging = { x: e.clientX, y: e.clientY, yaw: s.yaw, pitch: s.pitch, moved: false, id: e.pointerId };
    canvasRef.current.setPointerCapture?.(e.pointerId);
    kick();
  }
  function onMove(e) {
    const s = st.current, d = s.dragging;
    if (d) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      s.yaw = d.yaw + dx * 0.009; s.pitch = clampPitch(d.pitch + dy * 0.009); s.base = s.yaw; s.phase = 0;
      s.lastInput = performance.now(); s.dirty = true; kick();
      return;
    }
    if (e.pointerType === "mouse") { const [x, y] = pos(e); setHov(pick(x, y), x, y); }
  }
  function onUp(e) {
    const s = st.current, d = s.dragging;
    s.dragging = null; s.lastInput = performance.now();
    if (d && !d.moved) { const [x, y] = pos(e); setHov(pick(x, y), x, y); }   // tap selects
    kick();
  }
  function onKey(e) {
    const s = st.current, k = e.key;
    const step = 0.14;
    if (k === "ArrowLeft") s.yaw -= step; else if (k === "ArrowRight") s.yaw += step;
    else if (k === "ArrowUp") s.pitch = clampPitch(s.pitch - step); else if (k === "ArrowDown") s.pitch = clampPitch(s.pitch + step);
    else if (k === "Escape") { setHov(null); return; }
    else return;
    e.preventDefault(); s.base = s.yaw; s.phase = 0; s.lastInput = performance.now(); s.dirty = true; kick();
  }

  const q = hover?.q;
  return (
    <div ref={wrapRef} className="hvi-cube3d" style={{ position: "relative", width: "100%" }}>
      <canvas ref={canvasRef} tabIndex={0} role="img" aria-label={label}
        style={{ display: "block", width: "100%", touchAction: single ? "pan-y" : "none", cursor: "grab", outlineOffset: 2 }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onPointerLeave={e => { if (e.pointerType === "mouse" && !st.current.dragging) setHov(null); }}
        onKeyDown={onKey} />
      <div ref={tipRef} className="hvi-cube3d-tip" hidden={!hover} aria-live="polite">
        {hover && q && (<>
          <div className="t">{hover.name}</div>
          <div>● M: CONDUCT {q.warmth} · COMP {q.competence} · {q.quadrant}</div>
          {q.people ? (<>
            <div>○ P: LIKABILITY {q.people.likability} · COMP {q.competence} · {q.people.quadrant}</div>
            <div className="g">GAP {q.people.gap > 0 ? "+" : ""}{q.people.gap} · {q.judge}</div>
          </>) : <div className="g">○ P: NOT YET RATED · {q.judge}</div>}
        </>)}
      </div>
    </div>
  );
}
